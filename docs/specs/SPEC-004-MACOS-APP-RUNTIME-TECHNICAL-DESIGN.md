# SPEC-004 macOS App Runtime Agent V1 Technical Design

## Status

Approved for Phase 1 skeleton。本文定义未来 Runtime Agent 的边界与接口；Phase 1 不实现生产事件源、SQLite 或上传。

## Repository Boundary

```text
TimeOnChrome/
├── native-app-control/       Santa：发现、审核、阻止
└── macos-app-management/     Runtime Agent：前台事实、活跃判断、不可变使用账本
```

两个子项目没有源码依赖、数据库依赖、进程依赖或同步协议依赖。Runtime Agent 不读取 Santa enrollment、MachineID、策略数据库、应用审核记录或 Santa event upload。Santa 不读取 Runtime Agent 的状态、segment 或 outbox。

## Process Model

- Target: macOS 13+，Swift Package。
- Future runtime: 每个活动 GUI user session 一个 LaunchAgent，运行于该用户上下文。
- 不使用一个 root/system daemon 汇总所有用户前台活动。
- Fast User Switching 时，各用户实例独立产生 `runtimeSessionID`、状态、SQLite ledger 和 outbox。
- Phase 1 的 executable 是无副作用空壳；不调用 `SMAppService`，不注册通知，不建立 timer。

## Component Model

```text
future macOS adapters
  ├─ NSWorkspace application activation
  ├─ idle/session/sleep facts
  └─ periodic full snapshot
             │
             ▼
      RuntimeEventSource
             │ RuntimeFact
             ▼
     RuntimeStateMachine       pure / deterministic
             │ [UsageSegment]
             ├───────────────► SegmentStore      future SQLite
             └───────────────► UploadOutbox      future SQLite outbox
                                      │
                                      └─────────► future idempotent uploader
```

Phase 1 只实现图中的模型、协议与 `RuntimeStateMachine`。所有 adapter、SQLite actor/repository 和 uploader 均留作后续阶段。

## Application Identity

`ApplicationIdentity` 是 Runtime Agent 自己的不可变值对象：

- `runtimeIdentity`：由未来 Runtime adapter 生成的稳定、非空本地身份键；
- `bundleIdentifier`：若系统可得则记录；
- `teamIdentifier` / `signingIdentifier`：若未来独立解析可得则记录；
- `displayName`：可选显示提示，不参与 segment ID。

该对象不得存储或引用 Native D1 `application_identities_v1` 主键，也不得通过 Santa observation 反查。即使字段表面相似，两个子系统仍各自解析和持久化。

## Runtime Facts

`RuntimeFact` 使用显式 Unix 毫秒时间戳，避免纯状态机读取 wall clock。事实类型：

- `applicationActivated(ApplicationIdentity?)`
- `userActivityChanged(active | idle)`
- `sessionChanged(active | inactive | locked)`
- `powerChanged(awake | asleep)`
- `snapshot(RuntimeSnapshot)`

未来 adapter 的建议事实来源：

- `NSWorkspace.didActivateApplicationNotification` 与 `frontmostApplication` 快照；
- 用户 idle 由 macOS 原生 idle 事实定期采样；阈值必须由后续产品决策确认；
- workspace/session 通知与当前 session 快照；
- `NSWorkspace.willSleepNotification` / `didWakeNotification`；
- 周期快照一次性读取前台应用、用户活跃、session 和 power 状态。

Phase 1 不实现这些 adapter，也不固定采样或 idle 间隔。

## Runtime State

`RuntimeState` 包含：

- `runtimeSessionID`
- 当前 `application`
- `userActivity`
- `sessionState`
- `powerState`
- `openSegment`
- `lastObservedAtMs`
- `nextSegmentOrdinal`

只有以下 eligibility 同时成立时才能存在开放 segment：

```text
application != nil
AND userActivity == active
AND sessionState == active
AND powerState == awake
```

未知初始状态不计时。恢复到 eligible 只从恢复事实的时间戳新开 segment，不估算或回填中间区间。

## Deterministic Transition Rules

状态机按单调非递减时间处理事实：

