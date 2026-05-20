// Phase 2B test-first: minimal dual-track semantics
// Run with: node tests/unit/dual-track-semantics.test.js

'use strict';

const fs = require('fs');
const path = require('path');

function loadProdModule(relPath, exportNames) {
  const abs = path.join(__dirname, '..', '..', relPath);
  let code = fs.readFileSync(abs, 'utf8');
  code = code.replace(/^\s*import .*?;\s*$/gm, '');
  code = code.replace(/export\s+async\s+function\s+/g, 'async function ');
  code = code.replace(/export\s+function\s+/g, 'function ');
  code = code.replace(/export\s+const\s+/g, 'const ');
  code = code.replace(/export\s*\{[^}]*\};?\s*$/gm, '');
  const fields = exportNames.map(n => `"${n}": (typeof ${n} !== 'undefined' ? ${n} : undefined)`);
  const factory = new Function(`${code}\nreturn { ${fields.join(', ')} };`);
  return factory();
}

const contextApi = loadProdModule('core/context.js', ['buildContext']);
const stateApi = loadProdModule('core/state.js', ['resolveState', 'AttentionState']);

const { buildContext } = contextApi;
const { resolveState, AttentionState } = stateApi;

let passed = 0;
let failed = 0;

function expect(desc, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) {
    passed++;
  } else {
    failed++;
    console.error(`  ✗ ${desc}`);
    console.error(`    expected: ${JSON.stringify(expected)}`);
    console.error(`    actual:   ${JSON.stringify(actual)}`);
  }
}

function section(name) {
  console.log(`\n[${name}]`);
}

