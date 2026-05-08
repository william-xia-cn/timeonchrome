# V1-minimal Release Record - 2026-05-09

## Release identity

- Product: TimeOnChrome
- Manifest version: `1.7.2`
- Release line: V1-minimal release candidate
- Branch: `master`
- Source commit: this release preparation commit
- Release package: `dist/v1-minimal-20260509-023832/timeonchrome-v1.7.2-v1-minimal.zip`
- SHA256: `A0A5C541A5A7D047E040D2163BF8735971798112E18E1D223BB9D55D80D7190B`
- Size: `141357` bytes
- Package file count after extraction: `38`

## Artifact verification

The release package was built with an explicit extension-runtime allowlist:

- Included runtime directories: `admin/`, `core/`, `debug/`, `icons/`, `infra/`, `popup/`, `product/`, `rules/`, `runtime/`
- Included root runtime files: `manifest.json`, `background.js`, `content.js`, `content.css`, `message-router.js`, `auth.js`, `bind.html`, `bind.js`, `config.js`, `reminder.html`, `reminder.js`, `sync.js`, `privacy.html`
- Excluded: `docs/`, `tests/`, `workers/`, `pages/`, `node_modules/`, `.git/`, `.env`, `.wrangler`, local Chrome profiles, cookies, history, login data, and generated test profiles

Extraction verification result:

| Check | Result |
|---|---|
| `manifest.json` exists | PASS |
| Manifest version is `1.7.2` | PASS |
| Manifest version is MV3 | PASS |
| Required runtime files present | PASS |
| Disallowed private/build/test paths absent | PASS |

## Gate baseline

| Gate | Result | Evidence summary |
|---|---|---|
| Cloud Stats v1 minimal sync | PASS | `usage_segments_v1` + `stats_v1` are the active V1-minimal stats truth path; outbox and sync status evidence recorded in `PROJECT_MASTER.md`. |
| Recovery/System Gate | PASS_WITH_MANUAL_EVIDENCE | Manual network, lock/unlock, and sleep/wake evidence is operator-confirmed; automated sleep report partial fact is preserved. |
| Mode Transition UX Gate | PASS | Prompt delivery restored; popup mode switch targets webpage tab; 30/45/45 second transition delays recorded. |
| Video Playback Accounting Gate | PASS | Idle + media no longer collapses to IDLE; natural media, fullscreen, and PiP accounting verified. |
| Mode Transition PiP cleanup | PASS | `mode-switch-pip-close` covered Rest -> Composite and Rest -> Study manual/auto paths. |
| Admin subpage refresh | PASS | Admin navigation refresh behavior and tests recorded in release evidence. |
| Local stats / timeline | PASS | Local stats and timeline message paths recorded as working release evidence. |
| Time borrowing current implementation | DISABLED / DEFERRED | Current borrowing runtime/UI path remains disabled for V1-minimal. |
| Legacy cloud stats cleanup | OUT_OF_SCOPE / KNOWN_RISK | Legacy `stats` cleanup/migration not performed in this release. |
| V1 full model / AI / composite routing | OUT_OF_SCOPE | No full V1 model rebuild, AI classification, or composite routing rebuild. |

## Required non-actions

- Chrome Web Store upload was not performed.
- Chrome Web Store Submit for Review was not clicked.
- No Worker deploy was performed.
- No D1 migrations were run.
- No D1 writes were performed.
- No legacy stats cleanup was performed.
- No production Chrome profile was used.
- No tag or push was performed as part of this local release preparation.

## Known risks carried forward

- Chrome Web Store permissions/privacy audit text is prepared but requires Product Owner review before upload/submission.
- Windows/macOS real Chrome smoke was previously skipped for gate-matrix purposes; no new production-profile smoke was run in this task.
- Legacy cloud `stats` table cleanup remains out of scope; V1-minimal release truth is `usage_segments_v1` + `stats_v1`.
- Manual Recovery/System evidence is operator-confirmed and must not be represented as fully automated PASS.
- Time borrowing remains disabled/deferred and must not be presented as active V1-minimal functionality.

## GitHub release draft

Title:

```text
TimeOnChrome v1.7.2 V1-minimal release candidate
```

Body:

```markdown
## Summary

This V1-minimal release candidate focuses on release-readiness, durable usage accounting, mode-transition reliability, and Chrome Web Store preparation. It does not include the full V1 product model, AI classification, composite routing rebuild, or time borrowing.

## Highlights

- Cloud Stats v1 minimal sync is now the active release truth path using `usage_segments_v1` + `stats_v1`.
- Mode prompt delivery is restored, including popup-triggered mode switches targeting the active webpage tab.
- Auto transition delays are set to Rest -> Composite 30s, Rest -> Study 45s, and Composite -> Study 45s.
- Video playback accounting now preserves idle + media, natural media accrual, fullscreen, and PiP accounting.
- Mode-transition PiP cleanup is restored for Rest -> Composite and Rest -> Study manual/auto paths.
- Recovery/System gates are closed with manual evidence where required.
- Time borrowing remains disabled/deferred for V1-minimal.

## Artifact

- Package: `timeonchrome-v1.7.2-v1-minimal.zip`
- SHA256: `A0A5C541A5A7D047E040D2163BF8735971798112E18E1D223BB9D55D80D7190B`

## Known risks / non-goals

- Chrome Web Store final submission requires separate Product Owner approval.
- Legacy cloud stats cleanup is out of scope.
- Full V1 model, AI classification, composite routing rebuild, and time borrowing are out of scope.
- Manual Recovery/System evidence is operator-confirmed, not fully automated evidence.
```
