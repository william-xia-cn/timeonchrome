#!/usr/bin/env node
// scripts/setup-bound-profile.js — 为 Sleep/Wake Gate 创建可复用的绑定测试环境
//
// 安全规则：
// - 必须带 --allow-cloud-mutation 才执行云端写操作
// - 不 hardcode 任何凭证；从环境变量或 CLI 参数读取
// - 不提交 token 文件；所有状态写入 Chrome userDataDir storage

const path = require('path');
const fs = require('fs');
const { chromium } = require('@playwright/test');

const EXTENSION_PATH = path.resolve(__dirname, '..', '..', '..', '..', 'extension');

const DEFAULT_API_BASE = 'https://guardian-api.william-xia-cn.workers.dev';
const DEFAULT_PROFILE_NAME = 'Gate Test Child';
const DEFAULT_DEVICE_NAME = 'Gate Runner Windows Chrome';
const DEFAULT_USER_DATA_DIR = path.resolve(__dirname, '../../../../.artifacts/sleep-wake-gate/bound-profile');

// ── CLI 参数解析 ─────────────────────────────────────────────────────────────
function parseArgs(argv) {
  const args = {
    apiBase: process.env.TIMEONCHROME_API_BASE || DEFAULT_API_BASE,
    email: process.env.TIMEONCHROME_TEST_EMAIL || '',
    password: process.env.TIMEONCHROME_TEST_PASSWORD || '',
    profileName: DEFAULT_PROFILE_NAME,
    deviceName: DEFAULT_DEVICE_NAME,
    userDataDir: DEFAULT_USER_DATA_DIR,
    allowCloudMutation: false,
    verbose: false,
  };

  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--api-base' || arg.startsWith('--api-base=')) {
      args.apiBase = arg.includes('=') ? arg.split('=')[1] : argv[++i];
    } else if (arg === '--email' || arg.startsWith('--email=')) {
      args.email = arg.includes('=') ? arg.split('=')[1] : argv[++i];
    } else if (arg === '--password' || arg.startsWith('--password=')) {
      args.password = arg.includes('=') ? arg.split('=')[1] : argv[++i];
    } else if (arg === '--profile-name' || arg.startsWith('--profile-name=')) {
      args.profileName = arg.includes('=') ? arg.split('=')[1] : argv[++i];
    } else if (arg === '--device-name' || arg.startsWith('--device-name=')) {
      args.deviceName = arg.includes('=') ? arg.split('=')[1] : argv[++i];
    } else if (arg === '--user-data-dir' || arg.startsWith('--user-data-dir=')) {
      args.userDataDir = arg.includes('=') ? arg.split('=')[1] : argv[++i];
    } else if (arg === '--allow-cloud-mutation') {
      args.allowCloudMutation = true;
    } else if (arg === '--verbose') {
      args.verbose = true;
    } else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    }
  }

  return args;
}

function printHelp() {
  console.log(`
用法: node setup-bound-profile.js [选项]

安全规则：必须带 --allow-cloud-mutation 才允许执行云端写操作。

选项:
  --api-base=<url>          Workers API 地址 (默认: $TIMEONCHROME_API_BASE 或 ${DEFAULT_API_BASE})
  --email=<email>           测试账号邮箱 (默认: $TIMEONCHROME_TEST_EMAIL)
  --password=<password>     测试账号密码 (默认: $TIMEONCHROME_TEST_PASSWORD)
  --profile-name=<name>     孩子 profile 名称 (默认: "${DEFAULT_PROFILE_NAME}")
  --device-name=<name>      设备名称 (默认: "${DEFAULT_DEVICE_NAME}")
  --user-data-dir=<path>    Chrome 用户数据目录 (默认: ${DEFAULT_USER_DATA_DIR})
  --allow-cloud-mutation    【必须】允许云端注册/登录/创建 profile/绑定设备
  --verbose                 打印详细日志

示例:
  node setup-bound-profile.js --allow-cloud-mutation --verbose
  node setup-bound-profile.js --email=a@b.com --password=secret --allow-cloud-mutation --verbose
`);
}

const log = (...args) => console.log('[setup]', ...args);
const verbose = (...args) => { if (globalThis._verbose) console.log('[setup]', ...args); };

