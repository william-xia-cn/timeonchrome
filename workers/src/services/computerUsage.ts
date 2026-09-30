import { WorkerEntrypoint } from 'cloudflare:workers';
import { mergeComputerUsage, withComputerUsageRevision, computerUsageSourceGroupKey,
  type ComputerApplicationSource, type ComputerWebSource } from '@timeonchrome/app-runtime-contracts/computer-usage';
import type { ComputerUsageSourceBundle } from '@timeonchrome/app-runtime-contracts/computer-usage';
import type { Env } from '../db/middleware';
import { readManifestAccountV2 } from './profileAccountsV2';
import { projectCompositeDailyRows, readCompositeCorrections } from './compositePageCorrections';

export interface ComputerUsageEnv extends Env {
  RUNTIME_COMPUTER_USAGE?: {readApplicationEvidence(accountId:string,childId:string,fromDate:string,toDate:string):Promise<ComputerApplicationSource[]>;
    applicationEvidenceRevision(accountId:string,childId:string,fromDate:string,toDate:string):Promise<string>};
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
    if(!head){sources.push({...base,reasons:[...base.reasons,'WEB_ACCOUNT_UNAVAILABLE']});continue;}
    const account=await readManifestAccountV2(env,head.manifest_id);
    if(!account||account.profileId!==childId||account.deviceId!==device.id||account.date!==date)throw new Error('WEB_ACCOUNT_SCOPE_CONFLICT');
    const corrections=await readCompositeCorrections(env.DB.withSession('first-primary'),childId,device.id,date,account.generatedAt);
    const corrected=projectCompositeDailyRows(account,corrections.items);
    const totalMs=account.rows.filter(row=>row.kind==='daily_total'&&row.channel==='active').reduce((sum,row)=>sum+row.durationSeconds*1000,0);
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

export async function readComputerUsage(env:ComputerUsageEnv,accountId:string,childId:string,from:string,to:string,computer?:string) {
  validateComputerUsageRange(from,to);
  const owned=await env.DB.prepare('SELECT id FROM profiles WHERE id=? AND account_id=?').bind(childId,accountId).first();
  if(!owned)throw new Error('CHILD_NOT_FOUND');
  // Small immutable source headers invalidate the bounded cache; pagination does
  // not reread the full interval window when source versions have not changed.
  const fingerprint=async()=>{
    const heads=await env.DB.prepare('SELECT device_id,date,manifest_id FROM device_account_heads_v2 WHERE profile_id=? AND date>=? AND date<=? ORDER BY device_id,date LIMIT 701').bind(childId,from,to).all();
    if((heads.results?.length??0)>700)throw new Error('COMPUTER_USAGE_SOURCE_LIMIT');
    const evidence=await env.DB.prepare('SELECT COUNT(*) AS count,MAX(updated_at) AS lastChange FROM usage_segments_v1 WHERE profile_id=? AND date>=? AND date<=?').bind(childId,from,to).first();
    const corrections=await env.DB.prepare('SELECT COUNT(*) AS count,MAX(created_at) AS lastChange FROM usage_segment_corrections_v1 WHERE profile_id=? AND date>=? AND date<=?').bind(childId,from,to).first();
    const application=await env.RUNTIME_COMPUTER_USAGE?.applicationEvidenceRevision(accountId,childId,from,to);
    return sha(JSON.stringify({model:'readable-history-v2',heads:heads.results,evidence,corrections,application}));
  };
  let version:string|null=null;
  let bundle:ComputerUsageSourceBundle|null=null;
  try {version=await fingerprint();bundle=await env.CONFIG_CACHE.get(`computer-usage:${await sha(`${accountId}\n${childId}\n${from}\n${to}`)}:${version}`,'json');}catch{ /* Source failures remain isolated below. */ }
  if(bundle&&bundle.fromDate===from&&bundle.toDate===to) {
    const select=(source:ComputerWebSource|ComputerApplicationSource,kind:'web'|'application')=>!computer||computerUsageSourceGroupKey(source,kind)===computer;
    if(computer&&!bundle.web.some(s=>select(s,'web'))&&!bundle.applications.some(s=>select(s,'application')))throw new Error('COMPUTER_NOT_FOUND');
    return withComputerUsageRevision(mergeComputerUsage({...bundle,web:bundle.web.filter(s=>select(s,'web')),applications:bundle.applications.filter(s=>select(s,'application'))}));
  }
  const unavailable=(key:string,reason:string)=>({key,computerKey:null,computerName:'来源暂不可用',revision:'unavailable',
    correctionRevision:'unavailable',settledAtMs:null,complete:false,statisticsComplete:false,reasons:[reason],totalMs:null,categoriesMs:{},intervals:[]});
  let web:ComputerWebSource[];
  let applications:ComputerApplicationSource[];
  try { web=await readComputerWebEvidence(env,accountId,childId,from,to); }
  catch {web=[unavailable('web:unavailable','WEB_SOURCE_UNAVAILABLE')];}
  try { applications=env.RUNTIME_COMPUTER_USAGE
    ?await env.RUNTIME_COMPUTER_USAGE.readApplicationEvidence(accountId,childId,from,to)
    :[{...unavailable('application:unavailable','APPLICATION_SERVICE_UNAVAILABLE'),associationVersion:'unavailable'}]; }
  catch {applications=[{...unavailable('application:unavailable','APPLICATION_SOURCE_UNAVAILABLE'),associationVersion:'unavailable'}];}
  bundle={fromDate:from,toDate:to,web,applications};
  if(version){try{if(await fingerprint()===version){const payload=JSON.stringify(bundle);if(payload.length<=2000000)await env.CONFIG_CACHE.put(`computer-usage:${await sha(`${accountId}\n${childId}\n${from}\n${to}`)}:${version}`,payload,{expirationTtl:60});}else{for(const source of [...web,...applications]){source.complete=false;source.statisticsComplete=false;source.reasons.push('SOURCE_VERSION_CHANGED');}}}catch{ /* Cache is not authority. */ }}
  const select=(source:ComputerWebSource|ComputerApplicationSource,kind:'web'|'application')=>!computer||computerUsageSourceGroupKey(source,kind)===computer;
  if(computer&&!web.some(s=>select(s,'web'))&&!applications.some(s=>select(s,'application')))throw new Error('COMPUTER_NOT_FOUND');
  const result=mergeComputerUsage({...bundle,web:web.filter(s=>select(s,'web')),applications:applications.filter(s=>select(s,'application'))});
  return withComputerUsageRevision(result);
}

/** Only callers granted this entrypoint binding can reach the cross-cloud read capability. */
export class ComputerUsageService extends WorkerEntrypoint<ComputerUsageEnv> {
  async getComputerUsage(accountId:string,childId:string,from:string,to:string,computer?:string){return readComputerUsage(this.env,accountId,childId,from,to,computer);}
}
