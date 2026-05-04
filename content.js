// content.js - 注入每个页面，实现软性拦截提示、时间警告和活跃状态心跳
(function () {
  'use strict';

  // 防止重复注入
  if (window.__guardian_injected__) return;
  window.__guardian_injected__ = true;
  const canRenderTopFrameUi = (() => {
    try {
      return window.top === window;
    } catch {
      return false;
    }
  })();

  let warningShown = false;
  let warningTimer = null;
  let overlayEl = null;
  let autoModePendingHost = null;
  let autoModePendingShadow = null;
  let autoModePendingTimer = null;
  let autoModePendingHideTimer = null;

  // ── 媒体状态检测（content 只负责报告这一件事）────────────────────────────────

  let mediaPlaying = false;
  let audioContextActive = false;
  let pipActive = false;

  function sendMediaState(playing, isPiP = pipActive) {
    if (!chrome.runtime?.id) return;
    chrome.runtime.sendMessage({ type: 'MEDIA_STATE', playing, isPiP });
  }

  function updateMediaState() {
    const elements = Array.from(document.querySelectorAll('video, audio'));
    const htmlMediaPlaying = elements.some(el => !el.paused && !el.ended && el.readyState > 2);
    const newState = htmlMediaPlaying || audioContextActive;
    const newPiP = !!document.pictureInPictureElement;
    if (newState !== mediaPlaying || newPiP !== pipActive) {
      mediaPlaying = newState;
      pipActive = newPiP;
      sendMediaState(mediaPlaying, pipActive);
    }
  }

  // 对已有媒体元素挂钩
  function attachMediaListeners(el) {
    el.addEventListener('play',  updateMediaState);
    el.addEventListener('pause', updateMediaState);
    el.addEventListener('ended', updateMediaState);
    el.addEventListener('enterpictureinpicture', updateMediaState);
    el.addEventListener('leavepictureinpicture', updateMediaState);
  }
  document.querySelectorAll('video, audio').forEach(attachMediaListeners);

  // 对动态插入的媒体元素挂钩
  const mediaObserver = new MutationObserver(mutations => {
    mutations.forEach(m => {
      m.addedNodes.forEach(node => {
        if (node.nodeType !== 1) return;
        if (node.matches('video, audio')) attachMediaListeners(node);
        node.querySelectorAll && node.querySelectorAll('video, audio').forEach(attachMediaListeners);
      });
    });
    updateMediaState();
  });
  mediaObserver.observe(document.documentElement, { childList: true, subtree: true });

  // Web Audio API 检测：拦截 AudioContext 构造
  function patchAudioContext(CtxClass) {
    if (!CtxClass) return;
    const Original = CtxClass;
    window[CtxClass.name] = function (...args) {
      const ctx = new Original(...args);
      ctx.addEventListener('statechange', () => {
        audioContextActive = ctx.state === 'running';
        updateMediaState();
      });
      if (ctx.state === 'running') { audioContextActive = true; updateMediaState(); }
      return ctx;
    };
    window[CtxClass.name].prototype = Original.prototype;
  }
  patchAudioContext(window.AudioContext);
  patchAudioContext(window.webkitAudioContext);

  // ── 标题变化追踪（复合型网站会话记录，Phase 2）────────────────────────────

  let lastTitle = document.title;
  let titleChangeTimer = null;

  function reportTitleChange(title) {
    if (!chrome.runtime?.id) return;
    chrome.runtime.sendMessage({ type: 'TITLE_CHANGE', title });
  }

  // 防抖：标题 1 秒内稳定后才上报（避免 SPA 过渡动画导致的频繁抖动）
  function onTitleMutated() {
    const newTitle = document.title;
    if (newTitle === lastTitle) return;
    clearTimeout(titleChangeTimer);
    titleChangeTimer = setTimeout(() => {
      if (document.title !== lastTitle) {
        lastTitle = document.title;
        reportTitleChange(lastTitle);
      }
    }, 1000);
  }

  // 监听 <title> 元素变化
  const titleEl = document.querySelector('title');
  if (titleEl) {
    new MutationObserver(onTitleMutated).observe(titleEl, { childList: true, characterData: true, subtree: true });
  }
  // 同时监听 document.head，处理 <title> 被替换的情况
  new MutationObserver(() => {
    const newTitleEl = document.querySelector('title');
    if (newTitleEl && newTitleEl !== titleEl) {
      new MutationObserver(onTitleMutated).observe(newTitleEl, { childList: true, characterData: true, subtree: true });
    }
    onTitleMutated();
  }).observe(document.head || document.documentElement, { childList: true });

  // ── 接收来自 background 的指令 ────────────────────────────────────────────

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === 'SHOW_WARNING') {
      showTimeWarning(msg.minutesLeft, msg.domain);
    } else if (msg.type === 'SHOW_OVERLAY') {
      showFullOverlay(msg.message, msg.reason);
    } else if (msg.type === 'REMOVE_OVERLAY') {
      removeOverlay();
    } else if (msg.type === 'EXIT_PIP') {
      exitPictureInPictureIfNeeded();
    } else if (msg.type === 'AUTO_MODE_PENDING_START') {
      if (!canRenderTopFrameUi) return;
      showAutoModePending(msg);
    } else if (msg.type === 'AUTO_MODE_PENDING_CANCEL') {
      if (!canRenderTopFrameUi) return;
      clearAutoModePending();
    } else if (msg.type === 'AUTO_MODE_PENDING_SUCCESS') {
      if (!canRenderTopFrameUi) return;
      showAutoModeSuccess(msg);
    }
  });

  // Notify background that content script is ready, so any pending auto-mode
  // notice (sent before listener was registered) can be re-delivered.
  try {
    chrome.runtime.sendMessage({ type: 'CONTENT_SCRIPT_READY' });
  } catch {}

  async function exitPictureInPictureIfNeeded() {
    try {
      if (document.pictureInPictureElement && document.exitPictureInPicture) {
        await document.exitPictureInPicture();
      }
    } catch {}
    updateMediaState();
  }

  // ── 时间警告（弹出角标提示，不影响使用）────────────────────────────────────

  function showTimeWarning(minutesLeft, domain) {
    if (warningShown) return;
    warningShown = true;

    const toast = document.createElement('div');
    toast.id = '__guardian_toast__';
    toast.innerHTML = `
      <div class="g-toast-icon">⏱</div>
      <div class="g-toast-body">
        <strong>${domain || '此网站'}</strong> 还有 <strong>${minutesLeft} 分钟</strong>到达今日上限
      </div>
      <button class="g-toast-close">×</button>
    `;
    document.body.appendChild(toast);
    const closeBtn = toast.querySelector('.g-toast-close');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => toast.remove());
    }

    // 10秒后自动消失
    setTimeout(() => toast.remove(), 10000);
  }

  // ── 全屏遮罩（强制拦截，warn 模式下有倒计时可继续）────────────────────────

  function showFullOverlay(message, reason) {
    if (overlayEl) return;

    overlayEl = document.createElement('div');
    overlayEl.id = '__guardian_overlay__';

    const isWarn = reason === 'warn';
    const countdownSeconds = 10;

    overlayEl.innerHTML = `
      <div class="g-overlay-box">
        <div class="g-overlay-icon">${isWarn ? '⏰' : '⏱'}</div>
        <h2 class="g-overlay-title">${isWarn ? '时间快到啦' : '时间提醒'}</h2>
        <p class="g-overlay-msg">${message || '这个网站当前不在可访问范围内'}</p>
        ${isWarn ? `
          <div class="g-overlay-countdown">
            <span id="__g_count__">${countdownSeconds}</span> 秒后自动关闭此页
          </div>
          <button class="g-overlay-btn" id="__g_continue__">我知道了，继续浏览</button>
        ` : ''}
        <div class="g-overlay-footer">TimeOnChrome</div>
      </div>
    `;

    document.documentElement.appendChild(overlayEl);

    if (isWarn) {
      let left = countdownSeconds;
      const countEl = document.getElementById('__g_count__');
      const countTimer = setInterval(() => {
        left--;
        if (countEl) countEl.textContent = left;
        if (left <= 0) {
          clearInterval(countTimer);
          window.close(); // 尝试关闭
          history.back(); // 退回
        }
      }, 1000);

      const continueBtn = document.getElementById('__g_continue__');
      if (continueBtn) {
        continueBtn.addEventListener('click', () => {
          clearInterval(countTimer);
          removeOverlay();
        });
      }
    }
  }

  function removeOverlay() {
    if (overlayEl) {
      overlayEl.remove();
      overlayEl = null;
    }
  }

  function formatDurationCN(seconds) {
    const secs = Math.max(0, Math.floor(Number(seconds) || 0));
    if (secs < 60) return `${secs}秒`;
    if (secs < 3600) return `${Math.floor(secs / 60)}分`;
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    return m > 0 ? `${h}小时${m}分` : `${h}小时`;
  }

  function ensureAutoModePendingBanner() {
    if (autoModePendingHost && autoModePendingShadow) {
      return autoModePendingShadow;
    }

    autoModePendingHost = document.getElementById('__toc_auto_mode_pending__');
    if (!autoModePendingHost) {
      autoModePendingHost = document.createElement('div');
      autoModePendingHost.id = '__toc_auto_mode_pending__';
      const parent = document.documentElement || document.body;
      if (!parent) return null;
      parent.appendChild(autoModePendingHost);
    }

    autoModePendingShadow = autoModePendingHost.shadowRoot || autoModePendingHost.attachShadow({ mode: 'open' });
    autoModePendingShadow.innerHTML = `
      <style>
        .toc-pending-banner {
          position: fixed;
          top: 16px;
          left: 50%;
          transform: translateX(-50%);
          z-index: 2147483647;
          min-width: 300px;
          max-width: min(420px, calc(100vw - 24px));
          padding: 8px 14px;
          border-radius: 999px;
          border: 1px solid rgba(255, 255, 255, 0.6);
          background: rgba(255, 255, 255, 0.62);
          color: #1f2937;
          box-shadow: 0 8px 20px rgba(15, 23, 42, 0.18);
          backdrop-filter: blur(6px);
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
          font-size: 12px;
          line-height: 1.2;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
      </style>
      <div class="toc-pending-banner" id="toc-pending-banner"></div>
    `;

    return autoModePendingShadow;
  }

  function clearPendingTimers() {
    if (autoModePendingTimer) {
      clearInterval(autoModePendingTimer);
      autoModePendingTimer = null;
    }
    if (autoModePendingHideTimer) {
      clearTimeout(autoModePendingHideTimer);
      autoModePendingHideTimer = null;
    }
  }

  function clearAutoModePending() {
    clearPendingTimers();
    if (autoModePendingHost) {
      autoModePendingHost.remove();
      autoModePendingHost = null;
      autoModePendingShadow = null;
    }
  }

  function showAutoModePending(payload) {
    const shadow = ensureAutoModePendingBanner();
    if (!shadow) return;

    clearPendingTimers();
    const deadlineAt = Number(payload?.deadlineAt) || Date.now();
    const targetMode = payload?.targetMode === 'study' ? 'study' : 'composite';
    const remainingCompositeSeconds = Number(payload?.remainingCompositeSeconds) || 0;
    const remainingCompositeTime = payload?.remainingCompositeTime || formatDurationCN(remainingCompositeSeconds);
    const bannerEl = shadow.getElementById('toc-pending-banner');
    if (!bannerEl) return;

    const updateCountdown = () => {
      const secondsRemaining = Math.max(0, Math.ceil((deadlineAt - Date.now()) / 1000));
      if (targetMode === 'study') {
        bannerEl.textContent = `正在使用学习网站 · ${secondsRemaining}秒后进入学习时间`;
      } else {
        bannerEl.textContent = `正在使用综合网站 · ${secondsRemaining}秒后进入综合时间 · 今日剩余 ${remainingCompositeTime}`;
      }
    };

    updateCountdown();
    autoModePendingTimer = setInterval(updateCountdown, 250);
  }

  function showAutoModeSuccess(payload) {
    const shadow = ensureAutoModePendingBanner();
    if (!shadow) return;

    clearPendingTimers();
    const targetMode = payload?.targetMode === 'study' ? 'study' : 'composite';
    const remainingCompositeSeconds = Number(payload?.remainingCompositeSeconds) || 0;
    const remainingCompositeTime = payload?.remainingCompositeTime || formatDurationCN(remainingCompositeSeconds);
    const bannerEl = shadow.getElementById('toc-pending-banner');
    if (!bannerEl) return;
    if (payload?.noticeText) {
      bannerEl.textContent = payload.noticeText;
    } else if (targetMode === 'study') {
      bannerEl.textContent = '已进入学习时间';
    } else {
      bannerEl.textContent = `已进入综合时间 · 今日剩余 ${remainingCompositeTime}`;
    }

    clearPendingTimers();
    const hideDuration = Number(payload?.displayDuration) || 2200;
    autoModePendingHideTimer = setTimeout(() => {
      clearAutoModePending();
    }, hideDuration);
  }

})();
