# TimeOnChrome — 技术设计文档

版本：1.7.2
更新：2026-04-24

---

## 1. 架构概览

### 1.1 系统架构

```
┌─────────────────────────────────────────────────────────────┐
│  Chrome Extension (MV3)                                     │
│                                                             │
│  ┌─────────────┐    ┌──────────────┐    ┌───────────────┐  │
│  │  popup.html │    │  admin.html  │    │ reminder.html │  │
│  │  popup.js   │    │  admin.js    │    │ reminder.js   │  │
│  └──────┬──────┘    └──────┬───────┘    └──────┬────────┘  │
│         │                 │ sendMessage         │           │
│         └─────────────────┼─────────────────────┘           │
│                           ▼                                 │
│  ┌────────────────────────────────────────────────────┐     │
│  │           background.js (Service Worker)           │     │
│  │  - 模块化架构 (ES Module)                           │     │
│  │  - 事件驱动注意力引擎 (Event-Driven Attention)      │     │
│  │  - 信号 → 上下文 → 状态 → 会话 → 决策               │     │
│  │  - SW 重启恢复 (Recovery)                           │     │
│  │  - 云同步 (只读拉取)                                │     │
│  └────────────────────────────────────────────────────┘     │
│         ▲                                                   │
│         │ sendMessage (HEARTBEAT / 信号事件)                │
│  ┌──────┴──────────────────────────┐                        │
│  │  content.js（每个 Tab 注入）     │                        │
│  │  - 用户交互检测（鼠标/键盘）     │                        │
│  │  - 媒体播放检测（AudioContext）  │                        │
│  │  - 心跳发送（每 10 秒）          │                        │
│  │  - 时间覆盖层提示                │                        │
│  └─────────────────────────────────┘                        │
└─────────────────────────────────────────────────────────────┘
                         │ HTTPS
                         ▼
┌─────────────────────────────────────────────────────────────┐
│  Cloudflare Workers (guardian-api)                         │
│                                                             │
│  Routes:                                                    │
│  POST /auth/register         账号注册                       │
│  POST /auth/login            登录，返回 JWT                  │
│  GET/PUT /device/config      配置同步                        │
│  GET /device/quota-state     跨设备配额汇总                   │
│  GET /device/changelog       配置变更日志                     │
│  POST /device/events         事件上报（含邮件通知）           │
│  POST /device/sessions/upload  会话上传 → R2               │
│  GET /profiles/:id/devices   设备列表                        │
│  GET/POST /composite-sessions  待定会话审核                  │
│                                                             │
│  Storage:                                                   │
│  D1 (guardian-db)    账号/设备/配置/统计                     │
│  KV (CONFIG_CACHE)   邮件去重、配置缓存                      │
│  R2 (guardian-sessions)  会话文件归档                        │
└─────────────────────────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│  Cloudflare Pages (timeonchrome-console)                   │
│  家长 Web 控制台 (pages/)                                    │
└─────────────────────────────────────────────────────────────┘
```

### 1.2 模块化架构（Service Worker 内部）

