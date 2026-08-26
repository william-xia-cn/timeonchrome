// pages-mobile-layout.test.js
// Run with: node tests/unit/pages-mobile-layout.test.js

'use strict';

const fs = require('fs');
const path = require('path');

const source = fs.readFileSync(path.join(__dirname, '..', '..', 'pages', 'index.html'), 'utf8');
let passed = 0;
let failed = 0;

function expectTrue(description, condition) {
  if (condition) passed++;
  else {
    failed++;
    console.error(`  x ${description}`);
  }
}

expectTrue('mobile layout keeps the current profile visible in a fixed top bar',
  source.includes('position: fixed; top: 0; left: 0; right: 0;') &&
  source.includes('.profile-selector .name') &&
  source.includes('display: block; min-width: 0; overflow: hidden'));

expectTrue('mobile layout uses a five-item fixed bottom navigation',
  source.includes('grid-template-columns: repeat(5, minmax(0, 1fr))') &&
  source.includes('height: calc(66px + env(safe-area-inset-bottom))'));

expectTrue('secondary destinations are available from a mobile more sheet',
  source.includes('id="mobile-more-btn"') &&
  source.includes('id="mobile-more-overlay"') &&
  source.includes('href="native-apps/"') &&
  source.includes('id="mobile-system-management-btn"') &&
  source.includes('id="mobile-logout-btn"'));

expectTrue('mobile more sheet supports close, backdrop, Escape and page navigation',
  source.includes('function setMobileMoreOpen') &&
  source.includes("event.key === 'Escape'") &&
  source.includes("event.target === event.currentTarget") &&
  source.includes(".nav-item[data-page=\"system-management\"]"));

expectTrue('mobile page content reserves top, bottom and safe-area space',
  source.includes('padding: calc(62px + env(safe-area-inset-top)) 0 calc(72px + env(safe-area-inset-bottom))'));

expectTrue('secondary tabs are horizontally scrollable touch targets',
  source.includes('scroll-snap-type: x proximity') &&
  source.includes('.tab-btn { min-height: 44px; flex: 0 0 auto'));

expectTrue('24-hour chart has its own horizontal scroll container',
  source.includes('class="usage-chart-scroll"') &&
  source.includes('#cloud-usage-main-chart { min-width: 680px; }'));

expectTrue('usage rows expose field labels for mobile cards',
  source.includes('data-label="今日时间"') &&
  source.includes('data-label="本周时间"') &&
  source.includes('#cloud-usage-table .usage-analysis-table thead { display: none; }'));

expectTrue('daily quota controls use mobile grouping rather than inline desktop grids',
  source.includes('class="quota-daily-row"') &&
  source.includes('class="quota-control-label"') &&
  source.includes('.quota-daily-row {') &&
  source.includes('grid-template-columns: 1fr; gap: 10px; padding: 14px 0'));

expectTrue('schedule rows expose labels and become mobile cards',
  source.includes('<table class="schedule-table">') &&
  source.includes('data-label="学习时段"') &&
  source.includes('data-label="在线时段（只读）"') &&
  source.includes('.schedule-table thead { display: none; }'));

expectTrue('mobile forms avoid iOS zoom and retain touch-sized actions',
  source.includes('font-size: 16px !important') &&
  source.includes('.btn-add,') &&
  source.includes('.btn-save,') &&
  source.includes('.btn-secondary { min-height: 44px; }'));

expectTrue('mobile modal and toast avoid the bottom navigation safe area',
  source.includes('.modal-overlay { align-items: flex-end; }') &&
  source.includes('bottom: calc(78px + env(safe-area-inset-bottom))'));

const total = passed + failed;
console.log(`\n[Pages Mobile Layout] ${passed}/${total} passed${failed ? ` - ${failed} FAILED` : ''}`);
if (failed) process.exit(1);
