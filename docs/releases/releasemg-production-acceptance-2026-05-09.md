# ReleaseMg Production Acceptance - 2026-05-09

## Release identity

- Product: TimeOnChrome
- Version: `1.7.2`
- Commit: `e3f62391813a22f821aa79356db147da86f0fb49`
- Source release artifact: `dist/v1-minimal-20260509-023832/timeonchrome-v1.7.2-v1-minimal.zip`
- Source release artifact SHA256: `A0A5C541A5A7D047E040D2163BF8735971798112E18E1D223BB9D55D80D7190B`
- CWS resubmission artifact: `dist/cws-resubmit-20260509-122919/timeonchrome-v1.7.2-cws-resubmit-minimal-permissions.zip`
- CWS resubmission artifact SHA256: `BE0F712285B6661C293175C649DDDC48E0D04217B18626EB3C284EEAB32DD71C`
- Source manifest version: `1.7.2`
- CWS resubmission artifact manifest version: `1.7.2`
- CWS resubmission artifact permissions: `tabs`, `storage`, `alarms`, `declarativeNetRequest`, `webNavigation`, `idle`, `notifications`; host permission `<all_urls>`
- Installed extension version: not verified in this run; see `ARTIFACT-PARITY`
- CWS dashboard version: `1.7.2`
- CWS dashboard status: `待审核`
- Public release status: not publicly released
- Overall ReleaseMg production acceptance: PARTIAL / NOT CLOSED
- Chrome profile: production profile was referenced only through the approved ReleaseMg mechanism; private local path omitted

## Execution scope

| Item | Value |
|---|---|
| Production profile used | Yes, read-only inspection attempted |
| Gate.Test profile used | No |
| Destructive actions allowed | No |
| Config changes allowed | No |
| CWS submit allowed | No |
| Cloud/D1 writes allowed | No |
| Worker deploy allowed | No |
| Migration allowed | No |
| Screenshots captured | No |

## Results

| Case | Result | Evidence summary | Notes |
|---|---|---|---|
| PREFLIGHT | PASS | Current branch is `master`; current commit is `e3f62391813a22f821aa79356db147da86f0fb49`; `manifest.json` version is `1.7.2`; known risks are carried forward below. | Workspace is dirty with unrelated pre-existing changes; this report does not clean or modify them. |
| ARTIFACT-PARITY | PARTIAL | Source release artifact exists and hash matches the recorded release record. CWS resubmission artifact exists, hash is recorded, and its manifest version is `1.7.2`. CWS dashboard shows version `1.7.2`. | The source release artifact still contains previously rejected permissions; the CWS resubmission artifact is the reduced-permission package. Installed extension version could not be verified from the inspected production profile. |
| POPUP-CORE | BLOCKED | TimeOnChrome popup could not be opened from the inspected production profile because the extension was not verifiably registered/enabled in the inspected profile state. | No profile data was cleared, rebound, or modified. |
| BIND-SYNC | PARTIAL | Prior recorded production-profile hydration evidence in `PROJECT_MASTER.md` shows bound-state cloud identity hydration and successful force sync without exposing private identifiers. | This run did not re-trigger sync and did not print child/profile/device identifiers. Current live production-profile extension registration was not verified. |
| CWS-STATUS | PASS | Chrome Web Store Developer Dashboard opened in an authenticated browser session. Product row showed `TimeOnChrome`, version `1.7.2`, status `待审核`, last updated 2026-05-09. | Account details were intentionally omitted. No upload or submit action was performed in this run. |
| TIMING-SANITY-LIGHT | DEFERRED | Not performed. | Deferred because live production extension registration/popup was not verified in this read-only run. Automated timing coverage remains documented in `v1-minimal-core-acceptance-coverage-2026-05-09.md`. |
| MODE-SWITCH | DEFERRED | Not performed. | Deferred to avoid disturbing production state. Automated and prior manual evidence remain documented; this report does not convert that evidence into production-profile PASS. |
| ACCESS-CLASSIFICATION | DEFERRED | Not performed. | Deferred to avoid mutating browsing state or site-rule state in the production profile. Automated routing/reminder evidence remains documented. |
| RECOVERY-SMOKE | DEFERRED | Not performed. | Deferred in this report because recovery smoke requires explicit PO approval and can disturb a live production session. Recovery/System Gate remains `PASS_WITH_MANUAL_EVIDENCE` from prior Gate.Test close-out. No Product Owner waiver is recorded in this report. |
| EVIDENCE-PRIVACY | PASS | This report contains no child ID, account email, token, cookie, password, private screenshot, local Chrome profile path, raw profile ID, raw device ID, or raw D1 output. | Only redacted release-management facts are recorded. |

