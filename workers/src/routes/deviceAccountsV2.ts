import { json, Env } from '../db/middleware';
import { deviceUnboundResponse, verifyDeviceTokenFromRequest } from './deviceIdentity';
import {
  DEVICE_ACCOUNT_V2_MAX_CHUNK_ROWS,
  canonicalDeviceAccountJson,
  hashDeviceAccountValue,
  validateDeviceAccountRows,
} from '../../../extension/core/device-account-v2.js';
import {
  getDeviceAccountPublishedRevision,
  publishCommittedDeviceAccountV2,
} from '../services/profileAccountsV2';
import { reconcileDeviceAccountV2 } from '../services/accountReconciliationV2';
import { handleDeviceProfileAccountSnapshotV2 } from './profileAccountsV2';

const HASH_RE = /^[a-f0-9]{64}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MANIFEST_ROUTE = '/device/accounts/v2/manifests';
const STATUS_ROUTE = '/device/accounts/v2/status';
const RECONCILE_ROUTE = '/device/accounts/v2/reconcile';
const SNAPSHOT_ROUTE = '/device/accounts/v2/snapshot';
const CHUNK_RE = /^\/device\/accounts\/v2\/manifests\/([^/]+)\/chunks\/(\d+)$/;
const COMMIT_RE = /^\/device\/accounts\/v2\/manifests\/([^/]+)\/commit$/;

type ManifestRow = {
  id: string;
  profile_id: string;
  device_id: string;
  date: string;
  revision: number;
  generated_at: number;
  row_count: number;
  chunk_count: number;
  raw_fact_count: number;
  raw_fact_hash: string;
  stats_hash: string;
  complete: number;
  loss_count: number;
  manifest_hash: string;
  status: string;
  committed_at: number | null;
};

function isNonNegativeInt(value: unknown): boolean {
  return Number.isSafeInteger(value) && Number(value) >= 0;
}

function manifestBase(body: any) {
  return {
    schemaVersion: 2,
    date: body.date,
    revision: body.revision,
    generatedAt: body.generatedAt,
    rowCount: body.rowCount,
    chunkCount: body.chunkCount,
    rawFactCount: body.rawFactCount,
    rawFactHash: body.rawFactHash,
    statsHash: body.statsHash,
    complete: body.complete === true,
    lossCount: body.lossCount,
  };
}

function validateManifest(body: any): string | null {
  if (!body || body.schemaVersion !== 2) return 'DEVICE_ACCOUNT_INVALID_SCHEMA';
  if (!DATE_RE.test(String(body.date || ''))) return 'DEVICE_ACCOUNT_INVALID_DATE';
  if (!Number.isSafeInteger(body.revision) || body.revision < 1) return 'DEVICE_ACCOUNT_INVALID_REVISION';
  if (!Number.isSafeInteger(body.generatedAt) || body.generatedAt <= 0) return 'DEVICE_ACCOUNT_INVALID_GENERATED_AT';
  for (const key of ['rowCount', 'chunkCount', 'rawFactCount', 'lossCount']) {
    if (!isNonNegativeInt(body[key])) return `DEVICE_ACCOUNT_INVALID_${key.replace(/([A-Z])/g, '_$1').toUpperCase()}`;
  }
  if (body.chunkCount !== Math.ceil(body.rowCount / DEVICE_ACCOUNT_V2_MAX_CHUNK_ROWS)) {
    return 'DEVICE_ACCOUNT_INVALID_CHUNK_COUNT';
  }
  if (!HASH_RE.test(String(body.rawFactHash || '')) || !HASH_RE.test(String(body.statsHash || '')) ||
      !HASH_RE.test(String(body.manifestHash || ''))) return 'DEVICE_ACCOUNT_INVALID_HASH';
  if (typeof body.complete !== 'boolean') return 'DEVICE_ACCOUNT_INVALID_COMPLETE';
  return null;
}

