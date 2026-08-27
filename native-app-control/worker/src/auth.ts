import {
  NATIVE_APP_CONTROL_AUDIENCE,
  NATIVE_APP_LIFECYCLE_AUDIENCE,
  type NativeChildLifecycleClaims,
} from '../../contracts/native-app-control';
import { hmacHex, verifyEs256Jwt } from './crypto';
import type { Env, NativeAuth, SantaEnrollmentContext } from './types';

export async function authenticateModule(request: Request, env: Env): Promise<NativeAuth | null> {
  const authorization = request.headers.get('Authorization');
  if (!authorization?.startsWith('Bearer ')) return null;
  const claims = await verifyEs256Jwt(
    authorization.slice(7),
    env.GUARDIAN_NATIVE_APP_PUBLIC_JWK,
    NATIVE_APP_CONTROL_AUDIENCE,
    env.GUARDIAN_BRIDGE_ISSUER || 'guardian-api'
  );
  if (!claims?.account_id || !claims?.child_id || !claims?.sub || !claims?.jti) return null;
  if (claims.sub !== claims.account_id) return null;
  return {
    account_id: String(claims.account_id),
    child_id: String(claims.child_id),
    child_name: claims.child_name ? String(claims.child_name) : undefined,
    sub: String(claims.sub),
    jti: String(claims.jti),
  };
}

export async function authenticateLifecycle(
  request: Request,
  env: Env
): Promise<NativeChildLifecycleClaims | null> {
  const authorization = request.headers.get('Authorization');
  if (!authorization?.startsWith('Bearer ')) return null;
  const claims = await verifyEs256Jwt(
    authorization.slice(7),
    env.GUARDIAN_NATIVE_APP_PUBLIC_JWK,
    NATIVE_APP_LIFECYCLE_AUDIENCE,
    env.GUARDIAN_BRIDGE_ISSUER || 'guardian-api'
  );
  if (claims?.event !== 'child.deleted' || !claims.child_id || !claims.account_id) return null;
  return claims as NativeChildLifecycleClaims;
}

export async function authenticateSanta(
  env: Env,
  endpointId: string,
  secret: string,
  machineId: string
): Promise<SantaEnrollmentContext | null> {
  const row = await env.DB.prepare(`
    SELECT e.id AS enrollment_id, e.native_mac_id, e.secret_hash, e.status,
           e.expires_at, m.child_id, m.santa_machine_hash, m.status AS mac_status,
           m.desired_policy_version, m.downloaded_policy_version, m.applied_policy_version,
           c.account_id
      FROM santa_enrollments_v1 e
      JOIN native_macs_v1 m ON m.id = e.native_mac_id
      JOIN native_children_v1 c ON c.child_id = m.child_id
     WHERE e.endpoint_id = ?
  `).bind(endpointId).first<Record<string, unknown>>();
  if (!row || row.status !== 'active' || row.mac_status !== 'active') return null;
  if (Number(row.expires_at || 0) > 0 && Number(row.expires_at) <= Date.now()) return null;
  const suppliedSecretHash = await hmacHex(env.ENROLLMENT_HASH_SECRET, secret);
  if (suppliedSecretHash !== row.secret_hash) return null;
  const machineHash = await hmacHex(env.MACHINE_ID_HASH_SECRET, machineId);
  if (row.santa_machine_hash && row.santa_machine_hash !== machineHash) return null;
  return {
    enrollmentId: String(row.enrollment_id),
    nativeMacId: String(row.native_mac_id),
    childId: String(row.child_id),
    accountId: String(row.account_id),
    machineHash: row.santa_machine_hash ? String(row.santa_machine_hash) : null,
    status: 'active',
    expiresAt: row.expires_at ? Number(row.expires_at) : null,
    desiredPolicyVersion: Number(row.desired_policy_version || 1),
    downloadedPolicyVersion: Number(row.downloaded_policy_version || 0),
    appliedPolicyVersion: Number(row.applied_policy_version || 0),
  };
}
