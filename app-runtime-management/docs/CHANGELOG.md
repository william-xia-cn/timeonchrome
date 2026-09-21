# App Runtime Changelog

## [ARM-D-027 / Windows 2.5.1 候选] — 2026-09-21（本地实现与构建完成，待实机联调）

- 修复 2.5.0 BrowserBridge 管道客户端未显式请求 impersonation、Service 无法稳定取得用户 SID 的问题。
- 增加与正式 managed policy 分离的 unpacked Native Host 开发联调模式；该模式禁止打包和发布。
- 不修改原始账本、云端 API、配额、阻止、Worker、Pages、Guardian 或生产数据。

## [ARM-D-026 / Windows 2.5.0 候选] — 2026-09-21（本地实现完成，待发布闸门）

- 将 guardian 专用桥升级为通用 `TimeOnChrome Native Host`，新 ID 为 `com.timeonchrome.nativehost`，旧 ID 作为兼容 manifest。
- RuntimeService 增加受约束浏览器桥和独立网页 Segment 镜像存储；扩展只在现有账本写入成功后发送隐私裁剪事实。
- 增加不接管现有配额的共享配额影子核算：前台优先、网页覆盖 Chrome 容器、未归类统一 Composite、媒体排除。
- Host/Service/installer 全部保留在 Runtime 模块，根扩展只消费版本化协议，为未来独立仓库拆分保持单向依赖。
- 本地 contracts、Host/Service 编译、影子核算、扩展持久化后通知、Managed/CWS 打包边界与 WiX 结构测试通过；尚未生成或安装 2.5.0 包。

## [ARM-D-025 / 系统应用与游戏默认分类] — 2026-09-20（本地实现完成，待合并发布）

- 系统应用默认归为复合；confirmed 游戏、游戏平台与游戏工具默认归为受限娱乐。
- 家长单项明确分类继续最高优先，疑似游戏、普通应用和技术记录不自动分类。
- 新默认随下一次完整 inventory 冻结为新 App Policy 版本并由设备实际应用后向前生效；历史 Segment 和既有配额结果不追溯修改。
- Worker 聚焦测试 4 项、默认策略冻结与上传校验、Console 知识规则测试、backend typecheck、Wrangler 4.127.1 dry-run 和 `git diff --check` 通过；按 ARM-D-019 未运行 Windows、macOS、WiX、migration、账本状态机或视觉布局测试。

## [Contracts 1.9.0 / ARM-D-024] — 2026-09-20（生产已发布）

- 新增 `gameUtility` 客观类型并补齐五个游戏组对象；EA 两个强身份合并为一个确认产品。
- 用户可见“系统工具”统一为“系统应用”，新增反馈中心、命令面板、天气和录音机精确规则。
- 不升级 Agent、不重新扫描、不执行 migration，不修改分类、配额、账本或历史 Segment。
- Contracts 24 向量、Worker 3 项聚焦回归、Windows Core 3 项聚焦测试、Console 桌面/移动目视测试、typecheck、Wrangler dry-run 与 `git diff --check` 通过；共享 contract 的真实消费者由 CI 补验并通过，WiX、账本与 migration 测试未运行。
- PR #42 合并 SHA `ca5e63e`；生产 workflow `35470498809` 仅发布 Worker `bacbf8b5-3798-48fb-aa7e-be46b3e2ac88` 与独立 Pages `329d9642-e99c-4f53-befc-0f05cc126182`，无 migration。线上九个目标分组、EA 去重、Game Bar 非自动分类及 200/401 smoke 均通过。

## [ARM-D-021 / Windows 内置系统工具规则补全] — 2026-09-20（生产已发布）

- 使用六个经审核的精确 package family 将截图工具、手机连接、时钟、照片、画图和相机投影为系统工具。
- family 规则同时覆盖产品容器和 `!App` 启动入口；容器仍只进入技术记录，不产生重复可管理产品行。
- 不升级 Agent、不重新扫描，不修改 Console、D1、管理分类、配额、账本或历史 Segment；合并后只部署 Runtime Worker。
- Worker 聚焦测试 2/2、backend typecheck、Wrangler 4.127.1 dry-run 和 `git diff --check` 通过；按 ARM-D-019 未运行无关测试。
- PR #39 合并 SHA `6f8eed57` 的最小 CI 通过；生产 workflow `35465663873` 仅发布 Runtime Worker `84db0516-efb8-42a4-991a-9002c73f037d`。
- HornburgXW 验收确认六个目标各自在系统工具出现 1 行，普通应用和游戏中均为 0 行；Pages、Guardian、R2、D1、分类、配额和账本未改变。

## [ARM-D-020 / 云端目录精确规则热修] — 2026-09-20（生产已发布）

- Steam 使用稳定 HKLM/HKCU 安装产品键确认为游戏平台／启动器；Windows Terminal 使用精确包身份进入系统工具。
- Bing News（资讯）保持普通内容应用，系统工具边界不扩展到随 Windows 提供的内容应用。
- 应用目录默认顺序调整为普通应用、游戏、系统工具；不升级 Agent、不重新扫描，也不修改分类、账本、历史 Segment 或配额。
- PR #37 合并 SHA `264dfd5c` 经最小范围 CI 通过；生产 workflow `35463456925` 发布 Worker `a2f63c8b-03ba-4c98-acc7-620f3719f494` 与独立 Pages `b3c01fab`，真实 HornburgXW 目录验收通过。Guardian、主 Pages、R2 和 D1 schema 未变化。

