# TimeOnChrome 网站访问分类策略设计

版本：v3 semantic revision
日期：2026-07-24
状态：Product Owner 已确认语义修订；本轮只改产品/文档口径，不改代码字段、schema 或运行逻辑
文件定位：产品规则 / 配置边界 / 后续开发依据

---

## 1. 文件目的

本文用于统一 TimeOnChrome 项目中网站访问分类、学习模式允许策略、复合网站、待归类时间、受限娱乐网站、黑名单网站，以及用户导入导出配置的产品规则。

本文是网站访问相关的主策略文件，后续应作为以下内容的依据：

- 默认学习网站清单维护；
- 用户自定义学习网站配置；
- 复合网站 / 内部 `composite` 网站的处理；
- 待归类时间的过渡归因口径；
- 受限娱乐网站与借时间策略；
- 黑名单网站策略；
- 未归类网站的临时处理；
- 用户导入 / 导出配置格式；
- 后续 Codex / OpenCode 执行任务的产品边界。

配套候选库见 `docs/SITE_ACCESS_CANDIDATE_LIBRARY.md`。候选库仅用于整理常见游戏、视频、论坛社区、新闻门户、娱乐门户和综合门户网站的分类建议，不是当前运行 source of truth，不自动等同系统默认清单，也不直接改变新建 profile 或现有家庭配置。

---

## 2. 总体原则

TimeOnChrome 当前机制的核心不是做“纯学习行为识别”，而是做：

> 学习模式下，哪些网站应该允许孩子继续使用。

因此，“学习网站”不应被理解为“纯教育网站”，而应被理解为：

> 学习模式下允许访问的网站。

判断标准是：

> 学生在学习、写作业、查资料、做项目、编程、准备考试、整理资料、进行学习计划管理时，是否合理可能需要这个网站。

所以学习网站清单应采用相对宽口径，避免真实学习流程被频繁误拦截。

同时：

- 复合网站应保持窄口径，只承载少量“仅凭域名无法判断使用性质、需要内容/行为/上下文进一步归因”的网站；
- 待归类时间不是学习、休息之外的第三类最终时间，而是尚未实时或半实时归入学习/休息的过渡时间池；
- 受限娱乐网站用于堵住“临时放行”绕过学习模式的漏洞；
- 黑名单网站保持极小，只用于硬禁止；
- 普通未归类网站作为 fallback 状态处理，但访问时会自动进入待归类流程，不再直接等同休息目标；
- 访问管理导入导出使用统一“访问管理配置文件”入口，默认包含用户配置和系统配置两类范围。
- 用户配置只影响当前 profile，包含网站自定义、精确规则、审核记录、配额和时间段；系统配置影响全局系统配置网站。普通档案备份恢复不得修改系统配置。

---

## 3. 最终分类模型

TimeOnChrome 网站访问分类统一为五类：

```text
学习网站
复合网站
受限娱乐网站
未归类网站
黑名单网站
```

对应内部结构建议：

```text
defaultStudyList + customStudyList -> effectiveStudyList
# defaultStudyList = 系统配置学习网站；产品/UI 使用"系统配置"

defaultCompositeList + customCompositeList -> effectiveCompositeList
# 用户侧显示为：复合网站
# defaultCompositeList = 系统配置复合网站；产品/UI 使用"系统配置"

defaultRestrictedEntertainmentList + customRestrictedEntertainmentList -> effectiveRestrictedEntertainmentList
# defaultRestrictedEntertainmentList = 系统配置受限娱乐网站；产品/UI 使用"系统配置"

unclassifiedSite
# fallback，不维护显式数组

hardBlockedList
# 用户侧显示为：黑名单网站
# defaultBlockedSites = 系统配置黑名单网站；产品/UI 使用"系统配置"
```

> 术语说明：`default*` 代码字段当前代表系统配置网站列表。产品/UI 文档统一使用"系统配置"，不使用"缺省"。代码中保留 `default*` 名称以避免大范围迁移。`composite*` / `undetermined*` 字段和值在本轮作为 legacy/internal implementation value 保留；用户可见语义统一为“复合网站 / 复合模式 / 待归类时间”。

### 3.0.1 访问管理配置文件与系统配置

系统配置网站从 2026-07-26 起按“云端可管理配置”处理：

- 运行时优先读取云端 D1 中的 `system-access-config`；
- `workers/config/site-access-defaults.json` 仅作为初始化和故障 fallback；
- 系统配置导入后全局生效，所有 profile 的 effective 清单都会合并它；
- 普通档案配置、备份恢复、孩子档案导入导出不得修改系统配置。

