import { describe, expect, it } from 'vitest';
import type { ApplicationKnowledge, ApplicationKnowledgeV4 } from '@timeonchrome/app-runtime-contracts/classification';
import { buildProductBlockPolicy, buildProgramInstanceExecutionPolicy } from '../src/productBlockPolicy';
import { projectAppPolicyForMachine } from '../src/v2Repository';
import { allOpenTimeWindows } from '../src/appPolicy';
import type { AppPolicyDocument } from '../src/contracts';

const sha = (character: string) => character.repeat(64);
const knowledge = (): ApplicationKnowledge => ({
  schemaVersion: 3, version: 7, rules: [], products: [
    { id: 'firefox', name: 'Firefox', type: 'other', selectors: [
      { platform: 'windows', match: { operator: 'all', conditions: [{ field: 'fileSeriesKey', value: sha('a') }] } },
      { platform: 'windows', match: { operator: 'all', conditions: [{ field: 'binaryHash', value: sha('b') }] } },
      { platform: 'windows', match: { operator: 'all', conditions: [
        { field: 'signerKey', value: sha('c') }, { field: 'productName', value: 'Firefox' }] } },
    ], suspectedMatchers: [{ platform: 'windows', signerKey: sha('c'), productName: 'Firefox' }] },
    { id: 'unrelated', name: 'Unrelated', type: 'other', selectors: [
      { platform: 'windows', match: { operator: 'all', conditions: [{ field: 'binaryHash', value: sha('d') }] } },
    ] },
  ], bindings: [
    { childId: 'child-a', products: [{ productId: 'firefox', classification: 'blocked', enhancedBlocking: true }], ruleIds: [] },
    { childId: 'child-b', products: [{ productId: 'firefox', classification: 'study' }], ruleIds: [] },
  ],
});

