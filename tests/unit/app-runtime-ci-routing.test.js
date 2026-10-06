const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { classifyPaths, validateGateResults } = require('../../tools/classify-app-runtime-ci-changes');

const root = path.resolve(__dirname, '../..');

function active(result) {
  return Object.entries(result)
    .filter(([key, value]) => key !== 'unclassified' && value)
    .map(([key]) => key)
    .sort();
}

const cases = [
  ['Changelog-only', ['app-runtime-management/docs/CHANGELOG.md'], ['docs']],
  ['Contracts documentation', ['app-runtime-management/contracts/README.md'], ['docs']],
  ['Backend documentation', ['app-runtime-management/backend/README.md'], ['docs']],
  ['Console documentation', ['app-runtime-management/console/README.md'], ['docs']],
  ['Worker rules', ['app-runtime-management/backend/src/data/product-catalog-rules.v2.json'], ['worker']],
  ['Console CSS', ['app-runtime-management/console/app-runtime.css'], ['console']],
  ['Removed Windows source', ['app-runtime-management/agents/windows/src/TimeOnChrome.AppRuntime.Service/Program.cs'], ['release_config']],
  ['Removed WiX source', ['app-runtime-management/installer/windows/Package.wxs'], ['release_config']],
  ['Shared contract', ['app-runtime-management/contracts/runtime-accounting-v2.vectors.json'], ['contracts', 'worker']],
  ['Production workflow', ['.github/workflows/app-runtime-production.yml'], ['release_config']],
  ['Native artifact gate', ['.github/workflows/timewhere-native-artifact-gate.yml'], ['native_artifact', 'release_config']],
  ['Native contract lock', ['tools/timewhere-native-contract-lock.json'], ['native_artifact', 'release_config']],
  ['Native artifact verifier', ['tools/verify-timewhere-native-artifact.js'], ['native_artifact', 'release_config']],
  ['Native artifact tests', ['tests/unit/timewhere-native-artifact.test.js'], ['native_artifact', 'release_config']],
];

for (const [name, paths, expected] of cases) {
  const result = classifyPaths(paths);
  assert.deepEqual(active(result), [...expected].sort(), name);
  assert.deepEqual(result.unclassified, [], name);
}

const combined = classifyPaths([
  'app-runtime-management/docs/TASK_BOARD.md',
  'app-runtime-management/backend/src/index.ts',
  'app-runtime-management/console/app-runtime.js',
]);
assert.deepEqual(active(combined), ['console', 'docs', 'worker']);

const full = classifyPaths([], { forceFull: true });
assert.deepEqual(active(full), [
  'console', 'contracts', 'docs', 'native_artifact', 'release_config', 'worker',
]);

const unknown = classifyPaths(['app-runtime-management/new-subsystem/file.txt']);
assert.deepEqual(unknown.unclassified, ['app-runtime-management/new-subsystem/file.txt']);

const requirements = { worker: true, console: false };
assert.doesNotThrow(() => validateGateResults(requirements, {
  changes: 'success', worker: 'success', console: 'skipped',
}));
assert.throws(() => validateGateResults(requirements, {
  changes: 'success', worker: 'failure', console: 'skipped',
}), /worker expected success/);
assert.throws(() => validateGateResults(requirements, {
  changes: 'success', worker: 'skipped', console: 'skipped',
}), /worker expected success/);
assert.throws(() => validateGateResults(requirements, {
  changes: 'success', worker: 'success', console: 'success',
}), /console expected skipped/);
assert.throws(() => validateGateResults(requirements, {
  changes: 'failure', worker: 'skipped', console: 'skipped',
}), /changes failed/);

const workflow = fs.readFileSync(path.join(root, '.github/workflows/app-runtime.yml'), 'utf8');
for (const job of ['changes', 'contracts-worker-console', 'console', 'release-config', 'app-runtime-gate']) {
  assert(new RegExp(`^  ${job}:`, 'm').test(workflow), `missing job ${job}`);
}
assert(/pull_request:\r?\n    types: \[opened, synchronize, reopened, edited\]\r?\n  push:/.test(workflow), 'PR workflow must provide gate including declaration edits, without path filters');
assert(workflow.includes("if: needs.changes.outputs.console == 'true'"));
assert(!workflow.includes('dotnet test app-runtime-management/agents/windows/'));
assert(!workflow.includes('swift test --package-path app-runtime-management/agents/macos'));
assert(workflow.includes("if: needs.changes.outputs.release_config == 'true'"));
assert(workflow.includes("if: needs.changes.outputs.native_artifact == 'true'\n        run: node tests/unit/timewhere-native-artifact.test.js"));
assert.equal(classifyPaths(['.github/workflows/app-runtime-production.yml']).native_artifact, false);
assert.equal(classifyPaths(['.github/workflows/app-runtime.yml']).native_artifact, false);
assert(workflow.includes('run: node tools/classify-app-runtime-ci-changes.js --verify-gate'));
const production=fs.readFileSync(path.join(root,'.github/workflows/app-runtime-production.yml'),'utf8');
const guardianIntegration=fs.readFileSync(path.join(root,'.github/workflows/app-runtime-guardian-integration.yml'),'utf8');
assert.equal(guardianIntegration.split("- 'workers/src/services/sourceStatistics.ts'").length-1,2,
  'source reader changes must trigger the existing Guardian job for both PR and master');
assert.equal(guardianIntegration.split("- 'tests/unit/source-statistics-cloud.test.js'").length-1,2,
  'source regression changes must trigger the existing Guardian job');
assert(guardianIntegration.includes('run: node tests/unit/source-statistics-cloud.test.js'),
  'the existing Guardian job must execute the actual source reader regression');
assert(production.includes('cmp pages/computer-usage-view.js "$RUNNER_TEMP/main-console-computer-usage-view.js"'),
  'existing Pages smoke must compare the real statistics renderer, not only HTML status');

console.log('app-runtime-ci-routing tests: PASS');
