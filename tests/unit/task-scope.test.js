const assert = require('assert/strict');
const { assertIntegrationSources, checkScope, declaration, mergeParents, relevant } = require('../../tools/check-task-scope');
const check = (role, paths, exceptions, integrationSourcePaths) => checkScope(paths, { role, exceptions, integrationSourcePaths });
assert.deepEqual(check('architecture-integration', ['contracts/composite-page-evidence/v1.js', 'app-runtime-management/contracts/src/index.ts', 'PROJECT_WORKFLOW.md', 'tools/check-task-scope.js']), []);
assert.deepEqual(check('standard-cloud', ['app-runtime-management/backend/src/index.ts', 'app-runtime-management/console/index.html', 'workers/src/index.ts', 'pages/index.html']), []);
for (const file of ['extension/infra/native-host-client.js', 'dist/native-host-managed-candidate/package-extension/a.js', 'agents/Service/a.cs']) {
  assert.equal(check('architecture-integration', [file], { [file]: 'tiny patch' }).length, 1);
}
assert.equal(check('extension-local', ['app-runtime-management/contracts/src/index.ts']).length, 1);
assert.equal(check('standard-cloud', ['app-runtime-management/contracts/src/index.ts']).length, 1);
assert.equal(check('architecture-integration', ['app-runtime-management/backend/src/index.ts']).length, 1);
assert.equal(check('architecture-integration', ['workers/src/index.ts']).length, 1);
const joint = declaration('Task-Role: architecture-integration\nTask-Additional-Role: standard-cloud');
assert.deepEqual(checkScope(['contracts/shared.js','app-runtime-management/backend/package.json',
  'app-runtime-management/backend/test/example.ts','app-runtime-management/console/index.html','workers/src/index.ts','pages/index.html'], joint), []);
