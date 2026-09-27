import { chromium } from 'playwright';
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync } from 'fs';
import { dirname, relative, resolve } from 'path';
import { fileURLToPath } from 'url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const source = resolve(root, 'extension');
const tempRoot = resolve(root, '.tmp');
const extensionCopy = resolve(tempRoot, `task-module-removal-${Date.now()}`, 'extension');
const profile = resolve(dirname(extensionCopy), 'profile');
function assert(value, message) { if (!value) throw new Error(message); console.log(`PASS ${message}`); }

async function run() {
  mkdirSync(dirname(extensionCopy), { recursive: true });
  cpSync(source, extensionCopy, {
    recursive: true,
    filter(entry) {
      const rel = relative(source, entry).replaceAll('\\', '/');
      return rel !== 'modules/task' && !rel.startsWith('modules/task/');
    },
  });
  assert(!existsSync(resolve(extensionCopy, 'modules/task')), 'temporary extension excludes the entire Task module directory');
  const sourceBackground = readFileSync(resolve(source, 'background.js'), 'utf8');
  assert(!sourceBackground.includes('./modules/task/'), 'default-off base extension has no Task install switch');
  assert(existsSync(resolve(extensionCopy, 'runtime/optional-module-host.js')), 'generic optional-module host remains available without Task files');
  let context;
  try {
    context = await chromium.launchPersistentContext(profile, {
      headless: false,
      args: [`--disable-extensions-except=${extensionCopy}`, `--load-extension=${extensionCopy}`, '--no-sandbox'],
    });
    const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker', { timeout: 15000 });
    assert(worker.url().endsWith('/background.js'), 'base service worker starts without Task files');
    const extensionId = new URL(worker.url()).host;
    const popup = await context.newPage();
    await popup.goto(`chrome-extension://${extensionId}/popup/popup.html`, { waitUntil: 'domcontentloaded' });
    assert((await popup.title()).includes('TimeOnChrome'), 'base Popup loads without Task files');
    const admin = await context.newPage();
    await admin.goto(`chrome-extension://${extensionId}/admin/admin.html?view=stats`, { waitUntil: 'domcontentloaded' });
    assert(await admin.locator('body').isVisible(), 'base Admin loads without Task files');
  } finally {
    await context?.close().catch(() => {});
    if (existsSync(dirname(extensionCopy))) rmSync(dirname(extensionCopy), { recursive: true, force: true });
  }
}
run().catch((error) => { console.error(error?.stack || error); process.exit(1); });
