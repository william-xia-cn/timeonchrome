// admin/admin.js - 云端同步版 v2.0
// 完整流程：
// 1. 未绑定 → 登录家长账户 → 选择孩子 → 自动绑定 → 进入主界面
// 2. 已绑定 → 自动登录 → 直接进入主界面
// 3. 绑定后不能退出

import {
  getAdminMediaUsageAnalysisView,
  getAdminMediaSettlementView,
  getAdminSettlementView,
  getAdminUsageAnalysisView,
} from '../stats/admin-read-model.js';
import { buildEffectiveTimeQuota } from '../core/quota-config.js';
import { getPrivacyConsentPageUrl } from '../core/privacy-consent.js';
import { canUseChromeIdentityForAdmin, resolveActivationState } from '../core/activation-gate.js';

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

function getClientPlatform() {
  const raw = (navigator.userAgentData?.platform || navigator.platform || '').toString().toLowerCase();
  if (/mac/.test(raw)) return 'macos';
  if (/win/.test(raw)) return 'windows';
  if (/cros|chromeos/.test(raw)) return 'chromeos';
  if (/linux/.test(raw)) return 'linux';
  return raw || 'unknown';
}

async function getChromeIdentityPayload() {
  try {
    if (!(await canUseChromeIdentityForAdmin())) return {};
    if (!chrome.identity?.getProfileUserInfo) return {};
    const info = await chrome.identity.getProfileUserInfo({ accountStatus: 'ANY' });
    const id = typeof info?.id === 'string' ? info.id.trim() : '';
    if (!id) return {};
    return { chromeIdentityId: id };
  } catch (_) {
    return {};
  }
}

const CLOUD_KEYS = {
  DEVICE_TOKEN: 'cloud_device_token',
  PROFILE_ID: 'cloud_profile_id',
  PROFILE_NAME: 'cloud_profile_name',
  CREDENTIALS: 'cloud_credentials',
  ACCOUNT_TOKEN: 'account_token',
  ACCOUNT_REFRESH_TOKEN: 'account_refresh_token',
  ACCOUNT_EMAIL: 'cloud_account_email',
  REMEMBER_ME: 'cloud_remember_me',
  IS_BOUND: 'cloud_is_bound',  // 标记是否已绑定
  CHROME_IDENTITY_STATUS: 'cloud_chrome_identity_status_v1',
  RECOVERY_STATE: 'cloud_device_recovery_state_v1',
  RECOVERY_REQUEST_ID: 'cloud_device_recovery_request_id',
  PRIVACY_CONSENT: 'privacy_consent_v1'
};

function openPrivacyConsentFromAdmin() {
  chrome.tabs.create({
    url: getPrivacyConsentPageUrl({ reason: 'admin', next: 'admin/admin.html?view=system-management' }),
  });
}

function normalizeEmailInput(value) {
  return String(value || '').trim().toLowerCase();
}

let config = null;
let isAuthenticated = false;
let accountToken = null;
let cloudProfiles = [];
let currentProfileId = null;
let currentEmail = null;
let syncFeedbackTimer = null;
let syncFeedbackState = {
  phase: 'idle', // idle | loading | success | error
  message: ''
};
let adminPageRefreshSeq = 0;
let settlementAnalysisRows = [];
let settlementReconciliation = null;
let settlementAnalysisRange = 'today';
let settlementAnalysisLabel = '今日';
let mediaSettlementRows = [];
let mediaSettlementRange = 'today';
let mediaSettlementLabel = '今日';
let systemManagementActiveTab = 'device-status';
let rulesActiveTab = 'site-management';
let isLocalReadOnlyMode = false;
let usageAnalysisState = {
  ledger: 'web',
  mode: 'day',
  date: null,
  listMode: 'targets',
  query: '',
  detail: null,
};
let usageAnalysisLastView = null;

// ── Child view gate（Soft Gate）────────────────────────────────────────────
// 当 URL 包含 ?view=stats 时，以只读模式直接进入使用分析，跳过登录/注册/绑定流程
const urlParams = new URLSearchParams(location.search);
const isChildView = urlParams.get('view') === 'stats';

// ── 初始化 ─────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', async () => {
  // 登录/导航事件必须先绑定；background 冷启动失败不应让登录入口失效。
  setupLoginForm();
  setupNavigation();
  setupUsageAnalysisControls();

  // 监听后台广播：设备被远程解绑时立即切换到重绑流程
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === 'DEVICE_UNBOUND') {
      console.log('[Admin] Received DEVICE_UNBOUND, switching to rebind flow');
      checkAndHandleBinding();
    }
  });

  try {
    // 加载本地配置
    config = await sendMsg({ type: 'GET_CONFIG' });
  } catch (e) {
    console.warn('[Admin] initial GET_CONFIG failed, keeping login available:', e?.message || e);
    config = {};
  }

  try {
    // 检查绑定状态
    await checkAndHandleBinding();
  } catch (e) {
    console.warn('[Admin] binding check failed, showing login screen:', e?.message || e);
    showBindScreen();
    showError('后台连接中，请稍后重试登录');
  }
});

// ── 绑定状态检查与处理 ───────────────────────────────────────────────────

/**
 * 孩子只读模式入口（Soft Gate）
 * 当 URL 包含 ?view=stats 时直接进入，跳过登录/注册/绑定流程。
 * - 已绑定：直接进入主界面，隐藏家长操作控件
 * - 未绑定：进入本地只读主界面，不要求云端登录/绑定
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
    await enterLocalReadOnlyMode();
    return;
  }

  isLocalReadOnlyMode = false;

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

async function enterLocalReadOnlyMode() {
  isLocalReadOnlyMode = true;
  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('main-screen').style.display = 'block';

  const logoutBtn = document.getElementById('logout-btn');
  if (logoutBtn) logoutBtn.style.display = 'none';
  const userInfo = document.getElementById('user-info');
  if (userInfo) userInfo.style.display = 'none';

  const sidebarNameEl = document.getElementById('sidebar-child-name');
  if (sidebarNameEl) sidebarNameEl.textContent = '本地模式';

  document.querySelectorAll('.nav-item').forEach((item) => {
    const page = item.dataset.page;
    if (page === 'rules') item.style.display = 'none';
    if (page === 'stats') item.classList.add('active');
  });
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById('page-stats')?.classList.add('active');

  config = await sendMsg({ type: 'GET_CONFIG' });
  await renderStatsPage();
}

function openCloudLogin() {
  chrome.tabs.create({ url: chrome.runtime.getURL('admin/admin.html') });
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
      CLOUD_KEYS.ACCOUNT_REFRESH_TOKEN,
      CLOUD_KEYS.ACCOUNT_EMAIL,
      CLOUD_KEYS.PROFILE_ID
    ], resolve);
  });

  const deviceToken = storage[CLOUD_KEYS.DEVICE_TOKEN];
  const credentials = storage[CLOUD_KEYS.CREDENTIALS];
  const savedToken = storage[CLOUD_KEYS.ACCOUNT_TOKEN];
  const refreshToken = storage[CLOUD_KEYS.ACCOUNT_REFRESH_TOKEN];
  const profileId = storage[CLOUD_KEYS.PROFILE_ID];

  if (deviceToken && (savedToken || refreshToken || credentials)) {
    console.log('[Admin] Device is bound, restoring account session...');
    const token = await ensureAccountToken({ allowLegacyCredentials: true });
    if (token) await enterMainScreen();
    else showBindScreen();
  } else if (!deviceToken && (savedToken || refreshToken || credentials)) {
    console.log('[Admin] Account session exists but device token missing, need rebind');
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
    const token = await migrateLegacyCredentials(encryptedCredentials);
    if (!token) {
      // 登录失败，可能是凭据过期，跳转到绑定页面
      console.log('[Admin] Auto login failed, showing bind screen');
      showBindScreen();
      return;
    }

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
    const token = await ensureAccountToken({ allowLegacyCredentials: true });
    if (!token) {
      await chrome.storage.local.remove([CLOUD_KEYS.CREDENTIALS, CLOUD_KEYS.ACCOUNT_TOKEN, CLOUD_KEYS.ACCOUNT_REFRESH_TOKEN]);
      showBindScreen();
      return;
    }

    // 拉取孩子列表
    const profilesResp = await accountFetch(`${API_BASE}/profiles`);
    if (!profilesResp.ok) { showBindScreen(); return; }

    const profilesData = await profilesResp.json();
    cloudProfiles = profilesData.profiles || [];

    // 显示重绑提示页
    const storage = await new Promise(resolve => chrome.storage.local.get([CLOUD_KEYS.ACCOUNT_EMAIL], resolve));
    showRebindScreen(storage[CLOUD_KEYS.ACCOUNT_EMAIL] || currentEmail || '');

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
        当前账户：<strong>${escHtml(email)}</strong>
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

  container.innerHTML = cloudProfiles.map(p => {
    const profileId = escAttr(p?.id || '');
    const profileName = escAttr(p?.name || '');
    const avatarColor = escAttr(normalizeAvatarColor(p?.avatar_color));
    const profileNameText = escHtml(p?.name || '');
    const profileInitial = escHtml(String((p?.name || '?')).charAt(0).toUpperCase());
    return `
    <div class="rebind-profile-card"
         data-profile-id="${profileId}"
         data-profile-name="${profileName}"
         data-avatar-color="${avatarColor}"
         style="display:flex;align-items:center;gap:12px;padding:14px 16px;
                border:1px solid var(--border);border-radius:12px;margin-bottom:10px;
                cursor:pointer;transition:all 0.2s;">
      <div style="width:38px;height:38px;border-radius:50%;background:${avatarColor};
                  display:flex;align-items:center;justify-content:center;color:#fff;font-weight:600;">
        ${profileInitial}
      </div>
      <div>
        <div style="font-weight:600;">${profileNameText}</div>
        <div style="font-size:12px;color:var(--accent);">点击重新绑定此设备</div>
      </div>
    </div>
  `;
  }).join('');

  container.querySelectorAll('.rebind-profile-card').forEach((card) => {
    card.addEventListener('click', () => {
      rebindToProfile(card.dataset.profileId, card.dataset.profileName, card.dataset.avatarColor);
    });
    card.addEventListener('mouseenter', () => {
      card.style.borderColor = 'var(--accent)';
    });
    card.addEventListener('mouseleave', () => {
      card.style.borderColor = 'var(--border)';
    });
  });
}

/**
 * 重新绑定到指定 Profile
 */
async function rebindToProfile(profileId, profileName, avatarColor) {
  const errorEl = document.getElementById('rebind-error');
  try {
    const devName = getDeviceName();
    const identityPayload = await getChromeIdentityPayload();
    const resp = await accountFetch(`${API_BASE}/device/bind`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        profile_id: profileId,
        device_name: devName,
        platform: getClientPlatform(),
        browser: 'Chrome',
        ...identityPayload,
      })
    });

    if (!resp.ok) {
      const err = await resp.json();
      throw new Error(err.error || '绑定失败');
    }

    const bindResult = await resp.json();

    await new Promise(resolve => chrome.storage.local.set({
      [CLOUD_KEYS.DEVICE_TOKEN]: bindResult.device_token,
      cloud_device_id:          bindResult.device_id || null,
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
  isLocalReadOnlyMode = false;
  
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
    const token = await ensureAccountToken({ allowLegacyCredentials: true });
    if (!token) return;

    const resp = await accountFetch(`${API_BASE}/profiles`);
    
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
      const avatarColor = normalizeAvatarColor(boundProfile.avatar_color);
      const profileInitial = escHtml(String((boundProfile.name || '?')).charAt(0).toUpperCase());
      const profileName = escHtml(boundProfile.name || '');
      container.innerHTML = `
        <div style="padding:16px; background:var(--surface); border-radius:12px; border:1px solid var(--accent);">
          <div style="display:flex; align-items:center; gap:12px;">
            <div class="avatar" style="width:40px; height:40px; border-radius:50%; background:${avatarColor}; display:flex; align-items:center; justify-content:center; color:#fff; font-weight:600;">
              ${profileInitial}
            </div>
            <div>
              <div style="font-size:15px; font-weight:600;">${profileName}</div>
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
    const email = normalizeEmailInput(document.getElementById('email-input')?.value);
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
      await saveAccountSession({
        token: result.token,
        refreshToken: result.refreshToken || null,
        email,
      });
      await new Promise(resolve => chrome.storage.local.set({ [CLOUD_KEYS.REMEMBER_ME]: true }, resolve));
      
      // 2. 获取孩子列表
      const profilesResp = await accountFetch(`${API_BASE}/profiles`);
      
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
      <div class="login-logo"><img src="../icons/app-icon.png" alt="TimeOnChrome"></div>
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
  const email = normalizeEmailInput(document.getElementById('reg-email')?.value);
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
    await saveAccountSession({
      token: regResult.token,
      refreshToken: regResult.refreshToken || null,
      email,
    });

    btn.textContent = '创建孩子档案...';

    // Step 2: 创建孩子 Profile
    const profileResp = await accountFetch(`${API_BASE}/profiles`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
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
    const devNameReg = getDeviceName();
    const identityPayload = await getChromeIdentityPayload();
    const bindResp = await accountFetch(`${API_BASE}/device/bind`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        profile_id: newProfileId,
        device_name: devNameReg,
        platform: getClientPlatform(),
        browser: 'Chrome',
        ...identityPayload,
      })
    });

    if (!bindResp.ok) {
      const err = await bindResp.json();
      throw new Error(err.error || '绑定设备失败');
    }

    const bindResult = await bindResp.json();

    // Step 4: 保存绑定信息（含本机设备名，用于"本机"页展示）
    await new Promise(resolve => {
      chrome.storage.local.set({
        [CLOUD_KEYS.DEVICE_TOKEN]: bindResult.device_token,
        cloud_device_id: bindResult.device_id || null,
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
        device_name: devNameReg
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
      <div class="login-logo"><img src="../icons/app-icon.png" alt="TimeOnChrome"></div>
      <h1>TimeOnChrome</h1>
      <p>选择要绑定的孩子</p>
      
      <div id="profile-selector" style="margin: 20px 0;">
        ${cloudProfiles.map(p => {
          const profileId = escAttr(p?.id || '');
          const profileNameAttr = escAttr(p?.name || '');
          const profileNameText = escHtml(p?.name || '');
          const avatarColor = escAttr(normalizeAvatarColor(p?.avatar_color));
          const profileInitial = escHtml(String((p?.name || '?')).charAt(0).toUpperCase());
          return `
          <div class="profile-item" data-id="${profileId}" data-name="${profileNameAttr}" data-color="${avatarColor}"
               style="display:flex; align-items:center; gap:12px; padding:16px; border:1px solid var(--border); border-radius:12px; margin-bottom:12px; cursor:pointer; transition:all 0.2s;">
            <div class="avatar" style="width:40px; height:40px; border-radius:50%; background:${avatarColor}; display:flex; align-items:center; justify-content:center; color:#fff; font-weight:600;">
              ${profileInitial}
            </div>
            <div style="font-size:15px; font-weight:600;">${profileNameText}</div>
          </div>
        `;
        }).join('')}
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
    const devNameBind = getDeviceName();
    const identityPayload = await getChromeIdentityPayload();
    const resp = await accountFetch(`${API_BASE}/device/bind`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        profile_id: profileId,
        device_name: devNameBind,
        platform: getClientPlatform(),
        browser: 'Chrome',
        ...identityPayload,
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
    await new Promise(resolve => {
      chrome.storage.local.set({
        [CLOUD_KEYS.DEVICE_TOKEN]: bindResult.device_token,
        cloud_device_id: bindResult.device_id || null,
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
        device_name: devNameBind
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
  const attempts = 2;
  const timeoutMs = 2500;
  const sendOnce = () => new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new Error('background_timeout'));
    }, timeoutMs);
    chrome.runtime.sendMessage(msg, (resp) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else if (resp && resp.error) {
        reject(new Error(resp.error));
      } else {
        resolve(resp);
      }
    });
  });

  return (async () => {
    let lastError = null;
    for (let i = 0; i < attempts; i++) {
      try {
        return await sendOnce();
      } catch (error) {
        lastError = error;
        if (i < attempts - 1) {
          await new Promise(resolve => setTimeout(resolve, 180));
        }
      }
    }
    throw lastError || new Error('background_unavailable');
  })();
}

async function saveAccountSession({ token, refreshToken, email }) {
  const updates = {
    [CLOUD_KEYS.CREDENTIALS]: null,
  };
  if (token) updates[CLOUD_KEYS.ACCOUNT_TOKEN] = token;
  if (refreshToken) updates[CLOUD_KEYS.ACCOUNT_REFRESH_TOKEN] = refreshToken;
  if (email) updates[CLOUD_KEYS.ACCOUNT_EMAIL] = String(email).trim().toLowerCase();
  await new Promise(resolve => chrome.storage.local.set(updates, resolve));
  if (token) accountToken = token;
  if (email) currentEmail = String(email).trim().toLowerCase();
  return token || null;
}

async function refreshAccountSession(refreshToken) {
  if (!refreshToken) return null;
  const resp = await fetch(`${API_BASE}/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken })
  });
  if (!resp.ok) return null;
  const result = await resp.json();
  return saveAccountSession({
    token: result.token,
    refreshToken: result.refreshToken || refreshToken,
  });
}

