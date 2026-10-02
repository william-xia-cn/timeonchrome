export const NATIVE_HOST_PROTOCOL_VERSION = 1 as const;
export const BROWSER_BRIDGE_PROTOCOL_VERSION = 2 as const;
export const BROWSER_BRIDGE_V3_PROTOCOL_VERSION = 3 as const;
export const NATIVE_HOST_ID = 'com.timeonchrome.nativehost' as const;
export const LEGACY_NATIVE_HOST_ID = 'com.timeonchrome.guardian' as const;
export const BROWSER_BRIDGE_PIPE_NAME = 'TimeOnChrome.AppRuntime.BrowserBridge.v1' as const;
export const BROWSER_BRIDGE_V2_PIPE_NAME = 'TimeOnChrome.AppRuntime.BrowserBridge.v2' as const;
export const BROWSER_BRIDGE_V3_PIPE_NAME = 'TimeOnChrome.AppRuntime.BrowserBridge.v3' as const;
/** These capabilities never imply shared enforcement is enabled. */
export const SHARED_QUOTA_STATE_READ_CAPABILITY = 'shared-quota-state-read' as const;
export const SHARED_REMINDER_RESULT_SHADOW_CAPABILITY = 'shared-reminder-result-shadow' as const;
export { SHARED_REMINDER_LIFECYCLE_CAPABILITY, SHARED_BROWSER_ACTIVITY_CAPABILITY,
  SHARED_BROWSER_EXECUTION_CAPABILITY } from './shared-reminder-lifecycle.js';

export interface SharedQuotaStateQuery { date: string }

/** Identity and assignment are resolved by the authenticated Service connection. */
export function validateSharedQuotaStateQuery(value: unknown): SharedQuotaStateQuery {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.keys(value).length !== 1 || !Object.hasOwn(value, 'date'))
    throw new Error('INVALID_SHARED_QUOTA_QUERY');
  const date = (value as {date?: unknown}).date;
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date))
    throw new Error('INVALID_SHARED_QUOTA_QUERY');
  const start = Date.parse(`${date}T00:00:00+08:00`);
  if (!Number.isFinite(start) || new Date(start + 28_800_000).toISOString().slice(0, 10) !== date)
    throw new Error('INVALID_SHARED_QUOTA_QUERY');
  return {date};
}

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
  applicationUsage?: ApplicationUsageSnapshot;
  sharedQuota?: import('./shared-access.js').SharedQuotaStateV1;
  /** Read success is not permission to enforce quota or end an application. */
  sharedQuotaStage?: 'shadow';
  sharedReminder?: import('./shared-reminder-lifecycle.js').SharedReminderState | null;
  /** Service-issued scope-bound lease, returned only when its capability is supported. */
  browserActivityLeaseId?: string;
  browserActivityAck?: { leaseId: string; acceptedSequence: number; duplicate: boolean; stale: boolean };
  /** Only an explicit, freshly revalidated permit authorizes the bound webpage. */
  browserExecution?: import('./shared-reminder-lifecycle.js').SharedBrowserExecution | null;
  browserExecutionAck?: { executionId:string;duplicate:boolean };
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
  channel: 'health' | 'statistics' | 'application' | 'sharedQuota';
  requestId: string;
  messageType: 'heartbeat' | 'probe' | 'dailyUsageSnapshot' | 'getApplicationUsage' | 'getSharedQuotaState' | 'reportReminderResult'
    | 'getSharedReminderState' | 'acknowledgeSharedReminderDelivery' | 'resolveSharedReminder' | 'reportBrowserActivity'
    | 'acknowledgeBrowserExecution';
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

/** Local, read-only, settled application usage; never a shared quota result. */
export interface ApplicationUsageQuery {
  fromDate: string;
  toDate: string;
  offset: number;
  expectedRevision?: string;
}
export interface ApplicationUsageHour {
  hour: number;
  totalMs: number;
  categoriesMs: Readonly<Record<string, number>>;
}
export interface ApplicationUsageDay {
  date: string;
  totalMs: number;
  categoriesMs: Readonly<Record<string, number>>;
  hours: readonly ApplicationUsageHour[];
  complete: boolean;
  reasonCodes: readonly string[];
}
export interface ApplicationUsageRow {
  key: string;
  name: string;
  classifications: readonly string[];
  totalMs: number;
  dailyMs: Readonly<Record<string, number>>;
}
export interface ApplicationUsageSnapshot {
  attribution?: {
    complete: boolean;
    productAssociationVersion: string | null;
    classificationCorrectionVersion: number | null;
    reasonCodes: readonly string[];
  };
  fromDate: string;
  toDate: string;
  revision: string;
  computedAtMs: number;
  lastSettledAtMs: number | null;
  complete: boolean;
  reasonCodes: readonly string[];
  totalMs: number;
  days: readonly ApplicationUsageDay[];
  applications: readonly ApplicationUsageRow[];
  nextOffset: number | null;
}
