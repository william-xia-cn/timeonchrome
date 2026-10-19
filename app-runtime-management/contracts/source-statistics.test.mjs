import assert from 'node:assert/strict';
import {sourceStatisticsDates} from './dist/source-statistics.js';
import {projectSharedAccessPolicyV2} from './dist/shared-access.js';
const date='2026-10-07';
const expected={source:'application',childId:'child-a',fromDate:date,toDate:date};
assert.deepEqual(sourceStatisticsDates('2026-10-05',date),['2026-10-05','2026-10-06',date]);
assert.throws(()=>sourceStatisticsDates('2026-02-30',date));
assert.throws(()=>sourceStatisticsDates('2026-09-01',date));
// 当前共享只消费已有桶，不保留来源清单、重复汇总或旧分类借用算法。
const bucketsContract=await import('./dist/source-statistics.js');
for(const obsolete of ['SOURCE_STATISTICS_READ_CAPABILITY','SOURCE_STATISTICS_EXCHANGE_MESSAGE',
  'validateSourceStatisticsQuery','validateSourceStatisticsSnapshot','validateSourceStatisticsExchange',
  'combineOwnAndOtherStatistics','projectSharedQuotaSeconds','projectIndependentSharedQuotaSeconds'])
  assert.equal(Object.hasOwn(bucketsContract,obsolete),false,`${obsolete}不得继续导出旧业务模型`);
const currentPolicy=projectSharedAccessPolicyV2({},34,1791310000000);
const currentLimited=structuredClone(currentPolicy);currentLimited.dailyMinutes.wednesday.composite=5;
function quotaBuckets(source,study=600){return {schemaVersion:2,durationUnit:'seconds',source,childId:'child-a',
  fromDate:date,toDate:date,readAtMs:1791320000000,days:[{date,bucketsSeconds:{study,composite:200,rest:100},
    settledThroughMs:null,complete:true,reasonCodes:[]}]};}
const qbWeb=quotaBuckets('web'),qbApp=quotaBuckets('application');
const cloudQuery={schemaVersion:2,source:'application',scope:'all',fromDate:date,toDate:date};
assert.deepEqual(bucketsContract.readQuotaBucketsCloudRequest(cloudQuery),{query:cloudQuery,includeSources:false});
const sideRequest=bucketsContract.readQuotaBucketsCloudRequest({...cloudQuery,includeSources:true,sourceProof:{malformed:true}});
assert.equal(sideRequest.includeSources,true,'坏证明仅用于可选侧车，不改变原合法查询');
assert.deepEqual(sideRequest.query,cloudQuery);
assert.throws(()=>bucketsContract.readQuotaBucketsCloudRequest({...cloudQuery,includeSources:true,childId:'foreign'}));
assert.throws(()=>bucketsContract.readQuotaBucketsCloudRequest({...cloudQuery,source:'web',includeSources:true}));
assert.throws(()=>bucketsContract.readQuotaBucketsCloudRequest({...cloudQuery,sourceProof:{}}));
assert.deepEqual(bucketsContract.readQuotaBucketsCloudResponse(qbApp,expected),{snapshot:qbApp,applicationSources:null});
const cloudSources={local:qbApp,other:null,otherState:'none'};
assert.deepEqual(bucketsContract.readQuotaBucketsCloudResponse({snapshot:qbApp,applicationSources:cloudSources},expected),
  {snapshot:qbApp,applicationSources:cloudSources});
for(const invalid of [{...cloudSources,otherState:'available'}, {...cloudSources,local:{...qbApp,childId:'foreign'}},
  {...cloudSources,local:{...qbApp,fromDate:'2026-10-06'}}]) {
  assert.deepEqual(bucketsContract.readQuotaBucketsCloudResponse({snapshot:qbApp,applicationSources:invalid},expected),
    {snapshot:qbApp,applicationSources:null},'坏侧车不损坏有效合计');
}
assert.throws(()=>bucketsContract.readQuotaBucketsCloudResponse({snapshot:{...qbApp,childId:'foreign'},applicationSources:cloudSources},expected));
assert.throws(()=>bucketsContract.validateQuotaBucketsSnapshot({...qbApp,applicationSources:cloudSources},expected),
  '新侧车不可塞入旧严格快照');
assert.equal(bucketsContract.validateQuotaBucketsSnapshot(qbApp,expected),qbApp);
assert.deepEqual(bucketsContract.applicationQuotaBucketsSeconds({study:600,composite:200,unclassified:10,restrictedEntertainment:100,other:900}),
  {study:600,composite:210,rest:100});
