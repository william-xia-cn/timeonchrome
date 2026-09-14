(function initializeRuntimeSession(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.AppRuntimeSession = api;
})(typeof globalThis === 'undefined' ? this : globalThis, () => {
  const storageKey = 'timeonchrome_runtime_browser_session_v1';

  function consumeLaunchTicket(locationLike, historyLike) {
    const fragment = new URLSearchParams(String(locationLike.hash || '').replace(/^#/u, ''));
    const ticket = fragment.get('ticket');
    if (locationLike.hash) {
      historyLike.replaceState(null, '', `${locationLike.pathname}${locationLike.search || ''}`);
    }
    return ticket || null;
  }

  function load(storage, nowMs = Date.now()) {
    try {
      const value = JSON.parse(storage.getItem(storageKey) || 'null');
      if (!value || typeof value.token !== 'string' || !Array.isArray(value.children)
        || !Number.isSafeInteger(value.expiresAt) || value.expiresAt <= nowMs) {
        storage.removeItem(storageKey);
        return null;
      }
      return value;
    } catch {
      storage.removeItem(storageKey);
      return null;
    }
  }

  function save(storage, value) {
    storage.setItem(storageKey, JSON.stringify({
      token: value.token,
      expiresAt: value.expiresAt,
      children: value.children,
    }));
  }

  function clear(storage) { storage.removeItem(storageKey); }

  return { storageKey, consumeLaunchTicket, load, save, clear };
});
