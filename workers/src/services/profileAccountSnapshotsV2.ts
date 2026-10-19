import { Env } from '../db/middleware';
import { canonicalDeviceAccountJson, hashDeviceAccountValue } from '../../../extension/core/device-account-v2.js';
import { getBeijingWeekPeriod } from '../../../extension/core/profile-account-v2.js';
import {
  listPublishedDeviceAccountsForWeek,
  readProfileWeekAccountV2,
} from './profileAccountsV2';
import {
  applyCorrectionsToCompactDeviceAccounts,
  listUsageAccountingCorrections,
  summarizeCompactDeviceAccounts,
} from './usageAccountingCorrections';

const SNAPSHOT_TTL_MS = 30 * 60 * 1000;
const SNAPSHOT_PAGE_SIZE = 50;

function add(map: Map<string, number>, key: string, seconds: number) {
  map.set(key, (map.get(key) || 0) + Number(seconds || 0));
}

export function compactDeviceAccount(account: any): any {
  const byChannelMode = new Map<string, number>();
  const byQuotaBucket = new Map<string, number>();
  const activeByQuotaBucket = new Map<string, number>();
  const activeByDomain = new Map<string, number>();
  let totalSeconds = 0;
  let activeSeconds = 0;
  for (const row of account.rows || []) {
    if (row.kind === 'daily_domain') {
      totalSeconds += Number(row.durationSeconds || 0);
      add(byChannelMode, `${row.channel}\u0000${row.mode}`, row.durationSeconds);
      if (row.channel === 'active') {
        activeSeconds += Number(row.durationSeconds || 0);
        add(activeByDomain, row.domain, row.durationSeconds);
      }
    } else if (row.kind === 'daily_target') {
      add(byQuotaBucket, row.quotaBucket, row.durationSeconds);
      if (row.channel === 'active') add(activeByQuotaBucket, row.quotaBucket, row.durationSeconds);
    }
  }
  return {
    date: account.date,
    deviceId: account.deviceId,
    manifestId: account.manifestId,
    revision: account.revision,
    statsHash: account.statsHash,
    rawFactHash: account.rawFactHash,
    rawFactCount: account.rawFactCount,
    complete: account.complete,
    lossCount: account.lossCount,
    generatedAt: account.generatedAt,
    committedAt: account.committedAt,
    total: {
      totalSeconds,
      byChannelMode: [...byChannelMode.entries()].map(([key, durationSeconds]) => {
        const [channel, mode] = key.split('\u0000');
        return { channel, mode, durationSeconds };
      }).sort((a, b) => canonicalDeviceAccountJson(a).localeCompare(canonicalDeviceAccountJson(b))),
      byQuotaBucket: [...byQuotaBucket.entries()].map(([quotaBucket, durationSeconds]) => ({ quotaBucket, durationSeconds }))
        .sort((a, b) => a.quotaBucket.localeCompare(b.quotaBucket)),
    },
    quotaProjection: {
      activeSeconds,
      byQuotaBucket: [...activeByQuotaBucket.entries()]
        .map(([quotaBucket, durationSeconds]) => ({ quotaBucket, durationSeconds }))
        .sort((a, b) => a.quotaBucket.localeCompare(b.quotaBucket)),
      byDomain: [...activeByDomain.entries()]
        .map(([domain, durationSeconds]) => ({ domain, durationSeconds }))
        .sort((a, b) => a.domain.localeCompare(b.domain)),
    },
  };
}

function startOfBeijingDateMs(date: string): number {
  return Date.parse(`${date}T00:00:00+08:00`);
}

