# TimeOnChrome V0 Mode Transition UX Design

## 0. 文档定位

本文定义 TimeOnChrome V0 中的三模式切换体验与页面提示规则。

本文目标不是完整实现 V1 的 AI 内容分类、路径级分类或综合时间二级后判断，而是在 V0 中完成一个低摩擦、可解释、可见、可控的模式切换体验。

本文应与以下文件保持一致：

- `PROJECT_MASTER.md`
- `TASK_BOARD.md`
- `DECISIONS.md`
- `SITE_ACCESS_POLICY.md`
- `docs/site-access-config.example.json`

### Mode / quota routing source of truth

Specific behavior for each current mode, target site type, quota state, temporary Composite allowance state, Reminder page, and in-page notice is defined in `docs/MODE_QUOTA_ROUTING_MATRIX_V0.md`. This UX document defines visual structure and interaction style; the matrix document defines routing and quota behavior.

### V1-minimal 覆盖说明（time borrowing）

```text
本文件包含部分 V0 历史借用文案与交互说明，仅作历史设计记录。
在当前 V1-minimal 范围内，time borrowing / borrow quota 实现路径已禁用，不作为活跃发布行为。
如与 D-034 或 V1-minimal 范围文档冲突，以 PROJECT_MASTER.md / TASK_BOARD.md / DECISIONS.md 为准。
```

V0 产品可见模式定义（本文件生效范围）：

1. Study（学习）
2. Composite（综合）
3. Rest（休息）
4. Paused（暂停/监控关闭）

---

## 1. 背景

TimeOnChrome 面向学生学习场景，需要管理 Chrome 使用行为中的三类状态：

1. 学习模式
2. 综合模式
3. 休息模式

模式不是 UI 按钮概念，而是系统对当前 Chrome 使用场景的判定。

模式决定：

1. 当前访问规则；
2. 当前时间归属；
3. 当前消耗的时间配额；
4. 是否需要页面提示；
5. 是否允许自动回到更专注状态。

---

## 2. V0 核心目标

V0 必须让孩子第一次上手时做到：

```text
学习网站：直接使用
综合网站：解释后使用
非学习非综合站点：按规则提示后使用
回到学习：自动回来
当前模式：始终可见
剩余时间：在关键切换处可见
```

V0 重点不是做完整智能判断，而是避免以下问题：

1. 用户不知道当前处于什么模式；
2. 用户不知道为什么被提示或拦截；
3. 用户不知道时间被算到哪里；
4. 用户无感消耗综合 / 休息配额；
5. 学习 → 休息切换太轻，变成习惯性点击；
6. 综合模式被误解为娱乐放行通道。

---

## 3. V0 范围

### 3.1 In Scope

V0 包含：

1. 三模式基础 UX：
   - 学习模式；
   - 综合模式；
   - 休息模式。

2. 模式切换提示：
   - 学习 → 综合：自动切换 + 45s 轻提示；
   - 休息 → 综合：自动切换 + 轻提示；
   - 学习 → 休息：滑动对齐确认；
   - 综合 → 学习：自动回归；
   - 休息 → 学习：自动回归；
   - 综合 → 休息：普通确认。

3. 当前模式可见：
   - Badge 显示当前模式；
   - Popup 显示当前模式、当前网站、剩余配额。

4. 时间归属说明：
   - 学习时间；
   - 综合时间；
   - 休息时间。

5. 配额提示：
   - 综合时间剩余；
   - 休息时间剩余。

### 3.2 Out of Scope

V0 不包含：

1. AI 内容分类；
2. 综合学习 / 综合休息 / 其他综合二级归类；
3. Reddit 路径级分类；
4. YouTube 视频级分类；
5. 搜索关键词级判断；
6. 复杂图案拖动；
7. Z 字形拖动；
8. 九宫格解锁；
9. 文本输入确认；
10. 家长审批流；
11. 完整 V1 内容解释系统；
12. 用户导入导出格式变化；
13. 系统默认网站清单大扩容。
14. 将当前时间借用实现纳入 V1-minimal 发布范围（借用需求保留，迁移后续重设计）。

---

## 4. 模式定义

### 4.1 学习模式

学习模式表示：

```text
当前 Chrome 使用被系统判定为明确学习状态。
```

典型情况：

- 当前网站属于 `effectiveStudyList`；
- 用户正在访问学习平台、文档、作业、编程、课程、考试、研究或低娱乐风险生产力工具。

时间归属：

```text
studySeconds
```

默认配额：

```text
学习时间默认不限额
```

### 4.2 综合模式

综合模式表示：

```text
当前 Chrome 使用的网站在 domain 层无法稳定判断为学习或休息，需要先进入未定状态。
```

典型情况：

- 当前网站属于 `compositeList`；
- 例如搜索引擎、YouTube、百科、问答社区、音乐 / 音频网站等。

