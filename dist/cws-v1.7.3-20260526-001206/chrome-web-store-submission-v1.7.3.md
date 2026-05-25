# Chrome Web Store Submission Notes - TimeOnChrome v1.7.3

## Package
- Extension root: `extension/`
- ZIP: `timeonchrome-v1.7.3-cws.zip`
- SHA256: `2021828E0C94C36629C946E30E971FC93F5B875690C78731324048A4CD020766`
- Manifest version: `1.7.3`
- Source commit before packaging: `d6a718d test: align core e2e acceptance`

## What's New
- Screen Time style usage analysis has separate views for foreground webpage usage and media usage.
- Local Admin and cloud Pages use managed-target-first usage analysis with domain fallback compatibility.
- Study, Composite, and Rest time-window rules are enforced at runtime with clearer Reminder copy.
- Classification approvals take effect as rules and can split the current session at the effective boundary.
- Popup classification requests can use the blocked Reminder target URL and show the submission result directly.
- YouTube watch URLs with playlist context are canonicalized to playlist URLs before saving requests.
- Operational fallback paths write warning/error client logs for diagnosis.
- Core E2E acceptance tests have been aligned with the current product behavior.

## Permissions Summary
- `tabs`: active tab context, tab state changes, popup/admin current-site status, and Reminder routing.
- `storage`: local configuration, sessions, ledgers, materialized stats, sync state, and logs.
- `alarms`: checkpoint, quota, sync, and maintenance scheduling.
- `declarativeNetRequest`: local block/redirect rules used by the access-control layer.
- `webNavigation`: navigation facts for access control and timing boundaries.
- `idle`: active/idle/locked state boundaries.
- `notifications`: fallback notices when in-page notices cannot be delivered.
- Host permission `<all_urls>`: classify and manage visited pages under user/parent rules.
- No dynamic `scripting` permission is requested in this package.

## Privacy Notes
- TimeOnChrome records usage duration, mode, device/profile identifiers, and managed-target attribution needed for parental review.
- Ordinary browsing does not store full URL paths as usage facts. Full URLs are used when the user explicitly submits a classification request, or when Reminder passes a blocked URL locally to Popup for confirmation.
- Page content, comments, media contents, and form contents are not collected.
- Client logs are sanitized and should not include full path/query values.
- Cloud sync stores profile/device scoped configuration, usage aggregates, settlement diagnostics, media diagnostics, and logs when upload policy is enabled.

## Reviewer Test Instructions
1. Load the ZIP as an unpacked extension; `manifest.json` is at the ZIP root.
2. Open the extension popup and verify current mode, current site status, and management entry.
3. Open Admin and check `使用分析`, `配额管理`, `访问规则`, `网站归类申请`, and `系统日志`.
4. Visit an unclassified or restricted page and verify Reminder appears.
5. Submit a site classification request from Popup and confirm the result appears inside Popup.
6. Try a YouTube watch URL with `list`, `index`, or `t` parameters and verify the submitted target is canonicalized to `https://www.youtube.com/playlist?list=...`.
7. Configure Study/Composite/Rest time windows and verify outside-window Reminder copy is mode-specific.
8. Attempt Picture-in-Picture playback and verify TimeOnChrome closes or reports the current PiP restriction.
9. In cloud Pages, verify usage analysis, settlement diagnostics, media settlement, and log management still load after sync.

## Known Release Risks / Blockers
- PiP is globally forbidden in this release; future support for Study/Composite PiP needs separate quota/statistics/cloud design.
- Short `unknown-page.chrome-local` slices from `tabActivated` before URL arrival are retained for ledger completeness and remain a release review item.
- YouTube URL canonicalization is a temporary targeted scheme; broader YouTube/Bilibili managedTarget design remains a separate milestone.
- Zero-duration diagnostic segments may exist for error/reconciliation visibility.

## CWS Boundary
This artifact is prepared for Chrome Web Store submission review, but this task does not upload the ZIP or submit it to Chrome Web Store.
