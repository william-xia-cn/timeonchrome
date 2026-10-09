import { env } from 'cloudflare:workers';
import { expect, it } from 'vitest';
import { registerProgramInstances, materializeProgramInstanceMappings, readProgramInstanceMappings, saveProgramInstanceCatalog, refreshPendingProgramInstanceMappings } from '../src/programInstances';
import type { MachineSelfResponse } from '../src/contracts';
import { sha256Hex, randomToken } from '../src/crypto';
import { routeV2 } from '../src/v2Routes';
import { readChildProgramIdentityProjection, listChildProgramInstances } from '../src/programInstances';
import { getApplicationKnowledge, putApplicationKnowledge } from '../src/applicationKnowledge';
import { getAppPolicy, putAppPolicy } from '../src/appPolicy';
import { parseProductOwnershipEvidence, resolveProgramInstanceClassification } from '@timeonchrome/app-runtime-contracts/classification';
import { parseProgramInstanceProjectionContext } from '@timeonchrome/app-runtime-contracts/classification-validation';

async function fixture() {
  const machine: MachineSelfResponse = {machineId:crypto.randomUUID(), accountId:crypto.randomUUID(),
    platform:'windows', displayName:null, defaultChildId:null, desiredPolicyVersion:1, appliedPolicyVersion:0,
    policyState:'pending', revoked:false};
  const childId=crypto.randomUUID(), localUserId='user-a', token=randomToken('');
  await env.RUNTIME_DB.prepare(`INSERT INTO runtime_machines_v2
    (id,account_id,platform,token_hash,last_seen_at_ms,created_at_ms,updated_at_ms) VALUES(?1,?2,'windows',?3,0,0,0)`)
    .bind(machine.machineId,machine.accountId,await sha256Hex(token)).run();
  await env.RUNTIME_DB.prepare(`INSERT INTO runtime_user_assignments_v2 VALUES(?1,?2,1,?3,1,'override',0,0)`)
    .bind(machine.machineId,localUserId,childId).run();
  const value={schemaVersion:1,childId,localUserId,assignmentVersion:1,items:[{
    instance:{machineId:machine.machineId,platform:'windows',locationRef:'1'.repeat(32),executableSha256:'a'.repeat(64)},
    evidenceRevision:1,evidence:{platform:'windows',verified:{binaryHash:'a'.repeat(64)}}}]};
  return {machine,value,token};
}
it('规则预览使用实际孩子实例与正式匹配器，不写第三层，拒绝旧版本及跨孩子请求',async()=>{
  const {machine,value}=await fixture(),token=randomToken('');
  await registerProgramInstances(env.RUNTIME_DB,machine,value,1);
  await env.RUNTIME_DB.prepare(`INSERT INTO runtime_browser_sessions_v1
    (token_hash,account_id,children_json,created_at_ms,expires_at_ms,last_used_at_ms) VALUES(?1,?2,?3,0,1000,0)`)
    .bind(await sha256Hex(token),machine.accountId,JSON.stringify([{id:value.childId,name:'测试孩子'}])).run();
  const catalog={schemaVersion:4,version:0,products:[{id:'p',name:'产品',type:'other'}],rules:[],bindings:[],
    ownershipRules:[{id:'r',revision:1,enabled:true,platform:'windows',productId:'p',match:{kind:'binaryHash',sha256:'a'.repeat(64)}}]};
  const call=(body:unknown={catalog},childId:string=value.childId,etag='"application-knowledge-v0"')=>routeV2(new Request(
    `https://runtime.test/v2/module/program-instance-catalog/preview?childId=${childId}`,
    {method:'POST',headers:{authorization:`RuntimeSession ${token}`,'content-type':'application/json','if-match':etag},body:JSON.stringify(body)}),env,3);
  expect(await (await call())!.json()).toMatchObject({preview:true,catalogVersion:0,childId:value.childId,
    items:[{before:{status:'pending',productId:null},after:{status:'confirmed',productId:'p',ruleIds:['r']}}]});
  expect(await (await call({catalog:{...catalog,ownershipRules:[]}}))!.json()).toMatchObject({items:[{after:{status:'unresolved',productId:null}}]});
  const conflict={...catalog,products:[...catalog.products,{id:'q',name:'其他产品',type:'other'}],
    ownershipRules:[...catalog.ownershipRules,{...catalog.ownershipRules[0],id:'s',productId:'q'}]};
  expect(await (await call({catalog:conflict}))!.json()).toMatchObject({items:[{after:{status:'conflict',productId:null}}]});
  await expect(call({catalog},'another-child')).rejects.toMatchObject({code:'CHILD_NOT_FOUND'});
  await expect(call({catalog:{...catalog,bindings:[{childId:'another-child',products:[],ruleIds:[]}]}})).rejects.toMatchObject({code:'CHILD_NOT_FOUND'});
  await expect(call({catalog,productId:'manual-override'})).rejects.toMatchObject({code:'INVALID_CATALOG_PREVIEW'});
  await expect(call({catalog},value.childId,'"application-knowledge-v99"')).rejects.toMatchObject({code:'APPLICATION_KNOWLEDGE_CONFLICT'});
  expect(await env.RUNTIME_DB.prepare('SELECT COUNT(*) AS n FROM runtime_program_instance_mappings_v1 WHERE child_id=?')
    .bind(value.childId).first('n')).toBe(0);
  expect(await env.RUNTIME_DB.prepare('SELECT COUNT(*) AS n FROM runtime_application_knowledge_versions_v1 WHERE account_id=?')
    .bind(machine.accountId).first('n')).toBe(0);
});
it('新版目录下两种旧盘点仍事务保存并ACK，不运行旧识别政策或写实例映射',async()=>{
  const {machine,value,token}=await fixture();
  await env.RUNTIME_DB.prepare(`INSERT INTO runtime_machine_users_v2
    (machine_id,local_user_id,display_name,first_seen_at_ms,last_seen_at_ms) VALUES(?1,?2,'测试用户',0,0)`)
    .bind(machine.machineId,value.localUserId).run();
  const original=await getAppPolicy(env.RUNTIME_DB,machine.accountId,value.childId);
  await putAppPolicy(env.RUNTIME_DB,machine.accountId,value.childId,'"app-policy-v0"',{
    classifications:[{platform:'windows',runtimeIdentity:'legacy-app',displayName:'原有封锁',classification:'blocked'}],
    quotas:original.quotas,timeWindows:original.timeWindows,
  },1);
  const readPolicy=()=>routeV2(new Request('https://runtime.test/v2/machines/policy',
    {headers:{authorization:`Bearer ${token}`}}),env,3);
  const before=await readPolicy(),beforeEtag=before!.headers.get('etag'),beforeBody=await before!.json();
  expect(beforeBody).toMatchObject({version:2,appPolicies:[{childId:value.childId,policy:{
    version:1,classifications:[{runtimeIdentity:'legacy-app',classification:'blocked'}],
    resolvedApplications:expect.arrayContaining([expect.objectContaining({runtimeIdentity:'legacy-app',classification:'blocked'})]),
  }}]});
  await saveProgramInstanceCatalog(env.RUNTIME_DB,machine.accountId,[value.childId],'"application-knowledge-v0"',
    {schemaVersion:4,version:0,products:[],ownershipRules:[],rules:[],bindings:[]},1);
  const evidence={platform:'windows',runtimeIdentity:'legacy-app',displayName:'旧盘点标签',values:{binaryHash:'a'.repeat(64)},verifiedFields:['binaryHash']};
  const upload=(body:unknown)=>routeV2(new Request('https://runtime.test/v2/machines/application-inventory',
    {method:'POST',headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},body:JSON.stringify(body)}),env,3);
  const v1={schemaVersion:1,batchId:'legacy-v1',observations:[{localUserId:value.localUserId,status:'runtimeObserved',evidence}]};
  expect(await (await upload(v1))!.json()).toMatchObject({status:'accepted',acceptedCount:1});
  expect(await (await upload(v1))!.json()).toMatchObject({status:'duplicate',acceptedCount:1});
  const v2={schemaVersion:2,batchId:'legacy-v2',products:[],variants:[{localUserId:value.localUserId,
    variantKey:'legacy-app',variantRole:'main',scope:'user',sourceKind:'runtime',status:'runtimeObserved',
    evidence:{...evidence,discovery:{role:'application',nameSource:'fileMetadata',sourceKinds:['runtime'],objectKind:'variant',variantRole:'main',scope:'user',sourceKind:'runtime',evidenceLevel:'strong'}}}]};
  expect(await (await upload(v2))!.json()).toMatchObject({status:'accepted',acceptedCount:1});
  expect(await (await upload(v2))!.json()).toMatchObject({status:'duplicate',acceptedCount:1});
  expect(await env.RUNTIME_DB.prepare('SELECT COUNT(*) AS n FROM runtime_application_inventory_v1 WHERE machine_id=?')
    .bind(machine.machineId).first('n')).toBe(1);
  expect(await env.RUNTIME_DB.prepare('SELECT COUNT(*) AS n FROM runtime_application_variants_v1 WHERE machine_id=?')
    .bind(machine.machineId).first('n')).toBe(1);
  expect(await env.RUNTIME_DB.prepare('SELECT COUNT(*) AS n FROM runtime_program_instances_v1 WHERE machine_id=?')
    .bind(machine.machineId).first('n')).toBe(0);
  expect(await env.RUNTIME_DB.prepare('SELECT COUNT(*) AS n FROM runtime_child_app_policy_versions_v1 WHERE account_id=?')
    .bind(machine.accountId).first('n')).toBe(1);
  expect(await env.RUNTIME_DB.prepare('SELECT desired_policy_version FROM runtime_machines_v2 WHERE id=?')
    .bind(machine.machineId).first('desired_policy_version')).toBe(2);
  const after=await readPolicy();
  expect(after!.status).toBe(200);
  expect(after!.headers.get('etag')).toBe(beforeEtag);
  expect(await after!.json()).toEqual(beforeBody);
  expect(await getAppPolicy(env.RUNTIME_DB,machine.accountId,value.childId)).toMatchObject({
    version:1,classifications:[{runtimeIdentity:'legacy-app',classification:'blocked'}],
  });
});
it('规则目录实际读取按家庭鉴权，区分空与旧格式，拒绝不支持方法或静默转换',async()=>{
  const {machine,value}=await fixture(),token=randomToken('');
  await env.RUNTIME_DB.prepare(`INSERT INTO runtime_browser_sessions_v1
    (token_hash,account_id,children_json,created_at_ms,expires_at_ms,last_used_at_ms) VALUES(?1,?2,?3,0,1000,0)`)
    .bind(await sha256Hex(token),machine.accountId,JSON.stringify([{id:value.childId,name:'测试孩子'}])).run();
  const request=(method='GET',auth=true)=>new Request('https://runtime.test/v2/module/program-instance-catalog',
    {method,headers:auth?{authorization:`RuntimeSession ${token}`}:{}});
  await expect(routeV2(request('GET',false),env,3)).rejects.toMatchObject({status:401});
  const empty=await routeV2(request(),env,3);
  expect(await empty!.json()).toEqual({state:'empty',version:0,catalog:null});
  expect(empty!.headers.get('etag')).toBe('"application-knowledge-v0"');
  expect(empty!.headers.get('cache-control')).toBe('no-store');
  const other=await fixture();
  const catalog={schemaVersion:4,version:0,products:[{id:'p',name:'产品',type:'other'}],ownershipRules:[],rules:[],bindings:[]};
  await saveProgramInstanceCatalog(env.RUNTIME_DB,other.machine.accountId,[other.value.childId],'"application-knowledge-v0"',catalog,1);
  expect(await (await routeV2(request(),env,3))!.json()).toMatchObject({state:'empty'});
  await env.RUNTIME_DB.prepare('INSERT INTO runtime_application_knowledge_versions_v1 VALUES(?1,1,?2,?3,1)')
    .bind(machine.accountId,JSON.stringify({schemaVersion:1,version:1,products:[],rules:[],bindings:[]}),'legacy').run();
  expect(await (await routeV2(request(),env,3))!.json()).toEqual({state:'legacy',version:1,catalog:null});
  const saved=await saveProgramInstanceCatalog(env.RUNTIME_DB,machine.accountId,[value.childId],'"application-knowledge-v1"',catalog,2);
  const ready=await routeV2(request(),env,3);
  expect(await ready!.json()).toEqual({state:'available',version:2,catalog:saved});
  expect(ready!.headers.get('etag')).toBe('"application-knowledge-v2"');
  expect((await routeV2(request('DELETE'),env,3))!.status).toBe(405);
  expect(await env.RUNTIME_DB.prepare('SELECT COUNT(*) AS n FROM runtime_application_knowledge_versions_v1 WHERE account_id=?')
    .bind(machine.accountId).first('n')).toBe(2);
  await env.RUNTIME_DB.prepare('INSERT INTO runtime_application_knowledge_versions_v1 VALUES(?1,3,?2,?3,3)')
    .bind(machine.accountId,JSON.stringify({...saved,version:2}),'invalid').run();
  await expect(routeV2(request(),env,4)).rejects.toMatchObject({code:'PROGRAM_INSTANCE_CATALOG_INVALID'});
});
it('目录保存实际路由条件更新并审计，映射待重建，拒绝越界及直接改映射',async()=>{
  const {machine,value}=await fixture(),token=randomToken('');
  const receipt=await registerProgramInstances(env.RUNTIME_DB,machine,value,1);
  await env.RUNTIME_DB.prepare(`INSERT INTO runtime_browser_sessions_v1
    (token_hash,account_id,children_json,created_at_ms,expires_at_ms,last_used_at_ms) VALUES(?1,?2,?3,0,1000,0)`)
    .bind(await sha256Hex(token),machine.accountId,JSON.stringify([{id:value.childId,name:'测试孩子'}])).run();
  const catalog={schemaVersion:4,version:999,products:[{id:'p',name:'产品',type:'other'}],rules:[],bindings:[],
    ownershipRules:[{id:'r',revision:1,enabled:true,platform:'windows',productId:'p',match:{kind:'binaryHash',sha256:'a'.repeat(64)}}]};
  const save=(body:unknown=catalog,etag:string|null='"application-knowledge-v0"',auth=true)=>routeV2(
    new Request('https://runtime.test/v2/module/program-instance-catalog',{method:'PUT',
      headers:{'content-type':'application/json',...(auth?{authorization:`RuntimeSession ${token}`}:{ }),
        ...(etag?{'if-match':etag}:{})},body:JSON.stringify(body)}),env,3);
  await expect(save(catalog,null,false)).rejects.toMatchObject({status:401});
  await expect(save(catalog,null)).rejects.toMatchObject({status:412});
  await expect(save({...catalog,bindings:[{childId:'another-child',products:[],ruleIds:[]}]}))
    .rejects.toMatchObject({status:404,code:'CHILD_NOT_FOUND'});
  await expect(save({...catalog,mappings:[]})).rejects.toMatchObject({status:400});
  await expect(save({...catalog,bindings:[{childId:value.childId,ruleIds:[],products:[{productId:'p',classification:'blocked',enhancedBlocking:true}]}]}))
    .rejects.toMatchObject({status:400,code:'PRODUCT_BLOCK_APPROVAL_REQUIRED'});
  const response=await save();
  expect(response!.status).toBe(200);
  expect(response!.headers.get('etag')).toBe('"application-knowledge-v1"');
  expect(response!.headers.get('cache-control')).toBe('no-store');
  expect(await response!.json()).toEqual({state:'available',version:1,catalog:{...catalog,version:1},mappingState:'pending'});
  const query={childId:value.childId,localUserId:value.localUserId,assignmentVersion:1,
    instanceIds:receipt.items.map(item=>item.instanceId)};
  expect((await readProgramInstanceMappings(env.RUNTIME_DB,machine,query)).items[0].status).toBe('pending');
  await expect(save()).rejects.toMatchObject({status:412});
  expect(await env.RUNTIME_DB.prepare('SELECT COUNT(*) AS n FROM runtime_application_knowledge_audit_v1 WHERE account_id=?')
    .bind(machine.accountId).first('n')).toBe(1);
  await refreshPendingProgramInstanceMappings(env.RUNTIME_DB);
  expect((await readProgramInstanceMappings(env.RUNTIME_DB,machine,query)).items[0]).toMatchObject({status:'confirmed',productId:'p'});
  const withdrawn=await save({...catalog,ownershipRules:[]},'"application-knowledge-v1"');
  expect(await withdrawn!.json()).toMatchObject({version:2,mappingState:'pending'});
  expect((await readProgramInstanceMappings(env.RUNTIME_DB,machine,query)).items[0].status).toBe('pending');
  await refreshPendingProgramInstanceMappings(env.RUNTIME_DB);
  expect((await readProgramInstanceMappings(env.RUNTIME_DB,machine,query)).items[0]).toMatchObject({status:'unresolved',productId:null});
  expect(await env.RUNTIME_DB.prepare('SELECT COUNT(*) AS n FROM runtime_application_knowledge_audit_v1 WHERE account_id=?')
    .bind(machine.accountId).first('n')).toBe(2);
});
it('旧目录消费者不能误读或降级覆盖新版规则，既有版本和政策保持不变',async()=>{
  const {machine,value}=await fixture();
  const legacy={schemaVersion:1 as const,version:0,products:[],rules:[],bindings:[]};
  expect(await getApplicationKnowledge(env.RUNTIME_DB,machine.accountId)).toEqual(legacy);
  const catalog={schemaVersion:4,version:0,products:[],ownershipRules:[],rules:[],bindings:[]};
  await saveProgramInstanceCatalog(env.RUNTIME_DB,machine.accountId,[value.childId],'"application-knowledge-v0"',catalog,1);
  await expect(getApplicationKnowledge(env.RUNTIME_DB,machine.accountId))
    .rejects.toMatchObject({code:'APPLICATION_KNOWLEDGE_READER_NOT_ADAPTED'});
  await expect(putApplicationKnowledge(env.RUNTIME_DB,machine.accountId,[value.childId],
    '"application-knowledge-v1"',legacy,2)).rejects.toMatchObject({code:'APPLICATION_KNOWLEDGE_READER_NOT_ADAPTED'});
  expect(await env.RUNTIME_DB.prepare('SELECT COUNT(*) AS n FROM runtime_application_knowledge_versions_v1 WHERE account_id=?')
    .bind(machine.accountId).first('n')).toBe(1);
  expect(await env.RUNTIME_DB.prepare('SELECT COUNT(*) AS n FROM runtime_child_app_policy_versions_v1 WHERE account_id=?')
    .bind(machine.accountId).first('n')).toBe(0);
  const other=await fixture();
  await env.RUNTIME_DB.prepare('INSERT INTO runtime_application_knowledge_versions_v1 VALUES(?1,1,?2,?3,1)')
    .bind(other.machine.accountId,JSON.stringify({...legacy,version:1}),'legacy').run();
  expect(await getApplicationKnowledge(env.RUNTIME_DB,other.machine.accountId)).toEqual({...legacy,version:1});
});
it('家长实例列表按孩子隔离、分页不重项，规则过期不展示旧产品，禁止直接写映射',async()=>{
  const {machine,value}=await fixture();
  const input={...value,items:Array.from({length:51},(_,n)=>({...value.items[0],instance:{...value.items[0].instance,
    locationRef:(n+1).toString(16).padStart(32,'0')}}))};
  const receipt=await registerProgramInstances(env.RUNTIME_DB,machine,input,1);
  const first=await listChildProgramInstances(env.RUNTIME_DB,machine.accountId,value.childId,null);
  expect(first.items).toHaveLength(50);expect(first.nextAfterInstanceId).not.toBeNull();
  expect(first.items.every(item=>item.status==='pending'&&item.product===null)).toBe(true);
  expect(first.items[0].evidence).toEqual(value.items[0].evidence);
  expect(first.items[0]).not.toHaveProperty('locationRef');expect(first.items[0]).not.toHaveProperty('path');
  const second=await listChildProgramInstances(env.RUNTIME_DB,machine.accountId,value.childId,first.nextAfterInstanceId);
  expect(second.items).toHaveLength(1);expect(second.nextAfterInstanceId).toBeNull();
  expect(new Set([...first.items,...second.items].map(item=>item.instanceId)).size).toBe(51);
  expect((await listChildProgramInstances(env.RUNTIME_DB,'other-family',value.childId,null)).items).toEqual([]);
  expect((await listChildProgramInstances(env.RUNTIME_DB,machine.accountId,'other-child',null)).items).toEqual([]);
  const catalog={schemaVersion:4,version:0,products:[{id:'p',name:'已确认产品',type:'other'}],
    ownershipRules:[{id:'r',revision:1,enabled:true,platform:'windows',productId:'p',match:{kind:'binaryHash',sha256:'a'.repeat(64)}}],
    rules:[],bindings:[]};
  await saveProgramInstanceCatalog(env.RUNTIME_DB,machine.accountId,[value.childId],'"application-knowledge-v0"',catalog,2);
  await materializeProgramInstanceMappings(env.RUNTIME_DB,machine.accountId,value.childId,
    receipt.items.map(item=>({machineId:machine.machineId,instanceId:item.instanceId})));
  const token=randomToken('');
  await env.RUNTIME_DB.prepare(`INSERT INTO runtime_browser_sessions_v1
    (token_hash,account_id,children_json,created_at_ms,expires_at_ms,last_used_at_ms) VALUES(?1,?2,?3,0,1000,0)`)
    .bind(await sha256Hex(token),machine.accountId,JSON.stringify([{id:value.childId,name:'测试孩子'}])).run();
  const request=(child:string=value.childId,method='GET',extra='')=>new Request(
    `https://runtime.test/v2/module/program-instances?childId=${child}${extra}`,
    {method,headers:{authorization:`RuntimeSession ${token}`}});
  const response=await routeV2(request(),env,3);
  expect(response?.status).toBe(200);
  expect(await response!.json()).toMatchObject({childId:value.childId,items:expect.arrayContaining([
    expect.objectContaining({status:'confirmed',product:{id:'p',name:'已确认产品'}})])});
  expect((await routeV2(request(value.childId,'PUT'),env,3))?.status).toBe(405);
  await expect(routeV2(request('another-child'),env,3)).rejects.toMatchObject({code:'CHILD_NOT_FOUND'});
  await expect(routeV2(request(value.childId,'GET','&afterInstanceId=bad'),env,3))
    .rejects.toMatchObject({code:'INVALID_INSTANCE_CURSOR'});
  await saveProgramInstanceCatalog(env.RUNTIME_DB,machine.accountId,[value.childId],'"application-knowledge-v1"',
    {...catalog,ownershipRules:[]},4);
  const stale=await listChildProgramInstances(env.RUNTIME_DB,machine.accountId,value.childId,null);
  expect(stale.catalogVersion).toBe(2);
  expect(stale.items.every(item=>item.status==='pending'&&item.product===null)).toBe(true);
  await materializeProgramInstanceMappings(env.RUNTIME_DB,machine.accountId,value.childId,
    receipt.items.map(item=>({machineId:machine.machineId,instanceId:item.instanceId})));
  expect((await listChildProgramInstances(env.RUNTIME_DB,machine.accountId,value.childId,null)).items
    .every(item=>item.status==='unresolved'&&item.product===null)).toBe(true);
});
it('登记实际路由触发匹配，失败ACK仍有效，后台恢复及规则撤销自动重建',async()=>{
  const {machine,value,token}=await fixture();
  const catalog={schemaVersion:4,version:0,products:[{id:'product-a',name:'应用A',type:'other'}],
    ownershipRules:[{id:'rule-a',revision:1,enabled:true,platform:'windows',productId:'product-a',match:{kind:'binaryHash',sha256:'a'.repeat(64)}}],
    rules:[],bindings:[]};
  await saveProgramInstanceCatalog(env.RUNTIME_DB,machine.accountId,[value.childId],'"application-knowledge-v0"',catalog,1);
  // 模拟登记已保存后后台匹配失败；不能将其当成未收到证据。
  await env.RUNTIME_DB.prepare(`CREATE TRIGGER test_mapping_failure BEFORE INSERT ON runtime_program_instance_mappings_v1
    BEGIN SELECT RAISE(ABORT,'test failure'); END;`).run();
  const deferred:Promise<unknown>[]=[];
  const response=await routeV2(new Request('https://runtime.test/v2/machines/program-instances',{
    method:'POST',headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},body:JSON.stringify(value)}),env,2,p=>deferred.push(p));
  expect(response?.status).toBe(200);
  const receipt=await response!.json() as {items:Array<{instanceId:string}>};
  await Promise.all(deferred);
  await env.RUNTIME_DB.exec('DROP TRIGGER test_mapping_failure');
  const query={childId:value.childId,localUserId:value.localUserId,assignmentVersion:1,instanceIds:receipt.items.map(i=>i.instanceId)};
  expect((await readProgramInstanceMappings(env.RUNTIME_DB,machine,query)).items[0]).toMatchObject({status:'pending',productId:null});
  expect(await refreshPendingProgramInstanceMappings(env.RUNTIME_DB)).toEqual({processedCount:1,updatedCount:1});
  expect((await readProgramInstanceMappings(env.RUNTIME_DB,machine,query)).items[0]).toMatchObject({status:'confirmed',productId:'product-a'});
  expect(await refreshPendingProgramInstanceMappings(env.RUNTIME_DB)).toEqual({processedCount:0,updatedCount:0});
  await saveProgramInstanceCatalog(env.RUNTIME_DB,machine.accountId,[value.childId],'"application-knowledge-v1"',
    {...catalog,ownershipRules:[]},3);
  expect((await readProgramInstanceMappings(env.RUNTIME_DB,machine,query)).items[0].status).toBe('pending');
  expect(await refreshPendingProgramInstanceMappings(env.RUNTIME_DB)).toEqual({processedCount:1,updatedCount:1});
  expect((await readProgramInstanceMappings(env.RUNTIME_DB,machine,query)).items[0]).toMatchObject({status:'unresolved',productId:null});
});
it('产品身份投影只附目录名称和成员，不合计实例用量，按孩子隔离',async()=>{
  const {machine,value}=await fixture();
  const registered=await registerProgramInstances(env.RUNTIME_DB,machine,{...value,items:[value.items[0],
    {...value.items[0],instance:{...value.items[0].instance,locationRef:'2'.repeat(32)}}]},1);
  const catalog={schemaVersion:4,version:0,products:[{id:'p',name:'名称一',type:'other'}],
    ownershipRules:[{id:'r',revision:1,enabled:true,platform:'windows',productId:'p',match:{kind:'binaryHash',sha256:'a'.repeat(64)}}],rules:[],bindings:[]};
  await saveProgramInstanceCatalog(env.RUNTIME_DB,machine.accountId,[value.childId],'"application-knowledge-v0"',catalog,2);
  const keys=registered.items.map(item=>'instance:'+item.instanceId).sort();
  const subjects=[...keys,'observation:'+'b'.repeat(64)];
  const read=(child=value.childId)=>readChildProgramIdentityProjection(env.RUNTIME_DB,machine.accountId,child,subjects);
  await refreshPendingProgramInstanceMappings(env.RUNTIME_DB);
  const first=await read();
  expect(first.products).toEqual([{id:'p',name:'名称一',subjectKeys:keys}]);
  expect(first.items.filter(item=>item.status==='confirmed')).toHaveLength(2);
  expect(first.items.find(item=>item.subjectKey.startsWith('observation:'))).toMatchObject({status:'unresolved',productId:null});
  expect(await readChildProgramIdentityProjection(env.RUNTIME_DB,machine.accountId,'other-child',subjects))
    .toMatchObject({products:[],items:expect.arrayContaining([{subjectKey:keys[0],status:'pending',productId:null}])});
  await saveProgramInstanceCatalog(env.RUNTIME_DB,machine.accountId,[value.childId],'"application-knowledge-v1"',
    {...catalog,products:[{...catalog.products[0],name:'名称二'}]},3);
  expect((await read()).products).toEqual([]);
  await refreshPendingProgramInstanceMappings(env.RUNTIME_DB);
  const renamed=await read();
  expect(renamed.products).toEqual([{id:'p',name:'名称二',subjectKeys:keys}]);
  expect(renamed.revision).not.toBe(first.revision);
  expect(renamed.products[0]).not.toHaveProperty('duration');
  expect(await env.RUNTIME_DB.prepare('SELECT COUNT(*) AS n FROM runtime_program_instances_v1 WHERE machine_id=?').bind(machine.machineId).first('n')).toBe(2);
});
it('真实机器路由认证→能力→登记→持久化→ACK；无凭据与越界请求拒绝',async()=>{
  const {machine,value,token}=await fixture();
  const request=(path:string,body?:unknown,auth=token)=>new Request('https://runtime.test/v2/machines/'+path,{
    method:body===undefined?'GET':'POST',headers:{authorization:`Bearer ${auth}`,'content-type':'application/json'},
    ...(body===undefined?{}:{body:JSON.stringify(body)})});
  await expect(routeV2(request('program-instances/capabilities',undefined,''),env,1)).rejects.toMatchObject({status:401});
  const caps=await routeV2(request('program-instances/capabilities'),env,2);
  expect(await caps!.json()).toEqual({schemaVersion:1,enabled:true,capabilities:['program-instance-registration-v1']});
  expect((await routeV2(request('program-instances'),env,3))!.status).toBe(405);
  await expect(routeV2(request('program-instances',{...value,childId:'wrong'}),env,4)).rejects.toMatchObject({status:403});
  const response=await routeV2(request('program-instances',value),env,5);
  expect(response!.status).toBe(200);
  const receipt=await response!.json() as {childId:string;items:Array<{instanceId:string;evidenceRevision:number;evidenceHash:string}>};
  expect(receipt.childId).toBe(value.childId); expect(receipt.items).toHaveLength(1);
  const saved=await env.RUNTIME_DB.prepare('SELECT evidence_revision,evidence_hash FROM runtime_program_instances_v1 WHERE machine_id=? AND instance_id=?')
    .bind(machine.machineId,receipt.items[0].instanceId).first<{evidence_revision:number;evidence_hash:string}>();
  expect(saved).toEqual({evidence_revision:receipt.items[0].evidenceRevision,evidence_hash:receipt.items[0].evidenceHash});
  await expect(routeV2(new Request('https://runtime.test/v2/machines/program-instances',{
    method:'POST',headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},body:' '.repeat(262145)}),env,6))
    .rejects.toMatchObject({status:413});
  await env.RUNTIME_DB.prepare('UPDATE runtime_machines_v2 SET revoked_at_ms=7 WHERE id=?').bind(machine.machineId).run();
  await expect(routeV2(request('program-instances',value),env,8)).rejects.toMatchObject({status:401});
});
it('保存后ACK、重复不增加、下降版本不覆盖、更高证据修订可替换',async()=>{
  const {machine,value}=await fixture();
  const first=await registerProgramInstances(env.RUNTIME_DB,machine,value,1);
  expect(await registerProgramInstances(env.RUNTIME_DB,machine,value,2)).toEqual(first);
  const newer={...value,items:[{...value.items[0],evidenceRevision:2,evidence:{platform:'windows',verified:{}}}]};
  const second=await registerProgramInstances(env.RUNTIME_DB,machine,newer,3);
  expect(second.items[0].evidenceRevision).toBe(2);
  expect(second.items[0].evidenceHash).not.toBe(first.items[0].evidenceHash);
  expect(await registerProgramInstances(env.RUNTIME_DB,machine,value,4)).toEqual(second);
  expect(await env.RUNTIME_DB.prepare('SELECT COUNT(*) AS n FROM runtime_program_instances_v1 WHERE machine_id=?')
    .bind(machine.machineId).first('n')).toBe(1);
});
it('同版本冲突整批回滚，不提前ACK或留下半批实例',async()=>{
  const {machine,value}=await fixture();
  await registerProgramInstances(env.RUNTIME_DB,machine,value,1);
  const other={...value.items[0],instance:{...value.items[0].instance,locationRef:'2'.repeat(32)}};
  const conflict={...value.items[0],evidence:{platform:'windows',verified:{}}};
  await expect(registerProgramInstances(env.RUNTIME_DB,machine,{...value,items:[other,conflict]},2))
    .rejects.toMatchObject({status:409,code:'PROGRAM_INSTANCE_REVISION_CONFLICT'});
  expect(await env.RUNTIME_DB.prepare('SELECT COUNT(*) AS n FROM runtime_program_instances_v1 WHERE machine_id=?')
    .bind(machine.machineId).first('n')).toBe(1);
});
it('跨家庭、孩子、用户、撤销机器拒绝，历史分配保留旧孩子范围',async()=>{
  const {machine,value}=await fixture();
  for(const changed of [{...machine,accountId:'another-family'},{...machine,revoked:true}])
    await expect(registerProgramInstances(env.RUNTIME_DB,changed,value,1)).rejects.toMatchObject({status:403});
  await expect(registerProgramInstances(env.RUNTIME_DB,machine,{...value,childId:'another-child'},1)).rejects.toMatchObject({status:403});
  await expect(registerProgramInstances(env.RUNTIME_DB,machine,{...value,localUserId:'another-user'},1)).rejects.toMatchObject({status:403});
  await env.RUNTIME_DB.prepare(`INSERT INTO runtime_user_assignments_v2 VALUES(?1,?2,2,'child-b',1,'override',10,10)`)
    .bind(machine.machineId,value.localUserId).run();
  await registerProgramInstances(env.RUNTIME_DB,machine,value,11);
  await registerProgramInstances(env.RUNTIME_DB,machine,{...value,childId:'child-b',assignmentVersion:2},12);
  const scopes=await env.RUNTIME_DB.prepare('SELECT child_id FROM runtime_program_instance_scopes_v1 WHERE machine_id=?')
    .bind(machine.machineId).all<{child_id:string}>();
  expect(new Set(scopes.results.map(s=>s.child_id))).toEqual(new Set([value.childId,'child-b']));
});
it('数据库规则生成孩子映射，改名不改身份，撤销恢复未识别，跨范围拒绝',async()=>{
  const {machine,value}=await fixture();
  const receipt=await registerProgramInstances(env.RUNTIME_DB,machine,value,1);
  const refs=receipt.items.map(item=>({machineId:machine.machineId,instanceId:item.instanceId}));
  expect(await materializeProgramInstanceMappings(env.RUNTIME_DB,machine.accountId,value.childId,refs))
    .toEqual({state:'catalog_unavailable',updatedCount:0});
  const rule={id:'rule-a',revision:1,enabled:true,platform:'windows',productId:'product-a',match:{kind:'binaryHash',sha256:'a'.repeat(64)}};
  const catalog={schemaVersion:4,version:1,products:[{id:'product-a',name:'Name A',type:'other'}],ownershipRules:[rule],rules:[],bindings:[]};
  const save=(model:typeof catalog)=>saveProgramInstanceCatalog(env.RUNTIME_DB,machine.accountId,[value.childId],
    `"application-knowledge-v${model.version-1}"`,model,model.version);
  await save(catalog);
  expect(await materializeProgramInstanceMappings(env.RUNTIME_DB,machine.accountId,value.childId,refs))
    .toEqual({state:'processed',updatedCount:1});
  const read=()=>env.RUNTIME_DB.prepare('SELECT status,product_id,rule_set_version FROM runtime_program_instance_mappings_v1 WHERE child_id=? AND machine_id=?')
    .bind(value.childId,machine.machineId).first();
  expect(await read()).toEqual({status:'confirmed',product_id:'product-a',rule_set_version:1});
  await expect(materializeProgramInstanceMappings(env.RUNTIME_DB,machine.accountId,'not-this-child',refs)).rejects.toMatchObject({status:404});
  await save({...catalog,version:2,products:[{...catalog.products[0],name:'Renamed'}]});
  await materializeProgramInstanceMappings(env.RUNTIME_DB,machine.accountId,value.childId,refs);
  expect(await read()).toEqual({status:'confirmed',product_id:'product-a',rule_set_version:2});
  await save({...catalog,version:3,ownershipRules:[]});
  await materializeProgramInstanceMappings(env.RUNTIME_DB,machine.accountId,value.childId,refs);
  expect(await read()).toEqual({status:'unresolved',product_id:null,rule_set_version:3});
  expect(await env.RUNTIME_DB.prepare('SELECT evidence_revision FROM runtime_program_instances_v1 WHERE machine_id=?')
    .bind(machine.machineId).first('evidence_revision')).toBe(1);
});

