// popup/popup.js - 孩子视角：只读时间用量展示

const CLOUD_KEYS = {
  PROFILE_NAME: 'cloud_profile_name'
};

document.addEventListener('DOMContentLoaded', async () => {
  const cloudStatus = await sendMsg({ type: 'GET_CLOUD_STATUS' });
  if (cloudStatus && !cloudStatus.isBound) {
    document.getElementById('unbound-banner').style.display = 'block';
    document.querySelector('.body').style.display = 'none';
    document.getElementById('goto-admin-btn').addEventListener('click', () => {
      chrome.runtime.openOptionsPage();
    });
    return;
  }

  await init();

  await renderModeButtons();
  document.getElementById('btn-study').addEventListener('click', () => setMode('study'));
  document.getElementById('btn-rest').addEventListener('click',  () => setMode('rest'));

  document.getElementById('settings-btn').addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === 'DEVICE_UNBOUND') {
      document.getElementById('unbound-banner').style.display = 'block';
      document.querySelector('.body').style.display = 'none';
      document.getElementById('goto-admin-btn').addEventListener('click', () => {
        chrome.runtime.openOptionsPage();
      });
    }
  });
});

async function renderModeButtons() {
  const session = await sendMsg({ type: 'GET_SESSION' });
  const mode = session?.currentMode || 'study';
  const studyBtn = document.getElementById('btn-study');
  const restBtn  = document.getElementById('btn-rest');
  studyBtn.className = 'mode-btn' + (mode === 'study' ? ' active-study' : '');
  restBtn.className  = 'mode-btn' + (mode === 'rest'  ? ' active-rest'  : '');
}

async function setMode(mode) {
  const type = mode === 'study' ? 'SWITCH_TO_STUDY' : 'SWITCH_TO_REST';
  await sendMsg({ type });
  await renderModeButtons();
}

async function init() {
  const [config, stats] = await Promise.all([
    sendMsg({ type: 'GET_CONFIG' }),
    sendMsg({ type: 'GET_STATS' }),
  ]);

  try { await sendMsg({ type: 'FLUSH_TIME' }); } catch (_) {}

  const nameStorage = await new Promise(resolve =>
    chrome.storage.local.get([CLOUD_KEYS.PROFILE_NAME], resolve)
  );
  const childName = nameStorage[CLOUD_KEYS.PROFILE_NAME];
  const nameEl = document.getElementById('child-name-header');
  if (nameEl && childName) nameEl.textContent = childName + ' 的时间';

  const studyList     = config.studyList     || [];
  const compositeList = config.compositeList || [];
  let studySeconds = 0, undeterminedSeconds = 0, restSeconds = 0, onlineSeconds = 0;

  for (const [domain, seconds] of Object.entries(stats)) {
    if (domain === 'audioSeconds' || domain === 'backgroundMediaByDomain' || domain === 'pipSeconds' || domain === 'pipByDomain') continue;
    onlineSeconds += seconds;
    const isStudy     = studyList.some(p => matchDomain(domain, p));
    const isComposite = compositeList.some(p => matchDomain(domain, p));
    if (isStudy) {
      studySeconds += seconds;
    } else if (isComposite) {
      undeterminedSeconds += seconds;
    } else {
      restSeconds += seconds;
    }
  }

  const backendMediaSeconds = (stats.audioSeconds || 0) + (stats.pipSeconds || 0);

  // Mode Buttons with quota display
  const studyBtn = document.getElementById('btn-study');
  const restBtn  = document.getElementById('btn-rest');

  const studyLimit = (config.dailyStudyQuota ?? 0) * 60;
  const effectiveRestLimit = getEffectiveDailyRestLimit(config) * 60;
  studyBtn.textContent = studyLimit > 0
    ? `📚 学习模式 ${formatSeconds(studySeconds)} / ${formatSeconds(studyLimit)}`
    : `📚 学习模式 ${formatSeconds(studySeconds)}`;
  restBtn.textContent = effectiveRestLimit > 0
    ? `☕ 休息模式 ${formatSeconds(restSeconds)} / ${formatSeconds(effectiveRestLimit)}`
    : `☕ 休息模式 ${formatSeconds(restSeconds)}`;

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

  // Progress Bars (Online + Undetermined)
  const onlineLimit        = (config.dailyOnlineQuota       ?? 0) * 60;
  const undeterminedLimit  = (config.dailyUndeterminedQuota ?? 60)  * 60;
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
      bar('🌐', '在线时长', onlineSeconds, onlineLimit, 'var(--accent)', qs.onlineLocked) +
      bar('⏳', '待归类时长', undeterminedSeconds, undeterminedLimit, '#6c5ce7', qs.undeterminedLocked);
  }

  // Top 10
  const entries = Object.entries(stats)
    .filter(([domain]) => domain !== 'audioSeconds' && domain !== 'backgroundMediaByDomain' && domain !== 'pipSeconds' && domain !== 'pipByDomain')
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
