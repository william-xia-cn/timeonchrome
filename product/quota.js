// product/quota.js — 配额检查 + 借用逻辑

import { resolveSiteAccessClassification } from '../core/site-classification.js';
import { getConfig, saveConfig, getTodayStats, getStatsRange, getTemporaryCompositeDomains, getSiteClassificationRequestRecords, hasTemporaryCompositePermission, matchDomain, extractDomain, isSpecialUrl, getDateKey, formatDate } from '../infra/storage.js';

let borrowInProgress = false;
const STATS_META_KEYS = new Set(['audioSeconds', 'backgroundMediaByDomain', 'pipSeconds', 'pipByDomain']);

function classifyDomainForQuota(config, siteClassificationRecords, temporaryCompositeDomains, domain) {
  const resolved = resolveSiteAccessClassification(config, siteClassificationRecords, domain);
  if (resolved.classification) return resolved.classification;
  if ((temporaryCompositeDomains || []).some(p => matchDomain(domain, p))) return 'composite';
  return null;
}

// ── Week rest calculation ───────────────────────────────────────────────────────

export async function getWeekRestSeconds() {
  const config = await getConfig();
  const temporaryCompositeDomains = await getTemporaryCompositeDomains();
  const siteClassificationRecords = await getSiteClassificationRequestRecords({ includeAll: true }).catch(() => []);
  const today = new Date();
  const todayKey = getDateKey();
  const dayOfWeek = today.getDay() === 0 ? 6 : today.getDay() - 1;

  // Use event-log based getStatsRange
  const statsRange = await getStatsRange(dayOfWeek + 1);
  let weekRestSeconds = 0;

  for (const [dateKey, dayStats] of Object.entries(statsRange)) {
    let dayTotal = 0, dayStudy = 0, dayUndeterminedSecs = 0;
    const tempComposite = dateKey === todayKey ? temporaryCompositeDomains : [];
    for (const [domain, secs] of Object.entries(dayStats || {})) {
      if (STATS_META_KEYS.has(domain)) continue;
      dayTotal += secs;
      const classification = classifyDomainForQuota(config, siteClassificationRecords, tempComposite, domain);
      if (classification === 'study') dayStudy += secs;
      else if (classification === 'composite' || classification === 'pending_composite') dayUndeterminedSecs += secs;
    }
    weekRestSeconds += Math.max(0, dayTotal - dayStudy - dayUndeterminedSecs);
  }

  return weekRestSeconds;
}

export function getTodayEffectiveRestLimit(config) {
  const baseLimit = config.dailyRestQuota ?? 120;
  const borrow = config.quotaBorrow;
  if (!borrow || borrow.repaid) return baseLimit;

  const today = getDateKey();
  if (today === borrow.borrowedFrom) {
    return baseLimit + borrow.amount;
  }

  const repayD = new Date(borrow.borrowedFrom + 'T00:00:00');
  repayD.setDate(repayD.getDate() + 1);
  const repayStr = formatDate(repayD);
  if (today === repayStr) {
    return Math.max(0, baseLimit - borrow.amount);
  }

  return baseLimit;
}

// ── Quota check ─────────────────────────────────────────────────────────────────

