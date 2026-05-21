// tests/manual/focus-ledger-capture-smoke.mjs
// Quick diagnostic: does Focus Ledger record events when tabs are opened/switched?
// Run with: node tests/manual/focus-ledger-capture-smoke.mjs

import { chromium } from '@playwright/test';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EXTENSION_PATH = path.resolve(__dirname, '..', '..', 'extension');
const LOG_DIR = path.resolve(__dirname, '../../.artifacts/test-results');
if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });

async function callInSW(context, fnName, ...args) {
  let sw = context.serviceWorkers()[0];
  if (!sw) sw = await context.waitForEvent('serviceworker', { timeout: 5000 }).catch(() => null);
  if (!sw) return { success: false, error: 'SW not found' };
  try {
    return await sw.evaluate(async ({ fn, args }) => {
      const fnMap = {
        'DEBUG_EXPORT_CALIBRATION': 'debugExportCalibration',
        'DEBUG_FOCUS_LEDGER_RESET': 'debugResetFocusLedger',
        'DEBUG_GET_FOCUS_LEDGER': 'debugGetFocusLedger',
      };
      const globalFnName = fnMap[fn];
      if (!globalFnName || typeof globalThis[globalFnName] !== 'function') {
        return { success: false, error: `Debug function not found: ${globalFnName}` };
      }
      return globalThis[globalFnName](...args);
    }, { fn: fnName, args });
  } catch (err) {
    return { success: false, error: err.message };
  }
}

async function getActiveTab(context) {
  let sw = context.serviceWorkers()[0];
  if (!sw) sw = await context.waitForEvent('serviceworker', { timeout: 5000 }).catch(() => null);
  if (!sw) return null;
  try {
    return await sw.evaluate(async () => {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tabs || tabs.length === 0) return null;
      const tab = tabs[0];
      return {
        tabId: tab.id,
        windowId: tab.windowId,
        url: tab.url,
        active: tab.active,
        highlighted: tab.highlighted,
        status: tab.status,
      };
    });
  } catch { return null; }
}

async function getEventLog(context) {
  let sw = context.serviceWorkers()[0];
  if (!sw) sw = await context.waitForEvent('serviceworker', { timeout: 5000 }).catch(() => null);
  if (!sw) return [];
  try {
    return await sw.evaluate(async () => {
      return new Promise(resolve => {
        chrome.storage.local.get('event_log_v1', result => resolve(result['event_log_v1'] || []));
      });
    });
  } catch { return []; }
}

async function getSession(context) {
  let sw = context.serviceWorkers()[0];
  if (!sw) sw = await context.waitForEvent('serviceworker', { timeout: 5000 }).catch(() => null);
  if (!sw) return null;
  try {
    return await sw.evaluate(async () => {
      return new Promise(resolve => {
        chrome.storage.session.get('session_v1', result => resolve(result['session_v1'] || null));
      });
    });
  } catch { return null; }
}

