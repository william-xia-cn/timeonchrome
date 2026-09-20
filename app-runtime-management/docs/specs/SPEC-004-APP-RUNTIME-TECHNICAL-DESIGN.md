# SPEC-004 Cross-Platform App Runtime Management Technical Design

## ARM-D-025 云端默认分类解析

Worker 在 `resolveApplication` 的显式产品、已批准自动规则和冲突处理之后应用系统默认：精确 `systemTool` 为 `composite`，confirmed `game | gameLauncher | gameUtility` 为 `restrictedEntertainment`。结果使用稳定内建 reason ID，写入下一 App Policy 版本的 `resolvedApplications`；设备现有 `classifications` 仍优先于 resolved projection。

`app-catalog` 使用同一解析函数，返回 `classificationStatus=automatic` 和“系统默认分类”理由，不再返回“建议归为受限娱乐”。完整 inventory 同步即使家庭知识版本为 0 也会重新冻结策略并提升机器 desired policy version；服务端上传校验继续按 Segment 携带的历史 policy version 读取对应不可变 payload，避免延迟上传被新规则追溯改类。

## ARM-D-024 产品规则 schema v3

Contracts 1.9.0 为 `AppType` 增加 `gameUtility`，为目录理由增加 `CONFIRMED_GAME_UTILITY_TYPE`。Worker 的游戏组投影接受 confirmed `game | gameLauncher | gameUtility`；默认受限娱乐建议仍保持 `appType === game`。产品规则仅使用精确 `distributionKey`、`productKey` 或 package family，名称/发布者不具有确认权。

EA app 的两个当前产品键作为同一 `AppProduct` 的两个 selector；Game Bar、Solitaire 与 XBOX 使用 Microsoft Store distribution key；完美世界竞技平台使用当前产品键。反馈中心、命令面板、天气和录音机加入精确系统 package family 集合。Console 只修改标签和文案，内部 DOM/CSS 与 `systemTool` wire value不重命名。

## ARM-D-017 产品目录纠错增量

MSIX/package family 在目录中建模为 `packageContainer` 技术容器，不默认成为可管理产品；每个具有可信 AUMID 的可启动入口独立进入产品目录。Win32 套件仅在具有可靠安装产品锚点时维持产品/变体聚合。Worker 查询时使用现有证据动态投影，不迁移或改写历史观察。

包容器已有明确分类不得自动复制给入口；返回 `LEGACY_CONTAINER_CLASSIFICATION` 提示重新确认。入口使用 `LAUNCHABLE_PACKAGE_APP`，容器使用 `PACKAGE_CONTAINER`。无变体安装产品仍从产品观察贡献机器与账户覆盖数，时长继续只读 UsageSegment。

发行证据阶段采用 contracts 1.7.0：`sourceResults` 最多 16 项，新增 `distribution-ea`、`distribution-ubisoft`、`distribution-gog`。Windows 2.4.0 将三个发行器分别结算为 `complete / complete_with_warnings / failed`；发行器未安装时为 `complete + 0`。不上传路径、用户名、账户、完整 manifest、启动参数或证书正文。

## ARM-D-016 自动类型识别技术补充

Contracts 1.6.0 增加 `distributionKey`、`typeStatus` 与 `typeReasonCode`，Application Knowledge schema v2 并兼容 v1。Windows 2.3.0 用独立适配器从六类发行平台清单提取公开稳定 ID，禁止上传路径、用户名、完整清单或启动参数。Worker 以版本化知识解析类型，分类优先级为明确产品、精确规则、系列/开发者、类型规则、建议；类型规则匹配服务端已解析类型，不能信任 `declaredType`。现有 JSON 证据列承载新增字段，无 D1 migration。

## ARM-D-015 云端来源解析

`GET /v2/module/app-catalog` 在形成产品组之前，从每条 `AppEvidence` 的可信 `packageId` 解析来源。Worker 只接受 `verifiedFields` 包含 `packageId` 的值，AUMID 使用 `!` 前的 Package Family Name 与受控精确集合比较；首批规则为 Quick Assist、Windows Notepad 和 Windows Calculator。客户端提供的 `applicationOrigin` / `originEvidenceCode` 不进入最终决策。

