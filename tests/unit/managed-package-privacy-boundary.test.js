// Run with: node tests/unit/managed-package-privacy-boundary.test.js

'use strict';

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.join(__dirname, '..', '..');
const tool = path.join(root, 'tools', 'self-hosted-crx-dry-run.js');
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'timeonchrome-managed-package-'));
const extensionId = 'jdcancbiocacabbjdkngadmjpjmkdnih';
const developmentKeyPair = crypto.generateKeyPairSync('rsa', { modulusLength: 1024 });
const developmentPublicKey = developmentKeyPair.publicKey.export({ type: 'spki', format: 'der' });
const developmentDigest = crypto.createHash('sha256').update(developmentPublicKey).digest();
const developmentExtensionId = [...developmentDigest.subarray(0, 16)]
  .map((value) => String.fromCharCode(97 + (value >> 4), 97 + (value & 0x0f)))
  .join('');
const publicKeyManifestPath = path.join(tempRoot, 'public-key-source.json');
fs.writeFileSync(publicKeyManifestPath, JSON.stringify({ key: developmentPublicKey.toString('base64') }));

function stage(name, mode, candidateVersion) {
  const outputDir = path.join(tempRoot, name);
  const targetExtensionId = mode === 'native-host-development' ? developmentExtensionId : extensionId;
  const args = [tool, '--output-dir', outputDir, '--extension-id', targetExtensionId];
  if (mode === 'managed') args.push('--managed-deployment');
  if (mode === 'native-host-development') {
    args.push('--native-host-development', '--public-key-manifest', publicKeyManifestPath);
  }
  if (candidateVersion) args.push('--candidate-version', candidateVersion);
  const result = spawnSync(process.execPath, args, { cwd: root, encoding: 'utf8' });
  assert.strictEqual(result.status, 0, result.stderr || result.stdout);
  return { outputDir, packageDir: path.join(outputDir, 'package-extension'), result };
}

try {
  const managedStage = stage('managed', 'managed');
  const managed = managedStage.packageDir;
  for (const entry of ['privacy-consent.html', 'privacy-consent.js', 'privacy.html']) {
    assert.strictEqual(fs.existsSync(path.join(managed, entry)), false, `${entry} leaked into managed package`);
  }
  assert.strictEqual(fs.existsSync(path.join(managed, 'core', 'privacy-consent.js')), true);
  assert.deepStrictEqual(JSON.parse(fs.readFileSync(path.join(managed, 'deployment-profile.json'), 'utf8')), { mode: 'managed' });
  const managedManifest = JSON.parse(fs.readFileSync(path.join(managed, 'manifest.json'), 'utf8'));
  assert.strictEqual(managedManifest.permissions.includes('nativeMessaging'), true);
  assert.strictEqual(managedManifest.web_accessible_resources.some((entry) => entry.resources.includes('health-probe.html')), true);

  const developmentStage = stage('native-host-development', 'native-host-development');
  const development = developmentStage.packageDir;
  for (const entry of ['privacy-consent.html', 'privacy-consent.js', 'privacy.html']) {
    assert.strictEqual(fs.existsSync(path.join(development, entry)), true, `${entry} missing from development package`);
  }
  assert.deepStrictEqual(JSON.parse(fs.readFileSync(path.join(development, 'deployment-profile.json'), 'utf8')), { mode: 'native-host-development' });
  const developmentManifest = JSON.parse(fs.readFileSync(path.join(development, 'manifest.json'), 'utf8'));
  assert.strictEqual(developmentManifest.key, developmentPublicKey.toString('base64'));
  assert.strictEqual(developmentManifest.version_name, `${developmentManifest.version} Native Host Development Candidate`);
  assert.strictEqual(developmentManifest.permissions.includes('nativeMessaging'), true);
  assert.strictEqual(developmentManifest.web_accessible_resources.some((entry) => entry.resources.includes('health-probe.html')), true);
  assert.strictEqual(fs.existsSync(path.join(developmentStage.outputDir, 'update.xml')), false);
  assert.strictEqual(fs.existsSync(path.join(developmentStage.outputDir, 'SHA256SUMS.txt')), false);
  const developmentOutput = JSON.parse(developmentStage.result.stdout);
  assert.strictEqual(developmentOutput.deploymentMode, 'native-host-development');
  assert.strictEqual(developmentOutput.publicKeyManifestProvided, true);

  const sourceVersion = JSON.parse(fs.readFileSync(path.join(root, 'extension', 'manifest.json'), 'utf8')).version;
  const fixedStage = stage('native-host-managed-candidate', 'native-host-development', '1.7.35');
  const fixedManifest = JSON.parse(fs.readFileSync(path.join(fixedStage.packageDir, 'manifest.json'), 'utf8'));
  assert.strictEqual(fixedManifest.version, '1.7.35');
  assert.strictEqual(fixedManifest.key, developmentManifest.key);
  assert.strictEqual(fixedManifest.version_name, '1.7.35 Native Host Development Candidate');
  assert.strictEqual(JSON.parse(fixedStage.result.stdout).version, '1.7.35');
  assert.strictEqual(JSON.parse(fs.readFileSync(path.join(root, 'extension', 'manifest.json'), 'utf8')).version, sourceVersion);
  assert.match(fs.readFileSync(path.join(fixedStage.packageDir, 'infra', 'native-host-client.js'), 'utf8'), /dailyUsageSnapshot/);

  for (const modeArgs of [[], ['--managed-deployment'], ['--native-host-development', '--candidate-version', 'bad']]) {
    const forbiddenVersion = spawnSync(process.execPath, [
      tool, '--output-dir', path.join(tempRoot, 'forbidden-version'), '--candidate-version', '1.7.35', ...modeArgs,
    ], { cwd: root, encoding: 'utf8' });
    assert.notStrictEqual(forbiddenVersion.status, 0);
    assert.match(forbiddenVersion.stderr, /candidate-version/);
    assert.strictEqual(fs.existsSync(path.join(tempRoot, 'forbidden-version')), false);
  }

  const forbiddenPack = spawnSync(process.execPath, [
    tool, '--output-dir', path.join(tempRoot, 'forbidden-pack'), '--extension-id', developmentExtensionId,
    '--native-host-development', '--public-key-manifest', publicKeyManifestPath, '--pack',
  ], { cwd: root, encoding: 'utf8' });
  assert.notStrictEqual(forbiddenPack.status, 0);
  assert.match(forbiddenPack.stderr, /unpacked-only/);

  const missingKey = spawnSync(process.execPath, [
    tool, '--output-dir', path.join(tempRoot, 'missing-key'), '--extension-id', developmentExtensionId,
    '--native-host-development',
  ], { cwd: root, encoding: 'utf8' });
  assert.notStrictEqual(missingKey.status, 0);
  assert.match(missingKey.stderr, /public-key-manifest/);

  const regularStage = stage('regular', null);
  const regular = regularStage.packageDir;
  for (const entry of ['privacy-consent.html', 'privacy-consent.js', 'privacy.html']) {
    assert.strictEqual(fs.existsSync(path.join(regular, entry)), true, `${entry} missing from regular package`);
  }
  assert.strictEqual(fs.existsSync(path.join(regular, 'deployment-profile.json')), false);
  const regularManifest = JSON.parse(fs.readFileSync(path.join(regular, 'manifest.json'), 'utf8'));
  assert.strictEqual(regularManifest.permissions.includes('nativeMessaging'), false);
  assert.strictEqual(regularManifest.web_accessible_resources.some((entry) => entry.resources.includes('health-probe.html')), false);
  console.log('[Managed Package Privacy Boundary] managed/development/regular matrix passed');
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
