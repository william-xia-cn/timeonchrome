'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../../extension/admin/admin.js'), 'utf8');
function extractFunction(name) {
  const start = source.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `missing production function ${name}`);
  const paramsOpen = source.indexOf('(', start);
  let paramsDepth = 0, paramsClose = -1;
  for (let i = paramsOpen; i < source.length; i++) {
    if (source[i] === '(') paramsDepth++;
    else if (source[i] === ')' && --paramsDepth === 0) { paramsClose = i; break; }
  }
  assert.notEqual(paramsClose, -1, `unclosed parameters for ${name}`);
  const open = source.indexOf('{', paramsClose);
  let depth = 0;
  for (let i = open; i < source.length; i++) {
    if (source[i] === '{') depth++;
    else if (source[i] === '}' && --depth === 0) return source.slice(start, i + 1);
  }
  throw new Error(`unclosed function ${name}`);
}

const elements = new Map();
const queryRows = [];
function element(id) {
  if (!elements.has(id)) elements.set(id, { id, innerHTML: '', value: '', placeholder: '', textContent: '', className: '',
    classList: { toggle() {} }, querySelector() { return { textContent: '' }; },
    querySelectorAll() { return queryRows; }, addEventListener() {} });
  return elements.get(id);
}
const state = { listMode: 'targets', query: '', detail: null };
const context = {
  APPLICATION_CATEGORY_LABELS: { study: '学习', other: '其他' },
  usageAnalysisState: state,
  usageAnalysisLastView: null,
  document: { getElementById: element },
  escHtml: value => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;'),
  escAttr: value => String(value ?? '').replaceAll('"', '&quot;'),
  formatSeconds: value => `${value}秒`,
  console,
};
vm.runInNewContext([
  'const APPLICATION_CATEGORY_LABELS = this.APPLICATION_CATEGORY_LABELS;',
  'const usageAnalysisState = this.usageAnalysisState;',
  'let usageAnalysisLastView = null;',
  extractFunction('usageCategoryLabel'), extractFunction('usageTime'), extractFunction('usageStatusClass'),
  extractFunction('usageCategoryKeys'), extractFunction('filteredUsageRows'), extractFunction('usageTargetIcon'),
  extractFunction('usagePresentationView'), extractFunction('renderUsageLegend'),
  extractFunction('identitySeconds'), extractFunction('renderIdentityUsageList'),
  extractFunction('renderUsageAnalysisList'), extractFunction('renderUsageDetail'),
  'this.renderUsageLegend = renderUsageLegend; this.renderUsageAnalysisList = renderUsageAnalysisList;',
  'this.usageAnalysisState = usageAnalysisState;'
].join('\n'), context, { filename: 'admin.js' });

function partialView() {
  return { kind: 'application', readUnit: 'seconds', totalSeconds: null, knownTotalSeconds: 6,
    range: { mode: 'day', from: '2026-10-06', to: '2026-10-06', label: '2026-10-06' },
    categoryKeys: ['app_study', 'app_other'], categoryTotals: { app_study: 4 },
    categoryRows: [
      { key: 'app_study', label: '学习', seconds: 4, limitLabel: '不适用', status: '已知部分；总量不完整' },
      { key: 'app_other', label: '其他', seconds: null, limitLabel: '不适用', status: '分类用量未知' },
    ],
    targetRows: [{ key: 'product:word', label: 'Word', todaySeconds: 4, weekSeconds: 4,
      rangeSeconds: null, rangeKnownSeconds: 4, categoryLabel: '学习', category: 'app_study', status: '已知部分' }],
  };
}

const partial = partialView();
context.renderUsageLegend(partial);
const legend = element('usage-analysis-legend').innerHTML;
assert.match(legend, /学习<\/div>\s*<div class="usage-legend-time">4秒（已知部分）/);
assert.match(legend, /其他<\/div>\s*<div class="usage-legend-time">—/);
assert.doesNotMatch(legend, /其他<\/div>\s*<div class="usage-legend-time">0秒/);

queryRows.splice(0, queryRows.length, { dataset: { usageDetailKind: 'target', usageDetailKey: 'product:word' },
  addEventListener(_type, callback) { this.onClick = callback; } });
context.renderUsageAnalysisList(partial);
const table = element('usage-analysis-table-wrap').innerHTML;
assert.match(table, /Word/);
assert.match(table, /所选范围已知 4秒；总量不完整/);
assert.match(table, /4秒/);
queryRows[0].onClick();
assert.match(element('usage-analysis-detail').innerHTML, /已知部分 4秒；总量暂不完整/);

