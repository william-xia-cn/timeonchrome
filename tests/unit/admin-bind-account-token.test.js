const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..', '..');

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function extractFunctionSource(source, functionName) {
  const start = source.indexOf(`async function ${functionName}`);
  if (start < 0) {
    throw new Error(`Missing function ${functionName}`);
  }

  const braceStart = source.indexOf('{', start);
  let depth = 0;
  for (let i = braceStart; i < source.length; i += 1) {
    const char = source[i];
    if (char === '{') depth += 1;
    if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        return source.slice(start, i + 1);
      }
    }
  }

  throw new Error(`Could not extract function ${functionName}`);
}

function createClassList() {
  const values = new Set();
  return {
    add(value) {
      values.add(value);
    },
    remove(value) {
      values.delete(value);
    },
    contains(value) {
      return values.has(value);
    },
  };
}

function createElement(value = '') {
  return {
    value,
    textContent: '',
    disabled: false,
    classList: createClassList(),
  };
}

function createStorage(existing = {}) {
  const data = { ...existing };
  const writes = [];
  return {
    data,
    writes,
    local: {
      set(values, callback) {
        writes.push(values);
        Object.assign(data, values);
        if (callback) callback();
      },
    },
  };
}

function runAdminAutoLoginTest(fetchImpl, existingStorage = {}) {
  const source = fs.readFileSync(path.join(ROOT, 'admin', 'admin.js'), 'utf8');
  const storage = createStorage(existingStorage);
  const calls = [];
  const context = {
    API_BASE: 'https://api.example.test',
    CLOUD_KEYS: { ACCOUNT_TOKEN: 'account_token' },
    atob: (value) => Buffer.from(value, 'base64').toString('binary'),
    chrome: { storage: storage },
    console,
    fetch: fetchImpl,
    enterMainScreen: async () => {
      calls.push('enterMainScreen');
    },
    showBindScreen: () => {
      calls.push('showBindScreen');
    },
  };

  vm.runInNewContext(`
    let accountToken = null;
    let currentEmail = null;
    ${extractFunctionSource(source, 'autoLogin')}
    this.__autoLogin = autoLogin;
  `, context);

  return {
    calls,
    storage,
    autoLogin: context.__autoLogin,
  };
}

async function testAdminAutoLoginPersistsAccountToken() {
  let loginUrl = null;
  const harness = runAdminAutoLoginTest(async (url) => {
    loginUrl = url;
    return {
      ok: true,
      json: async () => ({ token: 'fresh-account-token' }),
    };
  });

  await harness.autoLogin(Buffer.from('parent@example.com:secret').toString('base64'));

  assert(loginUrl === 'https://api.example.test/auth/login', 'admin auto-login should call /auth/login');
  assert(harness.storage.data.account_token === 'fresh-account-token', 'admin auto-login should persist account_token');
  assert(harness.calls.includes('enterMainScreen'), 'admin auto-login should enter main screen on success');
  assert(!harness.calls.includes('showBindScreen'), 'admin auto-login should not show bind screen on success');
}

async function testAdminAutoLoginFailureDoesNotOverwriteExistingToken() {
  const harness = runAdminAutoLoginTest(async () => ({
    ok: false,
    json: async () => ({ error: 'invalid credentials', token: 'invalid-token' }),
  }), { account_token: 'existing-valid-token' });

  await harness.autoLogin(Buffer.from('parent@example.com:wrong').toString('base64'));

  assert(harness.storage.data.account_token === 'existing-valid-token', 'failed admin auto-login should not overwrite account_token');
  assert(!harness.storage.writes.some((write) => Object.prototype.hasOwnProperty.call(write, 'account_token')), 'failed admin auto-login should not write account_token');
  assert(harness.calls.includes('showBindScreen'), 'failed admin auto-login should return to bind screen');
  assert(!harness.calls.includes('enterMainScreen'), 'failed admin auto-login should not enter main screen');
}

