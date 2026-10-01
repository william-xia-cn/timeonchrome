import type { ApplicationSharedQuotaUploadV1, SharedQuotaContributionV1 } from '@timeonchrome/app-runtime-contracts/shared-access';
import { canonicalUsageAccountJson } from '@timeonchrome/app-runtime-contracts/usage-account';
import type { MachineSelfResponse } from './contracts';
import { sha256Hex } from './crypto';
import { HttpError } from './http';
import { isRecord } from './validation';

const validInteger = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) >= 0;
const keys = (value: Record<string, unknown>, required: readonly string[], optional: readonly string[] = []) =>
  required.every(key => Object.hasOwn(value, key)) && Object.keys(value).every(key => required.includes(key) || optional.includes(key));
const string = (value: unknown) => typeof value === 'string' && value.length > 0 && value.length <= 128;
const fail = (code: string): never => { throw new HttpError(400, code, code); };
const categoryKeys = ['study','composite','restrictedEntertainment','unclassified','other'] as const;
const bucketKeys = ['study','composite','rest'] as const;

function parseDate(value: unknown): string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) fail('SHARED_QUOTA_INVALID_DATE');
  const timestamp = Date.parse(`${value}T00:00:00+08:00`);
  if (!Number.isFinite(timestamp) || new Date(timestamp + 28_800_000).toISOString().slice(0,10) !== value)
    fail('SHARED_QUOTA_INVALID_DATE');
  return value as string;
}

export function parseApplicationSharedQuotaUpload(value: unknown): ApplicationSharedQuotaUploadV1 {
  if (!isRecord(value) || !keys(value,['schemaVersion','localUserId','assignmentVersion','revisionOrdinal','contribution'])
    || value.schemaVersion !== 1 || typeof value.localUserId !== 'string'
    || !/^[A-Za-z0-9_-]{32,128}$/.test(value.localUserId)
    || !Number.isSafeInteger(value.assignmentVersion) || Number(value.assignmentVersion) < 1
    || !Number.isSafeInteger(value.revisionOrdinal) || Number(value.revisionOrdinal) < 1
    || !isRecord(value.contribution)) fail('SHARED_QUOTA_INVALID_FIELDS');
  const contribution = (value as Record<string, unknown>).contribution as Record<string, unknown>;
  const bucketValues=contribution.bucketsMs as Record<string,unknown>;
  const classValues=contribution.applicationClassesMs as Record<string,unknown>;
  if (!keys(contribution,['schemaVersion','source','date','revision','statisticsRevision','correctionRevision',
    'policyRevision','settledAtMs','complete','reasonCodes','bucketsMs','applicationClassesMs','chromeExcludedMs'],
    ['productAssociationVersion','chromeIncludedInApplicationMs'])
    || contribution.schemaVersion !== 1 || contribution.source !== 'application'
    || ![contribution.revision,contribution.statisticsRevision,contribution.correctionRevision,
      contribution.policyRevision].every(string)
    || (contribution.productAssociationVersion !== undefined && !string(contribution.productAssociationVersion))
    || (contribution.settledAtMs !== null && !validInteger(contribution.settledAtMs))
    || typeof contribution.complete !== 'boolean'
    || !Array.isArray(contribution.reasonCodes) || contribution.reasonCodes.length > 16
    || contribution.reasonCodes.some((code:unknown) => !string(code))
    || (contribution.complete && contribution.reasonCodes.length !== 0)
    || (!contribution.complete && contribution.reasonCodes.length === 0)
    || !isRecord(contribution.bucketsMs) || !keys(contribution.bucketsMs,bucketKeys)
    || !bucketKeys.every(key => validInteger(bucketValues[key]))
    || !isRecord(contribution.applicationClassesMs) || !keys(contribution.applicationClassesMs,categoryKeys)
    || !categoryKeys.every(key => validInteger(classValues[key]))
    || !validInteger(contribution.chromeExcludedMs)
    || (contribution.chromeIncludedInApplicationMs !== undefined
      && contribution.chromeIncludedInApplicationMs !== null
      && !validInteger(contribution.chromeIncludedInApplicationMs))) fail('SHARED_QUOTA_INVALID_CONTRIBUTION');
  parseDate(contribution.date);
  return value as unknown as ApplicationSharedQuotaUploadV1;
}

interface Receipt { revision_ordinal: number; payload_hash: string; source_key: string; received_at_ms: number }

/** Durable receipt only. A separate source validator must publish a usable shared state. */
export async function receiveApplicationSharedQuota(db: D1Database, machine: MachineSelfResponse,
  value: unknown, nowMs: number) {
  const upload = parseApplicationSharedQuotaUpload(value);
  const assignment = await db.prepare(`SELECT a.child_id FROM runtime_user_assignments_v2 a
    JOIN runtime_machines_v2 m ON m.id=a.machine_id
    WHERE a.machine_id=?1 AND a.local_user_id=?2 AND a.assignment_version=?3
      AND a.protected=1 AND a.child_id IS NOT NULL AND m.account_id=?4 AND m.revoked_at_ms IS NULL`)
    .bind(machine.machineId,upload.localUserId,upload.assignmentVersion,machine.accountId)
    .first<{child_id:string}>();
  if (!assignment) throw new HttpError(403,'SHARED_QUOTA_ASSIGNMENT_UNAVAILABLE','Assignment is unavailable.');
  const sourceKey=await sha256Hex(`application\n${machine.machineId}\n${upload.localUserId}\n${upload.assignmentVersion}`);
  const contribution:SharedQuotaContributionV1={...upload.contribution,sourceKey};
  const payloadJson=canonicalUsageAccountJson(contribution), payloadHash=await sha256Hex(payloadJson);
  await db.prepare(`INSERT INTO runtime_application_shared_quota_receipts_v1
    (machine_id,local_user_id,assignment_version,account_id,child_id,date,revision_ordinal,source_key,payload_hash,payload_json,received_at_ms)
    VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11)
    ON CONFLICT(machine_id,local_user_id,assignment_version,date) DO UPDATE SET
      revision_ordinal=excluded.revision_ordinal,source_key=excluded.source_key,
      payload_hash=excluded.payload_hash,payload_json=excluded.payload_json,received_at_ms=excluded.received_at_ms
    WHERE excluded.revision_ordinal > runtime_application_shared_quota_receipts_v1.revision_ordinal`)
    .bind(machine.machineId,upload.localUserId,upload.assignmentVersion,machine.accountId,assignment.child_id,
      upload.contribution.date,upload.revisionOrdinal,sourceKey,payloadHash,payloadJson,nowMs).run();
  const receipt=await db.prepare(`SELECT revision_ordinal,payload_hash,source_key,received_at_ms
    FROM runtime_application_shared_quota_receipts_v1 WHERE machine_id=?1 AND local_user_id=?2
      AND assignment_version=?3 AND date=?4`)
    .bind(machine.machineId,upload.localUserId,upload.assignmentVersion,upload.contribution.date).first<Receipt>();
  if (!receipt || receipt.revision_ordinal !== upload.revisionOrdinal)
    throw new HttpError(409,'SHARED_QUOTA_STALE_REVISION','A newer contribution is already received.');
  if (receipt.payload_hash !== payloadHash)
    throw new HttpError(409,'SHARED_QUOTA_REVISION_CONFLICT','This revision has different content.');
  return {schemaVersion:1,revisionOrdinal:receipt.revision_ordinal,contributionRevision:upload.contribution.revision,
    sourceKey:receipt.source_key,receivedAtMs:receipt.received_at_ms,received:true,published:false};
}
