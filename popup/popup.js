// popup/popup.js - 孩子视角：只读时间用量展示

let popupStatsContext = { config: {}, stats: {} };
let lastPopupSnapshot = {};

document.addEventListener('DOMContentLoaded', async () => {
  bindPopupEvents();

  const snapshotPromise = getPopupLocalSnapshotSafe();
  snapshotPromise.then((snapshot) => {
    lastPopupSnapshot = snapshot || {};
    renderModeButtons(snapshot || {});
    renderRuntimeStatus(snapshot || {});
  });

  init(snapshotPromise).catch((error) => renderPopupLoadError(error));
  getSuspectSegmentSummarySafe().then(renderSuspectSegmentStatus);

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === 'DEVICE_UNBOUND') {
      renderCloudBindingNotice({ isBound: false, localMode: true, syncEnabled: false });
    }
  });
});

function bindPopupEvents() {
  document.getElementById('btn-study').addEventListener('click', () => setMode('study'));
  document.getElementById('btn-rest').addEventListener('click',  () => setMode('rest'));
  document.getElementById('btn-composite').addEventListener('click',  () => setMode('composite'));
  document.getElementById('site-request-open-btn')?.addEventListener('click', openSiteRequestPanel);
  document.getElementById('site-request-back-btn')?.addEventListener('click', closeSiteRequestPanel);
  document.getElementById('site-request-submit-btn')?.addEventListener('click', submitSiteClassificationRequest);
  document.getElementById('site-request-input')?.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') submitSiteClassificationRequest();
  });

  document.getElementById('settings-btn').addEventListener('click', () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('admin/admin.html?view=stats') });
  });
}

function getReminderTargetFromUrl(url) {
  if (!url || typeof url !== 'string' || !url.includes('reminder.html')) return null;
  try {
    const parsed = new URL(url);
    const domain = parsed.searchParams.get('domain');
    if (!domain || domain === 'all') return null;
    const sourceTabId = Number(parsed.searchParams.get('sourceTabId'));
    return {
      input: `https://${domain}`,
      sourceTabId: Number.isInteger(sourceTabId) && sourceTabId >= 0 ? sourceTabId : null,
    };
  } catch (_) {
    return null;
  }
}

function normalizePopupUrlInput(url) {
  if (!url || typeof url !== 'string') return '';
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return '';
    parsed.hash = '';
    return parsed.toString();
  } catch (_) {
    return '';
  }
}

function getDefaultSiteRequest() {
  const reminderTarget = getReminderTargetFromUrl(lastPopupSnapshot?.url);
  if (reminderTarget) return reminderTarget;
  const currentUrl = normalizePopupUrlInput(lastPopupSnapshot?.url);
  if (currentUrl) {
    return { input: currentUrl, sourceTabId: lastPopupSnapshot?.tabId ?? null };
  }
  const domain = lastPopupSnapshot?.currentDomain || lastPopupSnapshot?.domain || '';
  return { input: domain || '', sourceTabId: lastPopupSnapshot?.tabId ?? null };
}

function openSiteRequestPanel() {
  const entry = document.getElementById('site-request-entry');
  const panel = document.getElementById('site-request-panel');
  const input = document.getElementById('site-request-input');
  const status = document.getElementById('site-request-status');
  const defaults = getDefaultSiteRequest();
  if (entry) entry.style.display = 'none';
  if (panel) panel.style.display = 'block';
  if (input && !input.value.trim()) input.value = defaults.input || '';
  if (status) {
    status.style.display = 'none';
    status.className = 'request-status';
    status.textContent = '';
  }
  setTimeout(() => input?.focus?.(), 0);
}

function closeSiteRequestPanel() {
  const entry = document.getElementById('site-request-entry');
  const panel = document.getElementById('site-request-panel');
  if (entry) entry.style.display = 'flex';
  if (panel) panel.style.display = 'none';
}

function siteRequestErrorMessage(result = {}) {
  if (result.code === 'REQUEST_REJECTED') return '家长已拒绝该范围，不能再次申请。';
  if (result.code === 'ALREADY_CLASSIFIED') return '该网站已归类，不能重新申请归类。';
  if (result.code === 'URL_REQUIRES_PROTOCOL') return '特定链接需要以 http:// 或 https:// 开头。';
  if (result.code === 'INVALID_HOST' || result.code === 'INVALID_URL' || result.code === 'INVALID_TARGET') return '请输入有效域名、子域名或 http/https 链接。';
  if (result.error) return `提交失败：${result.error}`;
  return '提交失败，请稍后重试。';
}

