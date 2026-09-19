# App Runtime Management

## 当前修复：Windows 内置系统工具精确规则

ARM-D-021 使用云端精确 package family 将截图工具、手机连接、时钟、照片、画图和相机投影为系统工具；同名第三方和未审核微软产品不命中。规则同时覆盖 package container 与 `!App` 入口，容器继续只进入技术记录，因此无需升级 Agent 或重新扫描，也不会改变分类、配额、账本和历史 Segment。

## 当前热修：精确目录规则与默认顺序

ARM-D-020 使用云端稳定强身份把 Steam 投影为游戏平台／启动器、把 Windows Terminal 投影为系统工具；Bing News（资讯）继续作为普通内容应用。五分类目录内默认顺序为普通应用、游戏、系统工具。该修订无需升级 Agent 或重新扫描，不改变孩子管理分类、账本、历史 Segment 和配额。

## 当前扩展：云端目录四层分组

ARM-D-018 在五个孩子管理分类内部增加 Worker 权威的游戏、普通应用和系统工具分组；非可管理组件继续进入系统管理的技术记录。confirmed 游戏/游戏平台进入游戏组，系统工具只接受受控精确身份，疑似游戏和未知对象保持普通应用。该展示分组不改变实际管理分类、配额桶、账本或历史数据。

## 当前修复：产品目录云端纠错与发行证据补全

ARM-D-017 把 MSIX 包容器与可启动应用分开：package family 只作技术容器，可信 AUMID 入口作为独立可管理应用；Win32 套件继续使用可靠安装产品锚点聚合。Worker 动态修复便笺、入门、Windows 备份、单击以执行和刺客信条等现有 2.3.1 盘点投影，无需先升级终端，也不改写历史账本、分类或配额。

生产核对同时更正 ARM-D-016 的完成状态：2.3.1 的完整独立发行扫描只有 Steam/Epic，EA/Ubisoft/GOG 仍只是注册表机会性识别。contracts 1.8.0 保留 1.7.0 的发行来源能力，并增加云端目录分组字段；Windows 2.4.0 第二闸已完成本地候选与构建验证，安装与 R2 latest 切换必须另行过闸。

## 当前扩展：自动产品类型识别

ARM-D-016 把客观 `appType` 与孩子管理 `classification` 永久分开。Windows 2.3.1 具有 Microsoft Store、Steam/Epic 独立来源及 EA/Ubisoft/GOG 注册表机会性证据；Windows 2.4.0 才补齐后三者的独立来源。Worker 用版本化知识确认产品类型。游戏默认只获得“建议归为受限娱乐”，家长启用类型规则后才自动分类；具体产品覆盖优先。配额仍只按最终管理分类计算。contracts 当前目标版本为 1.8.0，macOS 本轮仅保持契约兼容。

Windows 2.3.1 是 2.3.0 的最小前向修复：把 Service 本地完整扫描来源容量从 6 对齐到 8，使包含 Steam/Epic 的 7 来源扫描可以进入持久 outbox 并上传。它不改变扫描事实、分类、账本或配额，也不需要重新配对或清理现有数据。

## 当前扩展：普通应用与系统应用分组

ARM-D-015 将可管理对象继续区分为普通应用和系统应用，并把两者与只读技术记录分开。快速助手、记事本、计算器等具有强 Windows 系统归属证据的可见应用仍可分类和配置配额；更新器、卸载器、helper、驱动入口和运行库继续只进入技术记录。系统归属不依赖名称或 Microsoft 发布者，不改变主账本、历史 Segment 或配额计算。

来源分组由 Runtime Worker 依据终端已上传的可信 `packageId` 和云端版本化规则生成；Agent 的 `applicationOrigin` / `originEvidenceCode` 仅为非权威提示。纯展示规则更新不要求升级安装包，旧 Windows 2.2.3 数据可直接参与投影。contracts 保持 1.5.0 兼容，2.2.4 不再作为 latest 分发。

