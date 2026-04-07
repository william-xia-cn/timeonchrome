// content.js - 注入每个页面，实现软性拦截提示、时间警告和活跃状态心跳
(function () {
  'use strict';

  // 防止重复注入
  if (window.__guardian_injected__) return;
  window.__guardian_injected__ = true;

  let warningShown = false;
  let warningTimer = null;
  let overlayEl = null;

  // ── 活跃状态检测 ────────────────────────────────────────────────────────────

  let lastInteractionTime = Date.now();
  let mediaPlaying = false;
  let audioContextActive = false;
  const INTERACTION_TIMEOUT_MS = 60 * 1000; // 60 秒无操作算 idle

  // 监听用户交互
  ['mousedown', 'keydown', 'scroll', 'touchstart'].forEach(evt => {
    document.addEventListener(evt, () => { lastInteractionTime = Date.now(); }, { passive: true, capture: true });
  });

  // 监听 <video>/<audio> 播放状态
  function attachMediaListeners(el) {
    el.addEventListener('play',  updateMediaState);
    el.addEventListener('pause', updateMediaState);
    el.addEventListener('ended', updateMediaState);
  }

  function updateMediaState() {
    const elements = Array.from(document.querySelectorAll('video, audio'));
    const htmlMediaPlaying = elements.some(el => !el.paused && !el.ended && el.readyState > 2);
    mediaPlaying = htmlMediaPlaying || audioContextActive;
  }

  // 对已有媒体元素挂钩
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

  // 返回当前可见状态（新模型：只要可见就计时，不管 active/passive）
  function getVisibilityState() {
    // 页面不可见 → 不发送心跳
    if (document.hidden) return 'hidden';
    // 页面可见 → 发送心跳（active 或 passive 都计网站时长）
    if (mediaPlaying) return 'passive';
    if (Date.now() - lastInteractionTime < INTERACTION_TIMEOUT_MS) return 'active';
    return 'visible';  // 可见但无交互（新状态）
  }

  // ── 心跳（每 10 秒向 background 报告状态）───────────────────────────────────

  let heartbeatInterval = null;

  function sendHeartbeat() {
    const state = getVisibilityState();
    
    // hidden 状态不发送心跳
    if (state === 'hidden') return;
    
    // 检查扩展上下文是否有效
    if (!chrome.runtime?.id) {
      console.log('[Guardian] Extension context invalidated');
      return;
    }
    
    // 发送心跳 - 只要可见就计网站时长
    chrome.runtime.sendMessage({ type: 'HEARTBEAT', state, domain: location.hostname }, (response) => {
      if (chrome.runtime.lastError) {
        const errorMsg = chrome.runtime.lastError.message || '';
        if (errorMsg.includes('Extension context invalidated')) {
          console.log('[Guardian] Extension invalidated');
        }
      }
    });
  }

  // 页面加载后立即发送一次心跳
  setTimeout(sendHeartbeat, 500);
  // 之后每 10 秒发送一次心跳
  heartbeatInterval = setInterval(sendHeartbeat, 10 * 1000);

  // ── 接收来自 background 的指令 ────────────────────────────────────────────

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === 'SHOW_WARNING') {
      showTimeWarning(msg.minutesLeft, msg.domain);
    } else if (msg.type === 'SHOW_OVERLAY') {
      showFullOverlay(msg.message, msg.reason);
    } else if (msg.type === 'REMOVE_OVERLAY') {
      removeOverlay();
    }
  });

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
      <button class="g-toast-close" onclick="this.parentElement.remove()">×</button>
    `;
    document.body.appendChild(toast);

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
        <div class="g-overlay-icon">${isWarn ? '⚠️' : '🔒'}</div>
        <h2 class="g-overlay-title">${isWarn ? '即将超出时间限制' : '访问受限'}</h2>
        <p class="g-overlay-msg">${message || '此网站已被家长限制访问'}</p>
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

})();
