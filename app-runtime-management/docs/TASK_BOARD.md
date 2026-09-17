# App Runtime 任务板

## NOW：生产主目录明确技术安装包收口

- [x] 线上证据：重复与孤立变体清理后，主目录仍包含 Intel 芯片组/Management Engine/Serial IO、NVIDIA 中文驱动程序、Windows App Cert Kit、Application Compatibility Fix Database 和 Visual Studio Build Tools 等明确技术安装包。
- [x] 仅把固定、可解释的技术产品名称模式降级为只读 review；名称信号不得删除事实、自动合并产品或覆盖家长明确配置/已确认产品。
- [x] 固定回归覆盖中英文驱动、芯片组组件、兼容性数据库、认证工具与构建工具，同时证明 NVIDIA App、Intel Arc Control、Visual Studio Code 等真实管理应用不被误降级；Worker 47/47、TypeScript、Wrangler dry-run、边界检查和 `git diff --check` 通过。

边界：只修正 catalog read model 的保守审核信号；不修改扫描器、inventory、Segment、分类、配额、Agent、migration 或其他生产资源。

Plan Conformance Audit（提交闸门）：Matched＝固定技术产品信号只降级 review、明确配置/确认产品优先级不变、真实管理应用负向回归通过、历史事实不变；Deviated＝无；Missing＝无；Extra＝无。生产 Worker 发布与 HornburgXW 回读属于合并后的发布闸门。

## NOW：生产产品目录聚合优先级补漏

- [x] 线上证据：`Visual Studio Installer` 等维护产品自身已识别为 review，但同组强身份启动入口使聚合结果再次变成 actionable。
- [x] 线上证据：`OpenCode` 的多个安装产品名称分别为无版本和带版本形式，外加孤立入口；装饰名称归一化只处理唯一产品，没有处理多产品歧义。
- [x] 线上证据：`Administrative Tools`、`Task Manager`、`Disk Cleanup` 等无父产品的 Start Menu/运行入口仅有强 binary 身份，却被当作可管理产品。
- [x] 含 `TECHNICAL_PRODUCT_REVIEW` 安装产品的分组默认保持只读审核；只有产品知识或家长明确配置才能提升为可管理对象。
- [x] 同平台、同装饰名称 family 下存在多个互不关联可管理安装产品时，统一形成一个歧义技术记录，不自动合并或继承分类。
- [x] v2 独立变体即使具有 binary/package 强身份，在没有安装产品、产品知识或家长确认时仍只进入候选技术记录；与可信父产品关联的变体继续显示在产品详情中。
- [x] 固定回归覆盖维护产品带启动入口、OpenCode 装饰名称多产品、独立系统入口、LibreOffice、Notepad++ 与 Create React；Worker 46/46、TypeScript、Wrangler dry-run、桌面/移动视觉和边界检查通过。

边界：仍只修正 catalog read model；不删除或修改 inventory、Segment、分类、配额、Agent、migration、Guardian、Santa 或 Extension。

Plan Conformance Audit（提交闸门）：Matched＝维护组不反向提升、装饰名称多产品安全降级、独立变体候选化、可靠父产品变体继续保留；Deviated＝无；Missing＝无；Extra＝无。生产 Worker/Pages 发布及真实 HornburgXW 目录复验属于合并后的发布闸门，结果完成后回填。

## NOW：产品目录生产复验收口

- [x] HornburgXW 重启后完成一次真实 v2 全量扫描：5 个上传批次、740 条观察，5 个来源均为 `complete` 或 `complete_with_warnings`，无失败来源。
- [x] 扫描结算已把 196 条无来源 legacy `installed` 投影降为 0；原始观察和历史账本未删除。
- [x] 真实目录确认 LibreOffice 仅 1 个产品并保留 7 个变体，记事本仅 1 个产品；`Create React App Sample` 不进入主目录，仅保留 1 条只读技术记录。
- [x] 收口剩余缺口：Registry 中缺少结构化组件标志的 redistributable、runtime、maintenance service、installer 等对象只能按通用维护语义降为“需审核技术记录”，不得删除原始事实或伪装为已确认产品。
- [x] 将唯一安装产品与名称仅存在版本、架构或渠道装饰差异的孤立入口归入同一“可能变体”投影；仅用于避免重复主行，不自动确认产品关联，不继承分类。
- [x] 固定回归覆盖 Visual C++ Redistributable、Mozilla Maintenance Service、Notepad++、OpenCode、LibreOffice 和 `Create React App Sample`；Worker 44/44、Console 全部相关单元/桌面/移动视觉、TypeScript、binding types、Wrangler dry-run、`git diff --check` 与边界检查通过。

边界：本轮只修正 Runtime catalog read model 和对应页面投影；不改 Agent 扫描事实、D1 schema、原始 inventory、主/媒体账本、历史分类、配额、Guardian、Santa 或 Extension。

Plan Conformance Audit：Matched＝真实完整扫描结算、维护对象安全降级、装饰名称孤立入口降噪、桌面/移动原因说明和历史事实保留；Deviated＝无；Missing＝生产 Worker/Pages 尚未发布和线上目录尚未复验；Extra＝无。

## NOW：产品目录扫描结算与冗余变体修复

- [x] 生产只读证据：最新完整 v2 扫描前仍有 196 条兼容 inventory 记录保持 `installed`；其中 104 条旧候选、91 条旧未知对象、1 条旧应用，均缺少来源字段。
- [x] 生产只读证据：384 个当前 installed 产品中，109 个只有一个变体，39 个为产品名与唯一 `main` 变体名相同；“记事本”属于当前扫描的产品容器加单一主入口，不是旧记录本身。
- [x] Worker 在 v2 完整扫描结束时仅对 `complete` / `complete_with_warnings` 来源执行缺失对账；`failed` 来源继续 fail closed。
- [x] 已有权威 v2 完整扫描时，无来源的 legacy `installed` 投影不得继续证明当前安装；保留原记录和历史 Segment，并按 `usedNotDiscovered` / 技术记录读取历史。
- [x] Console 默认折叠唯一、同名、`main` 且未拆分的冗余变体；多变体、异名、非 main 或已拆分变体继续完整展示。
- [x] Worker/D1 42/42、Console 固定回归和桌面/移动 mock 截图通过；TypeScript、generated binding check、Wrangler dry-run、`git diff --check` 和范围审计通过。

边界：不删除 inventory，不直接改生产 D1，不改 Agent、contracts、migration、主/媒体账本、分类、配额、Guardian、Santa 或 Extension；生产发布与重新扫描须在本地验证、合并及单独发布批准后执行。

## NOW：产品目录同名歧义与孤立入口投影热修复

- [x] 真机完整扫描：HornburgXW 2.2.3 已上传 4 个数据批和 1 个完成标记；385 个产品、356 个变体，`completed=1`。
- [x] LibreOffice 只有一个安装产品，Writer/Calc/Impress/Base/Draw/Math/安全模式均挂为同一产品的变体。
- [x] 缺陷证据：`Create React App Sample` 同时由 user package 与用户卸载注册生成两个不同 product key，另有 hosted 变体；同名但无共同强身份，仍会在主目录重复。
- [x] 同平台、同规范化名称但存在多个互不关联安装产品时，仅形成一个只读歧义技术记录；不得因名称自动合并为已确认产品，也不得进入可分类主目录。
- [x] Worker 回归覆盖歧义产品、hosted 候选和既有 LibreOffice 单产品多变体；40/40、TypeScript、binding types、Wrangler dry-run 与 `git diff --check` 通过。
- [x] PR #21 合并为 `master@1608146`，Runtime Worker `c7070f63-6a19-494b-bfb5-066758ba8435` 已部署；health 200、未认证 catalog 401。
- [x] HornburgXW 真实 catalog 验证 `Create React App Sample` 主目录 0 条、技术记录 1 条，LibreOffice 主目录 1 条且含 7 个变体。
- [x] 后续缺陷证据：BlueJ、Node.js、Steam 等各只有一个 Registry 安装产品，但同名 Start Menu 主入口因缺少 `parentProductKey` 仍被投影为第二条可管理应用。
- [x] 当同平台、同规范化名称只有一个安装产品时，未明确配置且没有可靠父关联的同名非产品入口不得形成第二条主行；降级为只读“可能的产品变体”，等待强关联或家长确认。
- [x] Worker/D1 41/41、TypeScript、binding types、Wrangler dry-run 与 `git diff --check` 通过。
- [x] PR #22 合并为 `master@a2fe4da`，仅部署 Runtime Worker `be61471f-89ff-4320-8e00-12212128477c`；health 200、未认证 catalog 401。
- [x] HornburgXW 真实目录复验：BlueJ、Node.js、Steam、LibreOffice 各 1 个主产品；`Create React App Sample` 主目录 0 条、技术记录 1 条。孤立入口仍保留为只读技术记录，不参与产品目录计数。

边界：保留全部原始产品/变体扫描和历史账本；不执行 migration，不修改 Agent、Pages、Guardian、Santa、Extension、配额或分类历史。Plan Conformance Audit：Matched＝歧义产品与孤立入口均安全降级、唯一安装产品保持可管理、生产只更新 Worker、真实目录通过；Deviated＝无；Missing＝无；Extra＝无。

## NOW：Windows 2.2.3 inventory v4 管道兼容热修复

