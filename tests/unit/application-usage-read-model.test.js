'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const bucketSource = fs.readFileSync(path.join(__dirname, '../../extension/core/web-usage-buckets.js'), 'utf8');
assert.equal(bucketSource.replace(/\r\n/g, '\n').trim(), fs.readFileSync(path.join(__dirname, '../../app-runtime-management/contracts/web-usage-buckets.cjs'), 'utf8').replace(/\r\n/g, '\n').trim());
const source = fs.readFileSync(path.join(__dirname, '../../extension/stats/application-usage-read-model.js'), 'utf8')
  .replace("import '../core/web-usage-buckets.js';", bucketSource);
const fixedNow = Date.parse('2026-09-26T12:00:00+08:00');
function page(offset = 0, count = 2) {
  const days = Array.from({ length: 7 }, (_, index) => ({ date: `2026-09-${21 + index}`, status: 'available', generatedAtMs: fixedNow, settledThroughMs: fixedNow - 1000, totalSeconds: index === 5 ? 2 : 0,
    complete: true, reasonCodes: [], categoriesSeconds: index === 5 ? { composite: 1, restrictedEntertainment: 2 } : {},
    hours: Array.from({ length: 24 }, (_, hour) => ({ hour, totalSeconds: index === 5 && hour === 1 ? 2 : 0,
      categoriesSeconds: index === 5 && hour === 1 ? { composite: 1, restrictedEntertainment: 2 } : {} })) }));
  return { schemaVersion: 2, durationUnit: 'seconds', knownTotalSeconds: 2, knownCategoriesSeconds: { composite: 1, restrictedEntertainment: 2 }, fromDate: '2026-09-21', toDate: '2026-09-27', revision: 'a'.repeat(64), computedAtMs: fixedNow,
    lastSettledAtMs: fixedNow - 1000, complete: true, reasonCodes: [], totalSeconds: 2, days,
    applications: Array.from({ length: count }, (_, index) => ({ key: (offset + index + 1).toString(16).padStart(64, '0'),
      name: `Fixture ${offset + index}`, classifications: [index ? 'restrictedEntertainment' : 'composite'],
      knownTotalSeconds: index ? 2 : 1, totalSeconds: index ? 2 : 1,
      dailySeconds: Object.fromEntries(days.map(d => [d.date, d.date === '2026-09-26' ? index ? 2 : 1 : 0])) })),
    nextOffset: null };
}
async function load(handler, context = { readUnit: 'seconds', contextId: 'current-context', available: true }) {
  global.chrome = { runtime: { sendMessage: async message => {
    if (message.type === 'TIMEONCHROME_APPLICATION_USAGE_READ' && message.contextOnly) return { ok: true, ...context };
    const response = await handler(message);
    if (response?.ok && !response.readUnit) response.readUnit = context.readUnit, response.contextId = context.contextId;
    if (response?.ok && context.readUnit === 'seconds' && message.query.fromDate === message.query.toDate) {
      const p = structuredClone(response.applicationUsageSeconds);
      p.fromDate = message.query.fromDate; p.toDate = message.query.toDate;
      p.days = p.days.filter(day => day.date === p.fromDate);
      p.knownTotalSeconds = p.days.reduce((sum, day) => sum + (day.totalSeconds || 0), 0);
      p.complete = p.days.every(day => day.complete); p.totalSeconds = p.complete ? p.knownTotalSeconds : null;
      p.knownCategoriesSeconds = p.days.reduce((result, day) => { for (const [key, amount] of Object.entries(day.categoriesSeconds)) result[key] = (result[key] || 0) + amount; return result; }, {});
      p.applications = p.applications.map(row => ({ ...row,
        totalSeconds: p.complete ? row.dailySeconds[p.fromDate] || 0 : null, knownTotalSeconds: row.dailySeconds[p.fromDate] || 0, dailySeconds: { [p.fromDate]: row.dailySeconds[p.fromDate] || 0 } }));
      return { ...response, applicationUsageSeconds: p };
    }
    return response;
  } } };
  return import(`data:text/javascript;base64,${Buffer.from(source + '\n// ' + Math.random()).toString('base64')}`);
}
async function main() {
  const originalNow = Date.now; Date.now = () => fixedNow;
  try {
    let calls = 0;
    const adapter = await load(async message => {
      assert.equal(message.type, 'TIMEONCHROME_APPLICATION_USAGE_READ'); calls++;
      return { ok: true, applicationUsageSeconds: page() };
    });
    const view = await adapter.getAdminApplicationUsageAnalysisView();
    assert.equal(view.totalSeconds, 2);
    assert.equal(view.targetRows.reduce((n, r) => n + r.todaySeconds, 0), 3);
    assert.equal(view.targetRows.find(r => r.label === 'Fixture 0').categoryLabel, '复合');
    assert.equal(view.chartSeries[1].categories.usage_total, 2);
    assert.equal(view.bucketTotals, null);
    assert.deepEqual(view.bucketKeys, ['study', 'composite', 'rest', 'other']);
    const extendedPage = page();
    for (const day of extendedPage.days) day.applicationUsage = { nonSpecialTotal: day.totalSeconds,
      nonSpecialCategories: day.totalSeconds ? { unclassified: 1, other: 1 } : {}, specialTotal: 0, complete: true, reasonCodes: [] };
    const extended = await load(async ({ query }) => {
      assert.equal(query.includeApplicationUsage, true);
      return { ok: true, applicationUsageSeconds: extendedPage };
    }, { readUnit: 'seconds', contextId: 'new-capability', available: true, applicationUsageSupported: true });
    const bucketView = await extended.getAdminApplicationUsageAnalysisView({ mode: 'week' });
    assert.deepEqual(bucketView.bucketTotals, { study: 0, composite: 1, rest: 0, other: 1 });
    assert.equal(bucketView.bucketsComplete, true);
    assert.equal(bucketView.totalSeconds, 2);
    assert.deepEqual(bucketView.categoryTotals, view.categoryTotals);
    assert.deepEqual(bucketView.chartSeries[5].categories, bucketView.bucketTotals);
    const extendedQuery = { fromDate: extendedPage.fromDate, toDate: extendedPage.toDate, offset: 0, includeApplicationUsage: true };
    assert.throws(() => extended.validateApplicationUsageSecondsPage(extendedPage, { ...extendedQuery, includeApplicationUsage: false }));
    for (const mutate of [u => u.nonSpecialCategories.other = -1, u => u.nonSpecialCategories.fake = 1,
      u => u.specialTotal = 86401, u => u.complete = false, u => u.extra = true]) {
      const bad = structuredClone(extendedPage); mutate(bad.days[5].applicationUsage);
      assert.throws(() => extended.validateApplicationUsageSecondsPage(bad, extendedQuery));
    }
    extendedPage.days[5].applicationUsage = { nonSpecialTotal: 1, nonSpecialCategories: { other: 1 }, specialTotal: 1, complete: true, reasonCodes: [] };
    const specialView = await extended.getAdminApplicationUsageAnalysisView({ mode: 'week', force: true });
    assert.equal(specialView.totalSeconds, 2);
    assert.deepEqual(specialView.bucketTotals, { study: 0, composite: 0, rest: 0, other: 1 });
    delete extendedPage.days[5].applicationUsage;
    const missingView = await extended.getAdminApplicationUsageAnalysisView({ mode: 'week', force: true });
    assert.equal(missingView.bucketsComplete, false);
    assert.equal(missingView.totalSeconds, 2);
    assert.match(missingView.hourlyNotice, /缺失不代表零/);
    // Return to the original context for its cache/retry assertions below.
    await load(async message => { calls++; return { ok: true, applicationUsageSeconds: page() }; });
    assert.equal(view.readUnit, 'seconds');
    await adapter.getAdminApplicationUsageAnalysisView(); assert.equal(calls, 2);
    await adapter.getAdminApplicationUsageAnalysisView({ force: true }); assert.equal(calls, 4);
    assert.doesNotMatch(source, /usage_segments_v1|quota-read-model|chrome\.storage|setInterval/);

    const legacy = { ...page(), durationUnit: 'milliseconds' };
    assert.throws(() => adapter.validateApplicationUsageSecondsPage(legacy, { fromDate: legacy.fromDate, toDate: legacy.toDate, offset: 0 }), /native_invalid_response/);
    const oldContext = await load(async () => { throw Error('must not call old reader'); },
      { readUnit: 'milliseconds', contextId: 'legacy-context', available: true });
    await assert.rejects(() => oldContext.getAdminApplicationUsageAnalysisView(), /native_invalid_response/);

    const many = await load(async ({ query }) => {
      const result = page(query.offset, query.offset ? 1 : 100);
      if (!query.offset) result.nextOffset = 100;
      else assert.equal(query.expectedRevision, 'a'.repeat(64));
      return { ok: true, applicationUsageSeconds: result };
    });
    const paged = await many.getAdminApplicationUsageAnalysisView({ mode: 'week' });
    assert.equal(paged.targetRows.length, 101);
    assert.equal(paged.totalSeconds, 2); // Never adds application rows to obtain total.

    let restarted = 0;
    const changed = await load(async ({ query }) => {
      if (!query.offset) { restarted++; const p = page(0, 100); p.nextOffset = restarted === 1 ? 100 : null; return { ok: true, applicationUsageSeconds: p }; }
      return { ok: false, errorCode: 'application_usage_revision_changed' };
    });
    await changed.getAdminApplicationUsageAnalysisView(); assert.equal(restarted, 3);

    const unstablePageTime = await load(async ({ query }) => {
      const result = page(query.offset, query.offset ? 1 : 100);
      if (!query.offset) result.nextOffset = 100;
      else {
        result.computedAtMs++;
        for (const day of result.days) day.generatedAtMs++;
      }
      return { ok: true, applicationUsageSeconds: result };
    });
    await assert.rejects(() => unstablePageTime.getAdminApplicationUsageAnalysisView({ mode: 'week' }),
      /application_usage_seconds_revision_changed/, 'same-revision pages must keep one computed time');

    const incomplete = await load(async () => {
      const p = page(); p.complete = false; p.reasonCodes = ['APPLICATION_CLOCK_AMBIGUOUS'];
      p.totalSeconds = null; p.applications.forEach(row => row.totalSeconds = null);
      p.days[5].status = 'incomplete'; p.days[5].complete = false; p.days[5].reasonCodes = [...p.reasonCodes];
      return { ok: true, applicationUsageSeconds: p };
    });
    const partial = await incomplete.getAdminApplicationUsageAnalysisView();
    assert.equal(partial.totalSeconds, null);
    assert.match(partial.incompleteDates, /2026-09-26/);
    assert.equal(partial.knownTotalSeconds, 2);
    assert.equal(partial.chartSeries[1].categories.usage_total, 2);

    for (const code of ['native_host_unavailable', 'runtime_service_unavailable', 'application_usage_unsupported', 'native_response_timeout']) {
      const missing = await load(async () => ({ ok: false, errorCode: code }));
      await assert.rejects(() => missing.getAdminApplicationUsageAnalysisView(), { message: code });
      assert.doesNotMatch(missing.applicationUsageErrorMessage(code), /^应用用量暂时/);
    }
    const unexpected = await load(async () => ({ error: 'Unknown message type' }));
    await assert.rejects(() => unexpected.getAdminApplicationUsageAnalysisView(), { message: 'application_usage_unavailable' });
    assert.doesNotMatch(unexpected.applicationUsageErrorMessage('application_usage_unavailable'), /未启用/);
    let offline = false;
    const reconnect = await load(async () => offline ? { ok: false, errorCode: 'runtime_service_unavailable' } : { ok: true, applicationUsageSeconds: page() });
    await reconnect.getAdminApplicationUsageAnalysisView(); offline = true;
    const cached = await reconnect.getAdminApplicationUsageAnalysisView({ force: true });
    assert.equal(cached.totalSeconds, 2); assert.match(cached.meta.syncLabel, /缓存／连接中断/);
    offline = false;
    assert.equal((await reconnect.getAdminApplicationUsageAnalysisView({ force: true })).warning, null);

    const mutableContext = { readUnit: 'seconds', contextId: 'child-one/connection-one', available: true };
    let contextOffline = false;
    const contextScoped = await load(async () => contextOffline ? { ok: false, errorCode: 'application_usage_unavailable' }
      : { ok: true, applicationUsageSeconds: page() }, mutableContext);
    await contextScoped.getAdminApplicationUsageAnalysisView();
    mutableContext.contextId = 'child-two/connection-two';
    contextOffline = true;
    await assert.rejects(() => contextScoped.getAdminApplicationUsageAnalysisView({ force: true }), { message: 'application_usage_unavailable' });

    const invalid = page(); invalid.totalSeconds++;
    assert.throws(() => adapter.validateApplicationUsageSecondsPage(invalid, { fromDate: invalid.fromDate, toDate: invalid.toDate, offset: 0 }), /native_invalid_response/);
    const weekQuery = { fromDate: '2026-09-21', toDate: '2026-09-27', offset: 0 };
    for (const nullTotal of [false, true]) {
      const mislabeled = page();
      mislabeled.complete = false; mislabeled.totalSeconds = null;
      mislabeled.days[5].complete = false;
      if (nullTotal) mislabeled.days[5].totalSeconds = null;
      for (const row of mislabeled.applications) row.totalSeconds = null;
      assert.throws(() => adapter.validateApplicationUsageSecondsPage(mislabeled, weekQuery), /native_invalid_response/,
        'an incomplete day cannot be labeled available, with either a known or null day total');
    }
    const missingDateWeek = page();
    missingDateWeek.complete = false; missingDateWeek.totalSeconds = null;
    missingDateWeek.days[6] = { date: '2026-09-27', status: 'unknown', complete: false,
      generatedAtMs: null, settledThroughMs: null, totalSeconds: null, categoriesSeconds: {}, hours: [],
      reasonCodes: ['CURRENT_SOURCE_MISSING'] };
    for (const row of missingDateWeek.applications) {
      row.totalSeconds = null; row.dailySeconds['2026-09-27'] = null;
    }
    adapter.validateApplicationUsageSecondsPage(missingDateWeek, weekQuery);
    const availableMissingDate = structuredClone(missingDateWeek);
    availableMissingDate.days[6].status = 'available';
    availableMissingDate.days[6].generatedAtMs = fixedNow;
    availableMissingDate.days[6].hours = Array.from({ length: 24 }, (_, hour) => ({ hour, totalSeconds: 0, categoriesSeconds: {} }));
    assert.throws(() => adapter.validateApplicationUsageSecondsPage(availableMissingDate, weekQuery), /native_invalid_response/,
      'missing days must not be projected as available days with empty hourly values');
    const missingDateReader = await load(async ({ query }) => ({ ok: true,
      applicationUsageSeconds: query.fromDate === query.toDate ? page() : structuredClone(missingDateWeek) }));
    const knownDayUnknownWeek = await missingDateReader.getAdminApplicationUsageAnalysisView();
    assert.equal(knownDayUnknownWeek.totalSeconds, 2);
    assert.equal(knownDayUnknownWeek.warning, null, 'a valid unknown date must not fail the whole supplemental week');
    assert.equal(knownDayUnknownWeek.targetRows[0].weekSeconds, null);
    assert.equal(knownDayUnknownWeek.weekSummarySeries.at(-1).totalSeconds, null);
    const weekPending = await load(async ({ query }) => query.fromDate === query.toDate
      ? { ok: true, applicationUsageSeconds: page() }
      : { ok: false, errorCode: 'application_usage_pending' });
    const independentDay = await weekPending.getAdminApplicationUsageAnalysisView();
    assert.equal(independentDay.totalSeconds, 2);
    assert.equal(independentDay.targetRows[0].weekSeconds, null);
    assert.equal(independentDay.targetRows.reduce((n, row) => n + row.todaySeconds, 0), 3);
    assert.ok(independentDay.weekSummarySeries.every(row => row.totalSeconds === null));
    assert.match(independentDay.warning, /尚未完成发布或校验/);
    await assert.rejects(() => weekPending.getAdminApplicationUsageAnalysisView({ mode: 'week' }), { message: 'application_usage_pending' });
    // Safety cases retained from the removed dual-projection reader, on the current seconds wire.
    const wrongScope = await load(async () => ({ ok: true, readUnit: 'seconds', contextId: 'another-child',
      applicationUsageSeconds: page() }));
    await assert.rejects(() => wrongScope.getAdminApplicationUsageAnalysisView(), /native_invalid_response/);
    const changedDuringSupplement = await load(async ({ query }) => query.fromDate === query.toDate
      ? { ok: true, applicationUsageSeconds: page() }
      : { ok: false, errorCode: 'application_usage_context_changed' });
    await assert.rejects(() => changedDuringSupplement.getAdminApplicationUsageAnalysisView(), /application_usage_context_changed/);
    const scaledPage = value => {
      const result = page();
      result.revision = String(value).repeat(64);
      result.computedAtMs += value;
      result.lastSettledAtMs += value;
      result.knownTotalSeconds = result.totalSeconds = 2 * value;
      for (const values of [result.knownCategoriesSeconds, ...result.days.map(day => day.categoriesSeconds),
        ...result.days.flatMap(day => day.hours.map(hour => hour.categoriesSeconds))]) {
        for (const key of Object.keys(values)) values[key] *= value;
      }
      for (const day of result.days) {
        day.totalSeconds *= value;
        day.generatedAtMs += value;
        day.settledThroughMs += value;
        for (const hour of day.hours) hour.totalSeconds *= value;
      }
      for (const row of result.applications) {
        row.knownTotalSeconds *= value; row.totalSeconds *= value;
        for (const date of Object.keys(row.dailySeconds)) row.dailySeconds[date] *= value;
      }
      return result;
    };
    for (const [dayValue, weekValue] of [[4, 8], [8, 4], [4, 4]]) {
      const mixed = await load(async ({ query }) => ({ ok: true,
        applicationUsageSeconds: scaledPage(query.fromDate === query.toDate ? dayValue : weekValue) }));
      const dayView = await mixed.getAdminApplicationUsageAnalysisView();
      const row = dayView.targetRows.find(item => item.label === 'Fixture 0');
      assert.equal(row.rangeKnownSeconds, dayValue);
      assert.equal(row.todaySeconds, dayValue, 'today in the selected current day must use the primary day snapshot');
      assert.equal(row.weekSeconds, weekValue, 'week remains an independent supplemental snapshot');
      assert.equal(dayView.totalSeconds, 2 * dayValue);
      const weekView = await mixed.getAdminApplicationUsageAnalysisView({ mode: 'week' });
      assert.equal(weekView.targetRows.find(item => item.label === 'Fixture 0').todaySeconds, weekValue);
      assert.equal((await mixed.getAdminApplicationUsageAnalysisView()).targetRows.find(item => item.label === 'Fixture 0').todaySeconds, dayValue);
    }
    for (const complete of [true, false]) {
      const pendingDay = await load(async ({ query }) => {
        const result = scaledPage(query.fromDate === query.toDate ? 4 : 8);
        if (query.fromDate === query.toDate) {
          result.days[5].status = 'pending_update';
          result.days[5].complete = result.complete = complete;
          if (!complete) {
            result.totalSeconds = null;
            for (const row of result.applications) row.totalSeconds = null;
          }
        }
        return { ok: true, applicationUsageSeconds: result };
      });
      const pendingView = await pendingDay.getAdminApplicationUsageAnalysisView();
      const row = pendingView.targetRows.find(item => item.label === 'Fixture 0');
      assert.equal(pendingView.totalSeconds, complete ? 8 : null);
      assert.equal(pendingView.knownTotalSeconds, 8);
      assert.equal(row.rangeSeconds, complete ? 4 : null);
      assert.equal(row.rangeKnownSeconds, 4);
      assert.equal(row.todaySeconds, 4);
      assert.equal(row.weekSeconds, 8);
    }
    let latestDay = 4, cacheReads = 0;
    const cachedWeek = await load(async ({ query }) => {
      cacheReads++;
      return { ok: true, applicationUsageSeconds: scaledPage(query.fromDate === query.toDate ? latestDay : 4) };
    });
    await cachedWeek.getAdminApplicationUsageAnalysisView({ mode: 'week' });
    latestDay = 8;
    const freshDay = await cachedWeek.getAdminApplicationUsageAnalysisView();
    assert.equal(cacheReads, 2, 'the supplementary week reuses its range-scoped cache');
    assert.equal(freshDay.targetRows.find(item => item.label === 'Fixture 0').todaySeconds, 8);
    assert.equal(freshDay.targetRows.find(item => item.label === 'Fixture 0').weekSeconds, 4);
    const history = await cachedWeek.getAdminApplicationUsageAnalysisView({ date: '2026-09-25' });
    assert.equal(history.targetRows.find(item => item.label === 'Fixture 0').rangeSeconds, 0);
    assert.equal(history.targetRows.find(item => item.label === 'Fixture 0').todaySeconds, 4,
      'historical selected days still obtain today from the current week');
    const absentInWeek = await load(async ({ query }) => {
      const result = page();
      if (query.fromDate !== query.toDate) result.applications = [];
      return { ok: true, applicationUsageSeconds: result };
    });
    const absentView = await absentInWeek.getAdminApplicationUsageAnalysisView();
    assert.equal(absentView.targetRows[0].rangeSeconds, 2);
    assert.equal(absentView.targetRows[0].todaySeconds, 2, 'today retains the primary day even if the week omits this application');
    assert.equal(absentView.targetRows[0].weekSeconds, 0);
    if (process.argv[2] && process.argv[3]) {
      const bundle = process.argv[2], wire = JSON.parse(fs.readFileSync(process.argv[3], 'utf8'));
      const tar = entry => execFileSync('tar.exe', ['-xOf', bundle, entry], { encoding: 'utf8' });
      const contractModule = await import(`data:text/javascript;base64,${Buffer.from(tar('package/dist/application-usage-seconds.js')).toString('base64')}`);
      const vectors = JSON.parse(tar('package/application-usage-seconds.vectors.json'));
      assert.equal(vectors.capability, 'application-usage-seconds-read-v1');
      for (const sample of vectors.samples) {
        contractModule.validateApplicationUsageSecondsQuery(sample.query);
        contractModule.validateApplicationUsageSecondsSnapshot(sample.snapshot, sample.query);
        adapter.validateApplicationUsageSecondsQuery(sample.query);
        adapter.validateApplicationUsageSecondsPage(sample.snapshot, sample.query);
      }
      for (const query of vectors.invalidQueries) assert.throws(() => adapter.validateApplicationUsageSecondsQuery(query));
      const byName = Object.fromEntries(wire.map(item => [item.name, item]));
      for (const item of wire) {
        contractModule.validateApplicationUsageSecondsQuery(item.query);
        contractModule.validateApplicationUsageSecondsSnapshot(item.response.applicationUsageSeconds, item.query);
        adapter.validateApplicationUsageSecondsQuery(item.query);
        adapter.validateApplicationUsageSecondsPage(item.response.applicationUsageSeconds, item.query);
      }
      assert.equal(byName.complete.response.applicationUsageSeconds.totalSeconds, 6);
      assert.equal(byName.partial.response.applicationUsageSeconds.totalSeconds, null);
      assert.equal(byName.partial.response.applicationUsageSeconds.knownTotalSeconds, 6);
      assert.equal(byName.unknown.response.applicationUsageSeconds.days[0].status, 'unknown');
      assert.equal(byName['page-1'].response.applicationUsageSeconds.nextOffset, 100);
      assert.equal(byName['page-2'].query.expectedRevision, byName['page-1'].response.applicationUsageSeconds.revision);

      const secondsContext = { readUnit: 'seconds', contextId: 'child-fixed/connection-fixed', available: true };
      const wireAdapter = await load(async ({ query }) => {
        const item = byName[query.offset === 0 ? 'page-1' : 'page-2'];
        if (query.fromDate !== '2026-10-06' || query.toDate !== '2026-10-06') return { ok: false, errorCode: 'application_usage_pending' };
        assert.equal(query.expectedRevision || null, item.query.expectedRevision || null);
        return { ...item.response };
      }, secondsContext);
      Date.now = () => Date.parse('2026-10-06T12:00:00+08:00');
      const secondsView = await wireAdapter.getAdminApplicationUsageAnalysisView();
      assert.equal(secondsView.readUnit, 'seconds');
      assert.equal(secondsView.totalSeconds, 6);
      assert.equal(secondsView.targetRows.length, 101);
      assert.equal(secondsView.targetRows.reduce((sum, row) => sum + row.rangeSeconds, 0), 404);
      assert.equal(secondsView.totalSeconds, 6, 'overlapping product rows never replace or inflate the authoritative total');
      assert.equal(secondsView.categoryTotals.app_other, 4);

      const partialViewAdapter = await load(async ({ query }) => query.fromDate === '2026-10-06' && query.offset === 0
        ? { ...byName.partial.response } : { ok: false, errorCode: 'application_usage_pending' }, secondsContext);
      const partialView = await partialViewAdapter.getAdminApplicationUsageAnalysisView();
      assert.equal(partialView.totalSeconds, null);
      assert.equal(partialView.knownTotalSeconds, 6);
      assert.equal(partialView.categoryTotals.app_study, 4);
      assert.equal(partialView.targetRows[0].rangeSeconds, null);
      assert.equal(partialView.targetRows[0].rangeKnownSeconds, 4);
      assert.equal(partialView.targetRows[0].todaySeconds, 4);
      assert.equal(partialView.categoryRows.find(row => row.key === 'app_study').seconds, 4);
      assert.equal(partialView.categoryRows.find(row => row.key === 'app_other').seconds, 4,
        'a category present in the incomplete snapshot remains visible as known usage');

      const unknownViewAdapter = await load(async ({ query }) => query.fromDate === '2026-10-06' && query.offset === 0
        ? { ...byName.unknown.response } : { ok: false, errorCode: 'application_usage_pending' }, secondsContext);
      const unknownView = await unknownViewAdapter.getAdminApplicationUsageAnalysisView();
      assert.equal(unknownView.totalSeconds, null);
      assert.equal(unknownView.knownTotalSeconds, 0);
      assert.match(unknownView.incompleteDates, /2026-10-06/);
      console.log('Native C# wire + contract vectors → extension seconds consumer: PASS');
    }
    Date.now = () => fixedNow;
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
    console.log('Application usage adapter: PASS (current seconds only, scope cache, paging, revisions, known portions, UI routing)');
  } finally { Date.now = originalNow; }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
