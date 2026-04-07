const { chromium } = require('@playwright/test');
const path = require('path');

async function testRealBlocking() {
  const extPath = path.join(__dirname);
  const extId = 'test-extension-id';
  
  console.log('=== Testing Real Blocking Flow ===\n');
  
  const browser = await chromium.launch({ 
    headless: false, // 需要可见模式来加载扩展
    args: [
      `--disable-extensions-except=${extPath}`,
      `--load-extension=${extPath}`
    ]
  });
  
  // 获取扩展的 ID
  const context = browser.contexts()[0] || await browser.newContext();
  
  // 创建一个页面来触发拦截
  const page = await context.newPage();
  
  // 监听控制台
  page.on('console', msg => {
    console.log(`[Page Console] ${msg.text()}`);
  });
  
  page.on('pageerror', err => {
    console.log(`[Page Error] ${err.message}`);
  });
  
  // 首先，测试 popup 是否能正常打开
  console.log('1. Testing popup...');
  
  // 尝试访问一个普通网站
  console.log('2. Navigating to google.com...');
  await page.goto('https://www.google.com', { timeout: 10000 }).catch(e => console.log('Navigation error:', e.message));
  await page.waitForTimeout(2000);
  
  console.log('Current URL:', page.url());
  
  // 手动触发拦截测试 - 直接调用 background script
  console.log('\n3. Testing background script directly...');
  
  // 使用 Playwright 的 evaluate 来执行一些测试
  const result = await page.evaluate(async () => {
    // 尝试通过 chrome.runtime.sendMessage 与 background script 通信
    return new Promise((resolve) => {
      if (typeof chrome !== 'undefined' && chrome.runtime) {
        chrome.runtime.sendMessage({ type: 'GET_CONFIG' }, (response) => {
          resolve({ 
            success: true, 
            config: response ? {
              mode: response.mode,
              whitelist: response.whitelist,
              enabled: response.enabled
            } : null,
            error: chrome.runtime.lastError?.message
          });
        });
      } else {
        resolve({ success: false, error: 'chrome.runtime not available' });
      }
    });
  });
  
  console.log('Background script response:', JSON.stringify(result, null, 2));
  
  // 截图
  await page.screenshot({ path: path.join(__dirname, 'test-real-blocking.png'), fullPage: true });
  console.log('\nScreenshot saved to test-real-blocking.png');
  
  await browser.close();
  
  return result;
}

// 由于 Playwright 加载扩展需要特殊处理，我们先用简单方法测试
async function testBackgroundScript() {
  console.log('=== Testing Background Script Logic ===\n');
  
  // 直接测试 URL 参数解析
  const testCases = [
    { url: 'blocked.html?reason=whitelist&domain=example.com', expectedDomain: 'example.com' },
    { url: 'blocked.html?reason=blacklist&domain=bilibili.com', expectedDomain: 'bilibili.com' },
    { url: 'blocked.html?reason=quota&domain=youtube.com', expectedDomain: 'youtube.com' },
  ];
  
  console.log('Testing blocked.html URL parsing:\n');
  
  for (const tc of testCases) {
    const params = new URLSearchParams(tc.url.split('?')[1]);
    const reason = params.get('reason');
    const domain = params.get('domain');
    
    console.log(`URL: ${tc.url}`);
    console.log(`  Parsed reason: "${reason}", expected: "${tc.url.split('reason=')[1]?.split('&')[0]}"`);
    console.log(`  Parsed domain: "${domain}", expected: "${tc.expectedDomain}"`);
    console.log(`  Match: ${domain === tc.expectedDomain ? '✅' : '❌'}`);
    console.log('');
  }
}

testBackgroundScript()
  .then(() => {
    console.log('\nURL parsing test completed.');
    console.log('\n如果 blocked.html 能正确解析参数，问题可能在：');
    console.log('1. background.js 的 checkAndBlock 没有被调用');
    console.log('2. blockTab 没有被调用');
    console.log('3. declarativeNetRequest 规则没有正确更新');
  })
  .catch(err => {
    console.error('Test error:', err);
  });
