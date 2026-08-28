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
  let restReminderHost = null;
  let restReminderShadow = null;
  let restReminderDialog = null;
  let restReminderCountdownTimer = null;
  let restReminderToken = null;
  let restReminderResolving = false;
  let restReminderResolveAction = null;
  let restReminderPausedMedia = [];
  let restReminderPreviousOverflow = '';
  let restReminderPreviousFocus = null;
  let pipPolicyNoticeHost = null;
  let pipPolicyNoticeShadow = null;
  let pipPolicyNoticeHideTimer = null;
  const PIP_POLICY_NOTICE_TEXT = 'TimeOnChrome 当前禁止 PiP 播放，后续版本会陆续放开。';
  const PIP_POLICY_NOTICE_DEFAULT_MS = 5000;

  // ── 媒体状态检测（content 只负责报告这一件事）────────────────────────────────

  let mediaPlaying = false;
  let mediaKind = null;
  let mediaAudible = false;
  let visibleMediaCount = 0;
  let audioContextActive = false;
  let pipActive = false;
  let suppressPiPLeaveReportUntil = 0;
  const MEDIA_POLL_INTERVAL_MS = 1000;
  const MEDIA_REAFFIRM_INTERVAL_MS = 30000;
  const SHADOW_ROOT_DISCOVERY_INTERVAL_MS = 30000;
  let lastMediaStateSentAt = 0;
  let lastShadowRootDiscoveryAt = 0;
  const mediaRoots = new Set([document]);
  const attachedMediaElements = new WeakSet();

  function sendMediaState(playing, isPiP = pipActive, kind = mediaKind, source = 'dom_media_event', snapshot = null) {
    if (!chrome.runtime?.id) return false;
    chrome.runtime.sendMessage({
      type: 'MEDIA_STATE',
      playing,
      isPiP,
      mediaKind: kind,
      audible: snapshot?.audible === true,
      visibleMediaCount: Number(snapshot?.visibleMediaCount) || 0,
      documentVisible: document.visibilityState === 'visible',
      source,
    });
    lastMediaStateSentAt = Date.now();
    return true;
  }

  function isPlayingMediaElement(el) {
    return !!el && !el.paused && !el.ended && el.readyState > 2;
  }

  function isVisibleVideoElement(el) {
    if (!el || el.tagName?.toLowerCase() !== 'video') return false;
    if (document.visibilityState !== 'visible') return false;
    const rect = el.getBoundingClientRect?.();
    if (!rect || rect.width <= 0 || rect.height <= 0) return false;
    const style = getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) <= 0) return false;
    const viewportWidth = window.innerWidth || document.documentElement?.clientWidth || 0;
    const viewportHeight = window.innerHeight || document.documentElement?.clientHeight || 0;
    return rect.right > 0 && rect.bottom > 0 && rect.left < viewportWidth && rect.top < viewportHeight;
  }

  function mediaElementHasAudioTrack(el) {
    if (!el) return false;
    if (el.tagName?.toLowerCase() === 'audio') return true;
    if (typeof el.mozHasAudio === 'boolean') return el.mozHasAudio;
    if (Number(el.webkitAudioDecodedByteCount) > 0) return true;
    if (el.audioTracks && typeof el.audioTracks.length === 'number') return el.audioTracks.length > 0;
    return false;
  }

  function isAudibleMediaElement(el) {
    return isPlayingMediaElement(el) && mediaElementHasAudioTrack(el) && el.muted !== true && Number(el.volume) > 0;
  }

  function collectMediaElements() {
    const elements = new Set();
    for (const root of [...mediaRoots]) {
      if (root !== document && root?.host?.isConnected !== true) {
        mediaRoots.delete(root);
        continue;
      }
      root.querySelectorAll?.('video, audio').forEach((el) => elements.add(el));
    }
    return [...elements];
  }

  function readMediaSnapshot() {
    const elements = collectMediaElements();
    const playingElements = elements.filter(isPlayingMediaElement);
    const visibleVideos = playingElements.filter(isVisibleVideoElement);
    const audibleElements = playingElements.filter(isAudibleMediaElement);
    const hasAudioMedia = playingElements.some(el => el.tagName?.toLowerCase() === 'audio') || audioContextActive;
    const htmlMediaPlaying = visibleVideos.length > 0 || hasAudioMedia;
    const newState = htmlMediaPlaying || audioContextActive;
    const newKind = visibleVideos.length > 0 ? 'video' : (newState ? 'audio' : null);
    const newPiP = !!document.pictureInPictureElement;
    return {
      playing: newState,
      kind: newKind,
      isPiP: newPiP,
      audible: audibleElements.length > 0 || audioContextActive,
      visibleMediaCount: visibleVideos.length,
    };
  }

  function rememberMediaSnapshot(snapshot) {
    mediaPlaying = snapshot.playing;
    mediaKind = snapshot.kind;
    mediaAudible = snapshot.audible === true;
    visibleMediaCount = Number(snapshot.visibleMediaCount) || 0;
    pipActive = snapshot.isPiP;
  }

  function updateMediaState(force = false, source = 'dom_media_event') {
    const snapshot = readMediaSnapshot();
    const newState = snapshot.playing;
    const newKind = snapshot.kind;
    const newPiP = snapshot.isPiP;
    if (newState !== mediaPlaying || newPiP !== pipActive || newKind !== mediaKind || snapshot.audible !== mediaAudible || Number(snapshot.visibleMediaCount || 0) !== visibleMediaCount) {
      rememberMediaSnapshot(snapshot);
      return sendMediaState(mediaPlaying, pipActive, mediaKind, source, snapshot);
    } else if (force && (newState || newPiP)) {
      return sendMediaState(newState, newPiP, newKind, source, snapshot);
    }
    return false;
  }

  function pollMediaState() {
    if (Date.now() - lastShadowRootDiscoveryAt >= SHADOW_ROOT_DISCOVERY_INTERVAL_MS) {
      discoverOpenShadowRoots(document.documentElement);
      lastShadowRootDiscoveryAt = Date.now();
    }
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
    if (!el || attachedMediaElements.has(el)) return;
    attachedMediaElements.add(el);
    el.addEventListener('play',  () => updateMediaState(false, 'dom_media_event'));
    el.addEventListener('pause', () => updateMediaState(false, 'dom_media_event'));
    el.addEventListener('ended', () => updateMediaState(false, 'dom_media_event'));
    el.addEventListener('enterpictureinpicture', () => updateMediaState(false, 'pip_api'));
    el.addEventListener('leavepictureinpicture', handlePictureInPictureLeave);
  }

  function discoverOpenShadowRoots(node) {
    if (!node) return;
    const candidates = [];
    if (node.nodeType === 1) candidates.push(node);
    node.querySelectorAll?.('*').forEach((el) => candidates.push(el));
    candidates.forEach((el) => {
      if (el.shadowRoot) registerMediaRoot(el.shadowRoot);
    });
  }

  function handleMediaMutations(mutations) {
    mutations.forEach(m => {
      m.addedNodes.forEach(node => {
        if (node.nodeType !== 1) return;
        if (node.matches('video, audio')) attachMediaListeners(node);
        node.querySelectorAll && node.querySelectorAll('video, audio').forEach(attachMediaListeners);
        discoverOpenShadowRoots(node);
      });
    });
    updateMediaState(false, 'dom_media_event');
  }

  const mediaObserver = new MutationObserver(handleMediaMutations);

  function registerMediaRoot(root) {
    if (!root || mediaRoots.has(root)) return;
    mediaRoots.add(root);
    root.querySelectorAll?.('video, audio').forEach(attachMediaListeners);
    discoverOpenShadowRoots(root);
    mediaObserver.observe(root, { childList: true, subtree: true });
  }

  // 对现有和动态插入的 light DOM / open shadow DOM 媒体元素挂钩。
  document.querySelectorAll('video, audio').forEach(attachMediaListeners);
  discoverOpenShadowRoots(document.documentElement);
  lastShadowRootDiscoveryAt = Date.now();
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

  // ── 流游戏诊断探针（仅本地 session，不参与媒体或网页计时）──────────────────

  const STREAM_GAME_PROBE_INTERVAL_MS = 10000;
  const STREAM_GAME_RECENT_INPUT_MS = 15000;
  const streamGameVideoFrames = new WeakMap();
  let streamGameLastInputAt = 0;

  function isCgStreamGameFrame() {
    try {
      if (location.hostname.toLowerCase() === 'cg.163.com' && location.pathname === '/run.html') return true;
      return [...(location.ancestorOrigins || [])].some((origin) => {
        try { return new URL(origin).hostname.toLowerCase() === 'cg.163.com'; } catch (_) { return false; }
      });
    } catch (_) {
      return false;
    }
  }

  function isVisibleProbeElement(el) {
    if (!el || document.visibilityState !== 'visible') return false;
    const rect = el.getBoundingClientRect?.();
    if (!rect || rect.width <= 0 || rect.height <= 0) return false;
    const style = getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) <= 0) return false;
    const viewportWidth = window.innerWidth || document.documentElement?.clientWidth || 0;
    const viewportHeight = window.innerHeight || document.documentElement?.clientHeight || 0;
    return rect.right > 0 && rect.bottom > 0 && rect.left < viewportWidth && rect.top < viewportHeight;
  }

  function collectProbeElements(selector) {
    const elements = new Set();
    for (const root of [...mediaRoots]) {
      if (root !== document && root?.host?.isConnected !== true) continue;
      root.querySelectorAll?.(selector).forEach((el) => elements.add(el));
    }
    return [...elements];
  }

  function readDecodedVideoFrames(video) {
    try {
      const qualityFrames = Number(video.getVideoPlaybackQuality?.()?.totalVideoFrames);
      if (Number.isFinite(qualityFrames)) return qualityFrames;
      const webkitFrames = Number(video.webkitDecodedFrameCount);
      return Number.isFinite(webkitFrames) ? webkitFrames : null;
    } catch (_) {
      return null;
    }
  }

  function readStreamGameProbeSample() {
    const videos = collectProbeElements('video');
    const audioElements = collectProbeElements('audio');
    const canvases = collectProbeElements('canvas');
    let advancingVideoCount = 0;
    let hiddenAdvancingVideoCount = 0;
    let mediaStreamVideoCount = 0;
    let liveVideoTrackCount = 0;

    for (const video of videos) {
      const frames = readDecodedVideoFrames(video);
      const previousFrames = streamGameVideoFrames.get(video);
      if (frames !== null) {
        streamGameVideoFrames.set(video, frames);
        if (Number.isFinite(previousFrames) && frames > previousFrames) {
          advancingVideoCount += 1;
          if (!isVisibleProbeElement(video)) hiddenAdvancingVideoCount += 1;
        }
      }
      const videoTracks = video.srcObject?.getVideoTracks?.() || [];
      if (videoTracks.length > 0) mediaStreamVideoCount += 1;
      liveVideoTrackCount += videoTracks.filter((track) => track?.readyState === 'live').length;
    }

    let connectedGamepadCount = 0;
    try {
      connectedGamepadCount = [...(navigator.getGamepads?.() || [])].filter(Boolean).length;
    } catch (_) {}

    const visibleCanvases = canvases.filter(isVisibleProbeElement);
    const viewportArea = Math.max(1, (window.innerWidth || 0) * (window.innerHeight || 0));
    const largeCanvasCount = visibleCanvases.filter((canvas) => {
      const rect = canvas.getBoundingClientRect?.();
      return !!rect && (rect.width * rect.height >= viewportArea * 0.25 || (rect.width >= 640 && rect.height >= 360));
    }).length;
    const playingVideos = videos.filter(isPlayingMediaElement);

    return {
      documentVisible: document.visibilityState === 'visible',
      fullscreen: !!document.fullscreenElement,
      pointerLocked: !!document.pointerLockElement,
      recentInput: Date.now() - streamGameLastInputAt <= STREAM_GAME_RECENT_INPUT_MS,
      audioContextActive,
      videoElementCount: videos.length,
      playingVideoCount: playingVideos.length,
      visibleVideoCount: playingVideos.filter(isVisibleProbeElement).length,
      hiddenPlayingVideoCount: playingVideos.filter((video) => !isVisibleProbeElement(video)).length,
      mediaStreamVideoCount,
      liveVideoTrackCount,
      advancingVideoCount,
      hiddenAdvancingVideoCount,
      audioElementCount: audioElements.length,
      playingAudioCount: audioElements.filter(isPlayingMediaElement).length,
      audibleAudioCount: audioElements.filter(isAudibleMediaElement).length,
      canvasCount: canvases.length,
      visibleCanvasCount: visibleCanvases.length,
      largeCanvasCount,
      connectedGamepadCount,
    };
  }

  function sendStreamGameProbe() {
    if (!isCgStreamGameFrame() || !chrome.runtime?.id) return;
    const sample = readStreamGameProbeSample();
    const hasRenderableEvidence = sample.videoElementCount > 0
      || sample.audioElementCount > 0
      || sample.canvasCount > 0
      || window.top === window;
    if (!hasRenderableEvidence) return;
    chrome.runtime.sendMessage({ type: 'STREAM_GAME_PROBE', sample }, () => void chrome.runtime.lastError);
  }

  if (isCgStreamGameFrame()) {
    for (const eventName of ['pointermove', 'pointerdown', 'keydown', 'touchstart', 'wheel']) {
      addEventListener(eventName, () => { streamGameLastInputAt = Date.now(); }, { capture: true, passive: true });
    }
    setTimeout(sendStreamGameProbe, 2000);
    setInterval(sendStreamGameProbe, STREAM_GAME_PROBE_INTERVAL_MS);
  }

  // YouTube 频道规则需要具体视频页提供频道上下文；优先读取视频作者区域，
  // 避免误抓推荐区或评论区的频道链接。
  function normalizeYouTubeChannelPath(pathname) {
    const path = String(pathname || '').split('?')[0].split('#')[0];
    const match = path.match(/^\/(@[^/?#]+|channel\/[^/?#]+|c\/[^/?#]+|user\/[^/?#]+)/i);
    return match ? `/${match[1]}` : null;
  }

  function readYouTubeChannelTarget() {
    if (!canRenderTopFrameUi) return null;
    const host = String(location.hostname || '').replace(/^www\./i, '').toLowerCase();
    if (host !== 'youtube.com') return null;

    const directPath = normalizeYouTubeChannelPath(location.pathname);
    if (directPath) return `https://www.youtube.com${directPath}`;

    const videoOwnerSelectors = [
      'ytd-video-owner-renderer a[href^="/@"]',
      'ytd-video-owner-renderer a[href^="/channel/"]',
      'ytd-video-owner-renderer a[href^="/c/"]',
      'ytd-video-owner-renderer a[href^="/user/"]',
      '#owner a[href^="/@"]',
      '#owner a[href^="/channel/"]',
      '#owner a[href^="/c/"]',
      '#owner a[href^="/user/"]',
    ];
    for (const selector of videoOwnerSelectors) {
      const href = document.querySelector(selector)?.getAttribute('href');
      const channelPath = normalizeYouTubeChannelPath(href);
      if (channelPath) return `https://www.youtube.com${channelPath}`;
    }

    const canonical = document.querySelector('link[itemprop="url"]')?.getAttribute('href');
    if (canonical) {
      try {
        const parsed = new URL(canonical, location.origin);
        const channelPath = normalizeYouTubeChannelPath(parsed.pathname);
        if (channelPath) return `https://www.youtube.com${channelPath}`;
      } catch {}
    }
    return null;
  }

  function reportSpecialSiteContext(reason = 'content_ready') {
    const channelTarget = readYouTubeChannelTarget();
    if (!channelTarget || !chrome.runtime?.id) return;
    try {
      chrome.runtime.sendMessage({
        type: 'SPECIAL_SITE_CONTEXT',
        platform: 'youtube',
        reason,
        specialSiteTargets: [channelTarget],
        observedAt: Date.now(),
      });
    } catch {}
  }
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
        reportSpecialSiteContext('title_change');
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
    } else if (msg.type === 'GET_MEDIA_SNAPSHOT') {
      const snapshot = readMediaSnapshot();
      sendResponse?.({
        ok: true,
        playing: snapshot.playing === true,
        isPiP: snapshot.isPiP === true,
        mediaKind: snapshot.kind || null,
        audible: snapshot.audible === true,
        visibleMediaCount: Number(snapshot.visibleMediaCount) || 0,
        visible: document.visibilityState === 'visible',
        documentVisible: document.visibilityState === 'visible',
        source: 'content_media_snapshot',
      });
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
        sendResponse?.({ ok: false, handled: true, rendered: false, visible: false, reason: 'not_top_frame' });
        return;
      }
      showModeNoticeSuccess(msg)
        .then((result) => sendResponse?.(result))
        .catch((err) => sendResponse?.({
          ok: false,
          handled: true,
          rendered: false,
          visible: false,
          reason: err?.message || String(err),
        }));
      return true;
    } else if (msg.type === 'SHOW_REST_USAGE_REMINDER') {
      if (!canRenderTopFrameUi) {
        sendResponse?.({ ok: false, handled: true, visible: false, reason: 'not_top_frame' });
        return;
      }
      showRestUsageReminder(msg)
        .then((result) => sendResponse?.(result))
        .catch((err) => sendResponse?.({
          ok: false,
          handled: true,
          visible: false,
          reason: err?.message || String(err),
        }));
      return true;
    } else if (msg.type === 'ACTIVATE_REST_USAGE_REMINDER') {
      if (!canRenderTopFrameUi) {
        sendResponse?.({ ok: false, handled: true, visible: false, reason: 'not_top_frame' });
        return;
      }
      activateRestUsageReminder(msg)
        .then((result) => sendResponse?.(result))
        .catch((err) => sendResponse?.({
          ok: false,
          handled: true,
          visible: false,
          reason: err?.message || String(err),
        }));
      return true;
    } else if (msg.type === 'DISMISS_REST_USAGE_REMINDER') {
      if (msg.token && msg.token === restReminderToken) clearRestUsageReminder();
      sendResponse?.({ ok: true, handled: true, visible: false });
    } else if (msg.type === 'PAUSE_REST_USAGE_MEDIA') {
      Promise.resolve()
        .then(() => document.exitFullscreen?.())
        .catch(() => null)
        .then(() => exitPictureInPictureIfNeeded())
        .catch(() => null)
        .then(() => {
          pauseMediaForRestReminder();
          sendResponse?.({ ok: true, paused: restReminderPausedMedia.length });
        });
      return true;
    } else if (msg.type === 'RESUME_REST_USAGE_MEDIA') {
      resumeMediaAfterRestReminder();
      sendResponse?.({ ok: true, resumed: true });
      return;
    }
  });

  function notifyContentScriptReady(readyReason = 'initial') {
    if (!canRenderTopFrameUi) return;
    try {
      chrome.runtime.sendMessage({
        type: 'CONTENT_SCRIPT_READY',
        readyReason,
        readyAt: Date.now(),
      });
    } catch {}
    reportSpecialSiteContext(readyReason);
  }

  // Notify background that the top-frame listener is ready, so a pending
  // auto-mode notice can be re-delivered exactly once. Subframes cannot render
  // the page notice and must not trigger tab-level resend.
  notifyContentScriptReady('initial');
  window.addEventListener('pageshow', () => notifyContentScriptReady('pageshow'));
  window.addEventListener('focus', () => notifyContentScriptReady('window_focus'));
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') notifyContentScriptReady('visibilitychange');
  });

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
    const noticeIconUrl = chrome.runtime.getURL('icons/ui/notice.svg');
    toast.innerHTML = `
      <div class="g-toast-icon"><img src="${noticeIconUrl}" alt=""></div>
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

    const overlayIconUrl = chrome.runtime.getURL(isWarn ? 'icons/ui/notice.svg' : 'icons/ui/online-time.svg');
    overlayEl.innerHTML = `
      <div class="g-overlay-box">
        <div class="g-overlay-icon"><img src="${overlayIconUrl}" alt=""></div>
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

  function formatReminderDuration(seconds) {
    if (seconds === null || seconds === undefined) return '无限制';
    return formatDurationCN(seconds);
  }

  function pauseMediaForRestReminder() {
    const playingMedia = collectMediaElements().filter(isPlayingMediaElement);
    restReminderPausedMedia = [...new Set([...restReminderPausedMedia, ...playingMedia])];
    for (const media of playingMedia) {
      try { media.pause(); } catch (_) {}
    }
  }

  function resumeMediaAfterRestReminder() {
    const mediaToResume = restReminderPausedMedia;
    restReminderPausedMedia = [];
    for (const media of mediaToResume) {
      if (!media?.isConnected) continue;
      try {
        const result = media.play();
        result?.catch?.(() => {});
      } catch (_) {}
    }
  }

  function clearRestUsageReminder({ resumeMedia = false } = {}) {
    if (restReminderCountdownTimer) {
      clearInterval(restReminderCountdownTimer);
      restReminderCountdownTimer = null;
    }
    try { restReminderDialog?.close?.(); } catch (_) {}
    restReminderHost?.remove();
    restReminderHost = null;
    restReminderShadow = null;
    restReminderDialog = null;
    restReminderToken = null;
    restReminderResolving = false;
    restReminderResolveAction = null;
    if (document.documentElement) document.documentElement.style.overflow = restReminderPreviousOverflow;
    if (resumeMedia) resumeMediaAfterRestReminder();
    else restReminderPausedMedia = [];
    try { restReminderPreviousFocus?.focus?.({ preventScroll: true }); } catch (_) {}
    restReminderPreviousFocus = null;
  }

  function restReminderStyles() {
    return `
      :host { all: initial; }
      dialog {
        width: min(420px, calc(100vw - 32px));
        max-width: 420px;
        box-sizing: border-box;
        margin: auto;
        padding: 0;
        border: 1px solid #dce9e5;
        border-radius: 8px;
        background: #ffffff;
        color: #18332c;
        box-shadow: 0 18px 60px rgba(18, 51, 43, 0.28);
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        letter-spacing: 0;
      }
      dialog::backdrop { background: rgba(17, 37, 32, 0.72); }
      .panel { padding: 22px; }
      h1 { margin: 0; font-size: 20px; line-height: 1.3; font-weight: 700; letter-spacing: 0; }
      .subtitle { margin: 6px 0 18px; color: #61766f; font-size: 13px; line-height: 1.5; }
      .stats { display: grid; grid-template-columns: 1fr 1fr; border: 1px solid #dce9e5; }
      .stat { min-width: 0; padding: 12px; border-bottom: 1px solid #dce9e5; }
      .stat:nth-child(odd) { border-right: 1px solid #dce9e5; }
      .stat:nth-last-child(-n+2) { border-bottom: 0; }
      .label { color: #6a7f78; font-size: 12px; line-height: 1.4; }
      .value { margin-top: 4px; color: #173a31; font-size: 17px; line-height: 1.4; font-weight: 700; overflow-wrap: anywhere; }
      .countdown { margin: 16px 0 10px; text-align: center; color: #9a5d00; font-size: 13px; font-weight: 600; }
      .slider { position: relative; height: 50px; border-radius: 7px; background: #e7f5f0; overflow: hidden; touch-action: none; user-select: none; }
      .slider-track { position: absolute; inset: 0; display: grid; place-items: center; color: #176b57; font-size: 13px; font-weight: 700; pointer-events: none; }
      .slider-thumb { position: absolute; top: 4px; left: 4px; width: 42px; height: 42px; border: 0; border-radius: 6px; background: #00a884; color: #fff; display: grid; place-items: center; cursor: grab; font-size: 20px; line-height: 1; box-shadow: 0 3px 10px rgba(0, 122, 94, .25); }
      .slider-thumb:active { cursor: grabbing; }
      .slider-thumb:focus-visible, .end:focus-visible { outline: 3px solid rgba(0, 168, 132, .28); outline-offset: 2px; }
      .end { width: 100%; height: 42px; margin-top: 10px; border: 1px solid #cfded9; border-radius: 7px; background: #fff; color: #36554d; font-size: 14px; font-weight: 650; cursor: pointer; }
      .end:hover { background: #f5f8f7; }
      .status { min-height: 18px; margin-top: 8px; color: #b42318; text-align: center; font-size: 12px; }
      @media (max-width: 480px) {
        dialog { width: calc(100vw - 24px); }
        .panel { padding: 18px; }
        h1 { font-size: 18px; }
        .value { font-size: 15px; }
      }
    `;
  }

  function bindRestReminderSlider(shadow, resolveAction) {
    const slider = shadow.getElementById('toc-rest-reminder-slider');
    const thumb = shadow.getElementById('toc-rest-reminder-thumb');
    if (!slider || !thumb) return;
    let dragging = false;
    let startX = 0;
    let baseLeft = 4;

    const maxLeft = () => Math.max(4, slider.clientWidth - thumb.clientWidth - 4);
    const setLeft = (value) => {
      const left = Math.max(4, Math.min(maxLeft(), value));
      thumb.style.left = `${left}px`;
      return left;
    };
    const finish = () => {
      if (!dragging) return;
      dragging = false;
      const left = Number.parseFloat(thumb.style.left || '4') || 4;
      const max = maxLeft();
      if (left >= max * 0.92) {
        setLeft(max);
        resolveAction('continue');
      } else {
        setLeft(4);
      }
    };

    thumb.addEventListener('pointerdown', (event) => {
      if (restReminderResolving) return;
      dragging = true;
      startX = event.clientX;
      baseLeft = Number.parseFloat(thumb.style.left || '4') || 4;
      try { thumb.setPointerCapture(event.pointerId); } catch (_) {}
      event.preventDefault();
    });
    thumb.addEventListener('pointermove', (event) => {
      if (!dragging) return;
      setLeft(baseLeft + event.clientX - startX);
      event.preventDefault();
    });
    thumb.addEventListener('pointerup', finish);
    thumb.addEventListener('pointercancel', finish);
    thumb.addEventListener('keydown', (event) => {
      if ((event.key === 'Enter' || event.key === 'End') && !restReminderResolving) {
        event.preventDefault();
        setLeft(maxLeft());
        resolveAction('continue');
      }
    });
  }

  async function showRestUsageReminder(payload) {
    if (!payload?.token) return { ok: false, handled: true, visible: false, reason: 'missing_token' };
    if (restReminderToken === payload.token && restReminderDialog?.open) {
      return { ok: true, handled: true, visible: true, token: payload.token };
    }
    clearRestUsageReminder();
    restReminderToken = payload.token;
    restReminderResolving = true;
    restReminderPreviousFocus = document.activeElement;
    restReminderPreviousOverflow = document.documentElement?.style?.overflow || '';
    if (document.documentElement) document.documentElement.style.overflow = 'hidden';

    const isRepeat = payload.reminderKind === 'repeat';
    const softLimitMinutes = Math.max(1, Math.floor(Number(payload.softLimitMinutes) || 120));
    const overageMinutes = Math.max(0, Math.floor((Number(payload.overageSeconds) || 0) / 60));
    const reminderTitle = isRepeat ? '已超过今日休息软限额' : '已达到今日休息软限额';
    const reminderSubtitle = isRepeat
      ? `已超过你设定的软限额 ${overageMinutes} 分钟。`
      : `你设定的今日休息软限额为 ${softLimitMinutes} 分钟。`;

    restReminderHost = document.createElement('div');
    restReminderHost.id = '__toc_rest_usage_reminder__';
    restReminderShadow = restReminderHost.attachShadow({ mode: 'open' });
    restReminderShadow.innerHTML = `
      <style>${restReminderStyles()}</style>
      <dialog id="toc-rest-reminder-dialog" aria-labelledby="toc-rest-reminder-title">
        <div class="panel">
          <h1 id="toc-rest-reminder-title">${reminderTitle}</h1>
          <p class="subtitle">${reminderSubtitle}</p>
          <div class="stats">
            <div class="stat"><div class="label">本周已用</div><div class="value">${formatReminderDuration(payload.weekUsedSeconds)}</div></div>
            <div class="stat"><div class="label">本周剩余</div><div class="value">${formatReminderDuration(payload.weekRemainingSeconds)}</div></div>
            <div class="stat"><div class="label">今日已用</div><div class="value">${formatReminderDuration(payload.todayUsedSeconds)}</div></div>
            <div class="stat"><div class="label">今日剩余</div><div class="value">${formatReminderDuration(payload.todayRemainingSeconds)}</div></div>
          </div>
          <div class="countdown" id="toc-rest-reminder-countdown"></div>
          <div class="slider" id="toc-rest-reminder-slider">
            <div class="slider-track">滑动继续休息</div>
            <button class="slider-thumb" id="toc-rest-reminder-thumb" type="button" aria-label="滑动继续休息">›</button>
          </div>
          <button class="end" id="toc-rest-reminder-end" type="button">结束休息</button>
          <div class="status" id="toc-rest-reminder-status" role="status">正在准备提醒…</div>
        </div>
      </dialog>
    `;
    (document.documentElement || document.body).appendChild(restReminderHost);
    restReminderDialog = restReminderShadow.getElementById('toc-rest-reminder-dialog');
    restReminderDialog.addEventListener('cancel', (event) => event.preventDefault());

    restReminderResolveAction = (action) => {
      if (restReminderResolving || restReminderToken !== payload.token) return;
      restReminderResolving = true;
      const status = restReminderShadow?.getElementById('toc-rest-reminder-status');
      if (status) status.textContent = action === 'continue' ? '正在恢复…' : '正在结束休息…';
      chrome.runtime.sendMessage({
        type: 'REST_USAGE_REMINDER_ACTION',
        token: payload.token,
        action,
      }, (response) => {
        if (chrome.runtime.lastError || response?.ok !== true) {
          restReminderResolving = false;
          if (status) status.textContent = '操作未完成，请重试';
          return;
        }
        if (action === 'continue') clearRestUsageReminder({ resumeMedia: true });
      });
    };

    bindRestReminderSlider(restReminderShadow, restReminderResolveAction);
    restReminderShadow.getElementById('toc-rest-reminder-end')?.addEventListener('click', () => restReminderResolveAction?.('end'));
    restReminderShadow.getElementById('toc-rest-reminder-thumb')?.setAttribute('disabled', '');
    restReminderShadow.getElementById('toc-rest-reminder-end')?.setAttribute('disabled', '');

    restReminderDialog.showModal();
    restReminderShadow.getElementById('toc-rest-reminder-thumb')?.focus({ preventScroll: true });
    return { ok: true, handled: true, visible: true, token: payload.token };
  }

  async function activateRestUsageReminder(payload) {
    if (!payload?.token || payload.token !== restReminderToken || !restReminderDialog?.open) {
      return { ok: false, handled: true, visible: false, reason: 'prompt_not_visible' };
    }
    if (!Number.isFinite(Number(payload.deadlineAt))) {
      return { ok: false, handled: true, visible: true, reason: 'invalid_deadline' };
    }

    try { await document.exitFullscreen?.(); } catch (_) {}
    try { await exitPictureInPictureIfNeeded(); } catch (_) {}
    pauseMediaForRestReminder();
    restReminderResolving = false;
    restReminderShadow?.getElementById('toc-rest-reminder-thumb')?.removeAttribute('disabled');
    restReminderShadow?.getElementById('toc-rest-reminder-end')?.removeAttribute('disabled');
    const status = restReminderShadow?.getElementById('toc-rest-reminder-status');
    if (status) status.textContent = '';

    if (restReminderCountdownTimer) clearInterval(restReminderCountdownTimer);
    const updateCountdown = () => {
      const remaining = Math.max(0, Math.ceil((Number(payload.deadlineAt) - Date.now()) / 1000));
      const countdown = restReminderShadow?.getElementById('toc-rest-reminder-countdown');
      if (countdown) countdown.textContent = `${String(Math.floor(remaining / 60)).padStart(2, '0')}:${String(remaining % 60).padStart(2, '0')} 后将自动结束休息`;
      if (remaining <= 0) {
        if (restReminderCountdownTimer) clearInterval(restReminderCountdownTimer);
        restReminderCountdownTimer = null;
        restReminderResolveAction?.('end');
      }
    };
    updateCountdown();
    restReminderCountdownTimer = setInterval(updateCountdown, 250);
    return { ok: true, handled: true, visible: true, token: payload.token };
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

  function waitForNextFrame(timeoutMs = 125) {
    return new Promise((resolve) => {
      let done = false;
      const timer = setTimeout(() => {
        if (done) return;
        done = true;
        resolve(false);
      }, timeoutMs);
      requestAnimationFrame(() => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        resolve(true);
      });
    });
  }

  async function waitForModeNoticeVisible(bannerEl) {
    if (!canRenderTopFrameUi) return { ok: false, reason: 'not_top_frame' };
    if (document.visibilityState !== 'visible') return { ok: false, reason: 'document_not_visible' };

    const startedAt = Date.now();
    await waitForNextFrame();
    if (Date.now() - startedAt < 250) {
      await waitForNextFrame(Math.max(1, 250 - (Date.now() - startedAt)));
    }

    if (document.visibilityState !== 'visible') return { ok: false, reason: 'document_not_visible' };
    if (!modeNoticeHost?.isConnected) return { ok: false, reason: 'notice_host_unavailable' };
    if (!bannerEl?.isConnected) return { ok: false, reason: 'notice_banner_unavailable' };

    const rect = bannerEl.getBoundingClientRect?.();
    if (!rect || rect.width <= 0 || rect.height <= 0) return { ok: false, reason: 'notice_not_visible' };

    const style = getComputedStyle(bannerEl);
    if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) <= 0) {
      return { ok: false, reason: 'notice_not_visible' };
    }
    return { ok: true };
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
        bannerEl.textContent = `正在使用复合网站 · ${secondsRemaining}秒后进入待归类时间 · 今日剩余 ${remainingCompositeTime}`;
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

  async function showModeNoticeSuccess(payload) {
    if (Number(payload?.expiresAt) && Date.now() > Number(payload.expiresAt)) {
      clearModeNotice();
      return { ok: false, handled: true, rendered: false, visible: false, reason: 'expired_notice' };
    }
    const shadow = ensureModeNoticeBanner();
    if (!shadow) {
      return { ok: false, handled: true, rendered: false, visible: false, reason: 'notice_host_unavailable' };
    }

    clearPendingTimers();
    const targetMode = payload?.targetMode === 'study' ? 'study' : 'composite';
    const remainingCompositeSeconds = Number(payload?.remainingCompositeSeconds) || 0;
    const remainingCompositeTime = payload?.remainingCompositeTime || formatDurationCN(remainingCompositeSeconds);
    const remainingStudyTime = payload?.remainingStudyTime || '不限';
    const bannerEl = shadow.getElementById('toc-pending-banner');
    if (!bannerEl) {
      return { ok: false, handled: true, rendered: false, visible: false, reason: 'notice_banner_unavailable' };
    }
    if (payload?.noticeText) {
      bannerEl.textContent = payload.noticeText;
    } else if (targetMode === 'study') {
      bannerEl.textContent = `你正在打开学习网站 · 即将进入学习模式 · 今日剩余 ${remainingStudyTime}`;
    } else {
      bannerEl.textContent = `你正在打开复合网站或待归类记录 · 即将进入复合模式 · 今日待归类剩余 ${remainingCompositeTime}`;
    }

    const visibleResult = await waitForModeNoticeVisible(bannerEl);
    if (!visibleResult.ok) {
      return {
        ok: false,
        handled: true,
        rendered: false,
        visible: false,
        reason: visibleResult.reason || 'notice_not_visible',
      };
    }

    const hideDuration = Math.min(Math.max(Number(payload?.displayDuration) || 4000, 1000), 10000);
    modeNoticeHideTimer = setTimeout(() => {
      clearModeNotice();
    }, hideDuration);
    return { ok: true, handled: true, rendered: true, visible: true, noticeType: 'AUTO_MODE_PENDING_SUCCESS' };
  }

})();
