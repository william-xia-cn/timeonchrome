import { HttpError } from './http';

export const V3_ONLY_ALGORITHMS = ['windows-application-v3-only-seconds-v1', 'macos-application-v3-only-seconds-v1'] as const;
type Watermark = {machineId:string;localUserId:string;assignmentVersion:number;date:string;revision:number};
export interface ApplicationLedgerRetirement {retired_at_ms:number;backup_sha256:string;revision_watermarks_json:string}
interface RetirementInventory {accountId:string;tables:Array<{table:string;count:number;maxRowId:number}>}

export async function readApplicationLedgerRetirement(db:D1Database,accountId:string) {
  // 尚未应用专用结构的部署保持原行为；数据库故障不能伪装成未退出。
  const table=await db.prepare("SELECT 1 AS present FROM sqlite_master WHERE type='table' AND name='runtime_application_ledger_retirements_v1'").first();
  if(!table)return null;
  return db.prepare('SELECT retired_at_ms,backup_sha256,revision_watermarks_json FROM runtime_application_ledger_retirements_v1 WHERE account_id=?1')
    .bind(accountId).first<ApplicationLedgerRetirement>();
}
export function isV3OnlyApplicationManifest(value:{schemaVersion:number;durationUnit:string;childId?:string;algorithmVersion:string},child:string) {
  return value.schemaVersion===2&&value.durationUnit==='seconds'&&value.childId===child
    &&V3_ONLY_ALGORITHMS.some(algorithm=>algorithm===value.algorithmVersion);
}
export async function requireCurrentApplicationManifest(db:D1Database,accountId:string,child:string,
  manifest:{schemaVersion:number;durationUnit:string;childId?:string;algorithmVersion:string}) {
  const retirement=await readApplicationLedgerRetirement(db,accountId);
  if(retirement&&!isV3OnlyApplicationManifest(manifest,child))
    throw new HttpError(409,'APPLICATION_LEGACY_LEDGER_RETIRED','旧应用账已退出，仅接收新版孩子秒统计。');
  return retirement;
}
export async function requireApplicationLegacyEnabled(db:D1Database,accountId:string) {
  if(await readApplicationLedgerRetirement(db,accountId))
    throw new HttpError(409,'APPLICATION_LEGACY_LEDGER_RETIRED','旧应用账已退出。');
}
export function retiredApplicationRevision(retirement:ApplicationLedgerRetirement,scope:Omit<Watermark,'revision'>) {
  const watermarks=JSON.parse(retirement.revision_watermarks_json) as Watermark[];
  return Math.max(0,...watermarks.filter(row=>row.machineId===scope.machineId&&row.localUserId===scope.localUserId
    &&row.assignmentVersion===scope.assignmentVersion&&row.date===scope.date).map(row=>row.revision));
}

const oldManifests=`SELECT id FROM runtime_application_account_manifests_v1 WHERE account_id=?1
  AND COALESCE(json_extract(manifest_json,'$.algorithmVersion'),'') NOT IN
    ('windows-application-v3-only-seconds-v1','macos-application-v3-only-seconds-v1')`;
const legacyScopes:Record<string,string>={
  runtime_usage_segments:'device_id IN (SELECT id FROM runtime_devices WHERE account_id=?1)',
  runtime_app_hourly_stats_v1:'device_id IN (SELECT id FROM runtime_devices WHERE account_id=?1)',
  runtime_usage_segments_v2:'machine_id IN (SELECT id FROM runtime_machines_v2 WHERE account_id=?1)',
  runtime_usage_diagnostic_segments_v2:'machine_id IN (SELECT id FROM runtime_machines_v2 WHERE account_id=?1)',
  runtime_app_hourly_stats_v2:'machine_id IN (SELECT id FROM runtime_machines_v2 WHERE account_id=?1)',
  runtime_application_statistics_days_v1:'account_id=?1',
  runtime_application_statistics_queue_v1:'account_id=?1',
  runtime_application_shared_quota_verified_v1:'machine_id IN (SELECT id FROM runtime_machines_v2 WHERE account_id=?1)',
  runtime_application_shared_quota_receipts_v1:'account_id=?1',
  runtime_application_account_publications_v1:`account_id=?1 AND manifest_id IN (${oldManifests})`,
  runtime_application_account_manifests_v1:`id IN (${oldManifests})`,
};
const backupScopes:Record<string,string>={...legacyScopes,
  runtime_application_account_chunks_v1:`manifest_id IN (${oldManifests})`,
  runtime_application_account_receipts_v1:`manifest_id IN (${oldManifests})`,
  runtime_application_account_publication_checks_v1:`manifest_id IN (${oldManifests})`,
};
/** 受限维护只读清单：不导出机器令牌、浏览器会话、配对或配置。 */
export async function inspectApplicationLedgerRetirement(db:D1Database,accountId:string){
  const machines=await db.prepare('SELECT id,platform FROM runtime_machines_v2 WHERE account_id=?1 ORDER BY id').bind(accountId).all();
  const devices=await db.prepare('SELECT id,child_id FROM runtime_devices WHERE account_id=?1 ORDER BY id').bind(accountId).all();
  if(!accountId||(!machines.results.length&&!devices.results.length))
    throw new HttpError(404,'APPLICATION_RETIREMENT_SCOPE_NOT_FOUND','未核实家庭电脑范围。');
  const tables=Object.keys(backupScopes);
  const counts=await db.batch<{count:number;maxRowId:number}>(tables.map(table=>db.prepare(`SELECT COUNT(*) AS count,COALESCE(MAX(rowid),0) AS maxRowId FROM ${table} WHERE ${backupScopes[table]}`).bind(accountId)));
  return {accountId,machines:machines.results,devices:devices.results,
    tables:tables.map((table,index)=>({table,...counts[index]!.results[0]!}))};
}
/** 有界备份页；调用方写入受限本地文件并回读验哈希，不能进入Git或公共日志。 */
export async function readApplicationLedgerBackupPage(db:D1Database,accountId:string,table:string,afterRowId=0){
  if(!Object.hasOwn(backupScopes,table)||!accountId||!Number.isSafeInteger(afterRowId)||afterRowId<0)
    throw new HttpError(400,'APPLICATION_RETIREMENT_INVALID_SCOPE','备份范围无效。');
  const rows=await db.prepare(`SELECT rowid AS backup_rowid,* FROM ${table} WHERE (${backupScopes[table]}) AND rowid>?2 ORDER BY rowid LIMIT 10`)
    .bind(accountId,afterRowId).all<Record<string,unknown>&{backup_rowid:number}>();
  return {table,rows:rows.results,nextRowId:rows.results.length===10?rows.results.at(-1)!.backup_rowid:null};
}

