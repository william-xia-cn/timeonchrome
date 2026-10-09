(function (root) {
  const api = {
    platformLabel: (platform) => platform === 'macos' ? 'macOS' : platform === 'windows' ? 'Windows' : '未知平台',
    osLabel: (machine) => machine.osVersion || machine.windowsVersion || api.platformLabel(machine.platform),
    syncAt: (machine) => machine.lastSyncAtMs ?? machine.lastUploadAtMs,
    accountStatus: (user) => user.sessionActive === true ? '会话活动' : user.sessionActive === false ? '会话未活动' : '会话状态未报告',
    programPolicyStatus(user, nowMs = Date.now()) {
      const report = user.programInstancePolicy;
      if (!report) return '新版目录：未报告（不能由旧策略状态推断）';
      if (report.assignmentVersion !== user.assignmentVersion || user.protected !== true
        || !Number.isSafeInteger(report.receivedAtMs) || report.receivedAtMs > nowMs || nowMs - report.receivedAtMs > 600000)
        return '新版目录：未确认（报告已失效或分配变化）';
      const labels = { noSession: '无活动会话', unsupported: '当前会话未支持', pending: '等待接纳当前目录',
        partial: '部分会话尚未接纳', unknown: '当前接纳未确认' };
      if (report.currentState === 'accepted' && Number.isSafeInteger(report.catalogVersion) && report.catalogVersion > 0)
        return `新版目录：最近报告已接纳 v${report.catalogVersion}；不代表实际结束应用`;
      return `新版目录：${labels[report.currentState] || '当前接纳未确认'}`;
    },
    productBlockStatus: (machine) => machine.platform !== 'windows' ? '当前平台未报告产品级封锁能力'
      : machine.productBlockingCapability !== 'reported' ? '产品级封锁未覆盖（设备未报告执行能力）'
      : machine.policyState !== 'applied' ? '产品级封锁能力已报告，策略尚未生效'
      : '产品级封锁能力已报告；实际结束行为仍需实机验收',
    pairingName(platform) { if (!['windows', 'macos'].includes(platform)) throw new Error('请选择支持的平台'); return platform === 'macos' ? 'Mac 电脑' : 'Windows 电脑'; },
    releasePath: (platform) => platform === 'windows' ? '/v1/releases/windows/x64/latest' : null,
    installHint: (platform) => platform === 'macos'
      ? '已安装：打开 TimeWhere 的配对界面，填写下方 HTTPS 服务根地址、配对码及电脑名称。Mac 候选面向 Apple Silicon、macOS 13+；签名安装包尚待验收，暂无正式下载入口。未安装请向 Native 项目获取经确认的候选及安装指引；不要使用 Windows 安装器，也不要将开发 ZIP 当成已验收安装包。'
      : '在目标 Windows 电脑安装管理应用后输入配对码。当前在线安装包适用于 x64。',
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.AppRuntimeDevices = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
