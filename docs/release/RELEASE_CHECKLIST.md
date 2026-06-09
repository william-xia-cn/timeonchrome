# Release Checklist

## Purpose

This checklist is the default releaseMg checklist for release gate execution. Specific release reports may add stricter gates, but must not silently lower this baseline.

## Preflight

- [ ] Release target is identified in `PROJECT_MASTER.md`.
- [ ] Active tasks and blockers are checked in `TASK_BOARD.md`.
- [ ] Relevant product and architecture decisions are checked in `DECISIONS.md`.
- [ ] Build&Test implementation evidence is available.
- [ ] Product&Project Mg conformance review is available.
- [ ] Known risks are listed without rewriting waived or deferred items as pass.

## Artifact

- [ ] Manifest version matches the candidate version.
- [ ] Package path is recorded.
- [ ] SHA256 is recorded.
- [ ] Package opens successfully.
- [ ] Package excludes repo-only, test-only, build-only, credential, browser-profile, cookie, token, and private local data.
- [ ] Chrome Web Store browser-control flow follows `docs/release/CWS_BROWSER_CONTROL_RUNBOOK.md` when CWS upload or submission is in scope.

## Test Evidence

- [ ] Required unit tests are recorded.
- [ ] Required integration tests are recorded.
- [ ] Required E2E or browser checks are recorded or explicitly waived/deferred by Product Owner.
- [ ] Manual checks are recorded with owner and date.
- [ ] Failures are classified and assigned back to the correct role.

## Documentation Consistency

- [ ] Feature spec and implementation report agree.
- [ ] Release report and project status agree.
- [ ] Accepted risks are preserved as risks.
- [ ] Product Owner decisions are clearly marked.

## Privacy

- [ ] No child ID.
- [ ] No account email.
- [ ] No token, cookie, password, credential, or local Chrome profile path.
- [ ] No private screenshot or raw profile/device identifier.

## Final Recommendation

- [ ] releaseMg recommendation is recorded.
- [ ] Product Owner final decision is still required.
