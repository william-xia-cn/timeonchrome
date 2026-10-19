export const NATIVE_HOST_PROTOCOL_VERSION = 1 as const;
export const BROWSER_BRIDGE_PROTOCOL_VERSION = 2 as const;
export const BROWSER_BRIDGE_V3_PROTOCOL_VERSION = 3 as const;
export const NATIVE_HOST_ID = 'com.timeonchrome.nativehost' as const;
export const BROWSER_BRIDGE_PIPE_NAME = 'TimeOnChrome.AppRuntime.BrowserBridge.v1' as const;
export const BROWSER_BRIDGE_V2_PIPE_NAME = 'TimeOnChrome.AppRuntime.BrowserBridge.v2' as const;
export const BROWSER_BRIDGE_V3_PIPE_NAME = 'TimeOnChrome.AppRuntime.BrowserBridge.v3' as const;
export { APPLICATION_USAGE_SECONDS_READ_CAPABILITY, validateApplicationUsageSecondsQuery,
  validateApplicationUsageSecondsSnapshot } from './application-usage-seconds.js';
export type { ApplicationUsageSecondsQuery, ApplicationUsageSecondsSnapshot } from './application-usage-seconds.js';
export { QUOTA_BUCKETS_READ_CAPABILITY, QUOTA_BUCKETS_EXCHANGE_MESSAGE, validateQuotaBucketsExchange,validateQuotaBucketsSnapshot } from './source-statistics.js';
export type {QuotaBucketsSnapshot,QuotaBucketsQuery,QuotaBucketsDay,QuotaBucketsSeconds} from './source-statistics.js';
export { QUOTA_BUCKETS_SOURCES_CAPABILITY, APPLICATION_QUOTA_SOURCE_STATE_HEADER, validateQuotaBucketsSources } from './source-statistics.js';
export type { QuotaBucketsSources } from './source-statistics.js';
export type { SharedQuotaSecondsDay } from './source-statistics.js';
export { SHARED_FORCED_USE_RUNTIME_V2_CAPABILITY } from './shared-reminder-lifecycle.js';

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
  applicationUsage?: import('./source-statistics.js').QuotaBucketsSnapshot | null;
  /** 能力协商后的来源说明；绝不能与applicationUsage合计再次相加。 */
  applicationSources?: import('./source-statistics.js').QuotaBucketsSources;
  applicationUsageSeconds?: import('./application-usage-seconds.js').ApplicationUsageSecondsSnapshot;
  /** Optional only after capability negotiation; equality is not execution authorization. */
  sharedAccessPolicyIdentity?: import('./shared-access.js').SharedAccessPolicyIdentityV2;
  sharedWebSourceScope?: import('./shared-web-sync.js').SharedWebMachineScopeProofV2;
  /** 通道连接与同孩子身份确认分开，不授权执行。 */
  sharedWebIdentity?: { status: 'verified'; webSourceKey:string; expiresAtMs:number };
  /** Read success is not permission to enforce quota or end an application. */
  sharedQuotaStage?: 'shadow' | 'shared';
  sharedReminder?: import('./shared-reminder-lifecycle.js').SharedReminderStateV2 | null;
  /** Service-issued scope-bound lease, returned only when its capability is supported. */
  browserActivityLeaseId?: string;
  browserActivityAck?: import('./shared-reminder-lifecycle.js').SharedBrowserActivityAckV2;
  /** Only an explicit, freshly revalidated permit authorizes the bound webpage. */
  browserExecution?: import('./shared-reminder-lifecycle.js').SharedBrowserExecutionV2 | null;
  /** 当前执行回执必须对应已确认动作。 */
  browserExecutionAck?: { executionId:string;duplicate:boolean;
    outcome: import('./shared-reminder-lifecycle.js').SharedBrowserExecutionAckV2['outcome'] };
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
  messageType: 'heartbeat' | 'probe' | 'dailyUsageSnapshot' | 'getApplicationUsageSeconds'
    | 'getSharedReminderState' | 'acknowledgeSharedReminderDelivery' | 'resolveSharedReminder' | 'reportBrowserActivity'
    | 'acknowledgeBrowserExecution'
    | 'getSharedWebSourceScope' | 'bindSharedWebSourceV2' | 'exchangeQuotaBuckets';
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