产品组只在至少一个成员被云端规则确认时返回 `operatingSystem / exactPackageRule`，否则为 `unknown / null`。该计算发生在查询期，不更新 inventory JSON，不需要 D1 migration。技术组件仍先按 manageability 投影进入只读技术记录；来源分组不得提升组件为可管理应用。

## 产品目录扫描结算与单一变体展示修复

- inventory v2 的完成标记不仅验证批次总数，还必须按 `sourceResults` 结算缺失对象。仅 `complete` 和 `complete_with_warnings` 来源拥有缺失判断权；`failed` 来源不得改变既有安装状态。
- 对完成来源，本次扫描批次未包含的同机器、同本机用户、同平台产品/变体改为 `notObserved`。兼容投影同步降级，但不删除产品、变体、兼容观察或批次收据。
- 若同机器/用户已存在完成的权威 v2 扫描，缺少 `discovery.sourceKind` 的 legacy `installed` 观察不再作为当前安装证据；若仍有历史 Segment，则目录可继续以“使用过，当前未发现”或技术记录呈现。
- Catalog API 继续返回完整 `variants`。Console 对唯一、同名、`variantRole=main`、未拆分的变体视为产品内部主入口，不显示冗余展开区或“1 个变体”文案；多入口套件、异名入口、非 main 入口及已拆分管理对象不折叠。
- 该修复只收敛安装状态与目录展示，不改变 runtime identity、UsageSegment、历史时长、分类或配额。

## 2.2.3 inventory v4 管道兼容热修复

- Session Agent 的产品/变体盘点使用 `SessionApplicationInventoryMessage.schemaVersion = 4`；RuntimeService 管道入口必须同时接收 legacy v3 与产品级 v4，其他版本 fail closed。
- 协议版本判定使用共享的纯函数并由固定回归覆盖，避免发送端升级后接收端静默丢弃消息。
- 本修复不改变云端 payload、inventory outbox、D1 schema 或任何 accounting 语义。

## ARM-D-014 产品级目录实施清单（2.2.2）

同平台出现规范化名称相同、但没有共同 `productKey`、`packageId`、`hostedAppId`、`binaryHash` 等强关联依据的多个安装产品时，read model 不得因名称确认或合并产品，也不得输出多个可分类主行。它们与同名 hosted/candidate 入口仅聚合成一个 `AMBIGUOUS_INSTALLATION_PRODUCTS` 只读技术记录，等待产品知识或家长确认；原始产品、变体和来源证据继续保留。只有一个安装产品及其具有明确 `parentProductKey` 的套件变体不受该降级规则影响。

同平台、同规范化名称只有一个安装产品，但另有缺少 `parentProductKey` 或其他强关联依据的 Start Menu、运行身份或便携入口时，不得把孤立入口投影为第二个可管理应用，也不得仅按名称自动挂到产品。read model 保留唯一安装产品为主行，把未明确配置的孤立入口降为 `POSSIBLE_PRODUCT_VARIANT` 只读技术记录；获得可靠关联或家长确认后才能成为产品变体或独立产品。历史 Segment 仍按原始 runtime identity 保存。