async function migrateLegacyCredentials(encryptedCredentials) {
  if (!encryptedCredentials) return null;
  try {
    const decoded = atob(encryptedCredentials);
    const [email, password] = decoded.split(':');
    if (!email || !password) return null;
    const resp = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    if (!resp.ok) return null;
    const result = await resp.json();
    return saveAccountSession({
      token: result.token,
      refreshToken: result.refreshToken || null,
      email,
    });
  } catch (e) {
    console.warn('[Admin] legacy credential migration failed:', e?.message || e);
    return null;
  }
}

function isAccountTokenLikelyExpired(token) {
  try {
    const body = String(token || '').split('.')[1];
    if (!body) return false;
    const json = JSON.parse(atob(body.replace(/-/g, '+').replace(/_/g, '/')));
    return Number(json?.exp || 0) > 0 && Number(json.exp) <= Math.floor(Date.now() / 1000);
  } catch (_) {
    return false;
  }
}

async function ensureAccountToken({ allowLegacyCredentials = true } = {}) {
  const storage = await new Promise(resolve => {
    chrome.storage.local.get([
      CLOUD_KEYS.ACCOUNT_TOKEN,
      CLOUD_KEYS.ACCOUNT_REFRESH_TOKEN,
      CLOUD_KEYS.CREDENTIALS,
    ], resolve);
  });
  if (storage[CLOUD_KEYS.ACCOUNT_TOKEN] && !isAccountTokenLikelyExpired(storage[CLOUD_KEYS.ACCOUNT_TOKEN])) {
    accountToken = storage[CLOUD_KEYS.ACCOUNT_TOKEN];
    return accountToken;
  }
  const refreshed = await refreshAccountSession(storage[CLOUD_KEYS.ACCOUNT_REFRESH_TOKEN]);
  if (refreshed) return refreshed;
  if (allowLegacyCredentials) {
    return migrateLegacyCredentials(storage[CLOUD_KEYS.CREDENTIALS]);
  }
  return null;
}

async function accountFetch(url, options = {}) {
  const buildOptions = () => ({
    ...options,
    headers: {
      ...(options.headers || {}),
      ...(accountToken ? { Authorization: `Bearer ${accountToken}` } : {}),
    },
  });

  await ensureAccountToken({ allowLegacyCredentials: true });
  let resp = await fetch(url, buildOptions());
  if (resp.status === 401) {
    const storage = await new Promise(resolve => chrome.storage.local.get(CLOUD_KEYS.ACCOUNT_REFRESH_TOKEN, resolve));
    const refreshed = await refreshAccountSession(storage[CLOUD_KEYS.ACCOUNT_REFRESH_TOKEN]);
    if (refreshed) resp = await fetch(url, buildOptions());
  }
  return resp;
}

// ── 路由处理 ─────────────────────────────────────────────────────────────

function setRulesPageError(message) {
  const safeMessage = escHtml(message || '加载失败，请稍后重试');
  const modeDescEl = document.getElementById('rules-mode-desc');
  if (modeDescEl) {
    modeDescEl.textContent = `规则加载失败：${safeMessage}`;
  }
  [
    'rules-studylist-display',
    'rules-composite-display',
    'rules-restricted-display',
    'rules-blocked-display',
    'rules-quota-daily-display',
    'rules-domain-quotas-display',
    'rules-schedule-display',
    'rules-temporary-composite-display',
  ].forEach((id) => {
    const el = document.getElementById(id);
    if (el) {
      el.innerHTML = `<div style="color:var(--danger);font-size:12px;padding:8px 0;">${safeMessage}</div>`;
    }
  });
}

function setStatsPageError(message) {
  const safeMessage = escHtml(message || '加载失败，请稍后重试');
  const totalEl = document.getElementById('usage-analysis-total');
  if (totalEl) totalEl.textContent = '—';
  const syncLabel = document.getElementById('usage-analysis-sync-label');
  if (syncLabel) syncLabel.textContent = '本机数据：暂时不可用';
  const chartIds = ['usage-analysis-week-chart', 'usage-analysis-main-chart'];
  chartIds.forEach((id) => {
    const el = document.getElementById(id);
    if (el) {
      el.innerHTML = `<div class="usage-empty" style="color:var(--danger);">${safeMessage}</div>`;
    }
  });
  const tableEl = document.getElementById('usage-analysis-table-wrap');
  if (tableEl) {
    tableEl.innerHTML = `<div class="usage-empty" style="color:var(--danger);">${safeMessage}</div>`;
  }
  const detailEl = document.getElementById('usage-analysis-detail');
  if (detailEl) {
    detailEl.className = 'usage-detail-panel';
    detailEl.innerHTML = '';
  }
}

function setSettlementsPageError(message) {
  const safeMessage = escHtml(message || '加载失败，请稍后重试');
  const summaryEl = document.getElementById('settlement-summary');
  if (summaryEl) {
    summaryEl.innerHTML = `<span style="color:var(--danger);">${safeMessage}</span>`;
  }
  const reconciliationEl = document.getElementById('settlement-reconciliation-summary');
  if (reconciliationEl) {
    reconciliationEl.innerHTML = `<span style="color:var(--danger);">${safeMessage}</span>`;
  }
  const tableEl = document.getElementById('settlement-table-wrap');
  if (tableEl) {
    tableEl.innerHTML = `<div style="color:var(--danger);text-align:center;padding:16px;">${safeMessage}</div>`;
  }
}

function setMediaSettlementsPageError(message) {
  const safeMessage = escHtml(message || '加载失败，请稍后重试');
  const summaryEl = document.getElementById('media-settlement-summary');
  if (summaryEl) {
    summaryEl.innerHTML = `<span style="color:var(--danger);">${safeMessage}</span>`;
  }
  const tableEl = document.getElementById('media-settlement-table-wrap');
  if (tableEl) {
    tableEl.innerHTML = `<div style="color:var(--danger);text-align:center;padding:16px;">${safeMessage}</div>`;
  }
}

function setDevicesPageError(message) {
  const safeMessage = escHtml(message || '加载失败，请稍后重试');
  const syncEl = document.getElementById('sync-status');
  if (syncEl) {
    syncEl.innerHTML = `<div style="color:var(--danger);font-size:12px;padding:8px 0;">${safeMessage}</div>`;
  }
  const changelogEl = document.getElementById('changelog-timeline');
  if (changelogEl) {
    changelogEl.innerHTML = `<div style="color:var(--danger);text-align:center;padding:20px;">${safeMessage}</div>`;
  }
}

function setClientLogsPageError(message) {
  const safeMessage = escHtml(message || '加载失败，请稍后重试');
  const summaryEl = document.getElementById('client-log-summary');
  if (summaryEl) summaryEl.innerHTML = `<span style="color:var(--danger);">${safeMessage}</span>`;
  const tableEl = document.getElementById('client-log-table-wrap');
  if (tableEl) tableEl.innerHTML = `<div style="color:var(--danger);text-align:center;padding:16px;">${safeMessage}</div>`;
}

function syncRulesTabs() {
  document.querySelectorAll('[data-rules-tab]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.rulesTab === rulesActiveTab);
  });
  document.querySelectorAll('[data-rules-panel]').forEach(panel => {
    panel.classList.toggle('active', panel.dataset.rulesPanel === rulesActiveTab);
  });
}

function syncSystemManagementTabs() {
  document.querySelectorAll('[data-system-management-tab]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.systemManagementTab === systemManagementActiveTab);
  });
  document.querySelectorAll('[data-system-management-panel]').forEach(panel => {
    panel.classList.toggle('active', panel.dataset.systemManagementPanel === systemManagementActiveTab);
  });
}

async function renderSystemManagementPage() {
  syncSystemManagementTabs();
  if (systemManagementActiveTab === 'device-status') {
    await setupDevicesPage();
  } else if (systemManagementActiveTab === 'web-settlements') {
    await renderSettlementsPage();
  } else if (systemManagementActiveTab === 'media-settlements') {
    await renderMediaSettlementsPage();
  } else if (systemManagementActiveTab === 'client-logs') {
    await renderClientLogsPage();
  }
}

function setSystemManagementPageError(message) {
  if (systemManagementActiveTab === 'device-status') setDevicesPageError(message);
  else if (systemManagementActiveTab === 'web-settlements') setSettlementsPageError(message);
  else if (systemManagementActiveTab === 'media-settlements') setMediaSettlementsPageError(message);
  else if (systemManagementActiveTab === 'client-logs') setClientLogsPageError(message);
}

function isLatestAdminRefreshRequest(requestSeq) {
  return requestSeq === adminPageRefreshSeq;
}

async function refreshPageByNav(page, requestSeq) {
  try {
    if (isLocalReadOnlyMode && page === 'rules') {
      return;
    }
    if (page === 'rules') {
      config = await sendMsg({ type: 'GET_CONFIG' });
      if (!isLatestAdminRefreshRequest(requestSeq)) return;
      renderRulesPage();
      return;
    }
    if (page === 'stats') {
      config = await sendMsg({ type: 'GET_CONFIG' });
      if (!isLatestAdminRefreshRequest(requestSeq)) return;
      await renderStatsPage();
      return;
    }
    if (page === 'system-management') {
      await renderSystemManagementPage();
      return;
    }
    if (page === 'devices') {
      await setupDevicesPage();
      return;
    }
    if (page === 'client-logs') {
      await renderClientLogsPage();
    }
  } catch (error) {
    if (!isLatestAdminRefreshRequest(requestSeq)) return;
    const message = error?.message || '未知错误';
    if (page === 'rules') setRulesPageError(message);
    else if (page === 'stats') setStatsPageError(message);
    else if (page === 'system-management') setSystemManagementPageError(message);
    else if (page === 'devices') setDevicesPageError(message);
    else if (page === 'client-logs') setClientLogsPageError(message);
  }
}

