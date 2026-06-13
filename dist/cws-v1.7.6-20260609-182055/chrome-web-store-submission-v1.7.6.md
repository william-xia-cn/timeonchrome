# Chrome Web Store Submission - TimeOnChrome v1.7.6

## Package
- ZIP: timeonchrome-v1.7.6-cws.zip
- SHA256: 56FAAF91F29D1E2C705424DB7FC0649A342274EB8C55AE9D2A167FC322AE33CA
- Manifest version: 1.7.6
- Package root: extension/ contents, with manifest.json at ZIP root.

## Permission Summary
Permissions:
- tabs
- storage
- alarms
- declarativeNetRequest
- webNavigation
- idle
- notifications
- identity
- identity.email

Host permissions:
- <all_urls>

This version does **not** request scripting, management, or declarativeNetRequestFeedback.
The identity permissions are used only with chrome.identity.getProfileUserInfo() to read the Chrome profile account identifier for macOS / Windows device-binding recovery after reinstall. TimeOnChrome does not call chrome.identity.getAuthToken(), does not request Google OAuth scopes, does not store Google OAuth tokens, and does not store raw Chrome identity values. The cloud stores only a server-side keyed non-reversible HMAC hash for recovery matching.

## What's New
- Added server-side device access audit so the cloud console can distinguish no terminal requests, auth failures, 5xx failures, payload failures, and successful heartbeat/config/sync paths.
- Added macOS / Windows extension reinstall recovery for an existing deviceId when one same-platform bound device uniquely matches the Chrome profile identity hash.
- Made recovery requests idempotent: terminals waiting for cloud confirmation poll the existing request instead of creating duplicate requests.
- Removed the recent-active false block for unique same-platform recovery candidates; quick reinstall can recover the original device immediately.
- A heartbeat-triggered binding recovery now immediately starts a full sync, so website rules, quotas, time windows, and request state return to the terminal without waiting for the next sync alarm.
- Hardened legacy device sync compatibility with current Worker schema.

## Reviewer Notes
- TimeOnChrome is intended for parent-managed Chrome usage control.
- Purple Nickel remediation: the public privacy policy and store listing now include a prominent data-use disclosure. They state what data is collected, when collection begins, how data is used, where it is stored, who can access it, how it is shared, how long it is retained, and how users can stop collection or delete data.
- Core local behavior works without cloud login; cloud sync and parent console features require login.
- The extension uses static content scripts from the manifest. It does not use dynamic scripting permission.
- The extension uses identity.email only for weak device-binding recovery. The raw Chrome profile identifier is not stored locally or in the cloud; only a keyed non-reversible hash is stored server-side. No Google OAuth token flow is used.
- Local timing/access data can be collected after the extension is installed and enabled. Cloud upload starts only after parent sign-in and device binding. Parent/guardian users can see child-profile rules, device state, usage statistics, classification requests, and diagnostics in the cloud console.
- <all_urls> is required because access decisions, time tracking, and classification requests must work across arbitrary child browsing destinations.
- declarativeNetRequest is used for access-management support. The extension does not request DNR feedback permission.
- Incognito unmanaged/fallback records are sanitized before durable local storage and cloud upload.
- Device access audit logs store request summaries only: endpoint category, status/result, device/profile references, version, request id, and counts. They do not store browsing URLs, page content, device tokens, poll tokens, Google tokens, passwords, or raw Chrome identity.
- The extension does not collect page body content, form input, private messages, comments, site cookies, payment details, Google OAuth tokens, or raw Chrome identity values.
- Users can stop future local collection by disabling or uninstalling the extension. Parents can stop cloud sync by unbinding a device, and can delete or replace profile configuration through the product UI or support channel.

## Test Instructions
1. Load the ZIP or unpacked extension/ directory in Chrome.
2. Open the popup and verify mode status, current-site display, and management entry.
3. Open local Admin and verify 使用分析, 访问管理, 系统管理, cloud connection status, and binding recovery status.
4. In the cloud console, verify 使用统计, 访问管理, 网站归类申请, 子用户管理, device connection diagnostics, and 系统管理 with demo/test data.
5. Submit a classification request from a Reminder page and verify the canonical URL appears in the review list.
6. For reinstall recovery validation, use a test child profile with one bound macOS or Windows device and confirm the extension recovers the same device id after local extension data is removed.

## Known Risks / Follow-up Items
- YouTube playlist/video handling is still a temporary canonical URL policy, not the final explicit managedTarget model.
- Ledger-gap diagnostics identify observed activity without durable segment results, but they do not read Chrome History and do not backfill historical browsing.
- Full PiP product support remains deferred; current policy is restrictive.

## Assets
- Screenshots: screenshots/01-usage-analysis.png through screenshots/05-system-management-logs.png
- Small promo: promo/small-promo-440x280.png
- Marquee promo: promo/marquee-1400x560.png
