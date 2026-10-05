import assert from 'node:assert/strict';
import fs from 'node:fs';
import { projectLocalSharedQuotaExecution, assembleSharedQuotaExecutionPages, sharedQuotaReminderContinuityV1 } from './dist/shared-quota-execution.js';
import { sharedAccessAdmissionV1, createSharedAccessPolicyIdentityV1 } from './dist/shared-access.js';
const vectors = JSON.parse(fs.readFileSync(new URL('./shared-quota-execution.vectors.json', import.meta.url)));
const clone = value => structuredClone(value);
const weekdays = ['monday','tuesday','wednesday','thursday','friday','saturday','sunday'];
const policy = { schemaVersion:1, revision:vectors.policyRevision, effectiveAtMs:1, stage:'shadow',
  dailyMinutes:Object.fromEntries(weekdays.map(day => [day, clone(vectors.dailyLimitsMinutes)])),
  weeklyRestMinutes:vectors.weeklyRestMinutes,
  timeWindows:Object.fromEntries(weekdays.map(day => [day,{study:null,composite:null,rest:null}])),
  autonomy:{restrictedEntryConfirmationRequired:true,dailyFirstReminderMinutes:5,weeklyFirstReminderMinutes:10,
    repeatReminderMinutes:5,softReminderTimeoutAction:'continue',visibleResponseDeadlineSeconds:60} };
