import assert from 'node:assert/strict';
import fs from 'node:fs';
import {validateSharedBrowserActivityV2,advanceSharedForcedUseClock,acknowledgeSharedReminderDeliveryV2,
  resolveSharedReminderV2,expireSharedReminderV2,receiveSharedBrowserActivityV2,
  validateSharedBrowserExecutionV2,validateSharedBrowserExecutionAckV2,validateSharedBrowserActivityAckV2,
  validateSharedReminderStateV2,validateSharedReminderStateQueryV2} from './dist/shared-reminder-lifecycle.js';
import {projectSharedAccessPolicyV2,createSharedAccessPolicyIdentityV2} from './dist/shared-access.js';
import { acknowledgeSharedReminderDelivery, resolveSharedReminder, expireSharedReminder,
  validateSharedReminderDeliveryAck, validateSharedReminderResolution,
  SHARED_REMINDER_LIFECYCLE_CAPABILITY, SHARED_BROWSER_ACTIVITY_CAPABILITY,
  SHARED_BROWSER_ACTIVITY_RENEW_MS, SHARED_BROWSER_ACTIVITY_MAX_AGE_MS,
  validateSharedBrowserActivity, receiveSharedBrowserActivity, sharedBrowserReminderEligibility,
  SHARED_BROWSER_EXECUTION_CAPABILITY, SHARED_BROWSER_EXECUTION_MAX_AGE_MS,
  validateSharedBrowserExecution, validateSharedBrowserExecutionAck, authorizeSharedBrowserExecution,
  sharedBrowserExecutionEligibility, acknowledgeSharedBrowserExecution } from './dist/shared-reminder-lifecycle.js';
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
assert.deepEqual(validateSharedBrowserActivityV2({...activityV2,quotaBucket:'rest',reasonCodes:['restrictedEntry']}).reasonCodes,['restrictedEntry']);
assert.throws(()=>validateSharedBrowserActivity(activityV2));
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
const reminderV2={...data.state,schemaVersion:2,policyRevision:identityV2.revision,stage:'shared',
  policyIdentity:identityV2,ruleScopeKey:'a'.repeat(64),reasonCodes:['dailyComposite'],kinds:['entry'],
  forcedUsageSeconds:600,confirmedAtUsageSeconds:0,status:'offered',visibleAtMs:null,resolution:null};
const contextV2={...data.context,state:reminderV2,currentPolicyIdentity:identityV2,
  currentStateRevision:reminderV2.stateRevision,executionEnabled:true};
assert.equal(validateSharedReminderStateV2(reminderV2).schemaVersion,2);
for(const patch of [{date:'2026-02-30'},{confirmedAtUsageSeconds:601},{policyIdentity:{...identityV2,stage:'shadow'}},
  {reasonCodes:['unknown']},{extra:true}]) assert.throws(()=>validateSharedReminderStateV2({...reminderV2,...patch}));
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
const permitV2={...messageV2,policyIdentity:identityV2,executionId:'execute',leaseId:'lease',activityId:'activity',
  targetSource:'browser',effect:'request-normal-close',maxAgeMs:5000};
assert.equal(validateSharedBrowserExecutionV2(permitV2).effect,'request-normal-close');
const ackV2={...messageV2,policyIdentity:identityV2,executionId:'execute',leaseId:'lease',activityId:'activity',outcome:'canceled'};
assert.equal(validateSharedBrowserExecutionAckV2(ackV2).outcome,'canceled');
assert.throws(()=>validateSharedBrowserExecutionV2({...permitV2,triggerStateRevision:'old'}));
assert.throws(()=>validateSharedBrowserExecutionV2({...permitV2,schemaVersion:1}));
assert.throws(()=>validateSharedBrowserExecutionV2({...permitV2,policyRevision:'other'}));
console.log('forced-use runtime V2: PASS (activity/identity/sequence, single clock, lifecycle and execution boundaries)');
const identity=Object.fromEntries(['schemaVersion','roundId','reminderId','deliveryId','policyRevision','stateRevision']
  .map(key=>[key,data.state[key]]));