时间归属：

```text
compositeSeconds
```

默认配额：

```text
综合时间默认每天 2 小时
```

长期解释：

```text
compositeSeconds 未来可以二级解释为：
- compositeStudySeconds
- compositeRestSeconds
- compositeOtherSeconds
```

但 V0 不实现二级解释。

重要原则：

```text
综合时间不是被污染的学习时间或休息时间。
综合时间本身就是用途未定、等待后续解释的独立一级时间。
```

### 4.3 休息模式

休息模式表示：

```text
当前 Chrome 使用被系统判定为休息、娱乐或自由使用状态。
```

时间归属：

```text
restSeconds
```

默认配额：

```text
休息时间默认每天 2 小时
```

---

## 5. 网站分类与模式关系

本文沿用 `SITE_ACCESS_POLICY.md` 的网站分类。

### 5.1 学习网站

来源：

```text
effectiveStudyList = defaultStudyList + customStudyList
```

行为：

```text
访问学习网站 → 进入或保持学习模式
```

### 5.2 综合网站

来源：

```text
compositeList
```

行为：

```text
访问综合网站 → 进入或保持综合模式
```

V0 采用以下规则：

```text
任意模式 + compositeSite = composite mode
```

原因：

```text
综合网站在 domain 层无法稳定判断用途，因此应先进入综合模式，而不是根据进入前状态提前判定为学习或休息。
```

### 5.3 非学习非综合站点（受限娱乐 / 未归类）

行为：

```text
访问受限娱乐网站或未归类网站时，是否进入休息、是否可借用、是否可申请综合，均由模式/配额路由规则决定。
具体行为以 `docs/MODE_QUOTA_ROUTING_MATRIX_V0.md` 为准。
```

### 5.4 Hard Blocked / unsafe 网站

行为：

```text
命中 hardBlocked / unsafe 规则 → 直接拦截，不参与模式切换。
```

### 5.5 与 `SITE_ACCESS_POLICY.md` 的边界一致性（V0 强约束）

1. `compositeList` 维持窄口径，不因三模式 UX 扩容为“泛娱乐默认可进综合”。
2. 普通门户/社交/游戏网站不默认进入 `compositeList`。
3. `bilibili.com` 在当前策略下保持：
   - 非 Study；
   - 非 Composite；
   - 非 unsafe/hardBlocked；
   - 归属受限娱乐网站（restricted entertainment），除非 Product Owner 后续单独改判。

---

## 6. 模式切换规则

### 6.1 总原则

```text
离开明确学习状态：必须强提示。
进入用途未定状态：按来源模式区分强弱提示。
回到学习状态：自动、低摩擦。
进入休息状态：必须明确告知。
```

### 6.2 切换矩阵

| 当前模式 | 访问网站类型 | 目标模式 | V0 行为 | 提示强度 | 时间归属 |
|---|---|---|---|---|---|
| 学习 | 学习网站 | 学习 | 直接放行 | 无 / 极轻 | studySeconds |
| 学习 | 综合网站 | 综合 | 自动切换 + 45s 轻提示（单行半透 Banner） | 低 | compositeSeconds |
| 学习 | 受限娱乐 / 未归类 | 休息（或综合申请分支） | Reminder（滑动确认 + 条件分支） | 高 | restSeconds / compositeSeconds |
| 学习 | hardBlocked | 无 | 拦截 | 高 | 不计入有效时间 |
| 综合 | 学习网站 | 学习 | 自动回归（45s 前台活跃门控） | 极轻 / 无 | studySeconds |
| 综合 | 综合网站 | 综合 | 继续使用 | 无 / 轻 | compositeSeconds |
| 综合 | 受限娱乐 / 未归类 | 休息（或综合申请分支） | Reminder（滑动确认 + 条件分支） | 中 | restSeconds / compositeSeconds |
| 综合 | hardBlocked | 无 | 拦截 | 高 | 不计入有效时间 |
| 休息 | 学习网站 | 学习 | 自动回归（45s 前台活跃门控） | 极轻 / 无 | studySeconds |
| 休息 | 综合网站 | 综合 | 自动切换（30s 前台稳定停留门控） + 轻提示 | 低 | compositeSeconds |
| 休息 | 受限娱乐 / 未归类 | 休息（具体见路由矩阵） | 继续使用或 Reminder | 无 / 轻 / 中 | restSeconds |
| 休息 | hardBlocked | 无 | 拦截 | 高 | 不计入有效时间 |

> 说明：上表仅保留 UX 级别摘要。精确路由（mode × siteType × quota × temporaryComposite）以 `docs/MODE_QUOTA_ROUTING_MATRIX_V0.md` 为准。具体 reason、allowed actions、forbidden actions 以矩阵文档为准。

---

### 6.3 V0 自动切换稳定门控

