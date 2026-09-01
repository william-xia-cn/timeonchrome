export type RuntimePlatform = 'macos' | 'windows';
export type UserActivityState = 'unknown' | 'active' | 'idle';
export type UserSessionState = 'unknown' | 'active' | 'inactive' | 'locked';
export type SystemPowerState = 'unknown' | 'awake' | 'asleep';

export interface ApplicationIdentity {
  platform: RuntimePlatform;
  runtimeIdentity: string;
  displayName?: string | null;
}

export interface RuntimeSnapshot {
  application: ApplicationIdentity | null;
  userActivity: UserActivityState;
  sessionState: UserSessionState;
  powerState: SystemPowerState;
}

export type RuntimeFact =
  | { observedAtMs: number; kind: 'applicationActivated'; application: ApplicationIdentity | null }
  | { observedAtMs: number; kind: 'userActivityChanged'; userActivity: UserActivityState }
  | { observedAtMs: number; kind: 'sessionChanged'; sessionState: UserSessionState }
  | { observedAtMs: number; kind: 'powerChanged'; powerState: SystemPowerState }
  | { observedAtMs: number; kind: 'snapshot'; snapshot: RuntimeSnapshot };

export type SegmentEndReason =
  | 'applicationSwitch'
  | 'userIdle'
  | 'sessionUnavailable'
  | 'systemSleep'
  | 'periodicSnapshot'
  | 'stateCorrection';

export interface UsageSegment {
  id: string;
  runtimeSessionID: string;
  application: ApplicationIdentity;
  startAtMs: number;
  endAtMs: number;
  durationMilliseconds: number;
  endReason: SegmentEndReason;
}

export interface UploadRejection {
  id: string;
  code: string;
}

export interface UploadAcceptance {
  acceptedIds: string[];
  rejected: UploadRejection[];
}

export interface CreateEnrollmentCodeRequest {
  subjectId: string;
  ttlSeconds?: number;
}

export interface CreateEnrollmentCodeResponse {
  code: string;
  expiresAtMs: number;
}

export interface EnrollDeviceRequest {
  code: string;
  platform: RuntimePlatform;
  displayName?: string | null;
}

export interface EnrollDeviceResponse {
  deviceId: string;
  deviceToken: string;
  platform: RuntimePlatform;
}

export interface DeviceSelfResponse {
  deviceId: string;
  subjectId: string;
  platform: RuntimePlatform;
  displayName: string | null;
  createdAtMs: number;
  lastSeenAtMs: number;
  accountId?: string;
  childId?: string;
  revoked?: boolean;
}

export interface ModuleClaims {
  iss: string;
  aud: 'app-runtime-management';
  sub: string;
  account_id: string;
  child_id: string;
  child_name: string;
  iat: number;
  exp: number;
  jti: string;
}

export interface AccountModuleClaims {
  iss: string;
  aud: 'app-runtime-management:account';
  sub: string;
  account_id: string;
  children: Array<{ id: string; name: string }>;
  iat: number;
  exp: number;
  jti: string;
}

export interface MachineSelfResponse {
  machineId: string;
  accountId: string;
  platform: RuntimePlatform;
  displayName: string | null;
  defaultChildId: string | null;
  desiredPolicyVersion: number;
  appliedPolicyVersion: number;
  policyState: 'pending' | 'cached' | 'applied' | 'failed' | 'offline';
  revoked: boolean;
}

export interface MachineSegmentEnvelope {
  localUserId: string;
  assignmentVersion: number;
  segment: UsageSegment;
}

export interface UploadRequest {
  schemaVersion: 1;
  segments: UsageSegment[];
}

export interface ApiErrorResponse {
  error: {
    code: string;
    message: string;
  };
}
