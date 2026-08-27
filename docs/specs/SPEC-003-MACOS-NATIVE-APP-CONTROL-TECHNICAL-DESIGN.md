# SPEC-003 macOS Native App Control V1 Technical Design

## Status

Approved；V1 源码已通过前向恢复提交 `b133abd` 纳入 `master`，原独立功能分支已退役。独立 D1、Native Worker、Guardian identity bridge 与 Pages 控制台已于 2026-08-20 部署；真实 Santa 的 MachineID 固定、四阶段同步和离线阻断验收仍待执行。

## Deployment Boundary

```text
guardian-api                     timeonchrome-native-app-api
Account / Child identity        Santa sync / Native Apps policy
guardian-db                     timeonchrome-native-app-db
        |                                   |
        +-- ES256 child-scoped token ------>+
```

Native App Control lives under `native-app-control/` and must not import product code from `extension/`, `workers/src/` or website-classification modules.

## Identity Bridge

- `guardian-api` adds only a narrow module-token endpoint.
- A valid parent account token and owned profile produce a five-minute ES256 JWT with `aud=native-app-control`, `account_id` and one `child_id`.
- The Native Worker stores only the public verification JWK. It cannot mint guardian account tokens.
- Profile deletion sends a signed lifecycle event to the Native Worker. Native data is deleted independently.
- Guardian 先将 `child.deleted` 与最终 Profile 删除同批写入窄 lifecycle outbox；五分钟 cron 使用 ES256 lifecycle token 重试，避免 Native Worker 短暂不可用导致孤儿数据。

## Native Data

The separate D1 owns:

- `native_children_v1`
- `native_macs_v1`
- `santa_enrollments_v1`
- `application_identities_v1`
- `account_applications_v1`
- `application_memberships_v1`
- `application_observations_v1`
- `child_application_states_v1`
- `child_publisher_blocks_v1`
- `native_app_audit_events_v1`

No table contains Chrome device IDs, Device Tokens, website classifications, time quotas or usage durations.

## Santa Protocol

SyncBaseURL contains a public endpoint ID and a random scoped secret. D1 stores only the secret hash. The Worker implements standard `preflight`, `eventupload`, `ruledownload` and `postflight` endpoints.

- First preflight binds an HMAC of Santa MachineID; later mismatches are rejected.
- Preflight returns Monitor mode, bundle discovery enabled and a 60-second full-sync interval.
- Preflight 必须返回 `enable_all_event_upload: true`，使 Santa 将明确允许及 macOS 平台应用的主动、未缓存执行决策上传到独立 Native Worker；该云端运行配置不要求重新安装设备 `.mobileconfig`。Santa 的允许决策缓存仍意味着该数据用于应用发现，而不是精确的逐次启动计数。
- 当策略版本变化触发 `CLEAN` sync 时，Preflight 同时返回 `enable_clean_sync_event_upload: true`，避免 clean sync 抑制 Santa 已保存的执行事件上传。服务端可通过提升单台 Native Mac 的目标策略版本触发一次性 clean sync，用于刷新执行判断缓存和排查已启动但未发现的应用；不得周期性滥用 clean sync，也不得把它解释为历史启动清单回填。
- Preflight 固定返回 `batch_size: 20`。Native Worker 为每个应用执行事件规范化身份并幂等合并多张 D1 表；处理时先读取现有 identity/application 映射，再按 20 个事件一组执行 D1 batch，避免逐事件多次往返。较大的 EventUpload 批次若超过请求执行窗口会被取消，导致 Santa 永久重传同一批旧事件、阻塞后续应用发现；批次只有在完整写入并更新 Native Mac 上传时间后才返回成功。
- Santa JSON sync requests may use `identity`, `deflate` or `gzip` content encoding. Native Worker must decode the request body before parsing JSON. A decode or parse failure must return a retriable server failure; it must never be treated as an empty request and acknowledged with HTTP 200, because Santa may then remove unprocessed events from its local queue.
- EventUpload is normalized and idempotently upserted. Raw payloads, logged-in session arrays and launch counters are not retained.
- EventUpload 发现新的 `file_bundle_hash` 后，通过 Santa 公共协议响应字段 `event_upload_bundle_binaries` 请求该 bundle 的 binary 明细；`decision=BUNDLE_BINARY` 的明细通过同一 hash 回挂首次发现的 Application，收到明细后停止请求。不能假定 Santa 公共事件提供自定义 `top_level_bundle_id`。
- Santa 当前版本的 `signing_id` 可能已经采用 `TeamID:SigningID` 形式。身份规范化必须检测该前缀，禁止再次拼接 Team ID；策略编译同时兼容并折叠历史双前缀值，确保下发的 SIGNINGID rule 始终为单一 `TeamID:SigningID`。
- Policy changes increment Child policy version. Native Macs track desired, syncing and applied versions.
- CLEAN sync returns the full compiled rule set plus a validated no-op baseline rule; normal sync returns no duplicate business rules.
- V1 baseline 固定为 64 个 `0` 的 BINARY ALLOWLIST rule；Worker 拒绝其他 baseline 配置，避免“保活规则”意外改变真实策略。
- Rule compilation order is SIGNINGID, CDHASH, then BINARY for application blocks; TEAMID is used only for explicit publisher blocks.