1. contracts 1.3.0 增加 inventory v2：`products`、`variants`、`sourceResults`；变体携带 opaque parentProductKey、variantRole、scope 和 evidenceLevel，不上传路径、SID、用户名、完整命令行或证书正文。
2. Windows discovery 将 Uninstall Registry/MSIX 投影为安装产品，将 Start Menu/包入口/运行观察投影为变体；机器级产品跨本机用户去重，用户包保留用户范围。明确结构化维护/组件信号进入技术记录，名称只产生审核提示。
3. sourceResults 固定 `complete|complete_with_warnings|failed`。单项错误进入 warning；Service 仅对完成来源做缺失对账。inventory v1 保持原全局 fail-closed。
4. additive 0010 保存产品、变体和来源结果。`POST /v2/machines/application-inventory` 接受 v1/v2；`GET /v2/module/app-catalog` 保留兼容字段并返回产品 variants、technicalItems 与 inventoryCoverage。
5. 产品默认继承分类；显式 split override 优先于孩子产品配置、精确产品规则、系列/开发者规则。未拆分变体不单独占目录数量。
6. Console 产品行可展开变体并执行显式拆分；技术记录只读。来源健康分别显示成功、警告、失败，不泄露 raw identity。
7. 回归固定覆盖 LibreOffice 套件、Chrome/Firefox 多来源、PWA 宿主、维护组件、来源局部失败、旧 v1 客户端及历史账本不变。

## ARM-D-013 产品投影实现清单

- 后端为目录条目计算 `catalogKind`、`manageability` 和稳定原因码；判断只使用产品确认与结构化发现证据，不使用显示名黑名单。
- `GET /v2/module/app-catalog` 将可管理对象放入 `items`，将 review/hidden 对象放入 `technicalItems`；旧客户端忽略新增字段仍兼容。
- 已确认产品按产品 ID 聚合，返回全部可信 `runtimeImplementations`；组件、候选和无发现证据历史身份不得被关联算法提升为主应用。
- `GET /v2/module/app-classification-records` 的 pending/processed 只包含可管理对象；技术记录独立返回且不参与待处理数量。
- Console 五目录、配额应用选择和分类动作只消费 actionable 项；系统管理技术进程页签只读渲染 `technicalItems`，不把 raw identity 写入 DOM。
- 测试以通用证据角色覆盖安装器、短名、组件、候选和多实现产品，不把 `wixstdba` 等名称当作产品逻辑。
- 不修改数据库 schema、UsageSegment、历史账本、应用使用统计或配额语义。

## ARM-D-012 技术实施 checklist（2.2.1）

1. WindowsApplicationDiscovery：纯 manifest 解析，AppListEntry/名称质量/入口角色元数据；Shell AppList 名称解析；DisplayIcon 仅弱安装候选；同身份观察合并来源，不丢可靠证据。
2. AppEvidence.discovery 可选摘要：role、nameSource、sourceKinds；不加入任意路径或名称匹配权限。后台以已验证 packageId/binaryHash 做目录关联，保留 runtimeImplementations；不同可见入口不合并。
3. SessionPipeProtocol / MachineApplicationInventoryStore / Service：可选 scan 摘要包含 scanId、用户、batchIndex、batchCount、observationCount、failedSources 和 completed；扫描批次即使缓存未变也入独立 outbox。最终标记在 FIFO 中排于数据之后；ACK 绑定 batchId/count；失败扫描不做缺失对账。
4. Runtime additive 0009：独立 scan/batch 追踪，不修改旧表/原账。重传幂等、同扫描序号不同内容冲突、总数不符不得显示完整。catalog 返回用户盘点摘要；旧客户端未知。授权依据保持机器和 Account/Child ownership。
5. Console：五目录不增加二级页签，工具栏提供目录范围（主要应用、已安装未使用、使用未归类证据、完整发现）。组件只影响默认展示，不改变分类/计时；产品分类按钮不提交空技术身份。盘点完整性显式展示。
6. 夹具覆盖多入口包、友好名称、组件、同 binary 多来源、同名不同身份、安装未使用、便携运行、分批中断/重放；Windows 全量与 Worker/Console 聚焦测试、桌面/移动 mock 目视、types/schema/dry-run/diff 审计后构建 2.2.1 内部包。macOS 编译必须另在 macOS 执行。

共享契约增量 Minor 1.2.0，旧证据无 discovery 时不猜组件；历史不迁写。仅本地验证，不生产发布/安装，内部未签名标记不变。

## Windows 2.2.0 客户端发布准备

