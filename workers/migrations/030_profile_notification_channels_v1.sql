-- Migration 030: account-scoped notification channels, profile-scoped
-- unclassified-usage notification rules, Telegram pairing and delivery outbox.

CREATE TABLE IF NOT EXISTS account_notification_settings_v1 (
  account_id              TEXT PRIMARY KEY,
  email_enabled           INTEGER NOT NULL DEFAULT 0,
  telegram_enabled        INTEGER NOT NULL DEFAULT 0,
  telegram_chat_id        TEXT,
  telegram_bot_id         TEXT,
  telegram_bot_username   TEXT,
  telegram_connected_at   INTEGER,
  created_at              INTEGER NOT NULL,
  updated_at              INTEGER NOT NULL,
  FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS profile_unclassified_notification_settings_v1 (
  profile_id          TEXT PRIMARY KEY,
  enabled             INTEGER NOT NULL DEFAULT 0,
  threshold_minutes   INTEGER NOT NULL DEFAULT 30,
  created_at          INTEGER NOT NULL,
  updated_at          INTEGER NOT NULL,
  FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS telegram_pairing_sessions_v1 (
  id               TEXT PRIMARY KEY,
  account_id       TEXT NOT NULL,
  token_hash       TEXT NOT NULL UNIQUE,
  bot_id           TEXT NOT NULL,
  status           TEXT NOT NULL DEFAULT 'pending',
  expires_at       INTEGER NOT NULL,
  consumed_at      INTEGER,
  created_at       INTEGER NOT NULL,
  updated_at       INTEGER NOT NULL,
  FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_telegram_pairing_sessions_v1_account
  ON telegram_pairing_sessions_v1(account_id, status, expires_at);

CREATE TABLE IF NOT EXISTS site_classification_telegram_notifications_v1 (
  id                   TEXT PRIMARY KEY,
  profile_id           TEXT NOT NULL,
  request_id           TEXT NOT NULL,
  account_id           TEXT NOT NULL,
  canonical_host       TEXT NOT NULL,
  usage_date           TEXT NOT NULL,
  threshold_seconds    INTEGER NOT NULL,
  observed_seconds     INTEGER NOT NULL,
  telegram_chat_id     TEXT NOT NULL,
  status               TEXT NOT NULL DEFAULT 'queued',
  attempt_count        INTEGER NOT NULL DEFAULT 0,
  next_attempt_at      INTEGER,
  last_error_code      TEXT,
  outbound_message_id  TEXT,
  sent_at              INTEGER,
  created_at           INTEGER NOT NULL,
  updated_at           INTEGER NOT NULL,
  UNIQUE (profile_id, usage_date, canonical_host),
  FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE,
  FOREIGN KEY (request_id) REFERENCES site_classification_requests_v1(id) ON DELETE CASCADE,
  FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_site_classification_telegram_outbox_v1
  ON site_classification_telegram_notifications_v1(status, next_attempt_at, created_at);
