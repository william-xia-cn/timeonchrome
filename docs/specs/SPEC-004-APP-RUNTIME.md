# SPEC-004 Cross-Platform App Runtime Management V1

## Metadata

- Spec ID: SPEC-004
- Date: 2026-09-01
- Owner: Product Owner
- Status: Approved for Cross-Platform Phase 1
- Related task: App Runtime Management Phase 1
- Related decisions: D-064, D-075, D-076
- Related specs: `SPEC-003-MACOS-NATIVE-APP-CONTROL.md`

## Goal

建立一个统一的 App Runtime Management 产品能力，由 macOS 与 Windows 两个原生 Runtime Agent 实现，并在未来共同连接同一个 Runtime 后台。两个 Agent 采用相同事实模型、状态机语义、不可变 Usage Segment 和逐项 ACK 上传契约。

Phase 1 只交付跨平台规格、共享契约、黄金测试向量、macOS/Windows Core 纯状态机、平台 Agent 空壳和后台契约类型；不运行生产采集、不写 SQLite、不调用生产 API。

## Product Model

- 产品：一个 `App Runtime Management`。
- 平台实现：`macOS Runtime Agent` 与 `Windows Runtime Agent`。
- 共享后台：未来两个 Runtime Agent 使用同一个 Runtime Worker/API 和数据域。
- 平台进程：每个活动交互式用户会话运行一个独立 Agent，不使用单个系统进程替所有用户推断前台使用。
- 一致性：两个平台必须对同一抽象事实序列产生相同的 segment 边界、顺序、ID 和错误。

## Santa Boundary

现有 `native-app-control/` 与 `timeonchrome-native-app-api` 继续负责 Santa 应用发现、家长审核、策略编译和阻止。Santa 后台不作为 Runtime 共用后台，本轮也不移动、改名或修改。

共享 Runtime 产品不等于共享 Santa 凭据或协议：

- Runtime Agent 不读取或复用 Santa enrollment、MachineID、policy database、event queue 或 sync URL。
- Santa 与 Runtime 使用不同终端身份、路由、表、凭据和上传协议。
- Santa observation 不作为精确前台使用时间；Runtime Usage Segment 不作为 Santa 执行或阻止证据。
- 未来家长产品可在同一 App Management 界面聚合两类能力，但其后台事实域继续隔离。

## Platform Deployment Model

### macOS

- 最低平台 macOS 13，Swift 原生实现。
- 未来每个活动 GUI user session 运行一个 LaunchAgent。
- Phase 1 不注册 `SMAppService`，不安装 LaunchAgent plist。

### Windows

- 最低实现基线 Windows 10/11，C# / .NET 8。
- 未来每个 interactive user session 运行一个用户态 Agent；不得依赖 Session 0 service 直接判断各用户前台应用。
- Phase 1 不注册 Scheduled Task、Startup App、Windows Service 或登录启动项。

## Runtime Facts

跨平台事实统一为：

- `applicationActivated`
- `userActivityChanged(active | idle)`
- `sessionChanged(active | inactive | locked)`
- `powerChanged(awake | asleep)`
- `snapshot`

未来平台适配器：

- macOS：`NSWorkspace` application activation、idle/session、sleep/wake 和周期快照。
- Windows：foreground WinEvent、`GetLastInputInfo`、WTS session notification、power notification 和周期快照。

Phase 1 不实现上述平台适配器。Runtime Fact 不包含窗口标题、文档名、键盘内容、鼠标坐标、屏幕画面、URL、浏览历史或真实家庭数据。

## Shared Runtime Behavior

1. 只有 application 存在、用户 active、session active 且系统 awake 时才能打开 segment。
2. 应用切换、idle、session inactive/locked、sleep 和周期快照形成确定性边界。
3. 恢复 active/awake 只从新事实时间开始，不回填未观察区间。
4. 时间戳必须单调非递减；乱序事实被拒绝且不得修改状态。
5. 0 毫秒边界不得形成 segment，也不得消耗 segment ordinal。
6. segment ID 使用 `runtimeSessionID + ordinal` 的确定性组合。
7. 相同共享黄金向量在 Swift 与 C# 中必须得到完全相同结果。