it('当前分配读取持久映射；旧规则和新证据使结果待更新，不泄露旧产品；改绑撤销读取',async()=>{
  const {machine,value,token}=await fixture();
  const receipt=await registerProgramInstances(env.RUNTIME_DB,machine,value,1);
  const query={childId:value.childId,localUserId:value.localUserId,assignmentVersion:1,instanceIds:receipt.items.map(i=>i.instanceId)};
  const read=()=>readProgramInstanceMappings(env.RUNTIME_DB,machine,query);
  expect((await read()).items[0]).toMatchObject({status:'pending',productId:null});
  const catalog={schemaVersion:4,version:1,products:[{id:'product-a',name:'Name A',type:'other'}],
    ownershipRules:[{id:'rule-a',revision:1,enabled:true,platform:'windows',productId:'product-a',match:{kind:'binaryHash',sha256:'a'.repeat(64)}}],rules:[],bindings:[]};
  const save=(model:typeof catalog)=>saveProgramInstanceCatalog(env.RUNTIME_DB,machine.accountId,[value.childId],
    `"application-knowledge-v${model.version-1}"`,model,model.version);
  const materialize=()=>materializeProgramInstanceMappings(env.RUNTIME_DB,machine.accountId,value.childId,
    query.instanceIds.map(instanceId=>({machineId:machine.machineId,instanceId})));
  await save(catalog); await materialize();
  const response=await routeV2(new Request('https://runtime.test/v2/machines/program-instances/mappings/read',{
    method:'POST',headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},body:JSON.stringify(query)}),env,2);
  expect(await response!.json()).toMatchObject({catalogVersion:1,items:[{status:'confirmed',productId:'product-a'}],products:[{id:'product-a',name:'Name A'}]});
  const context=await routeV2(new Request('https://runtime.test/v2/machines/program-instances/projection-context/read',{
    method:'POST',headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},body:JSON.stringify(query)}),env,2);
  expect(await context!.json()).toMatchObject({schemaVersion:2,catalogVersion:1,
    products:[{id:'product-a',name:'Name A',type:'other'}],rules:[],binding:{childId:value.childId,products:[],ruleIds:[]}});
  await save({...catalog,version:2,products:[{...catalog.products[0],name:'Renamed'}]});
  expect(await read()).toMatchObject({items:[{status:'pending',productId:null}],products:[]});
  await materialize(); expect((await read()).products).toEqual([{id:'product-a',name:'Renamed'}]);
  await registerProgramInstances(env.RUNTIME_DB,machine,{...value,items:[{...value.items[0],evidenceRevision:2,evidence:{platform:'windows',verified:{}}}]},3);
  expect((await read()).items[0].status).toBe('pending');
  await materialize(); expect((await read()).items[0].status).toBe('unresolved');
  await expect(readProgramInstanceMappings(env.RUNTIME_DB,machine,{...query,instanceIds:['f'.repeat(64)]})).rejects.toMatchObject({status:404});
  await expect(readProgramInstanceMappings(env.RUNTIME_DB,machine,{...query,instanceIds:[...query.instanceIds,...query.instanceIds]})).rejects.toMatchObject({status:400});
  await expect(readProgramInstanceMappings(env.RUNTIME_DB,{...machine,accountId:'other'},query)).rejects.toMatchObject({status:403});
  await env.RUNTIME_DB.prepare(`INSERT INTO runtime_user_assignments_v2 VALUES(?1,?2,2,'child-b',1,'override',10,10)`)
    .bind(machine.machineId,value.localUserId).run();
  await expect(read()).rejects.toMatchObject({status:403});
});

