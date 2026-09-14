const assert = require('node:assert/strict');
const test = require('node:test');
const { copyText } = require('./app-runtime-clipboard.js');

test('copies with the Clipboard API when available', async () => {
  const writes = [];
  const result = await copyText('ABCD-EFGH-JKLM', {
    clipboard: { writeText: async (value) => writes.push(value) },
  });
  assert.deepEqual(writes, ['ABCD-EFGH-JKLM']);
  assert.equal(result.method, 'clipboard');
});

test('falls back to a selected temporary textarea when Clipboard API is denied', async () => {
  let selected = false;
  let removed = false;
  const input = {
    style: {},
    setAttribute() {},
    select() { selected = true; },
    setSelectionRange() {},
    remove() { removed = true; },
  };
  const result = await copyText('ABCD-EFGH-JKLM', {
    clipboard: { writeText: async () => { throw new Error('denied'); } },
    documentRef: {
      body: { appendChild() {} },
      createElement: () => input,
      execCommand: (command) => command === 'copy',
    },
  });
  assert.equal(result.method, 'selection');
  assert.equal(selected, true);
  assert.equal(removed, true);
});

test('returns an actionable error when neither copy mechanism works', async () => {
  await assert.rejects(
    copyText('ABCD-EFGH-JKLM', { clipboard: null, documentRef: null }),
    /手动选择配对码/,
  );
});
