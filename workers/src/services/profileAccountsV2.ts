import { Env } from '../db/middleware';
import {
  canonicalDeviceAccountJson,
  hashDeviceAccountValue,
  splitDeviceAccountRows,
  validateDeviceAccountRows,
} from '../../../extension/core/device-account-v2.js';
import {
  buildProfileDayAccount,
  buildProfileWeekAccount,
  getBeijingWeekPeriod,
} from '../../../extension/core/profile-account-v2.js';

export type DeviceAccountManifestV2 = {
  manifestId: string;
  profileId: string;
  deviceId: string;
  date: string;
  revision: number;
  generatedAt: number;
  rawFactCount: number;
  rawFactHash: string;
  statsHash: string;
  complete: boolean;
  lossCount: number;
  committedAt: number;
  rows: any[];
};

function parseArray(value: string | null): any[] {
  if (!value) return [];
  const parsed = JSON.parse(value);
  if (!Array.isArray(parsed)) throw new Error('PROFILE_ACCOUNT_INVALID_STORED_JSON');
  return parsed;
}

async function readManifestRow(env: Env, manifestId: string): Promise<any | null> {
  return env.DB.prepare(
    `SELECT id, profile_id, device_id, date, revision, generated_at, row_count, chunk_count,
            raw_fact_count, raw_fact_hash, stats_hash, complete, loss_count, status, committed_at
       FROM device_account_manifests_v2 WHERE id = ?`
  ).bind(manifestId).first<any>();
}

export async function readManifestAccountV2(env: Env, manifestId: string): Promise<DeviceAccountManifestV2 | null> {
  const manifest = await readManifestRow(env, manifestId);
  if (!manifest || manifest.status !== 'committed' || !manifest.committed_at) return null;
  const result = await env.DB.prepare(
    `SELECT chunk_index, row_count, chunk_hash, payload_json
       FROM device_account_chunks_v2 WHERE manifest_id = ? ORDER BY chunk_index ASC`
  ).bind(manifestId).all<any>();
  const chunks = result.results || [];
  if (chunks.length !== Number(manifest.chunk_count)) throw new Error('PROFILE_ACCOUNT_MISSING_DEVICE_CHUNKS');
  const rows: any[] = [];
  for (let index = 0; index < chunks.length; index++) {
    const chunk = chunks[index];
    if (Number(chunk.chunk_index) !== index) throw new Error('PROFILE_ACCOUNT_NON_CONTIGUOUS_DEVICE_CHUNKS');
    const parsed = parseArray(chunk.payload_json);
    if (parsed.length !== Number(chunk.row_count) || await hashDeviceAccountValue(parsed) !== chunk.chunk_hash) {
      throw new Error('PROFILE_ACCOUNT_DEVICE_CHUNK_MISMATCH');
    }
    rows.push(...parsed);
  }
  if (rows.length !== Number(manifest.row_count) || await hashDeviceAccountValue(rows) !== manifest.stats_hash) {
    throw new Error('PROFILE_ACCOUNT_DEVICE_STATS_MISMATCH');
  }
  const validation = validateDeviceAccountRows(rows, manifest.date);
  if (!validation.ok) throw new Error(validation.code);
  return {
    manifestId: manifest.id,
    profileId: manifest.profile_id,
    deviceId: manifest.device_id,
    date: manifest.date,
    revision: Number(manifest.revision),
    generatedAt: Number(manifest.generated_at),
    rawFactCount: Number(manifest.raw_fact_count),
    rawFactHash: manifest.raw_fact_hash,
    statsHash: manifest.stats_hash,
    complete: Number(manifest.complete) === 1,
    lossCount: Number(manifest.loss_count || 0),
    committedAt: Number(manifest.committed_at),
    rows,
  };
}

async function readDeviceHeadsForDate(env: Env, profileId: string, date: string): Promise<any[]> {
  const result = await env.DB.prepare(
    `SELECT device_id, manifest_id, revision FROM device_account_heads_v2
      WHERE profile_id = ? AND date = ? ORDER BY device_id ASC`
  ).bind(profileId, date).all<any>();
  return result.results || [];
}

