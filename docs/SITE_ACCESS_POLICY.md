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

本文件是网站访问策略和系统网站配置清单的唯一正式人读维护入口；不再维护独立候选库或草稿文件。

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
- 普通未归类网站作为 fallback 状态处理，但访问时会自动进入待归类流程，不再直接等同休息目标；待归类配额耗尽后的 fallback 是借用休息配额，不改变其待归类使用性质；
- 受限娱乐 / 黑名单父域是保护性边界：历史或自动生成的 host/subdomain 待归类记录不得覆盖该父域边界。只有已支持的特殊网站对象（例如 YouTube 的具体视频、播放列表、频道）可以在申请或审批语义下作为待归类/学习/复合对象存在。
- 主站等价域名统一管理：`example.com`、`www.example.com`、`m.example.com` 视为同一主站入口。主站定义已经存在时，不能通过 `www.`、`m.` 或同 host 路径 URL 另行申请/添加为学习网站；非主站 alias 的独立服务子域（如 `docs.google.com`）仍可单独分类。
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

系统配置范围包含 `defaultStudySites`、`defaultCompositeSites`、`defaultUserCompositeSites`、`defaultRestrictedEntertainmentSites`、`defaultBlockedSites` 和可选 `siteCatalog`。其中五个 default list 都是运行 source of truth；`siteCatalog` 是系统管理和人工审核元数据。系统配置导入仍必须经过系统配置 preflight、管理员权限和全局影响确认。

### 3.0.2 Qustodio 风格内容分类

系统管理界面按 Qustodio Web Filters 风格维护内容类别，再映射到 TimeOnChrome 运行分类：

| 内容类别 | 默认 TimeOnChrome 分类 |
|---|---|
| 教育性、政府、企业、健康、人工智能、技术、职业 | 学习网站 |
| 网页邮件、文件共享 | 学习网站或复合网站，允许单项覆盖 |
| 搜索门户、新闻、宗教、综合门户 | 复合网站或待归类观察 |
| 娱乐、体育、游戏、旅游、购物、论坛、社交网络、聊天、视频/直播、娱乐门户 | 受限娱乐网站 |
| 博彩、代理/漏洞、暴力、武器、脏话、成人内容、色情内容、酒精、毒品、烟草 | 黑名单网站 |

固定例外：`youtube.com` / `youtu.be` 进入特殊网站对象管理，根域按受限娱乐处理，具体视频、播放列表、频道可由家长批准为学习或复合；`stackoverflow.com` 保持学习/技术用途；`stackexchange.com` 与 `reddit.com` 暂保持复合；`kahoot.it` / `quizizz.com` / `quizlet.com` 保持课堂工具或学习辅助；`douyin.com` / `tiktok.com` 继续可放黑名单。

### 3.0.3 网站管理策略目录

家长控制台“网站管理”的主分类采用 TimeOnChrome 管理策略分类，而不是 Qustodio 内容分类：学习网站、复合网站、受限娱乐网站、黑名单网站。系统配置、自定义配置、已批准精确规则和已使用未归类历史按来源分组展示。

系统配置在网站管理页内以“系统网站配置-分类管理”呈现：页面仍停留在当前管理策略下，但系统配置网站会按 `siteCatalog.contentCategory` 分组成 Qustodio 风格内容分类；缺少目录元数据或内容分类的系统网站进入“未标注分类”。系统默认网站库必须为所有 `default*Sites` 提供 `siteCatalog` 元数据；Worker 读取旧 D1 系统配置时也会用 fallback catalog 补齐缺失目录项。管理员可以点击系统配置网站同时编辑内容分类和管理策略分类，保存时更新 `siteCatalog`，并把该域名同步移动到对应 `default*Sites` 运行清单。该操作是全局系统配置变更，必须显示全局影响确认；非管理员只能查看，不能写入。

“已使用未归类网站”是网站管理中的独立待处理模块，位于“特殊网站”之后，表示最近 30 天内曾按未归类/待归类路径产生使用记录的网站。它不是复合网站、不是特殊网站；`target_stats_v1` 聚合只作为发现和访问证据，不承担审核状态。云端家长控制台点击归类时，若该网站没有匹配的 `site_classification_requests_v1` 记录，必须先生成一条 `recordSource: auto_unclassified_access` 的未归类网站使用记录，再通过网站归类记录 decision 流程写入当前 profile 配置。若历史落账曾是 `pending_composite` / `unclassified`，但当前 effective 清单已经把该网站归入学习、复合、受限娱乐或黑名单，仍应显示为“历史待归类落账，当前已归类”的解释项，用于解释统计来源；该类解释项默认不再提供重新归类动作。本地 Admin 只读展示本机可获得的未归类访问/自动记录信息，不提供本地归类、保存或审批。云端“网站归类记录”是统一查看和处理入口：页面只保留“复合网站申请学习记录”和“未归类网站使用记录”两个单元。前者读取 `site_classification_requests_v1` 中孩子手动提交的学习归类申请；后者以 `site_classification_requests_v1` 自动未归类访问记录为审核事实，并用 `target_stats_v1` 派生聚合作为访问证据补充。同一 canonical host 同时存在审核记录和统计聚合时只显示一行，操作始终落到审核记录。默认只展开未处理记录，已处理记录折叠为历史。

网站管理顶部“添加到当前策略”入口只用于新增用户自定义配置网站，不负责移动分类。添加前必须校验域名格式、当前策略重复和跨策略重复：已存在于系统网站配置-分类管理的站点不得加入用户自定义配置；已存在于用户自定义配置的同策略站点不得重复加入；已存在于其他策略的站点必须通过列表内“归为…”或系统分类编辑完成分类变更。云端管理员可将单个用户自定义配置网站“添加到系统配置”，该操作会全局写入系统网站配置-分类管理，并从当前档案 custom list 移除，避免同一域名同时保留在系统配置和用户配置中。

### 3.0.4 网站归类动作统一校验

新增、申请和审批网站归类时必须使用同一套动作校验。精确同一 host 不得跨管理策略重复；若父域或上级范围已归为受限娱乐或黑名单，则普通子域和普通精确 URL 不得新增、申请或审批为学习/复合。特殊网站对象是唯一例外：`youtube.com` 根域可保持受限娱乐，同时具体视频、播放列表、频道对象可被批准为学习或复合。学习与复合父域之间仍允许更具体子域细分，例如 `google.com` 学习、`news.google.com` 复合。Popup 点击“申请归为学习网站”入口时先执行只读校验；写入前仍保留强制校验，防止 UI 或 API 绕过。历史已存在配置不自动迁移，本规则只阻止新添加、新申请和新审批制造冲突。

### 3.1 概念迁移表

