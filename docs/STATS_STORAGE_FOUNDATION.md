# Stats Storage Foundation（V1 用量统计存储基础架构）

版本：V1 Draft（Revised — `usage_segments_v1` core）
状态：设计文档（未实现）
关联：`docs/DESIGN.md` §1.3.7 原始用量统计与分类解释分离原则
日期：2026-05-06（Revised 2026-05-06）

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

### 2.1 四层区分

| 层 | 内容 | 存储位置 | 可变性 |
|---|------|---------|--------|
| **已结算用量分段（Settled Usage Segments）** | 逐段事实：domain、channel、mode、start/end、duration | `usage_segments_v1` | 不可变（append-only） |
| **原始用量事实（Raw Usage Facts）** | 每日聚合：by-domain by-channel by-mode 汇总 | `daily_usage_stats_v1`（物化视图） | 不可变（从 segments 构建） |
| **模式上下文（Mode Context）** | 该用量发生在哪个模式下 | `usage_segments_v1` + `daily_usage_stats_v1` | 不可变 |
| **分类/报表解释（Classification / Report Interpretation）** | 学习时间/休息时间/待定时间/拦截/借用/允许 | 读取时动态计算 | 随策略变更而变 |

> 引用自 `docs/DESIGN.md` §1.3.7.1

### 2.2 `usage_segments_v1` 是核心持久事实账本（Core Durable Fact Ledger）

- `usage_segments_v1` 是已完成持续时间的**唯一持久事实源**
- 记录每次使用会话的完整持续时间，并按自然日边界分割
- 每个 segment 是不可变的：一旦写入，永远不修改
- `daily_usage_stats_v1` 是从 segments 构建的**物化聚合**，不应独立写入
- 云同步先上传 segments，然后可以从云端 segments 派生/对账聚合数据

### 2.3 这些存储禁止包含的内容

- 网站分类标签（study site / composite site / restricted / blocked）
- 策略决策（allowed / blocked / borrow / temporary composite）
- 解释性报表时间类型（学习时间 / 休息时间 / 待定时间）
- AI 分类结果或内容级判断

### 2.4 `event_log_v1` 不是持久统计存储

- `event_log_v1` 是短期恢复/调试追踪（24 小时保留）
- 它既不是持久的逐段记录，也不是每日聚合存储
- 统计数据必须持久化到 `usage_segments_v1` 和 `daily_usage_stats_v1`

---

## 3. Target Terminal Storage Model

终端扩展使用以下存储键：

| 存储 | 键 | 用途 | 保留 | 可变性 |
|------|---|------|------|--------|
| `session_v1` | `session_v1` | 当前状态（state、domain、startTime、lastHeartbeat）| 仅当前 | 可变，恢复时使用 |
| `event_log_v1` | `event_log_v1` | 短期恢复/调试追踪（START/END 事件）| 24 小时 | Append-only，压缩时删除旧数据 |
| **`usage_segments_v1`** | **`usage_segments_v1`** | **持久化已结算逐段账本（核心事实源）** | **365 天** | **Append-only，永远不删除** |
| `daily_usage_stats_v1` | `daily_usage_stats_v1` | 从 segments 构建的物化每日聚合 | **365 天** | 从 segments 重建，可替换 |
| `segment_sync_outbox_v1` | `segment_sync_outbox_v1` | 逐段上传/重试状态 | 直到上传成功 | 可变，上传成功时清除 |
| `stats_sync_outbox_v1` | `stats_sync_outbox_v1` | 聚合上传/重试状态 | 直到上传成功 | 可变，上传成功时清除 |

### 3.1 结算路径（Settlement Path）

```
transitionState / heartbeat close
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
         ├──→ 标记 segment_sync_outbox_v1 脏
         │
         ├──→ 标记 stats_sync_outbox_v1 脏
         │
         └──→ (可选) 追加 event_log_v1 trace
```

#### 3.1.1 周期性 Checkpoint（终端本地）

- 终端后台新增 `periodicCheckpoint` alarm，间隔 3 分钟。
- 触发条件：monitoring 启用、存在 open counted session、`now - session.startTime >= 3 分钟`、且 session 非 stale。
- 执行行为：调用与普通结算一致的 durable flush 流程，`settlementReason = periodic_checkpoint`，写入 `usage_segments_v1`，更新 `daily_usage_stats_v1`，并标记 segment/stats outbox dirty，然后从当前 `state/domain/mode` 重新打开 session。
- `ui_flush` 的 30 秒 guard 仅作用于 `reason === ui_flush`，不影响 `periodic_checkpoint`、tab switch、mode switch、tab close、monitoring off、recovery 等非 `ui_flush` 结算路径。

### 3.2 存储交互

```
session_v1 ──(state close)──→ usage_segments_v1 ──→ daily_usage_stats_v1
                                    │                        │
                        (uplSessionUpload) ▼   (uploadStats)  ▼
                    segment_sync_outbox_v1         stats_sync_outbox_v1
                                    │                        │
                                    ▼                        ▼
                           Cloud usage_segments_v1    Cloud stats_v1
```

