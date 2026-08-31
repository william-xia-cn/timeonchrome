# PROJECT_MASTER

## 项目状态
- **版本：1.7.29（内部 managed 已发布）**
- **阶段：V1-minimal internal release / production observation（V0 baseline frozen）**
- **当前发布状态（2026-08-31）**：`1.7.29` 已以 `APPROVED_WITH_KNOWN_P0_RISK / FORWARD RELIABILITY RELEASE` 发布至 T.xia / P.xia 内部 managed 自托管渠道。源码提交 `5482340`、Guardian Worker `46d82099-1cb9-4240-8223-0ed8938bf21e`、更新站点 deployment `29a9fea2` 已部署并回读通过；CRX 为 384,156 bytes，SHA256 `ffd83c717ace5bf56edb5858926436f58b091b8324c6a8f0efc2cd8dcf21d15b`，稳定扩展 ID 不变。D-073、D-074、客户端日志逐项 ACK 与本地 Admin 访问管理只读显示已进入托管包；不进入 CWS，不修改历史 D1、profile、网页 ACTIVE 或控制台 Pages。`cg.163.com idleStateChanged`、Thomas 终端 17:33 后停止请求、Pierce Mac 离线、正式设备实际升级与历史积压收敛继续保持未解决/生产观察。
- 当前约束：V0 不再作为正式发布版本；V0 仅作为 internal stabilization baseline；首次正式发布目标为 V1-minimal release candidate

## Codex 三角色协作机制
- **状态**：已建立轻量三角色协作基线
- **项目定位**：个人/小团队产品实验 + Chrome Web Store 首发准备；默认流程应轻量、够用、可追踪，避免商用团队式重治理。
- **角色**：
  - `Product&Project Mg`：需求、规格、计划、验收标准、实现审核；只改文档，不改代码/测试，不执行 release gate。
  - `Build&Test`：架构落地、代码实现、单元/集成测试、实现报告；不得擅自改需求、产品决策或 release 标准。
  - `releaseMg`：验收测试、发布门禁、发布状态管理、release readiness recommendation；不修 bug，不替代 Product Owner 最终发布决定。
- **硬规则**：重要事实不能靠记忆协作；默认使用 `PROJECT_MASTER.md` / `TASK_BOARD.md` / `DECISIONS.md` 和简短结果同步。正式 handoff/audit/spec/release report 只在跨 session 边界、release blocker、权限/隐私/风险较高或 Product Owner 要求时创建。
- **入口文档**：`PROJECT_WORKFLOW.md`
- **角色强制运行契约**：`docs/agents/ProductProjectMg.md`、`docs/agents/BuildTest.md`、`docs/agents/ReleaseMg.md`
- **handoff 模板**：`docs/handoffs/HANDOFF_TEMPLATE.md`
- **spec 模板**：`docs/specs/FEATURE_SPEC_TEMPLATE.md`
- **release 模板**：`docs/release/RELEASE_CHECKLIST.md`、`docs/release/RELEASE_GATE_REPORT_TEMPLATE.md`
- **V1-minimal close-out plan**：`docs/release/V1_MINIMAL_CLOSEOUT_PLAN_2026-05-09.md`
- **Product Owner decision brief**：`docs/release/V1_MINIMAL_PRODUCT_OWNER_DECISION_BRIEF_2026-05-09.md`
- **Product Owner decision proposal**：`docs/release/V1_MINIMAL_PO_DECISION_PROPOSAL_2026-05-09.md`
- **历史证据归档**：旧 audit / release / handoff / smoke / checklist / plan 已统一移入 docs/archive/，仅作为历史证据；当前开发入口以 AGENTS.md §9、DECISIONS.md 和当前 docs 权威文档为准。
- **Admin/bind include decision**：`DECISIONS.md:D-038`
- **V1-minimal artifact strategy**：`DECISIONS.md:D-039`
- **ReleaseMg SOP 已合并**：生产 profile / release package / Chrome Web Store / real binding / final acceptance 相关强制规则统一收敛在 `docs/agents/ReleaseMg.md`
- **ChatGPT 定位**：Product Owner 的外部顾问、架构审查者和关键决策辅助者；不负责日常开发调度、不负责每个 Codex session 的日常任务指导。
- **ChatGPT 升级场景**：产品模型变化、架构不确定、存储/云同步/统计口径/权限模型变化、release blocker 判断争议、三角色职责冲突、Agent 输出疑似越界、Product Owner 需要第二意见。

## 当前产品语义基线（2026-07-24）
- **待归类时间**：原“综合时间”的新用户可见名称；它是尚未归入学习或休息的过渡归因池，不是第三类最终时间。
- **复合网站**：原“综合网站”的新用户可见名称；指仅凭域名无法判断使用性质，需要内容、URL、标题、频道、行为或人工回看进一步归因的网站。
- **复合模式**：原“综合模式”的新用户可见名称；内部实现值仍为 `mode: composite`。
- **内部兼容**：`compositeList`、`defaultCompositeSites`、`compositeSeconds`、`undeterminedSeconds`、`dailyUndeterminedQuota`、`undeterminedLocked` 暂不改名，不做 schema/API/代码迁移。
- **边界**：未归类网站仍是 fallback 状态，可能是潜在学习、娱乐、复合或应阻断对象，不自动等同复合网站。
- **未归类网站访问记录**：系统自动记录未归类网站被访问的事实，供家长检查；不是孩子提交的申请。
- **学习网站归类申请**：孩子通过 Popup 主动申请归为学习网站；家长批准前仍计入待归类时间。
- **同站处理**：同一有效 pending 目标只保留一条主记录，手动申请会升级已有自动记录并保留首次/最近访问和顶层导航次数。

