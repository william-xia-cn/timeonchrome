import { queryAppUsage } from './appPolicy';
import { sha256Hex } from './crypto';

type Filters = Parameters<typeof queryAppUsage>[5];
const DAY = 86_400_000;
const MAX_BYTES = 2_000_000;

// Only immutable source metadata is read here. The authority still calculates
// every field, including quota and corrections, on a cache miss.
export async function applicationUsageRevision(database:D1Database,accountId:string,childId:string,fromMs:number,toMs:number,filters:Filters) {
  const shifted = new Date(fromMs + 8 * 3_600_000);
  const dayStart = Math.floor((fromMs + 8 * 3_600_000) / DAY) * DAY - 8 * 3_600_000;
  const weekStart = dayStart - ((shifted.getUTCDay() + 6) % 7) * DAY;
  const values:unknown[] = [accountId,childId,Math.min(fromMs,weekStart),Math.max(toMs,weekStart+7*DAY)];
  let filter='';
  for(const [field,column] of [['machineId','machine_id'],['localUserId','local_user_id'],['platform','platform']] as const) {
    if(filters[field]){values.push(filters[field]);filter+=` AND s.${column}=?${values.length}`;}
  }
  const source = (table:string,time:string,extra='')=>database.prepare(`SELECT COUNT(*) AS count,MAX(s.uploaded_at_ms) AS latest
    FROM ${table} s JOIN runtime_machines_v2 m ON m.id=s.machine_id
    WHERE m.account_id=?1 AND s.child_id=?2 AND ${time}${extra}${filter}`).bind(...values);
  const statements=[
    source('runtime_usage_segments_v2','(COALESCE(s.start_wall_time_ms,s.start_at_ms)<?4 AND COALESCE(s.end_wall_time_ms,s.end_at_ms)>?3)',' AND s.diagnostic=0'),
    source('runtime_media_segments_v2','s.start_wall_time_ms<?4 AND s.end_wall_time_ms>?3'),
    database.prepare('SELECT MAX(version) AS version FROM runtime_child_app_policy_versions_v1 WHERE account_id=?1 AND child_id=?2').bind(accountId,childId),
  ];
  if(!filters.machineId&&!filters.localUserId)statements.push(database.prepare(`SELECT COUNT(*) AS count,MAX(s.uploaded_at_ms) AS latest
    FROM runtime_usage_segments s JOIN runtime_devices d ON d.id=s.device_id WHERE d.account_id=?1 AND d.child_id=?2
    AND s.start_at_ms<?4 AND s.end_at_ms>?3 AND (?5 IS NULL OR s.platform=?5)`)
    .bind(accountId,childId,values[2],values[3],filters.platform??null));
  const results=await database.batch(statements);
  return sha256Hex(JSON.stringify({model:'original-app-usage-cache-v1',accountId,childId,fromMs,toMs,filters,heads:results.map(result=>result.results)}));
}

/** Caller MUST verify ownership before lookup. No public/CDN response caching. */
export async function readCachedApplicationUsage(database:D1Database,accountId:string,childId:string,fromMs:number,toMs:number,filters:Filters,
  cache?:Cache,read:typeof queryAppUsage=queryAppUsage):Promise<{value:unknown;cacheStatus:'hit'|'miss'|'bypass'}> {
  let revision:string;
  try{cache??=await caches.open('application-authority-v1');revision=await applicationUsageRevision(database,accountId,childId,fromMs,toMs,filters);}
  catch{return {value:await read(database,accountId,childId,fromMs,toMs,filters),cacheStatus:'bypass'};}
  const key=new Request(`https://application-read-cache.invalid/${revision}`);
  try {
    const response=await cache.match(key);
    if(response&&Number(response.headers.get('content-length'))<=MAX_BYTES)return {value:await response.json(),cacheStatus:'hit'};
  }catch{ /* Cache failures cannot make the authority unavailable. */ }
  const value=await read(database,accountId,childId,fromMs,toMs,filters);
  try {
    const body=JSON.stringify(value),size=new TextEncoder().encode(body).byteLength;
    if(size<=MAX_BYTES&&await applicationUsageRevision(database,accountId,childId,fromMs,toMs,filters)===revision)
      await cache.put(key,new Response(body,{headers:{'content-type':'application/json','content-length':String(size),'cache-control':'max-age=300'}}));
  }catch{ /* Successful reads remain valid if metadata/cache persistence fails. */ }
  return {value,cacheStatus:'miss'};
}
