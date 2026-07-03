# TimeOnChrome Windows HKCU Policy Deployment - Pierce

## Summary

This deployment file is for `Pierce.xia@icloud.com` on a single Windows user account. It uses HKCU policy so it affects only the Windows user who imports the `.reg` file.

- Extension ID: `jdcancbiocacabbjdkngadmjpjmkdnih`
- Update URL: `https://timeonchrome-update.pages.dev/timeonchrome/update.xml`
- CRX version: `1.7.8`
- Tenant ID: `pierce-xia-icloud`
- Device policy ID: `pierce-windows-chrome-001`
- Policy file: `docs/deployment/templates/TimeOnChrome-Pierce-HKCU.reg`

`Pierce.xia@icloud.com` is not written into Chrome policy. The managed identity anchor is `tenantId + devicePolicyId`; the cloud maps that pair to the profile/device.

## Install

1. Sign in to the target Windows account for Pierce.
2. Close all Chrome windows.
3. Import the policy:

```powershell
reg import D:\Opencode\ChromeExtension\timeonchrome\docs\deployment\templates\TimeOnChrome-Pierce-HKCU.reg
```

4. Verify registry values:

```powershell
reg query HKCU\Software\Policies\Google\Chrome /v ExtensionSettings
reg query HKCU\Software\Policies\Google\Chrome\3rdparty\extensions\jdcancbiocacabbjdkngadmjpjmkdnih\policy
```

5. Start Chrome and open `chrome://policy`.
6. Click `Reload policies`.
7. Confirm `ExtensionSettings` is present and has status `OK`.
8. Open `chrome://extensions` and confirm TimeOnChrome is installed by policy with ID `jdcancbiocacabbjdkngadmjpjmkdnih`.

## Expected Policy Values

`ExtensionSettings` is stored as one compact JSON string under:

```text
HKCU\Software\Policies\Google\Chrome
```

Managed storage is stored under:

```text
HKCU\Software\Policies\Google\Chrome\3rdparty\extensions\jdcancbiocacabbjdkngadmjpjmkdnih\policy
```

The managed storage payload contains only activation and identity-anchor values:

```json
{
  "enabled": true,
  "deploymentMode": "managed",
  "tenantId": "pierce-xia-icloud",
  "devicePolicyId": "pierce-windows-chrome-001",
  "cloudEndpoint": "https://guardian-api.william-xia-cn.workers.dev",
  "allowIdentityRecovery": true
}
```

It must not contain website rules, quotas, time windows, account tokens, or device tokens.

## Cloud Mapping

Managed recovery requires a cloud mapping:

```json
{
  "tenantId": "pierce-xia-icloud",
  "devicePolicyId": "pierce-windows-chrome-001",
  "deviceId": "<Pierce current cloud device ID>",
  "status": "active"
}
```

Use the account API:

```http
PUT /profiles/:profileId/managed-device-mappings/v1
Authorization: Bearer <account_token>
Content-Type: application/json
```

Request body:

```json
{
  "tenantId": "pierce-xia-icloud",
  "devicePolicyId": "pierce-windows-chrome-001",
  "deviceId": "<Pierce current cloud device ID>",
  "status": "active"
}
```

If there is no reusable Pierce device yet, perform one normal bind/sync first so the cloud creates a `deviceId`, then create this mapping.

## Acceptance Checks

- `chrome://policy` shows `ExtensionSettings` with status `OK`.
- `chrome://extensions` shows TimeOnChrome installed by policy.
- Extension ID is `jdcancbiocacabbjdkngadmjpjmkdnih`.
- Version is `1.7.8`.
- Toolbar is pinned.
- Popup/Admin shows `managed_policy` activation.
- Site rules, quotas, and time windows still come from cloud config.
- When local `device_token` is missing, managed recovery tries `pierce-xia-icloud + pierce-windows-chrome-001`.
- `RECOVERED` restores the mapped device; `NO_MAPPING` does not create a duplicate device.

## Rollback

Remove the HKCU policy values and restart Chrome:

```powershell
reg delete HKCU\Software\Policies\Google\Chrome /v ExtensionSettings /f
reg delete HKCU\Software\Policies\Google\Chrome\3rdparty\extensions\jdcancbiocacabbjdkngadmjpjmkdnih /f
```

Then open `chrome://policy`, click `Reload policies`, and confirm the policy is gone.