## 访问管理配置基线（2026-07-26）
- **档案访问管理配置**：当前 profile 的自定义网站、规则、审核记录、时间配额和时间段配置，影响当前孩子档案。
- **系统访问管理配置**：TimeOnChrome 全局默认网站库，导入后全局生效，所有 profile 的 effective 清单都会合并它。
- **系统配置存储**：系统访问配置优先来自云端 D1；`workers/config/site-access-defaults.json` 只作为初始化和故障 fallback。
- **系统管理分类**：按 Qustodio Web Filters 风格维护内容类别，并映射到 TimeOnChrome 的学习网站、复合网站、受限娱乐网站、黑名单网站或待归类观察。
- **恢复边界**：普通档案备份恢复不得修改系统访问配置，避免恢复单个孩子档案时误改全局默认库。

## 版本边界
- **V0（功能冻结 / 发布闸门未完成）**
  - monitoring 核心短路（含全局门禁主路径）
  - 配置字段单一模型收口（`compositeList / studyList / unsafeList`）
  - 三模式低摩擦切换 UX 规格已冻结（文档层）：Study / Composite / Rest / Paused（见 `docs/MODE_TRANSITION_UX_V0.md`、`DECISIONS.md:D-019`）
  - Background Audio Time 最小版（`BACKGROUND_ACTIVE -> audioSeconds`）
  - dev-reset 工具页（dev-only）
  - 真实 Chrome 前台 ACTIVE 计时、失焦/最小化、多窗口、badge 今日时长已进入本地验收
  - 跨自然日计时统计口径定为"按自然日切分"，聚合层已补最小实现与单元测试
- **V1（后续）**
  - **Stats Storage Foundation（P0 前置）**：`docs/STATS_STORAGE_FOUNDATION.md`；终端 Phase 1-2 已完成（1B-R + 1C）；云基础设施 Phase 3 已完成（3A→3F-S）；`DECISIONS.md:D-030/D-031/D-032`；v1 同步在代码中就绪但默认禁用；受控上线需单独 PO 批准（见 `STATS_STORAGE_FOUNDATION.md` §C.9）
  - composite routing（明确延后）
  - 更精细分类能力（超出 V0 最小收口范围）
  - 凌晨休息时间限制：允许配置凌晨不可用于休息时间，防止熬夜娱乐
  - PiP timing support：最小闭环已补；`PIP_ACTIVE` 单独聚合到 `pipSeconds / pipByDomain`，不混入普通在线/ACTIVE 或后台媒体时长；切换学习模式时会尝试关闭非学习网站 PiP
  - 媒体时长 domain 维度：后台 audio/video 已补 `backgroundMediaByDomain` 明细，PiP 已补 `pipByDomain` 明细；摘要字段仅作总量展示

## V0 Baseline（internal stabilization baseline）
- **结论**：V0 不作为正式发布版本
- **状态**：V0 作为 internal stabilization baseline 冻结并保留证据
- **历史记录**：V0 RC 曾于 2026-05-04 获 Product Owner 批准用于 Google review / handoff（非 Chrome Web Store 正式发布）
- **最近确认的 System Recovery runner infrastructure commit**：`9626a8c`
- **V0 RC 与 System Recovery runner infrastructure 已可用**
- **RC 验证：passed**
  - RC tag: `v1.7.2-rc1` (commit `aa8de9e`)
  - RC smoke: 8/8 passed
  - Workers API tests: 55/55 passed
  - E2E tests: 11/11 passed
  - Background logic: 79/79 passed

### V0 RC Package（含 first-install binding flow fix）
- **Package path**：`D:\Opencode\ChromeExtension\timeonchrome\dist\rc\timeonchrome-v0-rc.zip`
- **SHA256**：`B9DE59BEE9267CEC9F5B47B3611FE7E1ED718C071961142573E7241A349BD389`
- **Size**：184,216 bytes (179.9 KB)
- **Files**：64
- **Modified**：2026-05-04T03:38:05.8939701Z
- **Included fix**：`background.js` `onInstalled` install 分支提前执行 + try-catch 保护，确保首次安装时 `bind.html?welcome=1` 不受 bootstrap 失败阻断

### 自动化回归状态
| 套件类别 | 结果 | 备注 |
|----------|------|------|
| L0 核心单元（6 套件） | PASS | 全部通过 |
| L1 V0 专项单元（12 套件） | PASS | 全部通过 |
| L1b 跨自然日计时（3 套件） | PASS | 全部通过 |
| V12 域对齐（16 套件） | PASS | 全部通过 |
| Reminder 浏览器门 | PASS | 11/11 passed |
| 扩展 E2E 全量 | PASS | 14/14 passed |
| Worker API 集成 | PASS | 55/55 passed |
| 集成测试（duration-flow） | PASS | 53/53 passed |
| 全量 `run-all.js` | PASS | 421/421 passed |

### M1-M9 手动验证状态
| # | 检查项 | 结果 | 验证人 |
|---|--------|------|--------|
| M1 | 扩展加载：无 CSP 错误，SW 正常启动 | PASS | Product Owner |
| M2 | Study→Rest 滑动确认 | PASS | Product Owner |
| M3 | Study→Composite 自动切换 + 45s 轻提示 | PASS | Product Owner |
| M4 | Composite→Rest 普通确认 | PASS | Product Owner |
| M5 | Popup 模式按钮：显示时长/配额，无借用入口 | PASS | Product Owner |
| M6 | Admin 功能：stats/rules/devices/nav/login/logout/save/sync | PASS | Product Owner |
| M7 | PiP 学习模式清理 | PASS | Product Owner |
| M8 | 临时综合权限：仅当前 tab 有效 | PASS | Product Owner |
| M9 | 云同步：配置拉取正常，默认清单可见 | PASS | Product Owner |

