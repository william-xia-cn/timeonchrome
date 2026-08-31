# SPEC-004 macOS App Runtime Agent V1

## Metadata

- Spec ID: SPEC-004
- Date: 2026-09-01
- Owner: Product Owner
- Status: Approved for Phase 1
- Related task: macOS App Runtime Agent Phase 1
- Related decisions: D-064, D-075
- Related specs: `SPEC-003-MACOS-NATIVE-APP-CONTROL.md`

## Goal

建立一个位于 `macos-app-management/` 的独立 macOS Runtime Agent 子项目，为未来的前台应用事件、用户活跃状态和不可变应用使用时间账本提供原生 Swift 基础。

第一阶段只交付权威规格、技术设计、纯模型、纯状态机、接口契约和可编译 Agent 空壳；不运行生产采集，不写 SQLite，不调用生产 API。

## Problem

现有 `native-app-control/` 基于 Santa，负责应用发现、家长审核和执行阻止。Santa 执行事件不等于精确的前台使用时长，也不负责用户 idle、会话、sleep/wake 或周期快照。因此，使用时间必须由一个职责、进程、身份、存储和同步协议均独立的 Runtime Agent 产生，不能把 Santa 改造成计时代理，也不能复用 Santa enrollment、MachineID、策略数据库或同步协议。

## Product Boundary

- `native-app-control/`：继续独立负责 Santa 应用发现、审核、策略编译与阻止。
- `macos-app-management/`：只负责未来的 macOS 前台应用运行事实、用户活跃判断和不可变使用时间账本。
- 两者是仓库内并列子项目；Runtime Agent 不是 Santa 的重命名、子模块或总平台。
- Runtime Agent 不导入、移动、改名或修改 `native-app-control/` 业务代码。
- Runtime Agent 不读取 Santa enrollment、Santa MachineID、Santa policy database、Santa event queue、Santa sync state 或 Native Worker 协议。
- 即使未来两个模块都与同一 Account / Child 关联，也必须使用各自的终端身份、持久化和同步边界；关联设计不属于 Phase 1。

## Runtime Deployment Model

- 最低平台为 macOS 13。
- 采用原生 Swift 实现。
- 未来每个活动 GUI 用户会话运行一个 LaunchAgent；不采用单个系统级 daemon 代表所有用户计时。
- Fast User Switching 下，每个活动用户会话拥有独立的运行状态、账本和 outbox，不合并内存状态或本地数据库。
- Phase 1 不注册 `SMAppService`，不安装 LaunchAgent plist，不启动常驻采集。

## Runtime Facts

未来 Runtime Agent 的输入事实限定为：

- `NSWorkspace` 前台应用激活事件；
- 用户 active / idle 事实；
- GUI session active / inactive / locked 事实；
- system sleep / wake 事实；
- 周期性完整快照，用于边界切片和事件遗漏后的状态校正。

Runtime Fact 只包含计时所需的最小元数据。Phase 1 不采集窗口标题、文档名、键盘内容、鼠标坐标、屏幕画面、URL、浏览历史或真实家庭数据。

## User Behavior

Phase 1 没有用户可见 UI、设置、通知或后台行为。Agent executable 启动后不注册事件源、不采集、不持久化、不上传。

未来行为必须满足：

1. 只有当前用户会话 active、系统 awake、用户 active 且存在前台应用时，才能打开应用使用片段。
2. 应用切换、用户 idle、session inactive/locked、system sleep 和周期快照形成确定性片段边界。
3. wake、session active、用户恢复 active 或应用重新激活只从新事实时间开始，不回填未观察区间。
4. 同一输入事实序列必须产生完全相同的片段边界、顺序与幂等 ID。
5. 0 毫秒片段不得写入不可变账本。

## Data And State

Phase 1 定义以下 Core 模型：

- `ApplicationIdentity`：Runtime Agent 独立解析的应用身份；不引用 Santa application identity 主键。
- `RuntimeFact`：带毫秒时间戳的外部事实。
- `RuntimeState`：当前应用、用户活跃、会话、电源和开放片段状态。
- `UsageSegment`：已闭合、不可变、具确定性 ID 的应用使用片段。
- `RuntimeEventSource`：未来事件源接口。
- `SegmentStore`：未来不可变 segment 持久化接口。
- `UploadOutbox`：未来待上传 segment 引用及逐项确认接口。

