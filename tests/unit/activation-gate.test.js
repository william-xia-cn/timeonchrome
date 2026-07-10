// activation-gate.test.js
// Run with: node tests/unit/activation-gate.test.js

'use strict';

const fs = require('fs');
const path = require('path');

let passed = 0;
let failed = 0;

function read(rel) {
  return fs.readFileSync(path.join(__dirname, '..', '..', rel), 'utf8');
}

function expectTrue(desc, cond) {
  if (cond) passed++;
  else {
    failed++;
    console.error(`  x ${desc}`);
  }
}

function run() {
  const activationGate = read('extension/core/activation-gate.js');
  const background = read('extension/background.js');
  const cloudSync = read('extension/infra/cloud-sync.js');
  const bind = read('extension/bind.js');
  const admin = read('extension/admin/admin.js');
  const popup = read('extension/popup/popup.js');

  expectTrue('activation gate defines managed/user/disabled modes',
    activationGate.includes("ACTIVATION_MODE_MANAGED_POLICY = 'managed_policy'") &&
    activationGate.includes("ACTIVATION_MODE_USER_CONSENT = 'user_consent'") &&
    activationGate.includes("ACTIVATION_MODE_DISABLED = 'disabled'"));
  expectTrue('managed policy schema is limited to activation endpoint and device token',
    activationGate.includes("'enabled'") &&
    activationGate.includes("'deploymentMode'") &&
    activationGate.includes("'cloudEndpoint'") &&
    activationGate.includes("'managedDeviceToken'") &&
    activationGate.includes("'managedDeviceLabel'") &&
    activationGate.includes("'managedProfileEmail'") &&
    activationGate.includes("'allowIdentityRecovery'") &&
    !activationGate.includes('studyList') &&
    !activationGate.includes('timeQuota') &&
    !activationGate.includes('timeWindows'));
  expectTrue('legacy tenant/devicePolicy anchors are retained only for compatibility',
    activationGate.includes('Legacy recovery anchors') &&
    activationGate.includes("'tenantId'") &&
    activationGate.includes("'devicePolicyId'"));
  expectTrue('managed policy is read from chrome.storage.managed',
    (activationGate.includes('chrome.storage.managed.get') || activationGate.includes('chromeApi.storage.managed.get')) && activationGate.includes('MANAGED_POLICY_KEYS'));
  expectTrue('managed activation requires managed deployment, https endpoint and token or legacy anchor',
    activationGate.includes("deploymentMode !== 'managed'") &&
    activationGate.includes("url.protocol === 'https:'") &&
    activationGate.includes('managedDeviceToken') &&
    activationGate.includes("'managed_policy_malformed'"));
  expectTrue('managed profile email mismatch blocks user consent fallback',
    activationGate.includes('managed_profile_email_mismatch') &&
    activationGate.indexOf('if (profileGate.required && !profileGate.matches)') < activationGate.indexOf('if (privacyConsent?.accepted === true)'));
  expectTrue('managed policy wins before user consent fallback',
    activationGate.indexOf('if (managed.active)') < activationGate.indexOf('if (privacyConsent?.accepted === true)'));
  expectTrue('identity recovery can be disabled by managed policy',
    activationGate.includes('isIdentityRecoveryAllowed') &&
    activationGate.includes('allowIdentityRecovery !== false'));

  expectTrue('background imports activation gate and caches activation state',
    background.includes("from './core/activation-gate.js'") &&
    background.includes('runtimeActivationState') &&
    background.includes('resolveActivationState'));
  expectTrue('background monitoring gate depends on activation state',
    background.includes('runtimeActivationState?.activated === true && getSyncState().monitoringEnabled !== 0'));
  expectTrue('background install does not force privacy consent page in managed mode',
    background.includes("activation.activationMode !== 'managed_policy'") &&
    background.includes("openPrivacyConsentPage('onInstalled'"));
  expectTrue('background exposes managed token presence but not token value',
    background.includes('sanitizeActivationForUi') &&
    background.includes('hasManagedDeviceToken') &&
    background.includes('managedDeviceToken: undefined') &&
    !background.includes('managedDeviceToken: activation.managedPolicy.managedDeviceToken'));

  expectTrue('cloud sync depends on activation gate instead of direct privacy consent',
    cloudSync.includes("from '../core/activation-gate.js'") &&
    cloudSync.includes('requireRuntimeActivation') &&
    cloudSync.includes('requireIdentityRecoveryActivation') &&
    !cloudSync.includes('hasPrivacyConsent'));
  expectTrue('cloud sync blocks identity recovery when policy disables it',
    cloudSync.includes("identity_recovery_disabled_by_policy"));
  expectTrue('cloud sync can adopt managedDeviceToken before legacy recovery',
    cloudSync.includes('tryManagedDeviceTokenBootstrap') &&
    cloudSync.includes('managed_device_token_adopted'));

  expectTrue('bind page can use managed activation without module imports',
    bind.includes('getManagedActivationPolicy') &&
    bind.includes('hasRuntimeActivation') &&
    bind.includes('canUseChromeIdentityForBind') &&
    bind.includes('managedDeviceToken'));
  expectTrue('admin shows read-only activation source',
    admin.includes('启用来源') &&
    admin.includes('受管理策略启用') &&
    admin.includes('canUseChromeIdentityForAdmin'));
  expectTrue('popup can show managed deployment notice',
    popup.includes('受管理部署') &&
    popup.includes('扩展已由管理策略启用'));
}

run();

if (failed > 0) {
  console.error(`\nactivation-gate: ${failed} failed, ${passed} passed`);
  process.exit(1);
}

console.log(`activation-gate: ${passed} passed`);