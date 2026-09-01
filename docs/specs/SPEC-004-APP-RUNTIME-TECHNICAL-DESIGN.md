# SPEC-004 Cross-Platform App Runtime Management Technical Design

## Status

Approved for Windows productization closure。本文定义一个 Runtime 产品、两个原生 Agent 和一个共享 Runtime 后台；当前阶段完成 Windows 安装、Guardian Child 身份桥、家长控制台、设备健康和统计闭环，macOS 真实采集留待后续。

## Repository Layout

```text
app-runtime-management/
├── contracts/
│   ├── runtime-contract-v1.schema.json
│   └── runtime-state-machine-v1.vectors.json
├── agents/
│   ├── macos/                  Swift Package
│   └── windows/                .NET 8 Core / Windows / Infrastructure / Agent / tests
└── backend/
    ├── migrations/             Runtime D1 schema
    ├── src/                    contracts, validation, auth, repository, routes
    ├── test/                   Workers runtime + local D1 tests
    └── wrangler.jsonc          local/staging/production binding declaration
├── console/                    Runtime 家长页面 canonical source
└── installer/                  release manifest/build metadata
```

`native-app-control/` 与上述目录并列保留，但它是 Santa discovery/enforcement 实现和独立后台，不是 Runtime Agent 或 Runtime 后台。

## Product And Process Model

```text
macOS platform facts ─► macOS Agent ─┐
                                    ├─► shared Runtime contract ─► future Runtime backend
Windows platform facts ─► Win Agent ┘

Santa events ─► native-app-control ─► existing Santa Worker/D1
```

- macOS 与 Windows 是同一 Runtime 产品的两个 platform adapters。
- 每个活动交互式用户会话拥有独立 runtime process、`runtimeSessionID`、状态、未来 SQLite ledger 和 outbox。
- 跨平台一致性由共享 JSON Schema 与黄金向量控制，不通过 Swift/.NET FFI 共享二进制 Core。
- Santa 和 Runtime 可以在产品 UI 聚合，但不共享终端 credential、protocol 或 persistence table。

## Shared Contract

### ApplicationIdentity

```text
platform: macos | windows
runtimeIdentity: non-empty opaque stable key
displayName: optional presentation hint
```

`runtimeIdentity` 由平台 adapter 独立产生，但状态机只把它作为稳定不透明键。Phase 1 common contract 不携带 Bundle ID、Team ID、signing ID、AUMID、Package Family、publisher 或 executable path。

### RuntimeFact

Wire representation 使用显式 tagged object：

```text
observedAtMs: non-negative integer
kind: applicationActivated | userActivityChanged | sessionChanged | powerChanged | snapshot
application / userActivity / sessionState / powerState / snapshot: kind-specific payload
```

Swift 与 C# 可使用各自 enum/discriminated model，但加载共享向量时必须映射到同一 tagged contract。

### UsageSegment

```text
id
runtimeSessionID
application
startAtMs
endAtMs
durationMilliseconds
endReason
```

`endReason` 固定为：`applicationSwitch`、`userIdle`、`sessionUnavailable`、`systemSleep`、`periodicSnapshot`、`stateCorrection`。

### UploadAcceptance

```text
acceptedIds: string[]
rejected: [{ id, code }]
```

Phase 1 只定义返回语义，不定义 URL、HTTP method、auth、device registration、retry schedule 或 D1 schema。

## Deterministic State Machine

`RuntimeState` 包含：

- `runtimeSessionID`
- current `application`
- `userActivity`
- `sessionState`
- `powerState`
- `openSegment`
- `lastObservedAtMs`
- `nextSegmentOrdinal`

Eligibility：

```text
application != nil
AND userActivity == active
AND sessionState == active
AND powerState == awake
```

Transition rules：

1. 负时间戳返回 `negativeTimestamp`；早于上一事实返回 `nonMonotonicTimestamp`，状态不变。
2. application identity 变化时在事实时间关闭旧段，并在 eligible 时同刻打开新段。
3. idle、inactive/locked、asleep 在事实时间关闭开放段。
4. active/awake 恢复只从恢复事实时间开段，不回填 gap。
5. snapshot 总是 checkpoint：关闭开放段、应用完整状态、eligible 时同刻重开。
6. 0 毫秒段不输出、不消耗 ordinal。
7. segment ID 固定为 `runtimeSessionID + ":" + ordinal`。
8. Core 不读 wall clock、不执行 I/O、不访问平台 API。

## Platform Agent Boundaries

### macOS future adapter

