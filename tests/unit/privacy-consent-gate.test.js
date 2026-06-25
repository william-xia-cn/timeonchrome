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
  const cloudSync = read('extension/infra/cloud-sync.js');
  const bind = read('extension/bind.js');
  const admin = read('extension/admin/admin.js');
  const popup = read('extension/popup/popup.js');

  expectTrue('manifest is bumped to 1.7.8', manifest.version === '1.7.8');
  expectTrue('manifest keeps identity permissions for disclosed recovery feature', manifest.permissions.includes('identity') && manifest.permissions.includes('identity.email'));
  expectTrue('manifest still has no OAuth config', !Object.prototype.hasOwnProperty.call(manifest, 'oauth2'));

  expectTrue('consent core defines privacy_consent_v1', consentCore.includes("PRIVACY_CONSENT_KEY = 'privacy_consent_v1'"));
  expectTrue('consent core requires current policy version', consentCore.includes("PRIVACY_POLICY_VERSION = '2026-06-22'"));
  expectTrue('consent page has exact explicit consent button', consentHtml.includes('我已阅读并同意，启用 TimeOnChrome'));
  expectTrue('consent page discloses local collection and cloud upload timing', consentHtml.includes('同意后才开始') && consentHtml.includes('绑定云端后才会上传'));
  expectTrue('consent page discloses identity.email no OAuth boundary', consentHtml.includes('identity.email') && consentHtml.includes('不使用 Google OAuth'));
  expectTrue('consent script writes consent record and notifies background', consentJs.includes('acceptPrivacyConsent') && consentJs.includes('PRIVACY_CONSENT_ACCEPTED'));

  expectTrue('background imports privacy consent helpers', background.includes("from './core/privacy-consent.js'"));
  expectTrue('background caches privacy consent state', background.includes('privacyConsentAccepted') && background.includes('refreshPrivacyConsentCache'));
  expectTrue('background opens consent page on install/startup/update', background.includes('openPrivacyConsentPage') && background.includes('onInstalled') && background.includes('onStartup') && background.includes('onUpdated'));
  expectTrue('background gates module-load active tab bootstrap', background.includes("reason: 'privacy_consent_required'") && background.includes("bootstrapActiveTabTiming('bootstrap_active_tab')"));
  expectTrue('background gates monitoring enabled on privacy consent', background.includes('return privacyConsentAccepted === true && getSyncState().monitoringEnabled !== 0'));
  expectTrue('background gates timing signal dispatch', background.includes('initSignal((rawEvent) => {') && background.includes('if (!isMonitoringEnabled()) return;'));
  expectTrue('background exposes consent status/open/accepted messages', background.includes('GET_PRIVACY_CONSENT_STATUS') && background.includes('OPEN_PRIVACY_CONSENT') && background.includes('PRIVACY_CONSENT_ACCEPTED'));
  expectTrue('background blocks regular runtime messages before consent', background.includes('privacyConsentRequiredResponse') && background.includes('if (!privacyConsentAccepted)'));
  expectTrue('popup snapshot shows paused consent-required state', background.includes("mode: privacyConsent.accepted ? mode : 'paused'") && background.includes("reason: 'privacy_consent_required'"));

  expectTrue('cloud sync imports consent helper', cloudSync.includes("import { hasPrivacyConsent } from '../core/privacy-consent.js';"));
  expectTrue('cloud sync blocks Chrome identity before consent', cloudSync.includes("return { ok: false, reason: 'privacy_consent_required' }") && cloudSync.indexOf('privacy_consent_required') < cloudSync.indexOf('getProfileUserInfo'));
  expectTrue('cloud sync skips sync/heartbeat/init before consent', cloudSync.includes('Sync skipped: privacy consent required') && cloudSync.includes('Heartbeat skipped: privacy consent required') && cloudSync.includes('Init skipped: privacy consent required'));
  expectTrue('cloud bind refuses before consent', cloudSync.includes("privacyConsentRequired: true"));

  expectTrue('bind page blocks login before consent', bind.includes('showPrivacyConsentRequired') && bind.includes('document.addEventListener') && bind.includes('btnLogin.disabled = true'));
  expectTrue('bind page does not read Chrome identity before consent', bind.includes('if (!(await hasPrivacyConsent())) return {};') && bind.includes('getProfileUserInfo'));
  expectTrue('admin does not read Chrome identity before consent', admin.includes('if (!(await hasPrivacyConsent())) return {};') && admin.includes('getProfileUserInfo'));
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