## 当前修复：游戏候选与孩子上下文

应用目录对受控确定名称的游戏产品显示高置信候选提示，但不替家长自动修改孩子分类或配额。contracts `1.4.0` 让主控制台进入独立 Runtime Pages 时把当前选中的孩子写入 60 秒签名 SSO ticket；Runtime 新会话优先打开该孩子，旧 ticket 仍回退到孩子列表第一项。

## 当前修复：生产产品目录收口

HornburgXW 真实完整扫描已验证来源结算正常：无来源 legacy installed 投影已从 196 降为 0，LibreOffice 为一个产品和七个变体，记事本为一个产品，`Create React App Sample` 仅保留一条技术记录。剩余污染来自缺少结构化组件标志的 Registry 安装记录，以及名称带版本/架构装饰的孤立入口。read model 现在把通用维护语义降为只读审核记录，并将唯一产品旁的装饰名称入口降为“可能变体”；两者都不删除事实、不确认关联、不继承分类，也不改变账本或配额。

线上回读补充收口：维护安装产品不能再被同组启动入口反向提升；同一装饰名称 family 下多个互不关联产品统一降为歧义审核；没有可信父产品或家长确认的 v2 独立入口保持候选。安装产品、已确认便携产品和可靠父产品的变体仍正常进入目录。

生产主目录最终收口继续将明确的中英文驱动、芯片组组件、兼容性数据库、认证工具和构建工具降为只读审核；该名称信号不删除扫描事实，也不覆盖已确认产品或家长明确分类。

## 当前修复：完整扫描缺失对账与单入口降噪

生产只读检查确认，inventory v2 完整扫描已经上传，但 Worker 只保存来源结果，没有在完成标记时把本次缺失对象结算为 `notObserved`，导致旧兼容记录继续显示为 installed。同时大量单入口产品在页面重复显示一个同名 `main` 变体。修复将按成功来源安全降级缺失状态、在已有权威 v2 扫描时停止采用无来源 legacy installed 证明，并只在页面折叠冗余单入口；原始观察、历史 Segment、分类和配额全部保留。

## 当前热修复：同名歧义产品与孤立入口只进入技术记录

HornburgXW 2.2.3 完整扫描已上传。LibreOffice 已正确形成一个产品和多个变体；但多个来源若产生同名、不同强身份的安装产品（真实例为 `Create React App Sample`），不能因名称自动确认或在主目录重复展示。若只有一个安装产品，而同名 Start Menu/运行入口缺少可靠父关联（真实例为 BlueJ、Node.js、Steam），仍只保留安装产品为主行，孤立入口降为只读“可能的产品变体”。两类规则都保留原始扫描，不以名称确认产品，不改变账本、分类和配额。

## 当前热修复：Windows 2.2.3 inventory v4 管道兼容

2.2.2 真机升级后确认程序、Service、Session Agent 和配对正常，但产品级盘点未上传。根因是 Session Agent 已发送 inventory schema v4，而 Service 管道仍只接收 v3。2.2.3 仅修正 Service 的 v3/v4 兼容入口并增加回归；Worker、D1 schema、主账本、媒体账本、配额和历史数据不变。

## 当前修复：Windows 2.2.2 产品级应用清单（ARM-D-014）

应用目录从“可信入口列表”升级为“安装产品 + 可展开变体 + 技术记录”。Windows 安装产品形成主行，Start Menu、包入口和运行身份作为变体；LibreOffice 等套件默认一行，显式拆分后才独立分类。盘点按来源独立结算，单项坏快捷方式只产生 warning，不再阻断其他来源清理。contracts 目标版本 1.3.0，Runtime additive migration 为 0010，历史 Segment/时长/配额不变。

