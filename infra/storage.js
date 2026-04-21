// infra/storage.js — 配置/会话存储

const STORAGE_VERSION = '1.3';
export const CONFIG_KEY = 'guardian_config';
const HASH_KEY = 'guardian_hash';
export const STATS_KEY_PREFIX = 'stats_';
const UNDETERMINED_STATS_KEY_PREFIX = 'undetermined_stats_';
export const SESSION_KEY = 'guardian_session';
const SESSIONS_KEY = 'guardian_sessions';
export const VISIT_SESSIONS_KEY = 'visit_sessions';
const CHANGELOG_KEY = 'guardian_changelog';
const MAX_CHANGELOG_ENTRIES = 100;
const MAX_SESSION_DAYS = 14;
const MIN_SESSION_DURATION = 10;

export const DEFAULT_CONFIG = {
  version: STORAGE_VERSION,
  adminPasswordHash: '',
  isInitialized: false,
  mode: 'study',
  studyList: [
    'google.com', 'drive.google.com', 'docs.google.com', 'sheets.google.com', 'slides.google.com', 'meet.google.com', 'calendar.google.com', 'classroom.google.com', 'keep.google.com', 'colab.research.google.com',
    'office.com', 'onenote.com', 'outlook.live.com', 'planner.microsoft.com', 'to-do.office.com', 'teams.microsoft.com',
    'openai.com', 'claude.ai', 'gemini.google.com', 'poe.com', 'perplexity.ai', 'notebooklm.google.com', 'elicit.org', 'consensus.app', 'scite.ai', 'wolframalpha.com', 'gamma.app',
    'quizlet.com', 'noredink.com', 'membean.com', 'achieve3000.com', 'quillbot.com', 'grammarly.com', 'overleaf.com', 'zotero.org', 'mendeley.com', 'owl.purdue.edu', 'citationmachine.net',
    'ibo.org', 'managebac.com', 'kognity.com', 'revisionvillage.com', 'savemyexams.com', 'ibdocuments.com', 'ibsurvival.com', 'lanterna.com', 'thinking.net', 'bioninja.com.au', 'theoryofknowledge.net',
    'khanacademy.org', 'ocw.mit.edu', 'coursera.org', 'edx.org', 'brilliant.org', 'udemy.com', 'futurelearn.com', 'britannica.com',
    'desmos.com', 'geogebra.org', 'symbolab.com', 'mathway.com', 'physicsclassroom.com', 'phet.colorado.edu', 'falstad.com', 'myphysicslab.com', 'logic.ly',
    'github.com', 'stackoverflow.com', 'leetcode.com', 'hackerrank.com', 'codingbat.com', 'replit.com', 'codepen.io', 'tinkercad.com', 'arduino.cc', 'raspberrypi.com', 'instructables.com',
    'arxiv.org', 'scholar.google.com', 'jstor.org', 'researchgate.net', 'semanticscholar.org', 'pubmed.ncbi.nlm.nih.gov', 'gutenberg.org', 'plato.stanford.edu',
    'canva.com', 'figma.com', 'photopea.com', 'pixlr.com',
    'notion.so', 'obsidian.md', 'ankiweb.net', 'trello.com', 'slack.com', 'reclaim.ai',
    'collegeboard.org'
  ],
  compositeList: [
    'google.com', 'google.com.hk', 'bing.com', 'baidu.com', 'search.brave.com', 'duckduckgo.com',
    'stackexchange.com', 'reddit.com',
    'youtube.com', 'music.youtube.com', 'spotify.com', 'music.163.com', 'bilibili.com',
    'wikipedia.org', 'britannica.com', 'wolframalpha.com'
  ],
  whitelist: [],
  unsafeList: ['douyin.com', 'tiktok.com'],
  blacklist: [],
  dailyOnlineQuota: 1200,
  dailyStudyQuota: 480,
  dailyRestQuota: 120,
  dailyUndeterminedQuota: 120,
  weeklyRestQuota: null,
  quotaBorrow: null,
  domainQuotas: {},
  classificationRules: [],
  quotaState: { onlineLocked: false, studyLocked: false, restLocked: false, undeterminedLocked: false },
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
  blockMessage: '这个网站当前不在可访问范围内',
  lockedDomains: [],
  restConfig: { reminderInterval: 15, maxRestDuration: 60 },
  autoStudyConfig: { enabled: true, requiredSeconds: 90 },
  updatedAt: null
};

const DEFAULT_SESSION = {
  currentMode: 'study',
  lastActiveDate: null,
  studySession: { totalSeconds: 0 },
  restSession: { totalSeconds: 0 }
};

// ── Utility functions ───────────────────────────────────────────────────────────

