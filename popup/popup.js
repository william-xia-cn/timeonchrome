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

  // 计算今日学习/休息/在线时长
  const studyList = config.studyList || [];
  const allowList = config.allowList || [];
  let studySeconds = 0, restSeconds = 0, onlineSeconds = 0;

  for (const [domain, seconds] of Object.entries(stats)) {
    onlineSeconds += seconds;
    if (studyList.some(p => matchDomain(domain, p))) {
      studySeconds += seconds;
    } else {
      restSeconds += seconds;
    }
  }

  // 配额上限（分钟→秒）
  const onlineLimit = (config.dailyOnlineQuota ?? 1200) * 60;
  const studyLimit  = (config.dailyStudyQuota  ?? 480)  * 60;
  const restLimit   = (config.dailyRestQuota   ?? 120)  * 60;
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
