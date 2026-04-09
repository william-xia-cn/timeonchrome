// admin/admin.js

const DAY_NAMES = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

let config = null;
let isAuthenticated = false;
let currentPwHash = '';

// ── 初始化 ─────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', async () => {
  // 加载配置，判断是否首次使用
  config = await sendMsg({ type: 'GET_CONFIG' });

  if (!config.isInitialized || !config.adminPasswordHash) {
    showSetupMode();
  }

  setupLoginForm();
  setupNavigation();
  setupRulesPage();
  setupQuotaPage();
  setupSchedulePage();
  setupSecurityPage();
  document.getElementById('logout-btn').addEventListener('click', logout);
});

// ── 密码 & 登录 ────────────────────────────────────────────────────────────

function showSetupMode() {
  document.getElementById('setup-notice').style.display = 'block';
  document.getElementById('pw-label').textContent = '设置管理员密码';
  document.getElementById('pw-confirm-group').style.display = 'block';
  document.getElementById('login-btn').textContent = '完成设置并进入';
}

function setupLoginForm() {
  document.getElementById('login-btn').addEventListener('click', async () => {
    const pw = document.getElementById('pw-input').value.trim();
    if (!pw) return;

    const pwHash = await hashPassword(pw);

    if (!config.isInitialized || !config.adminPasswordHash) {
      // 首次设置密码
      const confirm = document.getElementById('pw-confirm-input').value.trim();
      if (pw !== confirm) {
        showError('两次输入的密码不一致');
        return;
      }
      if (pw.length < 6) {
        showError('密码至少6位');
        return;
      }
      config.adminPasswordHash = pwHash;
      config.isInitialized = true;
      await sendMsg({ type: 'UPDATE_CONFIG', config });
    } else {
      // 验证密码
      if (pwHash !== config.adminPasswordHash) {
        showError('密码错误，请重试');
        return;
      }
    }

    currentPwHash = pwHash;
    login();
  });

  // 回车键登录
  document.getElementById('pw-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') document.getElementById('login-btn').click();
  });
}

async function login() {
  isAuthenticated = true;
  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('main-screen').style.display = 'block';

  // 刷新配置
  config = await sendMsg({ type: 'GET_CONFIG' });
  renderOverview();
}

function logout() {
  isAuthenticated = false;
  currentPwHash = '';
  document.getElementById('main-screen').style.display = 'none';
  document.getElementById('login-screen').style.display = 'flex';
  document.getElementById('pw-input').value = '';
  document.getElementById('error-msg').style.display = 'none';
}

function showError(msg) {
  const el = document.getElementById('error-msg');
  el.textContent = msg;
  el.style.display = 'block';
  setTimeout(() => el.style.display = 'none', 3000);
}

// ── 导航 ──────────────────────────────────────────────────────────────────

function setupNavigation() {
  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', () => {
      const page = item.dataset.page;
      document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
      document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
      item.classList.add('active');
      document.getElementById('page-' + page).classList.add('active');

      if (page === 'stats') renderStats();
      if (page === 'overview') renderOverview();
      if (page === 'sessions') renderSessions();
    });
  });
}

// ── 总览 ──────────────────────────────────────────────────────────────────

async function renderOverview() {
  // 总开关
  const toggle = document.getElementById('toggle-enabled');
  toggle.checked = config.enabled;
  updateGlobalBadge();

  toggle.addEventListener('change', async () => {
    config.enabled = toggle.checked;
    await sendMsg({ type: 'UPDATE_CONFIG', config });
    updateGlobalBadge();
  });

  // 今日统计
  const stats = await sendMsg({ type: 'GET_STATS' });
  renderStatsList('today-stats-list', stats, 10);
}

function updateGlobalBadge() {
  const badge = document.getElementById('global-status-badge');
  badge.innerHTML = config.enabled
    ? '<span class="badge on"><span class="badge-dot"></span>管控已启用</span>'
    : '<span class="badge off"><span class="badge-dot"></span>管控已关闭</span>';
}

