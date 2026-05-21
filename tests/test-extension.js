/**
 * TimeOnChrome 自动化测试
 * 
 * 使用 Playwright 的持久化浏览器加载 Chrome 扩展
 * 运行: node test-extension.js
 * 
 * 测试策略:
 * 1. 使用 --load-extension 加载插件
 * 2. 通过 chrome-extension:// 协议访问扩展页面（可使用 Chrome API）
 * 3. 测试完整绑定流程
 */

const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

// 配置
const EXTENSION_PATH = path.resolve(__dirname, '..', 'extension');
const USER_DATA_DIR = path.resolve(__dirname, '..', '.artifacts', 'test-user-data');
const EXTENSION_ID = 'hoelbdpoglmallgflolmommghdfjbdgn';  // 扩展 ID
const TEST_ACCOUNT = {
  email: 'testuser@example.com',
  password: 'test123456'
};

// 确保用户数据目录存在
if (!fs.existsSync(USER_DATA_DIR)) {
  fs.mkdirSync(USER_DATA_DIR, { recursive: true });
}

/**
 * 测试 1: 验证插件加载 - 使用 chrome-extension:// 协议
 */
async function testExtensionLoaded(context) {
  console.log('\n========== 测试 1: 验证插件加载 ==========');
  console.log('扩展 ID:', EXTENSION_ID);
  
  const page = await context.newPage();
  const popupUrl = `chrome-extension://${EXTENSION_ID}/popup/popup.html`;
  
  try {
    await page.goto(popupUrl, { waitUntil: 'domcontentloaded', timeout: 10000 });
    await new Promise(r => setTimeout(r, 2000));
    
    // 检查 Chrome API 是否可用
    const apiCheck = await page.evaluate(() => ({
      hasChrome: typeof chrome !== 'undefined',
      hasRuntime: typeof chrome !== 'undefined' && !!chrome?.runtime,
      hasStorage: typeof chrome !== 'undefined' && !!chrome?.storage,
      runtimeId: typeof chrome !== 'undefined' && chrome?.runtime?.id || 'N/A'
    }));
    
    console.log('Chrome API 检查:', apiCheck);
    
    if (!apiCheck.hasChrome || !apiCheck.hasRuntime) {
      console.log('✗ Chrome API 不可用 - 扩展环境未正确加载');
      return false;
    }
    
    const title = await page.title();
    console.log('Popup 页面标题:', title);
    console.log('✓ 插件已正确加载（扩展环境）');
    return true;
  } catch (e) {
    console.log('✗ 访问失败:', e.message);
    return false;
  }
}

/**
 * 测试 2: 验证管理页面
 */
async function testAdminPage(context) {
  console.log('\n========== 测试 2: 验证管理页面 ==========');
  
  const page = await context.newPage();
  const adminUrl = `chrome-extension://${EXTENSION_ID}/admin/admin.html`;
  
  try {
    await page.goto(adminUrl, { waitUntil: 'domcontentloaded', timeout: 10000 });
    await new Promise(r => setTimeout(r, 3000));
    
    // 检查 Chrome API
    const apiCheck = await page.evaluate(() => ({
      hasChrome: typeof chrome !== 'undefined',
      hasRuntime: !!chrome?.runtime,
      hasStorage: !!chrome?.storage
    }));
    console.log('Chrome API 检查:', apiCheck);
    
    const title = await page.title();
    console.log('管理页面标题:', title);
    
    const loginScreen = await page.$('#login-screen');
    const mainScreen = await page.$('#main-screen');
    console.log('登录界面元素存在:', !!loginScreen);
    console.log('主界面元素存在:', !!mainScreen);
    
    if (apiCheck.hasChrome && apiCheck.hasStorage) {
      console.log('✓ 管理页面可以访问（扩展环境，Chrome API 可用）');
      return true;
    } else {
      console.log('⚠ Chrome API 不可用，但页面可访问');
      return false;
    }
  } catch (e) {
    console.log('✗ 管理页面访问失败:', e.message);
    return false;
  }
}

/**
 * 测试 3: 绑定状态检查
 */
