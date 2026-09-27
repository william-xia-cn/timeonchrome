const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { checkCopy } = require('../../tools/check-composite-evidence-copy');
const source = fs.readFileSync(path.resolve(__dirname, '../../contracts/composite-page-evidence/v1.js'));
const load = bytes => import('data:text/javascript;base64,' + bytes.toString('base64'));
async function vectors(api) {
  const result = [];
  for (const value of ['HTTPS://WWW.Example.COM/a', '*.m.example.com.', 'localhost', '%%%']) {
    result.push(api.compositeSiteIdentity(value));
  }
  for (const value of ['https://site.test/search?q=private','https://a:b@site.test/wiki/A',
    'chrome://settings', 'https://site.test/account/me','https://site.test/%ZZ',
    'https://site.test/wiki/Physics?token=secret#private','https://site.test/123456789',
    'https://site.test/wiki/%E7%89%A9%E7%90%86']) {
    result.push(api.sanitizeCompositePage(value, 'a@b.com https://x.test/?token=secret'));
  }
  result.push(api.reviewDate(Date.parse('2026-09-27T15:59:59.999Z')),
    api.reviewDate(Date.parse('2026-09-27T16:00:00Z')),
    api.PAGE_EVIDENCE_TTL_MS, api.PAGE_EVIDENCE_MAX_BYTES);
  for (const value of [[],{id:'public'},[{id:'a'},{id:'b'}]]) result.push(await api.hashPageEvidence(value));
  return result;
}
(async () => {
  const api = await load(source), actual = await vectors(api);
  assert.deepEqual(actual.slice(0,4), ['example.com','example.com',null,null]);
  assert.deepEqual(actual.slice(4,9), Array(5).fill(null));
  assert.deepEqual(actual[9], {host:'site.test',path:'/wiki/Physics',title:'[redacted] [link]'});
  assert.equal(actual[10].path,'/[redacted]');
  assert.equal(actual[11].path,'/wiki/物理');
  assert.deepEqual(actual.slice(12,16),['2026-09-27','2026-09-28',259200000,262144]);
  assert.equal(actual[16], '4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945');
  assert.equal(actual[17],createHash('sha256').update(JSON.stringify({id:'public'})).digest('hex'));
  assert.notEqual(actual[18],await api.hashPageEvidence([{id:'b'},{id:'a'}]));
  assert.equal(api.sanitizeCompositePage('https://site.test/'+'a'.repeat(600),'测'.repeat(200)).title.length,160);
  const temp = fs.mkdtempSync(path.join(os.tmpdir(),'toc-evidence-contract-'));
  const copy = path.join(temp,'copy.js');
  try {
    fs.writeFileSync(copy,source);
    assert.equal(checkCopy(copy),createHash('sha256').update(source).digest('hex'));
    fs.appendFileSync(copy,'\n// drift');
    assert.throws(()=>checkCopy(copy),/differs/);
    assert.throws(()=>checkCopy(path.join(temp,'missing.js')),/missing/);
  } finally { if(fs.existsSync(copy))fs.unlinkSync(copy); fs.rmdirSync(temp); }
  if(process.env.COMPOSITE_EVIDENCE_BASELINE) {
    assert.deepEqual(actual,await vectors(await load(fs.readFileSync(process.env.COMPOSITE_EVIDENCE_BASELINE))));
    console.log('Original draft export parity PASS');
  }
  console.log('Composite evidence v1 fixed vectors and copy integrity PASS');
})().catch(error=>{console.error(error);process.exitCode=1;});