## [ARM-D-019 / 按变更范围测试与 CI 节流] — 2026-09-20（本地验证通过）

- 项目任务在实现前必须声明变更等级、受影响子系统、本地测试、CI、发布 smoke 和明确排除项；同一 SHA/产物的证据可以复用。
- Runtime CI 增加变更分类器，将 Contracts/Worker、Console、Windows、Installer、macOS 与 release-config 独立路由；纯文档和无关 PR 只运行轻量 diff 与汇总 gate。
- 生产 workflow 改为要求精确 master SHA 已通过对应 CI，再执行依赖构建、部署和资源 smoke；删除重复 Worker 测试/typecheck。
- 路由与 gate 状态固定测试、release-config、workflow YAML 解析、边界检查和 `git diff --check` 通过；未运行无关产品测试。
- PR #36 首轮 CI `35462027108` 在约 20 秒内完成 changes、release-config 与汇总 gate；五个产品/平台 job 全部跳过。仓库此前没有 master branch protection，首次建立唯一必需 gate 等待单独授权。

## [Contracts 1.8.0 / ARM-D-018] — 2026-09-20（生产已发布）

- 目录新增云端权威的游戏、普通应用和系统工具分组；技术记录保持只读独立。
- 系统工具采用精确受控身份，增加获取帮助和设置；confirmed 游戏与游戏平台进入游戏组，疑似游戏仍留在普通应用。
- 仅改变目录 read model 与独立 Runtime Pages，不改 Agent、D1 schema、账本、分类或配额。
- Contracts、Worker 54/54、Console 聚焦测试、TypeScript、Wrangler dry-run、边界检查及桌面/移动视觉验证通过。
- PR #34 经跨平台 CI 通过后合并为 `master@a89722d`；生产 workflow `35460662741` 仅发布 Runtime Worker `b6828e42-94c0-45ae-9b9c-30073bddfb36` 与独立 Runtime Pages deployment `b61a169a-0df0-4b5d-8ff0-eb3d097d8e9d`，未执行 migration，未部署 Guardian、主 Pages 或 R2。
- 线上只读验收确认游戏组置顶、普通应用展开、系统工具折叠及搜索自动展开；“获取帮助”和“设置”均显示为“系统工具 · 未归类”，管理分类、历史账本和配额未改变。

## [Contracts 1.7.0 / Windows 2.4.0] — 2026-09-18（本地候选已验证，未发布）

- inventory v2 增加 `packageContainer` 语义、`distribution-ea / distribution-ubisoft / distribution-gog` 来源，并将 `sourceResults` 上限统一为 16；旧 2.3.x payload 保持兼容。
- Windows 2.4.0 将从 EA、Ubisoft、GOG 的发行器注册信息与自有本地清单提取公开稳定产品 ID；未安装、单项损坏和来源不可读分别结算，不上传路径、账户、完整清单或启动参数。
- Contracts 23 向量、Worker 53/53、Windows 130/130、TypeScript、Wrangler types/dry-run 与 WiX MSI/Burn 构建通过；Burn 为 118,768,007 bytes / SHA-256 `cc8ef03bf53f15336683d97fcd3672c8cc13042eda4734a97731584c9cd4e099`，MSI 为 60,383,584 bytes / SHA-256 `20dc7cb8fcc65cab6ba7c8c350190a07e30691413955a4ab67ef957e40c477d6`。
- 本阶段只构建和验证内部未签名包；HornburgXW 升级、不可变 R2 上传与 `latest.json` 切换继续单独过闸。

## [ARM-D-017 / 产品目录云端纠错] — 2026-09-18（本地候选）

- MSIX/package family 改为技术容器，可信 AUMID 可启动入口独立投影；LibreOffice 等可靠 Win32 套件聚合保持不变。
- 补齐便笺、入门、Windows 备份和单击以执行的系统应用规则；产品安装事实补齐零变体产品的机器/账户覆盖数。
- Aimlabs/Apex 硬编码迁入 Runtime-owned 版本化 JSON，加入当前核实的 Steam 游戏；`steam:228980` 固定为技术组件。
- Console 将未知类型系统应用显示为“系统应用 · 未归类”，装饰首字不参与辅助技术或文本选择。
- Worker 53/53、Contracts 23 向量、TypeScript、Wrangler types/dry-run、Console 聚焦测试及桌面/移动视觉验证通过；无 migration、Agent、Guardian、R2 或历史数据变更。

## [Windows 2.3.1 / 本地完整盘点来源上限] — 2026-09-18（生产已验收）

