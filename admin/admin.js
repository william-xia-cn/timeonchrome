// admin/admin.js - 云端同步版 v2.0
// 完整流程：
// 1. 未绑定 → 登录家长账户 → 选择孩子 → 自动绑定 → 进入主界面
// 2. 已绑定 → 自动登录 → 直接进入主界面
// 3. 绑定后不能退出

const API_BASE = 'https://guardian-api.william-xia-cn.workers.dev';
const DAY_NAMES = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

/**
 * 自动识别设备名：从 User-Agent 提取操作系统信息
 * 格式："{OS} · Chrome · {4位短码}"
 * 短码来自 crypto.randomUUID() 前4位，绑定时固定，用于区分同OS多设备
 */
function getDeviceName() {
  const ua = navigator.userAgent;
  let os = 'Unknown';
  if (ua.includes('Windows NT'))          os = 'Windows';
  else if (ua.includes('Macintosh'))      os = 'macOS';
  else if (ua.includes('Linux'))          os = 'Linux';
  else if (ua.includes('Android'))        os = 'Android';
  else if (/iPhone|iPad/.test(ua))        os = 'iOS';
  const shortCode = crypto.randomUUID().slice(0, 4).toUpperCase();
  return `${os} · Chrome · ${shortCode}`;
}

const CLOUD_KEYS = {
  DEVICE_TOKEN: 'cloud_device_token',
  PROFILE_ID: 'cloud_profile_id',
  PROFILE_NAME: 'cloud_profile_name',
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
  setupStatsPage();

  // 监听后台广播：设备被远程解绑时立即切换到重绑流程
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === 'DEVICE_UNBOUND') {
      console.log('[Admin] Received DEVICE_UNBOUND, switching to rebind flow');
      checkAndHandleBinding();
    }
  });
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
  
  if (deviceToken && credentials) {
    // 有 device_token + 凭据 → 自动登录进主界面
    console.log('[Admin] Device is bound, auto logging in...');
    await autoLogin(credentials);
  } else if (credentials && !deviceToken) {
    // 有凭据但 device_token 已失效（被解绑）→ 自动填入邮箱，提示重新绑定
    console.log('[Admin] Credentials exist but device token missing, need rebind');
    await autoLoginForRebind(credentials);
  } else {
    // 全新状态 → 显示绑定页面
    console.log('[Admin] No credentials, showing bind screen');
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
  
  // 显示注册链接（首次使用可注册新账户）
  const registerLink = document.getElementById('register-link');
  if (registerLink) registerLink.style.display = 'block';
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
 * 自动登录并触发重新绑定流程
 * 场景：设备被解绑（云端删除）→ 本地 token 失效 → 有凭据但无 device_token
 */
async function autoLoginForRebind(encryptedCredentials) {
  try {
    const decoded = atob(encryptedCredentials);
    const [email, password] = decoded.split(':');
    currentEmail = email;

    const resp = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });

    if (!resp.ok) {
      // 连账号登录都失败，清空凭据显示登录页
      await chrome.storage.local.remove([CLOUD_KEYS.CREDENTIALS, CLOUD_KEYS.ACCOUNT_TOKEN]);
      showBindScreen();
      return;
    }

    const result = await resp.json();
    accountToken = result.token;
    // 更新 account_token
    chrome.storage.local.set({ [CLOUD_KEYS.ACCOUNT_TOKEN]: result.token });

    // 拉取孩子列表
    const profilesResp = await fetch(`${API_BASE}/profiles`, {
      headers: { 'Authorization': `Bearer ${accountToken}` }
    });
    if (!profilesResp.ok) { showBindScreen(); return; }

    const profilesData = await profilesResp.json();
    cloudProfiles = profilesData.profiles || [];

    // 显示重绑提示页
    showRebindScreen(email);

  } catch (e) {
    console.error('[Admin] autoLoginForRebind error:', e);
    showBindScreen();
  }
}

/**
 * 显示重新绑定提示页
 */
function showRebindScreen(email) {
  document.getElementById('main-screen').style.display = 'none';
  const loginScreen = document.getElementById('login-screen');
  loginScreen.style.display = 'flex';

  loginScreen.innerHTML = `
    <div class="login-box">
      <div class="login-logo">⚠️</div>
      <h1>需要重新绑定</h1>
      <p style="color:var(--muted);margin-bottom:20px;font-size:13px;line-height:1.6;">
        本设备已被解绑，请重新选择要绑定的孩子档案。<br>
        当前账户：<strong>${email}</strong>
      </p>
      <div id="rebind-profiles" style="margin-bottom:16px;"></div>
      <div class="error-msg" id="rebind-error" style="display:none;"></div>
    </div>
  `;

  const container = document.getElementById('rebind-profiles');
  if (cloudProfiles.length === 0) {
    container.innerHTML = `<div style="color:var(--muted);font-size:13px;">没有可绑定的孩子档案，请先在家长控制台创建。</div>`;
    return;
  }

  container.innerHTML = cloudProfiles.map(p => `
    <div onclick="rebindToProfile('${p.id}','${p.name}','${p.avatar_color||'#7c6fff'}')"
         style="display:flex;align-items:center;gap:12px;padding:14px 16px;
                border:1px solid var(--border);border-radius:12px;margin-bottom:10px;
                cursor:pointer;transition:all 0.2s;"
         onmouseover="this.style.borderColor='var(--accent)'"
         onmouseout="this.style.borderColor='var(--border)'">
      <div style="width:38px;height:38px;border-radius:50%;background:${p.avatar_color||'#7c6fff'};
                  display:flex;align-items:center;justify-content:center;color:#fff;font-weight:600;">
        ${p.name.charAt(0).toUpperCase()}
      </div>
      <div>
        <div style="font-weight:600;">${p.name}</div>
        <div style="font-size:12px;color:var(--accent);">点击重新绑定此设备</div>
      </div>
    </div>
  `).join('');
}

/**
 * 重新绑定到指定 Profile
 */