for (const vector of data.cases) {
  const context={...data.context,...vector.contextPatch,state:{...data.state,...vector.statePatch}};
  const invoke=()=>vector.operation==='timeout' ? expireSharedReminder(context)
    : vector.operation==='ack' ? acknowledgeSharedReminderDelivery(context,{...identity,...vector.message})
    : resolveSharedReminder(context,{...identity,...vector.message});
  if (vector.error) assert.throws(invoke,error=>error.message===vector.error,vector.name);
  else {
    const value=invoke();
    for (const [key,expected] of Object.entries(vector.expect))
      assert.deepEqual(key in value ? value[key] : value.state[key],expected,`${vector.name}: ${key}`);
  }
  assert.deepEqual(context.state,{...data.state,...vector.statePatch},'input registration remains immutable');
}
for (const injected of ['childId','localUserId','assignmentVersion','visibleAtMs','targetProcess','url']) {
  assert.throws(()=>validateSharedReminderDeliveryAck({...identity,delivery:'visible',[injected]:'private'}),/INVALID/);
  assert.throws(()=>validateSharedReminderResolution({...identity,action:'continue',[injected]:'private'}),/INVALID/);
}
for (const field of Object.keys(identity)) {
  const item={...identity,delivery:'visible'}; delete item[field];
  assert.throws(()=>validateSharedReminderDeliveryAck(item),/INVALID/);
}
assert.equal(SHARED_REMINDER_LIFECYCLE_CAPABILITY,'shared-reminder-lifecycle-v1');
assert.throws(()=>validateSharedReminderDeliveryAck({...identity,delivery:{toString:()=> 'visible'}}),/INVALID/);
assert.throws(()=>validateSharedReminderResolution({...identity,action:{toString:()=> 'end_rest'}}),/INVALID/);
const schema=JSON.parse(fs.readFileSync(new URL('./shared-reminder-lifecycle-v1.schema.json',import.meta.url),'utf8'));
for(const type of ['deliveryAck','resolution']) {
  assert.equal(schema.$defs[type].additionalProperties,false);
  assert(!Object.hasOwn(schema.$defs[type].properties,'visibleAtMs'));
}
assert.deepEqual(schema.$defs.resolution.properties.action.enum,['continue','end_rest']);
const activity=data.browserActivity;
for(const vector of activity.cases){
  const message={...activity.message,...vector.messagePatch};
  const receipt=receiveSharedBrowserActivity(activity.context,message).receipt;
  const context={...activity.context,current:receipt,...vector.contextPatch};
  const next={...message,...vector.nextPatch};
  const before=JSON.stringify(context);
  const invoke=()=>vector.operation==='validate'?validateSharedBrowserActivity(next)
    :vector.operation==='eligible'?sharedBrowserReminderEligibility(context,vector.expectedActivityId)
    :receiveSharedBrowserActivity(context,next);
  if(vector.error)assert.throws(invoke,error=>error.message===vector.error,vector.name);
  else{
    const result=invoke();
    for(const [key,expected]of Object.entries(vector.expect)){
      const actual=key==='receivedMonotonicMs'?result.receipt.receivedMonotonicMs
        :key==='eligible'&&vector.operation==='receive'?sharedBrowserReminderEligibility({...context,current:result.receipt}).eligible
        :result[key];
      assert.deepEqual(actual,expected,`${vector.name}: ${key}`);
    }
  }
  assert.equal(JSON.stringify(context),before,'activity receipt must be immutable');
}
assert.equal(sharedBrowserReminderEligibility(activity.context).reasonCode,'SHARED_BROWSER_ACTIVITY_MISSING');
const initialReceipt=receiveSharedBrowserActivity(activity.context,activity.message).receipt;
const expiredContext={...activity.context,current:initialReceipt,monotonicNowMs:30000};
const duplicateReceipt=receiveSharedBrowserActivity(expiredContext,activity.message).receipt;
assert.equal(sharedBrowserReminderEligibility({...expiredContext,current:duplicateReceipt}).reasonCode,'SHARED_BROWSER_ACTIVITY_EXPIRED');
assert.throws(()=>receiveSharedBrowserActivity({...expiredContext,bootId:'new-boot'},activity.message),/LEASE_CHANGED/);
assert.throws(()=>receiveSharedBrowserActivity({...expiredContext,monotonicNowMs:9999},activity.message),/LEASE_CHANGED/);
for(const sequence of [NaN,Infinity,1.5,-1,Number.MAX_SAFE_INTEGER+1])
  assert.throws(()=>validateSharedBrowserActivity({...activity.message,sequence}),/INVALID/);
for(const field of ['url','domain','title','tabId','windowId','localUserId','sid','processId','receivedMonotonicMs'])
  assert.throws(()=>validateSharedBrowserActivity({...activity.message,[field]:'private'}),/INVALID/);
