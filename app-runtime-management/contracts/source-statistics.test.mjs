import assert from 'node:assert/strict';
import { validateSourceStatisticsQuery, validateSourceStatisticsSnapshot, combineOwnAndOtherStatistics, sourceStatisticsDates,projectSharedQuotaSeconds,validateSourceStatisticsExchange } from './dist/source-statistics.js';
import {projectLegacySharedAccessPolicy} from './dist/shared-access.js';
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
assert.equal(projectSharedQuotaSeconds(policy,date,web,null).remainingSeconds.study,null);
assert.throws(()=>projectSharedQuotaSeconds(policy,date,web,{...snapshot('application','local'),childId:'other-child'}));
assert.equal(validateSourceStatisticsExchange({fromDate:date,toDate:date,webStatistics:web},'child-a').webStatistics.source,'web');
assert.throws(()=>validateSourceStatisticsExchange({fromDate:date,toDate:date,webStatistics:web},'other-child'));
console.log('source-statistics: focused validation/1200s/other/special/borrowing/partial/child-isolation assertions passed');
