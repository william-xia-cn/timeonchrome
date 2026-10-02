'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { createHash } = require('node:crypto');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '../..');
const url = file => pathToFileURL(path.join(root, file)).href;
const clone = value => structuredClone(value);
async function run() {
  const policyCore = await import(url('extension/core/shared-access-policy.js'));
  const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
  const policy = { schemaVersion: 1, revision: 'profile-config:4', effectiveAtMs: 1234, stage: 'shadow',
    dailyMinutes: Object.fromEntries(days.map(day => [day, { study: null, composite: 60, rest: 240 }])), weeklyRestMinutes: 840,
    timeWindows: Object.fromEntries(days.map(day => [day, { study: null, composite: null, rest: [{ start: '07:00', end: '24:00' }] }])),
    autonomy: { restrictedEntryConfirmationRequired: true, dailyFirstReminderMinutes: 120, weeklyFirstReminderMinutes: 840,
      repeatReminderMinutes: 60, softReminderTimeoutAction: 'end_rest', visibleResponseDeadlineSeconds: 60 } };
  const identityFor = p => ({ schemaVersion: 1, revision: p.revision, effectiveAtMs: p.effectiveAtMs, stage: p.stage,
    policyHash: createHash('sha256').update(policyCore.canonicalSharedPolicy(p)).digest('hex') });
  if (process.argv[2]) {
    const archive = fs.readFileSync(process.argv[2]);
    assert.equal(archive.length, 93321);
    assert.equal(createHash('sha256').update(archive).digest('hex'), '1338ab2b2621ed4c19b8208203fd77d8e648b4f20721529479fc73a947bbbaf4');
    const source = execFileSync('tar', ['-xOf', process.argv[2], 'package/dist/shared-access.js'], { encoding: 'utf8' });
    const fixed = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
    assert.equal(fixed.canonicalSharedAccessPolicyV1(policy), policyCore.canonicalSharedPolicy(policy));
    assert.deepEqual(await fixed.createSharedAccessPolicyIdentityV1(policy), identityFor(policy));
    const ordered = Object.fromEntries(Object.entries(policy).reverse());
    assert.deepEqual(await fixed.createSharedAccessPolicyIdentityV1(ordered), identityFor(policy));
    for (const p of [{ ...policy, effectiveAtMs: 1235 }, { ...policy, stage: 'shared' }, { ...policy, weeklyRestMinutes: 841 }]) {
      assert.equal(await fixed.matchesSharedAccessPolicyIdentityV1(p, identityFor(policy)), false);
    }
  }
  const source = fs.readFileSync(path.join(root, 'extension/infra/shared-policy-identity-reader.js'), 'utf8')
    .replace(/from '\.\.\/core\/shared-access-policy.js'/, `from '${url('extension/core/shared-access-policy.js')}'`)
    .replace(/from '\.\.\/core\/shared-quota-state.js'/, `from '${url('extension/core/shared-quota-state.js')}'`)
    .replace(/import \{ readSharedAccessPolicyContext, readSharedAccessPolicyLkg \} from '[^']+';/,
      'const readSharedAccessPolicyContext=()=>{throw Error("default context")};const readSharedAccessPolicyLkg=()=>{throw Error("default policy")};')
    .replace(/import \{ requestSharedQuotaState \} from '[^']+';/, 'const requestSharedQuotaState=()=>{throw Error("default native")};');
  const mod = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
  const query = { date: '2026-10-02', weekStart: '2026-09-28' };
  function fixture() {
    let current = clone(policy), context = { apiBase: 'https://fixture.invalid', deviceId: 'd-A', childId: 'c-A', deviceToken: 'fixture-A' };
    let response = { ok: true, policyIdentityStatus: 'available', state: { policyRevision: policy.revision }, sharedAccessPolicyIdentity: identityFor(policy) }, custom;
    const calls = [];
    const options = { enabled: true, readContext: async () => clone(context), readPolicy: async () => ({ ok: true, policy: clone(current) }),
      request: async input => { calls.push(input); return custom ? custom() : clone(response); } };
    return { calls, reader: mod.createSharedPolicyIdentityReader(options), options,
      policy: p => { current = clone(p); }, context: p => { context = { ...context, ...p }; }, response: p => { response = p; }, request: fn => { custom = fn; } };
  }
  const f = fixture();
  assert.equal((await mod.createSharedPolicyIdentityReader({ ...f.options, enabled: false }).inspect(query)).policyIdentityStatus, 'unverified');
  assert.equal(f.calls.length, 0);
  assert.deepEqual(await f.reader.inspect(query), { ok: true, policyIdentityStatus: 'matched', errorCode: null, executionEnabled: false });
  assert.deepEqual(f.calls[0], { ...query, policyRevision: policy.revision });
  for (const changed of [{ ...policy, effectiveAtMs: 1235 }, { ...policy, stage: 'shared' }, { ...policy, weeklyRestMinutes: 841 }]) {
    const test = fixture(); test.policy(changed);
    assert.equal((await test.reader.inspect(query)).policyIdentityStatus, 'mismatch', 'same revision is not full policy equality');
  }
  for (const response of [{ ok: true, policyIdentityStatus: 'unverified' }, { ok: true, policyIdentityStatus: 'available' },
    { ok: true, policyIdentityStatus: 'available', sharedAccessPolicyIdentity: { ...identityFor(policy), policyHash: 'bad' } },
    { ok: true, policyIdentityStatus: 'available', sharedAccessPolicyIdentity: { ...identityFor(policy), unexpected: true } }]) {
    const test = fixture(); test.response(response); const result = await test.reader.inspect(query);
    assert.equal(result.ok, false); assert.equal(result.policyIdentityStatus, 'unverified'); assert.equal(result.executionEnabled, false);
  }
  const wrong = fixture(); wrong.response({ ok: true, policyIdentityStatus: 'available', state: { policyRevision: policy.revision },
    sharedAccessPolicyIdentity: { ...identityFor(policy), policyHash: 'b'.repeat(64) } });
  assert.equal((await wrong.reader.inspect(query)).policyIdentityStatus, 'mismatch');
  for (const change of [f => f.context({ childId: 'c-B' }), f => f.context({ deviceToken: 'fixture-B' }),
    f => f.policy({ ...policy, stage: 'shared' }), f => f.policy({ ...policy, effectiveAtMs: 1235 })]) {
    const test = fixture(); let release, enter; const waiting = new Promise(resolve => { enter = resolve; });
    test.request(() => { enter(); return new Promise(resolve => { release = resolve; }); });
    const read = test.reader.inspect(query); await waiting;
    assert.equal((await test.reader.inspect(query)).errorCode, 'shared_policy_identity_busy');
    change(test); release({ ok: true, policyIdentityStatus: 'available', state: { policyRevision: policy.revision }, sharedAccessPolicyIdentity: identityFor(policy) });
    assert.equal((await read).errorCode, 'shared_policy_identity_changed');
  }
  console.log('[Shared policy identity] full policy, fixed 1.29 hash, default-off, missing capability/field, mismatch and late identity passed');
}
run().catch(error => { console.error(error); process.exitCode = 1; });
