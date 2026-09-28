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
      const selectedChildId = typeof value.selectedChildId === 'string'
        && value.children.some((child) => child?.id === value.selectedChildId) ? value.selectedChildId : null;
      return {
        token: value.token, expiresAt: value.expiresAt, children: value.children,
        ...(selectedChildId ? { selectedChildId } : {}),
      };
    } catch {
      storage.removeItem(storageKey);
      return null;
    }
  }

  function save(storage, value) {
    const selectedChildId = typeof value.selectedChildId === 'string'
      && value.children.some((child) => child?.id === value.selectedChildId) ? value.selectedChildId : null;
    storage.setItem(storageKey, JSON.stringify({
      token: value.token,
      expiresAt: value.expiresAt,
      children: value.children,
      ...(selectedChildId ? { selectedChildId } : {}),
    }));
  }

  function clear(storage) { storage.removeItem(storageKey); }

  const recoveryKey = 'timeonchrome_runtime_auth_recovery_v1';
  function createRecovery(storage, redirect) {
    let redirecting = false;
    let rejected = false;
    function fail() {
      const error = new Error('登录恢复失败，请点击“从家长控制台进入”手动重新登录。');
      error.code = 'AUTH_RECOVERY_FAILED';
      throw error;
    }
    return {
      recover() {
        rejected = true;
        if (redirecting) throw new Error('正在返回家长控制台，请稍候');
        try {
          if (storage.getItem(recoveryKey)) return fail();
          // 无法持久保存标记时停止恢复，不能冒险形成跨页面循环。
          storage.setItem(recoveryKey, '1');
          if (storage.getItem(recoveryKey) !== '1') return fail();
        } catch { return fail(); }
        clear(storage);
        redirecting = true;
        redirect();
        throw new Error('Runtime 会话已过期，正在返回家长控制台');
      },
      protectedLoadSucceeded() {
        // 同一文档中的迟到成功不能清除已经触发的认证失败。
        if (!rejected) storage.removeItem(recoveryKey);
      },
    };
  }

  return { storageKey, recoveryKey, createRecovery, consumeLaunchTicket, load, save, clear };
});
