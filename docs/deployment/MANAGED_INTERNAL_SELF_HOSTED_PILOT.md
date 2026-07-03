# TimeOnChrome Managed Internal Self-hosted Pilot

## 1. Summary

This document is the Task A design review for adding a second deployment channel to TimeOnChrome:

```text
Managed Internal Channel
```

This channel is for controlled Chrome environments where an administrator can enforce Chrome policy. It does not replace the public Chrome Web Store channel.

The pilot target is:

```text
LaunchDaemon policy keeper
-> Chrome ExtensionSettings force install
-> self-hosted CRX/update.xml
-> chrome.storage.managed activation
-> future devicePolicyId recovery
```

This is design only. It does not implement code, generate CRX files, create `update.xml`, deploy Worker/Pages, or change the Chrome Web Store package.

## 2. Product Decision

TimeOnChrome will support an internal policy-managed deployment path alongside the existing CWS path.

The product goal is to support controlled Mac / Chrome devices where:

- Chrome policy force-installs TimeOnChrome.
- The extension cannot be removed or disabled by the child user.
- Updates are controlled through self-hosted `update.xml` and CRX artifacts.
- Runtime activation can come from managed policy instead of local user consent.
- Future device recovery can use `tenantId + devicePolicyId` as a stable managed identity anchor.

This channel is not for ordinary consumer installation. It is only for policy-managed deployments.

## 3. Architecture Judgment

### 3.1 Current Gates Found

The current repository is still primarily shaped around the public CWS / consent-first path.

Current gate facts:

- `extension/manifest.json` has no `storage.managed` usage or managed activation model.
- `background.js` caches `privacyConsentAccepted` from `privacy_consent_v1`.
- `background.js:isMonitoringEnabled()` currently requires:

  ```text
  privacyConsentAccepted === true
  and
  getSyncState().monitoringEnabled !== 0
  ```

- Timing signal dispatch, focused-tab reevaluation, quota alarms, checkpoint behavior, and runtime message routing are guarded by `isMonitoringEnabled()` or by direct privacy-consent checks.
- `cloud-sync.js` uses `hasPrivacyConsent()` before cloud sync, heartbeat, identity link, and device recovery.
- `monitoringEnabled` is still a cloud/local sync state, not an activation source.
- There is no current `activationMode`, `tenantId`, or `devicePolicyId` path.

### 3.2 Activation Model

Future code should introduce a single activation resolver:

```text
activationMode = disabled | user_consent | managed_policy
```

Resolution rule:

```js
if (managedPolicy.enabled === true && managedPolicy.deploymentMode === 'managed') {
  activationMode = 'managed_policy';
} else if (localConsent.accepted === true) {
  activationMode = 'user_consent';
} else {
  activationMode = 'disabled';
}
```

Managed policy wins over local consent because the managed channel represents administrator activation.

### 3.3 Managed Policy Boundary

Managed policy is for activation and identity anchors only.

Allowed in managed policy:

- `enabled`
- `deploymentMode`
- `tenantId`
- `devicePolicyId`
- `cloudEndpoint`
- `allowIdentityRecovery`

Not allowed in managed policy:

- website rules
- study/composite/rest quotas
- time windows
- child name
- email
- token
- password
- JWT
- full URL lists

Website rules, quotas, time windows, child profile configuration, and site-classification data should continue to come from cloud config.

## 4. Code Changes for Later Tasks

Task B should implement only the managed activation skeleton.

Recommended insertion points:

- Add a small activation gate module, for example `extension/core/activation-gate.js`.
- Read `chrome.storage.managed` safely and tolerate unavailable/malformed policy.
- Replace direct consent-only runtime decisions with activation decisions where appropriate:
  - `background.js:isMonitoringEnabled()`
  - background startup / `onInstalled` / `onStartup`
  - `initSignal` dispatch gate
  - `periodicCheckpoint` / `quota_check`
  - `cloudSync` / `cloudHeartbeat`
  - `initCloudSync`
  - device recovery / identity link