- 2.3.0 的 Session Agent 会生成包含 7 项来源结果的完整扫描，但 Service 本地 `ValidateScan` 仍保留最多 6 项的旧限制；消息在写入 inventory outbox 前即被拒绝，因此部署兼容 Worker 后也没有可自动重试的批次。
- 2.3.1 将 Service 本地固定来源结果上限对齐为 8，并以 7 项真实来源回归锁定；不改变扫描内容、来源级 fail-closed、历史 inventory、UsageSegment 或分类/配额语义。
- 2.3.0 不覆盖重打；2.3.1 作为内部未签名前向修复，原地升级必须保留机器身份、配对、策略、SQLite、outbox 和历史账本。
- 聚焦测试 50/50、Windows 全量 124/124、Service/Agent/Manager 版本回读与 WiX MSI/Burn 编译通过；PR #30 三组 CI 全部通过并合并为 `master@c407d0f`。
- 受控生产机器已原地升级且无需重新配对；Service 2.3.1 在线、heartbeat 正常、outbox 清空。真实完整扫描包含 387 个产品、356 个变体及 7 个成功/带警告成功来源。
- Aimlabs `steam:714010` 与 Apex Legends `steam:1172470` 已在生产目录确认为游戏，同时保持管理分类未归类和受限娱乐仅建议语义。
- 内部未签名 Burn 为 118,739,813 bytes / SHA-256 `3109d6bbd147f5bfba88549a240dae42e84e724aa86bd1baef724d2df7b17563`；R2、Worker latest 和版本化下载回读一致，`latest.json` 已切换至 2.3.1。

## [contracts 1.6.1 / 发行来源上传兼容] — 2026-09-18（生产 Worker 已发布）

- 真实 2.3.0 验收发现 Agent 新增 `distribution-steam`、`distribution-epic` 且完整扫描包含 7 项来源结果，但 1.6.0 Contract/Worker 仍只允许旧来源和最多 6 项，导致新盘点整体返回 400 并在本地重试。
- 1.6.1 将两个发行来源加入固定来源集合，把完整扫描来源上限提高到 8；旧客户端、旧来源及现有来源级 fail-closed 对账语义保持不变。
- 兼容 Worker 已发布为 `c3a29505-b377-4e06-990c-9470662ee38d`，但后续真实验收发现 2.3.0 Service 在 outbox 前还有同类 6 项上限；因此 Worker-only 结论被 2.3.1 前向修复取代。
- Contracts 23 向量、Worker 51/51、两端 typecheck、Guardian integration、模块边界、Wrangler dry-run 与 `git diff --check` 已通过。

## [contracts 1.6.0 / Windows 2.3.0 / 自动产品类型识别] — 2026-09-18（本地候选已验证）

- 将客观产品类型与孩子管理归类永久分离；类型不被家长覆盖，配额只按最终管理分类扣减。
- Windows 增加 Steam、Microsoft Store、EA、Epic、Ubisoft、GOG 的稳定发行身份采集；Worker 以版本化产品知识确认类型，名称和客户端自报只能形成建议。
- 默认“游戏 → 受限娱乐”保持未启用建议，家长批准后才自动生效；具体产品明确分类始终优先。
- Application Knowledge v2 继续接受 v1；复用 JSON 证据存储，不新增 D1 migration，不重写历史 Segment。
- Contracts 23 向量、Windows 122 项、Worker 51 项、Console 功能及桌面/移动视觉、TypeScript、Wrangler types/dry-run、WiX MSI/Burn、敏感字段和边界审计均通过。
- 内部未签名 2.3.0 候选已生成：Burn 118,773,405 bytes / SHA-256 `955c8f908935ac28f2c362efb03d4e067fb608dc91380f8d43f99400b6187415`；MSI 60,375,392 bytes / SHA-256 `ff734912b1b237707df436d2a3a221bb26161c55c4a5092abc6ed5034780c6f4`。未安装、未上传 R2、未切换 latest、未部署 Worker/Pages。

## [系统应用云端权威投影修正] — 2026-09-18（生产已发布）

- 普通应用、系统应用和技术记录改由 Runtime Worker 基于可信 `packageId` 统一投影；客户端来源字段仅作 advisory evidence。
- 旧 Agent 2.2.3 无需升级即可获得系统应用分组；无 migration，不改写 inventory、账本、分类或配额。
- `master@6e607d9` 已只部署 Runtime Worker `6eac7a4b-ce8c-4f4f-b1ac-bc3e862e105f`；health 200、未认证 catalog 401，无 migration，Pages、Guardian 和 Agent 未部署。
- R2 latest 已恢复为 2.2.3；Burn 118,729,417 bytes / SHA-256 `d665e227d4234d47337edcb04169d57d50e2817b72c1c606a3f7076d365eef8e`，MSI 60,363,104 bytes / SHA-256 `9238c03fd8b4f3795069e2fdb08372543c2893bd7d24bd3b4c849428488ccca3`。2.2.4 不可变对象保留为 withdrawn/internal-history。
- Computer Use 线上验收确认 HornburgXW 无需升级即显示普通应用 106 个、系统应用 3 个；快速助手、计算器和记事本进入系统组，Microsoft 365 保持普通应用。
- Worker 50/50、contracts 23 vectors、Contracts/Worker typecheck、generated binding types check、Wrangler dry-run 与 `git diff --check` 通过。