## Artifact notes

The original V1-minimal source release artifact is preserved as release-preparation evidence, but it predates the Chrome Web Store permission rejection remediation and still contains permissions that were later removed from the CWS resubmission package.

The current CWS-relevant package for this report is:

```text
dist/cws-resubmit-20260509-122919/timeonchrome-v1.7.2-cws-resubmit-minimal-permissions.zip
```

Its manifest aligns with the current source `manifest.json` permission set:

```text
tabs, storage, alarms, declarativeNetRequest, webNavigation, idle, notifications
host_permissions: <all_urls>
```

## Chrome Web Store readiness

- Listing checked: previously updated during CWS resubmission workflow; not modified in this run
- Privacy checked: previously updated during CWS resubmission workflow; not modified in this run
- Distribution checked: not modified in this run
- Test instructions checked: previously updated during CWS resubmission workflow; not modified in this run
- Deferred publishing selected: not re-verified in this run
- Current CWS status: `待审核`

## Known risks carried forward

- Legacy cloud `stats` duplicate historical risk remains a `KNOWN_RISK`; V1-minimal release truth is `usage_segments_v1` + `stats_v1`.
- V1-minimal release records have been aligned to state that a reduced-permission package was submitted and CWS currently shows `待审核`; this remains not publicly released.
- Production installed-extension version and popup/bind smoke were not completed in this report because TimeOnChrome was not verifiably registered/enabled in the inspected production profile state.
- Windows/macOS real Chrome smoke remains deferred unless separately completed and recorded.
- Manual Recovery/System evidence remains operator-confirmed evidence, not fully automated evidence.
- Time borrowing remains disabled/deferred for V1-minimal.
- Full V1 model, AI classification, composite routing rebuild, legacy stats cleanup, Worker deploy, D1 migration/write, and production data cleanup remain out of scope.

## Stop / rollback criteria triggered

- TimeOnChrome installed extension could not be verified in the inspected production profile state.
- Because of that, ReleaseMg did not proceed to popup, timing, mode-switch, access-classification, or recovery actions.

No destructive stop condition was triggered. No logout, rebind, storage clear, rule change, quota change, sync write, Worker deploy, D1 migration, D1 write, or CWS upload/submit was performed.

## Waivers and deferrals

| Item | Result | Reason | Approved by |
|---|---|---|---|
| TIMING-SANITY-LIGHT | DEFERRED | Production extension popup/registration was not verified in this read-only run. | ReleaseMg SOP boundary |
| MODE-SWITCH | DEFERRED | Avoid disturbing real production mode state. | ReleaseMg SOP boundary |
| ACCESS-CLASSIFICATION | DEFERRED | Avoid live browsing/rule-state disturbance. | ReleaseMg SOP boundary |
| RECOVERY-SMOKE | DEFERRED | Recovery smoke requires explicit PO approval and can disturb the live session. No explicit Product Owner waiver is recorded in this report. | ReleaseMg SOP boundary |

## Final decision

- Public release claimed: no
- Chrome Web Store status claimed: `待审核`
- Submit for review performed in this run: no
- Product Owner approval phrase for this run: not provided and not needed; no final submission action was attempted
- Remaining release blocker: installed extension / popup / production bound profile readonly smoke must be re-run on a profile where TimeOnChrome is verifiably installed and enabled, or explicitly waived by Product Owner

## Addendum - production smoke rerun handoff result

Date: 2026-05-09