for (const file of ['extension/background.js','dist/package-extension/a.js','agents/Service/a.cs',
  'extension/modules/task/domain.js','workers/src/modules/task/router.ts','native-app-control/a.ts','pages/native-apps/index.html']) {
  assert.equal(checkScope([file], {...joint, exceptions:{[file]:'joint task'}}).length, 1);
}
assert.equal(checkScope(['package-lock.json'], joint).length, 1);
for (const body of ['Task-Role: standard-cloud\nTask-Additional-Role: architecture-integration',
  'Task-Role: architecture-integration\nTask-Additional-Role: extension-local',
  'Task-Role: architecture-integration\nTask-Additional-Role:',
  'Task-Role: architecture-integration\nTask-Additional-Role: standard-cloud\nTask-Additional-Role: standard-cloud']) {
  assert.throws(()=>declaration(body));
}
assert.throws(()=>checkScope([], {role:'standard-cloud',additionalRole:'extension-local'}));
assert.deepEqual(check('extension-local', ['extension/background.js', 'tests/unit/local-guardian.test.js']), []);
assert.deepEqual(check('task-local', ['extension/modules/task/domain.js', 'pages/task/index.html', 'workers/src/modules/task/router.ts', 'workers/migrations/021_task_management_v1.sql']), []);
assert.equal(check('task-local', ['extension/background.js']).length, 1);
assert.equal(check('extension-local', ['extension/modules/task/domain.js']).length, 1);
assert.equal(check('standard-cloud', ['workers/src/modules/task/router.ts']).length, 1);
assert.deepEqual(check('santa-specialist', ['native-app-control/a.ts', 'pages/native-apps/index.html', 'workers/src/services/nativeAppIdentityBridge.ts', 'workers/migrations/022_native_app_identity_bridge.sql']), []);
assert.equal(check('santa-specialist', ['workers/src/index.ts']).length, 1);
assert.equal(check('standard-cloud', ['workers/migrations/022_native_app_identity_bridge.sql']).length, 1);
assert.deepEqual(check('native-local', ['agents/a.cs', 'third_party/contracts-1.15.tgz', 'contracts.lock.json']), []);
assert.equal(check('native-local', ['app-runtime-management/backend/a.ts']).length, 1);
assert.deepEqual(check('standard-cloud', ['workers/src/index.ts', 'workers/migrations/035.sql', 'pages/index.html']), []);
for (const file of ['workers/src/index.ts', 'pages/index.html']) {
  assert.equal(check('extension-local', [file], { [file]: 'small fix' }).length, 1);
}
for (const file of ['native-app-control/a.ts', 'pages/native-apps/index.html', 'workers/src/services/nativeAppIdentityBridge.ts']) {
  assert.equal(check('standard-cloud', [file], { [file]: 'cloud' }).length, 1);
}
assert.equal(check('architecture-integration', ['package-lock.json']).length, 1);
assert.deepEqual(check('architecture-integration', ['package-lock.json'], { 'package-lock.json': 'pin contract dependency only' }), []);
assert.throws(() => declaration('Task-Role: architecture-integration\nScope-Exception: * | all'));
const cloudSource = '4e748f6735c52ee4cb6cfdcab51785235bb7a5e6';
const extensionSource = 'dd92791e6c94c125c1034af821683d9dc5f7d502';
const integrationDeclaration = declaration(`Task-Role: architecture-integration\nIntegration-Source: ${cloudSource}\nIntegration-Source: ${extensionSource}`);
assert.deepEqual(integrationDeclaration.integrationSources, [cloudSource, extensionSource]);
assert.throws(() => declaration('Task-Role: standard-cloud\nIntegration-Source: ' + cloudSource));
assert.throws(() => declaration('Task-Role: architecture-integration\nIntegration-Source: xyz'));
assert.throws(() => declaration(`Task-Role: architecture-integration\nIntegration-Source: ${cloudSource}\nIntegration-Source: ${cloudSource}`));
assert.deepEqual([...mergeParents(`aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb ${cloudSource}\n`)].sort(), [cloudSource, 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'].sort());
assert.throws(() => mergeParents('not-a-merge'));
assert.doesNotThrow(() => assertIntegrationSources([cloudSource], `aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb ${cloudSource}\n`));
assert.throws(() => assertIntegrationSources([extensionSource], `aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb ${cloudSource}\n`), /not a direct parent/);
const integratedPaths = ['extension/background.js', 'app-runtime-management/backend/src/index.ts', 'contracts/shared-access/v1.js'];
assert.deepEqual(checkScope(integratedPaths, { role: 'architecture-integration', integrationSourcePaths: integratedPaths }), []);
assert.equal(checkScope(['extension/other.js'], { role: 'architecture-integration', integrationSourcePaths: integratedPaths }).length, 1);
assert.equal(checkScope(['app-runtime-management/backend/src/index.ts'], { role: 'extension-local', integrationSourcePaths: integratedPaths }).length, 1);
assert.throws(() => declaration('Task-Role: runtime-cloud-contract'));
assert.throws(() => declaration('Task-Role: nope'));
assert.throws(() => declaration('Task-Role: release\nTask-Role: extension-local'));
assert.throws(() => check('native-local', ['../TimeOnchrome/extension/a.js']));
assert.equal(relevant(['workers/src/index.ts']), true);
assert.equal(relevant(['workers/src/index.ts', 'TASK_BOARD.md', 'AGENTS.md']), true);
assert.equal(relevant(['native-app-control/a.ts', 'TASK_BOARD.md']), true);
assert.equal(relevant(['tools/check-task-scope.js']), true);
assert.equal(relevant(['contracts/composite-page-evidence/v1.js']), true);
assert.equal(relevant(['app-runtime-management/docs/TASK_BOARD.md']), true);
assert.deepEqual(check('release', ['docs/release/checklist.md']), []);
assert.equal(check('release', ['extension/a.js']).length, 1);
const fs = require('fs');
const workflow = fs.readFileSync('.github/workflows/app-runtime.yml', 'utf8');
assert.ok(workflow.includes('node tools/check-task-scope.js --github-event'));
assert.ok(workflow.includes('node tests/unit/task-scope.test.js'));
const { classifyPaths } = require('../../tools/classify-app-runtime-ci-changes');
assert.equal(classifyPaths(['app-runtime-management/docs/TASK_BOARD.md']).worker, false);
assert.equal(classifyPaths(['tools/check-task-scope.js']).release_config, true);
console.log('Task scope fixed cases: PASS');
