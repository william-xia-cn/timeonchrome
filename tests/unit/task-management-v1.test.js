// task-management-v1.test.js
// Run with: node tests/unit/task-management-v1.test.js

'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

let passed = 0;
let failed = 0;

function check(desc, condition, detail = '') {
  if (condition) {
    passed++;
    console.log(`  ✓ ${desc}`);
  } else {
    failed++;
    console.error(`  ✗ ${desc}${detail ? ` (${detail})` : ''}`);
  }
}

function loadTaskManagementModule() {
  const source = fs.readFileSync(path.join(__dirname, '..', '..', 'extension', 'core', 'task-management.js'), 'utf8')
    .replace(/export\s+const\s+/g, 'const ')
    .replace(/export\s+function\s+/g, 'function ');
  const context = { URL, URLSearchParams, console, this: null };
  context.this = context;
  vm.runInNewContext(`${source}\nthis.__m = { TASK_MANAGEMENT_V1_CAPABILITY, validateTaskRequiredSeconds, normalizeTaskName, canonicalTaskHost, canonicalTaskUrl, normalizeTaskResourceSpec, deriveTaskRuntimeStatus, canEditTaskCoreFields, sortTasksForProgress, selectProgressTask, normalizeTaskRecord, getEnforcingTasks, getNextTaskAlarmTime, normalizeTaskPageContext, matchTaskResources, getTaskPolicyContext, validateTaskDefinition };`, context, { filename: 'task-management.js' });
  return context.__m;
}