访问管理配置文件默认导出为 `access-management-config-bundle`，包含两个可选范围：`userConfig` 和 `systemConfig`。其中 `userConfig` 兼容旧 `profile-config` 结构；`systemConfig` 兼容旧 `system-access-config` 结构。旧格式文件仍可导入，但新导出统一使用 bundle。导入时先按范围生成可勾选的新增/删除/修改差异，最后只应用选中的差异。

系统配置范围包含 `defaultStudySites`、`defaultCompositeSites`、`defaultUserCompositeSites`、`defaultRestrictedEntertainmentSites`、`defaultBlockedSites` 和可选 `siteCatalog`。其中四个 default list 是运行 source of truth；`siteCatalog` 是系统管理和人工审核元数据。系统配置导入仍必须经过系统配置 preflight、管理员权限和全局影响确认。

### 3.0.2 Qustodio 风格内容分类

系统管理界面按 Qustodio Web Filters 风格维护内容类别，再映射到 TimeOnChrome 运行分类：

| 内容类别 | 默认 TimeOnChrome 分类 |
|---|---|
| 教育性、政府、企业、健康、人工智能、技术、职业 | 学习网站 |
| 网页邮件、文件共享 | 学习网站或复合网站，允许单项覆盖 |
| 搜索门户、新闻、宗教、综合门户 | 复合网站或待归类观察 |
| 娱乐、体育、游戏、旅游、购物、论坛、社交网络、聊天、视频/直播、娱乐门户 | 受限娱乐网站 |
| 博彩、代理/漏洞、暴力、武器、脏话、成人内容、色情内容、酒精、毒品、烟草 | 黑名单网站 |

固定例外：`youtube.com` / `youtu.be` 保持复合或 YouTube 细化规则入口；`stackoverflow.com` / `stackexchange.com` 保持学习/技术用途；`reddit.com` 暂保持复合；`kahoot.it` / `quizizz.com` 保持课堂工具；`douyin.com` / `tiktok.com` 继续可放黑名单。

### 3.0.3 网站管理策略目录

家长控制台“网站管理”的主分类采用 TimeOnChrome 管理策略分类，而不是 Qustodio 内容分类：学习网站、复合网站、受限娱乐网站、黑名单网站。系统配置、自定义配置、已批准精确规则和已使用未归类历史按来源分组展示。

系统配置在网站管理页内以“系统网站配置-分类管理”呈现：页面仍停留在当前管理策略下，但系统配置网站会按 `siteCatalog.contentCategory` 分组成 Qustodio 风格内容分类；缺少目录元数据或内容分类的系统网站进入“未标注分类”。系统默认网站库必须为所有 `default*Sites` 提供 `siteCatalog` 元数据；Worker 读取旧 D1 系统配置时也会用 fallback catalog 补齐缺失目录项。管理员可以点击系统配置网站同时编辑内容分类和管理策略分类，保存时更新 `siteCatalog`，并把该域名同步移动到对应 `default*Sites` 运行清单。该操作是全局系统配置变更，必须显示全局影响确认；非管理员只能查看，不能写入。

“已使用未归类网站”只显示在复合网站策略下，表示最近 30 天内曾按未归类/待归类路径产生使用记录、且当前 effective 清单仍未归类的网站。它不是审批记录列表，也不是已确认复合网站；点击归类后写入当前 profile 的目标 custom list，并在存在匹配 pending 记录时同步关闭该记录。

网站管理顶部“添加到当前策略”入口只用于新增用户自定义配置网站，不负责移动分类。添加前必须校验域名格式、当前策略重复和跨策略重复：已存在于系统网站配置-分类管理的站点不得加入用户自定义配置；已存在于用户自定义配置的同策略站点不得重复加入；已存在于其他策略的站点必须通过列表内“归为…”或系统分类编辑完成分类变更。

### 3.1 概念迁移表

