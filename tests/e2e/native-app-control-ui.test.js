const { test, expect } = require('@playwright/test');
const http = require('http');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

test.use({ headless: true });

const ROOT = path.resolve(__dirname, '..', '..');
const PAGES = path.join(ROOT, 'pages');
let server;
let baseUrl;

test.beforeAll(async () => {
  server = http.createServer((request, response) => {
    const pathname = request.url === '/' ? '/native-apps/index.html' : request.url;
    const file = path.join(PAGES, pathname.replace(/^\//, ''));
    if (!file.startsWith(PAGES) || !fs.existsSync(file)) { response.writeHead(404); response.end(); return; }
    const type = file.endsWith('.css') ? 'text/css'
      : file.endsWith('.js') ? 'text/javascript'
        : file.endsWith('.svg') ? 'image/svg+xml'
          : file.endsWith('.png') ? 'image/png'
            : 'text/html';
    response.writeHead(200, { 'Content-Type': type });
    response.end(fs.readFileSync(file));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

test.afterAll(async () => { await new Promise((resolve) => server.close(resolve)); });

function fakeJwt() {
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${encode({ alg: 'ES256', typ: 'JWT' })}.${encode({ child_id: 'child-1', child_name: 'Pierce', exp: 4102444800 })}.signature`;
}

function zipEntry(name, content) {
  const nameBytes = Buffer.from(name);
  const compressed = zlib.deflateRawSync(Buffer.from(content));
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(8, 8);
  local.writeUInt32LE(compressed.length, 18);
  local.writeUInt32LE(Buffer.byteLength(content), 22);
  local.writeUInt16LE(nameBytes.length, 26);
  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(8, 10);
  central.writeUInt32LE(compressed.length, 20);
  central.writeUInt32LE(Buffer.byteLength(content), 24);
  central.writeUInt16LE(nameBytes.length, 28);
  return { data: Buffer.concat([local, nameBytes, compressed]), central: Buffer.concat([central, nameBytes]) };
}

function inventoryZip() {
  const entries = [
    zipEntry('inventory/applications.json', JSON.stringify([{
      displayName: 'Steam', bundleId: 'com.valvesoftware.steam', teamId: 'MXGJJ98X76',
      signingId: 'com.valvesoftware.steam', signatureStatus: 'signed_valid',
      mainExecutableSHA256: 'a'.repeat(64), sourceCategory: 'third_party',
    }])),
    zipEntry('inventory/errors.log', 'private scan details must not be uploaded'),
  ];
  let offset = 0;
  const central = entries.map((entry) => {
    entry.central.writeUInt32LE(offset, 42);
    offset += entry.data.length;
    return entry.central;
  });
  const directory = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...entries.map((entry) => entry.data), directory, end]);
}

async function mockApis(page) {
  await page.addInitScript(() => {
    localStorage.setItem('toc_session', JSON.stringify({ token: 'account-token', email: 'parent@example.com' }));
    localStorage.setItem('toc_currentProfileId', JSON.stringify('child-1'));
  });
  await page.route('https://guardian-api.william-xia-cn.workers.dev/**', (route) => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify({ token: fakeJwt(), expiresAt: 4102444800 }),
  }));
  await page.route('https://timeonchrome-native-app-api.william-xia-cn.workers.dev/**', (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === '/native/v1/macs' && route.request().method() === 'POST') {
      route.fulfill({
        status: 201, contentType: 'application/json', body: JSON.stringify({ data: {
          id: 'mac-new', displayName: 'Pierce MacBook', status: 'active',
          syncBaseUrl: 'https://native.example.test/santa/v1/endpoint/secret/',
        } }),
      });
      return;
    }
    const data = url.pathname.includes('/macs') ? [{
      id: 'mac-1', display_name: 'Pierce MacBook', hostname: 'pierce-mac', status: 'active',
      santa_version: '2026.4', os_version: '15.6', applied_policy_version: 3, desired_policy_version: 3,
      serial_number: 'SERIAL1234', last_preflight_at: Date.now(),
    }] : url.searchParams.get('state') === 'BLOCK' ? [{
      id: 'app-preconfigured', display_name: 'Firefox', publisher: 'Mozilla',
      team_id: '43AQ936H96', top_level_bundle_id: 'org.mozilla.firefox', state: 'BLOCK', observed: 0,
      presentationClass: 'USER_APPLICATION', contentCategory: '其它', policyAvailable: true,
    }] : [
      {
        id: 'app-1', display_name: 'Example Study App', publisher: 'Example Publisher',
        team_id: 'TEAM123', top_level_bundle_id: 'com.example.study', state: 'REVIEW',
        observed: 1, last_observed_at: Date.now(), presentationClass: 'USER_APPLICATION',
        contentCategory: '教育', policyAvailable: true,
        reviewPriority: 'PRIMARY', componentCount: 1, components: [{
          id: 'helper-1', display_name: 'Example Helper', publisher: 'Example Publisher',
          team_id: 'TEAM123', bundle_id: 'com.example.study.helper',
          sample_path: '/Applications/Example Study.app/Contents/Helpers/Example Helper',
        }],
      },
      {
        id: 'unknown-1', display_name: 'Unknown Tool', sample_path: '/private/tmp/unknown-tool',
        state: 'REVIEW', observed: 1, last_observed_at: Date.now() - 100,
        presentationClass: 'UNKNOWN_EXECUTABLE', reviewPriority: 'PRIMARY', components: [],
      },
      {
        id: 'daemon-1', display_name: 'Vendor Daemon', publisher: 'Vendor', team_id: 'VENDOR',
        sample_path: '/Library/PrivilegedHelperTools/com.vendor.daemon', state: 'REVIEW', observed: 1,
        last_observed_at: Date.now() - 200, presentationClass: 'STANDALONE_BACKGROUND',
        reviewPriority: 'BACKGROUND', components: [],
      },
      {
        id: 'system-1', display_name: 'SystemUIServer', publisher: 'Apple Inc.',
        top_level_bundle_id: 'com.apple.systemuiserver', sample_path: '/System/Library/CoreServices/SystemUIServer',
        state: 'REVIEW', observed: 1, last_observed_at: Date.now() - 300,
        presentationClass: 'SYSTEM_COMPONENT', reviewPriority: 'SYSTEM', components: [],
      },
    ];
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data }) });
  });
}

for (const viewport of [{ name: 'desktop', width: 1280, height: 800 }, { name: 'narrow', width: 720, height: 900 }]) {
  test(`Native Apps ${viewport.name} layout`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await mockApis(page);
    await page.goto(`${baseUrl}/native-apps/index.html`);
    await expect(page.getByRole('heading', { name: '待审核应用' })).toBeVisible();
    await expect(page.locator('details.category-group > summary')).toContainText('教育');
    await expect(page.getByText('Example Study App')).toBeVisible();
    await expect(page.getByText('Unknown Tool')).toBeHidden();
    await expect(page.locator('details.technical-group > summary')).toContainText('技术记录');
    await expect(page.getByText('Vendor Daemon')).toBeHidden();
    await expect(page.getByText('Example Helper', { exact: true })).toBeHidden();
    await expect(page.getByRole('button', { name: '阻止发布者' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: '合并应用身份' })).toHaveCount(0);
    await page.screenshot({ path: path.join(ROOT, '.artifacts', `native-app-control-review-default-${viewport.name}.png`), fullPage: true });
    await page.getByRole('button', { name: '详情' }).first().click();
    await expect(page.getByRole('heading', { name: 'Example Study App' })).toBeVisible();
    await expect(page.getByText('Example Helper', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: '阻止发布者' })).toBeVisible();
    await expect(page.getByRole('button', { name: '合并应用身份' })).toBeVisible();
    await page.screenshot({ path: path.join(ROOT, '.artifacts', `native-app-control-detail-${viewport.name}.png`), fullPage: true });
    await page.getByRole('button', { name: '关闭' }).click();
    await page.locator('details.technical-group > summary').click();
    await expect(page.getByText('Unknown Tool')).toBeVisible();
    await expect(page.getByText('Vendor Daemon')).toBeVisible();
    await expect(page.getByText('SystemUIServer', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: '阻止' }).first()).toBeVisible();
    await page.screenshot({ path: path.join(ROOT, '.artifacts', `native-app-control-review-${viewport.name}.png`), fullPage: true });
    await page.getByRole('button', { name: '已阻止' }).click();
    await expect(page.getByText('Firefox', { exact: true })).toBeVisible();
    await expect(page.getByText('预置规则 · 尚未在终端发现')).toBeVisible();
    await page.screenshot({ path: path.join(ROOT, '.artifacts', `native-app-control-block-${viewport.name}.png`), fullPage: true });
    await page.getByRole('button', { name: 'Native Macs' }).click();
    await expect(page.getByText('Pierce MacBook')).toBeVisible();
    await expect(page.getByRole('button', { name: '导入应用清单' })).toBeVisible();
    await expect(page.getByText('已绑定')).toBeVisible();
    await expect(page.getByText(/序列号 …1234/)).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    expect(overflow).toBe(false);
    await page.screenshot({ path: path.join(ROOT, '.artifacts', `native-app-control-${viewport.name}.png`), fullPage: true });
  });
}

test('创建 Native Mac 自动下载专属 mobileconfig 且不显示裸 SyncBaseURL', async ({ page }) => {
  await page.setViewportSize({ width: 1100, height: 760 });
  await mockApis(page);
  await page.goto(`${baseUrl}/native-apps/index.html`);
  await page.getByRole('button', { name: 'Native Macs' }).click();
  await page.getByRole('button', { name: '添加 Native Mac' }).click();
  await page.getByPlaceholder('例如 Pierce MacBook').fill('Pierce MacBook');
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: '创建' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('TimeOnChrome-Santa-Pierce-MacBook.mobileconfig');
  const profile = fs.readFileSync(await download.path(), 'utf8');
  expect(profile).toContain('<string>com.northpolesec.santa</string>');
  expect(profile).toContain('<key>PayloadScope</key><string>System</string>');
  expect(profile).toContain('<key>PayloadOrganization</key><string>TimeOnChrome</string>');
  expect(profile).toContain('<string>https://native.example.test/santa/v1/endpoint/secret/</string>');
  expect(profile).toContain('Pierce MacBook');
  expect(profile).not.toContain('child-1');
  expect(profile).not.toMatch(/managedDeviceToken|Chrome Device|device_token/);
  await expect(page.getByRole('heading', { name: 'Santa 配置已生成' })).toBeVisible();
  await expect(page.getByText('https://native.example.test/santa/v1/endpoint/secret/')).toHaveCount(0);
  await page.screenshot({ path: path.join(ROOT, '.artifacts', 'native-app-control-enrollment-profile.png'), fullPage: true });
});

test('导入 ZIP 只发送顶层应用身份，不发送组件或扫描日志', async ({ page }) => {
  let uploaded;
  await mockApis(page);
  await page.route('**/native/v1/macs/mac-1/inventory', async (route) => {
    uploaded = route.request().postDataJSON();
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: { count: 1 } }) });
  });
  await page.goto(`${baseUrl}/native-apps/index.html`);
  await page.getByRole('button', { name: 'Native Macs' }).click();
  await page.getByRole('button', { name: '导入应用清单' }).click();
  await page.locator('#inventory-file-input').setInputFiles({
    name: 'inventory.zip', mimeType: 'application/zip', buffer: inventoryZip(),
  });
  await expect(page.getByText('已导入 1 个顶层应用')).toBeVisible();
  expect(uploaded.applications).toHaveLength(1);
  expect(uploaded.applications[0].displayName).toBe('Steam');
  expect(JSON.stringify(uploaded)).not.toContain('private scan details');
});

test('可选本地 Mac 清单 ZIP 回归', async ({ page }) => {
  const inventoryPath = process.env.SANTA_INVENTORY_ZIP;
  test.skip(!inventoryPath || !fs.existsSync(inventoryPath), '仅在提供本地清单路径时运行');
  let uploaded;
  await mockApis(page);
  await page.route('**/native/v1/macs/mac-1/inventory', async (route) => {
    uploaded = route.request().postDataJSON();
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: { count: uploaded.applications.length } }) });
  });
  await page.goto(`${baseUrl}/native-apps/index.html`);
  await page.getByRole('button', { name: 'Native Macs' }).click();
  await page.getByRole('button', { name: '导入应用清单' }).click();
  await page.locator('#inventory-file-input').setInputFiles(inventoryPath);
  await expect(page.getByText(/已导入 \d+ 个顶层应用/)).toBeVisible();
  expect(uploaded.applications).toHaveLength(146);
  expect(JSON.stringify(uploaded)).not.toContain('collectionErrors');
  expect(JSON.stringify(uploaded)).not.toContain('applicationPath');
});

for (const viewport of [{ name: 'desktop', width: 1366, height: 800 }, { name: 'narrow', width: 720, height: 900 }]) {
  test(`146 个顶层应用按六类折叠展示 ${viewport.name}`, async ({ page }) => {
    const counts = [['社交', 3], ['娱乐', 5], ['游戏', 9], ['人工智能', 1], ['教育', 21], ['其它', 107]];
    const data = counts.flatMap(([category, count]) => Array.from({ length: count }, (_, index) => ({
      id: `${category}-${index}`, display_name: `${category} App ${index + 1}`,
      top_level_bundle_id: `com.example.${category}.${index}`, state: 'REVIEW',
      observed: 0, installed: true, policyAvailable: true,
      contentCategory: category, presentationClass: 'USER_APPLICATION', components: [],
    })));
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await mockApis(page);
    await page.route('**/native/v1/applications?state=REVIEW', (route) => route.fulfill({
      status: 200, contentType: 'application/json', body: JSON.stringify({ data }),
    }));
    await page.goto(`${baseUrl}/native-apps/index.html`);
    await expect(page.locator('details.category-group')).toHaveCount(6);
    await expect(page.getByText('146 个应用')).toBeVisible();
    await expect(page.getByText('已安装 · 尚无 Santa 执行记录').first()).toBeVisible();
    await expect(page.locator('#review-count')).toBeHidden();
    expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);
    await page.screenshot({ path: path.join(ROOT, '.artifacts', `native-app-control-146-${viewport.name}.png`) });
  });
}
