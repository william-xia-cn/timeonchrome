import {hashUsageAccountValue} from './usage-account.js';
/** 旧本机命名元数据保持兼容；新增独立管理对象不改原账。 */
export const NATIVE_APPLICATION_IDENTIFICATION_CAPABILITY = 'native-application-identification-v1';
export interface NativeApplicationIdentification {
  nativeId: string;
  name: string;
  status: 'identified' | 'dynamic-registry' | 'dynamic-process';
  evidence: string[];
}
/** 同一个管理对象；machineId是现有作用域，nativeId原样引用，不生成第二个应用ID。 */
export interface NativeApplicationManagementTarget { machineId: string; nativeId: string }
export interface NativeApplicationManagementObject {
  target: NativeApplicationManagementTarget;
  presentations: Array<Omit<NativeApplicationIdentification, 'nativeId'>>;
}
export interface NativeApplicationIdentificationBatch {
  schemaVersion: 1;
  childId: string;
  localUserId: string;
  assignmentVersion: number;
  items: Array<{instanceId: string; revision: number; observedAtMs: number;
    /** 完整替换该来源当前已登记的集合；null明确撤销，空数组不代替撤销。 */
    identifications: NativeApplicationIdentification[] | null}>;
}
export interface NativeApplicationIdentificationReceipt {
  schemaVersion: 1;
  childId: string;
  localUserId: string;
  assignmentVersion: number;
  items: Array<{instanceId: string; revision: number; payloadHash: string}>;
}

