# TimeOnChrome — 技术设计文档

## D-114 可复用共享身份核验（2026-10-03）

PO批准简化为本机管理范围→缓存云端来源证明→本地同孩子核验→贡献ACK。v1连接挑战保留兼容；v2证明不含challengeId/connectionHash，绑定childScopeHash、applicationSourceKey、assignmentVersion、webSourceKey及browser bindingEpochHash，期限最多300000ms。现有专用ES256密钥复用，机器/扩展令牌不经过Host。

机器鉴权读取当前用户分配后，由现有受限内部接口签发短期machine-scope（applicationSourceKey、childScopeHash、assignmentVersion、issuedAtMs、expiresAtMs），仅作取得来源证明的范围输入，不授权贡献或执行。扩展以设备鉴权提交该签名scope；Guardian检查签名、同家庭/孩子和实时本机分配，再签发web-source证明。两种证明使用独立audience避免混用，不新增凭据系统或D1表。云端验证web-source时仍复核当前应用分配与网页绑定摘要，不能仅因签名有效接受已撤销来源。

能力shared-web-source-reusable-v2：getSharedWebSourceScope返回机器范围，bindSharedWebSourceV2建立当前连接上下文，replaceSharedWebContributionV2复用原贡献/ACK格式并取消challengeId。当前受认证用户是范围权威，不接受Host指定另一用户。已建立本地租约沿用原语义；重新连接必须以未过期证明重新验签，不能恢复过期证明或旧租约。身份变化立即撤销上下文及在途请求。通道在线、身份verified、贡献ACK分别展示。未分配/范围不匹配/过期/验签失败/云端不可用采用固定错误码。

## D-114 正常界面的只读可观测性（2026-10-03）

本地 Admin 的本地组件卡增加可展开共享同步摘要。只读扩展内部诊断请求仅接受该扩展的 Admin 页面，不发送 Native/HTTP 请求，不重算账或触发上传。显示运行版本、当前 Port 协商能力、缓存配置 revision/stage、本周逐日贡献 revision/完整性/稳定原因、历史云端 ACK、当前连接 Native 确认、失败阶段和退避，以及当前签名绑定状态枚举。未知保留 null；历史 nativeAccepted 不代表当前连接确认。

共享派生同步独立记录固定大小的诊断事件快照，最多七个日期的实际云端 ACK 时间；不保存身份、来源、签名、令牌或载荷。诊断写入使用低优先级预算接口并静默降级，不参与原账或上传事务。只在展开时读取当前内部状态；不得借诊断打开连接、协商能力、刷新策略、上传贡献或改变执行状态。UI 与敏感字段过滤专项及桌面/窄屏隔离截图为本包验证；真实缺日期根因仍待正常界面取证。本轮不构建或推广候选、不部署。

实现细化：事件缓存内部使用既有不可逆 scopeHash 及完整 policyIdentity 隔离（不进入 UI），实际 ACK 和覆盖摘要按贡献修订及内容摘要匹配。覆盖摘要仅在既有派生 build 已读统计的事件中生成，最多七天；诊断读接口不读取日统计或原分段。SW 冷启动未重新核实来源时旧缓存不作为当前确认；改绑、策略变更或贡献变版后失配缓存显示未知。错误码使用固定白名单，任意文本变为 unknown。新增的是 Admin↔SW 内部只读消息，不修改任何 HTTP/Native 契约。展开关闭、重新打开及销毁后的迟到响应均丢弃。

真实正常界面续验发现诊断不可读：现有隐私返回入口使用 `admin/admin.html?view=system-management`，诊断监听器的整串 URL 相等校验会拒绝合法 query/fragment。只改诊断授权为相同 extension scheme/host、准确 Admin pathname 和自身 sender.id，允许 query/fragment，不接受其他页面或其他扩展。界面保留白名单错误码，区分权限拒绝、旧后台不支持、消息连接失败、响应中断，以及缓存/连接状态/共享状态/格式读取失败；不显示原始异常或 URL。该错误证据不证明真实截图全部由 URL 拒绝造成，也不证明 Host 连接失败已解决。聚焦验证合法导航、伪装 origin/path、读取失败与版本混用；不构建候选、不修改 Host 或原账。

续验交接补充：摘要展示历史连接成功时间及白名单历史错误码，与当前 Port 状态分离；不能以历史成功证明当前连接正常。路由修复通过专项后，仅原地同步两份确切诊断源码到既有 1.7.41 开发候选，保留原文件备份；不重新构建，不改变版本、ID、公钥、marker，不操作原 Profile 的存储或绑定。Host 连接故障及缺日期原因仍未关闭。

真实续验 `native_invalid_response` 尚不能归因到 heartbeat：该码包含负响应、非法 receivedAt、统计修订 ACK 不匹配/陈旧，以及应用响应缺失。新增有界内存拒绝摘要，只记录固定 messageType/channel、白名单分支及发生时间；在正常管理页展示，不存原响应、requestId、身份或 proof。原校验、拒绝、断开和重试行为完全不变。Host 当前响应模型使用数字 receivedAt，统计陈旧响应允许 acceptedRevision=null、stale=true；是否真实命中仍需原实例摘要，禁止放宽 validator 猜测修复。

真实14:25:43证据已确认 `dailyUsageSnapshot/statistics` 的 `BROWSER_BRIDGE_MESSAGE_REJECTED` 负响应会被泛化为 `native_invalid_response` 并断开健康/共享通道。通信隔离补丁仅对匹配 requestId、有限数字 receivedAt、准确统计请求且明确业务拒绝码的帧返回 `native_snapshot_rejected`，不关闭 Port、不清除协商能力、不伪造 ACK；待同步日期和修订保留，下一正常健康周期重试。统计业务拒绝不推进健康失败冷却或覆盖健康成功状态。未知错误/非法帧/超时仍沿既有保守断开路径。诊断额外保留白名单 serviceErrorCode，不保存原文本。统计内容矛盾继续由 Native owner 定位；不修改原账或投影补差。

Native owner 已用正式 2.6.19 DLL 与真实扩展生成器合成复现：权威桶2秒/区间3秒，以及权威study3秒/区间rest3秒，均产生 `EVIDENCE_TOTAL_MISMATCH` 却仍携带矛盾区间，实际 validator 拒绝。经本次交接明确批准，仅派生 BrowserBridge 快照增加 TOTAL_MISMATCH 清空 intervals 的 fail-closed 边界；保留 activeSeconds、quotaBucketSeconds、complete=false、原因及待同步修订，摘要重新计算；不改网页原始账、本地统计或正式 V2 单账。合成跨语言验证不等同于现场原实例成功。

统计业务拒绝的重试至少间隔60秒，等待已有健康/生命周期触发，不新增轮询。冷却期间不进入 snapshot drain，不阻挡已排队的健康/共享请求；合法修订 ACK 后清零。持续业务拒绝保持待同步及最近拒绝摘要，不能假装健康链路故障或清空数据。

360秒差额只读分析：权威投影以 domains.activeSeconds/compactedByChannel.active 得出在线量，按 targets.activeByQuotaBucket 收集所有桶，再按现有更正移动桶；派生消费者明确读取 study/composite/rest 与 other。借用Rest已读取rest，不以内容分类重算。现场仅有 LOCAL_BUCKETS_INCOMPLETE、没有 LOCAL_STATISTICS_INCOMPLETE 时，不能直接认定360秒没有桶：未知/legacy桶，或更正将已知桶移动到未知桶，也会出现同一诊断。仅有在线量高于全部桶总量则会同时产生统计不完整。添加固定合成区分夹具，不改消费者映射；现场两天缺少可信当前覆盖摘要，具体桶差额仍为P0未解决，禁止将未识别桶猜成Rest或“其他”。

覆盖摘要读取核对：摘要先绑定 write-ahead 本地贡献修订；随后若云端 watermark 要求派生贡献使用更高 ordinal，旧摘要仍绑定原 ordinal/hash，会被诊断 UI 的严格版本校验排除。这是诊断缓存版本关联缺口，不证明权威账缺秒。仅同步该轮已冻结输入产生的覆盖摘要到最终提交贡献的 revision/hash，不重读统计、不改贡献内容/ACK/上传行为；用高水位夹具验证。冷启动、来源/策略失配、诊断低优先级写入失败仍必须显示未知，不能从云端接收时间推断覆盖已可读。

## D-114 第二批终端接线（2026-10-03，本地及隔离关页验证通过，生产执行关闭）

真实期限对齐：Guardian challenge的90秒是兑换窗口，签名proof的300秒是绑定有效期，不得要求proof到期早于challenge。只分别校验challenge当前可兑换、proof结构／签名来源／身份和当前有效期；Host负责真实验签及scope确认。固定回归使用90秒challenge与300秒proof，过期challenge不进入兑换。

旧提醒退出：进入shared消费者前暂停旧Rest提醒调用者，串行清除旧弹层／投递截止并恢复其暂停的媒体；不触发结束休息、不改模式或网页会话、不推进软限额阈值。shared退出后恢复旧提醒评估。旧Content action／restore不在shared期间继续消费，避免两套提醒同时生效。真实关页专项仅测关闭自然结算，固定隔离idle夹具不代表OS idle精度验收。

整批续接线：固定最终local-lease契约包源 `eea0143f85b9c34bed8695660ceb9306ba6782c5`，109153字节，SHA256 `83138e4e8b66cebc8331ac6b87cc4b58a2b9f1f2169c976b1eb440f8915984d7`，保留旧包证据。实际bootstrap在激活有效且managed／经身份核验的开发渠道启用准备读取与派生贡献，普通／CWS保持旧路径；消费者只在可信云端policy为shared且当前Host支持时启用，关页另需开发权限门禁。初始化异步失败不得阻塞原bootstrap。短proof仅授权新绑定与在线云请求；已被Host接受并协商 `shared-web-local-lease-v1` 的同一活Port可通过共同helper延续内存本地lease，不得持久化、断连复用或将过期proof用于云请求。身份／策略变化和Host拒绝立即撤销准备完整性；新增派生事实先走仍有效的本地lease，网络不可用不得阻止本地替换。验收固定包、能力隔离、离线与重连，不以测试开关冒充实际入口；最终候选尚不生成。

此前派生贡献专项复验：PO 已批准修正夹具后再次运行 `shared-web-contribution-sync.test.js`，限定本地测试，不变更原始记账或发布。当时契约包源 `a5597b6c84b904e79cc2371f826a87ee087b8d5a`，108218字节，SHA256 `c89294a50ea3d6425d082329d6781ecef7daa248666f72d198c9e572368b1570`；保留为历史证据，当前固定包见本节local-lease续接线。版本冲突保护不得为使夹具通过而放宽。

本次复验通过（退出码0）：固定包大小／SHA256／编译模块原字节、签名证明、队列重建、旧ACK与版本隔离、下降更正、离线退避、重启水位及网页与应用派生合并均通过。未修改生产实现或放宽契约；Matched＝批准的专项复验，Deviated／Extra＝无。该结果仅为本地夹具和消费者验证，不代表真实Native／HTTPS联调或第二批整体验收完成。

第二批连续性接线使用最终共同契约：提醒身份固定在触发摘要，短期结束许可核验最新摘要，增长许可及ACK必须携带同一 `triggerStateRevision`。仅当前Native连接声明 `shared-reminder-continuity-v1` 时接受增长分支；客户端不得上传自称连续增长的标记。Service负责完整来源、策略、修订与递增用量判定，消费者在每次请求前后核对当前摘要，并要求可见实例身份保持不变。显式隔离开关同时配置既有Native、策略、basis读取和贡献控制器；生产默认仍关闭。关页准备API也须有界，迟到attach须撤销，命令成功不充当关闭证据。专项范围为最终共同向量、真实调用者、Native回执、提醒、执行及隔离Chromium原账守恒，不扩大至生产或全量回归。

开发候选权限闸门：现有staging工具新增显式 `--shared-browser-close-development`，仅与 `--native-host-development` 的unpacked staging组合允许；临时manifest增加debugger，marker增加 `sharedBrowserCloseDevelopment:true`。未指定标记、普通／CWS或正式managed包均剥离debugger；不得生成CRX或update feed，不改正在加载的候选。真实消费者同时确认开发渠道、授权marker、manifest权限和Chrome实际授予权限，缺失时报 `shared_browser_close_permission_unavailable`，不claim、不关闭。此候选权限专项仅在临时目录验证；Native联合授权仍待验收。

后续接线清单：独立内存来源绑定读取（云签名proof对应当前Host连接）→ 同完整policy／本机web版本的Native合并准备余额读取 → quota实际调用者及mode访问窗口消费 → 可见提醒绑定执行摘要与许可消费 → 目标标签正常／强制关闭及自然事件确认 → 隔离Chromium验收。所有新增调用者由一个显式本地开关控制，默认false，云端stage shared仅是必要条件，不能自行开启。公共分类用量按共享余额计算，Online／domain继续读取原网页用量；临时运行配置只投影Guardian公共配置、不保存到storage。原始分段和上传不改。关闭成功必须观察目标onRemoved，正常取消不升级；强制仅消费Service显式force-close许可，debugger仅在隔离候选具有批准权限时可用，正式manifest不增加权限。本批最小专项覆盖实际quota调用、提醒摘要竞态、关页结果及原自然结算；真实浏览器只用全新隔离Profile和本地测试页，不操作既有候选及家庭数据。

此前准备小步只验证共同执行身份、原43执行／28生命周期／24活动向量和派生贡献，当时共享调用者及真实关页为Missing。现由下面整批结果补充，不把早期小步当整批交付，不复用旧持久性证据覆盖新关页结果。

终端工作线仅修改派生准备余额和执行许可消费者，不修改原账、云端、候选或生产开关。按顺序核对：固定第二批1.30包 → 共同执行摘要 → 当前准备余额读取 → 许可检查及claim前后复核 → 专项测试。最终固定源与包哈希见上文 `a5597b6`；中间 `d199d01` 包及第一批包保留为历史证据。整批集成使用现有云端分支最终 `778be44`，保留merge父节点，不用选择性复制替换来源。

执行身份使用契约共同函数，对完整policy身份、basis、完整projection及排序后的来源替换版本求摘要；不能只使用云端state revision。当前准备余额缺失或不完整时不可准备许可；本机贡献变化后摘要变化，旧permit不得登记或执行。连接／认证／租约代次独立校验，同摘要不延长许可期限。源码默认关闭，隔离显式开关可评估效果，绝不手工结算。既有TASK_BOARD草稿不改。

整批实现与审计：
- 来源绑定只来自当前Host challenge对应的云端签名proof，内存保存有效期；Native准备余额必须匹配完整policy、本机web版本、授权应用source和当前lease，异步前后复核一致。
- 实际quota消费者使用临时投影，不保存Guardian配置；Online／单站点仍读取网页量。ACCESS_OBSERVED使用共同准入，复合借Rest仍受Composite窗口管理，窗口边界固定北京时间；黑名单及独立对象限制优先，“其他”不扣公共分类桶。
- 可见提醒固定触发身份，协商连续性后正常增长不撤销或重新投递；短期许可、claim及效果前复核最新执行摘要，ACK完整回传触发摘要。默认关闭的集成控制器统一配置既有读取器，迟到enable不能恢复已关闭执行。
- 已确认且指纹／水位不变的派生贡献不再重复上传整周；Host重接仍重新接受贡献，不能以云端ACK替代Host状态。只改变独立派生队列，不改原始上传。
- 正常结束只走可取消的Page.close；超时结束只接受Service明确force-close许可。准备API有界，迟到attach撤销；只有目标onRemoved证明完成，beforeunload取消不升级强制，无关alert不能伪装成取消。

专项结果：共同13准入／12连续性／9增长许可向量、执行摘要、实际共享配额调用者、81项mode-service、17项原模式矩阵、Native Port／完整ACK、提醒bridge、执行claim／结果／重试、控制器开关竞态、派生队列、策略／basis读取器、媒体配额隔离均通过；typecheck、extension-root（2.16MB）、职责边界及diff检查通过。无全量测试、生产操作或候选改动。

新真实隔离证据位于临时 `toc-close-isolated-sQao6n/close-ledger-evidence.json`，不是旧 `output/playwright/d114/execution-persistence.json`。Chromium `147.0.7727.15`：正常与强制各自然结算1段，原始／日／小时均2秒；取消为0段／0秒且原页面ACTIVE，无关页存活，计时dispatch无错误。真实SW加载当前整合模块图、默认关闭检查通过；Native授权仍明确 `FIXTURE_NOT_VERIFIED`。脚本SHA256 `c54ae7c0656dedc92069c10d8370c2f245697666bcbca437d6cfc4f2a900d61c`，closer `a5858b1021ade441e1a872d53a9288a374975f54b19efbd033f068dbede8a97f`，原signal `da4feb79660579ebc5998a244684e47085261186d4c96bcf4491fc8502f4ce56`、timing-dispatcher `9606b3703170c991c3703e07341bb455dd0c76a0f306e1ba90c09fdd4df1170e`、session `5263798a0372bc07690aa4d5661875b91cdc94736f90ca5988f3876c60e24966`。测试只在隔离临时包授予debugger，不改正式manifest或现有家庭数据。

续接线结果：最终local-lease包四个编译模块原字节及7项共同lease向量通过；实际派生调用覆盖过期后同连接新增、能力缺失、换Port拒绝、重连不继承、90秒challenge／300秒proof及不变整周不重复发送。实际bootstrap按渠道／activation／Host／可信stage自动进入与退出，旧提醒清理114项专项通过。开发权限临时包矩阵、executor前置拒绝、closer目标和超时专项通过，不改加载中的候选。

最新隔离关页证据：`C:\Users\William\AppData\Local\Temp\toc-close-isolated-uGhD52\close-ledger-evidence.json`，Chromium147.0.7727.15；normal／force各1段，原始／日／小时均2秒，cancel零段且ACTIVE，无关页存活。脚本SHA256 `e2f22a7b6e327ce7596293779a12e84e0ff347127a4df38abcd98b10c57b7fc4`、closer `2413ba23f75c0732ec6308cf39aedfa9d8d128be0148109e3784f9bda0322d73`。旧sQao6n仅为旧代码证据。首次复跑因测试机器OS idle让ACTIVE夹具提前关闭；隔离测试单独设置idle检测间隔，不改产品代码，证据明确 `idleBoundary=ISOLATED_FIXTURE_NOT_VERIFIED`，不能称真实idle计时验收。

Matched＝批准的整批消费者、实际启动入口、候选权限闸门、同连接内存lease及隔离关页评估；Deviated／Extra＝无。Missing＝真实已部署HTTPS／Native Service联合授权、连续增长／更正／离线／断线实机链路和最终候选安装验收。最终wire只在Host响应声明能力，没有新增客户端capability字段；Service如何绑定终端连续性支持须由架构／Native联合验证，未协商时拒绝增长许可。不得由Host或客户端提供 `continuousUsageGrowth` 自证，不因专项通过宣称生产贯通。最终集成来源为云端整批 `b695549`，保留真实merge父节点；尚不生成候选、不发布。

## D-114 第一批派生贡献接线（2026-10-03，本地专项通过，真实联调未验收）

使用已核验的集中源码 `30d53c11c9fbc7613539b0e05d99628e9ea27187` 对应1.30.0开发契约（101100字节，SHA256 `63309999adf5115803d5eaee83852126f8d35ed390944208e1acfb07b8783c3e`），替代此前临时草包。新增独立、有界、默认关闭的网页统计贡献队列，读取已落地日统计和批准更正，不改变原始分段、聚合、既有observer或上传队列。当前周启动重建及统计变化驱动；每日期独立ordinal、内容hash、云端ACK及重试状态。旧ACK不得清理新贡献，服务器水位不能被当作V2版本；绑定或策略变化后重新捕获身份，异步旧结果不得生效。

云端令牌仅用于DeviceBearer HTTPS能力、贡献、水位和来源证明兑换，不进入Native payload。Native使用现有串行Port的当前连接challenge，云端签名proof兑换后由Host验签并绑定，再接受本机贡献替换。共享余额准备读取完整basis并按可信web scope替换；保持1.28契约原字节及`executionEnabled=false`。缺能力、证明、完整来源或版本冲突只能报告未准备，不开启限制。最小验证覆盖队列恢复、旧ACK、回退水位、身份切换、贡献守恒及令牌隔离；真实Host/HTTPS验收另列，不伪报完成。

实现：`shared-web-contribution-sync.js` 在background同步注册启动／安装、已落地统计变化及既有健康alarm兜底，默认关闭；离线先保存当前周最多七天／128KB派生队列。独立版本按真实统计／更正／完整policy摘要推进，读服务器独立水位恢复版本，重复ACK不增号，较新版本可以下降更正；逐版本ACK不清后来版本，失败冷却上限30分钟。现有Native串行Port增加三个固定方法，严格校验输入、响应、当前Port及能力；没有令牌转发，也没有来源授权由Host自报替代。Host接受和云端确认分别处理；有效的本机替换可以在云端上传ACK前进入准备投影，缺其他日替换明确不完整。准备读模型另核对最新本地统计及绑定有效期，不以旧准备余额伪报当前完整。Native可选准备字段按协商能力单独验证，不覆盖原`sharedQuota`。

验证：派生专项（固定包原字节、真实公开键P1363向量、当前周恢复、独立版本／旧ACK／下降替换、离线保存、退避、身份隔离、本地新统计使准备失效、网页10分＋应用10分＝20分）、Native Port／能力／字段和policy／HTTP专项、1.28分页回归均通过；typecheck、extension-root、app-runtime-boundaries、diff检查通过。都是本地夹具和真实消费者函数，不是生产HTTPS／真实Native验收。审计Matched＝批准第一批源码调用链；Deviated／Extra＝无；Missing＝真实设备联调、最终执行接入及启用，继续第二批实现。集中本地提交只包含此批文档／源码／测试，不建PR、不改候选、不部署；既有TASK_BOARD两行草稿原样保留。

## D-114 统一访问配置、其他时间与电脑使用汇总（2026-10-02）

### 同连接离线来源租约

`shared-web-local-lease-v1` 是显式协商的本机能力。云端ES256来源证明必须在300秒内验签并建立绑定；过期证明永远不能建立新连接、恢复重启后的授权或访问云端。验证成功后Service在内存保存该绑定的本机租约：完整policyIdentity、既有proof来源范围，以及由可信Service生成的scopeRevision。该摘要必须覆盖Host连接代际/PID启动实例、Windows用户/会话/boot、机器凭据代际、孩子分配及来源范围；不接受Host自行声明摘要作为授权。

同一连接仍存活、身份/配置/范围均一致且双方协商时，证明过期不撤销这个既存本机租约，因此断网时仍能替换该来源的新增贡献。它不扩展来源范围、不授权过期proof的云端请求，也不独立启用动作；执行仍要求完整当前投影及云端shared阶段。失联、Service重启、凭据/分配/配置变化立即撤销，不能从持久化恢复租约；待发送正文保留，联网后新证明可补发。旧端未协商仍按证明期限处理，并明确报告覆盖不足。任何已连接但未授权的活跃来源都使当前投影不完整，即使其旧数据已被云端ACK。

实际提醒连续性：固定 reminder/delivery/round、触发 stateRevision 与首次可见单调时刻。Service 使用同授权范围、日周、完整配置身份、来源集合、更正及产品关联版本的原贡献对照证明连续；逐来源序号与有效贡献不得下降，每次刷新均须通过。普通增长不重启60秒；授权、连接、目标变化独立撤销，下降或更正不冒充增长。许可的 stateRevision 仍为最新执行摘要，可选 triggerStateRevision 绑定原提醒；ACK 必须完整回传。两端声明 shared-reminder-continuity-v1 后才使用该新增许可行为，旧端保持原严格比较。共用准入不改变原账：复合借娱乐仍按复合窗，null/[]全天、起含终不含、等端点或逆序不命中，跨午夜需拆段，其他只受对象限制。

### 三批贯通与派生网页贡献（2026-10-03，PO 已批准）

第二批本机执行版本裁决：`basisRevision` 只标识云端依据，不能独立标识本机替换后的余额。执行许可、提醒轮次与 ACK 必须引用独立内部 `executionRevision`：SHA-256 对规范 JSON `{schemaVersion:1,policyIdentity,basisRevision,projection,replacementVersions}` 求摘要；对象键递归 ASCII 排序，替换版本按 date/source/sourceKey ASCII 排序且不得重复 scope，其他数组保持严格投影顺序。投影包括完整性、失败原因、日桶／借用及周结果；不含 computedAt、transportStatus 或原云端状态。旧序号不得覆盖新值，较新序号下降更正允许；相同身份也不能绕过连接代次、来源授权或配置完整性复核。准备响应不可用／不完整时不生成可执行身份。该身份只绑定执行读模型，不修改网页／应用原统计或公开云端 `sharedQuota`。

云端阶段控制复用孩子唯一 config：可选 `sharedAccessRolloutV1={schemaVersion:1,stage:legacy|shadow|shared}`，不携带另一套配额。父端沿现有受鉴权 config PUT、expectedVersion、版本和操作审计写入；非法字段拒绝。shared 保存需 `SHARED_ACCESS_EXECUTION_ENABLED=true`、派生贡献能力和专用签名密钥配置；默认不具备。读取 shared 时部署开关关闭则降为 shadow，保持旧执行且使完整 policyIdentity 变化；同一受限读取函数用于家长、设备和机器内部绑定，不允许终端请求自选阶段。开关只是最终发布安全开关，不能代替来源完整性、配置一致性、执行能力和真实联调验收；第三批验收前不配置开关或 shared 元数据。

按配置／贡献／余额、实际访问／提醒、最终集成／发布／真机验收三批收口。原网页与应用统计权威不变；新增共享派生来源不得混用网页本机统计摘要和 V2 manifest ordinal。集中契约候选统一为下一 Minor，在全部字段、失败语义与来源证明固定后只发布一次；原 1.29／1.28 准备层继续兼容，不逐字段发版。

网页新贡献由扩展现行权威统计生成。每个已认证设备、孩子及日期拥有独立单调 `revisionOrdinal`、内容 SHA-256、统计／更正版本及 ACK 水位；新版本允许因批准更正减少用量。上传不能提供 Child 或来源键，云端从 DeviceBearer 派生来源。独立贡献包含三个实际扣费桶、其他用量和 ACTIVE 总量；桶总量须与有效总量精确一致，网页保持整数秒。完整策略身份、计算时间、已结算截止时间与完整性分开保存；不能伪造截止时间。完整性不足仍可存储诊断，但不能当作完整共享执行依据。

Guardian additive `033_shared_web_contributions_v1.sql` 仅新增贡献 receipt／head，不修改原账／统计表。不可变 receipt 按家庭、孩子、设备、日期、单调版本唯一；head 只前进、同版异内容拒绝，ACK 丢失重放返回同一内容水位。上传事务通过当前设备归属条件写入，改绑后旧范围上传不能进入新孩子；旧孩子已消费贡献保留。水位用于本机恢复，不向客户端授予其他来源替换权。不存在派生数据的旧客户端保留旧只读诊断，明确新贡献覆盖缺失，不切换原网页统计权威。

Service 的跨端网页替换另需专用云签名来源绑定证明：绑定经机器鉴权核实的应用来源、当前分配版本、孩子范围摘要、经真实 Host 连接生成的浏览器连接摘要、挑战随机量与网页来源。Host 仅转发；证明不能由调用方指定 Child／来源授权，不能携带设备令牌或凭据。专用密钥只用于本证明，不复用登录、机器或 lifecycle 密钥；无密钥配置时稳定返回不可用，不 fallback。挑战与证明均短期、限定 audience，重连／改绑使旧证明失效；离线只能沿用已验证且仍匹配的 LKG 范围，不能为新连接制造授权。最终接口／证明字段需同一契约候选核对后才允许两端实现，生产密钥配置留到发布批。

批次 1 不启用硬限制或结束动作。新增派生上传和读取不触碰原网页 Segment、manifest、修正及上传确认链；两端独立贡献按来源版本替换，不能用总量减本机的近似算法或补造 V2 序号。

分页依据与影子状态 revision 包含完整公共配置摘要、生效时间和阶段，而非只包含 profile-config 序号。云端读取完成再比较完整身份；相同序号但配置内容变化也必须失效，不能把旧页面或余额复用到新配置。

来源证明实施口径：Service 在已核验 Host 连接内自行生成 `connectionHash`，通过机器鉴权为当前受保护用户请求挑战；Runtime 验证当前 assignment 后经 Guardian 专属内部绑定创建 90 秒挑战。Guardian 的新增派生表仅保存挑战随机 ID 与服务端范围，无令牌；浏览器用自己的 DeviceBearer 兑换，Guardian 核对同家庭／孩子，并经 Runtime 内部绑定再次核验分配。单挑战只能绑定一个网页来源；签发最多 300 秒、专用 ES256 密钥的证明，原始机器／用户／孩子 ID 不进入证明。Native 从已配对 HTTPS 机器接口取得专用公开验证键，核对签名、audience、时间、挑战、连接、应用来源、孩子范围摘要和 assignment；不得使用证明中的自报 key 作为信任根。缺钥、过期、撤销或改绑均不授予新网页 scope。离线 proof 过期后显示来源覆盖不足，已有已认证云端依据仍可只读，不冒称当前本机网页增量已纳入。短期证明只授予统计替换，不授予关闭、策略写入或设备登录。

真实余额读出口沿用 `getSharedQuotaState`：旧 `sharedQuota` 仍返回云端读数，不覆盖其来源含义；协商 `shared-quota-execution-preparation-read-v1` 后可选返回 `sharedQuotaPreparation`，包含完整配置身份、依据版本、本机替换版本列表、投影、运输 online/offline/unavailable 和稳定原因，`executionEnabled` 本批固定 false。缺失已认证 scope／全页／配置一致性时 projection=null，不能以零余额或最终共享统计替代。新 `shared-web-contribution-sync-v1` 能力开放三个 sharedQuota 请求：`getSharedWebSourceChallenge` payload={}；`bindSharedWebSource` payload={proof}；`replaceSharedWebContribution` payload={challengeId,upload}。Service 验证已绑定当前连接的 proof 后才保存网页本机贡献；同日期只接受内容一致的同版本或更高版本，不累加，改绑／换连接失效。浏览器设备令牌只用于扩展直接 HTTPS 上传，不经过 Host。云端机器依据读取可附 `X-Shared-Web-Source-Proof` header，Guardian 再核验当前绑定后仅添加该 proof 来源的网页替换 scope；证明不进入 URL。

执行去重记录的安全回收条件：Native对经认证、身份匹配的执行结果在SQLite事务中同时保存Ack和Consumed，事务提交后才返回browserExecutionAck；读取许可拒绝已有Ack或Consumed，重启沿用持久记录。消费者不能仅凭发送成功、墙钟超时、换租约或配置删除claim。只有收到匹配executionId/outcome的成功ACK，并使同一ID旧请求全部终结或由不可复活的请求代际拒绝后，才可在本地持久事务删除claim。ACK丢失、冲突、未持久确认或在途结果未隔离时保留并fail-closed；不能靠扩容无限累积解决长期运行。此为现有1.26许可一次性与ACK语义的实现核验，不增加关闭权限或改变计时。

