# App Runtime 决策记录

## ARM-D-021：Windows 内置系统工具采用经审核的精确包身份

PO 于 2026-09-20 确认实施。ARM-D-018 中“照片不得仅因微软发布或系统预装进入系统工具”的弱证据禁令继续有效，但经产品审核的 Windows 内置基础工具与默认系统实用应用可以通过稳定、精确的 package family/AUMID 进入 `systemTool`。本次确认截图工具、手机连接、时钟、照片、画图和相机属于该边界；显示名称、路径、发布者和预装状态仍不能单独命中。

Runtime Worker 以六个已核实 package family 动态投影目录；family 规则大小写不敏感，并同时覆盖 package container 与其 `!App` 启动入口。包容器仍只进入技术记录，启动入口只形成一个可管理产品行。资讯、Edge、Office、Teams、Xbox、Copilot 和媒体播放器等未审核产品保持普通应用或既有投影。

本决策只改变目录分组，不修改管理分类、配额桶、安装状态、机器/账户计数、账本或历史 Segment；不要求 Agent 升级、重新扫描或重新配对。按 ARM-D-019 只运行 Worker 聚焦测试、backend typecheck、Wrangler dry-run 和 `git diff --check`，合并后只部署 Runtime Worker。

## ARM-D-020：精确启动器／系统工具规则与目录默认顺序

PO 于 2026-09-20 确认实施。Runtime Worker 使用已上传的强身份事实修正目录分组：Steam 只以稳定 Windows 安装产品键确认为 `gameLauncher`，Windows Terminal 只以精确 package family/AUMID 确认为 `systemTool`；显示名称、发布者或预装状态均不能单独命中。`Microsoft.BingNews`（资讯）属于内容应用，保持 `application`，不扩大“系统工具”的配置、帮助、诊断、维护或基础工具边界。

五个孩子管理分类内的默认展示顺序固定为“普通应用、游戏、系统工具”。普通应用和游戏默认展开，系统工具默认折叠且搜索命中时展开。该热修只改变 Worker 动态投影与 Console 排列，不升级 Agent、不重新扫描、不改写分类、账本、历史 Segment 或配额。

## ARM-D-019：按变更影响选择测试并复用精确 SHA 证据

PO 于 2026-09-20 确认实施。App Runtime 的测试范围由实际变更影响决定，不因提交、push、PR、发布或文档收口机械升级为全平台回归。每个任务在实现前必须记录变更等级、受影响子系统、必要本地测试、必要 CI、发布后 smoke 和明确排除项；扩大范围必须说明精确命令、具体风险与预计耗时并取得批准，“更完整”不是理由。

同一 Git SHA 和相同产物哈希的通过证据可以复用。纯文档、任务板、Changelog、生产 manifest 或发布证据提交不得使未变化代码的既有证据失效。生产部署必须验证目标 `master` SHA 已通过对应 CI gate，随后只运行部署资源的 health、未认证 fail-closed 和目标业务 smoke，不重复跨平台构建。

默认矩阵为：文档只做 diff/结构检查；Console 只验证 Console，布局变化才截图；Worker/规则包只验证 Worker/typecheck/Wrangler；公共 contract 验证兼容性和真实消费者；Windows Agent、Windows Installer、macOS Agent 分别只验证自身；跨平台状态机/账本才验证两端黄金向量。账本、migration、安全、权限、隐私和商店发布的专项门禁继续有效，不得借节流降低标准。

GitHub PR 仅将 `app-runtime-gate` 设为 App Runtime 必需检查。该轻量 gate 对所有 PR 运行，以便无关 PR 立即返回成功；重型 job 仍只按 Runtime 文件影响触发。不得把可跳过的平台 job 单独设为必需检查。

## ARM-D-018：云端权威的游戏、普通应用、系统工具与技术记录分组

PO 于 2026-09-20 确认实施。孩子级学习、复合、受限娱乐、黑名单与未归类目录保持不变；每个目录内部由 Runtime Worker 权威投影 `catalogGroup = game | application | systemTool`。非 actionable 对象继续进入独立技术记录。游戏与系统工具只是目录分组，不是管理分类或配额桶；分类、账本、历史 Segment 和配额均不得因分组变化而改写。