it('机器实际分类上下文支持显式封锁和解除，缺排除证据不会变为自动封锁',async()=>{
  const {machine,value,token}=await fixture();
  const receipt=await registerProgramInstances(env.RUNTIME_DB,machine,value,1);
  const instanceId=receipt.items[0].instanceId;
  const query={childId:value.childId,localUserId:value.localUserId,assignmentVersion:1,instanceIds:[instanceId]};
  const rule={id:'class-rule',name:'分类规则',kind:'product',productId:'p',match:{operator:'all',conditions:[]},
    exclude:[{operator:'all',conditions:[{field:'fileSeriesKey',value:'b'.repeat(64)}]}],
    mode:'automatic',classification:'blocked',type:'other',enabled:true,source:'fixture',reason:'隔离接线回归'};
  const catalog={schemaVersion:4,version:0,products:[{id:'p',name:'产品P',type:'other'}],
    ownershipRules:[{id:'own',revision:1,enabled:true,platform:'windows',productId:'p',
      match:{kind:'binaryHash',sha256:'a'.repeat(64)}}],rules:[rule]};
  const cases=[{classification:'blocked',status:'explicit'},{classification:'other',status:'explicit'},
    {classification:null,status:'unknown'}];
  for(let index=0;index<cases.length;index++){
    const expected=cases[index];
    await saveProgramInstanceCatalog(env.RUNTIME_DB,machine.accountId,[value.childId],
      `"application-knowledge-v${index}"`,{...catalog,bindings:[{childId:value.childId,ruleIds:[rule.id],
        products:expected.classification?[{productId:'p',classification:expected.classification}]:[]}]},index+2);
    await materializeProgramInstanceMappings(env.RUNTIME_DB,machine.accountId,value.childId,[{machineId:machine.machineId,instanceId}]);
    const response=await routeV2(new Request('https://runtime.test/v2/machines/program-instances/projection-context/read',{
      method:'POST',headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},body:JSON.stringify(query)}),env,10);
    const context=parseProgramInstanceProjectionContext(await response!.json(),query);
    expect(context.catalogVersion).toBe(index+1);
    expect(context.rules).toEqual([rule]);
    expect(resolveProgramInstanceClassification(context,value.childId,instanceId,
      parseProductOwnershipEvidence(value.items[0].evidence))).toMatchObject(expected);
  }
});