function renderStatsList(containerId, stats, limit = 999) {
  const container = document.getElementById(containerId);
  const entries = Object.entries(stats).sort((a, b) => b[1] - a[1]).slice(0, limit);

  if (entries.length === 0) {
    container.innerHTML = '<div style="color:var(--muted);font-size:13px;padding:12px 0">今日暂无数据</div>';
    return;
  }

  const maxSeconds = entries[0][1];
  container.innerHTML = entries.map(([domain, seconds]) => {
    const pct = Math.round((seconds / maxSeconds) * 100);
    return `
      <div class="stat-bar">
        <div class="stat-name">${domain}</div>
        <div class="stat-bar-track">
          <div class="stat-bar-fill" style="width:${pct}%"></div>
        </div>
        <div class="stat-time">${formatSeconds(seconds)}</div>
      </div>
    `;
  }).join('');
}

// ── 白/黑名单 ─────────────────────────────────────────────────────────────

function setupRulesPage() {
  // 模式切换 tab
  document.querySelectorAll('.tab-btn[data-mode]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn[data-mode]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      config.mode = btn.dataset.mode;
      document.getElementById('blacklist-card').style.display  = config.mode === 'blacklist' ? 'block' : 'none';
      document.getElementById('studylist-card').style.display  = config.mode === 'whitelist' ? 'block' : 'none';
      document.getElementById('allowlist-card').style.display  = config.mode === 'whitelist' ? 'block' : 'none';
    });
  });

  // 初始状态
  document.querySelectorAll('.tab-btn[data-mode]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.mode === config.mode);
  });
  document.getElementById('blacklist-card').style.display  = config.mode === 'blacklist' ? 'block' : 'none';
  document.getElementById('studylist-card').style.display  = config.mode === 'whitelist' ? 'block' : 'none';
  document.getElementById('allowlist-card').style.display  = config.mode === 'whitelist' ? 'block' : 'none';

  setupDomainList('studyList', 'studylist-input', 'studylist-add-btn', 'studylist-tags');
  setupDomainList('allowList', 'allowlist-input', 'allowlist-add-btn', 'allowlist-tags');
  setupDomainList('blacklist', 'blacklist-input', 'blacklist-add-btn', 'blacklist-tags');

  document.getElementById('save-rules-btn').addEventListener('click', async () => {
    await sendMsg({ type: 'UPDATE_CONFIG', config });
    showSuccess();
  });
}