### 发布阻塞表（RB）状态
| 阻塞 ID | 条件 | 状态 |
|---------|------|------|
| RB-1 | L0/L1/L1b/V12 单元存在失败 | **CLEAR** |
| RB-2 | V0 专项单元存在失败 | **CLEAR** |
| RB-3 | Reminder 浏览器门 < 11/11 | **CLEAR** |
| RB-4 | 扩展 E2E 关键路径失败 | **CLEAR** |
| RB-5 | Worker API 集成失败 | **CLEAR** |
| RB-6 | V12 域对齐存在失败 | **CLEAR** |
| RB-7 | M1-M9 手动验收存在 P0 失败 | **CLEAR** |
| RB-8 | RC 打包安装冒烟失败 | **CLEAR** |
| RB-9 | Product Owner 最终批准未完成 | **Pending PO** |
| RB-10 | 1 秒内网页切换短段最终产品策略未完成（当前保留 sub-second segment，`durationSeconds=0`，start/end 毫秒完整） | **BLOCKED / Must resolve before formal public release** |

### RC Install Smoke 结果
- **RC 解压加载**：PASS
- **manifest.json**：MV3 valid，`service_worker: background.js`，`type: module`
- **首次安装绑定流程**：`bind.html?welcome=1` 在 install 事件中优先打开（已含 fix）
- **关键文件（27/27）**：全部 PRESENT
- **background.js onInstalled fix 验证**：confirmed in extracted zip

### System Recovery Release Gates（最终记录）

| Gate ID | 状态 | 证据摘要 | 确认来源 | Remaining Action |
|---|---|---|---|---|
| RG-1 | PASS | `chrome-restart` formal bound-device Gate 已通过 | Product Owner confirmed | 无 |
| RG-2 | PASS | bound profile 可用；`--allowWorkstationLock` 触发真实 Windows lock；手动 unlock 后恢复验证通过 | Product Owner confirmed | 无 |
| RG-3 | PASS | 最后执行；本机 sleep model 为 S0 Modern Standby，S3 unavailable；真实 OS sleep/wake 后恢复验证通过 | Product Owner confirmed | 无 |
| RG-4 | PASS | bound profile 可用；`--manualNetworkToggle` 人工断网/联网观察到真实 offline/online；恢复后 event-log/session/trace 可读 | Product Owner confirmed | 无 |

- **记录口径**：以上 RG-1~RG-4 状态按 Product Owner 最终确认落档；本文件不独立重判 Gate 结果。
- **Workers: deployed and verified**
- **Pages: deployed and verified**
- **Terminal 默认网站清单链路：verified**
  - Worker fix: `c864175`（`/device/config` 注入 `defaultStudySites/defaultCompositeSites/defaultRestrictedEntertainmentSites/defaultBlockedSites`）
  - Worker deploy: `guardian-api`，Version ID `ae44552a-9b03-44f4-a14c-83d92d965028`
  - Terminal sync fix: `028c941`（同版本 sync skip 时若本地缺默认清单则补齐持久化）
  - Product Owner 手动验收：终端 `访问规则` 页面可见系统/默认学习网站清单；数据来自云同步；未引入本地硬编码默认清单；页面保持只读
- **Chrome Web Store: NOT published** — separate future task, not in current scope

## V1-minimal Release Candidate（当前正式发布目标）
- **目标定位**：基于 V0 baseline 的最小可发布版本（release-readiness 导向），不是完整 V1 产品模型重建
- **当前状态**：release artifact prepared; reduced-permission Chrome Web Store package submitted; CWS status `待审核`; source follow-up line pushed to `origin/master`; not publicly released; not tagged

### V1-minimal must-have
- release gate matrix reset（以 V1-minimal 口径重置发布闸门）
- Cloud Stats v1 minimal sync gate（`usage_segments_v1` + `stats_v1`）
- Chrome Web Store readiness audit
- manifest permissions / host permissions review
- privacy 与 data collection 文案复核
- macOS + Windows 真实 Chrome smoke verification
- package build verification
- final known risks section

### V1-minimal release preparation（2026-05-09）
- **Package**：`dist/v1-minimal-20260509-023832/timeonchrome-v1.7.2-v1-minimal.zip`
- **SHA256**：`A0A5C541A5A7D047E040D2163BF8735971798112E18E1D223BB9D55D80D7190B`
- **Size**：141,357 bytes（per `docs/archive/releases/v1-minimal-release-2026-05-09.md`; SHA256 remains the primary artifact identity）
- **Manifest version**：`1.7.2`
- **Package verification**：PASS
  - ZIP opens and contains `manifest.json`
  - Manifest is MV3 and version `1.7.2`
  - Required runtime files are present
  - Disallowed private/build/test paths are absent (`docs/`, `tests/`, `workers/`, `pages/`, `node_modules/`, `.env`, `.wrangler`, local Chrome profile data)
