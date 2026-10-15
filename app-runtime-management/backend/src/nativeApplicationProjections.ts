import {verifyNativeApplicationStatisticsProjection,nativeApplicationManagementTargetKey,
 type NativeApplicationStatisticsProjection,type NativeApplicationManagementTarget}
 from '@timeonchrome/app-runtime-contracts/native-application-identification';
import {canonicalUsageAccountJson,hashUsageAccountValue,verifyApplicationInstanceAccountManifest,
 parseApplicationInstanceAccountRows} from '@timeonchrome/app-runtime-contracts/usage-account';
import type {MachineSelfResponse} from './contracts';
import type {readProgramInstanceStatistics} from './programInstanceStatistics';
import {HttpError} from './http';
const fail=(status:number,code:string):never=>{throw new HttpError(status,code,code);};
export async function receiveNativeApplicationProjection(db:D1Database,machine:MachineSelfResponse,id:string,value:unknown,now:number) {
 const stored=await db.prepare(`SELECT s.manifest_json,s.state FROM runtime_application_account_manifests_v1 s
 JOIN runtime_machines_v2 m ON m.id=s.machine_id WHERE s.id=?1 AND s.machine_id=?2 AND s.account_id=?3
 AND m.account_id=?3 AND m.revoked_at_ms IS NULL`).bind(id,machine.machineId,machine.accountId).first<{manifest_json:string;state:string}>();
 if(!stored||machine.revoked)return fail(404,'APPLICATION_ACCOUNT_NOT_FOUND');
 if(stored.state!=='received')return fail(409,'APPLICATION_ACCOUNT_PENDING');
 const base=await verifyApplicationInstanceAccountManifest(JSON.parse(stored.manifest_json));
 let p:NativeApplicationStatisticsProjection;
 try{p=await verifyNativeApplicationStatisticsProjection(value);}catch{return fail(400,'INVALID_NATIVE_APPLICATION_PROJECTION');}
 if(p.baseManifestHash!==base.manifestHash)return fail(400,'NATIVE_APPLICATION_BASE_MISMATCH');
 if(p.generatedAtMs>now+300000)return fail(400,'NATIVE_APPLICATION_TIME_INVALID');
 const chunks=await db.prepare(`SELECT chunk_index,rows_json FROM runtime_application_account_chunks_v1 WHERE manifest_id=? ORDER BY chunk_index LIMIT 100`)
 .bind(id).all<{chunk_index:number;rows_json:string}>();
 if(chunks.results.length!==base.chunkCount||chunks.results.some((r,i)=>r.chunk_index!==i))return fail(409,'APPLICATION_ACCOUNT_CHUNKS_MISSING');
 const baseRows=parseApplicationInstanceAccountRows(chunks.results.flatMap(r=>JSON.parse(r.rows_json)));
 if(baseRows.length!==base.rowCount||await hashUsageAccountValue(baseRows)!==base.rowsHash)return fail(400,'USAGE_ACCOUNT_ROWS_HASH_MISMATCH');
 const total=baseRows.find(r=>r.kind==='total'&&r.hour===null)?.duration;
 const explained=p.applicationUsage.nonSpecialTotal+p.applicationUsage.specialTotal;
 if(total===undefined||explained>total||p.applicationUsage.complete&&explained!==total)
  return fail(400,'NATIVE_APPLICATION_USAGE_MISMATCH');
 const ids=[...new Set(p.rows.flatMap(r=>r.nativeId?[r.nativeId]:[]))];
 const known=await db.prepare(`SELECT DISTINCT native_id FROM runtime_native_application_objects_v1 WHERE machine_id=?1 AND child_id=?2
 AND native_id IN(SELECT value FROM json_each(?3))`).bind(machine.machineId,base.childId,JSON.stringify(ids)).all<{native_id:string}>();
 if(known.results.length!==ids.length)return fail(409,'NATIVE_APPLICATION_OBJECT_PENDING');
 // 不重算原账；只校验派生秒维度。分类/应用可重叠，不能求和冒充基础总量。
 for(const row of p.rows){
  if(row.hour===null&&row.duration>total)return fail(400,'NATIVE_APPLICATION_USAGE_MISMATCH');
  if(row.kind==='application'&&row.hour===null){
   const hours=p.rows.filter(r=>r.kind==='application'&&r.nativeId===row.nativeId&&r.hour!==null);
   if(hours.length&&hours.reduce((sum,r)=>sum+r.duration,0)!==row.duration)return fail(400,'NATIVE_APPLICATION_HOUR_MISMATCH');
  }
 }
 const payload=canonicalUsageAccountJson(p);if(new TextEncoder().encode(payload).length>1048576)return fail(413,'BODY_TOO_LARGE');
 await db.prepare(`INSERT INTO runtime_native_application_projections_v1(manifest_id,revision,projection_hash,payload_json,received_at_ms)
 SELECT ?1,?2,?3,?4,?5 WHERE NOT EXISTS(SELECT 1 FROM runtime_native_application_projections_v1 WHERE manifest_id=?1 AND revision>?2)
 ON CONFLICT(manifest_id,revision) DO NOTHING`).bind(id,p.revision,p.projectionHash,payload,now).run();
 const saved=await db.prepare(`SELECT projection_hash FROM runtime_native_application_projections_v1 WHERE manifest_id=? AND revision=?`)
 .bind(id,p.revision).first<{projection_hash:string}>();
 if(!saved)return fail(409,'NATIVE_APPLICATION_PROJECTION_STALE');
 if(saved.projection_hash!==p.projectionHash)return fail(409,'NATIVE_APPLICATION_PROJECTION_CONFLICT');
 return {manifestId:id,revision:p.revision,projectionHash:p.projectionHash,received:true};
}
type Base=Awaited<ReturnType<typeof readProgramInstanceStatistics>>;
/** 只归集已存投影；身份名称与管理目录引用相同的machineId/nativeId。 */
export async function readNativeApplicationUsage(db:D1Database,account:string,child:string,base:Base,from:number,to:number) {
 const exists=await db.prepare(`SELECT 1 AS n FROM sqlite_master WHERE type='table' AND name='runtime_native_application_projections_v1'`).first();
 if(!exists)return null;
 const refs=base.days.flatMap(d=>d.references.map(r=>({...r,date:d.date})));
 if(!refs.length)return null;
 const results:Array<{results:Array<{payload_json:string|null;machine_id:string}>}>=[];
 let loadedBytes=0;
 for(let offset=0;offset<refs.length;offset+=4){
  const group=refs.slice(offset,offset+4);
  if(loadedBytes>=8*1048576){results.push(...group.map(()=>({results:[]})));continue;}
  const read=await db.batch<{payload_json:string|null;payload_bytes:number;machine_id:string}>(group.map(r=>db.prepare(`SELECT
   CASE WHEN length(CAST(p.payload_json AS BLOB))<=1048576 THEN p.payload_json ELSE NULL END AS payload_json,
   length(CAST(p.payload_json AS BLOB)) AS payload_bytes,s.machine_id
   FROM runtime_native_application_projections_v1 p JOIN runtime_application_account_manifests_v1 s ON s.id=p.manifest_id
   JOIN runtime_machines_v2 m ON m.id=s.machine_id WHERE p.manifest_id=?1 AND s.account_id=?2 AND m.account_id=?2
   AND s.child_id=?3 AND s.manifest_hash=?4 AND s.state='received' ORDER BY p.revision DESC LIMIT 1`)
   .bind(r.manifestId,account,child,r.hash)));
  for(const entry of read){const row=entry.results[0];if(row){loadedBytes+=row.payload_bytes;if(loadedBytes>8*1048576)row.payload_json=null;}results.push(entry);}
 }
 if(!results.some(r=>r.results.length))return null;
 const reasons=new Set<string>(),categories=new Map<string,number>();
 const applications=new Map<string,{subjectKey:string;target:NativeApplicationManagementTarget;displayName:string;duration:number;classifications:string[];identified:boolean}>();
 let nonSpecialTotal=0,specialTotal=0,availableSources=0,bytes=0;
 const nonSpecialCategories:Record<string,number>={},versions:string[]=[];
 for(let i=0;i<refs.length;i++){
  const stored=results[i].results[0];if(!stored){reasons.add('NATIVE_APPLICATION_PROJECTION_MISSING');continue;}
  if(stored.payload_json===null){reasons.add('NATIVE_APPLICATION_READ_LIMIT');continue;}
  bytes+=new TextEncoder().encode(stored.payload_json).length;if(bytes>8*1048576)return fail(503,'NATIVE_APPLICATION_READ_LIMIT');
  let p:NativeApplicationStatisticsProjection;
  try{p=await verifyNativeApplicationStatisticsProjection(JSON.parse(stored.payload_json));}
  catch{reasons.add('NATIVE_APPLICATION_PROJECTION_INVALID');continue;}
  if(p.baseManifestHash!==refs[i].hash){reasons.add('NATIVE_APPLICATION_BASE_MISMATCH');continue;}
  versions.push(p.projectionHash);availableSources++;p.reasonCodes.forEach(c=>reasons.add(c));
  nonSpecialTotal+=p.applicationUsage.nonSpecialTotal;specialTotal+=p.applicationUsage.specialTotal;
  for(const [c,d]of Object.entries(p.applicationUsage.nonSpecialCategories))nonSpecialCategories[c]=(nonSpecialCategories[c]??0)+d;
  for(const row of p.rows.filter(r=>r.hour===null)){
   if(row.kind==='category')categories.set(row.category!,(categories.get(row.category!)??0)+row.duration);
   else {
    const target={machineId:stored.machine_id,nativeId:row.nativeId!},key=nativeApplicationManagementTargetKey(target),old=applications.get(key);
    applications.set(key,{subjectKey:key,target,displayName:row.nativeId!,duration:(old?.duration??0)+row.duration,
     classifications:[...new Set([...(old?.classifications??[]),...row.classifications!])].sort(),identified:true});
   }
  }
 }
 const targets=[...applications.values()].map(r=>r.target);
 const names=targets.length?await db.prepare(`SELECT n.machine_id,n.native_id,n.payload_json,n.payload_hash FROM runtime_native_application_objects_v1 n
 JOIN runtime_machines_v2 m ON m.id=n.machine_id WHERE m.account_id=?1 AND n.child_id=?2 AND EXISTS
 (SELECT 1 FROM json_each(?3) r WHERE json_extract(r.value,'$.machineId')=n.machine_id AND json_extract(r.value,'$.nativeId')=n.native_id)
 ORDER BY n.received_at_ms DESC,n.local_user_id,n.assignment_version DESC LIMIT 10001`).bind(account,child,JSON.stringify(targets)).all<{machine_id:string;native_id:string;payload_json:string;payload_hash:string}>():{results:[]};
 const named=new Set<string>();
 for(const n of names.results){const key=nativeApplicationManagementTargetKey({machineId:n.machine_id,nativeId:n.native_id}),app=applications.get(key);
  if(app&&!named.has(key)){const p=JSON.parse(n.payload_json) as {presentations:Array<{name:string}>};app.displayName=p.presentations[0]?.name??app.displayName;named.add(key);}}
 const complete=availableSources===refs.length&&!reasons.size;
 const days=base.days.map(day=>({...day,settledThroughMs:day.references.length&&day.references.every(r=>r.settledThroughMs!==null)?Math.min(...day.references.map(r=>r.settledThroughMs!)):null}));
 const date=(ms:number)=>new Date(ms+28800000).toISOString().slice(0,10);
 return {model:'program-instance-v1' as const,source:'application' as const,childId:child,fromDate:date(from),toDate:date(to-1),durationUnit:'seconds' as const,
  complete:base.complete,totalDuration:base.totalDuration,availableTotalDuration:base.availableTotalDuration,
  applicationUsage:complete?{nonSpecialTotal,specialTotal,nonSpecialCategories,complete:true,reasonCodes:[]}:null,
  instances:base.subjects.map(r=>({subjectKey:r.subjectKey!,duration:r.duration})),days,
  categories:[...categories].map(([classification,duration])=>({classification,duration})),
  applications:[...applications.values()].sort((a,b)=>b.duration-a.duration),
  buckets:days.flatMap(day=>to-from===86400000?Array.from({length:24},(_,hour)=>({startAtMs:Date.parse(`${day.date}T00:00:00+08:00`)+hour*3600000,duration:day.rows.find(r=>r.kind==='total'&&r.hour===hour)?.duration??null})):[{startAtMs:Date.parse(`${day.date}T00:00:00+08:00`),duration:day.totalDuration}]),
  productStatus:{complete,availableSources,totalSources:refs.length,catalogVersion:null,reasonCodes:[...reasons].sort()},
  statistics:{producer:'native',revision:base.revision,stale:!base.complete,settledThroughByDate:days.map(d=>({date:d.date,settledThroughMs:d.settledThroughMs})),missingDates:days.filter(d=>!d.complete).map(d=>d.date)},
  revision:await hashUsageAccountValue([base.revision,versions,names.results.map(n=>[n.machine_id,n.native_id,n.payload_hash]).sort(),[...reasons].sort()])};
}