代码已合并 `master@38e55f9`，生产 0010、Runtime Worker、独立 Runtime Pages 和 R2 latest 2.2.2 已发布。干净 master 重建的 Burn SHA-256 为 `85cc679f8aa61d175f50530fbc7bf7c51904641e3cc1638df14ce15a89db60ca`，MSI SHA-256 为 `6946c4e90bc087cb2ba4087e98db126e12d993c994059c1fd720df6924d3a6aa`。HornburgXW 当前仍为 2.2.1，等待原地升级和真实扫描验收。

## 当前修复：产品应用投影（ARM-D-013）

应用管理不再把所有历史进程身份直接当作产品。已确认产品和具有可靠证据的主应用进入五分类目录；组件/瞬态对象隐藏，弱候选及证据不足的历史身份进入系统管理的只读技术进程记录且不能分类。该修复已完成本地 Worker/Console 与桌面/移动视觉验证，只调整 read model 和页面交互，不改原始 Segment、历史时长、配额或安装数据；尚未部署生产。

## 历史修复：2.2.1 目录质量（ARM-D-012）

发现降噪、可信安装/运行关联、目录范围和盘点完整性已完成本地修复。Windows tests 95/95、contracts 1.2.0 的 23 组黄金向量、Worker 38/38、Schema/类型/binding/dry-run 和桌面/移动 mock 目视通过；Swift 编译及共享向量已在 macOS 15 CI 实际执行通过。保留所有原始身份与历史账本，不将旧夹具通过当成真机完整盘点证明。

最终候选包为 `artifacts/release/windows/x64/2.2.1/TimeOnChrome-AppRuntime-Setup-win-x64-2.2.1.exe`；MSI/Burn 及版本/哈希回读通过，Burn SHA-256 `1df0d8f3b23fe82c241bd6eef761d329186d293812b4bbeab26d4e6aa48115f5`。保持 `BLOCKED_BY_AUTHENTICODE_SIGNING`。本机当前已安装 2.2.0，云端分发 latest 仍为 2.0.6；本次未安装、部署或清理生产记录。

发布前必须先合并受测代码并获授权发布 additive `0009`、Runtime Worker 和独立 Console，再原地升级 2.2.1。旧生产 contract 1.1.0 严格校验不接受新 discovery/scan 字段；本地 latest.json 不代表云端已切换。下方 2.2.0 包准备与早期发布段为阶段历史，当前状态以本节和 `docs/PROJECT_MASTER.md` 为准。

## Windows 2.2.0 客户端包准备

新应用发现与分类客户端内部 2.2.0 本地包已准备并验证，避免与本机旧 2.1.1 同号。明确 2.2.0 参数的 Windows 测试 90/90；MSI/Burn 均零警告/错误；六个程序集、MSI 文件清单、固定 UpgradeCode 和包哈希通过实际产物回读。既有安装身份、配对、机器数据和账本不变。未安装、不代表安装清单已上传，也未发布 R2/latest。内部未签名状态仍为 BLOCKED_BY_AUTHENTICODE_SIGNING。

包目录为 `artifacts/release/windows/x64/2.2.0/`，用户入口为 `TimeOnChrome-AppRuntime-Setup-win-x64-2.2.0.exe`（Burn），不是直链 MSI。Burn SHA-256：`1576a1840d5f74b91177aa1a7c0d9d0bd6b236067749d2ba722489de9bc087f0`；MSI SHA-256：`b4bb5680a750ded4cee1004e3594b1a26a8e9056d818fc95c72995864c9388d4`。同目录 manifest 已核对大小和哈希；本地 latest.json 只是候选，不代表云端 latest 已切换。

## 应用分类规则阶段（ARM-D-011，本地实现与 mock/CI 验证完成）

