import type { ApplicationSharedQuotaUploadV1, SharedQuotaContributionV1 } from '@timeonchrome/app-runtime-contracts/shared-access';
import { canonicalUsageAccountJson, parseUsageAccountRows, verifyUsageAccountManifest } from '@timeonchrome/app-runtime-contracts/usage-account';
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

export type ApplicationSharedQuotaSourceCheck = {
  sourceVerified: boolean;
  policyVerified: false;
  reasonCode: string;
  contribution: SharedQuotaContributionV1 | null;
};

/** Background/read-side check. Never run raw-account publication work on the machine upload hot path. */
export async function checkApplicationSharedQuotaSource(db:D1Database,machineId:string,localUserId:string,
  assignmentVersion:number,date:string):Promise<ApplicationSharedQuotaSourceCheck> {
  const unavailable=(reasonCode:string):ApplicationSharedQuotaSourceCheck=>
    ({sourceVerified:false,policyVerified:false,reasonCode,contribution:null});
  const row=await db.prepare(`SELECT r.payload_json,r.payload_hash,r.account_id,r.child_id,
      m.manifest_hash,m.manifest_json,m.id AS manifest_id
    FROM runtime_application_shared_quota_receipts_v1 r
    LEFT JOIN runtime_application_account_publications_v1 p
      ON p.machine_id=r.machine_id AND p.local_user_id=r.local_user_id
      AND p.assignment_version=r.assignment_version AND p.date=r.date
      AND p.account_id=r.account_id AND p.child_id=r.child_id
    LEFT JOIN runtime_application_account_manifests_v1 m ON m.id=p.manifest_id
    WHERE r.machine_id=?1 AND r.local_user_id=?2 AND r.assignment_version=?3 AND r.date=?4`)
    .bind(machineId,localUserId,assignmentVersion,date)
    .first<{payload_json:string;payload_hash:string;account_id:string;child_id:string;
      manifest_hash:string|null;manifest_json:string|null;manifest_id:string|null}>();
  if(!row)return unavailable('SHARED_QUOTA_RECEIPT_MISSING');
  if(!row.manifest_id||!row.manifest_json||!row.manifest_hash)return unavailable('APPLICATION_ACCOUNT_NOT_PUBLISHED');
  let contribution:SharedQuotaContributionV1;
  try {
    contribution=JSON.parse(row.payload_json) as SharedQuotaContributionV1;
    if(await sha256Hex(canonicalUsageAccountJson(contribution))!==row.payload_hash)
      return unavailable('SHARED_QUOTA_RECEIPT_INTEGRITY_FAILED');
    const manifest=await verifyUsageAccountManifest(JSON.parse(row.manifest_json));
    if(manifest.manifestHash!==row.manifest_hash||manifest.sourceKind!=='application'
      ||manifest.date!==date||!manifest.complete)return unavailable('APPLICATION_ACCOUNT_SOURCE_MISMATCH');
    if(contribution.statisticsRevision!==manifest.manifestHash
      ||contribution.productAssociationVersion!==manifest.associationVersion
      ||contribution.correctionRevision!==String(manifest.correctionVersion)
      ||contribution.settledAtMs!==manifest.settledThroughMs
      ||!contribution.complete)return unavailable('SHARED_QUOTA_SOURCE_VERSION_MISMATCH');
    const chunks=await db.prepare(`SELECT rows_json FROM runtime_application_account_chunks_v1
      WHERE manifest_id=?1 ORDER BY chunk_index LIMIT 100`).bind(row.manifest_id).all<{rows_json:string}>();
    const rows=parseUsageAccountRows(chunks.results.flatMap(chunk=>JSON.parse(chunk.rows_json)));
    const total=rows.find(item=>item.kind==='total'&&item.hour===null)?.duration;
    if(!validInteger(total))return unavailable('APPLICATION_ACCOUNT_TOTAL_MISSING');
    const bounded=[...Object.values(contribution.bucketsMs),
      ...Object.values(contribution.applicationClassesMs??{}),contribution.chromeExcludedMs,
      contribution.chromeIncludedInApplicationMs].filter((item):item is number=>item!==null&&item!==undefined);
    if(!bounded.every(item=>validInteger(item)&&item<=total))return unavailable('SHARED_QUOTA_CONTRIBUTION_OUT_OF_RANGE');
  } catch { return unavailable('SHARED_QUOTA_SOURCE_INVALID'); }
  return {sourceVerified:true,policyVerified:false,reasonCode:'SHARED_POLICY_NOT_VERIFIED',contribution};
}


