> **ARCHIVED / Historical evidence only.** This file is preserved for audit/history and must not be used as the current product source of truth. Use `AGENTS.md`, `PROJECT_MASTER.md`, `TASK_BOARD.md`, `DECISIONS.md`, and the current authority documents instead.

# Git / Local Consistency Audit - 2026-05-09

## Purpose

This is a docs-only local Git consistency audit for TimeOnChrome V1-minimal close-out planning.

It classifies the current local working tree into proposed commit/hold groups and identifies what remains blocked before any push/tag/release decision.

This audit does not fetch remote state, stage files, commit, push, tag, merge, reset, checkout, stash, delete, move files, run tests, rebuild packages, access Chrome Web Store, or modify Chrome profile/storage/cloud/D1.

## Local Git Snapshot

| Item | Value |
|---|---|
| Project root | `D:\Opencode\ChromeExtension\timeonchrome` |
| Branch | `master` |
| HEAD | `e3f6239 chore: align manifest with CWS permission review` |
| Remote truth | Not verified in this audit |
| Remote check needed | Yes, before any push/tag/merge decision |

Commands observed:

```powershell
git branch --show-current
git log -1 --oneline
git status --short
git diff --name-only
git diff --stat
```

Notes:

- Git emitted warnings about access to the user's global git ignore file. The local repository status output was still usable for this audit.
- Git diff emitted LF-to-CRLF working-copy warnings. `git diff --check` later passed in the CWS least-permission minimum verification, so no whitespace errors are currently recorded for that package.

## Current Dirty Working Tree

Modified tracked files:

- `AGENTS.md`
- `PROJECT_MASTER.md`
- `TASK_BOARD.md`
- `admin/admin.js`
- `bind.js`
- `docs/CHANGELOG.md`
- `docs/agents/ReleaseMg.md`
- `docs/releases/chrome-web-store-submission-v1-minimal-2026-05-09.md`
- `docs/releases/v1-minimal-release-2026-05-09.md`
- `pages/index.html`
- `product/interceptor.js`
- `tests/e2e/mode-switch-pip-close.test.js`
- `tests/e2e/mode-switch-prompt-lifecycle.test.js`
- `tests/unit/mode-routing-matrix-v0.test.js`
- `tests/unit/pages-config-v12-fields.test.js`

Untracked groups:

- `PROJECT_WORKFLOW.md`
- `docs/agents/BuildTest.md`
- `docs/agents/ProductProjectMg.md`
- `docs/audits/`
- `docs/handoffs/`
- `docs/release/`
- `docs/releases/releasemg-production-acceptance-2026-05-09.md`
- `docs/releases/releasemg-readiness-v1-minimal-2026-05-09.md`
- `docs/releases/v1-minimal-core-acceptance-coverage-2026-05-09.md`
- `docs/specs/`

## Proposed Local Groups

### Group A - Agent Workflow / Governance Docs

Status: commit candidate after Product Owner review.

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
- relevant `docs/handoffs/outbox/*` handoff files

Purpose:

- Codex three-role workflow.
- ChatGPT external advisor role.
- Standardized handoff system.
- Role contracts and operating boundaries.

Risk:

- Mostly documentation/governance.
- Should be kept separate from product/test implementation commits.

### Group B - Release / CWS / Readiness Evidence Docs

Status: commit candidate after Product Owner review.

Files:

- `docs/release/*`
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
- this audit file

Purpose:

- V1-minimal release state cleanup.
- CWS submitted / `待审核` record.
- ReleaseMg readiness classification.
- Dirty worktree ownership and verification evidence.

Risk:

- Docs only, but release-sensitive.
- Must preserve `BLOCKED / NOT READY FOR PUBLIC RELEASE`; do not phrase as release complete.

### Group C - Verified CWS Least-Permission / Mode Timing Package

Status: implementation commit candidate, but not yet approved for commit/rebuild/release.

Files:

- `product/interceptor.js`
- `tests/e2e/mode-switch-pip-close.test.js`
- `tests/e2e/mode-switch-prompt-lifecycle.test.js`
- `tests/unit/mode-routing-matrix-v0.test.js`

Evidence:

- `docs/audits/CWS_LEAST_PERMISSION_IMPLEMENTATION_REPORT_2026-05-09.md`
- `docs/audits/CWS_LEAST_PERMISSION_MIN_VERIFY_2026-05-09.md`

