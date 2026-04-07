const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

async function testExtension() {
  const extPath = __dirname;
  
  // 创建浏览器实例并加载扩展
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  
  // 加载扩展
  const extensionId = await context.waitForEvent('serviceworker', { timeout: 5000 }).catch(() => null);
  
  // 创建一个测试页面
  const page = await context.newPage();
  
  // 监听控制台日志
  page.on('console', msg => {
    console.log(`[Browser Console] ${msg.type()}: ${msg.text()}`);
  });
  
  // 直接导航到 blocked.html 并传递参数
  const blockedUrl = `file://${extPath}/blocked.html?reason=whitelist&domain=example.com`;
  console.log(`Navigating to: ${blockedUrl}`);
  
  await page.goto(blockedUrl);
  await page.waitForTimeout(1000);
  
  // 检查调试信息
  const debugInfo = await page.locator('#debug-info').isVisible();
  const debugReason = await page.locator('#debug-reason').textContent();
  const debugDomain = await page.locator('#debug-domain').textContent();
  
  console.log(`\n=== DEBUG INFO ===`);
  console.log(`Debug section visible: ${debugInfo}`);
  console.log(`Reason: "${debugReason}"`);
  console.log(`Domain: "${debugDomain}"`);
  
  // 检查临时放行按钮是否显示
  const tempAllowVisible = await page.locator('#tempAllowSection').isVisible();
  console.log(`\n=== TEMP ALLOW SECTION ===`);
  console.log(`Visible: ${tempAllowVisible}`);
  
  // 获取页面标题
  const title = await page.title();
  console.log(`\nPage title: ${title}`);
  
  // 获取域名显示
  const domainEl = await page.locator('#domainEl').textContent();
  console.log(`Domain displayed: ${domainEl}`);
  
  // 获取 reason badge
  const reasonBadge = await page.locator('#reasonBadge').textContent();
  console.log(`Reason badge: ${reasonBadge}`);
  
  // 截图
  await page.screenshot({ path: path.join(__dirname, 'test-blocked.png'), fullPage: true });
  console.log(`\nScreenshot saved to test-blocked.png`);
  
  await browser.close();
  
  // 返回测试结果
  return {
    debugReason,
    debugDomain,
    tempAllowVisible
  };
}

testExtension()
  .then(result => {
    console.log('\n=== TEST RESULT ===');
    console.log(JSON.stringify(result, null, 2));
    
    if (result.debugDomain === 'example.com' && result.tempAllowVisible) {
      console.log('\n✅ TEST PASSED: Temp whitelist button is visible');
    } else if (result.debugDomain !== 'example.com') {
      console.log('\n❌ TEST FAILED: Domain parameter not received correctly');
    } else if (!result.tempAllowVisible) {
      console.log('\n❌ TEST FAILED: Temp whitelist button not visible despite having domain');
    }
  })
  .catch(err => {
    console.error('Test error:', err);
  });
