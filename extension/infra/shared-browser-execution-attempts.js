import { browserExecutionFence, browserExecutionIdentityHash } from './shared-browser-execution-fence.js';

const DATABASE = 'shared-browser-execution-attempts-v1';
const STORE = 'attempts';
const MAX_RECORDS = 20;
const MAX_BYTES = 8192;
const validId = value => typeof value === 'string' && value.trim().length > 0 && value.length <= 128;
const validRecord = value => value && ['executionId,leaseId,registeredAt', 'executionId,identityHash,leaseId,registeredAt'].includes(Object.keys(value).sort().join(','))
  && (value.identityHash == null || /^[a-f0-9]{64}$/.test(value.identityHash))
  && validId(value.executionId) && validId(value.leaseId) && Number.isSafeInteger(value.registeredAt) && value.registeredAt >= 0;

function openDatabase() {
  return new Promise((resolve, reject) => {
    let refused = false;
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: 'executionId' });
    request.onsuccess = () => { if (refused) request.result.close(); else resolve(request.result); };
    request.onerror = request.onblocked = () => { refused = true; reject(new Error('attempt_store_unavailable')); };
  });
}

// A single readwrite transaction serializes claims, including separate preparation instances.
async function transact(mode, decide) {
  if (globalThis.chrome?.extension?.inIncognitoContext === true) throw new Error('attempt_store_context_unsupported');
  const db = await openDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const tx = mode === 'readwrite' ? db.transaction(STORE, mode, { durability: 'strict' }) : db.transaction(STORE, mode);
      if (mode === 'readwrite' && tx.durability !== 'strict') { tx.abort(); reject(new Error('attempt_store_durability_unavailable')); return; }
      const store = tx.objectStore(STORE);
      let result;
      tx.oncomplete = () => resolve(result);
      tx.onerror = tx.onabort = () => reject(new Error('attempt_store_unavailable'));
      const request = store.getAll();
      request.onsuccess = () => {
        try {
          const decision = decide(request.result);
          result = decision.result;
          if (decision.record) store.add(decision.record);
          if (decision.deleteId) store.delete(decision.deleteId);
        } catch (_) { tx.abort(); }
      };
    });
  } finally { db.close(); }
}

export function createSharedBrowserExecutionAttemptStore({ transaction = transact, now = Date.now,
  fence = browserExecutionFence } = {}) {
  function check(records) {
    if (!Array.isArray(records) || records.length > MAX_RECORDS || records.some(record => !validRecord(record))
      || new Set(records.map(record => record.executionId)).size !== records.length
      || new TextEncoder().encode(JSON.stringify(records)).length > MAX_BYTES) throw new Error('attempt_store_corrupt');
  }
  return {
    async readAttemptedIds() {
      return transaction('readonly', records => { check(records); return { result: new Set(records.map(record => record.executionId)) }; });
    },
    async claimAttempt(executionId, leaseId, identity = null, generation = fence.capture()) {
      if (!validId(executionId) || !validId(leaseId)) return { ok: false, errorCode: 'browser_execution_claim_invalid' };
      try {
        if (identity && (identity.executionId !== executionId || identity.leaseId !== leaseId)) {
          return { ok: false, errorCode: 'browser_execution_claim_invalid' };
        }
        const identityHash = identity ? await browserExecutionIdentityHash(identity) : null;
        return await transaction('readwrite', records => {
          check(records);
          if (!fence.current(generation)) return { result: { ok: false, errorCode: 'browser_execution_generation_changed' } };
          if (records.some(record => record.executionId === executionId)) return { result: { ok: false, errorCode: 'browser_execution_already_attempted' } };
          const record = { executionId, leaseId, registeredAt: now(), ...(identityHash ? { identityHash } : {}) };
          if (!validRecord(record)) throw new Error('attempt_store_invalid_clock');
          if (records.length >= MAX_RECORDS || new TextEncoder().encode(JSON.stringify([...records, record])).length > MAX_BYTES) {
            return { result: { ok: false, errorCode: 'browser_execution_attempt_store_full' } };
          }
          return { record, result: { ok: true, effectsEnabled: false } };
        });
      } catch (_) { return { ok: false, errorCode: 'browser_execution_claim_failed' }; }
    },
    async retireAttempt(proof) {
      try {
        return await transaction('readwrite', records => {
          check(records);
          const evidence = fence.evidence(proof);
          if (!evidence) return { result: { ok: false, errorCode: 'browser_execution_retirement_unproven' } };
          const record = records.find(value => value.executionId === evidence.executionId);
          if (!record) return { result: { ok: true, retired: false, effectsEnabled: false } };
          if (!record.identityHash || record.identityHash !== evidence.identityHash || record.leaseId !== evidence.leaseId) {
            return { result: { ok: false, errorCode: 'browser_execution_retirement_identity_mismatch' } };
          }
          return { deleteId: record.executionId, result: { ok: true, retired: true, effectsEnabled: false } };
        });
      } catch (_) { return { ok: false, errorCode: 'browser_execution_retirement_failed' }; }
    },
  };
}

export const sharedBrowserExecutionAttempts = createSharedBrowserExecutionAttemptStore();
