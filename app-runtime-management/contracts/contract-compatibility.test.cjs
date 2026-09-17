const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = __dirname;
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const legacy = [
  'runtime-api-v1.schema.json',
  'runtime-contract-v1.schema.json',
  'runtime-machine-api-v2.schema.json',
  'runtime-accounting-v2.schema.json',
];
assert.equal(pkg.version, '1.5.0');
for (const file of legacy) assert(fs.existsSync(path.join(root, file)), `${file} must remain for N-1 compatibility`);
const sso = JSON.parse(fs.readFileSync(path.join(root, 'runtime-browser-sso-v1.schema.json'), 'utf8'));
const inventoryV2 = JSON.parse(fs.readFileSync(path.join(root, 'application-inventory-v2.schema.json'), 'utf8'));
assert.equal(sso.$defs.ticketClaims.properties.aud.const, 'app-runtime-management:sso');
assert.equal(sso.$defs.sessionResponse.properties.tokenType.const, 'RuntimeSession');
assert.equal(sso.$defs.sessionResponse.properties.token.pattern, '^[A-Za-z0-9_-]{43}$');
assert.equal(sso.$defs.ticketClaims.properties.selected_child_id.type, 'string');
assert.equal(sso.$defs.sessionResponse.properties.selectedChildId.type, 'string');
assert.equal(inventoryV2.properties.schemaVersion.const, 2);
assert.deepEqual(inventoryV2.required, ['schemaVersion', 'batchId', 'products', 'variants']);
assert(inventoryV2.$defs.scan.required.includes('sourceResults'));
assert.deepEqual(inventoryV2.$defs.discovery.properties.applicationOrigin.enum, ['user', 'operatingSystem', 'unknown']);
assert.deepEqual(inventoryV2.$defs.discovery.properties.originEvidenceCode.enum, ['exactPackageRule', 'osMetadata', 'reviewedSystemBinary']);
assert.match(inventoryV2.$defs.discovery.properties.applicationOrigin.description, /advisory.*cloud.*authoritative/i);
assert.match(inventoryV2.$defs.discovery.properties.originEvidenceCode.description, /advisory.*cloud.*authoritative/i);
console.log('app-runtime contract compatibility: PASS');
