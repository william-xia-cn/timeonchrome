// reminder.js - 提醒页面逻辑（替代 blocked.js）

(function() {
  const DIAG_PREFIX = '[TOC_REMINDER_SLIDER_DIAG]';
  const DIAG_VERSION = 'slider-diag-v1';
  function diag(event, payload) {
    try {
      console.log(`${DIAG_PREFIX} ${event}`, payload || {});
    } catch {}
  }

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
  const originMode = params.get('originMode') || '';
  let domain = params.get('domain') || '';
  const msg = params.get('msg') || '';
  diag('load', {
    version: DIAG_VERSION,
    url: location.href,
    reason,
    readyState: document.readyState,
  });

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
  const fallbackBackBtn = document.getElementById('fallback-back-btn');
  const statusEl = document.getElementById('statusFeedback');
  const starsContainer = document.getElementById('stars');
  const slideConfirmWrap = document.getElementById('slideConfirmWrap');
  const slideTrack = document.getElementById('slideTrack');
  const slideThumb = document.getElementById('slideThumb');
  const slideHint = document.getElementById('slideHint');
  const restQuotaLine = document.getElementById('restQuotaLine');
  const CONFIRM_STANDARD_REASONS = new Set(['to_composite_confirm', 'to_rest_confirm']);
  const CONFIRM_INFO_REASONS = new Set(['to_composite_confirm', 'to_rest_confirm', 'to_rest_slide_confirm']);
  let slideBound = false;

  function getInteractionStyle(el) {
    if (!el) return null;
    const s = window.getComputedStyle(el);
    return {
      display: s.display,
      visibility: s.visibility,
      pointerEvents: s.pointerEvents,
      zIndex: s.zIndex,
      position: s.position,
    };
  }

  function getElementRect(el) {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return {
      left: r.left,
      top: r.top,
      width: r.width,
      height: r.height,
      right: r.right,
      bottom: r.bottom,
    };
  }

  function formatDurationCN(totalSeconds) {
    const seconds = Math.max(0, Math.floor(Number(totalSeconds) || 0));
    if (seconds < 60) return `${seconds}秒`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}分`;
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    return m > 0 ? `${h}小时${m}分` : `${h}小时`;
  }

  function closeCurrentReminderTab() {
    // extension page opened by redirect is usually script-open-closeable,
    // but keep robust fallback path for strict browser behaviors.
    window.close();
    setTimeout(function() {
      chrome.tabs.getCurrent(function(tab) {
        if (tab && tab.id) {
          chrome.tabs.remove(tab.id).catch(() => {});
          return;
        }
        if (history.length > 1) {
          history.back();
          return;
        }
        location.replace('about:blank');
      });
    }, 80);
  }

  // 原因配置
  const configs = {
    unsafe: {
      icon: '🛡️', title: '此网站不适合访问',
      subtitle: '基于年龄和安全考虑，建议不要访问此类网站',
      actions: ['back']
    },
    study_mode: {
      icon: '📖', title: '当前是学习模式',
      subtitle: '这个网站不在你的学习网站中。本次标签页访问内有效，占用综合时间，不计入学习时间。',
      actions: ['addComposite', 'switchToRest', 'back']
    },
    to_composite_confirm: {
      icon: '🧭', title: '你正在打开综合网站',
      subtitle: '继续后将进入综合时间，本段不会计入学习时间。',
      actions: ['switchToComposite', 'backToStudy']
    },
    to_rest_confirm: {
      icon: '☕', title: '你正在进入休息时间',
      subtitle: '继续后将进入休息时间，并消耗休息配额。',
      actions: ['switchToRest', 'backGeneric']
    },
    to_rest_slide_confirm: {
      icon: '☕', title: '你正在离开学习时间',
      subtitle: '继续后，这段时间会计入「休息时间」，不会计入「学习时间」。',
      actions: ['backToStudy']
    },
    restricted_study_mode: {
      icon: '🎮', title: '当前是学习模式',
      subtitle: '这是受限娱乐网站，学习模式下不可访问',
      actions: ['switchToRest', 'back']
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
      label: '📝 临时加入综合网站', style: 'primary',
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
      label: '开始休息', style: 'primary',
      handler: function() {
        chrome.runtime.sendMessage({ type: 'SWITCH_TO_REST' }, function() {
          showStatus('已切换到休息模式，正在跳转…', 'success');
          if (domain && domain !== 'all') {
            setTimeout(function() { window.location.href = 'https://' + domain; }, 600);
          }
        });
      }
    },
    switchToComposite: {
      label: '继续（进入综合时间）', style: 'primary',
      handler: function() {
        chrome.runtime.sendMessage({ type: 'SWITCH_TO_COMPOSITE' }, function() {
          showStatus('已进入综合时间，正在跳转…', 'success');
          if (domain && domain !== 'all') {
            setTimeout(function() { window.location.href = 'https://' + domain; }, 600);
          }
        });
      }
    },
    slideToRest: {
      label: '👉 拖动确认进入休息时间', style: 'secondary',
      handler: function() {
        if (!slideConfirmWrap || !slideTrack || !slideThumb) return;
        slideConfirmWrap.style.display = 'block';
        bindSlideConfirm();
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
      handler: function() { chrome.tabs.create({ url: chrome.runtime.getURL('admin/admin.html?view=stats') }); }
    },
    backGeneric: {
      label: '返回', style: 'outline',
      handler: function() { history.back(); }
    },
    back: {
      label: '返回', style: 'outline',
      handler: function() { history.back(); }
    },
    backToStudy: {
      label: '返回学习', style: 'outline',
      handler: function() {
        if (effectiveReason === 'to_rest_slide_confirm') {
          closeCurrentReminderTab();
          return;
        }
        history.back();
      }
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
  if (effectiveReason === 'to_rest_slide_confirm') {
    config = {
      ...config,
      actions: [originMode === 'study' ? 'backToStudy' : 'backGeneric'],
    };
  }

  if (mainIcon) mainIcon.textContent = config.icon;
  if (mainTitle) mainTitle.textContent = config.title;
  if (subtitle) subtitle.textContent = config.subtitle;

  if (CONFIRM_STANDARD_REASONS.has(effectiveReason)) {
    document.body.classList.add('confirm-standard');
  }

  if (CONFIRM_INFO_REASONS.has(effectiveReason) && restQuotaLine) {
    restQuotaLine.textContent = '剩余时间计算中...';
    restQuotaLine.style.display = 'block';
    chrome.runtime.sendMessage({ type: 'GET_RUNTIME_MODE_STATUS' }, function(status) {
      if (!restQuotaLine) return;
      if (!status) {
        restQuotaLine.textContent = '剩余时间：暂不可用';
        return;
      }
      if (effectiveReason === 'to_composite_confirm') {
        const remainingComposite = formatDurationCN(status.compositeRemainingSeconds || 0);
        restQuotaLine.textContent = `今日综合时间剩余：${remainingComposite}`;
        return;
      }
      const remainingRest = formatDurationCN(status.restRemainingSeconds || 0);
      restQuotaLine.textContent = `今日休息时间剩余：${remainingRest}`;
    });
  }

  if (effectiveReason === 'to_rest_slide_confirm') {
    diag('branch_entered', {
      reason: effectiveReason,
      exists: {
        slideConfirmWrap: !!slideConfirmWrap,
        slideTrack: !!slideTrack,
        slideThumb: !!slideThumb,
      },
      sizes: {
        trackClientWidth: slideTrack ? slideTrack.clientWidth : null,
        thumbClientWidth: slideThumb ? slideThumb.clientWidth : null,
      },
      rects: {
        wrap: getElementRect(slideConfirmWrap),
        track: getElementRect(slideTrack),
        thumb: getElementRect(slideThumb),
      },
      styles: {
        wrap: getInteractionStyle(slideConfirmWrap),
        track: getInteractionStyle(slideTrack),
        thumb: getInteractionStyle(slideThumb),
      },
    });

    document.body.classList.add('study-rest-reminder');
    if (slideConfirmWrap) slideConfirmWrap.style.display = 'block';
    if (slideThumb) slideThumb.textContent = '⇢ 拖动确认';
    if (slideHint) slideHint.style.display = 'none';
    bindSlideConfirm();

    // Detect DOM replacement/removal after bindings.
    const observeRoot = slideConfirmWrap?.parentElement || document.body;
    if (observeRoot) {
      const sliderObserver = new MutationObserver(() => {
        const currentTrack = document.getElementById('slideTrack');
        const currentThumb = document.getElementById('slideThumb');
        const replaced = currentTrack !== slideTrack || currentThumb !== slideThumb;
        if (replaced || !currentTrack || !currentThumb) {
          diag('dom_replaced_or_removed', {
            replaced,
            currentTrackExists: !!currentTrack,
            currentThumbExists: !!currentThumb,
            originalTrackStillInDOM: !!(slideTrack && slideTrack.isConnected),
            originalThumbStillInDOM: !!(slideThumb && slideThumb.isConnected),
          });
        }
      });
      sliderObserver.observe(observeRoot, { childList: true, subtree: true });
      diag('mutation_observer_installed', { rootTag: observeRoot.tagName, rootId: observeRoot.id || '' });
    }
  }

  // 显示自定义消息（如有）
  var customMsgEl = document.getElementById('customMsg');
  if (msg && customMsgEl) {
    customMsgEl.textContent = decodeURIComponent(msg);
    customMsgEl.style.display = 'block';
  }
  if (domainEl) {
    if (CONFIRM_STANDARD_REASONS.has(effectiveReason) || effectiveReason === 'to_rest_slide_confirm') {
      domainEl.style.display = 'none';
    }
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

  function bindSlideConfirm() {
    if (slideBound || !slideTrack || !slideThumb) return;
    slideBound = true;
    diag('bind_start', {
      pointerTarget: 'slideThumb',
      fallback: { mouse: true, touch: true },
      pointer: true,
    });

    var dragging = false;
    var startX = 0;
    var baseLeft = 0;
    var activePointerId = null;
    var switched = false;

    function getMaxOffset() {
      return Math.max(0, slideTrack.clientWidth - slideThumb.clientWidth);
    }

    function setThumb(left) {
      var max = getMaxOffset();
      var clamped = Math.max(0, Math.min(max, left));
      slideThumb.style.left = clamped + 'px';
      if (slideHint) {
        slideHint.textContent = clamped >= max * 0.92 ? '松手确认进入休息时间' : '拖动到右侧确认进入休息时间';
      }
      return { clamped: clamped, max: max };
    }

    function begin(clientX) {
      if (switched) return;
      dragging = true;
      startX = clientX;
      baseLeft = parseFloat(slideThumb.style.left || '0') || 0;
      diag('begin_drag', { clientX, baseLeft, trackWidth: slideTrack.clientWidth, thumbWidth: slideThumb.clientWidth });
    }

    function move(clientX) {
      if (!dragging) return;
      var delta = clientX - startX;
      var result = setThumb(baseLeft + delta);
      diag('pointer_move', {
        clientX,
        pos: result.clamped,
        max: result.max,
        threshold: result.max * 0.92,
      });
    }

    function completeSwitch() {
      if (switched) return;
      switched = true;
      const payload = { type: 'SWITCH_TO_REST' };
      diag('send_switch_to_rest', { payload });
      chrome.runtime.sendMessage(payload, function(result) {
        diag('switch_to_rest_callback', {
          result: result || null,
          lastError: chrome.runtime?.lastError ? chrome.runtime.lastError.message : null,
        });
        showStatus('已切换到休息模式，正在跳转…', 'success');
        if (domain && domain !== 'all') {
          setTimeout(function() { window.location.href = 'https://' + domain; }, 600);
        }
      });
    }

    function end() {
      if (!dragging) return;
      dragging = false;
      var pos = parseFloat(slideThumb.style.left || '0') || 0;
      var max = getMaxOffset();
      const passed = pos >= max * 0.92;
      diag('pointer_up', { pos, max, threshold: max * 0.92, passedThreshold: passed });
      if (pos >= max * 0.92) {
        slideThumb.style.left = max + 'px';
        completeSwitch();
      } else {
        slideThumb.style.left = '0px';
        if (slideHint) slideHint.textContent = '拖动到右侧确认进入休息时间';
      }
    }

    slideThumb.style.left = '0px';
    if (slideHint) slideHint.textContent = '拖动到右侧确认进入休息时间';

    // Pointer events: primary path for desktop Chrome + touch/pen.
    slideThumb.addEventListener('pointerdown', function(e) {
      activePointerId = e.pointerId;
      diag('pointer_down', {
        pointerId: e.pointerId,
        clientX: e.clientX,
        targetId: e.target?.id || '',
        targetClass: e.target?.className || '',
      });
      begin(e.clientX);
      if (slideThumb.setPointerCapture) {
        let captureOk = false;
        try {
          slideThumb.setPointerCapture(e.pointerId);
          captureOk = true;
        } catch (err) {
          diag('set_pointer_capture_error', { message: err?.message || String(err) });
        }
        diag('set_pointer_capture', { pointerId: e.pointerId, ok: captureOk });
      }
      e.preventDefault();
    });
    slideThumb.addEventListener('pointermove', function(e) {
      if (!dragging) return;
      if (activePointerId !== null && e.pointerId !== activePointerId) return;
      move(e.clientX);
      e.preventDefault();
    });
    slideThumb.addEventListener('pointerup', function(e) {
      if (activePointerId !== null && e.pointerId !== activePointerId) return;
      end();
      if (slideThumb.releasePointerCapture) {
        try { slideThumb.releasePointerCapture(e.pointerId); } catch {}
      }
      activePointerId = null;
      e.preventDefault();
    });
    slideThumb.addEventListener('pointercancel', function(e) {
      if (activePointerId !== null && e.pointerId !== activePointerId) return;
      dragging = false;
      activePointerId = null;
      slideThumb.style.left = '0px';
      if (slideHint) slideHint.textContent = '拖动到右侧确认进入休息时间';
      diag('pointer_cancel', {
        pointerId: e.pointerId,
        reason: e.type,
      });
    });

    // Mouse fallback for older environments.
    slideThumb.addEventListener('mousedown', function(e) {
      begin(e.clientX);
      e.preventDefault();
    });
    window.addEventListener('mousemove', function(e) { move(e.clientX); });
    window.addEventListener('mouseup', end);

    // Touch fallback for older mobile engines.
    slideThumb.addEventListener('touchstart', function(e) {
      begin(e.touches[0].clientX);
      e.preventDefault();
    }, { passive: false });
    window.addEventListener('touchmove', function(e) {
      if (!dragging) return;
      move(e.touches[0].clientX);
    }, { passive: false });
    window.addEventListener('touchend', end);

    diag('bind_done', {
      listeners: [
        'pointerdown',
        'pointermove',
        'pointerup',
        'pointercancel',
        'mousedown',
        'mousemove',
        'mouseup',
        'touchstart',
        'touchmove',
        'touchend',
      ],
      pointerdownBoundOn: 'slideThumb',
      dimensions: {
        trackWidth: slideTrack.clientWidth,
        thumbWidth: slideThumb.clientWidth,
      },
    });
  }

  // 非 Study->Rest 提醒保留背景星点，Study->Rest 用简洁卡片视觉
  if (starsContainer && effectiveReason !== 'to_rest_slide_confirm') {
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
