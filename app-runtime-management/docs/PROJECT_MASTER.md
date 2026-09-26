# App Runtime 项目真值

## 当前源码边界：D-104/ARM-D-031

- BrowserBridge v3 已于 PR #44 合入 `master@373877d`，拆仓从该干净基线开始；v3 仍是本地候选，不代表生产发布。
- TimeOnChrome 保留 contracts、Runtime Worker/独立 Pages、D1/R2、Guardian 身份桥及生产发布权；私有 TimeWhereNative 接管 Windows/macOS Agent、RuntimeService、TimeWhereMg、Native Host 与安装器。
- 现有 SSO、Child lifecycle、机器身份和云资源地址不迁移；新仓为私有仓，Actions 无 Cloudflare 生产 secrets 或写入 workflow。原生仓 `5759559` 的 Windows tests/installer 与 macOS 15 当前版、上一兼容契约版 CI 已通过（run `36045220406`）；PR #1（merge `d7b56ec`）的 Windows 当前/上一契约测试与新汇总门通过（run `36048525372`）。旧仓 PR #45/#46 已合并，master 不再包含本机可发布源码与旧本机 CI；旧仓隔离构建 contracts、Guardian、Worker（56 tests 与 dry-run）及 Console session 均通过。旧仓验真器对 run `36045220406` 的实际候选来源 SHA、契约锁、Burn/MSI 大小与 SHA-256 验证通过，并拒绝本地来源 SHA 不符的同版本旧候选。
- TimeOnChrome production 环境人工审核且只允许 master，已配置只读跨仓令牌与仅限 Runtime 发布桶的一年期 R2 S3 凭据。`master@8b96cad` 的验真运行 `36117686246` 通过；发布运行 `36131882394` 第 3 次尝试完成 Windows 2.6.0 内部候选的 Burn、MSI、manifest 条件写入及逐件 R2 回读。来源为 TimeWhereNative `575955972e64c56094f77c150548e8261c66e598` / CI `36045220406`，contract 1.12.0。Burn 为 118,917,683 bytes / SHA-256 `8a7c91f696fd7360e28b15decf2e2fb3f8e0eeda5ee2ba8a6cf6019cfa88f716`；MSI 为 60,495,604 bytes / SHA-256 `7900205b038ec3d609b852c23e7d130b2114baa43e0c87a5ab60a75ae02ec21b`。R2 manifest 预览与作业证据 artifact `10862434201` 一致；latest.json 仍为 2.3.1。前两次上传因凭据误配失败，旧 R2 token 已吊销并轮换；不把失败记为通过。
- 源码拆仓本身不部署 Worker/Pages/Guardian、不执行 migration、不升级本机、不改写账本或切换 R2 latest；另行授权的 R2 不可变候选发布已完成。

## 当前本地实现：BrowserBridge v3 / TimeWhereNative 2.6.2（2026-09-26）

当前扩展开发候选 1.7.37 发送权威日统计快照及最小区间证据，不再发送原 Segment，旧 Service 只保留健康通道。2.6.2 已本机原地安装，Service/单一 Session Agent/Manager/v3 通信与机器身份和原账保留已验收；内部未签名，不代表生产发布，R2 latest 未切换。网页统计由扩展负责，Service 仅核对并合并可证明重叠，应用/共享值保留整数毫秒。

最小跨仓链式测试 6/6 PASS：真实扩展 builder 的 JSON 经过 framing、协议、SQLite 替换/幂等 ACK、毫秒投影与重启；公开夹具两仓语义一致，不跨仓导入源码。Host 未安装/后来安装、Service 故障恢复和错误 revision ACK 的聚焦断言通过。完整旧周共享仍因 `SESSION_MAPPING_INCOMPLETE` 不可用，未补造历史；不需要等待自然日才能完成受控工程验收。详细测试与 PR 状态见根任务板和 Native README。

## 历史实现：ARM-D-029 BrowserBridge v2（由 v3 发送模式取代）

