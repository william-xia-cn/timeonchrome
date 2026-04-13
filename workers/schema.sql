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

-- 索引
CREATE INDEX IF NOT EXISTS idx_stats_date ON stats(date);
CREATE INDEX IF NOT EXISTS idx_stats_profile_date ON stats(profile_id, date);
CREATE INDEX IF NOT EXISTS idx_devices_token ON devices(device_token);