import type { AppEvidence, ApplicationKnowledge, ProductIdentityProjection } from '@timeonchrome/app-runtime-contracts/classification';
import { associateApplicationEvidence, matches } from '@timeonchrome/app-runtime-contracts/classification';
import type { AppPolicyClassification, ApplicationClassification } from './contracts';
import { sha256Hex } from './crypto';

const keyOf = (item: Pick<AppEvidence, 'platform' | 'runtimeIdentity'>) => `${item.platform}\n${item.runtimeIdentity}`;
const usable = (item: AppEvidence) => item.discovery?.role !== 'component'
  && item.discovery?.role !== 'candidate' && item.discovery?.objectKind !== 'packageContainer';

const leafFields = new Set(['runtimeIdentity', 'packageId', 'binaryHash', 'distributionKey', 'hostedAppId', 'fileSeriesKey']);
function approvedLeafProducts(item: AppEvidence, knowledge?: ApplicationKnowledge) {
  if (!usable(item) || !knowledge) return [];
  const verified = { ...item, verifiedFields: [...new Set([...item.verifiedFields, 'runtimeIdentity' as const])] };
  return knowledge.products.filter(product => product.selectors.some(selector =>
    selector.platform === item.platform && matches(selector.match, verified, true)
    && (selector.match.operator === 'all' ? selector.match.conditions.some(condition => leafFields.has(condition.field))
      : selector.match.conditions.every(condition => leafFields.has(condition.field)))));
}

/** Include approved exact historical identities, without fabricating their missing evidence. */
export function productProjectionEvidence(evidence: AppEvidence[], knowledge: ApplicationKnowledge,
    explicit: AppPolicyClassification[] = []): AppEvidence[] {
  const items = new Map<string, AppEvidence>();
  const conflicts = new Set<string>();
  for (const item of evidence) {
    const key = keyOf(item), prior = items.get(key);
    if (!prior) { items.set(key, item); continue; }
    const values = { ...prior.values };
    const verified = new Set(prior.verifiedFields);
    for (const field of item.verifiedFields) {
      if (!item.values[field]) continue;
      if (values[field] && values[field] !== item.values[field]) { conflicts.add(key); continue; }
      values[field] = item.values[field]; verified.add(field);
    }
    items.set(key, { ...prior, values, verifiedFields: [...verified] });
  }
  for (const key of conflicts) items.set(key, { ...items.get(key)!, values: {}, verifiedFields: [] });
  const add = (platform: AppEvidence['platform'], runtimeIdentity: string, displayName: string) => {
    const key = `${platform}\n${runtimeIdentity}`;
    if (!items.has(key)) items.set(key, { platform, runtimeIdentity, displayName, values: {}, verifiedFields: ['runtimeIdentity'] });
  };
  for (const item of explicit) add(item.platform, item.runtimeIdentity, item.displayName ?? '');
  for (const product of knowledge.products) for (const selector of product.selectors)
    for (const condition of selector.match.conditions)
      if (condition.field === 'runtimeIdentity') add(selector.platform, condition.value, product.name);
  return [...items.values()].map(item => ({ ...item,
    verifiedFields: [...new Set([...item.verifiedFields, 'runtimeIdentity' as const])] }))
    .sort((a,b) => keyOf(a).localeCompare(keyOf(b)));
}

