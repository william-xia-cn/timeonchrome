import {env} from 'cloudflare:workers';
import {expect,it} from 'vitest';
import {receiveNativeApplicationIdentifications,readNativeApplicationIdentifications} from '../src/nativeApplicationIdentifications';
import {registerProgramInstances,listChildProgramInstances,materializeProgramInstanceMappings,saveProgramInstanceCatalog} from '../src/programInstances';
import {randomToken,sha256Hex} from '../src/crypto';
import {routeV2} from '../src/v2Routes';
import type {MachineSelfResponse} from '../src/contracts';
async function fixture(){
  const token=randomToken(''),machine:MachineSelfResponse={machineId:crypto.randomUUID(),accountId:crypto.randomUUID(),
    platform:'windows',displayName:null,defaultChildId:null,desiredPolicyVersion:1,appliedPolicyVersion:0,policyState:'pending',revoked:false};
  const childId=crypto.randomUUID(),localUserId='opaque-user';
  await env.RUNTIME_DB.prepare(`INSERT INTO runtime_machines_v2(id,account_id,platform,token_hash,last_seen_at_ms,created_at_ms,updated_at_ms)
    VALUES(?1,?2,'windows',?3,0,0,0)`).bind(machine.machineId,machine.accountId,await sha256Hex(token)).run();
  await env.RUNTIME_DB.prepare(`INSERT INTO runtime_user_assignments_v2 VALUES(?1,?2,1,?3,1,'override',0,0)`)
    .bind(machine.machineId,localUserId,childId).run();
  const registration={schemaVersion:1,childId,localUserId,assignmentVersion:1,items:[{
    instance:{machineId:machine.machineId,platform:'windows',locationRef:'a'.repeat(32),executableSha256:'b'.repeat(64)},
    evidenceRevision:1,evidence:{platform:'windows',verified:{binaryHash:'b'.repeat(64)}}}]};
  const ack=await registerProgramInstances(env.RUNTIME_DB,machine,registration,1),instanceId=ack.items[0].instanceId;
  const identification={nativeId:'audit-app-1',name:'来自本机的名称',status:'identified',evidence:['os-application-aumid']};
  const batch={schemaVersion:1,childId,localUserId,assignmentVersion:1,items:[{instanceId,revision:1,observedAtMs:2,identifications:[identification]}]};
  const read=async()=> (await listChildProgramInstances(env.RUNTIME_DB,machine.accountId,childId,null)).items[0];
  const send=(body:unknown=batch)=>receiveNativeApplicationIdentifications(env.RUNTIME_DB,machine,body,10);
  return {token,machine,childId,localUserId,instanceId,batch,identification,registration,read,send};
}
it('实际机器鉴权接收并在家长实例读取显示本机名称，所有原管理键和证据保持',async()=>{
  const f=await fixture();
  await saveProgramInstanceCatalog(env.RUNTIME_DB,f.machine.accountId,[f.childId],'"application-knowledge-v0"',{
    schemaVersion:4,version:0,products:[{id:'product-existing',name:'原云端名称',type:'other'}],rules:[],bindings:[],
    ownershipRules:[{id:'rule-existing',revision:1,enabled:true,platform:'windows',productId:'product-existing',match:{kind:'binaryHash',sha256:'b'.repeat(64)}}]},1);
  await materializeProgramInstanceMappings(env.RUNTIME_DB,f.machine.accountId,f.childId,[{machineId:f.machine.machineId,instanceId:f.instanceId}]);
  const before=await f.read();
  const response=await routeV2(new Request('https://runtime.test/v2/machines/program-instances/local-identifications',{
    method:'POST',headers:{authorization:`Bearer ${f.token}`,'content-type':'application/json'},body:JSON.stringify(f.batch)}),env,10);
  expect(response?.status).toBe(200);
  const ack=await response!.json();expect(ack).toMatchObject({childId:f.childId,localUserId:f.localUserId,assignmentVersion:1,items:[{instanceId:f.instanceId,revision:1}]});
  const after=await f.read();expect(after.nativeIdentification).toMatchObject({state:'available',sources:[{identifications:[f.identification]}]});
  expect({...after,nativeIdentification:undefined}).toEqual({...before,nativeIdentification:undefined});
  expect(after.product?.id).toBe('product-existing');expect(after.evidence).not.toHaveProperty('nativeId');
  const auth=randomToken('');await env.RUNTIME_DB.prepare(`INSERT INTO runtime_browser_sessions_v1
    (token_hash,account_id,children_json,created_at_ms,expires_at_ms,last_used_at_ms) VALUES(?1,?2,?3,0,1000,0)`)
    .bind(await sha256Hex(auth),f.machine.accountId,JSON.stringify([{id:f.childId,name:'mock'}])).run();
  const parent=await routeV2(new Request(`https://runtime.test/v2/module/program-instances?childId=${f.childId}`,{
    headers:{authorization:`RuntimeSession ${auth}`}}),env,11);
  expect(await parent!.json()).toMatchObject({items:[{instanceId:f.instanceId,product:{id:'product-existing'},
    nativeIdentification:{sources:[{identifications:[{name:f.identification.name}]}]}}]});
});
it.each(['dynamic-registry','dynamic-process'])('保留%s及冲突/不完整代码，不提升为Verified或云端产品',async status=>{
  const f=await fixture(),entry={nativeId:'dynamic-local:'+'d'.repeat(64),name:'动态名称（动态识别）',status,
    evidence:['STATIC_IDENTITY_CONFLICT','REGISTRY_SOURCE_INCOMPLETE']};
  await f.send({...f.batch,items:[{...f.batch.items[0],identifications:[entry]}]});
  const result=await f.read();expect(result).toMatchObject({status:'pending',product:null,nativeIdentification:{sources:[{identifications:[{...entry,evidence:[...entry.evidence].sort()}]}]}});
  expect(result.evidence).toEqual({platform:'windows',verified:{binaryHash:'b'.repeat(64)}});
});
it('更新整体替换、重放幂等、旧版/同版不同内容、失效及失效后旧结果不复活',async()=>{
  const f=await fixture();const original=await f.send();expect(await f.send()).toEqual(original);
  await expect(f.send({...f.batch,items:[{...f.batch.items[0],identifications:[{...f.identification,name:'冲突内容'}]}]}))
    .rejects.toMatchObject({code:'NATIVE_IDENTIFICATION_REVISION_CONFLICT'});
  const second={...f.identification,nativeId:'pwa-other',name:'另一PWA'};
  await f.send({...f.batch,items:[{...f.batch.items[0],revision:2,identifications:[f.identification,second]}]});
  expect((await f.read()).nativeIdentification.sources[0].identifications).toHaveLength(2);
  await f.send({...f.batch,items:[{...f.batch.items[0],revision:3,identifications:[{...f.identification,name:'新名称'}]}]});
  expect((await f.send()).items[0].revision).toBe(3);
  expect((await f.read()).nativeIdentification.sources[0].identifications).toEqual([{...f.identification,name:'新名称'}]);
  await f.send({...f.batch,items:[{...f.batch.items[0],revision:4,identifications:null}]});await f.send();
  expect((await f.read()).nativeIdentification.state).toBe('invalidated');expect((await f.read()).instanceId).toBe(f.instanceId);
});
it('孩子/用户/机器/家庭/改绑隔离；旧分配不能补发或读取当前命名',async()=>{
  const f=await fixture();await f.send();
  for(const patch of [{childId:'other-child'},{localUserId:'other-user'},{assignmentVersion:2}])
    await expect(f.send({...f.batch,...patch})).rejects.toMatchObject({code:'NATIVE_IDENTIFICATION_SCOPE_CHANGED'});
  await expect(receiveNativeApplicationIdentifications(env.RUNTIME_DB,{...f.machine,accountId:'other-family'},f.batch,10))
    .rejects.toMatchObject({code:'NATIVE_IDENTIFICATION_SCOPE_CHANGED'});
  await expect(receiveNativeApplicationIdentifications(env.RUNTIME_DB,{...f.machine,machineId:'other-machine'},f.batch,10))
    .rejects.toMatchObject({code:'NATIVE_IDENTIFICATION_SCOPE_CHANGED'});
  expect((await listChildProgramInstances(env.RUNTIME_DB,'other-family',f.childId,null)).items).toEqual([]);
  expect((await listChildProgramInstances(env.RUNTIME_DB,f.machine.accountId,'other-child',null)).items).toEqual([]);
  await env.RUNTIME_DB.prepare(`INSERT INTO runtime_user_assignments_v2 VALUES(?1,?2,2,?3,1,'override',1,1)`)
    .bind(f.machine.machineId,f.localUserId,'new-child').run();
  await expect(f.send()).rejects.toMatchObject({code:'NATIVE_IDENTIFICATION_SCOPE_CHANGED'});
  expect((await f.read()).nativeIdentification.state).toBe('missing');
});
it('同实例多用户来源分别显示，不按同名合并或任意选择；无实例引用不上传',async()=>{
  const f=await fixture();await f.send();
  await expect(f.send({...f.batch,items:[{...f.batch.items[0],instanceId:'f'.repeat(64)}]}))
    .rejects.toMatchObject({code:'NATIVE_IDENTIFICATION_INSTANCE_PENDING'});
  await env.RUNTIME_DB.prepare(`INSERT INTO runtime_user_assignments_v2 VALUES(?1,'another-user',1,?2,1,'override',0,0)`)
    .bind(f.machine.machineId,f.childId).run();
  await registerProgramInstances(env.RUNTIME_DB,f.machine,{...f.registration,localUserId:'another-user'},2);
  await f.send({...f.batch,localUserId:'another-user'});
  const result=(await f.read()).nativeIdentification;expect(result.state).toBe('multiple-sources');expect(result.sources).toHaveLength(2);
  expect(result.sources[0].sourceKey).not.toBe(result.sources[1].sourceKey);
  expect(JSON.stringify(result)).not.toContain('another-user');
});
it('命名结构未部署、读取失败均不阻挡原实例读取；能力与结构就绪一致',async()=>{
  const f=await fixture();expect((await f.read()).nativeIdentification.state).toBe('missing');
  const caps=await routeV2(new Request('https://runtime.test/v2/machines/program-instances/capabilities',{
    headers:{authorization:`Bearer ${f.token}`}}),env,10);
  expect(await caps!.json()).toMatchObject({capabilities:expect.arrayContaining(['native-application-identification-v1'])});
  await env.RUNTIME_DB.prepare('ALTER TABLE runtime_native_application_identifications_v1 RENAME TO naming_not_deployed').run();
  try{expect((await f.read()).nativeIdentification.state).toBe('unavailable');
    await expect(f.send()).rejects.toMatchObject({code:'NATIVE_IDENTIFICATION_STORAGE_UNAVAILABLE'});
  }finally{await env.RUNTIME_DB.prepare('ALTER TABLE naming_not_deployed RENAME TO runtime_native_application_identifications_v1').run();}
});
it('非法字段、路径、未认证请求拒绝，未改变原描述/证据/映射',async()=>{
  const f=await fixture(),before=await f.read();
  await expect(f.send({...f.batch,pid:123})).rejects.toMatchObject({code:'INVALID_NATIVE_APPLICATION_IDENTIFICATION'});
  await expect(f.send({...f.batch,items:[{...f.batch.items[0],identifications:[{...f.identification,registryDirectory:'private'}]}]}))
    .rejects.toMatchObject({code:'INVALID_NATIVE_APPLICATION_IDENTIFICATION'});
  await expect(routeV2(new Request('https://runtime.test/v2/machines/program-instances/local-identifications',{
    method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(f.batch)}),env,10)).rejects.toMatchObject({status:401});
  expect(await f.read()).toEqual(before);
});
