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
