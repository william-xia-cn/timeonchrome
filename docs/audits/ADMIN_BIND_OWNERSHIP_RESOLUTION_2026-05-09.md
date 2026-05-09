# Admin / Bind Ownership Resolution - 2026-05-09

## Purpose

This is a docs-only ownership resolution plan for the remaining `Unknown / hold` extension-source changes:

- `admin/admin.js`
- `bind.js`

This plan does not modify code, run tests, stage files, commit, push, tag, release, rebuild packages, access Chrome Web Store, or modify Chrome profile/storage/cloud/D1.

## Current Diffs

### `admin/admin.js`

Diff summary:

```text
autoLogin(encryptedCredentials) now persists result.token into chrome.storage.local under CLOUD_KEYS.ACCOUNT_TOKEN.
```

Observed code shape:

```js
accountToken = result.token;
await new Promise((resolve) => {
  chrome.storage.local.set({
    [CLOUD_KEYS.ACCOUNT_TOKEN]: result.token,
  }, resolve);
});
```

### `bind.js`

Diff summary:

```text
doBind(profileId) now stores account_token: accountToken together with cloud_device_token, cloud_device_id, cloud_profile_id, cloud_credentials, and cloud_last_sync.
```

Observed code shape:

```js
account_token: accountToken,
```

## Ownership Assessment

These two changes appear to be one coherent implementation topic:

```text
Persist account token after admin auto-login and bind flow so later cloud/auth flows can read account_token from local storage.
```

They should not remain permanently ambiguous, because they touch:

- auth/session behavior;
- token persistence;
- bind flow;
- extension package source;
- future package rebuild risk.

## Release Relevance

Current V1-minimal CWS submitted artifact is not changed by these dirty files.

However, these files would affect any future extension package rebuilt from the current working tree.

They should not be included in release evidence or any package rebuild until Build&Test has produced an implementation report and verification evidence.

## Recommended Resolution

Product&Project Mg recommends:

1. Convert `admin/admin.js` and `bind.js` from `Unknown / hold` to a formal Build&Test review task.
2. Ask Build&Test to produce an implementation report and minimal verification plan.
3. Do not run tests until Product Owner separately authorizes them.
4. Do not commit, package, push, tag, or release these changes until review and verification are complete.

## Proposed Build&Test Scope

Build&Test should inspect:

- `admin/admin.js`
- `bind.js`
- related token constants / storage key definitions, if needed;
- existing tests related to bind/auth/cloud token persistence, if needed.

Build&Test should answer:

1. Is this change intentional and internally consistent?
2. Is `account_token` the correct storage key, or should it use `CLOUD_KEYS.ACCOUNT_TOKEN` consistently?
3. Does storing account token in both flows create duplication, security, or stale-token risk?
4. What behavior does this enable or fix?
5. What minimal tests should verify it?
6. Is it safe to include in a future extension package?

## Out Of Scope

Do not:

- edit code;
- edit tests;
- run tests without later Product Owner authorization;
- clear or inspect Chrome profile data;
- read or write chrome.storage outside normal test execution;
- access cloud/D1;
- rebuild package;
- commit/push/tag/release;
- include this change in V1-minimal release evidence yet.

## Product Owner Decision Needed

Approve or reject this proposed next step:

```text
Ask Build&Test to produce an admin/bind account-token persistence implementation review report.
```

Recommended report path:

```text
docs/audits/ADMIN_BIND_ACCOUNT_TOKEN_IMPLEMENTATION_REPORT_2026-05-09.md
```

## Result

Status: `OWNERSHIP RESOLUTION REVIEWED / MINIMUM VERIFICATION COMPLETED WITH HOLD RECOMMENDATION`

Build&Test review was recorded in:

```text
docs/audits/ADMIN_BIND_ACCOUNT_TOKEN_IMPLEMENTATION_REPORT_2026-05-09.md
```

Review conclusion:

```text
include, after minimal verification
```

Minimum verification report:

```text
docs/audits/ADMIN_BIND_ACCOUNT_TOKEN_MIN_VERIFY_2026-05-09.md
```

Minimum verification conclusion:

```text
STATIC VERIFICATION PASS / AUTOMATED TESTS MISSING / RECOMMENDATION HOLD
```

`admin/admin.js` and `bind.js` are no longer classified as an unknown topic. They are classified as one coherent account-token persistence implementation package. They remain unaccepted for release/package/commit purposes because the requested automated unit test files are missing and Product Owner has not accepted static-only verification risk.

No code was modified.

No tests were run.

No files were staged or committed.

No package rebuild, CWS action, Chrome profile mutation, storage write, cloud write, or D1 write was performed.
