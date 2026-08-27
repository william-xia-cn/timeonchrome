'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..', '..');
let passed = 0;

function test(name, fn) {
  try { fn(); passed += 1; console.log(`  ✓ ${name}`); }
  catch (error) { console.error(`  ✗ ${name}`); throw error; }
}

function read(relative) { return fs.readFileSync(path.join(ROOT, relative), 'utf8'); }

function loadPolicyModule() {
  const source = read('native-app-control/worker/src/policy.ts');
  const output = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(output, { module, exports: module.exports, console, JSON, Set, Map });
  return module.exports;
}

test('Native Worker 不导入扩展或 guardian 业务模块', () => {
  const sourceDir = path.join(ROOT, 'native-app-control', 'worker', 'src');
  const files = fs.readdirSync(sourceDir).filter((file) => file.endsWith('.ts'));
  const source = files.map((file) => read(`native-app-control/worker/src/${file}`)).join('\n');
  assert(!source.includes("from '../../../extension"));
  assert(!source.includes("from '../../../workers/src"));
  assert(!source.includes("from '../../workers/src"));
});

test('Native D1 不包含 Chrome device、token、网站或时间统计字段', () => {
  const schema = read('native-app-control/worker/migrations/001_native_app_control_v1.sql');
  for (const forbidden of [
    /\bdevice_id\b/i, /managedDeviceToken/i, /device_token/i,
    /site_classification/i, /website/i, /duration_seconds/i, /quota/i,
  ]) assert(!forbidden.test(schema), `forbidden schema term: ${forbidden}`);
  for (const table of [
    'native_children_v1', 'native_macs_v1', 'santa_enrollments_v1',
    'application_identities_v1', 'account_applications_v1', 'application_memberships_v1',
    'application_observations_v1', 'child_application_states_v1',
    'child_publisher_blocks_v1', 'native_app_audit_events_v1',
  ]) assert(schema.includes(`CREATE TABLE ${table}`), `missing ${table}`);
});

test('Santa installer 不读取或修改 Chrome 组件', () => {
  const installer = read('native-app-control/installer/install-santa.sh');
  const profile = read('native-app-control/installer/com.timeonchrome.native-app-control.mobileconfig.template');
  assert(!/Software\/Policies\/Google\/Chrome|extension\/storage|managedDeviceToken|nativeMessaging|policy keeper/i.test(installer));
  assert(installer.includes('official-santa.pkg') || installer.includes('Official Santa package'));
  assert(installer.includes('--profile'));
  assert(!installer.includes('--sync-base-url-file'));
  assert(profile.includes('<string>com.northpolesec.santa</string>'));
  assert(!profile.includes('<string>com.google.santa</string>'));
  assert(profile.includes('<key>PayloadScope</key><string>System</string>'));
  assert(profile.includes('<key>PayloadOrganization</key><string>TimeOnChrome</string>'));
});

test('Enrollment URL 带尾斜杠且控制台下载专属 profile，不显示裸 secret', () => {
  const repository = read('native-app-control/worker/src/repository.ts');
  const html = read('native-app-control/console/index.html');
  const js = read('native-app-control/console/native-apps.js');
  assert(repository.includes('`${base}/santa/v1/${endpointId}/${secret}/`'));
  assert(js.includes('buildSantaMobileconfig'));
  assert(js.includes('application/x-apple-aspen-config'));
  assert(js.includes('TimeOnChrome-Santa-${label}.mobileconfig'));
  assert(js.includes('com.northpolesec.santa'));
  assert(js.includes('<key>PayloadScope</key><string>System</string>'));
  assert(!html.includes('id="sync-base-url"'));
  assert(html.includes('id="download-profile-button"'));
});