- 目标版本为 contracts 1.11.0、Windows Runtime/TimeWhereMg 2.6.0、unpacked extension 1.7.34。
- Health heartbeat/probe 为 best-effort；Ledger 只镜像启用后已写入网页权威账本的 Segment，持久至少一次投递并逐项 ACK。
- v1 保留兼容，Service 声明能力后扩展才切换 v2；Host 仍为无状态 framing/pipe 转发层。
- 本阶段只完善本地可靠性、性能和可观测性，不执行共享配额、不下发策略/控制、不部署云端或 R2。

## 当前修复：ARM-D-028 Windows 2.5.2 Service 生命周期（实机通过）

- 2.5.2 已原地安装并接管升级前既有 Session Agent；Service 保持 Automatic/Running，未再出现 1067 或新增运行时崩溃。
- 开发扩展通过 Chrome `development` 安装类型启用 Host，保留普通绑定并完全绕过旧 managed policy/email 读取；正式 managed 和普通/CWS 边界不变。
- Chrome 重载后 Native Host 重新连接，控件恢复正常；公开状态为 online，云端 heartbeat 成功且无待上传数据。
- 本轮只完成本地实现、候选构建和实机联调，不发布云端或 R2。

## 历史实现：ARM-D-026 通用 Native Host 与共享配额影子核算

- `TimeOnChrome Native Host` 归 Runtime 模块，连接 Managed Chrome 扩展与现有 LocalSystem RuntimeService；旧 guardian Host ID 仅保留兼容别名。
- 扩展只镜像已经持久化的网页 Segment，Service 独立保存并计算影子共享配额；不修改网页/App Runtime 原始账、现行配额或阻止行为。
- 影子规则为前台优先、网页覆盖 Chrome 容器、待归类/未归类统一 Composite、辅助媒体排除。
- 所有 Host/Service/installer 实现保持在 `app-runtime-management/`，为后续独立仓库迁移准备；根项目仅保留 contracts 消费和扩展适配。
- 本阶段只完成本地实现与最小验证，不安装、不部署 Worker/Pages/Guardian、不执行 migration、不修改生产数据。

## 当前开发：ARM-D-025 系统应用与游戏默认分类

- 云端确认的系统应用默认归为复合；confirmed 游戏、游戏平台和游戏工具默认归为受限娱乐。
- 家长单项明确分类继续最高优先，疑似游戏、普通应用和技术记录不命中默认规则。
- 目录查询可立即显示默认分类；机器端在下一次完整盘点生成并应用新策略后向前切段，历史账本与既有配额结果不追溯修改。
- 变更等级为 Worker 策略语义 + Console 展示；只运行 Worker/Console 聚焦测试、typecheck、Wrangler dry-run 与 `git diff --check`。不运行 Windows、macOS、WiX、账本状态机或 migration 测试。

## 当前生产：ARM-D-024 游戏与系统应用规则补全

- 目标 contract 为 1.9.0：新增 `gameUtility`，并保持 `systemTool` wire value兼容；用户文案统一为“系统应用”。
- 云端规则使用生产盘点已有强身份确认 EA app、Game Bar、Solitaire & Casual Games、完美世界竞技平台、XBOX、反馈中心、命令面板、天气和录音机，无需终端升级、重新扫描或 migration。
- 本轮只允许发布 Runtime Worker 与独立 Runtime Pages；Guardian、D1、R2、安装包、分类、配额和账本均保持不变。
- PR #42 合并为 `master@ca5e63eaee54e95930a8fa36c84c77b241d17edc`；PR CI `35470260093` 与精确 master SHA CI `35470375189` 的 Contracts/Worker、Console、Windows、macOS 和汇总 gate 全部通过。共享向量补验同步了 Swift 对既有 `distributionKey` 的可信身份支持，不增加 macOS 扫描或发布。
- 生产 workflow `35470498809` 未执行 migration，仅部署 Runtime Worker `bacbf8b5-3798-48fb-aa7e-be46b3e2ac88` 和独立 Runtime Pages `329d9642-e99c-4f53-befc-0f05cc126182`。Guardian `62b536c9-7fa0-4cab-99f3-bff6a8595924`、主 Pages `d5fb6023-1c48-4705-87cf-45e4a5413064` 与 R2 latest 2.3.1 保持不变。
- HornburgXW 线上确认五个目标各一行进入游戏组：EA app/XBOX/完美世界为游戏平台，Game Bar 为游戏工具且无受限娱乐建议，Solitaire 为游戏并保留建议；反馈中心、命令面板、天气、录音机各一行进入系统应用。普通应用/游戏/系统应用数量由 80/9/16 变为 71/14/20。

