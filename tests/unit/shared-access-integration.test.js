'use strict';
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
async function run() {
  const source = fs.readFileSync(path.resolve(__dirname, '../../extension/product/shared-access-integration.js'), 'utf8')
    .replace(/^import .*;\r?\n/gm, '');
  const mod = await import('data:text/javascript;base64,' + Buffer.from(`
    const configureSharedAccessRuntime=()=>{},isSharedAccessRuntimeV2Enabled=()=>false,pollSharedForcedUseV2=async()=>({ok:true});
    const configureSharedQuotaNativeBridge=()=>{},observeSharedAccessPolicyCapability=()=>{},readQuotaBucketsReadCapability=()=>({available:false});
    const readNativeHostDeploymentMarker=async()=>false,readSharedBrowserCloseCapability=async()=>({available:false});
  ` + source).toString('base64'));
  const calls = []; let allowed = true, supported = false, policyFailure = false, changed = 0;
  let stage = 'shared', effects = true;
  const controller = mod.createSharedAccessBootstrap({ readChannel: async()=>true, allowed: async()=>allowed,
    bucketCapability: ()=>({known:true,available:supported}), capability:async()=>({available:effects}),
    native: value=>calls.push(['native',value]), runtime:value=>calls.push(['runtime',value]),
    onExecutionChanged: async()=>{changed++;},
    v2:{available:()=>true, policy:async()=>{if(policyFailure)throw Error('offline');return {ok:true,policy:{schemaVersion:2,stage,forcedUsePolicyV1:{enabled:true}}};},
      configure:async value=>calls.push(['v2',value])} });
  assert.equal((await mod.pollSharedAccessIntegration()).skipped,true);
  let result = await controller.reconcile();
  assert.equal(result.execution,false); assert.equal(result.preparing,false);
  assert(!calls.some(([name])=>['basis','contribution','legacy'].includes(name)));
  supported=true; result=await controller.reconcile();
  assert.equal(result.execution,true); assert.equal(result.effectsEnabled,true);
  await controller.reconcile(); assert.equal(changed,1,'stable state does not reconfigure');
  effects=false; assert.equal((await controller.reconcile()).effectsEnabled,false);
  supported=false; assert.equal((await controller.reconcile()).execution,false);
  assert.equal(calls.filter(([name])=>name==='runtime').at(-1)[1].enabled,false);
  supported=true; await controller.reconcile(); policyFailure=true;
  assert.equal((await controller.reconcile()).errorCode,'shared_access_bootstrap_unavailable');
  assert.equal(calls.filter(([name])=>name==='runtime').at(-1)[1].enabled,false);
  policyFailure=false; stage='shadow'; assert.equal((await controller.reconcile()).execution,false);
  stage='shared'; allowed=false; assert.equal((await controller.reconcile()).execution,false);
  assert(!/configureSharedWebContributionSync|configureSharedQuotaExecutionReader|readSharedAccessPolicyLkg/.test(source));
  console.log('Shared access integration: current-only capability, shadow, failure and revocation PASS');
}
run().catch(error=>{console.error(error);process.exitCode=1;});