async function authenticate(request: Request, env: Env) {
  const device = await verifyDeviceTokenFromRequest(request, env, { updateLastSeen: true });
  if (!device) return { response: json({ error: 'Unauthorized' }, 401), device: null };
  if (device.unbound) return { response: deviceUnboundResponse(device.deviceId), device: null };
  if (!device.deviceId) return { response: json({ error: 'Device identity missing', code: 'DEVICE_IDENTITY_MISSING' }, 400), device: null };
  return { response: null, device };
}

function capabilityVersionForExtension(version: string | null): number {
  const match = String(version || '').match(/^(\d+)\.(\d+)\.(\d+)/);
  if (!match) return 1;
  const numeric = Number(match[1]) * 1_000_000 + Number(match[2]) * 1_000 + Number(match[3]);
  return numeric >= 1_007_031 ? 2 : 1;
}

async function recordDeviceAccountCapability(request: Request, env: Env, device: any): Promise<void> {
  const extensionVersion = String(request.headers.get('X-TimeOnChrome-Version') || '').trim().slice(0, 32) || null;
  const capabilityVersion = capabilityVersionForExtension(extensionVersion);
  const now = Date.now();
  await env.DB.prepare(
    `INSERT INTO device_account_capabilities_v2
      (profile_id, device_id, capability_version, extension_version, first_seen_at, last_seen_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(profile_id, device_id) DO UPDATE SET
       capability_version = MAX(device_account_capabilities_v2.capability_version, excluded.capability_version),
       extension_version = excluded.extension_version,
       last_seen_at = excluded.last_seen_at`
  ).bind(device.profileId, device.deviceId, capabilityVersion, extensionVersion, now, now).run();
}

async function readManifest(env: Env, id: string, profileId: string, deviceId: string): Promise<ManifestRow | null> {
  return env.DB.prepare(
    `SELECT id, profile_id, device_id, date, revision, generated_at, row_count, chunk_count,
            raw_fact_count, raw_fact_hash, stats_hash, complete, loss_count, manifest_hash,
            status, committed_at
       FROM device_account_manifests_v2
      WHERE id = ? AND profile_id = ? AND device_id = ?`
  ).bind(id, profileId, deviceId).first<ManifestRow>();
}

async function handleManifest(request: Request, env: Env, device: any): Promise<Response> {
  const body = await request.json<any>().catch(() => null);
  const validationError = validateManifest(body);
  if (validationError) return json({ error: validationError, code: validationError }, 400);
  const computedHash = await hashDeviceAccountValue(manifestBase(body));
  if (computedHash !== body.manifestHash) {
    return json({ error: 'Manifest hash mismatch', code: 'DEVICE_ACCOUNT_MANIFEST_HASH_MISMATCH' }, 400);
  }

  const existing = await env.DB.prepare(
    `SELECT id, manifest_hash, status, committed_at
       FROM device_account_manifests_v2
      WHERE profile_id = ? AND device_id = ? AND date = ? AND revision = ?`
  ).bind(device.profileId, device.deviceId, body.date, body.revision)
    .first<{ id: string; manifest_hash: string; status: string; committed_at: number | null }>();
  if (existing) {
    if (existing.manifest_hash !== body.manifestHash) {
      return json({ error: 'Revision content conflict', code: 'DEVICE_ACCOUNT_REVISION_CONFLICT' }, 409);
    }
    return json({ success: true, manifestId: existing.id, date: body.date, revision: body.revision,
      status: existing.status, committedAt: existing.committed_at, idempotent: true });
  }

  const latest = await env.DB.prepare(
    `SELECT MAX(revision) AS revision FROM device_account_manifests_v2
      WHERE profile_id = ? AND device_id = ? AND date = ?`
  ).bind(device.profileId, device.deviceId, body.date).first<{ revision: number | null }>();
  if (Number(latest?.revision || 0) > body.revision) {
    return json({ error: 'Stale revision', code: 'DEVICE_ACCOUNT_STALE_REVISION', latestRevision: latest?.revision }, 409);
  }

  const now = Date.now();
  const manifestId = crypto.randomUUID();
  await env.DB.prepare(
    `INSERT INTO device_account_manifests_v2
      (id, profile_id, device_id, date, revision, generated_at, row_count, chunk_count,
       raw_fact_count, raw_fact_hash, stats_hash, complete, loss_count, manifest_hash,
       status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'staging', ?, ?)
     ON CONFLICT(profile_id, device_id, date, revision) DO NOTHING`
  ).bind(
    manifestId, device.profileId, device.deviceId, body.date, body.revision, body.generatedAt,
    body.rowCount, body.chunkCount, body.rawFactCount, body.rawFactHash, body.statsHash,
    body.complete ? 1 : 0, body.lossCount, body.manifestHash, now, now
  ).run();
  const stored = await env.DB.prepare(
    `SELECT id, manifest_hash, status, committed_at
       FROM device_account_manifests_v2
      WHERE profile_id = ? AND device_id = ? AND date = ? AND revision = ?`
  ).bind(device.profileId, device.deviceId, body.date, body.revision)
    .first<{ id: string; manifest_hash: string; status: string; committed_at: number | null }>();
  if (!stored) return json({ error: 'Manifest insert not visible', code: 'DEVICE_ACCOUNT_MANIFEST_WRITE_FAILED' }, 500);
  if (stored.manifest_hash !== body.manifestHash) {
    return json({ error: 'Revision content conflict', code: 'DEVICE_ACCOUNT_REVISION_CONFLICT' }, 409);
  }
  return json({ success: true, manifestId: stored.id, date: body.date, revision: body.revision,
    status: stored.status, committedAt: stored.committed_at, idempotent: stored.id !== manifestId });
}

