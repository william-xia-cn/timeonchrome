// Canonical shared evidence helpers. Consumers copy this file byte-for-byte.
// Derived evidence only: no ledger, classification or quota writes.
export const PAGE_EVIDENCE_TTL_MS = 3 * 86400000;
export const PAGE_EVIDENCE_MAX_BYTES = 256 * 1024;

export function reviewDate(timestamp) {
  return new Date(timestamp + 8 * 3600000).toISOString().slice(0, 10);
}

export function compositeSiteIdentity(value) {
  let host = String(value || '').trim().toLowerCase().replace(/^\*\./, '');
  try { host = new URL(host.includes('://') ? host : `https://${host}`).hostname; } catch { return null; }
  host = host.replace(/^(www|m)\./, '').replace(/\.$/, '');
  return /^[a-z0-9.-]+$/.test(host) && host.includes('.') ? host : null;
}

export function sanitizeCompositePage(urlValue, title = '') {
  let url;
  try { url = new URL(urlValue); } catch { return null; }
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) return null;
  if (['q', 'query', 'search', 'search_query', 'keyword', 'keywords', 'term'].some((key) => url.searchParams.has(key))) return null;
  let decoded;
  try { decoded = decodeURIComponent(url.pathname); } catch { return null; }
  if (/(^|\/)(login|signin|sign-in|auth|oauth|account|profile|checkout|payment|billing|settings|inbox|messages?|search)(\/|$)/i.test(decoded)) return null;
  const redact = (text) => String(text).replace(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi, '[redacted]')
    .replace(/\b[0-9a-f]{8}-[0-9a-f-]{27,}\b/gi, '[redacted]')
    .replace(/\b[A-Za-z0-9_-]{32,}\b/g, '[redacted]')
    .replace(/\b\d{7,}\b/g, '[redacted]')
    .replace(/[\u0000-\u001f\u007f]/g, '');
  // Redact embedded URLs as well: a title must not leak a query string.
  const safeTitle = redact(String(title).replace(/https?:\/\/\S+/gi, '[link]')).slice(0, 160);
  return { host: url.hostname.toLowerCase(), path: redact(decoded).slice(0, 512), title: safeTitle };
}

export async function hashPageEvidence(value) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(value)));
  return [...new Uint8Array(bytes)].map((v) => v.toString(16).padStart(2, '0')).join('');
}
