const fs = require('fs');

const OUTPUT_KEYS = [
  'docs',
  'contracts',
  'worker',
  'console',
  'windows',
  'installer',
  'macos',
  'release_config',
];

const GOVERNANCE_DOCS = new Set([
  'AGENTS.md',
  'PROJECT_WORKFLOW.md',
  'docs/agents/ProductProjectMg.md',
  'docs/agents/BuildTest.md',
  'docs/agents/ReleaseMg.md',
]);

const RELEASE_CONFIG_FILES = new Set([
  '.github/workflows/app-runtime.yml',
  '.github/workflows/app-runtime-production.yml',
  'tools/classify-app-runtime-ci-changes.js',
  'tools/write-app-runtime-release-manifest.js',
  'tools/check-app-runtime-boundaries.js',
  'tests/unit/app-runtime-ci-routing.test.js',
  'tests/unit/app-runtime-release-config.test.js',
]);

function emptyResult() {
  return Object.fromEntries([...OUTPUT_KEYS.map((key) => [key, false]), ['unclassified', []]]);
}

function normalizePath(value) {
  return value.trim().replaceAll('\\', '/').replace(/^\.\//, '');
}

function classifyPaths(paths, options = {}) {
  const result = emptyResult();
  if (options.forceFull) {
    for (const key of OUTPUT_KEYS) result[key] = true;
    return result;
  }

  for (const rawPath of paths) {
    const file = normalizePath(rawPath);
    if (!file) continue;

    if (GOVERNANCE_DOCS.has(file)
      || file === 'app-runtime-management/README.md'
      || file.startsWith('app-runtime-management/docs/')) {
      result.docs = true;
      continue;
    }
    if (RELEASE_CONFIG_FILES.has(file)) {
      result.release_config = true;
      continue;
    }
    if (file === 'package.json' || file === 'package-lock.json') {
      result.contracts = true;
      result.worker = true;
      result.console = true;
      continue;
    }
    if (file.startsWith('app-runtime-management/contracts/')) {
      result.contracts = true;
      result.worker = true;
      result.windows = true;
      result.macos = true;
      continue;
    }
    if (file.startsWith('app-runtime-management/backend/')) {
      result.worker = true;
      continue;
    }
    if (file.startsWith('app-runtime-management/console/')) {
      result.console = true;
      continue;
    }
    if (file.startsWith('app-runtime-management/agents/windows/')) {
      result.windows = true;
      continue;
    }
    if (file.startsWith('app-runtime-management/installer/windows/')) {
      result.installer = true;
      continue;
    }
    if (file.startsWith('app-runtime-management/installer/')) {
      result.docs = true;
      continue;
    }
    if (file.startsWith('app-runtime-management/agents/macos/')) {
      result.macos = true;
      continue;
    }
    if (file.startsWith('app-runtime-management/')) {
      result.unclassified.push(file);
    }
  }
  return result;
}

function writeGitHubOutput(result, outputPath) {
  const lines = OUTPUT_KEYS.map((key) => `${key}=${result[key]}`);
  lines.push(`unclassified=${JSON.stringify(result.unclassified)}`);
  fs.appendFileSync(outputPath, `${lines.join('\n')}\n`);
}

function validateGateResults(requirements, results) {
  if (results.changes !== 'success') throw new Error(`changes failed: ${results.changes}`);
  for (const [name, requiredValue] of Object.entries(requirements)) {
    const required = requiredValue === true || requiredValue === 'true';
    const expected = required ? 'success' : 'skipped';
    if (results[name] !== expected) {
      throw new Error(`${name} expected ${expected} but result=${results[name]}`);
    }
  }
}

if (require.main === module) {
  const args = process.argv.slice(2);
  if (args.includes('--verify-gate')) {
    validateGateResults(
      JSON.parse(process.env.CI_REQUIREMENTS || '{}'),
      JSON.parse(process.env.CI_RESULTS || '{}'),
    );
    process.stdout.write('app-runtime-gate: PASS\n');
    process.exit(0);
  }
  const forceFull = args.includes('--force-full');
  const githubOutput = args.includes('--github-output');
  const paths = fs.readFileSync(0, 'utf8').split(/\r?\n/);
  const result = classifyPaths(paths, { forceFull });
  if (githubOutput) {
    if (!process.env.GITHUB_OUTPUT) throw new Error('GITHUB_OUTPUT is required');
    writeGitHubOutput(result, process.env.GITHUB_OUTPUT);
  } else {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  }
  if (result.unclassified.length > 0) process.exitCode = 2;
}

module.exports = { OUTPUT_KEYS, classifyPaths, normalizePath, validateGateResults };