- [x] 真机证据：HornburgXW 已升级 2.2.2，Manager/Service/Session Agent 版本一致，Service Automatic/Running，单一 Session Agent，TimeWhereMg 在线且已配对。
- [x] 生产证据：2.2.2 启动后 `runtime_installation_products_v1`、`runtime_application_variants_v1` 与 `runtime_application_inventory_scans_v2` 仍全部为 0。
- [x] 根因：Session Agent 发出 `schemaVersion: 4`，Service 管道入口只接受 3，导致 v4 盘点在进入本地 inventory outbox 前被丢弃。
- [x] Service 同时接受兼容 v3 与产品级 v4；未知版本继续 fail closed，并增加固定回归。
- [x] 版本统一升为 2.2.3；Windows tests 110/110、WiX MSI/Burn 构建和 `git diff --check` 通过。
- [x] 本地候选：Burn `b823b3debd3d593e69004245f787f0e7f69621e234abebb7f5b2a9f5e2262e3d`（118,725,903 bytes）；MSI `13f0b3685ddcc4f1268b0ef4951a620f2e76b0f7b56b3946edf240e5b02e4705`（60,359,008 bytes）。
- [x] 合并 `master@27bfba7` 后发布 R2 2.2.3/latest；William 原地升级成功，三组件均为 2.2.3，Service 与单一 Session Agent 运行，完整扫描已上传。
- [x] 生产包：Burn `d665e227d4234d47337edcb04169d57d50e2817b72c1c606a3f7076d365eef8e`（118,729,417 bytes）；MSI `9238c03fd8b4f3795069e2fdb08372543c2893bd7d24bd3b4c849428488ccca3`（60,363,104 bytes）；R2 与 Worker 下载回读一致。

边界：不修改 Worker、Pages、D1 schema、主/媒体账本、配额、Guardian、Santa 或 Extension；不重写 2.2.2 已有事实。

## NOW：Windows 2.2.2 产品级应用清单（ARM-D-014，PO 授权生产发布）

- [x] 文档先行：固定产品、变体、技术记录三层模型和来源级盘点语义。
- [x] contracts 1.3.0 / inventory v2 与兼容校验。
- [x] Windows 产品容器、变体关联、来源 warning/failed 和来源级缺失对账。
- [x] additive 0010、Worker v1/v2 兼容及产品级 catalog read model。
- [x] Console 产品行/变体展开/拆分与来源健康。
- [x] Windows、Worker、Contracts、Console、WiX、视觉及边界验证。
- [x] 合并 master，应用 0010，部署兼容 Worker 与独立 Runtime Pages，并发布 R2 2.2.2/latest。
- [x] HornburgXW 从 2.2.1 原地升级到 2.2.2，保留配对并恢复 Service/Agent；真实扫描因 v4 管道兼容缺陷转入 2.2.3 热修复。

提交前验证：Windows 106/106、Worker 39/39、contracts 1.3.0 build/compatibility 与 23 组向量、Console unit/视觉、binding types、Wrangler dry-run、边界检查和 `git diff --check` 通过。2.2.2 Burn/MSI 版本与 manifest 哈希一致；内部包仍未签名。

提交前 Plan Conformance Audit：Matched＝产品/变体/技术记录三层模型、来源级扫描结算、v1/v2 兼容、0010、产品级页面投影与 2.2.2 包；Deviated＝无；Missing＝本地实现与验证无缺项，生产发布和 HornburgXW 真机验收按批准顺序待执行；Extra＝无。

PR 首轮 compatibility CI 发现根集成测试仍固定期望 contracts 1.2.0；已同步为批准的 1.3.0 并增加本地复验，不改变 Runtime 产品逻辑或协议内容。

生产证据：PR #18 合并 SHA `38e55f9`，受保护运行 `35080465621`；Runtime Worker `c3880fcb-d08c-4a07-9d3a-302557a79b52`，Runtime Pages `01b4df8b-a863-4545-bb5e-7b19aa833f06`，R2 latest 2.2.2。0010 前后原始账本保持 172 条 / 9,699,431 ms、v2 主账本 4,838 条 / 272,886,272 ms、媒体 0，证明 migration 未改写历史。

边界：不改写 Segment、时长、配额键或历史分类；不修改 Guardian、Santa、Extension、网页账本或 macOS 系统级 Agent。内部包继续 `BLOCKED_BY_AUTHENTICODE_SIGNING`。

## NOW：生产闸门空迁移修复（2026-09-16）

- [x] 生产只读检查确认 Runtime D1 无待执行 migration。
- [x] 首次受保护发布在资源写入前 fail-closed：workflow 仍默认期待已执行的 `0008_runtime_application_knowledge.sql`，实际待执行列表为空。
- [x] 将 `expected_runtime_migrations` 默认值改为空；未来存在待执行 migration 时仍必须由发布人显式填写精确文件名并单独授权 apply。
- [x] release-config、integration、模块边界与 145 个 unit 文件通过；PR #16 的 contracts/Worker/Console、macOS、Windows/WiX CI 全通过。
- [x] 从 `master@a041c454` 完成受保护生产发布 `35062450944`：Runtime Worker `3e5f5784-80a7-462d-ad7b-5bde527a9f60`、Runtime Pages `5b757653-8e0f-4531-bea3-3f5f6ed9082f`；migration 列表为空。

边界：未执行 migration，Guardian `b971221b`、Main Pages `3876077d`、R2 latest `2.0.6` 保持不变；失败运行 `35061674139` 未执行任何 Cloudflare 资源发布。health 200、未认证目录 401，稳定与不可变 Runtime Pages 均 200 并包含“技术进程记录”。

## NOW：产品应用投影修复（ARM-D-013，PO 授权）

- [x] 文档先行：区分产品应用、待确认技术记录和隐藏组件；固定原始账本不变。
- [x] 后端目录/未归类 read model 只把可靠产品或主应用标记为可管理。
- [x] Console 分类计数与动作仅作用于可管理对象；系统管理增加只读技术进程记录。
- [x] Worker 38/38、Console 聚焦测试与桌面/移动 mock 目视验证。
- [x] binding types、Wrangler dry-run、`git diff --check` 和受保护目录检查。
- [x] Plan Conformance Audit 通过；文档与代码进入同一提交。

发布结果：随 `master@a041c454` 部署 Runtime Worker 与独立 Runtime Pages；未执行 migration、未升级客户端，不改变 Segment、app usage 或 quota 口径。

提交前审计：Matched＝结构化证据投影、产品合并、技术记录分流、分类按钮边界、隐私与响应式视觉；Deviated＝无；Missing＝无；Extra＝无。原始 legacy Segment 行数固定回归通过，未改变 accounting 统计逻辑。

## NOW：Windows 2.2.1 目录质量修复（ARM-D-012，PO 授权）

最后复核补充：包查询输出与 C# 读取端显式统一 UTF-8，避免中文友好名称依赖控制台代码页；增加只输出受控中文字符串的 PowerShell 夹具测试，不运行 Get-AppxPackage/Get-StartApps。改动后已重新构建并回读核对最终候选包。

容量补充：原始清单上限与有效策略上限分离。未归类默认投影不占用旧客户端 1000 项 resolvedApplications 容量，缺省仍为未归类/无限额；超过 1000 个非默认有效投影时结构化报错并保持旧策略，不静默截断，不在盘点过程中发布无法被客户端解析的策略。

- [x] 文档先行，D 盘独立修复分支，保留其他工作树。
- [x] 发现名称、隐藏入口、来源合并与可信运行关联。
- [x] scan 协议/outbox/后台完整性，旧客户端未知状态。
- [x] 主要/安装未使用/使用证据/完整发现目录及产品分类。
- [x] Windows/Worker 回归、桌面/移动 mock 目视、类型/Schema/local migration/dry-run。
- [x] 2.2.1 本地 MSI/Burn、版本清单及哈希。
- [x] 修复主体提交推送：8df9397；真实 macOS 15 编译/共享向量、Windows/WiX 和 contracts-worker-console CI 35001806559 全部通过。
- [x] UTF-8/容量补丁 6e8618f 已提交推送；Windows 本地 95/95、Worker 38/38 与最终包回读通过。
- [x] 最终 CI 35002959346：macOS、contracts-worker-console、Windows/WiX 全部 success；gh run watch --exit-status 与最终 job 状态回查一致。

主体 CI：https://github.com/william-xia-cn/timeonchrome/actions/runs/35001806559 ，受测代码 SHA `8df939759953a118137766da80b3711039bc2730`。最终代码 CI：https://github.com/william-xia-cn/timeonchrome/actions/runs/35002959346 ，受测代码 SHA `6e8618f97ace90669e1045cd8bc71c8a557ce263`。共享 Swift/向量源文件未再改变。

验证（2026-09-16）：明确 2.2.1 版本参数的 Windows tests 95/95；contracts 1.2.0 编译/兼容和 23 组黄金向量通过；Worker/Vitest+D1 38/38（含 additive 0009 和 1001 个未知安装项容量夹具）、TypeScript、generated binding types --check 和 Wrangler dry-run 通过。目录 mock 的 1440×1000、390×844 截图与目视检查通过，既有知识面板/策略及根 contract compatibility/release config、模块边界检查通过。Draft 2020-12 Schema 实际校验 legacy/data/finish/privacy 夹具通过。Swift 编译和共享向量已在真实 macOS 15 CI 执行通过，不是 Windows 本地执行。