V0 自动切换增加稳定门控，避免模式抖动：

1. `Rest -> Composite`：目标网站需在前台连续稳定停留 30 秒（不要求键盘/鼠标操作）；
2. `Rest -> Study`：目标网站需在前台连续活跃 45 秒；
3. `Composite -> Study`：目标网站需在前台连续活跃 45 秒。

门控期约束：

1. 必须监控开启（`monitoringEnabled !== 0`）；
2. `Rest -> Composite` 的门控不依赖 `chrome.idle` 键鼠活跃状态；
3. 期间若发生中断（切换站点/切走目标/监控关闭），候选自动切换取消并重新计时；
4. 门控期内时间归属保持原模式，不做回填（V0 不 backfill candidate time）。

显式确认切换不受此门控影响，仍即时生效：

1. `Study -> Rest`（滑动确认后）；
2. `Composite -> Rest`（确认后）。

## 7. 提示强度分级

### 7.1 L0：无提示 / 状态自然更新

用于：

- 学习 → 学习；
- 综合 → 综合；
- 休息 → 休息。

要求：

- Badge / Popup 状态仍应正确更新。

### 7.2 L1：轻提示

用于：

- 休息 → 综合；
- 综合 → 学习；
- 休息 → 学习；
- 学习 → 综合（自动切换后 45s 轻提示）。

形式：

```text
页面顶部轻量 Banner 或 Toast
```

原则：

```text
自动切换可以低摩擦，但不能黑箱。
```

#### V0 自动切换提示文案模板（按目标模式）

1. Rest → Composite（pending）：
```text
正在使用综合网站 · {secondsRemaining}秒后进入综合时间 · 今日剩余 {remainingCompositeTime}
```

2. Rest → Composite（success）：
```text
已进入综合时间 · 今日剩余 {remainingCompositeTime}
```

2b. Study → Composite（auto notice, 45s）：
```text
你正在打开综合网站 · 即将离开学习时间进入综合时间 · 今日剩余 {remainingCompositeTime}
```

3. Rest → Study（pending）：
```text
正在使用学习网站 · {secondsRemaining}秒后进入学习时间
```

4. Rest → Study（success）：
```text
已进入学习时间
```

5. Composite → Study（pending）：
```text
正在使用学习网站 · {secondsRemaining}秒后进入学习时间
```

6. Composite → Study（success）：
```text
已进入学习时间
```

V0 约束：
```text
Study 相关提示不显示“今日剩余 {remainingStudyTime}”。
“今日剩余”仅用于 Composite 配额提示。
```

#### L1 提示交付稳定性规则（V0 release evidence）

```text
页面提示是 UI projection layer，不是 mode state truth source。
模式切换状态不得依赖提示是否成功显示。
```

为避免同 tab 导航串页与 late-ready 丢提示，V0 交付规则如下：

1. pending success notice 绑定 `tabId + domainSnapshot`；
2. `CONTENT_SCRIPT_READY` 触发 resend 时必须提供 currentDomain；
3. resend guard：
   - `domainSnapshot` 存在且 `currentDomain` 缺失：不重发并清理 pending；
   - `domainSnapshot` 与 `currentDomain` 不一致：不重发并清理 pending；
   - `domainSnapshot` 与 `currentDomain` 一致：允许重发；
   - 两者都缺失：不重发并清理 pending；
4. 保留 TTL、fallback notification、clearPendingNotice 既有行为；
5. 特殊页面无法注入 content script 时，提示可失败但不得反向影响 mode 真值。

### 7.3 L2：普通确认页

用于：

- 综合 → 休息。

形式：

```text
页面级确认
```

要求：

1. 说明当前网站类型；
2. 说明将进入哪个模式；
3. 说明时间计入哪个桶；
4. 显示相关剩余时间；
5. 提供继续与返回操作。

### 7.4 L3：慎重动作确认

用于：

```text
学习 → 休息
```

形式：

```text
滑动对齐确认
```

要求：

1. 不能单击直接进入休息；
2. 必须完成拖动动作；
3. 页面必须显示休息剩余额度；
4. 页面必须说明不会计入学习时间；
5. 必须提供返回学习入口。

---

## 8. 各场景 UX 规格

### 8.1 学习 → 综合（V0 正常路径）

触发：

```text
学习模式下访问 compositeList 网站
```

行为：

```text
自动进入综合模式。
时间计入 compositeSeconds。
显示单行半透轻提示（45 秒）。
```

轻提示文案（固定）：

```text
你正在打开综合网站 · 即将离开学习时间进入综合时间 · 今日剩余 {remainingCompositeTime}
```

要求：

```text
不显示倒计时。
不要求用户确认。
不显示阻断式提醒页。
不依赖 popup。
```

视觉：

