# TimeOnChrome 测试规范文档

版本：1.6.0  
更新：2026-04-14  
测试架构：Unit (Node.js) + API (HTTP) + E2E (Playwright)

---

## 一、测试架构总览

```
tests/
├── unit/
│   ├── logic.test.js              # 纯工具函数（43 用例）
│   ├── background-logic.test.js  # 客户端核心逻辑（80 用例）
│   └── workers-logic.test.js     # Workers 纯函数（34 用例）
├── api/
│   └── workers.test.js            # Workers API 集成测试（52 用例）
├── e2e/
│   └── extension.test.js          # Extension UI（9 用例）
└── run-all.js                     # 统一入口
```

**运行命令：**
```
node tests/run-all.js
```

---

## 二、功能覆盖矩阵

### 2.1 PRD 核心功能 vs 测试覆盖

| PRD ID | 功能 | 单元 | API | E2E | 覆盖评级 |
|--------|------|------|-----|-----|---------|
| F-08 | 心跳机制（active/passive 分类） | ⚠️ 部分 | — | — | **B** |
| F-09 | 三类计时规则 | ✅ | — | — | **A** |
| F-03 | 四档配额（online/study/rest/undetermined） | ✅ | ✅ | ✅ | **A** |
| F-04 | 单域名配额 | ✅ | — | — | **A** |
| F-05 | 周配额 | ✅ | ✅ | — | **A** |
| F-02 | 向明天借时间（有效期/边界） | ✅ | — | ✅ | **B** |
| F-06/07 | 自动切换学习模式（90s计数器） | ✅ | — | — | **A** |
| F-01 | 加入 compositeList + 通知家长 | — | ✅ | ✅ | **B** |
| F-10 | 时间段管控（schedule） | ✅ | — | ✅ | **A** |
| 安全 | unsafeList 硬拦截 | ✅ | — | ✅ | **A** |
| F-12 | 配置拉取/推送/版本保护 | — | ✅ | — | **B** |
| F-14 | 跨设备配额同步 | — | ✅ | — | **B** |
| F-11 | 设备绑定/注册流程 | — | ✅ | ✅ | **A** |
| F-13 | 会话上传/审核/申诉 | — | ✅ | — | **B** |
| F-15 | 邮件通知（composite_add） | — | ✅ | — | **B** |
| F-16/17 | 管理员密码/配置完整性 | — | — | ✅ | **C** |
| F-18 | 设备监控开关 | — | ✅ | — | **B** |

> 评级：A = 核心路径全覆盖 / B = 主干覆盖，边界待补 / C = 仅冒烟

---

## 三、现有测试用例清单

### 3.1 `tests/unit/logic.test.js`（43 用例）

#### extractDomain（8 用例）
| TC | 输入 | 期望 |
|----|------|------|
| U-D01 | `https://www.example.com/path` | `example.com` |
| U-D02 | `http://sub.domain.co/` | `sub.domain.co` |
| U-D03 | `https://www.google.com` | `google.com`（www剥离）|
| U-D04 | `chrome://settings` | `settings`（纯解析，无过滤）|
| U-D05 | `chrome-extension://abc/popup.html` | `abc` |
| U-D06 | `about:blank` | `""` |
| U-D07 | `not a url` | `null` |
| U-D08 | `""` | `null` |

#### matchDomain（8 用例）
| TC | 输入 | 期望 |
|----|------|------|
| U-M01 | `example.com` vs `example.com` | true |
| U-M02 | `sub.example.com` vs `example.com` | true（子域名）|
| U-M03 | `www.example.com` vs `example.com` | true（www剥离）|
| U-M04 | `example.com` vs `www.example.com` | true（pattern www剥离）|
| U-M05 | `a.b.example.com` vs `example.com` | true（深层子域）|
| U-M06 | `evil.com` vs `example.com` | false |
| U-M07 | `notexample.com` vs `example.com` | false（后缀非独立段）|
| U-M08 | `example.com` vs `sub.example.com` | false（顺序不对）|

#### formatDate（4 用例）
| TC | 输入 | 期望 |
|----|------|------|
| U-F01 | `new Date(2026, 3, 14)` | `2026-04-14` |
| U-F02 | `new Date(2026, 0, 5)` | `2026-01-05`（零填充）|
| U-F03 | `new Date(2025, 11, 31)` | `2025-12-31` |
| U-F04 | 本地 00:30 | 当天日期（不偏移至 UTC 昨天）|

