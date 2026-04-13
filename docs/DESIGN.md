# TimeOnChrome — 技术设计文档

版本：1.6.0
更新：2026-04-14

---

## 1. 架构概览

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
│  │  - 状态管理 (study/rest mode)                      │     │
│  │  - 计时核心 (HEARTBEAT × 3 分类)                   │     │
│  │  - 提醒触发 (checkAndRemind / redirectToReminder)  │     │
│  │  - 配置存储 (chrome.storage.local)                 │     │
│  │  - 云同步   (cloudRequest → Workers API)           │     │
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

  // 时间段管控
  schedule: {
    enabled: false,
    days: {
      0: { enabled: true, start: '08:00', end: '21:00' },
      // 1-6 同上...
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

### 3.2 心跳计时（content.js → background.js）

**content.js 发送逻辑（每 10 秒）**：

```
getActivityState():
  1. AudioContext 或 video/audio 正在播放 → 'passive'
  2. document.hidden → 'hidden'（不发送）
  3. 近 60 秒有键鼠操作 → 'active'
  4. 否则 → 'idle'（不发送）

sendMessage({ type: 'HEARTBEAT', state: 'active' | 'passive' })
```

**background.js HEARTBEAT 处理**：

```
收到 HEARTBEAT(state, tabId):
  if sender.tab.active === false → 忽略
  if !monitoring_enabled → 忽略

  domain = extractDomain(sender.tab.url)
  isStudy = studyList.includes(domain)
  isComposite = compositeList.includes(domain)

  addDomainTime(domain, 10)           // 始终计域名时长

  if state === 'active':
    if mode === 'study' && isStudy:
      studySeconds += 10
    elif isComposite:
      undeterminedSeconds += 10
    elif mode === 'rest':
      restSeconds += 10

    checkAutoStudySwitch(domain)      // 自动切换学习模式逻辑

  checkAllTabsQuota()                 // 检查配额是否触发锁定
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

### 3.5 云同步

```javascript
// Pull（每次 Chrome 启动时）
pullCloudConfig():
  res = await cloudRequest('GET', '/device/config')
  if res.version <= localConfig.version → 跳过
  // 保护本地状态字段（不被云端覆盖）
  merged = { ...remoteConfig, quotaState: local.quotaState,
             lockedDomains: local.lockedDomains }
  saveConfig(merged)

// Push（配置变更时）
pushConfigToCloud():
  await cloudRequest('PUT', '/device/config', { config, version })
```

### 3.6 事件上报与邮件通知

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

## 4. 消息协议（sendMessage）

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
├── manifest.json              MV3 扩展清单，版本 1.6.0
├── background.js              Service Worker 核心逻辑
├── content.js                 注入每个页面：心跳、媒体检测、覆盖层
├── content.css                content.js 注入的样式
├── reminder.html              提醒页 HTML（7 种场景）
├── reminder.js                提醒页逻辑：场景渲染、操作按钮处理
├── popup/
│   ├── popup.html             扩展弹窗 UI（孩子只读激励视图）
│   └── popup.js               弹窗逻辑
├── admin/
│   ├── admin.html             管理面板 UI（家长，密码保护）
│   └── admin.js               管理面板逻辑
├── utils/
│   └── storage.js             存储工具（未被使用，待清理）
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
│   └── index.html             单页应用
└── docs/
    ├── PRD.md                 产品需求文档
    ├── DESIGN.md              本文档
    ├── CHANGELOG.md           变更记录
    ├── TODO.md                待办事项
    └── conversation-log/      会话记录存档
```

---

## 6. Chrome API 使用

| API | 用途 |
|-----|------|
| `chrome.storage.local` | 配置、统计、会话持久化 |
| `chrome.declarativeNetRequest` | unsafeList 域名重定向规则 |
| `chrome.webNavigation.onCommitted` | 导航拦截，触发 checkAndRemind |
| `chrome.tabs` | 获取/更新标签页状态 |
| `chrome.alarms` | 定时任务：配额检查、每日重置、保活 |
| `chrome.notifications` | 系统通知（配额锁定等）|
| `chrome.runtime.sendMessage` | popup/admin/content ↔ background 通信 |

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