最终 MSI/Burn 构建均零警告/错误；隔离 package-probe 通过。MSI ProductVersion=2.2.1、固定 UpgradeCode、486 文件及 Service/SessionAgent/Manager 文件 2.2.1.0 回读通过；六个程序集 Assembly/File=2.2.1.0、Informational=2.2.1，Migration/MachineProbe exe 版本也已检查，Burn 数值版本=2.2.1.0。Burn 118,702,091 bytes / SHA-256 `1df0d8f3b23fe82c241bd6eef761d329186d293812b4bbeab26d4e6aa48115f5`；MSI 60,350,816 bytes / SHA-256 `0130ac6cca5ec50726a60ed5e83b8c9e46c9cb902b7760f34ea42cb9eaf31e7e`，manifest 回读一致。取代 UTF-8 补丁前的早期包 hash；产物仅在 artifacts/release/windows/x64/2.2.1/，本地 latest.json 不是生产分发。

提交前审计：Matched＝批准的五项修复及本地验证，macOS 已 CI 验证；Deviated＝无；Missing＝实现无缺项，真实完整盘点和生产升级另列未验证；Extra＝无产品扩展，根 lock/version compatibility 仅同步 contracts Minor。不得由 mock 宣称家庭数据已清洗或整机完整。

发布顺序硬闸门：当前安装已由手工升级到 2.2.0；生产仍为 contract 1.1.0。必须先合并受测代码、获授权应用 0009 并发布 Runtime Worker/Console，之后才安装 2.2.1；旧 Worker 严格校验不接受新 discovery/scan 字段。当前不部署、不安装、不改写或删除真实数据。

本轮不升级 William，不清理生产数据、不发布生产资源。不能将夹具通过等同于真机所有用户完整盘点。

## NOW：Windows 2.2.0 客户端包准备

- 已完成本地包准备：带 Version=2.2.0、Assembly/FileVersion=2.2.0.0、InformationalVersion=2.2.0 明确参数的 Windows solution tests 90/90，测试二进制版本已回读。六个发布程序集版本一致，发现类型存在但未实例化；MSI ProductVersion=2.2.0、固定 UpgradeCode、486 文件及四个关键客户端文件版本通过实际包数据库核对。
- 首次 publish 因 D 盘 0 bytes 失败；经 PO 授权仅清理本工作树可重建 bin/obj/artifacts 共 218.9 MB，未删除源码或家庭数据。第二次 MSI/Burn 构建均零警告/错误，隔离 migration package-probe 通过。
- Burn 展示版本为 2.2.0、数值字段为 2.2.0.0；首次字符串检查误要求四段展示值失败，已回读数值字段确认。包大小/SHA-256 与 manifest 一致；git diff --check、受保护目录零修改通过。Matched＝本地版本、测试、构建、包验证及授权清理；Deviated/Missing/Extra＝本次准备范围无。
- 本地候选：artifacts/release/windows/x64/2.2.0/；Burn 118,722,089 bytes / 1576a1840d5f74b91177aa1a7c0d9d0bd6b236067749d2ba722489de9bc087f0；MSI 60,342,624 bytes / b4bb5680a750ded4cee1004e3594b1a26a8e9056d818fc95c72995864c9388d4。未安装、未真实盘点上传、未发布 R2/latest；真机保留安装 2.1.1，未以本地验证冒充完整覆盖/去重验收。

- PO 要求继续实际执行：为已合并的发现/分类客户端准备内部 2.2.0，避免与本机旧 2.1.1 同号；版本补丁、完整 Windows solution tests、MSI/Burn 构建、文件版本和哈希核对为本次范围。
- 已先更新技术设计与 README/Changelog；实施位置为 installer/windows/build.ps1、两个 wixproj、Service fallback 与 InstallerPackageTests。固定 machine-scope UpgradeCode 和安装目录，不改落账/配对协议。
- 准备阶段不安装、不运行或上传家庭盘点、不部署云端、不写 R2 latest。真实升级和清单对照未执行，不以测试或包构建冒充端到端验收。
- 云端应用分类发布已完成（master b133f78 / Worker 2543375b / Pages 3ec2fd7e / migration 0008），下方旧预检状态由证据 PR #12 更新；未来 CI production token 缺失不阻塞本次本地包构建。

## 当前合并与发布预检（PO 授权：合并、推送、部署）

- PR #10 已合并到 origin/master（eed75c49）；contract 1.1.0、Windows/WiX、macOS Swift 及 Guardian compatibility CI 通过。生产尚未更新。
- PO 已授权补全发布配置：在短期分支修改 production workflow、manifest 生成器及聚焦测试；Runtime Worker/Pages 独立选择，Guardian/Main Pages 默认关闭，migration 按精确文件名核对，固定受测 master SHA。
- 建立 master-only production 人工审批环境；Cloudflare Account ID 使用环境变量，部署 API token 由 PO 在 GitHub environment secrets 安全配置。禁止读取/复制本机 Wrangler OAuth token，缺失认证时 fail-closed。
- 聚焦 release-config 测试接入 Runtime CI；production workflow、manifest 或该测试变更均触发验证。GitHub production 环境、master branch policy、Account ID 与最小权限部署 token 已创建并回查。
- 首次生产运行 `35061674139` 已通过 secret/preflight/build/test，但因 workflow 默认期待已执行的 `0008` 而在 migration 只读闸门 fail-closed；Worker/Pages 等写步骤全部跳过。
- 远端 Runtime 当前无待执行 migration。修复空默认值后仍保持精确文件名比对；R2 latest、William 安装和家庭盘点不在本轮范围。

- 应用发现收口：只有完整且无失败来源的扫描才发送有界完整身份集合；Service 按已认证用户将此前已安装但本次未观察到的项目标记 `notObserved`。便携运行观察及其他用户不受影响，失败/超容量扫描不推断卸载；缓存和独立 outbox 继续事务写入。
- 运行观察不能把已确认 installed 降为 runtimeObserved；保留安装证据，成功完整扫描仍可更新缺失状态。包扫描取消时结束自身查询进程，不遗留后台查询。

## NOW：应用目录与分类规则（ARM-D-011）

- [x] 文档先行：产品知识、孩子明确分类、规则分别管理；保留历史身份与账本。
- [x] 共享契约、匹配核心与跨语言黄金向量（Swift 执行待 macOS）。
- [x] 家庭隔离、ETag、规则导入预览、产品关联审计与安装清单 ACK。
- [x] Windows 发现与本地策略原子应用；macOS 只读发现及显式验证入口代码。
- [x] 五目录与确定性/规则两个可滚动管理面板；桌面/移动 mock 目视检查。
- [x] 相关本地测试、边界检查与 Matched / Deviated / Missing / Extra 审计。
- [x] macOS 15 CI 编译/Swift tests，共享向量和受控 bundle 发现测试通过；不等同于家庭真机盘点验收。
- [x] 四个 docs+code 子系统已提交推送功能分支；不自动合并或发布。

边界：不生产部署、不升级本机、不上传家庭盘点、不接入 Santa，不重写历史。macOS 测试必须在 macOS 执行。

### 最新 CI 收口（2026-09-15）

- 功能分支 codex/app-runtime-classification-v1 已设置 upstream；四个代码提交 d07eb0a / 20383ff / d15bbaf / 58b1cfc。
- 构建测试 CI 34973586475 对代码 SHA 58b1cfcf987ffb1eb92aa5cc4c197704da799d3f 全部成功：contracts-worker-console、windows（dotnet test 与 WiX MSI/Burn build）、macos（macos-15，swift test，包含共享分类向量与受控 bundle）。证据：https://github.com/william-xia-cn/timeonchrome/actions/runs/34973586475 。后续纯文档提交不改变该受测代码。
- macOS 环境 blocker 已由真实 CI 补齐，不再宣称未编译；Windows 当前本机未运行新扫描或升级，真实家庭发现/安装集成仍须另行授权。
- 最终 Plan Conformance Audit：Matched＝批准的本地代码、契约/三语言匹配、后台/平台/界面及 mock/CI 验证；Deviated＝无；Missing＝批准的 mock 范围无缺项；Extra＝无产品扩展。4 项开发工具链高危依赖及内部未签名包仍为发布风险，不因 CI 成功解除。
- 最终 Git 核对：classification 工作树干净，旧 Runtime 基线 9acba21 干净；主 master 74c009f 与任务工作线 8603fbb 的用户改动未被修改或提交。本轮无生产写入、部署、migration 或真机升级。

### 本地提交前验证（由上方 CI 补验结论更新）

- 子系统提交 4：确定性产品/变种与分类规则独立面板、孩子范围确认、命中冲突预览及逐项导入批准；保留五导航/五目录和系统日志/访问配置。知识聚焦测试、桌面/移动 Playwright 与目视审查通过；源码不复制到主 Pages。

- 子系统提交 3：Windows 首次/变化/每日只读盘点、便携补充、验证身份、用户隔离清单事务/ACK和本地 LKG/前向分类接入；90/90 与最终两个可执行项目编译通过。macOS 仅显式适配器与受控 bundle 测试源码，未执行 macOS 验收。

- 子系统提交 1：产品/规则 contracts 与三语言匹配核心已提交 d07eb0a；子系统 2 包含 0008、授权/ETag、只读预览/批准/关联审计、清单 ACK 及兼容投影，Worker 35/35 与类型/dry-run 闸门通过。