#### isWithinSchedule（3 用例）
| TC | 场景 | 期望 |
|----|------|------|
| U-S01 | 所有星期均 disabled | false |
| U-S02 | 今天 enabled，窗口 00:00-23:59 | true |
| U-S03 | 今天 enabled，窗口 00:00-00:01 | 取决于当前分钟 |

#### getTodayEffectiveRestLimit（7 用例）
| TC | 场景 | 期望 |
|----|------|------|
| U-B01 | 无借用记录 | baseLimit |
| U-B02 | quotaBorrow = null | baseLimit |
| U-B03 | 今天 = borrowedFrom | baseLimit + amount（借用当天加额）|
| U-B04 | 今天 = borrowedFrom + 1 | baseLimit - amount（还款日减额）|
| U-B05 | 今天 = 其他日期 | baseLimit |
| U-B06 | repaid = true | baseLimit |
| U-B07 | 还款日 amount > baseLimit | 0（clamp）|

---

### 3.2 `tests/unit/background-logic.test.js`（80 用例）

#### Section 1：心跳计时分类（8 用例）

| TC | 模式 | 域名类型 | 心跳 | 计study | 计undet | 计rest |
|----|------|---------|------|---------|---------|--------|
| BL-T01 | study | studyList | active | ✅ | ❌ | ❌ |
| BL-T02 | rest | studyList | active | ❌ | ❌ | ✅ |
| BL-T03 | study | compositeList | active | ❌ | ✅ | ❌ |
| BL-T04 | study | compositeList | passive | ❌ | ✅ | ❌ |
| BL-T05 | rest | 普通 | active | ❌ | ❌ | ✅ |
| BL-T06 | rest | 普通 | passive | ❌ | ❌ | ❌（仅域名计时）|
| BL-T07 | study | 同时在 study+composite | active | ✅ | ❌ | ❌（study优先）|
| BL-T08 | study | studyList子域名 | active | ✅ | ❌ | ❌ |

#### Section 2：配额状态计算（13 用例）

| TC | 场景 | 期望 |
|----|------|------|
| BL-Q01 | 所有配额为 0（不限制）| 全部 false |
| BL-Q02 | totalMinutes ≥ dailyOnlineQuota | onlineLocked |
| BL-Q03 | totalMinutes < dailyOnlineQuota | NOT onlineLocked |
| BL-Q04 | studyMinutes ≥ dailyStudyQuota | studyLocked |
| BL-Q05 | restMinutes ≥ dailyRestQuota | restLocked（非weeklyRestLocked）|
| BL-Q06 | weekRestMinutes ≥ weeklyRestQuota | restLocked + weeklyRestLocked |
| BL-Q07 | undeterminedMinutes ≥ dailyUndeterminedQuota | undeterminedLocked |
| BL-Q08 | studyTime 不计入 rest | restMinutes 正确排除 |
| BL-Q09 | undetermined 不计入 rest | restMinutes 正确排除 |
| BL-Q10 | 借用当天：effectiveRest = base + amount，83 min < 90 → 不锁 | NOT restLocked |
| BL-Q11 | domainQuotas 超限 → 新增 newlyLocked | youtube.com 进入列表 |
| BL-Q12 | 已在 lockedDomains → 不重复添加 | newlyLocked 为空 |
| BL-Q13 | 未超域名配额 → 不添加 | newlyLocked 为空 |

#### Section 3：checkAndRemind 决策路由（21 用例）

