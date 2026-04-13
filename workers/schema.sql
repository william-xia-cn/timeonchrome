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
  created_at INTEGER NOT NULL,
  FOREIGN KEY (profile_id) REFERENCES profiles(id)
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
CREATE INDEX IF NOT EXISTS idx_cs_profile_date ON composite_sessions(profile_id, date);
CREATE INDEX IF NOT EXISTS idx_appeals_profile ON session_appeals(profile_id, status);