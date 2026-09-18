// Account notification channels and profile notification feature boundaries.
// Run with: node tests/unit/profile-notification-settings.test.js

'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ts = require('typescript');
const { DatabaseSync } = require('node:sqlite');
const { webcrypto } = require('node:crypto');

let passed = 0;
let failed = 0;

function expectTrue(desc, condition) {
  if (condition) passed++;
  else {
    failed++;
    console.error('  x ' + desc);
  }
}

function expectEqual(desc, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) passed++;
  else {
    failed++;
    console.error('  x ' + desc);
    console.error('    expected: ' + JSON.stringify(expected));
    console.error('    actual:   ' + JSON.stringify(actual));
  }
}

function extractFunction(source, name) {
  const markers = ['export async function ' + name, 'export function ' + name, 'async function ' + name, 'function ' + name];
  const start = markers.map((marker) => source.indexOf(marker)).find((index) => index >= 0);
  if (start == null || start < 0) throw new Error('Unable to locate ' + name);
  const brace = source.indexOf('{', start);
  let depth = 0;
  for (let index = brace; index < source.length; index++) {
    if (source[index] === '{') depth++;
    if (source[index] === '}') depth--;
    if (depth === 0) return source.slice(start, index + 1).replace(/^export\s+/, '');
  }
  throw new Error('Unable to parse ' + name);
}

