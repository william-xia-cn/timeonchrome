# App Runtime 技术设计

## D-114：共享访问契约与电脑展示（1.21.0 本地草稿）

`shared-access.ts` 规范 Guardian 唯一 Child 公共配置、网页／应用各自的已结算配额贡献、共享状态与提醒结果；来源按 `(source,sourceKey,date,revision)` 版本替换，不按重传次数累加。网页贡献沿用其有效配额桶整数秒和既有借用结果；应用贡献以毫秒报告原分类（复合／未归类尚未借用），明确排除可信 Chrome 与 `other`，再由共享层按现有复合余额借用娱乐。缺任一来源、版本冲突或 Chrome 扣除无证据时不得标记完整。新增的 Guardian `GET /profiles/:id/shared-access/v1` 仅对所属家长返回现有 Profile 配置的只读 `legacy` 投影，既不新建可写配置源，也不启用共享执行。

机器心跳只有声明 `application-other-v1` 后，机器策略才下发 `other` 分类；未声明的旧终端收到 `unclassified` 兼容投影，云端家长配置和历史事实不改写。能力变化须改变策略 ETag，避免缓存旧投影；策略 ACK 不代表共享配额或提醒能力完成验收。

现有 `runtime_app_classification_history_v1` 的 SQLite `CHECK` 固定旧五类，不能直接插入 `other`；错误也不能被当成 ETag 冲突。迁移 `0014` 仅新增 `runtime_app_classification_history_other_v1` 保存明确的 `other` 历史，不重建或改写原表。写入按分类分流；查询按同一 Child、技术身份和策略版本从两表取最新行；Child 删除同时清理新表。迁移先本地验证，生产执行须与兼容 Worker 发布单独过闸。

Native 对照指出 `chromeExcludedMs` 是 Chrome 自身被排除的区间并集，不能充当电脑总量中实际被应用总量包含的边际扣除。下一契约增量定义独立 `chromeIncludedInApplicationMs`，与应用日统计、分类更正、产品关联及截止版本绑定：`Union(all applications) - Union(non-Chrome applications)`；来源不完整时为 `null`。Runtime 机器鉴权接收时从本机账户 assignment 推导 Child 和不透明来源键，拒绝请求指定他人的 Child；持久化后通过受限 Worker binding 向 Guardian 只读提供最新替换快照。当前 1.21.0 仅有类型与本地影子计算，没有上述上传/读取闭环，不能用于生产电脑总量或共享执行验收。

接收请求用 `ApplicationSharedQuotaUploadV1`：机器令牌确定 machine，body 仅含不透明 `localUserId`、`assignmentVersion`、该范围单调增加的 `revisionOrdinal` 及应用贡献；Child 和 `sourceKey` 由服务端受保护 assignment 推导。相同 ordinal/内容为幂等重放，低版本或同版本不同内容拒绝；仅写入 receipt 不等于来源事实校验或共享状态发布。绝不因缺失云端校验用旧区间近似值补全扣除量。

首个云端接收步骤使用 `POST /v2/machines/shared-quota/application-contributions`：严格校验字段、北京时间日期、整数毫秒、完整性理由及来源版本，确认当前受保护 assignment 后，将机器／本机账户／assignment／日期范围的最新 ordinal 和内容哈希原子保存于 additive `0015`。同 ordinal 同内容返回幂等 receipt；低 ordinal 或冲突内容返回 409。receipt 始终标记 `published=false`，只供终端确认持久接收；后续须与已发布的应用统计、关联及分类版本核对，才可生成 Child 共享余额或电脑展示。此接收能力不随策略 ACK 宣称执行完成。

来源核对固定 `statisticsRevision = D-113 UsageAccountManifest.manifestHash`；同时比对同一机器／账户／assignment／日期已发布 manifest 的 `associationVersion`、`correctionVersion` 与 `settledThroughMs`。不同来源范围、未发布 manifest、版本不一致或不完整统计均不得用于共享状态。该核对只给出稳定原因码，不重算 Native 统计，也不能单独证明 Guardian 公共配置版本一致；后者通过后续独立的配置版本校验完成。

接收后的只读来源审查还以已发布清单的日总行作为上界，逐项约束应用分类、桶及 Chrome 扣除值，防止明显伪造或维度错误；分类可能重叠，不把分类求和与总量强行设为相等。通过此审查只表示“来源引用和基本量纲核对”，不表示 Chrome 边际值可从分类明细独立复算，更不表示共享状态可发布。该检查不得放进机器 POST 热路径。

产品关联投影新增云端权威的可选 `isChromeContainer`：仅审核的 Chrome productId、可信身份依据且已确认/关联状态为 true，并纳入投影版本哈希。旧投影无此字段视为未知，不按显示名称识别 Chrome；终端据此输出 Chrome 扣除，无法证明时将边际值标为 `null`。

电脑展示继续独立于配额：同范围 `webMs + applicationMs - chromeIncludedMs`，其中 Chrome 扣除是应用总量减去非 Chrome 区间并集后的边际值。来源异常保留有效独立分量；历史区间不足不得填平。新增 `other` 只影响后续经能力门控的分类和展示，不追溯原应用账。旧 1.20.0 实机契约与当前已安装终端不因此自动改变；新能力需端到端兼容与启用验收。

## D-113：应用补齐与网页同构的持久化统计链路（本地实现，未发布）

首批具体协议（本地候选，未发布）：`POST /v2/machines/application-accounts/manifests` 接收 `{localUserId, assignmentVersion, manifest}`；`PUT .../manifests/{id}/chunks/{index}` 接收 `{rows, chunkHash}`；`POST .../manifests/{id}/commit` 校验全部分块、统计摘要与维度一致性；`GET .../manifests/{id}/status` 只返回版本、摘要和接收／发布状态。Child 和 account 由已认证机器及服务端历史 assignment 决定，body 中的 Child／machine／account 字段拒绝。首批没有公开发布命令，没有产品 head 或现有查询切换；commit 返回 `received_not_published`，源管理版本核验与 Native 对照未完成时不能升格为发布成功。

共同行模型区分 total／category／subject，每类又区分日与小时；应用保持毫秒并集，类别／应用明细总和可超过总量，但各自日／小时须一致。`usage-account` 的清单和分块均采用严格字段及确定性 SHA-256；每块最多 100 行、单日最多 10,000 行，行总数不能默默截断。0013 仅增加 immutable manifests/chunks 和接收水位，没有原账 UPDATE／DELETE，也不沿用旧按条相加 hourly 表作为新主统计。

1.20.0 本地候选的算法细节：对象 key 按 UTF-16 ordinal 排序，无空白，UTF-8 编码，字符串遵循 JSON.stringify 的转义规则；中文和 `<>&` 不因平台默认 HTML 转义而改变 hash。行按完整 canonical JSON ordinal 排序，每个日／小时维度只能有一行；total 必须有日行和 24 个小时行，包括真实零值。同维度小时合计等于日值，每小时的单应用／单分类不能超过同小时总量；不同维度不相加。应用 category 使用 study／composite／restrictedEntertainment／unclassified／blocked／historicalUnknown。分块 hash 对行数组计算，rowsHash 对完整排序数组计算，manifestHash 对排除自身 hash 的清单计算。rawFactHash 暂为源水位摘要，不是服务端已证实原账一致的声明；其跨端事实规范及管理版本验证完成后才能发布。

