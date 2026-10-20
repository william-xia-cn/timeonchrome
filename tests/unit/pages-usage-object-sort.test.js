'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', '..', 'pages', 'index.html'), 'utf8');
const start = source.indexOf('function sortCloudWebTargetRows(');
const end = source.indexOf('\nfunction filteredCloudUsageRows(', start);
assert(start >= 0 && end > start, '网页管理对象排序函数存在');
const context = {};
vm.runInNewContext(`${source.slice(start, end)}\nthis.sortRows = sortCloudWebTargetRows;`, context);

const rows = [
  { key:'b', label: '乙', todaySeconds: 20, weekSeconds: 90 },
  { key:'a', label: '甲', todaySeconds: 20, weekSeconds: 30 },
  { key:'c', label: '丙', todaySeconds: 0, weekSeconds: 200 },
];
const labels = result => Array.from(result, row => row.label).join(',');
assert.equal(labels(context.sortRows(rows)), '甲,乙,丙', '默认按今日秒数降序，同秒按对象键稳定排列');
assert.equal(labels(context.sortRows([{...rows[0],label:'同名'},{...rows[1],label:'同名'}])), '同名,同名');
assert.equal(context.sortRows([{...rows[0],label:'甲'},{...rows[1],label:'乙'}])[0].key,'a','显示名称不影响同值排序');
assert.equal(labels(context.sortRows(rows, 'week')), '丙,乙,甲', '可按本周秒数降序');
assert.equal(labels(context.sortRows(rows, 'unknown')), '甲,乙,丙', '无效选项回到今日');
assert.equal(labels(rows), '乙,甲,丙', '排序不改动统计源数组');
assert.match(source, /let cloudUsageState = \{[^\n]*listSort: 'today'/);
assert.match(source, /view\?\.kind === 'web' \? sortCloudWebTargetRows\(rows, cloudUsageState\.listSort\) : rows/);
assert.match(source, /if \(!isWeb && cloudUsageState\.listMode === 'categories'\)/);
console.log('pages-usage-object-sort: PASS');
