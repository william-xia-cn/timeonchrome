// Explicit D-114 shadow diagnostic. It has no storage, upload, reminder, or access side effects.

import { buildWebSharedQuotaContributionV1 } from '../core/shared-web-contribution.js';
import { inspectWebContributionInSharedStateV1 } from '../core/shared-quota-state.js';
import { requestSharedQuotaState } from './native-host-client.js';

const READ_ERRORS = new Set([
  'managed_marker_unavailable', 'native_host_unavailable', 'native_port_disconnected',
  'native_response_timeout', 'native_post_failed', 'shared_quota_unavailable',
  'shared_quota_invalid_state', 'shared_quota_stale_state', 'shared_quota_busy',
]);

export async function inspectSharedQuotaShadowV1({ snapshot, sourceKey, policyRevision, weekStart,
  readState = requestSharedQuotaState } = {}) {
  const projection = buildWebSharedQuotaContributionV1(snapshot, { sourceKey, policyRevision });
  if (!projection.ok || typeof weekStart !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(weekStart)) {
    return { ok: false, status: 'invalid_input', reasonCode: 'SHADOW_INPUT_INVALID' };
  }
  const contribution = projection.contribution;
  if (!contribution.complete) {
    return { ok: false, status: 'incomplete', reasonCodes: contribution.reasonCodes };
  }
  let read;
  try {
    read = await readState({ date: contribution.date, weekStart, policyRevision });
  } catch (_) {
    return { ok: false, status: 'unavailable', reasonCode: 'shared_quota_unavailable' };
  }
  if (read?.ok !== true) {
    return { ok: false, status: 'unavailable', reasonCode: READ_ERRORS.has(read?.errorCode)
      ? read.errorCode : 'shared_quota_unavailable' };
  }
  const inspection = inspectWebContributionInSharedStateV1(read.state, contribution, { weekStart });
  if (!inspection.ok) {
    const status = inspection.reasonCode === 'SHARED_STATE_INCOMPLETE' ? 'incomplete'
      : inspection.reasonCode === 'shared_quota_stale_state' ? 'stale' : 'mismatch';
    return { ok: false, status, reasonCode: inspection.reasonCode };
  }
  return { ok: true, status: 'matched', webRevision: contribution.revision,
    sharedRevision: read.state.revision };
}