for(const field of Object.keys(activity.message)){
  const item={...activity.message};delete item[field];assert.throws(()=>validateSharedBrowserActivity(item),/INVALID/);
}
assert.equal(SHARED_BROWSER_ACTIVITY_CAPABILITY,'shared-browser-activity-v1');
assert.equal(SHARED_BROWSER_ACTIVITY_RENEW_MS,5000);
assert.equal(SHARED_BROWSER_ACTIVITY_MAX_AGE_MS,15000);
assert.equal(schema.$defs.browserActivity.additionalProperties,false);
assert.equal(schema.$defs.browserActivity.properties.sequence.maximum,Number.MAX_SAFE_INTEGER);
console.log(`shared reminder lifecycle: PASS (${data.cases.length} golden vectors + strict boundary checks)`);
console.log(`browser activity: PASS (${activity.cases.length} golden vectors + strict boundary checks)`);
const execution=data.browserExecution;
const runtime={...data.context,nowMs:10000,monotonicNowMs:10000,state:{...data.state,...execution.statePatch}};
const browser={...activity.context,bootId:runtime.bootId};
browser.current=receiveSharedBrowserActivity(browser,activity.message).receipt;
const permit=authorizeSharedBrowserExecution(runtime,browser,execution.target);
const ack={...identity,...Object.fromEntries(['executionId','leaseId','activityId'].map(key=>[key,permit[key]])),outcome:'completed'};
for(const vector of execution.cases){
  const context={...runtime,...vector.contextPatch,state:{...runtime.state,...vector.statePatch}};
  const before=JSON.stringify({context,browser,permit,ack});
  const invoke=()=>vector.operation==='consumer'
    ?sharedBrowserExecutionEligibility({...permit,...vector.permitPatch},{...execution.consumer,...vector.consumerPatch,
      reminder:{...identity,...vector.reminderPatch},
      attemptedIds:new Set(vector.attempted?[permit.executionId]:[])})
    :vector.operation==='ack'?acknowledgeSharedBrowserExecution({...permit,...vector.permitPatch},
      {...ack,...vector.ackPatch},vector.existing?ack:null,vector.authenticatedLeaseCurrent??true)
    :authorizeSharedBrowserExecution(context,{...browser,monotonicNowMs:context.monotonicNowMs,
      current:{...browser.current,receivedMonotonicMs:context.monotonicNowMs},...vector.browserPatch},
      {...execution.target,...vector.targetPatch});
  if(vector.error)assert.throws(invoke,error=>error.message===vector.error,vector.name);
  else{
    const result=invoke();
    if(vector.operation==='consumer'){
      assert.equal(result.reasonCode,vector.expectReason,vector.name);
      assert.equal(result.eligible,vector.expectReason===null,vector.name);
    }else if(vector.operation==='ack')assert.equal(result.duplicate,vector.expectDuplicate,vector.name);
    else{
      assert.equal(result?.effect??null,vector.expectEffect,vector.name);
      if(vector.expectMaxAgeMs!==undefined)assert.equal(result.maxAgeMs,vector.expectMaxAgeMs,vector.name);
    }
  }
  assert.equal(JSON.stringify({context,browser,permit,ack}),before,'execution inputs remain immutable');
}
for(const field of ['url','title','tabId','targetProcess','childId','sid','sentAtMs']){
  assert.throws(()=>validateSharedBrowserExecution({...permit,[field]:'private'}),/INVALID/);
  assert.throws(()=>validateSharedBrowserExecutionAck({...ack,[field]:'private'}),/INVALID/);
}
for(const maxAgeMs of [0,5001,NaN,Infinity,1.5])
  assert.throws(()=>validateSharedBrowserExecution({...permit,maxAgeMs}),/INVALID/);
for(const patch of [{effect:'end_rest'},{targetSource:'application'},{schemaVersion:2},{executionId:' '},{leaseId:'x'.repeat(129)}])
  assert.throws(()=>validateSharedBrowserExecution({...permit,...patch}),/INVALID/);
assert.throws(()=>validateSharedBrowserExecutionAck({...ack,outcome:'force-close'}),/INVALID/);
for(const value of [permit,ack])for(const field of Object.keys(value)){
  const incomplete={...value};delete incomplete[field];
  assert.throws(()=>field==='outcome'||value===ack?validateSharedBrowserExecutionAck(incomplete):validateSharedBrowserExecution(incomplete),/INVALID/);
}
assert.equal(SHARED_BROWSER_EXECUTION_CAPABILITY,'shared-browser-execution-v1');
assert.equal(SHARED_BROWSER_EXECUTION_MAX_AGE_MS,5000);
console.log(`browser execution: PASS (${execution.cases.length} golden vectors + strict boundary checks)`);