test('代码身份优先使用 SIGNINGID，然后 CDHASH 和 BINARY', () => {
  const policy = loadPolicyModule();
  assert.deepStrictEqual(
    JSON.parse(JSON.stringify(policy.chooseIdentity({ team_id: 'TEAM', signing_id: 'com.example.app', cdhash: 'abc' }))),
    { identityType: 'SIGNINGID', identifier: 'TEAM:com.example.app' }
  );
  assert.deepStrictEqual(
    JSON.parse(JSON.stringify(policy.chooseIdentity({ team_id: 'TEAM', signing_id: 'TEAM:com.example.app' }))),
    { identityType: 'SIGNINGID', identifier: 'TEAM:com.example.app' }
  );
  assert.strictEqual(policy.chooseIdentity({ cdhash: 'abc' }).identityType, 'CDHASH');
  assert.strictEqual(policy.chooseIdentity({ sha256: 'a'.repeat(64) }).identityType, 'BINARY');
});

test('TeamID 与顶层 BundleID 自动聚合 helper', () => {
  const policy = loadPolicyModule();
  const main = policy.applicationGroupKey({ team_id: 'TEAM', bundle_id: 'com.example.app' });
  const helper = policy.applicationGroupKey({
    team_id: 'TEAM', bundle_id: 'com.example.app.helper', top_level_bundle_id: 'com.example.app',
  });
  assert.strictEqual(main, helper);
  const pathMain = policy.applicationGroupKey({
    team_id: 'TEAM', bundle_id: 'com.example.app',
    file_path: '/Applications/Example.app/Contents/MacOS/Example',
  });
  const pathHelper = policy.applicationGroupKey({
    team_id: 'TEAM', bundle_id: 'com.example.helper',
    top_level_bundle_id: 'com.example.app',
    file_path: '/Applications/Example.app/Contents/Frameworks/Helper.app/Contents/MacOS/Helper',
  });
  assert.strictEqual(pathMain, pathHelper);
});

test('Native App 展示分类保守区分应用、组件、系统、后台与未知程序', () => {
  const policy = loadPolicyModule();
  assert.strictEqual(policy.classifyApplicationPresentation({
    id: 'app', team_id: 'TEAM', top_level_bundle_id: 'com.example.app',
    sample_path: '/Applications/Example.app/Contents/MacOS/Example',
  }), 'USER_APPLICATION');
  assert.strictEqual(policy.classifyApplicationPresentation({
    id: 'helper', team_id: 'TEAM', bundle_id: 'com.example.app.helper',
    sample_path: '/Applications/Example.app/Contents/Frameworks/Helper.app/Contents/MacOS/Helper',
  }), 'APPLICATION_COMPONENT');
  assert.strictEqual(policy.classifyApplicationPresentation({
    id: 'system', top_level_bundle_id: 'com.apple.systemuiserver',
    sample_path: '/System/Library/CoreServices/SystemUIServer.app/Contents/MacOS/SystemUIServer',
  }), 'SYSTEM_COMPONENT');
  assert.strictEqual(policy.classifyApplicationPresentation({
    id: 'system-no-bundle', sample_path: '/usr/libexec/sysmond',
  }), 'SYSTEM_COMPONENT');
  assert.strictEqual(policy.classifyApplicationPresentation({
    id: 'system-directory-only', sample_path: '/usr/libexec',
  }), 'SYSTEM_COMPONENT');
  assert.strictEqual(policy.classifyApplicationPresentation({
    id: 'mac-app', top_level_bundle_id: 'com.apple.calculator',
    sample_path: '/System/Applications/Calculator.app/Contents/MacOS',
  }), 'USER_APPLICATION');
  assert.strictEqual(policy.classifyApplicationPresentation({
    id: 'daemon', team_id: 'VENDOR', sample_path: '/Library/PrivilegedHelperTools/com.vendor.daemon',
  }), 'STANDALONE_BACKGROUND');
  assert.strictEqual(policy.classifyApplicationPresentation({
    id: 'unknown', sample_path: '/private/tmp/unidentified-tool',
  }), 'UNKNOWN_EXECUTABLE');
});

