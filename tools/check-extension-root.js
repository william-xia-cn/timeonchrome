#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const root = process.cwd();
const extensionRoot = path.join(root, 'extension');

const requiredFiles = [
  'manifest.json',
  'managed-storage-schema.json',
  'background.js',
  'health-probe.html',
  'health-probe.js',
  'content.js',
  'content.css',
  'message-router.js',
  'popup/popup.html',
  'admin/admin.html',
  'rules/block_rules.json',
  'infra/local-guardian.js',
  'icons/icon16.png',
  'icons/icon48.png',
  'icons/icon128.png',
];

const forbiddenSegments = new Set([
  '.git',
  '.opencode',
  '.wrangler',
  'node_modules',
  'tests',
  'test-results',
  'dist',
  'Release',
  'backup',
  'docs',
  'openspec',
  'pages',
  'workers',
  'tools',
]);

function fail(message) {
  console.error(`FAIL ${message}`);
  process.exitCode = 1;
}

function bytesIn(dir) {
  let total = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) total += bytesIn(full);
    else total += fs.statSync(full).size;
  }
  return total;
}

function walk(dir, rel = '') {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const childRel = rel ? `${rel}/${entry.name}` : entry.name;
    if (forbiddenSegments.has(entry.name)) fail(`forbidden entry inside extension/: ${childRel}`);
    if (entry.isDirectory()) walk(path.join(dir, entry.name), childRel);
  }
}

if (!fs.existsSync(extensionRoot)) fail('missing extension/ directory');
else {
  const manifestPath = path.join(extensionRoot, 'manifest.json');
  if (!fs.existsSync(manifestPath)) fail('missing extension/manifest.json');
  else {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    if (manifest.manifest_version !== 3) fail('manifest_version is not 3');
    if (manifest.storage?.managed_schema !== 'managed-storage-schema.json') {
      fail('manifest does not declare storage.managed_schema');
    }
    if (manifest.update_url !== 'https://timeonchrome-update.pages.dev/timeonchrome/update.xml') {
      fail('manifest does not declare the production self-hosted update_url');
    }
  }

  for (const rel of requiredFiles) {
    if (!fs.existsSync(path.join(extensionRoot, rel))) fail(`missing required file: extension/${rel}`);
  }

  walk(extensionRoot);

  const sizeMb = bytesIn(extensionRoot) / 1024 / 1024;
  console.log(`extension/ size: ${sizeMb.toFixed(2)} MB`);
}

if (process.exitCode) process.exit(process.exitCode);
console.log('extension/ root check passed');
