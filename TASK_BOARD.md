# TASK_BOARD

## Active Release Target
- `V1-minimal release candidate`（当前首次正式发布目标）
- `V0` 已冻结为 internal stabilization baseline（保留证据，不作为正式发布版本）

## Active Collaboration Model
- [x] 三角色 Codex 协作基线已建立并简化为 lightweight solo-product workflow（docs-only）
  - `Product&Project Mg`：spec / plan / acceptance criteria / implementation review
  - `Build&Test`：implementation / unit and integration tests / evidence
  - `releaseMg`：acceptance / release gate / readiness recommendation
  - Mandatory role contracts：`docs/agents/ProductProjectMg.md`、`docs/agents/BuildTest.md`、`docs/agents/ReleaseMg.md`
  - Formal handoff only when scope/permission/release evidence needs durable boundaries：`docs/handoffs/HANDOFF_TEMPLATE.md`
  - Workflow entry：`PROJECT_WORKFLOW.md`
- [x] Workflow simplification adopted
  - Small routine work: no default spec / handoff / audit / release report
  - Medium work: concise spec/result/test/risk evidence
  - Release/high-risk work: checklist/readiness/blocker table only where useful
  - CWS installed-ID parity deferred until CWS review approval makes the public item installable
- [x] ChatGPT role adjusted to external advisor
  - ChatGPT：external advisor / architecture reviewer / decision support
  - Not daily scheduler, not routine bugfix guide, not every-session prompt generator
  - Escalate only for product model, architecture, storage/cloud/stats/permissions, release blocker disputes, role conflicts, suspected scope violations, or Product Owner second opinion

## Product Design Drafts（2026-08-03）
- [ ] [Spec Draft] 日历例程管理规格
  - 文档：`docs/specs/SPEC-001-CALENDAR-ROUTINE-MANAGEMENT.md`
  - 状态：Draft 已建立，等待 Product Owner 审核；获批前不进入代码、schema、API 或迁移设计。
  - 核心：固定自然时间内的常态内容策略；支持周期与一次性例程；任一时刻最多一个有效日历例程。
- [x] [Spec + Technical Design Approved] 任务管理 V1
  - 产品规格：`docs/specs/SPEC-002-TASK-MANAGEMENT.md`
  - 技术设计：`docs/specs/SPEC-002-TASK-MANAGEMENT-TECHNICAL-DESIGN.md`
  - 状态：Product Owner 已批准产品规则和技术结构；目标分支 `codex/task-management-v1` 已建立，进入隔离实现阶段。
  - 核心：一次性强制 Chrome 任务；按有效任务使用时长完成；不支持周期任务或固定截止时间；多设备按有效区间并集累计。
  - 实施边界：任务代码、migration 和测试只进入 `codex/task-management-v1`，不得与其他功能提交混合；不执行远端 D1 migration、不部署生产环境，除非 Product Owner 后续单独授权。

## Current Development Focus（2026-08-05）
- [x] [Task-management / P1] 任务管理 V1 第一实现包
  - 分支：`codex/task-management-v1`
  - 范围：新增 `tasks_v1`、`task_events_v1` migration 和 Worker repository；实现任务 schema、资源规范化和生命周期纯函数。
  - 边界：暂不开放 Pages 创建入口，不执行远端 D1 migration，不部署生产环境，不修改扩展发布版本。
  - 测试：新增任务单测、Worker 相关回归、`npm run typecheck`、`git diff --check`。
- [x] [Task-management / P2] 任务管理 V1 Worker API 与 capability
  - 分支：`codex/task-management-v1`
  - 范围：新增 parent/device 任务读取、创建、核心字段 revision 更新、生命周期 action API；设备 heartbeat 记录 `taskManagementV1` capability。
  - 边界：不开放 Pages 创建入口，不执行远端 D1 migration，不部署生产环境，不修改扩展发布版本。
  - 测试：任务 API 静态/契约测试、任务纯函数回归、Worker 相关回归、`npm run typecheck`、`git diff --check`。
- [x] [Task-management / P3] 任务管理 V1 扩展缓存、拉取、alarm 和纯策略层
  - 分支：`codex/task-management-v1`
  - 范围：扩展端新增任务缓存与 device task pull；每分钟任务拉取 alarm、最近未来任务到点 alarm；heartbeat 上报 `taskManagementV1` capability、任务版本和当前生效任务摘要；新增纯策略函数计算生效任务、资源并集和进度归属。
  - 边界：不接入运行时拦截、不写 usage segment 任务快照、不改 Popup/Admin/Reminder UI，不执行远端 D1 migration，不部署生产环境，不修改扩展发布版本。
  - 测试：任务纯函数与扩展任务同步静态/契约测试、`npm run typecheck`、`git diff --check`。
- [x] [Task-management / P4] 任务管理 V1 runtime session/segment 快照与边界重评估
  - 分支：`codex/task-management-v1`
  - 范围：打开 counted session 时记录任务匹配快照；usage segment 保存并上传 `matchedTaskIdsAtTime` / `progressTaskIdAtTime` / `taskRevisionAtTime`；任务开始和任务完成边界触发当前 session 结算、任务缓存刷新和 active tab 重评估。
  - 边界：不实现 Worker 多设备进度投影，不开放 Pages 创建入口，不改 Popup/Admin/Reminder UI，不执行远端 D1 migration，不部署生产环境，不修改扩展发布版本。
  - 测试：任务 runtime 静态/契约测试、usage segment 快照测试、Worker stats ingest 静态测试、`npm run typecheck`、`git diff --check`。
- [x] [Task-management / P5] 任务管理 V1 Worker 进度投影与多设备区间并集
  - 分支：`codex/task-management-v1`
  - 范围：Worker 仅在 `usage_segments_v1` 新插入 segment 后，从同一 `profile_id + task_id + revision` 的 accepted segments 重算时间区间并集，写入 `tasks_v1.completed_seconds`，首次达到要求时标记 `completed` 并写入 usage completion event。
  - 边界：不新增第二套任务时间上传协议，不改扩展端阻断/UI，不开放 Pages 创建入口，不执行远端 D1 migration，不部署生产环境，不修改扩展发布版本。
  - 测试：任务 repository/projection 静态与纯函数测试、Worker stats ingest 触发投影测试、`npm run typecheck`、`git diff --check`。