async function submitSiteClassificationRequest() {
  const inputEl = document.getElementById('site-request-input');
  const status = document.getElementById('site-request-status');
  const submitBtn = document.getElementById('site-request-submit-btn');
  const value = inputEl?.value?.trim() || '';
  const defaults = getDefaultSiteRequest();
  if (status) {
    status.className = 'request-status';
    status.style.display = 'none';
    status.textContent = '';
  }
  if (!value) {
    if (status) {
      status.className = 'request-status err';
      status.textContent = '请输入要申请归类的网站或链接。';
    }
    return;
  }
  if (submitBtn) submitBtn.disabled = true;
  try {
    const result = await sendMsg({
      type: 'SUBMIT_SITE_CLASSIFICATION_REQUEST',
      input: value,
      sourceTabId: defaults.sourceTabId,
    }, { attempts: 1, timeoutMs: 1200 });
    if (!result?.ok) {
      if (status) {
        status.className = 'request-status err';
        status.textContent = siteRequestErrorMessage(result || {});
      }
      return;
    }
    if (status) {
      status.className = 'request-status ok';
      status.textContent = result.localOnly
        ? '已在本机临时生效。登录并绑定云端后，才能提交给家长审批。'
        : '已提交申请。审批前可以使用，时间计入综合时长。';
    }
    if (result.targetUrl && Number.isInteger(result.sourceTabId)) {
      chrome.tabs.update(result.sourceTabId, { url: result.targetUrl }).catch(() => {});
    }
  } catch (error) {
    if (status) {
      status.className = 'request-status err';
      status.textContent = `提交失败：${error?.message || '后台暂不可用'}`;
    }
  } finally {
    if (submitBtn) submitBtn.disabled = false;
  }
}

function renderPopupLoadError(error) {
  const quotaBarsEl = document.getElementById('quota-bars');
  if (!quotaBarsEl) return;
  quotaBarsEl.innerHTML = `<div class="empty">后台连接中，请稍后重新打开。${error?.message ? ` (${error.message})` : ''}</div>`;
}

function renderCloudBindingNotice(cloudStatus = {}) {
  const banner = document.getElementById('unbound-banner');
  const content = document.getElementById('popup-content');
  const adminBtn = document.getElementById('goto-admin-btn');
  const isLocalMode = !!cloudStatus && !cloudStatus.isBound;

  if (banner) banner.style.display = isLocalMode ? 'block' : 'none';
  if (content) content.style.display = 'block';
  if (adminBtn) {
    adminBtn.onclick = () => {
      chrome.tabs.create({ url: chrome.runtime.getURL('admin/admin.html?view=stats') });
    };
  }
}

async function getRuntimeModeStatusSafe() {
  try {
    return await sendMsg({ type: 'GET_RUNTIME_MODE_STATUS', includeUsageSummary: false }) || {};
  } catch (_) {
    return {};
  }
}

async function getPopupFastStatusSafe() {
  try {
    return await sendMsg({ type: 'GET_POPUP_FAST_STATUS' }, { attempts: 1, timeoutMs: 900 }) || {};
  } catch (_) {
    return {};
  }
}

async function getPopupLocalSnapshotSafe() {
  try {
    return await sendMsg({ type: 'GET_POPUP_LOCAL_SNAPSHOT' }, { attempts: 1, timeoutMs: 900 }) || {};
  } catch (_) {
    return {
      mode: 'study',
      currentDomain: null,
      currentSessionDurationSeconds: 0,
      config: {},
      stats: {},
      cloudStatus: { isBound: false, localMode: true, syncEnabled: false },
      childName: null,
    };
  }
}

