'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const source = fs.readFileSync(path.join(__dirname, '..', '..', 'workers', 'src', 'routes', 'device.ts'), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
let observedScope = null;
const dependencies = {
  '../db/middleware': { json: (data, status = 200) => ({ status, data }) },
  '../services/usageAccountingCorrections': {
    getBeijingWeekForTimestamp: () => ({ weekStart: '2026-09-21', weekEnd: '2026-09-27' }),
    listDeviceCorrectionEvidencePage: async (_env, profile, device, from, to, anchor, offset) => {
      observedScope = { profile, device, from, to, anchor, offset };
      return { items: [], total: 0, revision: 'stable', nextOffset: null };
    },
  },
  './deviceIdentity': {
    verifyDeviceTokenFromRequest: async (request) => request.headers.get('Authorization') === 'Bearer valid'
      ? { profileId: 'owned-profile', deviceId: 'owned-device', unbound: false } : null,
    deviceUnboundResponse: () => ({ status: 403 }),
  },
  '../config/system-access-config': {},
  '../../../extension/core/quota-config.js': {},
};
const moduleRef = { exports: {} };
vm.runInNewContext(compiled, {
  module: moduleRef,
  exports: moduleRef.exports,
  require: (name) => dependencies[name] || {},
  URL, Date, Number, RegExp, console,
});

(async () => {
  const router = moduleRef.exports.deviceRouter;
  const url = 'https://test.example/device/usage-accounting-corrections/v2?profileId=other-profile';
  const unauthenticated = await router.handle(new Request(url), {});
  assert.equal(unauthenticated.status, 401);
  const invalid = await router.handle(new Request(`${url}&offset=-1`, {
    headers: { Authorization: 'Bearer valid' },
  }), {});
  assert.equal(invalid.status, 400);
  const authenticated = await router.handle(new Request(`${url}&offset=0`, {
    headers: { Authorization: 'Bearer valid' },
  }), {});
  assert.equal(authenticated.status, 200);
  assert.equal(authenticated.data.schemaVersion, 2);
  assert.equal(observedScope.profile, 'owned-profile');
  assert.equal(observedScope.device, 'owned-device');
  assert.equal(observedScope.from, '2026-09-21');
  assert.equal(observedScope.to, '2026-09-27');
  console.log('[Device Correction Evidence Route] passed');
})().catch((error) => { console.error(error); process.exitCode = 1; });
