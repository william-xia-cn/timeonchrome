// message-router.js — 命令路由

import { getConfig, saveConfig, getTodayStats, getStatsRange, getSession, getVisitSessions, getChangelog, getDateKey, formatDate, matchDomain, extractDomain } from './infra/storage.js';
import { updateDeclarativeRules, checkAndRemind, redirectToReminder } from './product/interceptor.js';
import { checkAllTabsQuota, borrowRestQuota, redirectAllTabs, redirectQuotaViolatingTabs, redirectLockedTabs, getWeekRestSeconds } from './product/quota.js';
import { getSyncState, getCloudConfig, syncNow, sendHeartbeat, cloudBind, initCloudSync } from './infra/cloud-sync.js';
import { getTodayStatsWithCategories } from './product/analytics.js';

const BORROW_ALLOWED_PATHS = new Set([
  '/popup/popup.html',
  '/reminder.html',
]);

function isAuthorizedBorrowSender(sender) {
  if (!sender?.id || sender.id !== chrome.runtime.id) return false;
  if (!sender?.url) return false;

  try {
    const senderUrl = new URL(sender.url);
    const extensionOrigin = new URL(chrome.runtime.getURL('/')).origin;
    if (senderUrl.origin !== extensionOrigin) return false;
    return BORROW_ALLOWED_PATHS.has(senderUrl.pathname);
  } catch {
    return false;
  }
}

export async function handleMessage(msg, sender) {
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
      return { ok: true };

    case 'GET_STATUS':
      return { ok: true };

    case 'GET_SESSION':
      return await getSession();

    case 'GET_VISIT_SESSIONS':
      return await getVisitSessions(msg.days || 14);

    case 'GET_CHANGELOG':
      return await getChangelog(msg.limit || 20);

    case 'SWITCH_TO_STUDY':
      return await switchToStudy();

    case 'SWITCH_TO_REST':
      return await switchToRest();

    case 'ADD_TO_COMPOSITE_LIST':
      return await addToCompositeList(msg.domain);

    case 'SEND_CLOUD_EVENT': {
      const { eventType, domain: evtDomain = '' } = msg;
      const syncStateRef = getSyncState();
      if (syncStateRef.monitoringEnabled === 0) {
        return { ok: true, skipped: 'monitoring_disabled' };
      }
      const CLOUD_CONFIG = getCloudConfig();
      if (syncStateRef.deviceToken) {
        fetch(`${CLOUD_CONFIG.API_BASE}/device/events`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${syncStateRef.deviceToken}`
          },
          body: JSON.stringify({ type: eventType, domain: evtDomain })
        }).catch(() => {});
      }
      return { ok: true };
    }

    case 'CLOUD_BIND': {
      return await cloudBind(() => syncNow(getConfig, saveConfig, updateDeclarativeRules, redirectAllTabs, redirectQuotaViolatingTabs));
    }

    case 'CLOUD_LOGIN': {
      const { email, password } = msg;
      try {
        const { CLOUD_CONFIG } = await import('./infra/cloud-sync.js');
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
        const encrypted = btoa(`${email}:${password}`);
        await chrome.storage.local.set({
          [CLOUD_CONFIG.KEYS.CREDENTIALS]: encrypted,
          account_token: result.token
        });

        return { success: true, token: result.token };
      } catch (e) {
        return { error: e.message };
      }
    }

    case 'CLOUD_LOGOUT': {
      const { CLOUD_CONFIG } = await import('./infra/cloud-sync.js');
      await chrome.storage.local.set({
        [CLOUD_CONFIG.KEYS.DEVICE_TOKEN]: null,
        [CLOUD_CONFIG.KEYS.PROFILE_ID]: null,
        [CLOUD_CONFIG.KEYS.CREDENTIALS]: null,
        account_token: null
      });
      return { success: true };
    }

    case 'GET_CLOUD_STATUS': {
      const storage = await chrome.storage.local.get([
        'cloud_device_token',
        'cloud_profile_id',
        'cloud_last_sync',
        'cloud_config_version',
        'cloud_credentials',
        'cloud_monitoring_enabled'
      ]);

      return {
        isBound: !!storage['cloud_device_token'],
        hasCredentials: !!storage['cloud_credentials'],
        lastSync: storage['cloud_last_sync'] || 0,
        configVersion: storage['cloud_config_version'] || 0,
        monitoringEnabled: storage['cloud_monitoring_enabled'] ?? 1
      };
    }

    case 'CLOUD_FORCE_SYNC': {
      await syncNow(getConfig, saveConfig, updateDeclarativeRules, redirectAllTabs, redirectQuotaViolatingTabs);
      return { success: true };
    }

    case 'GET_WEEK_REST_SECONDS': {
      return { weekRestSeconds: await getWeekRestSeconds() };
    }

    case 'BORROW_REST_QUOTA': {
      if (!isAuthorizedBorrowSender(sender)) {
        return { ok: false, error: 'unauthorized_borrow_source', code: 'BORROW_SOURCE_DENIED' };
      }
      return await borrowRestQuota(updateDeclarativeRules);
    }

    case 'GET_WEEKLY_SESSIONS': {
      const today = new Date();
      const dayOfWeek = today.getDay() === 0 ? 6 : today.getDay() - 1;
      const weekStart = new Date(today);
      weekStart.setDate(today.getDate() - dayOfWeek);
      const weekStartStr = weekStart.toISOString().slice(0, 10);
      try {
        const { CLOUD_CONFIG } = await import('./infra/cloud-sync.js');
        const syncStateRef = getSyncState();
        const resp = await fetch(`${CLOUD_CONFIG.API_BASE}/device/weekly-sessions?week_start=${weekStartStr}`, {
          headers: { 'Authorization': `Bearer ${syncStateRef.deviceToken}` }
        });
        const data = await resp.json();
        return { sessions: data.sessions || [] };
      } catch (e) {
        return { sessions: [], error: e.message };
      }
    }

    case 'SUBMIT_APPEAL': {
      const { sessionId, reason } = msg;
      try {
        const { CLOUD_CONFIG } = await import('./infra/cloud-sync.js');
        const syncStateRef = getSyncState();
        const resp = await fetch(`${CLOUD_CONFIG.API_BASE}/device/appeal`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${syncStateRef.deviceToken}`
          },
          body: JSON.stringify({ session_id: sessionId, reason: reason || '' })
        });
        const data = await resp.json();
        return { ok: true, data };
      } catch (e) {
        return { ok: false, error: e.message };
      }
    }

    case 'CHECK_AND_REMIND': {
      return await checkAndRemind(msg.tabId, msg.url, getSyncState().monitoringEnabled);
    }

    default:
      return { error: 'Unknown message type' };
  }
}

