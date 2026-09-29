const fs = require('fs');
const { execFileSync } = require('child_process');

const roles = new Set(['runtime-cloud-contract', 'extension-local', 'task-local', 'santa-specialist', 'native-local', 'release']);
const governance = new Set([
  'AGENTS.md', 'PROJECT_WORKFLOW.md', 'PROJECT_MASTER.md', 'TASK_BOARD.md', 'DECISIONS.md',
  'tools/check-task-scope.js', 'tests/unit/task-scope.test.js',
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
  const exceptions = {};
  for (const match of body.matchAll(/^Scope-Exception:\s*([^|\r\n]+)\|\s*([^\r\n]+)$/gm)) {
    const file = normalize(match[1].trim());
    if (/[*?]/.test(file) || !match[2].trim()) throw new Error('Exception requires exact file and reason');
    exceptions[file] = match[2].trim();
  }
  return { role: matches[0][1], exceptions };
}
function owner(file) {
  if (file.startsWith('extension/modules/task/') || file.startsWith('pages/task/')
    || file.startsWith('workers/src/modules/task/')
    || /^workers\/migrations\/\d+_task(?:_|\.)/.test(file)) return 'task-local';
  if (file.startsWith('native-app-control/') || file.startsWith('pages/native-apps/')
    || file === 'workers/src/services/nativeAppIdentityBridge.ts') return 'santa-specialist';
  if (/^(extension|dist)\//.test(file)) return 'extension-local';
  if (/^(agents|installer)\//.test(file) || /^app-runtime-management\/(agents|installer)\//.test(file)) return 'native-local';
  if (/^app-runtime-management\/(contracts|backend|console)\//.test(file)) return 'runtime-cloud-contract';
  if (/^(workers|pages)\//.test(file)) return 'runtime-cloud-contract';
  return null;
}
function checkScope(paths, { role, exceptions = {} }) {
  if (!roles.has(role)) throw new Error('Unknown role');
  const failures = [];
  for (const raw of paths) {
    const file = normalize(raw);
    const actual = owner(file);
    // A task exception never transfers another module's implementation ownership.
    if (actual && actual !== role) { failures.push(file + ': belongs to ' + actual); continue; }
    const docs = /\.md$/.test(file);
    const allowed = actual === role
      || (role === 'runtime-cloud-contract' && (governance.has(file) || file.startsWith('app-runtime-management/docs/') || file === 'app-runtime-management/README.md'))
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
module.exports = { checkScope, declaration, relevant };
