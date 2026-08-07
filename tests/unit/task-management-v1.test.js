const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const root = path.join(__dirname, '..', '..');
let passed = 0;
let failed = 0;
function check(name, condition) {
  if (condition) { passed += 1; console.log(`  ✓ ${name}`); }
  else { failed += 1; console.error(`  ✗ ${name}`); }
}
function read(relative) { return fs.readFileSync(path.join(root, relative), 'utf8'); }
function exists(relative) { return fs.existsSync(path.join(root, relative)); }

function loadWorkerTaskDomain() {
  const ts = require('typescript');
  const filename = path.join(root, 'workers/src/modules/task/domain.ts');
  const output = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    fileName: filename,
  }).outputText;
  const module = { exports: {} };
  new Function('exports', 'require', 'module', '__filename', '__dirname', output)(
    module.exports, require, module, filename, path.dirname(filename),
  );
  return module.exports;
}

async function runDomainChecks() {
  const domain = await import(pathToFileURL(path.join(root, 'extension/modules/task/domain.js')).href + `?t=${Date.now()}`);
  check('Task resources contain no access-management policyTypes', !('policyTypes' in domain.normalizeTaskResourceSpec({ hosts: ['khanacademy.org'] }).spec));
  check('explicit host resource is normalized', domain.normalizeTaskResourceSpec({ hosts: ['www.khanacademy.org'] }).spec.hosts[0] === 'khanacademy.org');
  check('resource set cannot be empty', !domain.normalizeTaskResourceSpec({}).ok);
  check('arbitrary URL keeps meaningful query parameters', domain.canonicalTaskUrl('https://example.com/practice?section=2&mode=sat').includes('mode=sat') && domain.canonicalTaskUrl('https://example.com/practice?section=2&mode=sat').includes('section=2'));
  check('YouTube playlist resolves inside Task module', domain.taskSpecialTargetsFromUrl('https://www.youtube.com/watch?v=abc&list=PL123')[0]?.type === 'playlist');
  check('YouTube video resolves inside Task module', domain.taskSpecialTargetsFromUrl('https://www.youtube.com/watch?v=abc')[0]?.type === 'video');
  check('YouTube channel resolves inside Task module', domain.taskSpecialTargetsFromUrl('https://www.youtube.com/@example')[0]?.type === 'channel');
  const context = domain.getTaskPolicyContext([{ id:'a', name:'SAT', plannedStartAt:1, requiredSeconds:600, completedSeconds:0, lifecycleStatus:'open', revision:1, resourceSpec:{ hosts:['collegeboard.org'] } }], { url:'https://www.collegeboard.org/' }, Date.now());
  check('matching Task resource allows continuation', context.required && context.allowed && context.progressTaskId === 'a');
  const blocked = domain.getTaskPolicyContext([{ id:'a', name:'SAT', plannedStartAt:1, requiredSeconds:600, completedSeconds:0, lifecycleStatus:'open', revision:1, resourceSpec:{ hosts:['collegeboard.org'] } }], { url:'https://example.com/' }, Date.now());
  check('non-Task resource is blocked by Task policy', blocked.required && !blocked.allowed && blocked.reason === 'task_required');
  check('host resource includes descendant subdomains', domain.matchTaskResources({ id:'host', resourceSpec:{ hosts:['example.com'] } }, { url:'https://child.example.com/path' }).matched);
  check('child host resource does not include siblings', !domain.matchTaskResources({ id:'host', resourceSpec:{ hosts:['child.example.com'] } }, { url:'https://other.example.com/path' }).matched);
  check('exact URL ignores hash tracking and trailing slash', domain.taskUrlRuleMatches({ url:'https://example.com/practice?section=2', match:'exact' }, 'http://www.example.com/practice/?utm_source=test&section=2#answer'));
  check('exact URL rejects additional business query', !domain.taskUrlRuleMatches({ url:'https://example.com/practice?section=2', match:'exact' }, 'https://example.com/practice?section=2&mode=sat'));
  check('path prefix accepts descendant path', domain.taskUrlRuleMatches({ url:'https://example.com/lesson', match:'path_prefix' }, 'https://example.com/lesson/part-1?attempt=2'));
  check('path prefix rejects similar path', !domain.taskUrlRuleMatches({ url:'https://example.com/lesson', match:'path_prefix' }, 'https://example.com/lesson2'));
}

