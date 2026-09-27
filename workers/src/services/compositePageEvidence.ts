/** Persistence only: callers must authenticate and validate/sanitize page rows first.
 * Not wired to routes or cron until the remaining privacy gates pass. */
export interface EvidenceRequest {
  id: string;
  profile_id: string;
  device_id: string;
  manifest_id: string;
  cutoff: number;
}

export interface EvidenceChunk {
  cutoff: number;
  hash: string;
  count: number;
  chunks: number;
  index: number;
  complete: boolean;
  rows: Array<{ id: string; [key: string]: unknown }>;
}

interface StoredChunk { chunk_index: number; chunk_hash: string; payload_json: string }
type Receipt = { conflict: true } | { index: number; hash: string; ready: boolean };

// Check persisted authorization at every write, not a stale route-level snapshot.
const CURRENT_REQUEST = `SELECT q.id FROM composite_page_requests_v1 q
  JOIN composite_page_reviews_v1 r ON r.id=q.review_id AND r.profile_id=q.profile_id
  JOIN profiles p ON p.id=q.profile_id
  JOIN devices d ON d.id=q.device_id AND d.profile_id=q.profile_id
  WHERE q.id=?1 AND q.profile_id=?2 AND q.device_id=?3
    AND q.manifest_id=?4 AND q.cutoff=?5 AND q.status IN ('pending','ready')
    AND r.details_deleted_at IS NULL AND COALESCE(r.reviewed_at,r.created_at)>=?6
    AND d.status='bound'
    AND CASE WHEN json_valid(p.config)
      THEN json_type(p.config,'$.compositeReviewConfig.enabled')='true' ELSE 0 END`;
const MATCHING_METADATA = `evidence_hash=?7 AND row_count=?8 AND chunk_count=?9 AND complete=?10`;