export async function checkAllTabsQuota(redirectToReminderFn, redirectAllTabsFn, redirectQuotaViolatingTabsFn, redirectLockedTabsFn) {
  const config = await getConfig();
  if (!config.enabled) return;

  const stats = await getTodayStats();
  const temporaryCompositeDomains = await getTemporaryCompositeDomains();
  const siteClassificationRecords = await getSiteClassificationRequestRecords({ includeAll: true }).catch(() => []);

  let studySeconds = 0, undeterminedSeconds = 0, totalSeconds = 0;
  for (const [domain, seconds] of Object.entries(stats)) {
    if (STATS_META_KEYS.has(domain)) continue;
    totalSeconds += seconds;
    const classification = classifyDomainForQuota(config, siteClassificationRecords, temporaryCompositeDomains, domain);
    if (classification === 'study') studySeconds += seconds;
    else if (classification === 'composite' || classification === 'pending_composite') undeterminedSeconds += seconds;
  }
  const restSeconds = totalSeconds - studySeconds - undeterminedSeconds;

  const totalMinutes = Math.floor(totalSeconds / 60);
  const studyMinutes = Math.floor(studySeconds / 60);
  const restMinutes = Math.floor(Math.max(0, restSeconds) / 60);
  const undeterminedMinutes = Math.floor(undeterminedSeconds / 60);

  const weekRestSeconds = await getWeekRestSeconds();
  const weekRestMinutes = Math.floor(weekRestSeconds / 60);

  const dailyOnlineQuota = config.dailyOnlineQuota ?? config.dailyQuota ?? 0;
  const dailyUndeterminedQuota = config.dailyUndeterminedQuota ?? 60;
  const effectiveDailyRest = getTodayEffectiveRestLimit(config);
  const weeklyRestLimit = config.weeklyRestQuota ?? (effectiveDailyRest * 7);

  const restLockedByDay = effectiveDailyRest > 0 && restMinutes >= effectiveDailyRest;
  const restLockedByWeek = weeklyRestLimit > 0 && weekRestMinutes >= weeklyRestLimit;

  const newState = {
    onlineLocked: dailyOnlineQuota > 0 && totalMinutes >= dailyOnlineQuota,
    studyLocked: (config.dailyStudyQuota || 0) > 0 && studyMinutes >= config.dailyStudyQuota,
    restLocked: restLockedByDay || restLockedByWeek,
    undeterminedLocked: dailyUndeterminedQuota > 0 && undeterminedMinutes >= dailyUndeterminedQuota,
    weeklyRestLocked: restLockedByWeek,
  };

  const oldState = config.quotaState || {};
  const stateChanged = newState.onlineLocked !== oldState.onlineLocked ||
    newState.studyLocked !== oldState.studyLocked ||
    newState.restLocked !== oldState.restLocked ||
    newState.undeterminedLocked !== oldState.undeterminedLocked;

  if (stateChanged) {
    config.quotaState = newState;
    await saveConfig(config);

    if (newState.onlineLocked && !oldState.onlineLocked) {
      chrome.notifications.create({ type: 'basic', iconUrl: 'icons/icon48.png', title: 'TimeOnChrome', message: '今天的上网时间用完啦，好好休息一下吧 🌙' });
      if (redirectAllTabsFn) await redirectAllTabsFn();
      return;
    }
    if (newState.restLocked && !oldState.restLocked) {
      const msg = newState.weeklyRestLocked
        ? '本周的休息时间用完啦，切换到学习模式继续加油 📚'
        : '今天的休息时间用完啦，切换到学习模式继续加油 📚';
      chrome.notifications.create({ type: 'basic', iconUrl: 'icons/icon48.png', title: 'TimeOnChrome', message: msg });
      if (redirectQuotaViolatingTabsFn) await redirectQuotaViolatingTabsFn(config, newState);
    }
    if (newState.studyLocked && !oldState.studyLocked) {
      chrome.notifications.create({ type: 'basic', iconUrl: 'icons/icon48.png', title: 'TimeOnChrome', message: '今天学得够多啦，劳逸结合才高效 🎉' });
      if (redirectQuotaViolatingTabsFn) await redirectQuotaViolatingTabsFn(config, newState);
    }
    if (newState.undeterminedLocked && !oldState.undeterminedLocked) {
      chrome.notifications.create({ type: 'basic', iconUrl: 'icons/icon48.png', title: 'TimeOnChrome', message: '综合时间今天用完啦，明天再来探索' });
      if (redirectQuotaViolatingTabsFn) await redirectQuotaViolatingTabsFn(config, newState);
    }
  }

  if (newState.onlineLocked) {
    if (redirectAllTabsFn) await redirectAllTabsFn();
    return;
  }

  // Single domain quota check
  const newlyLocked = [];
  for (const [domain, seconds] of Object.entries(stats)) {
    if (domain === 'audioSeconds' || domain === 'backgroundMediaByDomain' || domain === 'pipSeconds' || domain === 'pipByDomain') continue;
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
    if (redirectLockedTabsFn) await redirectLockedTabsFn(newlyLocked);
    chrome.notifications.create({
      type: 'basic', iconUrl: 'icons/icon48.png', title: 'TimeOnChrome',
      message: `${newlyLocked.join(', ')} 今天的时间用完啦，换个网站看看？`
    });
  }
}

// ── Tab redirect helpers ────────────────────────────────────────────────────────

export async function redirectQuotaViolatingTabs(config, quotaState) {
  const tabs = await chrome.tabs.query({});
  const siteClassificationRecords = await getSiteClassificationRequestRecords({ includeAll: true }).catch(() => []);
  for (const tab of tabs) {
    if (!tab.url || isSpecialUrl(tab.url)) continue;
    const domain = extractDomain(tab.url);
    if (!domain) continue;
    const resolved = resolveSiteAccessClassification(config, siteClassificationRecords, tab.url);
    const isTemporaryComposite = await hasTemporaryCompositePermission(tab.id, domain);
    const classification = resolved.classification || (isTemporaryComposite ? 'composite' : null);
    const isStudy = classification === 'study';
    const isComposite = classification === 'composite' || classification === 'pending_composite';
    if (quotaState.studyLocked && isStudy) {
      chrome.tabs.update(tab.id, { url: chrome.runtime.getURL('reminder.html') + `?reason=quota_study&domain=${encodeURIComponent(domain)}` });
    } else if (quotaState.undeterminedLocked && isComposite && !isStudy) {
      chrome.tabs.update(tab.id, { url: chrome.runtime.getURL('reminder.html') + `?reason=quota_undetermined&domain=${encodeURIComponent(domain)}` });
    } else if (quotaState.restLocked && !isStudy && !isComposite) {
      chrome.tabs.update(tab.id, { url: chrome.runtime.getURL('reminder.html') + `?reason=quota_rest&domain=${encodeURIComponent(domain)}` });
    }
  }
}

export async function redirectAllTabs() {
  const tabs = await chrome.tabs.query({});
  for (const tab of tabs) {
    if (tab.url && !isSpecialUrl(tab.url)) {
      chrome.tabs.update(tab.id, {
        url: chrome.runtime.getURL('reminder.html') + '?reason=quota&domain=all'
      });
    }
  }
}

export async function redirectLockedTabs(domains) {
  const tabs = await chrome.tabs.query({});
  for (const tab of tabs) {
    if (!tab.url) continue;
    const domain = extractDomain(tab.url);
    if (domain && domains.some(d => matchDomain(domain, d))) {
      chrome.tabs.update(tab.id, {
        url: chrome.runtime.getURL('reminder.html') + `?reason=quota&domain=${encodeURIComponent(domain)}`
      });
    }
  }
}

// ── Borrow rest quota ───────────────────────────────────────────────────────────

export async function borrowRestQuota(updateDeclarativeRulesFn) {
  return { ok: false, error: 'TIME_BORROWING_DISABLED_FOR_V1_MINIMAL' };
}
