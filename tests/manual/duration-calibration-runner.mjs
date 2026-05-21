// tests/manual/duration-calibration-runner.mjs
// Semi-automated Duration Calibration Test Runner
//
// Usage:
//   node tests/manual/duration-calibration-runner.mjs \
//     --url https://www.google.com \
//     --domain google.com \
//     --expected 60 \
//     --threshold 10
//
// Owner workflow:
// 1. Runner launches headed Chrome with extension loaded
// 2. Runner switches to rest mode, resets Focus Ledger, opens target page
// 3. Owner keeps target page in focus for ~60 seconds
// 4. Owner closes browser when done
// 5. Runner auto-generates calibration report

import { chromium } from '@playwright/test';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EXTENSION_PATH = path.resolve(__dirname, '..', '..', 'extension');

// ── CLI Args ──────────────────────────────────────────────────────────────────
function parseArgs(argv) {
  const args = {
    url: 'https://www.google.com',
    domain: 'google.com',
    expected: 60,
    threshold: 10,
    sampleInterval: 3000,
  };

  for (let i = 0; i < argv.length; i++) {
    switch (argv[i]) {
      case '--url': args.url = argv[++i]; break;
      case '--domain': args.domain = argv[++i]; break;
      case '--expected': args.expected = parseInt(argv[++i], 10); break;
      case '--threshold': args.threshold = parseInt(argv[++i], 10); break;
      case '--sample-interval': args.sampleInterval = parseInt(argv[++i], 10); break;
    }
  }

  return args;
}

const args = parseArgs(process.argv.slice(2));

// ── Log File ──────────────────────────────────────────────────────────────────
const LOG_DIR = path.resolve(__dirname, '../../.artifacts/test-results');
if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });
const LOG_FILE = path.join(LOG_DIR, `calibration-${Date.now()}.jsonl`);
const REPORT_FILE = path.join(LOG_DIR, `calibration-report-${Date.now()}.json`);

function appendLog(entry) {
  const line = JSON.stringify(entry);
  fs.appendFileSync(LOG_FILE, line + '\n');
}

