// Run with: node tests/unit/cloud-failure-incident.test.js

'use strict';

const fs = require('fs');
const path = require('path');

const source = fs.readFileSync(
  path.join(__dirname, '..', '..', 'extension', 'infra', 'cloud-failure-incident.js'),
  'utf8'
).replace(/export\s+(?=(?:const|function)\s+)/g, '');

const api = new Function(`${source}\nreturn {
  CLOUD_FAILURE_INCIDENT_WINDOW_MS,
  CLOUD_FAILURE_INCIDENT_MAX_ACTIVE,
  normalizeCloudFailureCode,
  makeCloudFailureFingerprint,
  advanceCloudFailureIncident,
  resolveCloudFailureIncidents,
};`)();

let passed = 0;
function check(label, condition, detail = '') {
  if (!condition) throw new Error(`${label}${detail ? `: ${detail}` : ''}`);
  passed++;
}

const start = Date.parse('2026-08-31T08:00:00Z');
let state = null;
let transition = api.advanceCloudFailureIncident(state, {
  scope: 'config_pull', level: 'error', eventCode: 'cloud_config_pull_failed', error: new Error('Failed to fetch'),
}, start);
state = transition.state;
check('first failure logs immediately', transition.shouldLog === true);
check('failure code is normalized', transition.record.code === 'fetch_failed');

for (let index = 1; index < 10; index++) {
  transition = api.advanceCloudFailureIncident(state, {
    scope: 'config_pull', level: 'error', eventCode: 'cloud_config_pull_failed', error: new Error('Failed to fetch'),
  }, start + index * 60_000);
  state = transition.state;
  check(`repeat ${index} is suppressed`, transition.shouldLog === false);
}
const record = Object.values(state.active)[0];
check('ten failures are counted', record.count === 10, JSON.stringify(record));
check('incident stores no raw error text', !JSON.stringify(state).includes('Failed to fetch'));

transition = api.advanceCloudFailureIncident(state, {
  scope: 'config_pull', level: 'error', eventCode: 'cloud_config_pull_failed', error: new Error('HTTP 503'),
}, start + 10 * 60_000);
state = transition.state;
check('changed error code logs immediately', transition.shouldLog === true);
check('changed error creates distinct fingerprint', Object.keys(state.active).length === 2);

transition = api.advanceCloudFailureIncident(state, {
  scope: 'config_pull', level: 'error', eventCode: 'cloud_config_pull_failed', error: new Error('Failed to fetch'),
}, start + api.CLOUD_FAILURE_INCIDENT_WINDOW_MS + 1);
state = transition.state;
check('same failure logs after cooldown', transition.shouldLog === true);

for (let index = 0; index < 20; index++) {
  transition = api.advanceCloudFailureIncident(state, {
    scope: `scope_${index}`, level: 'warning', eventCode: `event_${index}`, error: 'request_timeout',
  }, start + api.CLOUD_FAILURE_INCIDENT_WINDOW_MS + 100 + index);
  state = transition.state;
}
check('active incident state is fixed-size', Object.keys(state.active).length === api.CLOUD_FAILURE_INCIDENT_MAX_ACTIVE);

const resolved = api.resolveCloudFailureIncidents(state, start + 2 * api.CLOUD_FAILURE_INCIDENT_WINDOW_MS);
check('recovery closes active incidents once', resolved.resolved === true && Object.keys(resolved.state.active).length === 0);
check('recovery summary is bounded', resolved.summary.incidentCount === api.CLOUD_FAILURE_INCIDENT_MAX_ACTIVE);
const resolvedAgain = api.resolveCloudFailureIncidents(resolved.state, start + 2 * api.CLOUD_FAILURE_INCIDENT_WINDOW_MS + 1);
check('second recovery emits nothing', resolvedAgain.resolved === false);

console.log(`[Cloud Failure Incident] ${passed}/${passed} passed`);
