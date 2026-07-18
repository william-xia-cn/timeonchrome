// managed-activation-behavior.test.js
// Run with: node tests/unit/managed-activation-behavior.test.js

'use strict';

const path = require('path');
const { pathToFileURL } = require('url');

let passed = 0;
let failed = 0;

function expectTrue(description, condition) {
  if (condition) passed++;
  else {
    failed++;
    console.error(`  x ${description}`);
  }
}

async function run() {
  let managedPolicy = {};
  let currentEmail = '';
  let privacyConsent = null;

  global.chrome = {
    storage: {
      managed: {
        get(_keys, callback) {
          callback({ ...managedPolicy });
        },
      },
      local: {
        async get() {
          return privacyConsent ? { privacy_consent_v1: privacyConsent } : {};
        },
      },
    },
    identity: {
      getProfileUserInfo(_options, callback) {
        callback({ email: currentEmail });
      },
    },
    runtime: {
      lastError: null,
      getManifest() {
        return { version: '1.7.13' };
      },
    },
  };

  const moduleUrl = pathToFileURL(path.join(__dirname, '..', '..', 'extension', 'core', 'activation-gate.js')).href;
  const gate = await import(`${moduleUrl}?managed-activation-behavior=1`);

  managedPolicy = {
    enabled: true,
    deploymentMode: 'managed',
    cloudEndpoint: 'https://guardian-api.example.test',
    managedDeviceToken: 'a'.repeat(64),
    managedDeviceLabel: 'Managed Chrome',
    managedProfileEmail: 'william.xia.cn@gmail.com',
    allowIdentityRecovery: false,
  };
  currentEmail = 'William.Xia.Cn@gmail.com';
  privacyConsent = null;
  let state = await gate.resolveActivationState();
  expectTrue('matching managed profile activates without user privacy consent',
    state.activated === true && state.activationMode === 'managed_policy' && state.privacyConsentRequired === false);
  expectTrue('managed activation keeps the configured token available to cloud bootstrap',
    state.managedPolicy?.managedDeviceToken === 'a'.repeat(64));

  privacyConsent = { accepted: true, policyVersion: '2026-06-22' };
  currentEmail = 'different-profile@example.test';
  state = await gate.resolveActivationState();
  expectTrue('managed profile mismatch blocks activation',
    state.activated === false && state.reason === 'managed_profile_email_mismatch');
  expectTrue('managed profile mismatch blocks user-consent fallback', state.activationMode === 'disabled');

  currentEmail = 'william.xia.cn@gmail.com';
  managedPolicy = { ...managedPolicy, managedDeviceToken: '' };
  privacyConsent = null;
  state = await gate.resolveActivationState();
  expectTrue('managed policy without token or legacy anchors remains disabled',
    state.activated === false && state.managedPolicyStatus?.reason === 'managed_policy_malformed');

  managedPolicy = {};
  privacyConsent = { accepted: true, policyVersion: '2026-06-22' };
  state = await gate.resolveActivationState();
  expectTrue('ordinary user-consent activation remains compatible when no managed policy exists',
    state.activated === true && state.activationMode === 'user_consent');

  console.log(`\n[Managed Activation Behavior] ${passed}/${passed + failed} passed${failed ? ` — ${failed} FAILED` : ''}`);
  if (failed) process.exit(1);
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
