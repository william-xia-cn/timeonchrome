const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const ts = require('typescript');
const backendRequire = createRequire(path.resolve('app-runtime-management/backend/package.json'));
const { Miniflare, convertV4MiniflareOptions } = backendRequire('miniflare');
const loaded = { exports: {} };
new Function('exports', 'module', ts.transpileModule(
  fs.readFileSync('workers/src/services/compositePageEvidence.ts', 'utf8'),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } },
).outputText)(loaded.exports, loaded);
const { receivePageEvidence: receive, deleteReviewDetails: remove, hashEvidence: hash } = loaded.exports;

(async () => {
  const mf = new Miniflare(convertV4MiniflareOptions({ workers: [{ name: 'evidence-test', modules: true,
    script: 'export default {fetch(){return new Response("test")}}',
    compatibilityDate: '2026-09-01', d1Databases: ['DB'] }] }));
  let passed = 0;
  try {
    const db = await mf.getD1Database('DB');
    const schema = `CREATE TABLE profiles(id TEXT PRIMARY KEY,config TEXT);
      CREATE TABLE devices(id TEXT PRIMARY KEY,profile_id TEXT,status TEXT);
      INSERT INTO profiles VALUES ('p','{"compositeReviewConfig":{"enabled":true}}');
      INSERT INTO devices VALUES ('d','p','bound');
      ${fs.readFileSync('tests/fixtures/composite-page-evidence-schema.sql', 'utf8')}`;
    await db.batch(schema.replace(/--[^\n]*/g, '').split(';').map(s => s.trim()).filter(Boolean).map(s => db.prepare(s)));
    const now = 100_000;
    async function seed(id) {
      await db.prepare(`INSERT INTO composite_page_reviews_v1
        (id,profile_id,date,site,total_seconds,as_of,created_at) VALUES (?,'p',?,'example.test',1800,100000,100000)`)
        .bind(id,id).run();
      await db.prepare(`INSERT INTO composite_page_requests_v1
        (id,review_id,profile_id,device_id,manifest_id,cutoff,day_start,expected_seconds)
        VALUES (?,?,'p','d','m',100000,0,1800)`).bind(id,id).run();
      return { id,profile_id:'p',device_id:'d',manifest_id:'m',cutoff:100000 };
    }
    async function body(rows = [{id:'row'}], index = 0) {
      return { cutoff:100000,hash:await hash(rows),count:rows.length,chunks:Math.max(1,Math.ceil(rows.length/200)),
        complete:true,index,rows:rows.slice(index*200,(index+1)*200) };
    }
    const count = async id => (await db.prepare('SELECT COUNT(*) n FROM composite_page_chunks_v1 WHERE request_id=?').bind(id).first()).n;
    const request = id => db.prepare('SELECT * FROM composite_page_requests_v1 WHERE id=?').bind(id).first();
    async function check(name, fn) { await fn(); passed++; console.log(`PASS ${name}`); }
    await check('exact JSON hash compatibility', async () => {
      const {createHash} = require('node:crypto');
      const rows = [{id:'x',page:{title:'夹具',path:'/safe'}}];
      assert.equal(await hash(rows),createHash('sha256').update(JSON.stringify(rows)).digest('hex'));
    });
    await check('single chunk duplicate and conflicting retry', async () => {
      const q = await seed('duplicate'), b = await body();
      assert.equal((await receive(db,q,b,now)).ready,true);
      assert.equal((await receive(db,q,b,now)).ready,true);
      assert.deepEqual(await receive(db,q,{...b,rows:[{id:'changed'}]},now),{conflict:true});
      assert.deepEqual(await receive(db,q,{...b,complete:false},now),{conflict:true});
      assert.equal(await count(q.id),1);
      assert.equal((await request(q.id)).complete,1);
    });
    await check('out of order chunks finish only after whole hash verification', async () => {
      const q=await seed('multipart'), rows=Array.from({length:201},(_,i)=>({id:`row${i}`}));
      assert.equal((await receive(db,q,await body(rows,1),now)).ready,false);
      assert.equal((await receive(db,q,await body(rows,0),now)).ready,true);
      assert.equal(await count(q.id),2);
    });
    await check('metadata and chunk conflicts do not replace accepted data', async () => {
      const q=await seed('metadata'), rows=Array.from({length:201},(_,i)=>({id:`r${i}`}));
      const b=await body(rows);
      await receive(db,q,b,now);
      assert.deepEqual(await receive(db,q,{...await body(rows,1),complete:false},now),{conflict:true});
      assert.equal(await count(q.id),1);
      assert.equal((await request(q.id)).status,'pending');
    });
    await check('route-read then deletion cannot recreate evidence', async () => {
      const q=await seed('deleted'), b=await body();
      await remove(db,'p',q.id,99);
      assert.deepEqual(await receive(db,q,b,now),{conflict:true});
      assert.equal(await count(q.id),0);
      assert.equal((await request(q.id)).status,'deleted');
    });
    await check('delete during final hash cannot mark ready again', async () => {
      const q=await seed('inflight'), b=await body();
      const proxy={withSession(constraint){
        const session=db.withSession(constraint);
        return {prepare:sql=>session.prepare(sql),batch:async statements=>{
          const result=await session.batch(statements);
          await remove(db,'p',q.id,123);
          return result;
        }};
      }};
      assert.deepEqual(await receive(proxy,q,b,now),{conflict:true});
      assert.equal(await count(q.id),0);
      assert.equal((await request(q.id)).status,'deleted');
    });
    await check('deletion after ACK is durable and profile isolated', async () => {
      const q=await seed('afterack'), b=await body();
      await receive(db,q,b,now);
      await remove(db,'other',q.id,100);
      assert.equal(await count(q.id),1);
      await remove(db,'p',q.id,101);
      await remove(db,'p',q.id,102);
      assert.equal(await count(q.id),0);
      assert.equal((await db.prepare('SELECT details_deleted_at FROM composite_page_reviews_v1 WHERE id=?').bind(q.id).first()).details_deleted_at,101);
      assert.deepEqual(await receive(db,q,b,now),{conflict:true});
    });
    await check('legacy scan resetting request cannot bypass review tombstone', async () => {
      const q=await seed('scanreset'), b=await body();
      await remove(db,'p',q.id,123);
      await db.prepare("UPDATE composite_page_requests_v1 SET status='pending',evidence_hash=NULL WHERE id=?").bind(q.id).run();
      assert.deepEqual(await receive(db,q,b,now),{conflict:true});
      assert.equal(await count(q.id),0);
    });
    await check('strict opt in, unbound device, foreign profile fail closed', async () => {
      const q=await seed('authorization'), b=await body();
      for(const config of ['{}','{"compositeReviewConfig":{"enabled":false}}','{"compositeReviewConfig":{"enabled":1}}','bad JSON']) {
        await db.prepare('UPDATE profiles SET config=? WHERE id=\'p\'').bind(config).run();
        assert.deepEqual(await receive(db,q,b,now),{conflict:true});
      }
      await db.prepare('UPDATE profiles SET config=? WHERE id=\'p\'').bind('{"compositeReviewConfig":{"enabled":true}}').run();
      await db.prepare("UPDATE devices SET status='unbound'").run();
      assert.deepEqual(await receive(db,q,b,now),{conflict:true});
      await db.prepare("UPDATE devices SET status='bound'").run();
      assert.deepEqual(await receive(db,{...q,profile_id:'other'},b,now),{conflict:true});
      assert.equal(await count(q.id),0);
    });
    await check('stale manifest, cutoff and expired review rejected', async () => {
      const q=await seed('revision'), b=await body();
      await db.prepare("UPDATE composite_page_requests_v1 SET manifest_id='next' WHERE id=?").bind(q.id).run();
      assert.deepEqual(await receive(db,q,b,now),{conflict:true});
      assert.deepEqual(await receive(db,{...q,manifest_id:'next',cutoff:999}, {...b,cutoff:999},now),{conflict:true});
      assert.deepEqual(await receive(db,{...q,manifest_id:'next'},b,now+31*86400000),{conflict:true});
      assert.equal(await count(q.id),0);
    });
    await check('database interruption rolls metadata and chunk back', async () => {
      const q=await seed('abort'), b=await body();
      await db.prepare(`CREATE TRIGGER abort_evidence BEFORE INSERT ON composite_page_chunks_v1
        WHEN NEW.request_id='abort' BEGIN SELECT RAISE(ABORT,'test interruption'); END`).run();
      await assert.rejects(receive(db,q,b,now));
      assert.equal((await request(q.id)).evidence_hash,null);
      assert.equal(await count(q.id),0);
      await db.prepare('DROP TRIGGER abort_evidence').run();
      assert.equal((await receive(db,q,b,now)).ready,true);
    });
    await check('deletion transaction failure does not leave partial privacy state', async () => {
      const q=await seed('deleteabort');
      await receive(db,q,await body(),now);
      await db.prepare(`CREATE TRIGGER abort_delete BEFORE DELETE ON composite_page_chunks_v1
        WHEN OLD.request_id='deleteabort' BEGIN SELECT RAISE(ABORT,'test deletion interruption'); END`).run();
      await assert.rejects(remove(db,'p',q.id,100));
      assert.equal((await db.prepare('SELECT details_deleted_at FROM composite_page_reviews_v1 WHERE id=?').bind(q.id).first()).details_deleted_at,null);
      assert.equal(await count(q.id),1);
      await db.prepare('DROP TRIGGER abort_delete').run();
      await remove(db,'p',q.id,101);
      assert.equal(await count(q.id),0);
    });
    await check('empty, incomplete and duplicate row IDs remain distinct', async () => {
      const empty=await seed('empty');
      assert.equal((await receive(db,empty,await body([]),now)).ready,true);
      const incomplete=await seed('incomplete');
      assert.equal((await receive(db,incomplete,{...await body(),complete:false},now)).ready,true);
      assert.equal((await request(incomplete.id)).complete,0);
      const duplicate=await seed('duplicateids');
      assert.deepEqual(await receive(db,duplicate,await body([{id:'a'},{id:'a'}]),now),{conflict:true});
      assert.equal((await request(duplicate.id)).status,'pending');
    });
    await check('fixture schema matches original reviewed source and module is not registered', async () => {
      const normalized=fs.readFileSync('tests/fixtures/composite-page-evidence-schema.sql','utf8')
        .replace(/--[^\n]*/g,'').replace(/\s+/g,' ').trim();
      assert.equal(require('node:crypto').createHash('sha256').update(normalized).digest('hex'),
        '064607245f24a8eb0d65def1839656f474e3bea3a30dd379edf7cd227d1fb70d');
      const files=['workers/src/index.ts'];
      for(const file of files) assert.ok(!fs.readFileSync(file,'utf8').includes('compositePageEvidence'));
      assert.ok(!fs.existsSync('workers/migrations/032_composite_page_reviews.sql'));
    });
    console.log(`${passed}/${passed} composite evidence persistence checks passed`);
  } finally { await mf.dispose(); }
})().catch(error=>{console.error(error);process.exitCode=1;});
