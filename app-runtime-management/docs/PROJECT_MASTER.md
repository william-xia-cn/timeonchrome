# App Runtime 项目真值

## 最新生产发布（2026-09-16）

- PO 明确批准本次使用现有 Wrangler 登录发布例外，不提取/搬运 OAuth 凭据，不替代 GitHub production token 配置。
- PR #14 当前提交跨平台 CI 全通过，合并源码 `fa2c3d49fe0837581e87ad598268b26bc6b0f1d3`、contracts 1.2.0；D 盘独立干净发布工作树再次通过 Worker 38/38、类型、binding、模块边界及 dry-run。
- 唯一待执行 `0009_runtime_inventory_scans.sql` 精确核对并应用成功，随后无待执行 migration；不改写旧观察或历史账本。
- Runtime Worker `c7a57148-5568-4cd2-a6d5-e21c2d3a1041`；独立 Runtime Pages `54ebbd84-9ee6-4fc4-98dd-1ee0dcdfd73c`，Source `fa2c3d4`。稳定域 HTML/JS/CSS SHA-256 与源码逐文件一致，四个模块/机器接口未认证均为 401。
- Guardian、主 Pages、R2 本次不部署；R2 latest 回读仍为内部未签名 2.0.6。升级前本机 2.2.0 Service Automatic/Running、单一 Session Agent。2.2.1 Burn 哈希复核通过，PO 选择手工安装；尚未确认安装成功或真实新版完整盘点。
- 下方旧生产/准备记录保留为历史，以本节最新事实为准。GitHub production token 缺失仍影响未来自动发布，不影响本次已批准并完成的 Wrangler 本机发布。

安装后只读验收：PO 已手工安装 2.2.1，正式三个程序 ProductVersion 2.2.1/FileVersion 2.2.1.0；Service Automatic/Running、单一 Session Agent。云端机器仍为一台、未吊销，新版 heartbeat 与主账本上传成功，策略 13/13 已生效，旧 v1 历史 172 条保留。ProgramData 普通权限访问仍拒绝，未弱化 ACL 或读取 credential 内容；本地 outbox 全空与精确文件数据保留不伪报已验证。新版扫描观察 456 个唯一技术对象（不是 456 个独立产品），存在 executable-evidence-unavailable 来源结果，完整盘点仍不能宣称通过。

扫描收口：3 个数据批次加 0 观察完成回执全部到达云端（completed=1），456/456 观察且唯一数 456，精确键重复 0。新版观察元数据为应用入口 145、组件 207、候选 104；其中应用入口 appList 友好名称 45 个。历史无 discovery 元数据观察仍有 91 条，未删除。2 个快捷方式目标证据未取得，云端状态应为 partial，不能误称完整或对未知区间推断卸载。安装程序列表 DisplayVersion 2.2.1、公共桌面 TimeWhereMg 入口存在；本轮未执行重启、多账户或管理员管道验收。

## 当前修复与生产基线（2026-09-16）

- ARM-D-012 目录质量修复位于 `codex/app-runtime-inventory-quality-v1`；contracts 1.2.0、Windows 2.2.1 本地代码/最终包已验证，最终代码 6e8618f 的 Windows/WiX、contracts-worker-console 和真实 macOS 15 Swift CI 35002959346 全部通过。源码未合并，不代表生产已更新。
- 已安装客户端为手工升级的 2.2.0；当前生产应用分类基线为已合并 master `b133f78f5deeadd3af377d88f5848f85e66fc5c9`、contracts 1.1.0、Runtime migration 0008。Runtime Worker `2543375b-f8c6-4acc-92f2-d7eca56c5068`、Runtime Pages `3ec2fd7e-828b-4598-b89f-6e63dd771a0d`；Guardian、主 Pages 与 R2 latest 2.0.6 保持原基线。
- 该基线来自前轮实际发布/安装检查，本次没有重新部署或执行生产盘点。旧数据保留，不能据上传数量宣称完整发现或干净产品目录。
- 新增 0009 只完成本地迁移测试；受测代码合并后，必须另获授权先发布 0009/Runtime Worker/Console，再升级 2.2.1。新 discovery/scan 字段不被旧严格校验 Worker 接受；不得先升级客户端造成上传失败。
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

- Runtime D1 按已批准清单和远端记录精确核对；`0006/0007/0008` 已前轮执行，本次新增待发布 `0009_runtime_inventory_scans.sql`，当前仅完成本地测试。不得自动应用其他待执行文件或重命名既有 migration。
- 发布配置补全中（PO 授权）：生产只使用固定的已合并 master SHA；Runtime Worker/Pages 可独立选择，Guardian/Main Pages 默认不部署，migration 另行显式选择。GitHub production 环境只允许 master，并要求 PO 人工审批；缺失部署 API token 时停止，禁止搬运本机 OAuth 凭据。
- Guardian 远端 `d1_migrations` 当前没有历史记录；禁止执行自动全量 migration apply。
- 独立 Runtime Pages、独立 SSO 密钥、Runtime Worker、Guardian adapter 和主 Pages 入口必须可以分别回滚。
- Authenticode 未完成前，Windows 包继续标记 `BLOCKED_BY_AUTHENTICODE_SIGNING`。
