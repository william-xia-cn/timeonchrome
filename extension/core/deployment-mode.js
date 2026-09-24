const MANAGED_MODE = 'managed';
const NATIVE_HOST_DEVELOPMENT_MODE = 'native-host-development';
const STABLE_NATIVE_HOST_EXTENSION_ID = 'jdcancbiocacabbjdkngadmjpjmkdnih';

let markerPromise = null;

export function readDeploymentProfile() {
  if (!markerPromise) {
    try {
      const markerUrl = chrome.runtime.getURL('deployment-profile.json');
      markerPromise = fetch(markerUrl)
        .then((response) => (response.ok ? response.json() : null))
        .then((marker) => (marker && typeof marker === 'object' ? marker : null))
        .catch(() => null);
    } catch (_) {
      markerPromise = Promise.resolve(null);
    }
  }
  return markerPromise;
}

export async function readManagedDeploymentMarker() {
  const marker = await readDeploymentProfile();
  return marker?.mode === MANAGED_MODE;
}

export async function readNativeHostDevelopmentMarker() {
  const marker = await readDeploymentProfile();
  if (marker?.mode !== NATIVE_HOST_DEVELOPMENT_MODE) return false;
  if (chrome.runtime.id !== STABLE_NATIVE_HOST_EXTENSION_ID) return false;
  try {
    const self = await chrome.management?.getSelf?.();
    return self?.installType === 'development' && self?.id === STABLE_NATIVE_HOST_EXTENSION_ID;
  } catch (_) {
    return false;
  }
}

export async function readNativeHostDeploymentMarker() {
  const marker = await readDeploymentProfile();
  if (marker?.mode === MANAGED_MODE) return true;
  return readNativeHostDevelopmentMarker();
}
