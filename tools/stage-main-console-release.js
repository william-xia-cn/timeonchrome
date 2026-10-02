// Release-only projection: Task remains in source but is not published this cycle.
const fs = require('node:fs');
const path = require('node:path');
const {stageRuntimeManagementComponent} = require('../app-runtime-management/console/stage-management-component.cjs');

function stageMainConsole(source, destination, options = {}) {
  source = fs.realpathSync(source);
  destination = path.resolve(destination);
  const relative = path.relative(source, destination);
  if (!relative || (!relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative))) {
    throw new Error('Output must be outside source');
  }
  if (fs.existsSync(destination)) throw new Error('Output already exists; refusing overwrite');
  const entries = JSON.parse(fs.readFileSync(path.join(source, 'optional-modules.json'), 'utf8'));
  if (!Array.isArray(entries)) throw new Error('Invalid module directory');
  fs.cpSync(source, destination, { recursive: true, filter(file) {
    if (fs.lstatSync(file).isSymbolicLink()) throw new Error('Symlinks are not publishable');
    const rel = path.relative(source, file).split(path.sep).join('/');
    return rel !== 'task' && !rel.startsWith('task/');
  }});
  const modules = entries.filter(entry => entry.id !== 'task-management-v1' && !/^\/task(?:\/|$|[?#])/.test(entry.href || ''));
  fs.writeFileSync(path.join(destination, 'optional-modules.json'), JSON.stringify(modules) + '\n');
  const redirects = fs.readFileSync(path.join(source, '_redirects'), 'utf8');
  fs.writeFileSync(path.join(destination, '_redirects'), '/task / 302\n/task/* / 302\n' + redirects);
  if (fs.existsSync(path.join(destination, 'task'))) throw new Error('Task assets leaked');
  stageRuntimeManagementComponent(options.runtimeSource || path.join(source, '..', 'app-runtime-management', 'console'), path.join(destination, 'runtime-management-component'));
  return destination;
}
if (require.main === module) {
  if (process.argv.length !== 4) throw new Error('Usage: node tools/stage-main-console-release.js <source> <new-output>');
  console.log(stageMainConsole(process.argv[2], process.argv[3]));
}
module.exports = { stageMainConsole };