function loadHelpers(settingsSource, notificationSource, fetchImpl) {
  const snippet = [
    "const DEFAULT_PROFILE_UNCLASSIFIED_NOTIFICATION_SETTINGS = { enabled: false, thresholdMinutes: 30 };",
    extractFunction(settingsSource, 'telegramBotIdFromToken'),
    extractFunction(settingsSource, 'normalizeProfileUnclassifiedNotificationSettings'),
    extractFunction(notificationSource, 'sendTelegramMessage'),
    'this.__helpers = { telegramBotIdFromToken, normalizeProfileUnclassifiedNotificationSettings, sendTelegramMessage };',
  ].join('\n');
  const compiled = ts.transpileModule(snippet, {
    compilerOptions: { module: ts.ModuleKind.None, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const context = { console, fetch: fetchImpl };
  context.this = context;
  vm.createContext(context);
  vm.runInContext(compiled, context, { filename: 'notification-settings.vm.js' });
  return context.__helpers;
}

function loadTsModule(source, filename, mocks = {}, globals = {}) {
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
  }).outputText;
  const module = { exports: {} };
  const context = {
    module,
    exports: module.exports,
    require(specifier) {
      if (Object.prototype.hasOwnProperty.call(mocks, specifier)) return mocks[specifier];
      throw new Error('Unexpected require: ' + specifier);
    },
    console,
    crypto: webcrypto,
    fetch: globals.fetch || globalThis.fetch,
    btoa: globalThis.btoa,
    TextEncoder: globalThis.TextEncoder,
    URL,
    Request,
    Response,
    ...globals,
  };
  vm.createContext(context);
  vm.runInContext(compiled, context, { filename });
  return module.exports;
}

function createD1Adapter(database) {
  return {
    prepare(sql) {
      let params = [];
      const statement = {
        bind(...values) {
          params = values;
          return statement;
        },
        async first() {
          return database.prepare(sql).get(...params) || null;
        },
        async run() {
          const result = database.prepare(sql).run(...params);
          return { meta: { changes: Number(result.changes || 0) } };
        },
        async all() {
          return { results: database.prepare(sql).all(...params) };
        },
      };
      return statement;
    },
  };
}

function telegramFetch(url) {
  const value = String(url);
  if (value.includes('/getMe')) {
    return Promise.resolve(new Response(JSON.stringify({
      ok: true,
      result: { id: 123456789, username: 'TimeOnChromeGuardianBot' },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
  }
  if (value.includes('/setWebhook')) {
    return Promise.resolve(new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }));
  }
  throw new Error('Unexpected Telegram request: ' + value);
}

async function run() {
  const root = path.join(__dirname, '..', '..');
  const settingsSource = fs.readFileSync(path.join(root, 'workers/src/services/notificationSettings.ts'), 'utf8');
  const notificationSource = fs.readFileSync(path.join(root, 'workers/src/services/siteClassificationEmail.ts'), 'utf8');
  const routeSource = fs.readFileSync(path.join(root, 'workers/src/routes/notificationSettings.ts'), 'utf8');
  const indexSource = fs.readFileSync(path.join(root, 'workers/src/index.ts'), 'utf8');
  const migration = fs.readFileSync(path.join(root, 'workers/migrations/030_profile_notification_channels_v1.sql'), 'utf8');
  const pagesSource = fs.readFileSync(path.join(root, 'pages/index.html'), 'utf8');
  const adminSource = fs.readFileSync(path.join(root, 'extension/admin/admin.html'), 'utf8');
  const calls = [];
  const helpers = loadHelpers(settingsSource, notificationSource, async (url, options) => {
    calls.push({ url, options });
    return {
      ok: true,
      status: 200,
      async json() { return { ok: true, result: { message_id: 42 } }; },
    };
  });

  expectEqual('missing profile feature settings default off at 30 minutes', helpers.normalizeProfileUnclassifiedNotificationSettings({}), {
    enabled: false,
    thresholdMinutes: 30,
  });
  expectEqual('profile feature explicitly enables', helpers.normalizeProfileUnclassifiedNotificationSettings({ enabled: true }).enabled, true);
  expectEqual('threshold lower boundary is accepted', helpers.normalizeProfileUnclassifiedNotificationSettings({ thresholdMinutes: 1 }).thresholdMinutes, 1);
  expectEqual('threshold upper boundary is accepted', helpers.normalizeProfileUnclassifiedNotificationSettings({ thresholdMinutes: 1440 }).thresholdMinutes, 1440);
  expectEqual('invalid threshold falls back to 30', helpers.normalizeProfileUnclassifiedNotificationSettings({ thresholdMinutes: 1.5 }).thresholdMinutes, 30);
  expectEqual('bot identity is derived without exposing token secret', helpers.telegramBotIdFromToken('123456789:abcdefghijklmnopqrstuvwxyz'), '123456789');
  expectEqual('invalid bot token has no identity', helpers.telegramBotIdFromToken('not-a-token'), '');

  const messageId = await helpers.sendTelegramMessage({ TELEGRAM_BOT_TOKEN: '123456789:abcdefghijklmnopqrstuvwxyz' }, '123456', 'hello');
  expectEqual('Telegram sender returns message id', messageId, '42');
  expectEqual('Telegram sender makes one request', calls.length, 1);
  expectTrue('Telegram sender calls Bot API with server secret', calls[0].url.includes('/sendMessage'));
  expectEqual('Telegram sender body contains only delivery fields', JSON.parse(calls[0].options.body), {
    chat_id: '123456',
    text: 'hello',
    disable_web_page_preview: true,
  });

  expectTrue('migration separates account channel settings', migration.includes('account_notification_settings_v1'));
  expectTrue('migration separates profile feature settings', migration.includes('profile_unclassified_notification_settings_v1'));
  expectTrue('migration creates one-time pairing sessions', migration.includes('telegram_pairing_sessions_v1'));
  expectTrue('pairing table stores token hash but never raw token', migration.includes('token_hash') && !migration.includes('raw_token'));
  expectTrue('migration creates independent Telegram outbox', migration.includes('site_classification_telegram_notifications_v1'));
  expectTrue('all channel and feature defaults are disabled', migration.includes('email_enabled') && migration.includes('DEFAULT 0') && migration.includes('enabled             INTEGER NOT NULL DEFAULT 0'));
  expectTrue('migration never stores Bot token', !migration.includes('bot_token'));

  const database = new DatabaseSync(':memory:');
  database.exec(
    'CREATE TABLE accounts (id TEXT PRIMARY KEY);' +
    'CREATE TABLE profiles (id TEXT PRIMARY KEY, account_id TEXT);' +
    'CREATE TABLE site_classification_requests_v1 (id TEXT PRIMARY KEY);' +
    migration
  );
  const tables = database.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map((row) => row.name);
  expectTrue('migration executes and creates all D-097 tables', [
    'account_notification_settings_v1',
    'profile_unclassified_notification_settings_v1',
    'telegram_pairing_sessions_v1',
    'site_classification_telegram_notifications_v1',
  ].every((name) => tables.includes(name)));

  const settingsModule = loadTsModule(settingsSource, 'notification-settings.ts', {}, { fetch: telegramFetch });
  const DB = createD1Adapter(database);
  const baseEnv = {
    DB,
    JWT_SECRET: 'test-jwt-secret',
    TELEGRAM_BOT_TOKEN: '123456789:abcdefghijklmnopqrstuvwxyz',
    GUARDIAN_PUBLIC_BASE_URL: 'https://guardian.example.test',
  };
  database.exec("INSERT INTO accounts(id) VALUES ('account-a'), ('account-b')");
  database.exec("INSERT INTO profiles(id, account_id) VALUES ('profile-a', 'account-a'), ('profile-b', 'account-b')");
  database.exec(
    "INSERT INTO account_notification_settings_v1 " +
    "(account_id, email_enabled, telegram_enabled, telegram_chat_id, telegram_bot_id, telegram_bot_username, telegram_connected_at, created_at, updated_at) " +
    "VALUES ('account-b', 1, 1, 'chat-b', '123456789', 'TimeOnChromeGuardianBot', 1, 1, 1)"
  );

  const defaultAccountA = await settingsModule.loadAccountNotificationSettings(baseEnv, 'account-a');
  const configuredAccountB = await settingsModule.loadAccountNotificationSettings(baseEnv, 'account-b');
  expectEqual('account settings default off for an unconfigured account', {
    emailEnabled: defaultAccountA.emailEnabled,
    telegramEnabled: defaultAccountA.telegramEnabled,
    telegramConnected: defaultAccountA.telegramConnected,
  }, { emailEnabled: false, telegramEnabled: false, telegramConnected: false });
  expectEqual('account channel settings remain isolated by account id', {
    emailEnabled: configuredAccountB.emailEnabled,
    telegramEnabled: configuredAccountB.telegramEnabled,
    telegramChatId: configuredAccountB.telegramChatId,
  }, { emailEnabled: true, telegramEnabled: true, telegramChatId: 'chat-b' });

  const pairing = await settingsModule.createTelegramPairingSession(baseEnv, 'account-a', 1_000_000);
  const pairingToken = new URL(pairing.connectUrl).searchParams.get('start');
  const storedPairing = database.prepare(
    'SELECT account_id, token_hash, status, expires_at FROM telegram_pairing_sessions_v1 WHERE id = ?'
  ).get(pairing.pairingId);
  expectTrue('pairing returns a deep link token but stores only its hash', Boolean(pairingToken)
    && storedPairing.token_hash !== pairingToken
    && storedPairing.token_hash.length === 64);
  expectEqual('pairing expires after exactly ten minutes', storedPairing.expires_at, 1_600_000);
  expectEqual('group chats cannot consume a pairing token', await settingsModule.consumeTelegramPairingToken(
    baseEnv, pairingToken, 'group-chat', 'group', 1_100_000
  ), 'unsupported_chat');
  expectEqual('private chat consumes a valid pairing token once', await settingsModule.consumeTelegramPairingToken(
    baseEnv, pairingToken, 'chat-a', 'private', 1_100_000
  ), 'connected');
  expectEqual('consumed pairing token cannot be replayed', await settingsModule.consumeTelegramPairingToken(
    baseEnv, pairingToken, 'attacker-chat', 'private', 1_100_001
  ), 'replayed');
  const connectedAccountA = database.prepare(
    'SELECT telegram_chat_id, telegram_enabled FROM account_notification_settings_v1 WHERE account_id = ?'
  ).get('account-a');
  const untouchedAccountB = database.prepare(
    'SELECT telegram_chat_id, telegram_enabled FROM account_notification_settings_v1 WHERE account_id = ?'
  ).get('account-b');
  expectEqual('pairing binds only the account encoded in the server-side session', connectedAccountA, {
    telegram_chat_id: 'chat-a',
    telegram_enabled: 0,
  });
  expectEqual('pairing another account does not alter an existing destination', untouchedAccountB, {
    telegram_chat_id: 'chat-b',
    telegram_enabled: 1,
  });

  const expiredPairing = await settingsModule.createTelegramPairingSession(baseEnv, 'account-a', 2_000_000);
  const expiredToken = new URL(expiredPairing.connectUrl).searchParams.get('start');
  expectEqual('expired pairing token is rejected and marked expired', await settingsModule.consumeTelegramPairingToken(
    baseEnv, expiredToken, 'late-chat', 'private', 2_600_001
  ), 'expired');
  expectEqual('expired pairing status is persisted', database.prepare(
    'SELECT status FROM telegram_pairing_sessions_v1 WHERE id = ?'
  ).get(expiredPairing.pairingId).status, 'expired');

  database.prepare(
    "UPDATE account_notification_settings_v1 SET telegram_enabled = 1 WHERE account_id = 'account-b'"
  ).run();
  const rotatedEnv = {
    ...baseEnv,
    TELEGRAM_BOT_TOKEN: '987654321:zyxwvutsrqponmlkjihgfedcba',
  };
  const rotatedSettings = await settingsModule.loadAccountNotificationSettings(rotatedEnv, 'account-b');
  expectEqual('Bot identity rotation invalidates the old Telegram destination', {
    telegramEnabled: rotatedSettings.telegramEnabled,
    telegramConnected: rotatedSettings.telegramConnected,
    status: rotatedSettings.telegramConnectionStatus,
    chatId: rotatedSettings.telegramChatId,
  }, {
    telegramEnabled: false,
    telegramConnected: false,
    status: 'reconnect_required',
    chatId: '',
  });

  const webhookPairing = await settingsModule.createTelegramPairingSession(baseEnv, 'account-a', Date.now());
  const webhookToken = new URL(webhookPairing.connectUrl).searchParams.get('start');
  const notificationModule = {
    isEmailClassificationEnabled() { return false; },
    async sendResendEmail() { return null; },
    async sendTelegramMessage() { return 'test-message'; },
  };
  const routeModule = loadTsModule(routeSource, 'notification-settings-route.ts', {
    '../db/middleware': {
      json(value, status = 200) {
        return new Response(JSON.stringify(value), {
          status,
          headers: { 'Content-Type': 'application/json' },
        });
      },
      async verifyAccountToken() { return 'account-a'; },
    },
    '../services/notificationSettings': settingsModule,
    '../services/siteClassificationEmail': notificationModule,
  });
  const webhookBody = JSON.stringify({
    message: { text: '/start ' + webhookToken, chat: { id: 'webhook-chat', type: 'private' } },
  });
  const forgedResponse = await routeModule.notificationSettingsRouter.handle(new Request(
    'https://guardian.example.test/integrations/telegram/webhook',
    { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Telegram-Bot-Api-Secret-Token': 'forged' }, body: webhookBody }
  ), baseEnv);
  expectEqual('forged Telegram webhook secret is rejected', forgedResponse.status, 401);
  expectEqual('forged webhook does not consume the pairing token', database.prepare(
    'SELECT status FROM telegram_pairing_sessions_v1 WHERE id = ?'
  ).get(webhookPairing.pairingId).status, 'pending');
  const webhookSecret = await settingsModule.telegramWebhookSecret(baseEnv);
  const acceptedResponse = await routeModule.notificationSettingsRouter.handle(new Request(
    'https://guardian.example.test/integrations/telegram/webhook',
    { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Telegram-Bot-Api-Secret-Token': webhookSecret }, body: webhookBody }
  ), baseEnv);
  expectEqual('valid Telegram webhook completes pairing', acceptedResponse.status, 200);
  expectEqual('valid webhook consumes the pairing token exactly once', database.prepare(
    'SELECT status FROM telegram_pairing_sessions_v1 WHERE id = ?'
  ).get(webhookPairing.pairingId).status, 'connected');

  expectTrue('account API is separate from profile feature API', routeSource.includes("'/account/notification-settings/v1'") && routeSource.includes('unclassified-usage-notification'));
  expectTrue('all parent APIs require account authentication except Telegram webhook', routeSource.indexOf('if (url.pathname === TELEGRAM_WEBHOOK_PATH)') < routeSource.lastIndexOf('const accountId = await verifyAccountToken'));
  expectTrue('profile settings verify account ownership', routeSource.includes('p.account_id = ?'));
  expectTrue('UI cannot submit a Telegram chat id', !routeSource.includes('telegramChatId?:') && !pagesSource.includes('notification-telegram-chat-id'));
  expectTrue('Telegram pairing uses ten-minute hashed single-use sessions', settingsSource.includes('10 * 60 * 1000') && settingsSource.includes('tokenHash') && settingsSource.includes("status = 'connected'"));
  expectTrue('Telegram webhook checks derived secret header', routeSource.includes('X-Telegram-Bot-Api-Secret-Token') && settingsSource.includes('telegramWebhookSecret'));
  expectTrue('private chats only are accepted', settingsSource.includes("chatType !== 'private'"));
  expectTrue('Bot identity rotation disables effective Telegram channel', settingsSource.includes('reconnect_required') && settingsSource.includes('telegram_enabled = 0'));
  expectTrue('Worker routes notification endpoints before generic profiles route', indexSource.indexOf('notificationSettingsRouter.matches') < indexSource.indexOf("path.startsWith('/profiles')"));

  expectTrue('Pages puts account channels in System Management', pagesSource.includes('data-system-management-tab="notifications"') && pagesSource.includes('data-system-management-panel="notifications"'));
  expectTrue('Pages keeps profile feature inside Website Management', pagesSource.includes('id="unclassified-notification-settings-card"') && pagesSource.includes('id="unclassified-notification-threshold"'));
  expectTrue('Pages provides connect test and disconnect without Chat ID input', pagesSource.includes('connect-account-telegram-btn') && pagesSource.includes('test-account-telegram-btn') && pagesSource.includes('disconnect-account-telegram-btn') && !pagesSource.includes('Telegram Chat ID'));
  expectTrue('profile export includes only feature rule', pagesSource.includes('notifications:') && pagesSource.includes('unclassifiedUsage: profileNotificationSettingsView') && !pagesSource.includes('telegramChatId'));
  expectTrue('local Admin does not expose parent channel settings', !adminSource.includes('/account/notification-settings/v1') && !adminSource.includes('telegram_pairing_sessions_v1'));

  const total = passed + failed;
  console.log('\n[Notification Settings D-097] ' + passed + '/' + total + ' passed' + (failed ? ' - ' + failed + ' FAILED' : ''));
  if (failed > 0) process.exit(1);
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
