> **ARCHIVED / Historical evidence only.** This file is preserved for audit/history and must not be used as the current product source of truth. Use `AGENTS.md`, `PROJECT_MASTER.md`, `TASK_BOARD.md`, `DECISIONS.md`, and the current authority documents instead.

# V1-minimal Core Acceptance Coverage Matrix - 2026-05-09

## Audit scope

This document audits whether V1-minimal core user scenarios are covered by automated tests, Gate.Test evidence, ReleaseMg production acceptance, or manual release evidence.

This is coverage audit only. It does not implement missing tests and does not change product code.

Source set:

- `AGENTS.md`
- `PROJECT_MASTER.md`
- `TASK_BOARD.md`
- `DECISIONS.md`
- `docs/MODE_TRANSITION_UX_V0.md`
- `docs/STATS_STORAGE_FOUNDATION.md`
- `docs/agents/ReleaseMg.md`
- `docs/SITE_ACCESS_POLICY.md`
- `manifest.json`
- `package.json`
- `tests/unit/`
- `tests/e2e/`
- `tests/system/sleep-wake-gate/reports/`
- `docs/releases/`

Status vocabulary:

- `PASS`: covered sufficiently for V1-minimal.
- `PASS_WITH_MANUAL_EVIDENCE`: covered by Product Owner or operator-confirmed evidence; not fully automated.
- `PARTIAL`: meaningful coverage exists, but an important dimension remains uncovered or evidence is split/stale.
- `MISSING`: no adequate evidence found.
- `BLOCKED`: cannot be audited or executed from available evidence.
- `OUT_OF_SCOPE`: explicitly outside V1-minimal.
- `KNOWN_RISK`: accepted risk; must not be rewritten as pass.

## Timing accuracy

| Area | Scenario | Status | Evidence | Automation level | Remaining gap | Release impact |
|---|---|---|---|---|---|---|
| Timing accuracy | Normal foreground browsing | PASS | `tests/e2e/duration-accuracy.test.js`; `tests/e2e/timing-trace-verify.test.js`; `tests/e2e/settlement-then-getstats.test.js`; `tests/unit/usage-segments.test.js`; `tests/unit/live-stats-flush.test.js` | E2E + UNIT | Real production-profile 30s smoke should still be run by ReleaseMg before final release acceptance. | Not a CWS resubmission blocker; final release evidence should include ReleaseMg smoke. |
| Timing accuracy | Video playback | PASS | `tests/e2e/video-playback-time-accounting.test.js`; `tests/e2e/video-playback-live-pip-fullscreen.test.js`; `docs/releases/v1-minimal-release-2026-05-09.md` Video Playback Accounting Gate | E2E | Natural media test can skip if browser media accrual is blocked by environment. | Acceptable for V1-minimal; rerun if video code changes. |
| Timing accuracy | Fullscreen video | PASS | `tests/e2e/video-playback-live-pip-fullscreen.test.js` checks fullscreen path when API is available | E2E | Browser/API availability controls whether fullscreen branch is exercised in a given environment. | Not blocker with current evidence; record environment in final ReleaseMg acceptance. |
| Timing accuracy | PiP video | PASS | `tests/unit/dual-track-semantics.test.js`; `tests/unit/aggregate-hardening.test.js`; `tests/unit/storage-aggregation-convergence.test.js`; `tests/unit/usage-segments.test.js`; `tests/e2e/video-playback-live-pip-fullscreen.test.js`; `tests/e2e/mode-switch-pip-close.test.js` | UNIT + E2E | Native PiP availability varies; fake PiP cleanup harness covers transition side effect. | Acceptable for V1-minimal. |
| Timing accuracy | Idle + media | PASS | `tests/unit/dual-track-semantics.test.js` covers idle + PiP/media classification; release record says idle + media no longer collapses to IDLE | UNIT | ReleaseMg can only smoke this lightly on production profile. | Not blocker. |
| Timing accuracy | Background media / audio | PASS | `tests/unit/dual-track-semantics.test.js`; `tests/unit/storage-legacy-shape-media-total.test.js`; `tests/unit/usage-segments.test.js`; `tests/e2e/video-playback-time-accounting.test.js` | UNIT + E2E | Real background audio on production profile not recorded as final evidence. | Not blocker; production smoke optional. |
| Timing accuracy | Popup current domain vs domain stats convergence | PASS | `tests/e2e/video-playback-live-pip-fullscreen.test.js` compares `GET_STATS`, `GET_STATS_RANGE`, `daily_usage_stats_v1`, and settled segments with 2-3s tolerance; `tests/e2e/popup-stats-message-route.test.js`; `tests/e2e/settlement-then-getstats.test.js` | E2E | Production profile convergence evidence is not yet in a ReleaseMg report. | Not blocker for CWS resubmission; include in final acceptance. |
| Timing accuracy | `GET_STATS` vs `GET_STATS_RANGE` | PASS | `tests/e2e/video-playback-live-pip-fullscreen.test.js` uses <=2s tolerance; `tests/e2e/admin-stats-summary.test.js`; `tests/e2e/popup-admin-composite-time.test.js` | E2E | Some admin-summary tests are shape/diagnostic rather than strict release gates. | Acceptable. |
| Timing accuracy | `daily_usage_stats_v1` vs `usage_segments_v1` | PASS | `tests/unit/usage-segments.test.js`; `tests/unit/stats-foundation-sync.test.js`; `tests/e2e/video-playback-live-pip-fullscreen.test.js` uses <=3s storage/API tolerance and daily <= segments + 3s guard | UNIT + E2E | None for V1-minimal core. | Clear. |
| Timing accuracy | No double counting after settlement | PASS | `tests/unit/live-stats-flush.test.js` repeated flush/alarm cases; `tests/unit/recovery-accuracy.test.js`; `tests/unit/usage-segments.test.js` idempotent settle/upload; `tests/e2e/settlement-then-getstats.test.js` second popup read <= first + 5s | UNIT + E2E | Production real-profile repeated popup/admin read smoke not yet recorded. | Not blocker. |

