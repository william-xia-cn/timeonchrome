const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const ts=require('typescript');
function extract(file,name,globals={}) {
  const source=ts.createSourceFile(file,fs.readFileSync(file,'utf8'),ts.ScriptTarget.Latest,true);
  const node=source.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text===name);
  assert.ok(node,name);
  const context=vm.createContext(globals);
  vm.runInContext(ts.transpileModule(node.getText(source).replace(/^export\s+/,''),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,context);
  return context[name];
}
const validate=extract('workers/src/routes/profiles.ts','validateCompositeReviewConfig');
assert.equal(validate({}),null);
for(const enabled of [true,false])assert.equal(validate({compositeReviewConfig:{enabled}}),null);
for(const value of [null,[],true,'true',{}, {enabled:1},{enabled:'true'},{enabled:false,extra:true},Object.create({enabled:true})]) {
  assert.ok(validate({compositeReviewConfig:value}));
}
// Execute the actual dispatch function with unrelated routers refusing matches.
const globals={URL,Response,PROFILE_STATS_ROUTE_RE:/^never$/,notificationSettingsRouter:{matches:()=>false},taskModuleRouter:{matches:()=>false},
  compositePageReviewsRouter:{matches:p=>p.includes('/composite-reviews/v1'),handle:async()=>new Response('denied',{status:401})}};
const route=extract('workers/src/index.ts','routeRequest',globals);
(async()=>{
  for(const path of ['/profiles/test/composite-reviews/v1','/device/composite-reviews/v1']) {
    assert.equal((await route(new Request('https://example.test'+path),{})).status,401);
  }
  const normalized=p=>fs.readFileSync(p,'utf8').replace(/^--.*$/gm,'').replace(/\s+/g,' ').trim();
  assert.equal(normalized('workers/migrations/032_composite_page_reviews.sql'),normalized('tests/fixtures/composite-page-evidence-schema.sql'));
  let cursor='', failCursor=false, notifications=0;
  const scanned=[], deleted=[];
  const profiles=Array.from({length:12},(_,i)=>({id:String(i).padStart(2,'0'),config:i===1?'invalid':JSON.stringify({compositeReviewConfig:{enabled:true}})}));
  const env={CONFIG_CACHE:{get:async()=>{if(failCursor)throw Error('private');return cursor;},put:async(_,value)=>{cursor=value;}},
    DB:{prepare:sql=>({bind:(value)=>({all:async()=>{
      if(sql.includes('FROM profiles')) {
        assert.match(sql,/ORDER BY id LIMIT 11$/);
        return {results:profiles.filter(p=>p.id>value).slice(0,11)};
      }
      assert.match(sql,/LIMIT 100$/);
      return {results:[{id:'bad'},{id:'good'}]};
    }})})}};
  const maintain=extract('workers/src/services/compositePageReviews.ts','maintainCompositeReviews',{
    DAY:86400000,reviewDate:x=>String(x),reviewEnabled:c=>c?.compositeReviewConfig?.enabled===true,
    scanCompositeReviews:async(_,id)=>{scanned.push(id);if(id==='00')throw Error('private');},
    deleteReviewDetails:async(_,id)=>{deleted.push(id);if(id==='bad')throw Error('private');},
    processCompositeNotifications:async()=>{notifications++;}
  });
  let summary=await maintain(env,1000000000);
  assert.equal(summary.profiles,10);assert.equal(summary.scanFailures,4);assert.equal(summary.cleanupFailures,1);
  assert.equal(cursor,'09');assert.equal(scanned.length,27);assert.ok(deleted.includes('good'));
  summary=await maintain(env,1000000000);
  assert.equal(summary.profiles,2);assert.equal(cursor,'');assert.equal(notifications,2);
  failCursor=true;
  summary=await maintain(env,1000000000);
  assert.equal(summary.cursorFailures,1);assert.equal(summary.profiles,0);assert.equal(notifications,3);
  assert.equal(deleted.filter(id=>id==='good').length,3);
  assert.ok(!JSON.stringify(summary).includes('private'));
  console.log('Composite receiver wiring, strict config and migration parity PASS (router auth stubbed)');
  console.log('Composite bounded maintenance, cursor wrap and independent cleanup/notification PASS (bindings stubbed)');
})().catch(e=>{console.error(e);process.exitCode=1;});
