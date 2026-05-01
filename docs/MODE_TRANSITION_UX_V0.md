# TimeOnChrome V0 Mode Transition UX Design

## 0. 文档定位

本文定义 TimeOnChrome V0 中的三模式切换体验与页面提示规则。

本文目标不是完整实现 V1 的 AI 内容分类、路径级分类或综合时间二级后判断，而是在 V0 中完成一个低摩擦、可解释、可见、可控的模式切换体验。

本文应与以下文件保持一致：

- `PROJECT_MASTER.md`
- `TASK_BOARD.md`
- `DECISIONS.md`
- `SITE_ACCESS_POLICY.md`
- `site-access-config.example.json`

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
休息网站：慎重确认后使用
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
   - 学习 → 综合：页面确认；
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

### 5.3 休息 / 娱乐网站

行为：

```text
访问休息或娱乐网站 → 进入或保持休息模式，但需要根据当前模式决定是否确认。
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
| 学习 | 综合网站 | 综合 | 页面确认 | 中 | compositeSeconds |
| 学习 | 休息网站 | 休息 | 滑动确认 | 高 | restSeconds |
| 学习 | hardBlocked | 无 | 拦截 | 高 | 不计入有效时间 |
| 综合 | 学习网站 | 学习 | 自动回归（90s 前台活跃门控） | 极轻 / 无 | studySeconds |
| 综合 | 综合网站 | 综合 | 继续使用 | 无 / 轻 | compositeSeconds |
| 综合 | 休息网站 | 休息 | 普通确认 | 中 | restSeconds |
| 综合 | hardBlocked | 无 | 拦截 | 高 | 不计入有效时间 |
| 休息 | 学习网站 | 学习 | 自动回归（90s 前台活跃门控） | 极轻 / 无 | studySeconds |
| 休息 | 综合网站 | 综合 | 自动切换（60s 前台稳定停留门控） + 轻提示 | 低 | compositeSeconds |
| 休息 | 休息网站 | 休息 | 继续使用 | 无 / 轻 | restSeconds |
| 休息 | hardBlocked | 无 | 拦截 | 高 | 不计入有效时间 |

---

### 6.3 V0 自动切换稳定门控

V0 自动切换增加稳定门控，避免模式抖动：

1. `Rest -> Composite`：目标网站需在前台连续稳定停留 60 秒（不要求键盘/鼠标操作）；
2. `Rest -> Study`：目标网站需在前台连续活跃 90 秒；
3. `Composite -> Study`：目标网站需在前台连续活跃 90 秒。

门控期约束：

1. 必须监控开启（`monitoringEnabled !== 0`）；
2. `Rest -> Composite` 的门控不依赖 `chrome.idle` 键鼠活跃状态；
3. 期间若发生中断（切换站点/切走目标/监控关闭），候选自动切换取消并重新计时；
4. 门控期内时间归属保持原模式，不做回填（V0 不 backfill candidate time）。

显式确认切换不受此门控影响，仍即时生效：

1. `Study -> Composite`（确认后）；
2. `Study -> Rest`（滑动确认后）；
3. `Composite -> Rest`（确认后）。

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
- 休息 → 学习。

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

### 7.3 L2：普通确认页

用于：

- 学习 → 综合；
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

### 8.1 学习 → 综合

触发：

```text
学习模式下访问 compositeList 网站
```

行为：

```text
显示普通确认页。
用户确认后进入综合模式。
时间计入 compositeSeconds。
```

页面标题：

```text
你正在打开综合网站
```

正文：

```text
继续后将进入综合时间，本段不会计入学习时间。
```

配额：

```text
今日综合时间剩余：{remainingCompositeTime}
```

按钮：

```text
[继续（进入综合时间）] [返回学习]
```

页面视觉（V0 对齐规则）：

```text
学习→综合 与 综合→休息 使用与 Study→Rest 同一视觉语言：
- 顶部左侧 TimeOnChrome 品牌
- 居中的图标块
- 统一标题/正文层级
- 单条干净信息条（不使用分裂 chip + 空 warning box）
- 底部双按钮并排（左主右次）
```

学习→综合信息条：

```text
今日综合时间剩余：{remainingCompositeTime}
```

学习→综合按钮（固定）：

```text
左：继续（进入综合时间）
右：返回学习
```

禁止：

```text
不得使用滑动确认。
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

触发：

```text
综合模式下访问休息 / 娱乐网站
```

行为：

```text
显示普通确认页。
用户确认后进入休息模式。
时间计入 restSeconds。
```

