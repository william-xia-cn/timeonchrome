# SPEC-004 Cross-Platform App Runtime Management Technical Design

## Status

Approved for Windows 2.0 system-managed multi-user implementation、Accounting Phase A 与 App Management Console Phase B。本文定义一个 Runtime 产品、两个原生 Agent 和一个共享 Runtime 后台；Windows 使用机器级 Service + per-session Agent，Accounting Phase A 使用共享 schema v2 统一 Windows/macOS 落账语义。

## Accounting Schema V2

`RuntimeFact` v2 携带 `wallTimeMs`、`monotonicTimeMs`、`clockEpochId`、窗口可见/最小化状态、媒体证据强度、播放状态、PiP 状态与 clock adjustment。平台 adapter 只产生事实，不决定结算。

`UsageSegment` v2 增加 `channel=ACTIVE|PIP_ACTIVE`、`activityBasis`、`clockEpochId`、monotonic 起止/时长、`estimated`元数据、证据时间、`diagnostic`和可空 policy snapshot。Segment ID 是稳定字段的确定性 SHA-256，不包含 display name、诊断文案、媒体辅助字段或可变 policy label。`MediaSegment` 使用独立表/outbox/ACK，并固定 `authoritativeForUsage=false`。

Runtime state 由一个 foreground lane、按应用键索引的多个 PiP lanes 和多个辅助 media lanes 组成。安全优先级为 clock/session/power/idle 关闭事件优先于应用/PiP/media 开启，最后才是 checkpoint/snapshot。重排窗口为 500ms；窗口外事实只产生 0ms immutable diagnostic。

Windows Service 必须把 open lanes、已完成 Segment 和各自 outbox 在同一 SQLite transaction 内持久化；transaction 失败时不得推进内存状态。启动时依赖 SQLite WAL/transaction recovery 幂等恢复已提交状态，再将残留 open lane 按 30 秒上限恢复为 estimated Segment。

Runtime Worker 的 `/v2/segments:upload` 同时接受旧 schema 和 accounting v2；`/v2/media-segments:upload` 独立逐项 ACK。`GET /v2/module/accounting` 是只读 read model，foreground/PiP 在相同 machine、local user、runtime session 与 `clockEpochId` 内取并集，再跨分组求和，避免时钟回拨或并发用户被错误折叠；同时返回按应用 ACTIVE/PiP、estimated/diagnostic 摘要和辅助媒体直接求和。D1 `0004` 是 additive migration，不改写旧 Segment。

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

### D-080 Windows 2.0 process model

```text
Account-scoped Guardian token -> Runtime module API -> machine/default Child/user assignments
                                                        |
LocalSystem RuntimeService <--- versioned policy -------+
  | machine credential / HMAC key / SQLite ledger / outbox / upload / watchdog
  +-- Windows session A -> credential-free Session Agent -> facts -> protected named pipe
  +-- Windows session B -> credential-free Session Agent -> facts -> protected named pipe
```

- Service 从连接进程 token 解析 session ID 与 SID，使用 machine HMAC key 派生 `localUserId`；不信任 Agent 上报的用户身份。
- Named Pipe 只允许 SYSTEM 与目标交互式用户连接；Service 验证 client PID/session 后才接收事实。
- Service 为每个 session 保持独立状态机；Agent 断开、注销、锁屏或 policy assignment 实际变更时立即切段。
- 机器策略每 60 秒通过 ETag 检查，失败从 1 分钟退避到 15 分钟；heartbeat 每 5 分钟上报 desired/applied version、Service 健康和 tamper 摘要。
- 首次未获得有效 policy 时不启动采集；已有 last-known-good 时可离线继续。`unprotected` 应用时关闭开放段并停止该用户采集。
- Service 持久化路径为 `%ProgramData%\TimeOnChrome\AppRuntime`，安装器使用 protected DACL 阻断父目录继承，仅 SYSTEM/Administrators 可读写；Session Agent 和普通用户不直接读取 SQLite、machine credential 或 HMAC key，只能通过按会话验证的 Named Pipe 提交事实。

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

### Windows Release Distribution

R2 的版本目录是不可变发布源：`windows/x64/<version>/manifest.json` 同时声明 Burn 与 MSI 的路径、SHA-256、大小、签名状态和 release status。Runtime Worker 的版本化 `/installer` 路由按 major version 分流：1.x 继续兼容历史 MSI 键；2.x 读取版本 manifest，只接受精确位于该版本目录且命名为 `TimeOnChrome-AppRuntime-Setup-win-x64-<version>.exe` 的 Burn 路径，并以不可变缓存流式返回。任何 2.x manifest 缺失、JSON 无效、版本/平台/架构不一致或路径不匹配都返回结构化 `RELEASE_NOT_FOUND`，不得回退到 MSI。

生产发布顺序固定为：构建并验证 Burn/MSI → 上传不可变产物 → 上传并回读版本 manifest → 部署并 smoke 验证 Worker 的 Burn 下载 → 最后原子更新短缓存 `windows/x64/latest.json`。`latest.json` 的 `installerPath`、`sha256` 与 `sizeBytes` 必须指向 Burn；内部未签名版本继续返回 `BLOCKED_BY_AUTHENTICODE_SIGNING`，不得因切换 latest 被表述为公开正式发布。

