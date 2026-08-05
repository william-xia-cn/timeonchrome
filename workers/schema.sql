-- TimeOnChrome Database Schema
-- D1 Database: guardian-db

-- 账户表
CREATE TABLE IF NOT EXISTS accounts (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

-- 配置文件表（家长为孩子创建的profile）
CREATE TABLE IF NOT EXISTS profiles (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  name TEXT NOT NULL,
  config TEXT NOT NULL,  -- JSON 存储规则配置
  version INTEGER DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (account_id) REFERENCES accounts(id)
);

-- 设备绑定表
CREATE TABLE IF NOT EXISTS devices (
  id TEXT PRIMARY KEY,
  profile_id TEXT NOT NULL,
  device_token TEXT UNIQUE NOT NULL,
  device_name TEXT,
  last_seen INTEGER,
  monitoring_enabled INTEGER DEFAULT 1,  -- 1=监控开启, 0=停用监控（仅同步配置，不拦截）
  task_management_v1_capable INTEGER DEFAULT 0,
  task_capabilities_json TEXT,
  task_capability_reported_at INTEGER,
  task_sync_version INTEGER DEFAULT 0,
  task_active_summary_json TEXT,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (profile_id) REFERENCES profiles(id)
);

-- 家长账号 refresh token 会话。只保存 token hash；改密码时吊销，不影响 device_token。
CREATE TABLE IF NOT EXISTS account_sessions (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  refresh_token_hash TEXT UNIQUE NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  revoked_at INTEGER,
  last_used_at INTEGER,
  FOREIGN KEY (account_id) REFERENCES accounts(id)
);

-- 统计上报表
CREATE TABLE IF NOT EXISTS stats (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  profile_id TEXT NOT NULL,
  date TEXT NOT NULL,  -- YYYY-MM-DD
  domain TEXT NOT NULL,
  duration INTEGER NOT NULL,  -- 秒
  created_at INTEGER NOT NULL,
  FOREIGN KEY (profile_id) REFERENCES profiles(id)
);

-- 复合型网站会话记录表（Phase 2：标题追踪 + 家长审核）
CREATE TABLE IF NOT EXISTS composite_sessions (
  id TEXT PRIMARY KEY,
  profile_id TEXT NOT NULL,
  device_id TEXT,
  domain TEXT NOT NULL,
  title TEXT NOT NULL,
  date TEXT NOT NULL,          -- YYYY-MM-DD
  start_time INTEGER NOT NULL, -- Unix ms
  duration INTEGER NOT NULL,   -- 秒
  classification TEXT,         -- null / 'study' / 'rest'
  classified_by TEXT,          -- null / 'parent' / 'rule'
  classified_at INTEGER,
  FOREIGN KEY (profile_id) REFERENCES profiles(id)
);

-- 申诉记录表（Phase 2）
CREATE TABLE IF NOT EXISTS session_appeals (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  profile_id TEXT NOT NULL,
  reason TEXT,
  status TEXT DEFAULT 'pending',  -- pending / upheld / overturned
  original_classification TEXT,
  new_classification TEXT,
  created_at INTEGER NOT NULL,
  resolved_at INTEGER,
  FOREIGN KEY (session_id) REFERENCES composite_sessions(id),
  FOREIGN KEY (profile_id) REFERENCES profiles(id)
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_stats_date ON stats(date);
CREATE INDEX IF NOT EXISTS idx_stats_profile_date ON stats(profile_id, date);
CREATE INDEX IF NOT EXISTS idx_devices_token ON devices(device_token);
CREATE INDEX IF NOT EXISTS idx_account_sessions_account ON account_sessions(account_id);
CREATE INDEX IF NOT EXISTS idx_account_sessions_hash ON account_sessions(refresh_token_hash);
CREATE INDEX IF NOT EXISTS idx_cs_profile_date ON composite_sessions(profile_id, date);
CREATE INDEX IF NOT EXISTS idx_appeals_profile ON session_appeals(profile_id, status);


CREATE TABLE IF NOT EXISTS system_access_config_v1 (
  id TEXT PRIMARY KEY,
  config_json TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  updated_at INTEGER NOT NULL,
  updated_by_account_id TEXT,
  note TEXT
);
-- Task Management V1 definitions. Production rollout uses migrations/021_task_management_v1.sql.
CREATE TABLE IF NOT EXISTS tasks_v1 (
  id TEXT PRIMARY KEY,
  profile_id TEXT NOT NULL,
  name TEXT NOT NULL,
  normalized_name TEXT NOT NULL,
  planned_start_at INTEGER NOT NULL,
  display_timezone TEXT,
  required_seconds INTEGER NOT NULL CHECK (required_seconds >= 60 AND required_seconds <= 86400),
  resource_spec_json TEXT NOT NULL,
  lifecycle_status TEXT NOT NULL DEFAULT 'open' CHECK (lifecycle_status IN ('open', 'paused', 'completed', 'cancelled')),
  revision INTEGER NOT NULL DEFAULT 1,
  completed_seconds INTEGER NOT NULL DEFAULT 0 CHECK (completed_seconds >= 0),
  completion_source TEXT CHECK (completion_source IS NULL OR completion_source IN ('usage', 'parent', 'external')),
  completed_at INTEGER,
  cancelled_at INTEGER,
  created_by_account_id TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (profile_id) REFERENCES profiles(id),
  FOREIGN KEY (created_by_account_id) REFERENCES accounts(id)
);

CREATE INDEX IF NOT EXISTS idx_tasks_v1_profile_lifecycle_start
  ON tasks_v1 (profile_id, lifecycle_status, planned_start_at);

CREATE INDEX IF NOT EXISTS idx_tasks_v1_profile_updated
  ON tasks_v1 (profile_id, updated_at);

CREATE TABLE IF NOT EXISTS task_events_v1 (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  profile_id TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('created', 'edited', 'paused', 'resumed', 'completed', 'cancelled')),
  task_revision INTEGER NOT NULL,
  source_type TEXT NOT NULL CHECK (source_type IN ('parent', 'device', 'external', 'system')),
  source_id TEXT,
  payload_json TEXT,
  occurred_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (task_id) REFERENCES tasks_v1(id),
  FOREIGN KEY (profile_id) REFERENCES profiles(id)
);

CREATE INDEX IF NOT EXISTS idx_task_events_v1_profile_time
  ON task_events_v1 (profile_id, occurred_at);

CREATE INDEX IF NOT EXISTS idx_task_events_v1_task_time
  ON task_events_v1 (task_id, occurred_at);
