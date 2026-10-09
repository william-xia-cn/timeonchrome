import { env } from 'cloudflare:workers';
import { expect, it, vi } from 'vitest';
import { registerProgramInstances, materializeProgramInstanceMappings, readProgramInstanceMappings, saveProgramInstanceCatalog, refreshPendingProgramInstanceMappings } from '../src/programInstances';
import type { MachineSelfResponse } from '../src/contracts';
import { sha256Hex, randomToken } from '../src/crypto';
import { routeV2 } from '../src/v2Routes';
import { readChildProgramIdentityProjection, listChildProgramInstances } from '../src/programInstances';
import { getApplicationKnowledge, putApplicationKnowledge, effectiveApplicationKnowledge, syncApplicationInventory } from '../src/applicationKnowledge';
import * as appPolicyModule from '../src/appPolicy';
import { getAppPolicy, putAppPolicy } from '../src/appPolicy';
import { parseProductOwnershipEvidence, resolveProgramInstanceClassification,parseProgramInstallationLinkReceipt } from '@timeonchrome/app-runtime-contracts/classification';
import { parseProgramInstanceProjectionContext } from '@timeonchrome/app-runtime-contracts/classification-validation';
import {readProgramPolicyStatus,receiveProgramPolicyStatus} from '../src/programPolicyStatus';
import { updateUserAssignment } from '../src/v2Repository';
import {receiveProgramInstallationLinks,readProgramInstallationSummaries} from '../src/programInstallationLinks';

it('实例列表读取安装正向事实、有界摘要与家庭孩子隔离，不读取原账或猜产品',async()=>{
  const f=await installationFixture(),keys=Array.from({length:8},(_,i)=>`entry-${i}`);
  await f.scan(keys);
  await receiveProgramInstallationLinks(env.RUNTIME_DB,f.machine,{...f.input,
    links:keys.map(variantKey=>({variantKey,instanceId:f.input.links[0].instanceId}))});
  const page=await listChildProgramInstances(env.RUNTIME_DB,f.machine.accountId,f.value.childId,null);
  expect(page.items).toHaveLength(1);
  expect(page.items[0]).toMatchObject({status:'pending',product:null,installation:{state:'available',entryCount:8}});
  expect(page.items[0].installation).toMatchObject({references:keys.slice(0,5).map(variantKey=>({variantKey,lastScanReceivedAtMs:0}))});
  const refs=[{machineId:f.machine.machineId,instanceId:f.input.links[0].instanceId}];
  expect([...(await readProgramInstallationSummaries(env.RUNTIME_DB,'another-family',f.value.childId,refs)).values()])
    .toEqual([{state:'available',entryCount:0,latestScanEntryCount:0,references:[]}]);
  expect([...(await readProgramInstallationSummaries(env.RUNTIME_DB,f.machine.accountId,'another-child',refs)).values()])
    .toEqual([{state:'available',entryCount:0,latestScanEntryCount:0,references:[]}]);
  const later='2'.repeat(32);
  await env.RUNTIME_DB.prepare(`INSERT INTO runtime_application_inventory_scans_v2 VALUES(?1,?2,?3,1,0,1,'[]',1,1,100)`)
    .bind(f.machine.machineId,f.value.localUserId,later).run();
  await env.RUNTIME_DB.prepare(`INSERT INTO runtime_application_inventory_scan_batches_v2 VALUES(?1,?2,0,0,1,'later',?3)`)
    .bind(f.machine.machineId,later,JSON.stringify([`v\n${f.value.localUserId}\nentry-7`])).run();
  await receiveProgramInstallationLinks(env.RUNTIME_DB,f.machine,{...f.input,scanId:later,
    links:[{variantKey:'entry-7',instanceId:f.input.links[0].instanceId}]});
  const refreshed=await listChildProgramInstances(env.RUNTIME_DB,f.machine.accountId,f.value.childId,null);
  expect(refreshed.items[0].installation).toMatchObject({entryCount:8,references:[{variantKey:'entry-7',lastScanReceivedAtMs:100},{},{},{},{}]});
});

it('产品目录正式读取按孩子映射聚合安装，使用来源不可读不清空目录依据',async()=>{
  const f=await installationFixture();await f.scan();
  await env.RUNTIME_DB.prepare(`INSERT INTO runtime_application_variants_v1
    VALUES(?1,?2,'windows','entry-a',NULL,'label','{}','application','user','shortcut','installed',0,0)`)
    .bind(f.machine.machineId,f.value.localUserId).run();
  await receiveProgramInstallationLinks(env.RUNTIME_DB,f.machine,f.input);
  await saveProgramInstanceCatalog(env.RUNTIME_DB,f.machine.accountId,[f.value.childId],'"application-knowledge-v0"',{
    schemaVersion:4,version:0,products:[{id:'p',name:'产品',type:'other'}],rules:[],bindings:[],
    ownershipRules:[{id:'r',revision:1,enabled:true,platform:'windows',productId:'p',match:{kind:'binaryHash',sha256:'a'.repeat(64)}}]},1);
  await materializeProgramInstanceMappings(env.RUNTIME_DB,f.machine.accountId,f.value.childId,
    f.input.links.map(item=>({machineId:f.machine.machineId,instanceId:item.instanceId})));
  const now=Date.UTC(2026,9,10),token=randomToken('');
  await env.RUNTIME_DB.prepare(`INSERT INTO runtime_browser_sessions_v1
    (token_hash,account_id,children_json,created_at_ms,expires_at_ms,last_used_at_ms) VALUES(?1,?2,?3,?4,?5,?4)`)
    .bind(await sha256Hex(token),f.machine.accountId,JSON.stringify([{id:f.value.childId,name:'孩子'}]),now,now+60000).run();
  const request=(child:string=f.value.childId,method='GET',auth=token)=>new Request(
    `https://runtime.test/v2/module/program-instance-directory?childId=${child}`,
    {method,headers:{authorization:`RuntimeSession ${auth}`}});
  const expected={childId:f.value.childId,catalogVersion:1,installationState:'available',usage:{state:'unavailable'},
    facts:[{productId:'p',platform:'windows',instanceCount:1,installationObserved:true,usageObserved:false,lastUsedDate:null}]};
  expect(await (await routeV2(request(),env,now))!.json()).toMatchObject(expected);
  await expect(routeV2(request('another-child'),env,now)).rejects.toMatchObject({code:'CHILD_NOT_FOUND'});
  await expect(routeV2(request(f.value.childId,'GET','invalid'),env,now)).rejects.toMatchObject({status:401});
  expect((await routeV2(request(f.value.childId,'PUT'),env,now))?.status).toBe(405);
  await env.RUNTIME_DB.prepare('ALTER TABLE runtime_application_account_publications_v1 RENAME TO directory_usage_unavailable').run();
  try {
    expect(await (await routeV2(request(),env,now))!.json()).toMatchObject({...expected,
      usage:{state:'unavailable',reasonCode:'APPLICATION_DIRECTORY_USAGE_UNAVAILABLE'}});
  }finally {
    await env.RUNTIME_DB.prepare('ALTER TABLE directory_usage_unavailable RENAME TO runtime_application_account_publications_v1').run();
  }
});

