# macOS Chrome Policy Keeper Validation Pack

## 1. Scope

This document is Task D for the managed internal channel.

It describes how to validate a local macOS policy keeper for TimeOnChrome managed deployment.

The policy keeper is a local recovery layer for Chrome policy files. It is not an MDM replacement and must not be used to bypass school, employer, or enterprise MDM.

## 2. Role Of The Keeper

The keeper is responsible for restoring local Chrome policy assets when they are accidentally changed or removed on a controlled family-owned Mac.

It may restore:

- Chrome `ExtensionSettings` force-install policy.
- TimeOnChrome managed storage policy.
- Local policy files under the expected Chrome policy location.

It must not:

- bypass school MDM;
- remove third-party controls;
- install or hide credentials;
- store TimeOnChrome device tokens;
- store Chrome Web Store or Google credentials;
- store CRX private signing keys.

If Jamf, school MDM, enterprise MDM, or another privileged management layer deletes the keeper assets, this mechanism is not reliable.

## 3. Expected Policy Assets

Chrome extension force-install policy:

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

TimeOnChrome managed storage policy:

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

Only activation and identity anchor data belongs in managed policy. Website rules, quota, time windows, profile data, and tokens continue to come from cloud config.

## 4. LaunchDaemon Shape

Example conceptual layout:

```text
/Library/LaunchDaemons/cn.williamxia.timeonchrome.policykeeper.plist
/Library/Application Support/TimeOnChromePolicyKeeper/restore-policy.sh
/Library/Application Support/TimeOnChromePolicyKeeper/policies/
```

The LaunchDaemon should:

- run as root;
- call a small restore script;
- write a local log;
- use a bounded cadence such as `StartInterval = 60`;
- avoid network dependency;
- avoid modifying any policy outside the TimeOnChrome-owned files.

## 5. Restore Script Validation

The restore script should be deterministic:

- compare expected policy files with active policy files;
- copy only when content differs;
- validate JSON before and after copy;
- set owner and mode explicitly;
- write a concise local log entry for restored, unchanged, invalid, or failed states.

Suggested checks:

```bash
plutil -lint /Library/LaunchDaemons/cn.williamxia.timeonchrome.policykeeper.plist
plutil -lint <policy-json-file>
cmp -s <expected-policy> <active-policy>
tail -n 50 /var/log/timeonchrome-policykeeper.log
```

## 6. Chrome Validation

After installing the policy keeper and restarting Chrome:

1. Open `chrome://policy`.
2. Click `Reload policies`.
3. Confirm `ExtensionSettings` contains the stable TimeOnChrome extension ID.
4. Confirm the `update_url` points to the self-hosted `update.xml`.
5. Confirm managed storage keys are visible for TimeOnChrome.
6. Open `chrome://extensions`.
7. Confirm TimeOnChrome is force-installed.
8. Confirm it cannot be disabled or removed by the child user.
9. Open TimeOnChrome Popup/Admin.
10. Confirm activation source shows managed policy.

## 7. Self-hosted Update Validation

Before testing on the child device:

- Fetch `update.xml` with HTTP 200.
- Confirm `update.xml` version matches the intended CRX.
- Fetch the CRX URL with HTTP 200.
- Confirm SHA256 matches `SHA256SUMS.txt`.
- Confirm the extension ID matches the private key used to sign the CRX.

On the test Mac:

- Confirm Chrome installs the extension from policy.
- Confirm Chrome updates to the version in `update.xml`.
- Confirm rollback uses a higher-version rollback CRX, not a lower version.

## 8. Failure Modes

Expected failure handling:

- Missing `update.xml`: Chrome keeps the current installed version and logs update errors.
- Wrong extension ID: Chrome will not update the intended extension.
- Changed private key: extension ID changes; this is a new extension, not an update.
- Invalid managed policy JSON: activation falls back to disabled or user consent path.
- Keeper removed by MDM: local recovery stops; do not fight MDM.

## 9. Rollback

Rollback requires a higher version:

```text
bad pilot:      1.7.8-managed.1
rollback build: 1.7.8-managed.2
```

Publish the rollback CRX and update `update.xml`.

Do not rely on Chrome downgrading to a lower version.

## 10. Evidence Checklist

Collect screenshots or command output for:

- `plutil -lint` success for the LaunchDaemon.
- Restore script log showing unchanged or restored.
- `chrome://policy` with `ExtensionSettings`.
- `chrome://extensions` showing force-installed TimeOnChrome.
- Popup/Admin showing managed activation source.
- `update.xml` and SHA256 verification.

Do not capture:

- private signing key paths if they reveal sensitive locations;
- device tokens;
- account tokens;
- raw Chrome identity values;
- child private browsing history.