async function run() {
  console.log('\n═══════════════════════════════════════════════════════');
  console.log('  Focus Ledger Capture Smoke Test');
  console.log('═══════════════════════════════════════════════════════\n');

  const userDataDir = path.resolve(LOG_DIR, `focus-smoke-${Date.now()}`);
  fs.mkdirSync(userDataDir, { recursive: true });

  try {
    // Launch
    console.log('[1] Launching Chromium with extension...');
    const context = await chromium.launchPersistentContext(userDataDir, {
      headless: false,
      args: [`--disable-extensions-except=${EXTENSION_PATH}`, `--load-extension=${EXTENSION_PATH}`, '--no-sandbox'],
    });

    let sw = context.serviceWorkers()[0];
    if (!sw) sw = await context.waitForEvent('serviceworker', { timeout: 15000 });
    console.log('  ✅ Service worker ready\n');

    // Switch to rest mode - wait for SW to fully initialize
    console.log('[2] Switching to rest mode...');
    await new Promise(r => setTimeout(r, 3000)); // Wait for SW init
    try {
      await sw.evaluate(() => chrome.runtime.sendMessage({ type: 'SWITCH_TO_REST' }));
      console.log('  ✅ Rest mode switched');
    } catch (err) {
      console.log('  ⚠️  Rest mode switch failed:', err.message);
    }
    await new Promise(r => setTimeout(r, 2000));

    // Reset Focus Ledger
    console.log('[3] Resetting Focus Ledger...');
    const resetResult = await callInSW(context, 'DEBUG_FOCUS_LEDGER_RESET');
    console.log('  Reset:', JSON.stringify(resetResult));

    // Check listeners are registered (by checking if initFocusLedger ran)
    console.log('\n[4] Checking Focus Ledger initialization...');
    const ledgerBefore = await callInSW(context, 'DEBUG_GET_FOCUS_LEDGER');
    console.log('  Ledger after reset:', JSON.stringify(ledgerBefore));

    // Open google.com
    console.log('\n[5] Opening google.com...');
    const page1 = await context.newPage();
    await page1.goto('https://www.google.com', { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page1.waitForTimeout(3000);

    // Check active tab
    const activeTab1 = await getActiveTab(context);
    console.log('  Active tab:', JSON.stringify(activeTab1, null, 2));

    // Check Focus Ledger
    const ledger1 = await callInSW(context, 'DEBUG_GET_FOCUS_LEDGER');
    console.log('  Focus Ledger after page load:', JSON.stringify(ledger1, null, 2));

    // Check event log
    const events1 = await getEventLog(context);
    console.log('  Event Log (last 5):', JSON.stringify(events1.slice(-5), null, 2));

    // Check session
    const session1 = await getSession(context);
    console.log('  Session:', JSON.stringify(session1, null, 2));

    // Open bing.com in new tab
    console.log('\n[6] Opening bing.com in new tab...');
    try {
      const page2 = await context.newPage();
      await page2.goto('https://www.bing.com', { waitUntil: 'domcontentloaded', timeout: 15000 });
      await page2.waitForTimeout(3000);

      // Check active tab
      const activeTab2 = await getActiveTab(context);
      console.log('  Active tab:', JSON.stringify(activeTab2, null, 2));

      // Check Focus Ledger
      const ledger2 = await callInSW(context, 'DEBUG_GET_FOCUS_LEDGER');
      console.log('  Focus Ledger after tab switch:', JSON.stringify(ledger2, null, 2));

      // Check event log
      const events2 = await getEventLog(context);
      console.log('  Event Log (last 5):', JSON.stringify(events2.slice(-5), null, 2));

      // Check session
      const session2 = await getSession(context);
      console.log('  Session:', JSON.stringify(session2, null, 2));

      // Switch back to google.com tab
      console.log('\n[7] Switching back to google.com tab...');
      await page1.bringToFront();
      await page1.waitForTimeout(3000);

      // Check active tab
      const activeTab3 = await getActiveTab(context);
      console.log('  Active tab:', JSON.stringify(activeTab3, null, 2));

      // Check Focus Ledger
      const ledger3 = await callInSW(context, 'DEBUG_GET_FOCUS_LEDGER');
      console.log('  Focus Ledger after switch back:', JSON.stringify(ledger3, null, 2));

      // Check event log
      const events3 = await getEventLog(context);
      console.log('  Event Log (last 5):', JSON.stringify(events3.slice(-5), null, 2));

      // Check session
      const session3 = await getSession(context);
      console.log('  Session:', JSON.stringify(session3, null, 2));
    } catch (err) {
      console.log('  ⚠️  Tab switch test skipped:', err.message);
    }

    // Summary
    console.log('\n═══════════════════════════════════════════════════════');
    console.log('  Summary');
    console.log('═══════════════════════════════════════════════════════\n');

    console.log('Focus Ledger entries:');
    console.log('  After reset:  ', ledger2?.success ? ledger2.count : 0, 'entries');
    console.log('  After page1:  ', ledger1?.success ? ledger1.count : 0, 'entries');
    console.log('  After page2:  ', ledger2?.success ? ledger2.count : 0, 'entries');
    console.log('  After switch: ', ledger3?.success ? ledger3.count : 0, 'entries');

    console.log('\nEvent Log entries:');
    console.log('  After page1:  ', events1.length, 'events');
    console.log('  After page2:  ', events2.length, 'events');
    console.log('  After switch: ', events3.length, 'events');

    console.log('\nSession state:');
    console.log('  After page1:  ', session1?.state, session1?.domain);
    console.log('  After page2:  ', session2?.state, session2?.domain);
    console.log('  After switch: ', session3?.state, session3?.domain);

    // Diagnosis
    console.log('\n═══════════════════════════════════════════════════════');
    console.log('  Diagnosis');
    console.log('═══════════════════════════════════════════════════════\n');

    const ledgerCount = ledger3?.success ? ledger3.count : 0;
    const eventCount = events3.length;

    if (ledgerCount === 0 && eventCount === 0) {
      console.log('❌ Both Focus Ledger and Event Log are empty.');
      console.log('');
      console.log('Possible causes:');
      console.log('  1. initFocusLedger() was not called (check background.js line 91)');
      console.log('  2. chrome.tabs.onActivated listener not firing in Playwright');
      console.log('  3. extractDomain() returning null for google.com/bing.com');
      console.log('  4. appendFocusEntry() failing silently');
      console.log('  5. Service Worker restarted and lost listeners');
      console.log('');
      console.log('Next step: Check if chrome.tabs.onActivated fires at all');
    } else if (ledgerCount > 0 && eventCount === 0) {
      console.log('⚠️  Focus Ledger has entries but Event Log is empty.');
      console.log('  → Focus Ledger works, but business timing chain is broken.');
    } else if (ledgerCount === 0 && eventCount > 0) {
      console.log('⚠️  Event Log has entries but Focus Ledger is empty.');
      console.log('  → Business timing works, but Focus Ledger initialization failed.');
    } else {
      console.log('✅ Both Focus Ledger and Event Log have entries.');
      console.log('  → Capture is working. Issue may be with aggregation or since filter.');
    }

    await context.close();
  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    if (fs.existsSync(userDataDir)) {
      try { fs.rmSync(userDataDir, { recursive: true, force: true }); } catch {}
    }
  }
}

run();
