(function (root) {
  const api = {
    platformLabel: (platform) => platform === 'macos' ? 'macOS' : platform === 'windows' ? 'Windows' : '未知平台',
    osLabel: (machine) => machine.osVersion || machine.windowsVersion || api.platformLabel(machine.platform),
    syncAt: (machine) => machine.lastSyncAtMs ?? machine.lastUploadAtMs,
    accountStatus: (user) => user.sessionActive === true ? '会话活动' : user.sessionActive === false ? '会话未活动' : '会话状态未报告',
    pairingName(platform) { if (!['windows', 'macos'].includes(platform)) throw new Error('请选择支持的平台'); return platform === 'macos' ? 'Mac 电脑' : 'Windows 电脑'; },
    releasePath: (platform) => platform === 'windows' ? '/v1/releases/windows/x64/latest' : null,
    installHint: (platform) => platform === 'macos'
      ? '已安装：打开 TimeWhere 的配对界面，填写下方 HTTPS 服务根地址、配对码及电脑名称。Mac 候选面向 Apple Silicon、macOS 13+；签名安装包尚待验收，暂无正式下载入口。未安装请向 Native 项目获取经确认的候选及安装指引；不要使用 Windows 安装器，也不要将开发 ZIP 当成已验收安装包。'
      : '在目标 Windows 电脑安装管理应用后输入配对码。当前在线安装包适用于 x64。',
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.AppRuntimeDevices = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
