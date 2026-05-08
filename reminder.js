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

  // Dual-path elements (study_mode Case #5/#6)
  const dualPathCompositeSection = document.getElementById('dualPathCompositeSection');
  const dualPathCompositeBody = document.getElementById('dualPathCompositeBody');
  const slideConfirmWrapComposite = document.getElementById('slideConfirmWrapComposite');
  const slideTrackComposite = document.getElementById('slideTrackComposite');
  const slideThumbComposite = document.getElementById('slideThumbComposite');
  const slideHintComposite = document.getElementById('slideHintComposite');

  // Dual-path borrow elements (Case #6 restLocked variant)
  const dualPathBorrowSection = document.getElementById('dualPathBorrowSection');
  const dualPathBorrowBody = document.getElementById('dualPathBorrowBody');
  const slideConfirmWrapBorrow = document.getElementById('slideConfirmWrapBorrow');
  const slideTrackBorrow = document.getElementById('slideTrackBorrow');
  const slideThumbBorrow = document.getElementById('slideThumbBorrow');
  const slideHintBorrow = document.getElementById('slideHintBorrow');

  const CONFIRM_STANDARD_REASONS = new Set(['to_composite_confirm', 'to_rest_confirm']);
  const CONFIRM_INFO_REASONS = new Set(['to_composite_confirm', 'to_rest_confirm', 'to_rest_slide_confirm', 'study_mode']);
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
      icon: '🛡️', title: '此网站不可访问',
      subtitle: '该网站属于禁止访问范围。',
      actions: ['back']
    },
    study_mode: {
      icon: '🔍', title: '你正在打开未归类网站',
      subtitle: '继续后，这段时间会计入「休息时间」，不会计入「学习时间」。',
      actions: ['backToStudy']
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
      icon: '🎮', title: '你正在打开受限娱乐网站',
      subtitle: '继续后，这段时间会计入「休息时间」，不会计入「学习时间」。',
      actions: ['backToStudy']
    },
    restricted_study_mode: {
      icon: '🎮', title: '当前是学习模式',
      subtitle: '这是受限娱乐网站，学习模式下不可访问',
      actions: ['switchToRest', 'back']
    },
    quota_composite: {
      icon: '⏱', title: '今日综合时间已用完',
      subtitle: '综合时间不会自动占用休息时间。如果仍要继续访问，可以进入休息时间继续。',
      actions: ['enterRestContinue', 'backGeneric']
    },
    quota_composite_and_rest: {
      icon: '⏱', title: '今日综合时间和休息时间均已用完',
      subtitle: '当前不能继续访问。请返回。',
      actions: ['backGeneric']
    },
    quota_rest: {
      icon: '⏰', title: '今天的休息时间用完啦',
      subtitle: '放松过了，切换到学习模式继续加油！',
      actions: ['switchToStudy', 'viewDetails']
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
      actions: ['viewDetails']
    },
    quota: {
      icon: '🌙', title: '今天的上网时间用完啦',
      subtitle: '休息一下，明天继续！',
      actions: ['viewDetails']
    },
    schedule: {
      icon: '🌙', title: '现在是休息时段',
      subtitle: '到点了再来！',
      actions: ['back']
    }
  };

  // 操作按钮定义
  const actionDefs = {
    enterRestContinue: {
      label: '进入休息继续', style: 'primary',
      handler: function() {
        chrome.runtime.sendMessage({ type: 'SWITCH_TO_REST' }, function() {
          showStatus('已进入休息时间，正在跳转…', 'success');
          if (domain && domain !== 'all') {
            setTimeout(function() { window.location.href = 'https://' + domain; }, 600);
          }
        });
      }
    },
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

  // V0: All known reasons must map to explicit configs.
  // Unknown/missing reason → safe error/cancel-only state, not a generic product page.
  var V0_KNOWN_REASONS = new Set([
    'unsafe', 'study_mode', 'to_composite_confirm', 'to_rest_confirm',
    'to_rest_slide_confirm', 'restricted_study_mode',
    'quota_composite', 'quota_composite_and_rest', 'quota_rest',
    'quota_study', 'quota_undetermined', 'quota_online', 'quota', 'schedule'
  ]);

  var config;
  var isUnknownReason = false;
  if (V0_KNOWN_REASONS.has(effectiveReason)) {
    config = configs[effectiveReason] || configs.unsafe;
  } else {
    isUnknownReason = true;
    config = {
      icon: '⚠️', title: '页面异常',
      subtitle: '无法识别当前提醒类型。请返回重试。',
      actions: ['backGeneric']
    };
    console.warn('[reminder] unknown reason:', reason, 'url:', location.href);
  }
  if (effectiveReason === 'to_rest_slide_confirm') {
    config = {
      ...config,
      actions: [originMode === 'study' ? 'backToStudy' : 'backGeneric'],
    };
  }

  // Quota-aware rendering for Rest exhausted variants (non-study_mode reasons)
  var restExhaustedOverride = null;
  var restLockedFromUrl = params.get('restLocked') === '1';
  if (restLockedFromUrl && effectiveReason !== 'study_mode' && (effectiveReason === 'to_rest_slide_confirm' || effectiveReason === 'to_rest_confirm')) {
    var override = null;
    if (effectiveReason === 'to_rest_slide_confirm') {
      // Restricted + Rest exhausted: borrow + restricted warning, no Composite apply
      override = {
        icon: config.icon,
        title: '你正在打开受限娱乐网站',
        subtitle: '该网站不能申请使用综合时间。\n\n今天的休息时间已用完。如果仍要继续访问，可以向明天借用休息时间。',
        actions: ['borrowTime', 'backToStudy']
      };
    } else if (effectiveReason === 'to_rest_confirm') {
      // Composite-origin + Rest exhausted: borrow + return
      override = {
        icon: config.icon,
        title: config.title,
        subtitle: config.subtitle + '\n\n今天的休息时间已用完。如果仍要继续访问，可以向明天借用休息时间。',
        actions: ['borrowTime', 'backGeneric']
      };
    }
    if (override) {
      config = override;
    }
  }

  if (mainIcon) mainIcon.textContent = config.icon;
  if (mainTitle) mainTitle.textContent = config.title;
  if (subtitle) subtitle.textContent = config.subtitle;

  if (CONFIRM_STANDARD_REASONS.has(effectiveReason)) {
    document.body.classList.add('confirm-standard');
  }

  if (CONFIRM_INFO_REASONS.has(effectiveReason) && effectiveReason !== 'study_mode' && restQuotaLine) {
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
    bindSlideConfirm({
      onConfirm: function() {
        chrome.runtime.sendMessage({ type: 'SWITCH_TO_REST' }, function(result) {
          showStatus('已切换到休息模式，正在跳转…', 'success');
          if (domain && domain !== 'all') {
            setTimeout(function() { window.location.href = 'https://' + domain; }, 600);
          }
        });
      },
      dragText: '确认进入休息时间',
      releaseText: '松手确认',
      boundFlag: 'slideBound',
    });

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

  // Study → Unclassified dual-path (Case #5/#6)
  if (effectiveReason === 'study_mode') {
    document.body.classList.add('study-rest-reminder');

    // Override config to prevent legacy button rendering (sliders handle rest/apply/borrow)
    config.subtitle = '继续后，这段时间会计入「休息时间」，不会计入「学习时间」。';
    config.actions = ['backToStudy'];

    // Default path: enter rest
    if (subtitle) {
      subtitle.textContent = config.subtitle;
    }

    // Show rest quota line
    if (restQuotaLine) {
      restQuotaLine.textContent = '剩余时间计算中...';
      restQuotaLine.style.display = 'block';
      chrome.runtime.sendMessage({ type: 'GET_RUNTIME_MODE_STATUS' }, function(status) {
        if (!restQuotaLine) return;
        if (!status) {
          restQuotaLine.textContent = '剩余时间：暂不可用';
          return;
        }
        const remainingRest = formatDurationCN(status.restRemainingSeconds || 0);
        restQuotaLine.textContent = `今日休息时间剩余：${remainingRest}`;
      });
    }

    // Bind rest slider
    bindSlideConfirm({
      onConfirm: function() {
        chrome.runtime.sendMessage({ type: 'SWITCH_TO_REST' }, function(result) {
          showStatus('已切换到休息模式，正在跳转…', 'success');
          if (domain && domain !== 'all') {
            setTimeout(function() { window.location.href = 'https://' + domain; }, 600);
          }
        });
      },
      dragText: '确认进入休息时间',
      releaseText: '松手确认',
      boundFlag: 'slideBound',
    });

    // Application path: apply composite time
    if (dualPathCompositeSection) dualPathCompositeSection.style.display = 'block';
    if (slideConfirmWrapComposite) slideConfirmWrapComposite.style.display = 'block';

    // Bind composite slider
    bindSlideConfirm({
      track: slideTrackComposite,
      thumb: slideThumbComposite,
      hint: slideHintComposite,
      wrap: slideConfirmWrapComposite,
      onConfirm: function() {
        chrome.runtime.sendMessage({ type: 'ADD_TO_COMPOSITE_LIST', domain: domain }, function(result) {
          if (result && result.added) {
            chrome.runtime.sendMessage({ type: 'SEND_CLOUD_EVENT', eventType: 'composite_add', domain: domain });
            chrome.runtime.sendMessage({ type: 'GET_RUNTIME_MODE_STATUS' }, function(status) {
              const remainingComposite = status ? formatDurationCN(status.compositeRemainingSeconds || 0) : '计算中';
              showStatus(`已允许今天使用综合时间访问 · 今日剩余 ${remainingComposite}`, 'success');
              if (domain && domain !== 'all') {
                setTimeout(function() { window.location.href = 'https://' + domain; }, 600);
              }
            });
          } else if (result && result.alreadyPresent) {
            showStatus('该网站已在列表中', 'info');
          } else {
            showStatus('操作失败，请稍后重试', 'error');
          }
        });
      },
      dragText: '申请使用综合时间',
      releaseText: '松手确认',
      boundFlag: 'compositeSlideBound',
    });

    // Rest exhausted variant no longer exposes borrowing in V1-minimal.
  }

  // Composite → Unclassified/Restricted dual-path (Case #14/#15/#16/#17)
  if (effectiveReason === 'to_rest_confirm') {
    document.body.classList.add('study-rest-reminder');
    var siteType = params.get('siteType') || 'unclassified';
    var isRestrictedSite = siteType === 'restricted';

    // Override config to prevent legacy button rendering (sliders handle rest/apply/borrow)
    if (isRestrictedSite) {
      config.title = '你正在打开受限娱乐网站';
      config.subtitle = '继续后，这段时间会计入「休息时间」，不会计入「综合时间」。';
    } else {
      config.title = '你正在打开未归类网站';
      config.subtitle = '继续后，这段时间会计入「休息时间」，不会计入「综合时间」。';
    }
    // Re-apply title to DOM after dual-path override (fixes T-R4/T-R5 title mismatch)
    if (mainTitle) mainTitle.textContent = config.title;
    config.actions = ['backGeneric'];

    // Default path: enter rest
    if (subtitle) {
      subtitle.textContent = config.subtitle;
    }

    // Show rest quota line
    if (restQuotaLine) {
      restQuotaLine.textContent = '剩余时间计算中...';
      restQuotaLine.style.display = 'block';
      chrome.runtime.sendMessage({ type: 'GET_RUNTIME_MODE_STATUS' }, function(status) {
        if (!restQuotaLine) return;
        if (!status) {
          restQuotaLine.textContent = '剩余时间：暂不可用';
          return;
        }
        const remainingRest = formatDurationCN(status.restRemainingSeconds || 0);
        restQuotaLine.textContent = `今日休息时间剩余：${remainingRest}`;
      });
    }

    // Bind rest slider (default path for both unclassified and restricted)
    bindSlideConfirm({
      onConfirm: function() {
        chrome.runtime.sendMessage({ type: 'SWITCH_TO_REST' }, function(result) {
          showStatus('已切换到休息模式，正在跳转…', 'success');
          if (domain && domain !== 'all') {
            setTimeout(function() { window.location.href = 'https://' + domain; }, 600);
          }
        });
      },
      dragText: '确认进入休息时间',
      releaseText: '松手确认',
      boundFlag: 'slideBound',
    });

    // Application path: apply composite time (ONLY for unclassified sites)
    if (!isRestrictedSite) {
      if (dualPathCompositeSection) dualPathCompositeSection.style.display = 'block';
      if (slideConfirmWrapComposite) slideConfirmWrapComposite.style.display = 'block';

      // Bind composite slider
      bindSlideConfirm({
        track: slideTrackComposite,
        thumb: slideThumbComposite,
        hint: slideHintComposite,
        wrap: slideConfirmWrapComposite,
        onConfirm: function() {
          chrome.runtime.sendMessage({ type: 'ADD_TO_COMPOSITE_LIST', domain: domain }, function(result) {
            if (result && result.added) {
              chrome.runtime.sendMessage({ type: 'SEND_CLOUD_EVENT', eventType: 'composite_add', domain: domain });
              chrome.runtime.sendMessage({ type: 'GET_RUNTIME_MODE_STATUS' }, function(status) {
                const remainingComposite = status ? formatDurationCN(status.compositeRemainingSeconds || 0) : '计算中';
                showStatus(`已允许今天使用综合时间访问 · 今日剩余 ${remainingComposite}`, 'success');
                if (domain && domain !== 'all') {
                  setTimeout(function() { window.location.href = 'https://' + domain; }, 600);
                }
              });
            } else if (result && result.alreadyPresent) {
              showStatus('该网站已在列表中', 'info');
            } else {
              showStatus('操作失败，请稍后重试', 'error');
            }
          });
        },
        dragText: '申请使用综合时间',
        releaseText: '松手确认',
        boundFlag: 'compositeSlideBound',
      });
    } else {
      // Restricted site: show "cannot apply composite" notice
      if (dualPathCompositeSection) {
        dualPathCompositeSection.style.display = 'block';
        if (dualPathCompositeBody) {
          dualPathCompositeBody.textContent = '该网站不能申请使用综合时间。';
        }
        if (slideConfirmWrapComposite) slideConfirmWrapComposite.style.display = 'none';
      }
    }

    // Rest exhausted variant no longer exposes borrowing in V1-minimal.
  }

  // V0: msg is a legacy blocked.js parameter. Canonical reason configs define all copy.
  // Never render msg — it can override the intended page semantics visually.
  var customMsgEl = document.getElementById('customMsg');
  if (customMsgEl) customMsgEl.style.display = 'none';
  if (domainEl) {
    if (CONFIRM_STANDARD_REASONS.has(effectiveReason) || effectiveReason === 'to_rest_slide_confirm' || effectiveReason === 'study_mode') {
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

  function bindSlideConfirm(options = {}) {
    const {
      track = slideTrack,
      thumb = slideThumb,
      hint = slideHint,
      wrap = slideConfirmWrap,
      onConfirm,
      dragText = '拖动到右侧确认进入休息时间',
      releaseText = '松手确认进入休息时间',
      boundFlag = 'slideBound',
    } = options;

    if (!track || !thumb) return;

    // Use a per-instance bound flag if provided
    const boundKey = boundFlag;
    if (window[boundKey]) return;
    window[boundKey] = true;

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
      return Math.max(0, track.clientWidth - thumb.clientWidth);
    }

    function setThumb(left) {
      var max = getMaxOffset();
      var clamped = Math.max(0, Math.min(max, left));
      thumb.style.left = clamped + 'px';
      if (hint) {
        hint.textContent = clamped >= max * 0.92 ? releaseText : dragText;
      }
      if (thumb) {
        thumb.textContent = clamped >= max * 0.92 ? releaseText : dragText;
      }
      return { clamped: clamped, max: max };
    }

    function begin(clientX) {
      if (switched) return;
      dragging = true;
      startX = clientX;
      baseLeft = parseFloat(thumb.style.left || '0') || 0;
      diag('begin_drag', { clientX, baseLeft, trackWidth: track.clientWidth, thumbWidth: thumb.clientWidth });
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

    function end() {
      if (!dragging) return;
      dragging = false;
      var pos = parseFloat(thumb.style.left || '0') || 0;
      var max = getMaxOffset();
      const passed = pos >= max * 0.92;
      diag('pointer_up', { pos, max, threshold: max * 0.92, passedThreshold: passed });
      if (pos >= max * 0.92) {
        thumb.style.left = max + 'px';
        if (onConfirm) onConfirm();
      } else {
        thumb.style.left = '0px';
        if (hint) hint.textContent = dragText;
      }
    }

    thumb.style.left = '0px';
    if (hint) hint.textContent = dragText;
    if (wrap) wrap.style.display = 'block';

    // Pointer events: primary path for desktop Chrome + touch/pen.
    thumb.addEventListener('pointerdown', function(e) {
      activePointerId = e.pointerId;
      diag('pointer_down', {
        pointerId: e.pointerId,
        clientX: e.clientX,
        targetId: e.target?.id || '',
        targetClass: e.target?.className || '',
      });
      begin(e.clientX);
      if (thumb.setPointerCapture) {
        let captureOk = false;
        try {
          thumb.setPointerCapture(e.pointerId);
          captureOk = true;
        } catch (err) {
          diag('set_pointer_capture_error', { message: err?.message || String(err) });
        }
        diag('set_pointer_capture', { pointerId: e.pointerId, ok: captureOk });
      }
      e.preventDefault();
    });
    thumb.addEventListener('pointermove', function(e) {
      if (!dragging) return;
      if (activePointerId !== null && e.pointerId !== activePointerId) return;
      move(e.clientX);
      e.preventDefault();
    });
    thumb.addEventListener('pointerup', function(e) {
      if (activePointerId !== null && e.pointerId !== activePointerId) return;
      end();
      if (thumb.releasePointerCapture) {
        try { thumb.releasePointerCapture(e.pointerId); } catch {}
      }
      activePointerId = null;
      e.preventDefault();
    });
    thumb.addEventListener('pointercancel', function(e) {
      if (activePointerId !== null && e.pointerId !== activePointerId) return;
      dragging = false;
      activePointerId = null;
      thumb.style.left = '0px';
      if (hint) hint.textContent = dragText;
      diag('pointer_cancel', {
        pointerId: e.pointerId,
        reason: e.type,
      });
    });

    // Mouse fallback for older environments.
    thumb.addEventListener('mousedown', function(e) {
      begin(e.clientX);
      e.preventDefault();
    });
    window.addEventListener('mousemove', function(e) { move(e.clientX); });
    window.addEventListener('mouseup', end);

    // Touch fallback for older mobile engines.
    thumb.addEventListener('touchstart', function(e) {
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
        trackWidth: track.clientWidth,
        thumbWidth: thumb.clientWidth,
      },
    });
  }

  // 非 Study->Rest 提醒保留背景星点，Study->Rest 用简洁卡片视觉
  if (starsContainer && effectiveReason !== 'to_rest_slide_confirm' && effectiveReason !== 'study_mode') {
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
