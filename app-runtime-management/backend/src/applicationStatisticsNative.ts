import {parseUsageAccountRows,parseUsageAccountRowsV2,verifyUsageAccountManifestV2,validateUsageAccountDimensions,validateUsageAccountDimensionsV2,
  hashUsageAccountValue,type UsageAccountRow,type UsageAccountManifest,type UsageAccountRowV2,type ApplicationUsageSeconds} from '@timeonchrome/app-runtime-contracts/usage-account';
import {HttpError} from './http';
import type {StatisticsValue} from './applicationStatistics';
import { normalizeApplicationUsageClock } from './applicationUsageClock';
import { verifyApplicationAccountPublication,isReadableApplicationAccountSnapshot } from './applicationAccountPublication';
type Filters={machineId?:string;localUserId?:string;platform?:string};
const DAY=86400000,OFFSET=8*3600000;
function mergeApplicationUsage(values:Array<ApplicationUsageSeconds|undefined|null>):ApplicationUsageSeconds|null {
  if(!values.length||values.some(value=>!value))return null;
  const sum=(a:number,b:number)=>{const value=a+b;if(!Number.isSafeInteger(value))throw new HttpError(503,'APPLICATION_STATISTICS_DURATION_OVERFLOW','统计时长超出安全范围。');return value;};
  const result:ApplicationUsageSeconds={nonSpecialTotal:0,nonSpecialCategories:{},specialTotal:0,complete:true,reasonCodes:[]};
  for(const value of values){
    result.nonSpecialTotal=sum(result.nonSpecialTotal,value!.nonSpecialTotal);
    result.specialTotal=sum(result.specialTotal,value!.specialTotal);
    for(const [category,duration]of Object.entries(value!.nonSpecialCategories))result.nonSpecialCategories[category]=sum(result.nonSpecialCategories[category]??0,duration);
    result.complete=result.complete&&value!.complete;result.reasonCodes.push(...value!.reasonCodes);
  }
  result.reasonCodes=[...new Set(result.reasonCodes)].sort();return result;
}
/** 持久化来源统计读取；不加载原账，不调用云端统计重算器。 */
export async function readNativeApplicationStatisticsSeconds(db:D1Database,account:string,child:string,date:string,filters:Filters={}) {
  const heads=await db.prepare(`SELECT p.manifest_id,p.revision,p.machine_id,p.local_user_id,p.assignment_version,
      snapshot.manifest_json,snapshot.manifest_hash FROM runtime_application_account_publications_v1 p
    JOIN runtime_application_account_manifests_v1 snapshot ON snapshot.id=p.manifest_id
    JOIN runtime_machines_v2 machine ON machine.id=p.machine_id
    WHERE p.account_id=?1 AND p.child_id=?2 AND p.date=?3 AND machine.account_id=?1
      AND snapshot.account_id=?1 AND snapshot.child_id=?2 AND snapshot.date=?3
      AND snapshot.machine_id=p.machine_id AND snapshot.local_user_id=p.local_user_id
      AND snapshot.assignment_version=p.assignment_version AND snapshot.revision=p.revision
      AND (?4 IS NULL OR p.machine_id=?4) AND (?5 IS NULL OR p.local_user_id=?5)
      AND (?6 IS NULL OR machine.platform=?6)
    ORDER BY p.machine_id,p.local_user_id,p.assignment_version LIMIT 101`)
    .bind(account,child,date,filters.machineId??null,filters.localUserId??null,filters.platform??null)
    .all<{manifest_id:string;revision:number;machine_id:string;local_user_id:string;assignment_version:number;
      manifest_json:string;manifest_hash:string}>();
  if(heads.results.length>100)throw new HttpError(503,'APPLICATION_STATISTICS_SOURCE_LIMIT','统计来源超过单次读取限制。');
  const merged=new Map<string,UsageAccountRowV2>(),references:Array<{manifestId:string;revision:number;hash:string;settledThroughMs:number|null}>=[];
  let count=0,legacySourceCount=0;
  let complete=true;
  const reasonCodes=new Set<string>();
  const applicationUsage:Array<ApplicationUsageSeconds|undefined>=[];
  for(const head of heads.results){
    const value=JSON.parse(head.manifest_json);
    if(value.schemaVersion!==2){legacySourceCount++;continue;}
    const manifest=await verifyUsageAccountManifestV2(value);
    if(manifest.childId!==undefined&&manifest.childId!==child)
      throw new HttpError(503,'APPLICATION_ACCOUNT_CHILD_SCOPE_MISMATCH','统计清单孩子与读取范围不一致。');
    if(!isReadableApplicationAccountSnapshot(manifest)||manifest.date!==date||manifest.sourceKind!=='application'
      ||manifest.revision!==head.revision||manifest.manifestHash!==head.manifest_hash)
      throw new HttpError(503,'APPLICATION_STATISTICS_INVALID_PUBLICATION','已发布统计范围无效。');
    const chunks=await db.prepare(`SELECT chunk_index,rows_json FROM runtime_application_account_chunks_v1
      WHERE manifest_id=?1 ORDER BY chunk_index LIMIT 100`).bind(head.manifest_id)
      .all<{chunk_index:number;rows_json:string}>();
    if(chunks.results.length!==manifest.chunkCount||chunks.results.some((chunk,index)=>chunk.chunk_index!==index))
      throw new HttpError(503,'APPLICATION_STATISTICS_CHUNKS_MISSING','已发布统计分块不完整。');
    const rows=parseUsageAccountRowsV2(chunks.results.flatMap(chunk=>JSON.parse(chunk.rows_json)));
    if(rows.length!==manifest.rowCount||await hashUsageAccountValue(rows)!==manifest.rowsHash)
      throw new HttpError(503,'APPLICATION_STATISTICS_HASH_MISMATCH','已发布统计完整性校验失败。');
    validateUsageAccountDimensionsV2(rows);
    complete=complete&&manifest.complete;
    for(const reason of manifest.reasonCodes)reasonCodes.add(reason);
    count+=rows.length;
    if(count>10000)throw new HttpError(503,'APPLICATION_STATISTICS_ROW_LIMIT','统计行超过单次读取限制。');
    references.push({manifestId:head.manifest_id,revision:head.revision,hash:head.manifest_hash,settledThroughMs:manifest.settledThroughMs});
    applicationUsage.push(manifest.applicationUsage);
    for(const row of rows){
      const key=JSON.stringify([row.kind,row.hour,row.category,row.subjectKey]),prior=merged.get(key);
      if(prior){prior.duration+=row.duration;
        if(!Number.isSafeInteger(prior.duration))throw new HttpError(503,'APPLICATION_STATISTICS_DURATION_OVERFLOW','统计时长超出安全范围。');
        if(row.kind==='subject')prior.classifications=[...new Set([...(prior.classifications??[]),...row.classifications!])].sort();
      }else merged.set(key,{...row,...(row.classifications?{classifications:[...row.classifications]}:{})});
    }
  }
  if(references.length===0)return null;
  return {durationUnit:'seconds' as const,rows:[...merged.values()],references,legacySourceCount,
    applicationUsage:legacySourceCount?null:mergeApplicationUsage(applicationUsage),
    complete:complete&&legacySourceCount===0,reasonCodes:[...reasonCodes].sort(),revision:await hashUsageAccountValue(references)};
}
/** 日／周统计只归集来源秒统计；缺日期不等于零，余额由独立配额模块计算。 */
export async function readNativeApplicationStatisticsRangeSeconds(db:D1Database,account:string,child:string,
  fromMs:number,toMs:number,filters:Filters={}) {
  if(!Number.isSafeInteger(fromMs)||!Number.isSafeInteger(toMs)||fromMs<0||toMs<=fromMs
    ||(fromMs+OFFSET)%DAY!==0||(toMs+OFFSET)%DAY!==0||toMs-fromMs>7*DAY)
    throw new HttpError(400,'INVALID_RANGE','秒统计仅支持最多七个北京时间完整日期。');
  const days:Array<{date:string;snapshot:Awaited<ReturnType<typeof readNativeApplicationStatisticsSeconds>>}>=[];
  for(let cursor=fromMs;cursor<toMs;cursor+=DAY){
    const date=new Date(cursor+OFFSET).toISOString().slice(0,10);
    days.push({date,snapshot:await readNativeApplicationStatisticsSeconds(db,account,child,date,filters)});
  }
  const merged=new Map<string,UsageAccountRowV2>();
  for(const day of days)for(const row of day.snapshot?.rows??[]){
    if(row.hour!==null)continue;
    const key=JSON.stringify([row.kind,row.category,row.subjectKey]),prior=merged.get(key);
    if(prior){
      prior.duration+=row.duration;
      if(!Number.isSafeInteger(prior.duration))throw new HttpError(503,'APPLICATION_STATISTICS_DURATION_OVERFLOW','统计时长超出安全范围。');
      if(row.kind==='subject')prior.classifications=[...new Set([...(prior.classifications??[]),...row.classifications!])].sort();
    }else merged.set(key,{...row,...(row.classifications?{classifications:[...row.classifications]}:{})});
  }
  const complete=days.every(day=>day.snapshot?.complete===true);
  const rows=[...merged.values()];
  const availableTotal=rows.find(row=>row.kind==='total')?.duration??null;
  const applicationUsage=mergeApplicationUsage(days.map(day=>day.snapshot?.applicationUsage));
  return {durationUnit:'seconds' as const,complete,totalDuration:complete?availableTotal:null,
    applicationUsage,
    availableTotalDuration:availableTotal,
    categories:rows.filter(row=>row.kind==='category'),products:rows.filter(row=>row.kind==='subject'),
    days:days.map(({date,snapshot})=>({date,complete:snapshot?.complete===true,
      reasonCodes:!snapshot?['APPLICATION_STATISTICS_NOT_AVAILABLE']:
        [...new Set([...snapshot.reasonCodes,...(snapshot.legacySourceCount>0?['LEGACY_STATISTICS_UNIT']:[])])].sort(),
      totalDuration:snapshot?.rows.find(row=>row.kind==='total'&&row.hour===null)?.duration??null,
      hours:snapshot?.rows.filter(row=>row.hour!==null)??[],
      settledThroughMs:snapshot?.references.every(ref=>ref.settledThroughMs!==null)
        ?Math.min(...snapshot.references.map(ref=>ref.settledThroughMs!)):null})),
    revision:await hashUsageAccountValue(days.map(day=>[day.date,day.snapshot?.revision??null]))};
}
/** One producer per complete scope/day. Native and legacy are NEVER added together. */
export async function selectNativeApplicationStatistics(db:D1Database,account:string,child:string,from:number,to:number,filters:Filters,
  original:StatisticsValue,source:(machineId:string,user:string)=>Promise<string>,now=Date.now()):Promise<{rows:UsageAccountRow[];settledThroughMs:number|null;subjectClassifications:Record<string,string[]>;stale:boolean}|null> {
  if((from+OFFSET)%DAY!==0||to-from!==DAY)return null;
  const legacy=await db.prepare(`SELECT COUNT(*) AS n FROM runtime_usage_segments s JOIN runtime_devices d ON d.id=s.device_id
    WHERE d.account_id=?1 AND d.child_id=?2 AND s.start_at_ms<?4 AND s.end_at_ms>?3
      AND ?5 IS NULL AND ?6 IS NULL AND (?7 IS NULL OR s.platform=?7)`)
    .bind(account,child,from,to,filters.machineId??null,filters.localUserId??null,filters.platform??null).first<{n:number}>();
  if(Number(legacy?.n)>0)return null;
  const partitions=await db.prepare(`SELECT s.machine_id,s.local_user_id,s.assignment_version,COUNT(*) AS n
    FROM runtime_usage_segments_v2 s JOIN runtime_machines_v2 m ON m.id=s.machine_id
    WHERE m.account_id=?1 AND s.child_id=?2 AND s.diagnostic=0 AND COALESCE(s.start_wall_time_ms,s.start_at_ms)<?4
      AND COALESCE(s.end_wall_time_ms,s.end_at_ms)>?3 AND s.monotonic_duration_ms>0 AND (?5 IS NULL OR s.machine_id=?5)
      AND (?6 IS NULL OR s.local_user_id=?6) AND (?7 IS NULL OR s.platform=?7)
    GROUP BY s.machine_id,s.local_user_id,s.assignment_version LIMIT 101`)
    .bind(account,child,from-2000,to+2000,filters.machineId??null,filters.localUserId??null,filters.platform??null)
    .all<{machine_id:string;local_user_id:string;assignment_version:number;n:number}>();
  if(!partitions.results.length||partitions.results.length>100)return null;
  // Different assignments of the same user may overlap. Verify, rather than
  // replacing this test with equality to the unrelated legacy statistics.
  const users=new Map<string,typeof partitions.results>();
  for(const part of partitions.results){const key=JSON.stringify([part.machine_id,part.local_user_id]);
    const group=users.get(key)??[];group.push(part);users.set(key,group);}
  for(const group of users.values())if(group.length>1){
    const part=group[0]!;
    const facts=await db.prepare(`SELECT s.* FROM runtime_usage_segments_v2 s JOIN runtime_machines_v2 m ON m.id=s.machine_id
      WHERE m.account_id=?1 AND s.child_id=?2 AND s.machine_id=?3 AND s.local_user_id=?4 AND s.diagnostic=0
        AND s.monotonic_duration_ms>0 AND s.start_wall_time_ms<?6 AND s.end_wall_time_ms>?5 ORDER BY s.id LIMIT 10001`)
      .bind(account,child,part.machine_id,part.local_user_id,from-2000,to+2000).all<Record<string,unknown>>();
    if(facts.results.length>10000)return null;
    const normalized=await normalizeApplicationUsageClock(db,part.machine_id,part.local_user_id,facts.results,from,to);
    const spans=normalized.sort((a,b)=>Number(a.start_wall_time_ms)-Number(b.start_wall_time_ms));
    const ends=new Map<number,number>();
    for(const span of spans){const assignment=Number(span.assignment_version),start=Number(span.start_wall_time_ms);
      if([...ends].some(([other,end])=>other!==assignment&&end>start))return null;
      ends.set(assignment,Math.max(ends.get(assignment)??0,Number(span.end_wall_time_ms)));}
  }
  const date=new Date(from+OFFSET).toISOString().slice(0,10),merged=new Map<string,UsageAccountRow>();let count=0;
  const cutoffs:Array<number|null>=[];let stale=false;
  const subjectClassifications:Record<string,string[]>={};
  for(const part of partitions.results){
    const p=await db.prepare(`SELECT p.manifest_id,p.source_revision,m.manifest_json FROM runtime_application_account_publications_v1 p
      JOIN runtime_application_account_manifests_v1 m ON m.id=p.manifest_id WHERE p.account_id=?1 AND p.child_id=?2
      AND p.machine_id=?3 AND p.local_user_id=?4 AND p.assignment_version=?5 AND p.date=?6`)
      .bind(account,child,part.machine_id,part.local_user_id,part.assignment_version,date)
      .first<{manifest_id:string;source_revision:string;manifest_json:string}>();
    if(!p)return null;
    // A published snapshot is frozen at its cutoff, not at the current live
    // ledger head. New facts mark it as updating; the exact verifier below
    // still rejects invalid facts, policy/correction changes or row hashes.
    stale ||= p.source_revision!==await source(part.machine_id,part.local_user_id);
    const manifest=JSON.parse(p.manifest_json) as UsageAccountManifest;
    if(!manifest.complete)return null;
    // An initialized empty prefix must not replace already known nonzero usage.
    if(manifest.rawFactCount===0&&Number(part.n)>0)return null;
    // Background materialization only: derive category labels from the exact
    // verified scope; ordinary reads use the resulting persistent JSON.
    const verified=await verifyApplicationAccountPublication(db,{id:p.manifest_id,account_id:account,child_id:child,date,
      machine_id:part.machine_id,local_user_id:part.local_user_id,assignment_version:part.assignment_version,
      revision:manifest.revision,manifest_json:p.manifest_json},manifest,now);
    for(const [key,categories] of Object.entries(verified.subjectClassifications))
      subjectClassifications[key]=[...new Set([...(subjectClassifications[key]??[]),...categories])].sort();
    cutoffs.push(manifest.settledThroughMs);
    const chunks=await db.prepare(`SELECT rows_json FROM runtime_application_account_chunks_v1
      WHERE manifest_id=?1 ORDER BY chunk_index LIMIT 100`).bind(p.manifest_id).all<{rows_json:string}>();
    const rows=parseUsageAccountRows(chunks.results.flatMap(c=>JSON.parse(c.rows_json)));
    count+=rows.length;if(count>10000)return null;
    for(const row of rows){const key=JSON.stringify([row.kind,row.hour,row.category,row.subjectKey]),old=merged.get(key);
      if(old)old.duration+=row.duration;else merged.set(key,{...row});}
  }
  return {rows:[...merged.values()],settledThroughMs:cutoffs.every((v):v is number=>v!==null)?Math.min(...cutoffs):null,subjectClassifications,stale};
}