it('当前扫描引用不沿用软件更新前的实例，历史摘要仍保留',async()=>{
  const f=await installationFixture();await f.scan();
  await env.RUNTIME_DB.prepare(`INSERT INTO runtime_application_variants_v1
    VALUES(?1,?2,'windows','entry-a',NULL,'label','{}','application','user','shortcut','installed',0,0)`)
    .bind(f.machine.machineId,f.value.localUserId).run();
  await receiveProgramInstallationLinks(env.RUNTIME_DB,f.machine,f.input);
  const read=()=>listChildProgramInstances(env.RUNTIME_DB,f.machine.accountId,f.value.childId,null);
  expect((await read()).items[0].installation).toMatchObject({entryCount:1,latestScanEntryCount:1});
  const receipt=await registerProgramInstances(env.RUNTIME_DB,f.machine,{...f.value,items:[{
    ...f.value.items[0],instance:{...f.value.items[0].instance,executableSha256:'b'.repeat(64)},
    evidence:{platform:'windows',verified:{binaryHash:'b'.repeat(64)}}}]},2);
  const next='2'.repeat(32);
  await env.RUNTIME_DB.prepare(`INSERT INTO runtime_application_inventory_scans_v2 VALUES(?1,?2,?3,1,0,1,'[]',1,2,2)`)
    .bind(f.machine.machineId,f.value.localUserId,next).run();
  await env.RUNTIME_DB.prepare(`INSERT INTO runtime_application_inventory_scan_batches_v2 VALUES(?1,?2,0,0,1,'new',?3)`)
    .bind(f.machine.machineId,next,JSON.stringify([`v\n${f.value.localUserId}\nentry-a`])).run();
  // 引用晚于扫描到达时不能用旧文件补齐当前安装证据。
  expect((await read()).items.find(item=>item.instanceId===f.input.links[0].instanceId)?.installation)
    .toMatchObject({entryCount:1,latestScanEntryCount:0});
  await receiveProgramInstallationLinks(env.RUNTIME_DB,f.machine,{...f.input,scanId:next,
    links:[{variantKey:'entry-a',instanceId:receipt.items[0].instanceId}]});
  const page=await read();
  expect(page.items.find(item=>item.instanceId===receipt.items[0].instanceId)?.installation)
    .toMatchObject({entryCount:1,latestScanEntryCount:1});
  expect(page.items.find(item=>item.instanceId===f.input.links[0].instanceId)?.installation)
    .toMatchObject({entryCount:1,latestScanEntryCount:0});
});

it('当前安装正向依据随分配及扫描变化失效，不改历史引用或推断卸载',async()=>{
  const f=await installationFixture();await f.scan();
  await env.RUNTIME_DB.prepare(`INSERT INTO runtime_application_variants_v1
    VALUES(?1,?2,'windows','entry-a',NULL,'label','{}','application','user','shortcut','runtimeObserved',0,0)`)
    .bind(f.machine.machineId,f.value.localUserId).run();
  await receiveProgramInstallationLinks(env.RUNTIME_DB,f.machine,f.input);
  const read=async()=> (await listChildProgramInstances(env.RUNTIME_DB,f.machine.accountId,f.value.childId,null)).items[0].installation;
  expect(await read()).toMatchObject({entryCount:1,latestScanEntryCount:0});
  await env.RUNTIME_DB.prepare(`UPDATE runtime_application_variants_v1 SET status='installed' WHERE machine_id=?`)
    .bind(f.machine.machineId).run();
  expect(await read()).toMatchObject({latestScanEntryCount:1});
  await env.RUNTIME_DB.prepare(`INSERT INTO runtime_user_assignments_v2 VALUES(?1,?2,2,'child-b',1,'override',1,1)`)
    .bind(f.machine.machineId,f.value.localUserId).run();
  expect(await read()).toMatchObject({entryCount:1,latestScanEntryCount:0});
  await registerProgramInstances(env.RUNTIME_DB,f.machine,{...f.value,childId:'child-b',assignmentVersion:2},2);
  expect((await listChildProgramInstances(env.RUNTIME_DB,f.machine.accountId,'child-b',null)).items[0].installation)
    .toMatchObject({entryCount:0,latestScanEntryCount:0});
  // 回到相同Child也不能把旧分配下的扫描当成新分配的安装事实。
  await env.RUNTIME_DB.prepare(`INSERT INTO runtime_user_assignments_v2 VALUES(?1,?2,3,?3,1,'override',2,2)`)
    .bind(f.machine.machineId,f.value.localUserId,f.value.childId).run();
  expect(await read()).toMatchObject({entryCount:1,latestScanEntryCount:0});
});

it('最新扫描失败或机器撤销不回退旧安装依据，历史详情不消失',async()=>{
  const f=await installationFixture();await f.scan();
  await env.RUNTIME_DB.prepare(`INSERT INTO runtime_application_variants_v1
    VALUES(?1,?2,'windows','entry-a',NULL,'label','{}','application','user','shortcut','installed',0,0)`)
    .bind(f.machine.machineId,f.value.localUserId).run();
  await receiveProgramInstallationLinks(env.RUNTIME_DB,f.machine,f.input);
  const read=async()=> (await listChildProgramInstances(env.RUNTIME_DB,f.machine.accountId,f.value.childId,null)).items[0].installation;
  expect(await read()).toMatchObject({latestScanEntryCount:1});
  await env.RUNTIME_DB.prepare('UPDATE runtime_machines_v2 SET revoked_at_ms=1 WHERE id=?').bind(f.machine.machineId).run();
  expect(await read()).toMatchObject({entryCount:1,latestScanEntryCount:0});
  await env.RUNTIME_DB.prepare('UPDATE runtime_machines_v2 SET revoked_at_ms=NULL WHERE id=?').bind(f.machine.machineId).run();
  await env.RUNTIME_DB.prepare(`INSERT INTO runtime_application_inventory_scans_v2
    VALUES(?1,?2,?3,1,0,0,'[{"sourceKind":"shortcut","status":"failed"}]',1,5,5)`)
    .bind(f.machine.machineId,f.value.localUserId,'3'.repeat(32)).run();
  expect(await read()).toMatchObject({entryCount:1,latestScanEntryCount:0});
});

