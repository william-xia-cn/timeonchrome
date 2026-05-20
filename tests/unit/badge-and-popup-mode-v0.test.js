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
  const backgroundSource = fs.readFileSync(path.join(__dirname, '..', '..', 'background.js'), 'utf8');
  const messageRouterSource = fs.readFileSync(path.join(__dirname, '..', '..', 'message-router.js'), 'utf8');
  const popupHtml = fs.readFileSync(path.join(__dirname, '..', '..', 'popup', 'popup.html'), 'utf8');
  const popupJs = fs.readFileSync(path.join(__dirname, '..', '..', 'popup', 'popup.js'), 'utf8');
  const modeUsageSource = extractFunctionSource(popupJs, 'resolveModeUsageWithLive');

  expectTrue('badge mode map includes 学', backgroundSource.includes("return '学';"));
  expectTrue('badge mode map includes 综', backgroundSource.includes("return '综';"));
  expectTrue('badge mode map includes 休', backgroundSource.includes("return '休';"));
  expectTrue('badge mode map includes 停', backgroundSource.includes("return '停';"));
  expectTrue('badge text set from mode', /setBadgeText\(\{ text: modeText \}\)/.test(backgroundSource));
  expectTrue('pending badge uses mode-aware ellipsis', backgroundSource.includes("pending.fromMode === 'composite' ? '综…' : '休…'"));
  expectTrue('pending composite title contains remaining seconds', backgroundSource.includes('休息中 · 正在使用综合网站 · ${pending.remainingSeconds}秒后进入综合时间'));
  expectTrue('pending study title contains remaining seconds', backgroundSource.includes("正在使用学习网站 · ${pending.remainingSeconds}秒后进入学习时间"));

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
  expectTrue('popup renders snapshot before suspect summary completes', popupJs.includes('const snapshotPromise = getPopupLocalSnapshotSafe()') && popupJs.includes('snapshotPromise.then'));
  expectTrue('popup local snapshot uses shorter single-attempt timeout', popupJs.includes('attempts: 1') && popupJs.includes('timeoutMs: 900'));
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
  expectTrue('popup supports SWITCH_TO_COMPOSITE', popupJs.includes("SWITCH_TO_COMPOSITE"));
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
