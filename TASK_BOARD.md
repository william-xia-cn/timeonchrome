# TASK_BOARD

## NOW（P0）
- [x] [V0] 发布环境复验执行包文档落成（标准检查清单）
- [ ] [V0] 发布闸门复验：API 测试通过（发布环境）
- [ ] [V0] 发布闸门复验：E2E 测试通过（发布环境）
- [x] [V0] Monitoring 收口剩余项（以用户可感知副作用为优先）
- [x] [V0] Background Audio Time 最小闭环（`BACKGROUND_ACTIVE -> audioSeconds`）

## NEXT（P1）
- [ ] [V1] composite routing 设计与拆包
- [ ] [V1] 更精细分类能力设计（V0 之外）

## LATER（P2）
- [ ] [V1] 凌晨休息时间限制：允许配置凌晨不可用于休息时间，防止熬夜娱乐
- [ ] [V1] 工程性优化票（非用户价值主线）
- [ ] **[Pending PO D-015] 申诉/审核语义终审**：待归类列表中的"申诉/待审核/申诉中/已改判/标为学习/标为休息"概念需 Product Owner 决策——从终端 UI 隐藏、只读展示、保留孩子侧申诉、或仅保留在家长控制台

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