export async function readProfileDayAccountV2(env: Env, generationId: string): Promise<any | null> {
  const row = await env.DB.prepare(
    `SELECT id, profile_id, date, week_start, generation, as_of, device_version_vector_json,
            row_count, chunk_count, rows_hash, total_seconds, total_hash, complete,
            incomplete_devices_json, created_at
       FROM profile_account_day_generations_v2 WHERE id = ?`
  ).bind(generationId).first<any>();
  if (!row) return null;
  const result = await env.DB.prepare(
    `SELECT chunk_index, row_count, chunk_hash, payload_json
       FROM profile_account_day_chunks_v2 WHERE generation_id = ? ORDER BY chunk_index ASC`
  ).bind(generationId).all<any>();
  const chunks = result.results || [];
  if (chunks.length !== Number(row.chunk_count)) throw new Error('PROFILE_ACCOUNT_MISSING_DAY_CHUNKS');
  const rows: any[] = [];
  for (let index = 0; index < chunks.length; index++) {
    const chunk = chunks[index];
    if (Number(chunk.chunk_index) !== index) throw new Error('PROFILE_ACCOUNT_NON_CONTIGUOUS_DAY_CHUNKS');
    const parsed = parseArray(chunk.payload_json);
    if (parsed.length !== Number(chunk.row_count) || await hashDeviceAccountValue(parsed) !== chunk.chunk_hash) {
      throw new Error('PROFILE_ACCOUNT_DAY_CHUNK_MISMATCH');
    }
    rows.push(...parsed);
  }
  if (rows.length !== Number(row.row_count) || await hashDeviceAccountValue(rows) !== row.rows_hash) {
    throw new Error('PROFILE_ACCOUNT_DAY_ROWS_MISMATCH');
  }
  return {
    id: row.id,
    profileId: row.profile_id,
    date: row.date,
    weekStart: row.week_start,
    generation: Number(row.generation),
    asOf: Number(row.as_of),
    deviceVersionVector: parseArray(row.device_version_vector_json),
    rows,
    totalSeconds: Number(row.total_seconds),
    totalHash: row.total_hash,
    complete: Number(row.complete) === 1,
    incompleteDevices: parseArray(row.incomplete_devices_json),
    createdAt: Number(row.created_at),
  };
}

export async function readProfileWeekAccountV2(env: Env, generationId: string): Promise<any | null> {
  const row = await env.DB.prepare(
    `SELECT id, profile_id, week_start, week_end, generation, as_of, day_version_vector_json,
            device_version_vector_json, profile_total_json, total_hash, complete,
            incomplete_devices_json, created_at
       FROM profile_account_week_generations_v2 WHERE id = ?`
  ).bind(generationId).first<any>();
  if (!row) return null;
  return {
    id: row.id,
    profileId: row.profile_id,
    weekStart: row.week_start,
    weekEnd: row.week_end,
    generation: Number(row.generation),
    asOf: Number(row.as_of),
    dayVersionVector: parseArray(row.day_version_vector_json),
    deviceVersionVector: parseArray(row.device_version_vector_json),
    profileTotal: JSON.parse(row.profile_total_json),
    totalHash: row.total_hash,
    complete: Number(row.complete) === 1,
    incompleteDevices: parseArray(row.incomplete_devices_json),
    createdAt: Number(row.created_at),
  };
}

async function readDayHeadsForWeek(env: Env, profileId: string, weekStart: string, replacingDay: any): Promise<any[]> {
  const { weekEnd } = getBeijingWeekPeriod(weekStart);
  const result = await env.DB.prepare(
    `SELECT date, generation_id FROM profile_account_day_heads_v2
      WHERE profile_id = ? AND date >= ? AND date <= ? ORDER BY date ASC`
  ).bind(profileId, weekStart, weekEnd).all<any>();
  const days = [];
  let replaced = false;
  for (const head of result.results || []) {
    if (head.date === replacingDay.date) {
      days.push(replacingDay);
      replaced = true;
    } else {
      const day = await readProfileDayAccountV2(env, head.generation_id);
      if (!day) throw new Error('PROFILE_ACCOUNT_DAY_HEAD_MISSING');
      days.push(day);
    }
  }
  if (!replaced) days.push(replacingDay);
  return days.sort((left, right) => left.date.localeCompare(right.date));
}

export async function getDeviceAccountPublishedRevision(
  env: Env, profileId: string, deviceId: string, date: string
): Promise<{ revision: number; manifestId: string; publishedAt: number } | null> {
  const row = await env.DB.prepare(
    `SELECT revision, manifest_id, published_at FROM device_account_heads_v2
      WHERE profile_id = ? AND device_id = ? AND date = ?`
  ).bind(profileId, deviceId, date).first<any>();
  return row ? { revision: Number(row.revision), manifestId: row.manifest_id, publishedAt: Number(row.published_at) } : null;
}