export function productIdentityItems(evidence: AppEvidence[], knowledge: ApplicationKnowledge,
    explicit: AppPolicyClassification[] = []): ProductIdentityProjection['items'] {
  const items = productProjectionEvidence(evidence, knowledge, explicit);
  const aliases = leafApplicationAssociations(items, knowledge);
  const productsByRoot = new Map<string, Set<string>>();
  const membersByRoot = new Map<string, AppEvidence[]>();
  const productsById = new Map(knowledge.products.map(product => [product.id, product]));
  for (const item of items) {
    const root = aliases.get(keyOf(item)) ?? keyOf(item);
    const members = membersByRoot.get(root) ?? [];
    members.push(item); membersByRoot.set(root, members);
    const products = productsByRoot.get(root) ?? new Set<string>();
    for (const product of approvedLeafProducts(item, knowledge)) products.add(product.id);
    productsByRoot.set(root, products);
  }
  // An installation record is a directory container, not an executable selector.
  // Attach it to a confirmed product only when every observed launchable child
  // with the same verified parent key resolves to that one product. A suite with
  // an unknown member or separate Excel/Word products must stay independent.
  const childrenByParent = new Map<string, { products: Set<string>; unresolved: boolean }>();
  for (const item of items) {
    const parent = item.discovery?.parentProductKey;
    if (item.discovery?.objectKind !== 'variant' || item.discovery.role !== 'application'
        || !parent || item.values.productKey !== parent || !item.verifiedFields.includes('productKey')) continue;
    const parentKey = `${item.platform}\n${parent}`;
    const group = childrenByParent.get(parentKey) ?? { products: new Set<string>(), unresolved: false };
    const matched = productsByRoot.get(aliases.get(keyOf(item)) ?? keyOf(item)) ?? new Set<string>();
    if (matched.size !== 1) group.unresolved = true;
    else group.products.add([...matched][0]!);
    childrenByParent.set(parentKey, group);
  }
  for (const item of items) {
    if (item.discovery?.objectKind !== 'product' || !item.values.productKey
        || !item.verifiedFields.includes('productKey')) continue;
    const group = childrenByParent.get(`${item.platform}\n${item.values.productKey}`);
    if (!group || group.unresolved || group.products.size !== 1) continue;
    productsByRoot.get(aliases.get(keyOf(item)) ?? keyOf(item))!.add([...group.products][0]!);
  }
  const projected: ProductIdentityProjection['items'] = items.map(item => {
    const key = keyOf(item), root = aliases.get(key) ?? key;
    const matches = productsByRoot.get(root)!;
    const product = matches.size === 1 ? productsById.get([...matches][0]!) : undefined;
    const conflict = matches.size > 1;
    const members = membersByRoot.get(root)!;
    const associated = !conflict && members.length > 1;
    // One cloud-selected label for a verified alias set; consumers never guess a name.
    const canonicalName = product?.name ?? members.find(member => member.discovery?.nameSource === 'appList')?.displayName
      ?? members.find(member => member.displayName.trim())?.displayName ?? item.displayName;
    return { platform: item.platform, runtimeIdentity: item.runtimeIdentity,
      associationKey: product ? `product:${item.platform}:${product.id}` : conflict ? key : root,
      productId: product?.id ?? null, canonicalName: conflict ? item.displayName : canonicalName,
      status: conflict ? 'conflict' : product ? 'confirmed' : associated ? 'associated' : 'unresolved',
      reasonCode: conflict ? 'IDENTITY_CONFLICT' : product ? 'APPROVED_PRODUCT' : associated ? 'VERIFIED_LEAF_ALIAS' : 'IDENTITY_UNRESOLVED' };
  });
  return projected;
}

export async function buildProductIdentityProjection(evidence: AppEvidence[], knowledge: ApplicationKnowledge,
    explicit: AppPolicyClassification[] = []): Promise<ProductIdentityProjection> {
  const content = { knowledgeVersion: knowledge.version, items: productIdentityItems(evidence, knowledge, explicit) };
  return { version: await sha256Hex(JSON.stringify(content)), ...content };
}

