// bind.js - 设备绑定页面逻辑

// 首次安装时显示欢迎横幅
if (new URLSearchParams(location.search).get('welcome') === '1') {
  document.getElementById('welcomeBanner').style.display = 'block';
}

let accountToken = null;
let accountRefreshToken = null;
let profiles = [];
let selectedProfileId = null;

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
    if (!chrome.identity?.getProfileUserInfo) return {};
    const info = await chrome.identity.getProfileUserInfo({ accountStatus: 'ANY' });
    const id = typeof info?.id === 'string' ? info.id.trim() : '';
    if (!id) return {};
    return { chromeIdentityId: id };
  } catch (_) {
    return {};
  }
}

document.addEventListener('DOMContentLoaded', () => {
  // 绑定登录按钮事件
  const btnLogin = document.getElementById('btnLogin');
  if (btnLogin) {
    btnLogin.addEventListener('click', doLogin);
  }
});

async function doLogin() {
  const email = document.getElementById('email').value.trim().toLowerCase();
  const password = document.getElementById('password').value;
  const btn = document.getElementById('btnLogin');
  const error = document.getElementById('error1');
  
  if (!email || !password) {
    error.textContent = '请填写邮箱和密码';
    error.classList.add('show');
    return;
  }
  
  btn.disabled = true;
  btn.textContent = '登录中...';
  error.classList.remove('show');
  
  try {
    const resp = await fetch(`${window.GUARDIAN_CONFIG.API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    
    if (!resp.ok) {
      const err = await resp.json();
      throw new Error(err.error || '登录失败');
    }
    
    const data = await resp.json();
    accountToken = data.token;
    accountRefreshToken = data.refreshToken || null;
    
    // 获取 profile 列表
    const profilesResp = await fetch(`${window.GUARDIAN_CONFIG.API_BASE}/profiles`, {
      headers: { 'Authorization': `Bearer ${accountToken}` }
    });
    
    if (!profilesResp.ok) {
      throw new Error('获取孩子列表失败');
    }
    
    const profilesData = await profilesResp.json();
    profiles = profilesData.profiles || [];
    
    if (profiles.length === 0) {
      throw new Error('请先在家长后台创建孩子Profile');
    }
    
    // 显示 Step 2
    showStep('step2');
    renderProfiles();
    
  } catch (e) {
    error.textContent = e.message;
    error.classList.add('show');
  }
  
  btn.disabled = false;
  btn.textContent = '登录';
}

function renderProfiles() {
  const container = document.getElementById('profilesList');
  container.innerHTML = profiles.map(p => `
    <div class="profile-item" data-profile-id="${p.id}">
      <div class="avatar" style="background: ${p.avatar_color || '#00b894'}">
        ${p.name.charAt(0).toUpperCase()}
      </div>
      <span class="profile-name">${p.name}</span>
    </div>
  `).join('');

  // 绑定点击事件
  container.querySelectorAll('.profile-item').forEach(el => {
    el.addEventListener('click', () => {
      container.querySelectorAll('.profile-item').forEach(i => i.classList.remove('selected'));
      el.classList.add('selected');
      selectedProfileId = el.dataset.profileId;
      doBind(selectedProfileId);
    });
  });
}

async function doBind(profileId) {
  showStep('loading');
  
  try {
    const identityPayload = await getChromeIdentityPayload();
    const resp = await fetch(`${window.GUARDIAN_CONFIG.API_BASE}/device/bind`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accountToken}`
      },
      body: JSON.stringify({
        profile_id: profileId,
        device_name: 'Chrome Extension',
        platform: getClientPlatform(),
        browser: 'Chrome',
        ...identityPayload,
      })
    });
    
    if (!resp.ok) {
      const err = await resp.json();
      throw new Error(err.error || '绑定失败');
    }
    
    const data = await resp.json();
    
    // 保存账号会话（不保存可逆密码）
    const email = document.getElementById('email').value.trim().toLowerCase();
    
    // 保存到本地
    await new Promise((resolve) => {
      chrome.storage.local.set({
        cloud_device_token: data.device_token,
        cloud_device_id: data.device_id || null,
        cloud_profile_id: data.profile_id,
        account_token: accountToken,
        account_refresh_token: accountRefreshToken,
        cloud_account_email: email,
        cloud_credentials: null,
        cloud_last_sync: Date.now()
      }, resolve);
    });

    // 通知 background 初始化云同步
    let bindResult = null;
    try {
      bindResult = await chrome.runtime.sendMessage({ type: 'CLOUD_BIND' });
    } catch (_) {}

    // 根据同步结果显示不同提示
    const successIcon = document.getElementById('successIcon');
    const successTitle = document.getElementById('successTitle');
    const successMsg = document.getElementById('successMsg');

    if (bindResult && bindResult.success && !bindResult.syncOk) {
      successIcon.textContent = '!';
      successIcon.classList.add('warning');
      successTitle.textContent = '绑定成功，同步异常';
      const errorDetails = (bindResult.syncErrors || []).join('；');
      successMsg.innerHTML = '设备已绑定，但云同步部分步骤失败：<br><span style="color:#ff9500;font-size:12px">' +
        (errorDetails || '未知错误') + '</span><br>可在设置中手动触发同步。';
    } else if (bindResult && bindResult.error) {
      successIcon.textContent = '!';
      successIcon.classList.add('warning');
      successTitle.textContent = '绑定成功，同步失败';
      successMsg.innerHTML = '设备已绑定，但云同步未执行：<br><span style="color:#ff9500;font-size:12px">' +
        bindResult.error + '</span><br>可在设置中手动触发同步。';
    }

    showStep('step3');
    
    // 3 秒后关闭
    setTimeout(() => {
      window.close();
    }, 3000);
    
  } catch (e) {
    document.getElementById('error2').textContent = e.message;
    document.getElementById('error2').classList.add('show');
    showStep('step2');
  }
}

function showStep(id) {
  document.querySelectorAll('.step').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}