async function rebindToProfile(profileId, profileName, avatarColor) {
  const errorEl = document.getElementById('rebind-error');
  try {
    const devName = getDeviceName();
    const resp = await fetch(`${API_BASE}/device/bind`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accountToken}`
      },
      body: JSON.stringify({ profile_id: profileId, device_name: devName })
    });

    if (!resp.ok) {
      const err = await resp.json();
      throw new Error(err.error || '绑定失败');
    }

    const bindResult = await resp.json();

    await new Promise(resolve => chrome.storage.local.set({
      [CLOUD_KEYS.DEVICE_TOKEN]: bindResult.device_token,
      [CLOUD_KEYS.PROFILE_ID]:   profileId,
      [CLOUD_KEYS.PROFILE_NAME]: profileName,
      [CLOUD_KEYS.IS_BOUND]:     true,
      cloud_device_name:         devName,
    }, resolve));

    try {
      await sendMsg({ type: 'CLOUD_BIND', profile_id: profileId });
    } catch (e) { /* non-fatal */ }

    cloudProfiles = cloudProfiles.filter(p => p.id === profileId);
    currentProfileId = profileId;
    await enterMainScreen();

  } catch (e) {
    if (errorEl) { errorEl.textContent = e.message; errorEl.style.display = 'block'; }
  }
}

window.rebindToProfile = rebindToProfile;

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
  
  // 加载 Profile 列表（需要先加载才能查找到 profile name）
  await loadProfiles();
  
  // 显示用户信息（左下角）
  const userInfo = document.getElementById('user-info');
  if (userInfo) {
    const storage = await new Promise(resolve => {
      chrome.storage.local.get([CLOUD_KEYS.PROFILE_NAME, CLOUD_KEYS.PROFILE_ID, CLOUD_KEYS.CREDENTIALS], resolve);
    });
    let profileName = storage[CLOUD_KEYS.PROFILE_NAME];
    const profileId = storage[CLOUD_KEYS.PROFILE_ID];
    const credentials = storage[CLOUD_KEYS.CREDENTIALS];
    
    // 如果没有保存过 profileName，尝试从 cloudProfiles 中查找
    if (!profileName && profileId && cloudProfiles.length > 0) {
      const profile = cloudProfiles.find(p => p.id === profileId);
      if (profile) {
        profileName = profile.name;
        // 保存下来
        chrome.storage.local.set({ [CLOUD_KEYS.PROFILE_NAME]: profileName });
      }
    }
    
    if (profileName || credentials) {
      document.getElementById('profile-name-display').textContent = profileName || '未知';
      
      // 从凭据中解析邮箱（credentials 是 base64 编码的 "email:password"）
      if (credentials) {
        try {
          const decoded = atob(credentials);
          const email = decoded.split(':')[0];
          document.getElementById('account-email-display').textContent = email || '';
        } catch (e) {
          document.getElementById('account-email-display').textContent = currentEmail || '';
        }
      }
      
      userInfo.style.display = 'block';
    }
  }
  
  // 侧边栏显示孩子名字
  const nameStorage = await new Promise(resolve =>
    chrome.storage.local.get([CLOUD_KEYS.PROFILE_NAME], resolve)
  );
  const childName = nameStorage[CLOUD_KEYS.PROFILE_NAME];
  const sidebarNameEl = document.getElementById('sidebar-child-name');
  if (sidebarNameEl && childName) sidebarNameEl.textContent = childName + ' 的面板';

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

  // 注册链接
  const registerLink = document.getElementById('register-link');
  if (registerLink) {
    registerLink.addEventListener('click', (e) => {
      e.preventDefault();
      showRegisterForm();
    });
  }
}

/**
 * 显示注册表单
 */
function showRegisterForm() {
  const loginScreen = document.getElementById('login-screen');
  loginScreen.innerHTML = `
    <div class="login-box">
      <div class="login-logo">🛡</div>
      <h1>TimeOnChrome</h1>
      <p>创建家长账户</p>

      <div class="form-group">
        <label>邮箱</label>
        <input type="email" id="reg-email" placeholder="your@email.com" autocomplete="email">
      </div>
      <div class="form-group">
        <label>密码</label>
        <input type="password" id="reg-password" placeholder="至少6位" autocomplete="new-password">
      </div>
      <div class="form-group">
        <label>确认密码</label>
        <input type="password" id="reg-password2" placeholder="再次输入密码" autocomplete="new-password">
      </div>
      <div class="form-group">
        <label>孩子的名字</label>
        <input type="text" id="reg-child-name" placeholder="例如：小明" autocomplete="off">
      </div>

      <button class="btn-primary" id="reg-submit-btn">注册并绑定</button>
      <div class="error-msg" id="reg-error-msg" style="display:none;"></div>

      <div style="margin-top:16px; text-align:center;">
        <a href="#" id="back-to-login" style="font-size:13px; color:var(--accent);">已有账户？登录</a>
      </div>
    </div>
  `;

  document.getElementById('reg-submit-btn').addEventListener('click', handleRegister);
  document.getElementById('reg-password2').addEventListener('keydown', e => {
    if (e.key === 'Enter') handleRegister();
  });
  document.getElementById('back-to-login').addEventListener('click', (e) => {
    e.preventDefault();
    // 恢复登录界面
    location.reload();
  });
}

/**
 * 处理注册提交
 * 流程：注册账户 → 创建子档案 → 绑定设备 → 进入主界面
 */
async function handleRegister() {
  const email = document.getElementById('reg-email')?.value.trim();
  const password = document.getElementById('reg-password')?.value;
  const password2 = document.getElementById('reg-password2')?.value;
  const childName = document.getElementById('reg-child-name')?.value.trim();

  const showRegError = (msg) => {
    const el = document.getElementById('reg-error-msg');
    if (el) { el.textContent = msg; el.style.display = 'block'; }
  };

  if (!email || !password || !childName) {
    showRegError('请填写所有必填项');
    return;
  }
  if (password.length < 6) {
    showRegError('密码至少6位');
    return;
  }
  if (password !== password2) {
    showRegError('两次输入的密码不一致');
    return;
  }

  const btn = document.getElementById('reg-submit-btn');
  btn.disabled = true;
  btn.textContent = '注册中...';

  try {
    // Step 1: 注册账户
    const regResp = await fetch(`${API_BASE}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });

    if (!regResp.ok) {
      const err = await regResp.json();
      throw new Error(err.error === 'Email already exists' ? '该邮箱已注册，请直接登录' : (err.error || '注册失败'));
    }

    const regResult = await regResp.json();
    accountToken = regResult.token;
    currentEmail = email;

    // 保存凭据
    const encrypted = btoa(`${email}:${password}`);
    await new Promise(resolve => {
      chrome.storage.local.set({
        [CLOUD_KEYS.CREDENTIALS]: encrypted,
        [CLOUD_KEYS.ACCOUNT_TOKEN]: regResult.token
      }, resolve);
    });

    btn.textContent = '创建孩子档案...';

    // Step 2: 创建孩子 Profile
    const profileResp = await fetch(`${API_BASE}/profiles`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accountToken}`
      },
      body: JSON.stringify({ name: childName, avatar_color: '#7c6fff' })
    });

    if (!profileResp.ok) {
      const err = await profileResp.json();
      throw new Error(err.error || '创建孩子档案失败');
    }

    const profileResult = await profileResp.json();
    const newProfileId = profileResult.profile.id;

    btn.textContent = '绑定设备...';

    // Step 3: 绑定设备
    const bindResp = await fetch(`${API_BASE}/device/bind`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accountToken}`
      },
      body: JSON.stringify({ profile_id: newProfileId, device_name: getDeviceName() })
    });

    if (!bindResp.ok) {
      const err = await bindResp.json();
      throw new Error(err.error || '绑定设备失败');
    }

    const bindResult = await bindResp.json();

    // Step 4: 保存绑定信息（含本机设备名，用于"本机"页展示）
    const devNameReg = getDeviceName();
    await new Promise(resolve => {
      chrome.storage.local.set({
        [CLOUD_KEYS.DEVICE_TOKEN]: bindResult.device_token,
        [CLOUD_KEYS.PROFILE_ID]: newProfileId,
        [CLOUD_KEYS.PROFILE_NAME]: childName,
        [CLOUD_KEYS.IS_BOUND]: true,
        cloud_device_name: devNameReg,
      }, resolve);
    });

    // Step 5: 通知 background.js 同步
    try {
      await sendMsg({
        type: 'CLOUD_BIND',
        profile_id: newProfileId,
        device_name: getDeviceName()
      });
    } catch (e) {
      console.warn('[Admin] sendMsg CLOUD_BIND error (non-fatal):', e);
    }

    // Step 6: 进入主界面
    cloudProfiles = [profileResult.profile];
    currentProfileId = newProfileId;
    await enterMainScreen();

  } catch (e) {
    showRegError(e.message || '操作失败，请重试');
    btn.disabled = false;
    btn.textContent = '注册并绑定';
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
          <div class="profile-item" data-id="${p.id}" data-name="${p.name}" data-color="${p.avatar_color || '#7c6fff'}" 
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
  
  // 添加点击事件
  document.querySelectorAll('.profile-item').forEach(item => {
    item.addEventListener('click', () => {
      const id = item.dataset.id;
      const name = item.dataset.name;
      const color = item.dataset.color;
      bindToProfile(id, name, color);
    });
  });
}

