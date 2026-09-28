const assert = require('node:assert/strict');
const session = require('./app-runtime-session');

const calls = [];
const locationLike = { hash: '#ticket=header.payload.signature', pathname: '/', search: '?view=usage' };
assert.equal(session.consumeLaunchTicket(locationLike, { replaceState: (...args) => calls.push(args) }), 'header.payload.signature');
assert.deepEqual(calls, [[null, '', '/?view=usage']]);

const values = new Map();
const storage = { getItem: (key) => values.get(key) || null, setItem: (key, value) => values.set(key, value), removeItem: (key) => values.delete(key) };
session.save(storage, { token: 'opaque', expiresAt: 9000, children: [{ id: 'c', name: 'Child' }], selectedChildId: 'c', ignored: 'not-stored' });
assert.deepEqual(session.load(storage, 1000), { token: 'opaque', expiresAt: 9000, children: [{ id: 'c', name: 'Child' }], selectedChildId: 'c' });
session.save(storage, { token: 'opaque', expiresAt: 9000, children: [{ id: 'c', name: 'Child' }], selectedChildId: 'foreign' });
assert.deepEqual(session.load(storage, 1000), { token: 'opaque', expiresAt: 9000, children: [{ id: 'c', name: 'Child' }] });
assert.equal(session.load(storage, 9000), null);
assert.equal(values.size, 0);
console.log('app-runtime-session tests: PASS');

const test = require('node:test');
function fixture() {
  const entries = new Map();
  return { entries, storage: { getItem: key => entries.get(key) || null,
    setItem: (key, value) => entries.set(key, value), removeItem: key => entries.delete(key) } };
}
test('one redirect across concurrent failures and a new document', () => {
  const { entries, storage } = fixture();
  let redirects = 0;
  session.save(storage, { token: 'private-test', expiresAt: Date.now() + 10000, children: [] });
  const recovery = session.createRecovery(storage, () => redirects++);
  assert.throws(() => recovery.recover(), /正在返回/);
  assert.throws(() => recovery.recover(), /正在返回/);
  recovery.protectedLoadSucceeded();
  assert.equal(redirects, 1);
  assert.deepEqual([...entries], [[session.recoveryKey, '1']]);
  const next = session.createRecovery(storage, () => redirects++);
  assert.throws(() => next.recover(), { code: 'AUTH_RECOVERY_FAILED' });
  assert.equal(redirects, 1);
});
test('ticket exchange does not reset recovery; protected load success does', () => {
  const { storage } = fixture();
  storage.setItem(session.recoveryKey, '1');
  session.save(storage, { token: 'new-private-test', expiresAt: Date.now() + 10000, children: [] });
  assert.equal(storage.getItem(session.recoveryKey), '1');
  const recovery = session.createRecovery(storage, () => {});
  recovery.protectedLoadSucceeded();
  assert.equal(storage.getItem(session.recoveryKey), null);
  assert.throws(() => recovery.recover(), /正在返回/);
});
test('unavailable recovery storage fails closed instead of redirecting', () => {
  const recovery = session.createRecovery({ getItem: () => { throw Error('blocked'); } }, () => assert.fail('redirect'));
  assert.throws(() => recovery.recover(), { code: 'AUTH_RECOVERY_FAILED' });
});
