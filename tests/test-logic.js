// 直接测试 blocked.html 的逻辑，不需要浏览器
const path = require('path');

// 模拟 blocked.html 的 URL 参数解析逻辑
function testBlockedHtmlLogic() {
  console.log('=== Testing blocked.html Logic ===\n');
  
  // 测试用例
  const testCases = [
    {
      name: '正常情况：reason=whitelist, domain=example.com',
      url: 'blocked.html?reason=whitelist&domain=example.com',
      expectedReason: 'whitelist',
      expectedDomain: 'example.com'
    },
    {
      name: 'URL 编码的域名',
      url: 'blocked.html?reason=whitelist&domain=www.example.com',
      expectedReason: 'whitelist',
      expectedDomain: 'www.example.com'
    },
    {
      name: '中文消息',
      url: 'blocked.html?reason=whitelist&domain=test.com&msg=%E6%B5%8B%E8%AF%95',
      expectedReason: 'whitelist',
      expectedDomain: 'test.com'
    },
    {
      name: '缺少 domain 参数',
      url: 'blocked.html?reason=whitelist',
      expectedReason: 'whitelist',
      expectedDomain: ''
    },
    {
      name: '只有 reason',
      url: 'blocked.html?reason=whitelist',
      expectedReason: 'whitelist',
      expectedDomain: ''
    }
  ];
  
  let passed = 0;
  let failed = 0;
  
  for (const tc of testCases) {
    console.log(`Test: ${tc.name}`);
    console.log(`  URL: ${tc.url}`);
    
    // 模拟 URL 参数解析
    const url = new URL('file:///' + tc.url.replace(/^blocked\.html/, 'blocked.html'));
    const params = new URLSearchParams(tc.url.split('?')[1]);
    const reason = params.get('reason') || 'block';
    let domain = params.get('domain') || '';
    const msg = params.get('msg') || '';
    
    // 检查条件
    const condition = reason === 'whitelist' && domain;
    
    console.log(`  Parsed: reason="${reason}", domain="${domain}"`);
    console.log(`  Condition (reason === 'whitelist' && domain): ${condition}`);
    
    if (reason === tc.expectedReason && domain === tc.expectedDomain) {
      console.log(`  ✅ PASS`);
      passed++;
    } else {
      console.log(`  ❌ FAIL: expected reason="${tc.expectedReason}", domain="${tc.expectedDomain}"`);
      failed++;
    }
    console.log('');
  }
  
  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
  
  // 测试临时放行按钮的显示条件
  console.log('\n=== Testing Temp Allow Button Visibility ===');
  
  const visibilityTests = [
    { reason: 'whitelist', domain: 'example.com', shouldShow: true },
    { reason: 'whitelist', domain: '', shouldShow: false },
    { reason: 'blacklist', domain: 'example.com', shouldShow: false },
    { reason: 'quota', domain: 'example.com', shouldShow: false },
    { reason: 'schedule', domain: 'example.com', shouldShow: false },
  ];
  
  for (const vt of visibilityTests) {
    const show = vt.reason === 'whitelist' && vt.domain;
    const status = show === vt.shouldShow ? '✅' : '❌';
    console.log(`${status} reason="${vt.reason}", domain="${vt.domain}" => show=${show} (expected ${vt.shouldShow})`);
  }
}

// 检查 blocked.html 文件
function checkBlockedHtmlFile() {
  console.log('\n=== Checking blocked.html File ===\n');
  
  const fs = require('fs');
  const blockedHtmlPath = path.join(__dirname, '..', 'extension', 'blocked.html');
  
  if (!fs.existsSync(blockedHtmlPath)) {
    console.log('❌ blocked.html not found!');
    return;
  }
  
  const content = fs.readFileSync(blockedHtmlPath, 'utf8');
  
  // 检查关键代码
  const checks = [
    { name: 'URL 参数解析', pattern: /const params = new URLSearchParams/ },
    { name: 'reason 获取', pattern: /params\.get\(['"]reason['"]\)/ },
    { name: 'domain 获取', pattern: /params\.get\(['"]domain['"]\)/ },
    { name: '临时放行条件', pattern: /if \(reason === ['"]whitelist['"] && domain\)/ },
    { name: '临时放行按钮显示', pattern: /tempAllowSection\.style\.display = ['"]block['"]/ },
  ];
  
  for (const check of checks) {
    const found = check.pattern.test(content);
    console.log(`${found ? '✅' : '❌'} ${check.name}`);
  }
}

// 检查 background.js 的 blockTab 函数
function checkBackgroundJs() {
  console.log('\n=== Checking background.js ===\n');
  
  const fs = require('fs');
  const bgPath = path.join(__dirname, '..', 'extension', 'background.js');
  
  if (!fs.existsSync(bgPath)) {
    console.log('❌ background.js not found!');
    return;
  }
  
  const content = fs.readFileSync(bgPath, 'utf8');
  
  // 检查关键代码
  const checks = [
    { name: 'blockTab 函数定义', pattern: /async function blockTab\(tabId, domain, reason, message\)/ },
    { name: 'blockTab 传递 domain', pattern: /domain=\$\{encodeURIComponent\(domain\)\}/ },
    { name: 'checkAndBlock 函数定义', pattern: /async function checkAndBlock\(tabId, url\)/ },
    { name: 'whitelist 模式检查', pattern: /config\.mode === ['"]whitelist['"]/ },
    { name: '不在白名单时拦截', pattern: /if \(!allowed\)[\s\S]*await blockTab/ },
    { name: 'webNavigation 监听', pattern: /chrome\.webNavigation\.onCommitted/ },
  ];
  
  for (const check of checks) {
    const found = check.pattern.test(content);
    console.log(`${found ? '✅' : '❌'} ${check.name}`);
  }
}

testBlockedHtmlLogic();
checkBlockedHtmlFile();
checkBackgroundJs();

console.log('\n=== Summary ===');
console.log('blocked.html 本身应该能正确解析参数并显示临时放行按钮。');
console.log('如果测试通过但实际不工作，问题可能在拦截流程中。');