- `NSWorkspace.didActivateApplicationNotification` / `frontmostApplication`
- native idle fact
- workspace/session notifications
- `willSleep` / `didWake`
- periodic full snapshot
- per-user LaunchAgent

### Windows future adapter

- foreground WinEvent + `GetForegroundWindow`
- `GetLastInputInfo`
- WTS session notifications
- power notifications
- periodic full snapshot
- per-interactive-user process; Session 0 service 不直接计时

Phase 1 两个平台 executable 都只链接 Core 后退出。Phase 2 的 Windows executable 组合 WinEvent、idle/session/power adapter、SQLite ledger/outbox、HTTP uploader 与诊断日志；macOS executable 仍保持 Phase 1 空壳。

D-079 后 Windows 安装组合为同一 per-user MSI 中的 WPF Setup 与无控制台 Agent。Setup 固定生产 Runtime endpoint，只接受 `XXXX-XXXX-XXXX` 配对码；成功后用 CurrentUser DPAPI 保存 credential、注册 HKCU Run 并启动 Agent。Agent 以 current-user named mutex 保证单实例，未绑定时立即退出且不打开 ledger；绑定后数据库文件名与 `bound_device_id` metadata 同时绑定 device，防止重新配对后旧 outbox 跨设备上传。401/403 heartbeat 会删除失效 credential、关闭当前 segment 并停止采集。

Setup 使用显式展示状态，不把字符串文案当作连接状态：

```text
Unpaired -> Connecting -> AwaitingFirstSync -> Online
                |                 |              |
                +-------------> ConnectionIssue <-+
                                  |
                                  +-> RequiresPairing
```

- `Connecting` 只覆盖 enrollment、DPAPI credential 保存、HKCU Run 注册与 Agent 启动；完成后进入 `AwaitingFirstSync`。
- Agent 将最近一次 heartbeat 结果原子写入当前用户 LocalAppData 的 `runtime-agent-health.json`。健康快照只含 device key 的本地哈希、状态、Agent 版本和更新时间，不含 device token、Child、用户名、SID、路径或应用信息。
- 健康快照是展示用 best-effort read model；写入失败不得中断 Agent 采集、SQLite ledger、outbox 或上传。
- Setup 只在健康快照与当前 credential 的 device key 一致且状态为 `online` 时显示在线；陈旧或不匹配的快照不得提升状态。
- heartbeat 网络失败写入 `offline`，401/403 在删除 credential 前写入 `requiresPairing`；Setup 以友好文案展示，不回显底层异常。
- Setup 使用 current-user named mutex 保证单实例。已配对、等待同步或在线时隐藏配对输入和连接按钮，显示设备名称、Agent 版本、最近确认时间与“完成并关闭”。
- Setup 关闭不停止 Agent；它不是托盘控制器，也不提供采集开关、吊销或 Child 切换。吊销与重新配对仍由家长控制台发起。
- 只有 `Online` presentation 使用“完成并关闭”。`AwaitingFirstSync` 和 `ConnectionIssue` 保持“关闭”与“重新检查”，避免把本地 credential 或进程存在误报为成功。

Windows 1.0.1 延续固定 `UpgradeCode` 与严格 `perUser` scope，构建脚本同时写入 MSI ProductVersion 与 Agent/Setup 的 Assembly、File、Informational Version。WiX 官方注明 `Files` 自动收集与 per-user package 会固定触发 ICE38/ICE64；Microsoft 也明确 ICE91 对“永远仅作 per-user 安装”的 package 是无害警告。因此项目仅定向抑制 ICE38、ICE64、ICE91，其他 MSI ICE 仍完整执行，不允许关闭整体验证。新 MSI 的卸载清理同时排除 `UPGRADINGPRODUCTCODE` 与 `REINSTALL`，防止 major upgrade 或原地 repair 误执行卸载清理；由于 1.0.0 已发布的卸载 custom action 仍会在首次 major upgrade 中移除 HKCU Run，1.0.1 安装/repair 阶段调用无界面的 `--install-repair`，仅在 DPAPI credential 可读取时重新注册新版 Agent 并启动它。repair 不修改 credential、SQLite、outbox 或 deviceId。

家长页面的 module token 仅保存在页面内存。手动刷新先清空它并重新签发；Runtime GET 遇到 401 或首次 fetch 网络失败时最多重试一次。POST 写操作仅在明确 401 时换 token 后重试，网络结果不确定时不得自动重放。页面把 fetch 异常映射为可操作的中文网络提示，不暴露浏览器原始错误。

