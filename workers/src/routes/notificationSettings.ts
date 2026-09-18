import { json, type Env, verifyAccountToken } from '../db/middleware';
import {
  createTelegramPairingSession,
  disableRotatedTelegramConnection,
  getTelegramBotIdentity,
  loadAccountNotificationSettings,
  loadProfileUnclassifiedNotificationSettings,
  normalizeProfileUnclassifiedNotificationSettings,
  consumeTelegramPairingToken,
  telegramWebhookSecret,
} from '../services/notificationSettings';
import {
  isEmailClassificationEnabled,
  sendResendEmail,
  sendTelegramMessage,
} from '../services/siteClassificationEmail';

const ACCOUNT_SETTINGS_PATH = '/account/notification-settings/v1';
const ACCOUNT_TEST_PATH = '/account/notification-settings/v1/test';
const TELEGRAM_CONNECT_PATH = '/account/notification-settings/v1/telegram/connect';
const TELEGRAM_CONNECTION_PATH = '/account/notification-settings/v1/telegram/connection';
const TELEGRAM_WEBHOOK_PATH = '/integrations/telegram/webhook';
const PROFILE_SETTINGS_RE = /^\/profiles\/([^/]+)\/unclassified-usage-notification\/v1$/;

async function ownedProfile(env: Env, accountId: string, profileId: string) {
  return env.DB.prepare(
    'SELECT p.id, p.name FROM profiles p WHERE p.id = ? AND p.account_id = ?'
  ).bind(profileId, accountId).first<{ id: string; name: string }>();
}

async function loadAccount(env: Env, accountId: string) {
  return env.DB.prepare(
    'SELECT id, email FROM accounts WHERE id = ?'
  ).bind(accountId).first<{ id: string; email: string }>();
}

function publicAccountSettings(settings: Awaited<ReturnType<typeof loadAccountNotificationSettings>>) {
  return {
    emailEnabled: settings.emailEnabled,
    telegramEnabled: settings.telegramEnabled,
    telegramConnected: settings.telegramConnected,
    telegramConnectionStatus: settings.telegramConnectionStatus,
    telegramBotUsername: settings.telegramBotUsername,
  };
}

async function accountCapabilities(env: Env, email: string) {
  const emailAvailable = Boolean(
    email
    && env.RESEND_API_KEY
    && env.EMAIL_ACTION_SECRET
    && isEmailClassificationEnabled(env)
  );
  let telegramAvailable = false;
  let telegramBotUsername = '';
  if (env.TELEGRAM_BOT_TOKEN) {
    try {
      const bot = await getTelegramBotIdentity(env);
      telegramAvailable = true;
      telegramBotUsername = bot.username;
    } catch {
      telegramAvailable = false;
    }
  }
  return { emailAvailable, telegramAvailable, telegramBotUsername };
}

async function handleTelegramWebhook(request: Request, env: Env): Promise<Response> {
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  let expectedSecret = '';
  try {
    expectedSecret = await telegramWebhookSecret(env);
  } catch {
    return json({ error: 'Telegram unavailable' }, 503);
  }
  if (request.headers.get('X-Telegram-Bot-Api-Secret-Token') !== expectedSecret) {
    return json({ error: 'Unauthorized' }, 401);
  }
  const update = await request.json<{
    message?: {
      text?: string;
      chat?: { id?: number | string; type?: string };
    };
  }>().catch(() => ({} as {
    message?: {
      text?: string;
      chat?: { id?: number | string; type?: string };
    };
  }));
  const text = String(update.message?.text || '').trim();
  const start = /^\/start(?:@[A-Za-z0-9_]+)?\s+([A-Za-z0-9_-]{20,64})$/.exec(text);
  if (!start || update.message?.chat?.id == null) return json({ ok: true, ignored: true });
  const chatId = String(update.message.chat.id);
  const result = await consumeTelegramPairingToken(
    env,
    start[1],
    chatId,
    String(update.message.chat.type || ''),
  );
  if (result === 'connected') {
    await sendTelegramMessage(env, chatId, 'TimeOnChrome 已连接。请返回家长控制台启用 Telegram 通知。')
      .catch(() => undefined);
  }
  return json({ ok: true, result });
}

