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
