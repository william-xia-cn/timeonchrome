> **ARCHIVED / Historical evidence only.** This file is preserved for audit/history and must not be used as the current product source of truth. Use `AGENTS.md`, `PROJECT_MASTER.md`, `TASK_BOARD.md`, `DECISIONS.md`, and the current authority documents instead.

# TimeOnChrome 时间管理体系重构方案

## Context

当前系统的时间分类是二分法（studyList = 学习，其他 = 休息），存在以下核心问题：
1. allowList 域名（Google/Wikipedia）被计入休息时长，虚高休息数据
2. 同一域名（YouTube）可能是学习也可能是娱乐，无法区分
3. 临时放行是完全自助 + 全局配额旁路 + 无限续期，形同虚设
4. 配额仅有日维度，缺乏周维度的弹性调控

本方案将时间管理从"二分法"升级为"三时段模型"，引入会话级追踪、家长审核分流、以及日+周双层配额体系。

---

## 一、三时段分类模型

### 1.1 三个时间桶

| 时段集 | 来源 | 说明 |
|--------|------|------|
| **学习时段** | `studyList` 域名 | 时间直接计入学习时长，无需审核 |
| **待定时段** | `compositeList` 域名（原 allowList 重命名） | 按会话追踪标题，待家长审核后分流进学习或休息 |
| **休息时段** | 不在 studyList 和 compositeList 中的所有域名 | 时间直接计入休息时长 |

- `blacklist` 保持不变：始终拦截，不产生时间记录
- 白名单模式下：`studyList + compositeList` 可访问，其余拦截
- 黑名单模式下：`blacklist` 拦截，其余可访问（分别归入对应桶）

### 1.2 临时放行重新定义

**旧设计**：孩子申请 → 立即放行 + 全局配额旁路 → 无限续期  
**新设计**：孩子申请 → 网站加入 compositeList → 消耗未定配额（2h/日）→ 家长事后审核

- 完全自助，无需密码
- 未定配额耗尽后，该类网站当天不可访问（非全局旁路）
- 不再有 `tempExemptions.quotaUntil` 全局配额免检
- 不再绕过时间段限制（schedule）

---

## 二、会话级标题追踪

### 2.1 追踪机制

对 `compositeList` 中的域名，扩展记录每个**标题变化**为一个会话段：

```
数据结构（每条会话记录）：
{
  domain: "youtube.com",
  title: "MIT Linear Algebra Lecture 1 - YouTube",
  startTime: 1713000000000,
  duration: 1500,        // 秒
  date: "2026-04-14",
  classification: null   // null=未定, "study", "rest"
}
```

- 标签页标题发生变化（如 YouTube 切换视频）→ 结束当前会话段，开始新会话段
- 仅对 compositeList 域名启用标题追踪，studyList 和其他域名只记域名+时长（现有逻辑）
- 数据随 stats 一起上传到云端

### 2.2 关键文件变更

- `background.js`：`beginVisitSession` / `updateVisitSession` 增加标题追踪逻辑
- `content.js`：监听 `document.title` 变化并上报 background
- Worker `stats.ts`：新增会话详情上传/存储接口
- D1 新增 `composite_sessions` 表

---

## 三、家长审核流程

### 3.1 审核界面（Web 控制台）

家长在控制台看到待审核会话列表，**按标题关键词自动分组**：

```
自动分组示例：
┌─ 组 1: 含 "Lecture" / "Tutorial"（建议: 学习）
│   - "MIT Linear Algebra Lecture 1 - YouTube" · 25分钟
│   - "Python Tutorial for Beginners - YouTube" · 40分钟
│   [✅ 全部标记为学习] [❌ 全部标记为休息] [逐条处理]
│
├─ 组 2: 含 "Minecraft" / "Gaming"（建议: 休息）  
│   - "Minecraft Survival EP.47 - YouTube" · 35分钟
│   [✅ 全部标记为学习] [❌ 全部标记为休息] [逐条处理]
│
└─ 组 3: 未匹配（需人工判断）
    - "The Fall of Rome - YouTube" · 20分钟
    [学习] [休息]
```

### 3.2 判定影响范围（家长可选）

家长审核时可选择判定的适用范围：

| 范围 | 操作 | 效果 |
|------|------|------|
| 仅此会话 | 默认选项 | 只影响这一条记录的时长归属 |
| 匹配标题关键词 | 家长指定关键词如 "MIT" | 未来含该关键词的同域名会话自动继承分类 |
| 整个域名 | 家长将域名永久移至 studyList 或从 compositeList 移除 | 未来该域名所有访问按新分类计算 |

已有的关键词规则存储在 profile config 中（如 `classificationRules`），下次同域名新会话自动匹配。

### 3.3 孩子侧：待定时段透明化与申诉机制

孩子在扩展端（popup 或 admin 面板）可以看到：

