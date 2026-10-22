'use strict';
// 执行页面原函数；全部使用隔离凭据和模拟网络，不访问生产或真实存储。
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const html = fs.readFileSync(path.resolve(__dirname, '../../pages/index.html'), 'utf8');
function actualFunction(name) {
  const start = html.search(new RegExp(`^(?:async )?function ${name}\\(`, 'm'));
  assert.ok(start >= 0, name);
  const tail = html.slice(start);
  const end = tail.indexOf('\n}', tail.indexOf('{'));
  assert.ok(end >= 0, name);
  return tail.slice(0, end + 2);
}
const deferred = () => { let resolve, reject; const promise = new Promise((a,b) => {resolve=a;reject=b;}); return {promise,resolve,reject}; };
const response = (status, body={}) => ({status,ok:status>=200&&status<300,json:async()=>body});
function page(fetchImpl, options={}) {
  const nodes = new Map();
  const state = {session:{token:'old',refreshToken:'refresh-old',email:'isolated'},screen:null,cleared:0,invalidated:0};
  const context = vm.createContext({
    Headers, URLSearchParams, console:{warn(){}}, location:{search:''},
    fetch:fetchImpl,
    document:{getElementById(id){if(!nodes.has(id))nodes.set(id,{value:'',textContent:'',style:{}});return nodes.get(id);}},
    loadLocal:key=>state[key], saveLocal:(key,value)=>{state[key]=value;},
    showScreen:screen=>{state.screen=screen;},
    cloudUsageSession:{clear(){state.cleared++;}},
    cloudComputerReader:{invalidate(){state.invalidated++;}},cloudApplicationReader:{invalidate(){state.invalidated++;}},
    disposeRuntimeManagement(){if(options.disposeThrows)throw Error('fixture dispose');}, stopTelegramPairingPoll(){},
    renderProfileOptions(){}, renderNoProfile(){}, selectProfile:async()=>{}, launchAppRuntime:async()=>{state.launched=true;},
  });
  vm.runInContext(`let accountToken='old', accountSessionGeneration=0, accountRefreshInFlight=null;
    let profiles=[],currentProfileId='child',cloudStatsRequestVersion=0;
    let accountNotificationSettingsState={},profileNotificationSettingsState={};
    const API_BASE='https://isolated.invalid';
    ${['clearAccountSession','logout','refreshAccountTokenForPage','api','enterMain'].map(actualFunction).join('\n')}
    globalThis.setSession=(token,refreshToken)=>{accountSessionGeneration++;accountToken=token;saveLocal('session',{token,refreshToken});};
    globalThis.readToken=()=>accountToken;`, context);
  return {context,state,nodes};
}

test('parallel expired reads share one rotation and both retry with refreshed token', async()=>{
  const refresh = deferred(); let rotations=0,retries=0;
  const p=page(async(url,opts)=>{
    if(url.endsWith('/auth/refresh')){rotations++;return refresh.promise;}
    if(opts.headers.Authorization==='Bearer old')return response(401);
    retries++;return response(200,{ok:true});
  });
  const a=p.context.api('/profiles'),b=p.context.api('/devices');
  await new Promise(setImmediate);assert.equal(rotations,1);
  refresh.resolve(response(200,{token:'new',refreshToken:'refresh-new'}));
  await Promise.all([a,b]);assert.equal(retries,2);assert.equal(p.state.session.token,'new');
});

test('delayed 401 from old token reuses updated token without another rotation', async()=>{
  const late=deferred();let rotations=0;
  const p=page(async(url,opts)=>{
    if(url.endsWith('/auth/refresh')){rotations++;return response(200,{token:'new',refreshToken:'refresh-new'});}
    if(opts.headers.Authorization==='Bearer old')return url.endsWith('/late')?late.promise:response(401);
    return response(200,{ok:true});
  });
  const waiting=p.context.api('/late');await p.context.api('/profiles');
  late.resolve(response(401));await waiting;
  assert.equal(rotations,1);assert.equal(p.state.session.token,'new');
});

test('rejected refresh exits loading shell, clears current credentials, and does not launch Runtime', async()=>{
  const p=page(async()=>response(401,{error:'Invalid refresh token'}));
  await p.context.enterMain('isolated');
  assert.equal(p.state.session,null);assert.equal(p.state.screen,'login');
  assert.match(p.nodes.get('login-error').textContent,/登录已失效/);assert.equal(p.state.launched,undefined);
});

test('network and 5xx refresh failures preserve credentials and show recoverable bootstrap failure', async()=>{
  for(const failure of [new Error('network'),response(503)]){
    const p=page(async url=>{if(!url.endsWith('/auth/refresh'))return response(401);if(failure instanceof Error)throw failure;return failure;});
    await p.context.enterMain('isolated');
    assert.equal(p.state.session.token,'old');assert.equal(p.state.screen,'login');
    assert.match(p.nodes.get('login-error').textContent,/登录信息已保留/);
  }
});