test('展示读取层把 helper 挂到父应用且不隐藏未知程序', () => {
  const policy = loadPolicyModule();
  const rows = policy.buildApplicationPresentation([
    {
      id: 'main', display_name: 'Example', team_id: 'TEAM',
      top_level_bundle_id: 'com.example.app',
      sample_path: '/Applications/Example.app/Contents/MacOS/Example', last_observed_at: 10,
    },
    {
      id: 'helper', display_name: 'Example Helper', team_id: 'TEAM',
      bundle_id: 'com.example.app.helper',
      sample_path: '/Applications/Example.app/Contents/Helpers/Helper.app/Contents/MacOS/Helper',
      last_observed_at: 11,
    },
    { id: 'system', top_level_bundle_id: 'com.apple.foo', sample_path: '/System/Library/foo', last_observed_at: 12 },
    { id: 'unknown', sample_path: '/private/tmp/unknown', last_observed_at: 13 },
  ]);
  const main = rows.find((row) => row.id === 'main');
  assert.strictEqual(main.componentCount, 1);
  assert.strictEqual(main.components[0].id, 'helper');
  assert.strictEqual(rows.some((row) => row.id === 'helper'), false);
  assert.strictEqual(rows.find((row) => row.id === 'unknown').reviewPriority, 'PRIMARY');
  assert.strictEqual(rows.find((row) => row.id === 'system').reviewPriority, 'SYSTEM');
});

test('签名链对象提取可读发布者且旧 object 字符串不会进入 UI', () => {
  const policy = loadPolicyModule();
  assert.strictEqual(policy.normalizePublisher({
    signing_chain: [
      { common_name: 'Developer ID Application: Example Inc. (TEAM)' },
      { common_name: 'Developer ID Certification Authority' },
    ],
  }), 'Developer ID Application: Example Inc. (TEAM)');
  assert.strictEqual(policy.normalizeStoredPublisher('[object Object],[object Object]'), null);
});

test('同一 TeamID 与顶层 BundleID 的历史 Application 只呈现一项', () => {
  const policy = loadPolicyModule();
  const rows = policy.buildApplicationPresentation([
    {
      id: 'legacy', display_name: 'EdgeUpdater', team_id: 'TEAM',
      top_level_bundle_id: 'com.example.updater',
      sample_path: '/Users/test/Library/Application Support/Example/EdgeUpdater.app/Contents/MacOS',
      last_observed_at: 10,
    },
    {
      id: 'current', display_name: 'EdgeUpdater', team_id: 'TEAM',
      top_level_bundle_id: 'com.example.updater',
      sample_path: '/Users/test/Library/Application Support/Example/EdgeUpdater.app/Contents/MacOS',
      last_observed_at: 20,
    },
  ]);
  assert.strictEqual(rows.length, 1);
  assert.strictEqual([...rows[0].relatedApplicationIds].sort().join(','), 'current,legacy');
  assert.strictEqual(rows[0].last_observed_at, 20);
});

test('Santa bundle discovery 使用官方 EventUpload 响应字段', () => {
  const policy = loadPolicyModule();
  const bundleHash = 'b'.repeat(64);
  const event = policy.normalizeSantaEvent({
    team_id: 'TEAM', signing_id: 'com.example.app', file_bundle_id: 'com.example.app',
    file_bundle_hash: bundleHash,
  });
  assert.strictEqual(event.bundleHash, bundleHash);
  const santa = read('native-app-control/worker/src/santa.ts');
  const repository = read('native-app-control/worker/src/repository.ts');
  assert(santa.includes('event_upload_bundle_binaries: result.bundleBinaryRequests'));
  assert(!/\n\s+bundle_binaries:/.test(santa));
  assert(repository.includes("decision = 'BUNDLE_BINARY'"));
  assert(repository.includes('o.bundle_hash IS NOT NULL'));
  assert(repository.includes("o.decision <> 'BUNDLE_BINARY'"));
  assert(repository.includes('const bundleApplicationIds = new Map'));
  assert(repository.includes('const EVENT_WRITE_BATCH_SIZE = 20'));
  assert(repository.includes('await env.DB.batch(statements)'));
});

