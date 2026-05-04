# TASK_BOARD

## NOW（P0）
- [x] [V0] V0 RC package validation
- [x] [V0] RC internal install validation (Chrome unpacked)
- [x] [V0] Pages deployment readiness
- [x] [V0] Worker/API readiness
- [x] [V0] Stage 1 Soft Gate verification
- [x] [V0] Phase 2 chrome-restart Gate runner + binding preflight + bound-device validation
- [x] [V0] System Recovery Release Gates final confirmation recorded（source: Product Owner confirmed）
- [x] [V0] release notes draft/finalize
- [x] [V0] known issues finalize
- [x] [V0] RC package generation（`dist/rc/timeonchrome-v0-rc.zip`, SHA256 `B9DE59B...389`）
- [x] [V0] local RC install smoke
- [x] [V0] Product Owner final approval（RB-9）— **APPROVED for Google review / handoff（2026-05-04）**

## System Recovery Release Gates（final record; source: Product Owner confirmed）

| Gate ID | Status | Evidence summary | Confirmation source | Remaining action |
|------|------|------|------|------|
| RG-1 | PASS | `chrome-restart` formal bound-device Gate 已通过 | Product Owner confirmed | 无 |
| RG-2 | PASS | bound profile 可用；`--allowWorkstationLock` 触发真实 Windows lock；手动 unlock 后恢复验证通过 | Product Owner confirmed | 无 |
| RG-3 | PASS | 最后执行；本机为 S0 Modern Standby，S3 unavailable；真实 OS sleep/wake 后恢复验证通过 | Product Owner confirmed | 无 |
| RG-4 | PASS | bound profile 可用；`--manualNetworkToggle` 人工断网/联网观察到真实 offline/online；恢复后 event-log/session/trace 可读 | Product Owner confirmed | 无 |

## NEXT（P1）
- [ ] [V1] composite routing 设计与拆包
- [ ] [V1] 更精细分类能力设计（V0 之外）
- [x] **[P1] Child-facing entry points expose mixed admin page — Stage 1 (Soft Gate) 已完成**：
  - 已实施：孩子端入口（popup 设置按钮、未绑定横幅、reminder 查看详情）现已通过 `?view=stats` 参数以只读模式打开 `admin/admin.html`
  - 已实施：admin.js 入口逻辑添加 `isChildView` 分支，跳过登录/注册/绑定流程，隐藏退出登录、重新绑定等家长控件
  - 待 PO 决策（不影响 V0）：
    - 孩子是否应访问详细使用分析统计？（当前已通过 Soft Gate 允许）
    - 未绑定设备时，孩子应看到什么操作入口？（当前显示简化提示"请联系家长完成设备绑定"）
  - Stage 2（V1 规划）：新建独立 `terminal/usage.html` 孩子只读页，彻底拆分 admin.html 的家长 setup 职责 → 见 P2 项
- [ ] **[Later/P1 or P2] Chrome Web Store submission** — separate future task, not part of this release closeout

## LATER（P2）
- [ ] [V1] macOS smoke checklist 执行与记录（`docs/macos_v0_smoke_test_checklist.md`）
  - 状态：Product Owner accepted V0 release risk（deferred, not passed）
  - 口径：该项从 V0 active blocker 移至 V1 follow-up
- [ ] [V1] Playwright E2E alternate-environment rerun（duration-accuracy / timing-trace-smoke / timing-trace-verify）
  - 状态：Windows 本地 `spawn EPERM` 环境阻塞；Product Owner accepted V0 release risk（deferred, not passed）
  - 口径：该项从 V0 active blocker 移至 V1 follow-up
- [ ] [V1] 凌晨休息时间限制：允许配置凌晨不可用于休息时间，防止熬夜娱乐
- [ ] [V1] 工程性优化票（非用户价值主线）
- [ ] **[P2] Admin CSP 控制台告警未解（已知问题）**
  - 当前状态：`admin/admin.html?view=stats` 仍可能出现 `Executing inline event handler violates Content Security Policy` 告警，尚未捕获可行动的唯一来源
  - 口径：仅记录为 admin 页面已知告警，不得宣称已修复，不等价于 core runtime failure
  - 必做人工验证：stats 页面打开并展示数据、rules 页面可打开、devices 页面可打开、侧边导航可切换、login/logout 可用、save/sync 可用
  - 发布口径：本项不改变 V0 formal release gate 结论；V0 formal release 仍按 System Recovery Release Gates 判定
