const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {scripts,styles}=require('../../app-runtime-management/console/stage-management-component.cjs');
const code=fs.readFileSync(require.resolve('../../pages/runtime-management-loader'),'utf8');
function fixture({hold=false,invalid=false,holdStyles=false}={}){
  const fetched=[],loaded=[],mounts=[];let resolve,disposed=0;
  const css=[];
  const root={innerHTML:'',clears:0,prepend(link){if(holdStyles)css.push(link);else queueMicrotask(()=>link.onload());},appendChild(){},replaceChildren(){this.clears++;this.innerHTML='';}};
  const host={shadowRoot:null,attachShadow(){this.shadowRoot=root;return root;}};
  const manifest={schemaVersion:1,scripts,styles,template:'<main>fixture</main>'};
  if(invalid)manifest.scripts=['https://invalid.test/script.js'];
  const context={document:{createElement(tag){return {tag,dataset:{},content:{cloneNode(){return {}; }},remove(){}};},head:{appendChild(script){loaded.push(script);queueMicrotask(()=>script.onload());}}},
    fetch:async(url)=>{fetched.push(url);if(hold)await new Promise(yes=>resolve=yes);return {ok:true,json:async()=>manifest};},
    AppRuntimeManagement:{mount(options){mounts.push(options);return {ready:Promise.resolve(),refresh(){},dispose(){disposed++;}};}}};
  vm.runInNewContext(code,context);
  return{...context,host,root,css,fetched,loaded,mounts,release:()=>resolve(),get disposed(){return disposed;}};
}
(async()=>{
  const good=fixture(),request=async()=>({}),options={host:good.host,view:'devices',children:[{id:'a'}],childId:'a',request};
  const controller=await good.RuntimeManagementLoader.mount(options);await controller.ready;
  assert.equal(good.fetched.length,1);assert.equal(good.loaded.length,scripts.length);
  assert(good.loaded.every(script=>script.src.startsWith('/runtime-management-component/')&&script.dataset.runtimeComponent==='true'));
  assert(!good.loaded.some(script=>/session|bootstrap/.test(script.src)));
  assert.equal(good.mounts[0].request,request);assert.equal(good.mounts[0].root,good.root);assert.equal(good.mounts[0].childId,'a');
  controller.dispose();assert.equal(good.root.innerHTML,'');assert.equal(good.disposed,1);
  await good.RuntimeManagementLoader.mount({...options,childId:'b'});assert.equal(good.fetched.length,1);assert.equal(good.mounts[1].childId,'b');
  const stale=fixture({hold:true});let current=true;
  const pending=stale.RuntimeManagementLoader.mount({...options,host:stale.host,isCurrent:()=>current});
  current=false;stale.release();await assert.rejects(pending,{code:'COMPONENT_CONTEXT_CHANGED'});assert.equal(stale.host.shadowRoot,null);assert.equal(stale.mounts.length,0);
  const bad=fixture({invalid:true});await assert.rejects(bad.RuntimeManagementLoader.mount({...options,host:bad.host}),/版本无效/);assert.equal(bad.loaded.length,0);
  const race=fixture({holdStyles:true});
  const old=race.RuntimeManagementLoader.mount({...options,host:race.host});
  const oldResult=assert.rejects(old,{code:'COMPONENT_CONTEXT_CHANGED'});
  await new Promise(resolve=>setImmediate(resolve));assert.equal(race.css.length,3);
  const newer=race.RuntimeManagementLoader.mount({...options,host:race.host,childId:'b'});
  await new Promise(resolve=>setImmediate(resolve));race.css.slice(3).forEach(link=>link.onload());const newerController=await newer;
  const clears=race.root.clears;race.css.slice(0,3).forEach(link=>link.onload());await oldResult;
  assert.equal(race.root.clears,clears,'stale CSS completion cannot clear the new Child root');assert.equal(race.mounts.length,1);assert.equal(race.mounts[0].childId,'b');newerController.dispose();
  const html=fs.readFileSync(require.resolve('../../pages/index.html'),'utf8');
  for(const part of html.matchAll(/<script>([\s\S]*?)<\/script>/g))new vm.Script(part[1]);
  for(const view of ['apps','devices']){assert.match(html,new RegExp('data-page="'+view+'"'));assert.match(html,new RegExp('id="page-'+view+'"'));}
  assert(!html.includes('class="nav-item runtime-launch"'));assert.match(html,/\/app-runtime\/manage\/v1\//);assert.match(html,/If-Match/);
  assert.match(html,/data-system-management-tab="runtime-diagnostics"/);
  assert.match(html,/id="runtime-system-host"/);
  assert.match(html,/\['system','configuration'\]\.includes\(view\)\?'system-management':view/);
  assert.match(html,/id="runtime-configuration-host"/);
  assert.match(html,/data-system-management-tab="config-files"/);
  assert.match(html,/id="access-config-domain"/);
  assert.match(html,/await applyProfileNotificationImport\(userDiffs,context\)/);
  assert.match(html,/if\(generation!==accessConfigImportGeneration\)return/);
  // 执行实际导入候选函数：只应用选中用途差异，且绝不发送服务器申请身份。
  const payloadStart=html.indexOf('function buildProfileConfigImportPayload(');
  const payloadEnd=html.indexOf('function buildProfileNotificationImportPayload(',payloadStart);
  const usageBefore=[
    {id:'owned-id',requestId:'owned-request',classification:'other',targetType:'host',normalizedValue:'keep.test'},
    {id:'remove-id',classification:'other',targetType:'host',normalizedValue:'remove.test'},
  ];
  const payloadContext={remoteConfig:{siteUsageClassificationRulesV1:usageBefore,timeQuota:{daily:{},weekly:{restMinutes:null}}},
    weeklyRestQuotaView:()=>({value:null}),uniqueSiteRules:value=>value,quotaFiniteNumber:()=>null,
    sanitizeTimeWindowsDailyForConfigIo:value=>value,findSiteAccessExactConflicts:()=>[],
    configImportRuleKey:rule=>`${rule.targetType}::${rule.normalizedValue||rule.targetValue}`};
  vm.runInNewContext(html.slice(payloadStart,payloadEnd),payloadContext);
  assert.equal(Object.hasOwn(payloadContext.buildProfileConfigImportPayload([]),'siteUsageClassificationRulesV1'),false);
  const candidate=payloadContext.buildProfileConfigImportPayload([
    {area:'usage-rule',type:'delete',key:'host::remove.test'},
    {area:'usage-rule',type:'add',key:'host::new.test',importedRule:{classification:'other',targetType:'host',normalizedValue:'new.test',requestId:'foreign-request',id:'foreign-id'}},
  ]);
  assert.deepEqual(JSON.parse(JSON.stringify(candidate.siteUsageClassificationRulesV1)),[
    {classification:'other',targetType:'host',normalizedValue:'keep.test'},
    {classification:'other',targetType:'host',normalizedValue:'new.test'},
  ]);
  assert.equal(usageBefore.length,2);assert.equal(usageBefore[0].requestId,'owned-request');
  assert(!html.includes('其他用途规则的导入写入待云端兼容'));
  // 实际通知导入函数：迟到响应不得更新另一个孩子，预览失效不得先发请求。
  const notificationStart=html.indexOf('async function applyProfileNotificationImport(');
  const notificationEnd=html.indexOf('function renderConfigImportVisibleDiffs',notificationStart);
  function notificationFixture(){
    let resolve;const calls=[];
    const context={currentProfileId:'child-a',profileNotificationSettingsState:{profileId:'child-a',settings:{}},
      buildProfileNotificationImportPayload:()=>({enabled:true,thresholdMinutes:30}),
      profileNotificationSettingsView:value=>value,
      assertAccessConfigContext:lease=>{if(lease.childId!==context.currentProfileId)throw new Error('context changed');},
      api:async(path,method,body)=>{calls.push({path,method,body});return await new Promise(yes=>resolve=yes);}};
    vm.runInNewContext(html.slice(notificationStart,notificationEnd),context);
    return{context,calls,release:value=>resolve(value)};
  }
  const leased=notificationFixture();const notificationPending=leased.context.applyProfileNotificationImport([],{childId:'child-a'});
  leased.context.currentProfileId='child-b';leased.context.profileNotificationSettingsState={profileId:'child-b',settings:{enabled:false}};
  leased.release({settings:{enabled:true}});await assert.rejects(notificationPending,/context changed/);
  assert.equal(leased.calls[0].path,'/profiles/child-a/unclassified-usage-notification/v1');
  assert.equal(leased.context.profileNotificationSettingsState.profileId,'child-b');
  assert.equal(leased.context.profileNotificationSettingsState.settings.enabled,false);
  const invalidLease=notificationFixture();await assert.rejects(invalidLease.context.applyProfileNotificationImport([],{childId:'child-b'}),/context changed/);
  assert.equal(invalidLease.calls.length,0);
  const legacyNotification=notificationFixture();const legacyPending=legacyNotification.context.applyProfileNotificationImport([]);
  legacyNotification.context.currentProfileId='child-b';legacyNotification.release({settings:{enabled:true}});await legacyPending;
  assert.equal(legacyNotification.context.profileNotificationSettingsState.profileId,'child-a','legacy late response cannot relabel state as new Child');
  assert.match(html,/cloudSystemManagementActiveTab==='runtime-diagnostics'/);
  for(const tab of ['reconciliation','web-settlements','media-settlements','client-logs','notifications','backup-restore','account-management'])assert(html.includes(`data-system-management-tab="${tab}"`));
  console.log('PASS management loader: fixed same-origin assets, parent Child/auth, disposal, stale mount, invalid assets, main navigation and syntax');
})().catch(error=>{console.error(error);process.exitCode=1;});
