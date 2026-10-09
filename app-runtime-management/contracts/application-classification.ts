import { parseProgramInstanceDescriptor, programInstanceId, type ProgramInstanceDescriptor } from './application-ledger.js';

export type AppPlatform = 'windows' | 'macos';

export const PROGRAM_INSTANCE_REGISTRATION_CAPABILITY = 'program-instance-registration-v1';
export interface ProgramInstanceCapabilities {
  schemaVersion:1;
  enabled:boolean;
  capabilities:string[];
}
export interface ProgramInstanceRegistrationReceipt {
  schemaVersion:1;
  childId:string;
  items:Array<{instanceId:string;evidenceRevision:number;evidenceHash:string}>;
}
/** ACK只确认持久登记，不代表已识别产品；完整匹配请求后才能确认该批队列。 */
export function parseProgramInstanceRegistrationReceipt(value:unknown,
  expected:Pick<ProgramInstanceRegistrationReceipt,'childId'|'items'>):ProgramInstanceRegistrationReceipt {
  const invalid=():never=>{throw new Error('INVALID_PROGRAM_INSTANCE_REGISTRATION_RECEIPT');};
  if(!mappingToken(expected.childId)||!Array.isArray(expected.items)||expected.items.length>100
    ||new Set(expected.items.map(item=>item.instanceId)).size!==expected.items.length
    ||expected.items.some(item=>!mappingHash(item.instanceId)||!mappingHash(item.evidenceHash)||!mappingRevision(item.evidenceRevision))) return invalid();
  if(!mappingRecord(value)||!mappingKeys(value,['schemaVersion','childId','items'])||value.schemaVersion!==1
    ||value.childId!==expected.childId||!Array.isArray(value.items)||value.items.length!==expected.items.length) return invalid();
  const seen=new Set<string>(),items:ProgramInstanceRegistrationReceipt['items']=[];
  for(const item of value.items) {
    if(!mappingRecord(item)||!mappingKeys(item,['instanceId','evidenceRevision','evidenceHash'])
      ||!mappingHash(item.instanceId)||!mappingHash(item.evidenceHash)||!mappingRevision(item.evidenceRevision)
      ||seen.has(item.instanceId)) return invalid();
    const sent=expected.items.find(entry=>entry.instanceId===item.instanceId);
    if(!sent||item.evidenceRevision<sent.evidenceRevision
      ||item.evidenceRevision===sent.evidenceRevision&&item.evidenceHash!==sent.evidenceHash) return invalid();
    seen.add(item.instanceId);items.push({instanceId:item.instanceId,evidenceRevision:item.evidenceRevision,evidenceHash:item.evidenceHash});
  }
  return {schemaVersion:1,childId:expected.childId,items};
}
export function parseProgramInstanceCapabilities(value:unknown):ProgramInstanceCapabilities {
  if(!mappingRecord(value)||!mappingKeys(value,['schemaVersion','enabled','capabilities'])||value.schemaVersion!==1
    ||typeof value.enabled!=='boolean'||!Array.isArray(value.capabilities)||value.capabilities.length>32
    ||!value.capabilities.every(mappingToken)||new Set(value.capabilities).size!==value.capabilities.length
    ||value.enabled!==value.capabilities.includes(PROGRAM_INSTANCE_REGISTRATION_CAPABILITY))
    throw new Error('INVALID_PROGRAM_INSTANCE_CAPABILITIES');
  return {schemaVersion:1,enabled:value.enabled,capabilities:[...value.capabilities]};
}

/** 第二层规则只表达证据到产品的关系；不包含孩子、实例、分类或显示名。 */
export type ProductOwnershipMatch =
  | { kind: 'binaryHash'; sha256: string }
  | { kind: 'windowsAumid'; aumid: string }
  | { kind: 'windowsFileSeries'; fileSeriesKey: string }
  | { kind: 'macosSignature'; signerKey: string; signingIdentifier: string };
