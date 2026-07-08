# TimeOnChrome Windows Install-Only Policy Test

## Goal

Use this test before managed activation. It validates only the self-hosted CRX/update chain:

- Chrome reads `update.xml`.
- Chrome installs the CRX.
- Extension ID is `jdcancbiocacabbjdkngadmjpjmkdnih`.
- Version is `1.7.9`.

This test intentionally removes `chrome.storage.managed` values for TimeOnChrome, so Popup/Admin should not show `managed_policy`.

## Policy File

Use:

```text
docs/deployment/templates/TimeOnChrome-InstallOnly-HKCU.reg
```

It writes only:

```text
HKCU\Software\Policies\Google\Chrome\ExtensionSettings
```

and removes:

```text
HKCU\Software\Policies\Google\Chrome\3rdparty\extensions\jdcancbiocacabbjdkngadmjpjmkdnih
```

## Install Steps

1. Close all Chrome windows.
2. Import the install-only policy:

```powershell
reg import D:\Opencode\ChromeExtension\timeonchrome\docs\deployment\templates\TimeOnChrome-InstallOnly-HKCU.reg
```

If this fails with `访问注册表时出错`, the current Windows account cannot write HKCU Chrome policy keys. In that case, run from an elevated PowerShell for the same Windows user, or switch to an HKLM install-only policy for machine-wide testing.

3. Start Chrome.
4. Open `chrome://policy`.
5. Click `Reload policies`.
6. Confirm `ExtensionSettings` is present and `OK`.
7. Open `chrome://extensions`.
8. Confirm TimeOnChrome is installed with:

```text
ID: jdcancbiocacabbjdkngadmjpjmkdnih
Version: 1.7.9
```

## Expected Result

- Extension is installed by policy.
- Toolbar is pinned.
- Extension ID is `jdcancbiocacabbjdkngadmjpjmkdnih`.
- Version is `1.7.9`.
- Popup/Admin does not show `managed_policy`.
- If opened before privacy consent or binding, the extension follows the normal non-managed path.

## Rollback

Remove the install policy and restart Chrome:

```powershell
reg delete HKCU\Software\Policies\Google\Chrome /v ExtensionSettings /f
```

Then open `chrome://policy`, click `Reload policies`, and confirm `ExtensionSettings` is gone.