/** Bounded background verification; failed scopes retry after five minutes or on a new revision. */
export async function reconcileApplicationSharedQuotaEvidence(db:D1Database,nowMs=Date.now(),machineId?:string) {
  const pending=await db.prepare(`SELECT r.machine_id,r.local_user_id,r.assignment_version,r.date,
      r.revision_ordinal,r.payload_hash,m.manifest_hash AS published_manifest_hash
    FROM runtime_application_shared_quota_receipts_v1 r
    LEFT JOIN runtime_application_shared_quota_verified_v1 v
      ON v.machine_id=r.machine_id AND v.local_user_id=r.local_user_id
      AND v.assignment_version=r.assignment_version AND v.date=r.date
    LEFT JOIN runtime_application_account_publications_v1 p
      ON p.machine_id=r.machine_id AND p.local_user_id=r.local_user_id
      AND p.assignment_version=r.assignment_version AND p.date=r.date
    LEFT JOIN runtime_application_account_manifests_v1 m ON m.id=p.manifest_id
    WHERE (?1 IS NULL OR r.machine_id=?1) AND
      (v.machine_id IS NULL OR v.revision_ordinal<>r.revision_ordinal OR v.payload_hash<>r.payload_hash
       OR COALESCE(m.manifest_hash,'')<>v.statistics_manifest_hash
       OR (v.source_verified=0 AND v.verified_at_ms<=?2))
    ORDER BY r.received_at_ms,r.machine_id,r.local_user_id,r.date LIMIT 2`)
    .bind(machineId??null,nowMs-300_000).all<{machine_id:string;local_user_id:string;assignment_version:number;
      date:string;revision_ordinal:number;payload_hash:string;published_manifest_hash:string|null}>();
  let verified=0;
  for(const candidate of pending.results){
    const result=await checkApplicationSharedQuotaSource(db,candidate.machine_id,candidate.local_user_id,
      candidate.assignment_version,candidate.date);
    const marginal=result.sourceVerified?result.contribution?.chromeIncludedInApplicationMs??null:null;
    await db.prepare(`INSERT INTO runtime_application_shared_quota_verified_v1
      (machine_id,local_user_id,assignment_version,date,revision_ordinal,payload_hash,
       statistics_manifest_hash,chrome_included_ms,source_verified,reason_code,verified_at_ms)
      SELECT machine_id,local_user_id,assignment_version,date,revision_ordinal,payload_hash,
        ?6,?7,?8,?9,?10 FROM runtime_application_shared_quota_receipts_v1
      WHERE machine_id=?1 AND local_user_id=?2 AND assignment_version=?3 AND date=?4
        AND revision_ordinal=?5 AND payload_hash=?11
      ON CONFLICT(machine_id,local_user_id,assignment_version,date) DO UPDATE SET
        revision_ordinal=excluded.revision_ordinal,payload_hash=excluded.payload_hash,
        statistics_manifest_hash=excluded.statistics_manifest_hash,chrome_included_ms=excluded.chrome_included_ms,
        source_verified=excluded.source_verified,reason_code=excluded.reason_code,verified_at_ms=excluded.verified_at_ms`)
      .bind(candidate.machine_id,candidate.local_user_id,candidate.assignment_version,candidate.date,
        candidate.revision_ordinal,candidate.published_manifest_hash??'',marginal,
        result.sourceVerified?1:0,result.reasonCode,nowMs,candidate.payload_hash).run();
    if(result.sourceVerified)verified++;
  }
  return {processed:pending.results.length,verified};
}