function basis() {
  return {schemaVersion:1,revision:vectors.basisRevision,policyRevision:policy.revision,
    fromDate:vectors.dates[0],toDate:vectors.dates.at(-1),days:vectors.dates.map(date => ({date,reasonCodes:[],
      sources:vectors.sourceEntries.map(entry => ({...clone(entry),contribution:{...clone(entry.contribution),date}}))}))};
}
const admissionPolicy = {...clone(policy),revision:'profile-config:1'};
for (const vector of vectors.admissionCases) {
  const activePolicy = clone(admissionPolicy);
  const nature = vector.category === 'restrictedEntertainment' ? 'rest'
    : ['composite','unclassified'].includes(vector.category) ? 'composite' : 'study';
  activePolicy.timeWindows.tuesday[nature] = vector.windows;
  activePolicy.timeWindows.tuesday.rest = nature === 'rest' ? vector.windows : [{start:'00:00',end:'00:01'}];
  const day = {date:'2026-09-29',complete:vector.complete??true,reasonCodes:[],usedMs:{study:0,composite:0,rest:0},
    remainingMs:{study:vector.study??1,composite:vector.composite??1,rest:vector.rest??1},borrowedRestMs:0};
  assert.deepEqual(sharedAccessAdmissionV1(activePolicy,day,{complete:true,restRemainingMs:vector.weekRest??1},
    vector.category,vector.minute,vector.objectAllowed??true),
    {decision:vector.decision,reasonCode:vector.reason,quotaBucket:vector.bucket},vector.name);
}
const continuityIdentity = await createSharedAccessPolicyIdentityV1(admissionPolicy);
for (const vector of vectors.continuityCases) {
  const old = {scopeRevision:'verified-assignment-target',policyIdentity:continuityIdentity,
    fromDate:vectors.dates[0],toDate:vectors.dates.at(-1),sources:basis().days.flatMap(day=>day.sources)};
  // Bind the fixture's policy identity, without changing any real source.
  old.sources.forEach(entry=>entry.contribution.policyRevision=admissionPolicy.revision);
  const next=clone(old), entry=next.sources.at(-1);
  entry.revisionOrdinal++; entry.contribution.revision='next';
  entry.contribution.statisticsRevision='next-statistics'; entry.contribution.applicationClassesMs.composite++;
  if(vector.change==='reorder')next.sources.reverse();
  if(vector.change==='lower')entry.contribution.applicationClassesMs.study=0;
  if(vector.change==='correction')entry.contribution.correctionRevision='new-correction';
  if(vector.change==='association')entry.contribution.productAssociationVersion='new-products';
  if(vector.change==='missing')next.sources.pop();
  if(vector.change==='scope')next.scopeRevision='changed-assignment';
  if(vector.change==='policy')next.policyIdentity.policyHash='b'.repeat(64);
  if(vector.change==='incomplete'){entry.contribution.complete=false;entry.contribution.reasonCodes=['MISSING'];}
  if(vector.change==='ordinal')entry.revisionOrdinal=0;
  if(vector.change==='conflict')entry.revisionOrdinal=old.sources.at(-1).revisionOrdinal;
  if(vector.change==='settlement')entry.contribution.settledAtMs=0;
  const before=JSON.stringify({old,next});
  assert.equal(sharedQuotaReminderContinuityV1(old,next),vector.expected,vector.name);
  assert.equal(JSON.stringify({old,next}),before,'continuity does not rewrite sources');
}
console.log(`admission/continuity: PASS (${vectors.admissionCases.length}/${vectors.continuityCases.length} common vectors)`);
for (const vector of vectors.cases) {
  const input = basis(), before = JSON.stringify(input), scopes = [], replacements = [];
  if (vector.source) {
    const entry = input.days.at(-1).sources.find(entry => entry.contribution.source === vector.source);
    replacements.push({basisRevision:vector.basisRevision || input.revision,
      expectedPublicationRevision:vector.expectedPublicationRevision || entry.publicationRevision,
      revisionOrdinal:vector.ordinal,contribution:{...clone(entry.contribution),...clone(vector.patch || {})}});
    if (!vector.unauthorized) scopes.push({source:vector.source,sourceKey:entry.contribution.sourceKey,date:input.toDate});
  }
  if (vector.error) assert.throws(() => projectLocalSharedQuotaExecution(policy,input,replacements,scopes),
    error => error.message === vector.error, vector.name);
  else {
    const result = projectLocalSharedQuotaExecution(policy,input,replacements,scopes);
    assert.equal(result.complete,true,vector.name);
    assert.deepEqual(result.days.at(-1).usedMs,{study:vector.expectedStudyMs,composite:vector.expectedCompositeMs,rest:vector.expectedRestMs},vector.name);
    assert.equal(result.week.restUsedMs,vector.expectedWeekRestMs,vector.name);
    assert.deepEqual(result,projectLocalSharedQuotaExecution(policy,input,replacements,scopes),'same replacement is deterministic');
  }
  assert.equal(JSON.stringify(input),before,'source basis is immutable');
}
const input = basis(), original = clone(input);
input.days[0].reasonCodes.push('OTHER_DEVICE_UNAVAILABLE');
assert.equal(projectLocalSharedQuotaExecution(policy,input,[],[]).complete,false,'global coverage gaps cannot disappear');
assert.throws(() => projectLocalSharedQuotaExecution(policy,{...original,days:original.days.slice(1)},[],[]),/INVALID_EXECUTION_PERIOD/);
assert.throws(() => projectLocalSharedQuotaExecution(policy,{...original,fromDate:'2026-09-29'},[],[]),/INVALID_EXECUTION_PERIOD/);
const duplicate = clone(original); duplicate.days[0].sources.push(clone(duplicate.days[0].sources[0]));
assert.throws(() => projectLocalSharedQuotaExecution(policy,duplicate,[],[]),/DUPLICATE_EXECUTION_SOURCE/);
const old = clone(original); old.days[1].sources[1].revisionOrdinal = 3;
const entry = old.days[1].sources[1];
const scope = {source:'application',sourceKey:entry.contribution.sourceKey,date:old.toDate};
const replacement = {basisRevision:old.revision,expectedPublicationRevision:entry.publicationRevision,
  revisionOrdinal:2,contribution:clone(entry.contribution)};
const statisticsBasis=clone(old), statisticsEntry=statisticsBasis.days[1].sources[1];
statisticsEntry.publicationRevision='application-statistics:3:statistics-hash';
statisticsEntry.contribution.revision=statisticsEntry.publicationRevision;
const statisticsReplacement={...replacement,expectedPublicationRevision:statisticsEntry.publicationRevision,revisionOrdinal:4,
  contribution:{...clone(statisticsEntry.contribution),revision:'application-statistics:4:new-statistics-hash'}};