Source: `docs/handoffs/outbox/HANDOFF-v1-minimal-production-smoke-to-releasemg.md`

Result: `BLOCKED / NOT CLOSED`

ReleaseMg performed a bounded readonly production-profile smoke. Chrome was reachable, but the expected TimeOnChrome CWS extension ID `mkggamgaeemnlmlflpekacbknochbmom` was not present in the inspected `chrome://extensions/` extension list. Therefore installed/enabled/version, popup-core, and bind-sync could not be verified.

This addendum does not change the overall production acceptance result. It remains:

```text
PARTIAL / NOT CLOSED
```

Remaining required action: Product Owner must either confirm the expected production profile and allow a re-run after TimeOnChrome is installed/enabled, or explicitly record `WAIVED`, `DEFERRED`, or `RISK ACCEPTED`.

## Addendum - production smoke rerun after manual reload

Date: 2026-05-09

Result: `BLOCKED / NOT CLOSED`

Product Owner reported that TimeOnChrome was reloaded successfully in a profile. ReleaseMg reran readonly production smoke, but the ReleaseMg-controlled `chrome://extensions/` view still did not show TimeOnChrome. Direct navigation to the expected CWS extension popup URL was blocked by Chrome.

Interpretation: the profile where Product Owner reloaded TimeOnChrome appears not to be the same profile/browser instance ReleaseMg is inspecting.

This does not change the overall production acceptance result:

```text
PARTIAL / NOT CLOSED
```

Next useful step: align ReleaseMg to the exact profile where TimeOnChrome is installed, or explicitly classify this gate as `WAIVED`, `DEFERRED`, or `RISK ACCEPTED`.

## Correction - CWS installed-ID parity is not yet applicable

Date: 2026-05-10

Product Owner observed an installed TimeOnChrome extension with ID `flnneafdppomlhgciohadpdfmhkkkkpp`. This does not match the Chrome Web Store product ID / future CWS installed ID `mkggamgaeemnlmlflpekacbknochbmom`.

Corrected interpretation:

- The CWS item is still `待审核`; therefore installing the reviewed public CWS item is not currently possible.
- The visible installed extension is an unpacked / local-load instance, not proof that the CWS item itself is installed.
- Installed/version/enabled checks may continue as production-profile functional smoke if the item is visible and enabled.
- CWS installed-ID parity is `BLOCKED_BY_CWS_REVIEW / NOT YET APPLICABLE` until Chrome Web Store review is approved and the item is installable.
- `ARTIFACT-PARITY` remains limited to package/hash/manifest evidence and CWS dashboard status; it must not include a CWS installed-ID parity `PASS` before approval.
- `POPUP-CORE` and `BIND-SYNC` may continue as functional readonly smoke, but their success must not be described as CWS installed artifact parity.

This correction supersedes any implication that the only possible blocker is profile mismatch. The current gate can continue as functional smoke, while CWS installed-ID parity is deferred until review approval makes installation possible.

## Addendum - functional smoke rerun

Date: 2026-05-10

Result: `PARTIAL / NOT CLOSED`

ReleaseMg continued production-profile functional smoke against the visible unpacked/local-load TimeOnChrome instance.

| Check | Result | Evidence summary |
|---|---|---|
| TimeOnChrome installed | PASS_WITH_MANUAL_EVIDENCE | Product Owner saw TimeOnChrome in the target profile's `chrome://extensions/`. |
| Enabled | PARTIAL | Product Owner saw extension details and a Service Worker entry, but releaseMg did not confirm enabled state through readonly automation. |
| Installed version | PASS_WITH_MANUAL_EVIDENCE | Product Owner saw version `1.7.2`. |
| CWS installed-ID parity | BLOCKED_BY_CWS_REVIEW / NOT YET APPLICABLE | CWS item is still under review; current installed ID is the unpacked/local-load ID `flnneafdppomlhgciohadpdfmhkkkkpp`. |
| Popup-core smoke | BLOCKED | releaseMg could not inspect the target profile popup DOM; core popup state remains unverified at releaseMg level. |
| Bind-sync smoke | BLOCKED | Popup/admin extension context was unreachable; bound/sync state remains unverified at releaseMg level. |
| Evidence privacy | PASS | No private account/profile/device identifiers or local profile path were recorded. |

