const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript'),{webcrypto}=require('node:crypto');
const root=path.resolve(__dirname,'../..');
function loader(overrides={}){
const cache=new Map();
return function load(file){if(cache.has(file))return cache.get(file).exports;
const module={exports:{}};cache.set(file,module);
const source=ts.transpileModule(fs.readFileSync(path.join(root,file),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
vm.runInNewContext(source,{module,exports:module.exports,crypto:webcrypto,TextEncoder,URL,Date,Map,Set,Response,console,require:name=>{
if(name==='cloudflare:workers')return {WorkerEntrypoint:class{constructor(_,env){this.env=env;}}};
if(name in overrides)return overrides[name];
if(name==='@timeonchrome/app-runtime-contracts/computer-usage')return load('app-runtime-management/contracts/computer-usage.ts');
const next=path.posix.normalize(path.posix.join(path.posix.dirname(file),name));
return load(next.endsWith('.js')||next.endsWith('.ts')?next:next+'.ts');
}});
return module.exports;};}
const date='2026-10-01',start=Date.parse(date+'T00:00:00+08:00');
const app={key:'app:opaque',computerKey:'opaque-computer',computerName:'电脑',revision:'a1',associationVersion:'association1',correctionRevision:'ac1',settledAtMs:start+4000,complete:true,reasons:[],totalMs:2000,categoriesMs:{composite:2000},intervals:[{startMs:start+1500,endMs:start+3500,classification:'composite',subjectKey:'opaque-product',label:'办公应用',special:false}]};
function fixture({owned=true,appFailure=false,webFailure=false,failedDate}={}){
let reads=0,heads=1;const store=new Map();
const account={profileId:'child',deviceId:'browser',date,revision:1,statsHash:'hash',generatedAt:start+4000,committedAt:start+5000,complete:true,lossCount:0,rows:[{kind:'daily_total',channel:'active',durationSeconds:3},{kind:'daily_target',channel:'active',durationSeconds:3,targetClassificationAtTime:'study',targetKey:'domain:learning.example'}]};
const db={
  prepare(sql){return {bind(...params){return {
    async first(){if(sql.includes('FROM profiles'))return owned?{id:'child'}:null;if(sql.includes('SELECT manifest_id'))return {manifest_id:'m'+heads+'|'+params[2]};return {count:1,lastChange:heads};},
    async all(){if(sql.includes('SELECT device_id,date'))return {results:[{device_id:'browser',date,manifest_id:'m'+heads}]};if(sql.includes('FROM devices'))return {results:[{id:'browser',device_name:'浏览器设备'}]};if(sql.includes('FROM usage_segments_v1')){reads++;return {results:[{id:'private-segment',start_ms:start+1000,end_ms:start+4000,duration_seconds:3,domain:'learning.example',target_classification_at_time:'study'}]};}return {results:[]};}
  };}};},withSession(){return db;}
};
const load=loader({'./profileAccountsV2':{readManifestAccountV2:async(_db,manifest)=>{if(webFailure||manifest.split('|')[1]===failedDate)throw Error('private DB detail');return {...account,date:manifest.split('|')[1]||date,revision:heads};}},
'./compositePageCorrections':{readCompositeCorrections:async()=>({revision:'c1',items:[]}),projectCompositeDailyRows:()=>account.rows.filter(row=>row.kind==='daily_target')}});
return {load,env:{DB:db,CONFIG_CACHE:{get:async key=>store.has(key)?JSON.parse(store.get(key)):null,put:async(key,value)=>store.set(key,value)},RUNTIME_COMPUTER_USAGE:{applicationEvidenceRevision:async()=>{if(appFailure)throw Error('private runtime failure');return 'a1';},readApplicationEvidence:async()=>{if(appFailure)throw Error('private runtime failure');return [app];}}},reads:()=>reads,change(){heads++;}};
}
(async()=>{
let f=fixture(),service=f.load('workers/src/services/computerUsage.ts');
let result=await service.readComputerUsage(f.env,'account','child',date,date);
assert.equal(result.totals.webMs,3000);assert.equal(result.totals.applicationMs,2000);assert.equal(result.totals.computerMs,null);
assert.ok(result.reasons.includes('DEVICE_MAPPING_INCOMPLETE'));assert.equal(result.timeline.some(row=>row.key.includes('private-segment')),false);
assert.equal(result.sourceStatus.web,'complete','missing computer mapping does not invalidate authoritative web statistics');assert.equal(result.sourceStatus.application,'complete');
const firstReads=f.reads();await service.readComputerUsage(f.env,'account','child',date,date);assert.equal(f.reads(),firstReads,'same source versions reuse interval cache');
f.change();const updated=await service.readComputerUsage(f.env,'account','child',date,date);assert.notEqual(updated.revision,result.revision);assert.ok(f.reads()>firstReads);
const selected=await service.readComputerUsage(f.env,'account','child',date,date,'opaque-computer');assert.equal(selected.totals.applicationMs,2000);assert.equal(selected.devices.length,1);
const week=await service.readComputerUsage(f.env,'account','child',date,'2026-10-02');const webGroup=week.devices.find(device=>device.key.startsWith('unmapped:web:'));assert.ok(webGroup,'unmapped browser source is selectable');
const weekSelected=await service.readComputerUsage(f.env,'account','child',date,'2026-10-02',webGroup.key);assert.equal(weekSelected.sourceVersions.filter(source=>source.kind==='web').length,2,'one stable browser source selects both dates');assert.equal(weekSelected.totals.webMs,6000);assert.equal(weekSelected.devices.length,1);
f=fixture({appFailure:true});result=await f.load('workers/src/services/computerUsage.ts').readComputerUsage(f.env,'account','child',date,date);assert.equal(result.totals.webMs,3000);assert.equal(result.totals.applicationMs,null);assert.ok(result.reasons.includes('APPLICATION_SOURCE_UNAVAILABLE'));
f=fixture({webFailure:true});result=await f.load('workers/src/services/computerUsage.ts').readComputerUsage(f.env,'account','child',date,date);assert.equal(result.totals.applicationMs,2000);assert.equal(result.totals.webMs,null);
f=fixture({failedDate:date});result=await f.load('workers/src/services/computerUsage.ts').readComputerUsage(f.env,'account','child',date,'2026-10-02');assert.equal(result.totals.webMs,3000);assert.equal(result.sourceStatus.web,'partial');assert.equal(result.sourceVersions.filter(source=>source.kind==='web').length,2);assert.equal(result.totals.applicationMs,2000);
f=fixture({owned:false});await assert.rejects(()=>f.load('workers/src/services/computerUsage.ts').readComputerUsage(f.env,'foreign','child',date,date),/CHILD_NOT_FOUND/);assert.equal(f.reads(),0);
for(const [a,b] of [['2026-02-30','2026-02-30'],['2026-10-01','2026-10-08'],['2026-10-02','2026-10-01']])assert.throws(()=>service.validateComputerUsageRange(a,b),/INVALID_RANGE/);
console.log('PASS cloud computer usage: original authority, ownership, failure isolation, mapping, version cache, filtering, privacy, range');
})().catch(error=>{console.error(error);process.exitCode=1;});