async function readDeviceCompleteness(env: Env, profileId: string, weekStart: string, accounts: any[]): Promise<any> {
  try {
    const result = await env.DB.prepare(
      `SELECT d.id, d.last_seen, c.capability_version
         FROM devices d
         LEFT JOIN device_account_capabilities_v2 c
           ON c.profile_id = d.profile_id AND c.device_id = d.id
        WHERE d.profile_id = ?
          AND COALESCE(d.status, 'bound') = 'bound'
          AND COALESCE(d.monitoring_enabled, 1) != 0
          AND COALESCE(d.last_seen, 0) >= ?
        ORDER BY d.id ASC`
    ).bind(profileId, startOfBeijingDateMs(weekStart)).all<any>();
    const staleBefore = Date.now() - 24 * 60 * 60 * 1000;
    const expectedDevices = (result.results || []).map((device) => device.id);
    const publishedDevices = new Set((accounts || []).map((account) => account.deviceId));
    const incompatibleDevices = (result.results || [])
      .filter((device) => Number(device.capability_version || 0) < 2)
      .map((device) => device.id);
    const capableDevices = new Set((result.results || [])
      .filter((device) => Number(device.capability_version || 0) >= 2)
      .map((device) => device.id));
    return {
      inventoryAvailable: true,
      expectedDevices,
      incompatibleDevices,
      missingDevices: expectedDevices.filter((id) => capableDevices.has(id) && !publishedDevices.has(id)),
      staleDevices: (result.results || [])
        .filter((device) => Number(device.last_seen || 0) < staleBefore)
        .map((device) => device.id),
    };
  } catch (_) {
    return { inventoryAvailable: false, expectedDevices: [], missingDevices: [], incompatibleDevices: [], staleDevices: [] };
  }
}

async function readSnapshotRow(env: Env, snapshotId: string, profileId: string): Promise<any | null> {
  return env.DB.prepare(
    `SELECT id, profile_id, week_start, week_end, source_generation_id, source_generation,
            as_of, page_count, total_hash, snapshot_hash, metadata_json, created_at, expires_at, correction_version
       FROM profile_account_read_snapshots_v2 WHERE id = ? AND profile_id = ?`
  ).bind(snapshotId, profileId).first<any>();
}

/** 回退的是整份已存快照，不修改元数据/hash/期限，也不从不同快照拼页。 */
async function readVerifiedSnapshot(env: Env, id: string, profileId: string, weekStart: string, correctionVersion: number) {
  const row = await readSnapshotRow(env, id, profileId);
  if (!row || row.week_start !== weekStart || Number(row.correction_version) !== correctionVersion
    || Number(row.expires_at) <= Date.now() || !Number.isSafeInteger(Number(row.page_count)) || Number(row.page_count) < 1) return null;
  const metadata = JSON.parse(row.metadata_json);
  if (metadata.period?.weekStart !== weekStart || metadata.period?.weekEnd !== row.week_end
    || metadata.pageCount !== Number(row.page_count) || metadata.sourceGeneration !== Number(row.source_generation)
    || metadata.totalHash !== row.total_hash || !Array.isArray(metadata.pageHashes)
    || metadata.pageHashes.length !== metadata.pageCount || await hashDeviceAccountValue(metadata) !== row.snapshot_hash) return null;
  const pages = await env.DB.prepare(`SELECT page_index, item_count, page_hash, payload_json
    FROM profile_account_read_snapshot_pages_v2 WHERE snapshot_id = ? ORDER BY page_index ASC`).bind(id)
    .all<{ page_index: number; item_count: number; page_hash: string; payload_json: string }>();
  if (pages.results.length !== metadata.pageCount) return null;
  for (const [index, page] of pages.results.entries()) {
    const payload = JSON.parse(page.payload_json);
    if (Number(page.page_index) !== index || payload.page !== index || !Array.isArray(payload.deviceAccounts)
      || payload.deviceAccounts.length !== Number(page.item_count) || page.page_hash !== metadata.pageHashes[index]
      || await hashDeviceAccountValue(payload) !== page.page_hash) return null;
  }
  return row;
}