网站用途规则导入复用 Profile 条件写入：仅接收 `classification: other`、`targetType: host/url` 和 `normalizedValue` 三个公开字段，服务端重新规范化目标并拒绝重复、类型不一致及额外元数据。既有同目标规则的服务端 ID、申请关联与创建时间保留；新规则由服务端生成 ID 和时间。缺省字段不改变规则，显式空数组表示清除。主页面只将已选用途差异应用到当前规则候选，提交公开字段；家庭归属、配置版本和审计继续由现有入口核验，不导入其他家庭的申请 ID，不改访问权限、历史分类或原始账本。

配置文件按 `publicAccess / websites / applications` 三域预览和应用。新公共/网站文件使用 `access-domain-config` schema 2；应用文件继续由 canonical App Policy schema 3 处理，不新增应用配置写入源。旧 profile-config 或混合 bundle 可读取，但先裁剪到选定域再生成差异。公共域只含学习/复合/娱乐配额、提醒、自主度和分类时段；网站域含网站对象、用途规则、单站限制和既有网页专属 onlineMinutes，不将在线总额提升为电脑总限制。全局系统网站库只允许在网站域显式选择，仍需原权限、预检和版本条件。

canonical 应用导入也必须在读取文件前固定 Child/view/策略 ETag，读取后及确认前再次验证；预览使用组件内存草稿而非可修改的 DOM payload。若刷新改变策略版本，必须重新预览，不能把旧预览套上新 ETag 覆盖更新。确认期间禁止重复提交，组件销毁后的迟到文件与写入响应不更新界面。已有 schema 3、旧文件公共字段忽略和服务端 If-Match 条件不变。

导入预览绑定 Child、配置版本、所选域和页面实例代际；任一改变须重新预览。提交只发送已选差异涉及的域内字段。现有 Profile API 按天替换 daily 对象，因此修改公共配额时必须原样保留当前同日的网页 onlineMinutes，修改网页在线总额时必须原样保留三类公共额度；这只是兼容写入封装，不改变其值或建立第二配置源。其他用途规则不得混入访问权限规则。第一批落实文件投影、差异路由和条件上下文纯函数及固定测试；页面接入、用途规则写入许可核对和真实导入仍未完成，不将准备层称为完整 UI。

Guardian 按 Child 维护唯一的公共时间配额、七天时间段和自主度配置；网页／应用只保留各自对象级分类、黑名单和独立限制。网站管理、应用管理从访问管理中独立，配置文件入口放入系统管理。增加明确分类 `other`，与 `unclassified` 分离：可统计、不借用或扣减三类公共额度，也不触发对应时间段和休息提醒；对象级限制不受影响。Chrome 由可信产品关联确认后作为特殊容器，分类为 `other`，其应用账仍保留。

电脑使用是展示读模型：`webMs + applicationMs - chromeIncludedMs`。`chromeIncludedMs` 必须是应用权威总量中 Chrome 的实际边际贡献；应用存在区间并集时，计算为同一可验证统计范围的总量减去去掉 Chrome 后的非 Chrome 并集，不能直接相加 Chrome 产品明细。不同电脑累计；非 Chrome 应用与网页同时有效仍分别累计。来源缺失时保留可读来源和稳定原因，不产生假零；无可靠 Chrome 排除依据时不发布完整电脑总量。分类展示排除 Chrome 容器而保留网页及其他非 Chrome 应用的 `other`。旧 D-111 的网页／应用精确区间交叠扣除仅可用于诊断，不再决定本读模型的总量。

共享配额单独消费两端已结算的版本化贡献，不从电脑使用总量反算；网页整数秒与应用毫秒保持各自口径。当前周期启用时纳入已有有效用量；离线使用 LKG 与本机增量，联网后按来源版本替换避免重复。软提醒的网页／应用触发、可见后 60 秒响应期限和失败处理一致；主动结束仅正常关闭，超时结束可强制，硬限制独立。原网页账本及结算边界无授权变更。

网页未来分段的 `other` 归属仅作为分类与配额桶保存：`mode` 仍表示实际运行模式，绝不把 `other` 当作模式。Worker 上传、目标统计展开、查询筛选及已批准更正分别校验模式和配额桶；含 `other` 的有效记录不得被静默丢弃，原始时长和起止边界不变。云端兼容接收不代表启用共享配额，也不追溯修改旧网页账。

网站显式选择“其他时间”时，家长审批写入独立 `siteUsageClassificationRulesV1`，并将申请标记为 `approved_other`。它不写入 `siteClassificationRulesV1`，不改 `studyList`、`compositeList`、受限或黑名单列表，避免把用量归类误作访问权限变更；同一对象后来被明确归入其他访问类别时，清除旧的用途归类覆盖规则。扩展消费端按未来分段 attribution 接入；本字段不改 `mode`、时间窗、阻断、时长或已落账数据。

2026-10-03 D-076 单项授权：PO 明确批准今后新分段写入 `targetClassificationAtTime=other` 与独立非扣费桶 `quotaBucketAtTime=other`。仅适用于显式“其他”用途归类；网页开始／停止、运行模式、总秒数和历史账保持不变。误设“其他”会减少学习／复合／休息分类额度的扣减，此风险已在授权问题中明示；本授权不包含追溯改账、共享执行启用或发布。当前已有对应归属代码，复验该实现，不重复改动计时逻辑。

单项授权后复验：`managed-targets.test.js` 47/47、`classification-effective-boundary.test.js` 12/12、`usage-segments.test.js` 295/295 通过，`git diff --check` 通过。已验证“其他”60秒新分段在原始、日、小时账中均保留60秒，独立桶计入60秒且Study桶不增加；用途归类不触发配置变更切分。仅是本地专项证据，不替代真实浏览器或上线验收；本次没有新增产品代码变更、历史改账、提交或部署。

2026-10-03 分页包精确审查续修：已确认固定1.28组装器允许应用scope，且终端缓存替换此前未比较持久来源版本。设备HTTPS消费者增加独立授权边界：只接受web授权scope，同一设备各日期的授权sourceKey必须一致；应用贡献可读但应用scope不得授予。在derived串行写入中读取同scope／完整policy摘要／同截止日期的可信旧LKG，逐source/date比较revisionOrdinal；旧ordinal、同ordinal异内容及无明确退休协议的已有来源消失均拒绝替换并保留旧缓存。新ordinal允许用量下降，不对opaque basisRevision排序，不修改固定契约或原账。仅复验真实reader的授权／缓存回归及类型、职责、diff；默认关闭，不启用、发布或改候选。

续修验证：固定1.28包原字节及真实分页reader专项通过，覆盖合法schema的应用scope仍被拒绝（有／无旧缓存）、重启后的旧ordinal拒绝、同ordinal内容／publication冲突、新ordinal合法降量及basis摘要不排序、旧来源消失不清账。typecheck、三文件职责检查和diff通过；固定vendor、cloud传输和background均未改，复用712bce3对应证据。Matched＝设备web授权边界与持久来源版本保护；Deviated／Extra＝无。真实API／Host验收和完整policy身份缺口仍未关闭。

2026-10-03 集成复验夹具修正：超时用例此前以10毫秒期限建立初始LKG且未断言成功，在较慢环境初始缓存可能尚未建立便取消，导致后续预期lkg实际不可用。改为先用正常期限独立确认缓存，再创建超时reader；在首个挂起请求到达后由受控测试时钟触发截止，确认取消／LKG／迟到不写。生产期限与读取代码不改，不以增加超时掩盖失败；只修改该测试及此记录。

夹具修正后，普通专项命令及带固定1.28包验真的专项命令均通过，diff和两文件职责检查通过。产品源码零变更，复用ca0bb56的typecheck／边界证据；Matched＝独立建立可信LKG再验证超时降级与迟到不写，Deviated／Extra＝无。真实API／Host缺项不变，TASK_BOARD草稿未纳入。

2026-10-03 1.29完整policy身份准备层：交接确认PR #211及相关CI通过；只读验真最终包93321字节、SHA-256 `1338ab2b2621ed4c19b8208203fd77d8e648b4f20721529479fc73a947bbbaf4`。既有getSharedQuotaState响应仅在V3连接协商 `shared-access-policy-identity-read` 后接受可选sharedAccessPolicyIdentity；旧端或缺字段返回未核实，不能凭policyRevision相同补身份。严格校验schema／revision／effectiveAtMs／stage／64位小写摘要；独立默认关闭核对器对当前完整policy递归排序key、UTF-8无空白JSON求SHA-256，并比较全部身份字段。请求前后复核认证scope和完整policy摘要，迟到响应或绑定／策略变化不可通过；不存身份载荷、不另建配置或协议。匹配只证明内容相等，executionEnabled始终false，不证明来源真实性、替换scope授权或共享执行许可。聚焦测试使用固定1.29真实契约函数及隔离Native响应，Native尚未实现，mock不称真机验收；不改原账、候选、TASK_BOARD或部署。

1.29准备层本地证据：`shared-policy-identity-reader.test.js` 携带最终固定包通过，校验真实契约canonical／SHA生成、同revision异内容／阶段／生效时间、错摘要、缺字段、单在途及身份换代／迟到；`local-guardian.test.js` 与 `shared-quota-state.test.js`、typecheck、extension-root、app-runtime-boundaries通过。Native专项首轮因夹具刷新心跳被原去重跳过，改为测试显式force刷新后通过，生产去重规则未放宽。Matched＝能力协商／严格完整身份／默认关闭／响应后身份复核；Deviated／Extra＝无。Missing＝Native实现与真实Host／设备联合验收；无生产调用者、启用、安装或部署，不把mock及policy匹配称为来源授权。固定1.28vendor、分页器及原账代码无变更。

2026-10-03 核心链路集中交付来源审查（恢复执行，仅审查，不是已贯通）：现行 `buildLocalQuotaProjectionV2` 只读本机 `daily_usage_stats_v1` 的active及实际quota bucket，并按设备应用批准更正；它是可复用的统计贡献基础，不用mode或媒体反算。`readCurrentWeekBrowserSnapshots`／`buildAuthoritativeDailySnapshots` 另提供北京时间日期、statisticsRevision、correctionRevision及snapshotRevision，但其complete还包含原始／恢复区间的完整性校验，不能把区间缺失等同于日统计缺失，也不能为新贡献放宽这个既有函数。`buildWebSharedQuotaContributionV1` 已提供整数秒转毫秒及other非扣费投影，目前仅由 `inspectSharedQuotaShadowV1` 消费，未接入1.28完整basis替换；1.28分页reader仅以空replacements检验和读取，不等于已计入本机未上传增量。

版本与触发缺口：BrowserBridge的三个版本及 `readV3LocalVersion` 均是内容摘要；V2 manifest ordinal则在 `prepareDeviceAccountV2Upload` 根据stats／raw事实指纹于既有上传准备事务内生成，两者不是同一版本域，不允许为D-114调用它增号、借用其ACK或改原上传队列。现有 `registerPersistedUsageSegmentObserver` 是单一监听槽，已由Native占用，且原始分段写入通知不证明聚合已完成；新派生队列应独立观察已落地日统计、相关更正／绑定／policy变化并有界合并重读，不能再次注册替换它。现有分钟健康／小时reconcile只服务旧BrowserBridge，未驱动D-114贡献HTTP上传。固定契约交付前不猜新端点、ACK、水位、来源证明字段或给云V2 ordinal加一。

第一批待接线：使用已批准的独立派生贡献队列／单调版本／摘要／逐版本ACK，持久版本严格绑定设备Child及日期，旧ACK不得清新版本；范围／更正版本和完整policy捕获沿用已有可信读取。自有web scope必须来自设备HTTPS及架构新增的云签名绑定证明，Host自报appscope不授予网页替换权。贡献组装调用冻结1.28的真实 `projectLocalSharedQuotaExecution`，不新增第二套余额算法；现行统计、原账、原上传队列及配额／提醒调用者不变。当前只有本机只读代码证据，没有固定新契约或真实上传闭环，禁止宣称余额贯通；本次不新建PR／中间候选／提交／部署，保留TASK_BOARD草稿，待同批固定包接线与集中验收。

### D-114 终端契约与实施边界

#### D-114 正常界面的只读可观测性（2026-10-03）

共享链路验收不能依赖家长反复进入Service Worker控制台执行脚本。诊断复用现有健康、管理员摘要及云端共享状态入口，不建立第二套统计或授权链路。扩展在本地组件卡片的可展开“共享配额同步”区域显示：实际扩展版本、已协商协议/能力状态、配置revision及阶段、本周逐日派生贡献revision/完整性/稳定原因码、待云端ACK与待本机确认日期、最近成功ACK时间、失败阶段及有界退避时间。云端ACK、本机ACK、连接成功是三个不同状态；历史缓存必须标注“缓存”，当前来源证明仅显示未建立/有效/失效/无法核实，不显示证明正文或来源标识。不存在的字段和无法核实的状态使用null/未知，不能显示假零或false。

Native的管理员健康摘要分别覆盖application-account和application-shared-quota派生队列，显示待发送数量/最老时间/最后实际ACK/最近稳定错误及可信来源绑定状态；旧hasPendingUploads只描述其原队列，不扩展解释为“所有统计已同步”。标准账户仍只看简化状态及最近成功时间，不能读取管理员计数或其他用户状态。普通UI读取只访问已形成的诊断快照；刷新不得重扫原账、上传、生成贡献版本、重绑定或触发限制动作。必要的诊断持久化须独立、有界、事件驱动，不写原账或改变原上传事务。

云端沿现有owner/Child授权共享状态展示本周接收覆盖、来源完整性、版本和稳定拒绝原因；不以原始sourceKey、机器标识或数据库payload作为用户诊断。客户端不得从“已连接”、策略ACK或旧outbox为空推断共享覆盖完整。网页及应用失败均原地显示，只读诊断故障不影响计时、拦截、原统计上传或设备管理。

实现职责：控件会话修改扩展实现及候选；Native会话修改本机健康/Manager实现；当前会话只修改架构/共享契约及云端。优先复用已有接口、保持1.30.0业务契约不变；如既有严格schema确需新增跨端字段，先集中列明由架构一次性处理，不能自行连续发版。聚焦验证：未连接/旧版本/无数据/历史ACK/失效证明/失败阶段/重试/长列表、敏感字段裁剪、标准与管理员隔离、无诊断副作用；新增界面完成桌面/窄屏目视验证。不运行无关平台/安装器全量测试，不在诊断尚未贯通时逐次构建安装包。诊断就绪后继续原D-114真实余额与动作验收，不能用诊断完成替代整体完成。

机器挑战响应在四字段挑战外返回机器鉴权派生的 `applicationSourceKey`、`childScopeHash`，供 Native 构造可信 expected context；不能从待验证 proof 读取这两字段当作授权。BrowserBridge 只需要四字段挑战。绑定表仅存设备令牌的专用范围哈希，换令牌后旧证明立即失效，不保存或输出设备令牌。

### D-114 共享访问终端契约边界（2026-10-02）

完整配置一致性契约：新增可选`sharedAccessPolicyIdentity`（schemaVersion/revision/effectiveAtMs/stage/policyHash），配合`shared-access-policy-identity-read`能力，随既有getSharedQuotaState只读响应返回。内容摘要是完整已验证UnifiedChildAccessPolicyV1的UTF-8规范JSON的SHA-256：递归对象key按ASCII序排列、数组保留顺序、无空白、整数/布尔/null采用JSON标准表达；不包含身份、token或路径，摘要只表明配置相同，不授予来源替换或执行权限。先按严格完整配置校验后计算；两端必须核对完整摘要、revision、生效时间和stage，而非只比revision。旧Service没有字段/能力时报告配置身份尚未核实并保持既有路径，不能默认一致。本批只固化1.29函数、类型/schema和共同回归，消费者由所属任务接入；Native原内部缓存hash不是跨端规范摘要，禁止直接冒用。

Native机器只读运输使用`GET /v2/machines/shared-quota/execution-basis?localUserId=opaque&assignmentVersion=N&date=YYYY-MM-DD&offset=0&limit=50[&revision=64hex]`，返回同1.28页结构。机器认证禁止写last_seen；Child由当前受保护assignment决定，拒绝其他query/重复key/外部Child或sourceKey。Runtime沿既有source算法派生application sourceKey，经GUARDIAN_COMPUTER_USAGE内部`/readSharedQuotaExecutionBasis`传递owner/Child/date/分页及opaque自身key；不传机器token、localUserId或SID。Guardian复核Child ownership和policy版本、只授予basis中已有自身application来源；非自身web来源仍完整保留但不授予替换权。Runtime读取后再次验证机器未撤销及同assignment，内部响应有界读取、错版409/参数400/故障503/no-store。此接口没有跨端web授权，也不启用shared；Native必须全页严格组装并按当前身份原子缓存，不能把ACK或单页当完整执行依据。

Contracts1.28固定`SharedQuotaExecutionPageV1`和`assembleSharedQuotaExecutionPages(policy, expectedProfileId, pages)`：transport携带profileId、basis/policy revision、日期覆盖及sourceCount、授权scope和分页游标。认证调用方完整收齐同一次读取所有页后调用组装；函数拒绝未知字段、跨Child/版本/配置混页、缺页/重页、非法游标、总计与逐日来源数不符、范围外或不存在的授权scope。首offset=0，连续递进，末nextOffset=null；limit1–100，总计0–1400，每日最多200，最多七天。零来源需要明确完整空页及各日原因，不把缺页当零。输入保持不可变，输出组装依据与授权scope，随后交既有1.27投影核验；该函数不认证服务器或授予执行能力，只接受调用方通过既定鉴权取得的响应。不增加双向控制或改变原来源统计；Native机器读取和可信跨端来源仍未完成。

#### 共享执行来源替换接入（2026-10-03，待实现）

契约1.27增量批固定只读依据核心：`SharedQuotaExecutionBasisV1`保存周一至查询日逐日的来源条目，每项区分云端`publicationRevision`、来源单调`revisionOrdinal`与原贡献revision。替换请求绑定basis版本、旧publicationRevision及日期/来源键；替换权限来自已验证认证上下文，不从请求自报获取。新贡献ordinal不得倒退，同ordinal必须原贡献完全相同，旧更正/产品关联口径不混用；较新来源版本可改变完整统计而不是假定用量只增不减。不存在的scope不能凭名称或空旧revision插入。本批先实现纯契约与共同向量，云端认证分页/覆盖信息及两端接入另行完成；global覆盖缺口不被替换清除。逐日重新运行既有共享配额投影后汇总周Rest，输出只称本机执行投影，云端权威统计及原账不变。验证替换、重复、错版/非自身/倒退/同版冲突、更正隔离、跨日借用与毫秒；旧shared-access/BrowserBridge契约字节保持兼容，未新增控制指令或启用。

统一配置设备读取补齐：新增只读 `GET /device/shared-access/v1`，使用既有设备 Bearer 鉴权，Child 只能来自认证绑定，不接受 query/body 指定其他 Child/设备。复用 `readSharedAccessPolicyForChild` 的同一 Guardian 配置投影，返回 `{schemaVersion:1,profileId,policy}`；profileId为认证绑定结果，消费方必须与当前既有cloud_profile_id核对，父端改变绑定后不得把另一个孩子的policy缓存到旧作用域。它不返回父账户信息、凭据或来源替换许可。未鉴权401、解绑403、档案缺失404、查询参数400、读取失败503稳定错误码；不修改现有 `/device/config`、不写数据库、不切换 stage。扩展按其当前认证作用域原子缓存已验证 policy，旧云端404不生成假配置。该接口仅补只读接入，不证明用量完整或开启共享执行。

设备执行依据运输：`GET /device/shared-quota-execution/v1?date=YYYY-MM-DD&offset=0&limit=50[&revision=64hex]`沿同一设备认证，只允许这四个唯一参数，limit为1–100，offset为0–1400，offset>0必须带上一页revision。读取周一至指定日的内部完整依据，再按确定性日期/来源顺序切页；版本不符409，非法cursor400。返回schemaVersion/profileId、basisRevision、policyRevision、fromDate/toDate、各日期reasonCodes/sourceCount、page(offset/limit/total/nextOffset/items)、authorizedScopes。自身scope仅由真实设备id与owner派生的web sourceKey确定，且只列依据中存在的本设备日来源；不能代替Native验证或为另一来源授权。所有页完整接收且版本、日期覆盖/计数一致后才组装1.27依据，不能把一页当完整周。读取结束复核当前设备绑定及policy revision/stage，期间变化返回409；缺设备id403不猜来源。响应no-store、无凭据/域名/原Segment；只读不启用shared。当前版本逐页重读有界持久统计，后续可按不变来源版本优化缓存，不得缓存跨孩子权限或混合页。Native机器侧依据与跨端web来源认证仍须单独接入，不能信任Host传入自报sourceKey。

现有共享状态 `sources` 只有来源、日期和版本，缺少各来源逐日贡献；不能由已借用后的 `day.usedMs` 减去自己的分类总量来恢复原贡献。下一接入批按同一最终结构补齐只读执行依据：云端固定配置版本和北京时间周一至查询日的来源向量，携带每个日期各来源已发布的有效贡献、统计/更正/产品关联版本、结算截止、完整性及覆盖原因。它是已结算统计快照，不是原始 Segment；缺页或缺来源不能成为零值，已有展示接口仍保持独立。

本机执行投影仅替换认证确认属于本机的来源副本，不给云端权威结果写回。以 `source + sourceKey + date` 为替换键，绑定所读取的云端依据版本及该来源旧版本；只替换匹配的旧副本，不累加重复快照。新本机贡献由各自权威统计产生，并绑定相同配置与生效更正口径。其他设备的贡献完整保留；替换后只执行共享配额投影及借用规则，不重结算、重新分类或修改任一来源账本。应用毫秒与网页整数秒继续不取整。重复执行同一替换得相同结果；旧云端依据或策略改变须重新取得一致依据，不能字符串比较 opaque revision 推断新旧。

周账必须重新汇总本次一致依据中的各日配额投影，不能只更新查询日而遗留旧周借用量。离线使用原子保存的配置、完整来源依据及本机同口径的新贡献；本机来源无法证明属于该依据、更新不完整或更正口径不一致时，不生成伪完整共享余额，明确报告覆盖缺口并保留既有网页路径。配置 LKG 与用量完整性分开：配置读取成功不证明共享账可执行，阶段仍保持原值，不能借此自行从 legacy/shadow 切成 shared。

身份权限核对是执行副本去重的内部约束，不是要求家长关联电脑或 Chrome，也不阻挡 Child 汇集展示。应用来源由已认证机器、当前受保护用户及 assignment 派生；浏览器本地 Profile UUID 不能代替云端网页设备身份。源标识和替换权限由认证上下文确认，不能接受任意客户端 `sourceKey` 删除别的设备用量。不得把机器/网页 bearer token、Cookie、原始 SID、邮箱、路径通过 Host 传递。浏览器来源绑定的具体认证消息须先核对现有能力再定稿；缺这项证明时不先开放浏览器副本替换。

后续最小固定向量涵盖：同来源替换不累加、异来源不删除、跨日周借用重投影、已借用网页不二次借用、应用毫秒、旧依据拒绝、策略/更正错版、重复请求、离线重启、身份切换及不完整覆盖。云端适配、契约及两端消费者分别由所属工作线实现。现阶段这些是接入设计，不是已实现或已验收；默认关闭提醒桥、候选包及策略 ACK 均不能替代完整共享执行证据。

浏览器执行由扩展负责，提醒呈现者可以是browser或native，两者不得混同。Service保存实例的执行目标source=browser和当时lease/activity；Native兜底窗口仅呈现及确认选择，不调用Windows closer结束Chrome。`stage/resolution`是状态不是许可：只有Service执行开启、shared、已收到可见确认并解决为end_rest/timeout_end、当前scope/策略/统计版本及活动仍匹配时，才在已验证浏览器连接响应返回可选`browserExecution`。许可包含原提醒六项身份、executionId、leaseId、activityId、targetSource=browser、effect及剩余maxAgeMs（1–5000）；不接受客户端指定目标进程或页面。end_rest只为request-normal-close，timeout_end只为force-close；继续、影子、未送达或撤回均无许可。

#### 控件准备层实施与验收记录（默认关闭）
2026-10-03 统一配置读取／LKG独立包：云端交接明确 `GET /device/shared-access/v1` 使用既有设备Bearer、自绑定Child、无scope query/body，最终响应为 `{schemaVersion:1,profileId,policy}`，同父端UnifiedChildAccessPolicyV1。必须核对服务端profileId与捕获的本机cloud_profile_id；错Child明确不可用，不把政策写入旧scope或沿用旧LKG冒充当前授权。旧云端404保持旧网页路径，不改 `/device/config`、配置源或stage。终端只增加捕获凭据的只读传输和默认关闭消费适配；初始化同步注册生命周期／身份与Native能力监听，显式候选启用后才在启动／重连读取。旧Service未协商V3和shared-quota-state-read时不读取、不共享执行。原云同步、网页访问和配置保存函数不接入此缓存。

LKG仅一份完整policy，严格校验七天配额／时间段／自主度／阶段及现有 `profile-config:N` 单调版本；未知／缺失字段、过大载荷拒绝，`24:00`作为合法结束保留。原子缓存包含policy、版本、摘要、接收时间及不可逆认证scope摘要：由既有设备／Child／端点／设备令牌计算，绝不另存令牌、家长session或浏览内容；不生成第二套可写配置。凭据变化使原scope失效，进程内代次和Abort隔离旧请求；异步身份读取完成后再次核对代次，旧读取／失败不得清除新代次的有效状态。持久缓存在重启后重新验证scope与内容摘要，按现有预算以derived优先级写入，上限32KB。请求失败／损坏保留同scope可信LKG，旧版本不覆盖，同版本异内容报冲突；401／403／404不采用缓存冒充现有授权。配置stage为shared也不启用访问执行或Native共享开关。用最小policy/LKG/真实校验器与Native只读能力测试验证断网、损坏、身份变化、迟到／旧版本、原子写失败和旧端兼容；排除浏览器重复验收、账本或配额算法测试、生产变更与候选替换。

本包最小验证结果：`shared-access-policy-reader.test.js` 与 `local-guardian.test.js` 通过，覆盖异步身份核对中途换代、旧失败不清新状态、错Child、损坏／离线／重启、原子写失败、旧版本／同版本冲突、超时与Native能力断开。typecheck、extension-root、app-runtime-boundaries及diff检查通过。测试使用隔离存储／网络／Native夹具和真实终端校验器，不是生产API或真实Host联调。另用固定1.26.0／1.27.0包的实际policy投影与schema核对当前消费者兼容；1.27.0包SHA-256与交接一致（`c277f13547f28d0c619c036f1b0ef9cee8a053fa0384647fd3b3d30c5485c41d`）。扩展无独立契约消费者锁，未修改架构维护的workspace契约或Native锁；新增1.27来源替换执行协议不在此只读包内。Matched：读取、身份隔离、持久LKG及默认关闭；Deviated／Extra：无。Missing：真实设备接口／Host联合验收及共享执行，不部署、不替换候选、不宣称完整D-114已完成。现有TASK_BOARD草稿不纳入本次提交。

2026-10-03 LKG精确审查补项：在Guardian已明确的 `profile-config:N` 数字版本范围内，新revision的effectiveAtMs不得低于旧可信policy；拒绝倒退且保持旧缓存字节不变，不推广为一般opaque revision排序规则。只读传输改用响应流累计UTF-8字节，超过64KiB即取消；多字节字符跨片使用流式解码，外部取消／超时同样取消reader，不先读取完整正文或保存错误内容。Native当前共享状态仅提供policyRevision，没有policy有效时间或摘要，不能证明客户端LKG与Native policy的revision／effectiveAtMs完整一致；本次不新增协议，保持执行关闭并将接口缺口交架构处理。补项测试限定policy/LKG与流式传输、typecheck和差异／职责检查，不改网页或应用原账、统计及任务板草稿。

补项验证通过：固定1.26.0／1.27.0包消费者专项覆盖新revision生效时间倒退不写缓存、恰好64KiB、逐字节UTF-8分片、字符数未超限但字节超限的提前取消、悬停响应外部取消和超时；typecheck、diff与四文件职责检查通过。Native桥源码不变，复用d40a0bc的专项证据；隔离流和存储夹具不替代真实网络／Host验收。1.27固定schema的state仍仅含policyRevision而无effectiveAtMs，接口缺口未关闭。Matched=两项精确补丁，Deviated／Extra=无；未部署或启用。

2026-10-03 执行依据只读分页消费准备包：采用交接的1.28.0候选包（来源511b52c，SHA-256 `72dbd1f611c0471913f07a72b23be519ad0066eb1c5d29f5433c7655b4b59c04`），此时尚无主线合入证据。仅将包内 `dist/shared-access.js` 与 `dist/shared-quota-execution.js` 原字节固定在终端core/shared-contracts/1.28.0，调用真实assemble函数，不修改共享契约源码、锁或另写组装算法。消费 `GET /device/shared-quota-execution/v1`：首offset=0/limit=50，随后携带首basisRevision；串行收齐，最多28页、一次409整轮重读，不能把缺页或错版当零。沿用设备Bearer、Child／设备／凭据代次及64KiB响应流上限；完整组装前检查日期截止、完整policy摘要及授权scope。连接不提供完整policy身份一致性仍禁止执行。

派生缓存 `shared_quota_execution_lkg_v1` 默认关闭，保存一个日期截止的完整组装依据、授权scope、内容与认证scope摘要，不保存token、URL、标题或原始Segment。日覆盖严格等于周一至请求日期；跨日期、Child、设备、凭据、端点或policy变更不消费旧缓存。总收集与缓存预算512KiB、请求轮次60秒取消期限；不承诺底层本地存储挂起时整个调用仍能准时返回。读取期间新增触发合并成最多一个待重读日期，旧代次不得发布。完整性由固定契约投影判断，缺源可显式缓存为不完整，但executionEnabled始终false，不成为拦截输入。网络／坏页保留同scope可信LKG，401／403／404／错Child不以旧缓存冒充授权。以现有预算derived串行原子替换，不触碰原账、quota_check、提醒效果或候选；范围测试为固定包字节、真实组装器、分页／取消／缓存／身份／期限与类型、职责和扩展边界，不跑生产／全量平台验收。