async function runTests() {
  section('D1: media signal must not overwrite foreground attribution');
  {
    const current = {
      tabId: 1,
      windowId: 10,
      domain: 'a.com',
      isFocused: true,
      isIdle: false,
      isAudible: false,
      isPiP: false,
      lastActiveTabId: 1,
      lastFocusedWindowId: 10,
    };

    const mediaEvent = { tabId: 2, isAudible: true, mediaSourceTabId: 2 };
    const next = buildContext(current, mediaEvent);

    expect('domain should remain foreground domain', next.domain, 'a.com');
    expect('tabId should remain foreground tab', next.tabId, 1);
  }

  section('D2: media stop affects media state but not foreground attribution');
  {
    const current = {
      tabId: 1,
      windowId: 10,
      domain: 'a.com',
      isFocused: true,
      isIdle: false,
      isAudible: true,
      isPiP: false,
      lastActiveTabId: 1,
      lastFocusedWindowId: 10,
      mediaSourceTabId: 2,
    };

    const mediaStop = { isAudible: false, mediaSourceTabId: 2 };
    const next = buildContext(current, mediaStop);

    expect('isAudible should be false', next.isAudible, false);
    expect('domain should stay foreground domain', next.domain, 'a.com');
    expect('tabId should stay foreground tab', next.tabId, 1);
  }

  section('D3: focused foreground remains ACTIVE even when background media exists');
  {
    const ctx = {
      domain: 'a.com',
      tabId: 1,
      isFocused: true,
      isIdle: false,
      isAudible: true,
      mediaSourceTabId: 2,
      isPiP: false,
    };
    expect('state should be ACTIVE', resolveState(ctx), AttentionState.ACTIVE);
  }

  section('D4: legacy unfocused media facts remain background media state');
  {
    const ctx = {
      domain: 'a.com',
      tabId: 1,
      isFocused: false,
      isIdle: false,
      isAudible: true,
      mediaSourceTabId: 2,
      isPiP: false,
    };
    expect('state should be BACKGROUND_ACTIVE', resolveState(ctx), AttentionState.BACKGROUND_ACTIVE);
  }

  section('D5: audible without mediaSourceTabId falls back to PASSIVE (conservative)');
  {
    const ctx = {
      domain: 'a.com',
      tabId: 1,
      isFocused: false,
      isIdle: false,
      isAudible: true,
      mediaSourceTabId: null,
      isPiP: false,
    };
    expect('state should be PASSIVE', resolveState(ctx), AttentionState.PASSIVE);
  }

  section('D6: legacy PiP fact takes PiP state precedence');
  {
    const ctx = {
      domain: 'video.example',
      tabId: 3,
      isFocused: true,
      isIdle: false,
      isAudible: true,
      mediaSourceTabId: 3,
      mediaSourceDomain: 'video.example',
      isPiP: true,
    };
    expect('state should be PIP_ACTIVE', resolveState(ctx), AttentionState.PIP_ACTIVE);
  }

  section('D7: media signal carries source domain without overwriting foreground domain');
  {
    const current = {
      tabId: 1,
      windowId: 10,
      domain: 'foreground.example',
      isFocused: true,
      isIdle: false,
      isAudible: false,
      isPiP: false,
      lastActiveTabId: 1,
      lastFocusedWindowId: 10,
    };

    const mediaEvent = {
      tabId: 2,
      isAudible: true,
      mediaSourceTabId: 2,
      mediaSourceDomain: 'video.example',
    };
    const next = buildContext(current, mediaEvent);

    expect('foreground domain should remain unchanged', next.domain, 'foreground.example');
    expect('mediaSourceDomain should be preserved separately', next.mediaSourceDomain, 'video.example');
  }

  section('D8: legacy idle media facts remain media states');
  {
    const audibleIdleCtx = {
      domain: 'video.example',
      tabId: 5,
      isFocused: false,
      isIdle: true,
      isAudible: true,
      mediaSourceTabId: 5,
      mediaSourceDomain: 'video.example',
      isPiP: false,
    };
    expect('idle + audible should be BACKGROUND_ACTIVE legacy media state', resolveState(audibleIdleCtx), AttentionState.BACKGROUND_ACTIVE);

    const pipIdleCtx = {
      domain: 'video.example',
      tabId: 5,
      isFocused: false,
      isIdle: true,
      isAudible: true,
      mediaSourceTabId: 5,
      mediaSourceDomain: 'video.example',
      isPiP: true,
    };
    expect('idle + PiP should be PIP_ACTIVE legacy media state', resolveState(pipIdleCtx), AttentionState.PIP_ACTIVE);
  }

  section('D9: locked blocks ordinary foreground and media facts do not compensate');
  {
    const foregroundLockedCtx = {
      domain: 'plain.example',
      tabId: 6,
      isFocused: true,
      idleState: 'locked',
      isIdle: true,
      isAudible: false,
      mediaSourceTabId: null,
      isPiP: false,
    };
    expect('locked foreground should be IDLE', resolveState(foregroundLockedCtx), AttentionState.IDLE);

    const mediaLockedCtx = {
      domain: 'video.example',
      tabId: 7,
      isFocused: false,
      idleState: 'locked',
      isIdle: true,
      isAudible: true,
      mediaSourceTabId: 7,
      mediaSourceDomain: 'video.example',
      isPiP: false,
    };
    expect('locked + audible remains BACKGROUND_ACTIVE legacy media state', resolveState(mediaLockedCtx), AttentionState.BACKGROUND_ACTIVE);
  }

  section('D10: legacy foregroundMediaActive flag still compensates foreground webpage state');
  {
    const unfocusedForegroundMediaCtx = {
      domain: 'video.example',
      tabId: 8,
      isFocused: false,
      idleState: 'active',
      isIdle: false,
      foregroundMediaActive: true,
      isAudible: true,
      mediaSourceTabId: 8,
      mediaSourceDomain: 'video.example',
      isPiP: false,
    };
    expect('unfocused foreground media still counts ACTIVE by legacy compensation', resolveState(unfocusedForegroundMediaCtx), AttentionState.ACTIVE);

    const idleForegroundMediaCtx = {
      ...unfocusedForegroundMediaCtx,
      idleState: 'idle',
      isIdle: true,
    };
    expect('idle foreground media still counts ACTIVE by legacy compensation', resolveState(idleForegroundMediaCtx), AttentionState.ACTIVE);

    const lockedForegroundMediaCtx = {
      ...unfocusedForegroundMediaCtx,
      idleState: 'locked',
      isIdle: true,
    };
    expect('locked foreground media falls back to legacy background media state', resolveState(lockedForegroundMediaCtx), AttentionState.BACKGROUND_ACTIVE);
  }

  const total = passed + failed;
  console.log(`\n[Dual Track Semantics] ${passed}/${total} passed${failed ? ` — ${failed} FAILED` : ''}`);
  if (failed > 0) process.exit(1);
}

runTests().catch(err => {
  console.error(err);
  process.exit(1);
});
