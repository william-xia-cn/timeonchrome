# Technical Design: 任务管理 V1

## Metadata

- Spec ID: `SPEC-002-TD`
- Date: 2026-08-05
- Owner: Product&Project Mg
- Status: Approved
- Product spec: `docs/specs/SPEC-002-TASK-MANAGEMENT.md`
- Target branch: `codex/task-management-v1`
- Implementation status: P1-P9 的旧集成实现正在按 D-058 重构为可整体拔除的独立模块；生产 D1 migration、Worker/Pages 部署、扩展版本升级和 rollout 仍明确不在本轮范围内

## 1. Goal

定义任务管理 V1 的技术边界，使一次性强制任务作为独立模块运行：任务只在访问决策前置层决定当前内容是否可访问，不写入、不切分、不重定义既有前台用量 segment。

本设计必须保证：

- 没有任务时，当前分类、配额、计时、时间段、同步和统计行为完全不变；
- 任务只改变当前允许访问的内容范围，不改变网站性质、统计性质、配额来源或时间段判断；
- 任务运行时不得向 `usage_segments_v1`、`session_v1` 或统计上传 payload 写入任务字段；
- 第一版任务进度只使用任务模块自己的 read model / 云端确认投影；自动进度账本若需要精确跨设备合并，必须作为后续独立 Task ledger 设计，不能复用核心 usage segment；
- 离线设备可以保守执行任务，但不能因本地猜测而提前完成；
- 旧客户端不能理解任务时，不允许家长为该档案创建任务。

## 2. Implementation Gate

本文件已由 Product Owner 批准为 Approved，授权在隔离分支 `codex/task-management-v1` 上按实现包开发。进入实现前必须：

1. Product Owner 批准产品规格和本技术设计；
2. 在 `DECISIONS.md` 使用下一个可用编号记录稳定产品决策；
3. 由 Product Owner 选择并整理当前工作区已有改动；
4. 确认 `git status` 干净；
5. 执行 `git fetch origin`，确认本地 `master` 与最新远端基线一致；
6. 创建并使用 `codex/task-management-v1`；
7. 任务相关代码、migration 和测试只进入该分支，不与其他功能提交混合。

## 3. Architecture

任务管理采用“云端定义、设备缓存、独立前置模块、独立进度账本和独立 UI”的结构：

```text
Pages Task Management
        |
        v
Worker task API -----> tasks_v1 / task_events_v1
        |
        v
Device task pull/cache
        |
        v
Optional module host -----> Task beforeAccess precheck -----> unchanged mode-service
        |
        +---- independent Task required/status/admin pages

Core usage/session ledger remains task-unaware
Removing the single static install import makes the entire Task module optional
```

责任边界：

- Pages：家长创建任务和执行生命周期动作，不计算可信进度；
- Worker：保存任务定义、校验 revision、处理家长生命周期动作，并返回设备任务 read model；
- Extension：宿主只提供通用 optional-module host；`background.js` 中唯一一行静态 side-effect import 是 Task 总开关。Chrome MV3 module Service Worker 禁止运行期 `import()`，因此关闭模块时必须同时移除该安装行与 Task 目录。Task 插件负责拉取、资源解析、访问前置判断、独立进度账本、消息和页面；`mode-service`、核心计时与原云同步不得包含 Task 语义；
- `usage_segments_v1`：继续只记录网页使用事实，不携带任务 ID、任务 revision 或任务归属；
- `tasks_v1.completed_seconds`：由 Task 自有 progress segment 投影，不能从核心 usage segment 隐式推导；
- `task_events_v1`：生命周期与人工/外部动作的审计事实。

## 4. Data Model

### 4.1 `tasks_v1`

建议字段组如下，最终 SQL 类型在 migration 实现包中确定：

| 字段 | 含义 |
|---|---|
| `id` | 稳定任务 ID |
| `profile_id` | 所属孩子档案 |
| `name` | 任务名称；参与稳定进度归属排序 |
| `normalized_name` | 用于确定性排序的规范化名称 |
| `planned_start_at` | 计划开始时间，使用 UTC 持久化 |
| `display_timezone` | 创建与展示时区，不作为截止规则 |
| `required_seconds` | 要求有效使用时长，范围 60–86400 |
| `resource_spec_json` | canonical 允许资源定义 |
| `lifecycle_status` | `open / paused / completed / cancelled` |
| `revision` | 乐观并发版本 |
| `completed_seconds` | 云端确认进度物化投影 |
| `completion_source` | `usage / parent / external` 或 null |
| `completed_at` | 完成时间或 null |
| `cancelled_at` | 取消时间或 null |
| `created_by_account_id` | 创建操作者 |
| `created_at / updated_at` | 审计时间 |