function setupNavigation() {
  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', async () => {
      const page = item.dataset.page;
      if (!page) return;
      
      document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
      item.classList.add('active');
      
      document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
      document.getElementById(`page-${page}`)?.classList.add('active');

      const requestSeq = ++adminPageRefreshSeq;
      await refreshPageByNav(page, requestSeq);
    });
  });
  document.querySelectorAll('[data-system-management-tab]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const tab = btn.dataset.systemManagementTab || 'device-status';
      systemManagementActiveTab = tab;
      const navItem = document.querySelector('.nav-item[data-page="system-management"]');
      if (navItem && !navItem.classList.contains('active')) {
        document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
        navItem.classList.add('active');
        document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
        document.getElementById('page-system-management')?.classList.add('active');
      }
      const requestSeq = ++adminPageRefreshSeq;
      await refreshPageByNav('system-management', requestSeq);
    });
  });
  document.querySelectorAll('[data-rules-tab]').forEach(btn => {
    btn.addEventListener('click', () => {
      rulesActiveTab = btn.dataset.rulesTab || 'site-management';
      const navItem = document.querySelector('.nav-item[data-page="rules"]');
      if (navItem && !navItem.classList.contains('active')) {
        document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
        navItem.classList.add('active');
        document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
        document.getElementById('page-rules')?.classList.add('active');
      }
      syncRulesTabs();
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
    `<span class="domain-tag" style="cursor:default;">${escHtml(d)}</span>`
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
  const targetRules = Array.isArray(options.targetRules) ? options.targetRules : [];
  const hasHierarchy = systemList.length > 0 || customList.length > 0 || targetRules.length > 0;

  const renderTagList = (domains, muted) => {
    if (!domains.length) return '<div style="color:var(--muted);font-size:12px;padding:8px 0;">暂无配置</div>';
    return `<div class="domains-container">${domains.map((d) =>
      `<span class="domain-tag" style="cursor:default;${muted ? 'background:rgba(0,184,148,0.04);color:var(--muted);' : ''}">${escHtml(d)}</span>`
    ).join('')}</div>`;
  };

  const renderTargetRules = (rules) => {
    const uniqueRules = uniqueSiteRules(rules);
    if (!uniqueRules.length) return '';
    const title = options.targetRuleTitle || '已批准精确链接';
    return `
      <div style="margin-top:14px;padding-top:14px;border-top:1px solid var(--border);">
        <div style="font-size:12px;font-weight:600;color:var(--text);margin-bottom:8px;">${escHtml(title)}</div>
        <div class="domains-container">${uniqueRules.map((rule) => {
          const value = siteRuleValue(rule);
          const type = siteRuleTypeLabel(rule);
          return `<span class="domain-tag" title="${escAttr(value)}" style="cursor:default;max-width:100%;white-space:normal;line-height:1.35;">${escHtml(type)}：${escHtml(value)}</span>`;
        }).join('')}</div>
      </div>
    `;
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
    ${renderTargetRules(targetRules)}
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
  if (minutes === null) return '无限制';
  if (minutes === undefined) return '暂无配置';
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
  const daily = buildEffectiveTimeQuota(config || {}).daily;
  const fromTimeQuota = daily?.[dayKey];
  return {
    study: fromTimeQuota?.studyMinutes,
    rest: fromTimeQuota?.restMinutes,
    composite: fromTimeQuota?.compositeMinutes,
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
          <div style="font-size:12px;">待归类：<span style="color:var(--accent);font-weight:600;">${formatQuotaText(q.composite)}</span></div>
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
          <div class="quota-label">${escHtml(domain)}</div>
          <span style="color:var(--accent);font-weight:600;">${formatQuotaText(mins)} / 天</span>
        </div>
      `).join('');
    }
  }
}

function formatWindowsLabel(windows) {
  if (windows === null || windows === undefined) return '全天允许';
  if (!Array.isArray(windows) || windows.length === 0) return '全天允许';
  return windows.map((w) => {
    const start = escHtml(w?.start || '--:--');
    const end = escHtml(w?.end || '--:--');
    return `${start} - ${end}`;
  }).join('，');
}

function computeOnlineWindowsLabel(studyWindows, compositeWindows, restWindows) {
  if (
    studyWindows === null || studyWindows === undefined || !Array.isArray(studyWindows) || studyWindows.length === 0 ||
    compositeWindows === null || compositeWindows === undefined || !Array.isArray(compositeWindows) || compositeWindows.length === 0 ||
    restWindows === null || restWindows === undefined || !Array.isArray(restWindows) || restWindows.length === 0
  ) return '全天允许';
  const merged = [];
  for (const w of (Array.isArray(studyWindows) ? studyWindows : [])) merged.push(w);
  for (const w of (Array.isArray(compositeWindows) ? compositeWindows : [])) merged.push(w);
  for (const w of (Array.isArray(restWindows) ? restWindows : [])) merged.push(w);
  return merged.map((w) => {
    const start = escHtml(w?.start || '--:--');
    const end = escHtml(w?.end || '--:--');
    return `${start} - ${end}`;
  }).join('，');
}

function renderScheduleSection() {
  const scheduleEl = document.getElementById('rules-schedule-display');
  if (!scheduleEl) return;

  const hasTimeWindows = !!config?.timeWindows?.daily;
  if (hasTimeWindows) {
    const rows = QUOTA_DAYS.map((day) => {
      const dayCfg = config.timeWindows.daily?.[day] || {};
      const studyLabel = formatWindowsLabel(dayCfg.studyWindows);
      const compositeLabel = formatWindowsLabel(dayCfg.compositeWindows);
      const restLabel = formatWindowsLabel(dayCfg.restWindows);
      const onlineLabel = computeOnlineWindowsLabel(dayCfg.studyWindows, dayCfg.compositeWindows, dayCfg.restWindows);
      return `
        <div style="display:grid;grid-template-columns:72px 1fr 1fr 1fr 1fr;gap:8px;padding:8px 0;border-bottom:1px solid var(--border);">
          <div style="font-size:13px;font-weight:500;">${QUOTA_DAY_LABELS[day]}</div>
          <div style="font-size:12px;">${studyLabel}</div>
          <div style="font-size:12px;">${compositeLabel}</div>
          <div style="font-size:12px;">${restLabel}</div>
          <div style="font-size:12px;color:var(--muted);">${onlineLabel}</div>
        </div>
      `;
    }).join('');
    scheduleEl.innerHTML = `
      <div style="display:grid;grid-template-columns:72px 1fr 1fr 1fr 1fr;gap:8px;margin-bottom:8px;">
        <div style="font-size:12px;color:var(--muted);font-weight:600;">星期</div>
        <div style="font-size:12px;color:var(--muted);font-weight:600;">学习时段</div>
        <div style="font-size:12px;color:var(--muted);font-weight:600;">复合时段</div>
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
    const online = day.enabled
      ? `${escHtml(day?.start || '--:--')} - ${escHtml(day?.end || '--:--')}`
      : '不限制';
    return `
      <div style="display:grid;grid-template-columns:72px 1fr 1fr 1fr 1fr;gap:8px;padding:8px 0;border-bottom:1px solid var(--border);">
        <div style="font-size:13px;font-weight:500;">${name}</div>
        <div style="font-size:12px;color:var(--muted);">暂无配置</div>
        <div style="font-size:12px;color:var(--muted);">暂无配置</div>
        <div style="font-size:12px;color:var(--muted);">暂无配置</div>
        <div style="font-size:12px;">${online}</div>
      </div>
    `;
  }).join('');
}

function formatRulesDateTime(ms) {
  const value = Number(ms);
  if (!Number.isFinite(value) || value <= 0) return '—';
  return new Date(value).toLocaleString();
}

function siteRequestStatusLabel(status) {
  if (status === 'pending') return '待审批';
  if (status === 'returned') return '已退回';
  if (status === 'approved_study') return '已批准为学习';
  if (status === 'approved_composite') return '已批准为复合';
  if (status === 'rejected') return '已归为受限娱乐';
  return status || '未知';
}

function siteRequestTypeLabel(type) {
  return type === 'url' ? '精确链接' : '域名/子域名';
}

function siteRuleDecision(rule = {}) {
  const decision = String(rule.decision || rule.classification || rule.status || '').trim();
  if (decision === 'study' || decision === 'approved_study') return 'study';
  if (decision === 'composite' || decision === 'approved_composite') return 'composite';
  if (decision === 'reject' || decision === 'rejected') return 'reject';
  return null;
}

function siteRuleValue(rule = {}) {
  return canonicalDisplayUrlValue(rule.normalizedValue || rule.targetValue || rule.decisionNormalizedValue || rule.requestedNormalizedValue || rule.value || '—');
}

function canonicalDisplayUrlValue(value) {
  const raw = String(value || '').trim();
  if (!/^https?:\/\//i.test(raw)) return raw;
  try {
    const parsed = new URL(raw);
    const host = normalizeHostname(parsed.hostname);
    const bareHost = host?.startsWith('www.') ? host.slice(4) : host;
    const playlistId = String(parsed.searchParams.get('list') || '').trim().replace(/[^a-zA-Z0-9_-]/g, '');
    if (playlistId && (host === 'youtube.com' || host?.endsWith('.youtube.com') || bareHost === 'youtu.be')) {
      return `https://www.youtube.com/playlist?list=${playlistId}`;
    }
    const videoId = String(parsed.searchParams.get('v') || '').trim().replace(/[^a-zA-Z0-9_-]/g, '');
    if (videoId && parsed.pathname === '/watch' && (host === 'youtube.com' || host?.endsWith('.youtube.com'))) {
      return `https://www.youtube.com/watch?v=${videoId}`;
    }
    return raw;
  } catch (_) {
    return raw;
  }
}

function siteRuleTypeLabel(rule = {}) {
  const value = siteRuleValue(rule);
  if (/^https:\/\/www\.youtube\.com\/playlist\?list=/i.test(value)) return 'YouTube 播放列表';
  if (/^https:\/\/www\.youtube\.com\/watch\?v=/i.test(value)) return 'YouTube 视频';
  return '精确链接';
}

function uniqueSiteRules(rules = []) {
  const seen = new Set();
  const out = [];
  for (const rule of Array.isArray(rules) ? rules : []) {
    const targetType = rule?.targetType || rule?.type || rule?.decisionTargetType || rule?.requestedTargetType || 'url';
    const decision = siteRuleDecision(rule) || 'unknown';
    const value = siteRuleValue(rule);
    const key = `${decision}::${targetType}::${value}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(rule);
  }
  return out;
}

function approvedUrlRulesForDecision(decision) {
  return uniqueSiteRules((Array.isArray(config?.siteClassificationRulesV1) ? config.siteClassificationRulesV1 : [])
    .filter((rule) => (rule.targetType || rule.type || rule.decisionTargetType || rule.requestedTargetType) === 'url')
    .filter((rule) => siteRuleDecision(rule) === decision));
}

function siteClassificationRecordTypeLabel(record = {}) {
  if (record.requestedClassification === 'study') return '学习网站归类申请';
  if (!record.recordSource || record.recordSource === 'legacy') return '历史网站归类记录';
  return '未归类网站访问记录';
}

function siteClassificationObservationSummary(record = {}) {
  const count = Math.max(0, Number(record.observationCount || 0));
  if (!record.firstObservedAt && !record.lastObservedAt && count === 0) return '暂无访问概况';
  const first = formatRulesDateTime(record.firstObservedAt);
  const last = formatRulesDateTime(record.lastObservedAt);
  return `首次 ${first}<br>最近 ${last}<br>顶层导航 ${count} 次`;
}

function renderSiteClassificationRequestRecords(records) {
  const el = document.getElementById('rules-temporary-composite-display');
  if (!el) return;
  const list = Array.isArray(records) ? records : [];
  if (list.length === 0) {
    el.innerHTML = '<div style="color:var(--muted);font-size:12px;padding:8px 0;">暂无网站归类记录</div>';
    return;
  }
  el.innerHTML = `
    <div style="overflow-x:auto;">
      <table class="settlement-table site-request-target-table">
        <thead>
          <tr>
            <th class="site-request-col-object">对象</th>
            <th class="site-request-col-type">记录类型</th>
            <th class="site-request-col-status">状态</th>
            <th class="site-request-col-observation">访问概况</th>
            <th class="site-request-col-time">申请/记录时间</th>
          </tr>
        </thead>
        <tbody>
          ${list.map((record) => {
            const targetValue = record.decisionNormalizedValue || record.displayValue || record.requestedNormalizedValue || '—';
            const recordType = siteClassificationRecordTypeLabel(record);
            const targetType = siteRequestTypeLabel(record.requestedTargetType);
            const timestamp = record.requestedClassification === 'study'
              ? record.manualRequestedAt || record.requestedAt || record.createdAt
              : record.requestedAt || record.createdAt;
            return `
            <tr>
              <td class="site-request-target-cell" title="${escAttr(targetValue)}">${escHtml(targetValue)}</td>
              <td class="site-request-type-cell">${escHtml(recordType)}<br><span style="color:var(--muted);">${escHtml(targetType)}</span></td>
              <td class="site-request-status-cell">${escHtml(siteRequestStatusLabel(record.status))}</td>
              <td class="site-request-observation-cell">${siteClassificationObservationSummary(record)}</td>
              <td class="site-request-time-cell">${escHtml(formatRulesDateTime(timestamp))}</td>
            </tr>
          `;}).join('')}
        </tbody>
      </table>
    </div>
  `;
}
async function renderSiteClassificationRequestSection() {
  const el = document.getElementById('rules-temporary-composite-display');
  if (!el) return;
  el.textContent = '加载中...';
  try {
    const payload = await sendMsg({ type: 'GET_SITE_CLASSIFICATION_REQUESTS', status: 'all' });
    renderSiteClassificationRequestRecords(payload?.records || []);
  } catch (error) {
    el.innerHTML = `<div style="color:var(--danger);font-size:12px;padding:8px 0;">${escHtml(error?.message || '加载失败')}</div>`;
  }
}

function renderRulesPage() {
  syncRulesTabs();

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
    targetRules: approvedUrlRulesForDecision('study'),
    targetRuleTitle: '已批准学习精确链接',
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
    targetRules: approvedUrlRulesForDecision('composite'),
    targetRuleTitle: '已批准复合精确链接',
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
    targetRules: approvedUrlRulesForDecision('reject'),
    targetRuleTitle: '受限娱乐精确链接',
  });
  renderSiteGroup('rules-blocked-display', {
    effectiveList: config?.unsafeList || config?.blacklist,
    systemList: pickFirstArrayField(config, [
      'defaultBlockedSites',
      'defaultBlockedList',
      'defaultUnsafeSites',
      'defaultUnsafeList',
      'systemConfiguredBlockedSites',
      'systemConfiguredBlockedList',
      'systemConfiguredUnsafeSites',
      'systemConfiguredUnsafeList',
    ]),
    customList: config?.customBlockedSites,
  });

  renderQuotaSection();
  renderScheduleSection();
  renderSiteClassificationRequestSection();
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
    labelEl.innerHTML = '<img class="toc-ui-icon small" src="../icons/ui/study.svg" alt="">学习模式';
    labelEl.style.color = 'var(--accent)';
    descEl.textContent  = '学习模式，仅允许访问学习网站';
    newStudy.style.cssText = 'padding:8px 16px;border-radius:8px;border:none;font-size:13px;font-weight:600;cursor:pointer;background:rgba(124,111,255,0.2);color:var(--accent);';
    newRest.style.cssText  = 'padding:8px 16px;border-radius:8px;border:1px solid var(--border);font-size:13px;font-weight:600;cursor:pointer;background:transparent;color:var(--muted);';
  } else {
    labelEl.innerHTML = '<img class="toc-ui-icon small" src="../icons/ui/rest.svg" alt="">休息模式';
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
      CLOUD_KEYS.CREDENTIALS,
      CLOUD_KEYS.PROFILE_ID,
      CLOUD_KEYS.PROFILE_NAME,
      CLOUD_KEYS.ACCOUNT_TOKEN,
      CLOUD_KEYS.ACCOUNT_EMAIL,
      'cloud_last_sync',
      'cloud_config_version',
      'cloud_device_name',
      'cloud_device_id',
      'cloud_connection_state_v1',
      CLOUD_KEYS.CHROME_IDENTITY_STATUS,
      CLOUD_KEYS.RECOVERY_STATE,
      CLOUD_KEYS.RECOVERY_REQUEST_ID,
      CLOUD_KEYS.PRIVACY_CONSENT,
    ], resolve);
  });

  const container = document.getElementById('sync-status');
  if (!container) return;
  const privacyConsentRecord = storage[CLOUD_KEYS.PRIVACY_CONSENT] || null;
  const privacyConsentAccepted = privacyConsentRecord?.accepted === true && privacyConsentRecord?.policyVersion === '2026-06-22';
  const activationState = await resolveActivationState().catch(() => ({ activated: privacyConsentAccepted, activationMode: privacyConsentAccepted ? 'user_consent' : 'disabled', reason: privacyConsentAccepted ? null : 'activation_check_failed' }));
  const activationActive = activationState.activated === true;
  const activationModeText = activationState.activationMode === 'managed_policy'
    ? '受管理策略启用'
    : (activationState.activationMode === 'user_consent' ? '用户同意启用' : '未启用');
  const activationDetailText = activationState.activationMode === 'managed_policy'
    ? '受管终端：' + (activationState.managedPolicy?.managedDeviceLabel || '—') + ' · Device Token：' + (activationState.managedPolicy?.managedDeviceToken ? '已配置' : '未配置')
    : (activationState.reason || '—');

  // 本机设备名（首次绑定时保存的）
  const deviceName = escHtml(storage['cloud_device_name'] || '本机');
  const credentials = storage[CLOUD_KEYS.CREDENTIALS] || '';
  let decodedEmail = storage[CLOUD_KEYS.ACCOUNT_EMAIL] || currentEmail || '';
  if (credentials) {
    try {
      decodedEmail = atob(credentials).split(':')[0] || decodedEmail;
    } catch (_) {
      decodedEmail = currentEmail || '';
    }
  }
  const accountEmail = escHtml(decodedEmail || '—');
  const profileName = escHtml(storage[CLOUD_KEYS.PROFILE_NAME] || (storage[CLOUD_KEYS.DEVICE_TOKEN] ? '—' : '本地模式'));
  const profileId = storage[CLOUD_KEYS.PROFILE_ID] || '';
  const profileShortId = escHtml(profileId ? profileId.slice(0, 8) : '—');
  // device_token 前8位作为短码
  const token = storage[CLOUD_KEYS.DEVICE_TOKEN] || '';
  const shortId = escHtml(token ? token.slice(0, 8).toUpperCase() : '—');
  const deviceId = escHtml(storage['cloud_device_id'] || '—');
  const versionText = escHtml(storage['cloud_config_version'] || '—');
  const syncText = escHtml(storage['cloud_last_sync'] ? new Date(storage['cloud_last_sync']).toLocaleString() : '从未同步');
  const connectionState = storage['cloud_connection_state_v1'] || {};
  const formatConnectionTime = (value) => {
    const ms = Number(value || 0);
    return ms > 0 ? new Date(ms).toLocaleString() : '—';
  };
  const connectionLastError = connectionState.lastError || {};
  const connectionLastErrorText = connectionLastError.message || connectionState.lastErrorMessage || '—';
  const connectionEndpoint = connectionState.lastEndpoint || connectionLastError.endpoint || '—';
  const connectionFailureCount = Number(connectionState.consecutiveFailures || 0);
  const identityStatus = storage[CLOUD_KEYS.CHROME_IDENTITY_STATUS] || {};
  const recoveryState = storage[CLOUD_KEYS.RECOVERY_STATE] || {};
  const identityText = identityStatus.available === true
    ? (identityStatus.linked === false ? '可用，待记录' : '可用，已记录')
    : (identityStatus.available === false ? '不可用' : '未检测');
  const recoveryStatusMap = {
    attempting: '自动恢复中',
    pending_cloud_confirmation: '等待云端确认',
    recovered: '已恢复',
    identity_unavailable: '身份不可用',
    failed: '恢复失败',
    no_candidate: '未找到候选设备',
    NO_CANDIDATE: '未找到候选设备',
    UNSUPPORTED_PLATFORM: '当前平台不支持自动恢复',
    MULTIPLE_CANDIDATES: '需要云端确认',
  };
  const recoveryActiveStates = new Set(['attempting', 'pending_cloud_confirmation', 'recovered']);
  const recoveryStatusRaw = String(recoveryState.status || '');
  const recoveryNeedsManualRebind = !token && recoveryStatusRaw === 'UNSUPPORTED_PLATFORM';
  const recoveryStatusText = recoveryNeedsManualRebind
    ? '需要重新绑定'
    : (token && !recoveryActiveStates.has(recoveryStatusRaw)
      ? '正常'
      : (recoveryStatusMap[recoveryState.status] || (token ? '正常' : '未绑定')));
  const recoveryLastAttempt = recoveryState.lastAttemptAt ? new Date(recoveryState.lastAttemptAt).toLocaleString() : '—';
  const recoveryLastPoll = recoveryState.lastPollAt ? new Date(recoveryState.lastPollAt).toLocaleString() : '—';
  const recoveryLastRecovered = recoveryState.lastRecoveredAt ? new Date(recoveryState.lastRecoveredAt).toLocaleString() : '—';
  const recoveryRequestId = storage[CLOUD_KEYS.RECOVERY_REQUEST_ID] || recoveryState.recoveryRequestId || '';
  const recoveryShortRequestId = recoveryRequestId ? String(recoveryRequestId).slice(0, 8) : '—';
  const recoveryLastError = recoveryNeedsManualRebind
    ? '当前平台暂不支持自动恢复，请点击“登录/绑定云端”重新绑定。'
    : (token && !recoveryActiveStates.has(recoveryStatusRaw)
      ? '—'
      : (recoveryState.lastError || identityStatus.reason || identityStatus.error || '—'));
  if (!activationActive) {
    const tokenPresent = !!storage[CLOUD_KEYS.DEVICE_TOKEN];
    container.innerHTML = `
      <div style="display:grid; grid-template-columns:1fr; gap:14px;">
        <div style="padding:14px; background:var(--surface); border-radius:8px; border:1px solid var(--border);">
          <div style="font-size:13px; color:var(--muted); margin-bottom:6px;">隐私与数据使用说明待确认</div>
          <div style="font-size:15px; font-weight:700; margin-bottom:6px;">TimeOnChrome 暂未启用</div>
          <div style="font-size:12px; color:var(--muted); line-height:1.7;">确认前不会启动计时、媒体记录、云端同步、诊断上传或 Chrome 身份恢复。已有配置和 Device Token 会保留。</div>
          <div style="font-size:12px; color:var(--muted); margin-top:8px;">Device Token：<strong>${tokenPresent ? '存在' : '缺失'}</strong></div>
        </div>
        <button class="btn-save" id="open-privacy-consent-btn">查看并同意</button>
      </div>
    `;
    const consentBtn = container.querySelector("#open-privacy-consent-btn");
    if (consentBtn) consentBtn.addEventListener("click", openPrivacyConsentFromAdmin);
    return;
  }

  const activationCardHtml = `
    <div style="padding:12px; background:var(--surface); border-radius:8px; grid-column:1/-1;">
      <div style="font-size:12px; color:var(--muted); margin-bottom:4px;">启用来源</div>
      <div style="font-size:15px; font-weight:600;">${escHtml(activationModeText)}</div>
      <div style="font-size:12px; color:var(--muted); margin-top:4px; line-height:1.7;">${escHtml(activationDetailText)}</div>
    </div>
  `;
  const connectionCardHtml = `
    <div style="padding:12px; background:var(--surface); border-radius:8px; grid-column:1/-1;">
      <div style="font-size:12px; color:var(--muted); margin-bottom:4px;">云端连接</div>
      <div style="display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:8px 18px; font-size:12px; line-height:1.7;">
        <span>最近尝试：<strong>${escHtml(formatConnectionTime(connectionState.lastAttemptAt))}</strong></span>
        <span>最近成功：<strong>${escHtml(formatConnectionTime(connectionState.lastSuccessAt))}</strong></span>
        <span>连续失败：<strong style="color:${connectionFailureCount > 0 ? 'var(--danger)' : 'var(--green)'};">${connectionFailureCount}</strong></span>
        <span>最近接口：<strong>${escHtml(connectionEndpoint)}</strong></span>
        <span style="grid-column:1/-1;">最后错误：<strong>${escHtml(connectionLastErrorText)}</strong></span>
      </div>
    </div>
  `;
  const recoveryCardHtml = `
    <div style="padding:12px; background:var(--surface); border-radius:8px; grid-column:1/-1;">
      <div style="font-size:12px; color:var(--muted); margin-bottom:4px;">Chrome 身份与绑定恢复</div>
      <div style="display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:8px 18px; font-size:12px; line-height:1.7;">
        <span>Chrome 身份：<strong>${escHtml(identityText)}</strong></span>
        <span>绑定恢复：<strong>${escHtml(recoveryStatusText)}</strong></span>
        <span>Device Token：<strong>${token ? '存在' : '缺失'}</strong></span>
        <span>恢复请求：<strong>${escHtml(recoveryShortRequestId)}</strong></span>
        <span>最近尝试：<strong>${escHtml(recoveryLastAttempt)}</strong></span>
        <span>最近轮询：<strong>${escHtml(recoveryLastPoll)}</strong></span>
        <span>最近恢复：<strong>${escHtml(recoveryLastRecovered)}</strong></span>
        <span style="grid-column:1/-1;">最后原因：<strong>${escHtml(recoveryLastError)}</strong></span>
      </div>
      <div style="font-size:12px;color:var(--muted);line-height:1.7;margin-top:6px;">Chrome 身份用于 macOS / Windows 扩展重装后的弱匹配恢复；本机不显示或保存原始标识。</div>
    </div>
  `;

  if (!token) {
    container.innerHTML = `
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:14px;">
        <div style="padding:12px; background:var(--surface); border-radius:8px; grid-column:1/-1;">
          <div style="font-size:12px; color:var(--muted); margin-bottom:4px;">登录信息</div>
          <div style="display:flex; gap:24px; align-items:center; flex-wrap:wrap; font-size:13px; line-height:1.8;">
            <span>账户：<strong>${accountEmail}</strong></span>
            <span>用户：<strong>${profileName}</strong></span>
          </div>
        </div>
        <div style="padding:12px; background:var(--surface); border-radius:8px; grid-column:1/-1;">
          <div style="font-size:12px; color:var(--muted); margin-bottom:4px;">运行模式</div>
          <div style="font-size:15px; font-weight:600;">本地模式</div>
          <div style="font-size:12px; color:var(--muted); margin-top:4px;">本机计时、popup 和使用分析可用；统计不会同步到云端。</div>
        </div>
        <div style="padding:12px; background:var(--surface); border-radius:8px;">
          <div style="font-size:12px; color:var(--muted);">绑定状态</div>
          <div style="font-size:15px; font-weight:600; color:var(--warn);">未绑定</div>
        </div>
        <div style="padding:12px; background:var(--surface); border-radius:8px;">
          <div style="font-size:12px; color:var(--muted);">云端同步</div>
          <div style="font-size:15px; font-weight:600;">已停用</div>
        </div>
        ${connectionCardHtml}
        ${recoveryCardHtml}
      </div>
      <div style="margin-top:14px; display:flex; gap:10px;">
        <button class="btn-save" id="cloud-login-btn" style="flex:1;">登录/绑定云端</button>
      </div>
    `;
    const loginBtn = container.querySelector('#cloud-login-btn');
    if (loginBtn) loginBtn.addEventListener('click', openCloudLogin);
    return;
  }

  const rebindBtnHtml = isChildView ? '' : `
    <button id="rebind-btn" style="flex:1; padding:10px; background:transparent; border:1px solid var(--border); border-radius:8px; color:var(--muted); font-size:13px; cursor:pointer;">重新绑定</button>
  `;
  const syncBtnTextMap = {
    loading: '更新中…',
    success: '已更新',
    error: '更新失败',
    idle: '🔄 立即同步',
  };
  const syncBtnText = syncBtnTextMap[syncFeedbackState.phase] || syncBtnTextMap.idle;
  const syncBtnDisabled = syncFeedbackState.phase === 'loading' ? 'disabled' : '';
  const syncFeedbackText = syncFeedbackState.message
    ? `<div id="force-sync-feedback" style="margin-top:8px; font-size:12px; color:${syncFeedbackState.phase === 'error' ? 'var(--danger)' : 'var(--muted)'};">${escHtml(syncFeedbackState.message)}</div>`
    : '';

  container.innerHTML = `
    <div style="display:grid; grid-template-columns:1fr 1fr; gap:14px;">
      <div style="padding:12px; background:var(--surface); border-radius:8px; grid-column:1/-1;">
        <div style="font-size:12px; color:var(--muted); margin-bottom:4px;">登录信息</div>
        <div style="display:flex; gap:24px; align-items:center; flex-wrap:wrap; font-size:13px; line-height:1.8;">
          <span>账户：<strong>${accountEmail}</strong></span>
          <span>用户：<strong>${profileName}</strong></span>
          <span style="font-size:11px; color:var(--muted); font-family:monospace;">Profile: ${profileShortId}</span>
        </div>
      </div>
      <div style="padding:12px; background:var(--surface); border-radius:8px; grid-column:1/-1;">
        <div style="font-size:12px; color:var(--muted); margin-bottom:4px;">本机设备</div>
        <div style="display:flex; gap:24px; align-items:center; flex-wrap:wrap; font-size:13px; line-height:1.8;">
          <span style="font-size:15px; font-weight:600;">${deviceName}</span>
          <span style="font-size:11px; color:var(--muted); font-family:monospace;">DeviceID: ${deviceId}</span>
          <span style="font-size:11px; color:var(--muted); font-family:monospace;">ID: ${shortId}</span>
        </div>
      </div>
      <div style="padding:12px; background:var(--surface); border-radius:8px;">
        <div style="font-size:12px; color:var(--muted);">绑定状态</div>
        <div style="font-size:15px; font-weight:600; color:var(--green);">✓ 已绑定</div>
      </div>
      <div style="padding:12px; background:var(--surface); border-radius:8px;">
        <div style="font-size:12px; color:var(--muted);">配置版本</div>
        <div style="font-size:15px; font-weight:600;">${versionText}</div>
      </div>
      <div style="padding:12px; background:var(--surface); border-radius:8px; grid-column:1/-1;">
        <div style="font-size:12px; color:var(--muted); margin-bottom:4px;">最后同步</div>
        <div style="font-size:13px;">
          ${syncText}
        </div>
      </div>
      ${connectionCardHtml}
      ${recoveryCardHtml}
      <div style="padding:12px; background:var(--surface); border-radius:8px; grid-column:1/-1;">
        <div style="font-size:12px; color:var(--muted); margin-bottom:4px;">绑定有效性</div>
        <div style="font-size:12px; color:var(--muted); line-height:1.7;">终端绑定长期有效；只有云端解绑、本地卸载或清除扩展数据、扩展 ID 变化才会失效。</div>
      </div>
    </div>
    <div style="margin-top:14px; display:flex; gap:10px;">
      <button class="btn-save" id="force-sync-btn" style="flex:1;" ${syncBtnDisabled}>${syncBtnText}</button>
      ${rebindBtnHtml}
    </div>
    ${syncFeedbackText}
  `;

  const forceSyncBtn = container.querySelector('#force-sync-btn');
  if (forceSyncBtn) {
    forceSyncBtn.addEventListener('click', () => {
      forceSync();
    });
  }
  const rebindBtn = container.querySelector('#rebind-btn');
  if (rebindBtn) {
    rebindBtn.addEventListener('click', () => {
      confirmRebind();
    });
  }
}

async function forceSync() {
  if (syncFeedbackState.phase === 'loading') return;
  if (syncFeedbackTimer) {
    clearTimeout(syncFeedbackTimer);
    syncFeedbackTimer = null;
  }
  syncFeedbackState = { phase: 'loading', message: '正在更新云端配置与统计…' };
  await renderSyncStatus();

  try {
    const syncResult = await sendMsg({ type: 'CLOUD_FORCE_SYNC' });
    if (syncResult?.hadFailure) {
      const message = (syncResult.errors || []).join('；') || '同步失败';
      if (/DEVICE_UNBOUND|Device unbound|设备.*解绑/i.test(message)) {
        syncFeedbackState = { phase: 'error', message: '设备已被解绑，请重新绑定' };
        await renderSyncStatus();
        await checkAndHandleBinding();
        showError('设备已被解绑，请重新绑定');
        return;
      }
      throw new Error(message);
    }
    syncFeedbackState = { phase: 'success', message: '同步完成' };
    showToast('同步完成');
    await renderSyncStatus();
    syncFeedbackTimer = setTimeout(async () => {
      syncFeedbackState = { phase: 'idle', message: '' };
      await renderSyncStatus();
    }, 1800);
  } catch (e) {
    syncFeedbackState = { phase: 'error', message: `更新失败：${e.message || '未知错误'}` };
    await renderSyncStatus();
    showError('同步失败: ' + e.message);
    syncFeedbackTimer = setTimeout(async () => {
      syncFeedbackState = { phase: 'idle', message: '' };
      await renderSyncStatus();
    }, 3000);
  }
}

async function confirmRebind() {
  if (!confirm('确定要解绑此设备并重新绑定吗？\n\n本地配置和统计数据不会丢失。')) return;

  // 用户明确要求重新绑定时才清除 device token；账号会话保留用于选择档案。
  await new Promise(resolve => chrome.storage.local.set({
    [CLOUD_KEYS.DEVICE_TOKEN]: null,
    [CLOUD_KEYS.PROFILE_ID]: null,
    [CLOUD_KEYS.PROFILE_NAME]: null,
    [CLOUD_KEYS.IS_BOUND]: false,
  }, resolve));

  // 重新进入绑定流程
  await autoLoginForRebind();
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

function classifyUsageTimeType(domain) {
  if (!domain) return 'rest';
  if ((config.studyList || []).some(p => matchDomain(domain, p))) return 'study';
  if ((config.compositeList || []).some(p => matchDomain(domain, p))) return 'composite';
  return 'rest';
}

function isStatsMetaKey(key) {
  return key === 'audioSeconds' ||
    key === 'backgroundMediaByDomain' ||
    key === 'pipSeconds' ||
    key === 'pipByDomain' ||
    key === 'onlineSeconds' ||
    key === 'compositeSeconds' ||
    key === 'undeterminedSeconds';
}

function readCompositeSeconds(statsLike) {
  const explicitComposite = Number(statsLike?.compositeSeconds);
  if (Number.isFinite(explicitComposite)) return Math.max(0, explicitComposite);

  const legacyUndetermined = Number(statsLike?.undeterminedSeconds);
  if (Number.isFinite(legacyUndetermined)) return Math.max(0, legacyUndetermined);

  const compositeList = config?.compositeList || [];
  const domainStats = statsLike?.domainStats || statsLike || {};
  let total = 0;
  for (const [domain, seconds] of Object.entries(domainStats)) {
    if (isStatsMetaKey(domain)) continue;
    const value = Number(seconds);
    if (!Number.isFinite(value) || value <= 0) continue;
    if (compositeList.some(p => matchDomain(domain, p))) total += value;
  }
  return total;
}

function splitStatsDay(dayStats) {
  const safe = dayStats && typeof dayStats === 'object' ? dayStats : {};
  const audioSeconds = Number(safe.audioSeconds) || 0;
  const pipSeconds = Number(safe.pipSeconds) || 0;
  const compositeSeconds = readCompositeSeconds(safe);
  const domainStats = {};
  for (const [domain, seconds] of Object.entries(safe)) {
    if (isStatsMetaKey(domain)) continue;
    domainStats[domain] = Number(seconds) || 0;
  }
  return { domainStats, audioSeconds, pipSeconds, compositeSeconds };
}

function mergeStatsRange(rangeData) {
  const merged = {};
  let audioSeconds = 0;
  let pipSeconds = 0;
  let compositeSeconds = 0;
  for (const dayStats of Object.values(rangeData)) {
    const day = splitStatsDay(dayStats);
    audioSeconds += day.audioSeconds;
    pipSeconds += day.pipSeconds;
    compositeSeconds += day.compositeSeconds;
    for (const [domain, seconds] of Object.entries(day.domainStats)) {
      merged[domain] = (merged[domain] || 0) + seconds;
    }
  }
  return { domainStats: merged, audioSeconds, pipSeconds, compositeSeconds };
}

function getLocalDateKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function formatSettlementTime(ms) {
  const value = Number(ms);
  if (!Number.isFinite(value) || value <= 0) return '—';
  return new Date(value).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function normalizeSettlementEventReason(reason) {
  const value = typeof reason === 'string' ? reason.trim() : '';
  if (value === 'tabAudible' || value === 'mediaState') return '';
  return value.startsWith('stable_') ? value.slice('stable_'.length) : value;
}

function formatSettlementEndpoint(endpoint) {
  return normalizeSettlementEventReason(endpoint?.reason || endpoint?.operation) || '—';
}

function formatSettlementEndpointTitle(endpoint) {
  if (!endpoint) return '—';
  const at = Number(endpoint.atMs);
  const parts = [
    `source=${endpoint.source || 'unknown'}`,
    `reason=${normalizeSettlementEventReason(endpoint.reason) || '—'}`,
    `operation=${normalizeSettlementEventReason(endpoint.operation) || '—'}`,
  ];
  if (Number.isFinite(at) && at > 0) {
    parts.push(`at=${formatSettlementTime(at)}`);
  }
  return parts.join('；');
}

function formatSettlementTabId(row) {
  const tabId = row?.tabId ?? null;
  return tabId != null && tabId !== '' ? String(tabId) : '—';
}

function formatSettlementWindowId(row) {
  const windowId = row?.windowId ?? null;
  return windowId != null && windowId !== '' ? String(windowId) : '—';
}

function buildSettlementRemarkHtml(row, sourceLabel = null) {
  const source = sourceLabel || row?.sourceState || '—';
  const tabText = formatSettlementTabId(row);
  const windowText = formatSettlementWindowId(row);
  const title = [
    `tab=${tabText}`,
    `window=${windowText}`,
    `open=${row?.openOperation || '—'}`,
    `close=${row?.closeOperation || '—'}`,
    `source=${source}`,
  ].join('；');
  return `
    <div class="settlement-remark-cell" title="${escAttr(title)}">
      <div>tab：${escHtml(tabText)}</div>
      <div>window：${escHtml(windowText)}</div>
      <div>open：${escHtml(row?.openOperation || '—')}</div>
      <div>close：${escHtml(row?.closeOperation || '—')}</div>
      <div>来源：${escHtml(source)}</div>
    </div>
  `;
}

function normalizeSettlementRows(payload) {
  const rows = Array.isArray(payload?.segments) ? payload.segments : [];
  return rows
    .map(row => ({
      id: row?.id || '',
      date: row?.date || '',
      domain: row?.domain || '(无域名)',
      channel: row?.channel || '—',
      framework: row?.framework || '',
      sourceState: row?.sourceState || '—',
      tabId: row?.tabId ?? null,
      windowId: Number.isInteger(row?.windowId) ? row.windowId : null,
      mode: row?.mode || '—',
      startMs: Number(row?.startMs),
      endMs: Number(row?.endMs),
      durationSeconds: Number(row?.durationSeconds) || 0,
      settlementReason: row?.settlementReason || '—',
      description: row?.description || null,
      descriptionSummary: row?.description?.summary || '—',
      openOperation: formatSettlementEndpoint(row?.description?.start),
      closeOperation: formatSettlementEndpoint(row?.description?.end),
      openOperationTitle: formatSettlementEndpointTitle(row?.description?.start),
      closeOperationTitle: formatSettlementEndpointTitle(row?.description?.end),
      suspect: !!row?.suspect,
      suspectReason: row?.suspectReason || '',
      uploaded: !!row?.uploaded,
    }))
    .sort((a, b) => {
      const aStart = Number.isFinite(a.startMs) ? a.startMs : Number.MIN_SAFE_INTEGER;
      const bStart = Number.isFinite(b.startMs) ? b.startMs : Number.MIN_SAFE_INTEGER;
      return bStart - aStart;
    });
}

function getSettlementTypeLabel(row) {
  if (!row) return '未知';
  if (row.framework === 'pip_video' || row.channel === 'pip') return 'PiP';
  if (row.framework === 'background_video') return '后台视频';
  if (row.framework === 'background_audio') return '后台音频';
  if (row.channel === 'backgroundMedia' || row.channel === 'media') return '后台媒体';
  if (row.channel === 'active') return '前台网页';
  return row.framework || row.channel || '未知';
}

function getReconciliationStatusLabel(status) {
  if (status === 'match') return '一致';
  if (status === 'stats_missing') return '统计缺失';
  if (status === 'segments_missing') return '落账缺失';
  if (status === 'mismatch') return '不一致';
  return status || '未知';
}

function formatSignedSeconds(seconds) {
  const value = Number(seconds) || 0;
  if (value === 0) return '0秒';
  return `${value > 0 ? '+' : '-'}${formatSeconds(Math.abs(value))}`;
}

function renderSettlementReconciliationSummary() {
  const el = document.getElementById('settlement-reconciliation-summary');
  if (!el) return;
  const summary = settlementReconciliation?.summary || {};
  const rows = Array.isArray(settlementReconciliation?.rows) ? settlementReconciliation.rows : [];
  const mismatchRows = rows.filter(row => row?.status !== 'match');
  const topMismatch = mismatchRows.slice(0, 3).map(row =>
    `${row.domain}/${row.channel}/${row.mode}: ${formatSignedSeconds(row.deltaSeconds)} (${getReconciliationStatusLabel(row.status)})`
  ).join('；');
  el.innerHTML = `
    <span>对账：统计 ${formatSeconds(Number(summary.statsSeconds || 0))}</span>
    <span>落账 ${formatSeconds(Number(summary.segmentSeconds || 0))}</span>
    <span>差异 ${formatSignedSeconds(summary.deltaSeconds)}</span>
    <span>异常行 ${Number(summary.mismatchCount || 0)}</span>
    ${topMismatch ? `<span title="${escAttr(topMismatch)}">Top：${escHtml(topMismatch)}</span>` : '<span>今日统计与落账一致</span>'}
  `;
}

function getSettlementSelectedDomain() {
  const select = document.getElementById('settlement-domain-filter');
  return select?.value || '__all__';
}

function refreshSettlementDomainFilter(rows, selectedValue = '__all__') {
  const select = document.getElementById('settlement-domain-filter');
  if (!select) return;
  const domains = Array.from(new Set(rows.map(row => row.domain).filter(Boolean))).sort();
  const nextValue = selectedValue !== '__all__' && domains.includes(selectedValue) ? selectedValue : '__all__';
  select.innerHTML = [
    '<option value="__all__">全部域名</option>',
    ...domains.map(domain => `<option value="${escAttr(domain)}">${escHtml(domain)}</option>`),
  ].join('');
  select.value = nextValue;
  select.onchange = () => renderSettlementRows();
}

async function fetchSettlementAnalysisPayload(range) {
  return await getAdminSettlementView(range);
}

function renderSettlementRows() {
  const selectedDomain = getSettlementSelectedDomain();
  const rows = selectedDomain === '__all__'
    ? settlementAnalysisRows
    : settlementAnalysisRows.filter(row => row.domain === selectedDomain);
  const summaryEl = document.getElementById('settlement-summary');
  const tableEl = document.getElementById('settlement-table-wrap');
  if (!summaryEl || !tableEl) return;

  const totalSeconds = rows.reduce((sum, row) => sum + Math.max(0, row.durationSeconds || 0), 0);
  const activeSeconds = rows
    .filter(row => row.channel === 'active')
    .reduce((sum, row) => sum + Math.max(0, row.durationSeconds || 0), 0);
  const mediaSeconds = rows
    .filter(row => row.channel === 'backgroundMedia' || row.channel === 'media' || row.channel === 'pip')
    .reduce((sum, row) => sum + Math.max(0, row.durationSeconds || 0), 0);
  summaryEl.innerHTML = `
    <span>范围：${escHtml(settlementAnalysisLabel || '今日')}</span>
    <span>当前显示：${rows.length} 段</span>
    <span>总时长：${formatSeconds(totalSeconds)}</span>
    <span>前台：${formatSeconds(activeSeconds)}</span>
    <span>媒体/PiP：${formatSeconds(mediaSeconds)}</span>
  `;
  renderSettlementReconciliationSummary();

  if (rows.length === 0) {
    tableEl.innerHTML = '<div style="color:var(--muted);text-align:center;padding:16px;">今日暂无落账 segment</div>';
    return;
  }

  tableEl.innerHTML = `
    <table class="settlement-table">
      <thead>
        <tr>
          <th class="settlement-col-date">日期</th>
          <th class="settlement-col-time">开始</th>
          <th class="settlement-col-time">结束</th>
          <th class="settlement-col-duration">时长</th>
          <th class="settlement-col-domain">域名</th>
          <th class="settlement-col-type">计时类型</th>
          <th class="settlement-col-mode">模式</th>
          <th class="settlement-col-reason">落账原因</th>
          <th class="settlement-col-remark">备注</th>
          <th class="settlement-col-status">状态</th>
        </tr>
      </thead>
      <tbody>
        ${rows.map(row => `
          <tr>
            <td>${escHtml(row.date || '—')}</td>
            <td>${escHtml(formatSettlementTime(row.startMs))}</td>
            <td>${escHtml(formatSettlementTime(row.endMs))}</td>
            <td>${escHtml(formatSeconds(row.durationSeconds))}</td>
            <td class="settlement-domain-cell" title="${escAttr(row.domain)}">${escHtml(row.domain)}</td>
            <td title="${escAttr(`${row.channel}${row.framework ? ` / ${row.framework}` : ''}`)}">${escHtml(getSettlementTypeLabel(row))}</td>
            <td>${escHtml(row.mode)}</td>
            <td class="settlement-reason-cell" title="${escAttr(row.settlementReason)}">${escHtml(row.settlementReason)}</td>
            <td>${buildSettlementRemarkHtml(row, row.sourceState)}</td>
            <td>${row.suspect
              ? `<span class="settlement-suspect" title="${escAttr(row.suspectReason)}">suspect</span>`
              : (row.uploaded ? '已上传' : '<span class="settlement-muted">本地</span>')}
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

async function renderSettlementsPage() {
  const summaryEl = document.getElementById('settlement-summary');
  const reconciliationEl = document.getElementById('settlement-reconciliation-summary');
  const tableEl = document.getElementById('settlement-table-wrap');
  if (summaryEl) summaryEl.textContent = '加载中...';
  if (reconciliationEl) reconciliationEl.textContent = '对账加载中...';
  if (tableEl) tableEl.innerHTML = '<div style="color:var(--muted);text-align:center;padding:16px;">加载中...</div>';

  document.querySelectorAll('[data-settlement-range]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.settlementRange === settlementAnalysisRange);
    btn.onclick = () => {
      settlementAnalysisRange = btn.dataset.settlementRange || 'today';
      renderSettlementsPage();
    };
  });
  const refreshBtn = document.getElementById('settlement-refresh-btn');
  if (refreshBtn) {
    refreshBtn.onclick = () => renderSettlementsPage();
  }
  try {
    const selected = getSettlementSelectedDomain();
    const payload = await fetchSettlementAnalysisPayload(settlementAnalysisRange);
    settlementAnalysisRows = normalizeSettlementRows(payload);
    settlementReconciliation = payload?.reconciliation || null;
    settlementAnalysisLabel = payload?.label || settlementAnalysisRange || '今日';
    refreshSettlementDomainFilter(settlementAnalysisRows, selected);
    renderSettlementRows();
    if (payload?.backgroundOutdated && reconciliationEl) {
      reconciliationEl.innerHTML += ` <span style="color:var(--warn);">后台仍是旧版本；重新加载扩展后可查看昨日/本周/全部。</span>`;
    }
  } catch (error) {
    setSettlementsPageError(error?.message || String(error));
  }
}

function normalizeMediaSettlementEventReason(reason) {
  const value = typeof reason === 'string' ? reason.trim() : '';
  return value.startsWith('stable_') ? value.slice('stable_'.length) : value;
}

function formatMediaSettlementEndpoint(endpoint, fallback) {
  return normalizeMediaSettlementEventReason(fallback || endpoint?.reason || endpoint?.operation) || '—';
}

function formatMediaSettlementEndpointTitle(endpoint, fallback) {
  if (!endpoint && !fallback) return '—';
  const at = Number(endpoint?.atMs);
  const parts = [
    `source=${endpoint?.source || 'media'}`,
    `reason=${normalizeMediaSettlementEventReason(endpoint?.reason || fallback) || '—'}`,
    `operation=${normalizeMediaSettlementEventReason(endpoint?.operation || fallback) || '—'}`,
  ];
  if (Number.isFinite(at) && at > 0) {
    parts.push(`at=${formatSettlementTime(at)}`);
  }
  return parts.join('；');
}

function normalizeMediaSettlementRows(payload) {
  const rows = Array.isArray(payload?.rows) ? payload.rows : [];
  return rows
    .map(row => ({
      id: row?.id || '',
      date: row?.date || '',
      domain: row?.domain || '(无域名)',
      tabId: row?.tabId ?? '—',
      windowId: row?.windowId ?? null,
      mediaClass: row?.mediaClass || 'unknown',
      mediaKind: row?.mediaKind || '—',
      visibility: row?.visibility || '—',
      mode: row?.mode || '—',
      startMs: Number(row?.startMs),
      endMs: Number(row?.endMs),
      durationSeconds: Number(row?.durationSeconds) || 0,
      settlementReason: row?.settlementReason || row?.reason || '—',
      description: row?.description || null,
      openOperation: formatMediaSettlementEndpoint(row?.description?.start, row?.openOperation),
      closeOperation: formatMediaSettlementEndpoint(row?.description?.end, row?.closeOperation),
      openOperationTitle: formatMediaSettlementEndpointTitle(row?.description?.start, row?.openOperation),
      closeOperationTitle: formatMediaSettlementEndpointTitle(row?.description?.end, row?.closeOperation),
      uploaded: false,
    }))
    .sort((a, b) => {
      const aStart = Number.isFinite(a.startMs) ? a.startMs : Number.MIN_SAFE_INTEGER;
      const bStart = Number.isFinite(b.startMs) ? b.startMs : Number.MIN_SAFE_INTEGER;
      return bStart - aStart;
    });
}

function getMediaClassLabel(mediaClass) {
  if (mediaClass === 'foregroundAudio') return '前台音频';
  if (mediaClass === 'backgroundAudio') return '后台音频';
  if (mediaClass === 'foregroundVideo') return '前台视频';
  if (mediaClass === 'backgroundVideo') return '后台视频';
  if (mediaClass === 'pip') return 'PiP';
  return mediaClass || '未知';
}

function getMediaSettlementSelectedDomain() {
  return document.getElementById('media-settlement-domain-filter')?.value || '__all__';
}

function getMediaSettlementSelectedClass() {
  return document.getElementById('media-settlement-class-filter')?.value || '__all__';
}

function refreshMediaSettlementFilters(rows, selectedDomain = '__all__', selectedClass = '__all__') {
  const domainSelect = document.getElementById('media-settlement-domain-filter');
  const classSelect = document.getElementById('media-settlement-class-filter');
  const domains = Array.from(new Set(rows.map(row => row.domain).filter(Boolean))).sort();
  const classes = Array.from(new Set(rows.map(row => row.mediaClass).filter(Boolean))).sort();
  if (domainSelect) {
    const nextDomain = selectedDomain !== '__all__' && domains.includes(selectedDomain) ? selectedDomain : '__all__';
    domainSelect.innerHTML = [
      '<option value="__all__">全部域名</option>',
      ...domains.map(domain => `<option value="${escAttr(domain)}">${escHtml(domain)}</option>`),
    ].join('');
    domainSelect.value = nextDomain;
    domainSelect.onchange = () => renderMediaSettlementRows();
  }
  if (classSelect) {
    const nextClass = selectedClass !== '__all__' && classes.includes(selectedClass) ? selectedClass : '__all__';
    classSelect.innerHTML = [
      '<option value="__all__">全部类型</option>',
      ...classes.map(mediaClass => `<option value="${escAttr(mediaClass)}">${escHtml(getMediaClassLabel(mediaClass))}</option>`),
    ].join('');
    classSelect.value = nextClass;
    classSelect.onchange = () => renderMediaSettlementRows();
  }
}

function buildMediaSettlementSummary(rows) {
  return rows.reduce((summary, row) => {
    const seconds = Math.max(0, Number(row.durationSeconds) || 0);
    summary.totalSeconds += seconds;
    summary.rowCount += 1;
    if (row.mediaClass === 'foregroundAudio') summary.foregroundAudioSeconds += seconds;
    else if (row.mediaClass === 'backgroundAudio') summary.backgroundAudioSeconds += seconds;
    else if (row.mediaClass === 'foregroundVideo') summary.foregroundVideoSeconds += seconds;
    else if (row.mediaClass === 'backgroundVideo') summary.backgroundVideoSeconds += seconds;
    else if (row.mediaClass === 'pip') summary.pipSeconds += seconds;
    return summary;
  }, {
    rowCount: 0,
    totalSeconds: 0,
    foregroundAudioSeconds: 0,
    backgroundAudioSeconds: 0,
    foregroundVideoSeconds: 0,
    backgroundVideoSeconds: 0,
    pipSeconds: 0,
  });
}

function renderMediaSettlementRows() {
  const selectedDomain = getMediaSettlementSelectedDomain();
  const selectedClass = getMediaSettlementSelectedClass();
  const rows = mediaSettlementRows.filter(row =>
    (selectedDomain === '__all__' || row.domain === selectedDomain) &&
    (selectedClass === '__all__' || row.mediaClass === selectedClass)
  );
  const summaryEl = document.getElementById('media-settlement-summary');
  const tableEl = document.getElementById('media-settlement-table-wrap');
  if (!summaryEl || !tableEl) return;

  const summary = buildMediaSettlementSummary(rows);
  summaryEl.innerHTML = `
    <span>范围：${escHtml(mediaSettlementLabel || '今日')}</span>
    <span>当前显示：${summary.rowCount} 段</span>
    <span>总媒体：${formatSeconds(summary.totalSeconds)}</span>
    <span>前台音频：${formatSeconds(summary.foregroundAudioSeconds)}</span>
    <span>后台音频：${formatSeconds(summary.backgroundAudioSeconds)}</span>
    <span>前台视频：${formatSeconds(summary.foregroundVideoSeconds)}</span>
    <span>后台视频：${formatSeconds(summary.backgroundVideoSeconds)}</span>
    <span>PiP：${formatSeconds(summary.pipSeconds)}</span>
  `;

  if (rows.length === 0) {
    tableEl.innerHTML = '<div style="color:var(--muted);text-align:center;padding:16px;">暂无媒体落账 segment</div>';
    return;
  }

  tableEl.innerHTML = `
    <table class="settlement-table">
      <thead>
        <tr>
          <th class="settlement-col-date">日期</th>
          <th class="settlement-col-time">开始</th>
          <th class="settlement-col-time">结束</th>
          <th class="settlement-col-duration">时长</th>
          <th class="settlement-col-domain">域名</th>
          <th class="settlement-col-type">媒体类型</th>
          <th class="settlement-col-mode">模式</th>
          <th class="settlement-col-reason">落账原因</th>
          <th class="settlement-col-remark">备注</th>
          <th class="settlement-col-status">状态</th>
        </tr>
      </thead>
      <tbody>
        ${rows.map(row => `
          <tr>
            <td>${escHtml(row.date || '—')}</td>
            <td>${escHtml(formatSettlementTime(row.startMs))}</td>
            <td>${escHtml(formatSettlementTime(row.endMs))}</td>
            <td>${escHtml(formatSeconds(row.durationSeconds))}</td>
            <td class="settlement-domain-cell" title="${escAttr(row.domain)}">${escHtml(row.domain)}</td>
            <td title="${escAttr(row.mediaClass)}">${escHtml(getMediaClassLabel(row.mediaClass))}</td>
            <td>${escHtml(row.mode)}</td>
            <td class="settlement-reason-cell" title="${escAttr(row.settlementReason)}">${escHtml(row.settlementReason)}</td>
            <td>${buildSettlementRemarkHtml(row, row.visibility || row.mediaKind || '—')}</td>
            <td>${row.uploaded ? '已上传' : '<span class="settlement-muted">本地</span>'}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

async function renderMediaSettlementsPage() {
  const summaryEl = document.getElementById('media-settlement-summary');
  const tableEl = document.getElementById('media-settlement-table-wrap');
  if (summaryEl) summaryEl.textContent = '加载中...';
  if (tableEl) tableEl.innerHTML = '<div style="color:var(--muted);text-align:center;padding:16px;">加载中...</div>';

  document.querySelectorAll('[data-media-settlement-range]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.mediaSettlementRange === mediaSettlementRange);
    btn.onclick = () => {
      mediaSettlementRange = btn.dataset.mediaSettlementRange || 'today';
      renderMediaSettlementsPage();
    };
  });
  const refreshBtn = document.getElementById('media-settlement-refresh-btn');
  if (refreshBtn) {
    refreshBtn.onclick = () => renderMediaSettlementsPage();
  }

  try {
    const selectedDomain = getMediaSettlementSelectedDomain();
    const selectedClass = getMediaSettlementSelectedClass();
    const payload = await getAdminMediaSettlementView(mediaSettlementRange);
    mediaSettlementRows = normalizeMediaSettlementRows(payload);
    mediaSettlementLabel = payload?.label || mediaSettlementRange || '今日';
    refreshMediaSettlementFilters(mediaSettlementRows, selectedDomain, selectedClass);
    renderMediaSettlementRows();
  } catch (error) {
    setMediaSettlementsPageError(error?.message || String(error));
  }
}

function setupUsageAnalysisControls() {
  document.querySelectorAll('[data-usage-ledger]').forEach(btn => {
    btn.addEventListener('click', async () => {
      usageAnalysisState.ledger = btn.dataset.usageLedger === 'media' ? 'media' : 'web';
      usageAnalysisState.detail = null;
      usageAnalysisState.query = '';
      await renderStatsPage();
    });
  });
  document.querySelectorAll('[data-usage-range-mode]').forEach(btn => {
    btn.addEventListener('click', async () => {
      usageAnalysisState.mode = btn.dataset.usageRangeMode === 'week' ? 'week' : 'day';
      usageAnalysisState.detail = null;
      await renderStatsPage();
    });
  });
  document.getElementById('usage-analysis-prev')?.addEventListener('click', async () => {
    usageAnalysisState.date = shiftUsageAnalysisDate(usageAnalysisState.date, usageAnalysisState.mode === 'week' ? -7 : -1);
    usageAnalysisState.detail = null;
    await renderStatsPage();
  });
  document.getElementById('usage-analysis-next')?.addEventListener('click', async () => {
    usageAnalysisState.date = shiftUsageAnalysisDate(usageAnalysisState.date, usageAnalysisState.mode === 'week' ? 7 : 1);
    usageAnalysisState.detail = null;
    await renderStatsPage();
  });
  document.getElementById('usage-analysis-today')?.addEventListener('click', async () => {
    usageAnalysisState.date = null;
    usageAnalysisState.detail = null;
    await renderStatsPage();
  });
  document.getElementById('usage-analysis-list-mode')?.addEventListener('change', (event) => {
    usageAnalysisState.listMode = event.target.value === 'categories' ? 'categories' : 'targets';
    usageAnalysisState.detail = null;
    renderUsageAnalysisList(usageAnalysisLastView);
  });
  document.getElementById('usage-analysis-search')?.addEventListener('input', (event) => {
    usageAnalysisState.query = event.target.value || '';
    renderUsageAnalysisList(usageAnalysisLastView);
  });
}

function shiftUsageAnalysisDate(currentKey, days) {
  const base = currentKey ? new Date(`${currentKey}T00:00:00`) : new Date();
  base.setDate(base.getDate() + days);
  return `${base.getFullYear()}-${String(base.getMonth() + 1).padStart(2, '0')}-${String(base.getDate()).padStart(2, '0')}`;
}

function usageCategoryLabel(key) {
  return ({
    study: '学习',
    composite: '待归类',
    rest: '休息',
    other: '其他',
    foregroundAudio: '前台音频',
    backgroundAudio: '后台音频',
    foregroundVideo: '前台视频',
    backgroundVideo: '后台视频',
    pip: 'PiP',
  })[key] || key || '其他';
}

function usageStatusClass(status) {
  return status === '待归类' ? 'pending' : '';
}

function usageCategoryKeys(view = usageAnalysisLastView) {
  return Array.isArray(view?.categoryKeys) && view.categoryKeys.length
    ? view.categoryKeys
    : ['study', 'composite', 'rest', 'other'];
}

function usageSeriesTotal(row, keys = usageCategoryKeys()) {
  return keys
    .reduce((sum, key) => sum + Math.max(0, Number(row?.categories?.[key]) || 0), 0);
}

function renderUsageStackChart(id, series = [], options = {}) {
  const el = document.getElementById(id);
  if (!el) return;
  const keys = Array.isArray(options.categoryKeys) && options.categoryKeys.length ? options.categoryKeys : usageCategoryKeys();
  if (!Array.isArray(series) || series.length === 0 || !series.some(row => usageSeriesTotal(row, keys) > 0)) {
    el.innerHTML = `<div class="usage-empty">${escHtml(options.emptyMessage || '当前范围没有使用记录')}</div>`;
    return;
  }
  const max = Math.max(...series.map(row => usageSeriesTotal(row, keys)), 1);
  el.innerHTML = series.map(row => {
    const total = usageSeriesTotal(row, keys);
    const barHeight = Math.max(2, Math.round((total / max) * 100));
    const title = keys
      .filter(key => Number(row.categories?.[key] || 0) > 0)
      .map(key => `${usageCategoryLabel(key)} ${formatSeconds(row.categories[key])}`)
      .join(' / ');
    return `
      <div class="usage-stack-slot" title="${escAttr(title)}">
        <div class="usage-stack-bar" style="height:${barHeight}%">
          ${keys.map(key => {
            const seconds = Number(row.categories?.[key] || 0);
            if (seconds <= 0 || total <= 0) return '';
            return `<div class="usage-stack-part ${key}" style="height:${Math.max(2, Math.round(seconds / total * 100))}%"></div>`;
          }).join('')}
        </div>
        <div class="usage-stack-label">${escHtml(row.label || '')}</div>
      </div>
    `;
  }).join('');
}

function renderUsageLegend(view) {
  const el = document.getElementById('usage-analysis-legend');
  if (!el) return;
  const totals = view?.categoryTotals || {};
  el.innerHTML = usageCategoryKeys(view).map(key => `
    <div class="usage-legend-item">
      <span class="usage-dot ${key}"></span>
      <span>
        <div class="usage-legend-name">${usageCategoryLabel(key)}</div>
        <div class="usage-legend-time">${formatSeconds(totals[key] || 0)}</div>
      </span>
    </div>
  `).join('');
}

function usageTargetIcon(row = {}) {
  let icon = 'current-site';
  if (row.managedTargetNamespace === 'youtube' || /youtube/i.test(row.label || '')) icon = 'background-media';
  if (row.managedTargetType === 'playlist') icon = 'rules';
  if (row.managedTargetType === 'url') icon = 'current-site';
  if (row.isFallback) icon = 'pending';
  return `<img class="toc-ui-icon small" src="../icons/ui/${icon}.svg" alt="">`;
}

function filteredUsageRows(view) {
  const query = usageAnalysisState.query.trim().toLowerCase();
  if (usageAnalysisState.listMode === 'categories') {
    return (view?.categoryRows || []).filter(row => !query || row.label.toLowerCase().includes(query));
  }
  return (view?.targetRows || []).filter(row => {
    if (!query) return true;
    return String(row.label || '').toLowerCase().includes(query) ||
      String(row.fallbackDomain || '').toLowerCase().includes(query);
  });
}

function renderUsageAnalysisList(view) {
  const wrap = document.getElementById('usage-analysis-table-wrap');
  const detail = document.getElementById('usage-analysis-detail');
  if (!wrap) return;
  if (!view) {
    wrap.innerHTML = '<div class="usage-empty">使用分析加载中...</div>';
    if (detail) detail.className = 'usage-detail-panel';
    return;
  }
  const listModeEl = document.getElementById('usage-analysis-list-mode');
  const searchEl = document.getElementById('usage-analysis-search');
  if (listModeEl) listModeEl.value = usageAnalysisState.listMode;
  if (searchEl) {
    searchEl.value = usageAnalysisState.query;
    searchEl.placeholder = usageAnalysisState.listMode === 'categories' ? '搜索分类' : (view.searchTargetPlaceholder || '搜索管理对象');
  }
  const rows = filteredUsageRows(view);
  if (rows.length === 0) {
    wrap.innerHTML = '<div class="usage-empty">当前时间范围内没有管理对象使用记录</div>';
    if (detail) detail.className = 'usage-detail-panel';
    return;
  }
  if (usageAnalysisState.listMode === 'categories') {
    wrap.innerHTML = `
      <table class="usage-analysis-table">
        <thead><tr><th>分类</th><th>时间</th><th>限额</th><th>状态</th></tr></thead>
        <tbody>
          ${rows.map(row => `
            <tr data-usage-detail-kind="category" data-usage-detail-key="${escAttr(row.key)}">
              <td><span class="usage-target-name"><span class="usage-dot ${escAttr(row.key)}"></span>${escHtml(row.label)}</span></td>
              <td>${formatSeconds(row.seconds)}</td>
              <td>${escHtml(row.limitLabel || '—')}</td>
              <td><span class="usage-status ${usageStatusClass(row.status)}">${escHtml(row.status || '正常')}</span></td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  } else {
    wrap.innerHTML = `
      <table class="usage-analysis-table">
        <thead><tr><th>${escHtml(view.targetColumnLabel || '管理对象')}</th><th>${escHtml(view.categoryColumnLabel || '分类')}</th><th>今日时间</th><th>本周时间</th><th>限额</th><th>状态</th></tr></thead>
        <tbody>
          ${rows.map(row => `
            <tr data-usage-detail-kind="target" data-usage-detail-key="${escAttr(row.key)}">
              <td><span class="usage-target-name"><span class="usage-target-icon">${usageTargetIcon(row)}</span><span>${escHtml(row.label || '未命名管理对象')}</span></span></td>
              <td>${escHtml(row.categoryLabel || usageCategoryLabel(row.category))}</td>
              <td>${formatSeconds(row.todaySeconds || 0)}</td>
              <td>${formatSeconds(row.weekSeconds || 0)}</td>
              <td>${escHtml(row.limitLabel || '—')}</td>
              <td><span class="usage-status ${usageStatusClass(row.status)}">${escHtml(row.status || '正常')}</span></td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  }
  wrap.querySelectorAll('[data-usage-detail-key]').forEach(row => {
    row.addEventListener('click', () => {
      usageAnalysisState.detail = { kind: row.dataset.usageDetailKind, key: row.dataset.usageDetailKey };
      renderUsageDetail(view);
    });
  });
  renderUsageDetail(view);
}

function renderUsageDetail(view) {
  const detail = document.getElementById('usage-analysis-detail');
  if (!detail || !usageAnalysisState.detail) {
    if (detail) detail.className = 'usage-detail-panel';
    return;
  }
  if (usageAnalysisState.detail.kind === 'category') {
    const category = (view.categoryRows || []).find(row => row.key === usageAnalysisState.detail.key);
    const targets = (view.targetRows || []).filter(row => row.category === usageAnalysisState.detail.key).slice(0, 6);
    if (!category) {
      detail.className = 'usage-detail-panel';
      return;
    }
    detail.className = 'usage-detail-panel visible';
    detail.innerHTML = `
      <strong>${escHtml(category.label)}</strong>
      <div style="margin-top:8px;color:var(--muted);">使用时间：${formatSeconds(category.seconds)} · 限额：${escHtml(category.limitLabel || '—')}</div>
      <div style="margin-top:10px;">${targets.map(row => `${escHtml(row.label)}：${formatSeconds(row.rangeSeconds)}`).join('<br>') || '当前范围没有该分类下的管理对象。'}</div>
    `;
    return;
  }
  const target = (view.targetRows || []).find(row => row.key === usageAnalysisState.detail.key);
  if (!target) {
    detail.className = 'usage-detail-panel';
    return;
  }
  detail.className = 'usage-detail-panel visible';
  detail.innerHTML = `
    <strong>${escHtml(target.label)}</strong>
    <div style="margin-top:8px;color:var(--muted);">
      分类：${escHtml(target.categoryLabel || usageCategoryLabel(target.category))} · 类型：${escHtml(target.managedTargetType || (target.isFallback ? 'fallback domain' : 'managed target'))} · 来源：${escHtml(target.fallbackDomain || target.managedTargetNamespace || '—')}
    </div>
    <div style="margin-top:10px;display:grid;grid-template-columns:repeat(4,minmax(120px,1fr));gap:8px;">
      <div>当前范围<br><strong>${formatSeconds(target.rangeSeconds || 0)}</strong></div>
      <div>今日时间<br><strong>${formatSeconds(target.todaySeconds || 0)}</strong></div>
      <div>本周时间<br><strong>${formatSeconds(target.weekSeconds || 0)}</strong></div>
      <div>状态<br><strong>${escHtml(target.status || '正常')}</strong></div>
    </div>
  `;
}

function renderUsageAnalysisView(view) {
  usageAnalysisLastView = view;
  document.querySelectorAll('[data-usage-ledger]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.usageLedger === (view.kind || 'web'));
  });
  document.querySelectorAll('[data-usage-range-mode]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.usageRangeMode === view.range.mode);
  });
  const syncLabel = document.getElementById('usage-analysis-sync-label');
  if (syncLabel) syncLabel.textContent = view.meta?.syncLabel || '本机数据';
  const totalLabel = document.querySelector('#page-stats .usage-total-label');
  if (totalLabel) totalLabel.textContent = view.totalLabel || '使用时间';
  const total = document.getElementById('usage-analysis-total');
  if (total) total.textContent = formatSeconds(view.totalSeconds || 0);
  const rangeLabel = document.getElementById('usage-analysis-range-label');
  if (rangeLabel) rangeLabel.textContent = view.range.mode === 'week' ? view.range.label : `${view.range.label} ${DAY_NAMES[new Date(`${view.range.from}T00:00:00`).getDay()]}`;
  const todayBtn = document.getElementById('usage-analysis-today');
  if (todayBtn) todayBtn.textContent = view.range.mode === 'week' ? '本周' : '今天';
  const summaryTitle = document.getElementById('usage-analysis-summary-title');
  if (summaryTitle) summaryTitle.textContent = '本周每日结构';
  const mainTitle = document.getElementById('usage-analysis-main-title');
  if (mainTitle) mainTitle.textContent = view.range.mode === 'week' ? '本周每日分布' : '24 小时分布';
  renderUsageStackChart('usage-analysis-week-chart', view.weekSummarySeries || [], { emptyMessage: '本周还没有使用记录', categoryKeys: usageCategoryKeys(view) });
  renderUsageStackChart('usage-analysis-main-chart', view.chartSeries || [], { emptyMessage: view.range.mode === 'week' ? '本周还没有使用记录' : '今天还没有使用记录', categoryKeys: usageCategoryKeys(view) });
  renderUsageLegend(view);
  renderUsageAnalysisList(view);
}

async function renderStatsPage() {
  try {
    const getView = usageAnalysisState.ledger === 'media'
      ? getAdminMediaUsageAnalysisView
      : getAdminUsageAnalysisView;
    const usageView = await getView({
      mode: usageAnalysisState.mode,
      date: usageAnalysisState.date || undefined,
    });
    if (!config || typeof config !== 'object') {
      config = usageView.config || { studyList: [], compositeList: [] };
    }
    renderUsageAnalysisView(usageView);
  } catch (error) {
    console.error('[Admin] local usage analysis read failed:', error);
    setStatsPageError('部分数据暂时不可用');
  }
}

function computeOverview(data) {
  let online = 0, study = 0, rest = 0, audio = 0, pip = 0;
  const composite = readCompositeSeconds(data);
  audio = Number(data.audioSeconds) || 0;
  pip = Number(data.pipSeconds) || 0;
  for (const [domain, seconds] of Object.entries(data.domainStats || {})) {
    online += seconds;
    const type = classifyDomain(domain);
    if (type === 'study') study += seconds;
    else rest += seconds;
  }
  rest = Math.max(0, rest - composite);
  return { online, study, rest, audio, pip, composite, undetermined: composite };
}

function renderOverviewList(id, overview) {
  const el = document.getElementById(id);
  if (!el) return;
  const rows = [
    { label: '在线', value: formatSeconds(overview.online) },
    { label: '学习', value: formatSeconds(overview.study) },
    { label: '休息', value: formatSeconds(overview.rest) },
    { label: '后台媒体', value: formatSeconds(overview.audio) },
    { label: 'PiP', value: formatSeconds(overview.pip) },
    { label: '待归类', value: formatSeconds(overview.composite ?? overview.undetermined) },
  ];
  el.innerHTML = rows.map(r => `
    <div class="overview-row">
      <span class="overview-label">${r.label}</span>
      <span class="overview-value">${r.value}</span>
    </div>
  `).join('');
}

function renderSuspectSegmentStatus(summary = {}) {
  const el = document.getElementById('suspect-segment-status');
  if (!el) return;

  if (!summary?.ok) {
    el.innerHTML = `
      <div class="overview-row">
        <span class="overview-label">异常历史段</span>
        <span class="overview-value">暂不可读</span>
      </div>
    `;
    return;
  }

  const count = Number(summary.markedCount || 0);
  const seconds = Number(summary.excludedSeconds || 0);
  const reasonText = formatSuspectReasons(summary.suspectByReason);
  if (count <= 0) {
    el.innerHTML = `
      <div class="overview-row">
        <span class="overview-label">异常历史段</span>
        <span class="overview-value">未发现</span>
      </div>
      <div style="font-size:12px;color:var(--muted);line-height:1.6;padding:8px 0 2px;">
        本地统计未检测到会污染读数的历史长段。
      </div>
    `;
    return;
  }

  el.innerHTML = `
    <div class="overview-row">
      <span class="overview-label">待排除异常段</span>
      <span class="overview-value">${count}段 / ${formatSeconds(seconds)}</span>
    </div>
    <div style="font-size:12px;color:var(--muted);line-height:1.6;padding:8px 0;">
      ${escHtml(reasonText || '检测到疑似异常历史计时段。')} 原始 segment 会保留；标记后仅重建本地统计并排除异常秒数。
    </div>
    <button id="mark-suspect-segments-btn" style="border:1px solid var(--border);border-radius:8px;background:rgba(245,158,11,0.10);color:#92400e;padding:8px 10px;font-size:12px;font-weight:600;cursor:pointer;">
      标记并重建本地统计
    </button>
    <div id="mark-suspect-segments-feedback" style="font-size:12px;color:var(--muted);line-height:1.6;margin-top:8px;"></div>
  `;

  const btn = document.getElementById('mark-suspect-segments-btn');
  if (!btn) return;
  btn.addEventListener('click', async () => {
    const feedback = document.getElementById('mark-suspect-segments-feedback');
    btn.disabled = true;
    btn.textContent = '处理中...';
    if (feedback) feedback.textContent = '正在标记 suspect 并重建本地 daily stats...';
    try {
      const result = await sendMsg({ type: 'MARK_SUSPECT_SEGMENTS', dryRun: false });
      if (!result?.ok) throw new Error(result?.error || 'mark failed');
      if (feedback) {
        feedback.textContent = `已标记 ${result.markedCount || 0} 段，重建 ${Array.isArray(result.rebuiltDates) ? result.rebuiltDates.length : 0} 天。`;
      }
      await renderStatsPage();
    } catch (e) {
      btn.disabled = false;
      btn.textContent = '标记并重建本地统计';
      if (feedback) feedback.textContent = `处理失败：${e?.message || e}`;
    }
  });
}

function formatSuspectReasons(reasons = {}) {
  const labels = {
    active_over_3h: 'active 超过 3 小时',
    active_cross_day_over_30m: 'active 跨日超过 30 分钟',
    stale_recovery_tab_close_over_30m: 'stale/recovery/tab_close 超过 30 分钟',
    active_source_over_3h: 'ACTIVE 源状态超过 3 小时',
  };
  return Object.entries(reasons || {})
    .filter(([, count]) => Number(count) > 0)
    .map(([reason, count]) => `${labels[reason] || reason}：${count}段`)
    .join('；');
}

function renderTimeline(id, sessions, options = {}) {
  const el = document.getElementById(id);
  if (!el) return;
  const emptyMessage = options.emptyMessage || '暂无时间轴数据';
  if (!Array.isArray(sessions) || sessions.length === 0) {
    el.innerHTML = `<div style="color:var(--muted);text-align:center;padding:12px;">${escHtml(emptyMessage)}</div>`;
    return;
  }

  // 按小时聚合，并标记主要分类（跨小时段按小时切分）
  const hourData = new Array(24).fill(0);
  const hourTypeSeconds = new Array(24).fill(null).map(() => ({
    study: 0,
    composite: 0,
    rest: 0,
  }));
  for (const s of sessions) {
    if (!Number.isFinite(s?.startAt) || !Number.isFinite(s?.duration) || s.duration <= 0 || !s?.domain) continue;
    let cursor = Number(s.startAt);
    const end = Number(s.startAt) + Number(s.duration) * 1000;
    const timeType = classifyUsageTimeType(s.domain);
    while (cursor < end) {
      const slotDate = new Date(cursor);
      const hour = slotDate.getHours();
      const nextHourStart = new Date(
        slotDate.getFullYear(),
        slotDate.getMonth(),
        slotDate.getDate(),
        slotDate.getHours() + 1,
        0,
        0,
        0
      ).getTime();
      const segmentEnd = Math.min(end, nextHourStart);
      const seconds = Math.floor((segmentEnd - cursor) / 1000);
      if (seconds > 0 && hour >= 0 && hour <= 23) {
        hourData[hour] += seconds;
        hourTypeSeconds[hour][timeType] += seconds;
      }
      cursor = segmentEnd;
    }
  }
  if (!hourData.some(v => v > 0)) {
    el.innerHTML = `<div style="color:var(--muted);text-align:center;padding:12px;">${escHtml(emptyMessage)}</div>`;
    return;
  }
  const typeClass = {
    study: 'study',
    composite: 'undetermined',
    rest: 'rest',
  };

  el.innerHTML = hourData.map((seconds, h) => {
    const typeData = hourTypeSeconds[h];
    const studyPct = Math.max(0, Math.min(100, Math.round((typeData.study / 3600) * 100)));
    const compositePct = Math.max(0, Math.min(100, Math.round((typeData.composite / 3600) * 100)));
    const restPct = Math.max(0, Math.min(100, Math.round((typeData.rest / 3600) * 100)));
    const studyLeft = 0;
    const compositeLeft = studyPct;
    const restLeft = studyPct + compositePct;
    const compactParts = [];
    if (typeData.study > 0) compactParts.push(`学习${formatSeconds(typeData.study)}`);
    if (typeData.rest > 0) compactParts.push(`休息${formatSeconds(typeData.rest)}`);
    if (typeData.composite > 0) compactParts.push(`待归类${formatSeconds(typeData.composite)}`);
    const label = seconds > 0 ? compactParts.join('，') : '';
    const detail = [];
    if (typeData.study > 0) detail.push(`学习时间 ${formatSeconds(typeData.study)}`);
    if (typeData.composite > 0) detail.push(`待归类时间 ${formatSeconds(typeData.composite)}`);
    if (typeData.rest > 0) detail.push(`休息时间 ${formatSeconds(typeData.rest)}`);
    const title = detail.join(' / ');
    return `
      <div class="timeline-row">
        <div class="timeline-hour">${String(h).padStart(2, '0')}</div>
        <div class="timeline-track" title="${escHtml(title)}">
          ${studyPct > 0 ? `<div class="timeline-fill ${typeClass.study}" style="left:${studyLeft}%;width:${studyPct}%"></div>` : ''}
          ${compositePct > 0 ? `<div class="timeline-fill ${typeClass.composite}" style="left:${compositeLeft}%;width:${compositePct}%"></div>` : ''}
          ${restPct > 0 ? `<div class="timeline-fill ${typeClass.rest}" style="left:${restLeft}%;width:${restPct}%"></div>` : ''}
          ${label ? `<div class="timeline-label">${escHtml(label)}</div>` : ''}
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
    .filter(([domain]) => !isStatsMetaKey(domain))
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit);
  if (entries.length === 0) {
    el.innerHTML = '<div style="color:var(--muted);text-align:center;padding:12px;">暂无数据</div>';
    return;
  }
  el.innerHTML = entries.map(([domain, seconds]) => `
    <div class="rank-item">
      <span class="rank-domain">${escHtml(domain)}</span>
      <span class="rank-time">${formatSeconds(seconds)}</span>
    </div>
  `).join('');
}

function renderUndeterminedList(id, sessions) {
  const el = document.getElementById(id);
  if (!el) return;
  const totalMin = Math.round(sessions.reduce((a, s) => a + (s.duration || 0), 0) / 60);
  if (sessions.length === 0) {
    el.innerHTML = '<div style="color:var(--muted);text-align:center;padding:12px;">暂无待归类明细</div>';
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

  container.innerHTML = logs.map(entry => {
    const action = escHtml(entry?.action || '');
    const details = escHtml(entry?.details || entry?.action || '');
    const ts = Number.isFinite(entry?.ts) ? new Date(entry.ts).toLocaleString() : '—';
    return `
    <div class="changelog-item">
      <div class="changelog-dot ${dotClass(String(entry?.action || ''))}"></div>
      <div class="changelog-content">
        <div class="changelog-time">${ts}</div>
        <div class="changelog-text">${details || action}</div>
      </div>
    </div>
  `;
  }).join('');
}

function clientLogLevelLabel(level) {
  if (level === 'error') return '错误';
  if (level === 'warning') return '警告';
  if (level === 'info') return '信息';
  return level || '未知';
}

function formatClientLogTime(timestamp) {
  const value = Number(timestamp || 0);
  if (!Number.isFinite(value) || value <= 0) return '—';
  return new Date(value).toLocaleString();
}

function clientLogFilter() {
  const level = document.getElementById('client-log-level-filter')?.value || 'all';
  const category = document.getElementById('client-log-category-filter')?.value || 'all';
  const auditId = document.getElementById('client-log-audit-filter')?.value?.trim() || '';
  return { level, category, auditId, limit: 200 };
}

function checkpointStatusLabel(status) {
  if (status === 'error') return '错误';
  if (status === 'warning') return '警告';
  if (status === 'info') return '信息';
  if (status === 'ok') return '正常';
  return status || '—';
}

function renderCheckpointHealthSummary(health) {
  const el = document.getElementById('checkpoint-health-summary');
  if (!el) return;
  if (!health) {
    el.innerHTML = '<span>最近计时健康：暂无 checkpoint 记录</span>';
    return;
  }
  const gap = health.ledgerGap || {};
  const foreground = health.foreground || {};
  const media = health.media || {};
  const when = health.lastRunAt ? new Date(health.lastRunAt).toLocaleString() : '—';
  el.innerHTML = `
    <span>最近 checkpoint：${escHtml(when)}</span>
    <span>前台：${escHtml(checkpointStatusLabel(foreground.status))}${foreground.reason ? ` / ${escHtml(foreground.reason)}` : ''}</span>
    <span>媒体：${escHtml(checkpointStatusLabel(media.status))}${media.reason ? ` / ${escHtml(media.reason)}` : ''}</span>
    <span>缺口：${escHtml(gap.status || 'none')}${gap.reason ? ` / ${escHtml(gap.reason)}` : ''}</span>
    <span>连续失败：F${Number(health.consecutiveForegroundFailures || 0)} / M${Number(health.consecutiveMediaFailures || 0)}</span>
    <span>AuditID：${escHtml(health.auditId || '—')}</span>
  `;
}

function renderClientLogRows(logs = []) {
  const tableEl = document.getElementById('client-log-table-wrap');
  if (!tableEl) return;
  if (!logs.length) {
    tableEl.innerHTML = '<div style="color:var(--muted);text-align:center;padding:16px;">暂无系统日志</div>';
    return;
  }
  tableEl.innerHTML = `
    <table class="settlement-table">
      <thead>
        <tr>
          <th class="settlement-col-time">时间</th>
          <th class="settlement-col-type">等级</th>
          <th class="settlement-col-type">类别</th>
          <th class="settlement-col-reason">事件</th>
          <th class="settlement-col-domain">域名</th>
          <th class="settlement-col-reason">模块</th>
          <th>消息</th>
        </tr>
      </thead>
      <tbody>
        ${logs.map((log) => `
          <tr>
            <td>${escHtml(formatClientLogTime(log.timestamp))}</td>
            <td>${escHtml(clientLogLevelLabel(log.level))}</td>
            <td>${escHtml(log.category || '—')}</td>
            <td class="settlement-reason-cell">${escHtml(log.eventCode || '—')}</td>
            <td class="settlement-domain-cell" title="${escHtml(log.domain || '')}">${escHtml(log.domain || '—')}</td>
            <td class="settlement-reason-cell">${escHtml(log.module || '—')}</td>
            <td class="settlement-remark-cell">${escHtml(log.message || '')}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

async function renderClientLogsPage() {
  const summaryEl = document.getElementById('client-log-summary');
  const tableEl = document.getElementById('client-log-table-wrap');
  if (summaryEl) summaryEl.textContent = '加载中...';
  if (tableEl) tableEl.innerHTML = '<div style="color:var(--muted);text-align:center;padding:16px;">加载中...</div>';

  const refreshBtn = document.getElementById('client-log-refresh-btn');
  if (refreshBtn) refreshBtn.onclick = () => renderClientLogsPage();
  const clearBtn = document.getElementById('client-log-clear-btn');
  if (clearBtn) {
    clearBtn.onclick = async () => {
      if (!confirm('确定清理本机系统日志吗？此操作不影响云端数据或计时记录。')) return;
      await sendMsg({ type: 'CLEAR_CLIENT_LOGS' });
      await renderClientLogsPage();
    };
  }
  document.getElementById('client-log-level-filter')?.addEventListener('change', () => renderClientLogsPage(), { once: true });
  document.getElementById('client-log-category-filter')?.addEventListener('change', () => renderClientLogsPage(), { once: true });
  document.getElementById('client-log-audit-filter')?.addEventListener('change', () => renderClientLogsPage(), { once: true });

  const [status, payload, checkpointHealth] = await Promise.all([
    sendMsg({ type: 'GET_CLIENT_LOG_STATUS' }),
    sendMsg({ type: 'GET_CLIENT_LOGS', filter: clientLogFilter() }),
    sendMsg({ type: 'GET_TIMING_CHECKPOINT_HEALTH' }).catch(() => ({ ok: false, health: null })),
  ]);
  const logs = Array.isArray(payload?.logs) ? payload.logs : [];
  if (summaryEl) {
    const counts = status?.countsByLevel || {};
    const identity = status?.identity || {};
    summaryEl.innerHTML = `
      <span>总数：${Number(status?.total || 0)}</span>
      <span>error：${Number(counts.error || 0)}</span>
      <span>warning：${Number(counts.warning || 0)}</span>
      <span>info：${Number(counts.info || 0)}</span>
      <span>待上传：${Number(status?.pendingUploadCount || 0)}</span>
      <span>设备：${escHtml(identity.deviceId || '未绑定')}</span>
    `;
  }
  renderCheckpointHealthSummary(checkpointHealth?.health || null);
  renderClientLogRows(logs);
}



function escHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function getAdminEffectiveDailyRestLimit(config) {
  const dayKey = QUOTA_DAYS[(new Date().getDay() + 6) % 7];
  return buildEffectiveTimeQuota(config || {}).daily?.[dayKey]?.restMinutes ?? 120;
}
function escAttr(s) {
  return String(s).replace(/"/g,'&quot;');
}
function escId(s) {
  return String(s).replace(/[^a-zA-Z0-9_-]/g,'');
}
function normalizeAvatarColor(value) {
  const v = String(value || '').trim();
  if (/^#[0-9a-fA-F]{3,8}$/.test(v)) return v;
  return '#7c6fff';
}