async function testBindStatus(context) {
  console.log('\n========== 测试 3: 绑定状态检查 ==========');
  
  const page = await context.newPage();
  const adminUrl = `chrome-extension://${EXTENSION_ID}/admin/admin.html`;
  
  try {
    await page.goto(adminUrl, { waitUntil: 'domcontentloaded', timeout: 10000 });
    await new Promise(r => setTimeout(r, 3000));
    
    const loginDisplay = await page.$eval('#login-screen', el => getComputedStyle(el).display).catch(() => 'none');
    const mainDisplay = await page.$eval('#main-screen', el => getComputedStyle(el).display).catch(() => 'none');
    
    console.log('当前状态 - 登录界面:', loginDisplay, '主界面:', mainDisplay);
    
    if (loginDisplay === 'none' && mainDisplay === 'block') {
      console.log('✓ 设备已绑定，自动登录成功');
      
      // 检查用户信息
      const userInfo = await page.$('#user-info');
      if (userInfo) {
        const isVisible = await userInfo.evaluate(el => getComputedStyle(el).display !== 'none');
        if (isVisible) {
          const profileName = await page.$eval('#profile-name-display', el => el.textContent).catch(() => '未知');
          const accountEmail = await page.$eval('#account-email-display', el => el.textContent).catch(() => '');
          console.log('孩子:', profileName);
          console.log('账户:', accountEmail);
        }
      }
      return { bound: true };
    } else {
      console.log('○ 设备未绑定，显示登录界面');
      return { bound: false };
    }
  } catch (e) {
    console.log('✗ 绑定状态检查失败:', e.message);
    return { bound: false, error: e.message };
  }
}

/**
 * 测试 4: 完整绑定流程
 */
async function testCompleteBindFlow(context) {
  console.log('\n========== 测试 4: 完整绑定流程 ==========');
  
  const page = await context.newPage();
  const adminUrl = `chrome-extension://${EXTENSION_ID}/admin/admin.html`;
  
  try {
    await page.goto(adminUrl, { waitUntil: 'domcontentloaded', timeout: 10000 });
    await new Promise(r => setTimeout(r, 3000));
    
    // 检查是否需要登录
    const loginDisplay = await page.$eval('#login-screen', el => getComputedStyle(el).display).catch(() => 'none');
    
    if (loginDisplay !== 'flex') {
      console.log('跳过: 设备已绑定');
      return { success: false, reason: 'already-bound' };
    }
    
    console.log('步骤 1: 填写登录信息...');
    await page.fill('#email-input', TEST_ACCOUNT.email);
    console.log('  ✓ 邮箱:', TEST_ACCOUNT.email);
    await page.fill('#pw-input', TEST_ACCOUNT.password);
    console.log('  ✓ 密码: 已填写');
    
    console.log('步骤 2: 点击登录按钮...');
    await page.click('#login-btn');
    console.log('  ✓ 已点击登录');
    
    console.log('步骤 3: 等待孩子选择器...');
    await new Promise(r => setTimeout(r, 5000));
    
    const profileSelector = await page.$('#profile-selector');
    if (!profileSelector) {
      console.log('✗ 孩子选择器未出现');
      return { success: false, reason: 'no-profile-selector' };
    }
    console.log('  ✓ 孩子选择器已显示');
    
    const profileItems = await page.$$('.profile-item');
    console.log('  ✓ 发现', profileItems.length, '个孩子');
    
    if (profileItems.length === 0) {
      console.log('✗ 没有孩子可选择');
      return { success: false, reason: 'no-profiles' };
    }
    
    console.log('步骤 4: 选择孩子并绑定...');
    const firstProfile = profileItems[0];
    const profileName = await firstProfile.evaluate(el => el.dataset.name || el.querySelector('div:last-child')?.textContent);
    console.log('  选择孩子:', profileName);
    await firstProfile.click();
    
    console.log('步骤 5: 等待绑定完成...');
    await new Promise(r => setTimeout(r, 5000));
    
    const mainDisplay = await page.$eval('#main-screen', el => getComputedStyle(el).display).catch(() => 'none');
    
    if (mainDisplay === 'block') {
      console.log('  ✓ 已进入主界面');
      
      await new Promise(r => setTimeout(r, 2000));
      
      const userInfo = await page.$('#user-info');
      if (userInfo) {
        const isVisible = await userInfo.evaluate(el => getComputedStyle(el).display !== 'none');
        if (isVisible) {
          const displayName = await page.$eval('#profile-name-display', el => el.textContent).catch(() => '');
          const displayEmail = await page.$eval('#account-email-display', el => el.textContent).catch(() => '');
          console.log('\n========== 绑定结果 ==========');
          console.log('孩子:', displayName || profileName);
          console.log('账户:', displayEmail || TEST_ACCOUNT.email);
          console.log('================================');
        }
      }
      console.log('\n✓ 完整绑定流程测试通过！');
      return { success: true, profileName };
    } else {
      console.log('✗ 未进入主界面，绑定可能失败');
      return { success: false, reason: 'not-main-screen' };
    }
  } catch (e) {
    console.log('✗ 绑定流程测试失败:', e.message);
    return { success: false, error: e.message };
  }
}

