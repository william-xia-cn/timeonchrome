// reminder.js - 提醒页面逻辑（替代 blocked.js）

(function() {
  const BORROW_CONFIRM_TEXT = '确认借用明天时间？\n\n本次将立即增加今日可用休息时间 30 分钟，\n明天会扣减同等时长。\n明天不能连续再次借用。是否继续？';
  const BORROW_BUTTON_TEXT = '⏱ 向明天借时间';
  const BORROW_ERROR_MESSAGES = {
    already_borrowed: '已有未还借用，无法再借',
    no_cross_week: '周日不能借用（防止跨周）',
    weekly_quota_exceeded: '本周配额已用完，无法借用',
  };

  // 解析 URL 参数
  const params = new URLSearchParams(location.search);
  const reason = params.get('reason') || 'unsafe';
  let domain = params.get('domain') || '';
  const msg = params.get('msg') || '';

  // 如果 domain 为空，尝试从 referrer 获取
  if (!domain && document.referrer) {
    try {
      const refUrl = new URL(document.referrer);
      domain = refUrl.hostname.replace(/^www\./, '');
    } catch (e) {}
  }

  // DOM 元素
  const mainIcon = document.getElementById('mainIcon');
  const mainTitle = document.getElementById('mainTitle');
  const subtitle = document.getElementById('subtitle');
  const domainEl = document.getElementById('domainEl');
  const actionsContainer = document.getElementById('actions');
  const statusEl = document.getElementById('statusFeedback');
  const starsContainer = document.getElementById('stars');

  // 原因配置
  const configs = {
    unsafe: {
      icon: '🛡️', title: '此网站不适合访问',
      subtitle: '基于年龄和安全考虑，建议不要访问此类网站',
      actions: ['back']
    },
    study_mode: {
      icon: '📖', title: '当前是学习模式',
      subtitle: '这个网站不在你的学习网站中',
      actions: ['addComposite', 'switchToRest', 'back']
    },
    quota_rest: {
      icon: '⏰', title: '今天的休息时间用完啦',
      subtitle: '放松过了，切换到学习模式继续加油！',
      actions: ['borrowTime', 'switchToStudy', 'viewDetails']
    },
    quota_study: {
      icon: '🎓', title: '今天学得够多啦',
      subtitle: '劳逸结合才高效！',
      actions: ['switchToRest', 'viewDetails']
    },
    quota_undetermined: {
      icon: '🔍', title: '待归类网站的时间用完啦',
      subtitle: '明天再来探索吧',
      actions: ['switchToStudy', 'viewDetails']
    },
    quota_online: {
      icon: '🌙', title: '今天的上网时间用完啦',
      subtitle: '休息一下，明天继续！',
      actions: ['borrowTime', 'viewDetails']
    },
    quota: {
      icon: '🌙', title: '今天的上网时间用完啦',
      subtitle: '休息一下，明天继续！',
      actions: ['borrowTime', 'viewDetails']
    },
    schedule: {
      icon: '🌙', title: '现在是休息时段',
      subtitle: '到点了再来！',
      actions: ['back']
    }
  };

  // 操作按钮定义
  const actionDefs = {
    addComposite: {
      label: '📝 临时加入学习网站', style: 'primary',
      handler: function() {
        chrome.runtime.sendMessage({ type: 'ADD_TO_COMPOSITE_LIST', domain: domain }, function(result) {
          if (result && result.added) {
            chrome.runtime.sendMessage({ type: 'SEND_CLOUD_EVENT', eventType: 'composite_add', domain: domain });
            showStatus('✓ 已加入，正在跳转…', 'success');
            setTimeout(function() { window.location.href = 'https://' + domain; }, 600);
          } else if (result && result.alreadyPresent) {
            showStatus('该网站已在列表中', 'info');
          } else {
            showStatus('操作失败，请稍后重试', 'error');
          }
        });
      }
    },
    switchToRest: {
      label: '☕ 切换到休息模式', style: 'secondary',
      handler: function() {
        chrome.runtime.sendMessage({ type: 'SWITCH_TO_REST' }, function() {
          showStatus('已切换到休息模式，正在跳转…', 'success');
          if (domain && domain !== 'all') {
            setTimeout(function() { window.location.href = 'https://' + domain; }, 600);
          }
        });
      }
    },
    switchToStudy: {
      label: '📚 切换到学习模式', style: 'secondary',
      handler: function() {
        chrome.runtime.sendMessage({ type: 'SWITCH_TO_STUDY' }, function() {
          showStatus('已切换到学习模式', 'success');
          if (domain && domain !== 'all') {
            setTimeout(function() { window.location.href = 'https://' + domain; }, 600);
          }
        });
      }
    },
    borrowTime: {
      label: BORROW_BUTTON_TEXT, style: 'warn',
      handler: function() {
        if (!window.confirm(BORROW_CONFIRM_TEXT)) return;
        const btn = this && typeof this === 'object' ? this : null;
        const originalText = btn?.textContent || BORROW_BUTTON_TEXT;
        if (btn) {
          if (btn.disabled) return;
          btn.disabled = true;
          btn.textContent = '处理中...';
        }
        chrome.runtime.sendMessage({ type: 'BORROW_REST_QUOTA' }, function(result) {
          if (result && result.ok) {
            if (btn) {
              btn.disabled = true;
              btn.textContent = '已借用';
            }
            showStatus('✓ 已借用 ' + result.amount + ' 分钟，刷新页面试试', 'success');
          } else if (result && result.error && BORROW_ERROR_MESSAGES[result.error]) {
            if (btn) {
              btn.disabled = false;
              btn.textContent = originalText;
            }
            showStatus(BORROW_ERROR_MESSAGES[result.error], 'info');
          } else {
            if (btn) {
              btn.disabled = false;
              btn.textContent = originalText;
            }
            showStatus('借用失败：' + ((result && result.error) || '未知错误'), 'error');
          }
        });
      }
    },
    viewDetails: {
      label: '📊 查看详情', style: 'outline',
      handler: function() { chrome.runtime.openOptionsPage(); }
    },
    back: {
      label: '← 返回', style: 'outline',
      handler: function() { history.back(); }
    }
  };

  // 状态提示
  function showStatus(text, type) {
    if (!statusEl) return;
    statusEl.textContent = text;
    statusEl.className = 'status status-' + type;
    statusEl.style.display = 'block';

    var colorMap = {
      success: '#00b894',
      error: '#d63031',
      info: '#0984e3'
    };
    statusEl.style.color = colorMap[type] || '#636e72';
  }

  // 兼容旧 reason 名称
  var effectiveReason = reason;
  if (reason === 'blacklist') effectiveReason = 'unsafe';
  if (reason === 'whitelist') effectiveReason = 'study_mode';

  // 设置页面内容
  var config = configs[effectiveReason] || configs.unsafe;

  if (mainIcon) mainIcon.textContent = config.icon;
  if (mainTitle) mainTitle.textContent = config.title;
  if (subtitle) subtitle.textContent = config.subtitle;

  // 显示自定义消息（如有）
  var customMsgEl = document.getElementById('customMsg');
  if (msg && customMsgEl) {
    customMsgEl.textContent = decodeURIComponent(msg);
    customMsgEl.style.display = 'block';
  }
  if (domainEl) {
    if (domain) {
      domainEl.textContent = domain === 'all' ? '所有网站' : domain;
    } else {
      domainEl.textContent = '(未知)';
    }
  }

  // 构建操作按钮（清除默认按钮）
  if (actionsContainer && config.actions) {
    actionsContainer.innerHTML = '';
    config.actions.forEach(function(actionKey) {
      var def = actionDefs[actionKey];
      if (!def) return;

      var btn = document.createElement('button');
      btn.textContent = def.label;
      var styleMap = { primary: 'btn btn-primary', secondary: 'btn btn-secondary', warn: 'btn btn-secondary', outline: 'btn btn-back', back: 'btn btn-back' };
      btn.className = styleMap[def.style] || 'btn btn-back';
      btn.addEventListener('click', def.handler);
      actionsContainer.appendChild(btn);
    });
  }

  // 生成背景星点（绿色调）
  if (starsContainer) {
    for (var i = 0; i < 80; i++) {
      var star = document.createElement('div');
      star.className = 'star';
      star.style.cssText =
        'left:' + (Math.random() * 100) + '%;' +
        'top:' + (Math.random() * 100) + '%;' +
        '--dur:' + (2 + Math.random() * 4) + 's;' +
        '--delay:' + (Math.random() * 4) + 's;' +
        '--max-op:' + (0.3 + Math.random() * 0.5) + ';' +
        '--color:rgba(0,184,148,0.4);' +
        'width:' + (1 + Math.random() * 2) + 'px;' +
        'height:' + (1 + Math.random() * 2) + 'px;';
      starsContainer.appendChild(star);
    }
  }
})();
