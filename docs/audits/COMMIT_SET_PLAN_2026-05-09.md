# Commit Set Plan - 2026-05-09

## Purpose

This is a docs-only commit set plan for the current TimeOnChrome local working tree.

It translates the Git/local consistency audit into proposed commit sets, hold groups, and required Product Owner approvals.

This plan does not stage files, commit, push, tag, merge, fetch, reset, checkout, stash, run tests, rebuild packages, access Chrome Web Store, or modify Chrome profile/storage/cloud/D1.

## Source Inputs

- `docs/audits/GIT_LOCAL_CONSISTENCY_AUDIT_2026-05-09.md`
- `docs/audits/WORKTREE_OWNERSHIP_AUDIT_2026-05-09.md`
- `docs/audits/CWS_LEAST_PERMISSION_IMPLEMENTATION_REPORT_2026-05-09.md`
- `docs/audits/CWS_LEAST_PERMISSION_MIN_VERIFY_2026-05-09.md`
- `docs/releases/releasemg-readiness-v1-minimal-2026-05-09.md`
- `git status --short`
- `git diff --stat`

## Current Rule

Prior local commit execution has already occurred:

```text
9174900 docs: add agent workflow and v1-minimal closeout records
7072163 fix: remove scripting dependency from pip cleanup
```

New commit planning is allowed. Any additional commit execution requires separate Product Owner approval for:

1. exact file set;
2. commit order;
3. commit message;
4. remote check strategy;
5. whether push/tag remains blocked.

## Completed Commit A - Agent Workflow / V1-minimal Close-Out Docs

Status: completed.

Commit:

```text
9174900 docs: add agent workflow and v1-minimal closeout records
```

Purpose:

- Recorded Codex three-role workflow.
- Recorded V1-minimal close-out / release readiness state.
- Preserved blocked release status and handoff evidence.

## Completed Commit B - Verified CWS Least-Permission / Mode Timing Package

Status: completed.

Commit:

```text
7072163 fix: remove scripting dependency from pip cleanup
```

Purpose:

- Removed `chrome.scripting` dependency from PiP cleanup path.
- Aligned related tests with reduced-permission CWS posture and D-020 timing.

Verification was previously recorded in:

- `docs/audits/CWS_LEAST_PERMISSION_IMPLEMENTATION_REPORT_2026-05-09.md`
- `docs/audits/CWS_LEAST_PERMISSION_MIN_VERIFY_2026-05-09.md`

## Superseded Proposed Commit 1 - Agent Workflow Governance Docs

Suggested commit message:

```text
docs: add codex three-role workflow
```

Purpose:

- Establish Product&Project Mg / Build&Test / releaseMg role separation.
- Record ChatGPT external advisor role.
- Add standard handoff/spec/release templates.
- Consolidate role contracts.

Candidate files:

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

Do not include:

- product code;
- test code;
- CWS least-permission implementation package;
- `admin/admin.js`;
- `bind.js`;
- Pages stats-v1 files;
- release evidence docs if Product Owner prefers release docs in a separate commit.

Preconditions:

- Product Owner approves this commit set.
- Optional: review `AGENTS.md` and role contract wording for final names and boundaries.

Status: superseded by completed Commit A.

## Superseded Proposed Commit 2 - V1-minimal Release Evidence / Close-Out Docs

Suggested commit message:

```text
docs: record v1-minimal release closeout state
```

Purpose:

- Record V1-minimal release state.
- Preserve CWS submitted / `待审核` status.
- Record releaseMg readiness as blocked.
- Record worktree ownership, Git/local audit, and PO decision trail.

Candidate files:

- `PROJECT_MASTER.md`
- `TASK_BOARD.md`
- `docs/release/V1_MINIMAL_CLOSEOUT_PLAN_2026-05-09.md`
- `docs/release/V1_MINIMAL_RELEASE_GATE_MATRIX_2026-05-09.md`
- `docs/release/V1_MINIMAL_PRODUCT_OWNER_DECISION_BRIEF_2026-05-09.md`
- `docs/release/V1_MINIMAL_PO_DECISION_PROPOSAL_2026-05-09.md`
- `docs/releases/chrome-web-store-submission-v1-minimal-2026-05-09.md`
- `docs/releases/v1-minimal-release-2026-05-09.md`
- `docs/releases/releasemg-production-acceptance-2026-05-09.md`
- `docs/releases/releasemg-readiness-v1-minimal-2026-05-09.md`
- `docs/releases/v1-minimal-core-acceptance-coverage-2026-05-09.md`
- `docs/CHANGELOG.md`
- `docs/audits/DOCS_CONSISTENCY_AUDIT_2026-05-09.md`
- `docs/audits/WORKTREE_STATUS_INVENTORY_2026-05-09.md`
- `docs/audits/WORKTREE_OWNERSHIP_AUDIT_2026-05-09.md`
- `docs/audits/CWS_LEAST_PERMISSION_IMPLEMENTATION_REPORT_2026-05-09.md`
- `docs/audits/CWS_LEAST_PERMISSION_MIN_VERIFY_2026-05-09.md`
- `docs/audits/GIT_LOCAL_CONSISTENCY_AUDIT_2026-05-09.md`
- `docs/audits/COMMIT_SET_PLAN_2026-05-09.md`
- `docs/handoffs/outbox/HANDOFF-v1-minimal-closeout-to-releasemg.md`
- `docs/handoffs/outbox/HANDOFF-v1-minimal-worktree-ownership-to-build-test.md`
- `docs/handoffs/outbox/HANDOFF-cws-least-permission-report-to-build-test.md`
- `docs/handoffs/outbox/HANDOFF-cws-least-permission-min-verify-to-build-test.md`

