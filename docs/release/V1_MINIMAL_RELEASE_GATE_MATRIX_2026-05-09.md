# V1-minimal Release Gate Matrix - 2026-05-09

## Purpose

This is the V1-minimal release gate matrix for release close-out planning. It consolidates current documented evidence and remaining release-management work.

This document does not execute gates, verify live Chrome Web Store state, inspect Chrome profiles, run tests, publish, tag, push, merge, deploy, migrate, or modify production/cloud data.

## Release Identity

| Item | Value |
|---|---|
| Product | TimeOnChrome |
| Version | `1.7.2` |
| Release line | V1-minimal release candidate |
| Source release artifact | `dist/v1-minimal-20260509-023832/timeonchrome-v1.7.2-v1-minimal.zip` |
| Source release artifact SHA256 | `A0A5C541A5A7D047E040D2163BF8735971798112E18E1D223BB9D55D80D7190B` |
| CWS reduced-permission artifact | `dist/cws-resubmit-20260509-122919/timeonchrome-v1.7.2-cws-resubmit-minimal-permissions.zip` |
| CWS reduced-permission artifact SHA256 | `BE0F712285B6661C293175C649DDDC48E0D04217B18626EB3C284EEAB32DD71C` |
| Current CWS status | Submitted / `待审核` |
| Public release | Not completed |
| Git push/tag | Blocked pending separate Product Owner approval |

## Gate Status Vocabulary

- `PASS`: documented evidence satisfies the gate for current V1-minimal planning.
- `PASS_WITH_MANUAL_EVIDENCE`: documented operator/Product Owner evidence satisfies the gate, but it is not fully automated.
- `PARTIAL`: meaningful evidence exists, but final release close-out still needs more evidence.
- `BLOCKED`: prerequisite unavailable; meaningful gate completion cannot happen yet.
- `DEFERRED`: not completed in this release-management pass and not represented as a Product Owner waiver.
- `WAIVED`: Product Owner explicitly accepts not completing the item.
- `OUT_OF_SCOPE`: explicitly outside V1-minimal.
- `KNOWN_RISK`: accepted or documented risk; must not be rewritten as `PASS`.

## Gate Matrix

| Gate | Current status | Evidence | Remaining action | Owner |
|---|---|---|---|---|
| Release scope and identity | PASS | `PROJECT_MASTER.md`; `TASK_BOARD.md`; `docs/releases/v1-minimal-release-2026-05-09.md` | Keep V0 baseline and V1-minimal target separate. | Product&Project Mg |
| Source artifact verification | PASS | `docs/releases/v1-minimal-release-2026-05-09.md`; SHA256 recorded | Treat SHA256 as primary identity. Size discrepancy has been normalized in project docs to release-record value. | releaseMg |
| CWS reduced-permission artifact | PARTIAL | `docs/releases/releasemg-production-acceptance-2026-05-09.md`; `docs/releases/chrome-web-store-submission-v1-minimal-2026-05-09.md` | releaseMg should re-check CWS dashboard status before final readiness report. | releaseMg |
| CWS permission justification | PASS for docs cleanup | `docs/releases/chrome-web-store-submission-v1-minimal-2026-05-09.md` | Build&Test may later verify manifest/package permission parity only if PO authorizes non-docs audit. | Product&Project Mg / Build&Test later |
| Public release status | BLOCKED | `PROJECT_MASTER.md`; `TASK_BOARD.md`; CWS status `待审核` | Wait for CWS review state and Product Owner public release decision. | Product Owner |
| Cloud Stats v1 minimal sync | PASS | `PROJECT_MASTER.md`; `DECISIONS.md:D-035`; `docs/releases/v1-minimal-release-2026-05-09.md` | Preserve legacy stats duplicate risk as known risk. | releaseMg |
| Time borrowing disabled | PASS | `DECISIONS.md:D-034`; `PROJECT_MASTER.md`; `TASK_BOARD.md` | Keep borrowing out of V1-minimal; redesign post V1-minimal. | Product&Project Mg |
| Recovery/System evidence | PASS_WITH_MANUAL_EVIDENCE | `PROJECT_MASTER.md`; D-036 | Do not rewrite manual evidence as fully automated PASS. | releaseMg |
| Mode transition prompt and PiP cleanup | PASS | `PROJECT_MASTER.md`; D-037; `docs/releases/v1-minimal-core-acceptance-coverage-2026-05-09.md` | Must-run regression remains listed in `TASK_BOARD.md` for future mode-transition changes. | Build&Test / releaseMg |
| Windows/macOS real Chrome smoke | PARTIAL / DEFERRED | `TASK_BOARD.md` pending items; prior accepted V0 risk does not equal V1-minimal PASS | Complete smoke or obtain explicit Product Owner waiver/defer for V1-minimal public release. | releaseMg / Product Owner |
| Production-profile readonly smoke | BLOCKED / PARTIAL | `docs/releases/releasemg-production-acceptance-2026-05-09.md` | Verify installed extension, popup core, bind/sync state on a profile where TimeOnChrome is installed/enabled, or record explicit Product Owner waiver/defer. | releaseMg / Product Owner |
| Evidence privacy | PARTIAL | `docs/agents/ReleaseMg.md`; `docs/releases/releasemg-production-acceptance-2026-05-09.md` | Final readiness report must include evidence privacy review. | releaseMg |
| Legacy cloud stats cleanup | OUT_OF_SCOPE / KNOWN_RISK | `PROJECT_MASTER.md`; D-035 | Do not perform cleanup/migration in V1-minimal. | Product Owner later |
| Full V1 model / AI classification / composite routing | OUT_OF_SCOPE | `PROJECT_MASTER.md`; `TASK_BOARD.md` | Keep out of V1-minimal. | Product&Project Mg later |
| Git push/tag | BLOCKED | `PROJECT_MASTER.md`; `TASK_BOARD.md` | Requires separate Product Owner approval. | Product Owner |

## Required Product Owner Decisions

1. Whether to complete or waive/defer production-profile readonly smoke before public release.
2. Whether to complete macOS + Windows real Chrome smoke before public release.
3. Whether to wait for CWS review result before any further release close-out work.
4. Whether and when to approve git push/tag.
5. Whether to authorize any non-docs Build&Test package/manifest parity audit.

## Recommended releaseMg Handoff

releaseMg should use this matrix plus:

- `docs/agents/ReleaseMg.md`
- `docs/release/RELEASE_CHECKLIST.md`
- `docs/release/RELEASE_GATE_REPORT_TEMPLATE.md`
- `docs/releases/releasemg-production-acceptance-2026-05-09.md`
- `docs/releases/v1-minimal-release-2026-05-09.md`
- `docs/releases/chrome-web-store-submission-v1-minimal-2026-05-09.md`

The releaseMg task should be limited to release-management verification and reporting unless Product Owner explicitly approves broader action.

## Current Recommendation

Status: `NOT READY FOR PUBLIC RELEASE`

Reason:

- CWS review is still recorded as `待审核`.
- Production-profile readonly smoke is `PARTIAL / NOT CLOSED`.
- Windows/macOS real Chrome smoke is not closed for V1-minimal.
- Product Owner has not approved public release, git push, or tag.

