'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const root = path.resolve(__dirname, '../..');
const sources = ['pages/index.html', 'extension/admin/admin.js'];
const escape = value => String(value).replaceAll('<', '&lt;').replaceAll('>', '&gt;');
const format = seconds => `${seconds}秒`;
let scenarios = 0;
for (const file of sources) {
  const source = fs.readFileSync(path.join(root, file), 'utf8');
  const start = source.indexOf('function unknownUsageIdentifier(');
  const end = source.indexOf(file.startsWith('pages') ? 'function renderCloudUsageView(' : 'function renderUsageAnalysisView(', start);
  const context = vm.createContext({});
  vm.runInContext(source.slice(start, end), context);
  const testRow = (classification, buckets) => ({ key: 'website', label: 'example.com', targetClassificationAtTime: classification,
    category: 'composite', categoryLabel: '待归类', rangeSeconds: 50, todaySeconds: 50, weekSeconds: 80,
    displayUsageBreakdown: { range: { [classification]: buckets }, today: { [classification]: buckets }, week: { [classification]: { composite: 30, rest: 50 } } } });
  for (const [classification, text] of [['study', '学习'], ['composite', '复合'], ['pending_composite', '待归类'], ['restricted', '受限娱乐'], ['blocked', '黑名单']]) {
    const row = testRow(classification, { composite: 50 });
    assert.equal(context.usageExplanationSummary(row, false).text, text);
    scenarios++;
  }
  for (const [classification, text] of [['composite', '复合 · 借用休息配额'], ['pending_composite', '待归类 · 借用休息配额']]) {
    const row = testRow(classification, { composite: 30, rest: 20 });
    const summary = context.usageExplanationSummary(row, false);
    assert.equal(summary.text, text);
    assert.equal(summary.borrowedSeconds, 20);
    const detail = context.usageBucketDetailsHtml(row, false, format, escape);
    assert(detail.includes('复合用量 30秒、休息用量 20秒'));
    assert(detail.includes('休息用量 50秒'));
    assert(detail.includes('当前范围') && detail.includes('今日') && detail.includes('本周'));
    scenarios++;
  }
  const mixed = testRow('composite', {});
  mixed.displayUsageBreakdown.range = { pending_composite: { composite: 10, rest: 5 }, composite: { composite: 20, rest: 15 } };
  const before = JSON.stringify(mixed);
  assert.equal(context.usageExplanationSummary(mixed, false).text, '复合/待归类 · 部分借用休息配额');
  assert.equal(context.usageExplanationSummary(mixed, false).borrowedSeconds, 20);
  const detail = context.usageBucketDetailsHtml(mixed, false, format, escape);
  assert(detail.includes('待归类：复合用量 10秒、休息用量 5秒'));
  assert(detail.includes('复合：复合用量 20秒、休息用量 15秒'));
  assert.equal(JSON.stringify(mixed), before);
  scenarios++;
  const missing = { key: 'legacy', mode: 'rest', targetClassificationAtTime: null, borrowedRestSeconds: 1000, rangeSeconds: 50 };
  assert.equal(context.usageExplanationSummary(missing, false).text, '历史性质未知');
  assert.equal(context.usageExplanationSummary(missing, false).borrowedSeconds, 0);
  assert(context.usageBucketDetailsHtml(missing, false, format, escape).includes('历史性质及实际桶信息未知'));
  const missingBucket = testRow('composite', { unknown: 50 });
  assert.equal(context.usageExplanationSummary(missingBucket, false).borrowedSeconds, 0);
  assert(context.usageBucketDetailsHtml(missingBucket, false, format, escape).includes('未知桶 50秒'));
  scenarios++;
  const unknown = { ...mixed, key: 'fallback:domain:unknown-page.chrome-local' };
  assert.equal(context.usageExplanationSummary(unknown, false).text, '归属待核查');
  assert.equal(context.usageExplanationSummary(unknown, false).borrowedSeconds, 0);
  scenarios++;
  const input = { kind: 'web', totalSeconds: 50, targetRows: [mixed], categoryRows: [{ key: 'composite', status: '正常', seconds: 50 }] };
  const original = JSON.stringify(input);
  const view = context.usagePresentationView(input);
  assert.equal(view.categoryRows[0].status, '—');
  assert.equal(view.targetRows[0].displayBorrowedSeconds, 20);
  assert.equal(view.targetRows[0].rangeSeconds, 50);
  assert.equal(JSON.stringify(input), original);
  assert.equal(JSON.stringify(context.usagePresentationView(view)), JSON.stringify(view));
  assert.equal(context.usageExplanationSummary(mixed, true).text, '独立媒体统计，不计网页配额');
  assert.equal(context.usageExplanationSummary(mixed, true).borrowedSeconds, 0);
  assert.equal(context.usageBucketDetailsHtml(mixed, true, format, escape), '');
  assert.equal(context.usagePresentationView({ ...input, kind: 'media' }).categoryRows[0].status, '独立媒体统计，不计网页配额');
  scenarios++;
}

// Inspect actual read-model presentation metadata without invoking any storage mutation.
let admin = fs.readFileSync(path.join(root, 'extension/stats/admin-read-model.js'), 'utf8').replace(/export\s+(?=(?:async\s+)?function|const)/g, '');
const local = new Function(admin + '\nreturn { aggregateTargetStatsByDate, targetRowsForAnalysis, mediaRowsForAnalysis };')();
const stat = { targetClassificationAtTime: 'pending_composite', activeSeconds: 50, pipSeconds: 100,
  activeByQuotaBucket: { composite: 30, rest: 20 }, pipByQuotaBucket: { rest: 100 } };
