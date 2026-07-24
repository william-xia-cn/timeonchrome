> **ARCHIVED / Historical evidence only.** This file is preserved for audit/history and must not be used as the current product source of truth. Use `AGENTS.md`, `PROJECT_MASTER.md`, `TASK_BOARD.md`, `DECISIONS.md`, and the current authority documents instead.

# Admin / Bind Account Token Implementation Report - 2026-05-09

## Purpose

This report records the Build&Test review result for the dirty `admin/admin.js` and `bind.js` account-token persistence changes.

This report does not declare V1-minimal release readiness. It does not modify code, run tests, rebuild packages, commit, push, tag, release, access Chrome Web Store, or modify Chrome profile/storage/cloud/D1.

## Files Reviewed

- `admin/admin.js`
- `bind.js`
- `message-router.js`
- Related project status and ownership docs:
  - `docs/audits/ADMIN_BIND_OWNERSHIP_RESOLUTION_2026-05-09.md`
  - `docs/handoffs/outbox/HANDOFF-admin-bind-account-token-review-to-build-test.md`

## Implementation Intent

`admin/admin.js` and `bind.js` belong to the same implementation intent:

```text
Persist the parent account token into chrome.storage.local so later admin/profile/cloud/bind flows can read account_token.
```

Specific behavior:

- `admin/admin.js`: after bound-device auto-login succeeds, persist the fresh `result.token` under `account_token`.
- `bind.js`: after first bind succeeds, persist the login-stage `accountToken` together with device/profile/credential state.

## Behavior Impact

The change is a reasonable behavior completion.

In `admin/admin.js`, `loadProfiles()` reads `account_token` from storage, while `autoLogin()` previously updated only the in-memory `accountToken` variable. If storage lacked a fresh token after auto-login, profile loading could fail or depend on an old token.

In `bind.js`, first install / bind would immediately leave local storage with a complete cloud auth state:

- `cloud_credentials`
- `cloud_device_token`
- `cloud_device_id`
- `cloud_profile_id`
- `account_token`

## Storage Key Consistency

Result: key value is consistent, but coding style is not fully unified.

- `admin/admin.js` defines `CLOUD_KEYS.ACCOUNT_TOKEN = 'account_token'`.
- The new `admin/admin.js` change uses `[CLOUD_KEYS.ACCOUNT_TOKEN]`.
- The new `bind.js` change uses literal `account_token`.
- Existing `message-router.js` login code also writes literal `account_token`.

No wrong storage key was found. `bind.js` does not share `CLOUD_KEYS`, which is an existing style boundary and is not a blocker for this package.

## Security / Stale-Token Risk

Risk is acceptable after minimal verification.

- `account_token` is sensitive, and persistence increases the local token residency surface.
- The system already persists `cloud_credentials`, and `message-router.js` already has an `account_token` persistence path, so this is not a new security model.
- Stale-token risk exists. Existing `CLOUD_LOGOUT` clears `account_token`, and `autoLoginForRebind` failure removes credentials/token. However, the ordinary `autoLogin()` failure path appears to call `showBindScreen()` without clearly clearing stale token state.

Follow-up verification should check that failure, logout, unbind, and rebind paths do not display stale profiles or bind to stale auth state.

## Recommended Minimal Verification

Recommended commands, pending separate Product Owner authorization:

```powershell
git diff -- admin/admin.js bind.js
rg -n "account_token|ACCOUNT_TOKEN|cloud_credentials|CLOUD_LOGOUT|auth/login|device/bind" admin/admin.js bind.js message-router.js infra/cloud-sync.js
node tests/unit/cloud-bind.test.js
node tests/unit/message-router-cloud.test.js
```

If either unit test file does not exist, first perform a readonly test inventory and return a revised verification plan before adding or running tests.

## Recommendation

Recommendation: `include, after minimal verification`.

`admin/admin.js` and `bind.js` should become a formal Build&Test implementation package for a V1-minimal follow-up. The diff is coherent, the behavior is useful, the storage key is correct, and the change closes a plausible token persistence gap after auto-login and bind.

Do not merge, commit, rebuild, or include this package in a future artifact until minimal verification is authorized and completed.

If Product Owner wants stricter stale-token semantics, create a small revise package specifically for token invalidation behavior rather than rewriting this package preemptively.

## Product Owner Decisions

Closed:

1. Product Owner authorized minimum verification.
2. Product Owner authorized a focused unit test package after missing-test discovery.
3. Product Owner approved this package as `include` after the focused unit test package passed.
4. Product Owner accepted stale-token invalidation semantics as a separate follow-up task.

Still requires separate Product Owner approval:

1. Commit.
2. Rebuild/package.
3. Push/tag/release.

## Result

Status: `BUILD&TEST REVIEW RECORDED / TEST PACKAGE COMPLETED`

Minimum verification report:

```text
docs/audits/ADMIN_BIND_ACCOUNT_TOKEN_MIN_VERIFY_2026-05-09.md
```

Minimum verification result:

```text
STATIC VERIFICATION PASS / AUTOMATED TESTS MISSING / RECOMMENDATION HOLD
```

Follow-up test package report:

```text
docs/audits/ADMIN_BIND_ACCOUNT_TOKEN_TEST_PACKAGE_REPORT_2026-05-09.md
```

Follow-up test result:

```text
node tests/unit/admin-bind-account-token.test.js
5/5 PASS
```

Recommendation before Product Owner decision:

```text
include as V1-minimal follow-up candidate after Product Owner review
```

Product Owner decision:

```text
include as V1-minimal follow-up candidate
```

Decision record:

```text
DECISIONS.md:D-038
```

Tests run: `None`.

No product code was modified by this report.

No test code was modified by this report.

No package rebuild, commit, push, tag, release, Chrome Web Store action, Chrome profile mutation, storage write, cloud write, or D1 write was performed.
