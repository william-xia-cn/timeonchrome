// admin/admin.js - 云端同步版

const API_BASE = 'https://guardian-api.william-xia-cn.workers.dev';
const DAY_NAMES = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

const CLOUD_KEYS = {
  DEVICE_TOKEN: 'cloud_device_token',
  PROFILE_ID: 'cloud_profile_id',
  CREDENTIALS: 'cloud_credentials',
  ACCOUNT_TOKEN: 'account_token',
  REMEMBER_ME: 'cloud_remember_me'
};

let config = null;
let isAuthenticated = false;
let accountToken = null;
let cloudProfiles = [];
let currentProfileId = null;

// ── 初始化 ─────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', async () => {
  // 先加载本地配置
  config = await sendMsg({ type: 'GET_CONFIG' });
  
  // 检查云端登录状态
  await checkCloudLogin();
  
  setupLoginForm();
  setupNavigation();
  setupRulesPage();
  setupQuotaPage();
  setupSchedulePage();
  setupDevicesPage();
  setupSecurityPage();
  
  document.getElementById('logout-btn').addEventListener('click', logout);
});

// ── 云端登录相关 ───────────────────────────────────────────────────────────

/**
 * 检查云端登录状态
 */
async function checkCloudLogin() {
  const storage = await new Promise(resolve => {
    chrome.storage.local.get([
      CLOUD_KEYS.ACCOUNT_TOKEN,
      CLOUD_KEYS.CREDENTIALS,
      CLOUD_KEYS.DEVICE_TOKEN
    ], resolve);
  });
  
  const credentials = storage[CLOUD_KEYS.CREDENTIALS];
  const accountToken = storage[CLOUD_KEYS.ACCOUNT_TOKEN];
  const deviceToken = storage[CLOUD_KEYS.DEVICE_TOKEN];
  
  if (credentials && accountToken) {
    // 有凭据，尝试自动登录
    try {
      await autoLogin(credentials);
    } catch (e) {
      console.log('Auto login failed:', e.message);
      // 自动登录失败，显示登录页面
    }
  }
}

/**
 * 自动登录
 */
async function autoLogin(encryptedCredentials) {
  try {
    const decoded = atob(encryptedCredentials);
    const [email, password] = decoded.split(':');
    
    const resp = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    
    if (!resp.ok) throw new Error('Login failed');
    
    const result = await resp.json();
    accountToken = result.token;
    
    // 登录成功，进入主界面
    await afterLogin();
  } catch (e) {
    throw e;
  }
}

/**
 * 登录成功后处理
 */
async function afterLogin() {
  isAuthenticated = true;
  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('main-screen').style.display = 'block';
  
  // 加载孩子的 Profile 列表
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
    
    if (!token) {
      cloudProfiles = [];
      return;
    }
    
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
  
  if (cloudProfiles.length === 0) {
    container.innerHTML = `
      <div style="text-align:center; padding:20px; color:var(--muted);">
        <p>暂无孩子 Profile</p>
        <button class="btn-add" onclick="showAddProfileDialog()">+ 添加孩子</button>
      </div>
    `;
    document.getElementById('add-profile-btn').style.display = 'block';
    return;
  }
  
  container.innerHTML = cloudProfiles.map(p => `
    <div class="profile-item" data-id="${p.id}" style="display:flex; align-items:center; gap:12px; padding:16px; border:1px solid var(--border); border-radius:12px; margin-bottom:12px;">
      <div class="avatar" style="width:40px; height:40px; border-radius:50%; background:${p.avatar_color || '#7c6fff'}; display:flex; align-items:center; justify-content:center; color:#fff; font-weight:600;">
        ${p.name.charAt(0).toUpperCase()}
      </div>
      <div style="flex:1;">
        <div style="font-size:15px; font-weight:600;">${p.name}</div>
        <div style="font-size:12px; color:var(--muted);">创建于 ${new Date(p.created_at).toLocaleDateString()}</div>
      </div>
      <button class="btn-save" style="padding:8px 16px; font-size:13px;" onclick="editProfile('${p.id}')">编辑</button>
      <button style="padding:8px; background:rgba(248,113,113,0.1); border:1px solid rgba(248,113,113,0.3); border-radius:8px; color:var(--danger);" onclick="deleteProfile('${p.id}')">删除</button>
    </div>
  `).join('');
  
  // 显示添加按钮
  const addBtn = document.getElementById('add-profile-btn');
  if (addBtn) addBtn.style.display = 'block';
}

// ── 登录表单 ───────────────────────────────────────────────────────────────

