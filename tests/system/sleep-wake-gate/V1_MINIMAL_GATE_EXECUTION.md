# V1-minimal Recovery / System Gate Execution

## Scope

- Gate.Test profile only.
- No product code changes.
- No Cloud/D1 writes by default.
- No Worker deployment.
- Output scenario reports and aggregate report to `tests/system/sleep-wake-gate/reports`.

## Quick Start

```bash
node tests/system/sleep-wake-gate/scripts/run-v1-minimal-gates.js --verbose
```

Default behavior:

- Runs unit recovery tests.
- Runs `dry-run` and `chrome-restart`.
- Runs `lock-unlock` and `network-offline` in preflight mode.
- Collects runtime metrics: `event_log_v1`, `session_v1`, `GET_STATS`, `GET_STATS_RANGE`, `GET_TIMELINE_SEGMENTS`, `GET_CLOUD_STATUS.v1Sync`.
- Skips `sleep-wake` unless explicitly requested.
- Does not call `CLOUD_FORCE_SYNC`.

## Manual Gate Run

Run sleep/wake only on physical Windows machine and only after other gates are completed:

```bash
node tests/system/sleep-wake-gate/scripts/run-v1-minimal-gates.js --run-sleep-wake-manual --verbose
```

If cloud write is explicitly approved for Gate.Test verification:

```bash
node tests/system/sleep-wake-gate/scripts/run-v1-minimal-gates.js --allow-cloud-force-sync --verbose
```

## Operator Prompts

- Windows lock/unlock:
  Run lock gate only when operator is ready. Unlock must be manual.
- Sleep/Wake:
  System sleep is disruptive. Save work first. Wake must be manual.
- Network offline/online:
  Use manual disconnect/reconnect. Restore connectivity on prompt.

## PASS / BLOCKED / SKIP Policy

- `PASS`: scenario checks complete and verification points are readable.
- `BLOCKED`: hard prerequisite missing (for example Gate.Test profile missing, explicit permission not provided).
- `SKIP`: intentionally not executed in this run (for example sleep/wake omitted).

## Manual Evidence Close-out Policy

- Manual gates can be closed with `MANUAL_VERIFIED_PASS` only when Product Owner confirms behavior.
- Manual evidence must not be mislabeled as automated measurements.
- Required fields for manual evidence:
  - `operatorConfirmed: true`
  - `confirmedByOperator: true`
  - `automatedMeasurement: false`
  - `profile: Gate.Test bound profile`
  - `noProductionProfileTouched: true`
  - `noCloudD1Write: true`
- If automated sleep report is `PARTIAL`, keep that fact in close-out report and add:
  - `finalManualSemanticResult: PASS`
  - explicit reason that Product Owner accepted manual semantic verification.

## Report Files

- Per-scenario:
  `tests/system/sleep-wake-gate/reports/<scenario>-<timestamp>.json`
  `tests/system/sleep-wake-gate/reports/<scenario>-<timestamp>.md`
- Aggregate:
  `tests/system/sleep-wake-gate/reports/v1-minimal-recovery-gate-<timestamp>.json`
  `tests/system/sleep-wake-gate/reports/v1-minimal-recovery-gate-<timestamp>.md`

## Gate.Test Profile Notes

Expected default profile location:

`D:\Opencode\ChromeExtension\timeonchrome\tests\test-results\sleep-wake-gate\bound-profile`

If missing, aggregate status will be `BLOCKED`.

Aggregate report wording is standardized:

- `Gate.Test profile status: PRESENT|MISSING`
- `Execution environment status: READY_OR_UNKNOWN|BLOCKED_SPAWN_EPERM`
- `executionMode: INLINE_NO_SPAWN` (aggregator executes scenarios in-process and does not call `spawnSync node.exe`)
- `dispatchStatus: PASS|BLOCKED_STALE_SW_INSTANCE|FAIL_MESSAGE_DISPATCH|FAIL_CLOUD_STATUS_SHAPE`