export interface ProductOwnershipRule {
  id: string;
  revision: number;
  enabled: boolean;
  platform: AppPlatform;
  productId: string;
  match: ProductOwnershipMatch;
}
/** 只接收采集层核验的证据；这里不执行OS验签，也不把客户端声明当作权限。 */
export interface ProductOwnershipEvidence {
  platform: AppPlatform;
  verified: {
    binaryHash?: string;
    windowsAumid?: string;
    windowsFileSeriesKey?: string;
    macosSignerKey?: string;
    macosSigningIdentifier?: string;
  };
}
export interface ProductOwnershipResult {
  status: 'confirmed' | 'unresolved' | 'conflict';
  productId: string | null;
  ruleIds: string[];
}
/** 调用者必须先核验机器凭据及历史分配；不能把请求本身构造为授权范围。 */
export interface ProgramInstanceRegistrationScope {
  machineId: string;
  childId: string;
  localUserId: string;
  assignmentVersion: number;
}
export interface ProgramInstanceRegistrationBatch {
  schemaVersion: 1;
  childId: string;
  localUserId: string;
  assignmentVersion: number;
  items: Array<{instance: ProgramInstanceDescriptor; evidenceRevision: number; evidence: ProductOwnershipEvidence}>;
}
export interface ProgramInstanceMappingReadRequest {
  childId: string;
  localUserId: string;
  assignmentVersion: number;
  instanceIds: string[];
}
export interface ProgramInstanceMappingReadResponse {
  schemaVersion: 1;
  childId: string;
  assignmentVersion: number;
  catalogVersion: number | null;
  items: Array<{instanceId:string; evidenceRevision:number;
    status:'confirmed'|'unresolved'|'conflict'|'pending'; productId:string|null}>;
  products: Array<{id:string;name:string}>;
}
/** 独立产品投影的只读输入；沿用目录属性和孩子配置，不存余额或重复特殊标记。 */
export interface ProgramInstanceProjectionContext extends Omit<ProgramInstanceMappingReadResponse,'schemaVersion'|'products'> {
  schemaVersion: 2;
  products: Array<Pick<AppProduct,'id'|'name'|'type'|'catalogGroup'>>;
  rules: ClassificationRule[];
  binding: ChildProductBinding;
}
const mappingRecord = (v:unknown): v is Record<string,unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const mappingKeys = (v:Record<string,unknown>,keys:string[]) => Object.keys(v).length === keys.length && keys.every(k=>Object.hasOwn(v,k));
const mappingToken = (v:unknown): v is string => typeof v === 'string' && v.length > 0 && v.length <= 256 && !/[\u0000-\u001f\u007f]/.test(v);
const mappingRevision = (v:unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= 1;
const mappingHash = (v:unknown): v is string => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v);
export function parseProgramInstanceMappingReadRequest(value:unknown):ProgramInstanceMappingReadRequest {
  if (!mappingRecord(value) || !mappingKeys(value,['childId','localUserId','assignmentVersion','instanceIds'])
    || !mappingToken(value.childId) || !mappingToken(value.localUserId) || !mappingRevision(value.assignmentVersion)
    || !Array.isArray(value.instanceIds) || value.instanceIds.length < 1 || value.instanceIds.length > 100
    || !value.instanceIds.every(mappingHash) || new Set(value.instanceIds).size !== value.instanceIds.length)
    throw new Error('INVALID_PROGRAM_INSTANCE_MAPPING_READ');
  return {childId:value.childId,localUserId:value.localUserId,assignmentVersion:value.assignmentVersion,instanceIds:[...value.instanceIds]};
}
/** 与实际发出的请求核对，避免迟到或缺项响应成为当前缓存。 */
export function parseProgramInstanceMappingReadResponse(value:unknown,request:ProgramInstanceMappingReadRequest):ProgramInstanceMappingReadResponse {
  const expected=parseProgramInstanceMappingReadRequest(request);
  const fail=():never=>{throw new Error('INVALID_PROGRAM_INSTANCE_MAPPING_RESPONSE');};
  if (!mappingRecord(value) || !mappingKeys(value,['schemaVersion','childId','assignmentVersion','catalogVersion','items','products'])
    || value.schemaVersion!==1 || value.childId!==expected.childId || value.assignmentVersion!==expected.assignmentVersion
    || (value.catalogVersion!==null && !(typeof value.catalogVersion==='number' && Number.isSafeInteger(value.catalogVersion) && value.catalogVersion>=0))
    || !Array.isArray(value.items) || value.items.length!==expected.instanceIds.length || !Array.isArray(value.products)
    || value.products.length>value.items.length) return fail();
  const products:ProgramInstanceMappingReadResponse['products']=[], productIds=new Set<string>();
  for (const p of value.products) {
    if (!mappingRecord(p) || !mappingKeys(p,['id','name']) || !mappingToken(p.id)
      || typeof p.name!=='string' || !p.name.length || p.name.length>256 || /[\u0000-\u001f]/.test(p.name)
      || productIds.has(p.id)) return fail();
    productIds.add(p.id); products.push({id:p.id,name:p.name});
  }
  const items:ProgramInstanceMappingReadResponse['items']=[], seen=new Set<string>(), usedProducts=new Set<string>();
  for (const item of value.items) {
    if (!mappingRecord(item) || !mappingKeys(item,['instanceId','evidenceRevision','status','productId'])
      || !mappingHash(item.instanceId) || !expected.instanceIds.includes(item.instanceId) || seen.has(item.instanceId)
      || !mappingRevision(item.evidenceRevision)
      || (item.status!=='confirmed' && item.status!=='unresolved' && item.status!=='conflict' && item.status!=='pending')
      || (value.catalogVersion===null && item.status!=='pending')) return fail();
    if (item.status==='confirmed') {
      if (!mappingToken(item.productId) || !productIds.has(item.productId)) return fail();
      usedProducts.add(item.productId);
    } else if (item.productId!==null) return fail();
    seen.add(item.instanceId);
    items.push({instanceId:item.instanceId,evidenceRevision:item.evidenceRevision,status:item.status,
      productId:typeof item.productId==='string'?item.productId:null});
  }
  if (usedProducts.size!==productIds.size) return fail();
  return {schemaVersion:1,childId:expected.childId,assignmentVersion:expected.assignmentVersion,
    catalogVersion:value.catalogVersion,items,products};
}
export async function parseProgramInstanceRegistrationBatch(value: unknown,
  scope: ProgramInstanceRegistrationScope): Promise<ProgramInstanceRegistrationBatch> {
  const record = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
  const exact = (v: Record<string, unknown>, keys: string[]) => Object.keys(v).length === keys.length
    && keys.every(key => Object.hasOwn(v, key));
  const id = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && v.length <= 256
    && !/[\u0000-\u001f\u007f]/.test(v);
  const fail = (): never => { throw new Error('INVALID_PROGRAM_INSTANCE_REGISTRATION'); };
  if (!scope || !id(scope.machineId) || !id(scope.childId) || !id(scope.localUserId)
    || !Number.isSafeInteger(scope.assignmentVersion) || scope.assignmentVersion < 0
    || !record(value) || !exact(value, ['schemaVersion', 'childId', 'localUserId', 'assignmentVersion', 'items'])
    || value.schemaVersion !== 1 || value.childId !== scope.childId || value.localUserId !== scope.localUserId
    || value.assignmentVersion !== scope.assignmentVersion || !Array.isArray(value.items) || value.items.length > 100) return fail();
  const items: ProgramInstanceRegistrationBatch['items'] = [], seen = new Set<string>();
  for (const entry of value.items) {
    if (!record(entry) || !exact(entry, ['instance', 'evidenceRevision', 'evidence'])
      || typeof entry.evidenceRevision !== 'number' || !Number.isSafeInteger(entry.evidenceRevision)
      || entry.evidenceRevision < 1) return fail();
    const instance = parseProgramInstanceDescriptor(entry.instance);
    const evidence = parseProductOwnershipEvidence(entry.evidence);
    if (instance.machineId !== scope.machineId || evidence.platform !== instance.platform
      || (evidence.verified.binaryHash !== undefined && evidence.verified.binaryHash !== instance.executableSha256)) return fail();
    const key = await programInstanceId(instance);
    if (seen.has(key)) return fail();
    seen.add(key);
    items.push({instance, evidenceRevision: entry.evidenceRevision, evidence});
  }
  return {schemaVersion: 1, childId: scope.childId, localUserId: scope.localUserId,
    assignmentVersion: scope.assignmentVersion, items};
}
export function parseProductOwnershipEvidence(value: unknown): ProductOwnershipEvidence {
  const record = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
  if (!record(value) || Object.keys(value).length !== 2 || !Object.hasOwn(value, 'platform')
    || !record(value.verified) || (value.platform !== 'windows' && value.platform !== 'macos'))
    throw new Error('INVALID_PRODUCT_OWNERSHIP_EVIDENCE');
  const allowed = value.platform === 'windows' ? ['binaryHash', 'windowsAumid', 'windowsFileSeriesKey']
    : ['binaryHash', 'macosSignerKey', 'macosSigningIdentifier'];
  for (const [key, entry] of Object.entries(value.verified)) {
    if (!allowed.includes(key) || typeof entry !== 'string' || entry.length === 0 || entry.length > 256
      || /[\u0000-\u001f\u007f\\/]/.test(entry)) throw new Error('INVALID_PRODUCT_OWNERSHIP_EVIDENCE');
    if (key === 'windowsAumid' ? !/^[^!\s]+![^!\s]+$/.test(entry)
      : key === 'macosSigningIdentifier' ? false : !/^[a-f0-9]{64}$/.test(entry))
      throw new Error('INVALID_PRODUCT_OWNERSHIP_EVIDENCE');
  }
  return {platform: value.platform === 'windows' ? 'windows' : 'macos', verified: {...value.verified}};
}
/** 第三层结果：不复制目录名称或孩子分类。实例ID的生成独立于产品匹配。 */
export interface ProgramInstanceProductMapping {
  childId: string;
  ruleSetVersion: number;
  items: Array<ProductOwnershipResult & { instanceId: string }>;
}
export function buildProgramInstanceProductMapping(
  childId: string, ruleSetVersion: number, productIds: readonly string[], rules: readonly ProductOwnershipRule[],
  instances: readonly { instanceId: string; evidence: ProductOwnershipEvidence }[],
): ProgramInstanceProductMapping {
  const identifier = (value: unknown): value is string => typeof value === 'string' && value.length > 0
    && value.length <= 256 && !/[\u0000-\u001f\u007f]/.test(value);
  if (!identifier(childId) || !Number.isSafeInteger(ruleSetVersion) || ruleSetVersion < 0
    || productIds.some(id => !identifier(id)) || new Set(productIds).size !== productIds.length)
    throw new Error('INVALID_PROGRAM_INSTANCE_MAPPING');
  const products = new Set(productIds), seen = new Set<string>();
  // 即使无实例，也校验整个规则集，不让无效配置待到首次使用才暴露。
  validateProductOwnershipRules(rules);
  if (rules.some(rule => !products.has(rule.productId))) throw new Error('PRODUCT_OWNERSHIP_TARGET_MISSING');
  const items = instances.map(instance => {
    if (!identifier(instance.instanceId) || seen.has(instance.instanceId)
      || Object.keys(instance).length !== 2 || !Object.hasOwn(instance, 'evidence'))
      throw new Error('INVALID_PROGRAM_INSTANCE_MAPPING');
    seen.add(instance.instanceId);
    return {instanceId: instance.instanceId, ...matchProductOwnership(rules, parseProductOwnershipEvidence(instance.evidence))};
  }).sort((a, b) => a.instanceId < b.instanceId ? -1 : a.instanceId > b.instanceId ? 1 : 0);
  return {childId, ruleSetVersion, items};
}
/** 首版云端调用；纯函数可用于跨端共同向量，不授权终端建立另一套映射。 */
export function resolveProductOwnership(rules: readonly ProductOwnershipRule[], evidence: ProductOwnershipEvidence): ProductOwnershipResult {
  validateProductOwnershipRules(rules);
  return matchProductOwnership(rules, parseProductOwnershipEvidence(evidence));
}
function validateProductOwnershipRules(rules: readonly ProductOwnershipRule[]): void {
  const hash = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
  const token = (value: unknown): value is string => typeof value === 'string' && value.length > 0
    && value.length <= 256 && !/[\u0000-\u001f\u007f]/.test(value);
  const exactKeys = (value: object, keys: string[]) => Object.keys(value).length === keys.length
    && keys.every(key => Object.hasOwn(value, key));
  const ids = new Set<string>();
  for (const rule of rules) {
    if (!rule || !exactKeys(rule, ['id', 'revision', 'enabled', 'platform', 'productId', 'match'])
      || !token(rule.id) || ids.has(rule.id) || !token(rule.productId)
      || !Number.isSafeInteger(rule.revision) || rule.revision < 1 || typeof rule.enabled !== 'boolean'
      || !['windows', 'macos'].includes(rule.platform) || !rule.match) throw new Error('INVALID_PRODUCT_OWNERSHIP_RULE');
    ids.add(rule.id);
    const m = rule.match;
    const valid = m.kind === 'binaryHash' ? exactKeys(m, ['kind', 'sha256']) && hash(m.sha256)
      : m.kind === 'windowsAumid' ? rule.platform === 'windows' && exactKeys(m, ['kind', 'aumid'])
        && token(m.aumid) && /^[^!\s]+![^!\s]+$/.test(m.aumid)
      : m.kind === 'windowsFileSeries' ? rule.platform === 'windows' && exactKeys(m, ['kind', 'fileSeriesKey']) && hash(m.fileSeriesKey)
      : m.kind === 'macosSignature' ? rule.platform === 'macos' && exactKeys(m, ['kind', 'signerKey', 'signingIdentifier'])
        && hash(m.signerKey) && token(m.signingIdentifier) : false;
    if (!valid) throw new Error('INVALID_PRODUCT_OWNERSHIP_RULE');
  }
}
export function parseProductOwnershipRules(value: unknown, productIds: readonly string[]): ProductOwnershipRule[] {
  if (!Array.isArray(value) || value.length > 1000) throw new Error('INVALID_PRODUCT_OWNERSHIP_RULE');
  validateProductOwnershipRules(value);
  if (value.some(rule => !productIds.includes(rule.productId))) throw new Error('PRODUCT_OWNERSHIP_TARGET_MISSING');
  return value.map(rule => ({...rule, match: {...rule.match}}));
}
function matchProductOwnership(rules: readonly ProductOwnershipRule[], evidence: ProductOwnershipEvidence): ProductOwnershipResult {
  const matched = rules.filter(rule => {
    if (!rule.enabled || rule.platform !== evidence.platform) return false;
    const m = rule.match, v = evidence.verified;
    switch (m.kind) {
      case 'binaryHash': return v.binaryHash === m.sha256;
      case 'windowsAumid': return v.windowsAumid === m.aumid;
      case 'windowsFileSeries': return v.windowsFileSeriesKey === m.fileSeriesKey;
      case 'macosSignature': return v.macosSignerKey === m.signerKey && v.macosSigningIdentifier === m.signingIdentifier;
    }
  });
  const products = new Set(matched.map(rule => rule.productId));
  return {status: products.size === 1 ? 'confirmed' : products.size > 1 ? 'conflict' : 'unresolved',
    productId: products.size === 1 ? [...products][0]! : null, ruleIds: matched.map(rule => rule.id).sort()};
}