| 旧概念 | 新概念 | 新定义 | 实现字段暂定 |
|---|---|---|---|
| 综合时间 | 待归类时间 | 尚未归入学习或休息的过渡时间池，应尽量实时/半实时归因 | `compositeSeconds` / `undeterminedSeconds` |
| 综合网站 | 复合网站 | 仅凭域名无法判断使用性质，需要内容、URL、标题、频道、行为或人工回看判断 | `compositeList` / `defaultCompositeSites` |
| 综合模式 | 复合模式 | 访问复合网站或待归类对象时进入的过渡运行模式 | `mode: composite` |
| 临时使用综合网站时间 | 临时进入待归类时间 | 未归类网站被临时允许后，先计入待归类时间，再等待归因 | temporary composite permission |
| Pending Composite | 未归类网站访问记录 / 学习网站归类申请 | 系统访问事实或孩子学习归类意图尚未被家长最终判定；审批前都进入待归类时间 | `pending_composite` |
| 未归类网站 | 未归类网站 | 当前没有命中任何显式规则的网站；可能是学习、娱乐、复合或应阻断网站 | no resolved classification |
---

## 4. 分类行为矩阵

| 分类 | 学习模式访问 | 自由 / 休息时间访问 | 临时进入待归类时间 | 借时间 | 家长长期配置 |
|---|---:|---:|---:|---:|---:|
| 学习网站 | 允许 | 允许 | 不需要 | 不需要 | 可添加 |
| 复合网站 | 允许或按复合策略处理 | 允许 | 不需要 | 不需要 | 可添加 |
| 受限娱乐网站 | 不允许 | 允许 | 不允许 | 允许 | 可添加 / 调整 |
| 未归类网站 | 自动创建/复用访问记录并按待归类时间处理 | 自动创建/复用访问记录并按待归类时间处理 | 自动记录访问事实 | 不作为默认入口 | 可归类；孩子可申请归为学习网站 |
| 黑名单网站 | 禁止 | 禁止 | 禁止 | 禁止 | 可由家长配置 |

---

## 5. 学习网站

### 5.1 定义

学习网站是：

> 学习模式下允许访问的网站。

它不要求是纯教育网站，只要求在学习、写作业、查资料、做项目、编程、备考、整理资料、做计划时合理可能需要。

### 5.2 系统维护与用户维护拆分

学习网站分为：

```text
defaultStudyList
customStudyList
effectiveStudyList
```

其中：

- `defaultStudyList`：系统维护的默认学习网站清单；
- `customStudyList`：用户维护的自定义学习网站清单；
- `effectiveStudyList`：运行时由二者合并、规范化、去重生成。

生成逻辑：

```js
effectiveStudyList = normalizeAndDedupe([
  ...flatten(defaultStudyList),
  ...customStudyList
])
```

配置层允许重复，运行时去重。用户不需要知道某个网站是否已经在系统默认清单中。

---

## 6. defaultStudyList 收录原则

`defaultStudyList` 收录标准：

1. 普遍学习场景中合理可能使用；
2. 默认产品属性不偏娱乐；
3. 不明显引入短视频、社交信息流、游戏或消费内容；
4. 对多数学生、家庭或学习路径有一定通用性；
5. 维护成本可控。

可加入：

- 学校 / LMS / 课堂基础设施；
- 文档 / 作业 / 协作工具；
- AI 学习辅助工具；
- 写作 / 引用 / 语法工具；
- 课程体系 / 考试平台；
- 在线学习平台；
- STEM 工具；
- 编程 / 创客工具；
- 学术资料 / 文献网站；
- 创作 / 展示 / 项目工具；
- 低娱乐风险的计划 / 协作 / 生产力工具。

不应加入：

- 短视频；
- 娱乐视频；
- 社交信息流；
- 游戏平台；
- 综合门户；
- 购物 / 消费入口；
- 高噪音泛社区。

---

## 7. customStudyList 收录原则

`customStudyList` 是用户维护的自定义学习网站清单。

用于放：

- 学校官网；
- 学校 portal；
- 老师指定平台；
- 校内 LMS 子域名；
- 私有资料入口；
- 当前家庭 / 当前学校 / 当前课程路径专用网站。

原则：

> 不要让当前家庭或当前学校的特殊域名污染系统默认清单。

例如：

```text
keystoneacademy.cn -> customStudyList
managebac.com -> defaultStudyList
```

原因：

- `managebac.com` 是较通用的 IB / 国际学校基础设施；
- `keystoneacademy.cn` 是特定学校域名，应由用户维护。

---

## 8. 第一版 defaultStudyList 清单

### 8.1 School / LMS / Classroom Infrastructure

```js
[
  'classroom.google.com',
  'managebac.com',
  'kognity.com',
  'instructure.com',
  'blackboard.com',
  'moodle.org',
  'schoology.com',
  'powerschool.com',
  'clever.com',
  'turnitin.com'
]
```

