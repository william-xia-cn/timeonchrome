// popup/popup.js - 孩子视角：只读时间用量展示

let popupStatsContext = { config: {}, stats: {} };
let lastPopupSnapshot = {};
let activeSiteRequestSpecialOptions = [];
const POPUP_CONFIG_KEY = 'guardian_config';
const SITE_CLASSIFICATION_REQUESTS_KEY = 'site_classification_requests_v1';
const QUOTA_DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const SITE_REQUEST_MESSAGE_OPTIONS = { attempts: 3, timeoutMs: 2500 };

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
    return { input: currentUrl, sourceTabId: lastPopupSnapshot?.tabId ?? null, specialSiteTargets: lastPopupSnapshot?.specialSiteTargets || [] };
  }
  const domain = lastPopupSnapshot?.currentDomain || lastPopupSnapshot?.domain || '';
  return { input: domain || '', sourceTabId: lastPopupSnapshot?.tabId ?? null, specialSiteTargets: lastPopupSnapshot?.specialSiteTargets || [] };
}

async function openSiteRequestPanel() {
  const entry = document.getElementById('site-request-entry');
  const panel = document.getElementById('site-request-panel');
  const input = document.getElementById('site-request-input');
  const status = document.getElementById('site-request-status');
  const openBtn = document.getElementById('site-request-open-btn');
  const defaults = getDefaultSiteRequest();
  resetSiteRequestEntryStatus();
  if (defaults.input) {
    const originalText = openBtn?.textContent || '申请归为学习网站';
    if (openBtn) {
      openBtn.disabled = true;
      openBtn.textContent = '检查中…';
    }
    try {
      const validation = await validateSiteClassificationRequestInput(defaults.input, defaults.sourceTabId, defaults.specialSiteTargets || []);
      if (!validation?.ok) {
        renderSiteRequestEntryStatus(siteRequestErrorMessage(validation || {}));
        return;
      }
    } catch (error) {
      renderSiteRequestEntryStatus(siteRequestRuntimeErrorMessage(error));
      return;
    } finally {
      if (openBtn) {
        openBtn.disabled = false;
        openBtn.textContent = originalText;
      }
    }
  }
  setSiteRequestPanelMode(defaults.input || '', defaults.specialSiteTargets || []);
  if (entry) entry.style.display = 'none';
  if (panel) panel.style.display = 'block';
  if (input && !input.value.trim()) {
    const firstEnabledOption = activeSiteRequestSpecialOptions[getDefaultYouTubeSpecialRequestOptionIndex(activeSiteRequestSpecialOptions)] || activeSiteRequestSpecialOptions[0];
    input.value = firstEnabledOption?.value || defaults.input || '';
  }
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

function resetSiteRequestEntryStatus() {
  const el = document.getElementById('site-request-entry-status');
  if (!el) return;
  el.className = 'request-entry-status';
  el.textContent = '';
}

function renderSiteRequestEntryStatus(message) {
  const el = document.getElementById('site-request-entry-status');
  if (!el) return;
  el.className = 'request-entry-status err';
  el.textContent = message || '当前网站不能申请归为学习网站。';
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
  activeSiteRequestSpecialOptions = [];
}

function setSiteRequestPanelMode(rawInput = '', specialSiteTargets = []) {
  const panel = document.getElementById('site-request-panel');
  const title = document.getElementById('site-request-panel-title');
  const primary = document.getElementById('site-request-help-primary');
  const secondary = document.getElementById('site-request-help-secondary');
  const optionsEl = document.getElementById('site-request-special-options');
  const summaryEl = document.getElementById('site-request-special-summary');
  const options = getYouTubeSpecialRequestOptions(rawInput, specialSiteTargets);
  activeSiteRequestSpecialOptions = options;
  if (options.length > 0) {
    const defaultIndex = getDefaultYouTubeSpecialRequestOptionIndex(options);
    panel?.setAttribute('data-special-site-request', 'youtube');
    if (title) title.textContent = '申请 YouTube 学习对象';
    if (primary) primary.textContent = 'YouTube 首页/推荐仍按受限娱乐；仅视频、播放列表、频道可单独申请。';
    if (secondary) secondary.textContent = '家长批准前仍计入待归类时间；家长也可以改判为复合网站对象。';
    if (optionsEl) {
      optionsEl.className = 'request-special-options active';
      optionsEl.innerHTML = options.map((item, idx) => `<button type="button" class="${idx === defaultIndex ? 'active' : ''}" data-special-request-option="${idx}">${item.label}</button>`).join('');
      optionsEl.querySelectorAll('button').forEach((button) => {
        button.addEventListener('click', () => selectSpecialSiteRequestOption(Number(button.dataset.specialRequestOption)));
      });
    }
    renderSpecialSiteRequestSummary(defaultIndex);
    return;
  }
  panel?.removeAttribute('data-special-site-request');
  if (title) title.textContent = '申请归为学习网站';
  if (primary) primary.textContent = '未归类网站访问时会自动生成访问记录。这里用于主动申请归为学习网站；家长批准前仍按待归类时间计入。';
  if (secondary) secondary.innerHTML = '你可以修改下方内容来调整申请范围。<br>example.com 表示整个网站；<br>learn.example.com 表示子域名；<br>https://example.com/course/1 表示这个具体链接。';
  if (optionsEl) {
    optionsEl.className = 'request-special-options';
    optionsEl.replaceChildren?.();
    optionsEl.textContent = '';
  }
  if (summaryEl) {
    summaryEl.className = 'request-special-summary';
    summaryEl.textContent = '';
  }
}

function getDefaultYouTubeSpecialRequestOptionIndex(options = []) {
  const videoIndex = options.findIndex((item) => item?.kind === 'video');
  return videoIndex >= 0 ? videoIndex : 0;
}
function renderSpecialSiteRequestSummary(index = 0) {
  const summaryEl = document.getElementById('site-request-special-summary');
  if (!summaryEl) return;
  const option = activeSiteRequestSpecialOptions[index] || activeSiteRequestSpecialOptions[0];
  if (!option) {
    summaryEl.className = 'request-special-summary';
    summaryEl.textContent = '';
    return;
  }
  summaryEl.className = 'request-special-summary active';
  summaryEl.textContent = `已识别：${option.label}`;
}
function selectSpecialSiteRequestOption(index) {
  const option = activeSiteRequestSpecialOptions[index];
  const input = document.getElementById('site-request-input');
  if (!option || !input) return;
  input.value = option.value;
  document.querySelectorAll('[data-special-request-option]').forEach((button) => {
    button.classList.toggle('active', Number(button.dataset.specialRequestOption) === index);
  });
  renderSpecialSiteRequestSummary(index);
  updateSiteRequestPreview();
}

function siteRequestRuntimeErrorMessage(error = {}) {
  const message = error?.message || String(error || '');
  if (message === 'background_timeout') return '后台正在启动，请再试一次。';
  if (message.includes('Extension context invalidated')) return '扩展刚刚更新，请重新打开弹窗后再试。';
  return `后台暂不可用：${message || '请稍后再试'}`;
}

function siteRequestErrorMessage(result = {}) {
  if (result.code === 'REQUEST_REJECTED') return '该范围已归为受限娱乐，不能申请归为学习网站。';
  if (result.code === 'ALREADY_CLASSIFIED') return '该网站已归类，不能申请重新归类。';
  if (result.code === 'CLASSIFICATION_SCOPE_BLOCKED') return '该网站位于受限娱乐或黑名单范围内，不能申请归为学习网站。请先让家长调整父域策略。';
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
      summaryValue: '确认对象：YouTube 播放列表',
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
  if (!videoId) {
    const channelPath = normalizeYouTubePreviewChannelPath(path);
    if (!channelPath) return null;
    return {
      ok: true,
      scopeLabel: 'YouTube 频道',
      normalizedValue: 'https://www.youtube.com' + channelPath,
      summaryValue: '确认对象：YouTube 频道',
      note: '',
    };
  }
  return {
    ok: true,
    scopeLabel: 'YouTube 视频',
    normalizedValue: `https://www.youtube.com/watch?v=${videoId}`,
    summaryValue: '确认对象：YouTube 单个视频',
    note: '',
  };
}

function getYouTubeSpecialRequestOptions(rawInput = '', specialSiteTargets = []) {
  const raw = String(rawInput || '').trim();
  if (!/^https?:\/\//i.test(raw)) return [];
  try {
    const parsed = new URL(raw);
    const host = normalizeHostname(parsed.hostname);
    if (!isYouTubePreviewHost(host)) return [];
    const path = parsed.pathname || '/';
    const options = [];
    const playlistId = normalizeYouTubePreviewId(parsed.searchParams.get('list'));
    if (playlistId) {
      options.push({ kind: 'playlist', label: '播放列表', value: `https://www.youtube.com/playlist?list=${playlistId}` });
    }
    const channelPath = normalizeYouTubePreviewChannelPath(path);
    if (channelPath) {
      options.push({ kind: 'channel', label: '频道', value: `https://www.youtube.com${channelPath}` });
    }
    let videoId = null;
    if ((stripWwwAlias(host) || host) === 'youtu.be') {
      videoId = normalizeYouTubePreviewId(path.split('/').filter(Boolean)[0]);
    } else if (path === '/watch') {
      videoId = normalizeYouTubePreviewId(parsed.searchParams.get('v'));
    } else if (path.startsWith('/shorts/')) {
      videoId = normalizeYouTubePreviewId(path.split('/').filter(Boolean)[1]);
    }
    if (videoId) {
      options.push({ kind: 'video', label: '单个视频', value: `https://www.youtube.com/watch?v=${videoId}` });
    }
    const contextChannel = youtubeChannelOptionFromSpecialTargets(specialSiteTargets);
    if (contextChannel && !options.some((item) => item.kind === 'channel' && item.value === contextChannel.value)) {
      options.push(contextChannel);
    }
    return options;
  } catch (_) {
    return [];
  }
}

function youtubeChannelOptionFromSpecialTargets(specialSiteTargets = []) {
  const targets = Array.isArray(specialSiteTargets) ? specialSiteTargets : [];
  const channel = targets.find((item) => item?.targetType === 'url'
    && item?.specialSite?.platform === 'youtube'
    && item?.specialSite?.kind === 'channel'
    && typeof item.normalizedValue === 'string'
    && item.normalizedValue.trim());
  return channel ? { kind: 'channel', label: '频道', value: channel.normalizedValue.trim() } : null;
}
function normalizeYouTubePreviewChannelPath(path) {
  const parts = String(path || '').split('/').filter(Boolean);
  if (!parts.length) return null;
  const first = parts[0] || '';
  if (first.startsWith('@')) {
    const handle = first.slice(1).replace(/[^a-zA-Z0-9_.-]/g, '');
    return handle ? `/@${handle.toLowerCase()}` : null;
  }
  if (['channel', 'c', 'user'].includes(first)) {
    const raw = parts[1] || '';
    const id = raw.replace(/[^a-zA-Z0-9_.-]/g, '');
    return id ? `/${first}/${id.toLowerCase()}` : null;
  }
  return null;
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

async function validateSiteClassificationRequestInput(value, sourceTabId = null, specialSiteTargets = []) {
  return await sendMsg({
    type: 'VALIDATE_SITE_CLASSIFICATION_REQUEST',
    input: value,
    sourceTabId,
    requestedClassification: 'study',
    specialSiteTargets: Array.isArray(specialSiteTargets) ? specialSiteTargets : [],
  }, SITE_REQUEST_MESSAGE_OPTIONS);
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
      body: '请输入要申请归为学习网站的网站或链接。',
    });
    return;
  }
  if (submitBtn) submitBtn.disabled = true;
  try {
    const validation = await validateSiteClassificationRequestInput(value, defaults.sourceTabId, defaults.specialSiteTargets || []);
    if (!validation?.ok) {
      renderSiteRequestStatus({
        kind: 'err',
        title: '无法提交',
        body: siteRequestErrorMessage(validation || {}),
      });
      return;
    }
    const result = await sendMsg({
      type: 'SUBMIT_SITE_CLASSIFICATION_REQUEST',
      input: value,
      sourceTabId: defaults.sourceTabId,
      requestedClassification: 'study',
      specialSiteTargets: defaults.specialSiteTargets || [],
    }, SITE_REQUEST_MESSAGE_OPTIONS);
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
        ? '已申请过'
        : result.promoted
        ? '已从访问记录升级'
        : result.localOnly
        ? '已在本机创建学习归类申请'
        : '已创建学习归类申请',
      body: result.alreadyPresent
        ? '该网站已经申请归为学习网站，不会重复创建。'
        : result.promoted
        ? '原未归类网站访问记录已升级为学习网站归类申请，访问概况已保留。家长批准前仍计入待归类时间。'
        : result.localOnly
        ? '登录并绑定云端后，学习网站归类申请才能同步给家长。批准前本机仍计入待归类时间。'
        : '家长批准前仍计入待归类时间。',
      targetText,
    });
  } catch (error) {
    renderSiteRequestStatus({
      kind: 'err',
      title: '提交失败',
      body: siteRequestRuntimeErrorMessage(error),
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
  const isBound = cloudStatus?.isBound === true;
  const reason = cloudStatus?.reason || null;
  const needsConsent = reason === 'privacy_consent_required' || cloudStatus?.privacyConsentRequired === true;
  const isManaged = cloudStatus?.activationMode === 'managed_policy' || cloudStatus?.activationSource === 'managed_policy';
  const isActivationBlocked = isBound && cloudStatus?.runtimeActivated === false;
  const isProfileMismatch = reason === 'managed_profile_email_mismatch';
  const isManagedPending = reason === 'managed_policy_pending' || reason === 'runtime_activation_required';
  const showBanner = !isBound || needsConsent || isActivationBlocked;

  if (banner) banner.style.display = showBanner ? 'block' : 'none';
  if (content) content.style.display = 'block';
  if (titleEl) {
    titleEl.textContent = !isBound
      ? '本地模式'
      : (needsConsent
        ? '隐私与数据使用说明待确认'
        : (isProfileMismatch
          ? 'Chrome Profile 未授权'
          : (isManaged || isManagedPending ? '受管理部署待生效' : '云端绑定待生效')));
  }
  if (bodyEl) {
    bodyEl.textContent = !isBound
      ? '当前未绑定云端，数据仅保存在本机。'
      : (needsConsent
        ? '同意后才会启用计时、云同步、诊断上传和设备恢复。'
        : (isProfileMismatch
          ? '当前 Chrome Profile 未被此受管部署授权，请切换到受管账号对应的 Chrome Profile。'
          : (isManaged || isManagedPending
            ? '设备已绑定云端，并检测到受管理部署；当前运行门禁尚未通过，配置同步后会自动生效。'
            : '设备已绑定云端，但当前运行门禁尚未通过。')));
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
  const cachedStatePromise = getPopupCachedStateSafe();
  try {
    const snapshot = await sendMsg({ type: 'GET_POPUP_LOCAL_SNAPSHOT', activeTabHint }, { attempts: 1, timeoutMs: 900 }) || {};
    const cachedState = await cachedStatePromise;
    const cachedConfig = hasClassificationConfig(snapshot?.config) ? null : cachedState?.config;
    return withActiveTabHintFallback(snapshot, activeTabHint, cachedConfig);
  } catch (_) {
    const cachedState = await cachedStatePromise;
    const cachedConfig = cachedState?.config || null;
    return withActiveTabHintFallback({
      mode: 'study',
      currentDomain: null,
      currentSessionDurationSeconds: 0,
      config: cachedConfig || {},
      stats: {},
      cloudStatus: cachedState?.cloudStatus || { isBound: false, localMode: true, syncEnabled: false },
      childName: cachedState?.childName || null,
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

async function getPopupCachedStateSafe() {
  try {
    const result = await readChromeLocal([
      POPUP_CONFIG_KEY,
      SITE_CLASSIFICATION_REQUESTS_KEY,
      'cloud_device_token',
      'cloud_device_id',
      'cloud_profile_id',
      'cloud_profile_name',
      'statsFoundationV1SyncEnabled',
    ]);
    const config = result?.[POPUP_CONFIG_KEY];
    const requests = Array.isArray(result?.[SITE_CLASSIFICATION_REQUESTS_KEY])
      ? result[SITE_CLASSIFICATION_REQUESTS_KEY]
      : [];
    const cachedConfig = config && typeof config === 'object'
      ? { ...config, siteClassificationRequestsV1: requests }
      : { siteClassificationRequestsV1: requests };
    const isBound = !!result?.cloud_device_token;
    return {
      config: cachedConfig,
      cloudStatus: {
        isBound,
        localMode: !isBound,
        syncEnabled: isBound,
        reason: isBound ? null : 'snapshot_timeout_no_device_token',
        deviceId: result?.cloud_device_id || null,
        profileId: result?.cloud_profile_id || null,
        v1SyncEnabled: result?.statsFoundationV1SyncEnabled ?? true,
      },
      childName: result?.cloud_profile_name || null,
    };
  } catch (_) {
    return null;
  }
}

async function getPopupCachedConfigSafe() {
  const cached = await getPopupCachedStateSafe();
  return cached?.config || null;
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
    'defaultCompositeList',
    'defaultUserCompositeSites',
    'defaultUserCompositeList',
    'recommendedCompositeSites',
    'customCompositeList',
    'restrictedEntertainmentList',
    'defaultRestrictedEntertainmentSites',
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
    renderTaskReadModel(nextStatus);
  } catch (error) {
    lastPopupSnapshot = { ...(lastPopupSnapshot || {}), mode: previousMode };
    renderModeButtons(lastPopupSnapshot);
    renderRuntimeStatus(lastPopupSnapshot);
    renderTaskReadModel(lastPopupSnapshot);
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
  renderTaskReadModel(runtimeStatus || {});
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

function renderTaskReadModel(status = {}) {
  const card = document.getElementById('task-read-model-card');
  if (!card) return;
  const model = status?.taskReadModel || {};
  const activeCount = Number(model.activeCount || 0);
  const progressTask = model.progressTask || null;
  const nextTask = model.nextTask || null;
  if (!progressTask && !nextTask && activeCount <= 0) {
    card.className = 'task-card';
    card.replaceChildren?.();
    return;
  }
  const task = progressTask || nextTask;
  const completed = Math.max(0, Number(task?.completedSeconds || 0));
  const required = Math.max(0, Number(task?.requiredSeconds || 0));
  const remaining = Math.max(0, Number(task?.remainingSeconds || (required - completed)) || 0);
  const title = progressTask ? '当前任务' : '下一任务';
  const sub = progressTask
    ? `任务期间只允许任务资源；当前进度归属此任务 · 剩余 ${formatSeconds(remaining)}`
    : `计划开始 ${formatTaskClock(task?.plannedStartAt)} · 需要 ${formatSeconds(required)}`;
  card.className = 'task-card active';
  card.innerHTML = `
    <div class="task-card-title">${escapeHtml(title)}${activeCount > 1 ? ` · 同时生效 ${activeCount} 个` : ''}</div>
    <div class="task-card-main">
      <div class="task-card-name">${escapeHtml(task?.name || '未命名任务')}</div>
      <div class="task-card-progress">${required > 0 ? `${formatSeconds(completed)} / ${formatSeconds(required)}` : '待同步'}</div>
    </div>
    <div class="task-card-sub">${escapeHtml(sub)}</div>`;
}

function formatTaskClock(epochMs) {
  const n = Number(epochMs || 0);
  if (!Number.isFinite(n) || n <= 0) return '未设置';
  const d = new Date(n);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
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
  if (classification === 'pending_composite') {
    const pendingRecord = findMatchingPendingSiteRecord(domain, config, urlOrDomain);
    if (pendingRecord?.requestedClassification === 'study') return '已申请归为学习网站';
    if (!pendingRecord?.recordSource || pendingRecord.recordSource === 'legacy') return '历史网站归类记录';
    return '未归类网站访问记录';
  }
  if (classification === 'composite') return '复合网站';
  if (classification === 'rest') return '休息网站';
  if (classification === 'rejected') return '受限娱乐网站';
  if (classification === 'conflict') return '配置冲突';
  return '未归类网站';
}

function findMatchingPendingSiteRecord(domain, config = {}, urlOrDomain = null) {
  const normalizedDomain = normalizeHostname(domain);
  if (!normalizedDomain) return null;
  const candidates = [];
  const records = Array.isArray(config.siteClassificationRequestsV1) ? config.siteClassificationRequestsV1 : [];
  for (const record of records) {
    if ((record?.status || 'pending') !== 'pending') continue;
    const targetType = record?.requestedTargetType || record?.targetType || record?.type;
    const value = record?.requestedNormalizedValue || record?.normalizedValue || record?.targetValue || record?.value;
    if (targetType === 'url') {
      const currentUrl = normalizeUrlTarget(urlOrDomain);
      const targetUrl = normalizeUrlTarget(value);
      if (currentUrl && targetUrl && currentUrl === targetUrl) {
        candidates.push({ record, specificity: 100000 + currentUrl.length });
      }
    } else if (targetType === 'host') {
      const specificity = hostPatternSpecificity(value, normalizedDomain);
      if (specificity != null) candidates.push({ record, specificity });
    }
  }
  candidates.sort((a, b) => b.specificity - a.specificity);
  return candidates[0]?.record || null;
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
  const dIdentity = d.startsWith('www.') ? d.slice(4) : d.startsWith('m.') ? d.slice(2) : d;
  const pIdentity = p.host.startsWith('www.') ? p.host.slice(4) : p.host.startsWith('m.') ? p.host.slice(2) : p.host;
  if (!p.wildcard && dIdentity && pIdentity && dIdentity === pIdentity) return true;
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
    'defaultCompositeList',
    'defaultUserCompositeSites',
    'defaultUserCompositeList',
    'recommendedCompositeSites',
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
    'defaultRestrictedEntertainmentSites',
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
  const dIdentity = d.startsWith('www.') ? d.slice(4) : d.startsWith('m.') ? d.slice(2) : d;
  const pIdentity = p.startsWith('www.') ? p.slice(4) : p.startsWith('m.') ? p.slice(2) : p;
  if (dIdentity && pIdentity && dIdentity === pIdentity) return true;
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
