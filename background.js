// background.js - Service Worker 核心逻辑（v1.2 学习/休息版）
// 功能：
// 1. 学习/休息状态切换
// 2. 学习时使用白名单模式
// 3. 休息时使用黑名单模式
// 4. 休息提醒和强制结束

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
    'openai.com', 'claude.ai', 'gemini.google.com', 'poe.com', 'perplexity.ai', 'notebooklm.google.com', 'elicit.org', 'consensus.app', 'scite.ai', 'wolframalpha.com', 'gamma.app', 'deepel.com',
    // 语言强化与写作辅助
    'quizlet.com', 'noredink.com', 'membean.com', 'achieve3000.com', 'quillbot.com', 'grammarly.com', 'overleaf.com', 'zotero.org', 'mendeley.com', 'owl.purdue.edu', 'citationmachine.net',
    // IB 专项资源
    'ibo.org', 'managebac.com', 'kognity.com', 'revisionvillage.com', 'savemyexams.com', 'ibdocuments.com', 'ibsurvival.com', 'lanterna.com', 'thinking.net', 'bioninja.com.au', 'theoryofknowledge.net',
    // 通用学习与在线课程
    'khanacademy.org', 'ocw.mit.edu', 'coursera.org', 'edx.org', 'brilliant.org', 'udemy.com', 'futurelearn.com', 'educs.me', 'revisiontown.com', 'afficientA.com', 'britannica.com',
    // 数学、物理与实验模拟
    'desmos.com', 'geogebra.org', 'symbolab.com', 'mathway.com', 'hyperphysics.phy-astr.gsu.edu', 'physicsclassroom.com', 'physics.nist.gov', 'phet.colorado.edu', 'falstad.com', 'myphysicslab.com', 'logic.ly',
    // 计算机科学与电子工程
    'github.com', 'stackoverflow.com', 'leetcode.com', 'hackerrank.com', 'codingbat.com', 'replit.com', 'codepen.io', 'tinkercad.com', 'easyeda.com', 'kicad.org', 'arduino.cc', 'raspberrypi.com', 'hackaday.com', 'instructables.com',
    // 学术数据库与人文历史
    'arxiv.org', 'scholar.google.com', 'jstor.org', 'researchgate.net', 'semanticscholar.org', 'pubmed.ncbi.nlm.nih.gov', 'nationalarchives.gov.uk', 'bl.uk', 'loc.gov', 'gutenberg.org', 'plato.stanford.edu',
    // 视觉设计与创意
    'canva.com', 'figma.com', 'adobe.com', 'photopea.com', 'pixlr.com', 'coolors.co', 'unsplash.com', 'pexels.com',
    // 效率工具
    'notion.so', 'obsidian.md', 'ankiweb.net', 'trello.com', 'slack.com', 'reclaim.ai', 'overleaf.com', 'github.com'
  ],
  // 默认允许网站（新安装时自动加载）
  allowList: [
    // 搜索引擎/工具
    'google.com', 'google.com.hk', 'bing.com', 'search.brave.com', 'duckduckgo.com', 'stackexchange.com', 'reddit.com',
    // 视频/音乐
    'youtube.com', 'music.youtube.com', 'spotify.com', 'music.163.com',
    // 百科/参考
    'britannica.com', 'wolframalpha.com'
  ],
  whitelist: [],
  // 默认黑名单（始终拦截）
  blacklist: ['baidu.com', 'douyin.com'],
  dailyQuota: 0,
  domainQuotas: {},
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
    duration: 1  // 默认1分钟（测试用）
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
  currentMode: 'study',  // 当前模式：study 或 rest
  lastActiveDate: null,   // 最后活跃日期（用于每日重置）
  studySession: { totalSeconds: 0 },
  restSession: { totalSeconds: 0 },
  startTime: null
};

// ── 工具函数 ──────────────────────────────────────────────────────────────────

function getDateKey() {
  return formatDate(new Date());
}

