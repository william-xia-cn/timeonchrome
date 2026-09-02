export const APP_RUNTIME_AUDIENCE = 'app-runtime-management';
export const APP_RUNTIME_ACCOUNT_AUDIENCE = 'app-runtime-management:account';
export const APP_RUNTIME_LIFECYCLE_AUDIENCE = 'app-runtime-management:lifecycle';

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

export type RuntimeMachinePolicyState = 'pending' | 'cached' | 'applied' | 'failed' | 'offline';

export interface RuntimeMachineUserAssignmentV2 {
  localUserId: string;
  assignmentVersion: number;
  childId: string | null;
  protected: boolean;
}

export interface RuntimeMachinePolicyV2 {
  version: number;
  defaultChildId: string | null;
  users: RuntimeMachineUserAssignmentV2[];
  appPolicies: RuntimeMachineChildAppPolicyV1[];
}

export type RuntimeApplicationClassification =
  | 'study'
  | 'composite'
  | 'restrictedEntertainment'
  | 'unclassified'
  | 'blocked';

export interface RuntimeAppPolicyV1 {
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
