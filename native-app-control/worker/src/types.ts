import type { NativeAppModuleClaims } from '../../contracts/native-app-control';

export interface Env {
  DB: D1Database;
  GUARDIAN_NATIVE_APP_PUBLIC_JWK: string;
  GUARDIAN_BRIDGE_ISSUER?: string;
  ENROLLMENT_HASH_SECRET: string;
  MACHINE_ID_HASH_SECRET: string;
  SANTA_PUBLIC_BASE_URL: string;
  SANTA_BASELINE_RULE_JSON: string;
}

export type NativeAuth = Pick<NativeAppModuleClaims, 'account_id' | 'child_id' | 'child_name' | 'sub' | 'jti'>;

export type SantaEnrollmentContext = {
  enrollmentId: string;
  nativeMacId: string;
  childId: string;
  accountId: string;
  machineHash: string | null;
  status: 'active' | 'revoked';
  expiresAt: number | null;
  desiredPolicyVersion: number;
  downloadedPolicyVersion: number;
  appliedPolicyVersion: number;
};

export type SantaRule = {
  identifier: string;
  policy: 'BLOCKLIST' | 'ALLOWLIST';
  rule_type: 'SIGNINGID' | 'CDHASH' | 'BINARY' | 'TEAMID';
  custom_msg?: string;
};
