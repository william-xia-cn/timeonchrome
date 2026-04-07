# 家长守护 Guardian — 技术设计文档

版本：2.0-draft  
更新：2026-04-07

---

## 1. 架构概览

```
┌─────────────────────────────────────────────────────┐
│  Chrome Extension (MV3)                             │
│                                                     │
│  ┌─────────────┐    ┌──────────────┐               │
│  │  popup.html │    │  admin.html  │               │
│  │  popup.js   │    │  admin.js    │               │
│  └──────┬──────┘    └──────┬───────┘               │
│         │ sendMessage      │ sendMessage            │
│         ▼                  ▼                        │
│  ┌──────────────────────────────────────────┐       │
│  │         background.js (Service Worker)   │       │
│  │  - 状态管理 (study/rest)                 │       │
│  │  - 计时核心 (HEARTBEAT)                  │       │
│  │  - 网络拦截 (declarativeNetRequest)      │       │
│  │  - 配置存储 (chrome.storage.local)       │       │
│  └──────────────────────────────────────────┘       │
│         ▲                                           │
│         │ sendMessage (HEARTBEAT)                   │
│  ┌──────┴──────────────────────┐                    │
│  │  content.js (每个 Tab 注入)  │                    │
│  │  - 用户交互检测              │                    │
│  │  - 媒体播放检测              │                    │
│  │  - 心跳发送 (每 10 秒)       │                    │
│  └─────────────────────────────┘                    │
│                                                     │
│  blocked.html / blocked.js  ← 拦截跳转页            │
└─────────────────────────────────────────────────────┘
```

---

## 2. 数据结构

### 2.1 配置（chrome.storage.local: guardian_config）

```javascript
{
  version: '2.0',
  adminPasswordHash: '',          // SHA-256(password + salt)
  isInitialized: false,
  
  // 网络管控
  mode: 'whitelist',              // 'whitelist' | 'blacklist'
  studyList: [],                  // 学习网站（触发自动切换）
  allowList: [],                  // 允许但非学习网站（如音乐）
  blacklist: [],                  // 娱乐模式屏蔽的网站
  
  // 时间配额
  dailyQuota: 0,                  // 每日总配额（分钟，0=不限）
  domainQuotas: {},               // { 'domain': minutes }
  lockedDomains: [],              // 今日已达配额的域名
  
  // 时间段管控
  schedule: {
    enabled: false,
    days: {
      0: { enabled: true, start: '08:00', end: '21:00' },
      // 1-6 同上...
    }
  },
  
  // 娱乐模式设置
  restConfig: {
    reminderInterval: 15,         // 提醒间隔（分钟）
    maxRestDuration: 60           // 最大娱乐时长（分钟）
  },
  
  // 自动切换学习设置
  autoStudyConfig: {
    enabled: true,
    requiredSeconds: 90           // 触发所需连续 active 秒数
  },
  
  // 临时白名单
  tempWhitelistConfig: { duration: 1 },   // 放行时长（分钟）
  tempWhitelist: {
    domains: {},                  // { 'domain': expiresAtTimestamp }
    records: []                   // [{ domain, addedAt, expiresAt }]
  },
  
  // 其他
  enabled: true,
  blockMessage: '此网站已被家长限制访问。',
  updatedAt: null
}
```

### 2.2 当前会话（chrome.storage.local: guardian_session）

```javascript
{
  currentMode: 'study',           // 'study' | 'rest'
  studySession: { totalSeconds: 0 },
  restSession:  { totalSeconds: 0 },
  lastActiveDate: '2026-04-07'
}
```

> 注：startTime 字段已废弃，时长完全由 HEARTBEAT 心跳累加。

### 2.3 历史会话（chrome.storage.local: guardian_sessions）

```javascript
{
  '2026-04-07': { studySeconds: 3600, restSeconds: 1800 },
  '2026-04-06': { studySeconds: 7200, restSeconds: 0 },
  // 保留最近 30 天
}
```

### 2.4 域名统计（chrome.storage.local: stats_YYYY-MM-DD）

```javascript
{
  'bilibili.com': 1800,   // 秒
  'zhihu.com':    3600,
  // ...
}
// 保留最近 30 天，key: stats_2026-04-07
```

---

## 3. 核心模块

### 3.1 心跳计时（content.js → background.js）

**content.js 逻辑**：

```
每 10 秒调用 getActivityState()：
  1. mediaPlaying（video/audio/AudioContext）→ 'passive'
  2. document.hidden → 'hidden'（不发送）
  3. 近 60 秒有交互 → 'active'
  4. 否则 → 'idle'（不发送）

发送 { type: 'HEARTBEAT', state: 'active'|'passive' }
```

**AudioContext 检测**（document_start 时机）：
- 拦截 `window.AudioContext` 和 `window.webkitAudioContext` 构造函数
- 监听 `statechange` 事件，`state === 'running'` 时标记媒体活跃

**background.js HEARTBEAT 处理**：

```
收到 HEARTBEAT：
  if sender.tab.active === false → 忽略（后台 Tab）
  
  domain = extractDomain(sender.tab.url)
  
  if state === 'passive':
    addDomainTime(domain, 10)   // 仅计域名时长
    return
  
  if state === 'active':
    addDomainTime(domain, 10)   // 域名时长
    
    if mode === 'study' && domain in studyList:
      studySession.totalSeconds += 10   // 学习时长
    
    if mode === 'rest':
      restSession.totalSeconds += 10    // 娱乐时长
    
    // 自动切换计数（见 3.2）
```

### 3.2 自动切换学习模式

**内存变量（不持久化）**：
```javascript
let autoStudyCounter = 0;      // 当前累计 active 秒数
let autoStudyLastTick = 0;     // 上次心跳时间戳
```