assert.equal(projectLocalSharedQuotaExecution(policy,statisticsBasis,[statisticsReplacement],[scope]).complete,true,
  'latest local statistics can replace its own older cloud statistics without a separate publication ordinal');
assert.throws(()=>projectLocalSharedQuotaExecution(policy,old,[{...statisticsReplacement,expectedPublicationRevision:entry.publicationRevision}],[scope]),
  /EXECUTION_SOURCE_VERSION_DOMAIN_CHANGED/,'legacy contribution ordinal is never compared with a statistics ordinal');
assert.throws(() => projectLocalSharedQuotaExecution(policy,old,[replacement],[scope]),/EXECUTION_SOURCE_CONTEXT_CHANGED/);
assert.throws(() => projectLocalSharedQuotaExecution(policy,old,[{...replacement,revisionOrdinal:4},{...replacement,revisionOrdinal:4}],[scope]),/DUPLICATE_EXECUTION_REPLACEMENT/);
assert.throws(() => projectLocalSharedQuotaExecution(policy,original,[],[{...scope,childId:'other'}]),/INVALID_EXECUTION_SCOPE/);
assert.throws(() => projectLocalSharedQuotaExecution(policy,original,[],[{...scope,date:'2026-09-30'}]),/INVALID_EXECUTION_SCOPE/);
const missingSource = {...replacement,revisionOrdinal:4,contribution:{...entry.contribution,sourceKey:'missing-source'}};
assert.throws(() => projectLocalSharedQuotaExecution(policy,old,[missingSource],
  [{...scope,sourceKey:'missing-source'}]),/EXECUTION_SOURCE_VERSION_CHANGED/);
const wrongDate = {...replacement,revisionOrdinal:4,contribution:{...entry.contribution,date:'2026-09-28'}};
assert.throws(() => projectLocalSharedQuotaExecution(policy,old,[wrongDate],[scope]),/UNAUTHORIZED_EXECUTION_SOURCE/);
const privateField = clone(original); privateField.days[0].sources[0].contribution.url = 'https://private.invalid/';
assert.throws(() => projectLocalSharedQuotaExecution(policy,privateField,[],[]),/INVALID_EXECUTION_CONTRIBUTION/);
const fractionalWeb = clone(original); fractionalWeb.days[0].sources[0].contribution.bucketsMs.study = 1001;
assert.throws(() => projectLocalSharedQuotaExecution(policy,fractionalWeb,[],[]),/INVALID_EXECUTION_WEB_CONTRIBUTION/);
console.log(`shared quota execution: PASS (${vectors.cases.length} common vectors + scope/period/coverage/immutability)`);

const transportBasis = basis(); transportBasis.revision = 'a'.repeat(64);
const transportEntries = transportBasis.days.flatMap(day => day.sources);
const ownScopes = transportBasis.days.map(day => ({source:'web',sourceKey:day.sources[0].contribution.sourceKey,date:day.date}));
const pages = [0,3].map(offset => ({schemaVersion:1,profileId:'fixture-child',basisRevision:transportBasis.revision,
  policyRevision:policy.revision,fromDate:transportBasis.fromDate,toDate:transportBasis.toDate,
  days:transportBasis.days.map(day => ({date:day.date,reasonCodes:day.reasonCodes,sourceCount:day.sources.length})),
  authorizedScopes:ownScopes,page:{offset,limit:3,total:4,nextOffset:offset===0?3:null,items:transportEntries.slice(offset,offset+3)}}));
