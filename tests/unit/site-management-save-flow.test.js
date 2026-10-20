// 完整业务模块；默认匹配现场仍保留唯一键的表，另验已应用015的结构。
// 仅内存 SQLite，不执行生产迁移。
const assert = require('node:assert/strict');
const {DatabaseSync} = require('node:sqlite');
const fs = require('node:fs');
const vm = require('node:vm');
const {buildSync} = require('../../app-runtime-management/backend/node_modules/esbuild');
const code = buildSync({entryPoints:['workers/src/routes/siteClassificationRequests.ts'],bundle:true,
  platform:'node',format:'cjs',write:false}).outputFiles[0].text;
const moduleObject={exports:{}};
vm.runInNewContext(code,{module:moduleObject,exports:moduleObject.exports,require,console,URL,Response,Request,crypto,TextEncoder,atob,btoa});
const api=moduleObject.exports;
const db=new DatabaseSync(':memory:');
db.exec('CREATE TABLE profiles(id TEXT PRIMARY KEY,config TEXT,version INTEGER,updated_at INTEGER,account_id TEXT);');
const migrated=process.argv.includes('--migrated-schema');
for(const file of ['009_site_classification_requests_v1.sql',
  ...(migrated?['015_site_classification_returned_requests.sql']:[]),'016_site_classification_record_semantics.sql']){
  db.exec(fs.readFileSync('workers/migrations/'+file,'utf8'));
}
db.prepare('INSERT INTO profiles VALUES(?,?,1,0,?)').run('child',JSON.stringify({studyList:[],unsafeList:['blocked.example']}),'fixture-account');
const DB={prepare(sql){const statement={args:[],bind(...args){this.args=args;return this;},
  async first(){return db.prepare(sql).get(...this.args)||null;},
  async all(){return {results:db.prepare(sql).all(...this.args)};},
  async run(){return {meta:{changes:Number(db.prepare(sql).run(...this.args).changes)}};}};
  return statement;},
 async batch(items){db.exec('BEGIN');try{const out=[];for(const item of items)out.push(await item.run());db.exec('COMMIT');return out;}catch(e){db.exec('ROLLBACK');throw e;}}};
(async()=>{
 const secret=crypto.randomUUID(),env={DB,JWT_SECRET:secret};
 const unsigned=Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url')+'.'+
  Buffer.from(JSON.stringify({account_id:'fixture-account',exp:Math.floor(Date.now()/1000)+600})).toString('base64url');
 const token=unsigned+'.'+require('node:crypto').createHmac('sha256',secret).update(unsigned).digest('base64url');
 const request=async(path,body)=>{
  const response=await api.siteClassificationRequestsRouter.handle(new Request('https://fixture.test/profiles/child/'+path,{
   method:body?'POST':'GET',headers:{authorization:'Bearer '+token,'content-type':'application/json'},body:body?JSON.stringify(body):undefined}),env);
  assert.equal(response.status,200);return response.json();
 };
 for(const domain of ['extension-page.chrome-local','127.0.0.1','another.example']){
  const first=await request('site-classification-requests/v1/ensure',{domain});
  assert.equal(first.ok,true);assert.equal(first.created,true);
  const repeat=await api.ensureUnclassifiedSiteRequest(env,'child',{domain});
  assert.equal(repeat.request.id,first.request.id);
  const saved=await request(`site-classification-requests/${first.request.id}/decision`,{decision:'other'});
  assert.equal(saved.ok,true);
  const beforeConfig=db.prepare('SELECT config,version FROM profiles').get();
  const beforeRows=db.prepare('SELECT * FROM site_classification_requests_v1 ORDER BY id').all();
  // 页面残留的“未归类”入口再次请求创建，必须读到当前other，而不是重复INSERT触发500。
  for(let retry=0;retry<2;retry++){
   const ensured=await request('site-classification-requests/v1/ensure',{domain});
   assert.equal(ensured.alreadyClassified,true);
   assert.equal(ensured.currentClassification,'other');
  }
  assert.deepEqual(db.prepare('SELECT config,version FROM profiles').get(),beforeConfig);
  assert.deepEqual(db.prepare('SELECT * FROM site_classification_requests_v1 ORDER BY id').all(),beforeRows);
  assert.equal((await api.decideSiteClassificationRequest(env,{profileId:'child',requestId:first.request.id,decision:'other'})).ok,true);
  assert.equal((await request('site-classification-requests/v1?status=pending')).requests.length,0);
  // 旧待处理状态不代表当前还需归类；仅过滤视图，不改历史记录。
  db.prepare("UPDATE site_classification_requests_v1 SET status='pending' WHERE id=?").run(first.request.id);
  assert.equal((await request('site-classification-requests/v1?status=pending')).requests.length,0);
  assert.equal(db.prepare('SELECT status FROM site_classification_requests_v1 WHERE id=?').get(first.request.id).status,'pending');
 }
 assert.deepEqual(JSON.parse(db.prepare('SELECT config FROM profiles').get().config).unsafeList,['blocked.example']);
 db.close();console.log('PASS 网站完整创建/重试/其他归类/重复操作，'+(migrated?'015后结构':'生产唯一键结构'));
})().catch(error=>{console.error(error);process.exitCode=1;});