2026-10-03 分页包收口证据：架构后续交接报告1.28契约PR #207已合入 `85826e47aa32cc16c41dffb6186e8d7904fc6abf`，包来源及摘要未变；本终端实测包SHA与大小、两个编译模块原字节均一致，不将交接报告冒称自行查询CI。分页消费者及原policy消费者专项、typecheck、extension-root、app-runtime-boundaries通过；覆盖缺页不发布、零来源显式不完整、409一次重读、跨页冲突、缓存预算、取消后迟到响应、身份／policy变化及重启LKG。早期夹具等待固定次数事件循环曾失败，改为等待实际存储写入并设置有界超时后通过，没有放宽生产发布保护。Matched＝只读分页／固定组装／原子LKG／默认关闭；Deviated／Extra＝无。Missing＝已部署设备API／真实Host联合验收、完整policy跨端身份及来源真实性证明；同revision或Host自报均不授予共享执行。本次不改原账、TASK_BOARD草稿、候选、部署或版本。

2026-10-02 执行许可持久登记准备层：新增独立 IndexedDB `shared-browser-execution-attempts-v1`，仅显式启用准备层时打开，不在 bootstrap 运行；inspect 只读登记（首次打开创建独立数据库），claim 才登记尝试。唯一 executionId 在 strict readwrite 事务中先检查、再登记，事务提交后才返回成功；最多20条且逻辑记录总量不超过8KB，容量满、损坏、读取或提交失败均拒绝。记录仅含 executionId、leaseId、时间，不包含网页内容；不自动淘汰已登记 ID，不因断线或重启重新授予同一 ID。此存储不属于网页账本，不改变 storage.local 预算或落账。登记后再次检查当前许可和租约，失效仍保留登记并拒绝；执行效果始终关闭。专项只用隔离事务故障夹具验证，真实 IndexedDB／重启验收仍未通过，不新增浏览器运行。

边界补充：8KB 是记录逻辑载荷上限，不是 IndexedDB 文件的物理大小保证。20条未确认登记满后停止接收新 claim，仅允许下述持久 ACK 证明的安全退休，不按时间清除 tombstone。普通与 split-incognito 存储分区不假定共享，隐身上下文拒绝此准备登记；启用跨上下文效果前需另行验证全局去重与持久性。登记后的故障只消耗该 ID，不可通过重新执行弥补。

后续隔离验收只生成临时最小 MV3 测试扩展，复制登记模块而不加载正式 background 或任何家庭认证；通过 Chrome for Testing、真实扩展 Service Worker 和同一隔离 Profile 重启核对登记。事务失败以真实 IndexedDB abort 注入，许可过期使用明确隔离上下文；不会把这些夹具称为真实共享 Service 授权、计时或效果验收。未确认项满额保持拒绝；安全退休实现不替代真实持久性验收，不在测试中清库绕过。

2026-10-02 真实持久性验收阻塞：首次隔离 agent-browser 启动命令失败；非破坏性 doctor 的本地环境／浏览器检查通过。第二次使用空配置及显式隔离 Profile，Chrome for Testing 返回 about:blank 成功，但 agent-browser 子命令超过60秒未结束（ETIMEDOUT），未取得 IndexedDB、扩展 SW 或浏览器重启结论。同一命令两次失败后停止，不创建第三份 Profile 重试；临时测试扩展和 Profile 留存，不清库，正式候选未改。新验收脚本未提交，不用夹具证据覆盖该缺项。替代入口建议：经批准后改用现有 Playwright persistent-context 直接驱动同一隔离 Chrome；保持相同临时扩展和 Profile，只复验本登记库，不用家庭 Profile、不新增关页权限。

### 执行登记安全退休（默认关闭的准备层）

后续受控验收改用 Playwright 直接 persistent-context，必须显式指定此前留存的隔离 fixture 根目录，不创建新 Profile。仅更新该最小测试扩展的登记／代次模块，复验真实 strict IDB 提交／abort、ACK 后退休、旧候选拒绝、SW 重建和同 Profile 浏览器重启。ACK 权威输入仍由测试夹具模拟，不能称为真实 Native Service 联调；仅关闭自己启动的隔离 context。不新增 debugger 权限、不触碰原候选或家庭 Chrome，不更改原账。PR CI 同时核查 workflow 触发、角色声明与合并冲突；无运行不视为成功。

真实隔离持久性结果：Chrome for Testing `149.0.7827.55`，沿用原隔离 Profile。第一轮失败来自 Chrome 保留旧 unpacked SW 脚本，不是生产退休实现；只重载同一隔离测试扩展后通过。保留此前旧代码写入的一条无摘要登记，不清库；连续45笔新登记／模拟 ACK 退休、重复退休、旧候选及断流代次拒绝、实际 IDB 添加／删除 abort、SW boot 变化、浏览器重启后的丢 ACK tombstone、20条满额拒绝均通过。ACK 为夹具权威输入，Native Service 授权／ACK、隐身分区、真实关页及原账守恒仍未验收。忽略目录证据 `output/playwright/d114/execution-persistence.json` 绑定登记源码 SHA-256 `d50e8ba08bc173a5d7e5c52ddc072e34e5324724d5a05e07f2aa5b60d6cdcae7` 和代次模块 `fe0a64302eabf513ae9a1ff1c5550c571127893199c8ec3fd9a1f57dd12b7079`。脚本要求显式 `TOC_PERSISTENCE_FIXTURE_ROOT`／`TOC_PERSISTENCE_CHROME`，只允许此前留存的临时 fixture；命令为 `node tests/e2e/shared-browser-execution-persistence.js`。此前 CLI 失败记录仍保留，但该登记库／SW／浏览器重启的 Missing 已由此隔离验收补齐。

PR #197 CI 只读核对：`app-runtime.yml` 对所有 PR opened/synchronize/reopened/edited 提供检查，push 则只覆盖 master；草稿并非排除条件。GitHub 返回 mergeable=false，三路只读比较确认 `docs/DESIGN.md` 一处冲突，故 pull_request 运行被阻断（GitHub 官方说明：https://docs.github.com/en/actions/how-tos/troubleshoot-workflows）。另发现 PR 缺少角色检查必需的 `Task-Role: extension-local`，已补元数据，未改 CI 文件、重试旧入口或自行合并主线。冲突保留为集成 blocker；无 run 不记为通过，不以本地浏览器证据替代 CI。

2026-10-02 架构提供 Native `main@2436a8f` 的实际持久性依据：`AcknowledgeBrowserExecutionAsync` 在同一 SQLite 事务写入 ACK 与 `Target.Consumed=true`，等待 CommitAsync 后 Coordinator 才回成功；读取和授权均拒绝已消费目标。因此不新增 wire 字段。终端仅在现有严格 requestId、executionId、lease 及成功响应校验后生成内部不可伪造的退休凭据，绑定完整执行身份与 outcome。成功 ACK 推进本 SW 请求代次；所有旧请求、旧准备候选及旧代次 claim 被永久隔离后，strict IDB 事务才删除对应登记。断连同样推进代次，但不生成退休凭据。

登记新增固定 SHA-256 身份摘要，不存网页内容；旧无摘要登记不自动退休。未知、失败、丢失或冲突 ACK 保留 tombstone；删除失败也保留且允许相同结果重新 ACK，不重新执行。容量仍为20条／8KB，不因墙钟或配置清库；已 ACK 项安全退休使长期连续尝试可超过20次。验证覆盖连续超过20次、丢 ACK 满额、迟到回复／旧候选、SW 重建、删除失败及重复 ACK；事务夹具不替代仍缺失的真实浏览器持久性验收。执行、计时、关页及候选目录均不改。

实施证据：登记事务夹具连续45次成功退休；丢 ACK／满额拒绝、旧候选与排队事务的代次拒绝、SW 重建、删除失败、重复 ACK、身份冲突通过。Native 专项验证严格 ACK 才退休、重复 ACK 可恢复、无效回执与结果冲突不生成证明；执行准备层43项执行／28项生命周期／24项活动向量通过，typecheck 与扩展根目录检查通过。上文最初仅三字段且无退休的描述作为实施顺序保留，由本节身份摘要及安全退休规则取代；真实 IDB／浏览器重启仍为 Missing，未实施执行效果或修改原候选。此安全批排除未验收 Content/UI 草稿与浏览器脚本。

20条满后永久拒绝不是长期交付；已确认项使用安全退休，未知项保持拒绝。退休属于独立桥传输／幂等设计，不以网页产品语义批准替代，也不实施自动清库。

- 1.26 的 Service authorize 在原始 issuedMonotonicMs 后5秒到期，且要求 target 未 consumed、同 Service boot／lease／activity；消费方以原请求起点量剩余 maxAge，排队不能刷新期限。这里的5秒不是“本机 registeredAt 超过5秒便可删除”：登记仅保存墙钟时间，重启或调时不能由它证明 Service 永久撤销。
- 实施使用请求代次隔离代替墙钟等待：严格 ACK 后旧请求／候选不可再进入 claim，才事务删除对应登记。取消、失败或过期不重做；ACK丢失时保留并重发相同结果，不伪造 completed。
- SW／浏览器重启后旧单调时间不可比较。需要旧通道彻底失效、候选为空、全新协商和 Service 对该 ID 的持久终态证明；缺少任何条件保留 tombstone。配置或共享状态不同、activity 改变只证明当前不合格，不证明以后不能恢复；不能据此删除。断线、离线或墙钟变化也不构成回收依据。
- wire 回执仍为 executionId＋duplicate；采用上文架构核验的实际 Native 持久事务保证，而不是仅凭 authorize 纯函数推断。终端保存完整九字段身份的摘要；Service 拒绝冲突 outcome，终端不会从普通 success、墙钟、配置变化或越来越大的容量推导退休许可。
- 实施回收前固定回归：ACK前后迟到回复、ACK丢失、清理与claim并发、Service/SW重启、旧lease重现、墙钟回拨、同ID新许可冲突；全部证明退役ID不再执行，当前准备层继续关闭，不提前删除登记。

1.26 无效果准备层：固定源 `7ceab64bbe1f5c5e997edbd872c705d03cd5fb56`，82747 字节验真包 SHA-256 `a53d765f239d2f04d7c172c109f49ea2ae0db73689cbcea6d588da81074722c5`。校验独立 `browserExecution`，严格绑定提醒 identity、lease、activity、版本及当前 Rest 页面；有效期从 Native 请求入口的单调时间计入排队和传输延迟。不从 resolution/stage 推断许可。默认关闭的准备调用者 `inspectSharedBrowserExecution(date, { enabled })` 经 Native 读取、实时活动复核、许可资格检查返回无效果结果，不调用网页关闭、模式切换、结算或存储写入；一次尝试登记通过显式注入接口准备，claim 前再次核对身份、时间及已有尝试，真实持久登记及效果调用仍待单项批准。`acknowledgeBrowserExecution` 使用既有串行 Port，发送及回执时复核当前 lease，严格确认 executionId/requestId；准备检查本身不发送 completed，不把 canceled 升级。43 项执行、28 项生命周期、24 项活动共同向量及 Native 回执、实例、未知字段专项通过，真实扩展／Service／效果执行未验收。

### 网页结束执行边界（已批准隔离评估，候选执行未启用）

2026-10-03 架构交接补齐此前PO批准原文：允许隔离评估网页强制结束及必要的debugger路径；必须证明必要性、目标隔离、取消行为和原账自然事件守恒后，才能纳入最终候选。以下10月2日“待单项裁决／无浏览器运行授权”记录是历史状态，不再作为拒绝隔离评估的依据；隔离评估批准不等于直接新增正式权限、更新现有候选或开启生产执行，也不允许改原账语义。当前小步仍只完成执行身份准备检查，关闭效果及隔离实测尚未完成。

2026-10-02 API 只读核验：Chrome Tabs API 的 remove 仅接受 tabIds，没有 force/cancel 参数；当前 Chromium main 的 `TabsRemoveFunction::RemoveTab` 调用 WebContents::Close，并等 WebContentsDestroyed 才回响应，不能把请求发出当作关闭完成。其 delegate 经 CanCloseContents 与 CloseWebContents 进入标签关闭路径，不能仅靠 Promise<void> 分辨用户取消。CDP `PageHandler::Close` 明确派发 TAB_CLOSE beforeunload，可作为正常关闭候选；CDP 与 `chrome.debugger` 需要额外权限、挂接和真实取消/目标销毁验收，当前 manifest 无 debugger，不新增权限或实现。不能把 Target.closeTarget 的返回 true 当成页面已销毁或强制保证。证据为 Chromium main，不冒充当前安装 Chrome 的实测。来源：https://raw.githubusercontent.com/chromium/chromium/main/chrome/browser/extensions/api/tabs/tabs_api.cc 、https://raw.githubusercontent.com/chromium/chromium/main/content/browser/devtools/protocol/page_handler.cc 、https://raw.githubusercontent.com/chromium/chromium/main/chrome/browser/ui/browser_web_contents_delegate/browser_web_contents_delegate.cc 。

PO 待单项裁决：正常结束若用户取消，保留原页面和 ACTIVE，不先切 Study／停账；真正关闭后仅由现有 tabClosed 自然事件结算，不手工双重关 session。强制结束是否允许绕过 beforeunload、丢失页面未保存内容，以及是否批准 debugger 权限/执行技术路径，均未获批。本批默认关闭的登记准备层不实施上述行为，也不改变现行 Rest 结束路径。误关会少记，取消先停账会少记，关闭后漏事件会多记，手动与自然事件并行可能重复；必须通过隔离真实浏览器与原始账守恒后才能开启。

- 旧路径：`product/rest-usage-reminder.js:endPrompt()` 调用 background 注入的 `endRestUsage()`，以 `REQUEST_MODE_CHANGE` 请求 Study；既有拦截器可用 `chrome.tabs.update()` 导航到完整 Reminder。这是模式／页面跳转，不是有取消结果的正常关页，不能冒充 `request-normal-close`。
- 新许可读取位置：`infra/native-host-client.js:requestSharedReminderLifecycle()` 保留显式许可和请求发起单调时间；`product/shared-browser-execution-preparation.js` 绑定当前实例，仅返回准备结果。后续真实执行器尚未创建或接线，不能将纯校验称为实际结束执行。
- 拟裁决行为：主动结束仅一次可取消正常关闭，取消保留页面且不升级为强制；Service 超时结束仅在独立有效的 `force-close` 许可下终止绑定页面。不能由弹层所在平台决定目标，不能调用 Windows 应用 closer 关闭 Chrome 或其他标签／进程。
- API 未决：`chrome.tabs.remove(tabId)` 是关闭标签的候选 API，但官方签名没有 force 参数，也未给出本项目所需的 canceled／force 双分支保证（https://developer.chrome.com/docs/extensions/reference/api/tabs#method-remove）。必须先单独验证；在真实关闭／取消证据不足时，不实现或宣称这两个动作。不得擅增 debugger 权限、终止 Chrome 进程或以跳转 Reminder 代替关闭。
- 原自然结算保持：`core/signal.js` 的 `onRemoved` 仍产生 `tabClosedSuccessor/tabClosedNoActiveTab`，既有 foreground/timing-dispatcher/session 链路负责结算；本批未改这些文件。未来关闭动作不得同时手工 closeCurrentSession 再依赖自然事件重复结算。
- 少记风险：过期／串页许可导致错误关闭会提前终止真实使用；正常关闭取消后若错误停账会少记。多记风险：真实关页后事件丢失或残留 ACTIVE 会续记；人工停账与自然事件双结算会重叠。均须保持 P0，不能因各层秒数一致而消除。
- 真实验收方案：独立 unpacked Profile 和测试页面，保存许可请求单调时间、活动／原提醒绑定及关闭前后原始分段；分别验证正常关闭、取消保留、超时强制、导航／标签切换／锁屏、断连、重复 executionId、迟到响应及存储登记失败。原始账只允许沿自然导航边界结束一次，不能少记取消后的有效用量；核对小时／日／设备账守恒。本次未获新的真实浏览器运行授权，未执行。


活动观察器导航竞态补严：强媒体核验可能没有 `observedUrl`，因此采样时另用既有 `extractDomain()` 校验实际 tab URL 与会话域名一致；核验后的导航不能继续沿用旧域名的租约证据。仅影响默认关闭的活动上报，不修改网页会话或原始账。

2026-10-02 活动租约适配：固定 contracts 源 `543d5062f238f2378a1ec637672727647030a926`（1.25.0，架构通报已集成于 `14f5896`）；验真包 78698 字节，SHA-256 `27115fe33c4ac585fda3468ec42c6835e41277b5f93ca77969210285ce64a403`。继续使用同仓 workspace 依赖，固定包仅用于验真，不替换依赖或根锁。仅能力 `shared-browser-activity-v1`、Service 签发的 `browserActivityLeaseId` 和显式本地开关均满足时启用。每 5 秒只读复核已有 ACTIVE、实际 Rest 桶及当前页面，包含借用 Rest；展示资格另查聚焦、未最小化和 Content 可见。读取最多等待 3 秒，超时报告 inactive，晚到读取不恢复活动。上报严格七字段 `schemaVersion/leaseId/activityId/sequence/status/quotaBucket/presentationEligible`，不含客户端时间或网页身份；既有 V3 通讯外壳不作为活动期限依据。自然页面切换随机新 activityId，lease 内 sequence 递增；观察事件先撤销旧活动，复核后续报。串行 Port 只有一个待发活动槽，较新事实替换旧事实，活动与既有消息轮换，不中断在途账快照；长请求下 Service 的 15 秒期限可以失效，不延长权限。断连清除 lease、停止定时器，旧结果不得恢复；重新协商后重新核实。停止或读取异常报 inactive，不调用开段、停段或结算；关闭失败的残留 ACTIVE 不是活动证明。默认关闭，不安装或发布，不修改契约源码。24 个活动契约向量、只读采样及控制器、Native 串行／ACK／重连专项、typecheck 和扩展根目录检查通过；真实扩展和 Service 联调仍待验收，Content 第三次浏览器复验保持暂停。1.26 网页结束执行许可尚未消费，不从 stage/resolution 推断正常或强制结束权限。

2026-10-02 真实 Content 接线：background 同步注册独立共享提醒通讯入口，默认关闭，不注册轮询 alarm；候选显式启用后仅在确认的活动顶层标签呈现 Service 的 browser 提醒。复用现有提醒视觉样式，但使用独立 shadow dialog、滑动继续和结束按钮；不调用旧 Rest 暂停/恢复媒体、退出全屏、模式切换、网页关闭或结算。先验证可见再 ACK，收到 canonical visible 状态后才启用按钮。消息绑定 Service 全部 identity、当前 tab/window/URL 和 top frame；导航、关闭、取消及失败不生成选择成功。Native presenter 不显示；日周同轮合为一层；本地仅刷新 Service 状态，不发 timeout。正式接入共享执行、媒体暂停或结束网页仍缺 D-076 单项批准和真实账对照。本批仅隔离浏览器呈现及按钮通讯验收，不宣称端到端 Native 实机通过。

Content 草稿核查收口：仅展示资格补查窗口聚焦且未最小化，不改变网页 ACTIVE 容错。每次展示生成进程内 presentationId，Content 可见回复／按钮／撤销严格绑定该 ID、Service 六字段身份及顶层 tab/window/URL。导航（包括同 URL 重载）、标签／窗口变化、页面隐藏或 Escape 仅撤销本地弹层和候选，递增代次；桥请求入口和返回另核对 Native lease，失效或通道错误撤销，不占用已有活动上报的单一 observer。旧读取、显示、ACK、按钮回复不能恢复旧 UI，不伪造 Service 的选择或 timeout。投递与桥请求最多等3秒，晚到回复无效；它不是60秒响应截止时钟。清理允许向原页面发送最佳努力 dismiss，但不把其他页面当作原目标。所有自动事件默认只注册监听器，无启用、轮询 alarm 或执行效果。验证限定生命周期／桥最小测试和隔离真实 Chromium DOM 的可见、继续／结束请求、迟到响应、桌面／窄屏截图；Native 通道仍模拟，不声称真实 Service 联调、全量扩展或关页／记账精度验收。

本批验证：`shared-reminder-content-bridge` 与 `shared-reminder-lifecycle` 专项、typecheck、扩展根目录及职责边界通过。隔离 Chromium 149 DOM（模拟 Chrome API／Native 传输，固定1.24.0 Service纯函数）验证默认关闭、日周合层可见 ACK、真实滑动继续、结束请求失败重试、Escape不产生选择，以及同URL重载后的迟到 SHOW／ACK／按钮结果均不恢复弹层。桌面1100×760与窄屏390×844截图目视通过；证据位于忽略目录 `output/playwright/d114/shared-content-*`，含精确源码摘要，媒体调用／本地存储写入／网页跳转为0，模拟Service效果为none。首次截图因工作树写权限失败，批准精准证据写入后通过；不是功能失败，也没有改家庭Profile或候选。真实Native安装与端到端提醒、统一配置、网页来源自排除增量和版本替换、本机共享配额访问判断／离线LKG、正式进入确认／60秒提醒调度及正常／强制关页消费仍未实现或未验收；read-only和prepare通过不等于共享配额全链路完成。

共享账只读消费校验独立小包：现行扩展只核对周起点与秒数，未消费固定契约已存在的 `week.toDate/complete/reasonCodes`。补充真实自然日校验，周一起点由请求／日账日期确定，截止必须等于所请求日期，不允许未来周末或其他周混入；缺少周完整性字段或顶层完整而周不完整视为非法，合法partial原样保留标志与原因，影子对照不得报告matched。此项仅验证读取响应，保持固定契约／包、网页与应用原账、聚合、自排除和当前访问配额算法不变。最小验证为shared-quota-state、shared-quota-shadow、使用实际校验器的local-guardian，另typecheck／diff／职责边界；不扩大为全量或Native安装测试。

消费校验结果：上述三个专项与typecheck通过，覆盖缺字段、错日／周起点／未来截止、非法自然日、周不完整、顶层完整性矛盾，以及周日／周一和跨年。合法partial读取仍返回原标志和原因，影子对照返回incomplete，未修改任何用量。方案核对Matched＝读取边界与契约一致／不完整证据保留／错误拒绝／只读无执行；无Deviated或Extra。未因此宣称配置、实时增量、自排除、离线LKG和共享访问管理消费已完成。

2026-10-02 生命周期候选适配：固定验真 contracts 1.24.0，正式来源 d8764de7fc7972d212fef95b93db8ec1e4922d14，包 SHA-256 058437273406a52e53cd9161d3bd556acdccd9278c74312396457346b9dbd22c。保持同仓 workspace 来源，不手改共享源码或根锁。新增默认关闭的生命周期协调器与 Native 串行请求，要求 V3 和 shared-reminder-lifecycle-v1 能力。读取 Service 已签发的 browser presenter 状态；展示器返回实际可见后才发送严格 identity + delivery（无客户端时间），采用 Service canonical visibleAtMs；按钮只发送 identity + continue/end_rest。日周由同一轮 kinds 表达，不自行签发 ID；退回、失联、旧轮次及无效响应不产生关闭效果。超时仅查询 Service 状态，不发送 timeout，不使用浏览器墙钟授权结束。当前协调器通过注入展示接口做隔离验收，不接入现行 Rest、网页原账或执行开关；真实 Content 展示、Service 联调及 D-076 执行验收仍未完成。

2026-10-02 终端后续适配：共享查询与提醒结果上报默认关闭，显式开启影子适配且本次 Native health/probe ACK 同时声明 V3 和对应能力后才可进入既有串行连接。按架构澄清 d7fed58，getSharedQuotaState 能力名为 shared-quota-state-read，payload 仅含 date；reportReminderResult 能力名为 shared-reminder-result-shadow，payload 直接为 SharedReminderResultV1，只记录不执行。断连清除协商结果，排队请求发送前再次核验；旧 Host 不接收探测性 sharedQuota 请求。提醒结果按同一 requestId 的成功 NativeHostResponse 确认；Native 只接收自己已登记签发的 reminderId 及已缓存 policy/state 版本，否则返回 SHARED_REMINDER_NOT_ISSUED。终端有界影子适配器最多保留20个待发送结果及20个确认指纹，显式重试采用递增冷却，当前只驻内存、不接入现行 Rest 动作或自动启用。传输失败保留原动作和 delivery，不得伪造 timeout_end；主动 end_rest 不转换为强制动作。正式契约包、Native 签发生命周期、接收幂等和候选实测待配合，不影响原网页账或现行配额。

许可按同一executionId重送，不生成第二次动作。Service从原授权转换时刻起按自身单调钟最多保留5秒，boot/lease改变、已消费或过期不再发行；重查/重送不得重置期限。扩展从请求发起时以本地单调时钟计剩余maxAgeMs，包含传输耗时而非收到响应才重置期限，执行前重查当前连接lease/活动/配置/状态版本与Rest资格，并先持久登记该executionId的一次执行尝试。重放不得再次执行；断连、活动切换、版本变化、过期均取消许可，不能用缓存执行。扩展只结束本次绑定且当前产生Rest用量的网页，不结束整个Chrome、不影响后台页。主动结束允许保存/取消，canceled不自动升级；超时强制仅由Service既有60秒单调转换签发。`sharedQuota/acknowledgeBrowserExecution`严格返回同一许可身份及outcome=completed|canceled|failed|stale，不含URL/标题/Child/进程或客户端时间。Service核对发行记录及认证lease，逐项幂等记录，冲突拒绝；ACK不授予新执行权、不得重试已消费动作或改变原账。Native本地目标继续沿原执行器，与浏览器许可分开。

本项增量契约1.26.0：仅补显式许可/回执及共同向量，1.25活动和1.24生命周期保持兼容；缺能力则只保留提醒/状态，不猜测网页执行权。两端各自实现，默认关闭；源代码验证、真实窗口/网页验收与正式启用分开，不改变网页落账语义。

实时网页提醒资格增加 `shared-browser-activity-v1`，不以累计快照、heartbeat或一次查询当作正在休息的证据。Service在v3能力协商时为已验证Host进程代际/扩展连接发放不透明`browserActivityLeaseId`；它绑定受保护用户会话、Profile和策略作用域，不允许客户端选择其他用户。Native Host仍只转发。新消息`sharedQuota/reportBrowserActivity`严格包含schemaVersion、leaseId、activityId、sequence、status、quotaBucket、presentationEligible，不接受时间戳、URL/域名/标题、tab/window原始标识、Child/SID/用户名或进程目标。

扩展从既有getSession与当前页面复核取得ACTIVE且实际Rest桶资格（包括借用Rest），每次自然活动身份变更生成随机activityId，lease内sequence单调增加。active仅允许quotaBucket=rest；inactive必须quotaBucket=null且presentationEligible=false。当前可见聚焦页面才可声明presentationEligible；既有强媒体继续记账但无提醒展示资格时可active/false。不新增、结束或改写任何原始网页会话。停止、导航、标签/窗口切换、失焦/idle/锁屏后立即重验并发送当前事实；关闭结算失败保留旧session不够，须独立复核页面和展示资格。

活动时每5秒更新，Service以自己的单调接收时间保持最多15秒新鲜度；静默、过期、Service重启、Host进程代际结束或作用域变更即失效。重复sequence且内容相同仅ACK，不续期；同sequence不同内容拒绝，旧sequence无效，旧lease拒绝。新连接取得新lease，不能用旧消息复活。Service还须核验当前用户解锁与真实前台Chrome；仅客户端声明不能授权签发、可见ACK或结束。提醒实例绑定当时lease/activityId；任一变化撤回原实例，迟到ACK/选择不执行。查询只读状态，不能刷新活动。15秒是消息证明的最大新鲜度，不表示允许用户切换后继续操作15秒：已知前台/锁定变化立即撤回。活动租约不贡献用量，不改变配额、阈值或既有60秒响应计时。

本批契约增量1.25.0，保留1.24生命周期及旧Service健康/影子兼容；缺能力时不发送新消息、不降级拿旧快照冒充活动。只实施规范、schema和双方共同向量；扩展/Native由所属任务实现且默认关闭，实机和正式启用另验。架构职责提交与前一云端UI批次分开，不新建分支或工作树。

### 主控制台 Runtime 管理通道

系统诊断使用只读 `/v2/module/segment-diagnostics?childId=&kind=usage|media&fromMs=&toMs=&limit=`，Guardian仅通过同名固定管理资源代理。账户与Child归属、日期范围沿现有校验，limit为1–100，默认50；它是最近一页检查，不提供原始身份游标。响应`items`采用显式字段白名单：startAtMs/endAtMs/durationMs、displayName、estimated、历史applicationClassification（主账）或mediaKind/presentation（媒体）。`hasMore`仅说明存在后续记录；不返回id、machineId、localUserId、runtimeIdentity、凭据、路径、原始分类切片或nextCursor。原明细接口、账本查询和统计不变；此检查不作为用量总量，仍由原权威统计提供。兼容上线需要先提供该云端只读资源再挂载页面，当前不部署。

主控制台发布构建从 canonical `app-runtime-management/console/` 生成仅管理组件的 `runtime-management-component/` 资源。固定 JS/CSS 白名单与无脚本模板 manifest，不发布独立 `index.html`、SSO bootstrap 或 RuntimeSession；模板包含原管理表单和抽屉，由主控制台同源加载器挂载到隔离根。源文件不复制回 pages、不单独维护，独立 Runtime Pages 暂保留兼容入口。拒绝符号链接、覆盖已有输出及路径越界，主 Pages 的 Task 发布排除不变。

Runtime canonical 控制器提供 `AppRuntimeManagement.mount`：注入 DOM root、Guardian 管理网关 request、当前家庭 children/Child、管理 view 和宿主 isCurrent 检查。嵌入实例只服务管理视图，不取得 Runtime 浏览器会话、不执行票据交换/登录跳转；宿主统一管理选择和退出。销毁释放监听器、定时器和知识组件，未完成请求只能被丢弃，不能声称服务端已取消写入。独立 Runtime 页面继续自动创建默认实例直到主控制台实际整合验收。模板和静态依赖由 canonical source 生成同源组件资产，不恢复 pages/app-runtime 副本或 iframe 子站。

canonical 产品知识组件接入主控制台前，DOM 查询与事件绑定须限定在调用者提供的 root（可为 ShadowRoot）；未提供时保持独立页面 document 兼容。调用者在切换孩子/会话时更新 contextRevision 并使旧组件失效；组件请求按开始时 Child/contextRevision 检查返回，不让旧响应更新新孩子的配置界面，销毁移除监听器并关闭自身对话框。组件失效不撤销已经送达服务端的写入，也不自动重试写入。该生命周期只作用于展示/管理适配，不产生第二套知识或统计权威。

主控制台以原 Guardian 家长 session 调用 `/app-runtime/manage/v1/{resource}`。Guardian 仅代理固定 Runtime 管理资源到既有 `APP_RUNTIME_SERVICE`：应用目录／产品知识／对象策略、电脑／账户分配、配对和诊断；不代理机器上传、机器令牌、身份生命周期或请求提供的目的地址。内部短期 account-module JWT 从现有家庭 Child 投影签发，永不返回给主页面，Runtime 继续逐资源核对 account／Child／machine ownership。传入 Authorization、Cookie、账户头和目标地址不转发；仅保留 Content-Type、If-Match 以及服务端内部认证。响应保留状态、JSON body 和 ETag，禁止重定向或 Set-Cookie；全部管理响应 no-store。请求／响应体流式透传，不为整合重新解析或结算原账。现有 SSO 独立页面暂留兼容，主控制台完成真实验收后才转旧地址。此网关不构成新配置权威，公共时间配置仍只写 Guardian。