已合并的 ARM-D-011 应用发现与规则客户端使用内部版本 2.2.0，与现有安装 2.1.1 区分。统一 MSI/Burn 默认版本、build.ps1 发布版本与 Service fallback；Assembly/File/Informational Version 由既有发布脚本参数同步生成。machine-scope UpgradeCode、安装目录、配对、机器身份和账本保持不变。仅准备并验证本地包，不运行家庭盘点、不安装、不部署、不切 R2 latest；包仍为 BLOCKED_BY_AUTHENTICODE_SIGNING。

## ARM-D-011 应用目录与分类规则（代码接入与本地验证）

保留历史 runtimeIdentity，新增家庭产品知识/可信变种、孩子明确分类和通用规则三层。共享固定条件匹配器，规则按 product / family / developer / type 优先级，逐条 automatic 或 suggestion；auto 的 any 每个分支都必须有可信身份条件。弱名称、自声明类别、来源只能建议。开发者匹配验证后的 opaque signerKey，证书/开发者原文不随机器清单上传。

同层冲突或仅建议时保留原有效分类；关闭自动规则且不再有有效明确配置/自动命中时，从新策略实际应用起恢复未归类。产品关联不能只用开发者身份覆盖该开发者全部产品，至少需要精确身份或签名者与稳定产品名称组合。Service 独立库存队列/SQLite cache/outbox 与账本分离；网络失败从 60 秒指数退避到 15 分钟，不在事实消费路径执行库存 I/O。应用策略及共享匹配结果作为一个文件原子保存；尚未出现在服务端已批准投影里的本地候选不提前改变上传分类或配额键。

Runtime additive 0008 保存不可变知识版本、孩子绑定、安装观察和关联审计；ETag 防并发覆盖，导入预览不写入。机器清单增量按批次 hash 幂等 ACK；失败保留本地积压，扫描失败不得撤销安装状态。策略版本包含知识快照及旧身份分类投影，实际应用时切段；旧客户端不获得虚假能力声明。原始 Segment、配额键和历史分类不改写。

Windows 盘点注册信息/包/启动入口并补充运行观察；macOS 提供显式只读 bundle/签名发现，不安装系统级 Agent。不生产调用、不盘点上传真实家庭、不部署或升级当前安装。

完整且无失败来源的 Windows 扫描可以发送最多 1000 个身份的完成集合；Service 按已认证用户对此前 installed cache 生成 notObserved 增量。失败/超容量扫描无缺失判断权，运行观察不能降级安装证据，其他用户与便携 runtimeObserved 不受影响。清单接口当前最多返回 1000 项，超出返回结构化容量错误；不静默截断或宣称完整。包查询取消时结束自身查询进程；0/1/N 包输出均固定为 JSON 数组。

### ARM-D-011 接口收口

- `GET/PUT /v2/module/application-knowledge`：家庭隔离及 ETag 条件发布；不可变版本保留可撤销依据。
- `POST /v2/module/application-knowledge/import-preview`、`import-approve`：当前版本绑定的差异 hash、逐项选择；导入只更新选中产品/规则，不覆盖孩子明确分类；仅名称产品降为建议规则候选。
- `POST /v2/module/application-knowledge/operations`：固定 confirm/merge/split/undo 操作，保存审计类型和前后 hash；undo 读取家庭内旧知识版本后生成新版本，不回滚账本。
- 同一 operations 接口的 `preview=true` 为只读确认预览：校验 ownership 与 If-Match，返回改变的产品归属/分类命中（应用名称、平台、孩子位置及结果），不写版本、策略或审计。保存仍须原 ETag，竞争变化返回 412。解除错误关联使用 confirm 发布撤销后的可靠范围；删除最后范围前必须处理产品引用，不允许留下空产品或悬空规则。
- 导入修改既有规则时，若未选孩子仍批准同一规则 ID，拒绝发布并提示使用新规则 ID 或明确选择涉及孩子；不得通过覆盖家庭模板隐式改变其他孩子。
- `GET /v2/module/application-inventory`、`POST /v2/machines/application-inventory`：必要脱敏身份摘要，清单与批次 ACK 独立于账本。
- 应用目录合并预配置产品、安装观察与使用观察；产品跨版本只采用已确认 selectors，多个产品同时匹配返回冲突，不自行合并。

