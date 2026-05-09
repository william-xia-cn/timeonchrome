# V1-minimal Product Owner Decision Proposal - 2026-05-09

## Purpose

This is a Product&Project Mg proposal for the next Product Owner decisions after the releaseMg readonly readiness report.

This file does not approve release, tag, push, merge, CWS action, tests, Chrome profile changes, storage/cloud/D1 writes, or code changes.

## Current Status

| Area | Current state |
|---|---|
| V1-minimal readiness | `BLOCKED / NOT READY FOR PUBLIC RELEASE` |
| CWS | Reduced-permission package submitted / `待审核` |
| Public release | Not completed |
| releaseMg readiness report | `docs/releases/releasemg-readiness-v1-minimal-2026-05-09.md` |
| Worktree ownership audit | `docs/audits/WORKTREE_OWNERSHIP_AUDIT_2026-05-09.md` |
| CWS least-permission report | `docs/audits/CWS_LEAST_PERMISSION_IMPLEMENTATION_REPORT_2026-05-09.md` |
| CWS least-permission minimum verification | `docs/audits/CWS_LEAST_PERMISSION_MIN_VERIFY_2026-05-09.md` |

## Recommended Decision Package

Product&Project Mg recommends the following default decisions for the next execution step.

These are proposed decisions only. They require Product Owner approval before any agent acts on them.

| Decision area | Proposed Product Owner decision | Reason |
|---|---|---|
| `admin/admin.js`, `bind.js` | Keep as `Unknown / hold`; do not include as V1-minimal release evidence; do not package from these changes until separately assigned. | They affect auth/account-token storage behavior and are not yet tied to an approved implementation package. |
| `pages/index.html`, `tests/unit/pages-config-v12-fields.test.js` | Keep excluded from V1-minimal CWS release consideration; route later to a separate Pages/stats-v1 task if still desired. | Pages/admin-console changes are outside the CWS extension artifact and no Pages deploy is authorized in V1-minimal close-out. |
| CWS least-permission/timing cleanup package | Hold as Build&Test implementation package; ask Build&Test for a formal implementation report and minimal verification plan before commit/rebuild decisions. | Release-relevant, but dirty/uncommitted; should not be silently accepted as release evidence. |
| Production-profile readonly smoke | Defer live execution until either CWS review changes state or Product Owner is ready to authorize a releaseMg Chrome-profile readonly pass. | Public release is blocked by CWS `待审核`; avoid disturbing production profile prematurely. |
| Windows/macOS real Chrome smoke | Defer for now; require explicit completion or waiver before public release. | Needed for final confidence, but not urgent while CWS review is pending. |
| CWS status | Wait for CWS review result; do not perform more CWS actions now. | Current status is already submitted / `待审核`; no further submit action is allowed. |
| Public release | Hold. | releaseMg recommendation is blocked. |
| Git push/tag | Hold. | Requires separate PO approval after deciding commit set and release path. |

## Completed Next Agent Action

Build&Test produced the formal report for the CWS least-permission/timing cleanup package.

Report:

```text
docs/audits/CWS_LEAST_PERMISSION_IMPLEMENTATION_REPORT_2026-05-09.md
```

The report proposes a minimal verification plan, but no tests have been authorized or run.

## Completed Verification Action

Build&Test ran the Product Owner-authorized minimal verification plan and recorded results in:

```text
docs/audits/CWS_LEAST_PERMISSION_MIN_VERIFY_2026-05-09.md
```

Summary:

- `git diff --check`: PASS
- Permission reference scans: PASS, no matches
- Manifest forbidden permission scan: PASS, no matches
- Unit tests: `193/193 passed`
- Playwright E2E: `7/7 passed` after the known sandbox worker `spawn EPERM` blocker was handled by rerunning the same authorized commands outside the sandbox

No package rebuild, commit, push, tag, release, CWS action, Chrome profile access/mutation, storage/cloud/D1 action, or bug fix was authorized or performed.

## Product Owner Approval Needed

Please approve, reject, or modify these proposed decisions:

1. Keep `admin/admin.js` and `bind.js` as `Unknown / hold`.
2. Keep Pages stats-v1 changes excluded from V1-minimal.
3. Decide whether the verified Build&Test package should be committed, held, or used in a future rebuilt artifact.
4. Defer production-profile readonly smoke until CWS review changes state or until Product Owner explicitly authorizes releaseMg to run it.
5. Defer Windows/macOS real Chrome smoke for now, but require completion or waiver before public release.
6. Hold public release, git push, and git tag.

## Product Owner Decision

Status: `APPROVED`

Date: 2026-05-09

Approved decisions:

1. Keep `admin/admin.js` and `bind.js` as `Unknown / hold`.
2. Keep Pages stats-v1 changes excluded from V1-minimal.
3. Ask Build&Test to produce a formal report for the CWS least-permission/timing cleanup package.
4. Defer production-profile readonly smoke until CWS review changes state or until Product Owner explicitly authorizes releaseMg to run it.
5. Defer Windows/macOS real Chrome smoke for now, but require completion or waiver before public release.
6. Hold public release, git push, and git tag.

This approval does not authorize code edits, test execution, package rebuild, commit, push, tag, release, CWS action, Chrome profile mutation, storage/cloud/D1 writes, or treating deferred/known-risk items as pass.

## Product Owner Verification Authorization

Status: `AUTHORIZED`

Date: 2026-05-09

Authorized action:

- Build&Test may run only the minimal verification plan from `docs/audits/CWS_LEAST_PERMISSION_IMPLEMENTATION_REPORT_2026-05-09.md`.

Authorized commands:

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

This authorization does not authorize code edits, test edits, bug fixes, package rebuild, commit, push, tag, release, Chrome Web Store action, Chrome profile access/mutation, storage/cloud/D1 writes, or unrelated follow-up.

Verification result:

```text
MINIMUM VERIFICATION PASS / RELEASE READINESS NOT DECLARED
```

Evidence:

```text
docs/audits/CWS_LEAST_PERMISSION_MIN_VERIFY_2026-05-09.md
```

## Result

Status: `PO DECISION PROPOSAL APPROVED / MINIMAL VERIFICATION PASSED / RELEASE STILL BLOCKED`

No code was modified.

No tests were run.

No release, tag, push, merge, CWS action, Chrome profile mutation, storage write, cloud write, or D1 write was performed.
