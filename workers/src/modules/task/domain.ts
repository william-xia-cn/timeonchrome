export const TASK_CAPABILITY = 'taskManagementV1';
export type TaskLifecycleStatus = 'open' | 'paused' | 'completed' | 'cancelled';
export type TaskUrlMatch = 'exact' | 'path_prefix';

const TASK_URL_MATCH_TYPES: TaskUrlMatch[] = ['exact', 'path_prefix'];
const TASK_TRACKING_QUERY_KEYS = new Set([
  'dclid', 'fbclid', 'gclid', 'mc_cid', 'mc_eid', 'msclkid', 'ref', 'ref_src',
]);

export function normalizeTaskName(value: unknown): string {
  return String(value || '').normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-US');
}

export function normalizeTaskLifecycleStatus(value: unknown): TaskLifecycleStatus {
  const status = String(value || 'open').toLowerCase();
  return ['open', 'paused', 'completed', 'cancelled'].includes(status) ? status as TaskLifecycleStatus : 'open';
}

export function validateTaskRequiredSeconds(value: unknown) {
  const seconds = Number(value);
  return Number.isInteger(seconds) && seconds >= 60 && seconds <= 86400
    ? { ok: true, seconds }
    : { ok: false, code: 'REQUIRED_SECONDS_OUT_OF_RANGE', seconds: 0 };
}

export function canonicalTaskHost(value: unknown): string {
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

export function canonicalTaskUrl(value: unknown, options: { ignoreQuery?: boolean } = {}): string {
  const raw = String(value || '').trim();
  if (!raw) return '';
  try {
    const parsed = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    const host = canonicalTaskHost(parsed.hostname);
    if (!host) return '';
    let pathname = parsed.pathname.replace(/\/{2,}/g, '/');
    if (pathname.length > 1) pathname = pathname.replace(/\/+$/g, '');
    const query = new URLSearchParams();
    if (!options.ignoreQuery) {
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

export function taskSpecialTargetsFromUrl(value: unknown) {
  const canonical = canonicalTaskUrl(value);
  if (!canonical) return [];
  const parsed = new URL(canonical);
  const host = canonicalTaskHost(parsed.hostname);
  if (host !== 'youtube.com' && host !== 'youtu.be') return [];
  const listId = parsed.searchParams.get('list');
  if (listId) {
    return [{ platform: 'youtube', type: 'playlist', canonicalTarget: canonicalTaskUrl(`https://www.youtube.com/playlist?list=${listId}`) }];
  }
  const videoId = host === 'youtu.be'
    ? parsed.pathname.split('/').filter(Boolean)[0]
    : parsed.pathname === '/watch'
      ? parsed.searchParams.get('v')
      : parsed.pathname.startsWith('/shorts/')
        ? parsed.pathname.split('/').filter(Boolean)[1]
        : null;
  if (videoId) {
    return [{ platform: 'youtube', type: 'video', canonicalTarget: canonicalTaskUrl(`https://www.youtube.com/watch?v=${videoId}`) }];
  }
  if (/^\/(?:channel\/[^/]+|@[^/]+|c\/[^/]+|user\/[^/]+)/i.test(parsed.pathname)) {
    return [{ platform: 'youtube', type: 'channel', canonicalTarget: canonicalTaskUrl(`https://www.youtube.com${parsed.pathname}`) }];
  }
  return [];
}

export function normalizeTaskResourceSpec(input: any = {}) {
  const errors: Array<{ field: string; code: string; index?: number; value?: unknown }> = [];
  const hostInputs = Array.isArray(input.hosts) ? input.hosts : [];
  const hosts = [...new Set(hostInputs.map((raw: unknown, index: number) => {
    const value = canonicalTaskHost(raw);
    if (!value && String(raw || '').trim()) errors.push({ field: 'hosts', index, value: raw, code: 'INVALID_HOST' });
    return value;
  }).filter(Boolean))].sort();

  const ruleInputs = [
    ...(Array.isArray(input.urlRules) ? input.urlRules : []),
    ...(Array.isArray(input.urls) ? input.urls.map((url: unknown) => ({ url, match: 'exact' })) : []),
  ];
  const urlRuleMap = new Map<string, { url: string; match: TaskUrlMatch }>();
  ruleInputs.forEach((rawRule: any, index: number) => {
    const rawUrl = typeof rawRule === 'string' ? rawRule : rawRule?.url;
    const match = (typeof rawRule === 'string' ? 'exact' : String(rawRule?.match || 'exact').toLowerCase()) as TaskUrlMatch;
    if (!TASK_URL_MATCH_TYPES.includes(match)) {
      errors.push({ field: 'urlRules', index, value: rawUrl, code: 'INVALID_URL_MATCH' });
      return;
    }
    const url = canonicalTaskUrl(rawUrl, { ignoreQuery: match === 'path_prefix' });
    if (!url) {
      errors.push({ field: 'urlRules', index, value: rawUrl, code: 'INVALID_URL' });
      return;
    }
    urlRuleMap.set(`${match}:${url}`, { url, match });
  });
  const urlRules = [...urlRuleMap.values()].sort((a, b) => `${a.match}:${a.url}`.localeCompare(`${b.match}:${b.url}`));

  const specialMap = new Map<string, { platform: string; type: string; canonicalTarget: string }>();
  (Array.isArray(input.specialTargets) ? input.specialTargets : []).forEach((rawTarget: any, index: number) => {
    const rawUrl = typeof rawTarget === 'string'
      ? rawTarget
      : rawTarget?.canonicalTarget || rawTarget?.targetValue || rawTarget?.url || '';
    const detected = taskSpecialTargetsFromUrl(rawUrl)[0];
    const platform = typeof rawTarget === 'string' ? 'youtube' : String(rawTarget?.platform || 'youtube').toLowerCase();
    const requestedType = typeof rawTarget === 'string' ? detected?.type : String(rawTarget?.type || detected?.type || '').toLowerCase();
    if (!detected || platform !== 'youtube' || requestedType !== detected.type) {
      errors.push({ field: 'specialTargets', index, value: rawUrl, code: 'INVALID_SPECIAL_TARGET' });
      return;
    }
    specialMap.set(`${detected.platform}:${detected.type}:${detected.canonicalTarget}`, detected);
  });
  const specialTargets = [...specialMap.values()].sort((a, b) => `${a.type}:${a.canonicalTarget}`.localeCompare(`${b.type}:${b.canonicalTarget}`));

  if (!hosts.length && !urlRules.length && !specialTargets.length) {
    errors.push({ field: 'resourceSpec', code: 'EMPTY_RESOURCE_SPEC' });
  }
  return { ok: errors.length === 0, spec: { hosts, urlRules, specialTargets }, errors };
}

export function canEditTaskCoreFields(task: any = {}, now = Date.now()) {
  return normalizeTaskLifecycleStatus(task.lifecycleStatus) === 'open'
    && Number(task.completedSeconds || 0) === 0
    && Number(task.plannedStartAt || 0) > now;
}
