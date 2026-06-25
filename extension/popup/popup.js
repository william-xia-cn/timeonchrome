// popup/popup.js - 孩子视角：只读时间用量展示

let popupStatsContext = { config: {}, stats: {} };
let lastPopupSnapshot = {};
const POPUP_CONFIG_KEY = 'guardian_config';
const SITE_CLASSIFICATION_REQUESTS_KEY = 'site_classification_requests_v1';
const QUOTA_DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

document.addEventListener('DOMContentLoaded', async () => {
  bindPopupEvents();

  const snapshotPromise = getPopupLocalSnapshotSafe();
  snapshotPromise.then((snapshot) => {
    lastPopupSnapshot = snapshot || {};
    popupStatsContext = {
      config: snapshot?.config || popupStatsContext.config || {},
      stats: snapshot?.stats || popupStatsContext.stats || {},
    };
    renderModeButtons(snapshot || {});
    renderRuntimeStatus(snapshot || {});
    hydrateSiteRequestInputFromSnapshot('snapshot_ready');
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
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      submitSiteClassificationRequest();
    }
  });
  document.getElementById('site-request-input')?.addEventListener('input', updateSiteRequestPreview);

  document.getElementById('settings-btn').addEventListener('click', () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('admin/admin.html?view=stats') });
  });
}

function getReminderTargetFromUrl(url) {
  if (!url || typeof url !== 'string' || !url.includes('reminder.html')) return null;
  try {
    const parsed = new URL(url);
    const domain = parsed.searchParams.get('domain');
    const targetUrl = normalizePopupUrlInput(parsed.searchParams.get('targetUrl') || '');
    const sourceTabId = Number(parsed.searchParams.get('sourceTabId'));
    if (targetUrl) {
      return {
        input: targetUrl,
        sourceTabId: Number.isInteger(sourceTabId) && sourceTabId >= 0 ? sourceTabId : null,
      };
    }
    if (!domain || domain === 'all') return null;
    return {
      input: `https://${domain}`,
      sourceTabId: Number.isInteger(sourceTabId) && sourceTabId >= 0 ? sourceTabId : null,
    };
  } catch (_) {
    return null;
  }
}

function isReminderExtensionUrl(url) {
  if (!url || typeof url !== 'string' || !url.includes('reminder.html')) return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'chrome-extension:' && parsed.pathname.endsWith('/reminder.html');
  } catch (_) {
    return false;
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
  updateSiteRequestPreview();
  if (status) {
    status.className = 'request-status';
    status.replaceChildren?.();
    status.textContent = '';
    if (!defaults.input) {
      status.style.display = 'block';
      appendSiteRequestStatusLine(status, 'request-status-body', '正在读取被拦截链接…');
    } else {
      status.style.display = 'none';
    }
  }
  setTimeout(() => input?.focus?.(), 0);
}

function hydrateSiteRequestInputFromSnapshot(reason = 'snapshot') {
  const panel = document.getElementById('site-request-panel');
  const input = document.getElementById('site-request-input');
  const status = document.getElementById('site-request-status');
  if (!panel || panel.style.display === 'none' || !input) return false;
  if (input.value.trim()) return false;
  const defaults = getDefaultSiteRequest();
  if (!defaults.input) return false;
  input.value = defaults.input;
  updateSiteRequestPreview();
  if (status && status.textContent.includes('正在读取被拦截链接')) {
    status.style.display = 'none';
    status.className = 'request-status';
    status.replaceChildren?.();
    status.textContent = '';
  }
  return true;
}

function closeSiteRequestPanel() {
  const entry = document.getElementById('site-request-entry');
  const panel = document.getElementById('site-request-panel');
  if (entry) entry.style.display = 'flex';
  if (panel) panel.style.display = 'none';
}

