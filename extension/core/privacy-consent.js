export const PRIVACY_CONSENT_KEY = 'privacy_consent_v1';
export const PRIVACY_POLICY_VERSION = '2026-06-22';
export const PRIVACY_POLICY_URL = 'https://william-xia-cn.github.io/timeonchrome/extension/privacy.html';

export function buildPrivacyConsentRecord(source = 'unknown') {
  let extensionVersion = null;
  try {
    extensionVersion = chrome.runtime.getManifest()?.version || null;
  } catch (_) {
    extensionVersion = null;
  }
  return {
    accepted: true,
    acceptedAt: Date.now(),
    policyVersion: PRIVACY_POLICY_VERSION,
    extensionVersion,
    policyUrl: PRIVACY_POLICY_URL,
    source,
  };
}

export async function getPrivacyConsent() {
  try {
    const result = await chrome.storage.local.get([PRIVACY_CONSENT_KEY]);
    const record = result?.[PRIVACY_CONSENT_KEY] || null;
    const accepted = record?.accepted === true && record?.policyVersion === PRIVACY_POLICY_VERSION;
    return {
      accepted,
      record,
      required: !accepted,
      policyVersion: PRIVACY_POLICY_VERSION,
      policyUrl: PRIVACY_POLICY_URL,
    };
  } catch (_) {
    return {
      accepted: false,
      record: null,
      required: true,
      policyVersion: PRIVACY_POLICY_VERSION,
      policyUrl: PRIVACY_POLICY_URL,
    };
  }
}

export async function hasPrivacyConsent() {
  const state = await getPrivacyConsent();
  return state.accepted === true;
}

export async function acceptPrivacyConsent(source = 'unknown') {
  const record = buildPrivacyConsentRecord(source);
  await chrome.storage.local.set({ [PRIVACY_CONSENT_KEY]: record });
  return {
    accepted: true,
    record,
    policyVersion: PRIVACY_POLICY_VERSION,
    policyUrl: PRIVACY_POLICY_URL,
  };
}

export function getPrivacyConsentPageUrl(params = {}) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params || {})) {
    if (value !== undefined && value !== null && value !== '') query.set(key, String(value));
  }
  const suffix = query.toString();
  return chrome.runtime.getURL(`privacy-consent.html${suffix ? `?${suffix}` : ''}`);
}
