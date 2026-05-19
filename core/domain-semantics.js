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

export function domainForUrl(url) {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      return normalizeHostname(parsed.hostname);
    }
    if (parsed.protocol === 'chrome-extension:') return 'extension-page.chrome-local';
    if (parsed.protocol === 'chrome:') {
      if (parsed.hostname === 'extensions') return 'chrome-extensions.chrome-local';
      if (parsed.hostname === 'settings') return 'chrome-settings.chrome-local';
      return 'chrome-page.chrome-local';
    }
    if (parsed.protocol === 'edge:') return 'edge-page.chrome-local';
    if (parsed.protocol === 'file:') return 'local-file.chrome-local';
    if (parsed.protocol === 'about:') return 'about-page.chrome-local';
    if (parsed.protocol === 'data:' || parsed.protocol === 'blob:') return 'embedded-page.chrome-local';
    return 'unknown-page.chrome-local';
  } catch {
    return null;
  }
}

export function matchDomain(domain, pattern) {
  const d = normalizeHostname(domain);
  const p = normalizeHostname(pattern);
  if (!d || !p) return false;

  // Exact match.
  if (d === p) return true;

  // www symmetric alias: example.com <-> www.example.com
  if (d.startsWith('www.') && d.slice(4) === p) return true;
  if (p.startsWith('www.') && p.slice(4) === d) return true;

  // Wildcard: *.example.com matches subdomains but not bare domain.
  if (p.startsWith('*.')) {
    const base = p.slice(2);
    if (!base || d === base) return false;
    return d.endsWith('.' + base);
  }

  // V0: Parent domain covers subdomains with boundary safety.
  // example.com => chat.example.com, xwww.example.com
  // but not notexample.com or example.com.evil.com
  return d.endsWith('.' + p);
}
