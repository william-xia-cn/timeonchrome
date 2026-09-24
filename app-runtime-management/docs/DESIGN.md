# App Runtime 技术设计

> 本机拆仓交接（ARM-D-031）：TimeWhereNative CI 产出带 `sourceGitSha`、contract 版本/包哈希及 MSI/Burn 文件哈希的内部候选。TimeOnChrome 的受保护工作流只接受精确成功 CI run 与受控来源仓库，经只读跨仓凭据下载并逐项校验后，才可写入版本化 R2 路径；缺少凭据或对象已存在时 fail closed。`latest.json` 切换是另一个明确批准的发布动作，本轮不执行。

## 当前开发：ARM-D-025 系统默认分类

应用分类解析新增云端低优先级默认：精确系统应用为 `composite`，confirmed 游戏/游戏平台/游戏工具为 `restrictedEntertainment`。家长明确分类和更高优先级批准规则先执行；冲突、疑似类型、普通应用和技术记录不套用默认。目录和机器策略共用同一解析结果。

完整 inventory 同步冻结新的 `resolvedApplications` 并提升机器 desired policy version；设备收到新 ETag 后在实际应用点切段。服务端仍按上传 Segment 的历史 App Policy version 校验 classification/quota bucket，因此不重写旧事实，也不把离线旧 Segment错误归入新默认。

## 当前修复：ARM-D-024 游戏与系统应用规则补全

Runtime-owned 产品规则包 schema v3 使用现有强身份确认五个游戏组对象：EA app、XBOX 与完美世界竞技平台为 `gameLauncher`，Solitaire & Casual Games 为 `game`，Game Bar 为 `gameUtility`。三种客观类型均投影到 `catalogGroup = game`，但默认“建议归为受限娱乐”仍只面向 `game`。EA 的两个精确产品键归入同一产品；显示名称和发布者不参与确认。

wire value `systemTool` 保持兼容，用户可见名称统一为“系统应用”。反馈中心、命令面板、天气与录音机通过精确 package family 进入该组。目录顺序、折叠/惰性渲染、孩子管理分类和配额桶均不变；不重写 inventory、策略、账本或历史数据。

## 当前修复：ARM-D-021 Windows 内置系统工具规则补全

Runtime-owned 产品规则包增加六个经审核的精确 package family：`Microsoft.ScreenSketch_8wekyb3d8bbwe`、`Microsoft.YourPhone_8wekyb3d8bbwe`、`Microsoft.WindowsAlarms_8wekyb3d8bbwe`、`Microsoft.Windows.Photos_8wekyb3d8bbwe`、`Microsoft.Paint_8wekyb3d8bbwe` 和 `Microsoft.WindowsCamera_8wekyb3d8bbwe`。Worker 对 package identity 统一转小写，并用 `!` 前的 family 同时匹配产品容器和启动入口；容器继续作为技术记录，启动入口只形成一个可管理行。

该规则把截图工具、手机连接、时钟、照片、画图和相机投影为 `catalogGroup = systemTool`，不使用显示名称、路径或发布者进行推断。同名第三方程序以及资讯、Edge、Office、Teams、Xbox、Copilot、媒体播放器保持非系统工具。管理分类、配额、账本、安装状态和历史数据均不变；无需 Agent 升级、重新扫描、migration 或 Console 修改。

## 当前热修：ARM-D-020 精确分组规则与目录顺序

Runtime-owned 产品规则包以 HKLM/HKCU 两个稳定 Steam 安装产品键把 Steam 确认为 `gameLauncher`，以 `Microsoft.WindowsTerminal_8wekyb3d8bbwe` 精确包族把 Windows Terminal 投影为系统工具。Bing News 不在系统工具清单中，继续按普通内容应用投影。匹配不使用显示名称，不要求终端重新扫描。

Console 在每个孩子管理分类内依次显示默认展开的普通应用、默认展开的游戏和默认折叠的系统工具；搜索命中系统工具时自动展开。本次不新增 contract 字段、migration、Agent 或安装包，只部署 Runtime Worker 与独立 Runtime Pages。

## 当前扩展：ARM-D-018 云端目录四层分组

`GET /v2/module/app-catalog` 对 actionable 条目新增 `catalogGroup` 与 `catalogGroupReasonCode`。Worker 的固定投影顺序为技术记录、精确系统工具、confirmed 游戏/游戏平台、普通应用；Console 不再从 `applicationOrigin` 或显示名称自行决定组别。`applicationOrigin` 继续作为兼容与审计字段。