describe('product block policy', () => {
  it('新执行上下文只下发给协商客户端，不修改存储或将缺能力伪装为空解除', () => {
    const policy: AppPolicyDocument = {version: 3, effectiveAtMs: 100, classifications: [],
      quotas: {dailyCategoryMinutes: {study:null,composite:null,restrictedEntertainment:null,unclassified:null},
        weeklyRestrictedEntertainmentMinutes:null,perApplicationDailyMinutes:[]}, timeWindows: allOpenTimeWindows(),
      programInstanceExecutionPolicy: {schemaVersion: 1, catalogVersion: 7,
        blockedProducts: [{productId: 'firefox', suspectedMatchers: []}]}};
    const before = JSON.stringify(policy);
    for (const supportsOther of [false, true]) {
      expect(projectAppPolicyForMachine(policy, supportsOther)).not.toHaveProperty('programInstanceExecutionPolicy');
      expect(projectAppPolicyForMachine(policy, supportsOther, true).programInstanceExecutionPolicy)
        .toEqual(policy.programInstanceExecutionPolicy);
    }
    expect(JSON.stringify(policy)).toBe(before);
  });
  const catalog = (): ApplicationKnowledgeV4 => {
    const old = knowledge();
    return {...old, schemaVersion: 4, products: old.products.map(({selectors, ...product}) => product),
      ownershipRules: [{id: 'ownership', revision: 1, enabled: true, platform: 'windows', productId: 'firefox',
        match: {kind: 'binaryHash', sha256: sha('b')}}]};
  };

  it('新目录强化仅消费当前孩子已批准双线索，不复制产品识别规则或改目录', () => {
    const data = catalog(), before = JSON.stringify(data);
    expect(buildProgramInstanceExecutionPolicy(data, 'child-a')).toEqual({
      schemaVersion: 1, catalogVersion: 7, blockedProducts: [{
        productId: 'firefox', suspectedMatchers: [{signerKey: sha('c'), productName: 'Firefox'}],
      }],
    });
    expect(buildProgramInstanceExecutionPolicy(data, 'child-b').blockedProducts).toEqual([]);
    expect(() => buildProgramInstanceExecutionPolicy(data, 'missing-child')).toThrow(/unique child binding/);
    expect(JSON.stringify(data)).toBe(before);
  });

  it('新目录解除清空产品封锁，关闭强化保留普通封锁', () => {
    const data = catalog();
    data.bindings[0]!.products[0] = {productId: 'firefox', classification: 'blocked'};
    expect(buildProgramInstanceExecutionPolicy(data, 'child-a').blockedProducts).toEqual([{productId:'firefox',suspectedMatchers:[]}]);
    data.bindings[0]!.products[0] = {productId: 'firefox', classification: 'study'};
    data.version++;
    expect(buildProgramInstanceExecutionPolicy(data, 'child-a')).toEqual({schemaVersion:1,catalogVersion:8,blockedProducts:[]});
  });

  it('新目录重复线索去重，不同产品共用线索不能扩大执行', () => {
    const data = catalog(), hint = data.products[0]!.suspectedMatchers![0]!;
    data.products[0]!.suspectedMatchers!.push({...hint});
    expect(buildProgramInstanceExecutionPolicy(data, 'child-a').blockedProducts[0]!.suspectedMatchers).toHaveLength(1);
    data.products[1]!.suspectedMatchers = [{...hint}];
    expect(buildProgramInstanceExecutionPolicy(data, 'child-a').blockedProducts).toEqual([{productId:'firefox',suspectedMatchers:[]}]);
  });
  it('缺产品或重复孩子范围不能被编译成有效解除', () => {
    const data = catalog();
    data.products = data.products.filter(product => product.id !== 'firefox');
    expect(() => buildProgramInstanceExecutionPolicy(data, 'child-a')).toThrow(/missing from the catalog/);
    data.bindings.push({...data.bindings[0]!});
    expect(() => buildProgramInstanceExecutionPolicy(data, 'child-a')).toThrow(/unique child binding/);
  });
  it('freezes only approved locally verifiable selectors for the blocked child', () => {
    const policy = buildProductBlockPolicy(knowledge(), 'child-a', sha('e'));
    expect(policy).toMatchObject({ schemaVersion: 1, knowledgeVersion: 7, associationVersion: sha('e') });
    expect(policy.entries).toEqual([{ productId: 'firefox', strongMatchers: [
      { field: 'binaryHash', value: sha('b') }, { field: 'fileSeriesKey', value: sha('a') },
    ], suspectedMatchers: [{ signerKey: sha('c'), productName: 'Firefox' }] }]);
    expect(buildProductBlockPolicy(knowledge(), 'child-b', sha('e')).entries).toEqual([]);
  });

  it('does not expand an AND selector or shared selector into a kill rule', () => {
    const data = knowledge();
    data.products[1]!.selectors.push({ platform: 'windows', match: { operator: 'all',
      conditions: [{ field: 'binaryHash', value: sha('b') }] } });
    data.products[1]!.suspectedMatchers = [{ platform: 'windows', signerKey: sha('c'), productName: 'Firefox' }];
    const entry = buildProductBlockPolicy(data, 'child-a', sha('e')).entries[0]!;
    expect(entry.strongMatchers).toEqual([{ field: 'fileSeriesKey', value: sha('a') }]);
    expect(entry.suspectedMatchers).toEqual([]);
  });

  it('removes all product kill rules on explicit unblock without changing other choices', () => {
    const data = knowledge();
    data.bindings[0]!.products[0] = { productId: 'firefox', classification: 'composite' };
    expect(buildProductBlockPolicy(data, 'child-a', sha('e')).entries).toEqual([]);
  });

  it('rejects an oversized snapshot instead of truncating execution rules', () => {
    const data = knowledge();
    data.products[0]!.selectors = Array.from({length: 700}, (_, index) => ({ platform: 'windows' as const,
      match: { operator: 'all' as const, conditions: [{field: 'binaryHash' as const,
        value: index.toString(16).padStart(64, '0')}] } }));
    expect(() => buildProductBlockPolicy(data, 'child-a', sha('e'))).toThrow(/supported capacity/);
  });
});