- Preserve existing CWS behavior:
  - no managed policy + local consent accepted -> `user_consent`
  - no managed policy + no consent -> `disabled`
- Expose activation status to popup/admin as readonly diagnostics.

Task B must not implement device recovery, self-hosted packaging, or cloud schema changes.

## 5. Managed Policy Schema

Minimum schema for the pilot:

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

Validation expectations:

- `enabled` must be exactly `true`.
- `deploymentMode` must be exactly `"managed"`.
- `tenantId` and `devicePolicyId` are opaque identifiers.
- `cloudEndpoint` must be an HTTPS origin / endpoint chosen by Product Owner.
- `allowIdentityRecovery` only permits future recovery flow; it does not itself authenticate the device.

## 6. Packaging and Deployment Changes

### 6.1 Self-hosted CRX Requirements

Self-hosted deployment requires:

- fixed extension private key
- stable extension ID
- version increment for every update
- CRX artifact
- `update.xml`
- SHA256 record
- server hosting path

Private signing material must never be committed to Git.

`.pem` and local signing material must be ignored by Git. Production signing keys must not appear in docs, logs, scripts, screenshots, or CI output.

### 6.2 Update Hosting Layout

Recommended logical server layout:

```text
timeonchrome-update/
├── update.xml
└── crx/
    ├── timeonchrome-1.7.8.crx
    ├── timeonchrome-1.7.9.crx
    └── timeonchrome-1.7.10-rollback.crx
```

Public URLs:

```text
https://timeonchrome-update.<domain>/timeonchrome/update.xml
https://timeonchrome-update.<domain>/timeonchrome/crx/timeonchrome-<version>.crx
```

Content and cache requirements:

```text
update.xml:
  Content-Type: application/xml or text/xml
  Cache-Control: no-cache, no-store, must-revalidate

versioned CRX:
  Content-Type: application/x-chrome-extension
  Cache-Control: public, max-age=31536000, immutable
```

Update hosting should be logically separate from `guardian-api` business endpoints. Do not turn the main guardian-api Worker into the CRX distribution service without a separate approved design.

## 7. Chrome Policy Integration

### 7.1 Extension Deployment Policy

Template:

```xml
<key>ExtensionSettings</key>
<dict>
    <key>TIMEONCHROME_EXTENSION_ID</key>
    <dict>
        <key>installation_mode</key>
        <string>force_installed</string>

        <key>toolbar_pin</key>
        <string>force_pinned</string>

        <key>update_url</key>
        <string>https://timeonchrome-update.example.com/timeonchrome/update.xml</string>
    </dict>
</dict>
```

Expected validation:

- `chrome://policy` shows `ExtensionSettings`.
- `chrome://extensions` shows TimeOnChrome installed by policy.
- The extension cannot be disabled or removed by the child user.
- The toolbar icon is force-pinned if supported by the target Chrome policy.

### 7.2 Managed Storage Policy Example

The managed storage policy should contain only activation and identity anchor data:

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

### 7.3 Chrome Hardening Policy

Chrome profile/account hardening is separate from extension deployment policy. It may be deployed in the same plist, but it must be documented separately.

Example:

```xml
<key>BrowserSignin</key>
<integer>2</integer>

<key>RestrictSigninToPattern</key>
<string>^USER_EMAIL_PLACEHOLDER$</string>

<key>BrowserAddPersonEnabled</key>
<false/>

<key>BrowserGuestModeEnabled</key>
<false/>

<key>IncognitoModeAvailability</key>
<integer>1</integer>
```

Do not put real child email addresses in reusable templates.

## 8. macOS LaunchDaemon Policy Keeper

The LaunchDaemon policy keeper is a local policy restoration layer.

It can help ensure:

- the policy template exists;
- the restore script exists;
- the LaunchDaemon is loaded;
- `/Library/Managed Preferences/com.google.Chrome.plist` is restored when removed or changed;
- logs show restore activity.