/** 独立管理对象：扫描声明不伪装为运行识别；均不依赖实例／文件捕获。 */
export const NATIVE_APPLICATION_MANAGEMENT_CAPABILITY = 'native-application-management-v1';
export interface NativeApplicationPresentation {
  name:string; origin:'scan'|'runtime';
  status:NativeApplicationIdentification['status']|null; evidence:string[];
}
export interface NativeApplicationObjectBatch {
  schemaVersion:1; childId:string; localUserId:string; assignmentVersion:number;
  items:Array<{nativeId:string;revision:number;observedAtMs:number;presentations:NativeApplicationPresentation[]}>;
}
export interface NativeApplicationObjectReceipt {
 schemaVersion:1;childId:string;localUserId:string;assignmentVersion:number;
 items:Array<{nativeId:string;revision:number;payloadHash:string}>;
}
/** 对象ACK只精确确认本次冻结内容；较新的服务器头不能代替另一份在途内容。 */
export async function verifyNativeApplicationObjectReceipt(value:unknown,sent:NativeApplicationObjectBatch):Promise<NativeApplicationObjectReceipt> {
 const batch=parseNativeApplicationObjectBatch(sent);
 if(!record(value)||!keys(value,['schemaVersion','childId','localUserId','assignmentVersion','items'])
  ||value.schemaVersion!==1||value.childId!==batch.childId||value.localUserId!==batch.localUserId
  ||value.assignmentVersion!==batch.assignmentVersion||!Array.isArray(value.items)||value.items.length!==batch.items.length)return fail();
 const seen=new Set<string>(),items:NativeApplicationObjectReceipt['items']=[];
 for(const ack of value.items){
  if(!record(ack)||!keys(ack,['nativeId','revision','payloadHash'])||typeof ack.nativeId!=='string'||seen.has(ack.nativeId))return fail();
  const item=batch.items.find(item=>item.nativeId===ack.nativeId);
  if(!item||item.revision!==ack.revision||await hashUsageAccountValue(item)!==ack.payloadHash)return fail();
  seen.add(ack.nativeId);items.push({nativeId:ack.nativeId,revision:item.revision,payloadHash:ack.payloadHash as string});
 }
 return {schemaVersion:1,childId:batch.childId,localUserId:batch.localUserId,assignmentVersion:batch.assignmentVersion,items};
}
export interface NativeApplicationConfiguration {
  target:NativeApplicationManagementTarget;
  classification:'study'|'composite'|'restrictedEntertainment'|'unclassified'|'other'|'blocked';
  specialApplication:boolean; dailyQuotaMinutes:number|null;
}
export function parseNativeApplicationConfigurations(value:unknown):NativeApplicationConfiguration[] {
  if(!Array.isArray(value)||value.length>5000)return fail();
  const seen=new Set<string>();
  return value.map(entry=>{
    if(!record(entry)||!keys(entry,['target','classification','specialApplication','dailyQuotaMinutes'])
      ||!record(entry.target)||!keys(entry.target,['machineId','nativeId'])
      ||!['study','composite','restrictedEntertainment','unclassified','other','blocked'].includes(String(entry.classification))
      ||typeof entry.specialApplication!=='boolean'
      ||!(entry.dailyQuotaMinutes===null||typeof entry.dailyQuotaMinutes==='number'
        &&Number.isSafeInteger(entry.dailyQuotaMinutes)&&entry.dailyQuotaMinutes>=0&&entry.dailyQuotaMinutes<=1440))return fail();
    const target={machineId:entry.target.machineId as string,nativeId:entry.target.nativeId as string};
    const key=nativeApplicationManagementTargetKey(target);if(seen.has(key))return fail();seen.add(key);
    return {target,classification:entry.classification as NativeApplicationConfiguration['classification'],
      specialApplication:entry.specialApplication,dailyQuotaMinutes:entry.dailyQuotaMinutes as number|null};
  }).sort((a,b)=>nativeApplicationManagementTargetKey(a.target)<nativeApplicationManagementTargetKey(b.target)?-1:1);
}
export function parseNativeApplicationObjectBatch(value:unknown):NativeApplicationObjectBatch {
  if(!record(value)||!keys(value,['schemaVersion','childId','localUserId','assignmentVersion','items'])
    ||value.schemaVersion!==1||!text(value.childId,128)||!text(value.localUserId,256)||!revision(value.assignmentVersion)
    ||!Array.isArray(value.items)||value.items.length>50)return fail();
  const seen=new Set<string>();
  const items=value.items.map(item=>{
    if(!record(item)||!keys(item,['nativeId','revision','observedAtMs','presentations'])
      ||!text(item.nativeId,256)||!revision(item.revision)||!Number.isSafeInteger(item.observedAtMs)
      ||Number(item.observedAtMs)<0||Number(item.observedAtMs)>253402271999999
      ||!Array.isArray(item.presentations)||!item.presentations.length||item.presentations.length>16)return fail();
    nativeApplicationManagementTargetKey({machineId:'validation',nativeId:item.nativeId});
    if(seen.has(item.nativeId))return fail();seen.add(item.nativeId);
    const presentations:NativeApplicationPresentation[]=item.presentations.map(p=>{
      if(!record(p)||!keys(p,['name','origin','status','evidence'])||!text(p.name,512)
        ||/^(?:[a-z]:[\\/]|\\\\|file:\/\/)/i.test(p.name)||!Array.isArray(p.evidence))return fail();
      if(p.origin==='scan') {
        if(p.status!==null||p.evidence.length)return fail();
        return {name:p.name,origin:'scan',status:null,evidence:[]};
      }
      if(p.origin!=='runtime')return fail();
      const checked=parseNativeApplicationIdentification({nativeId:item.nativeId,name:p.name,status:p.status,evidence:p.evidence});
      return {name:checked.name,origin:'runtime',status:checked.status,evidence:checked.evidence.sort()};
    });
    const normalized=[...new Map(presentations.map(p=>[JSON.stringify(p),p])).values()]
      .sort((a,b)=>JSON.stringify(a)<JSON.stringify(b)?-1:1);
    return {nativeId:item.nativeId,revision:item.revision,observedAtMs:Number(item.observedAtMs),presentations:normalized};
  });
  return {schemaVersion:1,childId:value.childId,localUserId:value.localUserId,assignmentVersion:value.assignmentVersion,items};
}
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const keys = (v: Record<string, unknown>, names: string[]) => Object.keys(v).length === names.length && Object.keys(v).every(k => names.includes(k));
const text = (v: unknown, max: number): v is string => typeof v === 'string' && v.trim().length > 0 && v.length <= max && !/[\u0000-\u001f\u007f]/.test(v);
const hash = (v: unknown): v is string => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v);
const revision = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= 1;
const fail = (): never => { throw new Error('INVALID_NATIVE_APPLICATION_IDENTIFICATION'); };
const evidenceCodes = new Set(['explicit-window-aumid','os-application-aumid','dedicated-known-image-path',
  'image-and-script-argument','image-and-app-id','host-image-and-app-id','image-and-launch-mode',
  'browser-image-with-app-mode-guard','launch-image-path','steam-launch-app-id',
  'STATIC_IDENTITY_CONFLICT','STATIC_LAUNCH_IDENTITY_ONLY','REGISTRY_INSTALL_DIRECTORY_CANDIDATE',
  'REGISTRY_SOURCE_INCOMPLETE','REGISTRY_DIRECTORY_AMBIGUOUS','REGISTRY_CATALOG_UNAVAILABLE','PROCESS_NAME_FALLBACK']);
