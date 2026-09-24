const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const runtimeRoot = path.join(root, 'app-runtime-management');
const codeExtensions = new Set(['.js', '.mjs', '.cjs', '.ts', '.tsx', '.cs', '.swift']);
const importPattern = /(?:from\s+|import\s*\(|require\s*\()\s*['"]([^'"]+)['"]/g;
const violations = [];

function walk(directory, visit) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (['node_modules', 'bin', 'obj', 'dist', '.wrangler'].includes(entry.name)) continue;
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(fullPath, visit);
    else visit(fullPath);
  }
}

walk(runtimeRoot, (file) => {
  if (!codeExtensions.has(path.extname(file))) return;
  const source = fs.readFileSync(file, 'utf8');
  for (const match of source.matchAll(importPattern)) {
    const specifier = match[1];
    if (!specifier.startsWith('.')) continue;
    const resolved = path.resolve(path.dirname(file), specifier);
    if (!resolved.startsWith(`${runtimeRoot}${path.sep}`)) {
      violations.push(`${path.relative(root, file)} imports outside Runtime: ${specifier}`);
    }
  }
});

walk(path.join(root, 'workers', 'src'), (file) => {
  if (path.extname(file) !== '.ts') return;
  const source = fs.readFileSync(file, 'utf8');
  if (source.includes('app-runtime-management/') || source.includes('app-runtime-management\\')) {
    violations.push(`${path.relative(root, file)} imports Runtime source instead of the contracts package`);
  }
});

for (const forbidden of [
  'pages/app-runtime',
  'tools/stage-app-runtime-console.js',
  'app-runtime-management/agents',
  'app-runtime-management/installer',
]) {
  if (fs.existsSync(path.join(root, forbidden))) violations.push(`forbidden duplicate/staging path exists: ${forbidden}`);
}

if (violations.length) {
  console.error(violations.join('\n'));
  process.exit(1);
}
console.log('App Runtime boundaries: PASS');
