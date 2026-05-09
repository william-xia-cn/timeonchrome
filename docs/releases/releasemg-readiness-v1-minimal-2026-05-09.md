# V1-minimal Release Readiness Report - 2026-05-09

Prepared by: `releaseMg`

Scope: bounded readonly release readiness classification only

## Release Identity

| Item | Value |
|---|---|
| Product | TimeOnChrome |
| Release target | V1-minimal release candidate |
| Version | `1.7.2` |
| Branch / HEAD | `master` / `2260943 docs: refresh v1-minimal release readiness` |
| Remote state | `master` and `origin/master` are synchronized after `git fetch origin`; ahead/behind `0/0` |
| Manifest | `1.7.2`, reduced permissions match current CWS remediation source state |
| Public release | Not completed |
| Git push | Completed for current local commits; no further push approval is implied |
| Git tag | Not approved |

## Overall Recommendation

Status: `BLOCKED / NOT READY FOR PUBLIC RELEASE`

V1-minimal has strong core gate evidence and the reduced-permission CWS package is submitted / `待审核`. Product Owner selected artifact strategy A: the already-submitted CWS package remains the active review artifact, while current `origin/master` is the source follow-up line. After the latest push, local `master` and `origin/master` are synchronized and the working tree is clean. Production-profile functional smoke is closed as `PASS_WITH_MANUAL_EVIDENCE`: installed/version/enabled, popup-core, borrowing disabled, and bind-sync have Product Owner manual visual evidence. Windows/macOS informal smoke is also closed as `PASS_WITH_MANUAL_EVIDENCE`. CWS installed-ID parity is `BLOCKED_BY_CWS_REVIEW / NOT YET APPLICABLE` because the CWS item is still under review and cannot yet be installed as the public item. Final release readiness is still blocked by CWS review not complete and no Product Owner public release / tag approval.

## Artifact Strategy Decision

Product Owner selected `Strategy A` on 2026-05-09.

- Active CWS review artifact: `dist/cws-resubmit-20260509-122919/timeonchrome-v1.7.2-cws-resubmit-minimal-permissions.zip`
- Active CWS review artifact SHA256: `BE0F712285B6661C293175C649DDDC48E0D04217B18626EB3C284EEAB32DD71C`
- Current `origin/master`: source follow-up line, not automatically claimed as the already-submitted CWS artifact.
- Rebuild/package/resubmission: not approved unless CWS requires it or Product Owner later approves.
- Decision record: `DECISIONS.md:D-039`

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
| Windows/macOS informal real Chrome smoke | PASS_WITH_MANUAL_EVIDENCE | Product Owner report; `TASK_BOARD.md` | Non-formal manual smoke has been completed and is sufficient for the current personal/small-team first-release stage. This is not automated lab evidence. |
| Production-profile functional smoke | PASS_WITH_MANUAL_EVIDENCE | ReleaseMg production acceptance report; `docs/releases/releasemg-production-smoke-blocked-2026-05-09.md` | Installed/version/enabled, popup-core, borrowing disabled, and bind-sync are covered by Product Owner manual visual evidence. Repo records do not transcribe the visible short device ID. CWS installed-ID parity remains `BLOCKED_BY_CWS_REVIEW / NOT YET APPLICABLE`. |
| Evidence privacy | PASS for existing report; required again before final | ReleaseMg production report | Existing report is redacted; final readiness still needs privacy review if new evidence is added. |
| Worktree / remote consistency | PASS for repository hygiene; STRATEGY A for artifact parity | `git fetch origin`; `git status --short --branch`; `git rev-list --left-right --count master...origin/master`; D-039 | Current working tree is clean and `master == origin/master`. Current source HEAD includes follow-up commits after the submitted CWS package; by PO decision, the submitted CWS package remains the active review artifact and current `origin/master` is the source follow-up line. |
| Public release | BLOCKED | `PROJECT_MASTER.md`, `TASK_BOARD.md` | CWS still `待审核`; no PO `Ship` decision. |
| Git tag | BLOCKED | `TASK_BOARD.md`; this refresh | Requires separate explicit Product Owner approval. |

## Acceptance Test Results