```text
单行、半透、紧凑 Banner。
45 秒后自动消失；若域名/标签页/模式变化、监控关闭或页面卸载则提前清理。
```

禁止：

```text
不得使用 to_composite_confirm 作为正常 V0 路径（仅可保留为遗留/兜底路由）。
不得把综合时间计入学习时间。
不得把综合网站临时加入 studyList。
```

### 8.2 休息 → 综合

触发：

```text
休息模式下访问 compositeList 网站
```

行为：

```text
自动进入综合模式。
时间计入 compositeSeconds。
显示轻提示。
```

轻提示文案：

```text
已进入综合时间 · 今日剩余 {remainingCompositeTime}
```

扩展版：

```text
你正在使用综合网站。
这段时间会单独计入「综合时间」。
今日综合时间剩余：{remainingCompositeTime}
```

要求：

```text
不显示整页确认。
不要求用户点击。
不打断浏览。
但必须让用户看见当前时间归属已经变化。
```

### 8.2b 学习 → 未归类网站（同日申请综合时间）

Routing: `docs/MODE_QUOTA_ROUTING_MATRIX_V0.md` Case #5 (Rest available), Case #6 (Rest exhausted).

触发：

```text
学习模式下访问未归类网站（非学习、非综合、非受限娱乐、非 hardBlocked/unsafe）
```

行为：

```text
同页提供两条路径（均为滑动确认）：
1) 进入休息时间（默认路径）；
2) 申请使用今天的综合时间（可选路径）。
综合时间申请成功后，仅允许"当前本地日期"继续按综合时间访问该域名。
该授权不会永久修改网站分类，也不会计入学习时间。
```

页面标题：

```text
你正在打开未归类网站
```

默认路径正文（进入休息时间）：

```text
继续后，这段时间会计入「休息时间」，不会计入「学习时间」。
```

信息条：

```text
今日休息时间剩余：{remainingRestTime}
```

默认路径滑动文案：

```text
确认进入休息时间
松手确认
```

申请路径正文：

```text
如果你认为这个网站是为了学习用途使用，可以申请使用今天的综合时间继续访问。
本次申请不会计入学习时间，也不会永久修改网站分类。
系统未来可能会根据实际用途进一步自动判定。
```

申请路径滑动文案：

```text
申请使用综合时间
松手确认
```

成功文案：

```text
已允许今天使用综合时间访问 · 今日剩余 {remainingCompositeTime}
```

返回操作：

```text
返回学习
```

