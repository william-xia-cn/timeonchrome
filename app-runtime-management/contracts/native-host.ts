export const NATIVE_HOST_PROTOCOL_VERSION = 1 as const;
export const NATIVE_HOST_ID = 'com.timeonchrome.nativehost' as const;
export const LEGACY_NATIVE_HOST_ID = 'com.timeonchrome.guardian' as const;
export const BROWSER_BRIDGE_PIPE_NAME = 'TimeOnChrome.AppRuntime.BrowserBridge.v1' as const;

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
}