- **Historical release evidence**：旧 release / readiness / CWS submission / audit 证据已归档到 docs/archive/，只供追溯；当前 release SOP 与模板以 docs/release/ 为准。
- **Close-out plan**：`docs/release/V1_MINIMAL_CLOSEOUT_PLAN_2026-05-09.md`
- **Product Owner decision brief**：`docs/release/V1_MINIMAL_PRODUCT_OWNER_DECISION_BRIEF_2026-05-09.md`
- **Product Owner decision proposal**：`docs/release/V1_MINIMAL_PO_DECISION_PROPOSAL_2026-05-09.md`
- **Release gate matrix**：`docs/release/V1_MINIMAL_RELEASE_GATE_MATRIX_2026-05-09.md`
- **Chrome Web Store resubmission package**：`dist/cws-resubmit-20260509-122919/timeonchrome-v1.7.2-cws-resubmit-minimal-permissions.zip`
- **Chrome Web Store resubmission SHA256**：`BE0F712285B6661C293175C649DDDC48E0D04217B18626EB3C284EEAB32DD71C`
- **Chrome Web Store status**：`TimeOnChrome 1.7.2` submitted / `待审核`; not publicly released.
- **Artifact strategy**：D-039 / Strategy A active. The already-submitted reduced-permission CWS package remains the active review artifact. Current `origin/master` is the source follow-up line; no rebuild/package/resubmission is approved unless CWS requires it or Product Owner later approves.
- **ReleaseMg historical evidence**：production smoke / readiness 的旧报告已归档到 docs/archive/；当前 release gate 需按 docs/release/ 重新执行或复核。
- **Windows/macOS informal smoke**：PASS_WITH_MANUAL_EVIDENCE；非正式手工 smoke 已完成，按当前个人/小团队首发轻流程接受；不是自动化 lab evidence。
- **Close-out planning status**：docs-only close-out board is ready; releaseMg readonly readiness classification completed; Product Owner decisions remain open.
- **Product Owner decision status**：default next-step proposal approved; CWS least-permission, admin/bind, and Pages stats-v1 follow-up packages have been reviewed, verified, committed, and pushed. Rebuild/package/resubmission, public release, and tag remain unauthorized.
- **Git/local status**：local `master` and `origin/master` are synchronized at `2260943 docs: refresh v1-minimal release readiness`; ahead/behind `0/0` before the D-039 docs-only sync; tag remains blocked pending separate Product Owner approval.
- **Commit planning status**：docs package `9174900`, CWS least-permission package `7072163`, admin/bind account-token package `f498d13`, Pages stats-v1 package `4d4ebfb`, and readiness refresh `2260943` are committed and pushed.
- **Commit approval status**：push completed; no tag or release action approved.
- **Changelog grouping**：`docs/CHANGELOG.md` belongs with V1-minimal release evidence docs; it does not imply public release ready.
- **Working tree status**：prior dirty working tree was recorded in `docs/archive/audits/WORKTREE_STATUS_INVENTORY_2026-05-09.md` and resolved through scoped commits; no dirty product/test package remained before this D-039 docs-only sync.
- **Admin/bind status**：ownership resolution, Build&Test implementation report, minimum verification report, and test package report recorded.
- **Admin/bind account-token persistence status**：Product Owner approved include as V1-minimal follow-up candidate; focused unit package added in `tests/unit/admin-bind-account-token.test.js`; `node tests/unit/admin-bind-account-token.test.js` passed `5/5`; not release-ready evidence.
- **Admin/bind residual risk**：`CLOUD_LOGOUT` coverage is static rather than end-to-end message-router invocation; ordinary admin auto-login stale-token semantics are accepted as a separate follow-up and do not block this package include decision.
- **Pages stats-v1 status**：`pages/index.html` + `tests/unit/pages-config-v12-fields.test.js` are a coherent Pages stats-v1 read path package; classification `include later`; minimum verification passed (`pages-config-v12-fields` 22/22, `workers-stats-ingestion-v12-normalization` 25/25); committed and pushed as source follow-up line; no Pages deploy authorized.
- **GitHub status**：push completed to `origin/master`; no tag or public release without separate Product Owner approval.

### V1-minimal out of scope
- full three-mode model 重构
- AI content classification
- composite routing rebuild
- 当前时间借用实现（borrow time / borrow quota）进入发布范围
- legacy D1 cleanup/migration
- admin UI redesign
- historical data backfill
- site classification policy expansion

> 历史说明：`statsFoundationV1SyncEnabled` 曾列为 out-of-scope；按 D-035 已调整为 V1-minimal 的 Cloud Stats v1 minimal sync gate。当前 V1-minimal release truth path 是 `usage_segments_v1` + `stats_v1`。

### V1-minimal 范围补充（time borrowing）
- V1-minimal 不包含当前实现中的时间借用路径（runtime / UI / message）。
- 当前借用能力相关原始需求保留，但迁移到后续版本进行重设计与重构。
- 后续版本需重新定义：借用来源、借用目标、配额扣减、审批/确认、UI 入口、云端字段、统计归因、与休息/综合/受限娱乐关系。

### V1-minimal close-out evidence：time borrowing disable
- **状态**：DONE / PASS for V1-minimal scope control evidence
- **决策对齐**：遵循 `DECISIONS.md:D-034`，当前 time borrowing 实现路径已从 V1-minimal runtime/UI 排除。

**Runtime 行为（已落地）**
- `BORROW_REST_QUOTA` 受控拒绝返回：
  - `{ ok: false, error: "TIME_BORROWING_DISABLED_FOR_V1_MINIMAL" }`
- 不修改 `quotaBorrow`。
- 不修改 `rest/weekly` 配额状态（如 `restLocked` / `weeklyRestLocked`）。
- 不触发借用执行或还款链路。