## 当前生产修复：ARM-D-021 Windows 内置系统工具规则

- Runtime Worker 规则已加入截图工具、手机连接、时钟、照片、画图和相机六个经审核 package family；同名第三方及未审核微软产品不命中。
- PR #39 合并为 `master@6f8eed57849ea8e05b49a2fbeac893e675c59089`；合并 SHA 的 App Runtime CI `35465605869` 通过 `contracts-worker` 与 `app-runtime-gate`，其他平台 job 按 ARM-D-019 跳过。
- 生产 workflow `35465663873` 仅部署 Runtime Worker `84db0516-efb8-42a4-991a-9002c73f037d`；Pages、Guardian、主 Pages、R2 均未部署，migration 未应用。
- HornburgXW 线上只读验收确认六个对象在系统工具各 1 行，在普通应用和游戏中均为 0 行；普通应用由 88 变为 82，系统工具由 10 变为 16。管理分类仍为未归类，机器/账户数量保持 1/1；无需终端升级、重新扫描或重新配对。

## 当前生产热修：ARM-D-020 云端目录规则

- PR #37 已合并为 `master@264dfd5c2dcc1afca5908baff1ce89ff01059bb5`；精确 SHA 的 `contracts-worker`、`console` 与 `app-runtime-gate` 通过，Windows、macOS、WiX 按 ARM-D-019 正确跳过。
- 生产 workflow `35463456925` 仅部署 Runtime Worker `a2f63c8b-03ba-4c98-acc7-620f3719f494` 与独立 Runtime Pages `b3c01fab.timeonchrome-app-runtime-console.pages.dev`；Guardian、主 Pages、R2 未部署，migration 未应用。
- 线上 HornburgXW 验收确认目录顺序为“普通应用、游戏、系统工具”；Steam 唯一产品行位于游戏组且类型为“游戏平台／启动器”，终端唯一产品行位于系统工具，资讯位于普通应用。系统工具默认折叠；分类、配额、使用时长和历史 Segment 未改变。

## 当前工程治理：ARM-D-019 按变更范围测试

- App Runtime 任务必须在实现前声明变更等级、受影响子系统、必要本地测试/CI/发布 smoke 与明确排除项。
- 同一 Git SHA 和产物哈希的测试证据可复用；纯文档及发布证据不触发产品回归。
- 拆仓前 Runtime CI 按 docs/contracts/worker/console/windows/installer/macos/release-config 路由；拆仓后 Windows/installer/macOS 由 TimeWhereNative 独立 CI 负责，旧仓保留 contracts/Worker/Console/release-config 和生产精确 SHA gate。高风险专项门禁保持不变。

## 当前开发：ARM-D-017 产品目录云端纠错

