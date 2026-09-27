const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const { createHmac } = require('node:crypto');
const backendRequire = createRequire(path.resolve('app-runtime-management/backend/package.json'));
const { build } = backendRequire('esbuild');
const { Miniflare, convertV4MiniflareOptions } = backendRequire('miniflare');

const migration = fs.readFileSync('workers/migrations/021_task_management_v1.sql', 'utf8');
const statements = sql => sql.replace(/--[^\n]*/g, '').split(';').map(s => s.trim()).filter(Boolean);
const normalize = sql => statements(sql).join(';').replace(/\s+/g, ' ').trim();
const secret = 'local-task-entry-test-not-production';
function token(account) {
  const head = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify({ account_id: account, exp: Math.floor(Date.now() / 1000) + 300 })).toString('base64url');
  return `${head}.${body}.${createHmac('sha256', secret).update(`${head}.${body}`).digest('base64url')}`;
}

(async () => {
  let passed = 0;
  const source = fs.readFileSync('workers/src/index.ts', 'utf8');
  const withoutTask = source.replace("import { taskModuleRouter } from './modules/task/router';", '')
    .replace(/\s*} else if \(taskModuleRouter\.matches\(path\)\) \{\s*return await taskModuleRouter\.handle\(request, env\);/, '');
  assert.notEqual(source, withoutTask);
  assert.doesNotMatch(withoutTask, /taskModuleRouter/);
  async function bundle(contents) {
    const result = await build({ stdin: { contents, resolveDir: path.resolve('workers/src'), sourcefile: 'index.ts', loader: 'ts' },
      bundle: true, format: 'esm', platform: 'browser', target: 'es2022', conditions: ['workerd', 'browser'], write: false });
    return result.outputFiles[0].text;
  }
  const mf = new Miniflare(convertV4MiniflareOptions({ workers: [
    { name: 'task-entry', modules: true, script: await bundle(source), compatibilityDate: '2024-09-01',
      d1Databases: { DB: 'entry-db' }, kvNamespaces: ['CONFIG_CACHE'], r2Buckets: ['SESSION_FILES'], bindings: { JWT_SECRET: secret } },
    { name: 'without-task', modules: true, script: await bundle(withoutTask), compatibilityDate: '2024-09-01',
      d1Databases: { DB: 'entry-db' }, kvNamespaces: ['CONFIG_CACHE'], r2Buckets: ['SESSION_FILES'], bindings: { JWT_SECRET: secret } },
  ] }));
  try {
    const db = await mf.getD1Database('DB', 'task-entry');
    const old = await mf.getWorker('without-task');
    const sql = `CREATE TABLE accounts(id TEXT PRIMARY KEY);
      CREATE TABLE profiles(id TEXT PRIMARY KEY,account_id TEXT,config TEXT);
      CREATE TABLE system_access_config_v1(id TEXT PRIMARY KEY,config_json TEXT);
      CREATE TABLE devices(id TEXT PRIMARY KEY,profile_id TEXT,status TEXT,device_token TEXT,device_name TEXT,last_seen INTEGER,unbound_at INTEGER);
      CREATE TABLE usage_segments_v1(id TEXT PRIMARY KEY,duration_sec INTEGER);
      INSERT INTO accounts VALUES ('owner'),('other');
      INSERT INTO profiles VALUES ('p','owner','{}'),('foreign','other','{}');
      INSERT INTO devices VALUES ('d','p','bound','fixture-device-token','fixture',0,NULL);
      INSERT INTO usage_segments_v1 VALUES ('untouched',17);`;
    await db.batch(statements(sql).map(s => db.prepare(s)));
    await db.batch(statements(fs.readFileSync('workers/migrations/017_device_access_audit_v1.sql','utf8')).map(s => db.prepare(s)));
    const apply = () => db.batch(statements(migration).map(s => db.prepare(s)));
    const call = (url, method = 'GET', bearer, body) => mf.dispatchFetch('https://test.invalid' + url, {
      method, headers: { ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}), 'Content-Type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    async function check(name, fn) { await fn(); passed++; console.log(`PASS ${name}`); }
    await check('restored final migration equals tested schema, capability migration has no SQL', async () => {
      assert.equal(normalize(migration), normalize(fs.readFileSync('tests/fixtures/task-management-schema.sql', 'utf8')));
      assert.deepEqual(statements(fs.readFileSync('workers/migrations/022_task_management_device_capability.sql', 'utf8')), []);
      assert.doesNotMatch(normalize(migration), /\b(ALTER|DROP|DELETE|UPDATE)\b/i);
      await apply();
    });
    await check('schema is additive and repeat preserves existing task facts', async () => {
      await db.prepare(`INSERT INTO tasks_v1(id,profile_id,name,normalized_name,planned_start_at,required_seconds,resource_spec_json,created_at,updated_at)
        VALUES ('existing','p','fixture','fixture',1,600,'{}',1,1)`).run();
      const before = await db.prepare('SELECT * FROM tasks_v1').all();
      await apply();
      assert.deepEqual((await db.prepare('SELECT * FROM tasks_v1').all()).results, before.results);
      assert.deepEqual((await db.prepare('SELECT * FROM usage_segments_v1').all()).results, [{ id: 'untouched', duration_sec: 17 }]);
      const schema = (await db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND tbl_name LIKE 'task%' AND sql IS NOT NULL").all()).results;
      assert.equal(schema.length, 7);
    });
    await check('real bundled entry rejects unauthenticated parent and device routes', async () => {
      for (const [url, method, body] of [
        ['/profiles/p/task-runtime/v1/tasks','GET'], ['/profiles/p/task-runtime/v1/tasks','POST',{}],
        ['/device/task-runtime/v1/tasks','GET'], ['/device/task-runtime/v1/progress','POST',{segments:[]}],
        ['/device/task-runtime/v1/heartbeat','POST',{}],
      ]) assert.equal((await call(url,method,undefined,body)).status,401,url);
      assert.equal((await call('/profiles/p/task-runtime/v1/tasks','GET',token('other'))).status,404);
    });
    await check('capability and creation work through actual Guardian dispatcher', async () => {
      const definition = { name:'entry fixture',plannedStartAt:Date.now()+3600000,requiredSeconds:600,resourceSpec:{hosts:['example.com']} };
      assert.equal((await call('/profiles/p/task-runtime/v1/tasks','POST',token('owner'),definition)).status,409);
      assert.equal((await call('/device/task-runtime/v1/tasks','GET','fixture-device-token')).status,200);
      const response = await call('/profiles/p/task-runtime/v1/tasks','POST',token('owner'),definition);
      assert.equal(response.status,201);
      const body = await response.json();
      assert.equal(body.task.name, definition.name);
      const action = { action:'pause',actionId:'entry-pause',expectedRevision:1 };
      const url = `/profiles/p/task-runtime/v1/tasks/${body.task.id}/actions`;
      assert.equal((await call(url,'POST',token('owner'),action)).status,200);
      assert.equal((await (await call(url,'POST',token('owner'),action)).json()).idempotent,true);
    });
    await check('progress and duplicate ACK reach persistent independent Task ledger', async () => {
      const segments=[{id:'entry-segment',taskId:'existing',taskRevision:1,startedAt:1000,endedAt:61000,seconds:60}];
      for(let i=0;i<2;i++) {
        const response=await call('/device/task-runtime/v1/progress','POST','fixture-device-token',{segments});
        assert.equal(response.status,200);
        assert.deepEqual((await response.json()).acceptedIds,['entry-segment']);
      }
      assert.equal((await db.prepare("SELECT completed_seconds FROM tasks_v1 WHERE id='existing'").first()).completed_seconds,60);
      assert.equal((await db.prepare('SELECT COUNT(*) n FROM task_progress_segments_v1').first()).n,1);
    });
    await check('non-Task HTTP behavior is identical with module removed', async () => {
      for(const url of ['/', '/profiles/p/stats', '/device/stats/v1', '/app-runtime/account-token']) {
        const method = url === '/app-runtime/account-token' ? 'POST' : 'GET';
        const current = await call(url,method);
        const baseline = await old.fetch('https://test.invalid'+url,{method});
        assert.equal(current.status,baseline.status,url);
        assert.equal(await current.text(),await baseline.text(),url);
      }
      const options = await call('/device/task-runtime/v1/progress','OPTIONS');
      assert.equal(options.status,200);
      assert.match(options.headers.get('Access-Control-Allow-Methods'),/POST/);
      assert.deepEqual((await db.prepare('SELECT * FROM usage_segments_v1').all()).results,[{id:'untouched',duration_sec:17}]);
    });
    console.log(`${passed}/${passed} actual Worker entry and migration checks passed`);
  } finally { await mf.dispose(); }
})().catch(error => { console.error(error); process.exitCode=1; });
