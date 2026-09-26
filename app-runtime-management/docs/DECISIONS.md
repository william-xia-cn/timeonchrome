# App Runtime 决策记录

## ARM-D-032：应用管理分类修正本周有效使用归属

2026-09-27 PO 明确产品口径：应用管理分类调整时，北京时间当前周（周一 00:00 起）的该孩子、该已确认应用产品已有主使用用量也应调整有效分类，不仅影响之后的新记录。上周及更早历史不追溯；产品关联必须有可信证据或明确确认，不能仅因显示名称相同扩大修正范围。

原始 UsageSegment、原分类/策略快照、起止时间与 duration 保留；有效归属通过独立、可审计、版本化更正表达。应用统计的日/周、小时、应用与分类明细以及独立应用配额读模型必须消费同一有效结果，不得仅修改列表标签。主使用总时长不变，分类仍按既有区间并集规则，不能把明细直接相加。网页与媒体账本、网页配额不受影响。

同周重复改分类不得重复计时或重复扣减；同一修正的重放和本周迟到上传必须幂等。当前云端与本机读取均需实现更正消费，后续设计应固定同步、版本和离线一致性；本条确认的是产品语义，不代表现有代码已实现或生产数据已修正。ARM-D-025 及既有“分类只向前生效、不调整历史有效分类”表述由本条引入本周例外，原账不可变约束继续有效。

## ARM-D-031：本机代码拆入 TimeWhereNative，云端与契约留在 TimeOnChrome

2026-09-25 PO 批准。`agents/` 与 `installer/` 的可发布源码、历史和 CI 迁入私有 `william-xia-cn/TimeWhereNative`；`contracts/`、`backend/`、`console/`、Runtime D1/R2 与生产发布流程仍归 TimeOnChrome。Guardian SSO、Child lifecycle、机器鉴权及现有资源地址不变。原生仓仅锁定版本化契约包及校验值，不从 TimeOnChrome 工作树引用源码；Cloudflare 生产写权限和 R2 latest 切换权不授予原生仓。迁移只在 BrowserBridge v3 已合并的干净 master 上进行，拆仓本身不部署、不执行 migration、不升级终端或改写历史账本。ARM-D-026 中“整体迁出 Runtime 模块”由本决策取代；网页＋应用未来合并统计仍由 TimeOnChrome 持有，双方原始账本各自权威。

## ARM-D-030：BrowserBridge v3 仅同步权威网页统计快照

2026-09-25 PO 批准。新版扩展不再发送网页 Segment；扩展仍按原算法结算网页用量，只将每日权威秒数、版本与最小区间证据传给 Service。Service 仅验证和去除本机会话与应用主账本的精确重叠，不能重算、重新分类或覆盖网页秒数。证据缺失、压缩或不一致时共享结果不可用，网页和应用各自读数仍可显示。Host 缺失或 Service 断开不影响网页原账及配额。当前周修正证据由设备鉴权只读分页接口提供；不修改原 Segment 或既有物化。ARM-D-029 仅作 v2 历史协议记录。

## ARM-D-029：BrowserBridge 健康 best-effort、落账镜像 durable at-least-once

状态：由 ARM-D-030 取代，仅保留旧客户端 v2 兼容与历史决策记录。

PO 于 2026-09-22 确认实施。BrowserBridge v2 使用独立 `TimeOnChrome.AppRuntime.BrowserBridge.v2` pipe，并把 `health/heartbeat|probe` 与 `ledger/settledUsageSegments` 分开：Health 可合并、跳过且不持久补发；Ledger 只接受已写入 TimeOnChrome 权威网页账本的裁剪 Segment，采用持久待发送状态、最多 100 条分批、逐项 ACK 和 Service Segment ID 幂等。v2 首次启用保存 `bridgeEpochId/enabledAtMs`，只补发启用后的未 ACK 数据，不回填此前历史。

Host 仍只负责 Native Messaging framing 与 pipe 转发，不保存账本、凭据或策略；预期 stdio/pipe 关闭必须静默退出。Service 将镜像写入和影子脏区间登记置于同一 SQLite 事务，提交后 ACK，由可恢复后台任务合并重叠区间并重建影子。TimeWhereMg 只显示裁剪健康摘要。该影子不执行配额扣减、阻止或进程终止，Service 也不向扩展发送策略、配额或控制命令。v1 保留一个兼容周期。