function siteRequestErrorMessage(result = {}) {
  if (result.code === 'REQUEST_REJECTED') return '该范围已归为受限娱乐，不能再次申请归类。';
  if (result.code === 'ALREADY_CLASSIFIED') return '该网站已归类，不能申请重新归类。';
  if (result.code === 'URL_REQUIRES_PROTOCOL') return '特定链接需要以 http:// 或 https:// 开头。';
  if (result.code === 'INVALID_HOST' || result.code === 'INVALID_URL' || result.code === 'INVALID_TARGET') return '请输入有效域名、子域名或 http/https 链接。';
  if (result.error) return `提交失败：${result.error}`;
  return '提交失败，请稍后重试。';
}

function resetSiteRequestStatus(status) {
  if (!status) return;
  status.className = 'request-status';
  status.style.display = 'none';
  status.replaceChildren?.();
  status.textContent = '';
}

function appendSiteRequestStatusLine(parent, className, text) {
  if (!parent || !text) return null;
  const el = document.createElement('div');
  el.className = className;
  el.textContent = text;
  parent.appendChild(el);
  return el;
}

function renderSiteRequestPreview(preview = null) {
  const el = document.getElementById('site-request-preview');
  if (!el) return;
  el.replaceChildren?.();
  el.textContent = '';
  if (!preview?.ok) {
    el.style.display = 'none';
    return;
  }
  el.style.display = 'block';
  if (preview.summaryValue) {
    appendSiteRequestStatusLine(el, 'request-preview-title', preview.summaryValue);
    return;
  }
  appendSiteRequestStatusLine(el, 'request-preview-title', `系统将按「${preview.scopeLabel}」申请`);
  appendSiteRequestStatusLine(el, 'request-preview-target', preview.displayValue || preview.normalizedValue);
  appendSiteRequestStatusLine(el, 'request-preview-note', preview.note || '');
}

function updateSiteRequestPreview() {
  const input = document.getElementById('site-request-input');
  const value = input?.value?.trim() || '';
  renderSiteRequestPreview(previewSiteClassificationTarget(value));
}