Verification:

- `git diff --check`: PASS
- production/test permission scans: PASS
- manifest forbidden permission scan: PASS
- unit: `193/193 passed`
- Playwright E2E: `7/7 passed` after known sandbox worker `spawn EPERM` was handled by rerunning the same authorized commands outside sandbox

Risk:

- Dirty and uncommitted.
- Does not mutate the already-submitted CWS artifact.
- Any future artifact parity claim requires separately authorized rebuild/package verification.

Recommended next decision:

- Product Owner decides commit / hold / rebuild later.
- Product&Project Mg recommendation remains: hold commit/rebuild while CWS is `待审核`, unless Product Owner wants to clean local history now.

### Group D - Unknown / Hold Extension Source

Status: hold. Do not commit into V1-minimal release set.

Files:

- `admin/admin.js`
- `bind.js`

Reason:

- Build&Test classified both as `Unknown / hold`.
- They affect account-token persistence / auth-storage behavior.
- They are extension-source relevant if a future artifact is rebuilt.

Required before inclusion:

- Product Owner assigns ownership.
- Build&Test receives explicit spec/handoff.
- Implementation report and tests are recorded.

### Group E - Excluded Pages Stats-v1 Changes

Status: exclude from V1-minimal CWS release consideration.

Files:

- `pages/index.html`
- `tests/unit/pages-config-v12-fields.test.js`

Reason:

- Cloudflare Pages/admin-console source is outside the CWS extension artifact.
- No Pages deploy is authorized for V1-minimal close-out.
- Build&Test classified these as excluded from V1-minimal release consideration.

Recommended later route:

- Separate Pages/stats-v1 task if Product Owner still wants this work.

### Group F - General Docs / Changelog

Status: needs owner review before commit grouping.

Files:

- `docs/CHANGELOG.md`

Reason:

- It is modified, but this audit did not inspect whether it belongs with release docs, CWS evidence, or another prior task.

Recommended action:

- Product&Project Mg or Product Owner reviews this file before commit set planning.

## Proposed Commit Set Plan

No commit is approved by this audit.

If Product Owner later chooses to organize local commits, recommended order:

| Commit set | Include | Exclude |
|---|---|---|
| `docs: add codex three-role workflow` | Group A only | product/test files, release-specific evidence if Product Owner wants smaller commits |
| `docs: record v1-minimal release closeout state` | Group B only | product/test code, unknown hold files |
| `test/fix: align cws least-permission mode timing coverage` | Group C only, after PO commit approval | Groups D/E/F |
| hold/no commit | Group D | all release-ready claims |
| separate later task | Group E | V1-minimal CWS release set |
| review before grouping | Group F | none until owner decides |

## Push / Tag / Release Blockers

Push/tag/release remain blocked because:

1. Remote truth has not been verified with `git fetch`.
2. Product Owner has not approved push/tag.
3. ReleaseMg readiness remains `BLOCKED / NOT READY FOR PUBLIC RELEASE`.
4. CWS review status remains recorded as `待审核`.
5. Production-profile readonly smoke is incomplete.
6. Windows/macOS real Chrome smoke is not closed for V1-minimal.
7. `admin/admin.js` and `bind.js` remain `Unknown / hold`.
8. The verified CWS least-permission package is not yet approved for commit/rebuild/release evidence use.

## Remote Consistency

This audit does not verify GitHub or remote branch state.

Before any push/tag/merge decision, run a separate authorized remote check, at minimum:

```powershell
git fetch origin
git status --short --branch
git log --oneline --decorate --max-count=5
```

No remote operation was performed in this audit.

## Product Owner Decisions Required

1. Whether to commit local docs in separated commit sets.
2. Whether to commit, hold, or later rebuild from the verified CWS least-permission package.
3. Whether to assign or keep holding `admin/admin.js` and `bind.js`.
4. Whether to route Pages stats-v1 changes to a separate task.
5. Whether to authorize a remote consistency check with `git fetch origin`.
6. Whether and when to approve push/tag.

## Result

Status: `LOCAL GIT AUDIT COMPLETE / REMOTE NOT VERIFIED / PUSH TAG BLOCKED`

No code was modified.

No tests were run.

No files were staged or committed.

No release, tag, push, merge, fetch, checkout, reset, stash, package rebuild, CWS action, Chrome profile mutation, storage write, cloud write, or D1 write was performed.
