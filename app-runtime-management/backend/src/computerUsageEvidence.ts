import type { ComputerApplicationSource } from '@timeonchrome/app-runtime-contracts/computer-usage';
import { getAppPolicy } from './appPolicy';
import { sha256Hex } from './crypto';
import { HttpError } from './http';
import { readNativeApplicationStatisticsRangeSeconds } from './applicationStatisticsNative';

/** 电脑汇总只消费当前持久秒统计，不读取旧贡献或原账重算。 */
export async function readComputerApplicationEvidence(db:D1Database,accountId:string,childId:string,
  fromDate:string,toDate:string,_defer?:(work:Promise<unknown>)=>void):Promise<ComputerApplicationSource[]> {
  const fromMs=Date.parse(`${fromDate}T00:00:00+08:00`);
  const toMs=Date.parse(`${toDate}T00:00:00+08:00`)+86400000;
  const machines=await db.prepare(`SELECT DISTINCT m.id,m.display_name FROM runtime_machines_v2 m
    JOIN runtime_application_account_publications_v1 p ON p.machine_id=m.id
    WHERE m.account_id=?1 AND p.account_id=?1 AND p.child_id=?2 AND p.date>=?3 AND p.date<=?4
    ORDER BY m.id LIMIT 101`).bind(accountId,childId,fromDate,toDate).all<{id:string;display_name:string|null}>();
  if(machines.results.length>100)throw new HttpError(422,'COMPUTER_USAGE_SOURCE_LIMIT','电脑来源过多。');
  const policy=await getAppPolicy(db,accountId,childId);
  const sources:ComputerApplicationSource[]=[];
  for(const machine of machines.results){
    const snapshot=await readNativeApplicationStatisticsRangeSeconds(db,accountId,childId,fromMs,toMs,{machineId:machine.id,fixedIdentityOnly:true});
    if(snapshot.availableTotalDuration===null)continue;
    const computerKey=await sha256Hex(`${accountId}\ncomputer\n${machine.id}`);
    const dates=snapshot.days.filter(day=>day.totalDuration!==null);
    sources.push({key:`app:${computerKey}`,computerKey,computerName:machine.display_name||'电脑',
      revision:snapshot.revision,associationVersion:policy.productIdentityProjection?.version??'unavailable',
      correctionRevision:snapshot.revision,settledAtMs:dates.length&&dates.every(day=>day.settledThroughMs!==null)
        ?Math.min(...dates.map(day=>day.settledThroughMs!)):null,
      complete:false,statisticsComplete:snapshot.complete,reasons:['APPLICATION_TIMELINE_NOT_AVAILABLE',
        ...new Set(snapshot.days.flatMap(day=>day.reasonCodes))],totalMs:snapshot.availableTotalDuration*1000,
      categoriesMs:Object.fromEntries(snapshot.categories.map(row=>[row.category!,row.duration*1000])),
      chromeIncludedInApplicationMs:snapshot.applicationUsage
        ?(snapshot.availableTotalDuration-snapshot.applicationUsage.nonSpecialTotal)*1000:null,intervals:[]});
  }
  return sources;
}
