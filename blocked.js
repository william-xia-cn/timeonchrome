// blocked.js - 拦截页面逻辑

(function() {
  // 解析 URL 参数
  const params = new URLSearchParams(location.search);
  const reason = params.get('reason') || 'block';
  let domain = params.get('domain') || '';
  const msg = params.get('msg') || '';

  // 如果 domain 为空，尝试从 referrer 获取
  if (!domain && document.referrer) {
    try {
      const refUrl = new URL(document.referrer);
      domain = refUrl.hostname.replace(/^www\./, '');
    } catch (e) {}
  }

  const reasonBadge = document.getElementById('reasonBadge');
  const mainTitle   = document.getElementById('mainTitle');
  const subtitle    = document.getElementById('subtitle');
  const domainEl    = document.getElementById('domainEl');
  const infoCard    = document.getElementById('infoCard');
  const infoIcon    = document.getElementById('infoIcon');
  const infoText    = document.getElementById('infoText');
  const lockIcon    = document.getElementById('lockIcon');

  if (domain) {
    domainEl.textContent = domain === 'all' ? '所有网站' : domain;
  } else if (document.referrer) {
    try {
      domainEl.textContent = new URL(document.referrer).hostname;
    } catch (e) {
      domainEl.textContent = '(未知)';
    }
  }

  const configs = {
    blacklist: {
      badge: '黑名单拦截', badgeClass: 'blacklist',
      title: '此网站已被屏蔽',
      subtitle: '该网站在限制列表中，无法访问',
      icon: '🚫', infoIcon: '📋',
      infoText: '此网站在黑名单中，家长已限制访问'
    },
    whitelist: {
      badge: '未授权网站', badgeClass: 'whitelist',
      title: '此网站不在允许列表',
      subtitle: 'TimeOnChrome 已开启白名单模式，只允许访问特定网站',
      icon: '🔒', infoIcon: '📋',
      infoText: '仅允许访问白名单中的网站。可将此网站加入复合型列表临时访问（计入每日待定时限）。'
    },
    quota: {
      badge: '时间配额已满', badgeClass: 'quota',
      title: '今日上网时间已用完',
      subtitle: '今天的上网时间配额已达上限，明天再来吧！',
      icon: '⏰', infoIcon: '⏱',
      infoText: (domain || '此网站') + ' 今日使用时间已达上限'
    },
    quota_online: {
      badge: '在线时间已满', badgeClass: 'quota',
      title: '今日在线时间已用完',
      subtitle: '今天的总在线时间配额已达上限，明天再来吧！',
      icon: '⏰', infoIcon: '⏱',
      infoText: '今日在线时间已达上限，所有网站已锁定'
    },
    quota_study: {
      badge: '学习时间已满', badgeClass: 'quota',
      title: '今日学习时间已用完',
      subtitle: '今天的学习时间配额已达上限，休息一下吧！',
      icon: '📚', infoIcon: '⏱',
      infoText: '今日学习时长已达上限，学习网站已锁定'
    },
    quota_rest: {
      badge: '休息时间已满', badgeClass: 'quota',
      title: '今日休息时间已用完',
      subtitle: '今天的休息时间配额已达上限，去学习吧！',
      icon: '🎮', infoIcon: '⏱',
      infoText: '今日休息时长已达上限，娱乐网站已锁定'
    },
    quota_undetermined: {
      badge: '待定时间已满', badgeClass: 'quota',
      title: '今日待定时间已用完',
      subtitle: '今天访问复合型网站的时间已达上限（2小时），明天再来吧！',
      icon: '⏳', infoIcon: '⏱',
      infoText: '今日待定时段已达上限（最多 2 小时），复合型网站已锁定'
    },
    schedule: {
      badge: '时间段限制', badgeClass: 'schedule',
      title: '当前时间不在允许范围',
      subtitle: '家长设置了上网时间限制，请在规定时间段内使用',
      icon: '📅', infoIcon: '🕐',
      infoText: '请在家长设定的时间段内上网'
    }
  };

  const c = configs[reason] || configs.blacklist;
  reasonBadge.textContent = c.badge;
  reasonBadge.className = 'reason-badge ' + c.badgeClass;
  mainTitle.textContent = c.title;
  subtitle.textContent = msg || c.subtitle;
  lockIcon.textContent = c.icon;

  infoCard.style.display = 'block';
  infoIcon.textContent = c.infoIcon;
  infoText.textContent = c.infoText;

  // 生成背景星点
  const starsContainer = document.getElementById('stars');
  for (let i = 0; i < 80; i++) {
    const star = document.createElement('div');
    star.className = 'star';
    star.style.cssText = `
      left: ${Math.random() * 100}%;
      top: ${Math.random() * 100}%;
      --dur: ${2 + Math.random() * 4}s;
      --delay: ${Math.random() * 4}s;
      --max-op: ${0.3 + Math.random() * 0.5};
      width: ${1 + Math.random() * 2}px;
      height: ${1 + Math.random() * 2}px;
    `;
    starsContainer.appendChild(star);
  }

  // 白名单拦截：提供"加入复合型网站"入口
  if (reason === 'whitelist' && domain) {
    const compositeSection = document.getElementById('compositeSection');
    const compositeBtn     = document.getElementById('compositeBtn');
    const compositeStatus  = document.getElementById('compositeStatus');

    compositeSection.style.display = 'block';

    compositeBtn.addEventListener('click', () => {
      compositeBtn.disabled = true;
      compositeBtn.style.opacity = '0.5';
      compositeStatus.textContent = '处理中...';

      chrome.runtime.sendMessage({ type: 'ADD_TO_COMPOSITE_LIST', domain }, (result) => {
        if (result?.added) {
          compositeStatus.textContent = '✓ 已加入复合型网站，正在跳转…';
          chrome.runtime.sendMessage({ type: 'SEND_CLOUD_EVENT', eventType: 'composite_add', domain });
          setTimeout(() => {
            const protocol = document.referrer ? new URL(document.referrer).protocol : 'https:';
            window.location.href = `${protocol}//${domain}`;
          }, 600);
        } else if (result?.alreadyPresent) {
          compositeStatus.textContent = '该域名已在允许列表中，请刷新页面';
        } else {
          compositeStatus.textContent = '操作失败，请稍后重试';
          compositeBtn.disabled = false;
          compositeBtn.style.opacity = '1';
        }
      });
    });
  }
})();
