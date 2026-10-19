import { WorkerEntrypoint } from 'cloudflare:workers';
import { readComputerApplicationEvidence } from './computerUsageEvidence';
import { HttpError, jsonResponse, readJsonBody } from './http';
import { sha256Hex } from './crypto';
import { readNativeApplicationStatisticsRangeSeconds } from './applicationStatisticsNative';
import { verifySharedWebSourceAssignment, verifySharedWebSourceScope, resolveSharedWebSourceScope } from './sharedWebSourceBinding';
import { validateQuotaBucketsQuery,validateQuotaBucketsSnapshot } from '@timeonchrome/app-runtime-contracts/source-statistics';
import { readApplicationQuotaBuckets,readApplicationQuotaBucketsSources } from './sourceStatistics';
import { readApplicationIdentityUsage } from './applicationProductProjections';

/** Capability-bound entrypoint; this is never exposed by the public fetch router. */
export class RuntimeComputerUsageService extends WorkerEntrypoint<Env> {
  private async requireChildScope(accountId:string,childId:string):Promise<void> {
    // Guardian owns the child lifecycle; v2 never populates the legacy registry.
    let owned:boolean;
    try {
      const response=await this.env.GUARDIAN_COMPUTER_USAGE.fetch(new Request('https://guardian-capability/verifyChildAccess',{
        method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({accountId,childId})
      }));
      const value=await response.json() as {owned?:unknown};
      if(!response.ok||typeof value.owned!=='boolean')throw new Error('scope unavailable');
      owned=value.owned;
    }catch{throw new HttpError(503,'APPLICATION_SCOPE_UNAVAILABLE','Child ownership verification is unavailable.');}
    if(!owned)throw new HttpError(404,'CHILD_NOT_FOUND','Child was not found.');
  }
  // Only this named service capability exposes the transport, never the public
  // default fetch router. A bounded JSON response owns its request lifetime.
  async fetch(request:Request):Promise<Response> {
    const operation=new URL(request.url).pathname.slice(1);
    if(request.method!=='POST'||!['applicationEvidenceRevision','readApplicationEvidence','getApplicationUsage','getApplicationIdentityUsage',
      'verifySharedWebSourceAssignment','verifySharedWebSourceScope','getApplicationSourceStatistics'].includes(operation))
      return jsonResponse({code:'METHOD_NOT_ALLOWED'},{status:405});
    try {
      const input=await readJsonBody(request,2048) as Record<string,unknown>;
      if(operation==='verifySharedWebSourceAssignment')return jsonResponse({owned:await verifySharedWebSourceAssignment(this.env.RUNTIME_DB,input)});
      if(operation==='verifySharedWebSourceScope')return jsonResponse({owned:await verifySharedWebSourceScope(this.env.RUNTIME_DB,input)});
      if(operation==='getApplicationSourceStatistics') {
        if(typeof input.accountId!=='string'||typeof input.childId!=='string')throw new HttpError(400,'INVALID_SCOPE','统计范围无效。');
        let query;
        try{query=validateQuotaBucketsQuery(input.query);}
        catch{throw new HttpError(400,'SOURCE_STATISTICS_INVALID','统计查询无效。');}
        if(query.source!=='application'||query.scope!=='all')throw new HttpError(400,'INVALID_SCOPE','该内部入口仅提供全应用统计。');
        if(input.includeSources!==undefined&&(input.includeSources!==true||!('schemaVersion' in query)))
          throw new HttpError(400,'INVALID_SCOPE','来源分项仅支持应用配额桶。');
        await this.requireChildScope(input.accountId,input.childId);
        const snapshot=await readApplicationQuotaBuckets(this.env.RUNTIME_DB,input.accountId,input.childId,query);
        if(input.includeSources!==true||!('schemaVersion' in query))return jsonResponse(snapshot);
        let applicationSources=null;
        // Only Guardian's verified selector reaches this capability. Optional
        // attribution must never make the already-authorized aggregate unusable.
        try {
          const selector=input.applicationScope as Record<string,unknown>|undefined;
          const scope={accountId:input.accountId,childId:input.childId,
            applicationSourceKey:selector?.applicationSourceKey,assignmentVersion:selector?.assignmentVersion};
          const own=await resolveSharedWebSourceScope(this.env.RUNTIME_DB,scope);
          if(own){
            const sources=await readApplicationQuotaBucketsSources(this.env.RUNTIME_DB,input.accountId,input.childId,query,own);
            const current=await resolveSharedWebSourceScope(this.env.RUNTIME_DB,scope);
            const aggregate=validateQuotaBucketsSnapshot(snapshot,{source:'application',childId:input.childId,
              fromDate:query.fromDate,toDate:query.toDate});
            const consistent=sources.local!==null&&aggregate.days.every((day,index)=>
              (['study','composite','rest'] as const).every(bucket=>day.bucketsSeconds[bucket]
                ===sources.local!.days[index]!.bucketsSeconds[bucket]+(sources.other?.days[index]?.bucketsSeconds[bucket]??0)));
            if(current&&current.machineId===own.machineId&&current.localUserId===own.localUserId
              &&current.assignmentVersion===own.assignmentVersion&&consistent)applicationSources=sources;
          }
        }catch{/* Optional split unavailable; preserve the valid aggregate. */}
        return jsonResponse({snapshot,applicationSources});
      }
      if(!input||['accountId','childId','fromDate','toDate'].some(key=>typeof input[key]!=='string'||String(input[key]).length>200))
        throw new HttpError(400,'INVALID_SCOPE','Read scope is invalid.');
      const args=[input.accountId,input.childId,input.fromDate,input.toDate] as [string,string,string,string];
      if(input.secondsOnly!==undefined&&(operation!=='getApplicationUsage'||typeof input.secondsOnly!=='boolean'))
        throw new HttpError(400,'INVALID_SCOPE','Read mode is invalid.');
      const value=operation==='applicationEvidenceRevision'?await this.applicationEvidenceRevision(...args)
        :operation==='readApplicationEvidence'?await this.readApplicationEvidence(...args)
            :operation==='getApplicationIdentityUsage'?await this.getApplicationIdentityUsage(...args)
            :await this.getApplicationUsage(...args,input.secondsOnly===true);
      return jsonResponse(value);
    }catch(error){
      const message=error instanceof Error?error.message:'';
      const code=error instanceof HttpError?error.code
        :/SQLITE_NOMEM|out of memory/i.test(message)?'APPLICATION_DATABASE_MEMORY_LIMIT'
        :/no such (table|column)/i.test(message)?'APPLICATION_SCHEMA_UNAVAILABLE':'APPLICATION_SOURCE_UNAVAILABLE';
      console.error(JSON.stringify({event:'computer_application_capability_failed',code}));
      return jsonResponse({code},{status:error instanceof HttpError?error.status:503});
    }
  }
  async getApplicationIdentityUsage(accountId:string,childId:string,fromDate:string,toDate:string) {
    await this.requireChildScope(accountId,childId);
    const from=Date.parse(`${fromDate}T00:00:00+08:00`),to=Date.parse(`${toDate}T00:00:00+08:00`)+86400000;
    if(!/^\d{4}-\d{2}-\d{2}$/.test(fromDate)||!/^\d{4}-\d{2}-\d{2}$/.test(toDate)
      ||!Number.isSafeInteger(from)||!Number.isSafeInteger(to)
      ||new Date(from+28800000).toISOString().slice(0,10)!==fromDate
      ||new Date(to-86400000+28800000).toISOString().slice(0,10)!==toDate)
      throw new HttpError(400,'INVALID_RANGE','日期范围无效。');
    return readApplicationIdentityUsage(this.env.RUNTIME_DB,accountId,childId,from,to);
  }
  async getApplicationUsage(accountId:string,childId:string,fromDate:string,toDate:string,secondsOnly=false) {
    await this.requireChildScope(accountId,childId);
    const from=Date.parse(`${fromDate}T00:00:00+08:00`),to=Date.parse(`${toDate}T00:00:00+08:00`)+86400000;
    if(!/^\d{4}-\d{2}-\d{2}$/.test(fromDate)||!/^\d{4}-\d{2}-\d{2}$/.test(toDate)||!Number.isFinite(from)||!Number.isFinite(to)||to<=from||to-from>7*86400000
      ||new Date(from+8*3600000).toISOString().slice(0,10)!==fromDate||new Date(to-86400000+8*3600000).toISOString().slice(0,10)!==toDate)throw new HttpError(400,'INVALID_RANGE','日期范围最多七天。');
    const seconds=await readNativeApplicationStatisticsRangeSeconds(this.env.RUNTIME_DB,accountId,childId,from,to,
      {emptyAsZero:true,fixedIdentityOnly:true});
    {
      const snapshot={source:'application',fromDate,toDate,durationUnit:'seconds',
      complete:seconds.complete,totalDuration:seconds.totalDuration,availableTotalDuration:seconds.availableTotalDuration,
      days:seconds.days,
      applicationUsage:seconds.applicationUsage,
      categories:seconds.categories.map(row=>({classification:row.category,duration:row.duration})),
      applications:seconds.products.map(row=>({displayName:row.displayName,duration:row.duration,classifications:row.classifications})),
      buckets:seconds.days.flatMap(day=>fromDate===toDate?day.hours.filter(row=>row.kind==='total').map(row=>({
        startAtMs:Date.parse(`${day.date}T00:00:00+08:00`)+row.hour!*3600000,duration:row.duration}))
        :[{startAtMs:Date.parse(`${day.date}T00:00:00+08:00`),duration:day.totalDuration}]),
      statistics:{producer:'native',revision:seconds.revision,stale:!seconds.complete,
        settledThroughByDate:seconds.days.map(day=>({date:day.date,settledThroughMs:day.settledThroughMs})),
        missingDates:seconds.days.filter(day=>!day.complete).map(day=>day.date)}};
      if(secondsOnly)return snapshot;
      // Wire compatibility only: preserve old consumers' field names without
      // rebuilding the ledger or keeping a second persisted statistics model.
      const milliseconds=(duration:number|null)=>duration===null?null:duration*1000;
      return {source:'application',fromDate,toDate,durationUnit:'milliseconds',
        complete:snapshot.complete,days:snapshot.days,totalDurationMs:milliseconds(snapshot.totalDuration),
        availableTotalDurationMs:milliseconds(snapshot.availableTotalDuration),statistics:snapshot.statistics,
        categories:snapshot.categories.map(({classification,duration})=>({classification,durationMs:milliseconds(duration)})),
        applications:snapshot.applications.map(({displayName,classifications,duration})=>({displayName,classifications,
          classification:classifications?.length===1?classifications[0]:'historicalUnknown',durationMs:milliseconds(duration)})),
        buckets:snapshot.buckets.map(({startAtMs,duration})=>({startAtMs,durationMs:milliseconds(duration)}))};
    }
  }

