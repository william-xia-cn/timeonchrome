import { describe, expect, it } from 'vitest';
import type { ApplicationKnowledge } from '@timeonchrome/app-runtime-contracts/classification';
import { buildProductBlockPolicy } from '../src/productBlockPolicy';

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
