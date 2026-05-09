# Admin / Bind Account Token Minimum Verification - 2026-05-09

## Scope

This is the minimum verification report for the `admin/admin.js` and `bind.js` account-token persistence package.

This task did not modify product code, test code, package artifacts, Chrome Web Store state, Chrome profile data, chrome.storage data, cloud data, Worker code, D1 data, release tags, or commits.

This report does not declare V1-minimal release readiness.

## Files Read

- `docs/audits/ADMIN_BIND_ACCOUNT_TOKEN_IMPLEMENTATION_REPORT_2026-05-09.md`
- `docs/audits/ADMIN_BIND_OWNERSHIP_RESOLUTION_2026-05-09.md`
- `admin/admin.js`
- `bind.js`
- `message-router.js`
- `infra/cloud-sync.js`

## Package Under Verification

Dirty implementation package:

- `admin/admin.js`
- `bind.js`

Report file added by this verification task:

- `docs/audits/ADMIN_BIND_ACCOUNT_TOKEN_MIN_VERIFY_2026-05-09.md`

## Commands Run

All commands were run from:

```text
D:\Opencode\ChromeExtension\timeonchrome
```

| Command | Result | Notes |
|---|---|---|
| `git diff -- admin/admin.js bind.js` | PASS | Diff shows only two persistence changes: `admin/admin.js` writes `[CLOUD_KEYS.ACCOUNT_TOKEN]: result.token` after auto-login; `bind.js` writes `account_token: accountToken` after bind. |
| `rg -n "account_token\|ACCOUNT_TOKEN\|cloud_credentials\|CLOUD_LOGOUT\|auth/login\|device/bind" admin/admin.js bind.js message-router.js infra/cloud-sync.js` | PASS | Search confirms `account_token` is an existing storage key used by `admin/admin.js` and `message-router.js`; `bind.js` writes the same literal key. |
| `node tests/unit/cloud-bind.test.js` | NOT RUN | File does not exist. No test was created. |
| `node tests/unit/message-router-cloud.test.js` | NOT RUN | File does not exist. No test was created. |

Existence checks:

- `tests/unit/cloud-bind.test.js`: missing
- `tests/unit/message-router-cloud.test.js`: missing

## Results

Static verification result: PASS.

Available automated test result: BLOCKED / NOT RUN because both requested unit test files are missing.

The readonly diff and search support the implementation report's prior conclusion:

- the two dirty files form one coherent account-token persistence package;
- `account_token` is the correct storage key value;
- `admin/admin.js` uses `CLOUD_KEYS.ACCOUNT_TOKEN`;
- `bind.js` uses literal `account_token`, matching existing `message-router.js` storage behavior;
- `CLOUD_LOGOUT` in `message-router.js` clears `account_token` by setting it to `null`.

## Missing Test Files

The requested minimal unit test files are not present:

- `tests/unit/cloud-bind.test.js`
- `tests/unit/message-router-cloud.test.js`

Per task instruction, no tests were created.

## Revised Minimal Verification Proposal

Because the requested test files are missing, Product Owner should authorize one of the following before accepting this package as tested evidence:

1. Add a small unit test package that mocks `chrome.storage.local`, `fetch`, and the relevant login/bind paths, then verifies:
   - `admin/admin.js` `autoLogin()` persists `account_token` after successful `/auth/login`;
   - `bind.js` `doBind()` persists `account_token` alongside `cloud_device_token`, `cloud_device_id`, `cloud_profile_id`, `cloud_credentials`, and `cloud_last_sync`;
   - `message-router.js` `CLOUD_LOGOUT` clears `account_token`;
   - failed login paths do not overwrite a valid token with an invalid value.
2. Or explicitly accept static-only verification for this small persistence package and keep stale-token invalidation as a follow-up risk.

No revised verification command was run in this task.

## Risk Assessment

- The package persists a sensitive account token to local extension storage.
- This is not a new storage model because `message-router.js` already persists `account_token`, and the extension already persists `cloud_credentials`.
- Stale-token behavior remains the main residual risk:
  - `CLOUD_LOGOUT` clears `account_token`;
  - `autoLoginForRebind` failed login removes credentials and token;
  - ordinary `autoLogin()` failed login shows the bind screen but does not clearly remove a stale `account_token`.
- Static verification cannot prove runtime behavior for successful/failed fetch paths.

## Recommendation Before Follow-Up Test Package

Recommendation: `hold`.

Rationale:

- The implementation still appears coherent and likely should be included after verification.
- However, the requested automated unit tests are missing, so this run cannot provide the requested minimal automated evidence.
- Hold the package for commit/package/release evidence until Product Owner either authorizes a revised minimal test package or explicitly accepts static-only verification with the stale-token risk recorded.

No code revise is required by this verification report unless Product Owner wants stricter stale-token invalidation semantics.

## Out-of-Scope Confirmation

Not performed:

- Product code modification.
- Test code modification.
- Test creation.
- Bug fix or refactor.
- Package rebuild.
- Commit, push, tag, merge, or release.
- Chrome Web Store dashboard access, upload, or submit.
- Chrome profile access or mutation.
- chrome.storage, cloud, Worker, or D1 access/mutation.
- V1-minimal release-ready judgment.

## Result

Status: `STATIC VERIFICATION PASS / FOLLOW-UP TEST PACKAGE COMPLETED`

Follow-up test package report:

```text
docs/audits/ADMIN_BIND_ACCOUNT_TOKEN_TEST_PACKAGE_REPORT_2026-05-09.md
```

Follow-up test result:

```text
node tests/unit/admin-bind-account-token.test.js
5/5 PASS
```

Recommendation after follow-up test package, before Product Owner decision:

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
