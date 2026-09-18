import type { Env } from '../db/middleware';

export type AccountNotificationSettings = {
  emailEnabled: boolean;
  telegramEnabled: boolean;
  telegramConnected: boolean;
  telegramConnectionStatus: 'not_connected' | 'connected' | 'reconnect_required';
  telegramBotUsername: string;
};

export type AccountNotificationSettingsInternal = AccountNotificationSettings & {
  telegramChatId: string;
  telegramBotId: string;
};

export type ProfileUnclassifiedNotificationSettings = {
  enabled: boolean;
  thresholdMinutes: number;
};

export type TelegramBotIdentity = {
  id: string;
  username: string;
};

export const DEFAULT_ACCOUNT_NOTIFICATION_SETTINGS: AccountNotificationSettingsInternal = {
  emailEnabled: false,
  telegramEnabled: false,
  telegramConnected: false,
  telegramConnectionStatus: 'not_connected',
  telegramBotUsername: '',
  telegramChatId: '',
  telegramBotId: '',
};

export const DEFAULT_PROFILE_UNCLASSIFIED_NOTIFICATION_SETTINGS: ProfileUnclassifiedNotificationSettings = {
  enabled: false,
  thresholdMinutes: 30,
};

const TELEGRAM_PAIRING_TTL_MS = 10 * 60 * 1000;
const DEFAULT_GUARDIAN_PUBLIC_BASE_URL = 'https://guardian-api.william-xia-cn.workers.dev';

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

export async function sha256Hex(value: string): Promise<string> {
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function telegramBotIdFromToken(token: unknown): string {
  const match = /^(\d{4,20}):[A-Za-z0-9_-]{20,}$/.exec(String(token || '').trim());
  return match?.[1] || '';
}

export function normalizeProfileUnclassifiedNotificationSettings(value: any): ProfileUnclassifiedNotificationSettings {
  const threshold = Number(value?.thresholdMinutes);
  return {
    enabled: value?.enabled === true,
    thresholdMinutes: Number.isInteger(threshold) && threshold >= 1 && threshold <= 1440
      ? threshold
      : DEFAULT_PROFILE_UNCLASSIFIED_NOTIFICATION_SETTINGS.thresholdMinutes,
  };
}

export async function loadProfileUnclassifiedNotificationSettings(
  env: Env,
  profileId: string,
): Promise<ProfileUnclassifiedNotificationSettings> {
  const row = await env.DB.prepare(
    `SELECT enabled, threshold_minutes
     FROM profile_unclassified_notification_settings_v1 WHERE profile_id = ?`
  ).bind(profileId).first<{ enabled: number; threshold_minutes: number }>();
  if (!row) return { ...DEFAULT_PROFILE_UNCLASSIFIED_NOTIFICATION_SETTINGS };
  return normalizeProfileUnclassifiedNotificationSettings({
    enabled: row.enabled === 1,
    thresholdMinutes: row.threshold_minutes,
  });
}

export async function loadAccountNotificationSettings(
  env: Env,
  accountId: string,
): Promise<AccountNotificationSettingsInternal> {
  const row = await env.DB.prepare(
    `SELECT email_enabled, telegram_enabled, telegram_chat_id, telegram_bot_id, telegram_bot_username
     FROM account_notification_settings_v1 WHERE account_id = ?`
  ).bind(accountId).first<{
    email_enabled: number;
    telegram_enabled: number;
    telegram_chat_id: string | null;
    telegram_bot_id: string | null;
    telegram_bot_username: string | null;
  }>();
  if (!row) return { ...DEFAULT_ACCOUNT_NOTIFICATION_SETTINGS };

  const currentBotId = telegramBotIdFromToken(env.TELEGRAM_BOT_TOKEN);
  const storedBotId = String(row.telegram_bot_id || '');
  const hasConnection = Boolean(row.telegram_chat_id && storedBotId);
  const botChanged = hasConnection && (!currentBotId || currentBotId !== storedBotId);
  return {
    emailEnabled: row.email_enabled === 1,
    telegramEnabled: row.telegram_enabled === 1 && hasConnection && !botChanged,
    telegramConnected: hasConnection && !botChanged,
    telegramConnectionStatus: botChanged ? 'reconnect_required' : hasConnection ? 'connected' : 'not_connected',
    telegramBotUsername: String(row.telegram_bot_username || ''),
    telegramChatId: botChanged ? '' : String(row.telegram_chat_id || ''),
    telegramBotId: storedBotId,
  };
}

export async function disableRotatedTelegramConnection(env: Env, accountId: string): Promise<boolean> {
  const settings = await loadAccountNotificationSettings(env, accountId);
  if (settings.telegramConnectionStatus !== 'reconnect_required') return false;
  await env.DB.prepare(
    `UPDATE account_notification_settings_v1
     SET telegram_enabled = 0, updated_at = ? WHERE account_id = ?`
  ).bind(Date.now(), accountId).run();
  return true;
}

export async function getTelegramBotIdentity(env: Env): Promise<TelegramBotIdentity> {
  const token = String(env.TELEGRAM_BOT_TOKEN || '').trim();
  if (!telegramBotIdFromToken(token)) throw new Error('TELEGRAM_BOT_TOKEN_MISSING');
  const response = await fetch(`https://api.telegram.org/bot${token}/getMe`);
  if (!response.ok) throw new Error(`TELEGRAM_HTTP_${response.status}`);
  const payload = await response.json<{
    ok?: boolean;
    result?: { id?: number | string; username?: string };
  }>().catch(() => ({} as {
    ok?: boolean;
    result?: { id?: number | string; username?: string };
  }));
  const id = String(payload.result?.id || '');
  const username = String(payload.result?.username || '').trim();
  if (payload.ok !== true || !id || !username) throw new Error('TELEGRAM_INVALID_RESPONSE');
  return { id, username };
}

export async function telegramWebhookSecret(env: Env): Promise<string> {
  if (!env.TELEGRAM_BOT_TOKEN || !env.JWT_SECRET) throw new Error('TELEGRAM_SECRET_MISSING');
  return sha256Hex(`timeonchrome-telegram-webhook:${env.JWT_SECRET}:${env.TELEGRAM_BOT_TOKEN}`);
}

export async function ensureTelegramWebhook(env: Env): Promise<TelegramBotIdentity> {
  const bot = await getTelegramBotIdentity(env);
  const baseUrl = String(env.GUARDIAN_PUBLIC_BASE_URL || DEFAULT_GUARDIAN_PUBLIC_BASE_URL).replace(/\/+$/, '');
  const response = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/setWebhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      url: `${baseUrl}/integrations/telegram/webhook`,
      secret_token: await telegramWebhookSecret(env),
      allowed_updates: ['message'],
      drop_pending_updates: false,
    }),
  });
  if (!response.ok) throw new Error(`TELEGRAM_WEBHOOK_HTTP_${response.status}`);
  const payload = await response.json<{ ok?: boolean }>().catch(() => ({} as { ok?: boolean }));
  if (payload.ok !== true) throw new Error('TELEGRAM_WEBHOOK_INVALID_RESPONSE');
  return bot;
}