- fetch 确认最新 origin/master 仍为 6ef41907ea18e1bfee041e8886e3523740de0d8f。工作树和分支保持 D 盘 classification，不动主目录及其他工作线。
- contracts 1.1.0 build、N/N-1 兼容、21 组 TypeScript 黄金向量与 Draft 2020-12 Schema/向量结构 PASS；C# 同向量包含在 Windows Release 90/90 PASS 中。Swift 未编译或执行。
- Service/Session Agent Release build 均 0 warning / 0 error。Windows 只用夹具，不启动新二进制或扫描真实家庭。完整成功扫描的缺失对账、其他用户/便携隔离、运行观察不降级 installed、缓存/outbox 事务及 ACK/replay 已覆盖。
- Worker 本地 D1/Vitest 35/35 PASS，包含 0008；TypeScript、原 Wrangler types --check、dry-run PASS。只读关联预览不写版本/审计；未选孩子共用规则修改与导入依赖有固定断言。
- Console 知识/session/network/policy/clipboard/time/usage 聚焦测试 PASS。1440×1000 与 390×844 Playwright mock PASS；已目视核对五目录、双面板、80 项长列表、变种确认/拆分/解除和冲突命中明细，固定底栏可达，无敏感标识展示。截图为 output/playwright/app-runtime-classification/ 的 mock 产物，不是生产证据。
- 只复制模块的隔离临时副本通过 contracts 编译、backend typecheck/dry-run、本地 startup 与未认证机器 API 401；临时进程已结束。最初 contracts npm script 因其未独立安装 tsc 失败，改用该副本 backend 的 TypeScript 工具链后通过，不读取主仓源码。
- boundary check、git diff --check PASS；native-app-control/、extension/、workers/、pages/ 零修改。根 package.json/lock 仅同步 contracts Minor workspace 兼容依赖。
- LF 属性使原 types --check 与格式检查同时 PASS；首次失败字节未保存，不把 CRLF 推导解释伪报成已复现的历史根因。下方旧测试/阻塞记录不作为当前状态。
- npm audit 的 4 项开发工具链高危告警（sharp→miniflare→Wrangler/vitest-plugin）保留风险，未擅自升级，不标记安全验收通过；需另项处理后评估发布。
- Plan Conformance Audit：Matched＝全部已确认实现项及可运行本地/视觉闸门；Deviated＝无未批准偏差；Missing＝无功能实现项缺失，macOS/真实 OS 验收按计划保留未验证；Extra＝无产品功能扩展。不得宣布跨平台验收完成。
- 未部署、未应用生产 migration、未盘点上传家庭、未升级当前安装、未改写历史；功能分支只提交推送，不自动合并或发布。

### 前轮复验（历史现场，已由最新收口替代）

- 本轮核对 Wrangler 本地 checkTypesUpToDate：检查 Env hash 与 runtime header，不比较整份声明文本。根因是 CRLF 拆行后 runtime header 残留 `\r`，而不是先前误判的行尾空格。仅对派生类型文件做 LF 格式统一并保留无行尾空格；不更改类型或降低原有 --check。此前格式冲突结论由本条核对修正。
- 补充验证计划：长清单与变种/冲突 mock、跨孩子导入覆盖断言、隔离 dry-run/startup；依赖告警源为开发工具链 sharp→miniflare→wrangler/vitest-plugin，未进入 contracts 运行依赖，保留风险、不自动升级。
- 模块 .gitattributes 固定派生 worker-configuration.d.ts 为 LF，避免 Windows 下一次检出再次触发 runtime header 的 CRLF 误判。Console 长列表由 mock-only inventoryFixtures 参数提供受控夹具，未进入真实加载/上传流程。
- 原有 Wrangler --check 与 git diff --check 现已同时通过；不替换闸门。首次失败未保留文件字节证据，CRLF 是由检查实现推导的风险解释，不伪报已复现的历史根因。类型文件 LF 属性作持久预防。
- 导入预览增加命中明细与冲突/建议状态，显示目标孩子名称和前向生效提示，不只显示计数；不显示 raw identity。将同层自动规则冲突与长列表纳入桌面/移动夹具验收。

- contracts 1.1.0 构建、N/N-1 兼容及 21 组 TypeScript 黄金向量通过；C# 同向量包含在 Windows Release 88/88 中。Swift 对应源码已实现，但未在 macOS 编译或执行。
- Windows Release 测试 88/88；Session Agent 编译 0 warning / 0 error。未启动新二进制、未扫描或上传真实家庭清单。
- Runtime Worker 本地 D1/Vitest 33/33、TypeScript、Wrangler dry-run 通过；包含只读关联预览无写入、家庭知识复用与孩子分类隔离。新增规则导入跨孩子覆盖保护需要独立断言继续补齐。
- Console 知识、session、network、policy、clipboard、time、usage 聚焦测试通过；桌面/390px mock Playwright 通过。已目视核对产品面板与移动导入；独立滚动和固定底栏可达。规则编辑保留平台、未显示条件与既有排除；当前孩子停用不改变其他孩子批准。
- 关联 confirm/merge/split 增加只读预览；支持解除错误身份范围，最后范围的孩子/规则引用必须显式处理，不生成空产品或悬空引用。
- 只复制 Runtime 模块到隔离临时目录，npm ci、contracts 编译、backend TypeScript 通过；backend 显式依赖模块内 contracts，不依赖主仓业务源码。
- npm 报告 4 项高危依赖告警，未自动修复，待确认影响；不能当作安全验收通过。
- Wrangler 4.127.1 精确 types check 的差异仅 5 处生成行尾空格：原样生成时 check 通过，但违反 diff --check。已移除行尾空格并保留原类型语义；精确生成检查与干净格式两项不能同时标记通过，后续须解决检查规范化，不降低语义校验。
- 阶段审计：Matched＝共享匹配、Windows 本地夹具、Worker 本地数据/预览、五目录两面板、隔离 TypeScript；Deviated＝生成类型格式闸门差异（未视为通过）；Missing＝macOS 实测、长列表/变种与冲突视觉补充、完整隔离打包/startup、最终敏感字段及提交审计；Extra＝无。
- 整体未完成，不提交/推送。下一步先收口上述 Missing 与类型闸门，再按四个子系统提交。无生产部署、remote migration、真机升级或历史改写。

### 前轮实施现场（保留原因，不作为最新测试结果）

- 工作树：`D:\Codex\TimeOnchrome-worktrees\app-runtime-classification`；分支 `codex/app-runtime-classification-v1`，起点 `origin/master@6ef4190`。
- 已实现：contracts 1.1.0 的产品/规则类型、受限输入校验、JSON Schema；TypeScript/C#/Swift 共享 13 组黄金向量。TypeScript 构建与兼容/向量通过；Swift 尚未编译验证。
- 已实现但未完整收口：本地 additive `0008`、家庭知识 GET/PUT 与 ETag、安装清单和幂等批次 ACK、冻结分类投影及旧客户端 PUT 保留字段；Worker 类型检查及本地 D1/Vitest 28/28 通过。
- Windows 已接入只读发现适配器、库存 SQLite cache/outbox、Session Agent 库存消息与 Service 上传循环、安装路径客户端校验及策略保存后发布。Service/Session Agent 单独编译均 0 warning / 0 error；未运行新服务或真实发现。
- macOS 已加入常规目录只读适配器、显式 `--scan-only` 本地入口和受控 bundle 测试；全部仍待 macOS 13+ 编译与测试，不记为验收通过。
- 恢复授权：PO 已确认继续。独立库存连接设为 `Pooling=false`，保证每次 dispose 真正释放 SQLite 句柄；不清空全局连接池，不影响现有账本连接。Windows Release 全量复验 83/83 通过。
- 上轮阻塞：Windows 全量新增后 83 项为 81 通过 / 2 失败；两项均在 `ApplicationInventoryTests.Dispose` 删除 SQLite 夹具时出现文件占用。连接字符串启用默认连接池；同一失败命令达到两次后已停止并报告，本轮获授权恢复。
- 下一步：完成规则导入预览/逐项批准、产品关联合并拆分审计、目录 read model、两个管理面板与桌面/移动目视验收；补齐策略切段、LKG、身份与发现的覆盖。
- 本轮收口：规则编辑必须保留未显示的条件、平台限制和既有排除项；清除排除须明确选择。修改规则发布新 ID，仅替换选中孩子的批准，其他孩子继续使用旧规则。操作预览及解除错误关联仍需补齐。
- 独立构建检查：backend 显式声明模块内 contracts package 依赖，不能依赖主仓 node_modules 的隐式提升。Wrangler binding 检查发现生成文件过期，仅重新生成派生类型，不修改 binding 或生产配置。
- 当前不得标记整体完成、提交或推送；无生产部署、migration 应用、真机升级或家庭数据上传。

## 当前集成工作（2026-09-15）