function renderModeButtons(status = {}) {
  const mode = status?.mode || 'study';
  const studyBtn = document.getElementById('btn-study');
  const restBtn  = document.getElementById('btn-rest');
  const compositeBtn = document.getElementById('btn-composite');
  studyBtn.className = 'mode-btn' + (mode === 'study' ? ' active-study' : '');
  restBtn.className  = 'mode-btn' + (mode === 'rest'  ? ' active-rest'  : '');
  compositeBtn.className  = 'mode-btn' + (mode === 'composite' ? ' active-composite' : '');
  const disabled = mode === 'paused';
  studyBtn.disabled = disabled;
  restBtn.disabled = disabled;
  compositeBtn.disabled = disabled;
}

async function setMode(mode) {
  const type = mode === 'study'
    ? 'SWITCH_TO_STUDY'
    : (mode === 'rest' ? 'SWITCH_TO_REST' : 'SWITCH_TO_COMPOSITE');
  const previousMode = lastPopupSnapshot?.mode || popupStatsContext?.config?.mode || 'study';
  renderModeButtons({ ...(lastPopupSnapshot || {}), mode });
  lastPopupSnapshot = { ...(lastPopupSnapshot || {}), mode };
  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const activeTab = tabs && tabs[0] ? tabs[0] : null;
    const noticeTabId = Number.isInteger(activeTab?.id) ? activeTab.id : null;
    const switchResult = await sendMsg({ type, noticeTabId });
    const switchedMode = switchResult?.mode || switchResult?.currentMode || mode;
    const runtimeStatus = await getRuntimeModeStatusSafe();
    const nextStatus = {
      ...(lastPopupSnapshot || {}),
      ...(runtimeStatus || {}),
      mode: runtimeStatus?.mode || runtimeStatus?.currentMode || switchedMode,
    };
    lastPopupSnapshot = nextStatus;
    renderModeButtons(nextStatus);
    renderRuntimeStatus(nextStatus);
  } catch (error) {
    lastPopupSnapshot = { ...(lastPopupSnapshot || {}), mode: previousMode };
    renderModeButtons(lastPopupSnapshot);
    renderRuntimeStatus(lastPopupSnapshot);
    console.warn('[popup] mode switch failed:', error?.message || error);
  }
}

async function init(snapshotPromise = getPopupLocalSnapshotSafe()) {
  const snapshot = await snapshotPromise;
  lastPopupSnapshot = snapshot || {};
  const config = snapshot?.config || {};
  const stats = snapshot?.stats || {};
  const runtimeStatus = snapshot || {};
  popupStatsContext = { config, stats };

  const childName = snapshot?.childName;
  const nameEl = document.getElementById('child-name-header');
  if (nameEl && childName) nameEl.textContent = childName + ' 的时间';
  renderCloudBindingNotice(snapshot?.cloudStatus || {});

  const modeUsage = resolveModeUsageWithLive(stats, config, runtimeStatus);
  renderModeButtons(runtimeStatus || {});
  renderRuntimeStatus(runtimeStatus || {});
  const {
    studySeconds,
    restSeconds,
    compositeSeconds,
    onlineSeconds,
  } = modeUsage;

  const backendMediaSeconds = stats.backgroundMediaSeconds || stats.audioSeconds || 0;
  const pipMediaSeconds = stats.pipSeconds || 0;

  // Mode Buttons with quota display
  const studyBtn = document.getElementById('btn-study');
  const restBtn  = document.getElementById('btn-rest');
  const compositeBtn = document.getElementById('btn-composite');
  const studyBtnValue = document.getElementById('btn-study-value');
  const restBtnValue = document.getElementById('btn-rest-value');
  const compositeBtnValue = document.getElementById('btn-composite-value');
  const undeterminedLimit  = (config.dailyUndeterminedQuota ?? 60)  * 60;

  const studyLimit = (config.dailyStudyQuota ?? 0) * 60;
  const effectiveRestLimit = getEffectiveDailyRestLimit(config) * 60;
  studyBtnValue.textContent = studyLimit > 0
    ? `${formatSeconds(studySeconds)} / ${formatSeconds(studyLimit)}`
    : `${formatSeconds(studySeconds)}`;
  restBtnValue.textContent = effectiveRestLimit > 0
    ? `${formatSeconds(restSeconds)} / ${formatSeconds(effectiveRestLimit)}`
    : `${formatSeconds(restSeconds)}`;
  compositeBtnValue.textContent = undeterminedLimit > 0
    ? `${formatSeconds(compositeSeconds)} / ${formatSeconds(undeterminedLimit)}`
    : `${formatSeconds(compositeSeconds)}`;

  // Usage metrics
  const onlineLimit        = (config.dailyOnlineQuota       ?? 0) * 60;
  const qs = config.quotaState || {};

  const quotaBarsEl = document.getElementById('quota-bars');
  if (quotaBarsEl) {
    const metric = ({ icon, label, used, limit = 0, color = 'var(--accent)', locked = false, sub = '' }) => {
      const pct = limit > 0 ? Math.min(100, Math.round(used / limit * 100)) : 0;
      const barColor = locked ? 'var(--danger)' : pct >= 90 ? 'var(--warn)' : color;
      const valueText = limit > 0 ? `${formatSeconds(used)} / ${formatSeconds(limit)}` : formatSeconds(used);
      const subText = locked ? '已用完' : sub;
      return `
        <div class="usage-metric${locked ? ' locked' : ''}">
          <div class="usage-metric-header">
            <span class="usage-metric-label"><span class="usage-metric-icon">${icon}</span>${label}</span>
            <span class="usage-metric-value">${valueText}</span>
          </div>
          ${subText ? `<div class="usage-metric-sub">${subText}</div>` : ''}
          ${limit > 0 ? `<div class="progress-track">
            <div class="progress-fill" style="width:${pct}%;background:${barColor};"></div>
          </div>` : ''}
        </div>`;
    };
    const items = [
      metric({
        icon: '🌐',
        label: '在线时长',
        used: onlineSeconds,
        limit: onlineLimit,
        color: 'var(--accent)',
        locked: qs.onlineLocked,
        sub: '前台网页和 PiP'
      })
    ];
    if (backendMediaSeconds > 0) {
      items.push(metric({
        icon: '🎵',
        label: '后台媒体',
        used: backendMediaSeconds,
        sub: '后台播放'
      }));
    }
    if (pipMediaSeconds > 0) {
      items.push(metric({
        icon: '🖼️',
        label: 'PiP',
        used: pipMediaSeconds,
        sub: '画中画'
      }));
    }

    quotaBarsEl.innerHTML = `
      <div class="usage-panel">
        <div class="usage-panel-title">今日概览</div>
        ${items.join('')}
      </div>`;
  }
  return { ok: true, runtimeStatus };
}

