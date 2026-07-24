> **ARCHIVED / Historical evidence only.** This file is preserved for audit/history and must not be used as the current product source of truth. Use `AGENTS.md`, `PROJECT_MASTER.md`, `TASK_BOARD.md`, `DECISIONS.md`, and the current authority documents instead.

# Chrome Web Store Submission Record - V1-minimal - 2026-05-09

## Status

This file records the Chrome Web Store submission copy and permission rationale for the V1-minimal reduced-permission package.

Current recorded state:

- CWS package: `dist/cws-resubmit-20260509-122919/timeonchrome-v1.7.2-cws-resubmit-minimal-permissions.zip`
- CWS package SHA256: `BE0F712285B6661C293175C649DDDC48E0D04217B18626EB3C284EEAB32DD71C`
- Manifest version: `1.7.2`
- CWS dashboard status: `TimeOnChrome 1.7.2` submitted / `待审核`
- Public release: not completed
- Deferred publishing / public release close-out: pending Product Owner decision after CWS review state is known

This file does not authorize public release, tag, push, merge, or any further Chrome Web Store action.

## Listing

### Extension name

```text
TimeOnChrome
```

### Short description

```text
Help students separate study, mixed-use, and rest time in Chrome with gentle mode reminders and usage summaries.
```

### Detailed description

```text
TimeOnChrome helps families make Chrome time easier to understand and manage.

The extension separates browsing into study, composite, and rest modes. Study sites can stay focused, mixed-use sites are tracked as composite time, and rest or entertainment use is handled with clearer prompts and quota-aware reminders.

V1-minimal focuses on a reliable release foundation:

- Visible Study / Composite / Rest mode state in the popup.
- Gentle notices when mode transitions happen.
- Safer mode switching with clear confirmation for higher-friction transitions.
- Usage accounting for foreground browsing, background media, fullscreen video, and Picture-in-Picture.
- Durable local usage segments with cloud sync support for release readiness.
- Child-facing read-only views for usage and access rules.
- Time borrowing remains disabled in this release and is deferred for a future redesign.

This release does not include AI content classification, full V1 composite routing, or automatic cleanup of legacy cloud statistics.
```

### What's new

```text
V1-minimal release candidate:

- Restored in-page mode prompt delivery.
- Fixed popup-triggered mode switch notices so they target the webpage tab.
- Updated auto transition delays: Rest to Composite 30s, Rest to Study 45s, Composite to Study 45s.
- Fixed video playback accounting for idle + media, fullscreen, and Picture-in-Picture use.
- Restored Picture-in-Picture cleanup during critical mode transitions.
- Added Cloud Stats v1 minimal sync foundation using usage segments and stats_v1.
- Kept time borrowing disabled for this release.
```

## Privacy

### Single purpose

```text
TimeOnChrome helps families manage and understand student Chrome usage by classifying browsing time into study, composite, and rest modes, showing reminders, and syncing usage/configuration data for the family account.
```

### Current reduced-permission package

The CWS resubmission package is documented as using:

```text
tabs
storage
alarms
declarativeNetRequest
webNavigation
idle
notifications
host_permissions: <all_urls>
```

This document intentionally does not justify permissions removed from the reduced-permission package, including `declarativeNetRequestFeedback`, `management`, or `scripting`.

### Permission justification

```text
tabs: Needed to identify the active tab, current domain, and target tab for mode notices.

storage: Needed to store local configuration, usage summaries, session state, sync status, and extension settings.

alarms: Needed for periodic sync, heartbeat, daily reset, and usage checkpoint tasks.

declarativeNetRequest: Needed to apply site access rules locally in Chrome.

webNavigation: Needed to detect navigation changes and apply mode/access decisions to the current page.

idle: Needed to avoid counting idle time as active foreground usage.

notifications: Needed for fallback user-visible notices when in-page delivery is unavailable.

host permissions <all_urls>: Needed because site classification and usage accounting depend on the domain of the page being visited across the web.
```

### Data usage statement

```text
TimeOnChrome records browsing domains, mode state, usage durations, and sync status needed for family usage summaries and access rules. The extension does not collect passwords, cookies, page contents, keystrokes, or payment information.

Usage data is used only to provide time management, access-rule, and reporting features for the family account. Time borrowing is disabled in this V1-minimal release.
```

## Distribution / rollout

```text
Recommended publishing mode: deferred publishing after Chrome Web Store review.

The reduced-permission package has been submitted for review. Public release remains pending and requires separate Product Owner release close-out approval.
```

## Reviewer test instructions

```text
1. Install the extension from the submitted package.
2. Open the extension popup and confirm Study / Rest / Composite modes are visible.
3. Visit a study site and confirm the extension can remain in or return to Study mode.
4. Visit a mixed-use/composite site and confirm a gentle mode notice is shown and time is counted separately as composite time.
5. Visit a restricted or unclassified site from Study mode and confirm the reminder page explains that continuing will not count as study time.
6. Play foreground or fullscreen video and confirm browsing/media time continues to be accounted for.
7. Start Picture-in-Picture video and switch modes; critical mode transitions should close PiP when required.
8. Open the read-only usage/access-rule view and confirm it does not expose parent setup or destructive controls to the child-facing path.

Notes:
- This release does not enable time borrowing.
- This release does not include AI content classification.
- Legacy cloud stats cleanup is out of scope; V1-minimal uses usage_segments_v1 + stats_v1 as the active release truth path.
```

## Final submission / public release gate

```text
Reduced-permission package submitted for Chrome Web Store review.
CWS dashboard status recorded as: 待审核.
Public release not completed.

Do not perform public release, tag, push, merge, or any further Chrome Web Store action without separate Product Owner approval.
```
