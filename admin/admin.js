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

// ── Child view gate（Soft Gate）────────────────────────────────────────────
// 当 URL 包含 ?view=stats 时，以只读模式直接进入使用分析，跳过登录/注册/绑定流程
const urlParams = new URLSearchParams(location.search);
const isChildView = urlParams.get('view') === 'stats';

// ── 初始化 ─────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', async () => {
  // 加载本地配置
  config = await sendMsg({ type: 'GET_CONFIG' });

  // 检查绑定状态
  await checkAndHandleBinding();

  setupLoginForm();
  setupNavigation();

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
 * 孩子只读模式入口（Soft Gate）
 * 当 URL 包含 ?view=stats 时直接进入，跳过登录/注册/绑定流程。
 * - 已绑定：直接进入主界面，隐藏家长操作控件
 * - 未绑定：显示简化提示，不暴露登录/注册表单
 */
async function enterChildView() {
  const storage = await new Promise(resolve => {
    chrome.storage.local.get([
      CLOUD_KEYS.DEVICE_TOKEN,
      CLOUD_KEYS.PROFILE_NAME,
      CLOUD_KEYS.PROFILE_ID
    ], resolve);
  });

  const deviceToken = storage[CLOUD_KEYS.DEVICE_TOKEN];
  const profileName = storage[CLOUD_KEYS.PROFILE_NAME];

  if (!deviceToken) {
    // 未绑定：显示简化提示，不暴露登录/注册
    document.getElementById('main-screen').style.display = 'none';
    const loginScreen = document.getElementById('login-screen');
    loginScreen.style.display = 'flex';
    loginScreen.innerHTML = `
      <div class="login-box">
        <div class="login-logo">⏱</div>
        <h1>TimeOnChrome</h1>
        <p style="color:var(--muted);margin-bottom:20px;">设备未绑定</p>
        <div style="font-size:13px;color:var(--muted);line-height:1.6;">
          此设备尚未绑定孩子档案。<br>
          请联系家长完成设备绑定。
        </div>
      </div>
    `;
    return;
  }

  // 已绑定：直接进入主界面只读模式
  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('main-screen').style.display = 'block';

  // 隐藏家长操作控件
  const logoutBtn = document.getElementById('logout-btn');
  if (logoutBtn) logoutBtn.style.display = 'none';
  const userInfo = document.getElementById('user-info');
  if (userInfo) userInfo.style.display = 'none';

  // 侧边栏显示孩子名字
  const sidebarNameEl = document.getElementById('sidebar-child-name');
  if (sidebarNameEl && profileName) sidebarNameEl.textContent = profileName + ' 的面板';

  // 加载配置并渲染使用分析
  config = await sendMsg({ type: 'GET_CONFIG' });
  renderStatsPage();
}

/**
 * 检查绑定状态并处理
 * 核心逻辑：
 * - 未绑定：显示绑定流程（登录→选择孩子→绑定）
 * - 已绑定：自动登录→进入主界面
 */
