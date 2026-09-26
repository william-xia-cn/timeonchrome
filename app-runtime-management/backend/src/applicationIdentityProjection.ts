import type { AppEvidence, ApplicationKnowledge } from '@timeonchrome/app-runtime-contracts/classification';
import { associateApplicationEvidence, identifyProducts, matches } from '@timeonchrome/app-runtime-contracts/classification';
import type { AppPolicyClassification, ApplicationClassification } from './contracts';

const keyOf = (item: Pick<AppEvidence, 'platform' | 'runtimeIdentity'>) => `${item.platform}\n${item.runtimeIdentity}`;
const usable = (item: AppEvidence) => item.discovery?.role !== 'component'
  && item.discovery?.role !== 'candidate' && item.discovery?.objectKind !== 'packageContainer';

/** Leaf identity is not a suite/container. Never join by name, signer alone or productKey. */
export function leafApplicationAssociations(evidence: AppEvidence[], knowledge?: ApplicationKnowledge): Map<string, string> {
  const leaf = new Set(['runtimeIdentity', 'packageId', 'binaryHash', 'distributionKey', 'hostedAppId']);
  return associateApplicationEvidence(evidence.filter(usable).map(item => {
    const verified = { ...item, verifiedFields: [...new Set([...item.verifiedFields, 'runtimeIdentity' as const])] };
    const products = knowledge ? identifyProducts(knowledge.products, verified) : [];
    const product = products.length === 1 ? knowledge?.products.find(candidate => candidate.id === products[0]) : undefined;
    const approved = item.discovery?.variantRole !== 'suiteMember' && product?.selectors.some(selector =>
      selector.platform === item.platform && matches(selector.match, verified, true)
      && (selector.match.operator === 'all' ? selector.match.conditions.some(condition => leaf.has(condition.field))
        : selector.match.conditions.every(condition => leaf.has(condition.field))));
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
