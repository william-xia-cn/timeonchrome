// Versioned device-day account snapshots. Package D writes shadow data only.

import { runStorageMutation } from '../infra/storage-budget.js';

export const DEVICE_ACCOUNT_V2_STATE_KEY = 'device_account_v2_state';
export const DEVICE_ACCOUNT_V2_MAX_CHUNK_ROWS = 200;
const DEVICE_ACCOUNT_V2_MAX_LOCAL_DATES = 16;
const VALID_KINDS = new Set(['daily_domain', 'hourly_domain', 'daily_target', 'hourly_target']);
const VALID_CHANNELS = new Set(['active', 'backgroundMedia', 'pip']);
const VALID_MODES = new Set(['study', 'rest', 'locked', 'paused', 'unknown', 'composite']);
const COMMON_ROW_KEYS = new Set([
  'kind', 'periodKey', 'channel', 'mode', 'durationSeconds', 'segmentsCount', 'firstSeenAt', 'lastSeenAt',
]);
const DOMAIN_ROW_KEYS = new Set([...COMMON_ROW_KEYS, 'domain']);
const TARGET_ROW_KEYS = new Set([
  ...COMMON_ROW_KEYS,
  'targetKey', 'managedTargetId', 'managedTargetType', 'managedTargetNamespace', 'managedTargetValue',
  'managedTargetLabelAtTime', 'targetSourceAtTime', 'targetRuleId', 'targetMatchLevel',
  'targetClassificationAtTime', 'fallbackDomain', 'isFallback', 'quotaBucket',
]);

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
}

export function canonicalDeviceAccountJson(value) {
  return JSON.stringify(canonicalize(value));
}

