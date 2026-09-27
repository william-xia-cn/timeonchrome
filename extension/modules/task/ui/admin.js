import {
  canonicalTaskHost,
  normalizeTaskResourceSpec,
  normalizeTaskUrlRule,
  taskSpecialTargetsFromUrl,
} from '../domain.js';
import { getTaskBuildProfile } from '../build-profile.js';

const MODULE_ID = 'task-management-v1';
const send = (type, extra = {}) => chrome.runtime.sendMessage({ optionalModuleId: MODULE_ID, type, ...extra });
let draft = { hosts: [], urlRules: [], specialTargets: [] };
let hydratedTaskId = null;

let taskAdminRoot = document;
const byId = (id) => taskAdminRoot.querySelector('#' + id);
const inputLines = () => byId('resource-input').value.split(/\r?\n/).map((value) => value.trim()).filter(Boolean);
const fmt = (seconds) => {
  const value = Math.max(0, Number(seconds || 0));
  return value >= 3600
    ? Math.floor(value / 3600) + '小时' + Math.floor(value % 3600 / 60) + '分'
    : Math.floor(value / 60) + '分';
};
function localDateTime(ms) {
  const date = new Date(ms);
  const pad = (value) => String(value).padStart(2, '0');
  return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate()) + 'T' + pad(date.getHours()) + ':' + pad(date.getMinutes());
}
function displayDateTime(ms) {
  const value = Number(ms || 0);
  if (!Number.isFinite(value) || value <= 0) return '未设置';
  return new Date(value).toLocaleString('zh-CN', {
    month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false,
  });
}
function escapeHtml(value) {
  return String(value || '').replace(/[&<>"']/g, (char) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[char]));
}
function specialTypeLabel(type) {
  return ({ video: 'YouTube 视频', playlist: 'YouTube 播放列表', channel: 'YouTube 频道' })[type] || 'YouTube 对象';
}
function resourceEntries(spec = {}) {
  spec = normalizeTaskResourceSpec(spec).spec;
  return [
    ...(spec.hosts || []).map((value) => ({ key: 'host:' + value, group: '域名范围', label: '域名', value })),
    ...(spec.urlRules || []).map((rule) => ({
      key: 'url:' + rule.match + ':' + rule.url,
      group: rule.match === 'path_prefix' ? '路径范围' : '精确 URL',
      label: rule.match === 'path_prefix' ? '路径范围' : '精确页面',
      value: rule.url,
    })),
    ...(spec.specialTargets || []).map((target) => ({
      key: 'special:' + target.platform + ':' + target.type + ':' + target.canonicalTarget,
      group: specialTypeLabel(target.type),
      label: specialTypeLabel(target.type),
      value: target.canonicalTarget,
    })),
  ];
}
function renderResourceList(spec = draft, { removable = true, target = byId('resource-draft-list') } = {}) {
  const entries = resourceEntries(spec);
  if (target === byId('resource-draft-list')) byId('resource-count').textContent = entries.length + ' 项';
  if (!entries.length) {
    target.innerHTML = '<p class="empty">尚未添加允许资源。</p>';
    return;
  }
  const groups = new Map();
  for (const entry of entries) {
    if (!groups.has(entry.group)) groups.set(entry.group, []);
    groups.get(entry.group).push(entry);
  }
  target.innerHTML = [...groups.entries()].map(([group, items]) =>
    '<section class="resource-group"><h3>' + escapeHtml(group) + '<span>' + items.length + '</span></h3>' +
    items.map((entry) => '<div class="resource-row"><span class="resource-type">' + escapeHtml(entry.label) + '</span><code>' + escapeHtml(entry.value) + '</code>' +
      (removable ? '<button type="button" class="remove-resource" data-resource-key="' + escapeHtml(entry.key) + '" title="删除" aria-label="删除资源">×</button>' : '') +
    '</div>').join('') + '</section>'
  ).join('');
  if (removable) {
    target.querySelectorAll('[data-resource-key]').forEach((button) => {
      button.addEventListener('click', () => {
        const key = button.dataset.resourceKey;
        draft = {
          hosts: draft.hosts.filter((value) => 'host:' + value !== key),
          urlRules: draft.urlRules.filter((rule) => 'url:' + rule.match + ':' + rule.url !== key),
          specialTargets: draft.specialTargets.filter((targetItem) => 'special:' + targetItem.platform + ':' + targetItem.type + ':' + targetItem.canonicalTarget !== key),
        };
        renderResourceList();
      });
    });
  }
}
function taskCard(task) {
  const entries = resourceEntries(task.resourceSpec);
  const required = Math.max(0, Number(task.requiredSeconds || 0));
  const completed = Math.max(0, Number(task.completedSeconds || 0));
  const ratio = required > 0 ? Math.min(100, Math.round(completed / required * 100)) : 0;
  return '<article class="task-card"><div class="task-card-head"><div><span class="task-state">' + (task.runtimeStatus === 'enforcing' ? '强制执行中' : '即将开始') + '</span><strong>' + escapeHtml(task.name) + '</strong><small>' + entries.length + ' 项允许资源</small></div><span class="progress-number">' + ratio + '%</span></div>' +
    '<dl class="task-meta-strip"><div><dt>计划开始</dt><dd>' + escapeHtml(displayDateTime(task.plannedStartAt)) + '</dd></div><div><dt>已完成</dt><dd>' + fmt(completed) + '</dd></div><div><dt>要求时长</dt><dd>' + fmt(required) + '</dd></div></dl>' +
    '<div class="progress-track"><span style="width:' + ratio + '%"></span></div><div class="task-resource-list"></div></article>';
}
function renderDiagnostics(model = {}) {
  const heartbeatAt = Number(model.lastHeartbeatAt || 0);
  const heartbeatAttemptAt = Number(model.lastHeartbeatAttemptAt || 0);
  const pullAt = Number(model.lastPullAt || model.pulledAt || 0);
  const pullAttemptAt = Number(model.lastPullAttemptAt || 0);
  const heartbeatError = model.heartbeatError || null;
  const pullError = model.error || null;
  const capabilityLabel = heartbeatAt > 0
    ? '已上报'
    : heartbeatError
      ? '上报失败'
      : '未上报';
  const rows = [
    ['Task capability', capabilityLabel],
    ['最近 capability heartbeat', heartbeatAt ? displayDateTime(heartbeatAt) : (heartbeatAttemptAt ? '失败于 ' + displayDateTime(heartbeatAttemptAt) : '尚未尝试')],
    ['最近任务拉取', pullAt ? displayDateTime(pullAt) : (pullAttemptAt ? '失败于 ' + displayDateTime(pullAttemptAt) : '尚未尝试')],
  ];
  if (heartbeatError) rows.push(['Heartbeat 错误', heartbeatError]);
  if (pullError) rows.push(['Pull 错误', pullError]);
  const target = byId('task-diagnostics');
  if (!target) return;
  target.innerHTML = rows.map(([label, value]) => '<div><span>' + escapeHtml(label) + '</span><strong>' + escapeHtml(value) + '</strong></div>').join('');
  target.classList.toggle('has-error', Boolean(heartbeatError || pullError));
}
function renderTasks(tasks) {
  const list = byId('task-list');
  if (!tasks.length) {
    list.innerHTML = '<p class="muted">当前没有本地任务。</p>';
    return;
  }
  list.innerHTML = tasks.map(taskCard).join('');
  [...list.querySelectorAll('.task-card')].forEach((card, index) => {
    renderResourceList(tasks[index].resourceSpec, { removable: false, target: card.querySelector('.task-resource-list') });
  });
}
function hydrateDebugForm(model) {
  const tasks = [...(model.enforcingTasks || []), ...(model.nextTask ? [model.nextTask] : [])];
  const task = tasks.find((item) => item.debugOnly === true);
  if (!task || task.id === hydratedTaskId) return;
  hydratedTaskId = task.id;
  byId('name').value = task.name || 'Task V1 Local Debug';
  byId('start').value = localDateTime(task.plannedStartAt || Date.now() - 60000);
  byId('minutes').value = Math.max(1, Math.round(Number(task.requiredSeconds || 600) / 60));
  draft = normalizeTaskResourceSpec(task.resourceSpec || {}).spec;
  renderResourceList();
}
function setResourceMessage(message, error = false) {
  byId('resource-message').textContent = message;
  byId('resource-message').classList.toggle('error', error);
}
function addResources() {
  const kind = byId('resource-kind').value;
  const lines = inputLines();
  if (!lines.length) {
    setResourceMessage('请至少输入一行资源。', true);
    return;
  }
  const additions = { hosts: [], urlRules: [], specialTargets: [] };
  const errors = [];
  lines.forEach((line, index) => {
    if (kind === 'host') {
      const value = canonicalTaskHost(line);
      if (!value) errors.push('第 ' + (index + 1) + ' 行不是有效域名：' + line);
      else additions.hosts.push(value);
      return;
    }
    if (kind === 'url') {
      const normalized = normalizeTaskUrlRule({ url: line, match: byId('url-match').value });
      if (!normalized.ok) errors.push('第 ' + (index + 1) + ' 行不是有效 URL：' + line);
      else additions.urlRules.push(normalized.rule);
      return;
    }
    const target = taskSpecialTargetsFromUrl(line)[0];
    if (!target) errors.push('第 ' + (index + 1) + ' 行不是可支持的 YouTube 视频、播放列表或频道：' + line);
    else additions.specialTargets.push(target);
  });
  if (errors.length) {
    setResourceMessage(errors.join('；'), true);
    return;
  }
  const before = new Set(resourceEntries(draft).map((entry) => entry.key));
  const normalized = normalizeTaskResourceSpec({
    hosts: [...draft.hosts, ...additions.hosts],
    urlRules: [...draft.urlRules, ...additions.urlRules],
    specialTargets: [...draft.specialTargets, ...additions.specialTargets],
  });
  if (!normalized.ok) {
    setResourceMessage('资源校验失败，请检查输入。', true);
    return;
  }
  draft = normalized.spec;
  const added = resourceEntries(draft).filter((entry) => !before.has(entry.key)).length;
  const duplicates = lines.length - added;
  byId('resource-input').value = '';
  setResourceMessage('已添加 ' + added + ' 项' + (duplicates > 0 ? '，跳过 ' + duplicates + ' 个重复项。' : '。'));
  renderResourceList();
}
async function render({ hydrate = true } = {}) {
  const model = await send('GET_TASK_READ_MODEL');
  const tasks = [...(model.enforcingTasks || []), ...(model.nextTask ? [model.nextTask] : [])];
  byId('task-status').textContent = '当前强制 ' + Number(model.activeCount || 0) + ' 个任务' + (model.nextTask ? ' · 另有 1 个待开始' : '');
  renderDiagnostics(model);
  renderTasks(tasks);
  if (hydrate && model.cacheReason === 'local_admin_debug') hydrateDebugForm(model);
  return model;
}
async function updateDebugAvailability() {
  const profile = await getTaskBuildProfile();
  const enabled = profile.taskLocalDebugEnabled === true;
  const panel = byId('debug-panel');
  panel.hidden = !enabled;
  panel.querySelectorAll('input, textarea, select, button').forEach((control) => { control.disabled = !enabled; });
  byId('environment-label').textContent = profile.production ? '正式终端' : '开发调试';
  return enabled;
}
async function updateAuthorization() {
  const auth = await chrome.storage.local.get(['account_token']);
  const allowed = Boolean(auth.account_token);
  const panel = byId('debug-panel');
  panel.classList.toggle('locked', !allowed);
  panel.querySelectorAll('input, textarea, select, button').forEach((control) => { control.disabled = !allowed; });
  byId('refresh-btn').disabled = false;
  if (!allowed) byId('error').textContent = '请先在 TimeOnChrome 管理中心登录账户，再使用本地调试配置。';
}
function updateResourceKind() {
  const kind = byId('resource-kind').value;
  byId('url-match-field').hidden = kind !== 'url';
  byId('resource-input').placeholder = kind === 'host'
    ? 'khanacademy.org\ncollegeboard.org'
    : kind === 'url'
      ? 'https://example.com/practice'
      : 'https://www.youtube.com/watch?v=...';
}
function formatResponseErrors(response) {
  if (!Array.isArray(response?.details) || !response.details.length) return response?.error || '写入失败';
  return response.details.map((item) => {
    const prefix = Number.isInteger(item.index) ? '第 ' + (item.index + 1) + ' 项' : item.field;
    return prefix + '：' + item.code + (item.value ? ' (' + item.value + ')' : '');
  }).join('；');
}


const TASK_ADMIN_INLINE_HTML = `
  <section class="page-intro task-inline-intro">
    <div><p class="eyebrow">TASK MANAGEMENT</p><h1>终端任务状态</h1><p>查看当前设备已同步的强制任务、进度和允许资源。</p></div>
    <div class="task-inline-actions"><span id="environment-label" class="environment-badge">正在确认环境</span><button id="refresh-btn" class="icon-button" type="button" title="刷新" aria-label="刷新">↻</button><div id="task-status" class="status-summary">加载中...</div></div>
  </section>
  <section class="workspace-panel status-panel">
    <div class="panel-heading"><div><h2>当前与即将开始</h2><p>正式任务状态为只读，任务安排由家长端管理。</p></div><span class="scope-badge">本设备</span></div>
    <div id="task-diagnostics" class="task-diagnostics"></div><div id="task-list" class="task-list"></div>
  </section>
  <details class="workspace-panel debug-panel" id="debug-panel" open>
    <summary><span><strong>本地调试任务配置</strong><small>开发工具 · 仅本机</small></span><span class="summary-action">展开 / 收起</span></summary>
    <div class="debug-content">
      <div class="debug-notice"><strong>Beta 调试环境</strong><span>写入只替换本机调试任务，不创建云端正式任务。需要已登录的管理账户。</span></div>
      <div class="form-grid">
        <label>任务名称<input id="name" value="Task V1 Local Debug"></label>
        <label>计划开始<input id="start" type="datetime-local"></label>
        <label>要求时长（分钟）<input id="minutes" type="number" min="1" max="1440" value="10"></label>
      </div>
      <section class="resource-editor" aria-labelledby="resource-title">
        <div class="resource-heading"><div><h2 id="resource-title">允许资源</h2><p>按类型添加，每行一个资源。</p></div><strong id="resource-count">0 项</strong></div>
        <div class="resource-controls">
          <label>资源类型<select id="resource-kind"><option value="host">域名</option><option value="url">URL</option><option value="youtube">YouTube 对象</option></select></label>
          <label id="url-match-field" hidden>URL 范围<select id="url-match"><option value="exact">精确页面</option><option value="path_prefix">路径范围</option></select></label>
          <label class="resource-input">资源内容<textarea id="resource-input" rows="3" placeholder="khanacademy.org"></textarea></label>
          <button id="add-resource-btn" class="secondary-button" type="button">添加到列表</button>
        </div>
        <div id="resource-message" class="message" aria-live="polite"></div>
        <div id="resource-draft-list" class="resource-list"></div>
      </section>
      <div id="error" class="error" aria-live="polite"></div>
      <div class="actions"><button id="clear-btn" class="danger-button" type="button">清除调试任务</button><button class="primary-button" id="save-btn" type="button">写入调试任务</button></div>
    </div>
  </details>`;

function ensureTaskAdminStyles(root = document.body) {
  if (document.getElementById('task-admin-inline-style')) return;
  const link = document.createElement('link');
  link.id = 'task-admin-inline-style';
  link.rel = 'stylesheet';
  const embedded = root?.id !== 'task-admin-root';
  link.href = chrome.runtime.getURL(embedded ? 'modules/task/ui/task-inline.css' : 'modules/task/ui/task.css');
  document.head.appendChild(link);
}

export async function mountOptionalModulePanel(root = document.body) {
  taskAdminRoot = root;
  draft = { hosts: [], urlRules: [], specialTargets: [] };
  hydratedTaskId = null;
  ensureTaskAdminStyles(root);
  root.innerHTML = TASK_ADMIN_INLINE_HTML;byId('start').value = localDateTime(Date.now() - 60000);
byId('resource-kind').addEventListener('change', updateResourceKind);
byId('add-resource-btn').addEventListener('click', addResources);
byId('refresh-btn').addEventListener('click', () => render({ hydrate: true }));
byId('save-btn').addEventListener('click', async () => {
  byId('error').textContent = '';
  const normalized = normalizeTaskResourceSpec(draft);
  if (!normalized.ok) {
    byId('error').textContent = '请至少添加一个有效资源。';
    return;
  }
  const response = await send('SET_LOCAL_DEBUG_TASK_CACHE', {
    task: {
      name: byId('name').value,
      plannedStartAt: byId('start').value,
      requiredSeconds: Math.floor(Number(byId('minutes').value) * 60),
      resourceSpec: normalized.spec,
    },
  });
  if (!response?.ok) {
    byId('error').textContent = formatResponseErrors(response);
    return;
  }
  hydratedTaskId = null;
  byId('error').textContent = '已写入本地调试任务：' + resourceEntries(normalized.spec).length + ' 项资源。';
  await render({ hydrate: true });
});
byId('clear-btn').addEventListener('click', async () => {
  await send('CLEAR_LOCAL_DEBUG_TASK_CACHE');
  hydratedTaskId = null;
  draft = { hosts: [], urlRules: [], specialTargets: [] };
  renderResourceList();
  byId('error').textContent = '本地调试任务已清除。';
  await render({ hydrate: false });
});

updateResourceKind();
renderResourceList();
const debugEnabled = await updateDebugAvailability();
if (debugEnabled) await updateAuthorization();
await render({ hydrate: true });

}