```
┌──────────────────────────────────────────────────────────────┐
│  background.js (Wiring 入口, ~180 行)                        │
│  - SW 生命周期 (onStartup / onInstalled)                      │
│  - 信号接入 → 上下文 → 状态 → 会话管线                        │
│  - Alarm 调度                                                  │
│  - 消息路由 (message-router.js)                               │
└──────────┬───────────────────────────────────────────────────┘
           │
           ▼
┌──────────────────────────────────────────────────────────────┐
│  core/  (纯函数层 — 无副作用)                                 │
│                                                              │
│  signal.js      信号输入 + micro-batching (80ms 合并窗口)     │
│  context.js     上下文构建 (lastActiveTabId, domain, focus)   │
│  state.js       状态机 (ACTIVE/BACKGROUND_ACTIVE/PASSIVE/IDLE)│
│  event-log.js   append-only 事件日志 (START/END, 10min 压缩)  │
│  aggregate.js   时长计算 (ACTIVE / media / PiP 分轨聚合)       │
└──────────────────────────────────────────────────────────────┘

### 1.4 Phase 2B 最小双轨语义（媒体归因隔离）

- 新增上下文字段 `mediaSourceTabId` / `mediaSourceDomain`，用于标识后台媒体或 PiP 来源，不覆盖前台归因（`tabId` / `domain`）。
- `MEDIA_STATE` 事件只更新媒体相关信号（`isAudible` / `isPiP` / `mediaSourceTabId` / `mediaSourceDomain`），不覆盖前台归因。
- `BACKGROUND_ACTIVE` 判定要求可验证媒体来源：`isAudible === true && mediaSourceTabId != null`。
- 若仅有 `isAudible` 且缺少 `mediaSourceTabId`，采用保守回退，不进入 `BACKGROUND_ACTIVE`。
- 后台 audio/video 媒体时长通过 `backgroundMediaByDomain` 保留 domain 维度，`audioSeconds` 总量只作为摘要。
- Picture-in-Picture 使用独立 `PIP_ACTIVE` 状态，通过 `pipSeconds` / `pipByDomain` 单独记录，不混入普通在线/ACTIVE 或后台 audio/video 时长。
- PiP 产品决策：不认为 PiP 是正常学习需求；切换到学习模式时，已经打开的非学习网站 PiP 必须关闭。PiP 视频时长需要单独记录，不混入普通在线/ACTIVE 时长；记录但不作为学习需求放行。
           │
           ▼
┌──────────────────────────────────────────────────────────────┐
│  runtime/  (状态管理层 — 有副作用)                             │
│                                                              │
│  session.js     当前会话快照 (单一真相源, transitionState)     │
│  recovery.js    SW 重启恢复 (90s 阈值, 补 END 事件)           │
└──────────────────────────────────────────────────────────────┘
           │
           ▼
┌──────────────────────────────────────────────────────────────┐
│  product/  (业务逻辑层)                                       │
│                                                              │
│  quota.js       配额检查 + 借用逻辑                            │
│  interceptor.js 拦截逻辑 + 提醒触发 (checkAndRemind)          │
│  analytics.js   统计查询                                      │
└──────────────────────────────────────────────────────────────┘
           │
           ▼
┌──────────────────────────────────────────────────────────────┐
│  infra/  (基础设施层)                                         │
│                                                              │
│  storage.js     配置/会话存储 (DEFAULT_CONFIG, getConfig)     │
│  cloud-sync.js  云同步 + 心跳 (pullCloudConfig, sendHeartbeat)│
└──────────────────────────────────────────────────────────────┘
```

### 1.3 数据流方向

```
signal → context → state → session → event-log → aggregate → decision
  │         │         │         │         │           │           │
  ▼         ▼         ▼         ▼         ▼           ▼           ▼
content  tab API   纯函数    storage   append-only  时长计算   配额/拦截
.js      focused   ACTIVE    session   START/END    分类统计   提醒触发
```

**严格单向依赖，禁止循环引用。**

### 1.3.1 Timing trace stats verification 最小验证

- 现有 timing trace diagnostics 继续保持诊断用途，不改变计时产品语义。
- E2E 通过 debug/test-only 入口调用 `handleMessage({ type: 'GET_STATS' })` 触发真实统计读取链路：
  `message-router -> getTodayStats -> event-log aggregate -> stats_calculated trace`。
- 验证明确分为三类，避免把人工或受控数据夸大为完整真实计时准确性：
  1. **real pipeline non-active check**：使用真实页面动作产生的 trace 与 `event_log_v1`，验证 `signal -> state -> session -> event-log -> stats` 链路存在，且 Playwright/OS focus 下产生的真实 IDLE/PASSIVE 闭合片段不会污染 ACTIVE stats。该检查验证 pipeline 到 stats 的非活跃状态口径，不验证真实浏览器 ACTIVE 计时准确性。
  2. **controlled ACTIVE pipeline check**：通过 debug/test-only 受控输入构造多段、多 domain ACTIVE snapshot，并用测试专用 `_debugNow` 将现有 `Date.now()` 锚定到 stats 当天窗口；但仍走现有 `buildContext -> resolveState -> transitionState -> event-log -> stats` 路径，不直接写 `event_log_v1`。该检查验证受控 ACTIVE 输入下 resolver/session/event-log/stats 可以形成可对账闭环，覆盖多段累加、domain 分桶、非 ACTIVE 不计入，不验证 OS focus 或 `chrome.idle` 自动化准确性。
  3. **synthetic aggregation baseline**：追加测试专用闭合 ACTIVE event-log 片段，只证明 `event-log -> stats` 聚合可把 injected ACTIVE 片段计算为预期秒数，不代表真实浏览器计时准确。
- timing trace / stats E2E 的 fresh profile 会在测试初始化阶段写入现有正式字段 `guardian_config.mode = 'rest'` 与 `guardian_session.currentMode = 'rest'`，避免学习模式拦截影响页面打开和 event-log 生成；这不改变正式产品默认模式。
- 不处理 OS focus 自动化、`chrome.idle` 自动化，也不引入新的访问策略。

### 1.3.2 Service Worker recovery accuracy 验证

- MV3 Service Worker recovery 通过 `runtime/recovery.js` 在启动时读取 `session_v1`，若存在未闭合 `state/domain/startTime`，则按 `lastHeartbeat` 与当前时间的间隔决定补写 END 的时间：
  - `delta <= 90s`：视为短中断，END time 使用当前 `Date.now()`。
  - `delta > 90s`：视为长中断 / SW 死亡，END time 截断到 `lastHeartbeat`，避免把离线时间计入使用时长。
