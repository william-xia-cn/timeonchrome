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
  assert.match(html,/view==='system'\?'system-management':view/);
  assert.match(html,/cloudSystemManagementActiveTab==='runtime-diagnostics'/);
  for(const tab of ['reconciliation','web-settlements','media-settlements','client-logs','notifications','backup-restore','account-management'])assert(html.includes(`data-system-management-tab="${tab}"`));
  console.log('PASS management loader: fixed same-origin assets, parent Child/auth, disposal, stale mount, invalid assets, main navigation and syntax');
})().catch(error=>{console.error(error);process.exitCode=1;});