- [x] **[D-092] 同仓解耦与独立发布边界**
  - integration 分支已完成本地 contracts、Worker、Console、Windows、隔离构建与视觉闸门。
  - GitHub macOS 验证使用当前可用的 `macos-15` 标准 runner；它满足产品最低 macOS 13+ 的编译测试要求。
  - 首轮 macOS CI 已进入真实 Swift 编译，并发现 `AccountingReadModel.unionDuration` 的链式表达式触发编译器类型推导超时；仅拆分为显式中间类型，不改变区间并集语义。
  - CI 全部通过，PR #8 已合并为 `d8f79ec`；Runtime `0006/0007` 和四个生产资源完成首轮发布。
  - 真实浏览器完成 SSO 兑换、fragment 清理、sessionStorage-only、480 分钟新会话、退出撤销、重新进入、无票据新标签、设备/分配/策略/统计/日志查询及旧地址兼容验收。
  - 主 Pages 单独复部署为 `3876077d`；Runtime Worker、Runtime Pages、Guardian Worker 与 R2 `2.0.6 latest` 均未变化，覆盖风险的部署边界证明已取得。
  - 生产证据见 `release/APP_RUNTIME_PRODUCTION_MANIFEST_2026-09-15.json`；未重新部署 Runtime/Guardian/R2，未执行额外 migration。
  - 后续独立诊断：详情同步时间展示与统计不同，Tamper 累计异常；不改变本次 D-092 SSO/部署边界结果，不宣称终端健康问题已修复。

## 从根任务板迁入的历史状态

## Active App Runtime Work（2026-09-02）

- [x] **[SPEC-004 / D-091] TimeWhereMg 2.1.1 全用户桌面入口（本机完成，未部署）**
  - 目标：在公共桌面安装由 MSI 管理的 `TimeWhereMg` 快捷方式，指向正式安装目录中的 Manager；保留开始菜单与 HKLM 托盘自启动。
  - 升级：从 William 当前 2.0.6 原地升级，保留 HornburgXW 机器身份、credential、策略、SQLite、outbox 和历史账本；不重新配对。
  - 边界：保持 machine-scope UpgradeCode 和现有 `Program Files (x86)` 路径；仅本机安装验证，不发布 R2、Worker、Pages，不执行 migration。
  - 证据：Windows 测试 75/75 通过；MSI/Burn 构建 0 warning/0 error；Computer Use 从公共桌面快捷方式启动后显示在线、已配对、策略已缓存并应用，隐藏到托盘后后台 Manager、Service 与单一 Session Agent 继续运行。

- [x] **[SPEC-004 / D-091] TimeWhereMg Windows 服务管理应用（2.1.0 本地完成，未安装/未部署）**
  - 目标：将一次性 Setup 收口为托盘常驻的 `TimeWhereMg`，产品呈现为管理应用与 RuntimeService；Session Agent 继续作为内部采集子进程。
  - 权限：标准账户只读裁剪状态；配对、同步、Service 启停/重启、MSI repair 和卸载必须使用管理员控制面及 UAC。停止前切段并持久化，Service 仍保持 Automatic。
  - 窗口生命周期：普通窗口关闭只隐藏到托盘；提升后的管理员窗口不驻留托盘，点击窗口“×”或“关闭”都必须结束该管理员进程并释放单实例锁。
  - 初始位置：标准和管理员窗口每次显示并激活后都必须把主滚动区复位到顶部，不能因首个可操作按钮自动获得焦点而从页面中部开始。
  - 诊断：展示真实 policy/heartbeat/upload 时间、outbox 数量、Agent/会话/tamper 和远程日志状态；只提供摘要，不开放原始日志。
  - 边界：版本 2.1.0，本地代码、包和验证；不部署 Worker/Pages/R2，不执行 migration，不升级 William 当前机器，不修改生产数据。
  - 证据：Windows .NET 72/72；WiX MSI/Burn 0 warning / 0 error；Manager、Service、Session Agent 的 Product/File Version 均为 2.1.0；Burn 118,658,121 bytes / SHA-256 `010221a2ff55acf306a4bcaa3ef9f2bc0bc919cc4ce1589e9d05b757c0b0a1c0`，MSI 60,301,602 bytes / SHA-256 `f6cf4428712e5a097501c935e21324c9fca1db46dcdfe6d02b033cf43c189876`。Computer Use 已改用原生 Windows `@oai/sky` surface，标准视图 520px 紧凑布局、未知状态不误报未配对、标准账户裁剪、管理员顶部/控制/健康/危险区、滚动区和固定底栏均已目视通过；目视发现的管理员“×”关闭后进程未退出与显示后焦点滚动偏移均已修复并复验。小工作区/高 DPI 边界由布局单测覆盖，真标准账户 ACL、重启恢复和 2.0.6→2.1.0 安装升级仍属于后续系统集成验证。包仍为 `BLOCKED_BY_AUTHENTICODE_SIGNING`。

- [x] **[SPEC-004 / D-090] App Runtime 机器级终端日志与远程开关（本地完成，未部署）**
  - 目标：在 Runtime 系统管理提供机器级远程日志打开/关闭、等级/类别/TTL 配置和统一日志查询；Windows Service 建立结构化本地日志、独立 SQLite outbox 与逐项 ACK 上传。
  - 安全：默认关闭；关闭期间不形成云端补传积压；不上传用户名、SID、Child ID、runtime identity、路径、窗口标题、token、配对码、原始异常或 stack。
  - 隔离：日志失败不得阻断主/媒体账本、策略、heartbeat 或 Session Agent 守护；macOS 当前只共享协议。
  - 边界：只生成并本地验证 additive `0006`，不应用生产 migration，不部署 Worker/Pages，不升级 William 当前机器。
  - 证据：Windows 54/54、Runtime Worker 22/22、console helper 与桌面/390px 目视检查通过；TypeScript、JSON contract、canonical/staged Pages 一致性与 Wrangler dry-run 通过。打开/关闭、ETag、TTL、等级/类别、策略下发、幂等逐项 ACK、关闭后拒绝、无追溯 outbox、日志-only 策略不切主账本 lane 均有固定回归。

- [x] **[SPEC-004 / D-087 / D-088 / D-089] App Runtime 孩子级五目录生产依赖补齐（已完成）**
  - 目标：将应用管理左侧收口为 TimeOnChrome 式五个目录卡片，普通目录明确分列应用、Windows、macOS 三项计数；右侧保持无二级表格的平面应用列表。
  - 验收：固定验证孩子级预配置应用即使最近 30 天未使用仍保留、搜索/平台筛选/移动分类有效、未归类待处理展开/已处理历史折叠；初次未登录或加载失败必须显示完整错误状态，不得暴露空业务骨架。
  - 根因：Pages deployment `3164aad7` 已包含新页面，但生产 Runtime D1 仍待 `0005_runtime_app_management.sql`，生产 Worker 仍为不含 App Policy/App Catalog 路由的旧版本，因此已认证页面返回 `Route was not found`。
  - 发布证据：Runtime `0005_runtime_app_management.sql` 已应用；Worker `135c57b8-ed3a-4fd6-8f61-d862d8a92ecd` 已部署。生产登录会话重新加载后可读取 HornburgXW 使用统计，应用管理显示五个目录、16 个待处理应用及真实账本明细，原 `Route was not found` 消失。
  - 边界：未修改 Guardian、R2、安装包、Santa、Chrome Extension 或历史 Segment。

- [x] **[SPEC-004 / D-086] App Runtime 应用目录与系统日志管理补完（本地完成，未部署）**
  - 原因：D-085 只完成导航、策略与基础列表，应用目录缺少完整 read model、显式分类动作和操作反馈；系统管理也没有 TimeOnChrome 式日志查询。
  - 目标：增加真实应用目录接口与完整分类行；系统日志基于已上传的 0ms accounting diagnostic，提供范围、机器、等级、类别、摘要、列表和分页。
  - 边界：不把 diagnostic 当作完整 Service 文件日志，不增加日志上传开关或新采集协议，不新增 migration、不部署、不修改生产数据。
  - 证据：Runtime Worker typecheck 与 21/21 tests 通过；App Policy helper 与 D-086 桌面/移动 Playwright 视觉检查通过；canonical console 已同步 staged Pages，应用显式动作和系统日志表无横向页面溢出。

- [x] **[SPEC-004 / D-085] App Runtime 应用管理与访问管理分离重构（基础结构完成，产品完成态由 D-086 补齐）**
  - 目标：顶层导航调整为使用统计、访问管理、应用管理、设备管理和系统管理；应用管理负责真实应用目录与最近 30 天未归类处理，访问管理负责独立配额、七天时间段和配置文件。
  - 规则：时间段默认全部开放；旧客户端不得重置已有时间段；超额、黑名单和时段外使用只提示记录，不结束或阻止进程。
  - 范围：只做本地合同、Runtime Worker、Windows 策略缓存、canonical console、staged Pages、测试和视觉证据；不部署、不应用 production migration、不修改生产数据。
  - 证据：Runtime Worker 20/20、Windows 50/50、console helper 与 D-085 Playwright 视觉检查通过；这些证据仅证明基础结构，不再作为“应用管理产品已完成”的结论。

- [x] **[SPEC-004 / D-084] App Runtime 家长管理界面与应用策略闭环（本地完成，待单独发布授权）**
  - 目标：独立 `/app-runtime/` 复用主控制台外壳，提供使用统计、访问管理、应用归类记录、设备管理和 Runtime 系统管理。
  - 产品规则：五类应用分类按孩子和平台共享；只管理真实观察到的应用；独立配额只计算状态，不阻止进程；分类只对策略实际应用后的新 Segment 生效。
  - 实现范围：Runtime additive `0005`、版本化 App Policy/ETag、未归类记录与 App Usage read model、Windows 策略缓存/切段、canonical Console 与 staged Pages、自动化和桌面/移动目视验证。
  - 发布边界：只完成本地实现和 dry-run；不应用生产 migration，不部署 Worker/Pages/R2，不修改 Guardian、Santa、Chrome Extension 或网站账本/配额。
  - 证据：Windows 49/49、Runtime Worker 17/17、console helper tests 通过；`0001`–`0005` 本地 D1 migrations 通过，Wrangler type generation/check、TypeScript typecheck 与 deploy dry-run 通过；桌面统计/访问管理/设备抽屉/系统管理和 390px 移动视口截图通过。