### 8.2 Workspace / Documents / Assignments

```js
[
  'drive.google.com',
  'docs.google.com',
  'sheets.google.com',
  'slides.google.com',
  'forms.google.com',
  'meet.google.com',
  'calendar.google.com',
  'keep.google.com',
  'colab.research.google.com',
  'office.com',
  'onedrive.live.com',
  'onenote.com',
  'outlook.live.com',
  'planner.microsoft.com',
  'to-do.office.com',
  'teams.microsoft.com'
]
```

### 8.3 AI / Research Assistance

```js
[
  'chatgpt.com',
  'openai.com',
  'claude.ai',
  'gemini.google.com',
  'copilot.microsoft.com',
  'poe.com',
  'perplexity.ai',
  'notebooklm.google.com',
  'elicit.org',
  'consensus.app',
  'scite.ai',
  'wolframalpha.com',
  'phind.com'
]
```

说明：AI 工具进入学习网站清单，不代表所有 AI 使用都是学习行为，而是学习模式下默认允许使用。

### 8.4 Writing / Citation / Grammar

```js
[
  'grammarly.com',
  'quillbot.com',
  'overleaf.com',
  'zotero.org',
  'mendeley.com',
  'owl.purdue.edu',
  'citationmachine.net',
  'easybib.com',
  'bibme.org',
  'scribbr.com',
  'languagetool.org',
  'hemingwayapp.com',
  'noredink.com',
  'membean.com',
  'achieve3000.com'
]
```

### 8.5 Curriculum / Exam Systems

```js
[
  'ibo.org',
  'collegeboard.org',
  'apclassroom.collegeboard.org',
  'bluebook.app.collegeboard.org',
  'act.org'
]
```

### 8.6 Curriculum Resource Sites

```js
[
  'revisionvillage.com',
  'savemyexams.com',
  'physicsandmathstutor.com',
  'albert.io',
  'fiveable.me',
  'bioninja.com.au',
  'theoryofknowledge.net',
  'ibdocuments.com',
  'ibsurvival.com',
  'lanterna.com',
  'pastpapers.co',
  'crackap.com'
]
```

### 8.7 Online Learning Platforms

```js
[
  'khanacademy.org',
  'ocw.mit.edu',
  'coursera.org',
  'edx.org',
  'brilliant.org',
  'udemy.com',
  'futurelearn.com',
  'udacity.com',
  'codecademy.com',
  'datacamp.com',
  'freecodecamp.org',
  'openstax.org',
  'ck12.org'
]
```

### 8.8 Math / Science / STEM Tools

```js
[
  'desmos.com',
  'geogebra.org',
  'symbolab.com',
  'mathway.com',
  'physicsclassroom.com',
  'phet.colorado.edu',
  'falstad.com',
  'myphysicslab.com',
  'logic.ly',
  'mathsisfun.com',
  'artofproblemsolving.com',
  'aops.com'
]
```

### 8.9 Coding / Engineering / Maker Tools

```js
[
  'github.com',
  'leetcode.com',
  'hackerrank.com',
  'codingbat.com',
  'replit.com',
  'codepen.io',
  'developer.mozilla.org',
  'w3schools.com',
  'tinkercad.com',
  'arduino.cc',
  'raspberrypi.com',
  'instructables.com'
]
```

注意：

- `stackoverflow.com` 和 `stackexchange.com` 当前归入复合网站的问答 / 讨论类；
- 不建议同时放入 `defaultStudyList`，避免语义重复。

### 8.10 Academic Sources / Libraries

```js
[
  'arxiv.org',
  'scholar.google.com',
  'jstor.org',
  'researchgate.net',
  'semanticscholar.org',
  'pubmed.ncbi.nlm.nih.gov',
  'ncbi.nlm.nih.gov',
  'gutenberg.org',
  'plato.stanford.edu',
  'nature.com',
  'science.org',
  'springer.com',
  'sciencedirect.com',
  'cambridge.org',
  'oup.com',
  'archive.org',
  'loc.gov'
]
```

### 8.11 Creative / Presentation / Project Tools

```js
[
  'canva.com',
  'figma.com',
  'photopea.com',
  'pixlr.com',
  'gamma.app',
  'prezi.com',
  'miro.com',
  'lucidchart.com',
  'draw.io',
  'diagrams.net',
  'quizizz.com',
  'kahoot.it'
]
```

### 8.12 Notes / Planning / Productivity / Collaboration

