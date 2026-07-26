import { json, Env, verifyAccountToken } from '../db/middleware';
import { matchDomain as matchDomainV12 } from '../../../extension/core/domain-semantics.js';
import {
  decisionToStatus,
  normalizeSiteClassificationDecision,
  normalizeSiteClassificationTarget,
  resolveSiteAccessClassification,
  siteDecisionMatchesUrl,
  siteTargetScopesOverlap,
} from '../../../extension/core/site-classification.js';
import { deviceUnboundResponse, verifyDeviceToken } from './deviceIdentity';
import { applySystemAccessDefaultsToProfileConfig, getSystemAccessConfig } from '../config/system-access-config';

async function verifyProfileOwner(request: Request, env: Env, profileId: string): Promise<string | null> {
  const accountId = await verifyAccountToken(request, env.JWT_SECRET);
  if (!accountId) return null;
  const profile = await env.DB.prepare(
    `SELECT id FROM profiles WHERE id = ? AND account_id = ?`
  ).bind(profileId, accountId).first<{ id: string }>();
  return profile?.id || null;
}

function rowToResponse(row: any) {
  return {
    id: row.id,
    profileId: row.profile_id,
    deviceId: row.device_id,
    clientRequestId: row.client_request_id,
    requestedTargetType: row.requested_target_type,
    requestedRawInput: row.requested_raw_input,
    requestedNormalizedValue: row.requested_normalized_value,
    requestedHost: row.requested_host,
    displayValue: row.display_value,
    recordSource: row.record_source || 'legacy',
    requestedClassification: row.requested_classification || null,
    manualRequestedAt: row.manual_requested_at || null,
    firstObservedAt: row.first_observed_at || null,
    lastObservedAt: row.last_observed_at || null,
    observationCount: Number(row.observation_count || 0),
    status: row.status,
    decision: row.decision,
    decisionTargetType: row.decision_target_type,
    decisionNormalizedValue: row.decision_normalized_value,
    requestedAt: row.requested_at,
    decidedAt: row.decided_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function normalizeRequestInput(input: any) {
  const requestedTargetType = input?.requestedTargetType || input?.targetType;
  const raw = input?.requestedNormalizedValue || input?.requestedRawInput || input?.input || input?.targetValue;
  const normalized = normalizeSiteClassificationTarget(raw);
  if (!normalized.ok) return normalized;
  if (requestedTargetType && requestedTargetType !== normalized.targetType) {
    return { ok: false, code: 'TARGET_TYPE_MISMATCH', error: 'target type mismatch' };
  }
  return normalized;
}

type SiteClassificationUploadItem = {
  id?: string;
  clientRequestId?: string;
  requestedTargetType?: string;
  targetType?: string;
  requestedRawInput?: string;
  requestedNormalizedValue?: string;
  input?: string;
  targetValue?: string;
  requestedAt?: number;
  recordSource?: string;
  requestedClassification?: string | null;
  manualRequestedAt?: number | null;
  observationSourceId?: string | null;
  sourceObservationCount?: number;
  sourceFirstObservedAt?: number | null;
  sourceLastObservedAt?: number | null;
};

type ObservationAggregateRow = {
  first_observed_at: number | null;
  last_observed_at: number | null;
  observation_count: number | null;
};
const SITE_CLASSIFICATION_RECORD_SOURCES = new Set([
  'auto_unclassified_access',
  'manual_learning_request',
  'legacy',
]);

function normalizeRecordSource(value: unknown): string {
  return typeof value === 'string' && SITE_CLASSIFICATION_RECORD_SOURCES.has(value)
    ? value
    : 'legacy';
}

function normalizeRequestedClassification(value: unknown): 'study' | null | undefined {
  if (value == null || value === '') return null;
  if (value === 'study') return 'study';
  return undefined;
}

function normalizePositiveInteger(value: unknown): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? Math.floor(numeric) : 0;
}

function normalizePositiveTimestamp(value: unknown): number | null {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
}

async function mergeRequestMetadata(
  env: Env,
  requestId: string,
  item: SiteClassificationUploadItem,
  recordSource: string,
  requestedClassification: 'study' | null,
  now: number,
) {
  const manualRequestedAt = requestedClassification === 'study'
    ? normalizePositiveTimestamp(item.manualRequestedAt) || now
    : null;
  await env.DB.prepare(
    `UPDATE site_classification_requests_v1
     SET record_source = CASE
           WHEN ? = 'study' THEN 'manual_learning_request'
           WHEN record_source IS NULL OR record_source = 'legacy' THEN ?
           ELSE record_source
         END,
         requested_classification = CASE
           WHEN ? = 'study' THEN 'study'
           ELSE requested_classification
         END,
         manual_requested_at = CASE
           WHEN ? = 'study' THEN MAX(COALESCE(manual_requested_at, 0), ?)
           ELSE manual_requested_at
         END,
         updated_at = ?
     WHERE id = ?`
  ).bind(
    requestedClassification,
    recordSource,
    requestedClassification,
    requestedClassification,
    manualRequestedAt || 0,
    now,
    requestId,
  ).run();
}

async function mergeObservationSummary(
  env: Env,
  requestId: string,
  profileId: string,
  deviceId: string,
  item: SiteClassificationUploadItem,
  now: number,
) {
  const observationSourceId = typeof item.observationSourceId === 'string'
    ? item.observationSourceId.trim().slice(0, 200)
    : '';
  const observationCount = normalizePositiveInteger(item.sourceObservationCount);
  if (!observationSourceId || observationCount === 0) return;

  const firstObservedAt = normalizePositiveTimestamp(item.sourceFirstObservedAt) || now;
  const lastObservedAt = normalizePositiveTimestamp(item.sourceLastObservedAt) || firstObservedAt;
  await env.DB.prepare(
    `INSERT INTO site_classification_observation_counters_v1
       (request_id, profile_id, device_id, observation_source_id, observation_count,
        first_observed_at, last_observed_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(request_id, observation_source_id) DO UPDATE SET
       device_id = excluded.device_id,
       observation_count = MAX(observation_count, excluded.observation_count),
       first_observed_at = MIN(first_observed_at, excluded.first_observed_at),
       last_observed_at = MAX(last_observed_at, excluded.last_observed_at),
       updated_at = excluded.updated_at`
  ).bind(
    requestId,
    profileId,
    deviceId,
    observationSourceId,
    observationCount,
    firstObservedAt,
    lastObservedAt,
    now,
    now,
  ).run();

  const aggregate = await env.DB.prepare(
    `SELECT MIN(first_observed_at) AS first_observed_at,
            MAX(last_observed_at) AS last_observed_at,
            SUM(observation_count) AS observation_count
     FROM site_classification_observation_counters_v1
     WHERE request_id = ? AND profile_id = ?`
  ).bind(requestId, profileId).first<ObservationAggregateRow>();
  await env.DB.prepare(
    `UPDATE site_classification_requests_v1
     SET first_observed_at = ?, last_observed_at = ?, observation_count = ?, updated_at = ?
     WHERE id = ? AND profile_id = ?`
  ).bind(
    aggregate?.first_observed_at || null,
    aggregate?.last_observed_at || null,
    Number(aggregate?.observation_count || 0),
    now,
    requestId,
    profileId,
  ).run();
}
const CLASSIFIED_SITE_LIST_FIELDS = [
  { keys: ['unsafeList', 'blacklist', 'defaultBlockedSites', 'customBlockedSites', 'defaultUnsafeSites', 'customUnsafeSites'], classification: 'blocked' },
  { keys: ['restrictedEntertainmentList', 'defaultRestrictedEntertainmentSites', 'customRestrictedEntertainmentList'], classification: 'restricted' },
  { keys: ['studyList', 'defaultStudySites', 'customStudyList'], classification: 'study' },
  { keys: ['compositeList', 'defaultCompositeSites', 'customCompositeList'], classification: 'composite' },
  { keys: ['restList', 'entertainmentList', 'defaultRestSites', 'customRestList'], classification: 'rest' },
];

function normalizeHostPatternBase(pattern: string) {
  const raw = String(pattern || '').trim().toLowerCase().replace(/\.+$/g, '');
  if (!raw) return null;
  const value = raw.startsWith('*.') ? raw.slice(2) : raw;
  try {
    return new URL(`http://${value}`).hostname.toLowerCase().replace(/\.+$/g, '') || null;
  } catch {
    return null;
  }
}

function patternOverlapsRequestTarget(pattern: string, target: any) {
  const base = normalizeHostPatternBase(pattern);
  if (!base || !target?.host) return false;
  if (target.targetType === 'url') {
    return matchDomainV12(target.host, pattern);
  }
  return matchDomainV12(target.host, pattern) || matchDomainV12(base, target.normalizedValue);
}

async function getProfileConfig(env: Env, profileId: string): Promise<any> {
  const row = await env.DB.prepare(`SELECT config FROM profiles WHERE id = ?`).bind(profileId).first<{ config: string }>();
  const siteAccessDefaults = await getSystemAccessConfig(env);
  try {
    return applySystemAccessDefaultsToProfileConfig(row?.config ? JSON.parse(row.config) : {}, siteAccessDefaults);
  } catch {
    return applySystemAccessDefaultsToProfileConfig({}, siteAccessDefaults);
  }
}

function getConfiguredClassificationForTarget(config: any, target: any) {
  const lookupValue = target?.targetType === 'url' ? target.normalizedValue : target?.host;
  const resolved = resolveSiteAccessClassification(config || {}, [], lookupValue);
  return resolved.classification ? resolved : null;
}

async function findRejectedMatch(env: Env, profileId: string, target: any) {
  const rejected = await env.DB.prepare(
    `SELECT *
     FROM site_classification_requests_v1
     WHERE profile_id = ? AND status = 'rejected'
     ORDER BY decided_at DESC
     LIMIT 500`
  ).bind(profileId).all<any>();
  const lookup = target.targetType === 'url' ? target.normalizedValue : target.host;
  return (rejected.results || []).find((row: any) =>
    siteDecisionMatchesUrl({
      decisionTargetType: row.decision_target_type || row.requested_target_type,
      decisionNormalizedValue: row.decision_normalized_value || row.requested_normalized_value,
    }, lookup)
  ) || null;
}

function sameHostRule(a: string, b: string) {
  return matchDomainV12(a, b) && matchDomainV12(b, a);
}

function addUniqueHost(list: string[] = [], host: string) {
  if (list.some((item) => sameHostRule(item, host))) return list;
  return [...list, host];
}

function removeHost(list: string[] = [], host: string) {
  return list.filter((item) => !sameHostRule(item, host));
}

async function applyDecisionToProfileConfig(env: Env, profileId: string, requestId: string, decision: string, target: any, now: number) {
  if (decision === 'return') return;
  const row = await env.DB.prepare(`SELECT config FROM profiles WHERE id = ?`).bind(profileId).first<{ config: string }>();
  const config = row?.config ? JSON.parse(row.config) : {};
  const rules = Array.isArray(config.siteClassificationRulesV1) ? config.siteClassificationRulesV1 : [];
  const nextRules = rules.filter((rule: any) => rule?.requestId !== requestId);
  nextRules.push({
    id: `scr_rule_${requestId}`,
    requestId,
    targetType: target.targetType,
    targetValue: target.normalizedValue,
    normalizedValue: target.normalizedValue,
    decision,
    createdAt: now,
    updatedAt: now,
  });
  config.siteClassificationRulesV1 = nextRules;

  if (target.targetType === 'host' && decision === 'study') {
    config.customCompositeList = removeHost(config.customCompositeList || [], target.normalizedValue);
    config.compositeList = removeHost(config.compositeList || [], target.normalizedValue);
    config.customStudyList = addUniqueHost(config.customStudyList || [], target.normalizedValue);
    config.studyList = addUniqueHost(config.studyList || [], target.normalizedValue);
  } else if (target.targetType === 'host' && decision === 'composite') {
    config.customStudyList = removeHost(config.customStudyList || [], target.normalizedValue);
    config.studyList = removeHost(config.studyList || [], target.normalizedValue);
    config.customCompositeList = addUniqueHost(config.customCompositeList || [], target.normalizedValue);
    config.compositeList = addUniqueHost(config.compositeList || [], target.normalizedValue);
  } else if (target.targetType === 'host' && decision === 'reject') {
    config.customStudyList = removeHost(config.customStudyList || [], target.normalizedValue);
    config.studyList = removeHost(config.studyList || [], target.normalizedValue);
    config.customCompositeList = removeHost(config.customCompositeList || [], target.normalizedValue);
    config.compositeList = removeHost(config.compositeList || [], target.normalizedValue);
    config.customRestList = removeHost(config.customRestList || [], target.normalizedValue);
    config.restList = removeHost(config.restList || [], target.normalizedValue);
    config.entertainmentList = removeHost(config.entertainmentList || [], target.normalizedValue);
    config.customRestrictedEntertainmentList = addUniqueHost(config.customRestrictedEntertainmentList || [], target.normalizedValue);
    config.restrictedEntertainmentList = addUniqueHost(config.restrictedEntertainmentList || [], target.normalizedValue);
  }

  await env.DB.prepare(
    `UPDATE profiles SET config = ?, version = version + 1, updated_at = ? WHERE id = ?`
  ).bind(JSON.stringify(config), now, profileId).run();
}


type UsedUnclassifiedSiteRow = {
  raw_domain: string | null;
  first_seen_at: number | null;
  last_seen_at: number | null;
  total_seconds: number | null;
  visit_count: number | null;
};

function normalizeObservedHost(value: unknown): string | null {
  let raw = String(value || '').trim().toLowerCase();
  if (!raw) return null;
  raw = raw.replace(/^(host|domain|fallback|url):/i, '');
  raw = raw.replace(/^https?:\/\//i, '').replace(/\/.*$/g, '').replace(/\.+$/g, '');
  if (!raw || raw.includes(' ') || raw.includes('@') || raw.startsWith('chrome')) return null;
  try {
    const host = new URL(`http://${raw}`).hostname.toLowerCase().replace(/\.+$/g, '');
    if (!host || !host.includes('.') || !/^[a-z0-9.-]+$/.test(host)) return null;
    return host.startsWith('www.') ? host.slice(4) : host;
  } catch {
    return null;
  }
}

function listForSiteManagementClassification(classification: string): string | null {
  if (classification === 'study') return 'customStudyList';
  if (classification === 'composite') return 'customCompositeList';
  if (classification === 'restricted') return 'customRestrictedEntertainmentList';
  if (classification === 'blocked') return 'customBlockedSites';
  return null;
}

function publicClassificationToDecision(classification: string): string | null {
  if (classification === 'study') return 'study';
  if (classification === 'composite') return 'composite';
  if (classification === 'restricted' || classification === 'blocked') return 'reject';
  return null;
}

function removeHostFromAllProfileCustomLists(config: any, host: string) {
  config.customStudyList = removeHost(config.customStudyList || [], host);
  config.studyList = removeHost(config.studyList || [], host);
  config.customCompositeList = removeHost(config.customCompositeList || [], host);
  config.compositeList = removeHost(config.compositeList || [], host);
  config.customRestrictedEntertainmentList = removeHost(config.customRestrictedEntertainmentList || [], host);
  config.restrictedEntertainmentList = removeHost(config.restrictedEntertainmentList || [], host);
  config.customBlockedSites = removeHost(config.customBlockedSites || [], host);
  config.unsafeList = removeHost(config.unsafeList || [], host);
}

function addHostToProfileCustomList(config: any, classification: string, host: string) {
  const listKey = listForSiteManagementClassification(classification);
  if (!listKey) return false;
  removeHostFromAllProfileCustomLists(config, host);
  config[listKey] = addUniqueHost(config[listKey] || [], host);
  if (classification === 'study') config.studyList = addUniqueHost(config.studyList || [], host);
  if (classification === 'composite') config.compositeList = addUniqueHost(config.compositeList || [], host);
  if (classification === 'restricted') config.restrictedEntertainmentList = addUniqueHost(config.restrictedEntertainmentList || [], host);
  if (classification === 'blocked') config.unsafeList = addUniqueHost(config.unsafeList || [], host);
  return true;
}

async function getRawProfileConfig(env: Env, profileId: string): Promise<any> {
  const row = await env.DB.prepare(`SELECT config FROM profiles WHERE id = ?`).bind(profileId).first<{ config: string }>();
  try { return row?.config ? JSON.parse(row.config) : {}; } catch { return {}; }
}

async function getPendingRequestsByHost(env: Env, profileId: string): Promise<Map<string, any[]>> {
  const result = await env.DB.prepare(
    `SELECT * FROM site_classification_requests_v1
     WHERE profile_id = ? AND status = 'pending'
     ORDER BY requested_at DESC
     LIMIT 500`
  ).bind(profileId).all<any>();
  const byHost = new Map<string, any[]>();
  for (const row of result.results || []) {
    const host = normalizeObservedHost(row.requested_host || row.requested_normalized_value || row.display_value);
    if (!host) continue;
    const list = byHost.get(host) || [];
    list.push(row);
    byHost.set(host, list);
  }
  return byHost;
}

async function closeMatchingPendingRequests(env: Env, profileId: string, host: string, classification: string, now: number): Promise<string[]> {
  const decision = publicClassificationToDecision(classification);
  if (!decision) return [];
  const status = decisionToStatus(decision);
  const pending = await getPendingRequestsByHost(env, profileId);
  const matches = Array.from(pending.entries())
    .filter(([requestHost]) => sameHostRule(requestHost, host))
    .flatMap(([, rows]) => rows);
  const closed: string[] = [];
  for (const row of matches) {
    const targetType = row.requested_target_type || 'host';
    const targetValue = row.requested_normalized_value || host;
    await env.DB.prepare(
      `UPDATE site_classification_requests_v1
       SET status = ?, decision = ?, decision_target_type = ?, decision_normalized_value = ?,
           decided_at = ?, updated_at = ?
       WHERE id = ? AND profile_id = ? AND status = 'pending'`
    ).bind(status, decision, targetType, targetValue, now, now, row.id, profileId).run();
    closed.push(row.id);
  }
  return closed;
}

async function listUsedUnclassifiedSites(request: Request, env: Env, profileId: string): Promise<Response> {
  if (!(await verifyProfileOwner(request, env, profileId))) return json({ error: 'Profile not found' }, 404);
  const url = new URL(request.url);
  const days = Math.min(90, Math.max(1, Number(url.searchParams.get('days') || 30) || 30));
  const since = Date.now() - days * 24 * 60 * 60 * 1000;
  const config = await getProfileConfig(env, profileId);
  const pendingByHost = await getPendingRequestsByHost(env, profileId);
  const rows = await env.DB.prepare(
    `SELECT COALESCE(NULLIF(fallback_domain, ''), NULLIF(managed_target_label_at_time, ''),
                     NULLIF(managed_target_value, ''), NULLIF(target_key, '')) AS raw_domain,
            MIN(first_seen_at) AS first_seen_at,
            MAX(last_seen_at) AS last_seen_at,
            SUM(duration_seconds) AS total_seconds,
            SUM(segments_count) AS visit_count
     FROM target_stats_v1
     WHERE profile_id = ?
       AND COALESCE(last_seen_at, updated_at, 0) >= ?
       AND (
         target_classification_at_time IN ('pending_composite', 'unclassified')
         OR quota_bucket = 'composite'
         OR is_fallback = 1
       )
     GROUP BY raw_domain
     ORDER BY MAX(last_seen_at) DESC
     LIMIT 500`
  ).bind(profileId, since).all<UsedUnclassifiedSiteRow>();

  const seen = new Set<string>();
  const sites: any[] = [];
  for (const row of rows.results || []) {
    const domain = normalizeObservedHost(row.raw_domain);
    if (!domain || seen.has(domain)) continue;
    seen.add(domain);
    const pendingRows = Array.from(pendingByHost.entries())
      .filter(([requestHost]) => sameHostRule(requestHost, domain))
      .flatMap(([, values]) => values);
    const resolved = resolveSiteAccessClassification(config || {}, pendingRows.map(rowToResponse), domain);
    if (resolved.classification && resolved.classification !== 'pending_composite') continue;
    sites.push({
      domain,
      firstSeenAt: Number(row.first_seen_at || 0) || null,
      lastSeenAt: Number(row.last_seen_at || 0) || null,
      totalSeconds: Number(row.total_seconds || 0),
      visitCount: Number(row.visit_count || 0),
      pendingRequestId: pendingRows[0]?.id || null,
      currentClassification: resolved.classification || 'unclassified',
    });
  }
  return json({ ok: true, days, sites });
}

async function classifyUsedUnclassifiedSite(request: Request, env: Env, profileId: string): Promise<Response> {
  if (!(await verifyProfileOwner(request, env, profileId))) return json({ error: 'Profile not found' }, 404);
  const body = await request.json<{ domain?: string; classification?: string }>().catch(() => ({} as { domain?: string; classification?: string }));
  const domain = normalizeObservedHost(body?.domain);
  const classification = String(body?.classification || '').trim();
  const listKey = listForSiteManagementClassification(classification);
  if (!domain || !listKey) return json({ error: 'invalid domain or classification' }, 400);

  const effective = await getProfileConfig(env, profileId);
  const pendingByHost = await getPendingRequestsByHost(env, profileId);
  const matchingPending = Array.from(pendingByHost.entries())
    .filter(([requestHost]) => sameHostRule(requestHost, domain))
    .flatMap(([, rows]) => rows);
  const resolved = resolveSiteAccessClassification(effective || {}, matchingPending.map(rowToResponse), domain);
  if (resolved.classification && resolved.classification !== 'pending_composite') {
    return json({ ok: true, alreadyClassified: true, domain, currentClassification: resolved.classification });
  }

  const now = Date.now();
  const config = await getRawProfileConfig(env, profileId);
  addHostToProfileCustomList(config, classification, domain);
  const closedRequestIds = await closeMatchingPendingRequests(env, profileId, domain, classification, now);
  await env.DB.prepare(
    `UPDATE profiles SET config = ?, version = version + 1, updated_at = ? WHERE id = ?`
  ).bind(JSON.stringify(config), now, profileId).run();
  const refreshed = await getProfileConfig(env, profileId);
  return json({ ok: true, domain, classification, listKey, closedRequestIds, config: refreshed });
}
export const siteClassificationRequestsRouter = {
  async handle(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    if (request.method === 'POST' && path === '/device/site-classification-requests/v1') {
      const auth = request.headers.get('Authorization');
      if (!auth?.startsWith('Bearer ')) return json({ error: 'Unauthorized' }, 401);
      const device = await verifyDeviceToken(env, auth.slice(7), { updateLastSeen: true });
      if (!device) return json({ error: 'Invalid device token' }, 401);
      if (device.unbound) return deviceUnboundResponse(device.deviceId);

      const body = await request.json<{ requests?: SiteClassificationUploadItem[] }>()
        .catch(() => ({} as { requests?: SiteClassificationUploadItem[] }));
      const requests = Array.isArray(body?.requests) ? body.requests.slice(0, 200) : [];
      if (requests.length === 0) return json({ error: 'requests array required' }, 400);

      const saved: ReturnType<typeof rowToResponse>[] = [];
      const errors: Array<Record<string, unknown>> = [];
      const now = Date.now();
      const profileConfig = await getProfileConfig(env, device.profileId);
      for (const item of requests) {
        let requestedClassification = normalizeRequestedClassification(item.requestedClassification);
        if (requestedClassification === undefined) {
          errors.push({ id: item.id || null, code: 'INVALID_REQUESTED_CLASSIFICATION' });
          continue;
        }
        let recordSource = normalizeRecordSource(item.recordSource);
        if (requestedClassification === 'study' || recordSource === 'manual_learning_request') {
          requestedClassification = 'study';
          recordSource = 'manual_learning_request';
        }
        const target = normalizeRequestInput(item);
        if (!target.ok) {
          errors.push({ id: item.id || null, code: target.code || 'INVALID_TARGET' });
          continue;
        }
        const configured = getConfiguredClassificationForTarget(profileConfig, target);
        if (configured) {
          errors.push({
            id: item.id || null,
            code: configured.classification === 'rejected' ? 'REQUEST_REJECTED' : 'ALREADY_CLASSIFIED',
            classifiedAs: configured.classification,
            source: configured.source,
          });
          continue;
        }
        const rejected = await findRejectedMatch(env, device.profileId, target);
        if (rejected) {
          errors.push({ id: item.id || null, code: 'REQUEST_REJECTED', rejectedId: rejected.id });
          continue;
        }
        const existing = await env.DB.prepare(
          `SELECT * FROM site_classification_requests_v1
           WHERE profile_id = ? AND requested_target_type = ? AND requested_normalized_value = ?
             AND status != 'returned'
           ORDER BY requested_at DESC
           LIMIT 1`
        ).bind(device.profileId, target.targetType, target.normalizedValue).first<any>();
        if (existing) {
          await mergeRequestMetadata(env, existing.id, item, recordSource, requestedClassification, now);
          await mergeObservationSummary(env, existing.id, device.profileId, device.deviceId, item, now);
          const updated = await env.DB.prepare(
            `SELECT * FROM site_classification_requests_v1 WHERE id = ?`
          ).bind(existing.id).first<any>();
          if (updated) saved.push(rowToResponse(updated));
          continue;
        }

        const id = crypto.randomUUID();
        const manualRequestedAt = requestedClassification === 'study'
          ? normalizePositiveTimestamp(item.manualRequestedAt) || now
          : null;
        await env.DB.prepare(
          `INSERT INTO site_classification_requests_v1
           (id, profile_id, device_id, client_request_id, requested_target_type, requested_raw_input,
            requested_normalized_value, requested_host, display_value, status, record_source,
            requested_classification, manual_requested_at, requested_at, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?)`
        ).bind(
          id,
          device.profileId,
          device.deviceId,
          item.id || item.clientRequestId || null,
          target.targetType,
          item.requestedRawInput || target.rawInput,
          target.normalizedValue,
          target.host || null,
          target.displayValue,
          recordSource,
          requestedClassification,
          manualRequestedAt,
          Number(item.requestedAt || 0) || now,
          now,
          now,
        ).run();
        await mergeObservationSummary(env, id, device.profileId, device.deviceId, item, now);
        const inserted = await env.DB.prepare(
          `SELECT * FROM site_classification_requests_v1 WHERE id = ?`
        ).bind(id).first<any>();
        if (inserted) saved.push(rowToResponse(inserted));
      }

      return json({ success: errors.length === 0, saved: saved.length, requests: saved, errors });
    }

    if (request.method === 'GET' && path === '/device/site-classification-requests/v1') {
      const auth = request.headers.get('Authorization');
      if (!auth?.startsWith('Bearer ')) return json({ error: 'Unauthorized' }, 401);
      const device = await verifyDeviceToken(env, auth.slice(7), { updateLastSeen: true });
      if (!device) return json({ error: 'Invalid device token' }, 401);
      const result = await env.DB.prepare(
        `SELECT * FROM site_classification_requests_v1
         WHERE profile_id = ?
         ORDER BY requested_at DESC
         LIMIT 500`
      ).bind(device.profileId).all<any>();
      return json({ requests: (result.results || []).map(rowToResponse) });
    }

    const usedUnclassifiedMatch = path.match(/^\/profiles\/([^/]+)\/used-unclassified-sites\/v1$/);
    if (request.method === 'GET' && usedUnclassifiedMatch) {
      return listUsedUnclassifiedSites(request, env, usedUnclassifiedMatch[1]);
    }
    if (request.method === 'POST' && usedUnclassifiedMatch) {
      return classifyUsedUnclassifiedSite(request, env, usedUnclassifiedMatch[1]);
    }
    const listMatch = path.match(/^\/profiles\/([^/]+)\/site-classification-requests\/v1$/);
    if (request.method === 'GET' && listMatch) {
      const profileId = listMatch[1];
      if (!(await verifyProfileOwner(request, env, profileId))) return json({ error: 'Profile not found' }, 404);
      const status = url.searchParams.get('status') || 'pending';
      const where = ['profile_id = ?'];
      const binds: any[] = [profileId];
      if (status !== 'all') {
        where.push('status = ?');
        binds.push(status);
      }
      const result = await env.DB.prepare(
        `SELECT * FROM site_classification_requests_v1
         WHERE ${where.join(' AND ')}
         ORDER BY requested_at DESC
         LIMIT 500`
      ).bind(...binds).all<any>();
      return json({ requests: (result.results || []).map(rowToResponse) });
    }

    const decisionMatch = path.match(/^\/profiles\/([^/]+)\/site-classification-requests\/([^/]+)\/decision$/);
    if (request.method === 'POST' && decisionMatch) {
      const profileId = decisionMatch[1];
      const requestId = decisionMatch[2];
      if (!(await verifyProfileOwner(request, env, profileId))) return json({ error: 'Profile not found' }, 404);
      const body = await request.json<{ decision?: string; targetType?: string; targetValue?: string }>()
        .catch(() => ({} as { decision?: string; targetType?: string; targetValue?: string }));
      const decision = normalizeSiteClassificationDecision(body?.decision);
      if (!decision) return json({ error: 'invalid decision' }, 400);
      const existing = await env.DB.prepare(
        `SELECT * FROM site_classification_requests_v1 WHERE id = ? AND profile_id = ?`
      ).bind(requestId, profileId).first<any>();
      if (!existing) return json({ error: 'Request not found' }, 404);

      const targetValue = body?.targetValue ||
        existing.decision_normalized_value ||
        existing.requested_normalized_value ||
        '';
      const target = normalizeSiteClassificationTarget(targetValue);
      if (!target.ok) return json({ error: target.error || 'invalid target', code: target.code || 'INVALID_TARGET' }, 400);
      if (body?.targetType && body.targetType !== target.targetType) return json({ error: 'target type mismatch' }, 400);

      const now = Date.now();
      const status = decisionToStatus(decision);
      await env.DB.prepare(
        `UPDATE site_classification_requests_v1
         SET status = ?, decision = ?, decision_target_type = ?, decision_normalized_value = ?,
             decided_at = ?, updated_at = ?
         WHERE id = ? AND profile_id = ?`
      ).bind(status, decision, target.targetType, target.normalizedValue, now, now, requestId, profileId).run();
      await applyDecisionToProfileConfig(env, profileId, requestId, decision, target, now);
      const updated = await env.DB.prepare(`SELECT * FROM site_classification_requests_v1 WHERE id = ?`).bind(requestId).first<any>();
      return json({ success: true, request: rowToResponse(updated) });
    }

    return json({ error: 'Not found' }, 404);
  },
};
