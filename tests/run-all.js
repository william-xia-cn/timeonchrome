#!/usr/bin/env node
// Unified test runner for TimeOnChrome
// Usage: node tests/run-all.js
// Exit code: 0 = all passed, 1 = any failure

'use strict';

const { spawnSync } = require('child_process');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

function run(label, cmd, args, cwd) {
  console.log(`\n${'='.repeat(50)}`);
  console.log(`Running: ${label}`);
  console.log('='.repeat(50));

  const result = spawnSync(cmd, args, {
    cwd,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });

  return result.status === 0;
}

const results = {};

// ── Layer 1a: Unit tests (pure utilities) ─────────────────────────────────────
results.unit = run(
  'Unit Tests (tests/unit/logic.test.js)',
  'node',
  ['tests/unit/logic.test.js'],
  ROOT
);

// ── Layer 1b: Unit tests (background business logic) ─────────────────────────
results.bgLogic = run(
  'Background Logic Tests (tests/unit/background-logic.test.js)',
  'node',
  ['tests/unit/background-logic.test.js'],
  ROOT
);

// ── Layer 1c: Unit tests (workers pure logic) ─────────────────────────────────
results.workersLogic = run(
  'Workers Logic Tests (tests/unit/workers-logic.test.js)',
  'node',
  ['tests/unit/workers-logic.test.js'],
  ROOT
);

// ── Layer 1d: Unit tests (duration-tracking: state/context/aggregate) ────────
results.durationTracking = run(
  'Duration Tracking Tests (tests/unit/duration-tracking.test.js)',
  'node',
  ['tests/unit/duration-tracking.test.js'],
  ROOT
);

// ── Layer 1e: Unit tests (recovery mechanism) ────────────────────────────────
results.recovery = run(
  'Recovery Tests (tests/unit/recovery.test.js)',
  'node',
  ['tests/unit/recovery.test.js'],
  ROOT
);

// ── Layer 1f: Unit tests (event-log) ─────────────────────────────────────────
results.eventLog = run(
  'Event Log Tests (tests/unit/event-log.test.js)',
  'node',
  ['tests/unit/event-log.test.js'],
  ROOT
);

// ── Layer 2: API integration tests ────────────────────────────────────────────
results.api = run(
  'API Integration Tests (tests/api/workers.test.js)',
  'node',
  ['tests/api/workers.test.js'],
  ROOT
);

// ── Layer 2b: Integration tests (duration flow) ──────────────────────────────
results.durationFlow = run(
  'Duration Flow Integration Tests (tests/integration/duration-flow.test.js)',
  'node',
  ['tests/integration/duration-flow.test.js'],
  ROOT
);

// ── Layer 3: Extension E2E tests ──────────────────────────────────────────────
results.e2e = run(
  'E2E Tests (tests/e2e/extension.test.js)',
  'npx',
  ['playwright', 'test', 'tests/e2e/extension.test.js', '--config=playwright.config.js'],
  ROOT
);

// ── Summary ───────────────────────────────────────────────────────────────────
console.log('\n');
console.log('='.repeat(50));
console.log('  TimeOnChrome 自动化测试报告');
console.log('='.repeat(50));

const labels = {
  unit:               '[Unit]     logic.test.js',
  bgLogic:            '[Unit]     background-logic.test.js',
  workersLogic:       '[Unit]     workers-logic.test.js',
  durationTracking:   '[Unit]     duration-tracking.test.js',
  recovery:           '[Unit]     recovery.test.js',
  eventLog:           '[Unit]     event-log.test.js',
  api:                '[API]      workers.test.js',
  durationFlow:       '[Integ]    duration-flow.test.js',
  e2e:                '[E2E]      extension.test.js',
};

let allPassed = true;
for (const [key, passed] of Object.entries(results)) {
  const icon = passed ? '✓' : '✗';
  console.log(`  ${icon} ${labels[key]}`);
  if (!passed) allPassed = false;
}

console.log('='.repeat(50));
console.log(allPassed ? '  全部通过 ✓' : '  存在失败项 ✗');
console.log('='.repeat(50));
console.log('');

process.exit(allPassed ? 0 : 1);