// ── HTTP 工具 ────────────────────────────────────────────────────────────────
async function apiPost(base, path, body, token) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const resp = await fetch(`${base}${path}`, {
    method: 'POST',
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await resp.text();
  const data = text ? JSON.parse(text) : null;
  return { status: resp.status, data };
}

async function apiGet(base, path, token) {
  const headers = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const resp = await fetch(`${base}${path}`, { method: 'GET', headers });
  const text = await resp.text();
  const data = text ? JSON.parse(text) : null;
  return { status: resp.status, data };
}

async function apiDelete(base, path, token) {
  const headers = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const resp = await fetch(`${base}${path}`, { method: 'DELETE', headers });
  const text = await resp.text();
  const data = text ? JSON.parse(text) : null;
  return { status: resp.status, data };
}

// ── Chrome 启动器（内联，避免循环依赖 lib/browser.js） ─────────────────────────
async function launchChrome(userDataDir) {
  if (!fs.existsSync(userDataDir)) {
    fs.mkdirSync(userDataDir, { recursive: true });
  }

  const browserCtx = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    args: [
      `--disable-extensions-except=${EXTENSION_PATH}`,
      `--load-extension=${EXTENSION_PATH}`,
      '--no-sandbox',
    ],
  });

  let sw = browserCtx.serviceWorkers()[0];
  if (!sw) {
    try {
      sw = await browserCtx.waitForEvent('serviceworker', { timeout: 30000 });
    } catch {
      const start = Date.now();
      while (Date.now() - start < 30000) {
        const workers = browserCtx.serviceWorkers();
        if (workers.length > 0) { sw = workers[0]; break; }
        await new Promise(r => setTimeout(r, 500));
      }
    }
  }

  if (!sw) throw new Error('Service Worker 未在 30 秒内启动');
  return { browserCtx, sw };
}

async function closeChrome(browserCtx) {
  await browserCtx.close();
}

