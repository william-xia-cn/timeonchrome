# ReleaseMg Production Smoke Addendum - 2026-05-09

## Summary

Result: `BLOCKED / NOT CLOSED`

ReleaseMg executed a bounded readonly production-profile smoke after `HANDOFF-v1-minimal-production-smoke-to-releasemg.md`.

Chrome was reachable through readonly inspection, but the expected TimeOnChrome CWS extension ID `mkggamgaeemnlmlflpekacbknochbmom` was not present in the inspected `chrome://extensions/` extension list. Only a non-TimeOnChrome Google Drive launcher extension was observed, and it was disabled.

Because the TimeOnChrome extension was not found, ReleaseMg could not verify installed/enabled/version, popup core, or bind-sync.

## Result Table

| Check | Result | Evidence summary |
|---|---|---|
| Production Chrome reachable | PARTIAL | Chrome page was reachable through readonly access; local profile path was not recorded. |
| TimeOnChrome installed | BLOCKED | Target CWS extension ID `mkggamgaeemnlmlflpekacbknochbmom` was not present in `chrome://extensions/`. |
| TimeOnChrome enabled | BLOCKED | Extension was not found, so enabled state could not be verified. |
| Installed version `1.7.2` | BLOCKED | Extension was not found, so installed version could not be verified. |
| Popup core opens | BLOCKED | Extension was not found, so popup could not be opened. |
| Bound/sync readable | BLOCKED | Popup/admin state could not be entered, so bound/sync state could not be checked readonly. |
| Evidence privacy | PASS | No child ID, email, token, cookie, password, local profile path, private screenshot, or raw profile identifiers were recorded. |

## Blockers

- Production profile did not show the expected TimeOnChrome CWS extension ID.
- `ARTIFACT-PARITY`, `POPUP-CORE`, and `BIND-SYNC` remain unable to close from production-profile evidence.
- `docs/releases/releasemg-production-acceptance-2026-05-09.md` remains `PARTIAL / NOT CLOSED`.
- V1-minimal public release remains blocked.

## Product Owner Decisions Required

1. Confirm whether the inspected production Chrome profile is the expected bound profile.
2. If TimeOnChrome is not installed in that profile, decide whether to install/enable it and re-run readonly smoke.
3. If production-profile smoke will not be completed, explicitly record `WAIVED`, `DEFERRED`, or `RISK ACCEPTED`; otherwise release acceptance cannot close.
4. Public release and git tag remain blocked until separately approved.

## Out-Of-Scope Confirmation

- No files were modified by releaseMg.
- No product code or test code was modified.
- No rebuild/package was performed.
- No commit, push, tag, or release was performed.
- No CWS upload or submit was performed.
- No Chrome profile, storage, cloud, D1, or Worker state was modified.