/** Leaf identity is not a suite/container. Never join by name, signer alone or productKey. */
export function leafApplicationAssociations(evidence: AppEvidence[], knowledge?: ApplicationKnowledge): Map<string, string> {
  return associateApplicationEvidence(evidence.filter(usable).map(item => {
    const products = approvedLeafProducts(item, knowledge);
    const product = products.length === 1 ? products[0] : undefined;
    const approved = Boolean(product);
    return { ...item,
      values: { packageId: item.platform === 'windows' ? item.values.packageId?.toLowerCase() : item.values.packageId,
        binaryHash: item.values.binaryHash, ...(approved ? { productKey: `approved:${product!.id}` } : {}) },
      verifiedFields: [...item.verifiedFields.filter(field => field === 'packageId' || field === 'binaryHash'),
        ...(approved ? ['productKey' as const] : [])],
    };
  }));
}

/** Explicit leaf choices outrank suite inheritance. Ambiguous choices never spread. */
export function projectExplicitApplicationClassifications(evidence: AppEvidence[], explicit: AppPolicyClassification[], knowledge?: ApplicationKnowledge,
    previous: AppPolicyClassification[] = []) {
  const identities = new Set(evidence.map(keyOf));
  evidence = [...evidence, ...explicit.filter(item => !identities.has(keyOf(item))).map(item => ({
    platform: item.platform, runtimeIdentity: item.runtimeIdentity, displayName: item.displayName ?? '',
    values: {}, verifiedFields: ['runtimeIdentity' as const],
  }))];
  const result = new Map<string, ApplicationClassification>(explicit.map(item => [keyOf(item), item.classification]));
  const prior = new Map(previous.map(item => [keyOf(item), item.classification]));
  const aliases = leafApplicationAssociations(evidence, knowledge);
  const choices = new Map<string, Set<ApplicationClassification>>();
  for (const entry of explicit) {
    const root = aliases.get(keyOf(entry));
    if (!root) continue;
    const set = choices.get(root) ?? new Set<ApplicationClassification>();
    set.add(entry.classification); choices.set(root, set);
  }
  const parents = new Map<string, Set<ApplicationClassification>>();
  for (const item of evidence.filter(usable)) {
    const selected = result.get(keyOf(item));
    if (selected === undefined || item.discovery?.objectKind !== 'product'
      || !item.verifiedFields.includes('productKey') || !item.values.productKey
      // Old package-family configurations must not silently cover multiple AUMIDs.
      || item.verifiedFields.includes('packageId')) continue;
    const key = `${item.platform}\n${item.values.productKey}`;
    const set = parents.get(key) ?? new Set<ApplicationClassification>();
    set.add(selected); parents.set(key, set);
  }
  for (const item of evidence.filter(usable)) {
    const key = keyOf(item);
    if (result.has(key)) continue;
    const leaf = choices.get(aliases.get(key) ?? key);
    if (leaf?.size) {
      result.set(key, leaf.size === 1 ? [...leaf][0]! : prior.get(key) ?? 'unclassified');
      continue;
    }
    if (item.discovery?.objectKind !== 'variant' || !item.discovery.parentProductKey
      || !item.verifiedFields.includes('productKey')
      || item.values.productKey !== item.discovery.parentProductKey) continue;
    const parent = parents.get(`${item.platform}\n${item.discovery.parentProductKey}`);
    if (parent?.size) result.set(key, parent.size === 1 ? [...parent][0]! : prior.get(key) ?? 'unclassified');
  }
  // A runtime-only alias inherits its installed leaf's already resolved parent, never a sibling's override.
  const inheritedByRoot = new Map<string, Set<ApplicationClassification>>();
  for (const item of evidence.filter(usable)) {
    const root = aliases.get(keyOf(item))!, classification = result.get(keyOf(item));
    if (classification === undefined) continue;
    const set = inheritedByRoot.get(root) ?? new Set<ApplicationClassification>();
    set.add(classification); inheritedByRoot.set(root, set);
  }
  for (const item of evidence.filter(usable)) {
    const key = keyOf(item);
    if (result.has(key)) continue;
    const root = aliases.get(key);
    const inherited = inheritedByRoot.get(root!);
    if (inherited?.size) result.set(key, inherited.size === 1 ? [...inherited][0]! : prior.get(key) ?? 'unclassified');
  }
  return result;
}