async function checkAndHandleBinding() {
  if (isChildView) {
    return enterChildView();
  }

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

  // 渲染使用分析
  config = await sendMsg({ type: 'GET_CONFIG' });
  renderStatsPage();
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
      <div class="login-logo">⏱</div>
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
      <div class="login-logo">⏱</div>
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
      
      if (page === 'stats')     renderStatsPage();
      if (page === 'rules')     renderRulesPage();
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

// ── 访问规则页（只读）───────────────────────────────────────────────────────

const QUOTA_DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
const QUOTA_DAY_LABELS = {
  monday: '周一', tuesday: '周二', wednesday: '周三', thursday: '周四',
  friday: '周五', saturday: '周六', sunday: '周日',
};

function normalizeDomainList(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function pickFirstArrayField(source, fields) {
  for (const field of fields) {
    const value = source?.[field];
    if (Array.isArray(value)) return value;
  }
  return [];
}

function renderSiteGroup(containerId, options) {
  const container = document.getElementById(containerId);
  if (!container) return;

  const systemList = normalizeDomainList(options.systemList);
  const customList = normalizeDomainList(options.customList);
  const effectiveList = normalizeDomainList(options.effectiveList);
  const hasHierarchy = systemList.length > 0 || customList.length > 0;

  const renderTagList = (domains, muted) => {
    if (!domains.length) return '<div style="color:var(--muted);font-size:12px;padding:8px 0;">暂无配置</div>';
    return `<div class="domains-container">${domains.map((d) =>
      `<span class="domain-tag" style="cursor:default;${muted ? 'background:rgba(0,184,148,0.04);color:var(--muted);' : ''}">${d}</span>`
    ).join('')}</div>`;
  };

  if (!hasHierarchy) {
    container.innerHTML = renderTagList(effectiveList, false);
    return;
  }

  const collapsibleId = `${containerId}-system-content`;
  const toggleId = `${containerId}-system-toggle`;

  container.innerHTML = `
    <div style="margin-bottom:14px;padding-bottom:14px;border-bottom:1px solid var(--border);">
      <div id="${toggleId}-row" style="display:flex;align-items:center;justify-content:space-between;cursor:pointer;">
        <div style="font-size:12px;font-weight:600;color:var(--muted);">系统配置（只读）</div>
        <button id="${toggleId}" style="background:none;border:none;color:var(--accent);cursor:pointer;font-size:12px;">▼ 展开</button>
      </div>
      <div id="${collapsibleId}" style="display:none;margin-top:8px;">
        ${renderTagList(systemList, true)}
      </div>
    </div>
    <div>
      <div style="font-size:12px;font-weight:600;color:var(--text);margin-bottom:8px;">家长自定义</div>
      ${renderTagList(customList, false)}
    </div>
  `;

  const row = document.getElementById(`${toggleId}-row`);
  const content = document.getElementById(collapsibleId);
  const toggle = document.getElementById(toggleId);
  if (!row || !content || !toggle) return;

  const doToggle = () => {
    if (content.style.display === 'none') {
      content.style.display = 'block';
      toggle.textContent = '▲ 收起';
    } else {
      content.style.display = 'none';
      toggle.textContent = '▼ 展开';
    }
  };
  row.addEventListener('click', doToggle);
  toggle.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    doToggle();
  });
}

function formatQuotaText(minutes) {
  if (minutes === null || minutes === undefined) return '无限制';
  const mins = Number(minutes);
  if (!Number.isFinite(mins) || mins < 0) return '暂无配置';
  if (mins === 0) return '0 分钟';
  if (mins >= 60) {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return m > 0 ? `${h}小时${m}分钟` : `${h}小时`;
  }
  return `${mins}分钟`;
}

function getDailyQuotaByDay(dayKey) {
  const fromTimeQuota = config?.timeQuota?.daily?.[dayKey];
  if (fromTimeQuota) {
    return {
      study: fromTimeQuota.studyMinutes ?? null,
      rest: fromTimeQuota.restMinutes ?? null,
      composite: fromTimeQuota.compositeMinutes ?? null,
    };
  }
  return {
    study: config?.dailyStudyQuota ?? null,
    rest: config?.dailyRestQuota ?? null,
    composite: config?.dailyUndeterminedQuota ?? null,
  };
}

function renderQuotaSection() {
  const quotaDailyEl = document.getElementById('rules-quota-daily-display');
  if (quotaDailyEl) {
    const rows = QUOTA_DAYS.map((day) => {
      const q = getDailyQuotaByDay(day);
      return `
        <div style="display:grid;grid-template-columns:72px 1fr 1fr 1fr;gap:8px;padding:8px 0;border-bottom:1px solid var(--border);">
          <div style="font-size:13px;font-weight:500;">${QUOTA_DAY_LABELS[day]}</div>
          <div style="font-size:12px;">学习：<span style="color:var(--accent);font-weight:600;">${formatQuotaText(q.study)}</span></div>
          <div style="font-size:12px;">休息：<span style="color:var(--accent);font-weight:600;">${formatQuotaText(q.rest)}</span></div>
          <div style="font-size:12px;">综合：<span style="color:var(--accent);font-weight:600;">${formatQuotaText(q.composite)}</span></div>
        </div>
      `;
    }).join('');
    quotaDailyEl.innerHTML = rows || '<div style="color:var(--muted);font-size:12px;padding:8px 0;">暂无配置</div>';
  }

  const domainQuotaEl = document.getElementById('rules-domain-quotas-display');
  if (domainQuotaEl) {
    const entries = Object.entries(config?.domainQuotas || {});
    if (!entries.length) {
      domainQuotaEl.innerHTML = '<div style="color:var(--muted);font-size:12px;padding:8px 0;">暂无配置</div>';
    } else {
      domainQuotaEl.innerHTML = entries.map(([domain, mins]) => `
        <div class="quota-row">
          <div class="quota-label">${domain}</div>
          <span style="color:var(--accent);font-weight:600;">${formatQuotaText(mins)} / 天</span>
        </div>
      `).join('');
    }
  }
}

