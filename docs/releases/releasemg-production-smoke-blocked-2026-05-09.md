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

## Rerun After Manual Reload

Result: `BLOCKED / NOT CLOSED`

Product Owner reported that TimeOnChrome was reloaded successfully in a profile. ReleaseMg then reran production-profile readonly smoke.

Observed result:

| Check | Result | Evidence summary |
|---|---|---|
| Production Chrome reachable | PARTIAL | Chrome was reachable through readonly CDP and `chrome://extensions/` could be opened. |
| TimeOnChrome installed | BLOCKED | ReleaseMg-controlled `chrome://extensions/` still did not show TimeOnChrome; only one non-target extension was observed. |
| TimeOnChrome enabled | BLOCKED | TimeOnChrome was not visible, so enabled state could not be confirmed. |
| Installed version `1.7.2` | BLOCKED | TimeOnChrome was not visible, so installed version could not be confirmed. |
| Popup core opens | BLOCKED | Direct navigation to the expected CWS extension popup URL was blocked by Chrome; popup did not open. |
| Bound/sync state readonly | BLOCKED | Extension popup/admin context was unreachable, so bound/sync state could not be checked readonly. |
| Evidence privacy | PASS | No child ID, email, token, cookie, password, local profile path, raw profile/device ID, or private screenshot was recorded. |

Interpretation:

- The manual reload likely occurred in a different Chrome profile or browser instance than the one ReleaseMg can inspect.
- Repeating readonly smoke against the same ReleaseMg-controlled profile is not useful until the profile mismatch is resolved.
- `ARTIFACT-PARITY`, `POPUP-CORE`, and `BIND-SYNC` remain blocked.

Remaining Product Owner decision:

- Authorize ReleaseMg to close/restart Chrome with the configured production profile template, or provide a readonly inspection path to the exact profile where TimeOnChrome was manually reloaded.
- If neither will be done, explicitly classify production-profile smoke as `WAIVED`, `DEFERRED`, or `RISK ACCEPTED`.

## Correction - CWS installed-ID parity is not yet applicable

Date: 2026-05-10

Product Owner observed an installed TimeOnChrome extension with ID `flnneafdppomlhgciohadpdfmhkkkkpp`.

This ID does not match the Chrome Web Store product ID / future CWS installed extension ID:

```text
mkggamgaeemnlmlflpekacbknochbmom
```

Corrected interpretation:

- The CWS item is still `待审核`, so Chrome Web Store installation of the reviewed public item is not currently available.
- The reloaded extension is likely an unpacked / local-load instance.
- Version `1.7.2` can support production-profile functional smoke if enabled.
- The installed extension cannot be counted as CWS artifact installed-ID parity, but CWS installed-ID parity also must not be treated as a currently closable gate before review approval.
- CWS installed-ID parity is `BLOCKED_BY_CWS_REVIEW / NOT YET APPLICABLE`.
- `ARTIFACT-PARITY` remains limited to recorded package/hash/manifest evidence plus CWS dashboard status; it must not be rewritten as CWS installed parity `PASS`.

Corrected releaseMg classification guidance:

| Check | Corrected result |
|---|---|
| TimeOnChrome installed | PASS if the installed item is visible as TimeOnChrome |
| Installed version | PASS if visible version is `1.7.2` |
| Enabled | PASS only if the Chrome extensions toggle is enabled |
| Extension ID parity with CWS | BLOCKED_BY_CWS_REVIEW / NOT YET APPLICABLE before CWS approval |
| Popup-core smoke | Continue functional verification if enabled |
| Bind-sync smoke | Continue functional readonly verification if popup/admin context is reachable |
| Artifact parity | Package/hash/manifest/dashboard evidence only; no CWS installed-ID parity claim before approval |

Next action: continue production-profile functional smoke against the visible unpacked TimeOnChrome instance. Defer CWS installed-ID parity until Chrome Web Store review is approved and the item is installable.

## Functional Smoke Rerun - 2026-05-10

