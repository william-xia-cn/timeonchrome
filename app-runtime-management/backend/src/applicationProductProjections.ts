import {readNativeApplicationStatisticsRangeSeconds} from './applicationStatisticsNative';

/** 两套云端页面共用；累计已物化来源，不在读取时识别或重算实例并集。 */
export async function readApplicationIdentityUsage(db:D1Database,account:string,child:string,fromMs:number,toMs:number,
  filters:{machineId?:string;localUserId?:string;platform?:string}={}) {
  const fixed=await readNativeApplicationStatisticsRangeSeconds(db,account,child,fromMs,toMs,{...filters,fixedIdentityOnly:true});
  const reasons=[...new Set(fixed.days.flatMap(day=>day.reasonCodes))].sort();
  const date=(ms:number)=>new Date(ms+28800000).toISOString().slice(0,10);
  return {model:'program-instance-v1' as const,source:'application' as const,childId:child,
    fromDate:date(fromMs),toDate:date(toMs-1),durationUnit:'seconds' as const,
    complete:fixed.complete,totalDuration:fixed.totalDuration,availableTotalDuration:fixed.availableTotalDuration,
    applicationUsage:fixed.applicationUsage,
    // 新上传的是固定应用身份统计，不把应用管理target伪装成另一份程序实例明细。
    instances:[],
    days:fixed.days,categories:fixed.categories.map(row=>({classification:row.category!,duration:row.duration})),
    applications:fixed.products.map(row=>({subjectKey:row.subjectKey!,target:row.target,
      displayName:row.displayName!,duration:row.duration,classifications:row.classifications!,identified:true}))
      .sort((a,b)=>b.duration-a.duration||a.subjectKey.localeCompare(b.subjectKey)),
    buckets:fixed.days.flatMap(day=>toMs-fromMs===86400000?Array.from({length:24},(_,hour)=>({
      startAtMs:Date.parse(`${day.date}T00:00:00+08:00`)+hour*3600000,
      duration:day.hours.find(row=>row.kind==='total'&&row.hour===hour)?.duration??null})):
      [{startAtMs:Date.parse(`${day.date}T00:00:00+08:00`),duration:day.totalDuration}]),
    productStatus:{complete:fixed.complete,availableSources:fixed.days.filter(day=>day.totalDuration!==null).length,
      totalSources:fixed.days.length,catalogVersion:null,reasonCodes:reasons},
    statistics:{producer:'native',revision:fixed.revision,stale:!fixed.complete,
      settledThroughByDate:fixed.days.map(day=>({date:day.date,settledThroughMs:day.settledThroughMs})),
      missingDates:fixed.days.filter(day=>day.totalDuration===null).map(day=>day.date)},revision:fixed.revision};
}