This does not close ReleaseMg production acceptance. It remains:

```text
PARTIAL / NOT CLOSED
```

To close production functional smoke, Product Owner must either provide acceptable manual evidence for popup-core and bind-sync, enable releaseMg access to the target profile popup/admin context, or explicitly classify the remaining items as `WAIVED`, `DEFERRED`, or `RISK ACCEPTED`.

## Addendum - popup manual evidence

Date: 2026-05-10

Result: `PARTIAL_WITH_MANUAL_EVIDENCE / NOT CLOSED`

Product Owner provided popup visual evidence. This is manual visual evidence, not automated CDP evidence.

| Check | Result | Evidence summary |
|---|---|---|
| TimeOnChrome installed | PASS_WITH_MANUAL_EVIDENCE | Popup screenshot shows TimeOnChrome can open. |
| Installed version | PASS_WITH_MANUAL_EVIDENCE | Product Owner previously saw version `1.7.2`; popup screenshot itself does not show version. |
| Enabled | PASS_WITH_MANUAL_EVIDENCE | Popup can open, indicating the current instance is runnable. |
| Popup-core smoke | PASS_WITH_MANUAL_EVIDENCE | Popup shows Study / Rest / Composite, current usage, and online time. |
| Borrowing disabled | PASS_WITH_MANUAL_EVIDENCE | Popup screenshot does not show an active borrowing entry. |
| Current domain / usage display | PASS_WITH_MANUAL_EVIDENCE | Popup shows current domain `chromewebstore.google.com` and today usage display. |
| Bind-sync smoke | PARTIAL | Screenshot does not show bound/sync health, so this remains not closed. |
| CWS installed-ID parity | BLOCKED_BY_CWS_REVIEW / NOT YET APPLICABLE | CWS item remains under review and cannot yet be installed as the public item. |
| Evidence privacy | PASS | Screenshot does not show private account/profile/device identifiers or local profile path. |

Production functional smoke can be upgraded from `BLOCKED` to `PARTIAL_WITH_MANUAL_EVIDENCE`, but ReleaseMg production acceptance remains:

```text
PARTIAL / NOT CLOSED
```

Remaining blocker: `BIND-SYNC` requires readonly evidence or explicit `WAIVED`, `DEFERRED`, or `RISK ACCEPTED` classification.

## Addendum - bind-sync manual evidence

Date: 2026-05-10

Result: `PASS_WITH_MANUAL_EVIDENCE`

Product Owner provided admin/status visual evidence. This is manual visual evidence, not automated CDP evidence.

| Check | Result | Evidence summary |
|---|---|---|
| Bind state | PASS_WITH_MANUAL_EVIDENCE | Admin local status page shows the device is bound. |
| Sync health | PASS_WITH_MANUAL_EVIDENCE | Admin local status page shows cloud sync state, configuration version, last sync timestamp, and a manual sync action. |
| Config readability | PASS_WITH_MANUAL_EVIDENCE | Configuration version is visible, indicating configuration state is readable. |
| Evidence privacy | PASS_WITH_REDACTION_REQUIRED | Screenshot shows a short local device ID. The repo record does not transcribe it and must not store raw child/account/token/profile/device identifiers. |

Production functional smoke is now:

```text
PASS_WITH_MANUAL_EVIDENCE
```

ReleaseMg production acceptance remains:

```text
PARTIAL / NOT CLOSED
```

Reason: CWS review is still `待审核`, and CWS installed-ID parity remains `BLOCKED_BY_CWS_REVIEW / NOT YET APPLICABLE` until the public item is approved and installable. Public release and git tag remain blocked pending Product Owner decision.

## Private data policy

PASS. No child ID, token, cookie, password, account details, private screenshots, local Chrome profile path, raw profile identifiers, raw device identifiers, or raw D1 output are recorded in this report.