/**
 * 绑定到选定的 Profile
 */
async function bindToProfile(profileId, profileName, avatarColor) {
  console.log('[Admin] bindToProfile called, profileId:', profileId, 'accountToken:', accountToken ? 'exists' : 'NULL');
  
  try {
    // 1. 调用设备绑定 API（需要 account_token，不是 device_token）
    console.log('[Admin] Calling /device/bind with accountToken...');
    const resp = await fetch(`${API_BASE}/device/bind`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accountToken}`
      },
      body: JSON.stringify({
        profile_id: profileId,
        device_name: getDeviceName()
      })
    });
    
    console.log('[Admin] Response status:', resp.status);
    
    if (!resp.ok) {
      const err = await resp.json();
      console.error('[Admin] Bind error:', err);
      throw new Error(err.error || '绑定失败');
    }
    
    const bindResult = await resp.json();
    console.log('[Admin] Bind success, device_token:', bindResult.device_token);
    
    // 2. 保存绑定信息
    const devNameBind = getDeviceName();
    await new Promise(resolve => {
      chrome.storage.local.set({
        [CLOUD_KEYS.DEVICE_TOKEN]: bindResult.device_token,
        [CLOUD_KEYS.PROFILE_ID]: profileId,
        [CLOUD_KEYS.PROFILE_NAME]: profileName,
        [CLOUD_KEYS.IS_BOUND]: true,
        cloud_device_name: devNameBind,
      }, resolve);
    });
    console.log('[Admin] Saved to local storage');
    
    // 3. 通知 background.js 同步
    console.log('[Admin] Calling sendMsg to background...');
    try {
      const bgResult = await sendMsg({ 
        type: 'CLOUD_BIND',
        profile_id: profileId,
        device_name: getDeviceName()
      });
      console.log('[Admin] sendMsg result:', bgResult);
    } catch (e) {
      console.error('[Admin] sendMsg error:', e);
    }
    
    // 4. 进入主界面
    console.log('[Admin] Entering main screen...');
    currentProfileId = profileId;
    await enterMainScreen();
    console.log('[Admin] Done!');
    
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
      
      if (page === 'overview')  renderOverview();
      if (page === 'rules')     renderRulesPage();
      if (page === 'stats')     renderStatsPage();
      if (page === 'devices') { setupDevicesPage(); renderSyncStatus(); }
    });
  });
}

// ── 通用工具 ──────────────────────────────────────────────────────────────

function formatSeconds(secs) {
  if (!secs || secs < 0) secs = 0;
  if (secs < 60) return `${secs}秒`;
  if (secs < 3600) return `${Math.floor(secs / 60)}分`;
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  return m > 0 ? `${h}小时${m}分` : `${h}小时`;
}

// 渲染只读域名标签（孩子视角，无删除按钮）
function renderDomainTagsReadOnly(containerId, domains) {
  const container = document.getElementById(containerId);
  if (!container) return;
  if (!domains || domains.length === 0) {
    container.innerHTML = '<div style="color:var(--muted);font-size:12px;padding:8px 0;">暂无域名</div>';
    return;
  }
  container.innerHTML = domains.map(d =>
    `<span class="domain-tag" style="cursor:default;">${d}</span>`
  ).join('');
}

function updateListCounts() {
  const bl = (config.blacklist  || []).length;
  const sl = (config.studyList  || []).length;
  const al = (config.allowList  || []).length;
  const bcEl = document.getElementById('blacklist-count');
  const scEl = document.getElementById('studylist-count');
  const acEl = document.getElementById('allowlist-count');
  if (bcEl) bcEl.textContent = bl ? `共 ${bl} 条` : '';
  if (scEl) scEl.textContent = sl ? `共 ${sl} 条` : '';
  if (acEl) acEl.textContent = al ? `共 ${al} 条` : '';
}

// ── 访问规则页（只读）───────────────────────────────────────────────────────

function renderRulesPage() {
  const mode = config.mode === 'whitelist' ? 'whitelist' : 'blacklist';

  // 模式说明
  const modeDescEl = document.getElementById('rules-mode-desc');
  if (modeDescEl) {
    modeDescEl.textContent = mode === 'whitelist'
      ? '✅ 白名单模式：仅允许访问学习网站和允许列表'
      : '🔓 黑名单模式：除屏蔽网站外均可访问';
  }

  // 白名单区块显示/隐藏
  const whitelistSection = document.getElementById('whitelist-section');
  if (whitelistSection) whitelistSection.style.display = mode === 'whitelist' ? '' : 'none';

  // 渲染只读标签
  renderDomainTagsReadOnly('blacklist-tags', config.blacklist || []);
  renderDomainTagsReadOnly('studylist-tags', config.studyList || []);
  renderDomainTagsReadOnly('allowlist-tags', config.allowList || []);
  updateListCounts();

  // 学习网站搜索框（仅过滤显示，不修改数据）
  const searchEl = document.getElementById('studylist-search');
  if (searchEl) {
    const newSearch = searchEl.cloneNode(true);
    searchEl.parentNode.replaceChild(newSearch, searchEl);
    newSearch.addEventListener('input', (e) => {
      const q = e.target.value.trim().toLowerCase();
      const list = config.studyList || [];
      const filtered = q ? list.filter(d => d.includes(q)) : list;
      renderDomainTagsReadOnly('studylist-tags', filtered);
    });
  }

  // ── 上网时间段（并入访问规则）──────────────────────────────────────
  const schedule = config.schedule || {};
  const schedEnabled = schedule.enabled;

  const schedDescEl = document.getElementById('schedule-status-desc');
  if (schedDescEl) {
    schedDescEl.textContent = schedEnabled
      ? '✅ 已启用，下列时间段内可上网'
      : '⏸ 未启用，全天均可上网';
  }

  const schedContainer = document.getElementById('schedule-rows');
  if (schedContainer) {
    if (!schedEnabled) {
      schedContainer.innerHTML = `
        <div style="color:var(--muted);font-size:13px;padding:12px 0;">
          全天均可上网，时间段管控未启用
        </div>`;
    } else {
      schedContainer.innerHTML = DAY_NAMES.map((name, i) => {
        const day      = schedule.days?.[i] || { enabled: false, start: '08:00', end: '22:00' };
        const isActive = day.enabled;
        return `
          <div style="display:flex;align-items:center;gap:16px;padding:10px 0;border-bottom:1px solid var(--border);">
            <div style="width:36px;font-size:13px;font-weight:600;color:${isActive ? 'var(--text)' : 'var(--muted)'};">${name}</div>
            ${isActive
              ? `<div style="display:flex;align-items:center;gap:6px;font-size:13px;">
                   <span style="color:var(--green);font-size:9px;">●</span>
                   <span>${day.start || '08:00'}</span>
                   <span style="color:var(--muted);">—</span>
                   <span>${day.end || '22:00'}</span>
                 </div>`
              : `<div style="font-size:13px;color:var(--muted);">不限制</div>`
            }
          </div>`;
      }).join('');
    }
  }
}

// ──────────────────────────────────────────────────────────────────────────


async function setupDevicesPage() {
  const storage = await new Promise(resolve =>
    chrome.storage.local.get([CLOUD_KEYS.PROFILE_ID, CLOUD_KEYS.CREDENTIALS], resolve)
  );
  const boundProfileId = storage[CLOUD_KEYS.PROFILE_ID];
  const boundProfile = cloudProfiles.find(p => p.id === boundProfileId);
  const email = currentEmail || (() => {
    try { return atob(storage[CLOUD_KEYS.CREDENTIALS] || '').split(':')[0]; } catch { return ''; }
  })();

  // ── 本机绑定状态 ──
  const profilesEl = document.getElementById('profiles-list');
  if (profilesEl) {
    if (boundProfile) {
      profilesEl.innerHTML = `
        <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 0;">
          <div style="display:flex;align-items:center;gap:12px;">
            <div id="profile-avatar-display" style="width:40px;height:40px;border-radius:50%;background:${boundProfile.avatar_color||'#7c6fff'};display:flex;align-items:center;justify-content:center;color:#fff;font-weight:600;font-size:18px;cursor:pointer;" onclick="showEditProfileModal()" title="点击编辑">
              ${boundProfile.name.charAt(0).toUpperCase()}
            </div>
            <div>
              <div style="font-size:15px;font-weight:600;" id="profile-name-inline">${boundProfile.name}</div>
              <div style="font-size:12px;color:var(--green);">✓ 已绑定此设备</div>
            </div>
          </div>
          <button onclick="showEditProfileModal()" style="padding:6px 12px;background:transparent;border:1px solid var(--border);border-radius:8px;color:var(--muted);font-size:12px;cursor:pointer;">编辑</button>
        </div>`;
    } else {
      profilesEl.innerHTML = `<div style="color:var(--muted);font-size:13px;">未绑定任何孩子档案</div>`;
    }
  }

  // ── 账户信息区 ──
  const accountInfo = document.getElementById('account-info');
  if (accountInfo) accountInfo.textContent = email;

  // ── 设备绑定同步状态 ──
  await renderSyncStatus();

  // ── 账户操作区 ──
  const accountActionsEl = document.getElementById('account-actions');
  if (accountActionsEl) {
    accountActionsEl.innerHTML = `
      <div style="display:flex;flex-direction:column;gap:10px;">
        <button onclick="showChangePasswordModal()" style="padding:10px 16px;background:transparent;border:1px solid var(--border);border-radius:8px;color:var(--text);font-size:13px;cursor:pointer;text-align:left;">
          🔑 修改登录密码
        </button>
        <button onclick="confirmLogout()" style="padding:10px 16px;background:transparent;border:1px solid var(--border);border-radius:8px;color:var(--muted);font-size:13px;cursor:pointer;text-align:left;">
          🚪 退出登录
        </button>
        ${boundProfile ? `<button onclick="confirmDeleteProfile()" style="padding:10px 16px;background:rgba(248,113,113,0.08);border:1px solid rgba(248,113,113,0.3);border-radius:8px;color:var(--danger);font-size:13px;cursor:pointer;text-align:left;">
          🗑 删除孩子档案「${boundProfile.name}」
        </button>` : ''}
      </div>
    `;
  }
}


// ── 渲染总览 ─────────────────────────────────────────────────────────────

async function renderOverview() {
  // 日期
  const now = new Date();
  const weekNames = ['周日','周一','周二','周三','周四','周五','周六'];
  const dateEl = document.getElementById('overview-date');
  if (dateEl) dateEl.textContent = `${now.getMonth()+1}月${now.getDate()}日 ${weekNames[now.getDay()]}`;

  // 今日统计
  let studySeconds = 0, restSeconds = 0, onlineSeconds = 0;
  try {
    const rangeData = await sendMsg({ type: 'GET_STATS_RANGE', days: 1 });
    const todayData = Object.values(rangeData)[Object.keys(rangeData).length - 1] || {};
    for (const [domain, seconds] of Object.entries(todayData)) {
      const type = classifyDomain(domain);
      if (type === 'study') studySeconds += seconds;
      else restSeconds += seconds;
      onlineSeconds += seconds;
    }
  } catch (e) { /* pass */ }

  // 激励摘要
  const summaryEl = document.getElementById('summary-text');
  if (summaryEl) {
    const pct = onlineSeconds > 0 ? Math.round(studySeconds / onlineSeconds * 100) : 0;
    const remaining = Math.max(0, (config.dailyStudyQuota || 480) * 60 - studySeconds);
    let msg;
    if (onlineSeconds === 0) {
      msg = '今天还没有开始使用电脑，准备好了就出发吧！📚';
    } else if (studySeconds === 0) {
      msg = `今天在线 <b>${formatSeconds(onlineSeconds)}</b>，还没有学习时间，加油！💪`;
    } else if (pct >= 70) {
      msg = `今天已学习 <b>${formatSeconds(studySeconds)}</b>，学习专注度 <b>${pct}%</b>，表现优秀！🎉 继续保持！`;
    } else if (pct >= 40) {
      msg = `今天已学习 <b>${formatSeconds(studySeconds)}</b>，学习专注度 ${pct}%，还可学习 <b>${formatSeconds(remaining)}</b>，加油！💪`;
    } else {
      msg = `今天在线 <b>${formatSeconds(onlineSeconds)}</b>，其中学习 <b>${formatSeconds(studySeconds)}</b>，尝试多花时间学习吧！📖`;
    }
    summaryEl.innerHTML = msg;
  }

  // 今日时长进度条（含锁定状态）
  const onlineLimit = (config.dailyOnlineQuota ?? 1200) * 60;
  const studyLimit  = (config.dailyStudyQuota  ?? 480)  * 60;
  const restLimit   = (config.dailyRestQuota   ?? 120)  * 60;
  const qs = config.quotaState || {};

  const progressEl = document.getElementById('overview-progress');
  if (progressEl) {
    const bar = (icon, label, used, limit, color, locked) => {
      const pct = limit > 0 ? Math.min(100, Math.round(used / limit * 100)) : 0;
      const barColor = locked ? 'var(--danger)' : pct >= 90 ? 'var(--warn)' : color;
      return `
        <div style="margin-bottom:18px;">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
            <span style="font-size:13px;font-weight:500;">${icon} ${label}${locked ? ' <span style="font-size:11px;color:var(--danger);background:rgba(248,113,113,0.12);padding:1px 6px;border-radius:8px;margin-left:4px;">已达上限</span>' : ''}</span>
            <span style="font-size:13px;color:var(--muted);">${formatSeconds(used)} / ${formatSeconds(limit)}</span>
          </div>
          <div style="height:8px;background:rgba(255,255,255,0.06);border-radius:4px;overflow:hidden;">
            <div style="width:${pct}%;height:100%;background:${barColor};border-radius:4px;transition:width 0.5s;"></div>
          </div>
          <div style="font-size:11px;color:var(--muted);margin-top:3px;">${pct}% 已用，剩余 ${formatSeconds(Math.max(0, limit - used))}</div>
        </div>`;
    };

    progressEl.innerHTML =
      bar('🌐', '在线时长', onlineSeconds, onlineLimit, 'var(--accent)', qs.onlineLocked) +
      bar('📚', '学习时长', studySeconds, studyLimit, 'var(--green)', qs.studyLocked) +
      bar('🎵', '休息时长', restSeconds, restLimit, 'var(--warn)', qs.restLocked);
  }

  // 单站点配额（只读）
  const domainQEl = document.getElementById('domain-quotas-list');
  if (domainQEl) {
    const entries = Object.entries(config.domainQuotas || {});
    // 没有单站点配额时隐藏整个卡片
    const domainCard = document.getElementById('domain-quota-card');
    if (entries.length === 0) {
      if (domainCard) domainCard.style.display = 'none';
    } else {
      if (domainCard) domainCard.style.display = '';
      domainQEl.innerHTML = entries.map(([domain, minutes]) => `
        <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border);">
          <span style="font-size:14px;">${domain}</span>
          <span style="color:var(--accent);font-weight:600;">${minutes} 分钟/天</span>
        </div>
      `).join('');
    }
  }

  // 今日 Top 10
  try {
    const stats  = await sendMsg({ type: 'GET_STATS' });
    const listEl = document.getElementById('today-stats-list');
    if (listEl) {
      const entries = Object.entries(stats).sort((a, b) => b[1] - a[1]).slice(0, 10);
      if (entries.length === 0) {
        listEl.innerHTML = '<div style="color:var(--muted);text-align:center;padding:20px;">今日暂无数据</div>';
      } else {
        listEl.innerHTML = entries.map(([domain, seconds]) => `
          <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border);">
            <span style="font-size:13px;">${domain}</span>
            <span style="color:var(--accent);font-weight:600;font-size:13px;">${formatSeconds(seconds)}</span>
          </div>
        `).join('');
      }
    }
  } catch (e) { /* pass */ }

  await renderSyncStatus();
}

async function renderSyncStatus() {
  const storage = await new Promise(resolve => {
    chrome.storage.local.get([
      CLOUD_KEYS.DEVICE_TOKEN,
      CLOUD_KEYS.PROFILE_ID,
      'cloud_last_sync',
      'cloud_config_version',
      'cloud_device_name',
    ], resolve);
  });

  const container = document.getElementById('sync-status');
  if (!container) return;

  // 本机设备名（首次绑定时保存的）
  const deviceName = storage['cloud_device_name'] || '本机';
  // device_token 前8位作为短码
  const token = storage[CLOUD_KEYS.DEVICE_TOKEN] || '';
  const shortId = token ? token.slice(0, 8).toUpperCase() : '—';

  container.innerHTML = `
    <div style="display:grid; grid-template-columns:1fr 1fr; gap:14px;">
      <div style="padding:12px; background:var(--surface); border-radius:8px; grid-column:1/-1;">
        <div style="font-size:12px; color:var(--muted); margin-bottom:4px;">本机设备</div>
        <div style="font-size:15px; font-weight:600;">${deviceName}</div>
        <div style="font-size:11px; color:var(--muted); margin-top:2px; font-family:monospace;">ID: ${shortId}</div>
      </div>
      <div style="padding:12px; background:var(--surface); border-radius:8px;">
        <div style="font-size:12px; color:var(--muted);">绑定状态</div>
        <div style="font-size:15px; font-weight:600; color:var(--green);">✓ 已绑定</div>
      </div>
      <div style="padding:12px; background:var(--surface); border-radius:8px;">
        <div style="font-size:12px; color:var(--muted);">配置版本</div>
        <div style="font-size:15px; font-weight:600;">${storage['cloud_config_version'] || '—'}</div>
      </div>
      <div style="padding:12px; background:var(--surface); border-radius:8px; grid-column:1/-1;">
        <div style="font-size:12px; color:var(--muted); margin-bottom:4px;">最后同步</div>
        <div style="font-size:13px;">
          ${storage['cloud_last_sync'] ? new Date(storage['cloud_last_sync']).toLocaleString() : '从未同步'}
        </div>
      </div>
    </div>
    <div style="margin-top:14px; display:flex; gap:10px;">
      <button class="btn-save" onclick="forceSync()" style="flex:1;">🔄 立即同步</button>
      <button onclick="confirmRebind()" style="flex:1; padding:10px; background:transparent; border:1px solid var(--border); border-radius:8px; color:var(--muted); font-size:13px; cursor:pointer;">重新绑定</button>
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