页面标题：

```text
你正在进入休息时间
```

正文：

```text
继续后将进入休息时间，并消耗休息配额。
```

配额：

```text
今日休息时间剩余：{remainingRestTime}
```

按钮：

```text
[开始休息] [返回]
```

综合→休息信息条：

```text
今日休息时间剩余：{remainingRestTime}
```

综合→休息按钮（固定）：

```text
左：开始休息
右：返回
```

V0 不要求滑动确认。

### 8.6 学习 → 休息

触发：

```text
学习模式下访问休息 / 娱乐网站
```

行为：

```text
显示 L3 慎重确认页。
用户必须完成滑动对齐确认后，才进入休息模式。
时间计入 restSeconds。
```

页面标题：

```text
你正在离开学习时间
```

正文：

```text
继续后，当前网站会作为休息使用处理。
这段时间会计入「休息时间」，不会计入「学习时间」。
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
拖动到右侧确认进入休息时间
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
访问综合网站，但今日综合时间已用完
```

页面标题：

```text
今日综合时间已用完
```

正文：

```text
这个网站属于综合网站。
今天的综合时间额度已经用完。
```

操作：

```text
[返回学习]
[转入休息时间继续]
```

产品规则：

```text
允许转入休息时间继续使用综合网站，但必须明确告知接下来将计入休息时间。
```

转入休息提示：

```text
继续后，这段时间会计入「休息时间」，不会计入「综合时间」。
```

如果休息时间也已用完：

```text
只显示 [返回学习]
```

### 12.2 休息时间耗尽

触发：

```text
访问休息 / 娱乐网站，但今日休息时间已用完
```

页面标题：

```text
今日休息时间已用完
```

正文：

```text
这个网站属于休息使用。
请回到学习网站，或明天再继续使用休息时间。
```

操作：

```text
[返回学习]
```

禁止：

```text
不得显示继续使用按钮。
除非后续引入家长授权或借用机制。
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
2. 学习模式访问综合网站：出现确认页；
3. 学习模式确认综合网站后：进入综合模式，计入综合时间；
4. 休息模式访问综合网站：自动进入综合模式并显示轻提示；
5. 学习模式访问休息网站：必须滑动确认；
6. 单击不能完成学习 → 休息切换；
7. 完成滑动后进入休息模式，计入休息时间；
8. 综合模式访问学习网站：自动回到学习模式；
9. 休息模式访问学习网站：自动回到学习模式；
10. hardBlocked 网站直接拦截，不参与模式切换；
11. Badge 正确显示 学 / 综 / 休 / 停；
12. Popup 正确显示当前模式、当前网站、综合剩余、休息剩余。

### 16.2 UI 验收

1. 学习 → 综合页面说明：
   - 网站是综合网站；
   - 时间计入综合；
   - 不计入学习；
   - 显示综合剩余时间。

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

## Appendix A. 建议同步写入 `DECISIONS.md` 的条目

```md
## D-XXX: V0 introduces low-friction three-mode transition UX

Decision:
TimeOnChrome V0 will include a minimal three-mode transition UX for Study, Composite, and Rest modes.

This is not the full V1 AI/content-classification system. It is a V0 UX and attribution layer to make mode changes visible, understandable, and low-friction for first-time student use.

Rules:
- Study site usage enters or remains Study mode.
- Composite site usage enters or remains Composite mode.
- Rest / entertainment site usage enters or remains Rest mode, unless blocked.
- Study → Composite uses a normal confirmation page.
- Rest → Composite is automatic with lightweight notice.
- Study → Rest requires deliberate slide-to-confirm and cannot be completed by a single click.
- Composite → Study and Rest → Study can happen automatically.
- Badge displays current mode.
- Popup displays current mode, current site, and remaining Composite/Rest quota.

Rationale:
A mode is defined by runtime attribution, quota consumption, and access behavior, not by whether the user manually clicks a mode button. The UX should minimize friction while making every quota-affecting transition visible.

Out of scope:
- AI content classification.
- Composite second-level classification.
- Path-level routing.
- Complex gesture unlock.
- Import/export schema changes.
```

---

## Appendix B. Codex Task 1: Add specification and design docs

```md
Task: Add V0 three-mode transition UX specification

Read first:
- PROJECT_MASTER.md
- TASK_BOARD.md
- DECISIONS.md
- AGENTS.md
- SITE_ACCESS_POLICY.md
- site-access-config.example.json
- Existing UI/spec/design docs if present

Goal:
Update the project specification and UI design documents to define the V0 low-friction mode transition UX for Study / Composite / Rest modes.

