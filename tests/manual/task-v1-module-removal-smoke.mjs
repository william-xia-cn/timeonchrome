import { chromium } from 'playwright';
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
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
  const installSwitch = "import './modules/task/install.js'; // Optional Task module switch: remove this line to build without Task.";
  const sourceBackground = readFileSync(resolve(source, 'background.js'), 'utf8');
  assert(sourceBackground.split(installSwitch).length === 2, 'base extension has exactly one static Task install switch');
  const copiedBackgroundPath = resolve(extensionCopy, 'background.js');
  const copiedBackground = readFileSync(copiedBackgroundPath, 'utf8');
  writeFileSync(copiedBackgroundPath, copiedBackground.replace(`${installSwitch}\r\n`, '').replace(`${installSwitch}\n`, ''), 'utf8');
  assert(!readFileSync(copiedBackgroundPath, 'utf8').includes('./modules/task/'), 'temporary extension removes the static Task install switch');
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
    const result = await popup.evaluate(() => new Promise((resolve) => chrome.runtime.sendMessage({ type: 'GET_OPTIONAL_MODULE_ENTRIES' }, resolve)));
    assert(result?.ok === true && result.entries.length === 0, 'generic module registry is empty when Task module is absent');
  } finally {
    await context?.close().catch(() => {});
    if (existsSync(dirname(extensionCopy))) rmSync(dirname(extensionCopy), { recursive: true, force: true });
  }
}
run().catch((error) => { console.error(error?.stack || error); process.exit(1); });