## Windows Phase 2 Modules

- `TimeOnChrome.AppRuntime.Core`：共享模型、纯状态机与接口。
- `TimeOnChrome.AppRuntime.Windows`：Win32/SystemEvents adapter、opaque application identity、HKCU startup abstraction。
- `TimeOnChrome.AppRuntime.Infrastructure`：SQLite schema/store/outbox、DPAPI credential store、HTTP enrollment/upload client、JSON wire mapping。
- `TimeOnChrome.AppRuntime.Infrastructure` 同时提供不含凭据的原子本地 Agent health snapshot store，供 Agent 写入、Setup 只读展示。
- `TimeOnChrome.AppRuntime.Agent`：配置、生命周期、fact loop、upload loop 与结构化本地日志组合根。
- `TimeOnChrome.AppRuntime.Setup`：WPF 五态配对 UI、current-user 单实例和基于本地 health snapshot 的状态展示。
- Tests：Core 黄金向量、Windows adapter 映射、SQLite transaction/recovery、HTTP ACK、Agent health store 与 Setup presentation。

所有平台调用必须在 Windows module 内；Core 不读 wall clock、不执行 I/O。测试通过 probe/clock/startup abstractions，不修改真实 registry、session 或电源状态。

## Local SQLite Design

数据库位于当前用户 LocalAppData，使用 WAL、foreign keys 与 busy timeout。首版表：

```text
runtime_segments(
  id PK, runtime_session_id, platform, runtime_identity, display_name,
  start_at_ms, end_at_ms, duration_ms, end_reason, content_hash, created_at_ms
)
runtime_outbox(
  segment_id PK/FK, attempt_count, next_attempt_at_ms,
  last_error_code, created_at_ms
)
runtime_metadata(key PK, value)
```

`persistAndEnqueue` 使用 `BEGIN IMMEDIATE` transaction；segment `INSERT OR IGNORE` 后必须核对相同 ID 的 canonical content hash。只有相同内容才能视为幂等成功。outbox 引用在同一 transaction 插入。SQLite 中闭合 segment 不提供 update/delete 业务接口。

## Shared Backend Identity And D1

### D-079 identity bridge

Guardian `POST /profiles/:childId/app-runtime/token` 在 account token 验证和 Child ownership 验证后，签发 5 分钟 ES256 JWT：`iss=guardian-api`、`aud=app-runtime-management`、`sub/account_id`、`child_id`、`child_name`、`iat/exp/jti`。Runtime Worker 只导入独立 P-256 公钥验证签名、issuer、audience、时间和必需 claims；它不读取 Guardian D1。

Runtime D1 的授权键为 `(account_id, child_id)`。旧 `subject_id` 仅满足 `0001` schema 兼容，写入时可镜像 `child_id`，不得返回 UI、进入新 API 或单独作为授权依据。`runtime_children_v1` 保存 Child projection；Guardian `runtime_child_lifecycle_outbox_v1` 通过 `APP_RUNTIME_SERVICE` service binding 投递签名删除事件。

配对码使用用户可读 `XXXX-XXXX-XXXX` 格式，数据库只存 SHA-256，10 分钟后失效且只消费一次。重新配对记录 `replace_device_id`；消费后轮换原设备 token，不把它创建为另一个 Child 的新设备。

设备在线口径：`last_seen_at_ms` 距当前不超过 10 分钟为 online，超过 10 分钟且不超过 24 小时为 recentlyOnline，其余 offline；`revoked_at_ms` 优先显示 revoked。heartbeat 只保存 agent version、Windows version、architecture 和 last seen。

`runtime_app_hourly_stats_v1` 使用 UTC 小时边界保存物化事实，查询层按 `Asia/Shanghai` 请求范围返回 hourly/daily buckets。每个新 segment 的 insert 与跨小时切片 aggregate upsert 位于同一 D1 batch；已存在相同 content hash 的 segment 只 ACK，不再次聚合。

Runtime 身份域完全独立于 Santa：

```text
runtime_enrollment_codes(code_hash PK, subject_id, expires_at_ms, consumed_at_ms, created_at_ms)
runtime_devices(id PK, subject_id, platform, token_hash UNIQUE, display_name,
                created_at_ms, last_seen_at_ms, revoked_at_ms)
runtime_usage_segments(id, device_id, runtime_session_id, platform,
                       runtime_identity, display_name, start_at_ms, end_at_ms,
                       duration_ms, end_reason, content_hash, uploaded_at_ms,
                       PRIMARY KEY(device_id, id))
```

