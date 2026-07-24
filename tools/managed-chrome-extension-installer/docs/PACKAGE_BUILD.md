# Package Build

`package/build-package.ps1` creates a portable macOS installer directory and `.tar.gz` archive.

Outputs:

- `macos-managed-extension-installer.sh`
- `install.command`
- `uninstall.command`
- `private-config.plist` or `private-config.example.plist`
- `README.md`
- `docs/**`
- `PACKAGE-MANIFEST.txt`
- `<package-name>.tar.gz`

The manifest records SHA256 hashes for package files except `PACKAGE-MANIFEST.txt` itself.

Use a private config path only when building a real private installer. The config is copied into the generated package, not into Git.