async function runResourceProtocolChecks() {
  const extensionDomain = await import(pathToFileURL(path.join(root, 'extension/modules/task/domain.js')).href + `?fixture=${Date.now()}`);
  const workerDomain = loadWorkerTaskDomain();
  const fixture = JSON.parse(read('tests/fixtures/task-resource-canonical-v1.json'));
  for (const item of fixture.cases) {
    const extensionResult = extensionDomain.normalizeTaskResourceSpec(item.input);
    const workerResult = workerDomain.normalizeTaskResourceSpec(item.input);
    check(`extension canonical fixture: ${item.name}`, extensionResult.ok && JSON.stringify(extensionResult.spec) === JSON.stringify(item.expected));
    check(`Worker canonical fixture: ${item.name}`, workerResult.ok && JSON.stringify(workerResult.spec) === JSON.stringify(item.expected));
    check(`extension/Worker canonical parity: ${item.name}`, JSON.stringify(extensionResult) === JSON.stringify(workerResult));
  }
  const extensionInvalid = extensionDomain.normalizeTaskResourceSpec({ hosts:['ok.example.com','not a host'], urlRules:[{url:'bad url',match:'exact'}], specialTargets:['https://youtube.com/results?search_query=sat'] });
  const workerInvalid = workerDomain.normalizeTaskResourceSpec({ hosts:['ok.example.com','not a host'], urlRules:[{url:'bad url',match:'exact'}], specialTargets:['https://youtube.com/results?search_query=sat'] });
  check('invalid resources report field index and original value', extensionInvalid.errors.every((error)=>error.field && error.code && Number.isInteger(error.index) && error.value));
  check('Worker invalid resource details match extension', JSON.stringify(extensionInvalid.errors) === JSON.stringify(workerInvalid.errors));
}