- enrollment code 与 device token 使用 Web Crypto 产生；D1 只存 SHA-256。
- 管理员 secret 先 SHA-256，再使用 constant-time comparison。
- enrollment code 在 D1 batch 中以条件 update 消费并创建 device；重复消费必须失败。
- device bearer token hash 定位 device，revoked device 不通过认证。
- `subjectId` 是 Runtime 后台自身的不透明归属键；本轮不读取 Guardian/Santa 表。

## Upload Validation And ACK

每个 request 最大 100 segments，并设置明确 JSON body 大小上限。校验：

- schema/version/platform/device 一致；
- ID、session ID、runtime identity 和 display name 长度；
- 非负时间、`end > start`、duration 精确相等；
- end reason 枚举；
- canonical content hash。

非法 item 返回稳定 rejection code；合法 item 与已存在记录比较。相同 ID/相同 hash 为 accepted，相同 ID/不同 hash 为 `ID_CONFLICT`。所有新纪录使用 prepared statements 组成一次 D1 batch；数据库失败时不返回 accepted。

## Agent Upload And Recovery

- uploader 每次读取到期 outbox，单批最多 50；每轮请求只尝试一次。
- `acceptedIds` 才从 outbox 删除；明确永久 rejection 记录错误并停止紧密重试，未知/临时错误指数退避。
- HTTP timeout、非 2xx、无效响应或 ACK 缺失保留 outbox。
- Agent restart 后直接读取 SQLite pending；开放段只通过 60 秒 checkpoint 限制最大未闭合损失，不伪造崩溃后的使用区间。
- credential 缺失时采集与本地 ledger 可继续，上传暂停；enrollment 是显式 CLI 操作。

## Worker Configuration And Testing

- 新 Worker 使用 `wrangler.jsonc`、当前 compatibility date、`nodejs_compat`、D1 binding 与 observability。
- `ADMIN_API_KEY` 只通过 secret 注入；仓库只提供 `.dev.vars.example` 占位说明。
- 使用 `wrangler types` 生成 binding/runtime types，不手写 Env。
- Workers runtime 测试使用官方 Vitest integration 与隔离本地 D1；不访问远端资源。
- 只允许 `wrangler deploy --dry-run`，禁止 deploy、远端 migration、secret 写入或 D1 create。

## Language Modules

### Swift

- `MacOSAppRuntimeCore`
- `MacOSAppRuntimeAgent`
- `MacOSAppRuntimeCoreTests`

### .NET 8

- `TimeOnChrome.AppRuntime.Core`
- `TimeOnChrome.AppRuntime.Agent`
- `TimeOnChrome.AppRuntime.Core.Tests`

两个 Core 暴露语义对等的 `RuntimeEventSource`、`SegmentStore` 与 `UploadOutbox`。未来 `SegmentStore.persistAndEnqueue` 必须代表一个 SQLite transaction；Phase 1 不提供实现。

## Golden Vectors

`runtime-state-machine-v1.vectors.json` 是跨语言预期结果唯一来源。每个 case 包含：

- `name`
- `runtimeSessionID`
- input `facts`
- `expectedSegments`
- optional `expectedError`
- final state summary

至少包含：application switch、idle/resume、session lock/unlock、sleep/wake、periodic snapshot、zero-duration、out-of-order 和 deterministic replay。Swift/C# 可保留少量语言级单元测试，但不得复制另一套 golden expected segments。

## Contract-Only Backend

`backend/src/contracts.ts` 只镜像 JSON Schema 的公共类型与 Upload Acceptance。`package.json` 只提供 `typecheck`，`tsconfig.json` 使用 `noEmit`。禁止创建：

- Worker `fetch` handler
- wrangler config
- route or endpoint
- D1 binding/migration
- auth/token implementation
- network client/server

## Validation

Windows：

```powershell
dotnet test app-runtime-management/agents/windows/TimeOnChrome.AppRuntime.sln
npm --prefix app-runtime-management/backend run typecheck
```

macOS 13+：

```bash
swift test --package-path app-runtime-management/agents/macos
```

当前 Windows 环境不得把结构检查写成 macOS compile PASS。

## Phase 1 Safety Assertions

- 无真实事件采集、SQLite、network、device registration 或 upload。
- 无 LaunchAgent、Scheduled Task、Startup App、Windows Service 或 `SMAppService` 注册。
- 无真实家庭数据、凭据、token、URL、标题、键盘内容或屏幕数据。
- 不修改 Santa、Chrome Extension、Guardian Worker、Pages、生产 D1 或配置。