## [Windows 2.2.4 / contracts 1.5.0 / 系统应用分组] — 2026-09-18（生产已发布，真机待升级）

- 增加普通应用、系统应用与技术记录的正交投影；系统应用仍可分类和配置配额。
- Windows 仅使用强平台证据识别系统应用，名称、路径或 Microsoft 发布者不能单独命中。
- 应用管理在五分类内同页双分组；系统组默认折叠、搜索命中自动展开。
- 无 D1 migration，不修改账本、历史 Segment 或配额计算。
- Contracts、Worker 50 项、Windows 117 项、Console 桌面/移动视觉、边界检查、TypeScript 和 Wrangler dry-run 已通过。
- 内部未签名 2.2.4 候选已生成：Burn SHA-256 `cd4a3e03d4f61a6d86113d835500613e0243634edc04e1ec617c1728abb58181`，MSI SHA-256 `edc6a18dcc64adecf132ae4ff36c74890b769a8c27b80ef0dc82efadd3425293`；继续标记 `BLOCKED_BY_AUTHENTICODE_SIGNING`。
- `master@6b5f812` 已按兼容 Worker → 独立 Runtime Pages → Windows 2.2.4 顺序发布：Worker `477649a6-cfc6-482b-b136-27df6211ef2e`、Pages `32c70100-f704-48a9-b19c-271786054cd9`，R2 三个不可变对象和 Worker 下载路由回读一致；无 migration。

## [contracts 1.4.0 / 游戏候选与 SSO 孩子上下文] — 2026-09-18（本地候选）

- `Aimlabs`、`Apex Legends` 以规范化精确名称显示高置信游戏候选和受限娱乐建议；不自动改变分类、配额或历史账本。
- 主控制台把当前孩子写入账户归属校验后的签名 SSO ticket；Runtime 兑换响应携带初始孩子，新 ticket 即使遇到旧 browser session 也必须兑换并替换，随后撤销旧会话。
- 旧 ticket、旧 session 和页面内主动切换继续兼容；非法或外部账户孩子 fail closed。
- 本条尚未合并或部署，生产行为不变。

## [产品目录同名歧义与孤立入口热修复] — 2026-09-16（生产已复验）

- 真机扫描证明 LibreOffice 已按一个产品、多变体投影，但 `Create React App Sample` 的 package、卸载注册和 hosted 入口缺少共同强身份，仍可能形成重复主产品。
- 同平台、同规范化名称的多个未确认安装产品只合并为一个只读歧义技术记录；名称仅用于降级和展示聚合，不构成产品确认或分类依据。
- 不删除原始产品/变体、不改历史账本；本轮只调整 Runtime Worker read model，无 migration、Agent 或 Pages 变更。
- Worker/D1 回归 40/40、TypeScript、binding types 和 Wrangler dry-run 通过；PR #21 合并为 `master@1608146`，Runtime Worker 已更新为 `c7070f63-6a19-494b-bfb5-066758ba8435`。
- 真实 catalog 已确认 `Create React App Sample` 只保留一条技术记录、LibreOffice 只保留一个主产品和 7 个变体；同时暴露同名 Start Menu 主入口在缺少父产品键时仍可能形成第二条主行。
- 对“唯一安装产品 + 同名孤立非产品入口”采用安全降级：保留安装产品可管理，孤立入口只作为可能的产品变体进入技术记录；不以名称确认关联，也不删除原始发现事实。
- 新增 `POSSIBLE_PRODUCT_VARIANT` 固定回归；Worker/D1 41/41、TypeScript、binding types 与 Wrangler dry-run 通过。
- PR #22 合并为 `master@a2fe4da`，生产仅更新 Runtime Worker 为 `be61471f-89ff-4320-8e00-12212128477c`；health 200、未认证 catalog 401，未部署 Pages、Agent、Guardian、R2，也未执行 migration。
- HornburgXW 真实目录确认 BlueJ、Node.js、Steam、LibreOffice 各仅 1 个主产品，`Create React App Sample` 不进入主目录且只保留 1 条技术记录；技术记录继续保存来源/变体审计事实，不参与产品目录计数。

## [Windows 2.2.3] — 2026-09-16（本地候选已验证）

- 修复 Session Agent 产品级盘点使用 schema v4、但 RuntimeService 仅接受 schema v3，导致 2.2.2 真机盘点未进入本地 outbox/云端新表的问题。
- Service 将兼容接收 inventory schema v3/v4，未知版本仍拒绝；不修改 inventory payload、Worker、D1、UsageSegment、时长或配额。
- HornburgXW 的 2.2.2 程序、Service/Agent 和配对均正常，升级前的历史账本保持不变；2.2.3 必须以新表出现完整扫描为验收条件。
- Windows tests 110/110、WiX MSI/Burn 构建与版本检查通过；内部包仍为未签名候选，生产验收尚未完成。
- `master@27bfba7` 的 2.2.3 已发布并原地升级；Burn SHA-256 `d665e227d4234d47337edcb04169d57d50e2817b72c1c606a3f7076d365eef8e`，MSI SHA-256 `9238c03fd8b4f3795069e2fdb08372543c2893bd7d24bd3b4c849428488ccca3`。HornburgXW 完整扫描 385 个产品、356 个变体并收到完成标记。

