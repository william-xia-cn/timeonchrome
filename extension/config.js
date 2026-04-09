// TimeOnChrome 插件配置
// 部署完成后，将 API_BASE 替换为你的 Workers 实际地址
// 格式：https://guardian-api.xxx.workers.dev

const GUARDIAN_CONFIG = {
  // Workers API 地址
  API_BASE: 'https://guardian-api.william-xia-cn.workers.dev',
  
  // 同步间隔（分钟）
  SYNC_INTERVAL_MINUTES: 15,
  
  // Session 上传时间（每天）
  UPLOAD_HOUR: 8,
  UPLOAD_MINUTE: 0,
  
  // 重试配置
  MAX_RETRY_ATTEMPTS: 3,
  RETRY_DELAY_MS: 5000,
  
  // 本地存储 Keys
  KEYS: {
    DEVICE_TOKEN: 'device_token',
    PROFILE_ID: 'profile_id',
    LAST_SYNC: 'last_sync',
    PENDING_STATS: 'pending_stats',
    PENDING_CHANGELOGS: 'pending_changelogs',
    LOCAL_CONFIG: 'local_config',
    CONFIG_VERSION: 'config_version'
  }
};

// 导出供其他模块使用
window.GUARDIAN_CONFIG = GUARDIAN_CONFIG;