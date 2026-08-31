# SPEC-004 Cross-Platform App Runtime Management Technical Design

## Status

Approved for Windows-first Phase 2 implementation。本文定义一个 Runtime 产品、两个原生 Agent 和一个共享 Runtime 后台；Phase 2 先完成 Windows Agent 与后台端到端实现，macOS 真实采集留待后续。

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

## Windows Phase 2 Modules

- `TimeOnChrome.AppRuntime.Core`：共享模型、纯状态机与接口。
- `TimeOnChrome.AppRuntime.Windows`：Win32/SystemEvents adapter、opaque application identity、HKCU startup abstraction。
- `TimeOnChrome.AppRuntime.Infrastructure`：SQLite schema/store/outbox、DPAPI credential store、HTTP enrollment/upload client、JSON wire mapping。
- `TimeOnChrome.AppRuntime.Agent`：配置、生命周期、fact loop、upload loop 与结构化本地日志组合根。
- Tests：Core 黄金向量、Windows adapter 映射、SQLite transaction/recovery、HTTP ACK 与 Agent orchestration。

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
