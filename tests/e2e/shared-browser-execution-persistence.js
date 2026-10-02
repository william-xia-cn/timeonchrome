'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { chromium } = require('@playwright/test');
const root = path.resolve(__dirname, '../..');
const temporary = process.env.TOC_PERSISTENCE_FIXTURE_ROOT;
const executable = process.env.TOC_PERSISTENCE_CHROME;
if (!temporary || !executable) throw Error('Explicit retained fixture root and Chrome for Testing executable required');
const resolved = fs.realpathSync(temporary);
assert.equal(path.dirname(resolved), fs.realpathSync(os.tmpdir()));
assert(path.basename(resolved).startsWith('toc-execution-persistence-'));
const extension = path.join(resolved, 'fixture-extension');
const profile = path.join(resolved, 'isolated-profile');
assert(fs.existsSync(path.join(extension, 'manifest.json')) && fs.existsSync(profile), 'Reuse retained fixture only');
const sources = {};
for (const name of ['shared-browser-execution-attempts.js', 'shared-browser-execution-fence.js']) {
  const source = fs.readFileSync(path.join(root, 'extension/infra', name), 'utf8');
  sources[name] = crypto.createHash('sha256').update(source).digest('hex');
  fs.writeFileSync(path.join(extension, name), source);
}
fs.writeFileSync(path.join(extension, 'manifest.json'), JSON.stringify({manifest_version:3,
  name:'隔离执行登记验收', version:'0.0.1', background:{service_worker:'worker.js',type:'module'}}));
