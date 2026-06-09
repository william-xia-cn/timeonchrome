# CWS Chrome Control Submission Runbook

## Purpose

Use the currently authenticated Chrome session to upload, verify, prepare, and, only with explicit Product Owner approval, submit a TimeOnChrome Chrome Web Store release for review.

This runbook applies to TimeOnChrome CWS release and resubmission work.

## Core Rules

- Use the real Chrome login environment. Do not replace it with Playwright's default Chromium profile.
- The Product Owner manually completes Google / Chrome Web Store login and 2FA.
- The agent only controls the Chrome page after login is complete.
- Do not read passwords, cookies, tokens, browser passwords, or private Chrome profile data.
- Do not switch Google accounts unless the Product Owner does it manually.
- Do not click `Submit for Review` without explicit approval in the same session.

## Pre-Submission Inputs

Confirm these release materials are ready before opening the Chrome Web Store dashboard:

- CWS zip absolute path.
- SHA256.
- CWS submission notes.
- Listing copy.
- Screenshot and promo image assets.
- Target version.
- Target extension ID.
- Target CWS item name: `TimeOnChrome`.

Verify the zip locally:

- The zip root directly contains `manifest.json`.
- `manifest.json` version equals the target version.
- Permissions match the submission materials.
- The zip does not contain `tests/`, `workers/`, `pages/`, `dist/`, `node_modules/`, `.git/`, or `_metadata/`.
- SHA256 matches the recorded release material.

## Chrome Control Path

Prefer the already logged-in Chrome profile.

For generic Chrome profile control, follow `docs/release/CHROME_PROFILE_CONTROL_RUNBOOK.md`. Use the Product Owner-provided profile path; do not invent a TimeOnChrome-specific profile path.

For a dedicated CWS automation profile, the Product Owner may launch Chrome with remote debugging by filling the generic runbook's dedicated-profile template and opening the Chrome Web Store Developer Dashboard as the target URL. In the short template below, `$ChromeExe` and `$ChromeProfile` must already be set from the generic runbook using the Product Owner-provided profile path.

```powershell
Start-Process -FilePath $ChromeExe -ArgumentList @(
  "--remote-debugging-port=9222",
  "--user-data-dir=$ChromeProfile",
  "--no-first-run",
  "--no-default-browser-check",
  "https://chrome.google.com/webstore/devconsole"
)
```

Then connect the agent:

```text
agent-browser --cdp 9222 --session cws-timeonchrome
```

If the Chrome Web Store native file picker cannot be handled by `agent-browser upload`, use Playwright connected to the same CDP Chrome session as the file-upload fallback.

Login and 2FA are always manual Product Owner actions.

## Dashboard Read-Only Check

After opening the Chrome Web Store Developer Dashboard, verify before uploading:

- The logged-in account is the approved account.
- The CWS item is TimeOnChrome.
- Item ID / extension ID matches the expected target.
- Current published version.
- Current draft status.
- Whether a same-version draft already exists.
- Whether there is a pending review or rejected draft.

Stop before upload if the item, account, version, or permission state is unexpected.

## Package Upload

Upload the target zip and wait for Chrome Web Store parsing to complete.

After parsing, verify:

- Manifest version equals the target version.
- Permission list matches the local manifest and submission notes.
- Host permissions match the submission notes.
- No undeclared sensitive permissions appear, especially:
  - `scripting`
  - `management`
  - `declarativeNetRequestFeedback`

If the dashboard rejects a same-version upload, record the Chrome Web Store error and stop. Do not force a workaround in the dashboard.

## Listing, Privacy, And Review Materials

Fill or verify the following from the prepared release materials:

- Short description.
- Detailed description.
- What's new.
- Permission justification.
- Privacy / data use declarations.
- Reviewer instructions.
- Screenshots.
- Promo images.

Screenshots and materials must not contain:

- Real account email.
- Child name.
- Profile ID or device ID.
- Token.
- Real browsing history.
- Private URL.

If Chrome Web Store requires extra privacy or permission justification, use only the approved release materials. If the materials are missing, stop and report the exact dashboard requirement.

## Submit For Review Gate

After upload and material verification, stop before final submission.

Output this summary before asking for submission approval:

```text
CWS item:
Target version:
Uploaded artifact:
SHA256:
Permissions observed:
Listing assets:
Dashboard status:
Warnings/errors:
```

Only click `Submit for Review` if the Product Owner explicitly says this exact approval phrase in the same session:

```text
ReleaseMg: submit now
```

Without that phrase, leave the dashboard in prepared / draft status.

## Post-Submission Evidence

After submission, record:

```text
CWS item:
Version:
Submitted artifact:
SHA256:
Submission timestamp:
Dashboard status:
Warnings/errors:
```

Expected status is `In review`, `待审核`, or the current Chrome Web Store equivalent.

## Forbidden Actions

- Do not let the agent enter Google passwords or 2FA codes.
- Do not read cookies, tokens, browser passwords, or local profile data.
- Do not upload a zip that has not passed local verification.
- Do not click final submit without the exact approval phrase.
- Do not modify code, rebuild, or replace the artifact from the dashboard flow.
- Do not use a blank default Chromium profile as a substitute for the real Chrome Web Store login environment.

## Standard Output Template

```text
CWS item:
Target version:
Uploaded artifact:
SHA256:
Dashboard version:
Dashboard status:
Permissions observed:
Screenshots/promo updated:
Privacy/data-use updated:
Warnings/errors:
CWS-DASHBOARD-READONLY:
CWS-UPLOAD:
CWS-SUBMIT-FOR-REVIEW:
Submit approval phrase:
Submission timestamp:
Final status:
```

## Defaults

- Chrome Web Store submission uses the real authenticated Chrome session.
- The Product Owner owns login, 2FA, and final submission approval.
- The agent may upload, verify, and fill prepared materials, but final submission is gated.
- If the current session cannot control Chrome or agent-browser, transfer the task to a session that can control Chrome instead of using a new unauthenticated Chromium profile.