function formatWindowsLabel(windows) {
  if (windows === null) return '全天允许';
  if (!Array.isArray(windows) || windows.length === 0) return '暂无配置';
  return windows.map((w) => `${w.start || '--:--'} - ${w.end || '--:--'}`).join('，');
}

function computeOnlineWindowsLabel(studyWindows, restWindows) {
  if (studyWindows === null || restWindows === null) return '全天允许';
  if (!Array.isArray(studyWindows) && !Array.isArray(restWindows)) return '暂无配置';
  const merged = [];
  for (const w of (Array.isArray(studyWindows) ? studyWindows : [])) merged.push(w);
  for (const w of (Array.isArray(restWindows) ? restWindows : [])) merged.push(w);
  if (!merged.length) return '暂无配置';
  return merged.map((w) => `${w.start || '--:--'} - ${w.end || '--:--'}`).join('，');
}

function renderScheduleSection() {
  const scheduleEl = document.getElementById('rules-schedule-display');
  if (!scheduleEl) return;

  const hasTimeWindows = !!config?.timeWindows?.daily;
  if (hasTimeWindows) {
    const rows = QUOTA_DAYS.map((day) => {
      const dayCfg = config.timeWindows.daily?.[day] || {};
      const studyLabel = formatWindowsLabel(dayCfg.studyWindows);
      const restLabel = formatWindowsLabel(dayCfg.restWindows);
      const onlineLabel = computeOnlineWindowsLabel(dayCfg.studyWindows, dayCfg.restWindows);
      return `
        <div style="display:grid;grid-template-columns:72px 1fr 1fr 1fr;gap:8px;padding:8px 0;border-bottom:1px solid var(--border);">
          <div style="font-size:13px;font-weight:500;">${QUOTA_DAY_LABELS[day]}</div>
          <div style="font-size:12px;">${studyLabel}</div>
          <div style="font-size:12px;">${restLabel}</div>
          <div style="font-size:12px;color:var(--muted);">${onlineLabel}</div>
        </div>
      `;
    }).join('');
    scheduleEl.innerHTML = `
      <div style="display:grid;grid-template-columns:72px 1fr 1fr 1fr;gap:8px;margin-bottom:8px;">
        <div style="font-size:12px;color:var(--muted);font-weight:600;">星期</div>
        <div style="font-size:12px;color:var(--muted);font-weight:600;">学习时段</div>
        <div style="font-size:12px;color:var(--muted);font-weight:600;">休息时段</div>
        <div style="font-size:12px;color:var(--muted);font-weight:600;">在线时段</div>
      </div>
      ${rows || '<div style="color:var(--muted);font-size:12px;padding:8px 0;">暂无配置</div>'}
    `;
    return;
  }

  const schedule = config?.schedule || null;
  if (!schedule || !Array.isArray(schedule.days)) {
    scheduleEl.innerHTML = '<div style="color:var(--muted);font-size:12px;padding:8px 0;">暂无配置</div>';
    return;
  }

  scheduleEl.innerHTML = DAY_NAMES.map((name, i) => {
    const day = schedule.days[i] || {};
    const online = day.enabled ? `${day.start || '--:--'} - ${day.end || '--:--'}` : '不限制';
    return `
      <div style="display:grid;grid-template-columns:72px 1fr 1fr 1fr;gap:8px;padding:8px 0;border-bottom:1px solid var(--border);">
        <div style="font-size:13px;font-weight:500;">${name}</div>
        <div style="font-size:12px;color:var(--muted);">暂无配置</div>
        <div style="font-size:12px;color:var(--muted);">暂无配置</div>
        <div style="font-size:12px;">${online}</div>
      </div>
    `;
  }).join('');
}

