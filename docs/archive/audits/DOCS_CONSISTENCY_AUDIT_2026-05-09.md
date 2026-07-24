> **ARCHIVED / Historical evidence only.** This file is preserved for audit/history and must not be used as the current product source of truth. Use `AGENTS.md`, `PROJECT_MASTER.md`, `TASK_BOARD.md`, `DECISIONS.md`, and the current authority documents instead.

# Docs Consistency Audit - 2026-05-09

## Scope

This is a docs-only audit. It checks documentation completeness and cross-document consistency. It does not inspect product code, modify product behavior, run tests, execute release gates, or verify live Chrome Web Store state.

## Source Documents

- `AGENTS.md`
- `PROJECT_WORKFLOW.md`
- `PROJECT_MASTER.md`
- `TASK_BOARD.md`
- `DECISIONS.md`
- `docs/agents/ProductProjectMg.md`
- `docs/agents/BuildTest.md`
- `docs/agents/ReleaseMg.md`
- `docs/handoffs/HANDOFF_TEMPLATE.md`
- `docs/specs/FEATURE_SPEC_TEMPLATE.md`
- `docs/release/RELEASE_CHECKLIST.md`
- `docs/release/RELEASE_GATE_REPORT_TEMPLATE.md`
- `docs/releases/chrome-web-store-submission-v1-minimal-2026-05-09.md`
- `docs/releases/releasemg-production-acceptance-2026-05-09.md`
- `docs/releases/v1-minimal-core-acceptance-coverage-2026-05-09.md`
- `docs/releases/v1-minimal-release-2026-05-09.md`

## Executive Summary

The documentation now has a coherent high-level model:

- V0 is frozen as an internal stabilization baseline.
- V1-minimal is the active first formal release target.
- Daily execution belongs to the Codex three-role workflow.
- ChatGPT is an external advisor, not the daily engineering controller.
- Role contracts are consolidated to one file per role:
  - `docs/agents/ProductProjectMg.md`
  - `docs/agents/BuildTest.md`
  - `docs/agents/ReleaseMg.md`

The largest remaining documentation risks are release-state drift and incomplete release close-out evidence, not missing product-design structure.

## Current Release State From Docs

| Area | Current documented state |
|---|---|
| Version | `1.7.2` |
| Active target | `V1-minimal release candidate` |
| V0 | Internal stabilization baseline only; not formal public release |
| CWS status | Reduced-permission package submitted; dashboard status recorded as `待审核`; not publicly released |
| Public release | Not completed |
| Git push/tag | Blocked pending separate Product Owner approval |
| ReleaseMg production acceptance | `PARTIAL / NOT CLOSED` |
| Main remaining release blockers | release gate matrix reset; macOS + Windows real Chrome smoke; production-profile readonly smoke or explicit PO waiver |

## Consistency Findings

### DCA-001 - Chrome Web Store submission text is stale

Priority: P0 for release documentation

`docs/releases/chrome-web-store-submission-v1-minimal-2026-05-09.md` still says:

- "This file prepares Chrome Web Store submission copy only."
- "Prepared only. Not uploaded. Not submitted."
- final Submit for Review requires separate Product Owner approval.

Other release docs now say the reduced-permission package was submitted and CWS status is `待审核`.

Impact:

- This creates a direct release-state conflict.
- A future ReleaseMg or Product&Project Mg session could incorrectly treat CWS as not uploaded/submitted.

Recommended owner:

- Product&Project Mg for wording update.
- releaseMg for live CWS status verification if needed.

Recommended resolution:

- Rename or update the file as historical submission copy.
- Add a clear status note: prepared text was used for the reduced-permission CWS submission; current recorded status is `待审核`; public release is still not complete.

### DCA-002 - CWS permission justification includes permissions no longer in reduced-permission package

Priority: P0 for CWS documentation

`chrome-web-store-submission-v1-minimal-2026-05-09.md` still justifies:

- `declarativeNetRequestFeedback`
- `management`
- `scripting`

`releasemg-production-acceptance-2026-05-09.md` records the CWS resubmission artifact permissions as:

- `tabs`
- `storage`
- `alarms`
- `declarativeNetRequest`
- `webNavigation`
- `idle`
- `notifications`
- host permission `<all_urls>`

Impact:

- Submission copy and reduced-permission artifact documentation do not align.
- This is a CWS review documentation risk.

Recommended owner:

- Product&Project Mg updates submission text.
- Build&Test may later verify manifest/package permission parity if PO authorizes code/package inspection.

Recommended resolution:

- Remove or mark old permission justifications as historical.
- Ensure current submission text only justifies permissions in the submitted artifact.

### DCA-003 - `statsFoundationV1SyncEnabled` appears in both out-of-scope and active V1-minimal gate text

Priority: P1 docs consistency

`PROJECT_MASTER.md` and `TASK_BOARD.md` preserve an older out-of-scope entry for enabling `statsFoundationV1SyncEnabled`, then note that D-035 supersedes it as a V1-minimal required gate.

