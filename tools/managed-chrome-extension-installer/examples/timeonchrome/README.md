# TimeOnChrome Example

This example maps the generic installer fields to the TimeOnChrome managed deployment model.

Important fields:

- `extensionId`: `jdcancbiocacabbjdkngadmjpjmkdnih`
- `expectedVersion`: `latest` by default; use a concrete version only with a pinned feed for audit or troubleshooting.
- `updateUrl`: `https://timeonchrome-update.pages.dev/timeonchrome/update.xml`
- `targetProfileEmail`: `pierce.xia@icloud.com`
- `managedDeviceToken`: placeholder only; replace locally and never commit the real token.

Use this file as a model when moving the installer module into another repository.