- [x] [Task-management / P6] 任务管理 V1 Popup/Admin/Reminder 只读展示
  - 分支：`codex/task-management-v1`
  - 范围：基于扩展端 task cache 构造只读 read model；Popup 展示当前强制任务、进度归属任务和最近未来任务；本地 Admin 增加任务管理只读页；Reminder 在任务限制场景展示任务资源摘要。
  - 边界：不实现任务创建/编辑，不改变访问控制或配额逻辑，不开放 Pages 创建入口，不执行远端 D1 migration，不部署生产环境，不修改扩展发布版本。
  - 测试：任务 read model 静态/契约测试、Popup/Admin/Reminder 静态测试、`npm run typecheck`、`git diff --check`。

- [x] [Task-management / P7] 任务管理 V1 Pages 创建入口与 capability gate
  - 分支：`codex/task-management-v1`
  - 范围：云端 Pages 增加一级“任务管理”入口；读取任务列表和 capability 摘要；在所有在线受管设备支持 `taskManagementV1` 时允许创建一次性任务；提供暂停、恢复、留痕完成和取消动作；完成/取消历史默认折叠。
  - 边界：不执行远端 D1 migration，不部署生产环境，不修改扩展发布版本；任务进度仍由 Worker 基于 usage segment 投影，Pages 不计算可信进度。
  - 测试：Pages 静态/契约测试、任务 Worker/API 回归、`npm run typecheck`、`git diff --check` 与 Pages 目视验证。

## Current Fix Focus（2026-07-28）
- [x] [Extension Admin UI] 终端网站归类记录对齐云端结构
  - 目标：本地 Admin 使用“复合网站申请学习记录 / 未归类网站使用记录”两单元只读布局，未处理默认展开、已处理默认折叠。
  - 边界：仅展示本机已同步的 `site_classification_requests_v1`；不调用云端 30 天统计聚合，不增加本地审批或配置修改能力。
- [x] [Cloud UI/API] 网站归类记录唯一事实修订
  - 目标：`target_stats_v1` 只作为未归类使用证据；所有云端归类操作先创建或复用 `site_classification_requests_v1` 审核记录，再通过 decision 写入 profile 配置。
  - 边界：不改 D1 schema、不改扩展端计时/拦截/绑定/同步；访问管理次入口与网站归类记录入口使用同一操作归属。
- [x] [Cloud UI/API] 已使用未归类历史待归类落账可见性修复
  - 目标：`target_stats_v1` 中历史曾按 `pending_composite` / `unclassified` 落账、但当前配置已归类的网站仍在“已使用未归类网站”分区显示为解释项，避免统计有来源但审核入口不可见。
  - 边界：当前已归类的历史解释项不提供重新归类动作；不修改历史统计、不改运行时落账、不改 D1 schema。旧“不可生成审核记录”口径已由本轮“网站归类记录唯一事实修订”覆盖：stats-only 待处理项操作前必须 ensure 审核记录。
- [x] [Cloud Sync] 网站归类记录上传 500 与重试耗尽修复
  - 目标：`/device/site-classification-requests/v1` 批量上传中单条异常不得导致整批 HTTP 500；客户端“立即同步”必须强制重试已耗尽的网站归类记录，避免本地待审核记录永久卡住。
  - 证据：生产 `device_access_audit_v1` 显示设备 `d8ebf69d-f25f-4f84-a1c1-8fb90ba9011e` 在 2026-07-30 17:26 UTC 连续 POST 500，payload_count=3；后续同步只 GET 审核记录，不再 POST。
  - 边界：不改 D1 schema、计时、拦截或归类语义。旧“不从 `target_stats_v1` 反向生成审核记录”口径已由本轮“网站归类记录唯一事实修订”覆盖：统计发现项归类前先 ensure 审核记录。
- [x] [Pages] 网站归类记录统一入口
  - 目标：云端“网站归类记录”同页分区展示 `site_classification_requests_v1` 审核记录与 `target_stats_v1` 聚合的已使用未归类网站。
  - 边界：旧口径为只改 Pages UI；已由本轮 Cloud UI/API 修订升级为 ensure request 后再 decision。
- [x] [Pages] 网站归类记录旧自动记录兼容显示
  - 目标：云端旧记录缺少 `recordSource` 但已有首次/最近访问和顶层导航次数时，仍按“自动未归类访问记录”分组展示。
  - 边界：只改 Pages 展示判定与静态测试；不改 Worker API、同步、审批或记录结构。
- [x] [Cloud Sync] 归类申请上传触发可靠性修订
  - 目标：修复归类申请提交后依赖 cloud-sync 内存 deviceToken 才触发上传的问题；本地 unpacked 扩展 service worker 重启后也应立刻触发 syncNow，并在撞上已有同步时安排补同步。
  - 边界：不改变配置、归类申请、统计、配额上传流程；保留 2 分钟 stale lock 自动释放逻辑。
- [x] [Stats UI] 待归类借用休息配额展示口径修正
  - 目标：使用分析主图和对象列表按 `targetClassificationAtTime` 展示访问对象性质；`quotaBucketAtTime=rest` 只作为配额来源提示，避免待归类对象借用休息配额被显示为普通休息时间。
  - 边界：只改 Pages/Admin 展示 read model 与测试；不改 segment 落账、上传协议、配额扣除、拦截或时间段路由。
  - 语义澄清：时间使用性质取决于访问内容/对象，不取决于配额来源；时间段管理主要是内容使用窗口，配额可借用但不改变使用性质。
- [x] [Runtime] 主站等价域名绕过修复
  - 目标：将 bare / www / m 主站入口统一为同一 site identity，阻止通过 `www.google.com`、`m.google.com` 或同 host URL 绕过已有主站策略申请/添加为学习网站。
  - 边界：不折叠 `docs.google.com` 等独立服务子域；不迁移历史 segment；YouTube 特殊对象例外保持不变。
- [x] [Runtime] 受限父域压制历史 host 待归类记录
  - 目标：修复历史/自动生成的 `www.youtube.com` pending 记录覆盖 `youtube.com` 受限娱乐父域，导致 YouTube 根域继续落账为待归类时间的问题。
  - 边界：保留具体 YouTube 视频、播放列表、频道申请在审批前作为 pending 特殊对象；不迁移历史 segment，不改变配额扣除结构。
- [x] [Stats UI] 待归类借用休息配额命名收敛
  - 目标：将展示 notice、测试名和统计解释源从“进入休息模式 / target quota bucket”收敛为“借用休息配额 / target classification snapshot”。
  - 边界：保留 `composite_exhausted_to_rest` 等 legacy internal reason 作为兼容枚举；只修正文案、文档说明和展示层命名，不改变底层路由值或落账结构。
- [x] YouTube raw guardian_config 漏网消费者修复
  - 修复 Popup snapshot 与 runtime session managed target attribution 直接读取 raw guardian_config，导致旧 composite 残留继续显示/落账为复合时间的问题。
