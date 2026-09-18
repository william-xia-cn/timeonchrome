'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const source = fs.readFileSync(path.resolve(__dirname, '../../pages/index.html'), 'utf8');
const code = source.slice(source.indexOf('function renderRecordHistoryDetails('), source.indexOf('function renderReviewUsedUnclassifiedSites('));
const escape = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const period = { from: '2026-09-14', to: '2026-09-15' };
const context = vm.createContext({
  currentProfileId: 'test-profile', window: {},
  normalizeSiteAccessInput: value => String(value).toLowerCase(),
  shanghaiWeekDateRange: () => period,
  escHtml: escape, htmlEscape: escape, fmtSecs: seconds => `${seconds}秒`,
  explicitUnclassifiedRequestEntries: requests => requests.map((request, idx) => ({ request, idx })),
  isProcessedSiteRequest: request => request.status !== 'pending',
  formatSiteRequestTimestamp: String, sitePolicyLabel: String,
  siteRequestRecordLabel: () => '未归类网站访问记录',
  siteRequestTargetTypeLabel: () => '域名/子域名',
  siteRequestObservationText: request => `首次 ${request.firstObservedAt} · 最近 ${request.lastObservedAt} · 顶层导航 ${request.observationCount} 次`,
  siteRequestStatusLabel: request => request,
  classificationPolicyDefs: () => [{ key: 'study', label: '学习' }],
  unknownUsageIdentifier: () => null,
});
vm.runInContext(code, context);
const input = [
  { date: '2026-09-15', label: 'www.a.example', channel: 'active', duration: 60 },
  { date: '2026-09-15', label: 'a.example', channel: 'active', duration: 60, deviceId: 'second' },
  { date: '2026-09-14', label: 'a.example', channel: 'active', duration: 180 },
  { date: '2026-09-13', label: 'a.example', channel: 'active', duration: 600 },
  { date: '2026-08-16', label: 'a.example', channel: 'active', duration: 10000 },
  { date: '2026-09-16', label: 'a.example', channel: 'active', duration: 10000 },
  { date: '2026-09-15', label: 'a.example', channel: 'backgroundMedia', duration: 10000 },
  { date: '2026-09-15', label: 'a.example', channel: 'pip', duration: 10000 },
  { date: '2026-09-15', label: 'b.example', channel: 'active', duration: 120 },
  { date: '2026-09-14', label: 'b.example', channel: 'active', duration: 600 },
  { date: '2026-09-15', label: 'c.example', channel: 'active', duration: 180 },
  { date: '2026-09-15', label: 'd.example', channel: 'active', duration: 120 },
  { date: '2026-09-14', label: 'd.example', channel: 'active', duration: 180 },
  { date: '2026-09-13', label: 'd.example', channel: 'active', duration: 1200 },
];
const before = JSON.stringify(input);
context.input = input;
vm.runInContext('unclassifiedUsageDisplay = { ...buildUnclassifiedUsageDisplay(input, shanghaiWeekDateRange()), profileId: currentProfileId };', context);
const row = { type: 'used', key: 'a.example', entry: { title: 'a.example' } };
assert.equal(JSON.stringify(context.unclassifiedReviewUsage(row)), JSON.stringify({ todaySeconds: 120, weekSeconds: 300, totalSeconds: 900 }));
assert.equal(before, JSON.stringify(input));
const entries = ['a', 'b', 'c', 'd'].map(domain => ({ value: `${domain}.example`, title: `${domain}.example`, site: {} }));
const entriesBefore = JSON.stringify(entries);
const rows = context.buildUnclassifiedReviewRows([], entries);
assert.equal(rows.map(row => row.key).join(','), 'c.example,b.example,d.example,a.example');
assert.equal(entriesBefore, JSON.stringify(entries));
assert.equal(context.unclassifiedReviewUsage({ type: 'used', key: 'no-usage.example' }).todaySeconds, 0);
assert.equal(context.unclassifiedReviewUsage({ type: 'request', key: 'a.example', request: { requestedTargetType: 'url' } }).todaySeconds, null);
context.currentProfileId = 'another-profile';
assert.equal(context.unclassifiedReviewUsage(row).todaySeconds, null);
context.currentProfileId = 'test-profile';
period.to = '2026-09-16';
assert.equal(context.unclassifiedReviewUsage(row).todaySeconds, null);
period.to = '2026-09-15';
const request = { displayValue: 'a.example', requestedNormalizedValue: 'a.example', requestedTargetType: 'host', status: 'pending', deviceId: '<device>', firstObservedAt: 1, lastObservedAt: 2, observationCount: 3 };
const merged = context.buildUnclassifiedReviewRows([request], entries);
assert.equal(merged.length, 4);
assert.equal(merged.find(row => row.key === 'a.example').requestIndex, 0);
assert.equal(merged.find(row => row.key === 'a.example').usedIndex, 0);
const html = context.renderUnclassifiedUsageRecords([request], entries);
assert(html.includes('默认先按今日、再按本周、最后按近30天累计使用时长降序排列'));
assert(html.includes('<span>累计时长</span>'));
assert(html.includes('累计范围：近30天（含今日）'));
assert(html.includes('<details class="unclassified-visit-details"><summary>访问详情</summary>'));
assert(!html.includes('unclassified-visit-details" open'));
assert(html.includes('<strong>归类记录</strong>'));
assert(html.includes('&lt;device&gt;'));
assert(html.includes("classifyUnclassifiedReviewRow(3, 'study')"));
assert(context.unclassifiedReviewStatsText({ visitCount: 3 }).includes('统计分段 3 条'));
vm.runInContext('unclassifiedUsageDisplay = null', context);
assert.equal(context.unclassifiedReviewUsage(row).totalSeconds, null);
assert.equal((context.unclassifiedReviewMetricsHtml(row).match(/未知/g) || []).length, 3);
console.log('Unclassified usage display: aggregation, sorting, missing data, identity, folding and action mapping passed');