async function confirmRebind() {
  if (!confirm('确定要解绑此设备并重新绑定吗？\n\n本地配置和统计数据不会丢失。')) return;

  // 清除 device token（保留 credentials 以便重绑时自动登录）
  await new Promise(resolve => chrome.storage.local.set({
    [CLOUD_KEYS.DEVICE_TOKEN]: null,
    [CLOUD_KEYS.PROFILE_ID]: null,
    [CLOUD_KEYS.PROFILE_NAME]: null,
    [CLOUD_KEYS.IS_BOUND]: false,
  }, resolve));

  // 通知 background 清除同步状态
  try { await sendMsg({ type: 'CLOUD_LOGOUT' }); } catch (e) { /* pass */ }

  // 重新进入绑定流程
  const credentials = await new Promise(resolve =>
    chrome.storage.local.get([CLOUD_KEYS.CREDENTIALS], r => resolve(r[CLOUD_KEYS.CREDENTIALS]))
  );

  if (credentials) {
    await autoLoginForRebind(credentials);
  } else {
    location.reload();
  }
}

// ── 编辑档案弹窗 ─────────────────────────────────────────────────────
const AVATAR_COLORS = ['#7c6fff','#ff6c9d','#4ade80','#fbbf24','#60a5fa','#f97316','#a78bfa','#34d399'];

