import assert from 'node:assert/strict';
import fs from 'node:fs';
import {validateSharedBrowserActivityV2,advanceSharedForcedUseClock,acknowledgeSharedReminderDeliveryV2,
  resolveSharedReminderV2,expireSharedReminderV2,receiveSharedBrowserActivityV2,
  validateSharedBrowserExecutionV2,validateSharedBrowserExecutionAckV2,validateSharedBrowserActivityAckV2,
  validateSharedReminderStateV2,validateSharedReminderStateQueryV2} from './dist/shared-reminder-lifecycle.js';
import {projectSharedAccessPolicyV2,createSharedAccessPolicyIdentityV2} from './dist/shared-access.js';
const currentLifecycleContract=await import('./dist/shared-reminder-lifecycle.js');
for(const obsolete of ['validateSharedBrowserActivity','receiveSharedBrowserActivity','sharedBrowserReminderEligibility',
  'validateSharedReminderDeliveryAck','validateSharedReminderResolution','acknowledgeSharedReminderDelivery',
  'resolveSharedReminder','expireSharedReminder','validateSharedBrowserExecution','validateSharedBrowserExecutionAck',
  'authorizeSharedBrowserExecution','sharedBrowserExecutionEligibility','acknowledgeSharedBrowserExecution'])
  assert.equal(Object.hasOwn(currentLifecycleContract,obsolete),false,`${obsolete}不得导出旧业务入口`);
const data=JSON.parse(fs.readFileSync(new URL('./shared-reminder-lifecycle.vectors.json',import.meta.url),'utf8'));
const policyV2=projectSharedAccessPolicyV2({},9,100);policyV2.stage='shared';
assert.deepEqual(validateSharedReminderStateQueryV2({schemaVersion:2,date:'2026-10-16'}),{schemaVersion:2,date:'2026-10-16'});
for(const query of [{date:'2026-10-16'},{schemaVersion:1,date:'2026-10-16'},
  {schemaVersion:2,date:'2026-02-30'},{schemaVersion:2,date:'2026-10-16',childId:'other'}])
  assert.throws(()=>validateSharedReminderStateQueryV2(query));
const identityV2=await createSharedAccessPolicyIdentityV2(policyV2);
const activityV2={schemaVersion:2,leaseId:'lease',activityId:'activity',sequence:1,status:'active',quotaBucket:'composite',
  presentationEligible:false,policyIdentity:identityV2,ruleScopeKey:'a'.repeat(64),reasonCodes:['timeWindow'],independentRoundId:null};
assert.equal(validateSharedBrowserActivityV2(activityV2).quotaBucket,'composite');
assert.equal(validateSharedBrowserActivityV2({...activityV2,status:'pending-entry',presentationEligible:true}).status,'pending-entry');
assert.throws(()=>validateSharedBrowserActivityV2({...activityV2,status:'pending-entry',reasonCodes:[]}));
assert.deepEqual(validateSharedBrowserActivityV2({...activityV2,quotaBucket:'rest',reasonCodes:['restrictedEntry']}).reasonCodes,['restrictedEntry']);
for(const patch of [{schemaVersion:1},{forcedUsageSeconds:10},{childId:'other'},{reasonCodes:['diagnostic']},
  {policyIdentity:{...identityV2,schemaVersion:1}},{status:'inactive'},{ruleScopeKey:'https://private.test'}])
  assert.throws(()=>validateSharedBrowserActivityV2({...activityV2,...patch}));
assert.equal(validateSharedBrowserActivityV2({...activityV2,status:'inactive',quotaBucket:null,
  ruleScopeKey:null,reasonCodes:[]}).status,'inactive');
