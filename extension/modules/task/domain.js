// task-management.js - shared Task Management V1 pure functions.

export const TASK_MANAGEMENT_V1_CAPABILITY = 'taskManagementV1';
export const TASK_REQUIRED_SECONDS_MIN = 60;
export const TASK_REQUIRED_SECONDS_MAX = 24 * 60 * 60;

export const TASK_LIFECYCLE_STATUSES = Object.freeze(['open', 'paused', 'completed', 'cancelled']);
export const TASK_TERMINAL_STATUSES = Object.freeze(['completed', 'cancelled']);
export const TASK_SPECIAL_PLATFORMS = Object.freeze(['youtube']);
export const TASK_SPECIAL_TYPES = Object.freeze(['video', 'playlist', 'channel']);
export const TASK_URL_MATCH_TYPES = Object.freeze(['exact', 'path_prefix']);

const TASK_TRACKING_QUERY_KEYS = new Set([
  'dclid', 'fbclid', 'gclid', 'mc_cid', 'mc_eid', 'msclkid', 'ref', 'ref_src',
]);

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

export function canonicalTaskUrl(value = '', { ignoreQuery = false } = {}) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  try {
    const parsed = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    const host = canonicalTaskHost(parsed.hostname);
    if (!host) return '';
    parsed.hash = '';
    let pathname = parsed.pathname.replace(/\/{2,}/g, '/');
    if (pathname.length > 1) pathname = pathname.replace(/\/+$/g, '');
    const query = new URLSearchParams();
    if (!ignoreQuery) {
      const entries = [...parsed.searchParams.entries()]
        .filter(([key]) => {
          const normalizedKey = key.toLowerCase();
          return !normalizedKey.startsWith('utm_') && !TASK_TRACKING_QUERY_KEYS.has(normalizedKey);
        })
        .sort(([aKey, aValue], [bKey, bValue]) => aKey.localeCompare(bKey) || aValue.localeCompare(bValue));
      for (const [key, itemValue] of entries) query.append(key, itemValue);
    }
    const search = query.toString();
    return `https://${host}${pathname === '/' ? '' : pathname}${search ? `?${search}` : ''}`;
  } catch {
    return '';
  }
}

export function normalizeTaskSpecialTarget(target = {}) {
  const value = typeof target === 'string'
    ? target
    : target.canonicalTarget || target.targetValue || target.url || '';
  const detected = taskSpecialTargetsFromUrl(value)[0] || null;
  if (!detected) return null;
  const platform = typeof target === 'string' ? 'youtube' : String(target.platform || 'youtube').trim().toLowerCase();
  const type = typeof target === 'string' ? detected.type : String(target.type || detected.type).trim().toLowerCase();
  if (platform !== 'youtube' || type !== detected.type) return null;
  return detected;
}

function uniqueSorted(values) {
  return Array.from(new Set(values.filter(Boolean))).sort((a, b) => a.localeCompare(b));
}

export function normalizeTaskUrlRule(rule = {}) {
  const raw = typeof rule === 'string' ? rule : rule.url;
  const match = typeof rule === 'string' ? 'exact' : String(rule.match || 'exact').trim().toLowerCase();
  if (!TASK_URL_MATCH_TYPES.includes(match)) {
    return { ok: false, code: 'INVALID_URL_MATCH', value: raw, match };
  }
  const url = canonicalTaskUrl(raw, { ignoreQuery: match === 'path_prefix' });
  if (!url) return { ok: false, code: 'INVALID_URL', value: raw, match };
  return { ok: true, rule: { url, match } };
}

