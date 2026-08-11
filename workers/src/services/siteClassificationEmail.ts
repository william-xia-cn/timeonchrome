import PostalMime from 'postal-mime';
import { canonicalSiteIdentityHost } from '../../../extension/core/domain-semantics.js';
import { resolveSiteAccessClassification } from '../../../extension/core/site-classification.js';
import type { Env } from '../db/middleware';
import {
  decideSiteClassificationRequest,
  ensureUnclassifiedSiteRequest,
  getProfileSiteAccessConfig,
} from '../routes/siteClassificationRequests';

const NOTIFICATION_TYPE = 'daily_unclassified_15m';
const THRESHOLD_SECONDS = 900;
const TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_EMAIL_BYTES = 1024 * 1024;
const RETRY_DELAYS_MS = [5 * 60 * 1000, 30 * 60 * 1000, 2 * 60 * 60 * 1000];
const COMMAND_DECISIONS: Record<string, string> = {
  '学习': 'study',
  '复合': 'composite',
  '受限娱乐': 'reject',
  '黑名单': 'blocked',
  '暂不处理': 'return',
};

type UsageAggregate = {
  canonicalHost: string;
  totalSeconds: number;
  firstSeenAt: number;
  lastSeenAt: number;
  observationCount: number;
  dayEndMs: number;
};

type NotificationRow = {
  id: string;
  profile_id: string;
  request_id: string;
  account_id: string;
  canonical_host: string;
  usage_date: string;
  observed_seconds: number;
  status: string;
  expires_at: number;
  attempt_count: number;
  child_name?: string;
  email?: string;
  request_status?: string;
};

export function isEmailClassificationEnabled(env: Env): boolean {
  return /^(1|true|enabled|on)$/i.test(String(env.EMAIL_CLASSIFICATION_ENABLED || '').trim());
}

export function isEmailClassificationProfileEnabled(env: Env, profileId: string): boolean {
  if (!isEmailClassificationEnabled(env)) return false;
  const allowed = String(env.EMAIL_CLASSIFICATION_PROFILE_IDS || '')
    .split(/[\s,;]+/)
    .map((value) => value.trim())
    .filter(Boolean);
  return allowed.includes('*') || allowed.includes(String(profileId || '').trim());
}

function normalizeObservedHost(value: unknown): string | null {
  let raw = String(value || '').trim().toLowerCase();
  if (!raw) return null;
  raw = raw.replace(/^(host|domain|fallback|url):/i, '');
  raw = raw.replace(/^https?:\/\//i, '').replace(/\/.*$/g, '').replace(/\.+$/g, '');
  if (!raw || raw.includes(' ') || raw.includes('@') || raw.startsWith('chrome')) return null;
  try {
    const host = new URL(`http://${raw}`).hostname.toLowerCase().replace(/\.+$/g, '');
    return canonicalSiteIdentityHost(host) || host || null;
  } catch {
    return null;
  }
}

function fallbackDayEndMs(date: string): number {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) return 0;
  return Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]) + 1) - 8 * 60 * 60 * 1000;
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlToBytes(value: string): Uint8Array | null {
  try {
    const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized + '='.repeat((4 - normalized.length % 4) % 4);
    const binary = atob(padded);
    return Uint8Array.from(binary, (char) => char.charCodeAt(0));
  } catch {
    return null;
  }
}

function randomPublicId(): string {
  return bytesToBase64Url(crypto.getRandomValues(new Uint8Array(8)));
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
}

async function createSignedToken(notificationId: string, secret: string): Promise<string> {
  const key = await hmacKey(secret);
  const payload = new TextEncoder().encode(`v1:${notificationId}`);
  const signature = new Uint8Array(await crypto.subtle.sign('HMAC', key, payload));
  return `${notificationId}.${bytesToBase64Url(signature)}`;
}

async function verifySignedToken(token: string, secret: string): Promise<string | null> {
  const separator = token.indexOf('.');
  if (separator <= 0) return null;
  const notificationId = token.slice(0, separator);
  const signature = base64UrlToBytes(token.slice(separator + 1));
  if (!/^[A-Za-z0-9_-]{11}$/.test(notificationId) || !signature) return null;
  const key = await hmacKey(secret);
  const payload = new TextEncoder().encode(`v1:${notificationId}`);
  const signatureBuffer = signature.slice().buffer as ArrayBuffer;
  return await crypto.subtle.verify('HMAC', key, signatureBuffer, payload) ? notificationId : null;
}

