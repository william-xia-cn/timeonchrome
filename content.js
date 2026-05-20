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
  let mediaKind = null;
  let audioContextActive = false;
  let pipActive = false;
  const MEDIA_POLL_INTERVAL_MS = 1000;
  const MEDIA_REAFFIRM_INTERVAL_MS = 30000;
  let lastMediaStateSentAt = 0;

  function sendMediaState(playing, isPiP = pipActive, kind = mediaKind, source = 'dom_media_event') {
    if (!chrome.runtime?.id) return false;
    chrome.runtime.sendMessage({ type: 'MEDIA_STATE', playing, isPiP, mediaKind: kind, source });
    lastMediaStateSentAt = Date.now();
    return true;
  }

  function updateMediaState(force = false, source = 'dom_media_event') {
    const elements = Array.from(document.querySelectorAll('video, audio'));
    const playingElements = elements.filter(el => !el.paused && !el.ended && el.readyState > 2);
    const htmlMediaPlaying = playingElements.length > 0;
    const newState = htmlMediaPlaying || audioContextActive;
    const newKind = playingElements.some(el => el.tagName?.toLowerCase() === 'video')
      ? 'video'
      : (newState ? 'audio' : null);
    const newPiP = !!document.pictureInPictureElement;
    if (newState !== mediaPlaying || newPiP !== pipActive || newKind !== mediaKind) {
      mediaPlaying = newState;
      mediaKind = newKind;
      pipActive = newPiP;
      return sendMediaState(mediaPlaying, pipActive, mediaKind, source);
    } else if (force && (newState || newPiP)) {
      return sendMediaState(newState, newPiP, newKind, source);
    }
    return false;
  }

  function pollMediaState() {
    const sent = updateMediaState(false, 'dom_media_poll');
    if (sent || !(mediaPlaying || pipActive)) return;
    if (Date.now() - lastMediaStateSentAt >= MEDIA_REAFFIRM_INTERVAL_MS) {
      updateMediaState(true, 'dom_media_poll');
    }
  }

  // 对已有媒体元素挂钩
  function attachMediaListeners(el) {
    el.addEventListener('play',  () => updateMediaState(false, 'dom_media_event'));
    el.addEventListener('pause', () => updateMediaState(false, 'dom_media_event'));
    el.addEventListener('ended', () => updateMediaState(false, 'dom_media_event'));
    el.addEventListener('enterpictureinpicture', () => updateMediaState(false, 'pip_api'));
    el.addEventListener('leavepictureinpicture', () => updateMediaState(false, 'pip_api'));
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
    updateMediaState(false, 'dom_media_event');
  });
  mediaObserver.observe(document.documentElement, { childList: true, subtree: true });

  // Some browser-controlled media documents and cross-world media events do not
  // reliably fire listener callbacks into the content script. Polling only
  // recomputes local media state. It sends immediately on state change, then
  // reaffirms unchanged active media at a low frequency for muted/media edge cases.
  setTimeout(() => updateMediaState(false, 'dom_media_poll'), 500);
  setInterval(pollMediaState, MEDIA_POLL_INTERVAL_MS);

  // Web Audio API 检测：拦截 AudioContext 构造
  function patchAudioContext(CtxClass) {
    if (!CtxClass) return;
    const Original = CtxClass;
    window[CtxClass.name] = function (...args) {
      const ctx = new Original(...args);
      ctx.addEventListener('statechange', () => {
        audioContextActive = ctx.state === 'running';
        updateMediaState(false, 'web_audio');
      });
      if (ctx.state === 'running') { audioContextActive = true; updateMediaState(false, 'web_audio'); }
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

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg.type === 'SHOW_WARNING') {
      showTimeWarning(msg.minutesLeft, msg.domain);
    } else if (msg.type === 'SHOW_OVERLAY') {
      showFullOverlay(msg.message, msg.reason);
    } else if (msg.type === 'REMOVE_OVERLAY') {
      removeOverlay();
    } else if (msg.type === 'EXIT_PIP') {
      exitPictureInPictureIfNeeded()
        .then((result) => sendResponse?.(result))
        .catch((err) => sendResponse?.({
          ok: false,
          hadPiP: !!document.pictureInPictureElement,
          exited: false,
          error: err?.message || String(err),
        }));
      return true;
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
    const hadPiP = !!document.pictureInPictureElement;
    try {
      if (document.pictureInPictureElement && document.exitPictureInPicture) {
        await document.exitPictureInPicture();
      }
    } catch (err) {
      updateMediaState();
      return {
        ok: false,
        hadPiP,
        exited: false,
        error: err?.message || String(err),
      };
    }
    updateMediaState();
    return {
      ok: true,
      hadPiP,
      exited: hadPiP && !document.pictureInPictureElement,
    };
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
          right: 16px;
          top: 16px;
          z-index: 2147483647;
          min-width: 300px;
          max-width: min(460px, calc(100vw - 24px));
          padding: 10px 14px;
          border-radius: 12px;
          border: 1px solid #86efac;
          background: #dcfce7;
          color: #166534;
          box-shadow: 0 10px 20px rgba(22, 101, 52, 0.18);
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
          font-size: 13px;
          line-height: 1.35;
          white-space: normal;
          word-break: break-word;
          pointer-events: none;
          opacity: 1;
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
    autoModePendingHideTimer = setTimeout(() => {
      clearAutoModePending();
    }, Math.max(1000, deadlineAt - Date.now() + 5000));
  }

  document.addEventListener('fullscreenchange', updateMediaState);
  document.addEventListener('webkitfullscreenchange', updateMediaState);

  function showAutoModeSuccess(payload) {
    if (Number(payload?.expiresAt) && Date.now() > Number(payload.expiresAt)) {
      clearAutoModePending();
      return;
    }
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
    const hideDuration = Math.min(Math.max(Number(payload?.displayDuration) || 4000, 1000), 10000);
    autoModePendingHideTimer = setTimeout(() => {
      clearAutoModePending();
    }, hideDuration);
  }

})();