应用管理新增家庭确定性产品与通用分类规则。家庭复用识别知识，孩子分类独立；规则包预览批准，未知应用仍未归类。产品关联不替换旧 runtimeIdentity，不追溯重算历史。Windows 发现已接入 Service 的独立清单事务/outbox；macOS 仅显式只读发现适配器。本阶段不部署、不阻止、不升级本机，不自动上传真实家庭盘点。功能分支 contracts 为 1.1.0；现有生产 contract 1.0.0 不因本轮本地修改改变。Windows 90/90、Worker 35/35 与桌面/移动 mock 通过；macOS 15 CI 已真实执行并通过 swift test。代码 SHA 58b1cfc 的跨平台 CI 34973586475 全绿（含 Windows MSI/Burn build），不等同于生产发布或家庭真机验收。

App Runtime Management 是 TimeOnChrome 的跨平台前台应用使用时间能力。macOS 与 Windows 是同一产品的两个原生 Agent，共享事实模型、Usage Segment、上传协议和 Runtime Worker/D1；Santa Native App Control 继续独立负责应用发现、审核与阻止。

本模块在 TimeOnChrome 仓库内独立构建、测试、版本和部署。项目真值位于 `docs/`；共享协议由 `@timeonchrome/app-runtime-contracts@1.0.0` 提供。Runtime Console 的 canonical source 是 `console/`，发布到独立 `timeonchrome-app-runtime-console` Pages 项目，不再复制到主控制台 Pages。

## 当前实现状态

- Windows：1.x 的 WinEvent、idle、session/power、SQLite/outbox、CurrentUser DPAPI、WPF Setup 与 per-user MSI 已实现并作为兼容基线。D-080 的 2.0 本地实现已升级为 LocalSystem RuntimeService + 每交互式会话 Session Agent + ProgramData/LocalMachine DPAPI + WiX 7 per-machine 安装；内部 MSI 尚未签名，不能称为公开发布产品。
- Backend：v1 Child-scoped 设备闭环保留兼容；D-080 v2 新增 Account-scoped machine、默认 Child、逐本地用户 assignment、版本化策略/ACK、tamper 健康和单次卸载码。Runtime/Santa 身份、表、密钥和协议继续隔离。
- macOS：Phase 1 Core/Agent 骨架；真实事件、SQLite 与上传尚未实现。
- Accounting Phase A：共享 schema v2、Windows/macOS 纯状态机、确定性 SHA-256、黄金向量、Windows 原子 SQLite ledger/outbox 和 Runtime Worker 向后兼容 API 已完成；主 `UsageSegment` 在同一用户会话与 clock epoch 内按 foreground/PiP 区间并集计算权威使用时长，独立 `MediaSegment` 可重叠直接求和但不进主时长或 quota。统一参数是 idle 180s、checkpoint 60s、estimated cap 30s 和 reorder window 500ms。Runtime `0003`/`0004` 与 Worker 已发布；macOS `swift test` 待 macOS 13+ 验证。
- 家长页统计读取：`/v2/module/usage` 保留 v1 与旧 v2 小时聚合历史；`/v2/module/accounting` 提供 accounting v2 的权威区间并集、小时 buckets 与应用排行。页面合并两个互不重叠的来源，不把辅助媒体 Segment 计入总使用时间，也不得在 accounting v2 已上传时误报“暂无使用记录”。
- App Management Console Phase B：独立 Runtime Pages 使用与主控制台一致的外壳，顶层固定为使用统计、访问管理、应用管理、设备管理和系统管理。主控制台通过 60 秒单次 SSO ticket 启动页面；Runtime 页面把兑换后的 8 小时 session 只保存到 `sessionStorage`，不写 URL、cookie、localStorage 或日志。旧 `/app-runtime/` 书签回到主控制台 launch 流程。现有生产静态副本属于待替换基线，不再是源码发布模式。
- D-090 Terminal Logging（本地完成，未部署）：系统管理已增加机器级远程日志打开/关闭、最低等级、类别和最长 7 天 TTL；Windows Service 已建立结构化本地日志、独立 SQLite outbox 和逐项 ACK 上传，覆盖 Service、Session Agent、策略、账本上传、存储、heartbeat、控制管道与 tamper。远程默认关闭，关闭期间不生成未来补传积压；本地日志继续有界保留，日志-only 策略更新不切主账本 lane。协议禁止用户名、SID、Child ID、runtime identity、路径、窗口标题、token、配对码、原始异常和 stack。additive `0006`、Worker 与 staged Pages 只完成本地验证；macOS 当前只共享 contract，不宣称有终端采集。
- D-091 TimeWhereMg（2.1.1 本机已安装，未部署）：安装后的 WPF Setup 已升级为托盘常驻的 `TimeWhereMg` 服务管理应用；标准账户只读裁剪状态，管理员经 UAC 完成配对、同步、Service 启停/重启、repair 和一次性卸载。2.1.1 在保留开始菜单与 HKLM 全用户托盘自启动的同时，由 MSI 增加公共桌面 `TimeWhereMg` 快捷方式；入口只指向正式安装目录，不依赖源码 worktree。William 本机已从 2.0.6 原地升级，Computer Use 复验快捷方式启动、在线/已配对状态、策略应用和隐藏到托盘均通过；RuntimeService 为 Automatic/Running，单一 Session Agent 正常运行。TimeWhereMg 只是本机 UI 品牌，RuntimeService、安装身份、ProgramData 与云端协议不改名；Session Agent 保持内部采集子进程。
- 部署：Guardian `024`、Runtime/Guardian Worker 与账户级 `/app-runtime/` Pages 已于 2026-09-02 发布；历史 2.0.0/2.0.1/2.0.2/2.0.3 对象保持不可变。2.0.3 已完成机器级安装，2.0.4 修正控制管道身份传递并增加常驻 loop 日志与退避恢复。2.0.5 修正首次用户上报未推进策略版本导致 Session Agent 不启动、WTS 用户名 ANSI/Unicode 解码错误及 accounting v2 已上传但页面误显示为零；2.0.6 将 Setup 改为受工作区约束的响应式窗口、可垂直滚动主内容和固定操作栏，避免高 DPI 下裁切卸载表单，William 已原地升级且 R2 latest 已切换 2.0.6。生产 Runtime Worker 当前版本为 `135c57b8-ed3a-4fd6-8f61-d862d8a92ecd`，当前 Pages deployment 为 `3164aad7`。2.x 下载路由必须从版本 manifest 选择 Burn bootstrapper，manifest 缺失或非法时 fail closed，绝不能回退 MSI。所有内部包均未签名，保持 `BLOCKED_BY_AUTHENTICODE_SIGNING`。

