// Local runtime smoke for the independent optional Task module.
import { chromium } from 'playwright';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { existsSync, mkdirSync, rmSync } from 'fs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const extensionPath = resolve(root, 'extension');
const temp = resolve(root, '.tmp', `task-v1-local-${Date.now()}`);
const output = resolve(root, 'output', 'playwright');
const TASK_CACHE_KEY = 'task_management_v1_cache';
const TASK_SEGMENTS_KEY = 'task_progress_segments_v1';
const TASK_ID = 'task-v1-local-smoke';
function assert(value, message, detail = '') { if (!value) throw new Error(`${message}${detail ? `: ${detail}` : ''}`); console.log(`PASS ${message}`); }
async function storage(worker, method, payload) { return worker.evaluate(({ method, payload }) => new Promise((resolve) => chrome.storage.local[method](payload, resolve)), { method, payload }); }
function fakeJwt() {
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${encode({ alg: 'none' })}.${encode({ exp: Math.floor(Date.now() / 1000) + 3600 })}.local-smoke`;
}
function cache(now) {
  return {
    schemaVersion: 1,
    capability: 'taskManagementV1',
    pulledAt: now,
    serverTime: now,
    taskVersion: 1,
    error: null,
    reason: 'local_admin_debug',
    tasks: [{
      id: TASK_ID,
      name: 'Task V1 Local Smoke',
      lifecycleStatus: 'open',
      plannedStartAt: now - 60000,
      requiredSeconds: 600,
      completedSeconds: 0,
      revision: 1,
      debugOnly: true,
      resourceSpec: {
        hosts: ['collegeboard.org', 'khanacademy.org'],
        urlRules: [
          { url: 'https://example.com/practice', match: 'exact' },
          { url: 'https://example.com/course', match: 'path_prefix' },
        ],
        specialTargets: [{ platform: 'youtube', type: 'video', canonicalTarget: 'https://youtube.com/watch?v=video123' }],
      },
    }],
  };
}
async function waitFor(page, fragment) { for (let i = 0; i < 40; i += 1) { if (page.url().includes(fragment)) return true; await page.waitForTimeout(200); } return false; }
async function openInlineTaskAdmin(context, id, worker, now) {
  const taskAdmin = await context.newPage();
  taskAdmin.on('pageerror', (error) => console.log('PAGEERROR', error.message));
  taskAdmin.on('console', (message) => { if (message.type() === 'error') console.log('PAGECONSOLE', message.text()); });
  await storage(worker, 'set', { [TASK_CACHE_KEY]: cache(now) });
  await taskAdmin.goto(`chrome-extension://${id}/admin/admin.html`, { waitUntil: 'domcontentloaded' });
  await taskAdmin.waitForSelector('#main-screen', { state: 'visible', timeout: 10000 });
  await taskAdmin.evaluate(() => document.querySelector('.nav-item[data-page="modules"]')?.click());
  await taskAdmin.waitForSelector('#page-modules.active', { timeout: 10000 });
  await taskAdmin.waitForSelector('#page-modules.active #optional-module-list [data-module-toggle="task-management-v1"]', { state: 'visible', timeout: 10000 });
  await taskAdmin.evaluate(() => document.querySelector('#page-modules.active [data-module-toggle="task-management-v1"]')?.click());
  await taskAdmin.waitForSelector('#page-modules.active #optional-module-list #debug-panel', { state: 'attached', timeout: 10000 });
  await taskAdmin.waitForFunction(() => {
    const panel = document.querySelector('#page-modules.active #optional-module-list #debug-panel');
    return panel && panel.hidden === false && document.querySelector('#page-modules.active #environment-label')?.textContent?.includes('开发调试');
  }, null, { timeout: 10000 });
  const debugVisible = await taskAdmin.locator('#page-modules.active #optional-module-list #debug-panel').evaluate((panel) => panel.hidden === false);
  assert(debugVisible, 'unpacked development build shows inline local debug panel', await taskAdmin.locator('#optional-module-list').innerText());
  await taskAdmin.locator('#optional-module-list #refresh-btn').click();
  await taskAdmin.waitForTimeout(300);
  return taskAdmin;
}
async function run() {
  mkdirSync(temp, { recursive: true });
  let context;
  try {
    context = await chromium.launchPersistentContext(temp, {
      headless: false,
      args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`, '--no-sandbox'],
    });
    await context.route('https://guardian-api.william-xia-cn.workers.dev/profiles**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ profiles: [{ id: 'profile-smoke', name: 'Smoke' }] }) }));
    for (const host of ['https://example.com/**', 'https://www.example.com/**']) await context.route(host, (route) => route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>Non Task</title>' }));
    for (const host of ['https://khanacademy.org/**', 'https://www.khanacademy.org/**']) await context.route(host, (route) => route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>Task Resource</title><main>Practice</main>' }));
    for (const host of ['https://collegeboard.org/**', 'https://www.collegeboard.org/**']) await context.route(host, (route) => route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>Task Resource Link</title><main>College Board</main>' }));
    const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker', { timeout: 15000 });
    const id = new URL(worker.url()).host;
    const now = Date.now();
    await storage(worker, 'set', {
      account_token: fakeJwt(),
      cloud_device_token: 'local-smoke-device-token',
      cloud_profile_id: 'profile-smoke',
      cloud_profile_name: 'Smoke',
      cloud_credentials: btoa('smoke@example.com:local'),
      privacy_consent_v1: { accepted: true, acceptedAt: now, policyVersion: '2026-06-22', source: 'task_smoke' },
      guardian_config: { enabled: true, mode: 'study', studyList: ['khanacademy.org'], compositeList: [], restrictedEntertainmentList: [], unsafeList: [], dailyStudyQuota: 1440, dailyRestQuota: 1440, dailyUndeterminedQuota: 1440, quotaState: { onlineLocked: false, studyLocked: false, restLocked: false, undeterminedLocked: false } },
    });
    const consentPage = await context.newPage();
    await consentPage.goto(`chrome-extension://${id}/popup/popup.html`, { waitUntil: 'domcontentloaded' });
    await consentPage.evaluate(() => chrome.runtime.sendMessage({ type: 'PRIVACY_CONSENT_ACCEPTED', source: 'task_smoke' }));
    await consentPage.close();

    const taskAdmin = await openInlineTaskAdmin(context, id, worker, now);
    const taskAdminText = await taskAdmin.locator('#optional-module-list').innerText();
    assert(taskAdminText.includes('Task V1 Local Smoke'), 'inline Task Admin renders cached task', taskAdminText);
    assert(taskAdminText.includes('计划开始'), 'inline Task Admin renders planned start time', taskAdminText);
    assert(['collegeboard.org', 'khanacademy.org', 'https://example.com/practice', 'https://example.com/course', 'https://youtube.com/watch?v=video123'].every((value) => taskAdminText.includes(value)), 'inline Task Admin renders every host URL and YouTube resource on its own row', taskAdminText);
    assert(await taskAdmin.locator('#optional-module-list #resource-draft-list .resource-row').count() === 5, 'debug form hydrates all five saved resources');
    assert(await taskAdmin.locator('#optional-module-list #name').inputValue() === 'Task V1 Local Smoke', 'debug form hydrates saved task fields');
    await taskAdmin.selectOption('#optional-module-list #resource-kind', 'host');
    await taskAdmin.fill('#optional-module-list #resource-input', 'not a host');
    await taskAdmin.click('#optional-module-list #add-resource-btn');
    assert((await taskAdmin.locator('#optional-module-list #resource-message').innerText()).includes('第 1 行'), 'local editor identifies an invalid input line');
    await taskAdmin.fill('#optional-module-list #resource-input', 'www.khanacademy.org');
    await taskAdmin.click('#optional-module-list #add-resource-btn');
    assert(await taskAdmin.locator('#optional-module-list #resource-draft-list .resource-row').count() === 5 && (await taskAdmin.locator('#optional-module-list #resource-message').innerText()).includes('跳过 1 个重复项'), 'local editor skips canonical duplicates without losing resources');
    await taskAdmin.click('#optional-module-list #save-btn');
    await taskAdmin.waitForTimeout(700);
    const saveMessage = await taskAdmin.locator('#optional-module-list #error').innerText();
    assert(saveMessage.includes('已写入本地调试任务'), 'local editor reports normalized save success', saveMessage);
    mkdirSync(output, { recursive: true });
    await taskAdmin.setViewportSize({ width: 1180, height: 900 });
    await taskAdmin.screenshot({ path: resolve(output, 'task-v1-local-inline-desktop.png'), fullPage: true });
    await taskAdmin.setViewportSize({ width: 430, height: 900 });
    await taskAdmin.screenshot({ path: resolve(output, 'task-v1-local-inline-narrow.png'), fullPage: true });

    const popup = await context.newPage();
    await popup.goto(`chrome-extension://${id}/popup/popup.html`, { waitUntil: 'domcontentloaded' });
    assert(!(await popup.locator('body').innerText()).includes('Task V1 Local Smoke'), 'base Popup remains Task-unaware');
    const blocked = await context.newPage();
    await blocked.goto('https://example.com/not-task', { waitUntil: 'domcontentloaded' });
    assert(await waitFor(blocked, 'modules/task/ui/required.html'), 'non-task resource opens independent Task required page', blocked.url());
    await blocked.waitForSelector('.resource-link');
    const requiredLinks = blocked.locator('.resource-link');
    assert(await requiredLinks.count() === 5, 'Task required page renders all allowed resources as links');
    assert((await requiredLinks.evaluateAll((links) => links.every((link) => /^https:\/\//.test(link.href)))), 'every Task required resource has a safe clickable destination');
    await blocked.setViewportSize({ width: 1180, height: 900 });
    await blocked.screenshot({ path: resolve(output, 'task-v1-required-desktop.png'), fullPage: true });
    await blocked.setViewportSize({ width: 430, height: 900 });
    await blocked.screenshot({ path: resolve(output, 'task-v1-required-narrow.png'), fullPage: true });
    await requiredLinks.first().click();
    await blocked.waitForLoadState('domcontentloaded');
    assert(!blocked.url().includes('required.html'), 'clicking an allowed resource leaves the Task required page', blocked.url());
    const exactAllowed = await context.newPage();
    await exactAllowed.goto('https://example.com/practice/?utm_source=smoke#answer', { waitUntil: 'domcontentloaded' });
    assert(!exactAllowed.url().includes('required.html'), 'exact URL tolerates tracking hash and trailing slash', exactAllowed.url());
    const prefixAllowed = await context.newPage();
    await prefixAllowed.goto('https://example.com/course/unit-1?attempt=2', { waitUntil: 'domcontentloaded' });
    assert(!prefixAllowed.url().includes('required.html'), 'path range allows descendant paths', prefixAllowed.url());
    const allowed = await context.newPage();
    await allowed.goto('https://khanacademy.org/practice', { waitUntil: 'domcontentloaded' });
    await allowed.bringToFront();
    await worker.evaluate(async () => { const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true }); const tab = tabs[0]; if (tab?.windowId) await chrome.windows.update(tab.windowId, { focused: true }); if (tab?.id) await chrome.tabs.update(tab.id, { active: true }); });
    await allowed.waitForTimeout(3200);
    assert(!allowed.url().includes('required.html'), 'matching resource continues into original access flow', allowed.url());
    await allowed.goto('https://khanacademy.org/practice-2', { waitUntil: 'domcontentloaded' });
    await allowed.waitForTimeout(600);
    const checkpointAt = Date.now();
    for (const nowMs of [checkpointAt - 3200, checkpointAt]) {
      const response = await taskAdmin.evaluate(({ nowMs }) => chrome.runtime.sendMessage({ optionalModuleId: 'task-management-v1', type: 'CHECKPOINT_LOCAL_DEBUG_TASK', url: 'https://khanacademy.org/practice-2', nowMs }), { nowMs });
      assert(response?.ok, 'debug-only active checkpoint is accepted', response?.code || response?.error || '');
    }
    const stored = await storage(worker, 'get', [TASK_SEGMENTS_KEY, 'usage_segments_v1', 'session_v1_persistent']);
    const taskSegments = Object.values(stored[TASK_SEGMENTS_KEY] || {});
    assert(taskSegments.some((item) => item.taskId === TASK_ID || String(item.taskId || '').startsWith('task-v1-local-debug-')), 'Task progress is written to Task-owned ledger');
    const core = JSON.stringify({ usage: stored.usage_segments_v1 || {}, session: stored.session_v1_persistent || {} });
    assert(!/matchedTaskIdsAtTime|progressTaskIdAtTime|taskRevisionAtTime/.test(core), 'core ledgers remain Task-unaware');
    await storage(worker, 'remove', [TASK_CACHE_KEY, TASK_SEGMENTS_KEY, 'task_progress_state_v1']);
    console.log('\nTask V1 local smoke PASS');
  } finally {
    await context?.close().catch(() => {});
    if (existsSync(temp)) rmSync(temp, { recursive: true, force: true });
  }
}
run().catch((error) => { console.error(error?.stack || error); process.exit(1); });