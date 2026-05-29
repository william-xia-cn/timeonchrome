-- Explicit device unbind state.
-- Existing devices remain bound; unbound devices keep their token relation so clients can be told explicitly.
ALTER TABLE devices ADD COLUMN status TEXT DEFAULT 'bound';
ALTER TABLE devices ADD COLUMN unbound_at INTEGER;

UPDATE devices SET status = 'bound' WHERE status IS NULL;
