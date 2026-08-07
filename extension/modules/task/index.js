// Optional Task Management V1 module entry.

import {
  TASK_CACHE_KEY,
  TASK_PULL_ALARM,
  TASK_START_ALARM,
  getTaskCache,
  getTaskReadModel,
  normalizeTaskCachePayload,
  pullTaskCache,
  saveTaskCache,
  scheduleNextTaskAlarm,
  sendTaskHeartbeat,
  setupTaskAlarms,
} from './sync.js';
import {
  TASK_MANAGEMENT_V1_CAPABILITY,
  getTaskPolicyContext,
  normalizeTaskResourceSpec,
  validateTaskRequiredSeconds,
} from './domain.js';
import { checkpointTaskProgress, flushTaskProgress, pruneTaskProgressLedger, uploadPendingTaskProgress } from './progress-ledger.js';
import { getTaskBuildProfile } from './build-profile.js';

function parsePlannedStart(value, nowMs = Date.now()) {
  const numeric = Number(value);
  if (Number.isFinite(numeric) && numeric > 0) return numeric;
  const parsed = typeof value === 'string' ? Date.parse(value) : NaN;
  return Number.isFinite(parsed) ? parsed : nowMs - 60 * 1000;
}

function normalizeDebugTask(payload = {}, nowMs = Date.now()) {
  const required = validateTaskRequiredSeconds(payload.requiredSeconds ?? 600);
  if (!required.ok) return { ok: false, code: required.code, error: '要求时长必须在 1 分钟到 24 小时之间' };
  const resource = normalizeTaskResourceSpec(payload.resourceSpec || {});
  if (!resource.ok) return { ok: false, code: 'INVALID_RESOURCE_SPEC', error: '请至少配置一个有效域名、URL 或任务对象', details: resource.errors };
  const plannedStartAt = parsePlannedStart(payload.plannedStartAt, nowMs);
  return {
    ok: true,
    task: {
      id: `task-v1-local-debug-${Math.floor(plannedStartAt).toString(36)}`,
      name: String(payload.name || 'Task V1 Local Debug').trim() || 'Task V1 Local Debug',
      lifecycleStatus: 'open',
      plannedStartAt,
      requiredSeconds: required.seconds,
      completedSeconds: 0,
      revision: 1,
      resourceSpec: resource.spec,
      debugOnly: true,
    },
  };
}

async function checkpointCurrentPage(nowMs = Date.now()) {
  const tabs = await globalThis.chrome?.tabs?.query?.({ active: true, lastFocusedWindow: true }).catch(() => []);
  const tab = tabs?.[0] || null;
  if (!tab?.url || !/^https?:/i.test(tab.url)) {
    await flushTaskProgress(nowMs);
    return { active: false, reason: 'no_http_active_tab' };
  }
  const win = Number.isInteger(tab.windowId)
    ? await globalThis.chrome?.windows?.get?.(tab.windowId).catch(() => null)
    : null;
  const idleState = await globalThis.chrome?.idle?.queryState?.(60).catch(() => 'active') || 'active';
  return checkpointTaskProgress({ url: tab.url, foreground: win?.focused !== false, idleState, nowMs });
}
async function recheckActiveTab() {
  const tabs = await globalThis.chrome?.tabs?.query?.({ active: true, lastFocusedWindow: true }).catch(() => []);
  const tab = tabs?.[0] || null;
  if (tab?.id && /^https?:/i.test(String(tab.url || ''))) {
    await globalThis.chrome.tabs.reload(tab.id).catch(() => {});
  }
}

