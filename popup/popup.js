// popup/popup.js - 孩子视角：只读时间用量展示

const CLOUD_KEYS = {
  PROFILE_NAME: 'cloud_profile_name'
};

document.addEventListener('DOMContentLoaded', async () => {
  // 检查绑定状态
  const cloudStatus = await sendMsg({ type: 'GET_CLOUD_STATUS' });
  if (cloudStatus && !cloudStatus.isBound) {
    // 设备未绑定：显示提示横幅，隐藏正文
    document.getElementById('unbound-banner').style.display = 'block';
    document.getElementById('summary-card').style.display = 'none';
    document.querySelector('.body').style.display = 'none';
    document.getElementById('goto-admin-btn').addEventListener('click', () => {
      chrome.runtime.openOptionsPage();
    });
    return;
  }

  await init();
  initWeeklySessions();

  // 初始化模式按钮状态并绑定点击事件
  await renderModeButtons();
  document.getElementById('btn-study').addEventListener('click', () => setMode('study'));
  document.getElementById('btn-rest').addEventListener('click',  () => setMode('rest'));

  // 详情链接 → 打开 admin 面板
  document.getElementById('detail-link').addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });

  // 监听后台广播：设备被远程解绑时立即更新 popup UI
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === 'DEVICE_UNBOUND') {
      document.getElementById('unbound-banner').style.display = 'block';
      document.getElementById('summary-card').style.display = 'none';
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
  // 并行获取所需数据
  const [config, stats, rangeData] = await Promise.all([
    sendMsg({ type: 'GET_CONFIG' }),
    sendMsg({ type: 'GET_STATS' }),
    sendMsg({ type: 'GET_STATS_RANGE', days: 1 })
  ]);

  // 刷新今日计时
  try { await sendMsg({ type: 'FLUSH_TIME' }); } catch (_) {}

  // 孩子名字
  const nameStorage = await new Promise(resolve =>
    chrome.storage.local.get([CLOUD_KEYS.PROFILE_NAME], resolve)
  );
  const childName = nameStorage[CLOUD_KEYS.PROFILE_NAME];
  const nameEl = document.getElementById('child-name-header');
  if (nameEl && childName) nameEl.textContent = childName + ' 的时间';

  // 日期
  const now = new Date();
  const weekNames = ['周日','周一','周二','周三','周四','周五','周六'];
  const dateEl = document.getElementById('footer-date');
  if (dateEl) dateEl.textContent = `${now.getMonth()+1}/${now.getDate()} ${weekNames[now.getDay()]}`;

  // 计算今日学习/待定/休息/在线时长（三时段模型）
  const studyList     = config.studyList     || [];
  const compositeList = config.compositeList || [];
  let studySeconds = 0, undeterminedSeconds = 0, restSeconds = 0, onlineSeconds = 0;

  for (const [domain, seconds] of Object.entries(stats)) {
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

  // 配额上限（分钟→秒）
  const onlineLimit       = (config.dailyOnlineQuota       ?? 1200) * 60;
  const studyLimit        = (config.dailyStudyQuota        ?? 480)  * 60;
  const restLimit         = (config.dailyRestQuota         ?? 120)  * 60;
  const undeterminedLimit = (config.dailyUndeterminedQuota ?? 120)  * 60;
  const qs = config.quotaState || {};

  // 激励摘要
  const summaryEl = document.getElementById('summary-card');
  if (summaryEl) {
    const pct = onlineSeconds > 0 ? Math.round(studySeconds / onlineSeconds * 100) : 0;
    const remaining = Math.max(0, studyLimit - studySeconds);
    let msg;
    if (onlineSeconds === 0) {
      msg = '今天还没有开始使用，准备好了就出发吧！📚';
    } else if (studySeconds === 0) {
      msg = `在线 <b>${formatSeconds(onlineSeconds)}</b>，今天还没有学习时间，加油！💪`;
    } else if (pct >= 70) {
      msg = `已学习 <b>${formatSeconds(studySeconds)}</b>，专注度 <b>${pct}%</b>，表现优秀！🎉`;
    } else {
      msg = `已学习 <b>${formatSeconds(studySeconds)}</b>，还可学习 <b>${formatSeconds(remaining)}</b>，继续加油！💪`;
    }
    summaryEl.innerHTML = msg;
  }

  // 进度条
  const quotaBarsEl = document.getElementById('quota-bars');
  if (quotaBarsEl) {
    const bar = (icon, label, used, limit, color, locked) => {
      const pct = limit > 0 ? Math.min(100, Math.round(used / limit * 100)) : 0;
      const barColor = locked ? 'var(--danger)' : pct >= 90 ? 'var(--warn)' : color;
      return `
        <div class="quota-bar-item">
          <div class="quota-bar-header">
            <span class="quota-bar-label">${icon} ${label}${locked ? ' <span style="font-size:10px;color:var(--danger);">已达上限</span>' : ''}</span>
            <span class="quota-bar-value">${formatSeconds(used)} / ${formatSeconds(limit)}</span>
          </div>
          <div class="progress-track">
            <div class="progress-fill" style="width:${pct}%;background:${barColor};"></div>
          </div>
        </div>`;
    };

    quotaBarsEl.innerHTML =
      bar('🌐', '在线时长', onlineSeconds, onlineLimit, 'var(--accent)', qs.onlineLocked) +
      bar('📚', '学习时长', studySeconds, studyLimit, 'var(--green)', qs.studyLocked) +
      bar('⏳', '待定时长', undeterminedSeconds, undeterminedLimit, '#6c5ce7', qs.undeterminedLocked) +
      bar('🎵', '休息时长', restSeconds, restLimit, 'var(--warn)', qs.restLocked);
  }

  // Top 5
  const entries = Object.entries(stats).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const top5El = document.getElementById('today-top5');
  if (entries.length === 0) {
    top5El.innerHTML = '<div class="empty">暂无数据</div>';
  } else {
    top5El.innerHTML = entries.map(([domain, seconds]) => `
      <div class="stat-row">
        <span class="stat-row-left">${domain}</span>
        <span class="stat-row-right">${formatSeconds(seconds)}</span>
      </div>
    `).join('');
  }
}

// ── 本周待定时段 ──────────────────────────────────────────────────────────────

async function initWeeklySessions() {
  const toggle = document.getElementById('week-sessions-toggle');
  const list   = document.getElementById('week-sessions-list');
  if (!toggle || !list) return;

  toggle.addEventListener('click', async () => {
    if (list.style.display === 'none') {
      list.style.display = '';
      toggle.textContent = '收起';
      await loadWeeklySessions();
    } else {
      list.style.display = 'none';
      toggle.textContent = '展开';
    }
  });
}

async function loadWeeklySessions() {
  const list = document.getElementById('week-sessions-list');
  if (!list) return;
  list.innerHTML = '<div class="empty">加载中...</div>';

  const res = await sendMsg({ type: 'GET_WEEKLY_SESSIONS' });
  const sessions = res?.sessions || [];

  if (sessions.length === 0) {
    list.innerHTML = '<div class="empty">本周暂无待定会话</div>';
    return;
  }

  // 仅显示本周，最新在前，最多 20 条
  const items = sessions.slice(0, 20);
  list.innerHTML = items.map(s => renderWeekSessionRow(s)).join('');

  // 绑定申诉按钮
  list.querySelectorAll('.appeal-btn[data-session-id]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const sid = btn.dataset.sessionId;
      btn.disabled = true;
      btn.textContent = '提交中...';
      const r = await sendMsg({ type: 'SUBMIT_APPEAL', sessionId: sid, reason: '' });
      if (r?.ok) {
        btn.textContent = '已提交';
        btn.style.color = 'var(--accent)';
      } else {
        btn.disabled = false;
        btn.textContent = '申诉';
        alert('申诉失败：' + (r?.error || '未知错误'));
      }
    });
  });
}