Runtime-owned 产品规则包升级为 schema v2，集中保存 confirmed 产品类型、技术组件和精确系统工具身份。获取帮助使用 `Microsoft.GetHelp_8wekyb3d8bbwe!App`，设置使用 `windows.immersivecontrolpanel_cw5n1h2txyewy!microsoft.windows.immersivecontrolpanel`；匹配大小写不敏感。游戏/游戏平台必须由可信 product selector 确认，名称建议仍留在普通应用。本轮 contracts 升级至 1.8.0，不新增 migration，不修改 Agent、策略 schema、账本或配额。

Console 在五个孩子管理分类内依次显示默认展开的普通应用、默认展开的游戏和默认折叠的系统工具；搜索命中系统工具时自动展开。技术记录继续位于系统管理且没有分类操作。部署只包含 Runtime Worker 和独立 Runtime Pages。

## 产品目录云端纠错与发行证据边界（ARM-D-017）

- MSIX package family 是技术容器；可信 AUMID 才是默认可管理的包内应用。容器进入技术记录，不进入孩子五分类目录。
- Win32 安装产品仍可作为产品锚点聚合可靠变体；无变体的安装产品仍从安装事实贡献机器/账户覆盖数。
- Worker 根据版本化系统包规则与产品知识生成系统来源、可管理性和客观类型。Agent 字段仅是事实/建议，不是最终目录权威。
- 包容器旧分类不自动继承到入口；前端显示重新确认提示。该规则只改变 read model，不重写分类、账本或配额。
- 当前真实完整发行来源为 Steam/Epic。EA/Ubisoft/GOG 由 Windows 2.4.0 新增独立来源；来源缺失、单项损坏与整体失败分别结算。

## 当前修复：Windows 2.3.1 本地盘点来源上限

Session Agent 的完整扫描固定携带 Registry、Start Menu、用户包、Steam 与 Epic 共 7 项来源结果。Service 必须在写入 inventory outbox 前接受最多 8 项固定来源，与 contracts 1.6.1 和 Worker 保持一致；该上限只是协议容量，不改变允许来源枚举、来源完成状态或缺失对账条件。

2.3.0 的本地校验仍使用 6 项上限，导致完整扫描在 named pipe 消费阶段抛出 `INVALID_INVENTORY_SCAN`，没有进入可重试 outbox。该缺陷无法通过云端规则修复；2.3.1 只调整本地容量并补固定 7 来源回归，不修改产品发现、账本、策略或上传 ACK 语义。版本必须前向递增，禁止覆盖已发布的 2.3.0 不可变产物。

## 当前扩展：ARM-D-016 自动产品类型识别

目录对象同时携带两个独立结果：Worker 权威解析的 `appType/typeStatus/typeReasonCode`，以及孩子策略解析的 `classification/quotaBucket`。Windows Agent 只上传验证过的事实，新增 `distributionKey`（如 `steam:714010`）；名称和 `declaredType` 均不构成 confirmed 类型。Application Knowledge v2 保存产品类型、发行身份 selector 和动态分类规则，同时继续读取 v1。

产品识别顺序为发行平台稳定 ID、可信 package identity、已核实产品/签名关联；Worker 不在请求路径调用第三方商店。类型规则只匹配服务端已解析的产品类型，不匹配客户端 `declaredType`。分类解析固定为孩子具体产品覆盖、精确产品、系列/开发者、产品类型、建议/未归类；`quotaBucket` 永远等于最终 classification。策略实际应用时切段并保存新快照，历史 Segment 不追溯修改。

Windows 2.3.1 独立扫描 Steam、Epic 和 Microsoft Store，并只从通用安装注册表机会性获取 EA、Ubisoft、GOG ID。Windows 2.4.0 才从后三者的发行器注册信息与自有本地清单形成独立来源，上传规范化的公开产品 ID；发行器未安装结算为成功空来源，单项损坏形成 warning，来源整体不可读才 failed。macOS 本轮只保持 contract 兼容。该 JSON 扩展复用现有证据列和版本化知识表，不新增 D1 migration。