### Thomas 预置应用阻止规则

Thomas / T.xia 的 Native App 策略允许在应用尚未产生 observation 前预置已核验的稳定 SIGNINGID 阻止规则。预置 Application 必须使用正常的 identity、membership、Child `BLOCK` state 与审计记录，不得伪造启动 observation；控制台将其显示为“预置规则 · 尚未在终端观察”。后续 Santa 上传同一 SigningID 时必须复用现有 Application 并补充真实 observation，不得产生重复应用。

当前已批准的预置规则仅包括：

- Steam：`MXGJJ98X76:com.valvesoftware.steam`
- Firefox：`43AQ936H96:org.mozilla.firefox`
- Opera：`A2P9LX4JPN:com.operasoftware.Opera`
- Microsoft Edge：`UBF8T346G9:com.microsoft.edgemac`

四项均编译为 SIGNINGID `BLOCKLIST`，不得扩大为 TEAMID publisher block。Proton VPN 必须等待从 Thomas Mac 实际签名 App 核验 `Identifier + TeamIdentifier` 后另行加入，不得使用猜测身份。

## Console Boundary

The parent console hosts `/native-apps/` as a separate HTML/CSS/JS module. It may read the existing same-origin login session and selected Child ID only to request the short-lived module token. It communicates directly with the Native Worker afterward.

独立模块读取到过期的 Guardian account token 时，必须使用同源 session 中的 refresh token 更新主控制台 session，并对 module-token 请求单次重试；Native module token 返回 401 时同样只允许重新签发并单次重试。刷新失败后提示返回主控制台重新登录，不得把可恢复的 token 过期直接显示为裸 `Unauthorized`。

The main `pages/index.html` adds only a navigation link. It must not embed Native App state, rendering or decision logic.

### Review presentation hierarchy

Santa execution observations remain complete audit evidence, but the review console must not flatten every helper and system process into the primary application list. `listApplications()` derives a read-only presentation model without deleting observations or changing policy identities:

- `USER_APPLICATION`: a recognizable top-level `.app`; shown in the primary review list.
- `APPLICATION_COMPONENT`: a helper, framework, XPC service or login item that can be associated with an outer `.app`; nested under that application when possible.
- `SYSTEM_COMPONENT`: an executable under protected macOS system locations (`/System`, `/usr/bin`, `/usr/sbin`, `/usr/libexec`, `/bin`, `/sbin`, `/Library/Apple/System`); shown in the collapsed process section. `/usr/local` and ordinary `/Library` paths are not treated as system evidence.
- `STANDALONE_BACKGROUND`: a third-party daemon or privileged helper without a reliable parent application; shown in the collapsed process section but remains independently actionable.
- `UNKNOWN_EXECUTABLE`: unsigned, unusual-location or insufficiently identified executable; remains in the primary review list.