当前消费基线为 Contracts 1.23.1，主线 `9c1381f`。扩展同仓继续使用 workspace，不改为 tgz 依赖；固定包仅作为消费者验真证据，Native 跨仓则锁定包与 SHA-256。控件提交 `8a3ba2c` 的能力协商、串行请求与有界影子结果适配按原文件集成，不重新实现；其分支中的旧云端提交 `9574c30` 不覆盖已由 PR #179 修订的主线共享状态接口。影子查询合法完整／部分结果均 `ok=true`、`sharedQuotaStage=shadow`，这不授予执行权限。提醒实际签发、可见确认和关闭执行仍待贯通，当前保持默认关闭。下文 1.22.0 为前一阶段记录，不作为当前消费版本。

终端以 `@timeonchrome/app-runtime-contracts` 1.22.0、架构提交 `c403176` 为固定契约；包 SHA-256 为 `1e3188147f56cf7b945a0acf2646bc24bc6b5bcbb8212ed01a7f2d75ffd7adaa`。该版本相对 1.21.0 只增加云端确认的 Chrome 产品身份、应用贡献的 `chromeIncludedInApplicationMs` 显示边际扣除字段及机器鉴权上传外壳；网页贡献不生成该字段，也不生成仅属于应用配额排除的 `chromeExcludedMs`。Native V3 的 `sharedQuota/getSharedQuotaState` 只返回 `SharedQuotaStateV1` 读模型；本阶段仅在显式调用时读取并校验版本、周期、策略 revision，不保存为执行状态，不替换网页配额。旧 Host 不支持时返回明确不可用，仍执行既有网页账和配额。`reportReminderResult` 虽列入契约，但提醒去重与结果消费尚无端到端实现，不发送结果或改变现有弹层。跨端执行保持关闭，原始网页账本不因本契约变化。

网页来源影子贡献只能从现有已结算 `BrowserDailyUsageSnapshot` 转换：Study／Composite／Rest 秒数精确乘 1000；显式 `other` 仍保留在网页主统计中，但不进入三个扣费桶；未知或其他未定义桶、桶合计与 `activeSeconds` 不一致、来源快照不完整或整数溢出时标记贡献不完整。网页既有借用 Rest 已在 Rest 桶中，不再次计算。转换器不读取原始分段、不上传、不写缓存、不改变现有配额执行。

影子核验只检查共享状态 `sources` 是否包含同一网页来源键、日期和 revision，并核对周期、策略 revision 与完整性；不能据合并总量倒推出单一网页贡献。已有 Rest 日／周合并弹层可按每个覆盖 scope 生成独立、同一弹层关联的 `SharedReminderResultV1` 候选；只允许在真实可见后记录 `visibleAtMs`，失败投递保持 null。本阶段纯构造和校验，不向 Host 上报，不把共享状态用于现有提醒。

显式影子诊断入口可组合上述网页快照转换和 Native 只读查询；来源键由调用者从可信设备身份提供，不能由页面、域名或应用名称猜测。输入网页贡献不完整时不查询 Host；Host 尚未发布共享状态时返回 `unavailable`，已发布但来源 revision 缺失或不一致时返回对应原因。结果不存储、不显示为正式配额、不参与 Rest 提醒或拦截。

### “其他”网站的未来分段归属（2026-10-02，D-076 单项批准；云端兼容已实现，待主线发布）

现状：站点解析尚无显式 `other`；未识别站点会进入待归类，已定义站点的原始分段以当前 runtime mode 推导 `quotaBucketAtTime`。仅在界面增加“其他”标签仍会扣学习／复合／休息额度。PO 单项批准对**今后明确归为其他的网站**记录 `targetClassificationAtTime=other` 与独立非扣费桶；不改网页 ACTIVE 的开始／停止、idle、焦点、媒体容错、checkpoint、时长、domain、上传确认或历史分段。

| 场景 | 原计时行为 | 批准后的计时行为 | 唯一归属变化 |
|---|---|---|---|
| 普通输入、强视频／强音频、弱 audible | 沿现有焦点／媒体证据规则开始、续账或停账 | 完全不变 | 仅显式“其他”新分段使用独立桶 |
| 失焦、最小化、后台标签、idle、锁屏 | 沿现有容错和停账边界 | 完全不变 | 不凭分类增加有效时间 |
| checkpoint、结算、跨日 | 按现有事件和整数秒切片 | 完全不变 | 各层总网页秒数守恒 |

误设“其他”可能少扣分类配额；同一条记录不可同时占用旧分类桶与“其他”。本批准只改变未来 Segment 的 `targetClassificationAtTime` 与独立 `quotaBucketAtTime`，不改变网站访问路由、时间窗、配额执行、模式、频道、开始／停止、时长、上传确认或既有账。终端 V2 设备账仅在目标行接受 `quotaBucket=other`，运行 `mode` 仍只允许真实运行模式。云端原始账兼容由 `416c492` 提供，V2 设备账校验及网站分类审批路径已在云端分支实现，并由 Worker／终端聚焦测试验证；代码尚未合入 master 或生产发布。既有历史数据不自动重分类或改写。

终端从云端档案配置读取独立的 `siteUsageClassificationRulesV1`。仅接受其中 `classification='other'` 且目标类型和值合法的规则，并仅作为新会话的 managed-target 归属输入；不得并入 `siteClassificationRulesV1`、访问路由或网站冲突校验。配置同步时，活动网页会话的有效边界计算忽略该独立规则，避免因它新增网页 Segment 边界；既有会话保留原分类和配额桶，下一次自然新会话才应用 `other`。规则中的 `other` 只映射至 Segment 的 `targetClassificationAtTime` 与 `quotaBucketAtTime`，runtime `mode`、`channel`、时长和结算事件不变。

2026-10-02 PO 对上述未来分段归属变更作出 D-076 单项明确批准：仅新分段写入 `targetClassificationAtTime=other`、`quotaBucketAtTime=other`，不修改历史账或网页开始／停止及总秒数。误设“其他”会少扣分类配额的风险已在确认问题中明示；本项批准不授权其他记账语义变更或生产发布。当前源码路径已存在，本次不重复修改实现；`managed-targets` 47/47、`classification-effective-boundary` 12/12 通过，仅作为归属和边界专项证据，不替代真实浏览器及原始账守恒验收。

### 固定终端源码与开发候选边界（2026-09-30）

`D:\Codex\TimeOnchrome-worktrees\extension-local` 是终端扩展唯一源码工作树。`1.7.40 Native Host Development Candidate` 仅由此工作树的 staging 工具生成到隔离的 unpacked 目录；源码 `extension/manifest.json` 的正式版本不随候选版本改变。候选复用已批准候选 manifest 的公开 key 并核对稳定扩展 ID，不生成 CRX 或 `update.xml`，不进入托管更新源。候选包含周 Rest 提醒、默认关闭的复合观察及 Task 可选模块；旧 Popup 纯网页软配额面板不纳入。Chrome 既有 `81a1` 路径作为 junction 兼容入口，只有独立 Profile 验证、完整备份和加载前后只读核对通过后才替换其 D 盘目标包；不卸载扩展或清空本地数据。真实 30 分钟复合上传闭环仍待验收。

路径收拢先于候选升级：在 1.7.40 Rest 完整验收失败期间，Chrome 已将 1.7.39 同一 D 盘包的加载来源由 `81a1` junction 改为直接路径，未替换包内容。扩展 ID 与绑定已恢复；切换期的历史差额由 PO 接受并保留原证据，不回填。新账逐 ID 云端确认及日/小时对账仍是后续门槛，不能仅凭页面汇总宣称数据验收完成。旧工作树在仍被会话或进程引用时不得退出 Git 登记。
## 2026-10-02 电脑使用读取优化（不改变D-111/D-113统计语义）

Guardian按完整来源指纹缓存合并后的展示代际，summary与完整详情分键；summary命中仅返回已生成汇总，不重新构造时间线、产品或计算重叠。首次生成继续使用原权威统计和完整证据，不能用删区间的空证据快路径改变Chrome排除、分类或完整性。网页/应用读取及独立版本查询并行；缓存前后核对来源版本，版本变化仍标记不完整。KV只是加速层，故障或过期回落到原读取，不作为新账本。缓存键含account、Child、日期、来源版本和可选来源筛选；每次服务端命中仍核验归属及来源，失败结果不缓存。页面仅内存30秒、最多16条，同请求去重；手动刷新绕过，切换范围/孩子清空视图并防迟到覆盖，明细沿用同revision。无需migration、Native升级或计时/配额变更。

## 2026-10-01 网页／应用统计结构统一（D-113，设计已调整）

网页已有“原始 Segment → 本机持久化日／小时／目标统计 → 统计同步 → 云端孩子归集 → 配额／页面读取”。应用必须补齐同层持久化、恢复和同步结构，不能以查询缓存替代。共同规范维护在 `STATS_STORAGE_FOUNDATION.md` 的“2026-10-01 跨来源统一统计结构”，Runtime 映射维护在 `app-runtime-management/docs/DESIGN.md`；实施顺序见根 TASK_BOARD。网页现有算法、落账及 V1/V2 产品启用边界不变；本轮只有设计调整，尚无新统计表、接口、Native 安装或云端发布。

## 2026-10-01 使用统计读取纠错

孩子归属以 Guardian 当前 `profiles(account_id,id)` 为权威，不能以仅旧版配对写入的 Runtime `runtime_children_v1` 推断。Runtime 三个读取方法通过现有 Guardian `ComputerUsageService` binding 的受限 `POST /verifyChildAccess` 核验；请求有界且仅返回布尔，不读取用量、不递归调用 Runtime、不新增公开路由。归属读取失败返回稳定 `APPLICATION_SCOPE_UNAVAILABLE` 并 fail-closed；无设备但合法孩子允许读取空来源，外家庭一律拒绝。两个公开入口的既有鉴权保持不变，原记录及配对数据不补写。

线上可观测日志已证实 RuntimeComputerUsageService.jsrpc 被运行时以 hung/canceled 取消，普通应用 HTTP 读取正常；本地真实 RPC 无法复现生产取消，不能称为已证明数据库故障。本轮将 Guardian→Runtime 读取改为同一命名 Service Binding 的受限 fetch 传输，显式等待并完整读取 JSON，保留旧 RPC 兼容；不新增公开 HTTP 路由或权限。仅三个固定只读方法可达，每次仍核验 account/Child，错误返回稳定码；用真实登录结果验收传输修复，不能仅凭本地 RPC 测试宣称生产恢复。

两套云端页面固定四视图：电脑使用（默认汇总）、应用使用、网页使用、网页媒体使用。现有 `computer-usage` GET 增加可选 `source=application|web|media`，在既有账号/Child ownership校验后读取独立来源；不走合并器、不发原始身份。Guardian受限RPC复用现有网页/媒体只读路由和更正口径，Runtime受限RPC复用现有应用权威查询；内部短期读取身份仅在Guardian调用既有路由时使用，不保存或返回。独立结果仅含裁剪的总量、分类、时间分布及排行。网页总量只取真实每日active投影，禁止同时累计domain/target或日/小时。来源故障不补零，详情保留脱敏稳定错误码，精确重叠未知不屏蔽有效来源。所有原统计、落账、配额和写入路由保持不变。

## D-111：云端统一电脑使用的只读读模型

收尾实现口径：以Child读取全部来源，新增独立的sourceStatus（网页/应用 complete、partial、unavailable）、historyStatus（none、bestEffort）和overlapStatus（confirmed、unconfirmed）。原complete继续只表示精确统一总量是否成立，不控制来源分类/明细的可见性。categoriesMs在精确去重可用时保持去重口径，否则标明sourceCumulative并累积有效来源分类（排除已确认Chrome的容器贡献）；原来源分类另列，不能把分类和当成电脑总量。历史来源标记bestEffort，可读多少展示多少；缺失不补零、不回写。Chrome内容明细在未确认电脑关系时返回child级网页内容，标明scope=child、containerRelation=childContent，不产生重叠扣除；scope=computer才允许解释容器内/外。现有接口和同版本分页沿用，不创建新数据账本或迁移。

Guardian 持有统一入口，使用既有网页权威快照和只读区间证据，经受限 Runtime 服务接口读取应用权威统计及证据。统一接口按 Child 查询，单台电脑内去重、跨电脑累加；独立 Runtime 页面通过受限 Guardian 内部接口读取相同结果，不能自行生成另一版本。共享规范源为 `@timeonchrome/app-runtime-contracts/computer-usage`，来源版本、关联版本、更正版本、展示规则及内容摘要组成 revision，时间线分页锁定 revision。

新读模型不得依赖或改变原落账事务/上传 ACK/统计生成/配额判断。应用区间只读已结算主账，网页 creditedMs 必须来自原整数秒权威结果；辅助媒体和零时长诊断不参与。重叠扣除采用支持区间与有效时长的上下界，只有上下界相等才能发布精确值；不能把区间宽度代替网页有效时长。缺少完整来源、可信设备关联、守恒或版本一致证据时为 null 并返回原因，不显示假零。学习与娱乐可同时有效；新分类汇总与电脑总量非互斥，不画加和总量堆叠图。

Chrome `presentationKind=contentBased` 是展示属性，不改变旧 classification/quotaBucket/App Policy。原独立应用统计和配额仍可查询。两套页面按需加载新视图、明细分页、缓存按来源版本有界复用；失败只影响统一视图，不阻塞设备管理。当前任务不新增终端计算/上传，不发布；可信设备关联若现有云端事实不足，明确登记缺口，不按显示名、同 Child 或时间接近自动建关系。

公共入口为 `GET /profiles/:childId/computer-usage/v1`，Runtime 的 `GET /v2/module/computer-usage` 只代理相同结果。查询使用北京时间 `from/to`（最多七天）、不透明 `computer`、`detail=summary|timeline|products`、`revision/offset/limit`（最多100条）；Chrome 内容明细使用响应内不透明 `product` 键。汇总不发送完整产品或时间线，明细从首请求起锁定汇总版本。Chrome 明细区分容器、内容和容器外独立网页；没有可信电脑对应时不建立上下级关系。请求／响应 schema 为 `computer-usage-v1.schema.json`。
### 复合页面证据共享契约来源

`contracts/composite-page-evidence/v1.js` 是网页与 Guardian 共用的纯 JavaScript 规范源，维护身份、裁剪脱敏、摘要与保留期，不含网页计时或配额逻辑。原草稿行为原样提取不代表完整隐私验收通过。Worker 从根契约导入；扩展因 unpacked 根边界，使用由控件任务生成的 `extension/core/generated/composite-page-evidence-v1.js` 字节相同副本，禁止手工维护分叉。构建/CI 用检查器强制核对；尚未接入终端时不得宣称已实现消费者一致。云端候选筛选、阈值、页面归属和人工建议留在云端服务；Native 不消费此协议，不提升 App Runtime 契约版本。正文中既有更广泛隐私与发布门禁继续有效。

### 日周休息软配额云端配置（D-107）

restConfig.weeklyFirstReminderMinutes为null或1–10080整数分钟，缺省840；日字段独立缺省120，repeatReminderMinutes为两周期共用间隔。Pages自主度以小时/分钟编辑周值，保持expectedVersion写保护和导入差异逐项选择；读取缺省值不写回生产配置。Worker新档案默认含840，旧档案由消费端缺省解释。此项不是硬配额，不改timeQuota/账本；终端展示和触发由所属任务实现，发布等待联合验证。

> App Runtime 的独立模块设计位于 `app-runtime-management/docs/DESIGN.md`。本文件只维护 Guardian adapter、主控制台 launch 入口和 `@timeonchrome/app-runtime-contracts` 兼容边界。

版本：1.7.34
更新：2026-09-22

---

## 1. 架构概览

### 应用独立用量读取（2026-09-26）

BrowserBridge v3 增量能力 `application-usage-read`：`application/getApplicationUsage` 请求北京时间起止日期（含首尾，最多 7 天）及分页 offset。Native Host 仍只转发；Service 用已验证连接进程 SID 派生本机用户，不接受请求指定用户/孩子/机器。响应只含日/小时主用量、分类、应用展示名及不透明行键、已结算截止时间和完整性；应用行每页 100、最大消息 256KiB。扩展仅在应用页签可见时请求，缓存 30 秒，显式刷新绕过缓存；所有请求复用串行 Native Messaging 队列，既有健康与网页快照仍运行。缺 Host/旧能力/服务不可用不是零用量。

Service 首次页在 SQLite 只读事务中生成 revision 并冻结最多 20,000 条原账的快照；超过读范围标记不完整，不伪称全部统计。后续页要求相同 expectedRevision，冲突仅重读一次；进程内分页缓存有界，既不复制云端原账也不写库。扩展完整验证所有页后原子替换内存，旧计算时间不得覆盖新快照。主区间 wall/monotonic 不一致或同会话跨 clockEpoch 回拨重叠时，对受影响日期 fail-closed；可分配的历史仍保留。能力重连通知只唤醒已可见应用页，非数据推送/控制协议。日期导航只在应用页按北京时间计算，网页/媒体原规则不变。

应用主用量源为 Service 已持久化不可变账本，不含开放 lane。总量和每应用/分类分别取主区间并集，不用应用明细相加冒充总量；保留毫秒。日期/小时按 Asia/Shanghai；wall/monotonic 不一致且不能准确分配的日期标记不完整，不按比例猜测。历史分类快照缺失显示“历史分类未知”，不套当前策略。该接口不改网页 V2、媒体或应用原账，不查询共享影子、不形成共享配额、不上传云端。

### BrowserBridge v3 本周缺失区间只读恢复（2026-09-26，PO 单项批准）

`GET /device/usage-interval-evidence/v3?date=YYYY-MM-DD&offset=0&anchorAtMs=...` 仅使用现有设备 token，归属由服务端推导，日期限制在当前北京时间周。每页最多 100 条，固定 anchor 下返回原 ACTIVE 起止时间、原始整数秒和已有修正后的配额桶；响应不含域名、标题、路径、账号或设备标识。分页版本改变、数据读取失败或证据不合法时拒绝恢复。

扩展只为缺失本地区间的日期请求；证据保存在本次投影的临时内存层，沿用现有区间整数秒切分并与 V2 权威总秒、逐桶秒数严格相等。缺页、重叠、归属冲突或秒数不符仍不发布共享结果，不回写原账、不改变统计/配额/修正语义，不猜测旧应用会话。本轮不发布托管扩展或原生包。

### 1.0.2 TimeOnChrome Native Host 与 Runtime 共享配额影子边界

预期使用本地桥的 managed/开发候选通过 `com.timeonchrome.nativehost` 连接 TimeWhereNative-owned `TimeOnChrome.NativeHost.exe`；D-061 的旧 ID `com.timeonchrome.guardian` 只保留兼容 manifest。Host 不拥有产品逻辑、凭据或账本，只做 framing/pipe 转发。当前 v3 传递健康消息及扩展已经计算完成的权威日统计快照和最小区间证据，不再传递原网页 Segment；连接旧 Service 时仅保留健康通信，不回退到 v2 镜像。任何本地桥失败均 fail open，不影响网页落账、拦截、云同步或现行配额。

共享配额首阶段只由 RuntimeService 生成本地影子结果，不替换现有 Chrome/App Runtime 配额。网页与应用原始账保持独立不可变；裁决规则以 D-103、ARM-D-026 与 Runtime 技术设计为准；D-104 规定仅本机源码迁入 TimeWhereNative，云端及 contracts 继续留仓。根仓侧不得导入 Runtime Host/Service 源码。

本地未打包联调使用 `native-host-development`，并与正式 managed activation 分离。只有 marker、稳定扩展 ID 和 Chrome 自报 `installType=development` 同时成立时，扩展才允许 Native Messaging；运行激活继续使用普通用户同意和既有本地绑定。staging 工具必须从已批准候选 manifest 读取公开 `key`、校验派生 ID 并写入开发目录，不得输出 key 内容；缺少稳定 key 时拒绝生成。该候选禁止打包、签名、进入更新源或生产渠道。正式 managed 包仍只接受 Chrome managed policy，普通/CWS 包仍不包含 Native Messaging。

BrowserBridge v2 将通信拆成两个可靠性通道：`health/heartbeat|probe` 为 best-effort，不持久补发；`ledger/settledUsageSegments` 为 durable at-least-once，以权威 `usage_segments_v1` 的稳定字段重建 payload、最多 100 条分批并逐项 ACK。扩展只保存 bridge epoch、启用时间、日期 digest、待处理日期和 Segment ID，不复制完整账本；启动、每小时、Host 重连和失败后对账，启用前历史不回填。RuntimeService 在独立 v2 pipe 中以 Segment ID 幂等接收，镜像与影子脏区间同一 SQLite 事务提交后才 ACK，投影异步合并重建。v1 保留一个兼容周期，Service 通过 v1 heartbeat 声明能力后新扩展才切换 v2。

以上 v2 描述仅为历史协议兼容记录，不是新版扩展的发送模式。v3 的网页权威秒数由扩展提供，Service 不重新结算网页，仅核对守恒并计算可证明的应用重叠。应用/共享规范值保留整数毫秒；证据不足不输出共享总量。Host 后来安装时同步当前周，不按安装时间清零。协议夹具由扩展真实 V2/v3 builder 生成，Native 仅消费固定 JSON 数据，双方不跨仓导入源码。

### 未识别页面防错与显示边界（2026-09-15）

- 已复现：signal 合并给纯 idle 事件增加自有值为 `undefined` 的 URL/domain 字段，context 将其误认为新页面观察，导致已知 Bilibili 归属变成未知占位标识。
- 包 A/B/C 涉及事件形状、开账识别和后续分类快照，仍等待 D-076 单项批准；本轮不改计时、原始分段、扣费或历史事实。
- 包 D 仅增加只读展示元数据：`__unknown__`、`unknown-page.chrome-local` 显示为“未识别页面”，不是普通待归类网站；保留存储分类及所有时长。
- 展开显示内部标识、已有统计的首末观察时间（北京时间）及今日/本周/当前范围实际配额桶贡献。桶缺失显示未知，不用内容分类猜测扣费桶；媒体明细不描述为网页扣费。
- 占位标识不提供分类操作，不将其“复合分类 + Rest 桶”展示为借用路由证据。各层总量、图表历史分类和配额计算均保持不变；真实浏览器与原始账本验收前 P0 保持未解决。

### 使用明细只读说明修订（2026-09-15）

- 展示层单独收集既有统计的历史分类与实际配额桶，按当前范围/今日/本周保留交叉贡献。仅新增临时只读展示元数据，不写入存储、公开接口或单账，不改变记账聚合及配额算法。
- 旧 domain fallback 的 mode 与由当前配置生成的分类不能作为历史扣费/分类证据；显式字段缺失时展示未知。借用量只统计显式 composite/pending_composite 与 rest 桶的 active 网页贡献，媒体/PiP 不参与说明。
- 用量说明替代实时含义模糊的状态；未知页始终不描述为借用，媒体始终明确独立于网页配额。既有日志和未知归属 A/B/C 不在本次实施范围。

### 1.0 独立 Native App Control

macOS Native App Control 的权威技术设计位于 `docs/specs/SPEC-003-MACOS-NATIVE-APP-CONTROL-TECHNICAL-DESIGN.md`。该模块部署为独立 Worker 与独立 D1，不属于 Chrome Extension、`guardian-api` 设备同步或 `guardian-db` 业务数据。主系统仅提供 Account/Child 的短期 ES256 身份桥和 Child 删除 lifecycle outbox；Pages 通过 `/native-apps/` 提供独立控制台。现有 Native Worker、D1、secrets 和 Santa 协议属于已部署生产能力，常规 Chrome/Pages 发布不得因“本轮不改 Native 基础设施”而移除既有页面或 Guardian bridge。

Native App 预配置后端增加来源无关的 `GET /native/v1/preconfigurations` 和 `POST /native/v1/preconfigurations/import`（目标 Child ID 二次确认）。迁移 004 为旧预定义表补充 `desired_state`，旧 21 条默认为 `BLOCK`；新来源可保存 `BLOCK` 或仅供识别的 `CANDIDATE`，只有前者参与 Santa 规则编译。生产迁移、Native Worker 和预配置 UI 已部署；视觉验收由 Product Owner 在上线后执行，尚未记为通过。跨 Child 复制属于后续包。

Santa 应用阻止策略归一：每个 Child 的顶层应用只有一份可编辑阻止策略；已匹配预配置是来源证据，手动 `DIRECT` 应用策略接管主程序与已核验组件身份，不再叠加预配置全天阻止。发布者 TeamID 阻止仍独立，其时段与应用时段取阻止并集且须在 UI 显示。应用策略支持全天或多条每日时段（含跨午夜），零条时段无效；旧单时段经独立 Native D1 migration 转换。普通同步和 Santa CEL 使用同一接管关系与有效时段；不修改 Chrome 网页账本或 Santa 安装方式。

### 1.0.1 App Runtime Guardian 集成边界

App Runtime 的产品、Agent、Worker/D1/R2、独立 Pages、安装器和发布事实只在 `app-runtime-management/docs/` 维护。TimeOnChrome 侧仅保留 Guardian 身份桥、Child lifecycle、主控制台 SSO launch 入口和 `@timeonchrome/app-runtime-contracts` 固定版本兼容。旧 `/app-runtime/` 路径回到主控制台 launch 流程，不再承载或复制 Runtime 静态文件。

Guardian 以当前账户会话签发 60 秒、单次、固定 audience 的 ES256 ticket；Runtime Worker 兑换为 8 小时不可续期的哈希 browser session。SSO 密钥与 Santa、机器 token、module/lifecycle key 独立。Guardian migration 保留所有生产使用过的原文件名，未来编号从 `030` 开始；远端追踪缺失时禁止自动全量 apply。

### 1.1 系统架构

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
│  │  - 模块化架构 (ES Module)                           │     │
│  │  - Chrome listener wiring + timing dispatcher       │     │
│  │  - foreground / media / checkpoint 分轨执行          │     │
│  │  - Lifecycle recovery                                │     │
│  │  - 云同步 (只读拉取)                                │     │
│  └────────────────────────────────────────────────────┘     │
│         ▲                                                   │
│         │ sendMessage (activity / media state signals)       │
│  ┌──────┴──────────────────────────┐                        │
│  │  content.js（每个 Tab 注入）     │                        │
│  │  - 用户交互检测（鼠标/键盘）     │                        │
│  │  - 媒体播放检测（AudioContext）  │                        │
│  │  - 活动状态信号发送              │                        │
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
│  GET/POST /composite-sessions  待归类会话审核                  │
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

### 1.2 模块化架构（Service Worker 内部）

```
┌──────────────────────────────────────────────────────────────┐
│  background.js (wiring 入口)                                  │
│  - SW 生命周期 (onStartup / onInstalled)                      │
│  - Chrome listener 注册                                       │
│  - initSignal(dispatchTimingSignal)                           │
│  - Alarm 调度 → checkpoint scheduler                          │
│  - 消息路由 (message-router.js)                               │
└──────────┬───────────────────────────────────────────────────┘
           │
           ▼
┌──────────────────────────────────────────────────────────────┐
│  core/ timing orchestration                                   │
│                                                              │
│  signal.js                Chrome signal normalize/batch       │
│  timing-dispatcher.js     fan-out 到 foreground/media         │
│  foreground-timing.js     前台网页 session/usage segments      │
│  media-timing.js          媒体 facts/sessions/segments         │
│  checkpoint-scheduler.js  foreground/media checkpoint 分轨     │
└──────────┬───────────────────────────────────────────────────┘
           │
           ▼
┌──────────────────────────────────────────────────────────────┐
│  runtime/  (状态管理层 — 有副作用)                             │
│                                                              │
│  session.js     当前会话快照 (transition/checkpoint settlement)│
│  media-session.js 本地媒体多路账本                             │
│  recovery.js    lifecycle recovery (详见 STATS_STORAGE_FOUNDATION)│
└──────────────────────────────────────────────────────────────┘
           │
           ▼
┌──────────────────────────────────────────────────────────────┐
│  product/  (业务逻辑层)                                       │
│                                                              │
│  mode-service.js Mode event/decision + mode truth             │
│  quota.js       quotaState 计算/保存 + 借用                    │
│  mode-effects.js Reminder / notice / mode execution effects   │
│  interceptor.js declarative unsafe rules + notice helpers      │
│  analytics.js   统计查询 adapter                              │
│  stats/managed-statistics.js 统计/配额 usage view             │
└──────────────────────────────────────────────────────────────┘
           │
           ▼
┌──────────────────────────────────────────────────────────────┐
│  infra/  (基础设施层)                                         │
│                                                              │
│  storage.js     配置/会话存储 (DEFAULT_CONFIG, getConfig)     │
│  cloud-sync.js  云同步 + 心跳 (pullCloudConfig, sendHeartbeat)│
└──────────────────────────────────────────────────────────────┘
```

Foreground 计时与 media 计时是两条账本链路。Chrome 原始事件可以被 dispatcher fan-out 到两条链路，但 foreground 模块不得写媒体账本，media 模块不得写 `usage_segments_v1`。`periodicCheckpoint` 由同一个 alarm 触发，但 foreground checkpoint 与 media checkpoint 独立 try/catch、独立 trace。

**网页落账硬闸门与媒体证据边界（D-068 / D-069）：**