- recovery 补 END 后会清空 session 的 `state/domain/startTime` 并更新 `lastHeartbeat`，重复 recovery 不应重复追加 END。
- recovery accuracy unit tests 使用受控时间验证短中断、长中断、重复 recovery、空 session，并对比 `event_log_v1` 推导时长与 `GET_STATS` 聚合结果；该验证不依赖 OS focus 或 `chrome.idle` 自动化。

### 1.3.3 Real Chrome ACTIVE calibration 手工校准

- 真实 Chrome ACTIVE 校准只用于手工诊断前台 Chrome 使用是否能产生 ACTIVE 计时，不扩展 synthetic / controlled / recovery 测试。
- debug-only 入口允许校准前清空 timing trace、focus ledger、`event_log_v1`、`session_v1` 与旧 stats cache，设置 rest mode，并导出 trace / event-log / session / stats / focus ledger 校准包。
- Windows 本地可用 `node tests/manual/real-active-calibration-windows.js --a 6 --b 3 --blur 2` 做短时 headed Chrome 校准；runner 只调用现有 debug-only 入口并输出最小诊断结果。
- 校准判断边界：该流程验证真实 Chrome 前台、失焦、event-log、stats 的端到端观测结果；若没有 ACTIVE，按 `focus -> idle -> context -> resolver -> session -> event-log -> stats` 顺序定位第一断裂层，不改变 OS focus、`chrome.idle` 或产品计时语义。

### 1.3.4 跨自然日计时口径

- “今日时长”应按用户本地自然日统计。
- 若 `event_log_v1` 中一个计时区间跨越午夜，例如 `23:59:50 -> 00:00:10`，统计时应按自然日边界切分，而不是全算入 START 日或 END 日。
- 该口径适用于普通前台 ACTIVE 计时、stats 聚合、badge 今日时长、配额检查与后续报表。
- `core/aggregate.js` 已按本地自然日窗口计算闭合区间 overlap；`getTodayStats`、`getStatsRange` 与 badge 今日时长通过该聚合层继承跨日切分口径。

### 1.3.5 凌晨休息时间限制（后续产品设计）

- 后续需要支持配置“凌晨不可用于休息时间”的时段策略，用于防止熬夜玩游戏。
- 该能力属于配额/策略层：即使某网站在普通休息配额内，若访问发生在禁止休息时段，也应触发相应限制或提醒。
- 该能力不改变底层计时语义：计时仍记录真实使用，策略层再决定该时段是否允许作为休息时间消费。
- 当前计时准确性收口不实现该功能，仅记录为后续产品设计项。
┌─────────────────────────────────────────────────────────────┐
│  Chrome Extension (MV3)                                     │
│                                                             │
│  ┌─────────────┐    ┌──────────────┐    ┌───────────────┐  │
│  │  popup.html │    │  admin.html  │    │ reminder.html │  │
│  │  popup.js   │    │  admin.js    │    │ reminder.js   │  │
│  └──────┬──────┘    └──────┬───────┘    └──────┬────────┘  │
│         │                 │ sendMessage         │           │
│         └─────────────────┼─────────────────────┘           │
│                           ▼                                 │
│  ┌────────────────────────────────────────────────────┐     │
│  │           background.js (Service Worker)           │     │
│  │  - 状态管理 (study/rest mode)                      │     │
│  │  - 计时核心 (HEARTBEAT × 3 分类)                   │     │
│  │  - 提醒触发 (checkAndRemind / redirectToReminder)  │     │
│  │  - 配置存储 (chrome.storage.local)                 │     │
│  │  - 云同步   (pullCloudConfig → Workers API，只读拉取)  │     │
│  └────────────────────────────────────────────────────┘     │
│         ▲                                                   │
│         │ sendMessage (HEARTBEAT)                           │
│  ┌──────┴──────────────────────────┐                        │
│  │  content.js（每个 Tab 注入）     │                        │
│  │  - 用户交互检测（鼠标/键盘）     │                        │
│  │  - 媒体播放检测（AudioContext）  │                        │
│  │  - 心跳发送（每 10 秒）          │                        │
│  │  - 时间覆盖层提示                │                        │
│  └─────────────────────────────────┘                        │
└─────────────────────────────────────────────────────────────┘
                         │ HTTPS
                         ▼
