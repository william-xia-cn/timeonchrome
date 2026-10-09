'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '../..');
const fixedNow = Date.parse('2026-10-09T02:00:00Z');
const accountSource = fs.readFileSync(path.join(root, 'extension/core/shared-contracts/1.43.0/usage-account.js'), 'utf8');
const contractSource = fs.readFileSync(path.join(root, 'extension/core/shared-contracts/1.43.0/application-usage-seconds.js'), 'utf8')
  .replace("import { parseApplicationUsageSeconds } from './usage-account.js';",
    'const { parseApplicationUsageSeconds } = globalThis.__identityTestAccount;');
const legacySource = fs.readFileSync(path.join(root, 'extension/stats/application-usage-read-model.js'), 'utf8');
const modelSource = fs.readFileSync(path.join(root, 'extension/stats/application-identity-usage-read-model.js'), 'utf8')
  .replace("import { validateApplicationIdentityUsageQuery, validateApplicationIdentityUsageSnapshot } from '../core/shared-contracts/1.43.0/application-usage-seconds.js';",
    'const { validateApplicationIdentityUsageQuery, validateApplicationIdentityUsageSnapshot } = globalThis.__identityTestContract;')
  .replace("import { getAdminApplicationUsageAnalysisView, APPLICATION_CATEGORY_LABELS } from './application-usage-read-model.js';",
    'const { getAdminApplicationUsageAnalysisView, APPLICATION_CATEGORY_LABELS } = globalThis.__identityTestLegacy;');

const hash = 'a'.repeat(64);
function snapshot(query, { unavailable = false, subjects = [], offset = 0, nextOffset = null, totalPerDay = 3600 } = {}) {
  const dates = Array.from({ length: (Date.parse(`${query.toDate}T00:00:00+08:00`) - Date.parse(`${query.fromDate}T00:00:00+08:00`)) / 86_400_000 + 1 },
    (_, i) => new Date(Date.parse(`${query.fromDate}T00:00:00+08:00`) + i * 86_400_000 + 28_800_000).toISOString().slice(0, 10));
  const days = dates.map(date => ({ date, status: 'available', baseRevision: 1, manifestHash: hash,
    generatedAtMs: fixedNow, settledThroughMs: fixedNow, complete: true, reasonCodes: [], totalSeconds: totalPerDay,
    hours: Array.from({ length: 24 }, (_, hour) => ({ hour, totalSeconds: hour === 10 ? totalPerDay : 0 })) }));
  const base = { complete: true, reasonCodes: [], computedAtMs: fixedNow, lastSettledAtMs: fixedNow,
    totalSeconds: dates.length * totalPerDay, knownTotalSeconds: dates.length * totalPerDay, days };
  const productDays = dates.map(date => unavailable
    ? { date, status: 'unavailable', baseManifestHash: hash, projectionHash: null, revision: null,
      catalogVersion: null, complete: false, reasonCodes: ['PRODUCT_UNAVAILABLE'], categoriesSeconds: {}, hours: [], applicationUsage: null }
    : { date, status: 'available', baseManifestHash: hash, projectionHash: hash, revision: 1, catalogVersion: 1,
      complete: true, reasonCodes: [], categoriesSeconds: { study: totalPerDay },
      hours: Array.from({ length: 24 }, (_, hour) => ({ hour, categoriesSeconds: hour === 10 ? { study: totalPerDay } : {} })),
      applicationUsage: { nonSpecialTotal: totalPerDay, nonSpecialCategories: { study: totalPerDay }, specialTotal: 0,
        complete: true, reasonCodes: [] } });
  return { schemaVersion: 3, durationUnit: 'seconds', timezone: 'Asia/Shanghai',
    fromDate: query.fromDate, toDate: query.toDate, view: query.view, revision: `${query.view}:revision-1`,
    base, product: query.view === 'base' ? null : { days: productDays }, subjects,
    nextOffset };
}
function subjectRows(query, count, offset = 0) {
  return Array.from({ length: count }, (_, index) => {
    const serial = (offset + index + 1).toString(16).padStart(64, '0');
    const key = query.view === 'base' ? `instance:${serial}` : `product:catalog-${serial}.example`;
    const dayCount = (Date.parse(`${query.toDate}T00:00:00+08:00`) - Date.parse(`${query.fromDate}T00:00:00+08:00`)) / 86_400_000 + 1;
    return { key, totalSeconds: dayCount, knownTotalSeconds: dayCount,
      dailySeconds: Object.fromEntries(Array.from({ length: (Date.parse(`${query.toDate}T00:00:00+08:00`) - Date.parse(`${query.fromDate}T00:00:00+08:00`)) / 86_400_000 + 1 },
        (_, i) => [new Date(Date.parse(`${query.fromDate}T00:00:00+08:00`) + i * 86_400_000 + 28_800_000).toISOString().slice(0, 10), 1])),
      ...(query.view === 'product' ? { name: '目录确认的产品' } : {}) };
  });
}
function legacyPage(query) {
  const dates = Array.from({ length: (Date.parse(`${query.toDate}T00:00:00+08:00`) - Date.parse(`${query.fromDate}T00:00:00+08:00`)) / 86_400_000 + 1 },
    (_, i) => new Date(Date.parse(`${query.fromDate}T00:00:00+08:00`) + i * 86_400_000 + 28_800_000).toISOString().slice(0, 10));
  return { fromDate: query.fromDate, toDate: query.toDate, revision: hash, computedAtMs: fixedNow,
    lastSettledAtMs: fixedNow, complete: true, reasonCodes: [], totalMs: 0,
    days: dates.map(date => ({ date, totalMs: 0, complete: true, reasonCodes: [], categoriesMs: {},
      hours: Array.from({ length: 24 }, (_, hour) => ({ hour, totalMs: 0, categoriesMs: {} })) })),
    applications: [], nextOffset: null };
}