**本周待定时段全览：**
```
本周待定时段（4月14日 - 4月20日）
────────────────────────────────────
周一  YouTube · "MIT Linear Algebra" · 25分钟  → 判定：学习 ✅
周一  YouTube · "Minecraft EP.47" · 35分钟     → 判定：休息 ⚠️ [申诉]
周二  Bilibili · "物理实验演示" · 20分钟        → 待审核 ⏳
周三  Reddit · "r/learnprogramming" · 15分钟   → 待审核 ⏳
```

**申诉流程：**
1. 孩子看到已判定的会话，认为分类不当 → 点击「申诉」按钮
2. 可选填申诉理由（如"这是老师布置的作业视频"）
3. 申诉提交后，家长收到邮件/控制台通知
4. 家长在控制台查看申诉详情 → 维持原判 / 改判
5. 改判后时长立即回写到对应时段集

**申诉规则：**
- 以周为边界，仅可申诉本周内的判定，跨周不支持
- 每条会话仅限申诉一次（家长二次判定为终审）
- 申诉不影响当前配额执行（在终审前维持原判定）

### 3.4 审核缺失时的处理

- 未审核的会话**保持待定状态**，不自动降级
- 不让孩子为家长的不作为买单——待定时长不回溯扣减休息配额
- 存在待审核会话时，系统通过 Resend 发邮件通知家长
- 通知频率：每天最多一次（晚间），有新待审核时才发
- 存在未处理申诉时，额外触发一次通知

---

## 四、配额体系

### 4.1 三时段配额

| 配额 | 默认值 | 说明 |
|------|--------|------|
| 日休息配额 | 2h | 休息时段的每日上限 |
| 周休息配额 | 日配额 × 7（默认 14h） | 休息时段的每周上限（周一起算），硬上限；允许独立配置 |
| 日未定配额 | 2h | 待定时段的每日上限，独立于休息时段 |
| 学习配额 | 无上限 | 暂不限制学习时长（后续讨论是否设下限） |

### 4.2 休息配额借用规则

```
规则：
1. 可向明天借最多 1h（不超过日配额）
2. 次日必须还（次日可用 = 日配额 - 借用量）
3. 还清前禁止再借（连续借用禁止）
4. 禁止跨周借用（周日不能借下周一）
5. 周配额是硬上限（无论怎么借，周总量不能超）
```

借用状态存储在 config 中：
```javascript
quotaBorrow: {
  borrowedFrom: "2026-04-15",  // 从哪天借的
  amount: 60,                  // 借了多少分钟
  repaid: false                // 是否已还
}
```

### 4.3 未定配额说明

- 日 2h 独立计算，不可借用
- 审核后时长分流：
  - 分流为学习 → 不影响任何配额
  - 分流为休息 → 计入当天的周休息总量（日配额已过不追溯，周配额兜底）
- 未审核时长不计入任何配额（保持挂起）

### 4.4 配额检查改造

现有 `checkAllTabsQuota()` 需重构为三时段独立检查：

```
检查顺序：
1. 在线总配额（可选保留）
2. 休息时段：日配额 + 周配额（含借用逻辑）
3. 待定时段：日配额 2h
4. 学习时段：暂不限制
```

锁定行为：
- 休息时段满 → 拦截所有非 studyList / compositeList 域名
- 待定时段满 → 拦截所有 compositeList 域名（但 studyList 不受影响）
- 两者独立，互不影响

---

## 五、数据模型变更

### 5.1 D1 新增表

```sql
-- 复合型网站会话记录
CREATE TABLE composite_sessions (
  id TEXT PRIMARY KEY,
  profile_id TEXT NOT NULL,
  device_id TEXT,
  domain TEXT NOT NULL,
  title TEXT NOT NULL,
  date TEXT NOT NULL,          -- YYYY-MM-DD
  start_time INTEGER NOT NULL, -- Unix ms
  duration INTEGER NOT NULL,   -- 秒
  classification TEXT,         -- null / 'study' / 'rest'
  classified_by TEXT,          -- null / 'parent' / 'rule'
  classified_at INTEGER,       -- 审核时间
  FOREIGN KEY (profile_id) REFERENCES profiles(id)
);

CREATE INDEX idx_cs_profile_date ON composite_sessions(profile_id, date);
CREATE INDEX idx_cs_pending ON composite_sessions(profile_id, classification) 
  WHERE classification IS NULL;

-- 申诉记录
CREATE TABLE session_appeals (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,       -- 关联 composite_sessions.id
  profile_id TEXT NOT NULL,
  reason TEXT,                    -- 孩子填写的申诉理由
  status TEXT DEFAULT 'pending',  -- pending / upheld(维持) / overturned(改判)
  original_classification TEXT,   -- 原判定
  new_classification TEXT,        -- 改判后的分类（仅 overturned 时有值）
  created_at INTEGER NOT NULL,
  resolved_at INTEGER,
  FOREIGN KEY (session_id) REFERENCES composite_sessions(id),
  FOREIGN KEY (profile_id) REFERENCES profiles(id)
);

CREATE INDEX idx_appeals_profile ON session_appeals(profile_id, status);
```

### 5.2 Profile config 新增字段