投影优先级固定为：非 actionable 进入技术记录；精确命中受控系统工具清单的 actionable 对象进入 `systemTool`；服务端确认 `appType = game | gameLauncher` 的对象进入 `game`；其他 actionable 对象进入 `application`。疑似游戏和只靠名称命中的候选仍属于普通应用。游戏被家长明确归为复合时仍显示为游戏，但只扣复合配额。

系统工具只指 Windows 内置、用户可主动打开且主要用于配置、帮助、诊断、维护或基础工具的对象，并要求经审核的精确 AUMID、package identity 或系统二进制规则。显示名称、安装路径、Microsoft 发布者或预装状态均不能单独命中。Edge、Office、Teams、Xbox、Copilot、照片和媒体播放器不得仅因微软发布或系统预装进入系统工具。首批在既有规则上增加获取帮助与设置；以后纯规则调整只部署 Worker，不要求终端升级。

## ARM-D-017：包容器、可启动应用与发行证据分层

PO 于 2026-09-18 确认实施。MSIX/package family 是安装与签名边界的技术容器，不默认等同于家长可管理产品；包内具有可信 AUMID 的每个可启动入口默认作为独立应用投影。无可启动入口的包容器只进入技术记录。LibreOffice 等具有可靠 Win32 安装产品锚点的套件继续按产品与变体聚合，不因本决策拆散。

Runtime Worker 是目录投影与产品类型的权威。Worker 使用既有可信 `packageId`、`distributionKey`、安装产品/变体关系和版本化产品知识动态生成 `manageability`、`applicationOrigin` 与 `appType`；终端不上传权威分类。包容器已有的孩子明确分类不得自动复制到新拆出的 AUMID 应用，避免无批准地改变配额语义；目录以技术记录提示旧包级配置需要重新确认。

安装产品即使没有可用变体，也必须用安装事实贡献 `machineCount/userCount`；使用时长仍只来自真实 UsageSegment。产品知识只纳入经过公开稳定身份核实且有管理价值的条目，`steam:228980` 等技术组件明确保持技术记录。名称只能形成建议，不能确认产品类型。

ARM-D-016 中“Windows 2.3.0 已从 Steam、Microsoft Store、EA、Epic、Ubisoft 和 GOG 可信本机清单提取稳定发行身份”的完成描述经生产核对后更正：2.3.1 的完整独立发行扫描只有 Steam 与 Epic；EA、Ubisoft、GOG 仅有注册表机会性识别。该证据缺口由 contracts 1.7.0 / Windows 2.4.0 前向补齐，不阻塞本决策的云端目录纠错。

## ARM-D-016：客观应用类型与孩子管理归类永久分离

PO 于 2026-09-18 确认实施。`appType` 是产品知识中的客观事实（`game / gameLauncher / onlineVideo / mediaPlayer / other / unknown`），`classification` 是孩子级管理策略（`study / composite / restrictedEntertainment / blocked / unclassified`）；二者不得互相覆盖。游戏可以被家长明确归为复合，但其客观类型仍为游戏。配额只读取最终生效的 `classification`，不增加类型配额，也不重复扣减。

Windows 2.3.0 只负责从 Steam、Microsoft Store、EA、Epic、Ubisoft 和 GOG 的本机可信清单提取公开稳定的 `distributionKey`。Runtime Worker 使用版本化产品知识、可信 package identity、签名与产品关联解析 `appType/typeStatus/typeReasonCode`，客户端自报类型和显示名称只能形成建议。Runtime 查询不得实时依赖第三方商店 API；规则包由受控离线或 AI 辅助整理，经预览和家长批准后发布。

分类优先级固定为：孩子具体产品明确分类、精确产品自动规则、系列/已核实开发者自动规则、产品类型自动规则、建议/未归类。默认“游戏 → 受限娱乐”仅为建议；孩子批准启用后才自动作用于现有及未来游戏。取消具体产品覆盖后，该产品从下一策略版本重新继承已启用的动态规则。分类变化只向前生效并切段，不重写历史 Segment。

## ARM-D-015：普通应用、系统应用与技术记录正交分层

PO 确认实施（2026-09-18）。家长可管理对象继续以 `actionable` 为准，并新增与可管理性正交的来源维度 `applicationOrigin = user | operatingSystem | unknown`。普通应用与操作系统提供、用户可主动打开的系统应用都可以参与孩子分类、独立配额和未来阻止策略；组件、更新器、卸载器、helper、驱动入口、运行库和证据不足对象继续进入只读技术记录。

