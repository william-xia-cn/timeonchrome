// infra/cloud-failure-incident.js — fixed-size, privacy-safe cloud failure dedupe state

export const CLOUD_FAILURE_INCIDENT_WINDOW_MS = 30 * 60 * 1000;
export const CLOUD_FAILURE_INCIDENT_MAX_ACTIVE = 8;

function safeToken(value, fallback = 'unknown') {
  const token = String(value || '').trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '_');
  return (token || fallback).slice(0, 64);
}

export function normalizeCloudFailureCode(error) {
  if (Number.isInteger(error?.status) && error.status >= 400 && error.status <= 599) return `http_${error.status}`;
  const raw = String(error?.message || error || 'unknown_error').trim().toLowerCase();
  if (/^(?:http_\d{3}|fetch_failed|request_aborted|request_timeout|retry_exhausted|unknown_error|upload_missing_ack|segment_rejected)$/.test(raw)) {
    return raw;
  }
  const http = raw.match(/(?:http(?:\s+error)?[:\s_-]*|status[:\s_-]*)(\d{3})/);
  if (http) return `http_${http[1]}`;
  if (/\b503\b|service unavailable/.test(raw)) return 'http_503';
  if (/\b429\b|too many requests/.test(raw)) return 'http_429';
  if (/\b400\b|bad request/.test(raw)) return 'http_400';
  if (/abort|aborted/.test(raw)) return 'request_aborted';
  if (/timed?\s*out|timeout/.test(raw)) return 'request_timeout';
  if (/failed to fetch|fetch failed|networkerror|network error|network request failed/.test(raw)) return 'fetch_failed';
  if (/retry exhausted/.test(raw)) return 'retry_exhausted';
  return 'unknown_error';
}

export function makeCloudFailureFingerprint({ scope, level, error }) {
  return `${safeToken(scope)}:${safeToken(level, 'warning')}:${normalizeCloudFailureCode(error)}`;
}

const safeId = value => typeof value === 'string' && /^[a-zA-Z0-9_:-]{1,128}$/.test(value) ? value : null;
const safeCode = value => typeof value === 'string' && /^[A-Z][A-Z0-9_]{1,63}$/.test(value) ? value : null;
export function safeUploadFailureEvidence({ requestId, batchId, endpoint, body, status, response } = {}) {
  const knownEndpoints = ['usage-segments', 'media-segments', 'stats', 'hourly-stats', 'target-stats', 'hourly-target-stats',
    'media-stats', 'hourly-media-stats', 'client-logs', 'site-classification-requests', 'config', 'heartbeat', 'quota-state'];
  const route = String(endpoint || '').split('?')[0].split('/').find(part => knownEndpoints.includes(part)) || 'other';
  const segments = Array.isArray(body?.segments) ? body.segments : [];
  const ids = segments.map(s => s?.id);
  const accepted = Array.isArray(response?.acceptedIds) ? response.acceptedIds : [];
  const rejected = Array.isArray(response?.rejected) ? response.rejected : [];
  const fields = ['id', 'date', 'startMs', 'endMs', 'durationSeconds', 'domain', 'channel', 'mode', 'mediaClass'];
  return {
    requestId: safeId(requestId), batchId: safeId(batchId), endpoint: route,
    httpStatus: Number.isInteger(status) ? status : null,
    serverCode: safeCode(response?.code),
    date: /^\d{4}-\d{2}-\d{2}$/.test(body?.date || segments[0]?.date || '') ? body?.date || segments[0].date : null,
    requestedCount: ids.length || body?.logs?.length || null,
    rejected: rejected.slice(0, 5).map(item => ({
      id: safeId(item?.id), code: safeCode(item?.code),
      fields: fields.filter(field => String(item?.message || '').includes(field)).join(','),
      reason: /endMs must be > startMs/.test(item?.message || '') ? 'non_positive_range'
        : /required/.test(item?.message || '') ? 'required' : /must be|invalid/.test(item?.message || '') ? 'invalid_field' : 'unspecified',
    })),
    missingAckIds: Array.isArray(response?.acceptedIds) || Array.isArray(response?.rejected)
      ? ids.filter(id => !accepted.includes(id) && !rejected.some(r => r?.id === id)).slice(0, 5).map(safeId)
      : [],
  };
}

function normalizeState(state) {
  return {
    schemaVersion: 1,
    active: state?.active && typeof state.active === 'object' ? { ...state.active } : {},
    lastResolution: state?.lastResolution && typeof state.lastResolution === 'object'
      ? { ...state.lastResolution }
      : null,
  };
}

export function advanceCloudFailureIncident(state, input, now = Date.now()) {
  const next = normalizeState(state);
  const fingerprint = makeCloudFailureFingerprint(input || {}) + (input?.evidence?.serverCode ? ':' + safeCode(input.evidence.serverCode) : '');
  const previous = next.active[fingerprint];
  const shouldLog = !previous || now - Number(previous.lastLoggedAt || 0) >= CLOUD_FAILURE_INCIDENT_WINDOW_MS;
  const record = {
    fingerprint,
    scope: safeToken(input?.scope),
    level: safeToken(input?.level, 'warning'),
    code: normalizeCloudFailureCode(input?.error),
    eventCode: safeToken(input?.eventCode, 'cloud_failure'),
    firstAt: Number(previous?.firstAt || now),
    lastAt: now,
    lastLoggedAt: shouldLog ? now : Number(previous?.lastLoggedAt || now),
    count: Math.max(0, Number(previous?.count || 0)) + 1,
    firstEvidence: previous?.firstEvidence || input?.evidence || null,
  };
  next.active[fingerprint] = record;

  const ordered = Object.values(next.active)
    .sort((a, b) => Number(b.lastAt || 0) - Number(a.lastAt || 0))
    .slice(0, CLOUD_FAILURE_INCIDENT_MAX_ACTIVE);
  next.active = Object.fromEntries(ordered.map((item) => [item.fingerprint, item]));
  return { state: next, record, shouldLog };
}

export function resolveCloudFailureIncidents(state, now = Date.now()) {
  const current = normalizeState(state);
  const active = Object.values(current.active);
  if (active.length === 0) return { state: current, resolved: false, summary: null };
  const summary = {
    resolvedAt: now,
    incidentCount: active.length,
    occurrenceCount: active.reduce((sum, item) => sum + Number(item.count || 0), 0),
    firstAt: Math.min(...active.map((item) => Number(item.firstAt || now))),
    lastAt: Math.max(...active.map((item) => Number(item.lastAt || now))),
    fingerprints: active.map(item => item.fingerprint),
  };
  return {
    state: { schemaVersion: 1, active: {}, lastResolution: summary },
    resolved: true,
    summary,
  };
}