function setupLoginForm() {
  // 登录按钮
  document.getElementById('login-btn').addEventListener('click', async () => {
    const email = document.getElementById('email-input').value.trim();
    const password = document.getElementById('pw-input').value;
    const remember = document.getElementById('remember-me').checked;
    
    if (!email || !password) {
      showError('请输入邮箱和密码');
      return;
    }
    
    const btn = document.getElementById('login-btn');
    btn.disabled = true;
    btn.textContent = '登录中...';
    
    try {
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
      
      // 保存凭据
      if (remember) {
        const encrypted = btoa(`${email}:${password}`);
        await new Promise(resolve => {
          chrome.storage.local.set({
            [CLOUD_KEYS.CREDENTIALS]: encrypted,
            [CLOUD_KEYS.ACCOUNT_TOKEN]: result.token,
            [CLOUD_KEYS.REMEMBER_ME]: true
          }, resolve);
        });
      } else {
        await new Promise(resolve => {
          chrome.storage.local.set({
            [CLOUD_KEYS.ACCOUNT_TOKEN]: result.token,
            [CLOUD_KEYS.REMEMBER_ME]: false
          }, resolve);
        });
      }
      
      await afterLogin();
      
    } catch (e) {
      showError(e.message);
    } finally {
      btn.disabled = false;
      btn.textContent = '登录';
    }
  });
  
  // 回车键登录
  document.getElementById('pw-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') document.getElementById('login-btn').click();
  });
  
  // 注册链接
  document.getElementById('register-link').addEventListener('click', async (e) => {
    e.preventDefault();
    await showRegisterDialog();
  });
}

/**
 * 显示注册对话框
 */
