import type { ApplicationKnowledge, AppEvidence, MatchExpression, MatchCondition } from './application-classification.js';
import { safeAutomatic } from './application-classification.js';

const platforms = ['windows', 'macos'];
const classes = ['study', 'composite', 'restrictedEntertainment', 'unclassified', 'blocked'];
const types = ['game', 'gameLauncher', 'onlineVideo', 'mediaPlayer', 'other', 'unknown'];
const fields = ['runtimeIdentity', 'binaryHash', 'packageId', 'signerKey', 'productName', 'declaredType', 'installationSource'];
const object = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const text = (value: unknown): value is string => typeof value === 'string' && value.length > 0 && value.length <= 256 && !/[\u0000-\u001f]/u.test(value);
const id = (value: unknown): value is string => text(value) && /^[A-Za-z0-9._:-]+$/u.test(value);
const oneOf = (value: unknown, values: string[]) => typeof value === 'string' && values.includes(value);
const keys = (value: Record<string, unknown>, allowed: string[]) => Object.keys(value).every(key => allowed.includes(key));
const list = (value: unknown, max = 1000): value is unknown[] => Array.isArray(value) && value.length <= max;
const unique = (values: string[]) => new Set(values).size === values.length;

export class ApplicationContractError extends Error {
  constructor(public readonly code: string) { super(code); this.name = 'ApplicationContractError'; }
}
function reject(code: string): never { throw new ApplicationContractError(code); }
function expression(value: unknown, allowEmpty = false): MatchExpression {
  if (!object(value) || !keys(value, ['operator', 'conditions']) || !oneOf(value.operator, ['all', 'any'])
      || !list(value.conditions, 16) || (!allowEmpty && value.conditions.length === 0)) reject('INVALID_MATCH_EXPRESSION');
  const conditions: MatchCondition[] = [];
  for (const item of value.conditions) {
    if (!object(item) || !keys(item, ['field', 'value']) || !oneOf(item.field, fields) || !text(item.value)) reject('INVALID_MATCH_CONDITION');
    conditions.push({ field: item.field as MatchCondition['field'], value: item.value });
  }
  return { operator: value.operator === 'all' ? 'all' : 'any', conditions };
}

/** 拒绝未知字段、脚本、弱自动条件及悬空引用；返回脱离调用方引用的副本。 */
export function parseApplicationKnowledge(value: unknown): ApplicationKnowledge {
  if (!object(value) || !keys(value, ['schemaVersion', 'version', 'products', 'rules', 'bindings'])
      || value.schemaVersion !== 1 || !Number.isSafeInteger(value.version) || Number(value.version) < 0
      || !list(value.products) || !list(value.rules) || !list(value.bindings, 100)) reject('INVALID_APPLICATION_KNOWLEDGE');
  const productIds: string[] = [], ruleIds: string[] = [], childIds: string[] = [];
  for (const product of value.products) {
    if (!object(product) || !keys(product, ['id', 'name', 'type', 'selectors']) || !id(product.id)
        || !text(product.name) || !oneOf(product.type, types) || !list(product.selectors, 64)
        || product.selectors.length === 0) reject('INVALID_PRODUCT');
    productIds.push(product.id);
    for (const selector of product.selectors) {
      if (!object(selector) || !keys(selector, ['platform', 'match']) || !oneOf(selector.platform, platforms)) reject('INVALID_PRODUCT_SELECTOR');
      const match = expression(selector.match);
      if (!safeAutomatic(match)) reject('WEAK_PRODUCT_SELECTOR');
      const precise = (item: {field: string}) => ['runtimeIdentity','binaryHash','packageId'].includes(item.field);
      const narrowedSigner = match.conditions.some(item=>item.field==='signerKey') && match.conditions.some(item=>item.field==='productName');
      if (!(match.operator==='all' ? match.conditions.some(precise)||narrowedSigner : match.conditions.every(precise))) reject('BROAD_PRODUCT_SELECTOR');
    }
  }
  if (!unique(productIds)) reject('DUPLICATE_PRODUCT');
  for (const rule of value.rules) {
    if (!object(rule) || !keys(rule, ['id', 'name', 'kind', 'platform', 'productId', 'match', 'exclude', 'mode', 'classification', 'type', 'enabled', 'source', 'reason'])
        || !id(rule.id) || !text(rule.name) || !oneOf(rule.kind, ['product', 'family', 'developer', 'type'])
        || (rule.platform !== undefined && !oneOf(rule.platform, platforms))
        || (rule.productId !== undefined && (!id(rule.productId) || !productIds.includes(rule.productId)))
        || !oneOf(rule.mode, ['automatic', 'suggestion']) || !oneOf(rule.classification, classes)
        || !oneOf(rule.type, types) || typeof rule.enabled !== 'boolean' || !text(rule.source) || !text(rule.reason)
        || !list(rule.exclude, 32)) reject('INVALID_CLASSIFICATION_RULE');
    const match = expression(rule.match, rule.productId !== undefined);
    for (const item of rule.exclude) expression(item);
    if (rule.mode === 'automatic' && rule.productId === undefined && !safeAutomatic(match)) reject('WEAK_AUTOMATIC_RULE');
    const precise = (item: {field: string}) => ['runtimeIdentity', 'binaryHash', 'packageId'].includes(item.field);
    if (rule.kind === 'product' && rule.productId === undefined
        && !(match.operator === 'all' ? match.conditions.some(precise) : match.conditions.every(precise))) reject('INVALID_PRODUCT_RULE_SCOPE');
    ruleIds.push(rule.id);
  }
  if (!unique(ruleIds)) reject('DUPLICATE_RULE');
  for (const binding of value.bindings) {
    if (!object(binding) || !keys(binding, ['childId', 'products', 'ruleIds']) || !id(binding.childId)
        || !list(binding.products) || !list(binding.ruleIds) || !binding.ruleIds.every(item => id(item) && ruleIds.includes(item))) reject('INVALID_CHILD_BINDING');
    const boundProducts: string[] = [];
    for (const item of binding.products) {
      if (!object(item) || !keys(item, ['productId', 'classification']) || !id(item.productId)
          || !productIds.includes(item.productId) || !oneOf(item.classification, classes)) reject('INVALID_PRODUCT_BINDING');
      boundProducts.push(item.productId);
    }
    if (!unique(boundProducts) || !unique(binding.ruleIds as string[])) reject('DUPLICATE_BINDING');
    childIds.push(binding.childId);
  }
  if (!unique(childIds)) reject('DUPLICATE_CHILD');
  return JSON.parse(JSON.stringify(value)) as ApplicationKnowledge;
}

