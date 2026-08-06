// Journal-first foreground usage durability tests.
'use strict';

const fs = require('fs');
const path = require('path');

class MockStorage {
  constructor() { this.data = {}; this.reject = null; }
  async get(keys) {
    if (keys == null) return { ...this.data };
    if (Array.isArray(keys)) return Object.fromEntries(keys.map((key) => [key, this.data[key]]));
    if (typeof keys === 'string') return { [keys]: this.data[keys] };
    return Object.fromEntries(Object.entries(keys || {}).map(([key, fallback]) => [key, this.data[key] ?? fallback]));
  }
  async set(items) {
    if (this.reject?.(items)) throw new Error('injected_storage_failure');
    Object.assign(this.data, items);
  }
  async remove(keys) { for (const key of Array.isArray(keys) ? keys : [keys]) delete this.data[key]; }
  async getBytesInUse(keys = null) {
    const value = keys == null ? this.data : await this.get(keys);
    return new TextEncoder().encode(JSON.stringify(value)).length;
  }
}

const local = new MockStorage();
const session = new MockStorage();
global.chrome = { storage: { local, session } };

function loadModule(relPath, exports, injected = {}) {
  const file = path.join(__dirname, '..', '..', 'extension', relPath);
  let code = fs.readFileSync(file, 'utf8')
    .replace(/^\s*import .*?;\s*$/gm, '')
    .replace(/export\s+async\s+function\s+/g, 'async function ')
    .replace(/export\s+function\s+/g, 'function ')
    .replace(/export\s+const\s+/g, 'const ')
    .replace(/export\s*\{[^}]*\};?\s*$/gm, '');
  const names = Object.keys(injected);
  const prelude = names.length ? `const { ${names.join(', ')} } = __injected;\n` : '';
  return new Function('__injected', `${prelude}${code}\nreturn { ${exports.join(', ')} };`)(injected);
}

const budget = loadModule('infra/storage-budget.js', ['budgetedLocalSet', 'runStorageMutation']);
const usage = loadModule('core/usage-segments.js', [
  'isCountedState', 'settleUsageDuration', 'persistUsageSettlementJournal',
  'clearUsageSettlementJournal', 'drainUsageSettlementJournal', 'reconcileUsageLedger',
], budget);
const events = [];
const sessionApi = loadModule('runtime/session.js', [
  'saveSession', 'getSession', 'settleCurrentSessionSegment', 'transitionStateAt',
], {
  appendEvent: async (event) => { events.push(event); },
  EVENT_TYPE: { START: 'START', END: 'END' },
  emitTrace: async () => {},
  getReliableCloseTime: (_session, now) => ({ closeTime: now, stale: false }),
  isCountedState: usage.isCountedState,
  settleUsageDuration: usage.settleUsageDuration,
  persistUsageSettlementJournal: usage.persistUsageSettlementJournal,
  clearUsageSettlementJournal: usage.clearUsageSettlementJournal,
  budgetedLocalSet: budget.budgetedLocalSet,
});

function check(label, condition) {
  if (!condition) throw new Error(label);
}

(async () => {
  const start = new Date('2026-08-06T08:00:00+08:00').getTime();
  await local.set({ guardian_session: { currentMode: 'study' } });
  local.reject = (items) => Object.prototype.hasOwnProperty.call(items, 'usage_segments_v1');
  const pending = await sessionApi.settleCurrentSessionSegment({
    state: 'ACTIVE', domain: 'journal.example.com', startTime: start, lastHeartbeat: start + 60_000,
  }, start + 60_000, 'transition_complete');
  check('failed full settlement remains journal-durable', pending.durability === 'journal');
  check('journal remains pending', Object.keys(local.data.usage_settlement_journal_v1?.entries || {}).length === 1);
  check('partial usage keys were not written', local.data.usage_segments_v1 == null && local.data.daily_usage_stats_v1 == null);

  local.reject = null;
  const replay = await usage.drainUsageSettlementJournal();
  check('journal replay succeeds', replay.replayed === 1 && replay.pending === 0);
  check('replayed segment is durable', Object.keys(local.data.usage_segments_v1 || {}).length === 1);
  check('journal is acknowledged after replay', Object.keys(local.data.usage_settlement_journal_v1?.entries || {}).length === 0);
  const replayedId = Object.keys(local.data.usage_segments_v1 || {})[0];
  local.data.usage_segments_index_v1 = {};
  local.data.daily_usage_stats_v1 = {};
  local.data.hourly_usage_stats_v1 = {};
  local.data.segment_sync_outbox_v1 = { dirtySegmentIds: [], retryCounts: {}, lastErrors: {} };
  delete local.data.usage_ledger_reconciliation_v1;
  const reconciled = await usage.reconcileUsageLedger({ force: true });
  const replayedDate = local.data.usage_segments_v1[replayedId].date;
  check('reconciler restores missing date index', reconciled.ok && local.data.usage_segments_index_v1[replayedDate].includes(replayedId));
  check('reconciler restores missing daily aggregate', local.data.daily_usage_stats_v1[replayedDate].domains['journal.example.com'].activeSeconds === 60);
  check('reconciler restores pending segment outbox', local.data.segment_sync_outbox_v1.dirtySegmentIds.includes(replayedId));
  local.data.daily_usage_stats_v1[replayedDate].domains['journal.example.com'].activeSeconds = 999;
  delete local.data.usage_ledger_reconciliation_v1;
  await usage.reconcileUsageLedger({ force: true });
  check('reconciler never replaces retained historical aggregate with local raw subset', local.data.daily_usage_stats_v1[replayedDate].domains['journal.example.com'].activeSeconds === 999);

  local.data = { guardian_session: { currentMode: 'study' } };
  session.data = {};
  events.length = 0;
  const original = { state: 'ACTIVE', domain: 'old.example.com', startTime: start, lastHeartbeat: start + 60_000 };
  await sessionApi.saveSession(original);
  local.reject = (items) => Object.prototype.hasOwnProperty.call(items, 'usage_settlement_journal_v1');
  const transition = await sessionApi.transitionStateAt('ACTIVE', 'new.example.com', start + 60_000, 'tabActivated');
  const after = await sessionApi.getSession();
  check('transition rejects when neither ledger nor journal is durable', transition?.ok === false && transition.reason === 'settlement_not_durable');
  check('session does not advance after durability failure', after.domain === original.domain && after.startTime === original.startTime);

  console.log('[Usage Settlement Durability] 12/12 passed');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});