async function showEditProfileModal() {
  const storage = await new Promise(resolve =>
    chrome.storage.local.get([CLOUD_KEYS.PROFILE_ID], resolve)
  );
  const profileId = storage[CLOUD_KEYS.PROFILE_ID];
  const profile = cloudProfiles.find(p => p.id === profileId);
  if (!profile) return;

  const overlay = createModalOverlay();
  overlay.innerHTML = `
    <div class="modal-box">
      <h3 style="margin-bottom:20px;">编辑孩子档案</h3>
      <div class="form-group">
        <label>孩子名字</label>
        <input type="text" id="edit-profile-name" value="${profile.name}" maxlength="50">
      </div>
      <div class="form-group">
        <label>头像颜色</label>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:6px;">
          ${AVATAR_COLORS.map(c => `
            <div onclick="selectAvatarColor('${c}',this)" data-color="${c}"
                 style="width:32px;height:32px;border-radius:50%;background:${c};cursor:pointer;
                        border:3px solid ${c === (profile.avatar_color||'#7c6fff') ? '#fff' : 'transparent'};
                        transition:border-color 0.2s;">
            </div>`).join('')}
        </div>
      </div>
      <div style="display:flex;gap:10px;margin-top:24px;">
        <button onclick="saveEditProfile('${profileId}')" class="btn-primary" style="flex:1;">保存</button>
        <button onclick="closeModal()" style="flex:1;padding:10px;background:transparent;border:1px solid var(--border);border-radius:8px;color:var(--muted);cursor:pointer;">取消</button>
      </div>
      <div id="edit-profile-error" style="color:var(--danger);font-size:12px;margin-top:8px;display:none;"></div>
    </div>
  `;
  document.body.appendChild(overlay);
  window._selectedAvatarColor = profile.avatar_color || '#7c6fff';
  document.getElementById('edit-profile-name').focus();
}