This is a documentation/specification task only. Do not implement runtime behavior yet.

Scope:
- Add a new document `MODE_TRANSITION_UX_V0.md`, or update the existing functional specification/design document if the repo already has a better canonical location.
- Add a concise decision entry to `DECISIONS.md`.
- If `PROJECT_MASTER.md` or `TASK_BOARD.md` tracks V0 scope, update it to show this as a V0 UX/spec task, not a full V1 AI classification task.
- Cross-reference `SITE_ACCESS_POLICY.md` where relevant.
- Define UI behavior for:
  - Study → Composite
  - Rest → Composite
  - Study → Rest
  - Composite → Study
  - Rest → Study
  - Composite → Rest
  - hardBlocked behavior
- Define Badge and Popup display requirements.
- Define quota display requirements.
- Define non-goals.

Out of scope:
- No product code changes.
- No runtime mode implementation.
- No CSS/HTML/JS changes.
- No config schema changes.
- No import/export format changes.
- No AI classification.
- No composite second-level classification.
- No path-level routing.
- No Reddit path/subreddit detection.
- No complex Z-shaped or pattern gesture.
- No removal or simplification of existing UI features.

Acceptance criteria:
1. The docs define Study / Composite / Rest as V0-visible product modes tied to attribution and quotas.
2. The docs define that composite site usage enters Composite mode and consumes Composite time.
3. The docs define Study → Composite as a normal confirmation page.
4. The docs define Rest → Composite as automatic transition with lightweight notice.
5. The docs define Study → Rest as deliberate slide-to-confirm, not single-click.
6. The docs define that V0 uses simple horizontal slide-to-align, not Z-shaped or pattern gestures.
7. The docs define Badge current-mode display: Study / Composite / Rest / Paused.
8. The docs define Popup display: current mode, current domain, current session duration, remaining Composite quota, remaining Rest quota.
9. The docs define quota display rules for transition pages.
10. The docs define hardBlocked sites as separate block flow, not mode switching.
11. The docs explicitly list V0 non-goals:
    - AI classification
    - composite second-level classification
    - path-level routing
    - import/export schema change
    - complex gesture unlock
12. The docs preserve `SITE_ACCESS_POLICY.md` boundaries:
    - compositeList remains narrow
    - ordinary entertainment / portal / social / games do not become composite by default
    - Bilibili remains not study, not composite, not unsafe unless separately changed by Product Owner

Required tests:
- No automated product tests required because this is docs-only.
- If the repo has markdown lint or docs lint, run the relevant check.
- Do not run unrelated product tests unless repo policy requires it.

Deliver:
1. Changed files.
2. Exact sections added or edited.
3. Summary of decisions documented.
4. Confirmation that no product code, config schema, import/export format, runtime behavior, or UI implementation was changed.
5. Any open Product Owner questions found while updating the docs.
```

---

## Appendix C. Codex Task 2: Assess implementation impact

```md
Task: Assess implementation impact for V0 mode transition UX

Read first:
- PROJECT_MASTER.md
- TASK_BOARD.md
- DECISIONS.md
- AGENTS.md
- SITE_ACCESS_POLICY.md
- MODE_TRANSITION_UX_V0.md
- Existing popup / blocked / remind / routing / stats / quota files

Goal:
Analyze how to implement the V0 low-friction mode transition UX with minimal risk.

This is an assessment task only. Do not modify code.

Scope:
- Identify current files involved in:
  - site classification
  - mode decision
  - blocked/remind pages
  - quota checks
  - stats attribution
  - badge update
  - popup display
  - tests
- Propose the smallest implementation sequence.
- Identify whether current architecture already supports `composite` as a runtime mode or whether a minimal state extension is needed.
- Identify regression risks.
- Identify required tests.

Out of scope:
- No code changes.
- No UI implementation.
- No schema changes.
- No refactor.
- No changes to site lists.
- No AI classification.
- No path-level routing.

Acceptance criteria:
1. Produce an implementation impact map by file/module.
2. Identify the minimum runtime state changes needed for Study / Composite / Rest.
3. Identify how Study → Composite confirmation should be routed.
4. Identify how Rest → Composite lightweight notice can be shown with minimal intrusion.
5. Identify how Study → Rest slide confirmation can be added without affecting other transitions.
6. Identify how Badge current mode should be updated.
7. Identify how Popup should read/display current mode and remaining quota.
8. Identify how existing tests should be extended.
9. Identify any blockers or unclear current behavior.
10. Clearly separate:
    - product decisions already made
    - implementation choices
    - open questions

