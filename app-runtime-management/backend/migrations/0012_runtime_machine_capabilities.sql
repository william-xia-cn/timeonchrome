-- ARM-D-038: last machine-declared execution capabilities, not inferred from ACK/version.
ALTER TABLE runtime_machines_v2 ADD COLUMN capabilities_json TEXT NOT NULL DEFAULT '[]';
