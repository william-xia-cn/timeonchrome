CREATE VIEW IF NOT EXISTS runtime_account_children_v2 AS
SELECT account_id, id AS child_id, name AS child_name
FROM profiles;
