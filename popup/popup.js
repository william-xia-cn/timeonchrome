// popup/popup.js - 孩子视角：只读时间用量展示

const CLOUD_KEYS = {
  PROFILE_NAME: 'cloud_profile_name'
};
let popupStatsContext = { config: {}, stats: {} };

document.addEventListener('DOMContentLoaded', async () => {
  const cloudStatus = await sendMsg({ type: 'GET_CLOUD_STATUS' });
  renderCloudBindingNotice(cloudStatus);

  const [, runtimeStatus] = await Promise.all([
    init(),
    getRuntimeModeStatusSafe(),
  ]);

  renderModeButtons(runtimeStatus);
  renderRuntimeStatus(runtimeStatus);
  document.getElementById('btn-study').addEventListener('click', () => setMode('study'));
  document.getElementById('btn-rest').addEventListener('click',  () => setMode('rest'));
  document.getElementById('btn-composite').addEventListener('click',  () => setMode('composite'));

  document.getElementById('settings-btn').addEventListener('click', () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('admin/admin.html?view=stats') });
  });

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === 'DEVICE_UNBOUND') {
      renderCloudBindingNotice({ isBound: false, localMode: true, syncEnabled: false });
    }
  });
});

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
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const activeTab = tabs && tabs[0] ? tabs[0] : null;
  const noticeTabId = Number.isInteger(activeTab?.id) ? activeTab.id : null;
  await sendMsg({ type, noticeTabId });
  const runtimeStatus = await getRuntimeModeStatusSafe();
  renderModeButtons(runtimeStatus);
  renderRuntimeStatus(runtimeStatus);
}

async function init() {
  const [config, stats] = await Promise.all([
    sendMsg({ type: 'GET_CONFIG' }),
    sendMsg({ type: 'GET_STATS', source: 'popup' }),
  ]);
  popupStatsContext = { config: config || {}, stats: stats || {} };
  renderSuspectSegmentStatus(await getSuspectSegmentSummarySafe());

  const nameStorage = await new Promise(resolve =>
    chrome.storage.local.get([CLOUD_KEYS.PROFILE_NAME], resolve)
  );
  const childName = nameStorage[CLOUD_KEYS.PROFILE_NAME];
  const nameEl = document.getElementById('child-name-header');
  if (nameEl && childName) nameEl.textContent = childName + ' 的时间';

  const studyList     = config.studyList     || [];
  let studySeconds = 0, restSeconds = 0, onlineSeconds = 0;
  const compositeSeconds = readCompositeSeconds(stats, config);

  for (const [domain, seconds] of Object.entries(stats)) {
    if (isStatsMetaKey(domain)) continue;
    onlineSeconds += seconds;
    const isStudy     = studyList.some(p => matchDomain(domain, p));
    if (isStudy) {
      studySeconds += seconds;
    } else {
      restSeconds += seconds;
    }
  }
  restSeconds = Math.max(0, restSeconds - compositeSeconds);

  const backendMediaSeconds = stats.audioSeconds || 0;
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

  // Backend Media (plain text, no card, no quota)
  const backendMediaRow = document.getElementById('backend-media-row');
  const backendMediaValue = document.getElementById('backend-media-value');
  if (backendMediaRow && backendMediaValue) {
    if (backendMediaSeconds > 0) {
      backendMediaRow.style.display = 'block';
      backendMediaValue.textContent = formatSeconds(backendMediaSeconds);
    } else {
      backendMediaRow.style.display = 'none';
    }
  }
  const pipMediaRow = document.getElementById('pip-media-row');
  const pipMediaValue = document.getElementById('pip-media-value');
  if (pipMediaRow && pipMediaValue) {
    if (pipMediaSeconds > 0) {
      pipMediaRow.style.display = 'block';
      pipMediaValue.textContent = formatSeconds(pipMediaSeconds);
    } else {
      pipMediaRow.style.display = 'none';
    }
  }

  // Progress Bars (Online + Composite)
  const onlineLimit        = (config.dailyOnlineQuota       ?? 0) * 60;
  const qs = config.quotaState || {};

  const quotaBarsEl = document.getElementById('quota-bars');
  if (quotaBarsEl) {
    const bar = (icon, label, used, limit, color, locked) => {
      const pct = limit > 0 ? Math.min(100, Math.round(used / limit * 100)) : 0;
      const barColor = locked ? 'var(--danger)' : pct >= 90 ? 'var(--warn)' : color;
      const valueText = limit > 0 ? `${formatSeconds(used)} / ${formatSeconds(limit)}` : formatSeconds(used);
      return `
        <div class="quota-bar-item">
          <div class="quota-bar-header">
            <span class="quota-bar-label">${icon} ${label}${locked ? ' <span style="font-size:10px;color:var(--danger);">已用完</span>' : ''}</span>
            <span class="quota-bar-value">${valueText}</span>
          </div>
          <div class="progress-track">
            <div class="progress-fill" style="width:${pct}%;background:${barColor};"></div>
          </div>
        </div>`;
    };

    quotaBarsEl.innerHTML =
      bar('🌐', '在线时长', onlineSeconds, onlineLimit, 'var(--accent)', qs.onlineLocked);
  }

  // Top 10
  const entries = Object.entries(stats)
    .filter(([domain]) => !isStatsMetaKey(domain))
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);
  const top10El = document.getElementById('today-top10');
  if (entries.length === 0) {
    top10El.innerHTML = '<div class="empty">暂无数据</div>';
  } else {
    top10El.innerHTML = entries.map(([domain, seconds]) => `
      <div class="stat-row">
        <span class="stat-row-left">${domain}</span>
        <span class="stat-row-right">${formatSeconds(seconds)}</span>
      </div>
    `).join('');
  }
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