function setupDomainList(key, inputId, addBtnId, tagsId) {
  function refresh() {
    const container = document.getElementById(tagsId);
    container.innerHTML = (config[key] || []).map((d, i) => `
      <span class="domain-tag">
        ${d}
        <span class="domain-tag-remove" data-key="${key}" data-index="${i}">×</span>
      </span>
    `).join('');

    container.querySelectorAll('.domain-tag-remove').forEach(btn => {
      btn.addEventListener('click', () => {
        config[btn.dataset.key].splice(parseInt(btn.dataset.index), 1);
        refresh();
      });
    });
  }

  document.getElementById(addBtnId).addEventListener('click', () => {
    const input = document.getElementById(inputId);
    const val = input.value.trim().replace(/^https?:\/\//, '').replace(/\/$/, '');
    if (!val) return;
    if (!config[key]) config[key] = [];
    if (!config[key].includes(val)) {
      config[key].push(val);
      refresh();
    }
    input.value = '';
  });

  document.getElementById(inputId).addEventListener('keydown', e => {
    if (e.key === 'Enter') document.getElementById(addBtnId).click();
  });

  refresh();
}

// ── 时间配额 ──────────────────────────────────────────────────────────────

function setupQuotaPage() {
  document.getElementById('daily-quota').value = config.dailyQuota || 0;

  renderDomainQuotas();

  document.getElementById('quota-add-btn').addEventListener('click', () => {
    const domain = document.getElementById('quota-domain-input').value.trim();
    const minutes = parseInt(document.getElementById('quota-minutes-input').value);
    if (!domain || isNaN(minutes) || minutes <= 0) return;
    config.domainQuotas[domain] = minutes;
    renderDomainQuotas();
    document.getElementById('quota-domain-input').value = '';
    document.getElementById('quota-minutes-input').value = '';
  });

  document.getElementById('save-quota-btn').addEventListener('click', async () => {
    config.dailyQuota = parseInt(document.getElementById('daily-quota').value) || 0;
    await sendMsg({ type: 'UPDATE_CONFIG', config });
    showSuccess();
  });
}

function renderDomainQuotas() {
  const container = document.getElementById('domain-quotas-list');
  const entries = Object.entries(config.domainQuotas || {});
  if (entries.length === 0) {
    container.innerHTML = '<div style="color:var(--muted);font-size:13px;padding:8px 0">暂无单站点配额设置</div>';
    return;
  }
  container.innerHTML = entries.map(([domain, minutes]) => `
    <div class="quota-row">
      <div class="quota-label">${domain}</div>
      <span style="color:var(--accent);font-size:14px">${minutes} 分钟/天</span>
      <button onclick="deleteDomainQuota('${domain}')" style="background:none;border:none;color:var(--danger);cursor:pointer;font-size:16px">×</button>
    </div>
  `).join('');
}

window.deleteDomainQuota = function(domain) {
  delete config.domainQuotas[domain];
  renderDomainQuotas();
};

// ── 时间段控制 ────────────────────────────────────────────────────────────

function setupSchedulePage() {
  document.getElementById('schedule-enabled').checked = config.schedule?.enabled || false;

  const container = document.getElementById('schedule-rows');
  container.innerHTML = DAY_NAMES.map((name, i) => {
    const day = config.schedule?.days?.[i] || { enabled: true, start: '08:00', end: '21:00' };
    return `
      <div class="schedule-row">
        <span class="schedule-day">${name}</span>
        <label class="toggle" style="margin-right:4px">
          <input type="checkbox" class="sched-day-toggle" data-day="${i}" ${day.enabled ? 'checked' : ''}>
          <div class="toggle-track"></div>
          <div class="toggle-thumb"></div>
        </label>
        <div class="schedule-time">
          <input type="time" class="time-input" id="start-${i}" value="${day.start}">
          <span style="color:var(--muted);font-size:13px">至</span>
          <input type="time" class="time-input" id="end-${i}" value="${day.end}">
        </div>
      </div>
    `;
  }).join('');

  document.getElementById('save-schedule-btn').addEventListener('click', async () => {
    config.schedule.enabled = document.getElementById('schedule-enabled').checked;
    for (let i = 0; i < 7; i++) {
      config.schedule.days[i] = {
        enabled: document.querySelector(`.sched-day-toggle[data-day="${i}"]`).checked,
        start: document.getElementById(`start-${i}`).value,
        end: document.getElementById(`end-${i}`).value
      };
    }
    await sendMsg({ type: 'UPDATE_CONFIG', config });
    showSuccess();
  });
}

// ── 统计 ──────────────────────────────────────────────────────────────────

async function renderStats() {
  const config = await sendMsg({ type: 'GET_CONFIG' });
  const stats = await sendMsg({ type: 'GET_STATS' });
  const visitSessions = await sendMsg({ type: 'GET_VISIT_SESSIONS', days: 1 });
  const changelog = await sendMsg({ type: 'GET_CHANGELOG', limit: 20 });
  const sessionsRange = await sendMsg({ type: 'GET_SESSIONS_RANGE', days: 2 });
  
  // 计算今日统计数据
  const todayStats = calculateTodayStats(config, stats, visitSessions);
  
  // 计算昨日数据用于对比
  const yesterdayStats = calculateYesterdayStats(config, sessionsRange);
  
  // 渲染概览卡片
  renderOverviewCards(todayStats, yesterdayStats);
  
  // 渲染时段分布热力图
  renderTimeHeatmap(visitSessions);
  
  // 渲染网站类型分布饼图
  renderDomainTypeChart(todayStats);
  
  // 渲染TOP网站列表
  renderTopDomains(todayStats, config);
  
  // 渲染专注模式分析
  renderPatternAnalysis(visitSessions);
  
  // 渲染变更日志
  renderChangelog(changelog);
  
  // 绑定时间范围选择器
  setupTimeRangeSelector();
}

// 计算今日统计数据
function calculateTodayStats(config, stats, visitSessions) {
  const studyList = config.studyList || [];
  const allowList = config.allowList || [];
  
  let studySeconds = 0;
  let otherSeconds = 0;
  let onlineSeconds = 0;
  
  // 遍历域名统计
  for (const [domain, seconds] of Object.entries(stats)) {
    onlineSeconds += seconds;
    
    const inStudyList = studyList.some(pattern => matchDomain(domain, pattern));
    if (inStudyList) {
      studySeconds += seconds;
      continue;
    }
    
    const inAllowList = allowList.some(pattern => matchDomain(domain, pattern));
    if (inAllowList) {
      otherSeconds += seconds;
    }
  }
  
  const restSeconds = Math.max(0, onlineSeconds - studySeconds - otherSeconds);
  
  // 从访问会话获取更详细的信息
  let totalSessions = visitSessions.length;
  let avgSessionDuration = totalSessions > 0 
    ? visitSessions.reduce((sum, s) => sum + s.duration, 0) / totalSessions 
    : 0;
  
  // 按类型分类会话
  let activeSessions = visitSessions.filter(s => s.activeTime > s.passiveTime);
  let passiveSessions = visitSessions.filter(s => s.passiveTime >= s.activeTime);
  
  return {
    onlineSeconds,
    studySeconds,
    restSeconds,
    otherSeconds,
    sessionCount: totalSessions,
    avgSessionDuration,
    activeSessions: activeSessions.length,
    passiveSessions: passiveSessions.length,
    topDomains: Object.entries(stats)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([domain, seconds]) => ({
        domain,
        seconds,
        type: studyList.some(p => matchDomain(domain, p)) ? 'study' : 
              allowList.some(p => matchDomain(domain, p)) ? 'other' : 'rest'
      }))
  };
}

