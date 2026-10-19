'use strict';
// 全合成内存SQLite；执行真实Worker函数/SQL/事务，不连接生产或改真实账本。
const assert=require('node:assert/strict'),test=require('node:test'),fs=require('node:fs'),path=require('node:path'),ts=require('typescript');
const {DatabaseSync}=require('node:sqlite');
const root=path.resolve(__dirname,'../..'),date='2026-10-12';
function loadModules(){
  const cache=new Map();
  function load(file){
    if(cache.has(file))return cache.get(file).exports;
    const module={exports:{}};cache.set(file,module);
    const code=ts.transpileModule(fs.readFileSync(path.join(root,file),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
    const requireModule=name=>{
      if(name==='../db/middleware')return {json:(value,status=200)=>Response.json(value,{status}),verifyAccountToken:async()=>null};
      if(name==='../services/accountReconciliationV2')return {reconcileDeviceAccountV2:async()=>({status:'pending_raw'})};
      if(name==='../infra/storage-budget.js')return {runStorageMutation:async()=>{throw Error('storage forbidden');}};
      const target=path.posix.normalize(path.posix.join(path.posix.dirname(file),name));
      return load(/\.(ts|js)$/.test(target)?target:target+'.ts');
    };
    new Function('require','module','exports',code)(requireModule,module,module.exports);
    return module.exports;
  }
  return {publisher:load('workers/src/services/profileAccountsV2.ts'),snapshot:load('workers/src/services/profileAccountSnapshotsV2.ts'),
    identity:load('workers/src/routes/deviceIdentity.ts'),router:load('workers/src/routes/deviceAccountsV2.ts').deviceAccountsV2Router,
    account:load('extension/core/device-account-v2.js')};
}
const modules=loadModules();
function fixture(){
  const sql=new DatabaseSync(':memory:');
  sql.exec(`PRAGMA foreign_keys=ON;
    CREATE TABLE devices(id TEXT PRIMARY KEY,profile_id TEXT,device_token TEXT,device_name TEXT,status TEXT,last_seen INTEGER,monitoring_enabled INTEGER);
    CREATE TABLE usage_segments_v1(id TEXT PRIMARY KEY,managed_target_id TEXT,duration_seconds INTEGER);
    INSERT INTO usage_segments_v1 VALUES('raw-sentinel',NULL,123);
    INSERT INTO devices VALUES('a','child','token-a','测试电脑','bound',0,1),('b','child','token-b','测试来源','bound',0,1),('foreign','other-child','token-foreign','隔离来源','bound',0,1);`);
  for(const name of ['023_device_accounts_v2.sql','024_profile_accounts_v2.sql','026_profile_account_snapshots_v2.sql','027_device_account_capabilities_v2.sql','029_usage_accounting_corrections_v1.sql'])
    sql.exec(fs.readFileSync(path.join(root,'workers/migrations',name),'utf8'));
  const control={fail:null,beforeBatch:null};
  function statement(query,args=[]){return {bind(...values){return statement(query,values);},async first(column){
    if(control.fail?.(query,'first',args))throw Error('isolated read failure');
    const row=sql.prepare(query).get(...args);return column?row?.[column]??null:row??null;
  },async all(){
    if(control.fail?.(query,'all',args))throw Error('isolated read failure');
    return {results:sql.prepare(query).all(...args),success:true};
  },async run(){
    if(control.fail?.(query,'run',args))throw Error('isolated write failure');
    const result=sql.prepare(query).run(...args);return {success:true,meta:{changes:Number(result.changes)}};
  }};}
  const env={DB:{prepare:statement,async batch(statements){
    const hook=control.beforeBatch;control.beforeBatch=null;if(hook)await hook();
    sql.exec('BEGIN');try {const results=[];for(const statement of statements)results.push(await statement.run());sql.exec('COMMIT');return results;}
    catch(error){sql.exec('ROLLBACK');throw error;}
  }}};
  async function seed(device='a',revision=1,seconds=600,day=date,child=device==='foreign'?'other-child':'child'){
    const start=Date.parse(day+'T10:00:00+08:00'),common={channel:'active',mode:'rest',durationSeconds:seconds,segmentsCount:1,firstSeenAt:start,lastSeenAt:start+seconds*1000};
    const rows=[{...common,kind:'daily_domain',periodKey:day,domain:device+'.test'},
      {...common,kind:'hourly_domain',periodKey:day+'T10',domain:device+'.test'},
      {...common,kind:'daily_target',periodKey:day,targetKey:'domain:'+device+'.test',quotaBucket:'rest'},
      {...common,kind:'hourly_target',periodKey:day+'T10',targetKey:'domain:'+device+'.test',quotaBucket:'rest'}]
      .sort((a,b)=>modules.account.canonicalDeviceAccountJson(a).localeCompare(modules.account.canonicalDeviceAccountJson(b)));
    assert.equal(modules.account.validateDeviceAccountRows(rows,day).ok,true);
    const hash=await modules.account.hashDeviceAccountValue(rows),id=[device,day,revision].join('-');
    sql.prepare(`INSERT INTO device_account_manifests_v2(id,profile_id,device_id,date,revision,generated_at,row_count,chunk_count,
      raw_fact_count,raw_fact_hash,stats_hash,complete,loss_count,manifest_hash,status,created_at,updated_at,committed_at)
      VALUES(?,?,?,?,?,?,?,1,1,?, ?,1,0,?,'committed',?,?,?)`)
      .run(id,child,device,day,revision,start,rows.length,'a'.repeat(64),hash,'b'.repeat(64),start,start,start);
    sql.prepare('INSERT INTO device_account_chunks_v2 VALUES(?,0,?,?,?,?)').run(id,rows.length,hash,JSON.stringify(rows),start);
    return {id,child,device,day,revision,rows,hash};
  }
  const publish=row=>modules.publisher.publishCommittedDeviceAccountV2(env,row.id,row.child,row.device);
  async function dayTotal(day=date){const head=sql.prepare('SELECT generation_id FROM profile_account_day_heads_v2 WHERE profile_id=? AND date=?').get('child',day);
    return head?modules.publisher.readProfileDayAccountV2(env,head.generation_id):null;}
  async function week(){const head=sql.prepare('SELECT generation_id FROM profile_account_week_heads_v2 WHERE profile_id=? AND week_start=?').get('child',date);
    return head?modules.publisher.readProfileWeekAccountV2(env,head.generation_id):null;}
  const corrupt=row=>sql.prepare("UPDATE device_account_chunks_v2 SET chunk_hash=? WHERE manifest_id=?").run('0'.repeat(64),row.id);
  const snapshot=()=>modules.snapshot.createOrReuseProfileAccountSnapshotV2(env,'child',date);
  return {sql,env,control,seed,publish,dayTotal,week,corrupt,snapshot};
}
test('CF05 healthy sources persist, decreases replace, duplicates do not grow, raw rows stay unchanged',async()=>{
  const f=fixture();await f.publish(await f.seed());await f.publish(await f.seed('b',1,200));
  assert.equal((await f.dayTotal()).totalSeconds,800);assert.equal((await f.week()).profileTotal.totalSeconds,800);
  const lower=await f.seed('a',2,100);await f.publish(lower);await f.publish(lower);
  assert.equal((await f.dayTotal()).totalSeconds,300);assert.equal((await f.week()).profileTotal.totalSeconds,300);
  assert.equal(f.sql.prepare('SELECT SUM(duration_seconds) AS n FROM usage_segments_v1').get().n,123);
  f.sql.close();
});
test('CF05 bad peer keeps last valid published usage, never uses an unpublished higher revision',async()=>{
  const f=fixture(),a=await f.seed(),old=await f.seed('b',1,200);
  await f.publish(a);await f.publish(old);const bad=await f.seed('b',2,400);await f.publish(bad);f.corrupt(bad);
  await f.seed('b',3,900); // 已接收但未发布，禁止作为回退。
  await f.publish(await f.seed('a',2,700));
  const day=await f.dayTotal();assert.equal(day.totalSeconds,900);assert.equal(day.complete,false);assert.deepEqual(day.incompleteDevices,['b']);
  assert.equal(day.deviceVersionVector.find(row=>row.deviceId==='b').revision,1);
  assert.equal((await f.week()).profileTotal.totalSeconds,900);assert.equal((await f.week()).complete,false);
  const snap=await f.snapshot(),page=await modules.snapshot.readProfileAccountSnapshotPageV2(f.env,'child',snap.id,0);
  assert.equal(page.profileTotal.totalSeconds,900);assert.equal(page.deviceAccounts.find(row=>row.deviceId==='b').revision,1);
  assert.equal(page.completeness.complete,false);f.sql.close();
});
test('CF05 no valid fallback keeps healthy amount and marks missing, while bad candidate/scope still reject',async()=>{
  const f=fixture(),bad=await f.seed('b',1,400);await f.publish(bad);f.corrupt(bad);
  const good=await f.seed();await f.publish(good);
  assert.equal((await f.dayTotal()).totalSeconds,600);assert.equal((await f.dayTotal()).complete,false);
  const ownBad=await f.seed('a',2,700);f.corrupt(ownBad);await assert.rejects(f.publish(ownBad),/CHUNK_MISMATCH/);
  const foreign=await f.seed('foreign');
  f.sql.prepare('UPDATE device_account_heads_v2 SET manifest_id=? WHERE device_id=?').run(foreign.id,'b');
  await assert.rejects(f.publish(await f.seed('a',3,800)),/SOURCE_SCOPE_MISMATCH/);
  assert.equal((await f.dayTotal()).totalSeconds,600);f.sql.close();
});
test('CF05 broken old day falls back to a verified published day without blocking new day',async()=>{
  const f=fixture();await f.publish(await f.seed('a',1,100));await f.publish(await f.seed('a',2,200));
  const badHead=f.sql.prepare('SELECT generation_id FROM profile_account_day_heads_v2 WHERE date=?').get(date);
  f.sql.prepare('UPDATE profile_account_day_chunks_v2 SET chunk_hash=? WHERE generation_id=?').run('0'.repeat(64),badHead.generation_id);
  await f.publish(await f.seed('a',1,300,'2026-10-13'));
  const week=await f.week();assert.equal(week.profileTotal.totalSeconds,400);assert.equal(week.complete,false);
  const snap=await f.snapshot(),page=await modules.snapshot.readProfileAccountSnapshotPageV2(f.env,'child',snap.id,0);
  assert.equal(page.profileTotal.totalSeconds,400);assert.equal(page.deviceAccounts.find(row=>row.date===date).revision,1);
  f.sql.close();
});
test('CF05 unreadable old day with no history does not fabricate zero or block the valid new day',async()=>{
  const f=fixture();await f.publish(await f.seed('a',1,100));
  const head=f.sql.prepare('SELECT generation_id FROM profile_account_day_heads_v2 WHERE date=?').get(date);
  f.sql.prepare('UPDATE profile_account_day_chunks_v2 SET chunk_hash=? WHERE generation_id=?').run('0'.repeat(64),head.generation_id);
  await f.publish(await f.seed('a',1,300,'2026-10-13'));
  const week=await f.week();assert.equal(week.profileTotal.totalSeconds,300);assert.equal(week.complete,false);
  assert.deepEqual(week.dayVersionVector.map(row=>row.date),['2026-10-13']);f.sql.close();
});
test('CF05 failed publication batch rolls back all heads; a concurrent publication cannot overwrite a newer week',async()=>{
  const f=fixture();await f.publish(await f.seed());const first=JSON.stringify(await f.week()),next=await f.seed('a',2,700);
  f.control.fail=(sql,method)=>method==='run'&&sql.includes('INSERT INTO profile_account_day_heads_v2');
  await assert.rejects(f.publish(next),/write failure/);assert.equal(JSON.stringify(await f.week()),first);
  assert.equal(f.sql.prepare('SELECT revision FROM device_account_heads_v2 WHERE device_id=?').get('a').revision,1);
  f.control.fail=null;const peer=await f.seed('b',1,200);
  f.control.beforeBatch=()=>f.publish(peer);
  await assert.rejects(f.publish(next),/UNIQUE constraint/);assert.equal((await f.week()).profileTotal.totalSeconds,800);
  await f.publish(next);assert.equal((await f.week()).profileTotal.totalSeconds,900);
  assert.equal((await f.dayTotal()).totalSeconds,900);f.sql.close();
});
test('CF06 cleanup failure does not roll back usable new pages',async()=>{
  const f=fixture();await f.publish(await f.seed());
  f.control.fail=(sql,method)=>method==='run'&&sql.includes('DELETE FROM profile_account_read_');
  const snapshot=await f.snapshot(),page=await modules.snapshot.readProfileAccountSnapshotPageV2(f.env,'child',snapshot.id,0);
  assert.equal(page.profileTotal.totalSeconds,600);assert.equal(page.snapshotHash,snapshot.snapshot_hash);f.sql.close();
});
test('CF06 creation failure returns one verified unexpired old snapshot with original cutoff, no mixed pages',async()=>{
  const f=fixture();await f.publish(await f.seed());const old=await f.snapshot();await f.publish(await f.seed('a',2,700));
  f.control.fail=(sql,method)=>method==='run'&&sql.includes('INSERT INTO profile_account_read_snapshots_v2');
  const cached=await f.snapshot();assert.equal(cached.id,old.id);assert.equal(cached.as_of,old.as_of);assert.equal(cached.expires_at,old.expires_at);
  const page=await modules.snapshot.readProfileAccountSnapshotPageV2(f.env,'child',cached.id,0);
  assert.equal(page.profileTotal.totalSeconds,600);assert.equal(page.deviceAccounts[0].revision,1);
  assert.equal((await f.week()).profileTotal.totalSeconds,700);f.sql.close();
});
test('CF06 expired, corrupt, foreign, other-period or mismatched-correction snapshots never serve as fallback',async()=>{
  for(const change of ['expired','page','metadata','foreign','week','correction']){
    const f=fixture();await f.publish(await f.seed());const old=await f.snapshot();await f.publish(await f.seed('a',2,700));
    if(change==='expired')f.sql.prepare('UPDATE profile_account_read_snapshots_v2 SET expires_at=0 WHERE id=?').run(old.id);
    if(change==='page')f.sql.prepare('UPDATE profile_account_read_snapshot_pages_v2 SET page_hash=? WHERE snapshot_id=?').run('0'.repeat(64),old.id);
    if(change==='metadata')f.sql.prepare('UPDATE profile_account_read_snapshots_v2 SET snapshot_hash=? WHERE id=?').run('0'.repeat(64),old.id);
    if(change==='foreign')f.sql.prepare('UPDATE profile_account_read_snapshots_v2 SET profile_id=? WHERE id=?').run('other-child',old.id);
    if(change==='week')f.sql.prepare('UPDATE profile_account_read_snapshots_v2 SET week_start=? WHERE id=?').run('2026-10-05',old.id);
    if(change==='correction')f.sql.prepare('UPDATE profile_account_read_snapshots_v2 SET correction_version=1 WHERE id=?').run(old.id);
    f.control.fail=(sql,method)=>method==='run'&&sql.includes('INSERT INTO profile_account_read_snapshots_v2');
    await assert.rejects(f.snapshot(),/write failure/);f.sql.close();
  }
});
test('CF06 failed correction lookup cannot impersonate version zero; absent fallback remains failure',async()=>{
  const f=fixture();await f.publish(await f.seed());await f.snapshot();await f.publish(await f.seed('a',2,700));
  f.control.fail=(sql,method)=>method==='first'&&sql.includes('FROM usage_segment_corrections_v1');
  await assert.rejects(f.snapshot(),/read failure/);
  f.control.fail=(sql,method)=>method==='run'&&sql.includes('INSERT INTO profile_account_read_snapshots_v2');
  f.sql.prepare('DELETE FROM profile_account_read_snapshot_pages_v2').run();f.sql.prepare('DELETE FROM profile_account_read_snapshots_v2').run();
  await assert.rejects(f.snapshot(),/write failure/);f.sql.close();
});
test('CF06 all pages belong to the same frozen generation; a bad second page is not accepted for fallback',async()=>{
  const f=fixture();
  for(let i=0;i<51;i++)await f.publish(await f.seed('browser-'+i,1,1));
  const old=await f.snapshot();assert.equal(old.page_count,2);
  const pages=await Promise.all([0,1].map(index=>modules.snapshot.readProfileAccountSnapshotPageV2(f.env,'child',old.id,index)));
  assert.equal(pages[0].snapshotHash,pages[1].snapshotHash);assert.equal(pages[0].deviceAccounts.length+pages[1].deviceAccounts.length,51);
  await f.publish(await f.seed('browser-0',2,2));
  f.sql.prepare('UPDATE profile_account_read_snapshot_pages_v2 SET page_hash=? WHERE snapshot_id=? AND page_index=1').run('0'.repeat(64),old.id);
  f.control.fail=(sql,method)=>method==='run'&&sql.includes('INSERT INTO profile_account_read_snapshots_v2');
  await assert.rejects(f.snapshot(),/write failure/);f.sql.close();
});
test('CF07/08 real authenticated route survives auxiliary writes, but rejects invalid token/unbound/hash and main failure',async()=>{
  const f=fixture();await f.publish(await f.seed());
  f.control.fail=(sql,method)=>method==='run'&&(sql.includes('UPDATE devices SET last_seen')||sql.includes('INSERT INTO device_account_capabilities_v2'));
  const request=(token='token-a',suffix='snapshot?weekStart='+date,method='GET',body)=>new Request('https://fixture.invalid/device/accounts/v2/'+suffix,
    {method,headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
  const response=await modules.router.handle(request(),f.env);assert.equal(response.status,200);assert.equal((await response.json()).found,true);
  assert.equal((await modules.router.handle(request('invalid'),f.env)).status,401);
  f.sql.prepare("UPDATE devices SET status='unbound' WHERE id='a'").run();
  assert.equal((await modules.router.handle(request(),f.env)).status,403);
  f.sql.prepare("UPDATE devices SET status='bound' WHERE id='a'").run();
  const payload={schemaVersion:2,date,revision:2,generatedAt:1,rowCount:0,chunkCount:0,rawFactCount:0,rawFactHash:'a'.repeat(64),statsHash:'b'.repeat(64),complete:true,lossCount:0,manifestHash:'0'.repeat(64)};
  const badHash=await modules.router.handle(request('token-a','manifests','POST',payload),f.env);
  assert.equal(badHash.status,400);assert.equal((await badHash.json()).code,'DEVICE_ACCOUNT_MANIFEST_HASH_MISMATCH');
  f.control.fail=(sql,method)=>method==='first'&&sql.includes('FROM devices WHERE device_token');
  await assert.rejects(modules.router.handle(request(),f.env),/read failure/);
  f.control.fail=(sql,method)=>method==='run'&&sql.includes('INSERT INTO device_account_manifests_v2');
  payload.manifestHash=await modules.account.hashDeviceAccountValue(Object.fromEntries(Object.entries(payload).filter(([key])=>key!=='manifestHash')));
  assert.equal((await modules.router.handle(request('token-a','manifests','POST',payload),f.env)).status,500);
  const pending=await f.seed('a',3,700);
  f.sql.prepare("UPDATE device_account_manifests_v2 SET status='staging',committed_at=NULL WHERE id=?").run(pending.id);
  f.control.fail=(sql,method)=>method==='run'&&(sql.includes('INSERT INTO device_account_capabilities_v2')||sql.includes("SET status = 'committed'"));
  const failedCommit=await modules.router.handle(request('token-a','manifests/'+pending.id+'/commit','POST'),f.env);
  assert.equal(failedCommit.status,500);assert.notEqual((await failedCommit.json()).received,true);
  assert.equal(f.sql.prepare('SELECT status FROM device_account_manifests_v2 WHERE id=?').get(pending.id).status,'staging');
  assert.equal(f.sql.prepare('SELECT SUM(duration_seconds) AS n FROM usage_segments_v1').get().n,123);f.sql.close();
});