async function showRegisterDialog() {
  const email = prompt('请输入邮箱地址：');
  if (!email) return;
  
  const password = prompt('请输入密码（至少6位）：');
  if (!password || password.length < 6) {
    showError('密码至少6位');
    return;
  }
  
  try {
    const resp = await fetch(`${API_BASE}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    
    if (!resp.ok) {
      const err = await resp.json();
      throw new Error(err.error || '注册失败');
    }
    
    alert('注册成功！请登录');
  } catch (e) {
    showError(e.message);
  }
}

// ── 登出 ─────────────────────────────────────────────────────────────────

async function logout() {
  // 清除云端凭据（但保留设备绑定状态）
  await new Promise(resolve => {
    chrome.storage.local.remove([CLOUD_KEYS.CREDENTIALS, CLOUD_KEYS.ACCOUNT_TOKEN], resolve);
  });
  
  accountToken = null;
  isAuthenticated = false;
  
  document.getElementById('main-screen').style.display = 'none';
  document.getElementById('login-screen').style.display = 'flex';
  document.getElementById('email-input').value = '';
  document.getElementById('pw-input').value = '';
  document.getElementById('error-msg').style.display = 'none';
}

function showError(msg) {
  const el = document.getElementById('error-msg');
  el.textContent = msg;
  el.style.display = 'block';
  setTimeout(() => el.style.display = 'none', 3000);
}

// ── Profile 管理 ─────────────────────────────────────────────────────────

async function showAddProfileDialog() {
  const name = prompt('请输入孩子姓名：');
  if (!name) return;
  
  try {
    const storage = await new Promise(resolve => {
      chrome.storage.local.get(CLOUD_KEYS.ACCOUNT_TOKEN, resolve);
    });
    const token = storage[CLOUD_KEYS.ACCOUNT_TOKEN];
    
    const resp = await fetch(`${API_BASE}/profiles`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ name })
    });
    
    if (!resp.ok) {
      const err = await resp.json();
      throw new Error(err.error || '创建失败');
    }
    
    await loadProfiles();
    showToast('孩子 Profile 已创建');
  } catch (e) {
    showError(e.message);
  }
}

async function editProfile(profileId) {
  const profile = cloudProfiles.find(p => p.id === profileId);
  if (!profile) return;
  
  const newName = prompt('请输入新名字：', profile.name);
  if (!newName || newName === profile.name) return;
  
  // TODO: 实现 Profile 编辑 API
  showToast('编辑功能开发中...');
}

async function deleteProfile(profileId) {
  if (!confirm('确定要删除这个孩子的 Profile 吗？')) return;
  
  // TODO: 实现 Profile 删除 API
  showToast('删除功能开发中...');
}

// ── 设备管理页面 ─────────────────────────────────────────────────────────

function setupDevicesPage() {
  // 添加孩子按钮
  document.getElementById('add-profile-btn')?.addEventListener('click', showAddProfileDialog);
  
  // 生成绑定码按钮
  document.getElementById('generate-bind-code-btn')?.addEventListener('click', async () => {
    if (cloudProfiles.length === 0) {
      showError('请先创建孩子 Profile');
      return;
    }
    
    // TODO: 生成绑定码
    showToast('绑定码功能开发中...');
  });
}

// ── 同步状态显示 ─────────────────────────────────────────────────────────

async function renderSyncStatus() {
  const storage = await new Promise(resolve => {
    chrome.storage.local.get([
      CLOUD_KEYS.DEVICE_TOKEN,
      CLOUD_KEYS.PROFILE_ID,
      'cloud_last_sync',
      'cloud_config_version'
    ], resolve);
  });
  
  const deviceToken = storage[CLOUD_KEYS.DEVICE_TOKEN];
  const lastSync = storage['cloud_last_sync'];
  const configVersion = storage['cloud_config_version'];
  
  const container = document.getElementById('sync-status');
  if (!container) return;
  
  container.innerHTML = `
    <div style="display:grid; grid-template-columns:1fr 1fr; gap:16px;">
      <div style="padding:12px; background:var(--surface); border-radius:8px;">
        <div style="font-size:12px; color:var(--muted);">设备绑定</div>
        <div style="font-size:16px; font-weight:600; color:${deviceToken ? 'var(--green)' : 'var(--danger)'}">
          ${deviceToken ? '已绑定' : '未绑定'}
        </div>
      </div>
      <div style="padding:12px; background:var(--surface); border-radius:8px;">
        <div style="font-size:12px; color:var(--muted);">配置版本</div>
        <div style="font-size:16px; font-weight:600;">${configVersion || '-'}</div>
      </div>
      <div style="padding:12px; background:var(--surface); border-radius:8px;">
        <div style="font-size:12px; color:var(--muted);">最后同步</div>
        <div style="font-size:16px; font-weight:600;">
          ${lastSync ? new Date(lastSync).toLocaleString() : '从未同步'}
        </div>
      </div>
      <div style="padding:12px; background:var(--surface); border-radius:8px;">
        <button class="btn-save" onclick="forceSync()">立即同步</button>
      </div>
    </div>
  `;
}

// ── 强制同步 ─────────────────────────────────────────────────────────────

async function forceSync() {
  try {
    await sendMsg({ type: 'CLOUD_FORCE_SYNC' });
    showToast('同步完成');
    await renderSyncStatus();
  } catch (e) {
    showError('同步失败: ' + e.message);
  }
}

// ── Toast 提示 ───────────────────────────────────────────────────────────

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
      
      // 切换 active 状态
      document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
      item.classList.add('active');
      
      // 切换页面显示
      document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
      document.getElementById(`page-${page}`)?.classList.add('active');
      
      // 刷新设备管理页
      if (page === 'devices') {
        loadProfiles();
        renderSyncStatus();
      }
    });
  });
}

// ── 其他页面设置（暂时保留本地功能）──────────────────────────────────────

function setupRulesPage() {
  // 保留原有功能，仅在保存时添加云端同步
}

function setupQuotaPage() {}

function setupSchedulePage() {}

function setupSecurityPage() {}

// ── 渲染总览（修改为云端状态）────────────────────────────────────────────

async function renderOverview() {
  // 管控总开关
  const toggleEnabled = document.getElementById('toggle-enabled');
  if (toggleEnabled) {
    toggleEnabled.checked = config.enabled;
    toggleEnabled.addEventListener('change', async (e) => {
      config.enabled = e.target.checked;
      await sendMsg({ type: 'UPDATE_CONFIG', config });
      await uploadChangelog('toggle_enabled', { enabled: !e.target.checked }, { enabled: e.target.checked });
    });
  }
  
  // 同步状态
  await renderSyncStatus();
}

// ── 上传配置变更 ─────────────────────────────────────────────────────────

async function uploadChangelog(action, beforeData, afterData) {
  try {
    const storage = await new Promise(resolve => {
      chrome.storage.local.get(CLOUD_KEYS.DEVICE_TOKEN, resolve);
    });
    const deviceToken = storage[CLOUD_KEYS.DEVICE_TOKEN];
    
    if (!deviceToken) return;
    
    await fetch(`${API_BASE}/device/changelog`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${deviceToken}`
      },
      body: JSON.stringify({ action, before_data: beforeData, after_data: afterData })
    });
  } catch (e) {
    console.error('Failed to upload changelog:', e);
  }
}