export function getDateKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function formatDate(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function extractDomain(url) {
  if (!url) return null;
  try {
    const hostname = new URL(url).hostname;
    if (hostname.startsWith('chrome') || hostname.startsWith('chrome-extension')) return null;
    return hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

export function isSpecialUrl(url) {
  if (!url) return true;
  return url.startsWith('chrome://') || url.startsWith('chrome-extension://') || url.startsWith('edge://') || url.startsWith('about:');
}

export function matchDomain(domain, pattern) {
  if (!domain || !pattern) return false;
  if (pattern.startsWith('*.')) {
    return domain === pattern.slice(2) || domain.endsWith('.' + pattern.slice(2));
  }
  return domain === pattern;
}

function sortObjectKeys(obj) {
  return Object.keys(obj).sort().reduce((acc, key) => { acc[key] = obj[key]; return acc; }, {});
}

async function computeHash(data) {
  const sorted = sortObjectKeys(data);
  const str = JSON.stringify(sorted);
  const encoder = new TextEncoder();
  const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(str));
  return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
}

// ── Config operations ───────────────────────────────────────────────────────────

export async function getConfig() {
  return new Promise((resolve) => {
    chrome.storage.local.get([CONFIG_KEY, HASH_KEY], async (result) => {
      if (!result[CONFIG_KEY]) {
        resolve({ ...DEFAULT_CONFIG });
        return;
      }
      const config = result[CONFIG_KEY];
      const storedHash = result[HASH_KEY];
      const computedHashVal = await computeHash(config);
      if (storedHash !== computedHashVal) {
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

export async function saveConfig(config) {
  config.updatedAt = Date.now();
  const hash = await computeHash(config);
  return new Promise((resolve) => {
    chrome.storage.local.set({ [CONFIG_KEY]: config, [HASH_KEY]: hash }, resolve);
  });
}

// ── Session operations ──────────────────────────────────────────────────────────

export async function getSession() {
  return new Promise((resolve) => {
    chrome.storage.local.get(SESSION_KEY, (result) => {
      const session = result[SESSION_KEY] || { ...DEFAULT_SESSION };
      resolve(session);
    });
  });
}

export async function saveSession(session) {
  return new Promise((resolve) => {
    chrome.storage.local.set({ [SESSION_KEY]: session }, resolve);
  });
}

// ── Domain time tracking ────────────────────────────────────────────────────────

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

export async function getTodayStats() {
  const today = getDateKey();
  return new Promise((resolve) => {
    chrome.storage.local.get(STATS_KEY_PREFIX + today, (result) => {
      resolve(result[STATS_KEY_PREFIX + today] || {});
    });
  });
}

export async function addUndeterminedTime(domain, seconds) {
  const today = getDateKey();
  const key = UNDETERMINED_STATS_KEY_PREFIX + today;
  return new Promise((resolve) => {
    chrome.storage.local.get(key, (result) => {
      const stats = result[key] || {};
      stats[domain] = (stats[domain] || 0) + seconds;
      chrome.storage.local.set({ [key]: stats }, resolve);
    });
  });
}

export async function getTodayUndeterminedStats() {
  const today = getDateKey();
  return new Promise((resolve) => {
    chrome.storage.local.get(UNDETERMINED_STATS_KEY_PREFIX + today, (result) => {
      resolve(result[UNDETERMINED_STATS_KEY_PREFIX + today] || {});
    });
  });
}

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

// ── Visit sessions ──────────────────────────────────────────────────────────────

export async function getVisitSessions(days = MAX_SESSION_DAYS) {
  return new Promise((resolve) => {
    chrome.storage.local.get(VISIT_SESSIONS_KEY, (result) => {
      const sessions = result[VISIT_SESSIONS_KEY] || [];
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - days);
      resolve(sessions.filter(s => new Date(s.date) >= cutoff));
    });
  });
}

export async function addVisitSession(session) {
  return new Promise((resolve) => {
    chrome.storage.local.get(VISIT_SESSIONS_KEY, (result) => {
      const sessions = result[VISIT_SESSIONS_KEY] || [];
      sessions.push(session);
      chrome.storage.local.set({ [VISIT_SESSIONS_KEY]: sessions }, resolve);
    });
  });
}

// ── Changelog ───────────────────────────────────────────────────────────────────

export async function getChangelog(limit = 20) {
  return new Promise((resolve) => {
    chrome.storage.local.get(CHANGELOG_KEY, (result) => {
      const entries = result[CHANGELOG_KEY] || [];
      resolve(entries.slice(0, limit));
    });
  });
}

// ── Cleanup ─────────────────────────────────────────────────────────────────────

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

export const LAST_RESET_DATE_KEY = 'last_reset_date';

export async function resetDailyLockedDomains(force = false) {
  const today = getDateKey();

  if (!force) {
    const storage = await new Promise(resolve =>
      chrome.storage.local.get([LAST_RESET_DATE_KEY], resolve)
    );
    if (storage[LAST_RESET_DATE_KEY] === today) return;
  }

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
  if (qs.onlineLocked || qs.studyLocked || qs.restLocked || qs.undeterminedLocked) {
    config.quotaState = { onlineLocked: false, studyLocked: false, restLocked: false, undeterminedLocked: false };
    changed = true;
  }

  const borrow = config.quotaBorrow;
  if (borrow && !borrow.repaid) {
    const repayD = new Date(borrow.borrowedFrom + 'T00:00:00');
    repayD.setDate(repayD.getDate() + 1);
    if (today > formatDate(repayD)) {
      config.quotaBorrow = { ...borrow, repaid: true };
      changed = true;
    }
  }

  if (changed) await saveConfig(config);
  console.log('[daily] Quota state reset for new day:', today);
}

export { MIN_SESSION_DURATION, UNDETERMINED_STATS_KEY_PREFIX, SESSIONS_KEY, CHANGELOG_KEY, MAX_CHANGELOG_ENTRIES };
