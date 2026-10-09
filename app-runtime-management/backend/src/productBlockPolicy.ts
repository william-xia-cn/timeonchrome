import {parseProgramInstanceExecutionPolicy, type ApplicationKnowledge, type ApplicationKnowledgeV4,
  type ProductBlockPolicyV1, type ProgramInstanceExecutionPolicyV1} from '@timeonchrome/app-runtime-contracts/classification';
import { HttpError } from './http';

const strongFields = new Set(['packageId', 'fileSeriesKey', 'binaryHash']);
const key = (field: string, value: string) => `${field}\n${field === 'packageId' ? value.toLowerCase() : value}`;

/** 新目录只编译已批准的独立强化执行；确定归属执行消费实例映射，不再复制匹配规则。 */
export function buildProgramInstanceExecutionPolicy(knowledge: ApplicationKnowledgeV4, childId: string): ProgramInstanceExecutionPolicyV1 {
  const bindings = knowledge.bindings.filter(binding => binding.childId === childId);
  if (bindings.length !== 1) throw new HttpError(409, 'PROGRAM_INSTANCE_EXECUTION_SCOPE_MISSING', 'A unique child binding is required.');
  const owners = new Map<string, Set<string>>();
  for (const product of knowledge.products) for (const hint of product.suspectedMatchers ?? []) {
    if (hint.platform !== 'windows') continue;
    const key = JSON.stringify([hint.signerKey, hint.productName]);
    const products = owners.get(key) ?? new Set<string>();
    products.add(product.id); owners.set(key, products);
  }
  const blockedProducts: ProgramInstanceExecutionPolicyV1['blockedProducts'] = [];
  const products = new Map(knowledge.products.map(product => [product.id, product]));
  for (const choice of bindings[0]!.products) {
    if (choice.classification !== 'blocked') continue;
    const product = products.get(choice.productId);
    if (!product) throw new HttpError(409, 'PROGRAM_INSTANCE_EXECUTION_PRODUCT_MISSING', 'A blocked product is missing from the catalog.');
    const hints = new Map<string, {signerKey: string; productName: string}>();
    for (const hint of choice.enhancedBlocking === true ? product.suspectedMatchers ?? [] : []) {
      const key = JSON.stringify([hint.signerKey, hint.productName]);
      if (hint.platform === 'windows' && owners.get(key)?.size === 1)
        hints.set(key, {signerKey: hint.signerKey, productName: hint.productName});
    }
    const suspectedMatchers = [...hints.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, hint]) => hint);
    blockedProducts.push({productId: choice.productId, suspectedMatchers});
  }
  const policy: ProgramInstanceExecutionPolicyV1 = {schemaVersion: 1, catalogVersion: knowledge.version,
    blockedProducts: blockedProducts.sort((a, b) => a.productId.localeCompare(b.productId))};
  if (new TextEncoder().encode(JSON.stringify(policy)).length > 64_000)
    throw new HttpError(413, 'PRODUCT_BLOCK_POLICY_LIMIT', 'Product block policy exceeds the supported capacity.');
  return parseProgramInstanceExecutionPolicy(policy);
}

/** Compile only reviewed, locally verifiable selectors. Never promote a display name or path. */
export function buildProductBlockPolicy(knowledge: ApplicationKnowledge, childId: string,
    associationVersion: string): ProductBlockPolicyV1 {
  const owners = new Map<string, Set<string>>();
  const suspectedOwners = new Map<string, Set<string>>();
  for (const product of knowledge.products) {
    for (const selector of product.selectors) {
      if (selector.platform !== 'windows') continue;
      // Extracting one condition from an AND expression would broaden the approved scope.
      const conditions = selector.match.operator === 'all' && selector.match.conditions.length !== 1
        ? [] : selector.match.conditions;
      for (const condition of conditions) {
        if (!strongFields.has(condition.field)) continue;
        const matcher = key(condition.field, condition.value);
        const set = owners.get(matcher) ?? new Set<string>();
        set.add(product.id); owners.set(matcher, set);
      }
    }
    for (const hint of product.suspectedMatchers ?? []) {
      const matcher = `${hint.signerKey}\n${hint.productName}`;
      const set = suspectedOwners.get(matcher) ?? new Set<string>();
      set.add(product.id); suspectedOwners.set(matcher, set);
    }
  }
  const binding = knowledge.bindings.find(item => item.childId === childId);
  const entries: ProductBlockPolicyV1['entries'] = [];
  for (const choice of binding?.products ?? []) {
    if (choice.classification !== 'blocked') continue;
    const product = knowledge.products.find(item => item.id === choice.productId);
    if (!product) continue;
    const strongMatchers: ProductBlockPolicyV1['entries'][number]['strongMatchers'] = [];
    for (const selector of product.selectors) {
      if (selector.platform !== 'windows') continue;
      const conditions = selector.match.operator === 'all' && selector.match.conditions.length !== 1
        ? [] : selector.match.conditions;
      for (const condition of conditions) {
        if (!strongFields.has(condition.field) || owners.get(key(condition.field, condition.value))?.size !== 1) continue;
        strongMatchers.push({ field: condition.field as 'packageId' | 'fileSeriesKey' | 'binaryHash',
          value: condition.field === 'packageId' ? condition.value.toLowerCase() : condition.value });
      }
    }
    const suspectedMatchers = choice.enhancedBlocking === true ? (product.suspectedMatchers ?? [])
      .filter(hint => hint.platform === 'windows'
        && suspectedOwners.get(`${hint.signerKey}\n${hint.productName}`)?.size === 1)
      .map(hint => ({ signerKey: hint.signerKey, productName: hint.productName })) : [];
    const approvedStrong = [...new Map(strongMatchers.map(item => [key(item.field, item.value), item])).values()]
      .sort((a, b) => key(a.field, a.value).localeCompare(key(b.field, b.value)));
    const approvedSuspected = [...new Map(suspectedMatchers.map(item => [`${item.signerKey}\n${item.productName}`, item])).values()]
      .sort((a, b) => `${a.signerKey}\n${a.productName}`.localeCompare(`${b.signerKey}\n${b.productName}`));
    if (approvedStrong.length || approvedSuspected.length) entries.push({ productId: product.id,
      strongMatchers: approvedStrong, suspectedMatchers: approvedSuspected });
  }
  const policy: ProductBlockPolicyV1 = { schemaVersion: 1, knowledgeVersion: knowledge.version, associationVersion,
    entries: entries.sort((a, b) => a.productId.localeCompare(b.productId)) };
  if (new TextEncoder().encode(JSON.stringify(policy)).length > 64_000)
    throw new HttpError(413, 'PRODUCT_BLOCK_POLICY_LIMIT', 'Product block policy exceeds the supported capacity.');
  return policy;
}
