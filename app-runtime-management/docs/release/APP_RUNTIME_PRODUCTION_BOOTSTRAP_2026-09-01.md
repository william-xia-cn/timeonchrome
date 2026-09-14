# App Runtime Production Bootstrap — 2026-09-01

## Release identity

- Scope: shared App Runtime Worker and dedicated Runtime D1 only
- Candidate branch: `codex/macos-app-management-v1`
- Candidate commit: `c9affae6a68abed5d3b20b5949733700e9798de0`
- Worker: `timeonchrome-app-runtime-api`
- D1: `timeonchrome-app-runtime`
- Deployed Worker version: `3f057d03-0b2c-4482-9925-0979258e3945`
- Endpoint: `https://timeonchrome-app-runtime-api.william-xia-cn.workers.dev`
- Status: PASS

## Authorized production writes

- Create the dedicated Runtime D1 database.
- Apply `0001_runtime_backend.sql` to that database.
- Configure the Runtime-only `ADMIN_API_KEY` Worker secret.
- Deploy the Runtime Worker and its D1 binding.

## Explicit exclusions

- No real enrollment code, device, subject, usage segment, or family data.
- No Guardian, Santa, Pages, Chrome Extension, existing D1, route, or secret changes.
- No Windows Agent installation or startup registration.
- No custom domain in this bootstrap; use the generated Workers endpoint.

## Gates

| Gate | Result | Evidence |
|---|---|---|
| Git and Cloudflare preflight | PASS | Clean synchronized branch; target Worker and D1 names were absent before creation. |
| Automated tests | PASS | TypeScript passed; isolated Workers+D1 integration passed 8/8. |
| Configuration/dry-run | PASS | Generated types current; startup check and final dry-run passed. |
| D1 migration | PASS | Applied only `0001_runtime_backend.sql`; remote migration list is empty afterward. |
| Worker deployment | PASS | Final Runtime Worker version and generated Workers endpoint recorded above. |
| Production smoke | PASS | Health returned 200; unauthenticated admin/device calls returned 401; enrollment/device/segment counts remained zero. |
| Evidence privacy | PASS | No account identifier, credential, device identifier, subject identifier, or private data is recorded. |

## Rollback boundary

If deployment or smoke fails, stop further writes. Worker version rollback is allowed only to a known Runtime version; the newly created empty D1 is retained for diagnosis unless Product Owner separately authorizes deletion.

## Release recommendation

- Result: `PASS / DEPLOYED`
- Failed items: None.
- Blockers: None for backend bootstrap.
- Deferred: Real enrollment, Windows Agent installation, and real device-to-cloud end-to-end acceptance remain outside this deployment.
- Product Owner decision: Deployment explicitly approved in the current task.
