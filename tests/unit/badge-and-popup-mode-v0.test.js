// badge-and-popup-mode-v0.test.js
// Run with: node tests/unit/badge-and-popup-mode-v0.test.js

'use strict';

const fs = require('fs');
const path = require('path');

let passed = 0;
let failed = 0;

function expectTrue(desc, cond) {
  if (cond) passed++;
  else {
    failed++;
    console.error(`  ✗ ${desc}`);
  }
}

function extractFunctionSource(code, functionName) {
  const marker = `function ${functionName}(`;
  const start = code.indexOf(marker);
  if (start < 0) return '';
  const braceStart = code.indexOf('{', start);
  let depth = 0;
  for (let i = braceStart; i < code.length; i++) {
    const ch = code[i];
    if (ch === '{') depth++;
    if (ch === '}') {
      depth--;
      if (depth === 0) return code.slice(start, i + 1);
    }
  }
  return '';
}

function run() {
  const backgroundSource = fs.readFileSync(path.join(__dirname, '..', '..', 'extension', 'background.js'), 'utf8');
  const messageRouterSource = fs.readFileSync(path.join(__dirname, '..', '..', 'extension', 'message-router.js'), 'utf8');
  const popupHtml = fs.readFileSync(path.join(__dirname, '..', '..', 'extension', 'popup', 'popup.html'), 'utf8');
  const popupJs = fs.readFileSync(path.join(__dirname, '..', '..', 'extension', 'popup', 'popup.js'), 'utf8');
  const adminJs = fs.readFileSync(path.join(__dirname, '..', '..', 'extension', 'admin', 'admin.js'), 'utf8');
  const modeUsageSource = extractFunctionSource(popupJs, 'resolveModeUsageWithLive');

  expectTrue('action icon map normalizes study/composite/rest modes', backgroundSource.includes("mode === 'composite' || mode === 'rest' || mode === 'study'"));
  expectTrue('action icon map falls back to locked icon', backgroundSource.includes(": 'locked'"));
  expectTrue('action icon map references action icon assets', backgroundSource.includes('icons/action-${normalized}16.png') && backgroundSource.includes('icons/action-${normalized}32.png') && backgroundSource.includes('icons/action-${normalized}48.png'));
  expectTrue('badge mode text includes 学/综/休/停/锁', backgroundSource.includes("return '学';") && backgroundSource.includes("return '综';") && backgroundSource.includes("return '休';") && backgroundSource.includes("return '停';") && backgroundSource.includes("return '锁';"));
  expectTrue('badge mode color uses pale backgrounds', backgroundSource.includes('function modeToBadgeColor') && backgroundSource.includes('#b8f3df') && backgroundSource.includes('#d8d2ff') && backgroundSource.includes('#fde7b3') && backgroundSource.includes('#e2e8f0') && backgroundSource.includes('#fecaca'));
  expectTrue('toolbar mode uses dynamic action icon and badge text', /setIcon\?\.\(\{ path: modeToActionIconPath\(runtimeMode\) \}\)/.test(backgroundSource) && /setBadgeText\(\{ text: modeText \}\)/.test(backgroundSource));
  expectTrue('badge no longer renders legacy pending mode ellipsis', !backgroundSource.includes('pending.remainingSeconds') && !backgroundSource.includes('getAutoModePendingStatus'));
  expectTrue('background no longer sends legacy pending START from badge refresh', !backgroundSource.includes("type: 'AUTO_MODE_PENDING_START'"));
  expectTrue('badge title uses current stable mode', backgroundSource.includes('模式 ${modeToLabel(runtimeMode)}'));

  expectTrue('popup has compact runtime field', popupHtml.includes('id="runtime-compact"'));
  expectTrue('popup has study mode button', popupHtml.includes('id="btn-study"'));
  expectTrue('popup has rest mode button', popupHtml.includes('id="btn-rest"'));
  expectTrue('popup has composite mode button', popupHtml.includes('id="btn-composite"'));
  expectTrue('mode bar is vertical', popupHtml.includes('flex-direction: column;'));
  expectTrue('mode bar gap is 8px', popupHtml.includes('gap: 8px;'));
  expectTrue('mode button full width', popupHtml.includes('width: 100%;'));
  expectTrue('mode button min height 44px', popupHtml.includes('min-height: 44px;'));
  expectTrue('mode button row layout', popupHtml.includes('justify-content: space-between;'));
  expectTrue('mode button padding 0 12px', popupHtml.includes('padding: 0 12px;'));
  expectTrue('popup no longer contains 今日用量 title', !popupHtml.includes('今日用量'));
  expectTrue('popup no longer contains runtime-card', !popupHtml.includes('runtime-card'));
  expectTrue('popup still supports runtime mode status after manual mode switches', popupJs.includes("type: 'GET_RUNTIME_MODE_STATUS'"));
  expectTrue('popup keeps fast status compatibility helper', popupJs.includes("type: 'GET_POPUP_FAST_STATUS'"));
  expectTrue('popup requests local snapshot for first render', popupJs.includes("type: 'GET_POPUP_LOCAL_SNAPSHOT'"));
  expectTrue('popup sends active tab hint with first render request', popupJs.includes('function getPopupActiveTabHint') && popupJs.includes("activeTabHint") && popupJs.includes('chrome.tabs.query({ active: true, currentWindow: true })'));
  expectTrue('popup falls back to active tab hint when snapshot misses domain', popupJs.includes('function withActiveTabHintFallback') && popupJs.includes('snapshot?.currentDomain || domain') && popupJs.includes('resolveHintLiveSeconds'));
  expectTrue('popup active tab hint keeps reminder extension URL', popupJs.includes('function isReminderExtensionUrl') && popupJs.includes("parsed.protocol === 'chrome-extension:'") && popupJs.includes('!isReminderExtensionUrl(tab.url)'));
  expectTrue('popup reminder hint fallback preserves URL without domain attribution', popupJs.includes('isReminderExtensionUrl(activeTabHint?.url || \'\')') && popupJs.includes('url: snapshot?.url || activeTabHint.url') && popupJs.includes('windowId: Number.isInteger(snapshot?.windowId)'));
  expectTrue('popup first runtime render uses snapshot config context', popupJs.includes('popupStatsContext = {') && popupJs.includes('config: snapshot?.config || popupStatsContext.config || {}') && popupJs.includes('resolveDomainTag(domain, status?.config || popupStatsContext.config, status?.url || null)'));
  expectTrue('popup runtime tag prefers managed target label when present', popupJs.includes('status?.currentManagedTarget?.managedTargetLabelAtTime') && backgroundSource.includes('resolveManagedTargetAttribution') && backgroundSource.includes('currentManagedTarget'));
  expectTrue('popup settled mode stats prefer target quota aggregates', backgroundSource.includes('dayStats?.targets') && backgroundSource.includes('activeByQuotaBucket'));
  expectTrue('popup reminder request default prefers original targetUrl', popupJs.includes("parsed.searchParams.get('targetUrl')") && popupJs.includes('if (targetUrl)') && popupJs.includes('input: targetUrl'));
  expectTrue('popup hydrates site request input after late snapshot', popupJs.includes('function hydrateSiteRequestInputFromSnapshot') && popupJs.includes("hydrateSiteRequestInputFromSnapshot('snapshot_ready')") && popupJs.includes("hydrateSiteRequestInputFromSnapshot('init_snapshot')"));
  expectTrue('popup late snapshot does not overwrite typed site request', popupJs.includes('if (input.value.trim()) return false'));
  expectTrue('popup shows reading state when request default is not ready', popupJs.includes('正在读取被拦截链接…') && popupJs.includes('appendSiteRequestStatusLine(status'));
  expectTrue('popup site request input wraps long URLs', popupHtml.includes('<textarea class="request-input"') && popupHtml.includes('overflow-wrap: anywhere') && popupHtml.includes('word-break: break-word'));
  expectTrue('popup site request has scope preview', popupHtml.includes('id="site-request-preview"') && popupHtml.includes('.request-preview-title') && popupJs.includes('function previewSiteClassificationTarget') && popupJs.includes('updateSiteRequestPreview'));
  expectTrue('popup validates current target before opening learning request panel', popupHtml.includes('id="site-request-entry-status"') && popupJs.includes('async function openSiteRequestPanel') && popupJs.includes("type: 'VALIDATE_SITE_CLASSIFICATION_REQUEST'") && popupJs.includes('renderSiteRequestEntryStatus(siteRequestErrorMessage'));
  expectTrue('popup keeps dry-run validation before final learning request submit', popupJs.includes('async function validateSiteClassificationRequestInput') && /validateSiteClassificationRequestInput\(value, defaults\.sourceTabId\)[\s\S]*SUBMIT_SITE_CLASSIFICATION_REQUEST/.test(popupJs));
  expectTrue('popup site request validation uses cold-start tolerant retry options', popupJs.includes('const SITE_REQUEST_MESSAGE_OPTIONS = { attempts: 3, timeoutMs: 2500 }') && (popupJs.match(/SITE_REQUEST_MESSAGE_OPTIONS/g) || []).length >= 3);
  expectTrue('popup site request explains editable scope', popupHtml.includes('你可以修改下方内容来调整申请范围') && popupHtml.includes('example.com 表示整个网站') && popupHtml.includes('learn.example.com 表示子域名') && popupHtml.includes('表示这个具体链接'));
  expectTrue('popup site request previews YouTube playlist/video canonical target', popupJs.includes('YouTube 播放列表') && popupJs.includes('https://www.youtube.com/playlist?list=') && popupJs.includes('系统将按「YouTube 播放列表」申请，已识别为 YouTube 播放列表 list=') && popupJs.includes('YouTube 视频') && popupJs.includes('https://www.youtube.com/watch?v='));
  expectTrue('popup site request enter submit prevents textarea newline', popupJs.includes('event.preventDefault();') && popupJs.includes('!event.shiftKey'));
  expectTrue('popup site request renders inline result card', popupHtml.includes('.request-status-title') && !popupHtml.includes('.request-return-btn') && popupJs.includes('function renderSiteRequestStatus'));
  expectTrue('popup site request reports already-present state', popupJs.includes('result.alreadyPresent') && !popupJs.includes('返回申请页面失败'));
  expectTrue('popup site request does not auto navigate after submit', !popupJs.includes('waitMs') && !popupJs.includes('即将返回申请页面'));
  expectTrue('popup site request does not render return button', !popupJs.includes("btn.textContent = '返回申请页面'") && !popupJs.includes('request-return-btn') && !popupJs.includes('chrome.tabs.update(returnInfo.sourceTabId'));
  expectTrue('popup current site tag supports custom/default site lists', popupJs.includes('function collectStudyPatterns') && popupJs.includes("'customStudyList'") && popupJs.includes("'defaultCompositeSites'") && popupJs.includes("'defaultUserCompositeSites'"));
  expectTrue('admin rules display supports defaultUserCompositeSites', adminJs.includes('mergeArrayFields') && adminJs.includes("'defaultUserCompositeSites'"));
  expectTrue('popup renders snapshot before suspect summary completes', popupJs.includes('const snapshotPromise = getPopupLocalSnapshotSafe()') && popupJs.includes('snapshotPromise.then'));
  expectTrue('popup local snapshot uses shorter single-attempt timeout', popupJs.includes('attempts: 1') && popupJs.includes('timeoutMs: 900'));
  expectTrue('popup local snapshot timeout fallback preserves cached cloud binding state', popupJs.includes('function getPopupCachedStateSafe') && popupJs.includes('cloud_device_token') && popupJs.includes('cloud_profile_id') && popupJs.includes('cloudStatus: cachedState?.cloudStatus'));
  expectTrue('popup does not request cloud status on startup', !popupJs.includes("type: 'GET_CLOUD_STATUS'"));
  expectTrue('popup suspect summary does not block init', popupJs.includes('getSuspectSegmentSummarySafe().then(renderSuspectSegmentStatus)') && !popupJs.includes('renderSuspectSegmentStatus(await getSuspectSegmentSummarySafe())'));
  expectTrue('popup local mode notice text is present', popupHtml.includes('本地模式：未绑定云端，统计不会同步'));
  expectTrue('popup local mode keeps admin button', popupHtml.includes('打开管理中心') && popupJs.includes("admin/admin.html?view=stats"));
  expectTrue('popup local mode does not show cloud login button', !popupHtml.includes('id="login-cloud-btn"') && !popupHtml.includes('登录/绑定云端'));
  expectTrue('popup main init does not request config and mode stats separately', !popupJs.includes("type: 'GET_CONFIG'") && !popupJs.includes("type: 'GET_POPUP_SETTLED_MODE_STATS'"));
  expectTrue('popup no longer requests popup-sourced GET_STATS', !popupJs.includes("type: 'GET_STATS', source: 'popup'"));
  expectTrue('popup retries background messages after MV3 cold start', popupJs.includes('background_timeout') && popupJs.includes('attempts') && popupJs.includes('setTimeout(resolve, 180)'));
  expectTrue('popup does not abort rendering when local snapshot fails', popupJs.includes('function getPopupLocalSnapshotSafe') && popupJs.includes('renderPopupLoadError'));
  expectTrue('popup has composite mode active class', popupJs.includes('active-composite'));
  expectTrue('popup sends REQUEST_MODE_CHANGE for manual switches', popupJs.includes("type: 'REQUEST_MODE_CHANGE'") && popupJs.includes("toMode: mode"));
  expectTrue('popup mode switch renders optimistic state immediately', popupJs.includes('const previousMode') && popupJs.includes('renderModeButtons({ ...(lastPopupSnapshot || {}), mode })'));
  expectTrue('popup no longer reclassifies settled domains by current study list', !modeUsageSource.includes('studyList.some') && !modeUsageSource.includes('matchDomain(domain'));
  expectTrue('popup mode usage reads mode aggregate fields', popupJs.includes('stats?.studySeconds') && popupJs.includes('stats?.restSeconds') && popupJs.includes('stats?.compositeSeconds'));
  expectTrue('popup current access shows session-only duration', popupJs.includes('function formatRuntimeSessionDuration') && !popupJs.includes('formatRuntimeTodayDuration'));
  expectTrue('popup no longer renders visit history list', !popupHtml.includes('今日访问') && !popupHtml.includes('today-top10') && !popupJs.includes('today-top10'));
  expectTrue('popup usage metrics use unified card classes', popupHtml.includes('.usage-panel') && popupHtml.includes('.usage-metric') && popupJs.includes('const metric = ({ icon, label, used'));
  expectTrue('popup background media is conditional', popupJs.includes('backendMediaSeconds > 0') && popupJs.includes("label: '后台媒体'"));
  expectTrue('popup pip media is conditional', popupJs.includes('pipMediaSeconds > 0') && popupJs.includes("label: 'PiP'"));
  expectTrue('popup no undetermined bar in usage area', !popupJs.includes("待归类时长"));

  expectTrue('GET_CLOUD_STATUS exposes unbound localMode', messageRouterSource.includes('localMode: !isBound') && messageRouterSource.includes("reason: isBound ? null : 'no_device_token'"));
  expectTrue('GET_CLOUD_STATUS exposes syncEnabled from binding', messageRouterSource.includes('syncEnabled: isBound'));

  const total = passed + failed;
  console.log(`\n[Badge & Popup Mode V0] ${passed}/${total} passed${failed ? ` — ${failed} FAILED` : ''}`);
  if (failed > 0) process.exit(1);
}

run();
