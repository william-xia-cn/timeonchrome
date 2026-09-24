const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function verify(dir, expectedSha, expectedContractVersion, expectedContractHash) {
  if (!/^[0-9a-f]{40}$/.test(expectedSha)) throw new Error('EXPECTED_NATIVE_SHA_INVALID');
  const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
  if (manifest.sourceRepository !== 'william-xia-cn/TimeWhereNative') throw new Error('SOURCE_REPOSITORY_MISMATCH');
  if (manifest.sourceGitSha !== expectedSha) throw new Error('SOURCE_SHA_MISMATCH');
  if (manifest.contractsVersion !== expectedContractVersion || manifest.contractsSha256 !== expectedContractHash) {
    throw new Error('CONTRACT_LOCK_MISMATCH');
  }
  if (manifest.platform !== 'windows' || manifest.architecture !== 'x64') throw new Error('PLATFORM_MISMATCH');
  if (manifest.signed !== false || manifest.releaseStatus !== 'BLOCKED_BY_AUTHENTICODE_SIGNING') {
    throw new Error('RELEASE_STATUS_MISMATCH');
  }
  if (!/^\d+\.\d+\.\d+$/.test(manifest.version)) throw new Error('VERSION_INVALID');
  for (const [prefix, expectedName] of [
    ['bootstrapper', `TimeOnChrome-AppRuntime-Setup-win-x64-${manifest.version}.exe`],
    ['msi', `TimeOnChrome-AppRuntime-win-x64-${manifest.version}.msi`],
  ]) {
    const key = manifest[`${prefix}Path`];
    const name = path.posix.basename(key || '');
    if (!key || name !== expectedName || key !== `windows/x64/${manifest.version}/${name}`) {
      throw new Error(`${prefix.toUpperCase()}_PATH_INVALID`);
    }
    const file = path.join(dir, name);
    if (!fs.lstatSync(file).isFile() || fs.statSync(file).size !== manifest[`${prefix}SizeBytes`]) {
      throw new Error(`${prefix.toUpperCase()}_SIZE_MISMATCH`);
    }
    if (sha256(file) !== manifest[`${prefix}Sha256`]) throw new Error(`${prefix.toUpperCase()}_HASH_MISMATCH`);
  }
  return manifest;
}

if (require.main === module) {
  const [dir, sha, contractVersion, contractHash] = process.argv.slice(2);
  const manifest = verify(dir, sha, contractVersion, contractHash);
  process.stdout.write(`${JSON.stringify({ version: manifest.version, sourceGitSha: sha, contractsVersion: contractVersion })}\n`);
}

module.exports = { verify };