Timing tolerances observed:

- Synthetic/controlled unit and E2E reconciliation: often exact or 0s tolerance.
- `GET_STATS` vs `GET_STATS_RANGE`: <=2s in video live test.
- `daily_usage_stats_v1` vs API read: <=3s in video live test.
- Repeated live popup flush: second value no more than first + 5s in `settlement-then-getstats`.
- ReleaseMg production smoke should use 30s observation with 5-10s variance as documented in `docs/agents/ReleaseMg.md`.

## Mode switching accuracy

| Area | Scenario | Status | Evidence | Automation level | Remaining gap | Release impact |
|---|---|---|---|---|---|---|
| Mode switching | Study -> Rest | PASS | `tests/e2e/reminder-v0-validation.test.js` T-R3/T-R3b; `tests/unit/reminder-transition-v0.test.js`; Product Owner V0 manual evidence in `PROJECT_MASTER.md` | E2E + UNIT + MANUAL | Production-profile switch should be minimized or waived per ReleaseMg SOP. | Clear. |
| Mode switching | Rest -> Composite, 30s delay | PASS | `product/interceptor.js` constants show 30s; `tests/unit/interceptor-mode-transition-v0.test.js` uses 30_000; `DECISIONS.md:D-020`; `docs/MODE_TRANSITION_UX_V0.md` | UNIT | `tests/unit/mode-routing-matrix-v0.test.js` still contains older 60s Rest->Composite expectation/comment, so evidence has stale drift. | Not a blocker because must-run gate uses interceptor test, but should be cleaned post-audit. |
| Mode switching | Rest -> Study, 45s delay | PASS | `tests/unit/interceptor-mode-transition-v0.test.js` uses 45_000; `DECISIONS.md:D-020`; `docs/MODE_TRANSITION_UX_V0.md` | UNIT | Production-profile observation not recorded. | Clear. |
| Mode switching | Composite -> Study, 45s delay | PASS | `tests/unit/interceptor-mode-transition-v0.test.js` uses 45_000; `tests/e2e/mode-switch-prompt-lifecycle.test.js`; `DECISIONS.md:D-020` | UNIT + E2E | Production-profile observation not recorded. | Clear. |
| Mode switching | Popup-triggered switch with `noticeTabId` | PASS | `popup/popup.js` sends `noticeTabId`; `message-router.js` consumes it; `PROJECT_MASTER.md` records popup notice targeting close-out | CODE_AUDIT + MANUAL | No dedicated named test found that asserts popup `noticeTabId` end-to-end after the recent change. | Low risk; add focused test later if this path changes. |
| Mode switching | Automatic switch | PASS | `tests/unit/interceptor-mode-transition-v0.test.js`; `tests/e2e/mode-switch-prompt-lifecycle.test.js`; `tests/e2e/mode-switch-pip-close.test.js` auto paths | UNIT + E2E | Production-profile observation not recorded. | Clear. |
| Mode switching | Manual switch | PASS | `tests/unit/message-router-mode-switch-reeval.test.js`; `tests/e2e/popup-stats-message-route.test.js`; `tests/e2e/mode-switch-pip-close.test.js` manual paths | UNIT + E2E | Popup `noticeTabId` exact target could use a dedicated assertion. | Clear for V1-minimal. |
| Mode switching | Page in-prompt visibility | PASS | `tests/e2e/mode-switch-prompt-lifecycle.test.js`; `tests/unit/content-rest-composite-pending-banner.test.js`; `PROJECT_MASTER.md` prompt delivery close-out | E2E + UNIT + MANUAL | Some paths rely on page refresh/manual confirmation evidence. | Clear. |
| Mode switching | PiP cleanup on Rest -> Composite and Rest -> Study | PASS | `tests/e2e/mode-switch-pip-close.test.js` four paths; `tests/unit/interceptor-mode-transition-v0.test.js`; `PROJECT_MASTER.md:D-037` | E2E + UNIT | Harness uses fake PiP state for transition cleanup. Native PiP smoke remains environment-dependent. | Clear. |
| Mode switching | Non-study non-composite site in Study mode | PASS | `tests/unit/background-logic.test.js`; `tests/unit/mode-routing-matrix-v0.test.js` Study -> Unclassified; `tests/e2e/reminder-v0-validation.test.js` T-R1/T-R4 | UNIT + E2E | Exact route naming has historical mismatch comments; behavior is covered as reminder/non-silent-study. | Clear for V1-minimal. |
| Mode switching | Restricted entertainment site in Study mode | PASS | `tests/unit/background-logic.test.js` with `instagram.com`/restricted; `tests/unit/mode-routing-matrix-v0.test.js` `bilibili.com`; `tests/e2e/reminder-v0-validation.test.js` T-R5 | UNIT + E2E | Production-profile representative-domain smoke not recorded. | Clear. |
| Mode switching | Hard blocked site | PASS | `tests/unit/background-logic.test.js` unsafe wins; `tests/unit/mode-routing-matrix-v0.test.js` `tiktok.com`; `tests/e2e/reminder-v0-validation.test.js` T-R8; `tests/e2e/extension.test.js` unsafe only back button | UNIT + E2E | Public evidence uses unsafe/hard-block terminology interchangeably; align labels later. | Clear. |
| Mode switching | Unclassified site behavior | PARTIAL | `tests/unit/mode-routing-matrix-v0.test.js`; `tests/e2e/reminder-v0-validation.test.js`; `docs/SITE_ACCESS_POLICY.md` | UNIT + E2E | Tests include comments about matrix/runtime UI mismatch for some unclassified routes; ReleaseMg production smoke should verify no permanent rule mutation. | Not blocker if accepted as V1-minimal behavior; cleanup before expanding classification. |