## ARM-D-027：Unpacked 联调与正式 managed 激活分离，BrowserBridge 前向修复

PO 于 2026-09-21 确认实施。日常 Native Host 联调使用 `native-host-development` 候选，不要求 Chrome 企业策略或真实 managed token。扩展必须同时确认部署 marker、稳定扩展 ID 以及 Chrome 自报 `installType=development`；只满足 marker 不得启用。该模式保留普通用户同意和既有本地绑定，禁止打包为 CRX、进入更新源或作为生产资产。正式 `managed` 包继续 fail closed，普通/CWS 包继续移除 Native Messaging。

Runtime 2.5.0 实机事件日志确认 `browserBridge` 循环在每次分钟心跳时失败。2.5.1 的命名管道客户端必须显式请求 `TokenImpersonationLevel.Impersonation`，使 LocalSystem Service 可以通过 `RunAsClient` 取得已验证用户 SID；Service 仍同时校验 Host 安装路径、session 和 SID。修复不改变网页/App Runtime 原始账、云端协议、配额或阻止行为。

## ARM-D-028：Service 重启接管既有 Session Agent，退出事件 fail-safe

2.5.1 原地升级后，Windows Restart Manager 未结束既有 Session Agent；旧进程继续持有同会话 mutex，新进程正常以 0 退出。Service 对该已退出进程设置 `EnableRaisingEvents` 时抛出 `InvalidOperationException`，未处理的异步退出链使 Service 以 1067 停止。2.5.2 必须先按安装路径与 session 精确发现并接管既有 Agent，只有无既有实例时才启动；启动／接管期间的进程退出竞态不得逃逸为 Service 未处理异常。退出回调只处理当前登记 PID，避免旧事件误删替代进程。升级、Service 重启和修复不得依赖人工结束孩子会话进程。

## ARM-D-026：通用 Native Host 与共享配额影子核算保持可拆仓边界

PO 于 2026-09-21 确认实施。浏览器本地桥统一命名为 `TimeOnChrome Native Host`，可执行文件为 `TimeOnChrome.NativeHost.exe`，新 Native Messaging Host ID 为 `com.timeonchrome.nativehost`。旧 `com.timeonchrome.guardian` 只作为一个 managed 扩展发布周期的兼容别名，两个 manifest 指向同一可执行文件；Host 不保存机器凭据、不直接访问 SQLite、不执行计时或配额裁决，只负责 Chrome Native Messaging 长度帧与 RuntimeService 版本化本地协议之间的转发。

`TimeOnChromeAppRuntime` Service 是本机共享配额影子核算的唯一执行者。Managed 扩展只能在网页 `UsageSegment` 已成功写入现有不可变本地账本后，发送不含 URL、域名、标题、账号、token 或浏览历史的只读镜像；Service 以已验证 Host 进程、Windows 会话和命名管道 ACL 标记来源并独立持久化。Host/Service 缺失、断开、超时或拒绝消息必须 fail open，不得影响网页落账、拦截、云同步或 App Runtime 账本。

首阶段只形成共享配额影子读模型：所有分类与总活跃时间共享，前台事实优先且同一时间区间只计一次；Chrome 前台且存在网页主 Segment 时网页覆盖 Chrome 容器，Chrome 前台无网页 Segment 时保留 Chrome 应用 Segment，其他前台应用覆盖重叠的网页强媒体 ACTIVE；PiP、后台媒体和所有辅助媒体不进入共享配额。网页待归类与应用未归类在影子视图中统一映射到 Composite。原始 Chrome/App Runtime 账本、当前配额执行、阻止行为、云端 API 和历史数据均不改变。

Host、Service 桥、共享协议、影子核算核心和安装资产全部归 `app-runtime-management/`；根扩展只保留协议消费者。未来拆仓时整体迁出 Runtime 模块，TimeOnChrome 只依赖固定版本 contracts，不得反向导入 Runtime Service/Host 源码。

## ARM-D-025：系统应用与游戏采用可覆盖的默认管理分类

PO 于 2026-09-20 确认实施。经云端精确规则确认的 `catalogGroup = systemTool` 默认管理分类为 `composite`；经可信产品身份确认的 `appType = game | gameLauncher | gameUtility` 默认管理分类为 `restrictedEntertainment`。该默认是系统级低优先级分类，不改变客观产品类型，也不新增目录分组或配额桶。