function renderRulesPage() {
  const modeDescEl = document.getElementById('rules-mode-desc');
  if (modeDescEl) {
    modeDescEl.textContent = '当前规则由家长在云端设定，本设备仅展示当前生效规则';
  }

  renderSiteGroup('rules-studylist-display', {
    effectiveList: config?.studyList,
    systemList: pickFirstArrayField(config, [
      'defaultStudySites',
      'defaultStudyList',
      'systemConfiguredStudySites',
      'systemConfiguredStudyList',
    ]),
    customList: config?.customStudyList,
  });
  renderSiteGroup('rules-composite-display', {
    effectiveList: config?.compositeList,
    systemList: pickFirstArrayField(config, [
      'defaultCompositeSites',
      'defaultCompositeList',
      'systemConfiguredCompositeSites',
      'systemConfiguredCompositeList',
    ]),
    customList: config?.customCompositeList,
  });
  renderSiteGroup('rules-restricted-display', {
    effectiveList: config?.restrictedEntertainmentList,
    systemList: pickFirstArrayField(config, [
      'defaultRestrictedEntertainmentSites',
      'defaultRestrictedEntertainmentList',
      'systemConfiguredRestrictedEntertainmentSites',
      'systemConfiguredRestrictedEntertainmentList',
    ]),
    customList: config?.customRestrictedEntertainmentList,
  });
  renderSiteGroup('rules-blocked-display', {
    effectiveList: config?.unsafeList || config?.blacklist,
    systemList: pickFirstArrayField(config, [
      'defaultBlockedSites',
      'defaultUnsafeSites',
      'systemConfiguredBlockedSites',
      'systemConfiguredUnsafeSites',
    ]),
    customList: config?.customBlockedSites,
  });

  renderQuotaSection();
  renderScheduleSection();
}

// ──────────────────────────────────────────────────────────────────────────


async function setupDevicesPage() {
  await renderSyncStatus();
  await renderChangelog();
}


// ── 渲染总览 ─────────────────────────────────────────────────────────────

async function renderModeSwitchCard() {
  const session = await sendMsg({ type: 'GET_SESSION' });
  const mode = session?.currentMode || 'study';
  const labelEl  = document.getElementById('mode-label');
  const descEl   = document.getElementById('mode-desc');
  const studyBtn = document.getElementById('btn-study-mode');
  const restBtn  = document.getElementById('btn-rest-mode');
  if (!labelEl) return;

  // 绑定点击（用 replaceWith 避免重复绑定）
  const newStudy = studyBtn.cloneNode(true);
  const newRest  = restBtn.cloneNode(true);
  studyBtn.replaceWith(newStudy);
  restBtn.replaceWith(newRest);
  newStudy.addEventListener('click', () => switchMode('study'));
  newRest.addEventListener('click',  () => switchMode('rest'));

  if (mode === 'study') {
    labelEl.textContent = '📚 学习模式';
    labelEl.style.color = 'var(--accent)';
    descEl.textContent  = '学习模式，仅允许访问学习网站';
    newStudy.style.cssText = 'padding:8px 16px;border-radius:8px;border:none;font-size:13px;font-weight:600;cursor:pointer;background:rgba(124,111,255,0.2);color:var(--accent);';
    newRest.style.cssText  = 'padding:8px 16px;border-radius:8px;border:1px solid var(--border);font-size:13px;font-weight:600;cursor:pointer;background:transparent;color:var(--muted);';
  } else {
    labelEl.textContent = '☕ 休息模式';
    labelEl.style.color = 'var(--warn)';
    descEl.textContent  = '休息模式，所有网站可访问';
    newStudy.style.cssText = 'padding:8px 16px;border-radius:8px;border:1px solid var(--border);font-size:13px;font-weight:600;cursor:pointer;background:transparent;color:var(--muted);';
    newRest.style.cssText  = 'padding:8px 16px;border-radius:8px;border:none;font-size:13px;font-weight:600;cursor:pointer;background:rgba(251,191,36,0.15);color:var(--warn);';
  }
}