- 网页账本是配额、Rest 提醒和使用判断的金标准；修改网页 `ACTIVE` 开始、停止、续账、idle、焦点、checkpoint 或结算边界前，必须执行 D-068 的历史行为审计、前后矩阵、风险分析和 Product Owner 单项确认。该语义不得作为普通 bugfix、重构或媒体分类修复的附带改动。
- D-070 规定任何落账准确性风险自动定级为 P0：范围包括网页/媒体原始分段的时长和归属、上传结算，以及日/小时/目标物化。根因未明、影响秒数较小、仅影响特殊站点或单台设备时均不得降级；原始账本与物化统计一致，只能证明物化链路一致，不能证明终端产生的原始事实正确。
- Content 强媒体的前台资格为 active tab、窗口未最小化、页面 visible、tab/window/domain 与开放 session 一致，不要求 Chrome 窗口获得输入焦点。视频必须播放中且有视口内可见 DOM `video`；音频必须来自 Content 的真实 `audio`/AudioContext 且明确 audible。事实每 30 秒重申，超过 90 秒失效。
- Chrome 失焦时，Content 强媒体只能延续同一已有网页 ACTIVE session，不得在失焦状态新开网页账。系统 idle 时同一新鲜强证据仍可续账；锁屏、最小化、隐藏、暂停、结束、后台标签、身份不匹配或证据过期立即关闭。
- `chrome.tabs.Tab.audible` 是弱音频证据，只在没有新鲜 Content 证据时形成媒体账。失焦弱 audible 只能为 `backgroundAudio`，不得覆盖视频类型、关闭仍有效的视频、补偿网页 session 或参与网页配额。
- Content 媒体发现覆盖所有注入 frame 及可访问的 open shadow root；只采集播放、媒体类型、PiP、audible、可见数量和必要的 tab/window 元数据，不采集 URL 正文、标题或页面文本。
- 复杂多 frame 页面必须保留并聚合 Content 强证据：`visibleMediaCount` 必须贯通 Content 消息、signal 转换、媒体 fact 和 checkpoint；checkpoint 按明确 frame ID 查询所有已注入 frame，视频证据优先于音频，不得依赖无 frame 定位消息返回的任意 frame 响应。聚合结果作为 Content 强证据写入当前 tab，不读取或保存 frame URL、标题和页面正文。
- 标签激活和窗口焦点变化后，开放媒体 session 必须按证据等级、active 和 minimized 状态重新分类；Content 强媒体在失焦但未最小化时保持前台媒体，弱 audible 转为后台媒体。窗口最小化/恢复即使没有再次发出 focus 事件，也必须向网页 timing dispatcher 发送真实窗口状态；恢复后另走普通 `ACCESS_OBSERVED` 做访问策略复核。小于 1 秒、最终 `durationSeconds=0` 的瞬时媒体 session 不写入原始媒体账本。
- 已知限制：Canvas/WebRTC 流游戏的 DOM 媒体结构可能随会话或渲染阶段变化，不能仅凭站点类型推断证据是否存在。2026-08-29 对 `cg.163.com/run.html` 的 1.7.27 探针复验显示：当前会话顶层 frame 持续存在一个 DOM `video` 和一条 live MediaStream 视频轨道；失焦但未最小化且停止输入后，`documentVisible=1`、视频播放/可见/解码帧推进均持续成立。对应网页账为 05:29:57–05:31:38（101 秒），媒体账为 `foregroundVideo` 05:29:57–05:31:51（114 秒）；最小化时媒体切为 `backgroundVideo` 且网页未继续新开账。该结果证明 cg 当前会话能提供普通 DOM 强视频证据，不需要凭站点类型直接引入 Canvas 专用强证据。
- **P0 待定位异常：**上述失焦网页分段在 05:31:38 以 `endReason=idleStateChanged` 结束，但探针在 05:31:38 和 05:31:48 仍连续显示页面可见、DOM 视频播放/可见、解码帧推进和 live MediaStream，前台视频媒体账也延续到 05:31:51。现有证据只能确认“网页结束边界与强媒体证据不一致”，不能确认该事件是 `idle -> active` 还是 `active -> idle`，也不能确认由其他应用输入触发。候选原因包括 idle 信号方向、活动 tab/window 身份变化、Content snapshot 聚合失败或并发边界覆盖；必须增加方向、tab/window 和媒体查询结果诊断后才能确定根因。该问题直接影响网页金标准，按 D-070 在根因未明期间持续保持 P0；修复前还必须按 D-068 单独审计和确认，不得混入探针实现。
- 后续流游戏模型必须限定到显式配置站点，并同时要求 active tab 与 focused window；候选信号可包含 Canvas/WebRTC 活跃、Pointer Lock、Gamepad 和页面交互心跳，但普通 Canvas 动画、后台声音或单独 audible 不得成为网页续账依据。
- 在决定流游戏强证据模型前，允许使用诊断专用 `stream_game_probe_v1` 采样显式测试站点。探针只记录 DOM video/audio/canvas 数量、播放/可见/隐藏状态、MediaStream live track 数、解码帧是否推进、Fullscreen、Pointer Lock、近期输入布尔值及页面可见性；不得读取或保存像素、URL、查询参数、标题、按键、文本或游戏内容。探针只写有界 `chrome.storage.session`，最多 60 条，不进入 timing dispatcher、媒体 fact、账本、配额或云端同步。
- 同次复验的云端只读对账显示，`cg.163.com` 当日网页原始/日/小时/目标统计均为 2188 秒，媒体原始/日/小时统计均为 1961 秒；上传和统计物化一致，但一致地反映了上述终端少记边界。
- **已知限制：**Chrome API 的 `focused=false` 不能判断窗口被其他应用部分或完全遮挡。D-069 采用原产品的 active-tab + non-minimized + visible + fresh Content evidence 容错，因此完全遮挡但仍播放的强媒体可能多记；这项风险必须通过真实账本持续观察，不得以流游戏强证据模型宣称解决。

### 1.3 数据流方向

```
Chrome/content signal
       │
       ▼
core/signal.js
       │
       ▼
core/timing-dispatcher.js
       ├── foreground-timing.js → runtime/session.js → usage_segments_v1 + daily/hourly usage indexes
       └── media-timing.js      → runtime/media-session.js → media_segments_v1 + daily/hourly media indexes
```

**严格单向依赖，禁止循环引用。**

计时落账、媒体分轨、checkpoint、recovery、segment schema 的正式口径见 `docs/STATS_STORAGE_FOUNDATION.md`。

### 1.3.1 Timing trace stats verification 最小验证

- 现有 timing trace diagnostics 继续保持诊断用途，不改变计时产品语义。
- E2E 通过 debug/test-only 入口调用 `handleMessage({ type: 'GET_STATS' })` 触发真实统计读取链路：
  `message-router -> getTodayStats -> event-log aggregate -> stats_calculated trace`。
- 验证明确分为三类，避免把人工或受控数据夸大为完整真实计时准确性：
  1. **real pipeline non-active check**：使用真实页面动作产生的 trace 与本地 durable segments，验证 `signal -> dispatcher -> foreground-timing -> session -> usage_segments -> stats` 链路存在，且 Playwright/OS focus 下产生的真实 IDLE/PASSIVE 闭合片段不会污染 ACTIVE stats。该检查验证 pipeline 到 stats 的非活跃状态口径，不验证真实浏览器 ACTIVE 计时准确性。
  2. **controlled ACTIVE pipeline check**：通过 debug/test-only 受控输入构造多段、多 domain ACTIVE snapshot，并用测试专用 `_debugNow` 将现有 `Date.now()` 锚定到 stats 当天窗口；但仍走现有 `dispatchTimingSignal -> foreground-timing -> transitionStateAt -> usage_segments -> stats` 路径，不直接写 `usage_segments_v1`。该检查验证受控 ACTIVE 输入下 resolver/session/segment/stats 可以形成可对账闭环，覆盖多段累加、domain 分桶、非 ACTIVE 不计入，不验证 OS focus 或 `chrome.idle` 自动化准确性。
  3. **synthetic aggregation baseline**：追加测试专用闭合 ACTIVE segment，只证明 `usage_segments -> stats` 聚合可把 injected ACTIVE 片段计算为预期秒数，不代表真实浏览器计时准确。
- timing trace / stats E2E 的 fresh profile 会在测试初始化阶段写入现有正式字段 `guardian_config.mode = 'rest'` 与 `guardian_session.currentMode = 'rest'`，避免学习模式拦截影响页面打开和 event-log 生成；这不改变正式产品默认模式。
- 不处理 OS focus 自动化、`chrome.idle` 自动化，也不引入新的访问策略。

### 1.3.2 Timing settlement 主文档

计时落账、`periodicCheckpoint`、popup 落账、recovery 生命周期容错边界、`heartbeat` 废弃语义、`usage_segments_v1` 本地/云端 schema contract，统一维护在 `docs/STATS_STORAGE_FOUNDATION.md`。Recovery 是生命周期残留容错机制，不是正常计时落账机制。

本文件只保留系统架构与测试分级说明；不要在这里新增或复制计时落账规则，避免与 Stats Storage Foundation 产生双份口径。

### 1.3.3 Real Chrome ACTIVE calibration 手工校准

- 真实 Chrome ACTIVE 校准只用于手工诊断前台 Chrome 使用是否能产生 ACTIVE 计时，不扩展 synthetic / controlled / recovery 测试。
- debug-only 入口允许校准前清空 timing trace、focus ledger、`event_log_v1`、`session_v1` 与旧 stats cache，设置 rest mode，并导出 trace / event-log / session / stats / focus ledger 校准包。
- Windows 本地可用 `node tests/manual/real-active-calibration-windows.js --a 6 --b 3 --blur 2` 做短时 headed Chrome 校准；runner 只调用现有 debug-only 入口并输出最小诊断结果。
- 校准判断边界：该流程验证真实 Chrome 前台、失焦、usage segment、stats 的端到端观测结果；若没有 ACTIVE，按 `Chrome event -> signal -> dispatcher -> foreground-timing -> session -> usage segment -> stats` 顺序定位第一断裂层，不改变 OS focus、`chrome.idle` 或产品计时语义。

### 1.3.4 跨自然日计时口径

- “今日时长”应按用户本地自然日统计。
- 若 `event_log_v1` 中一个计时区间跨越午夜，例如 `23:59:50 -> 00:00:10`，统计时应按自然日边界切分，而不是全算入 START 日或 END 日。
- 该口径适用于普通前台 ACTIVE 计时、stats 聚合、badge 今日时长、配额检查与后续报表。
- `core/aggregate.js` 已按本地自然日窗口计算闭合区间 overlap；`getTodayStats`、`getStatsRange` 与 badge 今日时长通过该聚合层继承跨日切分口径。

### 1.3.6 Sleep / Wake / Offline Gate Binding Preflight

- `tests/system/sleep-wake-gate/` 下的 runner 在执行任何 Gate 场景前，必须通过 Service Worker 读取 `chrome.storage.local` 中的 `cloud_device_token`、`cloud_profile_id`、`guardian_config`，判断扩展是否已完成设备绑定。
- **判定标准**：`deviceToken` 存在且非空，`profileId` 存在且非空 → `bound = true`。
- **dry-run**：未绑定状态仍可产生 PASS/PARTIAL，因为 dry-run 只验证基础设施（event-log、session、trace 链路）。报告必须明确提示“未绑定状态，不能用于正式 Sleep/Restart Gate 判定”。
- **chrome-restart / sleep-wake / network-offline**：这些场景在未绑定状态下必须拒绝运行，抛出错误并生成 FAIL 报告。不允许自动云绑定或 D1 写操作。
- **报告格式**：JSON 报告必须包含 `bindingPreflight` 对象（含 `bound`、`deviceTokenPresent`、`profileIdPresent`、`configAvailable`、`monitoringEnabled`、`mode`）；Markdown 报告必须包含“绑定状态检查”章节，并根据 `bound` 值显示对应提示文案。
- **实现位置**：`tests/system/sleep-wake-gate/lib/extractors.js` 提供 `extractBindingStatus(sw)`；各 scenario 在启动后调用并写入报告；`lib/reporters.js` 负责渲染 Markdown。

#### 1.3.6.1 Fixed Test Account Setup（可复用绑定环境）

- 为避免每次 runner 启动都产生全新未绑定实例，使用固定长期测试账号/孩子 profile/设备绑定。
- **Setup 脚本**：`tests/system/sleep-wake-gate/scripts/setup-bound-profile.js`
  - Idempotent：登录已有账号 → 查找/复用 profile → 删除同名旧设备 → 重新 bind → 获取 device_token
  - 必须带 `--allow-cloud-mutation` 才允许云端写操作；无此 flag 时拒绝运行
  - 凭证来源：环境变量 `TIMEONCHROME_TEST_EMAIL` / `TIMEONCHROME_TEST_PASSWORD`，或 CLI `--email` / `--password`
  - 启动 Chrome 到固定 `userDataDir`，在 Service Worker 中写入 `cloud_device_token`、`cloud_profile_id`、`guardian_config`（完整云端配置）
  - 写入后强制 flush（`storage.local.get` + 延时），关闭 Chrome 保留目录
  - 重新启动验证 `extractBindingStatus(sw).bound === true`
- **Runner 复用**：通过 `--user-data-dir=<path>` 指定同一目录；`launchExtensionContext(userDataDir, clean=false)` 避免清理已绑定状态
- **默认路径**：`test-results/sleep-wake-gate/bound-profile`（已被 `.gitignore` 忽略）
- **云端数据**：账号 `william.xia.cn+timeonchrome-gate@gmail.com`、profile `Gate Test Child`、device `Gate Runner Windows Chrome`

### 1.3.7 测试分级：回归测试 vs 发布验收测试

- **回归测试（Regression Tests）**：每次代码修改后自动执行，验证未引入回归。
  - 包含：unit tests、API integration tests、E2E tests、`dry-run` scenario、`chrome-restart` scenario
  - 执行命令：`node tests/run-all.js`
  - 要求：全部通过才能 push

- **发布验收测试（Release Acceptance Tests）**：仅在正式发布前由用户显式提出才执行，验证真实环境行为。
  - 包含：`sleep-wake` scenario（Windows OS 真实睡眠/人工唤醒）
  - 执行方式：手动触发，需要操作者手动唤醒系统
  - 要求：不阻塞日常开发，不作为 CI/CD 的一部分
  - 触发命令：`node tests/system/sleep-wake-gate/runner.js --scenario=sleep-wake --allowSystemSleep`

- **sleep-wake 场景设计原则**：
  - Sleep 触发：runner 自动执行 `rundll32 powrprof.dll,SetSuspendState`（普通权限即可）
  - Wake 方式：人工唤醒（当前环境无管理员权限设置 Windows Wake-To-Run）
  - 睡眠时长：由操作者决定（10s ~ 120s），不固定，不作为 pass/fail 条件
  - 核心验证：唤醒后 Chrome / SW 可访问、event-log 可读、扩展能继续产生事件
  - `recover()` 观察：仅在 extension lifecycle boundary 后验证 recover() 处理残存 open session；普通 SW idle restart 不作为 recovery 触发条件

### 1.3.5 凌晨休息时间限制（后续产品设计）

- 后续需要支持配置“凌晨不可用于休息时间”的时段策略，用于防止熬夜玩游戏。
- 该能力属于内容策略层：时间段主要按“当前使用内容需要进入哪类使用性质”判断，而不是按最终扣除的配额来源判断。受限娱乐网站等休息性质内容发生在禁止休息时段时，应触发相应限制或提醒；待归类/复合对象因待归类配额耗尽而借用休息配额时，使用性质仍是待归类，不因此自动变成休息性质。
- 该能力不改变底层计时语义：计时仍记录真实使用，策略层判断该使用性质是否允许在当前时段发生；配额借用只说明扣除来源，不改变使用性质。
- 当前计时准确性收口不实现该功能，仅记录为后续产品设计项。

### 1.3.7 原始用量统计与分类解释分离原则（Raw Stats vs Classification Separation）

**核心原则：原始用量数据与分类/解释必须分离存储和计算。**

#### 1.3.7.1 三层区分

| 层 | 内容 | 存储位置 | 可变性 |
|---|------|---------|--------|
| **原始用量事实（Raw Usage Facts）** | domain、managedTarget 快照、active/background/PiP 时长、时间戳 | `usage_segments_v1`；`daily_usage_stats_v1` / `hourly_usage_stats_v1` 是物化索引 | segment append-only；索引可重建 |
| **模式上下文（Mode Context）** | 该用量发生在哪个模式下的按模式时长拆解 | `usage_segments_v1` 与 daily/hourly 物化索引（与 raw facts 同层） | segment append-only；索引可重建 |
| **分类/报表解释（Classification / Report Interpretation）** | 学习时间/休息时间/待归类时间/拦截/借用/允许 | 读取时动态计算 | 随策略变更而变 |

当前实现已完成 D-045 第一阶段：普通统计和配额归属具备 `managedTarget + fallback domain` 路径，并在 `usage_segments_v1` 开账/切片时固化 target 与 quota decision 快照。`domain` 仍保留为事实、诊断和兼容字段。详见 `docs/MANAGED_TARGET_LEDGER.md`。

#### 1.3.7.2 `daily_usage_stats_v1` / `hourly_usage_stats_v1` 存储契约

`daily_usage_stats_v1` / `hourly_usage_stats_v1`（或等效的云端 `stats_v1` / `hourly_stats_v1`、`target_stats_v1` / `hourly_target_stats_v1` 表）存储**原始用量事实 + 模式上下文 + segment open 时固化的 target/quota 快照**，不在读取时重新解释历史。

`usage_segments_v1` 是 Stats Foundation 的本地事实账本。daily/hourly 都是从 segments 构建的物化索引；跨小时切分只发生在 `hourly_usage_stats_v1` 聚合层，不拆原始 segment。字段、身份解析、上传白名单、Open/Close 诊断字段与云端 ingestion schema，统一以 `docs/STATS_STORAGE_FOUNDATION.md` 为准。

**0 秒事实与小时统计自愈（D-072）：** `durationSeconds = 0` 的原始 segment 可作为恢复、边界和诊断证据保留在 `usage_segments_v1`，但它不贡献使用时长，也不得形成需要上传的 daily/hourly/target 统计行。小时上传前若发现没有正时长合法 row，必须先从原始 segment 重建该小时；重建后有正时长则正常上传，仍为 0 秒则把该小时视为合法 no-op，并清除 hourly 与 hourly-target 的 dirty/outbox/retry metadata。原始 0 秒 segment 保持不变。Worker 为旧客户端兼容：全部声明时长为 0 的小时 payload 返回 `200 + noOp`；payload 声明存在正时长却无法展开为合法 row 时继续返回校验错误，禁止把真实统计缺口静默 ACK。

**必须存储的字段（原始用量事实）：**
- `date` — 日期（YYYY-MM-DD，用户本地时区）
- `hourKey` / `hour` — 仅小时聚合使用，例如 `2026-05-21T14`
- `timezone` — 用户本地时区标识
- `domain` — 域名（归一化后）
- `activeSeconds` — 前台 ACTIVE 时长（秒）
- `backgroundMediaSeconds` — 后台媒体时长（秒）
- `pipSeconds` — PiP 模式时长（秒）

**必须存储的字段（模式上下文 — 允许存在，因为模式是运行时事实，不是分类）：**
- `activeByMode` — 按模式拆解的 ACTIVE 时长，模式值包括：
  - `study`
  - `composite`
  - `rest`
  - `locked`
  - `paused`
  - `unknown`（仅账本 fallback，不是产品模式）
- `backgroundMediaByMode` — 按模式拆解的后台媒体时长（同上模式值）
- `pipByMode` — 按模式拆解的 PiP 时长（同上模式值）
- `targets` — 并行 managedTarget 聚合。每个 row 保存 target 快照、`fallbackDomain/isFallback`、按 mode 拆解、按 `quotaBucketAtTime` 拆解，以及精确 `rows[{channel, mode, quotaBucket, durationSeconds}]`。

**可选/派生字段：**
- `totalSeconds` — 总时长（由 active/backgroundMedia/pip 求和得出，允许缓存但**不作为唯一事实源**）
- `firstSeenAt` / `lastSeenAt` / `lastUpdatedAt` — 该域名当日的访问/更新时间戳

**禁止存储的字段：**
- 网站分类标签（study site / composite site / restricted entertainment / blocked / unclassified）
- 策略决策（allowed / blocked / borrow / temporary composite / redirected）
- 解释性报表时间类型（学习时间 / 休息时间 / 待归类时间）
- AI 分类结果或内容级判断
- 完整的模式切换事件日志（mode transition event log — 属于 `event_log_v1` 的职责）

D-045 例外说明：`targetClassificationAtTime` 与 `quotaBucketAtTime` 已作为 segment open 时固化的历史事实进入 managedTarget 快照；它们不是读取时动态分类，也不得因规则变化回写历史。

**说明：**
- 按模式拆解属于**原始用量事实层**：某域名在 study 模式下产生了多少 ACTIVE 秒，这是事实，不是分类。
- 完整的事件日志（START/END 序列）属于 `event_log_v1`，不在此表。
- `daily_usage_stats_v1` / `hourly_usage_stats_v1` 存储的是**聚合后的按模式拆解**，而非逐事件记录。
- UI 读取 stats 前会通过 `FLUSH_TIME` 语义把当前 open counted session 结算到当前时间，写入 `usage_segments_v1` 并增量更新 daily/hourly 物化索引，随后以同一 state/domain/mode 从当前时间重新打开 session，避免 popup/admin 在未切 tab 前看不到实时统计。

#### 1.3.7.3 待归类时间兼容读口径

用户可见口径统一为**待归类时间**。它不是学习/休息之外的第三类最终时间，而是尚未实时或半实时归入学习时间或休息时间的过渡归因池。历史字段名 `composite` / `compositeSeconds` / `undetermined` / `undeterminedSeconds` / `dailyUndeterminedQuota` / `undeterminedLocked` 仅作为本地 legacy compatibility term 保留，不应在 popup/admin 的用户可见文案中继续显示为“综合时间”或“未归类时间”。

UI 与消息 adapter 读取待归类用量时必须使用统一口径：

```javascript
compositeSeconds = readCompositeSeconds(statsLike)
```

读取优先级：
1. 若新 shape 明确提供 `compositeSeconds`，使用该值；
2. 否则兼容旧 shape 的 `undeterminedSeconds`；
3. 对仅有 domain stats 的旧数据，按当前 `compositeList` / 临时待归类权限分类求和；
4. 不把同一秒数同时展示为“待归类时间”和“未归类时间”；未归类网站是网站状态，待归类时间是时间归因状态，二者不等价。

配额配置在代码层可继续读取 `dailyUndeterminedQuota` / `undeterminedLocked` 以兼容现有存储和 reminder reason，但用户可见标签应显示为“待归类时间/待归类配额”。本规则不做历史数据迁移、不改云端接口、不改变网站分类策略。未来归因层应尽量将待归类时间实时或半实时回填到学习时间或休息时间；无法可靠判断时才保留 pending。

使用分析展示层必须区分“访问对象性质”和“配额扣除来源”：当 managed target row 带有 `targetClassificationAtTime` 时，主图、主分类和对象列表优先按该字段解释为学习 / 待归类 / 休息；`quotaBucketAtTime` 仅表示扣了哪个配额。待归类对象在待归类配额耗尽后借用休息配额时，仍显示为待归类时间，并在状态或详情中标注“借用休息配额”，不得在主图中直接显示为普通休息时间。本规则只影响读取展示，不回写历史 segment，不改变底层落账和上传结构。时间使用性质只跟“用来做什么 / 访问对象是什么”有关，与配额来源无关；配额来源可以被借用，但不改变学习、待归类、休息三类展示口径。

运行时生成 `targetClassificationAtTime` 前必须先应用保护性父域规则：如果受限娱乐 / 黑名单父域已经命中，历史 host/subdomain pending 记录不能把该访问对象改解释为 `pending_composite`。YouTube 等特殊网站的具体视频、播放列表、频道是例外，仍可在家长审批前作为 pending 特殊对象进入待归类时间。

域名重复、冲突、申请、审批和 managed target attribution 必须使用统一主站身份 `canonicalSiteIdentityHost()`：`www.` 与 `m.` 开头的主站入口归并到 bare host，路径 URL 先取 host 再归并。该 identity 只用于判断主站入口是否等价，不把 `docs.example.com` 这类独立服务子域折叠到 `example.com`。

#### 1.3.7.4 分类计算层（Classification Layer）

所有分类、解释和报表必须**在读取时动态计算**，计算输入包括：

1. **原始用量数据**：`usage_segments_v1` 事实账本，以及 `daily_usage_stats_v1` / `hourly_usage_stats_v1` 中的 raw facts + mode context
2. **网站访问策略**：`SITE_ACCESS_POLICY.md` 定义的五类分类规则
3. **系统配置清单**：`defaultStudyList` / `defaultCompositeList` / `defaultRestrictedEntertainmentList` / `defaultBlockedList`
4. **用户自定义清单**：`customStudyList` / `customCompositeList` / `customRestrictedEntertainmentList` / `customBlockedSites`
5. **当前模式规则**：study / composite / rest / paused 模式下的不同行为
6. **未来扩展**：AI 分类规则、URL/channel/query 级规则、用户手动分类回填

D-045 后，普通统计的主身份从 domain 分类视图升级为 managedTarget 视图。未命中显式 managedTarget 的访问仍走 domain fallback；未显式配置的普通 URL 不得被保存为 target。

