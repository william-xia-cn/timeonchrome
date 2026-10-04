const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const strip = text => text.replace(/^import .*?;$/gm, '').replace(/export /g, '');
const quotaSource = strip(fs.readFileSync('extension/core/quota-read-model-v2.js', 'utf8'));
const projection = new Function(`${quotaSource};return buildLocalQuotaProjectionV2;`)();
const profileSource = ts.createSourceFile('profile.js', fs.readFileSync('extension/core/profile-account-v2.js', 'utf8'), ts.ScriptTarget.Latest, true);
const periodFunctions = profileSource.statements.filter(n => ts.isFunctionDeclaration(n) && ['dateFromUtcMs', 'getBeijingWeekPeriod'].includes(n.name?.text));
const period = new Function(`const DAY_MS=86400000;${periodFunctions.map(n => n.getText(profileSource).replace('export ', '')).join('\n')};return getBeijingWeekPeriod;`)();
const source = strip(fs.readFileSync('extension/stats/rest-usage-summary.js', 'utf8'));
let storage, app, failWeb=false, failApp=false, appOptions;
const chrome = {storage:{local:{get:async () => {if(failWeb)throw new Error('unavailable');return storage;}}}};
const readApp = async options => {appOptions=options;if(failApp)throw new Error('unavailable');return app;};
const {readRestUsageSummary} = new Function('buildLocalQuotaProjectionV2','getBeijingWeekPeriod','getAdminApplicationUsageAnalysisView','chrome',
  `${source};return {readRestUsageSummary};`)(projection,period,readApp,chrome);
const now=Date.parse('2026-10-04T23:59:00+08:00');
const day = seconds => ({domains:{fixture:{activeSeconds:seconds+20,backgroundMediaSeconds:900,pipSeconds:800}},
  targets:{borrowed:{activeByQuotaBucket:{rest:seconds,study:20}}}});
function appView(date='2026-10-04') {
  return {range:{from:date,to:date},totalSeconds:10000,categoryTotals:{app_restrictedEntertainment:90.5,app_study:9000},
    weekSummarySeries:Array.from({length:7},()=>({totalSeconds:10000,categories:{app_restrictedEntertainment:30.5,app_study:9000}}))};
}
async function run(){
  storage={daily_usage_stats_v1:{'2026-09-28':day(100),'2026-10-04':day(200),'2026-09-27':day(9000)}};app=appView();
  let result=await readRestUsageSummary({now});
  assert.equal(result.today.webSeconds,200);assert.equal(result.week.webSeconds,300);
  assert.equal(result.today.applicationSeconds,90.5);assert.equal(result.today.totalSeconds,290.5);
  assert.equal(result.week.applicationSeconds,213.5);assert.equal(result.week.totalSeconds,513.5);
  assert.equal(appOptions.date,'2026-10-04');assert.equal(appOptions.mode,'day');
  app.weekSummarySeries.forEach(row=>row.totalSeconds=null);
  result=await readRestUsageSummary({now});assert.equal(result.today.totalSeconds,290.5);assert.equal(result.week.totalSeconds,null);
  assert.equal(result.week.webSeconds,300);
  failApp=true;result=await readRestUsageSummary({now});assert.equal(result.today.applicationSeconds,null);assert.equal(result.today.webSeconds,200);
  failApp=false;app=appView();failWeb=true;result=await readRestUsageSummary({now});assert.equal(result.today.webSeconds,null);assert.equal(result.today.applicationSeconds,90.5);
  failWeb=false;storage={};result=await readRestUsageSummary({now});assert.equal(result.today.webSeconds,null);
  storage={daily_usage_stats_v1:{}};app=appView('2026-10-05');app.categoryTotals={};app.totalSeconds=0;app.weekSummarySeries.forEach(row=>{row.totalSeconds=0;row.categories={};});
  result=await readRestUsageSummary({now:Date.parse('2026-10-04T16:00:00Z')});
  assert.equal(result.date,'2026-10-05');assert.equal(result.weekStart,'2026-10-05');assert.equal(result.today.totalSeconds,0);assert.equal(result.week.totalSeconds,0);
  assert.doesNotMatch(source,/storage\.local\.set|budgetedLocalSet|usage_segments_v1|cloudSnapshot|locked/);
  console.log('Rest usage title summary: PASS (local buckets, borrowing, application category, partial, zero, Beijing day/week)');
}
run().catch(error=>{console.error(error);process.exitCode=1;});
