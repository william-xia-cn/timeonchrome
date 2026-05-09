# Worktree Ownership Audit - 2026-05-09

## Scope

This is a Build&Test ownership audit for dirty product/test working-tree changes.

This audit did not modify product code, test code, Chrome profile data, chrome.storage data, cloud data, Worker code, D1 data, package artifacts, release tags, or commits.

This audit does not declare V1-minimal release readiness.

## Inspected Files

Authority and context files read:

- `AGENTS.md`
- `PROJECT_MASTER.md`
- `TASK_BOARD.md`
- `DECISIONS.md`
- `docs/agents/BuildTest.md`
- `docs/audits/WORKTREE_STATUS_INVENTORY_2026-05-09.md`
- `docs/release/V1_MINIMAL_CLOSEOUT_PLAN_2026-05-09.md`
- `docs/release/V1_MINIMAL_RELEASE_GATE_MATRIX_2026-05-09.md`
- `docs/handoffs/outbox/HANDOFF-v1-minimal-worktree-ownership-to-build-test.md`

Working-tree commands inspected:

- `git status --short`
- `git diff --stat -- admin/admin.js bind.js pages/index.html product/interceptor.js tests/e2e/mode-switch-pip-close.test.js tests/e2e/mode-switch-prompt-lifecycle.test.js tests/unit/mode-routing-matrix-v0.test.js tests/unit/pages-config-v12-fields.test.js`
- `git diff --numstat -- admin/admin.js bind.js pages/index.html product/interceptor.js tests/e2e/mode-switch-pip-close.test.js tests/e2e/mode-switch-prompt-lifecycle.test.js tests/unit/mode-routing-matrix-v0.test.js tests/unit/pages-config-v12-fields.test.js`
- `git diff -- <target product/test paths>`

Dirty product/test files inspected:

- `admin/admin.js`
- `bind.js`
- `pages/index.html`
- `product/interceptor.js`
- `tests/e2e/mode-switch-pip-close.test.js`
- `tests/e2e/mode-switch-prompt-lifecycle.test.js`
- `tests/unit/mode-routing-matrix-v0.test.js`
- `tests/unit/pages-config-v12-fields.test.js`

## Classification Table

| Path | Diff summary | Classification | Release relevance | Approval / report need |
|---|---|---|---|---|
| `admin/admin.js` | Persists `CLOUD_KEYS.ACCOUNT_TOKEN` after auto-login. | `Unknown / hold` | Affects extension/admin source if a future package is rebuilt from the dirty tree. It may affect bind/auth/storage behavior, so it must not be treated as V1-minimal evidence while unowned. | Needs Product Owner ownership decision and an approved Build&Test spec/report before inclusion in any release package or readiness claim. |
| `bind.js` | Adds `account_token: accountToken` to `chrome.storage.local.set` during bind. | `Unknown / hold` | Affects extension bind/storage source if a future package is rebuilt from the dirty tree. It is auth/storage relevant and not covered by the current ownership handoff as an approved Build&Test implementation. | Needs Product Owner ownership decision and an approved Build&Test spec/report before inclusion in any release package or readiness claim. |
| `pages/index.html` | Switches stats reads through `fetchProfileStats`, prefers `/stats/v1`, normalizes duration fields, and changes `fmtDate` to local date formatting. | `Exclude from V1-minimal release consideration` | Cloudflare Pages/admin-console source is outside the CWS extension artifact and no Pages deploy is authorized for V1-minimal close-out. Do not use this dirty Pages change as V1-minimal artifact or readiness evidence. | Needs separate Product Owner/Pages or stats-v1 ownership if it is to be deployed or accepted later. |
| `product/interceptor.js` | Removes optional `chrome.scripting?.executeScript` PiP fallback and keeps `chrome.tabs.sendMessage(tabId, { type: 'EXIT_PIP' })`. | `Build&Test implementation package` | Release-relevant for CWS least-permission source/manifest parity. It affects future extension source artifacts if rebuilt, but does not mutate the already-submitted CWS package. | PO chat authorization/acceptance exists for this follow-up; still needs formal implementation package/report or commit decision before release close-out uses it as source evidence. |
| `tests/e2e/mode-switch-pip-close.test.js` | Removes test-side `chrome.scripting.executeScript`; uses extension-page runtime messaging and real page-level PiP state; updates auto gates to 30/45 timing. | `Build&Test implementation package` | Test-only evidence hygiene for reduced-permission PiP close coverage. Does not affect extension artifact, but can support release evidence after formal acceptance. | PO chat authorization/acceptance exists; record in Build&Test evidence package before using in release close-out. |
| `tests/e2e/mode-switch-prompt-lifecycle.test.js` | Removes test-side `chrome.scripting.executeScript`; uses extension-page runtime messaging, tab targeting, and content-script message retry. | `Build&Test implementation package` | Test-only evidence hygiene for reduced-permission prompt lifecycle coverage. Does not affect extension artifact, but can support release evidence after formal acceptance. | PO chat authorization/acceptance exists; record in Build&Test evidence package before using in release close-out. |
| `tests/unit/mode-routing-matrix-v0.test.js` | Replaces stale 60/90 second expectations with canonical 30/45/45 mode-transition timing. | `Build&Test implementation package` | Test-only evidence hygiene aligned with `DECISIONS.md` D-020 and current mode-transition docs. Does not affect extension artifact. | PO chat authorization/acceptance exists; record in Build&Test evidence package before using in release close-out. |
| `tests/unit/pages-config-v12-fields.test.js` | Adds expectations for Pages stats/v1 read path, duration normalization, and local-date formatting. | `Exclude from V1-minimal release consideration` | Test coverage for the dirty Pages/admin-console change, not for the CWS extension artifact. Do not use as V1-minimal readiness evidence unless the Pages/stats-v1 change is separately accepted. | Needs separate Product Owner/Pages or stats-v1 ownership if considered later. |

