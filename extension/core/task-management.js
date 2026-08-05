// task-management.js - shared Task Management V1 pure functions.

export const TASK_MANAGEMENT_V1_CAPABILITY = 'taskManagementV1';
export const TASK_REQUIRED_SECONDS_MIN = 60;
export const TASK_REQUIRED_SECONDS_MAX = 24 * 60 * 60;

export const TASK_LIFECYCLE_STATUSES = Object.freeze(['open', 'paused', 'completed', 'cancelled']);
export const TASK_TERMINAL_STATUSES = Object.freeze(['completed', 'cancelled']);
export const TASK_POLICY_TYPES = Object.freeze(['study', 'composite']);
export const TASK_SPECIAL_PLATFORMS = Object.freeze(['youtube']);
export const TASK_SPECIAL_TYPES = Object.freeze(['video', 'playlist', 'channel']);

export function normalizeTaskName(value = '') {
  return String(value || '')
    .normalize('NFKC')
    .trim()
    .replace(/\s+/g, ' ')
    .toLocaleLowerCase('en-US');
}

export function normalizeTaskLifecycleStatus(value = 'open') {
  const normalized = String(value || 'open').trim().toLowerCase();
  return TASK_LIFECYCLE_STATUSES.includes(normalized) ? normalized : 'open';
}

export function validateTaskRequiredSeconds(value) {
  const seconds = Number(value);
  if (!Number.isFinite(seconds) || seconds % 1 !== 0) {
    return { ok: false, code: 'INVALID_REQUIRED_SECONDS', error: 'required seconds must be an integer' };
  }
  if (seconds < TASK_REQUIRED_SECONDS_MIN || seconds > TASK_REQUIRED_SECONDS_MAX) {
    return { ok: false, code: 'REQUIRED_SECONDS_OUT_OF_RANGE', error: 'required seconds must be between 60 and 86400' };
  }
  return { ok: true, seconds };
}