```js
[
  'notion.so',
  'obsidian.md',
  'ankiweb.net',
  'trello.com',
  'slack.com',
  'reclaim.ai'
]
```

说明：此类网站不是纯学习内容网站，但学习计划、项目协作、笔记整理、任务管理时可能合理使用，且默认娱乐属性较弱。

---

## 9. 第一版 customStudyList 清单

```js
[
  'keystoneacademy.cn',
  'powerschool.keystoneacademy.cn',
  'managebac.cn',
  'reach.cloud',
  'schoolsbuddy.cn',
  'afficienta.com',
]
```

说明：

- `keystoneacademy.cn` / `powerschool.keystoneacademy.cn`：学校 / 机构专用域名
- `managebac.cn`：ManageBac 中国区
- `reach.cloud`：Reach 平台
- `schoolsbuddy.cn`：SchoolsBuddy
- `afficienta.com`：Afficient 学习平台

这些域名对学校场景非常重要，但不适合作为所有用户的系统默认项，因此放在 `customStudyList` 初始值中。家长可随时在控制台编辑或移除。

---

## 10. 复合网站

### 10.1 命名

用户侧统一使用：

```text
复合网站
待归类时间
```

内部代码可以暂时保留：

```text
compositeList
compositeSeconds
temporaryCompositeSites
```

但 UI 和产品文案应显示为“复合网站”。

### 10.2 定义

复合网站是指：

> 学习过程中可能合理需要，但内容、用途或访问目的高度混合的网站。

典型包括：

- 搜索引擎；
- YouTube；
- Wiki / 百科；
- 问答 / 讨论；
- 音乐 / 音频。

复合网站不是综合门户网站。
`163.com`、`sohu.com`、`sina.com.cn`、`msn.com`、`yahoo.com` 等综合门户默认不进入复合网站清单。

### 10.3 待归类时间

复合网站产生的访问时长计为：

```text
待归类时间
```

定义：

> 待归类时间来自复合网站、未归类网站访问记录、学习网站归类申请，或其他临时待归类对象。它不是最终分类，不默认计入学习时间或休息时间，未来应尽量实时或半实时归因到学习或休息。

未来可通过：

- 页面规则；
- URL / channel / query 规则；
- 用户确认；
- AI 内容分类；

将其中一部分进一步归类为：

- 学习时间；
- 休息时间；
- 其他时间；
- 继续保持待分类。

### 10.4 第一版 defaultCompositeList 清单

系统配置复合网站（defaultCompositeSites）：

```js
[
  // Search engines
  'google.com',
  'google.com.hk',
  'bing.com',

  // Software / Vendor Support Sites
  // 以下域名是 Product Owner 明确决定保留在复合网站中的软件/厂商支持站点。
  // 这不是一般规则，不以此为由继续添加其他软件/vendor域名。
  'microsoft.com',
  'apple.com',
  'adobe.com',

  // Music / audio
  'music.youtube.com',
  'spotify.com',
  'music.163.com',
]
```

用户默认复合网站（defaultUserCompositeSites）：

```js
[
  // Video
  'youtube.com',

  // Wiki / encyclopedia
  'wikipedia.org',
  'wikimedia.org',
  'britannica.com',

  // Q&A / discussion
  'stackoverflow.com',
  'stackexchange.com',
  'reddit.com',
]
```

> 说明：系统配置复合网站与用户默认复合网站在运行时合并为 effective composite list。用户默认复合网站作为新用户初始配置自动加入，但用户可在家长控制台中移除。系统配置复合网站不可由用户移除。

### 10.5 第一版暂不加入复合网站

```text
quora.com
zhihu.com
soundcloud.com
```

处理原则：

- 不进入学习网站；
- 不进入复合网站；
- 不进入黑名单网站；
- 在学习模式下按未归类网站或普通非学习网站处理；
- 自由时间允许访问；
- 后续根据实际使用情况和产品判断再决定是否加入。

---

## 11. 临时进入待归类时间

### 11.1 替代原“临时放行”

原“临时放行”容易被理解为通用绕过按钮。
建议用户侧改名为：

```text
临时进入待归类时间
```

### 11.2 定义

临时进入待归类时间是指：

> 对一个未归类网站，自动创建或复用“未归类网站访问记录”，临时按复合网站处理，并将本次访问计入待归类时间。

自动记录不是孩子申请。孩子可在 Popup 主动“申请归为学习网站”；若同一目标已有自动记录，系统升级同一条记录并保留访问概况，不创建重复项。家长批准前仍按待归类时间处理。

