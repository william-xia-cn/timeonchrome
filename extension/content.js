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
  let modeNoticeHost = null;
  let modeNoticeShadow = null;
  let modeNoticeCountdownTimer = null;
  let modeNoticeHideTimer = null;
  let pipPolicyNoticeHost = null;
  let pipPolicyNoticeShadow = null;
  let pipPolicyNoticeHideTimer = null;
  const PIP_POLICY_NOTICE_TEXT = 'TimeOnChrome 当前禁止 PiP 播放，后续版本会陆续放开。';
  const PIP_POLICY_NOTICE_DEFAULT_MS = 5000;

  // ── 媒体状态检测（content 只负责报告这一件事）────────────────────────────────

  let mediaPlaying = false;
  let mediaKind = null;
  let audioContextActive = false;
  let pipActive = false;
  let suppressPiPLeaveReportUntil = 0;
  const MEDIA_POLL_INTERVAL_MS = 1000;
  const MEDIA_REAFFIRM_INTERVAL_MS = 30000;
  let lastMediaStateSentAt = 0;

  function sendMediaState(playing, isPiP = pipActive, kind = mediaKind, source = 'dom_media_event') {
    if (!chrome.runtime?.id) return false;
    chrome.runtime.sendMessage({ type: 'MEDIA_STATE', playing, isPiP, mediaKind: kind, source });
    lastMediaStateSentAt = Date.now();
    return true;
  }

  function readMediaSnapshot() {
    const elements = Array.from(document.querySelectorAll('video, audio'));
    const playingElements = elements.filter(el => !el.paused && !el.ended && el.readyState > 2);
    const htmlMediaPlaying = playingElements.length > 0;
    const newState = htmlMediaPlaying || audioContextActive;
    const newKind = playingElements.some(el => el.tagName?.toLowerCase() === 'video')
      ? 'video'
      : (newState ? 'audio' : null);
    const newPiP = !!document.pictureInPictureElement;
    return { playing: newState, kind: newKind, isPiP: newPiP };
  }

  function rememberMediaSnapshot(snapshot) {
    mediaPlaying = snapshot.playing;
    mediaKind = snapshot.kind;
    pipActive = snapshot.isPiP;
  }

  function updateMediaState(force = false, source = 'dom_media_event') {
    const snapshot = readMediaSnapshot();
    const newState = snapshot.playing;
    const newKind = snapshot.kind;
    const newPiP = snapshot.isPiP;
    if (newState !== mediaPlaying || newPiP !== pipActive || newKind !== mediaKind) {
      rememberMediaSnapshot(snapshot);
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
  function handlePictureInPictureLeave() {
    if (Date.now() <= suppressPiPLeaveReportUntil) {
      rememberMediaSnapshot(readMediaSnapshot());
      return;
    }
    updateMediaState(false, 'pip_api');
  }

  function attachMediaListeners(el) {
    el.addEventListener('play',  () => updateMediaState(false, 'dom_media_event'));
    el.addEventListener('pause', () => updateMediaState(false, 'dom_media_event'));
    el.addEventListener('ended', () => updateMediaState(false, 'dom_media_event'));
    el.addEventListener('enterpictureinpicture', () => updateMediaState(false, 'pip_api'));
    el.addEventListener('leavepictureinpicture', handlePictureInPictureLeave);
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

  function wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async function waitForPictureInPictureExit(timeoutMs = 1000) {
    const deadline = Date.now() + timeoutMs;
    while (document.pictureInPictureElement && Date.now() < deadline) {
      await wait(50);
    }
    return !document.pictureInPictureElement;
  }

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
        .then((result) => {
          if (result?.hadPiP === true && result?.exited === true && msg.showPolicyNotice !== false) {
            result.notice = showPiPPolicyNotice({
              text: msg.noticeText || PIP_POLICY_NOTICE_TEXT,
              durationMs: msg.noticeDurationMs,
            });
          }
          sendResponse?.(result);
        })
        .catch((err) => sendResponse?.({
          ok: false,
          hadPiP: !!document.pictureInPictureElement,
          exited: false,
          error: err?.message || String(err),
        }));
      return true;
    } else if (msg.type === 'AUTO_MODE_PENDING_START') {
      if (!canRenderTopFrameUi) {
        sendResponse?.({ ok: false, handled: true, rendered: false, reason: 'not_top_frame' });
        return;
      }
      sendResponse?.(showModeNoticePending(msg));
    } else if (msg.type === 'AUTO_MODE_PENDING_CANCEL') {
      if (!canRenderTopFrameUi) {
        sendResponse?.({ ok: false, handled: true, rendered: false, reason: 'not_top_frame' });
        return;
      }
      clearModeNotice();
      sendResponse?.({ ok: true, handled: true, rendered: false, reason: 'cleared' });
    } else if (msg.type === 'AUTO_MODE_PENDING_SUCCESS') {
      if (!canRenderTopFrameUi) {
        sendResponse?.({ ok: false, handled: true, rendered: false, reason: 'not_top_frame' });
        return;
      }
      sendResponse?.(showModeNoticeSuccess(msg));
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
        suppressPiPLeaveReportUntil = Date.now() + 2000;
        await document.exitPictureInPicture();
      }
    } catch (err) {
      suppressPiPLeaveReportUntil = 0;
      updateMediaState();
      return {
        ok: false,
        hadPiP,
        exited: false,
        error: err?.message || String(err),
      };
    }
    const exited = hadPiP ? await waitForPictureInPictureExit() : false;
    rememberMediaSnapshot(readMediaSnapshot());
    return {
      ok: !hadPiP || exited,
      hadPiP,
      exited: hadPiP && exited,
      error: hadPiP && !exited ? 'pip_exit_not_confirmed' : undefined,
    };
  }

  function clearPiPPolicyNotice() {
    if (pipPolicyNoticeHideTimer) {
      clearTimeout(pipPolicyNoticeHideTimer);
      pipPolicyNoticeHideTimer = null;
    }
    if (pipPolicyNoticeHost) {
      pipPolicyNoticeHost.remove();
      pipPolicyNoticeHost = null;
      pipPolicyNoticeShadow = null;
    }
  }

  function ensurePiPPolicyNotice() {
    if (pipPolicyNoticeHost && pipPolicyNoticeShadow) return pipPolicyNoticeShadow;
    pipPolicyNoticeHost = document.getElementById('__toc_pip_policy_notice__');
    if (!pipPolicyNoticeHost) {
      pipPolicyNoticeHost = document.createElement('div');
      pipPolicyNoticeHost.id = '__toc_pip_policy_notice__';
      const parent = document.documentElement || document.body;
      if (!parent) return null;
      parent.appendChild(pipPolicyNoticeHost);
    }
    pipPolicyNoticeShadow = pipPolicyNoticeHost.shadowRoot || pipPolicyNoticeHost.attachShadow({ mode: 'open' });
    pipPolicyNoticeShadow.innerHTML = `
      <style>
        .toc-pip-policy-notice {
          position: fixed;
          top: 24px;
          left: 50%;
          transform: translateX(-50%);
          z-index: 2147483647;
          box-sizing: border-box;
          width: min(680px, calc(100vw - 28px));
          min-height: 96px;
          display: grid;
          grid-template-columns: auto 1fr auto;
          gap: 16px;
          align-items: center;
          padding: 20px 22px;
          border-radius: 8px;
          border: 2px solid #b91c1c;
          background: #dc2626;
          color: #ffffff;
          box-shadow: 0 22px 48px rgba(127, 29, 29, 0.36);
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
          pointer-events: auto;
        }
        .toc-pip-policy-icon {
          width: 40px;
          height: 40px;
          border-radius: 50%;
          display: inline-grid;
          place-items: center;
          background: #ffffff;
          color: #b91c1c;
          font-weight: 800;
          font-size: 24px;
          line-height: 1;
        }
        .toc-pip-policy-title {
          margin: 0 0 6px;
          font-size: 18px;
          font-weight: 700;
          line-height: 1.25;
        }
        .toc-pip-policy-body {
          margin: 0;
          font-size: 15px;
          line-height: 1.45;
          color: #ffffff;
        }
        .toc-pip-policy-close {
          border: 0;
          background: transparent;
          color: #ffffff;
          cursor: pointer;
          font-size: 26px;
          line-height: 1;
          padding: 0 4px;
          opacity: 0.9;
        }
      </style>
      <section class="toc-pip-policy-notice" role="status" aria-live="polite">
        <div class="toc-pip-policy-icon">!</div>
        <div>
          <p class="toc-pip-policy-title">PiP 已被关闭</p>
          <p class="toc-pip-policy-body" id="toc-pip-policy-body"></p>
        </div>
        <button class="toc-pip-policy-close" type="button" aria-label="关闭">×</button>
      </section>
    `;
    const closeBtn = pipPolicyNoticeShadow.querySelector('.toc-pip-policy-close');
    if (closeBtn) closeBtn.addEventListener('click', clearPiPPolicyNotice);
    return pipPolicyNoticeShadow;
  }

  function showPiPPolicyNotice({ text = PIP_POLICY_NOTICE_TEXT, durationMs = PIP_POLICY_NOTICE_DEFAULT_MS } = {}) {
    if (!canRenderTopFrameUi) return { ok: false, rendered: false, reason: 'not_top_frame' };
    const shadow = ensurePiPPolicyNotice();
    if (!shadow) return { ok: false, rendered: false, reason: 'notice_host_unavailable' };
    const body = shadow.getElementById('toc-pip-policy-body');
    if (!body) return { ok: false, rendered: false, reason: 'notice_body_unavailable' };
    body.textContent = text || PIP_POLICY_NOTICE_TEXT;
    if (pipPolicyNoticeHideTimer) clearTimeout(pipPolicyNoticeHideTimer);
    const hideMs = Math.min(Math.max(Number(durationMs) || PIP_POLICY_NOTICE_DEFAULT_MS, 4000), 6000);
    pipPolicyNoticeHideTimer = setTimeout(clearPiPPolicyNotice, hideMs);
    return { ok: true, rendered: true, noticeType: 'PIP_POLICY_NOTICE', durationMs: hideMs };
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

  function ensureModeNoticeBanner() {
    if (modeNoticeHost && modeNoticeShadow) {
      return modeNoticeShadow;
    }

    modeNoticeHost = document.getElementById('__toc_mode_notice__');
    if (!modeNoticeHost) {
      modeNoticeHost = document.createElement('div');
      modeNoticeHost.id = '__toc_mode_notice__';
      const parent = document.documentElement || document.body;
      if (!parent) return null;
      parent.appendChild(modeNoticeHost);
    }

    modeNoticeShadow = modeNoticeHost.shadowRoot || modeNoticeHost.attachShadow({ mode: 'open' });
    modeNoticeShadow.innerHTML = `
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

    return modeNoticeShadow;
  }

  function clearPendingTimers() {
    if (modeNoticeCountdownTimer) {
      clearInterval(modeNoticeCountdownTimer);
      modeNoticeCountdownTimer = null;
    }
    if (modeNoticeHideTimer) {
      clearTimeout(modeNoticeHideTimer);
      modeNoticeHideTimer = null;
    }
  }

  function clearModeNotice() {
    clearPendingTimers();
    if (modeNoticeHost) {
      modeNoticeHost.remove();
      modeNoticeHost = null;
      modeNoticeShadow = null;
    }
  }

  function showModeNoticePending(payload) {
    const shadow = ensureModeNoticeBanner();
    if (!shadow) {
      return { ok: false, handled: true, rendered: false, reason: 'notice_host_unavailable' };
    }

    clearPendingTimers();
    const deadlineAt = Number(payload?.deadlineAt) || Date.now();
    const targetMode = payload?.targetMode === 'study' ? 'study' : 'composite';
    const remainingCompositeSeconds = Number(payload?.remainingCompositeSeconds) || 0;
    const remainingCompositeTime = payload?.remainingCompositeTime || formatDurationCN(remainingCompositeSeconds);
    const remainingStudyTime = payload?.remainingStudyTime || '不限';
    const bannerEl = shadow.getElementById('toc-pending-banner');
    if (!bannerEl) {
      return { ok: false, handled: true, rendered: false, reason: 'notice_banner_unavailable' };
    }

    const updateCountdown = () => {
      const secondsRemaining = Math.max(0, Math.ceil((deadlineAt - Date.now()) / 1000));
      if (targetMode === 'study') {
        bannerEl.textContent = `正在使用学习网站 · ${secondsRemaining}秒后进入学习时间`;
      } else {
        bannerEl.textContent = `正在使用综合网站 · ${secondsRemaining}秒后进入综合时间 · 今日剩余 ${remainingCompositeTime}`;
      }
    };

    updateCountdown();
    modeNoticeCountdownTimer = setInterval(updateCountdown, 250);
    modeNoticeHideTimer = setTimeout(() => {
      clearModeNotice();
    }, Math.max(1000, deadlineAt - Date.now() + 5000));
    return { ok: true, handled: true, rendered: true, noticeType: 'AUTO_MODE_PENDING_START' };
  }

  document.addEventListener('fullscreenchange', updateMediaState);
  document.addEventListener('webkitfullscreenchange', updateMediaState);

  function showModeNoticeSuccess(payload) {
    if (Number(payload?.expiresAt) && Date.now() > Number(payload.expiresAt)) {
      clearModeNotice();
      return { ok: false, handled: true, rendered: false, reason: 'expired_notice' };
    }
    const shadow = ensureModeNoticeBanner();
    if (!shadow) {
      return { ok: false, handled: true, rendered: false, reason: 'notice_host_unavailable' };
    }

    clearPendingTimers();
    const targetMode = payload?.targetMode === 'study' ? 'study' : 'composite';
    const remainingCompositeSeconds = Number(payload?.remainingCompositeSeconds) || 0;
    const remainingCompositeTime = payload?.remainingCompositeTime || formatDurationCN(remainingCompositeSeconds);
    const bannerEl = shadow.getElementById('toc-pending-banner');
    if (!bannerEl) {
      return { ok: false, handled: true, rendered: false, reason: 'notice_banner_unavailable' };
    }
    if (payload?.noticeText) {
      bannerEl.textContent = payload.noticeText;
    } else if (targetMode === 'study') {
      bannerEl.textContent = `你正在打开学习网站 · 即将进入学习模式 · 今日剩余 ${remainingStudyTime}`;
    } else {
      bannerEl.textContent = `你正在打开综合/待归类网站 · 即将进入综合模式 · 今日剩余 ${remainingCompositeTime}`;
    }

    clearPendingTimers();
    const hideDuration = Math.min(Math.max(Number(payload?.displayDuration) || 4000, 1000), 10000);
    modeNoticeHideTimer = setTimeout(() => {
      clearModeNotice();
    }, hideDuration);
    return { ok: true, handled: true, rendered: true, noticeType: 'AUTO_MODE_PENDING_SUCCESS' };
  }

})();