const activityContext={leaseId:'lease',leaseCurrent:true,currentPolicyIdentity:identityV2,monotonicNowMs:1000,bootId:'boot',current:null};
const firstActivity=receiveSharedBrowserActivityV2(activityContext,activityV2);
assert.equal(firstActivity.baselineReset,true);
const nextActivityContext={...activityContext,current:firstActivity.receipt,monotonicNowMs:2000};
assert.equal(receiveSharedBrowserActivityV2(nextActivityContext,activityV2).duplicate,true);
assert.throws(()=>receiveSharedBrowserActivityV2(nextActivityContext,{...activityV2,quotaBucket:'study'}));
const secondActivity=receiveSharedBrowserActivityV2(nextActivityContext,{...activityV2,sequence:2});
assert.equal(secondActivity.baselineReset,false);
assert.equal(receiveSharedBrowserActivityV2({...nextActivityContext,current:secondActivity.receipt},activityV2).stale,true);
assert.equal(receiveSharedBrowserActivityV2({...nextActivityContext,monotonicNowMs:20000},{...activityV2,sequence:2}).baselineReset,true);
assert.throws(()=>receiveSharedBrowserActivityV2({...activityContext,leaseCurrent:false},activityV2));
assert.throws(()=>receiveSharedBrowserActivityV2({...activityContext,currentPolicyIdentity:{...identityV2,policyHash:'b'.repeat(64)}},activityV2));
const ownershipAck={schemaVersion:2,leaseId:'lease',acceptedSequence:1,duplicate:false,stale:false,ownership:'accepted',retiredIndependentRoundId:'old-round'};
const ownershipExpected={leaseId:'lease',sequence:1,independentRoundId:'old-round'};
assert.equal(validateSharedBrowserActivityAckV2(ownershipAck,ownershipExpected).ownership,'accepted');
assert.throws(()=>validateSharedBrowserActivityAckV2({...ownershipAck,retiredIndependentRoundId:null},ownershipExpected));
assert.throws(()=>validateSharedBrowserActivityAckV2({...ownershipAck,stale:true},ownershipExpected));
const clock={bootId:'boot',lastMonotonicMs:1000,accumulatedMs:0};
const active=[{eligible:true,validThroughMonotonicMs:16000},{eligible:true,validThroughMonotonicMs:16000}];
const tick=advanceSharedForcedUseClock(clock,'boot',6000,active);
assert.equal(tick.accumulatedMs,5000,'two active sources count once');
assert.deepEqual(advanceSharedForcedUseClock(tick,'boot',6000,active),tick,'duplicate tick adds nothing');
const expired=advanceSharedForcedUseClock(tick,'boot',20000,active);
assert.equal(expired.accumulatedMs,15000,'expired lease cannot count past its end');
assert.equal(advanceSharedForcedUseClock(expired,'boot',30000,[]).accumulatedMs,15000);
assert.equal(advanceSharedForcedUseClock(expired,'newboot',0,active).accumulatedMs,15000,'restart does not count offline time');
assert.throws(()=>advanceSharedForcedUseClock(tick,'boot',5000,active));
const reminderV2={schemaVersion:2,roundId:'round-1',reminderId:'reminder-1',deliveryId:'delivery-1',
  stateRevision:'state-1',date:'2026-10-02',presenter:'browser',issuedAtMs:1000,offerExpiresAtMs:300000,
  responseDeadlineSeconds:60,policyRevision:identityV2.revision,stage:'shared',
  policyIdentity:identityV2,ruleScopeKey:'a'.repeat(64),reasonCodes:['dailyComposite'],kinds:['entry'],
  forcedUsageSeconds:600,confirmedAtUsageSeconds:0,status:'offered',visibleAtMs:null,resolution:null,timeoutAction:'end'};
const contextV2={scopeCurrent:true,presenterCurrent:true,nowMs:62000,monotonicNowMs:62000,
  bootId:'boot-1',visibleBootId:null,visibleMonotonicMs:null,state:reminderV2,currentPolicyIdentity:identityV2,
  currentStateRevision:reminderV2.stateRevision,executionEnabled:true};
assert.equal(validateSharedReminderStateV2(reminderV2).schemaVersion,2);
for(const patch of [{date:'2026-02-30'},{confirmedAtUsageSeconds:601},{policyIdentity:{...identityV2,stage:'shadow'}},
  {reasonCodes:['unknown']},{extra:true}]) assert.throws(()=>validateSharedReminderStateV2({...reminderV2,...patch}));
