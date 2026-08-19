// Run with: node tests/unit/managed-package-privacy-boundary.test.js

'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.join(__dirname, '..', '..');
const tool = path.join(root, 'tools', 'self-hosted-crx-dry-run.js');
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'timeonchrome-managed-package-'));
const extensionId = 'jdcancbiocacabbjdkngadmjpjmkdnih';

function stage(name, managedDeployment) {
  const outputDir = path.join(tempRoot, name);
  const args = [tool, '--output-dir', outputDir, '--extension-id', extensionId];
  if (managedDeployment) args.push('--managed-deployment');
  const result = spawnSync(process.execPath, args, { cwd: root, encoding: 'utf8' });
  assert.strictEqual(result.status, 0, result.stderr || result.stdout);
  return path.join(outputDir, 'package-extension');
}

try {
  const managed = stage('managed', true);
  for (const entry of ['privacy-consent.html', 'privacy-consent.js', 'privacy.html']) {
    assert.strictEqual(fs.existsSync(path.join(managed, entry)), false, `${entry} leaked into managed package`);
  }
  assert.strictEqual(fs.existsSync(path.join(managed, 'core', 'privacy-consent.js')), true);
  assert.deepStrictEqual(JSON.parse(fs.readFileSync(path.join(managed, 'deployment-profile.json'), 'utf8')), { mode: 'managed' });
  const managedManifest = JSON.parse(fs.readFileSync(path.join(managed, 'manifest.json'), 'utf8'));
  assert.strictEqual(managedManifest.permissions.includes('nativeMessaging'), true);
  assert.strictEqual(managedManifest.web_accessible_resources.some((entry) => entry.resources.includes('health-probe.html')), true);

  const regular = stage('regular', false);
  for (const entry of ['privacy-consent.html', 'privacy-consent.js', 'privacy.html']) {
    assert.strictEqual(fs.existsSync(path.join(regular, entry)), true, `${entry} missing from regular package`);
  }
  assert.strictEqual(fs.existsSync(path.join(regular, 'deployment-profile.json')), false);
  const regularManifest = JSON.parse(fs.readFileSync(path.join(regular, 'manifest.json'), 'utf8'));
  assert.strictEqual(regularManifest.permissions.includes('nativeMessaging'), false);
  assert.strictEqual(regularManifest.web_accessible_resources.some((entry) => entry.resources.includes('health-probe.html')), false);
  console.log('[Managed Package Privacy Boundary] 12/12 passed');
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
