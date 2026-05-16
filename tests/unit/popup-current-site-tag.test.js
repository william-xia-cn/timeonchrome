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
  const popupJsPath = path.join(__dirname, '..', '..', 'popup', 'popup.js');
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
            cb(msg?.type === 'GET_RUNTIME_MODE_STATUS' ? { mode: 'composite' } : {});
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
this.__formatRuntimeTodayDuration = formatRuntimeTodayDuration;
this.__setMode = setMode;
`, context, { filename: 'popup.js' });
  const resolveDomainTag = context.__resolveDomainTag;
  const resolveTodayDomainSeconds = context.__resolveTodayDomainSeconds;
  const resolveLiveSessionSeconds = context.__resolveLiveSessionSeconds;
  const formatRuntimeTodayDuration = context.__formatRuntimeTodayDuration;
  const setMode = context.__setMode;

  expectEqual('no domain -> 不计时页面', resolveDomainTag(null, {}), '不计时页面');
  expectEqual(
    'study domain -> 学习网站',
    resolveDomainTag('chatgpt.com', { studyList: ['chatgpt.com'] }),
    '学习网站'
  );
  expectEqual(
    'composite domain -> 综合网站',
    resolveDomainTag('youtube.com', { compositeList: ['youtube.com'] }),
    '综合网站'
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
    formatRuntimeTodayDuration(75),
    '今日 1分15秒'
  );
  expectEqual(
    'runtime duration adds durable plus live seconds',
    formatRuntimeTodayDuration(
      resolveTodayDomainSeconds('desmos.com', { 'www.desmos.com': 180 }) +
      resolveLiveSessionSeconds('desmos.com', { currentDomain: 'desmos.com', currentSessionDurationSeconds: 60 })
    ),
    '今日 4分'
  );
  await setMode('composite');
  const modeSwitch = sentMessages.find((msg) => msg?.type === 'SWITCH_TO_COMPOSITE');
  expectEqual('popup mode switch passes noticeTabId', JSON.stringify(modeSwitch), JSON.stringify({
    type: 'SWITCH_TO_COMPOSITE',
    noticeTabId: 123,
  }));

  console.log('[popup-current-site-tag] 14/14 passed');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
