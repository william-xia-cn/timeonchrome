export const APP_RUNTIME_AUDIENCE = 'app-runtime-management';
export const APP_RUNTIME_ACCOUNT_AUDIENCE = 'app-runtime-management:account';
export const APP_RUNTIME_LIFECYCLE_AUDIENCE = 'app-runtime-management:lifecycle';
export const APP_RUNTIME_SSO_AUDIENCE = 'app-runtime-management:sso';
export const APP_RUNTIME_CONTRACT_VERSION = '1.0.0';
export const APP_RUNTIME_SSO_ERROR_CODES = [
  'SSO_TICKET_INVALID',
  'SSO_TICKET_REPLAYED',
  'UNAUTHORIZED',
  'SERVER_MISCONFIGURED',
] as const;

export interface AppRuntimeModuleClaims {
  iss: string;
  aud: typeof APP_RUNTIME_AUDIENCE;
  sub: string;
  account_id: string;
  child_id: string;
  child_name: string;
  iat: number;
  exp: number;
  jti: string;
}

export interface AppRuntimeAccountModuleClaims {
  iss: string;
  aud: typeof APP_RUNTIME_ACCOUNT_AUDIENCE;
  sub: string;
  account_id: string;
  children: Array<{ id: string; name: string }>;
  iat: number;
  exp: number;
  jti: string;
}

export interface AppRuntimeChildLifecycleClaims {
  iss: string;
  aud: typeof APP_RUNTIME_LIFECYCLE_AUDIENCE;
  sub: string;
  account_id: string;
  child_id: string;
  event: 'child.deleted';
  iat: number;
  exp: number;
  jti: string;
}

export interface AppRuntimeSsoTicketClaims {
  iss: string;
  aud: typeof APP_RUNTIME_SSO_AUDIENCE;
  sub: string;
  account_id: string;
  children: Array<{ id: string; name: string }>;
  selected_child_id?: string;
  iat: number;
  exp: number;
  jti: string;
}

export interface AppRuntimeSsoLaunchResponse {
  launchUrl: string;
  expiresAt: number;
  audience: typeof APP_RUNTIME_SSO_AUDIENCE;
}

export interface AppRuntimeBrowserSessionResponse {
  token: string;
  tokenType: 'RuntimeSession';
  expiresAt: number;
  children: Array<{ id: string; name: string }>;
  selectedChildId?: string;
}

export type RuntimeMachinePolicyState = 'pending' | 'cached' | 'applied' | 'failed' | 'offline';

/** Receiver capabilities are independent of the child's applied policy version. */
export type RuntimeReceiverCapability = 'heartbeat-os-version-v1' | 'uninstall-operation-receipt-v1';

export type RuntimeOsVersionResult =
  | { ok: true; osVersion: string }
  | { ok: false; code: 'INVALID_REQUEST' | 'HEARTBEAT_VERSION_CONFLICT' };

/** platform comes from authenticated machine state, never the request body. */
export function resolveRuntimeOsVersion(platform: 'windows' | 'macos', input: {
  osVersion?: unknown; windowsVersion?: unknown;
}): RuntimeOsVersionResult {
  const valid = (value: unknown): value is string => typeof value === 'string'
    && value.length >= 1 && value.length <= 128 && value.trim().length > 0
    && !/[\u0000-\u001f\u007f-\u009f]/u.test(value);
  const hasOs = Object.prototype.hasOwnProperty.call(input, 'osVersion');
  const hasWindows = Object.prototype.hasOwnProperty.call(input, 'windowsVersion');
  if ((hasOs && !valid(input.osVersion)) || (hasWindows && !valid(input.windowsVersion))
    || (platform === 'macos' && hasWindows) || (!hasOs && !hasWindows)) {
    return {ok:false,code:'INVALID_REQUEST'};
  }
  if(hasOs && hasWindows && input.osVersion !== input.windowsVersion) {
    return {ok:false,code:'HEARTBEAT_VERSION_CONFLICT'};
  }
  const osVersion=hasOs?input.osVersion:input.windowsVersion;
  return valid(osVersion)?{ok:true,osVersion}:{ok:false,code:'INVALID_REQUEST'};
}

export interface RuntimeUninstallOperationRequest {
  operationId: string;
  code: string;
  /** Lowercase SHA-256 hex of a locally persisted CSPRNG 256-bit secret. */
  confirmationSecretHash: string;
}

/** No machine, account, child or credential fields may be returned. */
export interface RuntimeUninstallOperationReceipt {
  operationId: string;
  status: 'committed';
  revoked: true;
  committedAtMs: number;
}

export const RUNTIME_UNINSTALL_RECEIPT_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export interface RuntimeMachineUserAssignmentV2 {
  localUserId: string;
  assignmentVersion: number;
  childId: string | null;
  protected: boolean;
}

export interface RuntimeMachinePolicyV2 {
  capabilities?: RuntimeReceiverCapability[];
  version: number;
  defaultChildId: string | null;
  users: RuntimeMachineUserAssignmentV2[];
  appPolicies: RuntimeMachineChildAppPolicyV1[];
  loggingPolicy: RuntimeMachineLoggingPolicyV1;
}

export type RuntimeTerminalLogLevel = 'info' | 'warning' | 'error';
export type RuntimeTerminalLogCategory = 'service' | 'session' | 'policy' | 'upload' | 'storage' | 'security' | 'accounting';

export interface RuntimeMachineLoggingPolicyV1 {
  version: number;
  enabled: boolean;
  minLevel: RuntimeTerminalLogLevel;
  categories: RuntimeTerminalLogCategory[];
  expiresAtMs: number | null;
}

export interface RuntimeTerminalLogV1 {
  id: string;
  observedAtMs: number;
  level: RuntimeTerminalLogLevel;
  category: RuntimeTerminalLogCategory;
  eventCode: string;
  module: string;
  messageCode: string;
  details: Record<string, boolean | number | string>;
  serviceVersion: string;
  policyVersion: number;
}

export type RuntimeApplicationClassification =
  | 'study'
  | 'composite'
  | 'restrictedEntertainment'
  | 'unclassified'
  | 'blocked';

export interface RuntimeAppPolicyV1 {
  weekReclassification?: RuntimeWeekReclassification;
  version: number;
  effectiveAtMs: number | null;
  classifications: Array<{
    platform: 'windows' | 'macos';
    runtimeIdentity: string;
    displayName: string | null;
    classification: RuntimeApplicationClassification;
  }>;
  quotas: {
    dailyCategoryMinutes: Record<'study' | 'composite' | 'restrictedEntertainment' | 'unclassified', number | null>;
    weeklyRestrictedEntertainmentMinutes: number | null;
    perApplicationDailyMinutes: Array<{
      platform: 'windows' | 'macos';
      runtimeIdentity: string;
      minutes: number | null;
    }>;
  };
}

export interface RuntimeMachineChildAppPolicyV1 {
  childId: string;
  policy: RuntimeAppPolicyV1;
}

/** Server-approved effective attribution; never mutates an original UsageSegment. */
export interface RuntimeWeekReclassification {
  fromMs: number;
  toMs: number;
  applications: Array<{
    platform: 'windows' | 'macos';
    runtimeIdentity: string;
    classification: RuntimeApplicationClassification;
  }>;
}

export interface RuntimeApplicationCorrectionPage {
  cursor: string;
  hasMore: boolean;
  items: Array<RuntimeWeekReclassification & {
    childId: string;
    policyVersion: number;
    assignments: Array<{ localUserId: string; assignmentVersion: number }>;
  }>;
}
