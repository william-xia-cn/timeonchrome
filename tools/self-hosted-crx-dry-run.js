#!/usr/bin/env node
// Build or dry-run a self-hosted Chrome update feed for the managed internal channel.
// The production PEM stays outside the repo. This script never prints key paths or key content.

'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const BANNED_PACKAGE_ENTRIES = new Set([
  '_metadata',
  'tests',
  'workers',
  'pages',
  'dist',
  'node_modules',
  '.git',
]);
const MANAGED_PACKAGE_EXCLUDED_ENTRIES = new Set([
  'privacy-consent.html',
  'privacy-consent.js',
  'privacy.html',
]);
const LOCAL_GUARDIAN_PERMISSION = 'nativeMessaging';
const LOCAL_GUARDIAN_PROBE_RESOURCE = 'health-probe.html';

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const value = argv[i];
    if (!value.startsWith('--')) continue;
    const key = value.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith('--')) args[key] = true;
    else {
      args[key] = next;
      i++;
    }
  }
  return args;
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function xmlEscape(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function sha256File(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function chromeIdFromPem(keyPath) {
  const privateKey = crypto.createPrivateKey(fs.readFileSync(keyPath));
  const publicKey = crypto.createPublicKey(privateKey);
  const der = publicKey.export({ type: 'spki', format: 'der' });
  const digest = crypto.createHash('sha256').update(der).digest();
  let id = '';
  for (let i = 0; i < 16; i++) {
    id += String.fromCharCode(97 + ((digest[i] >> 4) & 0x0f));
    id += String.fromCharCode(97 + (digest[i] & 0x0f));
  }
  return id;
}

function isInside(parent, child) {
  const relative = path.relative(parent, child);
  return !!relative && !relative.startsWith('..') && !path.isAbsolute(relative);
}

function validateExternalKey(repoRoot, keyPath) {
  if (!keyPath) throw new Error('TIMEONCHROME_CRX_KEY_PATH or --key is required when --pack is used');
  const resolved = path.resolve(keyPath);
  if (!fs.existsSync(resolved)) throw new Error('CRX signing key not found');
  if (isInside(repoRoot, resolved) || resolved === repoRoot) {
    throw new Error('CRX signing key must be outside the repository');
  }
  return resolved;
}

function validateExtensionPackageRoot(extensionDir) {
  const entries = fs.readdirSync(extensionDir, { withFileTypes: true }).map((entry) => entry.name);
  const banned = entries.filter((entry) => BANNED_PACKAGE_ENTRIES.has(entry));
  if (banned.length > 0) {
    throw new Error(`staged extension package contains banned entries: ${banned.join(', ')}`);
  }
  const manifest = readJson(path.join(extensionDir, 'manifest.json'));
  const managedDeployment = fs.existsSync(path.join(extensionDir, 'deployment-profile.json'));
  const hasNativeMessaging = Array.isArray(manifest.permissions)
    && manifest.permissions.includes(LOCAL_GUARDIAN_PERMISSION);
  const hasProbeResource = Array.isArray(manifest.web_accessible_resources)
    && manifest.web_accessible_resources.some((entry) => (
      Array.isArray(entry?.resources) && entry.resources.includes(LOCAL_GUARDIAN_PROBE_RESOURCE)
    ));
  if (managedDeployment && (!hasNativeMessaging || !hasProbeResource)) {
    throw new Error('managed extension package must retain local guardian permission and probe resource');
  }
  if (!managedDeployment && (hasNativeMessaging || hasProbeResource)) {
    throw new Error('non-managed extension package must remove local guardian permission and probe resource');
  }
  if (manifest.update_url !== 'https://timeonchrome-update.pages.dev/timeonchrome/update.xml') {
    throw new Error('manifest update_url must reference the production self-hosted update manifest');
  }
  const schemaName = manifest?.storage?.managed_schema;
  if (schemaName !== 'managed-storage-schema.json') {
    throw new Error('manifest storage.managed_schema must reference managed-storage-schema.json');
  }
  const schemaPath = path.join(extensionDir, schemaName);
  if (!fs.existsSync(schemaPath)) throw new Error('managed storage schema is missing from extension package');
  const schema = readJson(schemaPath);
  const expectedTypes = {
    enabled: 'boolean',
    deploymentMode: 'string',
    cloudEndpoint: 'string',
    managedDeviceToken: 'string',
    managedDeviceLabel: 'string',
    managedProfileEmail: 'string',
    allowIdentityRecovery: 'boolean',
    tenantId: 'string',
    devicePolicyId: 'string',
  };
  if (schema.type !== 'object') throw new Error('managed storage schema top-level type must be object');
  for (const [key, type] of Object.entries(expectedTypes)) {
    if (schema.properties?.[key]?.type !== type) {
      throw new Error(`managed storage schema field ${key} must have type ${type}`);
    }
  }
}

function applyLocalGuardianChannelBoundary(stagingDir, managedDeployment) {
  const manifestPath = path.join(stagingDir, 'manifest.json');
  const manifest = readJson(manifestPath);
  const permissions = new Set(Array.isArray(manifest.permissions) ? manifest.permissions : []);
  const resources = Array.isArray(manifest.web_accessible_resources)
    ? manifest.web_accessible_resources.map((entry) => ({
        ...entry,
        resources: Array.isArray(entry?.resources) ? [...entry.resources] : [],
      }))
    : [];

  if (managedDeployment) {
    permissions.add(LOCAL_GUARDIAN_PERMISSION);
    const target = resources.find((entry) => Array.isArray(entry.resources));
    if (target && !target.resources.includes(LOCAL_GUARDIAN_PROBE_RESOURCE)) {
      target.resources.push(LOCAL_GUARDIAN_PROBE_RESOURCE);
    } else if (!target) {
      resources.push({ resources: [LOCAL_GUARDIAN_PROBE_RESOURCE], matches: ['<all_urls>'] });
    }
  } else {
    permissions.delete(LOCAL_GUARDIAN_PERMISSION);
    for (const entry of resources) {
      entry.resources = entry.resources.filter((resource) => resource !== LOCAL_GUARDIAN_PROBE_RESOURCE);
    }
  }

  manifest.permissions = [...permissions];
  manifest.web_accessible_resources = resources.filter((entry) => entry.resources.length > 0);
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
}

function stageExtensionPackage(extensionDir, stagingDir, managedDeployment = false) {
  fs.rmSync(stagingDir, { recursive: true, force: true });
  ensureDir(stagingDir);
  for (const entry of fs.readdirSync(extensionDir, { withFileTypes: true })) {
    if (BANNED_PACKAGE_ENTRIES.has(entry.name)) continue;
    if (managedDeployment && MANAGED_PACKAGE_EXCLUDED_ENTRIES.has(entry.name)) continue;
    const source = path.join(extensionDir, entry.name);
    const target = path.join(stagingDir, entry.name);
    fs.cpSync(source, target, { recursive: true, force: true });
  }
  applyLocalGuardianChannelBoundary(stagingDir, managedDeployment);
  if (managedDeployment) {
    fs.writeFileSync(path.join(stagingDir, 'deployment-profile.json'), JSON.stringify({ mode: 'managed' }, null, 2) + '\n', 'utf8');
    const leakedPrivacyPages = [...MANAGED_PACKAGE_EXCLUDED_ENTRIES]
      .filter((entry) => fs.existsSync(path.join(stagingDir, entry)));
    if (leakedPrivacyPages.length > 0) {
      throw new Error(`managed extension package contains excluded privacy pages: ${leakedPrivacyPages.join(', ')}`);
    }
    if (!fs.existsSync(path.join(stagingDir, 'core', 'privacy-consent.js'))) {
      throw new Error('managed extension package is missing core/privacy-consent.js activation dependency');
    }
  }
  validateExtensionPackageRoot(stagingDir);
}

function findChromeExecutable(explicit) {
  if (explicit) return path.resolve(explicit);
  const candidates = [
    process.env.CHROME_EXE,
    process.env.GOOGLE_CHROME_SHIM,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    path.join(process.env.LOCALAPPDATA || '', 'Google', 'Chrome', 'Application', 'chrome.exe'),
  ].filter(Boolean);
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  throw new Error('Chrome executable not found; pass --chrome or set CHROME_EXE');
}

function packCrx({ repoRoot, packageDir, outputDir, crxPath, keyPath, chromePath }) {
  validateExtensionPackageRoot(packageDir);
  const generatedCrx = `${packageDir}.crx`;
  if (fs.existsSync(generatedCrx)) fs.rmSync(generatedCrx, { force: true });
  const result = spawnSync(chromePath, [
    `--pack-extension=${packageDir}`,
    `--pack-extension-key=${keyPath}`,
  ], { cwd: repoRoot, encoding: 'utf8' });
  if (result.status !== 0) {
    const stderr = String(result.stderr || '').trim();
    const stdout = String(result.stdout || '').trim();
    throw new Error(`Chrome CRX packaging failed${stderr ? `: ${stderr}` : stdout ? `: ${stdout}` : ''}`);
  }
  if (!fs.existsSync(generatedCrx)) throw new Error('Chrome did not produce a CRX artifact');
  ensureDir(outputDir);
  fs.renameSync(generatedCrx, crxPath);
}

function writeUpdateArtifacts({ outputDir, hostOutputDir, version, extensionId, baseUrl, crxPath, crxFileName, requireCrx }) {
  const crxExists = fs.existsSync(crxPath);
  if (requireCrx && !crxExists) throw new Error(`CRX not found: ${crxPath}`);

  const codebase = `${baseUrl}/crx/${encodeURIComponent(crxFileName)}`;
  const updateXml = `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<gupdate xmlns="http://www.google.com/update2/response" protocol="2.0">\n` +
    `  <app appid="${xmlEscape(extensionId)}">\n` +
    `    <updatecheck codebase="${xmlEscape(codebase)}" version="${xmlEscape(version)}" />\n` +
    `  </app>\n` +
    `</gupdate>\n`;

  ensureDir(outputDir);
  fs.writeFileSync(path.join(outputDir, 'update.xml'), updateXml, 'utf8');

  const shaLines = [
    '# TimeOnChrome self-hosted CRX release',
    `# manifest_version=${version}`,
    `# extension_id=${extensionId}`,
    `# codebase=${codebase}`,
  ];
  let crxSha256 = null;
  if (crxExists) {
    crxSha256 = sha256File(crxPath);
    shaLines.push(`${crxSha256}  crx/${crxFileName}`);
  } else {
    shaLines.push(`# CRX missing in dry-run: crx/${crxFileName}`);
  }
  fs.writeFileSync(path.join(outputDir, 'SHA256SUMS.txt'), `${shaLines.join('\n')}\n`, 'utf8');

  if (hostOutputDir) {
    ensureDir(path.join(hostOutputDir, 'timeonchrome', 'crx'));
    fs.copyFileSync(path.join(outputDir, 'update.xml'), path.join(hostOutputDir, 'timeonchrome', 'update.xml'));
    fs.copyFileSync(path.join(outputDir, 'SHA256SUMS.txt'), path.join(hostOutputDir, 'timeonchrome', 'SHA256SUMS.txt'));
    if (crxExists) fs.copyFileSync(crxPath, path.join(hostOutputDir, 'timeonchrome', 'crx', crxFileName));
  }

  return { codebase, crxSha256, crxExists };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const repoRoot = path.resolve(__dirname, '..');
  const extensionDir = path.join(repoRoot, 'extension');
  const manifest = readJson(path.join(extensionDir, 'manifest.json'));
  const version = manifest.version;
  if (!version) throw new Error('manifest version not found');

  const outputDir = path.resolve(repoRoot, args['output-dir'] || path.join('dist', 'self-hosted'));
  const packageDir = path.join(outputDir, 'package-extension');
  const hostOutputDir = args['host-output-dir']
    ? path.resolve(repoRoot, args['host-output-dir'])
    : (args['prepare-host'] ? path.resolve(repoRoot, 'dist', 'self-hosted-update') : null);
  const keyPathRaw = args.key || process.env.TIMEONCHROME_CRX_KEY_PATH || '';
  const pack = args.pack === true;
  const managedDeployment = args['managed-deployment'] === true || args['managed-deployment'] === 'true';
  const keyPath = pack ? validateExternalKey(repoRoot, keyPathRaw) : (keyPathRaw ? validateExternalKey(repoRoot, keyPathRaw) : null);
  const derivedExtensionId = keyPath ? chromeIdFromPem(keyPath) : null;
  const extensionId = args['extension-id'] || process.env.TIMEONCHROME_MANAGED_EXTENSION_ID || derivedExtensionId || 'REPLACE_WITH_STABLE_EXTENSION_ID';
  const expectedId = process.env.TIMEONCHROME_MANAGED_EXTENSION_ID || args['expected-extension-id'] || '';
  const baseUrl = String(args['base-url'] || process.env.TIMEONCHROME_UPDATE_BASE_URL || 'https://timeonchrome-update.pages.dev/timeonchrome').replace(/\/$/, '');
  const crxFileName = `timeonchrome-${version}.crx`;
  const crxPath = path.resolve(args.crx || path.join(outputDir, crxFileName));
  const requireCrx = args['require-crx'] === true || pack;

  if (!/^[a-p]{32}$/.test(extensionId) && extensionId !== 'REPLACE_WITH_STABLE_EXTENSION_ID') {
    throw new Error('extension id must be 32 Chrome id chars a-p, or leave the dry-run placeholder');
  }
  if (expectedId && derivedExtensionId && expectedId !== derivedExtensionId) {
    throw new Error('derived extension id does not match expected managed extension id');
  }
  if (!/^https:\/\//i.test(baseUrl)) throw new Error('base-url must be HTTPS for production policy use');

  stageExtensionPackage(extensionDir, packageDir, managedDeployment);

  if (pack) {
    const chromePath = findChromeExecutable(args.chrome || process.env.CHROME_EXE || '');
    packCrx({ repoRoot, packageDir, outputDir, crxPath, keyPath, chromePath });
  }

  const artifact = writeUpdateArtifacts({ outputDir, hostOutputDir, version, extensionId, baseUrl, crxPath, crxFileName, requireCrx });

  console.log(JSON.stringify({
    ok: true,
    dryRun: !artifact.crxExists,
    packed: pack,
    outputDir,
    hostOutputDir,
    version,
    extensionId,
    updateXml: path.join(outputDir, 'update.xml'),
    sha256Sums: path.join(outputDir, 'SHA256SUMS.txt'),
    packageDir,
    crxExpected: crxPath,
    crxExists: artifact.crxExists,
    crxSha256: artifact.crxSha256,
    codebase: artifact.codebase,
    keyProvided: !!keyPath,
  }, null, 2));
}

try {
  main();
} catch (err) {
  console.error(err?.message || String(err));
  process.exit(1);
}