export function canonicalTaskHost(value = '') {
  let raw = String(value || '').trim().toLowerCase();
  if (!raw) return '';
  raw = raw.replace(/^https?:\/\//i, '').replace(/\/.*$/g, '').replace(/\.+$/g, '');
  try {
    const host = new URL(`http://${raw}`).hostname.toLowerCase().replace(/\.+$/g, '');
    if (!host || !host.includes('.') || !/^[a-z0-9.-]+$/.test(host)) return '';
    if (host.startsWith('www.')) return host.slice(4);
    if (host.startsWith('m.')) return host.slice(2);
    return host;
  } catch {
    return '';
  }
}

export function canonicalTaskUrl(value = '') {
  const raw = String(value || '').trim();
  if (!raw) return '';
  try {
    const parsed = new URL(raw.startsWith('http://') || raw.startsWith('https://') ? raw : `https://${raw}`);
    parsed.protocol = 'https:';
    parsed.hash = '';
    parsed.hostname = parsed.hostname.toLowerCase().replace(/\.+$/g, '');
    if (!parsed.hostname || !parsed.hostname.includes('.')) return '';
    const query = new URLSearchParams(parsed.search);
    const kept = new URLSearchParams();
    for (const key of ['v', 'list']) {
      const current = query.get(key);
      if (current) kept.set(key, current);
    }
    parsed.search = kept.toString();
    return parsed.toString();
  } catch {
    return '';
  }
}

export function normalizeTaskSpecialTarget(target = {}) {
  const platform = String(target.platform || '').trim().toLowerCase();
  const type = String(target.type || '').trim().toLowerCase();
  const canonicalTarget = canonicalTaskUrl(target.canonicalTarget || target.targetValue || target.url || '');
  if (!TASK_SPECIAL_PLATFORMS.includes(platform)) return null;
  if (!TASK_SPECIAL_TYPES.includes(type)) return null;
  if (!canonicalTarget) return null;
  return { platform, type, canonicalTarget };
}

function uniqueSorted(values) {
  return Array.from(new Set(values.filter(Boolean))).sort((a, b) => a.localeCompare(b));
}

export function normalizeTaskResourceSpec(input = {}) {
  const errors = [];
  const policyTypes = uniqueSorted((Array.isArray(input.policyTypes) ? input.policyTypes : [])
    .map((value) => String(value || '').trim().toLowerCase())
    .filter((value) => {
      const ok = TASK_POLICY_TYPES.includes(value);
      if (!ok && value) errors.push({ field: 'policyTypes', value, code: 'INVALID_POLICY_TYPE' });
      return ok;
    }));

  const hosts = uniqueSorted((Array.isArray(input.hosts) ? input.hosts : [])
    .map(canonicalTaskHost)
    .filter((value, index) => {
      const raw = Array.isArray(input.hosts) ? input.hosts[index] : '';
      if (!value && raw) errors.push({ field: 'hosts', value: raw, code: 'INVALID_HOST' });
      return Boolean(value);
    }));

  const urls = uniqueSorted((Array.isArray(input.urls) ? input.urls : [])
    .map(canonicalTaskUrl)
    .filter((value, index) => {
      const raw = Array.isArray(input.urls) ? input.urls[index] : '';
      if (!value && raw) errors.push({ field: 'urls', value: raw, code: 'INVALID_URL' });
      return Boolean(value);
    }));

  const specialTargets = (Array.isArray(input.specialTargets) ? input.specialTargets : [])
    .map(normalizeTaskSpecialTarget)
    .filter(Boolean)
    .sort((a, b) => `${a.platform}:${a.type}:${a.canonicalTarget}`.localeCompare(`${b.platform}:${b.type}:${b.canonicalTarget}`));
  const dedupedSpecialTargets = [];
  const specialSeen = new Set();
  for (const target of specialTargets) {
    const key = `${target.platform}:${target.type}:${target.canonicalTarget}`;
    if (specialSeen.has(key)) continue;
    specialSeen.add(key);
    dedupedSpecialTargets.push(target);
  }

  const spec = { policyTypes, hosts, urls, specialTargets: dedupedSpecialTargets };
  const empty = policyTypes.length === 0 && hosts.length === 0 && urls.length === 0 && dedupedSpecialTargets.length === 0;
  if (empty) errors.push({ field: 'resourceSpec', code: 'EMPTY_RESOURCE_SPEC' });
  return { ok: errors.length === 0, spec, errors };
}

export function deriveTaskRuntimeStatus(task = {}, nowMs = Date.now()) {
  const lifecycleStatus = normalizeTaskLifecycleStatus(task.lifecycleStatus || task.lifecycle_status);
  if (lifecycleStatus === 'completed') return 'completed';
  if (lifecycleStatus === 'cancelled') return 'cancelled';
  if (lifecycleStatus === 'paused') return 'paused';
  const plannedStartAt = Number(task.plannedStartAt ?? task.planned_start_at ?? 0) || 0;
  return plannedStartAt > Number(nowMs || 0) ? 'scheduled' : 'enforcing';
}

export function taskHasProgress(task = {}) {
  return Number(task.completedSeconds ?? task.completed_seconds ?? 0) > 0;
}

export function canEditTaskCoreFields(task = {}, nowMs = Date.now()) {
  const lifecycleStatus = normalizeTaskLifecycleStatus(task.lifecycleStatus || task.lifecycle_status);
  if (TASK_TERMINAL_STATUSES.includes(lifecycleStatus)) return false;
  const plannedStartAt = Number(task.plannedStartAt ?? task.planned_start_at ?? 0) || 0;
  return Number(nowMs || 0) < plannedStartAt && !taskHasProgress(task);
}

export function sortTasksForProgress(tasks = []) {
  return [...tasks].sort((a, b) => {
    const startDelta = (Number(a.plannedStartAt ?? a.planned_start_at ?? 0) || 0) - (Number(b.plannedStartAt ?? b.planned_start_at ?? 0) || 0);
    if (startDelta !== 0) return startDelta;
    const nameCompare = normalizeTaskName(a.name).localeCompare(normalizeTaskName(b.name));
    if (nameCompare !== 0) return nameCompare;
    return String(a.id || '').localeCompare(String(b.id || ''));
  });
}

export function selectProgressTask(tasks = [], matchedTaskIds = []) {
  const matched = new Set((matchedTaskIds || []).map(String));
  return sortTasksForProgress(tasks).find((task) => matched.has(String(task.id))) || null;
}

export function normalizeTaskRecord(task = {}, nowMs = Date.now()) {
  const resourceInput = task.resourceSpec || task.resource_spec_json || {};
  const normalizedResource = normalizeTaskResourceSpec(typeof resourceInput === 'string' ? safeJsonParse(resourceInput, {}) : resourceInput);
  const requiredSeconds = Number(task.requiredSeconds ?? task.required_seconds ?? 0) || 0;
  const completedSeconds = Math.max(0, Number(task.completedSeconds ?? task.completed_seconds ?? 0) || 0);
  const plannedStartAt = Number(task.plannedStartAt ?? task.planned_start_at ?? 0) || 0;
  const lifecycleStatus = normalizeTaskLifecycleStatus(task.lifecycleStatus || task.lifecycle_status || 'open');
  return {
    ...task,
    id: String(task.id || ''),
    name: String(task.name || '').trim(),
    normalizedName: normalizeTaskName(task.normalizedName || task.normalized_name || task.name || ''),
    plannedStartAt,
    requiredSeconds,
    completedSeconds: Math.min(requiredSeconds || completedSeconds, completedSeconds),
    remainingSeconds: Math.max(0, requiredSeconds - completedSeconds),
    lifecycleStatus,
    runtimeStatus: deriveTaskRuntimeStatus({ lifecycleStatus, plannedStartAt }, nowMs),
    revision: Number(task.revision ?? 0) || 0,
    resourceSpec: normalizedResource.spec,
    resourceErrors: normalizedResource.errors,
  };
}

function safeJsonParse(value, fallback) {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

export function getEnforcingTasks(tasks = [], nowMs = Date.now()) {
  return sortTasksForProgress((Array.isArray(tasks) ? tasks : [])
    .map((task) => normalizeTaskRecord(task, nowMs))
    .filter((task) => task.id && task.lifecycleStatus === 'open' && task.runtimeStatus === 'enforcing' && task.remainingSeconds > 0));
}

export function getNextTaskAlarmTime(tasks = [], nowMs = Date.now()) {
  const now = Number(nowMs || 0);
  const futureStarts = (Array.isArray(tasks) ? tasks : [])
    .map((task) => normalizeTaskRecord(task, now))
    .filter((task) => task.id && task.lifecycleStatus === 'open' && task.remainingSeconds > 0 && task.plannedStartAt > now)
    .map((task) => task.plannedStartAt)
    .filter((value) => Number.isFinite(value) && value > now)
    .sort((a, b) => a - b);
  return futureStarts[0] || null;
}

export function normalizeTaskPageContext(page = {}) {
  const url = canonicalTaskUrl(page.url || page.href || '');
  const host = canonicalTaskHost(page.host || page.domain || page.hostname || page.url || '');
  const policyType = String(page.policyType || page.classification || page.targetClassification || '').trim().toLowerCase();
  const specialTargets = [];
  const candidates = [];
  if (page.specialTarget) candidates.push(page.specialTarget);
  if (Array.isArray(page.specialTargets)) candidates.push(...page.specialTargets);
  for (const candidate of candidates) {
    const normalized = normalizeTaskSpecialTarget(candidate);
    if (normalized) specialTargets.push(normalized);
  }
  return {
    url,
    host,
    policyType: TASK_POLICY_TYPES.includes(policyType) ? policyType : '',
    specialTargets,
  };
}

export function matchTaskResources(task = {}, page = {}) {
  const normalizedTask = normalizeTaskRecord(task);
  const normalizedPage = normalizeTaskPageContext(page);
  const spec = normalizedTask.resourceSpec || { policyTypes: [], hosts: [], urls: [], specialTargets: [] };
  const matches = [];
  if (normalizedPage.policyType && spec.policyTypes.includes(normalizedPage.policyType)) {
    matches.push({ type: 'policyType', value: normalizedPage.policyType });
  }
  if (normalizedPage.host && spec.hosts.includes(normalizedPage.host)) {
    matches.push({ type: 'host', value: normalizedPage.host });
  }
  if (normalizedPage.url && spec.urls.includes(normalizedPage.url)) {
    matches.push({ type: 'url', value: normalizedPage.url });
  }
  const pageSpecialKeys = new Set(normalizedPage.specialTargets.map((target) => `${target.platform}:${target.type}:${target.canonicalTarget}`));
  for (const target of spec.specialTargets || []) {
    const key = `${target.platform}:${target.type}:${target.canonicalTarget}`;
    if (pageSpecialKeys.has(key)) matches.push({ type: 'specialTarget', value: key });
  }
  return { matched: matches.length > 0, matches, task: normalizedTask, page: normalizedPage };
}

export function getTaskPolicyContext(tasks = [], page = {}, nowMs = Date.now()) {
  const enforcingTasks = getEnforcingTasks(tasks, nowMs);
  if (enforcingTasks.length === 0) {
    return {
      required: false,
      allowed: true,
      reason: 'no_active_task',
      activeTaskIds: [],
      matchedTaskIds: [],
      progressTaskId: null,
      matchesByTaskId: {},
    };
  }
  const matchesByTaskId = {};
  const matchedTaskIds = [];
  for (const task of enforcingTasks) {
    const result = matchTaskResources(task, page);
    if (!result.matched) continue;
    matchedTaskIds.push(task.id);
    matchesByTaskId[task.id] = result.matches;
  }
  const progressTask = selectProgressTask(enforcingTasks, matchedTaskIds);
  return {
    required: true,
    allowed: matchedTaskIds.length > 0,
    reason: matchedTaskIds.length > 0 ? 'task_resource_allowed' : 'task_required',
    activeTaskIds: enforcingTasks.map((task) => task.id),
    matchedTaskIds,
    progressTaskId: progressTask ? progressTask.id : null,
    matchesByTaskId,
  };
}
export function validateTaskDefinition(input = {}, nowMs = Date.now()) {
  const errors = [];
  const name = String(input.name || '').trim();
  if (!name) errors.push({ field: 'name', code: 'REQUIRED' });
  const plannedStartAt = Number(input.plannedStartAt ?? input.planned_start_at);
  if (!Number.isFinite(plannedStartAt) || plannedStartAt <= 0) errors.push({ field: 'plannedStartAt', code: 'INVALID_PLANNED_START' });
  const required = validateTaskRequiredSeconds(input.requiredSeconds ?? input.required_seconds);
  if (!required.ok) errors.push({ field: 'requiredSeconds', code: required.code });
  const resource = normalizeTaskResourceSpec(input.resourceSpec || input.resource_spec_json || {});
  errors.push(...resource.errors);
  return {
    ok: errors.length === 0,
    task: errors.length === 0 ? {
      name,
      normalizedName: normalizeTaskName(name),
      plannedStartAt,
      requiredSeconds: required.seconds,
      resourceSpec: resource.spec,
      lifecycleStatus: normalizeTaskLifecycleStatus(input.lifecycleStatus || input.lifecycle_status || 'open'),
      runtimeStatus: deriveTaskRuntimeStatus({ lifecycleStatus: input.lifecycleStatus || input.lifecycle_status || 'open', plannedStartAt }, nowMs),
    } : null,
    errors,
  };
}
