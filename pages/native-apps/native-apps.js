(() => {
  const GUARDIAN_API = 'https://guardian-api.william-xia-cn.workers.dev';
  const NATIVE_API = 'https://timeonchrome-native-app-api.william-xia-cn.workers.dev';
  const TITLES = {
    REVIEW: ['待审核应用', 'Santa 发现的新应用默认允许运行，家长可在此忽略或阻止。'],
    BLOCK: ['已阻止应用', '选择多款应用可统一设置每日阻止时间段；原生规则在终端本地按时区判定。'],
    IGNORE: ['已忽略应用', '已审核且不生成 Santa allow rule。'],
    PREDEFINED: ['预配置应用', '当前孩子尚未安装或被 Santa 发现的来源应用；安装清单和来源项不代表曾启动。'],
    MACS: ['Native Macs', '独立管理 Santa enrollment、同步状态和策略版本。'],
  };
  const state = {
    view: 'REVIEW', token: null, childId: null, childName: null,
    data: [], merges: [], enrollmentProfile: null, applicationQuery: '', reviewCount: 0,
    inventoryMacId: null, predefined: null, preconfigurations: null,
    blockSchedules: null, editingBlockSource: null, editingBlockSources: null,
    selectedBlockAppIds: new Set(),
  };
  const CATEGORY_ORDER = ['社交', '娱乐', '游戏', '人工智能', '教育', '其它'];
  const $ = (selector) => document.querySelector(selector);
  const escapeHtml = (value) => String(value ?? '').replace(/[&<>'"]/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
  })[char]);
  const readLocal = (key) => {
    try { return JSON.parse(localStorage.getItem(`toc_${key}`)); } catch { return null; }
  };
  const writeLocal = (key, value) => localStorage.setItem(`toc_${key}`, JSON.stringify(value));
  const formatTime = (value) => value ? new Date(Number(value)).toLocaleString('zh-CN') : '尚未同步';
  const clockTime = (minute) => `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;
  const scheduleFor = (type, key) => state.blockSchedules?.schedules?.find((item) =>
    item.source_type === type && item.source_key === key);
  const scheduleLabel = (type, key) => {
    const schedule = scheduleFor(type, key);
    return schedule ? `${clockTime(schedule.start_minute)}–${clockTime(schedule.end_minute)}` : '全天';
  };
  const appPolicyFor = (id) => {
    const app = state.data.find((item) => item.id === id || item.relatedApplicationIds?.includes(id));
    const ids = new Set([id, ...(app?.relatedApplicationIds || [])]);
    return (state.blockSchedules?.applicationPolicies || [])
      .filter((item) => ids.has(item.application_id))
      .sort((a, b) => Number(b.updated_at || 0) - Number(a.updated_at || 0))[0];
  };
  const appWindowLabel = (id) => {
    const policy = appPolicyFor(id);
    return !policy || Number(policy.all_day) ? '全天'
      : policy.windows.map((window) => `${clockTime(window.start_minute)}–${clockTime(window.end_minute)}`).join('、');
  };
  const syncPending = () => (state.blockSchedules?.macs || []).some((mac) =>
    Number(mac.applied_policy_version) < Number(mac.desired_policy_version));
  const syncStateLabel = () => !(state.blockSchedules?.macs || []).length ? '暂无已绑定终端'
    : syncPending() ? '终端待同步' : '终端已同步';
  const blockSourcesForApp = (app) => {
    const sources = [];
    if (app.directBlockApplicationId) sources.push(['APPLICATION', app.directBlockApplicationId]);
    if (app.publisher_blocked && app.team_id) sources.push(['PUBLISHER', app.team_id]);
    const appIds = new Set([app.id, ...(app.relatedApplicationIds || [])]);
    if (app.directBlockApplicationId) return sources;
    for (const item of state.preconfigurations?.items || []) {
      if (item.desired_state === 'BLOCK' && !item.disabled_at && appIds.has(item.matchedApplicationId)) {
        sources.push(['PREDEFINED', JSON.stringify([item.source, item.source_index])]);
      }
    }
    return sources;
  };
  const bulkSourcesForApp = (app) => app.policyAvailable === false
    || (!app.directBlockApplicationId && !app.preconfiguredBlock) ? []
    : [['APPLICATION', app.directBlockApplicationId || app.id]];
  const appScheduleSummary = (app) => {
    const sources = blockSourcesForApp(app);
    if (!sources.length) return '暂无可执行阻止来源';
    const appId = app.directBlockApplicationId;
    const appPolicy = appId ? appPolicyFor(appId) : null;
    const appActive = appId && (!appPolicy || Number(appPolicy.all_day)
      || appPolicy.windows.some((window) => window.effective_active === 1));
    const otherActive = sources.some(([type, key]) => type !== 'APPLICATION'
      && (!scheduleFor(type, key) || Number(scheduleFor(type, key).effective_active) === 1));
    const range = appId ? appWindowLabel(appId)
      : [...new Set(sources.filter(([type]) => type !== 'PUBLISHER')
        .map(([type, key]) => scheduleLabel(type, key)))].join('、');
    const publisher = app.publisher_blocked && app.team_id
      ? ` · 发布者 ${scheduleLabel('PUBLISHER', app.team_id)}` : '';
    return `${range || '发布者规则'}${publisher} · ${appActive || otherActive ? '云端目标阻止' : '云端目标放行'} · ${syncStateLabel()}`;
  };
  const escapeXml = (value) => String(value ?? '').replace(/[&<>'"]/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&apos;', '"': '&quot;',
  })[char]);

  function normalizeSyncBaseUrl(value) {
    const normalized = `${String(value || '').trim().replace(/\/+$/, '')}/`;
    if (!/^https:\/\/[^/]+\/santa\/v1\/[^/]+\/[^/]+\/$/.test(normalized)) {
      throw new Error('Native API 返回了无效的 Santa enrollment 地址');
    }
    return normalized;
  }

  function safeProfileFileName(displayName) {
    const label = String(displayName || 'Native-Mac')
      .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '') || 'Native-Mac';
    return `TimeOnChrome-Santa-${label}.mobileconfig`;
  }

  async function applicationsFromInventoryZip(file) {
    if (!file || file.size > 80 * 1024 * 1024) throw new Error('请选择不超过 80 MB 的应用清单 ZIP');
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (bytes.length < 22) throw new Error('无效的 ZIP 文件');
    const view = new DataView(bytes.buffer);
    const u16 = (offset) => view.getUint16(offset, true);
    const u32 = (offset) => view.getUint32(offset, true);
    let end = -1;
    for (let offset = bytes.length - 22; offset >= Math.max(0, bytes.length - 65557); offset--) {
      if (u32(offset) === 0x06054b50) { end = offset; break; }
    }
    if (end < 0) throw new Error('无效的 ZIP 文件');
    const entries = u16(end + 10);
    let offset = u32(end + 16);
    let jsonBytes = null;
    for (let index = 0; index < entries; index++) {
      if (offset + 46 > bytes.length || u32(offset) !== 0x02014b50) throw new Error('ZIP 目录损坏');
      const method = u16(offset + 10);
      const compressedSize = u32(offset + 20);
      const size = u32(offset + 24);
      const nameLength = u16(offset + 28);
      const next = offset + 46 + nameLength + u16(offset + 30) + u16(offset + 32);
      if (next > bytes.length) throw new Error('ZIP 目录损坏');
      const name = new TextDecoder().decode(bytes.subarray(offset + 46, offset + 46 + nameLength));
      if (name === 'applications.json' || name.endsWith('/applications.json')) {
        if (jsonBytes || size > 4 * 1024 * 1024) throw new Error('应用清单重复或过大');
        const local = u32(offset + 42);
        if (local + 30 > bytes.length || u32(local) !== 0x04034b50) throw new Error('ZIP 条目损坏');
        const start = local + 30 + u16(local + 26) + u16(local + 28);
        if (start + compressedSize > bytes.length) throw new Error('ZIP 条目损坏');
        const compressed = bytes.slice(start, start + compressedSize);
        if (method === 0) jsonBytes = compressed;
        else if (method === 8) {
          const stream = new Blob([compressed]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
          const reader = stream.getReader();
          const chunks = [];
          let total = 0;
          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              total += value.length;
              if (total > 4 * 1024 * 1024 || total > size) throw new Error('应用清单大小不符');
              chunks.push(value);
            }
          } catch (error) {
            await reader.cancel();
            throw error;
          } finally {
            reader.releaseLock();
          }
          jsonBytes = new Uint8Array(total);
          let position = 0;
          for (const chunk of chunks) {
            jsonBytes.set(chunk, position);
            position += chunk.length;
          }
        } else throw new Error('不支持此 ZIP 压缩格式');
        if (jsonBytes.length !== size || jsonBytes.length > 4 * 1024 * 1024) throw new Error('应用清单大小不符');
      }
      offset = next;
    }
    if (!jsonBytes) throw new Error('ZIP 中缺少 applications.json');
    const applications = JSON.parse(new TextDecoder().decode(jsonBytes));
    if (!Array.isArray(applications) || !applications.length || applications.length > 500) throw new Error('应用清单格式不正确');
    return applications.map((app) => ({
      displayName: app.displayName, bundleId: app.bundleId, teamId: app.teamId,
      signingId: app.signingId, cdHash: app.cdHash,
      mainExecutableSHA256: app.mainExecutableSHA256,
      signatureStatus: app.signatureStatus, sourceCategory: app.sourceCategory,
    }));
  }

  function buildSantaMobileconfig(syncBaseUrl, displayName) {
    const profileUuid = crypto.randomUUID().toUpperCase();
    const santaUuid = crypto.randomUUID().toUpperCase();
    const label = String(displayName || 'Native Mac').trim() || 'Native Mac';
    const escapedLabel = escapeXml(label);
    const escapedUrl = escapeXml(normalizeSyncBaseUrl(syncBaseUrl));
    const content = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>PayloadContent</key>
  <array>
    <dict>
      <key>PayloadType</key><string>com.northpolesec.santa</string>
      <key>PayloadVersion</key><integer>1</integer>
      <key>PayloadIdentifier</key><string>com.timeonchrome.native-app-control.santa.${santaUuid}</string>
      <key>PayloadUUID</key><string>${santaUuid}</string>
      <key>PayloadDisplayName</key><string>TimeOnChrome Native App Control - ${escapedLabel}</string>
      <key>SyncBaseURL</key><string>${escapedUrl}</string>
      <key>ClientMode</key><integer>1</integer>
      <key>FullSyncInterval</key><integer>60</integer>
      <key>EnableBundles</key><true/>
      <key>SyncEnableCleanSyncEventUpload</key><true/>
    </dict>
  </array>
  <key>PayloadType</key><string>Configuration</string>
  <key>PayloadVersion</key><integer>1</integer>
  <key>PayloadIdentifier</key><string>com.timeonchrome.native-app-control.${profileUuid}</string>
  <key>PayloadUUID</key><string>${profileUuid}</string>
  <key>PayloadDisplayName</key><string>TimeOnChrome Native App Control - ${escapedLabel}</string>
  <key>PayloadDescription</key><string>Independent Santa enrollment for ${escapedLabel}.</string>
  <key>PayloadOrganization</key><string>TimeOnChrome</string>
  <key>PayloadScope</key><string>System</string>
</dict>
</plist>
`;
    return { content, fileName: safeProfileFileName(label) };
  }

  function downloadEnrollmentProfile() {
    const profile = state.enrollmentProfile;
    if (!profile) throw new Error('当前页面没有可下载的 enrollment profile，请轮换 enrollment');
    const blob = new Blob([profile.content], { type: 'application/x-apple-aspen-config' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = profile.fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function showEnrollmentProfile(syncBaseUrl, displayName) {
    state.enrollmentProfile = buildSantaMobileconfig(syncBaseUrl, displayName);
    $('#profile-file-name').textContent = state.enrollmentProfile.fileName;
    $('#secret-dialog').showModal();
    downloadEnrollmentProfile();
  }

  function nativeMacStatus(mac) {
    if (mac.status === 'revoked') return { label: '已吊销', className: 'ignore' };
    if (!mac.last_preflight_at) return { label: '待安装', className: 'pending' };
    return { label: '已绑定', className: '' };
  }

  function serialSummary(value) {
    const serial = String(value || '').trim();
    return serial ? ` · 序列号 …${serial.slice(-4)}` : '';
  }

  async function refreshGuardianSession() {
    const session = readLocal('session');
    if (!session?.refreshToken) return false;
    const response = await fetch(`${GUARDIAN_API}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: session.refreshToken }),
    });
    if (!response.ok) return false;
    const payload = await response.json().catch(() => null);
    if (!payload?.token) return false;
    writeLocal('session', {
      token: payload.token,
      refreshToken: payload.refreshToken || session.refreshToken,
      email: session.email,
    });
    return true;
  }

  async function guardian(path, options = {}) {
    let session = readLocal('session');
    if (!session?.token) throw new Error('请先登录家长控制台');
    const call = () => fetch(`${GUARDIAN_API}${path}`, {
      ...options,
      headers: { Authorization: `Bearer ${session.token}`, 'Content-Type': 'application/json', ...(options.headers || {}) },
    });
    let response = await call();
    if (response.status === 401 && await refreshGuardianSession()) {
      session = readLocal('session');
      response = await call();
    }
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      if (response.status === 401) throw new Error('登录状态已过期，请返回家长控制台重新登录');
      throw new Error(payload.error || `Guardian API ${response.status}`);
    }
    return payload;
  }

  async function issueModuleToken() {
    state.childId = readLocal('currentProfileId');
    if (!state.childId) throw new Error('请先在家长控制台选择孩子');
    const result = await guardian(`/profiles/${encodeURIComponent(state.childId)}/native-app-control/token`, { method: 'POST' });
    state.token = result.token;
    const encoded = result.token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const payload = JSON.parse(atob(encoded + '='.repeat((4 - encoded.length % 4) % 4)));
    state.childName = payload.child_name || '当前孩子';
    $('#child-name').textContent = state.childName;
  }

  async function native(path, options = {}) {
    if (!state.token) await issueModuleToken();
    const call = () => fetch(`${NATIVE_API}${path}`, {
      ...options,
      headers: { Authorization: `Bearer ${state.token}`, 'Content-Type': 'application/json', ...(options.headers || {}) },
    });
    let response = await call();
    if (response.status === 401) { await issueModuleToken(); response = await call(); }
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || `Native API ${response.status}`);
    return payload;
  }

  function showError(error) {
    const strip = $('#status-strip');
    strip.hidden = false;
    strip.classList.remove('success');
    strip.textContent = error instanceof Error ? error.message : String(error);
  }
  function clearError() { $('#status-strip').hidden = true; $('#status-strip').classList.remove('success'); $('#status-strip').textContent = ''; }

  function applicationActions(app) {
    if (app.policyAvailable === false) {
      return `<button class="quiet" data-action="DETAIL" data-id="${escapeHtml(app.id)}">详情</button>`;
    }
    if (app.presentationClass === 'SYSTEM_COMPONENT') {
      return `<button class="quiet" data-action="DETAIL" data-id="${escapeHtml(app.id)}">详情</button>`;
    }
    if (state.view === 'REVIEW') return `
      <button class="secondary" data-action="IGNORE" data-id="${escapeHtml(app.id)}">忽略</button>
      <button class="danger" data-action="BLOCK" data-id="${escapeHtml(app.id)}">阻止</button>
      <button class="quiet" data-action="DETAIL" data-id="${escapeHtml(app.id)}">详情</button>`;
    if (state.view === 'BLOCK') return `${app.directBlockApplicationId || app.preconfiguredBlock ? `<button class="secondary" data-action="SCHEDULE" data-id="${escapeHtml(app.directBlockApplicationId || app.id)}" data-schedule-name="${escapeHtml(app.display_name)}">时间段</button>` : ''}<button class="secondary" data-action="IGNORE" data-id="${escapeHtml(app.id)}">改为忽略</button><button class="quiet" data-action="DETAIL" data-id="${escapeHtml(app.id)}">详情</button>`;
    if (state.view === 'IGNORE') return `<button class="danger" data-action="BLOCK" data-id="${escapeHtml(app.id)}">改为阻止</button><button class="quiet" data-action="DETAIL" data-id="${escapeHtml(app.id)}">详情</button>`;
    return '';
  }

  function applicationSearchText(app) {
    return [
      app.display_name, app.top_level_bundle_id, app.bundle_id, app.publisher,
      app.team_id, app.sample_path,
      ...(app.components || []).flatMap((item) => [
        item.display_name, item.top_level_bundle_id, item.bundle_id,
        item.publisher, item.team_id, item.sample_path,
      ]),
    ].filter(Boolean).join(' ').toLowerCase();
  }

  function applicationTypeLabel(app) {
    return ({
      USER_APPLICATION: '应用',
      UNKNOWN_EXECUTABLE: '未知程序',
      STANDALONE_BACKGROUND: '后台程序',
      SYSTEM_COMPONENT: '系统组件',
      APPLICATION_COMPONENT: '应用组件',
    })[app.presentationClass] || '应用';
  }

  function applicationInitial(app) {
    return String(app.display_name || '?').trim().charAt(0).toUpperCase() || '?';
  }

  function applicationRow(app, compact = false) {
    const typeLabel = applicationTypeLabel(app);
    const publisher = app.publisher || (app.presentationClass === 'SYSTEM_COMPONENT' ? 'macOS 系统' : '发布者未知');
    const observation = Number(app.observed)
      ? `Santa 已发现 · ${formatTime(app.last_observed_at)}`
      : app.installed ? '已安装 · 尚无 Santa 执行记录' : '预置规则 · 尚未在终端发现';
    return `
      <article class="application-entry ${compact ? 'compact-entry' : ''}">
        <div class="application-row">
          <div class="application-mark" aria-hidden="true">${state.view === 'BLOCK' && bulkSourcesForApp(app).length
            ? `<input class="block-select" type="checkbox" data-bulk-app="${escapeHtml(app.id)}" aria-label="选择 ${escapeHtml(app.display_name)}" ${state.selectedBlockAppIds.has(app.id) ? 'checked' : ''}>`
            : escapeHtml(applicationInitial(app))}</div>
          <div class="identity">
            <strong>${escapeHtml(app.display_name)}</strong>
            <small><span class="kind-label">${escapeHtml(typeLabel)}</span>${escapeHtml(publisher)}</small>
          </div>
          <div class="observation"><span>${escapeHtml(observation)}</span>${app.policyAvailable === false ? '<span class="identity-warning">缺少可用规则身份，仅供查看</span>' : ''}${app.installed && app.ruleCoversInstalledVersion === true && app.signatureStatus !== 'signed_valid' ? '<span class="identity-warning">仅有版本哈希，更新后需重新核验</span>' : ''}${app.installed && app.ruleCoversInstalledVersion === false ? '<span class="identity-warning">安装身份尚未关联可用规则</span>' : ''}${state.view !== 'REVIEW' ? `<span class="badge ${app.state === 'BLOCK' ? 'block' : app.state === 'IGNORE' ? 'ignore' : ''}">${app.state === 'BLOCK' ? '阻止策略' : '已忽略'}</span>` : ''}${state.view === 'BLOCK' ? `<span class="schedule-line${syncPending() ? ' pending' : ''}">${escapeHtml(appScheduleSummary(app))}</span>` : ''}</div>
          <div class="actions">${applicationActions(app)}</div>
        </div>
      </article>`;
  }

  function applicationGroup(title, description, rows, className) {
    if (!rows.length) return '';
    return `<details class="application-group ${className}"${state.applicationQuery.trim() ? ' open' : ''}>
      <summary><span><strong>${escapeHtml(title)}</strong><small>${escapeHtml(description)}</small></span><span>${rows.length} 项</span></summary>
      <div class="group-list">${rows.map((app) => applicationRow(app, true)).join('')}</div>
    </details>`;
  }

  function bindApplicationSearch() {
    const input = $('#application-search');
    if (!input) return;
    input.addEventListener('input', () => {
      state.applicationQuery = input.value;
      renderApplications();
      const next = $('#application-search');
      next?.focus();
      next?.setSelectionRange(state.applicationQuery.length, state.applicationQuery.length);
    });
  }

  function updateBulkControls() {
    const count = $('#bulk-block-count');
    const button = $('#bulk-block-schedule');
    const all = $('#select-visible-blocks');
    if (count) count.textContent = String(state.selectedBlockAppIds.size);
    if (button) button.disabled = state.selectedBlockAppIds.size === 0;
    const visible = [...document.querySelectorAll('[data-bulk-app]')];
    if (all) {
      all.checked = visible.length > 0 && visible.every((input) => input.checked);
      all.indeterminate = visible.some((input) => input.checked) && !all.checked;
    }
  }

  function renderApplications() {
    const query = state.applicationQuery.trim().toLowerCase();
    const rows = query
      ? state.data.filter((app) => applicationSearchText(app).includes(query))
      : state.data;
    const primaryRows = rows.filter((app) => app.presentationClass === 'USER_APPLICATION');
    const technicalRows = rows.filter((app) => app.presentationClass !== 'USER_APPLICATION');
    if (state.view === 'REVIEW') {
      state.reviewCount = state.data.filter((app) => app.presentationClass === 'USER_APPLICATION' && Number(app.observed)).length;
      const count = $('#review-count');
      if (count) {
        count.textContent = String(state.reviewCount);
        count.hidden = state.reviewCount === 0;
      }
    }
    $('#content').innerHTML = `
      <div class="toolbar">
        <span class="summary">${primaryRows.length} 个应用${state.view === 'REVIEW' ? ` · ${primaryRows.filter((app) => Number(app.observed)).length} 个 Santa 已发现` : ''}${state.view === 'BLOCK' ? ` · 时区 ${escapeHtml(state.blockSchedules?.timeZone || 'Asia/Shanghai')} <button class="quiet" id="edit-time-zone" type="button">设置时区</button>` : ''}</span>
        ${state.view === 'BLOCK' ? `<div class="bulk-controls"><label class="bulk-select-all"><input id="select-visible-blocks" type="checkbox"> 全选当前列表</label><button class="secondary" id="bulk-block-schedule" type="button" ${state.selectedBlockAppIds.size ? '' : 'disabled'}>设置所选时间段 <span id="bulk-block-count">${state.selectedBlockAppIds.size}</span></button></div>` : ''}
        <input id="application-search" class="application-search" type="search" value="${escapeHtml(state.applicationQuery)}" placeholder="搜索应用、Bundle ID 或进程路径" aria-label="搜索应用">
      </div>
      ${CATEGORY_ORDER.map((category) => {
        const categoryRows = primaryRows.filter((app) => app.contentCategory === category);
        if (!categoryRows.length) return '';
        const first = CATEGORY_ORDER.find((label) => primaryRows.some((app) => app.contentCategory === label));
        return `<details class="application-group category-group"${state.applicationQuery.trim() || category === first ? ' open' : ''}>
          <summary><strong>${category}</strong><span>${categoryRows.length} 个应用</span></summary>
          <div class="group-list">${categoryRows.map((app) => applicationRow(app)).join('')}</div>
        </details>`;
      }).join('') || '<div class="empty compact-empty">当前没有应用。</div>'}
      ${applicationGroup('技术记录', '无法归入顶层应用的后台程序、系统组件和独立执行文件。', technicalRows, 'technical-group')}
      ${state.merges.length ? `<details class="merge-log"><summary>已合并身份 ${state.merges.length} 组</summary>${state.merges.map((item) => `
        <div class="merge-row"><span>${escapeHtml(item.source_name)} → ${escapeHtml(item.target_name)}</span><button class="secondary" data-action="UNMERGE" data-id="${escapeHtml(item.source_id)}">撤销合并</button></div>
      `).join('')}</details>` : ''}
    `;
    bindApplicationSearch();
    $('#select-visible-blocks')?.addEventListener('change', (event) => {
      document.querySelectorAll('[data-bulk-app]').forEach((input) => {
        input.checked = event.target.checked;
        if (input.checked) state.selectedBlockAppIds.add(input.dataset.bulkApp);
        else state.selectedBlockAppIds.delete(input.dataset.bulkApp);
      });
      updateBulkControls();
    });
    $('#bulk-block-schedule')?.addEventListener('click', openBulkBlockSchedule);
    updateBulkControls();
    $('#edit-time-zone')?.addEventListener('click', () => {
      $('#time-zone-input').value = state.blockSchedules?.timeZone || 'Asia/Shanghai';
      $('#time-zone-dialog').showModal();
    });
  }

  function renderMacs() {
    const rows = state.data;
    $('#content').innerHTML = `
      <div class="toolbar"><span class="summary">Native Mac 与 Chrome Device 完全独立</span><button class="primary" id="add-mac-button">添加 Native Mac</button></div>
      ${rows.length ? rows.map((mac) => {
        const status = nativeMacStatus(mac);
        return `
        <article class="mac-row">
          <div class="identity"><strong>${escapeHtml(mac.display_name)}</strong><small>${escapeHtml(mac.hostname || '尚未 enrollment')}${escapeHtml(serialSummary(mac.serial_number))}</small></div>
          <div class="meta">Santa ${escapeHtml(mac.santa_version || '未报告')}<br>macOS ${escapeHtml(mac.os_version || '未报告')}<br>安装清单 ${mac.inventory_count == null ? '未导入' : `${Number(mac.inventory_count)} 个应用 · ${formatTime(mac.inventory_imported_at)}`}</div>
          <div><span class="badge ${status.className}">${status.label}</span><div class="meta">最近同步 ${formatTime(mac.last_preflight_at)}<br>策略 ${mac.applied_policy_version}/${mac.desired_policy_version}</div></div>
          <div class="actions">${mac.status === 'active' ? `<button class="secondary" data-mac-action="NATIVE_TIME" data-id="${escapeHtml(mac.id)}">${mac.native_time_rules_enabled ? '关闭' : '启用'}原生时间规则</button><button class="secondary" data-mac-action="IMPORT" data-id="${escapeHtml(mac.id)}">导入应用清单</button><button class="secondary" data-mac-action="ROTATE" data-id="${escapeHtml(mac.id)}">轮换 enrollment</button><button class="danger" data-mac-action="REVOKE" data-id="${escapeHtml(mac.id)}">吊销</button>` : ''}</div>
        </article>`;
      }).join('') : '<div class="empty">还没有 Native Mac。添加后会下载设备专属 Santa 配置文件。</div>'}
    `;
    $('#add-mac-button')?.addEventListener('click', () => $('#enrollment-dialog').showModal());
  }

  function renderPredefined() {
    const sourceItems = (state.preconfigurations?.items || [])
      .filter((item) => !item.matchedApplicationId && !item.disabled_at);
    const legacy = new Map((state.predefined?.items || []).map((item) => [item.source_index, item]));
    const itemRow = (item) => {
      const old = item.source === 'qustodio-2026-09' ? legacy.get(item.source_index) : null;
      const pending = (old?.identities || []).filter((identity) => identity.status === 'NEEDS_CONFIRM');
      const target = item.desired_state === 'BLOCK' ? 'BLOCK' : '候选';
      return `<div class="predefined-row${item.parent_source_index != null ? ' component' : ''}">
        <div class="predefined-name"><strong>${escapeHtml(item.display_name)}</strong><small>${escapeHtml(item.source)}${item.parent_source_index != null ? ' · 组件' : ''}</small></div>
        <div class="predefined-bundle" title="${escapeHtml(item.bundle_id || '')}">${escapeHtml(item.bundle_id || 'Bundle ID 待核对')}</div>
        <div><span class="badge ${item.desired_state === 'BLOCK' ? 'block' : ''}">${target}</span></div>
        <div class="predefined-match">${item.desired_state === 'BLOCK' ? pending.length ? '身份需确认' : '身份待识别' : '仅供识别，不下发规则'}
          ${pending.map((identity) => `<div class="predefined-identity"><code title="${escapeHtml(identity.identifier)}">${escapeHtml(identity.identity_type)} · ${escapeHtml(identity.identifier)}</code><button class="quiet" data-preset-action="CONFIRM" data-index="${item.source_index}" data-key="${escapeHtml(identity.identity_key)}">确认</button><button class="quiet" data-preset-action="REJECT" data-index="${item.source_index}" data-key="${escapeHtml(identity.identity_key)}">排除</button></div>`).join('')}</div>
        <div class="predefined-status"><strong>未匹配</strong><small>未见于当前安装清单或 Santa 记录</small></div>
        <div class="predefined-actions">${item.desired_state === 'BLOCK' ? `<button class="quiet" data-schedule-type="PREDEFINED" data-schedule-key="${escapeHtml(JSON.stringify([item.source, item.source_index]))}" data-schedule-name="${escapeHtml(item.display_name)}">${escapeHtml(scheduleLabel('PREDEFINED', JSON.stringify([item.source, item.source_index])))}</button>` : ''}${old && item.desired_state === 'BLOCK' ? `<button class="quiet" data-preset-action="DISABLE" data-index="${item.source_index}" title="停用此来源项及已核验组件">停用</button>` : ''}</div>
      </div>`;
    };
    $('#content').innerHTML = `<div class="toolbar"><span class="summary">${sourceItems.length} 个未匹配来源项</span></div>
      ${sourceItems.length ? `<div class="predefined-table"><div class="predefined-head"><span>来源应用</span><span>Bundle ID</span><span>目标</span><span>身份</span><span>发现状态</span><span></span></div>
        ${sourceItems.map(itemRow).join('')}</div>` : '<div class="empty">当前没有未匹配的预配置应用。已匹配应用请在待审核、已阻止或已忽略列表查看。</div>'}`;
  }

  async function loadView() {
    clearError();
    state.selectedBlockAppIds.clear();
    $('#content').innerHTML = '<div class="empty">正在读取 Native App Control…</div>';
    const [title, subtitle] = TITLES[state.view];
    $('#view-title').textContent = title;
    $('#view-subtitle').textContent = subtitle;
    try {
      if (state.view === 'MACS') {
        const result = await native('/native/v1/macs');
        state.data = result.data || [];
        state.merges = [];
      } else if (state.view === 'PREDEFINED') {
        const [preconfigurations, predefined, schedules] = await Promise.all([
          native('/native/v1/preconfigurations'), native('/native/v1/predefined'), native('/native/v1/block-schedules'),
        ]);
        state.preconfigurations = preconfigurations.data;
        state.predefined = predefined.data;
        state.blockSchedules = schedules.data;
      } else {
        const [result, merges, schedules, preconfigurations] = await Promise.all([
          native(`/native/v1/applications?state=${state.view}`),
          native('/native/v1/application-merges'),
          native('/native/v1/block-schedules'),
          state.view === 'BLOCK' ? native('/native/v1/preconfigurations') : Promise.resolve({ data: null }),
        ]);
        state.data = result.data || [];
        state.merges = merges.data || [];
        state.blockSchedules = schedules.data;
        state.preconfigurations = preconfigurations.data;
      }
      if (state.view === 'MACS') renderMacs();
      else if (state.view === 'PREDEFINED') renderPredefined();
      else renderApplications();
    } catch (error) {
      showError(error);
      $('#content').innerHTML = '<div class="empty">暂时无法读取独立 Native App 服务。</div>';
    }
  }

  async function presetAction(button) {
    const index = Number(button.dataset.index);
    const action = button.dataset.presetAction;
    if (action === 'CONFIRM' && !window.confirm('确认此身份属于该应用？哈希规则仅覆盖当前版本，确认后将下发 BLOCK。')) return;
    if (action === 'DISABLE' && !window.confirm('停用此预定义项及其已核验组件？现有独立 BLOCK 规则不会删除。')) return;
    if (action === 'REJECT' && !window.confirm('确认排除此候选身份？')) return;
    const path = action === 'DISABLE'
      ? `/native/v1/predefined/${index}/disable`
      : `/native/v1/predefined/${index}/identities/decision`;
    await native(path, { method: 'POST', body: JSON.stringify({ action, identityKey: button.dataset.key }) });
    if ($('#application-detail-dialog').open) $('#application-detail-dialog').close();
    await loadView();
  }

  async function decide(applicationId, action) {
    await native(`/native/v1/applications/${encodeURIComponent(applicationId)}/decision`, {
      method: 'POST', body: JSON.stringify({ action }),
    });
    await loadView();
  }
  function setBlockScheduleAllDay(allDay) {
    $('#block-schedule-all-day').checked = allDay;
    const appMode = state.editingBlockSource?.type === 'APPLICATION' || !!state.editingBlockSources;
    $('#application-window-editor').hidden = allDay || !appMode;
    $('#block-schedule-time-range').hidden = allDay || appMode;
    for (const input of [$('#block-schedule-start'), $('#block-schedule-end')]) {
      input.disabled = allDay || appMode;
      input.required = !allDay && !appMode;
    }
    $('#application-window-list').querySelectorAll('input').forEach((input) => {
      input.disabled = allDay || !appMode;
    });
  }
  function addApplicationWindow(start = '09:00', end = '18:00', id = '') {
    const row = document.createElement('div');
    row.className = 'application-window-row';
    row.dataset.windowId = id;
    row.innerHTML = `<label>开始时间<input type="time" value="${escapeHtml(start)}" required></label>
      <label>结束时间<input type="time" value="${escapeHtml(end)}" required></label>
      <button class="secondary" type="button" aria-label="删除时段">删除</button>`;
    row.querySelector('button').addEventListener('click', () => {
      if ($('#application-window-list').children.length === 1) {
        showBlockScheduleError(new Error('最后一条时段不能直接删除；请选择“全天阻止”或改为忽略'));
        return;
      }
      row.remove();
    });
    $('#application-window-list').append(row);
  }
  function setApplicationWindows(policy) {
    $('#application-window-list').replaceChildren();
    for (const window of policy?.windows || []) addApplicationWindow(
      clockTime(window.start_minute), clockTime(window.end_minute), window.id);
    if (!policy?.windows?.length) addApplicationWindow();
  }
  function showBlockScheduleError(error) {
    const message = $('#block-schedule-error');
    message.textContent = error instanceof Error ? error.message : String(error);
    message.hidden = false;
  }
  function openBlockSchedule(type, key, name) {
    $('#block-schedule-error').hidden = true;
    state.editingBlockSource = { type, key };
    state.editingBlockSources = null;
    const scope = type === 'PUBLISHER' ? '该发布者 TeamID 下的全部应用'
      : type === 'PREDEFINED' ? '这条未接管的预配置项及其核验身份'
        : '该应用主程序及已核验组件；已匹配预配置仅保留来源记录';
    $('#block-schedule-title').textContent = name;
    const app = state.data.find((item) => item.id === key || item.directBlockApplicationId === key);
    const publisherWarning = type === 'APPLICATION' && app?.publisher_blocked && app.team_id
      ? ` 发布者 ${app.team_id} 的阻止规则仍独立生效（${scheduleLabel('PUBLISHER', app.team_id)}），修改本应用不会解除该规则。`
      : '';
    $('#block-schedule-scope').textContent = `作用范围：${scope}。${publisherWarning}`;
    const existing = scheduleFor(type, key);
    if (type === 'APPLICATION') setApplicationWindows(appPolicyFor(key));
    $('#block-schedule-start').value = existing ? clockTime(existing.start_minute) : '09:00';
    $('#block-schedule-end').value = existing ? clockTime(existing.end_minute) : '18:00';
    setBlockScheduleAllDay(type === 'APPLICATION' ? !appPolicyFor(key) || !!appPolicyFor(key).all_day : !existing);
    $('#block-schedule-dialog').showModal();
  }
  function openBulkBlockSchedule() {
    $('#block-schedule-error').hidden = true;
    const selected = state.data.filter((app) => state.selectedBlockAppIds.has(app.id));
    const sources = [...new Map(selected.flatMap(bulkSourcesForApp)
      .map(([type, key]) => [`${type}:${key}`, { sourceType: type, sourceKey: key }])).values()];
    if (!sources.length) throw new Error('请先选择有独立阻止来源的应用');
    state.editingBlockSource = null;
    state.editingBlockSources = sources;
    $('#block-schedule-title').textContent = `设置 ${selected.length} 款应用的时间段`;
    const publisherCount = selected.filter((app) => app.publisher_blocked).length;
    $('#block-schedule-scope').textContent = `统一设置所选应用及已核验组件；预配置由应用策略接管。发布者规则不会修改${publisherCount ? `，其中 ${publisherCount} 款应用仍可能受发布者规则阻止` : ''}。`;
    const existing = sources.map((source) => appPolicyFor(source.sourceKey));
    const same = existing.every((item) => JSON.stringify(item?.windows.map(({ start_minute, end_minute }) => [start_minute, end_minute]))
      === JSON.stringify(existing[0]?.windows.map(({ start_minute, end_minute }) => [start_minute, end_minute]))
      && Boolean(item?.all_day ?? true) === Boolean(existing[0]?.all_day ?? true));
    setApplicationWindows(same ? existing[0] : null);
    setBlockScheduleAllDay(same ? !existing[0] || !!existing[0].all_day : false);
    $('#block-schedule-dialog').showModal();
  }
  async function saveBlockSchedule(event) {
    event.preventDefault();
    const source = state.editingBlockSource;
    const sources = state.editingBlockSources;
    if (!source && !sources) return;
    const allDay = $('#block-schedule-all-day').checked;
    const start = $('#block-schedule-start').value;
    const end = $('#block-schedule-end').value;
    const appMode = source?.type === 'APPLICATION' || !!sources;
    if (!appMode && !allDay && start === end) throw new Error('开始和结束时间不能相同；全天请勾选“全天阻止”');
    if (appMode) {
      const windows = allDay ? [] : [...$('#application-window-list').children].map((row) => {
        const [startInput, endInput] = row.querySelectorAll('input');
        if (startInput.value === endInput.value) throw new Error('开始和结束时间不能相同');
        return { ...(row.dataset.windowId ? { id: row.dataset.windowId } : {}),
          start: startInput.value, end: endInput.value };
      });
      if (!allDay && !windows.length) throw new Error('至少保留一条时段；或明确选择全天阻止/改为忽略');
      const applicationIds = sources ? sources.map((item) => item.sourceKey) : [source.key];
      const url = sources ? '/native/v1/applications/block-policies/bulk'
        : `/native/v1/applications/${encodeURIComponent(source.key)}/block-policy`;
      const result = await native(url, { method: 'PUT', body: JSON.stringify(sources
        ? { applicationIds, allDay, windows } : { allDay, windows }) });
      const saved = result.data?.applicationPolicies;
      if (!Array.isArray(saved) || !applicationIds.every((id) => {
        const policy = saved.find((item) => item.application_id === id);
        return policy && Boolean(policy.all_day) === allDay && (allDay ||
          JSON.stringify(policy.windows.map((item) => [item.start_minute, item.end_minute])
            .sort((a, b) => a[0] - b[0] || a[1] - b[1]))
          === JSON.stringify(windows.map((item) => [Number(item.start.slice(0, 2)) * 60 + Number(item.start.slice(3, 5)),
            Number(item.end.slice(0, 2)) * 60 + Number(item.end.slice(3, 5))])
            .sort((a, b) => a[0] - b[0] || a[1] - b[1])));
      })) throw new Error('应用时段未保存，请重试');
      state.blockSchedules = result.data;
      $('#block-schedule-dialog').close();
      state.selectedBlockAppIds.clear();
      if ($('#application-detail-dialog').open) $('#application-detail-dialog').close();
      await loadView();
      return;
    }
    const result = await native(sources ? '/native/v1/block-schedules/bulk' : '/native/v1/block-schedules', {
      method: 'POST', body: JSON.stringify(sources
        ? { sources, allDay, start, end }
        : { sourceType: source.type, sourceKey: source.key, allDay, start, end }),
    });
    const expected = sources || [{ sourceType: source.type, sourceKey: source.key }];
    const responseSchedules = result.data?.schedules;
    const startMinute = Number(start.slice(0, 2)) * 60 + Number(start.slice(3, 5));
    const endMinute = Number(end.slice(0, 2)) * 60 + Number(end.slice(3, 5));
    if (!Array.isArray(responseSchedules) || !expected.every(({ sourceType, sourceKey }) => {
      const saved = responseSchedules.find((item) => item.source_type === sourceType && item.source_key === sourceKey);
      return allDay ? !saved : saved?.start_minute === startMinute && saved?.end_minute === endMinute;
    })) throw new Error('时间段未保存，请重试');
    state.blockSchedules = result.data;
    $('#block-schedule-dialog').close();
    state.selectedBlockAppIds.clear();
    if ($('#application-detail-dialog').open) $('#application-detail-dialog').close();
    await loadView();
  }
  async function openApplicationDetails(applicationId) {
    const app = state.data.find((item) => item.id === applicationId);
    if (!app) throw new Error('找不到该应用记录');
    const [preconfigurations, predefined] = await Promise.all([
      native('/native/v1/preconfigurations'), native('/native/v1/predefined'),
    ]);
    const appIds = new Set([app.id, ...(app.relatedApplicationIds || [])]);
    const sources = (preconfigurations.data?.items || []).filter((item) =>
      appIds.has(item.matchedApplicationId) && !item.disabled_at);
    const oldItems = new Map((predefined.data?.items || []).map((item) => [item.source_index, item]));
    const components = app.components || [];
    $('#detail-application-mark').textContent = applicationInitial(app);
    $('#detail-application-kind').textContent = applicationTypeLabel(app);
    $('#detail-application-name').textContent = app.display_name || '未知应用';
    $('#detail-application-publisher').textContent = app.publisher || (app.presentationClass === 'SYSTEM_COMPONENT' ? 'macOS 系统' : '发布者未知');
    const fields = [
      ['Bundle ID', app.top_level_bundle_id || app.bundle_id || '未提供'],
      ['Team ID', app.team_id || '未提供'],
      ['执行路径', app.sample_path || '未提供'],
      ['最近发现', Number(app.observed) ? formatTime(app.last_observed_at) : '尚未在终端发现'],
    ];
    $('#detail-application-fields').innerHTML = fields.map(([label, value]) => `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`).join('');
    const policySection = $('#detail-application-policy');
    policySection.hidden = state.view !== 'BLOCK';
    if (state.view === 'BLOCK') {
      const appId = app.directBlockApplicationId || (app.preconfiguredBlock ? app.id : null);
      const windows = appId ? appPolicyFor(appId)?.windows || [] : [];
      const windowRows = appId ? (windows.length
        ? windows.map((window) => `<div><strong>${escapeHtml(clockTime(window.start_minute))}–${escapeHtml(clockTime(window.end_minute))}</strong><small>每日阻止</small></div>`).join('')
        : '<div><strong>全天</strong><small>每日阻止</small></div>') : '';
      const publisherRow = app.publisher_blocked && app.team_id
        ? `<div><strong>发布者规则 · ${escapeHtml(scheduleLabel('PUBLISHER', app.team_id))}</strong><small>适用于 ${escapeHtml(app.team_id)} 下所有应用；独立于本应用策略</small></div>` : '';
      policySection.innerHTML = `<h3>有效阻止策略</h3><div class="detail-component-list">${windowRows}${publisherRow}</div>`;
    }
    const componentSection = $('#detail-application-components');
    componentSection.hidden = components.length === 0;
    componentSection.innerHTML = components.length ? `<h3>内部组件 <span>${components.length}</span></h3><div class="detail-component-list">${components.map((item) => `<div><strong>${escapeHtml(item.display_name)}</strong><small>${escapeHtml(item.bundle_id || item.top_level_bundle_id || '未提供 Bundle ID')}</small><code>${escapeHtml(item.sample_path || '未提供执行路径')}</code></div>`).join('')}</div>` : '';
    const sourceSection = $('#detail-application-preconfiguration');
    sourceSection.hidden = sources.length === 0;
    sourceSection.innerHTML = sources.length ? `<h3>预配置来源 <span>${sources.length}</span></h3><div class="detail-component-list">${sources.map((item) => {
      const old = item.source === 'qustodio-2026-09' ? oldItems.get(item.source_index) : null;
      const pending = (old?.identities || []).filter((identity) => identity.status === 'NEEDS_CONFIRM');
      const takenOver = !!app.directBlockApplicationId;
      return `<div><strong>${escapeHtml(item.display_name)}</strong><small>${escapeHtml(item.source)} · ${takenOver ? '已由手动应用策略接管' : item.desired_state === 'BLOCK' ? '预配置阻止' : '候选，不下发规则'}${old && !takenOver ? ` · ${escapeHtml(old.status)}` : ''}</small>${item.desired_state === 'BLOCK' && !takenOver ? `<button class="quiet" data-schedule-type="PREDEFINED" data-schedule-key="${escapeHtml(JSON.stringify([item.source, item.source_index]))}" data-schedule-name="${escapeHtml(item.display_name)}">时间段 ${escapeHtml(scheduleLabel('PREDEFINED', JSON.stringify([item.source, item.source_index])))}</button>` : ''}${pending.map((identity) => `<div class="predefined-identity"><code>${escapeHtml(identity.identity_type)} · ${escapeHtml(identity.identifier)}</code><button class="quiet" data-preset-action="CONFIRM" data-index="${item.source_index}" data-key="${escapeHtml(identity.identity_key)}">确认身份</button><button class="quiet" data-preset-action="REJECT" data-index="${item.source_index}" data-key="${escapeHtml(identity.identity_key)}">排除</button></div>`).join('')}</div>`;
    }).join('')}</div>` : '';
    const advanced = $('#detail-application-advanced');
    const advancedActions = [];
    if (state.view === 'BLOCK' && app.team_id && app.publisher_blocked) {
      advancedActions.push(`<button class="secondary" type="button" data-schedule-type="PUBLISHER" data-schedule-key="${escapeHtml(app.team_id)}" data-schedule-name="${escapeHtml(app.publisher || app.team_id)}">发布者时间段 ${escapeHtml(scheduleLabel('PUBLISHER', app.team_id))}</button>`);
    }
    if (state.view === 'REVIEW' && app.presentationClass !== 'SYSTEM_COMPONENT' && app.policyAvailable !== false) {
      if (app.team_id) advancedActions.push(`<button class="danger" type="button" data-detail-action="BLOCK_PUBLISHER" data-id="${escapeHtml(app.id)}">阻止发布者</button>`);
      advancedActions.push(`<button class="secondary" type="button" data-detail-action="MERGE" data-id="${escapeHtml(app.id)}">合并应用身份</button>`);
    }
    advanced.hidden = advancedActions.length === 0;
    $('#detail-advanced-actions').innerHTML = advancedActions.join('');
    $('#application-detail-dialog').showModal();
  }
  async function openMerge(applicationId) {
    const result = await native('/native/v1/applications');
    const targets = (result.data || []).filter((item) => item.id !== applicationId);
    if (!targets.length) throw new Error('没有可合并的其他 Application');
    $('#merge-source-id').value = applicationId;
    $('#merge-target-select').innerHTML = targets.map((item) => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.display_name)} · ${escapeHtml(item.top_level_bundle_id || item.id)}</option>`).join('');
    $('#merge-dialog').showModal();
  }
  async function confirmMerge() {
    const applicationId = $('#merge-source-id').value;
    const target = $('#merge-target-select').value;
    await native(`/native/v1/applications/${encodeURIComponent(applicationId)}/merge`, {
      method: 'POST', body: JSON.stringify({ targetApplicationId: target }),
    });
    $('#merge-dialog').close();
    await loadView();
  }
  async function unmerge(applicationId) {
    await native(`/native/v1/applications/${encodeURIComponent(applicationId)}/unmerge`, { method: 'POST' });
    await loadView();
  }
  async function createMac() {
    const displayName = $('#mac-name-input').value.trim();
    if (!displayName) throw new Error('请输入设备名称');
    const result = await native('/native/v1/macs', {
      method: 'POST', body: JSON.stringify({ displayName, childName: state.childName }),
    });
    $('#enrollment-dialog').close();
    showEnrollmentProfile(result.data.syncBaseUrl, displayName);
    await loadView();
  }
  async function macAction(nativeMacId, action) {
    if (action === 'IMPORT') {
      state.inventoryMacId = nativeMacId;
      $('#inventory-file-input').click();
      return;
    }
    if (action === 'NATIVE_TIME') {
      const mac = state.data.find((item) => item.id === nativeMacId);
      if (!mac) throw new Error('找不到 Native Mac');
      const enabled = !mac.native_time_rules_enabled;
      if (!window.confirm(enabled
        ? '仅此 Mac 将改用 Santa 原生时间规则；需要 Santa 2026.8 或更新版本。确认下发？'
        : '关闭后，此 Mac 将恢复按云端时间边界切换规则。确认下发？')) return;
      await native(`/native/v1/macs/${encodeURIComponent(nativeMacId)}/native-time-rules`, {
        method: 'POST', body: JSON.stringify({ enabled }),
      });
      await loadView();
      return;
    }
    const path = action === 'REVOKE' ? 'revoke' : 'rotate-enrollment';
    if (action === 'REVOKE' && !window.confirm('吊销后 Santa 停止云端同步；已下发 block rule 会保留到正式卸载或重新 enrollment。')) return;
    const result = await native(`/native/v1/macs/${encodeURIComponent(nativeMacId)}/${path}`, { method: 'POST' });
    if (result.data?.syncBaseUrl) {
      const mac = state.data.find((item) => item.id === nativeMacId);
      showEnrollmentProfile(result.data.syncBaseUrl, mac?.display_name || 'Native Mac');
    }
    await loadView();
  }

  document.addEventListener('DOMContentLoaded', async () => {
    $('#inventory-file-input').addEventListener('change', async (event) => {
      const file = event.target.files?.[0];
      const nativeMacId = state.inventoryMacId;
      event.target.value = '';
      state.inventoryMacId = null;
      if (!file || !nativeMacId) return;
      try {
        clearError();
        const applications = await applicationsFromInventoryZip(file);
        const result = await native(`/native/v1/macs/${encodeURIComponent(nativeMacId)}/inventory`, {
          method: 'POST', body: JSON.stringify({ applications }),
        });
        await loadView();
        $('#status-strip').hidden = false;
        $('#status-strip').classList.add('success');
        $('#status-strip').textContent = `已导入 ${result.data.count} 个顶层应用；安装清单不代表启动记录，也不会自动下发规则。`;
      } catch (error) { showError(error); }
    });
    document.querySelectorAll('.nav-button').forEach((button) => button.addEventListener('click', () => {
      document.querySelectorAll('.nav-button').forEach((item) => item.classList.toggle('active', item === button));
      state.view = button.dataset.view;
      state.applicationQuery = '';
      loadView();
    }));
    $('#refresh-button').addEventListener('click', loadView);
    $('#block-schedule-all-day').addEventListener('change', (event) => setBlockScheduleAllDay(event.target.checked));
    $('#add-application-window').addEventListener('click', () => addApplicationWindow());
    $('#cancel-block-schedule').addEventListener('click', () => $('#block-schedule-dialog').close());
    $('#block-schedule-form').addEventListener('submit', (event) => saveBlockSchedule(event).catch(showBlockScheduleError));
    $('#cancel-time-zone').addEventListener('click', () => $('#time-zone-dialog').close());
    $('#time-zone-form').addEventListener('submit', (event) => {
      event.preventDefault();
      native('/native/v1/child/time-zone', {
        method: 'POST', body: JSON.stringify({ timeZone: $('#time-zone-input').value.trim() }),
      }).then(() => { $('#time-zone-dialog').close(); return loadView(); }).catch(showError);
    });
    $('#download-profile-button').addEventListener('click', () => {
      try { downloadEnrollmentProfile(); } catch (error) { showError(error); }
    });
    $('#content').addEventListener('click', (event) => {
      const target = event.target.closest('[data-action], [data-mac-action], [data-preset-action], [data-schedule-type]');
      if (!target) return;
      const promise = target.dataset.scheduleType
        ? openBlockSchedule(target.dataset.scheduleType, target.dataset.scheduleKey, target.dataset.scheduleName)
        : target.dataset.presetAction ? presetAction(target) : target.dataset.action === 'DETAIL'
        ? openApplicationDetails(target.dataset.id)
        : target.dataset.action === 'SCHEDULE'
          ? openBlockSchedule('APPLICATION', target.dataset.id, target.dataset.scheduleName || '应用')
        : target.dataset.action === 'MERGE'
          ? openMerge(target.dataset.id)
        : target.dataset.action === 'UNMERGE'
          ? unmerge(target.dataset.id)
        : target.dataset.action
          ? decide(target.dataset.id, target.dataset.action)
          : macAction(target.dataset.id, target.dataset.macAction);
      Promise.resolve(promise).catch(showError);
    });
    $('#content').addEventListener('change', (event) => {
      const input = event.target.closest('[data-bulk-app]');
      if (!input) return;
      if (input.checked) state.selectedBlockAppIds.add(input.dataset.bulkApp);
      else state.selectedBlockAppIds.delete(input.dataset.bulkApp);
      updateBulkControls();
    });
    $('#detail-application-preconfiguration').addEventListener('click', (event) => {
      const scheduled = event.target.closest('[data-schedule-type]');
      if (scheduled) { event.stopPropagation(); openBlockSchedule(scheduled.dataset.scheduleType, scheduled.dataset.scheduleKey, scheduled.dataset.scheduleName); return; }
      const button = event.target.closest('[data-preset-action]');
      if (button) presetAction(button).catch(showError);
    });
    $('#close-application-detail').addEventListener('click', () => $('#application-detail-dialog').close());
    $('#application-detail-dialog').addEventListener('click', (event) => {
      const scheduled = event.target.closest('[data-schedule-type]');
      if (scheduled) { openBlockSchedule(scheduled.dataset.scheduleType, scheduled.dataset.scheduleKey, scheduled.dataset.scheduleName); return; }
      const target = event.target.closest('[data-detail-action]');
      if (!target) return;
      $('#application-detail-dialog').close();
      const promise = target.dataset.detailAction === 'MERGE'
        ? openMerge(target.dataset.id)
        : decide(target.dataset.id, target.dataset.detailAction);
      Promise.resolve(promise).catch(showError);
    });
    $('#create-mac-button').addEventListener('click', (event) => {
      event.preventDefault();
      createMac().catch(showError);
    });
    $('#confirm-merge-button').addEventListener('click', (event) => {
      event.preventDefault();
      confirmMerge().catch(showError);
    });
    await loadView();
  });
})();
