// native-host-development-activation.test.js
// Run with: node tests/unit/native-host-development-activation.test.js

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
  let privacyConsent = { accepted: true, policyVersion: '2026-06-22' };
  let managedReadCount = 0;
  let identityReadCount = 0;

  global.fetch = async () => ({
    ok: true,
    async json() { return { mode: 'native-host-development' }; },
  });
  global.chrome = {
    management: {
      async getSelf() {
        return { id: 'jdcancbiocacabbjdkngadmjpjmkdnih', installType: 'development' };
      },
    },
    storage: {
      managed: {
        get(_keys, callback) {
          managedReadCount++;
          callback({
            enabled: true,
            deploymentMode: 'managed',
            cloudEndpoint: 'https://guardian-api.example.test',
            managedDeviceToken: 'a'.repeat(64),
            managedProfileEmail: 'different-profile@example.test',
          });
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
        identityReadCount++;
        callback({ email: 'current-profile@example.test' });
      },
    },
    runtime: {
      id: 'jdcancbiocacabbjdkngadmjpjmkdnih',
      lastError: null,
      getURL(relativePath) { return `https://extension.test/${relativePath}`; },
      getManifest() { return { version: '1.7.34' }; },
    },
  };

  const moduleUrl = pathToFileURL(path.join(
    __dirname, '..', '..', 'extension', 'core', 'activation-gate.js')).href;
  const gate = await import(`${moduleUrl}?native-host-development-activation=1`);

  let state = await gate.resolveActivationState();
  expectTrue('development candidate uses ordinary user-consent activation',
    state.activated === true && state.activationMode === 'user_consent');
  expectTrue('development candidate does not expose or adopt managed policy',
    state.managedPolicy === null && state.managedPolicyStatus?.configured === false);
  expectTrue('development candidate never reads managed policy or Chrome profile email',
    managedReadCount === 0 && identityReadCount === 0);

  privacyConsent = null;
  state = await gate.resolveActivationState();
  expectTrue('development candidate still requires ordinary privacy consent',
    state.activated === false && state.reason === 'privacy_consent_required' &&
    state.privacyConsentRequired === true);
  expectTrue('privacy-consent failure still does not read managed identity',
    managedReadCount === 0 && identityReadCount === 0);

  console.log(`\n[Native Host Development Activation] ${passed}/${passed + failed} passed${failed ? ` — ${failed} FAILED` : ''}`);
  if (failed) process.exit(1);
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