test('Preflight 由云端启用全部执行事件及 clean sync 事件上传', () => {
  const santaSource = read('native-app-control/worker/src/santa.ts');
  assert.match(santaSource, /enable_all_event_upload:\s*true/);
  assert.match(santaSource, /enable_clean_sync_event_upload:\s*true/);
});

test('Santa sync 使用官方间隔字段并通过统一压缩请求体解析器', () => {
  const santa = read('native-app-control/worker/src/santa.ts');
  const requestBody = read('native-app-control/worker/src/requestBody.ts');
  assert(santa.includes("import { readSantaJsonObject } from './requestBody'"));
  assert(santa.includes('full_sync_interval_seconds: 60'));
  assert(santa.includes('batch_size: 20'));
  assert(!santa.includes('full_sync_interval: 60'));
  assert(requestBody.includes("value === 'deflate'"));
  assert(requestBody.includes("value === 'gzip'"));
  assert(requestBody.includes('new DecompressionStream(encoding)'));
  assert(requestBody.includes("throw new Error('invalid_santa_request_body')"));
});

test('应用列表显示未观察的预置规则，并从观察事实聚合 Native Mac', () => {
  const repository = read('native-app-control/worker/src/repository.ts');
  const consoleJs = read('native-app-control/console/native-apps.js');
  assert(repository.includes('LEFT JOIN application_observations_v1 o'));
  assert(repository.includes('CASE WHEN COUNT(o.id) > 0 THEN 1 ELSE 0 END AS observed'));
  assert(repository.includes('GROUP_CONCAT(DISTINCT o.native_mac_id) AS native_mac_ids'));
  assert(repository.includes('buildApplicationPresentation'));
  assert(repository.includes('MAX(ai.bundle_path) AS bundle_path'));
  assert(!repository.includes('m.native_mac_id'));
  assert(consoleJs.includes('预置规则 · 尚未在终端发现'));
});

test('待审核控制台按家长视角分层并将高级操作放入详情', () => {
  const html = read('native-app-control/console/index.html');
  const js = read('native-app-control/console/native-apps.js');
  const css = read('native-app-control/console/native-apps.css');
  assert(html.includes('id="review-count"'));
  assert(js.includes("applicationGroup('未知程序'"));
  assert(js.includes("applicationGroup('后台程序'"));
  assert(js.includes("applicationGroup('系统组件'"));
  assert(js.includes('内部组件'));
  assert(js.includes('applicationSearchText'));
  assert(js.includes("app.presentationClass === 'USER_APPLICATION'"));
  assert(js.includes('openApplicationDetails'));
  assert(html.includes('application-detail-dialog'));
  assert(css.includes('.application-group'));
  assert(css.includes('.detail-grid'));
  assert(css.includes('.application-search'));
});

test('Thomas 预置阻止项使用稳定 SIGNINGID，不扩大为发布者规则', () => {
  const policy = loadPolicyModule();
  const identifiers = [
    'MXGJJ98X76:com.valvesoftware.steam',
    '43AQ936H96:org.mozilla.firefox',
    'A2P9LX4JPN:com.operasoftware.Opera',
    'UBF8T346G9:com.microsoft.edgemac',
  ];
  const baseline = { identifier: 'baseline', policy: 'ALLOWLIST', rule_type: 'BINARY' };
  const rules = policy.compileSantaRules(
    identifiers.map((identifier) => ({ identities: [{ identityType: 'SIGNINGID', identifier }] })),
    [],
    baseline
  );
  for (const identifier of identifiers) {
    assert(rules.some((rule) => rule.rule_type === 'SIGNINGID' && rule.identifier === identifier));
  }
  assert(!rules.some((rule) => rule.rule_type === 'TEAMID'));
});