export async function createOrReuseProfileAccountSnapshotV2(env: Env, profileId: string, weekStart: string): Promise<any | null> {
  const period = getBeijingWeekPeriod(weekStart);
  if (period.weekStart !== weekStart) throw new Error('PROFILE_ACCOUNT_WEEK_START_MUST_BE_MONDAY');
  const head = await env.DB.prepare(
    `SELECT generation_id, generation FROM profile_account_week_heads_v2
      WHERE profile_id = ? AND week_start = ?`
  ).bind(profileId, weekStart).first<any>();
  if (!head) return null;
  const now = Date.now();
  const corrections = await listUsageAccountingCorrections(env, profileId, {
    from: period.weekStart,
    to: period.weekEnd,
  });
  const correctionVersion = corrections.reduce((latest, row) => Math.max(latest, row.createdAt), 0);
  // 通用更正读取器的旧容错可能返回[]；快照回退不能据此误认更正版本为0。
  const correctionHead = await env.DB.prepare(`SELECT COUNT(*) AS count, COALESCE(MAX(created_at), 0) AS version
    FROM usage_segment_corrections_v1 WHERE profile_id = ? AND date >= ? AND date <= ?`)
    .bind(profileId, period.weekStart, period.weekEnd).first<{count: number; version: number}>();
  if (!correctionHead || Number(correctionHead.count) !== corrections.length || Number(correctionHead.version) !== correctionVersion)
    throw new Error('PROFILE_ACCOUNT_CORRECTIONS_UNAVAILABLE');
  const reusable = await env.DB.prepare(
    `SELECT id FROM profile_account_read_snapshots_v2
      WHERE profile_id = ? AND week_start = ? AND source_generation_id = ?
        AND correction_version = ? AND expires_at > ?
      ORDER BY created_at DESC LIMIT 1`
  ).bind(profileId, weekStart, head.generation_id, correctionVersion, now).first<any>();
  if (reusable) {
    try { const valid = await readVerifiedSnapshot(env, reusable.id, profileId, weekStart, correctionVersion); if (valid) return valid; }
    catch { console.warn('PROFILE_ACCOUNT_SNAPSHOT_REUSE_FAILED'); }
  }

  try {
  const week = await readProfileWeekAccountV2(env, head.generation_id);
  if (!week) throw new Error('PROFILE_ACCOUNT_WEEK_HEAD_MISSING');
  if (week.profileId !== profileId || week.weekStart !== weekStart) throw new Error('PROFILE_ACCOUNT_SOURCE_SCOPE_MISMATCH');
  if (await hashDeviceAccountValue({schemaVersion: 2, profileId: week.profileId, weekStart: week.weekStart,
    weekEnd: week.weekEnd, generation: week.generation, asOf: week.asOf, dayVersionVector: week.dayVersionVector,
    deviceVersionVector: week.deviceVersionVector, profileTotal: week.profileTotal, complete: week.complete,
    incompleteDevices: week.incompleteDevices}) !== week.totalHash) throw new Error('PROFILE_ACCOUNT_WEEK_HASH_MISMATCH');
  const baseAccounts = (await listPublishedDeviceAccountsForWeek(env, profileId, weekStart,
    week.deviceVersionVector)).map(compactDeviceAccount);
  const accounts = applyCorrectionsToCompactDeviceAccounts(baseAccounts, corrections);
  const profileTotal = summarizeCompactDeviceAccounts(accounts);
  const totalHash = corrections.length > 0
    ? await hashDeviceAccountValue({ sourceTotalHash: week.totalHash, correctionIds: corrections.map((row) => row.id).sort(), profileTotal })
    : week.totalHash;
  const pages = [];
  for (let index = 0; index * SNAPSHOT_PAGE_SIZE < accounts.length; index++) {
    const deviceAccounts = accounts.slice(index * SNAPSHOT_PAGE_SIZE, (index + 1) * SNAPSHOT_PAGE_SIZE);
    const payload = { page: index, deviceAccounts };
    pages.push({ payload, pageHash: await hashDeviceAccountValue(payload) });
  }
  if (pages.length === 0) {
    const payload = { page: 0, deviceAccounts: [] };
    pages.push({ payload, pageHash: await hashDeviceAccountValue(payload) });
  }
  const deviceCompleteness = await readDeviceCompleteness(env, profileId, period.weekStart, accounts);
  const incompleteDevices = [...new Set([...(week.incompleteDevices || []), ...deviceCompleteness.missingDevices])].sort();
  const metadata = {
    schemaVersion: 2,
    period,
    sourceGeneration: week.generation,
    asOf: week.asOf,
    dayVersionVector: week.dayVersionVector,
    deviceVersionVector: week.deviceVersionVector,
    profileTotal,
    completeness: {
      complete: week.complete && deviceCompleteness.inventoryAvailable === true && deviceCompleteness.missingDevices.length === 0 && deviceCompleteness.incompatibleDevices.length === 0,
      ...deviceCompleteness,
      incompleteDevices,
    },
    totalHash,
    pageCount: pages.length,
    pageHashes: pages.map((page) => page.pageHash),
  };
  const snapshotHash = await hashDeviceAccountValue(metadata);
  const snapshotId = crypto.randomUUID();
  const expiresAt = now + SNAPSHOT_TTL_MS;
  const statements: D1PreparedStatement[] = [
    env.DB.prepare(
      `INSERT INTO profile_account_read_snapshots_v2
        (id, profile_id, week_start, week_end, source_generation_id, source_generation,
         correction_version, as_of, page_count, total_hash, snapshot_hash, metadata_json, created_at, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      snapshotId, profileId, period.weekStart, period.weekEnd, head.generation_id,
      week.generation, correctionVersion, week.asOf, pages.length, totalHash, snapshotHash,
      canonicalDeviceAccountJson(metadata), now, expiresAt
    ),
    ...pages.map((page, index) => env.DB.prepare(
      `INSERT INTO profile_account_read_snapshot_pages_v2
        (snapshot_id, page_index, item_count, page_hash, payload_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).bind(snapshotId, index, page.payload.deviceAccounts.length, page.pageHash, canonicalDeviceAccountJson(page.payload), now)),
  ];
  await env.DB.batch(statements);
  try { await env.DB.batch([
    env.DB.prepare(
      `DELETE FROM profile_account_read_snapshot_pages_v2 WHERE snapshot_id IN (
         SELECT id FROM profile_account_read_snapshots_v2 WHERE expires_at <= ?
       )`
    ).bind(now),
    env.DB.prepare(`DELETE FROM profile_account_read_snapshots_v2 WHERE expires_at <= ?`).bind(now),
  ]); } catch { console.warn('PROFILE_ACCOUNT_SNAPSHOT_CLEANUP_FAILED'); }
  return readSnapshotRow(env, snapshotId, profileId);
  } catch (error) {
    if (error instanceof Error && error.message === 'PROFILE_ACCOUNT_SOURCE_SCOPE_MISMATCH') throw error;
    // 更正版本已经成功读取；无法确定更正版本时不会进入这个回退分支。
    const previous = await env.DB.prepare(`SELECT id FROM profile_account_read_snapshots_v2
      WHERE profile_id = ? AND week_start = ? AND correction_version = ? AND expires_at > ?
      ORDER BY source_generation DESC, created_at DESC LIMIT 8`)
      .bind(profileId, weekStart, correctionVersion, Date.now()).all<{ id: string }>();
    for (const row of previous.results) {
      try {
        const valid = await readVerifiedSnapshot(env, row.id, profileId, weekStart, correctionVersion);
        if (valid) { console.warn('PROFILE_ACCOUNT_SNAPSHOT_FALLBACK'); return valid; }
      } catch { /* 无法完整核验的快照不能备用。 */ }
    }
    throw error;
  }
}