  async applicationEvidenceRevision(accountId:string,childId:string,fromDate:string,toDate:string) {
    await this.requireChildScope(accountId,childId);
    const from=Date.parse(`${fromDate}T00:00:00+08:00`),to=Date.parse(`${toDate}T00:00:00+08:00`)+86400000;
    if(!/^\d{4}-\d{2}-\d{2}$/.test(fromDate)||!/^\d{4}-\d{2}-\d{2}$/.test(toDate)||!Number.isFinite(from)||!Number.isFinite(to)||to<=from||to-from>7*86400000
      ||new Date(from+8*3600000).toISOString().slice(0,10)!==fromDate||new Date(to-86400000+8*3600000).toISOString().slice(0,10)!==toDate)
      throw new HttpError(400,'INVALID_RANGE','日期范围最多七天。');
    const current=await readNativeApplicationStatisticsRangeSeconds(this.env.RUNTIME_DB,accountId,childId,from,to,{fixedIdentityOnly:true});
    return sha256Hex(JSON.stringify({model:'application-current-seconds',revision:current.revision}));
  }

  async readApplicationEvidence(accountId:string,childId:string,fromDate:string,toDate:string) {
    await this.requireChildScope(accountId,childId);
    const from=Date.parse(`${fromDate}T00:00:00+08:00`),to=Date.parse(`${toDate}T00:00:00+08:00`);
    if(!/^\d{4}-\d{2}-\d{2}$/.test(fromDate)||!/^\d{4}-\d{2}-\d{2}$/.test(toDate)
      ||!Number.isFinite(from)||!Number.isFinite(to)||to<from||to-from>6*86400000
      ||new Date(from+8*3600000).toISOString().slice(0,10)!==fromDate||new Date(to+8*3600000).toISOString().slice(0,10)!==toDate)
      throw new HttpError(400,'INVALID_RANGE','日期范围最多七天。');
    return readComputerApplicationEvidence(this.env.RUNTIME_DB,accountId,childId,fromDate,toDate,work=>this.ctx.waitUntil(work));
  }
}