function previewSiteClassificationTarget(input) {
  const raw = String(input || '').trim();
  if (!raw) return null;
  if (/^https?:\/\//i.test(raw)) return previewUrlTarget(raw);
  if (/[/?#]/.test(raw)) return null;
  const host = normalizeHostname(raw);
  if (!host) return null;
  const parts = host.split('.').filter(Boolean);
  return {
    ok: true,
    scopeLabel: parts.length > 2 ? '子域名' : '整个域名',
    normalizedValue: host,
    note: '',
  };
}

function previewUrlTarget(raw) {
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    if (parsed.username || parsed.password) return null;
    const host = normalizeHostname(parsed.hostname);
    if (!host) return null;
    const youtube = canonicalizeYouTubePreview(parsed, host);
    if (youtube) return youtube;
    parsed.hash = '';
    return {
      ok: true,
      scopeLabel: '当前完整链接',
      normalizedValue: `${parsed.protocol.toLowerCase()}//${host}${parsed.pathname || '/'}${parsed.search || ''}`,
      note: '',
    };
  } catch (_) {
    return null;
  }
}

function canonicalizeYouTubePreview(parsed, host) {
  if (!isYouTubePreviewHost(host)) return null;
  const path = parsed.pathname || '/';
  const playlistId = normalizeYouTubePreviewId(parsed.searchParams.get('list'));
  if (playlistId) {
    return {
      ok: true,
      scopeLabel: 'YouTube 播放列表',
      normalizedValue: `https://www.youtube.com/playlist?list=${playlistId}`,
      summaryValue: `系统将按「YouTube 播放列表」申请，已识别为 YouTube 播放列表 list=${playlistId}。`,
      note: '',
    };
  }
  let videoId = null;
  if ((stripWwwAlias(host) || host) === 'youtu.be') {
    videoId = normalizeYouTubePreviewId(path.split('/').filter(Boolean)[0]);
  } else if (path === '/watch') {
    videoId = normalizeYouTubePreviewId(parsed.searchParams.get('v'));
  } else if (path.startsWith('/shorts/')) {
    videoId = normalizeYouTubePreviewId(path.split('/').filter(Boolean)[1]);
  }
  if (!videoId) return null;
  return {
    ok: true,
    scopeLabel: 'YouTube 视频',
    normalizedValue: `https://www.youtube.com/watch?v=${videoId}`,
    note: '已识别为 YouTube 视频，将按这个视频申请。',
  };
}

function isYouTubePreviewHost(host) {
  const normalized = normalizeHostname(host);
  if (!normalized) return false;
  if (normalized === 'youtube.com' || normalized.endsWith('.youtube.com')) return true;
  const bare = stripWwwAlias(normalized) || normalized;
  return bare === 'youtu.be';
}

function normalizeYouTubePreviewId(value) {
  const text = String(value || '').trim();
  if (!text) return null;
  return text.replace(/[^a-zA-Z0-9_-]/g, '') || null;
}

function stripWwwAlias(host) {
  const normalized = normalizeHostname(host);
  if (!normalized) return null;
  return normalized.startsWith('www.') ? normalized.slice(4) : normalized;
}

function renderSiteRequestStatus({ kind = 'ok', title = '', body = '', targetText = '', extra = '' } = {}) {
  const status = document.getElementById('site-request-status');
  if (!status) return;
  status.className = `request-status ${kind === 'err' ? 'err' : 'ok'}`;
  status.style.display = 'block';
  status.replaceChildren?.();
  appendSiteRequestStatusLine(status, 'request-status-title', title);
  appendSiteRequestStatusLine(status, 'request-status-body', body);
  appendSiteRequestStatusLine(status, 'request-status-target', targetText ? `申请对象：${targetText}` : '');
  appendSiteRequestStatusLine(status, 'request-status-extra', extra);
}

async function submitSiteClassificationRequest() {
  const inputEl = document.getElementById('site-request-input');
  const status = document.getElementById('site-request-status');
  const submitBtn = document.getElementById('site-request-submit-btn');
  const value = inputEl?.value?.trim() || '';
  const defaults = getDefaultSiteRequest();
  resetSiteRequestStatus(status);
  if (!value) {
    renderSiteRequestStatus({
      kind: 'err',
      title: '无法提交',
      body: '请输入要申请归类的网站或链接。',
    });
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
      renderSiteRequestStatus({
        kind: 'err',
        title: '提交失败',
        body: siteRequestErrorMessage(result || {}),
      });
      return;
    }
    const targetText = result.target?.displayValue ||
      result.target?.normalizedValue ||
      result.request?.displayValue ||
      result.request?.requestedNormalizedValue ||
      value;
    renderSiteRequestStatus({
      kind: 'ok',
      title: result.alreadyPresent
        ? '已提交过'
        : result.localOnly
        ? '已在本机记录'
        : '申请已提交',
      body: result.alreadyPresent
        ? '已提交过该网站归类申请，不会重复创建。'
        : result.localOnly
        ? '登录并绑定云端后，才能提交给家长审批。审批前本机可临时使用，时间计入综合时长。'
        : '审批前可临时使用，时间计入综合时长。',
      targetText,
    });
  } catch (error) {
    renderSiteRequestStatus({
      kind: 'err',
      title: '提交失败',
      body: `提交失败：${error?.message || '后台暂不可用'}`,
    });
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
  const titleEl = banner ? banner.querySelector('div:first-child') : null;
  const bodyEl = banner ? banner.querySelector('div:nth-child(2)') : null;
  const needsConsent = cloudStatus?.reason === 'privacy_consent_required';
  const isLocalMode = !!cloudStatus && !cloudStatus.isBound;

  if (banner) banner.style.display = isLocalMode ? 'block' : 'none';
  if (content) content.style.display = 'block';
  if (titleEl) titleEl.textContent = needsConsent ? '隐私与数据使用说明待确认' : '本地模式';
  if (bodyEl) {
    bodyEl.textContent = needsConsent
      ? '同意后才会启用计时、云同步、诊断上传和设备恢复。'
      : '当前未绑定云端，数据仅保存在本机。';
  }
  if (adminBtn) {
    adminBtn.textContent = needsConsent ? '查看并同意' : '打开管理中心';
    adminBtn.onclick = () => {
      chrome.tabs.create({
        url: needsConsent
          ? chrome.runtime.getURL('privacy-consent.html?reason=popup&next=popup.html')
          : chrome.runtime.getURL('admin/admin.html?view=stats'),
      });
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
  const activeTabHint = await getPopupActiveTabHint();
  try {
    const snapshot = await sendMsg({ type: 'GET_POPUP_FAST_STATUS', activeTabHint }, { attempts: 1, timeoutMs: 900 }) || {};
    return withActiveTabHintFallback(snapshot, activeTabHint);
  } catch (_) {
    return withActiveTabHintFallback({}, activeTabHint);
  }
}

async function getPopupLocalSnapshotSafe() {
  const activeTabHint = await getPopupActiveTabHint();
  const cachedConfigPromise = getPopupCachedConfigSafe();
  try {
    const snapshot = await sendMsg({ type: 'GET_POPUP_LOCAL_SNAPSHOT', activeTabHint }, { attempts: 1, timeoutMs: 900 }) || {};
    const cachedConfig = hasClassificationConfig(snapshot?.config) ? null : await cachedConfigPromise;
    return withActiveTabHintFallback(snapshot, activeTabHint, cachedConfig);
  } catch (_) {
    const cachedConfig = await cachedConfigPromise;
    return withActiveTabHintFallback({
      mode: 'study',
      currentDomain: null,
      currentSessionDurationSeconds: 0,
      config: cachedConfig || {},
      stats: {},
      cloudStatus: { isBound: false, localMode: true, syncEnabled: false },
      childName: null,
    }, activeTabHint, cachedConfig);
  }
}

async function getPopupActiveTabHint() {
  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const tab = tabs && tabs[0] ? tabs[0] : null;
    if (!tab?.url) return null;
    const parsed = new URL(tab.url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:' && !isReminderExtensionUrl(tab.url)) return null;
    return {
      tabId: Number.isInteger(tab.id) ? tab.id : null,
      windowId: Number.isInteger(tab.windowId) ? tab.windowId : null,
      url: tab.url,
      lastAccessed: Number.isFinite(Number(tab.lastAccessed)) ? Number(tab.lastAccessed) : null,
    };
  } catch (_) {
    return null;
  }
}

function withActiveTabHintFallback(snapshot = {}, activeTabHint = null, fallbackConfig = null) {
  if (isReminderExtensionUrl(activeTabHint?.url || '')) {
    const config = hasClassificationConfig(snapshot?.config)
      ? snapshot.config
      : (fallbackConfig || snapshot?.config || {});
    return {
      ...(snapshot || {}),
      config,
      url: snapshot?.url || activeTabHint.url,
      tabId: Number.isInteger(snapshot?.tabId) ? snapshot.tabId : activeTabHint.tabId,
      windowId: Number.isInteger(snapshot?.windowId) ? snapshot.windowId : activeTabHint.windowId,
    };
  }
  const domain = extractDomain(activeTabHint?.url || '');
  const config = hasClassificationConfig(snapshot?.config)
    ? snapshot.config
    : (fallbackConfig || snapshot?.config || {});
  if (!domain) return { ...(snapshot || {}), config };
  const currentSeconds = Number(snapshot?.currentSessionDurationSeconds);
  const fallbackSeconds = resolveHintLiveSeconds(activeTabHint);
  return {
    ...(snapshot || {}),
    config,
    currentDomain: snapshot?.currentDomain || domain,
    domain: snapshot?.domain || domain,
    url: snapshot?.url || activeTabHint.url,
    tabId: Number.isInteger(snapshot?.tabId) ? snapshot.tabId : activeTabHint.tabId,
    currentSessionDurationSeconds: Number.isFinite(currentSeconds) && currentSeconds > 0
      ? Math.floor(currentSeconds)
      : fallbackSeconds,
  };
}

function resolveHintLiveSeconds(activeTabHint = null) {
  const lastAccessed = Number(activeTabHint?.lastAccessed);
  if (!Number.isFinite(lastAccessed) || lastAccessed <= 0) return 0;
  return Math.max(0, Math.floor((Date.now() - lastAccessed) / 1000));
}

async function getPopupCachedConfigSafe() {
  try {
    const result = await readChromeLocal([POPUP_CONFIG_KEY, SITE_CLASSIFICATION_REQUESTS_KEY]);
    const config = result?.[POPUP_CONFIG_KEY];
    const requests = Array.isArray(result?.[SITE_CLASSIFICATION_REQUESTS_KEY])
      ? result[SITE_CLASSIFICATION_REQUESTS_KEY]
      : [];
    return config && typeof config === 'object'
      ? { ...config, siteClassificationRequestsV1: requests }
      : { siteClassificationRequestsV1: requests };
  } catch (_) {
    return null;
  }
}

function readChromeLocal(keys) {
  return new Promise((resolve) => {
    try {
      const maybePromise = chrome.storage?.local?.get(keys, (result) => resolve(result || {}));
      if (maybePromise && typeof maybePromise.then === 'function') {
        maybePromise.then((result) => resolve(result || {})).catch(() => resolve({}));
      }
    } catch (_) {
      resolve({});
    }
  });
}

function hasClassificationConfig(config = {}) {
  if (!config || typeof config !== 'object') return false;
  const keys = [
    'studyList',
    'defaultStudySites',
    'customStudyList',
    'compositeList',
    'defaultCompositeSites',
    'customCompositeList',
    'restrictedEntertainmentList',
    'defaultRestrictedEntertainmentList',
    'customRestrictedEntertainmentList',
    'entertainmentList',
    'siteClassificationRulesV1',
    'siteClassificationRequestsV1',
  ];
  return keys.some((key) => Array.isArray(config[key]) && config[key].length > 0);
}

function renderModeButtons(status = {}) {
  const mode = status?.mode || 'study';
  const studyBtn = document.getElementById('btn-study');
  const restBtn  = document.getElementById('btn-rest');
  const compositeBtn = document.getElementById('btn-composite');
  studyBtn.className = 'mode-btn' + (mode === 'study' ? ' active-study' : '');
  restBtn.className  = 'mode-btn' + (mode === 'rest'  ? ' active-rest'  : '');
  compositeBtn.className  = 'mode-btn' + (mode === 'composite' ? ' active-composite' : '');
  const disabled = mode === 'paused' || mode === 'locked';
  studyBtn.disabled = disabled;
  restBtn.disabled = disabled;
  compositeBtn.disabled = disabled;
}

async function setMode(mode) {
  const previousMode = lastPopupSnapshot?.mode || popupStatsContext?.config?.mode || 'study';
  renderModeButtons({ ...(lastPopupSnapshot || {}), mode });
  lastPopupSnapshot = { ...(lastPopupSnapshot || {}), mode };
  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const activeTab = tabs && tabs[0] ? tabs[0] : null;
    const noticeTabId = Number.isInteger(activeTab?.id) ? activeTab.id : null;
    const switchResult = await sendMsg({
      type: 'REQUEST_MODE_CHANGE',
      toMode: mode,
      source: 'popup',
      reason: 'manual_mode_switch',
      noticeTabId,
    });
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
  hydrateSiteRequestInputFromSnapshot('init_snapshot');
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
  const quota = getTodayEffectiveQuota(config);

  const studyLimit = quota.studyMinutes === null ? null : Math.max(0, Number(quota.studyMinutes) * 60);
  const effectiveRestLimit = quota.restMinutes === null ? null : Math.max(0, Number(quota.restMinutes) * 60);
  const undeterminedLimit = quota.compositeMinutes === null ? null : Math.max(0, Number(quota.compositeMinutes) * 60);
  studyBtnValue.textContent = studyLimit !== null
    ? `${formatSeconds(studySeconds)} / ${formatSeconds(studyLimit)}`
    : `${formatSeconds(studySeconds)}`;
  restBtnValue.textContent = effectiveRestLimit !== null
    ? `${formatSeconds(restSeconds)} / ${formatSeconds(effectiveRestLimit)}`
    : `${formatSeconds(restSeconds)}`;
  compositeBtnValue.textContent = undeterminedLimit !== null
    ? `${formatSeconds(compositeSeconds)} / ${formatSeconds(undeterminedLimit)}`
    : `${formatSeconds(compositeSeconds)}`;

  // Usage metrics
  const onlineLimit = quota.onlineMinutes === null ? 0 : Math.max(0, Number(quota.onlineMinutes) * 60);
  const qs = config.quotaState || {};

  const quotaBarsEl = document.getElementById('quota-bars');
  if (quotaBarsEl) {
    const appIconHtml = '<img class="popup-mini-logo" src="../icons/app-icon.png" alt="">';
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
        icon: appIconHtml,
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
        icon: appIconHtml,
        label: '后台媒体',
        used: backendMediaSeconds,
        sub: '后台播放'
      }));
    }
    if (pipMediaSeconds > 0) {
      items.push(metric({
        icon: appIconHtml,
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
  const targetLabel = status?.currentManagedTarget?.managedTargetLabelAtTime ||
    status?.currentManagedTarget?.managedTargetValue ||
    null;
  const tag = targetLabel || resolveDomainTag(domain, status?.config || popupStatsContext.config, status?.url || null);
  const liveSessionSeconds = resolveLiveSessionSeconds(domain, status);
  const sessionText = formatRuntimeSessionDuration(liveSessionSeconds);
  const domainText = domain || '不计时页面';
  const tagHtml = tag && tag !== domainText
    ? `<span class="runtime-tag">${escapeHtml(tag)}</span>`
    : '';
  runtimeCompact.innerHTML = `
    <div class="runtime-compact-main">
      <div class="runtime-compact-title">当前访问</div>
      <div class="runtime-duration">${sessionText}</div>
    </div>
    <div class="runtime-compact-main">
      <span class="runtime-domain">${escapeHtml(domainText)}</span>
      ${tagHtml}
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

function resolveDomainTag(domain, config = {}, urlOrDomain = null) {
  if (!domain) return '不计时页面';
  const classification = resolveDomainClassification(domain, config, urlOrDomain);
  if (classification === 'blocked') return '阻止网站';
  if (classification === 'restricted') return '受限娱乐网站';
  if (classification === 'study') return '学习网站';
  if (classification === 'pending_composite') return '已申请待归类网站';
  if (classification === 'composite') return '综合网站';
  if (classification === 'rest') return '休息网站';
  if (classification === 'rejected') return '受限娱乐网站';
  if (classification === 'conflict') return '配置冲突';
  return '未归类网站';
}

function resolveDomainClassification(domain, config = {}, urlOrDomain = null) {
  const normalizedDomain = normalizeHostname(domain);
  if (!normalizedDomain) return null;
  const candidates = [];
  const structuredRules = Array.isArray(config.siteClassificationRulesV1) ? config.siteClassificationRulesV1 : [];
  for (const rule of structuredRules) {
    const decision = normalizeRuleDecision(rule?.decision || rule?.classification || rule?.status);
    if (!decision) continue;
    const targetType = rule.targetType || rule.type;
    const value = rule.normalizedValue || rule.targetValue || rule.value;
    if (targetType === 'url') {
      const normalizedUrl = normalizeUrlTarget(urlOrDomain);
      if (normalizedUrl && normalizedUrl === normalizeUrlTarget(value)) {
        candidates.push({ classification: decision, specificity: 100000 + normalizedUrl.length });
      }
    } else if (targetType === 'host') {
      const specificity = hostPatternSpecificity(value, normalizedDomain);
      if (specificity != null) candidates.push({ classification: decision, specificity });
    }
  }
  const requestRecords = Array.isArray(config.siteClassificationRequestsV1) ? config.siteClassificationRequestsV1 : [];
  for (const record of requestRecords) {
    const status = record?.status || 'pending';
    if (status === 'pending') {
      addTargetCandidate(candidates, 'pending_composite', record?.requestedTargetType || record?.targetType || record?.type, record?.requestedNormalizedValue || record?.normalizedValue || record?.targetValue || record?.value, normalizedDomain, urlOrDomain);
    } else if (status === 'rejected') {
      addTargetCandidate(candidates, 'rejected', record?.decisionTargetType || record?.requestedTargetType || record?.targetType || record?.type, record?.decisionNormalizedValue || record?.requestedNormalizedValue || record?.normalizedValue || record?.targetValue || record?.value, normalizedDomain, urlOrDomain);
    }
  }
  addPatternCandidates(candidates, 'blocked', collectBlockedPatterns(config), normalizedDomain);
  addPatternCandidates(candidates, 'restricted', collectRestrictedPatterns(config), normalizedDomain);
  addPatternCandidates(candidates, 'study', collectStudyPatterns(config), normalizedDomain);
  addPatternCandidates(candidates, 'composite', collectCompositePatterns(config), normalizedDomain);
  addPatternCandidates(candidates, 'rest', collectRestPatterns(config), normalizedDomain);
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => b.specificity - a.specificity || classificationTiePriority(b.classification) - classificationTiePriority(a.classification));
  const top = candidates[0];
  const tiedClasses = new Set(candidates.filter(c => c.specificity === top.specificity).map(c => c.classification));
  return tiedClasses.size > 1 ? 'conflict' : top.classification;
}

function addTargetCandidate(candidates, classification, targetType, value, domain, urlOrDomain = null) {
  if (!classification || !targetType || !value) return;
  if (targetType === 'url') {
    const normalizedUrl = normalizeUrlTarget(urlOrDomain);
    const targetUrl = normalizeUrlTarget(value);
    if (normalizedUrl && targetUrl && normalizedUrl === targetUrl) {
      candidates.push({ classification, specificity: 100000 + targetUrl.length });
    }
    return;
  }
  if (targetType === 'host') {
    const specificity = hostPatternSpecificity(value, domain);
    if (specificity != null) candidates.push({ classification, specificity });
  }
}

function addPatternCandidates(candidates, classification, patterns, domain) {
  for (const pattern of patterns || []) {
    const specificity = hostPatternSpecificity(pattern, domain);
    if (specificity != null) candidates.push({ classification, specificity });
  }
}

function normalizeRuleDecision(value) {
  if (value === 'approved_study' || value === 'study') return 'study';
  if (value === 'approved_composite' || value === 'composite') return 'composite';
  if (value === 'rejected' || value === 'reject') return 'rejected';
  return null;
}

function classificationTiePriority(classification) {
  return {
    blocked: 100,
    rejected: 95,
    restricted: 90,
    study: 80,
    composite: 70,
    pending_composite: 65,
    rest: 60,
  }[classification] || 0;
}

function normalizePatternHost(pattern) {
  const raw = String(pattern || '').trim().toLowerCase().replace(/\.+$/g, '');
  if (!raw) return null;
  const wildcard = raw.startsWith('*.');
  const value = wildcard ? raw.slice(2) : raw;
  const host = normalizeHostname(value);
  if (!host) return null;
  return { host, wildcard, matchValue: wildcard ? `*.${host}` : host };
}

function hostPatternSpecificity(pattern, domain) {
  const parsed = normalizePatternHost(pattern);
  const normalizedDomain = normalizeHostname(domain);
  if (!parsed || !normalizedDomain || !matchDomainForClassification(normalizedDomain, parsed.matchValue)) return null;
  const depth = parsed.host.split('.').filter(Boolean).length;
  const exact = matchDomainForClassification(normalizedDomain, parsed.host) && matchDomainForClassification(parsed.host, normalizedDomain);
  return depth * 10 + (exact ? 9 : parsed.wildcard ? 5 : 0);
}

function matchDomainForClassification(domain, pattern) {
  const d = normalizeHostname(domain);
  const p = normalizePatternHost(pattern);
  if (!d || !p) return false;
  if (d === p.host) return true;
  if (p.wildcard) return d !== p.host && d.endsWith(`.${p.host}`);
  return d.endsWith(`.${p.host}`);
}

function normalizeUrlTarget(value) {
  if (!value || !/^https?:\/\//i.test(String(value))) return null;
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    const host = normalizeHostname(parsed.hostname);
    if (!host) return null;
    parsed.hash = '';
    return `${parsed.protocol.toLowerCase()}//${host}${parsed.pathname || '/'}${parsed.search || ''}`;
  } catch {
    return null;
  }
}

function collectStudyPatterns(config = {}) {
  return collectPatternFields(config, [
    'studyList',
    'defaultStudySites',
    'customStudyList',
  ]);
}

function collectCompositePatterns(config = {}) {
  return collectPatternFields(config, [
    'compositeList',
    'defaultCompositeSites',
    'customCompositeList',
  ]);
}

function collectPatternFields(config = {}, keys = []) {
  const patterns = [];
  for (const key of keys) {
    const value = config[key];
    if (!Array.isArray(value)) continue;
    for (const item of value) patterns.push(item);
  }
  return patterns;
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

function collectBlockedPatterns(config = {}) {
  return collectPatternFields(config, [
    'unsafeList',
    'blacklist',
    'defaultBlockedSites',
    'customBlockedSites',
    'defaultUnsafeSites',
    'customUnsafeSites',
  ]);
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
  return getTodayEffectiveQuota(config).restMinutes;
}

function legacyQuotaMinutes(value, fallback) {
  if (value === undefined || value === '') return fallback;
  if (value === null || Number(value) === 0) return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : fallback;
}

function timeQuotaField(dayConfig, field, legacyValue, fallback) {
  if (dayConfig && Object.prototype.hasOwnProperty.call(dayConfig, field)) {
    const raw = dayConfig[field];
    if (raw === null) return null;
    const number = Number(raw);
    if (Number.isFinite(number) && number >= 0) return number;
  }
  return legacyQuotaMinutes(legacyValue, fallback);
}

function getTodayEffectiveQuota(config = {}) {
  const now = new Date();
  const dayKey = QUOTA_DAYS[now.getDay()];
  const dayQuota = config.timeQuota?.daily?.[dayKey] || null;
  const baseRest = timeQuotaField(dayQuota, 'restMinutes', config.dailyRestQuota, 120);
  const restMinutes = applyRestBorrowForToday(baseRest, config);
  const onlineRaw = config.dailyOnlineQuota ?? config.dailyQuota;
  const onlineNumber = Number(onlineRaw);
  return {
    studyMinutes: timeQuotaField(dayQuota, 'studyMinutes', config.dailyStudyQuota, null),
    restMinutes,
    compositeMinutes: timeQuotaField(dayQuota, 'compositeMinutes', config.dailyUndeterminedQuota, 120),
    onlineMinutes: Number.isFinite(onlineNumber) && onlineNumber > 0 ? onlineNumber : null,
  };
}

function localDateKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function applyRestBorrowForToday(base, config = {}) {
  if (base === null) return null;
  const borrow = config.quotaBorrow;
  if (!borrow || borrow.repaid) return base;

  const today = localDateKey();
  if (today === borrow.borrowedFrom) return base + borrow.amount;

  const repayD = new Date(borrow.borrowedFrom + 'T00:00:00');
  repayD.setDate(repayD.getDate() + 1);
  const repayStr = localDateKey(repayD);
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
