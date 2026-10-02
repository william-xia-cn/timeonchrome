import assert from 'node:assert/strict';
import fs from 'node:fs';
import { acknowledgeSharedReminderDelivery, resolveSharedReminder, expireSharedReminder,
  validateSharedReminderDeliveryAck, validateSharedReminderResolution,
  SHARED_REMINDER_LIFECYCLE_CAPABILITY, SHARED_BROWSER_ACTIVITY_CAPABILITY,
  SHARED_BROWSER_ACTIVITY_RENEW_MS, SHARED_BROWSER_ACTIVITY_MAX_AGE_MS,
  validateSharedBrowserActivity, receiveSharedBrowserActivity, sharedBrowserReminderEligibility } from './dist/shared-reminder-lifecycle.js';
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