Windows 2.4.0 完整盘点的来源集合包含旧有 Registry、Start Menu、用户包以及 `distribution-steam`、`distribution-epic`、`distribution-ea`、`distribution-ubisoft`、`distribution-gog`。Contract、Worker 和 Service 统一接受最多 16 个固定来源结果；新发行来源只对自身的缺失事实执行来源级结算，不改变旧客户端依赖五个基础安装来源完成后才清理无来源 legacy 投影的兼容门槛。

## 当前扩展：ARM-D-015 普通应用与系统应用分组

目录投影在既有 `manageability = actionable | review | hidden` 之外增加正交来源 `applicationOrigin = user | operatingSystem | unknown`。`actionable + operatingSystem` 进入系统应用组；其余 actionable 对象进入普通应用组；review/hidden 仍进入技术记录。该来源只影响展示分组，不替代孩子分类、产品类型或配额键。

contracts `1.5.0` 为 `ApplicationDiscoverySummary` 增加可选 `applicationOrigin` 与 `originEvidenceCode`，但这两个终端字段只作为 advisory evidence。Windows Agent 继续上传经过验证的 `packageId`、产品/变体关系等事实；Runtime Worker 在查询目录时用版本化精确包规则生成权威 `applicationOrigin`，不得信任客户端自报来源。名称、路径和 Microsoft 发布者不能单独命中。旧 Agent 2.2.3 已包含可信 `packageId`，因此系统应用分组不要求安装包升级。inventory 证据继续保存于现有 JSON 列，不新增 migration，也不改写历史观察。

`GET /v2/module/app-catalog` 为可管理条目返回云端解析后的来源与证据原因。首批精确 Windows 包规则覆盖 Quick Assist、Windows Notepad 和 Windows Calculator；无法命中时返回 `unknown`。Console 在每个孩子分类内分别渲染普通应用和系统应用，系统组默认折叠并在搜索命中时展开。两组使用相同分类和策略写入路径；本轮不新增应用阻止，也不修改 UsageSegment、媒体账本、配额计算或历史投影。

## 当前修复：游戏候选与 SSO 启动孩子

应用目录区分“产品类型提示”和“孩子实际分类”。`Aimlabs`、`Apex Legends` 等由受控确定名称规则命中的产品可显示 `game` 高置信候选及“建议归为受限娱乐”，但仍保持当前孩子的既有分类；只有家长明确配置或已批准自动规则才能改变分类、配额桶与后续 Segment。名称规则采用规范化后的精确产品名，不以模糊包含匹配扩大命中范围。

主控制台调用 `POST /app-runtime/sso/tickets` 时提交当前 `profileId`。Guardian 从账户自己的 Runtime Child 清单验证该 ID，合法时写入签名 ticket 的可选 `selected_child_id`；不属于账户的 ID 返回 404，缺失时保留旧行为。Runtime Worker 验证该字段必须出现在 ticket 的 `children` 中，并在兑换响应中返回可选 `selectedChildId`。Console 仅在创建新 browser session 时采用它作为初始孩子；已有 Runtime session 和页面内主动切换不被覆盖。该上下文不进入 URL、localStorage、日志或独立持久表。

以上为 contracts `1.4.0` 的向后兼容 Minor 扩展；数据库结构、browser session token 和账户授权模型不变。

## 当前修复：聚合投影不得反向提升维护产品

真实生产回读还要求把明确的中英文驱动、芯片组/Management Engine/Serial IO 组件、兼容性数据库、认证工具和构建工具名称作为保守 review 信号。名称信号只让安装产品进入只读技术记录；产品知识或家长明确配置仍可提升，且任何事实、账本或分类历史都不删除、不重写。

产品组的最终可管理性必须尊重安装产品证据：分组中出现 `TECHNICAL_PRODUCT_REVIEW` 安装产品时，关联启动入口不能把该组反向提升为 actionable；只有版本化产品知识或家长明确配置可以提升。装饰名称 family 若对应多个互不关联的可管理安装产品，则整体按歧义技术记录展示；名称只用于安全降级和聚合展示，不写入持久关联，也不自动继承分类。

v2 `ApplicationVariant` 只是启动入口、包内应用或运行身份。强 binary/package 身份可以稳定识别该变体，但不能独自证明它是产品；没有可信父产品、产品知识或家长明确配置时，独立变体保持 review。已关联可信安装产品的变体仍由产品组携带，历史使用和实现身份不丢失。

## 当前修复：生产目录的维护对象与装饰名称降噪