// 计算昨日统计数据
function calculateYesterdayStats(config, sessionsRange) {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayKey = yesterday.toISOString().split('T')[0];
  
  const yesterdayData = sessionsRange[yesterdayKey];
  if (!yesterdayData) return null;
  
  return {
    onlineSeconds: (yesterdayData.studySeconds || 0) + (yesterdayData.restSeconds || 0),
    studySeconds: yesterdayData.studySeconds || 0,
    restSeconds: yesterdayData.restSeconds || 0
  };
}

// 渲染概览卡片
function renderOverviewCards(stats, yesterday) {
  // 今日总时长
  document.getElementById('stat-total-time').textContent = formatSeconds(stats.onlineSeconds);
  
  if (yesterday) {
    const diff = stats.onlineSeconds - yesterday.onlineSeconds;
    const pct = yesterday.onlineSeconds > 0 
      ? Math.round((diff / yesterday.onlineSeconds) * 100) 
      : 0;
    const trendEl = document.getElementById('stat-total-trend');
    trendEl.textContent = diff >= 0 ? `比昨日 +${pct}%` : `比昨日 ${pct}%`;
    trendEl.style.color = diff >= 0 ? 'var(--danger)' : 'var(--green)';
  }
  
  // 学习时长
  document.getElementById('stat-study-time').textContent = formatSeconds(stats.studySeconds);
  const studyPct = stats.onlineSeconds > 0 
    ? Math.round((stats.studySeconds / stats.onlineSeconds) * 100) 
    : 0;
  document.getElementById('stat-study-percent').textContent = `占比 ${studyPct}%`;
  
  // 休息时长
  document.getElementById('stat-rest-time').textContent = formatSeconds(stats.restSeconds);
  const restPct = stats.onlineSeconds > 0 
    ? Math.round((stats.restSeconds / stats.onlineSeconds) * 100) 
    : 0;
  document.getElementById('stat-rest-percent').textContent = `占比 ${restPct}%`;
  
  // 访问次数
  document.getElementById('stat-session-count').textContent = stats.sessionCount;
  document.getElementById('stat-avg-duration').textContent = 
    `平均 ${formatSeconds(Math.round(stats.avgSessionDuration))}`;
}

// 渲染时段分布热力图
function renderTimeHeatmap(visitSessions) {
  const container = document.getElementById('time-heatmap');
  
  // 初始化24小时数据
  const hourlyData = new Array(24).fill(0);
  
  // 统计每小时的访问时长
  visitSessions.forEach(session => {
    const startHour = new Date(session.startAt).getHours();
    const endHour = new Date(session.endAt).getHours();
    const duration = session.duration;
    
    // 简化处理：将会话时长平均分配到涉及的小时
    const hours = Math.max(1, endHour - startHour + 1);
    const perHour = duration / hours;
    
    for (let h = startHour; h <= endHour; h++) {
      hourlyData[h] += perHour;
    }
  });
  
  // 找出最大值用于归一化
  const maxValue = Math.max(...hourlyData, 1);
  
  // 生成热力图 HTML
  const heatmapHtml = hourlyData.map((value, hour) => {
    const level = value === 0 ? 0 : Math.min(5, Math.ceil((value / maxValue) * 5));
    const timeLabel = `${hour}:00-${hour + 1}:00`;
    const durationLabel = value > 0 ? `${Math.round(value / 60)}分钟` : '无访问';
    
    return `<div class="heatmap-cell level-${level}" data-time="${timeLabel}: ${durationLabel}" title="${timeLabel}: ${durationLabel}"></div>`;
  }).join('');
  
  container.innerHTML = `<div class="heatmap-grid">${heatmapHtml}</div>`;
}

