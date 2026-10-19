import {sourceStatisticsDates,projectQuotaBucketsSeconds,readQuotaBucketsCloudResponse} from '@timeonchrome/app-runtime-contracts/source-statistics';
import type {UnifiedChildAccessPolicyV2} from '@timeonchrome/app-runtime-contracts/shared-access';
import type {Env} from '../db/middleware';
import {createOrReuseProfileAccountSnapshotV2,readProfileAccountSnapshotPageV2} from './profileAccountSnapshotsV2';
import {buildQuotaReadModelV2} from '../../../extension/core/quota-read-model-v2.js';
import {getBeijingWeekPeriod} from '../../../extension/core/profile-account-v2.js';
import {validateQuotaBucketsSnapshot,type QuotaBucketsQuery,type QuotaBucketsSnapshot} from '@timeonchrome/app-runtime-contracts/source-statistics';

/** 复用网页已验收账户快照及配额读取器，既有URL只保留鉴权转接。 */
export async function readWebQuotaBuckets(env:Env,childId:string,query:QuotaBucketsQuery,
  excludedDeviceId?:string,now=Date.now()):Promise<QuotaBucketsSnapshot>{
  if(query.source!=='web'||query.scope==='other'&&!excludedDeviceId)throw new Error('SOURCE_STATISTICS_INVALID');
  const snapshots=new Map<string,{deviceAccounts:unknown[];period:ReturnType<typeof getBeijingWeekPeriod>;
    asOf:number;completeness:Record<string,unknown>}>();
  const days:QuotaBucketsSnapshot['days'][number][]=[];
  for(const date of sourceStatisticsDates(query.fromDate,query.toDate)){
    const period=getBeijingWeekPeriod(date);
    if(!snapshots.has(period.weekStart)){
      const head=await createOrReuseProfileAccountSnapshotV2(env,childId,period.weekStart);
      if(head){
        const deviceAccounts:unknown[]=[];let metadata:Awaited<ReturnType<typeof readProfileAccountSnapshotPageV2>>=null;
        for(let page=0;page<Number(head.page_count);page++){
          const value=await readProfileAccountSnapshotPageV2(env,childId,head.id,page);
          if(!value||value.snapshotId!==head.id)throw new Error('SOURCE_STATISTICS_UNAVAILABLE');
          metadata=value;deviceAccounts.push(...value.deviceAccounts);
        }
        if(!metadata)throw new Error('SOURCE_STATISTICS_UNAVAILABLE');
        snapshots.set(period.weekStart,{deviceAccounts,period,asOf:Number(metadata.asOf),completeness:metadata.completeness});
      }
    }
    const snapshot=snapshots.get(period.weekStart);
    const input={date,...period,now,deviceId:query.scope==='other'?excludedDeviceId:null,
      localProjection:{today:{onlineSeconds:0,byQuotaBucket:{},byDomain:{}},weekRestSeconds:0,days:[],complete:true},cloudSnapshot:snapshot};
    const model=buildQuotaReadModelV2(input);
    const complete=Boolean(snapshot&&model.completeness.cloudCoverageComplete);
    days.push({date,bucketsSeconds:{study:model.usage.studySeconds,composite:model.usage.compositeSeconds,rest:model.usage.restSeconds},
      // 账户asOf是读取快照水位，不冒充原账结算截止。
      settledThroughMs:null,complete,reasonCodes:complete?[]:[snapshot?'WEB_QUOTA_USAGE_INCOMPLETE':'WEB_STATISTICS_NOT_AVAILABLE']});
  }
  return validateQuotaBucketsSnapshot({schemaVersion:2,durationUnit:'seconds',source:'web',childId,
    fromDate:query.fromDate,toDate:query.toDate,readAtMs:now,days},{source:'web',childId,fromDate:query.fromDate,toDate:query.toDate});
}