fs.writeFileSync(path.join(extension, 'test.html'), '<!doctype html><meta charset="utf-8"><title>隔离执行登记验收</title>仅测试独立登记库');
fs.writeFileSync(path.join(extension, 'worker.js'), `
import {createSharedBrowserExecutionAttemptStore} from './shared-browser-execution-attempts.js';
import {browserExecutionFence as fence,browserExecutionIdentityHash as hash} from './shared-browser-execution-fence.js';
const boot=crypto.randomUUID();
const store=createSharedBrowserExecutionAttemptStore();
let oldGeneration;
const identity=id=>({schemaVersion:1,roundId:'fixture-round',reminderId:'fixture-reminder',deliveryId:'fixture-delivery',
  policyRevision:'fixture-policy',stateRevision:'fixture-state',executionId:id,leaseId:'fixture-lease',activityId:'fixture-activity'});
const abortTransaction=async(mode,decide)=>{
  const db=await new Promise((resolve,reject)=>{const r=indexedDB.open('shared-browser-execution-attempts-v1',1);r.onsuccess=()=>resolve(r.result);r.onerror=reject;});
  try{return await new Promise((resolve,reject)=>{
    const tx=db.transaction('attempts','readwrite',{durability:'strict'}),s=tx.objectStore('attempts');
    tx.onabort=()=>reject(Error('injected abort'));tx.onerror=()=>reject(Error('transaction failed'));
    const r=s.getAll();r.onsuccess=()=>{const d=decide(r.result);if(d.record)s.add(d.record);if(d.deleteId)s.delete(d.deleteId);tx.abort();};
  });}finally{db.close();}
};
chrome.runtime.onMessage.addListener((message,sender,respond)=>{
  if(sender.id!==chrome.runtime.id)return;
  (async()=>{
    if(message.op==='boot')return {boot};
    if(message.op==='read')return {ids:[...await store.readAttemptedIds()]};
    if(message.op==='capture'){oldGeneration=fence.capture();return {ok:true};}
    if(message.op==='disconnect'){fence.invalidate();return {ok:true};}
    if(message.op==='claim'||message.op==='oldClaim')return store.claimAttempt(message.id,'fixture-lease',identity(message.id),message.op==='oldClaim'?oldGeneration:fence.capture());
    if(message.op==='abortClaim')return createSharedBrowserExecutionAttemptStore({transaction:abortTransaction}).claimAttempt(message.id,'fixture-lease',identity(message.id));
    if(message.op==='fixtureAck'||message.op==='abortRetire'){
      const value=identity(message.id);
      const proof=fence.acknowledge(await hash(value),value.executionId,value.leaseId,'stale');
      const proofValid=!!fence.evidence(proof);
      const result=await (message.op==='abortRetire'?createSharedBrowserExecutionAttemptStore({transaction:abortTransaction}):store).retireAttempt(proof);
      return {...result,proofValid};
    }
    throw Error('unsupported fixture operation');
  })().then(respond,error=>respond({ok:false,errorCode:'fixture_failed',errorName:String(error?.name||''),errorMessage:String(error?.message||'').slice(0,160)}));return true;
});`);
const rpc = (page, message) => page.evaluate(value => chrome.runtime.sendMessage(value), message);
let context;
async function connect(expectedId) {
  context = await chromium.launchPersistentContext(profile, {executablePath:executable,headless:true,
    ignoreDefaultArgs:['--disable-extensions'],args:[
      '--disable-extensions-except='+extension,'--load-extension='+extension,'--disable-background-networking'],timeout:30000});
  await context.route(/^https?:\/\//, route => route.abort());
  let worker=context.serviceWorkers()[0];
  if(!worker)worker=await context.waitForEvent('serviceworker',{timeout:15000});
  const id=worker.url().split('/')[2];
  if(expectedId)assert.equal(id,expectedId);
  const management=await context.newPage();
  await management.goto('chrome://extensions');
  const developerMode=management.locator('extensions-toolbar #devMode');
  if(!await developerMode.evaluate(toggle=>toggle.checked))await developerMode.click();
  // Restart does not reload changed unpacked code; reload only this isolated fixture.
  await management.locator('extensions-item[id="'+id+'"] #dev-reload-button').click();
  const page=await context.newPage();
  await page.goto('chrome-extension://'+id+'/test.html');
  return {page,id};
}
async function run() {
  try {
    const first=await connect();
    if(process.env.TOC_PERSISTENCE_DIAGNOSTIC==='1'){
      console.log(JSON.stringify({before:await rpc(first.page,{op:'read'}),ack:await rpc(first.page,{op:'fixtureAck',id:'fixture-acked-0'}),after:await rpc(first.page,{op:'read'})}));
      return;
    }
    const initial=(await rpc(first.page,{op:'read'})).ids;
    assert(initial.length<=1&&initial.every(id=>id==='fixture-acked-0'),'Only the known prior failed-run tombstone is allowed; never clear to pass');
    if(initial.length){
      assert.equal((await rpc(first.page,{op:'fixtureAck',id:initial[0]})).errorCode,'browser_execution_retirement_identity_mismatch');
      assert((await rpc(first.page,{op:'read'})).ids.includes(initial[0]),'Legacy unbound claim must remain');
    }
    const version=await context.browser().version();
    for(let i=0;i<45;i++){
      const id='fixture-v2-acked-'+i;
      await rpc(first.page,{op:'capture'});
      assert.equal((await rpc(first.page,{op:'claim',id})).ok,true);
      const retired=await rpc(first.page,{op:'fixtureAck',id});
      assert.equal(retired.retired,true,JSON.stringify(retired));
      assert.equal((await rpc(first.page,{op:'oldClaim',id})).errorCode,'browser_execution_generation_changed');
      assert.equal((await rpc(first.page,{op:'fixtureAck',id})).retired,false);
    }
    assert.equal((await rpc(first.page,{op:'claim',id:'lost-ack'})).ok,true);
    assert.equal((await rpc(first.page,{op:'claim',id:'lost-ack'})).ok,false);
    await rpc(first.page,{op:'capture'});
    await rpc(first.page,{op:'disconnect'});
    assert.equal((await rpc(first.page,{op:'oldClaim',id:'late-after-disconnect'})).errorCode,'browser_execution_generation_changed');
    assert.equal((await rpc(first.page,{op:'abortClaim',id:'aborted'})).ok,false);
    assert(!(await rpc(first.page,{op:'read'})).ids.includes('aborted'));
    assert.equal((await rpc(first.page,{op:'claim',id:'delete-abort'})).ok,true);
    assert.equal((await rpc(first.page,{op:'abortRetire',id:'delete-abort'})).ok,false);
    assert((await rpc(first.page,{op:'read'})).ids.includes('delete-abort'));
    assert.equal((await rpc(first.page,{op:'fixtureAck',id:'delete-abort'})).retired,true);
    const before=await rpc(first.page,{op:'boot'});
    const cdp=await context.newCDPSession(first.page);
    await cdp.send('ServiceWorker.enable');
    await cdp.send('ServiceWorker.stopAllWorkers');
    const after=await rpc(first.page,{op:'boot'});
    assert.notEqual(after.boot,before.boot,'Must actually reconstruct extension SW');
    assert.equal((await rpc(first.page,{op:'claim',id:'lost-ack'})).ok,false);
    await context.close();context=null;
    const second=await connect(first.id);
    assert.equal((await rpc(second.page,{op:'claim',id:'lost-ack'})).ok,false,'Same Profile restart retains tombstone');
    const retained=(await rpc(second.page,{op:'read'})).ids.length;
    for(let i=retained;i<20;i++)assert.equal((await rpc(second.page,{op:'claim',id:'lost-'+i})).ok,true);
    assert.equal((await rpc(second.page,{op:'claim',id:'overflow'})).errorCode,'browser_execution_attempt_store_full');
    assert.equal((await rpc(second.page,{op:'read'})).ids.length,20);
    const evidence={version,sources,retainedProfileReused:true,legacyUnboundTombstonesRetained:initial.length,strictIndexedDB:true,successfulRetirements:45,
      oldPreparedClaimsRejected:true,disconnectFenced:true,lostAckRetained:true,serviceWorkerRecreated:true,browserRestarted:true,
      realTransactionAbort:true,realDeleteAbort:true,capacityRejected:true,effectsEnabled:false,familyCredentials:false,
      ackAuthority:'injected fixture, not real Native Service',missing:['real Native Service authorization/ACK','incognito partition','page closing','ledger conservation']};
    const output=path.join(root,'output/playwright/d114');fs.mkdirSync(output,{recursive:true});
    fs.writeFileSync(path.join(output,'execution-persistence.json'),JSON.stringify(evidence,null,2));
    console.log(JSON.stringify(evidence));
  } finally {if(context)await context.close();}
}
run().catch(error=>{console.error(error.stack);process.exitCode=1;});