**UI 行为（已落地）**
- reminder/blocked 页面无借用入口。
- popup 无借用入口。
- admin 不将 `quotaBorrow` 作为 V1-minimal 活跃能力展示。
- 每日休息配额显示不再应用 `quotaBorrow` 动态调节。

**Storage 兼容性（已确认）**
- `quotaBorrow` / `weeklyRestQuota` 历史字段可继续存在。
- 兼容读取保留，不做清理、迁移或云端 schema 改动。

**验证证据（已完成）**
- `node tests/unit/message-router-borrow-source.test.js`：`4/4 passed`
- `node tests/unit/reminder-borrow-confirm.test.js`：`5/5 passed`
- `node tests/unit/borrow-concurrency.test.js`：`3/3 passed`
- `node tests/unit/reminder-transition-v0.test.js`：`67/67 passed`
- `node tests/unit/background-logic.test.js`：`86/86 passed`
- `node tests/unit/storage-aggregation-convergence.test.js`：`36/36 passed`

**范围确认**
- 未改 Cloud Worker / D1。
- 未改 stats schema。
- 该 time borrowing 禁用子任务本身未负责启用 `statsFoundationV1SyncEnabled`；当前 V1-minimal Cloud Stats v1 minimal sync gate 另见 D-035 与下方 Cloud Stats v1 evidence。
- 未改网站分类策略。
- 未做三模式/综合路由重构。

**说明**
- 本条仅为 V1-minimal 范围控制与禁用落账证据，不等同于宣称 V1-minimal 已发布就绪。

### V1-minimal close-out evidence：Cloud Stats v1 minimal sync gate
- **状态**：PASS（子门通过；不等同于 V1-minimal 整体 release ready）

**修复与部署**
- 客户端最小修复：`infra/cloud-sync.js` 增加 `cloud_device_id` 缺失补水逻辑（复用已绑定凭据与既有 `device_token`，仅补持久化 `cloud_device_id`）。
- Worker 部署：`guardian-api` 已部署，Version ID `1c93c24a-17e6-418e-b870-83b5c4e3804d`。
- 部署后远端接口行为对齐：
  - `POST /device/bind` 返回 `device_id`
  - `GET /device/config` 返回 `device_id`

**真实 Gate.Test 证据（扩展上下文）**
- `statsFoundationV1SyncEnabled=true`
- `cloud_profile_id_exists=true`
- `cloud_device_id_exists=true`
- `CLOUD_FORCE_SYNC` 返回 `hadFailure=false`
- `GET_CLOUD_STATUS.v1Sync`：
  - `pendingSegments=0`
  - `pendingStatsDates=0`
  - `lastError=null`
  - `lastSyncAt>0`
- 本地 outbox：
  - `segment_sync_outbox_v1` pending count = `0`
  - `stats_sync_outbox_v1` pending count = `0`

**生产 profile 补证据（Profile 3）**
- 初始状态：`cloud_device_id` 缺失，`GET_CLOUD_STATUS.deviceId=null`。
- 扩展 reload 后触发补水日志：`[Cloud] Hydrated cloud_device_id via bind fallback`。
- 复核结果：
  - `storage.cloud_device_id_exists=true`
  - `GET_CLOUD_STATUS.deviceId` 存在（与 storage 预览一致）
  - `CLOUD_FORCE_SYNC` 返回 `hadFailure=false`。

**远端 D1 只读证据**
- `stats_v1`：唯一性约束存在（`profile_id,date,domain,channel,mode`）
- `usage_segments_v1`：`id` 主键存在
- duplicate checks：
  - `stats_v1` duplicate query 返回 `[]`
  - `usage_segments_v1` duplicate query 返回 `[]`

**验证测试（最小相关）**
- `node tests/unit/stats-foundation-sync.test.js`：`65 passed`
- `node tests/unit/usage-segments.test.js`：`166 passed`
- `node tests/unit/live-stats-flush.test.js`：PASS（exit code 0）

**范围确认**
- 未做 legacy stats cleanup
- 未做 D1 destructive writes
- 未改网站分类策略
- 未恢复 time borrowing 功能
- 原始 borrowing 需求未删除，已保留为 post V1-minimal 重设计输入。

## Product Owner 手动验收状态（V0 UX）
- **Reminder UI：已通过**
  - Study→Rest 滑动确认页通过
  - Study→Composite 自动切换 + 45s 轻提示通过
  - Composite→Rest 普通确认页通过
- **Pending mode-transition feedback：已通过**
  - Rest→Composite、Rest→Study、Composite→Study 的 pending/success 提示通过
- **Popup V0 layout：已通过**
- **Admin 功能：已通过**
  - stats/rules/devices/nav/login/logout/save/sync 可用
  - “立即同步/立刻更新”按钮具备可见反馈（运行中/成功/失败）
- **PiP study-mode cleanup blocker: FIXED & manually verified**
  - Commit: `fcf38f7` (`fix: enforce PiP cleanup on study mode switch`)
  - Product Owner 手动验收通过：restricted/unsafe PiP 在切换学习模式时会关闭，未归类 PiP 不会静默保留；study/composite 允许场景保持；无关标签页不被关闭；PiP 统计仍保持独立口径
- **Temporary composite permission semantic bug: FIXED & code-verified**
  - Commit: `b5d371c` (`fix: scope temporary composite permission to current tab visit`)
  - Codex closed-loop 代码路径核验：临时权限不再写入 `guardian_config.compositeList`；存储模型为 `tabId + domain + createdAt`；访问判定要求 `tabId + domain` 同时命中；tab 关闭/跨域导航/模式切换会清理临时权限；受限域与配额锁会拒绝临时权限；终端永久规则不展示临时域名；文案为“本次标签页访问内有效，占用综合时间，不计入学习时间。”；统计归因保持综合/待定口径

