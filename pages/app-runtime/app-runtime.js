(() => {
  const GUARDIAN_API = 'https://guardian-api.william-xia-cn.workers.dev';
  const RUNTIME_API = 'https://timeonchrome-app-runtime-api.william-xia-cn.workers.dev';
  const mock = new URLSearchParams(location.search).has('mock');
  const categoryLabels = { study: '学习', composite: '复合', restrictedEntertainment: '受限娱乐', unclassified: '未归类', blocked: '黑名单' };
  const categoryColors = { study: '#178f6a', composite: '#4d9fd8', restrictedEntertainment: '#ed9f38', unclassified: '#9aa6a0', blocked: '#d64545' };
  const viewText = {
    usage: ['使用统计', '查看电脑应用主使用账本'], access: ['应用访问管理', '管理独立配额、七天时间段和配置文件'],
    apps: ['应用管理', '管理真实使用过的应用目录与分类'], devices: ['设备管理', '管理电脑、账户分配与运行状态'],
    system: ['系统管理', '查看主账本、辅助媒体和运行健康'],
  };
  const state = { period: 'day', offset: 0, token: null, childId: null, children: [], machines: [], users: new Map(), policy: AppRuntimePolicy.defaultPolicy(), policyEtag: '"app-policy-v0"', records: { pending: [], processed: [] }, usage: {}, timer: null, view: 'usage', appCategory: 'study', actionApps: [], quotaApps: [] };
  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => [...document.querySelectorAll(selector)];
  const escape = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const read = (key) => { try { return JSON.parse(localStorage.getItem(`toc_${key}`)); } catch { return null; } };
  const write = (key, value) => localStorage.setItem(`toc_${key}`, JSON.stringify(value));
  const duration = (ms = 0) => ms < 60000 ? (ms ? '少于 1 分钟' : '0 分钟') : `${Math.floor(ms / 3600000) ? `${Math.floor(ms / 3600000)} 小时 ` : ''}${Math.round(ms % 3600000 / 60000)} 分钟`;
  const time = (ms) => ms ? new Date(ms).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' }) : '尚未同步';
  const child = (id) => state.children.find((item) => item.id === id);
  const childIndex = (id) => String(state.children.findIndex((item) => item.id === id));
  const childFromIndex = (value) => state.children[Number(value)] || null;
  const range = () => AppRuntimeTime.beijingRange(state.period, state.offset);
  const policyLabel = (value) => ({ pending: '待下发', cached: '已缓存', applied: '当前会话已生效', failed: '失败', offline: '离线' })[value] || '待下发';
  const statusLabel = (value) => ({ online: '在线', recentlyOnline: '最近在线', offline: '离线', revoked: '已吊销' })[value] || value;

  function showError(error) { $('#status-strip').className = 'error'; $('#status-message').textContent = AppRuntimeNetwork.friendlyError(error).message; $('#retry').hidden = false; $('#status-strip').hidden = false; }
  function clearError() { $('#status-strip').hidden = true; }
  function setLoading(active) { document.querySelector('main').setAttribute('aria-busy', String(active)); $('#refresh').disabled = active; if (active) { $('#status-strip').className = 'loading'; $('#status-message').textContent = '正在加载 Runtime 数据…'; $('#retry').hidden = true; $('#status-strip').hidden = false; } else if ($('#status-strip').className === 'loading') clearError(); }
  async function refreshSession() { const session = read('session'); if (!session?.refreshToken) return false; const response = await fetch(`${GUARDIAN_API}/auth/refresh`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ refreshToken: session.refreshToken }) }); if (!response.ok) return false; const payload = await response.json(); write('session', { ...session, token: payload.token, refreshToken: payload.refreshToken || session.refreshToken }); return true; }
  async function guardian(path) { let session = read('session'); if (!session?.token) throw new Error('请先登录家长控制台'); let response = await fetch(`${GUARDIAN_API}${path}`, { method: 'POST', headers: { Authorization: `Bearer ${session.token}` } }); if (response.status === 401 && await refreshSession()) { session = read('session'); response = await fetch(`${GUARDIAN_API}${path}`, { method: 'POST', headers: { Authorization: `Bearer ${session.token}` } }); } const payload = await response.json().catch(() => ({})); if (!response.ok) throw new Error(payload.error?.message || payload.error || '登录状态已过期'); return payload; }
  function claims(token) { const part = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'); return JSON.parse(atob(part + '='.repeat((4 - part.length % 4) % 4))); }
  async function issue() { const payload = await guardian('/app-runtime/account-token'); state.token = payload.token; const tokenClaims = claims(payload.token); state.children = Array.isArray(tokenClaims.children) ? tokenClaims.children : []; const selected = child(state.childId || read('currentProfileId')) || state.children[0]; if (!selected) throw new Error('当前账户还没有孩子档案'); state.childId = selected.id; renderChildPicker(); }
  async function moduleToken(renew = false) { if (renew) state.token = null; if (!state.token) await issue(); return state.token; }
  async function runtime(path, options = {}) { return AppRuntimeNetwork.requestJson({ url: `${RUNTIME_API}${path}`, options, getToken: moduleToken }); }

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
    state.records = { windowStartMs: Date.now() - 30 * 86400000, windowEndMs: Date.now(), pending: [{ platform: 'windows', runtimeIdentity: 'app:calc', displayName: '计算器', firstSeenAtMs: dayStart, lastSeenAtMs: Date.now() - 600000, mainDurationMs: 420000, machineCount: 1, userCount: 1, classification: 'unclassified', status: 'pending' }], processed: state.policy.classifications.map((item) => ({ ...item, firstSeenAtMs: dayStart - 86400000, lastSeenAtMs: Date.now(), mainDurationMs: 1800000, machineCount: 1, userCount: 1, status: 'processed' })) };
    state.usage = { totalDurationMs: 9720000, appPolicyVersion: 4, estimatedSegmentCount: 2, buckets: Array.from({ length: 24 }, (_, index) => ({ startAtMs: dayStart + index * 3600000, durationMs: [0,0,0,0,0,0,0,0,900000,1800000,1200000,600000,300000,1500000,2100000,720000,0,600000,0,0,0,0,0,0][index] })), categories: [{ classification: 'study', durationMs: 4320000, quota: { limitMs: null, exceeded: false } }, { classification: 'composite', durationMs: 2880000, quota: { limitMs: 7200000, remainingMs: 4320000, exceeded: false } }, { classification: 'restrictedEntertainment', durationMs: 2100000, quota: { limitMs: 3600000, remainingMs: 1500000, exceeded: false } }, { classification: 'unclassified', durationMs: 420000, quota: { limitMs: 1800000, remainingMs: 1380000, exceeded: false } }], applications: [{ platform: 'windows', runtimeIdentity: 'app:vscode', displayName: 'Visual Studio Code', classification: 'study', durationMs: 4320000, quota: { limitMs: null, exceeded: false } }, { platform: 'windows', runtimeIdentity: 'app:edge', displayName: 'Microsoft Edge', classification: 'composite', durationMs: 2880000, quota: { limitMs: null, exceeded: false } }, { platform: 'windows', runtimeIdentity: 'app:game', displayName: 'Minecraft', classification: 'restrictedEntertainment', durationMs: 2100000, quota: { limitMs: 2700000, remainingMs: 600000, exceeded: false } }], outsideTimeWindows: { durationMs: 780000, segmentCount: 2 }, mediaPlaybackTotalMs: 3600000 };
  }

  function renderChildPicker() { const select = $('#child-select'); select.innerHTML = state.children.map((item, index) => `<option value="${index}"${item.id === state.childId ? ' selected' : ''}>${escape(item.name)}</option>`).join(''); }
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
    for (const item of [...state.policy.classifications, ...(state.records.pending || []), ...(state.records.processed || []), ...(state.usage.applications || [])]) {
      const key = AppRuntimePolicy.keyOf(item);
      const current = applications.get(key) || {};
      const classification = state.policy.classifications.find((entry) => AppRuntimePolicy.keyOf(entry) === key)?.classification;
      applications.set(key, { ...current, ...item, classification: classification || item.classification || 'unclassified' });
    }
    return [...applications.values()];
  }
  function categoryCounts(category) {
    const members = category === 'unclassified'
      ? state.records.pending || []
      : state.policy.classifications.filter((item) => item.classification === category);
    return { total: members.length, windows: members.filter((item) => item.platform === 'windows').length, macos: members.filter((item) => item.platform === 'macos').length };
  }
  function classificationSelect(app, selected = 'unclassified') {
    const index = state.actionApps.push(app) - 1;
    return `<select data-classify-index="${index}" aria-label="修改 ${escape(app.displayName || '未知应用')} 分类">${['study','composite','restrictedEntertainment','blocked','unclassified'].map((category) => `<option value="${category}"${category === selected ? ' selected' : ''}>${category === 'unclassified' ? '暂不归类' : `归为${categoryLabels[category]}应用`}</option>`).join('')}</select>`;
  }
  function appRow(app, selected) {
    const recent = app.lastSeenAtMs ? time(app.lastSeenAtMs) : '最近 30 天无未归类记录';
    const mainDuration = app.mainDurationMs ?? app.durationMs ?? 0;
    return `<article class="record-card"><div class="app-record-main"><span class="app-icon">${escape((app.displayName || '?').slice(0, 1))}</span><div><strong>${escape(app.displayName || '未知应用')}</strong><p><span class="platform-chip ${escape(app.platform)}">${app.platform === 'macos' ? 'macOS' : 'Windows'}</span> · 最近使用 ${recent} · 主账本 ${duration(mainDuration)}</p></div></div><div class="record-actions">${classificationSelect(app, selected)}</div></article>`;
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
      const meta = category === 'unclassified' ? `待处理 ${count.total}<b>最近 30 天</b>` : `应用 ${count.total}<b>Windows ${count.windows} · macOS ${count.macos}</b>`;
      return `<button class="app-category-item ${state.appCategory === category ? 'active' : ''}" data-app-category="${category}"><span>${icon}</span><strong>${label}</strong><small>${meta}</small></button>`;
    }).join('');
    const search = ($('#app-search').value || '').trim().toLowerCase();
    const platform = $('#management-platform').value;
    const filter = (item) => (!platform || item.platform === platform) && (!search || String(item.displayName || '').toLowerCase().includes(search));
    const current = state.appCategory;
    const source = current === 'unclassified'
      ? (state.records.pending || [])
      : observedApps().filter((item) => item.classification === current);
    const list = source.filter(filter).sort((left, right) => Number(right.lastSeenAtMs || 0) - Number(left.lastSeenAtMs || 0));
    $('#app-directory-title').textContent = current === 'unclassified' ? '已使用未归类应用' : `${categoryLabels[current]}应用`;
    $('#app-directory-subtitle').textContent = current === 'unclassified'
      ? `服务端最近 30 天 · 待处理 ${state.records.pending?.length || 0} 个；归类只从设备实际生效时向前生效`
      : `应用 ${categoryCounts(current).total} · Windows ${categoryCounts(current).windows} · macOS ${categoryCounts(current).macos}`;
    $('#managed-app-list').innerHTML = list.length ? list.map((item) => appRow(item, current)).join('') : '<p class="empty">当前目录没有符合条件的应用</p>';
    const history = (state.records.processed || []).filter(filter);
    $('#processed-history').hidden = current !== 'unclassified';
    $('#processed-records').innerHTML = history.length ? history.map((item) => appRow(item, item.classification)).join('') : '<p class="empty">暂无已处理历史</p>';
    $('#processed-count').textContent = history.length;
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
  function openDrawer(machineId) { const machine = state.machines.find((item) => item.id === machineId); if (!machine) return; const users = state.users.get(machine.id) || []; $('#drawer-content').innerHTML = `<h2>${escape(machine.displayName || '电脑')}</h2><p>${escape(machine.windowsVersion || machine.platform)} · ${escape(machine.architecture || '—')}</p><div class="drawer-section"><h3>运行状态</h3><p>Service ${escape(machine.serviceVersion || '未报告')}</p><p>最近在线：${time(machine.lastSeenAtMs)}<br>最近同步：${time(machine.lastUploadAtMs)}<br>策略：${machine.appliedPolicyVersion || 0}/${machine.desiredPolicyVersion || 0} · ${policyLabel(machine.policyState)}<br>Tamper：${machine.tamperCount || 0} 次</p></div><div class="drawer-section"><h3>账户分配</h3><label>新用户默认关联<select data-default="${escape(machine.id)}">${state.children.map((item,index) => `<option value="${index}"${item.id === machine.defaultChildId ? ' selected' : ''}>${escape(item.name)}</option>`).join('')}</select></label>${users.map((user) => `<label>${escape(user.displayName)}<select data-machine="${escape(machine.id)}" data-user="${escape(user.localUserId)}">${assignmentOptions(user.childId, user.protected)}</select><small>${policyLabel(user.policyState)}</small></label>`).join('') || '<p>等待 Service 上报本机账户。</p>'}</div><div class="drawer-section drawer-actions"><button data-uninstall="${escape(machine.id)}">生成卸载码</button>${machine.status !== 'revoked' ? `<button class="danger" data-revoke="${escape(machine.id)}">吊销机器</button>` : ''}</div>`; $('#device-drawer').classList.add('open'); $('#device-drawer').setAttribute('aria-hidden', 'false'); $('#mobile-backdrop').hidden = false; }
  function closeDrawer() { $('#device-drawer').classList.remove('open'); $('#device-drawer').setAttribute('aria-hidden', 'true'); $('#mobile-backdrop').hidden = true; }
  function openUsageDetail(kind, value) { const item = kind === 'app' ? state.usage.applications?.[Number(value)] : state.usage.categories?.find((entry) => entry.classification === value); if (!item) return; const title = kind === 'app' ? item.displayName || '未知应用' : categoryLabels[item.classification]; $('#drawer-content').innerHTML = `<h2>${escape(title)}</h2><p>${kind === 'app' ? `${escape(item.platform)} · ${categoryLabels[item.classification] || '未归类'}` : '分类使用详情'}</p><div class="drawer-section"><h3>本周期主使用</h3><p class="detail-duration">${duration(item.durationMs)}</p><p>${item.quota?.limitMs == null ? '配额：无限制' : `配额：${duration(item.quota.limitMs)}<br>剩余：${duration(item.quota.remainingMs)}<br>状态：${item.quota.exceeded ? '已超额' : '未超额'}`}</p></div><div class="notice warning"><span>统计只读取主账本区间并集；辅助媒体不进入此详情或配额。</span></div>`; $('#device-drawer').classList.add('open'); $('#device-drawer').setAttribute('aria-hidden', 'false'); $('#mobile-backdrop').hidden = false; }

  async function load({ freshToken = false } = {}) { setLoading(true); try { if (freshToken) state.token = null; if (mock) { mockData(); renderAll(); return; } await moduleToken(freshToken); const machines = await runtime('/v2/module/machines'); state.machines = machines.machines || []; state.users.clear(); await Promise.all(state.machines.map(async (machine) => { const result = await runtime(`/v2/module/machines/${encodeURIComponent(machine.id)}/users`); state.users.set(machine.id, result.users || []); })); const childId = encodeURIComponent(state.childId); const policy = await runtime(`/v2/module/app-policy?childId=${childId}`); state.policy = AppRuntimePolicy.normalize(policy); state.policyEtag = `"app-policy-v${state.policy.version}"`; state.records = await runtime(`/v2/module/app-classification-records?childId=${childId}`); await loadUsage(); renderAll(); } catch (error) { showError(error); } finally { setLoading(false); } }
  async function loadUsage() { if (mock) return; const period = range(); const query = new URLSearchParams({ childId: state.childId, fromMs: String(period.from), toMs: String(period.to) }); if ($('#machine-filter').value) query.set('machineId', $('#machine-filter').value); if ($('#user-filter').value) query.set('userId', $('#user-filter').value); if ($('#platform-filter').value) query.set('platform', $('#platform-filter').value); state.usage = await runtime(`/v2/module/app-usage?${query}`); }
  function renderAll() { renderChildPicker(); const period = range(); $('#range-label').textContent = period.label; $('#chart-caption').textContent = `北京时间，${state.period === 'day' ? '按小时' : '按每日'}`; renderMachines(); renderUsage(); renderAppDirectory(); renderQuotaForm(); renderSchedule(); }
  async function savePolicy(next) { if (mock) { const history = [...(state.records.pending || []), ...(state.records.processed || [])]; state.policy = AppRuntimePolicy.normalize({ ...next, version: state.policy.version + 1, effectiveAtMs: Date.now() }); state.policyEtag = `"app-policy-v${state.policy.version}"`; const current = new Map(state.policy.classifications.map((entry) => [AppRuntimePolicy.keyOf(entry), entry])); state.records.pending = history.filter((record) => !current.has(AppRuntimePolicy.keyOf(record))); state.records.processed = history.filter((record) => current.has(AppRuntimePolicy.keyOf(record))).map((record) => ({ ...record, status: 'processed', classification: current.get(AppRuntimePolicy.keyOf(record)).classification })); renderAll(); return; } const body = { classifications: next.classifications, quotas: next.quotas, timeWindows: next.timeWindows }; const saved = await runtime(`/v2/module/app-policy?childId=${encodeURIComponent(state.childId)}`, { method: 'PUT', headers: { 'If-Match': state.policyEtag }, body: JSON.stringify(body) }); state.policy = AppRuntimePolicy.normalize(saved); state.policyEtag = `"app-policy-v${state.policy.version}"`; await load(); }
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
  function switchView(view) { state.view = view; $$('.nav-item').forEach((button) => button.classList.toggle('active', button.dataset.view === view)); $$('.view').forEach((panel) => panel.classList.toggle('active', panel.dataset.viewPanel === view)); [$('#page-title').textContent, $('#page-subtitle').textContent] = viewText[view]; $('#sidebar').classList.remove('open'); $('#mobile-backdrop').hidden = true; }
  function switchTab(type, name) { $$(`[data-${type}-tab]`).forEach((button) => button.classList.toggle('active', button.dataset[`${type}Tab`] === name)); $$(`[data-${type}-panel]`).forEach((panel) => { panel.hidden = panel.dataset[`${type}Panel`] !== name; }); }
  async function loadLedger(kind) { const period = range(); const result = mock ? { items: kind === 'usage' ? [{ startAtMs: Date.now() - 60000, displayName: 'Visual Studio Code', durationMs: 60000, applicationClassification: 'study', estimated: false }] : [{ startAtMs: Date.now() - 120000, displayName: 'Microsoft Edge', durationMs: 120000, mediaKind: 'video', presentation: 'background', estimated: false }] } : await runtime(`/v2/module/${kind === 'usage' ? 'usage-segments' : 'media-segments'}?childId=${encodeURIComponent(state.childId)}&fromMs=${period.from}&toMs=${period.to}&limit=50`); const target = kind === 'usage' ? $('#ledger-list') : $('#media-list'); target.className = 'table-list'; target.innerHTML = result.items.length ? result.items.map((item) => `<div class="table-row"><time>${time(item.startAtMs)}</time><strong>${escape(item.displayName || '未知应用')}</strong><span>${duration(item.durationMs)}</span><span>${kind === 'usage' ? categoryLabels[item.applicationClassification] || '未归类' : `${item.mediaKind}/${item.presentation}`}</span></div>`).join('') : '<p>暂无明细</p>'; }
  function exportConfig() { const blob = new Blob([JSON.stringify(AppRuntimePolicy.exportPayload(state.policy), null, 2)], { type: 'application/json' }); const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = 'timeonchrome-app-runtime-config.json'; link.click(); URL.revokeObjectURL(link.href); }
  async function reviewImport(file) { const incoming = JSON.parse(await file.text()); const diff = AppRuntimePolicy.importDiff(state.policy, incoming); const box = $('#import-diff'); box.hidden = false; box.dataset.payload = JSON.stringify(diff.policy); box.innerHTML = `<div class="import-review"><h3>导入差异</h3><label><input type="checkbox" id="import-classifications" checked> 应用分类：新增 ${diff.added}、修改 ${diff.changed}、移除 ${diff.removed}</label><br><label><input type="checkbox" id="import-quotas" checked> 独立配额：${diff.quotasChanged ? '有变化' : '无变化'}</label><br><label><input type="checkbox" id="import-time-windows" checked> 七天时间段：${diff.timeWindowsChanged ? '有变化' : '无变化'}</label><p><button id="confirm-import" class="primary">确认导入所选内容</button></p></div>`; }

  document.addEventListener('click', async (event) => { const button = event.target.closest('button'); if (!button) return; try {
    if (button.dataset.view) switchView(button.dataset.view);
    if (button.dataset.accessTab) switchTab('access', button.dataset.accessTab);
    if (button.dataset.systemTab) switchTab('system', button.dataset.systemTab);
    if (button.id === 'mobile-menu') { $('#sidebar').classList.add('open'); $('#mobile-backdrop').hidden = false; }
    if (button.id === 'refresh' || button.id === 'retry') await load({ freshToken: true });
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
    if (button.classList.contains('drawer-close')) closeDrawer();
    if (button.dataset.uninstall) { const result = mock ? { code: 'UNIN-STALL-CODE', expiresAtMs: Date.now() + 600000 } : await runtime(`/v2/module/machines/${encodeURIComponent(button.dataset.uninstall)}/uninstall-codes`, { method: 'POST', body: '{}' }); showCode('uninstall', result.code, result.expiresAtMs); $('#uninstall-dialog').showModal(); }
    if (button.dataset.revoke && !mock && confirm('吊销后这台电脑将停止采集和上传，确定继续？')) { await runtime(`/v2/module/machines/${encodeURIComponent(button.dataset.revoke)}/revoke`, { method: 'POST', body: '{}' }); closeDrawer(); await load(); }
    if (button.dataset.loadLedger) await loadLedger(button.dataset.loadLedger);
    if (button.id === 'save-schedule') await saveSchedule();
    if (button.dataset.scheduleAll) updateSchedule('all', button.dataset.scheduleAll);
    if (button.dataset.scheduleAdd) updateSchedule('add', button.dataset.scheduleAdd);
    if (button.dataset.scheduleRemove) updateSchedule('remove', button.dataset.scheduleRemove);
    if (button.id === 'export-config') exportConfig();
    if (button.id === 'confirm-import') { const incoming = JSON.parse($('#import-diff').dataset.payload); const next = AppRuntimePolicy.normalize({ ...state.policy, classifications: $('#import-classifications').checked ? incoming.classifications : state.policy.classifications, quotas: $('#import-quotas').checked ? incoming.quotas : state.policy.quotas, timeWindows: $('#import-time-windows').checked ? incoming.timeWindows : state.policy.timeWindows }); await savePolicy(next); $('#import-diff').hidden = true; }
  } catch (error) { showError(error); } });
  document.addEventListener('change', async (event) => { const control = event.target; try {
    if (control.id === 'child-select') { const selected = childFromIndex(control.value); if (selected) { state.childId = selected.id; write('currentProfileId', selected.id); await load(); } }
    else if (control.id === 'machine-filter') { renderFilters(); if (!mock) await loadUsage(); renderUsage(); }
    else if (['user-filter','platform-filter'].includes(control.id)) { if (!mock) await loadUsage(); renderUsage(); }
    else if (control.id === 'media-toggle') renderUsage();
    else if (control.dataset.classifyIndex) { const app = state.actionApps[Number(control.dataset.classifyIndex)]; if (app) await savePolicy(AppRuntimePolicy.classify(state.policy, app, control.value)); }
    else if (control.dataset.default) { const selected = childFromIndex(control.value); if (!mock && selected) { await runtime(`/v2/module/machines/${encodeURIComponent(control.dataset.default)}/default-assignment`, { method: 'PATCH', body: JSON.stringify({ childId: selected.id }) }); await load(); } }
    else if (control.dataset.user) { const selected = control.value === 'u' ? null : childFromIndex(control.value); if (!mock) { await runtime(`/v2/module/machines/${encodeURIComponent(control.dataset.machine)}/users/${encodeURIComponent(control.dataset.user)}`, { method: 'PATCH', body: JSON.stringify({ protected: Boolean(selected), childId: selected?.id || null }) }); await load(); } }
    else if (control.id === 'import-config' && control.files[0]) await reviewImport(control.files[0]);
  } catch (error) { showError(error); } });
  document.addEventListener('input', (event) => { if (['app-search','management-platform'].includes(event.target.id)) renderAppDirectory(); });
  $('#mobile-backdrop').addEventListener('click', () => { $('#sidebar').classList.remove('open'); closeDrawer(); });
  load();
})();
