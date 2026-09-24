'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '../../extension/infra/cloud-sync.js'), 'utf8');
const match = source.match(/export async function readDeviceCorrectionEvidenceWeek\(\) \{[\s\S]*?\n\}\n\nasync function cloudRequest/);
assert.ok(match, 'read-only correction evidence function exists');
const functionSource = match[0].slice(0, -'\n\nasync function cloudRequest'.length).replace(/^export /, '');

function createReader(pages, token = 'fixture-token') {
  const calls = [];
  const fetchStub = async (url, options) => {
    calls.push({ url: String(url), authorization: options.headers.Authorization });
    const next = pages.shift();
    return { ok: next?.ok !== false, async json() { return next; } };
  };
  const reader = new Function('syncState', 'getCloudApiBase', 'fetch',
    `${functionSource}; return readDeviceCorrectionEvidenceWeek;`)(
    { deviceToken: token }, () => 'https://fixture.invalid', fetchStub);
  return { reader, calls };
}

(async () => {
  const first = { schemaVersion: 2, anchorAtMs: 100, total: 2, revision: 'v1',
    weekStart: '2026-09-21', weekEnd: '2026-09-27', nextOffset: 1,
    items: [{ segmentId: 'a' }] };
  const second = { ...first, nextOffset: null, items: [{ segmentId: 'b' }] };
  const success = createReader([first, second]);
  const result = await success.reader();
  assert.deepEqual(result.items.map((item) => item.segmentId), ['a', 'b']);
  assert.equal(success.calls.length, 2);
  assert.ok(success.calls[1].url.includes('offset=1'));
  assert.ok(success.calls[1].url.includes('anchorAtMs=100'));
  assert.ok(success.calls.every((call) => call.authorization === 'Bearer fixture-token'));
  const changed = createReader([first, { ...second, revision: 'v2' }]);
  await assert.rejects(changed.reader(), /CORRECTION_EVIDENCE_REVISION_CHANGED/);
  const incomplete = createReader([{ ...first, nextOffset: null }]);
  await assert.rejects(incomplete.reader(), /CORRECTION_EVIDENCE_INCOMPLETE/);
  const unbound = createReader([], null);
  await assert.rejects(unbound.reader(), /CORRECTION_EVIDENCE_UNAVAILABLE/);
  assert.equal(unbound.calls.length, 0);
  console.log('[Browser correction evidence] passed');
})().catch((error) => { console.error(error); process.exitCode = 1; });
