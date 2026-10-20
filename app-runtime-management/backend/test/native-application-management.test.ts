import {env} from 'cloudflare:workers';
import {expect,it} from 'vitest';
import {randomToken,sha256Hex} from '../src/crypto';
import {routeV2} from '../src/v2Routes';
import {projectAppPolicyForMachine} from '../src/v2Repository';
import {receiveNativeApplicationObjects,readNativeApplicationObjects,readNativeApplicationConfiguration} from '../src/nativeApplicationObjects';
import {getAppPolicy,putAppPolicy,putNativeApplicationChanges,parseAppPolicyUpdate,appPolicyEtag} from '../src/appPolicy';
import {readApplicationIdentityUsage} from '../src/applicationProductProjections';
import {usageAccountDayStart} from '@timeonchrome/app-runtime-contracts/usage-account';
import {verifyNativeApplicationObjectReceipt,type NativeApplicationObjectBatch} from '@timeonchrome/app-runtime-contracts/native-application-identification';
import type {MachineSelfResponse} from '../src/contracts';
const start=usageAccountDayStart('2026-10-15'),now=start+86400000;
it('当前身份局部保存：限额不强迫分类，分类与限额互不覆盖，公共字段及版本隔离保留',async()=>{
 const f=await fixture();await f.send();
 const target={machineId:f.machine.machineId,nativeId:'scan-app'};
 const original=await getAppPolicy(env.RUNTIME_DB,f.machine.accountId,f.childId);
 const patch=(version:number,change:Record<string,unknown>,child:string=f.childId)=>
  putNativeApplicationChanges(env.RUNTIME_DB,f.machine.accountId,child,appPolicyEtag(version),
   {nativeApplicationChanges:[{target,...change}]},now);
 const limited=await patch(original.version,{dailyQuotaMinutes:30});
 expect(limited.nativeApplications?.[0]).toMatchObject({classification:'unclassified',dailyQuotaMinutes:30,specialApplication:false});
 const classified=await patch(limited.version,{classification:'other',specialApplication:true});
 expect(classified.nativeApplications?.[0]).toMatchObject({classification:'other',dailyQuotaMinutes:30,specialApplication:true});
 const cleared=await patch(classified.version,{dailyQuotaMinutes:null});
 expect(cleared.nativeApplications?.[0]).toMatchObject({classification:'other',dailyQuotaMinutes:null,specialApplication:true});
 expect(cleared.quotas).toEqual(original.quotas);
 expect(cleared.timeWindows).toEqual(original.timeWindows);
 expect(cleared.classifications).toEqual(original.classifications);
 await expect(patch(original.version,{dailyQuotaMinutes:10})).rejects.toMatchObject({code:'APP_POLICY_CONFLICT'});
 await expect(patch(0,{dailyQuotaMinutes:10},'another-child')).rejects.toMatchObject({code:'NATIVE_APPLICATION_TARGET_NOT_FOUND'});
 await expect(patch(cleared.version,{classification:'unclassified'})).rejects.toMatchObject({code:'INVALID_NATIVE_APPLICATION_CONFIGURATION'});
});
it('公共时间段序列化顺序差异可触发旧全量保存冲突；局部保存不传递或重排公共字段',async()=>{
 const f=await fixture();await f.send();
 const original=await getAppPolicy(env.RUNTIME_DB,f.machine.accountId,f.childId);
 const timeWindows=Object.fromEntries(Object.entries(original.timeWindows).reverse().map(([day,value])=>[day,
  Object.fromEntries(Object.entries(value).reverse())]));
 const payload=JSON.stringify({...original,timeWindows});
 await env.RUNTIME_DB.prepare(`INSERT INTO runtime_child_app_policy_versions_v1(account_id,child_id,version,payload_json,payload_hash,effective_at_ms,created_at_ms)
 VALUES(?1,?2,1,?3,?4,0,0)`).bind(f.machine.accountId,f.childId,payload,await sha256Hex(payload)).run();
 const current=await getAppPolicy(env.RUNTIME_DB,f.machine.accountId,f.childId);
 const entry={target:{machineId:f.machine.machineId,nativeId:'scan-app'},classification:'other',specialApplication:false,dailyQuotaMinutes:null};
 const normalized=parseAppPolicyUpdate({...current,nativeApplications:[entry]});
 expect(normalized.timeWindows).toEqual(current.timeWindows);
 expect(JSON.stringify(normalized.timeWindows)).not.toBe(JSON.stringify(current.timeWindows));
 await expect(putAppPolicy(env.RUNTIME_DB,f.machine.accountId,f.childId,appPolicyEtag(1),normalized,now))
  .rejects.toMatchObject({code:'SHARED_ACCESS_CONFIG_OWNED_BY_GUARDIAN'});
 const saved=await putNativeApplicationChanges(env.RUNTIME_DB,f.machine.accountId,f.childId,appPolicyEtag(1),
  {nativeApplicationChanges:[{target:entry.target,classification:'other',specialApplication:false}]},now);
 expect(JSON.stringify(saved.timeWindows)).toBe(JSON.stringify(current.timeWindows));
 expect(saved.quotas).toEqual(current.quotas);
});
it('未配置保持未归类；禁止主动设为未归类或删除已归类设置，允许改为其他时间', async()=>{
 const f=await fixture();await f.send();
 const current=await getAppPolicy(env.RUNTIME_DB,f.machine.accountId,f.childId);
 const target={machineId:f.machine.machineId,nativeId:'scan-app'};
 const entry={target,classification:'unclassified',specialApplication:false,dailyQuotaMinutes:null};
 const save=(policy:typeof current,entries:unknown[])=>putAppPolicy(env.RUNTIME_DB,f.machine.accountId,f.childId,
  appPolicyEtag(policy.version),parseAppPolicyUpdate({...policy,nativeApplications:entries}),now);
 await expect(save(current,[entry])).rejects.toMatchObject({code:'APPLICATION_CLASSIFICATION_REQUIRED'});
 const classified=await save(current,[{...entry,classification:'study'}]);
 await expect(save(classified,[entry])).rejects.toMatchObject({code:'APPLICATION_CLASSIFICATION_REQUIRED'});
 await expect(save(classified,[])).rejects.toMatchObject({code:'APPLICATION_CLASSIFICATION_REQUIRED'});
 const other=await save(classified,[{...entry,classification:'other'}]);
 expect(other.nativeApplications?.[0].classification).toBe('other');
 expect(other.quotas).toEqual(current.quotas);
 expect(other.timeWindows).toEqual(current.timeWindows);
});
async function fixture(platform:MachineSelfResponse['platform']='windows'){
 const token=randomToken(''),childId=crypto.randomUUID(),localUserId='u'.repeat(64);
 const machine:MachineSelfResponse={machineId:crypto.randomUUID(),accountId:crypto.randomUUID(),platform,displayName:null,
  defaultChildId:null,desiredPolicyVersion:1,appliedPolicyVersion:0,policyState:'pending',revoked:false};
 await env.RUNTIME_DB.prepare(`INSERT INTO runtime_machines_v2(id,account_id,platform,token_hash,last_seen_at_ms,created_at_ms,updated_at_ms)
 VALUES(?1,?2,?4,?3,0,0,0)`).bind(machine.machineId,machine.accountId,await sha256Hex(token),platform).run();
 await env.RUNTIME_DB.prepare(`INSERT INTO runtime_user_assignments_v2 VALUES(?1,?2,1,?3,1,'override',0,0)`)
 .bind(machine.machineId,localUserId,childId).run();
 const batch={schemaVersion:1,childId,localUserId,assignmentVersion:1,items:[{nativeId:'scan-app',revision:1,observedAtMs:start,
  presentations:[{name:'安装扫描名称',origin:'scan',status:null,evidence:[]}]}]};
 const send=(input:unknown=batch)=>receiveNativeApplicationObjects(env.RUNTIME_DB,machine,input,now);
 const api=(path:string,method='GET',body?:unknown)=>routeV2(new Request('https://runtime.test'+path,{method,
  headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)}),env,now);
 return {machine,childId,localUserId,batch,send,api};
}
it('Mac冻结动态身份通过正式登记路由与回执，重放/同版冲突/孩子和分配隔离保持',async()=>{
 const f=await fixture('macos'),nativeId='macos:'+'a'.repeat(64);
 const input:NativeApplicationObjectBatch={...f.batch,schemaVersion:1,items:[{...f.batch.items[0],nativeId,
  presentations:[{name:'Synthetic Mac app',origin:'runtime',status:'dynamic-process',evidence:['PROCESS_NAME_FALLBACK']}]}]};
 const before=structuredClone(input);
 const post=(body:unknown=input)=>f.api('/v2/machines/applications','POST',body);
 const response=await post();expect(response?.status).toBe(200);
 const ack=await response!.json();
 expect(await verifyNativeApplicationObjectReceipt(ack,input)).toEqual(ack);
 expect(await (await post())!.json()).toEqual(ack);
 const directory=await readNativeApplicationObjects(env.RUNTIME_DB,f.machine.accountId,f.childId);
 expect(directory.items).toHaveLength(1);
 expect(directory.items[0]).toMatchObject({target:{machineId:f.machine.machineId,nativeId},platform:'macos',
  presentations:input.items[0].presentations,configuration:null});
 const config=await f.api(`/v2/machines/applications/config?localUserId=${f.localUserId}&assignmentVersion=1`);
 expect(await config!.json()).toMatchObject({childId:f.childId,applications:[]});
 const item=input.items[0],presentation=item.presentations[0];
 await expect(post({...input,items:[{...item,presentations:[{...presentation,name:'Conflict'}]}]}))
  .rejects.toMatchObject({code:'NATIVE_APPLICATION_REVISION_CONFLICT'});
 for(const changed of [{nativeId:'macos:bad'}, {presentations:[{...presentation,status:'dynamic-registry'}]},
  {presentations:[{...presentation,origin:'scan'}]}])
  await expect(post({...input,items:[{...item,...changed}]})).rejects.toMatchObject({code:'INVALID_NATIVE_APPLICATION_OBJECT'});
 await expect(post({...input,childId:'other'})).rejects.toMatchObject({code:'NATIVE_APPLICATION_SCOPE_CHANGED'});
 expect((await readNativeApplicationObjects(env.RUNTIME_DB,'other-account',f.childId)).items).toEqual([]);
 await env.RUNTIME_DB.prepare(`INSERT INTO runtime_user_assignments_v2 VALUES(?1,?2,2,'new-child',1,'override',1,1)`)
  .bind(f.machine.machineId,f.localUserId).run();
 await expect(post()).rejects.toMatchObject({code:'NATIVE_APPLICATION_SCOPE_CHANGED'});
 expect((await readNativeApplicationObjects(env.RUNTIME_DB,f.machine.accountId,'new-child')).items).toEqual([]);
 expect(input).toEqual(before);
});
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
it('旧投影接收退出但当前扫描身份和配置仍独立可用',async()=>{
 const f=await fixture();await f.send();
 for(const action of ['native-projection','product-projection'])
  await expect(f.api('/v2/machines/application-accounts/manifests/aa1_'+'a'.repeat(64)+'/'+action,'PUT',{})).rejects.toMatchObject({status:404,code:'APPLICATION_ACCOUNT_NOT_FOUND'});
 expect((await readNativeApplicationObjects(env.RUNTIME_DB,f.machine.accountId,f.childId)).items).toMatchObject([
  {target:{machineId:f.machine.machineId,nativeId:'scan-app'},presentations:[{origin:'scan'}]}]);
 const empty=await readApplicationIdentityUsage(env.RUNTIME_DB,f.machine.accountId,f.childId,start,now);
 expect(empty.applications).toEqual([]);expect(empty.instances).toEqual([]);
});