- 云端第一闸已完成本地实现：MSIX 包容器只进入技术记录，可信 AUMID 入口独立进入主目录；无变体安装产品仍贡献机器/账户覆盖数，UsageSegment 时长来源不变。
- 系统包精确规则覆盖便笺、入门、Windows 备份和单击以执行；Runtime-owned 版本化产品知识已包含当前核实的 Steam 游戏，并明确将 `steam:228980` 保持为技术组件。
- 更正 ARM-D-016：2.3.1 的完整独立发行来源只有 Steam/Epic。EA/Ubisoft/GOG 独立来源已在 contracts 1.7.0 / Windows 2.4.0 完成本地实现与构建验证；尚未发布、安装或切换 R2 latest。
- 第一闸已通过 PR #32 合并并只部署 Runtime Worker 与独立 Runtime Pages；无 migration、无终端升级、无历史重写。第二闸停在独立 PR 与安装发布门前。

## 当前生产版本：Windows 2.3.1 完整盘点来源容量修复

- contracts 1.6.1 / Worker 接受 Steam/Epic 与 7 项来源结果，生产 Worker 保持 `c3a29505-b377-4e06-990c-9470662ee38d`；本轮没有再次部署 Worker、Pages、Guardian 或执行 migration。
- PR #30 已合并为 `master@c407d0f1ae66333c29099c63b1cf613b90abb472`。Windows 2.3.1 把 Service 本地来源容量对齐为 8；聚焦测试 50/50、Windows 全量 124/124、三组 CI、组件版本回读及干净 master WiX MSI/Burn 构建均通过。
- 受控生产机器已从 2.3.0 原地升级至 2.3.1；Service `Automatic/Running`、单一 Session Agent、heartbeat 正常，完整盘点 outbox 已清空。最新扫描为 387 个产品、356 个变体，7 个来源均为成功或带警告成功，完成标记已落云端。
- Aimlabs `steam:714010` 与 Apex Legends `steam:1172470` 已在真实线上目录显示为“游戏 · 未归类”，类型为已确认，并仅建议归入受限娱乐；没有自动改变孩子分类或配额。
- R2 `latest.json` 已切换至内部未签名 2.3.1。Burn 为 118,739,813 bytes / SHA-256 `3109d6bbd147f5bfba88549a240dae42e84e724aa86bd1baef724d2df7b17563`；R2 manifest、Worker latest 与版本化下载回读一致。发布证据见 `release/APP_RUNTIME_PRODUCTION_MANIFEST_2026-09-18.json`。
- 本轮不重新配对、不清除本地数据、不改 D1 schema、主/媒体账本、历史分类或配额；包继续标记 `BLOCKED_BY_AUTHENTICODE_SIGNING`。

## 当前开发：自动产品类型识别（ARM-D-016，本地候选已验证）

- 开发分支目标为 contracts `1.6.0`、Windows `2.3.0`，建立可信发行身份 → 云端产品类型 → 孩子分类规则的闭环。
- `appType` 与 `classification` 永久分离；Aimlabs/Apex 必须以发行平台 ID 等强证据确认，名称仅建议。
- 本轮无 D1 migration，不改变主/媒体账本、历史分类或配额口径；功能 worktree 不直接操作生产资源。
- 本地验证已完成：Contracts 23 向量、Windows 122 项、Worker 51 项、Console 功能与桌面/移动视觉、TypeScript、Wrangler types/dry-run、WiX 2.3.0 MSI/Burn、敏感字段与模块边界均通过。内部包仍为 `BLOCKED_BY_AUTHENTICODE_SIGNING`；尚未安装、发布或切换 R2 latest。

## 当前生产更新（2026-09-18）

