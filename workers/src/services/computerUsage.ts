import { WorkerEntrypoint } from 'cloudflare:workers';
import { mergeComputerUsage, withComputerUsageRevision, computerUsageSourceGroupKey,
  computerUsageReadPage, type ComputerUsageResult,
  type ComputerApplicationSource, type ComputerWebSource } from '@timeonchrome/app-runtime-contracts/computer-usage';
import type { Env } from '../db/middleware';
import { readManifestAccountV2 } from './profileAccountsV2';
import { projectCompositeDailyRows, readCompositeCorrections } from './compositePageCorrections';
import { applyCorrectionsToV1StatsRows, listUsageAccountingCorrections } from './usageAccountingCorrections';
import { generateToken } from '../db/middleware';
import { statsRouter } from '../routes/stats';

export interface ComputerUsageEnv extends Env {
  RUNTIME_COMPUTER_USAGE?: {readApplicationEvidence(accountId:string,childId:string,fromDate:string,toDate:string):Promise<ComputerApplicationSource[]>;
    applicationEvidenceRevision(accountId:string,childId:string,fromDate:string,toDate:string):Promise<string>;
    getApplicationUsage?(accountId:string,childId:string,fromDate:string,toDate:string):Promise<unknown>;
    fetch?(request:Request):Promise<Response>};
}
async function readRuntime<T>(env:ComputerUsageEnv,operation:'applicationEvidenceRevision'|'readApplicationEvidence'|'getApplicationUsage',accountId:string,childId:string,fromDate:string,toDate:string):Promise<T> {
  const service=env.RUNTIME_COMPUTER_USAGE;
  if(!service)throw new Error('APPLICATION_SERVICE_UNAVAILABLE');
  if(service.fetch){
    const response=await service.fetch(new Request(`https://runtime-capability/${operation}`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({accountId,childId,fromDate,toDate})}));
    const value=await response.json();
    if(!response.ok)throw new Error(String((value as {code?:string}).code||'APPLICATION_SOURCE_UNAVAILABLE'));
    return value as T;
  }
  const method=service[operation];
  if(!method)throw new Error('APPLICATION_RPC_UNAVAILABLE');
  return await method.call(service,accountId,childId,fromDate,toDate) as T;
}
const DAY=86400000;
const sha=async(value:string)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))),byte=>byte.toString(16).padStart(2,'0')).join('');
export function validateComputerUsageRange(from:string,to:string) {
  const start=Date.parse(`${from}T00:00:00+08:00`),end=Date.parse(`${to}T00:00:00+08:00`);
  const valid=(date:string,time:number)=>/^\d{4}-\d{2}-\d{2}$/.test(date)&&Number.isFinite(time)
    &&new Date(time+8*3600000).toISOString().slice(0,10)===date;
  if(!valid(from,start)||!valid(to,end)||end<start||end-start>6*DAY)throw new Error('INVALID_RANGE');
  return {start,end};
}
const classification=(value:unknown)=>({restricted:'restrictedEntertainment',pending_composite:'unclassified',rejected:'blocked'}[String(value)]||String(value||'unknown'));