function readCompositeSeconds(statsLike, configLike) {
  const explicitComposite = Number(statsLike?.compositeSeconds);
  if (Number.isFinite(explicitComposite)) return Math.max(0, explicitComposite);

  const legacyUndetermined = Number(statsLike?.undeterminedSeconds);
  if (Number.isFinite(legacyUndetermined)) return Math.max(0, legacyUndetermined);

  const compositeList = configLike?.compositeList || [];
  let total = 0;
  for (const [domain, seconds] of Object.entries(statsLike || {})) {
    if (isStatsMetaKey(domain)) continue;
    const value = Number(seconds);
    if (!Number.isFinite(value) || value <= 0) continue;
    if (compositeList.some(p => matchDomain(domain, p))) total += value;
  }
  return total;
}

function renderRuntimeStatus(status = {}) {
  const runtimeCompact = document.getElementById('runtime-compact');
  if (!runtimeCompact) return;
  const domain = normalizeHostname(status?.currentDomain || status?.domain || extractDomain(status?.url));
  const tag = resolveDomainTag(domain, popupStatsContext.config);
  const durableTodaySeconds = resolveTodayDomainSeconds(domain, popupStatsContext.stats);
  const liveSessionSeconds = resolveLiveSessionSeconds(domain, status);
  const todaySeconds = durableTodaySeconds + liveSessionSeconds;
  const todayText = formatRuntimeTodayDuration(todaySeconds);
  const domainText = domain || '不计时页面';
  runtimeCompact.innerHTML = `
    <div class="runtime-compact-main">
      <div class="runtime-compact-title">当前访问</div>
      <div class="runtime-duration">${todayText}</div>
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

function formatRuntimeTodayDuration(seconds) {
  const safe = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
  if (safe === 0) return '今日 0分';
  return `今日 ${formatRuntimeDuration(safe)}`;
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

function sendMsg(msg) {
  return new Promise(resolve => chrome.runtime.sendMessage(msg, resolve));
}

function formatSeconds(secs) {
  if (!secs || secs < 0) secs = 0;
  if (secs < 60) return `${secs}秒`;
  if (secs < 3600) return `${Math.floor(secs / 60)}分`;
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  return m > 0 ? `${h}小时${m}分` : `${h}小时`;
}
