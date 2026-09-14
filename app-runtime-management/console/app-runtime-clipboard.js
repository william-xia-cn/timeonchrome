(function initializeAppRuntimeClipboard(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.AppRuntimeClipboard = api;
})(typeof globalThis === 'undefined' ? this : globalThis, () => {
  function fallbackCopy(text, documentRef) {
    if (!documentRef?.body || typeof documentRef.createElement !== 'function') {
      throw new Error('当前浏览器不支持自动复制，请手动选择配对码。');
    }

    const input = documentRef.createElement('textarea');
    input.value = text;
    input.setAttribute('readonly', '');
    input.style.position = 'fixed';
    input.style.opacity = '0';
    documentRef.body.appendChild(input);
    input.select();
    input.setSelectionRange?.(0, text.length);

    let copied = false;
    try {
      copied = documentRef.execCommand?.('copy') === true;
    } finally {
      input.remove();
    }
    if (!copied) throw new Error('复制失败，请手动选择配对码。');
    return { method: 'selection' };
  }

  async function copyText(text, { clipboard, documentRef } = {}) {
    const value = String(text || '').trim();
    if (!value) throw new Error('没有可复制的配对码。');
    const clipboardApi = clipboard === undefined && typeof navigator !== 'undefined'
      ? navigator.clipboard
      : clipboard;
    const documentApi = documentRef === undefined && typeof document !== 'undefined'
      ? document
      : documentRef;

    if (clipboardApi?.writeText) {
      try {
        await clipboardApi.writeText(value);
        return { method: 'clipboard' };
      } catch {
        // Some browsers deny Clipboard API access even after a user click.
      }
    }
    return fallbackCopy(value, documentApi);
  }

  return { copyText, fallbackCopy };
});
