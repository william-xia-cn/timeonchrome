const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');
const { spawnSync } = require('child_process');

const root = path.resolve(__dirname, '../..');
const workflow = fs.readFileSync(path.join(root, '.github/workflows/app-runtime-production.yml'), 'utf8');
for (const resource of ['runtime_worker', 'runtime_pages', 'guardian_worker', 'main_pages']) {
  const expectedDefault = resource.startsWith('runtime') ? 'true' : 'false';
  assert(new RegExp(`deploy_${resource}:\\s+description:[^\\n]+\\s+type: boolean\\s+default: ${expectedDefault}`).test(workflow));
  assert(workflow.includes(`if: inputs.deploy_${resource}`));
}
assert(workflow.includes("if: github.ref == 'refs/heads/master'"));
assert(workflow.includes("ref: '${{ github.sha }}'"));
assert(workflow.includes('cancel-in-progress: false'));
assert(workflow.includes('environment: production'));
assert(workflow.includes('vars.CLOUDFLARE_ACCOUNT_ID'));
assert(workflow.includes('actions: read'));
assert(workflow.indexOf('Missing production CLOUDFLARE_API_TOKEN') < workflow.indexOf('- run: npm ci'));
assert(workflow.includes('test "$GITHUB_SHA" = "$(git rev-parse origin/master)"'));
assert(workflow.includes("require_successful_workflow app-runtime.yml 'App Runtime'"));
assert(workflow.includes("require_successful_workflow app-runtime-guardian-integration.yml 'Guardian integration'"));
assert(workflow.includes("require_successful_workflow app-runtime-main-console.yml 'Main console'"));
assert(!workflow.includes('npm test --prefix app-runtime-management/backend'));
assert(!workflow.includes('npm run typecheck --prefix app-runtime-management/backend'));
assert(workflow.includes('Runtime Worker smoke'));
assert(workflow.includes('Runtime Pages smoke'));
assert(workflow.includes('Guardian fail-closed smoke'));
assert(workflow.includes('Main Pages smoke'));
assert(workflow.includes("default: ''"));
assert(workflow.includes('if [ "$actual" != "$EXPECTED_RUNTIME_MIGRATIONS" ]'));
assert(workflow.includes('[ "$APPLY_RUNTIME_MIGRATIONS" != true ]'));
assert(workflow.includes('APPLIED_RUNTIME_MIGRATIONS: ${{ steps.migrations.outputs.applied }}'));

const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'app-runtime-release-config-'));
try {
  const json = (file, value) => fs.writeFileSync(path.join(fixture, file), JSON.stringify(value));
  fs.mkdirSync(path.join(fixture, 'app-runtime-management/contracts'), { recursive: true });
  json('app-runtime-management/contracts/package.json', { version: '1.1.0' });
  const worker = [
    { created_on: '2026-09-14T00:00:00Z', versions: [{ percentage: 100, version_id: 'old-worker' }] },
    { created_on: '2026-09-15T00:00:00Z', versions: [{ percentage: 100, version_id: 'new-worker' }] },
  ];
  json('runtime-worker-deployments.json', worker);
  json('guardian-worker-deployments.json', [worker[0]]);
  // A missing Source must not match the new SHA before its real deployment.
  json('runtime-pages-deployments.json', [{ Id: 'unknown-source' }, { Id: 'new-page', Source: 'abcdef0', Deployment: 'https://example.invalid' }]);
  json('main-pages-deployments.json', [{ Id: 'unchanged-main', Source: '1234567' }]);
  json('runtime-r2-latest.json', { version: '2.0.6' });
  const run = (applied) => {
    const result = spawnSync(process.execPath, [path.join(root, 'tools/write-app-runtime-release-manifest.js')], {
      cwd: fixture, encoding: 'utf8', env: {
        ...process.env, GITHUB_SHA: 'abcdef0123456789', GITHUB_STEP_SUMMARY: '',
        APPLIED_RUNTIME_MIGRATIONS: applied, EXPECTED_RUNTIME_MIGRATIONS: 'must-not-be-recorded.sql',
        DEPLOY_RUNTIME_WORKER: 'true', DEPLOY_RUNTIME_PAGES: 'true',
        DEPLOY_GUARDIAN_WORKER: 'false', DEPLOY_MAIN_PAGES: 'false',
      },
    });
    assert.equal(result.status, 0, result.stderr);
    return JSON.parse(fs.readFileSync(path.join(fixture, 'app-runtime-production-manifest.json'), 'utf8'));
  };
  const manifest = run('0008_runtime_application_knowledge.sql');
  assert.equal(manifest.contractVersion, '1.1.0');
  assert.deepEqual(manifest.deployedResources, ['runtimeWorker', 'runtimePages']);
  assert.deepEqual(manifest.runtimeMigrations, ['0008_runtime_application_knowledge.sql']);
  assert.equal(manifest.runtimeWorkerVersion, 'new-worker');
  assert.equal(manifest.guardianWorkerVersion, 'old-worker');
  assert.equal(manifest.runtimePages.id, 'new-page');
  assert.equal(manifest.mainPages.id, 'unchanged-main');
  assert.equal(manifest.r2Latest.version, '2.0.6');
  assert.deepEqual(run('').runtimeMigrations, []);
} finally {
  fs.rmSync(fixture, { recursive: true, force: true });
}
console.log('app-runtime-release-config tests: PASS');