Burn 链内的 per-user migration 必须是真正可独立执行的单文件 self-contained EXE，不能依赖发布目录中的相邻 framework、managed DLL 或 native runtime 文件。构建门禁必须把最终 migration EXE 单独复制到隔离临时目录，运行不读取 credential、不访问网络、不修改 registry/MSI 的 package probe，并至少实际加载 SQLite 与 CurrentUser DPAPI 依赖；探针非零退出时不得生成、上传或切换该版本 Burn。2.0.1 因违反该门禁在首次真机执行时以 `0x8000809a` fail closed，由 2.0.2 前向修正，不覆盖已发布的不可变对象。

全机器其他用户冲突扫描不能在普通用户 migration 中直接枚举受保护的 `HKEY_USERS`。Burn 必须先用 elevated machine probe 检查真实交互式用户 profile 的 1.x credential 与已加载启动项；探针无法完整读取时 fail closed。通过后再由独立 per-user migration 在启动安装器的原用户上下文读取 CurrentUser DPAPI、确认 outbox、retire 和卸载 1.x。两个阶段不得交换身份或合并为管理员进程；所有权限异常必须映射为明确非零退出，不能成为未处理 .NET 异常。2.0.2 首次执行暴露该边界并以 `0xe0434352` 安全回滚，由 2.0.3 前向修正。

机器控制 Named Pipe 继续只允许 SYSTEM/Administrators 连接并由 Service 对连接 token 二次校验。Setup 客户端必须显式使用 `TokenImpersonationLevel.Impersonation`，使 `RunAsClient` 能读取真实调用者 token；不得把匿名/缺失 impersonation token 当作管理员。Control、supervisor、policy、upload、heartbeat 等常驻 loop 的非取消异常必须写入 Windows Application Event Log，并经有限退避自动重启；SCM 进程存活但 control loop 已退出不能视为健康。2.0.3 暴露该问题，由 2.0.4 前向修正。

Windows Setup 2.0.6 使用响应式 WPF 窗口：启动时根据当前显示器工作区限制初始与最大宽高，允许用户调整窗口大小；标题、状态、配对/卸载内容与隐私说明位于只启用垂直滚动的主内容区，底部“卸载这台电脑…”/“重新检查”和“关闭”操作栏始终固定可见。展开卸载面板后，Dispatcher 必须把“家长一次性卸载码”、输入框和“授权并卸载”按钮滚入可见区域。窗口布局计算必须是可独立测试的纯逻辑，并覆盖常规工作区及 150%/200% 缩放下的受限逻辑工作区；任何情况下都不得产生 `MinWidth/MinHeight` 大于工作区上限的不可调整窗口。该修正只改变布局与可达性，不生成卸载码、不自动授权、不绕过管理员提升，也不改变 Named Pipe 鉴权或卸载协议。

首次上报本机用户也是策略变更：如果任一 `localUserId` 尚无 assignment，Runtime Worker 必须只提升一次机器 `desiredPolicyVersion`，在同一新版本为这些用户创建默认 assignment，并使旧 ETag 失效；重复上报同一批用户不得继续提升版本。对于已受旧缺陷影响、assignment 已写入当前版本但机器 ACK 的空策略从未包含该用户的记录，Worker 也必须识别“用户 applied version 低于 assignment version 且机器已 applied 该版本”，再推进一次版本完成前向收敛。否则 Service 可能在用户发现前缓存空用户策略并永久收到 `304`，导致受保护会话不启动 Session Agent。Windows WTS 用户名和域名必须显式调用 `WTSQuerySessionInformationW` 并按 UTF-16 解析，禁止把 ANSI 字节当 UTF-16 上传。该首次策略收敛与显示名编码缺陷由 2.0.5 前向修正。

正式家长页的统计必须覆盖新旧账本且保持口径隔离：`/v2/module/usage` 继续提供 v1 与 accounting schema 1 的小时聚合历史，`/v2/module/accounting` 提供 accounting schema 2 的主账本区间并集、按小时 buckets、应用 ACTIVE/PiP 并集和辅助媒体摘要。两类来源不存在同一 Segment 的重复物化，页面可按小时、应用和总时长相加合并；辅助媒体摘要不得进入主总时长。若 accounting v2 已有数据而旧 hourly stats 为空，页面不得显示为零。

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
- `TimeOnChrome.AppRuntime.Setup`：WPF 五态配对 UI、current-user 单实例、基于本地 health snapshot 的状态展示，以及受工作区约束的响应式窗口/固定操作栏。

## App Management Console Phase B 技术设计

### App Policy 与兼容

Runtime D1 additive migration `0005` 增加孩子级不可变 App Policy 版本与应用分类历史，并为 accounting v2 Segment 增加可空 `app_policy_version`、`application_classification` 与 `quota_bucket`。旧 Segment 和旧客户端继续有效：缺少 App Policy 的上传按 `unclassified`、无限额读取，不写回或重算历史。