revision 的范围为机器＋本机账户＋assignmentVersion＋北京时间日期。换孩子的当天不得把两孩子事实混在同一清单；后续 Native 按该范围投影已有事实。generation/cutoff 来自统计发布版本，不拿 HTTP 请求时间代替；未完整快照带原因码，零值不代表完整。首批仅校验策略版本存在性，不校验分类内容正确性，也不声称关联／更正版本已批准；所有快照 published=false，原目录和配额仍使用原模型。状态查询提供已接收块索引；chunk ACK 不等于清单完整接收，清单接收 ACK 不等于业务发布。

Native 首次核对的兼容裁决（不改旧统计）：缺失事实 policyVersion 使用 `POLICY_HISTORY_MISSING`；`policyVersions` 只列可证明的版本，不能拿当前版本或 0 伪装历史版本。0 仅表示有依据的无策略。缺失 assignment 使用 `ASSIGNMENT_HISTORY_MISSING`，未知归属事实不得放入任一孩子清单；本机用户原有独立统计仍保留此部分，云端已知 assignment 的部分结果注明缺口。上述部分清单允许完整接收，但仍 complete=false／published=false。旧 v1 或缺分类快照的 unknown 在新传输分类字段映射为 historicalUnknown，明确 Unclassified 映射为 unclassified，只改 adapter 标签，不改变原算法、总量或历史记录。

完整性是“选定已持久化来源／范围／截止的统计是否读取与投影完整”，不是保证 Service／Agent 从零点起全天在线，也不新增原账采集覆盖要求。已知来源与范围、稳定源快照成功读取且无截断／解析／归属缺口时，零条已结算事实可以得到真实的已结算零；明确尚未建立来源、历史覆盖未知、读取失败或范围超限不能假零，使用 `SOURCE_COVERAGE_UNKNOWN` 等原因。不要将新快照的 provenance 诊断直接覆盖旧 Reader／Manager 的 Complete 字段，改变原独立统计行为。subject 标签长度128的限制仅作用于传输行规范化，原应用名称／Manager展示不改。

第一版原始来源摘要为本地水位，不承诺与服务端存储 bytes 相同：rawFactHash 对 canonical 对象 `{schemaVersion:1,date,assignmentVersion,facts,anchors}` 求 SHA-256；facts 为本次投影实际读取的去重来源行 `{kind,id,payloadHash}`，kind 区分 legacy/accounting，payloadHash 为原始已持久化 payload 的 UTF-8 bytes 摘要；按 kind、id 的 ordinal 顺序排列。anchors 为投影实际依赖的持久化 epoch／时间锚点 `{id,payloadHash}`，同法按 id 排序，不依赖锚点时为空数组。rawFactCount 只计 facts，不计 anchors；有重复冲突、不稳定源集合或缺失锚点时不能声明 complete。私密 payload／id 不上传，只上传最终 hash 和计数。归属未知事实保留独立本机分区；清单 digest 不把其偷偷算入已知 assignment。管理关联／更正通过单独版本字段表达，改变管理版本仍需新 revision，不伪装原事实变化。算法版本先以 Native 现有投影及固定截止对照证明后确定；摘要不能替代后续云端原账／管理版本内容校验。

实际来源编码补充：v2 原 `payload_json` 的 UTF-8 bytes 直接求 payloadHash；所需 epoch anchor 采用实际被读取的源行 id/payloadHash。v1 无原 payload_json，固定以已持久化列 `{localUserId,id,assignmentVersion,runtimeSessionId,platform,runtimeIdentity,displayName,startAtMs,endAtMs,durationMs,endReason,contentHash}` canonical 序列化后求 payloadHash；缺失 assignmentVersion 为 null，不用当前分配补值，其他列保留原值，不规范化名称、不重算原 contentHash。kind=legacy 明确区分此列编码；它是确定性兼容编码，不单独造成不完整，也不伪称原始 JSON。真实字段缺失／解析或归属问题分别给出原因。此摘要规范只用于派生版本，不写入旧表、不改变原上传 hash。

共同模型单一来源为根 `docs/STATS_STORAGE_FOUNDATION.md` 的“2026-10-01 跨来源统一统计结构”；本节只维护 Runtime 对应关系，不复制网页落账规则。应用统计已存在，但当前读取时聚合＋缓存并不等于持久化统计完成。云端缓存已上线的证据不受本设计影响，也不能充当新结构验收。

| 实施位置／所属 | 调整内容 | 保留边界 |
|---|---|---|
| TimeOnChrome contracts／架构线 | 共同快照语义、能力、received/published、版本替换、黄金向量及 N/N-1 兼容 | 不改网页接口及已发布版本，不预占未核验包版本 |
| TimeWhereNative Service／Native 线 | 原账事务中的派生 dirty、持久化日／小时／产品／分类、恢复与发布、独立统计 outbox | 原 Segment、clock epoch、计时边界、主／媒体区分及既有精度不变 |
| Native ApplicationUsageReader／Native 线 | 读取已发布日统计及固定版本排行；周读取一致日版本，不再在普通查询重建整周 | 当前已验证用户隔离、分页及既有快照接口保持兼容 |
| Runtime backend／标准云端线 | 设备统计接收／校验／完整发布、Child 日／周归集、来源版本及必要旧数据兼容 | 不信任客户端 Child 或分类；原账接收、已批准更正与配额语义不变 |
| Runtime queryAppUsage 及共同入口／标准云端线 | 切换到已发布统计读取；原读取用于受控对照、兼容构建和诊断，不常驻页面重算 | 原响应保留兼容，网页与应用仍独立；不增加共享扣费 |
| 页面／所属云端或控件线 | 继续读取权威快照，按需展示真实版本／截至时间／陈旧状态 | 四视图、Chrome 特殊容器、未知重叠与已确认界面范围不变 |

存储设计分为本机 SQLite 派生统计及待更新／待同步状态、Runtime D1 设备统计与孩子归集；不将应用写入 Guardian 网页表，也不新增第三个统计服务。本轮只固定逻辑对象，物理 schema、索引、限额及 additive migration 在实施 diff 中列明，不能借用待处理 migration 或承诺“无需 migration”。

新增接收协议必须具备 manifest／分块／commit／status 四种语义；现有机器认证绑定身份，复用速率与隐私边界。能力未发布或旧 Native 未声明时继续当前流程；不能拿 policy ACK 证明统计快照已发布。具体路由、错误码及包版本由契约任务在代码前落定，BrowserBridge 原应用读取能力原则上无需新增，只在兼容确需变化时交控件适配。

应用分类更正与产品关联进入统计版本；失效更新由受影响日期驱动，不能只刷新目录名称。应用明细与分类可能重叠，主总量保持现有并集，应用毫秒不能截断为网页整数秒。统计校验失败保留上一已发布结果并记录差异，不用服务端另算值静默覆盖。

当前配额职责核对：Windows 的 AppPolicyQuotaConfig 存在策略字段，但没有独立应用配额日／周／单产品余额读模型或执行器。ApplicationUsageReader／ApplicationAccountStore 是独立统计，SharedQuotaShadow 是网页＋应用影子，不能把二者当成独立配额执行。现行独立应用配额在云端 AppUsage 使用已批准限额计算，第二批保持其日／周／单应用读数；后续本机配额消费或执行须单独实施，本次不以统一结构名义补入新业务。

