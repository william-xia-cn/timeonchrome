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
| D-014 | Agent 必须严格遵循已确认的实施方案 | Active | 已确认方案必须严格逐项执行，不得擅自简化、替换或偏离；执行前须输出 checklist，执行后须做 Plan Conformance Audit；存在 Deviated/Extra 变更时禁止提交 |
| D-015 | 申诉/审核语义：使用分析页面 / 终端 UI 待定 | **Pending PO** | 复合型网站会话的"申诉/待审核/申诉中/已改判/标为学习/标为休息"等概念在**孩子侧终端 UI（admin 管理面板 / 使用分析页面）**中仅为**占位展示**，尚未获得产品终审。当前存在不等于产品批准。Codex/OpenCode 禁止将其扩展为新的交互工作流或新增业务逻辑。Product Owner 后续需决定：a) 从终端 UI 隐藏；b) 仅作只读状态展示；c) 保留孩子侧申诉操作；d) 仅保留在家长控制台 |
| D-016 | Vendor/Support 域名保留在 defaultCompositeSites | Active | 以下 7 个域名明确保留在 `defaultCompositeSites`（综合网站）中：`www.google.com`、`support.google.com`、`support.microsoft.com`、`answers.microsoft.com`、`microsoft.com`、`apple.com`、`adobe.com`。这是 Product Owner 明确批准的例外，不适用于其他软件/vendor 域名。禁止将其移动到 `defaultStudySites`，禁止以此为理由继续添加同类域名。新增软件/vendor 域名到系统默认清单必须获得 Product Owner 单独批准。 |
| D-017 | System Recovery 场景是 V0 formal release gates | Active | Chrome close/reopen、Lock/unlock、OS sleep/wake、Network offline/online 是 V0 formal release 的 Release Gates，不是普通回归测试。V0 formal release 前这些 Gates 必须通过，或由 Product Owner 明确 waive。runner 实现不等于 Gate pass；SKIP 也不等于 Gate pass。OpenCode 停止作为主执行器，Codex 接管剩余 Release Gate 工作；Chrome Web Store 发布是独立后续任务，不属于当前 Gate 范围。 |
| D-018 | Time Accounting Reliability Model | Active | V0 计时统计采用统一 stale-boundary 规则：有效计时只能来自闭合事件段；若 `now - lastHeartbeat > STALE_GAP_THRESHOLD`，旧段必须在 `lastHeartbeat` 关闭，否则在 `now` 关闭；关闭时间必须 clamp 到 `[session.startTime, now]`，新段若存在从 `now` 开始。`lastHeartbeat` 到 `now` 的未观察 gap 不计入普通 foreground、后台 audio 或 PiP 有效时长；badge 当前段显示也必须使用同一封顶口径。不迁移历史 `event_log_v1`，聚合 schema 保持兼容。 |
| D-019 | V0 三模式低摩擦切换 UX 规格冻结（文档决策） | Active | V0 可见模式定义为 Study/Composite/Rest/Paused；Composite 使用独立时间归因与配额，不并入 Study。切换规则：Study→Composite 为普通确认页；Rest→Composite 自动切换+轻提示；Study→Rest 必须单轴横向滑动确认（不可单击）；Composite→Study 与 Rest→Study 自动回归；Composite→Rest 普通确认；hardBlocked/unsafe 走独立拦截流，不参与模式切换。非目标：AI 分类、composite 二级分类、path-level routing、import/export schema 变更、复杂手势解锁。并保持 `SITE_ACCESS_POLICY.md` 边界（compositeList 窄口径；普通门户/社交/游戏不默认进 composite；`bilibili.com` 维持非 Study/非 Composite/非 unsafe，归受限娱乐网站，除非 PO 后续改判）。 |
| D-020 | V0 自动模式切换稳定门控 | Active | 自动切换增加门控防抖：`Rest->Composite` 需目标站点前台活跃连续 60 秒；`Rest->Study` 与 `Composite->Study` 需前台活跃连续 90 秒。门控期必须监控开启且有用户活跃，若切站/中断/监控关闭则取消候选并重新计时。门控期时间归属保持原模式，不做回填。显式确认切换（Study->Composite、Study->Rest、Composite->Rest）保持即时生效。 |
| D-021 | Admin CSP 告警当前按已知问题管理（未修复） | Active | `admin/admin.html?view=stats` 的 `Executing inline event handler violates Content Security Policy` 控制台告警在多轮诊断后仍未定位到唯一可行动源。当前口径：不宣称 fixed，按 admin 页面已知告警管理；不得将其直接判定为核心 runtime/mode/popup/content-script 失败。需继续以功能验证为准（stats/rules/devices/navigation/login/logout/save/sync）；本决策不改变 V0 formal release gate 状态。 |
| D-022 | V0 closeout 采用“手动验收 + gate 放行”双轨判定 | Active | Product Owner 已手动验收通过 Reminder UI、pending mode-transition feedback、Popup V0 layout、Admin 功能；但 Formal V0 Release 仍需满足发布闸门：System Recovery Gates、macOS smoke checklist（`docs/macos_v0_smoke_test_checklist.md`）、回归测试与打包前校验。任一 gate 未完成时，不得宣称 V0 release-ready。 |

## 变更规则
- 新决策必须追加一条记录（不改历史 ID）。
- 决策状态：`Active / Superseded / Dropped / Pending PO`。
