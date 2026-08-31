export const APP_RUNTIME_AUDIENCE = 'app-runtime-management';
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
