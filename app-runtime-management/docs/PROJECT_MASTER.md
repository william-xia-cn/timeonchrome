# App Runtime 项目真值

## 当前修复与生产基线（2026-09-16）

- ARM-D-014 产品级应用清单正在 `codex/app-runtime-product-catalog-v2` 收口：contracts 1.3.0、Windows 2.2.2、additive migration 0010、兼容 Worker read model 和独立 Console 已完成本地实现。Windows 106/106、Worker 39/39、contracts 23 组向量、Console 聚焦测试、generated binding types、Wrangler dry-run、WiX 包与桌面/移动视觉验证均通过。
- 2.2.2 候选 Burn 为 118,718,381 bytes / SHA-256 `def05405d100a7f81ac14f979a88a72573485e6e37955cc8fc9f19d154b68b54`；MSI 为 60,363,104 bytes / SHA-256 `bde179821ca6810881271ea371ba39669dc5de008e6914df405c48de90075086`。包仍未签名，状态为 `BLOCKED_BY_AUTHENTICODE_SIGNING`。
- 当前生产仍是前轮已合并 master、Runtime Worker/Pages 和 R2 latest 基线；0010 尚未应用，2.2.2 尚未发布或安装。生产必须等本分支合并到干净 `origin/master` 后按 0010 → Worker → Runtime Pages → R2 latest → HornburgXW 原地升级执行。
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

- Runtime D1 按已批准清单和远端记录精确核对；既有 migration 保持原名，本次只允许在远端待执行列表精确匹配时应用 `0010_runtime_product_catalog.sql`。不得自动应用其他文件或重命名既有 migration。
- 发布配置补全中（PO 授权）：生产只使用固定的已合并 master SHA；Runtime Worker/Pages 可独立选择，Guardian/Main Pages 默认不部署，migration 另行显式选择。GitHub production 环境只允许 master，并要求 PO 人工审批；缺失部署 API token 时停止，禁止搬运本机 OAuth 凭据。
- Guardian 远端 `d1_migrations` 当前没有历史记录；禁止执行自动全量 migration apply。
- 独立 Runtime Pages、独立 SSO 密钥、Runtime Worker、Guardian adapter 和主 Pages 入口必须可以分别回滚。
- Authenticode 未完成前，Windows 包继续标记 `BLOCKED_BY_AUTHENTICODE_SIGNING`。
