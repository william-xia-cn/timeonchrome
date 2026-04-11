// blocked.js - 拦截页面逻辑

(function() {
  // 解析 URL 参数
  const params = new URLSearchParams(location.search);
  let reason = params.get('reason') || 'block';
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
  const mainTitle = document.getElementById('mainTitle');
  const subtitle = document.getElementById('subtitle');
  const domainEl = document.getElementById('domainEl');
  const infoCard = document.getElementById('infoCard');
  const infoIcon = document.getElementById('infoIcon');
  const infoText = document.getElementById('infoText');
  const lockIcon = document.getElementById('lockIcon');

  if (domain) {
    domainEl.textContent = domain === 'all' ? '所有网站' : domain;
  } else if (document.referrer) {
    try {
      const refUrl = new URL(document.referrer);
      domainEl.textContent = refUrl.hostname;
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
      infoText: '仅允许访问白名单中的网站'
    },
    quota: {
      badge: '时间配额已满', badgeClass: 'quota',
      title: '今日上网时间已用完',
      subtitle: '今天的上网时间配额已达上限，明天再来吧！',
      icon: '⏰', infoIcon: '⏱',
      infoText: (domain || '此网站') + ' 今日使用时间已达上限'
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

  // 临时放行功能（白名单拦截 / 配额锁定 / 时间段限制均可申请）
  const isQuotaReason    = reason.startsWith('quota');
  const isScheduleReason = reason === 'schedule';
  const isWhitelistReason = reason === 'whitelist';
  const canRequestTemp = (isWhitelistReason || isQuotaReason || isScheduleReason) && domain;

  if (canRequestTemp) {
    const tempAllowSection = document.getElementById('tempAllowSection');
    const tempAllowBtn     = document.getElementById('tempAllowBtn');
    const tempStatus       = document.getElementById('tempStatus');
    const tempDuration     = document.getElementById('tempDuration');

    tempAllowSection.style.display = 'block';

    // 根据拦截类型定制按钮文字
    if (isQuotaReason || isScheduleReason) {
      tempAllowBtn.querySelector
        ? (tempAllowBtn.childNodes[0].textContent = '⏱ 申请 ')
        : null;
      // 重写按钮内容
      tempAllowBtn.innerHTML = `⏱ 申请 <span id="tempDuration">1</span> 分钟例外`;
    }

    // 获取配置中的时长
    chrome.runtime.sendMessage({ type: 'GET_CONFIG' }, (config) => {
      if (config) {
        const duration = config.tempWhitelistConfig?.duration || 1;
        document.getElementById('tempDuration').textContent = duration;
      }
    });

    // 如果是白名单拦截，检查是否已在临时白名单中
    if (isWhitelistReason) {
      chrome.runtime.sendMessage({ type: 'GET_TEMP_WHITELIST' }, (tempWhitelist) => {
        if (tempWhitelist?.domains?.[domain]) {
          const expiresAt = tempWhitelist.domains[domain];
          const remaining = Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000 / 60));
          if (remaining > 0) {
            tempStatus.textContent = `✓ 已临时放行，剩余 ${remaining} 分钟`;
            tempAllowBtn.disabled = true;
            tempAllowBtn.style.opacity = '0.5';
          }
        }
      });
    }

    // 点击申请
    tempAllowBtn.addEventListener('click', () => {
      tempAllowBtn.disabled = true;
      tempAllowBtn.style.opacity = '0.5';
      tempStatus.textContent = '处理中...';

      if (isWhitelistReason) {
        // 白名单绕过：把域名加入临时白名单
        chrome.runtime.sendMessage({ type: 'ADD_TEMP_WHITELIST', domain }, (result) => {
          if (result?.expiresAt) {
            const remaining = Math.ceil((result.expiresAt - Date.now()) / 1000 / 60);
            tempStatus.textContent = `✓ 已放行，${remaining} 分钟后过期`;
            // 上报云端事件（fire-and-forget）
            chrome.runtime.sendMessage({ type: 'SEND_CLOUD_EVENT', eventType: 'temp_allow', domain });
            setTimeout(() => {
              const protocol = document.referrer ? new URL(document.referrer).protocol : 'https:';
              window.location.href = `${protocol}//${domain}`;
            }, 500);
          }
        });

      } else if (isQuotaReason) {
        // 配额绕过：设置临时配额豁免
        chrome.runtime.sendMessage({ type: 'ADD_TEMP_EXEMPTION', exemptType: 'quota', domain }, (result) => {
          if (result?.expiresAt) {
            const remaining = Math.ceil((result.expiresAt - Date.now()) / 1000 / 60);
            tempStatus.textContent = `✓ 已申请 ${remaining} 分钟例外`;
            chrome.runtime.sendMessage({ type: 'SEND_CLOUD_EVENT', eventType: 'temp_allow_quota', domain });
            setTimeout(() => {
              if (domain && domain !== 'all') {
                const protocol = document.referrer ? new URL(document.referrer).protocol : 'https:';
                window.location.href = `${protocol}//${domain}`;
              } else {
                history.back();
              }
            }, 500);
          }
        });

      } else if (isScheduleReason) {
        // 时间段绕过：设置临时时间段豁免
        chrome.runtime.sendMessage({ type: 'ADD_TEMP_EXEMPTION', exemptType: 'schedule', domain }, (result) => {
          if (result?.expiresAt) {
            const remaining = Math.ceil((result.expiresAt - Date.now()) / 1000 / 60);
            tempStatus.textContent = `✓ 已申请 ${remaining} 分钟例外`;
            chrome.runtime.sendMessage({ type: 'SEND_CLOUD_EVENT', eventType: 'temp_allow_schedule', domain });
            setTimeout(() => {
              if (domain && domain !== 'all') {
                const protocol = document.referrer ? new URL(document.referrer).protocol : 'https:';
                window.location.href = `${protocol}//${domain}`;
              } else {
                history.back();
              }
            }, 500);
          }
        });
      }
    });
  }
})();
