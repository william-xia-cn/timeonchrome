import assert from 'node:assert/strict';
import fs from 'node:fs';
import { projectLocalSharedQuotaExecution } from './dist/shared-quota-execution.js';
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
