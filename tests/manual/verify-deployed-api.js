// Comprehensive deployed API verification

const API_BASE = 'https://guardian-api.william-xia-cn.workers.dev';

async function api(method, path, body, token) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const opts = { method, headers };
  if (body !== undefined && body !== null) opts.body = JSON.stringify(body);
  const resp = await fetch(`${API_BASE}${path}`, opts);
  let data = null;
  try { data = await resp.json(); } catch (_) {}
  return { status: resp.status, data };
}

(async () => {
  const email = `verify_${Date.now()}@test.invalid`;
  const password = 'TestPass123!';
  const reg = await api('POST', '/auth/register', { email, password });
  const accountToken = reg.data?.token;

  // 1. Create profile
  const prof = await api('POST', '/profiles', { name: 'VerifyProfile' }, accountToken);
  const profileId = prof.data?.profile?.id;
  const config0 = prof.data?.profile?.config;

  console.log('1. New profile config fields:', Object.keys(config0).filter(k => k.includes('List') || k.includes('Sites')).sort());

  // 2. GET defaults
  const defaults = await api('GET', `/profiles/${profileId}/defaults`, null, accountToken);
  console.log('2. Defaults composite count:', defaults.data?.defaultCompositeSites?.length);

  // 3. GET config (before any PUT)
  const get0 = await api('GET', `/profiles/${profileId}/config`, null, accountToken);
  const c0 = get0.data?.data;
  console.log('3. GET config compositeList length:', c0?.compositeList?.length);
  console.log('3. GET config customCompositeList length:', c0?.customCompositeList?.length);

  // 4. PUT with custom composite site
  const putData = {
    data: {
      customCompositeList: ['example.com'],
      version: '1.3'
    }
  };
  const put1 = await api('PUT', `/profiles/${profileId}/config`, putData, accountToken);
  console.log('4. PUT config status:', put1.status);

  // 5. GET config after PUT (effective merge should happen)
  const get1 = await api('GET', `/profiles/${profileId}/config`, null, accountToken);
  const c1 = get1.data?.data;
  console.log('5. GET after PUT compositeList length:', c1?.compositeList?.length);
  console.log('5. GET after PUT customCompositeList length:', c1?.customCompositeList?.length);
  console.log('5. compositeList includes google.com?', c1?.compositeList?.includes('google.com'));
  console.log('5. compositeList includes example.com?', c1?.compositeList?.includes('example.com'));

  // 6. Cleanup
  await api('DELETE', `/profiles/${profileId}`, null, accountToken);

  // Assertions
  const errors = [];
  if (!Array.isArray(config0.customCompositeList)) errors.push('new profile missing customCompositeList');
  if (!Array.isArray(config0.customStudyList)) errors.push('new profile missing customStudyList');
  if (!Array.isArray(config0.customRestrictedEntertainmentList)) errors.push('new profile missing customRestrictedEntertainmentList');
  if (!Array.isArray(config0.customBlockedSites)) errors.push('new profile missing customBlockedSites');
  if (defaults.data?.defaultCompositeSites?.length !== 20) errors.push(`defaults composite != 20, got ${defaults.data?.defaultCompositeSites?.length}`);
  if (c0?.compositeList?.length !== 0) errors.push(`initial compositeList != 0, got ${c0?.compositeList?.length}`);
  if (c1?.compositeList?.length !== 21) errors.push(`effective compositeList != 21 (20 default + 1 custom), got ${c1?.compositeList?.length}`);
  if (!c1?.compositeList?.includes('google.com')) errors.push('effective list missing google.com');
  if (!c1?.compositeList?.includes('example.com')) errors.push('effective list missing example.com');

  if (errors.length === 0) {
    console.log('\n✅ ALL COMPREHENSIVE VERIFICATIONS PASSED');
  } else {
    console.log('\n❌ FAILURES:');
    errors.forEach(e => console.log(`  - ${e}`));
    process.exit(1);
  }
})();
