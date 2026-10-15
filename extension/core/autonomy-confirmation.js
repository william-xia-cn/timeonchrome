import { getModeWindowStatus } from './time-windows.js';

export const AUTONOMY_CONFIRMATION_TEXT = '强行使用';
export function isAutonomyConfirmationText(value) {
  return value === AUTONOMY_CONFIRMATION_TEXT;
}
export function softReminderRepeatMinutes(acknowledgementCount = 0) {
  return acknowledgementCount > 0 ? 30 : 60;
}

export function scheduleReminderIntervalMinutes(config = {}) {
  const value = config?.autonomyConfig?.scheduleReminderIntervalMinutes;
  return Number.isInteger(value) && value >= 1 && value <= 1440 ? value : 30;
}

export function confirmedScheduleUsageSeconds(segments, grant, now = Date.now()) {
  if (!grant || !Number.isFinite(grant.at) || !Number.isFinite(now) || now <= grant.at) return 0;
  let profileId = null, deviceId = null;
  try { [profileId, deviceId] = JSON.parse(grant.scope || '[]'); } catch { return 0; }
  return (Array.isArray(segments) ? segments : []).reduce((total, segment) => {
    if (segment?.channel !== 'active' || !Number.isFinite(segment.startMs) || !Number.isFinite(segment.endMs)
      || !Number.isFinite(segment.durationSeconds) || segment.durationSeconds <= 0) return total;
    if ((profileId && segment.profileId !== profileId) || (deviceId && segment.deviceId !== deviceId)) return total;
    if (grant.managedTargetId
      ? segment.managedTargetId !== grant.managedTargetId
      : segment.domain !== grant.host) return total;
    const start = Math.max(grant.at, segment.startMs);
    const end = Math.min(now, segment.endMs);
    if (end <= start || segment.endMs <= segment.startMs) return total;
    return total + Math.floor(segment.durationSeconds * (end - start) / (segment.endMs - segment.startMs));
  }, 0);
}

export function scheduleConfirmationRuleIdentity(classificationResult, host) {
  const source = classificationResult?.source;
  const rule = classificationResult?.rule;
  if (source === 'siteClassificationRulesV1' && rule?.targetType && rule?.normalizedValue) {
    return ['rule', rule.id || null, rule.targetType, rule.normalizedValue, rule.decision];
  }
  if ((source === 'site_classification_request' || source === 'unclassified_site_access_record') && classificationResult?.request) {
    const request = classificationResult.request;
    if (request.requestedTargetType && request.requestedNormalizedValue) {
      return ['request', request.id || null,
        request.status === 'rejected' ? request.decisionTargetType || request.requestedTargetType : request.requestedTargetType,
        request.status === 'rejected' ? request.decisionNormalizedValue || request.requestedNormalizedValue : request.requestedNormalizedValue,
        request.status];
    }
  }
  if (source && classificationResult?.pattern) return ['list', source, classificationResult.pattern];
  return ['host', host];
}

export function scheduleConfirmationContext(config, classification, tabId, url, now = Date.now(), classificationResult = null) {
  if (config?.autonomyConfig?.timeWindowAdvisoryEnabled !== true || !Number.isInteger(tabId)) return null;
  const mode = classification === 'study' ? 'study'
    : ['composite', 'pending_composite', 'unclassified'].includes(classification) ? 'composite'
      : ['restricted', 'rejected'].includes(classification) ? 'rest' : null;
  if (!mode) return null;
  const at = new Date(now), status = getModeWindowStatus(config, mode, at);
  if (status.allowed !== false) return null;
  let host;
  try { const parsed = new URL(url); if (!['http:', 'https:'].includes(parsed.protocol)) return null; host = parsed.hostname; }
  catch { return null; }
  // The gap is bounded by allowed intervals, not by midnight or a periodic check.
  const midnight = new Date(at); midnight.setHours(0, 0, 0, 0);
  const ranges = [];
  for (let offset = -7; offset <= 7; offset++) {
    const day = new Date(midnight); day.setDate(day.getDate() + offset);
    const daily = getModeWindowStatus(config, mode, day);
    if (!daily.windows) { ranges.push([day.getTime(), new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1).getTime()]); continue; }
    for (const range of daily.windows) {
      const start = range.start.split(':').map(Number), end = range.end.split(':').map(Number);
      const a = new Date(day), b = new Date(day);
      a.setHours(start[0], start[1], 0, 0); b.setHours(end[0], end[1], 0, 0);
      if (a < b) ranges.push([a.getTime(), b.getTime()]);
    }
  }
  const before = ranges.filter(r => r[1] <= now).map(r => r[1]);
  const after = ranges.filter(r => r[0] > now).map(r => r[0]);
  const start = before.length ? Math.max(...before) : null;
  const end = after.length ? Math.min(...after) : null;
  const policy = JSON.stringify({ timeWindows: config.timeWindows, schedule: config.schedule,
    enabled: config.autonomyConfig.timeWindowAdvisoryEnabled });
  const ruleIdentity = scheduleConfirmationRuleIdentity(classificationResult, host);
  return { tabId, host, mode, classification, start, end, policy,
    key: JSON.stringify([ruleIdentity, mode, classification, start, end, policy]) };
}
