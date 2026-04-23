// core/domain-semantics.js
// Phase 3A.1: v1.2 冻结域名语义（单一实现源，暂不接入调用点）

export function normalizeHostname(input) {
  if (typeof input !== 'string') return null;
  let raw = input.trim();
  if (!raw) return null;

  raw = raw.toLowerCase().replace(/\.+$/g, '');
  if (!raw) return null;

  try {
    const normalized = new URL('http://' + raw).hostname.toLowerCase().replace(/\.+$/g, '');
    return normalized || null;
  } catch {
    return null;
  }
}

export function matchDomain(domain, pattern) {
  const d = normalizeHostname(domain);
  const p = normalizeHostname(pattern);
  if (!d || !p) return false;

  // 1) 默认 exact
  if (d === p) return true;

  // 5) www 对称互认仅限 example.com <-> www.example.com
  if (d.startsWith('www.') && d.slice(4) === p) return true;
  if (p.startsWith('www.') && p.slice(4) === d) return true;

  // 3) 只有 *.example.com 才匹配子域
  // 4) *.example.com 不包含裸域 example.com
  if (p.startsWith('*.')) {
    const base = p.slice(2);
    if (!base || d === base) return false;
    return d.endsWith('.' + base);
  }

  // 2) 不允许默认父域覆盖子域
  return false;
}