- `uploadSessionUpload()` 从 `segment_sync_outbox_v1` 读取，上传到云端
- `uploadStats()` 从 `stats_sync_outbox_v1` 读取，上传到云端（或可以从云端 segments 重建以进行对账）
- `event_log_v1` 不再直接用于上传或聚合

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
| `mode` | string | ✅ | `study` / `rest` / `paused` / `unknown` / `composite` |
| `sourceState` | string | ✅ | 产生该 segment 的原始 STATE_WEIGHTS 状态（`ACTIVE` / `BACKGROUND_ACTIVE` / `PIP_ACTIVE`）|

#### 结算元数据

| 字段 | 类型 | 必须 | 描述 |
|------|------|------|------|
| `settlementReason` | string | ✅ | 为什么关闭：`transition_complete` / `session_expired` / `cross_day_boundary` / `mode_switch` / `recovery_gap_close` / `monitoring_disabled` |
| `parentSegmentId` | string｜null | ❌ | 如果该 segment 是较大 segment 的分割部分，则为父 segment 的 ID |
| `partIndex` | number | ✅ | 如果分割，则为 1-based 索引（用于对穿越午夜的 segments） |
| `partCount` | number | ✅ | 原始较大 segment 的总部分数 |
| `createdAt` | number | ✅ | Segment 创建 epoch ms |
| `uploadedAt` | number｜null | ❌ | Segment 上传到云端的 epoch ms（或 null） |

### 4.3 结算规则

1. **每次使用会话关闭时创建一个 segment**：当 transitionState 关闭一个打开的 segment 时，立即创建一个 `usage_segment`
2. **按自然日拆分**：跨越午夜的 segments 按本地自然日边界分割。每个 split 部分有自己的 segment ID，将原 ID 作为 `parentSegmentId` 引用
3. **按模式拆分**：如果使用过程中模式切换，旧模式 segment 在切换时关闭；新模式的新 segment 开始
4. **恢复处理**：SW 恢复期间通过 `settlementReason = "recovery_gap_close"` 关闭的 segments 与其他 segments 处理方式相同
5. **永不删除**：Segments 是 append-only 的。旧的 `usage_segments_v1` 条目在 365 天后清理，而不是在 24 小时后删除
6. **幂等结算**：同一个 event-log 关闭不能产生重复的 segments

---

## 5. `daily_usage_stats_v1` Schema（物化聚合）

### 5.1 存储键

```
daily_usage_stats_v1 (chrome.storage.local)
```

与之前相同的 schema（§4 of original），但现在明确定义为从 `usage_segments_v1` 构建的**物化视图**：

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
        "activeByMode": { "study": 0, "rest": 1800, "paused": 0, "unknown": 0 },
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
3. **`segmentsCount` 跟踪**：确保重建与增量更新匹配
4. **保留 365 天**，与 `usage_segments_v1` 保留期匹配

---

## 6. 与现有系统的关系

### 6.1 `event_log_v1` → 不替代

- `event_log_v1` 保留用于短期恢复/调试追踪
- 它不能替代 `usage_segments_v1`（没有 segment ID、24 小时保留、没有 mode、没有稳定的 settlement）
- 它不能替代 `daily_usage_stats_v1`（压缩后消失）

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

### 7.2 Aggregate Upload — `uploadStats()`

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

### 7.3 同步规则

1. Segments 在 aggregates 之前上传（cloud 可以从 segments 重建 aggregates）
2. `segment_sync_outbox_v1` 跟踪脏 segment IDs
3. `stats_sync_outbox_v1` 跟踪脏日期
4. 上传成功后清除出站状态；源数据（segments/aggregates）保留完整
5. 有效载荷中缺失的数据不暗示删除
6. 云端使用 upsert 进行 idempotent ingest

---

## 8. Cloud Ingest Contract

### 8.1 Segment Upload: `POST /device/usage-segments/v1`

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
  mode                TEXT NOT NULL,      -- study / rest / paused / unknown / composite
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

### 8.4 Cloud Ingest Rules

