const assert = require('node:assert/strict');
const path = require('node:path');
const { createRequire } = require('node:module');
const backendRequire = createRequire(path.resolve('app-runtime-management/backend/package.json'));
const { buildSync } = backendRequire('esbuild');
const result = buildSync({ entryPoints: ['workers/src/modules/task/resource-policy.ts'], bundle: true, format: 'cjs', platform: 'node', write: false });
const moduleUnderTest = { exports: {} };
new Function('module', 'exports', 'require', result.outputFiles[0].text)(moduleUnderTest, moduleUnderTest.exports, require);
const { validateTaskResourcePolicy } = moduleUnderTest.exports;
const defaults = { defaultBlockedSites: ['blocked.example'], defaultStudySites: [], defaultCompositeSites: [], defaultRestrictedEntertainmentSites: [] };
function env(profile = {}, system = defaults, fail = false) {
  return { DB: { prepare(sql) {
    assert.match(sql, /^SELECT /, 'policy gate must not write');
    return { bind(id) { assert.equal(id, sql.includes('profiles') ? 'p' : 'global'); return this; }, async first() {
      if (fail) throw new Error('private database details');
      return sql.includes('profiles') ? { config: typeof profile === 'string' ? profile : JSON.stringify(profile) }
        : system === null ? null : { config_json: typeof system === 'string' ? system : JSON.stringify(system) };
    } };
  } } };
}
(async () => {
  let count = 0;
  async function check(name, input, resource, status, code) {
    const response = await validateTaskResourcePolicy(input, 'p', resource);
    assert.equal(response?.status ?? null, status, name);
    if (code) assert.equal((await response.json()).code, code, name);
    count++;console.log('PASS ' + name);
  }
  await check('system blacklist domain', env(), { hosts: ['blocked.example'] }, 400, 'TASK_RESOURCE_BLOCKED');
  await check('system blacklist descendant URL', env(), { urlRules: [{url:'https://sub.blocked.example/page',match:'exact'}] }, 400, 'TASK_RESOURCE_BLOCKED');
  await check('custom blacklist', env({customBlockedSites:['custom.example']}), {hosts:['custom.example']}, 400, 'TASK_RESOURCE_BLOCKED');
  await check('legacy blacklist', env({unsafeList:['legacy.example']}), {hosts:['legacy.example']}, 400, 'TASK_RESOURCE_BLOCKED');
  await check('restricted resources remain eligible', env(), {hosts:['youtube.com']}, null);
  await check('different domain cannot match suffix', env(), {hosts:['notblocked.example']}, null);
  const rules = [{targetType:'url',normalizedValue:'https://example.com/blocked',decision:'blocked'},
    {targetType:'url',normalizedValue:'https://www.youtube.com/watch?v=video123',decision:'blocked'}];
  await check('exact URL blocked', env({siteClassificationRulesV1:rules}), {urlRules:[{url:'https://example.com/blocked',match:'exact'}]}, 400, 'TASK_RESOURCE_BLOCKED');
  await check('different URL remains eligible', env({siteClassificationRulesV1:rules}), {urlRules:[{url:'https://example.com/other',match:'exact'}]}, null);
  await check('YouTube video blocked', env({siteClassificationRulesV1:rules}), {specialTargets:['https://www.youtube.com/watch?v=video123']}, 400, 'TASK_RESOURCE_BLOCKED');
  await check('different YouTube video remains eligible', env({siteClassificationRulesV1:rules}), {specialTargets:['https://www.youtube.com/watch?v=other456']}, null);
  await check('malformed profile fails closed', env('{bad'), {hosts:['safe.example']}, 503, 'TASK_POLICY_UNAVAILABLE');
  await check('malformed system fails closed', env({},'{bad'), {hosts:['safe.example']}, 503, 'TASK_POLICY_UNAVAILABLE');
  await check('unreadable database fails closed', env({},defaults,true), {hosts:['safe.example']}, 503, 'TASK_POLICY_UNAVAILABLE');
  await check('invalid resources reject before policy lookup', env({},defaults,true), {}, 400, 'INVALID_TASK');
  await check('absent system row uses approved fallback', env({},null), {hosts:['tiktok.com']}, 400, 'TASK_RESOURCE_BLOCKED');
  console.log(`Task resource policy: ${count}/${count} PASS`);
})().catch(error=>{console.error(error);process.exitCode=1});