实施顺序、任务状态、最小测试及交付条件见根 TASK_BOARD 的 D-113 条目。当前不修改 Native／扩展源码，不构建安装包、不部署或应用 migration；本机与云端实现、源码整合、实机验收和生产发布分别登记。

### D-113 第二批：按日期持久化兼容读模型

云端兼容构建复用原应用聚合算法，只在后台对受影响的北京时间日期运行。持久化日结果包含原总量、小时、分类、应用、时段外摘要、辅助媒体及用于跨日计数去重的内部事实键；普通读取不扫描整周事实。同一已鉴权家庭／孩子／筛选范围具有固定 scope key，日期结果通过原始来源摘要和管理版本校验；日结果未初始化或过期时登记队列，保留已有结果并明确新鲜度，没有旧结果则返回 `APPLICATION_STATISTICS_PENDING`，不能伪造零用量。

后台重建单日之前核验行数上限，固定前后来源摘要，变化则重试而不发布混合版本；写日结果和完成队列同一事务。每次队列执行最多两日，失败保留队列及稳定错误码；计划任务处理全局队列，请求的 waitUntil 仅处理该请求的 scope，避免无关孩子积压挤占本次初始化。范围最多产生三个 scope（首尾部分日期及整日），不在请求关键路径重算。日／周读取按日结果累计，跨设备仍遵守原 scope 的会话／clock epoch 规则；分类明细不相加产生总量。配额只读取已批准的当前配置与这些同口径日用量，保留原每日、每周及单应用限额语义。原始时间线仍按原接口读取；不会用新的统计修正原账。

本地未应用的 `0013` 继续增加派生日结果／队列表，不修改已有 migration。机器快照 receipt 与业务发布仍分开：终端发布必须通过来源和管理内容校验，不能只因为 hash 完整或 policyVersion 存在就信任客户端分类。兼容读模型标明 `legacy-server`，不与同范围终端结果相加。共同入口保留统计版本、新鲜度和生成时间；电脑汇总的来源指纹同时包含持久化日水位，避免把第一次的 pending 缓存到统计已就绪之后。旧值陈旧时不将其与新时间线伪称为完整证据。验证为 Worker 日期聚合／异步构建／配额对照／失效／跨日计数／家庭隔离的聚焦测试、typecheck 和 dry-run；不部署、不执行生产 schema。

### D-113 机器统计业务发布核验

2026-10-01 实机纠错：用量完整性与产品归属完整性分离。投影中的独立精确身份可以统计，即使它尚未获批加入某个产品；只接受 `status=unresolved`、`productId=null` 且 `associationKey` 等于该对象的 `platform\nruntimeIdentity` 的自引用形式，不按名称建立别名，不将它提升为 confirmed，不改变分类。云端与 Native 使用相同不透明 subject 哈希及云端规范名称；投影缺失、关联版本不一致、冲突或未确认身份带跨身份关联键仍拒绝发布。Native 对这类独立身份保留 Attribution 原因，但不应把已经完整的统计清单改成不完整；原始缺页／时钟／政策等完整性门禁保留。旧不完整清单仍不可发布，重新生成的完整版本经逐项核验后才能发布。本轮不改变原计时、区间并集、分类、更正或配额。

兼容能力探测使用机器鉴权的 `GET /v2/machines/application-accounts/capabilities`，返回 `{protocol:'usage-account-v1',schemaVersion:1,enabled:boolean,chunkRows:100,maxRows:10000,acceptedAlgorithms:['windows-application-v1']}`。`enabled` 只有接收／发布／读模型所需表全部存在才为 true；旧 Worker 404、网络失败或 false 均保持上传关闭，不能靠安装版本或本地布尔常量猜已部署。该探测是统计 HTTP 能力，不改变 Native Host framing 或 BrowserBridge 消息；终端本地持久化读切换不必等待云端部署，但必须先通过固定截止本地 parity。此次未部署与 schema 未应用意味着实际生产仍不会启用新统计上传。

接收完成后后台发布按机器／用户／assignment／日期固定截止核验：真实 assignment 与机器仍有效、原始事实已上传、服务器历史分类和已批准更正、产品关联版本及规范名与终端行完全一致。服务器原始 payload 编码与本机不同，因此 rawFactHash 只保留为本机水位，不伪装为服务端字节证明；业务核验以有界源集合的计数、政策集合及逐维度精确对照为依据。原始尚未到达、缺失历史政策、当前关联／更正尚未同步或 Service 同口径核对不一致时，记录稳定原因，保留上一发布头，不修改 receipt 或终端数值。旧算法差异单独保存在派生日的 legacyComparison，不阻断正确 Native 统计。

2026-10-01 PO 收口修订：Windows 新持久化统计采用 Service 现有规范化区间及用户内并集，旧云端墙钟／会话分组读数仅用于兼容与差异诊断，不再要求算法相等。核对器按同一机器、用户、runtime session、clock epoch 的稳定历史锚点（有效事实按 startMonotonicTimeMs、id 排序第一条）还原区间，时长为精确 monotonicDuration；沿用 Native 的 2000ms 时钟异常边界，仅用于判断证据可还原，不是统计数值容差。日边界两侧读取相同范围的邻居事实，映射后裁剪，再应用已批准更正；total/category/subject 各自按用户内并集及相同 canonical 行排序/hash 精确核对。缺锚点、真实时钟异常、归属或管理版本缺口、逐维度差异仍拒绝发布。

稳定锚点水位查询按 lane 先物化锚点 ID，再用原始记录的完整 machine/user/id 主键连接。不得只约束 machine/id 而让相关子查询在候选原账行上反复执行；查询计划回归必须证明最终关联使用三个主键字段。这里只减少重复读取，不改变锚点选取、hash 内容、原账或统计精度。

普通读取将所选日期和现行配额周的同一筛选版本核对合为有界D1批次，每批最多七个日期／42条只读语句。每个日期仍执行原来的事实/媒体/策略/旧来源/稳定锚点/发布头查询，以相同结果数组计算原revision；日期、账户、孩子和筛选参数不共享或串用。仅减少网络往返，不缓存或跳过新鲜度检测，不改变hash模型、失效条件、统计结果或配额。部分日期范围和整日配额周分别保持原scope；超过七个范围分批，结果按原请求顺序对应。缺失或过期日期的派生队列upsert同样每批最多七项，相同source revision保持原重试状态，版本变化才重置；批次失败不继续返回成功读数，不改重建统计或原账。

最近七天已上传但未进入投影的历史技术身份只补 productId=null、associationKey=platform+'\n'+runtimeIdentity 的独立未确认条目，不进入可管理目录，不改变分类、更正或配额。投影刷新复用正常审计及机器策略版本下发，旧 receipt 不改写。已核验 Native 分区按机器／账户／assignment 累计，不跨电脑做时间并集；同一用户多个 assignment 真有交叠时保留兼容结果，不猜去重。新展示 total/category/hour/product 使用 Native 行，原配额消费的兼容分类用量独立保存在派生 JSON 中；旧接口及配额算法不变。

固定政策和来源摘要在核验前后对照，发布头与待归集范围原子写入；新 receipt 不会提前替代旧发布结果。后台排队该孩子默认日范围及已有受影响筛选范围，重启后可续建。孩子统计同范围只选 Native 或兼容来源，不能相加。Mac 新算法仍须对应实现及环境验证后放行。

## ARM-D-039：Chrome 特殊属性与云端统一展示

