export const NATIVE_HOST_PROTOCOL_VERSION = 1 as const;
export const BROWSER_BRIDGE_PROTOCOL_VERSION = 2 as const;
export const BROWSER_BRIDGE_V3_PROTOCOL_VERSION = 3 as const;
export const NATIVE_HOST_ID = 'com.timeonchrome.nativehost' as const;
export const LEGACY_NATIVE_HOST_ID = 'com.timeonchrome.guardian' as const;
export const BROWSER_BRIDGE_PIPE_NAME = 'TimeOnChrome.AppRuntime.BrowserBridge.v1' as const;
export const BROWSER_BRIDGE_V2_PIPE_NAME = 'TimeOnChrome.AppRuntime.BrowserBridge.v2' as const;
export const BROWSER_BRIDGE_V3_PIPE_NAME = 'TimeOnChrome.AppRuntime.BrowserBridge.v3' as const;

export type NativeHostMessageType = 'heartbeat' | 'probe' | 'settledUsageSegments';

export interface NativeHostEnvelope<TPayload = unknown> {
  protocolVersion: typeof NATIVE_HOST_PROTOCOL_VERSION;
  requestId: string;
  messageType: NativeHostMessageType;
  extensionId: string;
  profileId: string;
  sentAtMs: number;
  payload: TPayload;
}

export interface SettledBrowserUsageSegment {
  segmentId: string;
  startMs: number;
  endMs: number;
  durationMs: number;
  channel: 'active' | 'backgroundMedia' | 'pip' | 'diagnostic';
  sourceState: string;
  quotaBucket: string | null;
  mode: string | null;
  estimated: boolean;
  diagnostic: boolean;
}

export interface SettledUsageSegmentsPayload {
  segments: SettledBrowserUsageSegment[];
}

export interface NativeHostResponse {
  ok: boolean;
  requestId?: string;
  receivedAt: number;
  errorCode?: string;
  acceptedCount?: number;
  supportedProtocols?: readonly number[];
  capabilities?: readonly string[];
  acceptedIds?: readonly string[];
  duplicateIds?: readonly string[];
  rejected?: readonly BrowserBridgeRejectedSegment[];
  retryAfterMs?: number;
  acceptedRevision?: string;
  duplicate?: boolean;
  stale?: boolean;
}

export type BrowserBridgeChannel = 'health' | 'ledger';
export type BrowserBridgeV2MessageType = 'heartbeat' | 'probe' | 'settledUsageSegments';

export interface BrowserBridgeV2Envelope<TPayload = unknown> {
  protocolVersion: typeof BROWSER_BRIDGE_PROTOCOL_VERSION;
  channel: BrowserBridgeChannel;
  requestId: string;
  messageType: BrowserBridgeV2MessageType;
  extensionId: string;
  profileId: string;
  sentAtMs: number;
  bridgeEpochId?: string;
  batchId?: string;
  payload: TPayload;
}

export interface BrowserBridgeRejectedSegment {
  segmentId: string;
  errorCode: string;
  retryable: boolean;
}

/** Browser-owned, integer-second evidence. It is never an alternative web ledger. */
export interface BrowserUsageEvidenceInterval {
  startMs: number;
  endMs: number;
  creditedSeconds: number;
  quotaBucket: string;
}

export interface BrowserDailyUsageSnapshot {
  date: string;
  snapshotRevision: string;
  statisticsRevision: string;
  correctionRevision: string;
  computedAtMs: number;
  activeSeconds: number;
  quotaBucketSeconds: Readonly<Record<string, number>>;
  complete: boolean;
  incompleteReasonCodes: readonly string[];
  intervals: readonly BrowserUsageEvidenceInterval[];
}

export interface BrowserBridgeV3Envelope<TPayload = unknown> {
  protocolVersion: typeof BROWSER_BRIDGE_V3_PROTOCOL_VERSION;
  channel: 'health' | 'statistics';
  requestId: string;
  messageType: 'heartbeat' | 'probe' | 'dailyUsageSnapshot';
  extensionId: string;
  profileId: string;
  sentAtMs: number;
  payload: TPayload;
}

export interface BrowserDailyUsageSnapshotResponse {
  ok: boolean;
  receivedAt: number;
  requestId?: string;
  errorCode?: string;
  acceptedRevision?: string;
  duplicate?: boolean;
}
