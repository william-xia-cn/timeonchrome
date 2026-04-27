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
| D-009 | Codex 成为默认代码执行器 | Active | Codex 本地部署完成，接管日常代码执行；OpenCode 降级为本地复验/环境排查/fallback；Antigravity 从协作链路移除；OpenCode timing trace diagnostics 工作已收口并推送（commit `71516d2`） |
| D-010 | 跨自然日计时按自然日切分 | Active | `event_log_v1` 中跨午夜的未闭合/闭合区间在统计“今日时长”时应按自然日边界切分，不应全算入 START 日或 END 日 |
| D-011 | 凌晨休息时间限制进入后续产品设计 | Active | 后续需要支持配置“凌晨不可用于休息时间”的时段策略，用于防止熬夜玩游戏；该能力属于配额/策略层，不阻塞当前计时准确性收口 |
| D-012 | PiP 不属于正常学习需求 | Active | 切换到学习模式时，已经打开的非学习网站 PiP 必须关闭；PiP 视频时长需要单独记录，不混入普通在线/ACTIVE 时长；产品态度是记录但不作为学习需求放行 |
| D-013 | 后台媒体与 PiP 统计必须保留 domain 维度 | Active | 后台 audio/video 与 PiP 时长不能只有全局总秒数，必须能按 domain 归因；总量可作为摘要，但不能替代 domain 明细 |

## 变更规则
- 新决策必须追加一条记录（不改历史 ID）。
- 决策状态：`Active / Superseded / Dropped`。
