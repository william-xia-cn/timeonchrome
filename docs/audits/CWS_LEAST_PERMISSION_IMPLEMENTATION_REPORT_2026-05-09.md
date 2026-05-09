# CWS Least-Permission Implementation Report - 2026-05-09

## Scope

This is the formal Build&Test implementation report for the dirty CWS least-permission / mode timing cleanup package.

This reporting task did not modify product code, test code, Chrome profile data, chrome.storage data, cloud data, Worker code, D1 data, package artifacts, release tags, or commits.

This report does not declare V1-minimal release readiness.

## Source Context

Read first:

- `AGENTS.md`
- `PROJECT_MASTER.md`
- `TASK_BOARD.md`
- `DECISIONS.md`
- `docs/agents/BuildTest.md`
- `docs/audits/WORKTREE_STATUS_INVENTORY_2026-05-09.md`
- `docs/audits/WORKTREE_OWNERSHIP_AUDIT_2026-05-09.md`
- `docs/release/V1_MINIMAL_PO_DECISION_PROPOSAL_2026-05-09.md`
- `docs/releases/releasemg-readiness-v1-minimal-2026-05-09.md`
- `docs/handoffs/outbox/HANDOFF-cws-least-permission-report-to-build-test.md`

Readonly commands inspected:

- `git status --short`
- `git diff --stat -- product/interceptor.js tests/e2e/mode-switch-pip-close.test.js tests/e2e/mode-switch-prompt-lifecycle.test.js tests/unit/mode-routing-matrix-v0.test.js`
- `git diff -- product/interceptor.js`
- `git diff -- tests/e2e/mode-switch-pip-close.test.js`
- `git diff -- tests/e2e/mode-switch-prompt-lifecycle.test.js`
- `git diff -- tests/unit/mode-routing-matrix-v0.test.js`

## Changed Files

Implementation package files:

- `product/interceptor.js`
- `tests/e2e/mode-switch-pip-close.test.js`
- `tests/e2e/mode-switch-prompt-lifecycle.test.js`
- `tests/unit/mode-routing-matrix-v0.test.js`

Report file added by this reporting task:

- `docs/audits/CWS_LEAST_PERMISSION_IMPLEMENTATION_REPORT_2026-05-09.md`

Out-of-package dirty files remain outside this report:

- `admin/admin.js`: `Unknown / hold`
- `bind.js`: `Unknown / hold`
- `pages/index.html`: excluded from V1-minimal CWS release consideration
- `tests/unit/pages-config-v12-fields.test.js`: excluded from V1-minimal CWS release consideration

## Behavior Changes

### Production Behavior

`product/interceptor.js` removes the optional `chrome.scripting?.executeScript` PiP close fallback from `closeActiveTabPictureInPicture(tabId)`.

The production PiP cleanup path now relies on the existing content-script message path:

```js
chrome.tabs.sendMessage(tabId, { type: 'EXIT_PIP' })
```

The mode transition behavior remains:

- leaving Rest to Composite should close active PiP;
- leaving Rest to Study should close active PiP;
- entering Study should close active PiP;
- PiP cleanup failure should not abort the mode transition.

The behavior change is permission-surface cleanup, not a product-scope expansion.

### Test Harness Behavior

`tests/e2e/mode-switch-pip-close.test.js`:

- removes test-side `chrome.scripting.executeScript`;
- sends runtime messages from an extension page context instead of injecting scripts into content pages;
- creates and observes real page-level PiP state through Playwright `page.evaluate` / locators;
- continues covering Rest -> Composite and Rest -> Study, both manual and auto paths;
- updates auto-transition timing expectations to 30 seconds for Rest -> Composite and 45 seconds for Rest -> Study.

`tests/e2e/mode-switch-prompt-lifecycle.test.js`:

- removes test-side `chrome.scripting.executeScript`;
- sends mode-switch runtime messages from an extension page context with `noticeTabId`;
- targets the correct tab without requiring the removed `scripting` permission;
- keeps the late-ready / resend path by sending the existing content-script message path with retry;
- preserves prompt lifecycle assertions: prompt appears, old pending notice is cleared, late-ready prompt resend is guarded, and stale prompt does not pollute a different domain.

