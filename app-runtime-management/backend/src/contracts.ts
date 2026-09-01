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

export type AccountingFactKind =
  | 'foregroundChanged'
  | 'userActivityChanged'
  | 'sessionChanged'
  | 'powerChanged'
  | 'pipChanged'
  | 'mediaChanged'
  | 'checkpoint'
  | 'clockAdjusted'
  | 'recovery';

export type UsageChannel = 'active' | 'pipActive' | 'diagnostic';
export type ActivityBasis =
  | 'foregroundInteraction'
  | 'foregroundStrongMedia'
  | 'pipStrongMedia'
  | 'estimatedCheckpoint'
  | 'estimatedBackfill'
  | 'estimatedRecovery'
  | 'diagnostic';
export type WindowPresentationState = 'unknown' | 'visible' | 'hidden' | 'minimized';
export type MediaEvidenceLevel = 'none' | 'weak' | 'strong';
export type MediaPlaybackState = 'unknown' | 'playing' | 'paused' | 'stopped';
export type MediaKind = 'audio' | 'video';
export type MediaPresentation = 'foreground' | 'background' | 'pip';

export interface AccountingRuntimeSnapshot {
  foregroundApplication: ApplicationIdentity | null;
  foregroundWindowState: WindowPresentationState;
  foregroundMediaEvidence: MediaEvidenceLevel;
  foregroundPlaybackState: MediaPlaybackState;
  userActivity: UserActivityState;
  sessionState: UserSessionState;
  powerState: SystemPowerState;
}

export interface AccountingRuntimeFact {
  schemaVersion: 2;
  wallTimeMs: number;
  monotonicTimeMs: number;
  clockEpochId: string;
  kind: AccountingFactKind;
  application?: ApplicationIdentity | null;
  userActivity?: UserActivityState;
  sessionState?: UserSessionState;
  powerState?: SystemPowerState;
  windowState?: WindowPresentationState;
  mediaEvidence?: MediaEvidenceLevel;
  playbackState?: MediaPlaybackState;
  pipState?: 'inactive' | 'active';
  mediaKind?: MediaKind;
  mediaPresentation?: MediaPresentation;
  confirmation?: 'confirmed' | 'failed';
  snapshot?: AccountingRuntimeSnapshot;
  newClockEpochId?: string;
  diagnosticHint?: string | null;
}

export interface EstimatedMetadata {
  isEstimated: boolean;
  reason: string | null;
  cappedAtMilliseconds: number | null;
}

export interface AccountingPolicySnapshot {
  assignmentVersion: number | null;
  quotaBucket: string | null;
}

export type AccountingSegmentEndReason =
  | SegmentEndReason
  | 'pipEnded'
  | 'mediaStopped'
  | 'checkpointUnconfirmed'
  | 'serviceRecovery'
  | 'clockAdjustment'
  | 'lateFact'
  | 'diagnostic';

export interface AccountingUsageSegment {
  id: string;
  schemaVersion: 2;
  runtimeSessionID: string;
  application: ApplicationIdentity | null;
  channel: UsageChannel;
  activityBasis: ActivityBasis;
  clockEpochId: string;
  startWallTimeMs: number;
  endWallTimeMs: number;
  startMonotonicTimeMs: number;
  endMonotonicTimeMs: number;
  monotonicDurationMilliseconds: number;
  endReason: AccountingSegmentEndReason;
  estimated: EstimatedMetadata;
  lastEvidenceWallTimeMs: number | null;
  lastEvidenceMonotonicTimeMs: number | null;
  diagnostic: boolean;
  diagnosticCode: string | null;
  diagnosticMessage?: string | null;
  policySnapshot: AccountingPolicySnapshot | null;
}

export interface AccountingMediaSegment {
  id: string;
  schemaVersion: 2;
  runtimeSessionID: string;
  application: ApplicationIdentity;
  mediaKind: MediaKind;
  presentation: MediaPresentation;
  clockEpochId: string;
  startWallTimeMs: number;
  endWallTimeMs: number;
  startMonotonicTimeMs: number;
  endMonotonicTimeMs: number;
  monotonicDurationMilliseconds: number;
  endReason: AccountingSegmentEndReason;
  estimated: EstimatedMetadata;
  lastEvidenceWallTimeMs: number;
  lastEvidenceMonotonicTimeMs: number;
  authoritativeForUsage: false;
}

export interface AccountingUsageUploadRequest {
  schemaVersion: 2;
  segments: AccountingUsageSegment[];
}

export interface AccountingMediaUploadRequest {
  schemaVersion: 2;
  segments: AccountingMediaSegment[];
}

export interface AccountingUsageEnvelope {
  localUserId: string;
  assignmentVersion: number;
  segment: AccountingUsageSegment;
}

export interface AccountingMediaEnvelope {
  localUserId: string;
  assignmentVersion: number;
  segment: AccountingMediaSegment;
}

export interface AccountingReadModelResponse {
  mainUsageTotalMs: number;
  applications: Array<{
    runtimeIdentity: string;
    displayName: string | null;
    activeMs: number;
    pipActiveMs: number;
    unionMs: number;
  }>;
  estimated: { segmentCount: number; durationMs: number };
  diagnostic: { segmentCount: number };
  mediaPlaybackTotalMs: number;
  media: Array<{
    runtimeIdentity: string;
    displayName: string | null;
    audioMs: number;
    videoMs: number;
  }>;
  lastSyncAtMs: number | null;
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
