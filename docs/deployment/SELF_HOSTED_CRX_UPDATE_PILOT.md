# TimeOnChrome Self-hosted CRX / update.xml Pilot

## 1. Scope

This document is Task C for the managed internal channel.

It defines the local dry-run process for a self-hosted CRX update feed used only by Chrome policy-managed deployments.

This task does not:

- create a production CRX;
- upload artifacts;
- commit a private signing key;
- modify the Chrome Web Store package;
- deploy Cloudflare Worker or Pages;
- change timing, statistics, site access, quota, or time-window logic.

## 2. Output Layout

Dry-run output is written to:

```text
dist/self-hosted/
  update.xml
  SHA256SUMS.txt
  timeonchrome-<version>.crx   # expected production artifact, not created by dry-run
```

`dist/` remains ignored. Production release assets may be uploaded to the private update host only after explicit authorization.

## 3. Signing Boundary

Chrome extension ID stability depends on a stable private key.

Rules:

- The production `.pem` key is owned by the Product Owner.
- The key must stay outside the repository.
- The key must not be printed, logged, copied into docs, committed, or uploaded to GitHub.
- Dry-run scripts must not read the private key.
- If a CRX is generated manually, copy only the CRX artifact into the ignored `dist/self-hosted/` folder for local verification.

The repository `.gitignore` must prevent accidental commits of common signing materials:

```text
*.pem
*.crx
*.crx3
*.p12
*.key
signing-keys/
```

## 4. Dry-run Command

Generate `update.xml` and `SHA256SUMS.txt` without a CRX:

```powershell
node tools/self-hosted-crx-dry-run.js `
  --extension-id REPLACE_WITH_STABLE_EXTENSION_ID `
  --base-url https://timeonchrome-update.example.com/timeonchrome
```

For a real pilot verification with an already generated CRX:

```powershell
node tools/self-hosted-crx-dry-run.js `
  --extension-id <stable-extension-id> `
  --base-url https://timeonchrome-update.example.com/timeonchrome `
  --crx dist/self-hosted/timeonchrome-<version>.crx `
  --require-crx
```

The generated `update.xml` follows Chrome's update feed shape:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<gupdate xmlns="http://www.google.com/update2/response" protocol="2.0">
  <app appid="<stable-extension-id>">
    <updatecheck codebase="https://timeonchrome-update.example.com/timeonchrome/timeonchrome-<version>.crx" version="<version>" />
  </app>
</gupdate>
```

## 5. Manual CRX Generation

Manual CRX generation is intentionally outside the dry-run script.

Example shape only:

```powershell
chrome.exe `
  --pack-extension=D:\Opencode\ChromeExtension\timeonchrome\extension `
  --pack-extension-key=<path-outside-repo>\timeonchrome-managed.pem
```

After generation, copy the CRX to:

```text
dist/self-hosted/timeonchrome-<version>.crx
```

Then run the dry-run script with `--require-crx` to compute SHA256 and regenerate `update.xml`.

## 6. Chrome Policy Template

`ExtensionSettings` example:

```json
{
  "ExtensionSettings": {
    "<stable-extension-id>": {
      "installation_mode": "force_installed",
      "toolbar_pin": "force_pinned",
      "update_url": "https://timeonchrome-update.example.com/timeonchrome/update.xml"
    }
  }
}
```

Managed storage policy example:

```json
{
  "enabled": true,
  "deploymentMode": "managed",
  "tenantId": "internal-family-001",
  "devicePolicyId": "macbook-child-001",
  "cloudEndpoint": "https://guardian-api.william-xia-cn.workers.dev",
  "allowIdentityRecovery": true
}
```

The managed policy is only an activation and identity anchor. It does not carry website rules, quota, time windows, child profile configuration, or tokens.

## 7. Verification Checklist

Local dry-run:

- `extension/manifest.json` version matches `update.xml`.
- `update.xml` has the stable extension ID.
- `update.xml` codebase is HTTPS.
- `SHA256SUMS.txt` records the CRX hash when a CRX exists.
- No `.pem`, `.key`, `.p12`, or raw signing material exists under Git tracking.

Chrome policy pilot:

- `chrome://policy` shows the `ExtensionSettings` entry.
- `chrome://policy` shows the managed storage keys.
- `chrome://extensions` shows TimeOnChrome force-installed.
- The extension cannot be disabled or removed by the child user.
- Popup/Admin shows `managed_policy` activation source.
- Site access, quota, and time-window config still come from cloud config.

## 8. Rollback

Chrome self-hosted update rollback should use a higher-version rollback CRX.

Do not rely on Chrome installing a lower version. If a pilot must be rolled back, publish:

```text
timeonchrome-<higher-rollback-version>.crx
```

and update `update.xml` to that higher rollback version.

## 9. Known Limits

- This is not a consumer install path.
- This does not solve CWS Purple Nickel review.
- This does not replace MDM.
- This does not bypass school or enterprise MDM.
- This does not implement `tenantId + devicePolicyId` device recovery; that is Task E.
- This does not upload real artifacts.

## 10. Release Helper Update

The dry-run helper now also supports a guarded release path:

```powershell
$env:TIMEONCHROME_CRX_KEY_PATH = "<path-outside-repo>\timeonchrome-managed.pem"
$env:TIMEONCHROME_MANAGED_EXTENSION_ID = "<stable-extension-id>"
$env:TIMEONCHROME_UPDATE_BASE_URL = "https://timeonchrome-update.pages.dev/timeonchrome"
node tools/self-hosted-crx-dry-run.js --pack --prepare-host
```

Rules:

- the PEM must be outside the repository;
- the script derives and validates the managed extension ID;
- the script writes CRX/update artifacts only under ignored `dist/` paths;
- the script prepares the independent Pages layout under `dist/self-hosted-update/timeonchrome/`;
- no key path or key content is printed in JSON output.

Deploy the update host only after the CRX, `update.xml`, and `SHA256SUMS.txt` have been verified.
