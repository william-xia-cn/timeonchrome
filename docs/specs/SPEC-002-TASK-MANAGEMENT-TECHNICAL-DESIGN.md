# Technical Design: 任务管理 V1

## Metadata

- Spec ID: `SPEC-002-TD`
- Date: 2026-08-05
- Owner: Product&Project Mg
- Status: Approved
- Product spec: `docs/specs/SPEC-002-TASK-MANAGEMENT.md`
- Target branch: `codex/task-management-v1`
- Implementation status: Not implemented

## 1. Goal

定义任务管理 V1 的技术边界，使一次性强制任务可以独立于 `profiles.config` 和旧时间段配置运行，并复用现有前台用量 segment 作为进度事实。

本设计必须保证：

- 没有任务时，当前分类、配额、计时、时间段、同步和统计行为完全不变；
- 任务只改变当前允许访问的内容范围，不改变网站性质、统计性质或配额来源；
- 任务进度可从幂等接受的用量 segment 重建；
- 多设备并行使用时，同一任务的重叠自然时间只累计一次；
- 离线设备可以保守执行任务，但不能因缺少其他设备数据而提前完成；
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

任务管理采用“云端定义、设备执行、segment 证明、Worker 汇总”的结构：

```text
Pages Task Management
        |
        v
Worker task API -----> tasks_v1 / task_events_v1
        |                         ^
        v                         |
Device task pull                  | accepted usage segments
        |                         |
        v                         |
Runtime task policy ------> usage_segments_v1
        |
        +---- task_required reminder / popup / admin read model
```

责任边界：

