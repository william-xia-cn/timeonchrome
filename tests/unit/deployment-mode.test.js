// Run with: node tests/unit/deployment-mode.test.js

'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', '..');
const source = fs.readFileSync(path.join(root, 'extension', 'core', 'deployment-mode.js'), 'utf8');
const stableId = 'jdcancbiocacabbjdkngadmjpjmkdnih';

async function load({ marker, extensionId = stableId, installType = 'development' }) {
  global.chrome = {
    runtime: {
      id: extensionId,
      getURL: (value) => `chrome-extension://${extensionId}/${value}`,
    },
    management: {
      getSelf: async () => ({ id: extensionId, installType }),
    },
  };
  global.fetch = async () => marker === null
    ? { ok: false, json: async () => null }
    : { ok: true, json: async () => marker };
  const encoded = Buffer.from(`${source}\n// test-${Math.random()}`).toString('base64');
  return import(`data:text/javascript;base64,${encoded}`);
}

async function run() {
  const managed = await load({ marker: { mode: 'managed' }, installType: 'admin' });
  assert.strictEqual(await managed.readManagedDeploymentMarker(), true);
  assert.strictEqual(await managed.readNativeHostDeploymentMarker(), true);

  const development = await load({ marker: { mode: 'native-host-development' } });
  assert.strictEqual(await development.readManagedDeploymentMarker(), false);
  assert.strictEqual(await development.readNativeHostDeploymentMarker(), true);

  const normalInstall = await load({ marker: { mode: 'native-host-development' }, installType: 'normal' });
  assert.strictEqual(await normalInstall.readNativeHostDeploymentMarker(), false);

  const wrongId = await load({
    marker: { mode: 'native-host-development' },
    extensionId: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  });
  assert.strictEqual(await wrongId.readNativeHostDeploymentMarker(), false);

  const regular = await load({ marker: null });
  assert.strictEqual(await regular.readManagedDeploymentMarker(), false);
  assert.strictEqual(await regular.readNativeHostDeploymentMarker(), false);

  console.log('[Deployment Mode] 8/8 passed');
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
