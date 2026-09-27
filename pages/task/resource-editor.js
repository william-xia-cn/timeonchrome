const TRACKING_KEYS = new Set(['dclid','fbclid','gclid','mc_cid','mc_eid','msclkid','ref','ref_src']);

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
    let pathname = parsed.pathname.replace(/\/{2,}/g, '/');
    if (pathname.length > 1) pathname = pathname.replace(/\/+$/g, '');
    const query = new URLSearchParams();
    if (!ignoreQuery) {
      const entries = [...parsed.searchParams.entries()]
        .filter(([key]) => !key.toLowerCase().startsWith('utm_') && !TRACKING_KEYS.has(key.toLowerCase()))
        .sort(([aKey,aValue],[bKey,bValue]) => aKey.localeCompare(bKey) || aValue.localeCompare(bValue));
      for (const [key,itemValue] of entries) query.append(key,itemValue);
    }
    const search = query.toString();
    return `https://${host}${pathname === '/' ? '' : pathname}${search ? `?${search}` : ''}`;
  } catch {
    return '';
  }
}

export function normalizeTaskUrlRule(rule = {}) {
  const raw = typeof rule === 'string' ? rule : rule.url;
  const match = typeof rule === 'string' ? 'exact' : String(rule.match || 'exact').toLowerCase();
  if (!['exact','path_prefix'].includes(match)) return { ok:false, code:'INVALID_URL_MATCH', value:raw };
  const url = canonicalTaskUrl(raw, { ignoreQuery: match === 'path_prefix' });
  return url ? { ok:true, rule:{ url, match } } : { ok:false, code:'INVALID_URL', value:raw };
}

export function taskSpecialTargetsFromUrl(value = '') {
  const canonical = canonicalTaskUrl(value);
  if (!canonical) return [];
  const parsed = new URL(canonical);
  const host = canonicalTaskHost(parsed.hostname);
  if (host !== 'youtube.com' && host !== 'youtu.be') return [];
  const listId = parsed.searchParams.get('list');
  if (listId) return [{ platform:'youtube', type:'playlist', canonicalTarget:canonicalTaskUrl(`https://www.youtube.com/playlist?list=${listId}`) }];
  const videoId = host === 'youtu.be'
    ? parsed.pathname.split('/').filter(Boolean)[0]
    : parsed.pathname === '/watch'
      ? parsed.searchParams.get('v')
      : parsed.pathname.startsWith('/shorts/')
        ? parsed.pathname.split('/').filter(Boolean)[1]
        : null;
  if (videoId) return [{ platform:'youtube', type:'video', canonicalTarget:canonicalTaskUrl(`https://www.youtube.com/watch?v=${videoId}`) }];
  if (/^\/(?:channel\/[^/]+|@[^/]+|c\/[^/]+|user\/[^/]+)/i.test(parsed.pathname)) {
    return [{ platform:'youtube', type:'channel', canonicalTarget:canonicalTaskUrl(`https://www.youtube.com${parsed.pathname}`) }];
  }
  return [];
}

export function normalizeTaskResourceSpec(input = {}) {
  const errors = [];
  const hosts = [...new Set((Array.isArray(input.hosts) ? input.hosts : []).map((raw,index) => {
    const value = canonicalTaskHost(raw);
    if (!value && String(raw || '').trim()) errors.push({field:'hosts',index,value:raw,code:'INVALID_HOST'});
    return value;
  }).filter(Boolean))].sort();
  const ruleMap = new Map();
  const rules = [...(Array.isArray(input.urlRules) ? input.urlRules : []), ...(Array.isArray(input.urls) ? input.urls.map((url)=>({url,match:'exact'})) : [])];
  rules.forEach((raw,index) => {
    const normalized = normalizeTaskUrlRule(raw);
    if (!normalized.ok) errors.push({field:'urlRules',index,value:normalized.value,code:normalized.code});
    else ruleMap.set(`${normalized.rule.match}:${normalized.rule.url}`,normalized.rule);
  });
  const urlRules = [...ruleMap.values()].sort((a,b)=>`${a.match}:${a.url}`.localeCompare(`${b.match}:${b.url}`));
  const specialMap = new Map();
  (Array.isArray(input.specialTargets) ? input.specialTargets : []).forEach((raw,index) => {
    const value = typeof raw === 'string' ? raw : raw?.canonicalTarget || raw?.url || '';
    const detected = taskSpecialTargetsFromUrl(value)[0];
    const requestedType = typeof raw === 'string' ? detected?.type : String(raw?.type || detected?.type || '').toLowerCase();
    if (!detected || requestedType !== detected.type || (raw?.platform && String(raw.platform).toLowerCase() !== 'youtube')) {
      errors.push({field:'specialTargets',index,value,code:'INVALID_SPECIAL_TARGET'});
    } else {
      specialMap.set(`${detected.platform}:${detected.type}:${detected.canonicalTarget}`,detected);
    }
  });
  const specialTargets = [...specialMap.values()].sort((a,b)=>`${a.type}:${a.canonicalTarget}`.localeCompare(`${b.type}:${b.canonicalTarget}`));
  if (!hosts.length && !urlRules.length && !specialTargets.length) errors.push({field:'resourceSpec',code:'EMPTY_RESOURCE_SPEC'});
  return {ok:errors.length===0,spec:{hosts,urlRules,specialTargets},errors};
}

export function taskResourceEntries(spec = {}) {
  spec = normalizeTaskResourceSpec(spec).spec;
  return [
    ...(spec.hosts || []).map((value)=>({key:'host:'+value,group:'域名范围',label:'域名',value})),
    ...(spec.urlRules || []).map((rule)=>({key:'url:'+rule.match+':'+rule.url,group:rule.match==='path_prefix'?'路径范围':'精确 URL',label:rule.match==='path_prefix'?'路径范围':'精确页面',value:rule.url})),
    ...(spec.specialTargets || []).map((target)=>({key:'special:'+target.platform+':'+target.type+':'+target.canonicalTarget,group:({video:'YouTube 视频',playlist:'YouTube 播放列表',channel:'YouTube 频道'})[target.type]||'YouTube 对象',label:({video:'YouTube 视频',playlist:'YouTube 播放列表',channel:'YouTube 频道'})[target.type]||'YouTube 对象',value:target.canonicalTarget})),
  ];
}