| 旧概念 | 新概念 | 新定义 | 实现字段暂定 |
|---|---|---|---|
| 综合时间 | 待归类时间 | 尚未归入学习或休息的过渡时间池，应尽量实时/半实时归因 | `compositeSeconds` / `undeterminedSeconds` |
| 综合网站 | 复合网站 | 仅凭域名无法判断使用性质，需要内容、URL、标题、频道、行为或人工回看判断 | `compositeList` / `defaultCompositeSites` / `defaultUserCompositeSites` |
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

## 8. 系统网站配置维护清单

本节是系统网站配置的唯一人读维护清单。后续修订系统网站配置时，先在本节确认分类，再同步修正 `workers/config/site-access-defaults.json` 或云端 D1 `system-access-config`。

维护结构保持现有运行模型，不新增 schema：

- `defaultStudySites`：学习网站。
- `defaultCompositeSites` / `defaultUserCompositeSites`：复合网站。
- `defaultRestrictedEntertainmentSites`：受限娱乐网站。
- `defaultBlockedSites`：黑名单网站。
- `siteCatalog.contentCategory`：Qustodio 风格内容分类，用于系统网站配置-分类管理展示和人工审核。

内容分类和管理策略是两套字段：内容分类说明网站类型，管理策略决定运行行为。云端 Pages 展示方式为“管理策略 -> Qustodio 内容分类 -> 域名表格”，本节采用同一格式。

当前分类倾向：

- `reddit.com` 继续复合。
- `quora.com` / `zhihu.com` 归复合。
- `britannica.com` / `stackoverflow.com` / `github.com` 归学习。
- 短视频一律黑名单：`douyin.com`、`tiktok.com`、`kuaishou.com`、`kwai.com`。
- 偏游戏从严：`itch.io`、`chess.com`、`lichess.org` 归受限娱乐。
- 工作/创作参考属性更重的平台归复合：`vimeo.com`、`pinterest.com`。
- 社区属性重的站点归受限娱乐：`douban.com`、`v2ex.com`。
- 门户游戏/娱乐/视频子站严格受限：例如 `cg.163.com`、`game.163.com`、`games.qq.com`、`ent.*`、`v.qq.com`。
- 工具/生产力平台从宽：Google / Microsoft / Cloudflare / Apple / Adobe 默认学习，特殊子站单独降级。
- 音乐/音频平台默认学习：`spotify.com`、`music.youtube.com`、`music.163.com`、`y.qq.com`、`music.apple.com`、`soundcloud.com`、`bandcamp.com`。
- 消费娱乐门户默认复合：Tencent / NetEase / Baidu / ByteDance / Alibaba 默认复合，学习子站提升，娱乐/游戏/直播/短视频子站降级。

### 复杂网站体系 / 域名家族策略

复杂网站体系采用“家族默认策略 + 例外子站”的人读维护方式，运行配置仍展开到现有 `default*Sites` 清单。文档可用 `*.domain.com` 表达家族规则；后续同步系统 JSON / D1 前，必须确认当前校验和运行时接受该 wildcard，并补充测试。`www.example.com` 不允许作为区别于 `example.com` 的策略边界，因为当前实现将 `www.` 视为裸域别名。

#### 工具 / 生产力平台

| 域名家族 | 默认学习范围 | 复合例外 | 受限/黑名单例外 | 理由/倾向来源 |
|---|---|---|---|---|
| Google | `google.com`, `*.google.com` | `news.google.com`, `shopping.google.com`, `play.google.com` | `youtube.com` 受限娱乐；YouTube 对象级学习/复合规则另算 | 工具、搜索、文档、课堂、AI、资料管理整体从宽学习；新闻、购物、应用商店、视频单独降级。 |
| Microsoft | `microsoft.com`, `*.microsoft.com`, `office.com`, `*.office.com`, `sharepoint.com`, `*.sharepoint.com`, `onedrive.live.com` | `bing.com`, `msn.com` | `xbox.com` 受限娱乐 | Office、Learn、Teams、OneDrive、Copilot 等生产力属性强；搜索、门户、游戏拆开。 |
| Cloudflare | `cloudflare.com`, `*.cloudflare.com`, `community.cloudflare.com` | 无 | 无 | 技术文档、控制台、社区排障均按学习/开发处理。 |
| Apple | `apple.com`, `*.apple.com`, `icloud.com`, `tv.apple.com`, `music.apple.com` | 无默认例外 | 无默认例外 | Apple 主体系按工具/支持/开发/资料管理从宽；音乐按学习，视频子站若未来发现消费风险再降级。 |
| Adobe | `adobe.com`, `*.adobe.com` | `stock.adobe.com`, `behance.net` | 无 | 创作工具、帮助、教程按学习；素材消费和作品流复合。 |
| GitHub / Stack Exchange | `github.com`, `github.io`, `gist.github.com`, `github.blog`, `stackoverflow.com`, `stackexchange.com`, `serverfault.com`, `superuser.com`, `askubuntu.com` | 无 | 无 | 编程、技术问答、项目协作学习属性明确，从宽学习。 |

#### 消费娱乐门户平台

| 域名家族 | 默认复合范围 | 学习例外 | 受限娱乐例外 | 黑名单例外 | 理由/倾向来源 |
|---|---|---|---|---|---|
| Tencent / QQ | `qq.com`, `tencent.com`, `mail.qq.com` | `docs.qq.com`, `y.qq.com` | `v.qq.com`, `games.qq.com`, `comic.qq.com`, `qzone.qq.com` | 无 | 门户、邮箱、社交、视频、游戏混合；默认复合，文档/音乐从宽学习，娱乐子站受限。 |
| NetEase / 163 | `163.com`, `mail.163.com` | `open.163.com`, `icourse163.org`, `youdao.com`, `music.163.com` | `game.163.com`, `cg.163.com`, `cc.163.com`, `ent.163.com` | 无 | 综合门户和消费娱乐属性重；明确学习/音乐子站提升，游戏/直播/娱乐子站降级。 |
| Baidu | `baidu.com`, `pan.baidu.com`, `map.baidu.com` | `baike.baidu.com`, `wenku.baidu.com`, `fanyi.baidu.com`, `xueshu.baidu.com` | `tieba.baidu.com`, `haokan.baidu.com`, `youxi.baidu.com` | 无 | 搜索、网盘、地图、社区、视频、游戏混合；资料型子站提升，社区/视频/游戏降级。 |
| ByteDance | `toutiao.com`, `dongchedi.com` | `feishu.cn`, `larksuite.com`, `volcengine.com` | `ixigua.com` | `douyin.com`, `tiktok.com` | 门户/推荐流/短视频风险高；协作和云平台提升，短视频黑名单。 |
| Alibaba | `alibaba.com`, `1688.com`, `taobao.com`, `tmall.com`, `aliexpress.com` | `aliyun.com`, `dingtalk.com`, `yuque.com` | `youku.com`, `tudou.com` | 无 | 电商/消费默认复合，云、协作、知识库提升，视频子站受限。 |

### 学习网站

#### 教育性

