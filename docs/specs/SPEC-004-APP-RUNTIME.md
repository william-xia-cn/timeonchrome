# SPEC-004 Cross-Platform App Runtime Management V1

## Metadata

- Spec ID: SPEC-004
- Date: 2026-09-01
- Owner: Product Owner
- Status: Approved for Windows 2.0 system-managed multi-user implementation and Accounting Phase A
- Related task: Windows App Runtime 可用闭环
- Related decisions: D-064, D-075, D-076, D-077, D-078, D-079, D-080, D-081
- Related specs: `SPEC-003-MACOS-NATIVE-APP-CONTROL.md`

## Goal

建立一个统一的 App Runtime Management 产品能力，由 macOS 与 Windows 两个原生 Runtime Agent 实现，并在未来共同连接同一个 Runtime 后台。两个 Agent 采用相同事实模型、状态机语义、不可变 Usage Segment 和逐项 ACK 上传契约。

Phase 1 只交付跨平台规格、共享契约、黄金测试向量、macOS/Windows Core 纯状态机、平台 Agent 空壳和后台契约类型；不运行生产采集、不写 SQLite、不调用生产 API。

Phase 2 已交付 Windows 与共用 Runtime 后台技术底座。D-079 阶段把它修正为家长可以直接安装、配对、管理和查看统计的 Windows 产品闭环；macOS 真实采集仍留在后续阶段。

## D-081 Accounting Phase A

Phase A 以 TimeOnChrome 当前网页主账本原则为基线，但不修改 Chrome Extension 的代码或已有网页落账语义。跨平台 Runtime 新规则为：

- `UsageSegment` 是唯一权威主账本；每个用户会话最多一个 foreground `ACTIVE` lane，可有多个强证据 `PIP_ACTIVE` lane。
- foreground 与 PiP 应用明细允许重叠，单应用和设备主使用总时长按主 Segment 区间并集结算。
- `MediaSegment` 是独立辅助记录，固定 `authoritativeForUsage=false`，支持前/后台音频、视频与 PiP，允许多应用重叠并直接累加，不进入主使用时长、设备总时长或 quota。
- idle 阈值为 180 秒。只有明确 `Playing`、进程与当前 foreground 一致、窗口可见且未最小化的系统媒体会话可跨 idle 维持 `ACTIVE`；音频输出、应用类别和窗口尺寸只是弱证据。
- 应用切换、idle/resume、锁屏/解锁、会话断开、睡眠/唤醒、PiP 开关和强证据失效均在事件时间切段。
- checkpoint 每 60 秒执行：确认成功结算完整区间并重开；open lane 无法确认、缺失 lane 但现状确认有效、或 Service 恢复残留 lane 时最多结算/补写 30 秒，并标记 `estimated`。
- 媒体检查失败在 `lastConfirmedAt + min(gap/2, 30s)` 估算关闭，失败后不自动重开。
- 事实先进入 500ms 重排窗口，内部按 monotonic 时间与固定安全优先级处理；窗口外迟到事实只产生 0ms 诊断 Segment，不改写历史。
- duration 以 monotonic clock 为准，wall clock 仅用于日历/小时/展示。clock adjustment 立即切段并创建新 `clockEpochId`。

Phase A 仅统一落账和统计定义；policy/quota 快照只允许可空预留，不启用扣减、限制、阻止或正式家长 UI。

## D-080 Windows 2.0 Goal

D-080 取代 D-079 的 per-user 安装与 Child-scoped device 身份，将 Windows Runtime 改为机器级管理底座：

- 管理员只安装和配对一次；per-machine MSI 安装 LocalSystem RuntimeService 和全用户 Session Agent 二进制。
- Service 保存 DPAPI LocalMachine credential、机器密钥、策略、SQLite ledger/outbox 和 tamper 状态；Session Agent 不持有凭据或可写账本。
- 每个交互式 Windows 会话运行独立 Agent 产生前台、idle、session、power 和 snapshot 事实；Service 只组合事实与持久化，不在 Session 0 推断前台应用。
- 机器配对时设置默认 Child，所有已有和新增交互式用户默认继承；家长可改绑 Child 或设为 `unprotected`。
- 用户云端身份由机器密钥对 SID 执行 HMAC 的 opaque ID 与获批准的账户显示名组成；不上传 SID、路径、邮箱或凭据。
- 策略使用 desired/applied version；首次无策略时 fail closed 不采集，之后离线使用 last-known-good。assignment 变更在本地实际应用时切段。
- 普通用户不能修改 Program Files、ProgramData、Service 和 machine credential；Agent 被结束时 Service 关闭开放段、重启 Agent 并上报 tamper，不回填未观察间隙。
- 正常卸载需要管理员提升和 10 分钟单次卸载码；不承诺抵抗本机管理员。
- 本阶段不实现应用阻止、时间限额、网页过滤或媒体识别；macOS 系统级安装留待后续。