┌─────────────────────────────────────────────────────────────┐
│  Cloudflare Workers (guardian-api)                         │
│                                                             │
│  Routes:                                                    │
│  POST /auth/register         账号注册                       │
│  POST /auth/login            登录，返回 JWT                  │
│  GET/PUT /device/config      配置同步                        │
│  GET /device/quota-state     跨设备配额汇总                   │
│  GET /device/changelog       配置变更日志                     │
│  POST /device/events         事件上报（含邮件通知）           │
│  POST /device/sessions/upload  会话上传 → R2               │
│  GET /profiles/:id/devices   设备列表                        │
│  GET/POST /composite-sessions  待定会话审核                  │
│                                                             │
│  Storage:                                                   │
│  D1 (guardian-db)    账号/设备/配置/统计                     │
│  KV (CONFIG_CACHE)   邮件去重、配置缓存                      │
│  R2 (guardian-sessions)  会话文件归档                        │
└─────────────────────────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│  Cloudflare Pages (timeonchrome-console)                   │
│  家长 Web 控制台 (pages/)                                    │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. 数据结构

### 2.1 扩展配置（chrome.storage.local: guardian_config）

```javascript
{
  version: 1,                        // 整数递增版本号（云端同步用）
  adminPasswordHash: '',             // SHA-256(password + salt)
  isInitialized: false,

  // 模式（孩子主动选择）
  mode: 'study',                     // 'study' | 'rest'

  // 网站分类
  studyList: [],                     // 学习网站（计学习时长，触发自动切换）
  compositeList: [],                 // 待定网站（计待定时长，家长事后审核）
  unsafeList: ['douyin.com', 'tiktok.com'],  // 不安全网站（唯一硬拦截）

  // 每日时间配额（分钟，0=不限）
  dailyOnlineQuota: 0,               // 总在线时长上限
  dailyStudyQuota: 0,                // 学习时长上限
  dailyRestQuota: 120,               // 休息时长上限
  dailyUndeterminedQuota: 60,        // 待定网站时长上限

  // 单域名配额
  domainQuotas: {},                  // { 'domain': minutes }
  lockedDomains: [],                 // 今日已达配额的域名

  // 周配额
  weeklyRestQuota: 0,                // 每周休息时长上限（0=不限）

  // 配额状态（本地维护，不上传到云端）
  quotaState: {
    onlineLocked: false,
    studyLocked: false,
    restLocked: false,
    undeterminedLocked: false,
    weeklyRestLocked: false,
    borrowedMinutes: 0,              // 今日已借出分钟数
    borrowedDate: null,              // 借出日期
  },

  // 时间段管控（旧 guardian active hours，保留兼容）
  schedule: {
    enabled: false,
    days: {
      0: { enabled: true, start: '08:00', end: '21:00' },
      // 1-6 同上...
    }
  },

  // 每日时间窗口（家长控制台时间段管理，per-day source-of-truth）
  timeWindows: {
    daily: {
      monday:    { studyWindows: null, restWindows: [{ start: '15:30', end: '24:00' }] },
      tuesday:   { studyWindows: null, restWindows: [{ start: '15:30', end: '24:00' }] },
      wednesday: { studyWindows: null, restWindows: [{ start: '15:30', end: '24:00' }] },
      thursday:  { studyWindows: null, restWindows: [{ start: '15:30', end: '24:00' }] },
      friday:    { studyWindows: null, restWindows: [{ start: '15:30', end: '24:00' }] },
      saturday:  { studyWindows: null, restWindows: [{ start: '15:30', end: '24:00' }] },
      sunday:    { studyWindows: null, restWindows: [{ start: '15:30', end: '24:00' }] },
    }
  },

  // 自动切换学习模式
  autoStudyConfig: {
    enabled: true,
    requiredSeconds: 90,
  },

  // 其他
  enabled: true,
  blockMessage: '这个网站当前不在可访问范围内',
  updatedAt: null,

  // 云账户信息（绑定后写入）
  cloudToken: '',                    // JWT
  deviceToken: '',                   // 设备级 Bearer token
  profileId: '',
  cloudSyncEnabled: false,
  monitoring_enabled: true,          // 家长可远程关闭监控
}
```

**`timeWindows` 语义说明：**

- `studyWindows`: `null` = 该日学习时段全天允许（默认）；`array` = 显式配置的学习时间窗口列表
- `restWindows`: `null` = 该日休息时段全天允许；`array` = 显式配置的休息时间窗口列表；默认值为 `[{ start: '15:30', end: '24:00' }]`
- `onlineWindows`: **不存储**，由后端按天实时计算为 `studyWindows ∪ restWindows` 的并集
  - 若 `studyWindows === null` **或** `restWindows === null`，该日 `onlineWindows = null`（全天允许）
  - 若两者都是有限数组，计算排序合并后的并集
- 学习与休息时段**允许重叠**，重叠部分在并集中自然合并
- 空数组 `[]` 应归一化为 `null`（表示 unrestricted），不作为默认保存值
- `24:00` 允许作为 `end` 值（表示当天结束），不允许作为 `start`

