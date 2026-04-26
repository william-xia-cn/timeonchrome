// Windows headed Chrome ACTIVE calibration runner.
// Run with: node tests/manual/real-active-calibration-windows.js --a 6 --b 3 --blur 2

'use strict';

const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const { execFile, spawn } = require('child_process');
const { chromium } = require('@playwright/test');

const EXTENSION_PATH = path.resolve(__dirname, '../..');
const MOCKS_DIR = path.resolve(__dirname, '../e2e/mocks');
const PROFILE_ROOT = path.join(os.tmpdir(), `timeonchrome-real-active-${Date.now()}`);

function parseArgs(argv) {
  const args = {
    a: 60,
    b: 30,
    c: 2,
    blur: 20,
    scenario: 'local',
    urlA: null,
    urlB: null,
    urlC: null,
    verbose: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    if (!key.startsWith('--')) continue;
    const name = key.slice(2);
    if (name === 'verbose') {
      args.verbose = true;
      continue;
    }
    if (['scenario', 'urlA', 'urlB', 'urlC'].includes(name)) {
      args[name] = argv[i + 1];
      i += 1;
      continue;
    }
    const value = Number(argv[i + 1]);
    if (Number.isFinite(value) && value >= 0) {
      args[name] = value;
      i += 1;
    }
  }
  return args;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function startMockServer() {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      if (req.url === '/media-video.html') {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(`<!doctype html>
<html><head><title>TimeOnChrome media video</title></head>
<body>
  <canvas id="canvas" width="320" height="180"></canvas>
  <video id="video" muted autoplay playsinline loop width="320" height="180"></video>
  <script>
    const canvas = document.getElementById('canvas');
    const ctx = canvas.getContext('2d');
    let frame = 0;
    setInterval(() => {
      frame += 1;
      ctx.fillStyle = frame % 2 ? '#336699' : '#884422';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#fff';
      ctx.font = '24px sans-serif';
      ctx.fillText('media video ' + frame, 30, 90);
    }, 250);
    const video = document.getElementById('video');
    video.srcObject = canvas.captureStream(4);
    video.play().catch(() => {});
  </script>
</body></html>`);
        return;
      }
      if (req.url === '/media-audio.html') {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(`<!doctype html>
<html><head><title>TimeOnChrome media audio</title></head>
<body>
  <audio id="audio" controls loop></audio>
  <button id="start">start</button>
  <script>
    function makeWavDataUri() {
      const sampleRate = 8000;
      const seconds = 1;
      const samples = sampleRate * seconds;
      const buffer = new ArrayBuffer(44 + samples * 2);
      const view = new DataView(buffer);
      const write = (offset, value) => {
        for (let i = 0; i < value.length; i += 1) view.setUint8(offset + i, value.charCodeAt(i));
      };
      write(0, 'RIFF');
      view.setUint32(4, 36 + samples * 2, true);
      write(8, 'WAVE');
      write(12, 'fmt ');
      view.setUint32(16, 16, true);
      view.setUint16(20, 1, true);
      view.setUint16(22, 1, true);
      view.setUint32(24, sampleRate, true);
      view.setUint32(28, sampleRate * 2, true);
      view.setUint16(32, 2, true);
      view.setUint16(34, 16, true);
      write(36, 'data');
      view.setUint32(40, samples * 2, true);
      for (let i = 0; i < samples; i += 1) {
        const sample = Math.sin((i / sampleRate) * Math.PI * 2 * 440) * 0.2;
        view.setInt16(44 + i * 2, sample * 32767, true);
      }
      let binary = '';
      new Uint8Array(buffer).forEach((byte) => { binary += String.fromCharCode(byte); });
      return 'data:audio/wav;base64,' + btoa(binary);
    }
    const audio = document.getElementById('audio');
    audio.src = makeWavDataUri();
    document.getElementById('start').addEventListener('click', () => audio.play().catch(() => {}));
  </script>
</body></html>`);
        return;
      }
      const filePath = path.join(MOCKS_DIR, req.url === '/' ? 'pageA.html' : req.url);
      if (!fs.existsSync(filePath)) {
        res.writeHead(404);
        res.end('Not found');
        return;
      }
      res.writeHead(200, { 'Content-Type': 'text/html' });
      fs.createReadStream(filePath).pipe(res);
    });

    server.listen(0, '0.0.0.0', () => {
      const port = server.address().port;
      resolve({
        server,
        pageA: `http://127.0.0.1:${port}/pageA.html`,
        pageB: `http://localhost:${port}/pageB.html`,
        pageC: `http://127.0.0.2:${port}/pageA.html`,
        mediaVideo: `http://127.0.0.1:${port}/media-video.html`,
        mediaAudio: `http://127.0.0.1:${port}/media-audio.html`,
      });
    });
    server.on('error', reject);
  });
}

function getRealTargets(args) {
  if (args.scenario === 'plain-real' || args.scenario === 'minimize-real' || args.scenario === 'multi-window-real' || args.scenario === 'cross-day-real') {
    return {
      pageA: args.urlA || 'https://example.com/',
      pageB: args.urlB || 'https://www.iana.org/',
      pageC: args.urlC || 'https://www.wikipedia.org/',
    };
  }

  if (args.scenario === 'same-domain-real') {
    return {
      pageA: args.urlA || 'https://example.com/',
      pageB: args.urlB || 'https://www.iana.org/',
      pageC: args.urlC || 'https://example.com/',
    };
  }

  if (args.scenario === 'reload-real') {
    return {
      pageA: args.urlA || 'https://example.com/',
      pageB: args.urlB || 'https://www.iana.org/',
      pageC: args.urlC || 'https://www.wikipedia.org/',
    };
  }

  if (args.scenario === 'video-real' || args.scenario === 'background-video-real') {
    return {
      pageA: args.urlA || 'https://www.w3schools.com/html/html5_video.asp',
      pageB: args.urlB || 'https://example.com/',
      pageC: args.urlC || 'https://www.iana.org/',
    };
  }

  if (args.scenario === 'audio-real' || args.scenario === 'background-audio-real') {
    return {
      pageA: args.urlA || 'https://www.w3schools.com/html/html5_audio.asp',
      pageB: args.urlB || 'https://example.com/',
      pageC: args.urlC || 'https://www.iana.org/',
    };
  }

  return null;
}

function runPowerShell(script) {
  return new Promise(resolve => {
    execFile(
      'powershell.exe',
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', script],
      { windowsHide: true },
      (error, stdout, stderr) => resolve({ ok: !error, stdout, stderr, error })
    );
  });
}

