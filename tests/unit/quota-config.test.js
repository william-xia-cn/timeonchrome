// quota-config.test.js
// Run with: node tests/unit/quota-config.test.js

'use strict';

const fs = require('fs');
const path = require('path');

let passed = 0;
let failed = 0;

function expectEqual(desc, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) passed++;
  else {
    failed++;
    console.error(`  ✗ ${desc}`);
    console.error(`    expected: ${JSON.stringify(expected)}`);
    console.error(`    actual:   ${JSON.stringify(actual)}`);
  }
}

function expectTrue(desc, cond) {
  if (cond) passed++;
  else {
    failed++;
    console.error(`  ✗ ${desc}`);
  }
}

function loadProdModule(relPath, exportNames) {
  const abs = path.join(__dirname, '..', '..', 'extension', relPath);
  let code = fs.readFileSync(abs, 'utf8');
  code = code.replace(/^\s*import[\s\S]*?;\s*$/gm, '');
  code = code.replace(/export\s+async\s+function\s+/g, 'async function ');
  code = code.replace(/export\s+function\s+/g, 'function ');
  code = code.replace(/export\s+const\s+/g, 'const ');
  code = code.replace(/export\s*\{[^}]*\};?\s*$/gm, '');
  const factory = new Function(`${code}\nreturn { ${exportNames.join(', ')} };`);
  return factory();
}

const quota = loadProdModule('core/quota-config.js', [
  'buildEffectiveTimeQuota',
  'getEffectiveQuotaForDate',
  'quotaDayKeyForDate',
  'weeklyRestLimitFromConfig',
]);

{
  const view = quota.buildEffectiveTimeQuota({
    dailyStudyQuota: 0,
    dailyRestQuota: 90,
    dailyUndeterminedQuota: 60,
  });
  expectEqual('legacy 0 maps study to unlimited', view.daily.monday.studyMinutes, null);
  expectEqual('legacy rest fallback is used', view.daily.monday.restMinutes, 90);
  expectEqual('legacy composite fallback is used', view.daily.monday.compositeMinutes, 60);
}

{
  const view = quota.buildEffectiveTimeQuota({
    dailyStudyQuota: 10,
    dailyRestQuota: 90,
    dailyUndeterminedQuota: 60,
    timeQuota: {
      daily: {
        monday: { studyMinutes: null, restMinutes: 30, compositeMinutes: 45 },
      },
    },
  });
  expectEqual('timeQuota null remains unlimited', view.daily.monday.studyMinutes, null);
  expectEqual('timeQuota rest wins over legacy', view.daily.monday.restMinutes, 30);
  expectEqual('timeQuota composite wins over legacy', view.daily.monday.compositeMinutes, 45);
  expectEqual('missing day falls back to legacy', view.daily.tuesday.restMinutes, 90);
}

{
  expectEqual('date maps to calendar weekday', quota.quotaDayKeyForDate('2026-05-18'), 'monday');
  const effective = quota.getEffectiveQuotaForDate({
    dailyOnlineQuota: 0,
    timeQuota: { daily: { monday: { studyMinutes: 20, restMinutes: 30, compositeMinutes: null } } },
  }, '2026-05-18');
  expectEqual('effective day reads matching timeQuota', effective.todayEffectiveQuota.studyMinutes, 20);
  expectEqual('explicit composite unlimited remains null', effective.todayEffectiveQuota.compositeMinutes, null);
  expectEqual('legacy online 0 is unlimited', effective.todayEffectiveQuota.onlineMinutes, null);
}

{
  const weekly = quota.weeklyRestLimitFromConfig({}, {
    monday: { restMinutes: 30 },
    tuesday: { restMinutes: 30 },
    wednesday: { restMinutes: 30 },
    thursday: { restMinutes: 30 },
    friday: { restMinutes: 30 },
    saturday: { restMinutes: 60 },
    sunday: { restMinutes: null },
  });
  expectEqual('daily rest plan never derives a weekly limit', weekly, { value: null, source: 'default' });
}

{
  expectEqual(
    'explicit weekly zero means zero-minute limit',
    quota.weeklyRestLimitFromConfig({ timeQuota: { weekly: { restMinutes: 0 } }, weeklyRestQuota: 300 }),
    { value: 0, source: 'timeQuota' },
  );
  expectEqual(
    'explicit weekly null overrides a legacy limit',
    quota.weeklyRestLimitFromConfig({ timeQuota: { weekly: { restMinutes: null } }, weeklyRestQuota: 300 }),
    { value: null, source: 'timeQuota' },
  );
  expectEqual(
    'positive legacy weekly limit remains compatible',
    quota.weeklyRestLimitFromConfig({ weeklyRestQuota: 300 }),
    { value: 300, source: 'legacy' },
  );
  expectEqual(
    'legacy weekly zero remains unlimited',
    quota.weeklyRestLimitFromConfig({ weeklyRestQuota: 0 }),
    { value: null, source: 'legacy' },
  );
}

{
  const effective = quota.getEffectiveQuotaForDate({
    dailyOnlineQuota: 0,
    timeQuota: { daily: { monday: { studyMinutes: null, restMinutes: 30, compositeMinutes: 45, onlineMinutes: 0 } } },
  }, '2026-05-18');
  expectEqual('explicit daily online zero means zero-minute limit', effective.todayEffectiveQuota.onlineMinutes, 0);
}

{
  const effective = quota.getEffectiveQuotaForDate({
    quotaBorrow: { borrowedFrom: '2026-05-18', amount: 15, repaid: false },
    timeQuota: { daily: { monday: { studyMinutes: null, restMinutes: 30, compositeMinutes: 45 } } },
  }, '2026-05-18');
  expectEqual('borrow day increases effective rest', effective.todayEffectiveQuota.restMinutes, 45);
  expectTrue('source records timeQuota rest', effective.source.day.rest === 'timeQuota');
}

const total = passed + failed;
console.log(`\n[Quota Config] ${passed}/${total} passed${failed ? ` — ${failed} FAILED` : ''}`);
if (failed > 0) process.exit(1);