test('规则编译包含 baseline，应用阻止不产生 TEAMID，且去重', () => {
  const policy = loadPolicyModule();
  const baseline = { identifier: 'baseline', policy: 'ALLOWLIST', rule_type: 'BINARY' };
  const rules = policy.compileSantaRules([
    { identities: [
      { identityType: 'SIGNINGID', identifier: 'TEAM:app' },
      { identityType: 'SIGNINGID', identifier: 'TEAM:app' },
    ] },
  ], ['PUBLISHER'], baseline);
  assert.strictEqual(rules.filter((rule) => rule.identifier === 'TEAM:app').length, 1);
  assert(rules.some((rule) => rule.rule_type === 'TEAMID' && rule.identifier === 'PUBLISHER'));
  assert(!rules.some((rule) => rule.rule_type === 'TEAMID' && rule.identifier === 'TEAM:app'));
  const legacyRules = policy.compileSantaRules([
    { identities: [{ identityType: 'SIGNINGID', identifier: 'TEAM:TEAM:legacy.app' }] },
  ], [], baseline);
  assert(legacyRules.some((rule) => rule.rule_type === 'SIGNINGID' && rule.identifier === 'TEAM:legacy.app'));
  assert(!legacyRules.some((rule) => rule.identifier === 'TEAM:TEAM:legacy.app'));
});

test('CLEAN sync baseline 只接受无匹配副作用的固定 BINARY allow rule', () => {
  const policy = loadPolicyModule();
  const baseline = policy.parseBaselineRule(JSON.stringify({
    identifier: '0'.repeat(64), policy: 'ALLOWLIST', rule_type: 'BINARY',
  }));
  assert.strictEqual(baseline.identifier, '0'.repeat(64));
  assert.throws(() => policy.parseBaselineRule(JSON.stringify({
    identifier: 'TEAM', policy: 'ALLOWLIST', rule_type: 'TEAMID',
  })));
});

test('Guardian 身份桥限定 5 分钟 audience，删除事件使用独立 outbox', () => {
  const bridge = read('workers/src/services/nativeAppIdentityBridge.ts');
  assert(bridge.includes('NATIVE_APP_CONTROL_AUDIENCE'));
  assert(bridge.includes('timestamp + 300'));
  assert(bridge.includes('NATIVE_APP_LIFECYCLE_AUDIENCE'));
  assert(bridge.includes('native_app_lifecycle_outbox_v1'));
  assert(!bridge.includes('managedDeviceToken'));
});

test('独立控制台只共享登录和 Child，不包含网站/配额管理', () => {
  const html = read('native-app-control/console/index.html');
  const js = read('native-app-control/console/native-apps.js');
  assert(html.includes('Native Apps'));
  assert(js.includes("readLocal('session')") && js.includes("readLocal('currentProfileId')"));
  assert(js.includes('/native/v1/applications') && js.includes('/native/v1/macs'));
  assert(!/site-classification|timeQuota|timeWindows|guardian_config/.test(`${html}\n${js}`));
});

test('独立控制台可刷新 Guardian session 并重签 Native module token', () => {
  const js = read('native-app-control/console/native-apps.js');
  assert(js.includes('async function refreshGuardianSession()'));
  assert(js.includes("`${GUARDIAN_API}/auth/refresh`"));
  assert(js.includes("body: JSON.stringify({ refreshToken: session.refreshToken })"));
  assert(js.includes("writeLocal('session'"));
  assert(js.includes('response.status === 401 && await refreshGuardianSession()'));
  assert(js.includes('if (response.status === 401) { await issueModuleToken(); response = await call(); }'));
  assert(js.includes('登录状态已过期，请返回家长控制台重新登录'));
});

test('Pages staging 与独立 console 源码完全一致', () => {
  for (const file of ['index.html', 'native-apps.css', 'native-apps.js']) {
    assert.strictEqual(
      read(`native-app-control/console/${file}`),
      read(`pages/native-apps/${file}`),
      `${file} staging drift`
    );
  }
  assert(read('pages/index.html').includes('href="native-apps/"'));
});

console.log(`\nNative App Control tests: ${passed} passed`);
