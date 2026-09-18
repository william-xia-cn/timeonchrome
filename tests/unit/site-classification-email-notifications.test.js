// site-classification-email-notifications.test.js
// Run with: node tests/unit/site-classification-email-notifications.test.js

'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ts = require('typescript');
const { webcrypto } = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');

let passed = 0;
let failed = 0;

function expectEqual(desc, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) passed++;
  else {
    failed++;
    console.error(`  x ${desc}`);
    console.error(`    expected: ${JSON.stringify(expected)}`);
    console.error(`    actual:   ${JSON.stringify(actual)}`);
  }
}

function expectTrue(desc, condition) {
  if (condition) passed++;
  else {
    failed++;
    console.error(`  x ${desc}`);
  }
}

function extractFunction(source, name) {
  const markers = [`export async function ${name}`, `export function ${name}`, `async function ${name}`, `function ${name}`];
  const start = markers.map((marker) => source.indexOf(marker)).find((index) => index >= 0);
  if (start == null || start < 0) throw new Error(`Unable to locate ${name}`);
  const brace = source.indexOf('{', start);
  let depth = 0;
  for (let index = brace; index < source.length; index++) {
    if (source[index] === '{') depth++;
    if (source[index] === '}') depth--;
    if (depth === 0) return source.slice(start, index + 1).replace(/^export\s+/, '');
  }
  throw new Error(`Unable to parse ${name}`);
}