**`schedule`（旧 guardian active hours）边界：**

旧 `schedule` / guardian active hours 暂不作为本次时间段管理主 UI；数据保留，运行语义不变。是否废弃以后单独决策。保存 `timeWindows` 时不覆盖 `schedule`。

### 2.2 当前会话（chrome.storage.local: guardian_session）

```javascript
{
  currentMode: 'study',              // 'study' | 'rest'
  studySeconds: 0,                   // 今日学习时长（秒）
  restSeconds: 0,                    // 今日休息时长（秒）
  undeterminedSeconds: 0,            // 今日待定时长（秒）
  lastActiveDate: '2026-04-14',
}
```

### 2.3 域名统计（chrome.storage.local: stats_YYYY-MM-DD）

```javascript
{
  'bilibili.com': 1800,              // 秒
  'zhihu.com':    3600,
  // 保留最近 30 天，key: stats_2026-04-14
}
```

### 2.4 云端 D1 主要表结构

```sql
accounts(id, email, password_hash, created_at)
profiles(id, account_id, name, config JSON, version INT, avatar_color, created_at)
devices(id, profile_id, device_token, device_name, last_seen, monitoring_enabled, created_at)
composite_sessions(id, profile_id, device_id, domain, duration_seconds, session_date,
                   classification, parent_note, child_appeal, status, created_at)
```

---

## 3. 核心模块

### 3.1 提醒触发（checkAndRemind）

```
checkAndRemind(tabId, url):

1. unsafeList 检查
   → config.unsafeList.includes(domain)
   → redirectToReminder(tabId, domain, 'unsafe')

2. 时间段检查
   → schedule.enabled && !isWithinSchedule()
   → redirectToReminder(tabId, domain, 'schedule')

3. 学习模式检查
   → mode === 'study'
   → !isStudyDomain && !isCompositeDomain
   → redirectToReminder(tabId, domain, 'study_mode')

4. 配额检查
   → quotaState.onlineLocked → 'quota_online'
   → quotaState.restLocked && !isStudyDomain && !isCompositeDomain → 'quota_rest'
   → quotaState.studyLocked && isStudyDomain → 'quota_study'
   → quotaState.undeterminedLocked && isCompositeDomain → 'quota_undetermined'
   → lockedDomains.includes(domain) → 'quota'
```

`redirectToReminder(tabId, domain, reason)` → `reminder.html?reason=X&domain=Y`

### 3.2 事件驱动注意力引擎（v1.7.0 新架构）

**旧架构问题（已废弃）：**
- 多标签页 passive 重复计时（3 个 YouTube 标签 = 3 倍时长）
- SW 休眠后内存状态丢失（`mediaPlayingTabs` Map、`domainActiveStartTime`）
- 心跳累加模型无法从 SW 重启中恢复

**新架构：事件驱动模型**

```
信号接入 (signal.js):
  content.js HEARTBEAT → micro-batching (80ms 窗口)
  tab.onActivated / tab.onUpdated → 信号事件
  → mergeEvent 字段优先级: tabId > domain > state > isFocused

上下文构建 (context.js):
  lastActiveTabId, lastFocusedWindowId
  domain 提取, isFocused 判断

状态机 (state.js):
  ACTIVE           → 计为 1 (用户交互中)
  BACKGROUND_ACTIVE → 计为 1 (后台活跃)
  PASSIVE          → 计为 0 (媒体播放，不计入时长)
  IDLE             → 计为 0 (无域名/无交互)
  无域名时返回 IDLE (防止 chrome:// 页面污染)

会话管理 (session.js):
  transitionState(newState, domain)
    → 状态变化时写入 START/END 事件到 event-log
    → 更新内存 session 快照
  heartbeat()

### 3.3 Workers stats ingestion 域名归一（v1.7.x）

- 路由：`POST /device/stats`（`workers/src/routes/stats.ts`）。
- 变更目标：在写入 D1 `stats.domain` 前统一执行 v1.2 `normalizeHostname`。
- 归一规则：
  - 小写化（`EXAMPLE.COM` → `example.com`）
  - 去除尾部点（`example.com.` → `example.com`）
  - 保留 `www`（`www.example.com` 不折叠为 `example.com`）
  - IDN 转 punycode（如 `BÜCHER.DE` → `xn--bcher-kva.de`）
- 数据约束：归一后为空/非法域名的统计行直接跳过，不入库。
- 兼容性：
  - 不改变 `date/stats[]` 上传协议；
  - 不改变“先删后插”替换策略；
  - 仅收敛新入库数据，历史数据保留原值。
    → 每 30 秒持久化 session 到 chrome.storage.session

事件日志 (event-log.js):
  append-only (只追加 START/END 事件，永不修改)
  10 分钟时间窗口压缩 (MAX_RAW_WINDOW)
  支持 recovery 重建会话

恢复机制 (recovery.js):
  SW 启动第一步执行
  读取 session 快照 + event-log
  90s 阈值检测 (SLEEP_THRESHOLD)
  补写 END 事件，重建活跃会话
```

