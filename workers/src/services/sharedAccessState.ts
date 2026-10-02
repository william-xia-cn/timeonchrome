import { projectSharedQuotaDay, type SharedQuotaContributionV1, type UnifiedChildAccessPolicyV1 } from '@timeonchrome/app-runtime-contracts/shared-access';
import type { Env } from '../db/middleware';
import { readManifestAccountV2 } from './profileAccountsV2';
import { projectCompositeDailyRows, readCompositeCorrections } from './compositePageCorrections';
import { applyCorrectionsToV1StatsRows, listUsageAccountingCorrections } from './usageAccountingCorrections';

type RuntimeQuotaRead = { fetch?(request:Request):Promise<Response> };
export interface SharedAccessStateEnv extends Env { RUNTIME_COMPUTER_USAGE?: RuntimeQuotaRead }
type BucketTotals = {study:number;composite:number;rest:number};
const emptyBuckets=():BucketTotals=>({study:0,composite:0,rest:0});
const unavailableWeb=(reasonCode:string)=>({contributions:[] as SharedQuotaContributionV1[],complete:false,
  expectedScopeCount:0,availableScopeCount:0,reasonCodes:[reasonCode],visibleBucketsMs:emptyBuckets()});
const dayMs=86_400_000;
const sha=async(value:string)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))),byte=>byte.toString(16).padStart(2,'0')).join('');

/** Sums only already-settled active rows. `other` and blocked never consume a shared bucket. */
export function quotaBucketsFromRows(rows:readonly Record<string,unknown>[],bucketField:'quotaBucket'|'quota_bucket',durationField:'durationSeconds'|'duration_seconds'):BucketTotals {
  const totals=emptyBuckets();
  for(const row of rows) {
    if(row.channel!=='active')continue;
    const duration=Number(row[durationField]);
    if(!Number.isSafeInteger(duration)||duration<0)throw new Error('SHARED_ACCESS_INVALID_SOURCE_DURATION');
    const raw=String(row[bucketField]??'');
    const bucket=raw==='study'||raw==='composite'||raw==='rest'?raw:null;
    if(bucket)totals[bucket]+=duration;
    if(!Object.values(totals).every(Number.isSafeInteger))throw new Error('SHARED_ACCESS_SOURCE_OVERFLOW');
  }
  return totals;
}

function mapLegacyBucket(row:Record<string,unknown>):string {
  const value=String(row.quota_bucket??row.mode??'');
  if(value==='restricted')return 'rest';
  if(value==='pending_composite'||value==='unclassified')return 'composite';
  return value;
}

