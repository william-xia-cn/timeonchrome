# V1-minimal Recovery / System Gate Report Template

- Timestamp:
- Profile: Gate.Test
- Profile Dir:
- No Cloud/D1 Write: true/false
- Overall: PASS / BLOCKED / SKIP / FAIL

## Scenario Results

| Scenario | Mode | Result | JSON Report | MD Report |
|---|---|---|---|---|
| Chrome close/reopen | fully |  |  |  |
| SW recovery/crash | fully |  |  |  |
| Windows lock/unlock | partially |  |  |  |
| Network offline/online | partially |  |  |  |
| Sleep/Wake | partially |  |  |  |

## Runtime Metrics

| Check | Result |
|---|---|
| `event_log_v1` readable |  |
| `session_v1` readable |  |
| local stats readable |  |
| `GET_STATS` readable |  |
| `GET_STATS_RANGE` readable |  |
| `GET_TIMELINE_SEGMENTS` readable |  |
| `GET_CLOUD_STATUS.v1Sync` readable |  |
| `CLOUD_FORCE_SYNC` | `BLOCKED_NO_CLOUD_WRITE` or executed result |

## Manual Operator Notes

- Windows lock/unlock:
- Sleep/Wake:
- Network toggle:

## Review Notes (PO / ChatGPT)

- Evidence completeness:
- Risk / blockers:
- Gate decision:
