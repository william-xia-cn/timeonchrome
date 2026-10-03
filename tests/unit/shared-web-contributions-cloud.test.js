'use strict';
// Real additive SQL, an isolated in-memory SQLite DB, and the real cloud publication implementation.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),ts=require('typescript');
const {DatabaseSync}=require('node:sqlite');
const root=path.resolve(__dirname,'../..');
function load(file,deps){const module={exports:{}};const code=ts.transpileModule(fs.readFileSync(path.join(root,file),'utf8'),
  {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  new Function('require','module','exports',code)(name=>{if(!(name in deps))throw Error('Missing dependency '+name);return deps[name];},module,module.exports);return module.exports;}
(async()=>{
 const access=await import('../../app-runtime-management/contracts/dist/shared-access.js');
 const sync=await import('../../app-runtime-management/contracts/dist/shared-web-sync.js');
 const cloud=load('workers/src/services/sharedWebContributions.ts',{'@timeonchrome/app-runtime-contracts/shared-access':access,
   '@timeonchrome/app-runtime-contracts/shared-web-sync':sync});
 const db=new DatabaseSync(':memory:');
 db.exec(`CREATE TABLE profiles(id TEXT PRIMARY KEY,account_id TEXT);CREATE TABLE devices(id TEXT PRIMARY KEY,profile_id TEXT,device_token TEXT,status TEXT);
   INSERT INTO profiles VALUES('child','owner'),('other-child','owner'),('foreign-child','foreign');
   INSERT INTO devices VALUES('browser','child','fixture-token','bound'),('second','child','second-token','bound');`);
 db.exec(fs.readFileSync(path.join(root,'workers/migrations/033_shared_web_contributions_v1.sql'),'utf8'));
 let rebindBeforeBatch=false;
 const adapter={prepare(sql){const stmt={bind(...params){return {sql,params,
   async first(){return db.prepare(sql).get(...params)??null;},async all(){return {results:db.prepare(sql).all(...params)};},
   async run(){return {success:true,meta:db.prepare(sql).run(...params)};}};}};return stmt;},
   async batch(statements){if(rebindBeforeBatch){rebindBeforeBatch=false;db.exec("UPDATE devices SET profile_id='other-child' WHERE id='browser'");}
     db.exec('BEGIN');try{const results=[];for(const s of statements)results.push(await s.run());db.exec('COMMIT');return results;}
     catch(error){db.exec('ROLLBACK');throw error;}}};
 const env={DB:adapter};
 const scope={accountId:'owner',childId:'child',deviceId:'browser',deviceToken:'fixture-token'};
 const days=['monday','tuesday','wednesday','thursday','friday','saturday','sunday'];
 const policy={schemaVersion:1,revision:'profile-config:8',effectiveAtMs:0,stage:'shadow',weeklyRestMinutes:120,
   dailyMinutes:Object.fromEntries(days.map(d=>[d,{study:60,composite:30,rest:60}])),timeWindows:Object.fromEntries(days.map(d=>[d,{study:null,composite:null,rest:null}])),
   autonomy:{restrictedEntryConfirmationRequired:false,dailyFirstReminderMinutes:null,weeklyFirstReminderMinutes:null,
     repeatReminderMinutes:10,softReminderTimeoutAction:'continue',visibleResponseDeadlineSeconds:60}};
 const policyIdentity=await access.createSharedAccessPolicyIdentityV1(policy),now=Date.parse('2026-10-03T12:00:00Z');
 const make=async(revisionOrdinal,study=600000)=>{const body={schemaVersion:1,date:'2026-10-03',revisionOrdinal,
   statisticsRevision:'stats-'+revisionOrdinal,correctionRevision:'corr-'+revisionOrdinal,policyIdentity,computedAtMs:now,settledAtMs:null,
   activeMs:study+300000,bucketsMs:{study,composite:0,rest:0},otherMs:300000,complete:true,reasonCodes:[]};
   return {...body,contentHash:await sync.sharedWebContributionHashV1(body)};};
 assert.equal((await cloud.readSharedWebWatermark(env,scope,'2026-10-03')).revisionOrdinal,0);
 const first=await make(1);const ack=await cloud.publishSharedWebContribution(env,scope,first,policy,now);
 assert.equal(ack.status,'accepted');assert.equal(ack.revisionOrdinal,1);assert.equal(ack.sourceKey.length,68);
 assert.equal((await cloud.publishSharedWebContribution(env,scope,first,policy,now)).status,'duplicate');
 const conflict=await make(1,300000);
 await assert.rejects(()=>cloud.publishSharedWebContribution(env,scope,conflict,policy,now),/REVISION_CONFLICT/);
 const second=await make(2,300000),third=await make(3);
 assert.equal((await cloud.publishSharedWebContribution(env,scope,second,policy,now)).revisionOrdinal,2);
 assert.equal((await cloud.publishSharedWebContribution(env,scope,first,policy,now)).status,'stale');
 const read=await cloud.readPublishedSharedWebContribution(env,'owner','child','browser','2026-10-03',policy);
 assert.equal(read.contribution.bucketsMs.study,300000);assert.equal(read.revisionOrdinal,2);
 assert.equal(await cloud.readPublishedSharedWebContribution(env,'foreign','child','browser','2026-10-03',policy),null);
 const stale=await cloud.readPublishedSharedWebContribution(env,'owner','child','browser','2026-10-03',{...policy,revision:'profile-config:9'});
 assert.equal(stale.contribution.complete,false);assert.ok(stale.contribution.reasonCodes.includes('SHARED_ACCESS_POLICY_CHANGED'));
 await assert.rejects(()=>cloud.publishSharedWebContribution(env,scope,third,{...policy,revision:'profile-config:9'},now),/POLICY_CHANGED/);
 rebindBeforeBatch=true;
 await assert.rejects(()=>cloud.publishSharedWebContribution(env,scope,third,policy,now),/BINDING_CHANGED/);
 assert.equal(db.prepare('SELECT COUNT(*) AS n FROM shared_web_contribution_receipts_v1').get().n,2,'binding-race insert is rejected inside SQL');
 await assert.rejects(()=>cloud.readSharedWebWatermark(env,scope,'2026-10-03'),/BINDING_CHANGED/);
 const other={...scope,childId:'other-child'};
 assert.equal((await cloud.readSharedWebWatermark(env,other,'2026-10-03')).revisionOrdinal,0);
 assert.equal((await cloud.publishSharedWebContribution(env,other,first,policy,now)).revisionOrdinal,1,'new Child scope has independent ordinal');
 assert.equal((await cloud.readPublishedSharedWebContribution(env,'owner','child','browser','2026-10-03',policy)).revisionOrdinal,2,'old Child consumed facts remain immutable');
 assert.equal((await cloud.readSharedWebWatermark(env,{...scope,deviceId:'second',deviceToken:'second-token'},'2026-10-03')).revisionOrdinal,0);
 const oversized=new Request('https://fixture',{method:'POST',body:'x'.repeat(16385)});
 await assert.rejects(()=>cloud.readSharedWebJson(oversized),/BODY_TOO_LARGE/);
 assert.equal(db.prepare('SELECT COUNT(*) AS n FROM shared_web_contribution_receipts_v1').get().n,3);
 // Source binding exercises real Guardian issuance and real Runtime current-assignment SQL.
 db.exec(`CREATE TABLE runtime_machines_v2(id TEXT PRIMARY KEY,account_id TEXT,revoked_at_ms INTEGER);
   CREATE TABLE runtime_user_assignments_v2(machine_id TEXT,local_user_id TEXT,assignment_version INTEGER,child_id TEXT,protected INTEGER);
   INSERT INTO runtime_machines_v2 VALUES('machine','owner',NULL);
   INSERT INTO runtime_user_assignments_v2 VALUES('machine','opaque-local-user',1,'child',1);
   UPDATE devices SET profile_id='child' WHERE id='browser';`);
 const {webcrypto}=require('node:crypto');
 const sha=async(value)=>Buffer.from(await webcrypto.subtle.digest('SHA-256',new TextEncoder().encode(value))).toString('hex');
 const applicationKey=await sha('application\nmachine\nopaque-local-user\n1');
 const http=load('app-runtime-management/backend/src/http.ts',{});
 const machine={machineId:'machine',accountId:'owner'};
 const runtime=load('app-runtime-management/backend/src/sharedWebSourceBinding.ts',{
   './applicationSharedQuota':{applicationSharedQuotaSourceKey:async(m,u,v)=>sha(`application\n${m}\n${u}\n${v}`)},
   './http':http,'./auth':{requireMachine:async()=>machine},'./contracts':{},'./validation':{isRecord:v=>!!v&&typeof v==='object'&&!Array.isArray(v)},
   './crypto':{sha256Hex:sha},'@timeonchrome/app-runtime-contracts/shared-web-sync':sync});
 const binding=load('workers/src/services/sharedWebSourceBinding.ts',{
   '@timeonchrome/app-runtime-contracts/shared-web-sync':sync,
   './sharedAccessState':{sharedWebSourceKey:async(a,d)=>'web:'+await sha(a+'\n'+d)},
   './sharedWebContributions':cloud});
 const key=await webcrypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']);
 const signing=await webcrypto.subtle.exportKey('jwk',key.privateKey);
 // Keep challenge expiry, HTTP response checks and injected proof time on one isolated test clock.
 const realDateNow=Date.now;Date.now=()=>now;
 const bindingEnv={...env,SHARED_WEB_CONTRIBUTIONS_ENABLED:'true',SHARED_WEB_SOURCE_BINDING_PRIVATE_JWK:JSON.stringify(signing),
   RUNTIME_COMPUTER_USAGE:{async fetch(request){const body=await request.json();
     try{return Response.json({owned:await (new URL(request.url).pathname==='/verifySharedWebSourceScope'
       ?runtime.verifySharedWebSourceScope(adapter,body):runtime.verifySharedWebSourceAssignment(adapter,body))});}
     catch(error){return Response.json({code:error.code},{status:error.status||503});}}}};
 const challengeInput={accountId:'owner',childId:'child',machineId:'machine',localUserId:'opaque-local-user',assignmentVersion:1,
   applicationSourceKey:applicationKey,connectionHash:'d'.repeat(64)};
 await assert.rejects(()=>binding.createSharedWebSourceChallenge({...bindingEnv,SHARED_WEB_SOURCE_BINDING_PRIVATE_JWK:undefined,
   APP_RUNTIME_SSO_PRIVATE_JWK:JSON.stringify(signing)},challengeInput,now),/BINDING_UNAVAILABLE/,'no fallback to SSO key');
 const challenge=await binding.createSharedWebSourceChallenge(bindingEnv,challengeInput,now);
 assert.equal(challenge.expiresAtMs,now+90000);
 assert.equal(Object.keys(challenge).length,4,'challenge does not expose child/machine/user IDs');
 const proof=await binding.issueSharedWebSourceBinding(bindingEnv,scope,challenge.challengeId,now);
 const pub=await binding.readSharedWebVerificationKey(bindingEnv);
 const routeUser='u'.repeat(32);
 db.prepare('INSERT INTO runtime_user_assignments_v2 VALUES(?,?,?,?,?)').run('machine',routeUser,1,'child',1);
 const runtimeEnv={RUNTIME_DB:adapter,GUARDIAN_COMPUTER_USAGE:{async fetch(request){
   const body=await request.json();
   return Response.json(new URL(request.url).pathname==='/readSharedWebVerificationKey'
     ?await binding.readSharedWebVerificationKey(bindingEnv):await binding.createSharedWebSourceChallenge(bindingEnv,body));
 }}};
 const challengeRequest=(patch={})=>new Request('https://fixture/v2/machines/shared-web-source/challenge',{
   method:'POST',headers:{'content-type':'application/json'},
   body:JSON.stringify({localUserId:routeUser,assignmentVersion:1,connectionHash:'d'.repeat(64),...patch})});
 const machineChallenge=await (await runtime.routeSharedWebSourceBinding(challengeRequest(),runtimeEnv,machine,Date.now())).json();
 assert.equal(Object.keys(machineChallenge).length,6);
 assert.equal(machineChallenge.applicationSourceKey,await sha(`application\nmachine\n${routeUser}\n1`));
 assert.equal(machineChallenge.childScopeHash,await binding.sharedChildScopeHash('owner','child'),
   'Native trusted expected context comes from authenticated machine response, not from unverified proof');
 await assert.rejects(()=>runtime.routeSharedWebSourceBinding(challengeRequest({childId:'foreign-child'}),runtimeEnv,machine,Date.now()),
   error=>error.code==='INVALID_WEB_SOURCE_CHALLENGE');
 const verification=await (await runtime.routeSharedWebSourceBinding(new Request('https://fixture/v2/machines/shared-web-source/verification-key'),
   runtimeEnv,machine,Date.now())).json();
 assert.deepEqual(verification,pub);
 const boundHeader=new Request('https://fixture',{headers:{'X-Shared-Web-Source-Proof':JSON.stringify(proof)}});
 assert.deepEqual(await runtime.parseMachineWebSourceProof(boundHeader,machine,'child',1,applicationKey),proof);
 await assert.rejects(()=>runtime.parseMachineWebSourceProof(boundHeader,machine,'other-child',1,applicationKey),
   error=>error.code==='WEB_SOURCE_BINDING_CONFLICT');
 assert.ok(!Object.hasOwn(pub.publicJwk,'d'),'only public key leaves the key capability');
 assert.equal(proof.claims.applicationSourceKey,applicationKey);
 assert.equal(proof.claims.webSourceKey,ack.sourceKey);
 assert.ok(!JSON.stringify(proof).includes('fixture-token'));assert.ok(!JSON.stringify(proof).includes('opaque-local-user'));
 assert.deepEqual(await binding.verifyCurrentSharedWebSource(bindingEnv,proof,'owner','child',applicationKey,now),proof.claims);
 db.exec("UPDATE devices SET device_token='rotated-fixture-token' WHERE id='browser'");
 await assert.rejects(()=>binding.verifyCurrentSharedWebSource(bindingEnv,proof,'owner','child',applicationKey,now),/ASSIGNMENT_CHANGED/,
   'token rotation invalidates a prior binding even when the device and Child IDs remain equal');
 await assert.rejects(()=>binding.issueSharedWebSourceBinding(bindingEnv,scope,challenge.challengeId,now),/ASSIGNMENT_CHANGED/);
 db.exec("UPDATE devices SET device_token='fixture-token' WHERE id='browser'");
 await assert.rejects(()=>binding.issueSharedWebSourceBinding(bindingEnv,{...scope,deviceId:'second',deviceToken:'second-token'},
   challenge.challengeId,now),/BINDING_CONFLICT/,'one challenge cannot authorize a second browser');
 await assert.rejects(()=>binding.issueSharedWebSourceBinding(bindingEnv,{...scope,childId:'other-child'},challenge.challengeId,now),/CHALLENGE_EXPIRED/);
 await assert.rejects(()=>binding.verifyCurrentSharedWebSource(bindingEnv,proof,'owner','child',applicationKey,now+300000),/CONTEXT_CHANGED/);
 await assert.rejects(()=>binding.issueSharedWebSourceBinding(bindingEnv,scope,challenge.challengeId,now+90000),/CHALLENGE_EXPIRED/);
 // v2 reuses a signed scope across connections, but never treats it as a web authority or lease.
 const challengeCount=db.prepare('SELECT COUNT(*) AS n FROM shared_web_source_challenges_v1').get().n;
 const {connectionHash,...scopeInput}=challengeInput;
 const machineScope=await binding.createSharedWebMachineScope(bindingEnv,scopeInput,now);
 assert.equal(machineScope.schemaVersion,2);assert.equal(machineScope.claims.audience,'timeonchrome:shared-web-machine-scope:v2');
 assert.equal(machineScope.claims.expiresAtMs,now+300000);
 assert.equal(Object.hasOwn(machineScope.claims,'challengeId'),false);assert.equal(Object.hasOwn(machineScope.claims,'connectionHash'),false);
 assert.equal(Object.hasOwn(machineScope.claims,'webSourceKey'),false);
 const reusable=await binding.issueSharedWebSourceBindingV2(bindingEnv,scope,machineScope,now);
 await assert.rejects(()=>binding.issueSharedWebSourceBindingV2({...bindingEnv,RUNTIME_COMPUTER_USAGE:{fetch:async()=>{throw Error('private transport');}}},
   scope,machineScope,now),/WEB_SOURCE_BINDING_UNAVAILABLE/,'transport error is a stable unavailable state, not caller evidence');
 assert.equal(reusable.claims.webSourceKey,proof.claims.webSourceKey);
 assert.equal(reusable.claims.bindingEpochHash,await sha('shared-web-binding\nbrowser\nfixture-token'));
 assert.deepEqual(await binding.verifyCurrentSharedWebSource(bindingEnv,reusable,'owner','child',applicationKey,now),reusable.claims);
 let assignmentReads=0;
 const racingEnv={...bindingEnv,RUNTIME_COMPUTER_USAGE:{async fetch(request){
   const response=await bindingEnv.RUNTIME_COMPUTER_USAGE.fetch(request);
   if(++assignmentReads===2)db.exec("UPDATE devices SET device_token='raced-token' WHERE id='browser'");
   return response;
 }}};
 await assert.rejects(()=>binding.verifyCurrentSharedWebSource(racingEnv,reusable,'owner','child',applicationKey,now),/SCOPE_MISMATCH/,
   'browser epoch is checked again after the final asynchronous assignment lookup');
 db.exec("UPDATE devices SET device_token='fixture-token' WHERE id='browser'");
 const reconnect=await binding.issueSharedWebSourceBindingV2(bindingEnv,scope,machineScope,now+1000);
 assert.equal(reconnect.claims.applicationSourceKey,reusable.claims.applicationSourceKey);
 assert.equal(reconnect.claims.expiresAtMs,machineScope.claims.expiresAtMs,'reissue cannot extend a stale scope');
 assert.deepEqual(await binding.verifyCurrentSharedWebSource(bindingEnv,reconnect,'owner','child',applicationKey,now+1000),reconnect.claims);
 assert.equal(db.prepare('SELECT COUNT(*) AS n FROM shared_web_source_challenges_v1').get().n,challengeCount,'v2 issuance/read writes no challenge');
 const v2Header=new Request('https://fixture',{headers:{'X-Shared-Web-Source-Proof':JSON.stringify(reusable)}});
 assert.deepEqual(await runtime.parseMachineWebSourceProof(v2Header,machine,'child',1,applicationKey),reusable);
 await assert.rejects(()=>runtime.parseMachineWebSourceProof(v2Header,machine,'other-child',1,applicationKey),
   error=>error.code==='WEB_SOURCE_SCOPE_MISMATCH');
 await assert.rejects(()=>binding.verifyCurrentSharedWebSource(bindingEnv,machineScope,'owner','child',applicationKey,now),/INVALID_WEB_SOURCE_BINDING/,
   'machine audience cannot authorize a web source');
 await assert.rejects(()=>binding.issueSharedWebSourceBindingV2(bindingEnv,scope,reusable,now),/INVALID_WEB_SOURCE_BINDING/);
 await assert.rejects(()=>binding.issueSharedWebSourceBindingV2(bindingEnv,{...scope,childId:'other-child'},machineScope,now),/SCOPE_MISMATCH/);
 await assert.rejects(()=>binding.verifyCurrentSharedWebSource(bindingEnv,reusable,'foreign','child',applicationKey,now),/SCOPE_MISMATCH/);
 await assert.rejects(()=>binding.verifyCurrentSharedWebSource(bindingEnv,reusable,'owner','child','f'.repeat(64),now),/SCOPE_MISMATCH/);
 const bad={...machineScope,claims:{...machineScope.claims,expiresAtMs:machineScope.claims.expiresAtMs-1}};
 await assert.rejects(()=>binding.issueSharedWebSourceBindingV2(bindingEnv,scope,bad,now),/SIGNATURE_INVALID/);
 await assert.rejects(()=>binding.issueSharedWebSourceBindingV2(bindingEnv,scope,machineScope,now+300000),/PROOF_EXPIRED/);
 await assert.rejects(()=>binding.verifyCurrentSharedWebSource(bindingEnv,reusable,'owner','child',applicationKey,now+300000),/PROOF_EXPIRED/);
 db.exec("UPDATE devices SET device_token='rotated-v2' WHERE id='browser'");
 await assert.rejects(()=>binding.verifyCurrentSharedWebSource(bindingEnv,reusable,'owner','child',applicationKey,now),/SCOPE_MISMATCH/);
 await assert.rejects(()=>binding.issueSharedWebSourceBindingV2(bindingEnv,scope,machineScope,now),/SCOPE_MISMATCH/);
 db.exec("UPDATE devices SET device_token='fixture-token',status='unbound' WHERE id='browser'");
 await assert.rejects(()=>binding.verifyCurrentSharedWebSource(bindingEnv,reusable,'owner','child',applicationKey,now),/SCOPE_MISMATCH/);
 db.exec("UPDATE devices SET status='bound',profile_id='other-child' WHERE id='browser'");
 await assert.rejects(()=>binding.verifyCurrentSharedWebSource(bindingEnv,reusable,'owner','child',applicationKey,now),/SCOPE_MISMATCH/);
 db.exec("UPDATE devices SET profile_id='child' WHERE id='browser'");
 db.prepare('INSERT INTO runtime_user_assignments_v2 VALUES(?,?,?,?,?)').run('machine','opaque-local-user',2,'other-child',1);
 await assert.rejects(()=>binding.verifyCurrentSharedWebSource(bindingEnv,reusable,'owner','child',applicationKey,now),/ASSIGNMENT_UNAVAILABLE/);
 await assert.rejects(()=>binding.issueSharedWebSourceBindingV2(bindingEnv,scope,machineScope,now),/ASSIGNMENT_UNAVAILABLE/);
 db.exec("DELETE FROM runtime_user_assignments_v2 WHERE local_user_id='opaque-local-user' AND assignment_version=2");
 db.exec("UPDATE runtime_machines_v2 SET revoked_at_ms=1 WHERE id='machine'");
 await assert.rejects(()=>binding.verifyCurrentSharedWebSource(bindingEnv,reusable,'owner','child',applicationKey,now),/ASSIGNMENT_UNAVAILABLE/);
 db.exec("UPDATE runtime_machines_v2 SET revoked_at_ms=NULL WHERE id='machine'");
 const internalScope={accountId:'owner',childId:'child',applicationSourceKey:applicationKey,assignmentVersion:1};
 assert.equal(await runtime.verifySharedWebSourceScope(adapter,internalScope),true);
 assert.equal(await runtime.verifySharedWebSourceScope(adapter,{...internalScope,accountId:'foreign'}),false);
 assert.equal(await runtime.verifySharedWebSourceScope(adapter,{...internalScope,machineId:'caller'}),false);
 for(let n=0;n<200;n++)db.prepare('INSERT INTO runtime_user_assignments_v2 VALUES(?,?,?,?,?)').run('machine','extra-'+n,1,'child',1);
 await assert.rejects(()=>runtime.verifySharedWebSourceScope(adapter,internalScope),error=>error.code==='SOURCE_SCOPE_LIMIT');
 await assert.rejects(()=>binding.issueSharedWebSourceBindingV2(bindingEnv,scope,machineScope,now),/SOURCE_SCOPE_LIMIT/);
 db.exec("DELETE FROM runtime_user_assignments_v2 WHERE local_user_id LIKE 'extra-%'");
 for(let n=0;n<200;n++)db.prepare('INSERT INTO devices VALUES(?,?,?,?)').run('extra-'+n,'child','token-'+n,'bound');
 await assert.rejects(()=>binding.verifyCurrentSharedWebSource(bindingEnv,reusable,'owner','child',applicationKey,now),/SOURCE_SCOPE_LIMIT/);
 db.exec("DELETE FROM devices WHERE id LIKE 'extra-%'");
 assert.deepEqual(await binding.verifyCurrentSharedWebSource(bindingEnv,reusable,'owner','child',applicationKey,now),reusable.claims);
 assert.equal(db.prepare('SELECT COUNT(*) AS n FROM shared_web_contribution_receipts_v1').get().n,3,'identity verification never mutates contribution receipts');
 db.exec("UPDATE devices SET status='unbound' WHERE id='browser'");
 await assert.rejects(()=>binding.verifyCurrentSharedWebSource(bindingEnv,proof,'owner','child',applicationKey,now),/ASSIGNMENT_CHANGED/);
 db.exec("UPDATE devices SET status='bound' WHERE id='browser';UPDATE runtime_user_assignments_v2 SET protected=0;");
 await assert.rejects(()=>binding.verifyCurrentSharedWebSource(bindingEnv,proof,'owner','child',applicationKey,now),/ASSIGNMENT_CHANGED/);
 assert.equal(await runtime.verifySharedWebSourceAssignment(adapter,{...challengeInput,connectionHash:undefined}),false,
   'only the exact internal verification scope is accepted');
 Date.now=realDateNow;db.close();console.log('shared-web-contributions-cloud: real SQLite publication/watermark/correction/rebind/source-proof v1/v2 PASS');
})().catch(error=>{console.error(error);process.exitCode=1;});