- [x] YouTube 根域与时间段生效问题修复
  - 发现：旧云端系统配置可能仍把 youtube.com 放在 defaultUserCompositeSites，导致根域被按复合来源加载；系统配置读取必须强制执行 YouTube 根域受限娱乐不变量。
  - 发现：PUT /profiles/:id/config 重新计算复合 effective 清单时漏合并 defaultUserCompositeSites；保存配置后可能造成 GET/PUT 口径不一致。
  - 发现：时间段已在访问观察和手动切换时检查，但定时 EVALUATE_QUOTA_STATE 只评估配额，跨过时间段边界后不会主动重检当前模式。
  - 边界：不改变 YouTube 特殊对象审批规则，不迁移历史统计，不改绑定、DeviceToken、Popup 申请逻辑或部署脚本。
- [x] 控件端用户配置网站可见性修复
  - 目标：访问管理配置文件页显式展示当前档案用户自定义网站摘要和清单，避免用户配置与系统配置混淆。
  - 边界：只改云端 Pages 展示和 profile 导出口径；不改系统网站默认 JSON、不部署、不执行 D1。
- [x] 用户自定义网站提升到系统配置
  - 目标：云端网站管理的用户自定义配置项增加“添加到系统配置”，管理员可将当前档案自定义网站提升到全局系统网站库。
  - 边界：提升后从当前 profile custom list 移除；不改本地 Admin 只读边界，不新增 Worker API。
- [x] 已使用未归类网站独立模块
  - 目标：从复合网站页移出，升级为网站管理左侧策略目录项，顺序位于“特殊网站”之后。
  - 边界：云端保持可归类；本地 Admin 只读展示；不改运行时处理、Worker API、计时、拦截或同步。
- [x] [Version] 当前源版本提升到 `1.7.16`：`extension/manifest.json`、`docs/CHANGELOG.md` 与版本断言测试同步；本轮用于发布 Popup 绑定状态修复、访问管理 UI 和 YouTube 特殊网站管理更新。
- [x] Popup 已绑定状态误报本地模式修复
  - 目标：把云端绑定状态与 activation gate 状态分开；Popup 同时参考 storage 标准绑定键和 cloud-sync 运行态；已绑定但门禁未通过时显示具体待处理原因，不再显示“本地模式”。
  - 边界：不改绑定、同步、计时、拦截或申请逻辑。
- [x] 本地访问管理只读 UI 对齐云端展示
  - 目标：本地 Admin 访问管理改为云端风格只读目录，保留网站管理、时间配额、时间段管理、网站归类记录；网站管理新增特殊网站入口并单独展示 YouTube。
  - 边界：不改云端 Pages 可编辑逻辑，不改 Worker/API/storage schema，不允许本地新增、审批或保存配置。
- [x] 云端 Pages YouTube 特殊规则列表化
  - 目标：将云端访问管理里的 YouTube 特殊网站区同步为单一规则列表，每行展示对象、类型、管理属性、来源和操作。
  - 边界：保留云端可编辑；特殊对象可在当前真实生效的学习、复合、受限娱乐之间变更，根域 youtube.com 仍固定受限娱乐。
- [x] 本地 Admin YouTube 特殊规则列表化
  - 目标：把 YouTube 特殊网站页从多块说明改为单一规则列表，每行展示对象、类型、管理属性、来源和只读状态。
  - 边界：本地 Admin 不直接编辑；Popup 仍可发起学习申请，云端家长控制台审批或调整后同步到本机。
- [x] 云端 Pages 特殊网站入口层级回正
  - 目标：`特殊网站` 是左侧管理策略目录项，不是来源筛选项；进入后只显示 YouTube 特殊对象规则列表。
  - 边界：普通学习/复合/受限娱乐/黑名单页面不再附加特殊网站摘要；普通网站不能被移动到“特殊网站”策略。
- [x] Popup YouTube 特殊申请面板 UI 重设计
  - 目标：把 YouTube 特殊申请从原生按钮/重提示块改为紧凑卡片、分段对象按钮、轻说明和确认信息条。
  - 边界：只改 Popup 申请面板 UI 和文案，不改申请提交、后台校验、特殊网站规则或 Pages 网站管理。
- [x] Popup YouTube 频道选项和颜色可读性补丁
  - 目标：加深特殊申请面板字体颜色，修复 CSS 可读性问题，并把 content script 上报的 YouTube 频道上下文纳入 Popup 对象选项；无频道上下文时不显示频道。
- [x] Popup YouTube 默认单个视频和字体补丁
  - 目标：YouTube watch 同时包含视频和播放列表时默认申请单个视频；特殊申请面板使用正常 UI 字体，降低过重字重和等宽字体带来的违和感。

## Current Fix Focus（2026-07-27）
- [x] 特殊网站管理：YouTube 根域受限、对象级学习/复合规则
  - 目标：`youtube.com` 根域进入受限娱乐；具体视频、播放列表、频道可作为特殊对象由家长批准为学习或复合。
  - 目标：Popup 对 YouTube 使用特殊申请面板；Pages 网站管理新增特殊网站入口。
  - 边界：不改变绑定、计时、同步、DeviceToken 或部署逻辑；`music.youtube.com` 本轮不变。
- [x] defaultUserCompositeSites 运行时加载一致性修订
  - 目标：修复现有 Profile 未稳定加载 `defaultUserCompositeSites`，导致部分系统复合默认站点掉成未归类的问题。
  - 目标：Worker effective config、扩展端配置归一化、分类解析、Popup/Admin 展示统一把 `defaultUserCompositeSites` 作为复合系统来源。
  - 边界：不改变未归类访问路由，不把 YouTube 改为学习，不迁移历史统计。
- [x] 网站归类动作统一校验
  - 目标：家长添加、孩子申请、家长审批和 Worker 上传统一阻止受限娱乐/黑名单父域下新增学习/复合子域或精确 URL。
  - 目标：Popup 点击“申请归为学习网站”入口时先做只读校验，失败不展开申请面板；提交按钮保留二次校验。
  - 边界：不迁移历史配置，不改变计时、拦截、同步和统计落账模型。
- [x] 访问管理统一配置导入导出
  - 目标：`访问管理 -> 配置文件` 改为单一导入/导出入口，默认包含用户配置和系统配置，可按两类范围选择。
  - 边界：新导出统一使用 bundle；旧 `profile-config` / `system-access-config` 只保留导入兼容。
- [x] 网站添加校验与重复检查修订
  - 目标：恢复“添加到当前策略”入口的非法输入提示、同策略重复检查和跨策略重复阻断。
  - 目标：添加入口只新增用户自定义配置，不再静默移动其他策略中的已有网站。
  - 边界：不改变保存 API、系统配置 API、计时、拦截、同步逻辑。
