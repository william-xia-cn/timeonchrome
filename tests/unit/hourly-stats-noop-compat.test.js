// Run with: node tests/unit/hourly-stats-noop-compat.test.js

'use strict';

const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const source = fs.readFileSync(
  path.join(__dirname, '..', '..', 'workers', 'src', 'routes', 'stats.ts'),
  'utf8'
);
const start = source.indexOf('function hasDeclaredPositiveDuration(');
const end = source.indexOf('\nfunction expandTargetStatsRows', start);
if (start < 0 || end < 0) throw new Error('hasDeclaredPositiveDuration helper not found');
const compiled = ts.transpileModule(`${source.slice(start, end)}\nmodule.exports = { hasDeclaredPositiveDuration };`, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const moduleBox = { exports: {} };
new Function('module', 'exports', compiled)(moduleBox, moduleBox.exports);
const { hasDeclaredPositiveDuration } = moduleBox.exports;

function check(label, condition) {
  if (!condition) throw new Error(label);
}

check('empty domains are zero-only', hasDeclaredPositiveDuration([]) === false);
check('zero shell is zero-only', hasDeclaredPositiveDuration([{
  domain: 'chrome-page.chrome-local',
  activeSeconds: 0,
  backgroundMediaSeconds: 0,
  pipSeconds: 0,
  totalSeconds: 0,
  rows: [],
}]) === false);
check('positive valid row is declared positive', hasDeclaredPositiveDuration([{
  rows: [{ channel: 'active', mode: 'study', durationSeconds: 180 }],
}]) === true);
check('positive invalid row still prevents silent no-op', hasDeclaredPositiveDuration([{
  rows: [{ channel: 'invalid', mode: 'invalid', durationSeconds: 180 }],
}]) === true);
check('positive legacy mode map is declared positive', hasDeclaredPositiveDuration([{
  activeByMode: { study: 180 },
}]) === true);
check('hourly domain route exposes explicit no-op response', source.includes("return json({ success: true, count: 0, hourKey, expandedRows: 0, noOp: true });"));
check('hourly target route uses the same positive-duration guard', source.includes('if (!hasDeclaredPositiveDuration(body.targets))'));

const routeCompiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const routeModule = { exports: {} };
const routeRequire = (id) => {
  if (id === '../db/middleware') {
    return {
      json: (body, status = 200) => new Response(JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json' },
      }),
      verifyAccountToken: async () => 'account-1',
    };
  }
  if (id === '../../../extension/core/domain-semantics.js') {
    return { normalizeHostname: (value) => String(value || '').trim().toLowerCase() };
  }
  if (id === './deviceIdentity') {
    return {
      verifyDeviceToken: async () => ({ profileId: 'profile-1', deviceId: 'device-1', unbound: false }),
      deviceUnboundResponse: () => new Response('{}', { status: 409 }),
    };
  }
  if (id === '../services/siteClassificationEmail') {
    return {
      evaluateDailyUnclassifiedEmailNotifications: async () => {},
      processEmailClassificationOutbox: async () => {},
    };
  }
  throw new Error(`unexpected require: ${id}`);
};
new Function('require', 'module', 'exports', routeCompiled)(routeRequire, routeModule, routeModule.exports);
const router = routeModule.exports.statsRouter;
const env = { DB: { prepare: () => { throw new Error('no-op payload must not touch D1'); } } };

(async () => {
  const zeroResponse = await router.handle(new Request('https://worker.test/device/hourly-stats/v1', {
    method: 'POST',
    headers: { authorization: 'Bearer test', 'content-type': 'application/json' },
    body: JSON.stringify({
      hourKey: '2026-08-30T04', date: '2026-08-30', hour: 4,
      domains: [{ domain: 'chrome-page.chrome-local', activeSeconds: 0, totalSeconds: 0, rows: [] }],
    }),
  }), env);
  const zeroBody = await zeroResponse.json();
  check('zero-only hourly route returns 200 no-op', zeroResponse.status === 200 && zeroBody.noOp === true && zeroBody.count === 0);

  const invalidPositiveResponse = await router.handle(new Request('https://worker.test/device/hourly-stats/v1', {
    method: 'POST',
    headers: { authorization: 'Bearer test', 'content-type': 'application/json' },
    body: JSON.stringify({
      hourKey: '2026-08-30T04', date: '2026-08-30', hour: 4,
      domains: [{ domain: 'example.com', rows: [{ channel: 'invalid', mode: 'invalid', durationSeconds: 180 }] }],
    }),
  }), env);
  check('invalid declared-positive hourly route remains 400', invalidPositiveResponse.status === 400);

  const zeroTargetResponse = await router.handle(new Request('https://worker.test/device/hourly-target-stats/v1', {
    method: 'POST',
    headers: { authorization: 'Bearer test', 'content-type': 'application/json' },
    body: JSON.stringify({
      hourKey: '2026-08-30T04', date: '2026-08-30', hour: 4,
      targets: [{ targetKey: 'fallback:domain:example.com', totalSeconds: 0, rows: [] }],
    }),
  }), env);
  const zeroTargetBody = await zeroTargetResponse.json();
  check('zero-only hourly target route returns 200 no-op', zeroTargetResponse.status === 200 && zeroTargetBody.noOp === true);

  console.log('[Hourly Stats No-op Compatibility] 10/10 passed');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
