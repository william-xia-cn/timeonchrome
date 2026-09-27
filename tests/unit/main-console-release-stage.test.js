const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { stageMainConsole } = require('../../tools/stage-main-console-release');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'toc-main-release-'));
const source = path.join(root, 'source'), out = path.join(root, 'out');
fs.mkdirSync(path.join(source, 'task'), {recursive:true});
fs.writeFileSync(path.join(source, 'task', 'index.html'), 'TASK-CREATE');
fs.writeFileSync(path.join(source, 'index.html'), 'CONSOLE');
fs.writeFileSync(path.join(source, '_redirects'), '/app-runtime/* /?launch=app-runtime 302\n');
fs.writeFileSync(path.join(source, 'optional-modules.json'), JSON.stringify([
  {id:'task-management-v1',href:'/task/'},{id:'alias',href:'/task/index.html'}, {id:'other',href:'/other/'}
]));
stageMainConsole(source, out);
assert.equal(fs.existsSync(path.join(out,'task')),false);
assert.deepEqual(JSON.parse(fs.readFileSync(path.join(out,'optional-modules.json'))),[{id:'other',href:'/other/'}]);
assert.equal(fs.readFileSync(path.join(out,'index.html'),'utf8'),'CONSOLE');
assert.match(fs.readFileSync(path.join(out,'_redirects'),'utf8'),/^\/task \/ 302\n\/task\/\* \/ 302\n\/app-runtime/);
assert.equal(fs.readFileSync(path.join(source,'task','index.html'),'utf8'),'TASK-CREATE');
assert.throws(()=>stageMainConsole(source,out),/already exists/);
assert.throws(()=>stageMainConsole(source,path.join(source,'nested')),/outside source/);
console.log('Main console release isolation PASS; fixture retained:',root);