Rest exhausted variant (Case #6):
- 借用文案追加在默认路径正文下方：`今天的休息时间已用完。继续休息使用需要向明天借用休息时间。`
- 借用滑轨：`向明天借用休息时间`
- 不显示：`该网站不能申请使用综合时间。`

行为：

```text
同页提供两条路径（均为滑动确认）：
1) 进入休息时间（默认路径）；
2) 申请使用今天的综合时间（可选路径）。
综合时间申请成功后，仅允许"当前本地日期"继续按综合时间访问该域名。
该授权不会永久修改网站分类，也不会计入学习时间。
```

页面标题：

```text
你正在打开未归类网站
```

默认路径正文（进入休息时间）：

```text
继续后，这段时间会计入「休息时间」，不会计入「学习时间」。
```

信息条：

```text
今日休息时间剩余：{remainingRestTime}
```

默认路径滑动文案：

```text
确认进入休息时间
松手确认
```

申请路径正文：

```text
如果你认为这个网站是为了学习用途使用，可以申请使用今天的综合时间继续访问。
本次申请不会计入学习时间，也不会永久修改网站分类。
系统未来可能会根据实际用途进一步自动判定。
```

申请路径滑动文案：

```text
申请使用综合时间
松手确认
```

页面标题：

```text
你正在打开未归类网站
```

默认路径正文（进入休息时间）：

```text
继续后，这段时间会计入「休息时间」，不会计入「学习时间」。
```

信息条：

```text
今日休息时间剩余：{remainingRestTime}
```

默认路径滑动文案：

```text
确认进入休息时间
松手确认
```

申请路径正文：

```text
如果你认为这个网站是为了学习用途使用，可以申请使用今天的综合时间继续访问。
本次申请不会计入学习时间，也不会永久修改网站分类。
系统未来可能会根据实际用途进一步自动判定。
```

申请路径滑动文案：

```text
申请使用综合时间
松手确认
```

成功文案：

```text
已允许今天使用综合时间访问 · 今日剩余 {remainingCompositeTime}
```

### 8.3 综合 → 学习

触发：

```text
综合模式下访问 effectiveStudyList 网站
```

行为：

```text
自动回到学习模式。
时间计入 studySeconds。
```

提示：

```text
可无提示，或显示 2-3 秒轻提示。
```

轻提示文案：

```text
已回到学习时间
```

禁止：

```text
不得要求用户确认。
不得弹整页。
```

### 8.4 休息 → 学习

触发：

```text
休息模式下访问 effectiveStudyList 网站
```

行为：

```text
自动进入学习模式。
时间计入 studySeconds。
```

提示：

```text
可无提示，或轻提示。
```

文案：

```text
已进入学习时间
```

原则：

```text
回到学习不应增加摩擦。
```

### 8.5 综合 → 休息

Routing: `docs/MODE_QUOTA_ROUTING_MATRIX_V0.md` Case #14/#15 (Unclassified), Case #16/#17 (Restricted).

触发：

```text
综合模式下访问受限娱乐网站或未归类网站
```

行为：

```text
页面级双路径（滑动确认）：
1) 进入休息时间（默认路径）；
2) 仅在"未归类网站"场景显示"申请使用综合时间"路径。
受限娱乐网站场景不提供综合时间申请路径。
```

页面标题（按站点类型）：

```text
受限娱乐网站：你正在打开受限娱乐网站
未归类网站：你正在打开未归类网站
```

默认路径正文：

```text
继续后，这段时间会计入「休息时间」，不会计入「综合时间」。
```

配额：

```text
今日休息时间剩余：{remainingRestTime}
```

综合→休息信息条：

```text
今日休息时间剩余：{remainingRestTime}
```

进入休息滑动文案：

```text
确认进入休息时间
松手确认
```

未归类网站补充说明（放在第一个滑轨下）：

```text
如果你认为这个网站是为了学习用途使用，可以申请使用今天的综合时间继续访问。
本次申请不会计入学习时间，也不会永久修改网站分类。
系统未来可能会根据实际用途进一步自动判定。
```

未归类网站申请滑轨文案：

```text
申请使用综合时间
松手确认
```

受限娱乐网站补充说明：

```text
该网站不能申请使用综合时间。
```

次级操作：

```text
返回
```

Rest exhausted variant (Case #15/#17):
- 借用文案追加：`今天的休息时间已用完。如果仍要继续访问，可以向明天借用休息时间。`
- 借用滑轨：`向明天借用休息时间`
- Case #15（未归类）仍保留 Composite 申请路径
- Case #17（受限娱乐）不显示 Composite 申请路径

行为：

```text
页面级双路径（滑动确认）：
1) 进入休息时间（默认路径）；
2) 仅在“未归类网站”场景显示“申请使用综合时间”路径。
受限娱乐网站场景不提供综合时间申请路径。
```

页面标题（按站点类型）：

```text
受限娱乐网站：你正在打开受限娱乐网站
未归类网站：你正在打开未归类网站
```

默认路径正文：

```text
继续后，这段时间会计入「休息时间」，不会计入「综合时间」。
```

配额：

```text
今日休息时间剩余：{remainingRestTime}
```

综合→休息信息条：

```text
今日休息时间剩余：{remainingRestTime}
```

进入休息滑动文案：

```text
确认进入休息时间
松手确认
```

未归类网站补充说明（放在第一个滑轨下）：

```text
如果你认为这个网站是为了学习用途使用，可以申请使用今天的综合时间继续访问。
本次申请不会计入学习时间，也不会永久修改网站分类。
系统未来可能会根据实际用途进一步自动判定。
```

未归类网站申请滑轨文案：

```text
申请使用综合时间
松手确认
```

受限娱乐网站补充说明：

```text
该网站不能申请使用综合时间。
```

次级操作：

```text
返回
```

### 8.6 学习 → 休息

触发：

```text
学习模式下访问受限娱乐网站或未归类网站
```

行为：

```text
显示 L3 慎重确认页。
用户必须完成滑动对齐确认后，才进入休息模式。
时间计入 restSeconds。
```

页面标题：

```text
你正在打开受限娱乐网站
```

正文：

```text
继续后，这段时间会计入「休息时间」，不会计入「学习时间」。
```

配额：

```text
今日休息时间剩余：{remainingRestTime}
```

返回操作：

```text
[返回学习]
```

滑动控件文案：

```text
确认进入休息时间
```

完成态文案：

```text
已进入休息时间
```

交互规则：

```text
1. 用户必须拖动控件到目标区域；
2. 单击不能确认；
3. 未完成拖动时松手，控件回弹；
4. 完成拖动后进入休息模式；
5. ESC / 返回 / 返回学习 不得进入休息模式；
6. 若休息配额已用完，不显示滑动确认控件。
```

Study→Rest 页面次级操作（`返回学习`）UI 规范（V0）：

```text
位置：位于滑动确认控件下方
文案：返回学习（固定，不可改写）
宽度：与滑动轨道容器视觉同宽
高度：40px
圆角：12px
背景：#ffffff
边框：1px solid #d7dce5
文字色：#334155
字号：14px
字重：600
hover 背景：#f8fafc
hover 边框：#cbd5e1
active 背景：#f1f5f9
阴影：无重阴影
与滑块间距：上边距 12px
```

设计意图：

```text
该按钮是次级操作，视觉层级必须低于滑动确认主操作；
按钮需完整可点击，不使用纯文本链接样式。
```

V0 推荐实现：

```text
单轴横向滑动 + 目标区对齐 + 松手确认
```

V0 不做：

```text
Z 字形拖动
复杂图案解锁
九宫格
输入文字确认
多步验证码式确认
```

### 8.7 Hard Blocked / unsafe 网站

触发：

```text
命中 unsafeList / hardBlocked 规则
```

行为：

```text
直接拦截。
不进入学习、综合或休息模式切换流程。
```

页面标题：

```text
此网站不可访问
```

说明：

```text
该网站属于禁止访问范围。
```

按钮：

```text
[返回]
```

禁止：

```text
不得显示“进入休息继续”。
不得显示“临时允许”。
不得消耗综合或休息配额绕过。
```

---

## 9. 剩余时间展示规则

### 9.1 必须显示剩余时间的场景

| 场景 | 显示内容 |
|---|---|
| 学习 → 综合 | 今日综合时间剩余 |
| 休息 → 综合 | 今日综合时间剩余 |
| 学习 → 休息 | 今日休息时间剩余 |
| 综合 → 休息 | 今日休息时间剩余 |
| Popup | 今日综合剩余 + 今日休息剩余 |
| 配额耗尽页 | 对应配额已用完 |

### 9.2 不建议显示的内容

提示页不显示：

```text
本周累计
历史趋势
二级综合归类
AI 判断结果
复杂统计明细
```

原因：

```text
提示页是行为决策界面，不是统计分析后台。
```

---

## 10. Badge 设计

### 10.1 Badge 目标

Badge 用于持续显示当前模式。

### 10.2 V0 Badge 文案

推荐：

| Badge | 含义 |
|---|---|
| 学 | 当前计入学习时间 |
| 综 | 当前计入综合时间 |
| 休 | 当前计入休息时间 |
| 停 | 监控暂停 / 关闭 |

与产品术语映射（用于文档/评审/验收）：

| 产品模式名 | Badge |
|---|---|
| Study | 学 |
| Composite | 综 |
| Rest | 休 |
| Paused | 停 |

### 10.3 Badge 不显示

Badge 不显示：

```text
具体剩余分钟
复杂状态
长文本
二级归类
```

原因：

```text
Badge 空间太小，只适合显示当前模式。
```

---

## 11. Popup 设计

### 11.1 Popup 目标

Popup 是轻量用户面板，不是调试仪表盘。

必须保持：

```text
紧凑、可扫读、可点击切换模式
```

禁止：

```text
大块运行时/调试卡片
信息堆叠导致首屏拥挤
```

### 11.2 容器与头部（硬约束）

Popup 容器：

```text
固定宽度：320px
```

Header：

```text
渐变背景
padding: 16px
左侧：应用图标 + TimeOnChrome + 副标题「我的时间」
右侧：设置按钮
```

设置入口要求：

```text
必须可见
必须可点击
不得移除
```

### 11.3 未绑定横幅（条件显示）

```text
仅在设备未绑定时显示
警示样式
不适用时必须完全隐藏且不占位
```

### 11.4 模式切换区（硬约束）

模式切换区必须是纵向三行全宽结构，且仅允许以下顺序：

1. `📚 学习模式`
2. `☕ 休息模式`
3. `⏳ 综合模式`

容器硬约束：

```text
display: flex
flex-direction: column
gap: 8px
recommended margin: 10px 12px 0 12px
```

每行模式控件硬约束：

```text
width: 100%
min-height: 44px
display: flex
align-items: center
justify-content: space-between
padding: 0 12px
box-sizing: border-box
border-radius: 12px
cursor: pointer
```

每行信息结构：

```text
左侧：图标 + 模式名
右侧：已用时长 / 配额
```

行为约束：

```text
当前模式必须在对应行高亮
三行都必须可点击切换
不得移除综合模式控件
```

明确禁止：

```text
横向三按钮
三列 grid
mode 容器使用 flex-direction: row
chip 化小按钮
仅图标模式按钮
用大型 runtime 卡片替代行高亮
```

### 11.5 用量区与状态区

用量区：

```text
显示「🌐 在线时长 used/quota」
显示对应进度条
```

后台媒体行：

```text
仅在 audioSeconds + pipSeconds > 0 时显示
显示为纯数字行（无配额）
文案：🎵 后台音视频 {x}
```

紧凑状态行：

```text
不得使用大卡片
可使用单行文本，例如：当前：www.google.com · 4秒
```

位置约束（V0 认可形态）：

```text
模式切换区
-> 在线时长/进度条 + 后台音视频（条件）
-> 紧凑状态行
-> 今日访问
```

### 11.6 今日访问区

```text
保留标题：今日访问
列表样式：域名左对齐，时长右对齐
最多 10 行
```

### 11.7 Popup 操作约束

允许：

```text
查看详情
模式点击切换（学习/休息/综合）
```

但注意：

```text
不修改运行时模式判定语义
不修改模式切换门控语义
不引入调试面板化布局
```

### 11.8 文档先行与实现合规（强制）

未来 Popup/UI 变更必须遵循：

1. **先文档后实现**：先更新本文件对应 UI 章节，再改 HTML/CSS/JS；
2. **Plan Conformance Checklist**：实现前必须列出逐条映射（文档条款 -> 实现点）；
3. **Plan Conformance Audit**：实现后必须逐条核验并报告：
   - 已满足条款
   - 偏离条款（若有）
   - 额外改动（若有）
4. 未完成上述三步，不得宣称 UI 任务完成。

---

## 12. 配额耗尽规则

### 12.1 综合时间耗尽

触发：

```text
综合时间入口/继续路径触发时，今日综合时间已用完：
- Study → Composite
- Rest → Composite
- Composite → Composite
- 同日临时综合放行域名继续使用
```

统一规则：

```text
综合时间与休息时间是独立配额池。
综合时间耗尽时：
- 不允许继续使用综合时间
- 不自动占用休息时间
- 不提供“借用综合时间”
- 仅在用户显式确认后才可切到休息时间继续访问
```

Case A（综合耗尽、休息仍可用）页面：

```text
标题：今日综合时间已用完
正文：
综合时间不会自动占用休息时间。
如果仍要继续访问，可以进入休息时间继续。
操作：
[进入休息继续]
[返回]
```

Case B（综合耗尽且休息也耗尽）页面：

```text
标题：今日综合时间和休息时间均已用完
正文：当前不能继续访问。请返回。
操作：
[返回]
```

交互约束：

```text
“进入休息继续”必须是显式确认动作后才切换到休息模式。
“返回”不得切换模式、不得消耗任何配额。
```

### 12.2 休息时间耗尽

路由规则（以矩阵为准）：

```text
休息配额耗尽时的具体页面、借用入口、综合申请入口，以 docs/MODE_QUOTA_ROUTING_MATRIX_V0.md 为准。
```

简要摘要（仅用于 UX 语义一致性）：

```text
Unclassified 可申请综合时间并可借用休息时间；
Restricted Entertainment 只能借用休息时间；
HardBlocked/Unsafe 不允许借用或申请。
```

---

## 13. 高风险综合网站

### 13.1 定义

高风险综合网站是指：

```text
确实存在学习用途，但同时具有强信息流、讨论、娱乐、争论或泛浏览风险的综合网站。
```

第一版候选：

```text
reddit.com
```

### 13.2 学习 → 高风险综合

页面文案应比普通综合网站更强。

标题：

```text
你正在打开一个高风险综合网站
```

正文：

```text
这个网站包含学习社区，也包含大量分心内容。
继续后，这段时间会计入「综合时间」，不会计入「学习时间」。
```

按钮：

```text
[继续使用] [返回学习]
```

### 13.3 休息 → 高风险综合

仍然自动进入综合模式，但轻提示文案更明确：

```text
已进入综合时间。
该网站内容较混合，时间会单独计入综合时间。
今日综合时间剩余：{remainingCompositeTime}
```

---

## 14. 音乐 / 音频网站

### 14.1 V0 处理

音乐 / 音频网站可以保留在综合相关清单中用于时间归因。

但原则是：

```text
音乐 / 音频网站主要是技术归因问题，不定义主要注意力模式。
```

### 14.2 V0 UI

如果用户前台打开音乐网站：

```text
按 compositeSite 处理。
```

如果音乐是后台播放：

```text
进入 audioSeconds / background media 统计，不应改变前台主要模式。
```

V0 不因后台音乐把学习模式切成综合模式。

---

## 15. 文案原则

### 15.1 必须明确时间归属

每个关键提示必须回答：

```text
这段时间算什么？
```

推荐表达：

```text
会计入「综合时间」
不会计入「学习时间」
会计入「休息时间」
```

### 15.2 避免惩罚性语言

不要写：

```text
你正在违规
你正在偷懒
你正在分心
```

推荐写：

```text
这个网站不属于学习网站。
继续后会计入休息时间。
```

### 15.3 不过度解释 V1 模型

不要在提示页写：

```text
未来 AI 将判断综合学习 / 综合休息 / 其他综合。
```

V0 可以写：

```text
这个网站用途不固定，因此时间会先计入综合时间。
```

---

## 16. V0 验收标准

### 16.1 行为验收

1. 学习模式访问学习网站：直接进入 / 保持学习模式；
2. 学习模式访问综合网站：自动进入综合模式并显示轻提示（45 秒）；
3. 学习模式访问综合网站：不弹阻断确认页；
4. 休息模式访问综合网站：自动进入综合模式并显示轻提示；
5. 学习模式访问受限娱乐网站：必须滑动确认；
6. 单击不能完成学习 → 休息切换；
7. 完成滑动后进入休息模式，计入休息时间；
8. 综合模式访问学习网站：自动回到学习模式；
9. 休息模式访问学习网站：自动回到学习模式；
10. hardBlocked 网站直接拦截，不参与模式切换；
11. Badge 正确显示 学 / 综 / 休 / 停；
12. Popup 正确显示当前模式、当前网站、综合剩余、休息剩余。

### 16.2 UI 验收

1. 学习 → 综合轻提示说明：
   - 单行半透 Banner；
   - 文案为“你正在打开综合网站 · 即将离开学习时间进入综合时间 · 今日剩余 {remainingCompositeTime}”；
   - 不含倒计时；
   - 时间计入综合，不计入学习。

2. 休息 → 综合轻提示说明：
   - 已进入综合时间；
   - 显示综合剩余时间。

3. 学习 → 休息页面说明：
   - 正在离开学习；
   - 时间计入休息；
   - 不计入学习；
   - 显示休息剩余时间；
   - 需要滑动确认。

4. Popup 不应删除既有核心功能入口。

补充记录（V0 reminder UI）：

```text
Product Owner 已完成并通过以下人工验收：
1) Study→Rest 提醒页视觉与滑动交互；
2) Study→Composite 提醒页视觉对齐；
3) Composite→Rest 提醒页视觉对齐；
4) Study→Composite 与 Composite→Rest 保持双按钮确认；
5) Study→Rest 保持滑动确认。
```

### 16.3 测试验收

V0 至少需要：

1. transition decision unit tests；
2. Study → Composite E2E / manual verification；
3. Rest → Composite E2E / manual verification；
4. Study → Rest slide confirmation E2E / manual verification；
5. Badge state verification；
6. Popup display verification；
7. quota exhausted behavior verification；
8. hardBlocked regression verification。

### 16.4 V1-minimal mode-transition regression gate（必跑）

说明：
- 本门禁属于 mode-transition UX / side-effect regression。
- 不属于 Recovery/System（sleep-wake）gate。

必须运行命令：

```powershell
node tests/unit/interceptor-mode-transition-v0.test.js
node tests/unit/reminder-transition-v0.test.js
node tests/unit/content-rest-composite-pending-banner.test.js
npx playwright test tests/e2e/mode-switch-prompt-lifecycle.test.js --reporter=line
npx playwright test tests/e2e/mode-switch-pip-close.test.js --reporter=line
```

通过条件：
- 任意 mode transition 都会执行当前全局 PiP policy（`disallow_all`），并尝试关闭已存在的 PiP。
- cleanup 成功时，PiP 不会作为新 mode 下的受支持媒体继续运行；cleanup 失败时，媒体账本保留真实 PiP fact 并记录诊断。
- Rest -> Study / Composite -> Study manual/auto: Study prompt appears.
- Prompt late-ready resend 与 domain guard 不退化。

---

## 17. 非目标与风险控制

### 17.1 非目标

V0 不解决：

```text
这个 YouTube 视频到底是不是学习视频
这个 Reddit 页面到底是不是学习社区
这个搜索关键词是否与作业相关
综合时间如何二级分类
AI 如何自动归因
```

并明确不做：

1. import/export schema change；
2. path-level routing（含 subreddit/path 级判断）；
3. 复杂手势解锁（Z 字形、图案、多段手势）。

### 17.2 风险

| 风险 | 控制方式 |
|---|---|
| 综合模式变成娱乐放行 | compositeList 保持窄口径 |
| 学习 → 休息太轻 | 使用滑动确认 |
| 自动切换黑箱 | 休息 → 综合必须轻提示 |
| UI 太烦 | 只对高风险切换使用强提示 |
| V0 范围膨胀 | 不做 AI / 二级归类 / 路径分类 |
| 孩子不理解模式 | Badge + Popup + 简短文案 |

---

## 18. 最终原则

V0 的模式切换 UX 遵循以下原则：

```text
越可能破坏学习状态，确认成本越高。
越有利于回到学习，摩擦越低。
任何会改变时间归属或消耗配额的切换，都必须可见。
综合时间是独立一级时间，不并入学习或休息。
学习 → 休息不能单击确认。
休息 → 综合自动进入，但必须轻提示。
```

---


## Historical Note

Historical implementation task drafts have been removed. Current routing behavior is defined in `docs/MODE_QUOTA_ROUTING_MATRIX_V0.md`; this document defines UX structure and interaction style.