### D-080 Acceptance

1. 标准用户无法删除或修改安装目录、Service、machine credential 和账本；结束本会话 Agent 后可自动恢复并产生 tamper 健康事实。
2. 两个交互式用户分别登录时各只有一个 Session Agent，Segment 按 opaque local user ID 隔离，设备总时长不因并行维度重复累加。
3. 家长端可设置默认 Child、逐用户覆盖和 `unprotected`，并看到 `pending/cached/applied/failed/offline` 状态。
4. Segment 上传包含 local user ID 和 assignment version；Worker 根据已认证机器和 assignment history 决定 Child，不信任终端 Child ID。
5. 1.x 历史可继续查询；2.0 升级前要求 outbox 为空、retire 旧 token，保留旧 SQLite 为 legacy 证据并重配机器一次。
6. Runtime `0003` 和 Guardian `024` 是 additive migration，不要求空库且不重写已有 HornburgXW 数据。

## D-079 Windows Productization Goal

- 家长端保留独立 `/app-runtime/` 页面，并自动使用现有 Guardian session 与当前 Child。
- Guardian 签发 5 分钟、`aud=app-runtime-management` 的 ES256 module token；Runtime 使用独立密钥对，不复用 Santa。
- 页面为当前 Child 生成 10 分钟一次性配对码；Windows Setup 首次启动只输入配对码。
- 每个 Windows 用户单独绑定一个 Runtime device；未绑定时不采集，吊销后停止采集和上传。
- Windows Setup 必须以明确状态机展示 `未配对`、`正在连接`、`等待首次同步`、`在线` 与 `连接异常/需要重新配对`；仅保存 credential 或启动进程不得单独显示为“在线”。
- 配对成功后 Setup 保留可确认的完成状态，锁定配对码输入与重复连接操作，并提供明确的“完成并关闭”；重新打开时必须核对当前 credential 对应的 Agent 本地健康状态，不得仅因 credential 文件存在就显示“已连接”。
- Setup 每个当前用户只允许一个实例；成功状态至少显示本机设备名称、Agent 版本和最近一次已确认 heartbeat 时间，不显示 device token、Child ID、用户名、SID、路径或窗口标题。
- 家长可查看待安装/在线/最近在线/离线/已吊销设备，执行吊销和重新配对。
- 家长可按北京时间日/周与设备筛选查看总时长、小时/每日图表、应用排行和最近同步。
- 安装器从独立 Runtime R2 以不可变版本路径分发；未签名内部 MSI 标记 `BLOCKED_BY_AUTHENTICODE_SIGNING`。
- 家长页面手动刷新必须丢弃内存中的旧 module token 并重新签发；只读 GET 遇到 401 或首次网络失败最多自动重试一次，任何写操作不得因网络错误自动重放。用户不得看到浏览器原始 `Failed to fetch` 文案。
- Windows 1.0.1 采用保留 `UpgradeCode` 的 per-user MajorUpgrade。升级必须保留 DPAPI credential、按 device 隔离的 SQLite/outbox 和云端设备身份；旧 1.0.0 卸载阶段移除的 HKCU 登录启动项由 1.0.1 安装后 repair 恢复，不得触发重新配对。

家长流程不得暴露 `ADMIN_API_KEY`、opaque `subjectId`、Child ID、device token、Runtime URL 或 CLI。D-077 的管理员密钥发码模型仅保留为历史实现，产品接口完成验证后删除。

### Windows Setup Acceptance

1. 未配对时只允许输入配对码并连接；连接中禁用输入和重复提交。
2. enrollment、DPAPI 保存、HKCU Run 注册和 Agent 启动完成后进入“等待首次同步”，而不是直接宣称在线。
3. Agent 首次 heartbeat 成功后写入不含凭据的本地健康快照，Setup 据此进入“在线”并显示最近确认时间。
4. 网络暂不可用时显示可恢复的连接异常；401/403 或 credential 被删除时显示“需要重新配对”。
5. 已配对状态不得继续显示可编辑配对输入；用户通过“完成并关闭”退出 Setup，Agent 独立继续运行。
6. 同一 Windows 用户重复启动 Setup 时只保留一个实例，不得出现多个可操作配对窗口。
7. 只有 `Online` 状态使用“完成并关闭”；等待首次同步和连接异常只能关闭或重新检查，不得以完成文案暗示已验证成功。
8. 从 1.0.0 原地升级到 1.0.1 后，原 credential、SQLite/outbox、设备身份与登录启动保持可用，Agent 报告版本为 1.0.1。

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
