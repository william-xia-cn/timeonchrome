-- Migration 007: usage_segments_v1 read index
-- Supports account-side settlement detail reads ordered by latest segment first.

CREATE INDEX IF NOT EXISTS idx_usage_segments_profile_start_id
  ON usage_segments_v1 (profile_id, start_ms, id);
