// product/interceptor.js — 拦截逻辑 + 提醒触发

import { getConfig, getSession, saveSession, hasTemporaryCompositePermission, matchDomain, extractDomain, isSpecialUrl } from '../infra/storage.js';
import { getTodayStatsWithCategories } from './analytics.js';

const AUTO_TRANSITION_GATES = {
  rest_to_composite: 60_000,
  rest_to_study: 90_000,
  composite_to_study: 90_000,
};

const autoTransitionCandidates = new Map();
const autoModePendingByTab = new Map();
const STUDY_PENDING_RULES = new Set(['rest_to_study', 'composite_to_study']);

// ── Schedule check ──────────────────────────────────────────────────────────────

export function isWithinSchedule(schedule) {
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

function normalizeMode(mode) {
  if (mode === 'whitelist') return 'study';
  if (mode === 'blacklist') return 'rest';
  if (mode === 'study' || mode === 'composite' || mode === 'rest' || mode === 'paused') return mode;
  return 'study';
}

async function getEffectiveRuntimeMode(config, monitoringEnabled) {
  if (monitoringEnabled === 0) return 'paused';
  const session = await getSession();
  const sessionMode = normalizeMode(session?.currentMode);
  if (sessionMode && sessionMode !== 'paused') return sessionMode;
  return normalizeMode(config?.mode);
}

async function setRuntimeMode(nextMode) {
  const normalized = normalizeMode(nextMode);
  if (normalized === 'paused') return;
  const session = await getSession();
  if (normalizeMode(session?.currentMode) === normalized) return;
  await saveSession({ ...(session || {}), currentMode: normalized });
}

function notifyRuntimeModeSwitch(message) {
  try {
    chrome.notifications?.create?.({
      type: 'basic',
      iconUrl: 'icons/icon48.png',
      title: 'TimeOnChrome',
      message,
    });
  } catch {}
}

function clearAutoTransitionCandidate(tabId) {
  if (!Number.isInteger(tabId) || tabId < 0) return;
  autoTransitionCandidates.delete(tabId);
}

function formatSecondsCompact(seconds) {
  const secs = Math.max(0, Math.floor(Number(seconds) || 0));
  if (secs < 60) return `${secs}秒`;
  if (secs < 3600) return `${Math.floor(secs / 60)}分`;
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  return m > 0 ? `${h}小时${m}分` : `${h}小时`;
}

async function sendTabPendingMessage(tabId, payload, fallbackMessage = null) {
  if (!Number.isInteger(tabId) || tabId < 0) return false;
  try {
    await chrome.tabs.sendMessage(tabId, payload);
    return true;
  } catch {
    if (fallbackMessage) notifyRuntimeModeSwitch(fallbackMessage);
    return false;
  }
}

async function computeCompositeRemainingSeconds(config) {
  const stats = await getTodayStatsWithCategories(config);
  const used = Math.max(0, Number(stats?.undeterminedSeconds) || 0);
  const limit = Math.max(0, Number(config?.dailyUndeterminedQuota ?? 60) * 60);
  return Math.max(0, limit - used);
}

export function getAutoModePendingStatus(tabId, nowMs = Date.now()) {
  if (!Number.isInteger(tabId) || tabId < 0) return null;
  const pending = autoModePendingByTab.get(tabId);
  if (!pending) return null;
  const remainingSeconds = Math.max(0, Math.ceil((pending.deadlineAt - nowMs) / 1000));
  return { ...pending, remainingSeconds };
}

async function clearAutoModePending(tabId, reason = 'cancel') {
  if (!Number.isInteger(tabId) || tabId < 0) return;
  if (!autoModePendingByTab.has(tabId)) return;
  autoModePendingByTab.delete(tabId);
  await sendTabPendingMessage(tabId, { type: 'AUTO_MODE_PENDING_CANCEL', reason });
}

function isStudyPendingRule(rule) {
  return STUDY_PENDING_RULES.has(rule);
}

export async function cancelAutoModePendingForTab(tabId, reason = 'cancel') {
  if (!Number.isInteger(tabId) || tabId < 0) return;
  clearAutoTransitionCandidate(tabId);
  await clearAutoModePending(tabId, reason);
}

export async function cancelAllAutoModePending(reason = 'cancel') {
  const tabIds = new Set([
    ...autoTransitionCandidates.keys(),
    ...autoModePendingByTab.keys(),
  ]);
  for (const tabId of tabIds) {
    await cancelAutoModePendingForTab(tabId, reason);
  }
}

function readUserActiveState() {
  return new Promise((resolve) => {
    try {
      if (!chrome.idle?.queryState) {
        resolve(true);
        return;
      }
      chrome.idle.queryState(60, (state) => {
        resolve(state === 'active');
      });
    } catch {
      resolve(true);
    }
  });
}

async function checkAutoModeTransitionGate(tabId, candidate, nowMs, forcedUserActive) {
  if (!candidate || !Number.isInteger(tabId) || tabId < 0) return { passed: false };
  const gateMs = AUTO_TRANSITION_GATES[candidate.rule];
  if (!gateMs) return { passed: false };

  // V0: Rest -> Composite 采用稳定前台停留门控，不要求键鼠活跃。
  if (candidate.rule !== 'rest_to_composite') {
    const userActive = (typeof forcedUserActive === 'boolean') ? forcedUserActive : await readUserActiveState();
    if (!userActive) {
      clearAutoTransitionCandidate(tabId);
      await clearAutoModePending(tabId, 'inactive');
      return { passed: false, blockedByInactivity: true };
    }
  }

  const existing = autoTransitionCandidates.get(tabId);
  if (
    !existing ||
    existing.rule !== candidate.rule ||
    existing.fromMode !== candidate.fromMode ||
    existing.toMode !== candidate.toMode ||
    existing.domain !== candidate.domain
  ) {
    const deadlineAt = nowMs + gateMs;
    autoTransitionCandidates.set(tabId, {
      ...candidate,
      startAt: nowMs,
      deadlineAt,
      lastSeenAt: nowMs,
      lastUserActiveAt: nowMs,
    });
    if (candidate.rule === 'rest_to_composite' || candidate.rule === 'rest_to_study' || candidate.rule === 'composite_to_study') {
      const targetMode = candidate.toMode;
      const fromMode = candidate.fromMode;
      const remainingCompositeSeconds = (candidate.rule === 'rest_to_composite')
        ? await computeCompositeRemainingSeconds(candidate.config)
        : 0;
      const remainingCompositeTime = (candidate.rule === 'rest_to_composite')
        ? formatSecondsCompact(remainingCompositeSeconds)
        : '';
      const pendingPayload = {
        type: 'AUTO_MODE_PENDING_START',
        domain: candidate.domain,
        deadlineAt,
        targetMode,
        fromMode,
        remainingCompositeSeconds,
        remainingCompositeTime,
      };
      autoModePendingByTab.set(tabId, {
        tabId,
        domain: candidate.domain,
        deadlineAt,
        targetMode,
        fromMode,
        remainingCompositeSeconds,
        remainingCompositeTime,
      });
      const fallbackMessage = targetMode === 'composite'
        ? '正在使用综合网站，保持使用后将进入综合时间'
        : '正在使用学习网站，保持使用后将进入学习时间';
      await sendTabPendingMessage(tabId, pendingPayload, fallbackMessage);
    }
    return { passed: false };
  }

  existing.lastSeenAt = nowMs;
  existing.lastUserActiveAt = nowMs;
  if ((nowMs - existing.startAt) >= gateMs) {
    autoTransitionCandidates.delete(tabId);
    await clearAutoModePending(tabId, 'completed');
    return { passed: true };
  }
  if ((candidate.rule === 'rest_to_composite' || candidate.rule === 'rest_to_study' || candidate.rule === 'composite_to_study') && existing.deadlineAt) {
    const remainingCompositeSeconds = (candidate.rule === 'rest_to_composite')
      ? await computeCompositeRemainingSeconds(candidate.config)
      : 0;
    const remainingCompositeTime = (candidate.rule === 'rest_to_composite')
      ? formatSecondsCompact(remainingCompositeSeconds)
      : '';
    autoModePendingByTab.set(tabId, {
      tabId,
      domain: candidate.domain,
      deadlineAt: existing.deadlineAt,
      targetMode: candidate.toMode,
      fromMode: candidate.fromMode,
      remainingCompositeSeconds,
      remainingCompositeTime,
    });
    await sendTabPendingMessage(tabId, {
      type: 'AUTO_MODE_PENDING_START',
      domain: candidate.domain,
      deadlineAt: existing.deadlineAt,
      targetMode: candidate.toMode,
      fromMode: candidate.fromMode,
      remainingCompositeSeconds,
      remainingCompositeTime,
    });
  }
  autoTransitionCandidates.set(tabId, existing);
  return { passed: false };
}

// ── Check and remind ────────────────────────────────────────────────────────────

export async function checkAndRemind(tabId, url, monitoringEnabled, options = {}) {
  if (isSpecialUrl(url)) return false;
  if (url.includes('reminder.html')) return false;
  if (monitoringEnabled === 0) {
    clearAutoTransitionCandidate(tabId);
    await clearAutoModePending(tabId, 'monitoring_off');
    return false;
  }

  const nowMs = Number.isFinite(options?.nowMs) ? options.nowMs : Date.now();

  const config = await getConfig();
  if (!config.enabled) return false;

  const domain = extractDomain(url);
  if (!domain) return false;
  const isStudyDomain = (config.studyList || []).some(p => matchDomain(domain, p));
  const isTemporaryCompositeDomain = await hasTemporaryCompositePermission(tabId, domain);
  const isCompositeDomain = (config.compositeList || []).some(p => matchDomain(domain, p)) || isTemporaryCompositeDomain;
  const restrictedList = config.restrictedEntertainmentList || [];
  const isRestricted = restrictedList.some(p => matchDomain(domain, p));
  const qs = config.quotaState || {};

  // 1. 不安全网站检查（唯一的硬拦截）
  const unsafeList = (config.unsafeList?.length ? config.unsafeList : null) || config.blacklist || [];
  const isUnsafe = unsafeList.some(b => matchDomain(domain, b));
  if (isUnsafe) {
    await redirectToReminder(tabId, domain, 'unsafe', config.blockMessage);
    return true;
  }

  // 2. 时间段检查
  if (config.schedule.enabled && !isWithinSchedule(config.schedule)) {
    await redirectToReminder(tabId, domain, 'schedule', config.blockMessage);
    return true;
  }

  // 3. 运行时模式切换/拦截（study/composite/rest）
  const currentMode = await getEffectiveRuntimeMode(config, monitoringEnabled);
  let pendingAutoCandidate = null;
  const isForeground = options?.foreground === true;
  if (currentMode === 'rest' && isCompositeDomain && isForeground) {
    pendingAutoCandidate = { rule: 'rest_to_composite', fromMode: 'rest', toMode: 'composite', domain, config };
  } else if (currentMode === 'rest' && isStudyDomain && isForeground) {
    pendingAutoCandidate = { rule: 'rest_to_study', fromMode: 'rest', toMode: 'study', domain, config };
  } else if (currentMode === 'composite' && isStudyDomain && isForeground) {
    pendingAutoCandidate = { rule: 'composite_to_study', fromMode: 'composite', toMode: 'study', domain, config };
  }

  if (pendingAutoCandidate) {
    const gate = await checkAutoModeTransitionGate(tabId, pendingAutoCandidate, nowMs, options?.userActive);
    if (gate.passed) {
      await setRuntimeMode(pendingAutoCandidate.toMode);
      if (pendingAutoCandidate.rule === 'rest_to_composite') {
        const remainingCompositeSeconds = await computeCompositeRemainingSeconds(config);
        await sendTabPendingMessage(tabId, {
          type: 'AUTO_MODE_PENDING_SUCCESS',
          targetMode: 'composite',
          fromMode: 'rest',
          remainingCompositeSeconds,
          remainingCompositeTime: formatSecondsCompact(remainingCompositeSeconds),
        }, `已进入综合时间 · 今日综合剩余 ${formatSecondsCompact(remainingCompositeSeconds)}`);
        notifyRuntimeModeSwitch('已进入综合时间');
      } else if (pendingAutoCandidate.rule === 'rest_to_study' || pendingAutoCandidate.rule === 'composite_to_study') {
        await sendTabPendingMessage(tabId, {
          type: 'AUTO_MODE_PENDING_SUCCESS',
          targetMode: 'study',
          fromMode: pendingAutoCandidate.fromMode,
        }, '已进入学习时间');
        notifyRuntimeModeSwitch('已进入学习时间');
      }
    }
  } else {
    const existing = autoTransitionCandidates.get(tabId);
    const cancelReason = existing && isStudyPendingRule(existing.rule) && !isForeground
      ? 'foreground_lost'
      : 'candidate_changed';
    clearAutoTransitionCandidate(tabId);
    await clearAutoModePending(tabId, cancelReason);
  }

  if (currentMode === 'study') {
    if (isStudyDomain) {
      return false;
    }
    if (isCompositeDomain) {
      await redirectToReminder(tabId, domain, 'to_composite_confirm', config.blockMessage);
      return true;
    }
    if (!isStudyDomain && !isCompositeDomain && isRestricted) {
      await redirectToReminder(tabId, domain, 'to_rest_slide_confirm', config.blockMessage, {
        originMode: 'study',
      });
      return true;
    }
    if (!isStudyDomain && !isCompositeDomain) {
      await redirectToReminder(tabId, domain, 'to_rest_slide_confirm', config.blockMessage, {
        originMode: 'study',
      });
      return true;
    }
  }

  if (currentMode === 'composite') {
    if (!isStudyDomain && !isCompositeDomain) {
      await redirectToReminder(tabId, domain, 'to_rest_confirm', config.blockMessage);
      return true;
    }
  }

  // 4. 配额锁定检查
  if (qs.onlineLocked) {
    await redirectToReminder(tabId, domain, 'quota_online', config.blockMessage);
    return true;
  }
  if (qs.restLocked && !isStudyDomain && !isCompositeDomain) {
    await redirectToReminder(tabId, domain, 'quota_rest', config.blockMessage);
    return true;
  }
  if (qs.studyLocked && isStudyDomain) {
    await redirectToReminder(tabId, domain, 'quota_study', config.blockMessage);
    return true;
  }
  if (qs.undeterminedLocked && isCompositeDomain && !isStudyDomain) {
    await redirectToReminder(tabId, domain, 'quota_undetermined', config.blockMessage);
    return true;
  }
  if (config.lockedDomains && config.lockedDomains.includes(domain)) {
    await redirectToReminder(tabId, domain, 'quota', config.blockMessage);
    return true;
  }

  return false;
}

export async function redirectToReminder(tabId, domain, reason, message, extraParams = null) {
  const queryParts = [
    `reason=${encodeURIComponent(reason || '')}`,
    `domain=${encodeURIComponent(domain || '')}`,
    `msg=${encodeURIComponent(message || '')}`,
  ];
  if (extraParams && typeof extraParams === 'object') {
    for (const [k, v] of Object.entries(extraParams)) {
      if (v === undefined || v === null || v === '') continue;
      queryParts.push(`${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
    }
  }
  const reminderUrl = `${chrome.runtime.getURL('reminder.html')}?${queryParts.join('&')}`;
  console.log('[redirectToReminder]', reason, domain);
  chrome.tabs.update(tabId, { url: reminderUrl }).catch(() => {});
}

// ── Declarative rules (unsafeList) ──────────────────────────────────────────────

export async function updateDeclarativeRules(config, monitoringEnabled) {
  const cfg = config || await getConfig();
  let monitor = monitoringEnabled;
  if (monitor === undefined || monitor === null) {
    const storage = await chrome.storage.local.get('cloud_monitoring_enabled');
    monitor = storage.cloud_monitoring_enabled ?? 1;
  }

  const existingRules = await chrome.declarativeNetRequest.getDynamicRules();
  const removeIds = existingRules.map(r => r.id);

  if (removeIds.length > 0) {
    await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds: removeIds });
  }

  if (monitor === 0) return;

  const unsafeList = (cfg.unsafeList?.length ? cfg.unsafeList : null) || cfg.blacklist || [];
  if (unsafeList.length > 0) {
    const rules = [];
    let ruleId = 1000;

    for (const domain of unsafeList) {
      if (!domain) continue;
      rules.push({
        id: ruleId++,
        priority: 1,
        action: {
          type: 'redirect',
          redirect: {
            extensionPath: `/reminder.html?reason=unsafe&domain=${encodeURIComponent(domain)}`
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
