> **ARCHIVED / Historical evidence only.** This file is preserved for audit/history and must not be used as the current product source of truth. Use `AGENTS.md`, `PROJECT_MASTER.md`, `TASK_BOARD.md`, `DECISIONS.md`, and the current authority documents instead.

# Agent Handoff

## Metadata

- Handoff ID: HANDOFF-v1-minimal-closeout-to-releasemg
- Date: 2026-05-09
- From: Product&Project Mg
- To: releaseMg
- Related task: V1-minimal release close-out readiness
- Related branch: current local branch, verify before action
- Related files:
  - `docs/release/V1_MINIMAL_RELEASE_GATE_MATRIX_2026-05-09.md`
  - `docs/release/V1_MINIMAL_CLOSEOUT_PLAN_2026-05-09.md`
  - `docs/audits/WORKTREE_STATUS_INVENTORY_2026-05-09.md`
  - `docs/audits/WORKTREE_OWNERSHIP_AUDIT_2026-05-09.md`
  - `docs/releases/releasemg-production-acceptance-2026-05-09.md`
  - `docs/releases/v1-minimal-release-2026-05-09.md`
  - `docs/releases/chrome-web-store-submission-v1-minimal-2026-05-09.md`
  - `docs/audits/DOCS_CONSISTENCY_AUDIT_2026-05-09.md`
- Status: Ready

## Purpose

Ask releaseMg to verify or classify the remaining V1-minimal release-management gates and produce a final readiness recommendation.

## Context

V1-minimal has a submitted reduced-permission CWS package and recorded status `待审核`, but it is not publicly released. ReleaseMg production acceptance is currently `PARTIAL / NOT CLOSED`.

Product&Project Mg has created a docs-only close-out board and working-tree inventory. Build&Test has completed a dirty product/test ownership audit. releaseMg must not treat unowned, excluded, or unaccepted dirty changes as release evidence.

Build&Test audit summary:

- `Build&Test implementation package`: `product/interceptor.js`, `tests/e2e/mode-switch-pip-close.test.js`, `tests/e2e/mode-switch-prompt-lifecycle.test.js`, `tests/unit/mode-routing-matrix-v0.test.js`.
- `Unknown / hold`: `admin/admin.js`, `bind.js`.
- `Exclude from V1-minimal release consideration`: `pages/index.html`, `tests/unit/pages-config-v12-fields.test.js`.

## Source Of Truth

releaseMg must read:

- `AGENTS.md`
- `PROJECT_WORKFLOW.md`
- `PROJECT_MASTER.md`
- `TASK_BOARD.md`
- `DECISIONS.md`
- `docs/agents/ReleaseMg.md`
- `docs/release/RELEASE_CHECKLIST.md`
- `docs/release/RELEASE_GATE_REPORT_TEMPLATE.md`
- `docs/release/V1_MINIMAL_CLOSEOUT_PLAN_2026-05-09.md`
- `docs/release/V1_MINIMAL_RELEASE_GATE_MATRIX_2026-05-09.md`
- `docs/audits/WORKTREE_STATUS_INVENTORY_2026-05-09.md`
- `docs/audits/WORKTREE_OWNERSHIP_AUDIT_2026-05-09.md`
- `docs/releases/releasemg-production-acceptance-2026-05-09.md`
- `docs/releases/v1-minimal-release-2026-05-09.md`
- `docs/releases/chrome-web-store-submission-v1-minimal-2026-05-09.md`

## Request

1. Verify or classify the remaining V1-minimal release-management gates.
2. Preserve `PASS`, `PARTIAL`, `BLOCKED`, `DEFERRED`, `WAIVED`, and `KNOWN_RISK` semantics exactly.
3. Produce a release readiness report.
4. Identify Product Owner decisions required before public release.
5. Classify whether the Build&Test ownership audit findings block readiness, can be explicitly excluded, or require Product Owner action before final release recommendation.

## Scope

Allowed actions:

- Read docs and release evidence.
- Run approved releaseMg readonly checks only if Product Owner explicitly authorizes them in that session.
- Update release report/checklist documents.
- Record blockers, deferrals, waivers, and known risks.
- Record whether dirty product/test files are excluded from releaseMg evidence or require Product Owner / Build&Test follow-up. Preserve `admin/admin.js` and `bind.js` as `Unknown / hold` unless Product Owner resolves them.

## Out Of Scope

Forbidden actions:

- Product code changes.
- Test code changes.
- Worker/package/manifest/GitHub Actions changes.
- Chrome profile mutation.
- Storage/cloud/D1 writes.
- CWS upload or submit.
- Public release.
- Git tag, push, merge, or commit unless Product Owner separately authorizes.
- Rewriting accepted risks as pass.

## Acceptance Criteria

Completion requires:

- CWS status classified.
- Production-profile readonly smoke classified as PASS / BLOCKED / DEFERRED / WAIVED with correct approval semantics.
- Artifact parity classified.
- Evidence privacy reviewed.
- Final release readiness recommendation recorded.
- Product Owner decision list recorded.
- Dirty product/test working-tree status classified using `docs/audits/WORKTREE_OWNERSHIP_AUDIT_2026-05-09.md`; unowned/excluded changes are not used as release evidence.

## Required Evidence

releaseMg must output:

- release gate results;
- acceptance test results, if any approved checks are run;
- evidence files;
- failed or blocked items;
- waiver/defer table with approver;
- risk list;
- release readiness recommendation.

## Open Questions

- Should Product Owner authorize production-profile readonly smoke?
- Should Product Owner waive or defer macOS + Windows real Chrome smoke for V1-minimal public release?
- Should Product Owner wait for CWS review before further release close-out?
- Should Product Owner approve git push/tag after readiness report?
- Should Product Owner resolve `admin/admin.js` and `bind.js` before final release readiness, or explicitly scope them out?
- Should Product Owner keep Pages stats-v1 changes excluded from V1-minimal?
- Should Product Owner accept, hold, or request tests for the Build&Test CWS least-permission/timing cleanup package?

## Expected Deliverable

A releaseMg readiness report under `docs/releases/` using the release gate matrix and ReleaseMg SOP.
