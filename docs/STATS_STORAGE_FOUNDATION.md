# Stats Storage Foundation（V1 用量统计存储基础架构）

版本：V1 Draft（Revised — `usage_segments_v1` core）
状态：计时落账与 stats storage 的主设计文档
关联：`docs/DESIGN.md` 只保留架构索引
日期：2026-05-06（Revised 2026-05-20）

> **Authoritative source**：计时落账、session close/open、checkpoint、recovery、`usage_segments_v1` 本地/云端 schema 差异，以本文档为准。其他文档不再重复维护这些细节，只链接到本文档。

---

## 1. Problem Statement

### 1.1 当前问题

当前的用量统计存储和同步架构存在以下不稳定因素：

1. **`event_log_v1` 是短保留期的原始事件数据**
   - `core/event-log.js` 每小时压缩一次，删除超过 24 小时的旧事件
   - `MAX_RAW_WINDOW = 24 * 60 * 60 * 1000`
   - `event_log_v1` 的设计目标是恢复追踪和调试，不是持久统计存储

2. **没有持久的已完成逐段记录**
   - 目前系统仅存储 `event_log_v1`（24 小时保留）和旧的 stats 聚合数据
   - 没有已完成时长的逐段记录层，没有逐段 ID，没有逐段 event_log
   - 在 event-log 压缩后，无法回答"这个域名在 10:15-10:25 之间产生了多少 ACTIVE 时长"

3. **`getStatsRange(7)` 从 event-log 重新聚合是不稳定的**
   - `infra/storage.js:407-426` 每次调用都从 `event_log_v1` 聚合
   - 由于 event-log 的 24 小时保留窗口，超过 24 小时的事件已被删除
   - 结果：`getStatsRange(N)` 对 N>1 可能返回**部分/空数据**

4. **`uploadStats()` 可能产生不完整的每日快照**
   - `infra/cloud-sync.js:384-386` 过滤掉 `backgroundMediaByDomain` 等字段
   - 由于 event-log 压缩，有效载荷可能缺少较早的域名
   - `pendingStats[date]` 总是被覆盖，而不是合并

5. **Worker 的 date-level DELETE + INSERT 会丢失域名**
   - `workers/src/routes/stats.ts:43-46` 先删除整个日期的数据，再重新插入
   - 如果后续有效载荷不包含某个域名，这些域名将被永久删除
   - 当前 P.xia 数据的缺失证明了这种丢失模式

### 1.2 这不是 Bilibili 专属问题

问题的根源是 **stats 存储/同步结构不稳定**，而不是特定于 Bilibili 的规则。
任何域名如果在事件日志被压缩后才同步到云端，都可能出现数据丢失。Bilibili 只是一个被发现的例子。

---

## 2. Core Principles

### 2.1 三层边界

| 层 | 内容 | 存储位置 | 可变性 |
|---|------|---------|--------|
| **计时落账与账务统计层** | 已结算事实和内生物化索引：`usage_segments_v1` / `daily_usage_stats_v1` / `hourly_usage_stats_v1`，以及独立 media ledger / `daily_media_stats_v1` / `hourly_media_stats_v1` | Chrome local storage + sync outbox | 事实 append-only；物化索引可从账本重建 |
| **管理统计口径层** | 读取账本并输出 domain/mode/media/settlement/reconciliation/quota usage 等管理视图 | `extension/stats/managed-statistics.js` | 读取时动态计算；随产品口径变更 |
| **消费层** | Popup/Admin 展示、配额管理、云端/Pages 查询消费统计视图 | `message-router.js`、`product/quota.js`、UI、cloud sync/Pages | 不定义事实，不自行解释 raw stats |

> 引用自 `docs/DESIGN.md` §1.3.7.1

`daily_usage_stats_v1` / `hourly_usage_stats_v1` 和 `daily_media_stats_v1` / `hourly_media_stats_v1` 不属于独立业务统计模块；它们是账本内生的物化索引，和 segment 写入天然耦合。业务含义（学习/综合/休息、在线、配额口径、settlement analysis 展示 shape）统一进入管理统计口径层。

配额链路按当前实现分层：`extension/stats/managed-statistics.js` 提供 `getQuotaUsageView()`；`product/quota.js` 包含 quota calculator 与 quota state updater，负责从 usage view 计算并保存 `quotaState` / `lockedDomains`；`message-router` 的 `EVALUATE_QUOTA_STATE` 是本地 quota lifecycle 编排入口；`product/mode-service.js` 产出模式迁移 decision；`product/mode-effects.js` 执行 Reminder / notice / redirect 等 Chrome UI effects。

### 2.2 `usage_segments_v1` 是核心持久事实账本（Core Durable Fact Ledger）

- `usage_segments_v1` 是已完成持续时间的**唯一持久事实源**
- 记录每次使用会话的完整持续时间，并按自然日边界分割
- 每个 segment 是不可变的：一旦写入，永远不修改
- `daily_usage_stats_v1` 与 `hourly_usage_stats_v1` 是从 segments 构建的**物化聚合**，不应独立写入
- 云同步先上传 segments，然后可以从云端 segments 派生/对账聚合数据

### 2.3 这些存储禁止包含的内容

- 网站分类标签（study site / composite site / restricted / blocked）
- 策略决策（allowed / blocked / borrow / temporary composite）
- 解释性报表时间类型（学习时间 / 休息时间 / 待定时间）
- AI 分类结果或内容级判断

### 2.4 `event_log_v1` 不是持久统计存储

- `event_log_v1` 是短期恢复/调试追踪（24 小时保留）
- 它既不是持久的逐段记录，也不是每日聚合存储
- 统计数据必须持久化到 `usage_segments_v1`，并同步维护 `daily_usage_stats_v1` / `hourly_usage_stats_v1` 物化索引

---

## 3. Target Terminal Storage Model

终端扩展使用以下存储键：

| 存储 | 键 | 用途 | 保留 | 可变性 |
|------|---|------|------|--------|
| `session_v1` | `session_v1` | 当前状态（state、domain、startTime、lastHeartbeat）| 仅当前 | 可变；`lastHeartbeat` 仅兼容保留，不作为新增计时事实 |
| `event_log_v1` | `event_log_v1` | 短期恢复/调试追踪（START/END 事件）| 24 小时 | Append-only，压缩时删除旧数据 |
| **`usage_segments_v1`** | **`usage_segments_v1`** | **持久化已结算逐段账本（核心事实源）** | **365 天** | **Append-only，永远不删除** |
| `daily_usage_stats_v1` | `daily_usage_stats_v1` | 从 segments 构建的物化每日聚合 | **365 天** | 从 segments 重建，可替换 |
| `hourly_usage_stats_v1` | `hourly_usage_stats_v1` | 从 segments 构建的物化小时聚合 | **365 天** | 从 segments 重建，可替换 |
| `segment_sync_outbox_v1` | `segment_sync_outbox_v1` | 逐段上传/重试状态 | 直到上传成功 | 可变，上传成功时清除 |
| `stats_sync_outbox_v1` | `stats_sync_outbox_v1` | 聚合上传/重试状态 | 直到上传成功 | 可变，上传成功时清除 |
| `hourly_stats_sync_outbox_v1` | `hourly_stats_sync_outbox_v1` | 小时 usage 聚合上传/重试状态 | 直到上传成功 | 可变，上传成功时清除 |
| `media_segments_v1` | `media_segments_v1` | 本地媒体逐段账本 | **365 天** | Append-only，永远不删除 |
| `daily_media_stats_v1` | `daily_media_stats_v1` | 从 media segments 构建的物化每日聚合 | **365 天** | 从 media segments 重建，可替换 |
| `hourly_media_stats_v1` | `hourly_media_stats_v1` | 从 media segments 构建的物化小时聚合 | **365 天** | 从 media segments 重建，可替换 |
| `media_segment_sync_outbox_v1` | `media_segment_sync_outbox_v1` | 媒体逐段上传/重试状态 | 直到上传成功 | 可变，上传成功时清除 |
| `media_stats_sync_outbox_v1` | `media_stats_sync_outbox_v1` | 媒体每日聚合上传/重试状态 | 直到上传成功 | 可变，上传成功时清除 |
| `hourly_media_stats_sync_outbox_v1` | `hourly_media_stats_sync_outbox_v1` | 媒体小时聚合上传/重试状态 | 直到上传成功 | 可变，上传成功时清除 |

### 3.1 结算路径（Settlement Path）

```
transitionState / periodicCheckpoint / lifecycle recovery close
         │
         ▼
    已完成的时长段
         │
         ├──→ 创建 usage_segment (usage_segments_v1)
         │      id, startMs, endMs, durationSeconds,
         │      domain, channel, mode, sourceState,
         │      settlementReason, parentSegmentId
         │
         ├──→ 增量更新 daily_usage_stats_v1
         │      activeSeconds += duration
         │      activeByMode[mode] += duration
         │
         ├──→ 增量更新 hourly_usage_stats_v1
         │      按本地小时边界生成聚合 slice
         │      所有 slice 秒数之和等于 segment.durationSeconds
         │
         ├──→ 标记 segment_sync_outbox_v1 脏
         │
         ├──→ 标记 stats_sync_outbox_v1 脏
         │
         ├──→ 标记 hourly_stats_sync_outbox_v1 脏
         │
         └──→ (可选) 追加 event_log_v1 trace
```

#### 3.1.1 Runtime 正常落账触发总览

正常计时落账来自明确的事件边界、用户操作边界或周期确认边界。`session_v1` 只是当前 open segment 的快照；持久事实以 `usage_segments_v1` 为准。

| 触发来源 | 典型入口 | settlementReason | Open / reopen reason | 是否允许结算前台 ACTIVE | 说明 |
|---|---|---|---|---|---|
| 前台状态切换 | tab activated / updated / focus / idle event 直接进入 `transitionStateAt()` | `transition_complete` / `idle_inactive_close` | 原始来源事件，例如 `tabActivated`、`tabUpdated` | 是 | 普通前台网页、特殊页、本地文件、扩展页都按 focused Chrome active tab 计时 |
| Popup 打开 | popup `GET_STATS source=popup` | `popup_open` | `popup_open_reopen` | 是 | 低频用户动作，用作 durable settlement boundary |
| 周期确认 | `periodicCheckpoint` alarm | `periodic_checkpoint` | `periodic_checkpoint_reopen` | 是，但必须主动确认 foreground | 普通运行期间的补充计时落账机制；同时承担采样对账 |
| 模式生效边界 | `mode_boundary` intent → `dispatchTimingSignal()` | `mode_effective_boundary` | `mode_effective_boundary_reopen` | 是 | 系统级补充计时信号；foreground/media 各自按同一 boundary 切分 |
| 标签关闭 | tab close handling | `tab_close` | 后续真实 foreground boundary | 是 | 关闭旧 session，后续由 successor active tab 打开新 session |
| 监控关闭 | monitoring off / cloud sync disables monitoring | `monitoring_off` | 不重开 | 是 | 动作触发补充落账；关闭当前 open session |

`recover()` 不属于正常计时落账触发；它是 extension lifecycle boundary 上的容错补救机制，只在发现残存 open session 时做最小估算关闭。正常运行期间不能依赖 recovery 产生或确认时长。

`description.start/end` 保存原始触发源的 reason/source，例如 `tabUpdated`、`popup_open`、`periodic_checkpoint`。前台边界不做稳定窗口延迟，不改写 reason。recovery 容错写入的 segment 会使用 `recovery_estimated_half_checkpoint` 标明它不是正常计时边界。`settlementReason` 仍表示账务口径；`description` 是本地诊断字段，不参与 segment ID 幂等生成。

Mode 切换不是普通配置写入，而是系统级账务边界。手动与自动 mode 切换必须先把 `mode_boundary` intent 写入本地 `mode_boundary_intents_v1`，然后由 dispatcher 按正常计时信号链路消费；mode 切换入口只等待 intent 可靠入队，不等待 foreground/media 完整落账。intent 消费成功后移除，失败保留并由后续 bootstrap、alarm 或计时事件继续 drain。popup/admin 的读前 `await flush` 暂维持现状，登记为后续 read model 收敛遗留项。

前台 domain 语义收敛为三类，不再把 `candidateDomain` / `candidateKind` 作为计时落账模型的一等概念：
- `eventDomain`：由精确事件当次 URL/tab 解析出的 domain，用于 open 或 transition。
- `observedDomain`：由 `periodicCheckpoint` 主动查询当前 active tab/url 得到的采样 domain，只用于 checkpoint 对账。
- `session.domain`：已经确认开账的账务 domain，是 close 时结算旧 session 的唯一账务归属。

`observedDomain == session.domain` 只适用于 checkpoint 判断“当前采样仍匹配 open session，可以做正常补充落账”。普通 close 事件如果已经明确指向旧 session，不需要再用当前 active tab domain 覆盖或重新判定旧账归属。特殊页/本地文件/扩展页的伪域名规则属于 URL 解析能力，不再归入 candidate 管理机制。