export async function purgeLocalDebugTasksForProduction() {
  const cache = await getTaskCache();
  const tasks = Array.isArray(cache?.tasks) ? cache.tasks : [];
  const hasDebugState = cache?.reason === 'local_admin_debug' || tasks.some((task) => task?.debugOnly === true);
  if (!hasDebugState) return { changed: false, preserved: tasks.length };
  const formalTasks = tasks.filter((task) => task?.debugOnly !== true);
  if (formalTasks.length > 0) {
    await saveTaskCache({
      ...cache,
      tasks: formalTasks,
      reason: cache?.reason === 'local_admin_debug' ? 'production_debug_cleanup' : cache?.reason,
    });
  } else {
    await globalThis.chrome?.storage?.local?.remove?.(TASK_CACHE_KEY);
  }
  await scheduleNextTaskAlarm(formalTasks, Date.now());
  return { changed: true, removed: tasks.length - formalTasks.length, preserved: formalTasks.length };
}
async function setDebugTask(payload = {}) {
  const nowMs = Date.now();
  const normalized = normalizeDebugTask(payload, nowMs);
  if (!normalized.ok) return normalized;
  const cache = normalizeTaskCachePayload({
    schemaVersion: 1,
    capability: TASK_MANAGEMENT_V1_CAPABILITY,
    serverTime: nowMs,
    taskVersion: nowMs,
    reason: 'local_admin_debug',
    tasks: [normalized.task],
  }, nowMs);
  cache.reason = 'local_admin_debug';
  await saveTaskCache(cache);
  await scheduleNextTaskAlarm(cache.tasks, nowMs);
  await recheckActiveTab();
  return { ok: true, task: normalized.task, cache: await getTaskReadModel() };
}

async function clearDebugTask() {
  await globalThis.chrome?.storage?.local?.remove?.(TASK_CACHE_KEY);
  await scheduleNextTaskAlarm([], Date.now());
  await recheckActiveTab();
  return { ok: true, cache: await getTaskReadModel() };
}

async function checkpointLocalDebugTask(payload = {}) {
  const cache = await getTaskCache();
  const tasks = Array.isArray(cache?.tasks) ? cache.tasks : [];
  if (cache?.reason !== 'local_admin_debug' || !tasks.length || tasks.some((task) => task.debugOnly !== true)) {
    return { ok: false, code: 'LOCAL_DEBUG_CHECKPOINT_FORBIDDEN', error: '仅本地调试任务可注入活跃 checkpoint' };
  }
  const nowMs = Number(payload.nowMs);
  const result = await checkpointTaskProgress({
    url: String(payload.url || ''),
    foreground: true,
    idleState: 'active',
    nowMs: Number.isFinite(nowMs) && nowMs > 0 ? nowMs : Date.now(),
  });
  return { ok: true, ...result };
}

function isTaskPageSender(sender = {}) {
  const runtime = globalThis.chrome?.runtime;
  if (!runtime?.id || sender?.id !== runtime.id) return false;
  const url = String(sender?.url || '');
  return url.startsWith(runtime.getURL('modules/task/ui/admin.html')) || url.startsWith(runtime.getURL('admin/admin.html'));
}

function requiredPageUrl(returnUrl = '') {
  const target = new URL(globalThis.chrome.runtime.getURL('modules/task/ui/required.html'));
  if (returnUrl) target.searchParams.set('returnUrl', returnUrl);
  return target.toString();
}