export async function hashDeviceAccountValue(value) {
  const bytes = new TextEncoder().encode(canonicalDeviceAccountJson(value));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function positiveRows(entry, fallbackFactory) {
  const rows = Array.isArray(entry?.rows)
    ? entry.rows
    : Object.values(entry?.rows || {});
  const positive = rows.filter((row) => Number(row?.durationSeconds || 0) > 0);
  return positive.length > 0 ? positive : fallbackFactory(entry);
}

function expandModeRows(entry) {
  const result = [];
  for (const [channel, mapName] of [
    ['active', 'activeByMode'],
    ['backgroundMedia', 'backgroundMediaByMode'],
    ['pip', 'pipByMode'],
  ]) {
    for (const [mode, seconds] of Object.entries(entry?.[mapName] || {})) {
      if (Number(seconds || 0) > 0) {
        result.push({ channel, mode, durationSeconds: Number(seconds), segmentsCount: 0 });
      }
    }
  }
  return result;
}

function expandTargetRows(entry) {
  const rows = expandModeRows(entry);
  return rows.map((row) => ({ ...row, quotaBucket: row.mode }));
}

function finiteOrNull(value) {
  return Number.isFinite(Number(value)) ? Number(value) : null;
}

function normalizeCount(value) {
  return Number.isFinite(Number(value)) ? Math.max(0, Math.trunc(Number(value))) : 0;
}

function domainRows(kind, periodKey, entries) {
  const rows = [];
  for (const entry of Array.isArray(entries) ? entries : []) {
    if (!entry?.domain) continue;
    for (const row of positiveRows(entry, expandModeRows)) {
      rows.push({
        kind,
        periodKey,
        domain: String(entry.domain),
        channel: row.channel || 'active',
        mode: row.mode || 'unknown',
        durationSeconds: normalizeCount(row.durationSeconds),
        segmentsCount: normalizeCount(row.segmentsCount),
        firstSeenAt: finiteOrNull(entry.firstSeenAt),
        lastSeenAt: finiteOrNull(entry.lastSeenAt),
      });
    }
  }
  return rows.filter((row) => row.durationSeconds > 0);
}

function targetRows(kind, periodKey, entries) {
  const rows = [];
  for (const entry of Array.isArray(entries) ? entries : []) {
    if (!entry?.targetKey) continue;
    for (const row of positiveRows(entry, expandTargetRows)) {
      rows.push({
        kind,
        periodKey,
        targetKey: String(entry.targetKey),
        managedTargetId: entry.managedTargetId || null,
        managedTargetType: entry.managedTargetType || null,
        managedTargetNamespace: entry.managedTargetNamespace || null,
        managedTargetValue: entry.managedTargetValue || null,
        managedTargetLabelAtTime: entry.managedTargetLabelAtTime || null,
        targetSourceAtTime: entry.targetSourceAtTime || null,
        targetRuleId: entry.targetRuleId || null,
        targetMatchLevel: entry.targetMatchLevel || null,
        targetClassificationAtTime: entry.targetClassificationAtTime || null,
        fallbackDomain: entry.fallbackDomain || null,
        isFallback: entry.isFallback === true,
        channel: row.channel || 'active',
        mode: row.mode || 'unknown',
        quotaBucket: row.quotaBucket || row.mode || 'unknown',
        durationSeconds: normalizeCount(row.durationSeconds),
        segmentsCount: normalizeCount(row.segmentsCount),
        firstSeenAt: finiteOrNull(entry.firstSeenAt),
        lastSeenAt: finiteOrNull(entry.lastSeenAt),
      });
    }
  }
  return rows.filter((row) => row.durationSeconds > 0);
}

export function buildDeviceAccountRows(snapshot) {
  const rows = [
    ...domainRows('daily_domain', snapshot.date, snapshot.dailyPayload?.domains),
    ...targetRows('daily_target', snapshot.date, snapshot.targetPayload?.targets),
  ];
  for (const payload of snapshot.hourlyPayloads || []) {
    rows.push(...domainRows('hourly_domain', payload.hourKey, payload.domains));
  }
  for (const payload of snapshot.hourlyTargetPayloads || []) {
    rows.push(...targetRows('hourly_target', payload.hourKey, payload.targets));
  }
  return rows.sort((left, right) => canonicalDeviceAccountJson(left).localeCompare(canonicalDeviceAccountJson(right)));
}

export function validateDeviceAccountRows(rows, date, { requireConservation = true } = {}) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date || ''))) {
    return { ok: false, code: 'DEVICE_ACCOUNT_INVALID_DATE' };
  }
  const totals = { daily_domain: 0, hourly_domain: 0, daily_target: 0, hourly_target: 0 };
  const identities = new Set();
  let previousCanonical = null;
  for (const row of Array.isArray(rows) ? rows : []) {
    if (!row || !VALID_KINDS.has(row.kind)) return { ok: false, code: 'DEVICE_ACCOUNT_INVALID_KIND' };
    const allowedKeys = row.kind.endsWith('_domain') ? DOMAIN_ROW_KEYS : TARGET_ROW_KEYS;
    if (Object.keys(row).some((key) => !allowedKeys.has(key))) {
      return { ok: false, code: 'DEVICE_ACCOUNT_UNEXPECTED_FIELD' };
    }
    const hourly = row.kind.startsWith('hourly_');
    if (hourly ? !new RegExp(`^${date}T\\d{2}$`).test(row.periodKey) : row.periodKey !== date) {
      return { ok: false, code: 'DEVICE_ACCOUNT_INVALID_PERIOD' };
    }
    if (!VALID_CHANNELS.has(row.channel) || !VALID_MODES.has(row.mode)) {
      return { ok: false, code: 'DEVICE_ACCOUNT_INVALID_ROUTE' };
    }
    if (row.kind.endsWith('_target') && !VALID_MODES.has(row.quotaBucket)) {
      return { ok: false, code: 'DEVICE_ACCOUNT_INVALID_QUOTA_BUCKET' };
    }
    if (row.kind.endsWith('_domain') ? !row.domain : !row.targetKey) {
      return { ok: false, code: 'DEVICE_ACCOUNT_MISSING_SUBJECT' };
    }
    if (!Number.isSafeInteger(row.durationSeconds) || row.durationSeconds <= 0) {
      return { ok: false, code: 'DEVICE_ACCOUNT_INVALID_DURATION' };
    }
    const canonical = canonicalDeviceAccountJson(row);
    if (previousCanonical !== null && canonical.localeCompare(previousCanonical) < 0) {
      return { ok: false, code: 'DEVICE_ACCOUNT_ROWS_NOT_SORTED' };
    }
    previousCanonical = canonical;
    const identity = canonicalDeviceAccountJson({
      kind: row.kind,
      periodKey: row.periodKey,
      subject: row.kind.endsWith('_domain') ? row.domain : row.targetKey,
      channel: row.channel,
      mode: row.mode,
      quotaBucket: row.kind.endsWith('_target') ? row.quotaBucket : null,
    });
    if (identities.has(identity)) return { ok: false, code: 'DEVICE_ACCOUNT_DUPLICATE_ROW' };
    identities.add(identity);
    totals[row.kind] += row.durationSeconds;
  }
  const expected = totals.daily_domain;
  const conserved = !requireConservation || (
    totals.hourly_domain === expected && totals.daily_target === expected && totals.hourly_target === expected
  );
  return conserved
    ? { ok: true, totals, totalSeconds: expected }
    : { ok: false, code: 'DEVICE_ACCOUNT_NOT_CONSERVED', totals };
}

