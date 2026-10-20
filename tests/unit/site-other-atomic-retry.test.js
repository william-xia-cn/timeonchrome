// 隔离 SQLite 验证 D1 batch 的事务语义，不访问真实配置或账本。
const assert = require('node:assert/strict');
const {DatabaseSync} = require('node:sqlite');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const source = fs.readFileSync('workers/src/routes/siteClassificationRequests.ts','utf8');
const extract = (from,to)=>source.slice(source.indexOf(from),source.indexOf(to,source.indexOf(from)));
const code = extract('export function upsertOtherUsageClassificationRule','export function removeUsageClassificationRuleForTarget')
  + extract('export async function approveOtherSiteRequest','function rowToResponse');
const context={exports:{},rowToResponse:r=>r};
vm.runInNewContext(ts.transpileModule(code,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,context);
const approve=context.exports.approveOtherSiteRequest;
function fixture(){
 const sqlite=new DatabaseSync(':memory:');
 sqlite.exec(`CREATE TABLE profiles(id TEXT PRIMARY KEY,config TEXT,version INTEGER,updated_at INTEGER);
 CREATE TABLE site_classification_requests_v1(id TEXT PRIMARY KEY,profile_id TEXT,status TEXT,decision TEXT,
 decision_target_type TEXT,decision_normalized_value TEXT,decided_at INTEGER,updated_at INTEGER);
 CREATE TABLE ledger(value TEXT);INSERT INTO ledger VALUES('unchanged');
 CREATE TABLE history(version INTEGER);
 CREATE TRIGGER audit AFTER UPDATE ON profiles BEGIN INSERT INTO history VALUES(new.version); END;`);
 const original={studyList:['school.example'],unsafeList:['blocked.example'],siteClassificationRulesV1:[{decision:'study'}]};
 sqlite.prepare('INSERT INTO profiles VALUES(?,?,?,?)').run('child',JSON.stringify(original),4,0);
 sqlite.prepare("INSERT INTO site_classification_requests_v1(id,profile_id,status) VALUES('request','child','pending')").run();
 let fail=-1,race=false;
 const DB={
 prepare(sql){return {bind(...args){return {
  async first(){return sqlite.prepare(sql).get(...args)||null;},
  async run(){return {meta:{changes:Number(sqlite.prepare(sql).run(...args).changes)}};},
  sql,args,
 };}}},
 async batch(statements){
  if(race){race=false;sqlite.prepare("UPDATE profiles SET version=version+1,config=json_set(config,'$.concurrent',1) WHERE id='child'").run();}
  sqlite.exec('BEGIN');
  try{const results=[];for(let i=0;i<statements.length;i++){
   if(fail===i)throw new Error('injected SQL failure');
   results.push(await statements[i].run());
  }sqlite.exec('COMMIT');return results;}catch(error){sqlite.exec('ROLLBACK');throw error;}
 }};
 return {env:{DB},sqlite,original,setFail:i=>fail=i,setRace:()=>race=true,
  profile:()=>sqlite.prepare("SELECT * FROM profiles WHERE id='child'").get(),
  request:()=>sqlite.prepare("SELECT * FROM site_classification_requests_v1 WHERE id='request'").get()};
}
(async()=>{
 for(const failure of [0,1]){
  const f=fixture(),target={targetType:'host',normalizedValue:'example.test'};
  f.setFail(failure);
  await assert.rejects(approve(f.env,'child','request',target,100),/injected/);
  assert.equal(f.request().status,'pending');assert.equal(f.profile().version,4);
  assert.deepEqual(JSON.parse(f.profile().config),f.original);
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM history').get().n,0);
  f.setFail(-1);
  assert.equal((await approve(f.env,'child','request',target,200)).ok,true);
  assert.equal(f.request().status,'approved_other');assert.equal(f.profile().version,5);
  const {siteUsageClassificationRulesV1,...unchanged}=JSON.parse(f.profile().config);
  assert.deepEqual(unchanged,f.original);assert.equal(siteUsageClassificationRulesV1.length,1);
  assert.equal(siteUsageClassificationRulesV1[0].classification,'other');
  assert.equal((await approve(f.env,'child','request',target,300)).ok,true);
  assert.equal(f.profile().version,5,'重复提交不能重复发布版本');
  assert.equal((await approve(f.env,'child','request',{...target,normalizedValue:'different.test'},400)).status,409);
  assert.equal(f.sqlite.prepare('SELECT value FROM ledger').get().value,'unchanged');
  f.sqlite.close();
 }
 const f=fixture();f.setRace();
 assert.equal((await approve(f.env,'child','request',{targetType:'host',normalizedValue:'example.test'},100)).ok,true);
 assert.equal(JSON.parse(f.profile().config).concurrent,1,'CAS冲突后必须保留并发配置');
 assert.equal(f.profile().version,6);f.sqlite.close();
 assert.match(source,/return approveOtherSiteRequest\(env, input.profileId/);
 console.log('site-other-atomic-retry: PASS (两步失败、回滚、重试、幂等、并发、访问规则/原账不变)');
})().catch(error=>{console.error(error);process.exitCode=1;});