window.switchMode = async (mode) => {
  const type = mode === 'study' ? 'SWITCH_TO_STUDY' : 'SWITCH_TO_REST';
  await sendMsg({ type });
  await renderModeSwitchCard();
};

// ── 使用分析页（双栏布局）──────────────────────────────────────────────────

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

  const rebindBtnHtml = isChildView ? '' : `
    <button onclick="confirmRebind()" style="flex:1; padding:10px; background:transparent; border:1px solid var(--border); border-radius:8px; color:var(--muted); font-size:13px; cursor:pointer;">重新绑定</button>
  `;

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
      ${rebindBtnHtml}
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

// 全局函数（供 HTML onclick 调用）
window.bindToProfile = bindToProfile;
window.forceSync = forceSync;
window.confirmRebind = confirmRebind;

// ── 使用分析页（Stats）────────────────────────────────────────────────────

// 域名匹配（与 background.js 一致）
function matchDomain(domain, pattern) {
  function normalizeHostnameV12(input) {
    if (typeof input !== 'string') return null;
    let raw = input.trim();
    if (!raw) return null;
    raw = raw.toLowerCase().replace(/\.+$/g, '');
    if (!raw) return null;
    try {
      const normalized = new URL('http://' + raw).hostname.toLowerCase().replace(/\.+$/g, '');
      return normalized || null;
    } catch {
      return null;
    }
  }

  const d = normalizeHostnameV12(domain);
  const p = normalizeHostnameV12(pattern);
  if (!d || !p) return false;
  if (d === p) return true;
  if (d.startsWith('www.') && d.slice(4) === p) return true;
  if (p.startsWith('www.') && p.slice(4) === d) return true;
  if (p.startsWith('*.')) {
    const base = p.slice(2);
    if (!base || d === base) return false;
    return d.endsWith('.' + base);
  }
  return false;
}

function classifyDomain(domain) {
  if ((config.studyList || []).some(p => matchDomain(domain, p))) return 'study';
  if ((config.compositeList || []).some(p => matchDomain(domain, p))) return 'composite';
  return 'other';
}

function splitStatsDay(dayStats) {
  const safe = dayStats && typeof dayStats === 'object' ? dayStats : {};
  const audioSeconds = Number(safe.audioSeconds) || 0;
  const pipSeconds = Number(safe.pipSeconds) || 0;
  const domainStats = {};
  for (const [domain, seconds] of Object.entries(safe)) {
    if (domain === 'audioSeconds' || domain === 'backgroundMediaByDomain' || domain === 'pipSeconds' || domain === 'pipByDomain') continue;
    domainStats[domain] = Number(seconds) || 0;
  }
  return { domainStats, audioSeconds, pipSeconds };
}

function mergeStatsRange(rangeData) {
  const merged = {};
  let audioSeconds = 0;
  let pipSeconds = 0;
  for (const dayStats of Object.values(rangeData)) {
    const day = splitStatsDay(dayStats);
    audioSeconds += day.audioSeconds;
    pipSeconds += day.pipSeconds;
    for (const [domain, seconds] of Object.entries(day.domainStats)) {
      merged[domain] = (merged[domain] || 0) + seconds;
    }
  }
  return { domainStats: merged, audioSeconds, pipSeconds };
}