export async function hashEvidence(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

/** A receipt means the chunk committed, not that privacy deletion is prohibited later. */
export async function receivePageEvidence(
  database: D1Database, request: EvidenceRequest, body: EvidenceChunk, now = Date.now(),
): Promise<Receipt> {
  if (!body || body.cutoff !== request.cutoff || !/^[a-f0-9]{64}$/.test(body.hash)
    || typeof body.complete !== 'boolean' || !Number.isSafeInteger(body.count)
    || body.count < 0 || body.count > 5000 || body.chunks !== Math.max(1, Math.ceil(body.count / 200))
    || !Number.isInteger(body.index) || body.index < 0 || body.index >= body.chunks
    || !Array.isArray(body.rows)
    || body.rows.length !== Math.min(200, Math.max(0, body.count - body.index * 200))
    || body.rows.some(row => !row || typeof row.id !== 'string' || !row.id || row.id.length > 64)) {
    return { conflict: true };
  }
  const payload = JSON.stringify(body.rows);
  if (new TextEncoder().encode(payload).byteLength > 300_000) return { conflict: true };
  const chunkHash = await hashEvidence(body.rows);
  const values = [request.id, request.profile_id, request.device_id, request.manifest_id,
    body.cutoff, now - 30 * 86_400_000, body.hash, body.count, body.chunks, Number(body.complete)];
  const db = database.withSession('first-primary');
  const results = await db.batch<StoredChunk>([
    db.prepare(`UPDATE composite_page_requests_v1
      SET evidence_hash=?7,row_count=?8,chunk_count=?9,complete=?10
      WHERE id IN (${CURRENT_REQUEST}) AND (evidence_hash IS NULL OR (${MATCHING_METADATA}))`).bind(...values),
    db.prepare(`INSERT OR IGNORE INTO composite_page_chunks_v1
      (request_id,cutoff,chunk_index,chunk_hash,payload_json)
      SELECT ?1,?5,?11,?12,?13 FROM composite_page_requests_v1
      WHERE id IN (${CURRENT_REQUEST}) AND ${MATCHING_METADATA}`)
      .bind(...values, body.index, chunkHash, payload),
    db.prepare(`SELECT c.chunk_index,c.chunk_hash,c.payload_json
      FROM composite_page_chunks_v1 c JOIN composite_page_requests_v1 q ON q.id=c.request_id
      WHERE q.id IN (${CURRENT_REQUEST}) AND c.cutoff=?5
        AND q.evidence_hash=?7 AND q.row_count=?8 AND q.chunk_count=?9 AND q.complete=?10
      ORDER BY c.chunk_index`).bind(...values),
  ]);
  const chunks = results[2].results;
  if (chunks.find(chunk => chunk.chunk_index === body.index)?.chunk_hash !== chunkHash) return { conflict: true };
  if (chunks.length !== body.chunks) return { index: body.index, hash: body.hash, ready: false };

  const rows: Array<{ id: string }> = [];
  for (const [index, chunk] of chunks.entries()) {
    const parsed: unknown = JSON.parse(chunk.payload_json);
    if (index !== chunk.chunk_index || !Array.isArray(parsed)
      || parsed.some(row => !row || typeof row.id !== 'string')
      || await hashEvidence(parsed) !== chunk.chunk_hash) return { conflict: true };
    rows.push(...parsed);
  }
  if (rows.length !== body.count || await hashEvidence(rows) !== body.hash
    || new Set(rows.map(row => row.id)).size !== rows.length) return { conflict: true };
  // Deletion/config/manifest changes while hashing must not revive the request.
  const ready = await db.prepare(`UPDATE composite_page_requests_v1 SET status='ready'
    WHERE id IN (${CURRENT_REQUEST}) AND ${MATCHING_METADATA}`).bind(...values).run();
  return ready.meta.changes === 1 ? { index: body.index, hash: body.hash, ready: true } : { conflict: true };
}

export async function deleteReviewDetails(
  database: D1Database, profileId: string, reviewId: string, now = Date.now(),
): Promise<void> {
  const owned = 'SELECT id FROM composite_page_reviews_v1 WHERE id=?1 AND profile_id=?2';
  await database.batch([
    database.prepare(`UPDATE composite_page_reviews_v1 SET details_deleted_at=COALESCE(details_deleted_at,?3)
      WHERE id=?1 AND profile_id=?2`).bind(reviewId, profileId, now),
    database.prepare(`DELETE FROM composite_page_chunks_v1 WHERE request_id IN
      (SELECT id FROM composite_page_requests_v1 WHERE review_id IN (${owned}))`).bind(reviewId, profileId),
    database.prepare(`UPDATE composite_page_requests_v1 SET status='deleted',complete=0
      WHERE review_id IN (${owned})`).bind(reviewId, profileId),
    database.prepare(`UPDATE composite_page_opinions_v1 SET reason=''
      WHERE review_id IN (${owned})`).bind(reviewId, profileId),
  ]);
}

/** Called only after the scanner has verified the published usage threshold.
 * The head and privacy checks remain inside the write transaction. */
export async function refreshEvidenceRequest(
  database: D1Database,
  request: EvidenceRequest & { review_id: string; day_start: number; expected_seconds: number },
): Promise<boolean> {
  if (!Number.isSafeInteger(request.cutoff) || !Number.isSafeInteger(request.day_start)
    || request.cutoff < request.day_start || request.cutoff > request.day_start + 86_400_000
    || !Number.isSafeInteger(request.expected_seconds) || request.expected_seconds <= 0) return false;
  const eligible = `SELECT r.id FROM composite_page_reviews_v1 r
    JOIN profiles p ON p.id=r.profile_id
    JOIN devices d ON d.profile_id=p.id AND d.id=?4 AND d.status='bound'
    JOIN device_account_heads_v2 h ON h.profile_id=p.id AND h.device_id=d.id AND h.date=r.date
    WHERE r.id=?2 AND p.id=?3 AND r.details_deleted_at IS NULL AND h.manifest_id=?5
      AND CASE WHEN json_valid(p.config)
        THEN json_type(p.config,'$.compositeReviewConfig.enabled')='true' ELSE 0 END
      AND NOT EXISTS (SELECT 1 FROM composite_page_requests_v1 q WHERE q.id=?1
        AND (q.review_id<>?2 OR q.profile_id<>?3 OR q.device_id<>?4
          OR q.manifest_id=?5 OR q.cutoff>?6))`;
  const values = [request.id,request.review_id,request.profile_id,request.device_id,
    request.manifest_id,request.cutoff];
  const results = await database.batch([
    database.prepare(`UPDATE composite_page_reviews_v1 SET reviewed_at=NULL WHERE id IN (${eligible})`).bind(...values),
    database.prepare(`DELETE FROM composite_page_chunks_v1 WHERE request_id=?1 AND EXISTS (${eligible})`).bind(...values),
    database.prepare(`INSERT INTO composite_page_requests_v1
      (id,review_id,profile_id,device_id,manifest_id,cutoff,day_start,expected_seconds)
      SELECT ?1,?2,?3,?4,?5,?6,?7,?8 WHERE EXISTS (${eligible})
      ON CONFLICT(id) DO UPDATE SET manifest_id=excluded.manifest_id,cutoff=excluded.cutoff,
        day_start=excluded.day_start,expected_seconds=excluded.expected_seconds,
        evidence_hash=NULL,row_count=NULL,chunk_count=NULL,complete=0,status='pending'`)
      .bind(...values,request.day_start,request.expected_seconds),
  ]);
  return results[2].meta.changes === 1;
}

export interface EvidenceRequestVersion {
  id: string;
  manifest_id: string;
  cutoff: number;
  evidence_hash: string | null;
  status: string;
  complete: number;
}

/** The caller must verify pageKey belongs to its derived detail result. Passing
 * that result's request versions prevents a stale result from writing back. */
export async function saveReviewOpinion(
  database: D1Database, profileId: string, reviewId: string,
  opinion: { pageKey: string; verdict: 'study' | 'rest' | 'unknown'; reason: string },
  versions: EvidenceRequestVersion[], now = Date.now(),
): Promise<boolean> {
  if (!/^[a-f0-9]{64}$/.test(opinion.pageKey) || !['study','rest','unknown'].includes(opinion.verdict)
    || typeof opinion.reason !== 'string' || opinion.reason.length > 300 || !versions.length) return false;
  const result = await database.prepare(`INSERT INTO composite_page_opinions_v1
    (review_id,page_key,verdict,reason,updated_at)
    SELECT ?1,?3,?4,?5,?7 FROM composite_page_reviews_v1 r
    WHERE r.id=?1 AND r.profile_id=?2 AND r.details_deleted_at IS NULL
      AND COALESCE(r.reviewed_at,r.created_at)>=?8
      AND (SELECT COUNT(*) FROM composite_page_requests_v1 WHERE review_id=?1)=json_array_length(?6)
      AND NOT EXISTS (SELECT 1 FROM composite_page_requests_v1 q WHERE q.review_id=?1
        AND NOT EXISTS (SELECT 1 FROM json_each(?6) j
          WHERE q.id=json_extract(j.value,'$.id') AND q.manifest_id=json_extract(j.value,'$.manifest_id')
            AND q.cutoff=json_extract(j.value,'$.cutoff') AND q.evidence_hash IS json_extract(j.value,'$.evidence_hash')
            AND q.status=json_extract(j.value,'$.status') AND q.complete=json_extract(j.value,'$.complete')))
    ON CONFLICT(review_id,page_key) DO UPDATE SET verdict=excluded.verdict,
      reason=excluded.reason,updated_at=excluded.updated_at`)
    .bind(reviewId,profileId,opinion.pageKey,opinion.verdict,opinion.reason,JSON.stringify(versions),now,now-30*86_400_000)
    .run();
  return result.meta.changes === 1;
}