`tests/unit/mode-routing-matrix-v0.test.js`:

- replaces stale 90-second Composite -> Study and Rest -> Study expectations with 45 seconds;
- replaces stale 60-second Rest -> Composite expectations with 30 seconds;
- keeps the existing mode routing assertions and pending/success notice checks.

## Release Relevance

This package is release-relevant but not release-ready evidence by itself.

It matters for V1-minimal because:

- the current CWS resubmission package uses a reduced permission set and does not include `scripting`;
- production source should not keep a `chrome.scripting` dependency when the manifest no longer declares `scripting`;
- E2E harnesses should not require `chrome.scripting` to validate a reduced-permission extension;
- mode timing tests should match the canonical D-020 timing contract: `30/45/45`.

This package does not mutate the already-submitted CWS package, does not rebuild any package, and does not complete V1-minimal release readiness.

## Permission-Alignment Summary

Expected release permission posture:

- keep `tabs`;
- keep `storage`;
- keep `alarms`;
- keep `declarativeNetRequest`;
- keep `webNavigation`;
- keep `idle`;
- keep `notifications`;
- keep host permission `<all_urls>`;
- do not restore `management`;
- do not restore `scripting`;
- do not restore `declarativeNetRequestFeedback`.

This package aligns production and test source with the reduced-permission posture by removing:

- production optional `chrome.scripting?.executeScript` PiP fallback;
- E2E test-side `chrome.scripting.executeScript` usage.

After this package, PiP close verification is intended to exercise the production content-script message path instead of a privileged script-injection path.

## Mode Timing Summary

Canonical timing per `DECISIONS.md` D-020:

- Rest -> Composite: 30 seconds
- Rest -> Study: 45 seconds
- Composite -> Study: 45 seconds

This package updates stale test expectations to match that timing:

- `tests/unit/mode-routing-matrix-v0.test.js`
  - Rest -> Composite: 60 seconds -> 30 seconds
  - Rest -> Study: 90 seconds -> 45 seconds
  - Composite -> Study: 90 seconds -> 45 seconds
- `tests/e2e/mode-switch-pip-close.test.js`
  - Rest -> Composite auto harness: 60 seconds -> 30 seconds
  - Rest -> Study auto harness: 90 seconds -> 45 seconds

No product timing implementation is changed by this package.

## Minimal Verification Plan

The following commands are proposed for later Product Owner authorization. They were not run in this reporting task.

```powershell
git diff --check
```

```powershell
rg -n "chrome\.scripting|scripting\." background.js content.js message-router.js product infra runtime popup admin manifest.json
```

```powershell
rg -n '"management"|"scripting"|declarativeNetRequestFeedback' manifest.json
```

```powershell
node tests/unit/mode-routing-matrix-v0.test.js
```

```powershell
node tests/unit/interceptor-mode-transition-v0.test.js
```

```powershell
node tests/unit/content-rest-composite-pending-banner.test.js
```

```powershell
npx playwright test tests/e2e/mode-switch-prompt-lifecycle.test.js --reporter=line
```

```powershell
npx playwright test tests/e2e/mode-switch-pip-close.test.js --reporter=line
```

Expected verification intent:

- no production `chrome.scripting` dependency remains;
- manifest remains reduced-permission;
- mode routing timing stays `30/45/45`;
- prompt lifecycle E2E still covers prompt display, late-ready resend, and stale-domain guard;
- PiP close E2E still covers Rest -> Composite and Rest -> Study, manual and auto paths;
- no skipped assertions are introduced.

## Tests Run

None.

Test execution was explicitly not authorized for this reporting task.

## Known Risks