export async function buildDeviceAccountSnapshot(snapshot) {
  const rows = buildDeviceAccountRows(snapshot);
  const validation = validateDeviceAccountRows(rows, snapshot.date);
  if (!validation.ok) {
    const error = new Error(validation.code);
    error.code = validation.code;
    error.validation = validation;
    throw error;
  }
  const rawFacts = (snapshot.segmentPayloads || [])
    .filter((segment) => segment?.id && segment?.contentHash)
    .map((segment) => ({ id: segment.id, contentHash: segment.contentHash }))
    .sort((left, right) => left.id.localeCompare(right.id));
  const lossCount = normalizeCount(snapshot.compactedFactCount || 0);
  return {
    date: snapshot.date,
    capturedAt: Number(snapshot.capturedAt || Date.now()),
    rows,
    rowCount: rows.length,
    rawFactCount: rawFacts.length,
    rawFactHash: await hashDeviceAccountValue(rawFacts),
    statsHash: await hashDeviceAccountValue(rows),
    complete: lossCount === 0 && (validation.totalSeconds === 0 || rawFacts.length > 0),
    lossCount,
    totals: validation.totals,
  };
}

export async function splitDeviceAccountRows(rows, maxRows = DEVICE_ACCOUNT_V2_MAX_CHUNK_ROWS) {
  const chunks = [];
  const size = Math.min(DEVICE_ACCOUNT_V2_MAX_CHUNK_ROWS, Math.max(1, Math.trunc(maxRows || DEVICE_ACCOUNT_V2_MAX_CHUNK_ROWS)));
  for (let index = 0; index * size < rows.length; index++) {
    const chunkRows = rows.slice(index * size, (index + 1) * size);
    chunks.push({
      chunkIndex: index,
      rowCount: chunkRows.length,
      rows: chunkRows,
      chunkHash: await hashDeviceAccountValue(chunkRows),
    });
  }
  return chunks;
}

function trimState(byDate) {
  const dates = Object.keys(byDate || {}).sort().reverse();
  return Object.fromEntries(dates.slice(0, DEVICE_ACCOUNT_V2_MAX_LOCAL_DATES).map((date) => [date, byDate[date]]));
}

function stateFingerprint(account) {
  return [account.statsHash, account.rawFactHash, account.rawFactCount, Number(account.complete), account.lossCount].join(':');
}

async function buildManifest(account, revision, generatedAt) {
  const base = {
    schemaVersion: 2,
    date: account.date,
    revision,
    generatedAt,
    rowCount: account.rowCount,
    chunkCount: Math.ceil(account.rowCount / DEVICE_ACCOUNT_V2_MAX_CHUNK_ROWS),
    rawFactCount: account.rawFactCount,
    rawFactHash: account.rawFactHash,
    statsHash: account.statsHash,
    complete: account.complete,
    lossCount: account.lossCount,
  };
  return { ...base, manifestHash: await hashDeviceAccountValue(base) };
}

export async function prepareDeviceAccountV2Upload(snapshot) {
  let account = await buildDeviceAccountSnapshot(snapshot);
  return runStorageMutation(async (storage) => {
    const data = await storage.get(DEVICE_ACCOUNT_V2_STATE_KEY);
    const state = data[DEVICE_ACCOUNT_V2_STATE_KEY] || { schemaVersion: 1, byDate: {} };
    const previous = state.byDate?.[account.date] || null;
    if (account.rawFactCount === 0 && previous?.statsHash === account.statsHash && Number(previous.rawFactCount || 0) > 0) {
      account = {
        ...account,
        rawFactCount: previous.rawFactCount,
        rawFactHash: previous.rawFactHash,
        complete: previous.complete === true,
        lossCount: Number(previous.lossCount || 0),
      };
    }
    const fingerprint = stateFingerprint(account);
    const unchanged = previous?.fingerprint === fingerprint;
    const revision = unchanged ? previous.revision : Math.max(1, Number(previous?.revision || 0) + 1);
    const generatedAt = unchanged ? previous.generatedAt : account.capturedAt;
    const manifest = await buildManifest(account, revision, generatedAt);
    const chunks = await splitDeviceAccountRows(account.rows);
    const entry = {
      revision,
      generatedAt,
      fingerprint,
      manifestHash: manifest.manifestHash,
      statsHash: account.statsHash,
      rawFactHash: account.rawFactHash,
      rawFactCount: account.rawFactCount,
      rowCount: account.rowCount,
      complete: account.complete,
      lossCount: account.lossCount,
      status: unchanged ? (previous.status || 'pending') : 'pending',
      manifestId: unchanged ? (previous.manifestId || null) : null,
      lastAttemptAt: unchanged ? (previous.lastAttemptAt || null) : null,
      committedAt: unchanged ? (previous.committedAt || null) : null,
      publishedAt: unchanged ? (previous.publishedAt || null) : null,
      lastError: unchanged ? (previous.lastError || null) : null,
    };
    state.byDate = trimState({ ...(state.byDate || {}), [account.date]: entry });
    await storage.set({ [DEVICE_ACCOUNT_V2_STATE_KEY]: state }, { priority: 'sync', source: 'device_account_v2_prepare' });
    return { account, manifest, chunks, state: entry, skipped: entry.status === 'published' };
  }, { priority: 'sync', source: 'device_account_v2_prepare' });
}