function selectAvatarColor(color, el) {
  window._selectedAvatarColor = color;
  document.querySelectorAll('[data-color]').forEach(d => d.style.border = '3px solid transparent');
  el.style.border = '3px solid #fff';
}

async function saveEditProfile(profileId) {
  const name = document.getElementById('edit-profile-name')?.value.trim();
  const avatar_color = window._selectedAvatarColor;
  const errorEl = document.getElementById('edit-profile-error');

  if (!name) { errorEl.textContent = '名字不能为空'; errorEl.style.display = 'block'; return; }

  try {
    const resp = await fetch(`${API_BASE}/profiles/${profileId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${accountToken}` },
      body: JSON.stringify({ name, avatar_color })
    });
    if (!resp.ok) { const e = await resp.json(); throw new Error(e.error || '保存失败'); }

    // 更新本地 cloudProfiles
    const idx = cloudProfiles.findIndex(p => p.id === profileId);
    if (idx >= 0) { cloudProfiles[idx].name = name; cloudProfiles[idx].avatar_color = avatar_color; }
    chrome.storage.local.set({ [CLOUD_KEYS.PROFILE_NAME]: name });

    closeModal();
    await setupDevicesPage();
    showToast('档案已更新');
  } catch (e) {
    if (errorEl) { errorEl.textContent = e.message; errorEl.style.display = 'block'; }
  }
}

// ── 修改密码弹窗 ─────────────────────────────────────────────────────
function showChangePasswordModal() {
  const overlay = createModalOverlay();
  overlay.innerHTML = `
    <div class="modal-box">
      <h3 style="margin-bottom:20px;">修改密码</h3>
      <div class="form-group">
        <label>当前密码</label>
        <input type="password" id="pw-old" placeholder="当前密码">
      </div>
      <div class="form-group">
        <label>新密码</label>
        <input type="password" id="pw-new" placeholder="至少6位">
      </div>
      <div class="form-group">
        <label>确认新密码</label>
        <input type="password" id="pw-new2" placeholder="再次输入新密码">
      </div>
      <div style="display:flex;gap:10px;margin-top:24px;">
        <button onclick="doChangePassword()" class="btn-primary" style="flex:1;">确认修改</button>
        <button onclick="closeModal()" style="flex:1;padding:10px;background:transparent;border:1px solid var(--border);border-radius:8px;color:var(--muted);cursor:pointer;">取消</button>
      </div>
      <div id="pw-change-error" style="color:var(--danger);font-size:12px;margin-top:8px;display:none;"></div>
      <div id="pw-change-ok" style="color:var(--green);font-size:12px;margin-top:8px;display:none;"></div>
    </div>
  `;
  document.body.appendChild(overlay);
  document.getElementById('pw-old').focus();
}

async function doChangePassword() {
  const oldPassword = document.getElementById('pw-old')?.value;
  const newPassword = document.getElementById('pw-new')?.value;
  const newPassword2 = document.getElementById('pw-new2')?.value;
  const errorEl = document.getElementById('pw-change-error');
  const okEl = document.getElementById('pw-change-ok');

  errorEl.style.display = 'none';
  okEl.style.display = 'none';

  if (!oldPassword || !newPassword) { errorEl.textContent = '请填写所有字段'; errorEl.style.display = 'block'; return; }
  if (newPassword.length < 6) { errorEl.textContent = '新密码至少6位'; errorEl.style.display = 'block'; return; }
  if (newPassword !== newPassword2) { errorEl.textContent = '两次密码不一致'; errorEl.style.display = 'block'; return; }

  try {
    const resp = await fetch(`${API_BASE}/auth/change-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${accountToken}` },
      body: JSON.stringify({ oldPassword, newPassword })
    });
    if (!resp.ok) { const e = await resp.json(); throw new Error(e.error || '修改失败'); }

    okEl.textContent = '密码已修改，请重新登录';
    okEl.style.display = 'block';

    // 清除本地凭据，3秒后重新绑定流程
    await new Promise(resolve => chrome.storage.local.set({
      [CLOUD_KEYS.CREDENTIALS]: null,
      [CLOUD_KEYS.ACCOUNT_TOKEN]: null,
    }, resolve));

    setTimeout(() => { closeModal(); location.reload(); }, 2000);
  } catch (e) {
    errorEl.textContent = e.message;
    errorEl.style.display = 'block';
  }
}

// ── 退出登录 ─────────────────────────────────────────────────────────
async function confirmLogout() {
  if (!confirm('确定要退出登录吗？\n\n退出后需要重新输入账号密码登录。')) return;

  await new Promise(resolve => chrome.storage.local.set({
    [CLOUD_KEYS.CREDENTIALS]: null,
    [CLOUD_KEYS.ACCOUNT_TOKEN]: null,
  }, resolve));
  try { await sendMsg({ type: 'CLOUD_LOGOUT' }); } catch (e) {}
  location.reload();
}

