-- Test-only copy of the unmerged 032 schema. Never a production migration.
CREATE TABLE composite_page_reviews_v1 (
  id TEXT PRIMARY KEY, profile_id TEXT NOT NULL, date TEXT NOT NULL, site TEXT NOT NULL,
  total_seconds INTEGER NOT NULL, as_of INTEGER NOT NULL, created_at INTEGER NOT NULL,
  reviewed_at INTEGER, details_deleted_at INTEGER,
  UNIQUE(profile_id, date, site)
);
CREATE INDEX composite_review_profile_date ON composite_page_reviews_v1(profile_id, date);
CREATE TABLE composite_page_requests_v1 (
  id TEXT PRIMARY KEY, review_id TEXT NOT NULL, profile_id TEXT NOT NULL, device_id TEXT NOT NULL,
  manifest_id TEXT NOT NULL, cutoff INTEGER NOT NULL, day_start INTEGER NOT NULL,
  expected_seconds INTEGER NOT NULL, evidence_hash TEXT, row_count INTEGER, chunk_count INTEGER,
  complete INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'pending',
  UNIQUE(review_id, device_id)
);
CREATE TABLE composite_page_chunks_v1 (
  request_id TEXT NOT NULL, cutoff INTEGER NOT NULL, chunk_index INTEGER NOT NULL,
  chunk_hash TEXT NOT NULL, payload_json TEXT NOT NULL,
  PRIMARY KEY(request_id, cutoff, chunk_index)
);
CREATE TABLE composite_page_opinions_v1 (
  review_id TEXT NOT NULL, page_key TEXT NOT NULL, verdict TEXT NOT NULL,
  reason TEXT NOT NULL, updated_at INTEGER NOT NULL,
  PRIMARY KEY(review_id, page_key)
);
CREATE TABLE composite_review_notifications_v1 (
  review_id TEXT NOT NULL, channel TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending',
  attempts INTEGER NOT NULL DEFAULT 0, next_attempt_at INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY(review_id, channel)
);
