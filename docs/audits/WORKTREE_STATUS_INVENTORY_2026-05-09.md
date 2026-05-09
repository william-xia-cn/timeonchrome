# Worktree Status Inventory - 2026-05-09

## Purpose

This is a docs-only status inventory for V1-minimal close-out planning.

It records the current dirty working tree at a file-category level so Product&Project Mg, Build&Test, releaseMg, and Product Owner do not mix unrelated code/test/doc changes into release readiness.

This document does not inspect product code content, modify product behavior, run tests, stage files, commit, push, tag, merge, release, or verify Chrome Web Store state.

## Source

Command observed from the `timeonchrome` project root:

```text
git status --short
```

The command emitted warnings about access to the user's global git ignore file. The file-status output was still usable for this inventory.

## Current Working Tree Summary

| Category | Status | Files / paths | Planning interpretation |
|---|---|---|---|
| Project governance docs | Modified / untracked | `AGENTS.md`, `PROJECT_MASTER.md`, `TASK_BOARD.md`, `PROJECT_WORKFLOW.md` | Product&Project Mg docs-only work. Must be reviewed as a docs package, not as runtime evidence. |
| Agent contract docs | Modified / untracked | `docs/agents/ReleaseMg.md`, `docs/agents/BuildTest.md`, `docs/agents/ProductProjectMg.md` | Product&Project Mg docs-only role-system work. |
| Release/audit/handoff docs | Modified / untracked | `docs/audits/`, `docs/handoffs/`, `docs/release/`, `docs/releases/chrome-web-store-submission-v1-minimal-2026-05-09.md`, `docs/releases/v1-minimal-release-2026-05-09.md`, `docs/releases/releasemg-production-acceptance-2026-05-09.md`, `docs/releases/v1-minimal-core-acceptance-coverage-2026-05-09.md`, `docs/specs/` | Release planning/evidence docs. releaseMg may read these, but must still classify incomplete gates rather than treating this inventory as acceptance. |
| General docs | Modified | `docs/CHANGELOG.md` | Documentation change present. Ownership should be confirmed before commit or release packaging decisions. |
| Product code | Modified | `admin/admin.js`, `bind.js`, `pages/index.html`, `product/interceptor.js` | Not owned by docs-only Product&Project Mg work. Requires Build&Test or Product Owner ownership classification before release close-out. |
| Test code | Modified | `tests/e2e/mode-switch-pip-close.test.js`, `tests/e2e/mode-switch-prompt-lifecycle.test.js`, `tests/unit/mode-routing-matrix-v0.test.js`, `tests/unit/pages-config-v12-fields.test.js` | Not owned by docs-only Product&Project Mg work. Requires Build&Test ownership classification and test-evidence review before release close-out. |

## Release Close-Out Risk

The working tree is not release-clean.

This does not automatically block docs-only planning, but it does block any clean release/readiness claim unless releaseMg or Product Owner explicitly scopes and accepts the dirty state.

## Required Ownership Classification

Before public release close-out, classify each dirty path into one of:

| Classification | Meaning |
|---|---|
| `Product&Project Mg docs package` | Documentation-only governance, planning, audit, handoff, release-status cleanup. |
| `Build&Test implementation package` | Product/test changes tied to an approved spec and implementation report. |
| `releaseMg evidence package` | Release gate, acceptance, readiness, CWS, or checklist records produced under releaseMg constraints. |
| `Product Owner supplied / external` | Change came from Product Owner or outside the current agent session and must not be reverted. |
| `Unknown / hold` | Do not commit, release, or use as release evidence until owner is identified. |

## Current Recommended Classification

| Area | Recommended classification | Next owner |
|---|---|---|
| Three-role workflow docs | `Product&Project Mg docs package` | Product&Project Mg |
| Phase B release docs cleanup | `Product&Project Mg docs package` | Product&Project Mg |
| ReleaseMg production acceptance report | `releaseMg evidence package`, pending releaseMg final close-out | releaseMg |
| Product code changes | `Unknown / hold` until Build&Test or Product Owner identifies scope | Build&Test / Product Owner |
| Test code changes | `Unknown / hold` until Build&Test identifies matching implementation/test task | Build&Test |

## Stop Rules For Release Work

ReleaseMg must stop or classify as blocked if:

- dirty product/test files affect the artifact being accepted and no owner/evidence exists;
- installed extension/package parity cannot be established;
- production-profile readonly smoke remains incomplete and no explicit Product Owner waiver/defer exists;
- CWS state cannot be verified when final readiness depends on it;
- evidence would expose private profile, child, account, token, cookie, or raw identifier data.

## Product Owner Decisions Required

1. Should Build&Test perform a non-docs ownership audit for the modified product/test files?
2. Should releaseMg proceed with readonly release close-out while product/test changes remain dirty, or should it wait for ownership classification?
3. Should any dirty code/test changes be excluded from V1-minimal public release consideration?

## Result

Status: `WORKTREE INVENTORY RECORDED / OWNERSHIP NOT CLOSED`

No code was modified.

No tests were run.

No files were staged or committed.

No release, tag, push, merge, deployment, migration, Chrome profile change, storage write, cloud write, or D1 write was performed.
