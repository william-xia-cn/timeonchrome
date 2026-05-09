# V1-minimal Product Owner Decision Brief - 2026-05-09

## Purpose

This brief lists the Product Owner decisions needed to move V1-minimal from close-out planning into releaseMg readiness review and, later, public release decision.

This is docs-only. It does not approve release, tag, push, merge, CWS action, tests, Chrome profile changes, storage/cloud/D1 writes, or code changes.

## Current State

| Area | State |
|---|---|
| Active target | V1-minimal release candidate |
| Version | `1.7.2` |
| CWS package | Reduced-permission package submitted |
| CWS status | `待审核` |
| Public release | Not completed |
| releaseMg readiness | `BLOCKED / NOT READY FOR PUBLIC RELEASE`; report recorded in `docs/releases/releasemg-readiness-v1-minimal-2026-05-09.md` |
| Worktree | Dirty; Build&Test ownership audit recorded; Product Owner decisions remain open |
| Product&Project Mg proposal | `docs/release/V1_MINIMAL_PO_DECISION_PROPOSAL_2026-05-09.md` |
| Current recommendation | `NOT READY FOR PUBLIC RELEASE` |

## Decision Set A - ReleaseMg Close-Out Scope

| Decision | Options | Recommended default |
|---|---|---|
| Production-profile readonly smoke | Authorize releaseMg readonly smoke / Defer / Waive | Authorize readonly smoke if a suitable installed/enabled TimeOnChrome profile is available; otherwise record explicit defer. |
| macOS + Windows real Chrome smoke | Complete both / Defer one or both / Waive one or both | Defer only with explicit risk acceptance; do not silently inherit V0 accepted risk as V1-minimal PASS. |
| CWS status follow-up | Verify now / Wait for review result | Verify current dashboard status before final readiness report; public release still waits for PO decision. |
| releaseMg final report timing | Completed readonly classification / Additional evidence pass later | Readiness report is recorded as `BLOCKED / NOT READY FOR PUBLIC RELEASE`. |

## Decision Set B - Working Tree Ownership

| Decision | Options | Recommended default |
|---|---|---|
| `admin/admin.js`, `bind.js` | Keep `Unknown / hold` / assign owner / authorize formal implementation package / exclude from V1-minimal source evidence | Keep as `Unknown / hold` until Product Owner decides. |
| `pages/index.html`, `tests/unit/pages-config-v12-fields.test.js` | Keep excluded from V1-minimal / route to separate Pages stats-v1 task | Keep excluded from V1-minimal CWS release consideration. |
| CWS least-permission/timing cleanup package | Commit / hold / rebuild into future artifact / request verification tests | Hold until Product Owner decides whether this dirty package becomes accepted implementation evidence. |
| Tests after ownership audit | No tests / minimal tests / broader regression | No tests have been run. Decide tests only if using the Build&Test package as evidence. |

## Decision Set C - Public Release And Git

| Decision | Current status | Required before action |
|---|---|---|
| Public release | Blocked | CWS review state known, releaseMg readiness report complete, Product Owner explicit `Ship` decision. |
| Git push | Blocked | Separate Product Owner approval after deciding what belongs in the commit set. |
| Git tag | Blocked | Separate Product Owner approval after readiness and version/tag plan are accepted. |
| Merge | Blocked | Separate Product Owner approval. |

## Recommended Next Execution Order

1. Product Owner reviews `docs/releases/releasemg-readiness-v1-minimal-2026-05-09.md`.
2. Product Owner resolves or explicitly leaves open the Build&Test audit findings.
3. Product Owner decides whether to complete/defer/waive production-profile readonly smoke and Windows/macOS smoke.
4. Product Owner decides `Ship / Hold / Defer / Risk accepted` after blockers are resolved or accepted.
5. Product Owner separately decides git push/tag.

## Non-Decisions

The following remain not approved by this brief:

- product code changes;
- test code changes;
- package rebuild;
- CWS upload or submit;
- public release;
- git push/tag/merge;
- Chrome profile mutation;
- storage/cloud/D1 writes;
- treating deferred or waived items as pass.

## Result

Status: `PO DECISION BRIEF READY / NO APPROVAL IMPLIED`

No code was modified.

No tests were run.

No release, tag, push, merge, CWS action, Chrome profile mutation, storage write, cloud write, or D1 write was performed.
