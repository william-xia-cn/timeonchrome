import assert from 'node:assert/strict';
import fs from 'node:fs';
import { acknowledgeSharedReminderDelivery, resolveSharedReminder, expireSharedReminder,
  validateSharedReminderDeliveryAck, validateSharedReminderResolution,
  SHARED_REMINDER_LIFECYCLE_CAPABILITY, SHARED_BROWSER_ACTIVITY_CAPABILITY,
  SHARED_BROWSER_ACTIVITY_RENEW_MS, SHARED_BROWSER_ACTIVITY_MAX_AGE_MS,
  validateSharedBrowserActivity, receiveSharedBrowserActivity, sharedBrowserReminderEligibility,
  SHARED_BROWSER_EXECUTION_CAPABILITY, SHARED_BROWSER_EXECUTION_MAX_AGE_MS,
  validateSharedBrowserExecution, validateSharedBrowserExecutionAck, authorizeSharedBrowserExecution,
  sharedBrowserExecutionEligibility, acknowledgeSharedBrowserExecution } from './dist/shared-reminder-lifecycle.js';
const data=JSON.parse(fs.readFileSync(new URL('./shared-reminder-lifecycle.vectors.json',import.meta.url),'utf8'));
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