系统应用只能由精确平台包身份的受控规则、可信操作系统元数据或已审核的系统二进制关联判定。显示名称、安装路径或“发布者是 Microsoft”不得单独形成系统归属。无强证据时保持 `unknown`，不得猜测为系统应用。首期 Windows 接入；共享 contract 保留 macOS 同一语义，但本轮不宣称 macOS 已实现。

PO 于 2026-09-18 补充确认：普通应用、系统应用和技术记录属于云端产品目录投影，不得依赖终端版本。Agent 只上传经过验证的 `packageId`、签名摘要、产品/变体关系等事实；Runtime Worker 是 `applicationOrigin`、`manageability` 和最终页面分组的唯一权威。contract 中 Agent 可选上传的 `applicationOrigin` / `originEvidenceCode` 仅为 advisory evidence，不能覆盖云端规则。系统包规则变化只发布 Worker，不要求升级安装包；只有新增底层证据采集或本地执行能力时才升级 Agent。

应用管理的五个孩子分类目录保持不变。每个目录右侧同页显示默认展开的普通应用和默认折叠的系统应用；搜索命中系统应用时自动展开。系统应用默认仍为未归类，不因系统归属自动改变分类、配额、账本或历史 Segment。技术记录继续位于系统管理，不提供分类按钮。

## ARM-D-014：安装产品、应用变体与技术记录三层目录

PO 确认实施并要求生产发布（2026-09-16）。家长应用目录的主对象是可管理产品，不是安装入口、快捷方式或运行进程。Windows Uninstall Registry / MSIX 等可信安装记录形成 `InstallationProduct`；Start Menu、包内应用、便携执行体和运行身份形成 `ApplicationVariant`；组件、更新器、卸载器、helper、诊断工具及证据不足宿主形成 `TechnicalRecord`。

套件默认按安装产品聚合，LibreOffice 等产品只显示一个主行，入口保留在可展开变体中；家长明确“拆分管理”后，指定变体才可拥有独立分类。主清单以 Windows 可管理安装产品为基线，但不机械复制系统设置清单：驱动、runtime、维护组件和系统管理入口仅保留技术审计。通用浏览器/WebView/PWA 必须依赖可信 AUMID、package identity 或家长确认去重，无法确认的宿主不得进入主目录。

生产复验补充：安装记录缺少结构化组件标志时，redistributable、runtime、maintenance service、installer 等名称语义只能触发 `review`，不得据此删除事实或自动确认产品。产品名称的版本、架构或渠道装饰归一化只允许把唯一安装产品旁的孤立入口降为“可能变体”，不构成持久合并、分类继承或跨产品身份确认。

盘点完整性按来源结算。单项解析错误只记 warning；只有来源级枚举失败才阻止该来源的缺失对账，其他成功来源仍可独立清理陈旧 installed 投影。旧 v1 客户端继续全局 fail-closed。所有清理只改变安装状态和目录投影，不删除原始观察，不改写 UsageSegment、历史时长、分类或配额键。

## ARM-D-013：产品应用投影与技术进程记录分层

PO 确认修复（2026-09-16）。`runtimeIdentity` 是不可变账本的技术身份，不等于家长可管理的产品应用。应用目录只收纳已确认产品，或具有可靠安装证据且角色为主应用的具体平台实现；已确认产品的多个技术实现合并为一个产品行，但仍保留全部实现供策略投影。分类计数和分类操作只针对这些可管理对象。

组件、安装器、updater、helper、宿主进程和只有历史进程短名的旧记录不得因为“曾产生 Segment”自动成为应用。组件/瞬态对象默认隐藏，候选和证据不足的历史身份进入只读“技术进程记录”，可审计但不能分类；不得依靠名称黑名单删除 `wixstdba`、`olk`、`w` 等特例。待后续取得包身份、签名、binary hash 或人工产品关联后，才可晋升为可管理对象。

本决策只改变产品目录/read model 与交互投影：原始 Segment、历史时长、配额键和上传 ACK 均不改写；技术进程是否应计入主账本属于独立 accounting 决策，本轮不隐式改变。

## ARM-D-012：发现对象降噪、可信关联与盘点完整性

