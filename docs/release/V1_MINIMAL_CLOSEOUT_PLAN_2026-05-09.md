# V1-minimal Close-Out Plan - 2026-05-09

## Purpose

This is the docs-only close-out plan for the V1-minimal release candidate.

It converts the current project state into a decision-ready board for Product&Project Mg, Build&Test, releaseMg, and Product Owner.

This plan does not execute release gates, inspect Chrome profiles, run tests, modify code, modify package files, publish, tag, push, merge, deploy, migrate, or modify storage/cloud/D1 data.

## Current Decision Snapshot

| Area | Current state |
|---|---|
| V0 | Internal stabilization baseline, frozen, evidence retained |
| Active release target | V1-minimal release candidate |
| Version | `1.7.2` |
| Source release artifact | `dist/v1-minimal-20260509-023832/timeonchrome-v1.7.2-v1-minimal.zip` |
| Source release artifact SHA256 | `A0A5C541A5A7D047E040D2163BF8735971798112E18E1D223BB9D55D80D7190B` |
| CWS reduced-permission artifact | `dist/cws-resubmit-20260509-122919/timeonchrome-v1.7.2-cws-resubmit-minimal-permissions.zip` |
| CWS reduced-permission SHA256 | `BE0F712285B6661C293175C649DDDC48E0D04217B18626EB3C284EEAB32DD71C` |
| Chrome Web Store | `TimeOnChrome 1.7.2` submitted / `待审核` |
| Public release | Not completed |
| Git push/tag | Not completed; requires separate Product Owner approval |
| releaseMg production acceptance | `PARTIAL / NOT CLOSED` |
| Current release recommendation | `NOT READY FOR PUBLIC RELEASE` |

## Source Documents

releaseMg and Product Owner should use these as the current close-out packet:

- `PROJECT_MASTER.md`
- `TASK_BOARD.md`
- `DECISIONS.md`
- `docs/audits/DOCS_CONSISTENCY_AUDIT_2026-05-09.md`
- `docs/audits/WORKTREE_STATUS_INVENTORY_2026-05-09.md`
- `docs/audits/WORKTREE_OWNERSHIP_AUDIT_2026-05-09.md`
- `docs/release/V1_MINIMAL_PRODUCT_OWNER_DECISION_BRIEF_2026-05-09.md`
- `docs/release/V1_MINIMAL_RELEASE_GATE_MATRIX_2026-05-09.md`
- `docs/releases/v1-minimal-release-2026-05-09.md`
- `docs/releases/chrome-web-store-submission-v1-minimal-2026-05-09.md`
- `docs/releases/releasemg-production-acceptance-2026-05-09.md`
- `docs/releases/releasemg-readiness-v1-minimal-2026-05-09.md`
- `docs/releases/v1-minimal-core-acceptance-coverage-2026-05-09.md`
- `docs/handoffs/outbox/HANDOFF-v1-minimal-worktree-ownership-to-build-test.md`
- `docs/handoffs/outbox/HANDOFF-v1-minimal-closeout-to-releasemg.md`

## P0 Close-Out Board

| ID | Blocker / work item | Current status | Owner | Required evidence | Done condition |
|---|---|---|---|---|---|
| P0-1 | Working tree ownership inventory and audit | Inventory and Build&Test audit recorded; PO decisions remain open | Product&Project Mg / Build&Test / Product Owner | `docs/audits/WORKTREE_STATUS_INVENTORY_2026-05-09.md`; `docs/audits/WORKTREE_OWNERSHIP_AUDIT_2026-05-09.md` | Product Owner resolves `admin/admin.js` and `bind.js` `Unknown / hold`, confirms Pages stats-v1 exclusion/routing, and decides commit/hold/rebuild handling for the Build&Test CWS least-permission package. |
| P0-2 | V1-minimal gate matrix | releaseMg readonly classification completed; result blocked | releaseMg | `docs/release/V1_MINIMAL_RELEASE_GATE_MATRIX_2026-05-09.md`; `docs/releases/releasemg-readiness-v1-minimal-2026-05-09.md` | Remaining blockers are preserved; no deferred/known-risk item is rewritten as pass. |
| P0-3 | Production-profile readonly smoke | `PARTIAL / NOT CLOSED` | releaseMg / Product Owner | Functional smoke may continue against visible unpacked/local-load ID `flnneafdppomlhgciohadpdfmhkkkkpp` if enabled/version `1.7.2`, popup-core, and bind-sync are verified. CWS installed-ID parity is `BLOCKED_BY_CWS_REVIEW / NOT YET APPLICABLE` until the CWS item is approved and installable. | Functional smoke `PASS`; CWS installed-ID parity deferred by review state; or `DEFERRED`, `WAIVED`, or `RISK ACCEPTED` with correct approval semantics. |
| P0-4 | macOS + Windows real Chrome smoke | Not closed for V1-minimal | releaseMg / Product Owner | Smoke evidence, or explicit PO defer/waiver for V1-minimal public release | Both environments classified as `PASS`, `DEFERRED`, or `WAIVED`. |
| P0-5 | CWS status follow-up | Submitted / `待审核` in docs | releaseMg / Product Owner | Current dashboard status recorded by releaseMg without private account data | Status is verified before final readiness; public release remains blocked until PO decision. |
| P0-6 | Release readiness report | Completed; `BLOCKED / NOT READY FOR PUBLIC RELEASE` | releaseMg | `docs/releases/releasemg-readiness-v1-minimal-2026-05-09.md` | Product Owner reviews blocker list and decides completion/defer/waiver/hold paths. |
| P0-7 | Public release decision | Not made | Product Owner | releaseMg readiness report and CWS status | PO decides `Ship`, `Hold`, `Defer`, or `Risk accepted`. |
| P0-8 | Git push/tag decision | Not approved | Product Owner | Clean enough release scope, commit plan, tag plan, and PO approval | Explicit PO approval before any push/tag/merge. |

