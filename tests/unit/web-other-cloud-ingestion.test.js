// D-114: "other" is a classification/quota bucket, never an execution mode.
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const source = fs.readFileSync(path.join(__dirname, '../../workers/src/routes/stats.ts'), 'utf8');
const between = (start, end) => source.slice(source.indexOf(start), source.indexOf(end, source.indexOf(start)));
const snippet = [
  between('const VALID_CHANNELS =', '// One D1 batch statement'),
  between('function normalizeTargetKey(', 'function hasDeclaredPositiveDuration('),
  between('function expandTargetStatsRows(', 'function validateMediaSegment('),
  between('function validateSegment(', 'function validateStatsV1Domain('),
  'globalThis.subject = { expandTargetStatsRows, validateSegment, VALID_MODES, VALID_QUOTA_BUCKETS, VALID_TARGET_CLASSIFICATIONS };',
].join('\n');
const js = ts.transpileModule(snippet, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
const context = { normalizeHostname: (value) => value, globalThis: {} };
vm.runInNewContext(js, context, { filename: 'stats.ts#other' });
const { expandTargetStatsRows, validateSegment, VALID_MODES, VALID_QUOTA_BUCKETS, VALID_TARGET_CLASSIFICATIONS } = context.globalThis.subject;

assert.equal(VALID_MODES.has('other'), false);
assert.equal(VALID_QUOTA_BUCKETS.has('other'), true);
assert.equal(VALID_TARGET_CLASSIFICATIONS.has('other'), true);
const segment = { id: 'other-1', date: '2026-10-02', startMs: 1000, endMs: 2000,
  durationSeconds: 1, domain: 'example.com', channel: 'active', mode: 'study',
  targetClassificationAtTime: 'other', quotaBucketAtTime: 'other' };
assert.equal(validateSegment(segment), null);
assert.match(validateSegment({ ...segment, mode: 'other' }), /segment\.mode/);

const target = { targetKey: 'target-1', targetClassificationAtTime: 'other',
  rows: [{ channel: 'active', mode: 'study', quotaBucket: 'other', durationSeconds: 7 }] };
const rows = expandTargetStatsRows([target]);
assert.equal(rows.length, 1);
assert.equal(rows[0].mode, 'study');
assert.equal(rows[0].quotaBucket, 'other');
assert.equal(rows[0].targetClassificationAtTime, 'other');

const fallback = expandTargetStatsRows([{ targetKey: 'target-2', activeByQuotaBucket: { other: 3 } }]);
assert.equal(fallback.length, 1);
assert.equal(fallback[0].mode, 'unknown');
assert.equal(fallback[0].quotaBucket, 'other');

assert.match(source, /VALID_QUOTA_BUCKETS\.has\(s\.quotaBucketAtTime\)/);
assert.match(source, /VALID_TARGET_CLASSIFICATIONS\.has\(effective\.targetClassification\)/);
assert.equal((source.match(/VALID_QUOTA_BUCKETS\.has\(quotaBucket\)/g) || []).length, 4);
console.log('D-114 cloud other attribution: PASS');