async function handleAccountSettings(request: Request, env: Env, accountId: string): Promise<Response> {
  const account = await loadAccount(env, accountId);
  if (!account) return json({ error: 'Account not found' }, 404);

  if (request.method === 'GET') {
    await disableRotatedTelegramConnection(env, accountId);
    const settings = await loadAccountNotificationSettings(env, accountId);
    const capabilities = await accountCapabilities(env, account.email);
    return json({
      settings: publicAccountSettings(settings),
      accountEmail: account.email,
      capabilities,
    });
  }

  if (request.method === 'PUT') {
    const body = await request.json<{ data?: any }>().catch(() => ({} as { data?: any }));
    const data = body?.data;
    if (!data || typeof data !== 'object' || Array.isArray(data)) return json({ error: 'data 必须是对象' }, 400);
    if (typeof data.emailEnabled !== 'boolean') return json({ error: 'emailEnabled 必须是布尔值' }, 400);
    if (typeof data.telegramEnabled !== 'boolean') return json({ error: 'telegramEnabled 必须是布尔值' }, 400);
    const settings = await loadAccountNotificationSettings(env, accountId);
    const capabilities = await accountCapabilities(env, account.email);
    if (data.emailEnabled && !capabilities.emailAvailable) return json({ error: '邮件服务当前不可用' }, 409);
    if (data.telegramEnabled && (!capabilities.telegramAvailable || !settings.telegramConnected)) {
      return json({ error: '启用 Telegram 前必须先完成连接' }, 409);
    }
    const now = Date.now();
    await env.DB.prepare(
      'INSERT INTO account_notification_settings_v1 ' +
      '(account_id, email_enabled, telegram_enabled, created_at, updated_at) VALUES (?, ?, ?, ?, ?) ' +
      'ON CONFLICT(account_id) DO UPDATE SET email_enabled = excluded.email_enabled, ' +
      'telegram_enabled = excluded.telegram_enabled, updated_at = excluded.updated_at'
    ).bind(accountId, data.emailEnabled ? 1 : 0, data.telegramEnabled ? 1 : 0, now, now).run();
    const updated = await loadAccountNotificationSettings(env, accountId);
    return json({ success: true, settings: publicAccountSettings(updated) });
  }

  return json({ error: 'Method not allowed' }, 405);
}

async function handleAccountTest(request: Request, env: Env, accountId: string): Promise<Response> {
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  const account = await loadAccount(env, accountId);
  if (!account) return json({ error: 'Account not found' }, 404);
  const body = await request.json<{ channel?: string }>().catch(() => ({} as { channel?: string }));
  if (body.channel === 'email') {
    const capabilities = await accountCapabilities(env, account.email);
    if (!capabilities.emailAvailable) return json({ error: '邮件服务当前不可用' }, 409);
    await sendResendEmail(env, {
      to: account.email,
      subject: '[TimeOnChrome] 邮件通知测试',
      text: 'TimeOnChrome 邮件通知已连接。',
      html: '<p>TimeOnChrome 邮件通知已连接。</p>',
    });
    return json({ success: true });
  }
  if (body.channel === 'telegram') {
    const settings = await loadAccountNotificationSettings(env, accountId);
    if (!settings.telegramConnected || !settings.telegramChatId) {
      return json({ error: 'Telegram 尚未连接' }, 409);
    }
    await sendTelegramMessage(env, settings.telegramChatId, 'TimeOnChrome Telegram 测试消息');
    return json({ success: true });
  }
  return json({ error: 'channel 必须是 email 或 telegram' }, 400);
}

async function handleTelegramConnect(request: Request, env: Env, accountId: string, url: URL): Promise<Response> {
  if (request.method === 'POST') {
    try {
      return json(await createTelegramPairingSession(env, accountId));
    } catch (error: any) {
      return json({ error: String(error?.message || 'Telegram Bot 当前不可用') }, 409);
    }
  }
  if (request.method === 'GET') {
    const pairingId = String(url.searchParams.get('pairingId') || '').trim();
    if (!pairingId) return json({ error: 'pairingId is required' }, 400);
    const row = await env.DB.prepare(
      'SELECT status, expires_at, consumed_at FROM telegram_pairing_sessions_v1 WHERE id = ? AND account_id = ?'
    ).bind(pairingId, accountId).first<{
      status: string;
      expires_at: number;
      consumed_at: number | null;
    }>();
    if (!row) return json({ error: 'Pairing session not found' }, 404);
    const status = row.status === 'pending' && row.expires_at <= Date.now() ? 'expired' : row.status;
    return json({ status, expiresAt: row.expires_at, connectedAt: row.consumed_at });
  }
  return json({ error: 'Method not allowed' }, 405);
}