## [Windows 2.2.2 / contracts 1.3.0] — 2026-09-16（云端已发布，HornburgXW 待升级验收）

- ARM-D-014：建立安装产品、应用变体和技术记录三层目录；套件默认产品级聚合，显式拆分后变体才独立管理。
- inventory v2 按来源区分完成、带警告和失败；成功来源可独立做缺失对账，v1 客户端继续兼容。
- additive 0010 与 catalog 增量字段不改写旧 inventory、UsageSegment、历史时长、分类或配额键。
- Windows 106/106、Worker 39/39、contracts 23 组共享向量、Console、binding types、Wrangler dry-run、WiX、真实 macOS 15 CI 和桌面/移动视觉验证通过。
- PR #18 合并后，受保护运行 `35080465621` 已应用 0010，发布 Runtime Worker/Pages；Guardian 和主 Pages未变化。历史主/媒体账本行数与总时长在 migration 前后完全一致。
- 干净 master 重建的 2.2.2 Burn SHA-256 为 `85cc679f8aa61d175f50530fbc7bf7c51904641e3cc1638df14ce15a89db60ca`，MSI SHA-256 为 `6946c4e90bc087cb2ba4087e98db126e12d993c994059c1fd720df6924d3a6aa`；R2 回读一致并已切换 latest，继续标记 `BLOCKED_BY_AUTHENTICODE_SIGNING`。
- HornburgXW 尚未从 2.2.1 升级；真机扫描、LibreOffice 单产品和技术记录清理仍是最终验收项。

## [生产 workflow 空迁移闸门修复] — 2026-09-16

- Runtime D1 已无待执行 migration，但 workflow 的 `expected_runtime_migrations` 默认值仍固定为已执行的 `0008_runtime_application_knowledge.sql`，导致无迁移发布在资源写入前 fail-closed。
- 默认预期改为空；未来有待迁移文件时仍要求显式输入精确文件名，并在 `apply_runtime_migrations=true` 时才允许应用。
- PR #16 合并为 `master@a041c454`，受保护运行 `35062450944` 成功；Runtime Worker 更新为 `3e5f5784-80a7-462d-ad7b-5bde527a9f60`，Runtime Pages 更新为 `5b757653-8e0f-4531-bea3-3f5f6ed9082f`。
- 本次未执行 migration，Guardian Worker、主 Pages 和 R2 latest 未部署；health 200、未认证目录 401，稳定与不可变 Runtime Pages 回读 200 且包含产品/技术记录分流界面。

## [ARM-D-013 产品应用投影] — 2026-09-16（Runtime Worker/Pages 已部署）

- 将家长可管理产品与原始技术进程身份分层；五分类目录只接收可靠产品/主应用，技术记录只读审计且不能分类。
- 不修改原始 Segment、历史时长、配额键、数据库 schema 或客户端安装；完成状态以任务板测试与目视证据为准。
- Worker/D1 38/38、backend typecheck、binding types、Wrangler dry-run、Console 聚焦测试及三组桌面/移动视觉流程通过；模块/Extension 边界与 `git diff --check` 通过。Runtime Worker/Pages 已由受保护 master workflow 发布；无 migration、客户端升级或真机数据修改。

## [Windows 2.2.1 / contracts 1.2.0] — 2026-09-16（本地修复与包验证，未安装/发布）

- ARM-D-012：优先读取应用列表/manifest 友好名称；隐藏包入口标为组件，弱安装线索标为候选。Registry DisplayIcon 不再冒充主程序证明；同身份来源合并保留可靠证据，不按同名、同开发者或包族强制合并。
- 安装与旧运行身份通过已验证 AUMID/binary 关联展示；共享二进制的多个可见 AUMID 保持独立。原始 runtimeIdentity、历史账本、分类和单应用配额键不改写。
- 增加目录范围：主要应用、安装未使用、原使用证据和完整发现；未使用的已安装应用也可归类，组件/候选可达。保留五目录和知识/规则独立面板。
- scan 的全量批次和完成标记通过独立事务/outbox/ACK；缺失对账与完成标记同一 SQLite 事务并先入 outbox。失败来源、未登录用户、旧客户端、中断或缺批次不得称完整或推断卸载。新增 additive 0009 仅在本地测试，不应用生产。
- Windows 95/95、共享黄金向量 23 组、Worker 38/38、Schema/类型/binding/dry-run 及桌面/移动 mock 目视验证通过；Swift 编译和共享向量已在 macOS 15 CI 实际执行通过。
- 最终代码 `6e8618f97ace90669e1045cd8bc71c8a557ce263` 的跨平台 CI 35002959346 全部成功：https://github.com/william-xia-cn/timeonchrome/actions/runs/35002959346 。后续纯文档收口不改变受测代码，不触发重复生产部署。
- 包查询显式 UTF-8 并增加受控中文输出测试；1001 个未知安装项不占用默认未归类策略投影容量，超过 1000 个非默认有效投影时保持旧策略并结构化报错。
- 最终自包含 MSI/Burn 零警告/错误；固定升级身份、486 文件及程序集/安装器 2.2.1 版本回读通过。Burn SHA-256 `1df0d8f3b23fe82c241bd6eef761d329186d293812b4bbeab26d4e6aa48115f5`；MSI SHA-256 `0130ac6cca5ec50726a60ed5e83b8c9e46c9cb902b7760f34ea42cb9eaf31e7e`。内部未签名状态仍为 `BLOCKED_BY_AUTHENTICODE_SIGNING`。
- 生产配套后台/0009/Console 必须先行，新客户端后升级；本轮不安装、不采集或上传家庭夹具外数据、不发布 R2/latest、不改 Guardian/Santa/Extension。