/** Only current, source-verified marginal evidence; caller must establish full scope coverage before summing. */
export async function readVerifiedChromeMarginals(db:D1Database,accountId:string,childId:string,
  fromDate:string,toDate:string) {
  parseDate(fromDate);parseDate(toDate);
  if(toDate<fromDate||Date.parse(`${toDate}T00:00:00+08:00`)-Date.parse(`${fromDate}T00:00:00+08:00`)>6*86_400_000)
    fail('SHARED_QUOTA_INVALID_RANGE');
  const result=await db.prepare(`SELECT v.machine_id,v.local_user_id,v.assignment_version,v.date,
      v.chrome_included_ms,v.statistics_manifest_hash
    FROM runtime_application_shared_quota_verified_v1 v
    JOIN runtime_application_shared_quota_receipts_v1 r
      ON r.machine_id=v.machine_id AND r.local_user_id=v.local_user_id
      AND r.assignment_version=v.assignment_version AND r.date=v.date
      AND r.revision_ordinal=v.revision_ordinal AND r.payload_hash=v.payload_hash
    JOIN runtime_application_account_publications_v1 p
      ON p.machine_id=r.machine_id AND p.local_user_id=r.local_user_id
      AND p.assignment_version=r.assignment_version AND p.date=r.date
      AND p.account_id=r.account_id AND p.child_id=r.child_id
    JOIN runtime_application_account_manifests_v1 m
      ON m.id=p.manifest_id AND m.manifest_hash=v.statistics_manifest_hash
    WHERE r.account_id=?1 AND r.child_id=?2 AND v.date>=?3 AND v.date<=?4
      AND v.source_verified=1
    ORDER BY v.machine_id,v.local_user_id,v.assignment_version,v.date LIMIT 1001`)
    .bind(accountId,childId,fromDate,toDate)
    .all<{machine_id:string;local_user_id:string;assignment_version:number;date:string;
      chrome_included_ms:number|null;statistics_manifest_hash:string}>();
  if(result.results.length>1000)throw new HttpError(422,'SHARED_QUOTA_SOURCE_LIMIT','Too many application scopes.');
  return result.results;
}

/** Exact native-account coverage check for one machine and at most seven Beijing dates. */
export async function readCoveredChromeDeduction(db:D1Database,accountId:string,childId:string,
  machineId:string,fromDate:string,toDate:string,totalMs:number):Promise<number|null> {
  parseDate(fromDate);parseDate(toDate);
  if(toDate<fromDate||Date.parse(`${toDate}T00:00:00+08:00`)-Date.parse(`${fromDate}T00:00:00+08:00`)>6*86_400_000
    ||!validInteger(totalMs))fail('SHARED_QUOTA_INVALID_RANGE');
  const matched=`v.source_verified=1 AND v.chrome_included_ms IS NOT NULL
    AND v.statistics_manifest_hash=m.manifest_hash
    AND v.revision_ordinal=r.revision_ordinal AND v.payload_hash=r.payload_hash`;
  const coverage=await db.prepare(`SELECT COUNT(*) AS expected,
      SUM(CASE WHEN ${matched} THEN 1 ELSE 0 END) AS verified,
      SUM(CASE WHEN ${matched} THEN v.chrome_included_ms ELSE 0 END) AS included_ms
    FROM runtime_application_account_publications_v1 p
    JOIN runtime_application_account_manifests_v1 m ON m.id=p.manifest_id
    LEFT JOIN runtime_application_shared_quota_receipts_v1 r
      ON r.machine_id=p.machine_id AND r.local_user_id=p.local_user_id
      AND r.assignment_version=p.assignment_version AND r.date=p.date
      AND r.account_id=p.account_id AND r.child_id=p.child_id
    LEFT JOIN runtime_application_shared_quota_verified_v1 v
      ON v.machine_id=r.machine_id AND v.local_user_id=r.local_user_id
      AND v.assignment_version=r.assignment_version AND v.date=r.date
    WHERE p.account_id=?1 AND p.child_id=?2 AND p.machine_id=?3
      AND p.date>=?4 AND p.date<=?5`)
    .bind(accountId,childId,machineId,fromDate,toDate)
    .first<{expected:number;verified:number|null;included_ms:number|null}>();
  const expected=Number(coverage?.expected??0),verified=Number(coverage?.verified??0),
    included=Number(coverage?.included_ms??0);
  if(expected===0)return totalMs===0?0:null;
  return expected===verified&&validInteger(included)&&included<=totalMs?included:null;
}