| TC | 场景 | 期望 reason |
|----|------|------------|
| BL-R01 | chrome:// URL | 不拦截 |
| BL-R02 | chrome-extension:// URL | 不拦截 |
| BL-R03 | reminder.html URL | 不拦截（跳过自身）|
| BL-R04 | unsafeList 域名（rest 模式）| unsafe |
| BL-R05 | unsafeList 优先于 study_mode | unsafe |
| BL-R06 | schedule disabled（时段外）| schedule |
| BL-R07 | study 模式 + 未分类域名 | study_mode |
| BL-R08 | study 模式 + studyList 域名 | 不拦截 |
| BL-R09 | study 模式 + compositeList 域名 | 不拦截 |
| BL-R10 | rest 模式 + 任意域名（无配额）| 不拦截 |
| BL-R11 | onlineLocked + study 域名（study 模式）| quota_online |
| BL-R12 | onlineLocked + composite 域名 | quota_online |
| BL-R13 | onlineLocked + 普通域名（study 模式）| study_mode（先触发）|
| BL-R14 | onlineLocked + 普通域名（rest 模式）| quota_online |
| BL-R15 | restLocked + study 域名 | 不拦截 |
| BL-R16 | restLocked + composite 域名 | 不拦截 |
| BL-R17 | restLocked + 普通域名 | quota_rest |
| BL-R18 | studyLocked + study 域名 | quota_study |
| BL-R19 | studyLocked + composite 域名 | 不拦截 |
| BL-R20 | undeterminedLocked + composite 域名 | quota_undetermined |
| BL-R21 | undeterminedLocked + study 域名 | 不拦截 |
| BL-R22 | lockedDomains 包含该域名 | quota |
| BL-R23 | legacy blacklist（unsafeList = undefined）| unsafe |
| BL-R24 | 空 unsafeList（[] 为 truthy）→ blacklist 不回退 | study_mode（bug 记录）|

#### Section 4：自动切换学习模式（11 用例）

| TC | 场景 | 期望 action |
|----|------|------------|
| BL-A01 | currentMode = 'study' | skip |
| BL-A02 | autoStudyConfig.enabled = false | skip |
| BL-A03 | 当前 tab 不在 studyList | reset |
| BL-A04 | windowHasFocus = false | reset |
| BL-A05 | userIsIdle = true | reset |
| BL-A06 | 首次进入学习域名（autoStudyDomain = null）| start_tracking |
| BL-A07 | 切换到不同学习域名 | start_tracking（重置计时）|
| BL-A08 | 同一域名，已过 60s（< 90s 阈值）| keep_tracking |
| BL-A09 | 同一域名，已过 91s（>= 90s 阈值）| should_switch |
| BL-A10 | 同一域名，恰好 90s | should_switch（边界值）|
| BL-A11 | 自定义阈值 30s，已过 31s | should_switch |

---

### 3.3 `tests/api/workers.test.js`（52 用例）

| 分组 | 用例数 | 覆盖端点 |
|------|--------|---------|
| Auth | 4 | POST /auth/register, /auth/login |
| Profiles | 3 | POST /profiles, GET /profiles |
| Device Bind | 3 | POST /device/bind, /device/heartbeat |
| Device Config | 7 | GET/PUT /device/config |
| 跨设备配额同步 | 5 | GET /device/quota-state |
| Events | 5 | POST /device/events（含去重逻辑）|
| 会话上传 | 4 | POST /device/sessions/upload |
| Changelog | 2 | POST /device/changelog, GET /profiles/:id/changelog |
| 待定会话 | 5 | GET /device/weekly-sessions, GET pending-reviews, classify |
| 设备管理 | 5 | GET/PATCH/DELETE /profiles/:id/devices |
| 清理 | 2 | DELETE /profiles/:id，验证 token 失效 |

---

### 3.4 `tests/e2e/extension.test.js`（9 用例）

| TC | 测试内容 |
|----|---------|
| E01 | Extension 加载，Service Worker 运行 |
| E02 | Popup 模式按钮渲染 |
| E03 | reminder.html study_mode：3 个按钮，含"加入"/"休息"/"返回" |
| E04 | reminder.html quota_rest：借时间/切换学习/详情 |
| E05 | reminder.html unsafe：仅"返回"，含"安全"文案 |
| E06 | reminder.html schedule：仅"返回" |
| E07 | reminder.html quota_study：含切换休息 |
| E08 | Admin 面板：未登录时显示密码界面 |
| E09 | bind.html 渲染：含绑定相关文字 |

---

## 四、覆盖缺口分析

### 4.1 重要缺口（客户端计时核心）

#### GAP-1：PRD F-09 计时表格 `rest + compositeList + active` 路径未测试

**PRD 规格：**

| 模式 | 域名 | 心跳 | 学习 | 休息 | 待定 | 域名计时 |
|------|------|------|------|------|------|---------|
| rest | compositeList | active | — | — | **+10s** | +10s |

**现有测试** BL-T03/T04 仅在 `study` 模式下测试了 composite 域名。  
**缺口**：未验证 `rest` 模式下 composite 域名计为 undetermined（而非 rest）。

```
// 缺失的测试用例：
// rest模式 + composite域名 + active → countsUndetermined = true, countsRest = false
const config = makeConfig({ mode: 'rest' });
const r = categorizeHeartbeat('youtube.com', config, 'active');
// 期望: countsUndetermined = true, countsRest = false
```