assert.deepEqual(bucketsContract.projectQuotaBucketsSeconds(currentLimited,date,qbWeb,qbApp).usedSeconds,{study:1200,composite:400,rest:200});
assert.equal(bucketsContract.projectQuotaBucketsSeconds(currentLimited,date,qbWeb,qbApp).borrowedRestSeconds,0,'已解释的桶不二次借用');
const missingQuota=bucketsContract.projectQuotaBucketsSeconds(currentLimited,date,qbWeb,null);
assert.equal(missingQuota.usedSeconds.study,600);assert.equal(missingQuota.complete,false);
assert.ok(missingQuota.reasonCodes.includes('APPLICATION_SOURCE_UNAVAILABLE'));
assert.equal(bucketsContract.projectQuotaBucketsSeconds(currentPolicy,date,qbWeb,quotaBuckets('application',10)).usedSeconds.study,610);
const currentInputs=JSON.stringify([currentLimited,qbWeb,qbApp]);
const currentQuota=bucketsContract.projectQuotaBucketsSeconds(currentLimited,date,qbWeb,qbApp);
assert.deepEqual(bucketsContract.projectQuotaBucketsSeconds(currentLimited,date,qbWeb,qbApp),currentQuota,'重复读取不累计');
assert.equal(JSON.stringify([currentLimited,qbWeb,qbApp]),currentInputs,'核算不得修改策略或来源桶');
assert.equal(currentQuota.remainingSeconds.composite,0);
assert.throws(()=>bucketsContract.projectQuotaBucketsSeconds(currentPolicy,date,qbWeb,{...qbApp,childId:'foreign'}),'跨孩子拒绝');
const anotherDay={...qbApp,fromDate:'2026-10-08',toDate:'2026-10-08',days:[{...qbApp.days[0],date:'2026-10-08'}]};
const absentDay=bucketsContract.projectQuotaBucketsSeconds(currentPolicy,date,qbWeb,anotherDay);
assert.deepEqual(absentDay.usedSeconds,qbWeb.days[0].bucketsSeconds,'另一日数据不得计入当天');
assert.ok(absentDay.reasonCodes.includes('APPLICATION_SOURCE_UNAVAILABLE'));
assert.equal(bucketsContract.validateQuotaBucketsExchange({fromDate:date,toDate:date,webUsage:qbWeb},'child-a').webUsage,qbWeb);
assert.throws(()=>bucketsContract.validateQuotaBucketsExchange({fromDate:date,toDate:date,webUsage:qbWeb},'other-child'));
assert.throws(()=>bucketsContract.validateQuotaBucketsSnapshot({...qbApp,revision:'redundant'},expected));
assert.throws(()=>bucketsContract.validateQuotaBucketsSnapshot({...qbApp,includedSourceKeys:['invented']},expected));
assert.throws(()=>bucketsContract.validateQuotaBucketsSnapshot({...qbApp,durationUnit:'milliseconds'},expected));
assert.throws(()=>bucketsContract.validateQuotaBucketsQuery({schemaVersion:2,source:'application',scope:'all',fromDate:date,toDate:date,ownSourceKeys:['invented']}));
assert.throws(()=>bucketsContract.validateQuotaBucketsSnapshot({...qbApp,days:[{...qbApp.days[0],bucketsSeconds:{study:0.5,composite:0,rest:0}}]},expected));
console.log('quota-buckets: direct buckets/1200s/missing-as-zero/decrease/no-reborrowing/child-scope/minimal-wire PASS');

// 来源说明只解释已存在读数；other未知不得污染本机完整性。
const sources = { local: qbApp, other: null, otherState: 'unknown' };
assert.equal(bucketsContract.validateQuotaBucketsSources(sources, expected), sources);
assert.equal(sources.local.days[0].complete, true);
assert.equal(bucketsContract.validateQuotaBucketsSources({ ...sources, otherState: 'none' }, expected).other, null);
assert.equal(bucketsContract.validateQuotaBucketsSources({ ...sources, local: null }, expected).local, null);
const otherZero = quotaBuckets('application', 0);
otherZero.days[0].bucketsSeconds = { study: 0, composite: 0, rest: 0 };
assert.equal(bucketsContract.validateQuotaBucketsSources({ ...sources, other: otherZero, otherState: 'available' }, expected).other, otherZero);
const otherPartial = structuredClone(otherZero);
otherPartial.days[0].complete = false; otherPartial.days[0].reasonCodes = ['SOURCE_PARTIAL'];
assert.equal(bucketsContract.validateQuotaBucketsSources({ ...sources, other: otherPartial, otherState: 'available' }, expected).local.days[0].complete, true);
for (const invalid of [
  { ...sources, otherState: 'available' }, { ...sources, other: qbApp },
  { ...sources, otherState: 'none', other: otherZero }, { ...sources, otherState: 'missing' },
  { ...sources, local: { ...qbApp, childId: 'foreign-child' } },
  { ...sources, local: { ...qbApp, source: 'web' } },
  { ...sources, local: { ...qbApp, fromDate: '2026-10-01' } },
  { ...sources, redundantTotal: 600 },
]) assert.throws(() => bucketsContract.validateQuotaBucketsSources(invalid, expected));
assert.equal(bucketsContract.QUOTA_BUCKETS_EXCHANGE_MESSAGE, 'exchangeQuotaBuckets');
assert.equal(bucketsContract.QUOTA_BUCKETS_SOURCES_CAPABILITY, 'quota-buckets-sources-v1');
console.log('quota-buckets sources: local independent/none vs zero/partial/child-range isolation/strict additive shape PASS');