async function renderStatsPage() {
  // 拉取今日和本周数据
  const [
    todayRangeData,
    weekRangeData,
    todaySessions,
    weekSessions,
    weeklyRes
  ] = await Promise.all([
    sendMsg({ type: 'GET_STATS_RANGE', days: 1 }),
    sendMsg({ type: 'GET_STATS_RANGE', days: 7 }),
    sendMsg({ type: 'GET_VISIT_SESSIONS', days: 1 }),
    sendMsg({ type: 'GET_VISIT_SESSIONS', days: 7 }),
    sendMsg({ type: 'GET_WEEKLY_SESSIONS' })
  ]);

  const todayData = splitStatsDay(Object.values(todayRangeData)[Object.keys(todayRangeData).length - 1] || {});
  const weekData  = mergeStatsRange(weekRangeData);

  // ── 设置列标题日期 ──
  const now = new Date();
  const weekNames = ['周日','周一','周二','周三','周四','周五','周六'];
  const todayHeader = document.getElementById('stats-today-header');
  const weekHeader  = document.getElementById('stats-week-header');
  if (todayHeader) todayHeader.innerHTML = `今日 <span class="date-range">${weekNames[now.getDay()]} ${now.getMonth()+1}/${now.getDate()}</span>`;
  if (weekHeader) {
    const start = new Date(now); start.setDate(start.getDate() - 6);
    const end   = new Date(now);
    weekHeader.innerHTML = `本周 <span class="date-range">${start.getMonth()+1}/${start.getDate()} — ${end.getMonth()+1}/${end.getDate()}</span>`;
  }

  // ── 今日总览 ──
  const todayOverview = computeOverview(todayData);
  renderOverviewList('today-overview-list', todayOverview);

  // ── 本周总览 ──
  const weekOverview = computeOverview(weekData);
  renderOverviewList('week-overview-list', weekOverview);

  // ── 今日时间轴 ──
  renderTimeline('today-timeline', todaySessions);

  // ── 本周每日分布 ──
  renderDailyBars('week-daily-bars', weekRangeData);

  // ── 今日网站排行 ──
  renderRankList('today-rank-list', todayData.domainStats, 5);

  // ── 本周网站排行 ──
  renderRankList('week-rank-list', weekData.domainStats, 5);

  // ── 今日待归类 ──
  const todayStr = now.toISOString().slice(0, 10);
  const todayUndetermined = (weeklyRes?.sessions || []).filter(s => s.date === todayStr);
  renderUndeterminedList('today-undetermined-list', todayUndetermined);

  // ── 本周待归类 ──
  renderUndeterminedList('week-undetermined-list', weeklyRes?.sessions || []);
}

function computeOverview(data) {
  const compositeList = config.compositeList || [];
  let online = 0, study = 0, rest = 0, audio = 0, undetermined = 0;
  audio = (Number(data.audioSeconds) || 0) + (Number(data.pipSeconds) || 0);
  for (const [domain, seconds] of Object.entries(data.domainStats || {})) {
    online += seconds;
    const type = classifyDomain(domain);
    if (type === 'study') study += seconds;
    else if (compositeList.some(p => {
      const d = domain.replace(/^www\./, ''), pp = p.replace(/^www\./, '');
      return d === pp || d.endsWith('.' + pp);
    })) undetermined += seconds;
    else rest += seconds;
  }
  return { online, study, rest, audio, undetermined };
}

function renderOverviewList(id, overview) {
  const el = document.getElementById(id);
  if (!el) return;
  const rows = [
    { label: '在线', value: formatSeconds(overview.online) },
    { label: '学习', value: formatSeconds(overview.study) },
    { label: '休息', value: formatSeconds(overview.rest) },
    { label: '后台媒体', value: formatSeconds(overview.audio) },
    { label: '待归类', value: formatSeconds(overview.undetermined) },
  ];
  el.innerHTML = rows.map(r => `
    <div class="overview-row">
      <span class="overview-label">${r.label}</span>
      <span class="overview-value">${r.value}</span>
    </div>
  `).join('');
}

function renderTimeline(id, sessions) {
  const el = document.getElementById(id);
  if (!el) return;

  // 按小时聚合，并标记主要状态
  const hourData = new Array(24).fill(0);
  const hourState = new Array(24).fill(null);
  for (const s of sessions) {
    const h = new Date(s.startAt).getHours();
    hourData[h] += s.duration;
    if (!hourState[h]) hourState[h] = s.state;
    else if (s.state === 'ACTIVE' && hourState[h] !== 'ACTIVE') hourState[h] = 'ACTIVE';
  }
  const maxVal = Math.max(...hourData, 1);

  const stateClass = { ACTIVE: 'study', BACKGROUND_ACTIVE: 'audio', PASSIVE: 'rest' };
  const stateLabel = { ACTIVE: '学习', BACKGROUND_ACTIVE: '后台媒体', PASSIVE: '休息' };

  el.innerHTML = hourData.map((seconds, h) => {
    const pct = Math.round(seconds / maxVal * 100);
    const st = hourState[h];
    const cls = stateClass[st] || 'undetermined';
    const label = seconds > 0 ? `${stateLabel[st] || '待归类'} ${formatSeconds(seconds)}` : '';
    return `
      <div class="timeline-row">
        <div class="timeline-hour">${String(h).padStart(2, '0')}</div>
        <div class="timeline-track">
          ${seconds > 0 ? `<div class="timeline-fill ${cls}" style="width:${pct}%"></div>` : ''}
          ${label ? `<div class="timeline-label">${label}</div>` : ''}
        </div>
      </div>
    `;
  }).join('');
}

