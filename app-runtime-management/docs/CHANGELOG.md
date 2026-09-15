# App Runtime Changelog

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
