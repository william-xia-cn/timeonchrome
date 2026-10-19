import assert from 'node:assert/strict';
import fs from 'node:fs';
import {parseNativeApplicationObjectBatch,parseNativeApplicationConfigurations,verifyNativeApplicationObjectReceipt} from './dist/native-application-identification.js';
import {canonicalUsageAccountJson,hashUsageAccountValue} from './dist/usage-account.js';
const vector=JSON.parse(fs.readFileSync(new URL('./native-application-management.vectors.json',import.meta.url)));
const batch={schemaVersion:1,childId:'child',localUserId:'user',assignmentVersion:1,items:[vector.item]};
assert.equal(canonicalUsageAccountJson(vector.item),vector.canonicalItem);
assert.equal(await hashUsageAccountValue(vector.item),vector.payloadHash);
assert.deepEqual(parseNativeApplicationObjectBatch(batch),batch);
const ack={...batch,items:[{nativeId:vector.item.nativeId,revision:1,payloadHash:vector.payloadHash}]};
assert.deepEqual(await verifyNativeApplicationObjectReceipt(ack,batch),ack);
await assert.rejects(verifyNativeApplicationObjectReceipt({...ack,items:[{...ack.items[0],revision:2}]},batch));
await assert.rejects(verifyNativeApplicationObjectReceipt({...ack,childId:'other'},batch));
for(const status of ['identified','dynamic-registry','dynamic-process']){
 const item={...vector.item,nativeId:status==='identified'?'explicit-app':'dynamic-local:example',
  presentations:[{name:'App',origin:'runtime',status,evidence:[]}]};
 assert.equal(parseNativeApplicationObjectBatch({...batch,items:[item]}).items[0].nativeId,item.nativeId);
}
assert.throws(()=>parseNativeApplicationObjectBatch({...batch,items:[{...vector.item,instanceId:'a'.repeat(64)}]}));
assert.throws(()=>parseNativeApplicationObjectBatch({...batch,items:[{...vector.item,presentations:[{...vector.item.presentations[0],status:'identified'}]}]}));
const cfg={target:{machineId:'machine',nativeId:'scan-app'},classification:'other',specialApplication:false,dailyQuotaMinutes:null};
assert.deepEqual(parseNativeApplicationConfigurations([cfg]),[cfg]);
assert.throws(()=>parseNativeApplicationConfigurations([cfg,cfg]));
await assert.rejects(verifyNativeApplicationObjectReceipt({...ack,items:[{...ack.items[0],payloadHash:'b'.repeat(64)}]},batch));
const current = await import('./dist/native-application-identification.js');
for (const retired of ['parseNativeApplicationStatisticsProjection','verifyNativeApplicationStatisticsProjection'])
 assert.equal(Object.hasOwn(current,retired),false,'旧身份投影不能继续导出');
console.log('Native应用对象/配置/ACK及跨端hash向量 PASS；旧统计投影已退出');
