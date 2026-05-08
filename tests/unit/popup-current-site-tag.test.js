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

function run() {
  const popupJsPath = path.join(__dirname, '..', '..', 'popup', 'popup.js');
  const source = fs.readFileSync(popupJsPath, 'utf8');
  const context = {
    console,
    URL,
    setTimeout,
    clearTimeout,
    document: {
      addEventListener() {},
      getElementById() { return null; },
    },
    chrome: {
      runtime: {
        sendMessage(_, cb) { if (typeof cb === 'function') cb({}); },
        onMessage: { addListener() {} },
        getURL() { return ''; },
      },
      tabs: { create() {} },
      storage: {
        local: { get(_, cb) { if (typeof cb === 'function') cb({}); } },
      },
    },
  };
  vm.runInNewContext(`${source}\nthis.__resolveDomainTag = resolveDomainTag;`, context, { filename: 'popup.js' });
  const resolveDomainTag = context.__resolveDomainTag;

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

  console.log('[popup-current-site-tag] 6/6 passed');
}

run();
