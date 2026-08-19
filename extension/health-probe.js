(() => {
  let closing = false;

  async function closeProbe() {
    if (closing) return;
    closing = true;
    try {
      const tab = await chrome.tabs.getCurrent();
      if (tab?.id) {
        await chrome.tabs.remove(tab.id);
        return;
      }
    } catch (_) {
      // window.close() is the extension-page fallback.
    }
    window.close();
  }

  const hardCloseTimer = setTimeout(closeProbe, 5_000);
  Promise.resolve(chrome.runtime.sendMessage({
    type: 'TIMEONCHROME_LOCAL_HEALTH_PROBE',
  })).catch(() => null).finally(() => {
    clearTimeout(hardCloseTimer);
    closeProbe();
  });
})();