async function load(onRead, identitySupported = true, getContextId = () => 'child-device-context') {
  globalThis.__identityTestAccount = await import(`data:text/javascript;base64,${Buffer.from(accountSource).toString('base64')}`);
  globalThis.__identityTestContract = await import(`data:text/javascript;base64,${Buffer.from(contractSource).toString('base64')}`);
  globalThis.__identityTestLegacy = await import(`data:text/javascript;base64,${Buffer.from(legacySource).toString('base64')}`);
  globalThis.chrome = { runtime: { sendMessage: async message => {
    if (message.contextOnly) return { ok: true, contextId: getContextId(), identitySupported, legacyAvailable: true,
      readUnit: identitySupported ? 'seconds' : 'milliseconds', available: true };
    return onRead(message);
  } } };
  return import(`data:text/javascript;base64,${Buffer.from(modelSource + Math.random()).toString('base64')}`);
}

async function main() {
  const originalNow = Date.now;
  Date.now = () => fixedNow;
  try {
    const calls = [];
    const model = await load(async message => {
      calls.push(message.query);
      const query = message.query;
      const rows = subjectRows(query, 1);
      return { ok: true, contextId: message.expectedContextId,
        snapshot: snapshot(query, { subjects: rows }) };
    });
    const view = await model.getAdminApplicationIdentityUsageAnalysisView({ mode: 'day' });
    assert.equal(view.identityModel, true);
    assert.equal(view.totalSeconds, 3600);
    assert.equal(view.targetRows[0].rangeSeconds, 1);
    assert.equal(view.baseRows.length, 1);
    assert.match(view.baseRows[0].status, /不按名称推断/);
    assert.equal(view.targetRows[0].label, '目录确认的产品');
    assert.notEqual(view.totalSeconds, view.totalSeconds + view.targetRows[0].rangeSeconds);
    assert(calls.some(query => query.view === 'base'));
    assert(calls.some(query => query.view === 'product'));

    const unavailable = await load(async message => {
      const query = message.query;
      if (query.view === 'product') return { ok: false, errorCode: 'application_identity_usage_unavailable' };
      return { ok: true, contextId: message.expectedContextId,
        snapshot: snapshot(query, { subjects: subjectRows(query, 1) }) };
    });
    const partial = await unavailable.getAdminApplicationIdentityUsageAnalysisView({ mode: 'day', force: true });
    assert.equal(partial.totalSeconds, 3600);
    assert.equal(partial.targetRows.length, 0);
    assert.match(partial.identityProductProjectionStatus, /不可用/);

    const preserved = await load(async message => {
      const query = message.query;
      if (query.fromDate === '2026-10-05') {
        return { ok: false, errorCode: 'application_identity_usage_unavailable' };
      }
      return { ok: true, contextId: message.expectedContextId,
        snapshot: snapshot(query, { subjects: subjectRows(query, 1) }) };
    });
    const preservedView = await preserved.getAdminApplicationIdentityUsageAnalysisView({
      mode: 'day', date: '2026-10-04', force: true });
    assert.equal(preservedView.totalSeconds, 3600, 'supplemental current-week failure preserves selected-range base usage');
    assert.equal(preservedView.baseRows[0].rangeSeconds, 1);
    assert.equal(preservedView.baseRows[0].todaySeconds, null);
    assert.equal(preservedView.baseRows[0].weekSeconds, null);
    assert.equal(preservedView.weekUnavailable, true);
    assert.deepEqual(preservedView.currentBaseDays, []);
    assert.match(preservedView.warning, /保留所选范围数据/);

    const zeroAbsent = await load(async message => {
      const query = message.query;
      const isCurrentWeek = query.fromDate === '2026-10-05';
      return { ok: true, contextId: message.expectedContextId,
        snapshot: snapshot(query, { subjects: isCurrentWeek ? [] : subjectRows(query, 1) }) };
    });
    const zeroView = await zeroAbsent.getAdminApplicationIdentityUsageAnalysisView({
      mode: 'day', date: '2026-10-04', force: true });
    assert.equal(zeroView.baseRows[0].rangeSeconds, 1);
    assert.equal(zeroView.baseRows[0].todaySeconds, 0,
      'a complete current snapshot without the selected subject means zero for today');
    assert.equal(zeroView.baseRows[0].weekSeconds, 0,
      'a complete current snapshot without the selected subject means zero for the week');

    const switchedDuringSupplement = await load(async message => {
      if (message.query.fromDate === '2026-10-05') {
        return { ok: false, errorCode: 'application_identity_usage_context_changed' };
      }
      return { ok: true, contextId: message.expectedContextId,
        snapshot: snapshot(message.query, { subjects: subjectRows(message.query, 1) }) };
    });
    await assert.rejects(() => switchedDuringSupplement.getAdminApplicationIdentityUsageAnalysisView({
      mode: 'day', date: '2026-10-04', force: true }),
    /application_identity_usage_context_changed/,
    'identity change rejects the old selected-range result instead of returning partial data');

    const pages = [];
    const paged = await load(async message => {
      const query = message.query;
      pages.push(query);
      const offset = query.offset;
      const rows = subjectRows(query, offset === 0 ? 100 : 1, offset);
      const page = snapshot(query, { subjects: rows, nextOffset: offset === 0 ? 100 : null });
      return { ok: true, contextId: message.expectedContextId, snapshot: page };
    });
    await paged.getAdminApplicationIdentityUsageAnalysisView({ mode: 'day', force: true });
    for (const viewName of ['base', 'product']) {
      const ranges = new Map();
      for (const query of pages.filter(item => item.view === viewName)) {
        const key = `${query.fromDate}/${query.toDate}`;
        ranges.set(key, [...(ranges.get(key) || []), query]);
      }
      assert.equal(ranges.size, 2, `${viewName} reads both the selected day and current week`);
      for (const rangePages of ranges.values()) {
        assert.equal(rangePages.length, 2, `${viewName} paginates each date range independently`);
        assert.equal(rangePages[0].offset, 0);
        assert.equal(rangePages[1].offset, 100);
        assert.equal(rangePages[1].expectedRevision, `${viewName}:revision-1`);
      }
    }

    const wrongContext = await load(async message => ({ ok: true, contextId: 'different-child',
      snapshot: snapshot(message.query, { subjects: subjectRows(message.query, 1) }) }));
    await assert.rejects(() => wrongContext.getAdminApplicationIdentityUsageAnalysisView({ mode: 'day', force: true }),
      /application_identity_usage_context_changed/);

    const legacy = await load(async message => ({ ok: true, readUnit: 'milliseconds', contextId: 'child-device-context',
      applicationUsage: legacyPage(message.query) }), false);
    const legacyView = await legacy.getAdminApplicationIdentityUsageAnalysisView({ mode: 'day' });
    assert.equal(legacyView.legacyModel, true);
    assert.equal(legacyView.identityModel, false);
    assert.match(legacyView.meta.syncLabel, /旧版应用统计（未按基础实例与产品身份分层）/);
    assert.equal(Object.hasOwn(legacyView, 'baseRows'), false,
      'legacy view must not expose the new base-instance section data');
    assert.equal(Object.hasOwn(legacyView, 'identityProductProjectionStatus'), false,
      'legacy view must not expose the new product-identity projection section');

    let activeContext = 'child-one-device';
    const contextsSeen = [];
    const switched = await load(async message => {
      contextsSeen.push(message.expectedContextId);
      return { ok: true, contextId: message.expectedContextId,
        snapshot: snapshot(message.query, { subjects: subjectRows(message.query, 1) }) };
    }, true, () => activeContext);
    await switched.getAdminApplicationIdentityUsageAnalysisView({ mode: 'day' });
    activeContext = 'child-two-device';
    await switched.getAdminApplicationIdentityUsageAnalysisView({ mode: 'day' });
    assert(contextsSeen.includes('child-one-device'));
    assert(contextsSeen.includes('child-two-device'));
  } finally {
    Date.now = originalNow;
    delete globalThis.chrome;
    delete globalThis.__identityTestAccount;
    delete globalThis.__identityTestContract;
    delete globalThis.__identityTestLegacy;
  }
}

main().then(() => console.log('application identity usage read-model tests passed'))
  .catch(error => { console.error(error); process.exitCode = 1; });
