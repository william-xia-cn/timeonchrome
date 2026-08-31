# SPEC-004 Cross-Platform App Runtime Management V1

## Metadata

- Spec ID: SPEC-004
- Date: 2026-09-01
- Owner: Product Owner
- Status: Approved for Windows productization closure
- Related task: Windows App Runtime 可用闭环
- Related decisions: D-064, D-075, D-076, D-077, D-078, D-079
- Related specs: `SPEC-003-MACOS-NATIVE-APP-CONTROL.md`

## Goal

建立一个统一的 App Runtime Management 产品能力，由 macOS 与 Windows 两个原生 Runtime Agent 实现，并在未来共同连接同一个 Runtime 后台。两个 Agent 采用相同事实模型、状态机语义、不可变 Usage Segment 和逐项 ACK 上传契约。

Phase 1 只交付跨平台规格、共享契约、黄金测试向量、macOS/Windows Core 纯状态机、平台 Agent 空壳和后台契约类型；不运行生产采集、不写 SQLite、不调用生产 API。

Phase 2 已交付 Windows 与共用 Runtime 后台技术底座。D-079 阶段把它修正为家长可以直接安装、配对、管理和查看统计的 Windows 产品闭环；macOS 真实采集仍留在后续阶段。

## D-079 Windows Productization Goal

- 家长端保留独立 `/app-runtime/` 页面，并自动使用现有 Guardian session 与当前 Child。
- Guardian 签发 5 分钟、`aud=app-runtime-management` 的 ES256 module token；Runtime 使用独立密钥对，不复用 Santa。
- 页面为当前 Child 生成 10 分钟一次性配对码；Windows Setup 首次启动只输入配对码。
- 每个 Windows 用户单独绑定一个 Runtime device；未绑定时不采集，吊销后停止采集和上传。
- 家长可查看待安装/在线/最近在线/离线/已吊销设备，执行吊销和重新配对。
- 家长可按北京时间日/周与设备筛选查看总时长、小时/每日图表、应用排行和最近同步。
- 安装器从独立 Runtime R2 以不可变版本路径分发；未签名内部 MSI 标记 `BLOCKED_BY_AUTHENTICODE_SIGNING`。

家长流程不得暴露 `ADMIN_API_KEY`、opaque `subjectId`、Child ID、device token、Runtime URL 或 CLI。D-077 的管理员密钥发码模型仅保留为历史实现，产品接口完成验证后删除。

## Windows-First Phase 2 Goal

交付一个可在 Windows 10/11 交互式用户会话中运行的 Runtime Agent，以及一个独立的共享 Runtime Worker/D1 实现：

- Windows Agent 采集前台应用、用户 idle/active、session lock/unlock、sleep/wake 与周期快照；
- Core 生成不可变 Usage Segment，SQLite 在同一 transaction 写入 segment 与 outbox；
- Agent 崩溃或网络失败后保留未确认 outbox，并只按后台逐项 `acceptedIds` 清理；
- Runtime Worker 负责独立 enrollment、device token 认证、segment 校验、幂等写入与逐项 ACK；
- 本轮只做本地开发和测试，不部署、不创建远端资源、不接触真实家庭数据。

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

以上列表是 Phase 1 的历史边界。Phase 2 明确解除其中 Windows 真实事件监听、Windows 本地 SQLite、Runtime Worker/D1 schema、独立设备注册与网络上传的限制，但仍保留下列非目标：

- macOS 真实事件适配器、LaunchAgent、SQLite 与上传客户端；
- Guardian Account/Child token bridge、Pages 家长 UI 或现有 Chrome Extension 集成；
- Santa enrollment、MachineID、策略数据库、事件队列、同步协议、表或凭据复用；
- 应用阻止、审核、配额或跨设备统计物化；
- 生产部署、远端 D1 创建/迁移、生产 secret、真实设备 enrollment 或真实家庭数据；
- Windows Session 0 service 直接计时、窗口标题、文档名、URL、键鼠内容或屏幕采集。

## Phase 2 Enrollment And Authentication

> 历史说明：本节描述 D-077 技术底座，已由 D-079 的 Guardian Child-scoped 配对模型取代。

1. Runtime 后台使用独立管理员 secret 保护 enrollment-code 创建接口；secret 只通过 Worker secret binding 注入，不进入源码或配置。
2. 管理员创建一次性、短时有效的 enrollment code，并绑定不透明 `subjectId`；本轮不实现 Guardian/Pages 的发码 UI。
3. Windows Agent 使用 code 注册后获得随机 `deviceId` 与高熵 `deviceToken`；后台只保存 token SHA-256。
4. 本机 credential 使用 Windows 当前用户 DPAPI 保护，配置与 Santa/Chrome Device 完全隔离。
5. 后续请求使用独立 Runtime bearer token；撤销、过期或平台不匹配时拒绝。

