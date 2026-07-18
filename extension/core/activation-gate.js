import { getPrivacyConsent, hasPrivacyConsent } from './privacy-consent.js';
import { readManagedDeploymentMarker } from './deployment-mode.js';

export const ACTIVATION_MODE_DISABLED = 'disabled';
export const ACTIVATION_MODE_USER_CONSENT = 'user_consent';
export const ACTIVATION_MODE_MANAGED_POLICY = 'managed_policy';

export const MANAGED_POLICY_KEYS = [
  'enabled',
  'deploymentMode',
  'cloudEndpoint',
  'managedDeviceToken',
  'managedDeviceLabel',
  'managedProfileEmail',
  'allowIdentityRecovery',
  // Legacy recovery anchors. Kept only for older managed policy templates.
  'tenantId',
  'devicePolicyId',
];

function asTrimmedString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeEmail(value) {
  return asTrimmedString(value).toLowerCase();
}

function hasManagedPolicyValue(raw) {
  if (!raw || typeof raw !== 'object') return false;
  return MANAGED_POLICY_KEYS.some((key) => Object.prototype.hasOwnProperty.call(raw, key));
}

function normalizeHttpsEndpoint(value) {
  const endpoint = asTrimmedString(value);
  if (!endpoint) return '';
  try {
    const url = new URL(endpoint);
    return url.protocol === 'https:' ? url.toString().replace(/\/$/, '') : '';
  } catch {
    return '';
  }
}

export function normalizeManagedActivationPolicy(raw = null) {
  if (!hasManagedPolicyValue(raw)) {
    return {
      configured: false,
      active: false,
      reason: 'managed_policy_not_configured',
      policy: null,
    };
  }

  const enabled = raw?.enabled === true;
  const deploymentMode = asTrimmedString(raw?.deploymentMode);
  const cloudEndpoint = normalizeHttpsEndpoint(raw?.cloudEndpoint);
  const managedDeviceToken = asTrimmedString(raw?.managedDeviceToken);
  const managedDeviceLabel = asTrimmedString(raw?.managedDeviceLabel);
  const managedProfileEmail = normalizeEmail(raw?.managedProfileEmail);
  const allowIdentityRecovery = raw?.allowIdentityRecovery !== false;
  // Legacy recovery anchors. They do not make a managed policy active by themselves
  // unless no managedDeviceToken is configured and old templates are still deployed.
  const tenantId = asTrimmedString(raw?.tenantId);
  const devicePolicyId = asTrimmedString(raw?.devicePolicyId);
  const policy = {
    enabled,
    deploymentMode,
    cloudEndpoint,
    managedDeviceToken,
    managedDeviceLabel,
    managedProfileEmail,
    allowIdentityRecovery,
    tenantId,
    devicePolicyId,
  };

  if (!enabled) {
    return { configured: true, active: false, reason: 'managed_policy_disabled', policy };
  }
  if (deploymentMode !== 'managed') {
    return { configured: true, active: false, reason: 'managed_policy_not_managed', policy };
  }
  if (!cloudEndpoint || (!managedDeviceToken && (!tenantId || !devicePolicyId))) {
    return { configured: true, active: false, reason: 'managed_policy_malformed', policy };
  }

  return { configured: true, active: true, reason: null, policy };
}

export async function readManagedActivationPolicy() {
  const chromeApi = globalThis.chrome;
  if (!chromeApi?.storage?.managed?.get) {
    return { available: false, raw: null, error: 'managed_storage_unavailable' };
  }

  return await new Promise((resolve) => {
    try {
      chromeApi.storage.managed.get(MANAGED_POLICY_KEYS, (raw) => {
        const lastError = chromeApi.runtime?.lastError;
        if (lastError) {
          resolve({
            available: false,
            raw: null,
            error: lastError.message || 'managed_storage_read_failed',
          });
          return;
        }
        resolve({ available: true, raw: raw || {}, error: null });
      });
    } catch (err) {
      resolve({
        available: false,
        raw: null,
        error: err?.message || 'managed_storage_read_failed',
      });
    }
  });
}

async function readChromeProfileEmailForManagedGate() {
  const chromeApi = globalThis.chrome;
  if (!chromeApi?.identity?.getProfileUserInfo) {
    return { ok: false, email: '', reason: 'managed_profile_identity_unavailable' };
  }

  return await new Promise((resolve) => {
    try {
      chromeApi.identity.getProfileUserInfo({ accountStatus: 'ANY' }, (info) => {
        const lastError = chromeApi.runtime?.lastError;
        if (lastError) {
          resolve({ ok: false, email: '', reason: 'managed_profile_identity_read_failed', error: lastError.message || null });
          return;
        }
        const email = normalizeEmail(info?.email);
        if (!email) {
          resolve({ ok: false, email: '', reason: 'managed_profile_email_mismatch' });
          return;
        }
        resolve({ ok: true, email, reason: null });
      });
    } catch (err) {
      resolve({ ok: false, email: '', reason: 'managed_profile_identity_read_failed', error: err?.message || String(err) });
    }
  });
}

