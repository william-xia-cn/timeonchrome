-- Migration 002: Add monitoring_enabled column to devices table
-- Run: wrangler d1 execute guardian-db --remote --file=migrations/002_monitoring_enabled.sql

ALTER TABLE devices ADD COLUMN monitoring_enabled INTEGER DEFAULT 1;
