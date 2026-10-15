const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const source = fs.readFileSync(path.resolve('extension/content.js'), 'utf8');
const ast = ts.createSourceFile('content.js', source, ts.ScriptTarget.Latest, true);
const names = new Set(['formatDurationCN', 'formatReminderDuration', 'restReminderCopy', 'restReminderStyles',
  'showRestUsageReminder', 'activateRestUsageReminder', 'clearRestUsageReminder']);
const functions = [];
function collect(node) {
  if (ts.isFunctionDeclaration(node) && names.has(node.name?.text)) functions.push(node.getText(ast));
  ts.forEachChild(node, collect);
}
collect(ast);
test('actual reminder renderer: merged reasons, repeat, unknown and narrow layout', async ({ page }) => {
  // Rendering fixture only; the separate unpacked test exercises real SW/Content admission.
  await page.setContent('<h1>隔离提醒展示验收</h1>');
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addScriptTag({ content: `
    let restReminderHost, restReminderShadow, restReminderDialog, restReminderToken, restReminderActionType,
      restReminderResolving, restReminderPreviousFocus, restReminderPreviousOverflow='', restReminderResolveAction,
      restReminderCountdownTimer, restReminderPausedMedia=[];
    const pauseMediaForRestReminder=()=>{}, resumeMediaAfterRestReminder=()=>{}, exitPictureInPictureIfNeeded=async()=>{};
    window.chrome={runtime:{sendMessage:(message, done)=>done({ok:true,action:message.action})}};
    ${functions.join('\n')}
    window.showFixture=async payload=>{await showRestUsageReminder(payload);
      await activateRestUsageReminder({token:payload.token,deadlineAt:Date.now()+60000});};
  ` });
  expect(errors).toEqual([]);
  const cases = [
    { name: 'quota', reasons: ['dailyRest'], view: { quotas: [{ id: 'dailyRest', usedSeconds: 7800, limitSeconds: 7200 }] }, title: '今日休息已超出配额' },
    { name: 'repeat', reasons: ['dailyRest', 'weeklyRest', 'timeWindow'], view: { kind: 'repeat', sinceConfirmationSeconds: 1800,
      classification: 'restricted', nextWindow: { dayOffset: 1, start: '12:00', end: '13:30' },
      quotas: [{ id: 'dailyRest', usedSeconds: 9600, limitSeconds: 7200 }, { id: 'weeklyRest', usedSeconds: 73800, limitSeconds: 72000 }] },
      title: '强行使用已满30分，请再次确认' },
    { name: 'unknown', reasons: ['dailyRest'], view: {}, title: '继续使用需要确认' },
  ];
  for (const sample of cases) {
    await page.evaluate(sample => window.showFixture({ token: sample.name, confirmationKind: 'forced_use',
      forcedUseReasons: sample.reasons, forcedUsePresentation: sample.view }), sample);
    await expect(page.getByRole('heading', { name: sample.title, exact: true })).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveCount(1);
    await expect(page.getByRole('button', { name: '确认继续', exact: true })).toBeDisabled();
    for (const width of [1280, 390]) {
      await page.setViewportSize({ width, height: 844 });
      await expect(page.getByRole('button', { name: '结束使用', exact: true })).toBeInViewport();
      const box = await page.getByRole('dialog').boundingBox();
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(width);
      await page.screenshot({ path: test.info().outputPath(`${sample.name}-${width}.png`) });
    }
    await page.getByRole('textbox').fill('强行使用');
    await page.getByRole('button', { name: '确认继续', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
  }
});