test('logout during refresh cannot restore expired session; disposal failure cannot prevent local exit', async()=>{
  const refresh=deferred();
  const p=page(async url=>url.endsWith('/auth/refresh')?refresh.promise:response(401),{disposeThrows:true});
  const request=p.context.api('/profiles');await new Promise(setImmediate);
  p.context.logout();assert.equal(p.state.session,null);assert.equal(p.state.screen,'login');
  assert.equal(p.state.cleared,1);assert.equal(p.state.invalidated,2);
  refresh.resolve(response(200,{token:'late',refreshToken:'late-refresh'}));
  await assert.rejects(request,{code:'ACCOUNT_SESSION_CHANGED'});assert.equal(p.state.session,null);
});

test('new login or another tab replacing storage is not cleared by old refresh rejection', async()=>{
  for(const otherTab of [false,true]){
    const refresh=deferred();
    const p=page(async url=>url.endsWith('/auth/refresh')?refresh.promise:response(401));
    const request=p.context.api('/profiles');await new Promise(setImmediate);
    if(otherTab)p.state.session={token:'new-login',refreshToken:'new-login-refresh'};
    else p.context.setSession('new-login','new-login-refresh');
    refresh.resolve(response(401));await assert.rejects(request,{code:'ACCOUNT_SESSION_CHANGED'});
    assert.equal(p.state.session.token,'new-login');assert.equal(p.state.cleared,0);
  }
});

test('late successful protected response cannot populate a replacement session', async()=>{
  const late=deferred();const p=page(async()=>late.promise);
  const request=p.context.api('/profiles');p.context.setSession('replacement','replacement-refresh');
  late.resolve(response(200,{profiles:[{id:'old-child'}]}));
  await assert.rejects(request,{code:'ACCOUNT_SESSION_CHANGED'});assert.equal(p.state.session.token,'replacement');
});

test('login rejection does not rotate an existing refresh token; persistent retry rejection stops', async()=>{
  let rotations=0;
  const p=page(async url=>{if(url.endsWith('/auth/refresh')){rotations++;return response(200,{token:'new',refreshToken:'new-refresh'});}return response(401);});
  await assert.rejects(p.context.api('/auth/login','POST',{}),{status:401});assert.equal(rotations,0);
  await assert.rejects(p.context.api('/profiles'),{status:401});assert.equal(rotations,1);assert.equal(p.state.session,null);
});

test('logout clears actual usage session and does not wait for remote revocation',()=>{
  const p=page(()=>new Promise(()=>{}));p.context.logout();
  assert.equal(p.state.screen,'login');assert.equal(p.state.session,null);assert.equal(p.state.cleared,1);
  assert.doesNotMatch(actualFunction('logout'),/cloudApplicationReadCache/);
});

test('authenticated change-password retains expired-token refresh and original POST body',async()=>{
  let rotations=0,attempts=0;
  const p=page(async(url,opts)=>{
    if(url.endsWith('/auth/refresh')){rotations++;return response(200,{token:'new',refreshToken:'new-refresh'});}
    attempts++;assert.equal(opts.method,'POST');assert.equal(opts.body,'{"fixture":true}');
    return response(opts.headers.Authorization==='Bearer old'?401:200);
  });
  await p.context.api('/auth/change-password','POST',{fixture:true});
  assert.equal(rotations,1);assert.equal(attempts,2);assert.equal(p.state.session.token,'new');
});

test('late retried 401 cannot clear a token refreshed again by another pending read',async()=>{
  const late=deferred();let rotations=0;
  const p=page(async(url,opts)=>{
    if(url.endsWith('/auth/refresh')){rotations++;return response(200,{token:`new-${rotations}`,refreshToken:`refresh-${rotations}`});}
    if(url.endsWith('/first')&&opts.headers.Authorization==='Bearer new-1')return late.promise;
    return response(opts.headers.Authorization==='Bearer new-2'?200:401);
  });
  const first=p.context.api('/first');await new Promise(setImmediate);
  await p.context.api('/second');late.resolve(response(401));
  await assert.rejects(first,{code:'ACCOUNT_SESSION_CHANGED'});assert.equal(p.state.session.token,'new-2');
});

test('standalone Runtime logout clears local session and navigates before pending DELETE',async()=>{
  const src=fs.readFileSync(path.resolve(__dirname,'../../app-runtime-management/console/app-runtime.js'),'utf8');
  const handler=src.split("if(!embedded)listen($('#runtime-logout'),'click', async () => {")[1].split('\n  });')[0];
  let cleared=false,navigated=false,requested=false;
  const run=new Function('applicationReadCache','usageReadSession','AppRuntimeSession','sessionStorage','fetch','RUNTIME_API','location',`return (async()=>{${handler}})();`);
  await run({clear(){}},{clear(){}},{load:()=>({token:'isolated'}),clear:()=>{cleared=true;}},{},()=>{requested=true;assert.equal(cleared,true);return new Promise(()=>{});},'https://isolated.invalid',{assign:()=>{navigated=true;}});
  assert.equal(requested,true);assert.equal(cleared,true);assert.equal(navigated,true);
});