- `master@6e607d99ee4d5e79847aab8ae0becbbb6fdf3a6f` 已完成 ARM-D-015 前向修正：Runtime Worker 仅以旧 Agent 已上传并标记为可信的 `packageId` 和云端受控规则生成权威 `applicationOrigin`；客户端同名、发布者及 `applicationOrigin` 提示不能决定目录分组。
- Runtime Worker 已单独发布为 `6eac7a4b-ce8c-4f4f-b1ac-bc3e862e105f`；`/v1/health` 回读 200，未认证 catalog 回读 401。无 migration，Runtime D1 schema、盘点事实、账本、分类和配额均未修改。
- 独立 Runtime Pages 保持 `32c70100-f704-48a9-b19c-271786054cd9`，本轮未重新部署；现有页面已能消费 Worker 的权威 `applicationOrigin`。Computer Use 线上验收显示 HornburgXW 为普通应用 106 个、系统应用 3 个，系统组精确包含快速助手、计算器和记事本；Microsoft 365 仍位于普通应用。
- R2 `latest.json` 已恢复为已验证的 Windows 2.2.3。Burn 为 118,729,417 bytes / SHA-256 `d665e227d4234d47337edcb04169d57d50e2817b72c1c606a3f7076d365eef8e`；MSI 为 60,363,104 bytes / SHA-256 `9238c03fd8b4f3795069e2fdb08372543c2893bd7d24bd3b4c849428488ccca3`。R2 与 Worker latest 回读一致，Worker 版本化下载的 Burn 大小和 SHA-256 复验一致。
- Windows 2.2.4 已标记为 withdrawn/internal-history；其不可变 R2 文件保留且不删除、不覆盖。HornburgXW 继续运行已验证的 2.2.3，无需重新扫描、重新配对或安装新包。
- Guardian、主 Pages、Runtime Pages、Santa、Extension、机器身份和生产数据均未变更。
- contracts `1.4.0` 的 SSO 启动孩子与游戏候选修复已随同一 master 基线进入 Worker/Pages；Guardian 的签发侧 `b551bb9` 已先行合入 master，本次未重新部署 Guardian。

## 当前修复与生产基线（2026-09-16）

- ARM-D-014 产品级应用清单已由 PR #18 合并为 `master@38e55f945888f04c8b3f0349b6535640be4d572d`；contracts 1.3.0、Windows 2.2.2、additive migration 0010、兼容 Worker read model 和独立 Console 已完成。Windows 106/106、Worker 39/39、contracts 23 组向量、Console 聚焦测试、generated binding types、Wrangler dry-run、WiX 包、真实 macOS 15 CI 与桌面/移动视觉验证均通过。
- 受保护生产运行 `35080465621` 已精确应用 `0010_runtime_product_catalog.sql`，发布 Runtime Worker `c3880fcb-d08c-4a07-9d3a-302557a79b52` 与 Runtime Pages `01b4df8b-a863-4545-bb5e-7b19aa833f06`；Guardian 和主 Pages 未部署。health 为 200，未认证 catalog 为 401。
- 从干净合并 SHA 重建并发布的 2.2.2 Burn 为 118,736,837 bytes / SHA-256 `85cc679f8aa61d175f50530fbc7bf7c51904641e3cc1638df14ce15a89db60ca`；MSI 为 60,363,104 bytes / SHA-256 `6946c4e90bc087cb2ba4087e98db126e12d993c994059c1fd720df6924d3a6aa`。版本化 R2 对象和 Worker 下载路由回读一致，latest 已切换 2.2.2；包仍未签名，状态为 `BLOCKED_BY_AUTHENTICODE_SIGNING`。
- HornburgXW 当前仍安装 2.2.1。0010 新表已存在且在客户端升级前为空；等待 action-time 安装确认后原地升级、完成来源完整扫描与线上目录验收。
- 历史 inventory、UsageSegment、时长、分类和配额键不重写。产品投影变干净不等于删除技术事实；真实家庭目录只有完成来源完整扫描并做线上对照后才能验收。
- 下方 D-092 首轮记录保留为历史。任何生产发布仍须干净 origin/master、独立资源选择及人工批准；本轮不触及 Guardian/Santa/Extension/主 Pages、机器配对或账本历史。

## 产品与工程边界

- `app-runtime-management/` 是 TimeOnChrome 仓库内的独立产品模块，不是 worktree 的附属物。
- macOS 与 Windows Agent、Runtime Worker/D1/R2、Runtime Pages 和 TimeWhereMg 均由本模块维护。
- Guardian Worker/D1 与主控制台仍属于 TimeOnChrome；双方只通过版本化 contract、SSO ticket 和 Child lifecycle 协作。
- Santa、Chrome Extension、`native-app-control/` 的协议、数据和凭据均不属于 Runtime。

