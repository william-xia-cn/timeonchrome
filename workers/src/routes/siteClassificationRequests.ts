import { json, Env, verifyAccountToken } from '../db/middleware';
import { matchDomain as matchDomainV12 } from '../../../core/domain-semantics.js';
import {
  decisionToStatus,
  normalizeSiteClassificationDecision,
  normalizeSiteClassificationTarget,
  siteDecisionMatchesUrl,
  siteTargetScopesOverlap,
} from '../../../core/site-classification.js';

async function verifyDeviceToken(env: Env, token: string): Promise<{ profileId: string; deviceId: string } | null> {
  const device = await env.DB.prepare(
    `SELECT id, profile_id FROM devices WHERE device_token = ?`
  ).bind(token).first<{ id: string; profile_id: string }>();
  if (!device?.profile_id) return null;
  await env.DB.prepare(`UPDATE devices SET last_seen = ? WHERE device_token = ?`).bind(Date.now(), token).run();
  return { profileId: device.profile_id, deviceId: device.id };
}

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
  if (!row?.config) return {};
  try {
    return JSON.parse(row.config) || {};
  } catch {
    return {};
  }
}

function getConfiguredClassificationForTarget(config: any, target: any) {
  const rules = Array.isArray(config?.siteClassificationRulesV1) ? config.siteClassificationRulesV1 : [];
  for (const rule of rules) {
    const decision = rule?.decision || rule?.classification;
    if (!decision) continue;
    if (siteTargetScopesOverlap(target, {
      targetType: rule.targetType,
      normalizedValue: rule.normalizedValue || rule.targetValue,
    })) {
      return { classification: decision === 'reject' ? 'rejected' : decision, source: 'siteClassificationRulesV1', rule };
    }
  }
  for (const group of CLASSIFIED_SITE_LIST_FIELDS) {
    for (const key of group.keys) {
      const list = config?.[key];
      if (!Array.isArray(list)) continue;
      for (const item of list) {
        if (typeof item !== 'string' || !item.trim()) continue;
        if (patternOverlapsRequestTarget(item.trim(), target)) {
          return { classification: group.classification, source: key, pattern: item.trim() };
        }
      }
    }
  }
  return null;
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
  }

  await env.DB.prepare(
    `UPDATE profiles SET config = ?, version = version + 1, updated_at = ? WHERE id = ?`
  ).bind(JSON.stringify(config), now, profileId).run();
}

export const siteClassificationRequestsRouter = {
  async handle(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    if (request.method === 'POST' && path === '/device/site-classification-requests/v1') {
      const auth = request.headers.get('Authorization');
      if (!auth?.startsWith('Bearer ')) return json({ error: 'Unauthorized' }, 401);
      const device = await verifyDeviceToken(env, auth.slice(7));
      if (!device) return json({ error: 'Invalid device token' }, 401);

      const body = await request.json<{ requests?: any[] }>().catch(() => ({}));
      const requests = Array.isArray(body?.requests) ? body.requests.slice(0, 200) : [];
      if (requests.length === 0) return json({ error: 'requests array required' }, 400);

      const saved: any[] = [];
      const errors: any[] = [];
      const now = Date.now();
      const profileConfig = await getProfileConfig(env, device.profileId);
      for (const item of requests) {
        const target = normalizeRequestInput(item);
        if (!target.ok) {
          errors.push({ id: item?.id || null, code: target.code || 'INVALID_TARGET' });
          continue;
        }
        const configured = getConfiguredClassificationForTarget(profileConfig, target);
        if (configured) {
          errors.push({
            id: item?.id || null,
            code: configured.classification === 'rejected' ? 'REQUEST_REJECTED' : 'ALREADY_CLASSIFIED',
            classifiedAs: configured.classification,
            source: configured.source,
          });
          continue;
        }
        const rejected = await findRejectedMatch(env, device.profileId, target);
        if (rejected) {
          errors.push({ id: item?.id || null, code: 'REQUEST_REJECTED', rejectedId: rejected.id });
          continue;
        }
        const existing = await env.DB.prepare(
          `SELECT * FROM site_classification_requests_v1
           WHERE profile_id = ? AND requested_target_type = ? AND requested_normalized_value = ?`
        ).bind(device.profileId, target.targetType, target.normalizedValue).first<any>();
        if (existing) {
          saved.push(rowToResponse(existing));
          continue;
        }
        const id = crypto.randomUUID();
        await env.DB.prepare(
          `INSERT INTO site_classification_requests_v1
           (id, profile_id, device_id, client_request_id, requested_target_type, requested_raw_input,
            requested_normalized_value, requested_host, display_value, status, requested_at, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?)`
        ).bind(
          id, device.profileId, device.deviceId, item.id || item.clientRequestId || null,
          target.targetType, item.requestedRawInput || target.rawInput,
          target.normalizedValue, target.host || null, target.displayValue,
          Number(item.requestedAt || 0) || now, now, now
        ).run();
        const inserted = await env.DB.prepare(`SELECT * FROM site_classification_requests_v1 WHERE id = ?`).bind(id).first<any>();
        if (inserted) saved.push(rowToResponse(inserted));
      }

      return json({ success: errors.length === 0, saved: saved.length, requests: saved, errors });
    }

    if (request.method === 'GET' && path === '/device/site-classification-requests/v1') {
      const auth = request.headers.get('Authorization');
      if (!auth?.startsWith('Bearer ')) return json({ error: 'Unauthorized' }, 401);
      const device = await verifyDeviceToken(env, auth.slice(7));
      if (!device) return json({ error: 'Invalid device token' }, 401);
      const result = await env.DB.prepare(
        `SELECT * FROM site_classification_requests_v1
         WHERE profile_id = ?
         ORDER BY requested_at DESC
         LIMIT 500`
      ).bind(device.profileId).all<any>();
      return json({ requests: (result.results || []).map(rowToResponse) });
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
      const body = await request.json<{ decision?: string; targetType?: string; targetValue?: string }>().catch(() => ({}));
      const decision = normalizeSiteClassificationDecision(body?.decision);
      if (!decision) return json({ error: 'invalid decision' }, 400);
      const target = normalizeSiteClassificationTarget(body?.targetValue || '');
      if (!target.ok) return json({ error: target.error || 'invalid target', code: target.code || 'INVALID_TARGET' }, 400);
      if (body?.targetType && body.targetType !== target.targetType) return json({ error: 'target type mismatch' }, 400);

      const existing = await env.DB.prepare(
        `SELECT * FROM site_classification_requests_v1 WHERE id = ? AND profile_id = ?`
      ).bind(requestId, profileId).first<any>();
      if (!existing) return json({ error: 'Request not found' }, 404);

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
