import type { queryAppUsage } from './appPolicy';
import { hashUsageAccountValue } from '@timeonchrome/app-runtime-contracts/usage-account';

const OFFSET=8*3600000;
type Filters=Parameters<typeof queryAppUsage>[5];
const date=(time:number)=>new Date(time+OFFSET).toISOString().slice(0,10);

/** Bounded source watermark; never loads raw payloads into an ordinary GET. */
function sourceStatements(db:D1Database,account:string,child:string,from:number,to:number,filters:Filters) {
  const values:unknown[]=[account,child,from,to];let suffix='';
  for(const [field,column] of [['machineId','machine_id'],['localUserId','local_user_id'],['platform','platform']] as const)
    if(filters[field]){values.push(filters[field]);suffix+=` AND s.${column}=?${values.length}`;}
  const query=(table:string,condition:string)=>db.prepare(`SELECT COUNT(*) AS n,MAX(s.uploaded_at_ms) AS latest FROM ${table} s
    JOIN runtime_machines_v2 m ON m.id=s.machine_id WHERE m.account_id=?1 AND s.child_id=?2 AND ${condition}${suffix}`).bind(...values);
  return [
    query('runtime_usage_segments_v2','s.diagnostic=0 AND min(COALESCE(s.start_wall_time_ms,s.start_at_ms),COALESCE(s.end_wall_time_ms,s.end_at_ms))<?4+2000 AND max(COALESCE(s.end_wall_time_ms,s.end_at_ms),COALESCE(s.start_wall_time_ms,s.start_at_ms))>?3-2000'),
    query('runtime_media_segments_v2','s.start_wall_time_ms<?4 AND s.end_wall_time_ms>?3'),
    db.prepare(`SELECT MAX(version) AS version FROM runtime_child_app_policy_versions_v1 WHERE account_id=?1 AND child_id=?2`).bind(account,child),
    db.prepare(`SELECT COUNT(*) AS n,MAX(s.uploaded_at_ms) AS latest FROM runtime_usage_segments s
      JOIN runtime_devices d ON d.id=s.device_id WHERE d.account_id=?1 AND d.child_id=?2
      AND s.start_at_ms<?4 AND s.end_at_ms>?3 AND ?5 IS NULL AND ?6 IS NULL AND (?7 IS NULL OR s.platform=?7)`)
      .bind(account,child,from,to,filters.machineId??null,filters.localUserId??null,filters.platform??null),
    // Only the stable anchors of this day's lanes: new activity on unrelated
    // days must not invalidate every historical publication.
    db.prepare(`WITH lanes AS (SELECT DISTINCT s.machine_id,s.local_user_id,s.runtime_session_id,s.clock_epoch_id
      FROM runtime_usage_segments_v2 s JOIN runtime_machines_v2 m ON m.id=s.machine_id
      WHERE m.account_id=?1 AND s.child_id=?2 AND s.diagnostic=0 AND s.monotonic_duration_ms>0
        AND s.start_wall_time_ms<?4+2000 AND s.end_wall_time_ms>?3-2000
        AND (?5 IS NULL OR s.machine_id=?5) AND (?6 IS NULL OR s.local_user_id=?6) AND (?7 IS NULL OR s.platform=?7)
      ORDER BY s.machine_id,s.local_user_id,s.runtime_session_id,s.clock_epoch_id LIMIT 257)
      , owners AS (SELECT DISTINCT machine_id,local_user_id FROM lanes)
      , eligible AS MATERIALIZED (SELECT anchor.machine_id,anchor.local_user_id,anchor.runtime_session_id,
          anchor.clock_epoch_id,anchor.id,anchor.start_monotonic_time_ms
        FROM owners o JOIN runtime_usage_segments_v2 anchor ON anchor.machine_id=o.machine_id AND anchor.local_user_id=o.local_user_id
        WHERE anchor.diagnostic=0 AND anchor.monotonic_duration_ms>0 AND anchor.end_wall_time_ms>=anchor.start_wall_time_ms
          AND anchor.end_monotonic_time_ms-anchor.start_monotonic_time_ms=anchor.monotonic_duration_ms
          AND abs(anchor.end_wall_time_ms-anchor.start_wall_time_ms-anchor.monotonic_duration_ms)<=2000)
      , anchors AS MATERIALIZED (SELECT l.*,(SELECT anchor.id
        FROM eligible anchor WHERE anchor.machine_id=l.machine_id AND anchor.local_user_id=l.local_user_id
          AND anchor.runtime_session_id=l.runtime_session_id AND anchor.clock_epoch_id=l.clock_epoch_id
        ORDER BY anchor.start_monotonic_time_ms,anchor.id LIMIT 1) AS anchor_id FROM lanes l)
      SELECT a.id,a.start_wall_time_ms,a.start_monotonic_time_ms,a.uploaded_at_ms FROM anchors l
      LEFT JOIN runtime_usage_segments_v2 a ON a.machine_id=l.machine_id AND a.local_user_id=l.local_user_id AND a.id=l.anchor_id
      ORDER BY l.machine_id,l.local_user_id,l.runtime_session_id,l.clock_epoch_id`)
      .bind(account,child,from,to,filters.machineId??null,filters.localUserId??null,filters.platform??null),
    db.prepare(`SELECT p.machine_id,p.local_user_id,p.assignment_version,p.revision,p.manifest_id
    FROM runtime_application_account_publications_v1 p JOIN runtime_machines_v2 m ON m.id=p.machine_id
    WHERE p.account_id=?1 AND p.child_id=?2 AND p.date=?3 AND (?4 IS NULL OR p.machine_id=?4)
      AND (?5 IS NULL OR p.local_user_id=?5) AND (?6 IS NULL OR m.platform=?6)
    ORDER BY p.machine_id,p.local_user_id,p.assignment_version LIMIT 101`)
    .bind(account,child,date(from),filters.machineId??null,filters.localUserId??null,filters.platform??null),
  ];
}
/** Same six source queries and hash order, bounded to seven dates per D1 round trip. */
async function sourceRanges(db:D1Database,account:string,child:string,ranges:Array<{from:number;to:number}>,filters:Filters) {
  const results:D1Result[]=[];
  for(let offset=0;offset<ranges.length;offset+=7){
    const statements=ranges.slice(offset,offset+7).flatMap(r=>sourceStatements(db,account,child,r.from,r.to,filters));
    results.push(...await db.batch(statements));
  }
  return Promise.all(ranges.map(async(_,index)=>{
    const heads=results.slice(index*6,index*6+5),publications=results[index*6+5]!;
    return {revision:await hashUsageAccountValue({model:'application-statistics-day-v3-current-week-classification',heads:heads.map(r=>r.results)}),
      rawRows:heads.reduce((sum,result)=>sum+Number((result.results[0] as {n?:number})?.n??0),0),
      publicationRevision:await hashUsageAccountValue(publications.results)};
  }));
}
export async function applicationStatisticsSource(db:D1Database,account:string,child:string,from:number,to:number,filters:Filters) {
  return (await sourceRanges(db,account,child,[{from,to}],filters))[0]!;
}