- [~] **[SPEC-004 / D-082 / D-083] App Runtime 2.0.2 安装链修正与 William 升级进行中**
  - Product Owner 已于 2026-09-02 授权完成待发布的 Cloudflare 部分：Runtime `0003`/`0004`、Guardian `024`、Runtime/Guardian Worker、账户级 Pages 与经发布门禁确认的 R2 内部包。
  - 发布顺序：远端只读预检与 Time Travel 书签 → Runtime additive migrations → Runtime Worker → Guardian additive migration → Guardian Worker → Pages → R2 immutable package/hash/latest gate → 生产 smoke。
  - 保留边界：不修改 Santa、Chrome Extension、Native App Control；不执行 William 1.x→2.0 真机升级、不创建真实配对/采集数据、不改写历史账本；内部未签名 2.0.0 继续标记 `BLOCKED_BY_AUTHENTICODE_SIGNING`。
  - 额度诊断：Runtime D1 24h 仅 1,583 rows read / 974 rows written；Guardian D1 为 28,134,760 / 53,864。D1 Insights 显示逐请求执行的 `device_access_audit_v1` 两条清理 SQL 分别读取 15,004,205 与 13,010,483 行，是主要来源。限额根因修复作为独立 Worker P0，不混入本次 releaseMg 部署。
  - 已完成：Runtime `0003`/`0004`；Runtime Worker `af74e867-5fe1-48aa-b264-11e0892bebd3`；Guardian `024`；Guardian Worker `70b27ad3-7ae7-4cab-b9e0-b04def8e495b`；Pages `1edd8561-c990-4e6e-aa4d-b13b457cd37d`。health、未认证 401、Pages 六资产哈希和 Runtime 旧数据保留均通过。
  - R2：历史 2.0.0 Burn/MSI/manifest 已上传生产 immutable path 并回读一致；Burn SHA-256 `32a7eda83a4940948faeb034868bb0545f5984692becdb3a5187de0ba749d202`，MSI SHA-256 `0cce622d420c6513982832005f9d02e5193a8be84171474b2cf9bb5875685e6b`。2.0.0 manifest 已永久记录旧 blocker，故不原地改写；当前闭环发布 2.0.1，把 `/installer` 修为 2.x manifest 驱动且只分发 Burn，生产回读通过后再切换 `latest.json`；1.x MSI 路由保持兼容。
  - 2.0.1 安装安全闸门：Burn migration 显式保持 per-user，在 William 原交互式用户上下文读取 HKCU/CurrentUser DPAPI 并完成 retire 后才提升安装 per-machine MSI；ProgramData 使用受保护 DACL，仅 SYSTEM/Administrators 可访问。不得用替代管理员上下文迁移旧用户 credential。
  - 2.0.1 生产证据：Runtime Worker `e150e0e3-0919-4c60-be86-1ec26e4bcaf6`；Burn 60,956,054 bytes / SHA-256 `b86e8c2356fbb0730e6e1e168c48b90b38af2cd129e87f8897ec9d97f603657d`；MSI 60,186,702 bytes / SHA-256 `e8da3c11d923d5c936581233e5827926ac70a0f5ddb12479a791c56dba31307e`。R2 三对象回读一致，Worker 版本下载回读为同一 MZ/Burn 字节，`latest.json` 已切换 2.0.1；health 通过、未认证 v2 仍为 401。
  - William 升级闸门：1.x credential、SQLite、Agent 保留且未 retire；只读检查发现 9 条 outbox pending。生产 tail 返回账号级 D1 免费日读额度已耗尽，因此 v1 self/heartbeat/upload 当前 500。逐请求扫描根因已由 Guardian migration `025`/Worker 修复，但已经消耗的当日额度不可回退；须等待 UTC 00:00 重置或单独批准付费升级后先清空 outbox，再进入安装、配对、双账户、重启和 ACL 验收。
  - 付费恢复与首次真机安装证据（2026-09-02）：Workers Paid 已显示 Active，Runtime/Guardian D1 `SELECT 1` 均成功；旧 Agent 随后把 9 条 pending outbox 全部 ACK 至 0。2.0.1 Burn 首次真机运行在执行 per-user migration package 时返回 `0x8000809a`；Burn 日志证明链内只缓存了 `TimeOnChrome.AppRuntime.Migration.exe`，而当前 migration 是依赖相邻 .NET runtime/DLL 的多文件 self-contained 发布，导致进程在进入 preflight 前启动失败。Burn 已完整回滚，旧 Agent、CurrentUser DPAPI credential、SQLite 与云端设备均保持原状。2.0.1 不再作为 William 可安装候选；2.0.2 必须改为单文件 self-contained migration，并在构建时将 migration EXE 单独复制到隔离目录运行无副作用依赖探针后，才允许重试升级和更新 R2 latest。
  - 2.0.2 本地构建证据：Windows solution 38/38 tests 通过；migration 单元依赖探针和“仅单个 EXE”的构建隔离探针均通过；WiX MSI/Burn 均为 0 warning / 0 error。Burn 为 118,521,952 bytes / SHA-256 `ab30d11fcc296b9faf274b5c8bf46c614e509ee0629aa4ca38132202d12c9527`，MSI 为 60,190,798 bytes / SHA-256 `485cc4e3aa835ed8ddc24c62e24c6b464e2218d1307e9966491f86de6dc03c6f`。真机重试进一步暴露普通用户迁移进程扫描受保护 `HKEY_USERS` 时未捕获 `SecurityException`，Burn 以 `0xe0434352` fail closed；仍未 retire、卸载或安装。2.0.3 必须将全机器其他用户冲突扫描拆为先执行的 elevated machine probe，CurrentUser DPAPI/outbox/retire 继续在原用户上下文执行，并把所有权限异常转为明确非零退出而非进程崩溃。生产 R2 仍保持 2.0.1。
  - 2.0.3 本地与安装证据：Windows 42/42 tests、隔离单文件探针通过，WiX MSI/Burn 0 warning / 0 error；Burn 118,518,417 bytes / SHA-256 `34a44f503b6513505b4a0096481c8e685eb9859480a5c044c9d695bb5e414c7d`，MSI 60,190,798 bytes / SHA-256 `7c0eecf3b4021be9c6f8ee337131b3a037567ea6b4ee28640fbe997fff9f65fd`。William 真机 1.x→2.0.3 安装成功：旧 credential 已改名 retired、旧 SQLite 保留、LocalSystem Service 为 auto/running、普通用户不能读取 ProgramData 且不能停止/删除 Service。机器配对、Session Agent、策略 ACK、双账户与重启验证仍待完成；生产 R2 未切换。
  - 2.0.4 控制面修正：2.0.3 Service SCM 状态为 auto/running，但 Setup 持续显示未响应。代码核对确认 Setup 控制管道客户端未显式请求 impersonation，而 Service 在连接后使用 `RunAsClient` 验证管理员；首个连接可令 control loop 异常退出，且当前 loops 不记录也不恢复该异常。2.0.4 必须使用明确的 `TokenImpersonationLevel.Impersonation` 客户端、保持管理员命令鉴权，并为所有 Service 常驻 loop 增加异常日志和退避恢复；不得把“进程存在”误报为控制面健康。
  - 2.0.4 家长页复制反馈修正：真实配对验收发现“复制配对码”只调用 Clipboard API，没有成功反馈，失败提示也远离配对框，用户无法判断是否生效。canonical console 与 staged Pages 已增加 Clipboard API + 文本选择回退、配对框内 `aria-live` 成功/失败反馈，并同样覆盖卸载码；13/13 聚焦测试与桌面 mock 目视通过，生产 Pages deployment `0095b09c` 回读显示“已复制 / 已复制到剪贴板”。本修复未生成新配对码、未改变当前机器身份或后台协议。
  - 2.0.5 首次策略收敛修正：William 完成机器配对后云端机器在线且策略显示 `1/1`，但 Session Agent 为 0；根因是 Service 在用户发现前缓存了空用户策略 v1，用户同步虽创建默认 assignment 却没有提升 desired version，旧 ETag 持续返回 `304`。Runtime Worker 必须在发现无 assignment 用户时一次性提升策略版本，并兼容识别“机器已 ACK 空策略但用户 assignment 从未 ACK”的既有卡住记录，让旧 ETag 失效；重复用户上报保持幂等。同期修复 WTS ANSI API + UTF-16 解码导致的本机用户名乱码。不得重新配对、清除 HornburgXW 历史或修改 SID-HMAC 身份。
  - 2.0.5 统计展示修正：实机升级后 Runtime D1 已收到 accounting v2 主账本，但正式页面仍只读取旧 `runtime_app_hourly_stats_v2`，从而错误显示“0 分钟／暂无使用记录”。`/v2/module/accounting` 必须返回按小时主账本并集 buckets；页面同时读取旧统计与 accounting v2，按来源无重叠地合并总时长、buckets、应用排行和最近同步。媒体辅助账本仍不得并入主使用时长。
  - 2.0.5 实机与发布证据：William 原机器身份和 HornburgXW assignment 保留，注册产品、Service 与单一 Session Agent 均为 `2.0.5`，Service running、策略 `2/2`，云端用户名恢复为 `INTELMINIPC-XW\\William` / `INTELMINIPC-XW\\Game`。生产 Runtime Worker `9f24691d-5993-4c48-a8ae-557f77bbbdc9`、Pages deployment `a281c6e5` 已发布；页面回读显示 1 小时 56 分钟及应用排行。R2 latest 已切换 2.0.5：Burn 118,527,809 bytes / SHA-256 `5494d3d14da38ab0476900b2462e04a69b4a78044f7b8592647d81bf9671bcf9`，MSI 60,190,798 bytes / SHA-256 `f142f27214000401c3649bd409e833e785916969ec04340e42c81bdbeb47ad5b`；R2 与 Worker 下载回读一致。包仍为内部未签名状态 `BLOCKED_BY_AUTHENTICODE_SIGNING`。
  - 2.0.6 响应式 Setup 修正（完成）：固定 `620×590`、禁止缩放且无滚动导致的小工作区/高 DPI 卸载控件裁切已改为工作区约束的可缩放窗口、仅垂直滚动的主内容区与固定底部操作栏；展开卸载面板后自动定位到完整表单。Windows 全量 47/47、WiX MSI/Burn 0 warning / 0 error；Computer Use 用已安装 2.0.6 Setup DLL 的非提升只读宿主完成默认尺寸与约 609×415 小窗口目视，卸载码/输入/授权按钮均可达且底部操作栏固定。William 已从 2.0.5 原地升级，注册产品和安装文件为 2.0.6、LocalSystem Service running、当前会话仅一个 Session Agent，普通令牌仍无法读取受保护 ProgramData；未重新配对或执行卸载。R2 latest 已切换 2.0.6：Burn 118,513,641 bytes / SHA-256 `2e78fe219dbf51c1df1d699b6776f3f9047069dcee2927ae10c575cbae7808f7`，MSI 60,194,894 bytes / SHA-256 `d0b6a18f354d965358e4cfd38880e0f6e8b64243143510aaa3f8a7b94468d7c4`；R2 与 Worker 下载回读一致。未修改 Worker/Guardian/Pages/D1，包继续为 `BLOCKED_BY_AUTHENTICODE_SIGNING`。

