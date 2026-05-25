// Visual verification script for site access alignment
// Run: node tests/manual/visual-verify-site-access.js

const { chromium } = require('playwright');
const path = require('path');
const http = require('http');
const fs = require('fs');

const PAGES_DIR = path.resolve(__dirname, '../../pages');
const PORT = 3456;

// Minimal HTTP server for pages directory
function startServer() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const filePath = path.join(PAGES_DIR, req.url === '/' ? 'index.html' : req.url);
      fs.readFile(filePath, (err, data) => {
        if (err) {
          res.writeHead(404);
          res.end('Not found');
          return;
        }
        const ext = path.extname(filePath);
        const ct = ext === '.html' ? 'text/html' : ext === '.js' ? 'application/javascript' : ext === '.css' ? 'text/css' : 'text/plain';
        res.writeHead(200, { 'Content-Type': ct, 'Access-Control-Allow-Origin': '*' });
        res.end(data);
      });
    });
    server.listen(PORT, () => {
      console.log(`Server running at http://localhost:${PORT}`);
      resolve(server);
    });
  });
}

async function run() {
  const server = await startServer();
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

  // Mock data
  const mockProfile = {
    id: 'test-profile-1',
    name: 'TestChild',
    avatar_color: '#7c6fff'
  };

  const mockConfig = {
    version: '1.3',
    mode: 'study',
    enabled: true,
    studyList: ['drive.google.com', 'docs.google.com', 'keystoneacademy.cn', 'custom-study.example.com'],
    compositeList: ['google.com', 'www.google.com', 'bing.com', 'youtube.com', 'custom-composite.example.com'],
    unsafeList: ['douyin.com', 'tiktok.com', 'custom-blocked.example.com'],
    restrictedEntertainmentList: ['bilibili.com', 'netflix.com', 'custom-restricted.example.com'],
    customStudyList: ['keystoneacademy.cn', 'custom-study.example.com'],
    customCompositeList: ['custom-composite.example.com'],
    customRestrictedEntertainmentList: ['custom-restricted.example.com'],
    customBlockedSites: ['custom-blocked.example.com'],
    timeQuota: {
      daily: {
        monday: { studyMinutes: null, restMinutes: 120, compositeMinutes: 120 },
        tuesday: { studyMinutes: null, restMinutes: 120, compositeMinutes: 120 },
        wednesday: { studyMinutes: null, restMinutes: 120, compositeMinutes: 120 },
        thursday: { studyMinutes: null, restMinutes: 120, compositeMinutes: 120 },
        friday: { studyMinutes: null, restMinutes: 120, compositeMinutes: 120 },
        saturday: { studyMinutes: null, restMinutes: 120, compositeMinutes: 120 },
        sunday: { studyMinutes: null, restMinutes: 120, compositeMinutes: 120 },
      }
    },
    timeWindows: {
      daily: {
        monday: { studyWindows: null, compositeWindows: null, restWindows: [{ start: '15:30', end: '24:00' }] },
        tuesday: { studyWindows: null, compositeWindows: null, restWindows: [{ start: '15:30', end: '24:00' }] },
        wednesday: { studyWindows: null, compositeWindows: null, restWindows: [{ start: '15:30', end: '24:00' }] },
        thursday: { studyWindows: null, compositeWindows: null, restWindows: [{ start: '15:30', end: '24:00' }] },
        friday: { studyWindows: null, compositeWindows: null, restWindows: [{ start: '15:30', end: '24:00' }] },
        saturday: { studyWindows: null, compositeWindows: null, restWindows: [{ start: '15:30', end: '24:00' }] },
        sunday: { studyWindows: null, compositeWindows: null, restWindows: [{ start: '15:30', end: '24:00' }] },
      }
    }
  };

  const mockDefaults = {
    version: 1,
    defaultStudySites: ['drive.google.com', 'docs.google.com', 'sheets.google.com', 'slides.google.com', 'meet.google.com'],
    defaultCompositeSites: ['google.com', 'google.com.hk', 'bing.com', 'microsoft.com', 'apple.com', 'adobe.com', 'music.youtube.com', 'spotify.com', 'music.163.com'],
    defaultUserCompositeSites: ['youtube.com', 'wikipedia.org', 'wikimedia.org', 'britannica.com', 'stackoverflow.com', 'stackexchange.com', 'reddit.com'],
    defaultRestrictedEntertainmentSites: ['bilibili.com', 'netflix.com', 'disneyplus.com', 'hulu.com'],
    defaultBlockedSites: ['douyin.com', 'tiktok.com']
  };

  // Route API calls
  await page.route(`http://localhost:${PORT}/**/*`, async (route, request) => {
    const url = new URL(request.url());
    if (url.pathname === '/profiles') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ profiles: [mockProfile] }) });
    } else if (url.pathname === `/profiles/${mockProfile.id}/config`) {
      if (request.method() === 'GET') {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: mockConfig, updated_at: Date.now(), profile_id: mockProfile.id }) });
      } else {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, updated_at: Date.now() }) });
      }
    } else if (url.pathname === `/profiles/${mockProfile.id}/defaults`) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mockDefaults) });
    } else {
      await route.continue();
    }
  });

  // Inject localStorage before navigation
  await page.addInitScript(() => {
    localStorage.setItem('toc_session', JSON.stringify({ token: 'mock-token', email: 'test@example.com' }));
    localStorage.setItem('toc_currentProfileId', 'test-profile-1');
  });

  // Navigate
  await page.goto(`http://localhost:${PORT}/index.html`, { waitUntil: 'networkidle' });

  // Wait for main screen and render
  await page.waitForSelector('#main-screen', { state: 'visible', timeout: 10000 });
  await page.waitForTimeout(1500);

  // Navigate to rules page
  await page.click('.nav-item[data-page="rules"]');
  await page.waitForTimeout(1500);

  // Screenshot full rules page
  const screenshotDir = path.resolve(__dirname, '../../.artifacts/test-results');
  if (!fs.existsSync(screenshotDir)) fs.mkdirSync(screenshotDir, { recursive: true });

  const screenshotPath = path.join(screenshotDir, 'site-access-alignment-rules.png');
  await page.screenshot({ path: screenshotPath, fullPage: true });
  console.log(`Screenshot saved: ${screenshotPath}`);

  // Also take a screenshot of just the composite card area
  const compositeCard = await page.locator('#r-composite-card');
  if (await compositeCard.isVisible().catch(() => false)) {
    const compositePath = path.join(screenshotDir, 'site-access-alignment-composite.png');
    await compositeCard.screenshot({ path: compositePath });
    console.log(`Composite card screenshot: ${compositePath}`);
  }

  await browser.close();
  server.close();
  console.log('Visual verification complete.');
}

run().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