function psSingleQuote(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

async function tryBringWindowTitleToFront(title) {
  if (!title) return;
  await runPowerShell(`
    $needle = ${psSingleQuote(`*${title}*`)};
    Add-Type @"
using System;
using System.Runtime.InteropServices;
public class Win32Window {
  [DllImport("user32.dll")]
  public static extern bool SetForegroundWindow(IntPtr hWnd);
  [DllImport("user32.dll")]
  public static extern bool ShowWindowAsync(IntPtr hWnd, int nCmdShow);
}
"@;
    $p = Get-Process | Where-Object { $_.MainWindowHandle -ne 0 -and $_.MainWindowTitle -like $needle } | Select-Object -First 1;
    if ($p) {
      [Win32Window]::ShowWindowAsync($p.MainWindowHandle, 9) | Out-Null;
      [Win32Window]::SetForegroundWindow($p.MainWindowHandle) | Out-Null;
    }
  `);
}

async function tryBringChromeToFront(page) {
  if (page) {
    await tryBringWindowTitleToFront(await page.title().catch(() => ''));
  }
  await runPowerShell(`
    Add-Type -AssemblyName Microsoft.VisualBasic;
    [Microsoft.VisualBasic.Interaction]::AppActivate('Chromium') -or
    [Microsoft.VisualBasic.Interaction]::AppActivate('Chrome')
  `);
}

async function killChromeProfileProcesses(profileRoot) {
  const result = await runPowerShell(`
    $profile = ${psSingleQuote(profileRoot)};
    $extension = ${psSingleQuote(EXTENSION_PATH)};
    $procs = Get-CimInstance Win32_Process |
      Where-Object {
        $_.CommandLine -and (
          $_.CommandLine.Contains($profile) -or
          $_.CommandLine.Contains($extension)
        )
      };
    $ids = @($procs | Select-Object -ExpandProperty ProcessId);
    foreach ($id in $ids) {
      Stop-Process -Id $id -Force -ErrorAction SilentlyContinue;
    }
    $ids -join ',';
  `);
  return (result.stdout || '').trim().split(',').filter(Boolean);
}

async function killChromeWindowByTitle(title) {
  if (!title) return [];
  const result = await runPowerShell(`
    $needle = ${psSingleQuote(`*${title}*`)};
    $procs = Get-Process |
      Where-Object { $_.MainWindowHandle -ne 0 -and $_.MainWindowTitle -like $needle };
    $ids = @($procs | Select-Object -ExpandProperty Id);
    foreach ($id in $ids) {
      Stop-Process -Id $id -Force -ErrorAction SilentlyContinue;
    }
    $ids -join ',';
  `);
  return (result.stdout || '').trim().split(',').filter(Boolean);
}

async function minimizeChromeWindow(page) {
  const title = await page.title().catch(() => '');
  await runPowerShell(`
    $needle = ${psSingleQuote(`*${title}*`)};
    Add-Type @"
using System;
using System.Runtime.InteropServices;
public class MinimizeWindow {
  [DllImport("user32.dll")]
  public static extern bool ShowWindowAsync(IntPtr hWnd, int nCmdShow);
}
"@;
    $p = Get-Process | Where-Object { $_.MainWindowHandle -ne 0 -and $_.MainWindowTitle -like $needle } | Select-Object -First 1;
    if ($p) {
      [MinimizeWindow]::ShowWindowAsync($p.MainWindowHandle, 6) | Out-Null;
    }
  `);
}

async function minimizeChromeFor(page, seconds, sw) {
  const before = await getForegroundWindowTitle();
  const chromeBefore = sw ? await getChromeFocusSnapshot(sw) : null;
  await minimizeChromeWindow(page);
  await sleep(1000);
  const during = await getForegroundWindowTitle();
  const chromeDuring = sw ? await getChromeFocusSnapshot(sw) : null;
  await sleep(Math.max(0, seconds * 1000 - 1000));
  await tryBringChromeToFront(page);
  await page.bringToFront().catch(() => {});
  await sleep(1000);
  const after = await getForegroundWindowTitle();
  const chromeAfter = sw ? await getChromeFocusSnapshot(sw) : null;
  return { before, during, after, chromeBefore, chromeDuring, chromeAfter };
}

async function sendNativeUserInput(step = 0) {
  await runPowerShell(`
    Add-Type @"
using System;
using System.Runtime.InteropServices;
public class NativeInput {
  [DllImport("user32.dll")]
  public static extern bool SetCursorPos(int X, int Y);
  [DllImport("user32.dll")]
  public static extern void mouse_event(uint dwFlags, uint dx, uint dy, uint dwData, UIntPtr dwExtraInfo);
  [DllImport("user32.dll")]
  public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, UIntPtr dwExtraInfo);
}
"@;
    $x = 240 + (${Number(step)} % 7) * 13;
    $y = 220 + (${Number(step)} % 5) * 11;
    [NativeInput]::SetCursorPos($x, $y) | Out-Null;
    [NativeInput]::mouse_event(0x0001, 1, 1, 0, [UIntPtr]::Zero);
    [NativeInput]::keybd_event(0x10, 0, 0, [UIntPtr]::Zero);
    Start-Sleep -Milliseconds 30;
    [NativeInput]::keybd_event(0x10, 0, 2, [UIntPtr]::Zero);
  `);
}

async function sendNativeAltTab() {
  await runPowerShell(`
    Add-Type @"
using System;
using System.Runtime.InteropServices;
public class NativeKeys {
  [DllImport("user32.dll")]
  public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, UIntPtr dwExtraInfo);
}
"@;
    [NativeKeys]::keybd_event(0x12, 0, 0, [UIntPtr]::Zero);
    Start-Sleep -Milliseconds 50;
    [NativeKeys]::keybd_event(0x09, 0, 0, [UIntPtr]::Zero);
    Start-Sleep -Milliseconds 50;
    [NativeKeys]::keybd_event(0x09, 0, 2, [UIntPtr]::Zero);
    Start-Sleep -Milliseconds 50;
    [NativeKeys]::keybd_event(0x12, 0, 2, [UIntPtr]::Zero);
  `);
}

async function getForegroundWindowTitle() {
  const result = await runPowerShell(`
    Add-Type @"
using System;
using System.Text;
using System.Runtime.InteropServices;
public class ForegroundInfo {
  [DllImport("user32.dll")]
  public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll", CharSet = CharSet.Unicode)]
  public static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int count);
}
"@;
    $handle = [ForegroundInfo]::GetForegroundWindow();
    $builder = New-Object System.Text.StringBuilder 512;
    [ForegroundInfo]::GetWindowText($handle, $builder, $builder.Capacity) | Out-Null;
    $builder.ToString();
  `);
  return (result.stdout || '').trim();
}

async function tryBlurWithCalibrationWindow(seconds) {
  if (seconds <= 0) return null;
  const command = `
    Add-Type -AssemblyName System.Windows.Forms;
    [System.Windows.Forms.Application]::EnableVisualStyles();
    $form = New-Object System.Windows.Forms.Form;
    $form.Text = 'TimeOnChrome Calibration Blur';
    $form.Width = 420;
    $form.Height = 180;
    $form.StartPosition = 'CenterScreen';
    $form.TopMost = $true;
    $label = New-Object System.Windows.Forms.Label;
    $label.Text = 'Calibration blur window';
    $label.AutoSize = $true;
    $label.Left = 24;
    $label.Top = 32;
    $form.Controls.Add($label);
    $timer = New-Object System.Windows.Forms.Timer;
    $timer.Interval = ${Math.max(1, seconds) * 1000};
    $timer.Add_Tick({ $timer.Stop(); $form.Close(); });
    $form.Add_Shown({
      $form.WindowState = 'Normal';
      $form.BringToFront();
      $form.Activate();
      $timer.Start();
    });
    [System.Windows.Forms.Application]::Run($form);
  `;
  const child = spawn('powershell.exe', ['-Sta', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', command], {
    detached: false,
    stdio: 'ignore',
    windowsHide: false,
  });
  await sleep(700);
  await tryBringWindowTitleToFront('TimeOnChrome Calibration Blur');
  await runPowerShell(`
    Add-Type -AssemblyName Microsoft.VisualBasic;
    [Microsoft.VisualBasic.Interaction]::AppActivate('TimeOnChrome Calibration Blur')
  `);
  await sleep(Math.min(1000, Math.max(250, seconds * 500)));
  const foregroundDuring = await getForegroundWindowTitle();
  await sleep(Math.max(0, seconds * 1000 - 1000) + 300);
  try {
    child.kill();
  } catch {}
  await sleep(300);
  return { child, foregroundDuring };
}

async function tryBlurWithNotepad(seconds) {
  if (seconds <= 0) return null;
  const child = spawn('notepad.exe', [], { detached: false, stdio: 'ignore' });
  await sleep(750);
  await tryBringWindowTitleToFront('Notepad');
  await tryBringWindowTitleToFront('记事本');
  await runPowerShell(`
    Add-Type -AssemblyName Microsoft.VisualBasic;
    [Microsoft.VisualBasic.Interaction]::AppActivate('Untitled - Notepad') -or
    [Microsoft.VisualBasic.Interaction]::AppActivate('无标题 - 记事本')
  `);
  await sleep(seconds * 1000);
  try {
    child.kill();
  } catch {}
  await sleep(500);
  return child;
}

async function getChromeFocusSnapshot(sw) {
  return await sw.evaluate(async () => {
    const all = await chrome.windows.getAll({ populate: false });
    let lastFocused = null;
    try {
      lastFocused = await chrome.windows.getLastFocused();
    } catch (err) {
      lastFocused = { error: err?.message || String(err) };
    }
    return {
      all: all.map(win => ({ id: win.id, focused: !!win.focused, state: win.state, type: win.type })),
      lastFocused: lastFocused ? {
        id: lastFocused.id,
        focused: !!lastFocused.focused,
        state: lastFocused.state,
        type: lastFocused.type,
        error: lastFocused.error,
      } : null,
    };
  });
}

async function getBadgeSnapshot(sw) {
  return await sw.evaluate(async () => {
    if (!chrome.action?.getBadgeText) return { available: false };
    const text = await chrome.action.getBadgeText({});
    let title = null;
    if (chrome.action.getTitle) {
      title = await chrome.action.getTitle({});
    }
    return { available: true, text, title };
  });
}

async function tryBlurAwayFromChrome(seconds, sw) {
  const before = await getForegroundWindowTitle();
  const chromeBefore = sw ? await getChromeFocusSnapshot(sw) : null;
  await sendNativeAltTab();
  await sleep(700);
  let during = await getForegroundWindowTitle();
  let chromeDuring = sw ? await getChromeFocusSnapshot(sw) : null;
  await sleep(Math.max(0, seconds * 1000 - 700));
  if (/Chrom/i.test(during || '') && seconds > 0) {
    const calibrationWindow = await tryBlurWithCalibrationWindow(seconds);
    during = calibrationWindow?.foregroundDuring || null;
    chromeDuring = sw ? await getChromeFocusSnapshot(sw) : null;
  }
  if (/Chrom/i.test(during || '') && seconds > 0) {
    await tryBlurWithNotepad(seconds);
    during = await getForegroundWindowTitle();
    chromeDuring = sw ? await getChromeFocusSnapshot(sw) : null;
  }
  const after = await getForegroundWindowTitle();
  const chromeAfter = sw ? await getChromeFocusSnapshot(sw) : null;
  return { before, during, after, chromeBefore, chromeDuring, chromeAfter };
}

async function keepForegroundActive(page, seconds, label) {
  await page.bringToFront();
  await tryBringChromeToFront(page);
  await sleep(500);
  await sendNativeUserInput(0);
  await page.mouse.move(120, 120);
  await page.mouse.click(120, 120).catch(() => {});

  const deadline = Date.now() + seconds * 1000;
  let tick = 0;
  while (Date.now() < deadline) {
    tick += 1;
    await page.mouse.move(120 + (tick % 5) * 20, 160 + (tick % 3) * 20).catch(() => {});
    await page.keyboard.press('Shift').catch(() => {});
    await sendNativeUserInput(tick);
    if (tick % 3 === 0) await tryBringChromeToFront(page);
    const remaining = deadline - Date.now();
    await sleep(Math.min(1000, Math.max(0, remaining)));
  }
  console.log(`  ${label}: foreground hold complete (${seconds}s)`);
}

async function runMultiWindowScenario(context, sw, args, pageA, pageB, pageC) {
  const pageOne = await context.newPage();
  const pageTwo = await context.newPage();

  console.log(`  window A page: ${pageA}`);
  await pageOne.goto(pageA, { waitUntil: 'domcontentloaded', timeout: 15000 });
  console.log(`  window B page: ${pageB}`);
  await pageTwo.goto(pageB, { waitUntil: 'domcontentloaded', timeout: 15000 });

  await pageOne.bringToFront();
  await tryBringChromeToFront(pageOne);
  await markCalibrationStartOnCurrentPage(pageOne, sw);
  await keepForegroundActive(pageOne, args.a, 'Window A');

  await pageTwo.bringToFront();
  await tryBringChromeToFront(pageTwo);
  await keepForegroundActive(pageTwo, args.b, 'Window B');

  console.log(`  close with page C: ${pageC}`);
  await pageTwo.goto(pageC, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await sleep(500);
  await keepForegroundActive(pageTwo, 2, 'Window B close-out');

  return { page: pageTwo, blurProbe: { kind: 'multi-window-switch' } };
}

async function prepareForegroundMedia(page, kind) {
  await page.bringToFront();
  await tryBringChromeToFront(page);
  await sendNativeUserInput(0);
  await page.mouse.click(240, 240).catch(() => {});

  async function tryPrepareInFrame(frame) {
    return await frame.evaluate(async (mediaKind) => {
    const selector = mediaKind === 'audio' ? 'audio' : 'video';
    const media = document.querySelector(selector);
    if (!media) {
      return { success: false, reason: `no ${selector} element` };
    }
    media.muted = true;
    media.loop = true;
    media.currentTime = Math.min(media.currentTime || 0, 1);
    try {
      if (!media.paused) {
        media.pause();
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      await media.play();
      return {
        success: true,
        paused: media.paused,
        muted: media.muted,
        currentTime: media.currentTime,
        readyState: media.readyState,
        duration: Number.isFinite(media.duration) ? media.duration : null,
      };
    } catch (err) {
      return {
        success: false,
        reason: err?.message || String(err),
        paused: media.paused,
        muted: media.muted,
        readyState: media.readyState,
      };
    }
    }, kind);
  }

  let result = await tryPrepareInFrame(page.mainFrame());
  if (!result.success && /^no /.test(result.reason || '')) {
    for (const frame of page.frames()) {
      if (frame === page.mainFrame()) continue;
      result = await tryPrepareInFrame(frame).catch(err => ({
        success: false,
        reason: err?.message || String(err),
      }));
      if (result.success || !/^no /.test(result.reason || '')) break;
    }
  }

  console.log(`  media prepare (${kind}): ${JSON.stringify(result)}`);
  return result;
}

async function markCalibrationStartOnCurrentPage(page, sw) {
  await callDebug(sw, 'debugResetTimingCalibration');
  let lastError = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await page.waitForLoadState('domcontentloaded', { timeout: 3000 }).catch(() => {});
      await sleep(500);
      await page.evaluate(() => {
        const marker = `toc-calibration-${Date.now()}`;
        const url = new URL(location.href);
        url.hash = marker;
        history.pushState(null, '', url.toString());
      });
      lastError = null;
      break;
    } catch (err) {
      lastError = err;
      await sleep(750);
    }
  }
  if (lastError) throw lastError;
  await sleep(500);
}

async function waitForServiceWorker(context) {
  let sw = context.serviceWorkers()[0];
  if (!sw) sw = await context.waitForEvent('serviceworker', { timeout: 15000 });
  return sw;
}

async function callDebug(sw, fnName) {
  const result = await sw.evaluate(async (name) => {
    if (typeof globalThis[name] !== 'function') {
      return { success: false, error: `${name} is not available` };
    }
    return await globalThis[name]();
  }, fnName);
  if (!result?.success) {
    throw new Error(`${fnName} failed: ${result?.error || 'unknown error'}`);
  }
  return result;
}

async function prepareRestMode(sw) {
  async function clearDynamicRules() {
    await sw.evaluate(async () => {
      if (chrome.declarativeNetRequest?.getDynamicRules) {
        const rules = await chrome.declarativeNetRequest.getDynamicRules();
        if (rules.length > 0) {
          await chrome.declarativeNetRequest.updateDynamicRules({
            removeRuleIds: rules.map(rule => rule.id),
          });
        }
      }
    });
  }

  async function forceRestProfile(error, method) {
    return await sw.evaluate(async ({ error, method }) => {
      const stored = await chrome.storage.local.get(['guardian_config', 'guardian_session']);
      const config = stored['guardian_config'] || {};
      const session = stored['guardian_session'] || {};
      await chrome.storage.local.set({
        guardian_config: { ...config, mode: 'rest' },
        guardian_session: { ...session, currentMode: 'rest' },
      });

      const verified = await chrome.storage.local.get(['guardian_config', 'guardian_session']);
      return {
        success: true,
        method,
        debugSetRestModeError: error,
        mode: verified['guardian_config']?.mode || null,
        currentMode: verified['guardian_session']?.currentMode || null,
      };
    }, { error, method });
  }

  const direct = await sw.evaluate(async () => {
    try {
      return await globalThis.debugSetRestMode();
    } catch (err) {
      return { success: false, error: err.message, stack: err.stack };
    }
  });

  if (direct?.success) {
    const verified = await sw.evaluate(async () => {
      const stored = await chrome.storage.local.get(['guardian_config', 'guardian_session']);
      return {
        mode: stored['guardian_config']?.mode || null,
        currentMode: stored['guardian_session']?.currentMode || null,
      };
    });
    if (verified.mode === 'rest' && verified.currentMode === 'rest') {
      await clearDynamicRules();
      return { success: true, method: 'debugSetRestMode', ...verified };
    }
    const fallback = await forceRestProfile(
      `debugSetRestMode left profile at ${verified.mode}/${verified.currentMode}`,
      'verifiedStorageRestModeFallback'
    );
    await clearDynamicRules();
    return fallback;
  }

  const fallback = await forceRestProfile(direct?.error || 'debugSetRestMode failed', 'storageRestModeFallback');
  await clearDynamicRules();

  if (!fallback?.success) {
    throw new Error(`rest mode setup failed: ${direct?.error || 'unknown error'}`);
  }
  return fallback;
}

async function launchCalibrationContext() {
  return await chromium.launchPersistentContext(PROFILE_ROOT, {
    headless: false,
    args: [
      `--disable-extensions-except=${EXTENSION_PATH}`,
      `--load-extension=${EXTENSION_PATH}`,
      '--no-sandbox',
      '--disable-background-timer-throttling',
      '--disable-renderer-backgrounding',
    ],
  });
}

function pairActiveDurations(eventLog) {
  const sorted = eventLog
    .filter(e => e && e.domain && typeof e.time === 'number')
    .map((event, index) => ({ event, index }))
    .sort((a, b) => (a.event.time - b.event.time) || (a.index - b.index))
    .map(x => x.event);

  const openByDomain = new Map();
  const segments = [];
  for (const event of sorted) {
    if (event.type === 'START') {
      openByDomain.set(event.domain, event);
      continue;
    }
    if (event.type !== 'END') continue;
    const start = openByDomain.get(event.domain);
    if (!start) continue;
    const seconds = Math.floor((event.time - start.time) / 1000);
    if (seconds > 0) {
      segments.push({
        domain: event.domain,
        state: start.state,
        seconds,
        start: start.time,
        end: event.time,
      });
    }
    openByDomain.delete(event.domain);
  }

  const activeByDomain = {};
  const backgroundActiveByDomain = {};
  for (const segment of segments) {
    if (segment.state === 'ACTIVE') {
      activeByDomain[segment.domain] = (activeByDomain[segment.domain] || 0) + segment.seconds;
    } else if (segment.state === 'BACKGROUND_ACTIVE') {
      backgroundActiveByDomain[segment.domain] = (backgroundActiveByDomain[segment.domain] || 0) + segment.seconds;
    }
  }
  return { segments, activeByDomain, backgroundActiveByDomain };
}

function localDateKey(time) {
  const d = new Date(time);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function localDayRange(date) {
  const [year, month, day] = date.split('-').map(Number);
  return {
    start: new Date(year, month - 1, day).getTime(),
    end: new Date(year, month - 1, day + 1).getTime(),
  };
}

function deriveActiveByDate(segments) {
  const byDate = {};
  for (const segment of segments) {
    if (segment.state !== 'ACTIVE') continue;
    let date = localDateKey(segment.start);
    while (true) {
      const { start, end } = localDayRange(date);
      const overlapStart = Math.max(segment.start, start);
      const overlapEnd = Math.min(segment.end, end);
      const seconds = Math.floor((overlapEnd - overlapStart) / 1000);
      if (seconds > 0) {
        byDate[date] ||= {};
        byDate[date][segment.domain] = (byDate[date][segment.domain] || 0) + seconds;
      }
      if (segment.end <= end) break;
      date = localDateKey(end);
    }
  }
  return byDate;
}

function sumStatsRange(statsRange) {
  const summed = {};
  for (const dayStats of Object.values(statsRange || {})) {
    for (const [domain, seconds] of Object.entries(dayStats || {})) {
      if (domain === 'audioSeconds' || domain === 'backgroundMediaByDomain') continue;
      summed[domain] = (summed[domain] || 0) + seconds;
    }
  }
  return summed;
}

function classify(report, expected, domains) {
  const stateResolved = (report.trace || []).filter(t => t.action === 'state_resolved');
  const stateResolvedSummary = stateResolved.map(t => ({
    reason: t.reason,
    domain: t.domain,
    nextState: t.nextState,
    isFocused: t.payload?.context?.isFocused,
    isIdle: t.payload?.context?.isIdle,
    tabId: t.payload?.context?.tabId,
    windowId: t.payload?.context?.windowId,
  }));
  const focusedContexts = stateResolved.filter(t => t.payload?.context?.isFocused === true);
  const completeFocusedContexts = focusedContexts.filter(t =>
    t.payload?.context?.tabId && t.payload?.context?.domain
  );
  const activeResolved = stateResolved.filter(t => t.nextState === 'ACTIVE');
  const unfocusedResolved = stateResolved.filter(t => t.payload?.context?.isFocused === false);
  const eventAppended = (report.trace || []).filter(t => t.action === 'event_appended');
  const activeEvents = (report.eventLog || []).filter(e => e.state === 'ACTIVE');
  const { segments, activeByDomain, backgroundActiveByDomain } = pairActiveDurations(report.eventLog || []);
  const eventLogStatsByDate = deriveActiveByDate(segments);
  const stats = expected.useStatsRange ? sumStatsRange(report.statsRange || {}) : (report.stats || {});
  const domainStats = Object.fromEntries(
    Object.entries(stats).filter(([domain]) => domain !== 'audioSeconds' && domain !== 'backgroundMediaByDomain')
  );
  const backgroundAudioSeconds = Number(report.stats?.audioSeconds || 0);
  const backgroundMediaByDomain = report.stats?.backgroundMediaByDomain || {};
  const backgroundEventLogSeconds = Object.values(backgroundActiveByDomain).reduce((sum, seconds) => sum + seconds, 0);
  const backgroundMediaDomainSeconds = Object.values(backgroundMediaByDomain).reduce((sum, seconds) => sum + Number(seconds || 0), 0);
  const expectedBackgroundSeconds = expected.expectBackgroundMedia ? expected.blur : 0;
  const expectedASeconds = expected.accumulateA
    ? expected.a + expected.c + (expected.reloadSeconds || 0)
    : expected.a;
  const toleranceA = expected.expectBackgroundMedia
    ? Math.max(6, Math.ceil(expectedASeconds * 0.75))
    : Math.max(4, Math.ceil(expectedASeconds * 0.12));
  const toleranceB = Math.max(5, Math.ceil(expected.b * 0.40));
  const pageASeconds = activeByDomain[domains.pageA] || 0;
  const pageBSeconds = activeByDomain[domains.pageB] || 0;
  const pageCSeconds = activeByDomain[domains.pageC] || 0;
  const statsPageASeconds = stats[domains.pageA] || 0;
  const statsPageBSeconds = stats[domains.pageB] || 0;
  const statsPageCSeconds = stats[domains.pageC] || 0;
  const totalActiveSeconds = Object.values(activeByDomain).reduce((sum, seconds) => sum + seconds, 0);
  const expectedTotalWithoutBlur = expectedASeconds + expected.b;

  let firstBrokenLayer = null;
  if (stateResolved.length === 0) firstBrokenLayer = 'focus';
  else if (focusedContexts.length === 0) firstBrokenLayer = 'focus';
  else if (completeFocusedContexts.length === 0) firstBrokenLayer = 'context';
  else if (completeFocusedContexts.every(t => t.payload?.context?.isIdle === true)) firstBrokenLayer = 'idle';
  else if (activeResolved.length === 0) firstBrokenLayer = 'resolver';
  else if (eventAppended.length === 0) firstBrokenLayer = 'session';
  else if (Object.keys(activeByDomain).length === 0) firstBrokenLayer = 'event-log';
  else if (JSON.stringify(domainStats) !== JSON.stringify(activeByDomain)) firstBrokenLayer = 'stats';

  const pageACloseEnough = Math.abs(pageASeconds - expectedASeconds) <= toleranceA;
  const pageBCloseEnough = Math.abs(pageBSeconds - expected.b) <= toleranceB;
  const blurExcluded = expected.expectBackgroundMedia
    ? pageASeconds <= expectedASeconds + toleranceA
    : pageBSeconds <= expected.b + toleranceB;
  const statsMatchesEventLog =
    statsPageASeconds === pageASeconds &&
    statsPageBSeconds === pageBSeconds &&
    JSON.stringify(domainStats) === JSON.stringify(activeByDomain) &&
    (!expected.expectBackgroundMedia || (
      backgroundAudioSeconds === backgroundEventLogSeconds &&
      backgroundAudioSeconds === backgroundMediaDomainSeconds &&
      JSON.stringify(backgroundMediaByDomain) === JSON.stringify(backgroundActiveByDomain)
    ));
  const backgroundCloseEnough = expected.expectBackgroundMedia
    ? Math.abs(backgroundAudioSeconds - expectedBackgroundSeconds) <= Math.max(4, Math.ceil(expectedBackgroundSeconds * 0.35))
    : true;
  let result = 'FAIL';
  if (!firstBrokenLayer && !blurExcluded) {
    firstBrokenLayer = unfocusedResolved.length === 0 ? 'focus' : 'session';
  }
  if (
    !firstBrokenLayer &&
    pageASeconds > 0 &&
    (expected.expectBackgroundMedia || pageBSeconds > 0) &&
    pageACloseEnough &&
    (expected.expectBackgroundMedia || pageBCloseEnough) &&
    blurExcluded &&
    statsMatchesEventLog &&
    backgroundCloseEnough
  ) {
    result = 'PASS';
  } else if (activeResolved.length > 0 || pageASeconds > 0) {
    result = 'PARTIAL';
  }

  return {
    result,
    firstBrokenLayer: firstBrokenLayer || 'none',
    toleranceA,
    toleranceB,
    stateResolvedCount: stateResolved.length,
    focusedContextCount: focusedContexts.length,
    activeResolvedCount: activeResolved.length,
    unfocusedResolvedCount: unfocusedResolved.length,
    eventAppendedCount: eventAppended.length,
    stateResolvedSummary,
    activeEvents,
    segments,
    activeByDomain,
    backgroundActiveByDomain,
    eventLogStatsByDate,
    stats,
    backgroundAudioSeconds,
    backgroundMediaByDomain,
    backgroundEventLogSeconds,
    backgroundMediaDomainSeconds,
    expectedBackgroundSeconds,
    backgroundCloseEnough,
    todayStats: report.stats || {},
    statsRange: report.statsRange || null,
    pageASeconds,
    pageBSeconds,
    pageCSeconds,
    statsPageASeconds,
    statsPageBSeconds,
    statsPageCSeconds,
    expectedASeconds,
    totalActiveSeconds,
    expectedTotalWithoutBlur,
    pageACloseEnough,
    pageBCloseEnough,
    blurExcluded,
    statsMatchesEventLog,
  };
}

function classifyCrashRecovery(report, expected, domain, preCrashSession, secondReport = null, killedPids = []) {
  const { segments, activeByDomain } = pairActiveDurations(report.eventLog || []);
  const starts = (report.eventLog || []).filter(e => e.type === 'START' && e.state === 'ACTIVE' && e.domain === domain);
  const ends = (report.eventLog || []).filter(e => e.type === 'END' && e.state === 'ACTIVE' && e.domain === domain);
  const duration = activeByDomain[domain] || 0;
  const statsDuration = Number(report.stats?.[domain] || 0);
  const heartbeatAnchoredSeconds = preCrashSession?.startTime && preCrashSession?.lastHeartbeat
    ? Math.max(0, Math.floor((preCrashSession.lastHeartbeat - preCrashSession.startTime) / 1000))
    : 0;
  const expectedSeconds = heartbeatAnchoredSeconds || expected.a;
  const tolerance = Math.max(5, Math.ceil(expectedSeconds * 0.35));
  const closeEnough = Math.abs(duration - expectedSeconds) <= tolerance;
  const statsMatchesEventLog = statsDuration === duration;
  const duplicateEnd = ends.length > 1;
  const openStart = starts.length > ends.length;
  const secondEventLogCount = secondReport?.eventLogCount ?? null;
  const idempotent = !secondReport || secondEventLogCount === report.eventLogCount;

  let firstBrokenLayer = null;
  if (!killedPids.length) firstBrokenLayer = 'test-setup';
  else if (!preCrashSession?.state || preCrashSession.state !== 'ACTIVE') firstBrokenLayer = 'session';
  else if (starts.length === 0) firstBrokenLayer = 'event-log';
  else if (openStart) firstBrokenLayer = 'session';
  else if (duplicateEnd) firstBrokenLayer = 'event-log';
  else if (!closeEnough) firstBrokenLayer = 'recovery';
  else if (!statsMatchesEventLog) firstBrokenLayer = 'stats';
  else if (!idempotent) firstBrokenLayer = 'recovery';

  return {
    result: firstBrokenLayer ? (starts.length > 0 ? 'PARTIAL' : 'FAIL') : 'PASS',
    firstBrokenLayer: firstBrokenLayer || 'none',
    activeByDomain,
    segments,
    starts,
    ends,
    duration,
    statsDuration,
    expectedSeconds,
    heartbeatAnchoredSeconds,
    tolerance,
    closeEnough,
    openStart,
    duplicateEnd,
    statsMatchesEventLog,
    idempotent,
    preCrashSession,
    killedPids,
    postRecoverySession: report.session,
    eventLogCount: report.eventLogCount,
    secondEventLogCount,
  };
}

async function main() {
  if (process.platform !== 'win32') {
    throw new Error(`This runner is Windows-only. Current platform: ${process.platform}`);
  }

  const args = parseArgs(process.argv.slice(2));
  const realTargets = getRealTargets(args);
  console.log('[Real ACTIVE calibration runner]');
  console.log(`  scenario: ${args.scenario}`);
  console.log(`  durations: A=${args.a}s, B=${args.b}s, C=${args.c}s, blur=${args.blur}s`);

  const localTargets = realTargets ? null : await startMockServer();
  const pageA = realTargets?.pageA ||
    (args.scenario === 'background-video-local' ? localTargets.mediaVideo :
      args.scenario === 'background-audio-local' ? localTargets.mediaAudio :
        localTargets.pageA);
  const pageB = realTargets?.pageB || localTargets.pageB;
  const pageC = realTargets?.pageC || localTargets.pageC;
  let context;
  try {
    context = await launchCalibrationContext();

    const sw = await waitForServiceWorker(context);
    const restModeResult = await prepareRestMode(sw);
    console.log(`  rest mode setup: ${restModeResult.method}`);
    if (restModeResult.debugSetRestModeError) {
      console.log(`  rest mode fallback reason: ${restModeResult.debugSetRestModeError}`);
    }

    let page;
    let blurProbe = null;
    let reloadSeconds = 0;

    if (args.scenario === 'crash-recovery-local') {
      page = await context.newPage();
      console.log(`  page A: ${pageA}`);
      await page.goto(pageA, { waitUntil: 'domcontentloaded', timeout: 15000 });
      await markCalibrationStartOnCurrentPage(page, sw);
      await keepForegroundActive(page, args.a, 'A before crash');

      const preCrashReport = await callDebug(sw, 'debugExportTimingCalibration');
      console.log(`  pre-crash session: ${JSON.stringify(preCrashReport.session)}`);
      console.log(`  crash Chrome profile processes`);
      const pageTitle = await page.title().catch(() => '');
      let killed = await killChromeWindowByTitle(pageTitle);
      if (!killed.length) killed = await killChromeProfileProcesses(PROFILE_ROOT);
      console.log(`  killed pids: ${killed.join(',') || '(none)'}`);
      context = null;
      await sleep(Math.max(1, args.blur) * 1000);

      console.log(`  relaunch same profile`);
      context = await launchCalibrationContext();
      const recoverySw = await waitForServiceWorker(context);
      await sleep(1500);
      const report = await callDebug(recoverySw, 'debugExportTimingCalibration');
      const secondReport = await callDebug(recoverySw, 'debugExportTimingCalibration');
      const badge = await getBadgeSnapshot(recoverySw);
      const domains = {
        pageA: new URL(pageA).hostname,
        pageB: new URL(pageB).hostname,
        pageC: new URL(pageC).hostname,
      };
      const analysis = classifyCrashRecovery(report, { a: args.a, blur: args.blur }, domains.pageA, preCrashReport.session, secondReport, killed);

      console.log('\n[Crash recovery result]');
      console.log(`  result: ${analysis.result}`);
      console.log(`  firstBrokenLayer: ${analysis.firstBrokenLayer}`);
      console.log(`  mode/currentMode: ${report.mode}/${report.currentMode}`);
      console.log(`  preCrashSession: ${JSON.stringify(analysis.preCrashSession)}`);
      console.log(`  killedPids: ${JSON.stringify(analysis.killedPids)}`);
      console.log(`  postRecoverySession: ${JSON.stringify(analysis.postRecoverySession)}`);
      console.log(`  traceCount: ${report.traceCount}`);
      console.log(`  eventLogCount: ${analysis.eventLogCount}`);
      console.log(`  secondEventLogCount: ${analysis.secondEventLogCount}`);
      console.log(`  starts: ${analysis.starts.length}`);
      console.log(`  ends: ${analysis.ends.length}`);
      console.log(`  activeByDomain: ${JSON.stringify(analysis.activeByDomain)}`);
      console.log(`  stats: ${JSON.stringify(report.stats)}`);
      console.log(`  pageA(${domains.pageA}) event-log-derived: ${analysis.duration}s`);
      console.log(`  pageA(${domains.pageA}) stats: ${analysis.statsDuration}s`);
      console.log(`  heartbeatAnchoredSeconds: ${analysis.heartbeatAnchoredSeconds}s`);
      console.log(`  expected: ${analysis.expectedSeconds}s, tolerance: +/-${analysis.tolerance}s`);
      console.log(`  openStart: ${analysis.openStart}`);
      console.log(`  duplicateEnd: ${analysis.duplicateEnd}`);
      console.log(`  closeEnough: ${analysis.closeEnough}`);
      console.log(`  statsMatchesEventLog: ${analysis.statsMatchesEventLog}`);
      console.log(`  idempotent: ${analysis.idempotent}`);
      console.log(`  badge: ${JSON.stringify(badge)}`);
      if (args.verbose) {
        console.log(`  eventLog: ${JSON.stringify(report.eventLog)}`);
        console.log(`  segments: ${JSON.stringify(analysis.segments)}`);
      }
      if (analysis.result === 'FAIL') process.exitCode = 1;
      return;
    } else if (args.scenario === 'multi-window-real') {
      const result = await runMultiWindowScenario(context, sw, args, pageA, pageB, pageC);
      page = result.page;
      blurProbe = result.blurProbe;
    } else {
      page = await context.newPage();

      console.log(`  page A: ${pageA}`);
      await page.goto(pageA, { waitUntil: 'domcontentloaded', timeout: 15000 });
      if (args.scenario === 'video-real' || args.scenario === 'background-video-real' || args.scenario === 'background-video-local') {
        await prepareForegroundMedia(page, 'video');
        await markCalibrationStartOnCurrentPage(page, sw);
        await prepareForegroundMedia(page, 'video');
      } else if (args.scenario === 'audio-real' || args.scenario === 'background-audio-real' || args.scenario === 'background-audio-local') {
        await prepareForegroundMedia(page, 'audio');
        await markCalibrationStartOnCurrentPage(page, sw);
        await prepareForegroundMedia(page, 'audio');
      } else {
        await markCalibrationStartOnCurrentPage(page, sw);
      }
      await keepForegroundActive(page, args.a, 'A');

      if (args.scenario === 'reload-real') {
        console.log('  reload page A');
        const reloadStartedAt = Date.now();
        await page.reload({ waitUntil: 'domcontentloaded', timeout: 15000 });
        reloadSeconds = Math.round((Date.now() - reloadStartedAt) / 1000);
        console.log(`  reload elapsed: ${reloadSeconds}s`);
        await keepForegroundActive(page, args.c, 'A after reload');
      }

      if (args.scenario === 'background-video-real' || args.scenario === 'background-audio-real' || args.scenario === 'background-video-local' || args.scenario === 'background-audio-local') {
        console.log(`  background media blur: ${args.blur}s via Alt+Tab`);
        blurProbe = await tryBlurAwayFromChrome(args.blur, sw);
      } else if (args.scenario === 'minimize-real') {
        console.log(`  minimize Chrome: ${args.blur}s`);
        blurProbe = await minimizeChromeFor(page, args.blur, sw);
        console.log(`  page B: ${pageB}`);
        await page.goto(pageB, { waitUntil: 'domcontentloaded', timeout: 15000 });
        await sleep(500);
        await keepForegroundActive(page, args.b, 'B');
      } else {
        console.log(`  page B: ${pageB}`);
        await page.goto(pageB, { waitUntil: 'domcontentloaded', timeout: 15000 });
        await keepForegroundActive(page, args.b, 'B');

        console.log(`  blur: ${args.blur}s via Alt+Tab`);
        blurProbe = await tryBlurAwayFromChrome(args.blur, sw);
      }

      console.log(`  page C: ${pageC}`);
      await page.goto(pageC, { waitUntil: 'domcontentloaded', timeout: 15000 });
      await sleep(500);
      await keepForegroundActive(page, args.scenario === 'same-domain-real' ? args.c : 2, 'C close-out');
      if (args.scenario === 'same-domain-real') {
        console.log(`  close C with page B: ${pageB}`);
        await page.goto(pageB, { waitUntil: 'domcontentloaded', timeout: 15000 });
        await sleep(500);
      }
    }
    await sleep(500);

    const report = await callDebug(sw, 'debugExportTimingCalibration');
    const badge = await getBadgeSnapshot(sw);
    const domains = {
      pageA: new URL(pageA).hostname,
      pageB: new URL(pageB).hostname,
      pageC: new URL(pageC).hostname,
    };
    const analysis = classify(report, {
      a: args.a,
      b: args.b,
      c: args.c,
      blur: args.blur,
      accumulateA: args.scenario === 'same-domain-real' || args.scenario === 'reload-real',
      reloadSeconds,
      useStatsRange: args.scenario === 'cross-day-real',
      expectBackgroundMedia: args.scenario === 'background-video-real' || args.scenario === 'background-audio-real' || args.scenario === 'background-video-local' || args.scenario === 'background-audio-local',
    }, domains);

    console.log('\n[Calibration result]');
    console.log(`  result: ${analysis.result}`);
    console.log(`  firstBrokenLayer: ${analysis.firstBrokenLayer}`);
    console.log(`  mode/currentMode: ${report.mode}/${report.currentMode}`);
    console.log(`  traceCount: ${report.traceCount}`);
    console.log(`  eventLogCount: ${report.eventLogCount}`);
    console.log(`  focusLedgerCount: ${report.focusLedgerCount}`);
    console.log(`  stateResolvedCount: ${analysis.stateResolvedCount}`);
    console.log(`  focusedContextCount: ${analysis.focusedContextCount}`);
    console.log(`  activeResolvedCount: ${analysis.activeResolvedCount}`);
    console.log(`  unfocusedResolvedCount: ${analysis.unfocusedResolvedCount}`);
    console.log(`  eventAppendedCount: ${analysis.eventAppendedCount}`);
    console.log(`  activeByDomain: ${JSON.stringify(analysis.activeByDomain)}`);
    console.log(`  backgroundActiveByDomain: ${JSON.stringify(analysis.backgroundActiveByDomain)}`);
    console.log(`  stats: ${JSON.stringify(analysis.stats)}`);
    if (args.scenario === 'cross-day-real') {
      console.log(`  eventLogStatsByDate: ${JSON.stringify(analysis.eventLogStatsByDate)}`);
      console.log(`  productStatsRange: ${JSON.stringify(analysis.statsRange)}`);
    }
    console.log(`  pageA(${domains.pageA}) event-log-derived: ${analysis.pageASeconds}s`);
    console.log(`  pageA(${domains.pageA}) stats: ${analysis.statsPageASeconds}s`);
    console.log(`  pageB(${domains.pageB}) event-log-derived: ${analysis.pageBSeconds}s`);
    console.log(`  pageB(${domains.pageB}) stats: ${analysis.statsPageBSeconds}s`);
    console.log(`  pageC(${domains.pageC}) event-log-derived: ${analysis.pageCSeconds}s`);
    console.log(`  pageC(${domains.pageC}) stats: ${analysis.statsPageCSeconds}s`);
    console.log(`  expectedA: ${analysis.expectedASeconds}s, tolerance: +/-${analysis.toleranceA}s`);
    console.log(`  expectedB: ${args.b}s, tolerance: +/-${analysis.toleranceB}s`);
    console.log(`  expectedTotalWithoutBlur: ${analysis.expectedTotalWithoutBlur}s`);
    console.log(`  totalActiveSeconds: ${analysis.totalActiveSeconds}s`);
    console.log(`  expectedBackgroundMedia: ${analysis.expectedBackgroundSeconds}s`);
    console.log(`  backgroundEventLogSeconds: ${analysis.backgroundEventLogSeconds}s`);
    console.log(`  audioSeconds: ${analysis.backgroundAudioSeconds}s`);
    console.log(`  backgroundMediaByDomain: ${JSON.stringify(analysis.backgroundMediaByDomain)}`);
    console.log(`  backgroundMediaDomainSeconds: ${analysis.backgroundMediaDomainSeconds}s`);
    console.log(`  backgroundCloseEnough: ${analysis.backgroundCloseEnough}`);
    console.log(`  pageACloseEnough: ${analysis.pageACloseEnough}`);
    console.log(`  pageBCloseEnough: ${analysis.pageBCloseEnough}`);
    console.log(`  blurExcludedFromB: ${analysis.blurExcluded}`);
    console.log(`  statsMatchesEventLog: ${analysis.statsMatchesEventLog}`);
    console.log(`  badge: ${JSON.stringify(badge)}`);
    if (args.verbose) {
      console.log(`  blurForegroundProbe: ${JSON.stringify(blurProbe)}`);
      console.log(`  focusLedgerTail: ${JSON.stringify((report.focusLedger || []).slice(-12))}`);
      console.log(`  stateResolvedSummary: ${JSON.stringify(analysis.stateResolvedSummary)}`);
      console.log(`  activeEvents: ${JSON.stringify(analysis.activeEvents)}`);
      console.log(`  activeSegments: ${JSON.stringify(analysis.segments.filter(s => s.state === 'ACTIVE'))}`);
    }

    if (analysis.result === 'FAIL') process.exitCode = 1;
  } finally {
    if (context) await context.close().catch(() => {});
    if (localTargets?.server) await new Promise(resolve => localTargets.server.close(resolve));
    fs.rmSync(PROFILE_ROOT, { recursive: true, force: true });
  }
}

main().catch(err => {
  console.error('\n[Calibration runner failed]');
  console.error(err.stack || err.message || err);
  process.exit(1);
});