function renderWeekSessionRow(s) {
  const statusMap = {
    study: '<span class="badge-study">✅ 学习</span>',
    rest:  '<span class="badge-rest">⚠️ 休息</span>',
    null:  '<span class="badge-pending">⏳ 待审核</span>',
  };
  const statusHtml = statusMap[s.classification] ?? statusMap[null];

  // appeal_status: 'pending'=已申诉, 'upheld'=维持, 'overturned'=已改判
  let appealHtml = '';
  if (s.classification === 'rest' && !s.appeal_status) {
    appealHtml = `<button class="appeal-btn" data-session-id="${escSid(s.id)}">申诉</button>`;
  } else if (s.appeal_status === 'pending') {
    appealHtml = '<span style="font-size:10px;color:var(--warn);">申诉中</span>';
  } else if (s.appeal_status === 'overturned') {
    appealHtml = '<span style="font-size:10px;color:var(--accent);">已改判</span>';
  }

  const title = (s.title || s.domain).slice(0, 40);
  const dur = formatSeconds(s.duration || 0);
  const date = (s.date || '').slice(5); // MM-DD

  return `
    <div class="week-session-row">
      <div class="week-session-top">
        <span class="week-session-title" title="${escAttr(s.title || '')}">${escHtml(title)}</span>
        <span class="week-session-meta">${dur}</span>
      </div>
      <div class="week-session-status">
        <span>${date} · ${escHtml(s.domain)}</span>
        <span style="display:flex;align-items:center;gap:5px;">${statusHtml} ${appealHtml}</span>
      </div>
    </div>`;
}

function escHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
function escAttr(s) {
  return String(s).replace(/"/g,'&quot;');
}
function escSid(s) {
  return String(s).replace(/[^a-zA-Z0-9_-]/g,'');
}

// 域名匹配（与 background.js 一致）
function matchDomain(domain, pattern) {
  const d = domain.replace(/^www\./, '');
  const p = pattern.replace(/^www\./, '');
  return d === p || d.endsWith('.' + p);
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