Classification is conservative. Missing or ambiguous evidence keeps an item visible in the primary list. The console defaults to an expanded application section, per-application collapsed component details, and a collapsed background/system section. Search covers all sections. REVIEW counts exclude attached helpers and confirmed Apple system components, but include unknown executables and standalone third-party background components. This is presentation-only: raw observations, REVIEW/IGNORE/BLOCK state, audit records and Santa rule compilation remain unchanged.

EventUpload grouping uses a stable outer `.app name + TeamID` key when an application path is available, so a top-level app and its helper binaries converge on one future Application record even when Santa does not provide a custom top-level Bundle ID. Historical Application rows are not destructively rewritten or automatically merged by this presentation change.

Canonical source 位于 `native-app-control/console/`；`npm run stage:native-app-console` 生成 Pages 部署目录 `pages/native-apps/`，测试要求三份部署文件与 canonical source 字节一致。

Native Mac 创建或轮换 enrollment 后，控制台使用仅在当前响应中出现的 `SyncBaseURL` 在浏览器内存中生成设备专属 `.mobileconfig` 并立即提供下载。页面不得显示或长期保存裸 URL；同一页面会话可重复下载，刷新后必须轮换 enrollment 才能重新生成。profile 只包含 Santa 运行配置和家长设置的 Native Mac 名称，不写入 Account ID、Child ID、Chrome Device、MachineID 或任何 Chrome 凭据。

## Terminal Boundary

The independent installer installs the official Santa package and validates the Santa configuration profile downloaded from the Native Apps console. It must not read or write Chrome policy, extension storage, managed Device Token, the Chrome policy keeper or Native Messaging manifests.

共享安装材料只可复用经过 SHA-256 与 Developer ID 验证的官方 Santa package。任何随共享包附带的本地阻断规则、证据采集脚本或常驻健康监测器均不属于 Native App Control V1，不得由 TimeOnChrome 安装流程执行或安装。Santa profile 使用 `com.northpolesec.santa` payload、`PayloadScope=System` 和以 `/` 结尾的 HTTPS `SyncBaseURL`。

## Future Device Override Boundary

Device Override 仅预留为未来 `Child + Native Mac` 作用域的 Native 策略层。V1 不创建对应数据表或 API，不在 UI 开放，也不得引用或映射 Chrome Device；未来设计仍必须以 `native_macs_v1.id` 作为唯一终端作用域。

## Implemented Interfaces

- Guardian：`POST /profiles/:childId/native-app-control/token`。
- Native Admin：`/native/v1/applications`、decision、merge/unmerge、`/native/v1/macs`、revoke、rotate enrollment。
- Lifecycle：`POST /identity/v1/child-lifecycle`。
- Santa：`/santa/v1/{endpointId}/{secret}/{preflight|eventupload|ruledownload|postflight}/{machineId}`。

## Production Gate

1. 创建独立 D1，替换 `wrangler.toml` 的全零 dry-run ID，并先应用 module migration `001`。
2. 生成 P-256 ES256 key pair：private JWK 只进入 guardian-api secret，public JWK 只进入 Native Worker secret。
3. 配置两个独立 HMAC secret、固定 no-op baseline JSON 和 Native Worker public base URL。
4. 先部署 Native Worker，再应用 guardian migration `022`，最后部署 guardian-api；migration `022` 未完成前禁止部署含 Profile 删除 outbox 的 Guardian 代码。
5. 完成 Santa 官方 package、真实 MachineID 固定、四阶段 clean sync、REVIEW/IGNORE/BLOCK 与离线重启人工验收后，最后部署带 `Native Apps` 导航的 Pages。

2026-08-20 为生成设备专属 enrollment profile，Product Owner 授权先部署控制台作为受控安装入口。该顺序调整不降低真实 Santa 验收门槛，也不得将“控制台可访问”记录为四阶段同步或阻断验收通过。
