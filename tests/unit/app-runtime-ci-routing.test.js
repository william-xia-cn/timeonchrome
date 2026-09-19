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
  ['Worker rules', ['app-runtime-management/backend/src/data/product-catalog-rules.v2.json'], ['worker']],
  ['Console CSS', ['app-runtime-management/console/app-runtime.css'], ['console']],
  ['Windows Service', ['app-runtime-management/agents/windows/src/TimeOnChrome.AppRuntime.Service/Program.cs'], ['windows']],
  ['WiX', ['app-runtime-management/installer/windows/Package.wxs'], ['installer']],
  ['Shared contract', ['app-runtime-management/contracts/runtime-accounting-v2.vectors.json'], ['contracts', 'macos', 'windows', 'worker']],
  ['Production workflow', ['.github/workflows/app-runtime-production.yml'], ['release_config']],
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
  'console', 'contracts', 'docs', 'installer', 'macos', 'release_config', 'windows', 'worker',
]);

const unknown = classifyPaths(['app-runtime-management/new-subsystem/file.txt']);
assert.deepEqual(unknown.unclassified, ['app-runtime-management/new-subsystem/file.txt']);

const requirements = { worker: true, console: false, windows: false };
assert.doesNotThrow(() => validateGateResults(requirements, {
  changes: 'success', worker: 'success', console: 'skipped', windows: 'skipped',
}));
assert.throws(() => validateGateResults(requirements, {
  changes: 'success', worker: 'failure', console: 'skipped', windows: 'skipped',
}), /worker expected success/);
assert.throws(() => validateGateResults(requirements, {
  changes: 'success', worker: 'skipped', console: 'skipped', windows: 'skipped',
}), /worker expected success/);
assert.throws(() => validateGateResults(requirements, {
  changes: 'success', worker: 'success', console: 'success', windows: 'skipped',
}), /console expected skipped/);
assert.throws(() => validateGateResults(requirements, {
  changes: 'failure', worker: 'skipped', console: 'skipped', windows: 'skipped',
}), /changes failed/);

const workflow = fs.readFileSync(path.join(root, '.github/workflows/app-runtime.yml'), 'utf8');
for (const job of ['changes', 'contracts-worker-console', 'console', 'windows', 'windows-installer', 'macos', 'release-config', 'app-runtime-gate']) {
  assert(new RegExp(`^  ${job}:`, 'm').test(workflow), `missing job ${job}`);
}
assert(workflow.includes('pull_request:\n  push:'), 'PR workflow must always provide the required gate');
assert(workflow.includes("if: needs.changes.outputs.console == 'true'"));
assert(workflow.includes("if: needs.changes.outputs.windows == 'true'"));
assert(workflow.includes("if: needs.changes.outputs.installer == 'true'"));
assert(workflow.includes("if: needs.changes.outputs.macos == 'true'"));
assert(workflow.includes("if: needs.changes.outputs.release_config == 'true'"));
assert(workflow.includes('run: node tools/classify-app-runtime-ci-changes.js --verify-gate'));

console.log('app-runtime-ci-routing tests: PASS');
