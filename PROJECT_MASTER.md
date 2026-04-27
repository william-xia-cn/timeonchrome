# PROJECT_MASTER

## 项目状态
- 阶段：**V0 Gate Check（发布闸门核查中）**
- 当前主线：V0 发布闸门核查 + 文档口径收口
- 当前约束：仅做发布前收口，不扩展新功能

## 版本边界
- **V0（已完成）**
  - monitoring 核心短路（含全局门禁主路径）
  - 配置字段单一模型收口（`compositeList / studyList / unsafeList`）
  - Background Audio Time 最小版（`BACKGROUND_ACTIVE -> audioSeconds`）
  - dev-reset 工具页（dev-only）
- **V0（计时准确性收口新增关注）**
  - 真实 Chrome 前台 ACTIVE 计时、失焦/最小化、多窗口、badge 今日时长已进入本地验收
  - 跨自然日计时统计口径定为“按自然日切分”，聚合层已补最小实现与单元测试
- **V1（后续）**
  - composite routing（明确延后）
  - 更精细分类能力（超出 V0 最小收口范围）
  - 凌晨休息时间限制：允许配置凌晨不可用于休息时间，防止熬夜娱乐
  - PiP timing support：最小闭环已补；`PIP_ACTIVE` 单独聚合到 `pipSeconds / pipByDomain`，不混入普通在线/ACTIVE 或后台媒体时长；切换学习模式时会尝试关闭非学习网站 PiP
  - 媒体时长 domain 维度：后台 audio/video 已补 `backgroundMediaByDomain` 明细，PiP 已补 `pipByDomain` 明细；摘要字段仅作总量展示

## 发布闸门判定（V0）
1. 关键能力已闭环并通过全量 unit 验证
2. API / E2E 在可执行发布环境可复现通过
3. 保持 cloudHeartbeat（已定产品决策，非 V0 缺口）

## 非目标（当前）
- 不做大重构
- 不开启 V1 composite routing
- 不引入新的产品功能模式
- 不在当前计时准确性收口中实现凌晨休息时间限制，仅记录为后续产品设计项
