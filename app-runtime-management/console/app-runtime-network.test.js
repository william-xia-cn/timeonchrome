const assert = require('node:assert/strict');
const test = require('node:test');
const { NETWORK_MESSAGE, friendlyError, requestJson } = require('./app-runtime-network.js');

function response(status, body) {
  return {
    status,
    ok: status >= 200 && status < 300,
    async json() { return body; },
  };
}

test('GET renews the module token and retries once after a network failure', async () => {
  const renewals = [];
  const tokens = ['old-token', 'new-token'];
  let calls = 0;
  const payload = await requestJson({
    url: 'https://runtime.example.test/v1/module/devices',
    getToken: async (renew) => {
      renewals.push(renew);
      return renew ? tokens[1] : tokens[renewals.filter(Boolean).length];
    },
    fetchImpl: async (_url, options) => {
      calls += 1;
      if (calls === 1) throw new TypeError('Failed to fetch');
      assert.equal(options.headers.Authorization, 'Bearer new-token');
      return response(200, { devices: [] });
    },
  });

  assert.deepEqual(payload, { devices: [] });
  assert.equal(calls, 2);
  assert.deepEqual(renewals, [false, true, false]);
});

test('POST never replays an unknown network result', async () => {
  let calls = 0;
  await assert.rejects(
    requestJson({
      url: 'https://runtime.example.test/v1/module/pairing-codes',
      options: { method: 'POST', body: '{}' },
      getToken: async () => 'module-token',
      fetchImpl: async () => {
        calls += 1;
        throw new TypeError('Failed to fetch');
      },
    }),
    new RegExp(NETWORK_MESSAGE),
  );
  assert.equal(calls, 1);
});

test('401 renews once for GET and POST', async () => {
  for (const method of ['GET', 'POST']) {
    let calls = 0;
    const renewals = [];
    const payload = await requestJson({
      url: 'https://runtime.example.test/resource',
      options: { method },
      getToken: async (renew) => {
        renewals.push(renew);
        return renew ? 'renewed' : renewals.includes(true) ? 'renewed' : 'old';
      },
      fetchImpl: async () => {
        calls += 1;
        return calls === 1 ? response(401, {}) : response(200, { ok: true });
      },
    });
    assert.deepEqual(payload, { ok: true });
    assert.equal(calls, 2);
    assert.deepEqual(renewals, [false, true, false]);
  }
});

test('browser network errors are replaced with actionable Chinese copy', () => {
  assert.equal(friendlyError(new TypeError('Failed to fetch')).message, NETWORK_MESSAGE);
  assert.equal(friendlyError(new Error('specific error')).message, 'specific error');
});
