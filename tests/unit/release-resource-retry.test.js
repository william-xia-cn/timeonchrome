const assert = require('assert');
const { checkResource } = require('../../tools/check-release-resource');
(async () => {
  for (const sequence of [['new'], ['old', 'new'], [null, 'old', 'new']]) {
    let calls = 0, waits = 0;
    await checkResource('https://example.invalid', Buffer.from('new'), {
      fetcher: async () => { const value = sequence[calls++]; if (value == null) throw Error('network'); return new Response(value); },
      attempts: 3, wait: async () => { waits++; },
    });
    assert.equal(calls, sequence.length);
    assert.equal(waits, sequence.length - 1);
  }
  for (const response of [() => new Response('old'), () => new Response('new', { status: 503 }), () => { throw Error('offline'); }]) {
    let calls = 0;
    await assert.rejects(checkResource('https://example.invalid', Buffer.from('new'), {
      fetcher: async () => { calls++; return response(); }, attempts: 3, wait: async () => {},
    }), /after 3 attempts/);
    assert.equal(calls, 3);
  }
  console.log('Release resource retry: success, stale bytes, network, persistent mismatch and HTTP failure PASS');
})().catch(error => { console.error(error); process.exitCode = 1; });