| 域名 | 名称/说明 | 理由/倾向来源 |
|---|---|---|
| `docs.google.com` | docs.google.com | 当前系统学习清单；学习模式下合理可能需要。 |
| `sheets.google.com` | sheets.google.com | 当前系统学习清单；学习模式下合理可能需要。 |
| `slides.google.com` | slides.google.com | 当前系统学习清单；学习模式下合理可能需要。 |
| `forms.google.com` | forms.google.com | 当前系统学习清单；学习模式下合理可能需要。 |
| `meet.google.com` | meet.google.com | 当前系统学习清单；学习模式下合理可能需要。 |
| `calendar.google.com` | calendar.google.com | 当前系统学习清单；学习模式下合理可能需要。 |
| `classroom.google.com` | classroom.google.com | 当前系统学习清单；学习模式下合理可能需要。 |
| `instructure.com` | instructure.com | 当前系统学习清单；学习模式下合理可能需要。 |
| `blackboard.com` | blackboard.com | 当前系统学习清单；学习模式下合理可能需要。 |
| `moodle.org` | moodle.org | 当前系统学习清单；学习模式下合理可能需要。 |
| `schoology.com` | schoology.com | 当前系统学习清单；学习模式下合理可能需要。 |
| `clever.com` | clever.com | 当前系统学习清单；学习模式下合理可能需要。 |
| `turnitin.com` | turnitin.com | 当前系统学习清单；学习模式下合理可能需要。 |
| `keep.google.com` | keep.google.com | 当前系统学习清单；学习模式下合理可能需要。 |
| `onenote.com` | onenote.com | 当前系统学习清单；学习模式下合理可能需要。 |
| `quizizz.com` | quizizz.com | 当前系统学习清单；学习模式下合理可能需要。 |
| `kahoot.it` | kahoot.it | 当前系统学习清单；学习模式下合理可能需要。 |
| `quizlet.com` | quizlet.com | 当前系统学习清单；学习模式下合理可能需要。 |
| `noredink.com` | noredink.com | 当前系统学习清单；学习模式下合理可能需要。 |
| `membean.com` | membean.com | 当前系统学习清单；学习模式下合理可能需要。 |
| `achieve3000.com` | achieve3000.com | 当前系统学习清单；学习模式下合理可能需要。 |
| `quillbot.com` | quillbot.com | 当前系统学习清单；学习模式下合理可能需要。 |
| `grammarly.com` | grammarly.com | 当前系统学习清单；学习模式下合理可能需要。 |
| `owl.purdue.edu` | owl.purdue.edu | 当前系统学习清单；学习模式下合理可能需要。 |
| `ibo.org` | ibo.org | 当前系统学习清单；学习模式下合理可能需要。 |
| `managebac.com` | managebac.com | 当前系统学习清单；学习模式下合理可能需要。 |
| `kognity.com` | kognity.com | 当前系统学习清单；学习模式下合理可能需要。 |
| `revisionvillage.com` | revisionvillage.com | 当前系统学习清单；学习模式下合理可能需要。 |
| `savemyexams.com` | savemyexams.com | 当前系统学习清单；学习模式下合理可能需要。 |
| `physicsandmathstutor.com` | physicsandmathstutor.com | 当前系统学习清单；学习模式下合理可能需要。 |
| `albert.io` | albert.io | 当前系统学习清单；学习模式下合理可能需要。 |
| `fiveable.me` | fiveable.me | 当前系统学习清单；学习模式下合理可能需要。 |
| `pastpapers.co` | pastpapers.co | 当前系统学习清单；学习模式下合理可能需要。 |
| `crackap.com` | crackap.com | 当前系统学习清单；学习模式下合理可能需要。 |
| `ibdocuments.com` | ibdocuments.com | 当前系统学习清单；学习模式下合理可能需要。 |
| `ibsurvival.com` | ibsurvival.com | 当前系统学习清单；学习模式下合理可能需要。 |
| `lanterna.com` | lanterna.com | 当前系统学习清单；学习模式下合理可能需要。 |
| `thinking.net` | thinking.net | 当前系统学习清单；学习模式下合理可能需要。 |
| `bioninja.com.au` | bioninja.com.au | 当前系统学习清单；学习模式下合理可能需要。 |
| `theoryofknowledge.net` | theoryofknowledge.net | 当前系统学习清单；学习模式下合理可能需要。 |
| `khanacademy.org` | Khan Academy | 当前系统学习清单；学习模式下合理可能需要。 |
| `ocw.mit.edu` | ocw.mit.edu | 当前系统学习清单；学习模式下合理可能需要。 |
| `coursera.org` | Coursera | 当前系统学习清单；学习模式下合理可能需要。 |
| `edx.org` | edX | 当前系统学习清单；学习模式下合理可能需要。 |
| `brilliant.org` | brilliant.org | 当前系统学习清单；学习模式下合理可能需要。 |
| `udemy.com` | udemy.com | 当前系统学习清单；学习模式下合理可能需要。 |
| `futurelearn.com` | futurelearn.com | 当前系统学习清单；学习模式下合理可能需要。 |
| `udacity.com` | udacity.com | 当前系统学习清单；学习模式下合理可能需要。 |
| `codecademy.com` | codecademy.com | 当前系统学习清单；学习模式下合理可能需要。 |
| `datacamp.com` | datacamp.com | 当前系统学习清单；学习模式下合理可能需要。 |
| `freecodecamp.org` | freecodecamp.org | 当前系统学习清单；学习模式下合理可能需要。 |
| `openstax.org` | openstax.org | 当前系统学习清单；学习模式下合理可能需要。 |
| `ck12.org` | ck12.org | 当前系统学习清单；学习模式下合理可能需要。 |
| `britannica.com` | britannica.com | 已确认：百科资料属性强，归学习网站。 |
| `mathsisfun.com` | mathsisfun.com | 当前系统学习清单；学习模式下合理可能需要。 |
| `artofproblemsolving.com` | artofproblemsolving.com | 当前系统学习清单；学习模式下合理可能需要。 |
| `aops.com` | aops.com | 当前系统学习清单；学习模式下合理可能需要。 |
| `gutenberg.org` | gutenberg.org | 当前系统学习清单；学习模式下合理可能需要。 |
| `archive.org` | archive.org | 当前系统学习清单；学习模式下合理可能需要。 |
| `loc.gov` | loc.gov | 当前系统学习清单；学习模式下合理可能需要。 |
| `ankiweb.net` | ankiweb.net | 当前系统学习清单；学习模式下合理可能需要。 |
| `collegeboard.org` | collegeboard.org | 当前系统学习清单；学习模式下合理可能需要。 |
| `apclassroom.collegeboard.org` | apclassroom.collegeboard.org | 当前系统学习清单；学习模式下合理可能需要。 |
| `bluebook.app.collegeboard.org` | bluebook.app.collegeboard.org | 当前系统学习清单；学习模式下合理可能需要。 |
| `act.org` | act.org | 当前系统学习清单；学习模式下合理可能需要。 |

