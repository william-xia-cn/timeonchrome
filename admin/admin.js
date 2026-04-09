// admin/admin.js - 云端同步版 v2.0
// 完整流程：
// 1. 未绑定 → 登录家长账户 → 选择孩子 → 自动绑定 → 进入主界面
// 2. 已绑定 → 自动登录 → 直接进入主界面
// 3. 绑定后不能退出

const API_BASE = 'https://guardian-api.william-xia-cn.workers.dev';
const DAY_NAMES = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

const CLOUD_KEYS = {
  DEVICE_TOKEN: 'cloud_device_token',
  PROFILE_ID: 'cloud_profile_id',
  CREDENTIALS: 'cloud_credentials',
  ACCOUNT_TOKEN: 'account_token',
  REMEMBER_ME: 'cloud_remember_me',
  IS_BOUND: 'cloud_is_bound'  // 标记是否已绑定
};

let config = null;
let isAuthenticated = false;
let accountToken = null;
let cloudProfiles = [];
let currentProfileId = null;
let currentEmail = null;

// ── 初始化 ─────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', async () => {
  // 加载本地配置
  config = await sendMsg({ type: 'GET_CONFIG' });
  
  // 检查绑定状态
  await checkAndHandleBinding();
  
  setupLoginForm();
  setupNavigation();
  setupRulesPage();
  setupQuotaPage();
  setupSchedulePage();
  setupDevicesPage();
  setupSecurityPage();
});

// ── 绑定状态检查与处理 ───────────────────────────────────────────────────

/**
 * 检查绑定状态并处理
 * 核心逻辑：
 * - 未绑定：显示绑定流程（登录→选择孩子→绑定）
 * - 已绑定：自动登录→进入主界面
 */
async function checkAndHandleBinding() {
  const storage = await new Promise(resolve => {
    chrome.storage.local.get([
      CLOUD_KEYS.DEVICE_TOKEN,
      CLOUD_KEYS.CREDENTIALS,
      CLOUD_KEYS.ACCOUNT_TOKEN,
      CLOUD_KEYS.PROFILE_ID
    ], resolve);
  });
  
  const deviceToken = storage[CLOUD_KEYS.DEVICE_TOKEN];
  const credentials = storage[CLOUD_KEYS.CREDENTIALS];
  const savedToken = storage[CLOUD_KEYS.ACCOUNT_TOKEN];
  const profileId = storage[CLOUD_KEYS.PROFILE_ID];
  
  if (deviceToken && credentials && savedToken) {
    // 已绑定 → 自动登录
    console.log('[Admin] Device is bound, auto logging in...');
    await autoLogin(credentials);
  } else {
    // 未绑定 → 显示绑定页面
    console.log('[Admin] Device not bound, showing bind screen');
    showBindScreen();
  }
}

/**
 * 显示绑定页面（未绑定状态）
 */
function showBindScreen() {
  // 隐藏主界面，显示绑定/登录界面
  document.getElementById('main-screen').style.display = 'none';
  document.getElementById('login-screen').style.display = 'flex';
  
  // 隐藏登出按钮（绑定后不能退出）
  const logoutBtn = document.getElementById('logout-btn');
  if (logoutBtn) logoutBtn.style.display = 'none';
  
  // 隐藏注册链接（首次需要绑定，不能注册新账户）
  const registerLink = document.getElementById('register-link');
  if (registerLink) registerLink.style.display = 'none';
}

/**
 * 自动登录（已绑定状态）
 */
async function autoLogin(encryptedCredentials) {
  try {
    const decoded = atob(encryptedCredentials);
    const [email, password] = decoded.split(':');
    currentEmail = email;
    
    // 验证登录
    const resp = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    
    if (!resp.ok) {
      // 登录失败，可能是凭据过期，跳转到绑定页面
      console.log('[Admin] Auto login failed, showing bind screen');
      showBindScreen();
      return;
    }
    
    const result = await resp.json();
    accountToken = result.token;
    
    // 登录成功，进入主界面
    await enterMainScreen();
    
  } catch (e) {
    console.error('[Admin] Auto login error:', e);
    showBindScreen();
  }
}

/**
 * 进入主界面
 */
