// managed-storage-schema.test.js
// Run with: node tests/unit/managed-storage-schema.test.js

'use strict';

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', '..');
let passed = 0;
let failed = 0;

function expectTrue(description, condition) {
  if (condition) passed++;
  else {
    failed++;
    console.error(`  x ${description}`);
  }
}

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function run() {
  const manifest = JSON.parse(read('extension/manifest.json'));
  const productionUpdateUrl = 'https://timeonchrome-update.pages.dev/timeonchrome/update.xml';
  const schemaName = manifest?.storage?.managed_schema;
  const schemaPath = path.join(root, 'extension', schemaName || '');
  const schema = fs.existsSync(schemaPath) ? JSON.parse(fs.readFileSync(schemaPath, 'utf8')) : {};
  const expectedTypes = {
    enabled: 'boolean',
    deploymentMode: 'string',
    cloudEndpoint: 'string',
    managedDeviceToken: 'string',
    managedDeviceLabel: 'string',
    managedProfileEmail: 'string',
    allowIdentityRecovery: 'boolean',
    tenantId: 'string',
    devicePolicyId: 'string',
  };

  const changelog = read('docs/CHANGELOG.md');
  const latestChangelogVersion = (changelog.match(new RegExp('^## \\[(\\d+\\.\\d+\\.\\d+)\\]', 'm')) || [])[1];
  expectTrue(`manifest version matches changelog ${latestChangelogVersion}`, !!latestChangelogVersion && manifest.version === latestChangelogVersion);
  expectTrue('manifest declares the production self-hosted update URL', manifest.update_url === productionUpdateUrl);
  expectTrue('manifest declares the managed storage schema', schemaName === 'managed-storage-schema.json');
  expectTrue('managed storage schema is packaged at the declared path', fs.existsSync(schemaPath));
  expectTrue('managed storage schema top-level type is object', schema.type === 'object');
  expectTrue('managed storage schema does not use top-level additionalProperties', !Object.prototype.hasOwnProperty.call(schema, 'additionalProperties'));

  for (const [key, type] of Object.entries(expectedTypes)) {
    expectTrue(`managed storage schema declares ${key} as ${type}`, schema.properties?.[key]?.type === type);
  }

  const activationGate = read('extension/core/activation-gate.js');
  for (const key of Object.keys(expectedTypes)) {
    expectTrue(`activation gate reads schema field ${key}`, activationGate.includes(`'${key}'`));
  }

  const background = read('extension/background.js');
  expectTrue('install/update lifecycle initializes cloud sync after activation refresh',
    background.includes("await refreshPrivacyConsentCache();") &&
    background.includes("initCloudSync(() => syncNowWithRuntimeEffects({}, 'onInstalled_cloud_sync'))"));
  expectTrue('managed install suppresses the manual bind welcome page',
    background.includes('activation.privacyConsentRequired === true') &&
    background.includes("openPrivacyConsentPage('onInstalled', 'bind.html?welcome=1')"));

  const cloudSync = read('extension/infra/cloud-sync.js');
  const adoptionStart = cloudSync.indexOf("'managed_device_token_adopted'");
  const adoptionEnd = cloudSync.indexOf('return { ok: true, recovered: true', adoptionStart);
  const adoptionBlock = cloudSync.slice(adoptionStart, adoptionEnd);
  expectTrue('managed adoption success log records only identifier presence',
    adoptionBlock.includes('hasDeviceId: true') && adoptionBlock.includes('hasProfileId: true'));
  expectTrue('managed adoption success log omits raw device/profile identifiers',
    !adoptionBlock.includes('deviceId,') && !adoptionBlock.includes('profileId,'));
  expectTrue('managed adoption logs omit the managed device label',
    !adoptionBlock.includes('managedDeviceLabel'));

  const templates = [
    read('docs/deployment/templates/macos-managed-storage.plist'),
    read('docs/deployment/templates/macos-pierce-stage-b-managed-policy.plist'),
    read('docs/deployment/templates/windows-chrome-policy.reg'),
    read('docs/deployment/templates/TimeOnChrome-Pierce-HKCU.reg'),
    read('docs/deployment/pierce-macos-target/enable-stage-b-managed-activation.sh'),
  ];
  for (const key of ['enabled', 'deploymentMode', 'cloudEndpoint', 'managedDeviceToken', 'managedDeviceLabel', 'managedProfileEmail', 'allowIdentityRecovery']) {
    expectTrue(`all managed deployment templates contain ${key}`, templates.every((template) => template.includes(key)));
  }

  const updatePolicyTemplates = [
    read('docs/deployment/templates/macos-chrome-extension-settings.plist'),
    read('docs/deployment/templates/macos-pierce-stage-a-com.google.Chrome.plist'),
    read('docs/deployment/templates/windows-chrome-policy.reg'),
    read('docs/deployment/templates/TimeOnChrome-Pierce-HKCU.reg'),
  ];
  expectTrue('all self-hosted deployment templates force the policy update URL for legacy versions',
    updatePolicyTemplates.every((template) => template.includes('override_update_url')));

  const packTool = read('tools/self-hosted-crx-dry-run.js');
  expectTrue('self-hosted pack tool rejects packages without managed schema',
    packTool.includes('managed storage schema is missing from extension package') &&
    packTool.includes('manifest storage.managed_schema must reference managed-storage-schema.json'));

  console.log(`\n[Managed Storage Schema] ${passed}/${passed + failed} passed${failed ? ` — ${failed} FAILED` : ''}`);
  if (failed) process.exit(1);
}

run();
