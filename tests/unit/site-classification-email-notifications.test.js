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
    "const THRESHOLD_SECONDS = 900;",
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

  expectEqual('email classification defaults disabled', helpers.isEmailClassificationEnabled({}), false);
  expectEqual('email classification accepts explicit true', helpers.isEmailClassificationEnabled({ EMAIL_CLASSIFICATION_ENABLED: 'true' }), true);
  expectEqual('enabled flag without profile allowlist remains disabled for profile', helpers.isEmailClassificationProfileEnabled({ EMAIL_CLASSIFICATION_ENABLED: 'true' }, 'profile-a'), false);
  expectEqual('profile allowlist enables only selected profile', helpers.isEmailClassificationProfileEnabled({ EMAIL_CLASSIFICATION_ENABLED: 'true', EMAIL_CLASSIFICATION_PROFILE_IDS: 'profile-a,profile-b' }, 'profile-b'), true);
  expectEqual('profile allowlist rejects unlisted profile', helpers.isEmailClassificationProfileEnabled({ EMAIL_CLASSIFICATION_ENABLED: 'true', EMAIL_CLASSIFICATION_PROFILE_IDS: 'profile-a,profile-b' }, 'profile-c'), false);
  expectEqual('wildcard allowlist supports later global rollout', helpers.isEmailClassificationProfileEnabled({ EMAIL_CLASSIFICATION_ENABLED: 'true', EMAIL_CLASSIFICATION_PROFILE_IDS: '*' }, 'profile-c'), true);
  expectEqual('www host uses canonical site identity', helpers.normalizeObservedHost('https://www.example.com/path'), 'example.com');
  expectEqual('m host uses canonical site identity', helpers.normalizeObservedHost('m.example.com'), 'example.com');
  expectEqual('service subdomain stays independent', helpers.normalizeObservedHost('docs.example.com'), 'docs.example.com');
  expectEqual('first plain command is extracted', helpers.firstReplyCommand('\n学习\n\n> old reply'), '学习');
  expectEqual('quoted content is not accepted as a command', helpers.firstReplyCommand('\n> 学习'), '');

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
  expectTrue('899 does not trigger and 900 triggers', source.includes('usage.totalSeconds < THRESHOLD_SECONDS') && source.includes('const THRESHOLD_SECONDS = 900'));
  expectTrue('late data is limited to day end plus 24 hours', source.includes('usage.dayEndMs + 24 * 60 * 60 * 1000'));
  expectTrue('outbox has 5m 30m 2h retry schedule and four-attempt cap', source.includes('5 * 60 * 1000') && source.includes('30 * 60 * 1000') && source.includes('2 * 60 * 60 * 1000') && source.includes('attempts >= 4'));
  expectTrue('reply requires sender, expiry, pending state and Message-ID', source.includes('SENDER_MISMATCH') && source.includes('TOKEN_EXPIRED') && source.includes("notification.request_status !== 'pending'") && source.includes('Message-ID required'));
  expectTrue('reply audit stores hash instead of raw body', migration.includes('inbound_message_id_hash') && !migration.includes('raw_body') && !migration.includes('html_body'));
  expectTrue('mail and Pages share the same decision service', source.includes('decideSiteClassificationRequest') && requestSource.includes('export async function decideSiteClassificationRequest') && requestSource.includes('const result = await decideSiteClassificationRequest'));
  expectTrue('target stats schedules notification after successful upsert', statsSource.includes('evaluateDailyUnclassifiedEmailNotifications') && statsSource.includes('ctx.waitUntil(notificationWork)'));
  expectTrue('email failures do not fail target stats upload', statsSource.includes("console.warn('[site-classification-email] target stats evaluation failed'") && statsSource.indexOf('notificationWork') < statsSource.indexOf('return json({ success: true, count: upserted'));
  expectTrue('Worker exports inbound email handler and outbox cron', indexSource.includes('async email(message: ForwardableEmailMessage') && indexSource.includes('processEmailClassificationOutbox'));
  expectTrue('profile allowlist gates threshold evaluation and outbox delivery', source.includes('isEmailClassificationProfileEnabled(env, profileId)') && source.includes('isEmailClassificationProfileEnabled(env, row.profile_id)'));
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