No acceptance tests were run in this session.

Existing evidence says automated/core coverage is broadly sufficient for V1-minimal timing, video/PiP, mode switching, Cloud Stats v1, popup/admin basics, and borrowing-disabled scope control. The remaining gap is release-management closure, not mainly missing automated product tests.

## Blockers

| Blocker | Severity | Owner | Required next action |
|---|---|---|---|
| CWS review not complete | P0 | Product Owner / releaseMg | Wait for CWS outcome or record current dashboard state before next decision. |
| Public release decision absent | P0 | Product Owner | Explicit `Ship / Hold / Defer / Risk accepted` decision required. |
| Git tag not approved | P0 | Product Owner | Separate approval required before tag. |

## Waivers / Deferrals / Risks

| Item | State | Why |
|---|---|---|
| Production functional smoke | PASS_WITH_MANUAL_EVIDENCE | Installed/version/enabled, popup-core, borrowing disabled, and bind-sync have Product Owner manual visual evidence. |
| CWS installed-ID parity | BLOCKED_BY_CWS_REVIEW / NOT YET APPLICABLE | The CWS item is still `待审核`, so the public CWS item cannot yet be installed and checked for installed-ID parity. |
| Windows/macOS informal smoke | PASS_WITH_MANUAL_EVIDENCE | Non-formal manual smoke completed; accepted for the current lightweight release process. |
| Recovery/System | PASS_WITH_MANUAL_EVIDENCE | Operator-confirmed, not fully automated. |
| Artifact parity | STRATEGY A / KNOWN CONSTRAINT | Submitted CWS package is active review artifact; current `origin/master` is source follow-up line and must not be described as the already-reviewed artifact unless rebuilt/resubmitted later. |
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

1. Decide whether to wait for CWS review result before further close-out.
2. Separately approve or reject public release and git tag.

## Out-Of-Scope Confirmation

No files were modified by releaseMg.

No tests were run.

No commit, push, tag, package rebuild, Chrome profile action, Cloud/D1 write, Worker deploy, CWS upload, or CWS submit was performed by this releaseMg refresh.

## Refresh After Push - 2026-05-09

Readonly refresh commands:

- `git fetch origin`
- `git status --short --branch`
- `git log --oneline --decorate -5`
- `git log --oneline --decorate -5 origin/master`
- `git rev-list --left-right --count master...origin/master`
- `git diff --name-status master..origin/master`

Observed state:

- `master` and `origin/master` are synchronized.
- Ahead/behind count is `0 0`.
- `git diff --name-status master..origin/master` is empty.
- `git status --short --branch` shows no dirty tracked or untracked files; only the user-level global git ignore permission warning was emitted.
- Current HEAD is `2260943 docs: refresh v1-minimal release readiness`.

Updated readiness classification:

| Area | Refreshed result | Notes |
|---|---|---|
| Repository hygiene after push | PASS | Local branch and `origin/master` match; working tree is clean. |
| Prior dirty worktree blocker | CLOSED AS WORKTREE HYGIENE | The prior dirty/uncommitted state is no longer present after push. |
| Artifact parity vs current source | STRATEGY A / KNOWN CONSTRAINT | Product Owner selected Strategy A: the submitted CWS package remains the active review artifact; current `origin/master` is source follow-up only. This refresh did not rebuild or resubmit from current HEAD. |
| CWS status | PARTIAL / BLOCKED | Recorded state remains submitted / `待审核`; no live CWS action was performed in this refresh. |
| Production functional smoke | PASS_WITH_MANUAL_EVIDENCE | Later Product Owner visual evidence closed installed/version/enabled, popup-core, borrowing disabled, and bind-sync for the unpacked/local-load instance; CWS installed-ID parity remains deferred until CWS review approval. |
| Windows/macOS informal smoke | PASS_WITH_MANUAL_EVIDENCE | Non-formal manual smoke completed and accepted for current lightweight process. |
| Public release | BLOCKED | Requires CWS review outcome and explicit Product Owner decision. |
| Git tag | BLOCKED | Requires separate Product Owner approval. |

The release recommendation remains:

```text
BLOCKED / NOT READY FOR PUBLIC RELEASE
```
