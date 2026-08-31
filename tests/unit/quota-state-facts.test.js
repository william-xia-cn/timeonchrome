// quota-state-facts.test.js
// Run with: node tests/unit/quota-state-facts.test.js

'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

let passed = 0;
let failed = 0;

function check(name, condition, detail = '') {
  if (condition) passed++;
  else {
    failed++;
    console.error(`  FAIL ${name}${detail ? `: ${detail}` : ''}`);
  }
}

function loadFacts() {
  const file = path.join(__dirname, '..', '..', 'extension', 'core', 'quota-state-facts.js');
  let code = fs.readFileSync(file, 'utf8');
  code = code.replace(/export\s+const\s+/g, 'const ');
  code = code.replace(/export\s+function\s+/g, 'function ');
  code += `\nthis.__facts = {
    QUOTA_TIMEZONE, CLOUD_QUOTA_STATE_FACT_KEY, weekStartForDateKey,
    getQuotaCalendarContext, normalizeQuotaState, makeCloudQuotaStateFact,
    isCloudQuotaStateFactCurrent, combineQuotaStates, restQuotaReminderReason
  };`;
  const context = { console, Date, Intl, Object, Number, Boolean, Math };
  vm.createContext(context);
  vm.runInContext(code, context, { filename: 'quota-state-facts.js' });
  return context.__facts;
}

const q = loadFacts();

const mondayEarly = Date.parse('2026-08-30T16:30:00.000Z');
const calendar = q.getQuotaCalendarContext(mondayEarly);
check('北京时间周一凌晨不回退到 UTC 周日', calendar.date === '2026-08-31', JSON.stringify(calendar));
check('北京时间周一起点为当天', calendar.weekStart === '2026-08-31', JSON.stringify(calendar));
check('周日归入此前周一', q.weekStartForDateKey('2026-08-30') === '2026-08-24');

const currentFalse = q.makeCloudQuotaStateFact({
  date: '2026-08-31', weekStart: '2026-08-31', computedAt: mondayEarly,
  restLocked: false, dailyRestLocked: false, weeklyRestLocked: false,
}, calendar, mondayEarly);
check('当前周期云端 false fact 可建立', Boolean(currentFalse));
check('旧 effective true 不参与新一轮合成', q.combineQuotaStates({}, currentFalse, calendar).restLocked === false);

const currentTrue = q.makeCloudQuotaStateFact({
  date: '2026-08-31', weekStart: '2026-08-31', computedAt: mondayEarly,
  restLocked: true, dailyRestLocked: false, weeklyRestLocked: true,
}, calendar, mondayEarly);
const cloudLocked = q.combineQuotaStates({}, currentTrue, calendar);
check('当前周期云端周锁参与 effective state', cloudLocked.restLocked && cloudLocked.weeklyRestLocked);

const staleFact = {
  ...currentTrue,
  date: '2026-08-30',
  weekStart: '2026-08-24',
};
check('上周云端锁在周一失效', q.combineQuotaStates({}, staleFact, calendar).restLocked === false);
check('周期不匹配响应被拒绝', q.makeCloudQuotaStateFact({
  date: '2026-08-30', weekStart: '2026-08-24', restLocked: true,
}, calendar, mondayEarly) === null);

const localLocked = q.combineQuotaStates({ restLocked: true, dailyRestLocked: true }, currentFalse, calendar);
check('云端 false 不得解除真实本地日锁', localLocked.restLocked && localLocked.dailyRestLocked);
check('周锁使用周提示', q.restQuotaReminderReason({ restLocked: true, weeklyRestLocked: true }) === 'weekly_rest_locked');
check('日锁使用日提示', q.restQuotaReminderReason({ restLocked: true, dailyRestLocked: true }) === 'daily_rest_locked');

const cloudSyncSource = fs.readFileSync(path.join(__dirname, '..', '..', 'extension', 'infra', 'cloud-sync.js'), 'utf8');
const pullBody = cloudSyncSource.slice(
  cloudSyncSource.indexOf('export async function pullCloudQuotaState'),
  cloudSyncSource.indexOf('// ── Upload stats', cloudSyncSource.indexOf('export async function pullCloudQuotaState'))
);
check('云端配额查询使用统一配额日历', pullBody.includes('getQuotaCalendarContext()') && pullBody.includes('calendar.date'));
check('云端配额同步不再粘性 OR effective lock', !pullBody.includes('localQs.') && !pullBody.includes('|| result.'));
check('云端配额事实独立持久化', pullBody.includes('CLOUD_QUOTA_STATE_FACT_KEY') && pullBody.includes('makeCloudQuotaStateFact'));

const storageSource = fs.readFileSync(path.join(__dirname, '..', '..', 'extension', 'infra', 'storage.js'), 'utf8');
check('跨日重置覆盖日锁和周锁字段', storageSource.includes('qs.dailyRestLocked || qs.weeklyRestLocked'));
check('跨日重置清除旧云端配额事实', storageSource.includes("remove('cloud_quota_state_fact_v1')"));

const managedStatsSource = fs.readFileSync(path.join(__dirname, '..', '..', 'extension', 'stats', 'managed-statistics.js'), 'utf8');
check('周用量范围以传入配额日期为终点', managedStatsSource.includes('endDate: date') && managedStatsSource.includes("new Date(`${date}T00:00:00Z`)"));

const total = passed + failed;
console.log(`[Quota State Facts] ${passed}/${total} passed${failed ? ` - ${failed} FAILED` : ''}`);
if (failed) process.exit(1);
