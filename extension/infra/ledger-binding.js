// Binding changes preserve inactive books; ordinary accounting still uses its existing keys.
export const LEDGER_BINDING_KEY = 'ledger_binding_scope_v1';
export const LEDGER_ARCHIVES_KEY = 'ledger_binding_archives_v1';
export const LEDGER_BINDING_KEYS = [
  'usage_segments_v1', 'usage_segments_index_v1', 'daily_usage_stats_v1', 'hourly_usage_stats_v1',
  'segment_sync_outbox_v1', 'stats_sync_outbox_v1', 'hourly_stats_sync_outbox_v1',
  'target_stats_sync_outbox_v1', 'hourly_target_stats_sync_outbox_v1',
  'usage_settlement_journal_v1', 'usage_compacted_facts_v1', 'usage_ledger_reconciliation_v1',
  'device_account_v2_state', 'media_segments_v1', 'daily_media_stats_v1', 'hourly_media_stats_v1',
  'media_segment_sync_outbox_v1', 'media_stats_sync_outbox_v1', 'hourly_media_stats_sync_outbox_v1',
  'event_log_v1', 'site_classification_requests_v1', 'composite_page_observations_v1',
  'cloud_pending_stats', 'cloud_pending_sessions', 'usage_stats_history_synced_through_date_v1',
  'usage_stats_today_last_upload_at_v1', 'usage_stats_today_last_error_v1',
  'usage_stats_history_last_upload_at_v1', 'usage_stats_history_last_error_v1',
  'cloud_usage_upload_backoff_v1', 'cloud_media_upload_backoff_v1',
  'cloud_v1_last_sync_at', 'cloud_v1_last_sync_error', 'cloud_v1_last_segment_upload_at',
  'cloud_v1_last_stats_upload_at', 'cloud_v1_last_hourly_stats_upload_at', 'cloud_v1_last_target_stats_upload_at',
  'cloud_v1_last_hourly_target_stats_upload_at', 'cloud_v1_last_media_segment_upload_at',
  'cloud_v1_last_media_stats_upload_at', 'cloud_v1_last_hourly_media_stats_upload_at',
];
const scalarKeys = new Set(LEDGER_BINDING_KEYS.filter(key => key.startsWith('usage_stats_') || key.startsWith('cloud_v1_last_')));
const empty = key => ['event_log_v1', 'site_classification_requests_v1'].includes(key) ? [] : scalarKeys.has(key) ? null : {};
const clone = value => JSON.parse(JSON.stringify(value));
export function ledgerBindingScope(binding, apiBase) {
  return typeof binding?.cloud_profile_id === 'string' && binding.cloud_profile_id
    && typeof binding.cloud_device_id === 'string' && binding.cloud_device_id
    ? { apiBase, profileId: binding.cloud_profile_id, deviceId: binding.cloud_device_id } : null;
}
export function sameLedgerBinding(left, right) {
  return !!left && !!right && ['apiBase', 'profileId', 'deviceId'].every(key => left[key] === right[key]);
}
const scopeKey = scope => JSON.stringify([scope.apiBase, scope.profileId, scope.deviceId]);
const hasBook = values => LEDGER_BINDING_KEYS.some(key => {
  const value = values[key];
  return value != null && (typeof value !== 'object' || Object.keys(value).length > 0);
});
function factsMatch(values, scope) {
  const facts = ['usage_segments_v1', 'media_segments_v1'].flatMap(key => Object.values(values[key] || {}));
  facts.push(...Object.values(values.usage_settlement_journal_v1?.entries || {}).map(entry => entry?.input));
  return !!scope && facts.every(fact => fact?.profileId === scope.profileId && fact?.deviceId === scope.deviceId);
}
export function createLedgerBindingIsolation({ read, mutate, boundary, apiBase }) {
  const readers = new Set();
  let changesPending = 0, changeTail = Promise.resolve();
  const bindingKeys = ['cloud_profile_id', 'cloud_device_id', 'cloud_device_token'];
  async function checkScope() {
    return mutate(async storage => {
      let data = await storage.get([...bindingKeys, LEDGER_BINDING_KEY]);
      const current = ledgerBindingScope(data, apiBase());
      if (!current || !data.cloud_device_token) throw Error('ledger_binding_unavailable');
      if (data[LEDGER_BINDING_KEY]) {
        if (!sameLedgerBinding(data[LEDGER_BINDING_KEY], current)) throw Error('ledger_binding_scope_mismatch');
      } else {
        data = { ...data, ...await storage.get(LEDGER_BINDING_KEYS) };
        const facts = Object.keys(data.usage_segments_v1 || {}).length + Object.keys(data.media_segments_v1 || {}).length;
        if (!factsMatch(data, current) || (!facts && hasBook(data))) throw Error('ledger_binding_unattributed');
        await storage.set({ [LEDGER_BINDING_KEY]: current }, { allowMaintenance: false });
      }
      return { ...current, deviceToken: data.cloud_device_token };
    });
  }
  return {
    async upload(task) {
      if (changesPending) throw Error('ledger_binding_changing');
      const work = (async () => {
        const scope = await checkScope();
        return task(scope);
      })();
      readers.add(work);
      try { return await work; } finally { readers.delete(work); }
    },
    change(updates) {
      const next = ledgerBindingScope(updates, apiBase());
      if (!next || typeof updates.cloud_device_token !== 'string' || !updates.cloud_device_token) {
        return Promise.reject(Error('ledger_binding_invalid'));
      }
      changesPending++;
      const work = changeTail.then(async () => {
        await Promise.allSettled([...readers]);
        const prior = await read([...bindingKeys, LEDGER_BINDING_KEY]);
        const old = prior[LEDGER_BINDING_KEY] || ledgerBindingScope(prior, apiBase());
        const switchBook = !sameLedgerBinding(old, next);
        const commit = () => mutate(async storage => {
          const current = await storage.get([...bindingKeys, LEDGER_BINDING_KEY, LEDGER_ARCHIVES_KEY, ...LEDGER_BINDING_KEYS]);
          if (bindingKeys.some(key => current[key] !== prior[key])) throw Error('ledger_binding_changed');
          const writes = { ...updates, [LEDGER_BINDING_KEY]: next };
          if (!switchBook && (!factsMatch(current, next) || (!prior[LEDGER_BINDING_KEY] && hasBook(current)
              && !Object.keys(current.usage_segments_v1 || {}).length && !Object.keys(current.media_segments_v1 || {}).length))) {
            throw Error('ledger_binding_unattributed');
          }
          if (switchBook) {
            const archives = clone(current[LEDGER_ARCHIVES_KEY] || {});
            const values = Object.fromEntries(LEDGER_BINDING_KEYS.filter(key => Object.hasOwn(current, key)).map(key => [key, current[key]]));
            const trusted = !!prior[LEDGER_BINDING_KEY] && factsMatch(values, old);
            // An existing binding can establish ownership only while its stored facts agree.
            const known = trusted || (sameLedgerBinding(old, ledgerBindingScope(prior, apiBase()))
              && factsMatch(values, old) && (Object.keys(values.usage_segments_v1 || {}).length > 0
                || Object.keys(values.media_segments_v1 || {}).length > 0 || !hasBook(values)));
            if (hasBook(values)) {
              let key = known ? scopeKey(old) : 'unattributed:0';
              for (let index = 1; !known && Object.hasOwn(archives, key); index++) key = `unattributed:${index}`;
              archives[key] = { scope: known ? old : null, values: clone(values) };
            }
            const restored = archives[scopeKey(next)];
            for (const key of LEDGER_BINDING_KEYS) writes[key] = restored?.values && Object.hasOwn(restored.values, key)
              ? clone(restored.values[key]) : empty(key);
            if (restored) delete archives[scopeKey(next)];
            writes[LEDGER_ARCHIVES_KEY] = archives;
          }
          await storage.set(writes, { allowMaintenance: false });
          return { ok: true, switched: switchBook, scope: next };
        });
        return switchBook ? boundary(commit, old) : commit();
      });
      changeTail = work.catch(() => {});
      return work.finally(() => { changesPending--; });
    },
  };
}
