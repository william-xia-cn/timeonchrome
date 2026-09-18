'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const root = path.resolve(__dirname, '../..');
const files = ['pages/index.html', 'extension/admin/admin.js'];
let passed = 0;
for (const file of files) {
  const source = fs.readFileSync(path.join(root, file), 'utf8');
  const code = source.slice(source.indexOf('function unknownUsageIdentifier('), source.indexOf(file.startsWith('pages') ? 'function renderCloudUsageView(' : 'function renderUsageAnalysisView('));
  const context = vm.createContext({});
  vm.runInContext(code, context);
  const unknown = { key: 'fallback:domain:unknown-page.chrome-local', label: 'unknown-page.chrome-local',
    category: 'composite', categoryLabel: '待归类', targetClassificationAtTime: 'composite',
    quotaBucket: 'rest', status: '借用休息配额', todaySeconds: 1450, weekSeconds: 1726, rangeSeconds: 1450,
    displayQuotaBuckets: { today: { rest: 1443, study: 7 }, week: { rest: 1719, study: 7 }, range: { rest: 1443, study: 7 } },
    firstSeenAt: '2026-09-15T00:00:00Z', lastSeenAt: '2026-09-15T01:00:00Z' };
  const ordinary = { key: 'reddit', label: 'reddit.com', status: '借用休息配额' };
  const input = { kind: 'web', totalSeconds: 5000, categoryTotals: { composite: 1450 }, targetRows: [unknown, ordinary] };
  const before = JSON.stringify(input);
  const view = context.usagePresentationView(input);
  assert.equal(view.targetRows[0].label, '未识别页面');
  assert.equal(view.targetRows[0].categoryLabel, '未识别');
  assert.equal(view.targetRows[0].status, '归属待核查');
  assert.equal(view.targetRows[0].targetClassificationAtTime, 'composite');
  assert.equal(view.targetRows[0].quotaBucket, 'rest');
  assert.equal(view.totalSeconds, input.totalSeconds);
  assert.strictEqual(view.categoryTotals, input.categoryTotals);
  assert.equal(view.targetRows[1].status, '历史性质未知');
  assert.equal(JSON.stringify(input), before);
  assert.equal(context.usagePresentationView(null), null);
  assert.equal(context.unknownUsageIdentifier({ value: '__unknown__' }), '__unknown__');
  assert.equal(context.unknownUsageIdentifier({ value: 'chrome-local' }), null);
  assert.equal(context.unknownUsageIdentifier({ value: 'file-page.chrome-local' }), null);
  const escape = value => String(value).replaceAll('<', '&lt;').replaceAll('>', '&gt;');
  const detail = context.unknownUsageDetailHtml(unknown, false, seconds => `${seconds}秒`, escape);
  assert(detail.includes('休息用量 1443秒、学习用量 7秒'));
  assert(detail.includes('08:00:00') && detail.includes('09:00:00'));
  assert(!detail.includes('借用休息配额'));
  assert(context.unknownUsageDetailHtml({ ...unknown, displayQuotaBuckets: null }, false, String, escape).includes('桶信息未知'));
  const media = context.usagePresentationView({ kind: 'media', targetRows: [{ ...unknown, categoryLabel: '前台视频' }] });
  assert.equal(media.targetRows[0].categoryLabel, '前台视频');
  assert(context.unknownUsageDetailHtml(unknown, true, String, escape).includes('媒体时长不计入网页配额'));
  assert(!context.unknownUsageDetailHtml(unknown, true, String, escape).includes('休息用量'));
  assert.equal(context.unknownUsageDetailHtml(ordinary, false, String, escape), '');
  assert(context.unknownUsageDetailHtml({ ...unknown, displayQuotaBuckets: { today: { '<script>': 7 } } }, false, String, escape).includes('&lt;script&gt;'));
  passed += 22;
}
const pages = fs.readFileSync(path.join(root, files[0]), 'utf8');
assert(pages.includes("unknown ? '' : renderSystemSiteCategoryEditor(entry, idx)"));
assert(pages.includes("unknown ? '<span class=\"rules-site-badge\">未识别页面，不适用网站归类</span>'"));
console.log(`Unknown page display: ${passed + 2} assertions passed`);
