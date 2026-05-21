// core/media-framework.js — media framework resolver (pure)

export const MediaFramework = {
  NONE: 'none',
  BACKGROUND_AUDIO: 'background_audio',
  BACKGROUND_VIDEO: 'background_video',
  PIP_VIDEO: 'pip_video',
};

function isForegroundPageContext(context) {
  return !!context &&
    context.tabId != null &&
    context.isFocused === true &&
    context.isIdle !== true &&
    !!context.domain;
}

export function resolveMediaFramework(context) {
  const mediaDomain = context?.mediaSourceDomain || null;
  const sourceTabId = context?.mediaSourceTabId ?? null;
  const mediaKind = context?.mediaKind === 'video' ? 'video' : (context?.mediaKind === 'audio' ? 'audio' : null);
  const foregroundSameSource = isForegroundPageContext(context) && sourceTabId != null && sourceTabId === context.tabId;

  if (context?.isPiP && mediaDomain) {
    return {
      framework: MediaFramework.PIP_VIDEO,
      domain: mediaDomain,
      mediaKind: 'video',
      sourceTabId,
    };
  }

  if (!context?.isAudible || !mediaDomain || sourceTabId == null) {
    return {
      framework: MediaFramework.NONE,
      domain: null,
      mediaKind: null,
      sourceTabId: null,
    };
  }

  if (mediaKind === 'video') {
    if (foregroundSameSource) {
      return {
        framework: MediaFramework.NONE,
        domain: null,
        mediaKind,
        sourceTabId,
      };
    }
    return {
      framework: MediaFramework.BACKGROUND_VIDEO,
      domain: mediaDomain,
      mediaKind,
      sourceTabId,
    };
  }

  return {
    framework: MediaFramework.BACKGROUND_AUDIO,
    domain: mediaDomain,
    mediaKind: mediaKind || 'audio',
    sourceTabId,
  };
}
