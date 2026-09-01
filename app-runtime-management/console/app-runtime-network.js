(function initializeAppRuntimeNetwork(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.AppRuntimeNetwork = api;
})(typeof globalThis === 'undefined' ? this : globalThis, () => {
  const NETWORK_MESSAGE = '暂时无法连接服务，请检查网络后点击“刷新”重试。';

  function friendlyError(error) {
    if (error instanceof TypeError || /failed to fetch|networkerror/i.test(String(error?.message || error))) {
      return new Error(NETWORK_MESSAGE);
    }
    return error instanceof Error ? error : new Error(String(error));
  }

  async function requestJson({ url, options = {}, getToken, fetchImpl = fetch }) {
    const method = String(options.method || 'GET').toUpperCase();
    const mayRetryNetwork = method === 'GET';
    let authenticationRetried = false;
    let networkRetried = false;

    for (;;) {
      let token;
      try {
        token = await getToken(false);
      } catch (error) {
        if (mayRetryNetwork && !networkRetried && friendlyError(error).message === NETWORK_MESSAGE) {
          networkRetried = true;
          try {
            token = await getToken(true);
          } catch (retryError) {
            throw friendlyError(retryError);
          }
        } else {
          throw friendlyError(error);
        }
      }

      let response;
      try {
        response = await fetchImpl(url, {
          ...options,
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
            ...(options.headers || {}),
          },
        });
      } catch (error) {
        if (mayRetryNetwork && !networkRetried) {
          networkRetried = true;
          await getToken(true).catch((retryError) => { throw friendlyError(retryError); });
          continue;
        }
        throw friendlyError(error);
      }

      if (response.status === 401 && !authenticationRetried) {
        authenticationRetried = true;
        await getToken(true).catch((error) => { throw friendlyError(error); });
        continue;
      }

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error?.message || payload.error || `Runtime API ${response.status}`);
      }
      return payload;
    }
  }

  return { NETWORK_MESSAGE, friendlyError, requestJson };
});