async function enterMainScreen() {
  isAuthenticated = true;
  
  // 隐藏登录界面，显示主界面
  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('main-screen').style.display = 'block';
  
  // 隐藏登出按钮（绑定后不能退出）
  const logoutBtn = document.getElementById('logout-btn');
  if (logoutBtn) logoutBtn.style.display = 'none';
  
  // 加载 Profile 列表
  await loadProfiles();
  
  // 渲染总览
  config = await sendMsg({ type: 'GET_CONFIG' });
  renderOverview();
}

/**
 * 加载 Profile 列表
 */
async function loadProfiles() {
  try {
    const storage = await new Promise(resolve => {
      chrome.storage.local.get(CLOUD_KEYS.ACCOUNT_TOKEN, resolve);
    });
    const token = storage[CLOUD_KEYS.ACCOUNT_TOKEN];
    
    if (!token) return;
    
    const resp = await fetch(`${API_BASE}/profiles`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    
    if (resp.ok) {
      const data = await resp.json();
      cloudProfiles = data.profiles || [];
      renderProfilesList();
    }
  } catch (e) {
    console.error('Failed to load profiles:', e);
    cloudProfiles = [];
  }
}

/**
 * 渲染 Profile 列表
 */
function renderProfilesList() {
  const container = document.getElementById('profiles-list');
  if (!container) return;
  
  // 获取当前绑定的 profile_id
  chrome.storage.local.get(CLOUD_KEYS.PROFILE_ID, (storage) => {
    const boundProfileId = storage[CLOUD_KEYS.PROFILE_ID];
    const boundProfile = cloudProfiles.find(p => p.id === boundProfileId);
    
    if (cloudProfiles.length === 0) {
      container.innerHTML = `
        <div style="text-align:center; padding:20px; color:var(--muted);">
          <p>暂无孩子 Profile</p>
          <p style="font-size:12px; margin-top:8px;">请在「设备管理」页面添加孩子</p>
        </div>
      `;
      return;
    }
    
    // 显示已绑定的孩子信息
    if (boundProfile) {
      container.innerHTML = `
        <div style="padding:16px; background:var(--surface); border-radius:12px; border:1px solid var(--accent);">
          <div style="display:flex; align-items:center; gap:12px;">
            <div class="avatar" style="width:40px; height:40px; border-radius:50%; background:${boundProfile.avatar_color || '#7c6fff'}; display:flex; align-items:center; justify-content:center; color:#fff; font-weight:600;">
              ${boundProfile.name.charAt(0).toUpperCase()}
            </div>
            <div>
              <div style="font-size:15px; font-weight:600;">${boundProfile.name}</div>
              <div style="font-size:12px; color:var(--green);">✓ 已绑定此设备</div>
            </div>
          </div>
          <div style="margin-top:12px; font-size:12px; color:var(--muted);">
            绑定后无法更换或解绑
          </div>
        </div>
      `;
    }
  });
}

// ── 登录表单（绑定流程）──────────────────────────────────────────────────

/**
 * 登录并绑定
 * 流程：输入家长账户 → 登录 → 获取孩子列表 → 选择孩子 → 绑定设备
 */
function setupLoginForm() {
  const loginBtn = document.getElementById('login-btn');
  if (!loginBtn) return;
  
  loginBtn.addEventListener('click', async () => {
    const email = document.getElementById('email-input')?.value.trim();
    const password = document.getElementById('pw-input')?.value;
    
    if (!email || !password) {
      showError('请输入邮箱和密码');
      return;
    }
    
    loginBtn.disabled = true;
    loginBtn.textContent = '登录中...';
    
    try {
      // 1. 登录家长账户
      const resp = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      
      if (!resp.ok) {
        const err = await resp.json();
        throw new Error(err.error || '登录失败');
      }
      
      const result = await resp.json();
      accountToken = result.token;
      currentEmail = email;
      
      // 保存凭据
      const encrypted = btoa(`${email}:${password}`);
      await new Promise(resolve => {
        chrome.storage.local.set({
          [CLOUD_KEYS.CREDENTIALS]: encrypted,
          [CLOUD_KEYS.ACCOUNT_TOKEN]: result.token,
          [CLOUD_KEYS.REMEMBER_ME]: true
        }, resolve);
      });
      
      // 2. 获取孩子列表
      const profilesResp = await fetch(`${API_BASE}/profiles`, {
        headers: { 'Authorization': `Bearer ${accountToken}` }
      });
      
      if (!profilesResp.ok) {
        throw new Error('获取孩子列表失败');
      }
      
      const profilesData = await profilesResp.json();
      cloudProfiles = profilesData.profiles || [];
      
      if (cloudProfiles.length === 0) {
        throw new Error('请先在家长后台创建孩子 Profile');
      }
      
      // 3. 显示孩子列表让用户选择
      await showProfileSelector();
      
    } catch (e) {
      showError(e.message);
      loginBtn.disabled = false;
      loginBtn.textContent = '登录';
    }
  });
  
  // 回车键登录
  const pwInput = document.getElementById('pw-input');
  if (pwInput) {
    pwInput.addEventListener('keydown', e => {
      if (e.key === 'Enter') loginBtn.click();
    });
  }
}

/**
 * 显示孩子选择器
 */
async function showProfileSelector() {
  const loginScreen = document.getElementById('login-screen');
  const errorMsg = document.getElementById('error-msg');
  
  // 隐藏错误信息
  if (errorMsg) errorMsg.style.display = 'none';
  
  // 替换登录表单为孩子选择器
  loginScreen.innerHTML = `
    <div class="login-box">
      <div class="login-logo">🛡</div>
      <h1>TimeOnChrome</h1>
      <p>选择要绑定的孩子</p>
      
      <div id="profile-selector" style="margin: 20px 0;">
        ${cloudProfiles.map(p => `
          <div class="profile-item" onclick="bindToProfile('${p.id}', '${p.name}', '${p.avatar_color || '#7c6fff'}')" 
               style="display:flex; align-items:center; gap:12px; padding:16px; border:1px solid var(--border); border-radius:12px; margin-bottom:12px; cursor:pointer; transition:all 0.2s;">
            <div class="avatar" style="width:40px; height:40px; border-radius:50%; background:${p.avatar_color || '#7c6fff'}; display:flex; align-items:center; justify-content:center; color:#fff; font-weight:600;">
              ${p.name.charAt(0).toUpperCase()}
            </div>
            <div style="font-size:15px; font-weight:600;">${p.name}</div>
          </div>
        `).join('')}
      </div>
      
      <p style="font-size:12px; color:var(--muted);">选择后将自动绑定此设备，绑定后无法更换</p>
    </div>
  `;
}

/**
 * 绑定到选定的 Profile
 */
async function bindToProfile(profileId, profileName, avatarColor) {
  try {
    // 1. 调用设备绑定 API
    const resp = await fetch(`${API_BASE}/device/bind`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accountToken}`
      },
      body: JSON.stringify({ 
        profile_id: profileId, 
        device_name: 'Chrome Extension' 
      })
    });
    
    if (!resp.ok) {
      const err = await resp.json();
      throw new Error(err.error || '绑定失败');
    }
    
    const bindResult = await resp.json();
    
    // 2. 保存绑定信息
    await new Promise(resolve => {
      chrome.storage.local.set({
        [CLOUD_KEYS.DEVICE_TOKEN]: bindResult.device_token,
        [CLOUD_KEYS.PROFILE_ID]: profileId,
        [CLOUD_KEYS.IS_BOUND]: true
      }, resolve);
    });
    
    // 3. 通知 background.js 同步
    await sendMsg({ 
      type: 'CLOUD_BIND', 
      profile_id: profileId, 
      device_name: 'Chrome Extension' 
    });
    
    // 4. 进入主界面
    currentProfileId = profileId;
    await enterMainScreen();
    
  } catch (e) {
    showError('绑定失败: ' + e.message);
  }
}

// ── 错误提示 ───────────────────────────────────────────────────────────

function showError(msg) {
  // 创建错误元素
  let errorEl = document.getElementById('error-msg');
  if (!errorEl) {
    errorEl = document.createElement('div');
    errorEl.id = 'error-msg';
    errorEl.className = 'error-msg';
    const loginBox = document.querySelector('.login-box');
    if (loginBox) loginBox.appendChild(errorEl);
  }
  
  errorEl.textContent = msg;
  errorEl.style.display = 'block';
  setTimeout(() => errorEl.style.display = 'none', 4000);
}

function showToast(msg) {
  const toast = document.getElementById('success-toast');
  if (!toast) return;
  toast.textContent = msg;
  toast.style.display = 'block';
  setTimeout(() => toast.style.display = 'none', 2000);
}

// ── 发送消息到 background ─────────────────────────────────────────────────

function sendMsg(msg) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(msg, (resp) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else if (resp && resp.error) {
        reject(new Error(resp.error));
      } else {
        resolve(resp);
      }
    });
  });
}

// ── 路由处理 ─────────────────────────────────────────────────────────────

function setupNavigation() {
  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', () => {
      const page = item.dataset.page;
      if (!page) return;
      
      document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
      item.classList.add('active');
      
      document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
      document.getElementById(`page-${page}`)?.classList.add('active');
      
      if (page === 'devices') {
        loadProfiles();
        renderSyncStatus();
      }
    });
  });
}

// ── 其他页面设置 ─────────────────────────────────────────────────────────

function setupRulesPage() {}
function setupQuotaPage() {}
function setupSchedulePage() {}

function setupDevicesPage() {
  // 设备管理页面
  const accountInfo = document.getElementById('account-info');
  if (accountInfo && currentEmail) {
    accountInfo.innerHTML = `<span style="color:var(--accent);">${currentEmail}</span>`;
  }
}

function setupSecurityPage() {
  // 安全设置 - 移除密码修改（因为是云端账户）
  const changePwBtn = document.getElementById('change-pw-btn');
  if (changePwBtn) {
    changePwBtn.textContent = '密码管理（请在云端操作）';
    changePwBtn.disabled = true;
    changePwBtn.style.opacity = '0.5';
  }
}

// ── 渲染总览 ─────────────────────────────────────────────────────────────

async function renderOverview() {
  const toggleEnabled = document.getElementById('toggle-enabled');
  if (toggleEnabled) {
    toggleEnabled.checked = config.enabled;
    toggleEnabled.addEventListener('change', async (e) => {
      config.enabled = e.target.checked;
      await sendMsg({ type: 'UPDATE_CONFIG', config });
    });
  }
  
  await renderSyncStatus();
}

async function renderSyncStatus() {
  const storage = await new Promise(resolve => {
    chrome.storage.local.get([
      CLOUD_KEYS.DEVICE_TOKEN,
      CLOUD_KEYS.PROFILE_ID,
      'cloud_last_sync',
      'cloud_config_version'
    ], resolve);
  });
  
  const container = document.getElementById('sync-status');
  if (!container) return;
  
  container.innerHTML = `
    <div style="display:grid; grid-template-columns:1fr 1fr; gap:16px;">
      <div style="padding:12px; background:var(--surface); border-radius:8px;">
        <div style="font-size:12px; color:var(--muted);">设备绑定</div>
        <div style="font-size:16px; font-weight:600; color:var(--green);">已绑定</div>
      </div>
      <div style="padding:12px; background:var(--surface); border-radius:8px;">
        <div style="font-size:12px; color:var(--muted);">配置版本</div>
        <div style="font-size:16px; font-weight:600;">${storage['cloud_config_version'] || '-'}</div>
      </div>
      <div style="padding:12px; background:var(--surface); border-radius:8px;">
        <div style="font-size:12px; color:var(--muted);">最后同步</div>
        <div style="font-size:16px; font-weight:600;">
          ${storage['cloud_last_sync'] ? new Date(storage['cloud_last_sync']).toLocaleString() : '从未同步'}
        </div>
      </div>
      <div style="padding:12px; background:var(--surface); border-radius:8px;">
        <button class="btn-save" onclick="forceSync()">立即同步</button>
      </div>
    </div>
  `;
}

async function forceSync() {
  try {
    await sendMsg({ type: 'CLOUD_FORCE_SYNC' });
    showToast('同步完成');
    await renderSyncStatus();
  } catch (e) {
    showError('同步失败: ' + e.message);
  }
}

// 全局函数（供 HTML onclick 调用）
window.bindToProfile = bindToProfile;
window.forceSync = forceSync;