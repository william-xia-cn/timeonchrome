// @ts-check
const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests/e2e',
  timeout: 60000,
  retries: 0,
  workers: 1,          // extension tests must run serially (shared persistent context)
  reporter: [['list']],
  use: {
    headless: false,   // Chrome extensions require headful mode
    viewport: { width: 1280, height: 720 },
    actionTimeout: 15000,
  },
});
