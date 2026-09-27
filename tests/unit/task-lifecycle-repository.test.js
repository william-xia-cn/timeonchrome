const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const ts = require('typescript');
const backendRequire = createRequire(path.resolve('app-runtime-management/backend/package.json'));
const { Miniflare, convertV4MiniflareOptions } = backendRequire('miniflare');
const modules = new Map();
function load(name) {
  if (modules.has(name)) return modules.get(name);
  const code = ts.transpileModule(fs.readFileSync(`workers/src/modules/task/${name}.ts`, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} };
  new Function('exports','require','module',code)(module.exports, p => load(p.replace('./','')), module);
  modules.set(name,module.exports); return module.exports;
}

(async () => {
  const mf = new Miniflare(convertV4MiniflareOptions({ workers: [{ name:'task-lifecycle',modules:true,
    script:'export default {fetch(){return new Response("test")}}',compatibilityDate:'2026-09-01',d1Databases:['DB'] }] }));
  let passed = 0;
  try {
    const db = await mf.getD1Database('DB');
    const sql = `CREATE TABLE accounts(id TEXT PRIMARY KEY);
      CREATE TABLE profiles(id TEXT PRIMARY KEY, account_id TEXT);
      CREATE TABLE devices(id TEXT PRIMARY KEY, profile_id TEXT, status TEXT);
      INSERT INTO accounts VALUES ('owner'),('other');
      INSERT INTO profiles VALUES ('p','owner'),('foreign','other');
      INSERT INTO devices VALUES ('d','p','bound');
      ${fs.readFileSync('tests/fixtures/task-management-schema.sql','utf8')}`;
    await db.batch(sql.replace(/--[^\n]*/g,'').split(';').map(s=>s.trim()).filter(Boolean).map(s=>db.prepare(s)));
    const repo = load('repository').createTaskRepository({DB:db});
    const create = (id, extra={}) => repo.createTask({id,profileId:'p',name:id,plannedStartAt:100000,
      requiredSeconds:600,resourceSpec:{hosts:['example.com']},createdByAccountId:'owner',now:1000,...extra});
    const action = (taskId, extra={}) => repo.applyLifecycleAction({taskId,profileId:'p',actorAccountId:'owner',
      action:'pause',actionId:'a',expectedRevision:1,now:2000,...extra});
    const row = id => repo.getTask('p',id);
    const events = id => db.prepare('SELECT * FROM task_events_v1 WHERE task_id=? ORDER BY task_revision').bind(id).all();
    const failEvents = id => db.prepare(`CREATE TRIGGER abort_audit BEFORE INSERT ON task_events_v1
      WHEN NEW.task_id='${id}' BEGIN SELECT RAISE(ABORT,'test audit failure'); END`).run();
    const recover = () => db.prepare('DROP TRIGGER abort_audit').run();
    async function check(name,fn) { await fn(); console.log(`PASS ${name}`); passed++; }
    await check('create audit failure rolls back task', async()=>{
      await failEvents('create-fail'); await assert.rejects(create('create-fail'));
      assert.equal(await row('create-fail'),null); await recover();
      assert.equal((await create('create-fail')).ok,true);
      assert.equal((await events('create-fail')).results.length,1);
    });
    await check('core edit and audit are atomic',async()=>{
      await create('edit'); await failEvents('edit');
      await assert.rejects(repo.updateTaskCoreFields('p','edit',{name:'changed',expectedRevision:1},2000,'owner'));
      assert.equal((await row('edit')).name,'edit'); assert.equal((await row('edit')).revision,1); await recover();
      assert.equal((await repo.updateTaskCoreFields('p','edit',{name:'changed',expectedRevision:1},2000,'owner')).ok,true);
      assert.equal((await row('edit')).revision,2);
      assert.equal((await events('edit')).results[1].source_id,'owner');
      assert.equal((await repo.updateTaskCoreFields('p','edit',{name:'stale',expectedRevision:1},2000,'owner')).ok,false);
      assert.equal((await events('edit')).results.length,2);
    });
    await check('editing after start remains frozen',async()=>{
      await create('frozen',{plannedStartAt:1000});
      assert.equal((await repo.updateTaskCoreFields('p','frozen',{name:'bad',expectedRevision:1},2000,'owner')).code,'TASK_CORE_FIELDS_FROZEN');
    });
    await check('lifecycle audit failure rolls back state and retry succeeds',async()=>{
      await create('action-fail'); await failEvents('action-fail'); await assert.rejects(action('action-fail'));
      assert.equal((await row('action-fail')).lifecycleStatus,'open'); assert.equal((await row('action-fail')).revision,1);
      await recover(); assert.equal((await action('action-fail')).ok,true);
      assert.equal((await row('action-fail')).revision,2);
    });
    await check('replayed action succeeds once and conflicts fail closed',async()=>{
      await create('replay'); assert.equal((await action('replay')).idempotent,false);
      assert.equal((await action('replay')).idempotent,true);
      for(const extra of [{action:'complete'},{expectedRevision:2},{note:'different'}])
        assert.equal((await action('replay',extra)).code,'ACTION_ID_CONFLICT');
      assert.equal((await row('replay')).revision,2); assert.equal((await events('replay')).results.length,2);
    });
    await check('family ownership protects both action and replay',async()=>{
      await create('ownership'); assert.equal((await action('ownership',{actorAccountId:'other'})).ok,false);
      assert.equal((await action('ownership',{profileId:'foreign',actorAccountId:'other'})).ok,false);
      await action('ownership'); assert.equal((await action('ownership',{actorAccountId:'other'})).ok,false);
      assert.equal((await row('ownership')).revision,2);
    });
    await check('concurrent same and different actions have one winner',async()=>{
      await create('same'); const same=await Promise.all([action('same'),action('same')]);
      assert.ok(same.every(x=>x.ok)); assert.equal(same.filter(x=>!x.idempotent).length,1);
      await create('race'); const race=await Promise.all([action('race'),action('race',{action:'cancel',actionId:'b'})]);
      assert.equal(race.filter(x=>x.ok).length,1); assert.equal((await row('race')).revision,2);
      assert.equal((await events('race')).results.length,2);
    });
    await check('terminal state cannot resume and manual completion retains real progress',async()=>{
      await create('complete'); await action('complete',{action:'complete'});
      const complete=await row('complete'); assert.equal(complete.completionSource,'parent'); assert.equal(complete.completedSeconds,0);
      assert.equal((await action('complete',{action:'resume',actionId:'b',expectedRevision:2})).ok,false);
      assert.equal((await action('complete',{action:'complete'})).idempotent,true);
      await create('cancel'); await action('cancel',{action:'cancel'});
      assert.equal((await action('cancel',{action:'resume',actionId:'b',expectedRevision:2})).ok,false);
    });
    await check('progress versus pause is serialized without unaudited state',async()=>{
      await create('progress-race',{plannedStartAt:1,requiredSeconds:60});
      await Promise.all([repo.ingestProgressSegments('p','d',[{id:'segment',taskId:'progress-race',taskRevision:1,startedAt:1000,endedAt:61000,seconds:60}],62000), action('progress-race',{now:62000})]);
      const state=await row('progress-race'); assert.equal(state.revision,2);
      assert.ok(['paused','completed'].includes(state.lifecycleStatus));
      assert.equal((await events('progress-race')).results.length,2);
      assert.equal(state.completedSeconds,state.lifecycleStatus==='paused'?0:60);
    });
    await check('invalid action IDs and revisions cannot mutate',async()=>{
      await create('invalid');
      for(const extra of [{action:'delete'},{actionId:'a'.repeat(129)},{actionId:' a'},{expectedRevision:1.5},{expectedRevision:'1'}])
        assert.equal((await action('invalid',extra)).ok,false);
      assert.equal((await row('invalid')).revision,1);
    });
    console.log(`${passed}/${passed} Task lifecycle local D1 checks passed`);
  } finally { await mf.dispose(); }
})().catch(error=>{console.error(error);process.exitCode=1;});