```javascript
{
  // 原有字段...
  compositeList: [...],          // 替代 allowList
  classificationRules: [         // 审核规则（自动匹配）
    { domain: "youtube.com", keyword: "MIT", classification: "study" },
    { domain: "youtube.com", keyword: "Gaming", classification: "rest" },
  ],
  weeklyRestQuota: null,          // 周休息配额（分钟），null 表示跟随日配额×7；允许独立配置
  dailyUndeterminedQuota: 120,   // 日未定配额（分钟），默认 2h
  quotaBorrow: { ... },          // 借用状态
}
```

### 5.3 本地 extension 存储

```javascript
// chrome.storage.local 新增
undetermined_stats_YYYY-MM-DD: {   // 待定时段每日统计
  "youtube.com": 1500,             // 秒
  "bilibili.com": 600
},
composite_sessions_local: [...]    // 待上传的会话记录（含标题）
```

---

## 六、Worker API 变更

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/device/composite-sessions` | 上传复合型会话记录（含标题） |
| GET | `/device/weekly-sessions` | 设备端拉取本周待定时段全览（含判定状态） |
| POST | `/device/appeal` | 孩子提交申诉（session_id + reason） |
| GET | `/profiles/:id/pending-reviews` | 获取待审核会话列表（自动分组） |
| GET | `/profiles/:id/appeals` | 获取待处理申诉列表 |
| POST | `/profiles/:id/classify` | 家长提交分类结果 |
| POST | `/profiles/:id/resolve-appeal` | 家长处理申诉（维持/改判） |
| POST | `/profiles/:id/classification-rules` | 家长添加自动分类规则 |
| GET | `/device/quota-state` | 增加返回待定时段和借用状态 |

---

## 七、关键文件清单

| 文件 | 变更类型 | 说明 |
|------|----------|------|
| `background.js` | 重构 | 三时段配额、会话标题追踪、借用逻辑、临时放行重写 |
| `content.js` | 增强 | 监听 title 变化上报 |
| `blocked.js` | 重写 | 临时放行改为"加入复合型列表" |
| `popup/popup.html` | 增强 | 本周待定时段全览 + 申诉入口 |
| `admin/admin.html` | 增强 | 本周待定时段全览 + 申诉入口 |
| `workers/src/routes/device.ts` | 增强 | 新增 composite-sessions 上传、quota-state 增强 |
| `workers/src/routes/profiles.ts` | 增强 | 审核接口、分类规则接口 |
| `workers/src/routes/events.ts` | 增强 | 待审核邮件通知 |
| `workers/schema.sql` | 新增表 | composite_sessions |
| `pages/index.html` | 大改 | 审核界面、周配额展示、借用状态 |

---

## 八、实施顺序建议

分三个阶段，每阶段可独立部署测试：

**Phase 1 — 三时段分类基础**
1. allowList → compositeList 重命名及语义变更
2. 三时段时间统计（学习/未定/休息）
3. 待定时段独立 2h/日 配额
4. 临时放行重写（加入 compositeList + 消耗未定配额）
5. 移除旧的 tempExemptions 全局配额旁路

**Phase 2 — 会话追踪与审核**
6. content.js 标题变化监听
7. 复合型会话记录（本地 + 上传）
8. 控制台审核界面（自动分组 + 批量分类）
9. 分类规则引擎（关键词匹配 + 自动继承）
10. 孩子侧本周待定时段全览（popup + admin）
11. 申诉机制（孩子提交 → 家长通知 → 维持/改判）
12. 待审核 + 申诉邮件通知

**Phase 3 — 周配额与借用**
11. 周配额上限
12. 日间借用机制
13. 控制台周视图
14. 跨设备配额同步适配三时段模型

---

## 九、验证方案

### Phase 1 验证
- 访问 studyList 域名 → 时间归入学习时段
- 访问 compositeList 域名 → 时间归入待定时段，2h 后被拦截
- 访问其他域名 → 白名单模式拦截 / 黑名单模式归入休息时段
- 被拦截页面点击临时放行 → 域名加入 compositeList → 刷新后可访问
- 未定配额满 → compositeList 域名被拦截，studyList 不受影响
- 不再有全局配额旁路行为

### Phase 2 验证
- 在 YouTube 切换视频 → 每个视频生成独立会话记录（含标题）
- 控制台显示待审核列表，按关键词自动分组
- 家长批量分类 → 时长回写到对应时段集
- 家长设规则 "YouTube + Lecture = 学习" → 未来匹配的会话自动分类
- 有待审核时收到邮件通知
- 孩子在 popup/admin 看到本周所有待定时段及判定结果
- 孩子对"休息"判定发起申诉 → 家长收到通知 → 改判为"学习" → 时长即时回写
- 同一会话二次申诉被拒绝（终审机制）
- 跨周后上周申诉入口消失

### Phase 3 验证
- 周一用了 4h 休息（借了 1h）→ 周二可用 = 日配额 - 1h
- 周二有欠债 → 无法借周三
- 周日不能借下周一
- 周休息总量达到上限 → 即使日配额未满也不可使用