function runBindFunction(functionName, options = {}) {
  const source = fs.readFileSync(path.join(ROOT, 'bind.js'), 'utf8');
  const storage = createStorage(options.existingStorage || {});
  const calls = [];
  const elements = {
    email: createElement(options.email || 'parent@example.com'),
    password: createElement(options.password || 'secret'),
    successIcon: createElement(),
    successTitle: createElement(),
    successMsg: createElement(),
    error2: createElement(),
    loginBtn: createElement(),
    error1: createElement(),
  };

  const context = {
    btoa: (value) => Buffer.from(value, 'binary').toString('base64'),
    chrome: {
      runtime: {
        sendMessage: async (message) => {
          calls.push(['runtime.sendMessage', message]);
          return { ok: true };
        },
      },
      storage: storage,
    },
    console,
    document: {
      getElementById(id) {
        return elements[id] || createElement();
      },
    },
    fetch: options.fetch,
    setTimeout: () => 0,
    showStep: (step) => {
      calls.push(['showStep', step]);
    },
    window: {
      GUARDIAN_CONFIG: { API_BASE: 'https://api.example.test' },
      close: () => {
        calls.push(['window.close']);
      },
    },
  };

  vm.runInNewContext(`
    let accountToken = ${JSON.stringify(options.accountToken || null)};
    let selectedProfileId = null;
    ${extractFunctionSource(source, functionName)}
    this.__target = ${functionName};
    this.__getAccountToken = () => accountToken;
  `, context);

  return {
    calls,
    context,
    elements,
    storage,
    target: context.__target,
    getAccountToken: context.__getAccountToken,
  };
}

async function testBindPersistsAccountTokenWithCloudState() {
  let bindUrl = null;
  const harness = runBindFunction('doBind', {
    accountToken: 'parent-account-token',
    fetch: async (url) => {
      bindUrl = url;
      return {
        ok: true,
        json: async () => ({
          device_token: 'device-token',
          device_id: 'device-id',
          profile_id: 'profile-1',
        }),
      };
    },
  });

  await harness.target('profile-1');

  assert(bindUrl === 'https://api.example.test/device/bind', 'bind should call /device/bind');
  assert(harness.storage.data.cloud_device_token === 'device-token', 'bind should persist cloud_device_token');
  assert(harness.storage.data.cloud_device_id === 'device-id', 'bind should persist cloud_device_id');
  assert(harness.storage.data.cloud_profile_id === 'profile-1', 'bind should persist cloud_profile_id');
  assert(harness.storage.data.account_token === 'parent-account-token', 'bind should persist account_token');
  assert(harness.storage.data.cloud_credentials === Buffer.from('parent@example.com:secret', 'binary').toString('base64'), 'bind should persist cloud_credentials');
  assert(typeof harness.storage.data.cloud_last_sync === 'number', 'bind should persist cloud_last_sync timestamp');
}

async function testBindLoginFailureDoesNotOverwriteExistingToken() {
  const harness = runBindFunction('doLogin', {
    existingStorage: { account_token: 'existing-valid-token' },
    fetch: async () => ({
      ok: false,
      json: async () => ({ error: 'invalid login', token: 'invalid-token' }),
    }),
  });

  await harness.target();

  assert(harness.storage.data.account_token === 'existing-valid-token', 'failed bind login should not overwrite account_token');
  assert(!harness.storage.writes.some((write) => Object.prototype.hasOwnProperty.call(write, 'account_token')), 'failed bind login should not write account_token');
  assert(harness.elements.error1.textContent === 'invalid login', 'failed bind login should surface error');
}

function testCloudLogoutClearsAccountToken() {
  const source = fs.readFileSync(path.join(ROOT, 'message-router.js'), 'utf8');
  const logoutStart = source.indexOf("case 'CLOUD_LOGOUT':");
  assert(logoutStart >= 0, 'message-router should define CLOUD_LOGOUT');
  const nextCase = source.indexOf("case '", logoutStart + 1);
  const logoutBlock = source.slice(logoutStart, nextCase);
  assert(/account_token\s*:\s*null/.test(logoutBlock), 'CLOUD_LOGOUT should clear account_token');
}

const tests = [
  ['admin auto-login persists account_token', testAdminAutoLoginPersistsAccountToken],
  ['admin auto-login failure does not overwrite account_token', testAdminAutoLoginFailureDoesNotOverwriteExistingToken],
  ['bind persists account_token with cloud state', testBindPersistsAccountTokenWithCloudState],
  ['bind login failure does not overwrite account_token', testBindLoginFailureDoesNotOverwriteExistingToken],
  ['CLOUD_LOGOUT clears account_token', testCloudLogoutClearsAccountToken],
];

(async () => {
  let passed = 0;
  for (const [name, test] of tests) {
    await test();
    passed += 1;
    console.log(`PASS ${name}`);
  }
  console.log(`admin-bind-account-token: ${passed}/${tests.length} passed`);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