**每次 active 心跳时**：

```
if currentMode !== 'rest' → 跳过

domain = extractDomain(activeTab.url)

if domain in studyList:
  // 检查连续性：上次心跳超过 2 分钟则重置
  if Date.now() - autoStudyLastTick > 120000:
    autoStudyCounter = 0
  
  autoStudyCounter += 10
  autoStudyLastTick = Date.now()
  
  if autoStudyCounter >= autoStudyConfig.requiredSeconds:
    switchToStudy()
    autoStudyCounter = 0

elif domain in allowList:
  autoStudyLastTick = Date.now()   // 更新时间戳，但不累加（暂停）

else:
  autoStudyCounter = 0             // 不在白名单，重置
```

### 3.3 网络拦截

**学习模式（whitelist）**：
- `declarativeNetRequest` 动态规则：studyList + allowList 域名设为 `allow`
- `webNavigation.onCommitted` 监听：不在白名单的域名调用 `blockTab()`
- `blockTab()` → `chrome.tabs.update(url: blocked.html?reason=whitelist&domain=xxx)`

**娱乐模式（blacklist）**：
- `declarativeNetRequest` 动态规则：blacklist 中的域名直接重定向到 blocked.html
- URL 中携带 `reason=blacklist&domain=xxx`

**防循环**：
- `isBlockingInProgress: Set` 记录正在处理的 tabId
- 跳过 `blocked.html` 页面本身的导航事件

### 3.4 配置完整性

```
saveConfig(config):
  sorted = sortObjectKeys(config)    // 键排序，确保哈希稳定
  hash = SHA-256(JSON(sorted) + salt)
  chrome.storage.local.set({ config, hash })

getConfig():
  if storedHash !== computeHash(config):
    // 合并默认值后使用（不丢失用户数据）
    return { ...DEFAULT_CONFIG, ...config }
```

### 3.5 插件更新配置迁移

```
onInstalled(reason === 'update'):
  existingConfig = storage.get(CONFIG_KEY)  // 绕过哈希校验直接读
  migratedConfig = {
    ...DEFAULT_CONFIG,      // 新版本默认值（含新增字段）
    ...existingConfig,      // 用户配置覆盖
    version: NEW_VERSION
  }
  saveConfig(migratedConfig)
```

---

## 4. 文件结构

```
guardian-extension/
├── manifest.json           # MV3 扩展清单
├── background.js           # Service Worker 核心逻辑
├── content.js              # 注入每个页面：心跳、媒体检测、覆盖层
├── content.css             # content.js 注入的样式
├── blocked.html            # 拦截跳转页 HTML
├── blocked.js              # 拦截页脚本（CSP 要求外部文件）
├── popup/
│   ├── popup.html          # 扩展弹窗 UI
│   └── popup.js            # 弹窗逻辑：状态显示、模式切换
├── admin/
│   ├── admin.html          # 管理面板 UI
│   └── admin.js            # 管理面板逻辑
├── utils/
│   └── storage.js          # 存储工具（未使用，可清理）
├── icons/
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
├── rules/
│   └── block_rules.json    # 静态拦截规则（空）
└── docs/
    ├── PRD.md              # 产品需求文档
    ├── DESIGN.md           # 本文档
    └── CHANGELOG.md        # 变更记录
```

---

## 5. Chrome API 使用

| API | 用途 |
|-----|------|
| `chrome.storage.local` | 配置、统计、会话持久化 |
| `chrome.declarativeNetRequest` | 动态网络拦截规则 |
| `chrome.webNavigation.onCommitted` | 白名单模式下的导航拦截 |
| `chrome.tabs` | 获取/更新标签页 |
| `chrome.alarms` | 定时任务（配额检查、娱乐提醒、保活） |
| `chrome.notifications` | 娱乐提醒通知 |
| `chrome.idle` | 检测用户空闲（已被心跳机制替代，可移除） |
| `chrome.runtime.sendMessage` | popup/admin/content ↔ background 通信 |

---

## 6. 消息协议（sendMessage）

| type | 方向 | 参数 | 返回 |
|------|------|------|------|
| `GET_CONFIG` | → background | — | config |
| `UPDATE_CONFIG` | → background | `{ config }` | `{ ok }` |
| `GET_STATS` | → background | — | 今日域名统计 |
| `GET_STATS_RANGE` | → background | `{ days }` | 多日统计 |
| `GET_SESSION` | → background | — | session |
| `GET_SESSIONS_RANGE` | → background | `{ days }` | 历史会话 |
| `SWITCH_TO_STUDY` | → background | — | session |
| `SWITCH_TO_REST` | → background | — | session |
| `ADD_TEMP_WHITELIST` | → background | `{ domain }` | `{ domain, expiresAt }` |
| `GET_TEMP_WHITELIST` | → background | — | tempWhitelist |
| `HEARTBEAT` | content → background | `{ state }` | `{ ok }` |
| `SHOW_WARNING` | background → content | `{ minutesLeft, domain }` | — |
| `SHOW_OVERLAY` | background → content | `{ message, reason }` | — |
| `REMOVE_OVERLAY` | background → content | — | — |

---

## 7. 待实现功能（v2.0）

- [ ] `studyList` / `allowList` 字段替换现有 `whitelist`
- [ ] 自动切换学习模式（autoStudyCounter 逻辑）
- [ ] HEARTBEAT 按 studyList/allowList 区分计学习时长
- [ ] `free` 模式删除，`restoreSession` 默认进 `study`
- [ ] popup 新增在线时长展示
- [ ] admin 白名单页拆分为「学习网站」和「允许网站」
- [ ] admin 新增自动切换配置项
