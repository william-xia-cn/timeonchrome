import { compositeSiteIdentity } from '../../../contracts/composite-page-evidence/v1.js';
export { compositeSiteIdentity, sanitizeCompositePage, hashPageEvidence, reviewDate } from '../../../contracts/composite-page-evidence/v1.js';
export const COMPOSITE_REVIEW_THRESHOLD_SECONDS = 1800;

export function suggestCompositePage(page) {
  const text = `${page.path || ''} ${page.title || ''}`;
  if (/\b(casino|porn|gambling)\b|色情|博彩|赌场/i.test(text)) return { verdict: 'rest', reason: '路径或标题包含明确娱乐风险词，仍需人工确认' };
  if (/\/(course|lesson|tutorial|documentation)(\/|$)/i.test(page.path || '')) return { verdict: 'study', reason: '路径为课程或技术文档，不能据此确定实际用途' };
  return { verdict: 'unknown', reason: '仅凭脱敏路径和标题不足以判断用途' };
}

export function eligibleCompositeRow(row) {
  return row.kind === 'daily_target' && row.channel === 'active' && !row.isFallback &&
    row.targetClassificationAtTime === 'composite' &&
    ['domain', 'subdomain', 'host'].includes(row.managedTargetType) &&
    compositeSiteIdentity(row.managedTargetValue) && Number(row.durationSeconds) > 0;
}

export function compositeReviewCandidates(accounts) {
  const groups = new Map();
  for (const account of accounts) for (const row of account.rows || []) {
    if (!eligibleCompositeRow(row)) continue;
    const site = compositeSiteIdentity(row.managedTargetValue);
    const group = groups.get(site) || { site, totalSeconds: 0, devices: {} };
    group.totalSeconds += row.durationSeconds;
    group.devices[account.deviceId] = (group.devices[account.deviceId] || 0) + row.durationSeconds;
    groups.set(site, group);
  }
  return [...groups.values()].sort((a, b) => a.site.localeCompare(b.site));
}

export function pageEvidenceIntervals(records) {
  return (records || []).filter((r) => r && Number.isFinite(r.startMs) && Number.isFinite(r.lastObservedAt) && r.page)
    .map((r) => ({ ...r, endMs: Math.min(r.endMs ?? Infinity, r.lastObservedAt + 90000) }))
    .filter((r) => r.endMs > r.startMs);
}

export function attributeCompositePages(segments, records) {
  const intervals = pageEvidenceIntervals(records);
  const pages = new Map();
  let totalSeconds = 0, unassignedSeconds = 0;
  for (const s of segments || []) {
    if (s.channel !== 'active' || !Number.isInteger(s.durationSeconds) || s.durationSeconds <= 0 || s.endMs <= s.startMs) continue;
    totalSeconds += s.durationSeconds;
    const matches = intervals.filter((r) => r.deviceId === s.deviceId && s.tabId != null && s.windowId != null &&
      String(r.tabId) === String(s.tabId) && Number(r.windowId) === Number(s.windowId) &&
      r.page.host === s.domain && r.startMs < s.endMs && r.endMs > s.startMs);
    const boundaries = [...new Set([s.startMs, s.endMs, ...matches.flatMap((r) => [Math.max(s.startMs, r.startMs), Math.min(s.endMs, r.endMs)])])].sort((a, b) => a - b);
    const weights = new Map();
    for (let i = 1; i < boundaries.length; i++) {
      const start = boundaries[i - 1], end = boundaries[i];
      const active = matches.filter((r) => r.startMs <= start && r.endMs >= end);
      const r = active.length === 1 ? active[0] : null;
      const key = r ? `${r.page.host}${r.page.path}` : null;
      const entry = weights.get(key) || { key, weight: 0, page: r?.page };
      entry.weight += end - start; weights.set(key, entry);
    }
    const span = s.endMs - s.startMs;
    const parts = [...weights.values()].map((part) => {
      const exact = s.durationSeconds * part.weight / span;
      return { ...part, seconds: Math.floor(exact), remainder: exact - Math.floor(exact) };
    }).sort((a, b) => b.remainder - a.remainder || String(a.key).localeCompare(String(b.key)));
    let left = s.durationSeconds - parts.reduce((sum, part) => sum + part.seconds, 0);
    for (const part of parts) if (left > 0) { part.seconds++; left--; }
    for (const part of parts) {
      if (part.key === null) { unassignedSeconds += part.seconds; continue; }
      const page = pages.get(part.key) || { pageKey: part.key, ...part.page, seconds: 0, devices: {} };
      page.seconds += part.seconds;
      page.devices[s.deviceId] = (page.devices[s.deviceId] || 0) + part.seconds;
      pages.set(part.key, page);
    }
  }
  return { totalSeconds, unassignedSeconds, pages: [...pages.values()].filter((p) => p.seconds > 0).sort((a, b) => b.seconds - a.seconds || a.pageKey.localeCompare(b.pageKey)) };
}