PO 授权修复（2026-09-16）。安装对象、启动入口、运行身份和家长确认的产品不混为一谈。包的隐藏入口仅作为组件展示提示，不豁免运行计时；不同可见入口保持独立，不能因同包、同名或同签名者自动合并。相同已验证 binary/packageId 可关联旧运行身份，保留全部技术实现与原有配额键。Registry DisplayIcon 不作为主程序证明。友好名称优先于包名，无法解析时明确为名称回退。

默认目录优先主要应用，组件可通过完整发现筛选查看；已安装未使用也可归类。原使用未归类历史仍按原始账本读取，禁止追溯修改。scanId、来源结果、预期批次数/观察数及批次序号形成独立盘点协议；所有批次入库且完成标记收到后才称完整。未登录用户、失败来源和旧客户端均不能称整机完整。未知/中断扫描不推断卸载。

本轮只修代码、本地 additive migration 与客户端 2.2.1 包。保持配对、机器身份、历史账本、独立部署边界和未签名发布风险；不清理生产数据、不部署、不自动升级。

## ARM-D-011：应用发现、确定性产品与分类规则

状态：Active（PO 批准，本地实现；macOS 验收待环境）。家庭产品类型和可信身份关联共用；孩子明确分类独立。确定性产品列表与通用规则分别管理，规则逐条选择自动/建议。自动规则不能仅凭名称、路径或自声明类别生效；同层冲突保留旧有效分类，无旧配置则未归类。外部规则包必须预览差异后逐项批准，不能覆盖孩子明确配置。首次安装主动盘点，运行补充便携应用；盘点不形成 UsageSegment。关联合并/拆分可审计，不改写历史。Windows 接入 Service，macOS 仅显式只读发现；不生产部署、不阻止进程、不共享 Santa 身份协议。

## 历史迁入索引

根仓历史 D-075–D-091 记录了 Runtime 从 macOS 骨架、跨平台产品、Windows 配对、机器级多用户、统一落账、应用策略、终端日志到 TimeWhereMg 的演进。由于根仓后来独立复用了 D-075–D-081，Runtime 决策自本文件起使用 `ARM-D-*` 命名空间；历史内容继续由冻结标签 `app-runtime/pre-integration-20260915` 和本模块 SPEC-004 保留，不再在根决策表重复维护。

| ID | 决策 | 状态 | 结论 |
|---|---|---|---|
| ARM-D-001 | 同仓独立模块与未来拆仓边界 | Active | `app-runtime-management/` 在当前仓库内独立构建、测试、版本和部署；Guardian 只依赖版本化 contract。未来拆仓时业务 import 不变，只切换 package 来源。 |
| ARM-D-002 | Runtime 与 Santa 永久隔离 | Active | 不共享 enrollment、MachineID、策略数据库、同步协议、数据表、密钥或凭据。 |
| ARM-D-003 | 跨平台 Runtime 是一个产品 | Active | Windows/macOS 是同一产品的两个原生 Agent；共享 Runtime 后台、contracts 和账本语义。 |
| ARM-D-004 | Windows 机器级多用户管理 | Active | LocalSystem Service 管理机器身份/策略/账本，每个交互式会话运行无云端凭据的 Session Agent。 |
| ARM-D-005 | 主账本与媒体辅助分轨 | Active | 不可变 UsageSegment 是唯一权威主账本；MediaSegment 仅作辅助，不进入主时长或配额。 |
| ARM-D-006 | 孩子级应用策略 | Active | 分类和独立配额按 Child + platform + runtimeIdentity 保存，只向前生效，不改写历史。 |
| ARM-D-007 | 应用目录与访问配置分离 | Active | 顶层为使用统计、访问管理、应用管理、设备管理、系统管理；应用目录不提供虚假名称对象。 |
| ARM-D-008 | 机器级终端日志 | Active | 结构化、脱敏、TTL 受控的远程日志独立于主账本，上传失败不得阻塞计时。 |
| ARM-D-009 | TimeWhereMg 本机控制面 | Active | Manager 是本机管理应用；RuntimeService 是后台服务；Session Agent 是内部实现细节。 |
| ARM-D-010 | 独立 Runtime Pages 与单次 SSO | Active | Runtime Pages 独立部署；Guardian 签发 60 秒单次 ticket，Runtime 兑换 8 小时不可续期的哈希化 browser session。 |