> 集成边界：Guardian 只依赖 `@timeonchrome/app-runtime-contracts`；Runtime Console 从独立 Pages 项目发布；功能 worktree 禁止直接部署生产。

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
- `GET /v2/module/app-catalog`：返回当前 App Policy 与最近 30 天真实主 Segment 的合并目录；按 `platform + runtimeIdentity` 去重，正式分类中的未使用策略项仍保留。
- `GET /v2/module/usage-segments` 与 `GET /v2/module/media-segments`：提供 Runtime 系统管理的游标分页明细；不返回 Child ID、token、SID、路径或窗口标题。
- `GET /v2/module/runtime-logs`：合并读取 `runtime_usage_diagnostic_segments_v2` 与 `runtime_terminal_logs_v1`，支持时间范围、机器、等级、类别和稳定游标；响应只包含脱敏事件代码、模块、机器展示名、软件版本、受控详情与时间。
- `GET/PUT /v2/module/logging-policy?machineId=`：读取或更新 Account 所属机器的日志策略。GET 返回 ETag；PUT 必须携带 `If-Match`，只接受 `enabled`、`minLevel`、固定类别集合和最长 7 天 `expiresAtMs`，版本冲突返回 412。
- `POST /v2/terminal-logs:upload`：机器凭据认证，单批最多 100 条，D1 `batch()` 幂等写入并逐项返回 `acceptedIds/rejected`。策略未开启、已过期、等级/类别不匹配或 policy version 过期的项目必须拒绝，客户端只删除明确 ACK 的 outbox 项。

`GET /v2/machines/policy` 在现有 assignment 之外增量返回本机受保护用户所需的 App Policy 版本。孩子策略变更只提升关联机器的 desired version；Service 原子缓存后，在实际应用时间关闭受影响用户的 foreground/PiP lane，并以新 `AccountingPolicySnapshot` 同刻重开。上传携带 `appPolicyVersion`，Worker 根据服务端策略历史解析分类和 quota bucket，不信任客户端自报分类。

### Runtime Console

`app-runtime-management/console/` 是 canonical source，静态复制到 `pages/app-runtime/`。页面在独立文档内切换 `usage/access/apps/devices/system` 五个视图，复用主控制台的绿色视觉语言、Logo、孩子选择器、桌面侧栏、移动导航和账户区，但不抽取或修改主控制台业务代码。

应用管理使用固定左侧分类目录、名称搜索、平台筛选和无二级页签列表；应用目录由 `/v2/module/app-catalog` 驱动，按当前孩子隔离，并将现行策略项与最近 30 天真实应用合并。左侧普通目录将总数、Windows 数和 macOS 数分列展示，未归类目录展示待处理数与固定 30 天窗口；策略中预配置但窗口内未使用的真实身份仍返回并保留。右侧行内使用显式目标分类动作并显示操作结果，不引入网站特有的来源子表或特殊对象。访问管理固定使用时间配额、时间段管理、配置文件三页签；设备管理使用列表加右侧详情抽屉；系统管理提供系统日志、主账本、辅助媒体和健康。系统日志沿用 TimeOnChrome 的筛选/摘要/分页层级，并在机器选择后显示远程日志开关、最低等级、类别、到期时间和 desired/applied 状态；开关关闭时仍可查询既有云端历史与 accounting diagnostic。配置文件 schema v2 由访问管理导出/导入，v1 导入补成全开放时间段，必须先本地校验和展示差异，再以带 ETag 的完整策略 PUT 应用。

### D-090 Terminal Logging