export async function publishCommittedDeviceAccountV2(
  env: Env, manifestId: string, profileId: string, deviceId: string
): Promise<any> {
  const candidate = await readManifestAccountV2(env, manifestId);
  if (!candidate || candidate.profileId !== profileId || candidate.deviceId !== deviceId) {
    throw new Error('PROFILE_ACCOUNT_DEVICE_MANIFEST_NOT_COMMITTED');
  }
  const existingHead = await getDeviceAccountPublishedRevision(env, profileId, deviceId, candidate.date);
  if (existingHead && existingHead.revision >= candidate.revision) {
    return {
      published: true,
      stale: existingHead.revision > candidate.revision,
      publishedRevision: existingHead.revision,
      publishedAt: existingHead.publishedAt,
    };
  }

  const headRows = await readDeviceHeadsForDate(env, profileId, candidate.date);
  const manifests: DeviceAccountManifestV2[] = [];
  let candidateAdded = false;
  for (const head of headRows) {
    if (head.device_id === deviceId) {
      manifests.push(candidate);
      candidateAdded = true;
    } else {
      const account = await readManifestAccountV2(env, head.manifest_id);
      if (!account) throw new Error('PROFILE_ACCOUNT_DEVICE_HEAD_MISSING');
      manifests.push(account);
    }
  }
  if (!candidateAdded) manifests.push(candidate);
  manifests.sort((left, right) => left.deviceId.localeCompare(right.deviceId));

  const currentDayHead = await env.DB.prepare(
    `SELECT generation FROM profile_account_day_heads_v2 WHERE profile_id = ? AND date = ?`
  ).bind(profileId, candidate.date).first<any>();
  const dayGeneration = Number(currentDayHead?.generation || 0) + 1;
  const dayAccount = await buildProfileDayAccount({ profileId, date: candidate.date, generation: dayGeneration, manifests });
  const { weekStart } = getBeijingWeekPeriod(candidate.date);
  const dayAccounts = await readDayHeadsForWeek(env, profileId, weekStart, dayAccount);
  const currentWeekHead = await env.DB.prepare(
    `SELECT generation FROM profile_account_week_heads_v2 WHERE profile_id = ? AND week_start = ?`
  ).bind(profileId, weekStart).first<any>();
  const weekGeneration = Number(currentWeekHead?.generation || 0) + 1;
  const weekAccount = await buildProfileWeekAccount({ profileId, weekStart, generation: weekGeneration, dayAccounts });
  const now = Date.now();
  const dayGenerationId = crypto.randomUUID();
  const weekGenerationId = crypto.randomUUID();
  const eventId = crypto.randomUUID();
  const dayChunks = await splitDeviceAccountRows(dayAccount.rows);

  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO profile_account_day_generations_v2
        (id, profile_id, date, week_start, generation, as_of, device_count,
         device_version_vector_json, row_count, chunk_count, rows_hash, total_seconds,
         total_hash, complete, incomplete_devices_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      dayGenerationId, profileId, candidate.date, weekStart, dayGeneration, dayAccount.asOf,
      dayAccount.deviceVersionVector.length, canonicalDeviceAccountJson(dayAccount.deviceVersionVector),
      dayAccount.rows.length, dayChunks.length, await hashDeviceAccountValue(dayAccount.rows),
      dayAccount.totalSeconds, dayAccount.totalHash,
      dayAccount.complete ? 1 : 0, canonicalDeviceAccountJson(dayAccount.incompleteDevices), now
    ),
    ...dayChunks.map((chunk) => env.DB.prepare(
      `INSERT INTO profile_account_day_chunks_v2
        (generation_id, chunk_index, row_count, chunk_hash, payload_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).bind(
      dayGenerationId, chunk.chunkIndex, chunk.rowCount, chunk.chunkHash,
      canonicalDeviceAccountJson(chunk.rows), now
    )),
    env.DB.prepare(
      `INSERT INTO profile_account_week_generations_v2
        (id, profile_id, week_start, week_end, generation, as_of, day_version_vector_json,
         device_version_vector_json, profile_total_json, total_hash, complete,
         incomplete_devices_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      weekGenerationId, profileId, weekAccount.weekStart, weekAccount.weekEnd, weekGeneration,
      weekAccount.asOf, canonicalDeviceAccountJson(weekAccount.dayVersionVector),
      canonicalDeviceAccountJson(weekAccount.deviceVersionVector), canonicalDeviceAccountJson(weekAccount.profileTotal),
      weekAccount.totalHash, weekAccount.complete ? 1 : 0,
      canonicalDeviceAccountJson(weekAccount.incompleteDevices), now
    ),
    env.DB.prepare(
      `INSERT INTO device_account_heads_v2
        (profile_id, device_id, date, manifest_id, revision, stats_hash, raw_fact_hash,
         complete, loss_count, generated_at, committed_at, published_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(profile_id, device_id, date) DO UPDATE SET
         manifest_id = excluded.manifest_id, revision = excluded.revision,
         stats_hash = excluded.stats_hash, raw_fact_hash = excluded.raw_fact_hash,
         complete = excluded.complete, loss_count = excluded.loss_count,
         generated_at = excluded.generated_at, committed_at = excluded.committed_at,
         published_at = excluded.published_at
       WHERE excluded.revision > device_account_heads_v2.revision`
    ).bind(
      profileId, deviceId, candidate.date, candidate.manifestId, candidate.revision,
      candidate.statsHash, candidate.rawFactHash, candidate.complete ? 1 : 0, candidate.lossCount,
      candidate.generatedAt, candidate.committedAt, now
    ),
    env.DB.prepare(
      `INSERT INTO profile_account_day_heads_v2
        (profile_id, date, generation_id, generation, total_hash, complete, as_of, published_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(profile_id, date) DO UPDATE SET
         generation_id = excluded.generation_id, generation = excluded.generation,
         total_hash = excluded.total_hash, complete = excluded.complete,
         as_of = excluded.as_of, published_at = excluded.published_at`
    ).bind(profileId, candidate.date, dayGenerationId, dayGeneration, dayAccount.totalHash, dayAccount.complete ? 1 : 0, dayAccount.asOf, now),
    env.DB.prepare(
      `INSERT INTO profile_account_week_heads_v2
        (profile_id, week_start, generation_id, generation, total_hash, complete, as_of, published_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(profile_id, week_start) DO UPDATE SET
         generation_id = excluded.generation_id, generation = excluded.generation,
         total_hash = excluded.total_hash, complete = excluded.complete,
         as_of = excluded.as_of, published_at = excluded.published_at`
    ).bind(profileId, weekStart, weekGenerationId, weekGeneration, weekAccount.totalHash, weekAccount.complete ? 1 : 0, weekAccount.asOf, now),
    env.DB.prepare(
      `INSERT INTO profile_account_publication_events_v2
        (id, profile_id, device_id, date, revision, manifest_id, day_generation,
         week_generation, event_code, error_code, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'published', NULL, ?)`
    ).bind(eventId, profileId, deviceId, candidate.date, candidate.revision, candidate.manifestId, dayGeneration, weekGeneration, now),
    env.DB.prepare(
      `DELETE FROM profile_account_publication_events_v2 WHERE id IN (
         SELECT id FROM profile_account_publication_events_v2 WHERE profile_id = ?
          ORDER BY created_at DESC LIMIT -1 OFFSET 200
       )`
    ).bind(profileId),
  ]);

  return {
    published: true,
    publishedRevision: candidate.revision,
    publishedAt: now,
    dayGeneration,
    dayTotalHash: dayAccount.totalHash,
    weekGeneration,
    weekTotalHash: weekAccount.totalHash,
  };
}

export async function listPublishedDeviceAccountsForWeek(env: Env, profileId: string, weekStart: string): Promise<DeviceAccountManifestV2[]> {
  const { weekEnd } = getBeijingWeekPeriod(weekStart);
  const result = await env.DB.prepare(
    `SELECT manifest_id FROM device_account_heads_v2
      WHERE profile_id = ? AND date >= ? AND date <= ? ORDER BY date ASC, device_id ASC`
  ).bind(profileId, weekStart, weekEnd).all<any>();
  const accounts: DeviceAccountManifestV2[] = [];
  for (const row of result.results || []) {
    const account = await readManifestAccountV2(env, row.manifest_id);
    if (!account) throw new Error('PROFILE_ACCOUNT_DEVICE_HEAD_MISSING');
    accounts.push(account);
  }
  return accounts;
}
