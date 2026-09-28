const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const { webcrypto } = require('node:crypto');
const { Miniflare } = require('../../app-runtime-management/backend/node_modules/miniflare');
const { convertV4MiniflareOptions } = require('../../app-runtime-management/backend/node_modules/miniflare');
const root = path.resolve(__dirname,'../..');
const modules = new Map(), manifests = {}, sent = [];
let emailEffect = async () => {};
let manifestRead = async id => manifests[id];
const overrides = {
  'workers/src/services/profileAccountsV2.ts': {readManifestAccountV2:async(_env,id)=>manifestRead(id)},
  'workers/src/services/notificationSettings.ts': {loadAccountNotificationSettings:async()=>({emailEnabled:true,telegramEnabled:true,telegramConnected:true,telegramChatId:'fixture'})},
  'workers/src/services/siteClassificationEmail.ts': {isEmailClassificationEnabled:()=>true,sendResendEmail:async(_env,input)=>{sent.push(input.text);await emailEffect();},sendTelegramMessage:async(_env,_chat,text)=>sent.push(text)},
  'workers/src/db/middleware.ts': {json:(body,status=200)=>new Response(JSON.stringify(body),{status}),verifyAccountToken:async r=>r.headers.get('Authorization')==='Bearer parent'?'a':null},
  'workers/src/routes/deviceIdentity.ts': {verifyDeviceTokenFromRequest:async r=>r.headers.get('Authorization')==='Bearer device'?{profileId:'p',deviceId:'d'}:null,deviceUnboundResponse:()=>new Response('{}',{status:410})},
};
function load(relative) {
  if(overrides[relative])return overrides[relative];
  if(modules.has(relative))return modules.get(relative);
  const module={exports:{}}; modules.set(relative,module.exports);
  const source=ts.transpileModule(fs.readFileSync(path.join(root,relative),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  vm.runInNewContext(source,{module,exports:module.exports,require:specifier=>{
    let resolved=path.posix.normalize(path.posix.join(path.posix.dirname(relative),specifier));
    if(!path.posix.extname(resolved))resolved+='.ts';
    if(!resolved.startsWith('workers/')&&!resolved.startsWith('contracts/'))throw new Error('Unexpected dependency');
    return load(resolved);
  },crypto:webcrypto,TextEncoder,TextDecoder,URL,Request,Response,Date,console},{filename:relative});
  return module.exports;
}
function interceptWrite(db,pattern,before) {
  let injected=false;
  return new Proxy(db,{get(target,key){
    if(key==='prepare')return sql=>{
      const statement=target.prepare(sql);
      if(!pattern.test(sql))return statement;
      return {bind(...values){const bound=statement.bind(...values);return {async run(){
        if(!injected){injected=true;await before();}
        return bound.run();
      }}}};
    };
    const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value;
  }});
}
(async()=>{
  const mf=new Miniflare(convertV4MiniflareOptions({workers:[{name:'composite-cloud-test',modules:true,script:'export default {fetch(){return new Response("fixture")}}',compatibilityDate:'2026-05-29',d1Databases:{DB:'composite-cloud-test'}}]}));
  try {
    const db=await mf.getD1Database('DB');
    const schema=`CREATE TABLE profiles(id TEXT PRIMARY KEY,account_id TEXT,config TEXT);
      CREATE TABLE accounts(id TEXT PRIMARY KEY,email TEXT);
      CREATE TABLE devices(id TEXT PRIMARY KEY,profile_id TEXT,status TEXT);
      CREATE TABLE device_account_heads_v2(profile_id TEXT,device_id TEXT,date TEXT,manifest_id TEXT);
      CREATE TABLE usage_segment_corrections_v1(profile_id TEXT,date TEXT,id TEXT,segment_id TEXT,device_id TEXT,domain TEXT,channel TEXT,start_ms INTEGER,end_ms INTEGER,duration_seconds INTEGER,original_mode TEXT,original_target_classification TEXT,original_quota_bucket TEXT,effective_mode TEXT,effective_target_classification TEXT,effective_quota_bucket TEXT);
      CREATE TABLE usage_segments_v1(id TEXT,profile_id TEXT,device_id TEXT,date TEXT,tab_id TEXT,window_id INTEGER,start_ms INTEGER,end_ms INTEGER,duration_seconds INTEGER,domain TEXT,channel TEXT,target_classification_at_time TEXT,managed_target_value TEXT,mode TEXT DEFAULT 'composite',quota_bucket_at_time TEXT DEFAULT 'composite',managed_target_id TEXT DEFAULT 'target');
      ${fs.readFileSync(path.join(root,'tests/fixtures/composite-page-evidence-schema.sql'),'utf8')}`;
    await db.batch(schema.replace(/--[^\n]*/g,'').split(';').map(s=>s.trim()).filter(Boolean).map(s=>db.prepare(s)));
    const service=load('workers/src/services/compositePageReviews.ts');
    const core=load('workers/src/services/compositePageAnalysis.js');
    const router=load('workers/src/routes/compositePageReviews.ts').compositePageReviewsRouter;
    const env={DB:db,JWT_SECRET:'fixture',RESEND_API_KEY:'fixture',TELEGRAM_BOT_TOKEN:'fixture'};
    const now=Date.now(),date=core.reviewDate(now),start=Date.parse(date+'T00:00:00+08:00');
    const cutoff=Math.min(now,start+3600000);
    await db.batch([
      db.prepare('INSERT INTO profiles VALUES (?,?,?)').bind('p','a','{}'),
      db.prepare('INSERT INTO accounts VALUES (?,?)').bind('a','parent@example.test'),
      db.prepare('INSERT INTO devices VALUES (?,?,?)').bind('d','p','bound'),
      db.prepare('INSERT INTO device_account_heads_v2 VALUES (?,?,?,?)').bind('p','d',date,'m'),
    ]);
    manifests.m={profileId:'p',deviceId:'d',manifestId:'m',date,generatedAt:cutoff,rows:[{kind:'daily_target',targetKey:'target',mode:'composite',quotaBucket:'composite',channel:'active',targetClassificationAtTime:'composite',managedTargetType:'domain',managedTargetValue:'example.test',isFallback:false,durationSeconds:1800}]};
    const count=async table=>(await db.prepare('SELECT COUNT(*) n FROM '+table).first()).n;
    await service.scanCompositeReviews(env,'p',now,date); assert.equal(await count('composite_page_reviews_v1'),0);
    await db.prepare('UPDATE profiles SET config=?').bind('{"compositeReviewConfig":{"enabled":true}}').run();
    await service.scanCompositeReviews(env,'p',now,date); await service.scanCompositeReviews(env,'p',now,date);
    assert.equal(await count('composite_page_reviews_v1'),1);
    const review=await db.prepare('SELECT * FROM composite_page_reviews_v1').first();
    const q=await db.prepare('SELECT * FROM composite_page_requests_v1').first();
    assert.equal(review.total_seconds,1800);
    const row={id:'e',profileId:'p',deviceId:'d',tabId:1,windowId:2,site:'example.test',startMs:start,endMs:cutoff,lastObservedAt:cutoff,page:{host:'example.test',path:'/lesson/public',title:'Public'}};
    const body={requestId:q.id,cutoff,index:0,count:1,chunks:1,hash:await core.hashPageEvidence([row]),complete:true,rows:[row]};
    const request=(route,method='GET',auth='parent',data)=>new Request('https://fixture.test'+route,{method,headers:auth?{Authorization:'Bearer '+auth}:{},body:data?JSON.stringify(data):undefined});
    assert.equal((await router.handle(request('/device/composite-reviews/v1','POST',null,body),env)).status,401);
    assert.equal((await router.handle(request('/device/composite-reviews/v1','POST','device',{...body,rows:[null]}),env)).status,400);
    assert.equal((await router.handle(request('/device/composite-reviews/v1','POST','device',body),env)).status,200);
    assert.equal((await router.handle(request('/device/composite-reviews/v1','POST','device',body),env)).status,200);
    assert.equal(await count('composite_page_chunks_v1'),1);
    await db.prepare('INSERT INTO usage_segments_v1(id,profile_id,device_id,date,tab_id,window_id,start_ms,end_ms,duration_seconds,domain,channel,target_classification_at_time,managed_target_value) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)').bind('s','p','d',date,'1',2,start,cutoff,1800,'example.test','active','composite','example.test').run();
    const before=JSON.stringify((await db.prepare('SELECT * FROM usage_segments_v1').all()).results);
    const detail=await service.reviewDetail(env,review); assert.equal(detail.complete,true); assert.equal(detail.rawSeconds,1800);
    await db.prepare('INSERT INTO usage_segment_corrections_v1 VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
      .bind('p',date,'correction','s','d','example.test','active',start,cutoff,1800,'composite','composite','composite','study','study','study').run();
    const corrected=await service.reviewDetail(env,review);
    assert.equal(corrected.complete,true); assert.equal(corrected.attributionBasis,'approved-week-corrections');
    assert.equal(corrected.rawSeconds,0); assert.equal(corrected.review.total_seconds,0); assert.equal(corrected.pages.length,0);
    assert.notEqual(corrected.correctionRevision,detail.correctionRevision);
    // A queued pre-correction notification cannot send even before the next scan.
    await service.processCompositeNotifications(env,now);assert.equal(sent.length,0);
    await service.scanCompositeReviews(env,'p',now,date);
    assert.equal((await db.prepare('SELECT total_seconds FROM composite_page_reviews_v1').first()).total_seconds,0);
    await service.processCompositeNotifications(env,now);assert.equal(sent.length,0);
    await db.prepare('DELETE FROM usage_segment_corrections_v1').run();
    await service.scanCompositeReviews(env,'p',now,date);
    const base='/profiles/p/composite-reviews/v1/'+review.id;
    const listRoute='/profiles/p/composite-reviews/v1';
    const list=await router.handle(request(listRoute),env);
    assert.equal(list.status,200);
    assert.equal((await list.json()).usage[0].weekSeconds,1800);
    const enabledConfig='{"compositeReviewConfig":{"enabled":true}}';
    const disabledConfig='{"compositeReviewConfig":{"enabled":false}}';
    for (const config of ['{}',disabledConfig]) {
      await db.prepare('UPDATE profiles SET config=?').bind(config).run();
      const disabledList=await router.handle(request(listRoute),env);
      assert.equal(disabledList.status,200);
      const disabledData=await disabledList.json();
      assert.equal(disabledData.enabled,false);
      assert.equal(disabledData.usage[0].weekSeconds,1800);
      assert.equal((await router.handle(request('/device/composite-reviews/v1','POST','device',body),env)).status,403);
      assert.equal((await router.handle(request(listRoute.replace('/p/','/foreign/')),env)).status,404);
      assert.equal(JSON.stringify((await db.prepare('SELECT * FROM usage_segments_v1').all()).results),before);
    }
    manifestRead=async id=>{await db.prepare('UPDATE profiles SET config=?').bind(enabledConfig).run();return manifests[id];};
    assert.equal((await router.handle(request(listRoute),env)).status,503); // Config changed during read.
    await db.prepare('UPDATE profiles SET config=?').bind(disabledConfig).run();
    manifestRead=async id=>{await db.prepare("UPDATE device_account_heads_v2 SET manifest_id='changed'").run();return manifests[id];};
    assert.equal((await router.handle(request(listRoute),env)).status,503);
    await db.prepare("UPDATE device_account_heads_v2 SET manifest_id='m'").run();
    manifestRead=async id=>manifests[id];
    await db.prepare('UPDATE profiles SET config=?').bind(enabledConfig).run();
    const validManifest=manifests.m;
    let reads=0;
    manifestRead=async id=>++reads===1?manifests[id]:null;
    assert.equal((await router.handle(request(listRoute),env)).status,503);
    assert.equal(reads,2); // Scan succeeded; the subsequent list read must not skip a missing account.
    manifestRead=async id=>manifests[id];
    delete manifests.m;
    assert.equal((await router.handle(request(listRoute),env)).status,503);
    manifests.m={...validManifest,date:'2020-01-01'};
    assert.equal((await router.handle(request(listRoute),env)).status,503);
    manifests.m=validManifest;
    assert.equal((await router.handle(request(base.replace('/p/','/foreign/')),env)).status,404);
    const response=await router.handle(request(base),env); assert.equal(response.status,200);
    const publicDetail=await response.json();
    assert.equal('requestVersions' in publicDetail,false);
    assert.equal('attributionSnapshots' in publicDetail,false);
    const opinion={pageKey:detail.pages[0].pageKey,verdict:'study',reason:'fixture review'};
    const saved=await router.handle(request(base+'/opinion','POST','parent',opinion),env);
    assert.equal(saved.status,200); assert.equal((await saved.json()).completed,true);
    await service.processCompositeNotifications(env); await service.processCompositeNotifications(env);
    assert.equal(sent.length,2); assert.ok(sent.every(s=>!s.includes('/lesson/')&&!s.includes('Public')));
    // Unknown delivery result may duplicate, but retries and sending leases are bounded.
    await db.prepare("UPDATE composite_review_notifications_v1 SET status='pending',attempts=0,next_attempt_at=0 WHERE channel='email'").run();
    emailEffect=async()=>{throw new Error('fixture ACK lost after delivery');};
    await service.processCompositeNotifications(env,now);
    assert.equal(sent.length,3);
    await service.processCompositeNotifications(env,now+59999); assert.equal(sent.length,3);
    emailEffect=async()=>{};
    await service.processCompositeNotifications(env,now+60000); assert.equal(sent.length,4);
    assert.equal((await db.prepare("SELECT attempts FROM composite_review_notifications_v1 WHERE channel='email'").first()).attempts,2);
    await db.prepare("UPDATE composite_review_notifications_v1 SET status='sending',attempts=1,next_attempt_at=? WHERE channel='email'").bind(now+300000).run();
    await service.processCompositeNotifications(env,now+299999); assert.equal(sent.length,4);
    await service.processCompositeNotifications(env,now+300000); assert.equal(sent.length,5);
    // A stale provider completion must not overwrite a newer claimed attempt.
    await db.prepare("UPDATE composite_review_notifications_v1 SET status='pending',attempts=0,next_attempt_at=0 WHERE channel='email'").run();
    emailEffect=async()=>{await db.prepare("UPDATE composite_review_notifications_v1 SET status='sending',attempts=2 WHERE channel='email'").run();};
    await service.processCompositeNotifications(env,now); assert.equal(sent.length,6);
    assert.equal((await db.prepare("SELECT status FROM composite_review_notifications_v1 WHERE channel='email'").first()).status,'sending');
    emailEffect=async()=>{};
    await db.prepare("UPDATE composite_review_notifications_v1 SET attempts=5,next_attempt_at=0 WHERE channel='email'").run();
    await service.processCompositeNotifications(env,now+600000); assert.equal(sent.length,6);
    await db.prepare("UPDATE composite_review_notifications_v1 SET attempts=1 WHERE channel='email'").run();
    await db.prepare("UPDATE profiles SET config='{}'").run();
    await service.processCompositeNotifications(env,now+600000); assert.equal(sent.length,6);
    await db.prepare('UPDATE profiles SET config=?').bind('{"compositeReviewConfig":{"enabled":true}}').run();
    const addCorrection=()=>db.prepare('INSERT INTO usage_segment_corrections_v1 VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
      .bind('p',date,'race-correction','s','d','example.test','active',start,cutoff,1800,'composite','composite','composite','study','study','study').run();
    // A correction arriving after projection but before SQL cannot write a stale scan.
    const scanRace={...env,DB:interceptWrite(db,/INSERT INTO composite_page_reviews_v1/,addCorrection)};
    await assert.rejects(service.scanCompositeReviews(scanRace,'p',now,date),/COMPOSITE_REVIEW_CHANGED/);
    await db.prepare('DELETE FROM usage_segment_corrections_v1').run();
    // A correction arriving immediately before opinion INSERT must reject the whole write.
    const oldReason=(await db.prepare('SELECT reason FROM composite_page_opinions_v1').first()).reason;
    const opinionRace={...env,DB:interceptWrite(db,/INSERT INTO composite_page_opinions_v1/,addCorrection)};
    const staleOpinion=await router.handle(request(base+'/opinion','POST','parent',{...opinion,reason:'stale overwrite'}),opinionRace);
    assert.equal(staleOpinion.status,409);
    assert.equal((await db.prepare('SELECT reason FROM composite_page_opinions_v1').first()).reason,oldReason);
    await db.prepare('DELETE FROM usage_segment_corrections_v1').run();
    // The send claim also checks the exact correction set at its write boundary.
    await db.prepare("UPDATE composite_review_notifications_v1 SET status='pending',attempts=0,next_attempt_at=0").run();
    const notificationRace={...env,DB:interceptWrite(db,/UPDATE composite_review_notifications_v1 SET status = 'sending'/,addCorrection)};
    await service.processCompositeNotifications(notificationRace,now);assert.equal(sent.length,6);
    assert.equal((await db.prepare('SELECT SUM(attempts) n FROM composite_review_notifications_v1').first()).n,0);
    await db.prepare('DELETE FROM usage_segment_corrections_v1').run();
    // Delete after evidence has been read, before the detail response is finalized.
    // The actual D1 rows are changed; only the scheduling boundary is injected.
    let deletedDuringRead=false;
    const racingEnv={...env,DB:{withSession(){
      const session=db.withSession('first-primary');
      return {prepare(sql){
        const statement=session.prepare(sql);
        if(sql.startsWith('SELECT page_key, verdict, reason'))return {bind(...args){return {async all(){
          await service.deleteReviewDetails(env,review.id);
          deletedDuringRead=true;
          return statement.bind(...args).all();
        }}}};
        return statement;
      }};
    }}};
    await assert.rejects(service.reviewDetail(racingEnv,review),/COMPOSITE_REVIEW_CHANGED/);
    assert.equal(deletedDuringRead,true);
    assert.equal((await router.handle(request(base,'DELETE'),env)).status,200);
    assert.equal(await count('composite_page_chunks_v1'),0);
    await db.prepare("UPDATE composite_review_notifications_v1 SET status='pending'").run();
    await service.processCompositeNotifications(env); assert.equal(sent.length,6);
    assert.equal((await router.handle(request(base+'/opinion','POST','parent',opinion),env)).status,409);
    const deleted=await service.reviewDetail(env,review); assert.equal(deleted.pages.length,0); assert.equal(deleted.complete,false);
    manifests.next={...manifests.m,manifestId:'next'};
    await db.prepare("UPDATE device_account_heads_v2 SET manifest_id='next'").run();
    await service.scanCompositeReviews(env,'p',now,date);
    assert.equal((await db.prepare('SELECT status FROM composite_page_requests_v1').first()).status,'deleted');
    assert.equal(JSON.stringify((await db.prepare('SELECT * FROM usage_segments_v1').all()).results),before);
    console.log('Composite cloud integration PASS: opt-in, threshold, D1 ACK, owner filtering, opinion, deletion, no ledger writes; auth/provider boundaries use fixtures');
  } finally {await mf.dispose();}
})().catch(error=>{console.error(error);process.exitCode=1;});