export async function createTelegramPairingSession(
  env: Env,
  accountId: string,
  now = Date.now(),
): Promise<{ pairingId: string; connectUrl: string; expiresAt: number }> {
  const bot = await ensureTelegramWebhook(env);
  const rawToken = bytesToBase64Url(crypto.getRandomValues(new Uint8Array(24)));
  const tokenHash = await sha256Hex(rawToken);
  const pairingId = crypto.randomUUID();
  const expiresAt = now + TELEGRAM_PAIRING_TTL_MS;
  await env.DB.prepare(
    `UPDATE telegram_pairing_sessions_v1
     SET status = 'expired', updated_at = ?
     WHERE account_id = ? AND status = 'pending'`
  ).bind(now, accountId).run();
  await env.DB.prepare(
    `INSERT INTO telegram_pairing_sessions_v1
     (id, account_id, token_hash, bot_id, status, expires_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'pending', ?, ?, ?)`
  ).bind(pairingId, accountId, tokenHash, bot.id, expiresAt, now, now).run();
  return {
    pairingId,
    connectUrl: `https://t.me/${encodeURIComponent(bot.username)}?start=${encodeURIComponent(rawToken)}`,
    expiresAt,
  };
}

export async function consumeTelegramPairingToken(
  env: Env,
  rawToken: string,
  chatId: string,
  chatType: string,
  now = Date.now(),
): Promise<'connected' | 'invalid' | 'expired' | 'replayed' | 'unsupported_chat'> {
  if (chatType !== 'private') return 'unsupported_chat';
  const currentBotId = telegramBotIdFromToken(env.TELEGRAM_BOT_TOKEN);
  if (!currentBotId) return 'invalid';
  const tokenHash = await sha256Hex(String(rawToken || '').trim());
  const session = await env.DB.prepare(
    `SELECT id, account_id, bot_id, status, expires_at
     FROM telegram_pairing_sessions_v1 WHERE token_hash = ?`
  ).bind(tokenHash).first<{
    id: string;
    account_id: string;
    bot_id: string;
    status: string;
    expires_at: number;
  }>();
  if (!session) return 'invalid';
  if (session.status !== 'pending') return 'replayed';
  if (Number(session.expires_at || 0) <= now || session.bot_id !== currentBotId) {
    await env.DB.prepare(
      `UPDATE telegram_pairing_sessions_v1 SET status = 'expired', updated_at = ? WHERE id = ? AND status = 'pending'`
    ).bind(now, session.id).run();
    return 'expired';
  }

  const bot = await getTelegramBotIdentity(env);
  const consumed = await env.DB.prepare(
    `UPDATE telegram_pairing_sessions_v1
     SET status = 'connected', consumed_at = ?, updated_at = ?
     WHERE id = ? AND status = 'pending' AND expires_at > ?`
  ).bind(now, now, session.id, now).run();
  if (Number(consumed.meta?.changes || 0) !== 1) return 'replayed';
  await env.DB.prepare(
    `INSERT INTO account_notification_settings_v1
     (account_id, email_enabled, telegram_enabled, telegram_chat_id, telegram_bot_id,
      telegram_bot_username, telegram_connected_at, created_at, updated_at)
     VALUES (?, 0, 0, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(account_id) DO UPDATE SET
       telegram_enabled = 0,
       telegram_chat_id = excluded.telegram_chat_id,
       telegram_bot_id = excluded.telegram_bot_id,
       telegram_bot_username = excluded.telegram_bot_username,
       telegram_connected_at = excluded.telegram_connected_at,
       updated_at = excluded.updated_at`
  ).bind(session.account_id, chatId, bot.id, bot.username, now, now, now).run();
  return 'connected';
}
