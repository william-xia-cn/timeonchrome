-- 独立产品统计派生视图；归属和日期从基础清单取得，不复制原账。
CREATE TABLE runtime_application_product_projections_v1 (
  manifest_id TEXT NOT NULL REFERENCES runtime_application_account_manifests_v1(id) ON DELETE CASCADE,
  revision INTEGER NOT NULL CHECK(revision > 0),
  projection_hash TEXT NOT NULL CHECK(length(projection_hash)=64),
  payload_json TEXT NOT NULL CHECK(json_valid(payload_json)),
  received_at_ms INTEGER NOT NULL,
  PRIMARY KEY(manifest_id,revision)
);
CREATE TRIGGER runtime_product_projection_immutable_v1
BEFORE UPDATE ON runtime_application_product_projections_v1
BEGIN SELECT RAISE(ABORT,'APPLICATION_PRODUCT_PROJECTION_IMMUTABLE'); END;
