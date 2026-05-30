// Events 路由 - 设备端事件上报 + 邮件通知
import { json, Env } from '../db/middleware';
import { deviceUnboundResponse, verifyDeviceToken } from './deviceIdentity';

// 需要发邮件的事件类型
const NOTIFIABLE_TYPES = new Set([
  'temp_allow',          // 孩子申请临时放行（域名白名单绕过）
  'temp_allow_quota',    // 孩子申请临时绕过配额锁定
  'temp_allow_schedule', // 孩子申请临时绕过时间段限制
  'quota_locked',        // 配额刚锁定
  'unsafe_block',        // 访问不安全网站被拦截
  'composite_add',       // 孩子将网站加入待定列表
]);

const EVENT_LABELS: Record<string, string> = {
  temp_allow:          '孩子申请临时放行',
  temp_allow_quota:    '孩子申请绕过配额限制',
  temp_allow_schedule: '孩子申请绕过时间段限制',
  quota_locked:        '上网时间配额已用完',
  unsafe_block:        '尝试访问不安全网站',
  composite_add:       '孩子将网站加入待定列表',
};

function buildEmail(
  type: string,
  domain: string,
  deviceName: string,
  childName: string,
): { subject: string; html: string } {
  const now = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
  const label = EVENT_LABELS[type] || type;
  const domainStr = domain && domain !== 'all' ? domain : '所有网站';

  const subject = `[TimeOnChrome] ${childName} · ${label}`;

  const html = `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
                max-width:480px;margin:0 auto;padding:32px 24px;background:#fff;">
      <div style="background:#6c63ff;border-radius:12px;padding:20px 24px;margin-bottom:24px;">
        <h2 style="color:#fff;margin:0;font-size:18px;">TimeOnChrome 通知</h2>
      </div>
      <table style="width:100%;border-collapse:collapse;">
        <tr><td style="padding:8px 0;color:#555;width:80px;">事件</td>
            <td style="padding:8px 0;font-weight:600;">${label}</td></tr>
        <tr><td style="padding:8px 0;color:#555;">域名</td>
            <td style="padding:8px 0;">${domainStr}</td></tr>
        <tr><td style="padding:8px 0;color:#555;">孩子</td>
            <td style="padding:8px 0;">${childName}</td></tr>
        <tr><td style="padding:8px 0;color:#555;">设备</td>
            <td style="padding:8px 0;">${deviceName}</td></tr>
        <tr><td style="padding:8px 0;color:#555;">时间</td>
            <td style="padding:8px 0;">${now}</td></tr>
      </table>
      <hr style="margin:24px 0;border:none;border-top:1px solid #eee;">
      <p style="color:#999;font-size:12px;margin:0;">
        如需调整规则，请登录 TimeOnChrome 管理控制台。
      </p>
    </div>
  `.trim();

  return { subject, html };
}

async function sendEmail(
  apiKey: string,
  to: string,
  subject: string,
  html: string,
): Promise<boolean> {
  const resp = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      // 配置好 Resend 域名后替换 from 地址
      from: 'TimeOnChrome <notify@hornburg-xia.cn>',
      to: [to],
      subject,
      html,
    }),
  });
  return resp.ok;
}

export const eventsRouter = {
  async handle(request: Request, env: Env): Promise<Response> {
    const url  = new URL(request.url);
    const path = url.pathname;

    if (request.method !== 'POST' || path !== '/device/events') {
      return json({ error: 'Not found' }, 404);
    }

    const auth = request.headers.get('Authorization');
    if (!auth?.startsWith('Bearer ')) return json({ error: 'Unauthorized' }, 401);

    const device = await verifyDeviceToken(env, auth.slice(7), { includeDeviceName: true });
    if (!device) return json({ error: 'Invalid device token' }, 401);
    if (device.unbound) return deviceUnboundResponse();

    const { profileId, deviceName } = device;

    try {
      const { type, domain = '', context } =
        await request.json<{ type: string; domain?: string; context?: unknown }>();

      if (!type) return json({ error: 'type required' }, 400);

      // 不需要通知的事件类型：直接返回成功（扩展端 fire-and-forget，不阻塞）
      if (!NOTIFIABLE_TYPES.has(type)) {
        return json({ success: true, notified: false });
      }

      // 没有配置 Resend API key：跳过邮件发送
      if (!env.RESEND_API_KEY) {
        return json({ success: true, notified: false, reason: 'no_api_key' });
      }

      // KV 防重复：同一 profile + type + domain，1 小时内只发一次
      const dedupKey = `notify:${profileId}:${type}:${domain}`;
      const existing = await env.CONFIG_CACHE.get(dedupKey);
      if (existing) {
        return json({ success: true, notified: false, reason: 'dedup' });
      }

      // 查找账号邮箱 + 孩子名
      const row = await env.DB.prepare(
        `SELECT a.email, p.name
         FROM profiles p JOIN accounts a ON p.account_id = a.id
         WHERE p.id = ?`
      ).bind(profileId).first<{ email: string; name: string }>();

      if (!row?.email) {
        return json({ success: true, notified: false, reason: 'no_email' });
      }

      const { subject, html } = buildEmail(type, domain, deviceName, row.name);
      const sent = await sendEmail(env.RESEND_API_KEY, row.email, subject, html);

      if (!sent) {
        return json({ success: false, error: 'Email send failed' }, 500);
      }

      // 写入 KV 防重复标记（1 小时 TTL）
      await env.CONFIG_CACHE.put(dedupKey, '1', { expirationTtl: 3600 });

      return json({ success: true, notified: true });
    } catch (e: any) {
      return json({ error: 'Failed to process event: ' + e.message }, 500);
    }
  },
};
