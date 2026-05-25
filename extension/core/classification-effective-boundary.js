// core/classification-effective-boundary.js
// Applies a foreground ledger boundary when site classification rules become effective.

import {
  extractDomain,
  getConfig,
  getSiteClassificationRequestRecords,
} from '../infra/storage.js';
import {
  normalizeSiteClassificationRequest,
  resolveSiteAccessClassification,
} from './site-classification.js';
import {
  managedTargetSnapshotFields,
  resolveManagedTargetAttribution,
} from './managed-targets.js';
import {
  getSession as getTimingSession,
  transitionStateAt,
} from '../runtime/session.js';
import { logFallbackEventBestEffort } from '../infra/client-logs.js';

const APPROVED_STATUS_TO_CLASSIFICATION = {
  approved_study: 'study',
  approved_composite: 'composite',
  rejected: 'rejected',
};

function isHttpUrl(url = '') {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

function sameValue(a, b) {
  return (a ?? null) === (b ?? null);
}

function normalizedDecisionTarget(record = {}) {
  const normalized = normalizeSiteClassificationRequest(record);
  if (!normalized) return null;
  const targetType = normalized.decisionTargetType || normalized.requestedTargetType;
  const normalizedValue = normalized.decisionNormalizedValue || normalized.requestedNormalizedValue;
  if (!targetType || !normalizedValue) return null;
  return { targetType, normalizedValue };
}

function targetLookupValue(target = {}) {
  return target.targetType === 'url' ? target.normalizedValue : target.normalizedValue;
}

function sessionTargetDiffers(session = {}, nextFields = {}) {
  const keys = [
    'managedTargetId',
    'managedTargetType',
    'managedTargetNamespace',
    'managedTargetValue',
    'targetSourceAtTime',
    'targetRuleId',
    'targetMatchLevel',
    'targetClassificationAtTime',
  ];
  return keys.some((key) => !sameValue(session[key], nextFields[key]));
}

async function getFocusedHttpTab() {
  const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true }).catch(() => []);
  const tab = tabs && tabs[0] ? tabs[0] : null;
  if (!tab?.id || !isHttpUrl(tab.url || '')) return null;
  return tab;
}

export async function logApprovedClassificationRulesMissing({ source = 'classification_sync' } = {}) {
  const [config, records] = await Promise.all([
    getConfig().catch(() => ({})),
    getSiteClassificationRequestRecords({ includeAll: true }).catch(() => []),
  ]);
  const missing = [];
  for (const raw of Array.isArray(records) ? records : []) {
    const record = normalizeSiteClassificationRequest(raw);
    const expected = APPROVED_STATUS_TO_CLASSIFICATION[record?.status];
    if (!expected || record.status === 'rejected') continue;
    const target = normalizedDecisionTarget(record);
    if (!target) continue;
    const resolved = resolveSiteAccessClassification(config, [], targetLookupValue(target));
    if (resolved.classification !== expected) {
      missing.push({
        requestId: record.id || null,
        status: record.status,
        expected,
        resolved: resolved.classification || null,
        targetType: target.targetType,
        targetValue: target.normalizedValue,
      });
    }
  }
  if (missing.length > 0) {
    await logFallbackEventBestEffort({
      level: 'warning',
      category: 'access',
      eventCode: 'site_classification_approved_rule_missing',
      module: 'core/classification-effective-boundary',
      reason: 'approved_request_without_effective_rule',
      message: 'Approved site classification request exists without a matching effective rule',
      details: { source, count: missing.length, samples: missing.slice(0, 5) },
    });
  }
  return { ok: true, missingCount: missing.length };
}

export async function applyClassificationEffectiveBoundaryForActiveTab({
  source = 'classification_sync',
  nowMs = Date.now(),
} = {}) {
  const tab = await getFocusedHttpTab();
  if (!tab) return { ok: true, applied: false, reason: 'no_focused_http_tab' };

  const session = await getTimingSession().catch(() => null);
  if (!session?.state || session.state !== 'ACTIVE' || !session.startTime) {
    return { ok: true, applied: false, reason: 'no_open_foreground_session' };
  }

  if (Number.isInteger(session.tabId) && session.tabId !== tab.id) {
    return { ok: true, applied: false, reason: 'session_tab_mismatch' };
  }
  if (Number.isInteger(session.windowId) && Number.isInteger(tab.windowId) && session.windowId !== tab.windowId) {
    return { ok: true, applied: false, reason: 'session_window_mismatch' };
  }

  const domain = extractDomain(tab.url || '');
  if (!domain || session.domain !== domain) {
    return { ok: true, applied: false, reason: 'session_domain_mismatch', domain, sessionDomain: session.domain || null };
  }

  const [config, requests] = await Promise.all([
    getConfig().catch(() => ({})),
    getSiteClassificationRequestRecords({ includeAll: true }).catch(() => []),
  ]);
  const attribution = resolveManagedTargetAttribution(config, requests, tab.url || domain);
  const nextFields = managedTargetSnapshotFields(attribution, session.quotaBucketAtTime || session.mode || null);
  if (!sessionTargetDiffers(session, nextFields)) {
    return { ok: true, applied: false, reason: 'target_snapshot_unchanged' };
  }

  await transitionStateAt('ACTIVE', domain, nowMs, 'classification_effective_boundary', {
    tabId: Number.isInteger(tab.id) ? tab.id : null,
    windowId: Number.isInteger(tab.windowId) ? tab.windowId : null,
    url: tab.url,
    eventUrl: tab.url,
    observedUrl: tab.url,
    domainResolutionReason: 'classification_effective_boundary',
  });

  return {
    ok: true,
    applied: true,
    reason: 'classification_effective_boundary',
    source,
    domain,
    tabId: tab.id,
    previousTargetClassification: session.targetClassificationAtTime || null,
    nextTargetClassification: nextFields.targetClassificationAtTime || null,
    previousTargetId: session.managedTargetId || null,
    nextTargetId: nextFields.managedTargetId || null,
  };
}

export async function runClassificationSyncEffects({
  source = 'classification_sync',
  recheckActiveTab = null,
} = {}) {
  const [boundaryResult, missingRuleResult] = await Promise.all([
    applyClassificationEffectiveBoundaryForActiveTab({ source }).catch((err) => ({
      ok: false,
      error: err?.message || String(err),
    })),
    logApprovedClassificationRulesMissing({ source }).catch((err) => ({
      ok: false,
      error: err?.message || String(err),
    })),
  ]);
  let recheckResult = null;
  if (typeof recheckActiveTab === 'function') {
    try {
      recheckResult = await recheckActiveTab();
    } catch (err) {
      recheckResult = { ok: false, error: err?.message || String(err) };
      await logFallbackEventBestEffort({
        level: 'warning',
        category: 'access',
        eventCode: 'classification_effective_recheck_failed',
        module: 'core/classification-effective-boundary',
        reason: 'classification_effective_recheck_failed',
        message: err?.message || 'Active tab recheck failed after classification sync',
        details: { source },
      });
    }
  }
  return { ok: boundaryResult?.ok !== false, boundaryResult, missingRuleResult, recheckResult };
}