- Pages：家长创建任务和执行生命周期动作，不计算可信进度；
- Worker：保存任务定义、校验 revision、接受 segment、合并跨设备区间并更新进度投影；
- Extension：拉取任务、计算当前任务上下文、实施访问约束、在现有前台 segment 中写入任务快照；
- `usage_segments_v1`：任务有效使用时间的唯一事实；
- `tasks_v1.completed_seconds`：可由 segment 重建的物化投影，不是不可替代账本；
- `task_events_v1`：生命周期与人工/外部动作的审计事实，不代替用量 segment。

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
  policyTypes: ['study', 'composite'],
  hosts: ['example.com'],
  urls: ['https://example.com/path'],
  specialTargets: [
    { platform: 'youtube', type: 'video', canonicalTarget: 'https://www.youtube.com/watch?v=...' }
  ]
}
```

规范化规则：

- `policyTypes` 只接受 `study` 和 `composite`；
- `hosts` 使用现有 canonical host / 主站 identity 规则；
- `urls` 使用现有 URL target normalization，不保存无关 tracking query；
- `specialTargets` 复用特殊网站 canonical target 模型；
- 重复项在写入前去重并稳定排序；
- 当前配置中命中黑名单的对象必须拒绝创建或修改；
- 受限娱乐和未归类对象只能通过明确 host、URL 或特殊对象加入，不能以类型整体放行。

任务保存的是明确资源意图。运行时仍使用当前网站分类和特殊规则判断原始性质；任务资源不能重写分类。

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

### 4.4 `usage_segments_v1` 扩展

新增可选快照字段：

- `matchedTaskIdsAtTime`：segment 时间内当前页面命中的生效任务 ID 列表；
- `progressTaskIdAtTime`：该 segment 实际归属进度的唯一任务 ID；
- `taskRevisionAtTime`：进度任务在决策时的 revision。

规则：

- 只保存 ID 和 revision，不复制任务名称、资源配置或完整任务对象；
- 没有任务时字段为空或缺失，保持旧客户端和旧 segment 兼容；
- segment 的现有网站分类、模式、配额来源字段继续按原语义写入；
- `progressTaskIdAtTime` 必须属于 `matchedTaskIdsAtTime`；
- 任务完成边界必须切分 segment，避免超过剩余时长的区间计入该任务。

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
- 自动完成只能由接受后的用量 segment 投影触发；
- 当前时间不是生命周期写事件，`scheduled/enforcing` 不写入数据库。

## 6. Runtime Policy

### 6.1 Evaluation Order

运行顺序固定为：

`网站分类与安全解析 → 黑名单 → 生效任务 → 配额 → 日历例程/旧时间段 → 基础场景`

任务策略层输出：

```js
{
  enforcingTaskIds,
  matchedTaskIds,
  progressTaskId,
  allowedByTask,
  bypassLegacyTimeWindows,
  reason
}
```

行为：

- 没有生效任务：返回 no-op，后续逻辑完全按现状执行；
- 有生效任务且当前对象不属于资源并集：阻断并进入 `task_required`；
- 命中任务资源：`bypassLegacyTimeWindows = true`，但继续执行配额检查；
- 黑名单或安全限制已阻断时，不进入任务放行判断；
- 网站分类、统计分类和配额 bucket 继续使用原始网站性质。

### 6.2 Active Task Context

生效任务集合为：

- `lifecycleStatus === open`；
- `plannedStartAt <= now`；
- 未被完成或取消；
- profile 与当前受管设备一致。

资源并集由所有生效任务的 canonical 资源去重组成。当前页面命中多个任务时，进度归属按以下稳定键升序选择：

```text
plannedStartAt ASC
normalizedName ASC
taskId ASC
```

任务名称规范化使用 Unicode normalization、trim 和大小写无关比较；具体 locale-independent 实现需在单元测试中锁定。同一自然秒只允许一个 `progressTaskId`。

### 6.3 Progress Eligibility

只有以下条件同时成立才打开或继续任务进度 segment：

- Chrome 为前台应用；
- 系统不是 idle 或 locked；
- 当前活动标签页可计时；
- 页面命中至少一个生效任务资源；
- 被选中的进度任务仍为 `open` 且未暂停；
- 当前网站通过黑名单、安全和配额检查。

Chrome 关闭、失焦、idle、锁屏、切换到非任务页面、任务暂停或配额阻断时，立即结算当前 segment。

### 6.4 Exact Completion Boundary

本地计算 `remainingSeconds` 后，当前连续 segment 的最大开放时长不得超过剩余时长。达到边界时：

1. 在精确边界结算 segment；
2. 把 segment 放入现有上传队列；
3. 本地将该任务视为“待云端确认完成”，不再继续给它累计；
4. 从其他匹配任务中重新选择进度归属；
5. 触发任务同步和当前标签页重评估；
6. 云端确认后更新正式完成状态和投影。

如果没有其他生效任务，访问控制恢复日历例程/旧时间段或基础场景。若云端因跨设备校准认定尚未完成，设备在下次拉取后恢复剩余限制。

## 7. Multi-device Progress

### 7.1 Source Of Truth

`usage_segments_v1` 是有效任务时间的唯一事实。Worker 只对通过现有幂等键接受的新 segment 更新任务投影；重复上传不能增加进度。

### 7.2 Interval Union

对于同一 `profile_id + task_id`：

- 读取归属该任务的已接受 segment 时间区间；
- 对跨设备重叠区间求并集；
- 并集总时长截断到 `required_seconds`；
- 计算结果写入 `tasks_v1.completed_seconds`；
- 首次达到要求时写入自动完成事件。

实现可以维护增量合并结构，但必须可通过原始 segment 重建并验证。不得把各设备累计秒数直接相加。

### 7.3 Offline Conservative Model

设备本地有效进度为：

```text
lastCloudConfirmedSeconds + currentDeviceUnuploadedUniqueIntervals
```

设备不得猜测其他设备尚未同步的进度。该模型可能造成暂时多限制，但不能提前完成。重新联网后，Worker 返回新的云端确认进度和任务 revision，设备据此校准并重评估。

## 8. API Design

路径命名可在实现前做一致性审查，但接口职责固定。

### 8.1 Parent APIs

- `GET /profiles/:profileId/tasks/v1`
  - 返回 open/paused 和可折叠历史、进度投影、设备 capability 摘要。
- `POST /profiles/:profileId/tasks/v1`
  - 创建一次性任务；校验资源、时长和 capability gate。
- `PATCH /profiles/:profileId/tasks/:taskId/v1`
  - 只允许任务未开始且无进度时修改核心字段；要求 `expectedRevision`。
- `POST /profiles/:profileId/tasks/:taskId/actions/v1`
  - action 为 `pause / resume / complete / cancel`；要求 `expectedRevision` 和幂等 action ID。

所有写接口要求 profile 所有权校验。revision 不匹配返回明确 conflict，不执行隐式覆盖。

### 8.2 Device APIs

- `GET /device/tasks/v1`
  - 使用 device token 获取所属 profile 的任务定义、revision、云端确认进度和服务器时间。
- 任务进度继续随现有 usage segment 上传接口提交；不增加第二套“秒数上传”协议。
- Heartbeat 增加：
  - `capabilities.taskManagementV1 = true`；
  - 最近任务版本；
  - 当前生效任务 ID 摘要；
  - 本地待上传任务区间摘要，不上传敏感资源详情。

任务定义不写入 `profiles.config`，终端也不得通过配置写回接口修改任务。

## 9. Extension Integration

建议新增独立模块，具体文件名在实现包确认：

- task schema/normalization：纯函数解析任务与资源；
- task policy：计算生效任务、资源并集和进度归属；
- task cache/service：拉取、缓存、revision 和 alarm；
- runtime integration：在现有访问决策和 session 结算链路接入任务上下文；
- message read models：为 Popup/Admin/Reminder 提供只读摘要。

同步触发：

- Service Worker 启动；
- 设备绑定成功；
- 浏览器唤醒；
- 每分钟定时拉取；
- 最近未来任务到点 alarm；
- 本地达到完成边界；
- 家长生命周期动作导致任务 revision 变化后的下一次同步。

任务开始、暂停、恢复、完成、取消或任务版本变化都必须结算当前 segment，并重新评估当前标签页。

## 10. UI Read Models

### 10.1 Pages

新增一级入口“任务管理”：

- 创建任务；
- 展示计划中、强制执行中、已暂停任务；
- 执行暂停、恢复、留痕完成和取消；
- 完成/取消历史默认折叠且不可删除；
- 显示 capability gate 和不支持设备清单；
- 只有所有受管在线设备都报告 `taskManagementV1` 时启用创建。

### 10.2 Popup

展示：

- 全部当前强制任务；
- 当前页面命中的任务；
- 当前进度归属任务；
- 每个任务已确认/本机待上传/剩余时长摘要；
- 最近一个未来任务。

孩子不能暂停、完成、取消或修改任务。

### 10.3 Local Admin

只读展示任务定义、生命周期、进度来源、最后同步时间、capability 和诊断状态。不提供创建或生命周期操作。

### 10.4 Reminder

新增 `task_required` 场景：

- 显示当前强制任务名称；
- 显示允许资源摘要；
- 多任务时显示资源并集和任务数量；
- 不提供绕过任务的模式切换；
- 配额阻断仍使用现有配额 reason，不伪装为任务阻断。

## 11. Capability Gate

设备 heartbeat 维护最近在线时间和 `taskManagementV1` capability。Pages 创建前检查当前档案所有受管在线设备：

- 全部支持：允许创建；
- 任一在线设备不支持或 capability 未知：阻止创建，并列出需要更新的设备；
- 已长期离线设备的判定窗口必须在实现前作为可配置常量确定，不能在 UI 中临时猜测；
- 已存在任务不会因为设备短暂掉线自动取消。

部署不依赖全局 feature flag。没有任务时新扩展路径是 no-op；创建入口由 capability gate 控制。

## 12. Rollout And Migration

按以下顺序发布：

1. D1 migration 与 Worker API 上线，Pages 不开放创建；
2. 发布支持任务但默认没有任务的扩展；
3. 确认目标档案所有受管在线设备 capability；
4. 部署 Pages 任务入口；
5. 测试档案创建小规模任务，验证 segment、跨设备投影和恢复；
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

- 前台、失焦、idle、锁屏、关闭 Chrome 边界；
- 任务开始 alarm 与当前标签页重评估；
- 命中资源覆盖旧时间段但仍受配额约束；
- `task_required` 阻断；
- 精确完成边界切片；
- 完成后转下一个匹配任务；
- 跨日保留和暂停恢复。

### 13.3 Worker And Storage

- migration 前后兼容；
- 权限、revision conflict 和字段冻结；
- action 幂等和审计事件；
- segment 重试幂等；
- 多设备重叠区间并集；
- 投影重建一致性；
- 人工完成来源留痕；
- completed/cancelled 历史不可删除。

### 13.4 UI And E2E

- capability 不完整时不能创建；
- Pages 生命周期动作；
- Popup 当前任务和最近未来任务；
- Admin 只读；
- Reminder 资源摘要；
- 无任务时现有页面和运行行为不变。

## 14. Implementation Packages

批准后按小包实施，每包独立测试和提交：

1. D1 migration、task repository 和状态机纯函数；
2. Parent/device read APIs、revision/action API 和 capability；
3. Extension task cache、pull、alarm 和纯策略层；
4. Runtime session/segment 快照、精确边界和重评估；
5. Worker segment 投影与多设备区间并集；
6. Reminder、Popup、Admin read model；
7. Pages 任务管理和 capability gate；
8. 集成/E2E、回滚验证和分阶段部署证据。

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