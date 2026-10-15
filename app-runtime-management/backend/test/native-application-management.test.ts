import {env} from 'cloudflare:workers';
import {expect,it} from 'vitest';
import {randomToken,sha256Hex} from '../src/crypto';
import {routeV2} from '../src/v2Routes';
import {projectAppPolicyForMachine} from '../src/v2Repository';
import {receiveNativeApplicationObjects,readNativeApplicationObjects,readNativeApplicationConfiguration} from '../src/nativeApplicationObjects';
import {getAppPolicy,putAppPolicy,parseAppPolicyUpdate,appPolicyEtag} from '../src/appPolicy';
import {receiveNativeApplicationProjection} from '../src/nativeApplicationProjections';
import {readApplicationIdentityUsage} from '../src/applicationProductProjections';
import {createApplicationInstanceAccount,hashUsageAccountValue,usageAccountDayStart} from '@timeonchrome/app-runtime-contracts/usage-account';
import type {MachineSelfResponse} from '../src/contracts';
const start=usageAccountDayStart('2026-10-15'),now=start+86400000;
async function fixture(){
 const token=randomToken(''),childId=crypto.randomUUID(),localUserId='u'.repeat(64);
 const machine:MachineSelfResponse={machineId:crypto.randomUUID(),accountId:crypto.randomUUID(),platform:'windows',displayName:null,
  defaultChildId:null,desiredPolicyVersion:1,appliedPolicyVersion:0,policyState:'pending',revoked:false};
 await env.RUNTIME_DB.prepare(`INSERT INTO runtime_machines_v2(id,account_id,platform,token_hash,last_seen_at_ms,created_at_ms,updated_at_ms)
 VALUES(?1,?2,'windows',?3,0,0,0)`).bind(machine.machineId,machine.accountId,await sha256Hex(token)).run();
 await env.RUNTIME_DB.prepare(`INSERT INTO runtime_user_assignments_v2 VALUES(?1,?2,1,?3,1,'override',0,0)`)
 .bind(machine.machineId,localUserId,childId).run();
 const batch={schemaVersion:1,childId,localUserId,assignmentVersion:1,items:[{nativeId:'scan-app',revision:1,observedAtMs:start,
  presentations:[{name:'安装扫描名称',origin:'scan',status:null,evidence:[]}]}]};
 const send=(input:unknown=batch)=>receiveNativeApplicationObjects(env.RUNTIME_DB,machine,input,now);
 const api=(path:string,method='GET',body?:unknown)=>routeV2(new Request('https://runtime.test'+path,{method,
  headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)}),env,now);
 return {machine,childId,localUserId,batch,send,api};
}
it('无实例或capture，扫描和动态身份均可登记；对象、配置与机器消费者使用同一target',async()=>{
 const f=await fixture();const ack=await f.send();expect(ack.items[0]).toMatchObject({nativeId:'scan-app',revision:1});
 expect(await f.send()).toEqual(ack);
 const read=await readNativeApplicationObjects(env.RUNTIME_DB,f.machine.accountId,f.childId);
 expect(read.items).toMatchObject([{target:{machineId:f.machine.machineId,nativeId:'scan-app'},presentations:[{origin:'scan',status:null}],configuration:null}]);
 const current=await getAppPolicy(env.RUNTIME_DB,f.machine.accountId,f.childId);
 const configuration={target:read.items[0].target,classification:'study',specialApplication:false,dailyQuotaMinutes:null};
 const saved=await putAppPolicy(env.RUNTIME_DB,f.machine.accountId,f.childId,appPolicyEtag(current.version),
  parseAppPolicyUpdate({...current,nativeApplications:[configuration]}),now);
 expect((await f.api(`/v2/machines/applications/config?localUserId=${f.localUserId}&assignmentVersion=1`))?.status).toBe(200);
 expect(await readNativeApplicationConfiguration(env.RUNTIME_DB,f.machine,f.localUserId,1)).toMatchObject({childId:f.childId,version:saved.version,applications:[configuration]});
 const legacy=await putAppPolicy(env.RUNTIME_DB,f.machine.accountId,f.childId,appPolicyEtag(saved.version),
  parseAppPolicyUpdate({classifications:saved.classifications,quotas:saved.quotas}),now+1);
 expect(legacy.nativeApplications).toEqual([configuration]);
 expect(projectAppPolicyForMachine(legacy,true,true)).not.toHaveProperty('nativeApplications');
 expect(legacy.nativeApplications).toEqual([configuration]);
 expect((await readNativeApplicationObjects(env.RUNTIME_DB,f.machine.accountId,f.childId)).items[0].configuration).toEqual(configuration);
 expect(await env.RUNTIME_DB.prepare('SELECT COUNT(*) n FROM runtime_program_instances_v1 WHERE machine_id=?').bind(f.machine.machineId).first('n')).toBe(0);
});
it('版本替换、同版冲突、来源/孩子隔离和改绑不会重标旧对象',async()=>{
 const f=await fixture();await f.send();
 await expect(f.send({...f.batch,items:[{...f.batch.items[0],presentations:[{...f.batch.items[0].presentations[0],name:'冲突'}]}]})).rejects.toMatchObject({code:'NATIVE_APPLICATION_REVISION_CONFLICT'});
 await f.send({...f.batch,items:[{...f.batch.items[0],revision:2,presentations:[{...f.batch.items[0].presentations[0],name:'新名称'}]}]});
 expect((await f.send()).items[0].revision).toBe(2);
 await expect(f.send({...f.batch,childId:'other'})).rejects.toMatchObject({code:'NATIVE_APPLICATION_SCOPE_CHANGED'});
 expect((await readNativeApplicationObjects(env.RUNTIME_DB,'other-account',f.childId)).items).toEqual([]);
 await env.RUNTIME_DB.prepare(`INSERT INTO runtime_user_assignments_v2 VALUES(?1,?2,2,'new-child',1,'override',1,1)`).bind(f.machine.machineId,f.localUserId).run();
 await expect(f.send()).rejects.toMatchObject({code:'NATIVE_APPLICATION_SCOPE_CHANGED'});
 expect((await readNativeApplicationObjects(env.RUNTIME_DB,f.machine.accountId,'new-child')).items).toEqual([]);
 expect((await readNativeApplicationObjects(env.RUNTIME_DB,f.machine.accountId,f.childId)).items).toHaveLength(1);
});
it('同名不同ID不合并；跨孩子配置目标拒绝，动态身份并非管理资格门槛',async()=>{
 const f=await fixture();await f.send({...f.batch,items:[...f.batch.items,{...f.batch.items[0],nativeId:'dynamic-local:sample',
  presentations:[{name:'安装扫描名称',origin:'runtime',status:'dynamic-process',evidence:['PROCESS_NAME_FALLBACK']}]}]});
 expect((await readNativeApplicationObjects(env.RUNTIME_DB,f.machine.accountId,f.childId)).items).toHaveLength(2);
 const current=await getAppPolicy(env.RUNTIME_DB,f.machine.accountId,'other-child');
 await expect(putAppPolicy(env.RUNTIME_DB,f.machine.accountId,'other-child',appPolicyEtag(0),parseAppPolicyUpdate({...current,
  nativeApplications:[{target:{machineId:f.machine.machineId,nativeId:'scan-app'},classification:'other',specialApplication:false,dailyQuotaMinutes:null}]}),now))
 .rejects.toMatchObject({code:'NATIVE_APPLICATION_TARGET_NOT_FOUND'});
});
it('同机器同孩子两个受保护用户独立revision1，同target汇成一个管理对象，不覆盖另一来源',async()=>{
 const f=await fixture();await f.send();const second='v'.repeat(64);
 await env.RUNTIME_DB.prepare(`INSERT INTO runtime_user_assignments_v2 VALUES(?1,?2,1,?3,1,'override',0,0)`)
 .bind(f.machine.machineId,second,f.childId).run();
 await f.send({...f.batch,localUserId:second,items:[{...f.batch.items[0],presentations:[{...f.batch.items[0].presentations[0],name:'另一用户名称'}]}]});
 const directory=await readNativeApplicationObjects(env.RUNTIME_DB,f.machine.accountId,f.childId);
 expect(directory.items).toHaveLength(1);expect(directory.items[0].presentations.map(p=>p.name).sort()).toEqual(['另一用户名称','安装扫描名称'].sort());
 expect(await env.RUNTIME_DB.prepare('SELECT COUNT(*) n FROM runtime_native_application_objects_v1 WHERE machine_id=?').bind(f.machine.machineId).first('n')).toBe(2);
 expect((await f.send()).items[0].revision).toBe(1);
});
it('仅新身份配置不重建旧目录/Firefox投影；公共时间段变化仍明确拒绝',async()=>{
 const f=await fixture();await f.send();const empty=await getAppPolicy(env.RUNTIME_DB,f.machine.accountId,f.childId);
 const legacy={classifications:[{platform:'windows',runtimeIdentity:'firefox-existing',displayName:'Firefox',classification:'blocked'}],
  quotas:empty.quotas,timeWindows:empty.timeWindows,
  applicationKnowledge:{schemaVersion:4,version:7,products:[],rules:[],ownershipRules:[],bindings:[]},
  programInstanceExecutionPolicy:{schemaVersion:1,catalogVersion:7,blockedProducts:[{productId:'firefox-existing',suspectedMatchers:[]}]}};
 const payload=JSON.stringify(legacy);
 await env.RUNTIME_DB.prepare(`INSERT INTO runtime_child_app_policy_versions_v1(account_id,child_id,version,payload_json,payload_hash,effective_at_ms,created_at_ms)
 VALUES(?1,?2,1,?3,?4,0,0)`).bind(f.machine.accountId,f.childId,payload,await sha256Hex(payload)).run();
 const current=await getAppPolicy(env.RUNTIME_DB,f.machine.accountId,f.childId);
 const nativeApplications=[{target:{machineId:f.machine.machineId,nativeId:'scan-app'},classification:'study',specialApplication:false,dailyQuotaMinutes:null}];
 const saved=await putAppPolicy(env.RUNTIME_DB,f.machine.accountId,f.childId,appPolicyEtag(1),parseAppPolicyUpdate({
  classifications:current.classifications,quotas:current.quotas,timeWindows:current.timeWindows,nativeApplications}),now);
 expect(saved.classifications).toEqual(current.classifications);
 expect(saved.applicationKnowledge).toEqual(current.applicationKnowledge);expect(saved.programInstanceExecutionPolicy).toEqual(current.programInstanceExecutionPolicy);
 const changed=JSON.parse(JSON.stringify(current.timeWindows));changed.monday.study=[{start:'08:00',end:'12:00'}];
 await expect(putAppPolicy(env.RUNTIME_DB,f.machine.accountId,f.childId,appPolicyEtag(saved.version),parseAppPolicyUpdate({
  classifications:current.classifications,quotas:current.quotas,timeWindows:changed,nativeApplications}),now+1))
 .rejects.toMatchObject({code:'SHARED_ACCESS_CONFIG_OWNED_BY_GUARDIAN'});
});
it('基础统计上传→身份投影→读取名称与管理配置同对象，不依赖旧目录或原始事实重算',async()=>{
 const f=await fixture();await f.send();
 const snapshot=await createApplicationInstanceAccount({schemaVersion:3,sourceKind:'application',durationUnit:'seconds',timezone:'Asia/Shanghai',
  date:'2026-10-15',childId:f.childId,revision:1,generatedAtMs:now,settledThroughMs:now,algorithmVersion:'application-instance-seconds-v1',
  rawFactCount:1,rawFactHash:'a'.repeat(64),observationResolutionHash:'b'.repeat(64),complete:true,reasonCodes:[]},[
  {kind:'total',hour:null,subjectKey:null,duration:60},...Array.from({length:24},(_,hour)=>({kind:'total' as const,hour,subjectKey:null,duration:hour===3?60:0})),
  {kind:'subject',hour:null,subjectKey:'observation:'+'c'.repeat(64),duration:60},{kind:'subject',hour:3,subjectKey:'observation:'+'c'.repeat(64),duration:60}]);
 const response=await f.api('/v2/machines/application-accounts/manifests','POST',{localUserId:f.localUserId,assignmentVersion:1,manifest:snapshot.manifest});
 const begun=await response!.json() as {manifestId:string};expect(response!.status).toBe(200);
 for(const c of snapshot.chunks)expect((await f.api(`/v2/machines/application-accounts/manifests/${begun.manifestId}/chunks/${c.chunkIndex}`,'PUT',{rows:c.rows,chunkHash:c.chunkHash}))!.status).toBe(200);
 expect((await f.api(`/v2/machines/application-accounts/manifests/${begun.manifestId}/commit`,'POST'))!.status).toBe(200);
 const body={schemaVersion:1,baseManifestHash:snapshot.manifest.manifestHash,revision:1,configurationVersion:0,generatedAtMs:now,complete:true,reasonCodes:[],
  rows:[{kind:'application',hour:null,nativeId:'scan-app',category:null,duration:60,classifications:['unclassified']},
   {kind:'application',hour:3,nativeId:'scan-app',category:null,duration:60,classifications:['unclassified']},
   {kind:'category',hour:null,nativeId:null,category:'unclassified',duration:60}],
  applicationUsage:{nonSpecialTotal:60,specialTotal:0,nonSpecialCategories:{unclassified:60},complete:true,reasonCodes:[]}};
 const projection={...body,projectionHash:await hashUsageAccountValue(body)};
 expect((await f.api(`/v2/machines/application-accounts/manifests/${begun.manifestId}/native-projection`,'PUT',projection))!.status).toBe(200);
 const usage=await readApplicationIdentityUsage(env.RUNTIME_DB,f.machine.accountId,f.childId,start,now);
 expect(usage.totalDuration).toBe(60);expect(usage.applications).toMatchObject([{target:{machineId:f.machine.machineId,nativeId:'scan-app'},displayName:'安装扫描名称',duration:60}]);
 expect(usage.productStatus.complete).toBe(true);
 expect(await receiveNativeApplicationProjection(env.RUNTIME_DB,f.machine,begun.manifestId,projection,now)).toMatchObject({received:true,revision:1});
 const conflicting={...body,generatedAtMs:now-1};
 await expect(receiveNativeApplicationProjection(env.RUNTIME_DB,f.machine,begun.manifestId,{...conflicting,projectionHash:await hashUsageAccountValue(conflicting)},now))
 .rejects.toMatchObject({code:'NATIVE_APPLICATION_PROJECTION_CONFLICT'});
 await expect(receiveNativeApplicationProjection(env.RUNTIME_DB,{...f.machine,accountId:'other'},begun.manifestId,projection,now))
 .rejects.toMatchObject({code:'APPLICATION_ACCOUNT_NOT_FOUND'});
 const original=await env.RUNTIME_DB.prepare('SELECT manifest_json FROM runtime_application_account_manifests_v1 WHERE id=?').bind(begun.manifestId).first('manifest_json');
 const partial={...body,revision:2,complete:false,reasonCodes:['NATIVE_IDENTITY_METADATA_MISSING'],
  rows:body.rows.map(row=>({...row,duration:40})),
  applicationUsage:{nonSpecialTotal:40,specialTotal:0,nonSpecialCategories:{unclassified:40},complete:false,reasonCodes:['NATIVE_IDENTITY_METADATA_MISSING']}};
 await receiveNativeApplicationProjection(env.RUNTIME_DB,f.machine,begun.manifestId,{...partial,projectionHash:await hashUsageAccountValue(partial)},now);
 const partialUsage=await readApplicationIdentityUsage(env.RUNTIME_DB,f.machine.accountId,f.childId,start,now);
 expect(partialUsage.totalDuration).toBe(60);expect(partialUsage.applications[0].duration).toBe(40);
 expect(partialUsage.productStatus.complete).toBe(false);expect(partialUsage.applicationUsage).toBeNull();
 const independent={...body,revision:3,configurationVersion:999};
 await receiveNativeApplicationProjection(env.RUNTIME_DB,f.machine,begun.manifestId,{...independent,projectionHash:await hashUsageAccountValue(independent)},now);
 expect((await readApplicationIdentityUsage(env.RUNTIME_DB,f.machine.accountId,f.childId,start,now)).totalDuration).toBe(60);
 expect(await env.RUNTIME_DB.prepare('SELECT manifest_json FROM runtime_application_account_manifests_v1 WHERE id=?').bind(begun.manifestId).first('manifest_json')).toBe(original);
});