async function updateDeviceAccountState(date, revision, manifestHash, patch, source) {
  return runStorageMutation(async (storage) => {
    const data = await storage.get(DEVICE_ACCOUNT_V2_STATE_KEY);
    const state = data[DEVICE_ACCOUNT_V2_STATE_KEY] || { schemaVersion: 1, byDate: {} };
    const entry = state.byDate?.[date];
    if (!entry || entry.revision !== revision || entry.manifestHash !== manifestHash) return false;
    state.byDate[date] = { ...entry, ...patch };
    state.byDate = trimState(state.byDate);
    await storage.set({ [DEVICE_ACCOUNT_V2_STATE_KEY]: state }, { priority: 'sync', source });
    return true;
  }, { priority: 'sync', source });
}

export function markDeviceAccountV2Manifest(date, revision, manifestHash, manifestId) {
  return updateDeviceAccountState(date, revision, manifestHash, {
    manifestId,
    status: 'uploading',
    lastAttemptAt: Date.now(),
    lastError: null,
  }, 'device_account_v2_manifest');
}

export function markDeviceAccountV2Committed(date, revision, manifestHash, committedAt = Date.now()) {
  return updateDeviceAccountState(date, revision, manifestHash, {
    status: 'publish_pending',
    committedAt,
    lastAttemptAt: committedAt,
    lastError: null,
  }, 'device_account_v2_committed');
}

export function markDeviceAccountV2Published(date, revision, manifestHash, publishedAt = Date.now()) {
  return updateDeviceAccountState(date, revision, manifestHash, {
    status: 'published',
    publishedAt,
    lastAttemptAt: publishedAt,
    lastError: null,
  }, 'device_account_v2_published');
}

export function markDeviceAccountV2Reconciliation(date, revision, manifestHash, status, checkedAt = Date.now()) {
  return updateDeviceAccountState(date, revision, manifestHash, {
    reconciliationStatus: String(status || 'manual_review_required').slice(0, 40),
    reconciliationCheckedAt: checkedAt,
  }, 'device_account_v2_reconciliation');
}

export function markDeviceAccountV2Failed(date, revision, manifestHash, errorCode) {
  return updateDeviceAccountState(date, revision, manifestHash, {
    status: 'pending',
    lastAttemptAt: Date.now(),
    lastError: String(errorCode || 'device_account_v2_failed').slice(0, 80),
  }, 'device_account_v2_failed');
}

export async function getPendingDeviceAccountV2Dates(minRetryAgeMs = 5 * 60 * 1000) {
  const data = await chrome.storage.local.get(DEVICE_ACCOUNT_V2_STATE_KEY);
  const byDate = data?.[DEVICE_ACCOUNT_V2_STATE_KEY]?.byDate || {};
  const retryBefore = Date.now() - Math.max(0, Number(minRetryAgeMs || 0));
  return Object.entries(byDate)
    .filter(([, entry]) => entry?.status !== 'published' && Number(entry?.lastAttemptAt || 0) <= retryBefore)
    .map(([date]) => date)
    .sort();
}

export async function getPendingDeviceAccountV2Reconciliations(minRetryAgeMs = 15 * 60 * 1000) {
  const data = await chrome.storage.local.get(DEVICE_ACCOUNT_V2_STATE_KEY);
  const byDate = data?.[DEVICE_ACCOUNT_V2_STATE_KEY]?.byDate || {};
  const retryBefore = Date.now() - Math.max(0, Number(minRetryAgeMs || 0));
  return Object.entries(byDate)
    .filter(([, entry]) => entry?.status === 'published' && entry?.reconciliationStatus !== 'matched' &&
      Number(entry?.reconciliationCheckedAt || 0) <= retryBefore)
    .map(([date, entry]) => ({ date, revision: entry.revision, manifestHash: entry.manifestHash }))
    .sort((left, right) => left.date.localeCompare(right.date));
}