## [Windows 2.2.0] — 2026-09-15（本地客户端包验证完成，未安装/发布）

- 为已合并的 ARM-D-011 应用发现、分类规则与安装清单同步代码设置独立内部版本 2.2.0；统一安装器默认版本和 Service fallback，保持 machine-scope UpgradeCode。
- 仅准备 Windows 自包含 MSI/Burn 并验证，不升级当前机器、不运行或上传家庭盘点、不部署云端或切 R2 latest。测试与包核对结果在完成后记录，内部包仍未签名。
- 明确 2.2.0 版本参数的 Windows 测试 90/90；MSI/Burn 零警告/错误，隔离 package-probe 通过；六个程序集、MSI 486 文件及关键文件版本、固定 UpgradeCode 和 Burn 数值版本通过回读。
- Burn 118,722,089 bytes / SHA-256 1576a1840d5f74b91177aa1a7c0d9d0bd6b236067749d2ba722489de9bc087f0；MSI 60,342,624 bytes / SHA-256 b4bb5680a750ded4cee1004e3594b1a26a8e9056d818fc95c72995864c9388d4。manifest 一致，未上传 R2。
- 首次构建磁盘不足失败；仅经授权清理可重建产物后第二次成功。Burn 首次展示字符串断言失败由实际数值版本 2.2.0.0 回读澄清，不掩盖失败或声称真机验收通过。

## [D-092 生产边界收尾] — 2026-09-15

- PR #8 合并后的 `origin/master@d8f79ec` 与 contract `1.0.0` 完成 Runtime `0006/0007`、独立 Runtime Pages、SSO 和 Guardian adapter 首轮发布。
- 真实浏览器验证 256-bit sessionStorage-only 会话、fragment 清除、新会话 480 分钟、退出 `204`、重新兑换 `201`、无票据新标签及旧地址 launch；生产数据库会话生命周期均为 28,800,000ms，固定 session 回归通过。
- 仅复部署主 Pages 至 `3876077d`，Runtime Worker `27e01201`、Runtime Pages `da630a11`、Guardian Worker `b971221b` 及 R2 latest `2.0.6` 均未变化。
- 保存不可变生产 manifest；本次收尾不改业务代码、不再部署 Runtime/Guardian/R2、不执行 migration。完整终端健康及设备详情同步/Tamper 展示问题留待独立诊断。

## 从根 Changelog 迁入的历史发布记录
+## [App Runtime 2.1.1] — 2026-09-15（本机已安装，未部署）

- WiX MSI 在公共桌面增加全用户 `TimeWhereMg` 快捷方式，目标为正式安装目录中的 `TimeOnChrome.AppRuntime.Manager.exe`；开始菜单与 HKLM 托盘自启动保持不变。
- 保持既有 machine-scope UpgradeCode 和安装位置；William 本机已从 2.0.6 原地升级，未重新配对，在线机器身份、策略、SQLite/outbox 行为和历史云端关联保持正常。
- Windows 测试 75/75 通过，MSI/Burn 构建 0 warning/0 error；Computer Use 已验证公共桌面快捷方式打开正式安装目录中的 Manager、在线/已配对状态、策略应用及隐藏到托盘，Service 为 Automatic/Running 且当前会话只有一个 Session Agent。
- 仅完成本地构建、安装和验收，未发布 R2、Worker、Pages，未执行 migration；内部包继续为 `BLOCKED_BY_AUTHENTICODE_SIGNING`。

## [App Runtime 2.1.0] — 2026-09-13（本地开发）

- 将安装后的 WPF Setup 升级为托盘常驻的 `TimeWhereMg` 本机服务管理应用；RuntimeService、安装身份和云端协议保持兼容。
- 标准账户只读受管理、Service 与最近同步摘要；管理员操作逐次 UAC 提升，支持配对、立即同步、Service 启停/重启、MSI repair 和一次性卸载码。
- 增加独立只读状态 pipe 和真实子系统健康时间；停止/重启前切段、持久化账本/outbox 并记录审计，Service 保持 Automatic，重启 Windows 后恢复。
- 本地诊断只显示健康摘要和稳定错误码，不暴露逐条日志或敏感标识。内部包仍为 `BLOCKED_BY_AUTHENTICODE_SIGNING`，本轮不部署生产环境。
- Computer Use 目视验收修复管理员窗口标题栏关闭后隐藏进程残留，以及首次显示时按钮自动焦点造成的顶部滚动偏移；标准窗口保持托盘常驻，管理员窗口关闭后释放单实例锁。

