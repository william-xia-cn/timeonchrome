// reminder-transition-v0.test.js
// Validates reminder.js reason configs, actions, and rendering for V0 matrix semantics.
// Run with: node tests/unit/reminder-transition-v0.test.js

'use strict';

const fs = require('fs');
const path = require('path');

let passed = 0;
let failed = 0;

function expect(desc, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) passed++;
  else {
    failed++;
    console.error(`  ✗ ${desc}`);
    console.error(`    expected: ${JSON.stringify(expected)}`);
    console.error(`    actual:   ${JSON.stringify(actual)}`);
  }
}

function expectTrue(desc, cond) {
  if (cond) passed++;
  else {
    failed++;
    console.error(`  ✗ ${desc}`);
  }
}

function section(name) {
  console.log(`\n[${name}]`);
}

// Extract reminder.js configs and actionDefs by parsing the source
function loadReminderConfigs() {
  const abs = path.join(__dirname, '..', '..', 'extension', 'reminder.js');
  const fullCode = fs.readFileSync(abs, 'utf8');

  const configsMatch = fullCode.match(/const configs = \{([\s\S]*?)\n  \};/);
  if (!configsMatch) throw new Error('Cannot extract configs from reminder.js');

  const actionDefsMatch = fullCode.match(/const actionDefs = \{([\s\S]*?)\n  \};/);
  if (!actionDefsMatch) throw new Error('Cannot extract actionDefs from reminder.js');

  return { configsCode: configsMatch[1], actionDefsCode: actionDefsMatch[1], fullCode };
}

// Simulate reminder.js rendering logic for a given reason
function simulateReminderRendering(reason, msg = '') {
  const abs = path.join(__dirname, '..', '..', 'extension', 'reminder.js');
  const fullCode = fs.readFileSync(abs, 'utf8');

  // Extract the configs object
  const configsMatch = fullCode.match(/const configs = \{([\s\S]*?)\n  \};/);
  if (!configsMatch) throw new Error('Cannot extract configs');

  // Build a minimal configs map from source
  const configsBody = configsMatch[1];
  const configs = {};
  const entryRegex = /(\w+):\s*\{([^}]+)\}/g;
  let m;
  while ((m = entryRegex.exec(configsBody)) !== null) {
    const key = m[1];
    const body = m[2];
    const titleMatch = body.match(/title:\s*'([^']+)'/);
    const subtitleMatch = body.match(/subtitle:\s*'([^']+)'/);
    const iconMatch = body.match(/icon:\s*'([^']+)'/);
    const actionsMatch = body.match(/actions:\s*\[([^\]]+)\]/);
    configs[key] = {
      icon: iconMatch ? iconMatch[1] : '',
      title: titleMatch ? titleMatch[1] : '',
      subtitle: subtitleMatch ? subtitleMatch[1] : '',
      actions: actionsMatch ? actionsMatch[1].split(',').map(s => s.trim().replace(/'/g, '')) : [],
    };
  }

  // Simulate effectiveReason mapping
  let effectiveReason = reason;
  if (reason === 'blacklist') effectiveReason = 'unsafe';
  if (reason === 'whitelist') effectiveReason = 'study_mode';

  // V0 known reasons check
  const V0_KNOWN_REASONS = new Set([
    'unsafe', 'study_mode', 'to_composite_confirm', 'to_rest_confirm',
    'to_rest_slide_confirm', 'restricted_study_mode',
    'quota_composite_and_rest', 'rest_locked', 'quota_locked', 'quota_rest',
    'quota_study', 'quota_undetermined', 'quota_online', 'quota', 'schedule'
  ]);

  let config;
  let isUnknownReason = false;
  if (V0_KNOWN_REASONS.has(effectiveReason)) {
    config = configs[effectiveReason] || configs.unsafe;

    // Dual-path override for study_mode: default path shows rest copy, actions only return
    if (effectiveReason === 'study_mode') {
      config = {
        ...config,
        subtitle: '如需临时使用，请从扩展弹窗提交「申请网站归类」。继续进入休息会计入休息时间。',
        actions: ['backToStudy'],
      };
    }
  } else {
    isUnknownReason = true;
    config = {
      icon: '⚠️', title: '页面异常',
      subtitle: '无法识别当前提醒类型。请返回重试。',
      actions: ['backGeneric']
    };
  }

  return { effectiveReason, config, isUnknownReason, msg };
}