// ── 删除档案 ─────────────────────────────────────────────────────────
async function confirmDeleteProfile() {
  const storage = await new Promise(resolve =>
    chrome.storage.local.get([CLOUD_KEYS.PROFILE_ID], resolve)
  );
  const profileId = storage[CLOUD_KEYS.PROFILE_ID];
  const profile = cloudProfiles.find(p => p.id === profileId);
  if (!profile) return;

  const input = prompt(`危险操作：删除孩子档案「${profile.name}」\n\n此操作不可撤销，将删除所有配置和统计数据。\n请输入孩子名字「${profile.name}」确认：`);
  if (input?.trim() !== profile.name) {
    if (input !== null) alert('名字不匹配，已取消');
    return;
  }

  try {
    const resp = await fetch(`${API_BASE}/profiles/${profileId}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${accountToken}` }
    });
    if (!resp.ok) { const e = await resp.json(); throw new Error(e.error || '删除失败'); }

    // 清除本地绑定信息
    await new Promise(resolve => chrome.storage.local.set({
      [CLOUD_KEYS.DEVICE_TOKEN]: null,
      [CLOUD_KEYS.PROFILE_ID]: null,
      [CLOUD_KEYS.PROFILE_NAME]: null,
      [CLOUD_KEYS.IS_BOUND]: false,
    }, resolve));
    try { await sendMsg({ type: 'CLOUD_LOGOUT' }); } catch (e) {}

    alert(`档案「${profile.name}」已删除`);
    location.reload();
  } catch (e) {
    alert('删除失败：' + e.message);
  }
}

// ── 弹窗工具 ─────────────────────────────────────────────────────────
function createModalOverlay() {
  const existing = document.getElementById('modal-overlay');
  if (existing) existing.remove();
  const overlay = document.createElement('div');
  overlay.id = 'modal-overlay';
  overlay.style.cssText = `position:fixed;inset:0;background:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;z-index:1000;`;
  overlay.addEventListener('click', e => { if (e.target === overlay) closeModal(); });
  return overlay;
}

function closeModal() {
  document.getElementById('modal-overlay')?.remove();
}

window.showEditProfileModal = showEditProfileModal;
window.selectAvatarColor = selectAvatarColor;
window.saveEditProfile = saveEditProfile;
window.showChangePasswordModal = showChangePasswordModal;
window.doChangePassword = doChangePassword;
window.confirmLogout = confirmLogout;
window.confirmDeleteProfile = confirmDeleteProfile;
window.closeModal = closeModal;

// 全局函数（供 HTML onclick 调用）
window.bindToProfile = bindToProfile;
window.forceSync = forceSync;
window.confirmRebind = confirmRebind;

// ── 使用分析页（Stats）────────────────────────────────────────────────────

// 域名匹配（与 background.js 一致）
function matchDomain(domain, pattern) {
  const d = domain.replace(/^www\./, '');
  const p = pattern.replace(/^www\./, '');
  return d === p || d.endsWith('.' + p);
}

function classifyDomain(domain) {
  if ((config.studyList || []).some(p => matchDomain(domain, p))) return 'study';
  if ((config.allowList || []).some(p => matchDomain(domain, p))) return 'allow';
  return 'other';
}

function mergeStatsRange(rangeData) {
  const merged = {};
  for (const dayStats of Object.values(rangeData)) {
    for (const [domain, seconds] of Object.entries(dayStats)) {
      merged[domain] = (merged[domain] || 0) + seconds;
    }
  }
  return merged;
}

function setupStatsPage() {
  document.querySelectorAll('.range-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.range-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      renderStatsPage(btn.dataset.range);
    });
  });
}

async function renderStatsPage(range = 'today') {
  const days   = range === 'month' ? 30 : range === 'week' ? 7 : 1;
  const label  = range === 'month' ? '上月' : range === 'week' ? '上周' : '昨日';

  // 拉取统计数据
  const [rangeData, visitSessions] = await Promise.all([
    sendMsg({ type: 'GET_STATS_RANGE', days }),
    sendMsg({ type: 'GET_VISIT_SESSIONS', days })
  ]);

  const statsData = range === 'today'
    ? (Object.values(rangeData)[Object.keys(rangeData).length - 1] || {})
    : mergeStatsRange(rangeData);

  // 按分类汇总
  let studySeconds = 0, restSeconds = 0, otherSeconds = 0;
  for (const [domain, seconds] of Object.entries(statsData)) {
    const type = classifyDomain(domain);
    if (type === 'study') studySeconds += seconds;
    else if (type === 'allow') otherSeconds += seconds;
    else restSeconds += seconds;
  }
  const totalSeconds = studySeconds + restSeconds + otherSeconds;

  // ── 概览卡片 ────────────────────────────────
  document.getElementById('stat-total-time').textContent  = formatSeconds(totalSeconds);
  document.getElementById('stat-study-time').textContent  = formatSeconds(studySeconds);
  document.getElementById('stat-rest-time').textContent   = formatSeconds(restSeconds);
  document.getElementById('stat-study-percent').textContent =
    totalSeconds > 0 ? Math.round(studySeconds / totalSeconds * 100) + '%' : '0%';
  document.getElementById('stat-rest-percent').textContent  =
    totalSeconds > 0 ? Math.round(restSeconds  / totalSeconds * 100) + '%' : '0%';

  // 对比趋势（昨日 / 上周 / 上月）
  try {
    const prevData = await sendMsg({ type: 'GET_STATS_RANGE', days: days * 2 });
    const allDates  = Object.keys(prevData).sort();
    const prevHalf  = allDates.slice(0, Math.floor(allDates.length / 2));
    const prevTotal = prevHalf.reduce((sum, d) =>
      sum + Object.values(prevData[d] || {}).reduce((a, b) => a + b, 0), 0);
    const trend     = prevTotal > 0 ? Math.round((totalSeconds - prevTotal) / prevTotal * 100) : 0;
    const trendEl   = document.getElementById('stat-total-trend');
    if (trendEl) {
      trendEl.textContent = `比${label} ${trend >= 0 ? '+' : ''}${trend}%`;
      trendEl.style.color = trend > 0 ? 'var(--warn)' : 'var(--green)';
    }
  } catch (_) {}

  // 访问次数 + 平均时长
  document.getElementById('stat-session-count').textContent = visitSessions.length;
  const avgMin = visitSessions.length > 0
    ? Math.round(visitSessions.reduce((a, s) => a + s.duration, 0) / visitSessions.length / 60)
    : 0;
  document.getElementById('stat-avg-duration').textContent = `平均 ${avgMin} 分钟`;

  // ── 热力图 ───────────────────────────────────
  renderHeatmap(visitSessions);

  // ── 饼图 ────────────────────────────────────
  renderTypeChart(studySeconds, restSeconds, otherSeconds);

  // ── TOP 网站 ─────────────────────────────────
  renderTopDomains(statsData, totalSeconds);

  // ── 模式分析 ─────────────────────────────────
  renderPatternAnalysis(visitSessions, studySeconds, totalSeconds);

  // ── 变更日志 ─────────────────────────────────
  await renderChangelog();
}

