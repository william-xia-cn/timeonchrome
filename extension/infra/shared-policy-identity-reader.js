import { validateSharedAccessPolicyV1 } from '../core/shared-access-policy.js';
import { validateSharedAccessPolicyIdentityV1 } from '../core/shared-quota-state.js';
import { readSharedAccessPolicyContext, readSharedAccessPolicyLkg } from './shared-access-policy-reader.js';
import { requestSharedQuotaState } from './native-host-client.js';

const result = (status, errorCode = null) => ({ ok: status === 'matched', policyIdentityStatus: status, errorCode, executionEnabled: false });
const digest = async text => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)))].map(n => n.toString(16).padStart(2, '0')).join('');

export function createSharedPolicyIdentityReader({ enabled = false, readContext = readSharedAccessPolicyContext,
  readPolicy = readSharedAccessPolicyLkg, request = requestSharedQuotaState } = {}) {
  let busy = false;
  async function capture() {
    const context = await readContext();
    const fields = ['apiBase', 'deviceId', 'childId', 'deviceToken'];
    if (!context || !fields.every(key => typeof context[key] === 'string' && context[key])) throw Error('identity');
    const response = await readPolicy(), checked = response?.ok && validateSharedAccessPolicyV1(response.policy);
    if (!checked?.ok) throw Error('policy');
    return { scope: await digest(JSON.stringify(fields.map(key => context[key]))), policy: checked.policy,
      policyHash: await digest(checked.canonical) };
  }
  return { async inspect({ date, weekStart } = {}) {
    if (!enabled) return result('unverified', 'shared_policy_identity_disabled');
    if (busy) return result('unverified', 'shared_policy_identity_busy');
    busy = true;
    try {
      const before = await capture();
      const response = await request({ date, weekStart, policyRevision: before.policy.revision });
      const after = await capture();
      if (before.scope !== after.scope || before.policyHash !== after.policyHash) return result('unverified', 'shared_policy_identity_changed');
      if (!response?.ok || response.policyIdentityStatus !== 'available' || response.sharedAccessPolicyIdentity == null) {
        return result('unverified', 'shared_policy_identity_unavailable');
      }
      const checked = validateSharedAccessPolicyIdentityV1(response.sharedAccessPolicyIdentity);
      if (!checked.ok) return result('unverified', checked.errorCode);
      const identity = checked.identity;
      const matched = response.state?.policyRevision === before.policy.revision && identity.revision === before.policy.revision
        && identity.effectiveAtMs === before.policy.effectiveAtMs && identity.stage === before.policy.stage
        && identity.policyHash === before.policyHash;
      return result(matched ? 'matched' : 'mismatch', matched ? null : 'shared_policy_identity_mismatch');
    } catch (_) { return result('unverified', 'shared_policy_identity_read_failed'); }
    finally { busy = false; }
  } };
}

// Explicit preparation only: no production caller enables this comparison.
export function inspectSharedPolicyIdentity(query, { enabled = false } = {}) {
  return createSharedPolicyIdentityReader({ enabled }).inspect(query);
}
