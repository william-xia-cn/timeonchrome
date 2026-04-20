// TimeOnChrome - 同步模块
// 统一管理所有与服务器的通信

const GUARDIAN_CONFIG = window.GUARDIAN_CONFIG || {
  API_BASE: 'https://guardian-api.your-account.workers.dev',
  SYNC_INTERVAL_MINUTES: 15,
  UPLOAD_HOUR: 8,
  UPLOAD_MINUTE: 0,
  KEYS: {
    DEVICE_TOKEN: 'cloud_device_token',
    PROFILE_ID: 'cloud_profile_id',
    LAST_SYNC: 'cloud_last_sync',
    PENDING_STATS: 'pending_stats',
    PENDING_CHANGELOGS: 'pending_changelogs',
    LOCAL_CONFIG: 'local_config',
    CONFIG_VERSION: 'config_version'
  }
};

const Sync = {
  /**
   * 获取带鉴权的 headers
   */
  async getHeaders() {
    const token = await new Promise((resolve) => {
      chrome.storage.local.get(GUARDIAN_CONFIG.KEYS.DEVICE_TOKEN, (result) => {
        resolve(result[GUARDIAN_CONFIG.KEYS.DEVICE_TOKEN]);
      });
    });
    
    return {
      'Content-Type': 'application/json',
      'Authorization': token ? `Bearer ${token}` : ''
    };
  },

  /**
   * 通用请求方法（带重试）
   */
  async request(method, path, body = null, retries = 3) {
    const headers = await this.getHeaders();
    
    for (let attempt = 0; attempt < retries; attempt++) {
      try {
        const options = {
          method,
          headers
        };
        
        if (body && (method === 'POST' || method === 'PUT')) {
          options.body = JSON.stringify(body);
        }
        
        const resp = await fetch(`${GUARDIAN_CONFIG.API_BASE}${path}`, options);
        
        if (resp.ok) {
          const contentType = resp.headers.get('content-type');
          if (contentType && contentType.includes('application/json')) {
            return await resp.json();
          }
          return { success: true };
        }
        
        // 如果是 401（token 无效），不再重试
        if (resp.status === 401) {
          throw new Error('Unauthorized - please rebind');
        }
        
        const err = await resp.json().catch(() => ({ error: 'Request failed' }));
        console.error(`[Sync] Request failed: ${method} ${path}`, err);
        
      } catch (e) {
        console.error(`[Sync] Attempt ${attempt + 1} failed:`, e.message);
        if (e.message.includes('Unauthorized')) {
          throw e;
        }
      }
      
      // 重试前等待
      if (attempt < retries - 1) {
        await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
      }
    }
    
    throw new Error('Max retries exceeded');
  },

  /**
   * 拉取配置（启动时调用）
   */
  async pullConfig() {
    try {
      const result = await this.request('GET', '/device/config');
      
      // 保存到本地
      await new Promise((resolve) => {
        chrome.storage.local.set({
          [GUARDIAN_CONFIG.KEYS.LOCAL_CONFIG]: result.data,
          [GUARDIAN_CONFIG.KEYS.CONFIG_VERSION]: result.version,
          [GUARDIAN_CONFIG.KEYS.LAST_SYNC]: Date.now()
        }, resolve);
      });
      
      return result;
    } catch (e) {
      console.error('[Sync] Failed to pull config:', e.message);
      // 返回 null 表示使用本地缓存
      return null;
    }
  },

  /**
   * 上传统计（每 15 分钟）
   */
  async uploadStats(date, stats) {
    try {
      await this.request('POST', '/device/stats', { date, stats });
      console.log('[Sync] Stats uploaded:', date, stats.length, 'entries');
      return true;
    } catch (e) {
      console.error('[Sync] Failed to upload stats:', e.message);
      // 加入待重传队列
      await this.queuePendingStats(date, stats);
      return false;
    }
  },

  /**
   * 加入待重传队列
   */
  async queuePendingStats(date, stats) {
    const key = GUARDIAN_CONFIG.KEYS.PENDING_STATS;
    const data = await new Promise((resolve) => {
      chrome.storage.local.get(key, (r) => resolve(r[key] || {}));
    });
    
    data[date] = { stats, timestamp: Date.now() };
    
    await new Promise((resolve) => {
      chrome.storage.local.set({ [key]: data }, resolve);
    });
  },

  /**
   * 重传待上传的统计
   */
  async retryPendingStats() {
    const key = GUARDIAN_CONFIG.KEYS.PENDING_STATS;
    const data = await new Promise((resolve) => {
      chrome.storage.local.get(key, (r) => resolve(r[key] || {}));
    });
    
    const dates = Object.keys(data);
    if (dates.length === 0) return;
    
    console.log('[Sync] Retrying pending stats:', dates.length, 'dates');
    
    for (const date of dates) {
      const { stats } = data[date];
      try {
        await this.request('POST', '/device/stats', { date, stats });
        delete data[date];
        console.log('[Sync] Uploaded pending stats:', date);
      } catch (e) {
        console.error('[Sync] Failed to retry stats for', date);
      }
    }
    
    await new Promise((resolve) => {
      chrome.storage.local.set({ [key]: data }, resolve);
    });
  },

  /**
   * 上传 Session 文件（每天 08:00）
   */
  async uploadSessions(date, sessions) {
    try {
      await this.request('POST', '/device/sessions/upload', { date, sessions });
      console.log('[Sync] Sessions uploaded:', date, sessions.length, 'entries');
      return true;
    } catch (e) {
      console.error('[Sync] Failed to upload sessions:', e.message);
      return false;
    }
  },

  /**
   * 上传 Changelog
   */
  async uploadChangelog(action, beforeData, afterData) {
    try {
      await this.request('POST', '/device/changelog', {
        action,
        before_data: beforeData,
        after_data: afterData
      });
      return true;
    } catch (e) {
      console.error('[Sync] Failed to upload changelog:', e.message);
      return false;
    }
  },

  /**
   * 检查配置版本（是否需要更新）
   */
  async checkConfigVersion() {
    const localVersion = await new Promise((resolve) => {
      chrome.storage.local.get(GUARDIAN_CONFIG.KEYS.CONFIG_VERSION, (r) => {
        resolve(r[GUARDIAN_CONFIG.KEYS.CONFIG_VERSION] || 0);
      });
    });
    
    try {
      const result = await this.request('GET', '/device/config');
      const serverVersion = result.version || 0;
      
      return {
        needsUpdate: serverVersion > localVersion,
        serverVersion,
        localVersion,
        config: result.data
      };
    } catch (e) {
      return { needsUpdate: false, error: e.message };
    }
  }
};

// 导出
window.Sync = Sync;