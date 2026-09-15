export type AppPlatform = 'windows' | 'macos';
export type AppType = 'game' | 'gameLauncher' | 'onlineVideo' | 'mediaPlayer' | 'other' | 'unknown';
export type AppClass = 'study' | 'composite' | 'restrictedEntertainment' | 'unclassified' | 'blocked';
export type EvidenceField = 'runtimeIdentity' | 'binaryHash' | 'packageId' | 'signerKey' | 'productName' | 'declaredType' | 'installationSource';
export interface AppEvidence {
  platform: AppPlatform;
  runtimeIdentity: string;
  displayName: string;
  values: Partial<Record<EvidenceField, string>>;
  verifiedFields: EvidenceField[];
  productId?: string;
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
const strong = new Set<EvidenceField>(['runtimeIdentity', 'binaryHash', 'packageId', 'signerKey']);
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
