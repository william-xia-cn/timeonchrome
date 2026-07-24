// popup-current-site-tag.test.js
// Run with: node tests/unit/popup-current-site-tag.test.js

const fs = require('fs');
const path = require('path');
const vm = require('vm');

function expectEqual(name, actual, expected) {
  if (actual !== expected) {
    throw new Error(`${name}: expected "${expected}", got "${actual}"`);
  }
}

async function run() {
  const popupJsPath = path.join(__dirname, '..', '..', 'extension', 'popup', 'popup.js');
  const source = fs.readFileSync(popupJsPath, 'utf8');
  const elements = new Map();
  const elementFor = (id) => {
    if (!elements.has(id)) {
      elements.set(id, {
        id,
        style: {},
        className: '',
        disabled: false,
        innerHTML: '',
        textContent: '',
        addEventListener() {},
      });
    }
    return elements.get(id);
  };
  const sentMessages = [];
  const context = {
    console,
    URL,
    setTimeout,
    clearTimeout,
    document: {
      addEventListener() {},
      getElementById(id) { return elementFor(id); },
    },
    chrome: {
      runtime: {
        sendMessage(msg, cb) {
          sentMessages.push(msg);
          if (typeof cb === 'function') {
            cb({});
          }
        },
        onMessage: { addListener() {} },
        getURL() { return ''; },
      },
      tabs: {
        create() {},
        query() { return Promise.resolve([{ id: 123, url: 'https://desmos.com/calculator' }]); },
      },
      storage: {
        local: { get(_, cb) { if (typeof cb === 'function') cb({}); } },
      },
    },
  };
  vm.runInNewContext(`
${source}
this.__resolveDomainTag = resolveDomainTag;
this.__resolveTodayDomainSeconds = resolveTodayDomainSeconds;
this.__resolveLiveSessionSeconds = resolveLiveSessionSeconds;
this.__resolveModeUsageWithLive = resolveModeUsageWithLive;
this.__formatRuntimeSessionDuration = formatRuntimeSessionDuration;
this.__setMode = setMode;
this.__renderRuntimeStatus = renderRuntimeStatus;
this.__previewSiteClassificationTarget = previewSiteClassificationTarget;
`, context, { filename: 'popup.js' });
  const resolveDomainTag = context.__resolveDomainTag;
  const resolveTodayDomainSeconds = context.__resolveTodayDomainSeconds;
  const resolveLiveSessionSeconds = context.__resolveLiveSessionSeconds;
  const resolveModeUsageWithLive = context.__resolveModeUsageWithLive;
  const formatRuntimeSessionDuration = context.__formatRuntimeSessionDuration;
  const setMode = context.__setMode;
  const renderRuntimeStatus = context.__renderRuntimeStatus;
  const previewSiteClassificationTarget = context.__previewSiteClassificationTarget;

  expectEqual('no domain -> 不计时页面', resolveDomainTag(null, {}), '不计时页面');
  let preview = previewSiteClassificationTarget('example.com');
  expectEqual('preview domain scope', preview.scopeLabel, '整个域名');
  expectEqual('preview domain normalized', preview.normalizedValue, 'example.com');
  preview = previewSiteClassificationTarget('learn.example.com');
  expectEqual('preview subdomain scope', preview.scopeLabel, '子域名');
  preview = previewSiteClassificationTarget('https://example.com/a?x=1#hash');
  expectEqual('preview exact url scope', preview.scopeLabel, '当前完整链接');
  expectEqual('preview exact url strips hash', preview.normalizedValue, 'https://example.com/a?x=1');
  preview = previewSiteClassificationTarget('https://www.youtube.com/watch?v=4CTQpUJRcSM&list=PLPsx331rqafXopGlbWJw-9SFh3E7ZGe1M&index=3&t=2s');
  expectEqual('preview youtube playlist scope', preview.scopeLabel, 'YouTube 播放列表');
  expectEqual('preview youtube playlist canonical', preview.normalizedValue, 'https://www.youtube.com/playlist?list=PLPsx331rqafXopGlbWJw-9SFh3E7ZGe1M');
  expectEqual('preview youtube playlist summary text', preview.summaryValue, '系统将按「YouTube 播放列表」申请，已识别为 YouTube 播放列表 list=PLPsx331rqafXopGlbWJw-9SFh3E7ZGe1M。');
  preview = previewSiteClassificationTarget('https://youtu.be/4CTQpUJRcSM?t=2');
  expectEqual('preview youtube video scope', preview.scopeLabel, 'YouTube 视频');
  expectEqual('preview youtube video canonical', preview.normalizedValue, 'https://www.youtube.com/watch?v=4CTQpUJRcSM');
  expectEqual(
    'study domain -> 学习网站',
    resolveDomainTag('chatgpt.com', { studyList: ['chatgpt.com'] }),
    '学习网站'
  );
  expectEqual(
    'custom study domain -> 学习网站',
    resolveDomainTag('baidu.com', { customStudyList: ['baidu.com'] }),
    '学习网站'
  );
  expectEqual(
    'rejected exact URL -> 受限娱乐网站',
    resolveDomainTag('www.youtube.com', {
      siteClassificationRulesV1: [{
        targetType: 'url',
        normalizedValue: 'https://www.youtube.com/playlist?list=PL1',
        decision: 'reject',
      }],
    }, 'https://www.youtube.com/playlist?list=PL1'),
    '受限娱乐网站'
  );
  expectEqual(
    'composite domain -> 复合网站',
    resolveDomainTag('youtube.com', { compositeList: ['youtube.com'] }),
    '复合网站'
  );
  expectEqual(
    'default composite domain -> 复合网站',
    resolveDomainTag('wikipedia.org', { defaultCompositeSites: ['wikipedia.org'] }),
    '复合网站'
  );
  expectEqual(
    'child study domain overrides parent composite tag',
    resolveDomainTag('docs.google.com', { compositeList: ['google.com'], studyList: ['docs.google.com'] }),
    '学习网站'
  );
  expectEqual(
    'unlisted child inherits parent composite tag',
    resolveDomainTag('mail.google.com', { compositeList: ['google.com'], studyList: ['docs.google.com'] }),
    '复合网站'
  );
  expectEqual(
    'restricted domain -> 受限娱乐网站',
    resolveDomainTag('bilibili.com', { restrictedEntertainmentList: ['bilibili.com'] }),
    '受限娱乐网站'
  );
  expectEqual(
    'rest domain -> 休息网站',
    resolveDomainTag('example-rest.com', { entertainmentList: ['example-rest.com'] }),
    '休息网站'
  );
  expectEqual(
    'unknown domain -> 未归类网站',
    resolveDomainTag('unknown.example', {}),
    '未归类网站'
  );
  expectEqual(
    'auto pending host record -> 未归类网站访问记录',
    resolveDomainTag('sina.com.cn', {
      siteClassificationRequestsV1: [{
        status: 'pending',
        recordSource: 'auto_unclassified_access',
        requestedTargetType: 'host',
        requestedNormalizedValue: 'sina.com.cn',
      }],
    }, 'https://sina.com.cn/'),
    '未归类网站访问记录'
  );
  expectEqual(
    'manual learning request -> 已申请归为学习网站',
    resolveDomainTag('study-request.example', {
      siteClassificationRequestsV1: [{
        status: 'pending',
        recordSource: 'manual_learning_request',
        requestedClassification: 'study',
        requestedTargetType: 'host',
        requestedNormalizedValue: 'study-request.example',
      }],
    }, 'https://study-request.example/'),
    '已申请归为学习网站'
  );
  expectEqual(
    'legacy pending record -> 历史网站归类记录',
    resolveDomainTag('legacy.example', {
      siteClassificationRequestsV1: [{
        status: 'pending',
        requestedTargetType: 'host',
        requestedNormalizedValue: 'legacy.example',
      }],
    }, 'https://legacy.example/'),
    '历史网站归类记录'
  );
  expectEqual(
    'auto pending exact url record -> 未归类网站访问记录',
    resolveDomainTag('example.com', {
      siteClassificationRequestsV1: [{
        status: 'pending',
        recordSource: 'auto_unclassified_access',
        requestedTargetType: 'url',
        requestedNormalizedValue: 'https://example.com/path?a=1',
      }],
    }, 'https://example.com/path?a=1#hash'),
    '未归类网站访问记录'
  );  expectEqual(
    'returned site classification request -> 未归类网站',
    resolveDomainTag('returned.example.com', {
      siteClassificationRequestsV1: [{
        status: 'returned',
        requestedTargetType: 'host',
        requestedNormalizedValue: 'returned.example.com',
      }],
    }, 'https://returned.example.com/'),
    '未归类网站'
  );
  expectEqual(
    'durable today stats normalize matching www domain',
    resolveTodayDomainSeconds('desmos.com', { 'www.desmos.com': 180 }),
    180
  );
  expectEqual(
    'live session adds current domain seconds',
    resolveLiveSessionSeconds('desmos.com', { currentDomain: 'www.desmos.com', currentSessionDurationSeconds: 75 }),
    75
  );
  expectEqual(
    'live session ignores mismatched domain',
    resolveLiveSessionSeconds('desmos.com', { currentDomain: 'khanacademy.org', currentSessionDurationSeconds: 75 }),
    0
  );
  expectEqual(
    'live session ignores null duration',
    resolveLiveSessionSeconds('desmos.com', { currentDomain: 'desmos.com', currentSessionDurationSeconds: null }),
    0
  );
  expectEqual(
    'runtime duration shows seconds for live debugging',
    formatRuntimeSessionDuration(75),
    '本次 1分15秒'
  );
  expectEqual(
    'runtime duration uses live session only',
    formatRuntimeSessionDuration(
      resolveLiveSessionSeconds('desmos.com', { currentDomain: 'desmos.com', currentSessionDurationSeconds: 60 })
    ),
    '本次 1分'
  );
  expectEqual(
    'mode usage adds live seconds to current study mode only',
    JSON.stringify(resolveModeUsageWithLive(
      { studySeconds: 120, restSeconds: 15, compositeSeconds: 90, onlineSeconds: 225 },
      { studyList: ['desmos.com'] },
      { mode: 'study', currentDomain: 'desmos.com', currentSessionDurationSeconds: 30 }
    )),
    JSON.stringify({ studySeconds: 150, restSeconds: 15, compositeSeconds: 90, onlineSeconds: 255, liveSeconds: 30 })
  );
  expectEqual(
    'mode usage keeps settled mode attribution instead of reclassifying domains',
    JSON.stringify(resolveModeUsageWithLive(
      { studySeconds: 0, restSeconds: 0, compositeSeconds: 60, onlineSeconds: 60, 'desmos.com': 999 },
      { studyList: ['desmos.com'] },
      { mode: 'rest', currentDomain: 'other.example', currentSessionDurationSeconds: 0 }
    )),
    JSON.stringify({ studySeconds: 0, restSeconds: 0, compositeSeconds: 60, onlineSeconds: 60, liveSeconds: 0 })
  );
  expectEqual(
    'mode usage ignores mismatched live session domain',
    JSON.stringify(resolveModeUsageWithLive(
      { studySeconds: 180, compositeSeconds: 0, onlineSeconds: 180 },
      { studyList: ['desmos.com'] },
      { mode: 'study', currentDomain: '', currentSessionDurationSeconds: 30 }
    )),
    JSON.stringify({ studySeconds: 180, restSeconds: 0, compositeSeconds: 0, onlineSeconds: 180, liveSeconds: 0 })
  );
  expectEqual(
    'popup reads backgroundMediaSeconds from mode stats',
    String(source.includes('stats.backgroundMediaSeconds || stats.audioSeconds')),
    'true'
  );
  renderRuntimeStatus({});
  const compactHtml = elementFor('runtime-compact').innerHTML;
  const notTimedCount = (compactHtml.match(/不计时页面/g) || []).length;
  expectEqual('runtime status hides duplicate untracked page tag', notTimedCount, 1);
  renderRuntimeStatus({ currentDomain: 'baidu.com', currentSessionDurationSeconds: 3, config: { customStudyList: ['baidu.com'] } });
  expectEqual(
    'runtime status uses snapshot config for current site tag',
    elementFor('runtime-compact').innerHTML.includes('学习网站') ? 'tagged' : 'missing',
    'tagged'
  );
  await setMode('composite');
  const modeSwitch = sentMessages.find((msg) => msg?.type === 'REQUEST_MODE_CHANGE');
  expectEqual('popup mode switch passes noticeTabId', JSON.stringify(modeSwitch), JSON.stringify({
    type: 'REQUEST_MODE_CHANGE',
    toMode: 'composite',
    source: 'popup',
    reason: 'manual_mode_switch',
    noticeTabId: 123,
  }));
  expectEqual(
    'popup mode switch keeps optimistic mode when runtime status is empty',
    elementFor('btn-composite').className.includes('active-composite') ? 'active' : 'inactive',
    'active'
  );

  console.log('[popup-current-site-tag] 26/26 passed');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