async function runLedgerChecks() {
  const originalChrome = globalThis.chrome;
  const originalFetch = globalThis.fetch;
  const now = Date.now();
  const segments = {};
  for (let index = 0; index < 4098; index += 1) {
    const id = `pending-${index}`;
    segments[id] = { id, taskId: 'task-a', taskRevision: 1, startedAt: now + index * 1000, endedAt: now + (index + 1) * 1000, seconds: 1, createdAt: now + index };
  }
  segments.uploaded = { id: 'uploaded', taskId: 'task-a', taskRevision: 1, startedAt: now - 2000, endedAt: now - 1000, seconds: 1, uploadedAt: now };
  const store = {
    cloud_device_token: 'unit-test-device-token',
    task_management_v1_cache: {
      schemaVersion: 1,
      capability: 'taskManagementV1',
      taskVersion: 1,
      tasks: [{ id: 'task-a', name: 'Task A', lifecycleStatus: 'open', plannedStartAt: 1, requiredSeconds: 86400, completedSeconds: 5000, revision: 1, resourceSpec: { hosts: ['example.com'], urlRules: [], specialTargets: [] } }],
    },
    task_progress_segments_v1: segments,
  };
  globalThis.chrome = {
    storage: { local: {
      async get(keys) {
        const list = Array.isArray(keys) ? keys : [keys];
        return Object.fromEntries(list.filter((key) => key in store).map((key) => [key, store[key]]));
      },
      async set(values) { Object.assign(store, values); },
      async remove(keys) { for (const key of (Array.isArray(keys) ? keys : [keys])) delete store[key]; },
    } },
  };
  globalThis.fetch = async () => ({ ok: true, async json() { return { acceptedIds: Object.keys(store.task_progress_segments_v1).slice(0, 500) }; } });
  try {
    const ledger = await import(pathToFileURL(path.join(root, 'extension/modules/task/progress-ledger.js')).href + `?t=${Date.now()}`);
    await ledger.pruneTaskProgressLedger();
    check('Task progress pending ledger is capped at 4096', Object.keys(store.task_progress_segments_v1).length === 4096);
    check('overflow records Task-owned diagnostics', store.task_progress_diagnostics_v1?.droppedSegmentCount === 2 && store.task_progress_diagnostics_v1?.droppedSeconds === 2);
    check('dropped pending progress is subtracted conservatively', store.task_management_v1_cache.tasks[0].completedSeconds === 4998);
    const upload = await ledger.uploadPendingTaskProgress();
    check('Task progress uploads in batches of 500', upload.uploaded === 500 && upload.remaining === 3596);
    check('accepted Task progress is removed locally', Object.keys(store.task_progress_segments_v1).length === 3596);
  } finally {
    globalThis.chrome = originalChrome;
    globalThis.fetch = originalFetch;
  }
}
async function runProductionDebugGateChecks() {
  const originalChrome = globalThis.chrome;
  const originalFetch = globalThis.fetch;
  const store = {};
  const alarmNames = new Set();
  globalThis.chrome = {
    runtime: { id: 'task-test-extension', getURL: (value) => `chrome-extension://task-test-extension/${value}` },
    storage: { local: {
      async get(keys) { const list = Array.isArray(keys) ? keys : [keys]; return Object.fromEntries(list.filter((key) => key in store).map((key) => [key, store[key]])); },
      async set(values) { Object.assign(store, values); },
      async remove(keys) { for (const key of (Array.isArray(keys) ? keys : [keys])) delete store[key]; },
    } },
    alarms: { async clear(name) { alarmNames.delete(name); return true; }, create(name) { alarmNames.add(name); } },
  };
  try {
    globalThis.fetch = async () => ({ ok: false });
    const development = await import(pathToFileURL(path.join(root, 'extension/modules/task/build-profile.js')).href + `?dev=${Date.now()}`);
    check('unpacked development defaults Task local debug on', (await development.getTaskBuildProfile()).taskLocalDebugEnabled === true);
    globalThis.fetch = async () => ({ ok: true, async json() { return { mode:'managed', production:true, taskLocalDebugEnabled:false }; } });
    const production = await import(pathToFileURL(path.join(root, 'extension/modules/task/build-profile.js')).href + `?prod=${Date.now()}`);
    const productionProfile = await production.getTaskBuildProfile();
    check('production deployment profile disables Task local debug', productionProfile.production === true && productionProfile.taskLocalDebugEnabled === false);
    const taskModule = await import(pathToFileURL(path.join(root, 'extension/modules/task/index.js')).href + `?gate=${Date.now()}`);
    store.task_management_v1_cache = { reason:'local_admin_debug', taskVersion:3, tasks:[
      { id:'debug', debugOnly:true, name:'Debug', lifecycleStatus:'open', plannedStartAt:1, requiredSeconds:600, revision:1, resourceSpec:{hosts:['debug.example.com']} },
      { id:'formal', name:'Formal', lifecycleStatus:'open', plannedStartAt:1, requiredSeconds:600, revision:2, resourceSpec:{hosts:['formal.example.com']} },
    ] };
    const cleaned = await taskModule.purgeLocalDebugTasksForProduction();
    check('production cleanup removes only debug tasks', cleaned.removed === 1 && store.task_management_v1_cache.tasks.length === 1 && store.task_management_v1_cache.tasks[0].id === 'formal');
    store.task_management_v1_cache = { reason:'local_admin_debug', tasks:[{ id:'debug-only', debugOnly:true }] };
    await taskModule.purgeLocalDebugTasksForProduction();
    check('production cleanup removes all-debug cache', !store.task_management_v1_cache);
    const runtime = taskModule.createOptionalModule();
    const sender = { id:'task-test-extension', url:'chrome-extension://task-test-extension/modules/task/ui/admin.html' };
    const responses = [];
    for (const type of ['SET_LOCAL_DEBUG_TASK_CACHE','CLEAR_LOCAL_DEBUG_TASK_CACHE','CHECKPOINT_LOCAL_DEBUG_TASK']) responses.push((await runtime.handleMessage({ type }, sender)).response);
    check('production runtime rejects every local debug message', responses.every((response) => response?.code === 'LOCAL_DEBUG_DISABLED'));
  } finally { globalThis.chrome = originalChrome; globalThis.fetch = originalFetch; }
}
async function runOptionalHostChecks() {
  const host = await import(pathToFileURL(path.join(root, 'extension/runtime/optional-module-host.js')).href + `?t=${Date.now()}`);
  host.resetOptionalModulesForTest();
  check('empty optional-module host is a strict no-op', (await host.beforeAccess({ url:'https://example.com' })).handled === false);
  const failed = await host.activateOptionalModule({ id:'broken-module', async start(){ throw new Error('start failed'); } });
  check('failed module activation unregisters the module', failed.reason === 'module_activation_failed' && host.getOptionalModuleEntries().length === 0);
  await host.activateOptionalModule({ id:'test-module', entry:{label:'Test',href:'test.html'}, beforeAccess:()=>({handled:true,action:'redirect',redirectUrl:'test.html'}) });
  check('installed optional module participates through generic beforeAccess', (await host.beforeAccess({ url:'https://example.com' })).handled === true);
  check('generic host exposes module entry without domain knowledge', host.getOptionalModuleEntries()[0]?.id === 'test-module');
  host.resetOptionalModulesForTest();
}