ARM-D-014 的生产复验表明，Windows Uninstall Registry 中部分 redistributable、runtime、maintenance service 和 installer 未设置 `SystemComponent`、`ParentKeyName` 或 `ReleaseType`，因此扫描事实只能证明“存在安装记录”，不能证明其是家长可管理应用。read model 对这类通用维护语义只降为 `review` 技术记录，不删除、不标记卸载，也不自动确认产品。

同一平台只有一个可管理安装产品时，孤立入口若与产品名仅存在版本号、架构、Preview/渠道等装饰差异，可共用“可能产品变体”投影，避免形成第二条主行。该投影不创建持久关联、不继承分类、不改写产品 ID；出现多个候选产品时继续保持歧义并进入技术记录。跨来源真正合并仍要求 `productKey`、package identity、binary hash 或人工确认等可靠依据。

## 当前修复：ARM-D-014 产品级目录与来源级盘点

Windows 目录升级为 `InstallationProduct -> ApplicationVariant -> TechnicalRecord` 三层。安装产品来自可信 Uninstall Registry/MSIX 记录；启动入口和运行身份只作为变体关联到产品。主目录以可管理产品为单位计数，套件默认一行，显式拆分的变体才单独参与孩子分类。无法确认归属的浏览器宿主/PWA、维护入口和系统组件进入技术记录。

contracts 1.3.0 的 inventory v2 分离 products/variants/sourceResults。来源状态为 complete、complete_with_warnings 或 failed；完成来源可独立将缺失对象标为 notObserved，其他来源失败不阻断。Runtime additive 0010 保存产品、变体与来源结果，不重写既有 inventory/Segment。Worker 同时接受 inventory v1/v2，catalog 保持旧字段并增加 variants 与 inventoryCoverage。Windows 客户端版本为 2.2.2。

## 当前修复：ARM-D-013

目录 read model 在原始 `runtimeIdentity` 与家长应用目录之间增加产品投影层。服务端把记录分为 `actionable`、`review` 和 `hidden`：已确认产品或具有可靠身份的主应用为 `actionable`；只有历史进程名、弱候选或证据不足的实现为 `review`；明确组件与瞬态对象为 `hidden`。主目录和分类计数只返回/使用 actionable 项，review/hidden 项通过系统管理的只读技术进程记录审计，不提供分类按钮。

产品行按 `productId + platform + classification` 聚合并携带可信 `runtimeImplementations`，保存分类时把同一选择投影到这些现有技术键，不创建虚假身份。该投影不修改 UsageSegment、app usage 统计或 quota 计算；原始账本继续作为事实源。

## 当前修复：ARM-D-012

目录降噪和盘点完整性使用 contracts 1.2.0 的可选 discovery/scan 摘要，Guardian 的现有 ^1.0.0 依赖及业务 import 不变；根 compatibility 测试同步 Minor 版本。旧客户端继续兼容。细则见 SPEC-004 技术设计 checklist；0009 仅本地生成/验证。默认目录不列已成功盘点确认缺失且无使用/配置的旧候选，不删除其原观察记录。

扫描数据每批 200，上限每用户 10,000；超过容量明确部分盘点，不推断卸载。家庭知识 read-model 暂支持 20,000 原始观察（旧 1,000 限制会使多用户正常盘点失败）；超容量明确报错，不能伪报完成。新扫描仅在结束标记生成一次策略投影，避免每个安装批次制造重复版本；运行补充及旧客户端保持即时投影。

原始清单和客户端策略容量分离：未归类解析结果不进入 resolvedApplications，继续使用既有未归类/无限额默认值。非默认有效投影超过旧客户端支持的 1,000 项时返回 APPLICATION_POLICY_CAPACITY 并保留旧策略，不静默截断或保存客户端无法解析的版本。包查询 helper 输出及 C# 重定向读取显式 UTF-8；中文测试只运行合成输出，不执行真实应用查询。

## 当前扩展：ARM-D-011 应用目录与分类规则

产品知识、孩子明确分类、固定分类规则为独立对象；安装观察和原始使用账本分开保存。工程规格见 `specs/SPEC-004-APP-RUNTIME-TECHNICAL-DESIGN.md` 的 ARM-D-011 部分。共享 contracts 1.1.0 增量兼容；本地 additive 0008 不改写历史。Console 保持独立 canonical source，不恢复主 Pages 静态副本。本阶段尚未生产发布，macOS 编译验收待实际 macOS 环境。