## V0 Release Evidence（docs close-out）

### Mode-switch in-page prompt lifecycle hardening
- **状态**：DONE / PASS for V0 release evidence
- **定位**：页面内提示属于 UI projection layer，不是 mode state truth source；模式切换状态不依赖提示成功显示。

**问题背景**
- 早期链路存在一次性 `chrome.tabs.sendMessage` 脆弱点：content script 未 ready 时，提示可能丢失。
- pending success notice 早期主要按 `tabId` 缓存，存在同 tab 导航后旧提示串页风险。

**加固结果**
- pending success notice 绑定 `tabId + domainSnapshot`。
- `CONTENT_SCRIPT_READY` resend 路径携带 current tab domain。
- resend guard 收敛为：
  - `domainSnapshot` 存在但 `currentDomain` 缺失：不重发并清理 pending；
  - `domainSnapshot` 与 `currentDomain` 不一致：不重发并清理 pending；
  - `domainSnapshot` 与 `currentDomain` 一致：允许重发；
  - 两者都缺失：不重发并清理 pending。
- 保留既有 TTL、fallback notification、clearPendingNotice 行为。

**验证证据（已完成）**
- `node tests/unit/interceptor-mode-transition-v0.test.js`：`84/84 passed`
- `node tests/unit/content-rest-composite-pending-banner.test.js`：`23/23 passed`
- `npx playwright test tests/e2e/mode-switch-prompt-lifecycle.test.js --reporter=line`：`3 passed`

**E2E 备注**
- 历史 `spawn EPERM` 通过非沙箱权限运行 Playwright worker 进程解决。
- `mode-switch-prompt-lifecycle.test.js` 做了最小 harness 修复：成功提示 TTL 场景由 `studyUrl` 调整为 `compositeUrl`，避免后台每秒 reevaluate 将场景污染为“综合→学习 pending”。
- 上述修复未使用 `test.skip`，未删除关键 selector，未放宽断言，未弱化验证目标。

**范围确认**
- 未改模式状态机。
- 未改 stats schema。
- 未改 popup/admin 功能。
- 未改 cloud/Worker/D1。
- 未改网站分类策略。

**说明**
- 本记录仅确认该子任务作为 V0 release evidence 通过，不等同于宣称 V0 整体 release ready。

### Admin subpage refresh on navigation
- **状态**：DONE / PASS for V0 release evidence

**问题背景**
- admin 侧边栏切换子页时，原先主要是 DOM 显隐切换。
- 访问规则 / 使用分析等子页读取首次加载时的全局 `config`。
- tab click 未重新 `GET_CONFIG`，导致用户经常需要手动刷新浏览器页面才能看到最新状态。

**修复内容**
- 新增统一切页刷新入口 `refreshPageByNav(page, requestSeq)`。
- `setupNavigation()` 的 tab click 改为异步切页后刷新目标页面。
- `rules` 页面切换时重新 `GET_CONFIG` 后执行 `renderRulesPage()`。
- `stats` 页面切换时重新 `GET_CONFIG` 后执行 `renderStatsPage()`。
- `devices` 页面保留原有即时刷新路径。
- 新增 `adminPageRefreshSeq`，防止快速切 tab 时旧请求覆盖当前页面。
- 新增 `rules/stats/devices` 错误态渲染，避免加载失败时静默保留旧 DOM。

**验证证据（已完成）**
- `node tests/unit/admin-nav-refresh.test.js`：`5/5 passed`
- `node tests/unit/admin-stats-overview.test.js`：`10/10 passed`
- `node tests/unit/admin-undetermined-list.test.js`：`50/50 passed`
- Manual browser verification：PASS

**范围确认**
- 未改 Cloud Worker / D1。
- 未改配置 schema / stats schema。
- 未改网站分类策略。
- 未改模式状态机。
- 未改 popup。
- 未做 admin UI 大改版。

**Close-out**
- Code-level fix: PASS
- Unit verification: PASS
- Manual browser verification: PASS
- Release confidence: high
- Status: DONE / PASS for V0 release evidence

**说明**
- 本记录仅确认该子任务作为 V0 release evidence 通过，不等同于宣称 V0 整体 release ready。

### Cloud sync evidence pass（read-only）
- **状态**：PASS（机制可用）+ KNOWN RISK CONFIRMED（legacy cloud stats duplicate）

**证据摘要**
- Config sync：
  - 云同步日志显示 local/cloud version 已对齐，配置更新到 version `7`。
  - admin 页面 `GET_CONFIG` 返回 defaults/custom/effective 三层字段。
  - 关键计数：
    - `defaultStudySites=149`
    - `customStudyList=8`
    - `studyList=158`
    - `defaultCompositeSites=9`
    - `customCompositeList=4`
    - `compositeList=13`
    - `defaultRestrictedEntertainmentSites=14`
    - `restrictedEntertainmentList=14`
    - `unsafeList=2`
- Local stats：
  - storage 日志显示 `getTodayStats` 来自 `daily_usage_stats_v1`（`2026-05-07`，18 domains）。
  - `GET_STATS` 返回：`onlineSeconds=8068`、`compositeSeconds=1186`、`undeterminedSeconds=1186`。
  - `GET_STATS_RANGE(7)` 返回 7 天范围，且 `2026-05-07` 与 `GET_STATS` 对齐。
  - `GET_TIMELINE_SEGMENTS` 返回 `368` 条。