async function readWebContributions(env:SharedAccessStateEnv,accountId:string,childId:string,date:string,policy:UnifiedChildAccessPolicyV1) {
  const devices=await env.DB.prepare(`SELECT id,device_name FROM devices WHERE profile_id=? AND COALESCE(status,'bound')='bound' ORDER BY id LIMIT 101`)
    .bind(childId).all<{id:string;device_name:string}>();
  if(devices.results.length>100)throw new Error('SHARED_ACCESS_SOURCE_LIMIT');
  const contributions:SharedQuotaContributionV1[]=[];
  const reasons=new Set<string>();
  const visibleBuckets:BucketTotals=emptyBuckets();
  for(const device of devices.results) {
    const sourceKey=`web:${await sha(`${accountId}\n${device.id}`)}`;
    const head=await env.DB.prepare(`SELECT manifest_id FROM device_account_heads_v2 WHERE profile_id=? AND device_id=? AND date=?`)
      .bind(childId,device.id,date).first<{manifest_id:string}>();
    if(head) {
      try {
        const account=await readManifestAccountV2(env,head.manifest_id);
        if(!account||account.profileId!==childId||account.deviceId!==device.id||account.date!==date)
          throw new Error('WEB_ACCOUNT_SCOPE_CONFLICT');
        const corrections=await readCompositeCorrections(env.DB.withSession('first-primary'),childId,device.id,date,account.generatedAt);
        const rows=projectCompositeDailyRows(account,corrections.items).filter(row=>row.channel==='active');
        const seconds=quotaBucketsFromRows(rows as Record<string,unknown>[],'quotaBucket','durationSeconds');
        for(const bucket of ['study','composite','rest'] as const)visibleBuckets[bucket]+=seconds[bucket]*1000;
        const current=await env.DB.prepare(`SELECT manifest_id FROM device_account_heads_v2 WHERE profile_id=? AND device_id=? AND date=?`)
          .bind(childId,device.id,date).first<{manifest_id:string}>();
        const complete=account.complete&&account.lossCount===0&&current?.manifest_id===head.manifest_id;
        if(!complete)reasons.add(current?.manifest_id===head.manifest_id?'WEB_ACCOUNT_INCOMPLETE':'WEB_SOURCE_VERSION_CHANGED');
        contributions.push({schemaVersion:1,source:'web',sourceKey,date,revision:`${account.revision}:${account.statsHash}`,
          statisticsRevision:account.statsHash,correctionRevision:corrections.revision,policyRevision:policy.revision,
          settledAtMs:account.generatedAt,complete,reasonCodes:complete?[]:['WEB_ACCOUNT_INCOMPLETE'],
          bucketsMs:{study:seconds.study*1000,composite:seconds.composite*1000,rest:seconds.rest*1000}});
      } catch(error) {
        reasons.add(error instanceof Error&&error.message==='WEB_SOURCE_VERSION_CHANGED'?'WEB_SOURCE_VERSION_CHANGED':'WEB_SOURCE_UNAVAILABLE');
      }
      continue;
    }

    // Legacy aggregates are visible as best-effort diagnostics, never a complete shared source.
    try {
      const target=await env.DB.prepare(`SELECT * FROM target_stats_v1 WHERE profile_id=? AND device_id=? AND date=? ORDER BY target_key,channel,mode,quota_bucket`)
        .bind(childId,device.id,date).all<Record<string,unknown>>();
      const raw=target.results.length?target.results:(await env.DB.prepare(`SELECT * FROM stats_v1 WHERE profile_id=? AND device_id=? AND date=? ORDER BY domain,channel,mode`)
        .bind(childId,device.id,date).all<Record<string,unknown>>()).results;
      if(!raw.length){reasons.add('WEB_ACCOUNT_UNAVAILABLE');continue;}
      const corrections=await listUsageAccountingCorrections(env,childId,{from:date,to:date,deviceId:device.id});
      const rows=applyCorrectionsToV1StatsRows(raw,corrections,target.results.length?'daily_target':'daily_domain')
        .filter(row=>row.channel==='active').map(row=>({...row,quota_bucket:mapLegacyBucket(row)}));
      const seconds=quotaBucketsFromRows(rows,'quota_bucket','duration_seconds');
      for(const bucket of ['study','composite','rest'] as const)visibleBuckets[bucket]+=seconds[bucket]*1000;
      const revision=await sha(JSON.stringify(raw));
      contributions.push({schemaVersion:1,source:'web',sourceKey,date,revision,statisticsRevision:revision,
        correctionRevision:await sha(JSON.stringify(corrections)),policyRevision:policy.revision,settledAtMs:null,
        complete:false,reasonCodes:['HISTORICAL_SOURCE_BEST_EFFORT'],
        bucketsMs:{study:seconds.study*1000,composite:seconds.composite*1000,rest:seconds.rest*1000}});
      reasons.add('HISTORICAL_SOURCE_BEST_EFFORT');
    } catch { reasons.add('WEB_SOURCE_UNAVAILABLE'); }
  }
  if(!devices.results.length)reasons.add('WEB_COVERAGE_MISSING');
  return {contributions,complete:contributions.length===devices.results.length&&reasons.size===0,
    expectedScopeCount:devices.results.length,availableScopeCount:contributions.length,reasonCodes:[...reasons].sort(),visibleBucketsMs:visibleBuckets};
}

async function readApplicationContributions(env:SharedAccessStateEnv,accountId:string,childId:string,date:string) {
  if(!env.RUNTIME_COMPUTER_USAGE?.fetch)return {contributions:[] as SharedQuotaContributionV1[],complete:false,
    expectedScopeCount:0,availableScopeCount:0,reasonCodes:['APPLICATION_SERVICE_UNAVAILABLE'],visibleClassesMs:{}};
  try {
    const response=await env.RUNTIME_COMPUTER_USAGE.fetch(new Request('https://runtime-capability/readApplicationSharedQuotaContributions',{
      method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({accountId,childId,fromDate:date,toDate:date})}));
    const result=await response.json() as {complete?:boolean;expectedScopeCount?:number;verifiedScopeCount?:number;reasonCodes?:string[];
      contributions?:Array<{revision:string;contribution:SharedQuotaContributionV1}>};
    if(!response.ok||!Array.isArray(result.contributions)||!Array.isArray(result.reasonCodes))
      throw new Error('APPLICATION_SHARED_QUOTA_SOURCE_UNAVAILABLE');
    const contributions=result.contributions.map(item=>({...item.contribution,revision:item.revision}));
    const visibleClassesMs:Record<string,number>={};
    for(const contribution of contributions)for(const [kind,value] of Object.entries(contribution.applicationClassesMs??{}))
      visibleClassesMs[kind]=(visibleClassesMs[kind]??0)+value;
    return {contributions,complete:result.complete===true,expectedScopeCount:Number(result.expectedScopeCount??0),
      availableScopeCount:Number(result.verifiedScopeCount??0),reasonCodes:result.reasonCodes,visibleClassesMs};
  } catch {
    return {contributions:[] as SharedQuotaContributionV1[],complete:false,expectedScopeCount:0,availableScopeCount:0,
      reasonCodes:['APPLICATION_SHARED_QUOTA_SOURCE_UNAVAILABLE'],visibleClassesMs:{}};
  }
}

