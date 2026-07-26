// system-access-defaults-catalog.test.js
// Run with: node tests/unit/system-access-defaults-catalog.test.js

'use strict';

const defaults = require('../../workers/config/site-access-defaults.json');

const QUSTODIO_CONTENT_CATEGORIES = new Set([
  '教育性', '政府', '企业', '健康', '人工智能', '技术', '职业',
  '网页邮件', '文件共享', '搜索门户', '新闻', '宗教', '综合门户',
  '娱乐', '体育', '游戏', '旅游', '购物', '论坛', '社交网络', '聊天', '视频/直播', '娱乐门户',
  '博彩', '代理/漏洞', '暴力', '武器', '脏话', '成人内容', '色情内容', '酒精', '毒品', '烟草',
]);

const LISTS = [
  ['defaultStudySites', 'study'],
  ['defaultCompositeSites', 'composite'],
  ['defaultUserCompositeSites', 'composite'],
  ['defaultRestrictedEntertainmentSites', 'restricted'],
  ['defaultBlockedSites', 'blocked'],
];

let passed = 0;
let failed = 0;
function expectTrue(desc, cond) {
  if (cond) passed++;
  else {
    failed++;
    console.error(`  ✗ ${desc}`);
  }
}

function hostKey(value) {
  return String(value || '').trim().toLowerCase();
}

function run() {
  const catalog = Array.isArray(defaults.siteCatalog) ? defaults.siteCatalog : [];
  const catalogByDomain = new Map(catalog.map(item => [hostKey(item.domain), item]));
  const expectedByDomain = new Map();
  for (const [listKey, classification] of LISTS) {
    expectTrue(`${listKey} should be an array`, Array.isArray(defaults[listKey]));
    for (const domain of defaults[listKey] || []) {
      const key = hostKey(domain);
      const existing = expectedByDomain.get(key);
      expectTrue(`${key} should not appear in multiple system default lists`, !existing || existing === classification);
      expectedByDomain.set(key, classification);
    }
  }

  expectTrue('siteCatalog should cover every default*Sites host exactly once or more', catalog.length >= expectedByDomain.size);
  for (const [domain, classification] of expectedByDomain.entries()) {
    const item = catalogByDomain.get(domain);
    expectTrue(`${domain} should have siteCatalog metadata`, Boolean(item));
    if (!item) continue;
    expectTrue(`${domain} catalog should include name`, typeof item.name === 'string' && item.name.trim().length > 0);
    expectTrue(`${domain} catalog should include valid contentCategory`, QUSTODIO_CONTENT_CATEGORIES.has(item.contentCategory));
    expectTrue(`${domain} catalog classification should match default list`, item.classification === classification);
    expectTrue(`${domain} catalog should include confidence`, typeof item.confidence === 'string' && item.confidence.trim().length > 0);
    expectTrue(`${domain} catalog should include notes`, typeof item.notes === 'string' && item.notes.trim().length > 0);
  }

  const invalidCatalog = catalog.filter(item => !expectedByDomain.has(hostKey(item.domain)));
  expectTrue('siteCatalog should not contain unrelated domains in fallback defaults', invalidCatalog.length === 0);

  const studyCategories = new Set((defaults.defaultStudySites || []).map(domain => catalogByDomain.get(hostKey(domain))?.contentCategory));
  expectTrue('study catalog should include 教育性 group', studyCategories.has('教育性'));
  expectTrue('study catalog should include 人工智能 group', studyCategories.has('人工智能'));
  expectTrue('study catalog should include 技术 group', studyCategories.has('技术'));
  expectTrue('study catalog should not render as one all-unmarked group', !studyCategories.has(undefined) && studyCategories.size >= 3);

  const total = passed + failed;
  console.log(`\n[System Access Defaults Catalog] ${passed}/${total} passed${failed ? ` — ${failed} FAILED` : ''}`);
  if (failed > 0) process.exit(1);
}

run();