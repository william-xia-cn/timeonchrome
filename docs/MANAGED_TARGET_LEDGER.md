# ManagedTarget Ledger Decision

Status: Partially implemented.

This document records the statistics identity model for TimeOnChrome. The first implementation milestone is now present in the terminal ledger, local materialized stats, cloud ingestion/query, and admin read model. Domain-compatible stats remain available and are not removed.

## 1. Decision

TimeOnChrome will upgrade ordinary statistics and quota attribution from domain-only accounting to managedTarget-based accounting with domain fallback.

`usage_segments_v1` remains the source-of-truth ledger. When a foreground usage segment is opened or split, the runtime must snapshot the matched managedTarget and quota decision at that time. Later statistics must not reinterpret historical usage with the current rule set.

`domain` remains required as a factual and compatibility field. It is not removed, and it remains useful for diagnostics, cloud compatibility, fallback grouping, and privacy-safe unmanaged usage.

## 2. ManagedTarget Definition

A managedTarget is an explicitly configured management object, not every browsed URL.

Allowed target sources:
- `system`
- `parent`
- `pending`
- `imported`
- future approved sources such as AI-suggested but parent-approved targets

Initial target types:
- `domain`
- `subdomain`
- `platform_entry`
- `url`
- `video`
- `playlist`

Expected identity fields:
- `targetId`: stable ID; must not include classification and must not change when label changes
- `targetType`: target type from the supported set
- `namespace`: for example `generic`, `youtube`, `bilibili`
- `normalizedValue`: privacy-scoped normalized value for explicitly configured targets only
- `targetLabel`: current editable display name
- `targetSource`: source of the target
- `classification`: management classification such as `study`, `composite`, `restricted`, or `blocked`

## 3. Attribution Priority

Usage attribution should resolve to the most specific configured target, then fall back upward:

1. `playlist`
2. standalone `video` or explicit `url`, only when there is no playlist context
3. `platform_entry`, such as YouTube home/search/shorts/channel/recommendation
4. `subdomain`
5. `domain`
6. unmanaged domain fallback

For URLs that contain both a video and playlist context, playlist wins. This makes approved or restricted learning playlists the primary accounting object, while standalone videos remain available as explicit targets when no playlist is active.

Same exact target conflicts are invalid. More specific targets may override parent targets; for example a domain can be composite while a specific playlist under that domain is study.

## 4. Segment Snapshot

New `usage_segments_v1` entries snapshot target attribution and quota decision fields at segment open or split time:

- `managedTargetId`
- `managedTargetType`
- `managedTargetNamespace`
- `managedTargetValue`
- `managedTargetLabelAtTime`
- `targetSourceAtTime`
- `targetRuleId`
- `targetMatchLevel`
- `targetClassificationAtTime`
- `quotaBucketAtTime`

`targetClassificationAtTime` and `quotaBucketAtTime` are intentionally separate:

- classification describes the management category of the target
- quota bucket records the access-control and quota-consumption decision at that time

Historical segments must not be recomputed when a target is renamed, deleted, approved, rejected, or reclassified later.

## 5. Privacy Boundary

Unmanaged browsing must not persist full URLs.

If a URL does not match an explicitly configured managedTarget, the segment keeps the factual `domain` and leaves managedTarget snapshot fields empty or marked as fallback. User-facing statistics may group this as domain fallback, but the system must not create hidden full-URL targets for ordinary browsing.

Configured URL, video, playlist, and platform-entry targets may persist their normalized values because they were explicitly managed.

## 6. Aggregates And Views

`daily_usage_stats_v1` and `hourly_usage_stats_v1` support target-oriented materialized aggregation in addition to existing domain-compatible aggregation. The existing `domains` aggregate remains unchanged; the `targets` aggregate is keyed by `managedTargetId` or by `fallback:domain:{domain}` for unmanaged usage.

The target aggregate should be the ordinary user and quota view. Domain aggregate remains a compatibility and diagnostic view.

Current "今日落账 / 落账明细" tables are system diagnostics, not ordinary user-facing statistics. Ordinary user statistics should prefer managedTarget labels and fallback domain groups instead of segment-level open/close diagnostic fields.

## 7. Cloud And Compatibility

Terminal and cloud must stay upgraded together for this model:

- terminal segment builder
- local daily/hourly aggregation
- upload payload
- Worker validation and D1 schema
- cloud query APIs
- Pages/admin views
- quota usage views
- migration and compatibility tests

Old domain-only segments remain valid and display as domain fallback. No historical URL backfill is allowed.

Current implementation notes:
- `extension/core/managed-targets.js` resolves configured targets and YouTube v1 targets.
- `usage_segments_v1` upload includes target snapshot fields, but segment IDs still exclude them for idempotency.
- `daily_usage_stats_v1.targets` and `hourly_usage_stats_v1.targets` are uploaded through `/device/target-stats/v1` and `/device/hourly-target-stats/v1`.
- Cloud D1 stores segment snapshots plus `target_stats_v1` and `hourly_target_stats_v1`.
- Pages usage analysis reads target stats first and falls back to domain stats when target rows are unavailable.

YouTube v1 is a temporary product and implementation compromise:
- Submitted YouTube watch URLs with a `list` parameter are canonicalized to `https://www.youtube.com/playlist?list={playlistId}`.
- Standalone YouTube watch/short/youtu.be video URLs are canonicalized to `https://www.youtube.com/watch?v={videoId}`.
- These canonical URLs are still stored as `targetType=url`, not as first-class `playlist` / `video` target records.
- This keeps access control, statistics, and display aligned for the current release, but it is not the final YouTube management model.

Before formal release, YouTube needs a dedicated design pass covering explicit playlist/video target types, labels, conflict rules, platform-entry handling, approval UX, quota wording, cloud/Page display, and migration from the temporary canonical URL representation.

## 8. Non-Goals For The First Milestone

- no automatic saving of ordinary browsed full URLs
- no AI-created targets without parent approval
- no historical reclassification of old domain-only segments
- no removal of `domain`
- no exposure of raw diagnostic settlement tables as ordinary user statistics
