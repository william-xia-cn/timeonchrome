'use strict';
// 真实当前V2验签和隔离SQLite归属查询；不创建旧贡献或挑战存储。
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),ts=require('typescript');
const {DatabaseSync}=require('node:sqlite');
const root=path.resolve(__dirname,'../..');
function load(file,deps){const module={exports:{}};const code=ts.transpileModule(fs.readFileSync(path.join(root,file),'utf8'),
  {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  new Function('require','module','exports',code)(name=>{if(!(name in deps))throw Error('Missing dependency '+name);return deps[name];},module,module.exports);return module.exports;}
(async()=>{
 const sync=await import('../../app-runtime-management/contracts/dist/shared-web-sync.js');
 const cloud=load('workers/src/services/sharedWebContributions.ts',{});
 const db=new DatabaseSync(':memory:');
 db.exec(`CREATE TABLE profiles(id TEXT PRIMARY KEY,account_id TEXT);CREATE TABLE devices(id TEXT PRIMARY KEY,profile_id TEXT,device_token TEXT,status TEXT);
   INSERT INTO profiles VALUES('child','owner'),('other-child','owner'),('foreign-child','foreign');
   INSERT INTO devices VALUES('browser','child','fixture-token','bound'),('second','child','second-token','bound');`);
 const adapter={prepare(sql){const stmt={bind(...params){return {sql,params,
   async first(){return db.prepare(sql).get(...params)??null;},async all(){return {results:db.prepare(sql).all(...params)};},
   async run(){return {success:true,meta:db.prepare(sql).run(...params)};}};}};return stmt;},
   async batch(){throw Error('current reusable proof must not write old state');}};
 const env={DB:adapter};
 const scope={accountId:'owner',childId:'child',deviceId:'browser',deviceToken:'fixture-token'};
 const now=Date.parse('2026-10-03T12:00:00Z');
 await assert.rejects(()=>cloud.readSharedWebJson(new Request('https://fixture',{method:'POST',body:'x'.repeat(16385)})),/BODY_TOO_LARGE/);
 assert.deepEqual(await cloud.readSharedWebJson(new Request('https://fixture',{method:'POST',body:'{"scopeProof":{}}'})),{scopeProof:{}});
 await assert.rejects(()=>cloud.readSharedWebJson(new Request('https://fixture',{method:'POST',body:'bad'})),/INVALID_WEB_CONTRIBUTION/);
 for(const retired of ['publishSharedWebContribution','readPublishedSharedWebContribution','readSharedWebWatermark'])assert.equal(Object.hasOwn(cloud,retired),false);
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
 // HTTP响应与注入证明时间使用同一个隔离时钟。
 const realDateNow=Date.now;Date.now=()=>now;
 const bindingEnv={...env,SHARED_WEB_CONTRIBUTIONS_ENABLED:'true',SHARED_WEB_SOURCE_BINDING_PRIVATE_JWK:JSON.stringify(signing),
   RUNTIME_COMPUTER_USAGE:{async fetch(request){const body=await request.json();
     try{return Response.json({owned:await (new URL(request.url).pathname==='/verifySharedWebSourceScope'
       ?runtime.verifySharedWebSourceScope(adapter,body):runtime.verifySharedWebSourceAssignment(adapter,body))});}
     catch(error){return Response.json({code:error.code},{status:error.status||503});}}}};
 const scopeInput={accountId:'owner',childId:'child',machineId:'machine',localUserId:'opaque-local-user',assignmentVersion:1,applicationSourceKey:applicationKey};
 await assert.rejects(()=>binding.createSharedWebMachineScope({...bindingEnv,SHARED_WEB_SOURCE_BINDING_PRIVATE_JWK:undefined,APP_RUNTIME_SSO_PRIVATE_JWK:JSON.stringify(signing)},scopeInput,now),/BINDING_UNAVAILABLE/,'dedicated key never falls back to login credentials');
 const pub=await binding.readSharedWebVerificationKey(bindingEnv);
 assert.ok(!Object.hasOwn(pub.publicJwk,'d'));
 const routeUser='u'.repeat(32);
 db.prepare('INSERT INTO runtime_user_assignments_v2 VALUES(?,?,?,?,?)').run('machine',routeUser,1,'child',1);
 const runtimeEnv={RUNTIME_DB:adapter,GUARDIAN_COMPUTER_USAGE:{async fetch(request){const body=await request.json();return Response.json(new URL(request.url).pathname==='/readSharedWebVerificationKey'?await binding.readSharedWebVerificationKey(bindingEnv):await binding.createSharedWebMachineScope(bindingEnv,body));}}};
 const scopeRequest=(patch={})=>new Request('https://fixture/v2/machines/shared-web-source/scope',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({localUserId:routeUser,assignmentVersion:1,...patch})});
 const machineResponse=await runtime.routeSharedWebSourceBinding(scopeRequest(),runtimeEnv,machine,now);
 const machineProof=await machineResponse.json();assert.equal(machineProof.schemaVersion,2);
 assert.equal(machineProof.claims.applicationSourceKey,await sha('application\nmachine\n'+routeUser+'\n1'));
 await assert.rejects(()=>runtime.routeSharedWebSourceBinding(scopeRequest({childId:'foreign'}),runtimeEnv,machine,now),error=>error.code==='INVALID_WEB_SOURCE_SCOPE');
 assert.deepEqual(await(await runtime.routeSharedWebSourceBinding(new Request('https://fixture/v2/machines/shared-web-source/verification-key'),runtimeEnv,machine,now)).json(),pub);
 await assert.rejects(()=>runtime.routeSharedWebSourceBinding(new Request('https://fixture/v2/machines/shared-web-source/challenge',{method:'POST'}),runtimeEnv,machine,now),error=>error.code==='NOT_FOUND');
 const machineScope=await binding.createSharedWebMachineScope(bindingEnv,scopeInput,now);
 assert.equal(machineScope.schemaVersion,2);assert.equal(machineScope.claims.audience,'timeonchrome:shared-web-machine-scope:v2');
 assert.equal(machineScope.claims.expiresAtMs,now+300000);
 assert.equal(Object.hasOwn(machineScope.claims,'challengeId'),false);assert.equal(Object.hasOwn(machineScope.claims,'connectionHash'),false);
 assert.equal(Object.hasOwn(machineScope.claims,'webSourceKey'),false);
 const reusable=await binding.issueSharedWebSourceBindingV2(bindingEnv,scope,machineScope,now);
 await assert.rejects(()=>binding.issueSharedWebSourceBindingV2({...bindingEnv,RUNTIME_COMPUTER_USAGE:{fetch:async()=>{throw Error('private transport');}}},
   scope,machineScope,now),/WEB_SOURCE_BINDING_UNAVAILABLE/,'transport error is a stable unavailable state, not caller evidence');
 assert.equal(reusable.claims.webSourceKey,'web:'+await sha('owner\nbrowser'));
 assert.equal(reusable.claims.bindingEpochHash,await sha('shared-web-binding\nbrowser\nfixture-token'));
 assert.deepEqual(await binding.verifyCurrentSharedWebSource(bindingEnv,reusable,'owner','child',applicationKey,now),reusable.claims);
 const selector={applicationSourceKey:applicationKey,assignmentVersion:1};
 assert.deepEqual(await binding.readApplicationSourceForDevice(bindingEnv,scope,reusable,now),selector);
 assert.equal(await binding.readApplicationSourceForDevice(bindingEnv,scope,null,now),null);
 assert.equal(await binding.readApplicationSourceForDevice(bindingEnv,scope,{bad:true},now),null);
 assert.equal(await binding.readApplicationSourceForDevice(bindingEnv,scope,reusable,now+300000),null,'expired proof only omits attribution');
 assert.equal(await binding.readApplicationSourceForDevice(bindingEnv,{...scope,childId:'other-child'},reusable,now),null);
 assert.equal(await binding.readApplicationSourceForDevice(bindingEnv,{...scope,accountId:'foreign'},reusable,now),null);
 assert.equal(await binding.readApplicationSourceForDevice(bindingEnv,{...scope,deviceId:'second',deviceToken:'second-token'},reusable,now),null,
   'another browser of same child cannot claim this application source');
 assert.equal(await binding.readApplicationSourceForDevice(bindingEnv,scope,
   {...reusable,claims:{...reusable.claims,assignmentVersion:2}},now),null,'tampered source selector is not trusted');
 assert.equal(await binding.readApplicationSourceForDevice({...bindingEnv,RUNTIME_COMPUTER_USAGE:{fetch:async()=>{throw Error('unavailable');}}},
   scope,reusable,now),null,'optional source failure does not throw into aggregate reader');
 assert.ok(Buffer.byteLength(JSON.stringify({schemaVersion:2,source:'application',scope:'all',fromDate:'2026-10-17',
   toDate:'2026-10-17',includeSources:true,sourceProof:reusable}))<2048,'reuse existing bounded request size');
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
 db.exec("UPDATE devices SET status='unbound' WHERE id='browser'");
 await assert.rejects(()=>binding.verifyCurrentSharedWebSource(bindingEnv,reusable,'owner','child',applicationKey,now),/SCOPE_MISMATCH/);
 db.exec("UPDATE devices SET status='bound' WHERE id='browser';UPDATE runtime_user_assignments_v2 SET protected=0;");
 await assert.rejects(()=>binding.createSharedWebMachineScope(bindingEnv,scopeInput,now),/ASSIGNMENT_UNAVAILABLE/);
 assert.equal(await runtime.verifySharedWebSourceAssignment(adapter,{...scopeInput,connectionHash:undefined}),false);
 assert.equal(db.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE name LIKE 'shared_web_%'").get().n,0,'current proof requires no old contribution/challenge storage');
 Date.now=realDateNow;db.close();console.log('shared-web-contributions-cloud: retired contribution API absent; current V2 key, scope, signature, expiry, rebind and bounded JSON PASS');
})().catch(error=>{console.error(error);process.exitCode=1;});