## 当前生产状态（2026-09-15）

- D-092 同仓解耦首轮生产发布与真实浏览器验收已完成；来源为已合并、干净的 `origin/master@d8f79eceeb13b0a66715d35756cee647dee9ac99`，contract 为 `1.0.0`。
- Runtime Worker：`27e01201-412d-4eb9-ba3c-75cc6ed75eb1`；独立 Runtime Pages：`da630a11-33a6-40ad-97af-da2a837c66bb`，稳定地址 `https://timeonchrome-app-runtime-console.pages.dev`。
- Guardian adapter：`b971221b-82b1-4e14-8f67-f3b884ac924c`；主 Pages 隔离复部署：`3876077d-5607-4e95-8526-b666cf16d13c`。仅重部署主 Pages 后，其余三个资源和 R2 latest 均未变化。
- Runtime additive `0006_runtime_terminal_logs.sql`、`0007_runtime_browser_sessions.sql` 已执行并只读核对；本次验收未执行 migration，Guardian migration 未自动执行。
- R2 latest 继续为内部未签名 `2.0.6`；本机 Manager `2.1.1` 不等于云端分发版本。本次未重新发布 R2。
- 实际认证流程复用浏览器已有 Guardian 登录态，未读取、保存或代填密码。SSO 兑换 `201`、退出撤销 `204`、重新进入的新会话为 480 分钟；主域旧地址自动进入独立 Runtime。
- Runtime token 为 256-bit opaque 值，仅保存于 `sessionStorage`；URL fragment 已清除，未见 Runtime cookie、localStorage 或控制台日志泄露。绝对 8 小时、不续期由生产数据库生命周期汇总和固定 session 回归验证，未以等待 8 小时伪报实机通过。
- 实际设备、账户分配、策略、主使用统计和结构化日志查询正常加载；无票据新标签显示“从家长控制台进入”；Runtime 模块与 Guardian SSO 无认证均为 `401`。
- 生产 manifest：`release/APP_RUNTIME_PRODUCTION_MANIFEST_2026-09-15.json`，不可变记录本次资源和验收证据，不含真实账户、孩子、机器或用户标识。
- 后续诊断：设备详情“最近同步：尚未同步”与统计页真实同步时间不一致，Tamper 累计值需独立排查。本轮只验证加载与部署边界，不据此宣称完整终端健康验收通过，也不改业务代码。

## 集成与开发空间

- 集成分支：`codex/app-runtime-integration-v1`。
- 集成 worktree：`D:\Codex\TimeOnchrome-worktrees\app-runtime-integration`。
- Runtime 冻结基线：`9acba21ccb9a068c8ac0cf83912247ddf527ba69`。
- 生产发布只允许来自已合并的 `origin/master` 干净提交；功能 worktree 只允许本地验证和 Pages preview。

## 生产恢复硬闸门

- Runtime D1 已由受保护运行精确应用 `0010_runtime_product_catalog.sql`，远端当前无待执行 migration；不得重命名既有文件或自动执行未来 migration。
- 发布配置补全中（PO 授权）：生产只使用固定的已合并 master SHA；Runtime Worker/Pages 可独立选择，Guardian/Main Pages 默认不部署，migration 另行显式选择。GitHub production 环境只允许 master，并要求 PO 人工审批；缺失部署 API token 时停止，禁止搬运本机 OAuth 凭据。
- Guardian 远端 `d1_migrations` 当前没有历史记录；禁止执行自动全量 migration apply。
- 独立 Runtime Pages、独立 SSO 密钥、Runtime Worker、Guardian adapter 和主 Pages 入口必须可以分别回滚。
- Authenticode 未完成前，Windows 包继续标记 `BLOCKED_BY_AUTHENTICODE_SIGNING`。
