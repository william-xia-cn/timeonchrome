# Real Profile Timing Smoke

Purpose: verify that the popup's current-site timing display converges with live foreground activity in a real bound profile.

This is a release-management smoke, not a full timing benchmark.

## Scope

Allowed:
- Use a bound production or validation Chrome profile.
- Open the TimeOnChrome popup.
- Observe current site, current-site today time, mode totals, and top-domain list.
- Browse one non-private test page in the foreground for a short interval.

Forbidden:
- Do not clear storage.
- Do not logout, rebind, or change account/profile binding.
- Do not change rules, quota, config, mode policy, or cloud data.
- Do not record child ID, account email, token, cookie, local profile path, raw profile ID, raw device ID, or private screenshots.

## Steps

1. Open a normal test page that is safe to record by hostname only.
2. Open the TimeOnChrome popup.
3. Record redacted baseline:
   - installed version
   - current domain hostname only
   - current-site today time
   - visible mode totals
4. Keep the test page foreground active for 30 seconds.
5. Reopen the popup.
6. Verify current-site today time increases by roughly 20-40 seconds.
7. Reopen or refresh the popup once more.
8. Verify the current-site value does not jump by another full interval without new foreground activity.
9. If allowed by the release run, trigger Cloud Force Sync using `docs/release/CLOUD_FORCE_SYNC_SMOKE.md` and verify pending outbox clears.

## PASS Criteria

- Popup opens.
- Installed version matches the release candidate.
- Current domain is visible and redacted to hostname only.
- Current-site today time increases after foreground active browsing.
- Reopening the popup does not double count the same interval.
- Mode totals remain visible and non-negative.
- No private identifiers are recorded in evidence.

## WAIVED / PARTIAL Criteria

- Mark `PARTIAL` if the profile is bound but Chrome automation cannot access the popup and evidence is manual.
- Mark `WAIVED` only with explicit Product Owner approval.
- Do not mark `PASS` if installed version, popup opening, or current-site timing cannot be observed.

## Evidence Format

```text
Real Profile Timing Smoke: PASS/PARTIAL/WAIVED/FAIL
Installed version:
Domain observed: <hostname only>
Baseline current-site today time:
After 30s foreground current-site today time:
Reopen/no-double-count check:
Mode totals visible: yes/no
Privacy: no child ID, email, token, cookie, local profile path, raw profile ID, raw device ID, or private screenshots recorded
```
