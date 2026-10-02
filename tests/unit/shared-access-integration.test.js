'use strict';
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
async function run() {
  const calls = [], timers = new Set();
  let enabled = false, gate = null, rejectDisplay = false;
  globalThis.__integration = { calls, timers, enabled: () => enabled, set: v => { enabled = v; },
    policy: async v => { calls.push(['policy', v]); if (v && gate) await gate; },
    display: v => { calls.push(['display', v]); return { ok: !rejectDisplay }; } };
  const source = fs.readFileSync(path.resolve(__dirname, '../../extension/product/shared-access-integration.js'), 'utf8')
    .replace(/^import .*;\r?\n/gm, '');
  const mod = await import('data:text/javascript;base64,' + Buffer.from(`
    const f=globalThis.__integration;
    const isSharedAccessRuntimeEnabled=f.enabled,configureSharedAccessRuntime=({enabled})=>{f.set(enabled);f.calls.push(['runtime',enabled]);};
    const configureSharedBrowserActivity=v=>f.calls.push(['activity',v.enabled]),configureSharedQuotaNativeBridge=v=>f.calls.push(['native',v.enabled]);
    const hasSharedAccessExecutionCapability=()=>false,observeSharedAccessPolicyCapability=()=>{},readSharedAccessPolicyLkg=async()=>null;
    const readNativeHostDeploymentMarker=async()=>false,readSharedBrowserCloseCapability=async()=>({available:false});
    const configureSharedAccessPolicyReader=({enabled})=>f.policy(enabled),configureSharedQuotaExecutionReader=async v=>f.calls.push(['basis',v.enabled]);
    const configureSharedWebContributionSync=async v=>f.calls.push(['contribution',v.enabled]),configureSharedReminderContentBridge=({enabled})=>f.display(enabled);
    const pollSharedReminderForTab=async(id,date)=>{f.calls.push(['poll',id,date]);return {ok:true};};
    const chrome={tabs:{query:async()=>[{id:1}]}},setInterval=fn=>{f.timers.add(fn);return fn;},clearInterval=fn=>f.timers.delete(fn);
  ` + source).toString('base64'));
  assert.equal((await mod.pollSharedAccessIntegration()).skipped, true);
  assert.equal(calls.length, 0);
  assert.equal((await mod.configureSharedAccessIntegration({ enabled: true })).ok, true);
  for (const name of ['native', 'policy', 'basis', 'runtime', 'activity', 'contribution'])
    assert(calls.some(c => c[0] === name && c[1] === true), name);
  assert.equal(timers.size, 1);
  rejectDisplay = true;
  assert.equal((await mod.configureSharedAccessIntegration({ enabled: true })).ok, false);
  assert.equal(timers.size, 1, 'busy display does not remove existing polling');
  rejectDisplay = false;
  await mod.configureSharedAccessIntegration({ enabled: false });
  assert.equal(enabled, false); assert.equal(timers.size, 0);
  let release; gate = new Promise(resolve => { release = resolve; });
  const delayed = mod.configureSharedAccessIntegration({ enabled: true });
  await mod.configureSharedAccessIntegration({ enabled: false });
  release();
  assert.equal((await delayed).errorCode, 'shared_access_configuration_superseded');
  assert.equal(enabled, false); assert.equal(timers.size, 0, 'late enable cannot resurrect execution');
  gate = null;
  let channel = false, allowed = true, host = false, stage = 'shadow', permittedClose = false;
  const controller = mod.createSharedAccessBootstrap({ readChannel: async () => channel,
    allowed: async () => allowed, hostAvailable: () => host,
    policy: async () => ({ ok: true, policy: { stage } }),
    capability: async () => ({ available: permittedClose }) });
  assert.equal((await controller.reconcile()).preparing, false, 'ordinary channel never starts shared preparation');
  channel = true;
  assert.equal((await controller.reconcile()).preparing, true);
  assert.equal(enabled, false, 'missing Host preserves legacy execution');
  host = true;
  assert.equal((await controller.reconcile()).execution, false, 'shadow remains preparation only');
  stage = 'shared';
  assert.equal((await controller.reconcile()).execution, true);
  assert.equal((await controller.reconcile()).effectsEnabled, false);
  permittedClose = true;
  assert.equal((await controller.reconcile()).effectsEnabled, true);
  host = false;
  assert.equal((await controller.reconcile()).execution, false);
  assert.equal(enabled, false, 'Host loss leaves shared consumers immediately');
  allowed = false;
  assert.equal((await controller.reconcile()).preparing, false);
  const background = fs.readFileSync(path.resolve(__dirname, '../../extension/background.js'), 'utf8');
  assert(background.includes('initSharedAccessIntegration({ onExecutionChanged: suspendLegacyRestUsageReminder, allowed: async () =>'));
  assert(background.includes('if (!isSharedAccessRuntimeEnabled()) await restoreRestUsageReminderForTab'));
  assert(background.includes("error: 'legacy_rest_reminder_inactive'"));
  delete globalThis.__integration;
  console.log('Shared integration: explicit readers, default off, busy and late-enable isolation PASS');
}
run().catch(error => { console.error(error); process.exitCode = 1; });