/** Service Binding响应也有明确大小上界，不把未知响应整块装入内存。 */
export async function readSourceStatisticsResponse(response:Response):Promise<unknown>{
  const reader=response.body?.getReader();if(!reader)throw new Error('SOURCE_STATISTICS_UNAVAILABLE');
  const chunks:Uint8Array[]=[];let size=0;
  while(true){const c=await reader.read();if(c.done)break;size+=c.value.byteLength;if(size>65536){await reader.cancel();throw new Error('SOURCE_STATISTICS_RESPONSE_LIMIT');}chunks.push(c.value);}
  const bytes=new Uint8Array(size);let offset=0;for(const c of chunks){bytes.set(c,offset);offset+=c.byteLength;}
  const value=JSON.parse(new TextDecoder().decode(bytes));
  if(!response.ok){
    const candidate=value?.code??value?.error?.code;
    const code=typeof candidate==='string'&&/^(APPLICATION_[A-Z0-9_]{1,80}|SOURCE_STATISTICS_[A-Z0-9_]{1,70}|CHILD_NOT_FOUND)$/.test(candidate)
      ?candidate:'SOURCE_STATISTICS_UNAVAILABLE';
    throw Object.assign(new Error(code),{code,status:[400,404,409,413,429,503].includes(response.status)?response.status:503});
  }
  return value;
}

/** 家长摘要仅组合现有桶与现行核算；不读取旧贡献或原账。 */
export async function readQuotaManagementState(env:Env&{RUNTIME_COMPUTER_USAGE?:{fetch?(request:Request):Promise<Response>}},
  accountId:string,childId:string,date:string,policy:UnifiedChildAccessPolicyV2,now=Date.now()){
  try{sourceStatisticsDates(date,date);}catch{throw Error('INVALID_DATE');}
  const fromDate=getBeijingWeekPeriod(date).weekStart;
  const dates=sourceStatisticsDates(fromDate,date);
  const query={schemaVersion:2 as const,scope:'all' as const,fromDate,toDate:date};
  const failures=new Set<string>();
  const failure=(kind:'WEB'|'APPLICATION',error:unknown)=>{
    const code=error instanceof Error?error.message:'';
    failures.add(/^(WEB|APPLICATION|SOURCE_STATISTICS)_[A-Z0-9_]{1,80}$/.test(code)?code:`${kind}_SOURCE_UNAVAILABLE`);
    return null;
  };
  const [web,application]=await Promise.all([
    readWebQuotaBuckets(env,childId,{...query,source:'web'},undefined,now).catch(error=>failure('WEB',error)),
    (async()=>{
      if(!env.RUNTIME_COMPUTER_USAGE?.fetch)throw Error('APPLICATION_SERVICE_UNAVAILABLE');
      const response=await env.RUNTIME_COMPUTER_USAGE.fetch(new Request('https://runtime-capability/getApplicationSourceStatistics',{
        method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({accountId,childId,query:{...query,source:'application'}})}));
      return readQuotaBucketsCloudResponse(await readSourceStatisticsResponse(response),{source:'application',childId,fromDate,toDate:date}).snapshot;
    })().catch(error=>failure('APPLICATION',error)),
  ]);
  const days=dates.map(day=>projectQuotaBucketsSeconds(policy,day,web,application));
  const restUsedSeconds=days.reduce((sum,day)=>sum+day.usedSeconds.rest,0);
  if(!Number.isSafeInteger(restUsedSeconds))throw Error('SOURCE_STATISTICS_INVALID');
  const reasonCodes=[...new Set([...failures,...days.flatMap(day=>day.reasonCodes)])].sort();
  const source=(snapshot:QuotaBucketsSnapshot|null)=>({available:snapshot!==null,
    complete:snapshot?.days.every(day=>day.complete)??false,readAtMs:snapshot?.readAtMs??null,
    settledThroughMs:snapshot?.days.length&&snapshot.days.every(day=>day.settledThroughMs!==null)
      ?Math.min(...snapshot.days.map(day=>day.settledThroughMs!)):null});
  return {schemaVersion:2 as const,durationUnit:'seconds' as const,date,fromDate,toDate:date,readAtMs:now,
    policyRevision:policy.revision,stage:policy.stage,complete:days.every(day=>day.complete),reasonCodes,
    day:days[days.length-1]!,week:{fromDate,toDate:date,complete:days.every(day=>day.complete),reasonCodes,
      restUsedSeconds,restRemainingSeconds:policy.weeklyRestMinutes===null?null:Math.max(0,policy.weeklyRestMinutes*60-restUsedSeconds)},
    web:source(web),application:source(application)};
}
