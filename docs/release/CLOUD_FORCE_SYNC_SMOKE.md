# Cloud Force Sync Smoke

Purpose: verify Cloud Stats v1 upload and outbox clearing without recording private identifiers.

## Scope

Allowed:
- Run from the TimeOnChrome extension service worker console in a bound validation or production profile.
- Trigger one `CLOUD_FORCE_SYNC`.
- Record only redacted status booleans, pending counts, and last-error presence.

Forbidden:
- Do not record child ID, account email, token, cookie, local profile path, raw profile ID, or raw device ID.
- Do not run migrations, Worker deploys, D1 writes outside normal extension sync, or `/api/init`.
- Do not clear extension storage or change profile binding.

## Console Snippet

```js
const send = (msg) => new Promise(resolve => chrome.runtime.sendMessage(msg, resolve));
const getLocal = (keys) => new Promise(resolve => chrome.storage.local.get(keys, resolve));

const beforeStatus = await send({ type: 'GET_CLOUD_STATUS' });
const beforeOutbox = await getLocal(['segment_sync_outbox_v1', 'stats_sync_outbox_v1']);
const force = await send({ type: 'CLOUD_FORCE_SYNC' });
await new Promise(r => setTimeout(r, 3000));
const afterStatus = await send({ type: 'GET_CLOUD_STATUS' });
const afterOutbox = await getLocal(['segment_sync_outbox_v1', 'stats_sync_outbox_v1']);

const summarize = (status, outbox) => ({
  cloud: {
    hadError: !!status?.error,
    v1LastError: status?.v1Sync?.lastError ?? null,
    pendingSegments: status?.v1Sync?.pendingSegments ?? null,
    pendingStatsDates: status?.v1Sync?.pendingStatsDates ?? null,
    lastSyncAtPresent: !!status?.v1Sync?.lastSyncAt,
  },
  outbox: {
    pendingSegments: outbox?.segment_sync_outbox_v1?.dirtySegmentIds?.length ?? 0,
    segmentLastErrorCount: Object.keys(outbox?.segment_sync_outbox_v1?.lastErrors ?? {}).length,
    pendingStatsDates: outbox?.stats_sync_outbox_v1?.dirtyDates?.length ?? 0,
    statsLastErrorCount: Object.keys(outbox?.stats_sync_outbox_v1?.lastErrors ?? {}).length,
  }
});

console.log({
  force: {
    hadFailure: !!force?.hadFailure,
    error: force?.error ?? null,
  },
  before: summarize(beforeStatus, beforeOutbox),
  after: summarize(afterStatus, afterOutbox),
});
```

## PASS Criteria

- `force.hadFailure` is `false`.
- `force.error` is `null`.
- `after.cloud.hadError` is `false`.
- `after.cloud.v1LastError` is `null`.
- `after.cloud.pendingSegments` is `0`.
- `after.cloud.pendingStatsDates` is `0`.
- `after.cloud.lastSyncAtPresent` is `true`.
- `after.outbox.pendingSegments` is `0`.
- `after.outbox.segmentLastErrorCount` is `0`.
- `after.outbox.pendingStatsDates` is `0`.
- `after.outbox.statsLastErrorCount` is `0`.

## Evidence Format

```text
Cloud Force Sync Smoke: PASS/PARTIAL/FAIL
Before pending: segments=<count>, statsDates=<count>
After pending: segments=<count>, statsDates=<count>
Last error: present/absent
Privacy: no child ID, email, token, cookie, local profile path, raw profile ID, or raw device ID recorded
```
