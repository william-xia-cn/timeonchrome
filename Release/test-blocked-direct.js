const { chromium } = require('@playwright/test');
const path = require('path');

async function testBlockedPage() {
  const extPath = path.join(__dirname);
  
  console.log('=== Testing blocked.html Directly ===\n');
  
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();
  
  // 监听控制台日志
  page.on('console', msg => {
    console.log(`[Console] ${msg.type()}: ${msg.text()}`);
  });
  
  // 直接打开 blocked.html
  const blockedUrl = `file://${extPath}/blocked.html?reason=whitelist&domain=google.com`;
  console.log(`Opening: ${blockedUrl}\n`);
  
  await page.goto(blockedUrl);
  await page.waitForTimeout(2000);
  
  // 检查调试信息
  const debugInfo = await page.$('#debug-info');
  const debugVisible = debugInfo ? await debugInfo.isVisible() : false;
  const debugReason = await page.$eval('#debug-reason', el => el.textContent).catch(() => 'N/A');
  const debugDomain = await page.$eval('#debug-domain', el => el.textContent).catch(() => 'N/A');
  
  console.log('=== Debug Info ===');
  console.log(`Visible: ${debugVisible}`);
  console.log(`Reason: "${debugReason}"`);
  console.log(`Domain: "${debugDomain}"`);
  
  // 检查临时放行按钮
  const tempSection = await page.$('#tempAllowSection');
  const tempVisible = tempSection ? await tempSection.isVisible() : false;
  const domainEl = await page.$eval('#domainEl', el => el.textContent).catch(() => 'N/A');
  const reasonBadge = await page.$eval('#reasonBadge', el => el.textContent).catch(() => 'N/A');
  
  console.log('\n=== Temp Allow Section ===');
  console.log(`Visible: ${tempVisible}`);
  
  console.log('\n=== Page Content ===');
  console.log(`Domain displayed: "${domainEl}"`);
  console.log(`Reason badge: "${reasonBadge}"`);
  
  // 截图
  const screenshotPath = path.join(__dirname, 'blocked-test-result.png');
  await page.screenshot({ path: screenshotPath, fullPage: true });
  console.log(`\nScreenshot: ${screenshotPath}`);
  
  await browser.close();
  
  // 判断结果
  console.log('\n=== Test Result ===');
  if (debugDomain === 'google.com' && tempVisible) {
    console.log('✅ PASS: Temp whitelist button is visible with correct domain');
  } else if (debugDomain !== 'google.com') {
    console.log('❌ FAIL: Domain not passed correctly');
  } else if (!tempVisible) {
    console.log('❌ FAIL: Temp whitelist button not visible');
  }
}

testBlockedPage()
  .then(() => {
    console.log('\nTest completed');
    process.exit(0);
  })
  .catch(err => {
    console.error('Error:', err);
    process.exit(1);
  });
