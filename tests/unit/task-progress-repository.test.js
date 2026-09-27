const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const ts = require('typescript');
const backendRequire = createRequire(path.resolve('app-runtime-management/backend/package.json'));
const { Miniflare, convertV4MiniflareOptions } = backendRequire('miniflare');
const compiled = ts.transpileModule(fs.readFileSync('workers/src/modules/task/progress-repository.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const loaded = { exports: {} };
new Function('exports', 'module', compiled)(loaded.exports, loaded);
const { ingestTaskProgress: ingest, normalizeProgress } = loaded.exports;

(async () => {
  const mf = new Miniflare(convertV4MiniflareOptions({ workers: [{ name: 'task-test', modules: true,
    script: 'export default {fetch(){return new Response("test")}}',
    compatibilityDate: '2026-09-01', d1Databases: ['DB'] }] }));
  let passed = 0;
  try {
    const db = await mf.getD1Database('DB');
    const sql = `CREATE TABLE accounts(id TEXT PRIMARY KEY);
      CREATE TABLE profiles(id TEXT PRIMARY KEY);
      CREATE TABLE devices(id TEXT PRIMARY KEY, profile_id TEXT, status TEXT);
      INSERT INTO profiles VALUES ('p'),('other');
      INSERT INTO devices VALUES ('d','p','bound'),('d2','p','bound'),('foreign','other','bound'),('revoked','p','revoked');
      ${fs.readFileSync('tests/fixtures/task-management-schema.sql', 'utf8')}`;
    await db.batch(sql.replace(/--[^\n]*/g, '').split(';').map(s => s.trim()).filter(Boolean).map(s => db.prepare(s)));
    async function task(id, required = 3600) {
      await db.prepare(`INSERT INTO tasks_v1(id,profile_id,name,normalized_name,planned_start_at,required_seconds,
        resource_spec_json,created_at,updated_at) VALUES (?,'p',?,?,1,?,'{}',1,1)`).bind(id,id,id,required).run();
    }
    const segment = (taskId, id = taskId, start = 1000, end = 61000) =>
      ({ id, taskId, taskRevision: 1, startedAt: start, endedAt: end, seconds: Math.floor((end-start)/1000) });
    const total = id => db.prepare('SELECT * FROM tasks_v1 WHERE id=?').bind(id).first();
    async function check(name, fn) { await fn(); passed++; console.log(`PASS ${name}`); }
    await check('reject malformed intervals without truncation', async () => {
      assert.equal(normalizeProgress({...segment('x'), endedAt: 601000, seconds: 1}), null);
      assert.equal(normalizeProgress({...segment('x'), seconds: 1}), null);
      assert.equal(normalizeProgress({...segment('x'), startedAt: NaN}), null);
    });
    await check('durable duplicate ACK and payload conflict', async () => {
      await task('duplicate'); const s = segment('duplicate');
      assert.deepEqual((await ingest(db,'p','d',[s])).acceptedIds, [s.id]);
      assert.deepEqual((await ingest(db,'p','d',[s])).acceptedIds, [s.id]);
      assert.deepEqual((await ingest(db,'p','d',[{...s, endedAt:62000,seconds:61}])).acceptedIds, []);
      assert.equal((await total(s.taskId)).completed_seconds,60);
    });
    await check('profile device revision and lifecycle isolation', async () => {
      await task('isolation'); const s = segment('isolation');
      for (const [profile,device] of [['other','foreign'],['p','foreign'],['p','revoked']])
        assert.deepEqual((await ingest(db,profile,device,[s])).acceptedIds,[]);
      assert.deepEqual((await ingest(db,'p','d',[{...s,taskRevision:2}])).acceptedIds,[]);
      await db.prepare("UPDATE tasks_v1 SET lifecycle_status='paused' WHERE id='isolation'").run();
      assert.deepEqual((await ingest(db,'p','d',[s])).acceptedIds,[]);
      assert.equal((await total('isolation')).completed_seconds,0);
    });
    await check('completion and retry audit are idempotent', async () => {
      await task('complete',60); const s = segment('complete');
      await ingest(db,'p','d',[s]);
      assert.deepEqual((await ingest(db,'p','d',[s])).acceptedIds,[s.id]);
      const row = await total('complete'); assert.equal(row.lifecycle_status,'completed'); assert.equal(row.revision,2);
      assert.equal((await db.prepare("SELECT COUNT(*) n FROM task_events_v1 WHERE task_id='complete'").first()).n,1);
    });
    await check('real SQLite abort rolls back facts projection and audit', async () => {
      await task('rollback',60); const s = segment('rollback');
      await db.prepare(`CREATE TRIGGER abort_task_event BEFORE INSERT ON task_events_v1
        WHEN NEW.task_id='rollback' BEGIN SELECT RAISE(ABORT,'injected interruption'); END`).run();
      await assert.rejects(ingest(db,'p','d',[s]));
      assert.equal((await db.prepare("SELECT COUNT(*) n FROM task_progress_segments_v1 WHERE task_id='rollback'").first()).n,0);
      assert.equal((await total('rollback')).completed_seconds,0);
      await db.prepare('DROP TRIGGER abort_task_event').run();
      assert.deepEqual((await ingest(db,'p','d',[s])).acceptedIds,[s.id]);
    });
    await check('retry repairs old persisted fact without projection', async () => {
      await task('repair'); const s = segment('repair');
      await db.prepare(`INSERT INTO task_progress_segments_v1 VALUES (?,'repair','p','d',1,1000,61000,60,1)`).bind(s.id).run();
      assert.deepEqual((await ingest(db,'p','d',[s])).acceptedIds,[s.id]);
      assert.equal((await total('repair')).completed_seconds,60);
    });
    await check('nested overlaps union and millisecond floor', async () => {
      await task('union');
      await ingest(db,'p','d',[segment('union','u1',1000,91000),segment('union','u2',2000,3000),segment('union','u3',4001,94001)]);
      assert.equal((await total('union')).completed_seconds,93);
    });
    await check('concurrent device batches preserve union', async () => {
      await task('concurrent');
      await Promise.all([ingest(db,'p','d',[segment('concurrent','c1',1000,61000)]),
        ingest(db,'p','d2',[segment('concurrent','c2',31000,91000)])]);
      assert.equal((await total('concurrent')).completed_seconds,90);
    });
    await check('bounded batches ACK only committed IDs', async () => {
      await task('bounded');
      const items = Array.from({length:101},(_,i)=>segment('bounded',`b${i}`,1000+i*1000,2000+i*1000));
      assert.equal((await ingest(db,'p','d',items)).acceptedIds.length,100);
      assert.deepEqual((await ingest(db,'p','d',[items[100]])).acceptedIds,['b100']);
      assert.equal((await total('bounded')).completed_seconds,101);
    });
    await check('same request conflicting ID is never acknowledged', async () => {
      await task('conflict'); const s = segment('conflict');
      assert.deepEqual((await ingest(db,'p','d',[s,{...s,endedAt:62000,seconds:61}])).acceptedIds,[]);
      assert.equal((await total('conflict')).completed_seconds,0);
    });
    await check('paused retry confirms durable facts without reopening', async () => {
      await task('paused'); const s = segment('paused'); await ingest(db,'p','d',[s]);
      await db.prepare("UPDATE tasks_v1 SET lifecycle_status='paused',revision=2 WHERE id='paused'").run();
      assert.deepEqual((await ingest(db,'p','d',[s])).acceptedIds,[s.id]);
      assert.equal((await total('paused')).lifecycle_status,'paused');
      assert.deepEqual((await ingest(db,'p','d2',[s])).acceptedIds,[]);
    });
    console.log(`${passed}/${passed} local D1 checks passed`);
  } finally { await mf.dispose(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