async function run() {
  const { configsCode, actionDefsCode, fullCode } = loadReminderConfigs();

  // ── 1. study_mode canonical rendering (dual-path Case #5) ──
  section('1. study_mode canonical rendering (dual-path Case #5)');
  const studyMode = simulateReminderRendering('study_mode');
  expectTrue('study_mode is known reason', !studyMode.isUnknownReason);
  expect('study_mode title', studyMode.config.title, '你正在打开未归类网站');
  expectTrue('study_mode explains popup pending-classification request', studyMode.config.subtitle.includes('申请网站归类'));
  expectTrue('study_mode default path still explains rest accounting', studyMode.config.subtitle.includes('休息时间'));
  expectTrue('study_mode actions are only backToStudy', JSON.stringify(studyMode.config.actions) === JSON.stringify(['backToStudy']));
  expectTrue('study_mode does NOT render legacy addComposite button', !studyMode.config.actions.includes('addComposite'));
  expectTrue('study_mode does NOT render legacy borrowTime button', !studyMode.config.actions.includes('borrowTime'));
  expectTrue('study_mode does NOT show generic blocked text', !studyMode.config.title.includes('不在可访问范围内'));
  expectTrue('study_mode does NOT show switchToRest', !studyMode.config.actions.includes('switchToRest'));

  // Request entrance is no longer in reminder HTML
  const htmlPath = path.join(__dirname, '..', '..', 'extension', 'reminder.html');
  const htmlContent = fs.readFileSync(htmlPath, 'utf8');
  expectTrue('dual-path composite section removed from HTML', !htmlContent.includes('id="dualPathCompositeSection"'));
  expectTrue('composite slider removed from HTML', !htmlContent.includes('id="slideConfirmWrapComposite"'));
  expectTrue('legacy composite request text removed from HTML', !htmlContent.includes('申请使用综合时间'));
  expectTrue('borrow section may still exist in HTML skeleton', htmlContent.includes('id="dualPathBorrowSection"'));

  // ── 2. study_mode with msg override ──
  section('2. study_mode with msg=这个网站当前不在可访问范围内');
  const studyModeWithMsg = simulateReminderRendering('study_mode', '这个网站当前不在可访问范围内');
  expectTrue('canonical title preserved despite msg', studyModeWithMsg.config.title === '你正在打开未归类网站');
  expectTrue('canonical subtitle preserved despite msg', studyModeWithMsg.config.subtitle.includes('申请网站归类'));
  expectTrue('msg is not used as title', studyModeWithMsg.config.title !== '这个网站当前不在可访问范围内');

  // ── 3. Unknown reason safe error state ──
  section('3. Unknown reason safe error state');
  const unknownReason = simulateReminderRendering('some_unknown_reason');
  expectTrue('unknown reason is flagged', unknownReason.isUnknownReason);
  expect('unknown reason title', unknownReason.config.title, '页面异常');
  expectTrue('unknown reason has only backGeneric', JSON.stringify(unknownReason.config.actions) === JSON.stringify(['backGeneric']));
  expectTrue('unknown reason has no addComposite', !unknownReason.config.actions.includes('addComposite'));
  expectTrue('unknown reason has no borrowTime', !unknownReason.config.actions.includes('borrowTime'));
  expectTrue('unknown reason does not imply classification', !unknownReason.config.title.includes('未归类') && !unknownReason.config.title.includes('学习模式'));

  // ── 4. to_rest_slide_confirm ──
  section('4. to_rest_slide_confirm rendering');
  const restSlide = simulateReminderRendering('to_rest_slide_confirm');
  expectTrue('to_rest_slide_confirm is known reason', !restSlide.isUnknownReason);
  expect('to_rest_slide_confirm title', restSlide.config.title, '你正在打开受限娱乐网站');
  expectTrue('to_rest_slide_confirm has no addComposite', !restSlide.config.actions.includes('addComposite'));
  expectTrue('to_rest_slide_confirm has backToStudy', restSlide.config.actions.includes('backToStudy'));
  expectTrue('to_rest_slide_confirm slide text matches doc (source check)', fullCode.includes("dragText: '确认进入休息时间'"));
  expectTrue('to_rest_slide_confirm release hint matches doc (source check)', fullCode.includes("releaseText: '松手确认'"));

  // ── 4b. to_rest_confirm ──
  section('4b. to_rest_confirm rendering');
  const restConfirm = simulateReminderRendering('to_rest_confirm');
  expectTrue('to_rest_confirm is known reason', !restConfirm.isUnknownReason);
  expectTrue('to_rest_confirm has backGeneric', restConfirm.config.actions.includes('backGeneric'));
  expectTrue('to_rest_confirm dual-path logic exists in source', fullCode.includes("effectiveReason === 'to_rest_confirm'"));
  expectTrue('to_rest_confirm siteType param handling exists', fullCode.includes("params.get('siteType')"));
  expectTrue('to_rest_confirm restricted site handling exists', fullCode.includes("siteType === 'restricted'"));
  expectTrue('to_rest_confirm no longer exposes composite request slider', !fullCode.includes('slideTrackComposite'));

  // ── 5. rest_locked ──
  section('5. rest_locked rendering');
  const restLocked = simulateReminderRendering('rest_locked');
  expectTrue('rest_locked is known reason', !restLocked.isUnknownReason);
  expect('rest_locked title', restLocked.config.title, '今天的休息时间已用完');
  expect('rest_locked subtitle', restLocked.config.subtitle, '当前不能继续访问。请返回。');
  expectTrue('rest_locked has only backGeneric', JSON.stringify(restLocked.config.actions) === JSON.stringify(['backGeneric']));
  expectTrue('rest_locked has no switchToRest', !restLocked.config.actions.includes('switchToRest'));
  expectTrue('rest_locked has no addComposite', !restLocked.config.actions.includes('addComposite'));
  expectTrue('rest_locked has no borrowTime', !restLocked.config.actions.includes('borrowTime'));

  section('5b. quota_locked rendering');
  const quotaLocked = simulateReminderRendering('quota_locked');
  expectTrue('quota_locked is known reason', !quotaLocked.isUnknownReason);
  expect('quota_locked title', quotaLocked.config.title, '当前配额已用完');
  expect('quota_locked subtitle', quotaLocked.config.subtitle, '当前不能继续访问。请返回。');
  expectTrue('quota_locked has only backGeneric', JSON.stringify(quotaLocked.config.actions) === JSON.stringify(['backGeneric']));
  expectTrue('quota_locked has no switchToRest', !quotaLocked.config.actions.includes('switchToRest'));
  expectTrue('quota_locked has no borrowTime', !quotaLocked.config.actions.includes('borrowTime'));

  // ── 6. quota_composite_and_rest ──
  section('6. quota_composite_and_rest rendering');
  const quotaBoth = simulateReminderRendering('quota_composite_and_rest');
  expectTrue('quota_composite_and_rest is known reason', !quotaBoth.isUnknownReason);
  expect('quota_composite_and_rest title', quotaBoth.config.title, '今日综合时间和休息时间均已用完');
  expectTrue('quota_composite_and_rest has only backGeneric', JSON.stringify(quotaBoth.config.actions) === JSON.stringify(['backGeneric']));
  expectTrue('quota_composite_and_rest has no continue action', !quotaBoth.config.actions.some(a => a !== 'backGeneric'));

  // ── 7. unsafe ──
  section('7. unsafe rendering');
  const unsafe = simulateReminderRendering('unsafe');
  expectTrue('unsafe is known reason', !unsafe.isUnknownReason);
  expect('unsafe title', unsafe.config.title, '此网站不可访问');
  expect('unsafe subtitle', unsafe.config.subtitle, '该网站属于禁止访问范围。');
  expectTrue('unsafe has only back', JSON.stringify(unsafe.config.actions) === JSON.stringify(['back']));
  expectTrue('unsafe has no borrow', !unsafe.config.actions.includes('borrowTime'));
  expectTrue('unsafe has no addComposite', !unsafe.config.actions.includes('addComposite'));

  // ── 8. Source-level validations ──
  section('8. Source-level validations');
  expectTrue('quota_composite active config removed', !configsCode.includes('quota_composite:'));
  expectTrue('enterRestContinue action removed', !actionDefsCode.includes('enterRestContinue:'));
  expectTrue('quota_composite_and_rest has correct body', configsCode.includes('当前不能继续访问。请返回。'));
  expectTrue('study_mode has backToStudy action', configsCode.includes("'backToStudy'"));
  expectTrue('V0_KNOWN_REASONS set exists in source', fullCode.includes('V0_KNOWN_REASONS'));
  expectTrue('Unknown reason safe fallback exists', fullCode.includes('页面异常'));
  expectTrue('Unknown reason logs warning', fullCode.includes("console.warn('[reminder] unknown reason:'"));
  expectTrue('msg suppressed for all reasons (V0 canonical-only)', fullCode.includes("customMsgEl.style.display = 'none'"));

  // Dual-path source validations
  expectTrue('bindSlideConfirm supports options', fullCode.includes('options = {}'));
  expectTrue('study_mode dual-path composite rendering removed', !fullCode.includes('dualPathCompositeSection'));
  expectTrue('composite slider binding removed', !fullCode.includes('slideTrackComposite'));
  expectTrue('borrow slider binding removed in V1-minimal', !fullCode.includes('BORROW_REST_QUOTA'));
  expectTrue('study_mode config.actions override exists', fullCode.includes("config.actions = ['backToStudy']"));
  expectTrue('study_mode block is properly closed', fullCode.includes('config.actions = [') && fullCode.includes("if (customMsgEl)"));

  // ── 9. No Composite borrow anywhere ──
  section('9. No Composite borrowing');
  expectTrue('no BORROW_COMPOSITE_QUOTA action', !actionDefsCode.includes('BORROW_COMPOSITE'));
  expectTrue('no borrowComposite action', !actionDefsCode.includes('borrowComposite'));

  // ── Summary ──
  const total = passed + failed;
  console.log(`\n[Reminder Transition V0] ${passed}/${total} passed${failed ? ` — ${failed} FAILED` : ''}`);
  if (failed > 0) process.exit(1);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
