# Extension Directory Packaging

## Development

Chrome unpacked development must load:

```text
D:\Opencode\ChromeExtension\timeonchrome\extension
```

Do not load the repository root. The repository root contains tests, Cloudflare code, docs, generated profiles, and release artifacts that Chrome does not need to scan.

## Packaging

Release/debug packages should be built from `extension/` as the package root. The zip root must contain `manifest.json`, not an extra `extension/` parent folder.

Before packaging, run:

```bash
npm run check:extension-root
```

The check verifies that `extension/` contains required runtime files and excludes non-extension directories such as `tests`, `workers`, `pages`, `dist`, and `node_modules`.

Current source keeps the MV3 `scripting` permission for in-page mode notice fallback injection. Release evidence and Chrome Web Store permission justification must be generated from the current `extension/` source before submitting a new package.
