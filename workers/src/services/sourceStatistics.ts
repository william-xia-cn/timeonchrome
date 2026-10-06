import {sourceStatisticsDates,validateSourceStatisticsSnapshot,type SourceStatisticsQuery,type SourceStatisticsSnapshot,type SourceStatisticsDay} from '@timeonchrome/app-runtime-contracts/source-statistics';
import type {Env} from '../db/middleware';
import {readManifestAccountV2} from './profileAccountsV2';
import {compactDeviceAccount} from './profileAccountSnapshotsV2';
import {applyCorrectionsToCompactDeviceAccounts,listUsageAccountingCorrections} from './usageAccountingCorrections';
import {sharedWebSourceKey} from './sharedAccessState';

/** 网页V2权威统计的只读归集；不触碰原账、物化或原上传。 */
export async function readWebSourceStatistics(env:Env,accountId:string,childId:string,query:SourceStatisticsQuery,
  excludedDeviceId?:string,now=Date.now()):Promise<SourceStatisticsSnapshot>{
  if(query.source!=='web'||query.ownSourceKeys!==undefined||query.scope==='other'&&!excludedDeviceId)throw new Error('SOURCE_STATISTICS_INVALID');
  const devices=await env.DB.prepare('SELECT id FROM devices WHERE profile_id=? ORDER BY id LIMIT 201').bind(childId).all<{id:string}>();
  if(devices.results.length>200)throw new Error('SOURCE_STATISTICS_SOURCE_LIMIT');
  const excluded=query.scope==='other'?[await sharedWebSourceKey(accountId,excludedDeviceId!)]:[],included=new Set<string>(),versions:unknown[]=[],days:SourceStatisticsDay[]=[];
  const corrections=await listUsageAccountingCorrections(env,childId,{from:query.fromDate,to:query.toDate});
  for(const date of sourceStatisticsDates(query.fromDate,query.toDate)){
    let total=0,count=0;let cutoff:number|null=null;const categories:Record<string,number>={},reasons=new Set<string>();
    for(const device of devices.results){
      if(query.scope==='other'&&device.id===excludedDeviceId)continue;
      const key=await sharedWebSourceKey(accountId,device.id);
      const head=await env.DB.prepare('SELECT manifest_id FROM device_account_heads_v2 WHERE profile_id=? AND device_id=? AND date=?')
        .bind(childId,device.id,date).first<{manifest_id:string}>();
      if(!head){reasons.add('WEB_SOURCE_NOT_PUBLISHED');continue;}
      const account=await readManifestAccountV2(env,head.manifest_id);
      if(!account||account.profileId!==childId||account.deviceId!==device.id||account.date!==date)throw new Error('SOURCE_STATISTICS_INVALID');
      const corrected=applyCorrectionsToCompactDeviceAccounts([compactDeviceAccount(account)],corrections)[0];
      const projection=corrected.quotaProjection as {activeSeconds:number;byQuotaBucket:Array<{quotaBucket:string;durationSeconds:number}>};
      const add=(a:number,b:number)=>{const n=a+b;if(!Number.isSafeInteger(n)||n<0)throw new Error('SOURCE_STATISTICS_INVALID');return n;};
      total=add(total,projection.activeSeconds);count++;included.add(key);
      for(const row of projection.byQuotaBucket)categories[row.quotaBucket]=add(categories[row.quotaBucket]??0,row.durationSeconds);
      cutoff=cutoff===null?account.generatedAt:Math.min(cutoff,account.generatedAt);
      versions.push([date,key,account.revision,account.statsHash]);
      if(!account.complete||account.lossCount>0)reasons.add('WEB_STATISTICS_INCOMPLETE');
    }
    const unknown=count===0&&reasons.size>0;
    days.push({date,totalSeconds:unknown?null:total,categoriesSeconds:categories,settledThroughMs:cutoff,complete:reasons.size===0,reasonCodes:[...reasons].sort()});
  }
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify({childId,query,versions,corrections,days})));
  const value:SourceStatisticsSnapshot={schemaVersion:1,durationUnit:'seconds',source:'web',childId,fromDate:query.fromDate,toDate:query.toDate,
    revision:[...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,'0')).join(''),readAtMs:now,includedSourceKeys:[...included].sort(),excludedSourceKeys:excluded,days};
  return validateSourceStatisticsSnapshot(value,{source:'web',childId,fromDate:query.fromDate,toDate:query.toDate});
}

/** Service Binding响应也有明确大小上界，不把未知响应整块装入内存。 */
export async function readSourceStatisticsResponse(response:Response):Promise<unknown>{
  if(!response.ok)throw new Error('SOURCE_STATISTICS_UNAVAILABLE');
  const reader=response.body?.getReader();if(!reader)throw new Error('SOURCE_STATISTICS_UNAVAILABLE');
  const chunks:Uint8Array[]=[];let size=0;
  while(true){const c=await reader.read();if(c.done)break;size+=c.value.byteLength;if(size>65536){await reader.cancel();throw new Error('SOURCE_STATISTICS_RESPONSE_LIMIT');}chunks.push(c.value);}
  const bytes=new Uint8Array(size);let offset=0;for(const c of chunks){bytes.set(c,offset);offset+=c.byteLength;}
  return JSON.parse(new TextDecoder().decode(bytes));
}
