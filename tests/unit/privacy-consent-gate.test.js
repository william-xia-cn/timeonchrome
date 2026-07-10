// privacy-consent-gate.test.js
// Run with: node tests/unit/privacy-consent-gate.test.js

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
  const manifest = JSON.parse(read('extension/manifest.json'));
  const consentCore = read('extension/core/privacy-consent.js');
  const consentHtml = read('extension/privacy-consent.html');
  const consentJs = read('extension/privacy-consent.js');
  const privacy = read('extension/privacy.html');
  const background = read('extension/background.js');
  const activationGate = read('extension/core/activation-gate.js');
  const cloudSync = read('extension/infra/cloud-sync.js');
  const bind = read('extension/bind.js');
  const admin = read('extension/admin/admin.js');
  const popup = read('extension/popup/popup.js');

  expectTrue('manifest is bumped to 1.7.9', manifest.version === '1.7.9');
  expectTrue('manifest keeps identity permissions for disclosed recovery feature', manifest.permissions.includes('identity') && manifest.permissions.includes('identity.email'));
  expectTrue('manifest still has no OAuth config', !Object.prototype.hasOwnProperty.call(manifest, 'oauth2'));

  expectTrue('consent core defines privacy_consent_v1', consentCore.includes("PRIVACY_CONSENT_KEY = 'privacy_consent_v1'"));
  expectTrue('consent core requires current policy version', consentCore.includes("PRIVACY_POLICY_VERSION = '2026-06-22'"));
  expectTrue('consent page has exact explicit consent button', consentHtml.includes('我已阅读并同意，启用 TimeOnChrome'));
  expectTrue('consent page discloses local collection and cloud upload timing', consentHtml.includes('同意后才开始') && consentHtml.includes('绑定云端后才会上传'));
  expectTrue('consent page discloses identity.email no OAuth boundary', consentHtml.includes('identity.email') && consentHtml.includes('不使用 Google OAuth'));
  expectTrue('consent script writes consent record and notifies background', consentJs.includes('acceptPrivacyConsent') && consentJs.includes('PRIVACY_CONSENT_ACCEPTED'));

  expectTrue('background imports privacy consent helpers and activation gate', background.includes("from './core/privacy-consent.js'") && background.includes("from './core/activation-gate.js'"));
  expectTrue('background caches activation and privacy consent state', background.includes('runtimeActivationState') && background.includes('privacyConsentAccepted') && background.includes('refreshPrivacyConsentCache'));
  expectTrue('activation gate preserves CWS user consent fallback', activationGate.includes('ACTIVATION_MODE_USER_CONSENT') && activationGate.includes('getPrivacyConsent') && activationGate.includes('privacyConsentRequired'));
  expectTrue('activation gate supports managed policy without broad config', (activationGate.includes('chrome.storage.managed.get') || activationGate.includes('chromeApi.storage.managed.get')) && activationGate.includes('ACTIVATION_MODE_MANAGED_POLICY') && !activationGate.includes('studyList') && !activationGate.includes('timeQuota'));
  expectTrue('background opens consent page on install/startup/update', background.includes('openPrivacyConsentPage') && background.includes('onInstalled') && background.includes('onStartup') && background.includes('onUpdated'));
  expectTrue('background gates module-load active tab bootstrap', background.includes("reason: 'privacy_consent_required'") && background.includes("bootstrapActiveTabTiming('bootstrap_active_tab')"));
  expectTrue('background gates monitoring enabled on runtime activation', background.includes('return runtimeActivationState?.activated === true && getSyncState().monitoringEnabled !== 0'));
  expectTrue('background gates timing signal dispatch', background.includes('initSignal((rawEvent) => {') && background.includes('if (!isMonitoringEnabled()) return;'));
  expectTrue('background exposes consent status/open/accepted messages', background.includes('GET_PRIVACY_CONSENT_STATUS') && background.includes('OPEN_PRIVACY_CONSENT') && background.includes('PRIVACY_CONSENT_ACCEPTED'));
  expectTrue('background blocks regular runtime messages before activation', background.includes('privacyConsentRequiredResponse') && background.includes('if (!runtimeActivationState?.activated)'));
  expectTrue('popup snapshot shows paused activation-required state', background.includes("mode: activation.activated ? mode : 'paused'") && background.includes('privacyConsentRequired: activation.privacyConsentRequired === true'));

  expectTrue('cloud sync imports activation gate', cloudSync.includes("import { resolveActivationState } from '../core/activation-gate.js';"));
  expectTrue('cloud sync blocks Chrome identity before runtime activation', cloudSync.includes('requireIdentityRecoveryActivation') && cloudSync.indexOf('requireIdentityRecoveryActivation') < cloudSync.indexOf('getProfileUserInfo'));
  expectTrue('cloud sync skips sync/heartbeat/init before activation', cloudSync.includes('Sync skipped: runtime activation required') && cloudSync.includes('Heartbeat skipped: runtime activation required') && cloudSync.includes('Init skipped: runtime activation required'));
  expectTrue('cloud bind refuses before activation', cloudSync.includes('activationRequired: true') && cloudSync.includes('privacyConsentRequired: activation.privacyConsentRequired === true'));

  expectTrue('bind page blocks login before activation', bind.includes('showPrivacyConsentRequired') && bind.includes('document.addEventListener') && bind.includes('btnLogin.disabled = true'));
  expectTrue('bind page does not read Chrome identity before activation', bind.includes('canUseChromeIdentityForBind') && bind.includes('getProfileUserInfo'));
  expectTrue('admin does not read Chrome identity before activation', admin.includes('canUseChromeIdentityForAdmin') && admin.includes('getProfileUserInfo'));
  expectTrue('admin status shows consent-required entry', admin.includes('隐私与数据使用说明待确认') && admin.includes('TimeOnChrome 暂未启用') && admin.includes('openPrivacyConsentFromAdmin'));
  expectTrue('popup shows consent-required entry', popup.includes('隐私与数据使用说明待确认') && popup.includes('查看并同意') && popup.includes('privacy-consent.html?reason=popup'));

  expectTrue('privacy policy says collection starts only after product consent', privacy.includes('只有用户点击“我已阅读并同意，启用 TimeOnChrome”后') && privacy.includes('扩展才会启动新的本地计时'));
  expectTrue('privacy policy updated date is current release date', privacy.includes('Last Updated:</strong> June 25, 2026'));
}

run();

if (failed > 0) {
  console.error(`\nprivacy-consent-gate: ${failed} failed, ${passed} passed`);
  process.exit(1);
}

console.log(`privacy-consent-gate: ${passed} passed`);