约束：

- `required_seconds` 必须在 60 至 86400 之间；
- `completed_seconds` 必须在 0 至 `required_seconds` 之间；
- `completed` 和 `cancelled` 为终态，不允许删除或恢复为 `open`；
- `open` 任务到达开始时间或产生进度后，核心字段冻结；
- 任务核心字段修改必须提供 `expectedRevision`，成功后 revision 单调递增。

### 4.2 Canonical Resource Spec

```js
{
  hosts: ['example.com'],
  urlRules: [
    { url: 'https://example.com/path', match: 'exact' },
    { url: 'https://example.com/course', match: 'path_prefix' }
  ],
  specialTargets: [
    { platform: 'youtube', type: 'video', canonicalTarget: 'https://www.youtube.com/watch?v=...' }
  ]
}
```

规范化规则：

- 第一版不提供 `policyTypes` 或任何访问管理分类引用；任务资源不能保存 `study`、`composite`、`restricted`、`blocked` 这类类型范围；
- `hosts` 使用 Task 自己的 canonical host / 主站 identity 规则，并覆盖该 host 自身与全部子域；
- `urlRules` 仅接受 `exact` 和 `path_prefix`；`exact` 保留业务 query，`path_prefix` 忽略 query 并按路径段边界匹配；
- URL canonicalization 统一 HTTPS、host 大小写、hash、尾斜杠、query 顺序和常见 tracking 参数；旧 `urls: string[]` 只作为 `exact` 兼容输入，canonical 输出不再包含 `urls`；
- `specialTargets` 表示任务资源对象，使用 canonical target，不引用访问管理“特殊网站”配置状态；
- YouTube 资源对象从 URL 自动识别；对象类型和 URL 不一致、首页或搜索页必须返回明确校验错误；
- 重复项在写入前去重并稳定排序；
- 当前配置中命中黑名单的对象必须拒绝创建或修改；黑名单阻断仍由后续基础安全流程兜底。

任务保存的是明确资源集合。运行时仍使用当前网站分类和特殊规则判断原始性质；任务资源不能重写分类，也不能从访问管理分类动态继承站点清单。

### 4.3 `task_events_v1`

用于审计创建、编辑和生命周期动作：

| 字段 | 含义 |
|---|---|
| `id` | 事件 ID / 幂等 ID |
| `task_id / profile_id` | 归属 |
| `event_type` | `created / edited / paused / resumed / completed / cancelled` |
| `task_revision` | 事件完成后的任务 revision |
| `source_type` | `parent / device / external / system` |
| `source_id` | 脱敏后的操作者、设备或外部来源标识 |
| `payload_json` | 最小必要变化摘要，不复制敏感配置 |
| `occurred_at / created_at` | 事实时间和写入时间 |

人工提前完成必须写入 `completed` 事件，并把 `completion_source` 设为 `parent`。未来外部事件必须提供幂等 ID，重复事件不能重复改变 revision 或进度。

### 4.4 核心用量账本边界

任务管理 V1 不扩展 `usage_segments_v1`。核心用量 segment、session snapshot、stats upload payload 均保持任务无感：

- 不新增 `matchedTaskIdsAtTime`、`progressTaskIdAtTime`、`taskRevisionAtTime` 等字段；
- 不为了任务开始、任务预计完成或任务资源切换主动切分核心 segment；
- 不把任务进度归属作为核心落账字段；
- 不让 Worker 的 stats ingest 依赖任务字段更新任务进度；
- 任务 read model 可以只读查看既有统计数据作为参考，但统计账本不是任务流程的写入面。

Task V1 使用独立 `task_progress_segments_v1` 记录有效任务使用区间，由任务模块自己拥有幂等键、时间区间、revision 和同步规则。不得把任务字段塞回核心 usage segment。
本地账本采用有界 pending 队列：只保留尚未被 Worker 接受的 segment，成功上传后立即删除；模块启动时清理旧实现遗留的 `uploadedAt` 项。pending 最多 4096 条，每次最多上传 500 条。超限时记录 Task 自有 dropped 诊断并丢弃最旧 pending；这只会保守地延后任务完成，不得导致提前完成，也不得写入核心统计。

## 5. State Model

持久状态：

- `open`：任务可处于计划中或强制执行中；
- `paused`：停止进度并退出当前资源并集；
- `completed`：要求时长满足或收到授权完成事实；
- `cancelled`：由家长或授权来源终止。

派生状态：

```text
open + now < plannedStartAt  => scheduled
open + now >= plannedStartAt => enforcing
```