2026-10-01性能与范围补正：电脑使用固定为孩子/日期汇总，界面不提供电脑/账户/平台筛选；既有只读筛选协议保留兼容，独立统计不改变。应用原查询函数不改，新增鉴权后的内部版本缓存，使用已授权家庭/孩子、查询范围/筛选、涵盖所选范围和当前配额周的v1/v2账本计数/上传摘要、媒体摘要及App Policy最新版本构成不透明键。策略版本覆盖更正与产品投影；迟到上传和政策变化使旧缓存不可命中。计算期间版本变化不写缓存，异常不缓存，缓存失败回退权威读取。内部结果不超过2MB、最多保存5分钟，HTTP响应继续no-store，不向共享公开URL缓存用户数据。前端仅内存保存最多16项30秒，按完整孩子/日期/筛选请求键隔离，合并并发，刷新绕过内存；清除或过期的请求不得重新写回缓存。命中展示原读取时间，不伪装为实时数据。

收尾修订覆盖下文阻塞说明：设备对应及Mac Chrome自动规则不作为读取前提。sourceStatus、historyStatus、overlapStatus分别表示统计来源、历史尽力还原和精确去重；原complete只控制去重总量。Runtime读取旧runtime_devices/runtime_usage_segments的现有统计口径及可恢复明细，返回historyQuality=bestEffort，不将旧设备占位当成所有应用失败。来源完整性与区间守恒分开；独立原总量/分类在区间证据不足时仍保留，展示分类在未确认重叠时标明来源累计。Chrome未确认归属时展示child级网页内容，不计算容器解释量或未知余量；仅可信同电脑证据允许容器内外解释。原app usage、更正、账本和配额函数不改。

共享 Contracts `computer-usage` 定义只读来源、统一结果、完整性和版本分页。Guardian 持有唯一合并入口；Runtime 通过受限具名 Service Binding 提供已授权的应用权威用量与必要区间证据，Runtime 浏览器入口只代理同一 Guardian 结果。既有生命周期 Service Binding 不替换；新绑定是该展示的上线配置依赖，不是重新配对或迁移需求。内部证据不作为公开 HTTP 原始账本接口。

Chrome 特殊属性由可信产品／具体应用关联产生，不依赖显示名称，也不改应用策略。云端读模型验证来源原统计与证据一致后，用明确重叠调整生成展示总量；分类排除 Chrome 容器贡献，保留网页内容及其他应用贡献。原 app usage 的会话／clock epoch 统计语义不改写；如果来源合计与电脑级区间证据无法一致，报告不可用而非重算补齐。没有可信网页设备与 Runtime 电脑对应时返回 `DEVICE_MAPPING_INCOMPLETE`，Child ID、名称与时间巧合不能替代设备证明。

Windows Chrome 的受控展示身份采用经本地只读核验的公开软件签名系列：2026-10-01 核验 Google Chrome 154.0.8037.59 的 Authenticode 有效、Google LLC 证书、`chrome.exe` 原文件名及 `Google Chrome` 产品元数据。复用既有 Native 文件系列算法（已验证签名公钥摘要＋原文件名＋产品元数据，不含路径/版本），云端只接受盘点中已验证的精确 signer/file-series 组合；规则包记录版本与来源，不上传证书正文或任何家庭原始设备信息。同名、签名无效、系列不同均不命中；证书轮换需重新审核。已有家长批准的 Chrome 产品及真实强 selector 匹配可作为另一条可信依据。未上传可核验依据的旧观察继续标标准对象，不能把“规则可识别”记为实机覆盖完成。

Mac 现有证据的 `packageId` 是 `macos:package:` 加签名团队与 Bundle ID 的哈希，不是裸 `com.google.Chrome`。未核验对应签名身份哈希前不添加自动命中规则；已有批准产品必须匹配真实已验证的哈希 selector。Mac Chrome 的受控自动规则及实机覆盖仍待核验，本轮不改 Mac 采集器。

展示版本包含网页、应用、分类更正、产品关联和展示规则版本。以日期窗口和来源版本缓存，分页要求同一版本；失败源用 `null` 明示不可用，完整零用量与失败区分。媒体辅助账、原记录、原物化统计、现有配额和历史更正均不改变。本次实现不代表现有生产来源已足以精确合并，真实来源证据与上线配置另行验收。

本地实现复用 Guardian 现有 `CONFIG_CACHE` 保存按家庭／孩子／日期／来源版本隔离的短期来源缓存（60秒，单份不超过2MB），不增加 D1 表或索引。新增字段与客户端行为不得依赖缓存命中；缓存失效仍读取原权威来源。版本摘要同时覆盖盘点识别依据和产品关联；证据查询限制七天和有界记录数，超限不调用无界的原应用聚合来填补结果。

网页与应用证据分别最多10,000条，合计不超过20,000条；超限明确标记，不能把截断明细称为完整统计。应用适配同时读取 v2 机器账及遗留 v1 设备/用量；v1 按原设备／会话区间并集和既有更正读取，标记 `LEGACY_APPLICATION_BEST_EFFORT`，不作为精确重叠证明。旧来源读取失败返回单独不可用项，不清空有效 v2 数据；网页单个设备／日期失败也只影响该来源。无可信设备对应不阻塞来源用量、分类、产品及时间线，精确总量保持 null。稳定的不透明来源筛选键跨日期复用，不将一天误当成一台电脑。

首次上线具名 RPC 的依赖须单独记录：若生产还没有两端 entrypoint，先让 Runtime 导出 `RuntimeComputerUsageService`（暂不绑定新的 Guardian facade），再让 Guardian 导出 `ComputerUsageService` 并绑定 Runtime，最后补 Runtime 反向 facade 绑定与页面。已有双向 entrypoint 后不重复引导。既有 lifecycle binding、身份密钥和数据不变；dry-run 不能证明远端 entrypoint 已存在。本任务只记录依赖，不执行这套部署。

## ARM-D-038：Firefox 产品级黑名单协议边界

Application Knowledge 的 `productId` 是封锁对象，`runtimeIdentity` 只是历史和旧客户端兼容身份。服务端从已确认的身份投影与孩子产品配置生成不可变产品封锁快照，使用已批准的精确包身份、文件系列或二进制哈希；不能从显示名称、安装路径或未核实的客户端 `productId` 生成执行选择器。旧精确身份列表保持兼容。明确的产品封锁优先于该产品变体的普通分类；撤销产品封锁后原配置重新生效。

产品确认操作可显式请求 `migrateExplicitClassifications`，仅在预览无分类冲突后，将同产品的旧精确 `blocked` 选择提升为孩子产品封锁，并从**新策略快照**移去对应冗余精确黑名单。已经明确封锁的产品，其变体普通分类是解除封锁后的保留配置，不应误判为产品迁移冲突；尚未形成产品封锁的相互冲突旧配置仍须人工裁决。其他变体普通明确分类保留以供解除产品封锁后恢复；旧策略版本、分类操作历史、原始 Segment 与时长均不改写。未明确请求迁移时不删除任何精确身份配置。