Do not include:

- product code;
- test code;
- Pages stats-v1 files;
- `admin/admin.js`;
- `bind.js`;
- any release-ready claim.

Preconditions:

- Product Owner approves release evidence docs commit set.
- Confirm final wording still says `BLOCKED / NOT READY FOR PUBLIC RELEASE`.
- `docs/CHANGELOG.md` inclusion is approved as release-state synchronization, not as product release completion.

Status: superseded by completed Commit A.

## Superseded Proposed Commit 3 - Verified CWS Least-Permission / Mode Timing Package

Suggested commit message:

```text
test: align cws least-permission mode timing coverage
```

Alternative if Product Owner wants `product/interceptor.js` emphasized:

```text
fix: remove scripting dependency from pip cleanup
```

Purpose:

- Align production PiP cleanup with reduced-permission CWS posture.
- Remove `chrome.scripting` dependency from targeted E2E harnesses.
- Align mode timing tests with D-020 `30/45/45`.

Candidate files:

- `product/interceptor.js`
- `tests/e2e/mode-switch-pip-close.test.js`
- `tests/e2e/mode-switch-prompt-lifecycle.test.js`
- `tests/unit/mode-routing-matrix-v0.test.js`

Evidence:

- `docs/audits/CWS_LEAST_PERMISSION_IMPLEMENTATION_REPORT_2026-05-09.md`
- `docs/audits/CWS_LEAST_PERMISSION_MIN_VERIFY_2026-05-09.md`

Verification already recorded:

- `git diff --check`: PASS
- permission scans: PASS
- manifest forbidden permission scan: PASS
- unit: `193/193 passed`
- Playwright E2E: `7/7 passed`

Do not include:

- `admin/admin.js`
- `bind.js`
- `pages/index.html`
- `tests/unit/pages-config-v12-fields.test.js`
- docs governance / release evidence docs unless Product Owner intentionally wants a combined commit.

Preconditions:

- Product Owner explicitly approves committing this implementation package.
- Product Owner decides whether this commit is meant only for local cleanup or for a future rebuilt artifact.
- No package rebuild is implied by this commit.

Status: superseded by completed Commit B.

## Proposed Commit C - Admin/Bind Account-Token Persistence Package

Suggested commit message:

```text
fix: persist account token after admin login and bind
```

Purpose:

- Include Product Owner-approved `admin/admin.js` + `bind.js` account-token persistence package.
- Add focused unit coverage for admin/bind account-token persistence and logout clearing.
- Record D-038 include decision and evidence trail.

Candidate files:

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

- Product Owner decision: `DECISIONS.md:D-038`
- Focused test: `node tests/unit/admin-bind-account-token.test.js` = `5/5 PASS`

Do not include:

- `pages/index.html`
- `tests/unit/pages-config-v12-fields.test.js`
- package rebuilds
- release/tag/push changes

Preconditions:

- Product Owner explicitly approves Commit C.
- No package rebuild is implied.
- Push/tag remain blocked.

## Former Hold Group - Admin/Bind Extension Source

Status: resolved into Proposed Commit C after Product Owner include decision.

Files:

- `admin/admin.js`
- `bind.js`

Decision/evidence:

- `DECISIONS.md:D-038`
- `docs/audits/ADMIN_BIND_ACCOUNT_TOKEN_TEST_PACKAGE_REPORT_2026-05-09.md`
- `tests/unit/admin-bind-account-token.test.js` = `5/5 PASS`

## Later Task Group - Pages Stats-v1

Status: do not include in V1-minimal CWS commit set.

Files:

- `pages/index.html`
- `tests/unit/pages-config-v12-fields.test.js`

Reason:

- Excluded from V1-minimal CWS release consideration.
- No Pages deploy authorized.

Recommended future task:

```text
Pages stats-v1 read path implementation review and deploy plan
```

## Changelog Grouping Decision

Status: include in Proposed Commit 2.

File:

- `docs/CHANGELOG.md`

Reason:

- Diff updates V1-minimal release candidate status from "prepared only / not submitted" to reduced-permission package submitted / `待审核`.
- Diff records ReleaseMg production acceptance as `PARTIAL / NOT CLOSED`.
- This is release-state synchronization and belongs with V1-minimal release evidence docs.

Do not interpret this changelog entry as:

- public release complete;
- release ready;
- Product Owner ship approval;
- git push/tag approval.

## Remote Check Plan

Remote truth has not been verified.

Before push/tag/merge, Product Owner should separately authorize:

```powershell
git fetch origin
git status --short --branch
git log --oneline --decorate --max-count=5
```

This plan does not authorize remote operations.

## Recommended Execution Order

1. Keep Pages stats-v1 files out of V1-minimal commits.
2. If Product Owner wants local history cleanup now, approve Proposed Commit C.
3. Run remote consistency check only after local commit set decisions are made.
4. Push/tag remain blocked until separate approval.

## Product Owner Decisions Required

1. Approve, modify, or reject Proposed Commit C.
2. Decide whether Pages stats-v1 changes should become a separate later task.
3. Decide whether to authorize remote consistency check after Commit C decision.
4. Keep push/tag blocked unless separately approved.

## Result

Status: `COMPLETED COMMITS RECORDED / COMMIT C PENDING PRODUCT OWNER APPROVAL`

No code was modified.

No tests were run.

No files were staged or committed.

No fetch, push, tag, merge, reset, checkout, stash, package rebuild, CWS action, Chrome profile mutation, storage write, cloud write, or D1 write was performed.