合法转换：

```text
open <-> paused
open  -> completed
paused -> completed
open  -> cancelled
paused -> cancelled
```

补充约束：

- `completed` 和 `cancelled` 不再转出；
- 暂停不改变计划开始时间、要求时长或已完成时长；
- 恢复后若计划开始时间已到，立即回到强制集合；
- 家长人工完成可以从 `open` 或 `paused` 进入 `completed`；
- 自动完成在第一版不由核心用量 segment 触发；未来如需自动完成，必须由独立任务进度账本或授权外部事件触发；
- 当前时间不是生命周期写事件，`scheduled/enforcing` 不写入数据库。

## 6. Runtime Policy

### 6.1 Evaluation Order

运行顺序固定为：

`网站事实解析 → 生效任务内容约束 → 黑名单/安全最终阻断 → 配额 → 日历例程/旧时间段 → 基础场景`

任务策略层输出：

```js
{
  enforcingTaskIds,
  matchedTaskIds,
  progressTaskId,
  allowedByTask,
  reason
}
```

行为：

- 没有生效任务：返回 no-op，后续逻辑完全按现状执行；
- 有生效任务且当前对象不属于资源并集：阻断并进入 `task_required`；
- 命中任务资源：Task 返回 no-op 允许宿主继续，原访问管理流程完整执行，不绕过时间段；
- Task 前置于黑名单/安全的返回判断：若当前页面不是任务资源，优先进入 `task_required`；若当前页面是任务资源，则继续走黑名单/安全、配额和后续规则；
- 网站分类、统计分类和配额 bucket 继续使用原始网站性质。

### 6.2 Active Task Context

生效任务集合为：

- `lifecycleStatus === open`；
- `plannedStartAt <= now`；
- 未被完成或取消；
- profile 与当前受管设备一致。

资源并集由所有生效任务的 canonical 资源去重组成。当前页面命中多个任务时，访问资源按并集生效。Task 自有进度归属按计划开始时间、规范化任务名称、任务 ID 稳定排序，每个自然秒只累计到一个任务；该归属不进入核心落账链路。

### 6.3 Task Progress Boundary

第一版由 Task 模块自己的 `task_progress_state_v1` 与 `task_progress_segments_v1` 累计有效使用时间。Task 只读取当前页面、窗口前台状态和 idle 状态，不修改核心 `session_v1`、`usage_segments_v1`、stats 的打开、关闭、字段或上传结构。

自动化 smoke 可对 `debugOnly` 本地任务发送受限的活跃 checkpoint，用于在没有真实键鼠输入的测试环境验证独立账本；该调试消息不得作用于云端正式任务。

## 7. Multi-device Progress

### 7.1 Source Of Truth

Task progress segment 是任务进度的唯一时间事实；`tasks_v1.completed_seconds` 是可重建的物化投影。Worker 仅通过独立 Task device API 接收 segment，并按时间区间并集合并多设备重叠，同一自然秒最多累计一次。

核心 `usage_segments_v1` 不携带 Task 字段，也不参与任务进度投影。

### 7.3 Offline Conservative Model

设备本地有效进度为：

```text
lastCloudConfirmedSeconds + independentTaskProgressPendingIntervals
```

设备不得猜测其他设备尚未同步的进度。该模型可能造成暂时多限制，但不能提前完成。重新联网后，Worker 返回新的云端确认进度和任务 revision，设备据此校准并重评估。

## 8. API Design

Task API 使用独立命名空间，不挂接访问管理配置或核心网页统计接口。

### 8.1 Parent APIs

- `GET /profiles/:profileId/task-runtime/v1/tasks`
  - 返回 open/paused 和可折叠历史、Task 自有进度投影及 Task 设备 capability 摘要。
- `POST /profiles/:profileId/task-runtime/v1/tasks`
  - 创建一次性任务；校验明确资源集合、时长和 capability gate。
- `PATCH /profiles/:profileId/task-runtime/v1/tasks/:taskId`
  - 只允许任务未开始且无进度时修改核心字段；要求 `expectedRevision`。
- `POST /profiles/:profileId/task-runtime/v1/tasks/:taskId/actions`
  - action 为 `pause / resume / complete / cancel`；要求 `expectedRevision` 和幂等 action ID。

所有写接口要求 profile 所有权校验。revision 不匹配返回明确 conflict，不执行隐式覆盖。

### 8.2 Device APIs

- `GET /device/task-runtime/v1/tasks`
  - 使用 device token 获取所属 profile 的任务定义、revision、云端确认进度和服务器时间。