function runPureFunctionChecks() {
  const mod = loadTaskManagementModule();
  check('capability marker is taskManagementV1', mod.TASK_MANAGEMENT_V1_CAPABILITY === 'taskManagementV1');
  check('required seconds accepts 60', mod.validateTaskRequiredSeconds(60).ok);
  check('required seconds rejects below 60', !mod.validateTaskRequiredSeconds(59).ok);
  check('required seconds rejects above 24 hours', !mod.validateTaskRequiredSeconds(86401).ok);
  check('task name normalization is stable', mod.normalizeTaskName('  SAT   Practice  ') === 'sat practice');
  check('canonical host folds www and m main aliases', mod.canonicalTaskHost('https://www.Example.com/path') === 'example.com' && mod.canonicalTaskHost('m.example.com') === 'example.com');
  check('canonical host keeps service subdomain', mod.canonicalTaskHost('docs.example.com') === 'docs.example.com');
  check('canonical URL removes hash and keeps only task query keys', mod.canonicalTaskUrl('http://www.youtube.com/watch?v=abc&list=pl&x=1#frag') === 'https://www.youtube.com/watch?v=abc&list=pl');

  const resource = mod.normalizeTaskResourceSpec({
    policyTypes: ['study', 'composite', 'rest'],
    hosts: ['www.khanacademy.org', 'm.example.com', 'bad host'],
    urls: ['youtube.com/watch?v=abc&feature=share'],
    specialTargets: [
      { platform: 'youtube', type: 'video', canonicalTarget: 'https://www.youtube.com/watch?v=abc&feature=share' },
      { platform: 'youtube', type: 'video', canonicalTarget: 'https://www.youtube.com/watch?v=abc&feature=share' },
    ],
  });
  check('resource spec reports invalid policy/host but keeps valid resources', !resource.ok && resource.errors.length >= 2);
  check('resource spec dedupes and sorts valid resource fields', resource.spec.policyTypes.join(',') === 'composite,study' && resource.spec.hosts.includes('khanacademy.org') && resource.spec.hosts.includes('example.com'));
  check('special targets are deduped', resource.spec.specialTargets.length === 1);

  const now = 1000;
  check('open future task derives scheduled', mod.deriveTaskRuntimeStatus({ lifecycleStatus: 'open', plannedStartAt: 2000 }, now) === 'scheduled');
  check('open started task derives enforcing', mod.deriveTaskRuntimeStatus({ lifecycleStatus: 'open', plannedStartAt: 500 }, now) === 'enforcing');
  check('paused remains paused', mod.deriveTaskRuntimeStatus({ lifecycleStatus: 'paused', plannedStartAt: 500 }, now) === 'paused');
  check('core fields editable only before start and progress', mod.canEditTaskCoreFields({ lifecycleStatus: 'open', plannedStartAt: 2000, completedSeconds: 0 }, now));
  check('core fields freeze after progress', !mod.canEditTaskCoreFields({ lifecycleStatus: 'open', plannedStartAt: 2000, completedSeconds: 1 }, now));

  const sorted = mod.sortTasksForProgress([
    { id: 'b', name: 'Zoo', plannedStartAt: 10 },
    { id: 'c', name: 'Alpha', plannedStartAt: 10 },
    { id: 'a', name: 'Later', plannedStartAt: 20 },
  ]);
  check('progress sorting uses planned start then normalized name then id', sorted.map(t => t.id).join(',') === 'c,b,a');
  check('selectProgressTask returns earliest matched unfinished task', mod.selectProgressTask(sorted, ['a', 'b']).id === 'b');

  const activeTasks = mod.getEnforcingTasks([
    { id: 'future', name: 'Future', plannedStartAt: 2000, requiredSeconds: 600, completedSeconds: 0, lifecycleStatus: 'open', resourceSpec: { policyTypes: ['study'] } },
    { id: 'done', name: 'Done', plannedStartAt: 500, requiredSeconds: 60, completedSeconds: 60, lifecycleStatus: 'open', resourceSpec: { policyTypes: ['study'] } },
    { id: 'now', name: 'Now', plannedStartAt: 500, requiredSeconds: 600, completedSeconds: 0, lifecycleStatus: 'open', resourceSpec: { hosts: ['www.collegeboard.org'] } },
  ], now);
  check('getEnforcingTasks returns only started unfinished open tasks', activeTasks.length === 1 && activeTasks[0].id === 'now');
  check('getNextTaskAlarmTime returns the nearest future open task start', mod.getNextTaskAlarmTime([
    { id: 'later', plannedStartAt: 3000, requiredSeconds: 60, completedSeconds: 0, lifecycleStatus: 'open', resourceSpec: { policyTypes: ['study'] } },
    { id: 'sooner', plannedStartAt: 2000, requiredSeconds: 60, completedSeconds: 0, lifecycleStatus: 'open', resourceSpec: { policyTypes: ['study'] } },
  ], now) === 2000);
  check('task page context folds main aliases and keeps policy type', mod.normalizeTaskPageContext({ url: 'https://www.example.com/path', classification: 'study' }).host === 'example.com');
  const taskMatch = mod.matchTaskResources({ id: 't1', plannedStartAt: 500, requiredSeconds: 600, resourceSpec: { policyTypes: ['study'], hosts: ['collegeboard.org'] } }, { host: 'www.collegeboard.org', classification: 'study' });
  check('matchTaskResources matches policy and host resources', taskMatch.matched && taskMatch.matches.length === 2);
  const taskContext = mod.getTaskPolicyContext([
    { id: 'b', name: 'Beta', plannedStartAt: 500, requiredSeconds: 600, completedSeconds: 0, lifecycleStatus: 'open', resourceSpec: { hosts: ['khanacademy.org'] } },
    { id: 'a', name: 'Alpha', plannedStartAt: 500, requiredSeconds: 600, completedSeconds: 0, lifecycleStatus: 'open', resourceSpec: { policyTypes: ['study'] } },
  ], { host: 'khanacademy.org', classification: 'study' }, now);
  check('task policy context allows matching resource and selects progress owner', taskContext.allowed && taskContext.progressTaskId === 'a' && taskContext.matchedTaskIds.length === 2);
  const blockedTaskContext = mod.getTaskPolicyContext([
    { id: 'task', name: 'Task', plannedStartAt: 500, requiredSeconds: 600, completedSeconds: 0, lifecycleStatus: 'open', resourceSpec: { hosts: ['collegeboard.org'] } },
  ], { host: 'news.example.com', classification: 'composite' }, now);
  check('task policy context blocks non-task resources while a task is active', blockedTaskContext.required && !blockedTaskContext.allowed && blockedTaskContext.reason === 'task_required');

  const valid = mod.validateTaskDefinition({
    name: 'SAT Practice',
    plannedStartAt: 2000,
    requiredSeconds: 3600,
    resourceSpec: { policyTypes: ['study'], hosts: ['collegeboard.org'] },
  }, now);
  check('validateTaskDefinition returns normalized approved shape', valid.ok && valid.task.normalizedName === 'sat practice' && valid.task.runtimeStatus === 'scheduled');
}

