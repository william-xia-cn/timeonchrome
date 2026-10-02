const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript'),{webcrypto}=require('node:crypto');
const root=path.resolve(__dirname,'../..');
function loader(overrides={}){
const cache=new Map();
return function load(file){if(cache.has(file))return cache.get(file).exports;
const module={exports:{}};cache.set(file,module);
const source=ts.transpileModule(fs.readFileSync(path.join(root,file),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
vm.runInNewContext(source,{module,exports:module.exports,crypto:webcrypto,TextEncoder,TextDecoder,Uint8Array,URL,URLSearchParams,Date,Map,Set,Request,Response,console,require:name=>{
if(name==='cloudflare:workers')return {WorkerEntrypoint:class{constructor(_,env){this.env=env;}}};
if(name in overrides)return overrides[name];
if(name==='@timeonchrome/app-runtime-contracts/computer-usage')return load('app-runtime-management/contracts/computer-usage.ts');
const next=path.posix.normalize(path.posix.join(path.posix.dirname(file),name));
return load(next.endsWith('.js')||next.endsWith('.ts')?next:next+'.ts');
}});
return module.exports;};}
const date='2026-10-01',start=Date.parse(date+'T00:00:00+08:00');
const schema=loader({'../infra/storage-budget.js':{runStorageMutation(){throw Error('read-only test');}}})('extension/core/device-account-v2.js');
const authorityRows=['daily_domain','hourly_domain','daily_target','hourly_target'].map(kind=>({kind,periodKey:kind.startsWith('hourly')?date+'T00':date,channel:'active',mode:'study',durationSeconds:3,segmentsCount:1,firstSeenAt:start+1000,lastSeenAt:start+4000,...(kind.endsWith('_domain')?{domain:'learning.example'}:{targetKey:'domain:learning.example',quotaBucket:'study',targetClassificationAtTime:'study'})})).sort((a,b)=>schema.canonicalDeviceAccountJson(a).localeCompare(schema.canonicalDeviceAccountJson(b)));
assert.equal(schema.validateDeviceAccountRows(authorityRows,date).ok,true,'fixture must match the real authoritative schema');
assert.equal(schema.validateDeviceAccountRows([{kind:'daily_total'}],date).code,'DEVICE_ACCOUNT_INVALID_KIND');
const app={key:'app:opaque',computerKey:'opaque-computer',computerName:'电脑',revision:'a1',associationVersion:'association1',correctionRevision:'ac1',settledAtMs:start+4000,complete:true,reasons:[],totalMs:2000,categoriesMs:{composite:2000},intervals:[{startMs:start+1500,endMs:start+3500,classification:'composite',subjectKey:'opaque-product',label:'办公应用',special:false}]};
function fixture({owned=true,appFailure=false,webFailure=false,failedDate,legacy=false,appError='private runtime failure',publicStats=[]}={}){
let reads=0,heads=1,appReads=0;const store=new Map();
const account={profileId:'child',deviceId:'browser',date,revision:1,statsHash:'hash',generatedAt:start+4000,committedAt:start+5000,complete:true,lossCount:0,rows:authorityRows};
const db={
  prepare(sql){return {bind(...params){return {
    async first(){if(sql.includes('FROM profiles'))return owned?{id:'child'}:null;if(sql.includes('SELECT manifest_id'))return legacy?null:{manifest_id:'m'+heads+'|'+params[2]};return {count:1,lastChange:heads};},
    async all(){if(sql.includes('SELECT device_id,date'))return {results:[{device_id:'browser',date,manifest_id:'m'+heads}]};if(sql.includes('FROM devices'))return {results:[{id:'browser',device_name:'浏览器设备'}]};if(sql.includes('FROM target_stats_v1'))return {results:[{date,channel:'active',mode:'study',target_classification_at_time:'study',duration_seconds:5134,last_seen_at:start+5134000}]};if(sql.includes('FROM usage_segments_v1')){reads++;return {results:[{id:'private-segment',start_ms:start+1000,end_ms:start+4000,duration_seconds:3,domain:'learning.example',target_classification_at_time:'study'}]};}return {results:[]};}
  };}};},withSession(){return db;}
};
const load=loader({'./profileAccountsV2':{readManifestAccountV2:async(_db,manifest)=>{if(webFailure||manifest.split('|')[1]===failedDate)throw Error('private DB detail');return {...account,date:manifest.split('|')[1]||date,revision:heads};}},
'./compositePageCorrections':{readCompositeCorrections:async()=>({revision:'c1',items:[]}),projectCompositeDailyRows:()=>account.rows.filter(row=>row.kind==='daily_target')},
'./usageAccountingCorrections':{listUsageAccountingCorrections:async()=>[],applyCorrectionsToV1StatsRows:rows=>rows},
'../db/middleware':{generateToken:async()=> 'test-internal'},'../routes/stats':{statsRouter:{handle:async request=>Response.json({stats:new URL(request.url).pathname.includes('hourly')?publicStats.map(row=>({...row,hour:0})):publicStats})}}});
return {load,env:{DB:db,CONFIG_CACHE:{get:async key=>store.has(key)?JSON.parse(store.get(key)):null,put:async(key,value)=>store.set(key,value)},RUNTIME_COMPUTER_USAGE:{applicationEvidenceRevision:async()=>{if(appFailure)throw Error(appError);return 'a1';},readApplicationEvidence:async()=>{appReads++;if(appFailure)throw Error(appError);return [app];}}},store,reads:()=>reads,appReads:()=>appReads,change(){heads++;}};
}
(async()=>{
let f=fixture(),service=f.load('workers/src/services/computerUsage.ts');
const scoped=new service.ComputerUsageService({}, {DB:{prepare(sql){assert.equal(sql,'SELECT id FROM profiles WHERE id=? AND account_id=?');return {bind(child,account){return {first:async()=>child==='current-child'&&account==='current-account'?{id:child}:null};}};}}});
const scopeRequest=(accountId,childId)=>new Request('https://private-capability/verifyChildAccess',{method:'POST',body:JSON.stringify({accountId,childId})});
assert.deepEqual(await (await scoped.fetch(scopeRequest('current-account','current-child'))).json(),{owned:true});
assert.deepEqual(await (await scoped.fetch(scopeRequest('foreign-account','current-child'))).json(),{owned:false});
assert.equal((await scoped.fetch(new Request('https://private-capability/getUsage',{method:'POST'}))).status,405);
assert.equal((await scoped.fetch(scopeRequest('x'.repeat(3000),'current-child'))).status,400);
const failedScope=new service.ComputerUsageService({}, {DB:{prepare(){throw Error('private DB failure');}}});
assert.deepEqual(await (await failedScope.fetch(scopeRequest('current-account','current-child'))).json(),{code:'APPLICATION_SCOPE_UNAVAILABLE'});
let result=await service.readComputerUsage(f.env,'account','child',date,date);
assert.equal(result.totals.webMs,3000);assert.equal(result.totals.applicationMs,2000);assert.equal(result.totals.computerMs,null);
assert.ok(result.reasons.includes('DEVICE_MAPPING_INCOMPLETE'));assert.equal(result.timeline.some(row=>row.key.includes('private-segment')),false);
assert.equal(result.sourceStatus.web,'complete','missing computer mapping does not invalidate authoritative web statistics');assert.equal(result.sourceStatus.application,'complete');
const firstReads=f.reads();await service.readComputerUsage(f.env,'account','child',date,date);assert.equal(f.reads(),firstReads,'same source versions reuse interval cache');
const cachedSummary=await service.readComputerUsage(f.env,'account','child',date,date,undefined,true);
assert.deepEqual(JSON.parse(JSON.stringify(cachedSummary.totals)),JSON.parse(JSON.stringify(result.totals)));
assert.equal(cachedSummary.revision,result.revision);assert.equal(cachedSummary.timeline.length,0);assert.equal(cachedSummary.products.length,0);
assert.equal(f.reads(),firstReads);assert.equal(f.appReads(),1,'summary/details cache hits never reload application evidence');
const summaryKeys=[...f.store.keys()].filter(key=>key.endsWith(':summary'));assert.equal(summaryKeys.length,1);
assert.equal(JSON.parse(f.store.get(summaryKeys[0])).timeline.length,0,'summary KV generation is small and separate from details');
f.change();const updated=await service.readComputerUsage(f.env,'account','child',date,date);assert.notEqual(updated.revision,result.revision);assert.ok(f.reads()>firstReads);
const selected=await service.readComputerUsage(f.env,'account','child',date,date,'opaque-computer');assert.equal(selected.totals.applicationMs,2000);assert.equal(selected.devices.length,1);
const week=await service.readComputerUsage(f.env,'account','child',date,'2026-10-02');const webGroup=week.devices.find(device=>device.key.startsWith('unmapped:web:'));assert.ok(webGroup,'unmapped browser source is selectable');
const weekSelected=await service.readComputerUsage(f.env,'account','child',date,'2026-10-02',webGroup.key);assert.equal(weekSelected.sourceVersions.filter(source=>source.kind==='web').length,2,'one stable browser source selects both dates');assert.equal(weekSelected.totals.webMs,6000);assert.equal(weekSelected.devices.length,1);
f=fixture({appFailure:true});result=await f.load('workers/src/services/computerUsage.ts').readComputerUsage(f.env,'account','child',date,date);assert.equal(result.totals.webMs,3000);assert.equal(result.totals.applicationMs,null);assert.ok(result.reasons.includes('APPLICATION_SOURCE_UNAVAILABLE'));
assert.equal(f.store.size,0,'source failures are not retained as successful generations');
f=fixture({webFailure:true});result=await f.load('workers/src/services/computerUsage.ts').readComputerUsage(f.env,'account','child',date,date);assert.equal(result.totals.applicationMs,2000);assert.equal(result.totals.webMs,null);
assert.equal(f.store.size,0);
// Both sources must start before either is allowed to finish. Avoid timing-based assertions.
f=fixture();let releaseApplication;const blocked=new Promise(resolve=>releaseApplication=resolve);
let originalApplication=f.env.RUNTIME_COMPUTER_USAGE.readApplicationEvidence,appStarted=false,parallelStarted=false;
f.env.RUNTIME_COMPUTER_USAGE.readApplicationEvidence=async()=>{appStarted=true;await blocked;return originalApplication();};
const originalPrepare=f.env.DB.prepare;
f.env.DB.prepare=sql=>{const statement=originalPrepare(sql);if(sql.includes('FROM devices'))return {bind(...args){const bound=statement.bind(...args);return {...bound,async all(){await Promise.resolve();parallelStarted=appStarted;releaseApplication();return bound.all();}};}};return statement;};
let timeout;try{await Promise.race([f.load('workers/src/services/computerUsage.ts').readComputerUsage(f.env,'account','child',date,date),new Promise((_,reject)=>timeout=setTimeout(()=>reject(Error('parallel sources did not settle')),5000))]);}finally{clearTimeout(timeout);}
assert.equal(parallelStarted,true,'application read starts while web is still loading');
f=fixture();f.env.CONFIG_CACHE.get=async()=>{throw Error('cache unavailable');};f.env.CONFIG_CACHE.put=async()=>{throw Error('cache unavailable');};
result=await f.load('workers/src/services/computerUsage.ts').readComputerUsage(f.env,'account','child',date,date,undefined,true);
assert.equal(result.totals.webMs,3000);assert.equal(result.totals.applicationMs,2000);assert.equal(result.timeline.length,0,'cache failure preserves exact summary');
f=fixture({failedDate:date});result=await f.load('workers/src/services/computerUsage.ts').readComputerUsage(f.env,'account','child',date,'2026-10-02');assert.equal(result.totals.webMs,3000);assert.equal(result.sourceStatus.web,'partial');assert.equal(result.sourceVersions.filter(source=>source.kind==='web').length,2);assert.equal(result.totals.applicationMs,2000);
f=fixture({owned:false});await assert.rejects(()=>f.load('workers/src/services/computerUsage.ts').readComputerUsage(f.env,'foreign','child',date,date),/CHILD_NOT_FOUND/);assert.equal(f.reads(),0);
f=fixture({legacy:true});result=await f.load('workers/src/services/computerUsage.ts').readComputerUsage(f.env,'account','child',date,date);assert.equal(result.totals.webMs,5134000);assert.equal(result.sourceCategoriesMs.web.study,5134000);assert.equal(result.historyStatus,'bestEffort');
f=fixture({appFailure:true,appError:'D1_ERROR: out of memory: SQLITE_NOMEM'});result=await f.load('workers/src/services/computerUsage.ts').readComputerUsage(f.env,'account','child',date,date);assert.equal(result.totals.webMs,3000);assert.ok(result.reasons.includes('APPLICATION_DATABASE_MEMORY_LIMIT'));
const publicStats=[{date,channel:'active',mode:'study',target_key:'domain:learning.example',target_classification_at_time:'study',duration_seconds:5134,managed_target_label_at_time:'',fallback_domain:'learning.example'}];
f=fixture({publicStats});service=f.load('workers/src/services/computerUsage.ts');
const independent=await service.readIndependentUsage(f.env,'account','child',date,date,'web');assert.equal(independent.totalDurationMs,5134000);assert.equal(independent.categories[0].durationMs,5134000);assert.equal(independent.applications[0].displayName,'learning.example');assert.equal(independent.buckets[0].startAtMs,start);
const independentWeek=await service.readIndependentUsage(f.env,'account','child',date,'2026-10-02','web');assert.equal(independentWeek.totalDurationMs,independent.totalDurationMs,'hourly rows are not added to daily authority');
await assert.rejects(()=>service.readIndependentUsage(f.env,'account','child',date,date,'other'),/INVALID_SOURCE/);
f=fixture();f.env.RUNTIME_COMPUTER_USAGE.fetch=async request=>{const scope=await request.json();assert.equal(scope.childId,'child');return Response.json(new URL(request.url).pathname.includes('Revision')?'cap-r1':[app]);};
result=await f.load('workers/src/services/computerUsage.ts').readComputerUsage(f.env,'account','child',date,date);assert.equal(result.totals.applicationMs,2000,'bounded capability HTTP transport preserves app authority');
for(const [a,b] of [['2026-02-30','2026-02-30'],['2026-10-01','2026-10-08'],['2026-10-02','2026-10-01']])assert.throws(()=>service.validateComputerUsageRange(a,b),/INVALID_RANGE/);
console.log('PASS cloud computer usage: original authority, ownership, failure isolation, mapping, version cache, filtering, privacy, range');
})().catch(error=>{console.error(error);process.exitCode=1;});