## Phase 2 API Surface

- `GET /v1/health`：无认证本地/运维健康检查。
- `POST /v1/admin/enrollment-codes`：管理员创建一次性 code。
- `POST /v1/devices/enroll`：消费 code，创建 Runtime device 并返回一次性明文 token。
- `GET /v1/devices/self`：验证 credential 并返回当前 device metadata。
- `POST /v1/segments:upload`：最多 100 个已闭合 segment，返回 `acceptedIds` 与结构化 `rejected`。

批次先完成结构校验和同 ID 冲突检查，再以 D1 batch 写入全部可接受项。已存在且内容完全一致的 ID 视为 accepted；同 ID 内容不同返回 `ID_CONFLICT`。客户端对超时、5xx、缺失 ACK 或未知 rejection 保留 outbox。

## Phase 2 Windows Runtime Behavior

- foreground WinEvent 只触发重新读取当前前台 process；上传身份为本地派生的稳定 opaque key，不上传 executable path。
- `GetLastInputInfo` 按配置阈值生成 active/idle 边界。
- WTS-backed session notification 与 power notification 生成 lock/unlock、sleep/wake 事实。
- 周期快照默认 60 秒，修正漏失事件并限制进程异常终止造成的开放段损失窗口。
- Agent 是当前用户进程，可按显式 CLI 命令注册/移除 HKCU 登录启动项；不安装 Windows Service。
- 乱序或非法事实写诊断日志并被拒绝，不修改账本状态。

## Phase 2 Acceptance Criteria

1. Windows Agent 在真实 Windows 会话中可生成 foreground、idle、session、power 和 snapshot facts，并通过同一纯状态机形成 segment。
2. SQLite schema、segment+outbox 原子 transaction、幂等插入、失败保留、逐项 ACK 清理与重启恢复均有自动化测试。
3. credential 配置使用当前用户 DPAPI；日志不得输出 enrollment code、device token 或 executable path。
4. Worker 使用生成的 binding types、D1 prepared statements/batch、Web Crypto、安全长度限制和结构化错误；无硬编码 secret。
5. Worker 本地测试覆盖 enrollment code 单次消费、token 认证、撤销/过期、合法上传、重复上传、ID 冲突、逐项 rejection 与 100 条上限。
6. Windows 端到端测试通过本地 HTTP fake 或 Worker test harness 验证 enrollment、upload、ACK 和 outbox 清理。
7. 提供 HKCU 登录启动注册/移除命令，但测试不得修改真实用户注册表。
8. 不修改 `native-app-control/`、`extension/`、`workers/`、`pages/`，不运行远端 migration 或 deploy。

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

## D-079 Public Interfaces

Guardian：

- `POST /profiles/:childId/app-runtime/token`

Runtime module token：

- `POST /v1/module/pairing-codes`
- `GET /v1/module/devices`
- `POST /v1/module/devices/:id/revoke`
- `POST /v1/module/devices/:id/replace-pairing`
- `GET /v1/module/usage?fromMs=&toMs=&deviceId=`
- `POST /v1/identity/child-lifecycle`

Runtime Agent：

- `POST /v1/devices/enroll`
- `GET /v1/devices/self`
- `POST /v1/devices/heartbeat`
- `POST /v1/segments:upload`

Runtime release：

- `GET /v1/releases/windows/x64/latest`
- `GET /v1/releases/windows/x64/:version/installer`

## D-079 Privacy And Safety

- 云端只接收 opaque application hash 与展示名称；不接收 executable path、证书明文、用户名、SID、窗口标题、URL、键鼠或屏幕内容。
- Guardian 只保存 Runtime ES256 私钥；Runtime Worker 只保存公钥。Santa 密钥、协议、MachineID 和数据表完全隔离。
- Child 删除必须经 Guardian lifecycle outbox 顺序删除 Runtime 配对码、设备、小时统计和 raw segment。
- 新 segment 只有首次插入时更新小时聚合；重复 segment 不重复累计，raw immutable segment 是事实源。
- 当前实现和部署不得创建真实家庭数据；首次真实配对必须由 Product Owner 单独批准。

## Rollback Risk

Phase 1 只调整未进入生产的 Runtime 骨架、共享契约和文档。现有 Santa、Chrome、Guardian、Pages 和生产数据不受影响；可按新增提交整体回退，无数据 migration。
