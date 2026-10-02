import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createUsageAccount, hashUsageAccountValue, canonicalUsageAccountJson,
  parseUsageAccountRows, verifyUsageAccountManifest, validateUsageAccountDimensions,
  usageAccountDayStart } from './dist/usage-account.js';

const vectors = JSON.parse(readFileSync(new URL('./usage-account.vectors.json', import.meta.url), 'utf8'));
const schema = JSON.parse(readFileSync(new URL('./usage-account.schema.json', import.meta.url), 'utf8'));
assert.equal(schema.additionalProperties, false);
assert.equal(schema.$defs.row.additionalProperties, false);
assert.equal(schema.properties.rowCount.maximum, 10000);
const start = usageAccountDayStart('2026-09-27');
const header = { schemaVersion: 1, sourceKind: 'application', durationUnit: 'milliseconds', timezone: 'Asia/Shanghai',
  date: '2026-09-27', revision: 1, generatedAtMs: start + 86400000, settledThroughMs: start + 86400000,
  algorithmVersion: 'app-union-v1', policyVersions: [0], associationVersion: null, correctionVersion: 0,
  rawFactCount: 1, rawFactHash: 'a'.repeat(64), complete: true, reasonCodes: [] };
const row = (kind, hour, duration, category = null, subjectKey = null, displayName = null) =>
  ({ kind, hour, duration, category, subjectKey, displayName });
for (const v of vectors.vectors) {
  const rows = [row('total', null, v.duration), ...Array.from({ length: 24 }, (_, h) => row('total', h, h === v.hour ? v.duration : 0)),
    ...v.categories.flatMap(c => [row('category', null, c.duration, c.category), row('category', v.hour, c.duration, c.category)])];
  const original = JSON.stringify(rows);
  const account = await createUsageAccount({ ...header, sourceKind: v.sourceKind, durationUnit: v.durationUnit }, rows);
  assert.equal(validateUsageAccountDimensions(account.rows).total, v.expectedTotal, v.id);
  assert.equal(JSON.stringify(rows), original, 'producer facts not mutated');
  assert.deepEqual(await verifyUsageAccountManifest(account.manifest), account.manifest);
  assert.equal(await hashUsageAccountValue(account.chunks[0].rows), account.chunks[0].chunkHash);
}
assert.equal(canonicalUsageAccountJson(vectors.canonicalHashVector.input), vectors.canonicalHashVector.canonical);
assert.equal(await hashUsageAccountValue(vectors.canonicalHashVector.input), vectors.canonicalHashVector.sha256);
assert.equal(canonicalUsageAccountJson(vectors.unicodeHashVector.input), vectors.unicodeHashVector.canonical);
assert.equal(await hashUsageAccountValue(vectors.unicodeHashVector.input), vectors.unicodeHashVector.sha256);
const totals = [row('total', null, 0), ...Array.from({ length: 24 }, (_, h) => row('total', h, 0))];
const base = await createUsageAccount(header, totals);
await assert.rejects(verifyUsageAccountManifest({ ...base.manifest, revision: 2 }), /HASH_MISMATCH/);
await assert.rejects(verifyUsageAccountManifest({ ...base.manifest, childId: 'forged' }), /INVALID_FIELDS/);
await assert.rejects(createUsageAccount({ ...header, durationUnit: 'seconds' }, totals), /INVALID_SCHEMA/);
await assert.rejects(createUsageAccount({ ...header, complete: false }, totals), /INVALID_COMPLETENESS/);
const incomplete = await createUsageAccount({ ...header, complete: false, reasonCodes: ['SOURCE_GAP'] }, totals);
assert.equal(incomplete.manifest.complete, false);
assert.throws(() => usageAccountDayStart('2026-02-30'), /INVALID_DATE/);
assert.throws(() => usageAccountDayStart('1969-12-31'), /INVALID_DATE/);
assert.throws(() => validateUsageAccountDimensions([row('total', null, 1), ...totals.slice(1)]), /DIMENSION_MISMATCH/);
assert.throws(() => parseUsageAccountRows([base.rows[0], base.rows[0]]), /DUPLICATE_ROW/);
assert.throws(() => parseUsageAccountRows([{ ...totals[0], duration: 0.5 }]), /INVALID_ROW/);
assert.throws(() => parseUsageAccountRows([{ ...totals[0], path: 'private' }]), /INVALID_FIELDS/);
assert.throws(() => validateUsageAccountDimensions([row('total', null, 1),
  ...Array.from({ length: 24 }, (_, h) => row('total', h, h === 0 ? 1 : 0)),
  row('category', null, 1, 'study'), row('category', 1, 1, 'study')]), /HOUR_EXCEEDS_TOTAL/);
const many = [...totals, ...Array.from({ length: 60 }, (_, n) =>
  [row('subject', null, 0, null, `product-${n}`, `Product ${n}`), row('subject', 0, 0, null, `product-${n}`, `Product ${n}`)]).flat()];
const chunked = await createUsageAccount(header, many);
assert.deepEqual(chunked.chunks.map(c => c.rows.length), [100, 45]);
assert.throws(() => parseUsageAccountRows(Array(10001).fill(totals[0])), /INVALID_ROWS/);
console.log('usage-account: golden vectors and compatibility/integrity checks passed');
