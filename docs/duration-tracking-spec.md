# 网站使用时长追踪 — 完整规格文档

版本：1.7.0
更新：2026-04-21

---

## 目录

1. [概述](#1-概述)
2. [规格定义](#2-规格定义)
3. [架构设计](#3-架构设计)
4. [核心模块](#4-核心模块)
5. [数据流](#5-数据流)
6. [存储方案](#6-存储方案)
7. [恢复机制](#7-恢复机制)
8. [查询与统计](#8-查询与统计)
9. [边界情况处理](#9-边界情况处理)
10. [测试策略](#10-测试策略)

---

## 1. 概述

### 1.1 目标

精确追踪用户在 Chrome 浏览器中对各网站的使用时长，支持：
- 按域名分类（学习 / 待定 / 休息）
- 按用户注意力状态分类（ACTIVE / BACKGROUND_ACTIVE / PASSIVE / IDLE）
- 多标签页去重（同一域名多开不重复计时）
- Service Worker 休眠后自动恢复
- 每日 / 历史统计查询

### 1.2 设计原则

| 原则 | 说明 |
|------|------|
| 事件驱动 | 废弃心跳累加模型，采用 START/END 事件对 |
| append-only | 事件日志只追加不修改，保证可追溯性 |
| 单一真相源 | session 快照是当前状态唯一来源 |
| 纯函数优先 | 状态判定、上下文构建、时长计算均为纯函数 |
| 严格单向依赖 | signal → context → state → session → event-log → aggregate |

### 1.3 旧架构问题（已废弃）

| 问题 | 旧架构表现 | 新架构解决 |
|------|-----------|-----------|
| 多标签页重复计时 | 3 个 YouTube 标签 = 3 倍时长 | context 去重，单例追踪 |
| SW 休眠后状态丢失 | `mediaPlayingTabs` Map 丢失 | recovery 从 event-log 重建 |
| 心跳间隔误差 | 10 秒心跳，最大误差 ±10s | 事件级精度，误差 < 80ms |
| 无法区分注意力状态 | 只有 active/passive | 四态分类，PASSIVE 不计入 |
| 无域名污染 | `chrome://` 页面计入时长 | 无域名返回 IDLE |

---

## 2. 规格定义

### 2.1 注意力状态分类

| 状态 | 判定条件 | 计入时长 | 示例场景 |
|------|---------|---------|---------|
| `ACTIVE` | 窗口有焦点 + 有活跃 tab + 非空闲 | +1s | 用户正在浏览网页 |
| `BACKGROUND_ACTIVE` | 媒体播放（audible）或画中画 | +1s | 用户在听 YouTube 音乐，切换到其他标签 |
| `PASSIVE` | 有域名但不满足以上条件 | 0 | 页面打开但用户无交互 |
| `IDLE` | 无域名或系统空闲 | 0 | `chrome://` 页面、电脑锁屏 |

### 2.2 状态判定规则

```
resolveState(context):
  1. 无域名 → IDLE
  2. 系统空闲 → IDLE
  3. 窗口有焦点 + 有活跃 tab → ACTIVE
  4. 媒体播放（audible）→ BACKGROUND_ACTIVE
  5. 画中画（PiP）→ BACKGROUND_ACTIVE
  6. 其他 → PASSIVE
```

### 2.3 关键参数

| 参数 | 值 | 说明 |
|------|------|------|
| `BATCH_WINDOW` | 80ms | micro-batching 事件合并窗口 |
| `SLEEP_THRESHOLD` | 90s | 休眠检测阈值 |
| `MAX_RAW_WINDOW` | 10min | 事件日志时间窗口压缩 |
| 心跳间隔 | 10s | content.js 发送 HEARTBEAT 作为信号源 |
| 持久化间隔 | 30s | session 心跳持久化频率 |

### 2.4 域名分类

| 列表 | 字段 | 说明 |
|------|------|------|
| 学习网站 | `studyList` | 学习资源，消耗 `dailyStudyQuota` |
| 待定网站 | `compositeList` | 性质待定，消耗 `dailyUndeterminedQuota` |
| 不安全网站 | `unsafeList` | 硬拦截，不计时 |
| 其他 | — | 归为休息，消耗 `dailyRestQuota` |

---

## 3. 架构设计

### 3.1 模块分层

```
┌──────────────────────────────────────────────────────────────┐
│  background.js (Wiring 入口)                                  │
│  - SW 生命周期管理                                             │
│  - 信号接入 → 上下文 → 状态 → 会话管线                         │
│  - Alarm 调度                                                  │
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
│  aggregate.js   时长计算 (只统计 ACTIVE/BACKGROUND_ACTIVE)     │
└──────────────────────────────────────────────────────────────┘
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
│  analytics.js   统计查询                                      │
└──────────────────────────────────────────────────────────────┘
```

### 3.2 依赖关系

```
signal.js ──→ context.js ──→ state.js ──→ session.js ──→ event-log.js
                                                              │
                                                              ▼
                                                        aggregate.js
                                                              │
                                                              ▼
                                                       analytics.js
```

**严格单向依赖，禁止循环引用。**

### 3.3 信号源

| 信号源 | 事件 | 说明 |
|--------|------|------|
| `chrome.tabs.onActivated` | 标签页激活 | 用户切换到新标签 |
| `chrome.tabs.onUpdated` | 标签页更新 | URL 变化，提取域名 |
| `chrome.windows.onFocusChanged` | 窗口焦点 | 浏览器获得/失去焦点 |
| `chrome.idle.onStateChanged` | 系统空闲 | 用户离开电脑 |
| `content.js MEDIA_STATE` | 媒体状态 | video/audio/AudioContext 播放 |
| `chrome.tabs.onRemoved` | 标签页关闭 | 触发状态重新评估 |

---

## 4. 核心模块

### 4.1 signal.js — 信号输入层

**职责**：监听 Chrome API 事件，80ms micro-batching 合并

**核心机制**：

```javascript
// micro-batching: 80ms 窗口内的事件合并
let pending = {};
let batchTimer = null;

function onEvent(rawEvent) {
  pending = mergeEvent(pending, rawEvent);  // 字段优先级合并
  scheduleMerge();  // 80ms 后触发 emitMerged
}
```

**字段优先级合并规则**：
- `incoming` 的 `null/undefined` 不覆盖 `pending` 的值
- `timestamp` 始终使用当前时间
- 保证 80ms 内多个事件合并为一个完整上下文

**监听事件**：
- `chrome.tabs.onActivated` → `{ tabId, windowId }`
- `chrome.tabs.onUpdated` → `{ tabId, domain }`
- `chrome.windows.onFocusChanged` → `{ windowId, isFocused }`
- `chrome.idle.onStateChanged` → `{ isIdle }`
- `MEDIA_STATE` 消息 → `{ tabId, isAudible }`
- `chrome.tabs.onRemoved` → `{}`（触发重新评估）

### 4.2 context.js — 上下文构建

**职责**：将原始事件合并为 AttentionContext 对象

**输入**：`current`（当前上下文）+ `rawEvent`（原始事件）

**输出**：新的 AttentionContext 对象（不可变）

```javascript
AttentionContext {
  tabId: number|null,          // 当前活跃标签 ID
  windowId: number|null,       // 当前焦点窗口 ID
  domain: string|null,         // 当前域名
  isFocused: boolean,          // 浏览器窗口是否有焦点
  isIdle: boolean,             // 系统是否空闲
  isAudible: boolean,          // 是否有媒体播放
  isPiP: boolean,              // 是否画中画
  timestamp: number,           // 时间戳
  lastActiveTabId: number|null,// 最后活跃标签 ID（防丢失）
  lastFocusedWindowId: number|null, // 最后焦点窗口 ID（防丢失）
}
```

**关键设计**：
- `lastActiveTabId` / `lastFocusedWindowId` 防止 window blur/focus 循环导致状态错乱
- 纯函数，无副作用
- 不可变返回，不修改输入

### 4.3 state.js — 状态机

**职责**：根据上下文判定当前注意力状态

**输入**：AttentionContext

**输出**：AttentionState 值

```javascript
AttentionState {
  ACTIVE: 'ACTIVE',              // 计为 1
  BACKGROUND_ACTIVE: 'BACKGROUND_ACTIVE', // 计为 1
  PASSIVE: 'PASSIVE',            // 计为 0
  IDLE: 'IDLE',                  // 计为 0
}
```

**判定规则**（按优先级）：
1. 无域名 → `IDLE`（防止 `chrome://` 页面污染）
2. 系统空闲 → `IDLE`
3. 窗口有焦点 + 有活跃 tab → `ACTIVE`
4. 媒体播放（audible）→ `BACKGROUND_ACTIVE`
5. 画中画（PiP）→ `BACKGROUND_ACTIVE`
6. 其他 → `PASSIVE`

### 4.4 event-log.js — 事件日志

**职责**：append-only 事件日志（唯一写入点）

**存储 Key**：`event_log_v1`

**事件结构**：
```javascript
{
  type: 'START' | 'END',
  state: string,      // ACTIVE / BACKGROUND_ACTIVE / PASSIVE / IDLE
  domain: string|null,
  time: number,       // 时间戳（毫秒）
}
```

**核心操作**：
- `appendEvent(event)` — 追加事件（唯一写入口）
- `getEvents()` — 获取事件列表
- `clearEvents()` — 清空（仅用于 debug）

**压缩策略**：
- 只保留最近 10 分钟的 raw events
- `MAX_RAW_WINDOW = 10 * 60 * 1000`
- 每次写入时自动过滤过期事件

### 4.5 session.js — 会话管理

**职责**：当前会话快照（单一真相源）+ 状态切换

**存储**：`chrome.storage.session`（Chrome 95+）

**存储 Key**：`session_v1`

**会话结构**：
```javascript
SessionState {
  state: string|null,       // 当前状态
  domain: string|null,      // 当前域名
  startTime: number|null,   // 状态开始时间
  lastHeartbeat: number,    // 最后心跳时间
}
```

**核心操作**：
- `initSession()` — 初始化（首次）
- `getSession()` — 获取当前快照
- `saveSession(session)` — 保存快照
- `transitionState(newState, newDomain)` — 状态切换（统一入口）
- `heartbeat()` — 维持恢复锚点

**状态切换流程**：
```
transitionState(newState, newDomain):
  1. 检查是否变化（无变化则忽略，抗抖）
  2. 关闭旧事件 → appendEvent({ type: END, ... })
  3. 开启新事件 → appendEvent({ type: START, ... })
  4. 更新 session 快照
```

### 4.6 aggregate.js — 时长计算

**职责**：从事件日志计算域名使用时长（纯函数）

**状态权重**：
```javascript
STATE_WEIGHTS = {
  ACTIVE: 1,
  BACKGROUND_ACTIVE: 1,
  PASSIVE: 0,
  IDLE: 0,
};
```

**核心函数**：
- `computeDuration(events, domain, date)` — 计算指定域名在指定日期的时长（秒）
- `computeAllDomains(events, date)` — 计算所有域名在指定日期的时长

**计算逻辑**：
```
遍历事件列表，对每个 START 事件：
  duration = (下一个事件.time - 当前事件.time) / 1000
  weighted_duration = duration * STATE_WEIGHTS[当前事件.state]
  total += weighted_duration
返回 floor(total)
```

### 4.7 recovery.js — 恢复机制

**职责**：SW 重启恢复（启动第一优先级）

**触发时机**：`chrome.runtime.onStartup` / `chrome.runtime.onInstalled`

**恢复流程**：
```
recover():
  1. 读取 session 快照
  2. 如果有未闭合状态（state && startTime 存在）：
     a. 计算 delta = now - lastHeartbeat
     b. 如果 delta > 90s（休眠）：
        endTime = lastHeartbeat（截断到最后一次心跳）
     c. 否则（正常）：
        endTime = now（计到当前时间）
     d. 补 END 事件 → appendEvent({ type: END, time: endTime })
     e. 重置 session（防止重复恢复）
```

### 4.8 analytics.js — 统计查询

**职责**：提供统计查询接口

**核心函数**：
- `getTodayStatsWithCategories(config)` — 今日统计（学习/休息/待定分类）
- `getStatsWithAggregate(days)` — 多日统计（基于 event-log 聚合）

**数据来源**：
- 旧数据：`stats_YYYY-MM-DD`（兼容旧格式）
- 新数据：`event_log_v1`（事件日志聚合）

---

## 5. 数据流

### 5.1 完整数据流

```
┌─────────────┐     ┌──────────────┐     ┌─────────────┐
│  Chrome API │────▶│  signal.js   │────▶│ context.js  │
│  Events     │     │  (80ms batch)│     │ (build ctx) │
└─────────────┘     └──────────────┘     └──────┬──────┘
                                                │
                                                ▼
                                         ┌─────────────┐
                                         │  state.js   │
                                         │ (resolve)   │
                                         └──────┬──────┘
                                                │
                                                ▼
┌─────────────┐     ┌──────────────┐     ┌─────────────┐
│  aggregate  │◀────│  event-log   │◀────│  session.js │
│  (compute)  │     │  (append)    │     │ (transition)│
└──────┬──────┘     └──────────────┘     └─────────────┘
       │
       ▼
┌─────────────┐
│ analytics.js│
│ (query)     │
└─────────────┘
```

### 5.2 事件时序示例

**场景**：用户打开 YouTube，播放视频，切换到其他标签

```
时间线：
  T0: chrome.tabs.onActivated → { tabId: 1, windowId: 1 }
  T0+80ms: signal merge → context { tabId: 1, domain: 'youtube.com', isFocused: true }
  T0+80ms: resolveState → ACTIVE
  T0+80ms: transitionState('ACTIVE', 'youtube.com')
           → appendEvent({ type: START, state: 'ACTIVE', domain: 'youtube.com', time: T0 })
           → saveSession({ state: 'ACTIVE', domain: 'youtube.com', startTime: T0 })

  T1: content.js MEDIA_STATE → { tabId: 1, playing: true }
  T1+80ms: signal merge → context { ..., isAudible: true }
  T1+80ms: resolveState → BACKGROUND_ACTIVE（媒体播放）
  T1+80ms: transitionState('BACKGROUND_ACTIVE', 'youtube.com')
           → appendEvent({ type: END, state: 'ACTIVE', domain: 'youtube.com', time: T1 })
           → appendEvent({ type: START, state: 'BACKGROUND_ACTIVE', domain: 'youtube.com', time: T1 })

  T2: chrome.tabs.onActivated → { tabId: 2, windowId: 1 }（切换到其他标签）
  T2+80ms: signal merge → context { tabId: 2, domain: 'google.com', isFocused: true, isAudible: true }
  T2+80ms: resolveState → ACTIVE（窗口有焦点 + 有活跃 tab，优先级高于 audible）
  T2+80ms: transitionState('ACTIVE', 'google.com')
           → appendEvent({ type: END, state: 'BACKGROUND_ACTIVE', domain: 'youtube.com', time: T2 })
           → appendEvent({ type: START, state: 'ACTIVE', domain: 'google.com', time: T2 })
```

**时长计算**：
- YouTube ACTIVE: T1 - T0 秒
- YouTube BACKGROUND_ACTIVE: T2 - T1 秒（计入时长）
- Google ACTIVE: 从 T2 开始

### 5.3 多标签页去重

**场景**：用户同时打开 3 个 YouTube 标签

```
旧架构（错误）：
  Tab1 HEARTBEAT → +10s
  Tab2 HEARTBEAT → +10s
  Tab3 HEARTBEAT → +10s
  总计：30s（错误！）

新架构（正确）：
  Tab1 激活 → START('ACTIVE', 'youtube.com')
  Tab2 激活 → END('ACTIVE', 'youtube.com') + START('ACTIVE', 'youtube.com')
  Tab3 激活 → END('ACTIVE', 'youtube.com') + START('ACTIVE', 'youtube.com')
  总计：始终只计当前活跃标签的时长（正确！）
```

---

## 6. 存储方案

### 6.1 存储层级

| 存储 | Key | 数据类型 | 生命周期 |
|------|------|---------|---------|
| `chrome.storage.session` | `session_v1` | SessionState | SW 运行期间 |
| `chrome.storage.local` | `event_log_v1` | Event[] | 10 分钟窗口 |
| `chrome.storage.local` | `stats_YYYY-MM-DD` | { domain: seconds } | 30 天 |
| `chrome.storage.local` | `guardian_sessions` | { date: sessionData } | 30 天 |

### 6.2 存储容量估算

| 数据 | 大小估算 | 说明 |
|------|---------|------|
| session_v1 | ~100 bytes | 单个对象 |
| event_log_v1 | ~5-10 KB | 10 分钟内约 100-200 个事件 |
| stats_YYYY-MM-DD | ~1-2 KB/天 | 50-100 个域名 |
| guardian_sessions | ~5-10 KB/天 | 20-50 个会话 |

**总容量**：Chrome storage.local 限制 5MB，足够使用

### 6.3 数据清理

| 清理任务 | 频率 | 操作 |
|---------|------|------|
| event-log 压缩 | 每次写入 | 过滤 > 10 分钟的事件 |
| stats 清理 | 每小时 | 删除 > 30 天的 stats |
| sessions 清理 | 每小时 | 删除 > 30 天的 sessions |

---

## 7. 恢复机制

### 7.1 恢复场景

| 场景 | 触发条件 | 恢复动作 |
|------|---------|---------|
| SW 休眠 | Chrome 回收 Service Worker | 补 END 事件，截断到 lastHeartbeat |
| 浏览器重启 | `chrome.runtime.onStartup` | 补 END 事件，重置 session |
| 扩展更新 | `chrome.runtime.onInstalled` | 补 END 事件，重置 session |

### 7.2 恢复流程图

```
SW 启动
  │
  ▼
读取 session_v1
  │
  ├── 无 session → 初始化，跳过恢复
  │
  ├── 有 session，但 state 为 null → 跳过恢复
  │
  └── 有 session，state 存在
       │
       ▼
  计算 delta = now - lastHeartbeat
       │
       ├── delta > 90s（休眠）
       │    │
       │    ▼
       │   endTime = lastHeartbeat
       │   补 END 事件（截断到休眠前）
       │
       └── delta <= 90s（正常）
            │
            ▼
           endTime = now
           补 END 事件（计到当前）
       │
       ▼
  重置 session（state: null, domain: null）
```

### 7.3 恢复示例

**场景**：用户浏览 YouTube 2 小时，Chrome 休眠后重启

```
T0: 用户打开 YouTube
    → START('ACTIVE', 'youtube.com', T0)
    → session: { state: 'ACTIVE', domain: 'youtube.com', startTime: T0, lastHeartbeat: T0 }

T0+30min: heartbeat()
    → session.lastHeartbeat = T0+30min

T0+1h: heartbeat()
    → session.lastHeartbeat = T0+1h

T0+2h: Chrome 休眠，SW 被回收
    → session 仍保留：{ state: 'ACTIVE', ..., lastHeartbeat: T0+2h }

T0+4h: Chrome 重启，SW 重新启动
    → recover() 执行
    → delta = (T0+4h) - (T0+2h) = 2h > 90s → 判定为休眠
    → endTime = lastHeartbeat = T0+2h
    → 补 END 事件：{ type: END, state: 'ACTIVE', domain: 'youtube.com', time: T0+2h }
    → 重置 session

最终时长：T0+2h - T0 = 2 小时（正确！）
```

---

## 8. 查询与统计

### 8.1 今日统计

**函数**：`getTodayStatsWithCategories(config)`

**返回**：
```javascript
{
  studySeconds: number,      // 学习时长（秒）
  restSeconds: number,       // 休息时长（秒）
  undeterminedSeconds: number, // 待定时长（秒）
  totalSeconds: number,      // 总时长（秒）
  domains: {                 // 域名统计
    'youtube.com': 3600,
    'google.com': 1800,
    // ...
  }
}
```

**分类逻辑**：
- 学习域名：匹配 `config.studyList` → studySeconds
- 待定域名：从 `undetermined_stats_YYYY-MM-DD` 读取 → undeterminedSeconds
- 休息时长：totalSeconds - studySeconds - undeterminedSeconds → restSeconds

### 8.2 多日统计

**函数**：`getStatsWithAggregate(days)`

**返回**：
```javascript
{
  '2026-04-21': {
    'youtube.com': 3600,
    'google.com': 1800,
  },
  '2026-04-20': {
    'bilibili.com': 2400,
  },
  // ...
}
```

**数据来源**：从 `event_log_v1` 按日期过滤，调用 `computeAllDomains()` 计算

### 8.3 历史统计（兼容旧格式）

**函数**：`getStatsRange(days)`

**数据来源**：`stats_YYYY-MM-DD`（旧格式，保留兼容）

---

## 9. 边界情况处理

### 9.1 无域名场景

| URL 类型 | 处理方式 |
|---------|---------|
| `chrome://extensions` | 返回 null → IDLE |
| `chrome://newtab` | 返回 null → IDLE |
| `chrome-extension://...` | 返回 null → IDLE |
| `about:blank` | 返回 null → IDLE |
| `edge://...` | 返回 null → IDLE |

### 9.2 快速切换场景

| 场景 | 处理方式 |
|------|---------|
| 标签页快速切换（< 80ms） | micro-batching 合并，只触发一次状态变化 |
| 窗口 blur/focus 循环 | `lastActiveTabId` / `lastFocusedWindowId` 防丢失 |
| 状态无变化 | `transitionState` 直接返回（抗抖） |

### 9.3 SW 休眠场景

| 场景 | 处理方式 |
|------|---------|
| SW 被回收（< 90s） | delta <= 90s，补 END 事件计到当前时间 |
| SW 被回收（> 90s） | delta > 90s，补 END 事件截断到 lastHeartbeat |
| 浏览器关闭 | session 持久化在 storage.session，下次启动恢复 |

### 9.4 媒体播放场景

| 场景 | 状态 | 计入时长 |
|------|------|---------|
| 用户在 YouTube 页面，视频播放中 | BACKGROUND_ACTIVE | +1s |
| 用户切换到其他标签，YouTube 继续播放 | BACKGROUND_ACTIVE | +1s |
| 用户暂停视频 | PASSIVE | 0 |
| 用户关闭 YouTube 标签 | IDLE（新标签无域名） | 0 |

### 9.5 多标签页场景

| 场景 | 处理方式 |
|------|---------|
| 3 个 YouTube 标签同时打开 | 只计当前活跃标签，不重复 |
| 从 YouTube 切换到 Google | END('youtube.com') + START('google.com') |
| 关闭当前标签，自动切换到上一个 | context 通过 lastActiveTabId 追踪 |

---

## 10. 测试策略

### 10.1 单元测试

| 模块 | 测试内容 |
|------|---------|
| `state.js` | resolveState 各种输入组合的输出 |
| `context.js` | buildContext 字段合并逻辑 |
| `aggregate.js` | computeDuration 时长计算准确性 |
| `event-log.js` | appendEvent 追加和压缩逻辑 |
| `signal.js` | micro-batching 合并逻辑 |

### 10.2 集成测试

| 场景 | 验证内容 |
|------|---------|
| 完整数据流 | signal → context → state → session → event-log → aggregate |
| 状态切换 | transitionState 正确写入 START/END 事件 |
| 恢复机制 | recover 正确补 END 事件 |
| 多标签页 | 不重复计时 |

### 10.3 E2E 测试

| 场景 | 验证内容 |
|------|---------|
| Service Worker 启动 | recovery 执行，session 恢复 |
| 标签页切换 | 事件日志正确记录 |
| 媒体播放 | 状态正确切换为 BACKGROUND_ACTIVE |
| 时长统计 | 查询结果与实际使用一致 |

### 10.4 测试用例示例

```javascript
// 测试 resolveState
test('无域名返回 IDLE', () => {
  const context = { domain: null, isFocused: true, isIdle: false };
  expect(resolveState(context)).toBe('IDLE');
});

test('窗口有焦点 + 有活跃 tab 返回 ACTIVE', () => {
  const context = { domain: 'youtube.com', tabId: 1, isFocused: true, isIdle: false, isAudible: false };
  expect(resolveState(context)).toBe('ACTIVE');
});

test('媒体播放返回 BACKGROUND_ACTIVE', () => {
  const context = { domain: 'youtube.com', tabId: 1, isFocused: false, isIdle: false, isAudible: true };
  expect(resolveState(context)).toBe('BACKGROUND_ACTIVE');
});

// 测试 aggregate
test('计算时长（ACTIVE 计为 1，PASSIVE 计为 0）', () => {
  const events = [
    { type: 'START', state: 'ACTIVE', domain: 'youtube.com', time: 1000 },
    { type: 'END', state: 'ACTIVE', domain: 'youtube.com', time: 2000 },
    { type: 'START', state: 'PASSIVE', domain: 'youtube.com', time: 2000 },
    { type: 'END', state: 'PASSIVE', domain: 'youtube.com', time: 3000 },
  ];
  expect(computeDuration(events, 'youtube.com', '1970-01-01')).toBe(1); // 只有 ACTIVE 的 1s
});
```

---

## 附录 A：文件清单

| 文件 | 行数 | 职责 |
|------|------|------|
| `core/signal.js` | 114 | 信号输入 + micro-batching |
| `core/context.js` | 36 | 上下文构建（纯函数） |
| `core/state.js` | 31 | 状态机（纯函数） |
| `core/event-log.js` | 40 | append-only 事件日志 |
| `core/aggregate.js` | 69 | 时长计算（纯函数） |
| `runtime/session.js` | 104 | 会话快照 + transitionState |
| `runtime/recovery.js` | 46 | SW 重启恢复 |
| `product/analytics.js` | 41 | 统计查询 |
| `background.js` | ~180 | Wiring 入口 |
| **总计** | **~660 行** | |

## 附录 B：与旧架构对比

| 维度 | 旧架构（心跳累加） | 新架构（事件驱动） |
|------|-------------------|-------------------|
| 代码量 | 2301 行（单文件） | ~660 行（12 模块） |
| 计时精度 | ±10s（心跳间隔） | < 80ms（事件级） |
| 多标签页 | 重复计时 | 去重，单例追踪 |
| SW 恢复 | 无法恢复 | 自动恢复，90s 阈值 |
| 状态分类 | active/passive | 四态分类 |
| 数据模型 | 心跳累加 | START/END 事件对 |
| 可测试性 | 低（耦合严重） | 高（纯函数优先） |
| 可维护性 | 低（单文件 2301 行） | 高（模块化分层） |
