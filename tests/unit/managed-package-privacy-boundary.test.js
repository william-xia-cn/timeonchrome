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
const { stageExtensionPackage, validateExtensionPackageRoot } = require(tool);
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

function stage(name, mode, candidateVersion, closeDevelopment = false) {
  const outputDir = path.join(tempRoot, name);
  const targetExtensionId = mode === 'native-host-development' ? developmentExtensionId : extensionId;
  const args = [tool, '--output-dir', outputDir, '--extension-id', targetExtensionId];
  if (mode === 'managed') args.push('--managed-deployment');
  if (mode === 'native-host-development') {
    args.push('--native-host-development', '--public-key-manifest', publicKeyManifestPath);
  }
  if (candidateVersion) args.push('--candidate-version', candidateVersion);
  if (closeDevelopment) args.push('--shared-browser-close-development');
  const result = spawnSync(process.execPath, args, { cwd: root, encoding: 'utf8' });
  assert.strictEqual(result.status, 0, result.stderr || result.stdout);
  return { outputDir, packageDir: path.join(outputDir, 'package-extension'), result };
}

try {
  // Only temporary staging fixtures: never launch Chrome or create/sign a CRX.
  const fixture = path.join(tempRoot, 'contract-fixture');
  const fixtureContracts = path.join(fixture, 'core', 'shared-contracts');
  for (const version of ['2.0.0', '1.0.0']) fs.mkdirSync(path.join(fixtureContracts, version), { recursive: true });
  for (const name of ['manifest.json', 'managed-storage-schema.json']) {
    fs.copyFileSync(path.join(root, 'extension', name), path.join(fixture, name));
  }
  fs.writeFileSync(path.join(fixture, 'background.js'), "import { value } from './core/shared-contracts/2.0.0/current.js';\n");
  fs.writeFileSync(path.join(fixtureContracts, '2.0.0', 'current.js'), "export { value } from './dependency.js';\n");
  fs.writeFileSync(path.join(fixtureContracts, '2.0.0', 'dependency.js'), 'export const value = 1;\n');
  fs.writeFileSync(path.join(fixtureContracts, '2.0.0', 'example.vectors.json'), '{}');
  fs.writeFileSync(path.join(fixtureContracts, '1.0.0', 'old.js'), 'export const retired = true;\n');
  const fixtureStage = path.join(tempRoot, 'contract-staging');
  stageExtensionPackage(fixture, fixtureStage);
  assert.deepStrictEqual(fs.readdirSync(path.join(fixtureStage, 'core', 'shared-contracts')), ['2.0.0']);
  for (const name of ['current.js', 'dependency.js']) {
    assert.deepStrictEqual(fs.readFileSync(path.join(fixtureStage, 'core', 'shared-contracts', '2.0.0', name)),
      fs.readFileSync(path.join(fixtureContracts, '2.0.0', name)));
  }
  assert.strictEqual(fs.existsSync(path.join(fixtureContracts, '1.0.0', 'old.js')), true, 'historical source must remain');
  assert.strictEqual(fs.existsSync(path.join(fixtureStage, 'core', 'shared-contracts', '2.0.0', 'example.vectors.json')), false);
  assert.strictEqual(fs.existsSync(path.join(fixtureContracts, '2.0.0', 'example.vectors.json')), true, 'source test vector must remain');
  fs.writeFileSync(path.join(fixtureStage, 'core', 'shared-contracts', '2.0.0', 'example.vectors.json'), '{}');
  assert.throws(() => validateExtensionPackageRoot(fixtureStage), /test-only contract vectors/);
  fs.unlinkSync(path.join(fixtureStage, 'core', 'shared-contracts', '2.0.0', 'example.vectors.json'));
  fs.writeFileSync(path.join(fixtureStage, 'core', 'shared-web-contribution.js'), 'export const old = true;');
  assert.throws(() => validateExtensionPackageRoot(fixtureStage), /retired business module/);
  fs.unlinkSync(path.join(fixtureStage, 'core', 'shared-web-contribution.js'));
  fs.mkdirSync(path.join(fixtureStage, 'core', 'shared-contracts', '1.0.0'));
  assert.throws(() => validateExtensionPackageRoot(fixtureStage), /non-current contract entries/);
  fs.writeFileSync(path.join(fixture, 'ambiguous.js'), "import './core/shared-contracts/1.0.0/old.js';\n");
  assert.throws(() => stageExtensionPackage(fixture, path.join(tempRoot, 'ambiguous-stage')), /exactly one current contract version/);
  assert.strictEqual(fs.existsSync(path.join(tempRoot, 'ambiguous-stage')), false);
  fs.writeFileSync(path.join(fixture, 'ambiguous.js'), "import './core/shared-contracts/2.0.0/missing.js';\n");
  assert.throws(() => stageExtensionPackage(fixture, path.join(tempRoot, 'missing-stage')), /dependency missing or invalid/);
  assert.strictEqual(fs.existsSync(path.join(tempRoot, 'missing-stage')), false);

  const managedStage = stage('managed', 'managed');
  const managed = managedStage.packageDir;
  for (const entry of ['privacy-consent.html', 'privacy-consent.js', 'privacy.html']) {
    assert.strictEqual(fs.existsSync(path.join(managed, entry)), false, `${entry} leaked into managed package`);
  }
  assert.strictEqual(fs.existsSync(path.join(managed, 'core', 'privacy-consent.js')), true);
  assert.deepStrictEqual(JSON.parse(fs.readFileSync(path.join(managed, 'deployment-profile.json'), 'utf8')), { mode: 'managed' });
  const managedManifest = JSON.parse(fs.readFileSync(path.join(managed, 'manifest.json'), 'utf8'));
  assert.strictEqual(managedManifest.permissions.includes('nativeMessaging'), true);
  assert.strictEqual(managedManifest.permissions.includes('debugger'), false);
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
  assert.strictEqual(developmentManifest.permissions.includes('debugger'), false);
  assert.strictEqual(developmentManifest.web_accessible_resources.some((entry) => entry.resources.includes('health-probe.html')), true);
  assert.strictEqual(fs.existsSync(path.join(developmentStage.outputDir, 'update.xml')), false);
  assert.strictEqual(fs.existsSync(path.join(developmentStage.outputDir, 'SHA256SUMS.txt')), false);
  const developmentOutput = JSON.parse(developmentStage.result.stdout);
  assert.strictEqual(developmentOutput.deploymentMode, 'native-host-development');
  assert.strictEqual(developmentOutput.publicKeyManifestProvided, true);
  const closeStage = stage('close-development', 'native-host-development', null, true);
  const closeManifest = JSON.parse(fs.readFileSync(path.join(closeStage.packageDir, 'manifest.json'), 'utf8'));
  assert.strictEqual(closeManifest.permissions.includes('debugger'), true);
  assert.deepStrictEqual(JSON.parse(fs.readFileSync(path.join(closeStage.packageDir, 'deployment-profile.json'), 'utf8')),
    { mode: 'native-host-development', sharedBrowserCloseDevelopment: true });
  for (const modeArgs of [[], ['--managed-deployment']]) {
    const destination = path.join(tempRoot, `forbidden-close-${modeArgs.length}`);
    const rejected = spawnSync(process.execPath, [tool, '--output-dir', destination,
      '--shared-browser-close-development', ...modeArgs], { cwd: root, encoding: 'utf8' });
    assert.notStrictEqual(rejected.status, 0);
    assert.match(rejected.stderr, /requires an unpacked/);
    assert.strictEqual(fs.existsSync(destination), false);
  }

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
  assert.strictEqual(regularManifest.permissions.includes('debugger'), false);
  assert.strictEqual(regularManifest.web_accessible_resources.some((entry) => entry.resources.includes('health-probe.html')), false);
  const currentVersion = fs.readFileSync(path.join(root, 'extension', 'core', 'shared-access-policy.js'), 'utf8')
    .match(/shared-contracts\/([^/]+)\//)[1];
  const currentSource = path.join(root, 'extension', 'core', 'shared-contracts', currentVersion);
  for (const staged of [managed, development, regular, fixedStage.packageDir, closeStage.packageDir]) {
    const stagedContracts = path.join(staged, 'core', 'shared-contracts');
    assert.deepStrictEqual(fs.readdirSync(stagedContracts), [currentVersion]);
    for (const name of fs.readdirSync(currentSource)) {
      if (name.endsWith('.vectors.json')) {
        assert.strictEqual(fs.existsSync(path.join(stagedContracts, currentVersion, name)), false);
        continue;
      }
      assert.deepStrictEqual(fs.readFileSync(path.join(stagedContracts, currentVersion, name)),
        fs.readFileSync(path.join(currentSource, name)), `current contract ${name} changed in staging`);
    }
  }
  console.log('[Managed Package Privacy Boundary] managed/development/regular matrix passed');
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