// ── 主流程 ───────────────────────────────────────────────────────────────────
async function main() {
  const args = parseArgs(process.argv);
  globalThis._verbose = args.verbose;

  log('========================================');
  log('Sleep/Wake Gate — 绑定环境 Setup');
  log('========================================');

  if (!args.allowCloudMutation) {
    console.error('[setup] 错误: 必须带 --allow-cloud-mutation 才允许执行云端写操作。');
    console.error('[setup] 这是为了防止意外修改生产云端数据。');
    process.exit(1);
  }

  if (!args.email || !args.password) {
    console.error('[setup] 错误: 必须提供 email 和 password。');
    console.error('[setup] 可通过 --email / --password 参数或环境变量 TIMEONCHROME_TEST_EMAIL / TIMEONCHROME_TEST_PASSWORD 提供。');
    process.exit(1);
  }

  log(`API Base: ${args.apiBase}`);
  log(`Email: ${args.email}`);
  log(`Profile: ${args.profileName}`);
  log(`Device: ${args.deviceName}`);
  log(`userDataDir: ${args.userDataDir}`);
  log('');

  // ── Step 1: 注册/登录 ─────────────────────────────────────────────────────
  log('Step 1: 注册/登录测试账号...');
  let accountToken = null;

  const registerRes = await apiPost(args.apiBase, '/auth/register', {
    email: args.email,
    password: args.password,
  });
  verbose('注册结果:', registerRes.status, JSON.stringify(registerRes.data));

  if (registerRes.status === 200) {
    accountToken = registerRes.data.token;
    log('  → 新账号注册成功');
  } else if (registerRes.status === 400) {
    log('  → 账号已存在，尝试登录...');
    const loginRes = await apiPost(args.apiBase, '/auth/login', {
      email: args.email,
      password: args.password,
    });
    if (loginRes.status !== 200) {
      throw new Error(`登录失败: ${loginRes.status} ${JSON.stringify(loginRes.data)}`);
    }
    accountToken = loginRes.data.token;
    log('  → 登录成功');
  } else {
    throw new Error(`注册意外响应: ${registerRes.status} ${JSON.stringify(registerRes.data)}`);
  }

  // ── Step 2: 获取/创建 Profile ─────────────────────────────────────────────
  log('Step 2: 获取/创建 Profile...');
  const profilesRes = await apiGet(args.apiBase, '/profiles', accountToken);
  verbose('Profile 列表:', JSON.stringify(profilesRes.data));

  let profile = (profilesRes.data?.profiles || []).find(p => p.name === args.profileName);
  let profileId = profile?.id;

  if (profileId) {
    log(`  → 复用已有 profile: ${profileId}`);
  } else {
    const createRes = await apiPost(args.apiBase, '/profiles', { name: args.profileName }, accountToken);
    if (createRes.status !== 200) {
      throw new Error(`创建 profile 失败: ${createRes.status} ${JSON.stringify(createRes.data)}`);
    }
    profileId = createRes.data.profile.id;
    log(`  → 新建 profile: ${profileId}`);
  }

  // ── Step 3: 清理同名旧设备 ────────────────────────────────────────────────
  log('Step 3: 清理同名旧设备...');
  const devicesRes = await apiGet(args.apiBase, `/profiles/${profileId}/devices`, accountToken);
  verbose('设备列表:', JSON.stringify(devicesRes.data));

  const oldDevice = (devicesRes.data?.devices || []).find(d => d.device_name === args.deviceName);
  if (oldDevice) {
    log(`  → 删除旧设备: ${oldDevice.id}`);
    const delRes = await apiDelete(args.apiBase, `/profiles/${profileId}/devices/${oldDevice.id}`, accountToken);
    if (delRes.status !== 200) {
      log(`  ⚠ 删除旧设备失败: ${delRes.status}，继续...`);
    }
  } else {
    log('  → 无同名旧设备');
  }

  // ── Step 4: 绑定设备 ──────────────────────────────────────────────────────
  log('Step 4: 绑定设备...');
  const bindRes = await apiPost(args.apiBase, '/device/bind', {
    profile_id: profileId,
    device_name: args.deviceName,
  }, accountToken);
  if (bindRes.status !== 200) {
    throw new Error(`绑定失败: ${bindRes.status} ${JSON.stringify(bindRes.data)}`);
  }
  const deviceToken = bindRes.data.device_token;
  log(`  → 绑定成功，device_token: ${deviceToken.slice(0, 16)}...`);

  // ── Step 5: 拉取云端配置 ──────────────────────────────────────────────────
  log('Step 5: 拉取云端配置...');
  const configRes = await apiGet(args.apiBase, '/device/config', deviceToken);
  if (configRes.status !== 200) {
    throw new Error(`获取配置失败: ${configRes.status} ${JSON.stringify(configRes.data)}`);
  }
  const cloudConfig = configRes.data?.data || {};
  log(`  → config version: ${configRes.data?.version}`);
  verbose('云端配置 keys:', Object.keys(cloudConfig).join(', '));

  // ── Step 6: 启动 Chrome 并写入本地存储 ────────────────────────────────────
  log('Step 6: 启动 Chrome 并写入扩展存储...');
  const { browserCtx, sw } = await launchChrome(args.userDataDir);

  await sw.evaluate(async ({ token, pid, cfg }) => {
    return new Promise(resolve => {
      chrome.storage.local.set({
        cloud_device_token: token,
        cloud_profile_id: pid,
        guardian_config: {
          ...cfg,
          mode: 'rest',
          monitoring_enabled: true,
          isInitialized: true,
        },
        guardian_session: {
          currentMode: 'rest',
          studySeconds: 0,
          restSeconds: 0,
          undeterminedSeconds: 0,
          lastActiveDate: new Date().toISOString().slice(0, 10),
        },
      }, () => resolve());
    });
  }, { token: deviceToken, pid: profileId, cfg: cloudConfig });

  log('  → 扩展存储写入完成');

  // 强制 flush storage（通过读取触发持久化），并等待磁盘写入
  log('  → 等待 storage flush...');
  await sw.evaluate(async () => {
    return new Promise(resolve => {
      chrome.storage.local.get(null, () => {
        setTimeout(resolve, 2000);
      });
    });
  });
  await new Promise(r => setTimeout(r, 3000));

  // ── Step 7: 关闭 Chrome（保留 userDataDir） ────────────────────────────────
  log('Step 7: 关闭 Chrome（保留 userDataDir）...');
  await closeChrome(browserCtx);

  // ── Step 8: 重新启动验证 ──────────────────────────────────────────────────
  log('Step 8: 重新启动验证绑定状态...');
  const { browserCtx: ctx2, sw: sw2 } = await launchChrome(args.userDataDir);

  const bindingStatus = await sw2.evaluate(async () => {
    return new Promise(resolve => {
      chrome.storage.local.get(
        ['cloud_device_token', 'cloud_profile_id', 'guardian_config', 'guardian_session'],
        result => {
          const config = result['guardian_config'] || null;
          const deviceToken = result['cloud_device_token'] || '';
          const profileId = result['cloud_profile_id'] || '';
          resolve({
            bound: typeof deviceToken === 'string' && deviceToken.length > 0 &&
                   typeof profileId === 'string' && profileId.length > 0,
            deviceTokenPresent: !!deviceToken,
            profileIdPresent: !!profileId,
            configAvailable: config !== null && typeof config === 'object',
            monitoringEnabled: config ? !!config.monitoring_enabled : false,
            mode: result['guardian_session']?.currentMode || config?.mode || null,
          });
        }
      );
    });
  });

  log('  → 验证结果:', JSON.stringify(bindingStatus));
  await closeChrome(ctx2);

  // ── 最终校验 ──────────────────────────────────────────────────────────────
  log('');
  log('========================================');
  if (bindingStatus.bound && bindingStatus.configAvailable) {
    log('✅ 绑定环境 Setup 完成');
    log(`   userDataDir: ${args.userDataDir}`);
    log(`   profileId:   ${profileId}`);
    log(`   deviceToken: ${deviceToken.slice(0, 16)}...`);
    log('');
    log('后续运行 Gate 测试:');
    log(`  node tests/system/sleep-wake-gate/runner.js --scenario=dry-run --user-data-dir="${args.userDataDir}" --verbose`);
    log(`  node tests/system/sleep-wake-gate/runner.js --scenario=chrome-restart --user-data-dir="${args.userDataDir}" --verbose`);
    process.exit(0);
  } else {
    console.error('[setup] ❌ 验证失败: 绑定状态不完整');
    process.exit(1);
  }
}

main().catch(err => {
  console.error('[setup] 致命错误:', err.message);
  console.error(err.stack);
  process.exit(1);
});
