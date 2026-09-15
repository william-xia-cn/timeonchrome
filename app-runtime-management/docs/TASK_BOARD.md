# App Runtime 任务板

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
