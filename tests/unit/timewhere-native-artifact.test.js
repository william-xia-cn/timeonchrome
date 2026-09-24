const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { verify } = require('../../tools/verify-timewhere-native-artifact');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'native-artifact-'));
const sourceSha = 'a'.repeat(40);
const contractHash = 'b'.repeat(64);
try {
  const files = [
    ['bootstrapper', 'TimeOnChrome-AppRuntime-Setup-win-x64-2.6.0.exe', 'exe'],
    ['msi', 'TimeOnChrome-AppRuntime-win-x64-2.6.0.msi', 'msi'],
  ];
  const manifest = {
    version: '2.6.0', sourceRepository: 'william-xia-cn/TimeWhereNative', sourceGitSha: sourceSha,
    contractsVersion: '1.12.0', contractsSha256: contractHash,
    platform: 'windows', architecture: 'x64', signed: false,
    releaseStatus: 'BLOCKED_BY_AUTHENTICODE_SIGNING',
  };
  for (const [prefix, name] of files) {
    const content = Buffer.from(name);
    fs.writeFileSync(path.join(dir, name), content);
    manifest[`${prefix}Path`] = `windows/x64/2.6.0/${name}`;
    manifest[`${prefix}SizeBytes`] = content.length;
    manifest[`${prefix}Sha256`] = crypto.createHash('sha256').update(content).digest('hex');
  }
  const save = () => fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(manifest));
  save();
  assert.equal(verify(dir, sourceSha, '1.12.0', contractHash).version, '2.6.0');
  assert.throws(() => verify(dir, 'c'.repeat(40), '1.12.0', contractHash), /SOURCE_SHA_MISMATCH/);
  assert.throws(() => verify(dir, sourceSha, '1.10.0', contractHash), /CONTRACT_LOCK_MISMATCH/);
  manifest.bootstrapperPath = 'windows/x64/2.6.0/../bad.exe';
  save();
  assert.throws(() => verify(dir, sourceSha, '1.12.0', contractHash), /BOOTSTRAPPER_PATH_INVALID/);
  manifest.bootstrapperPath = `windows/x64/2.6.0/${files[0][1]}`;
  manifest.msiSha256 = '0'.repeat(64);
  save();
  assert.throws(() => verify(dir, sourceSha, '1.12.0', contractHash), /MSI_HASH_MISMATCH/);
  const workflow = fs.readFileSync(path.join(__dirname, '../../.github/workflows/timewhere-native-artifact-gate.yml'), 'utf8');
  assert(workflow.includes("--if-none-match '*'"));
  assert(workflow.includes('if: inputs.publish_immutable_r2'));
  assert(workflow.includes('TIMEWHERE_R2_ACCESS_KEY_ID'));
  assert(workflow.includes('TIMEWHERE_NATIVE_READ_TOKEN'));
  assert(workflow.indexOf('publish_one "$burn"') < workflow.indexOf('publish_one "windows/x64/${CANDIDATE_VERSION}/manifest.json"'));
  assert(!workflow.includes('r2 object put'));
  console.log('timewhere-native-artifact tests: PASS');
} finally {
  fs.rmSync(dir, { recursive: true, force: true });
}