普通前台 open/re-eval 事件必须做账务身份去重：当当前 open session 已经是同一个 `state + domain + tabId/windowId` 时，`tabUpdated`、`webNavigationCommitted`、`tabActivated`、`tabReplaced`、`windowFocusChanged`、`tabClosedSuccessor`、`idle_active_reopen` 这类 URL/focus 事实只更新诊断 trace，不得关闭并重开 session。这样可以保留真实 tab/domain/mode 边界，又避免同一 tab 同一 domain 被 `tabUpdated` 与 `webNavigationCommitted` 互相切碎。同 domain 但 `tabId` 明确不同，仍然是不同前台 tab 边界，必须正常落账。

当前策略优先保证账本完整性：只要 `endMs > startMs`，就写入 `usage_segments_v1`；明确的边界诊断容错允许 `endMs == startMs`。1 秒内切换网页也必须落账，允许 `durationSeconds = 0` 的 segment 保留精确 `startMs/endMs`、domain、mode、sourceState、settlementReason 和 `description`。是否在正式发布前引入短段合并、毫秒级 duration 字段或 UI 展示过滤，是 release blocker，不在当前落账完整性改造中提前处理。

URL 暂缺短段属于上述临时完整性策略的一部分：当 `tabActivated` 先到但 URL 尚不可用时，可以打开 `unknown-page.chrome-local`；后续 `tabUpdated` 带来真实 URL 后，关闭 unknown 段并打开真实 domain。当前不做事后回填、不合并相邻段，短 unknown 段被视为保留原始事件顺序的可接受现象。但该策略不是最终发布形态，正式发布前必须重新评估并决定：继续保留、相邻段合并、真实 URL 到达后回填、仅在 UI 隐藏/折叠，或引入毫秒级/诊断层分离。

边界事实也属于账本完整性的一部分：事件驱动 open 到来但旧 session 尚未关闭时，必须先关闭旧 session 并写入 segment，即使 `endMs == startMs`；事件驱动 close 到来但没有 open session 时，写入 `event_close_without_open` 的 0ms diagnostic segment；事件驱动 close 到来且关闭时观测到的 domain 与 `session.domain` 不一致时，写入旧 `session.domain` 的 `event_close_domain_mismatch_close` segment，并额外写入观测 domain 的 `event_close_domain_mismatch_observed` 0ms diagnostic segment。这三类不是正常主计时，也不是用户动作补充落账，而是诊断容错：用于保留“收到的事件与当前 session 状态不一致”的异常事实。0ms segment 不增加 `activeSeconds/backgroundMediaSeconds/pipSeconds`，但会增加 segment 账本和 diagnostic 可见性。

#### 3.1.2 事件来源完备矩阵

每个事件来源必须被判定为：`主计时`、`补充计时`、`容错`、`诊断容错`、`维护不计时`、`辅助重评估` 或 `未接入可选补强`。未列入主计时/补充计时/容错/诊断容错的来源不得直接写 `usage_segments_v1`。

实现结构要求：Chrome 原始事件可以被多个计时消费者共享，但账本必须分轨。`background.js` 只负责 listener wiring、dispatcher 调用和 alarm 调度；foreground 计时只能写 `session_v1` / `usage_segments_v1` / `daily_usage_stats_v1` / `hourly_usage_stats_v1`，media 计时只能写 `media_frame_facts_v1` / `media_facts_v1` / `media_sessions_v2` / `media_segments_v1` / `daily_media_stats_v1` / `hourly_media_stats_v1`。同一个 `periodicCheckpoint` alarm 可以触发 foreground 与 media 两套 checkpoint，但两套执行必须独立 try/catch、独立 trace，任何一侧失败不得阻断另一侧。

当前代码分层：

| 模块 | 职责 | 不允许做什么 |
|---|---|---|
| `background.js` | 注册 Chrome listeners、调用 `dispatchTimingSignal()`、触发 `runTimingCheckpoints()`、保留 debug/test-only handlers | 不直接执行 foreground transition；不直接写媒体账本 |
| `core/timing-dispatcher.js` | 接收归一化 signal，drain mode boundary intent，先给 media 观察事实，再把非 media-only signal 交给 foreground | 不直接写 usage/media segment；除 mode intent queue 外不写 storage |
| `core/mode-boundary-intents.js` | 持久化并 drain `mode_boundary` intent，保证 mode boundary 不因裸异步调用丢失 | 不直接写 usage/media segment；只负责可靠队列 |
| `core/foreground-timing.js` | 前台网页状态解析、legacy foreground media compensation、调用 `transitionStateAt()` 写 `usage_segments_v1` | 不调用 `applyMediaFacts()` / `closeMediaForTab()`；不写 `media_segments_v1` |
| `core/media-timing.js` | 媒体事实写入、tab 生命周期关闭、已知媒体 tab 重分类、调用 `runtime/media-session.js` | 不调用 `transitionStateAt()`；不写 `usage_segments_v1` |
| `core/checkpoint-scheduler.js` | 将同一个 `periodicCheckpoint` 分别调度到 foreground checkpoint 与 media checkpoint，并分别 trace | 不把一侧失败传播为另一侧失败 |

遗留边界：媒体事实的目标形态是只更新媒体账本，网页账本与媒体账本的综合分析只发生在读取展示层。但当前代码仍保留 legacy `foregroundMediaActive` compensation：foreground timing 在 idle/focus/checkpoint 等关闭旧 open foreground session 的路径，会调用 `queryForegroundMediaForOpenSession(sessionLike, reason)` 只查询旧 session 的 `tabId`，用于决定是否暂缓关闭。该 helper 先使用 Chrome 原生 `tab.audible === true` 作为 positive fast path；未命中时再 fallback 到 `media_facts_v1[session.tabId]`，覆盖静音媒体和漏事件场景。它不得用于 checkpoint estimated open 或新开 foreground 账。该路径已经标记为正式发布前需要处理的 release item；本轮只收敛查询语义，不删除。

| 类型 | 事件 / 来源 | 当前接入状态 | 处理判定 | 开账 | 落账 | 账务 reason / 操作 | 处理方案 |
|---|---|---:|---|---:|---:|---|---|
| Chrome tab | `chrome.tabs.onActivated` | 已接入 | 主计时 + 媒体重分类 | 是 | 是 | `transition_complete`; `description` 使用 `tabActivated` | dispatcher 分轨：foreground 查询 active tab URL 后进入 `foreground-timing`；media 只重分类 old/new 中已有 media fact 或 open media session 的 tab |
| Chrome tab | `chrome.tabs.onUpdated` | 已接入 | 主计时 | 是 | 是 | `transition_complete`; `description` 使用 `tabUpdated` | 处理当前 tab URL/domain 变化；特殊页/本地文件也映射为伪域名计时 |
| Chrome tab | `chrome.tabs.onRemoved` | 已接入 | 主计时偏落账 + 媒体关闭 | 可能 | 是 | `tab_close` / successor reason | foreground 关闭被移除 tab 对应 session；media 关闭该 tab 的已知媒体 session；若存在 successor active tab，后续重评估可开新账 |
| Chrome navigation | `chrome.webNavigation.onCommitted` | 已接入 | 辅助重评估 | 可能 | 可能 | 汇入 transition / redirect check | 不作为独立账务事实源；用于导航提交后的拦截检查和前台状态重评估 |
| Chrome window | `chrome.windows.onFocusChanged` | 已接入 | 主计时 | 是 | 是 | `transition_complete` / inactive close; `description` 使用 `windowFocusChanged` | Chrome 聚焦时按 active tab 开账；Chrome 失焦时关闭 foreground session |
| Chrome window | synthetic focus polling / `windowFocusPolled` | 禁用 | 不计时 | 否 | 否 | 无 | 聚焦轮询不是 Chrome 原始边界事件；不得进入 foreground 开合，漏判由 `periodicCheckpoint` 采样修复 |
| Chrome idle | `chrome.idle.onStateChanged` | 已接入 | 主计时边界提示 | 是 | 是 | `idle_inactive_close` / active reopen reason | 只处理 active/idle/locked 边界；不作为持续确认机制 |
| Runtime message | `MEDIA_STATE` | 已接入 | 主计时（本地媒体账本） + PiP policy | 是 | 是 | media boundary / `periodic_checkpoint` / `pip_forbidden_cleanup` | content script 上报媒体/PiP 状态，经 `timing-dispatcher` → `media-timing` → `runtime/media-session.js` 写本地媒体账本；`isPiP=true` 先记录事实再触发全局退出 PiP；media-only signal 不进入 foreground consumer |
| Runtime message | popup `GET_STATS source=popup` | 已接入 | 补充计时 | 是 | 是 | `popup_open` / `popup_open_reopen` | 用户打开 popup 时关闭当前 counted session 并立即重开，保证 popup 统计可见当前段 |
| Runtime message | `REQUEST_MODE_CHANGE`（legacy alias: `SWITCH_TO_STUDY` / `SWITCH_TO_REST` / `SWITCH_TO_COMPOSITE`） | 已接入 | 补充计时（模式边界） | 是 | 是 | `mode_effective_boundary` / `mode_effective_boundary_reopen` | `product/mode-service.js` 提交 `guardian_session.currentMode/currentModeStartedAtMs`，维护 `restExitGraceUntilMs`，并写入 `mode_boundary_intents_v1` 后返回；dispatcher 后续切 foreground 与所有 open media sessions |
| Runtime message | `FLUSH_TIME` / 非 popup `GET_STATS` / `GET_STATS_RANGE` | 已接入 | 查询/有限补充 | 可能 | 可能 | `ui_flush` | 不允许直接切碎前台 ACTIVE；仅用于非前台或受限路径刷新 |
| Runtime message | `CONTENT_SCRIPT_READY` | 已接入 | 维护不计时 | 否 | 否 | 无 | 只用于 transient notice 重发，不产生计时事实 |
| Runtime message | `TITLE_CHANGE` | 已接入 | 维护不计时 | 否 | 否 | 无 | 页面标题信息，不产生计时事实 |
| Config / sync action | monitoring off / cloud disables monitoring | 已接入 | 补充计时（配置动作） | 否 | 是 | `monitoring_off` | 用户或云端配置动作触发补充落账；关闭当前 open session，不重开 |
| Alarm | `periodicCheckpoint` foreground runner | 已接入 | 补充计时 + 采样对账 | 是 | 是 | `periodic_checkpoint` / `checkpoint_estimated_close` / `checkpoint_estimated_open` | `checkpoint-scheduler` 调用 foreground checkpoint；正常匹配写 checkpoint；open/closed 与当前采样不一致时半 interval 估算修复 |
| Alarm | `periodicCheckpoint` media runner | 已接入 | 补充计时（本地媒体账本） | 是 | 是 | `periodic_checkpoint` | `checkpoint-scheduler` 调用 media checkpoint；只切当前 open media sessions，写本地 `media_segments_v1` / `daily_media_stats_v1` / `hourly_media_stats_v1`，不影响云端 usage schema |
| Alarm | `quota_check` | 已接入 | 补充模式边界触发 | 可能 | 可能 | `mode_effective_boundary` / quota reason | 1 分钟本地配额到期入口：`quota_check -> EVALUATE_QUOTA_STATE -> handleModeEvent -> executeModeDecision -> current active tab ACCESS_OBSERVED recheck`。它不直接写 `usage_segments_v1`，不扫全量 tabs，不直接 redirect；若触发 mode change，会通过 `mode-service` 产生 `mode_boundary`，由 foreground/media 账本各自切分 open sessions |
| Alarm | `cloudSync` | 已接入 | 维护不计时 | 否 | 否 | 无 | 云同步，不改变本地计时事实 |
| Alarm | `cloudHeartbeat` | 已接入 | 维护不计时 | 否 | 否 | 无 | 云端在线心跳，不证明 session 存活 |
| Alarm | `daily_cleanup` | 已接入 | 维护不计时 | 否 | 否 | 无 | 清理旧数据/日常维护，不产生计时事实 |
| Runtime lifecycle | `chrome.runtime.onStartup` | 已接入 | 容错 | 否 | 估算 | `recovery_estimated_close` | Chrome 启动 lifecycle boundary；只处理残存 open session |
| Runtime lifecycle | `chrome.runtime.onInstalled` | 已接入 | 容错 | 否 | 估算 | `recovery_estimated_close` | install/update/unpacked reload/`runtime.reload()` 后处理残存 open session |
| Runtime lifecycle | background module-load / ordinary SW wake | 已接入 | 维护不计时 | 否 | 否 | 无 | 只注册 listeners、ensure alarms、初始化基础状态；不执行 recovery，不写账 |
| Chrome tab | `chrome.tabs.onCreated` | 未接入 | 确认暂不实现 / 明确不计时 | 否 | 否 | 无 | 创建 tab 不代表前台使用；等待 activated/updated/focus 事件 |
| Chrome tab | `chrome.tabs.onReplaced` | 已接入 | 辅助重评估 + 媒体迁移 | 可能 | 可能 | 汇入 transition / media reclassify | prerender/discard replacement 可能改变 tabId；foreground 对 active/focused added tab re-eval；media 只有 removed tab 已有 fact/session 时才关闭 removed 并按 added 当前事实重开 |
| Chrome tab | `chrome.tabs.onDetached` / `chrome.tabs.onAttached` | 未接入 | 确认暂不实现 | 否 | 否 | 无 | tab 跨窗口移动通常由 focus/activated 覆盖；当前不接入，未来若接入也只能作为 re-eval 辅助 |
| Chrome window | `chrome.windows.onCreated` | 未接入 | 确认暂不实现 / 明确不计时 | 否 | 否 | 无 | 新窗口不代表 active tab 已可计时 |
| Chrome window | `chrome.windows.onBoundsChanged` / window state change | 已接入 | 媒体重分类 | 否 | 可能 | media reclassify | window minimized/restored 只重分类该 window active tab 中已知媒体对象；不凭空开媒体账，不写 foreground usage segment |
| Chrome window | `chrome.windows.onRemoved` | 待实现 | 已确认补强：辅助关闭/重评估 | 否 | 可能 | inactive / close | 如果 removed window 是当前 session windowId，触发 foreground re-eval；若已无 focused Chrome window/active tab，则关闭 foreground session |
| Chrome navigation | `chrome.webNavigation.onHistoryStateUpdated` | 待实现 | 已确认补强：辅助重评估 | 可能 | 可能 | 汇入 transition | 仅 main frame 且 tab 是 active/focused 时触发 re-eval；不直接写账 |
| Chrome navigation | `chrome.webNavigation.onCompleted` | 未接入 | 确认暂不实现 / 明确不计时 | 否 | 否 | 无 | 完成事件太晚且噪声大；当前以 committed/updated/focus 为准 |
| Runtime lifecycle | `chrome.runtime.onSuspend` / `onSuspendCanceled` | 未接入 | 确认暂不实现 / 明确不计时 | 否 | 否 | 无 | MV3 suspend 不适合做 async 落账；最多未来记录诊断 |
| Runtime external | `chrome.runtime.onMessageExternal` | 未接入 | 明确不计时 | 否 | 否 | 无 | 当前不开放外部计时 API |
| Storage | `chrome.storage.onChanged` | 待实现 | 已确认补强：配置动作边界 | 可能 | 可能 | `monitoring_off` / `mode_effective_boundary` | 只监听明确关键配置：monitoring disabled → `monitoring_off`；mode effective change → mode boundary。不得把任意 storage 变化当作计时事件 |