// 渲染网站类型分布饼图
function renderDomainTypeChart(stats) {
  const total = stats.onlineSeconds;
  if (total === 0) {
    document.getElementById('domain-type-chart').innerHTML = '<div style="padding:40px;text-align:center;color:var(--muted)">暂无数据</div>';
    return;
  }
  
  const studyPct = Math.round((stats.studySeconds / total) * 100);
  const otherPct = Math.round((stats.otherSeconds / total) * 100);
  const restPct = 100 - studyPct - otherPct;
  
  // 使用 canvas 绘制简单饼图
  const canvas = document.getElementById('typeChart');
  if (!canvas) return;
  
  const ctx = canvas.getContext('2d');
  const centerX = canvas.width / 2;
  const centerY = canvas.height / 2;
  const radius = 80;
  
  // 清空画布
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  
  // 绘制饼图
  let currentAngle = -Math.PI / 2;
  
  // 学习 - 绿色
  if (studyPct > 0) {
    const studyAngle = (studyPct / 100) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(centerX, centerY);
    ctx.arc(centerX, centerY, radius, currentAngle, currentAngle + studyAngle);
    ctx.closePath();
    ctx.fillStyle = '#4ade80';
    ctx.fill();
    currentAngle += studyAngle;
  }
  
  // 其他 - 灰色
  if (otherPct > 0) {
    const otherAngle = (otherPct / 100) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(centerX, centerY);
    ctx.arc(centerX, centerY, radius, currentAngle, currentAngle + otherAngle);
    ctx.closePath();
    ctx.fillStyle = '#5a5a80';
    ctx.fill();
    currentAngle += otherAngle;
  }
  
  // 休息 - 橙色
  if (restPct > 0) {
    const restAngle = (restPct / 100) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(centerX, centerY);
    ctx.arc(centerX, centerY, radius, currentAngle, currentAngle + restAngle);
    ctx.closePath();
    ctx.fillStyle = '#fbbf24';
    ctx.fill();
  }
  
  // 添加百分比文字
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 24px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(`${studyPct}%`, centerX, centerY);
}

// 渲染TOP网站列表
function renderTopDomains(stats, config) {
  const container = document.getElementById('top-domains-list');
  const maxSeconds = stats.topDomains[0]?.seconds || 1;
  
  const html = stats.topDomains.map((item, index) => {
    const rank = index + 1;
    const pct = Math.round((item.seconds / maxSeconds) * 100);
    const typeLabel = item.type === 'study' ? '学习' : item.type === 'other' ? '其他' : '娱乐';
    
    return `
      <div class="top-domain-item">
        <div class="domain-rank ${rank <= 3 ? 'top-' + rank : ''}">${rank}</div>
        <div class="domain-info">
          <div class="domain-name">${item.domain}</div>
          <div class="domain-type">${typeLabel}</div>
        </div>
        <div class="domain-bar">
          <div class="domain-bar-fill" style="width:${pct}%"></div>
        </div>
        <div class="domain-time">${formatSeconds(item.seconds)}</div>
      </div>
    `;
  }).join('');
  
  container.innerHTML = html || '<div style="padding:20px;text-align:center;color:var(--muted)">暂无数据</div>';
}