/** Cloud-authoritative Child/day projection; partial values remain diagnostic and never pass as complete. */
async function readSharedAccessDayProjection(env:SharedAccessStateEnv,accountId:string,childId:string,date:string,
  policy:UnifiedChildAccessPolicyV1) {
  const start=Date.parse(`${date}T00:00:00+08:00`);
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(start)||new Date(start+28_800_000).toISOString().slice(0,10)!==date)
    throw new Error('INVALID_DATE');
  const [webSource,appSource]=await Promise.all([
    readWebContributions(env,accountId,childId,date,policy).catch(()=>unavailableWeb('WEB_SOURCE_UNAVAILABLE')),
    readApplicationContributions(env,accountId,childId,date),
  ]);
  const sources=[...webSource.contributions,...appSource.contributions];
  const projection=projectSharedQuotaDay(policy,date,sources);
  const coverageReasons=[...new Set([...webSource.reasonCodes,...appSource.reasonCodes])].sort();
  const complete=projection.complete&&webSource.complete&&appSource.complete;
  const reasons=[...new Set([...projection.reasonCodes,...coverageReasons])].sort();
  const revision=await sha(JSON.stringify({schemaVersion:1,date,policy:policy.revision,stage:policy.stage,
    web:webSource.contributions.map(({sourceKey,revision,correctionRevision})=>[sourceKey,revision,correctionRevision]).sort(),
    application:appSource.contributions.map(({sourceKey,revision,correctionRevision,productAssociationVersion})=>
      [sourceKey,revision,correctionRevision,productAssociationVersion]).sort(),
    webCoverage:[webSource.expectedScopeCount,webSource.availableScopeCount,webSource.reasonCodes],
    applicationCoverage:[appSource.expectedScopeCount,appSource.availableScopeCount,appSource.reasonCodes],reasons}));
  return {schemaVersion:1,date,revision,computedAtMs:Date.now(),policyRevision:policy.revision,stage:policy.stage,
    usableForEnforcement:false,
    complete,reasonCodes:reasons,web:{complete:webSource.complete,expectedScopeCount:webSource.expectedScopeCount,
      availableScopeCount:webSource.availableScopeCount,reasonCodes:webSource.reasonCodes,bucketsMs:webSource.visibleBucketsMs},
    application:{complete:appSource.complete,expectedScopeCount:appSource.expectedScopeCount,
      availableScopeCount:appSource.availableScopeCount,reasonCodes:appSource.reasonCodes,classesMs:appSource.visibleClassesMs},
    day:projection};
}

function beijingDateAt(dayStartMs:number):string {
  return new Date(dayStartMs+28_800_000).toISOString().slice(0,10);
}

/** Reads seven persisted daily projections to expose the weekly entertainment limit without scanning raw segments. */
export async function readSharedAccessDayState(env:SharedAccessStateEnv,accountId:string,childId:string,date:string,
  policy:UnifiedChildAccessPolicyV1) {
  const dayStart=Date.parse(`${date}T00:00:00+08:00`);
  if(!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(date)||!Number.isFinite(dayStart)
    ||beijingDateAt(dayStart)!==date)throw new Error('INVALID_DATE');
  const weekday=new Date(dayStart+28_800_000).getUTCDay();
  const mondayOffset=(weekday+6)%7;
  const fromMs=dayStart-mondayOffset*dayMs;
  const dates=Array.from({length:7},(_,index)=>beijingDateAt(fromMs+index*dayMs));
  const results=await Promise.allSettled(dates.map(day=>readSharedAccessDayProjection(env,accountId,childId,day,policy)));
  const selectedIndex=dates.indexOf(date);
  const selected=results[selectedIndex];
  if(selected.status==='rejected')throw selected.reason;
  const restUsedMs=results.reduce((sum,result)=>sum+(result.status==='fulfilled'?result.value.day.usedMs.rest:0),0);
  const weekReasons=new Set<string>();
  for(let index=0;index<results.length;index++) {
    const result=results[index];
    if(result.status==='rejected')weekReasons.add('WEEK_DAY_UNAVAILABLE');
    else if(!result.value.complete) {
      weekReasons.add('WEEK_SOURCE_INCOMPLETE');
      for(const reason of result.value.reasonCodes)weekReasons.add(reason);
    }
  }
  const weekComplete=weekReasons.size===0;
  const week={fromDate:dates[0],toDate:dates[6],complete:weekComplete,reasonCodes:[...weekReasons].sort(),restUsedMs,
    restRemainingMs:policy.weeklyRestMinutes===null?null:Math.max(0,policy.weeklyRestMinutes*60_000-restUsedMs)};
  const weekRevision=await sha(JSON.stringify(results.map((result,index)=>
    result.status==='fulfilled'?[dates[index],result.value.revision,result.value.complete]:[dates[index],'unavailable'])));
  return {...selected.value,revision:await sha(`${selected.value.revision}\n${weekRevision}`),week};
}
