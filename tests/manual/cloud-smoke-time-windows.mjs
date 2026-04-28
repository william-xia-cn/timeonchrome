// Cloud smoke test for corrected time window model
// Run with: node tests/manual/cloud-smoke-time-windows.mjs

const API_BASE = 'https://guardian-api.william-xia-cn.workers.dev';
const PAGES_URL = 'https://b92e48b8.timeonchrome-console.pages.dev';

const EMAIL = 'william.xia.cn@gmail.com';
const PASSWORD = '123456';

let token = null;
let profileId = null;
let passed = 0;
let failed = 0;

function ok(desc) { passed++; console.log(`  ✅ ${desc}`); }
function err(desc, detail) { failed++; console.error(`  ❌ ${desc}${detail ? ': ' + detail : ''}`); }

async function api(path, method = 'GET', body = null) {
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json' },
  };
  if (token) opts.headers['Authorization'] = `Bearer ${token}`;
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(API_BASE + path, opts);
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`${r.status}: ${data.error || 'Unknown'}`);
  return data;
}

async function run() {
  console.log('\n========================================');
  console.log('Cloud Smoke Test: Time Windows (Corrected Model)');
  console.log('========================================\n');

  // ── 1. Login ──
  console.log('1. Login');
  try {
    const loginRes = await api('/auth/login', 'POST', { email: EMAIL, password: PASSWORD });
    token = loginRes.token;
    ok('Login successful');
  } catch (e) {
    err('Login failed', e.message); process.exit(1);
  }

  // ── 2. Get profiles ──
  console.log('\n2. Get Profiles');
  try {
    const res = await api('/profiles');
    const profiles = res.profiles || [];
    if (profiles.length === 0) { err('No profiles'); process.exit(1); }
    profileId = profiles[0].id;
    ok(`Using profile: ${profiles[0].name}`);
  } catch (e) {
    err('Get profiles failed', e.message); process.exit(1);
  }

  // ── 3. GET /config — check timeWindows structure ──
  console.log('\n3. GET /config — timeWindows structure');
  let currentConfig = null;
  try {
    const res = await api(`/profiles/${profileId}/config`);
    currentConfig = res.data || {};
    const tw = currentConfig.timeWindows || {};

    if ('studyWindows' in tw) ok('timeWindows.studyWindows exists');
    else err('timeWindows.studyWindows missing');

    if ('restWindows' in tw) ok('timeWindows.restWindows exists');
    else err('timeWindows.restWindows missing');

    if ('onlineWindows' in tw) ok('timeWindows.onlineWindows exists (computed)');
    else err('timeWindows.onlineWindows missing');
  } catch (e) {
    err('GET /config failed', e.message);
  }

  // ── 4. PUT — save studyWindows and restWindows ──
  console.log('\n4. PUT /config — save study + rest windows');
  try {
    const payload = {
      timeWindows: {
        studyWindows: [{ start: '08:00', end: '12:00' }, { start: '14:00', end: '18:00' }],
        restWindows: [{ start: '19:00', end: '21:00' }],
      },
    };
    const putRes = await api(`/profiles/${profileId}/config`, 'PUT', { data: payload });
    if (putRes.success) ok('PUT /config returned success');
    else err('PUT /config did not return success');
  } catch (e) {
    err('PUT /config failed', e.message);
  }

  // ── 5. Reload and verify onlineWindows is computed ──
  console.log('\n5. Reload config — verify onlineWindows computed');
  try {
    const res = await api(`/profiles/${profileId}/config`);
    const cfg = res.data || {};
    const tw = cfg.timeWindows || {};

    // studyWindows should have 2 entries
    if (Array.isArray(tw.studyWindows) && tw.studyWindows.length === 2) {
      ok(`studyWindows has 2 entries`);
    } else {
      err('studyWindows not persisted correctly', JSON.stringify(tw.studyWindows));
    }

    // restWindows should have 1 entry
    if (Array.isArray(tw.restWindows) && tw.restWindows.length === 1) {
      ok(`restWindows has 1 entry`);
    } else {
      err('restWindows not persisted correctly', JSON.stringify(tw.restWindows));
    }

    // onlineWindows should be computed union
    if (Array.isArray(tw.onlineWindows)) {
      ok(`onlineWindows computed: ${tw.onlineWindows.length} entries`);
      // Should contain all 3 windows (2 study + 1 rest)
      if (tw.onlineWindows.length === 3) {
        ok('onlineWindows union correct (3 entries = 2 study + 1 rest)');
      } else {
        err('onlineWindows union size unexpected', tw.onlineWindows.length);
      }
      // Verify all windows are present
      const has08 = tw.onlineWindows.some(w => w.start === '08:00' && w.end === '12:00');
      const has14 = tw.onlineWindows.some(w => w.start === '14:00' && w.end === '18:00');
      const has19 = tw.onlineWindows.some(w => w.start === '19:00' && w.end === '21:00');
      if (has08) ok('onlineWindows contains 08:00-12:00');
      else err('onlineWindows missing 08:00-12:00');
      if (has14) ok('onlineWindows contains 14:00-18:00');
      else err('onlineWindows missing 14:00-18:00');
      if (has19) ok('onlineWindows contains 19:00-21:00');
      else err('onlineWindows missing 19:00-21:00');
    } else if (tw.onlineWindows === null) {
      err('onlineWindows is null (should be computed array)');
    } else {
      err('onlineWindows type unexpected', typeof tw.onlineWindows);
    }
  } catch (e) {
    err('Reload config failed', e.message);
  }

  // ── 6. Test null = unlimited semantics ──
  console.log('\n6. Test null = unlimited semantics');
  try {
    const payload = {
      timeWindows: {
        studyWindows: null,  // unlimited
        restWindows: [{ start: '19:00', end: '21:00' }],
      },
    };
    await api(`/profiles/${profileId}/config`, 'PUT', { data: payload });
    const res = await api(`/profiles/${profileId}/config`);
    const tw = res.data?.timeWindows || {};

    if (tw.studyWindows === null) ok('studyWindows = null (unlimited) persisted');
    else err('studyWindows should be null', JSON.stringify(tw.studyWindows));

    if (tw.onlineWindows === null) ok('onlineWindows = null when studyWindows is null');
    else err('onlineWindows should be null when any sub-window is null', JSON.stringify(tw.onlineWindows));
  } catch (e) {
    err('Null semantics test failed', e.message);
  }

  // ── 7. Test empty arrays ──
  console.log('\n7. Test empty arrays = unlimited');
  try {
    const payload = {
      timeWindows: {
        studyWindows: [],
        restWindows: [],
      },
    };
    await api(`/profiles/${profileId}/config`, 'PUT', { data: payload });
    const res = await api(`/profiles/${profileId}/config`);
    const tw = res.data?.timeWindows || {};

    if (Array.isArray(tw.studyWindows) && tw.studyWindows.length === 0) ok('studyWindows = [] persisted');
    else err('studyWindows should be empty array');

    if (Array.isArray(tw.restWindows) && tw.restWindows.length === 0) ok('restWindows = [] persisted');
    else err('restWindows should be empty array');

    if (Array.isArray(tw.onlineWindows) && tw.onlineWindows.length === 0) {
      ok('onlineWindows = [] when both sub-windows are empty');
    } else {
      err('onlineWindows should be empty array', JSON.stringify(tw.onlineWindows));
    }
  } catch (e) {
    err('Empty array test failed', e.message);
  }

  // ── 8. Playwright screenshot ──
  console.log('\n8. Playwright screenshot');
  try {
    const { chromium } = await import('playwright');
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await context.newPage();

    await page.goto(PAGES_URL);
    await page.waitForSelector('#login-email', { timeout: 10000 });
    await page.fill('#login-email', EMAIL);
    await page.fill('#login-password', PASSWORD);
    await page.click('#login-btn');
    await page.waitForSelector('#main-screen', { timeout: 10000 });
    ok('Logged in via Playwright');

    await page.waitForFunction(() => {
      const el = document.getElementById('current-profile-name');
      return el && el.textContent !== '选择孩子';
    }, { timeout: 10000 });

    // Screenshot: 时间段管理
    await page.click('.nav-item[data-page="schedule"]');
    await page.waitForTimeout(800);
    await page.screenshot({ path: 'tests/manual/screenshot-schedule-v2.png' });
    ok('Screenshot: page-schedule-v2 saved');

    await browser.close();
  } catch (e) {
    err('Playwright failed', e.message);
  }

  // ── Summary ──
  const total = passed + failed;
  console.log('\n========================================');
  console.log(`Result: ${passed}/${total} passed${failed ? ` — ${failed} FAILED` : ''}`);
  console.log('========================================\n');
  if (failed > 0) process.exit(1);
}

run();
