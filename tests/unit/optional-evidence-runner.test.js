const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

const code = ts.transpileModule(fs.readFileSync('extension/infra/optional-evidence-runner.js', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText;
const moduleState = { exports: {} };
vm.runInNewContext(code, { module: moduleState, exports: moduleState.exports,
  AbortController, Promise, setTimeout, clearTimeout });

async function main() {
  const syncSource = fs.readFileSync('extension/infra/cloud-sync.js', 'utf8');
  assert.match(syncSource, /if \(!shouldRunFollowUpSync\) optionalCompositeEvidenceSync\.start\(\)/);
  assert.doesNotMatch(syncSource.slice(syncSource.indexOf('export async function syncStatsFoundationV1')),
    /await syncCompositePageEvidence\(/);
  let release;
  let aborted = false;
  const runner = moduleState.exports.createOptionalEvidenceRunner(async signal => {
    await new Promise(resolve => { release = resolve; signal.addEventListener('abort', () => { aborted = true; resolve(); }, { once: true }); });
  }, { timeoutMs: 20 });
  const mainSync = async () => { runner.start(); return { complete: true }; };
  assert.deepEqual(await mainSync(), { complete: true });
  assert.equal(runner.busy, true, 'optional request remains pending after main completion');
  assert.equal(runner.start(), false, 'one optional upload at a time');
  await new Promise(resolve => setTimeout(resolve, 40));
  assert.equal(aborted, true, 'timeout aborts the actual task signal');
  assert.equal(runner.busy, false);
  assert.equal(runner.start(), true, 'next sync can retry after cancellation');
  await Promise.resolve();
  release();
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(runner.busy, false);
  console.log('Optional evidence runner: nonblocking, single-flight, abort and retry PASS');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