## Cloud sync

| Area | Scenario | Status | Evidence | Automation level | Remaining gap | Release impact |
|---|---|---|---|---|---|---|
| Cloud sync | `cloud_profile_id` / `cloud_device_id` / token presence | PASS_WITH_MANUAL_EVIDENCE | `PROJECT_MASTER.md` Cloud Stats v1 gate; production Profile 3 hydration evidence; `tests/e2e/settlement-then-getstats.test.js` seeded identity; `tests/unit/live-stats-flush.test.js` | GATE.TEST + UNIT + E2E + PRODUCTION_READONLY | Public evidence must not print raw IDs. | Clear; preserve privacy. |
| Cloud sync | Config sync | PASS_WITH_MANUAL_EVIDENCE | `PROJECT_MASTER.md` Cloud sync evidence pass; rules/default/custom/effective counts; Product Owner manual verification | GATE.TEST + MANUAL | No fresh ReleaseMg production report yet. | Clear. |
| Cloud sync | Default/custom/effective rules | PASS | `docs/SITE_ACCESS_POLICY.md`; `tests/unit/site-access-policy-alignment.test.js`; `tests/unit/storage-composite-migration.test.js`; `tests/unit/workers-logic.test.js`; `PROJECT_MASTER.md` terminal rules evidence | UNIT + MANUAL | None for current policy; do not change site policy in this task. | Clear. |
| Cloud sync | `stats_v1` upload | PASS | `tests/unit/stats-foundation-sync.test.js`; `docs/STATS_STORAGE_FOUNDATION.md`; `PROJECT_MASTER.md` v1 gate | UNIT + GATE.TEST | No D1 writes in this audit; relies on recorded gate evidence. | Clear. |
| Cloud sync | `usage_segments_v1` upload | PASS | `tests/unit/usage-segments.test.js`; `tests/unit/stats-foundation-sync.test.js`; `docs/STATS_STORAGE_FOUNDATION.md`; `PROJECT_MASTER.md` v1 gate | UNIT + GATE.TEST | No new live cloud run in this audit. | Clear. |
| Cloud sync | Outbox clearing | PASS | `tests/unit/stats-foundation-sync.test.js`; `tests/unit/usage-segments.test.js`; `PROJECT_MASTER.md` pending counts = 0 | UNIT + GATE.TEST | None for V1-minimal. | Clear. |
| Cloud sync | Force sync idempotency | PASS | `PROJECT_MASTER.md` `CLOUD_FORCE_SYNC hadFailure=false`; `tests/unit/stats-foundation-sync.test.js` segment/stat re-upload idempotency | UNIT + GATE.TEST | No new force sync run in this audit. | Clear. |
| Cloud sync | D1 duplicate check | PASS | `PROJECT_MASTER.md` duplicate queries for `stats_v1` and `usage_segments_v1` returned `[]`; schema uniqueness evidence | GATE.TEST | Read-only evidence only; no migration/write in this task. | Clear. |
| Cloud sync | Legacy stats known risk | KNOWN_RISK | `PROJECT_MASTER.md` Cloud legacy stats duplicate confirmed; `DECISIONS.md:D-035`; release record known risks | MANUAL + DOC | Legacy cleanup/migration remains out of scope. | Not blocker because V1-minimal truth path is v1 stats. |
| Cloud sync | Production Profile 3 hydration evidence | PASS_WITH_MANUAL_EVIDENCE | `PROJECT_MASTER.md` production profile hydration: `cloud_device_id` absent initially, hydrated after reload, force sync healthy | PRODUCTION_READONLY | No standalone redacted ReleaseMg evidence report found. | Clear for current gate; final acceptance should record redacted summary. |

