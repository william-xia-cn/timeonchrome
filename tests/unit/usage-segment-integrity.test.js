// Run with: node tests/unit/usage-segment-integrity.test.js

'use strict';

const fs = require('fs');
const path = require('path');

function loadModule(relPath, exportNames, injected = {}) {
  let code = fs.readFileSync(path.join(__dirname, '..', '..', 'extension', relPath), 'utf8');
  code = code.replace(/^\s*import .*?;\s*$/gm, '');
  code = code.replace(/export\s+async\s+function\s+/g, 'async function ');
  code = code.replace(/export\s+function\s+/g, 'function ');
  const names = Object.keys(injected);
  return new Function('__injected', `const { ${names.join(', ')} } = __injected;\n${code}\nreturn { ${exportNames.join(', ')} };`)(injected);
}

function check(label, condition, detail = '') {
  if (!condition) throw new Error(`${label}${detail ? `: ${detail}` : ''}`);
}

(async () => {
  const domain = loadModule('core/domain-semantics.js', ['normalizeHostname']);
  const integrity = loadModule('core/usage-segment-integrity.js', [
    'normalizeUsageSegmentContent', 'serializeUsageSegmentContent',
    'hashUsageSegmentContent', 'isUsageSegmentContentHash',
  ], { normalizeHostname: domain.normalizeHostname });
  const segment = {
    id: 'seg-integrity-1', date: '2026-09-12', timezone: 'Asia/Shanghai',
    dayStartMs: 100, dayEndMs: 200, startMs: 120, endMs: 180, durationSeconds: 60,
    domain: 'WWW.Example.COM.', channel: 'active', mode: 'rest', sourceState: 'ACTIVE',
    settlementReason: 'checkpoint', parentSegmentId: null, partIndex: 1, partCount: 1,
    tabId: 7, windowId: 9, description: { z: 2, a: { y: true, x: 1 } },
    managedTargetId: ' target-1 ', managedTargetType: 'domain', managedTargetNamespace: 'generic',
    managedTargetValue: 'example.com', managedTargetLabelAtTime: 'Example', targetSourceAtTime: 'system',
    targetRuleId: 'rule-1', targetMatchLevel: 'domain', targetClassificationAtTime: 'restricted',
    quotaBucketAtTime: 'rest', createdAt: 111, updatedAt: 222, uploadedAt: null,
  };
  const reordered = {
    ...segment,
    domain: 'www.example.com',
    tabId: '7',
    description: { a: { x: 1, y: true }, z: 2 },
    managedTargetId: 'target-1',
    createdAt: 999,
    updatedAt: 1000,
    uploadedAt: 1001,
  };
  const hash = await integrity.hashUsageSegmentContent(segment);
  check('hash is lowercase SHA-256', integrity.isUsageSegmentContentHash(hash), hash);
  check('canonical equivalents and transport metadata share hash', hash === await integrity.hashUsageSegmentContent(reordered));
  check('quota bucket changes hash', hash !== await integrity.hashUsageSegmentContent({ ...segment, quotaBucketAtTime: 'study' }));
  check('classification changes hash', hash !== await integrity.hashUsageSegmentContent({ ...segment, targetClassificationAtTime: 'study' }));
  check('time changes hash', hash !== await integrity.hashUsageSegmentContent({ ...segment, endMs: 181 }));
  console.log('[Usage Segment Integrity] 5/5 passed');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