- Runtime mode：
  - `GET_RUNTIME_MODE_STATUS` 返回 `mode=composite`，且 `currentSessionDurationSeconds` 存在。
- Runtime evidence context：
  - Service Worker console 自发 `sendMessage` 得到 `{}` 是上下文取证问题。
  - admin 页面 console 的 runtime message evidence 返回有效响应。
  - 未发现 message-router 对上述 type 的实现缺失或返回路径 bug。
- Cloud legacy stats：
  - cloud-sync 日志显示 `2026-05-07` legacy stats 成功上传（15 domains）。
  - D1 只读证据确认：legacy `stats` 表仅有 `id` 主键，无 `UNIQUE(profile_id,date,domain)`。
  - 已确认存在同 profile/date/domain 重复行。

**已确认风险（Known Risk）**
- legacy cloud `stats` 重复行在云端按 `SUM` 聚合时，可能放大历史统计值。
- 当前结论：legacy cloud stats “可用”，但不是“干净唯一真值源”。
- 约束：
  - 本轮不新增 UNIQUE migration；
  - 本轮不清理/重写 D1 历史数据；
  - 本轮不启用 `statsFoundationV1SyncEnabled`；
  - V0 不将该风险通过临时写库操作消除。

**后续建议**
- 建立独立的 legacy stats cleanup/migration 计划（单独评审与回滚策略），或在 V1 stats sync 迁移中统一收敛。
- 本条证据不等同于宣称 legacy cloud stats fully clean，也不单独构成 V0 整体 release-ready 结论。

### V1-minimal close-out evidence：Recovery/System manual evidence
- **状态**：PASS with manual evidence（审计闭环完成）
- **Close-out report**：
  - `tests/system/sleep-wake-gate/reports/v1-minimal-recovery-gate-closeout-20260508-180200.json`
  - `tests/system/sleep-wake-gate/reports/v1-minimal-recovery-gate-closeout-20260508-180200.md`
- **Automated gates retained as PASS**：
  - dry-run
  - chrome close/reopen
  - service worker recovery
  - runtime route preflight
  - GET_TIMELINE_SEGMENTS / GET_RUNTIME_MODE_STATUS / GET_CLOUD_STATUS.v1Sync
  - CLOUD_FORCE_SYNC = SKIP_BY_POLICY
- **Manual gates落账口径**：
  - network offline/online = MANUAL_VERIFIED_PASS
  - windows lock/unlock = MANUAL_VERIFIED_PASS
  - sleep/wake = MANUAL_VERIFIED_PASS（保留 automated sleep report=PARTIAL 事实）
- **审计注意事项**：
  - manual gates 为 operator-confirmed evidence，不是全自动测量
  - 不得写成 all gates fully automated

### V1-minimal close-out evidence：Mode transition PiP cleanup + Study prompt regression
- **状态**：PASS（mode-transition UX / side-effect regression gate；不属于 Recovery/System gate）

**问题背景**
- Rest -> Composite manual/auto 路径下，PiP 曾未关闭。
- Rest -> Study auto 路径下，PiP 曾出现不稳定关闭。
- 进入 Study 的 in-page prompt 曾再次缺失。

**最终行为**
- Leaving Rest to Composite closes active PiP.
- Leaving Rest to Study closes active PiP.
- Entering Study closes active PiP.
- Entering Study shows in-page Study prompt.
- Manual and auto transition paths both covered.

**修复摘要**
- PiP close side-effect 统一到 mode transition 相关路径（避免 manual/auto 分裂）。
- PiP close 尝试优先当前 tab，并扩展为全 tab 尝试以提高稳定性。
- PiP close failure does not abort mode transition.
- Study prompt lifecycle 继续走既有稳定派发路径（含 late-ready resend 与 domain guard）。
- E2E 用例在每条路径前强制建立 Rest 前置状态，避免测试语义漂移。

**测试证据**
- `node tests/unit/interceptor-mode-transition-v0.test.js`：`89/89 passed`
- `node tests/unit/reminder-transition-v0.test.js`：`67/67 passed`
- `node tests/unit/content-rest-composite-pending-banner.test.js`：`23/23 passed`
- `npx playwright test tests/e2e/mode-switch-prompt-lifecycle.test.js --reporter=line`：`3 passed`
- `npx playwright test tests/e2e/mode-switch-pip-close.test.js --reporter=line`：`4 passed`

**PiP E2E 四路结果**
- Rest -> Composite manual: PASS
- Rest -> Composite auto: PASS
- Rest -> Study manual: PASS
- Rest -> Study auto: PASS

**Harness 约束**
- `background.js` 中 `debugTriggerAutoTransition` 仅用于 E2E harness。
- 必须受 sender / test-only 约束，不得作为普通用户路径暴露。
- 不影响业务行为，不依赖 Cloud/D1。

### V1-minimal close-out evidence：Mode prompt delivery + popup notice targeting + delay parameter update
- **状态**：PO review / close-out ready（本条仅记录本轮变更，不代表 V1-minimal 整体 release ready）

**变更摘要**
- 页面内提示可见性恢复：Product Owner 手动刷新页面后确认可见，当前采用新提示形态。
- 提示样式调整：颜色调浅为更轻绿色；仅视觉层改动，不改变提示投递逻辑语义。
- popup 切换投递修复：popup 发起 `SWITCH_*` 时携带 `noticeTabId`，background 优先向目标网页 tab 投递提示，修复“popup 切换模式后目标网页无提示”。
- 自动切换延迟参数更新（按 Product Owner 指定）：
  - `Rest -> Composite`: `30s`
  - `Rest -> Study`: `45s`
  - `Composite -> Study`: `45s`