## UI/admin consistency

| Area | Scenario | Status | Evidence | Automation level | Remaining gap | Release impact |
|---|---|---|---|---|---|---|
| UI/admin | Popup opens | PASS | `tests/e2e/extension.test.js` T-E2; `tests/e2e/admin-visual-render.test.js`; `tests/e2e/popup-stats-message-route.test.js` | E2E | Production profile popup smoke not yet in ReleaseMg report. | Clear. |
| UI/admin | Popup mode and usage display | PASS | `tests/unit/badge-and-popup-mode-v0.test.js`; `tests/e2e/extension.test.js`; `tests/e2e/admin-visual-render.test.js` | UNIT + E2E | None for V1-minimal. | Clear. |
| UI/admin | Popup switch target webpage prompt | PARTIAL | Source path: `popup/popup.js` `noticeTabId`; `message-router.js`; close-out recorded in `PROJECT_MASTER.md` | CODE_AUDIT + MANUAL | Missing dedicated automated assertion that popup-triggered switch notices land on the target webpage tab. | Low; add post V1-minimal hardening test. |
| UI/admin | Admin local status | PASS | `tests/e2e/admin-visual-render.test.js`; `PROJECT_MASTER.md` admin manual verification | E2E + MANUAL | Admin CSP warning remains known issue. | Clear with known warning. |
| UI/admin | Admin rules page refresh | PASS | `tests/unit/admin-nav-refresh.test.js`; `tests/unit/admin-undetermined-list.test.js`; `PROJECT_MASTER.md` admin subpage refresh evidence | UNIT + MANUAL | None. | Clear. |
| UI/admin | Admin stats/timeline | PASS | `tests/unit/admin-stats-overview.test.js`; `tests/e2e/admin-stats-summary.test.js`; `tests/e2e/admin-visual-render.test.js`; recovery gate includes `GET_TIMELINE_SEGMENTS` | UNIT + E2E + SYSTEM | Some admin-summary checks are diagnostic shape checks. | Clear. |
| UI/admin | Borrowing disabled / no active entry | PASS | `DECISIONS.md:D-034`; `PROJECT_MASTER.md` time borrowing disable evidence; `tests/unit/message-router-borrow-source.test.js`; `tests/unit/reminder-transition-v0.test.js`; `tests/unit/background-logic.test.js` | UNIT + DOC | Historical borrowing tests still exist for compatibility; do not treat them as active feature coverage. | Clear; borrowing remains disabled/deferred. |
| UI/admin | Error state behavior | PARTIAL | `tests/unit/admin-nav-refresh.test.js` covers rules/stats/devices error rendering; `DECISIONS.md:D-021` admin CSP warning known | UNIT | Broader popup/admin runtime error-state UX not fully matrixed. | Not blocker; keep admin CSP as known non-blocking warning. |