可选强化规则按产品显式启用；新增审核线索必须先在该家庭已确认产品的真实安装/运行观察中出现，要求有效签名的审核公钥摘要与独立的精确 PE 产品线索同时匹配。已经审核并写入上一知识版本的线索不因盘点暂时缺席而失效，家长仍可关闭强化封锁或解除封锁；修改线索则重新审核。无签名且无其他两项独立审核线索时不终止。运行端须验证当前受保护用户会话、非关键进程、文件未在检查期间变化和无冲突的产品归属。疑似命中只影响本次执行，不写入产品关联或账本。Service 原子缓存策略，离线沿用最近成功版本；策略 ACK 与 Session Agent 的产品封锁能力/执行结果必须分开展示。新增字段可选，旧 Native 只按原精确身份执行，并在管理页面标注产品级封锁未覆盖。

机器 `POST /v2/machines/heartbeat` 可选声明 `capabilities: ['product-block-v1']`；旧机器缺省为空。为使设备页准确显示最后一次机器实际声明的能力，additive `0012_runtime_machine_capabilities.sql` 在机器表增加 `capabilities_json`；仅服务端认可的能力标识进入读模型，不凭 Service 版本或策略 ACK 猜测。该迁移是新增能力状态的真实依赖，生产须单独完成迁移后才能部署依赖此列的 Worker；既有 `0011` 不随本功能顺带执行。

单份 `productBlockPolicy` 按 `JSON.stringify` 的 UTF-8 字节数上限为 64,000；Worker 超限返回 `413 PRODUCT_BLOCK_POLICY_LIMIT`，不写入知识与新策略，Native 超限拒绝并保留 LKG。精确身份、已核实系列和可选双线索均受同一个容量界限约束，不能在传输时截断规则。

## ARM-D-037：可恢复的首次机器配对

`POST /v2/machines/enroll` 保留旧 `{code,platform,displayName?}` 请求：服务端生成机器 token，首次 `201`，配对码不可重试。新增可选 `clientMachineToken`，其格式为 `rt_machine_token_` 加 32 个 CSPRNG 字节的无填充 base64url（43 字符）；Native 必须在第一次网络请求前将其写入受保护持久存储，写入失败禁止请求。首次成功仍返回 `{machineId,machineToken,platform}` 和 `201`；同一配对码、同一 token 哈希与同一平台的重复请求返回同一机器和 `200`，不创建新机器或新策略版本。此重试在码过期后仍可进行；不同 token、不同平台、撤销机器或跨配对码复用 token 返回通用 `401 ENROLLMENT_INVALID`。客户端也可直接凭预存 token 调现有 `GET /v2/machines/self` 恢复 machineId；未得到成功证明时不得创建新配对码并将旧身份静默遗弃。

Service 仅存 SHA-256 token 哈希，不存明文或可解密副本；token 已是 256-bit 幂等证明，因此协议不另要求 operationId。首次消费继续使用同一 D1 batch 事务，条件更新、机器插入和初始策略版本顺序执行；并发败者不得写入孤立策略，成功后再按配对码与 token 哈希核对恢复。D1 batch 的原子回滚语义见 Cloudflare 官方 D1 Database API 文档。本增量不新增 migration，不修改历史机器、账本或家长归属。先部署兼容 Worker，再由 Native 对应分支接入和完成 Mac 实机复验；当前本地代码测试不代表线上或实机已完成。

## 正在实施：ARM-D-033 产品关联与固定周修复

机器 App Policy 冻结 `productIdentityProjection`（内容哈希版本、知识版本、技术身份、产品 ID、规范名称、依据及状态）。Service 只消费该投影，BrowserBridge revision 纳入投影与更正版本；用量完整性与归属同步状态分开返回。历史原始记录不变。

现有 knowledge operations 增量支持显式 `repairWeekStart=2026-09-21`，仅限本轮已批准窗口；普通操作仍使用操作发生周。该参数随不可变策略保存，预览返回实际更正窗口，跨周执行不会漂移。无冲突的旧明确分类可提升到孩子产品配置；同产品明确分类冲突必须返回预览冲突，禁止静默选取。

本轮只修复应用链路，不修改网页分类、网页落账、D1 schema、Guardian 或 R2 latest。真实机器身份、固定截止点账本摘要保存在本机脱敏验收材料，不提交家庭标识。

> 本机拆仓交接（ARM-D-031）：TimeWhereNative CI 产出带 `sourceGitSha`、contract 版本/包哈希及 MSI/Burn 文件哈希的内部候选。TimeOnChrome 的受保护工作流只接受精确成功 CI run 与受控来源仓库，经只读跨仓凭据下载并逐项校验。只有显式选择 `publish_immutable_r2` 且生产环境批准后，旧仓才用 R2 S3 条件写入（`If-None-Match: *`）上传不可变版本对象、回读校验字节，manifest 最后发布；缺少跨仓只读凭据、R2 凭据或对象已存在时 fail closed。`latest.json` 切换仍是另一个明确批准的动作，本轮不执行。

## 当前开发：ARM-D-025 系统默认分类

应用分类解析新增云端低优先级默认：精确系统应用为 `composite`，confirmed 游戏/游戏平台/游戏工具为 `restrictedEntertainment`。家长明确分类和更高优先级批准规则先执行；冲突、疑似类型、普通应用和技术记录不套用默认。目录和机器策略共用同一解析结果。

完整 inventory 同步冻结新的 `resolvedApplications` 并提升机器 desired policy version；设备收到新 ETag 后在实际应用点切段。服务端仍按上传 Segment 的历史 App Policy version 校验 classification/quota bucket，因此不重写旧事实，也不把离线旧 Segment错误归入新默认。

## 当前修复：ARM-D-024 游戏与系统应用规则补全

Runtime-owned 产品规则包 schema v3 使用现有强身份确认五个游戏组对象：EA app、XBOX 与完美世界竞技平台为 `gameLauncher`，Solitaire & Casual Games 为 `game`，Game Bar 为 `gameUtility`。三种客观类型均投影到 `catalogGroup = game`，但默认“建议归为受限娱乐”仍只面向 `game`。EA 的两个精确产品键归入同一产品；显示名称和发布者不参与确认。

wire value `systemTool` 保持兼容，用户可见名称统一为“系统应用”。反馈中心、命令面板、天气与录音机通过精确 package family 进入该组。目录顺序、折叠/惰性渲染、孩子管理分类和配额桶均不变；不重写 inventory、策略、账本或历史数据。

## 当前修复：ARM-D-021 Windows 内置系统工具规则补全

Runtime-owned 产品规则包增加六个经审核的精确 package family：`Microsoft.ScreenSketch_8wekyb3d8bbwe`、`Microsoft.YourPhone_8wekyb3d8bbwe`、`Microsoft.WindowsAlarms_8wekyb3d8bbwe`、`Microsoft.Windows.Photos_8wekyb3d8bbwe`、`Microsoft.Paint_8wekyb3d8bbwe` 和 `Microsoft.WindowsCamera_8wekyb3d8bbwe`。Worker 对 package identity 统一转小写，并用 `!` 前的 family 同时匹配产品容器和启动入口；容器继续作为技术记录，启动入口只形成一个可管理行。

该规则把截图工具、手机连接、时钟、照片、画图和相机投影为 `catalogGroup = systemTool`，不使用显示名称、路径或发布者进行推断。同名第三方程序以及资讯、Edge、Office、Teams、Xbox、Copilot、媒体播放器保持非系统工具。管理分类、配额、账本、安装状态和历史数据均不变；无需 Agent 升级、重新扫描、migration 或 Console 修改。

## 当前热修：ARM-D-020 精确分组规则与目录顺序