export function createOptionalModule() {
  let buildProfile = null;
  const runtime = {
    id: 'task-management-v1',
    entry: { label: '任务管理（Beta）', description: '一次性强制任务与独立进度管理', href: 'modules/task/ui/admin.html', uiKind: 'inline', inlineScript: 'modules/task/ui/admin.js' },

    async start() {
      buildProfile = await getTaskBuildProfile();
      if (buildProfile.taskLocalDebugEnabled !== true) await purgeLocalDebugTasksForProduction();
      await pruneTaskProgressLedger();
      setupTaskAlarms(globalThis.chrome?.alarms || null);
      globalThis.chrome?.alarms?.onAlarm?.addListener?.((alarm) => runtime.handleAlarm(alarm));
      globalThis.chrome?.storage?.onChanged?.addListener?.((changes, area) => {
        if (area === 'local' && changes.cloud_device_token?.newValue) {
          sendTaskHeartbeat({ reason: 'cloud_bound' })
            .then(() => pullTaskCache({ reason: 'cloud_bound' }))
            .catch(() => {});
        }
      });
      await scheduleNextTaskAlarm((await getTaskCache().catch(() => null))?.tasks || [], Date.now());
      sendTaskHeartbeat({ reason: 'module_start' })
        .then(() => pullTaskCache({ reason: 'module_start' }))
        .then(() => checkpointCurrentPage())
        .catch(() => {});
      globalThis.chrome?.tabs?.onActivated?.addListener?.(() => checkpointCurrentPage().catch(() => {}));
      globalThis.chrome?.tabs?.onUpdated?.addListener?.((_tabId, changeInfo) => {
        if (changeInfo.url || changeInfo.status === 'complete') checkpointCurrentPage().catch(() => {});
      });
      globalThis.chrome?.windows?.onFocusChanged?.addListener?.((windowId) => {
        if (windowId === globalThis.chrome.windows.WINDOW_ID_NONE) flushTaskProgress().catch(() => {});
        else checkpointCurrentPage().catch(() => {});
      });
      globalThis.chrome?.idle?.onStateChanged?.addListener?.((state) => {
        if (state !== 'active') flushTaskProgress().catch(() => {});
        else checkpointCurrentPage().catch(() => {});
      });
    },

    async beforeAccess({ url, foreground = false, isFocused = false, nowMs = Date.now() } = {}) {
      const cache = await getTaskCache();
      const policy = getTaskPolicyContext(Array.isArray(cache?.tasks) ? cache.tasks : [], { url }, nowMs);
      if (policy.required !== true) {
        await flushTaskProgress(nowMs);
        return { handled: false };
      }
      if (policy.allowed === true) {
        const idleState = await globalThis.chrome?.idle?.queryState?.(60).catch(() => 'active') || 'active';
        await checkpointTaskProgress({ url, foreground: foreground === true || isFocused === true, idleState, nowMs });
        return { handled: false };
      }
      await flushTaskProgress(nowMs);
      return { handled: true, action: 'redirect', redirectUrl: requiredPageUrl(url), policy };
    },

    async handleAlarm(alarm = {}) {
      if (alarm.name === TASK_PULL_ALARM) {
        await flushTaskProgress();
        await uploadPendingTaskProgress().catch(() => {});
        await pullTaskCache({ reason: 'alarm' }).catch(() => null);
        await sendTaskHeartbeat({ reason: 'alarm' }).catch(() => null);
        await checkpointCurrentPage();
        return { handled: true };
      }
      if (alarm.name === TASK_START_ALARM) {
        await sendTaskHeartbeat({ reason: 'task_start_alarm' }).catch(() => null);
        await pullTaskCache({ reason: 'task_start_alarm' });
        await recheckActiveTab();
        return { handled: true };
      }
      return { handled: false };
    },

    async handleMessage(message = {}, sender = {}) {
      if (message.type === 'GET_TASK_READ_MODEL') {
        await sendTaskHeartbeat({ reason: 'read_model' }).catch(() => null);
        return { handled: true, response: await getTaskReadModel() };
      }
      if (['SET_LOCAL_DEBUG_TASK_CACHE', 'CLEAR_LOCAL_DEBUG_TASK_CACHE', 'CHECKPOINT_LOCAL_DEBUG_TASK'].includes(message.type)) {
        buildProfile = buildProfile || await getTaskBuildProfile();
        if (buildProfile.taskLocalDebugEnabled !== true) {
          return { handled: true, response: { ok: false, code: 'LOCAL_DEBUG_DISABLED', error: '正式发布版本已关闭 Task 本地调试能力' } };
        }
        if (!isTaskPageSender(sender)) {
          return { handled: true, response: { ok: false, code: 'LOCAL_DEBUG_TASK_FORBIDDEN', error: '仅 Task 调试页可执行此操作' } };
        }
        const response = message.type === 'SET_LOCAL_DEBUG_TASK_CACHE'
          ? await setDebugTask(message.task || {})
          : message.type === 'CLEAR_LOCAL_DEBUG_TASK_CACHE'
            ? await clearDebugTask()
            : await checkpointLocalDebugTask(message);
        return { handled: true, response };
      }
      return { handled: false };
    },
  };
  return runtime;
}