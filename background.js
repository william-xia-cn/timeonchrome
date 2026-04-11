// background.js - Service Worker 核心逻辑（v2.0 云端同步版）
// 功能：
// 1. 学习/休息状态切换
// 2. 学习时使用白名单模式
// 3. 休息时使用黑名单模式
// 4. 休息提醒和强制结束
// 5. 云端同步（配置下发、统计上报、Session归档）

// ── 云端同步配置 ─────────────────────────────────────────────────────────────────

const CLOUD_CONFIG = {
  API_BASE: 'https://guardian-api.william-xia-cn.workers.dev',
  SYNC_INTERVAL_MS: 15 * 60 * 1000,  // 15分钟
  SESSION_UPLOAD_HOUR: 8,             // 每天8点
  MAX_RETRY_ATTEMPTS: 3,
  KEYS: {
    DEVICE_TOKEN: 'cloud_device_token',
    PROFILE_ID: 'cloud_profile_id',
    CREDENTIALS: 'cloud_credentials',    // 加密的登录凭据
    LAST_SYNC: 'cloud_last_sync',
    PENDING_STATS: 'cloud_pending_stats',
    PENDING_SESSIONS: 'cloud_pending_sessions',
    LOCAL_CONFIG: 'cloud_local_config',
    CONFIG_VERSION: 'cloud_config_version'
  }
};

// 同步状态
let syncState = {
  isSyncing: false,
  lastConfigVersion: 0,
  deviceToken: null,
  profileId: null
};

// ── 云端同步核心函数 ───────────────────────────────────────────────────────────

/**
 * 从 chrome.storage 获取值
 */
async function storageGet(keys) {
  return new Promise(resolve => chrome.storage.local.get(keys, resolve));
}

/**
 * 设置值到 chrome.storage
 */
async function storageSet(data) {
  return new Promise(resolve => chrome.storage.local.set(data, resolve));
}

/**
 * 加密凭据（简化版，生产环境建议用更安全的方式）
 */
function encryptCredentials(email, password) {
  const data = btoa(`${email}:${password}`);
  return data;
}

/**
 * 解密凭据
 */
function decryptCredentials(encrypted) {
  try {
    const decoded = atob(encrypted);
    const [email, password] = decoded.split(':');
    return { email, password };
  } catch (e) {
    return null;
  }
}

/**
 * 调用云端 API（带重试）
 */
