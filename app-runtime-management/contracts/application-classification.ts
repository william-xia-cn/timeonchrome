export type AppPlatform = 'windows' | 'macos';
export type AppType = 'game' | 'gameLauncher' | 'onlineVideo' | 'mediaPlayer' | 'other' | 'unknown';
export type AppClass = 'study' | 'composite' | 'restrictedEntertainment' | 'unclassified' | 'blocked';
export type EvidenceField = 'runtimeIdentity' | 'binaryHash' | 'packageId' | 'productKey' | 'hostedAppId' | 'signerKey' | 'productName' | 'declaredType' | 'installationSource';
export interface ApplicationDiscoverySummary {
  role: 'application' | 'component' | 'candidate';
  nameSource: 'appList' | 'manifest' | 'fileMetadata' | 'installation' | 'fallback';
  sourceKinds: Array<'package' | 'registry' | 'shortcut' | 'runtime'>;
  objectKind?: 'product' | 'variant';
  parentProductKey?: string;
  variantRole?: 'main' | 'suiteMember' | 'maintenance' | 'helper' | 'hosted' | 'unknown';
  scope?: 'machine' | 'user';
  sourceKind?: 'registry-machine' | 'registry-user' | 'start-menu-common' | 'start-menu-user' | 'user-packages' | 'runtime';
  evidenceLevel?: 'strong' | 'review' | 'weak';
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
  source: 'registry-machine' | 'registry-user' | 'start-menu-common' | 'start-menu-user' | 'user-packages' | 'runtime';
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
  for (const field of ['productKey', 'hostedAppId', 'packageId', 'binaryHash'] as const) {
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
  selectors: Array<{ platform: AppPlatform; match: MatchExpression }>;
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
  products: Array<{ productId: string; classification: AppClass }>;
  ruleIds: string[];
}
export interface ApplicationKnowledge {
  schemaVersion: 1;
  version: number;
  products: AppProduct[];
  rules: ClassificationRule[];
  bindings: ChildProductBinding[];
}
export interface ClassificationResolution {
  productId: string | null;
  classification: AppClass;
  status: 'explicit' | 'automatic' | 'suggestion' | 'conflict' | 'unclassified';
  ruleIds: string[];
  suggestions: string[];
}
const strong = new Set<EvidenceField>(['runtimeIdentity', 'binaryHash', 'packageId', 'productKey', 'hostedAppId', 'signerKey']);
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
export function resolveApplication(
  knowledge: ApplicationKnowledge, childId: string, evidence: AppEvidence, previous: AppClass = 'unclassified',
): ClassificationResolution {
  const identified = identifyProducts(knowledge.products, evidence);
  // productId supplied by a client is never sufficient to establish identity.
  const productId = identified.length === 1 ? identified[0]! : null;
  const binding = knowledge.bindings.find(item => item.childId === childId);
  const explicit = binding?.products.find(item => item.productId === productId);
  if (identified.length > 1) return { productId: null, classification: previous, status: 'conflict', ruleIds: [], suggestions: [] };
  if (explicit) return { productId, classification: explicit.classification, status: 'explicit', ruleIds: [], suggestions: [] };
  const enabled = new Set(binding?.ruleIds ?? []);
  const candidates = knowledge.rules.filter(rule => rule.enabled && enabled.has(rule.id)
    && (!rule.platform || rule.platform === evidence.platform)
    && (!rule.productId || rule.productId === productId)
    && (rule.productId && !rule.match.conditions.length ? true : matches(rule.match, evidence, rule.mode === 'automatic'))
    && !rule.exclude.some(expression => matches(expression, evidence)));
  const suggestions = candidates.filter(rule => rule.mode === 'suggestion').map(rule => rule.id).sort();
  const automatic = candidates.filter(rule => rule.mode === 'automatic'
    && (rule.productId ? productId !== null : safeAutomatic(rule.match)));
  automatic.sort((a, b) => rank[a.kind] - rank[b.kind] || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const best = automatic.filter(rule => automatic.length && rank[rule.kind] === rank[automatic[0]!.kind]);
  if (best.length) {
    const conflict = new Set(best.map(rule => rule.classification)).size > 1;
    return { productId, classification: conflict ? previous : best[0]!.classification,
      status: conflict ? 'conflict' : 'automatic', ruleIds: best.map(rule => rule.id), suggestions };
  }
  return { productId, classification: suggestions.length ? previous : 'unclassified', status: suggestions.length ? 'suggestion' : 'unclassified', ruleIds: [], suggestions };
}
