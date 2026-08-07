import { chromium } from 'playwright';
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const temp = resolve(root, '.tmp', `task-v1-production-${Date.now()}`);
const extensionPath = resolve(temp, 'extension');
const profilePath = resolve(temp, 'profile');
const output = resolve(root, 'output', 'playwright');
const MODULE_ID = 'task-management-v1';
const TASK_CACHE_KEY = 'task_management_v1_cache';
function assert(value, message, detail = '') {
  if (!value) throw new Error(`${message}${detail ? `: ${detail}` : ''}`);
  console.log(`PASS ${message}`);
}
async function storage(worker, method, payload) {
  return worker.evaluate(({ method, payload }) => new Promise((done) => chrome.storage.local[method](payload, done)), { method, payload });
}

async function run() {
  mkdirSync(temp, { recursive: true });
  cpSync(resolve(root, 'extension'), extensionPath, { recursive: true });
  writeFileSync(resolve(extensionPath, 'deployment-profile.json'), JSON.stringify({
    mode: 'managed',
    production: true,
    taskLocalDebugEnabled: false,
  }, null, 2));
  mkdirSync(output, { recursive: true });
  let context;
  try {
    context = await chromium.launchPersistentContext(profilePath, {
      headless: false,
      args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`, '--no-sandbox'],
    });
    const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker', { timeout: 15000 });
    const extensionId = new URL(worker.url()).host;
    const now = Date.now();
    await storage(worker, 'set', {
      [TASK_CACHE_KEY]: {
        schemaVersion: 1,
        capability: 'taskManagementV1',
        reason: 'cloud_pull',
        taskVersion: 4,
        tasks: [{
          id: 'formal-task',
          name: 'Formal SAT Practice',
          lifecycleStatus: 'open',
          plannedStartAt: now - 60000,
          requiredSeconds: 3600,
          completedSeconds: 600,
          revision: 2,
          resourceSpec: { hosts: ['collegeboard.org'] },
        }],
      },
    });
    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/modules/task/ui/admin.html`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(600);
    await page.click('#refresh-btn');
    await page.waitForTimeout(250);
    assert((await page.locator('#environment-label').innerText()) === '正式终端', 'production Task page identifies the formal terminal');
    assert(await page.locator('#debug-panel').isHidden(), 'production Task page hides the entire local debug panel');
    assert((await page.locator('body').innerText()).includes('Formal SAT Practice'), 'production Task status page still renders formal tasks');
    const responses = await page.evaluate(async (moduleId) => {
      const types = ['SET_LOCAL_DEBUG_TASK_CACHE', 'CLEAR_LOCAL_DEBUG_TASK_CACHE', 'CHECKPOINT_LOCAL_DEBUG_TASK'];
      const result = [];
      for (const type of types) result.push(await chrome.runtime.sendMessage({ optionalModuleId: moduleId, type }));
      return result;
    }, MODULE_ID);
    assert(responses.every((response) => response?.code === 'LOCAL_DEBUG_DISABLED'), 'production runtime rejects every local debug message');
    const after = await storage(worker, 'get', [TASK_CACHE_KEY]);
    assert(after[TASK_CACHE_KEY]?.tasks?.[0]?.id === 'formal-task', 'blocked debug messages preserve formal task cache');
    await page.setViewportSize({ width: 1180, height: 900 });
    await page.screenshot({ path: resolve(output, 'task-v1-production-desktop.png'), fullPage: true });
    await page.setViewportSize({ width: 430, height: 900 });
    await page.screenshot({ path: resolve(output, 'task-v1-production-narrow.png'), fullPage: true });
    console.log('Task V1 production profile smoke PASS');
  } finally {
    await context?.close().catch(() => {});
    if (existsSync(temp)) rmSync(temp, { recursive: true, force: true });
  }
}
run().catch((error) => { console.error(error?.stack || error); process.exit(1); });