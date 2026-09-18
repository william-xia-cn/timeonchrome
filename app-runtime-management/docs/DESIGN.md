# App Runtime 技术设计

## 当前扩展：ARM-D-016 自动产品类型识别

目录对象同时携带两个独立结果：Worker 权威解析的 `appType/typeStatus/typeReasonCode`，以及孩子策略解析的 `classification/quotaBucket`。Windows Agent 只上传验证过的事实，新增 `distributionKey`（如 `steam:714010`）；名称和 `declaredType` 均不构成 confirmed 类型。Application Knowledge v2 保存产品类型、发行身份 selector 和动态分类规则，同时继续读取 v1。

产品识别顺序为发行平台稳定 ID、可信 package identity、已核实产品/签名关联；Worker 不在请求路径调用第三方商店。类型规则只匹配服务端已解析的产品类型，不匹配客户端 `declaredType`。分类解析固定为孩子具体产品覆盖、精确产品、系列/开发者、产品类型、建议/未归类；`quotaBucket` 永远等于最终 classification。策略实际应用时切段并保存新快照，历史 Segment 不追溯修改。

Windows 2.3.0 扫描 Steam、Microsoft Store、EA、Epic、Ubisoft、GOG 的本机可信安装清单，上传规范化的公开产品 ID；损坏或缺失来源只形成来源 warning。macOS 本轮只保持 contract 兼容。该 JSON 扩展复用现有证据列和版本化知识表，不新增 D1 migration。

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
├── agents/      macOS / Windows
├── backend/     Runtime Worker、D1 migrations、R2 接口
├── console/     独立 Runtime Pages canonical source
├── installer/   Windows 安装与发布资产
└── docs/        Runtime 自身项目真值
```

Runtime 模块禁止导入根目录 `workers/`、`pages/`、Extension 或 Santa 业务代码。Guardian 只允许通过 `@timeonchrome/app-runtime-contracts` 与 Runtime 协作，不得引用 Runtime backend、console 或 Agent 源码。

## 云资源所有权

| 资源 | 所属与回滚边界 |
|---|---|
| Guardian Worker/D1、主控制台 Pages | TimeOnChrome |
| Runtime Worker/D1/R2、Runtime Pages | App Runtime |
| JWT、lifecycle、SSO/API contract | Runtime-owned versioned package |
| Windows/macOS Agent、TimeWhereMg | App Runtime |

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

目标仓库为 `timeonchrome-app-runtime`。迁出时保留 `app-runtime-management/` 历史，并接管自身 CI、Cloudflare secrets 和 Runtime 四类生产资源。TimeOnChrome 只保留 Guardian adapter、主控制台入口和固定版本 contract dependency。两仓必须分别构建、部署、回滚，任一部署不得覆盖另一方资源。
