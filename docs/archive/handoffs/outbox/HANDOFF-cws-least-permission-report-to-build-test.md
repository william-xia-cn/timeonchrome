> **ARCHIVED / Historical evidence only.** This file is preserved for audit/history and must not be used as the current product source of truth. Use `AGENTS.md`, `PROJECT_MASTER.md`, `TASK_BOARD.md`, `DECISIONS.md`, and the current authority documents instead.

# Agent Handoff

## Metadata

- Handoff ID: HANDOFF-cws-least-permission-report-to-build-test
- Date: 2026-05-09
- From: Product&Project Mg
- To: Build&Test
- Related task: CWS least-permission / mode timing cleanup implementation report
- Related branch: current local branch, verify before action
- Related files:
  - `product/interceptor.js`
  - `tests/e2e/mode-switch-pip-close.test.js`
  - `tests/e2e/mode-switch-prompt-lifecycle.test.js`
  - `tests/unit/mode-routing-matrix-v0.test.js`
  - `docs/audits/WORKTREE_OWNERSHIP_AUDIT_2026-05-09.md`
  - `docs/release/V1_MINIMAL_PO_DECISION_PROPOSAL_2026-05-09.md`
- Status: Ready

## Purpose

Ask Build&Test to produce a formal implementation report and minimal verification plan for the dirty CWS least-permission / mode timing cleanup package.

## Context

Build&Test previously classified these dirty files as a `Build&Test implementation package`:

- `product/interceptor.js`
- `tests/e2e/mode-switch-pip-close.test.js`
- `tests/e2e/mode-switch-prompt-lifecycle.test.js`
- `tests/unit/mode-routing-matrix-v0.test.js`

Product Owner approved keeping `admin/admin.js` and `bind.js` as `Unknown / hold`, keeping Pages stats-v1 changes excluded from V1-minimal, and asking Build&Test to produce a formal report for this package. This handoff does not authorize code edits, test execution, package rebuild, commit, push, tag, release, CWS action, Chrome profile mutation, storage/cloud writes, or D1 writes.

## Source Of Truth

Build&Test must read:

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

## Request

1. Inspect the current diffs for the four package files listed above.
2. Produce a formal implementation report explaining:
   - behavior changes;
   - release relevance;
   - permission-alignment relevance;
   - mode timing relevance;
   - risk and rollback notes.
3. Produce a minimal verification plan with exact commands that Product Owner may authorize later.
4. Confirm that no unowned `admin/admin.js`, `bind.js`, Pages stats-v1, CWS, Chrome profile, storage/cloud/D1, package, git, or release action is included.

## Scope

Allowed actions:

- Read required docs.
- Inspect `git status` and diffs for:
  - `product/interceptor.js`
  - `tests/e2e/mode-switch-pip-close.test.js`
  - `tests/e2e/mode-switch-prompt-lifecycle.test.js`
  - `tests/unit/mode-routing-matrix-v0.test.js`
- Read those files only as needed to write the report.
- Add one report:
  - `docs/audits/CWS_LEAST_PERMISSION_IMPLEMENTATION_REPORT_2026-05-09.md`

## Out Of Scope

Forbidden actions:

- Product code edits.
- Test code edits.
- Bug fixes.
- Refactors.
- Running tests.
- Package rebuild.
- Commit, push, tag, merge, or release.
- Chrome Web Store upload, submit, or dashboard action.
- Chrome profile access or mutation.
- Storage/cloud/D1 reads or writes beyond reading repo docs.
- Modifying `admin/admin.js`, `bind.js`, `pages/index.html`, or `tests/unit/pages-config-v12-fields.test.js`.
- Declaring V1-minimal release ready.

## Acceptance Criteria

Completion requires:

- Implementation report created at `docs/audits/CWS_LEAST_PERMISSION_IMPLEMENTATION_REPORT_2026-05-09.md`.
- Report explains the four dirty files as one scoped package.
- Report lists exact changed files and behavior changes.
- Report lists minimal verification commands but does not run them.
- Report states `tests run: None`.
- Report confirms no code/test edits were made in this reporting task.
- Report confirms `admin/admin.js`, `bind.js`, and Pages stats-v1 changes remain excluded/held per PO decision.
- Report identifies Product Owner decisions needed before commit/rebuild/release evidence use.

## Required Evidence

Build&Test must output:

- files inspected;
- changed files in the implementation package;
- behavior changes;
- release relevance;
- permission-alignment summary;
- mode timing summary;
- minimal verification plan;
- tests run: `None`;
- known risks;
- rollback notes;
- Product Owner decisions required.

## Open Questions

Questions requiring Product Owner decision:

- Should Product Owner authorize the minimal verification commands after reviewing the report?
- Should this package be committed, held, or used in a future rebuilt artifact?
- Should releaseMg treat this package as accepted implementation evidence only after tests are run?

## Expected Deliverable

`docs/audits/CWS_LEAST_PERMISSION_IMPLEMENTATION_REPORT_2026-05-09.md`

Final Build&Test response should summarize changed files, report path, tests run, risks, and Product Owner decisions required.
