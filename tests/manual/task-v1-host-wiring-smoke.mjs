// Browser smoke for generic optional-module message, alarm and inline Admin wiring.
// The source extension remains default-off; Task is installed only in the temporary copy.
import { chromium } from 'playwright';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const tempRoot = resolve(root, '.tmp', `task-v1-host-${Date.now()}`);
const extensionPath = resolve(tempRoot, 'extension');
const profilePath = resolve(tempRoot, 'profile');
const outputPath = resolve(root, 'output', 'playwright');
const TASK_ID = 'task-v1-host-smoke';
const TASK_PULL_ALARM = 'taskManagementPull';

function assert(value, message, detail = '') {
  if (!value) throw new Error(`${message}${detail ? `: ${detail}` : ''}`);
  console.log(`PASS ${message}`);
}

async function storage(worker, method, payload) {
  return worker.evaluate(({ method, payload }) => new Promise((done) => {
    chrome.storage.local[method](payload, done);
  }), { method, payload });
}

async function waitForAlarm(worker, name) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const alarm = await worker.evaluate((alarmName) => new Promise((done) => chrome.alarms.get(alarmName, done)), name);
    if (alarm) return alarm;
    await new Promise((done) => setTimeout(done, 100));
  }
  return null;
}

function fakeJwt() {
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${encode({ alg: 'none' })}.${encode({ exp: Math.floor(Date.now() / 1000) + 3600 })}.host-smoke`;
}

function taskCache(nowMs) {
  return {
    schemaVersion: 1,
    capability: 'taskManagementV1',
    pulledAt: nowMs,
    serverTime: nowMs,
    taskVersion: 1,
    reason: 'local_admin_debug',
    tasks: [{
      id: TASK_ID,
      name: 'Task Host Wiring Smoke',
      lifecycleStatus: 'open',
      plannedStartAt: nowMs - 60_000,
      requiredSeconds: 600,
      completedSeconds: 0,
      revision: 1,
      debugOnly: true,
      resourceSpec: {
        hosts: ['khanacademy.org'],
        urlRules: [{ url: 'https://example.com/practice', match: 'exact' }],
        specialTargets: [],
      },
    }],
  };
}

function prepareTemporaryExtension() {
  cpSync(resolve(root, 'extension'), extensionPath, { recursive: true });
  const backgroundPath = resolve(extensionPath, 'background.js');
  const source = readFileSync(backgroundPath, 'utf8');
  assert(!source.includes("./modules/task/install.js"), 'source package remains default-off');
  writeFileSync(backgroundPath, `import './modules/task/install.js'; // temporary host smoke activation\n${source}`, 'utf8');
}

async function run() {
  prepareTemporaryExtension();
  mkdirSync(profilePath, { recursive: true });
  mkdirSync(outputPath, { recursive: true });
  let context;
  try {
    context = await chromium.launchPersistentContext(profilePath, {
      headless: false,
      args: [
        `--disable-extensions-except=${extensionPath}`,
        `--load-extension=${extensionPath}`,
        '--no-sandbox',
      ],
    });
    await context.route('https://guardian-api.william-xia-cn.workers.dev/**', (route) => {
      route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ error: 'host_smoke_offline' }) });
    });
    const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker', { timeout: 15_000 });
    const extensionId = new URL(worker.url()).host;
    const nowMs = Date.now();
    await storage(worker, 'set', {
      account_token: fakeJwt(),
      cloud_device_token: 'host-smoke-device-token',
      cloud_profile_id: 'host-smoke-profile',
      cloud_profile_name: 'Host Smoke',
      guardian_config: { enabled: true },
      task_management_v1_cache: taskCache(nowMs),
    });

    const alarm = await waitForAlarm(worker, TASK_PULL_ALARM);
    assert(alarm?.name === TASK_PULL_ALARM, 'Task runtime registers its alarm for generic forwarding');

    const admin = await context.newPage();
    const pageErrors = [];
    admin.on('pageerror', (error) => pageErrors.push(error.message));
    await admin.goto(`chrome-extension://${extensionId}/admin/admin.html?view=stats`, { waitUntil: 'domcontentloaded' });
    await admin.waitForSelector('#main-screen', { state: 'visible', timeout: 10_000 });
    const entries = await admin.evaluate(() => chrome.runtime.sendMessage({ type: 'GET_OPTIONAL_MODULE_ENTRIES' }));
    assert(entries?.ok === true && entries.entries?.some((entry) => entry.id === 'task-management-v1' && entry.uiKind === 'inline'), 'generic message exposes installed Task entry');
    const model = await admin.evaluate(() => chrome.runtime.sendMessage({ optionalModuleId: 'task-management-v1', type: 'GET_TASK_READ_MODEL' }));
    assert(model?.enforcingTasks?.some((task) => task.id === 'task-v1-host-smoke'), 'generic module message reaches Task runtime');
    await admin.locator('.nav-item[data-page="system-management"]').click();
    await admin.locator('[data-system-management-tab="extension-modules"]').click();
    const toggle = admin.locator('[data-optional-module-toggle="task-management-v1"]');
    await toggle.waitFor({ state: 'visible', timeout: 10_000 });
    await toggle.click();
    const panel = admin.locator('#optional-module-panel-task-management-v1');
    await panel.locator('#task-list').waitFor({ state: 'visible', timeout: 10_000 });
    await admin.waitForFunction(() => document.querySelector('#optional-module-panel-task-management-v1')?.dataset.mounted === 'true');
    const panelText = await panel.innerText();
    assert(panelText.includes('Task Host Wiring Smoke'), 'generic Admin host mounts Task inline UI', panelText);
    assert(panelText.includes('计划开始'), 'inline UI renders planned start time', panelText);
    assert(panelText.includes('khanacademy.org') && panelText.includes('https://example.com/practice'), 'inline UI renders every configured resource', panelText);
    assert(pageErrors.length === 0, 'generic Admin host has no page errors', pageErrors.join(' | '));

    await admin.setViewportSize({ width: 1180, height: 900 });
    await admin.screenshot({ path: resolve(outputPath, 'task-v1-host-inline-desktop.png'), fullPage: true });
    await admin.setViewportSize({ width: 430, height: 900 });
    await admin.screenshot({ path: resolve(outputPath, 'task-v1-host-inline-narrow.png'), fullPage: true });
    console.log('\nTask V1 host wiring smoke PASS');
  } finally {
    await context?.close().catch(() => {});
    if (existsSync(tempRoot)) rmSync(tempRoot, { recursive: true, force: true });
  }
}

run().catch((error) => {
  console.error(error?.stack || error);
  process.exit(1);
});