## Shared Data And Interfaces

Phase 1 统一定义：

- `RuntimePlatform`: `macos | windows`
- `ApplicationIdentity`: `platform`、`runtimeIdentity`、可选 `displayName`
- `RuntimeFact`
- `RuntimeSnapshot`
- `RuntimeState`
- `UsageSegment`
- `RuntimeEventSource`
- `SegmentStore`
- `UploadOutbox`
- `UploadAcceptance`: `acceptedIds` 与结构化 `rejected`

平台专属 Bundle ID、Team ID、AUMID、Package Family、Authenticode publisher 或 executable metadata 留在平台 Agent 内部；在后续应用身份规格批准前不进入共享 Phase 1 上传契约。

未来 SQLite 和上传必须满足：

- segment 以确定性 ID 幂等插入，闭合后不可原地修改；
- segment 与 outbox 引用在同一 transaction 落账；
- 后台按 segment ID 幂等接受并逐项 ACK；
- 只清除明确 accepted 的 outbox 项；
- timeout、网络失败或缺失 ACK 保留待上传项。

## Phase 1 Scope

- 将现有 macOS Swift Package 移入统一 `app-runtime-management/agents/macos/`。
- 新建 Windows .NET 8 Core、Agent 和 xUnit test skeleton。
- 新建共享 JSON Schema 与跨平台黄金测试向量。
- Swift 与 C# 对共享向量执行相同状态机验证。
- 新建 backend TypeScript 契约类型并执行静态 typecheck。
- 修正 SPEC-004、D-076、`docs/DESIGN.md` 和 `TASK_BOARD.md`。

## Out Of Scope

- 真实 macOS/Windows 事件监听与用户数据采集；
- SQLite 实现、数据库文件或 migration；
- Runtime Worker、HTTP route、D1、认证、设备注册和网络上传；
- Windows Service、Scheduled Task、LaunchAgent 或 `SMAppService` 注册；
- 应用阻止、审核、配额、家长 UI 或 Santa 联动；
- 修改 `native-app-control/`、`extension/`、`workers/`、`pages/` 或生产配置；
- 部署、生产数据、凭据或真实家庭数据。

## Acceptance Criteria

1. 仓库只存在一个 Runtime 产品根目录 `app-runtime-management/`，包含 `agents/macos`、`agents/windows`、`contracts` 和 contract-only `backend`。
2. macOS Swift Core 行为不因目录迁移发生语义变化，并增加 `platform` 共享字段。
3. Windows .NET 8 提供与 Swift 对等的模型、纯状态机、接口、无副作用 Agent 和测试。
4. JSON Schema 是跨语言 wire contract，黄金向量至少覆盖应用切换、idle/resume、session lock/unlock、sleep/wake、snapshot、零时长、乱序和确定性重放。
5. Swift/C# 测试加载同一黄金向量；不得维护两套独立预期结果。
6. backend 仅包含 TypeScript 契约类型，不存在 Worker handler、wrangler config、route、D1 或网络代码。
7. Windows 环境运行 `dotnet test` 和 backend `tsc --noEmit`；macOS `swift test` 只在 macOS 13+ 环境执行。
8. `native-app-control/`、`extension/`、`workers/`、`pages/` 无文件变更。

## Required Evidence

- `git diff --check`
- shared contract/schema structure check
- Windows `dotnet test`
- backend TypeScript typecheck
- protected-directory diff check
- Plan Conformance Audit
- macOS `swift test` 明确标记为当前 Windows 环境未执行

## Rollback Risk

Phase 1 只调整未进入生产的 Runtime 骨架、共享契约和文档。现有 Santa、Chrome、Guardian、Pages 和生产数据不受影响；可按新增提交整体回退，无数据 migration。
