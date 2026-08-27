import { authenticateSanta } from './auth';
import { hmacHex } from './crypto';
import { compileSantaRules, parseBaselineRule } from './policy';
import { readSantaJsonObject } from './requestBody';
import {
  bindSantaMachine,
  loadBlockedPolicy,
  markPostflight,
  markRuleDownload,
  observeSantaEvents,
} from './repository';
import type { Env } from './types';

const SANTA_ROUTE = /^\/santa\/v1\/([^/]+)\/([^/]+)\/(preflight|eventupload|ruledownload|postflight)\/([^/]+)$/;

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

export async function handleSantaRequest(request: Request, env: Env): Promise<Response | null> {
  const match = new URL(request.url).pathname.match(SANTA_ROUTE);
  if (!match) return null;
  if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  const [, endpointId, secret, stage, machineId] = match;
  const context = await authenticateSanta(env, endpointId, secret, machineId);
  if (!context) return json({ error: 'invalid_or_revoked_enrollment' }, 401);
  const body = await readSantaJsonObject(request);

  if (!context.machineHash && stage !== 'preflight') {
    return json({ error: 'preflight_required' }, 409);
  }

  if (stage === 'preflight') {
    const machineHash = await hmacHex(env.MACHINE_ID_HASH_SECRET, machineId);
    await bindSantaMachine(env, context, machineHash, body);
    const requiresCleanSync = context.downloadedPolicyVersion !== context.desiredPolicyVersion
      || context.appliedPolicyVersion !== context.desiredPolicyVersion;
    return json({
      client_mode: 'MONITOR',
      full_sync_interval_seconds: 60,
      batch_size: 20,
      enable_bundles: true,
      enable_all_event_upload: true,
      enable_clean_sync_event_upload: true,
      sync_type: requiresCleanSync ? 'CLEAN' : 'NORMAL',
      clean_sync: requiresCleanSync,
      policy_version: context.desiredPolicyVersion,
    });
  }

  if (stage === 'eventupload') {
    const events = Array.isArray(body.events) ? body.events : [];
    const result = await observeSantaEvents(env, context, events);
    return json({
      accepted: result.accepted,
      rejected: result.rejected,
      event_upload_bundle_binaries: result.bundleBinaryRequests,
    });
  }

  if (stage === 'ruledownload') {
    const requiresCleanSync = context.appliedPolicyVersion !== context.desiredPolicyVersion;
    if (!requiresCleanSync) {
      return json({ rules: [], sync_type: 'NORMAL', policy_version: context.desiredPolicyVersion });
    }
    let baseline;
    try {
      baseline = parseBaselineRule(env.SANTA_BASELINE_RULE_JSON);
    } catch (error) {
      return json({ error: error instanceof Error ? error.message : 'baseline_rule_invalid' }, 503);
    }
    const policy = await loadBlockedPolicy(env, context.childId);
    const rules = compileSantaRules(policy.applications, policy.publishers, baseline);
    await markRuleDownload(env, context.nativeMacId, context.desiredPolicyVersion);
    return json({
      rules,
      sync_type: 'CLEAN',
      policy_version: context.desiredPolicyVersion,
    });
  }

  const appliedVersion = Number(body.policy_version || context.downloadedPolicyVersion || 0);
  await markPostflight(env, context.nativeMacId, appliedVersion);
  return json({ success: true, policy_version: appliedVersion });
}
