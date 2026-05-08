# Chrome Web Store Submission Text - V1-minimal - 2026-05-09

This file prepares Chrome Web Store submission copy only. It does not authorize upload or final Submit for Review.

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
- Gentle in-page notices when mode transitions happen.
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

### Permission justification

```text
tabs: Needed to identify the active tab, current domain, and target tab for mode notices.

storage: Needed to store local configuration, usage summaries, session state, sync status, and extension settings.

alarms: Needed for periodic sync, heartbeat, daily reset, and usage checkpoint tasks.

declarativeNetRequest and declarativeNetRequestFeedback: Needed to apply and diagnose site access rules locally in Chrome.

webNavigation: Needed to detect navigation changes and apply mode/access decisions to the current page.

idle: Needed to avoid counting idle time as active foreground usage.

management: Needed to inspect extension state for local diagnostics.

notifications: Needed for fallback user-visible notices when in-page delivery is unavailable.

scripting: Needed to deliver in-page mode notices to eligible pages.

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

Do not click final Submit for Review until Product Owner separately confirms the release submission step.
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

## Final submission gate

```text
Prepared only. Not uploaded. Not submitted.

Final Chrome Web Store Submit for Review requires separate Product Owner approval.
```