### 3.2.1 旧心跳计时（保留作为 content.js 信号源）

**content.js 发送逻辑（每 10 秒）**：

```
getActivityState():
  1. AudioContext 或 video/audio 正在播放 → 'passive'
  2. document.hidden → 'hidden'（不发送）
  3. 近 60 秒有键鼠操作 → 'active'
  4. 否则 → 'idle'（不发送）

sendMessage({ type: 'HEARTBEAT', state: 'active' | 'passive' })
```

**新架构信号处理 (signal.js → state.js)**：

```
收到 HEARTBEAT(state, tabId):
  → signal.js micro-batching (80ms 合并)
  → context.js 构建上下文
  → state.js 解析状态
  → session.js transitionState
  → event-log.js 追加事件
```

### 3.3 自动切换学习模式

```javascript
// 内存变量（不持久化）
let autoStudyCounter = 0;
let autoStudyLastTick = 0;

// 每次 active 心跳时：
if currentMode !== 'rest') return;

if isStudyDomain:
  if Date.now() - autoStudyLastTick > 120000:  // 超 2 分钟无心跳，重置
    autoStudyCounter = 0;
  autoStudyCounter += 10;
  autoStudyLastTick = Date.now();
  if autoStudyCounter >= autoStudyConfig.requiredSeconds:
    switchToStudy();
    autoStudyCounter = 0;

else if isCompositeDomain:
  autoStudyLastTick = Date.now();    // 暂停（更新时间戳但不累加）

else:
  autoStudyCounter = 0;              // 重置
```

### 3.4 配额借用（BORROW_REST_QUOTA）

```javascript
async function borrowRestQuota():
  if quotaState.borrowedDate === today → return { error: 'already_borrowed' }
  if dayOfWeek === 0 → return { error: 'no_cross_week' }  // 周日不可借

  weeklyUsed = calcWeeklyRestSeconds() / 60;
  if weeklyRestQuota > 0 && weeklyUsed + 60 > weeklyRestQuota:
    return { error: 'weekly_quota_exceeded' }

  borrowAmt = 60;  // 固定借 60 分钟
  config.dailyRestQuota += borrowAmt;
  quotaState.borrowedMinutes = borrowAmt;
  quotaState.borrowedDate = today;
  quotaState.restLocked = false;
  saveConfig();
  return { ok: true, amount: borrowAmt }
```

### 3.4.1 提醒页借用按钮交互约束（quota_rest / quota_online）

`reminder.js` 中“⏱ 向明天借时间”按钮采用以下前端状态机，避免重复点击和误触：

1. `window.confirm` 取消：静默返回，不发 `BORROW_REST_QUOTA`，按钮文案/禁用态保持不变。
2. `window.confirm` 通过：按钮立即 `disabled=true`，文案切换为 `处理中...`。
3. 后端返回 `{ ok: true }`：按钮保持禁用，文案变为 `已借用`。
4. 后端返回错误（`already_borrowed` / `no_cross_week` / `weekly_quota_exceeded` / 其他错误）：
   - 按钮恢复可点击（`disabled=false`）
   - 文案恢复初始值 `⏱ 向明天借时间`
   - 状态提示文案沿用原错误映射，不改变业务语义。

### 3.5 云同步

**数据流原则：云端为唯一配置源（Single Source of Truth）**

- 云端 `profiles.config` 是配置的权威来源
- 终端只读拉取，不写回配置
- 家长控制台（`pages/index.html`）是唯一配置修改入口
- 终端仅上报统计数据（stats/sessions），不影响配置
- 绑定动作是唯一例外（写入 device_token/profile_id）

```javascript
// Pull（每次 Chrome 启动时 + 每 15 分钟同步）
pullCloudConfig():
  res = await cloudRequest('GET', '/device/config')
  if res.version <= localConfig.version → 跳过
  // 保护本地状态字段（不被云端覆盖）
  merged = { ...remoteConfig, quotaState: local.quotaState,
             lockedDomains: local.lockedDomains }
  saveConfig(merged)

// Push（已删除：终端不再推送配置）
// 配置修改仅通过家长控制台 → PUT /profiles/:id/config
```

### 3.6 配置修改流程

```
家长控制台 (pages/index.html)
  → PUT /profiles/:id/config
  → 云端 D1 更新 profiles.config
  → version + 1

终端 (background.js)
  → 每 15 分钟 GET /device/config
  → version > localVersion → 拉取并合并
  → 本地配置更新
```

