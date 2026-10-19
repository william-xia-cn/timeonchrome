'use strict';
// 当前模块只保留认证来源键；核算、容错和隔离案例迁至现行桶入口专项（见TASK_BOARD）。
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const ts=require('typescript'),{webcrypto,createHash}=require('node:crypto');
const file=path.resolve(__dirname,'../../workers/src/services/sharedAccessState.ts');
const moduleFixture={exports:{}};
vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{
 compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,
 {module:moduleFixture,exports:moduleFixture.exports,crypto:webcrypto,TextEncoder,Uint8Array});
(async()=>{
 const service=moduleFixture.exports;
 assert.deepEqual(Object.keys(service),['sharedWebSourceKey'],'退役清单/旧贡献/旧核算不再导出');
 const account='fixture-account',device='fixture-browser';
 const expected='web:'+createHash('sha256').update(account+'\n'+device,'utf8').digest('hex');
 const actual=await service.sharedWebSourceKey(account,device);
 assert.equal(actual,expected,'保留既有认证来源键的字节级算法');
 assert.equal(await service.sharedWebSourceKey(account,device),actual,'重连读取保持同一来源');
 assert.notEqual(await service.sharedWebSourceKey('another-account',device),actual,'账户隔离');
 assert.notEqual(await service.sharedWebSourceKey(account,'another-browser'),actual,'设备隔离');
 assert.notEqual(await service.sharedWebSourceKey('ab','c'),await service.sharedWebSourceKey('a','bc'),'边界分隔不可丢失');
 assert.equal(await service.sharedWebSourceKey('测试账户','测试浏览器'),
  'web:'+createHash('sha256').update('测试账户\n测试浏览器','utf8').digest('hex'));
 assert.match(actual,/^web:[a-f0-9]{64}$/);
 assert(!actual.includes(account)&&!actual.includes(device),'公开来源键不泄露原始身份');
 console.log('PASS current authenticated web source key: exact bytes, isolation, stable reconnect, opaque identifier; no retired exports');
})().catch(error=>{console.error(error);process.exitCode=1;});