/** Read authority first; intervals only verify/support display overlap, never replace V2 statistics. */
export async function readComputerWebEvidence(env:ComputerUsageEnv,accountId:string,childId:string,from:string,to:string):Promise<ComputerWebSource[]> {
  const {start,end}=validateComputerUsageRange(from,to);
  const devices=await env.DB.prepare('SELECT id,device_name FROM devices WHERE profile_id=? ORDER BY id LIMIT 101')
    .bind(childId).all<{id:string;device_name:string}>();
  if((devices.results?.length??0)>100)throw new Error('COMPUTER_USAGE_SOURCE_LIMIT');
  const sources:ComputerWebSource[]=[];
  let remaining=10000; // Combined with Runtime's 10k budget, never exceeds shared 20k.
  for(const device of devices.results??[])for(let day=start;day<=end;day+=DAY) {
    const date=new Date(day+8*3600000).toISOString().slice(0,10);
    const sourceGroupKey=`web:${await sha(`${accountId}\n${device.id}`)}`,key=`${sourceGroupKey}:${date}`;
    const base={key,sourceGroupKey,computerKey:null,computerName:device.device_name||'网页设备',revision:'missing',correctionRevision:'missing',
      settledAtMs:null,complete:false,statisticsComplete:false,reasons:[] as string[],totalMs:null,categoriesMs:{},intervals:[]};
    try {
    const head=await env.DB.prepare('SELECT manifest_id FROM device_account_heads_v2 WHERE profile_id=? AND device_id=? AND date=?')
      .bind(childId,device.id,date).first<{manifest_id:string}>();
    if(!head){
      // Reuse the existing daily target/domain authority and its approved corrections.
      // These are alternative projections, never two additive copies of usage.
      const target=await env.DB.prepare('SELECT * FROM target_stats_v1 WHERE profile_id=? AND device_id=? AND date=? ORDER BY target_key,channel,mode,quota_bucket').bind(childId,device.id,date).all<Record<string,unknown>>();
      const targetRows=target.results??[];
      const domain=targetRows.length?null:await env.DB.prepare('SELECT * FROM stats_v1 WHERE profile_id=? AND device_id=? AND date=? ORDER BY domain,channel,mode').bind(childId,device.id,date).all<Record<string,unknown>>();
      const raw=targetRows.length?targetRows:domain?.results??[];
      if(!raw.length){sources.push({...base,reasons:['WEB_ACCOUNT_UNAVAILABLE']});continue;}
      const changes=await listUsageAccountingCorrections(env,childId,{from:date,to:date,deviceId:device.id});
      const corrected=applyCorrectionsToV1StatsRows(raw,changes,targetRows.length?'daily_target':'daily_domain').filter(row=>row.channel==='active');
      const categoriesMs:Record<string,number>={};
      for(const row of corrected){const category=classification(row.target_classification_at_time??row.mode);categoriesMs[category]=(categoriesMs[category]??0)+Number(row.duration_seconds)*1000;}
      sources.push({...base,revision:await sha(JSON.stringify(raw)),correctionRevision:await sha(JSON.stringify(changes)),
        settledAtMs:Math.max(...raw.map(row=>Number(row.last_seen_at??row.updated_at??0))),statisticsComplete:true,
        historyQuality:'bestEffort',reasons:['HISTORICAL_SOURCE_BEST_EFFORT'],
        totalMs:corrected.reduce((sum,row)=>sum+Number(row.duration_seconds)*1000,0),categoriesMs});continue;
    }
    const account=await readManifestAccountV2(env,head.manifest_id);
    if(!account||account.profileId!==childId||account.deviceId!==device.id||account.date!==date)throw new Error('WEB_ACCOUNT_SCOPE_CONFLICT');
    const corrections=await readCompositeCorrections(env.DB.withSession('first-primary'),childId,device.id,date,account.generatedAt);
    const corrected=projectCompositeDailyRows(account,corrections.items);
    const totalMs=account.rows.filter(row=>row.kind==='daily_domain'&&row.channel==='active').reduce((sum,row)=>sum+row.durationSeconds*1000,0);
    const categoriesMs:Record<string,number>={};
    for(const row of corrected.filter(row=>row.channel==='active')){
      const category=classification(row.targetClassificationAtTime);
      categoriesMs[category]=(categoriesMs[category]||0)+row.durationSeconds*1000;
    }
    const rows=await env.DB.prepare(`SELECT id,start_ms,end_ms,duration_seconds,domain,target_classification_at_time FROM usage_segments_v1
      WHERE profile_id=? AND device_id=? AND date=? AND channel='active' AND duration_seconds>0
      AND end_ms<=? AND uploaded_at<=? ORDER BY start_ms,end_ms,id LIMIT ?`)
      .bind(childId,device.id,date,account.generatedAt,account.committedAt,remaining+1)
      .all<{id:string;start_ms:number;end_ms:number;duration_seconds:number;domain:string;target_classification_at_time:string}>();
    const reasons=[...base.reasons,...(!account.complete||account.lossCount?['WEB_ACCOUNT_INCOMPLETE']:[]),
      ...((rows.results?.length??0)>remaining?['WEB_EVIDENCE_LIMIT']:[])];
    const correctionById=new Map(corrections.items.map(item=>[item.segmentId,item]));
    const labels=new Map<string,string>();
    const intervals:ComputerWebSource['intervals']=[];
    for(const row of (rows.results??[]).slice(0,remaining)) {
      let subjectKey=labels.get(row.domain);
      if(!subjectKey){subjectKey=await sha(`${accountId}\nweb\n${row.domain}`);labels.set(row.domain,subjectKey);}
      intervals.push({startMs:Number(row.start_ms),endMs:Number(row.end_ms),creditedMs:Number(row.duration_seconds)*1000,
        classification:classification(correctionById.get(row.id)?.effectiveClassification??row.target_classification_at_time),subjectKey,label:row.domain});
    }
    remaining-=intervals.length;
    const current=await env.DB.prepare('SELECT manifest_id FROM device_account_heads_v2 WHERE profile_id=? AND device_id=? AND date=?')
      .bind(childId,device.id,date).first<{manifest_id:string}>();
    if(current?.manifest_id!==head.manifest_id)reasons.push('SOURCE_VERSION_CHANGED');
    sources.push({...base,revision:`${account.revision}:${account.statsHash}`,correctionRevision:corrections.revision,
      settledAtMs:account.generatedAt,complete:account.complete&&!account.lossCount&&reasons.length===0,
      statisticsComplete:account.complete&&!account.lossCount&&!reasons.includes('SOURCE_VERSION_CHANGED'),
      reasons,totalMs,categoriesMs,intervals});
    }catch{sources.push({...base,reasons:['WEB_SOURCE_UNAVAILABLE']});}
  }
  return sources;
}

