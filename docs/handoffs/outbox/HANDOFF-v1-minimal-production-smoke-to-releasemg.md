# Agent Handoff

## Metadata

- Handoff ID: HANDOFF-v1-minimal-production-smoke-to-releasemg
- Date: 2026-05-09
- From: Product&Project Mg
- To: releaseMg
- Related task: V1-minimal production-profile readonly smoke close-out
- Related branch: master
- Related files:
  - `docs/releases/releasemg-production-acceptance-2026-05-09.md`
  - `docs/releases/releasemg-readiness-v1-minimal-2026-05-09.md`
  - `docs/release/V1_MINIMAL_RELEASE_GATE_MATRIX_2026-05-09.md`
  - `docs/release/V1_MINIMAL_CLOSEOUT_PLAN_2026-05-09.md`
  - `DECISIONS.md`
  - `PROJECT_MASTER.md`
  - `TASK_BOARD.md`
- Status: Done

## Purpose

Complete or formally classify the remaining V1-minimal production-profile readonly smoke blocker.

Result received: `BLOCKED / NOT CLOSED`. The inspected production profile was reachable, but the expected TimeOnChrome CWS extension ID `mkggamgaeemnlmlflpekacbknochbmom` was not present in the extension list, so installed/enabled/version, popup-core, and bind-sync could not be verified.

## Context

V1-minimal is still `BLOCKED / NOT READY FOR PUBLIC RELEASE`.

Product Owner selected artifact strategy A in `DECISIONS.md:D-039`: the already-submitted reduced-permission CWS package remains the active review artifact, and current `origin/master` is the source follow-up line. No rebuild/package/resubmission is approved unless CWS requires it or Product Owner later approves.

The prior production acceptance report is `PARTIAL / NOT CLOSED` because installed/enabled/version, popup-core, and full bind-sync smoke were not fully verified.

## Source Of Truth

The receiver must read:

- `AGENTS.md`
- `PROJECT_MASTER.md`
- `TASK_BOARD.md`
- `DECISIONS.md`
- `docs/agents/ReleaseMg.md`
- `docs/release/RELEASE_CHECKLIST.md`
- `docs/release/RELEASE_GATE_REPORT_TEMPLATE.md`
- `docs/release/V1_MINIMAL_RELEASE_GATE_MATRIX_2026-05-09.md`
- `docs/release/V1_MINIMAL_CLOSEOUT_PLAN_2026-05-09.md`
- `docs/releases/releasemg-production-acceptance-2026-05-09.md`
- `docs/releases/releasemg-readiness-v1-minimal-2026-05-09.md`
- `docs/releases/chrome-web-store-submission-v1-minimal-2026-05-09.md`

## Request

1. Re-run or complete the production-profile readonly smoke using `docs/agents/ReleaseMg.md` Production Acceptance SOP.
2. Verify, if possible without mutation:
   - installed extension is present;
   - extension is enabled;
   - installed version is `1.7.2`;
   - popup core opens and displays sane release-facing state;
   - bound/sync state is readable without exposing private identifiers;
   - evidence privacy remains clean.
3. If any item cannot be verified, classify it as `BLOCKED`, `DEFERRED`, `WAIVED`, or `RISK ACCEPTED` with reason and required Product Owner decision.
4. Update or supersede the production acceptance report with the new result.
5. Refresh release readiness only if the production smoke result changes blocker status.

## Scope

Allowed actions:

- Read repository docs and source files.
- Launch or inspect the configured production Chrome profile according to `docs/agents/ReleaseMg.md`.
- Inspect `chrome://extensions/` and extension popup state.
- Inspect Chrome Web Store dashboard state read-only if already authenticated.
- Update release report / readiness report documents.
- Record blockers, waivers, deferrals, risks, and evidence summaries.

## Out Of Scope

Forbidden actions:

- Modify product code.
- Modify test code.
- Fix bugs.
- Change feature specs or release standards.
- Clear storage, reset extension data, log out, rebind, delete binding, or rebuild the production child profile.
- Modify site rules, quotas, schedules, profile settings, cloud config, storage, Cloud, D1, or Worker state.
- Rebuild package.
- Upload or resubmit CWS package.
- Submit for CWS review.
- Publish public release.
- Commit, push, tag, or merge.
- Record passwords, cookies, tokens, child ID, account ID, local Chrome profile paths, raw profile IDs, raw device IDs, private screenshots, or raw D1 output.

## Acceptance Criteria

Completion requires:

- Production-profile readonly smoke has a clear status: `PASS`, `BLOCKED`, `DEFERRED`, `WAIVED`, or `RISK ACCEPTED`.
- Installed/enabled/version, popup-core, bind-sync, CWS status, and evidence privacy are each explicitly classified.
- No private account/profile/device identifiers are recorded.
- No product/test code is modified.
- No release, tag, CWS upload, CWS submit, rebuild, Cloud/D1 write, Worker deploy, or production data mutation is performed.
- Remaining Product Owner decisions are listed.

## Required Evidence

The receiver must output:

- changed files
- commands run
- production-profile smoke result table
- CWS dashboard state, if checked read-only
- privacy redaction confirmation
- blockers / waivers / deferrals / risk accepted list
- release readiness recommendation
- explicit confirmation that no code/test/rebuild/release/tag/CWS submit/Cloud/D1 mutation occurred

## Open Questions

Questions requiring Product Owner decision:

- If installed/enabled/version or popup-core cannot be verified, should this be completed later, deferred, or waived?
- If bind-sync can only be checked through prior evidence, is prior evidence accepted or must live verification be repeated?
- Should Windows/macOS real Chrome smoke be completed before public release, deferred, or waived?
- Should releaseMg wait for CWS review outcome before any public-release close-out recommendation?

## Expected Deliverable

An updated production acceptance report or a new dated addendum under `docs/releases/`, plus a concise releaseMg final message containing the result table, blockers, evidence privacy status, and remaining Product Owner decisions.
