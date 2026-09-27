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