async function cloudRequest(method, path, body = null, retries = 3) {
  if (!syncState.deviceToken) {
    throw new Error('No device token');
  }
  
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const options = {
        method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${syncState.deviceToken}`
        }
      };
      
      if (body) {
        options.body = JSON.stringify(body);
      }
      
      const resp = await fetch(`${CLOUD_CONFIG.API_BASE}${path}`, options);
      
      if (resp.ok) {
        const contentType = resp.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
          return await resp.json();
        }
        return { success: true };
      }
      
      // 401 说明 device_token 已失效（被解绑或过期）
      if (resp.status === 401) {
        // 清除本地 token 和 profileId，避免反复无效请求
        syncState.deviceToken = null;
        syncState.profileId   = null;
        await storageSet({
          [CLOUD_CONFIG.KEYS.DEVICE_TOKEN]: null,
          [CLOUD_CONFIG.KEYS.PROFILE_ID]:   null
        });
        console.warn('[Cloud] Device token invalidated, cleared from storage');
        // 广播解绑事件，admin 面板 / popup 可监听并更新 UI
        chrome.runtime.sendMessage({ type: 'DEVICE_UNBOUND' }).catch(() => {});
        throw new Error('Device token expired');
      }
      
      const err = await resp.json().catch(() => ({ error: 'Request failed' }));
      throw new Error(err.error || 'Request failed');
      
    } catch (e) {
      console.error(`[Cloud] Attempt ${attempt + 1} failed:`, e.message);
      if (e.message.includes('expired') || e.message.includes('Unauthorized')) {
        throw e;  // 不重试token相关错误
      }
      if (attempt < retries - 1) {
        await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
      }
    }
  }
  
  throw new Error('Max retries exceeded');
}

/**
 * 拉取云端配置
 * 仅当云端版本号比本地更新时才覆盖本地配置
 */
async function pullCloudConfig() {
  try {
    const result = await cloudRequest('GET', '/device/config');

    if (result.data) {
      const cloudVersion = result.version || 0;

      // 版本未更新，跳过覆盖
      if (cloudVersion > 0 && cloudVersion <= syncState.lastConfigVersion) {
        console.log('[Cloud] Config up to date, skip pull (local:', syncState.lastConfigVersion, 'cloud:', cloudVersion, ')');
        // 仍然更新 lastSync 时间
        await storageSet({ [CLOUD_CONFIG.KEYS.LAST_SYNC]: Date.now() });
        return false;
      }

      // 保存云端快照
      await storageSet({
        [CLOUD_CONFIG.KEYS.LOCAL_CONFIG]: result.data,
        [CLOUD_CONFIG.KEYS.CONFIG_VERSION]: cloudVersion,
        [CLOUD_CONFIG.KEYS.LAST_SYNC]: Date.now()
      });

      // 合并到本地配置（云端字段优先，但保留本地独有字段）
      const localConfig = await getConfig();
      const mergedConfig = {
        ...localConfig,
        ...result.data,
        // 以下字段始终保持本地值（设备运行时状态，不跟随云端）
        adminPasswordHash: localConfig.adminPasswordHash,
        isInitialized:     localConfig.isInitialized,
        tempWhitelist:     localConfig.tempWhitelist,
        lockedDomains:     localConfig.lockedDomains,
        quotaState:        localConfig.quotaState,   // 配额锁定状态是本地计时结果，不从云端同步
      };
      await saveConfig(mergedConfig);
      await updateDeclarativeRules(mergedConfig);

      syncState.lastConfigVersion = cloudVersion;
      console.log('[Cloud] Config updated, version:', cloudVersion);
      return true;
    }
  } catch (e) {
    console.error('[Cloud] Failed to pull config:', e.message);
  }
  return false;
}

/**
 * 读取指定日期的统计并转为上传格式
 * storage 格式：{ "stats_2026-04-10": { "github.com": 120, "youtube.com": 60 } }
 * 上传格式：[{ domain, active_sec, passive_sec }]
 */
function extractStatsForDate(statsObj, dateStr) {
  const key = `${STATS_KEY_PREFIX}${dateStr}`;
  const dayStats = statsObj[key] || {};
  return Object.entries(dayStats)
    .filter(([, sec]) => typeof sec === 'number' && sec > 0)
    .map(([domain, sec]) => ({ domain, active_sec: sec, passive_sec: 0 }));
}

/**
 * 上传统计到云端
 * 每次同步将「近7天内有数据但还未成功上传」的日期全部上传
 */
async function uploadStats() {
  try {
    const statsStorage = await storageGet(null);
    const storage = await storageGet(CLOUD_CONFIG.KEYS.PENDING_STATS);
    let pendingStats = storage[CLOUD_CONFIG.KEYS.PENDING_STATS] || {};

    // 扫描近7天，把本地有记录但不在 pendingStats 里的日期加入队列
    for (let i = 0; i < 7; i++) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = formatDate(d);
      if (!pendingStats[dateStr]) {
        const dayData = extractStatsForDate(statsStorage, dateStr);
        if (dayData.length > 0) {
          pendingStats[dateStr] = { stats: dayData, timestamp: Date.now() };
        }
      } else {
        // 今天的数据每次都刷新（累计到最新）
        if (i === 0) {
          const dayData = extractStatsForDate(statsStorage, dateStr);
          if (dayData.length > 0) {
            pendingStats[dateStr] = { stats: dayData, timestamp: Date.now() };
          }
        }
      }
    }

    const dates = Object.keys(pendingStats);
    if (dates.length === 0) {
      console.log('[Cloud] No stats to upload');
      return;
    }

    console.log('[Cloud] Uploading stats for:', dates);

    for (const date of dates) {
      const { stats } = pendingStats[date];
      try {
        await cloudRequest('POST', '/device/stats', { date, stats });
        delete pendingStats[date];
        console.log('[Cloud] Stats uploaded:', date, `(${stats.length} domains)`);
      } catch (e) {
        console.error('[Cloud] Failed to upload stats for', date, e.message);
      }
    }

    // 保存剩余待上传（上传失败的留着下次重试）
    await storageSet({ [CLOUD_CONFIG.KEYS.PENDING_STATS]: pendingStats });

  } catch (e) {
    console.error('[Cloud] Failed to upload stats:', e.message);
  }
}

/**
 * 获取今日 Session 数据
 */
async function getTodaySessionData() {
  const storage = await storageGet(VISIT_SESSIONS_KEY);
  const sessions = storage[VISIT_SESSIONS_KEY] || [];
  const today = getDateKey();
  return sessions.filter(s => s.date === today);
}

/**
 * 上传 Session 到云端
 */
async function uploadSessions() {
  try {
    const sessions = await getTodaySessionData();
    if (sessions.length === 0) {
      console.log('[Cloud] No sessions to upload');
      return;
    }
    
    const today = getDateKey();
    await cloudRequest('POST', '/device/sessions/upload', { date: today, sessions });
    console.log('[Cloud] Sessions uploaded:', sessions.length);
    
  } catch (e) {
    console.error('[Cloud] Failed to upload sessions:', e.message);
  }
}

/**
 * 上传配置变更到云端
 */
async function uploadChangelog(action, beforeData, afterData) {
  try {
    await cloudRequest('POST', '/device/changelog', {
      action,
      before_data: beforeData,
      after_data: afterData
    });
    console.log('[Cloud] Changelog uploaded:', action);
  } catch (e) {
    console.error('[Cloud] Failed to upload changelog:', e.message);
  }
}

/**
 * 推送本地配置到云端（本地修改后立即同步）
 * 只推送 profile 配置字段，不包含本地敏感数据
 */
async function pushConfigToCloud(config) {
  if (!syncState.deviceToken || !syncState.profileId) return false;
  try {
    // 提取需要同步到云端的字段（排除本地专用数据）
    // 注意：quotaState / lockedDomains / tempWhitelist 是设备本地状态，不上传
    const cloudData = {
      mode:               config.mode,
      enabled:            config.enabled,
      studyList:          config.studyList,
      allowList:          config.allowList,
      blacklist:          config.blacklist,
      dailyOnlineQuota:   config.dailyOnlineQuota,
      dailyStudyQuota:    config.dailyStudyQuota,
      dailyRestQuota:     config.dailyRestQuota,
      domainQuotas:       config.domainQuotas,
      schedule:           config.schedule,
      restConfig:         config.restConfig,
      autoStudyConfig:    config.autoStudyConfig,
      tempWhitelistConfig:config.tempWhitelistConfig,
      interceptAction:    config.interceptAction,
      blockMessage:       config.blockMessage,
      version:            config.version,
    };

    const result = await cloudRequest('PUT', '/device/config', { data: cloudData });
    console.log('[Cloud] Config pushed to cloud');

    // 更新本地版本号
    if (result?.version) {
      syncState.lastConfigVersion = result.version;
      await storageSet({ [CLOUD_CONFIG.KEYS.CONFIG_VERSION]: result.version });
    }
    return true;
  } catch (e) {
    console.error('[Cloud] Failed to push config:', e.message);
    return false;
  }
}

/**
 * 同步主函数（每15分钟调用）
 */
async function syncNow() {
  if (syncState.isSyncing) {
    console.log('[Cloud] Sync already in progress');
    return;
  }
  
  syncState.isSyncing = true;
  
  try {
    // 1. 拉取配置
    await pullCloudConfig();
    
    // 2. 上报统计
    await uploadStats();
    
    console.log('[Cloud] Sync completed');
  } catch (e) {
    console.error('[Cloud] Sync failed:', e.message);
  } finally {
    syncState.isSyncing = false;
  }
}

/**
 * 心跳：通知云端设备在线，更新 last_seen
 * 每5分钟触发一次，轻量级请求
 */
async function sendHeartbeat() {
  if (!syncState.deviceToken) return;
  try {
    await cloudRequest('POST', '/device/heartbeat');
    console.log('[Cloud] Heartbeat sent');
  } catch (e) {
    // 心跳失败静默处理，不影响主流程
    console.warn('[Cloud] Heartbeat failed:', e.message);
  }
}

/**
 * 定时 Session 上传（每天8点）
 */
async function scheduledSessionUpload() {
  const now = new Date();
  if (now.getHours() === CLOUD_CONFIG.SESSION_UPLOAD_HOUR) {
    await uploadSessions();
  }
}

// ── 定时器设置 ─────────────────────────────────────────────────────────────────

// 每15分钟同步一次
chrome.alarms.create('cloudSync', {
  periodInMinutes: 15
});

// 每5分钟发一次心跳
chrome.alarms.create('cloudHeartbeat', {
  periodInMinutes: 5
});

// 每小时检查是否需要上传 Session
chrome.alarms.create('sessionUploadCheck', {
  periodInMinutes: 60
});

// 监听定时器事件
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'cloudSync') {
    await syncNow();
  } else if (alarm.name === 'cloudHeartbeat') {
    await sendHeartbeat();
  } else if (alarm.name === 'sessionUploadCheck') {
    await scheduledSessionUpload();
  }
});

// ── 启动时初始化 ───────────────────────────────────────────────────────────────

async function initCloudSync() {
  // 读取设备 token
  const storage = await storageGet([
    CLOUD_CONFIG.KEYS.DEVICE_TOKEN,
    CLOUD_CONFIG.KEYS.PROFILE_ID,
    CLOUD_CONFIG.KEYS.CONFIG_VERSION
  ]);
  
  syncState.deviceToken = storage[CLOUD_CONFIG.KEYS.DEVICE_TOKEN];
  syncState.profileId = storage[CLOUD_CONFIG.KEYS.PROFILE_ID];
  syncState.lastConfigVersion = storage[CLOUD_CONFIG.KEYS.CONFIG_VERSION] || 0;
  
  if (syncState.deviceToken) {
    console.log('[Cloud] Device token found, starting sync...');
    
    // 启动时立即同步一次
    await syncNow();
  } else {
    console.log('[Cloud] No device token, waiting for binding');
  }
}

// ── 常量 ──────────────────────────────────────────────────────────────────────

const STORAGE_VERSION = '1.3';
const CONFIG_KEY = 'guardian_config';
const HASH_KEY = 'guardian_hash';
const STATS_KEY_PREFIX = 'stats_';
const SESSION_KEY = 'guardian_session';
const SESSIONS_KEY = 'guardian_sessions';
const VISIT_SESSIONS_KEY = 'visit_sessions';     // 访问会话记录（隐私友好版）
const CHANGELOG_KEY = 'guardian_changelog';    // 配置变更日志
const MAX_CHANGELOG_ENTRIES = 100;               // 最多保留100条变更记录
const MAX_SESSION_DAYS = 14;                     // Session 保留14天
const MIN_SESSION_DURATION = 10;                 // 最短记录阈值（10秒）

// ── 默认配置 ──────────────────────────────────────────────────────────────────

const DEFAULT_CONFIG = {
  version: STORAGE_VERSION,
  adminPasswordHash: '',
  isInitialized: false,
  mode: 'whitelist',
  // 默认学习网站（新安装时自动加载）
  studyList: [
    // 核心生产力与协作
    'google.com', 'drive.google.com', 'docs.google.com', 'sheets.google.com', 'slides.google.com', 'meet.google.com', 'calendar.google.com', 'classroom.google.com', 'keep.google.com', 'colab.research.google.com',
    'office.com', 'onenote.com', 'outlook.live.com', 'planner.microsoft.com', 'to-do.office.com', 'teams.microsoft.com',
    // AI 增强与学术研究
    'openai.com', 'claude.ai', 'gemini.google.com', 'poe.com', 'perplexity.ai', 'notebooklm.google.com', 'elicit.org', 'consensus.app', 'scite.ai', 'wolframalpha.com', 'gamma.app',
    // 语言强化与写作辅助
    'quizlet.com', 'noredink.com', 'membean.com', 'achieve3000.com', 'quillbot.com', 'grammarly.com', 'overleaf.com', 'zotero.org', 'mendeley.com', 'owl.purdue.edu', 'citationmachine.net',
    // IB 专项资源
    'ibo.org', 'managebac.com', 'kognity.com', 'revisionvillage.com', 'savemyexams.com', 'ibdocuments.com', 'ibsurvival.com', 'lanterna.com', 'thinking.net', 'bioninja.com.au', 'theoryofknowledge.net',
    // 通用学习与在线课程
    'khanacademy.org', 'ocw.mit.edu', 'coursera.org', 'edx.org', 'brilliant.org', 'udemy.com', 'futurelearn.com', 'britannica.com',
    // 数学、物理与实验模拟
    'desmos.com', 'geogebra.org', 'symbolab.com', 'mathway.com', 'physicsclassroom.com', 'phet.colorado.edu', 'falstad.com', 'myphysicslab.com', 'logic.ly',
    // 计算机科学与电子工程
    'github.com', 'stackoverflow.com', 'leetcode.com', 'hackerrank.com', 'codingbat.com', 'replit.com', 'codepen.io', 'tinkercad.com', 'arduino.cc', 'raspberrypi.com', 'instructables.com',
    // 学术数据库与人文历史
    'arxiv.org', 'scholar.google.com', 'jstor.org', 'researchgate.net', 'semanticscholar.org', 'pubmed.ncbi.nlm.nih.gov', 'gutenberg.org', 'plato.stanford.edu',
    // 视觉设计与创意
    'canva.com', 'figma.com', 'photopea.com', 'pixlr.com',
    // 效率工具
    'notion.so', 'obsidian.md', 'ankiweb.net', 'trello.com', 'slack.com', 'reclaim.ai',
    // 教育认证
    'collegeboard.org'
  ],
  // 默认允许网站（不计学习时长，可正常访问）
  allowList: [
    // 搜索引擎
    'google.com', 'google.com.hk', 'bing.com', 'baidu.com', 'search.brave.com', 'duckduckgo.com',
    // 问答社区
    'stackexchange.com', 'reddit.com',
    // 视频/音乐
    'youtube.com', 'music.youtube.com', 'spotify.com', 'music.163.com', 'bilibili.com',
    // 百科/参考
    'wikipedia.org', 'britannica.com', 'wolframalpha.com'
  ],
  whitelist: [],
  // 默认黑名单（始终拦截）
  blacklist: ['douyin.com', 'tiktok.com'],
  // 每日时长配额（分钟，0 = 不限制）
  dailyOnlineQuota: 1200,  // 每日在线时长上限：20小时
  dailyStudyQuota:  480,   // 每日在线学习时长上限：8小时
  dailyRestQuota:   180,   // 每日在线休息时长上限：3小时
  domainQuotas: {},
  // 配额锁定状态（每日重置）
  quotaState: { onlineLocked: false, studyLocked: false, restLocked: false },
  schedule: {
    enabled: false,
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
  interceptAction: 'block',
  lockOnQuotaExceeded: true,
  enabled: true,
  blockMessage: '此网站已被家长限制访问。',
  lockedDomains: [],
  restConfig: {
    reminderInterval: 15,
    maxRestDuration: 60
  },
  autoStudyConfig: {
    enabled: true,
    requiredSeconds: 60  // 60秒自动切换（6次心跳 x 10秒）
  },
  // 临时白名单配置
  tempWhitelistConfig: {
    duration: 60  // 默认60分钟
  },
  // 临时白名单数据
  tempWhitelist: {
    domains: {},  // { 'domain.com': expiresAtTimestamp }
    records: []   // [{ domain, addedAt, expiresAt }]
  },
  updatedAt: null
};

// ── 默认会话状态 ───────────────────────────────────────────────────────────────

const DEFAULT_SESSION = {
  currentMode: 'study',       // 当前模式：study 或 rest
  lastActiveDate: null,        // 最后活跃日期（用于每日重置）
  studySession: { totalSeconds: 0 },
  restSession:  { totalSeconds: 0 }
};

// ── 工具函数 ──────────────────────────────────────────────────────────────────

function getDateKey() {
  return formatDate(new Date());
}

function formatDate(date) {
  // 使用本地时间，避免时区偏差（UTC+8 用户 0:00-8:00 会记到 UTC 昨天）
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function extractDomain(url) {
  try {
    const u = new URL(url);
    return u.hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

function isSpecialUrl(url) {
  return !url ||
    url.startsWith('chrome://') ||
    url.startsWith('chrome-extension://') ||
    url.startsWith('about:') ||
    url.startsWith('edge://') ||
    url.startsWith('devtools://');
}

function matchDomain(domain, pattern) {
  const d = domain.replace(/^www\./, '');
  const p = pattern.replace(/^www\./, '');
  return d === p || d.endsWith('.' + p);
}

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

// ── 存储操作 ──────────────────────────────────────────────────────────────────

async function getConfig() {
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

async function saveConfig(config) {
  config.updatedAt = Date.now();
  const hash = await computeHash(config);
  return new Promise((resolve) => {
    chrome.storage.local.set({ [CONFIG_KEY]: config, [HASH_KEY]: hash }, resolve);
  });
}

async function getTodayStats() {
  const today = getDateKey();
  return new Promise((resolve) => {
    chrome.storage.local.get(STATS_KEY_PREFIX + today, (result) => {
      resolve(result[STATS_KEY_PREFIX + today] || {});
    });
  });
}

async function addDomainTime(domain, seconds) {
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

async function getStatsRange(days = 7) {
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

async function cleanOldStats() {
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

// ── 会话存储操作 ───────────────────────────────────────────────────────────────

async function getSession() {
  return new Promise((resolve) => {
    chrome.storage.local.get(SESSION_KEY, (result) => {
      const session = result[SESSION_KEY] || { ...DEFAULT_SESSION };
      resolve(session);
    });
  });
}

async function saveSession(session) {
  return new Promise((resolve) => {
    chrome.storage.local.set({ [SESSION_KEY]: session }, resolve);
  });
}

// ── 临时白名单管理 ─────────────────────────────────────────────────────────────

async function getTempWhitelist() {
  const config = await getConfig();
  return config.tempWhitelist || { domains: {}, records: [] };
}

async function addTempWhitelist(domain) {
  const config = await getConfig();
  if (!config.tempWhitelist) {
    config.tempWhitelist = { domains: {}, records: [] };
  }
  
  const duration = config.tempWhitelistConfig?.duration || 1;
  const now = Date.now();
  const expiresAt = now + duration * 60 * 1000;
  
  config.tempWhitelist.domains[domain] = expiresAt;
  config.tempWhitelist.records.unshift({
    domain,
    addedAt: now,
    expiresAt
  });
  
  // 只保留最近100条记录
  if (config.tempWhitelist.records.length > 100) {
    config.tempWhitelist.records = config.tempWhitelist.records.slice(0, 100);
  }
  
  await saveConfig(config);
  await updateDeclarativeRules();
  
  return { domain, expiresAt };
}

/**
 * 临时豁免：绕过配额锁定或时间段限制
 * exemptType: 'quota' | 'schedule'
 */
async function addTempExemption(exemptType, domain) {
  const config = await getConfig();
  const duration = config.tempWhitelistConfig?.duration || 1;
  const expiresAt = Date.now() + duration * 60 * 1000;

  if (!config.tempExemptions) {
    config.tempExemptions = { quotaUntil: 0, scheduleUntil: 0 };
  }

  if (exemptType === 'quota') {
    config.tempExemptions.quotaUntil = expiresAt;
  } else if (exemptType === 'schedule') {
    config.tempExemptions.scheduleUntil = expiresAt;
  }

  // 对于单域名配额锁定，也加入 tempWhitelist（双重保障）
  if (domain && domain !== 'all') {
    if (!config.tempWhitelist) config.tempWhitelist = { domains: {}, records: [] };
    config.tempWhitelist.domains[domain] = expiresAt;
  }

  await saveConfig(config);
  return { expiresAt };
}

async function cleanExpiredTempWhitelist() {
  const config = await getConfig();
  if (!config.tempWhitelist || !config.tempWhitelist.domains) return false;
  
  const now = Date.now();
  let changed = false;
  
  for (const domain of Object.keys(config.tempWhitelist.domains)) {
    if (config.tempWhitelist.domains[domain] <= now) {
      delete config.tempWhitelist.domains[domain];
      changed = true;
    }
  }
  
  if (changed) {
    await saveConfig(config);
    await updateDeclarativeRules();
  }
  
  return changed;
}

async function getSessionsRange(days = 30) {
  return new Promise((resolve) => {
    chrome.storage.local.get(SESSIONS_KEY, (result) => {
      const sessions = result[SESSIONS_KEY] || {};
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

async function updateDailySession(date, studySeconds, restSeconds) {
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

async function cleanOldSessions() {
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

// ── Visit Sessions 存储 ───────────────────────────────────────────────────────────

async function getVisitSessions(days = 14) {
  return new Promise((resolve) => {
    chrome.storage.local.get(VISIT_SESSIONS_KEY, (result) => {
      const sessions = result[VISIT_SESSIONS_KEY] || [];
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - days);
      const cutoffMs = cutoff.getTime();
      
      // 过滤：日期范围内 + 时长 >= 10秒
      const filtered = sessions.filter(s => {
        return s.startAt >= cutoffMs && s.duration >= MIN_SESSION_DURATION;
      });
      
      resolve(filtered);
    });
  });
}

async function addVisitSession(session) {
  return new Promise((resolve) => {
    chrome.storage.local.get(VISIT_SESSIONS_KEY, (result) => {
      const sessions = result[VISIT_SESSIONS_KEY] || [];
      
      // 添加新会话
      sessions.push(session);
      
      // 按结束时间排序（新的在前）
      sessions.sort((a, b) => b.endAt - a.endAt);
      
      // 保留最多 500 条
      const trimmed = sessions.slice(0, 500);
      
      chrome.storage.local.set({ [VISIT_SESSIONS_KEY]: trimmed }, resolve);
    });
  });
}

async function cleanOldVisitSessions() {
  return new Promise((resolve) => {
    chrome.storage.local.get(VISIT_SESSIONS_KEY, (result) => {
      const sessions = result[VISIT_SESSIONS_KEY] || [];
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - MAX_SESSION_DAYS);
      const cutoffMs = cutoff.getTime();
      
      const filtered = sessions.filter(s => s.endAt >= cutoffMs);
      
      chrome.storage.local.set({ [VISIT_SESSIONS_KEY]: filtered }, resolve);
    });
  });
}

// ── ChangeLog 存储 ───────────────────────────────────────────────────────────────

async function getChangelog(limit = 20) {
  return new Promise((resolve) => {
    chrome.storage.local.get(CHANGELOG_KEY, (result) => {
      const logs = result[CHANGELOG_KEY] || [];
      resolve(logs.slice(0, limit));
    });
  });
}

async function addChangelogEntry(action, target, details, before = null, after = null) {
  return new Promise((resolve) => {
    chrome.storage.local.get(CHANGELOG_KEY, (result) => {
      const logs = result[CHANGELOG_KEY] || [];
      
      const entry = {
        ts: Date.now(),
        date: getDateKey(),
        action,
        target,
        details,
        before,
        after
      };
      
      logs.unshift(entry);
      
      // 保留最多 MAX_CHANGELOG_ENTRIES 条
      const trimmed = logs.slice(0, MAX_CHANGELOG_ENTRIES);
      
      chrome.storage.local.set({ [CHANGELOG_KEY]: trimmed }, resolve);
    });
  });
}

// ── 学习/休息状态管理 ─────────────────────────────────────────────────────────

async function switchToStudy(source = 'manual') {
  const session = await getSession();
  const config = await getConfig();

  // 记录变更前状态
  const beforeMode = session.currentMode;
  
  session.currentMode = 'study';
  await saveSession(session);

  config.mode = 'whitelist';
  await saveConfig(config);
  await updateDeclarativeRules(config);

  clearRestAlarms();
  
  // 记录到变更日志
  const action = source === 'auto' ? 'auto_switch_to_study' : 'manual_switch_to_study';
  await addChangelogEntry(
    action,
    'mode',
    source === 'auto' ? '系统自动切换到学习模式' : '手动切换到学习模式',
    beforeMode,
    'study'
  );

  return session;
}

async function switchToRest(source = 'manual') {
  const session = await getSession();
  const config = await getConfig();

  // 记录变更前状态
  const beforeMode = session.currentMode;

  session.currentMode = 'rest';
  await saveSession(session);

  config.mode = 'blacklist';
  await saveConfig(config);
  await updateDeclarativeRules(config);

  setupRestAlarms();
  
  // 记录到变更日志
  const action = source === 'auto' ? 'auto_switch_to_rest' : 'manual_switch_to_rest';
  await addChangelogEntry(
    action,
    'mode',
    source === 'auto' ? '系统自动切换到休息模式' : '手动切换到休息模式',
    beforeMode,
    'rest'
  );

  return session;
}

function setupRestAlarms() {
  // 先清除旧的休息闹钟
  chrome.alarms.getAll((alarms) => {
    alarms.forEach(alarm => {
      if (alarm.name === 'rest_reminder' || alarm.name === 'rest_forced') {
        chrome.alarms.clear(alarm.name);
      }
    });
  });

  chrome.storage.local.get([CONFIG_KEY], (result) => {
    const config = result[CONFIG_KEY] || DEFAULT_CONFIG;
    const restConfig = config.restConfig || { reminderInterval: 15, maxRestDuration: 60 };

    if (restConfig.reminderInterval > 0) {
      chrome.alarms.create('rest_reminder', { periodInMinutes: restConfig.reminderInterval });
    }

    if (restConfig.maxRestDuration > 0) {
      chrome.alarms.create('rest_forced', { periodInMinutes: restConfig.maxRestDuration });
    }
  });
}

function clearRestAlarms() {
  chrome.alarms.getAll((alarms) => {
    alarms.forEach(alarm => {
      if (alarm.name === 'rest_reminder' || alarm.name === 'rest_forced') {
        chrome.alarms.clear(alarm.name);
      }
    });
  });
}

async function handleRestReminder() {
  const session = await getSession();
  if (session.currentMode !== 'rest') return;

  chrome.notifications.create({
    type: 'basic',
    iconUrl: 'icons/icon48.png',
    title: 'TimeOnChrome - 休息提醒',
    message: `已休息 ${session.restSession.totalSeconds / 60 | 0} 分钟，是否继续休息或开始学习？`,
    buttons: [{ title: '继续休息' }, { title: '开始学习' }]
  });
}

async function handleRestForcedEnd() {
  const session = await getSession();
  if (session.currentMode !== 'rest') return;

  await switchToStudy();

  chrome.notifications.create({
    type: 'basic',
    iconUrl: 'icons/icon48.png',
    title: 'TimeOnChrome - 休息结束',
    message: '休息时间已达上限，已恢复学习模式'
  });
}

chrome.notifications.onButtonClicked.addListener(async (notificationId, buttonIndex) => {
  if (notificationId && notificationId.includes('休息提醒')) {
    if (buttonIndex === 0) {
      // 继续休息
      clearRestAlarms();
      setupRestAlarms();
    } else if (buttonIndex === 1) {
      // 开始学习
      await switchToStudy();
    }
  }
});

async function restoreSession() {
  const session = await getSession();
  const today = getDateKey();
  
  // 仅重置日期变化时的标记
  if (session.lastActiveDate !== today) {
    session.lastActiveDate = today;
    await saveSession(session);
  }
  // 默认进入学习模式（仅 session，不改网络规则）
  session.currentMode = 'study';
  await saveSession(session);
}

// ── 计时状态（新模型：纯事件驱动，background 自主计时）──────────────────────

let activeTabId = null;
let activeTabDomain = null;
let windowHasFocus = true;        // Chrome 窗口是否有焦点
let userIsIdle = false;           // 用户是否 idle（2分钟无操作）
let domainActiveStartTime = null; // 条件A 开始计时的时间戳

// 条件B：后台媒体播放的 tab 集合
// tabId → { domain: string, lastFlushTime: number }
const mediaPlayingTabs = new Map();

// ── Visit Session 跟踪状态 ────────────────────────────────────────────────────
let visitSessionStart = null;
let visitSessionDomain = null;
let visitActiveSeconds = 0;   // 条件A 累计时间（主动使用）
let visitPassiveSeconds = 0;  // 条件B 累计时间（后台媒体）

// ── Visit Session 辅助函数 ────────────────────────────────────────────────────

function updateVisitSession(domain, type, seconds) {
  if (visitSessionDomain !== domain || seconds <= 0) return;
  if (type === 'active') visitActiveSeconds += seconds;
  else visitPassiveSeconds += seconds;
}

function endVisitSession(endReason) {
  if (!visitSessionDomain || !visitSessionStart) return;

  const now = Date.now();
  const duration = Math.floor((now - visitSessionStart) / 1000);

  if (duration >= MIN_SESSION_DURATION) {
    const session = {
      id: crypto.randomUUID(),
      domain: visitSessionDomain,
      date: getDateKey(),
      startAt: visitSessionStart,
      endAt: now,
      duration,
      activeTime: visitActiveSeconds,
      passiveTime: visitPassiveSeconds,
      endReason
    };
    addVisitSession(session);
  }

  visitSessionStart = null;
  visitSessionDomain = null;
  visitActiveSeconds = 0;
  visitPassiveSeconds = 0;
}

// ── 核心计时函数 ──────────────────────────────────────────────────────────────

/**
 * 刷新条件A时间：把 domainActiveStartTime 到现在的秒数计入统计，然后清零起点。
 * 返回本次刷新的秒数。
 */
async function flushActiveTime(now = Date.now()) {
  if (!domainActiveStartTime || !activeTabDomain) return 0;
  const elapsed = Math.floor((now - domainActiveStartTime) / 1000);
  domainActiveStartTime = null;
  if (elapsed <= 0) return 0;
  await addDomainTime(activeTabDomain, elapsed);
  updateVisitSession(activeTabDomain, 'active', elapsed);
  return elapsed;
}

/**
 * 恢复条件A计时：在状态满足（窗口有焦点 + 用户非 idle + 有激活域名）后调用。
 */
function resumeActiveTime() {
  if (windowHasFocus && !userIsIdle && activeTabDomain) {
    domainActiveStartTime = Date.now();
  }
}

/**
 * 开始新的 visit session（切换域名或 tab 时调用）。
 */
function beginVisitSession(domain) {
  if (!domain) return;
  visitSessionStart = Date.now();
  visitSessionDomain = domain;
  visitActiveSeconds = 0;
  visitPassiveSeconds = 0;
}

/**
 * tick_timer alarm 每分钟触发：flush 条件A余量，flush 条件B后台媒体。
 */
async function handleTickTimer() {
  const now = Date.now();

  // 条件A flush + 重置起点
  if (domainActiveStartTime && activeTabDomain) {
    const elapsed = Math.floor((now - domainActiveStartTime) / 1000);
    if (elapsed > 0) {
      await addDomainTime(activeTabDomain, elapsed);
      updateVisitSession(activeTabDomain, 'active', elapsed);
    }
    domainActiveStartTime = (windowHasFocus && !userIsIdle) ? now : null;
  }

  // 条件B flush：只处理不被条件A覆盖的后台媒体 tab
  for (const [tabId, info] of mediaPlayingTabs) {
    if (tabId === activeTabId && windowHasFocus && !userIsIdle) continue;
    const elapsed = Math.floor((now - info.lastFlushTime) / 1000);
    if (elapsed > 0) {
      await addDomainTime(info.domain, elapsed);
      updateVisitSession(info.domain, 'passive', elapsed);
      info.lastFlushTime = now;
    }
  }

  // 检查自动切换学习模式
  await checkAutoStudy();
}

// ── 自动切换学习模式 ──────────────────────────────────────────────────────────

let autoStudyDomain = null;   // 正在计时的学习域名
let autoStudyStartTime = null; // 计时开始时间

async function checkAutoStudy() {
  const session = await getSession();
  if (session.currentMode !== 'rest') {
    autoStudyDomain = null;
    autoStudyStartTime = null;
    return;
  }

  const config = await getConfig();
  if (!config?.autoStudyConfig?.enabled) return;

  const isOnStudySite = activeTabDomain &&
    (config.studyList || []).some(w => matchDomain(activeTabDomain, w));
  const isActive = windowHasFocus && !userIsIdle;

  if (isOnStudySite && isActive) {
    if (autoStudyDomain !== activeTabDomain) {
      autoStudyDomain = activeTabDomain;
      autoStudyStartTime = Date.now();
    } else {
      const elapsed = Math.floor((Date.now() - autoStudyStartTime) / 1000);
      const required = config.autoStudyConfig.requiredSeconds || 60;
      if (elapsed >= required) {
        autoStudyDomain = null;
        autoStudyStartTime = null;
        await switchToStudy('auto');
        chrome.notifications.create({
          type: 'basic',
          iconUrl: 'icons/icon48.png',
          title: 'TimeOnChrome',
          message: '检测到你在学习，已自动切换到学习模式 📚'
        });
      }
    }
  } else {
    autoStudyDomain = null;
    autoStudyStartTime = null;
  }
}

/**
 * 启动时初始化计时状态：查询当前焦点、激活 tab、idle 状态，然后开始计时。
 */
async function initTimingState() {
  const windows = await chrome.windows.getAll({ windowTypes: ['normal'] });
  const focusedWindow = windows.find(w => w.focused);
  windowHasFocus = !!focusedWindow;

  if (focusedWindow) {
    const [tab] = await chrome.tabs.query({ active: true, windowId: focusedWindow.id }).catch(() => []);
    if (tab && tab.url && !isSpecialUrl(tab.url)) {
      activeTabId = tab.id;
      activeTabDomain = extractDomain(tab.url);
      beginVisitSession(activeTabDomain);
    }
  }

  const idleState = await chrome.idle.queryState(120);
  userIsIdle = idleState !== 'active';

  resumeActiveTime();
}

// ── 初始化 ───────────────────────────────────────────────────────────────────

chrome.runtime.onInstalled.addListener(async (details) => {
  // console.log('[background] onInstalled, reason:', details.reason);
  
  if (details.reason === 'install') {
    const config = { ...DEFAULT_CONFIG };
    await saveConfig(config);
    await saveSession({ ...DEFAULT_SESSION });
    // 首次安装：打开引导页
    chrome.tabs.create({ url: chrome.runtime.getURL('bind.html') + '?welcome=1' });
  } else if (details.reason === 'update') {
    const stored = await new Promise(resolve => {
      chrome.storage.local.get([CONFIG_KEY, HASH_KEY], resolve);
    });
    
    if (stored[CONFIG_KEY]) {
      const existingConfig = stored[CONFIG_KEY];
      const migratedConfig = {
        ...DEFAULT_CONFIG,
        ...existingConfig,
        version: DEFAULT_CONFIG.version,
        adminPasswordHash: existingConfig.adminPasswordHash || '',
        isInitialized: existingConfig.isInitialized || false,
        restConfig: existingConfig.restConfig || DEFAULT_CONFIG.restConfig,
        studyList: existingConfig.studyList || existingConfig.whitelist || DEFAULT_CONFIG.studyList,
        allowList: existingConfig.allowList || DEFAULT_CONFIG.allowList,
        autoStudyConfig: existingConfig.autoStudyConfig || DEFAULT_CONFIG.autoStudyConfig,
        // 迁移旧 dailyQuota → dailyOnlineQuota
        dailyOnlineQuota: existingConfig.dailyOnlineQuota ?? (existingConfig.dailyQuota > 0 ? existingConfig.dailyQuota : DEFAULT_CONFIG.dailyOnlineQuota),
        dailyStudyQuota:  existingConfig.dailyStudyQuota  ?? DEFAULT_CONFIG.dailyStudyQuota,
        dailyRestQuota:   existingConfig.dailyRestQuota   ?? DEFAULT_CONFIG.dailyRestQuota,
        quotaState: { onlineLocked: false, studyLocked: false, restLocked: false }
      };
      
      await saveConfig(migratedConfig);
    }
  }
  
  setupAlarms();
  await updateDeclarativeRules();
  await restoreSession();
  await initTimingState();
  await initCloudSync();
});

chrome.runtime.onStartup.addListener(async () => {
  // console.log('[background] onStartup');
  setupAlarms();
  await updateDeclarativeRules();
  await resetDailyLockedDomains(true); // 启动时强制检查（可能是隔天重启）
  await restoreSession();
  await initTimingState();
  await initCloudSync();;
});

// ── Alarms ─────────────────────────────────────────────────────────────────────

function setupAlarms() {
  chrome.alarms.create('tick_timer', { periodInMinutes: 1 });
  chrome.alarms.create('quota_check', { periodInMinutes: 1 });
  chrome.alarms.create('daily_cleanup', { periodInMinutes: 60 });
  chrome.alarms.create('keepalive', { periodInMinutes: 0.5 });
  chrome.alarms.create('temp_whitelist_cleanup', { periodInMinutes: 1 });
}

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'tick_timer') {
    await handleTickTimer();
  } else if (alarm.name === 'quota_check') {
    await checkAllTabsQuota();
  } else if (alarm.name === 'daily_cleanup') {
    await cleanOldStats();
    await cleanOldSessions();
    await resetDailyLockedDomains();
  } else if (alarm.name === 'keepalive') {
    // 防 SW 休眠 + 每 30 秒持久化一次当前计时，减少 SW 意外终止时的数据丢失
    await flushActiveTime();
    resumeActiveTime();
  } else if (alarm.name === 'rest_reminder') {
    await handleRestReminder();
  } else if (alarm.name === 'rest_forced') {
    await handleRestForcedEnd();
  } else if (alarm.name === 'temp_whitelist_cleanup') {
    await cleanExpiredTempWhitelist();
  }
});

// ── Idle 检测 ──────────────────────────────────────────────────────────────────

chrome.idle.setDetectionInterval(120); // 2 分钟无操作 → idle

chrome.idle.onStateChanged.addListener(async (state) => {
  if (state === 'idle' || state === 'locked') {
    await flushActiveTime();
    userIsIdle = true;
  } else { // 'active'
    userIsIdle = false;
    resumeActiveTime();
  }
});

// ── 标签页事件监听 ────────────────────────────────────────────────────────────

// 防止循环拦截
let isBlockingInProgress = new Set();

// webNavigation.onCommitted：仅用于拦截检查，不做计时
chrome.webNavigation.onCommitted.addListener(async (details) => {
  if (details.frameId !== 0) return;
  const { tabId, url } = details;

  if (url.includes('blocked.html')) return;
  if (isSpecialUrl(url)) return;
  if (isBlockingInProgress.has(tabId)) return;

  isBlockingInProgress.add(tabId);
  await checkAndBlock(tabId, url);
  setTimeout(() => isBlockingInProgress.delete(tabId), 1000);
});

// ── Tab / 窗口事件：驱动条件A计时 ────────────────────────────────────────────

chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  await flushActiveTime();
  endVisitSession('tab_switch');

  const tab = await chrome.tabs.get(tabId).catch(() => null);
  activeTabId = tabId;
  activeTabDomain = (tab?.url && !isSpecialUrl(tab.url)) ? extractDomain(tab.url) : null;

  beginVisitSession(activeTabDomain);
  resumeActiveTime();
});

chrome.tabs.onRemoved.addListener(async (tabId) => {
  if (tabId === activeTabId) {
    await flushActiveTime();
    endVisitSession('tab_closed');
    activeTabId = null;
    activeTabDomain = null;
  }
  // 后台媒体 tab 关闭：flush 剩余时间
  if (mediaPlayingTabs.has(tabId)) {
    const info = mediaPlayingTabs.get(tabId);
    if (!(tabId === activeTabId && windowHasFocus && !userIsIdle)) {
      const elapsed = Math.floor((Date.now() - info.lastFlushTime) / 1000);
      if (elapsed > 0) await addDomainTime(info.domain, elapsed);
    }
    mediaPlayingTabs.delete(tabId);
  }
});

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo) => {
  if (!changeInfo.url) return;
  const newDomain = isSpecialUrl(changeInfo.url) ? null : extractDomain(changeInfo.url);

  // 更新激活 tab 的域名
  if (tabId === activeTabId && newDomain !== activeTabDomain) {
    await flushActiveTime();
    endVisitSession('navigation');
    activeTabDomain = newDomain;
    beginVisitSession(activeTabDomain);
    resumeActiveTime();
  }

  // 更新后台媒体 tab 的域名
  if (mediaPlayingTabs.has(tabId) && tabId !== activeTabId) {
    const info = mediaPlayingTabs.get(tabId);
    const elapsed = Math.floor((Date.now() - info.lastFlushTime) / 1000);
    if (elapsed > 0) await addDomainTime(info.domain, elapsed);
    info.domain = newDomain || info.domain;
    info.lastFlushTime = Date.now();
  }
});

chrome.windows.onFocusChanged.addListener(async (windowId) => {
  if (windowId === chrome.windows.WINDOW_ID_NONE) {
    await flushActiveTime();
    windowHasFocus = false;
  } else {
    windowHasFocus = true;
    // 更新 activeTab 为当前获焦窗口的激活 tab
    const [tab] = await chrome.tabs.query({ active: true, windowId }).catch(() => []);
    if (tab && tab.url && !isSpecialUrl(tab.url)) {
      const newDomain = extractDomain(tab.url);
      if (tab.id !== activeTabId || newDomain !== activeTabDomain) {
        await flushActiveTime();
        endVisitSession('window_focus');
        activeTabId = tab.id;
        activeTabDomain = newDomain;
        beginVisitSession(activeTabDomain);
      }
    }
    resumeActiveTime();
  }
});

// ── 拦截检查 ──────────────────────────────────────────────────────────────────

async function checkAndBlock(tabId, url) {
  if (isSpecialUrl(url)) return false;
  
  // 跳过 blocked.html 页面
  if (url.includes('blocked.html')) return false;

  const config = await getConfig();
  if (!config.enabled) return false;

  const domain = extractDomain(url);
  if (!domain) return false;

  // 0. 预计算临时豁免（供后续所有检查使用）
  const _now = Date.now();
  const _isTempAllowed    = config.tempWhitelist?.domains?.[domain] > _now;
  const _isQuotaExempt    = (config.tempExemptions?.quotaUntil    || 0) > _now;
  const _isScheduleExempt = (config.tempExemptions?.scheduleUntil || 0) > _now;

  // 1. 检查时间段限制（临时豁免可绕过）
  if (config.schedule.enabled && !isWithinSchedule(config.schedule)) {
    if (_isScheduleExempt || _isTempAllowed) return false;
    await blockTab(tabId, domain, 'schedule', config.blockMessage);
    return true;
  }

  // 2. 白名单模式：不在白名单就拦截
  if (config.mode === 'whitelist') {
    const allowed = (config.studyList || []).some(w => matchDomain(domain, w)) ||
                 (config.allowList || []).some(w => matchDomain(domain, w)) ||
                 (config.tempWhitelist?.domains?.[domain] > Date.now());
    
    if (!allowed) {
      await blockTab(tabId, domain, 'whitelist', config.blockMessage);
      return true;
    }
  }

  // 3. 黑名单模式：在黑名单就拦截
  if (config.mode === 'blacklist') {
    const blocked = config.blacklist.some(b => matchDomain(domain, b));
    if (blocked) {
      await blockTab(tabId, domain, 'blacklist', config.blockMessage);
      return true;
    }
  }

  // 4. 检查配额锁定状态（临时豁免可绕过）
  if (_isTempAllowed || _isQuotaExempt) {
    return false; // 临时豁免，放行
  }

  const qs = config.quotaState || {};
  if (qs.onlineLocked) {
    await blockTab(tabId, domain, 'quota_online', config.blockMessage);
    return true;
  }
  const isStudyDomain = (config.studyList || []).some(p => matchDomain(domain, p));
  if (qs.restLocked && !isStudyDomain) {
    await blockTab(tabId, domain, 'quota_rest', config.blockMessage);
    return true;
  }
  if (qs.studyLocked && isStudyDomain) {
    await blockTab(tabId, domain, 'quota_study', config.blockMessage);
    return true;
  }
  // 单站点配额锁定
  if (config.lockedDomains && config.lockedDomains.includes(domain)) {
    await blockTab(tabId, domain, 'quota', config.blockMessage);
    return true;
  }

  return false;
}

async function checkAllTabsQuota() {
  const config = await getConfig();
  if (!config.enabled) return;

  const stats = await getTodayStats();

  // 按 studyList 区分学习/休息时长
  let studySeconds = 0, totalSeconds = 0;
  for (const [domain, seconds] of Object.entries(stats)) {
    totalSeconds += seconds;
    if ((config.studyList || []).some(p => matchDomain(domain, p))) {
      studySeconds += seconds;
    }
  }
  const restSeconds  = totalSeconds - studySeconds;
  const totalMinutes = Math.floor(totalSeconds / 60);
  const studyMinutes = Math.floor(studySeconds / 60);
  const restMinutes  = Math.floor(restSeconds  / 60);

  // 计算新锁定状态
  const dailyOnlineQuota = config.dailyOnlineQuota ?? config.dailyQuota ?? 0;
  const newState = {
    onlineLocked: dailyOnlineQuota > 0 && totalMinutes >= dailyOnlineQuota,
    studyLocked:  (config.dailyStudyQuota || 0) > 0 && studyMinutes >= config.dailyStudyQuota,
    restLocked:   (config.dailyRestQuota  || 0) > 0 && restMinutes  >= config.dailyRestQuota
  };

  const oldState = config.quotaState || {};
  const stateChanged = newState.onlineLocked !== oldState.onlineLocked ||
                       newState.studyLocked  !== oldState.studyLocked  ||
                       newState.restLocked   !== oldState.restLocked;

  if (stateChanged) {
    config.quotaState = newState;
    await saveConfig(config);

    // 刚触发：推送通知并关闭违规 Tab
    if (newState.onlineLocked && !oldState.onlineLocked) {
      chrome.notifications.create({ type:'basic', iconUrl:'icons/icon48.png', title:'TimeOnChrome', message:'今日在线时间已达上限，所有网站已锁定。' });
      await lockAllBrowsing();
      return;
    }
    if (newState.restLocked && !oldState.restLocked) {
      chrome.notifications.create({ type:'basic', iconUrl:'icons/icon48.png', title:'TimeOnChrome', message:'今日休息时间已达上限（' + Math.round(config.dailyRestQuota / 60 * 10) / 10 + ' 小时），娱乐网站已锁定。' });
      await closeQuotaViolatingTabs(config, newState);
    }
    if (newState.studyLocked && !oldState.studyLocked) {
      chrome.notifications.create({ type:'basic', iconUrl:'icons/icon48.png', title:'TimeOnChrome', message:'今日学习时间已达上限（' + Math.round(config.dailyStudyQuota / 60 * 10) / 10 + ' 小时），学习网站已锁定。' });
      await closeQuotaViolatingTabs(config, newState);
    }
  }

  if (newState.onlineLocked) {
    await lockAllBrowsing();
    return;
  }

  // 单站点配额检查
  const newlyLocked = [];
  for (const [domain, seconds] of Object.entries(stats)) {
    const minutes = Math.floor(seconds / 60);
    const quota = config.domainQuotas?.[domain];
    if (quota && quota > 0 && minutes >= quota) {
      if (!(config.lockedDomains || []).includes(domain)) {
        newlyLocked.push(domain);
      }
    }
  }

  if (newlyLocked.length > 0) {
    config.lockedDomains = [...(config.lockedDomains || []), ...newlyLocked];
    await saveConfig(config);
    await closeLockedTabs(newlyLocked);
    chrome.notifications.create({
      type: 'basic', iconUrl: 'icons/icon48.png', title: 'TimeOnChrome',
      message: `${newlyLocked.join(', ')} 今日使用时间已达上限`
    });
  }
}

// 关闭因配额锁定而违规的 Tab
async function closeQuotaViolatingTabs(config, quotaState) {
  const tabs = await chrome.tabs.query({});
  for (const tab of tabs) {
    if (!tab.url || isSpecialUrl(tab.url)) continue;
    const domain = extractDomain(tab.url);
    if (!domain) continue;
    const isStudy = (config.studyList || []).some(p => matchDomain(domain, p));
    if (quotaState.restLocked && !isStudy) {
      chrome.tabs.update(tab.id, { url: chrome.runtime.getURL('blocked.html') + `?reason=quota_rest&domain=${encodeURIComponent(domain)}` });
    } else if (quotaState.studyLocked && isStudy) {
      chrome.tabs.update(tab.id, { url: chrome.runtime.getURL('blocked.html') + `?reason=quota_study&domain=${encodeURIComponent(domain)}` });
    }
  }
}

async function lockAllBrowsing() {
  const tabs = await chrome.tabs.query({});
  for (const tab of tabs) {
    if (tab.url && !isSpecialUrl(tab.url)) {
      chrome.tabs.update(tab.id, {
        url: chrome.runtime.getURL('blocked.html') + '?reason=quota&domain=all'
      });
    }
  }
}

async function closeLockedTabs(domains) {
  const tabs = await chrome.tabs.query({});
  for (const tab of tabs) {
    if (!tab.url) continue;
    const domain = extractDomain(tab.url);
    if (domain && domains.some(d => matchDomain(domain, d))) {
      chrome.tabs.update(tab.id, {
        url: chrome.runtime.getURL('blocked.html') + `?reason=quota&domain=${encodeURIComponent(domain)}`
      });
    }
  }
}

async function blockTab(tabId, domain, reason, message) {
  const blockedUrl = chrome.runtime.getURL('blocked.html') +
    `?reason=${reason}&domain=${encodeURIComponent(domain)}&msg=${encodeURIComponent(message)}`;
  console.log('[blockTab]', reason, domain);
  chrome.tabs.update(tabId, { url: blockedUrl }).catch(() => {});
}

// （自动切换逻辑已移至 checkAutoStudy，由 tick_timer alarm 每分钟驱动）

// ── declarativeNetRequest 规则 ────────────────────────────────────────────────

async function updateDeclarativeRules(config) {
  const cfg = config || await getConfig();

  // 获取现有规则
  const existingRules = await chrome.declarativeNetRequest.getDynamicRules();
  const removeIds = existingRules.map(r => r.id);

  // 白名单模式 uses studyList + allowList + tempWhitelist
  if (cfg.mode === 'whitelist') {
    // 清理过期的临时白名单
    await cleanExpiredTempWhitelist();
    
    // 获取学习列表、允许列表和临时白名单域名
    const studyList   = cfg.studyList  || [];
    const allowList   = cfg.allowList  || [];
    const tempDomains = Object.keys(cfg.tempWhitelist?.domains || {});
    const allAllowed  = [...studyList, ...allowList, ...tempDomains];
    
    // 移除旧规则
    if (removeIds.length > 0) {
      await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds: removeIds });
    }
    
    // 如果都没有白名单，不设置规则
    if (allAllowed.length === 0) return;
    
    // 白名单模式：不再使用 declarativeNetRequest 拦截所有请求
    // 改为依赖 webNavigation.onCommitted → checkAndBlock() → blockTab() 
    // 这样 blocked.html 可以获取到正确的 domain 参数
    
    const rules = [];
    let ruleId = 1000;
    
    // 放行白名单域名（priority=1）
    for (const domain of allAllowed) {
      if (!domain) continue;
      rules.push({
        id: ruleId++,
        priority: 1,
        action: { type: 'allow' },
        condition: {
          urlFilter: `||${domain}^`,
          resourceTypes: ['main_frame']
        }
      });
    }
    
    await chrome.declarativeNetRequest.updateDynamicRules({ addRules: rules });
    return;
  }

  // 非白名单模式：移除所有动态规则
  if (removeIds.length > 0) {
    await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds: removeIds });
  }

  // 黑名单模式
  if (cfg.mode === 'blacklist' && cfg.blacklist.length > 0) {
    const rules = [];
    let ruleId = 1000;

    for (const domain of cfg.blacklist) {
      if (!domain) continue;
      rules.push({
        id: ruleId++,
        priority: 1,
        action: {
          type: 'redirect',
          redirect: {
            extensionPath: `/blocked.html?reason=blacklist&domain=${encodeURIComponent(domain)}`
          }
        },
        condition: {
          urlFilter: `||${domain}^`,
          resourceTypes: ['main_frame']
        }
      });
    }

    await chrome.declarativeNetRequest.updateDynamicRules({ addRules: rules });
  }
}

// ── 时间段检查 ────────────────────────────────────────────────────────────────

function isWithinSchedule(schedule) {
  const now = new Date();
  const dayOfWeek = now.getDay();
  const dayConfig = schedule.days[dayOfWeek];

  if (!dayConfig || !dayConfig.enabled) return false;

  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const [startH, startM] = dayConfig.start.split(':').map(Number);
  const [endH, endM] = dayConfig.end.split(':').map(Number);
  const startMinutes = startH * 60 + startM;
  const endMinutes = endH * 60 + endM;

  return currentMinutes >= startMinutes && currentMinutes < endMinutes;
}

// ── 每日重置 ──────────────────────────────────────────────────────────────────

const LAST_RESET_DATE_KEY = 'last_reset_date';

async function resetDailyLockedDomains(force = false) {
  const today = getDateKey();

  if (!force) {
    // 检查今天是否已经重置过，避免每小时误触发
    const storage = await new Promise(resolve =>
      chrome.storage.local.get([LAST_RESET_DATE_KEY], resolve)
    );
    if (storage[LAST_RESET_DATE_KEY] === today) return;
  }

  // 记录本次重置日期
  await new Promise(resolve =>
    chrome.storage.local.set({ [LAST_RESET_DATE_KEY]: today }, resolve)
  );

  const config = await getConfig();
  let changed = false;
  if (config.lockedDomains && config.lockedDomains.length > 0) {
    config.lockedDomains = [];
    changed = true;
  }
  const qs = config.quotaState || {};
  if (qs.onlineLocked || qs.studyLocked || qs.restLocked) {
    config.quotaState = { onlineLocked: false, studyLocked: false, restLocked: false };
    changed = true;
  }
  if (changed) await saveConfig(config);
  console.log('[daily] Quota state reset for new day:', today);
}

// ── 消息处理 ──────────────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  // 简化日志 - 只在需要时显示
  // console.log('[background] Message received:', msg.type, 'from', sender.tab?.url);
  handleMessage(msg, sender).then(sendResponse).catch(err => {
    sendResponse({ error: err.message });
  });
  return true;
});

async function handleMessage(msg, sender) {
  switch (msg.type) {
    case 'GET_CONFIG':
      return await getConfig();

    case 'GET_STATS':
      return await getTodayStats();

    case 'GET_STATS_RANGE':
      return await getStatsRange(msg.days || 7);

    case 'UPDATE_CONFIG': {
      const newConfig = msg.config;
      await saveConfig(newConfig);
      await updateDeclarativeRules(newConfig);
      // 本地修改后立即推送到云端（非阻塞）
      pushConfigToCloud(newConfig).catch(e => console.warn('[Cloud] Push config failed:', e.message));
      return { ok: true };
    }

    case 'FLUSH_TIME':
      return { ok: true };

    case 'MEDIA_STATE': {
      if (!sender.tab) return { ok: true };
      const tabId = sender.tab.id;
      const domain = extractDomain(sender.tab.url);
      if (!domain) return { ok: true };

      if (msg.playing) {
        mediaPlayingTabs.set(tabId, { domain, lastFlushTime: Date.now() });
      } else {
        if (mediaPlayingTabs.has(tabId)) {
          const info = mediaPlayingTabs.get(tabId);
          // 只 flush 不被条件A覆盖的时间
          if (!(tabId === activeTabId && windowHasFocus && !userIsIdle)) {
            const elapsed = Math.floor((Date.now() - info.lastFlushTime) / 1000);
            if (elapsed > 0) await addDomainTime(info.domain, elapsed);
          }
          mediaPlayingTabs.delete(tabId);
        }
      }
      return { ok: true };
    }

    case 'GET_STATUS':
      return { activeTabDomain };

    // 学习/休息相关
    case 'GET_SESSION':
      return await getSession();

    case 'GET_SESSIONS_RANGE':
      return await getSessionsRange(msg.days || 30);

    case 'GET_VISIT_SESSIONS':
      return await getVisitSessions(msg.days || 14);

    case 'GET_CHANGELOG':
      return await getChangelog(msg.limit || 20);

    case 'SWITCH_TO_STUDY':
      return await switchToStudy();

    case 'SWITCH_TO_REST':
      return await switchToRest();

    // 临时白名单相关
    case 'ADD_TEMP_WHITELIST':
      return await addTempWhitelist(msg.domain);

    case 'ADD_TEMP_EXEMPTION':
      return await addTempExemption(msg.exemptType, msg.domain);

    case 'GET_TEMP_WHITELIST':
      return await getTempWhitelist();

    case 'CLEAN_TEMP_WHITELIST':
      await cleanExpiredTempWhitelist();
      return { ok: true };

    // 云端事件上报（fire-and-forget）
    case 'SEND_CLOUD_EVENT': {
      const { eventType, domain: evtDomain = '' } = msg;
      cloudRequest('POST', '/device/events', { type: eventType, domain: evtDomain })
        .catch(() => {}); // 不影响主流程
      return { ok: true };
    }

    // ── 云端同步相关 ─────────────────────────────────────────
    case 'CLOUD_BIND': {
      // 设备绑定通知：admin.js 已完成 API 绑定并保存了 token，
      // 这里只需要更新 background 内存状态并触发一次同步
      try {
        const storage = await storageGet([
          CLOUD_CONFIG.KEYS.DEVICE_TOKEN,
          CLOUD_CONFIG.KEYS.PROFILE_ID
        ]);
        const deviceToken = storage[CLOUD_CONFIG.KEYS.DEVICE_TOKEN];
        const profileId = storage[CLOUD_CONFIG.KEYS.PROFILE_ID] || msg.profile_id;

        if (!deviceToken) {
          return { error: '未找到设备 token，请先在 admin 完成绑定' };
        }

        syncState.deviceToken = deviceToken;
        syncState.profileId = profileId;

        // 立即同步一次
        await syncNow();

        return { success: true, device_token: deviceToken };
      } catch (e) {
        return { error: e.message };
      }
    }

    case 'CLOUD_LOGIN': {
      // 家长登录云端账户
      const { email, password } = msg;
      try {
        // 直接调用 /auth/login（不需要 device_token）
        const resp = await fetch(`${CLOUD_CONFIG.API_BASE}/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password })
        });
        
        if (!resp.ok) {
          const err = await resp.json();
          throw new Error(err.error || 'Login failed');
        }
        
        const result = await resp.json();
        
        // 加密保存凭据
        const encrypted = encryptCredentials(email, password);
        await storageSet({
          [CLOUD_CONFIG.KEYS.CREDENTIALS]: encrypted,
          account_token: result.token  // 家长账户 token
        });
        
        return { success: true, token: result.token };
      } catch (e) {
        return { error: e.message };
      }
    }

    case 'CLOUD_LOGOUT': {
      // 登出云端
      syncState.deviceToken = null;
      syncState.profileId = null;
      await storageSet({
        [CLOUD_CONFIG.KEYS.DEVICE_TOKEN]: null,
        [CLOUD_CONFIG.KEYS.PROFILE_ID]: null,
        [CLOUD_CONFIG.KEYS.CREDENTIALS]: null,
        account_token: null
      });
      return { success: true };
    }

    case 'GET_CLOUD_STATUS': {
      // 获取云端同步状态
      const storage = await storageGet([
        CLOUD_CONFIG.KEYS.DEVICE_TOKEN,
        CLOUD_CONFIG.KEYS.PROFILE_ID,
        CLOUD_CONFIG.KEYS.LAST_SYNC,
        CLOUD_CONFIG.KEYS.CONFIG_VERSION,
        CLOUD_CONFIG.KEYS.CREDENTIALS
      ]);
      
      return {
        isBound: !!storage[CLOUD_CONFIG.KEYS.DEVICE_TOKEN],
        hasCredentials: !!storage[CLOUD_CONFIG.KEYS.CREDENTIALS],
        lastSync: storage[CLOUD_CONFIG.KEYS.LAST_SYNC] || 0,
        configVersion: storage[CLOUD_CONFIG.KEYS.CONFIG_VERSION] || 0
      };
    }

    case 'CLOUD_FORCE_SYNC': {
      // 强制立即同步
      await syncNow();
      return { success: true };
    }

    default:
      return { error: 'Unknown message type' };
  }
}
