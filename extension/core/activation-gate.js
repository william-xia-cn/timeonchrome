import { getPrivacyConsent, hasPrivacyConsent } from './privacy-consent.js';

export const ACTIVATION_MODE_DISABLED = 'disabled';
export const ACTIVATION_MODE_USER_CONSENT = 'user_consent';
export const ACTIVATION_MODE_MANAGED_POLICY = 'managed_policy';

export const MANAGED_POLICY_KEYS = [
  'enabled',
  'deploymentMode',
  'cloudEndpoint',
  'managedDeviceToken',
  'managedDeviceLabel',
  'allowIdentityRecovery',
  // Legacy recovery anchors. Kept only for older managed policy templates.
  'tenantId',
  'devicePolicyId',
];

function asTrimmedString(value) {
  return typeof value === 'string' ? value.trim() : '';
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
  if (!chrome?.storage?.managed?.get) {
    return { available: false, raw: null, error: 'managed_storage_unavailable' };
  }

  return await new Promise((resolve) => {
    try {
      chrome.storage.managed.get(MANAGED_POLICY_KEYS, (raw) => {
        const lastError = chrome.runtime?.lastError;
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

export async function resolveActivationState() {
  const [managedRead, privacyConsent] = await Promise.all([
    readManagedActivationPolicy(),
    getPrivacyConsent().catch(() => ({ accepted: false })),
  ]);
  const managed = normalizeManagedActivationPolicy(managedRead.raw);

  if (managed.active) {
    return {
      activated: true,
      activationMode: ACTIVATION_MODE_MANAGED_POLICY,
      source: ACTIVATION_MODE_MANAGED_POLICY,
      reason: null,
      privacyConsentRequired: false,
      privacyConsent,
      managedPolicy: managed.policy,
      managedPolicyStatus: {
        configured: managed.configured,
        active: managed.active,
        reason: managed.reason,
        available: managedRead.available,
        error: managedRead.error || null,
      },
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
      managedPolicyStatus: {
        configured: managed.configured,
        active: managed.active,
        reason: managed.reason,
        available: managedRead.available,
        error: managedRead.error || null,
      },
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
    managedPolicyStatus: {
      configured: managed.configured,
      active: managed.active,
      reason: managed.reason,
      available: managedRead.available,
      error: managedRead.error || null,
    },
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
  if (await hasPrivacyConsent()) return true;
  return await isIdentityRecoveryAllowed();
}
