import { describe, expect, it } from 'vitest';
import type { AppEvidence } from '@timeonchrome/app-runtime-contracts/classification';
import { leafApplicationAssociations, projectExplicitApplicationClassifications } from '../src/applicationIdentityProjection';

const evidence = (runtimeIdentity: string, values: AppEvidence['values'], discovery?: AppEvidence['discovery']): AppEvidence => ({
  platform: 'windows', runtimeIdentity, displayName: 'Same name', values,
  verifiedFields: Object.keys(values) as AppEvidence['verifiedFields'], discovery,
});
const choice = (runtimeIdentity: string, classification: 'study' | 'composite' | 'unclassified' = 'study') => ({
  platform: 'windows' as const, runtimeIdentity, displayName: 'Same name', classification,
});
const key = (identity: string) => `windows\n${identity}`;

describe('trusted application identity projection', () => {
  it('inherits explicit ChatGPT across a stable package, never across a same-name third party', () => {
    const items = [evidence('old', { packageId: 'Chat.Package!App' }), evidence('new', { packageId: 'chat.package!app' }),
      evidence('third-party', { packageId: 'Other.Package!App' })];
    const result = projectExplicitApplicationClassifications(items, [choice('old')]);
    expect(result.get(key('new'))).toBe('study');
    expect(result.has(key('third-party'))).toBe(false);
    expect(projectExplicitApplicationClassifications(items, []).size).toBe(0);
  });
  it('inherits an Office product into Excel and runtime aliases, with leaf override above parent', () => {
    const productKey = 'verified-product';
    const items = [evidence('office', { productKey }, { role: 'application', nameSource: 'installation', sourceKinds: ['registry'], objectKind: 'product' }),
      evidence('excel-entry', { productKey, binaryHash: 'excel' }, { role: 'application', nameSource: 'appList', sourceKinds: ['shortcut'], objectKind: 'variant', parentProductKey: productKey, variantRole: 'suiteMember' }),
      evidence('excel-runtime', { binaryHash: 'excel' }),
      evidence('word-entry', { productKey, binaryHash: 'word' }, { role: 'application', nameSource: 'appList', sourceKinds: ['shortcut'], objectKind: 'variant', parentProductKey: productKey, variantRole: 'suiteMember' })];
    const result = projectExplicitApplicationClassifications(items, [choice('office'), choice('excel-entry', 'composite')]);
    expect(result.get(key('excel-runtime'))).toBe('composite');
    expect(result.get(key('word-entry'))).toBe('study');
    const inherited = projectExplicitApplicationClassifications(items, [choice('office')]);
    expect(inherited.get(key('excel-entry'))).toBe('study');
    expect(inherited.get(key('excel-runtime'))).toBe('study');
    const leaves = leafApplicationAssociations(items);
    expect(leaves.get(key('excel-entry'))).not.toBe(leaves.get(key('word-entry')));
  });
  it('does not inherit package-container choices or shared host binaries between AUMIDs', () => {
    const items = [evidence('container', { packageId: 'CBS', productKey: 'cbs' }, { role: 'application', nameSource: 'installation', sourceKinds: ['package'], objectKind: 'packageContainer' }),
      evidence('A', { packageId: 'CBS!A', productKey: 'cbs', binaryHash: 'host' }),
      evidence('B', { packageId: 'CBS!B', productKey: 'cbs', binaryHash: 'host' })];
    const result = projectExplicitApplicationClassifications(items, [choice('container'), choice('A')]);
    expect(result.has(key('B'))).toBe(false);
  });
  it('does not select a winner when aliases have conflicting explicit choices', () => {
    const items = ['A', 'B', 'C'].map(id => evidence(id, { packageId: 'Same!App' }));
    const result = projectExplicitApplicationClassifications(items, [choice('A'), choice('B', 'composite')]);
    expect(result.get(key('A'))).toBe('study');
    expect(result.get(key('B'))).toBe('composite');
    expect(result.get(key('C'))).toBe('unclassified');
    expect(projectExplicitApplicationClassifications(items, [choice('A'), choice('B', 'composite')], undefined,
      [choice('C', 'composite')]).get(key('C'))).toBe('composite');
  });
  it('joins ledger-only explicit identities only after a family association has been approved', () => {
    const knowledge = { schemaVersion: 2 as const, version: 1, products: [{ id: 'confirmed-chat', name: 'Confirmed product', type: 'other' as const,
      selectors: ['old', 'new'].map(id => ({ platform: 'windows' as const, match: { operator: 'all' as const,
        conditions: [{ field: 'runtimeIdentity' as const, value: id }] } })) }], rules: [], bindings: [] };
    const items = [evidence('new', { binaryHash: 'new-hash' })];
    expect(projectExplicitApplicationClassifications(items, [choice('old')]).has(key('new'))).toBe(false);
    expect(projectExplicitApplicationClassifications(items, [choice('old')], knowledge).get(key('new'))).toBe('study');
  });
});