## Windows 开发命令

```powershell
dotnet restore agents/windows/TimeOnChrome.AppRuntime.sln
dotnet test agents/windows/TimeOnChrome.AppRuntime.sln --configuration Release
dotnet publish agents/windows/src/TimeOnChrome.AppRuntime.Agent/TimeOnChrome.AppRuntime.Agent.csproj --configuration Release
pwsh installer/windows/build.ps1 -Version 2.1.1
```

面向家长和普通 Windows 用户的正式流程不使用 CLI：家长从 TimeOnChrome 主控制台进入独立 Runtime Console，为机器选择默认孩子并生成一次性配对码；安装后在 TimeWhereMg 中完成配对。服务器地址由安装包固定为产品 Runtime endpoint。

Setup 采用未配对、连接中、等待首次同步、在线和连接异常/需要重新配对的明确状态。enrollment 完成只表示本地绑定已保存；Agent 首次 heartbeat 写入不含凭据的本地健康快照后，Setup 才显示在线。已绑定状态锁定配对输入并提供“完成并关闭”，关闭 Setup 不停止 Agent；同一当前用户只允许一个 Setup 实例。

1.x MSI 保留为 per-user 历史兼容。2.x 使用新的 machine-scope UpgradeCode 和 per-machine MSI，安装到 Program Files，Service 数据位于只允许 SYSTEM/Administrators 访问的 ACL 保护 ProgramData。Burn bootstrapper 先以 elevated machine probe 扫描除当前交互式用户外的真实 profile，发现其他用户仍有 1.x credential/已加载启动项时列出本机账户并停止；随后才在启动安装器的原交互式用户上下文确认当前用户 outbox、读取 CurrentUser DPAPI、retire 旧 token、移除精确 HKCU 启动项、卸载旧 per-user MSI 并保留旧 SQLite 为 legacy 证据；最后安装 per-machine MSI 并要求重配机器一次。任一阶段权限不足均 fail closed。链内 MSI 由自己的 MajorUpgrade 管理并对 Burn 标记为 permanent；Bundle/MSI 的“程序和功能”删除入口均隐藏，正常卸载只能从 Setup 输入云端一次性卸载码后提升执行。当前内部包未做 Authenticode 签名，发布状态必须保持 `BLOCKED_BY_AUTHENTICODE_SIGNING`。