- The package is dirty and uncommitted; releaseMg must not treat it as accepted release evidence until Product Owner decides whether to test, commit, hold, or rebuild from it.
- `product/interceptor.js` now depends solely on the content-script `EXIT_PIP` path for PiP close. If a target tab has no content script or cannot receive messages, cleanup may be best-effort, and mode transition still proceeds.
- The submitted CWS artifact is not changed by this source-tree report. Any future artifact parity claim requires a separately authorized package rebuild/verification.
- `admin/admin.js` and `bind.js` remain `Unknown / hold`; they affect extension-source auth/storage behavior if a future package is rebuilt from the full dirty tree.
- Pages stats-v1 changes remain excluded from V1-minimal CWS release consideration and are not validated by this package.
- Playwright E2E commands may require an environment where browser worker startup is permitted; previous sessions observed local `spawn EPERM` in sandboxed runs.

## Rollback Notes

Rollback should be package-scoped and Product Owner-approved.

If rolling back the CWS least-permission production change:

- reverting `product/interceptor.js` alone would reintroduce a production `chrome.scripting` reference;
- reintroducing that branch would conflict with a manifest that omits `scripting`;
- any rollback should either keep the reduced-permission source posture or explicitly reopen the CWS permission-surface decision.

If rolling back only test harness changes:

- tests may again depend on `chrome.scripting.executeScript`;
- reduced-permission E2E coverage would no longer reflect the submitted CWS permission model.

If rolling back timing-test changes:

- unit/E2E expectations may again diverge from D-020 `30/45/45`;
- release evidence would need to mark the divergence as stale or blocked.

Do not use rollback to include `admin/admin.js`, `bind.js`, Pages stats-v1, Chrome profile, cloud, D1, CWS, package, git push, or release actions.

## Scope Conformance Audit

| Requirement | Status | Notes |
|---|---|---|
| Remove production `chrome.scripting` PiP fallback | Matched | `product/interceptor.js` now uses the content-script message path. |
| Do not restore `scripting` permission | Matched by intent | This report did not modify `manifest.json`; later verification should confirm no permission expansion. |
| Remove test-side `chrome.scripting.executeScript` dependency from targeted E2E tests | Matched | E2E harnesses use extension-page runtime messaging and page-level inspection. |
| Preserve prompt lifecycle assertions | Matched | Diff keeps prompt appearance, TTL, late-ready resend, and domain-pollution checks. |
| Preserve PiP close four-path coverage | Matched | Diff keeps Rest -> Composite / Rest -> Study manual and auto cases. |
| Align test timing expectations with D-020 | Matched | `30/45/45` expectations are reflected in unit and E2E harness changes. |
| Do not change product mode timing implementation | Matched | No product timing implementation diff is included in this package. |
| Do not touch Cloud/D1/CWS/profile/package/git actions | Matched in this reporting task | No such action was performed. |
| Do not include unowned admin/bind or excluded Pages stats-v1 changes | Matched | They remain outside this implementation package. |

## Product Owner Decisions Required

1. Authorize or defer the minimal verification plan.
2. Decide whether this Build&Test package should be committed, held, or further revised.
3. Decide whether a future extension artifact should be rebuilt from this package after verification.
4. Decide whether releaseMg may treat this package as accepted implementation evidence only after tests are run and recorded.
5. Keep or change the existing decisions that `admin/admin.js` / `bind.js` remain `Unknown / hold` and Pages stats-v1 changes remain excluded from V1-minimal CWS release consideration.

## Out-of-Scope Confirmation

Not performed:

- Product code modification in this reporting task.
- Test code modification in this reporting task.
- Bug fix or refactor.
- Test execution.
- Package rebuild.
- Commit, push, tag, merge, or release.
- Chrome Web Store dashboard access, upload, or submit.
- Chrome profile, chrome.storage, cloud, Worker, or D1 access/mutation.
- Modification of `admin/admin.js`, `bind.js`, `pages/index.html`, or `tests/unit/pages-config-v12-fields.test.js`.
- V1-minimal release-ready judgment.

## Result

Status: `IMPLEMENTATION REPORT RECORDED / TESTS NOT RUN / RELEASE READINESS NOT DECLARED`
