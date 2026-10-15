'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require('node:path').join(__dirname, '../../extension/content.js'), 'utf8');
const functionText = (start, end) => source.slice(source.indexOf(`  function ${start}`), source.indexOf(`  ${end}`, source.indexOf(`  function ${start}`)));
const context = {};
vm.runInNewContext(functionText('formatDurationCN', 'function pauseMediaForRestReminder')
  + functionText('restReminderCopy', 'async function showRestUsageReminder') + ';this.copy=restReminderCopy;', context);
const copy = (reasons, presentation) => context.copy({ confirmationKind: 'forced_use', forcedUseReasons: reasons, forcedUsePresentation: presentation });
let row = copy(['dailyRest'], { quotas: [{ id: 'dailyRest', usedSeconds: 7800, limitSeconds: 7200 }] });
assert.equal(row.title, '今日休息已超出配额');
assert.match(row.subtitle, /已用2小时10分，标准配额2小时，已超出10分/);
assert.equal(copy(['dailyRest'], { quotas: [{ id: 'dailyRest', usedSeconds: 7200, limitSeconds: 7200 }] }).title, '今日休息已达到配额');
row = copy(['timeWindow'], { classification: 'restricted', nextWindow: { dayOffset: 0, start: '16:30', end: '19:30' } });
assert.equal(row.title, '当前不在允许使用时段');
assert.match(row.subtitle, /受限娱乐/);
assert.match(row.subtitle, /今天16:30–19:30/);
row = copy(['dailyRest', 'timeWindow', 'dailyRest'], { kind: 'repeat', sinceConfirmationSeconds: 1800,
  quotas: [{ id: 'dailyRest', usedSeconds: 9600, limitSeconds: 7200 }] });
assert.equal(row.title, '强行使用已满30分，请再次确认');
assert.equal(row.subtitle.match(/今日休息配额/g).length, 1);
assert.match(row.subtitle, /已超出40分/);
assert.match(copy(['weeklyRest'], {}).subtitle, /暂时无法读取/);
assert.doesNotMatch(copy(['weeklyRest'], {}).subtitle, /0秒/);
assert.equal(copy(['weeklyRest', 'timeWindow'], {}).title, '继续使用需要确认');
row = copy(['timeWindow'], { classification: '<img>', nextWindow: { dayOffset: 0, start: '<img>', end: '19:30' } });
assert.doesNotMatch(row.subtitle, /<img>/);
console.log('forced-use-copy: 13 assertions passed');
