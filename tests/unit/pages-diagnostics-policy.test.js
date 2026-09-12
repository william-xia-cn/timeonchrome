const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const html = fs.readFileSync(path.join(__dirname, '../../pages/index.html'), 'utf8');
const code = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]).join('\n');
const ast = ts.createSourceFile('pages.js', code, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
const names = ['saveClientLoggingPolicy', 'requestQuotaAudit', 'refreshQuotaAudit'];
const functions = ast.statements.filter(s => ts.isFunctionDeclaration(s) && names.includes(s.name?.text)).map(s => s.getText(ast)).join('\n');
const inputs = {
  'client-log-policy-device': { value: 'device-test' }, 'client-log-policy-level': { value: 'warning' },
  'client-log-policy-category': { value: '' }, 'client-log-policy-ttl': { value: '2592000000' },
  'client-log-policy-detail': { checked: true }, 'quota-audit-device': { value: 'device-test' },
  'quota-audit-from': { value: '2026-09-01' }, 'quota-audit-to': { value: '2026-09-08' },
  'quota-audit-start': {}, 'quota-audit-result': {},
};
const writes = [], messages = [];
let state = { clientLoggingPolicyV1: { uploadEnabled: true, expiresAt: Date.now() + 1000 } };
let auditResult = { complete: false, reason: 'checksum_mismatch' };
const api = new Function('document', 'api', 'toast', `let currentProfileId='profile-test', remoteConfig = ${JSON.stringify(state)};
const ensureCloudDevices=async()=>{}, renderClientLogPolicySummary=()=>{}, formatClientLogTimestamp=String, escHtml=String;
${functions}; return { ${names}, getConfig:()=>remoteConfig };`)(
  { getElementById: id => inputs[id] }, async (route, method, body) => {
    if (method === 'PUT') { writes.push(body); state = { ...state, ...body.data }; }
    return route.includes('quota-audit') ? auditResult : { data: state };
  }, (...args) => messages.push(args));
(async () => {
  assert(html.includes('<option value="2592000000">30 天</option>'));
  assert(html.includes('本地缓存：最多 3 天'));
  await api.saveClientLoggingPolicy(true);
  const policy = api.getConfig().clientLoggingPolicyV1;
  assert.equal(policy.policyVersion, 2); assert.equal(policy.expiresAt, null);
  assert(policy.infoExpiresAt > Date.now() + 29 * 86400000);
  await api.requestQuotaAudit(); assert.equal(writes.length, 1, 'eight days must not submit');
  const date = new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10);
  inputs['quota-audit-from'].value = date; inputs['quota-audit-to'].value = date;
  await api.requestQuotaAudit(); assert.equal(writes.length, 2);
  assert.equal(writes[1].data.clientLoggingPolicyV1.quotaAuditRequest.deviceId, 'device-test');
  assert(writes[1].data.clientLoggingPolicyV1.quotaAuditRequest.expiresAt <= Date.now() + 86400000);
  await api.refreshQuotaAudit(); assert(inputs['quota-audit-result'].textContent.includes('证据不完整'));
  await api.saveClientLoggingPolicy(false);
  assert.equal(api.getConfig().clientLoggingPolicyV1.uploadEnabled, false);
  assert.equal(api.getConfig().clientLoggingPolicyV1.infoExpiresAt, null);
  assert.equal(api.getConfig().clientLoggingPolicyV1.quotaAuditRequest, null);
  const before = writes.length; await api.requestQuotaAudit(); assert.equal(writes.length, before, 'disabled authorization must not submit');
  inputs['client-log-policy-summary'] = {};
  const renderSource = ast.statements.find(s => ts.isFunctionDeclaration(s) && s.name?.text === 'renderClientLogPolicySummary').getText(ast);
  const render = new Function('document', 'remoteConfig', 'cloudDeviceLabel', 'escHtml', 'formatClientLogTimestamp', renderSource + '\nrenderClientLogPolicySummary();');
  const renderPolicy = { policyVersion: 2, uploadEnabled: true, infoExpiresAt: Date.now() + 30 * 86400000 };
  const renderDocument = { getElementById: id => inputs[id] };
  render(renderDocument, { clientLoggingPolicyV1: renderPolicy }, String, String, String);
  assert.equal(inputs['client-log-policy-ttl'].value, '2592000000');
  assert.equal(inputs['client-log-policy-device'].value, '');
  renderPolicy.uploadEnabled = false;
  render(renderDocument, { clientLoggingPolicyV1: renderPolicy }, String, String, String);
  assert.equal(inputs['client-log-policy-detail'].checked, false);
  assert.equal(inputs['client-log-policy-ttl'].disabled, true);
  console.log('PASS Pages layered policy, 30 days, disable, scoped audit request, date bounds and incomplete result');
})().catch(e => { console.error(e); process.exitCode = 1; });