it('同家庭两孩子复用归属规则，改向冲突撤销通过规则重建且不改变实例证据',async()=>{
  const a=await fixture(),b=await fixture();
  await env.RUNTIME_DB.prepare('UPDATE runtime_machines_v2 SET account_id=? WHERE id=?')
    .bind(a.machine.accountId,b.machine.machineId).run();
  b.machine.accountId=a.machine.accountId;
  const sources=[a,b];
  const receipts=await Promise.all(sources.map(s=>registerProgramInstances(env.RUNTIME_DB,s.machine,s.value,1)));
  expect(receipts[0].items[0].instanceId).not.toBe(receipts[1].items[0].instanceId);
  const evidence=()=>env.RUNTIME_DB.prepare(`SELECT machine_id,instance_id,descriptor_json,evidence_revision,evidence_json,evidence_hash
    FROM runtime_program_instances_v1 WHERE machine_id IN (?1,?2) ORDER BY machine_id`)
    .bind(a.machine.machineId,b.machine.machineId).all();
  const before=(await evidence()).results;
  const rule={id:'shared-rule',revision:1,enabled:true,platform:'windows',productId:'p',
    match:{kind:'binaryHash',sha256:'a'.repeat(64)}};
  const catalog={schemaVersion:4,version:0,products:[{id:'p',name:'产品P',type:'other'},
    {id:'q',name:'产品Q',type:'other'}],ownershipRules:[rule],rules:[],bindings:[]};
  const read=async(index:number)=>{
    const s=sources[index];
    const response=await routeV2(new Request('https://runtime.test/v2/machines/program-instances/mappings/read',{
      method:'POST',headers:{authorization:`Bearer ${s.token}`,'content-type':'application/json'},
      body:JSON.stringify({childId:s.value.childId,localUserId:s.value.localUserId,assignmentVersion:1,
        instanceIds:receipts[index].items.map(i=>i.instanceId)})}),env,10);
    return response!.json();
  };
  const stages=[{rules:[rule],status:'confirmed',productId:'p'},
    {rules:[{...rule,revision:2,productId:'q'}],status:'confirmed',productId:'q'},
    {rules:[rule,{...rule,id:'conflicting-rule',productId:'q'}],status:'conflict',productId:null},
    {rules:[],status:'unresolved',productId:null}];
  for(let index=0;index<stages.length;index++){
    const stage=stages[index];
    await saveProgramInstanceCatalog(env.RUNTIME_DB,a.machine.accountId,sources.map(s=>s.value.childId),
      `"application-knowledge-v${index}"`,{...catalog,ownershipRules:stage.rules},index+2);
    for(let source=0;source<sources.length;source++){
      expect(await read(source)).toMatchObject({items:[{status:'pending',productId:null}]});
      const s=sources[source];
      await materializeProgramInstanceMappings(env.RUNTIME_DB,s.machine.accountId,s.value.childId,
        receipts[source].items.map(i=>({machineId:s.machine.machineId,instanceId:i.instanceId})));
      expect(await read(source)).toMatchObject({childId:s.value.childId,catalogVersion:index+1,
        items:[{instanceId:receipts[source].items[0].instanceId,status:stage.status,productId:stage.productId}]});
    }
    expect((await evidence()).results).toEqual(before);
  }
  await expect(readProgramInstanceMappings(env.RUNTIME_DB,a.machine,{childId:b.value.childId,
    localUserId:a.value.localUserId,assignmentVersion:1,instanceIds:[receipts[1].items[0].instanceId]}))
    .rejects.toMatchObject({status:403});
});