Runtime-owned 产品规则包以 HKLM/HKCU 两个稳定 Steam 安装产品键把 Steam 确认为 `gameLauncher`，以 `Microsoft.WindowsTerminal_8wekyb3d8bbwe` 精确包族把 Windows Terminal 投影为系统工具。Bing News 不在系统工具清单中，继续按普通内容应用投影。匹配不使用显示名称，不要求终端重新扫描。

Console 在每个孩子管理分类内依次显示默认展开的普通应用、默认展开的游戏和默认折叠的系统工具；搜索命中系统工具时自动展开。本次不新增 contract 字段、migration、Agent 或安装包，只部署 Runtime Worker 与独立 Runtime Pages。

## 当前扩展：ARM-D-018 云端目录四层分组

`GET /v2/module/app-catalog` 对 actionable 条目新增 `catalogGroup` 与 `catalogGroupReasonCode`。Worker 的固定投影顺序为技术记录、精确系统工具、confirmed 游戏/游戏平台、普通应用；Console 不再从 `applicationOrigin` 或显示名称自行决定组别。`applicationOrigin` 继续作为兼容与审计字段。

Runtime-owned 产品规则包升级为 schema v2，集中保存 confirmed 产品类型、技术组件和精确系统工具身份。获取帮助使用 `Microsoft.GetHelp_8wekyb3d8bbwe!App`，设置使用 `windows.immersivecontrolpanel_cw5n1h2txyewy!microsoft.windows.immersivecontrolpanel`；匹配大小写不敏感。游戏/游戏平台必须由可信 product selector 确认，名称建议仍留在普通应用。本轮 contracts 升级至 1.8.0，不新增 migration，不修改 Agent、策略 schema、账本或配额。

Console 在五个孩子管理分类内依次显示默认展开的普通应用、默认展开的游戏和默认折叠的系统工具；搜索命中系统工具时自动展开。技术记录继续位于系统管理且没有分类操作。部署只包含 Runtime Worker 和独立 Runtime Pages。

## 产品目录云端纠错与发行证据边界（ARM-D-017）

- MSIX package family 是技术容器；可信 AUMID 才是默认可管理的包内应用。容器进入技术记录，不进入孩子五分类目录。
- Win32 安装产品仍可作为产品锚点聚合可靠变体；无变体的安装产品仍从安装事实贡献机器/账户覆盖数。
- Worker 根据版本化系统包规则与产品知识生成系统来源、可管理性和客观类型。Agent 字段仅是事实/建议，不是最终目录权威。
- 包容器旧分类不自动继承到入口；前端显示重新确认提示。该规则只改变 read model，不重写分类、账本或配额。
- 当前真实完整发行来源为 Steam/Epic。EA/Ubisoft/GOG 由 Windows 2.4.0 新增独立来源；来源缺失、单项损坏与整体失败分别结算。

## 当前修复：Windows 2.3.1 本地盘点来源上限

Session Agent 的完整扫描固定携带 Registry、Start Menu、用户包、Steam 与 Epic 共 7 项来源结果。Service 必须在写入 inventory outbox 前接受最多 8 项固定来源，与 contracts 1.6.1 和 Worker 保持一致；该上限只是协议容量，不改变允许来源枚举、来源完成状态或缺失对账条件。

2.3.0 的本地校验仍使用 6 项上限，导致完整扫描在 named pipe 消费阶段抛出 `INVALID_INVENTORY_SCAN`，没有进入可重试 outbox。该缺陷无法通过云端规则修复；2.3.1 只调整本地容量并补固定 7 来源回归，不修改产品发现、账本、策略或上传 ACK 语义。版本必须前向递增，禁止覆盖已发布的 2.3.0 不可变产物。

## 当前扩展：ARM-D-016 自动产品类型识别

目录对象同时携带两个独立结果：Worker 权威解析的 `appType/typeStatus/typeReasonCode`，以及孩子策略解析的 `classification/quotaBucket`。Windows Agent 只上传验证过的事实，新增 `distributionKey`（如 `steam:714010`）；名称和 `declaredType` 均不构成 confirmed 类型。Application Knowledge v2 保存产品类型、发行身份 selector 和动态分类规则，同时继续读取 v1。

产品识别顺序为发行平台稳定 ID、可信 package identity、已核实产品/签名关联；Worker 不在请求路径调用第三方商店。类型规则只匹配服务端已解析的产品类型，不匹配客户端 `declaredType`。分类解析固定为孩子具体产品覆盖、精确产品、系列/开发者、产品类型、建议/未归类；`quotaBucket` 永远等于最终 classification。策略实际应用时切段并保存新快照，历史 Segment 不追溯修改。

Windows 2.3.1 独立扫描 Steam、Epic 和 Microsoft Store，并只从通用安装注册表机会性获取 EA、Ubisoft、GOG ID。Windows 2.4.0 才从后三者的发行器注册信息与自有本地清单形成独立来源，上传规范化的公开产品 ID；发行器未安装结算为成功空来源，单项损坏形成 warning，来源整体不可读才 failed。macOS 本轮只保持 contract 兼容。该 JSON 扩展复用现有证据列和版本化知识表，不新增 D1 migration。

Windows 2.4.0 完整盘点的来源集合包含旧有 Registry、Start Menu、用户包以及 `distribution-steam`、`distribution-epic`、`distribution-ea`、`distribution-ubisoft`、`distribution-gog`。Contract、Worker 和 Service 统一接受最多 16 个固定来源结果；新发行来源只对自身的缺失事实执行来源级结算，不改变旧客户端依赖五个基础安装来源完成后才清理无来源 legacy 投影的兼容门槛。

## 当前扩展：ARM-D-015 普通应用与系统应用分组

目录投影在既有 `manageability = actionable | review | hidden` 之外增加正交来源 `applicationOrigin = user | operatingSystem | unknown`。`actionable + operatingSystem` 进入系统应用组；其余 actionable 对象进入普通应用组；review/hidden 仍进入技术记录。该来源只影响展示分组，不替代孩子分类、产品类型或配额键。

contracts `1.5.0` 为 `ApplicationDiscoverySummary` 增加可选 `applicationOrigin` 与 `originEvidenceCode`，但这两个终端字段只作为 advisory evidence。Windows Agent 继续上传经过验证的 `packageId`、产品/变体关系等事实；Runtime Worker 在查询目录时用版本化精确包规则生成权威 `applicationOrigin`，不得信任客户端自报来源。名称、路径和 Microsoft 发布者不能单独命中。旧 Agent 2.2.3 已包含可信 `packageId`，因此系统应用分组不要求安装包升级。inventory 证据继续保存于现有 JSON 列，不新增 migration，也不改写历史观察。

`GET /v2/module/app-catalog` 为可管理条目返回云端解析后的来源与证据原因。首批精确 Windows 包规则覆盖 Quick Assist、Windows Notepad 和 Windows Calculator；无法命中时返回 `unknown`。Console 在每个孩子分类内分别渲染普通应用和系统应用，系统组默认折叠并在搜索命中时展开。两组使用相同分类和策略写入路径；本轮不新增应用阻止，也不修改 UsageSegment、媒体账本、配额计算或历史投影。

## 当前修复：游戏候选与 SSO 启动孩子

应用目录区分“产品类型提示”和“孩子实际分类”。`Aimlabs`、`Apex Legends` 等由受控确定名称规则命中的产品可显示 `game` 高置信候选及“建议归为受限娱乐”，但仍保持当前孩子的既有分类；只有家长明确配置或已批准自动规则才能改变分类、配额桶与后续 Segment。名称规则采用规范化后的精确产品名，不以模糊包含匹配扩大命中范围。