/** 只供受限维护调用；不暴露HTTP入口。调用方必须已回读验证家庭范围备份的SHA。 */
export async function retireApplicationLedger(db:D1Database,accountId:string,backupSha256:string,now:number,inventory:RetirementInventory) {
  if(!accountId||accountId.length>200||!/^[a-f0-9]{64}$/.test(backupSha256)||!Number.isSafeInteger(now)||now<=0)
    throw new HttpError(400,'APPLICATION_RETIREMENT_INVALID_SCOPE','清理范围或备份摘要无效。');
  if(inventory?.accountId!==accountId||inventory.tables.length!==Object.keys(backupScopes).length
    ||new Set(inventory.tables.map(row=>row.table)).size!==inventory.tables.length
    ||inventory.tables.some(row=>!Object.hasOwn(backupScopes,row.table)||!Number.isSafeInteger(row.count)||row.count<0
      ||!Number.isSafeInteger(row.maxRowId)||row.maxRowId<0))
    throw new HttpError(400,'APPLICATION_RETIREMENT_INVALID_SCOPE','清理必须对应完整的已备份家庭范围。');
  if(await readApplicationLedgerRetirement(db,accountId))
    throw new HttpError(409,'APPLICATION_RETIREMENT_ALREADY_APPLIED','退出已经执行，不重复删除新数据。');
  const owners=await db.prepare('SELECT id FROM runtime_machines_v2 WHERE account_id=?1 UNION SELECT id FROM runtime_devices WHERE account_id=?1')
    .bind(accountId).all();
  if(!owners.results.length)throw new HttpError(404,'APPLICATION_RETIREMENT_SCOPE_NOT_FOUND','未核实家庭电脑范围。');
  // 事务内从实时清单保存最高水位，避免备份后并发收到的revision被清理重置。
  const unchanged=Object.entries(backupScopes).map(([table,where])=>`((SELECT COUNT(*) FROM ${table} WHERE ${where})=
    (SELECT json_extract(value,'$.count') FROM json_each(?4) WHERE json_extract(value,'$.table')='${table}')
    AND (SELECT COALESCE(MAX(rowid),0) FROM ${table} WHERE ${where})=
    (SELECT json_extract(value,'$.maxRowId') FROM json_each(?4) WHERE json_extract(value,'$.table')='${table}'))`).join(' AND ');
  const statements=[db.prepare(`INSERT INTO runtime_application_ledger_retirements_v1
    (account_id,retired_at_ms,backup_sha256,revision_watermarks_json)
    SELECT ?1,CASE WHEN ${unchanged} THEN ?2 ELSE 0 END,?3,COALESCE(json_group_array(json_object('machineId',machine_id,'localUserId',local_user_id,
      'assignmentVersion',assignment_version,'date',date,'revision',revision)),'[]') FROM (
      SELECT machine_id,local_user_id,assignment_version,date,MAX(revision) AS revision
      FROM runtime_application_account_manifests_v1 WHERE account_id=?1
        AND COALESCE(json_extract(manifest_json,'$.algorithmVersion'),'') NOT IN
          ('windows-application-v3-only-seconds-v1','macos-application-v3-only-seconds-v1')
      GROUP BY machine_id,local_user_id,assignment_version,date)`)
    .bind(accountId,now,backupSha256,JSON.stringify(inventory.tables))];
  for(const [table,where]of Object.entries(legacyScopes))statements.push(db.prepare(`DELETE FROM ${table} WHERE ${where}`).bind(accountId));
  // FK级联仅清理被删除清单的chunks/checks/receipts；新模型清单和ACK保持。
  await db.batch(statements);
  return {retired:true,retiredAtMs:now,scope:'family-application-only'};
}