export async function readComputerUsage(env:ComputerUsageEnv,accountId:string,childId:string,from:string,to:string,computer?:string,summaryOnly=false) {
  validateComputerUsageRange(from,to);
  const owned=await env.DB.prepare('SELECT id FROM profiles WHERE id=? AND account_id=?').bind(childId,accountId).first();
  if(!owned)throw new Error('CHILD_NOT_FOUND');
  // Small immutable source headers invalidate the bounded cache; pagination does
  // not reread the full interval window when source versions have not changed.
  const fingerprint=async()=>{
    const [heads,evidence,corrections,application]=await Promise.all([
      env.DB.prepare('SELECT device_id,date,manifest_id FROM device_account_heads_v2 WHERE profile_id=? AND date>=? AND date<=? ORDER BY device_id,date LIMIT 701').bind(childId,from,to).all(),
      env.DB.prepare('SELECT COUNT(*) AS count,MAX(updated_at) AS lastChange FROM usage_segments_v1 WHERE profile_id=? AND date>=? AND date<=?').bind(childId,from,to).first(),
      env.DB.prepare('SELECT COUNT(*) AS count,MAX(created_at) AS lastChange FROM usage_segment_corrections_v1 WHERE profile_id=? AND date>=? AND date<=?').bind(childId,from,to).first(),
      env.RUNTIME_COMPUTER_USAGE?readRuntime<string>(env,'applicationEvidenceRevision',accountId,childId,from,to):Promise.resolve(undefined),
    ]);
    if((heads.results?.length??0)>700)throw new Error('COMPUTER_USAGE_SOURCE_LIMIT');
    return sha(JSON.stringify({model:'computer-projection-v4',heads:heads.results,evidence,corrections,application}));
  };
  let version:string|null=null;
  const scopeKey=await sha(JSON.stringify([accountId,childId,from,to,computer??null]));
  const cacheKey=(kind:'summary'|'details')=>`computer-projection-v4:${scopeKey}:${version}:${kind}`;
  try {
    version=await fingerprint();
    const cached=await env.CONFIG_CACHE.get<ComputerUsageResult>(cacheKey(summaryOnly?'summary':'details'),'json');
    if(cached?.schemaVersion===1&&cached.fromDate===from&&cached.toDate===to)return cached;
  }catch{ /* Source failures remain isolated below; a cache is not authority. */ }
  const unavailable=(key:string,reason:string)=>({key,computerKey:null,computerName:'来源暂不可用',revision:'unavailable',
    correctionRevision:'unavailable',settledAtMs:null,complete:false,statisticsComplete:false,reasons:[reason],totalMs:null,categoriesMs:{},intervals:[]});
  const webRead=readComputerWebEvidence(env,accountId,childId,from,to)
    .catch(()=>[unavailable('web:unavailable','WEB_SOURCE_UNAVAILABLE')] as ComputerWebSource[]);
  const appRead=(async():Promise<ComputerApplicationSource[]>=>{try { return env.RUNTIME_COMPUTER_USAGE
    ?await readRuntime<ComputerApplicationSource[]>(env,'readApplicationEvidence',accountId,childId,from,to)
    :[{...unavailable('application:unavailable','APPLICATION_SERVICE_UNAVAILABLE'),associationVersion:'unavailable'}]; }
  catch(error) {
    const message=error&&typeof error==='object'&&'message' in error?String(error.message):'';
    const code=/^APPLICATION_(DATABASE_MEMORY_LIMIT|CHILD_UNAVAILABLE|SCOPE_UNAVAILABLE|SCHEMA_UNAVAILABLE|RPC_CANCELED|RPC_UNAVAILABLE|SOURCE_UNAVAILABLE)$/.test(message)?message
      :/SQLITE_NOMEM|out of memory/i.test(message)?'APPLICATION_DATABASE_MEMORY_LIMIT'
      :/CHILD_NOT_FOUND|Child was not found/i.test(message)?'APPLICATION_CHILD_UNAVAILABLE'
      :/no such (table|column)/i.test(message)?'APPLICATION_SCHEMA_UNAVAILABLE'
      :/hung|never generate a response|canceled/i.test(message)?'APPLICATION_RPC_CANCELED'
      :/not a function|does not implement/i.test(message)?'APPLICATION_RPC_UNAVAILABLE':'APPLICATION_SOURCE_UNAVAILABLE';
    console.error(JSON.stringify({event:'computer_application_read_failed',code}));
    return [{...unavailable('application:unavailable',code),associationVersion:'unavailable'}];
  }})();
  const [web,applications]=await Promise.all([webRead,appRead]);
  let stable=false;
  if(version){try{stable=await fingerprint()===version;if(!stable)for(const source of [...web,...applications]){
    source.complete=false;source.statisticsComplete=false;source.reasons.push('SOURCE_VERSION_CHANGED');
  }}catch{ /* No cache publication when freshness cannot be verified. */ }}
  const select=(source:ComputerWebSource|ComputerApplicationSource,kind:'web'|'application')=>!computer||computerUsageSourceGroupKey(source,kind)===computer;
  if(computer&&!web.some(s=>select(s,'web'))&&!applications.some(s=>select(s,'application')))throw new Error('COMPUTER_NOT_FOUND');
  const result=await withComputerUsageRevision(mergeComputerUsage({fromDate:from,toDate:to,web:web.filter(s=>select(s,'web')),applications:applications.filter(s=>select(s,'application'))}));
  const summary=computerUsageReadPage(result,'summary');
  // Cache generated views, not sources that must be merged again on every read.
  // A summary hit never transfers/parses the potentially large detail generation.
  if(stable&&!result.reasons.some(code=>/UNAVAILABLE|PENDING|STALE|SOURCE_VERSION_CHANGED|MEMORY_LIMIT/.test(code))){try{
    await Promise.all((['summary','details'] as const).map(async kind=>{
      const payload=JSON.stringify(kind==='summary'?summary:result);
      if(payload.length<=2000000)await env.CONFIG_CACHE.put(cacheKey(kind),payload,{expirationTtl:300});
    }));
  }catch{ /* KV failures cannot fail or change authoritative source reads. */ }}
  return summaryOnly?summary:result;
}