设计约束：
- `主计时` 来源提供正常精确边界；如果关闭和打开同时发生，必须在同一 serialized session commit 中完成。
- `补充计时` 来源只能来自明确用户动作、配置动作、mode boundary 或 alarm checkpoint；estimated reason 必须标识为估算。
- `容错` 来源只处理 lifecycle 残留或 checkpoint 采样不一致，不得参与普通运行期间持续计时。
- `诊断容错` 只记录事件与当前 session 状态不一致的异常事实，例如 close without open、close observed domain mismatch；通常允许 0ms segment，但不得被当成正常使用时长来源。
- `维护不计时` 来源不得直接写 `usage_segments_v1`，也不得更新 session open/close 边界。
- `待实现` 来源已经确认需要补强，但实现前仍不得被视为已接入能力；落地时必须保持“re-eval 辅助，不直接写账”的边界。
- `确认暂不实现` 来源不得在本轮接入；未来若重新评估，必须先修改本表判定，再实现。

已确认待实现补强项：
- `windows.onRemoved`：当前 session window 关闭后 re-eval/关闭。
- `webNavigation.onHistoryStateUpdated`：active/focused main frame re-eval。
- `storage.onChanged`：仅针对 monitoring/mode 关键配置，作为明确产品动作补强。

已确认暂不实现项：
- `tabs.onCreated`
- `tabs.onDetached` / `tabs.onAttached`
- `windows.onCreated`
- `webNavigation.onCompleted`
- `runtime.onSuspend` / `runtime.onSuspendCanceled`
- `runtime.onMessageExternal`

#### 3.1.3 Tab 身份与替换边界

`tabId` 是 Chrome 当前 browser session 内可靠的 tab 标识：同一运行会话内跨窗口唯一，适合做 foreground session、media source、pending UI action 的运行期对象引用。但它不是持久身份，不能跨 Chrome 重启、session restore 或 lifecycle recovery 作为账务主键；持久账本仍以 `domain + start/end + sourceState + settlementReason` 表达事实。

`tabs.onReplaced` 是 `tabId` 语义里必须单独处理的边界：prerender、instant、discard restore 等场景可能让用户可见的 tab 事实从 removed tabId 切到 added tabId。当前处理口径：
- `core/signal.js` 监听 `chrome.tabs.onReplaced`，只在 added tab 是 active tab 时读取 URL/domain/focus 并发出 `tabReplaced` re-eval signal。
- `background.js` wiring 层只维护运行期引用：如果 `lastActiveTabId` 被替换，取消旧 tab pending 状态，把引用切到 added tabId，并把 signal 交给 dispatcher。
- foreground 链路中的 `tabReplaced` 不直接写账；它只进入现有前台 open/close 状态机，由 `transitionStateAt()` 决定是否关闭旧 session、打开新 session 或写 0ms 边界事实。
- media 链路中的 `tabReplaced` 只迁移已知媒体对象：removed tab 没有 media fact/open media session 时 no-op；存在时关闭 removed tab session，并按 added tab 当前事实重开对应媒体 session。

#### 3.1.4 前台计时口径

- “只要在使用 Chrome 就要计时”的前台定义是：Chrome 有聚焦窗口、存在 active tab、系统 idle 状态不是 idle/locked。
- 当前仍保留 legacy 媒体网页补偿：仅在旧 open foreground session 因 idle/focus/checkpoint 可能被关闭前，按 `session.tabId` 查询 `tab.audible` 或 `media_facts_v1[session.tabId]`，判断是否暂缓关闭普通网页 `ACTIVE`。它不得用于新开或补开普通网页账。目标形态是移除该补偿，让媒体只进入本地媒体账本；但本轮只收敛查询入口，不删除。
- HTTP/HTTPS 记录归一化后的**精确 hostname**。`www.example.com`、`m.example.com`、`sub.example.com` 分别落账和聚合，不自动合并到 `example.com`。
- 父域覆盖子域只用于规则匹配（study/composite/restricted/unsafe）和配额/拦截判断，不改变账本 `domain` key。
- 如果未来需要“主站”视图，应在读取/展示层增加 `siteGroup` 聚合；不得改写 `usage_segments_v1` / `daily_usage_stats_v1` / `hourly_usage_stats_v1` 的原始 domain 粒度。
- 特殊 URL 不形成空窗，而是映射为安全伪域名：`chrome-extension:` → `extension-page.chrome-local`，`chrome://extensions` → `chrome-extensions.chrome-local`，`chrome://settings` → `chrome-settings.chrome-local`，其他 `chrome://` → `chrome-page.chrome-local`，`file:` → `local-file.chrome-local`，`about:` → `about-page.chrome-local`，`data:`/`blob:` → `embedded-page.chrome-local`。
- 不记录本地文件路径、扩展 ID、完整内部 URL 查询参数。

#### 3.1.5 媒体原始事实来源

`MEDIA_STATE` 不是原始事实；它是 content script / Chrome tab 事实归一化后的 runtime signal。媒体计时设计必须先区分原始事实来源，再写入 frame-level facts 并派生 tab-level media fact。目标形态是它不得影响 foreground ACTIVE；当前仍有 legacy foreground compensation 查询路径，已标记为待处理。

| 来源 | 原始事件 / 查询 | 当前状态 | 可证明 | 不可证明 |
|---|---|---:|---|---|
| DOM media element | `video/audio` 的 `play` / `pause` / `ended` | 已接入 | 页面 media element 播放状态变化 | 不保证有声音；单个元素停止不代表页面无其他媒体 |
| DOM media element polling | content script 单一 1s 采样循环扫描 `video,audio`：`!paused && !ended && readyState > 2` | 已接入 | 当前页面存在正在播放的 media element；静音媒体也可被观察到 | 不保证 audible；状态变化最多约 1s 延迟，长期播放只每 30s 低频重申事实 |
| Picture-in-Picture API | `enterpictureinpicture` / `leavepictureinpicture` / `document.pictureInPictureElement` | 已接入 | 当前 document 标准 PiP 状态 | 不覆盖所有浏览器/站点私有浮窗实现 |
| Web Audio API | `AudioContext.statechange`、构造后读取 `ctx.state` | 已接入 | WebAudio context 处于 running | 只能覆盖 patch 后可见的 context；不区分具体音源 |
| Content script message | `MEDIA_STATE { playing, isPiP, mediaKind, source }` + `sender.tab.id/url/windowId/frameId` | 已接入 | 将页面事实绑定到 `tabId + frameId`，并记录 `dom_media_event` / `dom_media_poll` / `web_audio` / `pip_api` 来源 | 它本身不是原始事实 |
| Chrome tab API | `chrome.tabs.get(tabId).audible` | 已接入 | Chrome 原生判断 tab 近期产生声音 | 不能证明静音视频播放；不区分 audio/video |
| Chrome tab API | `tabs.onUpdated` 的 `changeInfo.audible` / `tab.audible` | 已接入 | tab audible 状态变化，可覆盖非 active tab 音频事实 | 不是完整媒体生命周期事件 |
| Chrome tab API | `tab.mutedInfo` | 已接入 | tab 是否被静音，用于区分 audible 事实 | 静音不等于未播放 |
| Navigation / tab close | `tabs.onUpdated` URL/loading、`tabs.onRemoved` | 已接入 | 来源页面消失或导航，应关闭旧媒体 session | 不是媒体停止事件 |

当前 PiP policy：
- 当前版本将 PiP 定义为管控漏洞，不作为受支持使用方式。policy 固定为 `disallow_all`。
- 任何 `isPiP === true` 都必须触发共享 `EXIT_PIP` cleanup；不按 mode、域名、Chrome 是否最小化区分。
- 媒体账本仍保留真实 PiP 事实和清理窗口。`pip` segment 的语义是“检测到的禁用 PiP 事实 / cleanup window”，不是受支持的使用模式。
- cleanup 成功或页面确认已无 PiP 后，open `pip` media session 使用 `settlementReason = pip_forbidden_cleanup` 关闭，清理该 tab 的 PiP frame fact，并按剩余非 PiP media fact 重分类。
- cleanup 失败时不得伪造关闭：保留 open `pip` session，写入 `pip_forbidden_cleanup_failed` trace/diagnostic；后续 `media checkpoint` 会继续重试 cleanup，并在失败时按事实继续 checkpoint。
- 正式发布前必须重新设计“是否允许学习/综合网站 PiP、如何计入统计/配额/云端/家长端展示”。未完成前不得以半支持 PiP 状态发布。

当前归因约束：
- 媒体计时已经从 foreground `usage_segments_v1` 解耦，使用独立媒体账本：`media_frame_facts_v1`、`media_facts_v1`、`media_sessions_v2`、`media_segments_v1`、`daily_media_stats_v1`、`hourly_media_stats_v1`。
- `dom_media_poll` 是注入脚本的页面采样事实，不是 Chrome 原生事件；30 秒重申只用于补足静音媒体/漏事件场景，不代表每 30 秒落账。
- `media_frame_facts_v1` 保存 `tabId + frameId` 的页面媒体事实；`media_facts_v1` 是按 tab 派生出来的聚合事实，不再被最后一个 frame message 覆盖。
- tab 聚合规则：PiP 优先；任一 frame video 播放则 tab 为 video；否则任一 frame audio/WebAudio/audible 则 tab 为 audio；只有同 tab 所有 frame 都停止时才关闭 tab media session。
- 媒体分类优先级：PiP > video > audio；同一 tab 同时 video + audio 只计 video。
- `foregroundAudio` / `foregroundVideo` 定义为：source tab 是某个未最小化 Chrome window 的 active tab；不要求 Chrome window focused。
- `backgroundAudio` / `backgroundVideo` 定义为：播放源不是上述 foreground media，或所在窗口已最小化。
- PiP 计为 `pip`，独立于 foreground/background media，但当前 policy 是全局禁止；`pip` 只表示被检测到且正在清理/清理失败的禁用事实。
- `tabs.onActivated`、`tabs.onReplaced`、window minimized/restored 只允许对已知媒体 tab 做关闭、迁移或 foreground/background 重分类；没有既有 media fact 或 open media session 时不得凭空开媒体账。
- 媒体细分时长写入独立媒体账本，不写入 foreground `usage_segments_v1`，也不进入 `buildUsageSegmentsUploadPayload()`。当前 legacy compensation 仍可能影响 foreground `ACTIVE` 开合；该行为只作为待移除遗留路径保留。
- 云端同步边界：媒体账本已有独立 outbox、上传函数和 Worker endpoints（`/device/media-segments/v1`、`/device/media-stats/v1`），但它仍不混入普通 `usage_segments_v1` / `stats_v1` 协议。Pages/admin/popup 的最终媒体统计口径、配额口径和家长端展示仍是发布前需要确认的产品项。