it('目录与审计原子保存、服务端版本递增、过期编辑和未授权孩子拒绝，不写政策或映射',async()=>{
  const {machine,value}=await fixture();
  const catalog={schemaVersion:4,version:999,products:[{id:'a',name:'A',type:'other'}],ownershipRules:[],rules:[],bindings:[]};
  const save=(expected:string,input:unknown=catalog)=>saveProgramInstanceCatalog(env.RUNTIME_DB,machine.accountId,[value.childId],expected,input,1);
  expect((await save('"application-knowledge-v0"')).version).toBe(1);
  expect(catalog.version).toBe(999);
  await expect(save('"application-knowledge-v0"')).rejects.toMatchObject({status:412});
  await expect(save('"application-knowledge-v1"',{...catalog,bindings:[{childId:'other',products:[],ruleIds:[]}]}))
    .rejects.toMatchObject({status:404});
  await expect(save('"application-knowledge-v1"',{...catalog,products:[{...catalog.products[0],
    suspectedMatchers:[{platform:'windows',signerKey:'a'.repeat(64),productName:'A'}]}]}))
    .rejects.toMatchObject({status:400,code:'UNREVIEWED_PRODUCT_BLOCK_MATCHER'});
  const stored=await env.RUNTIME_DB.prepare('SELECT payload_hash FROM runtime_application_knowledge_versions_v1 WHERE account_id=? AND version=1')
    .bind(machine.accountId).first('payload_hash');
  expect(await env.RUNTIME_DB.prepare('SELECT previous_hash,next_hash FROM runtime_application_knowledge_audit_v1 WHERE account_id=? AND version=1')
    .bind(machine.accountId).first()).toEqual({previous_hash:null,next_hash:stored});
  const concurrent=await Promise.allSettled([save('"application-knowledge-v1"'),save('"application-knowledge-v1"')]);
  expect(concurrent.filter(result=>result.status==='fulfilled')).toHaveLength(1);
  const rejected=concurrent.find(result=>result.status==='rejected');
  expect(rejected?.status==='rejected' ? rejected.reason : null).toMatchObject({status:412});
  expect(await env.RUNTIME_DB.prepare('SELECT previous_hash FROM runtime_application_knowledge_audit_v1 WHERE account_id=? AND version=2')
    .bind(machine.accountId).first('previous_hash')).toBe(stored);
  await env.RUNTIME_DB.prepare(`INSERT INTO runtime_application_knowledge_audit_v1 VALUES(?1,3,'publish',NULL,'reserved',0)`)
    .bind(machine.accountId).run();
  await expect(save('"application-knowledge-v2"')).rejects.toMatchObject({status:412});
  expect(await env.RUNTIME_DB.prepare('SELECT MAX(version) FROM runtime_application_knowledge_versions_v1 WHERE account_id=?')
    .bind(machine.accountId).first('MAX(version)')).toBe(2);
  expect(await env.RUNTIME_DB.prepare('SELECT COUNT(*) AS n FROM runtime_child_app_policy_versions_v1 WHERE account_id=?')
    .bind(machine.accountId).first('n')).toBe(0);
  expect(await env.RUNTIME_DB.prepare('SELECT COUNT(*) AS n FROM runtime_program_instance_mappings_v1 WHERE machine_id=?')
    .bind(machine.machineId).first('n')).toBe(0);
});