export function parseAppEvidence(value: unknown): AppEvidence {
  if (!object(value) || !keys(value, ['platform', 'runtimeIdentity', 'displayName', 'values', 'verifiedFields', 'discovery'])
      || !oneOf(value.platform, platforms) || !text(value.runtimeIdentity) || !text(value.displayName)
      || !object(value.values) || !keys(value.values, fields) || !Object.values(value.values).every(text)
      || !list(value.verifiedFields, fields.length) || !value.verifiedFields.every(item => oneOf(item, fields))
      || !unique(value.verifiedFields as string[])) reject('INVALID_APPLICATION_EVIDENCE');
  if (value.discovery !== undefined) {
    const summary = value.discovery;
    if (!object(summary) || !keys(summary, ['role', 'nameSource', 'sourceKinds'])
        || !oneOf(summary.role, ['application', 'component', 'candidate'])
        || !oneOf(summary.nameSource, ['appList', 'manifest', 'fileMetadata', 'installation', 'fallback'])
        || !list(summary.sourceKinds, 4) || !summary.sourceKinds.every(item => oneOf(item, ['package','registry','shortcut','runtime']))
        || !unique(summary.sourceKinds as string[])) reject('INVALID_DISCOVERY_SUMMARY');
  }
  for (const field of value.verifiedFields as string[]) {
    if (field !== 'runtimeIdentity' && value.values[field] === undefined) reject('MISSING_VERIFIED_VALUE');
  }
  const privateValue = /[A-Za-z]:[\\/]|(?:^|\s)\/(?:Users|home|tmp|Volumes|Applications)\b|S-\d-\d+(?:-\d+){2,}|-----BEGIN|[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/u;
  if (privateValue.test(value.runtimeIdentity as string) || privateValue.test(value.displayName as string)
      || Object.values(value.values).some(item=>privateValue.test(item as string))) reject('PRIVATE_APPLICATION_EVIDENCE');
  for (const field of ['binaryHash','signerKey']) if (value.values[field]!==undefined
      && !/^[a-f0-9]{64}$/u.test(value.values[field] as string)) reject('INVALID_OPAQUE_APPLICATION_EVIDENCE');
  return JSON.parse(JSON.stringify(value)) as AppEvidence;
}
