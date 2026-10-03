import { HttpError } from './http';

export const APPLICATION_CLOCK_MARGIN_MS = 2000;
const MIN_WALL = -62135596800000, MAX_WALL = 253402300799999;
const fail = (code:string):never => { throw new HttpError(409,code,code); };
/** Service's existing monotonic mapping. The margin validates clocks, never statistics. */
export async function mapApplicationUsageClock(db:D1Database, machine:string, user:string,
    rows:Record<string,unknown>[]) {
  const epochs=new Map<string,Record<string,unknown>[]>();
  for(const row of rows){
    const key=JSON.stringify([row.runtime_session_id,row.clock_epoch_id]);
    const group=epochs.get(key)??[];group.push(row);epochs.set(key,group);
  }
  if(epochs.size>256)fail('APPLICATION_ACCOUNT_SOURCE_LIMIT');
  const normalized:Record<string,unknown>[]=[];
  for(const group of epochs.values()){
    const first=group[0]!;
    // The same user/session/epoch's earliest valid anchor, across dates and assignments.
    const anchor=await db.prepare(`SELECT id,start_wall_time_ms,start_monotonic_time_ms FROM runtime_usage_segments_v2
      WHERE machine_id=?1 AND local_user_id=?2 AND runtime_session_id=?3 AND clock_epoch_id=?4 AND diagnostic=0
        AND monotonic_duration_ms>0 AND end_monotonic_time_ms-start_monotonic_time_ms=monotonic_duration_ms
        AND end_wall_time_ms>=start_wall_time_ms
        AND abs(end_wall_time_ms-start_wall_time_ms-monotonic_duration_ms)<=2000
      ORDER BY start_monotonic_time_ms,id LIMIT 1`).bind(machine,user,first.runtime_session_id,first.clock_epoch_id)
      .first<{id:string;start_wall_time_ms:number;start_monotonic_time_ms:number}>();
    if(!anchor)throw new HttpError(409,'APPLICATION_ACCOUNT_CLOCK_ANCHOR_MISSING','Application clock anchor is missing.');
    for(const row of group){
      const wallStart=Number(row.start_wall_time_ms),wallEnd=Number(row.end_wall_time_ms);
      const monoStart=Number(row.start_monotonic_time_ms),monoEnd=Number(row.end_monotonic_time_ms),duration=Number(row.monotonic_duration_ms);
      const start=Number(anchor.start_wall_time_ms)+monoStart-Number(anchor.start_monotonic_time_ms),end=start+duration;
      if(![wallStart,wallEnd,monoStart,monoEnd,duration,start,end].every(Number.isSafeInteger)
          ||duration<=0||wallEnd<wallStart||monoEnd-monoStart!==duration||wallStart<MIN_WALL||wallEnd>MAX_WALL
          ||Math.abs(wallEnd-wallStart-duration)>APPLICATION_CLOCK_MARGIN_MS
          ||start<MIN_WALL||end>MAX_WALL||Math.abs(start-wallStart)>APPLICATION_CLOCK_MARGIN_MS
          ||Math.abs(end-wallEnd)>APPLICATION_CLOCK_MARGIN_MS)fail('APPLICATION_ACCOUNT_CLOCK_AMBIGUOUS');
      normalized.push({...row,start_wall_time_ms:start,end_wall_time_ms:end});
    }
  }
  return normalized;
}
/** Existing day/window clipping; mapping and clock validation remain identical. */
export async function normalizeApplicationUsageClock(db:D1Database, machine:string, user:string,
    rows:Record<string,unknown>[], from:number, to:number):Promise<Record<string,unknown>[]> {
  return (await mapApplicationUsageClock(db,machine,user,rows))
    .filter(row=>Number(row.start_wall_time_ms)<to&&Number(row.end_wall_time_ms)>from)
    .map(row=>({...row,start_wall_time_ms:Math.max(from,Number(row.start_wall_time_ms)),
      end_wall_time_ms:Math.min(to,Number(row.end_wall_time_ms))}));
}