async function resolveManagedProfileEmailGate(policy) {
  const expectedEmail = normalizeEmail(policy?.managedProfileEmail);
  if (!expectedEmail) {
    return { required: false, matches: true, reason: null, hasCurrentProfileEmail: false };
  }

  const current = await readChromeProfileEmailForManagedGate();
  if (!current.ok || current.email !== expectedEmail) {
    return {
      required: true,
      matches: false,
      reason: 'managed_profile_email_mismatch',
      expectedEmail,
      hasCurrentProfileEmail: !!current.email,
      identityReason: current.reason || null,
      error: current.error || null,
    };
  }

  return {
    required: true,
    matches: true,
    reason: null,
    expectedEmail,
    hasCurrentProfileEmail: true,
  };
}

function buildManagedPolicyStatus(managed, managedRead, profileGate = null) {
  return {
    configured: managed.configured,
    active: managed.active && profileGate?.matches !== false,
    reason: profileGate?.reason || managed.reason,
    available: managedRead.available,
    error: profileGate?.error || managedRead.error || null,
    profileGate: profileGate ? {
      required: profileGate.required === true,
      matches: profileGate.matches === true,
      reason: profileGate.reason || null,
      expectedEmail: profileGate.expectedEmail || null,
      hasCurrentProfileEmail: profileGate.hasCurrentProfileEmail === true,
      identityReason: profileGate.identityReason || null,
    } : null,
  };
}

export async function resolveActivationState() {
  const [managedRead, privacyConsent, managedDeployment] = await Promise.all([
    readManagedActivationPolicy(),
    getPrivacyConsent().catch(() => ({ accepted: false })),
    readManagedDeploymentMarker(),
  ]);
  const managed = normalizeManagedActivationPolicy(managedRead.raw);
  const profileGate = await resolveManagedProfileEmailGate(managed.policy);

  // managedProfileEmail is a strong runtime profile gate. When it is configured
  // and the current Chrome profile does not match, user consent fallback is blocked.
  if (profileGate.required && !profileGate.matches) {
    return {
      activated: false,
      activationMode: ACTIVATION_MODE_DISABLED,
      source: ACTIVATION_MODE_DISABLED,
      reason: 'managed_profile_email_mismatch',
      privacyConsentRequired: false,
      privacyConsent,
      managedPolicy: managed.policy,
      managedPolicyStatus: buildManagedPolicyStatus(managed, managedRead, profileGate),
    };
  }

  if (managed.active) {
    return {
      activated: true,
      activationMode: ACTIVATION_MODE_MANAGED_POLICY,
      source: ACTIVATION_MODE_MANAGED_POLICY,
      reason: null,
      privacyConsentRequired: false,
      privacyConsent,
      managedPolicy: managed.policy,
      managedPolicyStatus: buildManagedPolicyStatus(managed, managedRead, profileGate),
    };
  }

  if (managedDeployment) {
    return {
      activated: false,
      activationMode: 'managed_policy_pending',
      source: 'managed_policy_pending',
      reason: 'managed_policy_pending',
      privacyConsentRequired: false,
      managedDeployment: true,
      privacyConsent,
      managedPolicy: managed.policy,
      managedPolicyStatus: buildManagedPolicyStatus(managed, managedRead, profileGate),
    };
  }

  if (privacyConsent?.accepted === true) {
    return {
      activated: true,
      activationMode: ACTIVATION_MODE_USER_CONSENT,
      source: ACTIVATION_MODE_USER_CONSENT,
      reason: null,
      privacyConsentRequired: false,
      privacyConsent,
      managedPolicy: managed.policy,
      managedPolicyStatus: buildManagedPolicyStatus(managed, managedRead, profileGate),
    };
  }

  return {
    activated: false,
    activationMode: ACTIVATION_MODE_DISABLED,
    source: ACTIVATION_MODE_DISABLED,
    reason: 'privacy_consent_required',
    privacyConsentRequired: true,
    privacyConsent,
    managedPolicy: managed.policy,
    managedDeployment: false,
    managedPolicyStatus: buildManagedPolicyStatus(managed, managedRead, profileGate),
  };
}

export async function hasRuntimeActivation() {
  const state = await resolveActivationState();
  return state.activated === true;
}

export async function isIdentityRecoveryAllowed() {
  const state = await resolveActivationState();
  if (state.activated !== true) return false;
  if (state.activationMode !== ACTIVATION_MODE_MANAGED_POLICY) return true;
  return state.managedPolicy?.allowIdentityRecovery !== false;
}

export async function canUseChromeIdentityForAdmin() {
  const state = await resolveActivationState();
  if (state.activated !== true) return false;
  if (state.activationMode !== ACTIVATION_MODE_MANAGED_POLICY) return true;
  return state.managedPolicy?.allowIdentityRecovery !== false;
}
