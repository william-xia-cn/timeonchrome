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