assert.throws(()=>validateSharedReminderStateV2({...reminderV2,timeoutAction:'continue'}));
assert.throws(()=>validateSharedReminderStateV2({...reminderV2,reasonCodes:['restrictedEntry'],timeoutAction:'continue'}));
const messageV2=Object.fromEntries(['schemaVersion','roundId','reminderId','deliveryId','policyRevision','stateRevision'].map(k=>[k,reminderV2[k]]));
const visibleV2=acknowledgeSharedReminderDeliveryV2(contextV2,{...messageV2,delivery:'visible'});
assert.equal(visibleV2.state.status,'visible');
const seenV2={...contextV2,...visibleV2,state:visibleV2.state};
assert.equal(resolveSharedReminderV2(seenV2,{...messageV2,action:'end_rest'}).effect,'request-normal-close');
assert.equal(resolveSharedReminderV2(seenV2,{...messageV2,action:'continue'}).state.confirmedAtUsageSeconds,0,
  'new entry reasons must not reset an existing repeat interval');
assert.equal(resolveSharedReminderV2({...seenV2,state:{...seenV2.state,kinds:['repeat']}},
  {...messageV2,action:'continue'}).state.confirmedAtUsageSeconds,600);
assert.equal(resolveSharedReminderV2({...seenV2,state:{...seenV2.state,confirmedAtUsageSeconds:null}},
  {...messageV2,action:'end_rest'}).state.confirmedAtUsageSeconds,600);
assert.throws(()=>resolveSharedReminderV2(seenV2,{...messageV2,schemaVersion:1,action:'end_rest'}));
assert.equal(resolveSharedReminderV2({...seenV2,currentPolicyIdentity:{...identityV2,policyHash:'b'.repeat(64)}},
  {...messageV2,action:'end_rest'}).state.status,'withdrawn');
assert.throws(()=>expireSharedReminderV2(seenV2));
const timeoutV2=expireSharedReminderV2({...seenV2,monotonicNowMs:seenV2.visibleMonotonicMs+60000});
assert.equal(timeoutV2.effect,reminderV2.timeoutAction==='end'?'force-close':'none');
// 当前入口独立覆盖原有安全边界，不以仍存在的schema1用例充当保留证据。
const visibleAgain=acknowledgeSharedReminderDeliveryV2({...seenV2,monotonicNowMs:seenV2.monotonicNowMs+1000},
  {...messageV2,delivery:'visible'});
assert.equal(visibleAgain.duplicate,true);
assert.equal(visibleAgain.visibleMonotonicMs,seenV2.visibleMonotonicMs,'重复ACK不重启倒计时');
const deliveryFailed=acknowledgeSharedReminderDeliveryV2(contextV2,{...messageV2,delivery:'failed'});
assert.equal(deliveryFailed.state.status,'delivery_failed');
assert.equal(deliveryFailed.effect,'none');
assert.throws(()=>expireSharedReminderV2({...contextV2,state:deliveryFailed.state}),/NOT_VISIBLE/);
assert.equal(acknowledgeSharedReminderDeliveryV2({...contextV2,nowMs:reminderV2.offerExpiresAtMs},
  {...messageV2,delivery:'visible'}).state.status,'withdrawn','未显示过期不延长产品有效期');
for(const [field,error] of [['scopeCurrent','SCOPE_CHANGED'],['presenterCurrent','PRESENTER_CHANGED']])
  assert.throws(()=>resolveSharedReminderV2({...seenV2,[field]:false},{...messageV2,action:'continue'}),new RegExp(error));
assert.throws(()=>resolveSharedReminderV2(seenV2,{...messageV2,deliveryId:'another',action:'continue'}),/INSTANCE_CHANGED/);
for(const patch of [{bootId:'another'},{monotonicNowMs:seenV2.visibleMonotonicMs-1},{currentStateRevision:'another'}])
  assert.equal(resolveSharedReminderV2({...seenV2,...patch},{...messageV2,action:'end_rest'}).state.status,'withdrawn');