Windows 2.1.1 本地构建产物位于 `installer/windows/bin/Release/`：`TimeOnChrome-AppRuntime-win-x64.msi` 是 per-machine MSI，`TimeOnChrome-AppRuntime-Setup-win-x64.exe` 是用户应运行的 Burn bootstrapper。MSI 安装 `TimeOnChrome.AppRuntime.Manager.exe`，开始菜单、公共桌面与托盘显示 `TimeWhereMg`；Burn 仍保留 Setup 命名。migration 使用单文件 self-contained 发布；构建脚本会把最终 EXE 单独复制到临时目录执行 `--package-probe`，实际加载 SQLite 与 CurrentUser DPAPI，失败时阻止 MSI/Burn 生成。通过后脚本在 `artifacts/release/windows/x64/2.1.1/` 生成版本化副本和 manifest，并在 `artifacts/release/windows/x64/latest.json` 生成待发布候选指针；Burn 为 118,621,597 bytes、SHA-256 `c602facaec8ab718f48e66b3b4959acea60a790421fd214daa7f4e1bd6859b77`，MSI 为 60,301,664 bytes、SHA-256 `ca3ac3b1467ddc8569a948548ac58c19f53f39f6c99ba81350b0dc2997a23e14`。它不会自动安装、配对、迁移生产数据或发布 R2。

TimeWhereMg 的主内容区在小工作区或高 DPI 下自动出现垂直滚动条，底部操作栏固定可见；窗口允许缩放并由当前 Windows 工作区限制初始和最大尺寸。标准用户只看到经过裁剪的管理状态；管理员经 UAC 打开 Service 控制、立即同步、安装修复、配对和一次性卸载入口。关闭普通窗口只隐藏到托盘，不停止 Runtime Service；管理员窗口不驻留托盘，标题栏“×”和底部“关闭”都会结束提升后的管理员进程并释放单实例锁。

Runtime 页面手动刷新复用当前未过期的 RuntimeSession；会话绝对到期或 API 返回 401 时清除本地 session 并返回主控制台重新签发，不在 Runtime 站点保存 Guardian refresh token。只读加载最多进行一次网络重试，写操作不对未知网络结果自动重放。页面不直接显示浏览器原始 `Failed to fetch`。

## 内部发布路径

- manifest：`windows/x64/latest.json`
- Burn：`windows/x64/<version>/TimeOnChrome-AppRuntime-Setup-win-x64-<version>.exe`
- MSI：`windows/x64/<version>/TimeOnChrome-AppRuntime-win-x64-<version>.msi`
- API：`GET /v1/releases/windows/x64/latest` 与 `GET /v1/releases/windows/x64/:version/installer`

Burn、MSI 与 SHA-256 必须上传独立 `timeonchrome-app-runtime-releases` R2 后再回读校验；Pages 不保存大二进制。2.0 起用户入口必须分发 Burn bootstrapper，不得以直链 MSI 绕过 migration preflight。版本文件使用 immutable cache，latest manifest 使用短缓存。

