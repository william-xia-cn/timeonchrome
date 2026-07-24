> **ARCHIVED / Historical evidence only.** This file is preserved for audit/history and must not be used as the current product source of truth. Use `AGENTS.md`, `PROJECT_MASTER.md`, `TASK_BOARD.md`, `DECISIONS.md`, and the current authority documents instead.

# Pages Stats v1 Ownership Review - 2026-05-09

## Scope

This is a readonly ownership review for the remaining dirty Pages files:

- `pages/index.html`
- `tests/unit/pages-config-v12-fields.test.js`

No product code, test code, package artifact, release state, Chrome profile, storage, CWS dashboard, Cloud Worker, Pages deployment, or D1 data was modified or accessed. No tests were run.

## Inspected Files

- `PROJECT_MASTER.md`
- `TASK_BOARD.md`
- `docs/audits/WORKTREE_OWNERSHIP_AUDIT_2026-05-09.md`
- `pages/index.html`
- `tests/unit/pages-config-v12-fields.test.js`

Readonly commands inspected:

- `git diff -- pages/index.html`
- `git diff -- tests/unit/pages-config-v12-fields.test.js`
- `rg -n "stats/v1|fetchProfileStats|duration_seconds|fmtDate|pages-config-v12" pages tests docs PROJECT_MASTER.md TASK_BOARD.md`
- `git status --short`

## Ownership Finding

The two dirty files belong to the same coherent Pages stats-v1 read path implementation package.

| Path | Observed change | Ownership relation |
| --- | --- | --- |
| `pages/index.html` | Replaces direct legacy `/profiles/:id/stats` reads with `fetchProfileStats(...)`; attempts `/profiles/:id/stats/v1` first; normalizes `duration`, `duration_seconds`, and `durationSeconds`; falls back to legacy stats; changes `fmtDate` from UTC `toISOString()` to local `YYYY-MM-DD`. | Primary Pages implementation file. |
| `tests/unit/pages-config-v12-fields.test.js` | Adds static assertions that Pages reads `stats/v1`, contains the v1 stats adapter, supports `duration_seconds`, and no longer uses the UTC `toISOString()` date helper pattern. | Test coverage for the exact dirty implementation behavior. |

Classification: `include later`.

This package should remain excluded from V1-minimal CWS release consideration, but it is coherent enough to route as a separate Pages/stats-v1 follow-up package instead of discarding.

## Behavior Impact

- Pages admin console stats read path prefers `GET /profiles/:id/stats/v1`.
- If v1 read fails or returns no normalized rows, the page falls back to legacy `GET /profiles/:id/stats`.
- Stats rows are normalized to the legacy UI shape:
  - `date`
  - `domain`
  - `duration`
- Duration compatibility expands from legacy `duration` to include `duration_seconds` and `durationSeconds`.
- Date formatting changes from UTC date extraction to local date formatting, reducing UTC day-boundary drift for Pages queries and display.

## Release Relevance

- Not relevant to the already-submitted CWS extension artifact.
- Not part of the current V1-minimal extension release package.
- No Pages deploy is authorized in the current release close-out scope.
- Should not be used as V1-minimal release readiness evidence unless Product Owner explicitly opens and approves a separate Pages/stats-v1 package.

This aligns with the prior worktree ownership audit, which classified both files as excluded from V1-minimal release consideration and routed them to a separate Pages/stats-v1 decision.

## Minimal Verification Recommendation

Do not run verification as part of this review. If Product Owner authorizes the Pages/stats-v1 package later, recommended minimal verification is:

```powershell
node tests/unit/pages-config-v12-fields.test.js
node tests/unit/workers-stats-ingestion-v12-normalization.test.js
```

If a safe local Pages/browser harness already exists and deployment remains out of scope, optionally add a readonly/local UI check that confirms:

- overview cards can render from `/stats/v1`;
- weekly chart can render from `/stats/v1`;
- stats table can render from `/stats/v1`;
- fallback to legacy stats works when `/stats/v1` fails;
- local-date formatting does not regress same-day query behavior.

## Known Risks / Review Notes

- Fallback currently occurs when v1 returns no normalized rows, not only when the v1 request fails. This may intentionally preserve display compatibility, but it can also reintroduce legacy stats duplicate-row risk for empty or filtered v1 ranges.
- The test is static source-shape coverage, not a live API/browser rendering test.
- The Pages UI may aggregate legacy duplicate rows if fallback is used; this is consistent with the previously documented legacy stats risk.
- Local-date formatting is a likely improvement for operator timezone behavior, but should be accepted explicitly because it changes query date semantics versus UTC.

## Recommendation

Include later as a separate Pages/stats-v1 read path implementation package, subject to Product Owner approval and a focused verification handoff.

Do not include this package in V1-minimal CWS artifact/readiness scope, and do not deploy Pages from the dirty tree without a separate authorization.

## Out-of-Scope Confirmation

- No product code edits.
- No test edits.
- No tests run.
- No Pages deploy.
- No rebuild/package.
- No commit, push, tag, merge, or release.
- No CWS dashboard access.
- No Chrome profile, storage, Cloud Worker, or D1 access.