- [x] 网站管理命名、来源顺序与系统配置导入体验修订
  - 目标：统一“用户自定义配置 / 系统网站配置”文案，右侧来源顺序调整为已使用未归类、用户自定义、系统网站配置-分类管理、规则、未标注。
  - 目标：系统网站配置导入改成与用户自定义配置一致的差异确认与勾选应用体验。
  - 边界：不改变扩展计时、拦截、绑定、同步逻辑，不新增 Worker API。
- [x] 系统网站分类管理可读性修订
  - 目标：为系统默认网站库补齐 `siteCatalog`，让系统配置真正按 Qustodio 内容分类分组。
  - 目标：Worker 读取旧 D1 系统配置时补齐缺失目录元数据，避免线上继续全部显示“未标注分类”。
  - 边界：不修改 profile 自定义、审批、计时、拦截、同步逻辑；`defaultUserCompositeSites` 后续按 D-052 作为运行时系统复合配置加载。
- [x] 网站管理页内补齐系统配置“分类管理”
  - 目标：在现有“访问管理 → 网站管理”右侧目录中，把系统配置网站按 Qustodio 内容分类分组展示。
  - 目标：管理员可点击系统配置网站编辑内容分类和 TimeOnChrome 管理策略分类，保存到系统访问配置并全局生效。
  - 边界：不新增独立一级页面或 Tab；用户自定义配置与已使用未归类网站仍只写当前 profile。
- [x] 网站管理 UI 重设计为管理策略目录
  - 目标：左侧按学习/复合/受限娱乐/黑名单导航，右侧按系统配置、自定义、精确规则、已使用未归类分组管理。
  - 目标：复合网站下新增“已使用未归类网站”，来源为最近 30 天使用历史聚合，不是审批记录列表。
  - 边界：不改变扩展计时、拦截、绑定、同步逻辑。
  - 验证：Pages/Worker 契约测试、站点归类回归、typecheck、check:extension-root、git diff --check 与本地 Playwright 布局检查通过。
- [x] 访问管理配置文件与系统访问配置云端化
  - 已实现：访问管理配置文件区已改为单一导入/导出入口，默认包含用户配置和系统配置两类范围。
  - 已实现：系统访问配置从代码固定 JSON 升级为 D1 云端可管理配置；代码 JSON 仅作为初始化/fallback。
  - 已实现：系统管理分类按 Qustodio Web Filters 风格维护内容类别，再映射到 TimeOnChrome 运行分类。
  - 边界：本轮修改源码、migration、测试和文档；未执行远端 D1 migration，未部署 Worker/Pages。
  - 验证：计划内本地单元/契约测试、typecheck、git diff --check 通过；tests/run-all.js 仅线上 API 集成因 fetch failed 未通过，沙箱外单跑同样失败。
- [x] Cloud backup restore feedback/config restore hardening
  - Symptom: restore UI can report table restore completion while profile config remains unchanged or unverified.
  - Target: preflight and completion must explicitly show config file presence, site-access editable presence, config write result, and post-restore config readback status.
  - Restore path should normalize restored site lists, quota legacy fields, and time windows with the same semantics as normal profile config save.
  - Deployed: guardian-api Worker version 1e56236f-3db1-4e00-a27f-9e4b61309ece; timeonchrome-console Pages production HTML verified with restore config markers.

## V1-minimal must-have（release readiness）
- [x] release gate matrix reset（V1-minimal 口径 docs matrix created; releaseMg validation/execution pending）
- [x] V1-minimal close-out plan（docs-only board created: `docs/release/V1_MINIMAL_CLOSEOUT_PLAN_2026-05-09.md`）
- [x] working tree status inventory（历史证据见 docs/archive/）
- [x] dirty product/test working-tree ownership audit（历史证据见 docs/archive/）
- [x] Product Owner decision brief（docs-only brief created: `docs/release/V1_MINIMAL_PRODUCT_OWNER_DECISION_BRIEF_2026-05-09.md`）
- [x] Product Owner decision proposal（docs-only proposal created: `docs/release/V1_MINIMAL_PO_DECISION_PROPOSAL_2026-05-09.md`）
- [x] Build&Test worktree ownership handoff（历史证据见 docs/archive/）
- [x] Cloud Stats v1 minimal sync gate（usage_segments_v1 + stats_v1）
- [x] Chrome Web Store reduced-permission package submitted（CWS status: `待审核`; not publicly released）
- [x] manifest permissions / host permissions wording review（submission text prepared）
- [x] privacy / data collection wording review（submission text prepared）
- [x] macOS + Windows informal real Chrome smoke（PASS_WITH_MANUAL_EVIDENCE; non-formal manual evidence accepted for current lightweight first-release process）
- [x] ReleaseMg production functional smoke（unpacked/local-load）closed as `PASS_WITH_MANUAL_EVIDENCE`（installed/version/enabled, popup-core, borrowing disabled, bind-sync; CWS installed-ID parity deferred by CWS review）
- [x] package build verification
- [x] final known risks section

### V1-minimal release artifact（2026-05-09）
- [x] Release ZIP generated: `dist/v1-minimal-20260509-023832/timeonchrome-v1.7.2-v1-minimal.zip`
- [x] SHA256 recorded: `A0A5C541A5A7D047E040D2163BF8735971798112E18E1D223BB9D55D80D7190B`
- [x] ZIP extraction verified: MV3 manifest, version `1.7.2`, required runtime files present
- [x] Package excludes `docs/`, `tests/`, `workers/`, `pages/`, `node_modules/`, `.env`, `.wrangler`, local Chrome profile data, cookies/history/login data
- [x] Release record prepared：历史证据见 docs/archive/
- [x] Chrome Web Store submission text prepared：历史证据见 docs/archive/
- [x] Chrome Web Store reduced-permission package submitted: `dist/cws-resubmit-20260509-122919/timeonchrome-v1.7.2-cws-resubmit-minimal-permissions.zip`
- [x] Chrome Web Store resubmission SHA256 recorded: `BE0F712285B6661C293175C649DDDC48E0D04217B18626EB3C284EEAB32DD71C`
- [x] Chrome Web Store status recorded: `TimeOnChrome 1.7.2` submitted / `待审核`
- [x] Artifact strategy A recorded（D-039: keep submitted CWS package as active review artifact; current `origin/master` is source follow-up line; no rebuild/resubmission now）
- [x] ReleaseMg readonly readiness report recorded：历史证据见 docs/archive/
- [ ] Public release（blocked until Chrome Web Store review completes and PO approves release close-out）
- [ ] ReleaseMg production acceptance close-out（currently PARTIAL / NOT CLOSED; CWS review and CWS installed-ID parity remain unavailable until CWS approval）
- [ ] **Release blocker: sub-second segment product policy**（当前本地账本保留 1 秒内网页切换 segment，`durationSeconds=0` 但 `startMs/endMs` 完整；正式发布前必须决定并实现最终策略：保留、毫秒级 duration、短段合并或 UI/cloud 过滤）
- [x] Dirty product/test working-tree ownership classification audit completed（prior dirty packages resolved through scoped commits; no dirty product/test package remains before this docs-only sync）
- [x] Git push（completed to `origin/master`; no tag/release approval implied）
- [ ] Git tag（blocked pending separate PO approval）