function renderDailyBars(id, rangeData) {
  const el = document.getElementById(id);
  if (!el) return;

  const dates = Object.keys(rangeData).sort();
  const days  = [];
  for (const date of dates) {
    const day = splitStatsDay(rangeData[date]);
    let total = 0;
    for (const [domain, seconds] of Object.entries(day.domainStats)) total += seconds;
    days.push({ date, total });
  }
  const maxVal = Math.max(...days.map(d => d.total), 1);

  el.innerHTML = days.map(d => {
    const dateObj = new Date(d.date + 'T00:00:00');
    const dayName = DAY_NAMES[dateObj.getDay()];
    const pct = Math.round(d.total / maxVal * 100);
    return `
      <div class="daily-bar-row">
        <div class="daily-bar-label">${dayName.slice(1)}</div>
        <div class="daily-bar-track">
          <div class="daily-bar-fill" style="width:${pct}%"></div>
        </div>
        <div class="daily-bar-value">${formatSeconds(d.total)}</div>
      </div>
    `;
  }).join('');
}

function renderRankList(id, domainStats, limit) {
  const el = document.getElementById(id);
  if (!el) return;
  const entries = Object.entries(domainStats)
    .filter(([domain]) => domain !== 'audioSeconds' && domain !== 'backgroundMediaByDomain' && domain !== 'pipSeconds' && domain !== 'pipByDomain')
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit);
  if (entries.length === 0) {
    el.innerHTML = '<div style="color:var(--muted);text-align:center;padding:12px;">暂无数据</div>';
    return;
  }
  el.innerHTML = entries.map(([domain, seconds]) => `
    <div class="rank-item">
      <span class="rank-domain">${domain}</span>
      <span class="rank-time">${formatSeconds(seconds)}</span>
    </div>
  `).join('');
}

function renderUndeterminedList(id, sessions) {
  const el = document.getElementById(id);
  if (!el) return;
  const totalMin = Math.round(sessions.reduce((a, s) => a + (s.duration || 0), 0) / 60);
  if (sessions.length === 0) {
    el.innerHTML = '<div style="color:var(--muted);text-align:center;padding:12px;">暂无待归类</div>';
    return;
  }

  const statusMap = {
    study:       { cls: 'study',       text: '学习' },
    rest:        { cls: 'rest',        text: '休息' },
    pending:     { cls: 'pending',     text: '待归类' },
    appealing:   { cls: 'appealing',   text: '待归类' },
  };

  el.innerHTML = `
    <div class="undetermined-summary">共 ${sessions.length} 条 · ${totalMin}分钟</div>
    ${sessions.map(s => {
      const st = statusMap[s.classification] || statusMap[s.appeal_status] || statusMap.pending;
      return `
        <div class="undetermined-item">
          <span class="ud-domain">${escHtml(s.domain)}</span>
          <span class="ud-meta">
            <span class="ud-time">${formatSeconds(s.duration || 0)}</span>
            <span class="ud-status ${st.cls}">${st.text}</span>
          </span>
        </div>
      `;
    }).join('')}
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



function escHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function getAdminEffectiveDailyRestLimit(config) {
  const base   = config.dailyRestQuota ?? 120;
  const borrow = config.quotaBorrow;
  if (!borrow || borrow.repaid) return base;
  const today = new Date().toISOString().slice(0, 10);
  if (today === borrow.borrowedFrom) return base + borrow.amount;
  const repayD = new Date(borrow.borrowedFrom + 'T00:00:00');
  repayD.setDate(repayD.getDate() + 1);
  if (repayD.toISOString().slice(0, 10) === today) return Math.max(0, base - borrow.amount);
  return base;
}
function escAttr(s) {
  return String(s).replace(/"/g,'&quot;');
}
function escId(s) {
  return String(s).replace(/[^a-zA-Z0-9_-]/g,'');
}