// ── Mode switching ──────────────────────────────────────────────────────────────


async function reevaluateActiveTabAfterModeSwitch() {
  const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  const tab = tabs && tabs[0];
  if (!tab || !tab.id || !tab.url) return;

  let targetUrl = tab.url;
  if (tab.url.includes('reminder.html')) {
    try {
      const u = new URL(tab.url);
      const domain = u.searchParams.get('domain');
      if (!domain || domain === 'all') return;
      targetUrl = `https://${domain}`;
    } catch {
      return;
    }
  }

  const blocked = await checkAndRemind(tab.id, targetUrl, getSyncState().monitoringEnabled);
  if (!blocked && targetUrl !== tab.url) {
    await chrome.tabs.update(tab.id, { url: targetUrl }).catch(() => {});
  }
}

async function switchToStudy() {
  const config = await getConfig();
  config.mode = 'study';
  await saveConfig(config);
  await updateDeclarativeRules(config);
  const session = await getSession();
  session.currentMode = 'study';
  await chrome.storage.local.set({ guardian_session: session });
  await reevaluateActiveTabAfterModeSwitch();
  return session;
}

async function switchToRest() {
  const config = await getConfig();
  config.mode = 'rest';
  await saveConfig(config);
  await updateDeclarativeRules(config);
  const session = await getSession();
  session.currentMode = 'rest';
  await chrome.storage.local.set({ guardian_session: session });
  await reevaluateActiveTabAfterModeSwitch();
  return session;
}

// ── Add to composite list ───────────────────────────────────────────────────────

async function addToCompositeList(domain) {
  const config = await getConfig();
  const list = config.compositeList || [];

  const alreadyInComposite = list.some(d => matchDomain(domain, d));
  const alreadyInStudy = (config.studyList || []).some(d => matchDomain(domain, d));
  if (alreadyInComposite || alreadyInStudy) {
    return { domain, alreadyPresent: true };
  }

  config.compositeList = [...list, domain];
  await saveConfig(config);
  await updateDeclarativeRules(config);
  return { domain, added: true };
}