Impact:

- The note prevents total ambiguity, but the checklist still visually presents an obsolete out-of-scope item.
- This can confuse handoffs and release-readiness interpretation.

Recommended owner:

- Product&Project Mg.

Recommended resolution:

- Move the historical out-of-scope entry into a short "superseded historical note."
- Keep current V1-minimal truth aligned with D-035: V1-minimal active stats truth path is `usage_segments_v1` + `stats_v1`.

### DCA-004 - Release artifact size differs across docs

Priority: P2 docs consistency

`PROJECT_MASTER.md` records V1-minimal package size as `141,364 bytes`.

`docs/releases/v1-minimal-release-2026-05-09.md` records size as `141357 bytes`.

Impact:

- Minor artifact identity drift.
- SHA256 is more authoritative and matches across the main docs, but size should still be reconciled.

Recommended owner:

- releaseMg verifies artifact metadata if PO authorizes file inspection.
- Product&Project Mg updates docs after verified evidence.

Recommended resolution:

- Treat SHA256 as primary identity.
- Reconcile size only from a current file metadata check or recorded build evidence.

### DCA-005 - ReleaseMg production acceptance uses `WAIVED` without explicit Product Owner approval

Priority: P1 release governance

`docs/agents/ReleaseMg.md` says `WAIVED` and `DEFERRED` require Product Owner approval in the evidence.

`docs/releases/releasemg-production-acceptance-2026-05-09.md` records `RECOVERY-SMOKE` as `WAIVED`, approved by "ReleaseMg SOP boundary."

Impact:

- This weakens waiver semantics.
- It may blur the difference between "not in current safe scope" and "Product Owner waived."

Recommended owner:

- releaseMg.

Recommended resolution:

- Use `DEFERRED` or `BLOCKED_BY_SCOPE` style language unless Product Owner explicitly waived.
- Reserve `WAIVED` for explicit PO acceptance.

### DCA-006 - Chrome Web Store submission remains listed as a future task

Priority: P1 task-board consistency

`TASK_BOARD.md` records:

- CWS reduced-permission package submitted and status `待审核`.
- Later item: "Chrome Web Store submission — separate future task, not part of this release closeout."

Impact:

- The future-task entry is stale or needs renaming.

Recommended owner:

- Product&Project Mg.

Recommended resolution:

- Rename to "Chrome Web Store review follow-up / public release close-out."
- Keep public release and final close-out as separate pending items.

### DCA-007 - Release gate matrix reset remains incomplete

Priority: P0 release planning

`TASK_BOARD.md` marks `release gate matrix reset（V1-minimal 口径）` as incomplete.

Existing templates exist in `docs/release/`, and core coverage exists in `docs/releases/v1-minimal-core-acceptance-coverage-2026-05-09.md`, but there is no final V1-minimal gate matrix report using the new release template.

Impact:

- ReleaseMg lacks a single final gate map for V1-minimal close-out.

Recommended owner:

- Product&Project Mg drafts the matrix.
- releaseMg executes or validates it.

Recommended resolution:

- Create a V1-minimal release gate matrix report before final readiness recommendation.

### DCA-008 - Handoff/spec structure exists but no active handoff/spec instances exist

Priority: P1 workflow readiness

The repo now has:

- `docs/handoffs/HANDOFF_TEMPLATE.md`
- `docs/handoffs/inbox/`
- `docs/handoffs/outbox/`
- `docs/handoffs/archive/`
- `docs/specs/FEATURE_SPEC_TEMPLATE.md`

There are no task-specific handoff or spec files yet.

Impact:

- The three-role workflow is defined but not yet exercised through actual handoff artifacts.

Recommended owner:

- Product&Project Mg.

Recommended resolution:

- For the next planned task, create the first real handoff from Product&Project Mg to releaseMg or Build&Test.
- Start with V1-minimal close-out because it is the current P0.

### DCA-009 - Working tree state is dirty and spans docs, code, tests, and release files

Priority: P0 project hygiene

`git status --short` currently shows modified product files, test files, release docs, agent docs, and untracked docs.

Impact:

- Planning and release close-out are harder while ownership of changes is unclear.
- Docs-only work can be mixed with unrelated code/test modifications in the working tree.

Recommended owner:

- Product Owner decides whether to ask a Git/status review session to classify changes.
- Product&Project Mg can document ownership/status only.

Recommended resolution:

- Before release close-out, create a change ownership/status inventory:
  - docs-only collaboration changes;
  - release evidence changes;
  - product code changes;
  - test changes;
  - unknown/unowned changes.

## Missing Or Incomplete Documents

