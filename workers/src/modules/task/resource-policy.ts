import type { Env } from '../../db/middleware';
import { json } from '../../db/middleware';
import { applySystemAccessDefaultsToProfileConfig, fallbackSystemAccessConfig, normalizeSystemAccessConfig, SYSTEM_ACCESS_CONFIG_ID } from '../../config/system-access-config';
import { normalizeSiteClassificationRule, resolveSiteAccessClassification, siteDecisionMatchesUrl } from '../../../../extension/core/site-classification.js';
import { normalizeTaskResourceSpec } from './domain';

function parseConfig(value: string | null): Record<string, unknown> {
  if (value === null) return {};
  const result: unknown = JSON.parse(value);
  if (!result || typeof result !== 'object' || Array.isArray(result)) throw new Error('INVALID_CONFIG');
  return result as Record<string, unknown>;
}

// Task admission only. Never changes site classification, usage or quota state.
export async function validateTaskResourcePolicy(env: Env, profileId: string, input: Record<string, unknown>): Promise<Response | null> {
  const normalized = normalizeTaskResourceSpec(input);
  if (!normalized.ok) return json({ code: 'INVALID_TASK', errors: normalized.errors }, 400);
  try {
    const profile = await env.DB.prepare('SELECT config FROM profiles WHERE id = ?').bind(profileId).first<{ config: string | null }>();
    if (!profile) return json({ code: 'TASK_POLICY_UNAVAILABLE' }, 503);
    const system = await env.DB.prepare('SELECT config_json FROM system_access_config_v1 WHERE id = ?')
      .bind(SYSTEM_ACCESS_CONFIG_ID).first<{ config_json: string | null }>();
    const defaults = system ? normalizeSystemAccessConfig(parseConfig(system.config_json)) : fallbackSystemAccessConfig();
    const config = applySystemAccessDefaultsToProfileConfig(parseConfig(profile.config), defaults);
    const blockedRules = (Array.isArray(config.siteClassificationRulesV1) ? config.siteClassificationRulesV1 : [])
      .map(normalizeSiteClassificationRule).filter((rule: any) => rule?.decision === 'blocked');
    const { hosts, urlRules, specialTargets } = normalized.spec;
    const targets = [
      ...hosts.map((value, index) => ({ field: 'hosts', index, value })),
      ...urlRules.map((rule, index) => ({ field: 'urlRules', index, value: rule.url })),
      ...specialTargets.map((target, index) => ({ field: 'specialTargets', index, value: target.canonicalTarget })),
    ];
    const errors = targets.filter(target => {
      if (typeof target.value !== 'string') throw new Error('INVALID_TARGET');
      return blockedRules.some((rule: any) => siteDecisionMatchesUrl(rule, target.value))
        || resolveSiteAccessClassification(config, [], target.value).classification === 'blocked';
    })
      .map(target => ({ ...target, code: 'TASK_RESOURCE_BLOCKED' }));
    return errors.length ? json({ code: 'TASK_RESOURCE_BLOCKED', error: '任务资源包含黑名单对象', errors }, 400) : null;
  } catch {
    // An unreadable policy is not an empty blacklist. Do not expose database errors.
    return json({ code: 'TASK_POLICY_UNAVAILABLE', error: '无法确认网站安全策略，请稍后重试' }, 503);
  }
}
