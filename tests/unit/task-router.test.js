const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const backendRequire = createRequire(path.resolve('app-runtime-management/backend/package.json'));
const { Miniflare, convertV4MiniflareOptions } = backendRequire('miniflare');
const cache = new Map();
function load(file) {
  file = path.resolve(file);
  if(cache.has(file)) return cache.get(file);
  const code=backendRequire('esbuild').buildSync({entryPoints:[file],bundle:true,format:'cjs',platform:'node',write:false}).outputFiles[0].text;
  const module={exports:{}};
  new Function('exports','require','module',code)(module.exports,require,module);
  cache.set(file,module.exports);return module.exports;
}

(async()=>{
  const mf=new Miniflare(convertV4MiniflareOptions({workers:[{name:'task-router',modules:true,
    script:'export default {fetch(){return new Response("test")}}',compatibilityDate:'2026-09-01',d1Databases:['DB']}]}));
  let passed=0;
  try {
    const db=await mf.getD1Database('DB');
    const sql=`CREATE TABLE accounts(id TEXT PRIMARY KEY);
      CREATE TABLE profiles(id TEXT PRIMARY KEY,account_id TEXT,config TEXT);
      CREATE TABLE system_access_config_v1(id TEXT PRIMARY KEY,config_json TEXT);
      CREATE TABLE devices(id TEXT PRIMARY KEY,profile_id TEXT,status TEXT,device_token TEXT,device_name TEXT,last_seen INTEGER);
      INSERT INTO accounts VALUES ('owner'),('other');
      INSERT INTO profiles VALUES ('p','owner','{}'),('foreign','other','{}');
      INSERT INTO devices VALUES ('d','p','bound','test-device','test',0),('other-d','foreign','bound','foreign-device','other',0);
      ${fs.readFileSync('tests/fixtures/task-management-schema.sql','utf8')}`;
    await db.batch(sql.replace(/--[^\n]*/g,'').split(';').map(s=>s.trim()).filter(Boolean).map(s=>db.prepare(s)));
    const env={DB:db,JWT_SECRET:'local-test-only-not-a-production-secret'};
    const {generateToken}=load('workers/src/db/middleware.ts');
    const {taskModuleRouter:router}=load('workers/src/modules/task/router.ts');
    const repo=load('workers/src/modules/task/repository.ts').createTaskRepository(env);
    const owner=await generateToken({account_id:'owner',exp:Math.floor(Date.now()/1000)+600},env.JWT_SECRET);
    const other=await generateToken({account_id:'other',exp:Math.floor(Date.now()/1000)+600},env.JWT_SECRET);
    const call=(url,method='GET',token=owner,body)=>router.handle(new Request('https://test.invalid'+url,{method,
      headers:token?{Authorization:`Bearer ${token}`,'Content-Type':'application/json'}:{},
      ...(body===undefined?{}:{body:typeof body==='string'?body:JSON.stringify(body)})}),env);
    const parent='/profiles/p/task-runtime/v1/tasks';
    const device='/device/task-runtime/v1/';
    const definition={name:'fixture task',plannedStartAt:Date.now()+3600000,requiredSeconds:600,resourceSpec:{hosts:['example.com']}};
    async function check(name,fn){await fn();passed++;console.log(`PASS ${name}`);}
    await check('real JWT missing invalid expired and foreign family fail closed',async()=>{
      assert.equal((await call(parent,'GET',null)).status,401);
      assert.equal((await call(parent,'GET',owner+'invalid')).status,401);
      const expired=await generateToken({account_id:'owner',exp:1},env.JWT_SECRET);
      assert.equal((await call(parent,'GET',expired)).status,401);
      assert.equal((await call(parent,'GET',other)).status,404);
      assert.equal((await call(device+'tasks','GET','invalid-device')).status,401);
    });
    await check('capability required and confirmed by real device pull',async()=>{
      assert.equal((await call(parent,'POST',owner,definition)).status,409);
      assert.equal((await call(device+'tasks','GET','test-device')).status,200);
      assert.equal((await (await call(parent)).json()).capabilitySummary.canCreateTasks,true);
    });
    let taskId;
    await check('blocked task resources rejected without Task or audit writes',async()=>{
      const before=await db.prepare('SELECT COUNT(*) n FROM tasks_v1').first();
      const audits=await db.prepare('SELECT COUNT(*) n FROM task_events_v1').first();
      const response=await call(parent,'POST',owner,{...definition,resourceSpec:{hosts:['tiktok.com']}});
      assert.equal(response.status,400);assert.equal((await response.json()).code,'TASK_RESOURCE_BLOCKED');
      assert.deepEqual(await db.prepare('SELECT COUNT(*) n FROM tasks_v1').first(),before);
      assert.deepEqual(await db.prepare('SELECT COUNT(*) n FROM task_events_v1').first(),audits);
    });
    await check('create and update use atomic repository with one audit per revision',async()=>{
      const created=await call(parent,'POST',owner,definition);assert.equal(created.status,201);
      taskId=(await created.json()).task.id;
      const edited=await call(parent+'/'+taskId,'PATCH',owner,{expectedRevision:1,name:'edited'});
      assert.equal(edited.status,200);assert.equal((await edited.json()).task.revision,2);
      assert.equal((await db.prepare('SELECT COUNT(*) n FROM task_events_v1 WHERE task_id=?').bind(taskId).first()).n,2);
      assert.equal((await call(parent+'/'+taskId,'PATCH',owner,{expectedRevision:2,requiredSeconds:'bad'})).status,400);
      const blocked=await call(parent+'/'+taskId,'PATCH',owner,{expectedRevision:2,resourceSpec:{hosts:['tiktok.com']}});
      assert.equal(blocked.status,400);assert.equal((await blocked.json()).code,'TASK_RESOURCE_BLOCKED');
      assert.equal((await repo.getTask('p',taskId)).revision,2);
      assert.equal((await db.prepare('SELECT COUNT(*) n FROM task_events_v1 WHERE task_id=?').bind(taskId).first()).n,2);
    });
    await check('HTTP action retry and changed-payload conflict',async()=>{
      const url=parent+'/'+taskId+'/actions'; const body={action:'pause',actionId:'one',expectedRevision:2};
      assert.equal((await call(url,'POST',owner,body)).status,200);
      assert.equal((await (await call(url,'POST',owner,body)).json()).idempotent,true);
      const conflict=await call(url,'POST',owner,{...body,action:'complete'});
      assert.equal(conflict.status,409);assert.equal((await conflict.json()).code,'ACTION_ID_CONFLICT');
      assert.equal((await call(url,'POST',other,body)).status,404);
    });
    await check('device progress cannot choose a foreign profile',async()=>{
      await repo.createTask({id:'foreign-task',profileId:'foreign',name:'foreign',plannedStartAt:1,requiredSeconds:600,resourceSpec:{hosts:['example.com']},createdByAccountId:'other',now:1});
      const response=await call(device+'progress','POST','test-device',{profileId:'foreign',segments:[{id:'foreign-s',taskId:'foreign-task',taskRevision:1,startedAt:1000,endedAt:61000,seconds:60}]});
      assert.deepEqual((await response.json()).acceptedIds,[]);
      assert.equal((await repo.getTask('foreign','foreign-task')).completedSeconds,0);
    });
    await check('malformed and oversized JSON are rejected without writes',async()=>{
      for(const body of ['{bad','null','[]']) assert.equal((await call(device+'heartbeat','POST','test-device',body)).status,400);
      assert.equal((await call(device+'heartbeat','POST','test-device',{junk:'x'.repeat(256*1024)})).status,413);
      assert.equal((await call(device+'heartbeat','POST','test-device',{taskVersion:'wrong'})).status,400);
      assert.equal((await call(device+'progress','POST','test-device',{segments:{}})).status,400);
    });
    await check('heartbeat stores bounded valid summary not arbitrary fields',async()=>{
      const response=await call(device+'heartbeat','POST','test-device',{taskVersion:3,activeSummary:{activeTaskIds:['one','one','x'.repeat(90)],activeTaskCount:999,secret:'must-not-persist',nextTaskAt:12345}});
      assert.equal(response.status,200);
      const state=await db.prepare("SELECT * FROM task_device_state_v1 WHERE device_id='d'").first();
      assert.deepEqual(JSON.parse(state.active_summary_json),{activeTaskIds:['one'],activeTaskCount:1,nextTaskAt:12345});
    });
    await check('rebound device cannot lend old profile capability or write stale state',async()=>{
      await db.prepare("UPDATE devices SET profile_id='foreign' WHERE id='d'").run();
      const summary=(await (await call('/profiles/foreign/task-runtime/v1/tasks','GET',other)).json()).capabilitySummary;
      assert.equal(summary.devices.find(d=>d.id==='d').taskManagementV1,false);
      assert.equal(await repo.recordDeviceState({profileId:'p',deviceId:'d'}),false);
      assert.equal((await call(device+'tasks','GET','test-device')).status,200);
      assert.equal((await db.prepare("SELECT profile_id FROM task_device_state_v1 WHERE device_id='d'").first()).profile_id,'foreign');
      await db.prepare("UPDATE devices SET status='unbound' WHERE id='d'").run();
      assert.equal((await call(device+'tasks','GET','test-device')).status,403);
    });
    await check('stale capability is not current readiness',async()=>{
      await db.prepare("UPDATE devices SET status='bound',last_seen=? WHERE id='d'").bind(Date.now()).run();
      await db.prepare("UPDATE task_device_state_v1 SET reported_at=1 WHERE device_id='d'").run();
      const summary=(await (await call('/profiles/foreign/task-runtime/v1/tasks','GET',other)).json()).capabilitySummary;
      assert.equal(summary.canCreateTasks,false);
    });
    console.log(`${passed}/${passed} Task router auth/local D1 checks passed`);
  }finally{await mf.dispose();}
})().catch(error=>{console.error(error);process.exitCode=1;});
