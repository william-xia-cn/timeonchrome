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

Current source does not use the MV3 `scripting` permission for in-page mode notices. Page notices are delivered by static `content_scripts` and the `CONTENT_SCRIPT_READY` pending queue; non-injectable pages fall back to system notifications.
