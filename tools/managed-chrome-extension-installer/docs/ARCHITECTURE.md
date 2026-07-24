# Architecture

The module has four layers:

1. Package layer: `package/build-package.ps1` stages files, injects a private config when supplied, writes `PACKAGE-MANIFEST.txt`, and creates `.tar.gz`.
2. Installer layer: `src/macos-managed-extension-installer.sh` installs, repairs, validates, and uninstalls the managed deployment on macOS.
3. Policy layer: the installer writes Chrome `ExtensionSettings`, extension managed preferences, and MCX data for `chrome.storage.managed`.
4. Keeper layer: a LaunchDaemon runs a restore script at load, every 60 seconds, and when watched policy paths change.

The extension itself must still implement runtime behavior for managed fields such as `managedDeviceToken` and `managedProfileEmail`. The installer can deliver those fields, but it cannot enforce extension-specific activation semantics inside JavaScript.

## macOS State Written by the Installer

- `/usr/local/<policySlug>-policy/com.google.Chrome.plist`
- `/usr/local/<policySlug>-policy/managed-extension-mcx.plist`
- `/usr/local/<policySlug>-policy/managed-extension-preferences.plist`
- `/usr/local/sbin/<policySlug>-restore-chrome-policy.sh`
- `/Library/LaunchDaemons/<launchDaemonLabel>.plist`
- `/Library/Managed Preferences/com.google.Chrome.plist`
- `/Library/Managed Preferences/com.google.Chrome.extensions.<extensionId>.plist`
- `/Library/Application Support/<appSupportName>/private-deployment/<extensionId>/...` rollback snapshots

## Validation Strategy

- Preflight validates config shape, target Chrome Profile email uniqueness, update feed, and optionally cloud token reachability.
- Install writes policy sources and active files, imports MCX, starts the keeper, and opens Chrome with the resolved `--profile-directory`.
- Final validation waits for three consecutive Chrome-readable checks covering active policy, effective MCX, installed extension version, managed schema, and Chrome Managed Extension Settings.
- Repair/reinstall verifies extension local storage does not change while Chrome is closed.