## V1-minimal out of scope（本轮不做）
- [ ] full three-mode model 重构
- [ ] AI content classification
- [ ] composite routing rebuild
- [ ] 当前 time borrowing / borrow quota 实现纳入发布范围
- [ ] legacy D1 cleanup/migration
- [ ] admin UI redesign
- [ ] historical data backfill
- [ ] site classification policy expansion

> 历史备注：`statsFoundationV1SyncEnabled` 曾列为 out-of-scope；按 D-035 已调整为 V1-minimal 必选门。当前 V1-minimal release truth path 是 `usage_segments_v1` + `stats_v1`。

## V1-minimal scope close-out（time borrowing）
- [x] 当前 time borrowing / borrow quota 实现路径已禁用（runtime + UI）
  - `BORROW_REST_QUOTA` 返回受控拒绝：`{ ok: false, error: "TIME_BORROWING_DISABLED_FOR_V1_MINIMAL" }`
  - 不修改 `quotaBorrow`
  - 不修改 rest/weekly quota state
  - reminder/popup/admin 不提供借用活跃入口
- [x] 兼容性口径确认：保留历史 `quotaBorrow` / `weeklyRestQuota` 字段容忍读取，不做清理迁移
- [x] 证据测试已完成：
  - `message-router-borrow-source 4/4`
  - `reminder-borrow-confirm 5/5`
  - `borrow-concurrency 3/3`
  - `reminder-transition-v0 67/67`
  - `background-logic 86/86`
  - `storage-aggregation-convergence 36/36`

## NOW（P0）
- [x] [Version] 当前源版本提升到 `1.7.15`：`extension/manifest.json`、`docs/CHANGELOG.md` 与当前 managed installer expectedVersion 示例已同步；历史 1.7.13 验证材料保持历史事实。
- [x] [Regression] 修复 tests/e2e/extension.test.js 中 T-E12c：根因是 Playwright `page.bringToFront()` 与异步 `privacy-consent.html` 抢前台导致 tab activation 场景不稳定；已改为显式接受隐私门、关闭引导页、通过 Chrome tabs API 激活目标 tab，并验证 `extension.test.js` 14/14 通过。
- [x] [P0/V1] 拆分“未归类网站访问记录”与“学习网站归类申请”：同站手动升级、导航次数聚合、Worker v2 兼容字段和 Popup/Admin/Pages/Reminder 展示；96 个 unit 文件、migration SQLite 校验及三端桌面/移动端视觉验证通过，待后续执行远端 D1 migration 与部署。
- [x] [Docs-only] 概念语义修订：综合时间 -> 待归类时间，综合网站 -> 复合网站，综合模式 -> 复合模式；新增 D-046，权威文档已统一，代码字段暂不迁移。
- [x] [Docs-only] 文档分层与历史归档：旧 audit/release/handoff/smoke/plan/PRD/TODO 移入 docs/archive/
- [x] [Docs/UI] 待归类/复合用户可见语义迁移：Popup/Admin/Reminder/Pages/页面内提示与对应测试断言统一新文案；内部 composite 字段和值保持不变。
- [x] [V1-minimal 1.7.13] 同步 Pierce macOS 最终验证安装器修订
  - [x] 从 Google Drive 私有压缩包 `timeonchrome-pierce-managed-installer-1.7.13-fixed-2026-07-22.tar.gz` 同步非敏感安装资产到 `docs/deployment/pierce-macos-target/`
  - [x] 新增一体化 `timeonchrome-managed-installer.sh`、`install.command`、`uninstall.command` 和 `private-config.example.plist`，并同步 keeper / LaunchDaemon 模板
  - [x] 记录目标 Mac 验证修复：目标用户环境 + profile-directory 启动、30 秒 controlled keeper restore、Chrome Managed Extension Settings 三轮稳定性检查、repair/reinstall 与 MDM 单文件删除模拟
  - [x] 真实 `private-config.plist` / `managedDeviceToken` 不进入 Git；`.gitignore` 已补保护
  - [x] 独立模块已拆出到 `tools/managed-chrome-extension-installer/`，包含通用安装器、模板、TimeOnChrome 示例和打包脚本