// 合成已收到扫描批次；验证正式接收路由，不冒称Native扫描生产者已接线。
async function installationFixture() {
  const f=await fixture(),scanId='1'.repeat(32);
  const receipt=await registerProgramInstances(env.RUNTIME_DB,f.machine,f.value,1);
  const input={schemaVersion:1,childId:f.value.childId,localUserId:f.value.localUserId,assignmentVersion:1,
    scanId,links:[{variantKey:'entry-a',instanceId:receipt.items[0].instanceId}]};
  const scan=async(keys=['entry-a'])=>{
    await env.RUNTIME_DB.prepare(`INSERT INTO runtime_application_inventory_scans_v2 VALUES(?1,?2,?3,1,0,?4,'[]',1,0,0)`)
      .bind(f.machine.machineId,f.value.localUserId,scanId,keys.length).run();
    await env.RUNTIME_DB.prepare(`INSERT INTO runtime_application_inventory_scan_batches_v2 VALUES(?1,?2,0,0,?3,'test',?4)`)
      .bind(f.machine.machineId,scanId,keys.length,JSON.stringify(keys.map(key=>`v\n${f.value.localUserId}\n${key}`))).run();
  };
  const request=(body:unknown=input,token=f.token,method='POST')=>new Request('https://runtime.test/v2/machines/program-instances/installation-links',{
    method,headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},...(method==='POST'?{body:JSON.stringify(body)}:{})});
  const rows=()=>env.RUNTIME_DB.prepare('SELECT * FROM runtime_program_installation_links_v1 WHERE machine_id=?')
    .bind(f.machine.machineId).all();
  return {...f,input,scan,request,rows};
}

it('安装引用正式路由鉴权、依赖晚到可重试、重复提交不增加引用',async()=>{
  const f=await installationFixture();
  await expect(routeV2(f.request(f.input,''),env,2)).rejects.toMatchObject({status:401});
  expect((await routeV2(f.request(f.input,f.token,'GET'),env,2))?.status).toBe(405);
  await expect(routeV2(f.request(),env,2)).rejects.toMatchObject({code:'PROGRAM_INSTALLATION_DEPENDENCIES_PENDING'});
  expect((await f.rows()).results).toHaveLength(0);
  await f.scan();
  for(const time of [3,4]) {
    const response=await routeV2(f.request(),env,time);
    expect(response?.status).toBe(200);
    expect(parseProgramInstallationLinkReceipt(await response!.json(),{...f.input,schemaVersion:1},f.machine.machineId)).toEqual(f.input);
  }
  expect((await f.rows()).results).toHaveLength(1);
});

it('安装引用整批回滚，不把其他扫描条目或未知实例当成当前正向关系',async()=>{
  const f=await installationFixture();await f.scan(['entry-a','entry-b']);
  const missing={variantKey:'entry-b',instanceId:'f'.repeat(64)};
  await expect(receiveProgramInstallationLinks(env.RUNTIME_DB,f.machine,{...f.input,links:[...f.input.links,missing]}))
    .rejects.toMatchObject({code:'PROGRAM_INSTALLATION_DEPENDENCIES_PENDING'});
  expect((await f.rows()).results).toHaveLength(0);
  await expect(receiveProgramInstallationLinks(env.RUNTIME_DB,f.machine,{...f.input,
    links:[{...f.input.links[0],variantKey:'not-in-this-scan'}]})).rejects.toMatchObject({code:'PROGRAM_INSTALLATION_DEPENDENCIES_PENDING'});
  // 同一实例对应多个扫描入口，全部有依据时允许；不自动合并产品。
  await receiveProgramInstallationLinks(env.RUNTIME_DB,f.machine,{...f.input,
    links:[...f.input.links,{...f.input.links[0],variantKey:'entry-b'}]});
  expect((await f.rows()).results).toHaveLength(2);
});

it('安装引用保留历史孩子分配，禁止同扫描改属、跨家庭和跨机器实例引用',async()=>{
  const f=await installationFixture(),other=await installationFixture();await f.scan();
  await env.RUNTIME_DB.prepare(`INSERT INTO runtime_user_assignments_v2 VALUES(?1,?2,2,'child-b',1,'override',0,0)`)
    .bind(f.machine.machineId,f.value.localUserId).run();
  await receiveProgramInstallationLinks(env.RUNTIME_DB,f.machine,f.input);
  await registerProgramInstances(env.RUNTIME_DB,f.machine,{...f.value,childId:'child-b',assignmentVersion:2},2);
  await expect(receiveProgramInstallationLinks(env.RUNTIME_DB,f.machine,{...f.input,childId:'child-b',assignmentVersion:2}))
    .rejects.toMatchObject({code:'PROGRAM_INSTALLATION_SCOPE_CONFLICT'});
  await expect(receiveProgramInstallationLinks(env.RUNTIME_DB,{...f.machine,accountId:other.machine.accountId},f.input))
    .rejects.toMatchObject({status:403});
  await expect(receiveProgramInstallationLinks(env.RUNTIME_DB,f.machine,{...f.input,links:other.input.links}))
    .rejects.toMatchObject({code:'PROGRAM_INSTALLATION_DEPENDENCIES_PENDING'});
  expect((await f.rows()).results).toMatchObject([{child_id:f.value.childId,assignment_version:1}]);
});

it('安装引用扫描用户不能借另一用户范围，未知字段拒绝',async()=>{
  const f=await installationFixture();await f.scan();
  await env.RUNTIME_DB.prepare(`INSERT INTO runtime_user_assignments_v2 VALUES(?1,'user-b',1,?2,1,'override',0,0)`)
    .bind(f.machine.machineId,f.value.childId).run();
  await registerProgramInstances(env.RUNTIME_DB,f.machine,{...f.value,localUserId:'user-b'},2);
  await expect(receiveProgramInstallationLinks(env.RUNTIME_DB,f.machine,{...f.input,localUserId:'user-b'}))
    .rejects.toMatchObject({code:'PROGRAM_INSTALLATION_SCOPE_CONFLICT'});
  await expect(receiveProgramInstallationLinks(env.RUNTIME_DB,f.machine,{...f.input,productId:'guessed-product'}))
    .rejects.toMatchObject({status:400});
  expect((await f.rows()).results).toHaveLength(0);
});

it('安装引用存储未就绪明确503，原程序实例登记不受影响',async()=>{
  const f=await installationFixture();
  await env.RUNTIME_DB.prepare('ALTER TABLE runtime_program_installation_links_v1 RENAME TO installation_links_test_unavailable').run();
  try {
    await expect(routeV2(f.request(),env,2)).rejects.toMatchObject({code:'PROGRAM_INSTALLATION_STORAGE_UNAVAILABLE'});
    const caps=await routeV2(new Request('https://runtime.test/v2/machines/program-instances/capabilities',{
      headers:{authorization:`Bearer ${f.token}`}}),env,2);
    expect(await caps!.json()).toEqual({schemaVersion:1,enabled:true,capabilities:['program-instance-registration-v1']});
    expect((await registerProgramInstances(env.RUNTIME_DB,f.machine,f.value,3)).items).toHaveLength(1);
    const page=await listChildProgramInstances(env.RUNTIME_DB,f.machine.accountId,f.value.childId,null);
    expect(page.items).toHaveLength(1);
    expect(page.items[0].installation).toEqual({state:'unavailable',reasonCode:'PROGRAM_INSTALLATION_STORAGE_UNAVAILABLE'});
  } finally {
    await env.RUNTIME_DB.prepare('ALTER TABLE installation_links_test_unavailable RENAME TO runtime_program_installation_links_v1').run();
  }
});

