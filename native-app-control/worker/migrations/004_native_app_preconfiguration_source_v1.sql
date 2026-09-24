-- Legacy target_policy remains BLOCK for existing rows; desired_state controls new source semantics.
ALTER TABLE native_app_predefined_items_v1
  ADD COLUMN desired_state TEXT NOT NULL DEFAULT 'BLOCK'
    CHECK(desired_state IN ('BLOCK', 'CANDIDATE'));
