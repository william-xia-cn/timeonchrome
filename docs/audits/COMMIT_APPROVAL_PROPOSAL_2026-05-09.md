# Commit Approval Proposal - 2026-05-09

## Purpose

This is a Product&Project Mg proposal for Product Owner approval of local commit execution and remote consistency checking.

This file does not approve or perform staging, commit, fetch, push, tag, merge, reset, checkout, stash, package rebuild, CWS action, Chrome profile mutation, storage/cloud/D1 writes, or release.

## Current State

| Area | State |
|---|---|
| Commit set plan | `docs/audits/COMMIT_SET_PLAN_2026-05-09.md` |
| Local branch | `master` |
| HEAD | `7072163 fix: remove scripting dependency from pip cleanup` |
| Remote truth | Not verified |
| Release readiness | `BLOCKED / NOT READY FOR PUBLIC RELEASE` |
| CWS | Submitted / `待审核` |
| Push/tag | Blocked |

## Completed Local Commits

The earlier safer two-commit plan has already been executed:

| Commit | Message | Status |
|---|---|---|
| `9174900` | `docs: add agent workflow and v1-minimal closeout records` | Completed |
| `7072163` | `fix: remove scripting dependency from pip cleanup` | Completed |
| `f498d13` | `fix: persist account token after admin login and bind` | Completed |

No push/tag/release approval is implied by these local commits.

## Current Recommended Approval Package

Product&Project Mg recommends:

| Item | Recommendation | Reason |
|---|---|---|
| Pages stats-v1 files | Keep excluded from V1-minimal CWS; decide commit/hold/browser check | Separate Pages/stats-v1 package, classification `include later`; minimum verification passed. |
| Remote consistency check | Completed | Local `master` is ahead of `origin/master` by 7 commits. |
| Push/tag | Keep blocked | Requires separate Product Owner approval after remote truth is known. |

## Proposed Commit C

Status: completed as `f498d13`.

Message:

```text
fix: persist account token after admin login and bind
```

Files:

- `DECISIONS.md`
- `PROJECT_MASTER.md`
- `TASK_BOARD.md`
- `admin/admin.js`
- `bind.js`
- `tests/unit/admin-bind-account-token.test.js`
- `docs/audits/ADMIN_BIND_OWNERSHIP_RESOLUTION_2026-05-09.md`
- `docs/audits/ADMIN_BIND_ACCOUNT_TOKEN_IMPLEMENTATION_REPORT_2026-05-09.md`
- `docs/audits/ADMIN_BIND_ACCOUNT_TOKEN_MIN_VERIFY_2026-05-09.md`
- `docs/audits/ADMIN_BIND_ACCOUNT_TOKEN_TEST_PACKAGE_REPORT_2026-05-09.md`
- `docs/handoffs/outbox/HANDOFF-admin-bind-account-token-review-to-build-test.md`
- `docs/handoffs/outbox/HANDOFF-admin-bind-account-token-test-package-to-build-test.md`

Evidence:

- `DECISIONS.md:D-038`
- `node tests/unit/admin-bind-account-token.test.js` = `5/5 PASS`

This commit does not authorize:

- package rebuild;
- CWS upload/submit;
- release;
- push/tag;
- Pages stats-v1 files.

## Proposed Commit 1

Status: superseded by completed commit `9174900`.

Message:

```text
docs: add codex three-role workflow
```

Files:

- `AGENTS.md`
- `PROJECT_WORKFLOW.md`
- `PROJECT_MASTER.md`
- `TASK_BOARD.md`
- `docs/agents/BuildTest.md`
- `docs/agents/ProductProjectMg.md`
- `docs/agents/ReleaseMg.md`
- `docs/handoffs/HANDOFF_TEMPLATE.md`
- `docs/specs/FEATURE_SPEC_TEMPLATE.md`
- `docs/release/RELEASE_CHECKLIST.md`
- `docs/release/RELEASE_GATE_REPORT_TEMPLATE.md`

Important staging note:

- `PROJECT_MASTER.md`, `TASK_BOARD.md`, and `docs/agents/ReleaseMg.md` also contain release-state changes. If exact separation is required, this commit may need partial staging, which Product Owner must explicitly authorize.
- If partial staging is not desired, combine Commit 1 and Commit 2 into one docs commit instead.

## Proposed Commit 2

Status: superseded by completed commit `9174900`.

Message:

```text
docs: record v1-minimal release closeout state
```

Files:

- `PROJECT_MASTER.md`
- `TASK_BOARD.md`
- `docs/CHANGELOG.md`
- `docs/release/V1_MINIMAL_CLOSEOUT_PLAN_2026-05-09.md`
- `docs/release/V1_MINIMAL_RELEASE_GATE_MATRIX_2026-05-09.md`
- `docs/release/V1_MINIMAL_PRODUCT_OWNER_DECISION_BRIEF_2026-05-09.md`
- `docs/release/V1_MINIMAL_PO_DECISION_PROPOSAL_2026-05-09.md`
- `docs/releases/chrome-web-store-submission-v1-minimal-2026-05-09.md`
- `docs/releases/v1-minimal-release-2026-05-09.md`
- `docs/releases/releasemg-production-acceptance-2026-05-09.md`
- `docs/releases/releasemg-readiness-v1-minimal-2026-05-09.md`
- `docs/releases/v1-minimal-core-acceptance-coverage-2026-05-09.md`
- `docs/audits/DOCS_CONSISTENCY_AUDIT_2026-05-09.md`
- `docs/audits/WORKTREE_STATUS_INVENTORY_2026-05-09.md`
- `docs/audits/WORKTREE_OWNERSHIP_AUDIT_2026-05-09.md`
- `docs/audits/CWS_LEAST_PERMISSION_IMPLEMENTATION_REPORT_2026-05-09.md`
- `docs/audits/CWS_LEAST_PERMISSION_MIN_VERIFY_2026-05-09.md`
- `docs/audits/GIT_LOCAL_CONSISTENCY_AUDIT_2026-05-09.md`
- `docs/audits/COMMIT_SET_PLAN_2026-05-09.md`
- `docs/audits/COMMIT_APPROVAL_PROPOSAL_2026-05-09.md`
- `docs/handoffs/outbox/HANDOFF-v1-minimal-closeout-to-releasemg.md`
- `docs/handoffs/outbox/HANDOFF-v1-minimal-worktree-ownership-to-build-test.md`
- `docs/handoffs/outbox/HANDOFF-cws-least-permission-report-to-build-test.md`
- `docs/handoffs/outbox/HANDOFF-cws-least-permission-min-verify-to-build-test.md`

This commit must preserve:

```text
BLOCKED / NOT READY FOR PUBLIC RELEASE
```

## Proposed Commit 3

Status: superseded by completed commit `7072163`.

Message:

```text
fix: remove scripting dependency from pip cleanup
```

Files:

- `product/interceptor.js`
- `tests/e2e/mode-switch-pip-close.test.js`
- `tests/e2e/mode-switch-prompt-lifecycle.test.js`
- `tests/unit/mode-routing-matrix-v0.test.js`

Evidence:

- `docs/audits/CWS_LEAST_PERMISSION_IMPLEMENTATION_REPORT_2026-05-09.md`
- `docs/audits/CWS_LEAST_PERMISSION_MIN_VERIFY_2026-05-09.md`

Verification:

- unit `193/193`
- E2E `7/7`
- permission scans pass

This commit does not authorize:

- package rebuild;
- CWS upload/submit;
- release;
- push/tag;
- including `admin/admin.js`, `bind.js`, Pages stats-v1 files.

## Safer Alternative

Because Commit 1 and Commit 2 share some files (`PROJECT_MASTER.md`, `TASK_BOARD.md`, `docs/agents/ReleaseMg.md`), the safer non-interactive path is:

```text
Commit A: docs: add agent workflow and v1-minimal closeout records
Commit B: fix: remove scripting dependency from pip cleanup
```

Commit A would include all documentation/governance/release evidence docs. Commit B would include only the verified implementation package.

This avoids fragile partial staging and better fits the current mixed documentation changes.

## Product Owner Approval Options

Please choose one:

1. Authorize Pages stats-v1 minimum verification only.
   - Completed: `pages-config-v12-fields` 22/22 PASS; `workers-stats-ingestion-v12-normalization` 25/25 PASS.
   - No commit/deploy.
   - Push/tag remain blocked.
2. Hold Pages stats-v1 package for later.
   - Keep dirty files uncommitted.
   - Push/tag remain blocked.
3. Authorize git push only.
   - Push current local commits.
   - No tag/release.
   - Pages dirty files remain uncommitted.

## Explicit Non-Approvals

This proposal does not approve:

- push;
- tag;
- merge;
- release;
- package rebuild;
- Chrome Web Store action;
- Chrome profile/storage/cloud/D1 action;
- staging Pages stats-v1 files unless Product Owner opens a separate Pages task;
- staging `pages/index.html`;
- staging `tests/unit/pages-config-v12-fields.test.js`.

## Result

Status: `COMPLETED COMMITS RECORDED / PAGES OR PUSH DECISION REQUIRED`

No code was modified.

No tests were run.

No files were staged or committed.

No fetch, push, tag, merge, reset, checkout, stash, package rebuild, CWS action, Chrome profile mutation, storage write, cloud write, or D1 write was performed.
