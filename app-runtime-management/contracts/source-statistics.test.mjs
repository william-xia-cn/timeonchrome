import assert from 'node:assert/strict';
import { validateSourceStatisticsQuery, validateSourceStatisticsSnapshot, combineOwnAndOtherStatistics, sourceStatisticsDates,projectSharedQuotaSeconds,validateSourceStatisticsExchange } from './dist/source-statistics.js';
import {projectLegacySharedAccessPolicy} from './dist/shared-access.js';
import {projectIndependentSharedQuotaSeconds} from './dist/source-statistics.js';
const date='2026-10-07';
function snapshot(source,key,total=600,excluded=[]) { return {schemaVersion:1,durationUnit:'seconds',source,childId:'child-a',fromDate:date,toDate:date,
  revision:`${key}:${total}`,readAtMs:1791320000000,includedSourceKeys:key?[key]:[],excludedSourceKeys:excluded,
  days:[{date,totalSeconds:total,categoriesSeconds:{study:total},...(source==='application'?{nonSpecialTotalSeconds:total}:{}),settledThroughMs:1791310000000,complete:true,reasonCodes:[]}]}; }
const expected={source:'application',childId:'child-a',fromDate:date,toDate:date};
assert.deepEqual(sourceStatisticsDates('2026-10-05',date),['2026-10-05','2026-10-06',date]);
assert.throws(()=>sourceStatisticsDates('2026-02-30',date));
assert.throws(()=>sourceStatisticsDates('2026-09-01',date));
assert.throws(()=>validateSourceStatisticsQuery({source:'application',scope:'all',fromDate:date,toDate:date,childId:'foreign'}));
assert.throws(()=>validateSourceStatisticsQuery({source:'application',scope:'other',fromDate:date,toDate:date}));
assert.equal(validateSourceStatisticsSnapshot(snapshot('application','local'),expected).days[0].totalSeconds,600);
assert.throws(()=>validateSourceStatisticsSnapshot(snapshot('application','local'),{...expected,childId:'other-child'}));
const other=snapshot('application','other',600,['local']);
assert.equal((await combineOwnAndOtherStatistics(snapshot('application','local'),other)).days[0].totalSeconds,1200);
// 云端无需本机旧副本；排除范围仅表达请求者实际包含的来源。
assert.equal((await combineOwnAndOtherStatistics(snapshot('application','local'),snapshot('application','',0,['local']))).days[0].totalSeconds,600);
await assert.rejects(()=>combineOwnAndOtherStatistics(snapshot('application','local'),snapshot('application','local')));
const changed=snapshot('application','other',10,['local']);
assert.equal((await combineOwnAndOtherStatistics(snapshot('application','local'),changed)).days[0].totalSeconds,610);
const unknown=snapshot('application','',null,['local']); Object.assign(unknown.days[0],{categoriesSeconds:{},nonSpecialTotalSeconds:null,settledThroughMs:null,complete:false,reasonCodes:['SOURCE_UNAVAILABLE']});
const partial=await combineOwnAndOtherStatistics(snapshot('application','local'),unknown);
assert.equal(partial.days[0].totalSeconds,600);assert.equal(partial.days[0].complete,false);
const special=snapshot('application','special',600);Object.assign(special.days[0],{nonSpecialTotalSeconds:0,categoriesSeconds:{}});
assert.equal(validateSourceStatisticsSnapshot(special,expected).days[0].nonSpecialTotalSeconds,0);
const malformed=snapshot('application','bad');malformed.days[0].totalSeconds=0.5;
assert.throws(()=>validateSourceStatisticsSnapshot(malformed,expected));
assert.throws(()=>validateSourceStatisticsSnapshot({...snapshot('application','local'),durationUnit:'milliseconds'},expected));
const web=snapshot('web','browser');
assert.equal(validateSourceStatisticsSnapshot(web,{...expected,source:'web'}).days[0].categoriesSeconds.study,600);
assert.equal(web.days[0].categoriesSeconds.study+special.days[0].nonSpecialTotalSeconds,600);
const policy=projectLegacySharedAccessPolicy({},34,1791310000000);
assert.equal(projectSharedQuotaSeconds(policy,date,web,snapshot('application','local')).usedSeconds.study,1200);
assert.equal(projectSharedQuotaSeconds(policy,date,web,special).usedSeconds.study,600);
const ordinaryOther=snapshot('application','other-app');ordinaryOther.days[0].categoriesSeconds={other:600};
assert.equal(projectSharedQuotaSeconds(policy,date,web,ordinaryOther).usedSeconds.study,600);
const limited=structuredClone(policy);limited.dailyMinutes.wednesday.composite=5;
const wb=snapshot('web','browser');wb.days[0].categoriesSeconds={composite:200,rest:100};
const ab=snapshot('application','local');ab.days[0].categoriesSeconds={composite:200,unclassified:100};
const quota=projectSharedQuotaSeconds(limited,date,wb,ab);
assert.deepEqual(quota.usedSeconds,{study:0,composite:300,rest:300});assert.equal(quota.borrowedRestSeconds,200);
const independent=projectIndependentSharedQuotaSeconds(limited,date,wb,ab);
assert.deepEqual(independent.usedSeconds,{study:0,composite:500,rest:100});
assert.equal(independent.borrowedRestSeconds,0);
assert.equal(independent.remainingSeconds.composite,0);
assert.equal(projectIndependentSharedQuotaSeconds(policy,date,web,snapshot('application','local')).usedSeconds.study,1200);
assert.equal(projectIndependentSharedQuotaSeconds(policy,date,web,special).usedSeconds.study,600);
assert.equal(projectIndependentSharedQuotaSeconds(policy,date,web,ordinaryOther).usedSeconds.study,600);
assert.equal(projectIndependentSharedQuotaSeconds(policy,date,web,null).remainingSeconds.study,null);
assert.throws(()=>projectIndependentSharedQuotaSeconds(policy,date,web,{...snapshot('application','local'),childId:'other-child'}));
assert.deepEqual(projectIndependentSharedQuotaSeconds(limited,date,wb,ab),independent);
const corrected=structuredClone(ab);corrected.days[0].categoriesSeconds={composite:20,unclassified:10};
assert.equal(projectIndependentSharedQuotaSeconds(limited,date,wb,corrected).usedSeconds.composite,230);
assert.equal(projectSharedQuotaSeconds(policy,date,web,null).remainingSeconds.study,null);
assert.throws(()=>projectSharedQuotaSeconds(policy,date,web,{...snapshot('application','local'),childId:'other-child'}));
assert.equal(validateSourceStatisticsExchange({fromDate:date,toDate:date,webStatistics:web},'child-a').webStatistics.source,'web');
assert.throws(()=>validateSourceStatisticsExchange({fromDate:date,toDate:date,webStatistics:web},'other-child'));
console.log('source-statistics: focused validation/1200s/other/special/borrowing/partial/child-isolation assertions passed');

