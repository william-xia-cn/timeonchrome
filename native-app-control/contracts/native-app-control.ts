export const NATIVE_APP_CONTROL_AUDIENCE = 'native-app-control';
export const NATIVE_APP_LIFECYCLE_AUDIENCE = 'native-app-control-lifecycle';

export type NativeAppModuleClaims = {
  iss: string;
  aud: typeof NATIVE_APP_CONTROL_AUDIENCE;
  sub: string;
  account_id: string;
  child_id: string;
  child_name?: string;
  iat: number;
  exp: number;
  jti: string;
};

export type NativeChildLifecycleClaims = {
  iss: string;
  aud: typeof NATIVE_APP_LIFECYCLE_AUDIENCE;
  sub: string;
  account_id: string;
  child_id: string;
  event: 'child.deleted';
  iat: number;
  exp: number;
  jti: string;
};

export type NativeApplicationState = 'REVIEW' | 'IGNORE' | 'BLOCK';

export type SantaSyncStage = 'preflight' | 'eventupload' | 'ruledownload' | 'postflight';