async function getSuspectSegmentSummarySafe() {
  try {
    return await Promise.race([
      sendMsg({ type: 'GET_SUSPECT_SEGMENT_SUMMARY' }),
      new Promise((resolve) => setTimeout(() => resolve({ ok: false, timeout: true }), 1500)),
    ]);
  } catch (_) {
    return { ok: false };
  }
}

function renderSuspectSegmentStatus(summary = {}) {
  const row = document.getElementById('suspect-segments-row');
  const valueEl = document.getElementById('suspect-segments-value');
  if (!row || !valueEl) return;

  const count = Number(summary?.markedCount || 0);
  if (!summary?.ok || count <= 0) {
    row.style.display = 'none';
    return;
  }

  const seconds = Number(summary?.excludedSeconds || 0);
  valueEl.textContent = `${count}段 / ${formatSeconds(seconds)}`;
  row.style.display = 'block';
}

function isStatsMetaKey(key) {
  return key === 'audioSeconds' ||
    key === 'backgroundMediaByDomain' ||
    key === 'pipSeconds' ||
    key === 'pipByDomain' ||
    key === 'onlineSeconds' ||
    key === 'compositeSeconds' ||
    key === 'undeterminedSeconds';
}

function resolveModeUsageWithLive(stats = {}, config = {}, status = {}) {
  let studySeconds = Math.max(0, Number(stats?.studySeconds) || 0);
  let restSeconds = Math.max(0, Number(stats?.restSeconds) || 0);
  let compositeSeconds = Math.max(0, Number(stats?.compositeSeconds) || 0);
  let onlineSeconds = Math.max(0, Number(stats?.onlineSeconds) || 0);
  const currentDomain = normalizeHostname(status?.currentDomain || status?.domain || extractDomain(status?.url));
  const liveSeconds = resolveLiveSessionSeconds(currentDomain, status);
  const mode = status?.mode;
  if (liveSeconds > 0) {
    if (mode === 'study') studySeconds += liveSeconds;
    if (mode === 'rest') restSeconds += liveSeconds;
    if (mode === 'composite') compositeSeconds += liveSeconds;
    onlineSeconds += liveSeconds;
  }

  return {
    studySeconds,
    restSeconds,
    compositeSeconds,
    onlineSeconds,
    liveSeconds,
  };
}