未来 SQLite 和上传模型必须满足：

- segment 以确定性 `id` 为主键，只允许幂等插入，不允许原地修改已闭合事实；
- outbox 与 segment 在同一 SQLite transaction 中落账；
- 上传端按 segment ID 幂等接受，并返回逐项 ACK；
- 只有明确 ACK 的 segment 才能从 outbox 移除；
- 网络失败、超时或缺失 ACK 必须保留待上传项。

Phase 1 只定义接口和语义，不创建 SQLite 文件、schema migration、HTTP client 或生产 API 路由。

## Scope

本规格包括：

- SPEC-004 产品规格与技术设计；
- D-075 持久架构决策；
- `macos-app-management/` Swift Package；
- Core 模型、纯状态机和确定性片段边界；
- Agent executable 空壳；
- Core 单元测试。

## Out Of Scope

- 生产 API、Worker、D1、Pages 或 Chrome 扩展接入；
- SQLite 实现、数据库文件、migration 和真实 outbox worker；
- 网络上传、鉴权、重试调度或真实家庭数据；
- `SMAppService` 注册、LaunchAgent 安装、签名、公证、打包或部署；
- 真实 `NSWorkspace`、idle、session、sleep/wake 监听实现；
- 应用配额、阻止、审核、策略或 Santa 联动；
- 修改 `native-app-control/`、`extension/`、`workers/`、`pages/` 或生产配置。

## Authority Docs

实现必须遵守：

- `AGENTS.md`
- `PROJECT_MASTER.md`
- `TASK_BOARD.md`
- `DECISIONS.md`
- `docs/DESIGN.md`
- `docs/specs/SPEC-003-MACOS-NATIVE-APP-CONTROL.md`
- `docs/specs/SPEC-003-MACOS-NATIVE-APP-CONTROL-TECHNICAL-DESIGN.md`
- `docs/specs/SPEC-004-MACOS-APP-RUNTIME-TECHNICAL-DESIGN.md`

## Acceptance Criteria

1. `macos-app-management/` 与 `native-app-control/` 并列存在，且没有导入或修改后者业务代码。
2. Swift Package 声明 macOS 13，并包含 `MacOSAppRuntimeCore`、`MacOSAppRuntimeAgent` 和 `MacOSAppRuntimeCoreTests`。
3. Core 提供本规格要求的八个模型/接口，并只实现纯模型、纯状态机和确定性边界。
4. Agent 入口可编译但不注册事件、不持久化、不联网。
5. 应用切换、idle/resume、session、sleep/wake、周期快照、零时长和乱序事实具有单元测试设计。
6. `native-app-control/`、`extension/`、`workers/`、`pages/` 均无文件变更。
7. macOS 环境执行 `swift test`；非 macOS 环境只能报告结构/静态检查，必须明确标记 macOS 编译未执行。

## Required Tests

- Unit: `swift test` 覆盖纯状态机与确定性 segment ID/边界。
- Integration: Phase 1 不要求。
- E2E: Phase 1 不要求。
- Manual: 检查 Agent 入口没有事件注册、SQLite 或网络调用。
- Boundary: `git diff` 确认受保护目录未变更。

## Release Risk

- Phase 1 不构成生产 Runtime Agent，也不能证明 macOS 事件源、idle 判断、LaunchAgent 生命周期或上传可靠性。
- Windows 上无法验证 Swift macOS target；必须在 macOS 13+ 补跑 `swift test`。
- idle 阈值、session API 选择、数据库位置、身份绑定和生产上传协议仍需后续单独规格与批准。

## Rollback Risk

Phase 1 只新增独立文档与子目录，不触及既有运行路径。回滚时可整体回退两个提交，不需要迁移或生产数据处理。

## Handoff Requirements

Build&Test 必须报告：

- changed files
- behavior changes
- tests run and results
- known risks
- Plan Conformance Audit
- out-of-scope confirmation
