> **ARCHIVED / Historical evidence only.** This file is preserved for audit/history and must not be used as the current product source of truth. Use `AGENTS.md`, `PROJECT_MASTER.md`, `TASK_BOARD.md`, `DECISIONS.md`, and the current authority documents instead.

# Pages Stats v1 Minimum Verification - 2026-05-09

## Scope

This is the minimum verification report for the remaining dirty Pages stats-v1 read path package:

- `pages/index.html`
- `tests/unit/pages-config-v12-fields.test.js`

This verification did not deploy Pages, rebuild packages, commit, push, tag, merge, release, access Chrome Web Store, touch Chrome profile/storage, access Cloud Worker, or mutate D1.

This report does not declare V1-minimal release readiness.

## Source Review

Ownership review:

```text
docs/audits/PAGES_STATS_V1_OWNERSHIP_REVIEW_2026-05-09.md
```

Ownership classification:

```text
include later
```

The package remains excluded from V1-minimal CWS release consideration and requires separate Product Owner approval before any Pages deploy or commit.

## Commands Run

```powershell
node tests/unit/pages-config-v12-fields.test.js
node tests/unit/workers-stats-ingestion-v12-normalization.test.js
```

## Results

| Command | Result |
|---|---|
| `node tests/unit/pages-config-v12-fields.test.js` | PASS, 22/22 |
| `node tests/unit/workers-stats-ingestion-v12-normalization.test.js` | PASS, 25/25 |

## Behavior Covered

The minimum verification supports the Pages stats-v1 ownership review conclusion:

- Pages source contains the `stats/v1` read path.
- Pages source includes a v1 stats adapter path.
- Pages source supports `duration_seconds` compatibility.
- Pages source no longer uses the UTC `toISOString()` date helper pattern covered by the test.
- Worker stats ingestion v1.2 normalization remains covered by its existing unit suite.

## Known Risks

- This is unit/static source-shape verification, not a live Pages deployment test.
- No local browser rendering check was run.
- No Pages deploy was performed.
- Fallback to legacy stats can still surface previously documented legacy duplicate-row risk if v1 returns no normalized rows or fails.
- Local-date query semantics changed versus the older UTC helper and should remain an explicit Product Owner acceptance point before deploy.

## Recommendation

Recommendation: `include later, with minimum verification passed`.

The package is coherent and has passed the authorized minimum verification. It should still remain outside V1-minimal CWS release scope and should only be committed/deployed through a separate Product Owner-approved Pages/stats-v1 follow-up.

## Product Owner Decisions Required

1. Keep Pages stats-v1 held for later, or approve a separate Pages stats-v1 commit.
2. Decide whether a local browser rendering check is required before commit/deploy.
3. Separately approve any Pages deploy.
4. Separately approve any git push/tag/release action.

## Out-of-Scope Confirmation

- No product code edits by this verification report.
- No test edits by this verification report.
- No Pages deploy.
- No rebuild/package.
- No commit, push, tag, merge, or release.
- No CWS dashboard access.
- No Chrome profile, chrome.storage, cloud, Worker, or D1 mutation.

## Result

Status: `MINIMUM VERIFICATION PASS / INCLUDE LATER / NOT RELEASE READY`
