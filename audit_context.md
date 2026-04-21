# Project audit context

## Product goal
A parental time management Chrome extension that tracks website usage duration, enforces daily quotas, and syncs configuration from a cloud console. The system uses an event-driven attention engine to accurately measure user attention across tabs while preventing duplicate counting and surviving Service Worker restarts.

## Core concepts
- **Signal** = raw input from Chrome API (tab activation, URL change, focus, idle, media state)
- **Context** = merged signal state (tabId, domain, isFocused, isIdle, isAudible, isPiP)
- **State** = resolved attention level: ACTIVE, BACKGROUND_ACTIVE, PASSIVE, IDLE
- **Event** = append-only START/END record with state, domain, timestamp
- **Session** = current state snapshot, single source of truth for recovery
- **Quota** = daily time limits (online, study, rest, undetermined) with borrow mechanism
- **Config** = cloud-sourced configuration (studyList, compositeList, unsafeList, quotas)

## Architectural truth sources
- `event_log_v1` = duration tracking truth (append-only, 24h retention)
- `session_v1` = current state truth (chrome.storage.session)
- Cloud `profiles.config` = configuration truth (read-only pull, terminal never pushes)
- UI state is derived from event-log aggregation, not authoritative

## Critical invariants
- Event-log must be append-only; START/END events are never modified after creation
- Session is the single source of truth; event-log is historical record
- Cloud config is the single source of truth; terminal only reads, never writes config
- PASSIVE state must count as 0 duration; only ACTIVE and BACKGROUND_ACTIVE count as 1
- No domain must resolve to IDLE (prevent chrome:// and chrome-extension:// pollution)
- Multi-tab same-domain must not double-count duration
- Recovery must not double-count after SW restart; sleep threshold is 90s
- Quota state transitions must be monotonic within a day (locked stays locked until daily reset)
- Config binding (device_token, profile_id) is the only exception to read-only rule

## What to review
- **correctness**: state machine transitions (ACTIVE → BACKGROUND_ACTIVE → PASSIVE → IDLE)
- **state consistency**: session snapshot vs event-log alignment after recovery
- **scheduling edge cases**: quota check timing, alarm scheduling, daily reset boundaries
- **recovery correctness**: SW restart after sleep, delta > 90s truncation, duplicate prevention
- **sync bugs**: cloud pull consistency, config version tracking, device binding flow
- **race conditions**: signal micro-batching (80ms window), concurrent tab switches, storage writes
- **idempotency**: daily cleanup, quota state reset, config merge on update
- **error handling**: cloud request retries, storage failures, SW termination mid-operation
- **maintainability risks**: module boundary violations, circular dependencies, implicit contracts

## What not to do
- no broad rewrites
- no framework migration
- no stylistic cleanup unless it affects maintainability
- no changes to cloud API contracts (Workers routes, D1 schema, R2 storage)
- no changes to manifest.json permissions or content script injection
- no changes to the read-only cloud config principle
