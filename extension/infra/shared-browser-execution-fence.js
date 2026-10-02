const IDENTITY = ['schemaVersion', 'roundId', 'reminderId', 'deliveryId', 'policyRevision',
  'stateRevision', 'executionId', 'leaseId', 'activityId'];

export async function browserExecutionIdentityHash(value) {
  const fields = Object.hasOwn(value, 'triggerStateRevision') ? [...IDENTITY, 'triggerStateRevision'] : IDENTITY;
  const bytes = new TextEncoder().encode(JSON.stringify(fields.map(key => value[key])));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

// Tokens are process-local: restart, disconnect and durable ACK fence all older work.
export function createBrowserExecutionFence() {
  let generation = {};
  const proofs = new WeakMap();
  return {
    capture: () => generation,
    current: token => token === generation,
    invalidate() { generation = {}; },
    acknowledge(identityHash, executionId, leaseId, outcome) {
      generation = {};
      const proof = Object.freeze({});
      proofs.set(proof, { generation, identityHash, executionId, leaseId, outcome });
      return proof;
    },
    evidence(proof) {
      const evidence = proof && typeof proof === 'object' ? proofs.get(proof) : null;
      return evidence?.generation === generation ? evidence : null;
    },
  };
}

export const browserExecutionFence = createBrowserExecutionFence();
