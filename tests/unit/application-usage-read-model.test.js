'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../../extension/stats/application-usage-read-model.js'), 'utf8');
const fixedNow = Date.parse('2026-09-26T12:00:00+08:00');
function page(offset = 0, count = 2) {
  const days = Array.from({ length: 7 }, (_, index) => ({ date: `2026-09-${21 + index}`, totalMs: index === 5 ? 2501 : 0,
    complete: true, reasonCodes: [], categoriesMs: index === 5 ? { composite: 1501, restrictedEntertainment: 2000 } : {},
    hours: Array.from({ length: 24 }, (_, hour) => ({ hour, totalMs: index === 5 && hour === 1 ? 2501 : 0,
      categoriesMs: index === 5 && hour === 1 ? { composite: 1501, restrictedEntertainment: 2000 } : {} })) }));
  return { fromDate: '2026-09-21', toDate: '2026-09-27', revision: 'a'.repeat(64), computedAtMs: fixedNow,
    lastSettledAtMs: fixedNow - 1000, complete: true, reasonCodes: [], totalMs: 2501, days,
    applications: Array.from({ length: count }, (_, index) => ({ key: (offset + index + 1).toString(16).padStart(64, '0'),
      name: `Fixture ${offset + index}`, classifications: [index ? 'restrictedEntertainment' : 'composite'],
      totalMs: index ? 2000 : 1501,
      dailyMs: Object.fromEntries(days.map(d => [d.date, d.date === '2026-09-26' ? index ? 2000 : 1501 : 0])) })),
    nextOffset: null };
}
async function load(handler) {
  global.chrome = { runtime: { sendMessage: handler } };
  return import(`data:text/javascript;base64,${Buffer.from(source + '\n// ' + Math.random()).toString('base64')}`);
}
async function main() {
  const originalNow = Date.now; Date.now = () => fixedNow;
  try {
    let calls = 0;
    const adapter = await load(async message => {
      assert.equal(message.type, 'TIMEONCHROME_APPLICATION_USAGE_READ'); calls++;
      return { ok: true, applicationUsage: page() };
    });
    const view = await adapter.getAdminApplicationUsageAnalysisView();
    assert.equal(view.totalSeconds, 2.501);
    assert.equal(view.targetRows.reduce((n, r) => n + r.todaySeconds, 0), 3.501);
    assert.equal(view.targetRows.find(r => r.label === 'Fixture 0').categoryLabel, '复合');
    assert.equal(view.chartSeries[1].categories.app_composite, 1.501);
    await adapter.getAdminApplicationUsageAnalysisView(); assert.equal(calls, 1);
    await adapter.getAdminApplicationUsageAnalysisView({ force: true }); assert.equal(calls, 2);
    assert.doesNotMatch(source, /usage_segments_v1|quota-read-model|chrome\.storage|setInterval/);

    const many = await load(async ({ query }) => {
      const result = page(query.offset, query.offset ? 1 : 100);
      if (!query.offset) result.nextOffset = 100;
      else assert.equal(query.expectedRevision, 'a'.repeat(64));
      return { ok: true, applicationUsage: result };
    });
    const paged = await many.getAdminApplicationUsageAnalysisView({ mode: 'week' });
    assert.equal(paged.targetRows.length, 101);
    assert.equal(paged.totalSeconds, 2.501); // Never adds application rows to obtain total.

    let restarted = 0;
    const changed = await load(async ({ query }) => {
      if (!query.offset) { restarted++; const p = page(0, 100); p.nextOffset = restarted === 1 ? 100 : null; return { ok: true, applicationUsage: p }; }
      return { ok: false, errorCode: 'application_usage_revision_changed' };
    });
    await changed.getAdminApplicationUsageAnalysisView(); assert.equal(restarted, 2);

    const incomplete = await load(async () => {
      const p = page(); p.complete = false; p.reasonCodes = ['APPLICATION_CLOCK_AMBIGUOUS'];
      p.days[5].complete = false; p.days[5].reasonCodes = [...p.reasonCodes];
      return { ok: true, applicationUsage: p };
    });
    const partial = await incomplete.getAdminApplicationUsageAnalysisView();
    assert.equal(partial.totalSeconds, null);
    assert.match(partial.incompleteDates, /2026-09-26/);
    assert.deepEqual(partial.chartSeries[1].categories, {});

    for (const code of ['native_host_unavailable', 'runtime_service_unavailable', 'application_usage_unsupported', 'native_response_timeout']) {
      const missing = await load(async () => ({ ok: false, errorCode: code }));
      await assert.rejects(() => missing.getAdminApplicationUsageAnalysisView(), { message: code });
      assert.doesNotMatch(missing.applicationUsageErrorMessage(code), /^应用用量暂时/);
    }
    const unexpected = await load(async () => ({ error: 'Unknown message type' }));
    await assert.rejects(() => unexpected.getAdminApplicationUsageAnalysisView(), { message: 'application_usage_unavailable' });
    assert.doesNotMatch(unexpected.applicationUsageErrorMessage('application_usage_unavailable'), /未启用/);
    let offline = false;
    const reconnect = await load(async () => offline ? { ok: false, errorCode: 'runtime_service_unavailable' } : { ok: true, applicationUsage: page() });
    await reconnect.getAdminApplicationUsageAnalysisView(); offline = true;
    const cached = await reconnect.getAdminApplicationUsageAnalysisView({ force: true });
    assert.equal(cached.totalSeconds, 2.501); assert.match(cached.meta.syncLabel, /缓存／连接中断/);
    offline = false;
    assert.equal((await reconnect.getAdminApplicationUsageAnalysisView({ force: true })).warning, null);

    const invalid = page(); invalid.totalMs++;
    assert.throws(() => adapter.validateApplicationUsagePage(invalid, invalid.fromDate, invalid.toDate), /native_invalid_response/);
    if (process.argv[2]) {
      const nativeSnapshot = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
      adapter.validateApplicationUsagePage(nativeSnapshot, nativeSnapshot.fromDate, nativeSnapshot.toDate);
      assert.equal(nativeSnapshot.totalMs, 2501);
      assert.equal(nativeSnapshot.applications.reduce((n, row) => n + row.totalMs, 0), 3501);
      console.log('Native SQLite → framing → extension snapshot validation: PASS');
    }
    const html = fs.readFileSync(path.join(__dirname, '../../extension/admin/admin.html'), 'utf8');
    const admin = fs.readFileSync(path.join(__dirname, '../../extension/admin/admin.js'), 'utf8');
    assert.match(html, /data-usage-ledger="web"[\s\S]*data-usage-ledger="media"[\s\S]*data-usage-ledger="application"/);
    assert.match(admin, /sequence !== statsReadSequence/);
    assert.match(admin, /document.visibilityState === 'visible'/);
    const shiftSource = admin.slice(admin.indexOf('function shiftUsageAnalysisDate('), admin.indexOf('function usageCategoryLabel('));
    const shiftDate = new Function('usageAnalysisState', `${shiftSource}; return shiftUsageAnalysisDate;`)({ ledger: 'application' });
    assert.equal(shiftDate(null, -7), '2026-09-19');
    assert.equal(shiftDate('2026-01-01', -1), '2025-12-31');
    assert.equal(shiftDate('2026-09-30', 1), '2026-10-01');
    console.log('Application usage adapter: PASS (authority, milliseconds, paging, revisions, cache, failures, incomplete, UI routing)');
  } finally { Date.now = originalNow; }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