主控制台调用 `POST /app-runtime/sso/tickets` 时提交当前 `profileId`。Guardian 从账户自己的 Runtime Child 清单验证该 ID，合法时写入签名 ticket 的可选 `selected_child_id`；不属于账户的 ID 返回 404，缺失时保留旧行为。Runtime Worker 验证该字段必须出现在 ticket 的 `children` 中，并在兑换响应中返回可选 `selectedChildId`。Console 仅在创建新 browser session 时采用它作为初始孩子；已有 Runtime session 和页面内主动切换不被覆盖。该上下文不进入 URL、localStorage、日志或独立持久表。

以上为 contracts `1.4.0` 的向后兼容 Minor 扩展；数据库结构、browser session token 和账户授权模型不变。

## 当前修复：聚合投影不得反向提升维护产品

真实生产回读还要求把明确的中英文驱动、芯片组/Management Engine/Serial IO 组件、兼容性数据库、认证工具和构建工具名称作为保守 review 信号。名称信号只让安装产品进入只读技术记录；产品知识或家长明确配置仍可提升，且任何事实、账本或分类历史都不删除、不重写。

产品组的最终可管理性必须尊重安装产品证据：分组中出现 `TECHNICAL_PRODUCT_REVIEW` 安装产品时，关联启动入口不能把该组反向提升为 actionable；只有版本化产品知识或家长明确配置可以提升。装饰名称 family 若对应多个互不关联的可管理安装产品，则整体按歧义技术记录展示；名称只用于安全降级和聚合展示，不写入持久关联，也不自动继承分类。

v2 `ApplicationVariant` 只是启动入口、包内应用或运行身份。强 binary/package 身份可以稳定识别该变体，但不能独自证明它是产品；没有可信父产品、产品知识或家长明确配置时，独立变体保持 review。已关联可信安装产品的变体仍由产品组携带，历史使用和实现身份不丢失。

## 当前修复：生产目录的维护对象与装饰名称降噪

ARM-D-014 的生产复验表明，Windows Uninstall Registry 中部分 redistributable、runtime、maintenance service 和 installer 未设置 `SystemComponent`、`ParentKeyName` 或 `ReleaseType`，因此扫描事实只能证明“存在安装记录”，不能证明其是家长可管理应用。read model 对这类通用维护语义只降为 `review` 技术记录，不删除、不标记卸载，也不自动确认产品。

同一平台只有一个可管理安装产品时，孤立入口若与产品名仅存在版本号、架构、Preview/渠道等装饰差异，可共用“可能产品变体”投影，避免形成第二条主行。该投影不创建持久关联、不继承分类、不改写产品 ID；出现多个候选产品时继续保持歧义并进入技术记录。跨来源真正合并仍要求 `productKey`、package identity、binary hash 或人工确认等可靠依据。

## 当前修复：ARM-D-014 产品级目录与来源级盘点

Windows 目录升级为 `InstallationProduct -> ApplicationVariant -> TechnicalRecord` 三层。安装产品来自可信 Uninstall Registry/MSIX 记录；启动入口和运行身份只作为变体关联到产品。主目录以可管理产品为单位计数，套件默认一行，显式拆分的变体才单独参与孩子分类。无法确认归属的浏览器宿主/PWA、维护入口和系统组件进入技术记录。

contracts 1.3.0 的 inventory v2 分离 products/variants/sourceResults。来源状态为 complete、complete_with_warnings 或 failed；完成来源可独立将缺失对象标为 notObserved，其他来源失败不阻断。Runtime additive 0010 保存产品、变体与来源结果，不重写既有 inventory/Segment。Worker 同时接受 inventory v1/v2，catalog 保持旧字段并增加 variants 与 inventoryCoverage。Windows 客户端版本为 2.2.2。

## 当前修复：ARM-D-013

目录 read model 在原始 `runtimeIdentity` 与家长应用目录之间增加产品投影层。服务端把记录分为 `actionable`、`review` 和 `hidden`：已确认产品或具有可靠身份的主应用为 `actionable`；只有历史进程名、弱候选或证据不足的实现为 `review`；明确组件与瞬态对象为 `hidden`。主目录和分类计数只返回/使用 actionable 项，review/hidden 项通过系统管理的只读技术进程记录审计，不提供分类按钮。

产品行按 `productId + platform + classification` 聚合并携带可信 `runtimeImplementations`，保存分类时把同一选择投影到这些现有技术键，不创建虚假身份。该投影不修改 UsageSegment、app usage 统计或 quota 计算；原始账本继续作为事实源。

## 当前修复：ARM-D-012

目录降噪和盘点完整性使用 contracts 1.2.0 的可选 discovery/scan 摘要，Guardian 的现有 ^1.0.0 依赖及业务 import 不变；根 compatibility 测试同步 Minor 版本。旧客户端继续兼容。细则见 SPEC-004 技术设计 checklist；0009 仅本地生成/验证。默认目录不列已成功盘点确认缺失且无使用/配置的旧候选，不删除其原观察记录。

扫描数据每批 200，上限每用户 10,000；超过容量明确部分盘点，不推断卸载。家庭知识 read-model 暂支持 20,000 原始观察（旧 1,000 限制会使多用户正常盘点失败）；超容量明确报错，不能伪报完成。新扫描仅在结束标记生成一次策略投影，避免每个安装批次制造重复版本；运行补充及旧客户端保持即时投影。

原始清单和客户端策略容量分离：未归类解析结果不进入 resolvedApplications，继续使用既有未归类/无限额默认值。非默认有效投影超过旧客户端支持的 1,000 项时返回 APPLICATION_POLICY_CAPACITY 并保留旧策略，不静默截断或保存客户端无法解析的版本。包查询 helper 输出及 C# 重定向读取显式 UTF-8；中文测试只运行合成输出，不执行真实应用查询。

## 当前扩展：ARM-D-011 应用目录与分类规则

产品知识、孩子明确分类、固定分类规则为独立对象；安装观察和原始使用账本分开保存。工程规格见 `specs/SPEC-004-APP-RUNTIME-TECHNICAL-DESIGN.md` 的 ARM-D-011 部分。共享 contracts 1.1.0 增量兼容；本地 additive 0008 不改写历史。Console 保持独立 canonical source，不恢复主 Pages 静态副本。本阶段尚未生产发布，macOS 编译验收待实际 macOS 环境。

## 模块边界

```text
app-runtime-management/
├── contracts/   @timeonchrome/app-runtime-contracts
├── backend/     Runtime Worker、D1 migrations、R2 接口
├── console/     独立 Runtime Pages canonical source
└── docs/        Runtime 自身项目真值

TimeWhereNative/（独立私有仓库）
├── agents/      macOS / Windows、RuntimeService、TimeWhereMg、Native Host
└── installer/   Windows 安装与待发布产物
```

Runtime 模块禁止导入根目录 `workers/`、`pages/`、Extension 或 Santa 业务代码。Guardian 只允许通过 `@timeonchrome/app-runtime-contracts` 与 Runtime 协作，不得引用 Runtime backend、console 或 Agent 源码。

## 云资源所有权