## ReleaseMg production acceptance

| Area | Scenario | Status | Evidence | Automation level | Remaining gap | Release impact |
|---|---|---|---|---|---|---|
| ReleaseMg production acceptance | Artifact parity | PARTIAL | `docs/releases/v1-minimal-release-2026-05-09.md` artifact and SHA256; `docs/agents/ReleaseMg.md` ARTIFACT-PARITY SOP | MANUAL + DOC | No standalone ReleaseMg report tying repo commit, final CWS uploaded zip, installed extension version, and CWS dashboard version together. | Final release acceptance blocker until recorded; not a code blocker. |
| ReleaseMg production acceptance | Installed extension version | MISSING | ReleaseMg SOP defines check; CWS/dashboard version known from prior workflow but no redacted evidence report in repo | NONE | Need production profile `chrome://extensions/` readonly check and evidence summary. | Blocker for final production acceptance; not needed for code/test audit. |
| ReleaseMg production acceptance | CWS status | PARTIAL | Prior release workflow observed CWS `待审核`; ReleaseMg SOP defines CWS dashboard readonly check | PRODUCTION_READONLY | Release docs now record reduced-permission package submitted / `待审核`; CWS live state still needs a final redacted ReleaseMg readiness report before public release. | Blocker for final release package evidence; not blocker for local tests. |
| ReleaseMg production acceptance | Production bound profile readonly smoke | MISSING | `PROJECT_MASTER.md` has production Profile 3 hydration evidence for cloud sync; ReleaseMg SOP defines POPUP/BIND/TIMING smoke | PRODUCTION_READONLY | No full ReleaseMg production acceptance report found. | Final acceptance blocker unless PO waives/defer. |
| ReleaseMg production acceptance | Evidence privacy | PARTIAL | `docs/agents/ReleaseMg.md` EVIDENCE-PRIVACY SOP | DOC | Need actual evidence report privacy review. | Required before publishing final release evidence. |
| ReleaseMg production acceptance | Stop/rollback criteria | PASS | `docs/agents/ReleaseMg.md` Stop / Rollback Criteria | DOC | Criteria exist; no execution report yet. | Clear as SOP; execution still pending. |

