// utils/storage.js
// 所有数据存取统一通过此模块，带完整性校验

const STORAGE_VERSION = '1.0';
const CONFIG_KEY = 'guardian_config';
const HASH_KEY = 'guardian_hash';
const STATS_KEY_PREFIX = 'stats_';

/**
 * 计算配置的完整性哈希（防篡改）
 */

// 规范化 JSON 字符串（按字母排序键）确保哈希稳定
function sortObjectKeys(obj) {
  if (obj === null || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(sortObjectKeys);
  return Object.keys(obj).sort().reduce((acc, key) => {
    acc[key] = sortObjectKeys(obj[key]);
    return acc;
  }, {});
}

async function computeHash(data) {
  // 使用排序后的 JSON 确保哈希稳定
  const sorted = sortObjectKeys(data);
  const text = JSON.stringify(sorted) + 'guardian_salt_2024';
  const buffer = new TextEncoder().encode(text);
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * 密码哈希（用于管理员密码验证）
 */
export async function hashPassword(password) {
  const text = password + 'guardian_pw_salt_9527';
  const buffer = new TextEncoder().encode(text);
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * 默认配置
 */
export const DEFAULT_CONFIG = {
  version: STORAGE_VERSION,
  adminPasswordHash: '', // 首次使用时设置
  isInitialized: false,

  // 控制模式: 'study' | 'rest'
  mode: 'study',

  // 白名单域名列表（已废弃，保留兼容）
  whitelist: [],

  // 不安全网站列表（基于安全考虑始终拦截）
  unsafeList: [],
  blacklist: [],  // 已废弃，迁移到 unsafeList

  // 时间配额（分钟/天，0表示不限制）
  dailyQuota: 0,

  // 每个域名的单独时间配额（分钟/天）
  domainQuotas: {},

  // 允许上网的时间段（每周每天）
  schedule: {
    enabled: false,
    // 0=周日 1=周一 ... 6=周六
    days: {
      0: { enabled: true, start: '08:00', end: '21:00' },
      1: { enabled: true, start: '15:00', end: '21:00' },
      2: { enabled: true, start: '15:00', end: '21:00' },
      3: { enabled: true, start: '15:00', end: '21:00' },
      4: { enabled: true, start: '15:00', end: '21:00' },
      5: { enabled: true, start: '15:00', end: '21:00' },
      6: { enabled: true, start: '08:00', end: '21:00' }
    }
  },

  // 被拦截时的行为: 'block' | 'warn' | 'log'
  interceptAction: 'block',

  // 超出时间配额时是否强制锁定
  lockOnQuotaExceeded: true,

  // 是否启用管控
  enabled: true,

  // 拦截时显示的消息
  blockMessage: '这个网站当前不在可访问范围内',

  // 今日已锁定的域名（配额用完）
  lockedDomains: [],

  // 休息配置
  restConfig: {
    reminderInterval: 15,  // 分钟（0=不提醒）
    maxRestDuration: 60   // 分钟（0=不限制）
  },

  updatedAt: null
};

// ── 学习/休息状态常量 ──────────────────────────────────────

const SESSION_KEY = 'guardian_session';
const SESSIONS_KEY = 'guardian_sessions'; // 历史统计

/**
 * 默认会话状态
 */
export const DEFAULT_SESSION = {
  currentMode: 'free', // 'study' | 'rest' | 'free'
  studySession: {
    startTime: null,
    totalSeconds: 0
  },
  restSession: {
    startTime: null,
    totalSeconds: 0
  },
  lastActiveDate: null
};

/**
 * 获取当前会话状态
 */
export async function getSession() {
  return new Promise((resolve) => {
    chrome.storage.local.get(SESSION_KEY, (result) => {
      const session = result[SESSION_KEY] || { ...DEFAULT_SESSION };
      // 确保结构完整
      if (!session.studySession) session.studySession = { startTime: null, totalSeconds: 0 };
      if (!session.restSession) session.restSession = { startTime: null, totalSeconds: 0 };
      resolve(session);
    });
  });
}

/**
 * 保存会话状态
 */
export async function saveSession(session) {
  return new Promise((resolve) => {
    chrome.storage.local.set({ [SESSION_KEY]: session }, resolve);
  });
}

/**
 * 获取历史会话统计
 */
export async function getSessionsRange(days = 30) {
  return new Promise((resolve) => {
    chrome.storage.local.get(SESSIONS_KEY, (result) => {
      const sessions = result[SESSIONS_KEY] || {};
      // 只返回指定天数内的数据
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - days);
      const filtered = {};
      for (const [date, data] of Object.entries(sessions)) {
        if (new Date(date) >= cutoff) {
          filtered[date] = data;
        }
      }
      resolve(filtered);
    });
  });
}

/**
 * 更新单日会话统计
 */
export async function updateDailySession(date, studySeconds, restSeconds) {
  return new Promise((resolve) => {
    chrome.storage.local.get(SESSIONS_KEY, (result) => {
      const sessions = result[SESSIONS_KEY] || {};
      if (!sessions[date]) {
        sessions[date] = { studySeconds: 0, restSeconds: 0 };
      }
      sessions[date].studySeconds = (sessions[date].studySeconds || 0) + studySeconds;
      sessions[date].restSeconds = (sessions[date].restSeconds || 0) + restSeconds;
      chrome.storage.local.set({ [SESSIONS_KEY]: sessions }, resolve);
    });
  });
}

/**
 * 清理过期历史统计（保留30天）
 */
export async function cleanOldSessions() {
  return new Promise((resolve) => {
    chrome.storage.local.get(SESSIONS_KEY, (result) => {
      const sessions = result[SESSIONS_KEY] || {};
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - 30);
      const filtered = {};
      for (const [date, data] of Object.entries(sessions)) {
        if (new Date(date) >= cutoff) {
          filtered[date] = data;
        }
      }
      chrome.storage.local.set({ [SESSIONS_KEY]: filtered }, resolve);
    });
  });
}

/**
 * 读取配置（带完整性校验）
 */
export async function getConfig() {
  return new Promise((resolve) => {
    chrome.storage.local.get([CONFIG_KEY, HASH_KEY], async (result) => {
      if (!result[CONFIG_KEY]) {
        resolve({ ...DEFAULT_CONFIG });
        return;
      }

      const config = result[CONFIG_KEY];
      const storedHash = result[HASH_KEY];
      const computedHash = await computeHash(config);

      if (storedHash !== computedHash) {
        // 哈希不匹配但配置可用，合并默认值后使用
        const safeConfig = {
          ...DEFAULT_CONFIG,
          ...config,
          adminPasswordHash: config.adminPasswordHash || '',
          isInitialized: config.isInitialized || false
        };
        resolve(safeConfig);
        return;
      }

      resolve(config);
    });
  });
}

/**
 * 保存配置（附带完整性哈希）
 */
export async function saveConfig(config) {
  config.updatedAt = Date.now();
  const hash = await computeHash(config);
  return new Promise((resolve) => {
    chrome.storage.local.set({
      [CONFIG_KEY]: config,
      [HASH_KEY]: hash
    }, resolve);
  });
}

/**
 * 获取今日统计数据
 */
export async function getTodayStats() {
  const today = getDateKey();
  return new Promise((resolve) => {
    chrome.storage.local.get(STATS_KEY_PREFIX + today, (result) => {
      resolve(result[STATS_KEY_PREFIX + today] || {});
    });
  });
}

/**
 * 更新域名时长统计（秒）
 */
export async function addDomainTime(domain, seconds) {
  const today = getDateKey();
  const key = STATS_KEY_PREFIX + today;
  return new Promise((resolve) => {
    chrome.storage.local.get(key, (result) => {
      const stats = result[key] || {};
      stats[domain] = (stats[domain] || 0) + seconds;
      chrome.storage.local.set({ [key]: stats }, resolve);
    });
  });
}

/**
 * 获取近N天的统计数据
 */
export async function getStatsRange(days = 7) {
  const keys = [];
  for (let i = 0; i < days; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    keys.push(STATS_KEY_PREFIX + formatDate(d));
  }
  return new Promise((resolve) => {
    chrome.storage.local.get(keys, (result) => {
      const data = {};
      keys.forEach(key => {
        const date = key.replace(STATS_KEY_PREFIX, '');
        data[date] = result[key] || {};
      });
      resolve(data);
    });
  });
}

/**
 * 清除过期统计（30天前）
 */
export async function cleanOldStats() {
  return new Promise((resolve) => {
    chrome.storage.local.get(null, (result) => {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - 30);
      const keysToDelete = Object.keys(result).filter(key => {
        if (!key.startsWith(STATS_KEY_PREFIX)) return false;
        const dateStr = key.replace(STATS_KEY_PREFIX, '');
        return new Date(dateStr) < cutoff;
      });
      if (keysToDelete.length > 0) {
        chrome.storage.local.remove(keysToDelete, resolve);
      } else {
        resolve();
      }
    });
  });
}

// ── 工具函数 ──────────────────────────────────────

export function getDateKey() {
  return formatDate(new Date());
}

function formatDate(date) {
  return date.toISOString().split('T')[0];
}

export function extractDomain(url) {
  try {
    const u = new URL(url);
    // 去掉 www. 前缀
    return u.hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

export function isSpecialUrl(url) {
  return !url || 
    url.startsWith('chrome://') || 
    url.startsWith('chrome-extension://') || 
    url.startsWith('about:') ||
    url.startsWith('edge://') ||
    url.startsWith('devtools://');
}