| 资源 | 所属与回滚边界 |
|---|---|
| Guardian Worker/D1、主控制台 Pages | TimeOnChrome |
| Runtime Worker/D1/R2、Runtime Pages | TimeOnChrome 仓库的 Runtime 模块 |
| JWT、lifecycle、SSO/API contract | TimeOnChrome 仓库发布的固定版本包 |
| Windows/macOS Agent、TimeWhereMg、Native Host | TimeWhereNative 私有仓库 |

生产构建只能来自已合并到 `origin/master` 的干净 Git SHA。功能 worktree 只能本地验证和 Pages preview，禁止操作生产 D1、Worker、Pages 或 R2 latest。

## Browser SSO

1. 主控制台使用当前 Guardian session 调用 `POST /app-runtime/sso/tickets`。
2. Guardian 签发 60 秒、单次、`aud=app-runtime-management:sso` 的 ES256 ticket，并返回固定 Runtime origin 的 fragment launch URL。
3. Runtime Pages 读取 fragment 后立即 `history.replaceState` 清除，再调用 `POST /v2/auth/browser-sessions`。
4. Runtime Worker 原子消费 `jti`，返回 256-bit opaque token；数据库只存 SHA-256。
5. 页面只把 token 放入 `sessionStorage`，使用 `Authorization: RuntimeSession <token>`；绝对有效期 8 小时，不续期。
6. `DELETE /v2/auth/browser-sessions/current` 撤销会话。无 ticket 直接访问时只显示“从家长控制台进入”。

SSO 使用独立 ES256 key pair，不复用 Santa、Runtime machine、module JWT 或 lifecycle keys。一个发布周期内 Runtime API 同时接受旧 Guardian account module JWT 与 RuntimeSession。

## Migration 约束

- Runtime 保留 `0001–0006`，新增 `0007_runtime_browser_sessions.sql`；只允许 additive migration。
- Guardian 保留所有已在生产使用过的文件名，即使 `023–025` 与主线其他 migration 的数字前缀重叠也不得重命名。
- Guardian 远端 migration 追踪表目前为空，禁止运行自动全量 migration apply；新 migration 从 `030` 开始并需显式 schema preflight。

## 拆仓路径

目标仓库改为私有 `william-xia-cn/TimeWhereNative`，仅迁出本机 `agents/` 和 `installer/` 的相关历史。TimeOnChrome 保留 Runtime contracts、Worker、独立 Pages、D1、R2、Guardian adapter、主控制台入口和全部 Cloudflare 生产写权限；新仓锁定固定版本 contract 包并只生成经测试的 MSI/Burn/manifest。TimeOnChrome 的受保护发布流程校验来源 SHA、契约版本和哈希后，独占 R2 上传与 latest 切换。旧“整体迁出 Runtime 云端”方案由 D-104/ARM-D-031 取代。两仓必须独立构建；拆仓本身不部署、不执行 migration、不升级本机、不改写数据。

本机产物交接使用新仓成功 CI 的精确 `runId + headSha` 和只读仓库令牌。TimeOnChrome 的手工生产环境流程下载该 CI artifact，核对 manifest 的 `sourceGitSha`、contract 版本/包 SHA-256、MSI/Burn 大小与 SHA-256，确认目标 R2 版本路径不存在后写入、回读校验，manifest 最后写入。`latest.json` 只有单独勾选并获得生产环境批准后才可切换；没有只读交接令牌或任一哈希不符即停止。新仓 CI 本身没有 Cloudflare secret、R2 上传或 latest 权限。
## 应用身份关联与分类继承修复（2026-09-27）

ARM-D-032 实施 checklist（2026-09-27 PO 要求先修复）：① Contracts 增量 1.14.0，App Policy 兼容增加服务端生成的 `weekReclassification`，包含北京时间周区间和精确身份最终分类；写入不可变版本，旧版本无该字段保持旧读数。② App Policy 保存/知识与库存投影产生新版本时冻结本周更正；云端日/周/小时/分类/应用配额和账本详情按同一更正切片读取，不更新原始 Segment 或既有物化表；未归类发现/已处理记录仍保留原始证据审计，不因分类更正消失。③ 新机器鉴权 GET `/v2/machines/app-usage-corrections?after=` 以每个孩子的 policy version 游标分页（每页一个含更正的不可变版本），不使用 ROWID 或 createdAt 排序，避免删除/时钟回拨跳页；只下发该机器历史受保护用户分配涉及的孩子，附精确 assignment version；新分配时客户端重新对账，不能把旧孩子更正用于新孩子。④ Native SQLite 独立更正表+游标同事务持久化，重复幂等且冲突拒绝；策略循环即使 304 也补拉，每周期最多八页，未拉齐明确不完整，旧 Worker 404 兼容，离线使用已完整缓存的 LKG，不将网络故障伪装为零用量。⑤ Service 应用只读投影同用户/assignment/精确身份匹配更正，跨周边界切片，最后批准版本优先，更正内容进入 revision；两端 SQL 仅返回每周每个身份的最新更正，避免反复装载全部策略 JSON；原总量/monotonic 毫秒不变。⑥ 聚焦固定回归：本周/上周、改分类/撤销覆盖/重复更正、跨周、迟到上传、分类并集/配额、家庭/用户/assignment 隔离、事务与重启/游标、旧协议。只修独立应用统计，不修改网页/媒体/共享配额，不部署、安装或生产 migration；不跑无关 UI/macOS/WiX 全量。

后续产品口径更正：ARM-D-032 已确认应用分类调整应同步修正北京时间本周有效归属，保留原始 Segment/历史策略快照，不追溯上周及更早。下述 2.6.5 旧候选只有可信身份展示与前向策略继承，不能作为本周更正交付包。当前按上述 checklist 实现云端和 Service 的更正读模型，扩展不自行分类；已发布旧策略不会被 GET 自动改写，更正从新保存/知识发布/完整盘点生成的不可变版本进入通道，实际发布和安装验收另记。

Native 更正文档按 Child/policy version 保存一份 payload/hash，user/assignment 只保存绑定；两者与游标同事务提交，不为每个历史 assignment 复制整份应用清单。Reader 用 JSON 关系查询返回每周/assignment/身份的最后版本，不加载全部版本到内存。更正记录不是新用量，不进入 outbox 或用量累计。

目录显示、前向策略及本机统计必须区分叶应用关联与套件分类继承。经过验证的相同 packageId/AUMID 或非多宿主 binaryHash 可关联同一叶应用；仅名称或发布者不能关联。安装产品的明确分类可经 verified productKey/parentProductKey 向非技术变体继承；入口的明确覆盖优先，包容器分类不得扩散到不同 AUMID。关联冲突不自动选择分类。App Policy PUT 和库存/知识更新均重新生成 resolvedApplications，冻结到新版本，不改旧版本/Segment。

应用统计只对可信叶关联做展示区间并集，不将套件内 Word/Excel 因 productKey 相同合并，不改变主总量或历史分类。库存/关联变化纳入统计 revision；读取保持当前 Windows 用户隔离。旧身份没有可靠证据时保留，不能按名称填补。
# 产品关联增量发布一致性

盘点每批已验证事实与对应产品关联/有效分类在同一事务发布，不必等完整扫描才修正旧占位关联；“来源是否完整”和卸载清理仍严格等待完成回执。相同关联版本、知识和有效分类不产生新策略，避免重放盘点造成策略/更正版本抖动。目录返回已发布的关联版本，终端报告已应用版本；不得把目录自己的新猜测当作已下发关联。
