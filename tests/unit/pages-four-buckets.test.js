const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const ts=require('typescript');
const html=fs.readFileSync('pages/index.html','utf8');
const script=[...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].map(m=>m[1]).join('\n');
const ast=ts.createSourceFile('page.js',script,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);
const functions=new Map(ast.statements.filter(ts.isFunctionDeclaration).map(n=>[n.name.text,n.getText(ast)]));
const names=['usageCategoryLabel','emptyCloudCategories','cloudClassificationCategory','cloudRowCategory',
 'cloudRowBorrowedRestSeconds','sumCloudRowsByCategory','buildCloudDailySeries','buildCloudHourlySeries','cloudUsageTimelineCategory',
 'usageExplanationSummary','unknownUsageIdentifier'];
const context={WebUsageBuckets:require('../../app-runtime-management/console/web-usage-buckets.js')};vm.createContext(context);vm.runInContext(names.map(n=>functions.get(n)).join('\n'),context);
const rows=[
 {date:'2026-10-20',hour:2,duration:60,quotaBucket:'study',targetClassificationAtTime:'study'},
 {date:'2026-10-20',hour:2,duration:120,quotaBucket:'composite',targetClassificationAtTime:'pending_composite'},
 {date:'2026-10-20',hour:2,duration:30,quotaBucket:'rest',targetClassificationAtTime:'pending_composite'},
 {date:'2026-10-20',hour:2,duration:40,quotaBucket:'other',targetClassificationAtTime:'other'},
];
const before=JSON.stringify(rows);
const plain=v=>JSON.parse(JSON.stringify(v));
const expected={study:60,composite:120,rest:30,other:40};
assert.deepEqual(plain(context.sumCloudRowsByCategory(rows)),expected);
assert.deepEqual(plain(context.buildCloudDailySeries(rows,['2026-10-20'])[0].categories),expected);
assert.deepEqual(plain(context.buildCloudHourlySeries(rows,'2026-10-20')[2].categories),expected);
assert.equal(context.cloudRowBorrowedRestSeconds(rows[2]),30,'借用说明保留，但只画在休息桶');
for(const row of rows)assert.equal(context.cloudUsageTimelineCategory({...row,quotaBucketAtTime:row.quotaBucket}),context.cloudRowCategory(row));
assert.deepEqual(['study','composite','rest','other'].map(context.usageCategoryLabel),['学习','复合','休息','其他']);
assert.equal(context.cloudRowCategory({quotaBucket:'unknown',targetClassificationAtTime:'study'}),null);
assert.deepEqual(plain(context.sumCloudRowsByCategory([...rows,{duration:99,quotaBucket:'unknown'}])),expected);
assert.match(html,/totalSeconds: Object\.values\(categoryTotals\).* \+ unknownBucketSeconds/,'缺失桶的既有用量仍保留在总量');
assert.equal(JSON.stringify(rows),before);
assert.equal(context.usageExplanationSummary({targetClassificationAtTime:'other'}).text,'其他');
assert.equal(context.usageExplanationSummary({}).text,'分类信息缺失');
assert.equal(context.usageExplanationSummary({targetClassificationAtTime:'invalid'}).text,'分类信息缺失');
console.log('pages-four-buckets: PASS (日/周/小时/时段、借用不重复、未知不冒充其他、输入不变)');