#### 企业

| 域名 | 名称/说明 | 理由/倾向来源 |
|---|---|---|
| `office.com` | office.com | 当前系统学习清单；学习模式下合理可能需要。 |
| `microsoft.com` | Microsoft | 工具/生产力平台从宽；默认按学习网站管理，搜索/门户/游戏另列例外。 |
| `*.microsoft.com` | Microsoft 子域家族 | 工具/生产力平台从宽；后续同步运行配置前需补充 wildcard 校验。 |
| `*.office.com` | Office 子域家族 | Office 生产力套件，默认学习。 |
| `sharepoint.com` | SharePoint | 学校/组织文档协作，默认学习。 |
| `*.sharepoint.com` | SharePoint 子域家族 | 学校/组织文档协作，默认学习；后续同步运行配置前需补充 wildcard 校验。 |
| `planner.microsoft.com` | planner.microsoft.com | 当前系统学习清单；学习模式下合理可能需要。 |
| `to-do.office.com` | to-do.office.com | 当前系统学习清单；学习模式下合理可能需要。 |
| `teams.microsoft.com` | teams.microsoft.com | 当前系统学习清单；学习模式下合理可能需要。 |
| `apple.com` | Apple | 工具/生产力平台从宽；默认按学习网站管理。 |
| `*.apple.com` | Apple 子域家族 | 工具/支持/开发/资料管理从宽学习；后续同步运行配置前需补充 wildcard 校验。 |
| `icloud.com` | iCloud | 文档、照片、资料同步和账号工具属性，默认学习。 |
| `adobe.com` | Adobe | 创作工具平台从宽；默认按学习网站管理，素材消费和作品流另列复合。 |
| `*.adobe.com` | Adobe 子域家族 | 创作工具、帮助、教程默认学习；后续同步运行配置前需补充 wildcard 校验。 |
| `notion.so` | notion.so | 当前系统学习清单；学习模式下合理可能需要。 |
| `obsidian.md` | obsidian.md | 当前系统学习清单；学习模式下合理可能需要。 |
| `trello.com` | trello.com | 当前系统学习清单；学习模式下合理可能需要。 |
| `slack.com` | slack.com | 当前系统学习清单；学习模式下合理可能需要。 |
| `reclaim.ai` | reclaim.ai | 当前系统学习清单；学习模式下合理可能需要。 |
| `powerschool.com` | powerschool.com | 当前系统学习清单；学习模式下合理可能需要。 |

#### 人工智能

| 域名 | 名称/说明 | 理由/倾向来源 |
|---|---|---|
| `chatgpt.com` | ChatGPT | 当前系统学习清单；学习模式下合理可能需要。 |
| `openai.com` | OpenAI | 当前系统学习清单；学习模式下合理可能需要。 |
| `claude.ai` | Claude | 当前系统学习清单；学习模式下合理可能需要。 |
| `copilot.microsoft.com` | Microsoft Copilot | 当前系统学习清单；学习模式下合理可能需要。 |
| `phind.com` | phind.com | 当前系统学习清单；学习模式下合理可能需要。 |
| `gemini.google.com` | Gemini | 当前系统学习清单；学习模式下合理可能需要。 |
| `poe.com` | poe.com | 当前系统学习清单；学习模式下合理可能需要。 |
| `perplexity.ai` | perplexity.ai | 当前系统学习清单；学习模式下合理可能需要。 |
| `notebooklm.google.com` | notebooklm.google.com | 当前系统学习清单；学习模式下合理可能需要。 |
| `elicit.org` | elicit.org | 当前系统学习清单；学习模式下合理可能需要。 |
| `consensus.app` | consensus.app | 当前系统学习清单；学习模式下合理可能需要。 |
| `scite.ai` | scite.ai | 当前系统学习清单；学习模式下合理可能需要。 |
| `gamma.app` | gamma.app | 当前系统学习清单；学习模式下合理可能需要。 |
| `doubao.com` | doubao.com | 当前系统学习清单；学习模式下合理可能需要。 |
| `deepseek.com` | deepseek.com | 当前系统学习清单；学习模式下合理可能需要。 |

#### 技术