- [x] [V1-minimal 1.7.12] 修复 managed storage schema、更新链路及受管绑定显示元数据
  - [x] manifest 声明并打包 `managed-storage-schema.json`，字段与 activation gate / macOS / Windows 模板一致
  - [x] install/update lifecycle 在 managed Profile 匹配时立即采用 Token、hydrate `/device/config` 并完整同步，不打开手动绑定页
  - [x] 自动测试、完整回归、CRX schema 入包与签名 ID 门通过；逐文件 unit、API 103/103、duration flow 53/53、E2E 14/14 全绿
  - [x] 使用真实 Chrome 验证自动升级、`managed_policy` 激活和无人工操作绑定
  - [x] 原 PEM 已找回，派生 ID 精确匹配 `jdcancbiocacabbjdkngadmjpjmkdnih`；1.7.10 CRX 已构建并记录 SHA256，密钥仍被 Git ignore
  - [x] Wrangler OAuth 与 `timeonchrome-update` Pages 项目已确认
  - [x] Cloudflare Pages 生产源已部署 1.7.10；规范 `update.xml`、CRX、`SHA256SUMS.txt` 回读一致，CRX SHA256 为 `1496f68f6d73340ef6c654c114f3796e0cc956d6138c4d08adfb4d7b2f0f15f2`
  - [x] managed 专项证据：schema 36/36、activation behavior 6/6、activation gate 18/18、managed channel 14/14、plist/shell lint 与 self-hosted staging dry-run 通过
  - [x] 经 Product Owner 授权，过时 test harness / 静态断言已适配当前依赖和激活门；未为通过测试修改对应产品逻辑
  - [x] Product Owner 已授权仅修复过时测试 harness / 静态断言，不改变对应产品逻辑
  - [x] **P0 缺陷已修复：受管自托管扩展未自动更新。** 旧策略下真实 Chrome 正常重启、重新打开 Default Profile 并手动触发更新后仍停留在 1.7.9；加入 `override_update_url: true` 并发布新路径的 1.7.11 后，仅正常重启 Chrome 即自动升级成功。
  - [x] 自动更新根因确认：`ExtensionSettings.update_url` 默认用于首次安装，后续更新使用扩展 manifest 的 `update_url`；1.7.9 manifest 未声明该字段，且策略未设置 `override_update_url: true`，导致后续更新没有可用来源。
  - [x] 自动更新修复验收：1.7.11 manifest 声明自托管 `update_url`，macOS/Windows 策略设置 `override_update_url: true`，并使用新的 CRX 文件路径规避同版本 CDN 缓存；已证明无需开发者模式或人工点击“更新”即可从 1.7.9 升级到 1.7.11。
  - [x] 1.7.11 生产包回读：线上 `update.xml` 指向新 CRX 路径，包内 version/update_url/managed schema 正确，线上与本地 SHA256 均为 `cfdc7385fae90e61866dad5277cca7af212b6bf88df89709b2ea05a05ead9f7c`。
  - [x] **P0 缺陷已修复：macOS MCX 策略存在但未对当前电脑生效。** 修复前显式查询 `/Computers/local_computer` 可读取六个受管字段，但自动查询当前电脑返回 `no data found`，导致 `chrome.storage.managed` 为空并回退本地模式。
  - [x] MCX 根因确认：本地计算机记录只有 `ENetAddress`，当前电脑无法被 ManagedClient 自动匹配；显式指定记录可正常合成策略。部署脚本必须写入 `IOPlatformUUID` 对应的 `HardwareUUID`，且不得吞掉 `mcxrefresh`/有效策略查询失败。
  - [x] MCX 修复验收：补齐 HardwareUUID 后，`mcxquery -user william_xia_cn` 已无需显式 `-computer` 返回 TimeOnChrome 域及 managed/token/profile 字段；真实 Chrome 已确认 Token 自动采用、设备已绑定、恢复正常且云同步健康。
  - [x] **P0 显示缺陷：受管 Token 绑定后账户/用户为空。** `/device/config` 与扩展持久化已修复并发布 1.7.12；生产接口只读验证账户邮箱、Profile 名称、Profile ID、Device ID 均存在，相关测试 114/114 通过。生产 `update.xml` 与 CRX 回读一致，SHA256 为 `025661e70d93a16ed9c72cc7ed310c3e4033ab33da2a84e0e39bc75862fa4084`；真实 Chrome 管理中心已显示账户 `william.xia.cn@gmail.com` 与用户 `william.xia`，连续失败为 0。
  - [ ] Chrome UI 自动化限制：真实 Chrome 控制已连接，但安全策略禁止自动访问 `chrome://policy` / `chrome://extensions`；人工触发更新只能用于继续 Token 绑定诊断，不能作为自动更新缺陷的关闭证据。
- [x] [V1-minimal] Docs-only close-out plan created（`docs/release/V1_MINIMAL_CLOSEOUT_PLAN_2026-05-09.md`）
- [x] [V1-minimal] Working tree status inventory recorded（历史证据见 docs/archive/）
- [x] [V1-minimal] Build&Test dirty product/test ownership audit recorded（历史证据见 docs/archive/）
- [x] [V1-minimal] Product Owner decision brief created（`docs/release/V1_MINIMAL_PRODUCT_OWNER_DECISION_BRIEF_2026-05-09.md`）
- [x] [V1-minimal] Product Owner decision proposal created（`docs/release/V1_MINIMAL_PO_DECISION_PROPOSAL_2026-05-09.md`）
- [x] [V1-minimal] Product Owner approved default decision proposal（`docs/release/V1_MINIMAL_PO_DECISION_PROPOSAL_2026-05-09.md`）
- [x] [V1-minimal] Build&Test CWS least-permission report handoff created（历史证据见 docs/archive/）
- [x] [V1-minimal] Build&Test worktree ownership handoff created（历史证据见 docs/archive/）
- [x] [V1-minimal] releaseMg readonly readiness report recorded（历史证据见 docs/archive/）
- [x] [V1-minimal] production functional smoke closed with Product Owner manual visual evidence（unpacked/local-load instance）
- [x] [V1-minimal] Windows/macOS informal smoke completed（PASS_WITH_MANUAL_EVIDENCE; not automated lab evidence）
- [x] [V1-minimal] Product Owner decisions on prior worktree audit findings resolved except Pages stats-v1 later package
- [x] [V1-minimal] admin/bind ownership resolution recorded（历史证据见 docs/archive/）
- [x] [V1-minimal] Build&Test admin/bind account-token implementation review recorded（历史证据见 docs/archive/）
- [x] [V1-minimal] Build&Test admin/bind account-token minimum verification recorded（历史证据见 docs/archive/）
- [x] [V1-minimal] Product Owner authorized admin/bind small unit test package（no product code edits, no rebuild, no commit/release）
- [x] [V1-minimal] Build&Test admin/bind test package handoff created（历史证据见 docs/archive/）
- [x] [V1-minimal] Build&Test admin/bind test package report recorded（历史证据见 docs/archive/）
- [x] [V1-minimal] Product Owner approved admin/bind package inclusion as V1-minimal follow-up candidate（`DECISIONS.md:D-038`; not release-ready, no rebuild/commit/release authorization）
- [ ] [V1-minimal follow-up] Track admin auto-login stale-token semantics separately（non-blocking for admin/bind include）
- [ ] [V1-minimal] Product Owner approval/revision of `docs/release/V1_MINIMAL_PO_DECISION_PROPOSAL_2026-05-09.md`
- [x] [V1-minimal] Build&Test CWS least-permission implementation report recorded（历史证据见 docs/archive/）
- [x] [V1-minimal] Product Owner decision on CWS least-permission minimal verification plan（authorized）
- [x] [V1-minimal] Product Owner authorized CWS least-permission minimal verification only（no fixes/rebuild/commit/release）
- [x] [V1-minimal] Build&Test CWS least-permission minimal verification handoff created（历史证据见 docs/archive/）
- [x] [V1-minimal] Build&Test CWS least-permission minimal verification report recorded（历史证据见 docs/archive/）
- [x] [V1-minimal] Git/local consistency audit recorded（历史证据见 docs/archive/）
- [x] [V1-minimal] Completed local commits recorded（`9174900` docs package; `7072163` CWS least-permission package; `f498d13` admin/bind account-token package）
- [x] [V1-minimal] Remote consistency check completed（after push, local `master` and `origin/master` synchronized at `2260943`; no tag/release）
- [x] [V1-minimal] Pages stats-v1 ownership review recorded（历史证据见 docs/archive/）
- [x] [V1-minimal follow-up] Pages stats-v1 minimum verification recorded（历史证据见 docs/archive/）
- [x] [V1-minimal follow-up] Pages stats-v1 package committed and pushed as source follow-up line（no Pages deploy authorized）
- [x] [V1-minimal] Git push completed to `origin/master`（tag/release still blocked）
- [x] [V1-minimal] Product Owner artifact strategy A recorded（submitted CWS package remains active review artifact; current `origin/master` is source follow-up line）
- [x] [V1-minimal] `docs/CHANGELOG.md` grouping reviewed（include in release evidence commit set; not a release-ready claim）
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
- [x] **[P0/V1] Stats Storage Foundation — Phase 1**: Terminal settlement：`usage_segments_v1` + `daily_usage_stats_v1` ✅ 已完成（1B-R）
- [x] **[P0/V1] Stats Storage Foundation — Phase 2**: Read path ✅ 已完成（1C）
- [x] **[P0/V1] Stats Storage Foundation — Phase 3**: Segment + stats cloud upload ✅ 已完成（3C-R + 3E）
- [x] **[P0/V1] Stats Storage Foundation — Phase 4**: Cloud endpoints + audit logs ✅ 已完成（3C + 3C-R）
- [x] **[P0/V1] Stats Storage Foundation — Phase 5**: Cloud validation + roundtrip ✅ 已完成（3F + 3F-R + 3F-S）
- [x] **[P0/V1] Stats Storage Foundation — Phase 3 Cloud 实施计划** ✅ 已完成（3A）
- [x] **[P0/V1] Stats Storage Foundation — D1 迁移** ✅ 已完成（3B, 已部署到 remote guardian-db）
- [x] **[P0/V1] Stats Storage Foundation — 旧版 stats 安全补丁** ✅ 已完成（3D-1）
- [x] **[P0/V1] Stats Storage Foundation — 实时云验证** ✅ 已完成（3F-R, 3F-S）
- [ ] **[P0/V1] Stats Storage Foundation — 受控上线（等待 PO 批准）**
  - 当前状态：所有 Phase 1-5 代码和云基础设施已就绪并已验证
  - v1 同步默认禁用；生产环境中未调用 `setStatsFoundationV1SyncEnabled(true)`
  - 上线前需单独 PO 批准（见 `docs/STATS_STORAGE_FOUNDATION.md` §C.9）