/** Only callers granted this entrypoint binding can reach the cross-cloud read capability. */
export class ComputerUsageService extends WorkerEntrypoint<ComputerUsageEnv> {
  async fetch(request:Request):Promise<Response> {
    if(request.method!=='POST'||new URL(request.url).pathname!=='/verifyChildAccess')return Response.json({code:'METHOD_NOT_ALLOWED'},{status:405});
    const reader=request.body?.getReader();
    if(!reader)return Response.json({code:'INVALID_SCOPE'},{status:400});
    const chunks:Uint8Array[]=[];let length=0;
    while(true){const chunk=await reader.read();if(chunk.done)break;length+=chunk.value.byteLength;
      if(length>2048){await reader.cancel();return Response.json({code:'INVALID_SCOPE'},{status:400});}chunks.push(chunk.value);}
    const bytes=new Uint8Array(length);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
    const body=new TextDecoder().decode(bytes);
    let input:Record<string,unknown>;
    try {input=JSON.parse(body);}catch{return Response.json({code:'INVALID_SCOPE'},{status:400});}
    if(!input||['accountId','childId'].some(key=>typeof input[key]!=='string'||!String(input[key]).length||String(input[key]).length>200))return Response.json({code:'INVALID_SCOPE'},{status:400});
    try {
      const owned=await this.env.DB.prepare('SELECT id FROM profiles WHERE id=? AND account_id=?').bind(input.childId,input.accountId).first();
      return Response.json({owned:!!owned});
    }catch{return Response.json({code:'APPLICATION_SCOPE_UNAVAILABLE'},{status:503});}
  }
  async getComputerUsage(accountId:string,childId:string,from:string,to:string,computer?:string,summaryOnly=false){return readComputerUsage(this.env,accountId,childId,from,to,computer,summaryOnly);}
  async getIndependentUsage(accountId:string,childId:string,from:string,to:string,source:string) {
    return readIndependentUsage(this.env,accountId,childId,from,to,source);
  }
}
export async function readIndependentUsage(env:ComputerUsageEnv,accountId:string,childId:string,from:string,to:string,source:string) {
    validateComputerUsageRange(from,to);
    if(!['application','web','media'].includes(source))throw new Error('INVALID_SOURCE');
    const owned=await env.DB.prepare('SELECT id FROM profiles WHERE id=? AND account_id=?').bind(childId,accountId).first();
    if(!owned)throw new Error('CHILD_NOT_FOUND');
    if(source==='application'){
      if(!env.RUNTIME_COMPUTER_USAGE?.fetch&&!env.RUNTIME_COMPUTER_USAGE?.getApplicationUsage)throw new Error('APPLICATION_RPC_UNAVAILABLE');
      return readRuntime(env,'getApplicationUsage',accountId,childId,from,to);
    }
    // Invoke the already-authorized read routes in-process. The token never leaves
    // this capability method, and avoids maintaining a second correction algorithm.
    const token=await generateToken({account_id:accountId,exp:Math.floor(Date.now()/1000)+30},env.JWT_SECRET);
    const read=async(path:string)=>{
      const response=await statsRouter.handle(new Request(`https://internal/profiles/${encodeURIComponent(childId)}/${path}/v1?${new URLSearchParams({from,to})}`,{headers:{Authorization:`Bearer ${token}`}}),env);
      if(!response.ok)throw new Error('WEB_STATISTICS_UNAVAILABLE');
      return (await response.json() as {stats:Record<string,unknown>[]}).stats;
    };
    let daily=await read(source==='media'?'media-stats':'target-stats');
    let domain=false;
    if(source==='web'&&!daily.length){daily=await read('stats');domain=true;}
    const hourly=await read(source==='media'?'hourly-media-stats':domain?'hourly-stats':'hourly-target-stats');
    const relevant=(rows:Record<string,unknown>[])=>source==='media'?rows:rows.filter(row=>row.channel==='active');
    const categories=new Map<string,number>(),products=new Map<string,{displayName:string;classification:string;durationMs:number}>(),buckets=new Map<number,number>();
    let totalDurationMs=0;
    const category=(row:Record<string,unknown>)=>source==='media'?String(row.media_class):classification(row.target_classification_at_time??row.mode);
    for(const row of relevant(daily)){
      const ms=Number(row.duration_seconds)*1000,kind=category(row);totalDurationMs+=ms;categories.set(kind,(categories.get(kind)??0)+ms);
      const key=String(row.target_key??row.domain)+'\n'+kind,product=products.get(key)??{displayName:String(row.managed_target_label_at_time||row.fallback_domain||row.domain||'未知网站'),classification:kind,durationMs:0};product.durationMs+=ms;products.set(key,product);
      if(from!==to){const start=Date.parse(`${row.date}T00:00:00+08:00`);buckets.set(start,(buckets.get(start)??0)+ms);}
    }
    if(from===to)for(const row of relevant(hourly)){const start=Date.parse(`${row.date}T${String(row.hour).padStart(2,'0')}:00:00+08:00`);if(Number.isFinite(start))buckets.set(start,(buckets.get(start)??0)+Number(row.duration_seconds)*1000);}
    return {source,fromDate:from,toDate:to,totalDurationMs,categories:[...categories].map(([classification,durationMs])=>({classification,durationMs})),
      buckets:[...buckets].sort((a,b)=>a[0]-b[0]).map(([startAtMs,durationMs])=>({startAtMs,durationMs})),applications:[...products.values()].sort((a,b)=>b.durationMs-a.durationMs)};
}