#### 3.1.6 周期性 Checkpoint（补充计时落账与采样对账）

`periodicCheckpoint` 是补充计时落账机制：它不替代 tab/window/idle/popup/mode 等精确边界事件，但在普通运行期间定期主动采样当前 Chrome 前台事实，补充生成稳定的 durable segment，并发现 `session_v1` 与当前采样不一致的异常残留。

- 终端后台新增 `periodicCheckpoint` alarm，间隔 3 分钟。
- 每次触发时必须主动确认当前 Chrome 使用事实：普通网页优先要求 idle 为 active、存在 active tab、Chrome window focused、`observedDomain` 可解析。legacy foreground checkpoint 只允许在关闭旧 open foreground session 前按 `session.tabId` 查询已知媒体事实，判断是否暂缓关闭旧账；不得查询 observed active tab 的媒体事实，也不得用媒体事实 estimated open / 补开新 foreground session。该查询是已标记的遗留行为。media checkpoint 由独立 runner 只切 open media sessions。
- Checkpoint 对账矩阵：

| `session_v1` | 当前采样 | 性质 | 动作 |
|---|---|---|---|
| open counted session | Active 且 `observedDomain == session.domain` | 正常补充计时落账 | close 到 checkpoint boundary，写 `periodic_checkpoint`，从同一 state/domain 重开 |
| open counted session | Idle / 无 focused tab / Active 但 `observedDomain != session.domain` | 容错关闭 | close 到 `session.startTime + min(now - session.startTime, CHECKPOINT_INTERVAL_MS / 2)`，写 `checkpoint_estimated_close`，清空旧 session；若当前采样是新的 Active，可同时按估算开账打开新 session |
| session closed | Idle / 不可计时 | 正常空账确认 | no-op，不写 segment |
| session closed | Active | 容错开账 | 以 `now - CHECKPOINT_INTERVAL_MS / 2` 打开 estimated session，`startReason = checkpoint_estimated_open`，不立即写 segment，等待后续正常边界或 checkpoint 结算 |

- `checkpoint_estimated_close` / `checkpoint_estimated_open` 都是 timer-source 容错修复，不代表精确用户边界；估算窗口最多半个 checkpoint interval，避免长时间残留产生大段虚假时长。
- `heartbeat` 不再作为计时机制；若保留维护 tick，也只能作为 maintenance，不得更新计时边界或证明 session 存活。
- `ui_flush` 的 30 秒 guard 仅作用于 `reason === ui_flush`，不影响 `periodic_checkpoint`、tab switch、mode switch、tab close、monitoring off、recovery 等非 `ui_flush` 结算路径。

#### 3.1.7 Recovery 生命周期容错边界

Recovery 是容错机制，不是正常计时落账机制。它只处理扩展生命周期边界之后遗留在存储里的 open session，用于避免异常中断后残留状态无限期保留；普通运行期间的计时事实由事件边界、popup 边界、mode 边界和 `periodicCheckpoint` 主动确认提供。

- MV3 Service Worker 是事件响应入口，不是常驻后台进程。普通 module-load、message/alarm/tab/window/idle 唤醒不代表异常恢复，不执行 `recover()`。
- `recover()` 只在 extension lifecycle boundary 执行：`chrome.runtime.onStartup` 与 `chrome.runtime.onInstalled`（install、update、unpacked reload、`chrome.runtime.reload()`）。
- recovery 发现残存 open counted session 时，使用最小估算窗口：`estimateMs = PERIODIC_CHECKPOINT_MIN_INTERVAL_MS / 2`，`closeAt = min(now, session.startTime + estimateMs)`。
- recovery 不按 `Date.now()` 全额补账，不按 `lastHeartbeat` 补账；`lastHeartbeat` 只作为旧数据兼容字段保留。
- recovery 估算落账使用 `settlementReason = recovery_estimated_close`，`description.end.reason = recovery_estimated_half_checkpoint`，`description.end.source = recovery`。只有非正向时间跨度或非 counted session 才只清空 open session；小于 1 秒的正向跨度仍保留为 sub-second segment。
- recovery 输出的 segment 必须在分析时视为 estimated/fallback 数据；它可以减少漏计和清理残留，但不能证明 lifecycle boundary 之前整段 session 都真实持续存在。

### 3.2 存储交互

```
session_v1 ──(state close)──→ usage_segments_v1 ──→ daily_usage_stats_v1
                                    │                        │
                                    │                        ├──→ stats_sync_outbox_v1 → Cloud stats_v1
                                    │                        │
                                    ├──────────────→ hourly_usage_stats_v1
                                    │                        │
                                    │                        └──→ hourly_stats_sync_outbox_v1 → Cloud hourly_stats_v1
                                    │
                                    └──→ segment_sync_outbox_v1 → Cloud usage_segments_v1
```

- `uploadSessionUpload()` 从 `segment_sync_outbox_v1` 读取，上传到云端
- `uploadStats()` 从 `stats_sync_outbox_v1` 读取，上传到云端（或可以从云端 segments 重建以进行对账）
- `uploadHourlyStats()` 从 `hourly_stats_sync_outbox_v1` 读取，上传到云端；小时聚合不替代每日聚合
- `event_log_v1` 不再直接用于上传或聚合

### 3.3 独立媒体账本

媒体账本是独立事实账本，和普通前台 `usage_segments_v1` 上传协议解耦：

| Key | 粒度 | 用途 |
|---|---|---|
| `media_frame_facts_v1` | `tabId + frameId` | 保存 content frame / tab native source 的最近一次媒体事实，避免同 tab 多 frame stopped/playing 互相覆盖 |
| `media_facts_v1` | `tabId` | 从同 tab 所有 frame facts 派生的 tab 级媒体事实：domain/windowId/playing/mediaKind/isPiP/audible/muted/isActiveTab/windowState/source/lastObservedAt |
| `media_sessions_v2` | `tabId + mediaClass` | 保存当前打开的媒体 session，支持多个 tab 并行 |
| `media_segments_v1` | segment id | 保存本地媒体逐段账本：start/end/domain/tabId/windowId/mediaClass/mediaKind/visibility/mode/reason/description |
| `daily_media_stats_v1` | date + domain + mediaClass + mode | 从 `media_segments_v1` 增量聚合本地媒体秒数 |
| `hourly_media_stats_v1` | hourKey + domain + mediaClass + mode | 从 `media_segments_v1` 增量聚合本地媒体小时秒数 |

`mediaClass` 取值为 `foregroundAudio`、`backgroundAudio`、`foregroundVideo`、`backgroundVideo`、`pip`。媒体 checkpoint 每 3 分钟只处理当前 open media session。对于 open `pip` session，checkpoint 必须先按全局 PiP policy 重试 cleanup；cleanup 成功则关闭本地 `pip` session，不再进入普通 checkpoint 重开。cleanup 失败时，仍按真实媒体事实继续确认和 checkpoint，避免丢失禁用 PiP 仍在播放的事实。非 PiP session 必须先用该 session 的 `tabId` 精确确认当前媒体事实仍成立；确认成功才写 `periodic_checkpoint` 并重开。`lastObservedAt` 只代表真实媒体事实来源，checkpoint 不能把它刷新为当前时间。

如果 checkpoint 无法确认 open media session（tab 不存在、分类不匹配、domain/window/tab 不匹配，或 PiP 已不存在），则按半未确认窗口估算闭合：`closeAt = lastConfirmedAt + (now - lastConfirmedAt) / 2`，写入 `settlementReason = media_checkpoint_estimated_close`，`description.end.reason = media_checkpoint_estimated_half_interval_close`，并删除 open session，不重开。tab close/navigation/分类变化仍会关闭旧 media session 并写本地 segment。

Mode boundary 是系统级账务边界。由于当前 PiP policy 为全局禁止，任何 mode boundary 发现 open `pip` session 时都必须先尝试共享 cleanup；cleanup 成功后用 `pip_forbidden_cleanup` 关闭 `pip` session，不以 `mode_effective_boundary_reopen` 重开 PiP；cleanup 失败时保留事实并按 mode boundary 切片，表示禁用 PiP 仍在持续。页面内仍有非 PiP 视频/音频事实时，可按新 mode 重分类为普通 foreground/background media。

该账本不进入 `segment_sync_outbox_v1` 或 `stats_sync_outbox_v1`，不会被 `buildUsageSegmentsUploadPayload()` 上传；它使用独立 `media_segment_sync_outbox_v1` / `media_stats_sync_outbox_v1` / `hourly_media_stats_sync_outbox_v1` 和 dedicated Worker endpoints。正式发布前仍必须确认媒体细分是否进入正式产品统计/配额/家长端口径，以及 Pages/admin/popup 是否以同一 managed statistics view 展示。

---

## 4. `usage_segments_v1` Schema（局部）

### 4.1 存储键

```
usage_segments_v1 (chrome.storage.local)
```

键值结构是一个以 segment ID 为键的扁平映射：

```javascript
{
  "seg-20260506-a1b2c3d4": {
    "id": "seg-20260506-a1b2c3d4",
    "profileId": "e12a4ec6-f9b8-4a1a-8586-bdc4bb8ff653",
    "deviceId": "d7d4c3db-a759-4fcb-8d66-13c09a8e75cd",
    "date": "2026-05-06",
    "timezone": "Asia/Shanghai",
    "dayStartMs": 1777852800000,
    "dayEndMs":   1777939199999,
    "startMs": 1777860000000,
    "endMs":   1777861800000,
    "durationSeconds": 1800,
    "domain": "example.com",
    "channel": "active",
    "mode": "rest",
    "sourceState": "ACTIVE",
    "settlementReason": "transition_complete",
    "parentSegmentId": null,
    "partIndex": 1,
    "partCount": 1,
    "createdAt": 1777861800500,
    "uploadedAt": null
  }
}
```

### 4.2 字段定义

#### 标识字段

| 字段 | 类型 | 必须 | 描述 |
|------|------|------|------|
| `id` | string | ✅ | 唯一 segment ID，格式：`seg-{YYYYMMDD}-{8hex}` |
| `profileId` | string | ✅ | 该 segment 所属的 profile ID（uuid） |
| `deviceId` | string | ✅ | 产生该 segment 的设备 ID（uuid） |

#### 日期/时间字段

| 字段 | 类型 | 必须 | 描述 |
|------|------|------|------|
| `date` | string | ✅ | YYYY-MM-DD，本地日历日期 |
| `timezone` | string | ✅ | 设备/Profile 本地时区标识符 |
| `dayStartMs` | number | ✅ | 本地 00:00:00 的 epoch ms |
| `dayEndMs` | number | ✅ | 本地 23:59:59.999 的 epoch ms |
| `startMs` | number | ✅ | Segment 开始 epoch ms |
| `endMs` | number | ✅ | Segment 结束 epoch ms |
| `durationSeconds` | number | ✅ | 时长（秒）|

#### 用量字段

| 字段 | 类型 | 必须 | 描述 |
|------|------|------|------|
| `domain` | string | ✅ | 归一化域名 |
| `channel` | string | ✅ | `active` / `backgroundMedia` / `pip` |
| `mode` | string | ✅ | Runtime/product mode：`study` / `composite` / `rest` / `locked` / `paused`；`unknown` 只允许作为 ledger fallback，不是产品/runtime mode |
| `sourceState` | string | ✅ | 产生该 segment 的原始 STATE_WEIGHTS 状态（`ACTIVE` / `BACKGROUND_ACTIVE` / `PIP_ACTIVE`）|

#### 结算元数据

| 字段 | 类型 | 必须 | 描述 |
|------|------|------|------|
| `settlementReason` | string | ✅ | 为什么关闭：`transition_complete` / `periodic_checkpoint` / `checkpoint_estimated_close` / `popup_open` / `cross_day_boundary` / `mode_switch` / `recovery_estimated_close` / `monitoring_disabled` |
| `parentSegmentId` | string｜null | ❌ | 如果该 segment 是较大 segment 的分割部分，则为父 segment 的 ID |
| `partIndex` | number | ✅ | 如果分割，则为 1-based 索引（用于对穿越午夜的 segments） |
| `partCount` | number | ✅ | 原始较大 segment 的总部分数 |
| `createdAt` | number | ✅ | Segment 创建 epoch ms |
| `uploadedAt` | number｜null | ❌ | Segment 上传到云端的 epoch ms（或 null） |

#### 本地诊断字段与云端上传差异

`usage_segments_v1` 的本地账本 schema 可以包含本地诊断字段，例如 `description`、`tabId`、`windowId`，用于保存 segment 的 open/close 操作来源、reason、可读摘要和运行期 tab/window 引用。这类字段属于本地诊断/未来分析预留，不自动成为云端上传协议的一部分。

当前 `buildUsageSegmentsUploadPayload()` 是显式白名单构造器：它只输出云端 v1 ingestion 固定字段，不会把本地 segment 对象上的所有字段透传到 Worker。当前 v1 上传字段不包含 `description`、`tabId`、`windowId`，因此这些本地诊断字段不上传、不写入 D1 `usage_segments_v1`、不参与云端查询或 Pages 展示。

