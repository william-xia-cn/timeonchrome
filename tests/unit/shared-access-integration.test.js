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
    const isSharedAccessRuntimeV2Enabled=()=>false,pollSharedForcedUseV2=async()=>({ok:true});
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
  const v2Calls = [];
  let v2Supported = true;
  const v2Controller = mod.createSharedAccessBootstrap({ readChannel: async () => true, allowed: async () => true,
    hostAvailable: () => false, capability: async () => ({ available: false }),
    native: options => v2Calls.push(['native', options.enabled]),
    policyReader: async options => { if (v2Supported) assert.equal(options.enabled, false); },
    basisReader: async options => { if (v2Supported) assert.equal(options.enabled, false); },
    contributions: async options => { if (v2Supported) assert.equal(options.enabled, false); },
    reminder: () => ({ ok: true }), activity: () => {},
    runtime: options => v2Calls.push(['runtime', options.enabled, options.schemaVersion]),
    v2: { available: () => v2Supported,
      policy: async () => ({ ok: true, policy: { schemaVersion: 2, stage: 'shared', forcedUsePolicyV1: { enabled: true } } }),
      configure: async options => v2Calls.push(['v2', options.enabled]) } });
  assert.equal((await v2Controller.reconcile()).schemaVersion, 2);
  assert(v2Calls.some(row => row[0] === 'runtime' && row[1] === true && row[2] === 2));
  await v2Controller.reconcile();
  assert.equal(v2Calls.filter(row => row[0] === 'v2' && row[1] === true).length, 1,
    'periodic bootstrap cannot reset same-rule confirmation grants');
  v2Supported = false;
  // Disable the standalone fixture before falling back to V1 readers.
  assert.equal((await v2Controller.reconcile()).execution, false);
  const background = fs.readFileSync(path.resolve(__dirname, '../../extension/background.js'), 'utf8');
  assert(background.includes('initSharedAccessIntegration({ onExecutionChanged: suspendLegacyRestUsageReminder,'));
  assert(background.includes('available: hasSharedForcedUseRuntimeV2Capability, policy: readSharedAccessPolicyV2Lkg'));
  assert(background.includes('await restoreRestUsageReminderForTab(tabId).catch'));
  const legacyReminder = fs.readFileSync(path.resolve(__dirname, '../../extension/product/rest-usage-reminder.js'), 'utf8');
  assert(legacyReminder.includes("if (sharedRuntimeSuspended && !prompt?.schedule) return { ok: false, error: 'legacy_rest_reminder_inactive' }"));
  delete globalThis.__integration;
  console.log('Shared integration: explicit readers, default off, busy and late-enable isolation PASS');
}
run().catch(error => { console.error(error); process.exitCode = 1; });
