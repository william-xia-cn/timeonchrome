ALTER TABLE native_macs_v1 ADD COLUMN native_time_rules_enabled INTEGER NOT NULL DEFAULT 0
  CHECK(native_time_rules_enabled IN (0, 1));