### 3.7 事件上报与邮件通知

```javascript
// 扩展侧（background.js）
cloudRequest('POST', '/device/events', {
  type: 'composite_add',  // 或其他事件类型
  domain: 'example.com'
})

// Workers 侧（events.ts）
NOTIFIABLE_TYPES = ['composite_add', 'unsafe_block', 'quota_locked',
                    'temp_allow', 'temp_allow_quota', 'temp_allow_schedule']

处理逻辑：
1. 验证 device_token → 获取 profileId
2. 事件类型在 NOTIFIABLE_TYPES 中？否 → 返回 { notified: false }
3. RESEND_API_KEY 已配置？否 → 返回 { notified: false }
4. KV 去重：key = notify:{profileId}:{type}:{domain}，TTL 3600s
   存在 → 返回 { notified: false, reason: 'dedup' }
5. 查询家长邮箱（account → profile → device 链）
6. 通过 Resend API 发送邮件
7. 写入 KV 去重标记
```

---

## 3.8 关键参数

| 参数 | 值 | 说明 |
|------|------|------|
| `BATCH_WINDOW` | 80ms | micro-batching 事件合并窗口 |
| `SLEEP_THRESHOLD` | 90s | 休眠检测阈值（recovery 用） |
| `MAX_RAW_WINDOW` | 10min | 事件日志时间窗口压缩 |
| `PASSIVE` | 0 | 不计入时长（只有 ACTIVE/BACKGROUND_ACTIVE 计为 1） |

---

## 4. 消息协议（sendMessage）

| type | 方向 | 参数 | 返回 |
|------|------|------|------|
| `GET_CONFIG` | → background | — | config |
| `UPDATE_CONFIG` | → background | `{ config }` | `{ ok }`（仅保存本地，不推送云端）|
| `GET_STATS` | → background | — | 今日域名统计 |
| `GET_STATS_RANGE` | → background | `{ days }` | 多日统计 |
| `GET_SESSION` | → background | — | session |
| `GET_SESSIONS_RANGE` | → background | `{ days }` | 历史会话 |
| `SWITCH_TO_STUDY` | → background | — | session |
| `SWITCH_TO_REST` | → background | — | session |
| `ADD_TO_COMPOSITE_LIST` | → background | `{ domain }` | `{ added, alreadyPresent }` |
| `BORROW_REST_QUOTA` | → background | — | `{ ok, amount }` 或 error |
| `SEND_CLOUD_EVENT` | → background | `{ eventType, domain }` | — |
| `HEARTBEAT` | content → background | `{ state }` | `{ ok }` |
| `SHOW_WARNING` | background → content | `{ minutesLeft, domain }` | — |
| `SHOW_OVERLAY` | background → content | `{ message, reason }` | — |
| `REMOVE_OVERLAY` | background → content | — | — |

---

## 5. 文件结构

```
timeonchrome/
├── manifest.json              MV3 扩展清单，版本 1.7.2, "type": "module" (Chrome 95+), "incognito": "split"
├── background.js              Service Worker 入口（wiring，~180 行）
├── background.js.bak          旧版备份（2301 行，待清理）
├── message-router.js          消息路由（20+ case 拆分）
├── content.js                 注入每个页面：心跳、媒体检测、覆盖层
├── content.css                content.js 注入的样式
├── reminder.html              提醒页 HTML（7 种场景）
├── reminder.js                提醒页逻辑：场景渲染、操作按钮处理
├── bind.html                  设备绑定页（写入 cloud_device_token/cloud_profile_id）
├── config.js, auth.js, sync.js  云同步配置（cloud_ 前缀统一）
├── core/                      纯函数层（无副作用）
│   ├── signal.js              信号输入 + micro-batching (80ms)
│   ├── context.js             上下文构建（纯函数）
│   ├── state.js               状态机（纯函数）
│   ├── event-log.js           append-only 事件日志
│   └── aggregate.js           时长计算（纯函数）
├── runtime/                   状态管理层（有副作用）
│   ├── session.js             会话快照（单一真相源）
│   └── recovery.js            SW 重启恢复（90s 阈值）
├── product/                   业务逻辑层
│   ├── quota.js               配额检查 + 借用
│   ├── interceptor.js         拦截逻辑 + 提醒
│   └── analytics.js           统计查询
├── infra/                     基础设施层
│   ├── storage.js             配置/会话存储
│   └── cloud-sync.js          云同步 + 心跳
├── popup/
│   ├── popup.html             扩展弹窗 UI（孩子只读激励视图）
│   └── popup.js               弹窗逻辑
├── admin/
│   ├── admin.html             管理面板 UI（家长，密码保护）
│   └── admin.js               管理面板逻辑
├── icons/
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
├── rules/
│   └── block_rules.json       静态拦截规则（空占位）
├── workers/                   Cloudflare Workers 后端
│   ├── wrangler.toml
│   ├── migrations/            D1 数据库迁移文件
│   ├── schema.sql
│   └── src/
│       ├── index.ts           路由入口 + D1 schema + 定时任务
│       ├── db/
│       │   └── middleware.ts  鉴权、响应工具
│       └── routes/
│           ├── auth.ts        注册/登录
│           ├── device.ts      设备绑定/配置同步/配额聚合
│           ├── events.ts      事件上报 + 邮件通知
│           ├── profiles.ts    账户/设备管理
│           ├── sessions.ts    会话上传
│           ├── compositeSessions.ts  待定会话审核
│           ├── stats.ts       统计查询
│           └── changelog.ts   配置变更日志
├── pages/                     家长 Web 控制台（Cloudflare Pages）
│   ├── wrangler.toml
│   └── index.html             单页应用（compositeList → allowList 映射）
├── tests/                     测试套件（218 用例）
│   ├── unit/                  单元测试（157 用例，~7s）
│   ├── api/                   集成测试（52 用例）
│   └── e2e/                   E2E 测试（9 用例）
├── docs/
│   ├── DESIGN.md              本文档
│   ├── PRD.md                 产品需求文档
│   ├── CHANGELOG.md           变更记录
│   ├── TODO.md                待办事项
│   └── TEST-SPEC.md           测试规范
└── AGENTS.md                  开发规范（工作流、测试分级、数据同步原则）
```