App Policy wire shape 在 D-085 后增量加入 `timeWindows`，不需要新增 D1 migration：

```json
{
  "version": 3,
  "classifications": [
    { "platform": "windows", "runtimeIdentity": "windows:…", "classification": "study", "displayName": "Code" }
  ],
  "quotas": {
    "dailyCategoryMinutes": { "study": null, "composite": null, "restrictedEntertainment": 120, "unclassified": 60 },
    "weeklyRestrictedEntertainmentMinutes": 600,
    "perApplicationDailyMinutes": [
      { "platform": "windows", "runtimeIdentity": "windows:…", "minutes": 90 }
    ]
  },
  "timeWindows": {
    "monday": {
      "study": [{ "start": "00:00", "end": "24:00" }],
      "composite": [{ "start": "00:00", "end": "24:00" }],
      "restrictedEntertainment": [{ "start": "00:00", "end": "24:00" }],
      "unclassified": [{ "start": "00:00", "end": "24:00" }]
    }
  }
}
```

Display name 是非权威展示元数据，不进入策略身份键。`timeWindows` 固定覆盖周一至周日和四个非黑名单类别；窗口使用 `HH:mm`，`24:00` 只允许作为 end，同日同类不可重叠。缺失字段按每天全部开放解释；旧客户端 PUT 缺失该字段时，服务端保留当前策略的时间段而不是重置。`GET /v2/module/app-policy?childId=` 返回 ETag；`PUT` 必须携带 `If-Match`，服务端校验账户/孩子归属、枚举、范围和重复身份，并在 D1 事务中生成下一不可变版本，版本冲突返回 412。页面对不确定网络失败不得自动重放 PUT。

### API 与 read model

- `GET/PUT /v2/module/app-policy?childId=`：读取或原子替换当前孩子完整 App Policy。
- `GET /v2/module/app-classification-records`：服务端以当前时间固定最近 30 天窗口，只聚合历史为未归类或缺少 App Policy 的 Segment，返回 `windowStartMs/windowEndMs`、平台去重的待处理记录与已处理历史。
- `GET /v2/module/app-usage`：返回设备主时长并集、分类/应用并集、配额使用/剩余/超额状态、按 Segment 所携带策略版本解析的时段外使用摘要和辅助媒体摘要。
- `GET /v2/module/usage-segments` 与 `GET /v2/module/media-segments`：提供 Runtime 系统管理的游标分页明细；不返回 Child ID、token、SID、路径或窗口标题。

`GET /v2/machines/policy` 在现有 assignment 之外增量返回本机受保护用户所需的 App Policy 版本。孩子策略变更只提升关联机器的 desired version；Service 原子缓存后，在实际应用时间关闭受影响用户的 foreground/PiP lane，并以新 `AccountingPolicySnapshot` 同刻重开。上传携带 `appPolicyVersion`，Worker 根据服务端策略历史解析分类和 quota bucket，不信任客户端自报分类。

### Runtime Console

`app-runtime-management/console/` 是 canonical source，静态复制到 `pages/app-runtime/`。页面在独立文档内切换 `usage/access/apps/devices/system` 五个视图，复用主控制台的绿色视觉语言、Logo、孩子选择器、桌面侧栏、移动导航和账户区，但不抽取或修改主控制台业务代码。

应用管理使用固定左侧分类目录、名称搜索、平台筛选和无二级页签列表；访问管理固定使用时间配额、时间段管理、配置文件三页签；设备管理使用列表加右侧详情抽屉；系统管理只提供主账本、辅助媒体和健康。配置文件 schema v2 由访问管理导出/导入，v1 导入补成全开放时间段，必须先本地校验和展示差异，再以带 ETag 的完整策略 PUT 应用。
- Tests：Core 黄金向量、Windows adapter 映射、SQLite transaction/recovery、HTTP ACK、Agent health store、Setup presentation 与窗口布局纯逻辑。

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

## Windows 1.x → 2.x Upgrade Context

Burn 必须先以启动安装器的原交互式用户上下文运行 1.x migration，再为 per-machine MSI 请求提升。Migration package 显式设置 `PerMachine="no"`，以便读取该用户的 HKCU Runtime 启动项和 CurrentUser DPAPI credential；不得在替代管理员账户上下文中读取或迁移这些数据。Migration 通过 outbox 门禁、retire 旧设备并移除精确 HKCU 启动项后，才允许 MSI 提升并安装 LocalSystem Service。因为该前置包使 Burn 注册为 per-user，链内 per-machine MSI 必须标记为 Burn `Permanent`，由自身固定 UpgradeCode/MajorUpgrade 管理生命周期；Bundle 和 MSI 均不向“程序和功能”暴露绕过云端卸载码的删除入口，授权后的 Setup 直接提升调用 MSI 卸载。

2.x 数据目录使用受保护 DACL，仅向 SYSTEM 与本机 Administrators 授予完全控制，不向普通 Users 授予读取或写入权限。Session Agent 只能通过经服务端校验进程 session token/SID 的 Named Pipe 提交事实，不能直接读取机器 credential、SQLite ledger 或策略缓存。

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
