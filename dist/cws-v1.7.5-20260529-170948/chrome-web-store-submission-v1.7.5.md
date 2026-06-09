# Chrome Web Store Submission — TimeOnChrome v1.7.5

## Package
- ZIP: timeonchrome-v1.7.5-cws.zip
- SHA256: 372FE156B28454C931F3202C266C88D47C8A4C1E76CB6C3B03FD66762AA195AC
- Manifest version: 1.7.5
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
The identity permissions are used only with `chrome.identity.getProfileUserInfo()` to read the Chrome profile account identifier for macOS / Windows device-binding recovery after reinstall. TimeOnChrome does not call `chrome.identity.getAuthToken()`, does not request Google OAuth scopes, and does not store Google OAuth tokens.

## What's New
- Refreshed TimeOnChrome icon system and Chrome toolbar mode badge.
- Cloud console navigation updated to 使用统计, 访问管理, 网站归类申请, 子用户管理, and 系统管理.
- Configuration import now uses a difference confirmation workflow before applying changes.
- Account login sessions use refresh tokens; new clients no longer save reversible account passwords.
- Timing settlement diagnostics now include checkpoint health, ledger-gap detection, and mode-transition audit logs.
- macOS / Windows child terminals can recover an existing cloud device binding after extension reinstall when a previously linked Chrome profile identity uniquely matches one bound device on the same platform.
- Website classification continues to canonicalize YouTube playlist/video URLs as a temporary compatibility policy.

## Reviewer Notes
- The extension is intended for parent-managed Chrome usage control.
- Core local behavior works without cloud login; cloud sync and parent console features require login.
- The extension uses static content scripts from the manifest. It does not use dynamic scripting permission.
- The extension uses `identity.email` only to read the Chrome profile account identifier for weak device recovery. The raw identifier is not stored in the cloud; only a keyed non-reversible hash is stored. No OAuth token flow is used.
- <all_urls> is required because access decisions, time tracking, and classification requests must work across arbitrary child browsing destinations.
- declarativeNetRequest is used for access-management support. The extension does not request DNR feedback permission.
- Incognito unmanaged/fallback records are sanitized before durable local storage and cloud upload.
- PiP is currently globally restricted by policy and may show a clear notice when closed by TimeOnChrome.
- Privacy policy remediation for Purple Nickel: the privacy policy has been updated to describe user data collection, processing, storage, sharing, diagnostic logs, cloud sync, incognito sanitization, current permissions, and the Chrome Web Store Limited Use statement. The stale management permission reference was removed.

## Test Instructions
1. Load the ZIP or unpacked extension/ directory in Chrome.
2. Open the popup and verify mode status, current-site display, and management entry.
3. Open local Admin and verify 使用分析, 访问管理, 系统管理, and system logs.
4. In the cloud console, verify 使用统计, 访问管理, 网站归类申请, 子用户管理, and 系统管理 with demo/test data.
5. Submit a classification request from a Reminder page and verify the canonical URL appears in the review list.

## Known Risks / Follow-up Items
- YouTube playlist/video handling is still a temporary canonical URL policy, not the final explicit managedTarget model.
- Ledger-gap diagnostics identify observed activity without durable segment results, but they do not read Chrome History and do not backfill historical browsing.
- Full PiP product support remains deferred; current policy is restrictive.

## Assets
- Screenshots: screenshots/01-usage-analysis.png through screenshots/05-system-management-logs.png
- Small promo: promo/small-promo-440x280.png
- Marquee promo: promo/marquee-1400x560.png