## [App Runtime Console D-087] — 2026-09-03

- **应用管理目录**：使用学习、复合、受限娱乐、黑名单和最近 30 天已使用未归类五个孩子级目录；普通目录独立显示应用、Windows 和 macOS 数量，右侧保持无来源二级表格的平面列表。
- **加载失败状态**：初次未登录或 Runtime 数据加载失败时隐藏业务骨架，显示返回家长控制台、重新加载和本地 `?mock=1` 预览说明。
- **生产 Pages**：提交 `72a58b0` 对应 deployment `3164aad7` 已发布；部署域名和稳定域名 `/app-runtime/` HTML/JS 回读 HTTP 200。未部署 Worker、未执行 migration，也未修改生产数据。
- **生产依赖修复**：D-088 首轮仅发布 Pages，真实登录页面因生产缺少 `0005` 与新 Runtime 路由而返回 `Route was not found`；现已应用 additive `0005_runtime_app_management.sql` 并部署 Worker `135c57b8-ed3a-4fd6-8f61-d862d8a92ecd`。真实 HornburgXW 页面已恢复统计、五目录和应用明细。

---

## [App Runtime 2.0.6] — 2026-09-03

- **响应式 Setup**：移除固定 `620×590` 与禁止缩放限制；窗口按当前 Windows 工作区约束初始/最大尺寸，主内容仅垂直滚动，底部操作栏固定可见。
- **卸载表单可达性**：展开“卸载这台电脑…”后自动定位到一次性卸载码、输入框和“授权并卸载”按钮；不改变代码生成、授权、管理员提升或 Named Pipe 鉴权流程。
- **升级边界**：2.0.5→2.0.6 原地升级保留 HornburgXW 配对、机器身份、策略、SQLite、outbox 与历史记录；内部包仍未签名并保持 `BLOCKED_BY_AUTHENTICODE_SIGNING`。
- **内部发布**：William 已原地升级，Service 与单一 Session Agent 恢复运行；R2 latest 已切换 2.0.6。Burn 为 118,513,641 bytes / SHA-256 `2e78fe219dbf51c1df1d699b6776f3f9047069dcee2927ae10c575cbae7808f7`，MSI 为 60,194,894 bytes / SHA-256 `d0b6a18f354d965358e4cfd38880e0f6e8b64243143510aaa3f8a7b94468d7c4`，R2 与 Worker 下载回读一致。

---

## [App Runtime 2.0.5] — 2026-09-02

- **首次策略收敛**：机器首次上报本机用户并创建默认 assignment 时推进一次 desired policy version，使用户发现前缓存的空策略 ETag 失效；重复上报不重复推进。
- **Windows 用户名编码**：WTS 用户名和域名查询固定使用 Unicode API，避免把 ANSI 字节按 UTF-16 解码后上传乱码显示名。
- **升级边界**：沿用既有 machine credential、机器 ID、SQLite、outbox 和 HornburgXW assignment；不重新配对或改写历史统计。
- **统计可见性**：accounting v2 查询补充按小时主账本并集；家长页合并旧统计与新主账本，修复 D1 已收到 Segment 但页面仍显示零的问题。
- **内部发布**：William 真机原地升级并保留 HornburgXW 机器身份；Runtime Worker `9f24691d-5993-4c48-a8ae-557f77bbbdc9`、Pages `a281c6e5` 与 R2 2.0.5 已发布并回读验证。包仍未签名，继续标记 `BLOCKED_BY_AUTHENTICODE_SIGNING`。

---

## [App Runtime 2.0.4] — 2026-09-02

- **控制管道修正**：Setup 明确使用 impersonation token 连接管理员控制管道，使 Service `RunAsClient` 能验证真实调用者。
- **Service 自恢复**：常驻控制、会话、策略、上传和 heartbeat loop 的意外异常写入 Windows Application Event Log，并经退避重启，避免 SCM 显示运行但控制面已静默退出。
- **状态口径**：只有控制管道实际响应才视为 Service 可用；本版本在机器配对与 R2 切换前保持内部候选。

---

## [App Runtime 2.0.3] — 2026-09-02

- **双阶段迁移预检**：Burn 先以 elevated machine probe 检查其他真实 Windows 用户的 1.x 冲突，再以原交互式用户运行 CurrentUser DPAPI/outbox/retire；不以跳过权限错误换取安装成功。
- **失败可解释性**：注册表与 profile 权限异常转换为明确非零退出和用户提示，不再以 .NET `0xe0434352` 未处理异常结束。
- **数据安全**：2.0.2 真机失败仍发生在 retire、卸载和机器 MSI 之前，William 旧 credential、SQLite 和云端身份保持不变。
- **本地安装证据**：Windows 42/42 tests、隔离探针与 WiX 0 warning/0 error 通过；Burn 118,518,417 bytes / SHA-256 `34a44f503b6513505b4a0096481c8e685eb9859480a5c044c9d695bb5e414c7d`。William 完成 1.x→2.0.3 安装，旧 SQLite 保留、credential retired、LocalSystem Service auto/running、普通用户 ProgramData/Service 控制权限受限；机器配对和生产 R2 切换仍待完成。

