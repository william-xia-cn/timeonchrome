#!/usr/bin/env node
// Generate a self-hosted Chrome update.xml dry-run for the managed internal channel.
// This script does not sign or package CRX files and never reads private keys.

'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const value = argv[i];
    if (!value.startsWith('--')) continue;
    const key = value.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith('--')) {
      args[key] = true;
    } else {
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

function main() {
  const args = parseArgs(process.argv.slice(2));
  const repoRoot = path.resolve(__dirname, '..');
  const manifest = readJson(path.join(repoRoot, 'extension', 'manifest.json'));
  const version = manifest.version;
  if (!version) throw new Error('manifest version not found');

  const outputDir = path.resolve(repoRoot, args['output-dir'] || path.join('dist', 'self-hosted'));
  const extensionId = args['extension-id'] || 'REPLACE_WITH_STABLE_EXTENSION_ID';
  const baseUrl = String(args['base-url'] || 'https://timeonchrome-update.example.com/timeonchrome').replace(/\/$/, '');
  const crxFileName = `timeonchrome-${version}.crx`;
  const crxPath = path.resolve(args.crx || path.join(outputDir, crxFileName));
  const requireCrx = args['require-crx'] === true;

  if (!/^[a-p]{32}$/.test(extensionId) && extensionId !== 'REPLACE_WITH_STABLE_EXTENSION_ID') {
    throw new Error('extension id must be 32 Chrome id chars a-p, or leave the dry-run placeholder');
  }
  if (!/^https:\/\//i.test(baseUrl)) {
    throw new Error('base-url must be HTTPS for production policy use');
  }

  ensureDir(outputDir);
  const codebase = `${baseUrl}/${encodeURIComponent(crxFileName)}`;
  const updateXml = `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<gupdate xmlns="http://www.google.com/update2/response" protocol="2.0">\n` +
    `  <app appid="${xmlEscape(extensionId)}">\n` +
    `    <updatecheck codebase="${xmlEscape(codebase)}" version="${xmlEscape(version)}" />\n` +
    `  </app>\n` +
    `</gupdate>\n`;
  fs.writeFileSync(path.join(outputDir, 'update.xml'), updateXml, 'utf8');

  const crxExists = fs.existsSync(crxPath);
  if (requireCrx && !crxExists) {
    throw new Error(`CRX not found: ${crxPath}`);
  }

  const shaLines = [
    '# TimeOnChrome self-hosted CRX dry-run',
    `# manifest_version=${version}`,
    `# extension_id=${extensionId}`,
    `# codebase=${codebase}`,
  ];
  if (crxExists) {
    shaLines.push(`${sha256File(crxPath)}  ${path.basename(crxPath)}`);
  } else {
    shaLines.push(`# CRX missing in dry-run: ${crxFileName}`);
  }
  fs.writeFileSync(path.join(outputDir, 'SHA256SUMS.txt'), `${shaLines.join('\n')}\n`, 'utf8');

  console.log(JSON.stringify({
    ok: true,
    dryRun: !crxExists,
    outputDir,
    version,
    extensionId,
    updateXml: path.join(outputDir, 'update.xml'),
    sha256Sums: path.join(outputDir, 'SHA256SUMS.txt'),
    crxExpected: crxPath,
    crxExists,
  }, null, 2));
}

try {
  main();
} catch (err) {
  console.error(err?.message || String(err));
  process.exit(1);
}