孩子对具体产品或技术身份的明确分类继续拥有最高优先级；已批准的更高优先级精确产品、系列或开发者规则也优先于系统默认。疑似游戏、同名第三方应用、普通应用和技术记录不命中默认分类。ARM-D-024 中“启动器/游戏工具不自动分类”和 ARM-D-015 中“系统应用默认未归类”的对应部分由本决策取代。

Worker 查询立即以新默认投影目录；机器端只在下一次完整 inventory 生成新的不可变 App Policy 版本、设备实际 ACK 并应用后，才按新分类切段和向前落账。历史 Segment、既有配额结果和分类历史不重写；离线设备继续使用 last-known-good。

## ARM-D-024：游戏类型与系统应用由现有强身份精确补全

PO 于 2026-09-20 确认实施。Runtime-owned 产品知识增加 `gameUtility` 客观类型；`game`、`gameLauncher` 与 `gameUtility` 均进入游戏展示组，但只有真正的 `game` 继续获得“建议归为受限娱乐”的默认建议。启动器和游戏工具不会因此自动分类或改变配额。孩子对具体产品的明确分类继续优先，例如游戏明确归为复合后仍显示在游戏组且只扣复合配额。

EA app 与完美世界竞技平台使用当前生产盘点已经上传的精确 `productKey`，Game Bar、Solitaire & Casual Games 与 XBOX 使用精确 Microsoft Store `distributionKey`；EA 的两个安装产品键归入同一确认产品。显示名称、Microsoft 发布者或客户端自报类型均不能命中。EA 与完美世界的版本相关产品键仅作为本轮即时云端修正，后续必须以 signer 或稳定 launcher identity 替代。

用户可见分组名称由“系统工具”统一为“系统应用”，wire value `systemTool` 保持兼容。反馈中心、命令面板、天气与录音机以经审核的精确 package family 加入系统应用；技术组件仍只进入系统管理的只读技术记录。本决策不升级 Agent、不重新扫描、不执行 migration，也不修改分类、账本、历史 Segment 或配额。

## ARM-D-023：应用目录与未归类记录共享单次只读投影

PO 于 2026-09-20 确认实施。Runtime Worker 的应用目录和未归类记录属于同一 30 天产品投影，不得由 `app-classification-records` 重复扫描 Segment 后再嵌套执行完整 `app-catalog`。`app-catalog` 在一次 v2/legacy Segment 读取及一次 inventory/策略投影中同时返回兼容目录和 `classificationRecords`；旧 `GET /v2/module/app-classification-records` 保留，但直接复用同一投影结果，不再执行额外原始扫描。

Runtime Console 优先消费 `app-catalog.classificationRecords`，仅在旧 Worker 未返回该字段时调用旧接口。该修复只消除重复 D1 读取与内存聚合，不改变 30 天窗口、未归类筛选、区间并集、actionable/technical 判断、分类、账本、配额或历史数据。测试等级为 Worker read model + Console 网络兼容：只运行目录／分类记录聚焦测试、backend typecheck、Console 网络测试、Wrangler dry-run 和 `git diff --check`；不运行 Windows、macOS、WiX、账本状态机或 migration 测试。

## ARM-D-022：应用目录分组统一折叠并按当前视图惰性渲染

PO 于 2026-09-20 确认实施。五个孩子管理分类内的“普通应用、游戏、系统工具”三个目录分组都必须支持展开与折叠，顺序继续固定为“普通应用、游戏、系统工具”；未归类目录中的“已处理历史”也使用相同的惰性折叠语义。普通应用默认展开，游戏和系统工具的展开状态由用户控制；搜索命中某组时临时展开该组，清除搜索后恢复用户选择。折叠不是只做视觉隐藏：折叠组不得创建产品行和分类按钮 DOM，展开时才渲染，以便长清单管理。

Runtime Console 只渲染当前顶层页面；首次数据加载把互不依赖的目录、策略、分类记录与使用统计并行请求。该性能修正不得改变 Worker 查询、目录分组权威、分类保存、配额、账本、Agent 或安装包。测试等级为 Console 行为／布局：只运行 Console 聚焦测试、桌面与移动目视验证、`git diff --check`；明确排除 Worker、Windows、macOS、WiX、账本和 migration 测试。

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
