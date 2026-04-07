// popup/popup.js - 学习/休息状态管理

const DAY_NAMES = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

let currentSession = null;
let updateTimer = null;

document.addEventListener('DOMContentLoaded', async () => {
  await init();

  // 管理员链接
  document.getElementById('admin-link').addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });

  // 学习/休息按钮事件
  document.getElementById('btn-study').addEventListener('click', () => switchMode('study'));
  document.getElementById('btn-rest').addEventListener('click', () => switchMode('rest'));

  // 每 30 秒刷新统计数据（新模型）
  updateTimer = setInterval(async () => {
    const config = await sendMsg({ type: 'GET_CONFIG' });
    const stats = await sendMsg({ type: 'GET_STATS' });
    currentSession = await sendMsg({ type: 'GET_SESSION' });
    updateStatusDisplay();
    updateTodayStats(config, stats);
  }, 30 * 1000);
});

async function init() {
  const config = await sendMsg({ type: 'GET_CONFIG' });
  const stats = await sendMsg({ type: 'GET_STATS' });
  currentSession = await sendMsg({ type: 'GET_SESSION' });
  const sessions = await sendMsg({ type: 'GET_SESSIONS_RANGE', days: 1 });
  await sendMsg({ type: 'FLUSH_TIME' });

  // 状态徽章
  const pill = document.getElementById('status-pill');
  const statusText = document.getElementById('status-text');
  if (config.enabled) {
    pill.className = 'status-pill on';
    statusText.textContent = '已启用';
  } else {
    pill.className = 'status-pill off';
    statusText.textContent = '已关闭';
  }

  // 更新学习/休息按钮状态
  updateModeButtons();

  // 更新状态显示
  updateStatusDisplay();

  // 更新今日统计（同时也会更新计时器）
  updateTodayStats(config, stats);

  // 时间配额
  if (config.dailyQuota > 0) {
    const totalSeconds = Object.values(stats).reduce((a, b) => a + b, 0);
    const usedMin = Math.floor(totalSeconds / 60);
    const limitMin = config.dailyQuota;
    const remaining = Math.max(0, limitMin - usedMin);
    const pct = Math.min(100, Math.round((usedMin / limitMin) * 100));

    document.getElementById('quota-section').style.display = 'block';
    document.getElementById('remaining-time').textContent = formatMinutes(remaining);
    document.getElementById('used-time').textContent = formatMinutes(usedMin);
    document.getElementById('limit-time').textContent = formatMinutes(limitMin);
    document.getElementById('quota-bar').style.width = pct + '%';
    document.getElementById('quota-bar').style.background =
      pct >= 90 ? 'linear-gradient(90deg, #f87171, #ff4d6d)' :
      pct >= 70 ? 'linear-gradient(90deg, #fbbf24, #f59e0b)' :
      'linear-gradient(90deg, var(--accent), #9c6fff)';
  }

  // Top 5
  const entries = Object.entries(stats).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const top5 = document.getElementById('today-top5');
  if (entries.length === 0) {
    top5.innerHTML = '<div class="empty">暂无数据</div>';
  } else {
    const max = entries[0][1];
    top5.innerHTML = entries.map(([domain, seconds]) => {
      return `
        <div class="stat-row">
          <span class="stat-row-left">${domain}</span>
          <span class="stat-row-right">${formatSeconds(seconds)}</span>
        </div>
      `;
    }).join('');
  }
}

function updateModeButtons() {
  const btnStudy = document.getElementById('btn-study');
  const btnRest  = document.getElementById('btn-rest');

  btnStudy.classList.remove('active-study');
  btnRest.classList.remove('active-rest');

  if (currentSession.currentMode === 'study') {
    btnStudy.classList.add('active-study');
  } else if (currentSession.currentMode === 'rest') {
    btnRest.classList.add('active-rest');
  }
}

function updateStatusDisplay() {
  const statusValue = document.getElementById('status-value');

  statusValue.classList.remove('study', 'rest', 'free');

  if (currentSession.currentMode === 'study') {
    statusValue.textContent = '📚 学习中';
    statusValue.classList.add('study');
  } else {
    statusValue.textContent = '🎮 娱乐中';
    statusValue.classList.add('rest');
  }
}

function updateTimerDisplay() {
  const timerEl = document.getElementById('status-timer');
  
  if (!currentSession) {
    timerEl.textContent = '00:00:00';
    return;
  }

  // 新模型：计时器显示由 updateTodayStats 函数更新
  // 这里保留函数避免报错，实际更新在 updateTodayStats 中进行
  // 如果还没有数据，显示默认值
  if (timerEl.textContent === '00:00:00' || !timerEl.textContent) {
    // 等待 updateTodayStats 更新
  }
}

// 新模型：从域名统计数据实时计算学习/休息/其他时长
function updateTodayStats(config, stats) {
  const studyList = config.studyList || [];
  const allowList = config.allowList || [];
  
  let studySeconds = 0;
  let otherSeconds = 0;
  let onlineSeconds = 0;
  
  // 遍历所有域名统计
  for (const [domain, seconds] of Object.entries(stats)) {
    onlineSeconds += seconds;
    
    // 检查域名是否在学习清单
    const inStudyList = studyList.some(pattern => matchDomain(domain, pattern));
    if (inStudyList) {
      studySeconds += seconds;
      continue;
    }
    
    // 检查域名是否在允许清单
    const inAllowList = allowList.some(pattern => matchDomain(domain, pattern));
    if (inAllowList) {
      otherSeconds += seconds;
    }
    // 其他域名（既不在 studyList 也不在 allowList）只计在线时长，不计入学习/其他
  }
  
  // 休息时长 = 在线 - 学习 - 其他
  const restSeconds = Math.max(0, onlineSeconds - studySeconds - otherSeconds);
  
  // 更新显示
  document.getElementById('study-time-stat').textContent  = formatSeconds(studySeconds);
  document.getElementById('rest-time-stat').textContent   = formatSeconds(restSeconds);
  document.getElementById('online-time-stat').textContent = formatSeconds(onlineSeconds);
  
  // 更新状态计时器（根据当前模式显示对应时长）
  const timerEl = document.getElementById('status-timer');
  if (currentSession?.currentMode === 'study') {
    timerEl.textContent = formatTime(studySeconds);
  } else {
    timerEl.textContent = formatTime(restSeconds);
  }
}

// 域名匹配函数（与 background.js 一致）
function matchDomain(domain, pattern) {
  const d = domain.replace(/^www\./, '');
  const p = pattern.replace(/^www\./, '');
  return d === p || d.endsWith('.' + p);
}

async function switchMode(mode) {
  try {
    // 发送切换消息
    if (mode === 'study') {
      await sendMsg({ type: 'SWITCH_TO_STUDY' });
    } else if (mode === 'rest') {
      await sendMsg({ type: 'SWITCH_TO_REST' });
    }
    
    // 主动重新获取 session 确保与后台同步（SW 可能已休眠后唤醒）
    currentSession = await sendMsg({ type: 'GET_SESSION' });
    
    updateModeButtons();
    updateStatusDisplay();
    
    // 更新今日统计（新模型：从 config 和 stats 实时计算）
    const config = await sendMsg({ type: 'GET_CONFIG' });
    const stats = await sendMsg({ type: 'GET_STATS' });
    updateTodayStats(config, stats);
  } catch (err) {
    console.error('切换模式失败:', err);
  }
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

function formatMinutes(min) {
  if (min < 60) return `${min}分钟`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m > 0 ? `${h}小时${m}分` : `${h}小时`;
}

function formatTime(seconds) {
  if (!seconds || seconds < 0) seconds = 0;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}
