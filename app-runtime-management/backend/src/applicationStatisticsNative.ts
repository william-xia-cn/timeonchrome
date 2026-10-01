import {parseUsageAccountRows,type UsageAccountRow,type UsageAccountManifest,hashUsageAccountValue} from '@timeonchrome/app-runtime-contracts/usage-account';
import type {StatisticsValue} from './applicationStatistics';
type Filters={machineId?:string;localUserId?:string;platform?:string};
const DAY=86400000,OFFSET=8*3600000;
const dimension=(rows:UsageAccountRow[],kind:string,hour:number|null)=>rows.filter(r=>r.kind===kind&&r.hour===hour);
/** One producer per complete scope/day. Native and legacy are NEVER added together. */
export async function selectNativeApplicationStatistics(db:D1Database,account:string,child:string,from:number,to:number,filters:Filters,
  original:StatisticsValue,source:(machineId:string,user:string)=>Promise<string>):Promise<UsageAccountRow[]|null> {
  if((from+OFFSET)%DAY!==0||to-from!==DAY)return null;
  const legacy=await db.prepare(`SELECT COUNT(*) AS n FROM runtime_usage_segments s JOIN runtime_devices d ON d.id=s.device_id
    WHERE d.account_id=?1 AND d.child_id=?2 AND s.start_at_ms<?4 AND s.end_at_ms>?3
      AND ?5 IS NULL AND ?6 IS NULL AND (?7 IS NULL OR s.platform=?7)`)
    .bind(account,child,from,to,filters.machineId??null,filters.localUserId??null,filters.platform??null).first<{n:number}>();
  if(Number(legacy?.n)>0)return null;
  const partitions=await db.prepare(`SELECT s.machine_id,s.local_user_id,s.assignment_version,COUNT(*) AS n
    FROM runtime_usage_segments_v2 s JOIN runtime_machines_v2 m ON m.id=s.machine_id
    WHERE m.account_id=?1 AND s.child_id=?2 AND s.diagnostic=0 AND COALESCE(s.start_wall_time_ms,s.start_at_ms)<?4
      AND COALESCE(s.end_wall_time_ms,s.end_at_ms)>?3 AND (?5 IS NULL OR s.machine_id=?5)
      AND (?6 IS NULL OR s.local_user_id=?6) AND (?7 IS NULL OR s.platform=?7)
    GROUP BY s.machine_id,s.local_user_id,s.assignment_version LIMIT 101`)
    .bind(account,child,from,to,filters.machineId??null,filters.localUserId??null,filters.platform??null)
    .all<{machine_id:string;local_user_id:string;assignment_version:number;n:number}>();
  if(!partitions.results.length||partitions.results.length>100)return null;
  const date=new Date(from+OFFSET).toISOString().slice(0,10),merged=new Map<string,UsageAccountRow>();let count=0;
  for(const part of partitions.results){
    const p=await db.prepare(`SELECT p.manifest_id,p.source_revision,m.manifest_json FROM runtime_application_account_publications_v1 p
      JOIN runtime_application_account_manifests_v1 m ON m.id=p.manifest_id WHERE p.account_id=?1 AND p.child_id=?2
      AND p.machine_id=?3 AND p.local_user_id=?4 AND p.assignment_version=?5 AND p.date=?6`)
      .bind(account,child,part.machine_id,part.local_user_id,part.assignment_version,date)
      .first<{manifest_id:string;source_revision:string;manifest_json:string}>();
    if(!p||p.source_revision!==await source(part.machine_id,part.local_user_id))return null;
    const manifest=JSON.parse(p.manifest_json) as UsageAccountManifest;
    if(!manifest.complete||manifest.rawFactCount!==Number(part.n))return null;
    const chunks=await db.prepare(`SELECT rows_json FROM runtime_application_account_chunks_v1
      WHERE manifest_id=?1 ORDER BY chunk_index LIMIT 100`).bind(p.manifest_id).all<{rows_json:string}>();
    const rows=parseUsageAccountRows(chunks.results.flatMap(c=>JSON.parse(c.rows_json)));
    count+=rows.length;if(count>10000)return null;
    for(const row of rows){const key=JSON.stringify([row.kind,row.hour,row.category,row.subjectKey]),old=merged.get(key);
      if(old)old.duration+=row.duration;else merged.set(key,{...row});}
  }
  const rows=[...merged.values()];
  // Cross-assignment overlap can differ from sum(partitions): decline, do not guess.
  if(dimension(rows,'total',null)[0]?.duration!==original.totalDurationMs)return null;
  const nativeCategories=dimension(rows,'category',null).map(r=>[r.category,r.duration]).sort();
  const oldCategories=original.categories.map(c=>[c.classification,c.durationMs]).sort();
  if(await hashUsageAccountValue(nativeCategories)!==await hashUsageAccountValue(oldCategories))return null;
  for(let h=0;h<24;h++){
    const b=original.buckets.find(b=>b.startAtMs===from+h*3600000);
    if(dimension(rows,'total',h)[0]?.duration!==(b?.durationMs??0))return null;
    const categories=dimension(rows,'category',h).filter(r=>r.duration>0).map(r=>[r.category,r.duration]).sort();
    if(await hashUsageAccountValue(categories)!==await hashUsageAccountValue((b?.categories??[]).map(c=>[c.classification,c.durationMs]).sort()))return null;
  }
  return rows;
}
