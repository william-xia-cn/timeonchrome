# Chrome Web Store Listing Copy - TimeOnChrome v1.7.6

## Short Description
TimeOnChrome helps families manage Chrome use with study modes, usage analysis, site requests, quotas, sync, and diagnostics.

## Detailed Description
TimeOnChrome is a Chrome time-management assistant for families and students. It helps parents define when study, composite, and rest browsing are allowed, review usage by managed object, approve or reject website classification requests, and keep device behavior transparent.

### What's new in v1.7.6
- Added terminal connection diagnostics so parents can see whether a device is still contacting the cloud, failing authentication, hitting server errors, or syncing successfully.
- Added macOS / Windows reinstall recovery for an existing bound terminal when a Chrome profile identity hash uniquely matches one device under the child profile.
- Improved recovery stability: pending cloud-confirmation requests are polled instead of duplicated, and quick reinstall no longer gets blocked by recent activity from the previous token.
- Recovery through heartbeat now immediately triggers a full sync so website rules, quotas, time windows, and request state return promptly.
- Updated privacy and permission explanations for identity / identity.email; TimeOnChrome does not use Google OAuth and does not store raw Chrome identity values.

### Core features
- Screen Time style usage statistics for web usage and media usage.
- Study, composite, rest, locked, and paused runtime states.
- Website management for study sites, composite sites, restricted entertainment, blocked sites, and canonical URL rules.
- Website classification requests from the child terminal with parent review in the cloud console.
- Daily quotas and mode time-window controls.
- Long-lived terminal binding, explicit cloud unbind, and reinstall recovery for eligible macOS / Windows devices.
- Local and cloud diagnostics for sync, device connectivity, timing settlement, checkpoint health, and ledger-gap detection.

### Privacy summary
TimeOnChrome stores only the data needed for time management, site classification, quota enforcement, diagnostics, device recovery, and optional cloud sync. The extension does not collect page content, passwords, comments, private messages, Google OAuth tokens, or raw Chrome identity values. Incognito fallback/unmanaged records are sanitized before durable storage and upload. Device recovery uses only a server-side keyed non-reversible hash of the Chrome profile identifier.

## Screenshots
1. 使用统计: Screen Time style web/media usage view.
2. 访问管理: site management, time quotas, and time windows.
3. 网站归类申请: parent approval workflow with YouTube canonical playlist display.
4. 子用户管理: profile, device list, config import/export, and device connection diagnostics.
5. 系统管理: checkpoint health and ledger-gap diagnostics.