- [ ] **[P2/V1] Reminder 双滑轨说明文案对齐问题（已知 UI 问题）**
  - 当前状态：在 `study_mode` 与 `to_rest_confirm(unclassified)` 的双滑轨页面中，滑轨间说明文案在部分窗口尺寸下出现右偏/遮挡视觉问题
  - 影响范围：仅 Reminder 页面展示层；不影响模式切换、配额扣减、计时归因与按钮/滑轨交互语义
  - 处理策略：纳入 V1 UI 优化，采用固定结构布局（不依赖 `order` 动态拼装）统一文案块位置与层级
  - 发布口径：该项为已知非阻塞 UI 问题，不影响 V0 closeout
- [ ] **[V1] Rest borrow rule refinement（V0 accepted mechanism）**
  - V0 现状：借用仅在 Reminder 上下文显式触发，不经 popup；与“申请使用综合时间”分离；不创建综合放行；不改变站点分类。
  - V1 优化范围：
    1) 借用额度策略细化；
    2) 次日扣减/归还算法可解释化；
    3) 日/周借用上限策略与过度使用抑制；
    4) 家长侧借用开关与策略配置；
    5) 失败反馈、审计轨迹与日志可见性增强。
- [ ] **[Pending PO D-015] 申诉/审核语义终审（使用分析页面 / 终端 UI）**：使用分析页面与待归类列表中的"申诉/待审核/申诉中/已改判/标为学习/标为休息"概念需 Product Owner 决策——从终端 UI 隐藏、只读展示、保留孩子侧申诉、或仅保留在家长控制台
- [ ] **[P2] Stage 2 local terminal/admin naming or physical split cleanup**：
  - 当前状态：`admin/admin.html` 同时承载：
    1. 孩子只读统计（使用分析、访问规则查看、本机状态）
    2. 家长 setup 操作（登录/注册/绑定/重绑）
  - 待决策：是否拆分为独立的孩子终端统计页 vs 家长 setup 页
  - 约束：不阻塞 V0 发布
- [ ] **[P2] disposable/old profile cleanup if still relevant**
- [ ] **[P2] formalize RC smoke test as permanent E2E if desired**
- [ ] **[P1/P2] 设备失联邮件通知方案待定**
  - 当前已完成：家长端设备健康状态 UI 文案与阈值修正（`deviceStatusInfo` 概率性文案）。
  - 当前未完成：设备失联 / 心跳超时后的邮件通知策略。
  - 待定内容：
    - 是否启用邮件通知；
    - warning / critical 阈值；
    - 通知频率与去重策略；
    - 是否使用 Cron 扫描 stale heartbeat；
    - 邮件文案；
    - 是否按 profile/device 去重；
    - 是否只在监控期或允许时段内通知。
  - 约束：不得声称"扩展已被禁用/移除"，只能使用"可能失联 / 请检查设备"等概率性文案。

## 冻结项
- [ ] [V1] composite routing（冻结到 V1）

