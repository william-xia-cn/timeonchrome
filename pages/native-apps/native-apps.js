(() => {
  const GUARDIAN_API = 'https://guardian-api.william-xia-cn.workers.dev';
  const NATIVE_API = 'https://timeonchrome-native-app-api.william-xia-cn.workers.dev';
  const TITLES = {
    REVIEW: ['待审核应用', 'Santa 发现的新应用默认允许运行，家长可在此忽略或阻止。'],
    BLOCK: ['已阻止应用', '应用规则按稳定代码身份下发；发布者规则覆盖同一 TeamID。'],
    IGNORE: ['已忽略应用', '已审核且不生成 Santa allow rule。'],
    MACS: ['Native Macs', '独立管理 Santa enrollment、同步状态和策略版本。'],
  };
  const state = {
    view: 'REVIEW', token: null, childId: null, childName: null,
    data: [], merges: [], enrollmentProfile: null, applicationQuery: '', reviewCount: 0,
  };
  const $ = (selector) => document.querySelector(selector);
  const escapeHtml = (value) => String(value ?? '').replace(/[&<>'"]/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
  })[char]);
  const readLocal = (key) => {
    try { return JSON.parse(localStorage.getItem(`toc_${key}`)); } catch { return null; }
  };
  const writeLocal = (key, value) => localStorage.setItem(`toc_${key}`, JSON.stringify(value));
  const formatTime = (value) => value ? new Date(Number(value)).toLocaleString('zh-CN') : '尚未同步';
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
    strip.textContent = error instanceof Error ? error.message : String(error);
  }
  function clearError() { $('#status-strip').hidden = true; $('#status-strip').textContent = ''; }

  function applicationActions(app) {
    if (app.presentationClass === 'SYSTEM_COMPONENT') {
      return `<button class="quiet" data-action="DETAIL" data-id="${escapeHtml(app.id)}">详情</button>`;
    }
    if (state.view === 'REVIEW') return `
      <button class="secondary" data-action="IGNORE" data-id="${escapeHtml(app.id)}">忽略</button>
      <button class="danger" data-action="BLOCK" data-id="${escapeHtml(app.id)}">阻止</button>
      <button class="quiet" data-action="DETAIL" data-id="${escapeHtml(app.id)}">详情</button>`;
    if (state.view === 'BLOCK') return `<button class="secondary" data-action="IGNORE" data-id="${escapeHtml(app.id)}">改为忽略</button><button class="quiet" data-action="DETAIL" data-id="${escapeHtml(app.id)}">详情</button>`;
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
      ? `最近发现 ${formatTime(app.last_observed_at)}`
      : '预置规则 · 尚未在终端发现';
    return `
      <article class="application-entry ${compact ? 'compact-entry' : ''}">
        <div class="application-row">
          <div class="application-mark" aria-hidden="true">${escapeHtml(applicationInitial(app))}</div>
          <div class="identity">
            <strong>${escapeHtml(app.display_name)}</strong>
            <small><span class="kind-label">${escapeHtml(typeLabel)}</span>${escapeHtml(publisher)}</small>
          </div>
          <div class="observation"><span>${escapeHtml(observation)}</span>${state.view !== 'REVIEW' ? `<span class="badge ${app.state === 'BLOCK' ? 'block' : app.state === 'IGNORE' ? 'ignore' : ''}">${app.state === 'BLOCK' ? '已阻止' : '已忽略'}</span>` : ''}</div>
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

  function renderApplications() {
    const query = state.applicationQuery.trim().toLowerCase();
    const rows = query
      ? state.data.filter((app) => applicationSearchText(app).includes(query))
      : state.data;
    const primaryRows = state.view === 'REVIEW'
      ? rows.filter((app) => app.presentationClass === 'USER_APPLICATION')
      : rows;
    const unknownRows = state.view === 'REVIEW'
      ? rows.filter((app) => app.presentationClass === 'UNKNOWN_EXECUTABLE')
      : [];
    const backgroundRows = state.view === 'REVIEW'
      ? rows.filter((app) => app.presentationClass === 'STANDALONE_BACKGROUND' || app.presentationClass === 'APPLICATION_COMPONENT')
      : [];
    const systemRows = state.view === 'REVIEW'
      ? rows.filter((app) => app.presentationClass === 'SYSTEM_COMPONENT')
      : [];
    const actionableRows = state.view === 'REVIEW'
      ? rows.filter((app) => app.presentationClass !== 'SYSTEM_COMPONENT')
      : rows;
    if (state.view === 'REVIEW') {
      state.reviewCount = state.data.filter((app) => app.presentationClass !== 'SYSTEM_COMPONENT').length;
      const count = $('#review-count');
      if (count) {
        count.textContent = String(state.reviewCount);
        count.hidden = state.reviewCount === 0;
      }
    }
    $('#content').innerHTML = `
      <div class="toolbar">
        <span class="summary">${state.view === 'REVIEW' ? `${actionableRows.length} 个待处理对象 · ${primaryRows.length} 个应用` : `${rows.length} 个应用`}</span>
        <input id="application-search" class="application-search" type="search" value="${escapeHtml(state.applicationQuery)}" placeholder="搜索应用、Bundle ID 或进程路径" aria-label="搜索应用">
      </div>
      ${state.view === 'REVIEW' ? `<section class="application-section" aria-label="需要处理">
        <header class="section-heading"><div><h2>需要处理</h2><p>优先处理可识别的顶层应用。</p></div><span>${primaryRows.length} 个应用</span></header>
        ${primaryRows.length ? primaryRows.map((app) => applicationRow(app)).join('') : '<div class="empty compact-empty">当前没有需要处理的可识别应用。</div>'}
      </section>
      ${applicationGroup('未知程序', '缺少稳定应用身份，处理前建议先查看路径。', unknownRows, 'unknown-group')}
      ${applicationGroup('后台程序', '更新器、守护程序和独立辅助进程。', backgroundRows, 'background-group')}
      ${applicationGroup('系统组件', 'macOS 自带组件，仅保留观测信息。', systemRows, 'system-group')}` : primaryRows.map((app) => applicationRow(app)).join('') || '<div class="empty">当前没有记录。</div>'}
      ${state.merges.length ? `<details class="merge-log"><summary>已合并身份 ${state.merges.length} 组</summary>${state.merges.map((item) => `
        <div class="merge-row"><span>${escapeHtml(item.source_name)} → ${escapeHtml(item.target_name)}</span><button class="secondary" data-action="UNMERGE" data-id="${escapeHtml(item.source_id)}">撤销合并</button></div>
      `).join('')}</details>` : ''}
    `;
    bindApplicationSearch();
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
          <div class="meta">Santa ${escapeHtml(mac.santa_version || '未报告')}<br>macOS ${escapeHtml(mac.os_version || '未报告')}</div>
          <div><span class="badge ${status.className}">${status.label}</span><div class="meta">最近同步 ${formatTime(mac.last_preflight_at)}<br>策略 ${mac.applied_policy_version}/${mac.desired_policy_version}</div></div>
          <div class="actions">${mac.status === 'active' ? `<button class="secondary" data-mac-action="ROTATE" data-id="${escapeHtml(mac.id)}">轮换 enrollment</button><button class="danger" data-mac-action="REVOKE" data-id="${escapeHtml(mac.id)}">吊销</button>` : ''}</div>
        </article>`;
      }).join('') : '<div class="empty">还没有 Native Mac。添加后会下载设备专属 Santa 配置文件。</div>'}
    `;
    $('#add-mac-button')?.addEventListener('click', () => $('#enrollment-dialog').showModal());
  }

  async function loadView() {
    clearError();
    $('#content').innerHTML = '<div class="empty">正在读取 Native App Control…</div>';
    const [title, subtitle] = TITLES[state.view];
    $('#view-title').textContent = title;
    $('#view-subtitle').textContent = subtitle;
    try {
      if (state.view === 'MACS') {
        const result = await native('/native/v1/macs');
        state.data = result.data || [];
        state.merges = [];
      } else {
        const [result, merges] = await Promise.all([
          native(`/native/v1/applications?state=${state.view}`),
          native('/native/v1/application-merges'),
        ]);
        state.data = result.data || [];
        state.merges = merges.data || [];
      }
      state.view === 'MACS' ? renderMacs() : renderApplications();
    } catch (error) {
      showError(error);
      $('#content').innerHTML = '<div class="empty">暂时无法读取独立 Native App 服务。</div>';
    }
  }

  async function decide(applicationId, action) {
    await native(`/native/v1/applications/${encodeURIComponent(applicationId)}/decision`, {
      method: 'POST', body: JSON.stringify({ action }),
    });
    await loadView();
  }
  function openApplicationDetails(applicationId) {
    const app = state.data.find((item) => item.id === applicationId);
    if (!app) throw new Error('找不到该应用记录');
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
    const componentSection = $('#detail-application-components');
    componentSection.hidden = components.length === 0;
    componentSection.innerHTML = components.length ? `<h3>内部组件 <span>${components.length}</span></h3><div class="detail-component-list">${components.map((item) => `<div><strong>${escapeHtml(item.display_name)}</strong><small>${escapeHtml(item.bundle_id || item.top_level_bundle_id || '未提供 Bundle ID')}</small><code>${escapeHtml(item.sample_path || '未提供执行路径')}</code></div>`).join('')}</div>` : '';
    const advanced = $('#detail-application-advanced');
    const advancedActions = [];
    if (state.view === 'REVIEW' && app.presentationClass !== 'SYSTEM_COMPONENT') {
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
    document.querySelectorAll('.nav-button').forEach((button) => button.addEventListener('click', () => {
      document.querySelectorAll('.nav-button').forEach((item) => item.classList.toggle('active', item === button));
      state.view = button.dataset.view;
      state.applicationQuery = '';
      loadView();
    }));
    $('#refresh-button').addEventListener('click', loadView);
    $('#download-profile-button').addEventListener('click', () => {
      try { downloadEnrollmentProfile(); } catch (error) { showError(error); }
    });
    $('#content').addEventListener('click', (event) => {
      const target = event.target.closest('[data-action], [data-mac-action]');
      if (!target) return;
      const promise = target.dataset.action === 'DETAIL'
        ? openApplicationDetails(target.dataset.id)
        : target.dataset.action === 'MERGE'
          ? openMerge(target.dataset.id)
        : target.dataset.action === 'UNMERGE'
          ? unmerge(target.dataset.id)
        : target.dataset.action
          ? decide(target.dataset.id, target.dataset.action)
          : macAction(target.dataset.id, target.dataset.macAction);
      Promise.resolve(promise).catch(showError);
    });
    $('#close-application-detail').addEventListener('click', () => $('#application-detail-dialog').close());
    $('#application-detail-dialog').addEventListener('click', (event) => {
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
