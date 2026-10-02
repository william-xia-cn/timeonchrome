import assert from 'node:assert/strict';
import fs from 'node:fs';
import { acknowledgeSharedReminderDelivery, resolveSharedReminder, expireSharedReminder,
  validateSharedReminderDeliveryAck, validateSharedReminderResolution,
  SHARED_REMINDER_LIFECYCLE_CAPABILITY } from './dist/shared-reminder-lifecycle.js';
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
console.log(`shared reminder lifecycle: PASS (${data.cases.length} golden vectors + strict boundary checks)`);
