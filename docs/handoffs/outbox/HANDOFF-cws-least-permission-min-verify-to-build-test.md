# Agent Handoff

## Metadata

- Handoff ID: HANDOFF-cws-least-permission-min-verify-to-build-test
- Date: 2026-05-09
- From: Product&Project Mg
- To: Build&Test
- Related task: CWS least-permission / mode timing minimal verification
- Related branch: current local branch, verify before action
- Related files:
  - `docs/audits/CWS_LEAST_PERMISSION_IMPLEMENTATION_REPORT_2026-05-09.md`
  - `docs/release/V1_MINIMAL_PO_DECISION_PROPOSAL_2026-05-09.md`
  - `product/interceptor.js`
  - `tests/e2e/mode-switch-pip-close.test.js`
  - `tests/e2e/mode-switch-prompt-lifecycle.test.js`
  - `tests/unit/mode-routing-matrix-v0.test.js`
- Status: Ready

## Purpose

Ask Build&Test to run only the Product Owner-authorized minimal verification plan for the CWS least-permission / mode timing cleanup package and record results.

## Context

Build&Test produced `docs/audits/CWS_LEAST_PERMISSION_IMPLEMENTATION_REPORT_2026-05-09.md`. Product Owner has now authorized running only the minimal verification commands listed in that report.

This handoff does not authorize code edits, test edits, bug fixes, package rebuild, commit, push, tag, release, CWS action, Chrome profile access/mutation, storage/cloud/D1 writes, or unrelated investigation.

## Source Of Truth

Build&Test must read:

- `AGENTS.md`
- `PROJECT_MASTER.md`
- `TASK_BOARD.md`
- `DECISIONS.md`
- `docs/agents/BuildTest.md`
- `docs/audits/CWS_LEAST_PERMISSION_IMPLEMENTATION_REPORT_2026-05-09.md`
- `docs/release/V1_MINIMAL_PO_DECISION_PROPOSAL_2026-05-09.md`
- `docs/handoffs/outbox/HANDOFF-cws-least-permission-min-verify-to-build-test.md`

## Request

1. Run only the authorized verification commands below.
2. Record exact pass/fail/block status for each command.
3. Do not fix failures.
4. Produce a verification report.

## Scope

Allowed actions:

- Run these exact commands from the `timeonchrome` project root:

```powershell
git diff --check
```

```powershell
rg -n "chrome\.scripting|scripting\." background.js content.js message-router.js product infra runtime popup admin manifest.json
```

```powershell
rg -n '"management"|"scripting"|declarativeNetRequestFeedback' manifest.json
```

```powershell
node tests/unit/mode-routing-matrix-v0.test.js
```

```powershell
node tests/unit/interceptor-mode-transition-v0.test.js
```

```powershell
node tests/unit/content-rest-composite-pending-banner.test.js
```

```powershell
npx playwright test tests/e2e/mode-switch-prompt-lifecycle.test.js --reporter=line
```

```powershell
npx playwright test tests/e2e/mode-switch-pip-close.test.js --reporter=line
```

- Add one report:
  - `docs/audits/CWS_LEAST_PERMISSION_MIN_VERIFY_2026-05-09.md`

## Out Of Scope

Forbidden actions:

- Product code edits.
- Test code edits.
- Bug fixes.
- Refactors.
- Running any command not listed above.
- Package rebuild.
- Commit, push, tag, merge, or release.
- Chrome Web Store upload, submit, dashboard action, or status verification.
- Chrome profile access or mutation.
- Storage/cloud/D1 reads or writes beyond normal test behavior.
- Modifying `admin/admin.js`, `bind.js`, `pages/index.html`, or `tests/unit/pages-config-v12-fields.test.js`.
- Declaring V1-minimal release ready.

## Acceptance Criteria

Completion requires:

- Verification report created at `docs/audits/CWS_LEAST_PERMISSION_MIN_VERIFY_2026-05-09.md`.
- Every authorized command is listed with result.
- Failures are recorded without fixing.
- Any environment/sandbox blocker is recorded with exact command and error summary.
- Report confirms no code/test/package/git/CWS/profile/cloud/D1 action beyond the authorized commands.

## Required Evidence

Build&Test must output:

- commands run;
- command results;
- failure/blocker summaries;
- report path;
- tests run;
- known risks;
- Product Owner decisions required;
- out-of-scope confirmation.

## Open Questions

Questions requiring Product Owner decision:

- If any command fails, should Build&Test receive a separate fix task?
- If Playwright is blocked by environment, should Product Owner authorize a different environment or defer E2E verification?
- If all checks pass, should Product Owner authorize commit/rebuild/release follow-up?

## Expected Deliverable

`docs/audits/CWS_LEAST_PERMISSION_MIN_VERIFY_2026-05-09.md`

Final Build&Test response should summarize command results, failures/blockers, report path, and Product Owner decisions required.