function renderRuntimeStatus(status = {}) {
  const runtimeCompact = document.getElementById('runtime-compact');
  if (!runtimeCompact) return;
  const domain = normalizeHostname(status?.currentDomain || status?.domain || extractDomain(status?.url));
  const tag = resolveDomainTag(domain, popupStatsContext.config);
  const liveSessionSeconds = resolveLiveSessionSeconds(domain, status);
  const sessionText = formatRuntimeSessionDuration(liveSessionSeconds);
  const domainText = domain || '不计时页面';
  runtimeCompact.innerHTML = `
    <div class="runtime-compact-main">
      <div class="runtime-compact-title">当前访问</div>
      <div class="runtime-duration">${sessionText}</div>
    </div>
    <div class="runtime-compact-main">
      <span class="runtime-domain">${escapeHtml(domainText)}</span>
      <span class="runtime-tag">${tag}</span>
    </div>
  `;
  runtimeCompact.style.display = 'block';
}

function resolveTodayDomainSeconds(domain, stats = {}) {
  if (!domain) return 0;
  const normalizedDomain = normalizeHostname(domain);
  if (!normalizedDomain) return 0;
  let total = 0;
  for (const [key, value] of Object.entries(stats || {})) {
    if (isStatsMetaKey(key)) continue;
    const normalizedKey = normalizeHostname(key);
    if (!normalizedKey) continue;
    if (normalizedKey !== normalizedDomain) continue;
    const seconds = Number(value);
    if (Number.isFinite(seconds) && seconds > 0) total += seconds;
  }
  return total;
}

function resolveLiveSessionSeconds(domain, status = {}) {
  const normalizedDomain = normalizeHostname(domain);
  if (!normalizedDomain) return 0;
  const currentDomain = normalizeHostname(status?.currentDomain || status?.domain || extractDomain(status?.url));
  if (currentDomain !== normalizedDomain) return 0;
  const seconds = Number(status?.currentSessionDurationSeconds);
  if (!Number.isFinite(seconds) || seconds <= 0) return 0;
  return Math.floor(seconds);
}

function resolveDomainTag(domain, config = {}) {
  if (!domain) return '不计时页面';
  const studyList = Array.isArray(config.studyList) ? config.studyList : [];
  const compositeList = Array.isArray(config.compositeList) ? config.compositeList : [];
  const restrictedPatterns = collectRestrictedPatterns(config);
  const restPatterns = collectRestPatterns(config);
  const structuredRules = Array.isArray(config.siteClassificationRulesV1) ? config.siteClassificationRulesV1 : [];

  for (const rule of structuredRules) {
    if (rule?.targetType !== 'host') continue;
    const value = rule.normalizedValue || rule.targetValue;
    if (!value || !matchDomain(domain, value)) continue;
    if (rule.decision === 'study' || rule.classification === 'study') return '学习网站';
    if (rule.decision === 'composite' || rule.classification === 'composite') return '综合网站';
    if (rule.decision === 'reject' || rule.classification === 'reject') return '未批准网站';
  }
  if (studyList.some(p => matchDomain(domain, p))) return '学习网站';
  if (compositeList.some(p => matchDomain(domain, p))) return '综合网站';
  if (restrictedPatterns.some(p => matchDomain(domain, p))) return '受限娱乐网站';
  if (restPatterns.some(p => matchDomain(domain, p))) return '休息网站';
  return '未归类网站';
}

function collectRestrictedPatterns(config = {}) {
  const keys = [
    'restrictedEntertainmentList',
    'defaultRestrictedEntertainmentList',
    'customRestrictedEntertainmentList',
    'restrictedEntertainmentSites'
  ];
  const patterns = [];
  for (const key of keys) {
    const value = config[key];
    if (!Array.isArray(value)) continue;
    for (const item of value) patterns.push(item);
  }
  return patterns;
}