正式发布前必须确认本地 runtime schema 与 cloud ingestion schema 是否需要收敛：若要求云端可查 Open/Close 操作，需要同步修改上传 payload、Worker 校验/插入、D1 migration、云端查询和 Pages 展示；若保持本地-only，则该差异必须继续作为已知设计约束记录。

### 4.3 结算规则

1. **每次使用会话关闭时创建一个 segment**：当 transitionState 关闭一个打开的 segment 时，立即创建一个 `usage_segment`
2. **按自然日拆分**：跨越午夜的 segments 按本地自然日边界分割。每个 split 部分有自己的 segment ID，将原 ID 作为 `parentSegmentId` 引用
3. **按模式拆分**：如果使用过程中模式切换，旧模式 segment 在切换时关闭；新模式的新 segment 开始
4. **恢复容错**：extension lifecycle recovery 期间通过 `settlementReason = "recovery_estimated_close"` 估算关闭残存 open session；该路径是异常/生命周期残留清理，不是正常计时落账机制，不处理普通 SW 唤醒
5. **永不删除**：Segments 是 append-only 的。旧的 `usage_segments_v1` 条目在 365 天后清理，而不是在 24 小时后删除
6. **幂等结算**：同一个 event-log 关闭不能产生重复的 segments

---

## 5. `daily_usage_stats_v1` / `hourly_usage_stats_v1` Schema（物化聚合）

### 5.1 存储键

```
daily_usage_stats_v1 (chrome.storage.local)
```

与之前相同的 schema（§4 of original），但现在明确定义为从 `usage_segments_v1` 构建的**每日物化视图**：

```javascript
{
  "2026-05-06": {
    "date": "2026-05-06",
    "timezone": "Asia/Shanghai",
    "dayStartMs": 1777852800000,
    "dayEndMs":   1777939199999,
    "segmentsCount": 12,               // 为此日期贡献的 segments 数量
    "lastSegmentId": "seg-20260506-ffff0000",  // 此日期的最后 segment ID（用于增量重建）
    "domains": {
      "example.com": {
        "activeSeconds": 1800,
        "backgroundMediaSeconds": 600,
        "pipSeconds": 0,
        "totalSeconds": 2400,
        "activeByMode": { "study": 0, "composite": 0, "rest": 1800, "locked": 0, "paused": 0, "unknown": 0 },
        "backgroundMediaByMode": { "rest": 600 },
        "pipByMode": {},
        "firstSeenAt": 1777860000000,
        "lastSeenAt": 1777870000000,
        "lastUpdatedAt": 1777870000000,
        "segmentIds": ["seg-20260506-a1b2c3d4", "seg-20260506-e5f6g7h8"]
      }
    }
  }
}
```

### 5.2 构建规则

1. **从 segments 增量更新**：当某个日期有新的 segment 时，增加对应的 by-domain by-channel by-mode 计数器
2. **全量重建**：如果需要，可以通过对 `usage_segments_v1` 中某个日期的所有 segments 求和来全量重建聚合
3. **domain key 保持精确 hostname**：聚合 key 必须直接使用 segment.domain；`www.example.com` 与 `m.example.com` 不合并。规则匹配的父域覆盖语义不得用于 daily stats 聚合。
4. **`segmentsCount` 跟踪**：确保重建与增量更新匹配
5. **保留 365 天**，与 `usage_segments_v1` 保留期匹配

### 5.3 小时聚合规则

```
hourly_usage_stats_v1 (chrome.storage.local)
```

`hourly_usage_stats_v1` 是从 `usage_segments_v1` 构建的**小时物化视图**，用于小时级报表、配额对账和云端小时查询。它不是新的事实账本，不替代 `usage_segments_v1` 或 `daily_usage_stats_v1`。

小时 key 使用用户本地时间：`hourKey = YYYY-MM-DDTHH`，例如 `2026-05-21T14`。每个 hour entry 包含 `hourKey/date/hour/timezone/hourStartMs/hourEndMs/segmentsCount/lastSegmentId/domains`。domain shape 与 `daily_usage_stats_v1` 对齐：`activeSeconds/backgroundMediaSeconds/pipSeconds/totalSeconds`、`activeByMode/backgroundMediaByMode/pipByMode`、`firstSeenAt/lastSeenAt/lastUpdatedAt`。

跨小时 segment 不物理拆分 `usage_segments_v1`。聚合时按本地小时边界生成 hour slices，每个 slice 继承原 segment 的 `domain/channel/mode`。所有 slice 的秒数之和必须等于原 segment 的 `durationSeconds`；毫秒余数按确定性规则分配给余数较大的 slice，保证小时聚合与 segment 总秒数可对账。`rebuildHourlyUsageStats(dateOrHourKey)` 必须从 segments 重建小时索引，用于修复、测试和 suspect cleanup 后的对账。

---

## 6. 与现有系统的关系

### 6.1 `event_log_v1` → 不替代

- `event_log_v1` 保留用于短期恢复/调试追踪
- 它不能替代 `usage_segments_v1`（没有 segment ID、24 小时保留、没有 mode、没有稳定的 settlement）
- 它不能替代 `daily_usage_stats_v1` / `hourly_usage_stats_v1`（压缩后消失）

### 6.2 现有 R2 `/device/sessions/upload` → 不足够

- `workers/src/routes/sessions.ts` 上传原始 sessions JSON 到 R2
- 没有 D1 表、没有索引、没有查询平面
- 不能用于逐段对账或未来分析
- **不能替代云端 `usage_segments_v1` 表**

### 6.3 现有 `composite_sessions` → 不是通用 segments

- `workers/schema.sql:48-61` 中的 `composite_sessions` 表仅针对**综合型网站**进行父级审核
- 它存储标题和分类结果，而不是粒度 channel/mode/reasalReason
- **不能替代通用 `usage_segments_v1`**

### 6.4 `usage_segments_v1` 始终是必需的

`usage_segments_v1` 始终被要求用于持久化的逐段使用记录和云端上传，以便进行未来分析和验证。它之前缺失于文档和代码中，但现在必须包含。

---

## 7. Sync Contract

### 7.1 Segment Upload — `uploadSegments()`

```javascript
// 新：从 segment_sync_outbox_v1 读取并上传到云端
export async function uploadSegments() {
  const outbox = await getSegmentSyncOutbox();
  const dirtyIds = outbox.dirtySegmentIds || [];
  if (dirtyIds.length === 0) {
    return { uploaded: 0, failed: 0, skipped: true };
  }

  const allSegments = await getAllUsageSegments();
  const payload = dirtyIds.map(id => allSegments[id]).filter(Boolean);

  if (payload.length === 0) {
    await clearSegmentSyncOutbox();
    return { uploaded: 0, failed: 0, skipped: true };
  }

  try {
    await cloudRequest('POST', '/device/usage-segments/v1', { segments: payload });
    await markSegmentsUploaded(dirtyIds);
    return { uploaded: payload.length, failed: 0, skipped: false };
  } catch (e) {
    return { uploaded: 0, failed: payload.length, skipped: false, error: e.message };
  }
}
```

### 7.2 Daily Aggregate Upload — `uploadStats()`

```javascript
// 新：从 stats_sync_outbox_v1 读取，而不是 event_log_v1
export async function uploadStats() {
  const dailyStats = await getDailyUsageStats();
  const outbox     = await getStatsSyncOutbox();

  const dirtyDates = outbox.dirtyDates || [];
  if (dirtyDates.length === 0) {
    return { uploaded: 0, failed: 0, skipped: true };
  }

  let uploaded = 0;
  let failed = 0;
  for (const dateStr of dirtyDates) {
    const dayData = dailyStats[dateStr];
    if (!dayData) { clearDirtyDate(dateStr); continue; }

    const payload = buildDailyPayload(dayData);
    try {
      await cloudRequest('POST', '/device/stats/v1', { date: dateStr, stats: payload });
      clearDirtyDate(dateStr);
      uploaded++;
    } catch (e) { failed++; }
  }
  return { uploaded, failed, skipped: false };
}
```

### 7.3 Hourly Aggregate Upload — `uploadHourlyStats()`

```javascript
// 从 hourly_stats_sync_outbox_v1 读取小时 key，上传小时物化索引
export async function uploadHourlyStats() {
  const hourlyStats = await getHourlyUsageStats();
  const outbox = await getHourlyStatsSyncOutbox();
  const dirtyHourKeys = outbox.dirtyHourKeys || [];
  if (dirtyHourKeys.length === 0) {
    return { uploaded: 0, failed: 0, skipped: true };
  }

  let uploaded = 0;
  let failed = 0;
  for (const hourKey of dirtyHourKeys) {
    const hourData = hourlyStats[hourKey];
    if (!hourData) { clearDirtyHourKey(hourKey); continue; }

    const payload = buildHourlyStatsUploadPayload(hourKey);
    try {
      await cloudRequest('POST', '/device/hourly-stats/v1', payload);
      clearDirtyHourKey(hourKey);
      uploaded++;
    } catch (e) { failed++; }
  }
  return { uploaded, failed, skipped: false };
}
```

媒体小时聚合使用同样模式：`hourly_media_stats_sync_outbox_v1` → `buildHourlyMediaStatsUploadPayload(hourKey)` → `POST /device/hourly-media-stats/v1`。媒体小时聚合只来自 `media_segments_v1`，不进入普通 usage 上传协议。

### 7.4 同步规则

1. Segments 在 aggregates 之前上传（cloud 可以从 segments 重建 aggregates）
2. `segment_sync_outbox_v1` 跟踪脏 segment IDs
3. `stats_sync_outbox_v1` 跟踪脏日期
4. `hourly_stats_sync_outbox_v1` 跟踪脏小时
5. 媒体账本使用独立 outbox：`media_segment_sync_outbox_v1`、`media_stats_sync_outbox_v1`、`hourly_media_stats_sync_outbox_v1`
6. 上传成功后清除出站状态；源数据（segments/aggregates）保留完整
7. 有效载荷中缺失的数据不暗示删除
8. 云端使用 upsert 进行 idempotent ingest

---

## 8. Cloud Ingest Contract

### 8.1 Segment Upload: `POST /device/usage-segments/v1`

Upload validation accepts `durationSeconds >= 0` as long as `endMs > startMs`. This preserves sub-second local segments as cloud facts (`durationSeconds = 0`) without losing their exact millisecond open/close timestamps. The final product policy for how to present or merge these short segments is a release blocker, not a reason to drop them at ingestion time.

