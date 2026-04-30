// product/interceptor.js — 拦截逻辑 + 提醒触发

import { getConfig, getTemporaryCompositeDomains, matchDomain, extractDomain, isSpecialUrl } from '../infra/storage.js';

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

// ── Check and remind ────────────────────────────────────────────────────────────

export async function checkAndRemind(tabId, url, monitoringEnabled) {
  if (isSpecialUrl(url)) return false;
  if (url.includes('reminder.html')) return false;
  if (monitoringEnabled === 0) return false;

  const config = await getConfig();
  if (!config.enabled) return false;

  const domain = extractDomain(url);
  if (!domain) return false;
  const temporaryCompositeDomains = await getTemporaryCompositeDomains();

  const isStudyDomain = (config.studyList || []).some(p => matchDomain(domain, p));
  const isCompositeDomain = (config.compositeList || []).some(p => matchDomain(domain, p)) ||
    temporaryCompositeDomains.some(p => matchDomain(domain, p));
  const restrictedList = config.restrictedEntertainmentList || [];
  const isRestricted = restrictedList.some(p => matchDomain(domain, p));

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

  // 3. 学习模式检查
  const currentMode = config.mode === 'whitelist' ? 'study' : (config.mode === 'blacklist' ? 'rest' : config.mode);
  if (currentMode === 'study') {
    if (isRestricted) {
      await redirectToReminder(tabId, domain, 'restricted_study_mode', config.blockMessage);
      return true;
    }
    if (!isStudyDomain && !isCompositeDomain) {
      await redirectToReminder(tabId, domain, 'study_mode', config.blockMessage);
      return true;
    }
  }

  // 4. 配额锁定检查
  const qs = config.quotaState || {};
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

export async function redirectToReminder(tabId, domain, reason, message) {
  const reminderUrl = chrome.runtime.getURL('reminder.html') +
    `?reason=${reason}&domain=${encodeURIComponent(domain)}&msg=${encodeURIComponent(message || '')}`;
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