本地 `2.1.0` Burn 为 118,658,121 bytes、SHA-256 `010221a2ff55acf306a4bcaa3ef9f2bc0bc919cc4ce1589e9d05b757c0b0a1c0`；MSI 为 60,301,602 bytes、SHA-256 `f6cf4428712e5a097501c935e21324c9fca1db46dcdfe6d02b033cf43c189876`。该版本尚未安装到 William 当前机器，也未上传 R2 或切换 latest；内部包未签名，状态为 `BLOCKED_BY_AUTHENTICODE_SIGNING`。已发布的 `2.0.6` 生产对象保持不变。

已发布的内部 `1.0.0` MSI 为 60,139,945 bytes，SHA-256 `847544be830979615f865667a09c690160b42381142a96cdf7174d09ff216c60`。内部 `1.0.1` 为 60,144,152 bytes，SHA-256 `13b8bb04607f019acf7a9a5e68fa87f63f8075e8a3d4d4da47ddc885b635fee7`；William 账户已完成从 1.0.0 到 1.0.1 的原地升级，并验证 credential、设备隔离 SQLite、设备身份与登录启动项保留。版本化 R2 与生产 Worker 下载回读均一致，Pages deployment 为 `e25c319e`，日/周范围与小时标签按北京时间确定性计算；两版 manifest 状态均为 `BLOCKED_BY_AUTHENTICODE_SIGNING`。

## Backend 本地验证

```powershell
npm --prefix backend install
npm --prefix backend run wrangler:types
npm --prefix backend run typecheck
npm --prefix backend test
npm --prefix backend run dry-run
```

复制 `.dev.vars.example` 为未跟踪的 `.dev.vars`，配置测试用 Guardian Runtime 公钥。测试使用隔离的本地 D1，不访问远端数据库。

## GitHub 生产发布配置

`App Runtime Production` workflow 只允许 master，固定 workflow dispatch 的 Git SHA，并在部署前重新确认仍是 origin/master。Runtime Worker、Runtime Pages、Guardian Worker、主 Pages 分别选择；后两项默认关闭。migration 默认不执行，开启时必须与远端待执行文件名完全一致；有 pending migration 而未允许应用时不得部署新版 Runtime Worker。

GitHub `production` environment 只允许 master，要求 Product Owner 人工审批。`CLOUDFLARE_ACCOUNT_ID` 放在 environment variables；`CLOUDFLARE_API_TOKEN` 放在 environment secrets，由 PO 从 Cloudflare 创建专用部署 API token 后在 GitHub 设置页面输入，禁止放入聊天、代码、日志或复用/复制本机 Wrangler OAuth token。没有配置时 workflow 在任何生产变更前失败关闭。

manifest 从受测 contracts/package.json 读取版本，分别记录实际应用的 migrations、选择发布的资源和各资源的实际版本；不把未发布资源伪记为本次更新。本轮云端更新不包含 Windows 安装升级或 R2 latest 切换。

## 安全边界

- 不记录或上传 executable path、窗口标题、URL、键鼠内容或屏幕数据。
- 不在日志中输出 enrollment code、device token 或本机 executable path。
- Runtime 不读取 Santa enrollment、MachineID、策略数据库、事件队列、同步协议、表或凭据。
- 本目录的 `0001_runtime_backend.sql` 已按 D-078 授权应用到独立 Runtime D1；`0002` 已在远端 enrollment/device/segment 全部为 0 后应用。
- Runtime ES256 key pair 与 Santa 完全独立；Guardian 只保存私钥，Runtime Worker 只保存公钥。
- 旧 `ADMIN_API_KEY` 已无路由或代码消费者；在真实 Guardian → Runtime module-token 成功链路验证前，生产 secret 暂不删除。