**影响：** 高。这是三时段计时的核心规则之一，若实现有误会导致家长看到错误的休息时长统计。

---

#### GAP-2：配额 = 0 表示"不限制"的行为未明确测试

**规格：** `dailyOnlineQuota = 0` 表示不限制在线时长，`dailyStudyQuota = 0` 表示不限制学习时长。

**现有测试** BL-Q01 仅笼统测了"所有配额为 0 全部不锁"，但没有单独验证每个字段的"0 = 不限"语义。

```
// 缺失的测试用例：
// dailyRestQuota = 0 → effectiveDailyRest = 0 → restLockedByDay 条件 (0 > 0) 为 false → 不锁
const config = makeConfig({ dailyRestQuota: 0 });
const stats = { 'reddit.com': 999999 }; // 无论多久
// 期望: NOT restLocked
```

**影响：** 中。若"0 = 不限"的条件判断有误，会出现零分钟就触发配额锁的 bug。

---

#### GAP-3：借用时间约束条件未测试

**PRD F-02 约束：**
1. 最多借 60 分钟/次
2. 每天只能借一次
3. 周日不可借（防跨周边界）

**现有测试**仅验证了"借用当天/还款日配额数学计算"（U-B03/04），未验证以上三条约束的触发逻辑（BORROW_REST_QUOTA 消息处理）。

**影响：** 中。这些约束保护了借用机制不被滥用。

---

#### GAP-4：配额状态变化（stateChanged）触发机制未测试

**规格：** 当新旧 `quotaState` 不同时（如从 `false → true`），才触发通知和 Tab 重定向。若配额已锁定（`true → true`），不重复触发。

**现有测试**只测了最终状态（`newState`），未测试 state transition 逻辑。

```
// 缺失的测试用例：
// oldState.restLocked = true, newState.restLocked = true → stateChanged = false（不重复通知）
// oldState.restLocked = false, newState.restLocked = true → stateChanged = true（触发通知）
```

**影响：** 中。若 transition 逻辑有误，可能导致每次配额检查都反复触发通知和 Tab 重定向。

---

#### GAP-5：心跳 active/passive 判断逻辑未测试（content.js）

**PRD F-08 规格：**
- `active`：60 秒内有键鼠操作 + 页面可见
- `passive`：媒体播放中（video/audio/AudioContext），页面可见或不可见

**现有测试**对 content.js 零覆盖。这部分逻辑无法在 Node.js 中测试（依赖 DOM 事件），也未在 E2E 中验证。

**影响：** 低（content.js 逻辑简单，改动频率低），但若 active/passive 判断失误，所有计时统计都会偏移。

---

### 4.2 次要缺口

| 缺口 | 描述 | 影响 |
|------|------|------|
| GAP-6 | `getWeekRestSeconds` 跨周计算逻辑（Mon=周一起点）未单独单元测试 | 低 |
| GAP-7 | compositeList 加入流程的完整 E2E（点击按钮→addComposite→跳转）未测试 | 低 |
| GAP-8 | 每日重置（`resetDailyLockedDomains`）：重置后 quotaState 清零，防重复触发 | 低 |
| GAP-9 | config HMAC 完整性校验（F-17）：哈希不匹配时合并默认值的行为 | 低 |
| GAP-10 | `monitoring_enabled = 0` 时扩展跳过所有拦截逻辑 | 低 |

---

## 五、已发现的 Bug

测试过程中确认了以下 2 个生产 bug：

### BUG-1：`GET /profiles/:id/changelog` 路由死角

**现象：** 返回 404  
**根因：** `workers/src/index.ts` 将所有 `/profiles/*` 请求分发给 `profilesRouter`，但 changelog 的 GET 处理在 `changelogRouter` 中，dispatch 逻辑没有添加专属规则，永远不会到达。  
**影响：** Admin 面板的"配置变更日志"功能失效（不可查看历史记录）  
**位置：** `workers/src/index.ts` 路由分发逻辑  
**修复：** 在 index.ts 中为 `/profiles/:id/changelog` 添加专属路由，分发至 `changelogRouter`

### BUG-2：`unsafeList = []` 时 `blacklist` 兼容回退失效