export type AppType = 'game' | 'gameLauncher' | 'gameUtility' | 'onlineVideo' | 'mediaPlayer' | 'other' | 'unknown';
export type AppTypeStatus = 'confirmed' | 'suggested' | 'unknown';
export type AppTypeReasonCode = 'distributionProductRule' | 'exactPackageRule' | 'verifiedProductRule' | 'exactNameSuggestion' | 'none';
export type AppClass = 'study' | 'composite' | 'restrictedEntertainment' | 'unclassified' | 'other' | 'blocked';
export type ApplicationOrigin = 'user' | 'operatingSystem' | 'unknown';
export type ApplicationOriginEvidenceCode = 'exactPackageRule' | 'osMetadata' | 'reviewedSystemBinary';
export type CatalogGroup = 'application' | 'game' | 'systemTool';
export type CatalogGroupReasonCode = 'DEFAULT_APPLICATION' | 'CONFIRMED_GAME_TYPE'
  | 'CONFIRMED_GAME_LAUNCHER_TYPE' | 'CONFIRMED_GAME_UTILITY_TYPE' | 'EXACT_SYSTEM_TOOL_RULE';
export type EvidenceField = 'runtimeIdentity' | 'binaryHash' | 'packageId' | 'distributionKey' | 'productKey' | 'hostedAppId' | 'signerKey' | 'fileSeriesKey' | 'productName' | 'declaredType' | 'installationSource';
/** Cloud-owned immutable policy projection; consumers must not infer additional aliases. */
export interface ProductIdentityProjection {
  version: string;
  knowledgeVersion: number;
  items: ProductIdentityProjectionItem[];
}
export interface ProductIdentityProjectionItem {
  platform: AppPlatform;
  runtimeIdentity: string;
  associationKey: string;
  productId: string | null;
  canonicalName: string;
  status: 'confirmed' | 'associated' | 'unresolved' | 'conflict';
  reasonCode: 'APPROVED_PRODUCT' | 'VERIFIED_LEAF_ALIAS' | 'IDENTITY_UNRESOLVED' | 'IDENTITY_CONFLICT';
  /** @deprecated 仅供旧客户端兼容；新版从所属AppProduct.catalogGroup读取，不作为完整性条件。 */
  isChromeContainer?: boolean;
}
export interface ApplicationDiscoverySummary {
  role: 'application' | 'component' | 'candidate';
  nameSource: 'appList' | 'manifest' | 'fileMetadata' | 'installation' | 'fallback';
  sourceKinds: Array<'package' | 'registry' | 'shortcut' | 'runtime' | 'distribution-steam' | 'distribution-epic' | 'distribution-ea' | 'distribution-ubisoft' | 'distribution-gog'>;
  objectKind?: 'product' | 'variant' | 'packageContainer';
  parentProductKey?: string;
  variantRole?: 'main' | 'suiteMember' | 'maintenance' | 'helper' | 'hosted' | 'unknown';
  scope?: 'machine' | 'user';
  sourceKind?: 'registry-machine' | 'registry-user' | 'start-menu-common' | 'start-menu-user' | 'user-packages' | 'runtime' | 'distribution-steam' | 'distribution-epic' | 'distribution-ea' | 'distribution-ubisoft' | 'distribution-gog';
  evidenceLevel?: 'strong' | 'review' | 'weak';
  /** Agent advisory evidence only. Cloud catalog projection remains authoritative. */
  applicationOrigin?: ApplicationOrigin;
  /** Agent advisory evidence only. Cloud catalog projection remains authoritative. */
  originEvidenceCode?: ApplicationOriginEvidenceCode;
}
export interface AppEvidence {
  platform: AppPlatform;
  runtimeIdentity: string;
  displayName: string;
  values: Partial<Record<EvidenceField, string>>;
  verifiedFields: EvidenceField[];
  productId?: string;
  discovery?: ApplicationDiscoverySummary;
}
export interface MatchCondition { field: EvidenceField; value: string }
export interface ApplicationInstallationObservation {
  localUserId: string;
  evidence: AppEvidence;
  status: 'installed' | 'runtimeObserved' | 'notObserved';
}
export interface ApplicationInventoryBatch {
  schemaVersion: 1;
  batchId: string;
  observations: ApplicationInstallationObservation[];
  scan?: ApplicationInventoryScan;
}
export interface InventorySourceResult {
  source: 'registry-machine' | 'registry-user' | 'start-menu-common' | 'start-menu-user' | 'user-packages' | 'runtime' | 'distribution-steam' | 'distribution-epic' | 'distribution-ea' | 'distribution-ubisoft' | 'distribution-gog';
  status: 'complete' | 'complete_with_warnings' | 'failed';
  observationCount: number;
  warningCodes: string[];
}
export interface InstallationProductObservation {
  localUserId: string;
  productKey: string;
  evidence: AppEvidence;
  scope: 'machine' | 'user';
  sourceKind: InventorySourceResult['source'];
  status: 'installed' | 'notObserved';
}
export interface ApplicationVariantObservation {
  localUserId: string;
  variantKey: string;
  parentProductKey?: string;
  evidence: AppEvidence;
  variantRole: 'main' | 'suiteMember' | 'maintenance' | 'helper' | 'hosted' | 'unknown';
  scope: 'machine' | 'user';
  sourceKind: InventorySourceResult['source'];
  status: 'installed' | 'runtimeObserved' | 'notObserved';
}
export interface ApplicationInventoryBatchV2 {
  schemaVersion: 2;
  batchId: string;
  products: InstallationProductObservation[];
  variants: ApplicationVariantObservation[];
  scan?: ApplicationInventoryScanV2;
}
export interface ApplicationInventoryScanV2 {
  scanId: string;
  localUserId: string;
  batchIndex: number;
  batchCount: number;
  productCount: number;
  variantCount: number;
  sourceResults: InventorySourceResult[];
  completed: boolean;
}
export interface ApplicationInventoryScan {
  scanId: string;
  localUserId: string;
  batchIndex: number;
  batchCount: number;
  observationCount: number;
  failedSources: string[];
  completed: boolean;
}

