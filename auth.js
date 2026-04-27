// TimeOnChrome - 绑定与认证模块
// 处理设备绑定、token 存储

// 使用 config.js 中已声明的 GC，不重复声明
const GC = window.GC || {
  API_BASE: 'https://guardian-api.your-account.workers.dev',
  KEYS: {
    DEVICE_TOKEN: 'cloud_device_token',
    PROFILE_ID: 'cloud_profile_id',
    LAST_SYNC: 'cloud_last_sync'
  }
};

const Auth = {
  /**
   * 检查是否已绑定
   */
  async isBound() {
    return new Promise((resolve) => {
      chrome.storage.local.get([GC.KEYS.DEVICE_TOKEN, GC.KEYS.PROFILE_ID], (result) => {
        const token = result[GC.KEYS.DEVICE_TOKEN];
        const profileId = result[GC.KEYS.PROFILE_ID];
        resolve(!!token && !!profileId);
      });
    });
  },

  /**
   * 获取 device_token
   */
  async getDeviceToken() {
    return new Promise((resolve) => {
      chrome.storage.local.get(GC.KEYS.DEVICE_TOKEN, (result) => {
        resolve(result[GC.KEYS.DEVICE_TOKEN] || null);
      });
    });
  },

  /**
   * 绑定设备
   */
  async bind(email, password, profileId, deviceName = 'Chrome Extension') {
    // 先登录获取 account_token
    const loginResp = await fetch(`${GC.API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });

    if (!loginResp.ok) {
      const err = await loginResp.json();
      throw new Error(err.error || 'Login failed');
    }

    const { token: accountToken } = await loginResp.json();

    // 获取孩子的 profile 列表
    const profilesResp = await fetch(`${GC.API_BASE}/profiles`, {
      headers: { 'Authorization': `Bearer ${accountToken}` }
    });

    if (!profilesResp.ok) {
      throw new Error('Failed to fetch profiles');
    }

    const { profiles } = await profilesResp.json();
    
    // 找到对应的 profile
    const profile = profiles.find(p => p.id === profileId);
    if (!profile) {
      throw new Error('Profile not found');
    }

    // 绑定设备
    const bindResp = await fetch(`${GC.API_BASE}/device/bind`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ profile_id: profileId, device_name: deviceName })
    });

    if (!bindResp.ok) {
      const err = await bindResp.json();
      throw new Error(err.error || 'Bind failed');
    }

    const { device_token, profile_id } = await bindResp.json();

    // 保存到本地
    await new Promise((resolve) => {
      chrome.storage.local.set({
        [GC.KEYS.DEVICE_TOKEN]: device_token,
        [GC.KEYS.PROFILE_ID]: profile_id,
        [GC.KEYS.LAST_SYNC]: Date.now()
      }, resolve);
    });

    return { device_token, profile_id };
  },

  /**
   * 解绑设备
   */
  async unbind() {
    return new Promise((resolve) => {
      chrome.storage.local.remove([
        GC.KEYS.DEVICE_TOKEN,
        GC.KEYS.PROFILE_ID,
        GC.KEYS.LAST_SYNC
      ], resolve);
    });
  },

  /**
   * 生成 Authorization header
   */
  async getAuthHeader() {
    const token = await this.getDeviceToken();
    return token ? `Bearer ${token}` : null;
  }
};

// 导出
window.Auth = Auth;