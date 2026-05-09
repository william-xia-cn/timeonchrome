# Commit Approval Proposal - 2026-05-09

## Purpose

This is a Product&Project Mg proposal for Product Owner approval of local commit execution and remote consistency checking.

This file does not approve or perform staging, commit, fetch, push, tag, merge, reset, checkout, stash, package rebuild, CWS action, Chrome profile mutation, storage/cloud/D1 writes, or release.

## Current State

| Area | State |
|---|---|
| Commit set plan | `docs/audits/COMMIT_SET_PLAN_2026-05-09.md` |
| Local branch | `master` |
| HEAD | `e3f6239 chore: align manifest with CWS permission review` |
| Remote truth | Not verified |
| Release readiness | `BLOCKED / NOT READY FOR PUBLIC RELEASE` |
| CWS | Submitted / `待审核` |
| Push/tag | Blocked |

## Recommended Approval Package

Product&Project Mg recommends:

| Item | Recommendation | Reason |
|---|---|---|
| Commit 1 | Approve | Governance docs are ready and should be separated from release evidence and implementation. |
| Commit 2 | Approve | Release evidence docs are ready and should preserve current blocked state. |
| Commit 3 | Approve only if Product Owner wants local cleanup now; otherwise hold | Package is verified, but still does not mutate submitted CWS artifact. |
| `admin/admin.js`, `bind.js` | Keep held; do not stage | Still `Unknown / hold`. |
| Pages stats-v1 files | Keep excluded; do not stage | Separate later task. |
| Remote consistency check | Authorize after local commit set approval | Needed before any push/tag decision. |
| Push/tag | Keep blocked | Requires separate Product Owner approval after remote truth is known. |

## Proposed Commit 1

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

1. Approve safer two-commit plan:
   - Commit A docs package.
   - Commit B verified CWS least-permission package.
   - Then authorize remote consistency check only.
   - Push/tag remain blocked.
2. Approve three-commit plan with partial staging:
   - Commit 1 governance docs.
   - Commit 2 release evidence docs.
   - Commit 3 verified CWS package.
   - Then authorize remote consistency check only.
   - Push/tag remain blocked.
3. Approve docs commits only:
   - Commit A or Commit 1/2.
   - Hold Commit 3.
   - Remote consistency check optional.
4. Hold all commits.

## Explicit Non-Approvals

This proposal does not approve:

- push;
- tag;
- merge;
- release;
- package rebuild;
- Chrome Web Store action;
- Chrome profile/storage/cloud/D1 action;
- staging `admin/admin.js`;
- staging `bind.js`;
- staging `pages/index.html`;
- staging `tests/unit/pages-config-v12-fields.test.js`.

## Result

Status: `COMMIT APPROVAL PROPOSAL READY / NO GIT ACTION APPROVED`

No code was modified.

No tests were run.

No files were staged or committed.

No fetch, push, tag, merge, reset, checkout, stash, package rebuild, CWS action, Chrome profile mutation, storage write, cloud write, or D1 write was performed.