| 域名 | 名称/说明 | 理由/倾向来源 |
|---|---|---|
| `colab.research.google.com` | colab.research.google.com | 当前系统学习清单；学习模式下合理可能需要。 |
| `wolframalpha.com` | wolframalpha.com | 当前系统学习清单；学习模式下合理可能需要。 |
| `prezi.com` | prezi.com | 当前系统学习清单；学习模式下合理可能需要。 |
| `miro.com` | miro.com | 当前系统学习清单；学习模式下合理可能需要。 |
| `lucidchart.com` | lucidchart.com | 当前系统学习清单；学习模式下合理可能需要。 |
| `draw.io` | draw.io | 当前系统学习清单；学习模式下合理可能需要。 |
| `diagrams.net` | diagrams.net | 当前系统学习清单；学习模式下合理可能需要。 |
| `overleaf.com` | overleaf.com | 当前系统学习清单；学习模式下合理可能需要。 |
| `zotero.org` | zotero.org | 当前系统学习清单；学习模式下合理可能需要。 |
| `mendeley.com` | mendeley.com | 当前系统学习清单；学习模式下合理可能需要。 |
| `citationmachine.net` | citationmachine.net | 当前系统学习清单；学习模式下合理可能需要。 |
| `easybib.com` | easybib.com | 当前系统学习清单；学习模式下合理可能需要。 |
| `bibme.org` | bibme.org | 当前系统学习清单；学习模式下合理可能需要。 |
| `scribbr.com` | scribbr.com | 当前系统学习清单；学习模式下合理可能需要。 |
| `languagetool.org` | languagetool.org | 当前系统学习清单；学习模式下合理可能需要。 |
| `hemingwayapp.com` | hemingwayapp.com | 当前系统学习清单；学习模式下合理可能需要。 |
| `desmos.com` | desmos.com | 当前系统学习清单；学习模式下合理可能需要。 |
| `geogebra.org` | geogebra.org | 当前系统学习清单；学习模式下合理可能需要。 |
| `symbolab.com` | symbolab.com | 当前系统学习清单；学习模式下合理可能需要。 |
| `mathway.com` | mathway.com | 当前系统学习清单；学习模式下合理可能需要。 |
| `physicsclassroom.com` | physicsclassroom.com | 当前系统学习清单；学习模式下合理可能需要。 |
| `phet.colorado.edu` | phet.colorado.edu | 当前系统学习清单；学习模式下合理可能需要。 |
| `falstad.com` | falstad.com | 当前系统学习清单；学习模式下合理可能需要。 |
| `myphysicslab.com` | myphysicslab.com | 当前系统学习清单；学习模式下合理可能需要。 |
| `logic.ly` | logic.ly | 当前系统学习清单；学习模式下合理可能需要。 |
| `github.com` | GitHub | 已确认：编程/项目学习用途明确，归学习网站。 |
| `github.io` | GitHub Pages | 编程/项目展示和技术文档用途明确，归学习网站。 |
| `gist.github.com` | GitHub Gist | 代码片段和技术协作用途明确，归学习网站。 |
| `github.blog` | GitHub Blog | 开发者生态和技术内容属性强，从宽归学习。 |
| `stackoverflow.com` | Stack Overflow | 已确认：技术问答学习用途明确，归学习网站。 |
| `stackexchange.com` | Stack Exchange | 已确认：技术/知识问答网络，从宽归学习网站。 |
| `serverfault.com` | Server Fault | 技术问答学习用途明确，归学习网站。 |
| `superuser.com` | Super User | 技术问答学习用途明确，归学习网站。 |
| `askubuntu.com` | Ask Ubuntu | 技术问答学习用途明确，归学习网站。 |
| `cloudflare.com` | Cloudflare | 技术/开发平台，归学习网站。 |
| `*.cloudflare.com` | Cloudflare 子域家族 | 技术文档、控制台、开发者工具默认学习；后续同步运行配置前需补充 wildcard 校验。 |
| `community.cloudflare.com` | Cloudflare Community | 技术社区/排障资料，从宽归学习。 |
| `leetcode.com` | leetcode.com | 当前系统学习清单；学习模式下合理可能需要。 |
| `hackerrank.com` | hackerrank.com | 当前系统学习清单；学习模式下合理可能需要。 |
| `codingbat.com` | codingbat.com | 当前系统学习清单；学习模式下合理可能需要。 |
| `replit.com` | replit.com | 当前系统学习清单；学习模式下合理可能需要。 |
| `codepen.io` | codepen.io | 当前系统学习清单；学习模式下合理可能需要。 |
| `developer.mozilla.org` | developer.mozilla.org | 当前系统学习清单；学习模式下合理可能需要。 |
| `w3schools.com` | w3schools.com | 当前系统学习清单；学习模式下合理可能需要。 |
| `tinkercad.com` | tinkercad.com | 当前系统学习清单；学习模式下合理可能需要。 |
| `arduino.cc` | arduino.cc | 当前系统学习清单；学习模式下合理可能需要。 |
| `raspberrypi.com` | raspberrypi.com | 当前系统学习清单；学习模式下合理可能需要。 |
| `instructables.com` | instructables.com | 当前系统学习清单；学习模式下合理可能需要。 |
| `arxiv.org` | arxiv.org | 当前系统学习清单；学习模式下合理可能需要。 |
| `scholar.google.com` | scholar.google.com | 当前系统学习清单；学习模式下合理可能需要。 |
| `jstor.org` | jstor.org | 当前系统学习清单；学习模式下合理可能需要。 |
| `researchgate.net` | researchgate.net | 当前系统学习清单；学习模式下合理可能需要。 |
| `semanticscholar.org` | semanticscholar.org | 当前系统学习清单；学习模式下合理可能需要。 |
| `pubmed.ncbi.nlm.nih.gov` | pubmed.ncbi.nlm.nih.gov | 当前系统学习清单；学习模式下合理可能需要。 |
| `plato.stanford.edu` | plato.stanford.edu | 当前系统学习清单；学习模式下合理可能需要。 |
| `ncbi.nlm.nih.gov` | ncbi.nlm.nih.gov | 当前系统学习清单；学习模式下合理可能需要。 |
| `nature.com` | nature.com | 当前系统学习清单；学习模式下合理可能需要。 |
| `science.org` | science.org | 当前系统学习清单；学习模式下合理可能需要。 |
| `springer.com` | springer.com | 当前系统学习清单；学习模式下合理可能需要。 |
| `sciencedirect.com` | sciencedirect.com | 当前系统学习清单；学习模式下合理可能需要。 |
| `cambridge.org` | cambridge.org | 当前系统学习清单；学习模式下合理可能需要。 |
| `oup.com` | oup.com | 当前系统学习清单；学习模式下合理可能需要。 |
| `canva.com` | canva.com | 当前系统学习清单；学习模式下合理可能需要。 |
| `figma.com` | figma.com | 当前系统学习清单；学习模式下合理可能需要。 |
| `photopea.com` | photopea.com | 当前系统学习清单；学习模式下合理可能需要。 |
| `pixlr.com` | pixlr.com | 当前系统学习清单；学习模式下合理可能需要。 |

#### 网页邮件

| 域名 | 名称/说明 | 理由/倾向来源 |
|---|---|---|
| `outlook.live.com` | outlook.live.com | 当前系统学习清单；学习模式下合理可能需要。 |

#### 文件共享

| 域名 | 名称/说明 | 理由/倾向来源 |
|---|---|---|
| `drive.google.com` | drive.google.com | 当前系统学习清单；学习模式下合理可能需要。 |
| `onedrive.live.com` | onedrive.live.com | 当前系统学习清单；学习模式下合理可能需要。 |

#### 搜索门户

| 域名 | 名称/说明 | 理由/倾向来源 |
|---|---|---|
| `google.com` | Google | 工具/生产力平台从宽；默认全站学习，`www.google.com` 不作为差异策略。 |
| `*.google.com` | Google 子域家族 | Google 子域整体按学习/生产力从宽；新闻、购物、应用商店另列复合例外。 |
| `google.com.hk` | Google HK | Google 搜索/工具入口从宽归学习；若后续需要地区搜索单独降级，再按例外处理。 |

#### 音乐 / 音频

| 域名 | 名称/说明 | 理由/倾向来源 |
|---|---|---|
| `spotify.com` | Spotify | 已确认：音乐/音频默认学习，背景使用通常不直接打断学习。 |
| `music.youtube.com` | YouTube Music | 已确认：音乐子站按学习；与 `youtube.com` 视频主站受限分开。 |
| `music.163.com` | NetEase Cloud Music | 已确认：音乐/音频默认学习。 |
| `y.qq.com` | QQ Music | 已确认：音乐/音频默认学习。 |
| `music.apple.com` | Apple Music | 已确认：音乐/音频默认学习。 |
| `soundcloud.com` | SoundCloud | 已确认：音乐/音频默认学习。 |
| `bandcamp.com` | Bandcamp | 已确认：音乐/音频默认学习。 |

#### 门户学习例外