function formatDate(date) {
  return date.toISOString().split('T')[0];
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

// ── 状态管理（心跳模式：不再用 activeStartTime 推算，全靠 HEARTBEAT 累加）──────

let activeTabId = null;
let activeTabDomain = null;

// ── Visit Session 跟踪状态 ───────────────────────────────────────────────────────
let visitSessionStart = null;     // 当前访问会话开始时间戳
let visitSessionDomain = null;  // 当前访问会话域名
let visitActiveTime = 0;      // 主动交互秒数
let visitPassiveTime = 0;     // 被动观看秒数
let visitLastTick = 0;         // 上次心跳时间戳

// ── Visit Session 辅助函数 ───────────────────────────────────────────────────

function updateVisitSession(domain, state, now) {
  // 新域名，开始新会话
  if (visitSessionDomain !== domain) {
    endVisitSession('new_session');
    visitSessionStart = now;
    visitSessionDomain = domain;
    visitActiveTime = 0;
    visitPassiveTime = 0;
    visitLastTick = now;
    return;
  }
  
  // 计算时间增量
  const elapsed = Math.floor((now - visitLastTick) / 1000);
  if (elapsed <= 0) return;
  
  // 根据状态累加
  if (state === 'active') {
    visitActiveTime += elapsed;
  } else {
    visitPassiveTime += elapsed;
  }
  visitLastTick = now;
}

function endVisitSession(endReason) {
  if (!visitSessionDomain || !visitSessionStart) return;
  
  const now = Date.now();
  const duration = Math.floor((now - visitSessionStart) / 1000);
  
  // 过滤短时长会话（< 10秒）
  if (duration >= MIN_SESSION_DURATION) {
    const session = {
      id: crypto.randomUUID(),
      domain: visitSessionDomain,
      date: getDateKey(),
      startAt: visitSessionStart,
      endAt: now,
      duration,
      activeTime: visitActiveTime,
      passiveTime: visitPassiveTime,
      visibleTime: duration,
      endReason
    };
    addVisitSession(session);
  }
  
  // 重置状态
  visitSessionStart = null;
  visitSessionDomain = null;
  visitActiveTime = 0;
  visitPassiveTime = 0;
  visitLastTick = 0;
}

// ── 初始化 ───────────────────────────────────────────────────────────────────

chrome.runtime.onInstalled.addListener(async (details) => {
  // console.log('[background] onInstalled, reason:', details.reason);
  
  if (details.reason === 'install') {
    const config = { ...DEFAULT_CONFIG };
    await saveConfig(config);
    await saveSession({ ...DEFAULT_SESSION });
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
        autoStudyConfig: existingConfig.autoStudyConfig || DEFAULT_CONFIG.autoStudyConfig
      };
      
      await saveConfig(migratedConfig);
    }
  }
  
  setupAlarms();
  await updateDeclarativeRules();
  await restoreSession();
  // console.log('[background] onInstalled complete');
});

chrome.runtime.onStartup.addListener(async () => {
  // console.log('[background] onStartup');
  setupAlarms();
  await updateDeclarativeRules();
  await resetDailyLockedDomains();
  await restoreSession();
  // console.log('[background] onStartup complete');
});

// ── Alarms ─────────────────────────────────────────────────────────────────────

function setupAlarms() {
  chrome.alarms.create('quota_check', { periodInMinutes: 1 });
  chrome.alarms.create('daily_cleanup', { periodInMinutes: 60 });
  chrome.alarms.create('keepalive', { periodInMinutes: 0.5 }); // 仅防 SW 休眠，不再计时
  chrome.alarms.create('temp_whitelist_cleanup', { periodInMinutes: 1 });
}

