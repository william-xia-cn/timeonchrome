import { normalizeHostname } from './domain-semantics.js';

function normalizeOptionalString(value, maxLength) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, maxLength) : null;
}

function canonicalizeJson(value) {
  if (value === null || value === undefined) return null;
  if (Array.isArray(value)) return value.map((item) => canonicalizeJson(item));
  if (typeof value === 'object') {
    const result = {};
    for (const key of Object.keys(value).sort()) {
      if (value[key] !== undefined) result[key] = canonicalizeJson(value[key]);
    }
    return result;
  }
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string' || typeof value === 'boolean') return value;
  return String(value);
}

function finiteNumberOr(value, fallback) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

export function normalizeUsageSegmentContent(segment = {}) {
  return {
    schemaVersion: 1,
    id: typeof segment.id === 'string' ? segment.id : '',
    date: typeof segment.date === 'string' ? segment.date : '',
    timezone: typeof segment.timezone === 'string' && segment.timezone ? segment.timezone : 'Asia/Shanghai',
    dayStartMs: finiteNumberOr(segment.dayStartMs, 0),
    dayEndMs: finiteNumberOr(segment.dayEndMs, 0),
    startMs: finiteNumberOr(segment.startMs, null),
    endMs: finiteNumberOr(segment.endMs, null),
    durationSeconds: finiteNumberOr(segment.durationSeconds, null),
    domain: normalizeHostname(segment.domain) || '',
    channel: typeof segment.channel === 'string' ? segment.channel : '',
    mode: typeof segment.mode === 'string' ? segment.mode : '',
    sourceState: segment.sourceState ? String(segment.sourceState) : '',
    settlementReason: segment.settlementReason ? String(segment.settlementReason) : '',
    parentSegmentId: segment.parentSegmentId ? String(segment.parentSegmentId) : null,
    partIndex: finiteNumberOr(segment.partIndex, 1),
    partCount: finiteNumberOr(segment.partCount, 1),
    tabId: segment.tabId === null || segment.tabId === undefined ? null : String(segment.tabId),
    windowId: finiteNumberOr(segment.windowId, null),
    description: canonicalizeJson(segment.description || null),
    managedTargetId: normalizeOptionalString(segment.managedTargetId, 128),
    managedTargetType: normalizeOptionalString(segment.managedTargetType, 64),
    managedTargetNamespace: normalizeOptionalString(segment.managedTargetNamespace, 64),
    managedTargetValue: normalizeOptionalString(segment.managedTargetValue, 1024),
    managedTargetLabelAtTime: normalizeOptionalString(segment.managedTargetLabelAtTime, 512),
    targetSourceAtTime: normalizeOptionalString(segment.targetSourceAtTime, 64),
    targetRuleId: normalizeOptionalString(segment.targetRuleId, 128),
    targetMatchLevel: normalizeOptionalString(segment.targetMatchLevel, 64),
    targetClassificationAtTime: normalizeOptionalString(segment.targetClassificationAtTime, 64),
    quotaBucketAtTime: normalizeOptionalString(segment.quotaBucketAtTime, 64),
  };
}

export function serializeUsageSegmentContent(segment) {
  return JSON.stringify(normalizeUsageSegmentContent(segment));
}

export async function hashUsageSegmentContent(segment) {
  const bytes = new TextEncoder().encode(serializeUsageSegmentContent(segment));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function isUsageSegmentContentHash(value) {
  return typeof value === 'string' && /^[0-9a-f]{64}$/.test(value);
}