/**
 * 测试 6: 验证 Profile 数据完整性
 */
async function testProfileData(context) {
  console.log('\n========== 测试 6: 验证 Profile 数据完整性 ==========');
  
  const page = await context.newPage();
  const adminUrl = `chrome-extension://${EXTENSION_ID}/admin/admin.html`;
  
  try {
    await page.goto(adminUrl, { waitUntil: 'domcontentloaded', timeout: 10000 });
    await new Promise(r => setTimeout(r, 3000));
    
    // 确保已绑定并进入主界面
    const mainDisplay = await page.$eval('#main-screen', el => getComputedStyle(el).display).catch(() => 'none');
    if (mainDisplay !== 'block') {
      console.log('✗ 未进入主界面，无法验证 profile 数据');
      return { success: false };
    }
    
    // 获取绑定的 profile 信息
    const boundInfo = await page.evaluate(() => {
      return new Promise(resolve => {
        chrome.storage.local.get(
          ['cloud_profile_id', 'cloud_profile_name', 'account_token'],
          (storage) => {
            resolve({
              profileId: storage.cloud_profile_id,
              profileName: storage.cloud_profile_name,
              hasToken: !!storage.account_token
            });
          }
        );
      });
    });
    
    console.log('\n当前绑定的 Profile:');
    console.log('  - Profile ID:', boundInfo.profileId);
    console.log('  - Profile Name:', boundInfo.profileName);
    console.log('  - Account Token:', boundInfo.hasToken ? '已保存' : '未保存');
    
    // 通过 API 获取完整的 Profile 列表
    const apiUrl = 'https://guardian-api.william-xia-cn.workers.dev/profiles';
    const profilesJson = await page.evaluate(async (apiUrl) => {
      const storage = await new Promise(resolve => {
        chrome.storage.local.get('account_token', resolve);
      });
      
      const token = storage.account_token;
      if (!token) return { error: 'No token' };
      
      const resp = await fetch(apiUrl, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (!resp.ok) {
        return { error: `API error: ${resp.status}` };
      }
      
      return resp.json();
    }, apiUrl);
    
    console.log('\n========== API 原始返回数据 ==========');
    console.log(JSON.stringify(profilesJson, null, 2));
    console.log('========================================');
    
    console.log('\nAPI 返回的 Profile 列表:');
    if (profilesJson.error) {
      console.log('  错误:', profilesJson.error);
    } else if (profilesJson.profiles) {
      console.log('  总数:', profilesJson.profiles.length, '个');
      profilesJson.profiles.forEach((p, i) => {
        console.log(`\n=== Profile ${i + 1}: ${p.name} ===`);
        console.log(`  ID: ${p.id}`);
        console.log(`  头像颜色: ${p.avatar_color || '未设置'}`);
        console.log(`  创建时间: ${p.created_at ? new Date(p.created_at * 1000).toLocaleString() : '未知'}`);
        console.log(`  更新时间: ${p.updated_at ? new Date(p.updated_at * 1000).toLocaleString() : '未知'}`);
        
        // 检查配置数据
        if (p.config) {
          console.log('\n  配置数据: ✓ 有数据');
          const config = typeof p.config === 'string' ? JSON.parse(p.config) : p.config;
          
          // 关键配置项
          console.log(`    - version: ${config.version}`);
          console.log(`    - mode: ${config.mode}`);
          console.log(`    - enabled: ${config.enabled}`);
          console.log(`    - studyList: ${config.studyList?.length || 0} 个网站`);
          console.log(`    - allowList: ${config.allowList?.length || 0} 个网站`);
          console.log(`    - blacklist: ${config.blacklist?.length || 0} 个网站`);
          console.log(`    - dailyQuota: ${config.dailyQuota} 分钟`);
          console.log(`    - schedule.enabled: ${config.schedule?.enabled}`);
          
          console.log('\n  完整配置 (JSON):');
          console.log('  ' + JSON.stringify(config, null, 2).replace(/\n/g, '\n  '));
        } else {
          console.log('  配置数据: 无 (p.config = ' + p.config + ')');
        }
      });
    }
    
    // 额外测试：直接获取单个 profile 的配置
    console.log('\n=== 额外测试: 获取小明 profile 的详细配置 ===');
    const profileId = '4391fe22-cdf2-48ed-849e-832041b7a364';
    const configUrl = `https://guardian-api.william-xia-cn.workers.dev/profiles/${profileId}/config`;
    
    const configJson = await page.evaluate(async (configUrl) => {
      const storage = await new Promise(resolve => {
        chrome.storage.local.get('account_token', resolve);
      });
      
      const token = storage.account_token;
      if (!token) return { error: 'No token' };
      
      const resp = await fetch(configUrl, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      return resp.json();
    }, configUrl);
    
    console.log('配置 API 返回:');
    console.log(JSON.stringify(configJson, null, 2));
    
    // 修复小明 profile 的配置
    console.log('\n=== 修复小明 profile 的配置 ===');
    
    // 完整的默认配置
    const completeConfig = {
      version: '1.3',
      mode: 'whitelist',
      enabled: true,
      studyList: [
        'google.com', 'drive.google.com', 'docs.google.com', 'sheets.google.com', 'slides.google.com', 'meet.google.com', 'calendar.google.com', 'classroom.google.com', 'keep.google.com',
        'office.com', 'onenote.com', 'outlook.live.com',
        'openai.com', 'claude.ai', 'gemini.google.com', 'perplexity.ai',
        'khanacademy.org', 'coursera.org', 'edx.org', 'brilliant.org', 'udemy.com',
        'github.com', 'stackoverflow.com', 'leetcode.com', 'replit.com', 'codepen.io',
        'notion.so', 'obsidian.md', 'ankiweb.net',
        'canva.com', 'figma.com',
        'arxiv.org', 'scholar.google.com'
      ],
      allowList: [
        'google.com', 'google.com.hk', 'bing.com', 'search.brave.com', 'duckduckgo.com',
        'youtube.com', 'music.youtube.com', 'spotify.com', 'music.163.com',
        'wikipedia.org', 'ritannica.com'
      ],
      blacklist: ['douyin.com', 'tiktok.com'],
      dailyQuota: 0,
      domainQuotas: {},
      schedule: {
        enabled: false,
        days: {
          0: { enabled: true, start: '08:00', end: '21:00' },
          1: { enabled: true, start: '15:00', end: '21:00' },
          2: { enabled: true, start: '15:00', end: '21:00' },
          3: { enabled: true, start: '15:00', end: '21:00' },
          4: { enabled: true, start: '15:00', end: '21:00' },
          5: { enabled: true, start: '15:00', end: '21:00' },
          6: { enabled: true, start: '08:00', end: '21:00' }
        }
      },
      restConfig: {
        reminderInterval: 15,
        maxRestDuration: 60
      },
      autoStudyConfig: {
        enabled: true,
        requiredSeconds: 60
      },
      tempWhitelistConfig: {
        duration: 1
      },
      tempWhitelist: {
        domains: {}
      }
    };
    
    // 更新小明 profile 的配置（API 期望格式：{ data: {...} }）
    const updateResult = await page.evaluate(async ({ profileId, config }) => {
      const storage = await new Promise(resolve => {
        chrome.storage.local.get('account_token', resolve);
      });
      
      const token = storage.account_token;
      if (!token) return { error: 'No token' };
      
      const resp = await fetch(`https://guardian-api.william-xia-cn.workers.dev/profiles/${profileId}/config`, {
        method: 'PUT',
        headers: { 
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ data: config })  // API 期望 { data: {...} }
      });
      
      return resp.json();
    }, { profileId, config: completeConfig });
    
    console.log('更新结果:', JSON.stringify(updateResult, null, 2));
    
    // 重新获取验证
    console.log('\n=== 重新获取小明配置验证 ===');
    const newConfigJson = await page.evaluate(async ({ profileId }) => {
      const storage = await new Promise(resolve => {
        chrome.storage.local.get('account_token', resolve);
      });
      
      const token = storage.account_token;
      const resp = await fetch(`https://guardian-api.william-xia-cn.workers.dev/profiles/${profileId}/config`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      return resp.json();
    }, { profileId });
    
    console.log('更新后配置:');
    console.log('  - version:', newConfigJson.data?.version);
    console.log('  - studyList:', newConfigJson.data?.studyList?.length, '个网站');
    console.log('  - allowList:', newConfigJson.data?.allowList?.length, '个网站');
    console.log('  - blacklist:', newConfigJson.data?.blacklist?.length, '个网站');
    console.log('  - mode:', newConfigJson.data?.mode);
    console.log('  - enabled:', newConfigJson.data?.enabled);
    
    // 验证数据完整性
    if (boundInfo.profileId && boundInfo.profileName && profilesJson.profiles && profilesJson.profiles.length > 0) {
      console.log('\n✓ Profile 数据完整');
      
      // 检查所有 profile 是否都获取到了
      if (profilesJson.profiles.length >= 2) {
        console.log(`✓ 共获取到 ${profilesJson.profiles.length} 个孩子的 profile`);
      }
      
      return { success: true, bound: boundInfo, profiles: profilesJson.profiles };
    } else {
      console.log('\n✗ Profile 数据不完整');
      return { success: false };
    }
  } catch (e) {
    console.log('✗ 验证失败:', e.message);
    return { success: false, error: e.message };
  }
}

/**
 * 主测试函数
 */
async function runTests() {
  console.log('========================================');
  console.log('TimeOnChrome 自动化测试');
  console.log('========================================');
  console.log('扩展路径:', EXTENSION_PATH);
  console.log('扩展 ID:', EXTENSION_ID);
  console.log('用户数据:', USER_DATA_DIR);
  
  let browser;
  
  try {
    console.log('\n启动浏览器...');
    browser = await chromium.launchPersistentContext(USER_DATA_DIR, {
      headless: false,
      args: [
        `--disable-extensions-except=${EXTENSION_PATH}`,
        `--load-extension=${EXTENSION_PATH}`,
        '--no-sandbox',
        '--disable-setuid-sandbox'
      ],
      defaultViewport: null
    });
    console.log('✓ 浏览器启动成功');
    
    await new Promise(r => setTimeout(r, 3000));
    
    // 测试 1: 验证插件加载
    const loaded = await testExtensionLoaded(browser);
    if (!loaded) {
      console.log('\n✗ 插件未正确加载，停止测试');
      return;
    }
    
    // 测试 2: 验证管理页面
    await testAdminPage(browser);
    
    // 测试 3: 绑定状态检查
    const bindStatus = await testBindStatus(browser);
    
    // 根据状态决定下一步
    if (bindStatus.bound) {
      // 已绑定 - 验证绑定后的状态
      await testProfileData(browser);
    } else {
      // 未绑定 - 执行完整绑定流程
      const bindResult = await testCompleteBindFlow(browser);
      
      if (bindResult.success) {
        // 绑定成功后验证 profile 数据
        await testProfileData(browser);
      }
    }
    
    // 测试 6: 验证 Profile 数据完整性
    // await testProfileData(browser);
    
    console.log('\n========================================');
    console.log('测试完成！');
    console.log('========================================');
  } catch (e) {
    console.error('测试失败:', e);
  } finally {
    if (browser) {
      console.log('\n关闭浏览器...');
      await browser.close();
      console.log('✓ 浏览器已关闭');
    }
  }
}

runTests();