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
- **V1（后续）**
  - composite routing（明确延后）
  - 更精细分类能力（超出 V0 最小收口范围）

## 发布闸门判定（V0）
1. 关键能力已闭环并通过全量 unit 验证
2. API / E2E 在可执行发布环境可复现通过
3. 保持 cloudHeartbeat（已定产品决策，非 V0 缺口）

## 非目标（当前）
- 不做大重构
- 不开启 V1 composite routing
- 不引入新的产品功能模式
