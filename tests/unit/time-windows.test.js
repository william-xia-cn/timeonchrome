// time-windows.test.js
// Run with: node tests/unit/time-windows.test.js

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

function loadModule() {
  const abs = path.join(__dirname, '..', '..', 'extension', 'core', 'time-windows.js');
  let code = fs.readFileSync(abs, 'utf8');
  code = code.replace(/export\s+function\s+/g, 'function ');
  code = code.replace(/export\s+const\s+/g, 'const ');
  code = code.replace(/export\s*\{[^}]*\};?\s*$/gm, '');
  return new Function(`${code}
return {
  computeOnlineWindowsForDay,
  defaultTimeWindowsDaily,
  getModeWindowStatus,
  hasTimeWindowsDaily,
  isWithinWindowList,
  normalizeWindowList,
  reminderReasonForModeWindow,
  timeWindowDayKeyForDate
};`)();
}

const tw = loadModule();

{
  expectEqual('empty array means unrestricted', tw.normalizeWindowList([]), null);
  expectEqual('missing means unrestricted', tw.normalizeWindowList(undefined), null);
  expectEqual('null means unrestricted', tw.normalizeWindowList(null), null);
}

{
  const online = tw.computeOnlineWindowsForDay({
    studyWindows: [{ start: '08:00', end: '10:00' }],
    compositeWindows: [{ start: '10:00', end: '12:00' }],
    restWindows: [{ start: '18:00', end: '20:00' }],
  });
  expectEqual('online is union of study/composite/rest', online, [
    { start: '08:00', end: '12:00' },
    { start: '18:00', end: '20:00' },
  ]);
}

{
  const online = tw.computeOnlineWindowsForDay({
    studyWindows: [{ start: '08:00', end: '10:00' }],
    compositeWindows: [],
    restWindows: [{ start: '18:00', end: '20:00' }],
  });
  expectEqual('any unrestricted category makes online unrestricted', online, null);
}

{
  expectTrue('10:30 is inside 10:00-11:00', tw.isWithinWindowList([{ start: '10:00', end: '11:00' }], new Date(2026, 4, 18, 10, 30)));
  expectTrue('11:00 is outside 10:00-11:00 end-exclusive', !tw.isWithinWindowList([{ start: '10:00', end: '11:00' }], new Date(2026, 4, 18, 11, 0)));
}

{
  const cfg = {
    timeWindows: {
      daily: {
        monday: {
          studyWindows: null,
          compositeWindows: [{ start: '08:00', end: '09:00' }],
          restWindows: [{ start: '15:30', end: '24:00' }],
        },
      },
    },
  };
  expectEqual('monday key from date', tw.timeWindowDayKeyForDate('2026-05-18'), 'monday');
  expectTrue('study unrestricted is allowed', tw.getModeWindowStatus(cfg, 'study', new Date(2026, 4, 18, 10, 0)).allowed);
  expectTrue('composite outside window is blocked', !tw.getModeWindowStatus(cfg, 'composite', new Date(2026, 4, 18, 10, 0)).allowed);
  expectTrue('rest inside 24:00 end window is allowed', tw.getModeWindowStatus(cfg, 'rest', new Date(2026, 4, 18, 23, 59)).allowed);
}

{
  expectEqual('study reminder reason', tw.reminderReasonForModeWindow('study'), 'study_schedule_locked');
  expectEqual('composite reminder reason', tw.reminderReasonForModeWindow('composite'), 'composite_schedule_locked');
  expectEqual('rest reminder reason', tw.reminderReasonForModeWindow('rest'), 'rest_schedule_locked');
}

const total = passed + failed;
console.log(`\n[Time Windows] ${passed}/${total} passed${failed ? ` — ${failed} FAILED` : ''}`);
if (failed > 0) process.exit(1);
