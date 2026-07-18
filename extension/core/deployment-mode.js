let markerPromise = null;

export function readManagedDeploymentMarker() {
  if (!markerPromise) {
    try {
      const markerUrl = chrome.runtime.getURL('deployment-profile.json');
      markerPromise = fetch(markerUrl)
        .then((response) => (response.ok ? response.json() : null))
        .then((marker) => marker?.mode === 'managed')
        .catch(() => false);
    } catch (_) {
      markerPromise = Promise.resolve(false);
    }
  }
  return markerPromise;
}
