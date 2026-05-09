# V1-minimal Release Readiness Report - 2026-05-09

Prepared by: `releaseMg`

Scope: bounded readonly release readiness classification only

## Release Identity

| Item | Value |
|---|---|
| Product | TimeOnChrome |
| Release target | V1-minimal release candidate |
| Version | `1.7.2` |
| Branch / HEAD | `master` / `e3f6239 chore: align manifest with CWS permission review` |
| Manifest | `1.7.2`, reduced permissions match current CWS remediation source state |
| Public release | Not completed |
| Git push/tag | Not approved |

## Overall Recommendation

Status: `BLOCKED / NOT READY FOR PUBLIC RELEASE`

V1-minimal has strong core gate evidence and the reduced-permission CWS package is submitted / `待审核`, but final release readiness is still blocked by incomplete production-profile readonly smoke, unresolved dirty working-tree ownership decisions, CWS review not complete, and no Product Owner public release / push / tag approval.

## Execution Scope

Readonly classification only.

No acceptance tests were run in this session. No Chrome profile, storage, Cloud, D1, CWS, package, product code, or test code was touched.

## Gate Results

| Gate | Result | Evidence | Notes |
|---|---|---|---|
| Release identity / scope | PASS | `PROJECT_MASTER.md`, release record, manifest | V1-minimal `1.7.2`; V0 remains internal baseline. |
| Source artifact verification | PASS | `docs/releases/v1-minimal-release-2026-05-09.md` | Source artifact SHA recorded; package verification recorded. |
| CWS reduced-permission package | PARTIAL | CWS record + ReleaseMg production report | Submitted package recorded, SHA recorded, status `待审核`; review not complete. |
| Current manifest permissions | PASS | `manifest.json` | Removed rejected `management` / `scripting`; current permissions align with reduced-permission record. |
| Cloud Stats v1 minimal sync | PASS | `PROJECT_MASTER.md`, D-035, coverage matrix | `usage_segments_v1` + `stats_v1` are release truth path. |
| Recovery/System gate | PASS_WITH_MANUAL_EVIDENCE | D-036, release record | Manual/operator evidence preserved; not fully automated PASS. |
| Mode transition / PiP / prompt gates | PASS | D-020, D-037, coverage matrix | Core behavior covered; some dirty test/source follow-up remains uncommitted. |
| Time borrowing exclusion | PASS | D-034, release record | Disabled/deferred; not active V1-minimal feature. |
| Legacy cloud stats cleanup | OUT_OF_SCOPE / KNOWN_RISK | D-035, release docs | Must remain known risk, not PASS. |
| Windows/macOS real Chrome smoke | DEFERRED / PARTIAL | `TASK_BOARD.md`, gate matrix | Not closed for V1-minimal; needs completion or explicit PO defer/waive. |
| Production-profile readonly smoke | BLOCKED / PARTIAL | ReleaseMg production acceptance report | Installed/enabled/version, popup-core, bind-sync not fully verified. |
| Evidence privacy | PASS for existing report; required again before final | ReleaseMg production report | Existing report is redacted; final readiness still needs privacy review if new evidence is added. |
| Dirty worktree ownership | BLOCKED for final readiness | Worktree inventory + ownership audit + CWS least-permission report + minimum verification report | `admin/admin.js` / `bind.js` remain `Unknown / hold`; Pages stats-v1 remains excluded; CWS least-permission package has implementation report and minimum verification passed, but remains dirty/uncommitted and no package rebuild or release action is approved. |
| Public release | BLOCKED | `PROJECT_MASTER.md`, `TASK_BOARD.md` | CWS still `待审核`; no PO `Ship` decision. |
| Git push/tag | BLOCKED | `TASK_BOARD.md` | Requires separate explicit PO approval. |

## Acceptance Test Results

No acceptance tests were run in this session.

Existing evidence says automated/core coverage is broadly sufficient for V1-minimal timing, video/PiP, mode switching, Cloud Stats v1, popup/admin basics, and borrowing-disabled scope control. The remaining gap is release-management closure, not mainly missing automated product tests.

## Blockers

| Blocker | Severity | Owner | Required next action |
|---|---|---|---|
| Production profile readonly smoke incomplete | P0 | releaseMg / Product Owner | Verify installed/enabled/version, popup-core, bind-sync, or PO explicitly defer/waive. |
| CWS review not complete | P0 | Product Owner / releaseMg | Wait for CWS outcome or record current dashboard state before next decision. |
| Dirty extension-source files unresolved | P0 | Product Owner / Build&Test | Decide `admin/admin.js` and `bind.js`: hold, exclude, or formal implementation package. |
| Public release decision absent | P0 | Product Owner | Explicit `Ship / Hold / Defer / Risk accepted` decision required. |
| Git push/tag not approved | P0 | Product Owner | Separate approval required before push/tag. |
| Windows/macOS real Chrome smoke not closed | P1 | releaseMg / Product Owner | Complete, defer, or waive explicitly for V1-minimal. |

## Waivers / Deferrals / Risks

| Item | State | Why |
|---|---|---|
| Production smoke | BLOCKED / PARTIAL | TimeOnChrome not fully verified installed/enabled in production profile evidence. |
| Windows/macOS smoke | DEFERRED / PARTIAL | Not closed for V1-minimal. |
| Recovery/System | PASS_WITH_MANUAL_EVIDENCE | Operator-confirmed, not fully automated. |
| Legacy stats cleanup | KNOWN_RISK / OUT_OF_SCOPE | V1-minimal truth path is v1 stats; no cleanup/migration. |
| Time borrowing | DEFERRED / OUT_OF_SCOPE | Disabled for V1-minimal; redesign later. |
| Full V1 model / AI / composite routing | OUT_OF_SCOPE | Explicitly not part of V1-minimal. |

## Evidence Files Read

- `docs/release/V1_MINIMAL_RELEASE_GATE_MATRIX_2026-05-09.md`
- `docs/release/V1_MINIMAL_CLOSEOUT_PLAN_2026-05-09.md`
- `docs/audits/WORKTREE_STATUS_INVENTORY_2026-05-09.md`
- `docs/audits/WORKTREE_OWNERSHIP_AUDIT_2026-05-09.md`
- `docs/releases/v1-minimal-release-2026-05-09.md`
- `docs/releases/chrome-web-store-submission-v1-minimal-2026-05-09.md`
- `docs/releases/releasemg-production-acceptance-2026-05-09.md`
- `docs/releases/v1-minimal-core-acceptance-coverage-2026-05-09.md`
- `docs/handoffs/outbox/HANDOFF-v1-minimal-closeout-to-releasemg.md`

## Commands Run

- `git status --short`
- `git branch --show-current`
- `git log -1 --oneline`
- readonly `Get-Content` on the requested docs, `manifest.json`, and `package.json`

## Product Owner Decisions Required

1. Complete, defer, or waive production-profile readonly smoke.
2. Decide whether to wait for CWS review result before further close-out.
3. Resolve `admin/admin.js` / `bind.js` ownership or explicitly exclude them from release consideration.
4. Decide whether the Build&Test CWS least-permission/timing cleanup package should be committed, held, or used in a future rebuilt artifact after minimum verification passed.
5. Decide whether Windows/macOS smoke must be completed before public release.
6. Separately approve or reject public release, git push, and git tag.

## Out-Of-Scope Confirmation

No files were modified by releaseMg.

No tests were run.

No commit, push, tag, package rebuild, Chrome profile action, Cloud/D1 write, Worker deploy, CWS upload, or CWS submit was performed.