Required tests:
- No tests required because this is assessment-only.
- Do not run full test suite unless needed to understand the repo.

Deliver:
1. A concise implementation plan.
2. File/module impact map.
3. Proposed task breakdown.
4. Test plan.
5. Risk list.
6. Open questions.
7. Confirmation that no files were modified.
```

---

## Appendix D. Codex Task 3: Implement functionality and UI

```md
Task: Implement V0 low-friction mode transition UX

Read first:
- PROJECT_MASTER.md
- TASK_BOARD.md
- DECISIONS.md
- AGENTS.md
- SITE_ACCESS_POLICY.md
- MODE_TRANSITION_UX_V0.md
- Implementation impact assessment from previous task

Goal:
Implement the V0 low-friction mode transition UX for Study / Composite / Rest modes.

Scope:
- Runtime transition behavior:
  - Study + study site → Study
  - Study + composite site → Composite after confirmation
  - Rest + composite site → Composite automatically with lightweight notice
  - Study + rest/entertainment site → Rest only after slide-to-confirm
  - Composite + study site → Study automatically
  - Rest + study site → Study automatically
  - Composite + rest/entertainment site → Rest after normal confirmation
  - hardBlocked → block flow, no mode transition
- UI:
  - Study → Composite confirmation page
  - Rest → Composite lightweight notice
  - Study → Rest slide-to-confirm page
  - Composite → Rest normal confirmation page if needed
  - Badge current mode display
  - Popup current mode and quota display
- Tests:
  - transition decision tests
  - key E2E/manual flows

Out of scope:
- No AI classification.
- No composite second-level classification.
- No path-level routing.
- No Reddit subreddit detection.
- No YouTube video classification.
- No complex gesture unlock.
- No import/export schema changes.
- No unrelated UI redesign.
- No removal/hiding of existing UI sections.
- No broad refactor.
- No changes to default site list unless explicitly required by existing docs.

Acceptance criteria:
1. Study mode + study site remains Study and counts Study time.
2. Study mode + composite site shows confirmation before entering Composite.
3. Confirming Study → Composite enters Composite and counts Composite time.
4. Study → Composite page states:
   - this is a composite site
   - time counts as Composite
   - time does not count as Study
   - remaining Composite quota
5. Rest mode + composite site automatically enters Composite and shows lightweight notice.
6. Rest → Composite notice states time counts as Composite and shows remaining Composite quota.
7. Study mode + rest/entertainment site requires slide-to-confirm before entering Rest.
8. Study → Rest cannot be completed by a single click.
9. Study → Rest page states:
   - user is leaving Study time
   - time counts as Rest
   - time does not count as Study
   - remaining Rest quota
10. The slide control is simple horizontal slide-to-align, not Z-shaped or pattern gesture.
11. If Rest quota is exhausted, Study → Rest slide confirmation is unavailable.
12. Composite mode + study site automatically returns to Study.
13. Rest mode + study site automatically returns to Study.
14. hardBlocked sites remain blocked and do not participate in mode switching.
15. Badge shows current mode:
   - Study
   - Composite
   - Rest
   - Paused/Monitoring off if applicable
16. Popup shows:
   - current mode
   - current domain
   - current session duration if available
   - remaining Composite quota
   - remaining Rest quota
17. Existing monitoring-off behavior remains respected.
18. Existing audio/background media attribution is not broken.
19. Existing site access policy boundaries remain intact.

Required tests:
- Unit tests for transition decision logic.
- Tests for quota checks where available.
- E2E/manual verification for:
  1. Study → Composite confirmation path.
  2. Rest → Composite automatic + notice path.
  3. Study → Rest slide confirmation path.
  4. Study → Rest single click does not transition.
  5. Study → Rest return action does not transition.
  6. Composite → Study automatic path.
  7. Rest → Study automatic path.
  8. hardBlocked regression.
  9. Badge mode display.
  10. Popup current mode and remaining quota display.
- Run existing relevant unit tests.
- Run existing key E2E tests if the environment supports them.
- If any test cannot run due to environment, report exact reason and do not claim pass.

Deliver:
1. Changed files.
2. Behavior summary.
3. UI summary.
4. Screenshots or text-based UI verification where possible.
5. Tests run and exact results.
6. Tests not run and exact reasons.
7. Risks / rollback notes.
8. Confirmation that:
   - no import/export schema changed
   - no unrelated UI sections were removed
   - no AI/path-level classification was added
   - no compositeList expansion was made
```
