const fs = require('fs');
const { execFileSync } = require('child_process');

const roles = new Set(['architecture-integration', 'standard-cloud', 'extension-local', 'task-local', 'santa-specialist', 'native-local', 'release']);
const governance = new Set([
  'AGENTS.md', 'PROJECT_WORKFLOW.md', 'PROJECT_MASTER.md', 'TASK_BOARD.md', 'DECISIONS.md',
  'tools/check-task-scope.js', 'tests/unit/task-scope.test.js',
  // This smoke test owns the generic module-directory entry contract affected by the main-nav integration.
  'tests/manual/task-v1-pages-ui-smoke.mjs',
  'tools/check-app-runtime-boundaries.js', 'tools/classify-app-runtime-ci-changes.js',
  'tests/unit/app-runtime-ci-routing.test.js',
]);
function normalize(file) {
  const p = file.replaceAll('\\', '/').replace(/^\.\//, '');
  if (!p || p.startsWith('/') || /^[A-Za-z]:/.test(p) || p.split('/').includes('..')) throw new Error('invalid relative path');
  return p;
}
function declaration(body) {
  const matches = [...body.matchAll(/^Task-Role:\s*([a-z-]+)\s*$/gm)];
  if (matches.length !== 1 || !roles.has(matches[0][1])) throw new Error('Exactly one valid Task-Role is required');
  const sourceLines = [...body.matchAll(/^Integration-Source:.*$/gm)].map(match => match[0]);
  const integrationSources = sourceLines.map(line => {
    const match = line.match(/^Integration-Source:\s*([a-f0-9]{40})\s*$/i);
    if (!match) throw new Error('Integration-Source must contain one full 40-character commit SHA');
    return match[1].toLowerCase();
  });
  if (integrationSources.length && matches[0][1] !== 'architecture-integration') {
    throw new Error('Integration-Source is only valid for architecture-integration');
  }
  if (new Set(integrationSources).size !== integrationSources.length) throw new Error('Duplicate Integration-Source is not allowed');
  const exceptions = {};
  for (const match of body.matchAll(/^Scope-Exception:\s*([^|\r\n]+)\|\s*([^\r\n]+)$/gm)) {
    const file = normalize(match[1].trim());
    if (/[*?]/.test(file) || !match[2].trim()) throw new Error('Exception requires exact file and reason');
    exceptions[file] = match[2].trim();
  }
  return { role: matches[0][1], exceptions, integrationSources };
}
function owner(file) {
  if (file.startsWith('extension/modules/task/') || file.startsWith('pages/task/')
    || file.startsWith('workers/src/modules/task/')
    || /^workers\/migrations\/\d+_task(?:_|\.)/.test(file)) return 'task-local';
  if (file.startsWith('native-app-control/') || file.startsWith('pages/native-apps/')
    || file === 'workers/src/services/nativeAppIdentityBridge.ts'
    || /^workers\/migrations\/\d+_native_app(?:_|\.)/.test(file)) return 'santa-specialist';
  if (/^(extension|dist)\//.test(file)) return 'extension-local';
  if (/^(agents|installer)\//.test(file) || /^app-runtime-management\/(agents|installer)\//.test(file)) return 'native-local';
  if (file.startsWith('contracts/') || file.startsWith('app-runtime-management/contracts/')) return 'architecture-integration';
  if (/^app-runtime-management\/(backend|console)\//.test(file)) return 'standard-cloud';
  if (/^(workers|pages)\//.test(file)) return 'standard-cloud';
  return null;
}
function checkScope(paths, { role, exceptions = {}, integrationSourcePaths = [] }) {
  if (!roles.has(role)) throw new Error('Unknown role');
  const verifiedSourcePaths = new Set(integrationSourcePaths.map(normalize));
  const failures = [];
  for (const raw of paths) {
    const file = normalize(raw);
    const actual = owner(file);
    // A task exception never transfers another module's implementation ownership.
    if (actual && actual !== role && !(role === 'architecture-integration' && verifiedSourcePaths.has(file))) {
      failures.push(file + ': belongs to ' + actual); continue;
    }
    const docs = /\.md$/.test(file);
    const allowed = actual === role
      || (role === 'architecture-integration' && verifiedSourcePaths.has(file))
      || (role === 'architecture-integration' && (governance.has(file) || file.startsWith('app-runtime-management/docs/') || file === 'app-runtime-management/README.md'))
      || (role === 'standard-cloud' && (file.startsWith('app-runtime-management/docs/') || file === 'app-runtime-management/README.md' || (docs && (file.startsWith('docs/') || ['TASK_BOARD.md', 'PROJECT_MASTER.md'].includes(file)))))
      || (role === 'extension-local' && (file.startsWith('tests/') || (docs && (file.startsWith('docs/') || ['TASK_BOARD.md', 'PROJECT_MASTER.md'].includes(file)))))
      || (role === 'task-local' && ((/^tests\/(unit|e2e)\/task[-/]/.test(file)) || (docs && (file.startsWith('docs/') || ['TASK_BOARD.md', 'PROJECT_MASTER.md'].includes(file)))))
      || (role === 'santa-specialist' && ((/^tests\/(unit|e2e)\/native-app[-/]/.test(file)) || (docs && (file.startsWith('docs/') || ['TASK_BOARD.md', 'PROJECT_MASTER.md'].includes(file)))))
      || (role === 'native-local' && (docs || file.startsWith('third_party/') || file === 'contracts.lock.json'))
      || (role === 'release' && (file.startsWith('docs/release/') || file.startsWith('app-runtime-management/docs/') || ['TASK_BOARD.md','PROJECT_MASTER.md'].includes(file)));
    if (!allowed && !exceptions[file]) failures.push(file + ': exact task exception with reason required');
  }
  return failures;
}
function relevant(paths) {
  return paths.some(p => owner(p) || (governance.has(p) && !p.endsWith('.md')) || p.startsWith('app-runtime-management/'));
}
function changed(base, head) {
  return execFileSync('git', ['diff', '--no-renames', '--name-only', '-z', base, head], { encoding: 'utf8' }).split('\0').filter(Boolean);
}
function mergeParents(output) {
  const parents = new Set();
  for (const line of output.split(/\r?\n/).filter(Boolean)) {
    const [merge, ...directParents] = line.trim().split(/\s+/);
    if (!/^[a-f0-9]{40}$/i.test(merge) || directParents.length < 2
      || directParents.some(sha => !/^[a-f0-9]{40}$/i.test(sha))) {
      throw new Error('Invalid merge history while validating integration sources');
    }
    for (const parent of directParents) parents.add(parent.toLowerCase());
  }
  return parents;
}
function assertIntegrationSources(sources, mergeHistory) {
  const directParents = mergeParents(mergeHistory);
  for (const source of sources) {
    if (!directParents.has(source.toLowerCase())) throw new Error('Integration-Source is not a direct parent of a merge commit in this PR: ' + source);
  }
}
function verifiedIntegrationPaths(base, head, sources) {
  if (!sources?.length) return [];
  const merges = execFileSync('git', ['rev-list', '--merges', '--parents', `${base}..${head}`], { encoding: 'utf8' });
  assertIntegrationSources(sources, merges);
  const paths = new Set();
  for (const source of sources) {
    for (const file of changed(base, source)) paths.add(file);
  }
  return [...paths];
}
if (require.main === module) {
  const args = process.argv.slice(2);
  const value = key => args[args.indexOf(key) + 1];
  let paths, config;
  if (args.includes('--github-event')) {
    const event = JSON.parse(fs.readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'));
    if (!event.pull_request) throw new Error('PR event required');
    paths = changed(event.pull_request.base.sha, event.pull_request.head.sha);
    if (!relevant(paths) && !/^Task-Role:/m.test(event.pull_request.body || '')) { console.log('Task scope: unrelated module, existing gates apply'); process.exit(0); }
    config = declaration(event.pull_request.body || '');
    config.integrationSourcePaths = verifiedIntegrationPaths(event.pull_request.base.sha, event.pull_request.head.sha, config.integrationSources);
  } else {
    if ((!args.includes('--base') && !args.includes('--staged')) || !args.includes('--declaration')) throw new Error('--base (or --staged) and --declaration are required');
    paths = args.includes('--staged')
      ? execFileSync('git', ['diff', '--cached', '--no-renames', '--name-only', '-z'], { encoding: 'utf8' }).split('\0').filter(Boolean)
      : changed(value('--base'), args.includes('--head') ? value('--head') : 'HEAD');
    config = declaration(fs.readFileSync(value('--declaration'), 'utf8'));
  }
  const failures = checkScope(paths, config);
  if (failures.length) { console.error(failures.join('\n')); process.exitCode = 1; }
  else console.log('Task scope: PASS (' + config.role + ')');
}
module.exports = { assertIntegrationSources, checkScope, declaration, mergeParents, relevant, verifiedIntegrationPaths };
