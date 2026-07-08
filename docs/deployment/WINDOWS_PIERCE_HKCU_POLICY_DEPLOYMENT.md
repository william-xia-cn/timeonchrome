# TimeOnChrome Windows HKCU Policy Deployment - Pierce

## Summary

This deployment file is for `Pierce.xia@icloud.com` on a single Windows user account. It uses HKCU policy so it affects only the Windows user who imports the `.reg` file.

- Extension ID: `jdcancbiocacabbjdkngadmjpjmkdnih`
- Update URL: `https://timeonchrome-update.pages.dev/timeonchrome/update.xml`
- CRX version: `1.7.9`
- Policy file: `docs/deployment/templates/TimeOnChrome-Pierce-HKCU.reg`

`Pierce.xia@icloud.com` is not written into Chrome policy. The managed credential is `managedDeviceToken`, exported from TimeOnChrome cloud console for the target device. Treat it as a secret device access token.

## Before Install

In TimeOnChrome cloud console, open `子用户管理 -> 绑定设备` and either:

- create a new managed device, then copy the generated Device Token; or
- select an existing bound device and export or reset its Device Token.

Replace `<MANAGED_DEVICE_TOKEN_FROM_CLOUD>` in `TimeOnChrome-Pierce-HKCU.reg` with that token before importing the file. Do not commit the filled `.reg` file or paste the token into public docs or chat.

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

The managed storage payload contains only activation and device credential values:

```json
{
  "enabled": true,
  "deploymentMode": "managed",
  "cloudEndpoint": "https://guardian-api.william-xia-cn.workers.dev",
  "managedDeviceToken": "<MANAGED_DEVICE_TOKEN_FROM_CLOUD>",
  "managedDeviceLabel": "Pierce Windows Chrome"
}
```

It must not contain website rules, quotas, time windows, account tokens, passwords, raw Chrome identity, or private browsing data.

## Device Identity

The cloud and client only recognize the Device and its Device Token. A device can be created by normal child-side binding or pre-created in the cloud console. Both are the same `devices` record and use the same `device_token` for `/device/config`, heartbeat, and sync.

## Acceptance Checks

- `chrome://policy` shows `ExtensionSettings` with status `OK`.
- `chrome://extensions` shows TimeOnChrome installed by policy.
- Extension ID is `jdcancbiocacabbjdkngadmjpjmkdnih`.
- Version is `1.7.9`.
- Toolbar is pinned.
- Popup/Admin shows `managed_policy` activation.
- Site rules, quotas, and time windows still come from cloud config.
- When local `cloud_device_token` is missing, the extension adopts `managedDeviceToken`, calls `/device/config`, hydrates `profileId/deviceId`, then performs a full sync.
- Resetting the token in the cloud invalidates the old token; the target policy must be updated with the new token.

## Rollback

Remove the HKCU policy values and restart Chrome:

```powershell
reg delete HKCU\Software\Policies\Google\Chrome /v ExtensionSettings /f
reg delete HKCU\Software\Policies\Google\Chrome\3rdparty\extensions\jdcancbiocacabbjdkngadmjpjmkdnih /f
```

Then open `chrome://policy`, click `Reload policies`, and confirm the policy is gone.