async function handleChunk(request: Request, env: Env, device: any, manifestId: string, chunkIndex: number): Promise<Response> {
  const manifest = await readManifest(env, manifestId, device.profileId, device.deviceId);
  if (!manifest) return json({ error: 'Manifest not found', code: 'DEVICE_ACCOUNT_MANIFEST_NOT_FOUND' }, 404);
  if (!Number.isSafeInteger(chunkIndex) || chunkIndex < 0 || chunkIndex >= manifest.chunk_count) {
    return json({ error: 'Chunk index out of range', code: 'DEVICE_ACCOUNT_CHUNK_OUT_OF_RANGE' }, 400);
  }
  const body = await request.json<any>().catch(() => null);
  const rows = Array.isArray(body?.rows) ? body.rows : null;
  if (!rows || rows.length > DEVICE_ACCOUNT_V2_MAX_CHUNK_ROWS || body.rowCount !== rows.length ||
      !HASH_RE.test(String(body?.chunkHash || ''))) {
    return json({ error: 'Invalid chunk', code: 'DEVICE_ACCOUNT_INVALID_CHUNK' }, 400);
  }
  const rowValidation = validateDeviceAccountRows(rows, manifest.date, { requireConservation: false });
  if (!rowValidation.ok) return json({ error: rowValidation.code, code: rowValidation.code }, 400);
  const computedHash = await hashDeviceAccountValue(rows);
  if (computedHash !== body.chunkHash) {
    return json({ error: 'Chunk hash mismatch', code: 'DEVICE_ACCOUNT_CHUNK_HASH_MISMATCH' }, 400);
  }
  const existing = await env.DB.prepare(
    `SELECT chunk_hash FROM device_account_chunks_v2 WHERE manifest_id = ? AND chunk_index = ?`
  ).bind(manifestId, chunkIndex).first<{ chunk_hash: string }>();
  if (existing) {
    if (existing.chunk_hash !== body.chunkHash) {
      return json({ error: 'Chunk content conflict', code: 'DEVICE_ACCOUNT_CHUNK_CONFLICT' }, 409);
    }
    return json({ success: true, manifestId, chunkIndex, status: manifest.status, idempotent: true });
  }
  if (manifest.status !== 'staging') {
    return json({ error: 'Manifest already committed', code: 'DEVICE_ACCOUNT_ALREADY_COMMITTED' }, 409);
  }
  await env.DB.prepare(
    `INSERT INTO device_account_chunks_v2
      (manifest_id, chunk_index, row_count, chunk_hash, payload_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(manifest_id, chunk_index) DO NOTHING`
  ).bind(manifestId, chunkIndex, rows.length, body.chunkHash, canonicalDeviceAccountJson(rows), Date.now()).run();
  const stored = await env.DB.prepare(
    `SELECT chunk_hash FROM device_account_chunks_v2 WHERE manifest_id = ? AND chunk_index = ?`
  ).bind(manifestId, chunkIndex).first<{ chunk_hash: string }>();
  if (!stored) return json({ error: 'Chunk insert not visible', code: 'DEVICE_ACCOUNT_CHUNK_WRITE_FAILED' }, 500);
  if (stored.chunk_hash !== body.chunkHash) {
    return json({ error: 'Chunk content conflict', code: 'DEVICE_ACCOUNT_CHUNK_CONFLICT' }, 409);
  }
  return json({ success: true, manifestId, chunkIndex, status: 'staging', idempotent: false });
}

