'use strict';
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const { createHash } = require('node:crypto');
const ts = require('typescript');
const root = path.resolve(__dirname, '../..');
function extract(source, name) {
  const tree = ts.createSourceFile('client.js', source, ts.ScriptTarget.Latest, true);
  const node = tree.statements.find(n => ts.isFunctionDeclaration(n) && n.name?.text === name);
  assert(node, `production function ${name}`);
  return node.getText(tree).replace(/^export /, '');
}
async function run() {
  const bytes = fs.readFileSync(process.argv[2] || path.join(root, 'tests/fixtures/quota-cloud-wire-1.57.json'));
  assert.equal(createHash('sha256').update(bytes).digest('hex'), '5d52e38874c2526c7b80bffbba42d9cc9d6def58aa7588120e08ffa780825b1c');
  const wire = JSON.parse(bytes);
  assert.equal(wire.synthetic, true);
  const contractSource = fs.readFileSync(path.join(root, 'extension/core/shared-contracts/1.57.0/source-statistics.js'), 'utf8');
  const contract = await import('data:text/javascript;base64,' + Buffer.from(contractSource).toString('base64'));
  const source = fs.readFileSync(path.join(root, 'extension/infra/cloud-sync.js'), 'utf8');
  const base = 'https://fixture.invalid', requests = [];
  let selected;
  const client = new Function('sourceStatisticsContract', 'validateSourceStatisticsQuery', 'getCloudApiBase', 'CLOUD_CONFIG', 'fetch',
    extract(source, 'readCapturedSharedDeviceJson') + '\n' + extract(source, 'readCloudSourceStatistics') + '\nreturn readCloudSourceStatistics;')(
    contract, contract.validateSourceStatisticsQuery, () => base, { REQUEST_TIMEOUT_MS: 1000 },
    async (url, options) => {
      requests.push({ url, body: JSON.parse(options.body), authorization: options.headers.Authorization });
      return new Response(JSON.stringify(selected.body), { status: selected.status });
    });
  const options = { apiBase: base, deviceToken: 'synthetic-transport-token', childId: wire.expected.childId };
  for (const sample of wire.cases) {
    selected = sample;
    const query = { ...wire.query, ...(sample.name === 'old-direct' ? {} : { includeSources: true }) };
    const result = await client(options, query);
    assert.equal(result.ok, sample.status === 200, sample.name);
    if (result.ok) {
      const combined = sample.body.snapshot || sample.body;
      assert.deepEqual(result.snapshot, combined, `${sample.name}: confirmed combined amounts preserved`);
      if (sample.name === 'trusted-sources') assert.deepEqual(result.applicationSources, sample.body.applicationSources);
      else if (sample.name !== 'old-direct') assert.equal(result.applicationSources, null, sample.name);
    }
    assert.equal(requests.at(-1).url, `${base}/device/source-statistics`);
    assert.equal(requests.at(-1).authorization, 'Bearer synthetic-transport-token');
    assert(!Object.hasOwn(requests.at(-1).body, 'childId'), 'expected child stays local, never a caller-selected cloud identity');
  }
  const trusted = wire.cases.find(item => item.name === 'trusted-sources');
  for (const fault of ['foreign_sidecar', 'foreign_combined', 'wrong_period', 'network_failure']) {
    selected = structuredClone(trusted);
    if (fault === 'foreign_sidecar') selected.body.applicationSources.local.childId = 'another-child';
    if (fault === 'foreign_combined') selected.body.snapshot.childId = 'another-child';
    if (fault === 'wrong_period') selected.body.snapshot.toDate = '2026-10-08';
    if (fault === 'network_failure') selected = { status: 503, body: { private: 'not-to-be-exposed' } };
    const result = await client(options, { ...wire.query, includeSources: true });
    if (fault === 'foreign_sidecar') {
      assert(result.ok && result.applicationSources === null, 'bad explanation never poisons valid confirmed total');
    } else assert.equal(result.ok, false, fault);
    assert(!JSON.stringify(result).includes('not-to-be-exposed'));
  }
  console.log(`Cloud route wire / real extension HTTP reader PASS: ${wire.cases.length} server cases + 4 isolation/fault cases`);
}
run().catch(error => { console.error(error); process.exitCode = 1; });
