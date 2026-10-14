/** 本机命名元数据；不改变实例、产品、分类、统计或执行权限。 */
export const NATIVE_APPLICATION_IDENTIFICATION_CAPABILITY = 'native-application-identification-v1';
export interface NativeApplicationIdentification {
  nativeId: string;
  name: string;
  status: 'identified' | 'dynamic-registry' | 'dynamic-process';
  evidence: string[];
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