## COMPLETED（V0）
- [x] [V0] V0 RC package built and verified（`dist/rc/timeonchrome-v0-rc.zip`, SHA256 `B9DE59BEE9267CEC9F5B47B3611FE7E1ED718C071961142573E7241A349BD389`, 64 files, 179.9 KB）
- [x] [V0] RC install smoke: manifest MV3 valid, service_worker=background.js, type=module, 27/27 critical files present, onInstalled binding flow fix confirmed in extracted zip
- [x] [V0] Automated regression: L0/L1/L1b/V12/E2E/API all PASS（421/421 via run-all.js）
- [x] [V0] M1-M9 manual validation: PASS（Product Owner verified all 9 items）
- [x] [V0] RB-1~RB-8: all CLEAR; RB-9: Pending PO final approval
- [x] [V0] First-install binding flow fix: `background.js` onInstalled install branch moved before bootstrap + try-catch protection, ensures bind.html opens regardless of bootstrap failure
- [x] [V0] Reminder V0 一致性阻塞解决：浏览器验证门（`tests/e2e/reminder-v0-validation.test.js`）11/11 passed；单元/路由/拦截器 213/213 passed；T-R4/T-R5 标题渲染顺序修复；T-R3/T-R3b 返回标签验证；路由/分类/统计/配额行为不变
- [x] [V0] Product Owner 手动验收通过：Reminder/UI 路径（Study→Rest 滑动确认、Study→Composite 自动切换+45s 轻提示、Composite→Rest 普通确认）
- [x] [V0] Product Owner 手动验收通过：Pending mode-transition feedback（Rest→Composite / Rest→Study / Composite→Study）
- [x] [V0] Product Owner 手动验收通过：Popup V0 layout
- [x] [V0] Product Owner 手动验收通过：admin 功能（stats/rules/devices/nav/login/logout/save/sync；立即同步按钮反馈可见）
- [x] [V0] Three-mode transition UX 规格文档冻结（docs-only）：新增/完善 `docs/MODE_TRANSITION_UX_V0.md` 并落档 `DECISIONS.md:D-019`，明确 Study/Composite/Rest/Paused、六向切换规则、hardBlocked 独立拦截流、Badge/Popup/配额展示与 V0 非目标边界（不含 AI 分类/二级分类/path-level routing/schema 变更）
- [x] [V0] Temporary composite permission semantic bug fixed and code-verified（commit `b5d371c`）：临时综合权限收敛为“当前标签页当前域名访问”范围；不再持久化到 `guardian_config.compositeList`；tab 关闭/跨域导航/离开或重入学习模式会清理；受限域与配额锁拒绝临时权限；终端永久规则不展示临时域；文案为“本次标签页访问内有效，占用综合时间，不计入学习时间。”
- [x] [V0] PiP study-mode cleanup blocker fixed and PO manually verified（commit `fcf38f7`）：切换到学习模式时 restricted/unsafe PiP 关闭；未归类 PiP 不静默保留；study/composite 允许场景保持；无关标签页不关闭；PiP 统计保持独立
- [x] [V0] Cloud default/system site lists reach terminal 访问规则（worker deploy `ae44552a-9b03-44f4-a14c-83d92d965028` + same-version sync persistence fix `028c941`，PO 手动验收通过）
- [x] [V0] Time accounting stale-gap reliability patch: transition/recovery/heartbeat/badge 共用 stale-boundary，未观察 gap 不计入 foreground/audio/PiP
- [x] [V0] System Recovery runner infrastructure: dry-run, chrome-restart, lock-unlock, network-offline, sleep-wake runner paths
- [x] [V0] Popup P0 UI 回正（删除 4 宫格/借用区/待定列表，模式按钮显示时长/配额，后台媒体纯数字行）
- [x] [V0] Popup P0 借用路由修正：`BORROW_ALLOWED_PATHS` 移除 popup，仅保留 reminder
- [x] [V0] Bind 流程修复：CSP 合规（bind.js 外部化）、auth 变量冲突、cloud-sync token 守卫
- [x] [V0] 后台 audio/video 统计补 domain 明细：`backgroundMediaByDomain` 与 `audioSeconds` 摘要对账通过
- [x] [V1] PiP timing support 最小闭环：`PIP_ACTIVE -> pipSeconds / pipByDomain`，不混入普通在线或后台媒体；学习模式切换关闭非学习网站 PiP
- [x] [V0] 跨自然日计时按自然日切分：代码口径盘点、最小测试、聚合层修正
- [x] [V0] monitoring 核心短路收口
- [x] [V0] 配置字段单一模型收口
- [x] [V0] Background Audio Time 最小版
- [x] [V0] dev-reset 工具页（dev-only）

## 维护约定
- 每个任务必须标注阶段（V0/V1）
- 每次只推进单主题小包
- 完成后同步更新本板与 DECISIONS
- V0 formal release 可在 Product Owner 明确风险接受下推进 RC 交付；macOS smoke 与 Playwright alternate-environment evidence 当前为已接受风险并进入 V1 follow-up
