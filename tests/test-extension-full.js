const { chromium } = require('@playwright/test');
const path = require('path');

async function testExtensionBlocking() {
  const extPath = path.join(__dirname, '..', 'extension');
  
  console.log('=== Testing Chrome Extension Blocking ===\n');
  console.log('Extension path:', extPath);
  
  // 启动带有扩展的浏览器
  const browser = await chromium.launch({
    headless: false, // 需要可见模式
    args: [
      `--disable-extensions-except=${extPath}`,
      `--load-extension=${extPath}`,
      '--no-sandbox'
    ]
  });
  
  // 等待扩展加载
  await new Promise(r => setTimeout(r, 2000));
  
  // 创建新上下文和页面
  const context = await browser.newContext();
  const page = await context.newPage();
  
  // 监听控制台日志
  const logs = [];
  page.on('console', msg => {
    const text = `[${msg.type()}] ${msg.text()}`;
    console.log('[Page]', text);
    logs.push(text);
  });
  
  // 监听页面错误
  page.on('pageerror', err => {
    console.log('[Page Error]', err.message);
  });
  
  // 打开扩展的 popup（测试 popup 是否工作）
  console.log('\n1. Opening extension popup...');
  
  // 首先访问一个网站
  console.log('\n2. Navigating to baidu.com...');
  try {
    await page.goto('https://www.baidu.com', { timeout: 15000 });
    console.log('Current URL:', page.url());
  } catch (e) {
    console.log('Navigation error:', e.message);
  }
  
  await new Promise(r => setTimeout(r, 3000));
  
  // 截图
  const screenshotPath = path.join(__dirname, 'test-screenshot.png');
  await page.screenshot({ path: screenshotPath, fullPage: true });
  console.log('\nScreenshot saved to:', screenshotPath);
  
  // 输出收集到的日志
  console.log('\n=== Collected Logs ===');
  logs.forEach(log => console.log(log));
  
  await browser.close();
  
  console.log('\n=== Test Complete ===');
}

testExtensionBlocking()
  .then(() => {
    console.log('Test completed successfully');
    process.exit(0);
  })
  .catch(err => {
    console.error('Test error:', err);
    process.exit(1);
  });