function runMigrationAndRepositoryChecks() {
  const migration = fs.readFileSync(path.join(__dirname, '..', '..', 'workers', 'migrations', '021_task_management_v1.sql'), 'utf8');
  const schema = fs.readFileSync(path.join(__dirname, '..', '..', 'workers', 'schema.sql'), 'utf8');
  const repository = fs.readFileSync(path.join(__dirname, '..', '..', 'workers', 'src', 'tasks', 'taskRepository.ts'), 'utf8');
  const taskRoutes = fs.readFileSync(path.join(__dirname, '..', '..', 'workers', 'src', 'routes', 'tasks.ts'), 'utf8');
  const deviceRoutes = fs.readFileSync(path.join(__dirname, '..', '..', 'workers', 'src', 'routes', 'device.ts'), 'utf8');
  const index = fs.readFileSync(path.join(__dirname, '..', '..', 'workers', 'src', 'index.ts'), 'utf8');
  const capabilityMigration = fs.readFileSync(path.join(__dirname, '..', '..', 'workers', 'migrations', '022_task_management_device_capability.sql'), 'utf8');
  const taskSync = fs.readFileSync(path.join(__dirname, '..', '..', 'extension', 'infra', 'task-sync.js'), 'utf8');
  const background = fs.readFileSync(path.join(__dirname, '..', '..', 'extension', 'background.js'), 'utf8');
  const cloudSync = fs.readFileSync(path.join(__dirname, '..', '..', 'extension', 'infra', 'cloud-sync.js'), 'utf8');
  const messageRouter = fs.readFileSync(path.join(__dirname, '..', '..', 'extension', 'message-router.js'), 'utf8');

  check('migration creates tasks_v1 table', /CREATE TABLE IF NOT EXISTS tasks_v1/.test(migration));
  check('migration creates task_events_v1 table', /CREATE TABLE IF NOT EXISTS task_events_v1/.test(migration));
  check('migration extends usage_segments_v1 with task snapshot fields', migration.includes('matched_task_ids_at_time') && migration.includes('progress_task_id_at_time') && migration.includes('task_revision_at_time'));
  check('tasks_v1 required_seconds has 1 minute to 24 hour check', migration.includes('required_seconds >= 60') && migration.includes('required_seconds <= 86400'));
  check('tasks_v1 lifecycle status is constrained', migration.includes("'open', 'paused', 'completed', 'cancelled'"));
  check('task_events_v1 stores source type and payload', migration.includes('source_type') && migration.includes('payload_json'));
  check('schema includes task tables for local base setup', schema.includes('CREATE TABLE IF NOT EXISTS tasks_v1') && schema.includes('CREATE TABLE IF NOT EXISTS task_events_v1'));

  check('repository exports createTaskRepository', repository.includes('export function createTaskRepository'));
  check('repository inserts tasks_v1 and task_events_v1', repository.includes('INSERT INTO tasks_v1') && repository.includes('INSERT OR IGNORE INTO task_events_v1'));
  check('repository uses expected revision for lifecycle updates', repository.includes('expectedRevision') && repository.includes('revision = ?'));
  check('repository keeps progress projection bounded by required seconds', repository.includes('MIN(required_seconds, ?)'));
  check('repository computes progress by interval union, not additive seconds', repository.includes('export function calculateUnionSeconds') && repository.includes('interval.startMs <= currentEnd') && repository.includes('Math.floor(totalMs / 1000)'));
  check('repository rebuilds task progress from accepted usage segments', repository.includes('rebuildTaskProgressProjectionFromSegments') && repository.includes('FROM usage_segments_v1') && repository.includes('progress_task_id_at_time = ?') && repository.includes('task_revision_at_time = ?'));
  check('repository writes usage completion event idempotently', repository.includes(':completed:usage:') && repository.includes("sourceType: 'system'") && repository.includes("sourceId: 'usage_segments_v1'"));
  check('repository imports shared task pure functions', repository.includes("../../../extension/core/task-management.js"));
  check('repository supports frozen core field updates', repository.includes('updateTaskCoreFields') && repository.includes('TASK_CORE_FIELDS_FROZEN'));
  check('repository allows resume through open lifecycle status', repository.includes("status === 'open' ? \"'paused'\""));

  check('task capability migration adds device capability columns', capabilityMigration.includes('task_management_v1_capable') && capabilityMigration.includes('task_capabilities_json'));
  check('task capability migration indexes profile capability lookup', capabilityMigration.includes('idx_devices_profile_task_capability'));
  check('task routes expose parent and device task endpoints', taskRoutes.includes('/device/tasks/v1') && taskRoutes.includes('/profiles\\/([^/]+)\\/tasks\\/v1'));
  check('task routes gate creation on taskManagementV1 capability', taskRoutes.includes('TASK_CAPABILITY_REQUIRED') && taskRoutes.includes('canCreateTasks'));
  check('task routes require expectedRevision for patch and actions', taskRoutes.includes('EXPECTED_REVISION_REQUIRED') && taskRoutes.includes('updateTaskCoreFields') && taskRoutes.includes('updateLifecycle'));
  check('task routes require action idempotency key', taskRoutes.includes('ACTION_ID_REQUIRED') && taskRoutes.includes('findTaskEvent'));
  check('device heartbeat records taskManagementV1 capability', deviceRoutes.includes('updateDeviceTaskCapability') && deviceRoutes.includes('TASK_MANAGEMENT_V1_CAPABILITY'));
  check('worker index routes profile and device task APIs', index.includes("./routes/tasks") && index.includes("/device/tasks/v1") && index.includes("/tasks(?:\\/|$)"));
  check('extension task sync pulls device task API and caches results', taskSync.includes("/device/tasks/v1") && taskSync.includes('TASK_CACHE_KEY') && taskSync.includes('normalizeTaskCachePayload'));
  check('extension task sync defines periodic pull and start alarms', taskSync.includes('TASK_PULL_ALARM') && taskSync.includes('TASK_START_ALARM') && taskSync.includes('scheduleNextTaskAlarm'));
  check('extension task sync defines completion boundary snapshot helpers', taskSync.includes('TASK_COMPLETION_ALARM') && taskSync.includes('resolveTaskSnapshotForPage') && taskSync.includes('scheduleTaskCompletionAlarmForSnapshot'));
  check('extension task sync builds heartbeat capability payload', taskSync.includes('buildTaskHeartbeatPayload') && taskSync.includes('capabilities') && taskSync.includes('taskActiveSummary'));
  check('background wires task pull alarms and startup cache pull', background.includes('TASK_PULL_ALARM') && background.includes('TASK_START_ALARM') && background.includes('bootstrap:') && background.includes('pullTaskCache'));
  check('background flushes session at task start and completion boundaries', background.includes('task_effective_boundary') && background.includes('task_completion_boundary') && background.includes('TASK_COMPLETION_ALARM'));
  check('cloud heartbeat accepts task payload body', cloudSync.includes('sendHeartbeat(afterRecoveredSync = null, heartbeatPayload = null)') && cloudSync.includes("cloudRequest('POST', '/device/heartbeat', heartbeatPayload || null)"));
  check('cloud bind triggers a non-blocking task cache pull', messageRouter.includes("pullTaskCache({ reason: 'cloud_bind' })") && messageRouter.includes('taskPull'));
}

runPureFunctionChecks();
runMigrationAndRepositoryChecks();

const total = passed + failed;
console.log(`\n[Task Management V1] ${passed}/${total} passed${failed ? ` — ${failed} FAILED` : ''}`);
if (failed > 0) process.exit(1);