Result: `PARTIAL / NOT CLOSED`

ReleaseMg continued production-profile functional smoke against the visible unpacked/local-load TimeOnChrome instance.

| Check | Result | Evidence summary |
|---|---|---|
| TimeOnChrome installed | PASS_WITH_MANUAL_EVIDENCE | Product Owner saw TimeOnChrome in the target profile's `chrome://extensions/`. |
| Enabled | PARTIAL | Product Owner saw extension details and a Service Worker entry, but releaseMg did not confirm enabled state through readonly automation. |
| Installed version | PASS_WITH_MANUAL_EVIDENCE | Product Owner saw version `1.7.2`. |
| CWS installed-ID parity | BLOCKED_BY_CWS_REVIEW / NOT YET APPLICABLE | Current installed ID is `flnneafdppomlhgciohadpdfmhkkkkpp`, an unpacked/local-load ID. CWS item remains under review, so public CWS installation cannot yet be checked. |
| Popup-core smoke | BLOCKED | releaseMg could not enter the target profile's controllable popup DOM; Study / Rest / Composite, usage summary, and absence of borrowing entry remain unverified by releaseMg. |
| Bind-sync smoke | BLOCKED | Popup/admin extension context was unreachable; bound/sync state could not be checked readonly by releaseMg. |
| Evidence privacy | PASS | No child ID, email, token, cookie, password, profile path, raw profile ID, raw device ID, or private screenshot was recorded. |

Blockers:

- releaseMg still cannot control or inspect the target profile's TimeOnChrome popup DOM.
- `Enabled`, `POPUP-CORE`, and `BIND-SYNC` remain not closed at releaseMg evidence level.
- CWS installed-ID parity remains deferred by CWS review state and is not a current blocker for unpacked functional smoke.

Remaining Product Owner decisions:

- Provide manual evidence for popup-core and bound-sync, or authorize a path that lets releaseMg inspect the target profile popup/admin context.
- If popup-core or bind-sync will not be completed before public release close-out, explicitly classify each as `WAIVED`, `DEFERRED`, or `RISK ACCEPTED`.

## Popup Manual Evidence - 2026-05-10

Result: `PARTIAL_WITH_MANUAL_EVIDENCE / NOT CLOSED`

Product Owner provided popup visual evidence. This is manual visual evidence, not automated CDP evidence.

| Check | Result | Evidence summary |
|---|---|---|
| TimeOnChrome installed | PASS_WITH_MANUAL_EVIDENCE | Popup screenshot shows TimeOnChrome can open in the target profile. |
| Installed version | PASS_WITH_MANUAL_EVIDENCE | Product Owner previously saw version `1.7.2` in the extension page; popup screenshot itself does not show version. |
| Enabled | PASS_WITH_MANUAL_EVIDENCE | Popup can open, indicating the current instance is runnable. |
| Popup-core smoke | PASS_WITH_MANUAL_EVIDENCE | Popup shows Study / Rest / Composite, current usage, and online time. |
| Borrowing disabled | PASS_WITH_MANUAL_EVIDENCE | Popup screenshot does not show an active borrowing entry. |
| Current domain / usage display | PASS_WITH_MANUAL_EVIDENCE | Popup shows current domain `chromewebstore.google.com` and today usage display. |
| Bind-sync smoke | PARTIAL | Screenshot does not show bound/sync health, so this remains not closed. |
| CWS installed-ID parity | BLOCKED_BY_CWS_REVIEW / NOT YET APPLICABLE | CWS item remains under review and cannot yet be installed as the public item. |
| Evidence privacy | PASS | Screenshot does not show child ID, email, token, cookie, profile path, raw profile ID, or raw device ID. |

Remaining blocker:

- `BIND-SYNC` remains not closed. It needs readonly evidence of bound/sync health without exposing child ID, email, token, raw device ID, raw profile ID, or local profile path; or Product Owner must explicitly classify it as `WAIVED`, `DEFERRED`, or `RISK ACCEPTED`.