它不是：

- 临时加入学习网站；
- 临时绕过黑名单；
- 临时绕过受限娱乐网站；
- 临时把娱乐时间伪装成学习时间。

### 11.3 适用范围

只适用于：

```text
未归类网站
```

不适用于：

- 学习网站：本来就允许；
- 复合网站：本来就在复合网站规则内；
- 受限娱乐网站：不允许通过此机制绕过；
- 黑名单网站：硬禁止。

### 11.4 UI 说明建议

```text
仅适用于未归类网站。本次访问会自动创建或复用未归类网站访问记录，临时按复合网站处理，并计入待归类时间。
```

---

## 12. 受限娱乐网站

### 12.1 定义

受限娱乐网站是指：

> 明确娱乐优先的网站；自由时间可以访问；学习模式不允许；不支持临时进入待归类时间；但可以借时间。

它不是黑名单。

### 12.2 产品行为

| 行为 | 是否允许 | 说明 |
|---|---:|---|
| 学习模式直接访问 | 否 | 默认拦截 |
| 临时进入待归类时间 | 否 | 不能临时转为复合网站 |
| 借时间 | 是 | 消耗休息 / 自由时间额度 |
| 自由时间访问 | 是 | 本来就允许 |
| 家长长期允许 | 是 | 可通过配置加入学习网站 |
| 加入黑名单 | 是 | 由家长决定 |

### 12.3 已拒绝申请对象

未归类网站访问记录或学习网站归类申请被家长归为受限娱乐后，记录继续显示最终结果，访问控制上按受限娱乐网站处理：

- 不进入学习网站或复合网站；
- 不再享受未归类网站的临时待归类放行；
- 后续访问需要进入休息模式，并受休息配额和休息时段限制；
- 不等同于黑名单，除非家长另行主动加入黑名单。

### 12.4 系统维护与用户维护拆分

受限娱乐网站分为：

```text
defaultRestrictedEntertainmentList
customRestrictedEntertainmentList
effectiveRestrictedEntertainmentList
```

生成逻辑：

```js
effectiveRestrictedEntertainmentList = normalizeAndDedupe([
  ...defaultRestrictedEntertainmentList,
  ...customRestrictedEntertainmentList
])
```

原因：

受限娱乐网站数量有一定规模，不适合全部交给用户维护；但用户也应该能添加自己的受限娱乐网站。

### 12.4 第一版 defaultRestrictedEntertainmentList 候选

```js
[
  'bilibili.com',
  'netflix.com',
  'disneyplus.com',
  'hulu.com',
  'twitch.tv',
  'roblox.com',
  'steampowered.com',
  'steamcommunity.com',
  'epicgames.com',
  'instagram.com',
  'facebook.com',
  'x.com',
  'snapchat.com',
  'threads.net'
]
```

### 12.5 Bilibili 定位

```yaml
bilibili.com:
  studyList: false
  compositeList: false
  restrictedEntertainmentList: true
  hardBlockedList: false
  freeTimeAllowed: true
  studyModeAllowed: false
  temporaryComposite: false
  borrowTime: true
```

说明：

Bilibili 不是学习网站，不是复合网站，也不是黑名单网站。
它属于受限娱乐网站：自由时间允许，学习模式不允许，不支持临时进入待归类时间，但可以借时间。

---

## 13. 未归类网站

### 13.1 定义

未归类网站是指：

> 没有命中任何显式清单的网站。

它不是维护清单，而是 fallback 状态。

没有命中：

- 学习网站；
- 复合网站；
- 受限娱乐网站；
- 黑名单网站；

的网站，都属于未归类网站。

### 13.2 行为

| 场景 | 行为 |
|---|---|
| 学习模式 | 自动创建/复用访问记录，进入待归类时间 |
| 自由时间 | 自动创建/复用访问记录，进入待归类时间；待归类配额耗尽时才可 fallback 到休息 |
| 临时进入待归类时间 | 自动执行 |
| 家长长期配置 | 可加入学习网站、复合网站、受限娱乐网站或黑名单网站 |

访问记录按 host 聚合首次访问、最近访问和顶层导航次数。顶层导航包括主框架导航、刷新和 SPA 地址变化；tab 激活、后台重检和心跳不累计。它不是逐次浏览历史，也不保存新的完整 URL 明细。

孩子手动入口只表达“申请归为学习网站”。手动申请不会立即获得学习分类；家长批准前继续走 `pending_composite` 并计入待归类时间。