function replyTokenFromRecipient(value: unknown): string | null {
  const match = /^reply\+([^@]+)@hornburg-xia\.uk$/i.exec(String(value || '').trim());
  return match?.[1] || null;
}

async function sha256Hex(value: string): Promise<string> {
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatDuration(seconds: number): string {
  const minutes = Math.floor(Math.max(0, seconds) / 60);
  const remainder = Math.max(0, seconds) % 60;
  return remainder ? `${minutes} 分 ${remainder} 秒` : `${minutes} 分钟`;
}

async function sendResendEmail(
  env: Env,
  input: { from?: string; to: string; subject: string; text: string; html: string; replyTo?: string; headers?: Record<string, string> },
): Promise<string | null> {
  if (!env.RESEND_API_KEY) throw new Error('RESEND_API_KEY_MISSING');
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${env.RESEND_API_KEY}`,
    },
    body: JSON.stringify({
      from: input.from || 'TimeOnChrome <notify@hornburg-xia.uk>',
      to: [input.to],
      subject: input.subject,
      text: input.text,
      html: input.html,
      ...(input.replyTo ? { reply_to: input.replyTo } : {}),
      ...(input.headers ? { headers: input.headers } : {}),
    }),
  });
  if (!response.ok) throw new Error(`RESEND_HTTP_${response.status}`);
  const result: { id?: string } = await response.json<{ id?: string }>().catch(() => ({}));
  return result.id || null;
}

async function loadDailyUsageAggregates(env: Env, profileId: string, date: string): Promise<UsageAggregate[]> {
  const rows = await env.DB.prepare(
    `SELECT timezone, day_end_ms, target_key, managed_target_value,
            managed_target_label_at_time, fallback_domain,
            duration_seconds, segments_count, first_seen_at, last_seen_at
     FROM target_stats_v1
     WHERE profile_id = ? AND date = ?
       AND target_classification_at_time IN ('unclassified', 'pending_composite')`
  ).bind(profileId, date).all<any>();

  const aggregates = new Map<string, UsageAggregate>();
  for (const row of rows.results || []) {
    const host = normalizeObservedHost(
      row.fallback_domain || row.managed_target_value || row.managed_target_label_at_time || row.target_key,
    );
    if (!host) continue;
    const current = aggregates.get(host) || {
      canonicalHost: host,
      totalSeconds: 0,
      firstSeenAt: Number(row.first_seen_at || 0) || Date.now(),
      lastSeenAt: Number(row.last_seen_at || 0) || Date.now(),
      observationCount: 0,
      dayEndMs: Number(row.day_end_ms || 0) || fallbackDayEndMs(date),
    };
    current.totalSeconds += Math.max(0, Math.trunc(Number(row.duration_seconds || 0)));
    current.observationCount += Math.max(0, Math.trunc(Number(row.segments_count || 0)));
    current.firstSeenAt = Math.min(current.firstSeenAt, Number(row.first_seen_at || current.firstSeenAt));
    current.lastSeenAt = Math.max(current.lastSeenAt, Number(row.last_seen_at || current.lastSeenAt));
    current.dayEndMs = Math.max(current.dayEndMs, Number(row.day_end_ms || 0) || fallbackDayEndMs(date));
    aggregates.set(host, current);
  }
  return Array.from(aggregates.values());
}

export async function evaluateDailyUnclassifiedEmailNotifications(
  env: Env,
  profileId: string,
  date: string,
  now = Date.now(),
): Promise<{ evaluated: boolean; queued: number }> {
  if (!isEmailClassificationProfileEnabled(env, profileId)) return { evaluated: false, queued: 0 };
  if (!env.EMAIL_ACTION_SECRET) throw new Error('EMAIL_ACTION_SECRET_MISSING');

  const profile = await env.DB.prepare(
    `SELECT p.account_id, a.email
     FROM profiles p JOIN accounts a ON a.id = p.account_id
     WHERE p.id = ?`
  ).bind(profileId).first<{ account_id: string; email: string }>();
  if (!profile?.account_id || !profile.email) return { evaluated: true, queued: 0 };

  const aggregates = await loadDailyUsageAggregates(env, profileId, date);
  let queued = 0;
  for (const usage of aggregates) {
    if (usage.totalSeconds < THRESHOLD_SECONDS) continue;
    if (!usage.dayEndMs || now > usage.dayEndMs + 24 * 60 * 60 * 1000) continue;

    const ensured = await ensureUnclassifiedSiteRequest(env, profileId, {
      targetValue: usage.canonicalHost,
      firstObservedAt: usage.firstSeenAt,
      lastObservedAt: usage.lastSeenAt,
      observationCount: Math.max(1, usage.observationCount),
      observationSourceId: `email-threshold:${date}:${usage.canonicalHost}`,
      observationDeviceId: 'cloud-email-threshold',
    });
    if (!ensured.ok || ensured.alreadyClassified || !ensured.request?.id) continue;

    const notificationId = randomPublicId();
    const insert = await env.DB.prepare(
      `INSERT OR IGNORE INTO site_classification_email_notifications_v1
       (id, notification_type, profile_id, request_id, account_id, canonical_host,
        usage_date, threshold_seconds, observed_seconds, status, expires_at,
        attempt_count, next_attempt_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'queued', ?, 0, ?, ?, ?)`
    ).bind(
      notificationId,
      NOTIFICATION_TYPE,
      profileId,
      ensured.request.id,
      profile.account_id,
      usage.canonicalHost,
      date,
      THRESHOLD_SECONDS,
      usage.totalSeconds,
      now + TOKEN_TTL_MS,
      now,
      now,
      now,
    ).run();
    if (Number(insert.meta?.changes || 0) === 1) queued++;
  }
  return { evaluated: true, queued };
}

async function markNotificationTerminal(env: Env, id: string, status: string, errorCode: string | null, now: number) {
  await env.DB.prepare(
    `UPDATE site_classification_email_notifications_v1
     SET status = ?, last_error_code = ?, next_attempt_at = NULL, updated_at = ?
     WHERE id = ?`
  ).bind(status, errorCode, now, id).run();
}

async function deliverNotification(env: Env, notification: NotificationRow, now: number): Promise<void> {
  if (!env.EMAIL_ACTION_SECRET) throw new Error('EMAIL_ACTION_SECRET_MISSING');
  if (notification.request_status !== 'pending') {
    await markNotificationTerminal(env, notification.id, 'superseded', 'REQUEST_NOT_PENDING', now);
    return;
  }
  if (!notification.email) {
    await markNotificationTerminal(env, notification.id, 'send_failed', 'RECIPIENT_MISSING', now);
    return;
  }

  const config = await getProfileSiteAccessConfig(env, notification.profile_id);
  const current = resolveSiteAccessClassification(config || {}, [], notification.canonical_host);
  if (current.classification && current.classification !== 'unclassified' && current.classification !== 'pending_composite') {
    await markNotificationTerminal(env, notification.id, 'superseded', 'ALREADY_CLASSIFIED', now);
    return;
  }

  const token = await createSignedToken(notification.id, env.EMAIL_ACTION_SECRET);
  const replyTo = `reply+${token}@hornburg-xia.uk`;
  const duration = formatDuration(Number(notification.observed_seconds || 0));
  const childName = notification.child_name || '孩子档案';
  const subject = `[TimeOnChrome] ${childName} 使用未归类网站已超过 15 分钟`;
  const commands = '请直接回复一条命令：学习、复合、受限娱乐、黑名单、暂不处理。';
  const text = `${childName} 在 ${notification.usage_date} 使用未归类网站 ${notification.canonical_host}，累计 ${duration}。\n\n${commands}\n\n回复命令 7 天内有效，且仅在记录仍待处理时生效。`;
  const html = `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;line-height:1.7;color:#18342d"><h2>未归类网站需要确认</h2><p><strong>${escapeHtml(childName)}</strong> 在 ${escapeHtml(notification.usage_date)} 使用 <strong>${escapeHtml(notification.canonical_host)}</strong>，累计 ${escapeHtml(duration)}。</p><p>${escapeHtml(commands)}</p><p style="color:#637c75;font-size:13px">回复命令 7 天内有效，且仅在记录仍待处理时生效。</p></div>`;
  const outboundId = await sendResendEmail(env, {
    from: `TimeOnChrome <${replyTo}>`,
    to: notification.email,
    subject,
    text,
    html,
    replyTo,
  });
  await env.DB.prepare(
    `UPDATE site_classification_email_notifications_v1
     SET status = 'sent', sent_at = ?, outbound_message_id = ?, attempt_count = attempt_count + 1,
         next_attempt_at = NULL, last_error_code = NULL, updated_at = ?
     WHERE id = ?`
  ).bind(now, outboundId, now, notification.id).run();
}

export async function processEmailClassificationOutbox(
  env: Env,
  options: { notificationId?: string; now?: number } = {},
): Promise<{ processed: number; sent: number; failed: number }> {
  if (!isEmailClassificationEnabled(env)) return { processed: 0, sent: 0, failed: 0 };
  const now = options.now ?? Date.now();
  const where = options.notificationId
    ? `n.id = ? AND n.status IN ('queued', 'retry')`
    : `n.status IN ('queued', 'retry') AND COALESCE(n.next_attempt_at, 0) <= ?`;
  const rows = await env.DB.prepare(
    `SELECT n.*, p.name AS child_name, a.email, r.status AS request_status
     FROM site_classification_email_notifications_v1 n
     JOIN profiles p ON p.id = n.profile_id
     JOIN accounts a ON a.id = n.account_id
     JOIN site_classification_requests_v1 r ON r.id = n.request_id
     WHERE ${where}
     ORDER BY n.created_at ASC
     LIMIT 50`
  ).bind(options.notificationId || now).all<NotificationRow>();

  let sent = 0;
  let failed = 0;
  for (const row of rows.results || []) {
    if (!isEmailClassificationProfileEnabled(env, row.profile_id)) continue;
    try {
      await deliverNotification(env, row, now);
      const current = await env.DB.prepare(
        `SELECT status FROM site_classification_email_notifications_v1 WHERE id = ?`
      ).bind(row.id).first<{ status: string }>();
      if (current?.status === 'sent') sent++;
    } catch (error: any) {
      failed++;
      const attempts = Number(row.attempt_count || 0) + 1;
      const retryDelay = RETRY_DELAYS_MS[attempts - 1];
      const status = attempts >= 4 || retryDelay == null ? 'send_failed' : 'retry';
      await env.DB.prepare(
        `UPDATE site_classification_email_notifications_v1
         SET status = ?, attempt_count = ?, next_attempt_at = ?, last_error_code = ?, updated_at = ?
         WHERE id = ?`
      ).bind(
        status,
        attempts,
        status === 'retry' ? now + retryDelay : null,
        String(error?.message || 'EMAIL_SEND_FAILED').slice(0, 120),
        now,
        row.id,
      ).run();
    }
  }
  return { processed: (rows.results || []).length, sent, failed };
}

function firstReplyCommand(text: string): string {
  for (const line of String(text || '').split(/\r?\n/)) {
    const value = line.trim();
    if (!value) continue;
    if (value.startsWith('>') || /^On .+wrote:$/i.test(value) || /^在.+写道[:：]?$/.test(value)) break;
    return value;
  }
  return '';
}

async function insertReplyEvent(
  env: Env,
  input: { notificationId: string | null; messageIdHash: string; command: string | null; senderMatch: boolean; resultCode: string; now: number },
): Promise<boolean> {
  const result = await env.DB.prepare(
    `INSERT OR IGNORE INTO site_classification_email_reply_events_v1
     (id, notification_id, inbound_message_id_hash, command, sender_match, result_code, received_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    crypto.randomUUID(),
    input.notificationId,
    input.messageIdHash,
    input.command,
    input.senderMatch ? 1 : 0,
    input.resultCode,
    input.now,
    input.now,
  ).run();
  return Number(result.meta?.changes || 0) === 1;
}

async function updateReplyEvent(env: Env, messageIdHash: string, resultCode: string) {
  await env.DB.prepare(
    `UPDATE site_classification_email_reply_events_v1 SET result_code = ? WHERE inbound_message_id_hash = ?`
  ).bind(resultCode, messageIdHash).run();
}

async function sendReplyStatus(
  env: Env,
  to: string,
  subject: string,
  body: string,
  originalMessageId: string,
  replyTo?: string,
) {
  await sendResendEmail(env, {
    to,
    subject: /^Re:/i.test(subject) ? subject : `Re: ${subject || '[TimeOnChrome] 网站归类'}`,
    text: body,
    html: `<p>${escapeHtml(body).replace(/\n/g, '<br>')}</p>`,
    replyTo,
    headers: originalMessageId ? { 'In-Reply-To': originalMessageId, 'References': originalMessageId } : undefined,
  });
}

async function trySendReplyStatus(
  env: Env,
  to: string,
  subject: string,
  body: string,
  originalMessageId: string,
  replyTo?: string,
) {
  try {
    await sendReplyStatus(env, to, subject, body, originalMessageId, replyTo);
  } catch (error: any) {
    console.warn('[site-classification-email] reply status send failed', {
      error: String(error?.message || error || 'unknown').slice(0, 160),
    });
  }
}

export async function handleSiteClassificationReplyEmail(
  message: ForwardableEmailMessage,
  env: Env,
): Promise<void> {
  const now = Date.now();
  const recipient = String(message.to || '').trim();
  const replyToken = replyTokenFromRecipient(recipient);
  if (!isEmailClassificationEnabled(env) || !env.EMAIL_ACTION_SECRET || !replyToken) {
    message.setReject('Unknown or disabled TimeOnChrome reply address');
    return;
  }
  if (Number(message.rawSize || 0) > MAX_EMAIL_BYTES) {
    message.setReject('Message too large');
    return;
  }

  const notificationId = await verifySignedToken(replyToken, env.EMAIL_ACTION_SECRET);
  if (!notificationId) {
    message.setReject('Invalid TimeOnChrome reply token');
    return;
  }
  const notification = await env.DB.prepare(
    `SELECT n.*, a.email, r.status AS request_status
     FROM site_classification_email_notifications_v1 n
     JOIN accounts a ON a.id = n.account_id
     JOIN site_classification_requests_v1 r ON r.id = n.request_id
     WHERE n.id = ?`
  ).bind(notificationId).first<NotificationRow>();
  if (!notification) {
    message.setReject('Unknown TimeOnChrome reply token');
    return;
  }
  if (!isEmailClassificationProfileEnabled(env, notification.profile_id)) {
    message.setReject('TimeOnChrome email classification is not enabled for this profile');
    return;
  }

  const raw = await new Response(message.raw).arrayBuffer();
  const parsed = await PostalMime.parse(raw);
  const command = firstReplyCommand(parsed.text || '');
  const originalMessageId = message.headers.get('message-id') || '';
  if (!originalMessageId) {
    message.setReject('Message-ID required');
    return;
  }
  const messageIdHash = await sha256Hex(originalMessageId.trim().toLowerCase());
  const sender = String(message.from || '').trim().toLowerCase();
  const senderMatch = sender === String(notification.email || '').trim().toLowerCase();
  const inserted = await insertReplyEvent(env, {
    notificationId,
    messageIdHash,
    command: command || null,
    senderMatch,
    resultCode: 'RECEIVED',
    now,
  });
  if (!inserted) return;

  if (!senderMatch) {
    await updateReplyEvent(env, messageIdHash, 'SENDER_MISMATCH');
    message.setReject('Sender does not match the TimeOnChrome parent account');
    return;
  }
  if (notification.expires_at < now) {
    await updateReplyEvent(env, messageIdHash, 'TOKEN_EXPIRED');
    await trySendReplyStatus(env, sender, parsed.subject || '', '此归类邮件已超过 7 天有效期，请在家长控制台查看当前状态。', originalMessageId);
    return;
  }
  if (notification.status !== 'sent' || notification.request_status !== 'pending') {
    await updateReplyEvent(env, messageIdHash, 'ALREADY_PROCESSED');
    await trySendReplyStatus(env, sender, parsed.subject || '', '这条网站归类记录已经处理，未再次修改配置。', originalMessageId);
    return;
  }

  const decision = COMMAND_DECISIONS[command];
  if (!decision) {
    await updateReplyEvent(env, messageIdHash, 'UNKNOWN_COMMAND');
    await trySendReplyStatus(
      env,
      sender,
      parsed.subject || '',
      '未识别回复命令。请只回复一项：学习、复合、受限娱乐、黑名单、暂不处理。',
      originalMessageId,
      recipient,
    );
    return;
  }

  const result = await decideSiteClassificationRequest(env, {
    profileId: notification.profile_id,
    requestId: notification.request_id,
    decision,
    targetType: 'host',
    targetValue: notification.canonical_host,
  });
  if (!result.ok) {
    await updateReplyEvent(env, messageIdHash, String(result.code || 'DECISION_FAILED'));
    await trySendReplyStatus(env, sender, parsed.subject || '', `归类未执行：${String(result.error || '当前记录不可处理')}。`, originalMessageId);
    return;
  }

  await env.DB.batch([
    env.DB.prepare(
      `UPDATE site_classification_email_notifications_v1
       SET status = 'consumed', consumed_at = ?, decision = ?, updated_at = ?
       WHERE id = ? AND status = 'sent'`
    ).bind(now, decision, now, notification.id),
    env.DB.prepare(
      `UPDATE site_classification_email_notifications_v1
       SET status = 'superseded', updated_at = ?
       WHERE request_id = ? AND id != ? AND status IN ('queued', 'retry', 'sent')`
    ).bind(now, notification.request_id, notification.id),
  ]);
  await updateReplyEvent(env, messageIdHash, 'DECISION_APPLIED');
  await trySendReplyStatus(env, sender, parsed.subject || '', `已处理：${notification.canonical_host} → ${command}。`, originalMessageId);
}