chrome.alarms.onAlarm.addListener(async (alarm) => {
  // console.log('[background] Alarm triggered:', alarm.name);
  
  if (alarm.name === 'quota_check') {
    await checkAllTabsQuota();
  } else if (alarm.name === 'daily_cleanup') {
    await cleanOldStats();
    await cleanOldSessions();
    await resetDailyLockedDomains();
  } else if (alarm.name === 'keepalive') {
    console.log('[background] keepalive tick');
  } else if (alarm.name === 'rest_reminder') {
    await handleRestReminder();
  } else if (alarm.name === 'rest_forced') {
    await handleRestForcedEnd();
  } else if (alarm.name === 'temp_whitelist_cleanup') {
    await cleanExpiredTempWhitelist();
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

// 追踪当前激活 Tab（供 HEARTBEAT 用）
chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  const tab = await chrome.tabs.get(tabId).catch(() => null);
  activeTabId = tabId;
  activeTabDomain = tab?.url ? extractDomain(tab.url) : null;
});

chrome.tabs.onRemoved.addListener((tabId) => {
  if (tabId === activeTabId) {
    activeTabId = null;
    activeTabDomain = null;
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

  // 1. 检查时间段限制
  if (config.schedule.enabled && !isWithinSchedule(config.schedule)) {
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

  // 4. 检查该域名是否因配额已锁定
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
  const totalSeconds = Object.values(stats).reduce((a, b) => a + b, 0);
  const totalMinutes = Math.floor(totalSeconds / 60);

  if (config.dailyQuota > 0 && totalMinutes >= config.dailyQuota) {
    await lockAllBrowsing();
    return;
  }

  const newlyLocked = [];
  for (const [domain, seconds] of Object.entries(stats)) {
    const minutes = Math.floor(seconds / 60);
    const quota = config.domainQuotas[domain];
    if (quota && quota > 0 && minutes >= quota) {
      if (!config.lockedDomains.includes(domain)) {
        newlyLocked.push(domain);
      }
    }
  }

  if (newlyLocked.length > 0) {
    config.lockedDomains = [...(config.lockedDomains || []), ...newlyLocked];
    await saveConfig(config);
    await closeLockedTabs(newlyLocked);
    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'icons/icon48.png',
      title: 'TimeOnChrome',
      message: `${newlyLocked.join(', ')} 今日使用时间已达上限`
    });
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

// 自动切换计数器（内存，不持久化）- 新模型：最少30秒+120秒窗口期
let autoStudyTickCount = 0;      // 心跳计数（每次10秒）
let autoStudyLastDomain = null;  // 上次访问的域名
let autoStudyHasActive = false;  // 120秒内是否有active/passive状态
let autoStudyMinTicks = 3;       // 最少3次心跳（30秒）才开始计数

// Auto-switch helper: 最少30秒激活 + 120秒窗口期内只要有1次active/passive就触发
async function handleAutoStudyTick(domain, config, state) {
  const session = await getSession();
  
  // 只有休息模式才需要检测
  if (session.currentMode !== 'rest') {
    autoStudyTickCount = 0;
    autoStudyLastDomain = null;
    autoStudyHasActive = false;
    return;
  }

  if (!config?.autoStudyConfig?.enabled) return;

  const inStudyList = (config?.studyList || []).some(w => matchDomain(domain, w));

  if (inStudyList) {
    // 检查是否同一域名
    if (autoStudyLastDomain === domain) {
      autoStudyTickCount++;
      
      // 只有超过30秒（3次心跳）后，才开始记录是否有active/passive
      if (autoStudyTickCount > autoStudyMinTicks) {
        if (state === 'active' || state === 'passive') {
          autoStudyHasActive = true;
        }
      }
    } else {
      // 切换域名，重置计数器
      autoStudyTickCount = 1;
      autoStudyLastDomain = domain;
      autoStudyHasActive = false;
    }

    // 120秒（12次心跳）后判断
    // 但必须在同一域名停留超过30秒（3次心跳）
    if (autoStudyTickCount >= 12) {
      if (autoStudyHasActive) {
        // 满足条件：超过30秒 + 有行为 → 切换
        autoStudyTickCount = 0;
        autoStudyLastDomain = null;
        autoStudyHasActive = false;
        await switchToStudy('auto');
        chrome.notifications.create({
          type: 'basic',
          iconUrl: 'icons/icon48.png',
          title: 'TimeOnChrome',
          message: '检测到你在学习，已自动切换到学习模式 📚'
        });
      } else {
        // 120秒内无行为，重置（可能全程idle或停留<30秒）
        autoStudyTickCount = 0;
        autoStudyHasActive = false;
      }
    }
  } else {
    // 非学习网站，重置计数器
    autoStudyTickCount = 0;
    autoStudyLastDomain = null;
    autoStudyHasActive = false;
  }
}

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

async function resetDailyLockedDomains() {
  const config = await getConfig();
  if (config.lockedDomains && config.lockedDomains.length > 0) {
    config.lockedDomains = [];
    await saveConfig(config);
  }
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
      return { ok: true };
    }

    case 'FLUSH_TIME':
      return { ok: true }; // 心跳模式下无需手动 flush

    case 'HEARTBEAT': {
      // sender.tab 可能为空（扩展内部消息），需要检查
      if (!sender.tab) return { ok: true };
      
      const domain = extractDomain(sender.tab.url);
      if (!domain) return { ok: true };

      const TICK = 10;
      const cfg = await getConfig();
      const now = Date.now();

      // 新模型：只要页面可见（非 hidden）就计网站时长
      if (msg.state !== 'hidden') {
        await addDomainTime(domain, TICK);
        
        // 自动切换计数（120秒内只要有1次active/passive就触发）
        handleAutoStudyTick(domain, cfg, msg.state);
        
        // Visit Session 跟踪
        updateVisitSession(domain, msg.state, now);
      } else {
        // 页面隐藏，结束当前会话
        endVisitSession('hidden');
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

    case 'GET_TEMP_WHITELIST':
      return await getTempWhitelist();

    case 'CLEAN_TEMP_WHITELIST':
      await cleanExpiredTempWhitelist();
      return { ok: true };

    default:
      return { error: 'Unknown message type' };
  }
}
