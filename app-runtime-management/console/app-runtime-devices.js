(function (root) {
  const api = {
    userRegistrationPayload(values, children) {
      const localUserId=String(values.localUserId||'').trim(),displayName=String(values.displayName||'').trim();
      const selected=String(values.childIndex??'');
      if(!/^[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$/.test(localUserId))throw Error('请填写有效的43字符本机用户标识，不能填写用户名或SID。');
      if(!displayName||displayName.length>128||/[\u0000-\u001f\u007f]/.test(displayName))throw Error('请填写1至128字符的账户显示名称，不含控制字符。');
      if(!/^(0|[1-9]\d*)$/.test(selected)||!children[Number(selected)])throw Error('请主动选择指定孩子。');
      return {localUserId,displayName,childId:children[Number(selected)].id};
    },
    userRegistrationForm(machine, children) {
      if(machine.platform!=='windows'||machine.status==='revoked')return '';
      const safe=value=>String(value).replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
      return `<form id="preregister-user-form" class="drawer-section user-registration" data-machine-id="${safe(machine.id)}"><h3>首次登录前预登记</h3><p>仅为指定本机用户登记明确的孩子关联；不修改电脑默认关联，不创建Windows账户、设置密码或启用共享。</p><fieldset><label>本机用户标识<input name="localUserId" required maxlength="43" autocomplete="off" spellcheck="false" aria-describedby="preregister-user-hint"></label><small id="preregister-user-hint">填写本机准备工具生成的43字符标识，不是用户名或SID。</small><label>账户显示名称<input name="displayName" required maxlength="128" autocomplete="off"></label><label>指定孩子<select name="childIndex" required><option value="" selected>请选择孩子</option>${children.map((child,index)=>`<option value="${index}">${safe(child.name)}</option>`).join('')}</select></label><button type="submit">预登记并核对</button></fieldset><p class="registration-status" role="status" aria-live="polite"></p></form>`;
    },
    platformLabel: (platform) => platform === 'macos' ? 'macOS' : platform === 'windows' ? 'Windows' : '未知平台',
    osLabel: (machine) => machine.osVersion || machine.windowsVersion || api.platformLabel(machine.platform),
    syncAt: (machine) => machine.lastSyncAtMs ?? machine.lastUploadAtMs,
    accountStatus: (user) => user.sessionActive === true ? '会话活动' : user.sessionActive === false ? '会话未活动' : '会话状态未报告',
    programPolicyStatus(user, nowMs = Date.now()) {
      const report = user.programInstancePolicy;
      if (!report) return '新版目录：未报告（不能由旧策略状态推断）';
      if (report.assignmentVersion !== user.assignmentVersion || user.protected !== true
        || !Number.isSafeInteger(report.receivedAtMs) || report.receivedAtMs > nowMs || nowMs - report.receivedAtMs > 600000)
        return `${report.model === 'nativeApplication' ? '应用执行' : '新版目录'}：未确认（报告已失效或分配变化）`;
      if (report.model === 'nativeApplication') {
        if (report.currentState !== 'reported') return '应用执行：未确认（配置已变化或报告失效）';
        const result = report.latestResult;
        if (!result) return `应用配置 v${report.configurationVersion}：已报告；实际动作未报告`;
        const outcomes = {terminated:'已确认结束',failed:'执行失败',exit_unconfirmed:'结束未确认'};
        return `应用配置 v${report.configurationVersion}：最近动作${outcomes[result.outcome] || '结果未知'}（动作配置 v${result.configurationVersion}）`;
      }
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
