> **ARCHIVED / Historical evidence only.** This file is preserved for audit/history and must not be used as the current product source of truth. Use `AGENTS.md`, `PROJECT_MASTER.md`, `TASK_BOARD.md`, `DECISIONS.md`, and the current authority documents instead.

# Agent Handoff

## Metadata

- Handoff ID: HANDOFF-admin-bind-account-token-test-package-to-build-test
- Date: 2026-05-09
- From: Product&Project Mg
- To: Build&Test
- Related task: Admin/bind account-token persistence minimal test package
- Related branch: current local branch, verify before action
- Related files:
  - `admin/admin.js`
  - `bind.js`
  - `message-router.js`
  - `infra/cloud-sync.js`
  - `docs/audits/ADMIN_BIND_ACCOUNT_TOKEN_IMPLEMENTATION_REPORT_2026-05-09.md`
  - `docs/audits/ADMIN_BIND_ACCOUNT_TOKEN_MIN_VERIFY_2026-05-09.md`
- Status: Done / test package report received

## Purpose

Add a small, focused automated test package for the `admin/admin.js` and `bind.js` account-token persistence changes so the package can move beyond static-only verification.

## Context

Build&Test reviewed the dirty `admin/admin.js` and `bind.js` changes and found them coherent:

```text
Persist parent account_token after admin auto-login and bind flow.
```

Minimum verification then produced:

```text
STATIC VERIFICATION PASS / AUTOMATED TESTS MISSING / RECOMMENDATION HOLD
```

Product Owner selected:

```text
1. Authorize Build&Test to add a small test package.
```

## Source Of Truth

Build&Test must read:

- `AGENTS.md`
- `PROJECT_MASTER.md`
- `TASK_BOARD.md`
- `DECISIONS.md`
- `docs/agents/BuildTest.md`
- `docs/audits/ADMIN_BIND_OWNERSHIP_RESOLUTION_2026-05-09.md`
- `docs/audits/ADMIN_BIND_ACCOUNT_TOKEN_IMPLEMENTATION_REPORT_2026-05-09.md`
- `docs/audits/ADMIN_BIND_ACCOUNT_TOKEN_MIN_VERIFY_2026-05-09.md`
- `docs/handoffs/outbox/HANDOFF-admin-bind-account-token-test-package-to-build-test.md`

## Request

Create the smallest reasonable unit test coverage for the existing dirty `admin/admin.js` and `bind.js` account-token persistence package.

Required coverage:

1. `admin/admin.js` successful auto-login persists `account_token` after `/auth/login`.
2. `bind.js` successful bind persists `account_token` together with:
   - `cloud_device_token`
   - `cloud_device_id`
   - `cloud_profile_id`
   - `cloud_credentials`
   - `cloud_last_sync`
3. `message-router.js` `CLOUD_LOGOUT` clears `account_token`.
4. Failed login paths do not overwrite a valid token with an invalid token.

## Scope

Allowed:

- Add or modify unit tests only where needed for this package.
- Add minimal test helpers only if local test patterns require them.
- Run only the directly relevant unit tests.
- Add one verification report:
  - `docs/audits/ADMIN_BIND_ACCOUNT_TOKEN_TEST_PACKAGE_REPORT_2026-05-09.md`

Product code edits are not authorized by this handoff.

If Build&Test finds the production code cannot be tested without a tiny testability change, stop and report the blocker. Do not make the production code change without separate Product Owner authorization.

## Out Of Scope

Forbidden:

- Product code edits.
- Product behavior changes.
- Refactors.
- Package rebuild.
- Commit, push, tag, merge, or release.
- Chrome Web Store action.
- Chrome profile access or mutation.
- Real `chrome.storage`, cloud, Worker, or D1 access/mutation.
- Broad regression runs beyond the directly relevant unit tests unless separately authorized.
- Declaring V1-minimal release readiness.

## Acceptance Criteria

Completion requires:

- Focused test file(s) added or updated.
- Relevant tests run and reported.
- Test report created.
- `admin/bind account_token` package classified as:
  - accepted with automated evidence;
  - needs revise;
  - or still held.
- Any residual stale-token risk recorded.
- No production code change unless separately authorized.

## Required Evidence

Build&Test must output:

- changed test files;
- behavior covered;
- commands run;
- results;
- known risks;
- whether product code was changed;
- recommendation for Product Owner;
- out-of-scope confirmation.

## Open Questions

If the test package reveals stale-token behavior that requires a production fix, Build&Test must stop and request Product Owner authorization for a separate revise package.

## Expected Deliverable

```text
docs/audits/ADMIN_BIND_ACCOUNT_TOKEN_TEST_PACKAGE_REPORT_2026-05-09.md
```

## Completion Record

Build&Test completed the minimal unit test package:

- `tests/unit/admin-bind-account-token.test.js`
- `docs/audits/ADMIN_BIND_ACCOUNT_TOKEN_TEST_PACKAGE_REPORT_2026-05-09.md`

Command:

```text
node tests/unit/admin-bind-account-token.test.js
```

Result:

```text
5/5 PASS
```

Boundary confirmation:

- No product code changes.
- No rebuild/package.
- No commit, push, tag, merge, or release.
- No CWS dashboard access.
- No Chrome profile, storage, cloud, Worker, or D1 access/mutation.
