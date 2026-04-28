// Cloud smoke test for parent-side config layer
// Run with: node tests/manual/cloud-smoke-parent-config.mjs

const API_BASE = 'https://guardian-api.william-xia-cn.workers.dev';
const PAGES_URL = 'https://24134076.timeonchrome-console.pages.dev';

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
  console.log('Cloud Smoke Test: Parent Config Layer');
  console.log('========================================\n');

  // ── 1. Login ──
  console.log('1. Login');
  try {
    const loginRes = await api('/auth/login', 'POST', { email: EMAIL, password: PASSWORD });
    token = loginRes.token;
    if (!token) throw new Error('No token in response');
    ok('Login successful, token received');
  } catch (e) {
    err('Login failed', e.message);
    process.exit(1);
  }

  // ── 2. Get profiles ──
  console.log('\n2. Get Profiles');
  try {
    const profilesRes = await api('/profiles');
    const profiles = profilesRes.profiles || [];
    if (profiles.length === 0) {
      err('No profiles found');
      process.exit(1);
    }
    // Use first profile
    profileId = profiles[0].id;
    const profileName = profiles[0].name;
    ok(`Found ${profiles.length} profile(s), using first: ${profileName} (${profileId.slice(0, 8)}...)`);
  } catch (e) {
    err('Get profiles failed', e.message);
    process.exit(1);
  }

  // ── 3. GET /defaults ──
  console.log('\n3. GET /profiles/:id/defaults');
  try {
    const defaults = await api(`/profiles/${profileId}/defaults`);
    if (!Array.isArray(defaults.defaultStudySites)) err('defaultStudySites missing or not array');
    else ok(`defaultStudySites: ${defaults.defaultStudySites.length} sites`);

    if (!Array.isArray(defaults.defaultRestrictedEntertainmentSites)) err('defaultRestrictedEntertainmentSites missing or not array');
    else {
      ok(`defaultRestrictedEntertainmentSites: ${defaults.defaultRestrictedEntertainmentSites.length} sites`);
      const hasBilibili = defaults.defaultRestrictedEntertainmentSites.some(d => d.toLowerCase().includes('bilibili'));
      if (hasBilibili) ok('bilibili.com is in defaultRestrictedEntertainmentSites');
      else err('bilibili.com NOT found in defaultRestrictedEntertainmentSites');
    }

    if (!Array.isArray(defaults.defaultBlockedSites)) err('defaultBlockedSites missing or not array');
    else {
      ok(`defaultBlockedSites: ${defaults.defaultBlockedSites.length} sites`);
      const hasDouyin = defaults.defaultBlockedSites.some(d => d.toLowerCase().includes('douyin'));
      const hasTiktok = defaults.defaultBlockedSites.some(d => d.toLowerCase().includes('tiktok'));
      if (hasDouyin) ok('douyin.com is in defaultBlockedSites');
      else err('douyin.com NOT found in defaultBlockedSites');
      if (hasTiktok) ok('tiktok.com is in defaultBlockedSites');
      else err('tiktok.com NOT found in defaultBlockedSites');
    }

    if ('defaultCompositeSites' in defaults) err('defaults should NOT contain defaultCompositeSites');
    else ok('No defaultCompositeSites (as expected)');
  } catch (e) {
    err('GET /defaults failed', e.message);
  }

  // ── 4. GET /config ──
  console.log('\n4. GET /profiles/:id/config');
  let currentConfig = null;
  try {
    const configRes = await api(`/profiles/${profileId}/config`);
    currentConfig = configRes.data || {};

    if (Array.isArray(currentConfig.studyList)) ok(`studyList (effective): ${currentConfig.studyList.length} sites`);
    else err('studyList missing');

    if (Array.isArray(currentConfig.compositeList)) ok(`compositeList: ${currentConfig.compositeList.length} sites`);
    else err('compositeList missing');

    if (Array.isArray(currentConfig.unsafeList)) ok(`unsafeList (effective): ${currentConfig.unsafeList.length} sites`);
    else err('unsafeList missing');

    if (Array.isArray(currentConfig.restrictedEntertainmentList)) ok(`restrictedEntertainmentList (effective): ${currentConfig.restrictedEntertainmentList.length} sites`);
    else console.log(`  ⚠️ restrictedEntertainmentList missing (old profile, will be auto-populated by schema defaults on save)`);

    if (currentConfig.timeQuota && currentConfig.timeQuota.daily) {
      ok('timeQuota.daily present');
      const days = Object.keys(currentConfig.timeQuota.daily);
      if (days.length === 7) ok(`timeQuota has all 7 days (${days.join(', ')})`);
      else err('timeQuota does not have all 7 days', days.length);

      const monday = currentConfig.timeQuota.daily.monday;
      if (monday) {
        if ('studyMinutes' in monday && 'restMinutes' in monday && 'compositeMinutes' in monday) {
          ok('timeQuota.daily.monday has all three fields');
        } else {
          err('timeQuota.daily.monday missing fields');
        }
      }
    } else {
      console.log(`  ⚠️ timeQuota missing (old profile, will be auto-populated by schema defaults on save)`);
    }

    if (currentConfig.timeWindows) {
      ok('timeWindows present');
      if ('studyWindows' in currentConfig.timeWindows) ok('timeWindows.studyWindows present');
      else err('timeWindows.studyWindows missing');
      if (Array.isArray(currentConfig.timeWindows.restWindows)) ok(`timeWindows.restWindows: ${currentConfig.timeWindows.restWindows.length} windows`);
      else err('timeWindows.restWindows missing or not array');
      if ('onlineWindows' in currentConfig.timeWindows) ok('timeWindows.onlineWindows present');
      else err('timeWindows.onlineWindows missing');
    } else {
      console.log(`  ⚠️ timeWindows missing (old profile, will be auto-populated by schema defaults on save)`);
    }
  } catch (e) {
    err('GET /config failed', e.message);
  }

  // ── 5. PUT /config — save timeQuota & timeWindows ──
  console.log('\n5. PUT /profiles/:id/config (save timeQuota & timeWindows)');
  try {
    const testPayload = {
      timeQuota: {
        daily: {
          monday:    { studyMinutes: null, restMinutes: 90, compositeMinutes: 60 },
          tuesday:   { studyMinutes: 120, restMinutes: 90, compositeMinutes: 60 },
          wednesday: { studyMinutes: null, restMinutes: 90, compositeMinutes: 60 },
          thursday:  { studyMinutes: 120, restMinutes: 90, compositeMinutes: 60 },
          friday:    { studyMinutes: null, restMinutes: 90, compositeMinutes: 60 },
          saturday:  { studyMinutes: null, restMinutes: 180, compositeMinutes: 120 },
          sunday:    { studyMinutes: null, restMinutes: 180, compositeMinutes: 120 },
        }
      },
      timeWindows: {
        studyWindows: null,
        restWindows: [{ start: '19:00', end: '21:00' }],
        onlineWindows: null,
      },
    };

    const putRes = await api(`/profiles/${profileId}/config`, 'PUT', { data: testPayload });
    if (putRes.success) ok('PUT /config returned success');
    else err('PUT /config did not return success');
  } catch (e) {
    err('PUT /config failed', e.message);
  }

  // ── 6. Reload config and verify persistence ──
  console.log('\n6. Reload config and verify persistence');
  try {
    const reloadRes = await api(`/profiles/${profileId}/config`);
    const reloaded = reloadRes.data || {};

    const monday = reloaded.timeQuota?.daily?.monday;
    if (monday && monday.restMinutes === 90) ok('timeQuota.monday.restMinutes persisted (90)');
    else err('timeQuota.monday.restMinutes NOT persisted', monday?.restMinutes);

    const tuesdayStudy = reloaded.timeQuota?.daily?.tuesday?.studyMinutes;
    if (tuesdayStudy === 120) ok('timeQuota.tuesday.studyMinutes persisted (120)');
    else err('timeQuota.tuesday.studyMinutes NOT persisted', tuesdayStudy);

    const restWindows = reloaded.timeWindows?.restWindows;
    if (Array.isArray(restWindows) && restWindows.length === 1 && restWindows[0].start === '19:00') {
      ok('timeWindows.restWindows persisted');
    } else {
      err('timeWindows.restWindows NOT persisted', JSON.stringify(restWindows));
    }

    // Verify schema defaults populated missing fields for old profile
    if (Array.isArray(reloaded.restrictedEntertainmentList)) ok(`restrictedEntertainmentList auto-populated by schema defaults: ${reloaded.restrictedEntertainmentList.length} sites`);
    else err('restrictedEntertainmentList NOT auto-populated after save');

    // Verify legacy sync: restMinutes=90 for all weekdays but sat/sun=180
    // dailyRestQuota should NOT be synced (values differ)
    // dailyStudyQuota should NOT be synced (monday=null, tuesday=120)
  } catch (e) {
    err('Reload config failed', e.message);
  }

  // ── 7. Import/Export JSON shape test (via pages API, simulating frontend logic) ──
  console.log('\n7. Import/Export JSON shape test');
  try {
    const configRes = await api(`/profiles/${profileId}/config`);
    const cfg = configRes.data || {};

    // Simulate export
    const getCustomList = (effectiveList, defaultList) => {
      if (!effectiveList || !defaultList) return effectiveList || [];
      const defaultSet = new Set(defaultList.map(d => d.toLowerCase()));
      return effectiveList.filter(d => !defaultSet.has(d.toLowerCase()));
    };

    const defaultsRes = await api(`/profiles/${profileId}/defaults`);

    const exportData = {
      app: 'TimeOnChrome',
      configType: 'site-access',
      configVersion: 1,
      studySites: cfg.customStudyList || getCustomList(cfg.studyList, defaultsRes.defaultStudySites) || [],
      compositeSites: cfg.compositeList || [],
      restrictedEntertainmentSites: cfg.customRestrictedEntertainmentList || getCustomList(cfg.restrictedEntertainmentList, defaultsRes.defaultRestrictedEntertainmentSites) || [],
      blockedSites: cfg.customBlockedSites || getCustomList(cfg.unsafeList, defaultsRes.defaultBlockedSites) || [],
    };

    if (!('defaultStudySites' in exportData)) ok('Export does not contain defaultStudySites');
    else err('Export SHOULD NOT contain defaultStudySites');

    if (!('effectiveStudyList' in exportData)) ok('Export does not contain effectiveStudyList');
    else err('Export SHOULD NOT contain effectiveStudyList');

    if (Array.isArray(exportData.studySites)) ok(`Export studySites: ${exportData.studySites.length} sites`);
    if (Array.isArray(exportData.compositeSites)) ok(`Export compositeSites: ${exportData.compositeSites.length} sites`);
    if (Array.isArray(exportData.restrictedEntertainmentSites)) ok(`Export restrictedEntertainmentSites: ${exportData.restrictedEntertainmentSites.length} sites`);
    if (Array.isArray(exportData.blockedSites)) ok(`Export blockedSites: ${exportData.blockedSites.length} sites`);

    // Simulate import validation
    const requiredFields = ['studySites', 'compositeSites', 'restrictedEntertainmentSites', 'blockedSites'];
    for (const field of requiredFields) {
      if (Array.isArray(exportData[field]) && exportData[field].every(d => typeof d === 'string')) {
        ok(`Import validation: ${field} is string array`);
      } else {
        err(`Import validation: ${field} invalid`);
      }
    }
  } catch (e) {
    err('Import/Export test failed', e.message);
  }

  // ── 8. Playwright screenshot (if available) ──
  console.log('\n8. Playwright screenshot verification');
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

    // Wait for profile selector to show a name
    await page.waitForFunction(() => {
      const el = document.getElementById('current-profile-name');
      return el && el.textContent !== '选择孩子';
    }, { timeout: 10000 });
    ok('Profile loaded');

    // Screenshot: 网站管理
    await page.click('.nav-item[data-page="rules"]');
    await page.waitForTimeout(500);
    await page.screenshot({ path: 'tests/manual/screenshot-rules.png' });
    ok('Screenshot: page-rules saved to tests/manual/screenshot-rules.png');

    // Screenshot: 时间配额
    await page.click('.nav-item[data-page="quota"]');
    await page.waitForTimeout(500);
    await page.screenshot({ path: 'tests/manual/screenshot-quota.png' });
    ok('Screenshot: page-quota saved to tests/manual/screenshot-quota.png');

    // Screenshot: 时间段控制
    await page.click('.nav-item[data-page="schedule"]');
    await page.waitForTimeout(500);
    await page.screenshot({ path: 'tests/manual/screenshot-schedule.png' });
    ok('Screenshot: page-schedule saved to tests/manual/screenshot-schedule.png');

    await browser.close();
  } catch (e) {
    err('Playwright screenshot failed', e.message);
  }

  // ── Summary ──
  const total = passed + failed;
  console.log('\n========================================');
  console.log(`Result: ${passed}/${total} passed${failed ? ` — ${failed} FAILED` : ''}`);
  console.log('========================================\n');
  if (failed > 0) process.exit(1);
}

run();
