const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const root = path.resolve(__dirname, '../..');
function load(file) {
  const module = {exports:{}};
  const source = ts.transpileModule(fs.readFileSync(path.join(root,file),'utf8'), {
    compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022},
  }).outputText;
  new Function('module','exports','require',source)(module,module.exports,name=>{
    const target=path.posix.normalize(path.posix.join(path.posix.dirname(file),name));
    assert.equal(target,'contracts/composite-page-evidence/v1.js');
    return load(target);
  });
  return module.exports;
}
const api=load('workers/src/services/compositePageAnalysis.js');
const segment={deviceId:'d',tabId:1,windowId:2,domain:'example.test',channel:'active',startMs:0,endMs:3000,durationSeconds:2};
const observation=(startMs,endMs,name)=>({deviceId:'d',tabId:1,windowId:2,startMs,endMs,lastObservedAt:endMs,page:{host:'example.test',path:name,title:'Public'}});
const evidence=[observation(0,1000,'/a'),observation(1000,3000,'/b')];
const before=JSON.stringify({segment,evidence});
const result=api.attributeCompositePages([segment],evidence);
assert.equal(result.totalSeconds,2);
assert.equal(result.pages.reduce((sum,p)=>sum+p.seconds,0)+result.unassignedSeconds,2);
assert.deepEqual(result.pages.map(p=>[p.path,p.seconds]),[['/a',1],['/b',1]]);
assert.equal(JSON.stringify({segment,evidence}),before);
const ambiguous=api.attributeCompositePages([segment],[observation(0,3000,'/a'),observation(0,3000,'/b')]);
assert.equal(ambiguous.unassignedSeconds,2);assert.equal(ambiguous.pages.length,0);
const foreign=api.attributeCompositePages([segment],[{...observation(0,3000,'/a'),deviceId:'other'}]);
assert.equal(foreign.unassignedSeconds,2);
const expired=api.attributeCompositePages([{...segment,endMs:120000,durationSeconds:120}],
  [{...observation(0,120000,'/a'),lastObservedAt:0}]);
assert.equal(expired.pages[0].seconds,90);assert.equal(expired.unassignedSeconds,30);
const row={kind:'daily_target',channel:'active',targetClassificationAtTime:'composite',managedTargetType:'domain',managedTargetValue:'www.example.test',durationSeconds:1800};
const groups=api.compositeReviewCandidates([{deviceId:'d',rows:[row,{...row,isFallback:true},{...row,channel:'media'},{...row,targetClassificationAtTime:'study'}]}]);
assert.equal(groups.length,1);assert.equal(groups[0].totalSeconds,api.COMPOSITE_REVIEW_THRESHOLD_SECONDS);
assert.equal(groups[0].site,'example.test');
console.log('Composite analysis PASS: integer conservation, ambiguity, evidence expiry, isolation, candidate filtering; no ledger writes');