// 新共享只消费已有桶；旧v1用例保留兼容，不通过改名把分类冒充桶。
const bucketsContract=await import('./dist/source-statistics.js');
function quotaBuckets(source,study=600){return {schemaVersion:2,durationUnit:'seconds',source,childId:'child-a',
  fromDate:date,toDate:date,readAtMs:1791320000000,days:[{date,bucketsSeconds:{study,composite:200,rest:100},
    settledThroughMs:null,complete:true,reasonCodes:[]}]};}
const qbWeb=quotaBuckets('web'),qbApp=quotaBuckets('application');
assert.equal(bucketsContract.validateQuotaBucketsSnapshot(qbApp,expected),qbApp);
assert.deepEqual(bucketsContract.applicationQuotaBucketsSeconds({study:600,composite:200,unclassified:10,restrictedEntertainment:100,other:900}),
  {study:600,composite:210,rest:100});
assert.deepEqual(bucketsContract.projectQuotaBucketsSeconds(limited,date,qbWeb,qbApp).usedSeconds,{study:1200,composite:400,rest:200});
assert.equal(bucketsContract.projectQuotaBucketsSeconds(limited,date,qbWeb,qbApp).borrowedRestSeconds,0,'已解释的桶不二次借用');
const missingQuota=bucketsContract.projectQuotaBucketsSeconds(limited,date,qbWeb,null);
assert.equal(missingQuota.usedSeconds.study,600);assert.equal(missingQuota.complete,false);
assert.ok(missingQuota.reasonCodes.includes('APPLICATION_SOURCE_UNAVAILABLE'));
assert.equal(bucketsContract.projectQuotaBucketsSeconds(policy,date,qbWeb,quotaBuckets('application',10)).usedSeconds.study,610);
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