- `POST /device/task-runtime/v1/progress`
  - 只上传 Task 自有 progress segment；Worker 以幂等 segment 和时间区间并集更新进度。
- `POST /device/task-runtime/v1/heartbeat`
  - 独立报告 Task capability、任务版本和当前生效任务摘要；不得扩展核心 cloud heartbeat payload。

任务定义不写入 `profiles.config`，终端也不得通过访问管理配置写回接口修改任务。

## 9. Extension Integration

扩展端 Task 实现全部位于 `extension/modules/task/`，内部拥有：

- task schema/normalization：纯函数解析任务与明确资源；
- task policy：计算生效任务、资源并集和进度归属；
- task cache/service：独立拉取、缓存、revision 和 alarm；
- task progress ledger：独立记录与上传 Task 有效使用区间；
- task message namespace：独立读模型、调试消息和错误码；
- 独立 UI：Task 状态/调试页与 `task_required` 页面。

宿主只提供 `extension/runtime/optional-module-host.js` 的通用注册、访问前置 hook、消息转发、生命周期通知和入口描述。`mode-service`、`cloud-sync`、`message-router`、Popup、Admin、Reminder、session、usage segment 不得出现 Task 专属逻辑。

Chrome MV3 module Service Worker 禁止运行期 `import()`。因此 `background.js` 中唯一一行 `import './modules/task/install.js';` 是 Task 总开关；Task 安装文件负责向通用 host 注册并启动模块。关闭 Task 时注释或删除该行，Task 目录即可整体不存在。删除门禁必须同时移除安装行和目录，再验证基础扩展启动及原访问、计时、落账与同步。

同步触发由 Task 插件自行拥有：

- Task 插件安装启动；
- 通用宿主转发设备绑定成功或浏览器唤醒事件；
- Task 自有每分钟 alarm；
- 最近未来任务到点 alarm；
- 家长生命周期动作导致任务 revision 变化后的下一次 Task 拉取。

任务开始、暂停、恢复、完成、取消或任务版本变化只触发通用 active-tab 访问重评估，不触发核心 segment 结算。

## 10. Independent UI

### 10.1 Cloud Task Page

使用独立 `/task/` 页面及独立 JS/CSS：

- 创建任务；
- 展示计划中、强制执行中、已暂停任务；
- 执行暂停、恢复、留痕完成和取消；
- 完成/取消历史默认折叠且不可删除；
- 显示 Task 自有 capability gate 和不支持设备清单。
- 创建表单使用结构化资源编辑器；域名、精确 URL、路径范围和 YouTube 对象逐条显示并逐条校验。

主 `pages/index.html` 只可通过通用 optional-module registry 显示入口，不包含 Task 业务 DOM、状态或处理函数。

### 10.2 Local Task Admin

使用 `extension/modules/task/ui/admin.js` 提供可嵌入面板，挂载到本地 Admin 的 `扩展模块 -> 任务管理` 展开卡中，展示任务定义、生命周期、进度来源、最后同步时间、capability 和 Beta 本地调试配置。主 Popup、访问管理和 Reminder 不展示 Task 状态；原 Admin 只通过通用 optional-module entry 动态挂载 Task 面板，不静态引用 Task 实现。

本地调试表单必须从现有 debug cache 回填全部字段和资源；任务列表按资源类型逐条显示，不允许用单行摘要隐藏 URL、路径范围或特殊对象。

本地调试能力受发布 build profile 控制：源码 Unpacked 加载在缺少 production profile 时默认开放；所有正式 artifact 必须携带 `deployment-profile.json`，并设置 `production: true`、`taskLocalDebugEnabled: false`。生产状态下页面仅保留正式任务只读状态，隐藏整个调试表单；Task 后台同时拒绝调试写入和调试 checkpoint，不能依赖 CSS 隐藏作为安全边界。模块启动时若发现历史 `local_admin_debug` 或 `debugOnly` 任务，只清理调试任务并保留云端正式任务。

### 10.3 Task Required Page

使用 `extension/modules/task/ui/required.html` 独立阻断页：

- 显示当前强制任务名称；
- 显示允许资源摘要；
- 多任务时显示资源并集和任务数量；
- 不提供绕过任务的模式切换；
- 当前页面命中任务资源后继续进入原访问管理流程，后续黑名单、配额和时间段 reason 仍由原页面处理。

## 11. Capability Gate

Task 插件通过独立 `/device/task-runtime/v1/heartbeat` 维护 `taskManagementV1` capability，不修改核心 devices heartbeat 字段。Cloud Task 页面创建前读取 Task 模块自己的设备状态：