// 渲染专注模式分析
function renderPatternAnalysis(visitSessions) {
  const container = document.getElementById('pattern-analysis');
  
  // 计算指标
  const totalSessions = visitSessions.length;
  if (totalSessions === 0) {
    container.innerHTML = '<div style="padding:20px;text-align:center;color:var(--muted)">暂无足够数据进行分析</div>';
    return;
  }
  
  // 深度专注会话（active > 70%）
  const deepFocus = visitSessions.filter(s => {
    const total = s.activeTime + s.passiveTime + s.visibleTime;
    return total > 0 && (s.activeTime / total) > 0.7;
  }).length;
  
  // 平均会话时长
  const avgDuration = visitSessions.reduce((sum, s) => sum + s.duration, 0) / totalSessions;
  
  // 最长专注时段
  const maxSession = visitSessions.reduce((max, s) => s.duration > max.duration ? s : max, visitSessions[0] || {});
  
  container.innerHTML = `
    <div class="pattern-card">
      <div class="pattern-icon">🎯</div>
      <div class="pattern-title">深度专注次数</div>
      <div class="pattern-value">${deepFocus} 次</div>
    </div>
    <div class="pattern-card">
      <div class="pattern-icon">⏱️</div>
      <div class="pattern-title">平均专注时长</div>
      <div class="pattern-value">${formatSeconds(Math.round(avgDuration))}</div>
    </div>
    <div class="pattern-card">
      <div class="pattern-icon">🏆</div>
      <div class="pattern-title">最长专注时段</div>
      <div class="pattern-value">${formatSeconds(maxSession.duration || 0)}</div>
    </div>
  `;
}

// 渲染变更日志
function renderChangelog(changelog) {
  const container = document.getElementById('changelog-timeline');
  
  const actionLabels = {
    'add_to_studylist': { text: '添加学习网站', type: 'add' },
    'remove_from_studylist': { text: '移除学习网站', type: 'remove' },
    'add_to_allowlist': { text: '添加允许网站', type: 'add' },
    'remove_from_allowlist': { text: '移除允许网站', type: 'remove' },
    'change_daily_quota': { text: '修改时间限制', type: 'change' },
    'change_schedule': { text: '修改时间段', type: 'change' },
    'toggle_enabled': { text: '开关插件', type: 'change' },
    'toggle_auto_switch': { text: '修改自动切换', type: 'change' },
    'manual_switch_to_study': { text: '手动切换学习', type: 'switch' },
    'manual_switch_to_rest': { text: '手动切换休息', type: 'switch' },
    'auto_switch_to_study': { text: '自动切换学习', type: 'switch' },
    'auto_switch_to_rest': { text: '自动切换休息', type: 'switch' }
  };
  
  const html = changelog.slice(0, 10).map(entry => {
    const action = actionLabels[entry.action] || { text: entry.action, type: 'change' };
    const time = new Date(entry.ts).toLocaleString('zh-CN', { 
      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' 
    });
    
    return `
      <div class="changelog-item">
        <div class="changelog-dot ${action.type}"></div>
        <div class="changelog-content">
          <div class="changelog-time">${time}</div>
          <div class="changelog-text">${entry.details || action.text}</div>
        </div>
      </div>
    `;
  }).join('');
  
  container.innerHTML = html || '<div style="padding:20px;text-align:center;color:var(--muted)">暂无变更记录</div>';
}

// 绑定时间范围选择器
function setupTimeRangeSelector() {
  const buttons = document.querySelectorAll('.range-btn');
  buttons.forEach(btn => {
    btn.addEventListener('click', async () => {
      buttons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      
      const range = btn.dataset.range;
      const days = range === 'today' ? 1 : range === 'week' ? 7 : 30;
      
      // 重新加载数据
      const config = await sendMsg({ type: 'GET_CONFIG' });
      const visitSessions = await sendMsg({ type: 'GET_VISIT_SESSIONS', days });
      
      // 更新热力图
      renderTimeHeatmap(visitSessions);
    });
  });
}

// 辅助函数：域名匹配
function matchDomain(domain, pattern) {
  const d = domain.replace(/^www\./, '');
  const p = pattern.replace(/^www\./, '');
  return d === p || d.endsWith('.' + p);
}

// ── 安全设置 ──────────────────────────────────────────────────────────────

