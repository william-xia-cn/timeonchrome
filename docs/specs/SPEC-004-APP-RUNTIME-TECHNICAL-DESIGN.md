# SPEC-004 Cross-Platform App Runtime Management Technical Design

## Status

Approved for Cross-Platform Phase 1 skeleton。本文定义一个 Runtime 产品、两个原生 Agent 和一个未来共享 Runtime 后台；Phase 1 不实现生产事件源、SQLite 或网络。

## Repository Layout

```text
app-runtime-management/
├── contracts/
│   ├── runtime-contract-v1.schema.json
│   └── runtime-state-machine-v1.vectors.json
├── agents/
│   ├── macos/                  Swift Package
│   └── windows/                .NET 8 solution
└── backend/
    ├── package.json
    ├── tsconfig.json
    └── src/contracts.ts        contract types only
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

Phase 1 两个平台 executable 都只链接 Core 后退出，不注册上述 API、timer 或 startup mechanism。

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
