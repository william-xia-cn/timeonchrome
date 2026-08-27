'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');
const vm = require('vm');
const zlib = require('zlib');

const ROOT = path.resolve(__dirname, '..', '..');

function loadModule() {
  const source = fs.readFileSync(
    path.join(ROOT, 'native-app-control', 'worker', 'src', 'requestBody.ts'),
    'utf8'
  );
  const output = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(output, {
    module,
    exports: module.exports,
    Blob,
    DecompressionStream,
    Error,
    JSON,
    Response,
    TextDecoder,
  });
  return module.exports;
}

function request(body, encoding = 'identity') {
  return new Request('https://native.test/santa', {
    method: 'POST',
    headers: { 'content-encoding': encoding, 'content-type': 'application/json' },
    body,
  });
}

async function main() {
  const { readSantaJsonObject } = loadModule();
  const payload = JSON.stringify({
    machine_id: 'machine',
    events: [{ file_sha256: 'a'.repeat(64), file_name: 'Example.app' }],
  });

  const identity = await readSantaJsonObject(request(payload));
  assert.strictEqual(identity.events.length, 1);

  const deflated = await readSantaJsonObject(request(zlib.deflateSync(payload), 'deflate'));
  assert.strictEqual(deflated.events[0].file_name, 'Example.app');

  const gzipped = await readSantaJsonObject(request(zlib.gzipSync(payload), 'gzip'));
  assert.strictEqual(gzipped.machine_id, 'machine');

  const alreadyDecoded = await readSantaJsonObject(request(payload, 'deflate'));
  assert.strictEqual(alreadyDecoded.events.length, 1);

  await assert.rejects(
    readSantaJsonObject(request(Buffer.from('not-deflate'), 'deflate')),
    /invalid_santa_request_body/
  );
  await assert.rejects(
    readSantaJsonObject(request(payload, 'br')),
    /unsupported_santa_content_encoding/
  );

  console.log('native-app-control request body: 6/6 passed');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