## Required findings

1. Are timing accuracy tests complete enough for V1-minimal?

Yes for V1-minimal automated release confidence. The core timing pipeline, settlement, `GET_STATS`, `GET_STATS_RANGE`, `daily_usage_stats_v1`, `usage_segments_v1`, media channels, flush idempotency, and no-double-counting paths are covered by unit and E2E tests. Final release acceptance still needs ReleaseMg production-profile smoke evidence, but this is release-management evidence, not a missing core automated test.

2. Are video/fullscreen/PiP tests complete enough?

Yes for V1-minimal. Video accounting has explicit E2E coverage, fullscreen is exercised when supported by the browser, PiP has unit accounting coverage and E2E transition-cleanup coverage. Native PiP/fullscreen availability remains environment-dependent and should be recorded during ReleaseMg acceptance.

3. Is popup current domain vs domain stats convergence covered?

Yes. `video-playback-live-pip-fullscreen.test.js` explicitly compares `GET_STATS`, `GET_STATS_RANGE`, materialized daily stats, and settled segments with 2-3 second jitter tolerance. `popup-stats-message-route` and `settlement-then-getstats` add popup message-path coverage.

4. Is non-study/non-composite locking covered?

Yes at routing/reminder level. Study-mode unclassified/non-study/non-composite paths are covered by unit routing tests and reminder E2E. Exact naming of some legacy reminder reasons remains noisy, but the core behavior is not silently counted as study.

5. Is restricted entertainment behavior covered?

Yes. `bilibili.com`/restricted entertainment paths are covered in `mode-routing-matrix-v0.test.js`, `background-logic.test.js`, and reminder E2E. Production representative-domain smoke remains a ReleaseMg task.

6. Is hard-blocked behavior covered?

Yes. Unsafe/hard-block routes are covered by unit and E2E tests, including return-only UI and no borrow/apply/continue behavior.

7. Is Cloud Stats v1 covered end-to-end?

Yes, with mixed evidence. Terminal settlement/outbox/upload/idempotency is covered by unit tests. Gate.Test and project evidence record real extension v1 sync with pending counts cleared and D1 duplicate checks clean. Legacy stats remains a known risk and is explicitly not the V1-minimal truth path.

8. Is production profile smoke sufficient or still deferred?

Still deferred/incomplete as a final ReleaseMg acceptance package. There is production Profile 3 hydration evidence for cloud sync, and CWS dashboard work was performed, but no complete redacted ReleaseMg production acceptance report tying artifact parity, installed extension version, CWS status, popup/bind smoke, and evidence privacy together was found.

9. Which gaps are release blockers?

- Final ReleaseMg production acceptance report is missing for artifact parity, installed extension version, CWS status, production bound profile readonly smoke, and evidence privacy.
- CWS live state is recorded as reduced-permission package submitted / `待审核`, but final public release still needs a redacted ReleaseMg readiness report and Product Owner close-out decision.
- If treating mode-routing matrix as a hard release gate, the stale Rest -> Composite 60s expectation/comment must be reconciled with the 30s decision and interceptor test evidence.

10. Which gaps can be post V1-minimal?

- Dedicated automated test for popup `noticeTabId` targeting.
- Cleanup of stale route names/comments and 60s drift in `mode-routing-matrix-v0.test.js`.
- Broader popup/admin error-state matrix.
- Native production PiP/fullscreen smoke beyond current environment-dependent E2E.
- Legacy cloud stats cleanup/migration.
- Time borrowing redesign and restoration.
- Full V1 model, AI classification, and composite routing rebuild.

## Audit conclusion

Current V1-minimal core automated coverage is strong enough for the V1-minimal release candidate, especially for timing, media/PiP, Stats Foundation, and mode-transition side effects.

The remaining release risk is not primarily missing product tests. It is release-management closure:

- record a redacted ReleaseMg production acceptance report;
- reconcile final artifact/CWS/live installed version evidence;
- preserve legacy stats and manual recovery caveats as known risks, not as pass.