/** 输入须先验证；集合使用ASCII序，不采用运行环境的语言排序。 */
export function normalizeNativeApplicationIdentificationItem(item: NativeApplicationIdentificationBatch['items'][number]) {
  return {...item,identifications:item.identifications?.map(entry=>({...entry,evidence:[...entry.evidence].sort()}))
    .sort((a,b)=>a.nativeId<b.nativeId?-1:a.nativeId>b.nativeId?1:0)??null};
}
export function parseNativeApplicationIdentification(value: unknown): NativeApplicationIdentification {
  if (!record(value) || !keys(value, ['nativeId','name','status','evidence'])
    || !text(value.nativeId,256) || !/^[a-zA-Z0-9_.:-]+$/.test(value.nativeId)
    || !text(value.name,512) || /^(?:[a-z]:[\\/]|\\\\|file:\/\/)/i.test(value.name)
    || !['identified','dynamic-registry','dynamic-process'].includes(String(value.status))
    || !Array.isArray(value.evidence) || value.evidence.length > 16
    || value.evidence.some(code => typeof code !== 'string' || !evidenceCodes.has(code))
    || new Set(value.evidence).size !== value.evidence.length) return fail();
  if ((value.status !== 'identified') !== value.nativeId.startsWith('dynamic-local:')) return fail();
  return {nativeId:value.nativeId,name:value.name,status:value.status as NativeApplicationIdentification['status'],
    evidence:[...value.evidence] as string[]};
}
/** 内存集合引用键，不是持久身份、产品规则或新的鉴权证明。 */
export function nativeApplicationManagementTargetKey(target: NativeApplicationManagementTarget): string {
  if (!record(target) || !keys(target, ['machineId','nativeId']) || !text(target.machineId,128)
    || !/^[a-zA-Z0-9_.:-]+$/.test(target.machineId) || !text(target.nativeId,256)
    || !/^[a-zA-Z0-9_.:-]+$/.test(target.nativeId)) return fail();
  return JSON.stringify([target.machineId,target.nativeId]);
}
/** 调用者先核对家庭／孩子／分配范围；全部来源状态同等登记，不选择当次活动身份或计算用量。 */
export function buildNativeApplicationManagementObjects(sources: readonly {
  machineId: string; identifications: readonly NativeApplicationIdentification[] | null;
}[]): NativeApplicationManagementObject[] {
  const objects = new Map<string, NativeApplicationManagementObject>();
  for (const source of sources) for (const value of source.identifications ?? []) {
    const identity = parseNativeApplicationIdentification(value);
    const target = {machineId:source.machineId,nativeId:identity.nativeId};
    const key = nativeApplicationManagementTargetKey(target);
    const object = objects.get(key) ?? {target,presentations:[]};
    const presentation = {name:identity.name,status:identity.status,evidence:[...identity.evidence].sort()};
    if (!object.presentations.some(saved => JSON.stringify(saved) === JSON.stringify(presentation)))
      object.presentations.push(presentation);
    objects.set(key,object);
  }
  const ascii = (a:string,b:string) => a<b?-1:a>b?1:0;
  for (const object of objects.values()) object.presentations.sort((a,b)=>ascii(JSON.stringify(a),JSON.stringify(b)));
  return [...objects.values()].sort((a,b)=>ascii(nativeApplicationManagementTargetKey(a.target),nativeApplicationManagementTargetKey(b.target)));
}
export function parseNativeApplicationIdentificationBatch(value: unknown): NativeApplicationIdentificationBatch {
  if (!record(value) || !keys(value,['schemaVersion','childId','localUserId','assignmentVersion','items'])
    || value.schemaVersion !== 1 || !text(value.childId,128) || !text(value.localUserId,256)
    || !revision(value.assignmentVersion) || !Array.isArray(value.items) || value.items.length > 50) return fail();
  const items: NativeApplicationIdentificationBatch['items'] = [], seen = new Set<string>();
  for (const item of value.items) {
    if (!record(item) || !keys(item,['instanceId','revision','observedAtMs','identifications'])
      || !hash(item.instanceId) || seen.has(item.instanceId) || !revision(item.revision)
      || typeof item.observedAtMs !== 'number' || !Number.isSafeInteger(item.observedAtMs)
      || item.observedAtMs < 0 || item.observedAtMs > 253402271999999
      || item.identifications !== null && (!Array.isArray(item.identifications)
        || item.identifications.length < 1 || item.identifications.length > 16)) return fail();
    const identifications = item.identifications === null ? null
      : (item.identifications as unknown[]).map(parseNativeApplicationIdentification);
    if (identifications && new Set(identifications.map(entry=>entry.nativeId)).size !== identifications.length) return fail();
    seen.add(item.instanceId); items.push({instanceId:item.instanceId,revision:item.revision,
      observedAtMs:item.observedAtMs,identifications});
  }
  return {schemaVersion:1,childId:value.childId,localUserId:value.localUserId,assignmentVersion:value.assignmentVersion,items};
}
/** ACK只确认该作用域最新已存命名版本；不证明产品匹配或执行。 */
export function parseNativeApplicationIdentificationReceipt(value: unknown,
  expected: NativeApplicationIdentificationReceipt): NativeApplicationIdentificationReceipt {
  if (!record(value) || !keys(value,['schemaVersion','childId','localUserId','assignmentVersion','items'])
    || value.schemaVersion !== 1 || value.childId !== expected.childId || value.localUserId !== expected.localUserId
    || value.assignmentVersion !== expected.assignmentVersion || !Array.isArray(value.items)
    || value.items.length !== expected.items.length) return fail();
  const items: NativeApplicationIdentificationReceipt['items']=[], seen=new Set<string>();
  for(const item of value.items) {
    if(!record(item)||!keys(item,['instanceId','revision','payloadHash'])||!hash(item.instanceId)
      ||!revision(item.revision)||!hash(item.payloadHash)||seen.has(item.instanceId))return fail();
    const sent=expected.items.find(entry=>entry.instanceId===item.instanceId);
    if(!sent||item.revision<sent.revision||item.revision===sent.revision&&item.payloadHash!==sent.payloadHash)return fail();
    seen.add(item.instanceId);items.push({instanceId:item.instanceId,revision:item.revision,payloadHash:item.payloadHash});
  }
  return {...expected,items};
}