- 全部支持：允许创建；
- 任一在线设备不支持或 capability 未知：阻止创建，并列出需要更新的设备；
- 已长期离线设备的判定窗口必须作为 Task 模块常量确定；
- 已存在任务不会因为设备短暂掉线自动取消。

部署不依赖全局 feature flag。关闭唯一静态安装行时扩展完全没有 Task 运行时；安装 Task 但没有任务时，插件只保留自己的同步和 no-op 访问结果。
## 12. Rollout And Migration

按以下顺序发布：

1. D1 migration 与 Worker API 上线，Pages 不开放创建；
2. 发布支持任务但默认没有任务的扩展；
3. 确认目标档案所有受管在线设备 capability；
4. 部署 Pages 任务入口；
5. 测试档案创建小规模任务，验证任务阻断、任务资源放行、UI read model 和回滚；
6. Product Owner 确认后才允许生产档案创建任务。

回滚原则：

- Worker/Pages 可关闭创建入口，但保留读取和历史；
- 已创建任务不能因 Pages 回滚而丢失；
- 旧扩展忽略未知 segment 字段；
- migration 不删除现有列或历史 segment；
- 已完成/取消事件不得因回滚被重写。

## 13. Test Design

### 13.1 Pure Functions

- 任务 schema、时长边界和资源规范化；
- 派生 scheduled/enforcing；
- 多任务资源并集；
- 稳定进度归属排序；
- 黑名单拒绝、明确受限/未归类对象允许；
- 无任务返回严格 no-op。

### 13.2 Runtime

- 前台、失焦、idle、锁屏、关闭 Chrome 边界由 Task 自有 progress ledger 验证；
- Task 自有开始 alarm 与当前标签页重评估；
- 非任务资源进入独立 `task_required` 页面；
- 命中任务资源只通过 Task 前置约束，随后仍执行原黑名单、配额和时间段逻辑；
- Task 不切分、不扩展核心 session 或 usage segment；
- 跨日保留和暂停恢复。

### 13.3 Worker And Storage

- Task migration 与现有表边界；
- 权限、revision conflict 和字段冻结；
- action 幂等和审计事件；
- Task API 与 progress segment 幂等；
- 多设备 progress 时间区间按 Task 自有账本合并；
- 人工完成来源留痕；
- completed/cancelled 历史不可删除。

### 13.4 UI And Removal Gate

- capability 不完整时不能创建；
- 独立 Cloud Task 页面生命周期动作；
- 本地 Admin 扩展模块页内的 Task 展开面板与独立阻断页；
- 主 Popup、原 Admin、Reminder 和 Pages 主界面保持 Task-unaware；
- 测试副本移除唯一静态安装行和整个 Task 目录后，基础扩展 Service Worker、Popup、Admin、访问、计时和同步 smoke 通过；
- 无任务时原页面和运行行为不变。
- Unpacked 开发加载显示本地调试区；production staging 隐藏调试区并对调试消息返回 `LOCAL_DEBUG_DISABLED`；从开发构建升级到 production 时清理遗留调试任务但保留正式任务。
- self-hosted production staging 必须包含关闭调试能力的 deployment profile，缺失或启用调试时打包门禁失败。
- Task required 页将每条允许资源渲染为可点击入口；本地扩展模块 Task 展开面板、Task required 和云端 Task 页面采用统一、正式的工作界面视觉，并完成桌面与窄屏截图审核。
## 14. Implementation Packages

批准后按小包实施，每包独立测试和提交：

1. Task extension module：领域模型、资源解析、cache、同步、alarm、访问前置判断和独立 progress ledger；
2. Optional module host：通用注册、消息/lifecycle 转发、页面入口和唯一静态安装开关；
3. Host cleanup：撤销 mode-service、cloud-sync、message-router、Popup、Admin、Reminder、session、usage segment 的 Task 专属代码；
4. Task Worker module：独立 router、repository、validation、Task 表和 device state；
5. Independent UI：Cloud `/task/`、本地 Task Admin、Task required 页面与 Beta 本地调试；
6. Removal and regression gates：模块拔除 smoke、Task 专项、基础访问/计时/同步回归和独立 UI 目视验证。

任何实现包若需要改变本规格的产品规则，必须停止并回到 Product Owner 审批，不得在 Build&Test 阶段自行调整。
## 15. Out Of Scope

- 周期任务；
- 固定截止时间；
- 孩子暂停、完成或取消任务；
- 任务删除；
- 手工填写进度；
- 外部学习系统接入和认证；
- 日历例程实现；
- 系统通知；
- 修改网站永久分类或配额规则；
- 迁移或重算既有非任务 usage segment。