| 域名 | 名称/说明 | 理由/倾向来源 |
|---|---|---|
| `docs.qq.com` | 腾讯文档 | Tencent / QQ 体系学习例外，文档协作用途明确。 |
| `open.163.com` | 网易公开课 | NetEase / 163 体系学习例外，课程内容属性明确。 |
| `icourse163.org` | 中国大学 MOOC | NetEase / 163 体系学习例外，课程平台属性明确。 |
| `youdao.com` | 有道 | NetEase / 163 体系学习例外，词典/翻译/学习工具属性明确。 |
| `baike.baidu.com` | 百度百科 | Baidu 体系学习例外，百科资料属性明确。 |
| `wenku.baidu.com` | 百度文库 | Baidu 体系学习例外，资料/文档属性明确。 |
| `fanyi.baidu.com` | 百度翻译 | Baidu 体系学习例外，语言工具属性明确。 |
| `xueshu.baidu.com` | 百度学术 | Baidu 体系学习例外，学术检索属性明确。 |
| `feishu.cn` | 飞书 | ByteDance 体系学习例外，协作/文档/课堂沟通用途明确。 |
| `larksuite.com` | Lark | ByteDance 体系学习例外，协作/文档用途明确。 |
| `volcengine.com` | 火山引擎 | ByteDance 体系学习例外，云与技术平台属性明确。 |
| `aliyun.com` | 阿里云 | Alibaba 体系学习例外，云与技术平台属性明确。 |
| `dingtalk.com` | 钉钉 | Alibaba 体系学习例外，课堂/组织协作用途明确。 |
| `yuque.com` | 语雀 | Alibaba 体系学习例外，知识库/文档协作用途明确。 |

### 复合网站

#### 企业

| 域名 | 名称/说明 | 理由/倾向来源 |
|---|---|---|
| `stock.adobe.com` | Adobe Stock | 素材消费/商业入口，按复合观察，不直接计入学习。 |

#### 技术

| 域名 | 名称/说明 | 理由/倾向来源 |
|---|---|---|
| `behance.net` | Behance | 作品流和灵感浏览属性较强，按复合观察。 |
| `dribbble.com` | Dribbble | 宽松策略下作为复合/待归类入口，不直接计入学习。 |

#### 搜索门户

| 域名 | 名称/说明 | 理由/倾向来源 |
|---|---|---|
| `news.google.com` | Google News | 工具平台例外：新闻信息流，按复合观察。 |
| `shopping.google.com` | Google Shopping | 工具平台例外：购物/消费入口，按复合观察。 |
| `play.google.com` | Google Play | 工具平台例外：应用、游戏、影视、消费内容混合，按复合偏严。 |
| `bing.com` | Bing | Microsoft 体系例外：搜索门户，按复合观察。 |
| `duckduckgo.com` | DuckDuckGo | 宽松策略下作为复合/待归类入口，不直接计入学习。 |
| `baidu.com` | 百度搜索 | 宽松策略下作为复合/待归类入口，不直接计入学习。 |

#### 新闻

| 域名 | 名称/说明 | 理由/倾向来源 |
|---|---|---|
| `cnn.com` | CNN | 宽松策略下作为复合/待归类入口，不直接计入学习。 |
| `bbc.com` | BBC | 宽松策略下作为复合/待归类入口，不直接计入学习。 |
| `bbc.co.uk` | BBC UK | 宽松策略下作为复合/待归类入口，不直接计入学习。 |
| `reuters.com` | Reuters | 宽松策略下作为复合/待归类入口，不直接计入学习。 |
| `apnews.com` | AP News | 宽松策略下作为复合/待归类入口，不直接计入学习。 |
| `npr.org` | NPR | 宽松策略下作为复合/待归类入口，不直接计入学习。 |
| `nytimes.com` | New York Times | 宽松策略下作为复合/待归类入口，不直接计入学习。 |
| `washingtonpost.com` | Washington Post | 宽松策略下作为复合/待归类入口，不直接计入学习。 |
| `theguardian.com` | The Guardian | 宽松策略下作为复合/待归类入口，不直接计入学习。 |
| `thepaper.cn` | 澎湃新闻 | 宽松策略下作为复合/待归类入口，不直接计入学习。 |
| `caixin.com` | 财新 | 宽松策略下作为复合/待归类入口，不直接计入学习。 |
| `xinhuanet.com` | 新华网 | 宽松策略下作为复合/待归类入口，不直接计入学习。 |
| `people.com.cn` | 人民网 | 宽松策略下作为复合/待归类入口，不直接计入学习。 |

#### 综合门户

| 域名 | 名称/说明 | 理由/倾向来源 |
|---|---|---|
| `wikipedia.org` | Wikipedia | 宽松策略下作为复合/待归类入口，不直接计入学习。 |
| `wikimedia.org` | Wikimedia | 宽松策略下作为复合/待归类入口，不直接计入学习。 |
| `reddit.com` | Reddit | 已确认：继续作为复合例外，进入待归类时间。 |
| `yahoo.com` | Yahoo 主域 | 宽松策略下作为复合/待归类入口，不直接计入学习。 |
| `msn.com` | MSN 主域 | 宽松策略下作为复合/待归类入口，不直接计入学习。 |
| `sina.com.cn` | 新浪主域 | 宽松策略下作为复合/待归类入口，不直接计入学习。 |
| `sohu.com` | 搜狐主域 | 宽松策略下作为复合/待归类入口，不直接计入学习。 |
| `qq.com` | 腾讯网主域 | 消费娱乐门户体系默认复合；学习子站单独提升。 |
| `tencent.com` | Tencent 主域 | 消费娱乐门户体系默认复合；学习子站单独提升。 |
| `163.com` | 网易主域 | 消费娱乐门户体系默认复合；学习/音乐子站单独提升。 |
| `mail.qq.com` | QQ Mail | 门户体系内通信入口，按复合管理。 |
| `mail.163.com` | 163 Mail | 门户体系内通信入口，按复合管理。 |
| `pan.baidu.com` | 百度网盘 | 文件/资料与消费内容混合，按复合观察。 |
| `map.baidu.com` | 百度地图 | 工具属性存在但用途混合，按复合观察。 |
| `toutiao.com` | 今日头条 | 推荐信息流门户，按复合偏严；不默认学习。 |
| `dongchedi.com` | 懂车帝 | 消费/资讯门户，按复合管理。 |
| `alibaba.com` | Alibaba | 电商/商业入口，按复合管理。 |
| `1688.com` | 1688 | 电商/商业入口，按复合管理。 |
| `taobao.com` | 淘宝 | Alibaba 电商/消费入口，按复合管理，不默认学习。 |
| `tmall.com` | 天猫 | Alibaba 电商/消费入口，按复合管理，不默认学习。 |
| `aliexpress.com` | AliExpress | Alibaba 电商/消费入口，按复合管理，不默认学习。 |
| `medium.com` | Medium | 宽松策略下作为复合/待归类入口，不直接计入学习。 |
| `substack.com` | Substack | 宽松策略下作为复合/待归类入口，不直接计入学习。 |


#### 论坛

| 域名 | 名称/说明 | 理由/倾向来源 |
|---|---|---|
| `quora.com` | Quora | 已确认：问答资料属性存在，宽松策略下归复合。 |
| `zhihu.com` | 知乎 | 已确认：问答资料属性存在，宽松策略下归复合。 |
| `pinterest.com` | Pinterest | 已确认：资料搜集/设计参考属性较强，归复合。 |

