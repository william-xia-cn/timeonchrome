// Sessions 路由 - Session 文件上传到 R2
import { json, Env } from '../db/middleware';

type DeviceIdentity = { profileId: string; unbound?: boolean };

function deviceUnboundResponse(): Response {
  return json({ error: 'Device unbound', code: 'DEVICE_UNBOUND', bound: false, reason: 'unbound' }, 403);
}

async function verifyDeviceToken(env: Env, token: string): Promise<DeviceIdentity | null> {
  const device = await env.DB.prepare(
    `SELECT profile_id, COALESCE(status, 'bound') AS status FROM devices WHERE device_token = ?`
  ).bind(token).first<{ profile_id: string; status?: string }>();
  if (!device?.profile_id) return null;
  return { profileId: device.profile_id, unbound: device.status === 'unbound' };
}

export const sessionsRouter = {
  async handle(request: Request, env: Env): Promise<Response> {
    const url  = new URL(request.url);
    const path = url.pathname;

    // POST /device/sessions/upload
    if (request.method === 'POST' && path === '/device/sessions/upload') {
      const auth = request.headers.get('Authorization');
      if (!auth?.startsWith('Bearer ')) return json({ error: 'Unauthorized' }, 401);

      const device = await verifyDeviceToken(env, auth.slice(7));
      if (!device) return json({ error: 'Invalid device token' }, 401);
      if (device.unbound) return deviceUnboundResponse();
      const profileId = device.profileId;

      try {
        const { date, sessions } = await request.json<{ date: string; sessions: unknown[] }>();

        if (!date || !sessions) {
          return json({ error: 'date and sessions required' }, 400);
        }

        const key     = `sessions/${profileId}/${date}.json`;
        const content = JSON.stringify({ profile_id: profileId, date, sessions, uploaded_at: Date.now() }, null, 2);

        await env.SESSION_FILES.put(key, content);

        return json({ success: true, key, count: (sessions as unknown[]).length });
      } catch (e: any) {
        return json({ error: 'Failed to upload sessions: ' + e.message }, 500);
      }
    }

    return json({ error: 'Not found' }, 404);
  },
};
