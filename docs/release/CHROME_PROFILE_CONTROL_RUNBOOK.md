# Generic Chrome Profile Control Runbook

## Purpose

Use a Product Owner-provided Chrome profile for browser-control work in another Codex / agent session.

This runbook is generic. It is not specific to TimeOnChrome, Chrome Web Store, or any single product workflow.

## Core Rules

- Use the Chrome profile explicitly provided by the Product Owner.
- Do not invent a product-specific profile path.
- Do not use Playwright's default Chromium profile when the task depends on logged-in browser state.
- Login, 2FA, account switching, and consent prompts are Product Owner actions.
- The agent may control the browser only after the Product Owner has opened or approved the target Chrome session.
- Do not read cookies, passwords, tokens, browser password stores, or raw Chrome profile data.

## Profile Path Types

Chrome has two common path shapes. Use the correct launch form.

### Dedicated Automation Profile Root

Use this when the Product Owner provides a dedicated directory such as:

```text
D:\ChromeProfiles\agent-browser
```

Launch with `--user-data-dir` only:

```powershell
$ChromeProfile = "D:\ChromeProfiles\agent-browser"
```

Chrome will create profile data inside that directory.

### Existing Chrome User Data Root + Profile Name

Use this when the Product Owner provides a normal Chrome user data root and profile name, for example:

```text
User data root: C:\Users\<user>\AppData\Local\Google\Chrome\User Data
Profile name: Profile 3
```

Launch with both:

```powershell
$ChromeUserDataDir = "C:\Users\<user>\AppData\Local\Google\Chrome\User Data"
$ChromeProfileDirectory = "Profile 3"
```

### Existing Profile Subdirectory

If the Product Owner provides a path ending in `Default`, `Profile 1`, `Profile 2`, etc., treat it as a profile subdirectory, not the `--user-data-dir` root.

Example provided path:

```text
C:\Users\<user>\AppData\Local\Google\Chrome\User Data\Profile 3
```

Use:

```powershell
$ChromeUserDataDir = "C:\Users\<user>\AppData\Local\Google\Chrome\User Data"
$ChromeProfileDirectory = "Profile 3"
```

Do not pass `...\User Data\Profile 3` directly as `--user-data-dir` unless the Product Owner explicitly says that directory is a dedicated automation root.

## Launch Template

Use this template for a dedicated automation profile root:

```powershell
$ChromeExe = "$env:ProgramFiles\Google\Chrome\Application\chrome.exe"
if (-not (Test-Path $ChromeExe)) {
  $ChromeExe = "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe"
}

$ChromeProfile = "<PRODUCT_OWNER_PROVIDED_DEDICATED_PROFILE_ROOT>"
New-Item -ItemType Directory -Force -Path $ChromeProfile | Out-Null

Start-Process -FilePath $ChromeExe -ArgumentList @(
  "--remote-debugging-port=9222",
  "--user-data-dir=$ChromeProfile",
  "--no-first-run",
  "--no-default-browser-check",
  "about:blank"
)
```

Use this template for an existing Chrome user data root plus profile directory:

```powershell
$ChromeExe = "$env:ProgramFiles\Google\Chrome\Application\chrome.exe"
if (-not (Test-Path $ChromeExe)) {
  $ChromeExe = "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe"
}

$ChromeUserDataDir = "<PRODUCT_OWNER_PROVIDED_CHROME_USER_DATA_ROOT>"
$ChromeProfileDirectory = "<PRODUCT_OWNER_PROVIDED_PROFILE_DIRECTORY>"

Start-Process -FilePath $ChromeExe -ArgumentList @(
  "--remote-debugging-port=9222",
  "--user-data-dir=$ChromeUserDataDir",
  "--profile-directory=$ChromeProfileDirectory",
  "--no-first-run",
  "--no-default-browser-check",
  "about:blank"
)
```

## Agent Connection

After Chrome opens, connect the browser-control agent to the same CDP port:

```text
agent-browser --cdp 9222 --session chrome-profile-control
```

Use a task-specific session name when multiple browser-control sessions are active:

```text
agent-browser --cdp 9222 --session <short-task-name>
```

## File Upload Fallback

If the web page uses a native file chooser and `agent-browser upload` cannot complete the upload, connect Playwright to the same CDP Chrome session and set the file chooser from there.

The fallback must use the same CDP port and same Chrome session. Do not open a new default Chromium instance.

## Safety Notes

- Do not launch a second Chrome process against a profile that is already locked by another Chrome instance.
- For production or sensitive workflows, prefer a dedicated automation profile prepared by the Product Owner.
- Never commit or copy the profile directory into a repository, artifact, screenshot package, or release bundle.
- Browser control may navigate and interact with pages, but it must not inspect credentials or private profile files.

## Handoff Template

Give another session the following:

```text
Chrome profile type:
Chrome profile path:
Chrome profile directory, if applicable:
CDP port: 9222
Agent session name:
Target URL:
Allowed actions:
Forbidden actions:
Login/2FA owner: Product Owner only
```