#### 视频/直播

| 域名 | 名称/说明 | 理由/倾向来源 |
|---|---|---|
| `vimeo.com` | Vimeo | 已确认：工作/创作属性更重，归复合。 |

### 受限娱乐网站

#### 娱乐

| 域名 | 名称/说明 | 理由/倾向来源 |
|---|---|---|
| `cg.163.com` | cg.163.com | 已确认：门户下游戏相关子站严格受限。 |
| `qzone.qq.com` | QQ 空间 | 社交/娱乐信息流属性强，归受限娱乐。 |
| `comic.qq.com` | 腾讯动漫 | 门户动漫/娱乐子站，归受限娱乐。 |
| `haokan.baidu.com` | 好看视频 | 百度视频娱乐子站，归受限娱乐。 |
| `ixigua.com` | 西瓜视频 | 字节系视频娱乐入口，归受限娱乐。 |

#### 游戏

| 域名 | 名称/说明 | 理由/倾向来源 |
|---|---|---|
| `roblox.com` | Roblox | 偏游戏从严；学习模式不默认放行。 |
| `steampowered.com` | Steam | 偏游戏从严；学习模式不默认放行。 |
| `steamcommunity.com` | Steam Community | 偏游戏从严；学习模式不默认放行。 |
| `epicgames.com` | Epic Games | 偏游戏从严；学习模式不默认放行。 |
| `minecraft.net` | Minecraft | 偏游戏从严；学习模式不默认放行。 |
| `fortnite.com` | Fortnite | 偏游戏从严；学习模式不默认放行。 |
| `battle.net` | Battle.net | 偏游戏从严；学习模式不默认放行。 |
| `blizzard.com` | Blizzard | 偏游戏从严；学习模式不默认放行。 |
| `ea.com` | Electronic Arts | 偏游戏从严；学习模式不默认放行。 |
| `riotgames.com` | Riot Games | 偏游戏从严；学习模式不默认放行。 |
| `xbox.com` | Xbox | 偏游戏从严；学习模式不默认放行。 |
| `playstation.com` | PlayStation | 偏游戏从严；学习模式不默认放行。 |
| `nintendo.com` | Nintendo | 偏游戏从严；学习模式不默认放行。 |
| `poki.com` | Poki | 偏游戏从严；学习模式不默认放行。 |
| `crazygames.com` | CrazyGames | 偏游戏从严；学习模式不默认放行。 |
| `miniclip.com` | Miniclip | 偏游戏从严；学习模式不默认放行。 |
| `armorgames.com` | Armor Games | 偏游戏从严；学习模式不默认放行。 |
| `kongregate.com` | Kongregate | 偏游戏从严；学习模式不默认放行。 |
| `itch.io` | itch.io | 已确认：偏游戏从严，归受限娱乐。 |
| `chess.com` | Chess.com | 已确认：益智属性存在，但偏游戏从严，归受限娱乐。 |
| `lichess.org` | Lichess | 已确认：益智属性存在，但偏游戏从严，归受限娱乐。 |
| `game.163.com` | 网易游戏 | 门户下游戏相关子站严格受限。 |
| `games.qq.com` | 腾讯游戏 | 门户下游戏相关子站严格受限。 |
| `youxi.baidu.com` | 百度游戏 | 门户下游戏相关子站严格受限。 |
| `games.sina.com.cn` | 新浪游戏 | 门户下游戏相关子站严格受限。 |
| `game.sohu.com` | 搜狐游戏 | 门户下游戏相关子站严格受限。 |

#### 购物

| 域名 | 名称/说明 | 理由/倾向来源 |
|---|---|---|
| `amazon.com` | Amazon | 消费购物入口；学习模式不默认放行。 |
| `jd.com` | 京东 | 消费购物入口；学习模式不默认放行。 |
| `pinduoduo.com` | 拼多多 | 消费购物入口；学习模式不默认放行。 |
| `ebay.com` | eBay | 消费购物入口；学习模式不默认放行。 |

#### 论坛

| 域名 | 名称/说明 | 理由/倾向来源 |
|---|---|---|
| `discord.com` | Discord | 社区/论坛属性重；学习用途需家长单独批准。 |
| `twitter.com` | Twitter | 社区/论坛属性重；学习用途需家长单独批准。 |
| `tumblr.com` | Tumblr | 社区/论坛属性重；学习用途需家长单独批准。 |
| `tieba.baidu.com` | Baidu Tieba | 社区/论坛属性重；学习用途需家长单独批准。 |
| `hupu.com` | Hupu | 社区/论坛属性重；学习用途需家长单独批准。 |
| `nga.cn` | NGA | 社区/论坛属性重；学习用途需家长单独批准。 |
| `v2ex.com` | V2EX | 已确认：社区属性太重，归受限娱乐。 |
| `gcores.com` | Gcores | 社区/论坛属性重；学习用途需家长单独批准。 |
| `douban.com` | Douban | 已确认：社区属性太重，归受限娱乐。 |

#### 社交网络

| 域名 | 名称/说明 | 理由/倾向来源 |
|---|---|---|
| `instagram.com` | Instagram | 社交/信息流属性强；学习模式不默认放行。 |
| `facebook.com` | Facebook | 社交/信息流属性强；学习模式不默认放行。 |
| `x.com` | X | 社交/信息流属性强；学习模式不默认放行。 |
| `snapchat.com` | Snapchat | 社交/信息流属性强；学习模式不默认放行。 |
| `threads.net` | Threads | 社交/信息流属性强；学习模式不默认放行。 |

#### 视频/直播

