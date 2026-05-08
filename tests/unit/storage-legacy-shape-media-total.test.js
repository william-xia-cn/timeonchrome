'use strict';

const fs = require('fs');
const path = require('path');

class MockStorage {
  constructor() { this.data = {}; }
  async get(keys) {
    if (keys === null) return { ...this.data };
    if (Array.isArray(keys)) {
      const out = {};
      keys.forEach((k) => { out[k] = this.data[k]; });
      return out;
    }
    if (typeof keys === 'string') return { [keys]: this.data[keys] };
    if (typeof keys === 'object') {
      const out = {};
      Object.keys(keys).forEach((k) => { out[k] = this.data[k] ?? keys[k]; });
      return out;
    }
    return {};
  }
  async set(obj) { Object.assign(this.data, obj); }
}

const mockLocal = new MockStorage();
global.chrome = { storage: { local: mockLocal, session: mockLocal } };

function loadProdModule(relPath, exportNames, injected = {}) {
  const abs = path.join(__dirname, '..', '..', relPath);
  let code = fs.readFileSync(abs, 'utf-8');
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

const storageApi = loadProdModule('infra/storage.js', ['getTodayStats', 'getDateKey'], {
  computeAllDomains: () => ({}),
  computeAllDomainsWithAudio: () => ({ domains: {}, audioSeconds: 0, backgroundMediaByDomain: {}, pipSeconds: 0, pipByDomain: {} }),
  matchDomainV12: () => false,
  normalizeHostname: (h) => h,
  emitTrace: () => {},
});

async function run() {
  const today = storageApi.getDateKey();
  await mockLocal.set({
    daily_usage_stats_v1: {
      [today]: {
        date: today,
        domains: {
          'video.example.com': {
            activeSeconds: 120,
            backgroundMediaSeconds: 30,
            pipSeconds: 50,
            totalSeconds: 200,
          },
        },
      },
    },
  });

  const stats = await storageApi.getTodayStats();
  if (stats['video.example.com'] !== 200) {
    throw new Error(`expected merged domain total=200, got ${stats['video.example.com']}`);
  }
  if (stats.audioSeconds !== 30) {
    throw new Error(`expected audioSeconds=30, got ${stats.audioSeconds}`);
  }
  if (stats.pipSeconds !== 50) {
    throw new Error(`expected pipSeconds=50, got ${stats.pipSeconds}`);
  }
  if ((stats.backgroundMediaByDomain || {})['video.example.com'] !== 30) {
    throw new Error('expected backgroundMediaByDomain to retain domain contribution');
  }
  if ((stats.pipByDomain || {})['video.example.com'] !== 50) {
    throw new Error('expected pipByDomain to retain domain contribution');
  }

  console.log('PASS storage-legacy-shape-media-total');
}

run().catch((err) => {
  console.error('FAIL storage-legacy-shape-media-total:', err?.message || err);
  process.exit(1);
});
