# Managed Chrome Extension Installer

This module packages a reusable macOS installer for managed Chrome extensions. It is designed for extensions that are force-installed through Chrome enterprise policy, receive local configuration through `chrome.storage.managed`, and need a local keeper to restore policy state after system maintenance or configuration drift.

It was extracted from the TimeOnChrome Pierce macOS deployment work, but the core installer is configured through `private-config.plist` and can be copied to another repository.

## What It Provides

- macOS Chrome `ExtensionSettings` force install policy.
- Optional Chrome hardening for a single allowed signed-in Chrome account.
- Managed extension policy through MCX and `/Library/Managed Preferences`.
- Runtime profile gate input through `managedProfileEmail`.
- LaunchDaemon keeper that restores Chrome policy, managed preferences, and MCX directory record.
- Install, repair/reinstall, uninstall, restore-test, and validate commands.
- Package generation with `PACKAGE-MANIFEST.txt` and `.tar.gz` output.

## Directory Layout

```text
managed-chrome-extension-installer/
├── README.md
├── docs/
│   ├── SECURITY.md
│   └── PACKAGE_BUILD.md
├── examples/
│   └── timeonchrome/private-config.example.plist
├── package/
│   └── build-package.ps1
├── src/
│   └── macos-managed-extension-installer.sh
└── templates/
    ├── install.command
    ├── private-config.example.plist
    └── uninstall.command
```

## Build a Package

From a repository that contains this module:

```powershell
pwsh ./tools/managed-chrome-extension-installer/package/build-package.ps1 `
  -ConfigPath ./secure/private-config.plist `
  -OutputDir ./dist/private-installers
```

If `-ConfigPath` is omitted, the package uses `private-config.example.plist` and is safe as a public skeleton package.

## Install on macOS

After copying and extracting the package on the target Mac:

```bash
chmod 700 . macos-managed-extension-installer.sh install.command uninstall.command
chmod 600 private-config.plist
sudo ./macos-managed-extension-installer.sh install
```

Validation-only and keeper restore tests are also available:

```bash
sudo ./macos-managed-extension-installer.sh validate
sudo ./macos-managed-extension-installer.sh restore-test
```

## Porting Checklist

- Replace `extensionId`, `expectedVersion`, and `updateUrl`.
- Set a project-specific `deploymentName`, `policySlug`, and `launchDaemonLabel`.
- Set `targetProfileEmail` to the Chrome profile account that should activate the extension.
- Keep `managedDeviceToken` outside Git and provide it only through a private config file.
- Ensure the extension manifest has a managed storage schema if `validateManagedSchema=true`.
- Ensure the extension runtime treats non-matching `managedProfileEmail` as inactive.
