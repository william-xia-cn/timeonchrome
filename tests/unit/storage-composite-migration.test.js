// Run with: node tests/unit/storage-composite-migration.test.js

'use strict';

const fs = require('fs');
const path = require('path');

const store = {};

global.chrome = {
  storage: {
    local: {
      get(keys, cb) {
        if (Array.isArray(keys)) {
          const out = {};
          keys.forEach((k) => { out[k] = store[k]; });
          cb(out);
          return;
        }
        if (typeof keys === 'string') {
          cb({ [keys]: store[keys] });
          return;
        }
        cb({ ...store });
      },
      set(obj, cb) {
        Object.assign(store, obj);
        cb && cb();
      },
      remove(keys, cb) {
        const arr = Array.isArray(keys) ? keys : [keys];
        arr.forEach((k) => delete store[k]);
        cb && cb();
      },
    },
  },
};

function loadProdModule(relPath, exportNames, injected = {}) {
  const abs = path.join(__dirname, '..', '..', relPath);
  let code = fs.readFileSync(abs, 'utf8');
  code = code.replace(/^\s*import .*?;\s*$/gm, '');
  code = code.replace(/export\s+async\s+function\s+/g, 'async function ');
  code = code.replace(/export\s+function\s+/g, 'function ');
  code = code.replace(/export\s+const\s+/g, 'const ');
  code = code.replace(/export\s*\{[^}]*\};?\s*$/gm, '');

  const injectedKeys = Object.keys(injected);
  const prelude = injectedKeys.length ? `const { ${injectedKeys.join(', ')} } = __injected;\n` : '';
  const factory = new Function('__injected', `${prelude}${code}\nreturn { ${exportNames.join(', ')} };`);
  return factory(injected);
}

const domainSemantics = loadProdModule('core/domain-semantics.js', ['matchDomain', 'normalizeHostname']);
const storageApi = loadProdModule(
  'infra/storage.js',
  ['getConfig', 'saveConfig', 'sanitizeStaleCompositeDomains'],
  {
    computeAllDomains: () => ({}),
    computeAllDomainsWithAudio: () => ({ domains: {}, audioSeconds: 0, backgroundMediaByDomain: {}, pipSeconds: 0, pipByDomain: {} }),
    emitTrace: async () => {},
    matchDomainV12: domainSemantics.matchDomain,
    normalizeHostname: domainSemantics.normalizeHostname,
  }
);

let passed = 0;
let failed = 0;

function expectEqual(desc, actual, expected) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) passed++;
  else {
    failed++;
    console.error(`  ✗ ${desc}`);
    console.error(`    expected: ${JSON.stringify(expected)}`);
    console.error(`    actual:   ${JSON.stringify(actual)}`);
  }
}

function expectTrue(desc, cond) {
  if (cond) passed++;
  else {
    failed++;
    console.error(`  ✗ ${desc}`);
  }
}

async function run() {
  const stale = {
    compositeList: ['google.com', 'www.bilibili.com', 'www.163.com', 'music.163.com'],
    customCompositeList: ['bilibili.com', '163.com', 'my-custom.com'],
    studyList: ['khanacademy.org'],
    unsafeList: ['douyin.com'],
    isInitialized: true,
  };

  const sanitized = storageApi.sanitizeStaleCompositeDomains(stale);
  expectTrue('sanitize 应标记 changed=true', sanitized.changed === true);
  expectEqual(
    'sanitize 应仅移除 4 个指定残留域名',
    sanitized.config.compositeList,
    ['google.com', 'music.163.com']
  );
  expectEqual(
    'sanitize 应清理 customCompositeList 残留域名',
    sanitized.config.customCompositeList,
    ['my-custom.com']
  );
  expectEqual('sanitize 不应影响 studyList', sanitized.config.studyList, ['khanacademy.org']);
  expectEqual('sanitize 不应影响 unsafeList', sanitized.config.unsafeList, ['douyin.com']);

  for (const key of Object.keys(store)) delete store[key];
  await storageApi.saveConfig({
    ...stale,
    adminPasswordHash: '',
    version: '1.3',
    mode: 'study',
  });

  const migrated = await storageApi.getConfig();
  expectEqual(
    'getConfig 应返回迁移后的 compositeList',
    migrated.compositeList,
    ['google.com', 'music.163.com']
  );
  expectEqual(
    'getConfig 应返回迁移后的 customCompositeList',
    migrated.customCompositeList,
    ['my-custom.com']
  );

  const total = passed + failed;
  console.log(`\n[Storage Composite Migration] ${passed}/${total} passed${failed ? ` — ${failed} FAILED` : ''}`);
  if (failed > 0) process.exit(1);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});