## P1 After V1-minimal

| Item | Owner | Notes |
|---|---|---|
| Stats Storage Foundation controlled rollout | Product Owner / Build&Test / releaseMg | Requires separate PO approval; do not fold into V1-minimal close-out. |
| Composite routing design and split | Product&Project Mg / Build&Test | Post V1-minimal design track. |
| More precise classification model | Product&Project Mg | Product model work; ChatGPT escalation is appropriate if architecture/product boundary is unclear. |
| Child-facing admin/terminal Stage 2 physical split | Product&Project Mg / Build&Test | Product decision still needed. |
| PiP cleanup permission alignment | Build&Test | Non-docs implementation task; requires approved spec/handoff. |
| CWS review follow-up / listing lifecycle | releaseMg / Product Owner | Depends on CWS review outcome. |

## P2 Later

| Item | Owner | Notes |
|---|---|---|
| Time borrowing redesign | Product&Project Mg | Original requirement preserved; current runtime/UI borrow path excluded from V1-minimal. |
| D-015 appeal/review semantics finalization | Product Owner | Product-language decision. |
| Late-night rest limit | Product&Project Mg | Future product design. |
| Admin CSP warning | Build&Test | Known admin-page warning; not a V1-minimal close-out blocker unless releaseMg reclassifies. |
| Reminder double-slider copy/layout improvement | Build&Test | UI improvement; not current release blocker. |
| Device-lost email notification plan | Product&Project Mg | Future notification strategy. |
| Legacy stats cleanup/migration | Product Owner / Build&Test / releaseMg | Explicitly out of V1-minimal; requires separate rollback/migration plan. |

## Role Routing

| Situation | Route to | Rule |
|---|---|---|
| Release gate execution or readiness recommendation | releaseMg | Must follow `docs/agents/ReleaseMg.md`. |
| Dirty product/test ownership classification | Build&Test / Product Owner | Build&Test audit is complete. Product&Project Mg may document status only; Product Owner must resolve open ownership decisions. |
| Scope, docs, handoff, board alignment | Product&Project Mg | Docs-only only unless PO changes role boundary. |
| Final release, public release, risk acceptance, git push/tag | Product Owner | No agent may decide this. |
| Disputed blocker semantics or major risk acceptance | ChatGPT as external advisor | Advisory only; does not replace Product Owner or releaseMg. |

## Required Handoff

Use:

```text
docs/handoffs/outbox/HANDOFF-v1-minimal-closeout-to-releasemg.md
docs/handoffs/outbox/HANDOFF-v1-minimal-worktree-ownership-to-build-test.md
```

The releaseMg handoff asks releaseMg to:

1. Verify or classify remaining V1-minimal release-management gates.
2. Preserve `PASS`, `PARTIAL`, `BLOCKED`, `DEFERRED`, `WAIVED`, and `KNOWN_RISK` semantics.
3. Produce a final release readiness report.
4. Identify Product Owner decisions required before public release.

The Build&Test handoff asks Build&Test to:

1. Classify dirty product/test working-tree changes.
2. Identify release relevance without changing code or tests.
3. Produce an ownership audit report.
4. Return Product Owner decisions needed before release close-out.

## Acceptance Criteria For This Plan

- P0 blockers are listed with owner and evidence requirements.
- Public release and git push/tag remain Product Owner decisions.
- V0 baseline and V1-minimal release target remain separate.
- Dirty working tree is recorded as a release-governance risk, not accepted release evidence.
- releaseMg is given a standard handoff path.
- Build&Test is given a standard handoff path for dirty product/test ownership classification.
- Product Owner decision brief is available.
- No code or tests are modified.
- No tests or release gates are run.

## Current Recommendation

releaseMg bounded readonly classification is complete.

Recorded recommendation:

```text
BLOCKED / NOT READY FOR PUBLIC RELEASE
```

Do not proceed to public release, tag, push, merge, CWS action, Chrome profile mutation, storage/cloud/D1 write, or code/test change unless Product Owner gives explicit approval in that later session.

## Product Owner Decisions Needed Next

1. Continue functional production-profile smoke against the visible unpacked TimeOnChrome instance; defer CWS installed-ID parity until CWS review approval makes the public item installable.
2. Complete, waive, or defer macOS + Windows real Chrome smoke for V1-minimal public release.
3. Decide whether releaseMg should wait for CWS review result before final readiness.
4. Decide how to handle Build&Test worktree audit findings:
   - `admin/admin.js` and `bind.js`: assign owner / hold / exclude / authorize formal implementation package.
   - `pages/index.html` and `tests/unit/pages-config-v12-fields.test.js`: keep excluded from V1-minimal or route to a separate Pages/stats-v1 task.
   - CWS least-permission/timing cleanup package: commit, hold, or rebuild into any future artifact.
5. Decide whether Build&Test should run verification tests after the ownership audit.
6. Decide whether and when git push/tag may happen after readiness report.

Decision brief:

```text
docs/release/V1_MINIMAL_PRODUCT_OWNER_DECISION_BRIEF_2026-05-09.md
```

## Result

Status: `CLOSE-OUT PLAN READY / RELEASE NOT READY`

No product code was modified.

No test code was modified.

No tests were run.

No release, tag, push, merge, CWS action, Chrome profile mutation, storage write, cloud write, or D1 write was performed.
