ALTER TABLE native_children_v1 ADD COLUMN time_zone TEXT NOT NULL DEFAULT 'Asia/Shanghai';

ALTER TABLE child_application_states_v1 ADD COLUMN block_origin TEXT NOT NULL DEFAULT 'DIRECT'
  CHECK(block_origin IN ('DIRECT', 'PUBLISHER'));

-- Older publisher actions stamped every application with the same timestamp.
-- Preserve explicit application blocks recorded in the audit trail.
UPDATE child_application_states_v1
   SET block_origin = 'PUBLISHER'
 WHERE state = 'BLOCK'
   AND EXISTS (
     SELECT 1 FROM account_applications_v1 a
     JOIN child_publisher_blocks_v1 p
       ON p.child_id = child_application_states_v1.child_id AND p.team_id = a.team_id
     WHERE a.id = child_application_states_v1.application_id
       AND p.created_at = child_application_states_v1.updated_at
   )
   AND NOT EXISTS (
     SELECT 1 FROM native_app_audit_events_v1 e
     WHERE e.child_id = child_application_states_v1.child_id
       AND e.application_id = child_application_states_v1.application_id
       AND e.event_type = 'application.block'
   );

CREATE TABLE native_app_block_schedules_v1 (
  child_id TEXT NOT NULL,
  source_type TEXT NOT NULL CHECK(source_type IN ('APPLICATION', 'PREDEFINED', 'PUBLISHER')),
  source_key TEXT NOT NULL,
  start_minute INTEGER NOT NULL CHECK(start_minute BETWEEN 0 AND 1439),
  end_minute INTEGER NOT NULL CHECK(end_minute BETWEEN 0 AND 1439),
  effective_active INTEGER NOT NULL CHECK(effective_active IN (0, 1)),
  updated_at INTEGER NOT NULL,
  PRIMARY KEY(child_id, source_type, source_key),
  FOREIGN KEY(child_id) REFERENCES native_children_v1(child_id) ON DELETE CASCADE,
  CHECK(start_minute != end_minute)
);