- [x] **[P0 Cloud/D1] Guardian 逐请求审计清理导致 D1 rows-read 激增（已前向修复）**
  - 证据：24h 28,134,760 rows read；两条 `device_access_audit_v1` 清理 SQL 共 28,014,688 rows read、分别执行 4,190/4,331 次。
  - 根因：`recordDeviceAccessAudit()` 在每个受审计请求后调用 `cleanupDeviceAccessAudit()`；全局 14 日删除缺少 timestamp-only index，逐设备裁剪也在请求热路径重复扫描。
  - 修复：请求热路径只写一条审计记录；14 日过期删除与每设备最多 1000 条裁剪统一移至每日 `0 12 * * *` scheduled maintenance，并通过 additive migration `025` 增加 timestamp-only 与 profile/device/timestamp 复合索引。
  - 生产证据（2026-09-02）：migration `025` 已应用，Guardian Worker `95cd3de1-54f2-4814-8fef-50136eb01a18` 已部署；根接口 200、无凭据 heartbeat 401。6 次新 401 heartbeat 已写入审计，而一小时 Insights 中两条旧清理 SQL 的执行次数保持 `176 / 110` 不变；生产 `EXPLAIN QUERY PLAN` 显示过期删除使用 `idx_device_access_audit_timestamp`。修复前已经产生的当日 reads 不会回退，需等待 Cloudflare 日额度窗口自然重置；后续观察只保留为运营监控，不再作为代码 blocker。

- [x] **[SPEC-004 / D-081] App Runtime 与 TimeOnChrome 统一落账规则 Phase A（本地实现完成，未部署）**
  - 范围：accounting schema v2、Windows/macOS 双 lane 纯状态机、共享黄金向量、Windows 原子 ledger/outbox/open-lane 恢复、Runtime `0004` dry-run 与向后兼容 API/read model。
  - 核心口径：主账本按 `ACTIVE ∪ PIP_ACTIVE` 区间并集；媒体辅助记录直接求和、可重叠、不进配额；idle 180s；checkpoint 60s/estimated cap 30s；reorder 500ms；wall + monotonic dual-clock。
  - 兼容：旧 v1/v2 Segment 与历史统计不改写；`POST /v2/segments:upload` 兼容旧 schema，辅助媒体使用独立上传/ACK。
  - 边界：不修改 Chrome Extension、Guardian、Santa/`native-app-control/`、`workers/`、`pages/` 或生产配置；不部署、不执行生产 D1 migration、不启用 quota/阻止。
  - 验证：.NET 完整测试、Worker tests/typecheck/dry-run、schema/vector 结构校验、`git diff --check`、受保护目录审计；macOS `swift test` 留待 macOS 13+ 环境。
  - 本地证据：Windows .NET 37/37、Runtime Worker+D1 13/13、TypeScript typecheck、generated binding type check、Wrangler dry-run 和 14 组共享黄金向量结构/确定性重放通过；SQLite transaction rollback/open-lane recovery/主辅助 outbox 隔离已覆盖。当前 Windows 无 Swift toolchain，macOS 13+ `swift test` 明确保留为未验证项。`0004` 仅由隔离测试 D1 执行，未应用远端 D1，未部署 Worker/Pages/R2。

- [x] **[SPEC-004 / D-080] Windows App Runtime 2.0 系统级多用户管理（本地实现与验证完成，生产闸门未开）**
  - 目标：管理员一次性 per-machine 安装；LocalSystem Service 管理机器凭据、策略、SQLite/outbox、上传和 watchdog；每个交互式用户会话运行无凭据 Session Agent。
  - 产品模型：机器设置默认 Child，已有和新用户均继承；家长可在 `/app-runtime/` 逐用户改绑 Child 或设为 `unprotected`，并查看 desired/applied 策略状态。
  - 安全：Program Files/ProgramData/Service/LocalMachine DPAPI 受 ACL 保护；普通用户结束 Agent 后自动恢复并记录 tamper；管理员卸载需要 10 分钟单次家长卸载码。不承诺抵抗本机管理员。
  - 兼容：Runtime `0003` 与 Guardian `024` 仅新增 v2 表/接口，v1 历史与查询保留；William 1.x 升级时先清空 outbox、retire 旧 token、保留历史后重配机器一次。
  - 本轮边界：Windows 先行；不实现应用阻止、时间限额、网页过滤、媒体识别或 macOS 系统级安装；不生产 migration/部署/真机升级。
  - 本地证据：Runtime `0003`、Guardian `024`、v2 API、LocalSystem Service、Session Agent、Named Pipe identity check、LocalMachine DPAPI、SID-HMAC、machine ledger/outbox、策略 LKG/ACK、tamper 恢复、机器 Setup、一次性卸载码、1.x preflight、per-machine MSI、Burn bootstrapper 和账户级页面均已实现；MSI/Burn 为 WiX 7 `0 warning / 0 error`。生产 D1/Worker/Guardian/Pages/R2、William 真机升级、多账户系统集成与 Authenticode 仍保持未执行/阻塞。