// ── Helpers ───────────────────────────────────────────────────────────────────
async function callInSW(context, fnName, ...args) {
  // Get fresh service worker reference each time
  let sw = context.serviceWorkers()[0];
  if (!sw) {
    sw = await context.waitForEvent('serviceworker', { timeout: 5000 }).catch(() => null);
  }
  if (!sw) return { success: false, error: 'Service worker not found' };

  try {
    return await sw.evaluate(async ({ fn, args }) => {
      // Call globalThis debug functions (exposed by background.js)
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

async function switchToRestMode(context) {
  console.log('  → Switching to rest mode...');
  // Send message via SW evaluate - don't wait for response
  let sw = context.serviceWorkers()[0];
  if (!sw) {
    sw = await context.waitForEvent('serviceworker', { timeout: 5000 }).catch(() => null);
  }
  if (sw) {
    try {
      await sw.evaluate(() => {
        chrome.runtime.sendMessage({ type: 'SWITCH_TO_REST' });
      });
    } catch {}
  }
  await new Promise(r => setTimeout(r, 2000));
}

async function resetFocusLedger(context) {
  console.log('  → Resetting Focus Ledger...');
  const result = await callInSW(context, 'DEBUG_FOCUS_LEDGER_RESET');
  console.log('  → Ledger reset:', JSON.stringify(result));
  return result;
}

async function exportCalibration(context, targetDomain, expectedSeconds, threshold, since) {
  const result = await callInSW(context, 'DEBUG_EXPORT_CALIBRATION', targetDomain, expectedSeconds, threshold, since);
  if (result && result.success) {
    const { success, ...report } = result;
    return report;
  }
  return null;
}

async function checkCurrentUrl(page) {
  const url = page.url();
  return {
    url,
    isReminder: url.includes('reminder.html'),
  };
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function run() {
  console.log('\n═══════════════════════════════════════════════════════');
  console.log('  Duration Calibration Runner (Semi-Automated)');
  console.log('═══════════════════════════════════════════════════════\n');
  console.log('  Target URL:    ', args.url);
  console.log('  Target Domain: ', args.domain);
  console.log('  Expected Sec:  ', args.expected);
  console.log('  Threshold:     ', args.threshold);
  console.log('  Sample Intvl:  ', args.sampleInterval + 'ms');
  console.log('  Log File:      ', LOG_FILE);
  console.log('\n───────────────────────────────────────────────────────\n');

  // Create fresh profile
  const userDataDir = path.resolve(LOG_DIR, `calibration-profile-${Date.now()}`);
  if (fs.existsSync(userDataDir)) fs.rmSync(userDataDir, { recursive: true, force: true });
  fs.mkdirSync(userDataDir, { recursive: true });

  let browser = null;
  let context = null;
  let page = null;
  let sampleTimer = null;
  let testStartTime = null;
  let samples = [];

  try {
    // Launch headed browser with extension
    console.log('[1/6] Launching headed Chromium with extension...');
    browser = await chromium.launchPersistentContext(userDataDir, {
      headless: false,
      args: [
        `--disable-extensions-except=${EXTENSION_PATH}`,
        `--load-extension=${EXTENSION_PATH}`,
        '--no-sandbox',
      ],
    });
    context = browser;

    // Wait for service worker (just to confirm it's loaded)
    let sw = context.serviceWorkers()[0];
    if (!sw) {
      console.log('  Waiting for service worker...');
      sw = await context.waitForEvent('serviceworker', { timeout: 15000 });
    }
    console.log('  ✅ Service worker ready');

    // Switch to rest mode
    console.log('[2/6] Switching to rest mode...');
    await switchToRestMode(context);
    console.log('  ✅ Rest mode active');

    // Reset Focus Ledger
    console.log('[3/6] Resetting Focus Ledger...');
    await resetFocusLedger(context);
    console.log('  ✅ Focus Ledger cleared');

    // Open target page
    console.log('[4/6] Opening target page...');
    page = await context.newPage();
    await page.goto(args.url, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.waitForTimeout(3000); // settle

    // Verify not intercepted
    const urlCheck = await checkCurrentUrl(page);
    if (urlCheck.isReminder) {
      console.log('\n  ❌ FAIL: Page redirected to reminder.html');
      console.log('     URL:', urlCheck.url);
      console.log('     This means rest mode is not active or domain is in unsafeList.');
      console.log('\n  Report:');
      const failReport = {
        testName: 'Duration Calibration',
        targetDomain: args.domain,
        expectedSeconds: args.expected,
        verdict: 'FAIL: redirected to reminder',
        url: urlCheck.url,
        timestamp: Date.now(),
        pass: false,
      };
      fs.writeFileSync(REPORT_FILE, JSON.stringify(failReport, null, 2));
      console.log('  Report saved to:', REPORT_FILE);
      await context.close();
      return;
    }
    console.log('  ✅ Page loaded:', page.url());

    // Record test start time
    testStartTime = Date.now();
    appendLog({ type: 'TEST_START', time: testStartTime, url: page.url() });

    console.log('\n[5/6] Sampling started. Owner instructions:');
    console.log('  ┌─────────────────────────────────────────────────┐');
    console.log('  │  1. Keep this browser window in foreground      │');
    console.log('  │  2. Do NOT minimize or switch to other apps     │');
    console.log('  │  3. Do NOT play video/music                     │');
    console.log('  │  4. Stay on this page for ~' + String(args.expected).padEnd(2) + ' seconds       │');
    console.log('  │  5. Close the browser when done                 │');
    console.log('  └─────────────────────────────────────────────────┘');
    console.log('\n  Sampling every ' + (args.sampleInterval / 1000) + 's. Close browser to finish.\n');

    // Start sampling
    let sampleErrorCount = 0;
    sampleTimer = setInterval(async () => {
      try {
        const elapsed = Math.round((Date.now() - testStartTime) / 1000);
        const report = await exportCalibration(context, args.domain, args.expected, args.threshold, testStartTime);
        if (!report) throw new Error('No response from extension');
        const urlCheck = await checkCurrentUrl(page);

        const sample = {
          type: 'SAMPLE',
          elapsed,
          time: Date.now(),
          url: page.url(),
          isReminder: urlCheck.isReminder,
          targetFocusSeconds: report.targetFocusSeconds || 0,
          targetActiveSeconds: report.targetActiveSeconds || 0,
          totalFocusSeconds: report.totalFocusSeconds || 0,
          totalActiveSeconds: report.totalActiveSeconds || 0,
          totalDelta: report.totalDelta || 0,
          verdict: report.verdict || 'UNKNOWN',
          pass: report.pass || false,
        };

        samples.push(sample);
        appendLog(sample);
        sampleErrorCount = 0; // reset on success

        // Print live status
        const statusIcon = report.pass ? '✅' : (report.verdict?.startsWith('FAIL') ? '❌' : '⏳');
        process.stdout.write(`\r  [${String(elapsed).padStart(3)}s] ${statusIcon} focus=${String(report.targetFocusSeconds || 0).padStart(3)}s  active=${String(report.targetActiveSeconds || 0).padStart(3)}s  delta=${String(report.totalDelta || 0).padStart(4)}s  verdict=${(report.verdict || 'UNKNOWN').padEnd(35)}`);
      } catch (err) {
        sampleErrorCount++;
        if (sampleErrorCount <= 3) {
          console.log(`\n  ⚠️  Sample error (${sampleErrorCount}): ${err.message}`);
        }
        if (sampleErrorCount >= 10) {
          console.log(`\n  ❌ Too many sample errors, stopping sampler`);
          clearInterval(sampleTimer);
          sampleTimer = null;
        }
      }
    }, args.sampleInterval);

    // Wait for browser close
    console.log('[6/6] Waiting for browser close...');
    await context.pages()[0].waitForEvent('close').catch(() => {});
    // Also wait for context close
    await new Promise(resolve => {
      context.on('close', resolve);
      // Timeout fallback: if browser doesn't close in 10 min, force finish
      setTimeout(resolve, 10 * 60 * 1000);
    });

  } catch (err) {
    console.log('\n  Browser closed or error:', err.message);
  } finally {
    if (sampleTimer) {
      clearInterval(sampleTimer);
      sampleTimer = null;
    }
  }

  // ── Generate Report ────────────────────────────────────────────────────────
  console.log('\n\n───────────────────────────────────────────────────────');
  console.log('  Generating Calibration Report');
  console.log('───────────────────────────────────────────────────────\n');

  const testEndTime = Date.now();
  const actualDuration = Math.round((testEndTime - testStartTime) / 1000);

  // Get final calibration report
  let finalReport = null;
  if (context) {
    try {
      finalReport = await exportCalibration(context, args.domain, args.expected, args.threshold, testStartTime);
    } catch {
      // Browser already closed
    }
  }

  // If we have samples, use the last one
  const lastSample = samples.length > 0 ? samples[samples.length - 1] : null;

  // Determine final verdict
  let verdict = 'UNKNOWN';
  let pass = false;

  if (finalReport) {
    verdict = finalReport.verdict;
    pass = finalReport.pass;
  } else if (lastSample) {
    verdict = lastSample.verdict;
    pass = lastSample.pass;
  } else {
    verdict = 'FAIL: no timing captured';
    pass = false;
  }

  // Check if page was ever redirected to reminder
  const wasRedirected = samples.some(s => s.isReminder);
  if (wasRedirected) {
    verdict = 'FAIL: redirected to reminder';
    pass = false;
  }

  const report = {
    testName: 'Duration Calibration (Semi-Automated)',
    targetUrl: args.url,
    targetDomain: args.domain,
    expectedSeconds: args.expected,
    thresholdSeconds: args.threshold,
    actualDurationSeconds: actualDuration,
    testStartTime: new Date(testStartTime).toISOString(),
    testEndTime: new Date(testEndTime).toISOString(),
    sampleCount: samples.length,
    focusLedgerByDomain: finalReport?.focusLedgerByDomain || lastSample?.focusLedgerByDomain || {},
    activeSecondsByDomain: finalReport?.activeSecondsByDomain || lastSample?.activeSecondsByDomain || {},
    targetFocusSeconds: finalReport?.targetFocusSeconds || lastSample?.targetFocusSeconds || 0,
    targetActiveSeconds: finalReport?.targetActiveSeconds || lastSample?.targetActiveSeconds || 0,
    totalFocusSeconds: finalReport?.totalFocusSeconds || lastSample?.totalFocusSeconds || 0,
    totalActiveSeconds: finalReport?.totalActiveSeconds || lastSample?.totalActiveSeconds || 0,
    totalDelta: finalReport?.totalDelta || lastSample?.totalDelta || 0,
    pass,
    verdict,
    samples: samples.map(s => ({
      elapsed: s.elapsed,
      targetFocusSeconds: s.targetFocusSeconds,
      targetActiveSeconds: s.targetActiveSeconds,
      totalDelta: s.totalDelta,
      verdict: s.verdict,
    })),
    logFile: LOG_FILE,
    timestamp: Date.now(),
  };

  fs.writeFileSync(REPORT_FILE, JSON.stringify(report, null, 2));

  // Print summary
  console.log('  Target Domain:  ', args.domain);
  console.log('  Expected:       ', args.expected + 's');
  console.log('  Actual Duration:', actualDuration + 's');
  console.log('  Samples:        ', samples.length);
  console.log('');
  console.log('  Focus Ledger:   ', report.targetFocusSeconds + 's');
  console.log('  Active Seconds: ', report.targetActiveSeconds + 's');
  console.log('  Delta:          ', report.totalDelta + 's');
  console.log('');
  console.log('  Verdict:        ', verdict);
  console.log('  Pass:           ', pass ? '✅ YES' : '❌ NO');
  console.log('');
  console.log('  Report saved to:', REPORT_FILE);
  console.log('  Log saved to:   ', LOG_FILE);
  console.log('\n═══════════════════════════════════════════════════════\n');

  // Cleanup profile (ignore EBUSY errors on Windows)
  if (fs.existsSync(userDataDir)) {
    try {
      fs.rmSync(userDataDir, { recursive: true, force: true });
    } catch (err) {
      if (err.code !== 'EBUSY') {
        console.log('  ⚠️  Profile cleanup failed:', err.message);
      }
    }
  }
}

run().catch(err => {
  console.error('Runner failed:', err);
  process.exit(1);
});
