import { describe, expect, it } from 'vitest';
import type { AppEvidence } from '@timeonchrome/app-runtime-contracts/classification';
import { buildProductIdentityProjection, leafApplicationAssociations, projectExplicitApplicationClassifications } from '../src/applicationIdentityProjection';
import { promoteProductClassifications, resolvePolicyApplications, validateRepairWeek } from '../src/applicationKnowledge';
import chromeRules from '../src/chrome-display-rules.json';

const evidence = (runtimeIdentity: string, values: AppEvidence['values'], discovery?: AppEvidence['discovery']): AppEvidence => ({
  platform: 'windows', runtimeIdentity, displayName: 'Same name', values,
  verifiedFields: Object.keys(values) as AppEvidence['verifiedFields'], discovery,
});
const choice = (runtimeIdentity: string, classification: 'study' | 'composite' | 'unclassified' = 'study') => ({
  platform: 'windows' as const, runtimeIdentity, displayName: 'Same name', classification,
});
const key = (identity: string) => `windows\n${identity}`;

describe('trusted application identity projection', () => {
  it('marks only reviewed Chrome product identities, never a same-name application', async () => {
    const items=[evidence('chrome-approved',{fileSeriesKey:chromeRules.windows.fileSeriesKey,
      signerKey:chromeRules.windows.signerKey}),evidence('same-name-third-party',{binaryHash:'unrelated'})];
    const knowledge={schemaVersion:2 as const,version:1,products:[{id:chromeRules.productId,name:'Chrome',type:'other' as const,
      selectors:[{platform:'windows' as const,match:{operator:'all' as const,
        conditions:[{field:'fileSeriesKey' as const,value:chromeRules.windows.fileSeriesKey}]}}]}],rules:[],bindings:[]};
    const projection=await buildProductIdentityProjection(items,knowledge);
    expect(projection.items.find(item=>item.runtimeIdentity==='chrome-approved')?.isChromeContainer).toBe(true);
    expect(projection.items.find(item=>item.runtimeIdentity==='same-name-third-party')?.isChromeContainer).toBeUndefined();
    expect((await buildProductIdentityProjection(items,{...knowledge,products:[]},[])).version).not.toBe(projection.version);
  });
  it('replays sanitized retained scan topology: two signed Excel versions, Word, mislabelled Codex and an unproven old ChatGPT', async () => {
    // Retained scan/file evidence shape from 2026-09-27; all device-specific keys replaced.
    const suite: AppEvidence['discovery'] = {role:'application',nameSource:'appList',sourceKinds:['shortcut'],
      objectKind:'variant',variantRole:'suiteMember',parentProductKey:'office-container'};
    const items = [
      {...evidence('excel-v1',{productKey:'office-container',binaryHash:'excel-binary-1',signerKey:'microsoft-1'},suite),displayName:'Excel'},
      {...evidence('excel-v2',{productKey:'office-container',binaryHash:'excel-binary-2',signerKey:'microsoft-2'},suite),displayName:'Excel'},
      {...evidence('word-v2',{productKey:'office-container',binaryHash:'word-binary-2',signerKey:'microsoft-2'},suite),displayName:'Word'},
      {...evidence('codex-package',{packageId:'OpenAI.Codex_2p2nqsd0c76g0!App',binaryHash:'codex-binary'}),displayName:'ChatGPT'},
      {...evidence('codex-runtime',{binaryHash:'codex-binary',signerKey:'openai',productName:'Codex'}),displayName:'Codex'},
    ];
    const knowledge = {schemaVersion:2 as const,version:1,products:[
      {id:'excel',name:'Excel',type:'other' as const,selectors:['excel-v1','excel-v2'].map(value=>({platform:'windows' as const,
        match:{operator:'all' as const,conditions:[{field:'runtimeIdentity' as const,value}]}}))},
      {id:'codex',name:'Codex',type:'other' as const,selectors:[{platform:'windows' as const,
        match:{operator:'all' as const,conditions:[{field:'packageId' as const,value:'OpenAI.Codex_2p2nqsd0c76g0!App'}]}}]},
    ],rules:[],bindings:[]};
    const projection=await buildProductIdentityProjection(items,knowledge,[choice('excel-v1'),choice('old-chatgpt-unproven')]);
    expect(projection.items.filter(item=>item.productId==='excel')).toHaveLength(2);
    expect(projection.items.filter(item=>item.productId==='codex').map(item=>item.canonicalName)).toEqual(['Codex','Codex']);
    expect(projection.items.find(item=>item.runtimeIdentity==='word-v2')?.productId).toBeNull();
    expect(projection.items.find(item=>item.runtimeIdentity==='old-chatgpt-unproven')?.status).toBe('unresolved');
    const classes=resolvePolicyApplications(knowledge,'child',items,[choice('excel-v1'),choice('old-chatgpt-unproven')]);
    expect(classes.find(item=>item.runtimeIdentity==='excel-v2')?.classification).toBe('study');
    expect(classes.find(item=>item.runtimeIdentity==='codex-runtime')).toBeUndefined();
    const configuredProduct = {...knowledge,bindings:[{childId:'child',products:[{productId:'codex',classification:'study' as const}],ruleIds:[]}]};
    expect(resolvePolicyApplications(configuredProduct,'child',items,[]).find(item=>item.runtimeIdentity==='codex-runtime')?.classification).toBe('study');
    expect(resolvePolicyApplications(configuredProduct,'other-child',items,[]).find(item=>item.runtimeIdentity==='codex-runtime')).toBeUndefined();
  });
  it('promotes nonconflicting legacy choices and reports conflicting product overrides without overwriting', async () => {
    const knowledge = { schemaVersion: 2 as const, version: 1, products: [{ id: 'excel', name: 'Excel', type: 'other' as const,
      selectors: ['old','new'].map(value => ({ platform: 'windows' as const, match: { operator: 'all' as const,
        conditions: [{ field: 'runtimeIdentity' as const, value }] } })) }], rules: [], bindings: [] };
    const items = [evidence('new', { binaryHash: 'new' })];
    const promoted = await promoteProductClassifications(knowledge, 'child', items, [choice('old')]);
    expect(promoted.conflicts).toEqual([]);
    expect(promoted.knowledge.bindings[0]?.products).toEqual([{ productId: 'excel', classification: 'study' }]);
    expect(resolvePolicyApplications(promoted.knowledge, 'child', items, []).find(item => item.runtimeIdentity === 'new')?.classification).toBe('study');
    const conflict = await promoteProductClassifications(promoted.knowledge, 'child', items, [choice('new', 'composite')]);
    expect(conflict.conflicts).toEqual([{ productId: 'excel', classifications: ['composite','study'] }]);
    expect(conflict.knowledge.bindings[0]?.products[0]?.classification).toBe('study');
    expect(validateRepairWeek('2026-09-21')).toBe('2026-09-21');
    expect(validateRepairWeek(undefined)).toBeUndefined();
    expect(() => validateRepairWeek('2026-09-28')).toThrow();
  });
  it('projects approved Excel versions including suite members, but never Word or an Office container', async () => {
    const knowledge = { schemaVersion: 2 as const, version: 4, products: [{ id: 'excel', name: 'Excel', type: 'other' as const,
      selectors: ['excel-old', 'excel-new'].map(value => ({ platform: 'windows' as const,
        match: { operator: 'all' as const, conditions: [{ field: 'runtimeIdentity' as const, value }] } })) }], rules: [], bindings: [] };
    const suite = { role: 'application' as const, nameSource: 'appList' as const, sourceKinds: ['shortcut' as const],
      objectKind: 'variant' as const, variantRole: 'suiteMember' as const, parentProductKey: 'office' };
    const items = [evidence('excel-new', { binaryHash: 'new', signerKey: 'rotated', productKey: 'office' }, suite),
      evidence('word', { binaryHash: 'word', signerKey: 'rotated', productKey: 'office' }, suite)];
    const projection = await buildProductIdentityProjection(items, knowledge, [choice('excel-old')]);
    const excel = projection.items.filter(item => item.productId === 'excel');
    expect(excel).toHaveLength(2);
    expect(new Set(excel.map(item => item.associationKey)).size).toBe(1);
    expect(excel.every(item => item.canonicalName === 'Excel')).toBe(true);
    expect(projection.items.find(item => item.runtimeIdentity === 'word')?.productId).toBeNull();
    expect(projectExplicitApplicationClassifications(items, [choice('excel-old')], knowledge).get(key('excel-new'))).toBe('study');
    expect((await buildProductIdentityProjection([...items].reverse(), knowledge, [choice('excel-old')])).version).toBe(projection.version);
    expect((await buildProductIdentityProjection(items, { ...knowledge, products: [] }, [choice('excel-old')])).version).not.toBe(projection.version);
  });
  it('uses approved file series without automatically joining unapproved series or same-name products', async () => {
    const items = ['old', 'new'].map(id => evidence(id, { fileSeriesKey: 'series' }));
    const empty = { schemaVersion: 2 as const, version: 1, products: [], rules: [], bindings: [] };
    const unapproved = await buildProductIdentityProjection(items, empty);
    expect(new Set(unapproved.items.map(item => item.associationKey)).size).toBe(2);
    const knowledge = { ...empty, products: [{ id: 'codex', name: 'Codex', type: 'other' as const,
      selectors: [{ platform: 'windows' as const, match: { operator: 'all' as const,
        conditions: [{ field: 'fileSeriesKey' as const, value: 'series' }] } }] }] };
    const approved = await buildProductIdentityProjection([...items,
      { ...evidence('unverified', { fileSeriesKey: 'series' }), verifiedFields: [] }], knowledge);
    expect(approved.items.filter(item => item.productId === 'codex')).toHaveLength(2);
    expect(approved.items.find(item => item.runtimeIdentity === 'unverified')?.productId).toBeNull();
  });
  it('joins a verified Firefox installation container for display only after both launchable children are approved', async () => {
    const parent = 'firefox-installation';
    const container = evidence('firefox-install', {productKey:parent},
      {role:'application',nameSource:'installation',sourceKinds:['registry'],objectKind:'product'});
    const variant = (id:string, series:string) => evidence(id,{productKey:parent,fileSeriesKey:series},
      {role:'application',nameSource:'appList',sourceKinds:['shortcut'],objectKind:'variant',
        variantRole:'suiteMember',parentProductKey:parent});
    const normal=variant('firefox-normal','normal-series'), privateMode=variant('firefox-private','private-series');
    const knowledge = {schemaVersion:2 as const,version:1,products:[{id:'firefox',name:'Firefox',type:'other' as const,
      selectors:['normal-series','private-series'].map(value=>({platform:'windows' as const,
        match:{operator:'all' as const,conditions:[{field:'fileSeriesKey' as const,value}]}}))}],rules:[],bindings:[]};
    const confirmed=await buildProductIdentityProjection([container,normal,privateMode],knowledge);
    expect(confirmed.items.map(item=>item.productId)).toEqual(['firefox','firefox','firefox']);
    expect(confirmed.items.find(item=>item.runtimeIdentity==='firefox-install')?.associationKey)
      .toBe(confirmed.items.find(item=>item.runtimeIdentity==='firefox-normal')?.associationKey);
    const partial=await buildProductIdentityProjection([container,normal,variant('unapproved','other-series')],knowledge);
    expect(partial.items.find(item=>item.runtimeIdentity==='firefox-install')?.productId).toBeNull();
    const other={...knowledge,products:[...knowledge.products,{id:'other',name:'Other',type:'other' as const,
      selectors:[{platform:'windows' as const,match:{operator:'all' as const,
        conditions:[{field:'fileSeriesKey' as const,value:'private-series'}]}}]}]};
    const split=await buildProductIdentityProjection([container,normal,privateMode],other);
    expect(split.items.find(item=>item.runtimeIdentity==='firefox-install')?.productId).toBeNull();
  });
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