1. **不允许 date-level replace**
2. Segments：使用 `ON CONFLICT (id) DO UPDATE` — idempotent；重复 segment ID 不创建新行
3. Stats：使用 `ON CONFLICT (profile_id, date, domain) DO UPDATE` — 合并 by-domain
4. 当前有效载荷中缺失的数据不暗示删除
5. 所有三个 duration channels + by-mode 按模式拆解从一开始就支持
6. Cloud audit log（`segment_upload_log`、`stats_upload_log`）跟踪每次上传操作

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
| T1 | 一个已结算的 segment 恰好增量更新一次聚合 | `daily_usage_stats_v1` 反映准确的增量 |
| T2 | Recovery 不产生重复 segments | 同一个 event-log 关闭只产生一个 segment |
| T3 | 跨日会话拆分为多个 segments | 午夜分割产生两个 by-date segments，parent/part 元数据正确 |
| T4 | event-log 压缩不影响 segments 或聚合 | `usage_segments_v1` 和 `daily_usage_stats_v1` 在压缩后保留完整数据 |
| T5 | Segment 上传是幂等的 | 重复 `POST /device/usage-segments/v1` 不创建重复行 |
| T6 | Cloud aggregate 可以从 cloud segments 对账 | `SUM(segments) WHERE profile+date+domain+channel` 等于 `stats_v1` 值 |
| T7 | active/backgroundMedia/PiP 保持分离 | Duration channels 在本地存储和云端中保持独立 |
| T8 | Mode breakdown 跨 segments 保留 | `mode` 字段在 segment 上传和聚合重建中存活 |
| T9 | 分类在原始统计数据之外派生 | 策略变更修改分类结果而不修改原始统计数据 |
| T10 | 交叉模式 segments 是正确的 | 模式切换产生单独的 segments，各自带有正确的 mode 字段 |

---

## 13. Product Owner Decisions（已关闭）

所有决策已于 2026-05-06 由 Product Owner 确认并关闭。详见 `DECISIONS.md:D-029` 和 `DECISIONS.md:D-030`。

| # | 决策点 | 决定 | 状态 |
|---|--------|------|------|
| 1 | `usage_segments_v1` 是核心持久事实账本 | **是**，始终是必需的。之前缺失于文档中，现已添加 | ✅ APPROVED |
| 2 | `daily_usage_stats_v1` 是从 segments 构建的物化聚合 | **是**，不应独立写入 | ✅ APPROVED |
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
| Phase 1 | Terminal settlement：`usage_segments_v1` + `daily_usage_stats_v1`（一起创建） | 1 |
| Phase 2 | Read path：终端 GET_STATS 从 `daily_usage_stats_v1` 读取 | 2 |
| Phase 3 | Segment cloud upload：`POST /device/usage-segments/v1` + `usage_segments_v1` table + `segment_upload_log` | 3 |
| Phase 4 | Aggregate cloud upload：`POST /device/stats/v1` + `stats_v1` upsert + `stats_upload_log` | 4 |
| Phase 5 | Reconciliation tests + regression + docs closeout | 5 |

**实施前置条件**：V1 composite routing 和新 V1 功能延迟，直到 Stats Storage Foundation 在线且经过验证。

---

## 附录 A：当前与目标状态对比

| 方面 | 当前（V0） | 目标（V1） |
|------|-----------|-----------|
| 持久 segment 账本 | 不存在 | `usage_segments_v1`（365 天保留） |
| 本地统计存储 | `event_log_v1`（24 小时保留） | `daily_usage_stats_v1`（365 天保留，来自 segments） |
| Segment 同步 | 不存在 | `segment_sync_outbox_v1` → `POST /device/usage-segments/v1` |
| Stats 同步源 | `getStatsRange(7)` ← `event_log_v1` 聚合 | `daily_usage_stats_v1` 直接读取（来自 segments） |
| Stats 同步状态 | `cloud_pending_stats`（覆盖） | `stats_sync_outbox_v1`（追踪但不修改统计数据） |
| 云端 segment 表 | 不存在 | `usage_segments_v1`（indexed by profile/date/domain/channel/mode） |
| 云端 stats ingest | `DELETE` + `INSERT`（replace-by-date） | `ON CONFLICT DO UPDATE`（merge-by-domain） |
| 时长通道 | `duration`（合并，部分丢失） | `active_seconds`、`background_media_seconds`、`pip_seconds`（保留） |
| 按模式拆解 | 不存在 | `mode` on segments + `*ByMode` on aggregates |
| 审计日志 | 不存在 | `segment_upload_log`、`stats_upload_log` |
| 云端对账 | 不可能 | `GET /profiles/:id/reconcile?date=X` |

## 附录 B：Cloud Sync 分离与调度策略

### B.1 Sync 子系统分离

Stats Storage Foundation 定义了六个独立的同步子系统。每个子系统独立调度、独立报告成功/失败、独立重试。

| 子系统 | 方向 | 数据 | 保留期限 |
|--------|------|------|---------|
| **Config Pull** | Cloud → Terminal | `guardian_config`（网站列表、配额、规则） | 立即应用 |
| **Quota State Pull** | Cloud → Terminal | `quotaState`（跨设备配额状态） | 每次拉取时更新 |
| **Heartbeat** | Terminal → Cloud | 设备存活信号 | 无数据 |
| **Usage Segment Upload** | Terminal → Cloud | `usage_segments_v1`（逐段持久事实） | segment_sync_outbox_v1 |
| **Daily Stats Upload** | Terminal → Cloud | `stats_v1`（物化每日聚合） | stats_sync_outbox_v1 |
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

**关键**：同步成功意味着远端**事实性地接受**了本地事实（幂等），而不仅仅是发起了一次尝试。HTTP 200 不代表持久化。

### B.4 重试与失败策略

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
