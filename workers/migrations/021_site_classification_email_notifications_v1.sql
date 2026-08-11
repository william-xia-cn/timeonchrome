-- Migration 021: daily unclassified-site email notification outbox and reply audit.
-- Run only after source review:
-- wrangler d1 execute guardian-db --remote --file=migrations/021_site_classification_email_notifications_v1.sql

CREATE TABLE IF NOT EXISTS site_classification_email_notifications_v1 (
  id                  TEXT PRIMARY KEY,
  notification_type   TEXT NOT NULL DEFAULT 'daily_unclassified_15m',
  profile_id          TEXT NOT NULL,
  request_id          TEXT NOT NULL,
  account_id          TEXT NOT NULL,
  canonical_host      TEXT NOT NULL,
  usage_date          TEXT NOT NULL,
  threshold_seconds   INTEGER NOT NULL DEFAULT 900,
  observed_seconds    INTEGER NOT NULL,
  status              TEXT NOT NULL DEFAULT 'queued',
  expires_at          INTEGER NOT NULL,
  attempt_count       INTEGER NOT NULL DEFAULT 0,
  next_attempt_at     INTEGER,
  sent_at             INTEGER,
  consumed_at         INTEGER,
  decision            TEXT,
  outbound_message_id TEXT,
  last_error_code     TEXT,
  created_at          INTEGER NOT NULL,
  updated_at          INTEGER NOT NULL,

  UNIQUE (profile_id, usage_date, canonical_host, notification_type)
);

CREATE INDEX IF NOT EXISTS idx_site_classification_email_outbox
  ON site_classification_email_notifications_v1 (status, next_attempt_at);

CREATE INDEX IF NOT EXISTS idx_site_classification_email_request
  ON site_classification_email_notifications_v1 (request_id, status);

CREATE TABLE IF NOT EXISTS site_classification_email_reply_events_v1 (
  id                       TEXT PRIMARY KEY,
  notification_id          TEXT,
  inbound_message_id_hash  TEXT NOT NULL,
  command                  TEXT,
  sender_match             INTEGER NOT NULL DEFAULT 0,
  result_code              TEXT NOT NULL,
  received_at              INTEGER NOT NULL,
  created_at               INTEGER NOT NULL,

  UNIQUE (inbound_message_id_hash)
);

CREATE INDEX IF NOT EXISTS idx_site_classification_email_reply_notification
  ON site_classification_email_reply_events_v1 (notification_id, received_at);