function setupSecurityPage() {
  document.getElementById('change-pw-btn').addEventListener('click', async () => {
    const oldPw = document.getElementById('old-pw').value;
    const newPw = document.getElementById('new-pw').value;
    const confirmPw = document.getElementById('new-pw-confirm').value;
    const msg = document.getElementById('pw-change-msg');

    const oldHash = await hashPassword(oldPw);
    if (oldHash !== config.adminPasswordHash) {
      msg.style.color = 'var(--danger)';
      msg.textContent = '当前密码错误';
      msg.style.display = 'block';
      return;
    }
    if (newPw.length < 6) {
      msg.style.color = 'var(--danger)';
      msg.textContent = '新密码至少6位';
      msg.style.display = 'block';
      return;
    }
    if (newPw !== confirmPw) {
      msg.style.color = 'var(--danger)';
      msg.textContent = '两次密码不一致';
      msg.style.display = 'block';
      return;
    }

    config.adminPasswordHash = await hashPassword(newPw);
    await sendMsg({ type: 'UPDATE_CONFIG', config });
    msg.style.color = 'var(--green)';
    msg.textContent = '密码修改成功';
    msg.style.display = 'block';
    document.getElementById('old-pw').value = '';
    document.getElementById('new-pw').value = '';
    document.getElementById('new-pw-confirm').value = '';
  });
}

// ── 学习/休息统计 ─────────────────────────────────────────────────────────

async function renderSessions() {
  const session = await sendMsg({ type: 'GET_SESSION' });
  const sessions = await sendMsg({ type: 'GET_SESSIONS_RANGE', days: 30 });

  renderCurrentSession(session);
  renderSessionsHistory(sessions);
  loadRestConfig();
  setupRestConfigSave();
  loadTempWhitelistConfig();
  setupTempWhitelistConfigSave();
  await renderTempWhitelistRecords();
  loadAutoStudyConfig();
  setupAutoStudyConfigSave();
}

function renderCurrentSession(session) {
  const container = document.getElementById('current-session-info');

  const modeText = session.currentMode === 'study' ? '📚 学习中' :
                   session.currentMode === 'rest' ? '☕ 休息中' : '🔓 自由模式';
  const modeClass = session.currentMode === 'study' ? 'style="color:var(--green)"' :
                    session.currentMode === 'rest' ? 'style="color:var(--warn)"' : '';

  let studyTime = session.studySession.totalSeconds;
  let restTime = session.restSession.totalSeconds;

  if (session.currentMode === 'study' && session.studySession.startTime) {
    studyTime += Math.floor((Date.now() - session.studySession.startTime) / 1000);
  } else if (session.currentMode === 'rest' && session.restSession.startTime) {
    restTime += Math.floor((Date.now() - session.restSession.startTime) / 1000);
  }

  container.innerHTML = `
    <div class="quota-row">
      <div class="quota-label">
        当前状态
        <small>当前所处模式</small>
      </div>
      <span ${modeClass} style="font-size:14px;font-weight:600">${modeText}</span>
    </div>
    <div class="quota-row">
      <div class="quota-label">
        📚 学习时长
        <small>本次会话累计</small>
      </div>
      <span style="color:var(--green);font-size:14px">${formatSeconds(studyTime)}</span>
    </div>
    <div class="quota-row">
      <div class="quota-label">
        ☕ 休息时长
        <small>本次会话累计</small>
      </div>
      <span style="color:var(--warn);font-size:14px">${formatSeconds(restTime)}</span>
    </div>
  `;
}

function renderSessionsHistory(sessions) {
  const container = document.getElementById('sessions-history');
  const today = new Date().toISOString().split('T')[0];

  const dates = Object.keys(sessions).sort().reverse();
  const sessionData = dates.length > 0 ? sessions : {};

  if (dates.length === 0) {
    container.innerHTML = '<div style="color:var(--muted);font-size:13px">暂无历史数据</div>';
    return;
  }

  const weekDays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

  container.innerHTML = dates.slice(0, 14).map(date => {
    const data = sessionData[date] || { studySeconds: 0, restSeconds: 0 };
    const d = new Date(date);
    const weekDay = weekDays[d.getDay()];
    const isToday = date === today;

    return `
      <div class="quota-row" style="${isToday ? 'background:rgba(124,111,255,0.1);border-radius:8px' : ''}">
        <div class="quota-label">
          ${isToday ? '<strong>' : ''}${date} ${weekDay}${isToday ? '</strong>' : ''}
        </div>
        <div style="display:flex;gap:16px">
          <span style="color:var(--green);font-size:13px">📚 ${formatSeconds(data.studySeconds)}</span>
          <span style="color:var(--warn);font-size:13px">☕ ${formatSeconds(data.restSeconds)}</span>
        </div>
      </div>
    `;
  }).join('');
}