// A visible episode is fixed; only a trusted, continuously verified source growth path continues it.
const grown = {...runtime,currentStateRevision:'new-complete-execution',
  continuousUsageGrowth:{triggerStateRevision:runtime.state.stateRevision,currentStateRevision:'new-complete-execution'}};
const continuedTarget={...execution.target,continuitySupported:true};
const grownPermit=authorizeSharedBrowserExecution(grown,browser,continuedTarget);
assert.equal(authorizeSharedBrowserExecution(grown,browser,execution.target),null,'old consumer cannot receive a continuation permit');
assert.equal(grownPermit.stateRevision,grown.currentStateRevision);
assert.equal(grownPermit.triggerStateRevision,runtime.state.stateRevision);
assert.equal(authorizeSharedBrowserExecution({...grown,continuousUsageGrowth:undefined},browser,execution.target),null);
assert.equal(authorizeSharedBrowserExecution({...grown,continuousUsageGrowth:{...grown.continuousUsageGrowth,
  currentStateRevision:'stale-current'}},browser,execution.target),null);
assert.equal(authorizeSharedBrowserExecution({...grown,currentPolicyRevision:'changed'},browser,execution.target),null);
const currentConsumer={...execution.consumer,reminder:identity,stateRevision:grown.currentStateRevision,attemptedIds:new Set(),continuitySupported:true};
for(const vector of data.continuity.cases){
  if(vector.operation==='authorize'){
    const context={...grown,currentStateRevision:data.continuity.currentStateRevision,
      currentPolicyRevision:vector.policyRevision??grown.currentPolicyRevision,
      continuousUsageGrowth:vector.continuity===false?undefined:{...grown.continuousUsageGrowth,
        currentStateRevision:vector.continuityCurrent??grown.currentStateRevision}};
    assert.equal(authorizeSharedBrowserExecution(context,browser,{...continuedTarget,
      continuitySupported:vector.supported??true})?.effect??null,vector.expectedEffect,vector.name);
  }else assert.equal(sharedBrowserExecutionEligibility({...grownPermit,
    triggerStateRevision:vector.triggerRevision??grownPermit.triggerStateRevision},{...currentConsumer,
      stateRevision:vector.currentRevision??currentConsumer.stateRevision,continuitySupported:vector.supported??true}).eligible,
    vector.expectedEligible,vector.name);
}
assert.equal(sharedBrowserExecutionEligibility(grownPermit,currentConsumer).eligible,true);
assert.equal(sharedBrowserExecutionEligibility(grownPermit,{...currentConsumer,continuitySupported:false}).eligible,false);
assert.equal(sharedBrowserExecutionEligibility({...grownPermit,triggerStateRevision:'another-trigger'},currentConsumer).eligible,false);
assert.equal(sharedBrowserExecutionEligibility(grownPermit,{...currentConsumer,stateRevision:'older-current'}).eligible,false);
const grownAck={...ack,stateRevision:grownPermit.stateRevision,triggerStateRevision:grownPermit.triggerStateRevision};
assert.equal(acknowledgeSharedBrowserExecution(grownPermit,grownAck,null,true).duplicate,false);
assert.throws(()=>acknowledgeSharedBrowserExecution(grownPermit,{...grownAck,triggerStateRevision:'other'},null,true),/INSTANCE_CHANGED/);
const visibleGrowth={...data.context,state:{...data.state,status:'visible',visibleAtMs:1000},currentStateRevision:'grown',
  continuousUsageGrowth:{triggerStateRevision:data.state.stateRevision,currentStateRevision:'grown'},
  visibleBootId:data.context.bootId,visibleMonotonicMs:1000,monotonicNowMs:61000,nowMs:61000};
const timedOut=expireSharedReminder(visibleGrowth);
assert.equal(timedOut.state.status,'resolved','ordinary growth cannot reset the visible 60-second clock');
assert.equal(timedOut.visibleMonotonicMs,1000);
assert.equal(timedOut.state.stateRevision,data.state.stateRevision,'trigger remains fixed');
assert.equal(expireSharedReminder({...visibleGrowth,continuousUsageGrowth:undefined}).state.status,'withdrawn');
console.log('reminder continuity: PASS (fixed visible clock, fresh permit, correction withdrawal, exact ACK)');