async function handleCommit(env: Env, device: any, manifestId: string): Promise<Response> {
  const manifest = await readManifest(env, manifestId, device.profileId, device.deviceId);
  if (!manifest) return json({ error: 'Manifest not found', code: 'DEVICE_ACCOUNT_MANIFEST_NOT_FOUND' }, 404);
  if (manifest.status === 'committed') {
    const publication = await publishDeviceAccountOrKeepPending(env, device, manifest);
    const reconciliation = await reconcileDeviceAccountOrKeepPending(env, device, manifest);
    return json({ success: true, manifestId, date: manifest.date, revision: manifest.revision,
      status: 'committed', committedAt: manifest.committed_at, idempotent: true, ...publication, ...reconciliation });
  }
  const chunkResult = await env.DB.prepare(
    `SELECT chunk_index, row_count, chunk_hash, payload_json
       FROM device_account_chunks_v2 WHERE manifest_id = ? ORDER BY chunk_index ASC`
  ).bind(manifestId).all<{ chunk_index: number; row_count: number; chunk_hash: string; payload_json: string }>();
  const chunks = chunkResult.results || [];
  if (chunks.length !== manifest.chunk_count) {
    return json({ error: 'Missing chunks', code: 'DEVICE_ACCOUNT_INCOMPLETE_CHUNKS', expected: manifest.chunk_count, received: chunks.length }, 409);
  }
  const rows: any[] = [];
  for (let index = 0; index < chunks.length; index++) {
    const chunk = chunks[index];
    if (chunk.chunk_index !== index) return json({ error: 'Non-contiguous chunks', code: 'DEVICE_ACCOUNT_INCOMPLETE_CHUNKS' }, 409);
    const parsed = JSON.parse(chunk.payload_json);
    if (!Array.isArray(parsed) || parsed.length !== chunk.row_count || await hashDeviceAccountValue(parsed) !== chunk.chunk_hash) {
      return json({ error: 'Stored chunk mismatch', code: 'DEVICE_ACCOUNT_STORED_CHUNK_MISMATCH' }, 409);
    }
    rows.push(...parsed);
  }
  if (rows.length !== manifest.row_count) {
    return json({ error: 'Row count mismatch', code: 'DEVICE_ACCOUNT_ROW_COUNT_MISMATCH' }, 409);
  }
  const rowValidation = validateDeviceAccountRows(rows, manifest.date);
  if (!rowValidation.ok) return json({ error: rowValidation.code, code: rowValidation.code, totals: rowValidation.totals }, 409);
  if (await hashDeviceAccountValue(rows) !== manifest.stats_hash) {
    return json({ error: 'Stats hash mismatch', code: 'DEVICE_ACCOUNT_STATS_HASH_MISMATCH' }, 409);
  }

  const now = Date.now();
  const eventId = crypto.randomUUID();
  await env.DB.batch([
    env.DB.prepare(
      `UPDATE device_account_manifests_v2
          SET status = 'committed', committed_at = ?, updated_at = ?
        WHERE id = ? AND profile_id = ? AND device_id = ? AND status = 'staging'`
    ).bind(now, now, manifestId, device.profileId, device.deviceId),
    env.DB.prepare(
      `INSERT INTO device_account_sync_events_v2
        (id, manifest_id, profile_id, device_id, date, revision, event_code, error_code, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 'committed', NULL, ?)`
    ).bind(eventId, manifestId, device.profileId, device.deviceId, manifest.date, manifest.revision, now),
    env.DB.prepare(
      `DELETE FROM device_account_sync_events_v2
        WHERE id IN (
          SELECT id FROM device_account_sync_events_v2
           WHERE profile_id = ? AND device_id = ?
           ORDER BY created_at DESC LIMIT -1 OFFSET 100
        )`
    ).bind(device.profileId, device.deviceId),
  ]);
  const publication = await publishDeviceAccountOrKeepPending(env, device, { ...manifest, committed_at: now });
  const reconciliation = await reconcileDeviceAccountOrKeepPending(env, device, { ...manifest, committed_at: now });
  return json({ success: true, manifestId, date: manifest.date, revision: manifest.revision,
    status: 'committed', committedAt: now, totalSeconds: rowValidation.totalSeconds, idempotent: false,
    ...publication, ...reconciliation });
}

