# DECISIONS

| ID | 决策 | 状态 | 说明 |
|---|---|---|---|
| D-001 | 项目进入 V0 收口阶段 | Active | 以稳定与收口为先，限制扩散开发 |
| D-002 | music time 纳入 V0 | Active | 作为当前阶段功能范围的一部分 |
| D-003 | composite routing 延后到 V1 | Active | 当前不进入实现，避免打断收口主线 |
| D-004 | monitoring 收口按小包推进 | Active | 已完成核心用户可感知副作用收口 |
| D-005 | 临时工具仅 dev-only | Active | 不接正式导航、不产品化 |
| D-006 | V0 冻结能力已具备 | Active | 依据：全量逐文件 unit tests passed、audioSeconds 口径稳定 |
| D-007 | cloudHeartbeat 必须保留 | Active | 已定产品决策；不作为 V0 缺口，不进入删除/短路讨论 |
| D-008 | V0 发布闸门需在可执行环境复验 API/E2E | Active | 本地闸门若受网络/浏览器环境限制，需在 CI/发布机完成最终放行 |

## 变更规则
- 新决策必须追加一条记录（不改历史 ID）。
- 决策状态：`Active / Superseded / Dropped`。
