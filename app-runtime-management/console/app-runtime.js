(() => {
  const RUNTIME_API = 'https://timeonchrome-app-runtime-api.william-xia-cn.workers.dev';
  const MAIN_CONSOLE = 'https://timeonchrome-console.pages.dev/?launch=app-runtime';
  const mock = new URLSearchParams(location.search).has('mock');
  const categoryLabels = { study: '学习', composite: '复合', restrictedEntertainment: '受限娱乐', unclassified: '未归类', blocked: '黑名单' };
  const categoryColors = { study: '#178f6a', composite: '#4d9fd8', restrictedEntertainment: '#ed9f38', unclassified: '#9aa6a0', blocked: '#d64545' };
  const projectionReasonLabels = {
    INSTALLATION_PRODUCT: 'Windows 安装产品或可信平台主应用，可作为一个产品管理',
    COMPONENT: '明确的组件或辅助入口，不作为独立产品管理',
    DISCOVERY_CANDIDATE: '只有弱安装线索，等待可靠身份或家长确认',
    TECHNICAL_IDENTITY_ONLY: '只有技术进程或历史使用身份，尚未识别为产品',
    TECHNICAL_PRODUCT_REVIEW: '安装记录具有维护、运行库或安装器语义，等待家长确认',
    AMBIGUOUS_INSTALLATION_PRODUCTS: '多个安装记录同名但缺少可靠关联，不能自动合并',
    POSSIBLE_PRODUCT_VARIANT: '可能属于现有安装产品，缺少可靠关联，未单独列入主目录',
    UNCONFIRMED_APPLICATION_VARIANT: '发现到独立启动入口或运行身份，尚未确认产品归属',
  };
  const viewText = {
    usage: ['使用统计', '查看电脑应用主使用账本'], access: ['应用访问管理', '管理独立配额、七天时间段和配置文件'],
    apps: ['应用管理', '管理安装发现、产品确认与孩子分类规则'], devices: ['设备管理', '管理电脑、账户分配与运行状态'],
    system: ['系统管理', '查看系统日志、技术进程、主账本、辅助媒体和运行健康'],
  };
  const state = { period: 'day', offset: 0, session: null, childId: null, children: [], machines: [], users: new Map(), policy: AppRuntimePolicy.defaultPolicy(), policyEtag: '"app-policy-v0"', loggingPolicy: null, loggingPolicyEtag: null, records: { pending: [], processed: [], technical: [] }, catalog: { items: [], technicalItems: [] }, usage: {}, runtimeLogs: { range: 'today', items: [], nextCursor: null, summary: null }, timer: null, view: 'usage', appCategory: 'unclassified', actionApps: [], quotaApps: [], loaded: false };
  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => [...document.querySelectorAll(selector)];
  const escape = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const duration = (ms = 0) => ms < 60000 ? (ms ? '少于 1 分钟' : '0 分钟') : `${Math.floor(ms / 3600000) ? `${Math.floor(ms / 3600000)} 小时 ` : ''}${Math.round(ms % 3600000 / 60000)} 分钟`;
  const time = (ms) => ms ? new Date(ms).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' }) : '尚未同步';
  const child = (id) => state.children.find((item) => item.id === id);
  const childIndex = (id) => String(state.children.findIndex((item) => item.id === id));
  const childFromIndex = (value) => state.children[Number(value)] || null;
  const range = () => AppRuntimeTime.beijingRange(state.period, state.offset);
  const policyLabel = (value) => ({ pending: '待下发', cached: '已缓存', applied: '当前会话已生效', failed: '失败', offline: '离线' })[value] || '待下发';
  const statusLabel = (value) => ({ online: '在线', recentlyOnline: '最近在线', offline: '离线', revoked: '已吊销' })[value] || value;

  function showError(error) {
    const message = AppRuntimeNetwork.friendlyError(error).message;
    $('#status-strip').className = 'error';
    if (!state.loaded) {
      document.querySelector('main').classList.remove('initial-load-pending');
      document.querySelector('main').classList.add('initial-load-failed');
      $('#status-strip').hidden = true;
      $('#load-empty-message').textContent = message;
      $('#load-preview-hint').hidden = !(location.protocol === 'file:' || ['localhost', '127.0.0.1'].includes(location.hostname));
      $('#load-empty-state').hidden = false;
      return;
    }
    $('#status-message').textContent = message; $('#retry').hidden = false; $('#status-strip').hidden = false;
  }
  function showSuccess(message) { $('#status-strip').className = 'success'; $('#status-message').textContent = message; $('#retry').hidden = true; $('#status-strip').hidden = false; setTimeout(() => { if ($('#status-strip').className === 'success' && $('#status-message').textContent === message) clearError(); }, 3500); }
  function clearError() { $('#status-strip').hidden = true; }
  function setLoading(active) { const main = document.querySelector('main'); main.setAttribute('aria-busy', String(active)); $('#refresh').disabled = active; if (active) { if (!state.loaded) { main.classList.add('initial-load-pending'); main.classList.remove('initial-load-failed'); $('#load-empty-state').hidden = true; } $('#status-strip').className = 'loading'; $('#status-message').textContent = '正在加载 Runtime 数据…'; $('#retry').hidden = true; $('#status-strip').hidden = false; } else if ($('#status-strip').className === 'loading') clearError(); }
  function markLoaded() { state.loaded = true; const main = document.querySelector('main'); main.classList.remove('initial-load-pending', 'initial-load-failed'); $('#load-empty-state').hidden = true; }
  async function issue() {
    state.session = AppRuntimeSession.load(sessionStorage);
    if (!state.session && window.__runtimeLaunchTicket) {
      const ticket = window.__runtimeLaunchTicket;
      window.__runtimeLaunchTicket = null;
      const response = await fetch(`${RUNTIME_API}/v2/auth/browser-sessions`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ticket }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error?.message || '登录凭据无效或已过期，请从家长控制台重新进入');
      AppRuntimeSession.save(sessionStorage, payload);
      state.session = payload;
    }
    if (!state.session) throw new Error('请从 TimeOnChrome 家长控制台进入电脑应用管理');
    state.children = state.session.children;
    const selected = child(state.childId) || state.children[0];
    if (!selected) throw new Error('当前账户还没有孩子档案');
    state.childId = selected.id;
    renderChildPicker();
  }
  async function moduleToken(renew = false) {
    if (renew) {
      AppRuntimeSession.clear(sessionStorage);
      state.session = null;
      location.assign(MAIN_CONSOLE);
      throw new Error('Runtime 会话已过期，正在返回家长控制台');
    }
    if (!state.session) await issue();
    return state.session.token;
  }
  async function runtime(path, options = {}) { return AppRuntimeNetwork.requestJson({ url: `${RUNTIME_API}${path}`, options, getToken: moduleToken, authorizationScheme: 'RuntimeSession' }); }

  function mockData() {
    const dayStart = AppRuntimeTime.beijingRange('day').from;
    state.children = [{ id: 'demo-a', name: '小明' }, { id: 'demo-b', name: '小华' }]; state.childId = 'demo-a';
    state.machines = [{ id: 'machine-a', displayName: 'INTELMINIPC-XW', platform: 'windows', status: 'online', defaultChildId: 'demo-a', serviceVersion: '2.0.6', windowsVersion: 'Windows 11', architecture: 'x64', lastSeenAtMs: Date.now() - 120000, lastUploadAtMs: Date.now() - 180000, desiredPolicyVersion: 9, appliedPolicyVersion: 9, policyState: 'applied', tamperCount: 1 }, { id: 'machine-b', displayName: '书房 Mac', platform: 'macos', status: 'offline', defaultChildId: 'demo-a', serviceVersion: null, windowsVersion: 'macOS 15', architecture: 'arm64', lastSeenAtMs: Date.now() - 86400000, desiredPolicyVersion: 3, appliedPolicyVersion: 2, policyState: 'offline', tamperCount: 0 }];
    state.users.set('machine-a', [{ localUserId: 'opaque-a', displayName: 'William', childId: 'demo-a', protected: true, assignmentSource: 'default', policyState: 'applied', sessionActive: true }, { localUserId: 'opaque-b', displayName: 'Guest', childId: null, protected: false, assignmentSource: 'unprotected', policyState: 'cached', sessionActive: false }]);
    state.users.set('machine-b', [{ localUserId: 'opaque-c', displayName: 'Pierce', childId: 'demo-a', protected: true, assignmentSource: 'default', policyState: 'offline', sessionActive: false }]);
    state.policy = AppRuntimePolicy.normalize({ version: 4, effectiveAtMs: Date.now() - 3600000, classifications: [
      { platform: 'windows', runtimeIdentity: 'app:vscode', displayName: 'Visual Studio Code', classification: 'study' },
      { platform: 'windows', runtimeIdentity: 'app:edge', displayName: 'Microsoft Edge', classification: 'composite' },
      { platform: 'windows', runtimeIdentity: 'app:game', displayName: 'Minecraft', classification: 'restrictedEntertainment' },
      { platform: 'macos', runtimeIdentity: 'app:chat', displayName: 'WeChat', classification: 'blocked' },
    ], quotas: { dailyCategoryMinutes: { study: null, composite: 120, restrictedEntertainment: 60, unclassified: 30 }, weeklyRestrictedEntertainmentMinutes: 240, perApplicationDailyMinutes: [{ platform: 'windows', runtimeIdentity: 'app:game', minutes: 45 }] } });
    state.policyEtag = '"app-policy-v4"';
    state.records = { windowStartMs: Date.now() - 30 * 86400000, windowEndMs: Date.now(), pending: [{ platform: 'windows', runtimeIdentity: 'app:calc', displayName: '计算器', firstSeenAtMs: dayStart, lastSeenAtMs: Date.now() - 600000, mainDurationMs: 420000, machineCount: 1, userCount: 1, classification: 'unclassified', status: 'pending', manageability: 'actionable', catalogKind: 'application' }], processed: state.policy.classifications.filter((item) => item.runtimeIdentity !== 'app:chat').map((item) => ({ ...item, firstSeenAtMs: dayStart - 86400000, lastSeenAtMs: Date.now(), mainDurationMs: 1800000, machineCount: 1, userCount: 1, status: 'processed', manageability: 'actionable', catalogKind: 'application' })), technical: [] };
    state.catalog = { windowStartMs: Date.now() - 30 * 86400000, windowEndMs: Date.now(), items: [
      { ...state.policy.classifications.find((item) => item.runtimeIdentity === 'app:vscode'), firstSeenAtMs: dayStart - 86400000, lastSeenAtMs: Date.now() - 300000, mainDurationMs: 4320000, machineCount: 1, userCount: 1, observedInWindow: true },
      { ...state.policy.classifications.find((item) => item.runtimeIdentity === 'app:edge'), firstSeenAtMs: dayStart - 86400000, lastSeenAtMs: Date.now() - 420000, mainDurationMs: 2880000, machineCount: 1, userCount: 1, observedInWindow: true },
      { ...state.policy.classifications.find((item) => item.runtimeIdentity === 'app:game'), firstSeenAtMs: dayStart - 86400000, lastSeenAtMs: Date.now() - 900000, mainDurationMs: 2100000, machineCount: 1, userCount: 1, observedInWindow: true },
      { ...state.policy.classifications.find((item) => item.runtimeIdentity === 'app:chat'), firstSeenAtMs: null, lastSeenAtMs: null, mainDurationMs: 0, machineCount: 0, userCount: 0, observedInWindow: false },
      ...state.records.pending,
    ].map((item) => ({ ...item, manageability: 'actionable', catalogKind: item.productId ? 'product' : 'application' })), technicalItems: [
      { platform: 'windows', displayName: 'wixstdba', catalogKind: 'unresolved', manageability: 'review', projectionReasonCode: 'TECHNICAL_IDENTITY_ONLY', lastSeenAtMs: Date.now() - 1800000, mainDurationMs: 360000, machineCount: 1, userCount: 1 },
      { platform: 'windows', displayName: 'Updater helper', catalogKind: 'component', manageability: 'hidden', projectionReasonCode: 'COMPONENT', lastSeenAtMs: null, mainDurationMs: 0, machineCount: 1, userCount: 1 },
    ] };
    state.mockInventory = state.catalog.items.map((item,index)=>({status:'installed',evidence:{platform:item.platform,runtimeIdentity:item.runtimeIdentity,displayName:item.displayName,values:{binaryHash:(index+1).toString(16).padStart(64,'0'),signerKey:'a'.repeat(64),productName:item.displayName},verifiedFields:['binaryHash','signerKey']}}));
    const requestedFixtures=Number(new URLSearchParams(location.search).get('inventoryFixtures'));
    const inventoryFixtures=Number.isSafeInteger(requestedFixtures)?Math.max(0,Math.min(200,requestedFixtures)):0;
    for(let index=state.mockInventory.length;index<inventoryFixtures;index++)state.mockInventory.push({status:'installed',evidence:{platform:index%2?'windows':'macos',runtimeIdentity:`fixture:application-${index}`,displayName:`受控应用夹具 ${index+1}`,values:{binaryHash:(index+1).toString(16).padStart(64,'0')},verifiedFields:['binaryHash']}});
    state.mockKnowledge = {schemaVersion:1,version:1,products:[{id:'fixture-game',name:'Minecraft',type:'game',selectors:[{platform:'windows',match:{operator:'all',conditions:[{field:'binaryHash',value:state.mockInventory[2].evidence.values.binaryHash}]}}]}],rules:[],bindings:[{childId:'demo-a',products:[{productId:'fixture-game',classification:'restrictedEntertainment'}],ruleIds:[]}]};
    if (new URLSearchParams(location.search).has('inventoryQuality')) {
      const fixture=(runtimeIdentity,displayName,role)=>({platform:'windows',runtimeIdentity,displayName,classification:'unclassified',installationState:'installed',observedInWindow:false,mainDurationMs:0,machineCount:1,userCount:1,discovery:{role,nameSource:role==='component'?'fallback':'appList',sourceKinds:['package']},catalogKind:role,manageability:role==='application'?'actionable':role==='component'?'hidden':'review',projectionReasonCode:role==='component'?'COMPONENT':role==='candidate'?'DISCOVERY_CANDIDATE':'VERIFIED_APPLICATION'});
      state.catalog.items.push(fixture('fixture:unused','已安装未使用播放器','application'));
      state.catalog.items.push({platform:'windows',runtimeIdentity:null,displayName:'记事本',classification:'unclassified',installationState:'installed',observedInWindow:true,mainDurationMs:180000,machineCount:1,userCount:1,catalogKind:'product',manageability:'actionable',projectionReasonCode:'INSTALLATION_PRODUCT',runtimeImplementations:[{platform:'windows',runtimeIdentity:'fixture:notepad-main',displayName:'记事本'}],variants:[{displayName:'记事本',platform:'windows',variantRole:'main',installationState:'installed',manageability:'actionable',classification:'unclassified'}]});
      state.catalog.items.push({platform:'windows',runtimeIdentity:null,displayName:'LibreOffice',classification:'unclassified',installationState:'installed',observedInWindow:false,mainDurationMs:0,machineCount:1,userCount:1,catalogKind:'product',manageability:'actionable',projectionReasonCode:'INSTALLATION_PRODUCT',runtimeImplementations:[{platform:'windows',runtimeIdentity:'fixture:writer',displayName:'LibreOffice Writer'},{platform:'windows',runtimeIdentity:'fixture:calc',displayName:'LibreOffice Calc'}],variants:[{displayName:'LibreOffice Writer',platform:'windows',variantRole:'suiteMember',installationState:'installed',manageability:'actionable',classification:'unclassified'},{displayName:'LibreOffice Calc',platform:'windows',variantRole:'suiteMember',installationState:'installed',manageability:'actionable',classification:'unclassified'},{displayName:'LibreOffice Safe Mode',platform:'windows',variantRole:'suiteMember',installationState:'installed',manageability:'actionable',classification:'unclassified'}]});
      state.catalog.technicalItems.push(fixture('fixture:helper','隐藏组件入口','component'),fixture('fixture:candidate','弱安装候选','candidate'),
        {...fixture('fixture:runtime','Microsoft Visual C++ Redistributable','candidate'),projectionReasonCode:'TECHNICAL_PRODUCT_REVIEW'},
        {...fixture('fixture:standalone','Administrative Tools','candidate'),projectionReasonCode:'UNCONFIRMED_APPLICATION_VARIANT'});
      state.catalog.inventoryScans=[{machineName:'受控测试电脑',status:'syncing',receivedBatches:1,expectedBatches:3,observationCount:401,failedSources:[],updatedAtMs:Date.now()},{machineName:'受控测试电脑',status:'completeWithWarnings',receivedBatches:2,expectedBatches:2,observationCount:24,failedSources:[],sourceResults:[{source:'registry-machine',status:'complete',warningCodes:[]},{source:'start-menu-common',status:'complete_with_warnings',warningCodes:['SHORTCUT_TARGET_UNAVAILABLE']}],updatedAtMs:Date.now()},{machineName:'旧版测试电脑',status:'unverified',receivedBatches:0,expectedBatches:0,observationCount:0,failedSources:[],updatedAtMs:null}];
    }
    state.runtimeLogs = { range: 'today', nextCursor: null, summary: { total: 4, error: 1, warning: 1, info: 2 }, items: [
      { id: 'log-4', timestampMs: Date.now() - 60000, level: 'info', category: 'service', eventCode: 'heartbeat_succeeded', machineName: 'INTELMINIPC-XW', platform: 'windows', module: 'heartbeat-loop', message: 'heartbeat_succeeded', source: 'terminal' },
      { id: 'log-3', timestampMs: Date.now() - 120000, level: 'warning', category: 'security', eventCode: 'session_agent_terminated', machineName: 'INTELMINIPC-XW', platform: 'windows', module: 'session-supervisor', message: 'session_agent_terminated', source: 'terminal' },
      { id: 'log-2', timestampMs: Date.now() - 900000, level: 'error', category: 'accounting', eventCode: 'identityConflict', machineName: 'INTELMINIPC-XW', platform: 'windows', module: 'accounting-state-machine', message: '状态机记录了一个不计时的诊断边界。' },
      { id: 'log-1', timestampMs: Date.now() - 3600000, level: 'info', category: 'accounting', eventCode: 'sameMillisecondBoundary', machineName: '书房 Mac', platform: 'macos', module: 'accounting-state-machine', message: '状态机记录了一个不计时的诊断边界。' },
    ] };
    state.loggingPolicy = { version: 3, enabled: true, minLevel: 'warning', categories: ['service','session','policy','upload','storage','security','accounting'], expiresAtMs: Date.now() + 3 * 86400000 };
    state.loggingPolicyEtag = '"logging-machine-a-3"';
    state.usage = { totalDurationMs: 9720000, appPolicyVersion: 4, estimatedSegmentCount: 2, buckets: Array.from({ length: 24 }, (_, index) => ({ startAtMs: dayStart + index * 3600000, durationMs: [0,0,0,0,0,0,0,0,900000,1800000,1200000,600000,300000,1500000,2100000,720000,0,600000,0,0,0,0,0,0][index] })), categories: [{ classification: 'study', durationMs: 4320000, quota: { limitMs: null, exceeded: false } }, { classification: 'composite', durationMs: 2880000, quota: { limitMs: 7200000, remainingMs: 4320000, exceeded: false } }, { classification: 'restrictedEntertainment', durationMs: 2100000, quota: { limitMs: 3600000, remainingMs: 1500000, exceeded: false } }, { classification: 'unclassified', durationMs: 420000, quota: { limitMs: 1800000, remainingMs: 1380000, exceeded: false } }], applications: [{ platform: 'windows', runtimeIdentity: 'app:vscode', displayName: 'Visual Studio Code', classification: 'study', durationMs: 4320000, quota: { limitMs: null, exceeded: false } }, { platform: 'windows', runtimeIdentity: 'app:edge', displayName: 'Microsoft Edge', classification: 'composite', durationMs: 2880000, quota: { limitMs: null, exceeded: false } }, { platform: 'windows', runtimeIdentity: 'app:game', displayName: 'Minecraft', classification: 'restrictedEntertainment', durationMs: 2100000, quota: { limitMs: 2700000, remainingMs: 600000, exceeded: false } }], outsideTimeWindows: { durationMs: 780000, segmentCount: 2 }, mediaPlaybackTotalMs: 3600000 };
  }

  function renderChildPicker() { const select = $('#child-select'); select.innerHTML = state.children.map((item, index) => `<option value="${index}"${item.id === state.childId ? ' selected' : ''}>${escape(item.name)}</option>`).join('') || '<option>未登录</option>'; select.disabled = state.children.length === 0; }
  function renderFilters() { const machine = $('#machine-filter'); const selected = machine.value; machine.innerHTML = '<option value="">全部电脑</option>' + state.machines.filter((item) => item.status !== 'revoked').map((item) => `<option value="${escape(item.id)}">${escape(item.displayName || '电脑')}</option>`).join(''); machine.value = selected; const users = $('#user-filter'); const source = selected ? state.users.get(selected) || [] : [...state.users.values()].flat(); const unique = new Map(source.map((item) => [item.localUserId, item])); const userSelected = users.value; users.innerHTML = '<option value="">全部本机用户</option>' + [...unique.values()].map((item) => `<option value="${escape(item.localUserId)}">${escape(item.displayName)}</option>`).join(''); users.value = userSelected; }
  function renderUsage() {
    const usage = state.usage || {};
    $('#total-time').textContent = duration(usage.totalDurationMs);
    $('#last-sync').textContent = time(Math.max(0, ...state.machines.map((item) => Number(item.lastUploadAtMs || item.lastSeenAtMs || 0))));
    $('#policy-version').textContent = `应用策略 v${usage.appPolicyVersion || state.policy.version || 0}`;
    const exceeded = [...(usage.categories || []), ...(usage.applications || [])].some((item) => item.quota?.exceeded);
    $('#quota-state').textContent = exceeded ? '存在超额' : '额度充足';
    $('#quota-state').classList.toggle('danger-text', exceeded);
    const buckets = usage.buckets || [];
    const max = Math.max(1, ...buckets.map((item) => item.durationMs));
    const categoryTotal = Math.max(1, (usage.categories || []).reduce((sum, item) => sum + Number(item.durationMs || 0), 0));
    $('#usage-chart').innerHTML = buckets.map((item) => {
      const parts = item.categories?.length ? item.categories : (usage.categories || []).map((category) => ({ classification: category.classification, durationMs: item.durationMs * category.durationMs / categoryTotal }));
      const stack = parts.map((part) => `<i class="bar-part" title="${categoryLabels[part.classification] || '未归类'} ${duration(part.durationMs)}" style="height:${item.durationMs ? part.durationMs / item.durationMs * 100 : 0}%;background:${categoryColors[part.classification] || categoryColors.unclassified}"></i>`).join('');
      const label = state.period === 'day' ? AppRuntimeTime.beijingHourLabel(item.startAtMs) : new Date(item.startAtMs).toLocaleDateString('zh-CN', { weekday: 'short', timeZone: 'Asia/Shanghai' });
      return `<div class="bar" title="${duration(item.durationMs)}" style="height:${Math.max(2, item.durationMs / max * 100)}%">${stack}<span class="bar-label">${label}</span></div>`;
    }).join('');
    $('#category-legend').innerHTML = (usage.categories || []).map((item) => `<span><i style="background:${categoryColors[item.classification] || categoryColors.unclassified}"></i>${categoryLabels[item.classification]} ${duration(item.durationMs)}</span>`).join('') + ($('#media-toggle').checked ? `<span><i style="background:#9b8ee8"></i>辅助媒体 ${duration(usage.mediaPlaybackTotalMs || 0)}</span>` : '');
    $('#app-ranking').className = 'list';
    $('#app-ranking').innerHTML = (usage.applications || []).length ? usage.applications.map((item, index) => `<button class="app-row" data-usage-app="${escape(index)}"><span class="app-icon">${index + 1}</span><div class="app-meta"><strong>${escape(item.displayName || '未知应用')}</strong><small>${escape(item.platform)} · ${categoryLabels[item.classification] || '未归类'}</small></div><div><strong>${duration(item.durationMs)}</strong><small class="quota-pill ${item.quota?.exceeded ? 'exceeded' : ''}">${item.quota?.limitMs == null ? '无限制' : item.quota.exceeded ? '已超额' : `剩余 ${duration(item.quota.remainingMs)}`}</small></div></button>`).join('') : '暂无使用记录';
    $('#category-ranking').className = 'list';
    $('#category-ranking').innerHTML = (usage.categories || []).map((item) => `<button class="category-row" data-usage-category="${escape(item.classification)}"><span class="app-icon">${categoryLabels[item.classification]?.slice(0, 1) || '?'}</span><div><strong>${categoryLabels[item.classification]}</strong><small>${item.quota?.limitMs == null ? '无限制' : `额度 ${duration(item.quota.limitMs)}`}</small></div><strong>${duration(item.durationMs)}</strong></button>`).join('') || '暂无分类记录';
  }

  function observedApps() {
    const applications = new Map();
    const directory=(state.catalog.items || []).flatMap(item=>item.runtimeImplementations?.length?item.runtimeImplementations.map(implementation=>({...item,...implementation})):[item]);
    for (const item of [...directory, ...state.policy.classifications]) {
      if (!item.runtimeIdentity) continue; // Product rows never invent a quota/technical identity.
      const key = AppRuntimePolicy.keyOf(item);
      const current = applications.get(key) || {};
      const classification = state.policy.classifications.find((entry) => AppRuntimePolicy.keyOf(entry) === key)?.classification;
      applications.set(key, { ...current, ...item, classification: classification || item.classification || 'unclassified' });
    }
    return [...applications.values()];
  }
  function categoryCounts(category) {
    const members = directoryMembers(category);
    return { total: members.length, windows: members.filter((item) => item.platform === 'windows').length, macos: members.filter((item) => item.platform === 'macos').length };
  }
  function directoryMembers(category) {
    const scope = $('#directory-scope').value;
    if (scope === 'usage') return category === 'unclassified' ? state.records.pending || []
      : (state.catalog.items || []).filter(item=>item.classification===category&&item.observedInWindow);
    return (state.catalog.items || []).filter(item=>item.classification===category)
      .filter(item=>scope==='all'||scope==='unused' ? scope==='all'||item.installationState==='installed'&&!item.observedInWindow
        : item.observedInWindow||item.classification!=='unclassified'||item.catalogKind==='product'||item.catalogKind==='application');
  }
  function classificationActions(app, selected = 'unclassified') {
    if (app.manageability !== 'actionable') return '';
    const index = state.actionApps.push(app) - 1;
    return ['study','composite','restrictedEntertainment','blocked','unclassified'].map((category) => `<button data-classify-index="${index}" data-classification="${category}"${category === selected ? ' class="current" disabled' : ''}>${category === 'unclassified' ? '暂不归类' : `归为${categoryLabels[category]}`}</button>`).join('');
  }
  function visibleProductVariants(app) {
    const variants = Array.isArray(app.variants) ? app.variants : [];
    if (variants.length !== 1) return variants;
    const variant = variants[0];
    const normalize = (value) => String(value || '').trim().replace(/\s+/g, ' ').toLocaleLowerCase();
    return variant.variantRole === 'main' && !variant.splitManaged
      && normalize(variant.displayName) === normalize(app.displayName) ? [] : variants;
  }
  function appRow(app, selected) {
    const recent = app.lastSeenAtMs ? time(app.lastSeenAtMs) : '最近 30 天无使用';
    const mainDuration = app.mainDurationMs ?? app.durationMs ?? 0;
    const coverage = `${Number(app.machineCount || 0)} 台电脑 · ${Number(app.userCount || 0)} 个本机账户`;
    const installation = ({installed:'已安装',preconfigured:'预配置，尚未发现',usedNotDiscovered:'使用过，当前未发现'})[app.installationState];
    const note = app.discovery?.role === 'component' ? '组件入口（不豁免使用计时）' : app.discovery?.role === 'candidate' ? '安装候选，尚无可靠主程序关联' : '';
    const fallback = app.discovery?.nameSource === 'fallback' ? '名称未解析，显示包入口回退' : '';
    const actions = classificationActions(app, selected);
    const variants = visibleProductVariants(app);
    const variantDetails = variants.length ? `<details class="product-variants"><summary>${variants.length} 个产品变体</summary><div>${variants.map((variant) => `<article><strong>${escape(variant.displayName || '未命名变体')}</strong><span>${variant.platform === 'macos' ? 'macOS' : 'Windows'} · ${{main:'主入口',suiteMember:'套件入口',maintenance:'维护入口',helper:'辅助组件',hosted:'宿主内容',unknown:'待确认'}[variant.variantRole] || '待确认'} · ${variant.splitManaged ? '已拆分管理' : '继承产品设置'}</span></article>`).join('')}</div><button type="button" data-manage-variants>管理／拆分变体</button></details>` : '';
    return `<article class="record-card product-record"><div class="app-record-main"><span class="app-icon">${escape((app.displayName || '?').slice(0, 1))}</span><div><strong>${escape(app.displayName || '未知应用')}</strong><p><span class="platform-chip ${escape(app.platform)}">${app.platform === 'macos' ? 'macOS' : 'Windows'}</span> · 最近使用 ${recent}${installation?` · ${installation}`:''}${variants.length?` · ${variants.length} 个变体`:''}</p><p>最近 30 天主账本 ${duration(mainDuration)} · ${coverage}</p>${app.classificationReason?`<p>${escape(app.classificationReason)}</p>`:''}${note||fallback?`<p>${escape([note,fallback].filter(Boolean).join(' · '))}</p>`:''}${variantDetails}</div></div>${actions?`<div class="record-actions" aria-label="${escape(app.displayName || '未知应用')} 分类操作">${actions}</div>`:''}</article>`;
  }
  function renderAppDirectory() {
    state.actionApps = [];
    const catalog = [
      ['study', '▣', '学习应用'], ['composite', '∞', '复合应用'],
      ['restrictedEntertainment', '♟', '受限娱乐应用'], ['blocked', '⊗', '黑名单应用'],
      ['unclassified', '◉', '已使用未归类应用'],
    ];
    $('#app-category-nav').innerHTML = catalog.map(([category, icon, label]) => {
      const count = categoryCounts(category);
      const stats = category === 'unclassified'
        ? [['待处理', count.total], ['窗口', '最近 30 天']]
        : [['应用', count.total], ['Windows', count.windows], ['macOS', count.macos]];
      const meta = stats.map(([name, value]) => `<span class="app-category-stat"><b>${name}</b><em>${value}</em></span>`).join('');
      return `<button class="app-category-item ${state.appCategory === category ? 'active' : ''}" data-app-category="${category}"><span class="app-category-icon">${icon}</span><div class="app-category-copy"><strong>${label}</strong><small class="app-category-stats">${meta}</small></div></button>`;
    }).join('');
    const search = ($('#app-search').value || '').trim().toLowerCase();
    const platform = $('#management-platform').value;
    const filter = (item) => (!platform || item.platform === platform) && (!search || String(item.displayName || '').toLowerCase().includes(search));
    const current = state.appCategory;
    const source = directoryMembers(current);
    const list = source.filter(filter).sort((left, right) => Number(right.lastSeenAtMs || 0) - Number(left.lastSeenAtMs || 0));
    $('#app-directory-title').textContent = current === 'unclassified' ? ($('#directory-scope').value==='usage'?'已使用未归类应用':'未归类应用 · 安装发现与使用观察') : `${categoryLabels[current]}应用`;
    $('#app-directory-subtitle').textContent = current === 'unclassified'
      ? `当前范围待处理 ${source.length} 个 · 使用证据最近 30 天；安装发现不生成账本，归类仅向前生效`
      : `应用 ${categoryCounts(current).total} · Windows ${categoryCounts(current).windows} · macOS ${categoryCounts(current).macos}`;
    $('#managed-app-list').innerHTML = list.length ? list.map((item) => appRow(item, current)).join('') : '<p class="empty">当前目录没有符合条件的应用</p>';
    const history = (state.records.processed || []).filter(filter);
    $('#processed-history').hidden = current !== 'unclassified';
    $('#processed-records').innerHTML = history.length ? history.map((item) => appRow(item, item.classification)).join('') : '<p class="empty">暂无已处理历史</p>';
    $('#processed-count').textContent = history.length;
    const scans = state.catalog.inventoryScans || [];
    $('#inventory-status').innerHTML = scans.length ? scans.map((scan,index)=>{const sourceResults=scan.sourceResults||[];const sourceSummary=sourceResults.length?`<span class="inventory-sources">${sourceResults.map(source=>`<b class="source-${escape(source.status)}">${escape(source.source)}：${source.status==='complete'?'成功':source.status==='complete_with_warnings'?`警告 ${Number(source.warningCodes?.length||0)}`:'失败'}</b>`).join('')}</span>`:'';return `<span>${escape(scan.machineName)} · 账户盘点 ${index+1}：${({complete:'该用户盘点完整',completeWithWarnings:'已完成，含单项警告',syncing:'同步中',partial:'部分来源失败',unverified:'尚未验证（未盘点或旧客户端）'})[scan.status]||'状态未知'} · ${scan.receivedBatches}/${scan.expectedBatches} 批 · ${scan.observationCount} 条观察${scan.failedSources?.length?` · ${scan.failedSources.length} 个来源失败`:''} · ${time(scan.updatedAtMs)}${sourceSummary}</span>`;}).join('；') + '。仅完成的来源可结算该来源的缺失对象；警告或失败不会被误判为整机卸载。' : '盘点完整性未验证；目录数量不等于已完成整机盘点。';
  }
  function renderQuotaForm() {
    const quotas = state.policy.quotas; const fields = [['study','每日学习'],['composite','每日复合'],['restrictedEntertainment','每日受限娱乐'],['unclassified','每日未归类']];
    $('#quota-form').innerHTML = fields.map(([key,label]) => `<label class="quota-field">${label}（分钟）<input type="number" min="0" data-quota-category="${key}" value="${quotas.dailyCategoryMinutes[key] ?? ''}" placeholder="无限制"></label>`).join('') + `<label class="quota-field">每周受限娱乐（分钟）<input type="number" min="0" id="weekly-restricted" value="${quotas.weeklyRestrictedEntertainmentMinutes ?? ''}" placeholder="无限制"></label>`;
    state.quotaApps = observedApps();
    const per = new Map(quotas.perApplicationDailyMinutes.map((item) => [AppRuntimePolicy.keyOf(item), item.minutes]));
    $('#app-quota-list').innerHTML = state.quotaApps.map((app, index) => `<div class="quota-app-row"><span class="app-icon">${escape((app.displayName || '?')[0])}</span><div><strong>${escape(app.displayName || '未知应用')}</strong><small>${app.platform}</small></div><input type="number" min="0" data-app-quota-index="${index}" value="${per.get(AppRuntimePolicy.keyOf(app)) ?? ''}" placeholder="无限制" aria-label="${escape(app.displayName)} 每日分钟"></div>`).join('') || '<p class="empty">暂无已观察应用</p>';
  }
  function renderSchedule() {
    const dayLabels = { monday: '周一', tuesday: '周二', wednesday: '周三', thursday: '周四', friday: '周五', saturday: '周六', sunday: '周日' };
    $('#schedule-editor').innerHTML = AppRuntimePolicy.weekdays.map((day) => `<section class="schedule-day"><h3>${dayLabels[day]}</h3><div class="schedule-categories">${AppRuntimePolicy.scheduleCategories.map((category) => {
      const windows = state.policy.timeWindows[day][category];
      return `<div class="schedule-cell"><div class="schedule-cell-title"><strong>${categoryLabels[category]}应用</strong><button type="button" data-schedule-all="${day}|${category}">全天开放</button></div><div class="schedule-windows">${windows.map((window, index) => `<div class="schedule-window"><input data-schedule-start="${day}|${category}|${index}" value="${window.start}" aria-label="${dayLabels[day]} ${categoryLabels[category]}开始"><span>至</span><input data-schedule-end="${day}|${category}|${index}" value="${window.end}" aria-label="${dayLabels[day]} ${categoryLabels[category]}结束"><button type="button" data-schedule-remove="${day}|${category}|${index}" aria-label="删除时间段">×</button></div>`).join('') || '<small>全天不开放</small>'}</div><button type="button" data-schedule-add="${day}|${category}">＋ 添加时段</button></div>`;
    }).join('')}</div></section>`).join('');
    $('#outside-window-summary').textContent = `本周期时段外使用 ${duration(state.usage.outsideTimeWindows?.durationMs || 0)}`;
  }
  function assignmentOptions(selectedId, protectedValue = true) { return `<option value="u"${!protectedValue ? ' selected' : ''}>成人／不保护</option>` + state.children.map((item, index) => `<option value="${index}"${protectedValue && item.id === selectedId ? ' selected' : ''}>${escape(item.name)}</option>`).join(''); }
  function renderMachines() { $('#machines').innerHTML = state.machines.map((machine) => `<button type="button" class="machine-card" data-open-machine="${escape(machine.id)}"><span class="platform-icon">${machine.platform === 'macos' ? '●' : '⊞'}</span><div><strong>${escape(machine.displayName || '电脑')}</strong><p>${escape(machine.windowsVersion || machine.platform)} · ${escape(machine.architecture || '—')} · 最近在线 ${time(machine.lastSeenAtMs)}</p></div><span class="policy ${escape(machine.policyState)}">${policyLabel(machine.policyState)}</span><span class="badge ${escape(machine.status)}">${statusLabel(machine.status)}</span><span>›</span></button>`).join('') || '<p class="empty">尚未添加 Runtime 电脑</p>'; renderFilters(); renderHealth(); }
  function renderHealth() { $('#health-list').innerHTML = state.machines.map((machine) => `<article class="health-card"><strong>${escape(machine.displayName || '电脑')}</strong><p>Service ${escape(machine.serviceVersion || '未报告')} · Agent ${machine.status === 'online' ? '运行中' : '未连接'}</p><p>策略 ${machine.appliedPolicyVersion || 0}/${machine.desiredPolicyVersion || 0} · ${policyLabel(machine.policyState)}</p><span class="badge ${escape(machine.status)}">${statusLabel(machine.status)}</span></article>`).join('') || '<p>暂无设备</p>'; }
  function renderTechnicalRecords() {
    const items = state.catalog.technicalItems || [];
    $('#technical-record-count').textContent = `${items.length} 条`;
    $('#technical-record-list').className = `technical-record-list${items.length ? '' : ' empty'}`;
    $('#technical-record-list').innerHTML = items.length ? items.map((item) => {
      const reason = projectionReasonLabels[item.projectionReasonCode] || '尚未形成可管理产品身份';
      return `<article class="technical-record"><div><strong>${escape(item.displayName || '未知技术进程')}</strong><p><span class="platform-chip ${escape(item.platform)}">${item.platform === 'macos' ? 'macOS' : 'Windows'}</span> · ${item.lastSeenAtMs ? `最近使用 ${time(item.lastSeenAtMs)}` : '最近 30 天无使用'}</p></div><div><strong>${duration(item.mainDurationMs || 0)}</strong><p>${escape(reason)}</p></div><span class="badge offline">只读</span></article>`;
    }).join('') : '<p>暂无技术进程记录</p>';
  }
  function openDrawer(machineId) { const machine = state.machines.find((item) => item.id === machineId); if (!machine) return; const users = state.users.get(machine.id) || []; $('#drawer-content').innerHTML = `<h2>${escape(machine.displayName || '电脑')}</h2><p>${escape(machine.windowsVersion || machine.platform)} · ${escape(machine.architecture || '—')}</p><div class="drawer-section"><h3>运行状态</h3><p>Service ${escape(machine.serviceVersion || '未报告')}</p><p>最近在线：${time(machine.lastSeenAtMs)}<br>最近同步：${time(machine.lastUploadAtMs)}<br>策略：${machine.appliedPolicyVersion || 0}/${machine.desiredPolicyVersion || 0} · ${policyLabel(machine.policyState)}<br>Tamper：${machine.tamperCount || 0} 次</p></div><div class="drawer-section"><h3>账户分配</h3><label>新用户默认关联<select data-default="${escape(machine.id)}">${state.children.map((item,index) => `<option value="${index}"${item.id === machine.defaultChildId ? ' selected' : ''}>${escape(item.name)}</option>`).join('')}</select></label>${users.map((user) => `<label>${escape(user.displayName)}<select data-machine="${escape(machine.id)}" data-user="${escape(user.localUserId)}">${assignmentOptions(user.childId, user.protected)}</select><small>${policyLabel(user.policyState)}</small></label>`).join('') || '<p>等待 Service 上报本机账户。</p>'}</div><div class="drawer-section drawer-actions"><button data-uninstall="${escape(machine.id)}">生成卸载码</button>${machine.status !== 'revoked' ? `<button class="danger" data-revoke="${escape(machine.id)}">吊销机器</button>` : ''}</div>`; $('#device-drawer').classList.add('open'); $('#device-drawer').setAttribute('aria-hidden', 'false'); $('#mobile-backdrop').hidden = false; }
  function closeDrawer() { $('#device-drawer').classList.remove('open'); $('#device-drawer').setAttribute('aria-hidden', 'true'); $('#mobile-backdrop').hidden = true; }
  function openUsageDetail(kind, value) { const item = kind === 'app' ? state.usage.applications?.[Number(value)] : state.usage.categories?.find((entry) => entry.classification === value); if (!item) return; const title = kind === 'app' ? item.displayName || '未知应用' : categoryLabels[item.classification]; $('#drawer-content').innerHTML = `<h2>${escape(title)}</h2><p>${kind === 'app' ? `${escape(item.platform)} · ${categoryLabels[item.classification] || '未归类'}` : '分类使用详情'}</p><div class="drawer-section"><h3>本周期主使用</h3><p class="detail-duration">${duration(item.durationMs)}</p><p>${item.quota?.limitMs == null ? '配额：无限制' : `配额：${duration(item.quota.limitMs)}<br>剩余：${duration(item.quota.remainingMs)}<br>状态：${item.quota.exceeded ? '已超额' : '未超额'}`}</p></div><div class="notice warning"><span>统计只读取主账本区间并集；辅助媒体不进入此详情或配额。</span></div>`; $('#device-drawer').classList.add('open'); $('#device-drawer').setAttribute('aria-hidden', 'false'); $('#mobile-backdrop').hidden = false; }

  async function load({ freshToken = false } = {}) { setLoading(true); try { if (freshToken) state.session = null; if (mock) { mockData(); renderAll(); markLoaded(); return; } await moduleToken(false); const machines = await runtime('/v2/module/machines'); state.machines = machines.machines || []; state.users.clear(); await Promise.all(state.machines.map(async (machine) => { const result = await runtime(`/v2/module/machines/${encodeURIComponent(machine.id)}/users`); state.users.set(machine.id, result.users || []); })); const childId = encodeURIComponent(state.childId); const [policy, records, catalog] = await Promise.all([runtime(`/v2/module/app-policy?childId=${childId}`), runtime(`/v2/module/app-classification-records?childId=${childId}`), runtime(`/v2/module/app-catalog?childId=${childId}`)]); state.policy = AppRuntimePolicy.normalize(policy); state.policyEtag = `"app-policy-v${state.policy.version}"`; state.records = records; state.catalog = catalog; await loadUsage(); renderAll(); markLoaded(); } catch (error) { showError(error); } finally { setLoading(false); } }
  async function loadUsage() { if (mock) return; const period = range(); const query = new URLSearchParams({ childId: state.childId, fromMs: String(period.from), toMs: String(period.to) }); if ($('#machine-filter').value) query.set('machineId', $('#machine-filter').value); if ($('#user-filter').value) query.set('userId', $('#user-filter').value); if ($('#platform-filter').value) query.set('platform', $('#platform-filter').value); state.usage = await runtime(`/v2/module/app-usage?${query}`); }
  function renderAll() { renderChildPicker(); const period = range(); $('#range-label').textContent = period.label; $('#chart-caption').textContent = `北京时间，${state.period === 'day' ? '按小时' : '按每日'}`; renderMachines(); renderUsage(); renderAppDirectory(); renderQuotaForm(); renderSchedule(); renderLoggingPolicy(); renderTechnicalRecords(); }
  async function savePolicy(next) { if (mock) { const history = [...(state.records.pending || []), ...(state.records.processed || [])]; state.policy = AppRuntimePolicy.normalize({ ...next, version: state.policy.version + 1, effectiveAtMs: Date.now() }); state.policyEtag = `"app-policy-v${state.policy.version}"`; const current = new Map(state.policy.classifications.map((entry) => [AppRuntimePolicy.keyOf(entry), entry])); state.records.pending = history.filter((record) => !current.has(AppRuntimePolicy.keyOf(record))); state.records.processed = history.filter((record) => current.has(AppRuntimePolicy.keyOf(record))).map((record) => ({ ...record, status: 'processed', classification: current.get(AppRuntimePolicy.keyOf(record)).classification })); state.catalog.items = observedApps().map((item) => ({ ...item, classification: current.get(AppRuntimePolicy.keyOf(item))?.classification || 'unclassified' })); renderAll(); return; } const body = { classifications: next.classifications, quotas: next.quotas, timeWindows: next.timeWindows }; const saved = await runtime(`/v2/module/app-policy?childId=${encodeURIComponent(state.childId)}`, { method: 'PUT', headers: { 'If-Match': state.policyEtag }, body: JSON.stringify(body) }); state.policy = AppRuntimePolicy.normalize(saved); state.policyEtag = `"app-policy-v${state.policy.version}"`; await load(); }
  function quotaValue(input) { return input.value === '' ? null : Math.max(0, Number.parseInt(input.value, 10)); }
  async function saveQuotas() { const daily = {}; $$('[data-quota-category]').forEach((input) => { daily[input.dataset.quotaCategory] = quotaValue(input); }); const perApplicationDailyMinutes = $$('[data-app-quota-index]').filter((input) => input.value !== '').map((input) => { const app = state.quotaApps[Number(input.dataset.appQuotaIndex)]; return { platform: app.platform, runtimeIdentity: app.runtimeIdentity, minutes: quotaValue(input) }; }); await savePolicy(AppRuntimePolicy.withQuotas(state.policy, { dailyCategoryMinutes: daily, weeklyRestrictedEntertainmentMinutes: quotaValue($('#weekly-restricted')), perApplicationDailyMinutes })); }
  function collectSchedule() {
    const next = AppRuntimePolicy.allOpenTimeWindows();
    AppRuntimePolicy.weekdays.forEach((day) => AppRuntimePolicy.scheduleCategories.forEach((category) => { next[day][category] = []; }));
    $$('[data-schedule-start]').forEach((input) => {
      const [day, category, index] = input.dataset.scheduleStart.split('|');
      const end = $(`[data-schedule-end="${day}|${category}|${index}"]`);
      next[day][category].push({ start: input.value.trim(), end: end.value.trim() });
    });
    return AppRuntimePolicy.normalize({ ...state.policy, timeWindows: next }).timeWindows;
  }
  async function saveSchedule() { await savePolicy(AppRuntimePolicy.withTimeWindows(state.policy, collectSchedule())); }
  function updateSchedule(action, value) {
    const [day, category, indexText] = value.split('|');
    const next = collectSchedule();
    if (action === 'all') next[day][category] = [{ start: '00:00', end: '24:00' }];
    if (action === 'remove') next[day][category].splice(Number(indexText), 1);
    if (action === 'add') {
      const windows = next[day][category];
      if (windows.some((window) => window.start === '00:00' && window.end === '24:00')) throw new Error('当前已全天开放，请先修改或删除全天时段');
      const lastEnd = windows.at(-1)?.end || '08:00';
      const start = lastEnd === '24:00' ? '08:00' : lastEnd;
      const hour = Math.min(24, Number(start.slice(0, 2)) + 1);
      next[day][category].push({ start, end: hour === 24 ? '24:00' : `${String(hour).padStart(2, '0')}:${start.slice(3)}` });
    }
    state.policy = AppRuntimePolicy.withTimeWindows(state.policy, next); renderSchedule();
  }
  function openPair() { $('#pair-default-child').innerHTML = state.children.map((item, index) => `<option value="${index}"${item.id === state.childId ? ' selected' : ''}>${escape(item.name)}</option>`).join(''); $('#pair-result').hidden = true; $('#pair-dialog').showModal(); }
  function showCode(kind, code, expiresAtMs) { const prefix = kind === 'pair' ? 'pair' : 'uninstall'; $(`#${prefix}-code`).textContent = code; clearInterval(state.timer); const tick = () => { const seconds = Math.max(0, Math.ceil((expiresAtMs - Date.now()) / 1000)); $(`#${prefix}-countdown`).textContent = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')} 后过期`; }; tick(); state.timer = setInterval(tick, 1000); }
  async function copyCode(kind) { const prefix = kind === 'pair' ? 'pair' : 'uninstall'; const status = $(`#${prefix}-copy-status`); try { await AppRuntimeClipboard.copyText($(`#${prefix}-code`).textContent); status.textContent = '已复制到剪贴板'; } catch (error) { status.textContent = error.message || '复制失败，请手动选择代码'; } status.hidden = false; }
  function renderLogMachineOptions() { const select = $('#log-machine-filter'); const selected = select.value; select.innerHTML = '<option value="">全部电脑</option>' + state.machines.filter((item) => item.status !== 'revoked').map((item) => `<option value="${escape(item.id)}">${escape(item.displayName || '电脑')}</option>`).join(''); select.value = selected; const policySelect = $('#logging-machine'); const policySelected = policySelect.value || state.machines.find((item) => item.platform === 'windows' && item.status !== 'revoked')?.id || ''; policySelect.innerHTML = '<option value="">选择 Windows 电脑</option>' + state.machines.filter((item) => item.platform === 'windows' && item.status !== 'revoked').map((item) => `<option value="${escape(item.id)}">${escape(item.displayName || 'Windows 电脑')}</option>`).join(''); policySelect.value = policySelected; }
  function renderLoggingPolicy() {
    renderLogMachineOptions();
    const machineId = $('#logging-machine').value; const policy = state.loggingPolicy;
    const enabled = Boolean(policy?.enabled && policy.expiresAtMs > Date.now());
    $('#remote-log-status').className = `badge ${enabled ? '' : 'offline'}`; $('#remote-log-status').textContent = !machineId ? '请选择电脑' : enabled ? '远程日志已开启' : policy?.enabled ? '已过期' : '远程日志已关闭';
    $('#logging-min-level').value = policy?.minLevel || 'error';
    $$('.logging-categories input').forEach((input) => { input.checked = (policy?.categories || ['service','session','policy','upload','storage','security','accounting']).includes(input.value); input.disabled = !machineId; });
    $('#logging-min-level').disabled = !machineId; $('#logging-ttl').disabled = !machineId;
    $('#enable-remote-logging').disabled = !machineId; $('#disable-remote-logging').disabled = !machineId || !policy?.enabled;
    $('#remote-log-detail').textContent = !machineId ? '选择电脑后读取当前策略' : enabled ? `有效至 ${time(policy.expiresAtMs)} · 等待机器策略 ${state.machines.find((item) => item.id === machineId)?.policyState === 'applied' ? '已生效' : '下发中'}` : '本地有界诊断仍运行；新日志不会上传';
  }
  async function loadLoggingPolicy() {
    renderLogMachineOptions(); const machineId = $('#logging-machine').value;
    if (!machineId) { state.loggingPolicy = null; state.loggingPolicyEtag = null; renderLoggingPolicy(); return; }
    if (mock) { renderLoggingPolicy(); return; }
    state.loggingPolicy = await runtime(`/v2/module/logging-policy?machineId=${encodeURIComponent(machineId)}`);
    state.loggingPolicyEtag = `"logging-${machineId}-${state.loggingPolicy.version}"`; renderLoggingPolicy();
  }
  async function saveLoggingPolicy(enabled) {
    const machineId = $('#logging-machine').value; if (!machineId) throw new Error('请先选择 Windows 电脑');
    const categories = $$('.logging-categories input:checked').map((input) => input.value); if (!categories.length) throw new Error('至少选择一个日志类别');
    const body = { enabled, minLevel: $('#logging-min-level').value, categories, expiresAtMs: enabled ? Date.now() + Number($('#logging-ttl').value) * 86400000 : null };
    if (mock) { state.loggingPolicy = { version: (state.loggingPolicy?.version || 0) + 1, ...body }; state.loggingPolicyEtag = `"logging-${machineId}-${state.loggingPolicy.version}"`; renderLoggingPolicy(); showSuccess(enabled ? '远程日志已打开' : '远程日志已关闭'); return; }
    state.loggingPolicy = await runtime(`/v2/module/logging-policy?machineId=${encodeURIComponent(machineId)}`, { method: 'PUT', headers: { 'If-Match': state.loggingPolicyEtag }, body: JSON.stringify(body) });
    state.loggingPolicyEtag = `"logging-${machineId}-${state.loggingPolicy.version}"`; const machines = await runtime('/v2/module/machines'); state.machines = machines.machines || state.machines; renderMachines(); renderLoggingPolicy(); showSuccess(enabled ? '远程日志策略已下发' : '远程日志已关闭');
  }
  function logRange() { if (state.runtimeLogs.range === 'today') return AppRuntimeTime.beijingRange('day', 0); if (state.runtimeLogs.range === 'week') return AppRuntimeTime.beijingRange('week', 0); return { from: 0, to: Date.now() + 1, label: '全部' }; }
  function renderRuntimeLogs() {
    renderLogMachineOptions();
    const items = state.runtimeLogs.items || [];
    const counts = items.reduce((result, item) => { result[item.level] = (result[item.level] || 0) + 1; return result; }, {});
    $('#runtime-log-summary').innerHTML = `<span>范围：${escape(logRange().label)}</span><span>当前显示：${items.length} 条</span><span class="log-error">error ${counts.error || 0}</span><span class="log-warning">warning ${counts.warning || 0}</span><span class="log-info">info ${counts.info || 0}</span>`;
    $('#runtime-log-list').className = 'runtime-log-table';
    $('#runtime-log-list').innerHTML = items.length ? `<div class="runtime-log-head"><span>时间</span><span>等级</span><span>类别 / 事件</span><span>电脑 / 模块</span><span>说明</span></div>${items.map((item) => `<article class="runtime-log-row"><time>${time(item.timestampMs)}</time><span class="log-level ${escape(item.level)}">${escape(item.level)}</span><div><strong>${escape(item.category)}</strong><small>${escape(item.eventCode)} · ${item.source === 'terminal' ? '终端日志' : '账本诊断'}</small></div><div><strong>${escape(item.machineName || '电脑')}</strong><small>${escape(item.module || 'runtime')}</small></div><p>${escape(item.message || '')}</p></article>`).join('')}` : '<p class="empty">该范围暂无系统日志</p>';
    $('#runtime-log-more').hidden = !state.runtimeLogs.nextCursor;
  }
  async function loadRuntimeLogs({ append = false } = {}) {
    if (mock) { renderRuntimeLogs(); return; }
    const selectedRange = logRange();
    const query = new URLSearchParams({ childId: state.childId, fromMs: String(selectedRange.from), toMs: String(selectedRange.to), limit: '50' });
    const machineId = $('#log-machine-filter').value; const level = $('#log-level-filter').value; const category = $('#log-category-filter').value;
    if (machineId) query.set('machineId', machineId); if (level) query.set('level', level); if (category) query.set('category', category);
    if (append && state.runtimeLogs.nextCursor) query.set('cursor', state.runtimeLogs.nextCursor);
    const result = await runtime(`/v2/module/runtime-logs?${query}`);
    state.runtimeLogs.items = append ? [...state.runtimeLogs.items, ...(result.items || [])] : (result.items || []);
    state.runtimeLogs.nextCursor = result.nextCursor || null; state.runtimeLogs.summary = result.summary || null;
    renderRuntimeLogs();
  }
  function switchView(view) { state.view = view; $$('.nav-item').forEach((button) => button.classList.toggle('active', button.dataset.view === view)); $$('.view').forEach((panel) => panel.classList.toggle('active', panel.dataset.viewPanel === view)); [$('#page-title').textContent, $('#page-subtitle').textContent] = viewText[view]; if ($('#status-strip').className === 'success') clearError(); $('#sidebar').classList.remove('open'); $('#mobile-backdrop').hidden = true; }
  function switchTab(type, name) { $$(`[data-${type}-tab]`).forEach((button) => button.classList.toggle('active', button.dataset[`${type}Tab`] === name)); $$(`[data-${type}-panel]`).forEach((panel) => { panel.hidden = panel.dataset[`${type}Panel`] !== name; }); }
  async function loadLedger(kind) { const period = range(); const result = mock ? { items: kind === 'usage' ? [{ startAtMs: Date.now() - 60000, displayName: 'Visual Studio Code', durationMs: 60000, applicationClassification: 'study', estimated: false }] : [{ startAtMs: Date.now() - 120000, displayName: 'Microsoft Edge', durationMs: 120000, mediaKind: 'video', presentation: 'background', estimated: false }] } : await runtime(`/v2/module/${kind === 'usage' ? 'usage-segments' : 'media-segments'}?childId=${encodeURIComponent(state.childId)}&fromMs=${period.from}&toMs=${period.to}&limit=50`); const target = kind === 'usage' ? $('#ledger-list') : $('#media-list'); target.className = 'table-list'; target.innerHTML = result.items.length ? result.items.map((item) => `<div class="table-row"><time>${time(item.startAtMs)}</time><strong>${escape(item.displayName || '未知应用')}</strong><span>${duration(item.durationMs)}</span><span>${kind === 'usage' ? categoryLabels[item.applicationClassification] || '未归类' : `${item.mediaKind}/${item.presentation}`}</span></div>`).join('') : '<p>暂无明细</p>'; }
  function exportConfig() { const blob = new Blob([JSON.stringify(AppRuntimePolicy.exportPayload(state.policy), null, 2)], { type: 'application/json' }); const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = 'timeonchrome-app-runtime-config.json'; link.click(); URL.revokeObjectURL(link.href); }
  async function reviewImport(file) { const incoming = JSON.parse(await file.text()); const diff = AppRuntimePolicy.importDiff(state.policy, incoming); const box = $('#import-diff'); box.hidden = false; box.dataset.payload = JSON.stringify(diff.policy); box.innerHTML = `<div class="import-review"><h3>导入差异</h3><label><input type="checkbox" id="import-classifications" checked> 应用分类：新增 ${diff.added}、修改 ${diff.changed}、移除 ${diff.removed}</label><br><label><input type="checkbox" id="import-quotas" checked> 独立配额：${diff.quotasChanged ? '有变化' : '无变化'}</label><br><label><input type="checkbox" id="import-time-windows" checked> 七天时间段：${diff.timeWindowsChanged ? '有变化' : '无变化'}</label><p><button id="confirm-import" class="primary">确认导入所选内容</button></p></div>`; }

  document.addEventListener('click', async (event) => { const button = event.target.closest('button'); if (!button) return; try {
    if (button.dataset.view) { switchView(button.dataset.view); if (button.dataset.view === 'system') { await loadLoggingPolicy(); await loadRuntimeLogs(); } }
    if (button.dataset.accessTab) switchTab('access', button.dataset.accessTab);
    if (button.dataset.systemTab) { switchTab('system', button.dataset.systemTab); if (button.dataset.systemTab === 'logs') { await loadLoggingPolicy(); await loadRuntimeLogs(); } }
    if (button.id === 'mobile-menu') { $('#sidebar').classList.add('open'); $('#mobile-backdrop').hidden = false; }
    if (button.id === 'refresh' || button.id === 'retry' || button.id === 'initial-load-retry') await load({ freshToken: true });
    if (button.dataset.period) { state.period = button.dataset.period; state.offset = 0; $$('[data-period]').forEach((item) => item.classList.toggle('active', item === button)); if (!mock) await loadUsage(); renderUsage(); }
    if (button.id === 'previous') { state.offset -= 1; if (!mock) await loadUsage(); renderUsage(); }
    if (button.id === 'today') { state.offset = 0; if (!mock) await loadUsage(); renderUsage(); }
    if (button.id === 'save-quotas') await saveQuotas();
    if (button.id === 'add-machine') openPair();
    if (button.id === 'create-pairing') { const selected = childFromIndex($('#pair-default-child').value); const result = mock ? { code: 'ABCD-EFGH-JKLM', expiresAtMs: Date.now() + 600000 } : await runtime('/v2/module/pairing-codes', { method: 'POST', body: JSON.stringify({ defaultChildId: selected.id, displayName: 'Windows 电脑' }) }); showCode('pair', result.code, result.expiresAtMs); $('#pair-result').hidden = false; if (!mock) { const release = await runtime('/v1/releases/windows/x64/latest'); $('#download-installer').href = `${RUNTIME_API}/v1/releases/windows/x64/${encodeURIComponent(release.version)}/installer`; } }
    if (button.id === 'copy-code') await copyCode('pair'); if (button.id === 'copy-uninstall') await copyCode('uninstall');
    if (button.dataset.openMachine) openDrawer(button.dataset.openMachine);
    if (button.dataset.usageApp) openUsageDetail('app', button.dataset.usageApp);
    if (button.dataset.usageCategory) openUsageDetail('category', button.dataset.usageCategory);
    if (button.dataset.appCategory) { state.appCategory = button.dataset.appCategory; renderAppDirectory(); }
    if (button.dataset.classifyIndex != null && button.dataset.classification) { const app = state.actionApps[Number(button.dataset.classifyIndex)]; if (app) { if(app.manageability!=='actionable')throw new Error('技术进程记录不能直接归类，请先确认产品身份');if(app.productId) await knowledgeManager.classify(app.productId,button.dataset.classification); else {const implementations=app.runtimeImplementations?.length?app.runtimeImplementations:[app];let next=state.policy;for(const implementation of implementations){if(!implementation.runtimeIdentity)throw new Error('此应用缺少可靠身份，请先在确定性应用列表确认');next=AppRuntimePolicy.classify(next,{...app,...implementation},button.dataset.classification);}await savePolicy(next);} showSuccess(`${app.displayName || '应用'} 分类已保存，等待设备实际应用`); } }
    if (button.dataset.manageVariants !== undefined) await knowledgeManager.open('product');
    if (button.classList.contains('drawer-close')) closeDrawer();
    if (button.dataset.uninstall) { const result = mock ? { code: 'UNIN-STALL-CODE', expiresAtMs: Date.now() + 600000 } : await runtime(`/v2/module/machines/${encodeURIComponent(button.dataset.uninstall)}/uninstall-codes`, { method: 'POST', body: '{}' }); showCode('uninstall', result.code, result.expiresAtMs); $('#uninstall-dialog').showModal(); }
    if (button.dataset.revoke && !mock && confirm('吊销后这台电脑将停止采集和上传，确定继续？')) { await runtime(`/v2/module/machines/${encodeURIComponent(button.dataset.revoke)}/revoke`, { method: 'POST', body: '{}' }); closeDrawer(); await load(); }
    if (button.dataset.loadLedger) await loadLedger(button.dataset.loadLedger);
    if (button.dataset.logRange) { state.runtimeLogs.range = button.dataset.logRange; $$('[data-log-range]').forEach((item) => item.classList.toggle('active', item === button)); state.runtimeLogs.items = []; state.runtimeLogs.nextCursor = null; await loadRuntimeLogs(); }
    if (button.id === 'load-runtime-logs') { state.runtimeLogs.items = []; state.runtimeLogs.nextCursor = null; await loadRuntimeLogs(); }
    if (button.id === 'runtime-log-more') await loadRuntimeLogs({ append: true });
    if (button.id === 'enable-remote-logging') await saveLoggingPolicy(true);
    if (button.id === 'disable-remote-logging' && confirm('关闭后新终端日志将停止上传，既有云端日志会保留。确定关闭？')) await saveLoggingPolicy(false);
    if (button.id === 'save-schedule') await saveSchedule();
    if (button.dataset.scheduleAll) updateSchedule('all', button.dataset.scheduleAll);
    if (button.dataset.scheduleAdd) updateSchedule('add', button.dataset.scheduleAdd);
    if (button.dataset.scheduleRemove) updateSchedule('remove', button.dataset.scheduleRemove);
    if (button.id === 'export-config') exportConfig();
    if (button.id === 'confirm-import') { const incoming = JSON.parse($('#import-diff').dataset.payload); const next = AppRuntimePolicy.normalize({ ...state.policy, classifications: $('#import-classifications').checked ? incoming.classifications : state.policy.classifications, quotas: $('#import-quotas').checked ? incoming.quotas : state.policy.quotas, timeWindows: $('#import-time-windows').checked ? incoming.timeWindows : state.policy.timeWindows }); await savePolicy(next); $('#import-diff').hidden = true; }
  } catch (error) { showError(error); } });
  document.addEventListener('change', async (event) => { const control = event.target; try {
    if (['directory-scope','management-platform'].includes(control.id)) { renderAppDirectory(); return; }
    if (control.id === 'child-select') { const selected = childFromIndex(control.value); if (selected) { state.childId = selected.id; await load(); } }
    else if (control.id === 'machine-filter') { renderFilters(); if (!mock) await loadUsage(); renderUsage(); }
    else if (['user-filter','platform-filter'].includes(control.id)) { if (!mock) await loadUsage(); renderUsage(); }
    else if (control.id === 'media-toggle') renderUsage();
    else if (control.id === 'logging-machine') { state.loggingPolicy = null; state.loggingPolicyEtag = null; await loadLoggingPolicy(); }
    else if (control.dataset.default) { const selected = childFromIndex(control.value); if (!mock && selected) { await runtime(`/v2/module/machines/${encodeURIComponent(control.dataset.default)}/default-assignment`, { method: 'PATCH', body: JSON.stringify({ childId: selected.id }) }); await load(); } }
    else if (control.dataset.user) { const selected = control.value === 'u' ? null : childFromIndex(control.value); if (!mock) { await runtime(`/v2/module/machines/${encodeURIComponent(control.dataset.machine)}/users/${encodeURIComponent(control.dataset.user)}`, { method: 'PATCH', body: JSON.stringify({ protected: Boolean(selected), childId: selected?.id || null }) }); await load(); } }
    else if (control.id === 'import-config' && control.files[0]) await reviewImport(control.files[0]);
  } catch (error) { showError(error); } });
  document.addEventListener('input', (event) => { if (['app-search','management-platform'].includes(event.target.id)) renderAppDirectory(); });
  $('#mobile-backdrop').addEventListener('click', () => { $('#sidebar').classList.remove('open'); closeDrawer(); });
  $('#runtime-logout').addEventListener('click', async () => {
    const active = AppRuntimeSession.load(sessionStorage);
    if (active) await fetch(`${RUNTIME_API}/v2/auth/browser-sessions/current`, { method: 'DELETE', headers: { Authorization: `RuntimeSession ${active.token}` } }).catch(() => {});
    AppRuntimeSession.clear(sessionStorage);
    location.assign('https://timeonchrome-console.pages.dev/');
  });
  const knowledgeManager = AppRuntimeKnowledge.mount({request:runtime,mock,onError:showError,getContext:()=>({children:state.children,childId:state.childId,mockInventory:state.mockInventory,mockKnowledge:state.mockKnowledge}),onSaved:async knowledge=>{
    if(!mock){await load();return;}
    state.mockKnowledge=knowledge;
    const binding=knowledge.bindings.find(item=>item.childId===state.childId);
    for(const item of state.catalog.items){const evidence=state.mockInventory.find(observation=>observation.evidence.runtimeIdentity===item.runtimeIdentity)?.evidence;if(!evidence)continue;const products=knowledge.products.filter(product=>product.selectors.some(selector=>selector.platform===evidence.platform&&selector.match.conditions.every(condition=>evidence.values[condition.field]===condition.value)));if(products.length===1){const explicit=binding?.products.find(entry=>entry.productId===products[0].id);if(explicit){item.productId=products[0].id;item.displayName=products[0].name;item.classification=explicit.classification;item.classificationReason='孩子产品明确分类';item.installationState='installed';}}}
    state.machines.forEach(machine=>{machine.desiredPolicyVersion+=1;machine.policyState=machine.status==='online'?'pending':'offline';});renderAll();
  }});
  load();
})();
