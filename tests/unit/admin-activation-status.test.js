'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '../..');
const admin = fs.readFileSync(path.join(root, 'extension/admin/admin.js'), 'utf8');
const renderSource = admin.slice(admin.indexOf('async function renderSyncStatus()'), admin.indexOf('async function forceSync()'));
const gateSource = fs.readFileSync(path.join(root, 'extension/core/activation-gate.js'), 'utf8')
  .replace(/^import .*;\r?$/gm, '').replace(/\bexport /g, '');
const escapeHtml = value => String(value).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));

async function renderFixture({ policy = {}, managed = true, development = false, accepted = false, gateFails = false } = {}) {
  const storage = accepted ? { privacy_consent_v1: { accepted: true, policyVersion: '2026-06-22' } } : {};
  const links = [];
  const container = { innerHTML: '', querySelector(selector) {
    return this.innerHTML.includes(`id="${selector.slice(1)}"`) ? { addEventListener: (event, handler) => links.push({ selector, event, handler }) } : null;
  } };
  const chrome = { storage: {
    managed: { get: (_, callback) => callback(policy) },
    local: { get: (_, callback) => callback ? callback(storage) : Promise.resolve(storage) },
  }, runtime: {}, identity: { getProfileUserInfo: (_, callback) => callback({ email: 'actual@example.invalid' }) } };
  const gateContext = { URL, chrome, readNativeHostDevelopmentMarker: async () => development,
    readManagedDeploymentMarker: async () => managed, getPrivacyConsent: async () => ({ accepted }), hasPrivacyConsent: async () => accepted };
  vm.createContext(gateContext);
  vm.runInContext(gateSource, gateContext);
  const state = await gateContext.resolveActivationState();
  const context = { chrome, document: { getElementById: () => container }, escHtml: escapeHtml, currentEmail: '',
    CLOUD_KEYS: { DEVICE_TOKEN: 'cloud_device_token', PRIVACY_CONSENT: 'privacy_consent_v1' },
    resolveActivationState: async () => { if (gateFails) throw Error('fixture_read_failure'); return state; },
    openPrivacyConsentFromAdmin() {}, openCloudLogin() {}, Date, isChildView: true };
  vm.createContext(context);
  vm.runInContext(renderSource, context);
  await context.renderSyncStatus();
  return { html: container.innerHTML, links, state };
}

async function run() {
  const valid = { enabled: true, deploymentMode: 'managed', cloudEndpoint: 'https://example.invalid', managedDeviceToken: 'synthetic-only' };
  const cases = [
    ['missing', {}, '尚未收到受管启用策略'],
    ['disabled', { ...valid, enabled: false }, '受管启用策略已关闭'],
    ['malformed', { enabled: true, deploymentMode: 'managed' }, '受管启用策略不完整'],
    ['wrong-mode', { ...valid, deploymentMode: 'ordinary' }, '部署方式不匹配'],
    ['profile-mismatch', { ...valid, managedProfileEmail: 'expected@example.invalid' }, '个人资料与受管部署不匹配'],
  ];
  for (const [name, policy, message] of cases) {
    const result = await renderFixture({ policy });
    assert.equal(result.state.activated, false, name);
    assert.equal(result.state.privacyConsentRequired, false, name);
    assert.ok(result.html.includes(message), name);
    assert.ok(!result.html.includes('open-privacy-consent-btn'), name);
    assert.equal(result.links.length, 0, name);
  }
  for (const options of [{ managed: false }, { managed: false, development: true }]) {
    const result = await renderFixture(options);
    assert.ok(result.html.includes('查看并同意'));
    assert.equal(result.links[0]?.selector, '#open-privacy-consent-btn');
  }
  const active = await renderFixture({ policy: valid });
  assert.equal(active.state.activated, true);
  assert.ok(active.html.includes('登录/绑定云端'));
  assert.ok(!active.html.includes('TimeOnChrome 暂未启用'));
  assert.ok(!active.html.includes('open-privacy-consent-btn'));
  const failed = await renderFixture({ gateFails: true });
  assert.ok(failed.html.includes('暂时无法确认启用状态'));
  assert.equal(failed.links.length, 0);
  console.log('Admin activation status: 9 cases passed (real activation and rendering functions, synthetic storage only)');
}

module.exports = { renderFixture };
if (require.main === module) run().catch(error => { console.error(error); process.exitCode = 1; });
