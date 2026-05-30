import { json, Env } from '../db/middleware';

export type DeviceIdentity = {
  profileId: string;
  deviceId: string | null;
  deviceName?: string | null;
  unbound?: boolean;
};

export function deviceUnboundResponse(deviceId?: string | null): Response {
  return json({
    error: 'Device unbound',
    code: 'DEVICE_UNBOUND',
    bound: false,
    reason: 'unbound',
    device_id: deviceId || null,
  }, 403);
}

function isMissingDeviceStatusColumn(error: any): boolean {
  const message = String(error?.message || error || '');
  return /no such column/i.test(message) && /\bstatus\b/i.test(message);
}

async function readDeviceWithStatus(env: Env, token: string, includeDeviceName = false): Promise<DeviceIdentity | null> {
  const select = includeDeviceName
    ? `SELECT id, profile_id, device_name, COALESCE(status, 'bound') AS status FROM devices WHERE device_token = ?`
    : `SELECT id, profile_id, COALESCE(status, 'bound') AS status FROM devices WHERE device_token = ?`;
  try {
    const device = await env.DB.prepare(select)
      .bind(token)
      .first<{ id?: string; profile_id?: string; device_name?: string; status?: string }>();
    if (!device?.profile_id) return null;
    return {
      profileId: device.profile_id,
      deviceId: device.id || null,
      deviceName: includeDeviceName ? (device.device_name || 'Unknown Device') : undefined,
      unbound: device.status === 'unbound',
    };
  } catch (error: any) {
    if (!isMissingDeviceStatusColumn(error)) throw error;
    console.warn('[Worker] devices.status missing; treating legacy device token as bound');
    const legacySelect = includeDeviceName
      ? `SELECT id, profile_id, device_name FROM devices WHERE device_token = ?`
      : `SELECT id, profile_id FROM devices WHERE device_token = ?`;
    const device = await env.DB.prepare(legacySelect)
      .bind(token)
      .first<{ id?: string; profile_id?: string; device_name?: string }>();
    if (!device?.profile_id) return null;
    return {
      profileId: device.profile_id,
      deviceId: device.id || null,
      deviceName: includeDeviceName ? (device.device_name || 'Unknown Device') : undefined,
      unbound: false,
    };
  }
}

async function refreshLastSeen(env: Env, token: string): Promise<void> {
  try {
    await env.DB.prepare(
      `UPDATE devices SET last_seen = ? WHERE device_token = ? AND COALESCE(status, 'bound') = 'bound'`
    ).bind(Date.now(), token).run();
  } catch (error: any) {
    if (!isMissingDeviceStatusColumn(error)) throw error;
    console.warn('[Worker] devices.status missing while refreshing last_seen; using legacy update');
    await env.DB.prepare(
      `UPDATE devices SET last_seen = ? WHERE device_token = ?`
    ).bind(Date.now(), token).run();
  }
}

export async function verifyDeviceToken(
  env: Env,
  token: string,
  options: { updateLastSeen?: boolean; includeDeviceName?: boolean } = {}
): Promise<DeviceIdentity | null> {
  const device = await readDeviceWithStatus(env, token, !!options.includeDeviceName);
  if (!device) return null;
  if (device.unbound) return device;
  if (options.updateLastSeen) await refreshLastSeen(env, token);
  return device;
}

export async function verifyDeviceTokenFromRequest(
  request: Request,
  env: Env,
  options: { updateLastSeen?: boolean; includeDeviceName?: boolean } = {}
): Promise<DeviceIdentity | null> {
  const auth = request.headers.get('Authorization');
  if (!auth?.startsWith('Bearer ')) return null;
  return verifyDeviceToken(env, auth.slice(7), options);
}