| Missing / incomplete item | Current state | Recommended next document |
|---|---|---|
| V1-minimal release gate matrix | TODO in `TASK_BOARD.md` | `docs/release/V1_MINIMAL_RELEASE_GATE_MATRIX_2026-05-09.md` |
| ReleaseMg final readiness report | Production acceptance is partial | `docs/releases/releasemg-readiness-v1-minimal-YYYY-MM-DD.md` |
| First real three-role handoff | Templates exist only | `docs/handoffs/outbox/HANDOFF-v1-minimal-closeout-to-releasemg.md` |
| Dirty working tree ownership inventory | Not documented | `docs/audits/WORKTREE_STATUS_INVENTORY_YYYY-MM-DD.md` |
| Current CWS submission text after reduced-permission package | Existing copy is stale | updated `chrome-web-store-submission-v1-minimal-2026-05-09.md` or historical note |

## Items Requiring Product Owner Decision

1. Whether to treat incomplete production-profile readonly smoke as a blocker or explicitly waive/defer it.
2. Whether to complete macOS + Windows real Chrome smoke before public release.
3. Whether and when to approve git push/tag.
4. Whether to wait for CWS review before further release close-out work.
5. Whether to authorize a non-docs code/package parity audit later.
6. D-015: terminal/admin appeal-review semantics.
7. Whether to approve Stats Foundation controlled production rollout after V1-minimal.

## Items Requiring Build&Test Verification Later

Only after Product Owner explicitly allows work outside docs-only:

1. Manifest/package permission parity for the submitted CWS package.
2. Runtime behavior vs V1-minimal out-of-scope claims, especially time borrowing disabled state.
3. `statsFoundationV1SyncEnabled` runtime gate and v1 sync behavior against docs.
4. PiP cleanup permission alignment.
5. Stale routing/test comments noted by `v1-minimal-core-acceptance-coverage-2026-05-09.md`.

## Items Requiring releaseMg Verification Later

1. Final V1-minimal release gate matrix execution or validation.
2. Redacted production-profile readonly smoke or explicit PO waiver/defer.
3. CWS dashboard status verification.
4. Installed extension version and artifact parity.
5. Evidence privacy review.
6. Final release readiness recommendation.

## Recommended Next Step

Create a docs-only V1-minimal close-out plan and first handoff:

- `docs/release/V1_MINIMAL_RELEASE_GATE_MATRIX_2026-05-09.md`
- `docs/handoffs/outbox/HANDOFF-v1-minimal-closeout-to-releasemg.md`

The handoff should ask releaseMg to close or classify:

- CWS status;
- production-profile readonly smoke;
- artifact parity;
- evidence privacy;
- final readiness recommendation.

## Audit Result

Status: `DOCS AUDIT COMPLETE / RELEASE DOCS NEED CLEANUP`

No product code was modified.

No test code was modified.

No tests were run.

No release, tag, push, merge, deployment, migration, or CWS action was performed.

## Phase B Cleanup Follow-up

Phase B docs-only cleanup was started after this audit. The following audit findings were addressed in documentation:

| Finding | Follow-up status |
|---|---|
| DCA-001 CWS submission text stale | Updated `docs/releases/chrome-web-store-submission-v1-minimal-2026-05-09.md` to record reduced-permission package submitted / `待审核` / public release not completed. |
| DCA-002 stale CWS permission justification | Updated permission justification to match the reduced-permission package recorded by ReleaseMg. Removed justifications for removed permissions from the current submission record. |
| DCA-003 `statsFoundationV1SyncEnabled` split-brain | Updated `PROJECT_MASTER.md` and `TASK_BOARD.md` to treat D-035 as current V1-minimal truth and move the old out-of-scope entry into historical context. |
| DCA-004 artifact size mismatch | Normalized `PROJECT_MASTER.md` to the release-record size and explicitly preserved SHA256 as primary identity. |
| DCA-005 `WAIVED` without PO approval | Updated ReleaseMg production acceptance report to use `DEFERRED` for `RECOVERY-SMOKE` where no explicit Product Owner waiver is recorded. |
| DCA-006 CWS submission future task stale | Updated `TASK_BOARD.md` to "Chrome Web Store review follow-up / public release close-out." |
| DCA-007 missing release gate matrix | Added `docs/release/V1_MINIMAL_RELEASE_GATE_MATRIX_2026-05-09.md`. |
| DCA-008 no active handoff | Added `docs/handoffs/outbox/HANDOFF-v1-minimal-closeout-to-releasemg.md`. |
| DCA-009 dirty working tree ownership inventory | Added `docs/audits/WORKTREE_STATUS_INVENTORY_2026-05-09.md`. Ownership is recorded as not closed. |

Additional Phase B planning output:

- Added `docs/release/V1_MINIMAL_CLOSEOUT_PLAN_2026-05-09.md`.
- Updated `PROJECT_MASTER.md`, `TASK_BOARD.md`, and `docs/handoffs/outbox/HANDOFF-v1-minimal-closeout-to-releasemg.md` to point releaseMg to the close-out packet.

Remaining from this audit:

- Dirty product/test file ownership remains open even though the inventory document now exists.
- releaseMg final readiness report remains pending.
- Production-profile readonly smoke remains `PARTIAL / NOT CLOSED` unless completed or explicitly waived/deferred by Product Owner.
