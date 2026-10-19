// Guardian is the only policy authority. This validator does not project defaults.
import { canonicalSharedAccessPolicyV2 } from './shared-contracts/1.58.0/shared-access.js';

export function validateSharedAccessPolicyV2(value) {
  try {
    const canonical = canonicalSharedAccessPolicyV2(value);
    return { ok: true, policy: JSON.parse(canonical), version: Number(value.revision.slice(15)), canonical };
  } catch (_) { return { ok: false, errorCode: 'shared_access_invalid_policy' }; }
}