const data = { '2026-09-14': { targets: { site: stat } }, '2026-09-15': { targets: { site: { ...stat, targetClassificationAtTime: 'composite' } } } };
const saved = JSON.stringify(data);
const account = local.aggregateTargetStatsByDate(data, Object.keys(data), {}, {});
assert.deepEqual(account.get('site').displayUsageBreakdown, { pending_composite: { composite: 30, rest: 20 }, composite: { composite: 30, rest: 20 } });
assert.equal(account.get('site').seconds, 100);
assert.equal(JSON.stringify(data), saved);
const outsideRange = local.targetRowsForAnalysis(data, '2026-09-16', Object.keys(data), ['2026-09-16'], {}, {});
assert.equal(outsideRange[0].rangeSeconds, 0);
assert.equal(outsideRange[0].todaySeconds, 0);
assert.equal(outsideRange[0].weekSeconds, 100);
assert.deepEqual(outsideRange[0].displayUsageBreakdown.range, {});
const populatedRange = local.targetRowsForAnalysis(data, '2026-09-15', Object.keys(data), ['2026-09-15'], {}, {});
assert.equal(populatedRange[0].rangeSeconds, 50);
assert.equal(populatedRange[0].todaySeconds, 50);
assert.equal(populatedRange[0].weekSeconds, 100);
const wholeWeek = local.targetRowsForAnalysis(data, '2026-09-15', Object.keys(data), Object.keys(data), {}, {});
assert.equal(wholeWeek[0].rangeSeconds, 100);
assert.equal(JSON.stringify(data), saved);
const mediaData = { '2026-09-14': { domains: { 'video.example': { totalSeconds: 30, foregroundVideoSeconds: 30 } } },
  '2026-09-15': { domains: { 'video.example': { totalSeconds: 20, foregroundVideoSeconds: 20 } } } };
const mediaBefore = JSON.stringify(mediaData);
const mediaEmpty = local.mediaRowsForAnalysis(mediaData, '2026-09-16', Object.keys(mediaData), ['2026-09-16']);
assert.equal(mediaEmpty[0].rangeSeconds, 0);
assert.equal(mediaEmpty[0].todaySeconds, 0);
assert.equal(mediaEmpty[0].weekSeconds, 50);
const mediaDay = local.mediaRowsForAnalysis(mediaData, '2026-09-15', Object.keys(mediaData), ['2026-09-15']);
assert.equal(mediaDay[0].rangeSeconds, 20);
assert.equal(mediaDay[0].weekSeconds, 50);
const mediaWeek = local.mediaRowsForAnalysis(mediaData, '2026-09-15', Object.keys(mediaData), Object.keys(mediaData));
assert.equal(mediaWeek[0].rangeSeconds, 50);
assert.equal(JSON.stringify(mediaData), mediaBefore);
const legacy = local.aggregateTargetStatsByDate({ '2026-09-15': { domains: { 'example.com': { activeSeconds: 50, activeByMode: { rest: 50 } } } } }, ['2026-09-15'], { compositeList: ['example.com'] }, {});
assert.deepEqual(legacy.get('fallback:domain:example.com').displayUsageBreakdown, { unknown: { unknown: 50 } });

const pages = fs.readFileSync(path.join(root, sources[0]), 'utf8');
const cloudContext = vm.createContext({});
vm.runInContext(`function emptyCloudCategories() { return { study: 0, composite: 0, rest: 0, other: 0 }; }
function usageCategoryLabel(key) { return key; }
` + pages.slice(pages.indexOf('function cloudClassificationCategory('), pages.indexOf('function isCloudWebUsageRow(')) +
pages.slice(pages.indexOf('function normalizeCloudTargetRows('), pages.indexOf('function normalizeCloudMediaRows(')) +
pages.slice(pages.indexOf('function aggregateCloudRows('), pages.indexOf('function aggregateCloudMediaRows(')), cloudContext);
const raw = [
  { date: '2026-09-14', target_key: 'site', target_classification_at_time: 'pending_composite', quota_bucket: 'composite', duration: 30 },
  { date: '2026-09-14', target_key: 'site', target_classification_at_time: 'pending_composite', quota_bucket: 'rest', duration: 20 },
  { date: '2026-09-15', target_key: 'site', target_classification_at_time: 'composite', quota_bucket: 'composite', duration: 30 },
  { date: '2026-09-15', target_key: 'site', target_classification_at_time: 'composite', quota_bucket: 'rest', duration: 20 },
];
const normalized = cloudContext.normalizeCloudTargetRows(raw);
const cloud = cloudContext.aggregateCloudRows(normalized).get('site');
assert.deepEqual(JSON.parse(JSON.stringify(cloud.displayUsageBreakdown)), account.get('site').displayUsageBreakdown);
assert.equal(cloud.seconds, account.get('site').seconds);
const noBucket = cloudContext.normalizeCloudTargetRows([{ date: '2026-09-15', target_key: 'legacy', target_classification_at_time: 'composite', mode: 'rest', duration: 50 }]);
const unknownBuckets = cloudContext.aggregateCloudRows(noBucket).get('legacy');
assert.equal(unknownBuckets.displayUsageBreakdown.composite.unknown, 50);
assert.equal(unknownBuckets.displayUsageBreakdown.composite.rest, undefined);
assert.equal(noBucket[0].quotaBucket, 'rest'); // Legacy calculation unchanged; display does not infer a bucket.
const onlyWeek = cloudContext.buildCloudTargetRows([], normalized, []);
assert.equal(onlyWeek[0].rangeSeconds, 0);
assert.deepEqual(JSON.parse(JSON.stringify(onlyWeek[0].displayUsageBreakdown.range)), {});
console.log(`Usage explanation: ${scenarios} two-surface scenarios plus local/cloud read-model invariants passed`);