**现象：** `config.unsafeList || config.blacklist` 中，`[]` 为 truthy，blacklist 永远不被使用  
**根因：** JS 空数组是 truthy 值  
**影响：** 从旧版本升级的用户，若迁移后 `unsafeList = []`（空数组）但保留了 `blacklist` 数据，不安全网站拦截失效  
**位置：** `background.js checkAndRemind()` L1767  
**修复：** 改为 `const unsafeList = (config.unsafeList?.length ? config.unsafeList : null) || config.blacklist || []`

---

## 六、补充测试用例（待实现）

以下用例对应 GAP-1 至 GAP-4，建议在 `background-logic.test.js` 中补充：

```javascript
// GAP-1: rest模式下composite域名计undetermined
section('Timing: rest mode + composite (GAP-1)');
{
  const config = makeConfig({ mode: 'rest' });
  const r = categorizeHeartbeat('youtube.com', config, 'active');
  check('rest + composite + active → countsUndetermined', r.countsUndetermined);
  check('rest + composite + active → NOT countsRest', !r.countsRest);
}
{
  // rest + 普通域名 + passive → 仅计域名时长（PRD F-09最后一行）
  const config = makeConfig({ mode: 'rest' });
  const r = categorizeHeartbeat('instagram.com', config, 'passive');
  check('rest + ordinary + passive → NOT countsRest', !r.countsRest);
  check('rest + ordinary + passive → NOT countsStudy', !r.countsStudy);
  check('rest + ordinary + passive → NOT countsUndetermined', !r.countsUndetermined);
  check('rest + ordinary + passive → countsTotal (domain time only)', r.countsTotal);
}

// GAP-2: dailyRestQuota = 0 → 不锁定
section('Quota: zero means unlimited (GAP-2)');
{
  const config = makeConfig({ dailyRestQuota: 0 });
  const stats = { 'reddit.com': 999999 };
  const { newState } = computeQuotaState(config, stats, {}, 0, '2026-04-14');
  check('dailyRestQuota=0 → effectiveDailyRest=0 → NOT restLocked', !newState.restLocked);
}
{
  const config = makeConfig({ dailyUndeterminedQuota: 0 });
  const { newState } = computeQuotaState(config, {}, { 'youtube.com': 999999 }, 0, '2026-04-14');
  check('dailyUndeterminedQuota=0 → NOT undeterminedLocked', !newState.undeterminedLocked);
}

// GAP-4: stateChanged detection
section('Quota: state transition detection (GAP-4)');
{
  function stateChanged(oldState, newState) {
    return newState.onlineLocked !== oldState.onlineLocked ||
           newState.studyLocked  !== oldState.studyLocked  ||
           newState.restLocked   !== oldState.restLocked   ||
           newState.undeterminedLocked !== oldState.undeterminedLocked;
  }
  const unchanged = stateChanged(
    { onlineLocked: true, studyLocked: false, restLocked: false, undeterminedLocked: false },
    { onlineLocked: true, studyLocked: false, restLocked: false, undeterminedLocked: false }
  );
  check('same state → stateChanged = false（不重复通知）', unchanged === false);

  const changed = stateChanged(
    { onlineLocked: false, studyLocked: false, restLocked: false, undeterminedLocked: false },
    { onlineLocked: false, studyLocked: false, restLocked: true,  undeterminedLocked: false }
  );
  check('restLocked: false→true → stateChanged = true', changed === true);
}
```

---

## 七、测试执行结果（当前状态）

```
[Unit]     logic.test.js              43/43  ✓
[Unit]     background-logic.test.js   80/80  ✓
[Unit]     workers-logic.test.js      34/34  ✓
[API]      workers.test.js            52/52  ✓
[E2E]      extension.test.js           9/9   ✓
─────────────────────────────────────────────
总计                                  218/218 ✓
```

---

## 八、测试运行说明

```bash
# 全套运行（约 30 秒）
node tests/run-all.js

# 只跑单元测试（< 1 秒，纯离线）
node tests/unit/logic.test.js
node tests/unit/background-logic.test.js

# 只跑 API 测试（需要网络，约 10 秒）
node tests/api/workers.test.js

# 只跑 E2E（需要 Chromium，约 15 秒，非 headless）
npx playwright test tests/e2e/extension.test.js --config=playwright.config.js
```

**注意：**
- E2E 测试不支持 headless 模式（Chrome Extension 限制）
- API 测试每次生成唯一测试账号，并在结束时自动删除 profile（账号本身无法删除，将保留在数据库）
- Unit 测试完全离线，无任何外部依赖