1. 时间戳小于 `lastObservedAtMs` 时拒绝事实，并保持状态不变。
2. `applicationActivated` 改变应用时，在事实时间关闭旧 segment；若新状态 eligible，同一时间打开新 segment。
3. `userActivityChanged(idle)`、`sessionChanged(inactive|locked)`、`powerChanged(asleep)` 在事实时间关闭 segment。
4. 恢复 active/awake 不回填，只在恢复时间打开 segment。
5. 每个 `snapshot` 都形成 checkpoint：若有开放 segment，在快照时间关闭；应用完整快照；若仍 eligible，在同一时间重开。
6. 相同时间产生的零毫秒边界不输出 segment。
7. segment 顺序由 `nextSegmentOrdinal` 决定；ID 为 `runtimeSessionID + ordinal` 的确定性组合，不使用随机 UUID 或进程随机 hash。
8. 状态机不执行 I/O、不读取时间、不访问全局单例。

## Usage Segment

`UsageSegment` 是闭合后不可变的值对象：

- `id`
- `runtimeSessionID`
- `application`
- `startAtMs`
- `endAtMs`
- `durationMilliseconds`
- `endReason`

`endReason` 至少覆盖 application switch、user idle、session unavailable、system sleep、periodic snapshot 和 state correction。Phase 1 不映射现有 Chrome `usage_segments_v1` schema，也不把应用 segment 写入 Guardian D1。

## Future SQLite Contract

未来实现必须使用单用户会话作用域的独立 SQLite 数据库。建议逻辑表：

```sql
runtime_usage_segments_v1(
  id TEXT PRIMARY KEY,
  runtime_session_id TEXT NOT NULL,
  application_identity_json TEXT NOT NULL,
  start_at_ms INTEGER NOT NULL,
  end_at_ms INTEGER NOT NULL,
  duration_ms INTEGER NOT NULL,
  end_reason TEXT NOT NULL,
  created_at_ms INTEGER NOT NULL
)

runtime_upload_outbox_v1(
  segment_id TEXT PRIMARY KEY,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  next_attempt_at_ms INTEGER,
  last_error_code TEXT,
  FOREIGN KEY(segment_id) REFERENCES runtime_usage_segments_v1(id)
)
```

这只是后续接口约束，不是 Phase 1 migration。持久化 transaction 必须同时 `INSERT OR IGNORE` segment 和 outbox 引用；不得 update 已闭合 segment 内容。outbox 不复制可变 payload，只引用不可变 segment。

## Future Upload Contract

- 请求以 segment `id` 作为幂等键；重发相同 ID 必须得到同一业务结果。
- 服务端必须返回逐项 `acceptedIds` 与结构化 `rejected`。
- 客户端只删除明确 accepted 的 outbox 项。
- timeout、网络失败、缺失 ACK 或不确定响应保留 outbox。
- 上传不得修改 segment 的身份、边界或时长。
- 未来的终端注册、Account/Child 关联和 API 归属必须独立设计；不得复用 Santa enrollment secret、MachineID 或 sync URL。

Phase 1 的 `SegmentStore` / `UploadOutbox` 只定义以上能力所需的最小 async protocol，不提供实现。

## Package Layout

```text
macos-app-management/
├── Package.swift
├── Sources/
│   ├── MacOSAppRuntimeCore/
│   │   ├── ApplicationIdentity.swift
│   │   ├── RuntimeFact.swift
│   │   ├── RuntimeState.swift
│   │   ├── UsageSegment.swift
│   │   ├── RuntimeStateMachine.swift
│   │   ├── RuntimeEventSource.swift
│   │   ├── SegmentStore.swift
│   │   └── UploadOutbox.swift
│   └── MacOSAppRuntimeAgent/
│       └── main.swift
└── Tests/
    └── MacOSAppRuntimeCoreTests/
        └── RuntimeStateMachineTests.swift
```

## Phase 1 Safety Assertions

- Agent target 不导入 `AppKit`、`ServiceManagement`、SQLite library 或 networking library。
- 不存在 `URLSession`、socket、HTTP endpoint、token、credential 或生产 base URL。
- 不创建数据库文件或 LaunchAgent plist。
- 不修改 `native-app-control/`、`extension/`、`workers/`、`pages/`。
- 测试只向纯状态机注入合成事实，不采集真实用户或家庭数据。

## Validation

macOS 13+：

```bash
cd macos-app-management
swift test
```

Windows：只执行目录/manifest/源码静态检查、受保护目录 diff 检查和 `git diff --check`。Windows 结果不得写为 Swift 编译或 macOS runtime PASS。