function runBoundaryChecks() {
  const background = read('extension/background.js');
  const installRefs = background.match(/\.\/modules\/task\/install\.js/g) || [];
  check('background has exactly one Task module path: the static side-effect install switch', installRefs.length === 1 && background.includes("import './modules/task/install.js';"));
  check('background does not use runtime dynamic import for optional modules', !/installOptionalModule|import\(\s*['\"]\.\/modules\/task/.test(background));
  check('Task install file registers through the generic host', read('extension/modules/task/install.js').includes('activateOptionalModule(createOptionalModule())'));
  check('undefined special-site helper calls were repaired', /function getTabSpecialSiteTargets\(/.test(background) && /function rememberTabSpecialSiteContext\(/.test(background) && /function clearTabSpecialSiteContext\(/.test(background));

  const hostFiles = [
    'extension/product/mode-service.js','extension/infra/cloud-sync.js','extension/message-router.js',
    'extension/popup/popup.js','extension/popup/popup.html','extension/admin/admin.js','extension/admin/admin.html',
    'extension/reminder.js','extension/reminder.html','extension/runtime/session.js','extension/core/usage-segments.js',
  ];
  const forbidden = /task-management|task_required|GET_TASK|SET_LOCAL_DEBUG_TASK|task-runtime|modules\/task/i;
  check('extension host UI, access, sync and ledgers contain no Task semantics', hostFiles.every((file) => !forbidden.test(read(file))));
  check('main Admin uses generic optional-module inline mounting without Task messages', read('extension/admin/admin.js').includes('GET_OPTIONAL_MODULE_ENTRIES') && read('extension/admin/admin.js').includes('mountOptionalModulePanel') && !/GET_TASK|SET_LOCAL_DEBUG_TASK|task-runtime|modules\/task/i.test(read('extension/admin/admin.js')));
  check('main cloud console only links generic module directory', read('pages/index.html').includes('/modules/') && !/Task|任务管理|task-runtime/i.test(read('pages/index.html')));
  check('core ledgers contain no Task snapshot fields', !/matchedTaskIdsAtTime|progressTaskIdAtTime|taskRevisionAtTime/.test(read('extension/runtime/session.js') + read('extension/core/usage-segments.js')));
  const packTool = read('tools/self-hosted-crx-dry-run.js');
  check('formal self-hosted staging always disables Task local debug', packTool.includes("production: true, taskLocalDebugEnabled: false") && packTool.includes("production deployment profile must disable Task local debug"));
  check('Task local debug packaging requires an explicit development package', packTool.includes("--enable-task-local-debug requires --development-package"));
  const sourceProfile = JSON.parse(read('extension/deployment-profile.json'));
  check('unpacked source profile is explicitly development-only', sourceProfile.production === false && sourceProfile.taskLocalDebugEnabled === true);
}

function runWorkerChecks() {
  const workerIndex = read('workers/src/index.ts');
  const workerTask = read('workers/src/modules/task/router.ts') + read('workers/src/modules/task/repository.ts') + read('workers/src/modules/task/domain.ts');
  const nonTaskWorker = read('workers/src/routes/device.ts') + read('workers/src/routes/stats.ts');
  const migration = read('workers/migrations/021_task_management_v1.sql');
  const legacyCapability = read('workers/migrations/022_task_management_device_capability.sql');
  check('Worker host has one independent Task router registration', workerIndex.includes("./modules/task/router") && (workerIndex.match(/taskModuleRouter/g)||[]).length === 3);
  check('Task Worker does not import extension or access-management code', !/extension\/|siteAccess|usage_segments_v1|profiles\.config/i.test(workerTask));
  check('non-Task Worker routes contain no Task semantics', !/task_management|task-runtime|task_progress|tasks_v1/i.test(nonTaskWorker));
  check('Task migration owns definitions, events, progress and device state', ['tasks_v1','task_events_v1','task_progress_segments_v1','task_device_state_v1'].every((name)=>migration.includes(`CREATE TABLE IF NOT EXISTS ${name}`)));
  check('Task completion source is its own progress ledger', migration.includes("'task_progress'") && !migration.includes("'usage'"));
  check('legacy device capability migration has no executable ALTER or index', !/^\s*(ALTER TABLE|CREATE INDEX)/m.test(legacyCapability));
  check('Task repository unions progress intervals without core stats', workerTask.includes('mergeTaskProgressIntervals') && workerTask.includes('started_at, ended_at') && !workerTask.includes('FROM usage_segments_v1'));
  check('Task device API is namespaced independently', workerTask.includes('/device/task-runtime/v1/tasks') && workerTask.includes('/device/task-runtime/v1/progress'));
}

function runUiChecks() {
  check('local Task status/debug panel is exported by Task module for inline mounting', exists('extension/modules/task/ui/admin.html') && read('extension/modules/task/ui/admin.js').includes('export async function mountOptionalModulePanel') && read('extension/modules/task/ui/admin.js').includes('optionalModuleId'));
  const taskRuntime = read('extension/modules/task/index.js');
  check('debug checkpoint is limited to Task page and debug-only cache', taskRuntime.includes('CHECKPOINT_LOCAL_DEBUG_TASK') && taskRuntime.includes("cache?.reason !== 'local_admin_debug'") && taskRuntime.includes('task.debugOnly !== true') && taskRuntime.includes('isTaskPageSender(sender)'));
  check('Task module prunes its independent progress ledger on startup', taskRuntime.includes('await pruneTaskProgressLedger()'));
  check('Task required page is independent from Reminder', exists('extension/modules/task/ui/required.html') && !read('extension/modules/task/ui/required.js').includes('reminder'));
  check('cloud Task page is standalone', exists('pages/task/index.html') && read('pages/task/task.js').includes('/task-runtime/v1/tasks'));
  check('cloud Task page does not call access-management APIs', !/\/config|site-classification|used-unclassified/.test(read('pages/task/task.js')));
  check('local and cloud Task pages use structured resource editors', read('extension/modules/task/ui/admin.js').includes('resource-draft-list') && read('extension/modules/task/ui/admin.js').includes('url-match') && read('pages/task/index.html').includes('resource-draft-list') && read('pages/task/index.html').includes('url-match'));
  check('local debug form hydrates every canonical resource type', read('extension/modules/task/ui/admin.js').includes('hydrateDebugForm') && read('extension/modules/task/ui/admin.js').includes('urlRules') && read('extension/modules/task/ui/admin.js').includes('specialTargets'));
  check('Task cards display resources one row at a time', read('extension/modules/task/ui/admin.js').includes('resource-row') && read('pages/task/task.js').includes('resource-row'));
  check('local Task cards display planned start time', read('extension/modules/task/ui/admin.js').includes('displayDateTime(task.plannedStartAt)') && read('extension/modules/task/ui/admin.js').includes('计划开始') && read('extension/modules/task/ui/task.css').includes('task-meta-strip'));
  check('Task required resources are rendered as clickable destinations', read('extension/modules/task/ui/required.js').includes('resource-link') && read('extension/modules/task/ui/required.js').includes('href='));
  check('cloud Task resource editor auto detects YouTube URLs', read('pages/task/resource-editor.js').includes('taskSpecialTargetsFromUrl') && !read('pages/task/index.html').includes('video |'));
  check('generic extension module entry uses inline local UI with fallback href', read('extension/modules/task/index.js').includes("uiKind: 'inline'") && read('extension/modules/task/index.js').includes('inlineScript') && read('extension/modules/task/index.js').includes('modules/task/ui/admin.html') && JSON.parse(read('pages/optional-modules.json'))[0]?.href === '/task/');
}

(async()=>{
  await runDomainChecks();
  await runResourceProtocolChecks();
  await runLedgerChecks();
  await runProductionDebugGateChecks();
  await runOptionalHostChecks();
  runBoundaryChecks();
  runWorkerChecks();
  runUiChecks();
  const total=passed+failed;
  console.log(`\n[Task V1 independent module] ${passed}/${total} passed${failed?` — ${failed} FAILED`:''}`);
  if(failed)process.exit(1);
})().catch((error)=>{console.error(error);process.exit(1)});