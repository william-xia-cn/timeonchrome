# TASK_BOARD

## NOW（P0）
- [x] [V0] V0 RC package validation
- [x] [V0] RC internal install validation (Chrome unpacked)
- [x] [V0] Pages deployment readiness
- [x] [V0] Worker/API readiness
- [x] [V0] Stage 1 Soft Gate verification
- [x] [V0] Phase 2 chrome-restart Gate runner + binding preflight + bound-device validation

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
- [ ] [V1] 凌晨休息时间限制：允许配置凌晨不可用于休息时间，防止熬夜娱乐
- [ ] [V1] 工程性优化票（非用户价值主线）
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