- [ ] **[SPEC-004 / D-079] Windows App Runtime 可用闭环**
  - 当前阶段：控制面、Windows 安装/配对、独立家长页面和 R2 版本化下载接口已实现并完成内部生产基础部署。Product Owner 已于 2026-09-01 确认满足 WiX 7 OSMF 条件并授权项目使用 `AcceptEula=wix7`；WiX 7 MSI 构建为 0 warning / 0 error。
  - UI 验证：mock 数据桌面 1440px、移动 390px、配对 dialog 已完成真实 Chrome 截图；日/周、周期、设备筛选、总时长、图表、排行、最近同步、设备状态/吊销/重配均在页面结构中匹配。
  - Guardian 控制面：5 分钟 Child-scoped ES256 module token、独立 Runtime lifecycle outbox/service binding；不复用 Santa 密钥。
  - Runtime 控制面：10 分钟配对码、设备列表/heartbeat/吊销/重新配对、Child lifecycle、北京时间小时聚合与日/周查询。
  - Windows：WPF Setup、无控制台 per-user Agent、single-instance、DPAPI、按 device 隔离 SQLite、稳定应用身份与 WiX 7 per-user MSI。
  - 1.0.1 产品化修正（2026-09-01，内部发布完成）：把原单表单+灰色状态文本改为未配对/连接中/等待首次同步/在线/异常五态；只有在线态显示“完成并关闭”，成功后锁定配对输入，显示设备、Agent 与最近 heartbeat，并为 Setup 增加 current-user 单实例。1.0.1 同时修复 major upgrade 的 HKCU 启动恢复与家长页面刷新 token/网络恢复。
  - 1.0.1 发布证据：Windows .NET 22/22、家长页面网络恢复 4/4；桌面 1440px/移动 390px mock 目视无横向溢出、无 console error、无 `Failed to fetch` 原文；MSI 60,144,152 bytes、SHA-256 `13b8bb04607f019acf7a9a5e68fa87f63f8075e8a3d4d4da47ddc885b635fee7`，除 WiX 官方已知 per-user ICE38/64/91 定向抑制外，其余 ICE 为 0 warning / 0 error。William 账户已完成 1.0.0→1.0.1 原地升级，credential/设备隔离 SQLite/device identity/HKCU 启动项均保留；最终 Setup 可访问性验收匹配“在线 / 连接成功 / Agent 1.0.1 / 最近在线 / 完成并关闭”，配对输入隐藏。Pages `7d89c962`、R2 immutable version、latest manifest 与生产 Worker 下载均已回读；真实 Chrome 手动刷新无裸 `Failed to fetch`、设备仍在线。
  - 1.0.1 统计页面修正（2026-09-01，已完成）：生产 D1 已确认 HornburgXW 原始账与小时聚合一致；家长页面原先把已按北京时间解析的本地午夜再次减去 8 小时，实际查询成“前一日 16:00 至当日 16:00”，并错误使用返回数组序号作为小时标签。修复后日/周范围与小时标签均从北京时间 calendar day / `hour_start_ms` 确定性计算；10/10 聚焦测试通过，Pages deployment `e25c319e` 的真实 HornburgXW 验收显示 27 分钟、ChatGPT/Chrome/Setup/Notepad 排行及 17时–20时小时桶，无 console error 或裸 `Failed to fetch`。Agent、Worker、D1 和既有统计数据零修改。
  - 家长端：canonical `app-runtime-management/console/`，构建到 `/app-runtime/`；只显示可理解的设备与统计，不显示 token、Child ID、管理员密钥或服务器配置。
  - 发布闸门：内部 MSI 在 Authenticode 签名前保持 `BLOCKED_BY_AUTHENTICODE_SIGNING`；迁移前远端业务表必须为空；真实测试账号首次配对需 Product Owner 再次明确批准。
  - 部署证据：Runtime D1 三张旧业务表均为 0 后应用 `0002`；R2 `windows/x64/1.0.0` MSI 为 60,139,945 bytes、SHA-256 `847544be830979615f865667a09c690160b42381142a96cdf7174d09ff216c60`；Runtime Worker `8126d3b8-27c3-4c3a-937a-cb11ac4e0ab7`、Guardian Worker `5dcd6678-71f9-4463-b0e4-9bff9a16eccd`、Pages deployment `81fa34db` 已部署。
  - 验证：Windows .NET 11/11、Runtime Worker 7/7、Guardian Worker logic 56/56、两端 typecheck、两端 Wrangler dry-run、WiX 7 build、R2/Worker 下载 hash、严格 CORS 与未认证 fail-closed 通过；MSI `msiexec /a` 只解包验证包含唯一 Setup/Agent 和 481 个文件。部署后 Runtime 五张业务表与 Guardian lifecycle outbox 均保持 0。
  - 已解除 blocker：`BLOCKED_BY_WIX7_OSMF_EULA` 与 Wrangler OAuth 授权问题已解除。
  - 剩余 blocker：`BLOCKED_BY_AUTHENTICODE_SIGNING`；干净 Windows 测试账号的安装/升级/卸载仍未执行，William 当前账户的登录重启仍待验证。旧 `ADMIN_API_KEY` 已无 API/代码消费者，但删除 secret 不在 1.0.1 本轮范围，需单独授权处理。
  - 真实配对更新（2026-09-01）：Product Owner 已批准并在 William 当前账户把 `INTELMINIPC-XW` 配对到 HornburgXW；云端设备在线、本地 DPAPI/设备隔离 SQLite/segment ACK 已观察到。首次配对、1.0.0→1.0.1 升级、保留数据的卸载重装和 Setup UX 已验证；登录重启仍待验证。

- [x] **[SPEC-004 / Production Bootstrap] 共享 Runtime Worker/D1 首次部署**
  - 授权：Product Owner 于 2026-09-01 明确要求部署；D-078 仅解除 Runtime 后台的部署边界。
  - 目标：创建独立 `timeonchrome-app-runtime` D1、应用 `0001_runtime_backend.sql`、配置 `ADMIN_API_KEY` secret、部署 `timeonchrome-app-runtime-api`。
  - 门禁：复跑 typecheck、Workers+D1 集成测试、Wrangler types/dry-run/startup check；部署后只执行 health、migration 和空表计数验证。
  - 禁止范围：不创建真实 enrollment/device/segment，不安装 Windows Agent，不修改或部署 Guardian、Santa、Pages、Chrome Extension。
  - 状态：独立 Runtime D1 已创建于 APAC，`0001_runtime_backend.sql` 已应用且无待办；Runtime-only secret 已配置；Worker 最终版本 `3f057d03-0b2c-4482-9925-0979258e3945` 已部署到 Workers endpoint。
  - 验证：health 200；无管理员凭据和无设备凭据均 401；enrollment/device/segment 表计数均为 0；未创建真实业务数据。

- [x] **[SPEC-004 / Windows-first Phase 2 技术底座] Windows Runtime Agent + 共享 Runtime 后台**
  - 产品范围：完成 Windows 真实事件采集、SQLite 不可变 ledger/outbox、DPAPI credential、HTTP upload、每用户启动管理，以及 macOS/Windows 共用 Runtime Worker/D1。
  - 身份边界：独立一次性 enrollment code、Runtime device/token 和不透明 `subjectId`；不复用 Santa/Chrome Device/Guardian 凭据或表。
  - 后台范围：完成 enrollment、device self、幂等 segment upload 与逐项 ACK；D-078 后独立 Runtime Worker/D1 已完成首次生产 bootstrap。
  - macOS：保持 Phase 1 Core/Agent 骨架，真实事件、SQLite 和上传留待后续。
  - 状态：Windows WinEvent/idle/session/power/snapshot、SQLite ledger/outbox、DPAPI credential、HTTP uploader、HKCU startup，以及共享 Worker/D1 enrollment/auth/idempotent upload 已实现。
  - 验证：Windows Release build/test、framework-dependent publish、共享状态机/hash 向量、SQLite/DPAPI/ACK 测试、Worker runtime+D1 测试、binding type freshness、TypeScript、Wrangler dry-run/startup check、远端 migration 与生产 smoke 通过；未运行真实家庭采集。
  - 禁止范围：不修改 `native-app-control/`、`extension/`、`workers/`、`pages/`；除 D-078 明确授权的独立 Runtime bootstrap 外，不触碰既有生产数据、secret 或真实家庭设备。

- [x] **[SPEC-004 / Cross-Platform Phase 1] App Runtime Management 统一架构与双平台技术骨架**
  - 分支：`codex/macos-app-management-v1`；独立 worktree；起点 `5c2e04104017259c72de573ab000353cf82b68fb`。
  - 产品边界：一个 App Runtime Management 产品，macOS Swift 与 Windows .NET 8 为两个原生实现，共享契约、黄金向量和未来 Runtime 后台。
  - 实现范围：迁移现有 macOS 骨架；新增 Windows Core/Agent/xUnit；新增 JSON Schema、黄金向量与 contract-only backend types。
  - 状态：D-076、跨平台 SPEC-004、统一目录、共享契约/黄金向量、macOS 骨架迁移、Windows Core/Agent/xUnit 与 contract-only backend types 已完成。
  - 验证：Windows .NET 8 build/test、共享 8 组黄金向量结构检查、backend TypeScript typecheck 与受保护目录检查通过；macOS `swift test` 留待 macOS 13+ 环境执行，当前 Windows 不宣称通过。
  - 禁止范围：不修改 `native-app-control/`、`extension/`、`workers/`、`pages/`；不部署、不写 SQLite、不上传、不采集真实家庭数据。


## NOW

- [x] 在 `codex/app-runtime-integration-v1` 完成同仓独立模块集成并通过 PR #8 合并 master。
- [x] 建立 `@timeonchrome/app-runtime-contracts@1.0.0` workspace package，移除 Guardian 对 Runtime 源码的相对路径引用；外部 registry 发布留待拆仓。
- [x] 完成 SSO ticket、Runtime browser session、独立 Runtime Pages 与 `0007` 本地及生产验证。
- [x] 增加 Runtime、Guardian integration、主控制台入口三类 CI/release gates；CI 全部通过。
- [ ] 独立诊断设备详情同步时间和 Tamper 累计值，不混入生产边界收尾。

## RELEASE GATES

- [x] Runtime 远端 migration `0006/0007` 文件名与源码一致，已执行。
- [x] Guardian 历史 migration 追踪为空的问题采用只读基线与显式单文件策略处理，未执行全量 apply。
- [x] 独立 SSO ES256 key pair 已配置；不复用 Santa、lifecycle 或机器 token 密钥。
- [x] 独立 Runtime Pages 已真实验证；主 Pages 无 Runtime 静态副本，旧地址只保留 launch 跳转。
- [x] 本轮所有生产部署均来自已合并的 `origin/master@d8f79ec` 干净提交，资源版本已记录。

## LATER

- [ ] 将 `app-runtime-management/` 保留历史迁移到 `timeonchrome-app-runtime` 独立仓库。
- [ ] 将 contract 依赖从 workspace 切换为固定版本 GitHub Package。
- [ ] 完成 Authenticode 签名并解除内部包发布阻塞。