/** 展示关联不是产品确认。异包入口和同名应用不能因共享名称/二进制被强制合并。 */
export function applicationAssociationKeys(evidence: AppEvidence): string[] {
  const keys = [`identity:${evidence.platform}:${evidence.runtimeIdentity}`];
  for (const field of ['distributionKey', 'productKey', 'hostedAppId', 'packageId', 'binaryHash'] as const) {
    if (evidence.verifiedFields.includes(field) && evidence.values[field]) keys.push(`${field}:${evidence.platform}:${evidence.values[field]}`);
  }
  return keys;
}
export function associateApplicationEvidence(evidence: AppEvidence[]): Map<string, string> {
  const parents = new Map(evidence.map(item=>[`${item.platform}\n${item.runtimeIdentity}`,`${item.platform}\n${item.runtimeIdentity}`]));
  const root = (key:string):string => { const parent=parents.get(key)!; return parent===key?key:root(parent); };
  const union = (left:string,right:string) => { const a=root(left),b=root(right); if(a!==b)parents.set(a<b?b:a,a<b?a:b); };
  const groups = new Map<string,AppEvidence[]>();
  for (const item of evidence) for(const key of applicationAssociationKeys(item)) {const group=groups.get(key)??[];group.push(item);groups.set(key,group);}
  for(const [key,group] of groups) {
    if(key.startsWith('binaryHash:')) {
      const packages = new Set(group.filter(item=>item.verifiedFields.includes('packageId')).map(item=>item.values.packageId).filter(Boolean));
      if(packages.size>1) continue; // Shared executable hosting multiple package apps is ambiguous.
    }
    const first=group[0]!;
    for(const item of group)union(`${first.platform}\n${first.runtimeIdentity}`,`${item.platform}\n${item.runtimeIdentity}`);
  }
  return new Map([...parents.keys()].map(key=>[key,root(key)]));
}
export interface ApplicationInventoryAck {
  batchId: string;
  status: 'accepted' | 'duplicate';
  acceptedCount: number;
}
export interface MatchExpression { operator: 'all' | 'any'; conditions: MatchCondition[] }
export interface AppProduct {
  id: string;
  name: string;
  type: AppType;
  /** 单一产品目录属性；与管理分类other、quotaBucket独立。 */
  catalogGroup?: 'specialApplication';
  selectors: Array<{ platform: AppPlatform; match: MatchExpression }>;
  /** Explicitly reviewed, non-authoritative execution hints. Never establish product identity. */
  suspectedMatchers?: Array<{ platform: 'windows'; signerKey: string; productName: string }>;
}
/** 只消费可信产品关联；未关联普通对象不需要额外的“非浏览器”资格。 */
export function isSpecialApplicationProduct(productId: string | null | undefined,
  knowledge: ApplicationKnowledge | undefined): boolean {
  return Boolean(productId && knowledge?.products.some(product =>
    product.id === productId && product.catalogGroup === 'specialApplication'));
}
export interface ClassificationRule {
  id: string;
  name: string;
  kind: 'product' | 'family' | 'developer' | 'type';
  platform?: AppPlatform;
  productId?: string;
  match: MatchExpression;
  exclude: MatchExpression[];
  mode: 'automatic' | 'suggestion';
  classification: AppClass;
  type: AppType;
  enabled: boolean;
  source: string;
  reason: string;
}
export interface ChildProductBinding {
  childId: string;
  products: Array<{ productId: string; classification: AppClass; enhancedBlocking?: boolean }>;
  ruleIds: string[];
}
export interface ApplicationKnowledge {
  schemaVersion: 1 | 2 | 3;
  version: number;
  products: AppProduct[];
  rules: ClassificationRule[];
  bindings: ChildProductBinding[];
}
/** 产品归属只由ownershipRules定义；rules保留分类配置，不承担身份确认。 */
export interface ApplicationKnowledgeV4 extends Omit<ApplicationKnowledge, 'schemaVersion' | 'products'> {
  schemaVersion: 4;
  products: Array<Omit<AppProduct, 'selectors'>>;
  ownershipRules: ProductOwnershipRule[];
}
export interface ProductBlockPolicyV1 {
  schemaVersion: 1;
  knowledgeVersion: number;
  associationVersion: string;
  entries: Array<{
    productId: string;
    strongMatchers: Array<{ field: 'packageId' | 'fileSeriesKey' | 'binaryHash'; value: string }>;
    suspectedMatchers: Array<{ signerKey: string; productName: string }>;
  }>;
}
export interface ClassificationResolution {
  productId: string | null;
  classification: AppClass;
  status: 'explicit' | 'automatic' | 'suggestion' | 'conflict' | 'unclassified';
  ruleIds: string[];
  suggestions: string[];
  appType: AppType;
  typeStatus: AppTypeStatus;
  typeReasonCode: AppTypeReasonCode;
}
const strong = new Set<EvidenceField>(['runtimeIdentity', 'binaryHash', 'packageId', 'distributionKey', 'productKey', 'hostedAppId', 'signerKey', 'fileSeriesKey']);
const rank = { product: 0, family: 1, developer: 1, type: 2 };
export function safeAutomatic(expression: MatchExpression): boolean {
  if (!expression.conditions.length) return false;
  return expression.operator === 'all'
    ? expression.conditions.some(condition => strong.has(condition.field))
    : expression.operator === 'any' && expression.conditions.every(condition => strong.has(condition.field));
}
export function matches(expression: MatchExpression, evidence: AppEvidence, requireVerified = false): boolean {
  if (!expression.conditions.length) return false;
  const conditionMatches = (condition: MatchCondition): boolean => {
    const actual = condition.field === 'runtimeIdentity' ? evidence.runtimeIdentity : evidence.values[condition.field];
    return actual === condition.value
      && (!requireVerified || !strong.has(condition.field) || evidence.verifiedFields.includes(condition.field));
  };
  return expression.operator === 'all'
    ? expression.conditions.every(conditionMatches)
    : expression.operator === 'any' && expression.conditions.some(conditionMatches);
}
export function identifyProducts(products: AppProduct[], evidence: AppEvidence): string[] {
  return products.filter(product => product.selectors.some(selector =>
    selector.platform === evidence.platform && safeAutomatic(selector.match)
    && matches(selector.match, evidence, true))).map(product => product.id).sort();
}
export function resolveProductType(knowledge: ApplicationKnowledge, evidence: AppEvidence): {
  productId: string | null; appType: AppType; typeStatus: AppTypeStatus; typeReasonCode: AppTypeReasonCode;
} {
  const identified = identifyProducts(knowledge.products, evidence);
  if (identified.length !== 1) return { productId: null, appType: 'unknown', typeStatus: 'unknown', typeReasonCode: 'none' };
  const product = knowledge.products.find(item => item.id === identified[0])!;
  const matched = product.selectors.find(selector => selector.platform === evidence.platform
    && safeAutomatic(selector.match) && matches(selector.match, evidence, true));
  const fields = new Set(matched?.match.conditions.map(item => item.field) ?? []);
  const reason: AppTypeReasonCode = fields.has('distributionKey') ? 'distributionProductRule'
    : fields.has('packageId') ? 'exactPackageRule' : 'verifiedProductRule';
  return { productId: product.id, appType: product.type, typeStatus: product.type === 'unknown' ? 'unknown' : 'confirmed',
    typeReasonCode: product.type === 'unknown' ? 'none' : reason };
}
export function resolveApplication(
  knowledge: ApplicationKnowledge, childId: string, evidence: AppEvidence, previous: AppClass = 'unclassified',
): ClassificationResolution {
  const identified = identifyProducts(knowledge.products, evidence);
  const productType = resolveProductType(knowledge, evidence);
  // productId supplied by a client is never sufficient to establish identity.
  const productId = identified.length === 1 ? identified[0]! : null;
  const binding = knowledge.bindings.find(item => item.childId === childId);
  const explicit = binding?.products.find(item => item.productId === productId);
  const typed = { appType: productType.appType, typeStatus: productType.typeStatus, typeReasonCode: productType.typeReasonCode };
  if (identified.length > 1) return { productId: null, classification: previous, status: 'conflict', ruleIds: [], suggestions: [], ...typed };
  if (explicit) return { productId, classification: explicit.classification, status: 'explicit', ruleIds: [], suggestions: [], ...typed };
  const enabled = new Set(binding?.ruleIds ?? []);
  const candidates = knowledge.rules.filter(rule => rule.enabled && enabled.has(rule.id)
    && (!rule.platform || rule.platform === evidence.platform)
    && (!rule.productId || rule.productId === productId)
    && (knowledge.schemaVersion >= 2 && rule.kind === 'type' && !rule.match.conditions.length
      ? productType.typeStatus === 'confirmed' && productType.appType === rule.type
      : rule.productId && !rule.match.conditions.length ? true : matches(rule.match, evidence, rule.mode === 'automatic'))
    && !rule.exclude.some(expression => matches(expression, evidence)));
  const suggestions = candidates.filter(rule => rule.mode === 'suggestion').map(rule => rule.id).sort();
  const automatic = candidates.filter(rule => rule.mode === 'automatic'
    && (knowledge.schemaVersion >= 2 && rule.kind === 'type' && !rule.match.conditions.length
      ? productType.typeStatus === 'confirmed' && productType.appType !== 'unknown'
      : rule.productId ? productId !== null : safeAutomatic(rule.match)));
  automatic.sort((a, b) => rank[a.kind] - rank[b.kind] || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const best = automatic.filter(rule => automatic.length && rank[rule.kind] === rank[automatic[0]!.kind]);
  if (best.length) {
    const conflict = new Set(best.map(rule => rule.classification)).size > 1;
    return { productId, classification: conflict ? previous : best[0]!.classification,
      status: conflict ? 'conflict' : 'automatic', ruleIds: best.map(rule => rule.id), suggestions, ...typed };
  }
  return { productId, classification: suggestions.length ? previous : 'unclassified', status: suggestions.length ? 'suggestion' : 'unclassified', ruleIds: [], suggestions, ...typed };
}