---

## 6. Chrome API 使用

| API | 用途 |
|-----|------|
| `chrome.storage.local` | 配置、统计、会话持久化 |
| `chrome.storage.session` | 运行时会话快照（Chrome 95+），split 模式下常规/无痕各自独立 |
| `chrome.declarativeNetRequest` | unsafeList 域名重定向规则 |
| `chrome.webNavigation.onCommitted` | 导航拦截，触发 checkAndRemind |
| `chrome.tabs` | 获取/更新标签页状态 |
| `chrome.alarms` | 定时任务：配额检查、每日重置、保活 |
| `chrome.notifications` | 系统通知（配额锁定等）|
| `chrome.runtime.sendMessage` | popup/admin/content ↔ background 通信 |

---

## 6.1 Incognito 模式（split）

`manifest.json` 使用 `"incognito": "split"`，Chrome 为无痕模式创建独立的 Service Worker 实例。

### 存储隔离表

| 存储类型 | 常规模式 | 无痕模式 | 说明 |
|---------|---------|---------|------|
| `chrome.storage.local` | 共享 | 共享 | 配置、统计、配额状态在两种模式间同步 |
| `chrome.storage.session` | 独立 | 独立 | 会话快照各自维护，SW 重启后仅恢复对应上下文 |
| `chrome.storage.sync` | 共享 | 共享 | 跨设备同步数据 |

### 影响分析

- **reminder.html**：split 模式下无痕标签页可正常加载扩展页面（`reminder.html`、`popup.html` 等）
- **session.js**：无痕和常规模式各自维护独立的 session 快照，互不干扰。这是正确行为 — 无痕浏览应有独立的会话追踪
- **recovery.js**：SW 重启恢复仅作用于当前上下文的 session，不会跨模式恢复
- **cloud-sync.js**：云同步在两种模式下共享 `chrome.storage.local` 中的配置和 token
- **declarativeNetRequest**：规则按标签页应用，split 模式下正常工作

---

## 7. 部署

### Workers（guardian-api）
```bash
cd workers
wrangler deploy
```
绑定资源：D1(`guardian-db`)、KV(`CONFIG_CACHE`)、R2(`guardian-sessions`)
Secret：`RESEND_API_KEY`（通过 `wrangler secret put` 设置，不写入 wrangler.toml）

### Pages（timeonchrome-console）
```bash
cd pages
wrangler pages deploy .
```

---

## 8. Agent 执行规范补强（2026-04-27）

### 背景
OpenCode 在执行 Popup P0 UI 任务时，出现“等价替代 / 自行简化 / 未逐项对照确认方案”的行为。需将“已确认方案必须严格逐项执行”写入仓库级约束。

### 变更内容
- `AGENTS.md` 新增第 7 节：执行合规性规则（Plan Conformance / UI Change Boundary / Commit Gate）
- `DECISIONS.md` 新增 D-014：Agent 必须严格遵循已确认的实施方案，不得擅自简化、替换或偏离

### 影响范围
- 仅文档变更，无代码逻辑改动
- 所有 AI 执行器（Codex / OpenCode / Claude Code 等）均需遵守