it('新目录接纳经真实心跳持久化，改目录/改绑/离线不冒充当前，跨家庭不可读取',async()=>{
  const {machine,value,token}=await fixture(),user='a'.repeat(64);
  await env.RUNTIME_DB.prepare(`INSERT INTO runtime_user_assignments_v2 VALUES(?1,?2,1,?3,1,'override',0,0)`)
    .bind(machine.machineId,user,value.childId).run();
  await env.RUNTIME_DB.prepare(`INSERT INTO runtime_application_knowledge_versions_v1 VALUES(?1,8,'{"schemaVersion":4}','hash',0)`)
    .bind(machine.accountId).run();
  const report={schemaVersion:1,users:[{localUserId:user,assignmentVersion:1,state:'accepted',catalogVersion:8}]};
  const response=await routeV2(new Request('https://runtime.test/v2/machines/heartbeat',{method:'POST',
    headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},
    body:JSON.stringify({serviceVersion:'test',windowsVersion:'10',architecture:'x64',tamperCount:0,policyState:'applied',programInstancePolicy:report})}),env,100);
  expect(response?.status).toBe(200);
  expect(await readProgramPolicyStatus(env.RUNTIME_DB,machine.accountId,machine.machineId,101))
    .toMatchObject([{currentState:'accepted',catalogVersion:8,receivedAtMs:100}]);
  expect(await readProgramPolicyStatus(env.RUNTIME_DB,'different-family',machine.machineId,101)).toEqual([]);
  expect(await readProgramPolicyStatus(env.RUNTIME_DB,machine.accountId,machine.machineId,600101))
    .toMatchObject([{currentState:'unknown'}]);
  await env.RUNTIME_DB.prepare(`INSERT INTO runtime_application_knowledge_versions_v1 VALUES(?1,9,'{"schemaVersion":4}','hash',0)`)
    .bind(machine.accountId).run();
  expect(await readProgramPolicyStatus(env.RUNTIME_DB,machine.accountId,machine.machineId,102))
    .toMatchObject([{state:'accepted',currentState:'pending',catalogVersion:8}]);
  await env.RUNTIME_DB.prepare(`INSERT INTO runtime_user_assignments_v2 VALUES(?1,?2,2,'another-child',1,'override',0,0)`)
    .bind(machine.machineId,user).run();
  expect(await readProgramPolicyStatus(env.RUNTIME_DB,machine.accountId,machine.machineId,103))
    .toMatchObject([{currentState:'unknown'}]);
  await expect(receiveProgramPolicyStatus(env.RUNTIME_DB,machine,report,104)).rejects.toMatchObject({code:'PROGRAM_POLICY_STATUS_SCOPE_CHANGED'});
  expect(await readProgramPolicyStatus(env.RUNTIME_DB,machine.accountId,machine.machineId,104))
    .toMatchObject([{receivedAtMs:100}]);
  await receiveProgramPolicyStatus(env.RUNTIME_DB,machine,{schemaVersion:1,users:[]},105);
  expect(await readProgramPolicyStatus(env.RUNTIME_DB,machine.accountId,machine.machineId,106)).toEqual([]);
});

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
it('正式改绑递增分配版本，旧实例补发保留原孩子且不能冒充新孩子',async()=>{
  const {machine,value}=await fixture(),childB=crypto.randomUUID();
  await env.RUNTIME_DB.prepare(`INSERT INTO runtime_machine_users_v2
    (machine_id,local_user_id,display_name,first_seen_at_ms,last_seen_at_ms) VALUES(?1,?2,'测试用户',0,0)`)
    .bind(machine.machineId,value.localUserId).run();
  const changed=await updateUserAssignment(env.RUNTIME_DB,{
    iss:'test',aud:'app-runtime-management:account',sub:'test-parent',account_id:machine.accountId,
    children:[{id:value.childId,name:'A'},{id:childB,name:'B'}],iat:0,exp:1000,jti:'test-assignment',
  },machine.machineId,value.localUserId,{protected:true,childId:childB},10);
  expect(changed?.policyVersion).toBe(2);
  const rows=await env.RUNTIME_DB.prepare(`SELECT assignment_version,child_id FROM runtime_user_assignments_v2
    WHERE machine_id=?1 AND local_user_id=?2 ORDER BY assignment_version`)
    .bind(machine.machineId,value.localUserId).all();
  expect(rows.results).toEqual([{assignment_version:1,child_id:value.childId},{assignment_version:2,child_id:childB}]);
  // 云端接受改绑前已固定的待发发现；接收时不得把它重标给当前孩子。
  await registerProgramInstances(env.RUNTIME_DB,machine,value,11);
  expect((await listChildProgramInstances(env.RUNTIME_DB,machine.accountId,value.childId,null)).items).toHaveLength(1);
  expect((await listChildProgramInstances(env.RUNTIME_DB,machine.accountId,childB,null)).items).toEqual([]);
  await expect(registerProgramInstances(env.RUNTIME_DB,machine,{...value,childId:childB},12))
    .rejects.toMatchObject({code:'PROGRAM_INSTANCE_CHILD_SCOPE_MISMATCH'});
  await registerProgramInstances(env.RUNTIME_DB,machine,{...value,childId:childB,assignmentVersion:changed!.policyVersion},13);
  expect((await listChildProgramInstances(env.RUNTIME_DB,machine.accountId,childB,null)).items).toHaveLength(1);
  expect((await listChildProgramInstances(env.RUNTIME_DB,machine.accountId,value.childId,null)).items).toHaveLength(1);
});
it('家长用户读取返回新目录接纳；损坏诊断不阻断账户分配，其他家庭不可读',async()=>{
  const {machine,value}=await fixture(),user='b'.repeat(64),token=randomToken('');
  await env.RUNTIME_DB.prepare(`INSERT INTO runtime_machine_users_v2
    (machine_id,local_user_id,display_name,first_seen_at_ms,last_seen_at_ms) VALUES(?1,?2,'测试用户',0,0)`)
    .bind(machine.machineId,user).run();
  await env.RUNTIME_DB.prepare(`INSERT INTO runtime_user_assignments_v2 VALUES(?1,?2,1,?3,1,'override',0,0)`)
    .bind(machine.machineId,user,value.childId).run();
  await env.RUNTIME_DB.prepare(`INSERT INTO runtime_browser_sessions_v1
    (token_hash,account_id,children_json,created_at_ms,expires_at_ms,last_used_at_ms) VALUES(?1,?2,?3,0,1000,0)`)
    .bind(await sha256Hex(token),machine.accountId,JSON.stringify([{id:value.childId,name:'测试孩子'}])).run();
  await receiveProgramPolicyStatus(env.RUNTIME_DB,machine,{schemaVersion:1,users:[{
    localUserId:user,assignmentVersion:1,state:'pending',catalogVersion:null}]},10);
  const read=()=>routeV2(new Request(`https://runtime.test/v2/module/machines/${machine.machineId}/users`,
    {headers:{authorization:`RuntimeSession ${token}`}}),env,11);
  expect(await (await read())!.json()).toMatchObject({users:[{localUserId:user,childId:value.childId,
    programInstancePolicy:{state:'pending',currentState:'pending',receivedAtMs:10}}]});
  await env.RUNTIME_DB.prepare('UPDATE runtime_program_policy_status_v1 SET payload_json=? WHERE machine_id=?')
    .bind('{"schemaVersion":999}',machine.machineId).run();
  const degraded=await read();
  expect(degraded!.status).toBe(200);
  expect(await degraded!.json()).toMatchObject({users:[{localUserId:user,childId:value.childId,programInstancePolicy:null}]});
  await env.RUNTIME_DB.prepare('UPDATE runtime_browser_sessions_v1 SET account_id=? WHERE token_hash=?')
    .bind('different-family',await sha256Hex(token)).run();
  expect((await read())!.status).toBe(404);
});
it('隔离库缺少新诊断存储时不声明能力，旧心跳继续工作，新报告明确不可用',async()=>{
  const {machine,token}=await fixture();
  await env.RUNTIME_DB.prepare('ALTER TABLE runtime_program_policy_status_v1 RENAME TO test_program_policy_status_saved').run();
  try {
    const headers={authorization:`Bearer ${token}`,'content-type':'application/json'};
    const policy=await routeV2(new Request('https://runtime.test/v2/machines/policy',{headers}),env,20);
    expect(await policy!.json()).toMatchObject({capabilities:expect.not.arrayContaining(['program-instance-policy-status-v1'])});
    const heartbeat={serviceVersion:'test',windowsVersion:'10',architecture:'x64',tamperCount:0,policyState:'applied'};
    expect((await routeV2(new Request('https://runtime.test/v2/machines/heartbeat',{
      method:'POST',headers,body:JSON.stringify(heartbeat)}),env,20))!.status).toBe(200);
    await expect(routeV2(new Request('https://runtime.test/v2/machines/heartbeat',{
      method:'POST',headers,body:JSON.stringify({...heartbeat,programInstancePolicy:{schemaVersion:1,users:[]}})}),env,21))
      .rejects.toMatchObject({status:503,code:'PROGRAM_POLICY_STATUS_UNAVAILABLE'});
    expect(await readProgramPolicyStatus(env.RUNTIME_DB,machine.accountId,machine.machineId,22)).toEqual([]);
  } finally {
    await env.RUNTIME_DB.prepare('ALTER TABLE test_program_policy_status_saved RENAME TO runtime_program_policy_status_v1').run();
  }
});
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
  const legacy={schemaVersion:1 as const,version:1,products:[{id:'p',name:'既有产品',type:'other' as const,
    selectors:[{platform:'windows' as const,match:{operator:'all' as const,conditions:[{field:'binaryHash' as const,value:'a'.repeat(64)}]}}]}],rules:[],
    bindings:[{childId:value.childId,products:[{productId:'p',classification:'study' as const}],ruleIds:[]},
      {childId:'sibling-in-same-family',products:[{productId:'p',classification:'other' as const}],ruleIds:[]}]};
  await env.RUNTIME_DB.prepare('INSERT INTO runtime_application_knowledge_versions_v1 VALUES(?1,1,?2,?3,1)')
    .bind(machine.accountId,JSON.stringify(legacy),'legacy').run();
  expect(await (await routeV2(request(),env,3))!.json()).toEqual({state:'legacy',version:1,catalog:null,
    legacyCatalog:effectiveApplicationKnowledge(legacy)});
  expect(await env.RUNTIME_DB.prepare('SELECT payload_json FROM runtime_application_knowledge_versions_v1 WHERE account_id=? AND version=1')
    .bind(machine.accountId).first('payload_json')).toBe(JSON.stringify(legacy));
  const saved=await saveProgramInstanceCatalog(env.RUNTIME_DB,machine.accountId,[value.childId],'"application-knowledge-v1"',
    {...catalog,bindings:[{childId:value.childId,products:[],ruleIds:[]}]},2);
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
it('非空旧目录切换保留历史产品配置与强化封锁，不以未识别历史产品伪造匹配',async()=>{
  const {machine,value}=await fixture();
  const receipt=await registerProgramInstances(env.RUNTIME_DB,machine,value,1);
  const hint={platform:'windows',signerKey:'c'.repeat(64),productName:'Firefox'};
  const legacy={schemaVersion:3,version:1,products:[
    {id:'firefox',name:'Firefox',type:'other',suspectedMatchers:[hint],selectors:[
      {platform:'windows',match:{operator:'all',conditions:[{field:'binaryHash',value:'a'.repeat(64)}]}}]},
    {id:'historic-game',name:'历史游戏',type:'game',selectors:[
      {platform:'windows',match:{operator:'all',conditions:[{field:'distributionKey',value:'steam:retired'}]}}]},
  ],rules:[],bindings:[{childId:value.childId,products:[
    {productId:'firefox',classification:'blocked',enhancedBlocking:true},
    {productId:'historic-game',classification:'restrictedEntertainment'},
  ],ruleIds:[]}]};
  const originalPayload=JSON.stringify(legacy),originalHash=await sha256Hex(originalPayload);
  await env.RUNTIME_DB.prepare('INSERT INTO runtime_application_knowledge_versions_v1 VALUES(?1,1,?2,?3,1)')
    .bind(machine.accountId,originalPayload,originalHash).run();
  const beforePolicy=await getAppPolicy(env.RUNTIME_DB,machine.accountId,value.childId);
  const next={...legacy,schemaVersion:4,products:legacy.products.map(({selectors,...product})=>product),
    ownershipRules:[{id:'verified-firefox',revision:1,enabled:true,platform:'windows',productId:'firefox',
      match:{kind:'binaryHash',sha256:'a'.repeat(64)}}]};
  const saved=await saveProgramInstanceCatalog(env.RUNTIME_DB,machine.accountId,[value.childId],
    '"application-knowledge-v1"',next,2);
  expect(saved.bindings).toEqual(legacy.bindings);
  expect(saved.products).toEqual(next.products);
  expect(await env.RUNTIME_DB.prepare('SELECT payload_json FROM runtime_application_knowledge_versions_v1 WHERE account_id=? AND version=1')
    .bind(machine.accountId).first('payload_json')).toBe(originalPayload);
  expect(await env.RUNTIME_DB.prepare('SELECT previous_hash FROM runtime_application_knowledge_audit_v1 WHERE account_id=? AND version=2')
    .bind(machine.accountId).first('previous_hash')).toBe(originalHash);
  const afterPolicy=await getAppPolicy(env.RUNTIME_DB,machine.accountId,value.childId);
  expect(afterPolicy.quotas).toEqual(beforePolicy.quotas);
  expect(afterPolicy.timeWindows).toEqual(beforePolicy.timeWindows);
  expect(afterPolicy.classifications).toEqual(beforePolicy.classifications);
  expect(afterPolicy.programInstanceExecutionPolicy).toEqual({schemaVersion:1,catalogVersion:2,
    blockedProducts:[{productId:'firefox',suspectedMatchers:[{signerKey:hint.signerKey,productName:'Firefox'}]}]});
  const query={childId:value.childId,localUserId:value.localUserId,assignmentVersion:1,
    instanceIds:receipt.items.map(item=>item.instanceId)};
  expect((await readProgramInstanceMappings(env.RUNTIME_DB,machine,query)).items[0].status).toBe('pending');
  await refreshPendingProgramInstanceMappings(env.RUNTIME_DB);
  expect((await readProgramInstanceMappings(env.RUNTIME_DB,machine,query)).items[0])
    .toMatchObject({status:'confirmed',productId:'firefox'});
  expect(saved.ownershipRules.some(rule=>rule.productId==='historic-game')).toBe(false);
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
it('旧安装盘点不覆盖新产品映射，也不按同hash合并不同位置实例',async()=>{
  const {machine,value,token}=await fixture();
  await env.RUNTIME_DB.prepare(`INSERT INTO runtime_machine_users_v2
    (machine_id,local_user_id,display_name,first_seen_at_ms,last_seen_at_ms) VALUES(?1,?2,'测试用户',0,0)`)
    .bind(machine.machineId,value.localUserId).run();
  await saveProgramInstanceCatalog(env.RUNTIME_DB,machine.accountId,[value.childId],'"application-knowledge-v0"',{
    schemaVersion:4,version:0,products:[{id:'p',name:'规则确认产品',type:'other'}],rules:[],bindings:[],
    ownershipRules:[{id:'r',revision:1,enabled:true,platform:'windows',productId:'p',
      match:{kind:'binaryHash',sha256:'a'.repeat(64)}}],
  },1);
  const receipt=await registerProgramInstances(env.RUNTIME_DB,machine,{...value,items:[value.items[0],{
    ...value.items[0],instance:{...value.items[0].instance,locationRef:'2'.repeat(32)},
  }]},2);
  await materializeProgramInstanceMappings(env.RUNTIME_DB,machine.accountId,value.childId,
    receipt.items.map(item=>({machineId:machine.machineId,instanceId:item.instanceId})));
  const before=await listChildProgramInstances(env.RUNTIME_DB,machine.accountId,value.childId,null);
  expect(before.items).toHaveLength(2);
  expect(new Set(before.items.map(item=>item.instanceId)).size).toBe(2);
  expect(before.items.every(item=>item.status==='confirmed'&&item.product?.name==='规则确认产品')).toBe(true);
  const body={schemaVersion:2,batchId:'scan-legacy-independent',products:[],variants:[{
    localUserId:value.localUserId,variantKey:'legacy-same-content',variantRole:'main',scope:'user',
    sourceKind:'start-menu-user',status:'installed',evidence:{platform:'windows',runtimeIdentity:'legacy-same-content',
      displayName:'与目录不同的旧扫描名称',values:{binaryHash:'a'.repeat(64)},verifiedFields:['binaryHash'],
      discovery:{role:'application',nameSource:'appList',sourceKinds:['shortcut'],objectKind:'variant',
        variantRole:'main',scope:'user',sourceKind:'start-menu-user',evidenceLevel:'strong'}},
  }]};
  const response=await routeV2(new Request('https://runtime.test/v2/machines/application-inventory',{
    method:'POST',headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},body:JSON.stringify(body),
  }),env,3);
  expect(await response!.json()).toMatchObject({status:'accepted',acceptedCount:1});
  expect(await listChildProgramInstances(env.RUNTIME_DB,machine.accountId,value.childId,null)).toEqual(before);
  expect((await listChildProgramInstances(env.RUNTIME_DB,machine.accountId,'unassigned-child',null)).items).toEqual([]);
  expect(await env.RUNTIME_DB.prepare('SELECT COUNT(*) AS n FROM runtime_program_instance_scopes_v1 WHERE machine_id=?')
    .bind(machine.machineId).first('n')).toBe(2);
});
it('无使用清单也可登记实例，同实例的两个孩子范围独立且不凭机器共享',async()=>{
  const {machine,value,token}=await fixture(),secondChild=crypto.randomUUID();
  const catalog={schemaVersion:4,version:0,products:[{id:'p',name:'应用',type:'other'}],
    ownershipRules:[{id:'r',revision:1,enabled:true,platform:'windows',productId:'p',
      match:{kind:'binaryHash',sha256:'a'.repeat(64)}}],rules:[],bindings:[]};
  await saveProgramInstanceCatalog(env.RUNTIME_DB,machine.accountId,[value.childId,secondChild],
    '"application-knowledge-v0"',catalog,1);
  const upload=async(body:typeof value)=>{
    const deferred:Promise<unknown>[]=[];
    const response=await routeV2(new Request('https://runtime.test/v2/machines/program-instances',{
      method:'POST',headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},
      body:JSON.stringify(body)}),env,2,p=>deferred.push(p));
    expect(response!.status).toBe(200);
    await Promise.all(deferred);
    return response!.json();
  };
  const first=await upload(value);
  expect(await upload(value)).toEqual(first);
  expect((await listChildProgramInstances(env.RUNTIME_DB,machine.accountId,value.childId,null)).items)
    .toMatchObject([{status:'confirmed',product:{id:'p'}}]);
  expect((await listChildProgramInstances(env.RUNTIME_DB,machine.accountId,secondChild,null)).items).toEqual([]);
  await expect(upload({...value,childId:secondChild})).rejects.toMatchObject({code:'PROGRAM_INSTANCE_CHILD_SCOPE_MISMATCH'});
  await env.RUNTIME_DB.prepare(`INSERT INTO runtime_user_assignments_v2 VALUES(?1,'user-b',1,?2,1,'override',0,0)`)
    .bind(machine.machineId,secondChild).run();
  await upload({...value,childId:secondChild,localUserId:'user-b'});
  const a=await listChildProgramInstances(env.RUNTIME_DB,machine.accountId,value.childId,null);
  const b=await listChildProgramInstances(env.RUNTIME_DB,machine.accountId,secondChild,null);
  expect(a.items).toHaveLength(1);
  expect(b.items).toHaveLength(1);
  expect(b.items[0]).toMatchObject({instanceId:a.items[0].instanceId,status:'confirmed',product:{id:'p'}});
  expect(await env.RUNTIME_DB.prepare('SELECT COUNT(*) AS n FROM runtime_program_instances_v1 WHERE machine_id=?')
    .bind(machine.machineId).first('n')).toBe(1);
  expect(await env.RUNTIME_DB.prepare('SELECT COUNT(*) AS n FROM runtime_program_instance_scopes_v1 WHERE machine_id=?')
    .bind(machine.machineId).first('n')).toBe(2);
  expect(await env.RUNTIME_DB.prepare('SELECT COUNT(*) AS n FROM runtime_application_account_manifests_v1 WHERE machine_id=?')
    .bind(machine.machineId).first('n')).toBe(0);
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
  expect(await caps!.json()).toEqual({schemaVersion:1,enabled:true,capabilities:['program-instance-registration-v1','program-installation-links-v1']});
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
it('文件系列证据经真实登记升级并重建归属，旧重放不覆盖，同内容不同位置不混实例',async()=>{
  const {machine,value,token}=await fixture(),series='c'.repeat(64);
  await saveProgramInstanceCatalog(env.RUNTIME_DB,machine.accountId,[value.childId],'"application-knowledge-v0"',{
    schemaVersion:4,version:0,products:[{id:'series-product',name:'系列产品',type:'other'}],rules:[],bindings:[],
    ownershipRules:[{id:'series-rule',revision:1,enabled:true,platform:'windows',productId:'series-product',
      match:{kind:'windowsFileSeries',fileSeriesKey:series}}]},1);
  const send=async(body:unknown)=>{
    const deferred:Promise<unknown>[]=[];
    const response=await routeV2(new Request('https://runtime.test/v2/machines/program-instances',{
      method:'POST',headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},body:JSON.stringify(body)}),env,2,p=>deferred.push(p));
    expect(response?.status).toBe(200);await Promise.all(deferred);
    return await response!.json() as {items:Array<{instanceId:string;evidenceRevision:number;evidenceHash:string}>};
  };
  const first=await send(value),id=first.items[0].instanceId;
  const query={childId:value.childId,localUserId:value.localUserId,assignmentVersion:1,instanceIds:[id]};
  expect((await readProgramInstanceMappings(env.RUNTIME_DB,machine,query)).items[0].status).toBe('unresolved');
  const upgraded={...value,items:[{...value.items[0],evidenceRevision:2,evidence:{platform:'windows',
    verified:{binaryHash:'a'.repeat(64),windowsFileSeriesKey:series}}}]};
  const second=await send(upgraded);
  expect(second.items[0]).toMatchObject({instanceId:id,evidenceRevision:2});
  expect((await readProgramInstanceMappings(env.RUNTIME_DB,machine,query)).items[0])
    .toMatchObject({status:'confirmed',productId:'series-product',evidenceRevision:2});
  expect(await send(value)).toEqual(second);
  const separate=await send({...value,items:[{...value.items[0],instance:{...value.items[0].instance,locationRef:'2'.repeat(32)}}]});
  expect(separate.items[0].instanceId).not.toBe(id);
  const both=await readProgramInstanceMappings(env.RUNTIME_DB,machine,{...query,instanceIds:[id,separate.items[0].instanceId]});
  expect(both.items.find(item=>item.instanceId===id)?.status).toBe('confirmed');
  expect(both.items.find(item=>item.instanceId===separate.items[0].instanceId)?.status).toBe('unresolved');
  // 接收完整证据快照而不是永久并集：明确撤回不再有效的系列依据后，允许恢复未识别。
  await send({...value,items:[{...value.items[0],evidenceRevision:3}]});
  expect((await readProgramInstanceMappings(env.RUNTIME_DB,machine,query)).items[0])
    .toMatchObject({status:'unresolved',productId:null,evidenceRevision:3});
  expect(await env.RUNTIME_DB.prepare('SELECT COUNT(*) AS n FROM runtime_program_instances_v1 WHERE machine_id=?')
    .bind(machine.machineId).first('n')).toBe(2);
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

it('无孩子binding的目录与审计原子保存、版本递增及冲突拒绝，不凭空生成执行或映射',async()=>{
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

it('目录保存原子刷新孩子执行及机器版本，正式读取协商能力，解除不改原分类配额',async()=>{
  const {machine,value,token}=await fixture(),foreign=await fixture();
  await env.RUNTIME_DB.prepare(`INSERT INTO runtime_machine_users_v2
    (machine_id,local_user_id,display_name,first_seen_at_ms,last_seen_at_ms) VALUES(?1,?2,'测试',0,0)`)
    .bind(machine.machineId,value.localUserId).run();
  const original=await getAppPolicy(env.RUNTIME_DB,machine.accountId,value.childId);
  const before=await putAppPolicy(env.RUNTIME_DB,machine.accountId,value.childId,'"app-policy-v0"',{
    classifications:[{platform:'windows',runtimeIdentity:'unrelated',displayName:'保留',classification:'study'}],
    quotas:original.quotas,timeWindows:original.timeWindows},1);
  const sibling=crypto.randomUUID();
  const catalog={schemaVersion:4,version:0,products:[{id:'p',name:'产品',type:'other'}],ownershipRules:[],rules:[],
    bindings:[{childId:value.childId,products:[{productId:'p',classification:'blocked'}],ruleIds:[]},
      {childId:sibling,products:[{productId:'p',classification:'study'}],ruleIds:[]}]};
  const save=(version:number,input:unknown=catalog)=>saveProgramInstanceCatalog(env.RUNTIME_DB,machine.accountId,
    [value.childId,sibling],`"application-knowledge-v${version}"`,input,version+10);
  const read=()=>routeV2(new Request('https://runtime.test/v2/machines/policy',
    {headers:{authorization:`Bearer ${token}`}}),env,20);
  await save(0);
  const saved=await getAppPolicy(env.RUNTIME_DB,machine.accountId,value.childId);
  expect(saved).toMatchObject({version:before.version+1,programInstanceExecutionPolicy:{schemaVersion:1,catalogVersion:1,
    blockedProducts:[{productId:'p',suspectedMatchers:[]}]}});
  expect(saved.classifications).toEqual(before.classifications);
  expect(saved.quotas).toEqual(before.quotas);
  expect(saved.timeWindows).toEqual(before.timeWindows);
  expect(saved.applicationKnowledge).toEqual(before.applicationKnowledge);
  expect((await getAppPolicy(env.RUNTIME_DB,machine.accountId,sibling)).programInstanceExecutionPolicy?.blockedProducts).toEqual([]);
  expect((await getAppPolicy(env.RUNTIME_DB,foreign.machine.accountId,foreign.value.childId)).version).toBe(0);
  const legacy=await (await read())!.json<{appPolicies:Array<{policy:Record<string,unknown>}>}>();
  expect(legacy.appPolicies[0].policy).not.toHaveProperty('programInstanceExecutionPolicy');
  expect((await routeV2(new Request('https://runtime.test/v2/machines/heartbeat',{method:'POST',
    headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},body:JSON.stringify({serviceVersion:'fixture',
      osVersion:'11',architecture:'x64',tamperCount:0,policyState:'pending',
      capabilities:['program-instance-execution-policy-v1']})}),env,20))!.status).toBe(200);
  const capable=await (await read())!.json<{version:number;appPolicies:Array<{policy:Record<string,unknown>}>}>();
  expect(capable.version).toBe(3); // initial + ordinary policy + one catalog save (two children)
  expect(capable.appPolicies[0].policy.programInstanceExecutionPolicy).toEqual(saved.programInstanceExecutionPolicy);
  await expect(save(1,{...catalog,bindings:[]})).rejects.toMatchObject({code:'PROGRAM_INSTANCE_EXECUTION_SCOPE_MISSING'});
  await save(1,{...catalog,bindings:catalog.bindings.map(binding=>({...binding,products:[]}))});
  const cleared=await getAppPolicy(env.RUNTIME_DB,machine.accountId,value.childId);
  expect(cleared.programInstanceExecutionPolicy).toEqual({schemaVersion:1,catalogVersion:2,blockedProducts:[]});
  expect(cleared.classifications).toEqual(before.classifications);
  const edited=await putAppPolicy(env.RUNTIME_DB,machine.accountId,value.childId,`"app-policy-v${cleared.version}"`,{
    classifications:cleared.classifications,quotas:cleared.quotas,timeWindows:cleared.timeWindows},30);
  expect(edited.programInstanceExecutionPolicy).toEqual(cleared.programInstanceExecutionPolicy);
  expect((await getAppPolicy(env.RUNTIME_DB,machine.accountId,value.childId)).programInstanceExecutionPolicy)
    .toEqual(cleared.programInstanceExecutionPolicy);
  expect(await env.RUNTIME_DB.prepare('SELECT desired_policy_version FROM runtime_machines_v2 WHERE id=?')
    .bind(foreign.machine.machineId).first('desired_policy_version')).toBe(1);
  expect(await env.RUNTIME_DB.prepare('SELECT COUNT(*) AS n FROM runtime_program_instance_mappings_v1 WHERE machine_id=?')
    .bind(machine.machineId).first('n')).toBe(0);
});

it('已读取旧目录的盘点不能在新目录提交后覆盖孩子新执行策略',async()=>{
  const {machine,value}=await fixture();
  await env.RUNTIME_DB.prepare(`INSERT INTO runtime_machine_users_v2
    (machine_id,local_user_id,display_name,first_seen_at_ms,last_seen_at_ms) VALUES(?1,?2,'测试',0,0)`)
    .bind(machine.machineId,value.localUserId).run();
  const base=await getAppPolicy(env.RUNTIME_DB,machine.accountId,value.childId);
  await putAppPolicy(env.RUNTIME_DB,machine.accountId,value.childId,'"app-policy-v0"',{
    classifications:[],quotas:base.quotas,timeWindows:base.timeWindows},1);
  const originalRead=appPolicyModule.getAppPolicy;
  const readHook=vi.spyOn(appPolicyModule,'getAppPolicy').mockImplementationOnce(async(...args)=>{
    readHook.mockRestore();
    // Inventory has already read the legacy catalog. Commit the new catalog
    // before it reads the latest Child policy: no stale child-version conflict protects this order.
    await saveProgramInstanceCatalog(env.RUNTIME_DB,machine.accountId,[value.childId],
      '"application-knowledge-v0"',{schemaVersion:4,version:0,products:[{id:'p',name:'产品',type:'other'}],
        ownershipRules:[],rules:[],bindings:[{childId:value.childId,
          products:[{productId:'p',classification:'blocked'}],ruleIds:[]}]},2);
    return originalRead(...args);
  });
  try {
    expect(await syncApplicationInventory(env.RUNTIME_DB,machine.accountId,machine.machineId,'windows',{
      schemaVersion:1,batchId:'late-legacy-inventory',observations:[{localUserId:value.localUserId,
        status:'runtimeObserved',evidence:{platform:'windows',runtimeIdentity:'observed',displayName:'观察标签',
          values:{},verifiedFields:[]}}]},3)).toMatchObject({status:'accepted',acceptedCount:1});
  } finally { readHook.mockRestore(); }
  const policy=await originalRead(env.RUNTIME_DB,machine.accountId,value.childId);
  expect(policy.version).toBe(2);
  expect(policy.programInstanceExecutionPolicy).toEqual({schemaVersion:1,catalogVersion:1,
    blockedProducts:[{productId:'p',suspectedMatchers:[]}]});
  expect(await env.RUNTIME_DB.prepare('SELECT desired_policy_version FROM runtime_machines_v2 WHERE id=?')
    .bind(machine.machineId).first('desired_policy_version')).toBe(3);
  expect(await env.RUNTIME_DB.prepare('SELECT COUNT(*) AS n FROM runtime_application_inventory_v1 WHERE machine_id=?')
    .bind(machine.machineId).first('n')).toBe(1);
});

it('持久策略执行字段损坏不能被规范化读取当成缺席或空解除',async()=>{
  const {machine,value}=await fixture();
  const {version,effectiveAtMs,...base}=await getAppPolicy(env.RUNTIME_DB,machine.accountId,value.childId);
  await env.RUNTIME_DB.prepare(`INSERT INTO runtime_child_app_policy_versions_v1
    (account_id,child_id,version,payload_json,payload_hash,effective_at_ms,created_at_ms)
    VALUES(?1,?2,1,?3,'invalid-fixture',0,0)`).bind(machine.accountId,value.childId,
      JSON.stringify({...base,programInstanceExecutionPolicy:{schemaVersion:1,catalogVersion:1}})).run();
  await expect(getAppPolicy(env.RUNTIME_DB,machine.accountId,value.childId)).rejects.toThrow();
});

it('执行策略写入失败回滚目录审计与全部孩子策略，不能出现半更新',async()=>{
  const {machine,value}=await fixture();
  const catalog={schemaVersion:4,version:0,products:[],ownershipRules:[],rules:[],
    bindings:[{childId:value.childId,products:[],ruleIds:[]}]};
  // Reserve the next machine generation to force a failure after the catalog
  // and Child inserts; D1 must roll back those earlier writes too.
  await env.RUNTIME_DB.prepare(`INSERT INTO runtime_machine_policy_versions_v2
    (machine_id,version,payload_hash,created_at_ms) VALUES(?1,2,'reserved',0)`).bind(machine.machineId).run();
  await expect(saveProgramInstanceCatalog(env.RUNTIME_DB,machine.accountId,[value.childId],
    '"application-knowledge-v0"',catalog,1)).rejects.toMatchObject({status:412});
  for(const table of ['runtime_application_knowledge_versions_v1','runtime_application_knowledge_audit_v1',
    'runtime_child_app_policy_versions_v1']) {
    expect(await env.RUNTIME_DB.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE account_id=?`)
      .bind(machine.accountId).first('n')).toBe(0);
  }
  expect(await env.RUNTIME_DB.prepare('SELECT desired_policy_version FROM runtime_machines_v2 WHERE id=?')
    .bind(machine.machineId).first('desired_policy_version')).toBe(1);
});