async function handleTelegramDisconnect(request: Request, env: Env, accountId: string): Promise<Response> {
  if (request.method !== 'DELETE') return json({ error: 'Method not allowed' }, 405);
  const now = Date.now();
  await env.DB.prepare(
    'UPDATE account_notification_settings_v1 SET telegram_enabled = 0, telegram_chat_id = NULL, ' +
    'telegram_bot_id = NULL, telegram_bot_username = NULL, telegram_connected_at = NULL, updated_at = ? ' +
    'WHERE account_id = ?'
  ).bind(now, accountId).run();
  await env.DB.prepare(
    "UPDATE telegram_pairing_sessions_v1 SET status = 'expired', updated_at = ? " +
    "WHERE account_id = ? AND status = 'pending'"
  ).bind(now, accountId).run();
  return json({ success: true });
}

async function handleProfileSettings(
  request: Request,
  env: Env,
  accountId: string,
  profileId: string,
): Promise<Response> {
  const profile = await ownedProfile(env, accountId, profileId);
  if (!profile) return json({ error: 'Profile not found' }, 404);
  if (request.method === 'GET') {
    return json({ settings: await loadProfileUnclassifiedNotificationSettings(env, profileId) });
  }
  if (request.method === 'PUT') {
    const body = await request.json<{ data?: any }>().catch(() => ({} as { data?: any }));
    const data = body?.data;
    if (!data || typeof data !== 'object' || Array.isArray(data)) return json({ error: 'data 必须是对象' }, 400);
    if (typeof data.enabled !== 'boolean') return json({ error: 'enabled 必须是布尔值' }, 400);
    if (!Number.isInteger(data.thresholdMinutes) || data.thresholdMinutes < 1 || data.thresholdMinutes > 1440) {
      return json({ error: 'thresholdMinutes 必须是 1-1440 的整数分钟' }, 400);
    }
    const settings = normalizeProfileUnclassifiedNotificationSettings(data);
    const now = Date.now();
    await env.DB.prepare(
      'INSERT INTO profile_unclassified_notification_settings_v1 ' +
      '(profile_id, enabled, threshold_minutes, created_at, updated_at) VALUES (?, ?, ?, ?, ?) ' +
      'ON CONFLICT(profile_id) DO UPDATE SET enabled = excluded.enabled, ' +
      'threshold_minutes = excluded.threshold_minutes, updated_at = excluded.updated_at'
    ).bind(profileId, settings.enabled ? 1 : 0, settings.thresholdMinutes, now, now).run();
    return json({ success: true, settings });
  }
  return json({ error: 'Method not allowed' }, 405);
}

export const notificationSettingsRouter = {
  matches(path: string): boolean {
    return path === ACCOUNT_SETTINGS_PATH
      || path === ACCOUNT_TEST_PATH
      || path === TELEGRAM_CONNECT_PATH
      || path === TELEGRAM_CONNECTION_PATH
      || path === TELEGRAM_WEBHOOK_PATH
      || PROFILE_SETTINGS_RE.test(path);
  },

  async handle(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === TELEGRAM_WEBHOOK_PATH) return handleTelegramWebhook(request, env);
    const accountId = await verifyAccountToken(request, env.JWT_SECRET);
    if (!accountId) return json({ error: 'Unauthorized' }, 401);
    if (url.pathname === ACCOUNT_SETTINGS_PATH) return handleAccountSettings(request, env, accountId);
    if (url.pathname === ACCOUNT_TEST_PATH) return handleAccountTest(request, env, accountId);
    if (url.pathname === TELEGRAM_CONNECT_PATH) return handleTelegramConnect(request, env, accountId, url);
    if (url.pathname === TELEGRAM_CONNECTION_PATH) return handleTelegramDisconnect(request, env, accountId);
    const profileMatch = PROFILE_SETTINGS_RE.exec(url.pathname);
    if (profileMatch) return handleProfileSettings(request, env, accountId, profileMatch[1]);
    return json({ error: 'Not found' }, 404);
  },
};