`0006_runtime_terminal_logs.sql` 只新增 `runtime_machine_logging_policy_versions_v1` 与 `runtime_terminal_logs_v1` 及查询索引，不改写既有 Segment。日志策略属于机器策略的一部分，由 `/v2/machines/policy` 下发；字段为 `version/enabled/minLevel/categories/expiresAtMs`。缺失策略、关闭或过期统一解释为不上云。Windows Service 始终维护受 ACL 保护的本地有界诊断，但只有事件发生时匹配当时有效上传策略的日志才与独立 outbox 原子写入；以后打开开关不能追溯创建历史 outbox。

日志策略更新可以提升机器 desired policy version以获得明确 ACK，但 Service 必须比较排除 `loggingPolicy` 后的 assignment/App Policy payload；只有日志字段变化时原子替换本地策略而不关闭、重开或改变任何 accounting lane。

本地日志类别固定为 `service/session/policy/upload/storage/security/accounting`，等级固定为 `info/warning/error`。详情值只允许布尔、受界整数和固定枚举；异常只转换为稳定错误码。SQLite 日志与 outbox 事务不和 Usage/Media outbox 共用提交成败，上传 loop 独立退避，单批最多 100 条，ACK 后逐项删除。日志读取/写入/上传异常只允许写入有冷却的 Windows Event Log code-only fallback，不得递归生成日志风暴。

### D-091 TimeWhereMg 与本机控制面

Windows 2.1.0 将已安装 WPF executable 改为 `TimeOnChrome.AppRuntime.Manager.exe`，用户可见名称为 `TimeWhereMg`；Burn bootstrapper 继续使用 Setup 文件名。MSI 保持既有 machine-scope UpgradeCode，升级时删除旧 Setup component/快捷方式，安装 Manager、开始菜单快捷方式和受 HKLM 保护的全用户登录启动项，ProgramData 与机器身份不清理。

Windows 2.1.1 在同一 Manager component 上增加全用户 `TimeWhereMg` 桌面快捷方式。WiX 使用标准 `DesktopFolder` 目录；在当前 `Scope="perMachine"` / `ALLUSERS=1` 安装上下文中，Windows Installer 将其解析到 Public Desktop。快捷方式必须指向正式安装目录中的 Manager executable，由 MSI 统一负责安装、repair、major upgrade 和卸载；不得指向源码 worktree 或构建产物。2.1.1 保持既有 machine-scope UpgradeCode、`ProgramFiles6432Folder` 安装位置、开始菜单入口和 HKLM 托盘自启动不变，原地升级不得清理 ProgramData、机器 credential、策略、SQLite、outbox 或历史账本。

Manager 默认以 `--tray` 在每个交互式登录会话运行；窗口关闭只隐藏到托盘。每会话 mutex 只约束普通 UI 实例；固定白名单的 `--admin-action` helper 不进入托盘且必须请求 UAC。Service 停止时 Manager 仍可通过 SCM 查询/启动服务。Session Agent 保持独立无 UI 采集进程，只在受保护 assignment 下运行。

控制面拆为两条 pipe：只读 status pipe 允许 Authenticated Users 连接，只返回 `managed/serviceState/lastSyncState` 等裁剪字段；admin pipe 保持 SYSTEM/Administrators DACL 和连接 token 二次校验，支持 `adminStatus/enroll/syncNow/prepareStop/prepareRestart/uninstall`。详细状态只包含版本、启动时间、desired/applied version、各 loop 最后成功/失败时间与稳定错误码、各 outbox 数量、交互式/受保护会话数、Agent 数、tamper 摘要和日志策略摘要，禁止返回 SID、Child ID、token、路径、窗口标题、runtime identity 或日志正文。

`prepareStop/prepareRestart` 在响应成功前必须取得状态锁、关闭所有开放 accounting lanes、flush durable state、写入 `admin_service_stop_requested` 或 `admin_service_restart_requested`。提升后的 helper 随后使用 `ServiceController` 执行 SCM 操作；停止不得把启动类型改为 Disabled。`syncNow` 使用有界信号触发 policy、heartbeat 和各 outbox 上传，不并发重放写请求。repair 使用已安装 MSI ProductCode 执行 `/fa`，不得删除 credential、SQLite、policy 或 outbox。
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