state.listMode = 'categories';
queryRows.splice(0, queryRows.length, { dataset: { usageDetailKind: 'category', usageDetailKey: 'app_study' },
  addEventListener(_type, callback) { this.onClick = callback; } });
context.renderUsageAnalysisList(partial);
const categories = element('usage-analysis-table-wrap').innerHTML;
assert.match(categories, /学习/);
assert.match(categories, /4秒/);
assert.match(categories, /已知部分/);
assert.match(categories, /其他/);
assert.match(categories, /未知/);
assert.doesNotMatch(categories, /其他<\/span><\/td>\s*<td>0秒/);
queryRows[0].onClick();
assert.match(element('usage-analysis-detail').innerHTML, /当前范围：4秒（已知部分）/);

const completeZero = { ...partial, totalSeconds: 0, knownTotalSeconds: 0, categoryTotals: {},
  categoryRows: partial.categoryRows.map(row => ({ ...row, seconds: 0 })) };
context.renderUsageLegend(completeZero);
assert.match(element('usage-analysis-legend').innerHTML, /0秒/);

const unknownSeconds = { ...partial, totalSeconds: null, knownTotalSeconds: 0, categoryTotals: {}, targetRows: [], categoryRows: [] };
context.renderUsageAnalysisList(unknownSeconds);
assert.match(element('usage-analysis-table-wrap').innerHTML, /用量未知，不代表零用量/);
assert.doesNotMatch(element('usage-analysis-table-wrap').innerHTML, /没有管理对象使用记录/);
context.renderUsageLegend(unknownSeconds);
assert.doesNotMatch(element('usage-analysis-legend').innerHTML, />0秒</);

const legacyMsIncomplete = { ...partial, readUnit: 'milliseconds', totalSeconds: null, knownTotalSeconds: 4,
  categoryTotals: { app_study: 4 } };
context.renderUsageAnalysisList(legacyMsIncomplete);
assert.match(element('usage-analysis-table-wrap').innerHTML, /暂不能提供完整总量或明细/);
assert.doesNotMatch(element('usage-analysis-table-wrap').innerHTML, /Word/);
context.renderUsageLegend(legacyMsIncomplete);
assert.doesNotMatch(element('usage-analysis-legend').innerHTML, /4秒/);
assert.equal((element('usage-analysis-legend').innerHTML.match(/>—</g) || []).length, 2);

const legacyMs = { ...partial, readUnit: 'milliseconds', totalSeconds: 2.5, categoryTotals: { app_study: 1.5 },
  categoryRows: partial.categoryRows.map(row => ({ ...row, seconds: 1.5 })) };
context.renderUsageLegend(legacyMs);
assert.match(element('usage-analysis-legend').innerHTML, /1秒 500毫秒/);

const identityView = { ...partial, identityModel: true, totalSeconds: 180, knownTotalSeconds: 180,
  selectedProductComplete: true,
  identityProductProjectionStatus: '产品身份投影已验证；与基础实例账分开展示，不相加',
  baseRows: [{ key: 'instance:base-a', label: '基础实例 · base-a', rangeSeconds: 180,
    rangeKnownSeconds: 180, todaySeconds: 120, weekSeconds: 180, status: '产品身份未逐实例确认；不按名称推断' }],
  targetRows: [{ key: 'product:catalog-word', label: '目录确认的产品', rangeSeconds: 90,
    todaySeconds: 60, weekSeconds: 90, status: '目录确认的产品' }],
  categoryRows: [{ key: 'app_study', label: '学习', seconds: 90, rangeKnownSeconds: 90, status: '独立产品投影' }],
};
state.listMode = 'targets';
context.renderUsageAnalysisList(identityView);
const identityTable = element('usage-analysis-table-wrap').innerHTML;
assert.match(identityTable, /基础实例账/);
assert.match(identityTable, /产品身份投影/);
assert.match(identityTable, /基础实例 · base-a/);
assert.match(identityTable, /目录确认的产品/);
assert.match(identityTable, /绝不相加/);
assert.equal(identityView.totalSeconds, 180, 'product projection must not replace the base primary total');

console.log('Admin application renderer: partial known data visible, unknown values not zero, complete-zero and legacy-ms preserved');
