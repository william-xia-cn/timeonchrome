const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const ts = require('typescript');

test('actual shared Content markup supports typed input on desktop and narrow screens', async ({ page }) => {
  const source = fs.readFileSync('extension/content.js', 'utf8');
  const extract = (from, to) => source.slice(source.indexOf(from), source.indexOf(to, source.indexOf(from) + from.length));
  const presentation = extract('  function restReminderStyles()', '  function bindRestReminderSlider(');
  const helpers = [];
  const ast = ts.createSourceFile('content.js', source, ts.ScriptTarget.Latest, true);
  const collect = node => {
    if (ts.isFunctionDeclaration(node) && ['restReminderCopy', 'formatReminderDuration', 'formatDurationCN'].includes(node.name?.text)) helpers.push(node.getText(ast));
    ts.forEachChild(node, collect);
  };
  collect(ast);
  const branch = extract("    if (['SHOW_SHARED_REMINDER'", "    if (msg.type === 'SHOW_WARNING')");
  await page.setContent('<html><body><h1>隔离文字确认验收</h1></body></html>');
  await page.evaluate(({ presentation, branch, helpers }) => {
    window.actions = [];
    window.chrome = { runtime: { id: 'isolated', lastError: null, sendMessage(message, reply) {
      window.actions.push(message);
      reply({ ok: true, state: { ...window.fixtureState, status: 'resolved', resolution: message.payload.action } });
    } } };
    new Function(`let sharedReminderView = null, restReminderDialog = null;
      const revokedSharedPresentations = new Set(), canRenderTopFrameUi = true;
      ${presentation}
      ${helpers.join('\n')}
      window.deliver = msg => new Promise(sendResponse => { const _sender = { id: 'isolated' }; ${branch} });`)();
    window.fixtureState = { schemaVersion: 1, roundId: 'round', reminderId: 'reminder', deliveryId: 'delivery',
      policyRevision: 'policy', stateRevision: 'state', presenter: 'browser', stage: 'shared', kinds: ['daily', 'weekly'],
      status: 'offered', visibleAtMs: null };
  }, { presentation, branch, helpers });
  const show = await page.evaluate(() => window.deliver({ type: 'SHOW_SHARED_REMINDER', state: window.fixtureState, presentationId: 'presentation' }));
  expect(show.confirmationVersion).toBe(1);
  const input = page.getByRole('textbox', { name: '手动输入强行使用' });
  const confirm = page.getByRole('button', { name: '确认继续', exact: true });
  await expect(input).toBeDisabled();
  const activate = await page.evaluate(() => {
    window.fixtureState = { ...window.fixtureState, status: 'visible', visibleAtMs: Date.now() };
    return window.deliver({ type: 'ACTIVATE_SHARED_REMINDER', state: window.fixtureState, presentationId: 'presentation' });
  });
  expect(activate.confirmationVersion).toBe(1);
  await expect(input).toBeEnabled(); await expect(confirm).toBeDisabled();
  await input.fill('不适合使用'); await expect(confirm).toBeDisabled();
  expect(await input.evaluate(node => ['paste', 'drop'].every(type => !node.dispatchEvent(new Event(type, { bubbles: true, cancelable: true }))))).toBe(true);
  expect(await input.evaluate(node => !node.dispatchEvent(new InputEvent('beforeinput', { inputType: 'insertFromPaste', cancelable: true, bubbles: true })))).toBe(true);
  await page.keyboard.press('Escape'); await expect(input).toBeVisible();
  const output = fs.mkdtempSync(path.join(os.tmpdir(), 'timeonchrome-shared-visual-'));
  for (const [name, width, height] of [['desktop', 1280, 800], ['mobile', 390, 844]]) {
    await page.setViewportSize({ width, height });
    const box = await input.boundingBox();
    expect(box.x).toBeGreaterThanOrEqual(0); expect(box.x + box.width).toBeLessThanOrEqual(width);
    await page.screenshot({ path: path.join(output, `${name}.png`) });
  }
  await input.fill('强行使用'); await confirm.click();
  await expect(input).toHaveCount(0);
  expect(await page.evaluate(() => window.actions.map(action => [action.payload.action, action.confirmationText]))).toEqual([['continue', '强行使用']]);
  const v2Shown = await page.evaluate(() => {
    window.fixtureState = { ...window.fixtureState, schemaVersion: 2, roundId: 'round-v2', kinds: ['repeat'],
      reasonCodes: ['dailyRest', 'timeWindow'], forcedUsageSeconds: 2100, confirmedAtUsageSeconds: 300,
      status: 'offered', visibleAtMs: null };
    return window.deliver({ type: 'SHOW_SHARED_REMINDER', state: window.fixtureState, presentationId: 'presentation-v2',
      forcedUsePresentation: { classification: 'restricted', nextWindow: { dayOffset: 0, start: '16:30', end: '19:30' },
        quotas: [{ id: 'dailyRest', usedSeconds: 7800, limitSeconds: 7200 }] } });
  });
  expect(v2Shown.visible).toBe(true);
  await expect(page.getByRole('heading', { name: '强行使用已满30分，请再次确认', exact: true })).toBeVisible();
  await expect(page.getByText(/已用2小时10分，标准配额2小时/)).toBeVisible();
  await expect(page.getByText(/现在不在允许使用时段/)).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(1);
  await page.evaluate(() => {
    window.fixtureState = { ...window.fixtureState, status: 'visible', visibleAtMs: Date.now() };
    return window.deliver({ type: 'ACTIVATE_SHARED_REMINDER', state: window.fixtureState, presentationId: 'presentation-v2' });
  });
  for (const [name, width, height] of [['desktop', 1280, 800], ['mobile', 390, 844]]) {
    await page.setViewportSize({ width, height });
    await page.screenshot({ path: path.join(output, `v2-${name}.png`) });
    const box = await input.boundingBox();
    expect(box.x).toBeGreaterThanOrEqual(0); expect(box.x + box.width).toBeLessThanOrEqual(width);
  }
  expect(await input.evaluate(node => !node.dispatchEvent(new Event('paste', { cancelable: true, bubbles: true })))).toBe(true);
  await expect(confirm).toBeDisabled();
  await input.fill('强行使用'); await confirm.click();
  expect(await page.evaluate(() => window.actions.at(-1).payload.schemaVersion)).toBe(2);
  fs.writeFileSync(path.join(output, 'evidence.json'), JSON.stringify({ kind: 'actual_content_dom_mock_runtime', realNative: false, realServiceWorker: false }));
  console.log('Shared typed DOM evidence: ' + output);
});