### 13.3 典型场景

- 老师临时发的新网站；
- 学校临时使用的小众平台；
- 新的课程资料站；
- 普通资讯网站；
- 完全无关网站。

未归类网站应比受限娱乐网站更宽松，因为它可能是真实学习需求，只是系统尚未配置。进入待归类流程后，家长可将它最终判定为学习网站、复合网站、受限娱乐网站或黑名单网站。

---

## 14. 黑名单网站

### 14.1 命名

用户侧建议使用：

```text
黑名单网站
```

内部建议使用：

```text
hardBlockedList
```

用户导入导出字段使用：

```text
blockedSites
```

### 14.2 定义

黑名单网站是：

> 不能访问、不许访问、不建议访问的网站。

它用于硬禁止，不是普通娱乐列表。

### 14.3 行为

| 行为 | 是否允许 |
|---|---:|
| 学习模式访问 | 否 |
| 自由时间访问 | 否 |
| 临时进入待归类时间 | 否 |
| 借时间 | 否 |

### 14.4 第一版 hardBlockedList 建议

```js
[
  'douyin.com',
  'tiktok.com'
]
```

说明：

`douyin.com` / `tiktok.com` 属于 Product Owner 明确认为极端低价值且高度沉迷的网站。
后续如需加入成人、赌博、恶意、欺诈等网站，应单独评估，不要把普通娱乐网站混入。

---

## 15. 普通门户 / 社交 / 游戏网站排除原则

### 15.1 综合门户

不收录示例：

```text
163.com
sohu.com
sina.com.cn
qq.com
msn.com
yahoo.com
```

原因：

综合门户主要是新闻、娱乐、体育、财经、广告和信息流入口，不是学习过程中必要的默认入口。它们可以在自由时间访问，但不应在学习模式下作为复合网站默认放行。

### 15.2 社交媒体

典型社交媒体多数应进入受限娱乐网站，而不是复合网站。

示例：

```text
instagram.com
facebook.com
x.com
snapchat.com
threads.net
```

### 15.3 游戏 / 游戏平台

典型游戏平台应进入受限娱乐网站。

示例：

```text
roblox.com
steampowered.com
steamcommunity.com
epicgames.com
```

### 15.4 短视频 / 强娱乐视频

短视频与强娱乐视频站不进入学习网站或复合网站。

示例：

```text
douyin.com
tiktok.com
kuaishou.com
bilibili.com
twitch.tv
netflix.com
```

处理差异：

- `douyin.com` / `tiktok.com`：黑名单候选；
- `bilibili.com`：受限娱乐网站；
- `netflix.com` / `twitch.tv`：受限娱乐网站；
- `kuaishou.com`：待 Product Owner 后续决定，可能归入黑名单或受限娱乐网站。

---

## 16. 借时间

### 16.1 定义

借时间是指：

> 在学习模式下，用户临时使用休息 / 自由时间额度访问非学习网站。

借时间不改变网站分类。

### 16.2 和临时进入待归类时间的区别

| 概念 | 对象 | 是否改变分类 | 时间计入 | 典型场景 |
|---|---|---:|---|---|
| 临时进入待归类时间 | 未归类网站 | 临时按复合网站处理 | 待归类时间 | 老师发了一个新网站 |
| 借时间 | 受限娱乐网站 / 普通非学习网站 | 不改变分类 | 休息 / 自由时间 | 想看 10 分钟 Bilibili |
| 黑名单拦截 | 黑名单网站 | 不允许改变 | 不计入可用访问 | Douyin / TikTok |

### 16.3 受限娱乐网站支持借时间

受限娱乐网站不支持临时进入待归类时间，但支持借时间。

例如：

```yaml
bilibili.com:
  temporaryComposite: false
  borrowTime: true
```

---

## 17. 用户导入导出配置

### 17.1 文件定位

用户导入导出文件是：

> 用户可感知的网站访问配置。

它不是系统默认清单备份，也不是完整网站分类数据库。

### 17.2 文件原则

用户导入导出配置应保持简单，只暴露用户维护项。

不暴露：

- 系统默认规则；
- default removal；
- label；
- category；
- note；
- enabled；
- preferences；
- overrides；
- defaultPolicyVersion；
- normalize / dedupe 等工程概念。

### 17.3 第一版用户配置字段

用户导入导出配置包含四类：

```text
studySites
compositeSites
restrictedEntertainmentSites
blockedSites
```