## 模块边界

```text
app-runtime-management/
├── contracts/   @timeonchrome/app-runtime-contracts
├── backend/     Runtime Worker、D1 migrations、R2 接口
├── console/     独立 Runtime Pages canonical source
└── docs/        Runtime 自身项目真值

TimeWhereNative/（独立私有仓库）
├── agents/      macOS / Windows、RuntimeService、TimeWhereMg、Native Host
└── installer/   Windows 安装与待发布产物
```

Runtime 模块禁止导入根目录 `workers/`、`pages/`、Extension 或 Santa 业务代码。Guardian 只允许通过 `@timeonchrome/app-runtime-contracts` 与 Runtime 协作，不得引用 Runtime backend、console 或 Agent 源码。

## 云资源所有权

| 资源 | 所属与回滚边界 |
|---|---|
| Guardian Worker/D1、主控制台 Pages | TimeOnChrome |
| Runtime Worker/D1/R2、Runtime Pages | TimeOnChrome 仓库的 Runtime 模块 |
| JWT、lifecycle、SSO/API contract | TimeOnChrome 仓库发布的固定版本包 |
| Windows/macOS Agent、TimeWhereMg、Native Host | TimeWhereNative 私有仓库 |

生产构建只能来自已合并到 `origin/master` 的干净 Git SHA。功能 worktree 只能本地验证和 Pages preview，禁止操作生产 D1、Worker、Pages 或 R2 latest。

## Browser SSO

1. 主控制台使用当前 Guardian session 调用 `POST /app-runtime/sso/tickets`。
2. Guardian 签发 60 秒、单次、`aud=app-runtime-management:sso` 的 ES256 ticket，并返回固定 Runtime origin 的 fragment launch URL。
3. Runtime Pages 读取 fragment 后立即 `history.replaceState` 清除，再调用 `POST /v2/auth/browser-sessions`。
4. Runtime Worker 原子消费 `jti`，返回 256-bit opaque token；数据库只存 SHA-256。
5. 页面只把 token 放入 `sessionStorage`，使用 `Authorization: RuntimeSession <token>`；绝对有效期 8 小时，不续期。
6. `DELETE /v2/auth/browser-sessions/current` 撤销会话。无 ticket 直接访问时只显示“从家长控制台进入”。

SSO 使用独立 ES256 key pair，不复用 Santa、Runtime machine、module JWT 或 lifecycle keys。一个发布周期内 Runtime API 同时接受旧 Guardian account module JWT 与 RuntimeSession。

## Migration 约束

- Runtime 保留 `0001–0006`，新增 `0007_runtime_browser_sessions.sql`；只允许 additive migration。
- Guardian 保留所有已在生产使用过的文件名，即使 `023–025` 与主线其他 migration 的数字前缀重叠也不得重命名。
- Guardian 远端 migration 追踪表目前为空，禁止运行自动全量 migration apply；新 migration 从 `030` 开始并需显式 schema preflight。

## 拆仓路径

目标仓库改为私有 `william-xia-cn/TimeWhereNative`，仅迁出本机 `agents/` 和 `installer/` 的相关历史。TimeOnChrome 保留 Runtime contracts、Worker、独立 Pages、D1、R2、Guardian adapter、主控制台入口和全部 Cloudflare 生产写权限；新仓锁定固定版本 contract 包并只生成经测试的 MSI/Burn/manifest。TimeOnChrome 的受保护发布流程校验来源 SHA、契约版本和哈希后，独占 R2 上传与 latest 切换。旧“整体迁出 Runtime 云端”方案由 D-104/ARM-D-031 取代。两仓必须独立构建；拆仓本身不部署、不执行 migration、不升级本机、不改写数据。

本机产物交接使用新仓成功 CI 的精确 `runId + headSha` 和只读仓库令牌。TimeOnChrome 的手工生产环境流程下载该 CI artifact，核对 manifest 的 `sourceGitSha`、contract 版本/包 SHA-256、MSI/Burn 大小与 SHA-256，确认目标 R2 版本路径不存在后写入、回读校验，manifest 最后写入。`latest.json` 只有单独勾选并获得生产环境批准后才可切换；没有只读交接令牌或任一哈希不符即停止。新仓 CI 本身没有 Cloudflare secret、R2 上传或 latest 权限。