export async function readProfileAccountSnapshotPageV2(
  env: Env, profileId: string, snapshotId: string, pageIndex: number
): Promise<any | null> {
  const snapshot = await readSnapshotRow(env, snapshotId, profileId);
  if (!snapshot || Number(snapshot.expires_at) <= Date.now()) return null;
  if (!Number.isSafeInteger(pageIndex) || pageIndex < 0 || pageIndex >= Number(snapshot.page_count)) {
    throw new Error('PROFILE_ACCOUNT_SNAPSHOT_PAGE_OUT_OF_RANGE');
  }
  const page = await env.DB.prepare(
    `SELECT page_index, item_count, page_hash, payload_json
       FROM profile_account_read_snapshot_pages_v2 WHERE snapshot_id = ? AND page_index = ?`
  ).bind(snapshotId, pageIndex).first<any>();
  if (!page) throw new Error('PROFILE_ACCOUNT_SNAPSHOT_PAGE_MISSING');
  const payload = JSON.parse(page.payload_json);
  if (await hashDeviceAccountValue(payload) !== page.page_hash) throw new Error('PROFILE_ACCOUNT_SNAPSHOT_PAGE_HASH_MISMATCH');
  return {
    snapshotId: snapshot.id,
    snapshotHash: snapshot.snapshot_hash,
    createdAt: Number(snapshot.created_at),
    expiresAt: Number(snapshot.expires_at),
    ...JSON.parse(snapshot.metadata_json),
    page: pageIndex,
    deviceAccounts: payload.deviceAccounts,
    pageHash: page.page_hash,
  };
}
