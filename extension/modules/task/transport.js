const DEFAULT_API_BASE = 'https://guardian-api.william-xia-cn.workers.dev';

async function getConnection() {
  const local = await globalThis.chrome?.storage?.local?.get?.(['cloud_device_token']) || {};
  const managed = await globalThis.chrome?.storage?.managed?.get?.(['cloudEndpoint']).catch(() => ({})) || {};
  return {
    token: String(local.cloud_device_token || '').trim(),
    apiBase: String(managed.cloudEndpoint || DEFAULT_API_BASE).replace(/\/+$/g, ''),
  };
}

export async function taskDeviceRequest(method, path, body = null) {
  const connection = await getConnection();
  if (!connection.token) throw new Error('TASK_DEVICE_NOT_BOUND');
  const response = await fetch(`${connection.apiBase}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${connection.token}`,
      ...(body == null ? {} : { 'Content-Type': 'application/json' }),
    },
    body: body == null ? undefined : JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload?.code || payload?.error || `TASK_HTTP_${response.status}`);
  return payload;
}