## Release Relevance Summary

The dirty working tree contains three distinct groups:

1. `Build&Test implementation package`: `product/interceptor.js`, `tests/e2e/mode-switch-pip-close.test.js`, `tests/e2e/mode-switch-prompt-lifecycle.test.js`, and `tests/unit/mode-routing-matrix-v0.test.js`.
   - These correspond to recent PO-authorized Build&Test work for reduced-permission CWS alignment and stale 30/45/45 timing cleanup.
   - They are release-relevant as source/evidence alignment, but still dirty and uncommitted.
   - They should be treated as a candidate implementation package, not as automatically accepted release evidence.

2. `Unknown / hold`: `admin/admin.js` and `bind.js`.
   - These changes touch auth/account-token storage behavior.
   - They are extension-source relevant if any future artifact is rebuilt from the dirty tree.
   - They must not be included in a release package or release readiness claim until Product Owner assigns ownership and Build&Test has an approved implementation report.

3. `Exclude from V1-minimal release consideration`: `pages/index.html` and `tests/unit/pages-config-v12-fields.test.js`.
   - These changes appear tied to Pages/admin-console stats-v1 behavior.
   - They are not part of the CWS extension artifact and no Pages deploy is authorized by the current V1-minimal close-out scope.
   - They should be held for a separate Pages/stats-v1 ownership decision.

## Artifact / Readiness / Evidence Impact

- Current submitted CWS package: This audit did not inspect or rebuild the submitted package. Dirty source changes do not mutate the already-submitted CWS artifact.
- Future extension artifact: `admin/admin.js`, `bind.js`, and `product/interceptor.js` would affect a future extension package if rebuilt from the dirty tree.
- Future release evidence: the three Build&Test test changes may support evidence after formal acceptance; the Pages test change should not support V1-minimal extension readiness.
- Readiness claim: a clean V1-minimal release/readiness claim remains blocked unless the dirty source/test state is explicitly scoped, accepted, excluded, or held by Product Owner/releaseMg.

## Tests Run

None.

This audit was explicitly read-only except for creating this report, and the handoff did not authorize test execution.

## Known Risks

- `admin/admin.js` and `bind.js` are unowned extension-source changes that affect account token persistence and could change auth/storage behavior if packaged.
- The Build&Test-owned reduced-permission changes are dirty and need a formal packaging/commit/evidence decision before release close-out relies on them.
- Pages stats-v1 changes are dirty and may be useful later, but they are outside the V1-minimal CWS extension release consideration in this audit.
- `git status --short` shows additional dirty docs/untracked docs outside this product/test ownership audit.

## Out-of-Scope Confirmation

Not performed:

- Product code modification.
- Test code modification.
- Bug fix or refactor.
- Test execution.
- Package rebuild.
- Release, tag, push, merge, or commit.
- Chrome Web Store action.
- Chrome profile, chrome.storage, cloud, Worker, or D1 mutation.
- V1-minimal release-ready judgment.

## Product Owner Decisions Required

1. Decide whether `admin/admin.js` and `bind.js` are PO-supplied/external, should become an approved Build&Test implementation package, or must remain `Unknown / hold`.
2. Decide whether the Pages stats-v1 changes in `pages/index.html` and `tests/unit/pages-config-v12-fields.test.js` are excluded from V1-minimal permanently or routed to a separate Pages/stats-v1 task.
3. Decide whether the Build&Test implementation package for CWS least-permission cleanup and 30/45/45 test cleanup should be committed, held, or rebuilt into any future source artifact.
4. Decide whether Build&Test should run verification tests after this ownership classification.

## Recommendation

releaseMg may proceed only with a bounded readonly readiness review before ownership fully closes, provided it explicitly marks dirty product/test ownership as not closed and does not treat unowned or excluded changes as passing release evidence.

releaseMg should not make a final public-release readiness recommendation from this dirty tree until Product Owner resolves the `Unknown / hold` extension-source changes or explicitly scopes them out.

## Result

Status: `WORKTREE OWNERSHIP AUDIT RECORDED / RELEASE READINESS NOT DECLARED`

Changed files in this audit:

- `docs/audits/WORKTREE_OWNERSHIP_AUDIT_2026-05-09.md`