function renderHeatmap(visitSessions) {
  const container = document.getElementById('time-heatmap');
  if (!container) return;

  // 按小时聚合访问时长
  const hourData = new Array(24).fill(0);
  for (const s of visitSessions) {
    const h = new Date(s.startAt).getHours();
    hourData[h] += s.duration;
  }
  const maxVal = Math.max(...hourData, 1);

  const cells = hourData.map((seconds, h) => {
    const level   = seconds === 0 ? 0 : Math.min(5, Math.ceil(seconds / maxVal * 5));
    const tooltip = `${h}:00  ${formatSeconds(seconds)}`;
    return `<div class="heatmap-cell level-${level}" title="${tooltip}" data-time="${tooltip}"></div>`;
  }).join('');

  const labels = Array.from({ length: 24 }, (_, i) =>
    `<div style="font-size:10px;color:var(--muted);text-align:center;line-height:1;">${i % 6 === 0 ? i + 'h' : ''}</div>`
  ).join('');

  container.innerHTML = `
    <div class="heatmap-grid">${cells}</div>
    <div style="display:grid;grid-template-columns:repeat(24,1fr);gap:2px;margin-top:4px;">${labels}</div>
  `;
}

function renderTypeChart(studySeconds, restSeconds, otherSeconds) {
  const canvas = document.getElementById('typeChart');
  if (!canvas) return;
  const ctx   = canvas.getContext('2d');
  const total = studySeconds + restSeconds + otherSeconds;
  const cx = 100, cy = 100, r = 75, innerR = 48;

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  if (total === 0) {
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    ctx.fill();
    ctx.fillStyle = '#5a5a80';
    ctx.font = '13px -apple-system';
    ctx.textAlign = 'center';
    ctx.fillText('暂无数据', cx, cy + 5);
    return;
  }

  const segments = [
    { value: studySeconds, color: '#4ade80' },
    { value: restSeconds,  color: '#fbbf24' },
    { value: otherSeconds, color: '#5a5a80' },
  ].filter(s => s.value > 0);

  let startAngle = -Math.PI / 2;
  for (const seg of segments) {
    const sweep = (seg.value / total) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, r, startAngle, startAngle + sweep);
    ctx.closePath();
    ctx.fillStyle = seg.color;
    ctx.fill();
    startAngle += sweep;
  }

  // 圆环内洞
  ctx.beginPath();
  ctx.arc(cx, cy, innerR, 0, Math.PI * 2);
  ctx.fillStyle = '#16162a';
  ctx.fill();

  // 中心文字
  const pct = Math.round(studySeconds / total * 100);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#e2e2f0';
  ctx.font = 'bold 18px -apple-system';
  ctx.fillText(pct + '%', cx, cy + 2);
  ctx.font = '11px -apple-system';
  ctx.fillStyle = '#5a5a80';
  ctx.fillText('学习', cx, cy + 18);
}

function renderTopDomains(statsData, totalSeconds) {
  const container = document.getElementById('top-domains-list');
  if (!container) return;

  const entries = Object.entries(statsData)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8);

  if (entries.length === 0) {
    container.innerHTML = '<div style="color:var(--muted);text-align:center;padding:20px;">暂无数据</div>';
    return;
  }

  const maxSeconds = entries[0][1];
  const rankColors = ['top-1', 'top-2', 'top-3'];
  const typeMap    = { study: '学习网站', allow: '允许网站', other: '其他' };
  const barColors  = { study: 'var(--green)', allow: 'var(--accent)', other: 'var(--muted)' };

  container.innerHTML = entries.map(([domain, seconds], i) => {
    const type    = classifyDomain(domain);
    const pct     = Math.round(seconds / maxSeconds * 100);
    const rankCls = rankColors[i] || '';
    return `
      <div class="top-domain-item">
        <div class="domain-rank ${rankCls}">${i + 1}</div>
        <div class="domain-info">
          <div class="domain-name">${domain}</div>
          <div class="domain-type">${typeMap[type]}</div>
        </div>
        <div class="domain-bar">
          <div class="domain-bar-fill" style="width:${pct}%;background:${barColors[type]};"></div>
        </div>
        <div class="domain-time">${formatSeconds(seconds)}</div>
      </div>
    `;
  }).join('');
}

function renderPatternAnalysis(visitSessions, studySeconds, totalSeconds) {
  const container = document.getElementById('pattern-analysis');
  if (!container) return;

  // 最长专注时段
  const longestSession = visitSessions.length > 0
    ? visitSessions.reduce((a, b) => b.duration > a.duration ? b : a)
    : null;
  const longestMin = longestSession ? Math.round(longestSession.duration / 60) : 0;

  // 峰值活跃小时
  const hourData = new Array(24).fill(0);
  for (const s of visitSessions) hourData[new Date(s.startAt).getHours()] += s.duration;
  const peakHour   = hourData.indexOf(Math.max(...hourData));
  const peakLabel  = hourData[peakHour] > 0 ? `${peakHour}:00 — ${peakHour + 1}:00` : '无数据';

  // 学习占比
  const studyPct = totalSeconds > 0 ? Math.round(studySeconds / totalSeconds * 100) : 0;
  const studyGrade = studyPct >= 70 ? '优秀 🎉' : studyPct >= 50 ? '良好 👍' : studyPct >= 30 ? '一般 📖' : '待提升 💪';

  container.innerHTML = `
    <div class="pattern-card">
      <div class="pattern-icon">⏱</div>
      <div class="pattern-title">最长专注时段</div>
      <div class="pattern-value">${longestMin} 分钟</div>
    </div>
    <div class="pattern-card">
      <div class="pattern-icon">🔥</div>
      <div class="pattern-title">最活跃时段</div>
      <div class="pattern-value">${peakLabel}</div>
    </div>
    <div class="pattern-card">
      <div class="pattern-icon">📚</div>
      <div class="pattern-title">学习专注度</div>
      <div class="pattern-value">${studyPct}% · ${studyGrade}</div>
    </div>
  `;
}

async function renderChangelog() {
  const container = document.getElementById('changelog-timeline');
  if (!container) return;

  let logs;
  try { logs = await sendMsg({ type: 'GET_CHANGELOG', limit: 15 }); }
  catch (_) { logs = []; }

  if (!logs || logs.length === 0) {
    container.innerHTML = '<div style="color:var(--muted);text-align:center;padding:20px;">暂无变更记录</div>';
    return;
  }

  const dotClass = (action) => {
    if (action.includes('add') || action.includes('install')) return 'add';
    if (action.includes('remove') || action.includes('delete')) return 'remove';
    if (action.includes('switch') || action.includes('mode')) return 'switch';
    return 'change';
  };

  container.innerHTML = logs.map(entry => `
    <div class="changelog-item">
      <div class="changelog-dot ${dotClass(entry.action)}"></div>
      <div class="changelog-content">
        <div class="changelog-time">${new Date(entry.ts).toLocaleString()}</div>
        <div class="changelog-text">${entry.details || entry.action}</div>
      </div>
    </div>
  `).join('');
}