**计算示例（使用通用域名，不绑定特定分类）：**
```
给定 raw stat:
  { date: '2026-05-06', domain: 'example.com',
    activeSeconds: 1800, backgroundMediaSeconds: 600, pipSeconds: 0,
    activeByMode: { rest: 1800 } }

读取时动态计算（假设 example.com 属于某个受限娱乐清单）:
  - 查 SITE_ACCESS_POLICY.md 分类规则 → 确定 site category
  - 结合 activeByMode.rest → 该用量发生在 rest 模式下
  - 结合分类规则 + 模式规则 → 计算结果
  - 输出：具体报表时间类型（学习/休息/待归类）+ 配额消耗

关键：策略变更时，同样的 raw stats 可以产生不同的分类结果，
       因为分类是在读取时计算的，不在写入时固化。
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
  // effective*List = mergeWithDefaults(custom*List, default*Sites)
  // default*Sites 优先来自云端 system_access_config_v1；workers/config/site-access-defaults.json 仅作为初始化/fallback
  studyList: [],                     // 学习网站 effective（系统配置 + 家长自定义合并）
  customStudyList: [                 // 家长自定义学习网站（source-of-truth）
    'keystoneacademy.cn',
    'powerschool.keystoneacademy.cn',
    'managebac.cn',
    'reach.cloud',
    'schoolsbuddy.cn',
    'afficienta.com',
  ],
  compositeList: [],                 // 复合网站 effective（defaultCompositeSites + defaultUserCompositeSites + 家长自定义合并，运行时兼容）
  customCompositeList: [],           // 家长自定义复合网站（source-of-truth，新增）
  unsafeList: ['douyin.com', 'tiktok.com'],  // 黑名单网站 effective（系统配置 + 家长自定义合并）
  customBlockedSites: [],            // 家长自定义黑名单网站（source-of-truth）
  restrictedEntertainmentList: [],   // 受限娱乐网站 effective（系统配置 + 家长自定义合并）
  customRestrictedEntertainmentList: [], // 家长自定义受限娱乐网站（source-of-truth）

  // 每日时间配额（分钟，0=不限）
  dailyOnlineQuota: 0,               // 总在线时长上限
  dailyStudyQuota: 0,                // 学习时长上限
  dailyRestQuota: 120,               // 休息时长上限
  dailyUndeterminedQuota: 60,        // 待归类时长上限

  // 单域名配额
  domainQuotas: {},                  // { 'domain': minutes }
  lockedDomains: [],                 // 今日已达配额的域名

  // 旧周配额（仅兼容读取，不再由每日配额自动生成）
  weeklyRestQuota: 0,

  // 当前时间配额 source-of-truth
  timeQuota: {
    daily: {
      monday: { studyMinutes: null, restMinutes: 120, compositeMinutes: 120, onlineMinutes: null },
      // tuesday-sunday 同结构
    },
    weekly: {
      restMinutes: null,             // 显式周休息上限；null=不限，0=禁止，正整数=分钟
    },
  },

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

  // 时间段管控（旧 guardian active hours，保留兼容）
  schedule: {
    enabled: false,
    days: {
      0: { enabled: true, start: '08:00', end: '21:00' },
      // 1-6 同上...
    }
  },

  // 每日时间窗口（家长控制台时间段管理，per-day source-of-truth）
  timeWindows: {
    daily: {
      monday:    { studyWindows: null, compositeWindows: null, restWindows: [{ start: '15:30', end: '24:00' }] },
      tuesday:   { studyWindows: null, compositeWindows: null, restWindows: [{ start: '15:30', end: '24:00' }] },
      wednesday: { studyWindows: null, compositeWindows: null, restWindows: [{ start: '15:30', end: '24:00' }] },
      thursday:  { studyWindows: null, compositeWindows: null, restWindows: [{ start: '15:30', end: '24:00' }] },
      friday:    { studyWindows: null, compositeWindows: null, restWindows: [{ start: '15:30', end: '24:00' }] },
      saturday:  { studyWindows: null, compositeWindows: null, restWindows: [{ start: '15:30', end: '24:00' }] },
      sunday:    { studyWindows: null, compositeWindows: null, restWindows: [{ start: '15:30', end: '24:00' }] },
    }
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

#### 时间配额规则（D-062）

- `timeQuota.daily` 是每日配额 source of truth；`studyMinutes`、`restMinutes`、`compositeMinutes`、`onlineMinutes` 均使用 `null=无限制`、`0=零分钟`、正整数为分钟上限。
- `timeQuota.weekly.restMinutes` 是唯一可配置的周累计上限。七天每日配额合计只用于 UI 展示，不得自动写入或覆盖周上限。
- 旧 `weeklyRestQuota` 仅在新字段缺失时作为兼容来源：正数映射为旧配置周上限，`0` / `null` 映射为无限制。新字段存在后，运行时不得再读取旧字段决定周限制；Worker 可从显式新字段写入 legacy 兼容镜像，但不得再由每日配额乘七生成。
- 周期固定为 profile 时区 `Asia/Shanghai` 的周一 `00:00` 至周日 `24:00`。周中修改立即包含本周已有用量，历史账本和统计不回写。
- 周用量以网页账本 `quotaBucketAtTime=rest` 为事实；复合/待归类借用 Rest 计入，媒体账本不计入。
- 每日 Rest 与每周 Rest 是并列上限，任一耗尽都会使 `restLocked=true`；`weeklyRestLocked` 只说明锁定来源。
- 每日在线总额进入 `timeQuota.daily.*.onlineMinutes` 显式显示。旧 `dailyOnlineQuota` 仅作为新字段缺失时的兼容来源。
- `PUT /profiles/:id/config` 对 `timeQuota.daily` 与 `timeQuota.weekly` 分层合并；只修改周上限时不得覆盖现有每日配置。服务端校验每日 0-1440 分钟、每周 0-10080 分钟。

#### 配额事实合成与周期边界（D-071）

- 配额日历固定使用 `Asia/Shanghai`；日键为本地自然日，周键为该日期所在周的周一。扩展不得使用 UTC `toISOString()` 生成 `/device/quota-state` 的查询日期。
- 本地 V1 网页账本负责当前设备的即时事实；云端 `target_stats_v1` 按 `profile_id + date + channel=active + quota_bucket` 汇总全部设备，负责跨设备事实。媒体账本不参与。
- 云端返回必须包含 `date`、`weekStart`、`computedAt` 及日/周用量和锁来源。扩展只接受与当前 `date`、`weekStart` 匹配的事实；跨日、跨周或缺失周期元数据的旧事实不得参与 effective lock。
- 本地事实、云端事实和 effective state 分开保存。每次评估都从当前本地账本重新计算 local state，再与日期和周起点均匹配的 cloud state 合成；禁止将上一次 effective `quotaState` 作为 local state 再次执行 `OR`，避免锁状态只能增加不能解除。
- 日/周边界处理必须清除陈旧 cloud fact，并原子重算 effective state。断网时继续使用本地事实；恢复网络后补入跨设备事实。云端落后不能解除真实本地锁，旧云端锁也不能污染新周期。
- `quotaState` 继续作为运行时 effective 兼容视图；新增内部 fact 不改变 profile API 配置 schema，也不回写历史账本。
- 诊断只记录日期、周起点、各配额桶秒数、限额、事实来源、锁来源和同步错误码，不记录域名、URL、标题或账号凭证。
- Reminder/路由必须保留原因优先级：日 Rest 耗尽、周 Rest 耗尽和 `rest_schedule_locked` 是不同事实。时间窗关闭不得显示“今天的休息时间已用完”。

#### 自主度配置与 Rest 使用检查点提醒（D-065 / D-066 / D-082）

- `restConfig.firstReminderMinutes` 表示“今日休息软限额”：`null` 表示关闭，非空值必须是 `1–1440` 的整数，默认 `120`。`restConfig.repeatReminderMinutes` 表示超额后的重复提醒间隔，必须是 `1–1440` 的整数，缺失时默认 `60`。两者均为提醒参数，不是会锁定访问的每日或每周 Rest 配额。
- `autonomyConfig.restrictedEntryConfirmationRequired` 控制现有受限内容路由在硬规则允许时是否要求完整 Reminder 确认，缺失时默认 `true`。它不新增触发场景：仅替换原本将产生 `to_rest_slide_confirm` 或受限类型 `to_rest_confirm` 的结果。关闭时直接提交到 Rest，并显示约 4 秒非阻断状态提示；已在 Rest、Rest grace、复合和未归类路由保持原样。
- `autonomyConfig.softReminderTimeoutAction` 只允许 `end_rest` / `continue`，缺失时默认 `end_rest`。`continue` 表示可见提醒 60 秒无人处理后关闭弹层、尽力恢复此前媒体，并以当前已结算 Rest 用量加重复间隔生成下一阈值；不等同于解除每日、每周或站点硬配额。
- 旧 `restConfig.reminderInterval` / `maxRestDuration` 仅保留配置兼容，不参与运行，不得迁移为 `firstReminderMinutes`。
- 提醒触发和展示读取 `getQuotaUsageView()` 的 `restSeconds` / `weekRestSeconds`；复合或待归类借用 Rest 计入，媒体账本不计入。只有当前聚焦 active tab 存在 `quotaBucketAtTime=rest` 的 ACTIVE 网页 session 时才显示；达到阈值但没有有效前台 Rest 页面时延后到下一次有效观察。
- 首次提醒 payload 使用 `reminderKind=first`、`softLimitMinutes` 和 `overageSeconds`，明确显示“已达到今日休息软限额”及设定值；滑动继续后，以确认时的今日 Rest 用量为基线，按 `repeatReminderMinutes` 再次提醒，后续 payload 使用 `reminderKind=repeat` 并显示从软限额起算的累计超额。弹窗等待时间继续进入正式网页账本，但不进入下一轮提醒间隔。每个北京时间自然日重置提醒进度。
- 修改软限额时，当日首次提醒状态重新计算；若已用量达到或超过新阈值，则在下一次有效评估触发首次提醒。修改重复间隔时，以当前已用量为新基线计算下一阈值。已经可见的活动弹层保持创建时文案和 deadline，不受中途配置变化影响。
- Content Script 使用 `<dialog>.showModal()` 形成页面内软阻断，保留网页文档、滚动和应用状态；提醒期间阻断输入并暂停可识别媒体。滑动继续移除 dialog 并尽力恢复此前播放媒体；Canvas/WebGL 游戏只保证输入阻断，不承诺冻结页面内部 JS。
- 已经显示的提醒在 60 秒响应期内不因家长调整或关闭提醒配置而被后台静默撤销，必须先由继续、结束或超时完成当前状态机；新配置从下一轮评估生效，避免页面残留无法处理的 modal。
- prompt 状态包含随机 token、dateKey、nextThresholdSeconds、shownAt、deadlineAt 和 sourceTabId，通过受预算保护的固定小对象持久化。继续、点击结束和超时结束必须按 token 幂等。Service Worker 重启、页面刷新或标签切换不得使过期 prompt 继续访问。
- `softReminderTimeoutAction=end_rest` 时，60 秒无操作与点击“结束休息”共用 Mode Service 结束路径：请求 Study 并重新检查 source tab；若 Study 不可进入或页面无法继续安全显示，终止当前 Rest 页面访问。`continue` 时，无操作按继续处理并使用 `timeout_continue` 记录，不能进入完整 Reminder。
- deadline 只能在 Content Script 返回 `visible=true` 后创建并调度；随后才允许暂停媒体。首次投递失败时只保存 `delivery_due` 状态，不启动响应倒计时，并在 `CONTENT_SCRIPT_READY` 或约 10 秒后重试一次。第二次仍失败时，`end_rest` 进入完整 Reminder，reason 固定为 `rest_usage_reminder_delivery_failed`；`continue` 记录 `delivery_failed_continue`、推进下一提醒阈值且不阻断页面。不得把不可见投递当作用户超时。
- Pages 在“自主度配置”集中编辑 `autonomyConfig` 与上述 `restConfig` 字段；“时间配额”只管理硬额度。本地 Admin 使用同名只读页展示当前效果。首版不生成提醒次数、主动结束次数或自主度评分。
- 该检查点不替换访问 Reminder：Study/Compound 打开 Restricted 且 Rest Exit Grace 已过期时仍先进入现有 Reminder 确认。


### 1.3.7.5 访问管理配置文件与系统网站配置

系统配置网站使用全局云端配置模型：

- D1 表 `system_access_config_v1` 保存 `system-access-config` 当前版本；
- Worker 读取默认清单时优先使用 D1，失败或未初始化时 fallback 到 `workers/config/site-access-defaults.json`；
- profile 配置保存、device 配置同步、导出、恢复和网站归类审批都通过统一 loader 获取系统配置；
- 访问管理配置文件区使用单一导入/导出入口，新导出统一为 `access-management-config-bundle`；
- bundle 默认包含 `userConfig` 与 `systemConfig` 两个范围；`userConfig` 代表当前 profile 的用户配置，包含网站自定义、精确规则、审核记录、配额和时间段；`systemConfig` 代表全局系统网站库和 `siteCatalog`；
- 旧 `profile-config` 和 `system-access-config` 文件仅保留导入兼容；新导出不再提供多个独立按钮；
- 系统配置导入是全局操作，不属于普通 profile restore；
- Pages 配置文件区选择文件后统一生成新增/删除/修改差异，按“用户配置 / 系统配置”分组，允许勾选差异后再应用；系统网站配置仍必须经过系统配置 preflight、管理员权限和全局影响确认。

本地 Admin 访问管理是只读视图：读取本机已同步的 `guardian_config` 与本地 `site_classification_requests_v1`，用云端控制台风格展示网站管理、时间配额、时间段管理和网站归类记录，但不写 profile config、不调用系统配置写接口、不审批归类记录。YouTube 特殊网站在本地以单一规则列表展示根域和已同步的具体对象规则；本地 Admin 不直接编辑规则，孩子仍可在 Popup 对支持的视频、播放列表、频道发起学习申请，家长在云端审批或调整后同步到本机。

- 本地访问管理只读 read model 由 Service Worker 已同步数据组成：`guardian_config` 提供配置，`cloud_quota_state_fact_v1` 提供当前北京时间日/周使用和锁定事实，`cloud_config_version` / `cloud_last_sync` 提供来源与新鲜度。Service Worker 暂时不可用时，本地只读模式可直接读取同一份 `guardian_config` 作为显示回退，但必须保留同步新鲜度提示；Admin 页面不得读取或展示 device token，也不得为了显示而调用 profile/system 配置写接口。
- 时间配额只读视图必须与云端配置语义同构：显式周 Rest 上限、软限额提醒、七天四类每日配额、七天计划合计和单站点配额均可见；周使用 fact 不是配置字段，缺失或周期不匹配时显示“等待云端用量同步”，不得回退成 0 秒。
- `cloud_last_sync` 超过三个五分钟同步周期时，本地继续显示最后一次同步配置并标记为陈旧；这只影响新鲜度提示，不改变运行时已经采用的最后有效配置。
- 时间段只读视图继续以 `timeWindows.daily` 为 source of truth，并把允许窗口的日内补集作为“锁定时段”解释展示；补集仅为 UI 派生，不写回配置、不改变 `null` / 空数组当前表示全天允许的运行语义。
- Pages 网站管理 UI 使用“管理策略目录”作为主结构，左侧按学习/复合/受限娱乐/黑名单四类显示系统配置、自定义、精确规则和已使用未归类数量，右侧按来源分组展示网站目录；
- 网站管理页内的系统配置区使用“系统网站配置-分类管理”分组：系统配置网站按 `siteCatalog.contentCategory` 展示 Qustodio 风格内容分类；系统默认网站库必须覆盖所有 `default*Sites` 的 `siteCatalog` 元数据，Worker 读取旧 D1 配置时会用 fallback catalog 补齐缺失项；没有任何目录元数据可推断的系统站点才进入“未标注分类”；
- 管理员点击系统配置网站可同时编辑内容分类和管理策略分类，保存时通过 `/system/access-management-config/v1` 更新 `siteCatalog` 并同步维护 `defaultStudySites`、`defaultCompositeSites`、`defaultUserCompositeSites`、`defaultRestrictedEntertainmentSites`、`defaultBlockedSites`；该操作全局生效，必须显示确认；
- “已使用未归类网站”来自最近 30 天 `target_stats_v1` / `usage_segments_v1` 聚合，但该聚合只作为发现和访问证据；网站归类审核流程的唯一事实是 `site_classification_requests_v1`。当前仍未归类的 stats-only 项被归类前，Pages 必须先调用 ensure 流程创建或复用一条 `recordSource: auto_unclassified_access` 的网站归类记录，再通过 request decision 写入 profile 配置；
- 已使用未归类网站与自动未归类访问记录按 canonical host 合并展示：有 request 时以 request 为主、stats 为证据；无 request 时显示为统计发现项，操作时先 ensure request。历史曾待归类但当前已归类的项仍返回给 UI 作为解释项，并标记 `historicalPending` / 当前分类，避免统计里有待归类历史但审核入口不可见；
- 用户自定义配置项移动分类只迁移 profile custom list；系统配置项移动分类必须走系统访问配置 API、管理员权限和全局影响确认。
- 网站归类动作使用统一写入前校验：家长添加、孩子申请学习归类、家长审批、Worker 设备上传都必须阻止受限娱乐/黑名单父域下新增学习/复合子域或精确 URL；运行时解析不迁移历史配置。
- Popup “申请归为学习网站”入口点击时先通过 `VALIDATE_SITE_CLASSIFICATION_REQUEST` 执行只读 dry-run 校验；校验失败不展开申请面板、不创建记录；提交按钮保留同一 dry-run 作为手动输入后的二次保护。
- 特殊网站对象管理以 YouTube 为第一版：`youtube.com` 根域为受限娱乐，具体 video / playlist / channel 对象通过 `siteClassificationRulesV1` 作为独立规则行管理；云端访问管理页可把具体对象在学习、复合、受限娱乐、黑名单之间变更，根域仍不能直接改为学习或复合；特殊对象校验可在 `youtube.com` 受限父域下例外通过，普通 URL 和普通子域仍受父域保护。频道规则覆盖视频页时依赖 content script 上报频道 canonical target，未识别频道时视频页按具体视频规则或根域受限娱乐处理。
- 系统访问配置 loader 会强制执行 YouTube 根域不变量：即使旧 D1 配置仍把 `youtube.com` 放在复合默认或用户默认复合清单，读取时也会移出并纳入 `defaultRestrictedEntertainmentSites`；这不影响 `music.youtube.com` 的既有口径，也不影响 YouTube 特殊对象规则。
- `EVALUATE_QUOTA_STATE` 也会检查时间段边界。存在可靠的 `ACTIVE` timing session 时，先按 `targetClassificationAtTime` 映射活动内容性质：`study -> studyWindows`、`composite/pending_composite -> compositeWindows`、`restricted/rejected -> restWindows`；无活动内容快照时才回退到当前 runtime mode。待归类内容借用休息配额时，legacy runtime mode 和 `quotaBucketAtTime` 可以是 `rest`，但时间窗仍按 `compositeWindows` 判断，不能因此每分钟在 Rest/Study 间反复切换。

### 1.3.7.6 网站访问运行时配置语义迁移

扩展运行时使用统一的 `normalizeRuntimeSiteAccessConfig()` 作为网站访问配置入口。所有本地缓存、云端拉取、导入/恢复和首次绑定配置，都必须先升级到当前 `siteAccessRuntimeSchemaVersion` / `siteAccessSemanticVersion`，再进入分类、拦截、计时和 managed target 落账。

- source lists：`defaultStudySites`、`defaultCompositeSites`、`defaultUserCompositeSites`、`defaultRestrictedEntertainmentSites`、`defaultBlockedSites` 与 `custom*List`；
- effective lists：`studyList`、`compositeList`、`restrictedEntertainmentList`、`unsafeList`，由 source lists 重算，不长期信任历史缓存值；
- legacy aliases 只在 migration/normalization 层读取，运行时分类和 managed target attribution 只消费 canonical effective lists 与 `siteClassificationRulesV1`；
- migration registry 当前包含 M001 defaultUserCompositeSites 运行时化、M002 YouTube 特殊平台根域受限、M003 旧复合残留清理；后续语义变化新增 migration，不再在分类器和落账器分散补丁。

访问管理 bundle 格式：

```json
{
  "app": "TimeOnChrome",
  "configType": "access-management-config-bundle",
  "schemaVersion": 1,
  "exportedAt": "2026-07-27T00:00:00.000Z",
  "profile": { "id": "profile-id", "name": "profile-name" },
  "scopes": { "userConfig": true, "systemConfig": true },
  "userConfig": {},
  "systemConfig": {}
}
```

系统配置兼容格式：

```json
{
  "configType": "system-access-config",
  "schemaVersion": 1,
  "taxonomyVersion": "qustodio-web-filters-v1",
  "defaultStudySites": [],
  "defaultCompositeSites": [],
  "defaultUserCompositeSites": [],
  "defaultRestrictedEntertainmentSites": [],
  "defaultBlockedSites": [],
  "siteCatalog": [
    {
      "domain": "example.com",
      "name": "Example",
      "contentCategory": "教育性",
      "classification": "study",
      "confidence": "high",
      "notes": ""
    }
  ]
}
```

**`timeWindows` 语义说明：**

- 时间窗管内容性质，配额管扣费来源。待归类/复合内容在待归类额度耗尽后可以按既定规则借用休息配额，但内容性质仍是 `pending_composite` / `composite`，必须统一检查 `compositeWindows`。
- 同一次 `ACCESS_OBSERVED` 决策只读取一次 managed quota usage snapshot，并由该快照计算 Study、Compound、Rest 剩余量，避免存储维护或并发结算期间多次读取产生互相矛盾的路由事实。
- 周期额度检查通过内部字段 `activeUsageWindowMode` 接收活动 timing session 的内容窗口类型；该字段不进入 Worker API、D1、profile config 或上传协议，也不携带 URL、标题和页面文本。
- 活动内容为复合/待归类、待归类额度刚耗尽且复合窗口仍开放时，`quota_check` 直接切入 Rest quota borrow，不先经过短暂 Study mode；后续周期检查继续按 Compound 内容窗口保持稳定。

- `studyWindows`: `null` = 该日学习模式全天允许（默认）；`array` = 显式配置的学习模式允许窗口
- `compositeWindows`: `null` = 该日复合模式全天允许（默认）；`array` = 显式配置的复合模式允许窗口
- `restWindows`: `null` = 该日休息模式全天允许；`array` = 显式配置的休息模式允许窗口；默认值为 `[{ start: '15:30', end: '24:00' }]`
- `onlineWindows`: **不存储**，由后端按天实时计算为 `studyWindows ∪ compositeWindows ∪ restWindows` 的并集
  - 任一模式窗口为 `null` / 缺失 / 空数组时，该模式全天允许，派生 `onlineWindows = null`（全天允许）
  - 三者都是有限数组时，计算排序合并后的并集
- 学习、复合、休息时段**允许重叠**，重叠部分在并集中自然合并
- 空数组 `[]` 应归一化为 `null`（表示 unrestricted），不作为默认保存值
- `24:00` 允许作为 `end` 值（表示当天结束），不允许作为 `start`

**`schedule`（旧 guardian active hours）边界：**

旧 `schedule` / guardian active hours 仅作为 legacy fallback：当 `timeWindows.daily` 不存在时才参与运行时判断。保存 `timeWindows` 时不覆盖 `schedule`。

### 2.2 当前会话（chrome.storage.local: guardian_session）

```javascript
{
  currentMode: 'study',              // 'study' | 'rest'
  studySeconds: 0,                   // 今日学习时长（秒）
  restSeconds: 0,                    // 今日休息时长（秒）
  undeterminedSeconds: 0,            // 今日待归类时长（秒）
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
account_sessions(id, account_id, refresh_token_hash, created_at, expires_at,
                 revoked_at, last_used_at)
profiles(id, account_id, name, config JSON, version INT, avatar_color, created_at)
devices(id, profile_id, device_token, device_name, last_seen, monitoring_enabled, created_at)
composite_sessions(id, profile_id, device_id, domain, duration_seconds, session_date,
                   classification, parent_note, child_appeal, status, created_at)
```

**Cloud credential roles:**

- `device_token`: long-lived terminal binding credential used by `/device/*`. It is not revoked by account password changes. It only becomes invalid when the cloud device is unbound, local extension data is removed, the extension is reinstalled under a different ID, or the server-side device record is deleted.
- `account_token`: short-lived parent/admin API token used by `/profiles/:id/*` and other account-level routes. New tokens include `exp`; legacy no-exp tokens remain accepted for compatibility during the transition.
- `account_refresh_token`: revocable parent login session stored only as `account_sessions.refresh_token_hash` in D1. `/auth/refresh` rotates it and `/auth/logout` revokes it.
- `cloud_credentials`: legacy reversible email/password cache. New clients must not write it. If an upgraded client finds it, it may use it once to obtain a refresh token, then clear it. Migration failure must not clear `device_token`.
- `chromeIdentityHash`: weak recovery signal derived from `chrome.identity.getProfileUserInfo().id` and stored only as a server-side HMAC hash. It is not an authentication credential, not a Google OAuth token, and not a physical-machine proof. The first supported recovery rule is intentionally narrow: a macOS or Windows child terminal may recover the original `deviceId` after reinstall only when the cloud profile has a unique, still-bound device on the same platform with the same hash. Explicit cloud unbind always wins and prevents recovery.

Changing account password revokes refresh sessions only. It does not unbind child terminals or stop device-token sync.

---

## 3. 核心模块

### 3.1 Mode Service 与访问决策

`product/mode-service.js` 是模式迁移的高内聚模块。Chrome 事件、popup、Reminder、quota alarm 都先归一为 Mode Event，再由 `handleModeEvent()` 返回完整 decision。旧的“检查 + 提醒 + 切换 + quota 兜底”混合函数已经废弃，不再作为架构概念存在。

完整模式路由、配额到期、Reminder 类型和页内提示口径只维护在 `docs/MODE_QUOTA_ROUTING_MATRIX_V0.md`。本文件只记录模块边界，避免重复维护 routing matrix。

当前职责边界：
- `extension/stats/managed-statistics.js`：输出统计与配额 usage view。
- `product/quota.js`：计算并保存 `quotaState` / `lockedDomains`。
- `product/mode-service.js`：`ACCESS_OBSERVED` / `REQUEST_MODE_CHANGE` / `REMINDER_CONFIRMED` / `EVALUATE_QUOTA_STATE` 的状态迁移 decision，且唯一提交 runtime mode truth。
- `product/mode-effects.js`：执行 Mode Service decision，负责 Reminder 跳转、页内 notice、必要的 current-tab recheck 编排。它不检测 PiP、不关闭 PiP、不扫描 media sessions、不记录 PiP cleanup 结果；PiP policy 由 media timing / pip-policy 统一负责。
- `product/interceptor.js`：保留 declarative unsafe rules 与 notice helper；不拥有访问路由。

### 3.2 事件驱动计时链路（当前架构）

**旧架构问题（已废弃）：**
- 多标签页 passive 重复计时（3 个 YouTube 标签 = 3 倍时长）
- SW 休眠后内存状态丢失（`mediaPlayingTabs` Map、`domainActiveStartTime`）
- 心跳累加模型会把“信号上报”与“计时事实”混在一起
- 无法稳定区分前台 ACTIVE、后台媒体、PiP、PASSIVE/IDLE 等状态

**当前链路：事件共享、账本分轨**

```
Chrome listener / content signal
  → core/signal.js normalize + micro-batching
  → core/timing-dispatcher.js
      ├─ media-timing.js
      │    → media facts / known media reclassification
      │    → runtime/media-session.js
      │    → media_segments_v1 / daily_media_stats_v1 / hourly_media_stats_v1
      └─ foreground-timing.js
           → context.js + state.js
           → runtime/session.js transitionStateAt()
           → usage_segments_v1 / daily_usage_stats_v1 / hourly_usage_stats_v1

periodicCheckpoint alarm
  → checkpoint-scheduler.js
      ├─ foreground checkpoint
      │    → mismatch/missing session 先执行 ACCESS_OBSERVED 路由
      │    → 仅在路由允许且目标事实稳定后 repair/open
      └─ media checkpoint

lifecycle boundary
  → runtime/recovery.js
      → 只做残存 open session 容错清理
```

MV3 Service Worker 每次冷启动都必须检查关键 alarm 是否存在，但不得无条件重建同名 alarm。`chrome.alarms.create()` 会取消并替换同名 alarm，反复重建会持续推迟其下一次触发时间。初始化必须先读取现有 alarm，只补建缺失项或修正周期不一致项，保留周期正确 alarm 的既有 `scheduledTime`；bootstrap 必须等待该检查完成，初始化失败可在后续唤醒重试并只记录有界错误日志。此规则同时适用于 `periodicCheckpoint`、`quota_check`、`daily_cleanup`、`cloudSync` 和 `cloudHeartbeat`。

计时落账、checkpoint、recovery、segment schema 的正式口径见 `docs/STATS_STORAGE_FOUNDATION.md`。

**Checkpoint repair 安全约束：**

- checkpoint 是结算与采样修复机制，不是访问控制入口。发现 open session 缺失、tab/domain 不一致时，必须先对当前观测 URL 执行与前台导航相同的 `ACCESS_OBSERVED` 分类、时间窗和配额路由；路由阻止时不得创建 ACTIVE session。
- repair 开账只能使用路由后的当前 mode 和 managed-target 快照。`restricted/rejected` 不得继承缓存 `study`，`composite/pending_composite` 借用 Rest 配额时仍保留原分类与 Compound 内容窗口。
- 路由失败、上下文不完整或模式提交未完成时，本轮 checkpoint 只记录受限诊断并跳过开账，不以旧 session、旧域名或旧 mode 猜测补账。
- foreground checkpoint 的媒体补偿只能读取当前 tab 的新鲜 Content 强证据。符合 D-069 的失焦、未最小化、页面可见且身份一致的强媒体可以延续同一已有 ACTIVE session；不得在失焦状态修复或新开 session。`tab.audible`、陈旧聚合 fact、后台标签、最小化或隐藏媒体只能进入媒体账，不能修复或延长网页 session。

**同步与聚合可靠性约束：**

- content 内部信号由专用监听器消费后不得再次落入通用 message router；预期内部消息不记 `message_unknown_type`。
- 网站归类 exhausted 记录必须保留原记录并支持受控自动恢复；普通同步对同一 exhausted 集合使用冷却摘要，不得每轮为每条记录重复生成错误。上传成功后必须清除 retry metadata。
- 日媒体统计 outbox 与小时媒体统计使用相同的 exhausted 恢复语义：每次失败记录短错误码和 `lastAttemptAt`；达到最大重试次数后进入 6 小时冷却，冷却期内保留 dirty 数据但不计为同步失败、不生成重复告警；冷却到期或家长手动立即同步时允许再次尝试，成功后清除全部 retry metadata。同步前必须移除聚合已不存在或不含有效正时长行的孤立 dirty 元数据，禁止无有效 payload 的条目永久占用 outbox。
- 小时媒体 outbox 只能引用存在且含有效正时长行的本地小时聚合；不存在/空聚合应移除 dirty/retry/error 元数据，原始媒体段存在时应先重建聚合再上传。
- `segments_count` 是聚合行自身所覆盖的原始 segment/slice 数量。顶层整日/整小时计数仅作 envelope 元数据，Worker 不得复制到每个 domain、managed-target 或 media row。

### 3.3 Workers stats ingestion 域名归一（v1.7.x）

- 路由：`POST /device/stats`（`workers/src/routes/stats.ts`）。
- 变更目标：在写入 D1 `stats.domain` 前统一执行 v1.2 `normalizeHostname`。
- 归一规则：
  - 小写化（`EXAMPLE.COM` → `example.com`）
  - 去除尾部点（`example.com.` → `example.com`）
  - 保留 `www`（`www.example.com` 不折叠为 `example.com`）
  - IDN 转 punycode（如 `BÜCHER.DE` → `xn--bcher-kva.de`）
- 数据约束：归一后为空/非法域名的统计行直接跳过，不入库。
- 兼容性：
  - 不改变 `date/stats[]` 上传协议；
  - 不改变“先删后插”替换策略；
  - 仅收敛新入库数据，历史数据保留原值。

### 3.2.1 Content activity 信号源（不作为计时落账）

**content.js 发送逻辑（每 10 秒）**：

```
getActivityState():
  1. AudioContext 或 video/audio 正在播放 → 'passive'
  2. document.hidden → 'hidden'（不发送）
  3. 近 60 秒有键鼠操作 → 'active'
  4. 否则 → 'idle'（不发送）

sendMessage({ type: 'HEARTBEAT', state: 'active' | 'passive' })
```

`HEARTBEAT` 在这里只是 content script 的活动信号输入；它不再作为 session 存活证明，也不作为 durable settlement 的周期边界。

**当前信号处理**：

```
收到 HEARTBEAT(state, tabId):
  → signal.js micro-batching (80ms 合并)
  → timing-dispatcher.js
  → foreground-timing.js 构建上下文并解析状态
  → session.js transitionStateAt()
  → usage_segments_v1 / daily_usage_stats_v1 / hourly_usage_stats_v1 durable 落账
```

### 3.3 模式切换入口

旧的定时自动学习扫描已废弃。模式切换只通过 `product/mode-service.js` 处理：

```text
Chrome access event / Popup / Reminder / quota_check
  -> Mode Event: ACCESS_OBSERVED / REQUEST_MODE_CHANGE / REMINDER_CONFIRMED / EVALUATE_QUOTA_STATE
  -> mode-service.js handleModeEvent()
  -> mode-effects.js executeModeDecision()
  -> currentMode commit + Reminder / in-page notice UI projection
```

`Rest -> Study/Composite` 不再等待独立 auto-study counter。用户访问学习/复合网站时，由带 `tabId/url/foreground` 的 `ACCESS_OBSERVED` 事件立即驱动模式迁移和页面内提示。

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

### 3.4.1 提醒页借用按钮交互约束（quota_rest / quota_online）

`reminder.js` 中“⏱ 向明天借时间”按钮采用以下前端状态机，避免重复点击和误触：

1. `window.confirm` 取消：静默返回，不发 `BORROW_REST_QUOTA`，按钮文案/禁用态保持不变。
2. `window.confirm` 通过：按钮立即 `disabled=true`，文案切换为 `处理中...`。
3. 后端返回 `{ ok: true }`：按钮保持禁用，文案变为 `已借用`。
4. 后端返回错误（`already_borrowed` / `no_cross_week` / `weekly_quota_exceeded` / 其他错误）：
   - 按钮恢复可点击（`disabled=false`）
   - 文案恢复初始值 `⏱ 向明天借时间`
   - 状态提示文案沿用原错误映射，不改变业务语义。

### 3.5 云同步

**数据流原则：云端为唯一配置源（Single Source of Truth）**

- 云端 `profiles.config` 是配置的权威来源
- 终端只读拉取，不写回配置
- 家长控制台（`pages/index.html`）是唯一配置修改入口
- 终端仅上报统计数据（stats/sessions），不影响配置
- 绑定动作是唯一例外（写入 device_token/profile_id）

```javascript
// Pull（每次 Chrome 启动时 + 每 15 分钟同步）
pullCloudConfig():
  res = await cloudRequest('GET', '/device/config')
  if res.version <= localConfig.version → 跳过
  // 保护本地状态字段（不被云端覆盖）
  merged = { ...remoteConfig, quotaState: local.quotaState,
             lockedDomains: local.lockedDomains }
  saveConfig(merged)

// Push（已删除：终端不再推送配置）
// 配置修改仅通过家长控制台 → PUT /profiles/:id/config
```

#### 3.5.1 V1 本地存储压力、分批上传与生命周期恢复

`usage_segments_v1` 是本地事实账本，但本地同时承担离线缓冲职责，不能把云端长期保留等同于终端无限保留。终端同步和维护必须满足以下约束：

- 普通 usage segment 上传、今日日期快照和历史补传统一按最多 200 条顺序分批；每批远端幂等接受后立即清除对应 outbox，首批失败后停止本轮后续批次。
- outbox `lastErrors` 只保存稳定短错误码，不保存 HTTP HTML、响应正文或按 segment 复制的长错误文本；升级维护必须原地压缩历史 retry/error 元数据，不删除 pending segment。
- `chrome.storage.local` 使用三段安全线：7 MB 进入压力维护并清理到 6.5 MB；8 MB 是应用硬阈值；预算控制必须为紧急状态和损失审计预留至少 64 KB。所有可能增长的持久化写入必须在写入前串行计算替换后的预计用量，禁止先突破硬阈值再补救。
- 压力维护依次压缩 outbox，清理客户端日志、trace、纯诊断数据、旧兼容数据和已上传云端副本。客户端日志最多保留 3 天；保留优先级按 `error > warning > info`，同级按最近 1 天优先于 1-3 天；上传成功后立即移除本地副本。
- 已上传 usage/media 原始分段仅保留当前 `Asia/Shanghai` 自然日；进入下一自然日后，在确认 `uploadedAt` 且已移出对应 outbox 时删除本地原始副本并同步索引/retry metadata。当日保留完整 daily/hourly/target/media 聚合；历史删除已上传小时聚合，只保留最近 7 个北京时间自然日的已上传日聚合。dirty 原始段与 dirty 聚合不受此期限影响。长期事实以云端 D1 为准，本地原始分段承担当日诊断和离线缓冲。
- 前台 ACTIVE 账务采用 journal-first：完整 segment 或 `usage_settlement_journal_v1` 至少一项持久化成功后，session 边界才能推进；storage coordinator 必须串行完整 read-modify-write，禁止 maintenance 全局 bypass。
- 未上传 segment 在普通压力维护中受保护；若写入预计达到 8 MB，完整紧急维护仍无法降到安全目标，则先删除最旧未上传媒体 segment，最后才删除最旧未上传网页 segment。删除网页原始分段前必须保留并标脏对应日/小时/目标聚合，同步清理 index/outbox，并写入不含域名、URL、标题或正文的 `storage_emergency_loss_v1`。该审计键固定小于 8 KB、最多 20 条，禁止静默丢失。
- 配置、身份、token、隐私同意、当前模式、当前会话、时间窗口、访问规则、人工网站请求及批准/拒绝结果属于保护数据，任何压力等级都不得删除。若清空所有允许淘汰的数据后仍不能容纳新写入，预算门必须拒绝写入并保持总量不超过 8 MB。
- 503、fetch failure 和 request abort 使用跨同步退避，最长 30 分钟；成功后清除退避。维护日志需要冷却，避免维护本身成为新的存储压力来源。
- 存储诊断只允许记录 key 字节数、对象数量、pending 数量和维护结果，不记录域名、标题、URL、页面文本或响应正文。
- 当前会话的 `info` 客户端日志、`__timingTrace`、`debug_focus_ledger_v1` 和 `mode_effect_trace_v1` 写入 `chrome.storage.session`，浏览器重启、扩展更新/重载时自动清空。session storage 使用独立安全线：4 MB 进入压力维护并清理到 2 MB，6 MB 为应用硬门；淘汰顺序为 timing trace、focus ledger、mode trace、info 日志，`session_v1` 属于受保护业务状态。所有 session 写入进入同一串行队列，诊断写入无法容纳时直接丢弃，不得挤占或阻断业务状态。warning/error 仍写入有界 `client_logs_v1` 持久缓冲，最多 3 天，成功上传立即移除。`timing_checkpoint_health_v1`、`foreground_page_diagnostics_v1` 和 `storage_diagnostics_v1` 作为单份覆盖写摘要继续保留在 local。
- `session_v1_persistent` 是网页当前会话的 durable source of truth。其 local 写入成功后，`session_v1` 内存镜像的配额失败只允许触发 session 诊断清理和一次重试；重试失败必须回退到 persistent source，不能抛出并中断 timing dispatch。媒体与前台消费者分别捕获错误，任一消费者或诊断写入失败不得取消另一条账本链路。
- `storage_pressure_unresolved` 只上报最多 10 个最大 key 的名称、字节数、对象数和 pending 数，同一 unresolved 状态冷却 6 小时；状态变化、逼近硬门或发生数据降级时立即记录。

扩展 lifecycle boundary 必须同时处理网页和媒体 open session。`onInstalled(update)` / `onStartup` 在模式边界和云同步前恢复 `media_sessions_v2`：最近媒体证据仍新鲜时可结算到当前时间；陈旧 session 最多结算到 `lastObservedAt + 90 秒`，缺少该字段时最多结算到 `startTime + 90 秒`，随后清空 open/legacy media session，等待新的 content evidence 重新开启。不得让升级前 session 被后续 `mode_effective_boundary` 结算为数小时媒体账。

#### 3.5.2 Managed 本地健康心跳

本节的 guardian 专用命名已由 D-103 取代。内部 managed self-hosted 扩展通过 Native Messaging Host `com.timeonchrome.nativehost` 提供独立于网络和云端 API 的本地健康信号；`com.timeonchrome.guardian` 只作兼容别名。源 manifest 声明 `nativeMessaging`，但打包 staging 必须按渠道裁剪：managed artifact 保留权限、`deployment-profile.json` 与 `health-probe.html` 的 web accessible resource；普通/CWS artifact 强制移除该权限和探测页暴露。运行时还必须验证 deployment marker 为 managed，非 managed 上下文不得连接 Host。

- 模块加载时同步注册 `timeonchromeLocalGuardianHeartbeat` alarm、`onStartup`、`onInstalled` 和内部 probe 消息监听器。Service Worker 加载后立即发送 `booting`；bootstrap 完成或失败后发送确定状态；Native Port 存活时每 60 秒发送，独立一分钟 alarm 作为 Service Worker 唤醒兜底。
- 使用持久 `connectNative()` Port，但任一时刻只允许一个等待应答的 heartbeat/probe。Host 应答超时为 3 秒；probe 优先且使用 5 秒冷却；生命周期、alarm 和内存定时器触发必须合并，队列不得无界增长。Port 断开后不立即循环重连，只在下一次 alarm、生命周期事件或 probe 时重试。
- 协议 envelope 固定为 `protocolVersion`、`requestId`、`messageType`、`extensionId`、`profileId`、`sentAtMs`、`payload`。心跳 payload 包含 `version`、`incognito`、`policyHash`、`monitoringStatus`；已持久化 Segment 镜像使用同一 envelope 且不得包含页面身份。Profile UUID 在 `chrome.storage.local` 生成、持久化并回读确认；普通和 split-incognito 上下文共享 UUID，用 `chrome.extension.inIncognitoContext` 区分上下文。
- 策略哈希使用认可 managed key 的递归排序确定性 JSON 和 SHA-256；`managedDeviceToken` 只以“是否存在”布尔值参与哈希。payload、状态、控制台和客户端日志禁止出现 token、邮箱、URL、域名、标题、Cookie、浏览历史或原始错误正文。
- `monitoringStatus` 只允许 `booting`、`active`、`degraded`、`disabled_by_policy`、`privacy_consent_required`。只有 bootstrap 成功、activation 有效且 monitoring 未关闭时才能报告 `active`；关键读取或 bootstrap 失败报告 `degraded`。
- Host 仅以 `{ ok: true, receivedAt }` 确认。缺失、断开、超时或无效响应只更新有界 `local_guardian_status_v1`，保存最近尝试/成功时间、短错误码、连续失败数、Port 状态和触发来源；不得保存 payload 或原始错误文本，也不得让失败传播到 bootstrap、计时、拦截或同步。
- `health-probe.html` 是不展示数据、不发起网络请求的空白扩展页。它向 Service Worker 发送 `TIMEONCHROME_LOCAL_HEALTH_PROBE`，由独立监听器校验 sender 后立即发送 `type: probe`；收到结果后关闭，最迟 5 秒强制关闭。
- 现有每五分钟云端 heartbeat 保持不变。本地 heartbeat 只证明扩展进程和核心初始化状态，不替代云端配置、网页/媒体账本或远程监控。

#### 3.5.3 记账 V2 四层模型（目标设计，尚未实现）

D-078 将未来记账链路拆成四个不能互相替代的层次：

| 层次 | 权威含义 | 写入者 | 是否可由对账修改 |
|---|---|---|---|
| 原始落账 | 终端已经结算的不可变审计事实 | 终端；云端只做幂等接收 | 否 |
| 设备单账 | 一个设备在一个日期、一个 revision 的完整统计快照 | 终端生成，云端校验后发布 | 否 |
| 档案总账 | 同一档案各设备最新已发布单账的确定性总和 | 云端发布器 | 否 |
| 对账结果 | 固定原始事实集合重算后与对应设备单账的差异 | 云端审计器 | 只报警，不改账 |

固定公式：

```text
设备单账 = deviceId + date + revision 对应的完整统计快照

档案日总账 = Σ 当日各设备最新已发布设备单账

档案周总账 = Σ 本周七个档案日总账

终端可见合并账 = 本机当前完整单账（包含尚未上传部分）
                + 云端其他设备最新已发布单账

对账差额 = 固定截止点原始事实重算结果 - 对应 revision 的设备单账
```

设备单账必须同时包含小时、日、target、channel、mode 和 `quotaBucket` 维度，以及原始事实数量、事实摘要、统计摘要、`complete` 和事实损失状态。云端只接受由设备凭据确定的 `profileId/deviceId`；同一 `deviceId + date + revision` 同摘要重传为幂等成功，异摘要为版本冲突，旧 revision 不得覆盖新 revision。

设备日账采用 manifest 加不超过 200 行的 staging 分块。只有所有分块、行数和摘要均匹配后，才记录 `receivedRevision`；只有设备单账内部守恒、档案日总账和周总账在同一发布事务中构建成功后，才推进 `publishedRevision`。发布失败保留上一代完整账继续可读，新版本保持 `received_not_published`，禁止公开部分代次。

下发结果必须提供 `snapshotId`、`asOf`、周期、逐设备单账、档案总账、设备版本向量、完整性和 `totalHash`。分页必须绑定同一快照；终端收齐并校验后整体替换缓存，失败时保留上一份有效快照。离线设备只使用最后已发布单账并标记陈旧，不估算尚未上传用量。记账接口不下发配额锁。

对账选择固定的设备、日期、设备单账 revision 和原始事实截止点。原始集合不完整时只能返回 `pending_raw` 或 `insufficient_evidence`；完整时独立重算总秒数、分段数量和摘要、小时、channel、mode、target 与 `quotaBucket`，输出 `matched`、`mismatch` 或 `manual_review_required`。对账不得确认上传、清理 outbox、推进历史水位或修改任何正式账。相同 mismatch 只累计有界事件，规则化改账必须留给未来独立的 adjustment ledger。

V2 不直接改写现有 V1 表或读路径。V1/V2 并行期间，V1 继续服务旧客户端且不得写入 V2 正式读模型。V2 至少连续影子运行 7 个北京时间自然日，并通过真实多设备同截止点对照；档案全部活跃受控设备兼容后，才可在验收通过后的下一个周一 00:00 切换。切换前数据标记为 `legacy_unverified`，不把不明历史余额带入新周。任何 mismatch、总账不守恒、发布代次不完整或上传前后合并账跳增都阻断切换。

本节只定义已批准目标架构，不表示功能已经整体实现。包 A“网页零秒诊断事实协议统一”、包 B“网页事实 `id + contentHash` 逐项 ACK与冲突拒绝”、包 C“pending 独立扫描、revision 绑定及历史水位降级”和包 D“版本化设备日账影子提交”已于 2026-09-12 获 PO 单项批准并完成实现。包 B 使用共享规范化摘要，Worker 独立复算并禁止同 ID 异内容覆盖，客户端只按匹配摘要清除 pending；包 C 使原始 pending 不再受历史水位限制，远端总秒数完整性只在上传后控制连续水位推进，聚合响应只清除请求快照捕获且仍未变化的 outbox revision，日期包由一次冻结本地快照构建；包 D 从该冻结快照生成四类规范化设备日账行，经分块、摘要和守恒校验后提交为不可变 V2 shadow version。媒体协议、原始事实生成、本地聚合值及现有 V1 API、表和读取均未改变。档案总账发布、独立对账和 V2 下发仍必须分别按 D-076 取得 PO 单项批准后实施。

#### 3.5.4 包 D：版本化设备日账影子提交（已批准，已完成）

包 D 只建立设备日账的 V2 影子接收与不可变版本，不改变 V1 统计表、查询、页面或配额。设备端从同一次 `buildUsageDateSyncSnapshot(date)` 冻结输入生成规范化行，内容包括每日 domain、每小时 domain、每日 target 和每小时 target 四类维度；不重新计算使用秒数，也不改变任何本地聚合字段。设备端仅在统计摘要变化时为该日期分配下一个单调 revision，并在本地保留有界的 manifest 状态，不持久化第二份完整账本。

Worker 新增以下设备凭据接口：

- `POST /device/accounts/v2/manifests`：登记或幂等取得 `deviceId + date + revision` manifest。
- `PUT /device/accounts/v2/manifests/{manifestId}/chunks/{chunkIndex}`：接收最多 200 行的规范化 chunk；同索引同摘要幂等，异摘要冲突。
- `POST /device/accounts/v2/manifests/{manifestId}/commit`：核对 manifest、全部 chunk、行数、摘要及四类统计总量守恒后，原子将 manifest 标记为 `committed`。
- `GET /device/accounts/v2/status?date=...&revision=...`：只返回当前设备该日期版本的接收状态和摘要，不返回档案总账或配额状态。

新 D1 表只存 V2 影子数据：`device_account_manifests_v2`、`device_account_chunks_v2` 和 `device_account_sync_events_v2`。设备身份始终由 bearer device token 确定，payload 中不接受 profile/device 覆盖。同一 revision 同 manifest 摘要为幂等成功，异摘要返回 `DEVICE_ACCOUNT_REVISION_CONFLICT`；低于当前最高 revision 的新 manifest 返回 `DEVICE_ACCOUNT_STALE_REVISION`。任何缺块、越界块、块摘要错误、统计摘要错误或内部不守恒都保持 `staging` 并拒绝 commit，不能形成部分可见版本。

包 D 的 `committed` 仅表示完整影子设备单账版本已经不可变保存，不表示已经进入档案总账。包 E 实施前不存在产品可读的 V2 head，V1 继续承担全部现有运行；D 的失败只形成有界 shadow pending/诊断，不阻塞 V1 上传、网页记账、拦截或配额。

实现验证覆盖设备端规范化、四维守恒、事实损失标记、每块 200 行上限、revision 单调性与陈旧响应保护；Worker 覆盖乱序/缺块、幂等、摘要冲突、旧 revision、事务失败和零秒空账；同步覆盖请求顺序、失败隔离、pending 重试及已提交跳过。全量 unit 共 134 个测试文件通过，TypeScript、扩展根目录与 diff 检查通过。

#### 3.5.5 包 E：档案日/周总账原子发布（已批准，已实现）

包 E 在 V2 隔离表中建立设备日期 head、档案日期 generation/head 和档案周 generation/head。发布输入只能是已 `committed` 且重新通过行摘要和四维守恒校验的设备单账；档案日总账严格按规范化 bucket 对各设备最新候选 revision 求和，周总账只汇总同一档案该北京时间周的七个最新日总账。设备版本向量必须记录每个贡献设备的 manifest、revision、摘要、完整性和数据时间。

候选 generation、总账 payload、版本向量和摘要在事务前完整构建；档案日明细按最多 200 行分块保存并逐块校验，避免大日账依赖单个 JSON 字段。设备 head、档案日 head、档案周 head 只允许在同一 D1 batch 中切换；事务失败时上一代 head 保持不变，新 manifest 保持 `committed / received_not_published`。包 E 不提供产品读取，不接入 V1、页面或配额。

#### 3.5.6 包 F：独立设备对账（已批准，已实现）

对账固定 `deviceId + date + revision + rawCutoff`，读取对应不可变设备单账和截止点内的云端网页原始事实。原始事实未收齐时返回 `pending_raw`，存在已知事实损失或无法证明集合完整时返回 `insufficient_evidence`；只有完整证据才能使用与本地相同的确定性切片和聚合规则生成审计账，并比较总秒数、事实数量/摘要、小时、domain、target、channel、mode 和 `quotaBucket`。

对账结果及相同 mismatch 的有界 incident 单独存储。任何结果均不得修改原始事实、设备单账、档案总账、客户端 outbox、上传 ACK、历史水位或配额；规则化改账不属于本包。

#### 3.5.7 包 G：V2 只读快照与终端影子缓存（已批准，已实现）

Worker 提供版本化周快照，只读取已发布 head，返回 `snapshotId`、`asOf`、北京时间周期、逐设备日账、档案日/周总账、设备版本向量、完整性和 `totalHash`。分页全部绑定创建时的不可变 snapshot；客户端必须收齐全部页面并复算摘要后才能整体替换有界影子缓存，缺页、过期或摘要错误继续保留上一份有效缓存。

包 G 仅用于影子比较和诊断。现有 Pages、Admin、Popup、配额、拦截与 V1 统计仍不读取该缓存；正式切换必须另行通过连续 7 日影子验证、全设备兼容和下一个北京时间周一 00:00 门禁。

E/F/G 的专项测试、140 个全量 unit 文件、TypeScript、扩展根目录、diff 检查及完整自动化入口均已通过；完整入口包含 API 103/103、数据流 53/53 和扩展 E2E 15/15。实现审计结论为 `Matched`，未发现偏离确认方案或进入现有产品读取的额外路径。

#### 3.5.8 `1.7.31` 统一配额读模型与直接接管

D-080 将配额定义为终端基于账本的即时计算，不再把锁当作可同步、可合并或可持久化的事实。V2 执行公式固定为：

```text
本地执行总账 = 本机当前完整账（包含未上传）
               + V2 快照中其他设备最新已发布账
```

终端必须以 `cloud_device_id` 排除快照中的本机设备，保证本机事实上传前后总用量不跳变。日 Study、Composite、Rest 和周 Rest 只汇总 `channel=active` 行的实际 `quotaBucket`；Online 汇总全部 active 网页时长；单站点配额汇总当日各设备 active `daily_domain`。媒体账、`backgroundMedia` 和 `pip` 不进入网页配额。配额状态、限制原因和剩余量每次从当前账与当前配置重新派生，提高或取消限额后立即解除限制；V2 不读取 `/device/quota-state`，不合并 `cloud_quota_state_fact_v1`，不把 `quotaState` 或 `lockedDomains` 保存为下一次判断的事实。

Worker 的 V2 周快照在既有不可变分页和哈希校验上增加逐设备、逐日 active `byDomain` 投影，并报告 `expectedDevices`、`missingDevices`、`incompatibleDevices`、`staleDevices` 和 `incompleteDevices`。活跃设备指本周内在线、仍绑定且监控开启的设备；解绑设备不构成缺失，但其本周已发布历史账继续计入总账。migration 027 只记录设备 V2 capability、扩展版本及最近上报时间，不存储域名或其他访问内容。

终端完整收齐并校验快照后才替换缓存。云端不可用时沿用同周期最近一份可信快照；无可信快照时只执行本机账并标记“其他设备数据未知”，不得回退云端锁。其他设备离线时保留其最后已发布用量，不估算未上传部分。跨日、跨周不得使用旧周期缓存。本机账读取失败时优先使用同周期可信本机投影缓存；无缓存时学习和复合网站继续可用，受限娱乐网站以“记账数据暂不可用”暂时阻止，不能伪报配额耗尽或自动借用 Rest。

`quota_read_model_v2` 是配额评估、模式路由、Rest 软限额提醒、Popup 和本地 Admin 的唯一 V2 读模型。Admin 主显示实际执行总账，并可展开本机、其他设备、未确认量和完整性；Pages 只显示“云端已确认账”和逐设备贡献，不声称包含终端未上传数据。`timeQuota.accountingVersion` 支持 1/2：旧客户端忽略该字段；`1.7.31` 在值为 2 时立即接管，在值为 1 时继续旧兼容链路。该切换不得修改网页 ACTIVE、原始分段、本地结算、设备单账或历史数据。

### 3.6 配置修改流程

```
家长控制台 (pages/index.html)
  → PUT /profiles/:id/config
  → 云端 D1 更新 profiles.config
  → version + 1

终端 (background.js)
  → 每 15 分钟 GET /device/config
  → version > localVersion → 拉取并合并
  → 本地配置更新
```

自 D-098 起，档案配置写入采用乐观并发与不可变审计：

- `GET /profiles/:id/config` 返回当前 `version`；Pages 必须保存该版本并在后续 `PUT` 请求中提交 `expectedVersion`。
- `PUT /profiles/:id/config` 仅在 `expectedVersion` 等于数据库当前版本时更新；否则返回 `409 PROFILE_CONFIG_VERSION_CONFLICT` 和最新版本，Pages 重新读取配置并要求用户复核，不自动重放旧 payload。
- 实际配置未变化的请求返回 `noChange`，不增加版本、不生成伪审计记录。
- `profile_config_history_v1` 保存脱敏后的版本快照、前后版本、变更顶层字段、账号、操作来源、请求 ID 和时间。密码、token、secret 及运行时保护字段不得进入审计快照。
- `GET /profiles/:id/config-history/v1` 向档案所属家长返回最近 100 次脱敏审计记录，用于定位版本、变更字段、来源与时间；不返回任何被剔除的敏感字段。
- 数据库 `BEFORE UPDATE OF config` 触发器强制版本每次只增加 1，遗漏版本或跳版的写入整体拒绝；`AFTER UPDATE OF config` 触发器兜底捕获内部或遗留写路径。标准家长 PUT 在同一原子批次内补齐账号、来源和 SHA-256；审计写入失败时配置更新整体失败。
- 终端继续只读拉取 profile config；本机制不改变任何网页账、统计、配额或媒体语义。

### 3.7 事件上报与邮件通知

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

## 3.8 关键参数

| 参数 | 值 | 说明 |
|------|------|------|
| `BATCH_WINDOW` | 80ms | micro-batching 事件合并窗口 |
| `PERIODIC_CHECKPOINT_MIN_INTERVAL_MS` | 3min | 周期落账最小间隔；正式落账口径见 `STATS_STORAGE_FOUNDATION.md` |
| `MAX_RAW_WINDOW` | 10min | 事件日志时间窗口压缩 |
| `PASSIVE` | 0 | 不计入时长（只有 ACTIVE/BACKGROUND_ACTIVE 计为 1） |

---

## 4. 消息协议（sendMessage）

| type | 方向 | 参数 | 返回 |
|------|------|------|------|
| `GET_CONFIG` | → background | — | config |
| `UPDATE_CONFIG` | → background | `{ config }` | `{ ok }`（仅保存本地，不推送云端）|
| `GET_STATS` | → background | — | 今日域名统计 |
| `GET_STATS_RANGE` | → background | `{ days }` | 多日统计 |
| `FLUSH_TIME` | → background | — | `{ ok, flushed, flushedSeconds, domain, state, reason }`；将当前 open counted session durable flush 到本地 Stats Foundation 账本并重新打开 |
| `GET_SESSION` | → background | — | session |
| `GET_SESSIONS_RANGE` | → background | `{ days }` | 历史会话 |
| `REQUEST_MODE_CHANGE` | → background | `{ toMode, source?, reason?, noticeTabId? }` | session；统一进入 `product/mode-service.js` |
| `GET_RUNTIME_MODE_STATUS` | → background | `{ includeUsageSummary? }` | runtime mode、当前域名、quota remaining、`currentModeStartedAtMs`、`restExitGraceUntilMs` |
| `SWITCH_TO_STUDY` | → background | — | Legacy alias；内部转为 `REQUEST_MODE_CHANGE` |
| `SWITCH_TO_REST` | → background | — | Legacy alias；内部转为 `REQUEST_MODE_CHANGE` |
| `SWITCH_TO_COMPOSITE` | → background | — | Legacy alias；内部转为 `REQUEST_MODE_CHANGE` |
| `SUBMIT_SITE_CLASSIFICATION_REQUEST` | → background | `{ input, sourceTabId?, requestedClassification: "study" }` | `{ ok, request, localOnly, target, promoted? }`；孩子侧“申请归为学习网站”，已有自动访问记录时升级同一记录；审批前仍按待归类时长处理 |
| `GET_SITE_CLASSIFICATION_REQUESTS` | → background | `{ status? }` | 本地持久申请记录 |
| `ADD_TO_COMPOSITE_LIST` | → background | `{ domain }` | Legacy compatibility only；新申请入口不再使用 |
| `BORROW_REST_QUOTA` | → background | — | `{ ok, amount }` 或 error |
| `SEND_CLOUD_EVENT` | → background | `{ eventType, domain }` | — |
| `CLOUD_LOGIN` | → background | `{ email, password }` | stores `account_token` + `account_refresh_token`; does not store reversible password |
| `CLOUD_LOGOUT` | → background | — | revokes/clears parent account session fields only; keeps `cloud_device_token` so terminal binding remains valid |
| `HEARTBEAT` | content → background | `{ state }` | `{ ok }` |
| `CONTENT_SCRIPT_READY` | content → background | — | `{ ok }`；content listener 就绪后标记 tab ready，并投递同域、未过期的 queued transient notice |
| `SHOW_WARNING` | background → content | `{ minutesLeft, domain }` | — |
| `SHOW_OVERLAY` | background → content | `{ message, reason }` | — |
| `REMOVE_OVERLAY` | background → content | — | — |
| `AUTO_MODE_PENDING_START` | background → content | `{ deadlineAt, targetMode, fromMode, domain }` | 页面内 pending auto-switch notice，倒计时型 |
| `AUTO_MODE_PENDING_CANCEL` | background → content | `{ reason }` | 清理当前 tab 的 pending/success notice |
| `AUTO_MODE_PENDING_SUCCESS` | background → content | `{ targetMode, fromMode, noticeKind, displayDuration }` | 页面内 transient success/info notice，必须按 TTL 自动消失 |

### 4.0a 未归类访问记录与学习归类申请

`site_classification_requests_v1` 继续作为兼容 storage key 和云端主表，但产品层区分两种 pending 对象：

| 对象 | 创建入口 | `recordSource` | `requestedClassification` | 审批前路由 |
|---|---|---|---|---|
| 未归类网站访问记录 | Mode Service 自动观察 | `auto_unclassified_access` | `null` | `pending_composite` |
| 学习网站归类申请 | Popup 手动提交 | `manual_learning_request` 或由自动记录升级 | `study` | `pending_composite` |
| 历史网站归类记录 | 旧数据兼容 | `legacy` | `null` | 按原 status |

同一 profile、target 和有效 pending 周期只保留一条主记录。手动申请若命中自动记录，必须保留原 ID、首次/最近访问与导航次数，补充 `requestedClassification=study` 和 `manualRequestedAt`；后续自动观察不得降级该意图。

访问概况字段为 `firstObservedAt`、`lastObservedAt`、`observationCount`。计数只接受 `webNavigationCommitted` 和 `webNavigationHistoryStateUpdated` 顶层导航；首次由恢复/重检发现时允许建立一次基线观察，tab 激活、后台重检和心跳不继续累计。上传 payload 使用兼容 schema v2；Worker `/device/site-classification-requests/v1` 路径不变，旧 payload 缺失新字段时按 legacy 处理。

为保证上传重试和多观察源幂等，终端为本地累计创建稳定 `observationSourceId`，云端按 `(request_id, observation_source_id)` 保存累计值并以 `max` 合并，再汇总到主记录；不保存逐次访问明细。

网站归类记录上传可靠性：设备端批量 POST `/device/site-classification-requests/v1` 时，Worker 必须按单条记录隔离异常；某条记录保存失败只能返回该条 `SERVER_ERROR`，不得让整批 HTTP 500，从而避免其他记录无法入库。扩展端普通同步会按 retry count 限制自动重试，管理页“立即同步”必须使用 `forceRetryExhausted` 重试已耗尽的网站归类记录；后端恢复后，本地 pending/failed/exhausted 记录应可通过立即同步重新上传。

### 4.0 Cloud Auth Session Contract

Account login and device binding are intentionally separate:

- `/auth/login` remains backward-compatible and returns the legacy `token` field; new clients also receive `refreshToken`.
- `/auth/refresh` exchanges a valid refresh token for a new short-lived `token` and a rotated refresh token. The previous refresh token is revoked immediately.
- `/auth/logout` revokes the current refresh token when supplied. Legacy clients without refresh tokens may still call logout without breaking compatibility.
- `/auth/change-password` revokes all refresh-token sessions for that account. It does not delete `devices`, mutate `device_token`, or force already bound child terminals to rebind.
- `/device/*` routes continue to use `device_token`; `/profiles/:id/*` routes continue to use `account_token`.

Extension-side storage follows the same split:

- `cloud_device_token` / `cloud_profile_id`: terminal binding and sync.
- `account_token` / `account_refresh_token` / `cloud_account_email`: parent/admin account session.
- `cloud_credentials`: legacy migration-only field; new writes must set it to `null`.

### 4.1 受管激活与 Device Token 自动绑定

- `extension/manifest.json` 必须通过 `storage.managed_schema` 指向随包发布的 `managed-storage-schema.json`；没有该声明时，Chrome 不会把 OS 企业策略发布到 `chrome.storage.managed`。
- 自托管扩展的 manifest 必须声明生产 `update_url`。`ExtensionSettings.update_url` 默认只负责首次安装，后续更新使用 manifest 的 URL；部署策略同时设置 `override_update_url: true`，以便仍未声明 manifest URL 的旧版本也能从策略 URL 升级。
- macOS MCX 的 `/Computers/local_computer` 记录必须同时写入当前 `IOPlatformUUID` 作为 `HardwareUUID`；仅写 `ENetAddress` 在部分 macOS 机器上不能让 ManagedClient 自动匹配当前电脑。导入后必须运行 `mcxrefresh -n <user>`，并以不带显式 `-computer` 的 `mcxquery -user <user>` 验证扩展策略域实际生效。
- schema 与 `core/activation-gate.js` 共用同一字段集合：`enabled`、`deploymentMode`、`cloudEndpoint`、`managedDeviceToken`、`managedDeviceLabel`、`managedProfileEmail`、`allowIdentityRecovery`，以及只用于旧模板兼容的 `tenantId/devicePolicyId`。
- `managedProfileEmail` 是强 Profile gate；不匹配时不得采用 Token，也不得回退到用户同意激活。匹配且 policy 有效时，managed activation 优先于用户同意路径。
- 首次安装和版本升级都必须在 lifecycle 内重新读取 policy。若本地没有 `cloud_device_token`，扩展采用 `managedDeviceToken`，调用 `/device/config` hydrate `profile_id/device_id`，随后执行完整同步；已有本地 Token 时不覆盖。
- Token adoption 日志不得包含 Token、完整邮箱、device ID 或 profile ID，只允许保存结果状态、HTTP 状态、错误码、触发原因和扩展版本。

### 4.2 模式切换页面内提示生命周期

- 模式切换、配额路由、Reminder、页内提示和 mode boundary 的唯一产品口径维护在 `docs/MODE_QUOTA_ROUTING_MATRIX_V0.md`；`docs/MODE_TRANSITION_UX_V0.md` 已停用，不再作为 source of truth。
- `product/mode-service.js` 是唯一 mode owner：读取 `guardian_session.currentMode`，提交 `currentModeStartedAtMs`，维护 `restExitGraceUntilMs`，并写入 `mode_boundary` intent。`product/interceptor.js` 只负责访问事件适配和执行 redirect/notice。
- `quota_check` alarm 是本地配额到期的 mode-transition 入口：`EVALUATE_QUOTA_STATE -> handleModeEvent -> executeModeDecision -> current active tab ACCESS_OBSERVED recheck`。它不扫描全部 tab，不直接 redirect。
- 云端 quota pull 只合并保存 `config.quotaState` 事实；不触发 Mode Service、不跳 Reminder、不重查 tab。
- `locked` 是正式产品 mode，表示当前配额状态下 Chrome 不能继续正常使用；`unknown` 只允许作为账本 fallback。
- 页内提示是 mode transition 的 UI projection，不是 mode 真值来源；提示发送失败不得阻断模式切换。
- `Rest -> Study` / `Rest -> Composite` 的自动访问路由在规则允许时立即切换，并写 `currentModeStartedAtMs`；同时设置 `restExitGraceUntilMs = effectiveAtMs + 30_000`。30 秒 Rest Exit Grace 内打开 Rest 目标会自动回 Rest 并显示页内提示，不弹 Reminder；自动 Study <-> Composite 不刷新该窗口。Popup 手动切换会清空既有 Rest Exit Grace 且不创建新窗口，即使请求模式与当前模式相同；Reminder 确认和 quota alarm 驱动的 mode change 不创建该窗口。
- `Study -> Composite` 和 `Composite -> Study` 在规则允许时立即切换，并向目标网页发送 4 秒 `AUTO_MODE_PENDING_SUCCESS` transient notice。
- 手动 popup / Reminder 切换通过 `REQUEST_MODE_CHANGE` / `REMINDER_CONFIRMED` 进入 Mode Service，再用 `GET_RUNTIME_MODE_STATUS` 刷新 UI；旧 `SWITCH_TO_*` 仅作为兼容别名。
- 页内提示只依赖 manifest 静态 `content_scripts`；不使用动态 `chrome.scripting.executeScript` 注入兜底。
- Mode success notice 先进入 per-tab pending queue，再等待 `CONTENT_SCRIPT_READY` 或已知 ready tab 投递；`CONTENT_SCRIPT_READY` 只投递未过期、未 clear 且 `domainSnapshot === currentDomain` 的 transient notice，已过期、已 clear 或域名不一致的提示不得复活。
- `chrome.tabs.sendMessage` 的 ACK 才代表提示渲染成功；发送失败、ACK 未渲染或 ready 超时只记录诊断并触发 fallback notification，不改变 mode 真值。

---

## 5. 文件结构

```
timeonchrome/
├── app-runtime-management/    独立构建、测试、版本和部署的跨平台 Runtime 模块
├── native-app-control/        Santa 独立子系统（应用发现、审核与阻止）
├── extension/                 Chrome 扩展源码根；开发时在 chrome://extensions 直接加载此目录
│   ├── manifest.json          MV3 扩展清单，版本 1.7.12, "type": "module" (Chrome 95+), "incognito": "split"
│   ├── managed-storage-schema.json  Chrome managed storage 策略字段 schema
│   ├── background.js          Service Worker 入口（Chrome listener wiring）
│   ├── message-router.js      消息路由（20+ case 拆分）
│   ├── content.js             注入每个页面：活动信号、媒体检测、覆盖层
│   ├── content.css            content.js 注入的样式
│   ├── reminder.html          提醒页 HTML（7 种场景）
│   ├── reminder.js            提醒页逻辑：场景渲染、操作按钮处理
│   ├── bind.html              设备绑定页（写入 cloud_device_token/cloud_profile_id）
│   ├── config.js, auth.js, sync.js  云同步配置（cloud_ 前缀统一）
│   ├── core/                  timing orchestration + 纯函数支持
│   │   ├── signal.js          信号输入 + micro-batching (80ms)
│   │   ├── timing-dispatcher.js signal fan-out 到 foreground/media
│   │   ├── foreground-timing.js 前台网页计时链路
│   │   ├── media-timing.js    媒体计时链路与重分类
│   │   ├── checkpoint-scheduler.js checkpoint 分轨调度
│   │   ├── context.js         上下文构建（纯函数）
│   │   ├── state.js           状态机（纯函数）
│   │   ├── event-log.js       append-only 事件日志
│   │   └── aggregate.js       时长计算（纯函数）
│   ├── runtime/               状态管理层（有副作用）
│   │   ├── session.js         前台网页 open session 快照
│   │   ├── media-session.js   本地媒体 facts/sessions/segments
│   │   └── recovery.js        lifecycle recovery
│   ├── product/               业务逻辑层
│   │   ├── mode-service.js    Mode 真值、路由决策、提交和 mode_boundary intent
│   │   ├── quota.js           quotaState 计算/保存 + 借用
│   │   ├── mode-effects.js    执行 Mode Service decision：Reminder/notice/redirect
│   │   ├── interceptor.js     declarative unsafe rules + notice helper
│   │   └── analytics.js       统计查询 adapter
│   ├── stats/                 管理统计口径层
│   │   └── managed-statistics.js 统计/配额 usage view、settlement/reconciliation view
│   ├── infra/                 基础设施层
│   │   ├── storage.js         配置/会话存储
│   │   └── cloud-sync.js      云同步 + 心跳
│   ├── popup/                 扩展弹窗 UI
│   ├── admin/                 本地管理面板
│   ├── icons/                 扩展图标
│   └── rules/                 静态拦截规则（空占位）
├── workers/                   Cloudflare Workers 后端
│   ├── wrangler.toml
│   ├── migrations/            D1 数据库迁移文件
│   ├── schema.sql
│   └── src/
│       ├── index.ts           路由入口 + CORS 预flight + D1 schema + 定时任务
│       ├── db/
│       │   └── middleware.ts  鉴权、响应工具
│       └── routes/
│           ├── auth.ts        注册/登录
│           ├── device.ts      设备绑定/配置同步/配额聚合
│           ├── events.ts      事件上报 + 邮件通知
│           ├── profiles.ts    账户/设备管理
│           ├── sessions.ts    会话上传
│           ├── compositeSessions.ts  待归类会话审核
│           ├── stats.ts       统计查询
│           └── changelog.ts   配置变更日志
├── pages/                     家长 Web 控制台（Cloudflare Pages）
│   ├── wrangler.toml
│   └── index.html             单页应用（compositeList → allowList 映射）
├── tests/                     测试套件（218 用例）
│   ├── unit/                  单元测试（157 用例，~7s）
│   ├── api/                   集成测试（52 用例）
│   └── e2e/                   E2E 测试（9 用例）
├── docs/
│   ├── DESIGN.md              本文档
│   ├── PRD.md                 产品需求文档
│   ├── CHANGELOG.md           变更记录
│   ├── TODO.md                待办事项
│   └── TEST-SPEC.md           测试规范
└── AGENTS.md                  开发规范（工作流、测试分级、数据同步原则）
```

---

## 6. Chrome API 使用

| API | 用途 |
|-----|------|
| `chrome.storage.local` | 配置、统计、会话持久化 |
| `chrome.storage.session` | 运行时会话快照（Chrome 95+），split 模式下常规/无痕各自独立 |
| `chrome.declarativeNetRequest` | unsafeList 域名重定向规则 |
| `chrome.webNavigation.onCommitted` / `onHistoryStateUpdated` | 采集当前 tab/url/foreground facts，派发 `ACCESS_OBSERVED`；覆盖普通导航与 SPA history 导航 |
| `chrome.tabs` | 获取/更新标签页状态 |
| `chrome.alarms` | 定时任务：配额检查、每日重置、保活 |
| `chrome.idle` | 系统 active/idle/locked 边界与 checkpoint 查询 |
| `chrome.notifications` | 系统通知（配额锁定等）|
| `chrome.runtime.sendMessage` | popup/admin/content ↔ background 通信 |

---

## 6.1 Incognito 模式（split）

`manifest.json` 使用 `"incognito": "split"`，Chrome 为无痕模式创建独立的 Service Worker 实例。

### 存储隔离表

| 存储类型 | 常规模式 | 无痕模式 | 说明 |
|---------|---------|---------|------|
| `chrome.storage.local` | 共享 | 共享 | 配置、统计、配额状态在两种模式间同步 |
| `chrome.storage.session` | 独立 | 独立 | 会话快照各自维护；具体落账/recovery 口径见 `STATS_STORAGE_FOUNDATION.md` |
| `chrome.storage.sync` | 共享 | 共享 | 跨设备同步数据 |

### 影响分析

- **reminder.html**：split 模式下无痕标签页可正常加载扩展页面（`reminder.html`、`popup.html` 等）
- **session.js**：无痕和常规模式各自维护独立的 session 快照，互不干扰。这是正确行为 — 无痕浏览应有独立的会话追踪
- **recovery.js**：lifecycle recovery 仅作为容错机制作用于当前上下文的残存 session；具体触发边界和估算口径见 `STATS_STORAGE_FOUNDATION.md`
- **cloud-sync.js**：云同步在两种模式下共享 `chrome.storage.local` 中的配置和 token
- **declarativeNetRequest**：规则按标签页应用，split 模式下正常工作

---

## 6.2 Client Logging Foundation v1

TimeOnChrome 使用统一客户端日志机制记录诊断摘要。日志不是业务功能，任何写入、查询或上传失败都不能影响计时、访问控制、模式切换、配额、云同步、popup 或 admin。

### 本地日志

- 持久缓冲键：`client_logs_v1`；当前会话 info 键：`client_logs_session_v1`
- 默认策略：本地记录 `warning` / `error`，`info` 仅在远程诊断策略带 TTL 时启用
- 归属字段：`profileId`、`deviceId`、`bindingState`
- 未绑定阶段：`profileId = null`、`deviceId = null`、`bindingState = unbound`
- 保留策略：warning/error 持久缓冲最多 3 天并限制条数和总体积；上传成功立即删除。带 TTL 开启的 info 只写 `chrome.storage.session`，浏览器重启、扩展更新或重载后自动清空
- 本地 admin 的“系统日志”页只展示脱敏后的日志摘要，可按 `timing` / `media` / `checkpoint` / `ledger_gap` / `mode_transition` / `storage` 等 category 和 `auditId` 搜索

### 云端日志

#### D-075 配额取证与分层诊断（2026-09-12）

- `clientLoggingPolicyV1.policyVersion=2` 显式启用新策略：基础 `uploadEnabled/uploadMinLevel` 为 warning/error，`expiresAt=null` 可长期授权；`infoExpiresAt` 单独控制详细 info。旧策略缺少版本号时继续使用原 `expiresAt`，不自动延长授权。白名单同步健康、配额决策、故障恢复和日志损失摘要保持真实 info 等级，基础授权开启时仍可上传。
- `clientLoggingPolicyV1.quotaAuditRequest` 包含 `requestId/deviceId/fromDate/toDate/expiresAt`，由 Pages 通过既有 profile 配置接口写入；范围最多 7 个真实自然日、有效期不超过 24 小时。旧扩展忽略。终端仅允许固定字段只读采集，不执行任何远程命令。
- 快照从一次 storage 读取固定截止点，排除截止点后的分段；仅投影 ID、日期、起止、秒数、channel、mode、分类和 quota bucket，另采集逐日聚合、outbox、确认状态和历史水位。通过既有客户端日志通道发送 manifest/chunk/complete，每包最多 20 行、每轮同步最多 10 包，只推进连续已 ACK 前缀；编码总量上限 480 KB，session 缓冲仍受统一预算限制。超限、重启丢失、缺块或摘要不符均报告不完整，不能视为通过；持久状态仅保留最近 24 小时最多 20 个请求标记，不重新生成丢失快照冒充同一次取证。日期范围外的现存 pending 分段只计数量，不传输其 ID/内容；日期无法确定的孤立 ID 单独标注。
- 家长通过只读 `GET /profiles/:id/quota-audit/v1?requestId=...&deviceId=...` 验证快照后，按 ID 对比云端已接收原始账，返回本地独有、云端独有、同 ID 字段差异，以及逐日并集与本地聚合差异；已上传且被本地清理的云端独有行不是丢失证据。不修改原始账或任何物化。
- 完整性只证明传输与校验一致，不证明账本真实完整或配额差额已经解释。报告保留零长度等无效分段的诊断投影并列出校验候选；没有逐目标 quota bucket、读取失败或结果被截断时显示未知/不完整，不补为 0。云端原始账查询超过 20000 行或日志包查询达到上限均停止判定完整。
- 上传失败保留有界 `requestId/date/batchId/status/serverCode/rejected` 首错上下文；outbox 仍只存短错误码。同步摘要显示未知/待上传/退避/部分完成，不能把读取失败视为 0 或把本轮无错误视为全量完成。配额拒绝诊断关联同一 auditId，记录当前锁位、限额、本地/云端快照与逐日桶，不改判定算法。
- 本地日志最长 3 天、512 KB，session info 最长 1 天、256 KB；写入/ACK/清理串行化，待执行队列最多 32 项。日志写入失败、读取失败、丢弃与截断以固定计数记入 session 的 `client_log_loss_v1`，通过健康摘要上传；会话存储不可用时仅保留内存计数并标注未持久化。服务端失败接口审计按 14 天独立保留，每设备成功请求最多 1000 条，不得挤掉失败。客户端云端日志仍保留 30 天。所有诊断有界、best-effort、低于网页落账优先级，不阻塞结算；新增诊断自身异常不得将上传成功改判失败或改变原错误和重试行为。

- D1 表：`client_logs_v1`
- 设备上传：`POST /device/client-logs/v1`，使用 device token 鉴权，Worker 按 token 归属写入真实 `profile_id/device_id`
- 家长查询：`GET /profiles/:profileId/client-logs/v1`，支持按 device、level、category、时间范围和 cursor 查询
- 云端默认不上传；只有 profile config 中的 `clientLoggingPolicyV1.uploadEnabled = true` 才上传
- 旧策略 `expiresAt` 到期后停止上传，继续保留该过期授权作为拒绝条件，不回退到可能更宽松的本地策略；D-075 新策略详细 info 到期仅关闭详细日志。Pages 必须显示真实授权状态与期限，不能只依据 `uploadEnabled` 显示“已开启”。

### 隐私边界

日志不得保存 token、password、cookie、JWT、完整邮箱、孩子姓名、完整 URL path/query、页面文本、DOM、输入内容、鼠标坐标、截图、本地 Chrome profile 路径或 API 密钥。允许保存 domain、模块名、事件代码、错误类型、脱敏消息、profileId、deviceId 和扩展版本。

### 与现有诊断关系

- `__timingTrace`：位于 `chrome.storage.session` 的细粒度当前会话 trace，覆盖 timing signal、checkpoint、mode boundary 等高频过程；生产记录必须紧凑化，最多 200 条且不超过 512 KB，不保存完整 URL、大型 stats/session 快照或无界 payload
- `foreground_page_diagnostics_v1`：前台计时健康统计
- `timing_checkpoint_health_v1`：最近一次 checkpoint 健康摘要，包含 foreground/media 前后计数、mode boundary 队列状态和 ledger gap 状态
- `cloud_v1_last_sync_error` / outbox retry：当前同步状态摘要
- `client_logs_v1`：有界 warning/error 上传缓冲，只记录异常、fallback、gap、重要健康结论；不重复记录所有正常过程

### 云同步故障 incident 收敛（D-072）

- 扩展使用固定大小的 `cloud_failure_incident_v1` 保存活跃云同步故障的脱敏指纹、首次/末次时间、累计次数、最近一次实际日志时间和恢复状态；不得保存响应正文、URL、token、账号或原始请求内容。
- 同一错误类型、端点/子系统和严重性在 30 分钟内重复发生时，只更新 incident 计数和末次时间，不重复写入 `client_logs_v1`。错误类型、端点/子系统或严重性变化时立即记录新 incident。
- 完整云同步恢复后关闭全部活跃 incident，只写一条恢复摘要。该机制只压缩诊断日志，不改变请求重试、指数退避、outbox ACK、错误等级或上传顺序。
- `AUTO_MODE_PENDING_CANCEL` 是 best-effort 清理：目标页面没有 Content Script 时等同于没有待清理弹层，静默成功，不产生 warning 或系统通知。START/SUCCESS、Rest 软限额提醒及其可见投递门禁仍按严格 ACK、重试和完整 Reminder 降级处理。
- 客户端日志上传单批最多 100 条，Worker 使用 D1 `batch()` 幂等写入并返回 `acceptedIds` / `rejected`；扩展只删除明确接受的日志。日志 POST 只做一次请求尝试，失败由下一轮同步处理，避免日志上传故障反过来制造长时间 Worker 请求和本地日志放大。

### 网站归类同步确定性终结（D-073）

- `/device/site-classification-requests/v1` 的逐项错误必须区分“可重试失败”和“当前配置已给出确定结果”。`ALREADY_CLASSIFIED`、`REQUEST_REJECTED` 属于确定性终结：本地保留原始记录并写入 `syncStatus=resolved`、终结代码、当前分类、来源和终结时间，清除 retry metadata，不再进入 pending upload。
- 确定性终结不是云端成功保存申请：不得生成 `cloudId`、不得标记为 `uploaded`、不得伪造家长审批。网络失败、`SERVER_ERROR`、`upload_missing_ack` 和未列入终结集合的代码继续重试。
- 同一批响应中的 saved、resolved、failed 和 missing-ack 必须互斥；同步摘要中的 `failed` 与 `errors` 不得包含 resolved 项，避免 `cloud_sync_completed_with_errors` 持续放大。

### 原始 segment 原子上传与逐项确认（D-074）

- `usage_segments_v1` 与 `media_segments_v1` 的本地 segment ID 是上传幂等键。Worker 在写入前必须完整校验批次；合法项通过一个 D1 `batch()` 事务执行 `INSERT ... ON CONFLICT(id) DO UPDATE`，禁止逐条 `SELECT` 后再写入。事务失败时不得返回部分成功。
- Worker 成功响应必须包含 `acceptedIds` 与结构化 `rejected`。客户端只清除 `acceptedIds`；被明确拒绝的 ID 记录短错误码，缺失 ACK 的 ID 保留 pending。兼容旧 Worker 时，只有响应明确 `success=true`、无失败且 `count` 等于请求数量，才允许整批 ACK。
- 新客户端原始 segment 批次小于既有 200 条上限，并对该类 POST 只做一次请求尝试。超时、503 或网络失败由既有跨同步退避接管，禁止同一轮连续重发可能已经提交的批次。
- 当日原始 segment 未全部确认时，本轮停止日、小时、目标和小时目标物化上传。历史补传在推进日期水位前必须读取 `/device/stats-integrity/v1`，并确认远端原始账与四层物化均与本地账本一致。
- 该机制不修改 segment 内容、网页 ACTIVE、媒体证据、模式、配额或历史数据；它只保证传输幂等、确认准确和物化顺序。

### Timing / mode 审计口径

- 计时落账链路使用 `__timingTrace` 记录过程，使用 `client_logs_v1` 的 `checkpoint` / `ledger_gap` category 记录可长期排查的缺口：例如系统观测到 eligible active tab 或 media fact，但 checkpoint 后没有 open session 或 durable segment。
- 模式切换链路使用共享 `auditId` 串联 `REQUEST_MODE_CHANGE` / `EVALUATE_QUOTA_STATE`、Mode Service decision/commit、mode boundary intent、dispatcher consume 和 active tab recheck。`mode_transition` category 只保存重要结果、warning 和 error。
- 这些日志不读 Chrome History，不反推补写历史，不改变访问控制、配额或统计读取行为。

### 系统网站分类一致性与历史更正（D-081）

- `/device/config` 的有效 revision 由 `profile.version` 与 `system_access_config_v1.version` 共同组成。终端必须分别保存并比较两者；任一分量变化都重新保存配置并更新声明式规则。为兼容旧终端，响应中的 legacy `version` 使用单调组合值，不能继续只返回 profile version。
- Profile 持久 JSON 只保存 `customStudyList`、`customCompositeList`、`customRestrictedEntertainmentList`、`customBlockedSites` 及其他用户配置。`default*Sites`、`studyList`、`compositeList`、`restrictedEntertainmentList`、`unsafeList` 是读时派生值；旧 Profile 中的冗余值仅可用于一次性迁移自定义项，不能覆盖当前系统库。
- 系统网站配置 PUT 必须携带读取时的 `expectedVersion`。Worker 以 compare-and-swap 更新当前 head，并为每个成功版本保存不可变快照、配置摘要、操作者和原因；并发旧页面返回 409，禁止最后写入者静默覆盖新版本。
- Worker 在读取和写入两端应用高风险分类不变量。受保护站点若出现在错误主策略中，读取端以正式策略自愈，写入端明确拒绝并返回域名及目标策略。Pages 只负责展示错误，不是唯一防线。
- 历史归属修正使用 `usage_segment_corrections_v1`。每条更正绑定原始 segment ID、原始归属、有效归属、批次、原因、批准人和时间；同一 segment 只允许一个当前有效更正。原始 segment 的 ID、起止、duration 和内容不得改变。
- `/device/config` 同时下发 profile、system access 与近期 correction revision。revision 包含更正日期窗口、条数和最新写入时间；任一组成变化都必须重新拉取，确保新增更正生效且移出近期窗口的更正不会永久残留。
- 统计与配额读取使用 effective projection：未更正行读取原始归属，更正行读取 correction 中的 classification/mode/quota bucket。云端物化、V2 设备/档案账及终端下发必须共享该 projection，禁止各层单独打补丁。
- 本次 `cg.163.com` 修正仅重归属已经存在的本周分段，不补时、不删时、不合并分段。更正前后网页总秒数必须完全相等；Study/Rest 桶变化必须逐 segment 可解释。

### 未归类转受限娱乐的本周自动调账（D-093）

- 家长将一条未归类审核记录决定为受限娱乐（内部 decision `reject`）后，Worker 以该记录的服务器 `id` 与上传时保留的 `client_request_id` 作为同一审核记录的精确关联键，处理决定发生所在北京时间周内的 `active` 网页分段。
- 仅 `target_rule_id` 精确等于该记录 `id` 或 `client_request_id`，且原分类为 `pending_composite` / `unclassified` 的分段可自动调账；旧分段缺少精确关联时保持不变并留待人工核查，禁止仅凭同域名批量迁移。
- effective projection 固定为 `restricted + rest mode + rest quota bucket`。原始 segment、duration、domain、上传确认和媒体账均不改；原 Rest bucket 不重复增加，原 Composite bucket 才转入 Rest。
- 同一 correction 同时驱动 V1 统计读取、V2 设备/档案账和终端配额读模型，因此“今日”和“本周”只是同一有效账的不同聚合范围，不分别保存调账结果。
- 审核完成时立即补调云端已有分段；之后迟到上传、但仍携带同一 `targetRuleId` 的本周分段在入库后继续幂等补调。定时自愈会重扫近期已决定为受限娱乐的审核记录，避免瞬时失败永久漏调。
- 本机制不处理归为学习、复合或黑名单的历史归属，也不改变网页 ACTIVE、checkpoint、idle、焦点或结算语义。

---

## 6.3 任务管理 V1（Draft，尚未实现）

任务管理 V1 的当前产品规格与技术结构分别见：

- `docs/specs/SPEC-002-TASK-MANAGEMENT.md`
- `docs/specs/SPEC-002-TASK-MANAGEMENT-TECHNICAL-DESIGN.md`

当前状态仅为 Draft：仓库尚未实现任务表、任务 API、设备任务同步、任务运行时策略、任务进度投影或相关 UI。技术设计拟采用独立 `tasks_v1` / `task_events_v1`，并让现有 `usage_segments_v1` 承担任务有效使用时间的唯一事实；这些内容在 Product Owner 批准前不属于当前运行基线。

进入代码前必须先整理并提交当前工作区已有改动，确认工作区干净，fetch 并对齐最新 `origin/master`，再创建 `codex/task-management-v1`。任务代码、migration 和测试不得与其他功能提交混合。

### 6.4 未归类网站邮件归类 V1

`POST /device/target-stats/v1` 成功写入后，会在请求响应之外评估本次 profile/date 的未归类用量。评估只读取 `target_classification_at_time IN ('unclassified', 'pending_composite')` 的每日 target rows，按 `canonicalSiteIdentityHost()` 合并 `www.` / `m.` 主站 alias，并跨设备、统计维度累加 `duration_seconds`。

达到 1800 秒（30 分钟）后执行：

1. 重新加载当前 effective 网站配置和 pending records，已经分类则停止。
2. 创建或复用 `recordSource=auto_unclassified_access` 的 `site_classification_requests_v1` 记录。
3. 以 `profile_id + usage_date + canonical_host + notification_type` 创建每日唯一 outbox。
4. 立即尝试 Resend；失败按 5 分钟、30 分钟、2 小时退避，最多四次总尝试。统计上传成功与邮件投递成功互不绑定。

历史 outbox 的内部 `notification_type` 保持不变以维持每日幂等键。阈值升级时，未发送的旧 900 秒待发记录只有在当日累计确实达到 1800 秒后才会按新阈值重新排队；已经发送或消费的记录不会因阈值变更再次发送。

新增数据表：

- `site_classification_email_notifications_v1`：每日去重、outbox、签名 token 目标、尝试次数、有效期和消费结果。
- `site_classification_email_reply_events_v1`：只保存 Message-ID 摘要、命令、sender match 与结果码，不保存原始正文、HTML 或附件。

初始通知的 From 与 Reply-To 均使用 `TimeOnChrome <reply+<signed-token>@hornburg-xia.uk>`，避免邮件客户端忽略 Reply-To 后误投到不可处理的固定发件地址。Email Routing 开启子寻址并把 `reply@hornburg-xia.uk` 交给 `guardian-api.email()`；handler 必须保留收件地址中签名 token 的原始大小写，只对域名匹配使用不区分大小写规则，并且只读取纯文本第一条非空、非引用命令。执行前必须验证 HMAC token、7 天有效期、精确家长邮箱、pending request、未消费 token 和未处理 Message-ID。

Pages decision API 和邮件 handler 共用 `decideSiteClassificationRequest()`。该服务负责目标规范化、父域/特殊对象/冲突校验、request 状态变更和 profile 配置写入；任何入口都不得另建绕过校验的写路径。

邮件评估只允许接在 `POST /device/target-stats/v1` 成功写入之后，媒体日统计上传不得触发。5 分钟 Cron 除处理 outbox 外，还补扫北京时间当日存在未归类/待归类 target 统计的 profile，避免一次上传后的异步评估失败造成永久漏提醒；每日唯一约束保证重复评估不重复发信。

运行开关 `EMAIL_CLASSIFICATION_ENABLED` 支持显式关闭；未设置时仅在 `RESEND_API_KEY` 与 `EMAIL_ACTION_SECRET` 均存在时启用。`EMAIL_CLASSIFICATION_PROFILE_IDS` 为空表示全部 profile，非空时只允许列出的 profile，`*` 同样表示全部。发布控制值与签名密钥均通过 Cloudflare secrets 提供，profile ID 不进入 Git 或公开部署配置。统计日期超过 `day_end_ms + 24h`、restore 或 import 不触发通知。

#### 6.4.1 账号消息通道与档案触发规则（D-097）

消息通知分成两个独立配置层：`account_notification_settings_v1` 按家长账号保存邮件/Telegram 通道开关及 Telegram 内部连接；`profile_unclassified_notification_settings_v1` 按孩子档案保存未归类超时通知开关和 `1–1440` 分钟阈值。两层均默认关闭，档案功能只有在账号至少一个可用通道开启时才能实际投递。账号通道、Telegram 连接和 Bot 信息不得进入 `/device/config` 或配置导入导出；档案功能开关和阈值作为用户配置导入导出。

Telegram Bot token 仅使用 Worker secret `TELEGRAM_BOT_TOKEN`。家长从“系统管理 → 消息通知”创建 10 分钟、一次性的 `telegram_pairing_sessions_v1`，页面打开 `t.me/<bot>?start=<token>`；Webhook 验证由现有服务端 secrets 确定性派生的 header secret，只接受有效未消费 token，并把 Telegram `chat.id` 内部绑定到当前账号。页面只返回是否连接、Bot 名称和连接时间，不返回 Chat ID。Bot 身份变化时旧连接失效并自动关闭 Telegram 通道。Telegram 首版只支持个人会话和单向通知，不处理群组或消息内分类命令。

接口分为账号级 `GET/PUT /account/notification-settings/v1`、测试/连接/断开接口，以及档案级 `GET/PUT /profiles/:id/unclassified-usage-notification/v1`。达到档案阈值后，评估服务创建或复用统一审核记录，并为账号启用且可用的通道分别排队；两个 outbox 仍按 profile/date/canonical host/channel 每日幂等、独立退避。`EMAIL_CLASSIFICATION_ENABLED` 仅作为邮件基础设施紧急总闸，旧 profile allowlist 不再参与业务选择。

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

---

## 8. Agent 执行规范补强（2026-04-27）

### 背景
OpenCode 在执行 Popup P0 UI 任务时，出现“等价替代 / 自行简化 / 未逐项对照确认方案”的行为。需将“已确认方案必须严格逐项执行”写入仓库级约束。

### 变更内容
- `AGENTS.md` 新增第 7 节：执行合规性规则（Plan Conformance / UI Change Boundary / Commit Gate）
- `DECISIONS.md` 新增 D-014：Agent 必须严格遵循已确认的实施方案，不得擅自简化、替换或偏离

### 影响范围
- 仅文档变更，无代码逻辑改动
- 所有 AI 执行器（Codex / OpenCode / Claude Code 等）均需遵守
# D-114 可复用来源核验终端适配（2026-10-03）

正常诊断文案分开报告三状态：当前连接只表示通道；“孩子身份确认”有效时显示“已确认（同一孩子／当前连接）”，未建立／已失效保持明确；逐日“当前贡献接收”仍只读取当前Native贡献ACK，不推断成功。新V2能力显示“可复用孩子身份核验”。仅formatter文字，不改布局、HTML/CSS或状态真假语义，沿用既有聚焦view测试，不操作正式Chrome。

本批职责extension-local，仅源码、聚焦测试和本地集中提交，不改候选、不推送部署。固定包源2d054c789ded8660a138d25f0130d9d88abf8aa4。补核V2稳定身份码逐层透传，业务拒绝不关闭健康Port；当前租约须同Port、同scope及完整policyIdentity，首次verifiedAt处于proof有效期。过期仅允许既有连接租约延续，断线重连必须重新验证有效proof。验证限定绑定、贡献同步兼容、Native通道、诊断专项及typecheck；正式Chrome与联合云端/Service实机验收不在本批执行。

源码验证结果：四项聚焦测试通过，含固定公钥验签/篡改/错scope/到期、缓存跨Port重验、过期断线不复活、改绑/完整策略变更、重复及缺字段ACK、迟到响应与旧端兼容；Native稳定错误仍保持健康Port，诊断显示连接与身份分离。类型、扩展根及diff检查通过，未修改HTML/CSS，不新增页面目视闸门。源码通过不等于真实Service或未部署云端已完成联合验收。

按已批准裁决消费固定契约1.31.0（包SHA256：355c558784807b43e2e02f0b12c8ab221ecf9ffa38330f8ae48c644507c55395）。能力shared-web-source-reusable-v2明确选择getSharedWebSourceScope、bindSharedWebSourceV2及replaceSharedWebContributionV2；新能力失败不降级，能力缺失保留v1。machine-scope仅作为设备鉴权取得web证明的签名范围输入；Native以可信当前分配验签，扩展不自授身份。有效web证明按本机身份与签名scope缓存，重连必须本地重新绑定；过期重连必须重新取得证明，不能延长旧租约。连接、身份或策略变化撤销在途结果及Native贡献确认；原统计、贡献队列、载荷哈希、云端ACK及执行门禁保持不变。

只改终端契约消费、消息校验、身份适配及最小相关测试。通道在线、verified身份和贡献ACK仍是三个独立状态。固定错误码，不记录签名证明、凭据或原始身份；不更新候选、不安装、部署或启用家庭执行。HTTP包装须依据云端实际路由和聚焦测试核对，不能以success/count猜测确认。
