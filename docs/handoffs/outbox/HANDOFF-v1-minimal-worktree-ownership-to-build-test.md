# Agent Handoff

## Metadata

- Handoff ID: HANDOFF-v1-minimal-worktree-ownership-to-build-test
- Date: 2026-05-09
- From: Product&Project Mg
- To: Build&Test
- Related task: V1-minimal dirty product/test working-tree ownership classification
- Related branch: current local branch, verify before action
- Related files:
  - `docs/audits/WORKTREE_STATUS_INVENTORY_2026-05-09.md`
  - `docs/release/V1_MINIMAL_CLOSEOUT_PLAN_2026-05-09.md`
  - `PROJECT_MASTER.md`
  - `TASK_BOARD.md`
- Status: Ready

## Purpose

Ask Build&Test to classify dirty product/test working-tree changes for V1-minimal release close-out without expanding scope or declaring release readiness.

## Context

Product&Project Mg recorded a docs-only working-tree inventory. The tree is dirty across docs, product code, and test code. The docs package can proceed as planning evidence, but dirty product/test files must be classified before releaseMg or Product Owner can make a clean release decision.

This handoff does not authorize implementation, bug fixing, refactoring, release gates, public release, tag, push, merge, package rebuild, CWS action, Chrome profile mutation, storage/cloud writes, or D1 writes.

## Source Of Truth

Build&Test must read:

- `AGENTS.md`
- `PROJECT_MASTER.md`
- `TASK_BOARD.md`
- `DECISIONS.md`
- `docs/agents/BuildTest.md`
- `docs/audits/WORKTREE_STATUS_INVENTORY_2026-05-09.md`
- `docs/release/V1_MINIMAL_CLOSEOUT_PLAN_2026-05-09.md`
- `docs/release/V1_MINIMAL_RELEASE_GATE_MATRIX_2026-05-09.md`
- `docs/handoffs/outbox/HANDOFF-v1-minimal-worktree-ownership-to-build-test.md`

## Request

1. Inspect the current working-tree diff for dirty product/test files only enough to classify ownership and release relevance.
2. Classify each dirty product/test path as one of:
   - `Build&Test implementation package`
   - `Product Owner supplied / external`
   - `Unknown / hold`
   - `Exclude from V1-minimal release consideration`
3. Identify whether any dirty product/test change affects the current V1-minimal artifact, release evidence, or readiness claim.
4. Identify whether any dirty product/test change needs a separate approved spec or implementation report before release close-out.
5. Produce a short ownership audit report.

## Scope

Allowed actions:

- Read docs listed above.
- Inspect `git status` and diffs for dirty product/test files.
- Read modified product/test files only as needed for ownership classification.
- Write an ownership audit report under `docs/audits/` or an implementation-risk note under `docs/handoffs/outbox/`.
- Recommend follow-up tasks.

## Out Of Scope

Forbidden actions:

- Product code changes.
- Test code changes.
- Bug fixes.
- Refactors.
- Manifest/package/GitHub Actions/worker changes.
- Running tests unless Product Owner explicitly authorizes them in that Build&Test session.
- Package rebuild.
- Release gate execution.
- Chrome profile mutation.
- Storage/cloud/D1 writes.
- CWS upload/submit.
- Public release.
- Git tag, push, merge, or commit.
- Declaring V1-minimal release ready.

## Acceptance Criteria

Completion requires:

- Each dirty product/test path is classified.
- Any release-relevant risk is identified.
- Unknown or unowned changes are explicitly marked `Unknown / hold`.
- Build&Test does not change code or tests during this classification task.
- Build&Test does not run tests unless separately authorized.
- Product Owner decisions needed are listed.
- A clear recommendation is provided for whether releaseMg can proceed with readonly readiness review before ownership closes.

## Required Evidence

Build&Test must output:

- files inspected;
- classification table;
- release relevance summary;
- tests run: `None`, unless separately authorized;
- changed files: docs report only, if any;
- known risks;
- out-of-scope confirmation;
- Product Owner decisions required.

## Open Questions

Questions requiring Product Owner decision:

- Should dirty product/test changes be held out of V1-minimal release consideration?
- Should any dirty product/test change become a formal Build&Test implementation package?
- Should Build&Test run any verification tests after ownership classification?
- Should releaseMg wait for this audit before final readiness report?

## Expected Deliverable

An ownership audit report, preferably:

```text
docs/audits/WORKTREE_OWNERSHIP_AUDIT_2026-05-09.md
```

The report must not declare release readiness. It should only classify ownership, release relevance, and follow-up needs.