```typescript
export async function ingestUsageSegments(profileId: string, segments: SegmentPayload[]) {
  let inserted = 0, updated = 0;
  for (const seg of segments) {
    const normalizedDomain = normalizeHostname(seg.domain);
    if (!normalizedDomain) continue;

    await env.DB.prepare(`
      INSERT INTO usage_segments_v1 (id, profile_id, device_id, date, timezone,
        day_start_ms, day_end_ms, start_ms, end_ms, duration_seconds,
        domain, channel, mode, source_state, settlement_reason,
        parent_segment_id, part_index, part_count, created_at, uploaded_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT (id) DO UPDATE SET
        uploaded_at = excluded.uploaded_at
    `).bind(
      seg.id, profileId, seg.deviceId, seg.date, seg.timezone,
      seg.dayStartMs, seg.dayEndMs, seg.startMs, seg.endMs, seg.durationSeconds,
      normalizedDomain, seg.channel, seg.mode, seg.sourceState, seg.settlementReason,
      seg.parentSegmentId, seg.partIndex, seg.partCount, seg.createdAt, Date.now()
    ).run();
    inserted++;
  }
  return { success: true, count: segments.length };
}
```

### 8.2 Cloud `usage_segments_v1` Table

```sql
CREATE TABLE usage_segments_v1 (
  id                  TEXT PRIMARY KEY,
  profile_id          TEXT NOT NULL,
  device_id           TEXT,
  date                TEXT NOT NULL,
  timezone            TEXT NOT NULL,
  day_start_ms        INTEGER NOT NULL,
  day_end_ms          INTEGER NOT NULL,
  start_ms            INTEGER NOT NULL,
  end_ms              INTEGER NOT NULL,
  duration_seconds    INTEGER NOT NULL,
  domain              TEXT NOT NULL,
  channel             TEXT NOT NULL,      -- active / backgroundMedia / pip
  mode                TEXT NOT NULL,      -- study / composite / rest / locked / paused; unknown is ledger fallback only
  source_state        TEXT NOT NULL,      -- ACTIVE / BACKGROUND_ACTIVE / PIP_ACTIVE
  settlement_reason   TEXT NOT NULL,
  parent_segment_id   TEXT,
  part_index          INTEGER NOT NULL DEFAULT 1,
  part_count          INTEGER NOT NULL DEFAULT 1,
  created_at          INTEGER NOT NULL,
  uploaded_at         INTEGER
);

CREATE INDEX idx_useg_profile_date      ON usage_segments_v1 (profile_id, date);
CREATE INDEX idx_useg_profile_date_domain ON usage_segments_v1 (profile_id, date, domain);
CREATE INDEX idx_useg_domain_channel    ON usage_segments_v1 (domain, channel);
```

### 8.3 Cloud `stats_v1` Table

```sql
CREATE TABLE stats_v1 (
  id                        TEXT PRIMARY KEY,
  profile_id                TEXT NOT NULL,
  date                      TEXT NOT NULL,
  domain                    TEXT NOT NULL,
  active_seconds            INTEGER NOT NULL DEFAULT 0,
  background_media_seconds  INTEGER NOT NULL DEFAULT 0,
  pip_seconds               INTEGER NOT NULL DEFAULT 0,
  active_by_mode            TEXT NOT NULL DEFAULT '{}',
  background_media_by_mode  TEXT NOT NULL DEFAULT '{}',
  pip_by_mode               TEXT NOT NULL DEFAULT '{}',
  segments_count            INTEGER NOT NULL DEFAULT 0,
  last_segment_id           TEXT,
  first_seen_at             INTEGER NOT NULL,
  last_seen_at              INTEGER NOT NULL,
  updated_at                INTEGER NOT NULL,

  UNIQUE (profile_id, date, domain)
);
```

### 8.4 Cloud `hourly_stats_v1` / `hourly_media_stats_v1` Tables

小时云端表是 materialized index，不是事实账本。唯一键必须包含 `device_id`，避免多终端同 profile 下互相覆盖。

```sql
CREATE TABLE hourly_stats_v1 (
  id                        TEXT PRIMARY KEY,
  profile_id                TEXT NOT NULL,
  device_id                 TEXT NOT NULL,
  hour_key                  TEXT NOT NULL,
  date                      TEXT NOT NULL,
  hour                      INTEGER NOT NULL,
  domain                    TEXT NOT NULL,
  channel                   TEXT NOT NULL,
  mode                      TEXT NOT NULL,
  duration_seconds          INTEGER NOT NULL DEFAULT 0,
  segments_count            INTEGER NOT NULL DEFAULT 0,
  last_segment_id           TEXT,
  first_seen_at             INTEGER,
  last_seen_at              INTEGER,
  created_at                INTEGER NOT NULL,
  updated_at                INTEGER NOT NULL,
  UNIQUE (profile_id, device_id, hour_key, domain, channel, mode)
);

CREATE TABLE hourly_media_stats_v1 (
  id                        TEXT PRIMARY KEY,
  profile_id                TEXT NOT NULL,
  device_id                 TEXT NOT NULL,
  hour_key                  TEXT NOT NULL,
  date                      TEXT NOT NULL,
  hour                      INTEGER NOT NULL,
  domain                    TEXT NOT NULL,
  media_class               TEXT NOT NULL,
  mode                      TEXT NOT NULL,
  duration_seconds          INTEGER NOT NULL DEFAULT 0,
  segments_count            INTEGER NOT NULL DEFAULT 0,
  last_segment_id           TEXT,
  first_seen_at             INTEGER,
  last_seen_at              INTEGER,
  created_at                INTEGER NOT NULL,
  updated_at                INTEGER NOT NULL,
  UNIQUE (profile_id, device_id, hour_key, domain, media_class, mode)
);
```

云端读取接口：
- `GET /profiles/:id/hourly-stats/v1`：支持 `from/to`、`deviceId`、`domain`、`channel`、`mode`。
- `GET /profiles/:id/hourly-media-stats/v1`：支持 `from/to`、`deviceId`、`domain`、`mediaClass`、`mode`。

### 8.5 Cloud Ingest Rules

1. **不允许 date-level replace**
2. Segments：使用 `ON CONFLICT (id) DO UPDATE` — idempotent；重复 segment ID 不创建新行
3. Stats：使用 `ON CONFLICT (profile_id, date, domain) DO UPDATE` — 合并 by-domain
4. Hourly stats：使用 `ON CONFLICT (profile_id, device_id, hour_key, domain, channel, mode) DO UPDATE`
5. Hourly media stats：使用 `ON CONFLICT (profile_id, device_id, hour_key, domain, media_class, mode) DO UPDATE`
6. 当前有效载荷中缺失的数据不暗示删除
7. 所有三个 usage duration channels + by-mode，以及媒体五类 mediaClass + byMode，从一开始就支持
8. Cloud audit log（`segment_upload_log`、`stats_upload_log`）跟踪每次上传操作；小时聚合沿用 stats sync trace，后续如需独立 audit log 再补 schema

---

## 9. Cloud Audit Log

### 9.1 `segment_upload_log` Table

```sql
CREATE TABLE segment_upload_log (
  id              TEXT PRIMARY KEY,
  profile_id      TEXT NOT NULL,
  device_id       TEXT NOT NULL,
  segment_count   INTEGER NOT NULL,
  duration_total  INTEGER NOT NULL,
  payload_hash    TEXT NOT NULL,
  inserted_count  INTEGER NOT NULL DEFAULT 0,
  updated_count   INTEGER NOT NULL DEFAULT 0,
  created_at      INTEGER NOT NULL
);
```

### 9.2 `stats_upload_log` Table

```sql
CREATE TABLE stats_upload_log (
  id             TEXT PRIMARY KEY,
  profile_id     TEXT NOT NULL,
  device_id      TEXT NOT NULL,
  date           TEXT NOT NULL,
  domain_count   INTEGER NOT NULL,
  channel_count  INTEGER NOT NULL,
  duration_total INTEGER NOT NULL,
  payload_hash   TEXT NOT NULL,
  inserted_count INTEGER NOT NULL DEFAULT 0,
  updated_count  INTEGER NOT NULL DEFAULT 0,
  created_at     INTEGER NOT NULL
);
```

---

## 10. Migration Policy

### 10.1 从旧到新的过渡

1. **默认不重建旧的压缩数据**
   - 在 `event_log_v1` 压缩中丢失的数据无法恢复
   - 云端 P.xia 数据的缺失被视为 pre-foundation 不可靠的历史

2. **迁移窗口**
   - 当 settlement 部署时，打开的 session 在下次转换/心跳时关闭为 segments
   - 没有回溯创建历史 segments 的操作
   - 新的 segments 从部署点开始创建
   - `daily_usage_stats_v1` 从 segents 初始构建（或在迁移窗口期间从 event-log 种子化）

3. **云端迁移**
   - 新的 `POST /device/usage-segments/v1` 和 `POST /device/stats/v1` 端点与旧端点共存
   - 旧统计数据（在旧 `stats` 表中）保留但不再写入
   - 读取时：新 API 查询新表；旧 API 查询旧表
   - 云端 `stats_v1` 可以从 `usage_segments_v1` 重建以进行对账

### 10.2 数据完整性

- 旧 P.xia 云端缺失是已知的并接受为 pre-foundation 状态
- 部署后创建的新 segments 和聚合是完整且可信的
- Cloud aggregate 需要能够从 cloud segments 表重建以进行交叉验证

---

## 11. Read Path

### 11.1 Terminal Display

```
终端 Popup / Admin UI
  → GET_STATS
  → background.js 从 daily_usage_stats_v1 读取（物化视图）
  → 返回 by-domain by-channel by-mode 明细
  → UI 渲染根据当前分类规则动态分类
```

### 11.2 Cloud API Read

```
GET /profiles/:id/stats/v1
  → 从 stats_v1 表读取（或从 usage_segments_v1 实时聚合）
  → 返回原始使用事实 + mode breakdown
  → 客户端/UI 层应用分类规则
```

### 11.3 Cloud Reconciliation

```
GET /profiles/:id/reconcile?date=2026-05-06
  → 从 usage_segments_v1 聚合 by-domain by-channel
  → 与 stats_v1 对比
  → 返回 { matched: true } 或 { mismatches: [...] }
```

---

## 12. Test Matrix

| # | 测试 | 断言 |
|---|------|------|
| T1 | 一个已结算的 segment 恰好增量更新一次聚合 | `daily_usage_stats_v1` / `hourly_usage_stats_v1` 反映准确的增量 |
| T2 | Recovery 不产生重复 segments | 同一个 event-log 关闭只产生一个 segment |
| T3 | 跨日会话拆分为多个 segments | 午夜分割产生两个 by-date segments，parent/part 元数据正确 |
| T4 | event-log 压缩不影响 segments 或聚合 | `usage_segments_v1`、`daily_usage_stats_v1` 和 `hourly_usage_stats_v1` 在压缩后保留完整数据 |
| T5 | Segment 上传是幂等的 | 重复 `POST /device/usage-segments/v1` 不创建重复行 |
| T6 | Cloud aggregate 可以从 cloud segments 对账 | `SUM(segments) WHERE profile+date+domain+channel` 等于 `stats_v1` 值 |
| T7 | active/backgroundMedia/PiP 保持分离 | Duration channels 在本地存储和云端中保持独立 |
| T8 | Mode breakdown 跨 segments 保留 | `mode` 字段在 segment 上传和聚合重建中存活 |
| T9 | 分类在原始统计数据之外派生 | 策略变更修改分类结果而不修改原始统计数据 |
| T10 | 交叉模式 segments 是正确的 | 模式切换产生单独的 segments，各自带有正确的 mode 字段 |
| T11 | 跨小时 segment 不拆事实账本但拆聚合 slice | `usage_segments_v1` 保持单段；`hourly_usage_stats_v1` 多 hourKey 秒数之和等于 segment 秒数 |
| T12 | 媒体小时聚合可从媒体 segments 重建 | `hourly_media_stats_v1` 与 `media_segments_v1` 对账一致 |

---

## 13. Product Owner Decisions（已关闭）

所有决策已于 2026-05-06 由 Product Owner 确认并关闭。详见 `DECISIONS.md:D-029` 和 `DECISIONS.md:D-030`。

| # | 决策点 | 决定 | 状态 |
|---|--------|------|------|
| 1 | `usage_segments_v1` 是核心持久事实账本 | **是**，始终是必需的。之前缺失于文档中，现已添加 | ✅ APPROVED |
| 2 | `daily_usage_stats_v1` / `hourly_usage_stats_v1` 是从 segments 构建的物化聚合 | **是**，不应独立写入 | ✅ APPROVED |
| 3 | 本地保留 365 天 | **是**，适用于 segments 和 aggregates | ✅ APPROVED |
| 4 | 日期键使用本地日历日期 | **是**，包含 timezone/dayStartMs/dayEndMs | ✅ APPROVED |
| 5 | 三个 duration channels 从一开始就支持 | **是**，active/backgroundMedia/PiP | ✅ APPROVED |
| 6 | UI 可以在后续阶段跟进 | **是**，存储和同步先行 | ✅ APPROVED |
| 7 | 不进行 pre-foundation 数据恢复 | **是**，P.xia 缺失是已知的 pre-foundation 状态 | ✅ APPROVED |
| 8 | Segments 在 aggregates 之前上传 | **是**，云端可以从 segments 重建 aggregates | ✅ APPROVED |
| 9 | 初始同步出站脏跟踪 | Segments：segment-id-level；Stats：date-level | ✅ APPROVED |
| 10 | Cloud `usage_segments_v1` 保留 2 年 | **是**，默认 2 年（730 天）；在单独设计和批准之前，不实现自动删除/清理作业 | ✅ APPROVED |
| 11 | Cloud `stats_v1` 保留至少相同期限 | **是**，除非 Product Owner 更改策略，否则保留至少 730 天 | ✅ APPROVED |
| 12 | 非自动云端删除/清理 | **是**，在单独设计和批准之前，不在 scope 内 | ✅ APPROVED |

详见 `DECISIONS.md:D-031`（云端保留策略）。

### 实施阶段

| Phase | 内容 | 顺序 |
|-------|------|------|
| Phase 1 | Terminal settlement：`usage_segments_v1` + `daily_usage_stats_v1` + `hourly_usage_stats_v1`（一起创建） | 1 |
| Phase 2 | Read path：终端 GET_STATS 从 `daily_usage_stats_v1` 读取；小时接口从 `hourly_usage_stats_v1` 读取 | 2 |
| Phase 3 | Segment cloud upload：`POST /device/usage-segments/v1` + `usage_segments_v1` table + `segment_upload_log` | 3 |
| Phase 4 | Aggregate cloud upload：`POST /device/stats/v1` + `stats_v1` upsert + `stats_upload_log` | 4 |
| Phase 5 | Reconciliation tests + regression + docs closeout | 5 |

**实施前置条件**：V1 composite routing 和新 V1 功能延迟，直到 Stats Storage Foundation 在线且经过验证。

---

## 附录 A：当前与目标状态对比

| 方面 | 当前（V0） | 目标（V1） |
|------|-----------|-----------|
| 持久 segment 账本 | 不存在 | `usage_segments_v1`（365 天保留） |
| 本地统计存储 | `event_log_v1`（24 小时保留） | `daily_usage_stats_v1` + `hourly_usage_stats_v1`（365 天保留，来自 segments） |
| Segment 同步 | 不存在 | `segment_sync_outbox_v1` → `POST /device/usage-segments/v1` |
| Stats 同步源 | `getStatsRange(7)` ← `event_log_v1` 聚合 | `daily_usage_stats_v1` / `hourly_usage_stats_v1` 直接读取（来自 segments） |
| Stats 同步状态 | `cloud_pending_stats`（覆盖） | `stats_sync_outbox_v1` / `hourly_stats_sync_outbox_v1`（追踪但不修改统计数据） |
| 云端 segment 表 | 不存在 | `usage_segments_v1`（indexed by profile/date/domain/channel/mode） |
| 云端 stats ingest | `DELETE` + `INSERT`（replace-by-date） | `ON CONFLICT DO UPDATE`（merge-by-domain / hour-domain-channel-mode） |
| 时长通道 | `duration`（合并，部分丢失） | `active_seconds`、`background_media_seconds`、`pip_seconds`（保留） |
| 按模式拆解 | 不存在 | `mode` on segments + `*ByMode` on aggregates |
| 审计日志 | 不存在 | `segment_upload_log`、`stats_upload_log` |
| 云端对账 | 不可能 | `GET /profiles/:id/reconcile?date=X` |

## 附录 B：Cloud Sync 分离与调度策略

### B.1 Sync 子系统分离

Stats Storage Foundation 定义了多个独立的同步子系统。每个子系统独立调度、独立报告成功/失败、独立重试。

| 子系统 | 方向 | 数据 | 保留期限 |
|--------|------|------|---------|
| **Config Pull** | Cloud → Terminal | `guardian_config`（网站列表、配额、规则） | 立即应用 |
| **Quota State Pull** | Cloud → Terminal | `quotaState`（跨设备配额状态） | 每次拉取时更新 |
| **Heartbeat** | Terminal → Cloud | 设备存活信号 | 无数据 |
| **Usage Segment Upload** | Terminal → Cloud | `usage_segments_v1`（逐段持久事实） | segment_sync_outbox_v1 |
| **Daily Stats Upload** | Terminal → Cloud | `stats_v1`（物化每日聚合） | stats_sync_outbox_v1 |
| **Hourly Stats Upload** | Terminal → Cloud | `hourly_stats_v1`（物化小时聚合） | hourly_stats_sync_outbox_v1 |
| **Media Segment Upload** | Terminal → Cloud | `media_segments_v1`（独立媒体逐段事实） | media_segment_sync_outbox_v1 |
| **Daily Media Stats Upload** | Terminal → Cloud | `daily_media_stats_v1`（物化媒体每日聚合） | media_stats_sync_outbox_v1 |
| **Hourly Media Stats Upload** | Terminal → Cloud | `hourly_media_stats_v1`（物化媒体小时聚合） | hourly_media_stats_sync_outbox_v1 |
| **Legacy Stats Upload** | Terminal → Cloud | Old-style `/device/stats` aggregate | 过度期间保留；Phase 3 替换 |

**独立性要求**：
- Config pull 失败不得阻塞 segment/stats 上传。
- Segment/stats 上传失败不得阻塞 config pull。
- Heartbeat 失败不得暗示 stats 上传失败。
- `syncNow()` 可以继续作为编排器存在，但必须返回独立的子结果。

### B.2 推荐的调度节奏

**定时调度**（Chrome Alarms）：

| 子系统 | 默认间隔 | 理由 |
|--------|---------|------|
| Config Pull | 5 分钟 | 家长控制台变更需要在合理时间内到达终端 |
| Quota State Pull | 5 分钟 | 跨设备配额状态需要与 config pull 一起刷新 |
| Heartbeat | 5 分钟 | 在 Cloudflare dash 中保持设备 "last_seen" 为当前时间 |
| Usage Segment Upload | 5 分钟 | 防止本地 outbox 膨胀；低延迟事实同步 |
| Daily Stats Upload | 15 分钟 | 聚合重计算代价更高；低频面 |
| Hourly Stats Upload | 15 分钟 | 小时聚合是报表索引，低频上传即可 |
| Media Segment Upload | 5 分钟 | 防止本地媒体 outbox 膨胀；低延迟事实同步 |
| Daily/Hourly Media Stats Upload | 15 分钟 | 媒体聚合是报表索引，低频上传即可 |
| Legacy `/device/stats` | 15 分钟 | 仅在过渡期间；Phase 3 移除 |

**事件触发**：

Config Pull 触发条件：
- 扩展启动
- 设备绑定成功
- 浏览器重启
- 网络重连
- 手动同步（家长控制台 / admin 面板按钮）

Segment Upload 触发条件：
- dirty outbox 存在
- 新结算后进行 60–120 秒防抖
- 定期 5 分钟上传 alarm

Stats Upload 触发条件：
- 成功上传 segments 后，如果脏日期依然存在
- 成功上传 segments 后，如果脏小时依然存在
- 日界（本地午夜后立即上传前一天的聚合）
- 启动时，如果脏日期依然存在
- 定期 15 分钟上传 alarm

### B.3 成功标准

每个子系统独立定义成功。

**Config Pull 成功**：
- HTTP 2xx 或有效的 "up-to-date" 响应（`version <= localVersion`）
- 响应包含有效的 `data` / `version` 字段
- 本地 config 已保存（或确认不需要更新）
- 规则已应用（`updateDeclarativeRules`）
- 最后 config sync 时间戳已更新

**Segment Upload 成功**：
- 载荷从 `segment_sync_outbox_v1` 构建
- 远端幂等地接受 segment IDs
- 仅被接受的 IDs 标记为已上传（`markUsageSegmentsUploaded`）
- 失败的 IDs 保留在 dirty outbox 中
- 重试元数据（retryCount、lastError）被保留

**Stats Upload 成功**：
- 载荷从 `daily_usage_stats_v1` 构建
- 远端按 profile/date/domain 覆盖
- 仅确认的日期从 `stats_sync_outbox_v1` 中清除（`markDailyStatsUploaded`）
- `daily_usage_stats_v1` 在上传成功后**绝不**删除 — 仅清除 outbox 状态

**Hourly Stats Upload 成功**：
- 载荷从 `hourly_usage_stats_v1` 或 `hourly_media_stats_v1` 构建
- 远端按 profile/device/hour/domain/channel/mode 或 profile/device/hour/domain/mediaClass/mode upsert
- 仅确认的小时 key 从对应 outbox 中清除
- 小时聚合源数据在上传成功后**绝不**删除 — 仅清除 outbox 状态

**关键**：同步成功意味着远端**事实性地接受**了本地事实（幂等），而不仅仅是发起了一次尝试。HTTP 200 不代表持久化。

### B.4 重试与失败策略

**请求超时与同步锁**：
- 所有通过 `cloudRequest()` 发起的云端请求必须设置 AbortController 超时；当前默认 `REQUEST_TIMEOUT_MS = 15000`。
- `syncNow()` 使用 `syncState.isSyncing` 防止重入，但必须记录 `syncStartedAt`。
- 如果 `isSyncing` 持续超过 `SYNC_STALE_LOCK_MS`（当前 2 分钟），视为 stale lock，允许自动释放并继续下一次同步。
- 设计目标：网络层、Worker、DNS、代理或 Chrome fetch 卡住时，最多造成一次同步失败，不得让绑定、手动同步或后续 alarm 失效数小时。

**可重试**：
- 网络超时
- HTTP 5xx
- HTTP 429 (Rate Limited)
- 临时 fetch 失败（ERR_CONNECTION_REFUSED、ERR_NETWORK_CHANGED）

可重试时的行为：
- 保留 dirty state
- 递增 retryCount
- 记录 lastAttemptAt 和 lastError
- 使用指数退避：1 分钟 → 5 分钟 → 15 分钟 → 30 分钟 → 60 分钟（上限）

**不可重试 / 已阻塞**：
- HTTP 401: 无效的 device_token
- HTTP 403: 设备未授权
- HTTP 400: 模式不匹配 / 载荷损坏
- 版本不匹配（响应指示模式版本过旧 / 不兼容）

不可重试时的行为：
- 不清除 outbox
- 标记子系统为已阻塞
- 停止对该端点的重试
- 等待重新绑定、配置修复或代码/模式更新
- 家长控制台可显示同步状态为 "blocked"

### B.5 Sync 状态模型

每个子系统独立报告状态：

| 状态 | Segment Upload | Stats Upload | Config Pull |
|------|---------------|-------------|-------------|
| **Healthy** | pendingCount = 0，最近上传无错误 | pendingDates = 0，最近上传无错误 | config up-to-date 或已成功拉取 |
| **Partial** | 上传成功，但 stats 上传失败 | 上传成功，但 segments 仍然 pending | — |
| **Blocked** | 4xx 错误、模式不匹配、3 次以上连续失败 | 同左 | 401 无效 token、模式不匹配 |
| **Unbound** | 缺少 device_token 或 profile_id | 同左 | 同左 |

全局同步状态：

| 状态 | 含义 |
|------|------|
| **Healthy** | 所有子系统报告 Healthy |
| **Partial** | 至少一个子系统是 Partial，没有子系统是 Blocked |
| **Blocked** | 至少一个子系统是 Blocked |
| **Unbound** | 设备未绑定或 token 不存在 |

### B.6 Legacy Sync Boundary（过渡）

**旧版 `uploadStats()`**：
- 保持在 `infra/cloud-sync.js` 中
- 临时兼容性路径 — 不是 Stats Foundation 的事实源
- 上传 active aggregate 仅（无 backgroundMedia、无 PiP、无 segments）
- 从 `daily_usage_stats_v1` 读取（Phase 1C 迁移）
- 在过渡期间，每 15 分钟用 legacy alarm 定时上传
- **Phase 3 关键要求**：legacy `/device/stats` 必须改为安全的 upsert，且不得按 date-level DELETE

**旧版 `/device/sessions/upload`**：
- 保持在 `workers/src/routes/sessions.ts` 中
- 旧版 R2 archive — 不是 Stats Foundation segment API
- Phase 3 引入的 `POST /device/usage-segments/v1` 是新的 segment API

### B.7 Phase Boundary

- 本文档任务冻结了终端 ↔ 云端同步机制契约
- 不在此任务中实现云端 API
- 云端实现从 Phase 3 开始
- Phase 2B 提供的终端编排函数（`uploadUsageSegmentsV1`、`uploadDailyStatsV1`、`syncStatsFoundationV1`）在 `enabled = false` 时已准备就绪，等待 Phase 3 在 `enabled = true` 时激活

## 附录 C：Phase 3 Cloud 实施计划

### C.1 当前云端架构摘要

**路由分派**（`workers/src/index.ts:167-209`）:
```
/auth/*             → authRouter
/profiles/:id/stats → statsRouter (GET: account_token, POST: device_token)
/device/stats       → statsRouter (POST: device_token)
/device/sessions    → sessionsRouter (R2 upload)
/device/events      → eventsRouter (email notifications only)
```

**鉴权模式**:
- `/device/*` (POST): `device_token` → 查询 `devices` → `profile_id`
- `/profiles/:id/*` (GET): JWT `account_token` → `account_id` → 验证 profile 所有权

**当前 `stats` 表** (`workers/schema.sql:37-45`):
```sql
CREATE TABLE stats (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  profile_id TEXT NOT NULL, date TEXT NOT NULL,
  domain TEXT NOT NULL, duration INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
```
- 单列 `duration` — 没有 channel / mode 区分
- `POST /device/stats` 按 `(profile_id, date)` DELETE + INSERT

### C.2 当前旧版 Stats 风险摘要

| 风险 | 严重程度 | 位置 |
|------|---------|------|
| date-level DELETE + INSERT 在部分 payload 时丢失域名 | **P0** | `stats.ts:44-46` |
| 单一 `duration` 无法区分 active/backgroundMedia/PiP | **P0** | 旧版 `stats` schema |
| R2 `/device/sessions/upload` 不是 segment API | **P2** | `sessions.ts` |
| `composite_sessions` 仅用于复合审核 — 不是通用 segments | **P2** | schema |

### C.3 提议的 D1 Schema

#### Migration 004: `usage_segments_v1`

```sql
CREATE TABLE usage_segments_v1 (
  id                  TEXT PRIMARY KEY,
  profile_id          TEXT NOT NULL,
  device_id           TEXT,
  date                TEXT NOT NULL,
  timezone            TEXT NOT NULL DEFAULT 'Asia/Shanghai',
  day_start_ms        INTEGER NOT NULL,
  day_end_ms          INTEGER NOT NULL,
  start_ms            INTEGER NOT NULL,
  end_ms              INTEGER NOT NULL,
  duration_seconds    INTEGER NOT NULL,
  domain              TEXT NOT NULL,
  channel             TEXT NOT NULL,
  mode                TEXT NOT NULL,
  source_state        TEXT NOT NULL,
  settlement_reason   TEXT NOT NULL,
  parent_segment_id   TEXT,
  part_index          INTEGER NOT NULL DEFAULT 1,
  part_count          INTEGER NOT NULL DEFAULT 1,
  created_at          INTEGER NOT NULL,
  uploaded_at         INTEGER,
  FOREIGN KEY (profile_id) REFERENCES profiles(id)
);

CREATE INDEX idx_usegs_profile_date ON usage_segments_v1 (profile_id, date);
CREATE INDEX idx_usegs_profile_date_domain ON usage_segments_v1 (profile_id, date, domain);
```

#### Migration 005: `stats_v1`

```sql
CREATE TABLE stats_v1 (
  id                        TEXT PRIMARY KEY,
  profile_id                TEXT NOT NULL,
  date                      TEXT NOT NULL,
  domain                    TEXT NOT NULL,
  active_seconds            INTEGER NOT NULL DEFAULT 0,
  background_media_seconds  INTEGER NOT NULL DEFAULT 0,
  pip_seconds               INTEGER NOT NULL DEFAULT 0,
  active_by_mode            TEXT NOT NULL DEFAULT '{}',
  background_media_by_mode  TEXT NOT NULL DEFAULT '{}',
  pip_by_mode               TEXT NOT NULL DEFAULT '{}',
  segments_count            INTEGER NOT NULL DEFAULT 0,
  last_segment_id           TEXT,
  first_seen_at             INTEGER NOT NULL,
  last_seen_at              INTEGER NOT NULL,
  updated_at                INTEGER NOT NULL,
  FOREIGN KEY (profile_id) REFERENCES profiles(id),
  UNIQUE (profile_id, date, domain)
);

CREATE INDEX idx_stats_v1_pd ON stats_v1 (profile_id, date);
```

#### Migration 006: Audit logs

```sql
CREATE TABLE segment_upload_log (
  id TEXT PRIMARY KEY, profile_id TEXT NOT NULL, device_id TEXT NOT NULL,
  segment_count INTEGER NOT NULL, duration_total INTEGER NOT NULL,
  payload_hash TEXT NOT NULL, inserted_count INTEGER NOT NULL DEFAULT 0,
  updated_count INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL
);

CREATE TABLE stats_upload_log (
  id TEXT PRIMARY KEY, profile_id TEXT NOT NULL, device_id TEXT NOT NULL,
  date TEXT NOT NULL, domain_count INTEGER NOT NULL, channel_count INTEGER NOT NULL,
  duration_total INTEGER NOT NULL, payload_hash TEXT NOT NULL,
  inserted_count INTEGER NOT NULL DEFAULT 0, updated_count INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
```

### C.4 提议的端点契约

| 端点 | 方法 | 鉴权 | 幂等性 |
|------|------|------|--------|
| `/device/usage-segments/v1` | POST | device_token | `ON CONFLICT(id) DO UPDATE` |
| `/device/stats/v1` | POST | device_token | `ON CONFLICT(profile_id, date, domain) DO UPDATE` |
| `/profiles/:id/stats/v1` | GET | account_token (JWT) | 只读 |

**Segment 上传载荷**: `{ segments: [{ id, date, timezone, dayStartMs, dayEndMs, startMs, endMs, durationSeconds, domain, channel, mode, sourceState, settlementReason, parentSegmentId, partIndex, partCount, createdAt, updatedAt }] }`

**Stats 上传载荷**: `{ date, timezone, dayStartMs, dayEndMs, domains: [{ domain, activeSeconds, backgroundMediaSeconds, pipSeconds, activeByMode, backgroundMediaByMode, pipByMode, firstSeenAt, lastSeenAt, lastUpdatedAt }] }`

### C.5 提议的旧版兼容性补丁

**`workers/src/routes/stats.ts` — `POST /device/stats`**:
将 `DELETE FROM stats WHERE profile_id = ? AND date = ?` 替换为每域名 INSERT/UPDATE（逐行 upsert）。部分 domain 重复上传时保留旧 domain。

**`workers/src/index.ts`**:
在现有 `startsWith('/device/stats')` 匹配之上添加 v1 路由分派（更具体的路径必须在通用路径匹配之前进行）。

### C.6 提议的测试矩阵

| # | 测试 | 端点 |
|---|------|------|
| T-C1 | 插入单个 segment | `POST /device/usage-segments/v1` |
| T-C2 | 重复 segment 上传是幂等的 | 同上 |
| T-C3 | 拒绝无效载荷 | 同上 |
| T-C4 | 无效 token → 401 | 同上 |
| T-C5 | 创建/更新 aggregate | `POST /device/stats/v1` |
| T-C6 | 部分上传时保留缺失的 domain | 同上 |
| T-C7 | 幂等 `ON CONFLICT DO UPDATE` | 同上 |
| T-C8 | 多日 stats 读取 | `GET /profiles/:id/stats/v1` |
| T-C9 | 错误 account_id → 403 | 同上 |
| T-C10 | by-mode 拆解正确 | 同上 |
| T-C11 | 旧版 stats 不做 date DELETE | `POST /device/stats` |
| T-C12 | 旧版 stats 部分上传时保留旧 domain | 同上 |
| T-C13 | Segment audit log 插入 | Audit |
| T-C14 | Stats audit log 插入 | Audit |

### C.7 实施顺序

| 顺序 | 任务 | 文件 |
|------|------|------|
| 1 | Migration 004 (`usage_segments_v1`) | `workers/migrations/004_usage_segments_v1.sql` |
| 2 | Migration 005 (`stats_v1`) | `workers/migrations/005_stats_v1.sql` |
| 3 | Migration 006 (audit logs) | `workers/migrations/006_audit_logs.sql` |
| 4 | 实现 statsRouter v1 端点方法 | `workers/src/routes/stats.ts` |
| 5 | 在 index.ts 中添加 v1 路由分派 | `workers/src/index.ts` |
| 6 | 修补旧版 POST /device/stats（移除 DELETE） | `workers/src/routes/stats.ts` |
| 7 | 部署迁移 + Worker | `wrangler d1 execute` + `wrangler deploy` |
| 8 | 将终端 `enabled` 设置为 `true` | `infra/cloud-sync.js` + `background.js` |
| 9 | 添加 API 集成测试 | `tests/api/` |
| 10 | 对账验证 | 手动 / E2E |

### C.8 风险和未决问题

| # | 风险 | 缓解措施 |
|---|------|---------|
| 1 | 旧版 `stats` 表缺少 `(profile_id, date, domain)` UNIQUE 约束 | 在修补旧版 DELETE 之前添加唯一索引或去重 |
| 2 | `startsWith('/device/stats')` 可能匹配 v1 路由 | 在通用匹配行之前添加精确匹配 |
| 3 | `usage_segments_v1` 可能增长到数百万行 | 按日期索引分区；未来定期清理作业 |
| 4 | `channel` 没有 SQL CHECK 约束 | 在应用层验证；考虑添加 CHECK 约束 |
| 5 | D1 100 行绑定限制 | 每批最多 100 个 segments |

### C.9 Phase 3 Cloud 验证状态（已完成）

**Worker**: `https://guardian-api.william-xia-cn.workers.dev` (Version: `8dd7171e-026e-48d7-85d2-ba0329c31452`)
**D1**: `guardian-db` (5fa9f14b-9242-4996-96ed-35dd3024ba59)
**日期**: 2026-05-06

| # | 验证项 | 端点/查询 | 状态 |
|---|--------|---------|------|
| 1 | 迁移已应用到 remote D1 | `wrangler d1 execute --remote --file=004/005/006` | ✅ 3 tables + indexes |
| 2 | Worker 已部署 v1 routes | `wrangler deploy` → Version `8dd7171e` | ✅ |
| 3 | Segment write | `POST /device/usage-segments/v1` | ✅ inserted=1 |
| 4 | Segment idempotency | 同一 POST 重复执行 | ✅ inserted=0, updated=1 |
| 5 | Stats v1 write (byMode expansion) | `POST /device/stats/v1` | ✅ expandedRows=2 |
| 6 | Stats v1 idempotency | 同一 POST 重复执行 | ✅ upsert confirmed |
| 7 | Audit log — segment | `SELECT COUNT(*) FROM segment_upload_log` | ✅ 4 rows |
| 8 | Audit log — stats | `SELECT COUNT(*) FROM stats_upload_log` | ✅ 4 rows |
| 9 | Legacy `/device/stats` safety | Upload `{a,b}` then `{a}` | ✅ `b` 已保留 |
| 10 | Legacy `stats` table intact | `SELECT COUNT(*) FROM stats` | ✅ 75 rows |
| 11 | Real terminal v1 sync roundtrip | `sync-roundtrip-standalone.mjs` | ✅ segments + stats written, outbox cleared |
| 12 | Account-token read | `GET /profiles/:id/stats/v1` | ✅ 200 with full v1 fields |
| 13 | Auth rejection (no token) | 同上 | ✅ 401 |
| 14 | Auth rejection (invalid token) | 同上 | ✅ 401 |
| 15 | Ownership enforcement | Read non-owner profile | ✅ 404 |

**约束确认**:
- v1 同步默认禁用：`statsFoundationV1SyncEnabled = false`；生产环境中未调用 `setStatsFoundationV1SyncEnabled(true)`
- 未进行历史数据重建
- 未添加清理/保留删除作业
- 未修改 Bilibili 分类
- P.xia 包含验证测试行（domain: `validate-seg.com`, `roundtrip-*.com`, `rt-*.com`, `readtest.com`）— 这些是验证产物，非真实浏览数据

### C.10 受控上线计划

**Step 1**: 为单个测试 device/profile 启用 v1 同步
  - 仅在测试环境中调用 `setStatsFoundationV1SyncEnabled(true)`
  - 验证 segment/stats 行已写入云端并在 24 小时后清除 outbox

**Step 2**: 同一周期比较 legacy stats 与 stats_v1
  - 确认 stats_v1 `duration_seconds` 的求和与 legacy `stats.duration` 匹配

**Step 3**: 监控同步状态
  - 检查 `segment_upload_log` 和 `stats_upload_log` 中是否有错误
  - 验证重试计数未无限制增长
  - 确认 outbox 的 pendingCount 在每次 sync 循环后归零

**Step 4**: PO 批准更广泛的上线
  - PO 审查验证结果
  - 如果所有指标正常，则按受控计划逐步为更多 profiles/devices 启用

**Step 5**: 上线后监控
  - 在初始上线后的头 72 小时内持续监控

### C.11 明确的 No-Go 条件

出现以下任一情况时不得上线或必须回滚：

| # | 条件 | 阈值 |
|---|------|------|
| 1 | 端点 4xx/5xx 激增 | 任何 v1 端点的错误率 > 5% |
| 2 | Outbox 未清除 | pendingCount 在 3 个连续 sync 循环后未归零 |
| 3 | 重复 segment 增长 | `usage_segments_v1` 行数在重新上传同一日期时增长 |
| 4 | stats_v1 差异 | `SUM(stats_v1.duration_seconds)` 与本地 `daily_usage_stats_v1` 之间的差异 > 5% |
| 5 | Legacy stats 回归 | Legacy `stats` 表中的域名在部分上传后消失 |
| 6 | Auth/read 失败 | 任何 v1 读取端点的错误率 > 0% |

### C.12 上线状态（V1-minimal 更新）

| 方面 | 状态 |
|------|------|
| Terminal settlement (Phase 1) | ✅ 已完成 |
| Read path migration (Phase 2) | ✅ 已完成 |
| Cloud infrastructure (Phase 3) | ✅ 已完成并已验证 |
| Outbox + payload builders (Phase 2A) | ✅ 已完成 |
| Legacy stats safety (Phase 3D-1) | ✅ 已完成 |
| Controlled roundtrip (Phase 3F-R) | ✅ 已完成 |
| Account-token read (Phase 3F-S) | ✅ 已完成 |
| **Production/default v1 sync** | **✅ ENABLED for V1-minimal gate** |
| **Controlled rollout approved** | **✅ 已进入 V1-minimal 最小发布路径（legacy 非 truth）** |

### C.13 V1-minimal Cloud Stats v1 minimal sync gate（2026-05-08）

1. `syncNow()` 在监控开启时优先走 `syncStatsFoundationV1(enabled=true)`，将 `usage_segments_v1` 与 `stats_v1` 作为主动同步路径。
2. legacy `/device/stats` 上传路径保留兼容，但不再作为 V1-minimal active stats truth path。
3. 本地新增持久 gate：`statsFoundationV1SyncEnabled`（默认 `true`，可在本地显式关闭）。
4. 本地新增 v1 同步状态键：`cloud_v1_last_sync_at`、`cloud_v1_last_sync_error`、`cloud_v1_last_segment_upload_at`、`cloud_v1_last_stats_upload_at`。
5. `cloud_device_id` 通过 bind/config 响应进入本地持久化链路；缺失时云端仍可由 token 侧解析 device_id，保持幂等上传。

## 附录 D：参考

- `docs/DESIGN.md` §1.3.7 — 原始用量统计与分类解释分离原则
- `SITE_ACCESS_POLICY.md` — 五类网站分类规则
- `core/event-log.js` — 当前 event-log 实现（24 小时窗口）
- `infra/cloud-sync.js` — 当前 `uploadStats()` 和 `getStatsRange()` 用法
- `workers/src/routes/stats.ts` — 当前 Worker stats ingest（date-level DELETE + INSERT）
- `workers/src/routes/sessions.ts` — 当前 R2 sessions 上传（未索引，非 segment-level）
- `workers/src/routes/compositeSessions.ts` — Composite-only session 上传（非通用）