- [ ] [V1] composite routing 设计与拆包
- [ ] [V1] 更精细分类能力设计（V0 之外）
- [ ] [P1] 系统配置全局影响治理
  - 背景：系统配置网站库、默认清单和 `siteCatalog` 修改后会全局生效，影响所有孩子档案的 effective 清单；这已记录在 `docs/SITE_ACCESS_POLICY.md` 和 D-050。
  - 后续处理：重新审查系统配置导入、页面内系统分类编辑、用户自定义提升到系统配置的权限、确认文案、preflight、审计记录和回滚/恢复策略。
  - 边界：普通 profile 用户配置导入/恢复不得修改系统配置；后续方案需要单独确认后再实施。
- [ ] [P1] 访问管理配置导入冲突与冗余预检补强
  - 问题：当前导入配置文件时没有显式检查用户配置与系统配置之间的跨策略冲突，也没有提示同策略冗余项。
  - 已发现样例：`timeonchrome-access-management-config-v1-2026-07-28 (2).json` 中 `kognity.com`、`physicsclassroom.com`、`logic.ly` 同时存在于系统学习和用户学习；不构成硬冲突，但导入前应提示可清理。
  - 后续处理：导入预检/差异确认需要覆盖系统内部、用户内部、用户 vs 系统跨策略冲突；同策略重复作为 warning 展示，并建议从用户配置移除。
- [x] **[P1] Child-facing entry points expose mixed admin page — Stage 1 (Soft Gate) 已完成**：
  - 已实施：孩子端入口（popup 设置按钮、未绑定横幅、reminder 查看详情）现已通过 `?view=stats` 参数以只读模式打开 `admin/admin.html`
  - 已实施：admin.js 入口逻辑添加 `isChildView` 分支，跳过登录/注册/绑定流程，隐藏退出登录、重新绑定等家长控件
  - 待 PO 决策（不影响 V0）：
    - 孩子是否应访问详细使用分析统计？（当前已通过 Soft Gate 允许）
    - 未绑定设备时，孩子应看到什么操作入口？（当前显示简化提示"请联系家长完成设备绑定"）
  - Stage 2（V1 规划）：新建独立 `terminal/usage.html` 孩子只读页，彻底拆分 admin.html 的家长 setup 职责 → 见 P2 项
- [ ] **[P0] Chrome Web Store review follow-up / public release close-out** — reduced-permission package submitted; CWS status `待审核`; public release remains blocked until CWS review state is known and Product Owner approves release close-out

## LATER（P2）
- [ ] [V1] macOS smoke checklist 后续如需重启，先基于当前 release gate 重新制定；历史 V0 smoke 证据见 docs/archive/
  - 状态：Product Owner accepted V0 release risk（deferred, not passed）
  - 口径：该项从 V0 active blocker 移至 V1 follow-up
- [ ] **[P2/V1] macOS managed installer MDM plist deletion recovery verification**
  - 验证目标：MDM 只删除 active Chrome managed preferences plist 时，LaunchDaemon keeper 是否能通过 `WatchPaths` 或 `StartInterval=60` 自动恢复。
  - 场景 A：删除 `/Library/Managed Preferences/com.google.Chrome.plist` 与 `/Library/Managed Preferences/com.google.Chrome.extensions.<extensionId>.plist`，等待 keeper 自动恢复，并检查 owner、permission、`plutil` 与 source/active `cmp`。
  - 场景 B：删除 `/usr/local/timeonchrome-policy/`、restore script 或 LaunchDaemon 后，确认 keeper 不会误报已恢复，需重新运行 `install`。
  - 验收口径：active plist 单独丢失可自动恢复；keeper/恢复源丢失时需重新安装；重新安装不因旧 fixed `expectedVersion` 阻塞，默认 latest policy 生效。
  - 边界：需要目标 Mac 或受控 macOS 环境执行；Windows/Codex 环境不得宣称通过；不得记录真实 `private-config.plist`、`managedDeviceToken`、PEM 或 CRX。
