> **ARCHIVED / Historical evidence only.** This file is preserved for audit/history and must not be used as the current product source of truth. Use `AGENTS.md`, `PROJECT_MASTER.md`, `TASK_BOARD.md`, `DECISIONS.md`, and the current authority documents instead.

# TimeOnChrome V0 Release Notes (Draft)

Status: Draft for RC handoff review  
Version: 1.7.2  
Decision basis: Product Owner accepted risk closeout

## 1. V0 completed highlights

- Reminder transition UI closeout completed and manually accepted:
  - Study -> Rest slide confirm page
  - Study -> Composite automatic switch + 45s lightweight notice
  - Composite -> Rest normal confirmation page
- Pending transition feedback completed and manually accepted:
  - Rest -> Composite
  - Rest -> Study
  - Composite -> Study
- Popup V0 layout manually accepted.
- Admin key flows manually accepted:
  - stats/rules/devices/navigation/login/logout/save/sync
  - force update/sync button has visible running/success/failure feedback
- System Recovery Release Gates RG-1~RG-4 recorded as PASS (Product Owner confirmed).

## 2. Validation evidence summary

- Manual validation: passed for reminder UI, pending feedback, popup layout, admin functionality.
- Unit regression: passed in closeout cycle.
- Windows local Playwright runner: environment blocked by `spawn EPERM` for part of E2E evidence.

## 3. Accepted known V0 release risks (not fixed / not passed)

1. macOS smoke validation did not pass / did not complete in V0; deferred to V1 by Product Owner risk acceptance.
2. Playwright E2E alternate-environment rerun did not complete in V0; local Windows runner blocked by `spawn EPERM`; deferred to V1 by Product Owner risk acceptance.
3. Admin CSP console warning remains unresolved:
   - `Executing inline event handler violates Content Security Policy`
   - treated as known non-blocking admin-page warning because admin functional flows were manually validated.

## 4. Known issues list

- Admin CSP warning unresolved (known warning; not fixed).
- macOS smoke validation deferred to V1 (accepted risk; not passed).
- Playwright alternate-environment E2E evidence deferred to V1 (accepted risk; not passed).

## 5. V1 follow-up validation items

1. Execute `docs/macos_v0_smoke_test_checklist.md` on macOS and archive evidence.
2. Re-run Playwright E2E in clean alternate environment and archive evidence:
   - `tests/e2e/duration-accuracy.test.js`
   - `tests/e2e/timing-trace-smoke.test.js`
   - `tests/e2e/timing-trace-verify.test.js`
3. Revisit Admin CSP root cause only if functional impact emerges.
4. Improve release automation/CI evidence chain.
5. Rest borrow rule refinement（V0 accepted mechanism, V1 optimization）:
   - borrow amount policy
   - next-day deduction/repayment explainability
   - daily/weekly borrow limit policy
   - parent-configurable borrow switch
   - clearer failure feedback and audit trail

## 6. Not-yet-done release operations (required before handoff completion)

- Release notes final review.
- Known issues final review.
- RC package generation.
- Local RC install smoke.
- Product Owner final approval.

## 7. Release status guardrail

V0 release may proceed only under Product Owner accepted risk.  
This draft does **not** claim:

- macOS smoke passed
- Playwright E2E passed
- Admin CSP fixed
- V0 release finalized
- Chrome Web Store ready