It cannot guarantee control if a higher-priority school Jamf/MDM system deletes the LaunchDaemon, restore script, policy root assets, or managed preferences.

This pilot assumes school management currently does not delete the local policy keeper root assets.

This is not an MDM replacement.

This must not be described or implemented as bypassing school MDM.

## 9. Testing and Validation

Pilot validation checklist:

```text
[ ] /Library/LaunchDaemons/local.timeonchrome.restore-chrome-policy.plist exists
[ ] /usr/local/sbin/timeonchrome-restore-chrome-policy.sh exists
[ ] /usr/local/timeonchrome-policy/com.google.Chrome.plist exists
[ ] launchctl print system/local.timeonchrome.restore-chrome-policy works
[ ] restore log updates
[ ] /Library/Managed Preferences/com.google.Chrome.plist restored
[ ] chrome://policy shows ExtensionSettings OK
[ ] chrome://extensions shows TimeOnChrome installed by policy
[ ] extension cannot be disabled
[ ] extension cannot be removed
[ ] update.xml accessible from target Mac
[ ] CRX URL accessible from target Mac
[ ] Chrome installs self-hosted extension via policy
[ ] version increments update successfully
[ ] activationMode = managed_policy when managed policy enabled
[ ] local consent is not required in managed mode
[ ] UI shows managed activation status
```

Task A requires no code tests.

Task B should add activation resolver unit tests.

Task C should validate `update.xml` syntax, manifest version extraction, CRX SHA256 output, and dry-run script behavior if scripts are added.

Task D should validate macOS policy snippets by review and, when available, on a target Mac.

## 10. Rollback

Rollback for self-hosted extension updates is version-forward only:

- publish a higher-version rollback CRX;
- update `update.xml` to point to that rollback build;
- keep old CRX artifacts for audit and recovery;
- avoid relying on Chrome downgrades.

Rollback for managed activation:

- remove or disable the managed storage policy;
- remove force-install policy if the extension must be uninstalled;
- preserve cloud config and business data;
- do not delete device records unless explicitly requested by Product Owner.

Rollback for macOS policy keeper:

- unload LaunchDaemon;
- remove LaunchDaemon plist;
- remove restore script and policy root assets;
- remove managed Chrome policy plist;
- verify `chrome://policy` no longer shows TimeOnChrome force-install policy.

## 11. Known Limits

- This pilot controls Chrome extension deployment only. It does not control Safari, Edge, local apps, DNS, VPN, or macOS system behavior.
- The LaunchDaemon policy keeper is not reliable if school MDM deletes local keeper assets.
- The managed channel does not solve public CWS review issues.
- `devicePolicyId` recovery is design-only for now; it requires future server-side mapping and authorization.
- Managed policy must not contain secrets or full business configuration.
- Self-hosted CRX deployment requires careful private key custody; losing or changing the key changes the extension ID.

## 12. Explicit Non-goals

Do not do any of the following in this pilot task:

- commit `.pem`;
- generate or expose a production signing key in repo;
- log private key material;
- modify the CWS package;
- add `history` permission;
- modify site access policy;
- modify timing/statistics settlement;
- move website rules, quotas, or time windows into `chrome.storage.managed`;
- turn `guardian-api` business Worker into the CRX distribution service;
- use `chflags schg`;
- use wording or implementation intended to bypass school MDM.

## 13. Later Task Breakdown

Recommended sequence:

```text
1. Task A: Design audit document
2. Product Owner review
3. Task B: Managed activation skeleton
4. Product Owner code/test review
5. Task C: Self-hosted CRX/update.xml pilot
6. Manual test Mac policy validation
7. Task D: macOS policy keeper validation pack
8. Task E: devicePolicyId recovery design
```

Task B should be the first code task. It should not include CRX packaging, Worker schema, or device recovery implementation.

