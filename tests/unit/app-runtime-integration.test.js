const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.resolve(__dirname, '../..');
const bridge = fs.readFileSync(path.join(root, 'workers/src/services/appRuntimeIdentityBridge.ts'), 'utf8');
const worker = fs.readFileSync(path.join(root, 'workers/src/index.ts'), 'utf8');
const page = fs.readFileSync(path.join(root, 'pages/index.html'), 'utf8');
const runtimeConsole = fs.readFileSync(path.join(root, 'app-runtime-management/console/app-runtime.js'), 'utf8');
const redirects = fs.readFileSync(path.join(root, 'pages/_redirects'), 'utf8');
const contracts = JSON.parse(fs.readFileSync(path.join(root, 'app-runtime-management/contracts/package.json'), 'utf8'));

assert.equal(contracts.name, '@timeonchrome/app-runtime-contracts');
assert.equal(contracts.version, '1.4.0');
assert(bridge.includes("from '@timeonchrome/app-runtime-contracts'"));
assert(!bridge.includes('../../../app-runtime-management/'));
assert(worker.includes("path === '/app-runtime/sso/tickets'"));
assert(page.includes('class="nav-item mobile-secondary-nav runtime-launch"'));
assert(page.includes("api('/app-runtime/sso/tickets', 'POST', { childId: currentProfileId })"));
assert(bridge.includes('selected_child_id'));
assert(bridge.includes("!children.some((child) => child.id === requestedChildId)"));
assert(runtimeConsole.includes('if (window.__runtimeLaunchTicket)'));
assert(runtimeConsole.includes('child(state.session.selectedChildId)'));
assert(redirects.includes('/app-runtime/* /?launch=app-runtime 302'));
assert(!fs.existsSync(path.join(root, 'pages/app-runtime')));
assert(!fs.existsSync(path.join(root, 'tools/stage-app-runtime-console.js')));
assert(fs.existsSync(path.join(root, 'tools/write-app-runtime-release-manifest.js')));
assert(fs.readFileSync(path.join(root, '.github/workflows/app-runtime-production.yml'), 'utf8').includes('expected_runtime_migrations'));
console.log('app-runtime-integration tests: PASS');
