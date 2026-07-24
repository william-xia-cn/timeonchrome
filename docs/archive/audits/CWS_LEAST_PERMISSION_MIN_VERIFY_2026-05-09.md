> **ARCHIVED / Historical evidence only.** This file is preserved for audit/history and must not be used as the current product source of truth. Use `AGENTS.md`, `PROJECT_MASTER.md`, `TASK_BOARD.md`, `DECISIONS.md`, and the current authority documents instead.

# CWS Least-Permission Minimum Verification - 2026-05-09

## Scope

This is the Build&Test minimum verification report for the CWS least-permission / mode timing cleanup package.

This task did not modify product code, test code, package artifacts, Chrome Web Store state, Chrome profile data, chrome.storage data, cloud data, Worker code, D1 data, release tags, or commits.

This report does not declare V1-minimal release readiness.

## Package Under Verification

Dirty Build&Test implementation package:

- `product/interceptor.js`
- `tests/e2e/mode-switch-pip-close.test.js`
- `tests/e2e/mode-switch-prompt-lifecycle.test.js`
- `tests/unit/mode-routing-matrix-v0.test.js`

Report file added by this verification task:

- `docs/audits/CWS_LEAST_PERMISSION_MIN_VERIFY_2026-05-09.md`

Out-of-package dirty files remain outside this verification:

- `admin/admin.js`: `Unknown / hold`
- `bind.js`: `Unknown / hold`
- `pages/index.html`: excluded from V1-minimal CWS release consideration
- `tests/unit/pages-config-v12-fields.test.js`: excluded from V1-minimal CWS release consideration

## Commands Run

All commands were run from:

```text
D:\Opencode\ChromeExtension\timeonchrome
```

| Command | Result | Notes |
|---|---|---|
| `git diff --check` | PASS | Exit code 0. Only LF-to-CRLF working-copy warnings were emitted; no whitespace errors were reported. |
| `rg -n "chrome\.scripting|scripting\." background.js content.js message-router.js product infra runtime popup admin manifest.json` | PASS | Exit code 1 with no output, interpreted as no matches. |
| `rg -n '"management"|"scripting"|declarativeNetRequestFeedback' manifest.json` | PASS | Exit code 1 with no output, interpreted as no forbidden manifest permission matches. |
| `node tests/unit/mode-routing-matrix-v0.test.js` | PASS | `74/74 passed`. |
| `node tests/unit/interceptor-mode-transition-v0.test.js` | PASS | `89/89 passed`. |
| `node tests/unit/content-rest-composite-pending-banner.test.js` | PASS | `23/23 passed`. |
| `npx playwright test tests/e2e/mode-switch-prompt-lifecycle.test.js --reporter=line` | PASS after sandbox blocker | First sandbox run failed at worker startup with `spawn EPERM`; same authorized command rerun outside sandbox passed `3/3`. |
| `npx playwright test tests/e2e/mode-switch-pip-close.test.js --reporter=line` | PASS | Run outside sandbox due known Playwright worker startup restriction; `4/4 passed`. |

## Tests Run

- `node tests/unit/mode-routing-matrix-v0.test.js`: `74/74 passed`
- `node tests/unit/interceptor-mode-transition-v0.test.js`: `89/89 passed`
- `node tests/unit/content-rest-composite-pending-banner.test.js`: `23/23 passed`
- `npx playwright test tests/e2e/mode-switch-prompt-lifecycle.test.js --reporter=line`: `3/3 passed` after sandbox worker-start blocker
- `npx playwright test tests/e2e/mode-switch-pip-close.test.js --reporter=line`: `4/4 passed`

Aggregate verified tests:

```text
193/193 unit assertions passed
7/7 Playwright E2E tests passed
```

## Permission Alignment Result

Observed:

- No `chrome.scripting` or `scripting.` references were found in production source paths checked by the required command.
- `manifest.json` contains no `"management"`, `"scripting"`, or `declarativeNetRequestFeedback` matches under the required command.
- The cleanup package remains aligned with the reduced-permission CWS posture at the checked source level.

This verification did not rebuild or inspect a package artifact.

## Mode Timing Result

Observed:

- `mode-routing-matrix-v0.test.js`: `74/74 passed`
- `interceptor-mode-transition-v0.test.js`: `89/89 passed`
- `content-rest-composite-pending-banner.test.js`: `23/23 passed`
- `mode-switch-pip-close.test.js`: `4/4 passed`
- `mode-switch-prompt-lifecycle.test.js`: `3/3 passed`

The verified tests align with the canonical D-020 timing:

- Rest -> Composite: 30 seconds
- Rest -> Study: 45 seconds
- Composite -> Study: 45 seconds

## Failures / Blockers

Sandbox-only blocker:

- The first `mode-switch-prompt-lifecycle` Playwright run failed before executing test assertions because the worker process could not start:

```text
Error: spawn EPERM
```

Resolution for this verification:

- The same authorized Playwright command was rerun outside the sandbox and passed `3/3`.
- `mode-switch-pip-close` was run outside the sandbox for the same Playwright worker-startup reason and passed `4/4`.

No product/test assertion failure remained after the authorized reruns.

## Known Risks

- The implementation package remains dirty and uncommitted.
- The already-submitted CWS package was not rebuilt or mutated by this verification.
- Future artifact/source parity still requires a separately authorized rebuild or package inspection if Product Owner wants to use this dirty source state for a new artifact.
- `admin/admin.js` and `bind.js` remain `Unknown / hold`; they must not be silently included in any release package or release evidence.
- Pages stats-v1 changes remain excluded from V1-minimal CWS release consideration.
- Playwright E2E verification in this environment requires running outside the sandbox to avoid worker `spawn EPERM`.

## Product Owner Decisions Required

1. Decide whether this Build&Test package should be committed, held, or further revised.
2. Decide whether a future extension artifact should be rebuilt and verified from this package.
3. Decide whether releaseMg may treat this package as accepted implementation evidence.
4. Keep or change the existing decisions that `admin/admin.js` and `bind.js` remain `Unknown / hold`.
5. Keep or change the existing decision that Pages stats-v1 changes remain excluded from V1-minimal CWS release consideration.
6. Separately decide public release, git push, and git tag; this verification does not approve them.

## Out-of-Scope Confirmation

Not performed:

- Product code modification.
- Test code modification.
- Bug fix or refactor.
- Any command outside the allowed command set, except creating this required report file.
- Package rebuild.
- Commit, push, tag, merge, or release.
- Chrome Web Store dashboard access, upload, or submit.
- Chrome profile access or mutation.
- chrome.storage, cloud, Worker, or D1 access/mutation.
- Modification of `admin/admin.js`, `bind.js`, `pages/index.html`, or `tests/unit/pages-config-v12-fields.test.js`.
- V1-minimal release-ready judgment.

## Result

Status: `MINIMUM VERIFICATION PASS / RELEASE READINESS NOT DECLARED`