说明：

| 字段 | 用户含义 |
|---|---|
| `studySites` | 用户额外允许的学习网站 |
| `compositeSites` | 用户额外添加的复合网站 |
| `restrictedEntertainmentSites` | 用户额外添加的受限娱乐网站 |
| `blockedSites` | 用户添加的黑名单网站 |

### 17.4 第一版 JSON 示例

文件名：

```text
docs/site-access-config.example.json
```

内容：

```json
{
  "app": "TimeOnChrome",
  "configType": "site-access",
  "configVersion": 1,
  "description": "User-managed site access configuration. System default site lists are not included.",
  "studySites": [
    "keystoneacademy.cn",
    "teacher-homework.example.com"
  ],
  "compositeSites": [
    "example-video-learning.com",
    "example-qna-community.com"
  ],
  "restrictedEntertainmentSites": [
    "example-entertainment-site.com",
    "example-game-site.com"
  ],
  "blockedSites": [
    "example-blocked-site.com",
    "example-distracting-site.com"
  ]
}
```

### 17.5 字符串数组优先

V0 用户配置使用字符串数组，不使用对象数组。

原因：

- 用户自己维护的网站数量很少；
- 域名是唯一真正必要字段；
- `label/category/note/enabled` 会增加用户认知负担；
- 复杂元数据可留给系统默认清单或未来 UI 内部管理。

---

## 18. 运行时规范化建议

运行时应对域名做统一处理：

1. 转小写；
2. 去除协议；
3. 去除路径、query、hash；
4. 去除常见 `www.` 前缀；
5. 支持精确域名匹配；
6. 对需要覆盖子域名的规则，可使用后缀匹配；
7. 对系统清单和用户清单合并后去重。

示例：

```js
function getEffectiveStudyList(config) {
  return normalizeAndDedupe([
    ...flattenDefaultStudyList(config.defaultStudyList),
    ...config.customStudyList
  ])
}

function getEffectiveRestrictedEntertainmentList(config) {
  return normalizeAndDedupe([
    ...defaultRestrictedEntertainmentList,
    ...config.customRestrictedEntertainmentList
  ])
}
```

---

## 19. UI 文案建议

### 19.1 待归类时间

短说明：

```text
来自搜索、YouTube、百科、问答、音乐等复合用途网站。暂不直接算作学习或休息，后续可进一步分类。
```

### 19.2 临时进入待归类时间

按钮说明：

```text
仅适用于未归类网站。本次访问会自动创建或复用未归类网站访问记录，临时按复合网站处理，并计入待归类时间。
```

### 19.3 受限娱乐网站

说明：

```text
这类网站自由时间可以访问，但学习模式下不能临时进入待归类时间；如需访问，可使用借时间。
```

### 19.4 黑名单网站

说明：

```text
这些网站在学习模式和自由时间都不能访问，也不能借时间。
```

---

## 20. 后续扩展方向

V0 不应为了分类完美而扩大工程范围。

V0 目标：

1. 明确五类网站分类；
2. default/custom/effective 学习清单拆分；
3. 待归类时间显示为“待归类时间”；
4. 临时放行改为“临时进入待归类时间”；
5. 受限娱乐网站不支持临时进入待归类时间，但支持借时间；
6. 黑名单网站替代 unsafeList 的用户表达；
7. 用户导入导出配置保持字符串数组。

V1 / V2 可以考虑：

1. URL / channel / query 级复合网站判断；
2. YouTube 内容级判断；
3. 搜索查询意图判断；
4. 用户回看后手动分类待归类时间；
5. AI 内容分类；
6. 待归类时间回填到学习时间 / 休息时间；
7. 更细的 audioList、portalList、entertainmentList。

---

## 21. 最终一句话

TimeOnChrome 网站访问分类采用：

```text
学习网站
复合网站
受限娱乐网站
未归类网站
黑名单网站
```

其中：

- 学习网站采用宽口径，解决真实学习流程误拦截；
- 复合网站承载仅凭域名无法判断用途的网站，相关访问先进入“待归类时间”；
- 临时放行改为“临时进入待归类时间”，只适用于未归类网站；
- 受限娱乐网站自由时间允许，学习模式不允许，不支持临时进入待归类时间，但支持借时间；
- 黑名单网站是硬禁止，不允许访问、不允许借时间；
- 用户导入导出配置只暴露四个简单字符串数组：`studySites`、`compositeSites`、`restrictedEntertainmentSites`、`blockedSites`。