- 文档同步已完成：`docs/MODE_TRANSITION_UX_V0.md` 与 `DECISIONS.md:D-020` 均已对齐 `30/45/45`。

**测试证据（当前基线）**
- `npx playwright test tests/e2e/mode-switch-prompt-lifecycle.test.js --reporter=line`：`3 passed`
- `npx playwright test tests/e2e/mode-switch-pip-close.test.js --reporter=line`：`4 passed`

**流程约束（后续执行）**
- 涉及 mode transition timing、prompt behavior、UX 参数的改动，先文档审批/同步，再实现。
- 不允许代码与文档分叉。

## Reminder V0 一致性阻塞解决记录
- **状态：已解决**
- **浏览器验证门**：`tests/e2e/reminder-v0-validation.test.js`
- **覆盖场景（11/11 passed）**：
  - T-R1 study_mode
  - T-R2a/b/c study_mode&restLocked=1
  - T-R3 to_rest_slide_confirm（无 originMode）
  - T-R3b to_rest_slide_confirm with originMode=study
  - T-R4 to_rest_confirm unclassified
  - T-R5 to_rest_confirm restricted
  - T-R6 quota_composite
  - T-R7 quota_composite_and_rest
  - T-R8 unsafe
- **单元/路由/拦截器证据**：
  - `reminder-transition-v0`: 68/68 passed
  - `interceptor-mode-transition-v0`: 71/71 passed
  - `mode-routing-matrix-v0`: 74/74 passed
  - 合计：213/213 passed
- **T-R4/T-R5 修复**：标题渲染顺序 bug（`mainTitle.textContent` 在配置覆盖前写入，修复后在 `to_rest_confirm` 双路径覆盖后重渲染）
- **T-R3/T-R3b 返回标签验证**：
  - 无 originMode → `返回`
  - originMode=study → `返回学习`
- **行为不变性确认**：
  - 路由行为未变更
  - 网站分类行为未变更
  - 统计/配额计算未变更
  - `to_rest_slide_confirm` 行为未变更（仅新增测试覆盖）
- **约束**：Reminder 未来变更必须运行此浏览器门
- **注意**： broader V0 release regression 仍为必需项，本记录不替代完整 V0 发布闸门

## 已知非阻塞残余项
- `admin/admin.html` 历史 local-console 命名 / 物理页面拆分，保留为 post-V0 cleanup (P2)
- `admin/admin.html?view=stats` 仍存在未定位来源的 CSP 控制台告警（`Executing inline event handler violates Content Security Policy`）；当前记录为已知 admin 页面告警，尚未确认对核心 runtime/mode/popup/content-script 造成故障；不得标记为 fixed，需继续按 admin 功能项做人工验证（stats/rules/devices/nav/login/logout/save/sync）
- D-015 申诉/审核语义待 Product Owner 终审 (Pending PO)
- 旧 profiles 清理为 optional / P2
- Reminder 双滑轨页面（`study_mode` / `to_rest_confirm` 的未归类路径）说明文案在部分窗口下存在右偏/遮挡视觉问题：记录为 V1 UI 优化项（固定结构布局重排），当前不作为 V0 阻塞
- Rest 借用机制当前按 V0 accepted mechanism 运行（上下文 Reminder 显式触发、与综合申请分离、不经 popup）；借用额度策略、次日扣减算法呈现、失败反馈与审计可见性等列为 V1 优化项
- macOS smoke validation **未通过 / 未执行完成**：按 Product Owner 风险接受，V0 暂缓到 V1 跟进
- Playwright E2E alternate-environment evidence **未完成**：当前 Windows 本地受 `spawn EPERM` 环境阻塞，按 Product Owner 风险接受，V0 暂缓到 V1 跟进
- Composite 默认收窄（D-028）：`defaultUserCompositeSites`（7 个用户默认综合网站）仅种子注入新建 Profile，现有 Profile 不自动迁移。如需应用新默认值，家长可手动添加或重建 Profile。

## V0 Accepted Risks（Product Owner confirmed）
1. macOS smoke validation did not pass; deferred to V1 as accepted V0 release risk.
2. Playwright E2E did not complete in local Windows (`spawn EPERM`); alternate-environment rerun deferred to V1 as accepted V0 release risk.
3. Admin CSP warning is unresolved; treated as known non-blocking admin-page warning because admin functional flows were manually validated.

## RC handoff 状态
- [x] release notes final review
- [x] known issues final review
- [x] RC package generation（`dist/rc/timeonchrome-v0-rc.zip`）
- [x] local RC install smoke
- [x] Product Owner final approval（RB-9）— **APPROVED for Google review / handoff（2026-05-04）**

## 发布口径约束
- 上述 accepted risks 是"未修复/未通过"的风险接受，不是测试通过结论。
- **V0 RC 已获 Product Owner 批准用于 Google review / handoff（2026-05-04）**，该记录仅作为基线证据保留。
- 本批准**不等同于 Chrome Web Store 正式发布**；且当前发布策略已切换为 `V1-minimal release candidate`。
- 本文件不得据此宣称 V0 或 V1-minimal 已经 public release ready。

## 非目标（当前）
- 不做大重构
- 不开启 V1 composite routing
- 不引入新的产品功能模式
- 不在当前计时准确性收口中实现凌晨休息时间限制，仅记录为后续产品设计项
