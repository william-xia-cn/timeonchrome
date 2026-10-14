import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseNativeApplicationIdentificationBatch as parse,parseNativeApplicationIdentificationReceipt as receipt,normalizeNativeApplicationIdentificationItem as normalize} from './dist/native-application-identification.js';
import {hashUsageAccountValue} from './dist/usage-account.js';
const identity={nativeId:'audit-app-1',name:'本机登记名称',status:'identified',evidence:['os-application-aumid']};
const item={instanceId:'a'.repeat(64),revision:1,observedAtMs:1,identifications:[identity]};
const batch={schemaVersion:1,childId:'child',localUserId:'user',assignmentVersion:1,items:[item]};
assert.deepEqual(parse(batch),batch);
const schema=JSON.parse(readFileSync(new URL('./native-application-identification-v1.schema.json',import.meta.url),'utf8'));
assert.equal(new RegExp(schema.$defs.identity.properties.name.pattern).test('本机登记名称'),true);
assert.equal(new RegExp(schema.$defs.identity.properties.name.pattern).test('bad\nname'),false);
const pathPattern=schema.$defs.identity.properties.name.allOf[1].not.pattern;
for(const name of ['C:\\private\\app.exe','\\\\private\\share','file://private/app'])
  assert.equal(new RegExp(pathPattern).test(name),true);
for(const status of ['dynamic-registry','dynamic-process'])assert.equal(parse({...batch,items:[{...item,identifications:[{
  nativeId:'dynamic-local:'+'b'.repeat(64),name:'动态登记（动态识别）',status,evidence:['PROCESS_NAME_FALLBACK']}]}]}).items[0].identifications[0].status,status);
assert.equal(parse({...batch,items:[{...item,identifications:null}]}).items[0].identifications,null);
const entries=[identity,{...identity,nativeId:'audit-app-2',name:'同文件不同PWA'}];
assert.equal(parse({...batch,items:[{...item,identifications:entries}]}).items[0].identifications.length,2);
const invalid=[null,{...batch,accountId:'self-reported'},{...batch,assignmentVersion:0},
  {...batch,items:[item,item]}, {...batch,items:[{...item,identifications:[]}]},
  {...batch,items:[{...item,identifications:[identity,identity]}]},
  ...[{name:'C:\\Users\\private\\app.exe'},{name:'bad\nname'},{registryDirectory:'private'},
    {status:'confirmed'},{nativeId:'dynamic-local:bad'},{evidence:['path:C:/private']},{evidence:['not-reviewed']}]
    .map(extra=>({...batch,items:[{...item,identifications:[{...identity,...extra}]}]})),
  {...batch,items:[{...item,instanceId:'invalid'}]}, {...batch,items:[{...item,revision:1.5}]},
  {...batch,items:[{...item,identifications:Array.from({length:17},(_,i)=>({...identity,nativeId:'app-'+i}))}]}];
for(const value of invalid)assert.throws(()=>parse(value));
const expected={schemaVersion:1,childId:'child',localUserId:'user',assignmentVersion:1,
  items:[{instanceId:item.instanceId,revision:1,payloadHash:'c'.repeat(64)}]};
assert.deepEqual(receipt(expected,expected),expected);
assert.equal(receipt({...expected,items:[{...expected.items[0],revision:2,payloadHash:'d'.repeat(64)}]},expected).items[0].revision,2);
for(const value of [{...expected,childId:'other'},{...expected,localUserId:'other'}, {...expected,assignmentVersion:2},
  {...expected,items:[{...expected.items[0],payloadHash:'e'.repeat(64)}]},{...expected,items:[]}])assert.throws(()=>receipt(value,expected));
const vectors=JSON.parse(readFileSync(new URL('./native-application-identification-v1.vectors.json',import.meta.url),'utf8'));
for(const vector of vectors.cases){
  parse({...batch,items:[vector.item]});
  assert.equal(await hashUsageAccountValue(normalize(vector.item)),vector.payloadHash);
}
console.log('PASS: Native naming contract, explicit/dynamic states, multiple entries, privacy, scope and ACK');