export function normalizeTaskResourceSpec(input = {}) {
  const errors = [];
  const hostInputs = Array.isArray(input.hosts) ? input.hosts : [];
  const hosts = uniqueSorted(hostInputs.map((raw, index) => {
    const value = canonicalTaskHost(raw);
    if (!value && String(raw || '').trim()) errors.push({ field: 'hosts', index, value: raw, code: 'INVALID_HOST' });
    return value;
  }));

  const ruleInputs = [
    ...(Array.isArray(input.urlRules) ? input.urlRules : []),
    ...(Array.isArray(input.urls) ? input.urls.map((url) => ({ url, match: 'exact', legacy: true })) : []),
  ];
  const urlRules = [];
  const ruleKeys = new Set();
  ruleInputs.forEach((rawRule, index) => {
    const normalized = normalizeTaskUrlRule(rawRule);
    if (!normalized.ok) {
      errors.push({ field: 'urlRules', index, value: normalized.value, code: normalized.code });
      return;
    }
    const key = `${normalized.rule.match}:${normalized.rule.url}`;
    if (ruleKeys.has(key)) return;
    ruleKeys.add(key);
    urlRules.push(normalized.rule);
  });
  urlRules.sort((a, b) => `${a.match}:${a.url}`.localeCompare(`${b.match}:${b.url}`));

  const specialInputs = Array.isArray(input.specialTargets) ? input.specialTargets : [];
  const specialTargets = [];
  const specialKeys = new Set();
  specialInputs.forEach((rawTarget, index) => {
    const normalized = normalizeTaskSpecialTarget(rawTarget);
    if (!normalized) {
      const value = typeof rawTarget === 'string'
        ? rawTarget
        : rawTarget?.canonicalTarget || rawTarget?.targetValue || rawTarget?.url || '';
      errors.push({ field: 'specialTargets', index, value, code: 'INVALID_SPECIAL_TARGET' });
      return;
    }
    const key = `${normalized.platform}:${normalized.type}:${normalized.canonicalTarget}`;
    if (specialKeys.has(key)) return;
    specialKeys.add(key);
    specialTargets.push(normalized);
  });
  specialTargets.sort((a, b) => `${a.type}:${a.canonicalTarget}`.localeCompare(`${b.type}:${b.canonicalTarget}`));

  const spec = { hosts, urlRules, specialTargets };
  if (!hosts.length && !urlRules.length && !specialTargets.length) {
    errors.push({ field: 'resourceSpec', code: 'EMPTY_RESOURCE_SPEC' });
  }
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

export function taskSpecialTargetsFromUrl(value = '') {
  const canonical = canonicalTaskUrl(value);
  if (!canonical) return [];
  const parsed = new URL(canonical);
  const host = canonicalTaskHost(parsed.hostname);
  if (host !== 'youtube.com' && host !== 'youtu.be') return [];
  const listId = parsed.searchParams.get('list');
  if (listId) return [{ platform: 'youtube', type: 'playlist', canonicalTarget: canonicalTaskUrl('https://www.youtube.com/playlist?list=' + listId) }];
  const videoId = host === 'youtu.be'
    ? parsed.pathname.split('/').filter(Boolean)[0]
    : parsed.pathname === '/watch'
      ? parsed.searchParams.get('v')
      : parsed.pathname.startsWith('/shorts/')
        ? parsed.pathname.split('/').filter(Boolean)[1]
        : null;
  if (videoId) return [{ platform: 'youtube', type: 'video', canonicalTarget: canonicalTaskUrl('https://www.youtube.com/watch?v=' + videoId) }];
  if (/^\/(?:channel\/[^/]+|@[^/]+|c\/[^/]+|user\/[^/]+)/i.test(parsed.pathname)) {
    return [{ platform: 'youtube', type: 'channel', canonicalTarget: canonicalTaskUrl('https://www.youtube.com' + parsed.pathname) }];
  }
  return [];
}

export function normalizeTaskPageContext(page = {}) {
  const url = canonicalTaskUrl(page.url || page.href || '');
  const host = canonicalTaskHost(page.host || page.domain || page.hostname || page.url || '');
  const specialTargets = taskSpecialTargetsFromUrl(url);
  const candidates = [];
  if (page.specialTarget) candidates.push(page.specialTarget);
  if (Array.isArray(page.specialTargets)) candidates.push(...page.specialTargets);
  for (const candidate of candidates) {
    const normalized = normalizeTaskSpecialTarget(candidate);
    if (normalized) specialTargets.push(normalized);
  }
  return { url, host, specialTargets };
}

export function taskHostMatches(resourceHost = '', pageHost = '') {
  const resource = canonicalTaskHost(resourceHost);
  const current = canonicalTaskHost(pageHost);
  return Boolean(resource && current && (current === resource || current.endsWith(`.${resource}`)));
}

export function taskUrlRuleMatches(rule = {}, pageUrl = '') {
  const normalized = normalizeTaskUrlRule(rule);
  if (!normalized.ok) return false;
  if (normalized.rule.match === 'exact') {
    return canonicalTaskUrl(pageUrl) === normalized.rule.url;
  }
  const current = canonicalTaskUrl(pageUrl, { ignoreQuery: true });
  if (!current) return false;
  const currentUrl = new URL(current);
  const ruleUrl = new URL(normalized.rule.url);
  if (currentUrl.hostname !== ruleUrl.hostname) return false;
  if (ruleUrl.pathname === '/') return true;
  return currentUrl.pathname === ruleUrl.pathname || currentUrl.pathname.startsWith(`${ruleUrl.pathname}/`);
}

export function matchTaskResources(task = {}, page = {}) {
  const normalizedTask = normalizeTaskRecord(task);
  const normalizedPage = normalizeTaskPageContext(page);
  const spec = normalizedTask.resourceSpec || { hosts: [], urlRules: [], specialTargets: [] };
  const matches = [];
  for (const host of spec.hosts || []) {
    if (taskHostMatches(host, normalizedPage.host)) matches.push({ type: 'host', value: host });
  }
  for (const rule of spec.urlRules || []) {
    if (taskUrlRuleMatches(rule, normalizedPage.url)) {
      matches.push({ type: rule.match === 'path_prefix' ? 'path_prefix' : 'url', value: rule.url });
    }
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
