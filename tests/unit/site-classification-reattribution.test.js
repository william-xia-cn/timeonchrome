'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', '..');
const requestRoute = fs.readFileSync(path.join(root, 'workers', 'src', 'routes', 'siteClassificationRequests.ts'), 'utf8');
const statsRoute = fs.readFileSync(path.join(root, 'workers', 'src', 'routes', 'stats.ts'), 'utf8');
const worker = fs.readFileSync(path.join(root, 'workers', 'src', 'index.ts'), 'utf8');
const service = fs.readFileSync(path.join(root, 'workers', 'src', 'services', 'usageAccountingCorrections.ts'), 'utf8');

assert(requestRoute.includes("decision === 'reject'"));
assert(requestRoute.includes("classification === 'restricted'"));
assert(requestRoute.includes('processRestrictedReattributions'));
assert(statsRoute.includes('restrictedReattributionRequestIds'));
assert(statsRoute.includes('ctx.waitUntil(reattributionWork)'));
assert(worker.includes('processRestrictedReattributions(env, { maxBatchesPerRequest: 4 })'));

assert(service.includes("s.channel = 'active'"));
assert(service.includes('s.target_rule_id IN (?, ?)'));
assert(service.includes('r.client_request_id IN'));
assert(service.includes('s.mode, s.target_rule_id,'), 'candidate rows must carry request identity into the eligibility guard');
assert(service.includes("s.target_classification_at_time IN ('pending_composite', 'unclassified')"));
assert(!service.includes('media_segments_v1'));
assert(service.includes("'rest', 'restricted', 'rest'"));
assert(service.includes('LEFT JOIN usage_segment_corrections_v1 c ON c.segment_id = s.id'));

console.log('[Site Classification Reattribution] passed');