function loadHelpers(source) {
  const names = [
    'isEmailClassificationEnabled',
    'isEmailClassificationProfileEnabled',
    'shanghaiDateKey',
    'normalizeObservedHost',
    'fallbackDayEndMs',
    'bytesToBase64Url',
    'base64UrlToBytes',
    'hmacKey',
    'createSignedToken',
    'verifySignedToken',
    'replyTokenFromRecipient',
    'firstReplyCommand',
    'loadDailyUsageAggregates',
  ];
  const snippet = [
    "const THRESHOLD_SECONDS = 30 * 60;",
    ...names.map((name) => extractFunction(source, name)),
    `this.__helpers = { ${names.join(', ')} };`,
  ].join('\n');
  const compiled = ts.transpileModule(snippet, {
    compilerOptions: { module: ts.ModuleKind.None, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const context = {
    console,
    URL,
    Date,
    TextEncoder,
    Uint8Array,
    ArrayBuffer,
    crypto: webcrypto,
    atob,
    btoa,
    canonicalSiteIdentityHost(host) {
      const normalized = String(host || '').toLowerCase();
      return normalized.replace(/^(www|m)\./, '');
    },
  };
  context.this = context;
  vm.createContext(context);
  vm.runInContext(compiled, context, { filename: 'site-classification-email.vm.js' });
  return context.__helpers;
}

function createD1Adapter(database) {
  return {
    prepare(sql) {
      const statement = database.prepare(sql);
      return {
        bind(...values) {
          return {
            async all() {
              return { results: statement.all(...values) };
            },
          };
        },
      };
    },
  };
}

async function run() {
  const root = path.join(__dirname, '..', '..');
  const source = fs.readFileSync(path.join(root, 'workers', 'src', 'services', 'siteClassificationEmail.ts'), 'utf8');
  const statsSource = fs.readFileSync(path.join(root, 'workers', 'src', 'routes', 'stats.ts'), 'utf8');
  const requestSource = fs.readFileSync(path.join(root, 'workers', 'src', 'routes', 'siteClassificationRequests.ts'), 'utf8');
  const indexSource = fs.readFileSync(path.join(root, 'workers', 'src', 'index.ts'), 'utf8');
  const wranglerSource = fs.readFileSync(path.join(root, 'workers', 'wrangler.toml'), 'utf8');
  const migration = fs.readFileSync(path.join(root, 'workers', 'migrations', '021_site_classification_email_notifications_v1.sql'), 'utf8');
  const helpers = loadHelpers(source);

  expectEqual('email classification without mail credentials stays disabled', helpers.isEmailClassificationEnabled({}), false);
  expectEqual('mail credentials enable classification email by default', helpers.isEmailClassificationEnabled({ RESEND_API_KEY: 'test', EMAIL_ACTION_SECRET: 'test' }), true);
  expectEqual('explicit false remains an emergency kill switch', helpers.isEmailClassificationEnabled({ EMAIL_CLASSIFICATION_ENABLED: 'false', RESEND_API_KEY: 'test', EMAIL_ACTION_SECRET: 'test' }), false);
  expectEqual('email classification accepts explicit true', helpers.isEmailClassificationEnabled({ EMAIL_CLASSIFICATION_ENABLED: 'true' }), true);
  expectEqual('enabled flag without profile allowlist includes all profiles', helpers.isEmailClassificationProfileEnabled({ EMAIL_CLASSIFICATION_ENABLED: 'true' }, 'profile-a'), true);
  expectEqual('legacy profile allowlist no longer gates business notifications', helpers.isEmailClassificationProfileEnabled({ EMAIL_CLASSIFICATION_ENABLED: 'true', EMAIL_CLASSIFICATION_PROFILE_IDS: 'profile-a' }, 'profile-c'), true);
  expectEqual('global email emergency switch still applies to every profile', helpers.isEmailClassificationProfileEnabled({ EMAIL_CLASSIFICATION_ENABLED: 'false', EMAIL_CLASSIFICATION_PROFILE_IDS: '*' }, 'profile-c'), false);
  expectEqual('www host uses canonical site identity', helpers.normalizeObservedHost('https://www.example.com/path'), 'example.com');
  expectEqual('m host uses canonical site identity', helpers.normalizeObservedHost('m.example.com'), 'example.com');
  expectEqual('service subdomain stays independent', helpers.normalizeObservedHost('docs.example.com'), 'docs.example.com');
  expectEqual('first plain command is extracted', helpers.firstReplyCommand('\n学习\n\n> old reply'), '学习');
  expectEqual('quoted content is not accepted as a command', helpers.firstReplyCommand('\n> 学习'), '');
  expectEqual('Shanghai date calculation crosses UTC day boundary', helpers.shanghaiDateKey(Date.UTC(2026, 8, 17, 16, 30)), '2026-09-18');

  const token = await helpers.createSignedToken('AbCdEf12345', 'test-secret');
  expectTrue('signed reply local part remains under SMTP 64-char limit', `reply+${token}`.length <= 64);
  expectEqual('valid token verifies to notification id', await helpers.verifySignedToken(token, 'test-secret'), 'AbCdEf12345');
  expectEqual('wrong secret rejects token', await helpers.verifySignedToken(token, 'wrong-secret'), null);
  const mixedCaseRecipient = `reply+${token}@Hornburg-Xia.UK`;
  const extractedToken = helpers.replyTokenFromRecipient(mixedCaseRecipient);
  expectEqual('recipient parsing preserves case-sensitive signed token', extractedToken, token);
  expectEqual('token extracted from recipient still verifies', await helpers.verifySignedToken(extractedToken, 'test-secret'), 'AbCdEf12345');

  const database = new DatabaseSync(':memory:');
  database.exec(`
    CREATE TABLE target_stats_v1 (
      profile_id TEXT, date TEXT, timezone TEXT, day_end_ms INTEGER,
      target_key TEXT, managed_target_value TEXT, managed_target_label_at_time TEXT,
      fallback_domain TEXT, duration_seconds INTEGER, segments_count INTEGER,
      first_seen_at INTEGER, last_seen_at INTEGER, target_classification_at_time TEXT
    );
    INSERT INTO target_stats_v1 VALUES
      ('p1','2026-08-12','Asia/Shanghai',2000000000000,'host:www.example.com',NULL,NULL,'www.example.com',450,2,100,200,'unclassified'),
      ('p1','2026-08-12','Asia/Shanghai',2000000000000,'host:m.example.com',NULL,NULL,'m.example.com',450,3,150,300,'pending_composite'),
      ('p1','2026-08-12','Asia/Shanghai',2000000000000,'host:ignored.example',NULL,NULL,'ignored.example',999,1,100,300,'study');
  `);
  const aggregates = await helpers.loadDailyUsageAggregates({ DB: createD1Adapter(database) }, 'p1', '2026-08-12');
  expectEqual('all devices/dimensions and main-site aliases aggregate once', aggregates.map((row) => ({
    host: row.canonicalHost,
    seconds: row.totalSeconds,
    observations: row.observationCount,
  })), [{ host: 'example.com', seconds: 900, observations: 5 }]);

  const migrationDb = new DatabaseSync(':memory:');
  migrationDb.exec(migration);
  const tables = migrationDb.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all().map((row) => row.name);
  expectTrue('migration creates notification outbox table', tables.includes('site_classification_email_notifications_v1'));
  expectTrue('migration creates reply audit table', tables.includes('site_classification_email_reply_events_v1'));
  expectTrue('daily notification has profile/date/host uniqueness', migration.includes('UNIQUE (profile_id, usage_date, canonical_host, notification_type)'));

  expectTrue('trigger uses exact unclassified classifications', source.includes("target_classification_at_time IN ('unclassified', 'pending_composite')"));
  expectTrue('notification threshold is read from profile feature settings', source.includes('featureSettings.thresholdMinutes * 60') && source.includes('usage.totalSeconds < thresholdSeconds'));
  expectTrue('late data is limited to day end plus 24 hours', source.includes('usage.dayEndMs + 24 * 60 * 60 * 1000'));
  expectTrue('outbox has 5m 30m 2h retry schedule and four-attempt cap', source.includes('5 * 60 * 1000') && source.includes('30 * 60 * 1000') && source.includes('2 * 60 * 60 * 1000') && source.includes('attempts >= 4'));
  expectTrue('reply requires sender, expiry, pending state and Message-ID', source.includes('SENDER_MISMATCH') && source.includes('TOKEN_EXPIRED') && source.includes("notification.request_status !== 'pending'") && source.includes('Message-ID required'));
  expectTrue('reply audit stores hash instead of raw body', migration.includes('inbound_message_id_hash') && !migration.includes('raw_body') && !migration.includes('html_body'));
  expectTrue('mail and Pages share the same decision service', source.includes('decideSiteClassificationRequest') && requestSource.includes('export async function decideSiteClassificationRequest') && requestSource.includes('const result = await decideSiteClassificationRequest'));
  const mediaRouteStart = statsSource.indexOf("if (request.method === 'POST' && path === '/device/media-stats/v1')");
  const targetRouteStart = statsSource.indexOf("if (request.method === 'POST' && path === '/device/target-stats/v1')");
  const hourlyTargetRouteStart = statsSource.indexOf("if (request.method === 'POST' && path === '/device/hourly-target-stats/v1')");
  const mediaRouteSource = statsSource.slice(mediaRouteStart, targetRouteStart);
  const targetRouteSource = statsSource.slice(targetRouteStart, hourlyTargetRouteStart);
  expectTrue('media stats never trigger unclassified email evaluation', !mediaRouteSource.includes('evaluateDailyUnclassifiedEmailNotifications'));
  expectTrue('target stats schedule notification after successful upsert', targetRouteSource.includes('evaluateDailyUnclassifiedEmailNotifications') && targetRouteSource.includes('ctx.waitUntil(notificationWork)'));
  expectTrue('email failures do not fail target stats upload', targetRouteSource.includes("console.warn('[site-classification-email] target stats evaluation failed'") && targetRouteSource.indexOf('notificationWork') < targetRouteSource.indexOf('return json({ success: true, count: upserted'));
  expectTrue('Worker exports inbound email handler and current-day scan before outbox processing', indexSource.includes('async email(message: ForwardableEmailMessage') && indexSource.includes('scanCurrentDayUnclassifiedEmailNotifications(env)') && indexSource.indexOf('scanCurrentDayUnclassifiedEmailNotifications(env)') < indexSource.indexOf('processEmailClassificationOutbox(env)'));
  expectTrue('profile feature and account channels jointly gate notification delivery', source.includes('loadProfileUnclassifiedNotificationSettings') && source.includes('featureSettings.enabled') && source.includes('loadAccountNotificationSettings'));
  expectTrue('current-day scan reads positive unclassified target rows', source.includes('SELECT DISTINCT profile_id') && source.includes("target_classification_at_time IN ('unclassified', 'pending_composite')") && source.includes('duration_seconds > 0'));
  expectTrue('legacy queued rows are re-armed only after the configured threshold changes', source.includes('threshold_seconds <> excluded.threshold_seconds') && source.includes("status NOT IN ('sent', 'consumed')") && source.includes('THRESHOLD_NOT_REACHED'));
  expectTrue('notification copy states the configured threshold', source.includes('已达到 ${thresholdMinutes} 分钟'));
  expectTrue('five-minute cron coexists with daily reminder cron', wranglerSource.includes('*/5 * * * *') && wranglerSource.includes('0 12 * * *'));
  expectTrue('new sender and signed reply-to use hornburg-xia.uk', source.includes('notify@hornburg-xia.uk') && source.includes('@hornburg-xia.uk'));
  expectTrue('initial notification uses signed address for From and Reply-To', source.includes('from: `TimeOnChrome <${replyTo}>`') && source.includes('replyTo,'));
  expectTrue('fixed command map contains all five commands', ['学习', '复合', '受限娱乐', '黑名单', '暂不处理'].every((command) => source.includes(`'${command}'`)));

  const total = passed + failed;
  console.log(`\n[Site Classification Email Notifications] ${passed}/${total} passed${failed ? ` - ${failed} FAILED` : ''}`);
  if (failed > 0) process.exit(1);
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
