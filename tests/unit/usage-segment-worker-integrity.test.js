// Run with: node tests/unit/usage-segment-worker-integrity.test.js

'use strict';

const fs = require('fs');
const path = require('path');
const ts = require('typescript');

function loadModule(relPath, exportNames, injected = {}) {
  let code = fs.readFileSync(path.join(__dirname, '..', '..', relPath), 'utf8');
  code = code.replace(/^\s*import .*?;\s*$/gm, '');
  code = code.replace(/export\s+async\s+function\s+/g, 'async function ');
  code = code.replace(/export\s+function\s+/g, 'function ');
  const names = Object.keys(injected);
  return new Function('__injected', `const { ${names.join(', ')} } = __injected;\n${code}\nreturn { ${exportNames.join(', ')} };`)(injected);
}

function check(label, condition, detail = '') {
  if (!condition) throw new Error(`${label}${detail ? `: ${detail}` : ''}`);
}

function makeDb() {
  const rows = new Map();
  function statement(kind, args = []) {
    return {
      kind,
      args,
      bind(...nextArgs) { return statement(kind, nextArgs); },
      async all() {
        if (kind !== 'select_usage') throw new Error(`unexpected all: ${kind}`);
        return { results: args.map((id) => rows.get(id)).filter(Boolean) };
      },
      async run() { return { success: true }; },
    };
  }
  return {
    rows,
    prepare(sql) {
      if (sql.includes('INSERT INTO usage_segments_v1')) return statement('insert_usage');
      if (sql.includes('FROM usage_segments_v1 WHERE id IN')) return statement('select_usage');
      if (sql.includes('INSERT INTO segment_upload_log')) return statement('upload_log');
      throw new Error(`unexpected SQL: ${sql.slice(0, 80)}`);
    },
    async batch(statements) {
      for (const item of statements) {
        if (item.kind !== 'insert_usage') throw new Error(`unexpected batch statement: ${item.kind}`);
        const a = item.args;
        if (rows.has(a[0])) continue;
        rows.set(a[0], {
          id: a[0], profile_id: a[1], device_id: a[2], date: a[3], timezone: a[4],
          day_start_ms: a[5], day_end_ms: a[6], start_ms: a[7], end_ms: a[8], duration_seconds: a[9],
          domain: a[10], channel: a[11], mode: a[12], source_state: a[13], settlement_reason: a[14],
          parent_segment_id: a[15], part_index: a[16], part_count: a[17],
          tab_id: a[21], window_id: a[22], description_json: a[23],
          managed_target_id: a[24], managed_target_type: a[25], managed_target_namespace: a[26],
          managed_target_value: a[27], managed_target_label_at_time: a[28], target_source_at_time: a[29],
          target_rule_id: a[30], target_match_level: a[31], target_classification_at_time: a[32],
          quota_bucket_at_time: a[33],
        });
      }
      return statements.map(() => ({ success: true }));
    },
  };
}

(async () => {
  const domain = loadModule('extension/core/domain-semantics.js', ['normalizeHostname']);
  const integrity = loadModule('extension/core/usage-segment-integrity.js', [
    'hashUsageSegmentContent', 'isUsageSegmentContentHash',
  ], { normalizeHostname: domain.normalizeHostname });
  const source = fs.readFileSync(path.join(__dirname, '..', '..', 'workers', 'src', 'routes', 'stats.ts'), 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const routeModule = { exports: {} };
  const routeRequire = (id) => {
    if (id === '../db/middleware') return {
      json: (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }),
      verifyAccountToken: async () => 'account-test',
    };
    if (id === '../../../extension/core/domain-semantics.js') return domain;
    if (id === '../../../extension/core/usage-segment-integrity.js') return integrity;
    if (id === './deviceIdentity') return {
      verifyDeviceToken: async () => ({ profileId: 'profile-test', deviceId: 'device-test', unbound: false }),
      deviceUnboundResponse: () => new Response('{}', { status: 409 }),
    };
    if (id === '../services/siteClassificationEmail') return {
      evaluateDailyUnclassifiedEmailNotifications: async () => {},
      processEmailClassificationOutbox: async () => {},
    };
    if (id === './systemAccessConfig') return { isSystemAccessAdmin: () => false };
    if (id === '../services/usageAccountingCorrections') return {
      applyCorrectionsToV1StatsRows: (rows) => rows,
      compactUsageAccountingCorrectionDeltas: () => [],
      listUsageAccountingCorrections: async () => [],
    };
    throw new Error(`unexpected require: ${id}`);
  };
  new Function('require', 'module', 'exports', compiled)(routeRequire, routeModule, routeModule.exports);
  const router = routeModule.exports.statsRouter;
  const db = makeDb();
  const env = { DB: db };
  const segment = {
    id: 'segment-integrity-route', date: '2026-09-12', timezone: 'Asia/Shanghai',
    dayStartMs: 1000, dayEndMs: 2000, startMs: 1100, endMs: 1160, durationSeconds: 60,
    domain: 'example.com', channel: 'active', mode: 'rest', sourceState: 'ACTIVE',
    settlementReason: 'checkpoint', partIndex: 1, partCount: 1,
    managedTargetId: 'target-1', managedTargetType: 'domain', targetClassificationAtTime: 'restricted',
    quotaBucketAtTime: 'rest',
  };
  segment.contentHash = await integrity.hashUsageSegmentContent(segment);
  async function upload(item) {
    const response = await router.handle(new Request('https://worker.test/device/usage-segments/v1', {
      method: 'POST',
      headers: { authorization: 'Bearer test', 'content-type': 'application/json' },
      body: JSON.stringify({ batchId: 'batch-test', segments: [item] }),
    }), env);
    return { response, body: await response.json() };
  }

  const first = await upload(segment);
  check('new fact is accepted with matching hash', first.response.status === 200 && first.body.accepted?.[0]?.contentHash === segment.contentHash, JSON.stringify(first.body));
  const exact = await upload({ ...segment, updatedAt: Date.now() });
  check('same id and content is idempotently accepted', exact.response.status === 200 && exact.body.accepted?.length === 1, JSON.stringify(exact.body));

  const changed = { ...segment, quotaBucketAtTime: 'study' };
  changed.contentHash = await integrity.hashUsageSegmentContent(changed);
  const conflict = await upload(changed);
  check('same id with different content is rejected', conflict.response.status === 200 && conflict.body.rejected?.[0]?.code === 'SEGMENT_CONTENT_CONFLICT', JSON.stringify(conflict.body));
  check('conflicting upload does not overwrite persisted fact', db.rows.get(segment.id).quota_bucket_at_time === 'rest');

  const forged = await upload({ ...segment, contentHash: '0'.repeat(64) });
  check('forged content hash is rejected before persistence', forged.response.status === 400 && forged.body.rejected?.[0]?.code === 'CONTENT_HASH_MISMATCH', JSON.stringify(forged.body));

  const legacy = { ...segment };
  delete legacy.contentHash;
  const legacyResult = await upload(legacy);
  check('old client without hash remains compatible with new Worker', legacyResult.response.status === 200 && legacyResult.body.acceptedIds?.[0] === segment.id, JSON.stringify(legacyResult.body));
  console.log('[Usage Segment Worker Integrity] 6/6 passed');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