---

## [App Runtime 2.0.2] — 2026-09-02

- **安装链修复**：Burn 内的 1.x migration 改为真正的单文件 self-contained EXE，避免只缓存入口 EXE 时因缺少相邻 .NET runtime/DLL 而以 `0x8000809a` 启动失败。
- **构建硬闸门**：构建时仅复制 migration EXE 到隔离临时目录，运行无持久副作用的 `--package-probe`，实际加载 SQLite 与 CurrentUser DPAPI；非零退出阻止 MSI/Burn 生成。
- **数据安全**：2.0.1 首次真机失败发生在 retire、卸载和机器安装之前，旧 1.x credential、SQLite、Agent 与云端历史均保持不变。2.0.2 继续使用新的不可变版本路径，内部未签名状态仍为 `BLOCKED_BY_AUTHENTICODE_SIGNING`。
- **本地证据**：Windows 38/38 tests、隔离 migration package probe 与 WiX 0 warning/0 error 构建通过；Burn 118,521,952 bytes / SHA-256 `ab30d11fcc296b9faf274b5c8bf46c614e509ee0629aa4ca38132202d12c9527`，MSI 60,190,798 bytes / SHA-256 `485cc4e3aa835ed8ddc24c62e24c6b464e2218d1307e9966491f86de6dc03c6f`。生产 R2 暂不切换，等待 William 真机安装通过。

---

## [App Runtime 2.0.1] — 2026-09-02

- **机器级 Windows Runtime**：2.x 使用 LocalSystem Service、每交互式会话 Session Agent、LocalMachine DPAPI、机器级 SQLite/outbox 与 Account-scoped 默认 Child/逐用户 assignment；1.x 历史保持兼容。
- **安装与权限边界**：WiX 7 Burn 在原交互式用户上下文执行 1.x migration gate，再提升安装 per-machine MSI；ProgramData DACL 仅允许 SYSTEM/Administrators，普通用户不持有云端 credential 或账本写权限。
- **分发修正**：Runtime Worker 2.x 安装器路由改为读取不可变版本 manifest 并只返回对应 Burn，1.x MSI 下载保持兼容；Worker `e150e0e3-0919-4c60-be86-1ec26e4bcaf6` 与 R2 `latest.json` 已发布 2.0.1。
- **内部包证据**：Burn 60,956,054 bytes、SHA-256 `b86e8c2356fbb0730e6e1e168c48b90b38af2cd129e87f8897ec9d97f603657d`；MSI 60,186,702 bytes、SHA-256 `e8da3c11d923d5c936581233e5827926ac70a0f5ddb12479a791c56dba31307e`；R2 与 Worker 下载回读一致。包仍未签名并保持 `BLOCKED_BY_AUTHENTICODE_SIGNING`。
- **真机升级闸门**：William 1.x outbox 尚有 9 条待上传，当前账号级 D1 免费日读额度已耗尽并导致 Runtime 认证/上传 500；未 retire、未卸载、未清除旧账本，须在 UTC 00:00 额度重置后先清空 outbox。

---

## [App Runtime 1.0.1] — 2026-09-01

- **Windows Setup 状态收口**：以首次 heartbeat 为成功门槛，明确区分未连接、连接中、等待确认、在线、异常和需重新配对；已绑定后隐藏配对输入，在线态显示设备、Agent 1.0.1、最近在线与“完成并关闭”。
- **保留数据升级**：WiX 7 per-user major upgrade 保留 DPAPI credential、设备隔离 SQLite/outbox 和设备身份，修复 HKCU 登录启动；MSI 仍为内部未签名包，状态保持 `BLOCKED_BY_AUTHENTICODE_SIGNING`。
- **家长页面恢复**：手动刷新重新签发 Child-scoped module token；GET 的 401/首次网络失败至多安全重试一次，写操作不自动重放，页面不再显示浏览器原始 `Failed to fetch`。
- **北京时间统计修正**：日/周查询边界不再重复减去 UTC+8，小时图直接从 `hour_start_ms` 生成北京时间标签；生产 HornburgXW 页面恢复真实总时长、小时桶和应用排行。
- **内部发布**：William 账户完成 1.0.0→1.0.1 升级与在线验收；Pages deployment `e25c319e` 已发布。R2/生产下载回读 MSI 为 60,144,152 bytes，SHA-256 `13b8bb04607f019acf7a9a5e68fa87f63f8075e8a3d4d4da47ddc885b635fee7`。

---


## 已交付的 D-092 集成能力

- 建立同仓独立模块和未来拆仓边界。
- 将共享接口封装为 `@timeonchrome/app-runtime-contracts@1.0.0`。
- Runtime Console 改为独立 Cloudflare Pages 项目。
- 增加 Guardian 单次 SSO ticket 与 Runtime browser session。
- 增加独立 CI、production environment 手工批准和边界检查。
