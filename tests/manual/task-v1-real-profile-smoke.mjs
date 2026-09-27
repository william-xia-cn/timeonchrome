// Task V1 smoke against an explicitly selected Chrome instance exposed over CDP.
import { chromium } from 'playwright';

const MODULE_ID = 'task-management-v1';
const TASK_CACHE_KEY = 'task_management_v1_cache';
const TASK_SEGMENTS_KEY = 'task_progress_segments_v1';
const TASK_STATE_KEY = 'task_progress_state_v1';
const TASK_ID = 'task-v1-real-profile-smoke';

function argValue(name, fallback = null) {
  const prefix = `--${name}=`;
  const match = process.argv.find((arg) => arg.startsWith(prefix));
  return match ? match.slice(prefix.length) : fallback;
}
function hasFlag(name) { return process.argv.includes(`--${name}`); }
function assert(condition, message, detail = '') {
  if (!condition) throw new Error(`${message}${detail ? `: ${detail}` : ''}`);
  console.log(`PASS ${message}`);
}
function buildTaskCache(now, host) {
  return {
    schemaVersion: 1,
    capability: 'taskManagementV1',
    pulledAt: now,
    serverTime: now,
    taskVersion: now,
    reason: 'manual_real_profile_smoke',
    error: null,
    tasks: [{
      id: TASK_ID,
      name: 'Task V1 Real Profile Smoke',
      lifecycleStatus: 'open',
      plannedStartAt: now - 60 * 1000,
      requiredSeconds: 600,
      completedSeconds: 0,
      revision: 1,
      resourceSpec: { hosts: [host], urlRules: [], specialTargets: [] },
    }],
  };
}
async function storage(page, method, payload) {
  return page.evaluate(({ method, payload }) => new Promise((resolve) => chrome.storage.local[method](payload, resolve)), { method, payload });
}
async function send(page, type, extra = {}) {
  return page.evaluate((message) => new Promise((resolve) => chrome.runtime.sendMessage(message, resolve)), {
    optionalModuleId: MODULE_ID,
    type,
    ...extra,
  });
}
async function waitForUrl(page, fragment, timeoutMs = 8000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (page.url().includes(fragment)) return true;
    await page.waitForTimeout(200);
  }
  return false;
}
async function restoreKeys(page, backup, keys) {
  const restore = {};
  const remove = [];
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(backup, key)) restore[key] = backup[key];
    else remove.push(key);
  }
  if (Object.keys(restore).length) await storage(page, 'set', restore);
  if (remove.length) await storage(page, 'remove', remove);
}

async function run() {
  const cdpUrl = argValue('cdp-url');
  const extensionId = argValue('extension-id');
  const resourceHost = argValue('resource-host', 'khanacademy.org');
  const keepCache = hasFlag('keep-cache');
  assert(cdpUrl, 'CDP url provided');
  assert(extensionId, 'extension id provided');

  const browser = await chromium.connectOverCDP(cdpUrl);
  const context = browser.contexts()[0];
  assert(context, 'connected to the selected Chrome context');
  const taskAdmin = await context.newPage();
  await taskAdmin.goto(`chrome-extension://${extensionId}/modules/task/ui/admin.html`, { waitUntil: 'domcontentloaded', timeout: 10000 });
  assert(taskAdmin.url().startsWith(`chrome-extension://${extensionId}/`), 'opened independent Task Admin');

  const keys = [TASK_CACHE_KEY, TASK_SEGMENTS_KEY, TASK_STATE_KEY];
  const backup = await storage(taskAdmin, 'get', keys);
  try {
    await storage(taskAdmin, 'set', { [TASK_CACHE_KEY]: buildTaskCache(Date.now(), resourceHost) });
    await taskAdmin.locator('#refresh-btn').click();
    await taskAdmin.waitForTimeout(500);
    assert((await taskAdmin.locator('body').innerText()).includes('Task V1 Real Profile Smoke'), 'independent Task Admin renders seeded task');
    const readModel = await send(taskAdmin, 'GET_TASK_READ_MODEL');
    assert(readModel?.activeCount >= 1, 'Task module read model reports an enforcing task', JSON.stringify(readModel));

    const blocked = await context.newPage();
    await blocked.goto('https://example.com/task-v1-real-profile-smoke', { waitUntil: 'domcontentloaded', timeout: 15000 });
    assert(await waitForUrl(blocked, 'modules/task/ui/required.html'), 'non-task resource enters independent Task required page', blocked.url());

    const allowed = await context.newPage();
    await allowed.goto(`https://${resourceHost}/task-v1-real-profile-smoke`, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await allowed.waitForTimeout(3200);
    assert(!allowed.url().includes('modules/task/ui/required.html'), 'matching resource continues into the original access flow', allowed.url());
    if (allowed.url().includes(resourceHost)) {
      await allowed.goto(`https://${resourceHost}/task-v1-real-profile-smoke-2`, { waitUntil: 'domcontentloaded', timeout: 15000 });
      await allowed.waitForTimeout(500);
    }

    const popup = await context.newPage();
    await popup.goto(`chrome-extension://${extensionId}/popup/popup.html`, { waitUntil: 'domcontentloaded', timeout: 10000 });
    assert(!(await popup.locator('body').innerText()).includes('Task V1 Real Profile Smoke'), 'base Popup remains Task-unaware');

    const stored = await storage(taskAdmin, 'get', [TASK_SEGMENTS_KEY, 'usage_segments_v1', 'session_v1_persistent']);
    const taskSegments = Object.values(stored[TASK_SEGMENTS_KEY] || {});
    if (allowed.url().includes(resourceHost)) assert(taskSegments.some((item) => item.taskId === TASK_ID), 'Task progress uses the Task-owned ledger');
    const core = JSON.stringify({ usage: stored.usage_segments_v1 || {}, session: stored.session_v1_persistent || {} });
    assert(!/matchedTaskIdsAtTime|progressTaskIdAtTime|taskRevisionAtTime/.test(core), 'core ledgers remain Task-unaware');
    console.log('\nTask V1 real profile smoke PASS');
  } finally {
    if (keepCache) console.log('KEEP_CACHE enabled: Task smoke keys were left in the selected Chrome profile.');
    else {
      await restoreKeys(taskAdmin, backup, keys);
      console.log('Restored original Task smoke keys.');
    }
    await browser.close().catch(() => {});
  }
}

run().catch((error) => {
  console.error('\nTask V1 real profile smoke FAIL');
  console.error(error?.stack || error);
  process.exit(1);
});