function loadRestConfig() {
  document.getElementById('rest-reminder').value = config.restConfig?.reminderInterval || 15;
  document.getElementById('rest-max-duration').value = config.restConfig?.maxRestDuration || 60;
}

function setupRestConfigSave() {
  const btn = document.getElementById('save-rest-config-btn');
  if (btn.dataset.bound) return;
  btn.dataset.bound = true;

  btn.addEventListener('click', async () => {
    const reminderInterval = parseInt(document.getElementById('rest-reminder').value) || 0;
    const maxDuration = parseInt(document.getElementById('rest-max-duration').value) || 0;

    config.restConfig = {
      reminderInterval,
      maxRestDuration: maxDuration
    };

    await sendMsg({ type: 'UPDATE_CONFIG', config });
    showSuccess();
  });
}

function loadAutoStudyConfig() {
  const cfg = config.autoStudyConfig || { enabled: true, requiredSeconds: 90 };
  document.getElementById('auto-study-enabled').checked = cfg.enabled;
  document.getElementById('auto-study-seconds').value   = cfg.requiredSeconds;
}

function setupAutoStudyConfigSave() {
  const btn = document.getElementById('save-auto-study-btn');
  if (btn.dataset.bound) return;
  btn.dataset.bound = true;

  btn.addEventListener('click', async () => {
    config.autoStudyConfig = {
      enabled:         document.getElementById('auto-study-enabled').checked,
      requiredSeconds: parseInt(document.getElementById('auto-study-seconds').value) || 90
    };
    await sendMsg({ type: 'UPDATE_CONFIG', config });
    showSuccess();
  });
}

// ── 临时白名单设置 ─────────────────────────────────────────────────────────

function loadTempWhitelistConfig() {
  document.getElementById('temp-whitelist-duration').value = config.tempWhitelistConfig?.duration || 1;
}

function setupTempWhitelistConfigSave() {
  const btn = document.getElementById('save-temp-whitelist-config-btn');
  if (btn.dataset.bound) return;
  btn.dataset.bound = true;

  btn.addEventListener('click', async () => {
    const duration = parseInt(document.getElementById('temp-whitelist-duration').value) || 1;

    config.tempWhitelistConfig = { duration };

    await sendMsg({ type: 'UPDATE_CONFIG', config });
    showSuccess();
  });
}

async function renderTempWhitelistRecords() {
  const container = document.getElementById('temp-whitelist-records');
  const tempWhitelist = await sendMsg({ type: 'GET_TEMP_WHITELIST' });
  
  const records = tempWhitelist?.records || [];
  
  if (records.length === 0) {
    container.innerHTML = '<div style="color:var(--muted);font-size:13px">暂无使用记录</div>';
    return;
  }

  container.innerHTML = records.slice(0, 20).map(record => {
    const addedAt = new Date(record.addedAt).toLocaleString('zh-CN');
    const expiresAt = new Date(record.expiresAt).toLocaleString('zh-CN');
    const isExpired = record.expiresAt < Date.now();
    
    return `
      <div class="quota-row">
        <div class="quota-label">
          <span style="color:var(--accent)">${record.domain}</span>
        </div>
        <div style="font-size:12px;color:${isExpired ? 'var(--muted)' : 'var(--green)'}">
          ${isExpired ? '已过期' : '有效'} · ${addedAt}
        </div>
      </div>
    `;
  }).join('');
}

// ── 工具函数 ──────────────────────────────────────────────────────────────

function sendMsg(msg) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(msg, resolve);
  });
}

async function hashPassword(password) {
  const text = password + 'guardian_pw_salt_9527';
  const buffer = new TextEncoder().encode(text);
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

function formatSeconds(secs) {
  if (secs < 60) return `${secs}秒`;
  if (secs < 3600) return `${Math.floor(secs / 60)}分钟`;
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  return m > 0 ? `${h}小时${m}分` : `${h}小时`;
}

function showSuccess() {
  const toast = document.getElementById('success-toast');
  toast.style.display = 'block';
  setTimeout(() => toast.style.display = 'none', 2500);
}
