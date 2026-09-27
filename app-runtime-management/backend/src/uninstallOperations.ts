import { RUNTIME_UNINSTALL_RECEIPT_TTL_MS } from '@timeonchrome/app-runtime-contracts';
import type { RuntimeUninstallOperationRequest, RuntimeUninstallOperationReceipt } from '@timeonchrome/app-runtime-contracts';
import type { MachineSelfResponse } from './contracts';
import { sha256Hex, timingSafeSecretEquals } from './crypto';
import { HttpError } from './http';

const operationPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
export function validOperationId(value: string): boolean { return operationPattern.test(value); }

interface OperationRow {
  operation_id: string;
  request_hash: string;
  confirmation_secret_hash: string;
  committed_at_ms: number;
  proof_expires_at_ms: number;
}

function receipt(row: OperationRow): RuntimeUninstallOperationReceipt {
  return { operationId: row.operation_id, status: 'committed', revoked: true, committedAtMs: row.committed_at_ms };
}

export async function commitUninstallOperation(database: D1Database, machine: MachineSelfResponse,
  input: RuntimeUninstallOperationRequest, nowMs: number): Promise<RuntimeUninstallOperationReceipt | null> {
  if (!validOperationId(input.operationId) || !/^[0-9a-f]{64}$/u.test(input.confirmationSecretHash)
    || typeof input.code !== 'string' || input.code.length < 1 || input.code.length > 128) {
    throw new HttpError(400, 'INVALID_REQUEST', 'Uninstall operation is invalid.');
  }
  const codeHash = await sha256Hex(input.code);
  const requestHash = await sha256Hex(JSON.stringify(['uninstall', machine.accountId, machine.machineId,
    input.operationId, codeHash, input.confirmationSecretHash]));
  const read = () => database.prepare('SELECT * FROM runtime_uninstall_operations_v1 WHERE operation_id=?1')
    .bind(input.operationId).first<OperationRow>();
  let row = await read();
  if (!row) {
    await database.prepare(`INSERT INTO runtime_uninstall_operations_v1
      (operation_id,machine_id,account_id,purpose,code_hash,request_hash,confirmation_secret_hash,committed_at_ms,proof_expires_at_ms)
      SELECT ?1,?2,?3,'uninstall',?4,?5,?6,?7,?8
      WHERE EXISTS (SELECT 1 FROM runtime_machines_v2 WHERE id=?2 AND account_id=?3 AND revoked_at_ms IS NULL)
        AND EXISTS (SELECT 1 FROM runtime_uninstall_codes_v2 WHERE code_hash=?4 AND machine_id=?2 AND account_id=?3
          AND consumed_at_ms IS NULL AND expires_at_ms>=?7)
      ON CONFLICT(operation_id) DO NOTHING`)
      .bind(input.operationId, machine.machineId, machine.accountId, codeHash, requestHash,
        input.confirmationSecretHash, nowMs, nowMs + RUNTIME_UNINSTALL_RECEIPT_TTL_MS).run();
    row = await read();
  }
  if (!row) return null;
  if (!await timingSafeSecretEquals(requestHash, row.request_hash)) {
    throw new HttpError(409, 'OPERATION_CONFLICT', 'Operation parameters conflict.');
  }
  return receipt(row);
}

export async function readUninstallReceipt(database: D1Database, operationId: string,
  authorization: string, nowMs: number): Promise<RuntimeUninstallOperationReceipt | null> {
  // 32 bytes base64url canonical encoding: the last character has two zero padding bits.
  const proof = /^UninstallReceipt ([A-Za-z0-9_-]{42}[AEIMQUYcgkosw048])$/u.exec(authorization)?.[1];
  const row = validOperationId(operationId)
    ? await database.prepare('SELECT * FROM runtime_uninstall_operations_v1 WHERE operation_id=?1')
      .bind(operationId).first<OperationRow>() : null;
  const matches = await timingSafeSecretEquals(await sha256Hex(proof ?? ''),
    row?.confirmation_secret_hash ?? '0'.repeat(64));
  return proof && row && matches && nowMs < row.proof_expires_at_ms ? receipt(row) : null;
}