const beforePages = JSON.stringify(pages);
assert.deepEqual(assembleSharedQuotaExecutionPages(policy,'fixture-child',pages),{basis:transportBasis,authorizedScopes:ownScopes});
assert.equal(JSON.stringify(pages),beforePages,'transport input remains immutable');
const isolated = assembleSharedQuotaExecutionPages(policy,'fixture-child',pages); isolated.basis.days[0].sources[0].revisionOrdinal++;
assert.equal(JSON.stringify(pages),beforePages,'returned basis does not alias transport input');
const rejectPage = (mutate,error) => { const bad=clone(pages); mutate(bad); assert.throws(() => assembleSharedQuotaExecutionPages(policy,'fixture-child',bad),error); };
assert.throws(() => assembleSharedQuotaExecutionPages(policy,'another-child',pages),/INVALID_EXECUTION_PAGE/);
assert.throws(() => assembleSharedQuotaExecutionPages(policy,'fixture-child',pages.slice(0,1)),/INCOMPLETE_EXECUTION_PAGES/);
rejectPage(p => p[1].basisRevision='b'.repeat(64),/EXECUTION_PAGE_CONTEXT_CHANGED/);
rejectPage(p => p[1].page.offset=0,/INVALID_EXECUTION_PAGE/);
rejectPage(p => p[0].page.nextOffset=2,/INCOMPLETE_EXECUTION_PAGES/);
rejectPage(p => p[1].page.items=[],/INVALID_EXECUTION_PAGE_COUNT/);
rejectPage(p => p.forEach(page => page.days[0].sourceCount=1),/INVALID_EXECUTION_COVERAGE/);
rejectPage(p => p.forEach(page => page.authorizedScopes[0].sourceKey='unrelated'),/INVALID_EXECUTION_SCOPE/);
rejectPage(p => p[0].token='private',/INVALID_EXECUTION_PAGE/);
rejectPage(p => p[0].page.items[0].contribution.url='private',/INVALID_EXECUTION_CONTRIBUTION/);
rejectPage(p => p[0].page.items[0].revisionOrdinal=1.5,/INVALID_EXECUTION_SOURCE/);
rejectPage(p => p[0].page.items[0].contribution.date='2026-09-29',/INVALID_EXECUTION_COVERAGE/);
rejectPage(p => p[1].policyRevision='different',/INVALID_EXECUTION_PAGE/);
const empty = clone(pages[0]); empty.page={offset:0,limit:100,total:0,nextOffset:null,items:[]};
empty.authorizedScopes=[]; empty.days.forEach(day => {day.sourceCount=0;day.reasonCodes=['SOURCE_COVERAGE_UNAVAILABLE'];});
const emptyResult=assembleSharedQuotaExecutionPages(policy,'fixture-child',[empty]);
assert.equal(projectLocalSharedQuotaExecution(policy,emptyResult.basis,[],[]).complete,false,'explicit empty coverage stays unavailable');
assert.throws(() => assembleSharedQuotaExecutionPages(policy,'fixture-child',[]),/INVALID_EXECUTION_PAGES/);
console.log('shared quota transport: PASS (complete paging, Child/version/coverage/scope rejection, immutable and empty sources)');
const multi = basis(), webTemplate = multi.days[0].sources.find(v => v.contribution.source === 'web');
multi.days = multi.days.map(day => ({...day,sources:[...day.sources.filter(v=>v.contribution.source==='application'),
  ...Array.from({length:15},(_,i)=>({...clone(webTemplate),
    contribution:{...clone(webTemplate.contribution),date:day.date,sourceKey:`local-browser-${i}`}}))]}));
const multiScopes = multi.days.flatMap(day => day.sources.map(v => ({source:v.contribution.source,sourceKey:v.contribution.sourceKey,date:day.date})));
const multiReplacements = multi.days.flatMap(day => day.sources.map(v => ({basisRevision:multi.revision,
  expectedPublicationRevision:v.publicationRevision,revisionOrdinal:v.revisionOrdinal+1,contribution:clone(v.contribution)})));
assert.equal(projectLocalSharedQuotaExecution(policy,multi,multiReplacements,multiScopes).complete,true,
  'multiple authenticated local profiles are not silently limited to one browser');
assert.throws(()=>projectLocalSharedQuotaExecution(policy,multi,Array(1401).fill(multiReplacements[0]),multiScopes),/INVALID_EXECUTION_BASIS/);
assert.throws(()=>projectLocalSharedQuotaExecution(policy,multi,[],Array(1401).fill(multiScopes[0])),/INVALID_EXECUTION_BASIS/);
console.log('shared quota multi-profile: PASS (all authorized replacements, bounded 1400, no source privilege expansion)');