- [ ] [V1] Playwright E2E alternate-environment rerun（duration-accuracy / timing-trace-smoke / timing-trace-verify）
  - 状态：Windows 本地 `spawn EPERM` 环境阻塞；Product Owner accepted V0 release risk（deferred, not passed）
  - 口径：该项从 V0 active blocker 移至 V1 follow-up
- [ ] [V1] 凌晨休息时间限制：允许配置凌晨不可用于休息时间，防止熬夜娱乐
- [ ] [V1] PiP cleanup permission alignment：移除 `product/interceptor.js` 中 `chrome.scripting?.executeScript` 的可选 PiP cleanup 分支，只保留 `chrome.tabs.sendMessage(tabId, { type: 'EXIT_PIP' })` content-script 路径；目标是让 production source 与最小权限 manifest/CWS 审核口径完全一致
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
- [ ] **[Post V1-minimal] Time borrowing redesign（原始需求保留）**
  - 当前实现中的 borrow runtime/UI path 不进入 V1-minimal 发布范围。
  - 本项迁移为后续版本重设计输入，需重新定义：
    1) 借用来源与借用目标；
    2) 配额扣减与归还规则；
    3) 审批/确认流程；
    4) UI 入口（popup/admin/reminder）；
    5) 云端字段与同步契约；
    6) 统计归因与报表口径；
    7) 与休息/综合/受限娱乐路由关系。
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
- [x] [V0 Release Evidence] Admin subpage refresh on navigation：子页切换从“仅 DOM 显隐”修复为“切页后按页面刷新数据”；`rules/stats` 切页重新 `GET_CONFIG`；`devices` 保留即时刷新；新增 `adminPageRefreshSeq` 防止旧请求覆盖；新增 `rules/stats/devices` 错误态渲染。验证：`admin-nav-refresh 5/5`、`admin-stats-overview 10/10`、`admin-undetermined-list 50/50`、Manual browser verification PASS。
- [x] [V0] Bind 流程修复：CSP 合规（bind.js 外部化）、auth 变量冲突、cloud-sync token 守卫
- [x] [V0] 后台 audio/video 统计补 domain 明细：`backgroundMediaByDomain` 与 `audioSeconds` 摘要对账通过
- [x] [V1] PiP timing support 最小闭环：`PIP_ACTIVE -> pipSeconds / pipByDomain`，不混入普通在线或后台媒体；学习模式切换关闭非学习网站 PiP
- [x] [V0] 跨自然日计时按自然日切分：代码口径盘点、最小测试、聚合层修正
- [x] [V0] monitoring 核心短路收口
- [x] [V0] 配置字段单一模型收口
- [x] [V0] Background Audio Time 最小版
- [x] [V0] dev-reset 工具页（dev-only）
- [x] [V0 Release Evidence] Mode-switch in-page prompt lifecycle hardening：pending notice 绑定 `tabId + domainSnapshot`；`CONTENT_SCRIPT_READY` 基于 currentDomain 重发守卫；模式切换不依赖页面提示成功；验证结果 `interceptor-mode-transition-v0 84/84`、`content-rest-composite-pending-banner 23/23`、`mode-switch-prompt-lifecycle E2E 3 passed`
- [x] [V0 Release Evidence] Cloud sync evidence pass（read-only）：基于 D1 只读检查 + 真实 storage/admin runtime message 证据，确认 config sync、本地 stats message path、timeline path 均可用；确认 legacy cloud `stats` 表存在同 `profile_id/date/domain` 重复行风险（无 `UNIQUE`），已作为已知风险落账；本轮不做 Cloud/D1 写入、不启用 `statsFoundationV1SyncEnabled`、不改分类策略。
- [x] [V1-minimal Gate] Cloud Stats v1 minimal sync：Gate.Test 真实扩展闭环通过；`cloud_device_id` 已补齐并持久化；`CLOUD_FORCE_SYNC` 成功且 `v1Sync.lastError=null`、`pendingSegments=0`、`pendingStatsDates=0`、`lastSyncAt>0`；远端 `stats_v1/usage_segments_v1` duplicate checks 均为 `[]`；Worker `guardian-api` 已部署版本 `1c93c24a-17e6-418e-b870-83b5c4e3804d`。
- [x] [V1-minimal Gate] Recovery/System manual evidence close-out：已生成 close-out JSON/MD（`v1-minimal-recovery-gate-closeout-20260508-180200.*`）；manual gates 以 `MANUAL_VERIFIED_PASS` 落账；保留 sleep automated `PARTIAL` 事实并以 PO 手工语义验收补证据。
- [x] [V1-minimal Gate] Mode transition PiP cleanup + Study prompt regression：manual/auto 四路径已通过（Rest->Composite / Rest->Study），并完成 in-page prompt 生命周期回归；本项归类为 mode-transition UX / side-effect regression，不属于 Recovery/System gate。
- [x] [V1-minimal Close-out] Mode prompt delivery + popup noticeTabId + auto-transition delay update（PO review）
  - 页面内提示可见性已恢复；Product Owner 手动刷新后确认可见（当前为新提示形态）。
  - 提示样式调浅为更轻绿色；本次仅样式调整，不改变提示投递语义。
  - popup 发起 `SWITCH_*` 时携带 `noticeTabId`，提示优先投递到目标网页 tab，修复 popup 切换后目标网页无提示问题。
  - 自动切换延迟参数已更新并冻结：`Rest->Composite=30s`、`Rest->Study=45s`、`Composite->Study=45s`。
  - 文档同步：`docs/MODE_TRANSITION_UX_V0.md` 与 `DECISIONS.md:D-020` 已对齐 `30/45/45`。
  - 测试证据：`mode-switch-prompt-lifecycle` `3 passed`；`mode-switch-pip-close` `4 passed`。
  - 约束：涉及 mode transition timing / prompt behavior / UX 参数的改动，必须先文档审批/同步，再实现；禁止代码与文档分叉。

## V1-minimal mode-transition regression（must-run）
- `node tests/unit/interceptor-mode-transition-v0.test.js`
- `node tests/unit/reminder-transition-v0.test.js`
- `node tests/unit/content-rest-composite-pending-banner.test.js`
- `npx playwright test tests/e2e/mode-switch-prompt-lifecycle.test.js --reporter=line`
- `npx playwright test tests/e2e/mode-switch-pip-close.test.js --reporter=line`

## 维护约定
- 每个任务必须标注阶段（V0/V1）
- 每次只推进单主题小包
- 完成后同步更新本板与 DECISIONS
- 当前正式发布目标为 `V1-minimal release candidate`；V0 证据仅作为 baseline 保留，不作为 formal release 口径
