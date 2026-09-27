import { env, exports } from 'cloudflare:workers';
import { expect, it } from 'vitest';
import { sha256Hex, randomToken } from '../src/crypto';
import { commitUninstallOperation, readUninstallReceipt } from '../src/uninstallOperations';
import type { MachineSelfResponse } from '../src/contracts';

async function fixture() {
  const machineId = crypto.randomUUID(), token = randomToken(''), code = randomToken('');
  const secret = randomToken(''), now = Date.now();
  const machine: MachineSelfResponse = { machineId, accountId: crypto.randomUUID(), platform: 'windows',
    displayName: null, defaultChildId: null, desiredPolicyVersion: 1, appliedPolicyVersion: 0,
    policyState: 'pending', revoked: false };
  await env.RUNTIME_DB.prepare(`INSERT INTO runtime_machines_v2
    (id,account_id,platform,token_hash,last_seen_at_ms,created_at_ms,updated_at_ms) VALUES (?1,?2,'windows',?3,?4,?4,?4)`)
    .bind(machineId, machine.accountId, await sha256Hex(token), now).run();
  await env.RUNTIME_DB.prepare(`INSERT INTO runtime_uninstall_codes_v2
    (code_hash,machine_id,account_id,created_by_jti,expires_at_ms,created_at_ms) VALUES (?1,?2,?3,'fixture',?4,?5)`)
    .bind(await sha256Hex(code), machineId, machine.accountId, now + 60000, now).run();
  return { machine, token, code, secret, now, input: {
    operationId: crypto.randomUUID(), code, confirmationSecretHash: await sha256Hex(secret) } };
}
async function call(path: string, authorization: string, body?: unknown) {
  return exports.default.fetch(new Request(`http://runtime.test${path}`, {
    method: body === undefined ? 'GET' : 'POST', headers: { authorization, 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  }));
}
async function state(f: Awaited<ReturnType<typeof fixture>>) {
  return env.RUNTIME_DB.prepare(`SELECT m.revoked_at_ms,c.consumed_at_ms,
    (SELECT COUNT(*) FROM runtime_uninstall_operations_v1 o WHERE o.machine_id=m.id) AS receipts
    FROM runtime_machines_v2 m JOIN runtime_uninstall_codes_v2 c ON c.machine_id=m.id WHERE m.id=?1`)
    .bind(f.machine.machineId).first();
}

it('uninstall receipt recovers lost response without restoring token or exposing identity', async () => {
  const f = await fixture();
  const result = await call('/v2/machines/uninstall-operations', `Bearer ${f.token}`, f.input);
  expect(result.status).toBe(200);
  const expected = await result.json();
  expect(Object.keys(expected as object).sort()).toEqual(['committedAtMs','operationId','revoked','status']);
  expect(await state(f)).toMatchObject({ receipts: 1 });
  expect((await call('/v2/machines/policy', `Bearer ${f.token}`)).status).toBe(401);
  expect((await call('/v2/machines/uninstall-operations', `Bearer ${f.token}`, f.input)).status).toBe(401);
  const receipt = await call(`/v2/uninstall-operations/${f.input.operationId}`, `UninstallReceipt ${f.secret}`);
  expect(receipt.status).toBe(200); expect(await receipt.json()).toEqual(expected);
  expect(receipt.headers.get('cache-control')).toBe('no-store');
  expect((await call('/v2/machines/policy', `UninstallReceipt ${f.secret}`)).status).toBe(401);
});

it('uninstall receipt treats wrong, missing, unknown and expired proof as unavailable', async () => {
  const f = await fixture();
  await commitUninstallOperation(env.RUNTIME_DB, f.machine, f.input, f.now);
  const bad = await call(`/v2/uninstall-operations/${f.input.operationId}`, `UninstallReceipt ${randomToken('')}`);
  const missing = await call(`/v2/uninstall-operations/${crypto.randomUUID()}`, `UninstallReceipt ${f.secret}`);
  expect(bad.status).toBe(404); expect(missing.status).toBe(404);
  expect(await bad.json()).toEqual(await missing.json());
  expect(await readUninstallReceipt(env.RUNTIME_DB, f.input.operationId, `UninstallReceipt ${f.secret}`, f.now + 604800000)).toBeNull();
  expect(await readUninstallReceipt(env.RUNTIME_DB, f.input.operationId, `Bearer ${f.token}`, f.now)).toBeNull();
  expect(await readUninstallReceipt(env.RUNTIME_DB, f.input.operationId, `UninstallReceipt ${f.secret}`, f.now + 604799999)).not.toBeNull();
});

it('uninstall commit is idempotent and rejects conflicting parameters and cross-machine scope', async () => {
  const f = await fixture(), other = await fixture();
  const first = await commitUninstallOperation(env.RUNTIME_DB, f.machine, f.input, f.now);
  expect(await commitUninstallOperation(env.RUNTIME_DB, f.machine, f.input, f.now + 1)).toEqual(first);
  await expect(commitUninstallOperation(env.RUNTIME_DB, f.machine,
    { ...f.input, confirmationSecretHash: 'a'.repeat(64) }, f.now)).rejects.toMatchObject({ status: 409 });
  await expect(commitUninstallOperation(env.RUNTIME_DB, other.machine, f.input, f.now)).rejects.toMatchObject({ status: 409 });
  expect(await state(other)).toEqual({ revoked_at_ms: null, consumed_at_ms: null, receipts: 0 });
});

it('uninstall concurrent consumption commits only one operation', async () => {
  const f = await fixture();
  const results = await Promise.all([f.input, { ...f.input, operationId: crypto.randomUUID() }]
    .map(input => commitUninstallOperation(env.RUNTIME_DB, f.machine, input, f.now)));
  expect(results.filter(Boolean)).toHaveLength(1);
  expect(await state(f)).toEqual({ revoked_at_ms: f.now, consumed_at_ms: f.now, receipts: 1 });
});

it('uninstall atomic failure after consuming code rolls back code, machine and receipt', async () => {
  const f = await fixture();
  await env.RUNTIME_DB.prepare(`CREATE TRIGGER test_uninstall_failure BEFORE UPDATE OF revoked_at_ms ON runtime_machines_v2
    BEGIN SELECT RAISE(ABORT, 'TEST_ATOMIC_FAILURE'); END`).run();
  try {
    await expect(commitUninstallOperation(env.RUNTIME_DB, f.machine, f.input, f.now)).rejects.toThrow('TEST_ATOMIC_FAILURE');
    expect(await state(f)).toEqual({ revoked_at_ms: null, consumed_at_ms: null, receipts: 0 });
  } finally { await env.RUNTIME_DB.prepare('DROP TRIGGER test_uninstall_failure').run(); }
  expect(await commitUninstallOperation(env.RUNTIME_DB, f.machine, f.input, f.now)).not.toBeNull();
});

it('legacy uninstall uses atomic operation and invalid or expired codes change nothing', async () => {
  const f = await fixture();
  expect(await commitUninstallOperation(env.RUNTIME_DB, f.machine, { ...f.input, code: 'wrong' }, f.now)).toBeNull();
  expect(await commitUninstallOperation(env.RUNTIME_DB, f.machine, f.input, f.now + 60001)).toBeNull();
  expect(await state(f)).toEqual({ revoked_at_ms: null, consumed_at_ms: null, receipts: 0 });
  const result = await call('/v2/machines/uninstall', `Bearer ${f.token}`, { code: f.code });
  expect(result.status).toBe(200); expect(await result.json()).toEqual({ authorized: true });
  expect(await state(f)).toMatchObject({ receipts: 1 });
  expect((await call('/v2/machines/self', `Bearer ${f.token}`)).status).toBe(401);
});
