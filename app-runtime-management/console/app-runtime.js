(() => {
  const componentOnly=document.currentScript?.dataset.runtimeComponent==='true';
  function mount(config={}) {
  const root=config.root||document;
  const embedded=typeof config.request==='function';
  const ownerDocument=root.ownerDocument||document;
  let disposed=false;
  const listeners=[];
  const listen=(target,type,handler)=>{target.addEventListener(type,handler);listeners.push([target,type,handler]);};
  const live=()=>!disposed&&(!config.isCurrent||config.isCurrent());
  const assertLive=()=>{if(!live())throw Object.assign(new Error('组件上下文已变化'),{code:'COMPONENT_CONTEXT_CHANGED'});};
  const RUNTIME_API = 'https://timeonchrome-app-runtime-api.william-xia-cn.workers.dev';
  const requestedLaunchView = embedded?config.view:new URLSearchParams(location.search).get('view');
  if(embedded&&!['apps','devices','access','system','configuration'].includes(requestedLaunchView))throw new Error('INVALID_RUNTIME_MANAGEMENT_VIEW');
  const initialView = embedded?requestedLaunchView:['apps', 'devices'].includes(requestedLaunchView) ? requestedLaunchView : 'usage';
  const mainConsoleUrl = new URL('https://timeonchrome-console.pages.dev/?launch=app-runtime');
  if (['apps', 'devices'].includes(initialView)) mainConsoleUrl.searchParams.set('view', initialView);
  const MAIN_CONSOLE = mainConsoleUrl.toString();
  const authRecovery = embedded?null:AppRuntimeSession.createRecovery(sessionStorage, () => location.assign(MAIN_CONSOLE));
  const mock = !embedded&&new URLSearchParams(location.search).has('mock');
  const categoryLabels = { study: '学习', composite: '复合', restrictedEntertainment: '受限娱乐', unclassified: '未归类', other: '其他时间', blocked: '黑名单' };
  const categoryColors = { study: '#178f6a', composite: '#4d9fd8', restrictedEntertainment: '#ed9f38', unclassified: '#9aa6a0', other: '#7b8f9c', blocked: '#d64545' };
  const projectionReasonLabels = {
    INSTALLATION_PRODUCT: 'Windows 安装产品或可信平台主应用，可作为一个产品管理',
    COMPONENT: '明确的组件或辅助入口，不作为独立产品管理',
    DISCOVERY_CANDIDATE: '只有弱安装线索，等待可靠身份或家长确认',
    TECHNICAL_IDENTITY_ONLY: '只有技术进程或历史使用身份，尚未识别为产品',
    TECHNICAL_PRODUCT_REVIEW: '安装记录具有维护、运行库或安装器语义，等待家长确认',
    AMBIGUOUS_INSTALLATION_PRODUCTS: '多个安装记录同名但缺少可靠关联，不能自动合并',
    POSSIBLE_PRODUCT_VARIANT: '可能属于现有安装产品，缺少可靠关联，未单独列入主目录',
    UNCONFIRMED_APPLICATION_VARIANT: '发现到独立启动入口或运行身份，尚未确认产品归属',
    PACKAGE_CONTAINER: '应用包技术容器；可启动入口在应用目录中独立管理',
    LEGACY_CONTAINER_CLASSIFICATION: '旧包级配置需要重新确认，不会自动复制到包内应用',
  };
  const viewText = {
    usage: ['使用统计', '查看电脑应用主使用账本'], access: ['应用访问管理', '管理独立配额、七天时间段和配置文件'],
    apps: ['应用管理', '管理安装发现、产品确认与孩子分类规则'], devices: ['设备管理', '管理电脑、账户分配与运行状态'],
    system: ['系统管理', '查看系统日志、技术进程、主账本、辅助媒体和运行健康'],
    configuration: ['应用配置文件', '仅应用分类和单应用限制；公共时间配置由综合访问管理'],
  };
  const state = { period: 'day', offset: 0, session: null, childId: null, children: [], machines: [], users: new Map(), policy: AppRuntimePolicy.defaultPolicy(), policyEtag: '"app-policy-v0"', sharedAccess: null, sharedAccessError: null, loggingPolicy: null, loggingPolicyEtag: null, records: { pending: [], processed: [], technical: [] }, catalog: { items: [], technicalItems: [] }, usage: {}, runtimeLogs: { range: 'today', items: [], nextCursor: null, summary: null }, timer: null, searchTimer: null, view: initialView, appCategory: 'unclassified', appGroups: { application: true, game: true, systemTool: false, processed: false }, actionApps: [], quotaApps: [], loaded: false, managementLoaded: false };
  let applicationImportDraft = null;
  let applicationImportGeneration = 0;
  const applicationImportContext = () => ({ childId: state.childId, view: state.view, etag: state.policyEtag });
  function assertApplicationImportContext(context) {
    assertLive();
    if (!context || context.childId !== state.childId || context.view !== state.view || context.etag !== state.policyEtag) throw new Error('孩子或应用配置已变化，请重新预览导入文件');
  }
  const $ = (selector) => root.querySelector(selector);
  const $$ = (selector) => [...root.querySelectorAll(selector)];
  if(embedded){state.children=config.children.map(item=>({...item}));state.childId=config.childId;if(!state.children.some(item=>item.id===state.childId))throw new Error('INVALID_RUNTIME_CHILD_CONTEXT');}
  const escape = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const duration = (ms = 0) => ms < 60000 ? (ms ? '少于 1 分钟' : '0 分钟') : `${Math.floor(ms / 3600000) ? `${Math.floor(ms / 3600000)} 小时 ` : ''}${Math.round(ms % 3600000 / 60000)} 分钟`;
  const time = (ms) => ms ? new Date(ms).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' }) : '尚未同步';
  const child = (id) => state.children.find((item) => item.id === id);
  const childIndex = (id) => String(state.children.findIndex((item) => item.id === id));
  const childFromIndex = (value) => state.children[Number(value)] || null;
  const range = () => AppRuntimeTime.beijingRange(state.period, state.offset);
  state.usageKind='computer';
  const applicationReadCache=ComputerUsageView.createReadCache();
  const computerReader=ComputerUsageView.create($('#runtime-computer-usage'),async(query)=>{
    const selected=state.childId,period=range();
    const date=ms=>new Date(ms+8*3600000).toISOString().slice(0,10);
    const params=new URLSearchParams({childId:selected,from:date(period.from),to:date(period.to-1),...Object.fromEntries(Object.entries(query).filter(([,value])=>value!==''&&value!==undefined).map(([key,value])=>[key,String(value)]))});
    if(mock&&window.__readComputerUsageMock)return window.__readComputerUsageMock(params);
    if(mock){return window.__computerUsageMock||{schemaVersion:1,revision:'mock-only',fromDate:date(period.from),toDate:date(period.to-1),complete:false,reasons:['APPLICATION_SOURCE_UNAVAILABLE'],totals:{computerMs:null,webMs:600000,applicationMs:null,overlapMs:null},categoriesMs:{study:null,composite:null},devices:[],products:[],timeline:[],sourceVersions:[],nextCursor:null};}
    const result=await runtime(`/v2/module/computer-usage?${params}`);
    if(selected!==state.childId)throw new Error('SELECTION_CHANGED');return result;
  },null,()=>{const period=range();return state.childId+'|'+period.from+'|'+period.to;});
  const independentReader=ComputerUsageView.createIndependent($('#runtime-web-usage'),async()=>{
    const selected=state.childId,source=state.usageKind,period=range();
    const date=ms=>new Date(ms+8*3600000).toISOString().slice(0,10);
    const params=new URLSearchParams({childId:selected,from:date(period.from),to:date(period.to-1),source});
    if(mock)return {source,fromDate:date(period.from),toDate:date(period.to-1),totalDurationMs:5134000,categories:[{classification:'study',durationMs:5134000}],buckets:[{label:date(period.from),durationMs:5134000}],applications:[{displayName:'示例网站',classification:'study',durationMs:5134000}]};
    const result=await runtime(`/v2/module/computer-usage?${params}`);
    if(selected!==state.childId)throw new Error('SELECTION_CHANGED');return result;
  });
  const policyLabel = (value) => ({ pending: '待下发', cached: '已缓存', applied: '当前会话已生效', failed: '失败', offline: '离线' })[value] || '待下发';
  const statusLabel = (value) => ({ online: '在线', recentlyOnline: '最近在线', offline: '离线', revoked: '已吊销' })[value] || value;

  function showError(error) {
    if(!live()||error?.code==='COMPONENT_CONTEXT_CHANGED')return;
    const message = AppRuntimeNetwork.friendlyError(error).message;
    $('#status-strip').className = 'error';
    if (!state.loaded || error?.code === 'AUTH_RECOVERY_FAILED') {
      $('main').classList.remove('initial-load-pending');
      $('main').classList.add('initial-load-failed');
      $('#status-strip').hidden = true;
      $('#load-empty-message').textContent = message;
      $('#load-preview-hint').hidden = !(location.protocol === 'file:' || ['localhost', '127.0.0.1'].includes(location.hostname));
      $('#load-empty-state').hidden = false;
      return;
    }
    $('#status-message').textContent = message; $('#retry').hidden = false; $('#status-strip').hidden = false;
  }
  function showSuccess(message) { if(!live())return;$('#status-strip').className = 'success'; $('#status-message').textContent = message; $('#retry').hidden = true; $('#status-strip').hidden = false; setTimeout(() => { if (live()&&$('#status-strip').className === 'success' && $('#status-message').textContent === message) clearError(); }, 3500); }
  function clearError() { $('#status-strip').hidden = true; }
  function setLoading(active) { if(!live())return;const main = $('main'); main.setAttribute('aria-busy', String(active)); $('#refresh').disabled = active; if (active) { if (!state.loaded) { main.classList.add('initial-load-pending'); main.classList.remove('initial-load-failed'); $('#load-empty-state').hidden = true; } $('#status-strip').className = 'loading'; $('#status-message').textContent = '正在加载 Runtime 数据…'; $('#retry').hidden = true; $('#status-strip').hidden = false; } else if ($('#status-strip').className === 'loading') clearError(); }
  function markLoaded(protectedSuccess=true) { assertLive();if (protectedSuccess&&!mock&&!embedded) authRecovery.protectedLoadSucceeded(); state.loaded = true; const main = $('main'); main.classList.remove('initial-load-pending', 'initial-load-failed'); $('#load-empty-state').hidden = true; }
  async function issue() {
    if(embedded){assertLive();renderChildPicker();return;}
    state.session = AppRuntimeSession.load(sessionStorage);
    if (window.__runtimeLaunchTicket) {
      const ticket = window.__runtimeLaunchTicket;
      window.__runtimeLaunchTicket = null;
      const previousSession = state.session;
      const response = await fetch(`${RUNTIME_API}/v2/auth/browser-sessions`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ticket }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error?.message || '登录凭据无效或已过期，请从家长控制台重新进入');
      AppRuntimeSession.save(sessionStorage, payload);
      state.session = payload;
      if (previousSession?.token && previousSession.token !== payload.token) {
        fetch(`${RUNTIME_API}/v2/auth/browser-sessions/current`, {
          method: 'DELETE', headers: { Authorization: `RuntimeSession ${previousSession.token}` },
        }).catch(() => {});
      }
    }
    if (!state.session) throw new Error('请从 TimeOnChrome 家长控制台进入电脑应用管理');
    state.children = state.session.children;
    const selected = child(state.childId) || child(state.session.selectedChildId) || state.children[0];
    if (!selected) throw new Error('当前账户还没有孩子档案');
    state.childId = selected.id;
    renderChildPicker();
  }
  async function moduleToken(renew = false) {
    if(embedded){await issue();return null;}
    if (renew) {
      authRecovery.recover();
    }
    if (!state.session) await issue();
    return state.session.token;
  }
  async function runtime(path, options = {}) { assertLive();const key=state.childId+'|'+state.view;if(options.method&&options.method!=='GET')applicationReadCache.clear();let result;try{result=await (embedded?config.request(path,options):AppRuntimeNetwork.requestJson({ url: `${RUNTIME_API}${path}`, options, getToken: moduleToken, authorizationScheme: 'RuntimeSession' }));}catch(error){assertLive();if(key!==state.childId+'|'+state.view)throw Object.assign(new Error('组件上下文已变化'),{code:'COMPONENT_CONTEXT_CHANGED'});throw error;}assertLive();if(key!==state.childId+'|'+state.view)throw Object.assign(new Error('组件上下文已变化'),{code:'COMPONENT_CONTEXT_CHANGED'});return result; }

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
    state.records = { windowStartMs: Date.now() - 30 * 86400000, windowEndMs: Date.now(), pending: [
      { platform: 'windows', runtimeIdentity: 'app:obs', displayName: 'OBS Studio', firstSeenAtMs: dayStart, lastSeenAtMs: Date.now() - 480000, mainDurationMs: 720000, machineCount: 1, userCount: 1, classification: 'unclassified', status: 'pending', manageability: 'actionable', catalogKind: 'application', applicationOrigin: 'unknown', originEvidenceCode: null, catalogGroup: 'application', catalogGroupReasonCode: 'DEFAULT_APPLICATION' },
      { platform: 'windows', runtimeIdentity: 'app:aimlabs', displayName: 'Aimlabs', firstSeenAtMs: dayStart, lastSeenAtMs: Date.now() - 540000, mainDurationMs: 600000, machineCount: 1, userCount: 1, classification: 'restrictedEntertainment', classificationStatus: 'automatic', classificationReason: '游戏默认归为受限娱乐', status: 'processed', manageability: 'actionable', catalogKind: 'product', appType: 'game', typeStatus: 'confirmed', applicationOrigin: 'unknown', originEvidenceCode: null, catalogGroup: 'game', catalogGroupReasonCode: 'CONFIRMED_GAME_TYPE' },
      { platform: 'windows', runtimeIdentity: 'app:game-bar', displayName: 'Game Bar', firstSeenAtMs: dayStart, lastSeenAtMs: Date.now() - 570000, mainDurationMs: 120000, machineCount: 1, userCount: 1, classification: 'restrictedEntertainment', classificationStatus: 'automatic', classificationReason: '游戏默认归为受限娱乐', status: 'processed', manageability: 'actionable', catalogKind: 'product', appType: 'gameUtility', typeStatus: 'confirmed', applicationOrigin: 'unknown', originEvidenceCode: null, catalogGroup: 'game', catalogGroupReasonCode: 'CONFIRMED_GAME_UTILITY_TYPE' },
      { platform: 'windows', runtimeIdentity: 'app:calc', displayName: '计算器', firstSeenAtMs: dayStart, lastSeenAtMs: Date.now() - 600000, mainDurationMs: 420000, machineCount: 1, userCount: 1, classification: 'composite', classificationStatus: 'automatic', classificationReason: '系统应用默认归为复合', status: 'processed', manageability: 'actionable', catalogKind: 'application', applicationOrigin: 'operatingSystem', originEvidenceCode: 'exactPackageRule', catalogGroup: 'systemTool', catalogGroupReasonCode: 'EXACT_SYSTEM_TOOL_RULE' },
      { platform: 'windows', runtimeIdentity: 'app:quick-assist', displayName: '快速助手', firstSeenAtMs: dayStart, lastSeenAtMs: Date.now() - 900000, mainDurationMs: 180000, machineCount: 1, userCount: 1, classification: 'composite', classificationStatus: 'automatic', classificationReason: '系统应用默认归为复合', status: 'processed', manageability: 'actionable', catalogKind: 'application', applicationOrigin: 'operatingSystem', originEvidenceCode: 'exactPackageRule', catalogGroup: 'systemTool', catalogGroupReasonCode: 'EXACT_SYSTEM_TOOL_RULE' },
    ], processed: state.policy.classifications.filter((item) => item.runtimeIdentity !== 'app:chat').map((item) => ({ ...item, firstSeenAtMs: dayStart - 86400000, lastSeenAtMs: Date.now(), mainDurationMs: 1800000, machineCount: 1, userCount: 1, status: 'processed', manageability: 'actionable', catalogKind: 'application', applicationOrigin: 'unknown', originEvidenceCode: null, catalogGroup: item.displayName === 'Minecraft' ? 'game' : 'application', catalogGroupReasonCode: item.displayName === 'Minecraft' ? 'CONFIRMED_GAME_TYPE' : 'DEFAULT_APPLICATION' })), technical: [] };
    state.catalog = { windowStartMs: Date.now() - 30 * 86400000, windowEndMs: Date.now(), items: [
      { ...state.policy.classifications.find((item) => item.runtimeIdentity === 'app:vscode'), firstSeenAtMs: dayStart - 86400000, lastSeenAtMs: Date.now() - 300000, mainDurationMs: 4320000, machineCount: 1, userCount: 1, observedInWindow: true },
      { ...state.policy.classifications.find((item) => item.runtimeIdentity === 'app:edge'), firstSeenAtMs: dayStart - 86400000, lastSeenAtMs: Date.now() - 420000, mainDurationMs: 2880000, machineCount: 1, userCount: 1, observedInWindow: true },
      { ...state.policy.classifications.find((item) => item.runtimeIdentity === 'app:game'), firstSeenAtMs: dayStart - 86400000, lastSeenAtMs: Date.now() - 900000, mainDurationMs: 2100000, machineCount: 1, userCount: 1, observedInWindow: true },
      { ...state.policy.classifications.find((item) => item.runtimeIdentity === 'app:chat'), firstSeenAtMs: null, lastSeenAtMs: null, mainDurationMs: 0, machineCount: 0, userCount: 0, observedInWindow: false },
      ...state.records.pending,
    ].map((item) => ({ applicationOrigin: 'unknown', originEvidenceCode: null,
      appType:item.displayName==='Minecraft'?'game':'unknown',typeStatus:item.displayName==='Minecraft'?'confirmed':'unknown',typeReasonCode:item.displayName==='Minecraft'?'verifiedProductRule':'none',
      ...item, manageability: 'actionable', catalogKind: item.productId ? 'product' : 'application',
      catalogGroup:item.catalogGroup||(item.displayName==='Minecraft'?'game':'application'),catalogGroupReasonCode:item.catalogGroupReasonCode||(item.displayName==='Minecraft'?'CONFIRMED_GAME_TYPE':'DEFAULT_APPLICATION') })), technicalItems: [
      { platform: 'windows', displayName: 'wixstdba', catalogKind: 'unresolved', manageability: 'review', projectionReasonCode: 'TECHNICAL_IDENTITY_ONLY', lastSeenAtMs: Date.now() - 1800000, mainDurationMs: 360000, machineCount: 1, userCount: 1 },
      { platform: 'windows', displayName: 'Updater helper', catalogKind: 'component', manageability: 'hidden', projectionReasonCode: 'COMPONENT', lastSeenAtMs: null, mainDurationMs: 0, machineCount: 1, userCount: 1 },
    ] };
    state.mockInventory = state.catalog.items.map((item,index)=>({status:'installed',evidence:{platform:item.platform,runtimeIdentity:item.runtimeIdentity,displayName:item.displayName,values:{binaryHash:(index+1).toString(16).padStart(64,'0'),signerKey:'a'.repeat(64),productName:item.displayName},verifiedFields:['binaryHash','signerKey']}}));
    const requestedFixtures=Number(new URLSearchParams(location.search).get('inventoryFixtures'));
    const inventoryFixtures=Number.isSafeInteger(requestedFixtures)?Math.max(0,Math.min(200,requestedFixtures)):0;
    for(let index=state.mockInventory.length;index<inventoryFixtures;index++)state.mockInventory.push({status:'installed',evidence:{platform:index%2?'windows':'macos',runtimeIdentity:`fixture:application-${index}`,displayName:`受控应用夹具 ${index+1}`,values:{binaryHash:(index+1).toString(16).padStart(64,'0')},verifiedFields:['binaryHash']}});
    state.mockKnowledge = {schemaVersion:2,version:1,products:[{id:'fixture-game',name:'Minecraft',type:'game',selectors:[{platform:'windows',match:{operator:'all',conditions:[{field:'binaryHash',value:state.mockInventory[2].evidence.values.binaryHash}]}}]}],rules:[],bindings:[{childId:'demo-a',products:[{productId:'fixture-game',classification:'restrictedEntertainment'}],ruleIds:[]}]};
    if (new URLSearchParams(location.search).has('inventoryQuality')) {
      const fixture=(runtimeIdentity,displayName,role)=>({platform:'windows',runtimeIdentity,displayName,classification:'unclassified',installationState:'installed',observedInWindow:false,mainDurationMs:0,machineCount:1,userCount:1,discovery:{role,nameSource:role==='component'?'fallback':'appList',sourceKinds:['package']},catalogKind:role,manageability:role==='application'?'actionable':role==='component'?'hidden':'review',projectionReasonCode:role==='component'?'COMPONENT':role==='candidate'?'DISCOVERY_CANDIDATE':'VERIFIED_APPLICATION'});
      state.catalog.items.push({...fixture('fixture:unused','已安装未使用播放器','application'),catalogGroup:'application',catalogGroupReasonCode:'DEFAULT_APPLICATION'});
      state.catalog.items.push({platform:'windows',runtimeIdentity:null,displayName:'记事本',classification:'composite',classificationStatus:'automatic',classificationReason:'系统应用默认归为复合',installationState:'installed',observedInWindow:true,mainDurationMs:180000,machineCount:1,userCount:1,catalogKind:'product',manageability:'actionable',projectionReasonCode:'INSTALLATION_PRODUCT',applicationOrigin:'operatingSystem',originEvidenceCode:'exactPackageRule',catalogGroup:'systemTool',catalogGroupReasonCode:'EXACT_SYSTEM_TOOL_RULE',runtimeImplementations:[{platform:'windows',runtimeIdentity:'fixture:notepad-main',displayName:'记事本'}],variants:[{displayName:'记事本',platform:'windows',variantRole:'main',installationState:'installed',manageability:'actionable',classification:'composite'}]});
      state.catalog.items.push({platform:'windows',runtimeIdentity:null,displayName:'LibreOffice',classification:'unclassified',installationState:'installed',observedInWindow:false,mainDurationMs:0,machineCount:1,userCount:1,catalogKind:'product',manageability:'actionable',projectionReasonCode:'INSTALLATION_PRODUCT',catalogGroup:'application',catalogGroupReasonCode:'DEFAULT_APPLICATION',runtimeImplementations:[{platform:'windows',runtimeIdentity:'fixture:writer',displayName:'LibreOffice Writer'},{platform:'windows',runtimeIdentity:'fixture:calc',displayName:'LibreOffice Calc'}],variants:[{displayName:'LibreOffice Writer',platform:'windows',variantRole:'suiteMember',installationState:'installed',manageability:'actionable',classification:'unclassified'},{displayName:'LibreOffice Calc',platform:'windows',variantRole:'suiteMember',installationState:'installed',manageability:'actionable',classification:'unclassified'},{displayName:'LibreOffice Safe Mode',platform:'windows',variantRole:'suiteMember',installationState:'installed',manageability:'actionable',classification:'unclassified'}]});
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
    const period=range();$('#range-label').textContent=period.label;$('#chart-caption').textContent=`北京时间，${state.period==='day'?'按小时':'按每日'}`;
    const computer=state.usageKind==='computer';
    $('#runtime-computer-usage').hidden=!computer;
    $('[data-independent-app-usage]').hidden=state.usageKind!=='application';
    $('#runtime-web-usage').hidden=!['web','media'].includes(state.usageKind);
    ['machine-filter','user-filter','platform-filter'].forEach(id=>{const control=$('#'+id);control.disabled=state.usageKind!=='application';control.hidden=computer;});
    $('#application-read-note').textContent=state.usageReadInfo?`${state.usageReadInfo.legacy?'旧版兼容统计 · ':''}${state.usageReadInfo.cached?'缓存 · ':''}读取于 ${time(state.usageReadInfo.readAtMs)}（手动刷新可重新读取）`:'';
    if(state.usageKind!=='application')return;
    if (!mock && !state.usage) {
      const message = state.usageLoading ? '正在读取使用统计…' : state.usageError || '使用统计尚未加载';
      $('#total-time').textContent = '—';
      $('#quota-state').textContent = '暂不可用';
      $('#quota-state').classList.remove('danger-text');
      $('#last-sync').textContent = time(Math.max(0, ...state.machines.map(item => Number(item.lastUploadAtMs || item.lastSeenAtMs || 0))));
      $('#policy-version').textContent = state.managementLoaded ? `应用策略 v${state.policy.version}` : '应用策略未读取';
      $('#usage-chart').textContent = message;
      $('#category-legend').textContent = '';
      $('#app-ranking').innerHTML = `${escape(message)}${state.usageLoading ? '' : ' <button id="retry-usage">重试使用统计</button>'}`;
      $('#category-ranking').textContent = message;
      $('#outside-window-summary').textContent = '本周期时段外使用暂不可用';
      return;
    }
    const usage = state.usage || {};
    if(state.usageLoading)$('#application-read-note').textContent+=' · 正在刷新，显示上次有效统计';
    else if(state.usageError)$('#application-read-note').textContent+=` · ${state.usageError}；保留上次有效统计，截止见下方，点击刷新重试`;
    if(usage.durationUnit==='seconds'){renderSecondsUsage(usage);return;}
    $('#outside-window-summary').textContent = `本周期时段外使用 ${duration(usage.outsideTimeWindows?.durationMs || 0)}`;
    $('#total-time').textContent = duration(usage.totalDurationMs);
    $('#last-sync').textContent = time(Math.max(0, ...state.machines.map((item) => Number(item.lastUploadAtMs || item.lastSeenAtMs || 0))));
    $('#policy-version').textContent = usage.appPolicyVersion ? `应用策略 v${usage.appPolicyVersion}` : state.managementLoaded ? `应用策略 v${state.policy.version}` : '应用策略未读取';
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

  function renderSecondsUsage(usage) {
    const fmt=AppRuntimeTime.formatSeconds,label=category=>categoryLabels[category]||(category==='historicalUnknown'?'历史分类未知':'未知分类');
    $('#total-time').textContent=fmt(usage.totalDurationSeconds);
    $('#quota-state').textContent='独立统计，配额另行核算';
    $('#quota-state').classList.remove('danger-text');
    $('#policy-version').textContent='Service 权威秒统计';
    $('#last-sync').textContent=time(usage.settledThroughMs);
    $('#outside-window-summary').textContent=usage.noNewRecordDates?.length
      ?`无新版应用记录：${usage.noNewRecordDates.join('、')}；旧应用账已退出，空白不代表零用量。`
      :usage.complete?'已结算应用统计；分类明细可能重叠，不相加生成总量。'
      :`部分统计可用：${fmt(usage.availableTotalDurationSeconds)}；不完整日期：${usage.missingDates.join('、')}。空白不代表零用量。`;
    const max=Math.max(1,...usage.buckets.map(item=>item.durationSeconds??0));
    $('#usage-chart').innerHTML=usage.buckets.map(item=>{
      const caption=state.period==='day'?AppRuntimeTime.beijingHourLabel(item.startAtMs):new Date(item.startAtMs).toLocaleDateString('zh-CN',{weekday:'short',timeZone:'Asia/Shanghai'});
      return `<div class="bar" title="${fmt(item.durationSeconds)}" style="height:${item.durationSeconds===null?0:Math.max(2,item.durationSeconds/max*100)}%">${item.durationSeconds>0?'<i class="bar-part" style="height:100%;background:var(--green)"></i>':''}<span class="bar-label">${escape(caption)}</span></div>`;
    }).join('');
    $('#category-legend').innerHTML=usage.categories.map(item=>`<span><i style="background:${categoryColors[item.classification]||categoryColors.unclassified}"></i>${escape(label(item.classification))} ${fmt(item.durationSeconds)}</span>`).join('');
    $('#app-ranking').className='list';
    $('#app-ranking').innerHTML=usage.applications.map((item,index)=>`<button class="app-row" data-usage-app="${index}"><span class="app-icon">${index+1}</span><div class="app-meta"><strong>${escape(item.displayName||'未知应用')}</strong><small>${escape(item.classifications.map(label).join('／'))}</small></div><div><strong>${fmt(item.durationSeconds)}</strong><small>独立应用统计</small></div></button>`).join('')||(usage.complete?'暂无使用记录':'尚无可用应用明细');
    $('#category-ranking').className='list';
    $('#category-ranking').innerHTML=usage.categories.map(item=>`<button class="category-row" data-usage-category="${escape(item.classification)}"><span class="app-icon">${escape(label(item.classification).slice(0,1))}</span><div><strong>${escape(label(item.classification))}</strong><small>分类明细可能重叠</small></div><strong>${fmt(item.durationSeconds)}</strong></button>`).join('')||(usage.complete?'暂无分类记录':'尚无可用分类明细');
    if(usage.productStatus?.complete===false){
      $('#outside-window-summary').textContent+=' 产品／分类投影尚未完整，基础用量仍有效。';
      if(!usage.applications.length)$('#app-ranking').textContent='产品明细待更新；基础实例见下方。';
      if(!usage.categories.length)$('#category-ranking').textContent='分类明细待更新；未识别不等于未归类。';
    }
    if(usage.instances?.length)$('#app-ranking').innerHTML+=`<details><summary>基础程序实例（${usage.instances.length}）；明细可能重叠，不相加生成总量</summary>${usage.instances.map(item=>`<p><code>${escape(item.subjectKey)}</code> · ${fmt(item.durationSeconds)}</p>`).join('')}</details>`;
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
    if(category==='special')return (state.catalog.items||[]).filter(item=>item.presentationKind==='contentBased');
    const specialKeys=new Set((state.catalog.items||[]).filter(item=>item.presentationKind==='contentBased')
      .flatMap(item=>[...(item.runtimeIdentity?[AppRuntimePolicy.keyOf(item)]:[]),...(item.runtimeImplementations||[]).map(AppRuntimePolicy.keyOf)]));
    const scope = $('#directory-scope').value;
    if (scope === 'usage') return category === 'unclassified' ? (state.records.pending || []).filter(item=>!specialKeys.has(AppRuntimePolicy.keyOf(item)))
      : (state.catalog.items || []).filter(item=>item.presentationKind!=='contentBased'&&item.classification===category&&item.observedInWindow);
    return (state.catalog.items || []).filter(item=>item.presentationKind!=='contentBased'&&item.classification===category)
      .filter(item=>scope==='all'||scope==='unused' ? scope==='all'||item.installationState==='installed'&&!item.observedInWindow
        : item.observedInWindow||item.classification!=='unclassified'||item.catalogKind==='product'||item.catalogKind==='application');
  }
  function classificationActions(app, selected = 'unclassified') {
    if (app.manageability !== 'actionable') return '';
    const index = state.actionApps.push(app) - 1;
    return ['study','composite','restrictedEntertainment','other','blocked','unclassified'].map((category) => `<button data-classify-index="${index}" data-classification="${category}"${category === selected ? ' class="current" disabled' : ''}>${category === 'unclassified' ? '暂不归类' : `归为${categoryLabels[category]}`}</button>`).join('');
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
    const origin = app.catalogGroup === 'systemTool' ? '<span class="system-origin-chip">系统应用</span>' : '';
    const typeLabels={game:'游戏',gameLauncher:'游戏平台／启动器',gameUtility:'游戏工具',onlineVideo:'在线视频',mediaPlayer:'影音播放器',other:'其他',unknown:'类型未知'};
    const appType=app.appType||app.productType||'unknown';
    const typeText=app.catalogGroup==='systemTool'?'系统应用'
      :app.typeStatus==='suggested'?`疑似${typeLabels[appType]}`:app.typeStatus==='confirmed'?typeLabels[appType]:'类型未知';
    const typeAndClass=app.presentationKind==='contentBased'
      ?`特殊应用 · 原应用配置：${categoryLabels[app.classification]||'未归类'}`
      :`${typeText} · ${categoryLabels[app.classification]||'未归类'}`;
    const variants = visibleProductVariants(app);
    const variantDetails = variants.length ? `<details class="product-variants"><summary>${variants.length} 个产品变体</summary><div>${variants.map((variant) => `<article><strong>${escape(variant.displayName || '未命名变体')}</strong><span>${variant.platform === 'macos' ? 'macOS' : 'Windows'} · ${{main:'主入口',suiteMember:'套件入口',maintenance:'维护入口',helper:'辅助组件',hosted:'宿主内容',unknown:'待确认'}[variant.variantRole] || '待确认'} · ${variant.splitManaged ? '已拆分管理' : '继承产品设置'}</span></article>`).join('')}</div><button type="button" data-manage-variants>管理／拆分变体</button></details>` : '';
    return `<article class="record-card product-record"><div class="app-record-main"><span class="app-icon" aria-hidden="true">${escape((app.displayName || '?').slice(0, 1))}</span><div><strong>${escape(app.displayName || '未知应用')}</strong>${origin}<p><b class="app-type-classification">${escape(typeAndClass)}</b></p><p><span class="platform-chip ${escape(app.platform)}">${app.platform === 'macos' ? 'macOS' : 'Windows'}</span> · 最近使用 ${recent}${installation?` · ${installation}`:''}${variants.length?` · ${variants.length} 个变体`:''}</p><p>最近 30 天主账本 ${duration(mainDuration)} · ${coverage}</p>${app.classificationReason?`<p>${escape(app.classificationReason)}</p>`:''}${note||fallback?`<p>${escape([note,fallback].filter(Boolean).join(' · '))}</p>`:''}${variantDetails}</div></div>${actions?`<div class="record-actions" aria-label="${escape(app.displayName || '未知应用')} 分类操作">${actions}</div>`:''}</article>`;
  }
  function renderAppDirectory() {
    state.actionApps = [];
    $('#directory-scope').disabled=Boolean(state.identityCatalog)||Boolean(state.managementError);
    $('#directory-scope').title=state.identityCatalog?'新版产品目录尚未提供安装／使用范围，不能按旧盘点筛选':'';
    if(state.identityCatalog&&!state.managementError){
      $('#directory-scope').value='all';
      const catalog=state.identityCatalog,binding=catalog.bindings.find(item=>item.childId===state.childId);
      const choices=[['study','学习应用'],['composite','复合应用'],['restrictedEntertainment','受限娱乐应用'],['other','其他时间应用'],['blocked','黑名单应用'],['unclassified','明确未归类'],['following','跟随分类规则'],['special','特殊应用']];
      const category=product=>product.catalogGroup==='specialApplication'?'special':binding?.products.find(item=>item.productId===product.id)?.classification??'following';
      const platforms=product=>[...new Set(catalog.ownershipRules.filter(rule=>rule.enabled&&rule.productId===product.id).map(rule=>rule.platform))];
      $('#open-products').disabled=false;$('#open-rules').disabled=false;
      $('#open-rules').title='管理孩子批准、分类结果、模式、平台及高级条件草稿；保存须通过云端校验';
      $('#app-category-nav').innerHTML=choices.map(([key,label])=>`<button class="app-category-item ${state.appCategory===key?'active':''}" data-app-category="${key}"><strong>${label}</strong><span>${catalog.products.filter(product=>category(product)===key).length}</span></button>`).join('');
      const search=($('#app-search').value||'').trim().toLowerCase(),platform=$('#management-platform').value;
      const items=catalog.products.filter(product=>category(product)===state.appCategory&&(!search||product.name.toLowerCase().includes(search))&&(!platform||platforms(product).includes(platform)));
      $('#app-directory-title').textContent=choices.find(([key])=>key===state.appCategory)?.[1]||'产品目录';
      $('#app-directory-subtitle').textContent=`集中目录 v${catalog.version}；分类为当前孩子明确设置，跟随规则的实际分类以实例投影为准。`;
      $('#inventory-status').textContent='平台仅表示已启用归属规则的范围，不代表已安装、盘点完整或终端已执行。';
      const games=items.filter(product=>['game','gameLauncher','gameUtility'].includes(product.type));
      const ordinary=items.filter(product=>!games.includes(product));
      const cards=list=>list.map(product=>`<article class="record-card product-record"><div><strong>${escape(product.name)}</strong><p>${escape(platforms(product).map(value=>value==='macos'?'macOS':'Windows').join(' / ')||'尚无启用的归属规则')}</p><small>${escape(product.id)}</small></div><button data-edit-identity-product>编辑集中目录资料</button></article>`).join('')||'<p class="empty">当前栏目没有符合筛选的产品；不代表使用时长为零。</p>';
      $('#managed-app-list').innerHTML=cards(ordinary);$('#game-app-list').innerHTML=cards(games);
      $('#ordinary-app-count').textContent=`${ordinary.length} 个`;$('#game-app-count').textContent=`${games.length} 个`;
      $('#system-tool-count').textContent='未区分';$('#system-tool-list').textContent='新版目录未记录系统来源属性，不按名称猜分组。';
      $('#processed-count').textContent='未读取';$('#processed-records').textContent='旧处理历史未接入新版目录；程序实例记录可独立查看。';
      $('#processed-history').hidden=true;
      return;
    }
    $('#open-products').disabled = Boolean(state.managementError);
    $('#open-rules').disabled = Boolean(state.managementError);
    if(state.managementError){
      $('#app-category-nav').textContent='产品目录暂不可用';
      $('#app-directory-title').textContent='产品目录暂不可用';
      $('#inventory-status').textContent='目录读取失败；盘点完整性和应用数量未知。';
      $('#app-directory-subtitle').textContent='程序实例仍可独立查看。请刷新重试产品目录，当前不提供分类修改。';
      $('#managed-app-list').innerHTML=`<p class="empty">${escape(state.managementError)}</p>`;
      for(const selector of ['#game-app-list','#system-tool-list','#processed-records'])$(selector).innerHTML='';
      for(const selector of ['#ordinary-app-count','#game-app-count','#system-tool-count','#processed-count'])$(selector).textContent='未知';
      $('#processed-history').hidden=true;
      return;
    }
    const catalog = [
      ['study', '▣', '学习应用'], ['composite', '∞', '复合应用'],
      ['restrictedEntertainment', '♟', '受限娱乐应用'], ['other', '◌', '其他时间应用'], ['blocked', '⊗', '黑名单应用'],
      ['unclassified', '◉', '已使用未归类应用'],
      ['special','◈','特殊应用'],
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
    const gameApps = list.filter((item) => item.catalogGroup === 'game');
    const systemTools = list.filter((item) => item.catalogGroup === 'systemTool');
    const ordinaryApps = list.filter((item) => item.catalogGroup !== 'game' && item.catalogGroup !== 'systemTool');
    $('#app-directory-title').textContent = current === 'unclassified' ? ($('#directory-scope').value==='usage'?'已使用未归类应用':'未归类应用 · 安装发现与使用观察') : `${categoryLabels[current]}应用`;
    $('#app-directory-subtitle').textContent = current === 'unclassified'
      ? `当前范围待处理 ${source.length} 个 · 使用证据最近 30 天；安装发现不生成账本，归类仅向前生效`
      : `应用 ${categoryCounts(current).total} · Windows ${categoryCounts(current).windows} · macOS ${categoryCounts(current).macos}`;
    if(current==='special'){
      $('#app-directory-title').textContent='特殊应用';
      $('#app-directory-subtitle').textContent='Chrome 容器计入电脑使用；网页内容解释展示分类。原应用配置和现行配额不变。只有可信产品关联确认后才列入；Windows 关联证据不足时不会按名称纳入。';
    }
    const groups = [
      { key: 'application', element: $('#ordinary-app-group'), list: $('#managed-app-list'), items: ordinaryApps, empty: '当前分组没有符合条件的普通应用' },
      { key: 'game', element: $('#game-app-group'), list: $('#game-app-list'), items: gameApps, empty: '当前分组没有符合条件的游戏' },
      { key: 'systemTool', element: $('#system-tool-group'), list: $('#system-tool-list'), items: systemTools, empty: '当前分组没有符合条件的系统应用' },
    ];
    $('#ordinary-app-group').querySelector('summary span:first-child').textContent=current==='special'?'特殊应用':'普通应用';
    $('#game-app-count').textContent = `${gameApps.length} 个`;
    $('#ordinary-app-count').textContent = `${ordinaryApps.length} 个`;
    $('#system-tool-count').textContent = `${systemTools.length} 个`;
    for (const group of groups) {
      const open = Boolean(state.appGroups[group.key] || (search && group.items.length));
      group.element.open = open;
      group.list.innerHTML = open
        ? (group.items.length ? group.items.map((item) => appRow(item, current)).join('') : `<p class="empty">${group.empty}</p>`)
        : '';
    }
    const specialKeys=new Set((state.catalog.items||[]).filter(item=>item.presentationKind==='contentBased')
      .flatMap(item=>[...(item.runtimeIdentity?[AppRuntimePolicy.keyOf(item)]:[]),...(item.runtimeImplementations||[]).map(AppRuntimePolicy.keyOf)]));
    const history = (state.records.processed || []).filter(item=>!specialKeys.has(AppRuntimePolicy.keyOf(item))).filter(filter);
    const historyGroup = $('#processed-history');
    historyGroup.hidden = current !== 'unclassified';
    const historyOpen = current === 'unclassified' && Boolean(state.appGroups.processed || (search && history.length));
    historyGroup.open = historyOpen;
    $('#processed-records').innerHTML = historyOpen ? (history.length ? history.map((item) => appRow(item, item.classification)).join('') : '<p class="empty">暂无已处理历史</p>') : '';
    $('#processed-count').textContent = history.length;
    const scans = state.catalog.inventoryScans || [];
    $('#inventory-status').innerHTML = scans.length ? scans.map((scan,index)=>{const sourceResults=scan.sourceResults||[];const sourceSummary=sourceResults.length?`<span class="inventory-sources">${sourceResults.map(source=>`<b class="source-${escape(source.status)}">${escape(source.source)}：${source.status==='complete'?'成功':source.status==='complete_with_warnings'?`警告 ${Number(source.warningCodes?.length||0)}`:'失败'}</b>`).join('')}</span>`:'';return `<span>${escape(scan.machineName)} · 账户盘点 ${index+1}：${({complete:'该用户盘点完整',completeWithWarnings:'已完成，含单项警告',syncing:'同步中',partial:'部分来源失败',unverified:'尚未验证（未盘点或旧客户端）'})[scan.status]||'状态未知'} · ${scan.receivedBatches}/${scan.expectedBatches} 批 · ${scan.observationCount} 条观察${scan.failedSources?.length?` · ${scan.failedSources.length} 个来源失败`:''} · ${time(scan.updatedAtMs)}${sourceSummary}</span>`;}).join('；') + '。仅完成的来源可结算该来源的缺失对象；警告或失败不会被误判为整机卸载。' : '盘点完整性未验证；目录数量不等于已完成整机盘点。';
  }
  function renderQuotaForm() {
    const quotas = state.policy.quotas;
    if (mock) state.sharedAccess ||= { schemaVersion: 1, revision: 'mock:1', effectiveAtMs: Date.now(), stage: 'shadow',
      dailyMinutes: Object.fromEntries(AppRuntimePolicy.weekdays.map((day) => [day, { study: 60, composite: 60, rest: 90 }])), weeklyRestMinutes: 300,
      timeWindows: Object.fromEntries(AppRuntimePolicy.weekdays.map((day) => [day, { study: null, composite: null, rest: null }])),
      autonomy: { restrictedEntryConfirmationRequired: true, dailyFirstReminderMinutes: 45, weeklyFirstReminderMinutes: null, repeatReminderMinutes: 60, softReminderTimeoutAction: 'continue', visibleResponseDeadlineSeconds: 60 } };
    const shared = state.sharedAccess;
    const dayLabels = { monday: '周一', tuesday: '周二', wednesday: '周三', thursday: '周四', friday: '周五', saturday: '周六', sunday: '周日' };
    const minutes = (value) => value == null ? '不限' : `${value} 分钟`;
    const rows = shared ? AppRuntimePolicy.weekdays.map((day) => `<div class="shared-access-row"><strong>${dayLabels[day]}</strong><span>学习 ${minutes(shared.dailyMinutes?.[day]?.study)}</span><span>复合 ${minutes(shared.dailyMinutes?.[day]?.composite)}</span><span>娱乐 ${minutes(shared.dailyMinutes?.[day]?.rest)}</span></div>`).join('') : '';
    const stateLabel = shared ? ({ legacy: '沿用旧配置来源', shadow: '影子核对中', shared: '共享执行' }[shared.stage] || '状态未知') : '统一访问配置暂不可读取';
    $('#quota-form').innerHTML = shared ? `<p>配置版本 ${escape(shared.revision)} · ${stateLabel}</p><div class="shared-access-grid">${rows}</div><p>每周娱乐 ${minutes(shared.weeklyRestMinutes)} · 娱乐进入确认 ${shared.autonomy?.restrictedEntryConfirmationRequired ? '开启' : '关闭'} · 日提醒 ${minutes(shared.autonomy?.dailyFirstReminderMinutes)} · 周提醒 ${minutes(shared.autonomy?.weeklyFirstReminderMinutes)} · 重复间隔 ${minutes(shared.autonomy?.repeatReminderMinutes)}</p><p class="muted">单应用限制在“单应用限制”维护；终端共享执行覆盖仍需在设备管理核对。</p>` : `<p class="error">无法读取主控制台的统一配置（${escape(state.sharedAccessError || 'UNKNOWN')}）。应用统计和分类管理仍可用。</p>`;
    state.quotaApps = observedApps();
    const per = new Map(quotas.perApplicationDailyMinutes.map((item) => [AppRuntimePolicy.keyOf(item), item.minutes]));
    $('#app-quota-list').innerHTML = state.quotaApps.map((app, index) => `<div class="quota-app-row"><span class="app-icon">${escape((app.displayName || '?')[0])}</span><div><strong>${escape(app.displayName || '未知应用')}</strong><small>${app.platform}</small></div><input type="number" min="0" data-app-quota-index="${index}" value="${per.get(AppRuntimePolicy.keyOf(app)) ?? ''}" placeholder="无限制" aria-label="${escape(app.displayName)} 每日分钟"></div>`).join('') || '<p class="empty">暂无已观察应用</p>';
  }
  function renderSchedule() {
    const dayLabels = { monday: '周一', tuesday: '周二', wednesday: '周三', thursday: '周四', friday: '周五', saturday: '周六', sunday: '周日' };
    const shared = state.sharedAccess;
    const categories = [['study', '学习'], ['composite', '复合'], ['rest', '娱乐']];
    $('#schedule-editor').innerHTML = shared ? AppRuntimePolicy.weekdays.map((day) => `<section class="schedule-day"><h3>${dayLabels[day]}</h3><div class="schedule-categories">${categories.map(([key, label]) => {
      const windows = shared.timeWindows?.[day]?.[key];
      const text = windows == null ? '全天开放' : windows.length ? windows.map((window) => `${escape(window.start)}–${escape(window.end)}`).join('、') : '全天不开放';
      return `<div class="schedule-cell"><strong>${label}</strong><div class="schedule-windows">${text}</div></div>`;
    }).join('')}</div></section>`).join('') : `<p class="error">无法读取统一时间段（${escape(state.sharedAccessError || 'UNKNOWN')}）。</p>`;
  }
  function assignmentOptions(selectedId, protectedValue = true) { return `<option value="u"${!protectedValue ? ' selected' : ''}>成人／不保护</option>` + state.children.map((item, index) => `<option value="${index}"${protectedValue && item.id === selectedId ? ' selected' : ''}>${escape(item.name)}</option>`).join(''); }
  function renderMachines() { $('#machines').innerHTML = state.machines.map((machine) => `<button type="button" class="machine-card" data-open-machine="${escape(machine.id)}"><span class="platform-icon">${machine.platform === 'macos' ? '●' : '⊞'}</span><div><strong>${escape(machine.displayName || '电脑')}</strong><p>${escape(AppRuntimeDevices.osLabel(machine))} · ${escape(machine.architecture || '—')} · 最近在线 ${time(machine.lastSeenAtMs)}</p></div><span class="policy ${escape(machine.policyState)}">${policyLabel(machine.policyState)}</span><span class="badge ${escape(machine.status)}">${statusLabel(machine.status)}</span><span>›</span></button>`).join('') || '<p class="empty">尚未添加 Runtime 电脑</p>'; }
  function renderHealth() { $('#health-list').innerHTML = state.machines.map((machine) => `<article class="health-card"><strong>${escape(machine.displayName || '电脑')}</strong><p>Service ${escape(machine.serviceVersion || '未报告')} · Agent 运行状态未单独报告</p><p>策略 ${machine.appliedPolicyVersion || 0}/${machine.desiredPolicyVersion || 0} · ${policyLabel(machine.policyState)}</p><p>${escape(AppRuntimeDevices.productBlockStatus(machine))}</p><span class="badge ${escape(machine.status)}">${statusLabel(machine.status)}</span></article>`).join('') || '<p>暂无设备</p>'; }
  function renderTechnicalRecords() {
    const items = state.catalog.technicalItems || [];
    $('#technical-record-count').textContent = `${items.length} 条`;
    $('#technical-record-list').className = `technical-record-list${items.length ? '' : ' empty'}`;
    $('#technical-record-list').innerHTML = items.length ? items.map((item) => {
      const reason = projectionReasonLabels[item.projectionReasonCode] || '尚未形成可管理产品身份';
      return `<article class="technical-record"><div><strong>${escape(item.displayName || '未知技术进程')}</strong><p><span class="platform-chip ${escape(item.platform)}">${item.platform === 'macos' ? 'macOS' : 'Windows'}</span> · ${item.lastSeenAtMs ? `最近使用 ${time(item.lastSeenAtMs)}` : '最近 30 天无使用'}</p></div><div><strong>${duration(item.mainDurationMs || 0)}</strong><p>${escape(reason)}</p></div><span class="badge offline">只读</span></article>`;
    }).join('') : '<p>暂无技术进程记录</p>';
  }
  function openDrawer(machineId) { const machine = state.machines.find((item) => item.id === machineId); if (!machine) return; const users = state.users.get(machine.id) || []; $('#drawer-content').innerHTML = `<h2>${escape(machine.displayName || '电脑')}</h2><p>${escape(AppRuntimeDevices.osLabel(machine))} · ${escape(machine.architecture || '—')}</p><div class="drawer-section"><h3>运行状态</h3><p>Service ${escape(machine.serviceVersion || '未报告')}</p><p>最近在线：${time(machine.lastSeenAtMs)}<br>最近同步：${time(AppRuntimeDevices.syncAt(machine))}<br>策略：${machine.appliedPolicyVersion || 0}/${machine.desiredPolicyVersion || 0} · ${policyLabel(machine.policyState)}<br>${escape(AppRuntimeDevices.productBlockStatus(machine))}<br>Tamper：${machine.tamperCount || 0} 次</p></div><div class="drawer-section"><h3>账户分配</h3><label>新用户默认关联<select data-default="${escape(machine.id)}">${state.children.map((item,index) => `<option value="${index}"${item.id === machine.defaultChildId ? ' selected' : ''}>${escape(item.name)}</option>`).join('')}</select></label>${users.map((user) => `<label>${escape(user.displayName)}<select data-machine="${escape(machine.id)}" data-user="${escape(user.localUserId)}">${assignmentOptions(user.childId, user.protected)}</select><small>${AppRuntimeDevices.accountStatus(user)} · ${policyLabel(user.policyState)}</small></label>`).join('') || '<p>已配对；等待本机服务首次上报账户。</p>'}</div><div class="drawer-section drawer-actions"><button data-uninstall="${escape(machine.id)}">生成卸载码</button>${machine.status !== 'revoked' ? `<button class="danger" data-revoke="${escape(machine.id)}">吊销机器</button>` : ''}</div>`; $('#device-drawer').classList.add('open'); $('#device-drawer').setAttribute('aria-hidden', 'false'); $('#mobile-backdrop').hidden = false; }
  function closeDrawer() { $('#device-drawer').classList.remove('open'); $('#device-drawer').setAttribute('aria-hidden', 'true'); $('#mobile-backdrop').hidden = true; }
  function openUsageDetail(kind, value) { const item = kind === 'app' ? state.usage.applications?.[Number(value)] : state.usage.categories?.find((entry) => entry.classification === value); if (!item) return; const title = kind === 'app' ? item.displayName || '未知应用' : categoryLabels[item.classification]||'历史分类未知';
    if(state.usage.durationUnit==='seconds'){
      $('#drawer-content').innerHTML=`<h2>${escape(title)}</h2><div class="drawer-section"><h3>本周期主使用</h3><p class="detail-duration">${AppRuntimeTime.formatSeconds(item.durationSeconds)}</p><p>Service 权威统计；配额由独立模块核算。</p></div><div class="notice warning"><span>明细可能重叠，不相加生成总量；${state.usage.complete?'范围完整':'当前仅部分来源可用'}。</span></div>`;
    }else $('#drawer-content').innerHTML = `<h2>${escape(title)}</h2><p>${kind === 'app' ? `${escape(item.platform)} · ${categoryLabels[item.classification] || '未归类'}` : '分类使用详情'}</p><div class="drawer-section"><h3>本周期主使用</h3><p class="detail-duration">${duration(item.durationMs)}</p><p>${item.quota?.limitMs == null ? '配额：无限制' : `配额：${duration(item.quota.limitMs)}<br>剩余：${duration(item.quota.remainingMs)}<br>状态：${item.quota.exceeded ? '已超额' : '未超额'}`}</p></div><div class="notice warning"><span>统计只读取主账本区间并集；辅助媒体不进入此详情或配额。</span></div>`; $('#device-drawer').classList.add('open'); $('#device-drawer').setAttribute('aria-hidden', 'false'); $('#mobile-backdrop').hidden = false; }

  async function loadMachineState() {
    const response = await runtime('/v2/module/machines');
    const machines = response.machines || [];
    const users = await Promise.all(machines.map(async (machine) => {
      const result = await runtime(`/v2/module/machines/${encodeURIComponent(machine.id)}/users`);
      return [machine.id, result.users || []];
    }));
    state.machines = machines;
    state.users = new Map(users);
  }
  async function loadManagementState() {
    const childId = encodeURIComponent(state.childId);
    state.identityCatalog=null;
    const policyPromise = runtime(`/v2/module/app-policy?childId=${childId}`);
    const catalogPromise = runtime(`/v2/module/app-catalog?childId=${childId}`);
    const sharedAccessPromise = runtime(`/v2/module/shared-access-policy?childId=${childId}`).then((result) => {
      state.sharedAccess = result.policy || null;
      state.sharedAccessError = null;
    }).catch((error) => {
      if(error?.code==='COMPONENT_CONTEXT_CHANGED')throw error;
      state.sharedAccess = null;
      state.sharedAccessError = error?.code || 'SHARED_ACCESS_POLICY_UNAVAILABLE';
    });
    const recordsPromise = catalogPromise.then((catalog) => AppRuntimeNetwork.catalogClassificationRecords(catalog, () => runtime(`/v2/module/app-classification-records?childId=${childId}`)));
    let results;
    try{results=await Promise.all([policyPromise, catalogPromise, recordsPromise, sharedAccessPromise]);}
    catch(error){
      if(state.view!=='apps'||error?.code!=='APPLICATION_KNOWLEDGE_READER_NOT_ADAPTED')throw error;
      const result=await runtime('/v2/module/program-instance-catalog');
      if(result.state!=='available'||result.catalog?.schemaVersion!==4||result.catalog.version!==result.version)throw error;
      state.identityCatalog=result.catalog;state.catalog={items:[],technicalItems:[]};state.records={pending:[],processed:[],technical:[]};
      state.managementError=null;state.managementLoaded=true;state.appCategory='following';return;
    }
    const [policy, catalog, records] = results;
    state.policy = AppRuntimePolicy.normalize(policy);
    state.policyEtag = `"app-policy-v${state.policy.version}"`;
    state.catalog = catalog;
    state.records = records;
    state.managementError = null;
    state.managementLoaded = true;
  }
  async function load({ freshToken = false } = {}) {
    const requestedView = state.view;
    setLoading(true);
    try {
      if (freshToken) state.session = null;
      if (mock) { mockData(); renderAll(); markLoaded(); if(state.view==='usage')await loadUsage(); return; }
      await moduleToken(false);
      if (requestedView === 'configuration') {
        const policy = await runtime(`/v2/module/app-policy?childId=${encodeURIComponent(state.childId)}`);
        state.policy = AppRuntimePolicy.normalize(policy); state.policyEtag = `"app-policy-v${state.policy.version}"`;
        markLoaded(); clearError();
      } else if (requestedView === 'system') {
        let technicalError = null;
        await Promise.all([loadMachineState(), runtime(`/v2/module/app-catalog?childId=${encodeURIComponent(state.childId)}`)
          .then(catalog => { state.catalog = catalog; })
          .catch(error => { if(error?.code==='COMPONENT_CONTEXT_CHANGED')throw error;technicalError = error; })]);
        renderAll(); markLoaded(); clearError();
        if(technicalError)$('#technical-record-list').textContent='技术记录暂不可用，请刷新重试';
        await Promise.all([
          loadLoggingPolicy().catch(error => { if(error?.code==='COMPONENT_CONTEXT_CHANGED')throw error;$('#remote-log-detail').textContent='日志策略暂不可用，请刷新重试';$('#enable-remote-logging').disabled=true;$('#disable-remote-logging').disabled=true; }),
          loadRuntimeLogs().catch(error => { if(error?.code==='COMPONENT_CONTEXT_CHANGED')throw error;$('#runtime-log-list').textContent='日志读取失败，请重试'; }),
        ]);
      } else if (requestedView === 'devices' || requestedView === 'usage') {
        await loadMachineState();
        renderAll(); markLoaded(); if (state.view === requestedView) clearError();
        if (requestedView === 'usage') void loadUsage();
      } else {
        await loadManagementState();
        renderAll(); markLoaded(); if (state.view === requestedView) clearError();
      }
    } catch (error) {
      if(!live()||error?.code==='COMPONENT_CONTEXT_CHANGED')return;
      if(state.view===requestedView&&requestedView==='apps'&&error?.code!=='AUTH_RECOVERY_FAILED'){
        state.identityCatalog=null;state.managementError=error?.code||'APPLICATION_DIRECTORY_UNAVAILABLE';
        state.managementLoaded=false;
        state.catalog={items:[],technicalItems:[]};
        state.records={pending:[],processed:[],technical:[]};
        renderAll();markLoaded(false);
      }
      if (state.view === requestedView) showError(error);
    }
    finally { setLoading(false); }
  }
  let usageRequestVersion = 0;
  async function loadUsage({refresh=false}={}) {
    const requestVersion = ++usageRequestVersion;
    computerReader.invalidate();independentReader.invalidate();
    if(state.usageKind==='computer'){renderUsage();await computerReader.load({refresh});return;}
    if(['web','media'].includes(state.usageKind)){renderUsage();await independentReader.load();return;}
    if (mock) return;
    const period = range();
    const query = new URLSearchParams({ childId: state.childId, fromMs: String(period.from), toMs: String(period.to), view:'display' });
    if ($('#machine-filter').value) query.set('machineId', $('#machine-filter').value);
    if ($('#user-filter').value) query.set('userId', $('#user-filter').value);
    if ($('#platform-filter').value) query.set('platform', $('#platform-filter').value);
    const requestKey=`/v2/module/program-instance-usage?${query}`;
    if(state.usageResultKey!==requestKey){state.usage=null;state.usageReadInfo=null;state.usageResultKey=null;}
    state.usageError = null; state.usageLoading = true; renderUsage();
    try {
      const read=await applicationReadCache.read(requestKey,()=>runtime(requestKey),{refresh});
      if(requestVersion!==usageRequestVersion)return;
      const value=AppRuntimeTime.applicationIdentityView(read.value);
      if (requestVersion === usageRequestVersion) {state.usage=value;state.usageReadInfo=read;state.usageResultKey=requestKey;}
    } catch (error) {
      if (requestVersion !== usageRequestVersion) return;
      state.usageError = `使用统计暂不可用：${AppRuntimeNetwork.friendlyError(error).message}`;
      if (error?.code === 'AUTH_RECOVERY_FAILED') showError(error);
    } finally {
      if (requestVersion === usageRequestVersion) { state.usageLoading = false; renderUsage(); }
    }
  }
  function renderAll() {
    renderChildPicker();
    if (state.view === 'usage') { const period = range(); $('#range-label').textContent = period.label; $('#chart-caption').textContent = `北京时间，${state.period === 'day' ? '按小时' : '按每日'}`; renderFilters(); renderUsage(); }
    else if (state.view === 'access') { renderQuotaForm(); renderSchedule(); }
    else if (state.view === 'apps') renderAppDirectory();
    else if (state.view === 'devices') renderMachines();
    else if (state.view === 'system') { renderHealth(); renderLoggingPolicy(); renderTechnicalRecords(); }
  }
  async function savePolicy(next) { if (mock) { const history = [...(state.records.pending || []), ...(state.records.processed || [])]; state.policy = AppRuntimePolicy.normalize({ ...next, version: state.policy.version + 1, effectiveAtMs: Date.now() }); state.policyEtag = `"app-policy-v${state.policy.version}"`; const current = new Map(state.policy.classifications.map((entry) => [AppRuntimePolicy.keyOf(entry), entry])); state.records.pending = history.filter((record) => !current.has(AppRuntimePolicy.keyOf(record))); state.records.processed = history.filter((record) => current.has(AppRuntimePolicy.keyOf(record))).map((record) => ({ ...record, status: 'processed', classification: current.get(AppRuntimePolicy.keyOf(record)).classification })); state.catalog.items = observedApps().map((item) => ({ ...item, classification: current.get(AppRuntimePolicy.keyOf(item))?.classification || 'unclassified' })); renderAll(); return; } const body = { classifications: next.classifications, quotas: next.quotas, timeWindows: next.timeWindows }; const saved = await runtime(`/v2/module/app-policy?childId=${encodeURIComponent(state.childId)}`, { method: 'PUT', headers: { 'If-Match': state.policyEtag }, body: JSON.stringify(body) }); state.policy = AppRuntimePolicy.normalize(saved); state.policyEtag = `"app-policy-v${state.policy.version}"`; await load(); }
  function quotaValue(input) { return input.value === '' ? null : Math.max(0, Number.parseInt(input.value, 10)); }
  async function saveQuotas() { const perApplicationDailyMinutes = $$('[data-app-quota-index]').filter((input) => input.value !== '').map((input) => { const app = state.quotaApps[Number(input.dataset.appQuotaIndex)]; return { platform: app.platform, runtimeIdentity: app.runtimeIdentity, minutes: quotaValue(input) }; }); await savePolicy(AppRuntimePolicy.withQuotas(state.policy, { ...state.policy.quotas, perApplicationDailyMinutes })); }
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
  let pairingGeneration = 0;
  function resetPairing() {
    pairingGeneration++; clearInterval(state.timer);
    $('#pair-result').hidden = true; $('#pair-code').textContent = '----';
    $('#pair-copy-status').hidden = true;
    $('#download-installer').hidden = true; $('#download-installer').removeAttribute('href');
    $('#pair-install-hint').textContent = AppRuntimeDevices.installHint($('#pair-platform').value);
    $('#pair-server-url').value = RUNTIME_API;
  }
  function openPair() { $('#pair-default-child').innerHTML = state.children.map((item, index) => `<option value="${index}"${item.id === state.childId ? ' selected' : ''}>${escape(item.name)}</option>`).join(''); resetPairing(); $('#pair-dialog').showModal(); }
  async function createPairing() {
    const platform = $('#pair-platform').value;
    const displayName = AppRuntimeDevices.pairingName(platform);
    const selected = childFromIndex($('#pair-default-child').value);
    if (!selected) throw new Error('请先选择孩子');
    resetPairing();
    const generation = pairingGeneration;
    $('#create-pairing').disabled = true;
    try {
      const result = mock ? { code: 'ABCD-EFGH-JKLM', expiresAtMs: Date.now() + 600000 }
        : await runtime('/v2/module/pairing-codes', { method: 'POST', body: JSON.stringify({ defaultChildId: selected.id, displayName }) });
      if (generation !== pairingGeneration || !$('#pair-dialog').open) return;
      showCode('pair', result.code, result.expiresAtMs); $('#pair-result').hidden = false;
      const releasePath = AppRuntimeDevices.releasePath(platform);
      if (!mock && releasePath) {
        try {
          const release = await runtime(releasePath);
          if (generation !== pairingGeneration || !$('#pair-dialog').open) return;
          if (!/^\d+\.\d+\.\d+$/.test(release.version)) throw new Error('安装包版本无效');
          $('#download-installer').href = `${RUNTIME_API}/v1/releases/windows/x64/${encodeURIComponent(release.version)}/installer`;
          $('#download-installer').hidden = false;
        } catch {
          if (generation === pairingGeneration && $('#pair-dialog').open) $('#pair-install-hint').textContent += ' 安装包查询暂不可用；配对码仍有效，已安装的管理应用可以继续配对。';
        }
      }
    } finally { $('#create-pairing').disabled = false; }
  }
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
  function switchView(view) { state.view = view; $$('.nav-item').forEach((button) => button.classList.toggle('active', button.dataset.view === view)); $$('.view').forEach((panel) => panel.classList.toggle('active', panel.dataset.viewPanel === view)); [$('#page-title').textContent, $('#page-subtitle').textContent] = viewText[view]; renderAll(); clearError(); if (!mock && ['access', 'apps', 'system'].includes(view) && !state.managementLoaded) void load(); $('#sidebar').classList.remove('open'); $('#mobile-backdrop').hidden = true; }
  function switchTab(type, name) { $$(`[data-${type}-tab]`).forEach((button) => button.classList.toggle('active', button.dataset[`${type}Tab`] === name)); $$(`[data-${type}-panel]`).forEach((panel) => { panel.hidden = panel.dataset[`${type}Panel`] !== name; }); }
  async function loadLedger(kind) { const period = range(); const result = mock ? { items: kind === 'usage' ? [{ startAtMs: Date.now() - 60000, displayName: 'Visual Studio Code', durationMs: 60000, applicationClassification: 'study', estimated: false }] : [{ startAtMs: Date.now() - 120000, displayName: 'Microsoft Edge', durationMs: 120000, mediaKind: 'video', presentation: 'background', estimated: false }] } : await runtime(`/v2/module/segment-diagnostics?kind=${kind}&childId=${encodeURIComponent(state.childId)}&fromMs=${period.from}&toMs=${period.to}&limit=50`); const target = kind === 'usage' ? $('#ledger-list') : $('#media-list'); target.className = 'table-list'; target.innerHTML = result.items.length ? result.items.map((item) => `<div class="table-row"><time>${time(item.startAtMs)}</time><strong>${escape(item.displayName || '未知应用')}</strong><span>${duration(item.durationMs)}</span><span>${kind === 'usage' ? categoryLabels[item.applicationClassification] || '未归类' : `${item.mediaKind}/${item.presentation}`}</span></div>`).join('') : '<p>暂无明细</p>'; if(result.hasMore)target.insertAdjacentHTML('beforeend','<p>仅显示最近50条诊断记录；该明细不代表范围总用量。</p>'); }
  function exportConfig() { const blob = new Blob([JSON.stringify(AppRuntimePolicy.exportPayload(state.policy), null, 2)], { type: 'application/json' }); const link = ownerDocument.createElement('a'); link.href = URL.createObjectURL(blob); link.download = 'timeonchrome-app-runtime-config.json'; link.click(); URL.revokeObjectURL(link.href); }
  async function reviewImport(file) {
    assertLive();
    const context = applicationImportContext(), generation = ++applicationImportGeneration;
    applicationImportDraft = null;
    $('#import-diff').hidden = true;
    const text = await file.text();
    assertApplicationImportContext(context);
    if (generation !== applicationImportGeneration) return;
    const incoming = JSON.parse(text);
    const diff = AppRuntimePolicy.importDiff(state.policy, incoming);
    applicationImportDraft = { context, policy: diff.policy, applying: false };
    const box = $('#import-diff'); box.hidden = false;
    const legacySharedFields = incoming.schemaVersion < 3 && (incoming.timeWindows !== undefined || incoming.quotas?.dailyCategoryMinutes !== undefined || incoming.quotas?.weeklyRestrictedEntertainmentMinutes !== undefined);
    box.innerHTML = `<div class="import-review"><h3>导入差异</h3><label><input type="checkbox" id="import-classifications" checked> 应用分类：新增 ${diff.added}、修改 ${diff.changed}、移除 ${diff.removed}</label><br><label><input type="checkbox" id="import-quotas" checked> 单应用限制：${diff.quotasChanged ? '有变化' : '无变化'}</label><p>${legacySharedFields ? '此旧版文件含孩子级公共配额或时间段；为保持单一配置来源，这些字段将忽略。' : '孩子级公共配额和时间段由主控制台统一管理，不从此文件写入。'}</p><p><button id="confirm-import" class="primary">确认导入所选内容</button></p></div>`;
  }
  async function confirmApplicationImport() {
    const draft = applicationImportDraft;
    if (!draft) throw new Error('请先选择应用配置文件并预览');
    assertApplicationImportContext(draft.context);
    if (draft.applying) throw new Error('正在应用导入，请勿重复提交');
    const next = AppRuntimePolicy.normalize({ ...state.policy, classifications: $('#import-classifications').checked ? draft.policy.classifications : state.policy.classifications, quotas: $('#import-quotas').checked ? { ...state.policy.quotas, perApplicationDailyMinutes: draft.policy.quotas.perApplicationDailyMinutes } : state.policy.quotas, timeWindows: state.policy.timeWindows });
    draft.applying = true;
    try {
      await savePolicy(next);
      assertLive();
      if (applicationImportDraft === draft) { applicationImportDraft = null; $('#import-diff').hidden = true; }
    } finally { draft.applying = false; }
  }

  listen(root,'click', async (event) => { if(!live())return;const groupToggle = event.target.closest('summary[data-app-group-toggle]'); if (groupToggle) { event.preventDefault(); if (!($('#app-search').value || '').trim()) { const key = groupToggle.dataset.appGroupToggle; state.appGroups[key] = !state.appGroups[key]; renderAppDirectory(); } return; } const button = event.target.closest('button'); if (!button) return; try {
    if (button.dataset.view) { switchView(button.dataset.view); if (button.dataset.view === 'system') { await loadLoggingPolicy(); await loadRuntimeLogs(); } }
    if (button.dataset.accessTab) switchTab('access', button.dataset.accessTab);
    if (button.dataset.systemTab) { switchTab('system', button.dataset.systemTab); if (button.dataset.systemTab === 'logs') { await loadLoggingPolicy(); await loadRuntimeLogs(); } }
    if (button.id === 'mobile-menu') { $('#sidebar').classList.add('open'); $('#mobile-backdrop').hidden = false; }
    if (button.id === 'refresh' || button.id === 'retry' || button.id === 'initial-load-retry') {applicationReadCache.clear();await load();}
    if (button.id === 'retry-usage'||button.id==='refresh-application') await loadUsage({refresh:true});
    if(button.dataset.usageKind){state.usageKind=button.dataset.usageKind;$$('[data-usage-kind]').forEach(item=>item.classList.toggle('active',item===button));renderUsage();await loadUsage();}
    if (button.dataset.period) { state.period = button.dataset.period; state.offset = 0; $$('[data-period]').forEach((item) => item.classList.toggle('active', item === button)); await loadUsage(); renderUsage(); }
    if (button.id === 'previous') { state.offset -= 1; await loadUsage(); renderUsage(); }
    if (button.id === 'today') { state.offset = 0; await loadUsage(); renderUsage(); }
    if (button.id === 'save-quotas') await saveQuotas();
    if (button.id === 'add-machine') openPair();
    if (button.id === 'create-pairing') await createPairing();
    if (button.id === 'copy-code') await copyCode('pair'); if (button.id === 'copy-uninstall') await copyCode('uninstall');
    if (button.dataset.openMachine) openDrawer(button.dataset.openMachine);
    if (button.dataset.usageApp) openUsageDetail('app', button.dataset.usageApp);
    if (button.dataset.usageCategory) openUsageDetail('category', button.dataset.usageCategory);
    if (button.dataset.appCategory) { state.appCategory = button.dataset.appCategory; renderAppDirectory(); }
    if (button.dataset.classifyIndex != null && button.dataset.classification) { const app = state.actionApps[Number(button.dataset.classifyIndex)]; if (app) { if(app.manageability!=='actionable')throw new Error('技术进程记录不能直接归类，请先确认产品身份');if(app.productId) await knowledgeManager.classify(app.productId,button.dataset.classification); else {const implementations=app.runtimeImplementations?.length?app.runtimeImplementations:[app];let next=state.policy;for(const implementation of implementations){if(!implementation.runtimeIdentity)throw new Error('此应用缺少可靠身份，请先在确定性应用列表确认');next=AppRuntimePolicy.classify(next,{...app,...implementation},button.dataset.classification);}await savePolicy(next);} showSuccess(`${app.displayName || '应用'} 分类已保存，等待设备实际应用`); } }
    if (button.dataset.manageVariants !== undefined) await knowledgeManager.open('product');
    if (button.dataset.editIdentityProduct !== undefined) await knowledgeManager.open('identity');
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
    if (button.id === 'confirm-import') await confirmApplicationImport();
  } catch (error) { showError(error); } });
  listen(root,'change', async (event) => { if(!live())return;const control = event.target; try {
    if (['pair-platform','pair-default-child'].includes(control.id)) { resetPairing(); return; }
    if (['directory-scope','management-platform'].includes(control.id)) { renderAppDirectory(); return; }
    if (control.id === 'child-select') { if(embedded)return;const selected = childFromIndex(control.value); if (selected) { usageRequestVersion++;computerReader.invalidate();independentReader.invalidate();state.usage={};renderUsage();state.childId = selected.id; mountKnowledgeManager(); state.managementLoaded = false; state.session.selectedChildId = selected.id; AppRuntimeSession.save(sessionStorage, state.session); await load(); } }
    else if (control.id === 'machine-filter') { renderFilters(); if (!mock) await loadUsage(); renderUsage(); }
    else if (['user-filter','platform-filter'].includes(control.id)) { if (!mock) await loadUsage(); renderUsage(); }
    else if (control.id === 'media-toggle') renderUsage();
    else if (control.id === 'logging-machine') { state.loggingPolicy = null; state.loggingPolicyEtag = null; await loadLoggingPolicy(); }
    else if (control.dataset.default) { const selected = childFromIndex(control.value); if (!mock && selected) { await runtime(`/v2/module/machines/${encodeURIComponent(control.dataset.default)}/default-assignment`, { method: 'PATCH', body: JSON.stringify({ childId: selected.id }) }); await load(); } }
    else if (control.dataset.user) { const selected = control.value === 'u' ? null : childFromIndex(control.value); if (!mock) { await runtime(`/v2/module/machines/${encodeURIComponent(control.dataset.machine)}/users/${encodeURIComponent(control.dataset.user)}`, { method: 'PATCH', body: JSON.stringify({ protected: Boolean(selected), childId: selected?.id || null }) }); await load(); } }
    else if (control.id === 'import-config' && control.files[0]) await reviewImport(control.files[0]);
  } catch (error) { showError(error); } });
  listen(root,'input', (event) => { if(!live())return;if (event.target.id === 'app-search') { clearTimeout(state.searchTimer); state.searchTimer = setTimeout(()=>{if(live())renderAppDirectory();}, 120); } });
  listen($('#mobile-backdrop'),'click', () => { $('#sidebar').classList.remove('open'); closeDrawer(); });
  if(!embedded)listen($('#runtime-logout'),'click', async () => {
    applicationReadCache.clear();
    const active = AppRuntimeSession.load(sessionStorage);
    if (active) await fetch(`${RUNTIME_API}/v2/auth/browser-sessions/current`, { method: 'DELETE', headers: { Authorization: `RuntimeSession ${active.token}` } }).catch(() => {});
    AppRuntimeSession.clear(sessionStorage);
    location.assign('https://timeonchrome-console.pages.dev/');
  });
  let knowledgeManager;
  function mountKnowledgeManager(){
    knowledgeManager?.dispose();
    knowledgeManager = AppRuntimeKnowledge.mount({root,request:runtime,mock,onError:showError,getContext:()=>({children:state.children,childId:state.childId,identityModel:Boolean(state.identityCatalog),mockInventory:state.mockInventory,mockKnowledge:state.mockKnowledge}),onCatalogSaved:(catalog,childId)=>{
      if(disposed||childId!==state.childId)return;
      state.identityCatalog=catalog;state.managementError=null;renderAppDirectory();
    },onSaved:async knowledge=>{
    if(!mock){await load();return;}
    state.mockKnowledge=knowledge;
    const binding=knowledge.bindings.find(item=>item.childId===state.childId);
    for(const item of state.catalog.items){const evidence=state.mockInventory.find(observation=>observation.evidence.runtimeIdentity===item.runtimeIdentity)?.evidence;if(!evidence)continue;const products=knowledge.products.filter(product=>product.selectors.some(selector=>selector.platform===evidence.platform&&selector.match.conditions.every(condition=>evidence.values[condition.field]===condition.value)));if(products.length===1){const explicit=binding?.products.find(entry=>entry.productId===products[0].id);if(explicit){item.productId=products[0].id;item.displayName=products[0].name;item.classification=explicit.classification;item.classificationReason='孩子产品明确分类';item.installationState='installed';}}}
    state.machines.forEach(machine=>{machine.desiredPolicyVersion+=1;machine.policyState=machine.status==='online'?'pending':'offline';});renderAll();
    }});
  }
  mountKnowledgeManager();
  $$('.nav-item').forEach((button) => button.classList.toggle('active', button.dataset.view === state.view));
  $$('.view').forEach((panel) => panel.classList.toggle('active', panel.dataset.viewPanel === (state.view==='configuration'?'access':state.view)));
  if(state.view==='configuration') { $('[data-view-panel="access"] .tabbar').hidden=true; switchTab('access','config'); }
  [$('#page-title').textContent, $('#page-subtitle').textContent] = viewText[state.view];
  const ready=load();
  function dispose(){if(disposed)return;disposed=true;usageRequestVersion++;pairingGeneration++;clearInterval(state.timer);clearTimeout(state.searchTimer);applicationReadCache.clear();computerReader.invalidate();independentReader.invalidate();knowledgeManager.dispose();for(const [target,type,handler]of listeners)target.removeEventListener(type,handler);for(const dialog of $$('dialog[open]'))dialog.close();}
  return {ready,refresh:()=>{assertLive();return load();},dispose};
  }
  globalThis.AppRuntimeManagement={mount};
  if(!componentOnly)mount();
})();
