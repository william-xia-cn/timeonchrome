const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const {webcrypto} = require('node:crypto');
const {Miniflare,convertV4MiniflareOptions} = require('../../app-runtime-management/backend/node_modules/miniflare');
const root=path.resolve(__dirname,'../..');
const cache=new Map();
function load(file){
  if(cache.has(file))return cache.get(file);
  const module={exports:{}};
  const source=ts.transpileModule(fs.readFileSync(path.join(root,file),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  vm.runInNewContext(source,{module,exports:module.exports,crypto:webcrypto,TextEncoder,URL,Date,require:name=>{
    const next=path.posix.normalize(path.posix.join(path.posix.dirname(file),name));
    assert.ok(next.startsWith('contracts/'));return load(next);
  }});
  cache.set(file,module.exports);return module.exports;
}
(async()=>{
  const {readCompositeCorrections,projectCompositeDailyRows,compositeSnapshotGuard}=load('workers/src/services/compositePageCorrections.ts');
  const mf=new Miniflare(convertV4MiniflareOptions({workers:[{name:'corrections',modules:true,script:'export default {fetch(){return new Response("fixture")}}',compatibilityDate:'2026-05-29',d1Databases:{DB:'corrections'}}]}));
  try{
    const db=await mf.getD1Database('DB');
    await db.batch([
      db.prepare(`CREATE TABLE usage_segments_v1(id TEXT PRIMARY KEY,profile_id TEXT,device_id TEXT,date TEXT,domain TEXT,channel TEXT,start_ms INTEGER,end_ms INTEGER,duration_seconds INTEGER,mode TEXT,target_classification_at_time TEXT,quota_bucket_at_time TEXT,managed_target_id TEXT)`),
      db.prepare(`CREATE TABLE usage_segment_corrections_v1(id TEXT PRIMARY KEY,segment_id TEXT,profile_id TEXT,device_id TEXT,date TEXT,domain TEXT,channel TEXT,start_ms INTEGER,end_ms INTEGER,duration_seconds INTEGER,original_mode TEXT,original_target_classification TEXT,original_quota_bucket TEXT,effective_mode TEXT,effective_target_classification TEXT,effective_quota_bucket TEXT)`),
    ]);
    const date='2026-09-28',start=Date.parse(date+'T00:00:00+08:00'),end=start+1800000;
    await db.prepare('INSERT INTO usage_segments_v1 VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)')
      .bind('s','p','d',date,'example.test','active',start,end,1800,'composite','composite','composite','target').run();
    const ledger=JSON.stringify((await db.prepare('SELECT * FROM usage_segments_v1').all()).results);
    const baseline=await readCompositeCorrections(db,'p','d',date,end);assert.equal(baseline.items.length,0);
    await db.prepare('INSERT INTO usage_segment_corrections_v1 VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
      .bind('c','s','p','d',date,'example.test','active',start,end,1800,'composite','composite','composite','study','study','study').run();
    const corrected=await readCompositeCorrections(db,'p','d',date,end);
    await db.batch([
      db.prepare('CREATE TABLE profiles(id TEXT PRIMARY KEY,config TEXT)'),
      db.prepare('CREATE TABLE devices(id TEXT PRIMARY KEY,profile_id TEXT,status TEXT)'),
      db.prepare('CREATE TABLE device_account_heads_v2(profile_id TEXT,device_id TEXT,date TEXT,manifest_id TEXT)'),
      db.prepare('INSERT INTO profiles VALUES (?,?)').bind('p','{"compositeReviewConfig":{"enabled":true}}'),
      db.prepare('INSERT INTO devices VALUES (?,?,?)').bind('d','p','bound'),
      db.prepare('INSERT INTO device_account_heads_v2 VALUES (?,?,?,?)').bind('p','d',date,'m'),
    ]);
    const snapshot={profileId:'p',deviceId:'d',date,cutoff:end,manifestId:'m',corrections:corrected.items};
    const guard=async(items=[snapshot],allHeads=false)=>(await db.prepare('SELECT '+compositeSnapshotGuard('?1',allHeads)+' AS valid').bind(JSON.stringify(items)).first()).valid;
    assert.equal(await guard(),1);
    assert.equal(await guard([]),0);
    assert.throws(()=>compositeSnapshotGuard('?1 OR 1=1'),/INVALID_SNAPSHOT_BIND/);
    assert.equal(await guard([{...snapshot,corrections:[]}]),0);
    assert.equal(await guard([{...snapshot,corrections:[...corrected.items,...corrected.items]}]),0);
    assert.equal(await guard([{...snapshot,corrections:[{...corrected.items[0],effectiveClassification:'composite'}]}]),0);
    assert.equal(await guard([{...snapshot,corrections:[{...corrected.items[0],originalClassification:null}]}]),0);
    await db.prepare("UPDATE device_account_heads_v2 SET manifest_id='new'").run();
    assert.equal(await guard(),0);
    await db.prepare("UPDATE device_account_heads_v2 SET manifest_id='m'").run();
    await db.prepare('INSERT INTO device_account_heads_v2 VALUES (?,?,?,?)').bind('p','other',date,'other-m').run();
    assert.equal(await guard([snapshot],true),0);
    await db.prepare("DELETE FROM device_account_heads_v2 WHERE device_id='other'").run();
    assert.equal(await guard([snapshot],true),1);
    await db.prepare("UPDATE profiles SET config='{\"compositeReviewConfig\":{\"enabled\":1}}'").run();
    assert.equal(await guard(),0);
    await db.prepare('UPDATE profiles SET config=?').bind('{"compositeReviewConfig":{"enabled":true}}').run();
    await db.prepare("UPDATE devices SET status='unbound'").run();
    assert.equal(await guard(),0);
    await db.prepare("UPDATE devices SET status='bound'").run();
    assert.equal(corrected.items.length,1);assert.notEqual(corrected.revision,baseline.revision);
    assert.equal((await readCompositeCorrections(db,'foreign','d',date,end)).items.length,0);
    assert.equal((await readCompositeCorrections(db,'p','other',date,end)).items.length,0);
    assert.equal((await readCompositeCorrections(db,'p','d','2026-09-27',end)).items.length,0);
    assert.equal((await readCompositeCorrections(db,'p','d',date,end-1)).items.length,0);
    const account={deviceId:'d',date,generatedAt:end,rows:[{kind:'daily_target',channel:'active',targetKey:'target',mode:'composite',quotaBucket:'composite',targetClassificationAtTime:'composite',durationSeconds:2000}]};
    const before=JSON.stringify(account);
    const projected=projectCompositeDailyRows(account,corrected.items);
    assert.equal(projected.reduce((s,r)=>s+r.durationSeconds,0),2000);
    assert.equal(projected.find(r=>r.targetClassificationAtTime==='composite').durationSeconds,200);
    assert.equal(projected.find(r=>r.targetClassificationAtTime==='study').durationSeconds,1800);
    assert.equal(JSON.stringify(account),before);
    assert.equal(JSON.stringify(projectCompositeDailyRows(account,corrected.items)),JSON.stringify(projected));
    assert.throws(()=>projectCompositeDailyRows(account,[...corrected.items,...corrected.items]),/SCOPE_CONFLICT/);
    assert.throws(()=>projectCompositeDailyRows({...account,deviceId:'other'},corrected.items),/SCOPE_CONFLICT/);
    assert.throws(()=>projectCompositeDailyRows({...account,rows:[{...account.rows[0],durationSeconds:1799}]},corrected.items),/ACCOUNT_CONFLICT/);
    assert.throws(()=>projectCompositeDailyRows({...account,rows:[account.rows[0],account.rows[0]]},corrected.items),/ACCOUNT_CONFLICT/);
    // Same totals do not prove attribution: revised correction contents change revision.
    await db.prepare("UPDATE usage_segment_corrections_v1 SET effective_mode='rest',effective_target_classification='restricted',effective_quota_bucket='rest'").run();
    const changed=await readCompositeCorrections(db,'p','d',date,end);assert.notEqual(changed.revision,corrected.revision);
    assert.equal(await guard(),0);
    assert.equal(await guard([{...snapshot,corrections:changed.items}]),1);
    await db.prepare('UPDATE usage_segment_corrections_v1 SET duration_seconds=1799').run();
    await assert.rejects(readCompositeCorrections(db,'p','d',date,end),/EVIDENCE_CONFLICT/);
    await db.prepare('UPDATE usage_segment_corrections_v1 SET duration_seconds=1800,segment_id=?').bind('missing').run();
    await assert.rejects(readCompositeCorrections(db,'p','d',date,end),/EVIDENCE_CONFLICT/);
    assert.equal(JSON.stringify((await db.prepare('SELECT * FROM usage_segments_v1').all()).results),ledger);
    await db.prepare('DROP TABLE usage_segment_corrections_v1').run();
    await assert.rejects(readCompositeCorrections(db,'p','d',date,end));
    console.log('Composite correction projection PASS: exact scope, cutoff, revision, conservation, idempotence, conflicting/missing evidence fails closed; original ledger unchanged');
  }finally{await mf.dispose();}
})().catch(error=>{console.error(error);process.exitCode=1;});
