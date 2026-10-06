import { sourceStatisticsDates, validateSourceStatisticsSnapshot, type SourceStatisticsQuery, type SourceStatisticsSnapshot, type SourceStatisticsDay } from '@timeonchrome/app-runtime-contracts/source-statistics';
import { verifyUsageAccountManifestV2 } from '@timeonchrome/app-runtime-contracts/usage-account';
import { applicationSharedQuotaSourceKey } from './applicationSharedQuota';
import { isV3OnlyApplicationManifest } from './applicationLedgerRetirement';
import { sha256Hex } from './crypto';
import { HttpError } from './http';

/** 仅归集已发布的新版来源统计；不读取原始段、不等待原账或重算。 */
export async function readApplicationSourceStatistics(db: D1Database, accountId: string, childId: string,
  query: SourceStatisticsQuery, now = Date.now()): Promise<SourceStatisticsSnapshot> {
  if (query.source !== 'application') throw new HttpError(400, 'INVALID_SOURCE', '应用读取器只返回应用统计。');
  const excluded = query.scope === 'other' ? [...(query.ownSourceKeys ?? [])].sort() : [];
  const heads = await db.prepare(`SELECT p.date,p.machine_id,p.local_user_id,p.assignment_version,p.manifest_id,p.revision,
      s.manifest_json,s.manifest_hash FROM runtime_application_account_publications_v1 p
    JOIN runtime_application_account_manifests_v1 s ON s.id=p.manifest_id
    JOIN runtime_machines_v2 m ON m.id=p.machine_id
    WHERE p.account_id=?1 AND p.child_id=?2 AND m.account_id=?1 AND s.account_id=?1 AND s.child_id=?2
      AND s.machine_id=p.machine_id AND s.local_user_id=p.local_user_id AND s.assignment_version=p.assignment_version
      AND s.date=p.date AND s.revision=p.revision AND p.date>=?3 AND p.date<=?4
    ORDER BY p.date,p.machine_id,p.local_user_id,p.assignment_version LIMIT 701`)
    .bind(accountId, childId, query.fromDate, query.toDate).all<{date:string;machine_id:string;local_user_id:string;assignment_version:number;manifest_id:string;revision:number;manifest_json:string;manifest_hash:string}>();
  if (heads.results.length > 700) throw new HttpError(503, 'SOURCE_STATISTICS_SOURCE_LIMIT', '统计来源超出读取限制。');
  const assignments = await db.prepare(`SELECT a.machine_id,a.local_user_id,a.assignment_version FROM runtime_user_assignments_v2 a
    JOIN runtime_machines_v2 m ON m.id=a.machine_id WHERE m.account_id=?1 AND a.child_id=?2 AND a.protected=1
      AND NOT EXISTS(SELECT 1 FROM runtime_user_assignments_v2 n WHERE n.machine_id=a.machine_id AND n.local_user_id=a.local_user_id AND n.assignment_version>a.assignment_version)
    ORDER BY a.machine_id,a.local_user_id,a.assignment_version LIMIT 201`).bind(accountId,childId)
    .all<{machine_id:string;local_user_id:string;assignment_version:number}>();
  if (assignments.results.length > 200) throw new HttpError(503,'SOURCE_STATISTICS_SOURCE_LIMIT','统计来源超出读取限制。');
  const expected = new Set<string>();
  for (const a of assignments.results) { const key=await applicationSharedQuotaSourceKey(a.machine_id,a.local_user_id,a.assignment_version); if(!excluded.includes(key))expected.add(key); }
  const included = new Set<string>(), versions: unknown[] = [], days: SourceStatisticsDay[]=[];
  const add = (a:number,b:number) => { const n=a+b; if(!Number.isSafeInteger(n)||n<0)throw new HttpError(503,'SOURCE_STATISTICS_INVALID','统计时长无效。');return n; };
  for (const date of sourceStatisticsDates(query.fromDate,query.toDate)) {
    let total=0, nonSpecial=0, count=0; const cutoffs:Array<number|null>=[],categories:Record<string,number>={}, reasons=new Set<string>(), seen=new Set<string>();
    for (const head of heads.results.filter(h=>h.date===date)) {
      const key=await applicationSharedQuotaSourceKey(head.machine_id,head.local_user_id,head.assignment_version);
      if(excluded.includes(key))continue;
      const manifest=await verifyUsageAccountManifestV2(JSON.parse(head.manifest_json));
      if(!isV3OnlyApplicationManifest(manifest,childId)){ reasons.add('APPLICATION_V3_RECORDS_NOT_AVAILABLE');continue; }
      if(manifest.date!==date||manifest.childId!==childId||manifest.revision!==head.revision||manifest.manifestHash!==head.manifest_hash)
        throw new HttpError(503,'SOURCE_STATISTICS_INVALID','已发布统计范围或哈希无效。');
      // 冻结清单已在接收时校验分块/行哈希；这里只取已持久化的日total，不传排行或扫描原账。
      const row=await db.prepare(`SELECT json_extract(r.value,'$.duration') AS duration
        FROM runtime_application_account_chunks_v1 c,json_each(c.rows_json) r WHERE c.manifest_id=?1
        AND json_extract(r.value,'$.kind')='total' AND json_extract(r.value,'$.hour') IS NULL LIMIT 2`)
        .bind(head.manifest_id).all<{duration:number}>();
      if(row.results.length!==1||!Number.isSafeInteger(row.results[0]!.duration)||row.results[0]!.duration<0)
        throw new HttpError(503,'SOURCE_STATISTICS_INVALID','已发布日总量无效。');
      total=add(total,row.results[0]!.duration);count++;seen.add(key);included.add(key);
      versions.push([date,key,manifest.revision,manifest.manifestHash]);
      cutoffs.push(manifest.settledThroughMs);
      for(const reason of manifest.reasonCodes)reasons.add(reason);
      if(!manifest.complete)reasons.add('APPLICATION_STATISTICS_INCOMPLETE');
      const usage=manifest.applicationUsage;
      if(!usage){reasons.add('APPLICATION_USAGE_CLASSIFICATION_UNAVAILABLE');continue;}
      nonSpecial=add(nonSpecial,usage.nonSpecialTotal);
      for(const [category,n] of Object.entries(usage.nonSpecialCategories))categories[category]=add(categories[category]??0,n);
      for(const reason of usage.reasonCodes)reasons.add(reason);
      if(!usage.complete)reasons.add('APPLICATION_USAGE_CLASSIFICATION_UNAVAILABLE');
    }
    if([...expected].some(key=>!seen.has(key)))reasons.add('APPLICATION_SOURCE_NOT_PUBLISHED');
    const unknown=count===0&&reasons.size>0;
    days.push({date,totalSeconds:unknown?null:total,categoriesSeconds:categories,
      nonSpecialTotalSeconds:unknown||reasons.has('APPLICATION_USAGE_CLASSIFICATION_UNAVAILABLE')?null:nonSpecial,
      settledThroughMs:cutoffs.length&&cutoffs.every(n=>n!==null)?Math.min(...cutoffs as number[]):null,complete:reasons.size===0,reasonCodes:[...reasons].sort()});
  }
  const value:SourceStatisticsSnapshot={schemaVersion:1,durationUnit:'seconds',source:'application',childId,
    fromDate:query.fromDate,toDate:query.toDate,readAtMs:now,includedSourceKeys:[...included].sort(),excludedSourceKeys:excluded,days,
    revision:await sha256Hex(JSON.stringify({childId,query,versions,days}))};
  return validateSourceStatisticsSnapshot(value,{source:'application',childId,fromDate:query.fromDate,toDate:query.toDate});
}