async function publishDeviceAccountOrKeepPending(env: Env, device: any, manifest: ManifestRow): Promise<any> {
  try {
    const published = await publishCommittedDeviceAccountV2(env, manifest.id, device.profileId, device.deviceId);
    return {
      publishStatus: published.published ? 'published' : 'received_not_published',
      publishedRevision: published.publishedRevision || null,
      publishedAt: published.publishedAt || null,
      dayGeneration: published.dayGeneration || null,
      weekGeneration: published.weekGeneration || null,
    };
  } catch (error: any) {
    const code = String(error?.message || 'PROFILE_ACCOUNT_PUBLICATION_FAILED')
      .replace(/[^A-Za-z0-9_]/g, '_').slice(0, 80) || 'PROFILE_ACCOUNT_PUBLICATION_FAILED';
    return { publishStatus: 'received_not_published', publishedRevision: null, publishedAt: null, publishError: code };
  }
}

async function reconcileDeviceAccountOrKeepPending(env: Env, device: any, manifest: ManifestRow): Promise<any> {
  try {
    const result = await reconcileDeviceAccountV2(env, {
      profileId: device.profileId,
      deviceId: device.deviceId,
      manifestId: manifest.id,
    });
    return { reconciliationStatus: result.status, reconciliationCheckedAt: result.checkedAt };
  } catch (error: any) {
    return {
      reconciliationStatus: 'manual_review_required',
      reconciliationError: String(error?.message || 'ACCOUNT_RECONCILIATION_FAILED')
        .replace(/[^A-Za-z0-9_]/g, '_').slice(0, 80),
    };
  }
}

async function handleReconcile(request: Request, env: Env, device: any): Promise<Response> {
  const body = await request.json<any>().catch(() => null);
  if (!DATE_RE.test(String(body?.date || '')) || !Number.isSafeInteger(body?.revision) || body.revision < 1) {
    return json({ error: 'Invalid reconciliation target', code: 'ACCOUNT_RECONCILIATION_INVALID_TARGET' }, 400);
  }
  const manifest = await env.DB.prepare(
    `SELECT id FROM device_account_manifests_v2
      WHERE profile_id = ? AND device_id = ? AND date = ? AND revision = ? AND status = 'committed'`
  ).bind(device.profileId, device.deviceId, body.date, body.revision).first<{ id: string }>();
  if (!manifest) return json({ error: 'Committed manifest not found', code: 'ACCOUNT_RECONCILIATION_MANIFEST_NOT_FOUND' }, 404);
  const result = await reconcileDeviceAccountV2(env, {
    profileId: device.profileId,
    deviceId: device.deviceId,
    manifestId: manifest.id,
  });
  return json({ success: true, ...result });
}