const closed=resolveSharedReminderV2(seenV2,{...messageV2,action:'end_rest'});
assert.equal(resolveSharedReminderV2({...seenV2,state:closed.state},{...messageV2,action:'end_rest'}).duplicate,true);
assert.throws(()=>resolveSharedReminderV2({...seenV2,state:closed.state},{...messageV2,action:'continue'}),/RESULT_CONFLICT/);
assert.throws(()=>resolveSharedReminderV2({...seenV2,monotonicNowMs:seenV2.visibleMonotonicMs+60000},
  {...messageV2,action:'continue'}),/DEADLINE_ELAPSED/);
assert.equal(expireSharedReminderV2({...seenV2,executionEnabled:false,
  monotonicNowMs:seenV2.visibleMonotonicMs+60000}).effect,'none');
const shadowIdentity={...identityV2,stage:'shadow'};
assert.equal(expireSharedReminderV2({...seenV2,currentPolicyIdentity:shadowIdentity,
  state:{...seenV2.state,stage:'shadow',policyIdentity:shadowIdentity},
  monotonicNowMs:seenV2.visibleMonotonicMs+60000}).effect,'none');
const currentLifecycleSource=fs.readFileSync(new URL('./shared-reminder-lifecycle.ts',import.meta.url),'utf8');
const currentLifecycle=currentLifecycleSource.slice(currentLifecycleSource.indexOf('function validateV2ReminderMessage'),
  currentLifecycleSource.indexOf('export const SHARED_REMINDER_LIFECYCLE_CAPABILITY'));
assert.doesNotMatch(currentLifecycle,/schemaVersion:\s*1|v2RuntimeContext|\b(?:acknowledgeSharedReminderDelivery|resolveSharedReminder|expireSharedReminder)\(/,
  '当前V2生命周期不再转换成旧协议或调用旧业务入口');
let currentLifecycleCases=0;
for(const vector of data.cases) {
  const state={...reminderV2,status:'visible',visibleAtMs:2000,...vector.statePatch};
  state.policyIdentity={...identityV2,stage:state.stage};
  const {policyChanged,...clockPatch}=vector.contextPatch??{};
  const context={...contextV2,visibleBootId:'boot-1',visibleMonotonicMs:2000,...clockPatch,state,
    currentPolicyIdentity:policyChanged ? {...state.policyIdentity,revision:'profile-config:10'} : state.policyIdentity};
  const message={...messageV2,...vector.message};
  const before=JSON.stringify(context);
  const invoke=()=>vector.operation==='ack' ? acknowledgeSharedReminderDeliveryV2(context,message)
    : vector.operation==='resolve' ? resolveSharedReminderV2(context,message) : expireSharedReminderV2(context);
  if(vector.error) assert.throws(invoke,error=>error.message===vector.error,`V2 ${vector.name}`);
  else {
    const result=invoke();
    for(const [key,expectedValue] of Object.entries(vector.expect))
      assert.equal(Object.hasOwn(result,key)?result[key]:result.state[key],expectedValue,`V2 ${vector.name}: ${key}`);
  }
  assert.equal(JSON.stringify(context),before,'当前提醒不修改输入状态');
  currentLifecycleCases++;
}
assert.equal(currentLifecycleCases,27);
console.log('current V2 lifecycle: 27 retained safety cases PASS; obsolete timeout-continue explicitly rejected');
const permitV2={...messageV2,policyIdentity:identityV2,executionId:'execute',leaseId:'lease',activityId:'activity',
  targetSource:'browser',effect:'request-normal-close',maxAgeMs:5000};
assert.equal(validateSharedBrowserExecutionV2(permitV2).effect,'request-normal-close');
const ackV2={...messageV2,policyIdentity:identityV2,executionId:'execute',leaseId:'lease',activityId:'activity',outcome:'canceled'};
assert.equal(validateSharedBrowserExecutionAckV2(ackV2).outcome,'canceled');
assert.throws(()=>validateSharedBrowserExecutionV2({...permitV2,triggerStateRevision:'old'}));
assert.throws(()=>validateSharedBrowserExecutionV2({...permitV2,schemaVersion:1}));
assert.throws(()=>validateSharedBrowserExecutionV2({...permitV2,policyRevision:'other'}));
console.log('forced-use runtime V2: PASS (activity/identity/sequence, single clock, lifecycle and execution boundaries)');