| 域名 | 名称/说明 | 理由/倾向来源 |
|---|---|---|
| `bilibili.com` | Bilibili | 视频/直播娱乐属性强；学习模式不默认放行。 |
| `netflix.com` | Netflix | 视频/直播娱乐属性强；学习模式不默认放行。 |
| `disneyplus.com` | Disney+ | 视频/直播娱乐属性强；学习模式不默认放行。 |
| `hulu.com` | Hulu | 视频/直播娱乐属性强；学习模式不默认放行。 |
| `twitch.tv` | Twitch | 视频/直播娱乐属性强；学习模式不默认放行。 |
| `huya.com` | 虎牙直播 | 直播/游戏直播平台，娱乐属性强，学习模式不默认放行。 |
| `douyu.com` | 斗鱼直播 | 直播/游戏直播平台，娱乐属性强，学习模式不默认放行。 |
| `cc.163.com` | 网易 CC 直播 | 门户下直播/游戏直播子站，严格受限。 |
| `live.bilibili.com` | Bilibili 直播 | 父域 `bilibili.com` 已受限；子域显式列出便于审核。 |
| `yy.com` | YY | 直播/语音娱乐社区属性强，归受限娱乐。 |
| `zhanqi.tv` | 战旗直播 | 游戏/娱乐直播平台，归受限娱乐。 |
| `nimo.tv` | Nimo TV | 游戏/娱乐直播平台，归受限娱乐。 |
| `kick.com` | Kick | 泛娱乐直播平台，归受限娱乐。 |
| `iqiyi.com` | iQIYI | 视频/直播娱乐属性强；学习模式不默认放行。 |
| `primevideo.com` | Prime Video | 视频/直播娱乐属性强；学习模式不默认放行。 |
| `dailymotion.com` | Dailymotion | 视频/直播娱乐属性强；学习模式不默认放行。 |
| `youku.com` | Youku | 视频/直播娱乐属性强；学习模式不默认放行。 |
| `v.qq.com` | Tencent Video | 门户视频子站，明确视频娱乐入口，严格受限。 |
| `mgtv.com` | Mango TV | 视频/直播娱乐属性强；学习模式不默认放行。 |
| `tudou.com` | Tudou | 视频/直播娱乐属性强；学习模式不默认放行。 |
| `nicovideo.jp` | Niconico | 视频/直播娱乐属性强；学习模式不默认放行。 |
| `youtube.com` | YouTube | 根域受限；具体视频/播放列表/频道走特殊对象规则。 |

#### 娱乐门户

| 域名 | 名称/说明 | 理由/倾向来源 |
|---|---|---|
| `tmz.com` | TMZ | 娱乐内容入口；学习模式不默认放行。 |
| `eonline.com` | E! Online | 娱乐内容入口；学习模式不默认放行。 |
| `people.com` | People | 娱乐内容入口；学习模式不默认放行。 |
| `ew.com` | Entertainment Weekly | 娱乐内容入口；学习模式不默认放行。 |
| `fandom.com` | Fandom | 娱乐内容入口；学习模式不默认放行。 |
| `imdb.com` | IMDb | 娱乐内容入口；学习模式不默认放行。 |
| `rottentomatoes.com` | Rotten Tomatoes | 娱乐内容入口；学习模式不默认放行。 |
| `movie.douban.com` | Douban Movie | 娱乐内容入口；学习模式不默认放行。 |
| `ent.sina.com.cn` | Sina Entertainment | 门户娱乐频道，严格受限。 |
| `ent.qq.com` | Tencent Entertainment | 门户娱乐频道，严格受限。 |
| `ent.163.com` | NetEase Entertainment | 门户娱乐频道，严格受限。 |
| `yule.sohu.com` | Sohu Entertainment | 门户娱乐频道，严格受限。 |

### 黑名单网站

#### 社交网络

| 域名 | 名称/说明 | 理由/倾向来源 |
|---|---|---|
| `douyin.com` | Douyin | 短视频强沉迷，当前黑名单。 |
| `tiktok.com` | TikTok | 短视频强沉迷，当前黑名单。 |

#### 视频/直播

| 域名 | 名称/说明 | 理由/倾向来源 |
|---|---|---|
| `kuaishou.com` | Kuaishou | 已确认：短视频一律黑名单。 |
| `kwai.com` | Kwai | 短视频同类平台，按短视频一律黑名单处理。 |

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
- 新闻 / 综合门户；
- Wiki / 百科；
- 问答 / 讨论；
- 购物 / 消费入口；
- 工具平台中的新闻、购物、应用商店等降级例外。

复合网站不是学习网站。音乐/音频平台当前从宽归学习；`youtube.com` 根域归受限娱乐，具体视频、播放列表、频道走特殊对象规则。`163.com`、`sohu.com`、`sina.com.cn`、`msn.com`、`yahoo.com`、`qq.com` 等综合门户默认不进入学习网站清单；在当前宽松口径下可作为复合网站或受限娱乐观察入口，具体按第 8 节维护清单执行。

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

### 10.4 清单维护位置

复合网站完整清单统一维护在第 8 节“系统网站配置维护清单”。本节只保留产品定义和行为语义，避免同一清单在多个位置分叉。

特殊网站基线：`youtube.com` 是系统受限娱乐网站；YouTube 视频、播放列表、频道通过 `siteClassificationRulesV1` 保存为特殊对象规则。频道规则可覆盖该频道下视频，但依赖页面上下文识别。`music.youtube.com` 按音乐/音频从宽归学习网站。

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
- 后续访问属于休息性质内容，受休息配额和休息时段限制；
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

### 12.4 清单维护位置

受限娱乐网站完整清单统一维护在第 8 节“系统网站配置维护清单”。本节只保留受限娱乐的定义、行为和维护原则，避免同一清单在多个位置分叉。


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
| 自由时间 | 自动创建/复用访问记录，进入待归类时间；待归类配额耗尽时可借用休息配额，但使用性质仍显示为待归类 |
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

### 14.4 清单维护位置

黑名单网站完整清单统一维护在第 8 节“系统网站配置维护清单”。当前倾向是短视频强沉迷平台一律黑名单；成人、赌博、代理绕过等高风险类别后续可单独扩展。

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

短视频站一律进入黑名单；强娱乐视频、影视、直播平台进入受限娱乐网站，不进入学习网站或复合网站。

黑名单示例：

```text
douyin.com
tiktok.com
kuaishou.com
kwai.com
```

受限娱乐示例：

```text
bilibili.com
twitch.tv
netflix.com
disneyplus.com
hulu.com
primevideo.com
```

处理差异：

- `douyin.com` / `tiktok.com` / `kuaishou.com` / `kwai.com`：短视频强沉迷，黑名单；
- `bilibili.com`：受限娱乐网站；
- `netflix.com` / `twitch.tv` / `primevideo.com`：受限娱乐网站；
- `youtube.com` 根域：受限娱乐网站；具体视频、播放列表、频道走特殊对象规则。
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

---

## 22. 未归类网站 15 分钟邮件归类

- `target_stats_v1` 是每日使用证据，不是审批状态或最终分类事实。
- 同一 profile、自然日和 canonical 主站 identity 下，所有设备的 `unclassified` / `pending_composite` 秒数达到 900 秒时，云端确保一条 `auto_unclassified_access` 网站归类记录，并创建每日唯一的邮件通知。
- `example.com`、`www.example.com`、`m.example.com` 在此规则中视为同一主站；真正独立服务子域保持独立。
- 发送前必须按当前 effective 配置复核。已经归为学习、复合、受限娱乐或黑名单的网站不再触发。
- 邮件回复只能处理对应的 pending 审核记录，不能直接改统计表，也不能绕过父域保护、特殊网站或跨分类冲突校验。
- 同一网站同一天最多发送一次；仍未处理时，下一自然日再次达到阈值可以再次通知。统计日在结束后 24 小时内允许补发，restore/import 历史数据不触发。
- 固定回复命令为：`学习`、`复合`、`受限娱乐`、`黑名单`、`暂不处理`。命令成功后，最终分类仍由 profile 配置表达。
