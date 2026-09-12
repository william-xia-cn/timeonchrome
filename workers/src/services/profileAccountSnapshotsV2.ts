import { Env } from '../db/middleware';
import { canonicalDeviceAccountJson, hashDeviceAccountValue } from '../../../extension/core/device-account-v2.js';
import { getBeijingWeekPeriod } from '../../../extension/core/profile-account-v2.js';
import {
  listPublishedDeviceAccountsForWeek,
  readProfileWeekAccountV2,
} from './profileAccountsV2';

const SNAPSHOT_TTL_MS = 30 * 60 * 1000;
const SNAPSHOT_PAGE_SIZE = 50;

function add(map: Map<string, number>, key: string, seconds: number) {
  map.set(key, (map.get(key) || 0) + Number(seconds || 0));
}

function compactDeviceAccount(account: any): any {
  const byChannelMode = new Map<string, number>();
  const byQuotaBucket = new Map<string, number>();
  let totalSeconds = 0;
  for (const row of account.rows || []) {
    if (row.kind === 'daily_domain') {
      totalSeconds += Number(row.durationSeconds || 0);
      add(byChannelMode, `${row.channel}\u0000${row.mode}`, row.durationSeconds);
    } else if (row.kind === 'daily_target') {
      add(byQuotaBucket, row.quotaBucket, row.durationSeconds);
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
  };
}

async function readStaleDevices(env: Env, profileId: string): Promise<string[]> {
  try {
    const result = await env.DB.prepare(
      `SELECT id, last_seen FROM devices
        WHERE profile_id = ? AND COALESCE(status, 'bound') = 'bound' ORDER BY id ASC`
    ).bind(profileId).all<any>();
    const staleBefore = Date.now() - 24 * 60 * 60 * 1000;
    return (result.results || [])
      .filter((device) => Number(device.last_seen || 0) < staleBefore)
      .map((device) => device.id);
  } catch (_) {
    return [];
  }
}

async function readSnapshotRow(env: Env, snapshotId: string, profileId: string): Promise<any | null> {
  return env.DB.prepare(
    `SELECT id, profile_id, week_start, week_end, source_generation_id, source_generation,
            as_of, page_count, total_hash, snapshot_hash, metadata_json, created_at, expires_at
       FROM profile_account_read_snapshots_v2 WHERE id = ? AND profile_id = ?`
  ).bind(snapshotId, profileId).first<any>();
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
  const reusable = await env.DB.prepare(
    `SELECT id FROM profile_account_read_snapshots_v2
      WHERE profile_id = ? AND week_start = ? AND source_generation_id = ? AND expires_at > ?
      ORDER BY created_at DESC LIMIT 1`
  ).bind(profileId, weekStart, head.generation_id, now).first<any>();
  if (reusable) return readSnapshotRow(env, reusable.id, profileId);

  const week = await readProfileWeekAccountV2(env, head.generation_id);
  if (!week) throw new Error('PROFILE_ACCOUNT_WEEK_HEAD_MISSING');
  const accounts = (await listPublishedDeviceAccountsForWeek(env, profileId, weekStart)).map(compactDeviceAccount);
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
  const staleDevices = await readStaleDevices(env, profileId);
  const metadata = {
    schemaVersion: 2,
    period,
    sourceGeneration: week.generation,
    asOf: week.asOf,
    dayVersionVector: week.dayVersionVector,
    deviceVersionVector: week.deviceVersionVector,
    profileTotal: week.profileTotal,
    completeness: {
      complete: week.complete,
      staleDevices,
      incompleteDevices: week.incompleteDevices,
    },
    totalHash: week.totalHash,
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
         as_of, page_count, total_hash, snapshot_hash, metadata_json, created_at, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      snapshotId, profileId, period.weekStart, period.weekEnd, head.generation_id,
      week.generation, week.asOf, pages.length, week.totalHash, snapshotHash,
      canonicalDeviceAccountJson(metadata), now, expiresAt
    ),
    ...pages.map((page, index) => env.DB.prepare(
      `INSERT INTO profile_account_read_snapshot_pages_v2
        (snapshot_id, page_index, item_count, page_hash, payload_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).bind(snapshotId, index, page.payload.deviceAccounts.length, page.pageHash, canonicalDeviceAccountJson(page.payload), now)),
    env.DB.prepare(
      `DELETE FROM profile_account_read_snapshot_pages_v2 WHERE snapshot_id IN (
         SELECT id FROM profile_account_read_snapshots_v2 WHERE expires_at <= ?
       )`
    ).bind(now),
    env.DB.prepare(`DELETE FROM profile_account_read_snapshots_v2 WHERE expires_at <= ?`).bind(now),
  ];
  await env.DB.batch(statements);
  return readSnapshotRow(env, snapshotId, profileId);
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
