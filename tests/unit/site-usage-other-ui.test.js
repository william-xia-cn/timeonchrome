// Run with: node tests/unit/site-usage-other-ui.test.js
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '..', '..', 'pages', 'index.html'), 'utf8');

assert(source.includes("if (targetPolicy === 'other') return 'other';"), 'used-site review must send the distinct other decision');
assert(source.includes("classifyUnclassifiedReviewRow(${rowIdx}, 'other')") && source.includes("onclick=\"classifyUnclassifiedReviewRow(${rowIdx}, 'other')\">归为其他时间"), 'unclassified site review must expose the other-time action');
assert(source.includes("onclick=\"decideSiteClassificationRequest(${idx},'other')\">归为其他时间"), 'classification request review must expose the other-time action');
assert(source.includes("if (status === 'approved_other') return '已确认为其他时间';"), 'approved other requests must render a stable status');
assert(source.includes('不改变网站访问权限'), 'the UI must explain that other-time classification is not an access-policy change');

console.log('site usage other UI: PASS');