async function handleStatus(request: Request, env: Env, device: any): Promise<Response> {
  const url = new URL(request.url);
  const date = url.searchParams.get('date');
  const revisionText = url.searchParams.get('revision');
  if (!DATE_RE.test(String(date || ''))) return json({ error: 'Invalid date', code: 'DEVICE_ACCOUNT_INVALID_DATE' }, 400);
  const revision = revisionText === null ? null : Number(revisionText);
  if (revision !== null && (!Number.isSafeInteger(revision) || revision < 1)) {
    return json({ error: 'Invalid revision', code: 'DEVICE_ACCOUNT_INVALID_REVISION' }, 400);
  }
  const row = revision === null
    ? await env.DB.prepare(
        `SELECT id, revision, manifest_hash, stats_hash, raw_fact_hash, status, complete, loss_count, updated_at, committed_at
           FROM device_account_manifests_v2
          WHERE profile_id = ? AND device_id = ? AND date = ? ORDER BY revision DESC LIMIT 1`
      ).bind(device.profileId, device.deviceId, date).first<any>()
    : await env.DB.prepare(
        `SELECT id, revision, manifest_hash, stats_hash, raw_fact_hash, status, complete, loss_count, updated_at, committed_at
           FROM device_account_manifests_v2
          WHERE profile_id = ? AND device_id = ? AND date = ? AND revision = ?`
      ).bind(device.profileId, device.deviceId, date, revision).first<any>();
  if (!row) return json({ success: true, date, found: false });
  const published = await getDeviceAccountPublishedRevision(env, device.profileId, device.deviceId, date!);
  return json({
    success: true,
    date,
    found: true,
    manifestId: row.id,
    revision: row.revision,
    manifestHash: row.manifest_hash,
    statsHash: row.stats_hash,
    rawFactHash: row.raw_fact_hash,
    status: row.status,
    complete: row.complete === 1,
    lossCount: row.loss_count,
    updatedAt: row.updated_at,
    committedAt: row.committed_at,
    publishStatus: published && published.revision >= row.revision ? 'published' : 'received_not_published',
    publishedRevision: published?.revision || null,
    publishedAt: published?.publishedAt || null,
  });
}

export const deviceAccountsV2Router = {
  async handle(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;
    const auth = await authenticate(request, env);
    if (auth.response || !auth.device) return auth.response!;
    try {
      await recordDeviceAccountCapability(request, env, auth.device);
      if (request.method === 'POST' && path === MANIFEST_ROUTE) return await handleManifest(request, env, auth.device);
      if (request.method === 'GET' && path === STATUS_ROUTE) return await handleStatus(request, env, auth.device);
      if (request.method === 'POST' && path === RECONCILE_ROUTE) return await handleReconcile(request, env, auth.device);
      if (request.method === 'GET' && path === SNAPSHOT_ROUTE) {
        return await handleDeviceProfileAccountSnapshotV2(request, env, auth.device.profileId);
      }
      const chunkMatch = path.match(CHUNK_RE);
      if (request.method === 'PUT' && chunkMatch) return await handleChunk(request, env, auth.device, chunkMatch[1], Number(chunkMatch[2]));
      const commitMatch = path.match(COMMIT_RE);
      if (request.method === 'POST' && commitMatch) return await handleCommit(env, auth.device, commitMatch[1]);
      return json({ error: 'Not found' }, 404);
    } catch (error: any) {
      return json({ error: 'Device account V2 operation failed', code: 'DEVICE_ACCOUNT_V2_FAILED' }, 500);
    }
  },
};
