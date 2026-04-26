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
- [ ] [V1] PiP 统计补 domain 明细：后台 audio/video 已有 `backgroundMediaByDomain`，PiP 后续必须单独按 domain 归因

## LATER（P2）
- [ ] [V1] 凌晨休息时间限制：允许配置凌晨不可用于休息时间，防止熬夜娱乐
- [ ] [V1] PiP timing support：补齐 Picture-in-Picture 真实信号采集；切换学习模式时关闭非学习网站 PiP；PiP 时长单独记录且不混入普通在线时长
- [ ] [V1] 工程性优化票（非用户价值主线）

## 冻结项
- [ ] [V1] composite routing（冻结到 V1）

## COMPLETED（V0）
- [x] [V0] 后台 audio/video 统计补 domain 明细：`backgroundMediaByDomain` 与 `audioSeconds` 摘要对账通过
- [x] [V0] 跨自然日计时按自然日切分：代码口径盘点、最小测试、聚合层修正
- [x] [V0] monitoring 核心短路收口
- [x] [V0] 配置字段单一模型收口
- [x] [V0] Background Audio Time 最小版
- [x] [V0] dev-reset 工具页（dev-only）

## 维护约定
- 每个任务必须标注阶段（V0/V1）
- 每次只推进单主题小包
- 完成后同步更新本板与 DECISIONS