function collectRestPatterns(config = {}) {
  const keys = [
    'restList',
    'restSites',
    'restrictedSites',
    'restrictedList',
    'entertainmentList',
    'ordinaryEntertainmentList'
  ];
  const patterns = [];
  for (const key of keys) {
    const value = config[key];
    if (!Array.isArray(value)) continue;
    for (const item of value) patterns.push(item);
  }
  return patterns;
}

function formatRuntimeSessionDuration(seconds) {
  const safe = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
  if (safe === 0) return '本次 0分';
  return `本次 ${formatRuntimeDuration(safe)}`;
}

function formatRuntimeDuration(seconds) {
  const safe = Math.floor(Number.isFinite(seconds) ? Math.max(0, seconds) : 0);
  if (safe < 60) return `${safe}秒`;
  const h = Math.floor(safe / 3600);
  const m = Math.floor((safe % 3600) / 60);
  const s = safe % 60;
  if (h > 0) {
    return `${h}时${m > 0 ? `${m}分` : ''}${s > 0 ? `${s}秒` : ''}`;
  }
  return `${m}分${s > 0 ? `${s}秒` : ''}`;
}

function normalizeHostname(input) {
  if (typeof input !== 'string') return null;
  const raw = input.trim();
  if (!raw) return null;
  try {
    return new URL('http://' + raw).hostname.toLowerCase().replace(/^www\./, '').replace(/\.+$/g, '') || null;
  } catch {
    return null;
  }
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function extractDomain(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

function formatMinutes(secs) {
  if (!secs || secs < 0) return '0';
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}分`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `${h}时${m}分` : `${h}时`;
}

function getEffectiveDailyRestLimit(config) {
  const base   = config.dailyRestQuota ?? 120;
  const borrow = config.quotaBorrow;
  if (!borrow || borrow.repaid) return base;

  const today = new Date().toISOString().slice(0, 10);
  if (today === borrow.borrowedFrom) return base + borrow.amount;

  const repayD = new Date(borrow.borrowedFrom + 'T00:00:00');
  repayD.setDate(repayD.getDate() + 1);
  const repayStr = repayD.toISOString().slice(0, 10);
  if (today === repayStr) return Math.max(0, base - borrow.amount);
  return base;
}

function matchDomain(domain, pattern) {
  function normalizeHostnameV12(input) {
    if (typeof input !== 'string') return null;
    let raw = input.trim();
    if (!raw) return null;
    raw = raw.toLowerCase().replace(/\.+$/g, '');
    if (!raw) return null;
    try {
      const normalized = new URL('http://' + raw).hostname.toLowerCase().replace(/\.+$/g, '');
      return normalized || null;
    } catch {
      return null;
    }
  }

  const d = normalizeHostnameV12(domain);
  const p = normalizeHostnameV12(pattern);
  if (!d || !p) return false;
  if (d === p) return true;
  if (d.startsWith('www.') && d.slice(4) === p) return true;
  if (p.startsWith('www.') && p.slice(4) === d) return true;
  if (p.startsWith('*.')) {
    const base = p.slice(2);
    if (!base || d === base) return false;
    return d.endsWith('.' + base);
  }
  return false;
}

function sendMsg(msg, options = {}) {
  const attempts = Number(options.attempts || 2);
  const timeoutMs = Number(options.timeoutMs || 2500);
  const sendOnce = () => new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new Error('background_timeout'));
    }, timeoutMs);
    chrome.runtime.sendMessage(msg, (resp) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      const lastError = chrome.runtime.lastError;
      if (lastError) {
        reject(new Error(lastError.message || 'background_unavailable'));
        return;
      }
      resolve(resp);
    });
  });

  const run = async () => {
    let lastError = null;
    for (let i = 0; i < attempts; i++) {
      try {
        return await sendOnce();
      } catch (error) {
        lastError = error;
        if (i < attempts - 1) {
          await new Promise(resolve => setTimeout(resolve, 180));
        }
      }
    }
    throw lastError || new Error('background_unavailable');
  };
  return run();
}

function formatSeconds(secs) {
  if (!secs || secs < 0) secs = 0;
  if (secs < 60) return `${secs}秒`;
  if (secs < 3600) return `${Math.floor(secs / 60)}分`;
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  return m > 0 ? `${h}小时${m}分` : `${h}小时`;
}
