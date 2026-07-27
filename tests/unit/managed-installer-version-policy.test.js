const assert = require('assert');
const fs = require('fs');
const path = require('path');

const EXTENSION_ID = 'jdcancbiocacabbjdkngadmjpjmkdnih';

function validVersion(value) {
  const parts = String(value).split('.');
  return parts.length >= 1 && parts.length <= 4 && parts.every((part) => /^(0|[1-9][0-9]*)$/.test(part) && Number(part) <= 65535);
}

function validateFeed({ xml, extensionId = EXTENSION_ID, expectedVersion, expectedCrxCodebaseSuffix }) {
  const appPattern = new RegExp(`<app\\b[^>]*appid=["']${extensionId}["'][^>]*>([\\s\\S]*?)<\\/app>`);
  const appMatch = xml.match(appPattern);
  if (!appMatch) throw new Error('missing app');
  const checkMatch = appMatch[1].match(/<updatecheck\b([^>]*)\/?>(?:<\/updatecheck>)?/);
  if (!checkMatch) throw new Error('missing updatecheck');
  const attrs = Object.fromEntries([...checkMatch[1].matchAll(/([A-Za-z0-9_:-]+)=["']([^"']*)["']/g)].map((match) => [match[1], match[2]]));
  const feedVersion = String(attrs.version || '').trim();
  const codebase = String(attrs.codebase || '').trim();
  if (!validVersion(feedVersion)) throw new Error('invalid feed version');
  const parsed = new URL(codebase);
  if (parsed.protocol !== 'https:') throw new Error('codebase must be https');
  const filename = path.posix.basename(parsed.pathname);
  if (!filename.endsWith('.crx') || !filename.includes(feedVersion)) throw new Error('codebase filename must include feed version');
  const expected = String(expectedVersion || '').trim();
  const mode = expected === '' || expected.toLowerCase() === 'latest' ? 'latest' : 'pinned';
  if (mode === 'pinned') {
    if (!validVersion(expected) || feedVersion !== expected) throw new Error('pinned version mismatch');
    if (expectedCrxCodebaseSuffix) {
      const suffix = expectedCrxCodebaseSuffix.replace('{version}', expected);
      if (!codebase.endsWith(suffix)) throw new Error('suffix mismatch');
    }
  } else if (expectedCrxCodebaseSuffix) {
    const suffix = expectedCrxCodebaseSuffix.replace('{version}', feedVersion);
    if (!codebase.endsWith(suffix)) throw new Error('suffix mismatch');
  }
  return feedVersion;
}

function feed({ version = '1.7.16', codebase = `https://timeonchrome-update.pages.dev/timeonchrome/timeonchrome-${version}.crx`, extensionId = EXTENSION_ID } = {}) {
  return `<?xml version="1.0"?><gupdate xmlns="http://www.google.com/update2/response"><app appid="${extensionId}"><updatecheck codebase="${codebase}" version="${version}" /></app></gupdate>`;
}

const latestInputs = [undefined, '', 'latest'];
for (const expectedVersion of latestInputs) {
  assert.strictEqual(validateFeed({ xml: feed({ version: '1.7.16' }), expectedVersion }), '1.7.16');
}

assert.throws(() => validateFeed({ xml: feed({ codebase: 'http://timeonchrome-update.pages.dev/timeonchrome/timeonchrome-1.7.16.crx' }), expectedVersion: 'latest' }), /https/);
assert.throws(() => validateFeed({ xml: feed({ version: '1.7.16', codebase: 'https://timeonchrome-update.pages.dev/timeonchrome/timeonchrome-1.7.15.crx' }), expectedVersion: 'latest' }), /filename/);
assert.strictEqual(validateFeed({ xml: feed({ version: '1.7.16' }), expectedVersion: '1.7.16' }), '1.7.16');
assert.throws(() => validateFeed({ xml: feed({ version: '1.7.16' }), expectedVersion: '1.7.15' }), /pinned version/);
assert.strictEqual(validateFeed({ xml: feed({ version: '1.7.16' }), expectedVersion: '1.7.16', expectedCrxCodebaseSuffix: 'timeonchrome-{version}.crx' }), '1.7.16');
assert.throws(() => validateFeed({ xml: feed({ version: '1.7.16' }), expectedVersion: '1.7.16', expectedCrxCodebaseSuffix: 'timeonchrome-1.7.15.crx' }), /suffix/);

const pierceInstaller = fs.readFileSync(path.join(__dirname, '../../docs/deployment/pierce-macos-target/timeonchrome-managed-installer.sh'), 'utf8');
assert(!/Configured version must be 1\.7\.15/.test(pierceInstaller));
assert(!/Configured version must be 1\.7\.13/.test(pierceInstaller));

console.log('managed-installer-version-policy.test.js: all assertions passed');
