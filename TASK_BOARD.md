# TASK_BOARD


# TASK_BOARD

## 持续目标恢复：修正应用统计同步并集中测试（2026-10-06）

只读审核已完成，持续目标“制定方案修改并测试”恢复实施。保留审核发现及全部工作现场，先完成固定Child清单／云端范围核验／共同兼容测试，再交Native接冻结及发送入口，并用真实v3生成的脱敏清单经鉴权HTTP核对云端持久读数。未提交Host秒读取草稿不混入本次固定包；对应独立兼容失败继续登记，不改其协议内容来凑通过。原账上传缺口、应用真实重叠规则及历史分类缺口分别保留，不把统计局部通过当完整同步通过。

checklist／允许路径：usage-account契约、schema、共同向量、版本及固定包；applicationAccounts／Publication／StatisticsNative范围核验与对应隔离回归；现有TASK_BOARD／DESIGN。本次先修已证实的能力断言及新增孩子范围篡改回归。Native只由所属会话处理，旧policy或产品关联不得自动否定有效原始时长。最小测试为本任务契约、两组Worker统计、typecheck、diff，干净候选仅隔离组装编译（不是新worktree）；不修改网页、不安装部署、不执行migration、不启用共享、不运行全平台。接收／读取测试须证明旧A补发、两用户及家庭隔离、重复／下降替换；真实v3发送和正式页面证据缺失仍保持未完成。

### 本轮已取得的同步证据（2026-10-06，非生产验收）

固定契约1.37.0已本地提交`97326bc26fc02960a66119e8e221600de710d84e`。从该SHA已跟踪文件隔离编译打包，未包含Host秒读取草稿；包SHA-256为`0fcb0ac08129f1ee0301cf4a6aca4f3271697482599da73db508650c40c619a7`。共同向量及干净兼容检查PASS，包含8项网页现行日／小时纯函数对照。完整工作现场中的Host草稿兼容失败不被此结果掩盖。两组Worker统计100/100、typecheck、Wrangler4.127.1 dry-run和源码边界PASS；未部署。

真实Native生成的合成请求已纳入`backend/test/application-child-native-generated.json`；源为同一SQLite的180秒周期段＋10秒改绑尾段、固定孩子A，通过现有上传器捕获begin／PUT原请求，而非另造统计。`application-account-publication.test.ts`直接发送该begin／chunks，经机器鉴权HTTP→发布→持久读取→RuntimeComputerUsageService→正式页面秒适配均为190秒，当前分配B未收到A用量、重放不累加、无旧原段／旧策略历史前提。applicationUsage的角色归属缺口保持独立不完整，不抹掉有效总量。输入JSON逐字段保持不变；首次RPC失败为隔离Guardian替身未登记固定合成家庭/孩子，补固定测试pair后通过，生产权限逻辑未修改。该证据不是线上页面或生产上传验收。

Native集中交付已核对`main@3cd5a1052504b0c187d89a68080106fc332da174`且工作区干净；当前1.37／上一兼容1.36矩阵TRX各116/116，最终`child-submission-137.trx`21/21，均0失败，Service编译通过。固定合成原请求文件`agents/windows/tests/TimeOnChrome.AppRuntime.Core.Tests/Fixtures/application-child-v3-wire.json`SHA-256为`60f338b663558a8d708547203c3e8c8ac7aabadf7797ec66df21a4e16f670736`；云端副本仅加结束换行，JSON字段及统计hash均一致。正式Manager及Mac v3接线不据此宣称通过。

| 对照项 | 网页实际入口／证据 | 应用实际入口／证据 | 判断 |
|---|---|---|---|
| 孩子与来源归属 | 网页设备凭据与profile关联；profileAccountsV2按profile读取设备head | begin按机器凭据＋精确历史用户分配核对冻结childId；发布／读取再次核对；HTTP回归A→B旧A补发和两用户隔离通过 | 云端Matched；本机新发送链待贯通 |
| 同版冻结、分块、ACK | cloud-sync上传device account manifest／chunks／commit并核对revision | 复用ApplicationAccountUploader已有begin／status／chunks／commit；新v3实际生成请求及云端100项回归通过 | Matched，仅源码／隔离证据 |
| 替换与更正下降 | profileAccountsV2按来源head替换并生成孩子日／周版本 | applicationAccountPublication按来源revision替换；51→40及旧commit重放不回退、不累加 | 云端Matched |
| 原账不阻塞完整统计 | 网页统计清单发布与原账诊断分离 | validateApplicationAccountSnapshot核对结构／hash／授权，不要求旧策略版本或原段到齐 | Matched；不等于新原段上传已实现 |
| 孩子日／周持久读模型 | profileAccountsV2发布事务写day／week generation及head | 应用来源快照已持久化；applicationStatisticsNative仍在查询时按来源／日期归集 | Deviated，未在本轮顺手重构 |
| 新原账→新统计→HTTP→页面 | 网页已有正式调用链，现行实现不变 | 纯v3实际生产器／发送器请求到云端及页面正式适配器均190秒；真实运行机器及线上界面尚未验证 | 隔离链Matched；实机证据Missing |

PO再次明确确认继续Windows统计接线，已恢复Native所属会话执行，仅代码与隔离测试、不含Mac守护、不安装部署。旧原账v3的awaiting_receiver与派生统计发送分开：原段接收缺口不能伪装完成，也不能再次成为有效派生统计发布前置。实机多用户、真实改绑、锁屏／休眠、完整Service重启及Mac验收沿用已登记延期；不反复要求安装。

仍未完成：同日V2/V3完整兼容、真实重叠秒并集、孩子日／周持久汇总以及原段v3云端接收。Native已加入同源修订接续及混合源覆盖保护：新修订续旧持久水位；有有效旧事实／非零旧head时不允许仅v3子集替换，保留旧值并标明缺口；合法90秒估算只作诊断，不否定已确认原时长。保护成功不等于混合统计实现，不能宣称整体已对齐。共享、历史还原和Mac均不顺带推进。

## 当前第一步：应用原始落账修订（2026-10-05，PO已逐项批准）

本节取代下节“先贯通派生统计到云端”的执行顺序。当前只保证新应用原账：开段固定Child ID，业务键Child ID＋Segment ID，Windows用户／机器／分配版本为来源属性；时长整数秒、北京时间日边界及小时分配对照网页；180秒主使用切片、90秒估算及正常延迟尾段保留。改绑先持久结束旧孩子段再开新孩子段，失败不得丢失旧会话。旧毫秒原账不可变，不猜补归属；新格式接收端未兼容前持久待发送。

职责／清单：architecture-integration修改既有决策、原账契约、共同向量和最小契约测试；Native所属会话实施Windows状态机／SQLite／恢复及直接消费者。网页只读、媒体辅助账不改。最小验证为契约、Child隔离与改绑、5小时切片、延迟／确认失败／恢复、跨日秒分配、持久化失败及重复重放；实机另记。复用分支和工作树，不安装、不部署、不执行生产migration、不启用共享。当前为实施中；此前原账已对齐结论失效。

架构交付：新增application-ledger.ts／v3 schema／共同vectors及聚焦测试，Contracts候选1.36.0；typecheck、构建、原账哈希／单位／孩子篡改拒绝、8项直接读取网页纯函数对照、旧契约兼容、源码边界与diff检查通过。候选只从be39f0c已跟踪契约基线＋本轮7个契约文件组装，不包含既有native-host和秒读取未提交草稿。固定包位于本地81a1的.tmp/application-ledger-contract-candidate-1.36.0/timeonchrome-app-runtime-contracts-1.36.0.tgz，129158字节，SHA256 `eca40857e7d3c5ca738bdb70210f1fd3d038ae7e415fbacb244ce35267c53f08`。旧v2 schema SHA256 `b2c30e86d6d5f7d995a547165a275f93631cf91926d08e8de9f963daa765a739`未变；网页对照源SHA256 `f82ad3d9752cb90e4a271b4d12a1fc6aa9c8f623a8685908082da17e6ad5f87e`。Native已接收执行交接并在实施，不代表源码／实机验收完成；checkpoint/repair/ownership/reassignment向量必须由Native真实入口与SQLite测试覆盖。

### 本轮实施审计与验收缺口

契约提交 `c26235f94a72667d5a626263227829e27b46ae14`，固定1.36.0包哈希如上。Native原账提交 `5d629e3026a642e21c7ea798f2b3736247ca9495`；快照切换修复提交并推送 `9afff6f0c37791130fe18ede43361ea1e05ead46`，只改状态机、聚焦测试和既有实施记录。具体命令及TRX位置见Native仓 `agents/windows/APPLICATION-RAW-LEDGER-V3-2026-10-05.md`。以下结果来自实际TRX和隔离观察摘要，不代表已安装Service已采用v3；本机仍运行2.6.34.0。

| 要求 | 证据与判断 |
|---|---|
| 固定Child ID／整数秒／内容幂等 | Matched：共同契约与真实SQLite测试；归属和秒量进入canonical hash，不依赖旧分类版本。 |
| 180秒切片／正常迟到留尾／90秒恢复 | Matched（隔离）：连续5小时合成时钟生成100个180秒段；失败、缺段、重启和日／小时共同向量通过。真实关闭／改绑不全补长失联区间。 |
| 改绑原子提交／失败不串账 | Matched（隔离）：旧段、待发、新边界和策略恢复journal同事务；失败回滚、重放及冻结旧孩子恢复通过。 |
| 旧账／网页／媒体边界 | Matched（本轮源码及回归）：旧v2 schema不变，网页只读；媒体保留原60秒／恢复30秒路径，实际probe失败输入隔离回归通过。 |
| Native契约消费与最小验证 | Matched：锁包SHA及来源c26235f一致；修后1.36 TRX为103/103、1.35为102/102；114条合成producer/SQLite wire经固定JS契约核对通过。Service及原隔离采样器编译零警告／错误，采样器Core DLL哈希与修后源码构建一致。 |
| 真实Windows原账 | Matched（本次正常应用切换场景）：9afff6f修后默认桌面真实采样200015ms，4个确认ACTIVE、2个应用／2段合计199秒；有效跨度及并集均199922ms，重叠0。A的0～121016ms落121秒，B从121016ms续至199922ms落78秒，均非估算；Child固定、契约hash有效。旧5d629e3样本4段259秒／重复60016ms保留作失败证据；前两次空采样已定位沙箱前台不可见及idle。此次未出现180秒周期段，多用户登录、真实改绑／锁屏／休眠等系统矩阵仍缺实机证据，不能称全部原账场景通过。 |
| Mac源码／实机 | Missing：须按同一固定契约适配，Windows证据不能代替。 |

新v3原账持久待发（awaiting_receiver），不冒充旧格式上传；新账尚未投影时旧毫秒Reader标明SOURCE_COVERAGE_UNKNOWN，不把缺口当完整零量。未安装、部署、migration或启用共享；快照应用切换重复覆盖已在9afff6f最小修复并通过一次真实隔离复验，其余系统矩阵和Mac缺口保留，不宣称全部原账验收完成，也不自动进入统计→上传→云端读取。Extra：无业务扩展。既有native-host／秒读取草稿和混合未提交审核内容仍保留，不进入本轮固定包，也不将混合工作区当作发布基线。

2026-10-05 PO明确批准修复：直接位置为Native `ApplicationAccountingV3.cs:135`，新目标没有lane时，原Checkpoint均按`max(bindingStart, previous, now-90s)`补开，未区分Snapshot已确认的应用切换。4段契约解析／canonical hash均有效，说明传输校验不能发现这类跨段错误；旧98项及112条合成wire漏掉普通Snapshot切换，不能替代实机准确性。补测后旧代码5项中2失败，真实Snapshot→Projector→Session→SQLite单项也失败，错误精确为重复60016ms／259秒。9afff6f将已有前台段的替换从当前确认边界开段；真正缺段90秒、180秒尾段、PiP、媒体、Child和契约不变。修后同输入2段合计199整数秒、重叠0，不使用统计并集掩盖原账错误。旧失败TRX保留。23:52起按新SHA重建原隔离采样器，Core DLL SHA256 `1fd03b94af7371a58b7a68ffae2b080f1bc6766e7a12b5b22a2628ef7c9c5655`与源码构建一致；真实切换复验两段121＋78秒、边界衔接及重叠0，stderr空。脱敏摘要为Native本地`.tmp/application-raw-v3/fixed-f523ba5ee2ef4c9c873e210cbb1aebf9-stdout.log`；真实身份只留隔离临时库，不上传或写入文档。Matched＝本次切换修复／自动回归／隔离真实复验；Missing＝其余系统矩阵及Mac；Deviated／Extra＝本次无新增。不能推断旧安装2.6.34亦有相同错误。

### Windows原账最小收口验收（2026-10-06，发现阶段；后续修复结果见下）

只补一次固定9afff6f源码的200秒同应用前台隔离采样：要求真实ACTIVE、180秒周期段及衔接尾段、原始重叠0、固定合成Child和逐段整数秒；若活动条件不足或发生应用切换，本场景记未验证，不自动重采。既有切换实测及103／102项证据复用。Native所属任务核对Service分配→开段→策略改绑→事务→恢复的实际调用及既有覆盖；缺Service入口证据时只补对应隔离回归，不以底层Session测试冒充已接线。发现错误先回报原因和最小修复，不顺手改产品。允许路径为既有任务记录及Native所属测试；根任务不代改本机源码。最小检查为本次隔离SQLite／固定契约／哈希、必要新增入口回归及diff；不跑全量或重复已有矩阵。未安装、部署、迁移或启用共享，新v3仍待接收端兼容。当前：本轮采样及接线审查已完成，周期场景通过，Service归属竞态未修复，因此核心原账收口未通过；系统矩阵和Mac单列。

Service接线Deviated（源码竞态／下层可执行后果已复现）：`RuntimeServiceCoordinator.cs:1638–1639`在stateGate前读取旧assignment／rawAssignment；`SyncPolicyOnceAsync`在同锁内提交新分配并更新appliedPolicy。等待中的事实随后可能用旧捕获A覆盖已生效B；事实时间晚于改绑边界时，stale边界保护不能排除这条路径，且SnapshotFor会混用新policy与旧assignment。影响为改绑后新段可能回属旧孩子，或撤销保护后旧判断继续有效；不能作为历史P2搁置。Native仅测试及既有实施记录提交 `6dbad888dafcbfa41a3ea2f635c390e21f751b38`，业务源码未改。两项诊断用例2/2表示复现缺陷：150000ms提交B／版本2（另一项撤销保护），150001ms按旧捕获A／版本1回绑，330001ms已在A新增180秒，restore仍A／1而journal保存新策略。证据为`service-binding-stale-reproduction-final.trx`；不是完整Service线程调度或生产已发生故障的证明。最小建议是拿锁后捕获同一policy并解析分配及Snapshot。完整Service构造固定机器路径，现有下层测试不能证明完整实例接线；安全隔离测试入口需覆盖全部存储依赖路径与可控API／时钟，经正常构造执行单次事实／策略／恢复，不启动WTS、pipe或后台循环。修复及该测试入口属于下一步业务源码范围，本轮只报告，不能用未初始化反射替代或触碰真实服务。

周期实测Matched：2026-10-06 00:03起，唯一一次200032ms采样取得4个确认ACTIVE、同一应用的2段。固定契约直接核对：`[0,180000]`落180秒periodicSnapshot；`[180000,199938]`尾段落19秒sessionUnavailable，两段均非估算，边界连续；原始span／union199938ms、重复0、逐段floor一致、Child固定、canonical/hash有效，outbox两项均awaiting_receiver。摘要为Native本地`.tmp/application-raw-v3/periodic-274283c162b24c4a8f550ea39ac92e3c-stdout.log`，stderr空；采样器Core哈希与9afff6f一致，不改运行服务／真实账本，无网络。最终本轮审计：Matched＝一次180秒周期＋尾段实测及旧正确性证据复用；Deviated＝Service分配锁前捕获竞态；Missing＝完整隔离Service入口及该竞态修复后验证，系统矩阵／Mac另列；Extra＝无。尚不推进统计上传、云端接收或共享。

### Service孩子分配竞态最小修复（2026-10-06，源码与目标入口回归完成，未安装）

本次最小修复获PO明确批准（“修复吧”），Native集中提交并推送 `78d0bb672fd88839160d7ec16a87fb65f66d8984`。仅改RuntimeServiceCoordinator、新增ServiceApplicationBindingTests及既有原账实施记录。事实入口先取得stateGate再检查ledger／appliedPolicy，捕获同一currentPolicy用于assignment、rawAssignment和SnapshotFor；不会因等待锁前的旧捕获值回绑旧孩子。生产无参构造、路径和默认时钟不变；内部测试注入在全部存储依赖创建前生效。

根任务直接核对前后TRX与源码：真实Coordinator三入口（ApplyFactAsync／SyncPolicyOnceAsync／InitializeLedgerAsync）以正常构造及确定性屏障执行。旧实现6项中2失败，确认为A→B后仍A及撤销保护后旧会话未清；修后原6项通过，补直接必要的未分配／defaultChild不回补并加强journal恢复后新段归属，最终7/7通过。旧A payload与outbox逐项保持，用户及同孩子不同来源独立；无实际网络，全部存储路径在临时根，无WTS、pipe、StartAsync或后台循环。证据为Native本地`.tmp/application-raw-v3/service-binding-entry-before-fix.trx`和`service-binding-entry-fixed-final.trx`；准确命令在既有实施记录。Service编译0警告／错误，职责检查与diff通过；复用此前103／102及180秒真实周期证据，不重复全量或实测。

本次审计：Matched＝锁内同策略修复、目标Service入口隔离回归、旧账保持及最小编译；Deviated／Extra＝无；Missing＝真实升级后的多用户／改绑、完整运行生命周期和Mac实机等尚未验收项目。原竞态不再是源码阻塞，但不等于运行服务已更新或全部原账场景通过。本轮无出包、安装、部署、migration或共享启用；状态机、秒分配、180／90秒、媒体、契约与历史账未改，统计→上传→云端读取仍属下一步。

### 原账实机验收缺口延期登记（2026-10-06，PO明确决定）

以下项目登记为Missing／待验收，本轮不补测；Windows项目在后续正式上线前再确定测试范围及处理方式，Mac稍后统一执行。不将延期解释为通过、风险豁免或正式发布批准，不覆盖已取得的自动化及真实周期／切换证据；这些未执行场景不阻塞当前后续链路开发。

| 待验收项目 | 当前缺失证据 | 后续处置 |
|---|---|---|
| 实际多用户登录 | 真实Windows登录／切换及各用户Child归属；隔离用户用例不等于现场验收 | 正式上线前确定如何处理 |
| 真实改绑 | 实际分配变更两侧原段、续段及待上传归属；隔离改绑／竞态回归已有证据 | 正式上线前确定如何处理 |
| 锁屏／休眠 | 系统事件到采集与原账的真实边界／恢复证据 | 正式上线前确定如何处理 |
| 完整Service重启 | 实际服务完整初始化、Agent重连及后台生命周期；单次恢复入口已有隔离证据 | 正式上线前确定如何处理 |
| Mac测试 | Mac独立源码适配、编译与实机矩阵，不能沿用Windows结果 | 稍后统一执行，本轮不启动 |

本次仅更新既有任务板，无代码、协议、安装、部署或真实运行状态变更；纯文档检查diff，不重跑产品测试。

### 当前全链状态：定秒口径已批准，继续生产生成与调用接线（2026-10-05）

- 最新收口：Native已提交并推送`08c51331a077dc2884abdb1da5bf6348901b1b33`，实际原账→日边界定秒→同事务versions/head/outbox→冻结补发→内部同版秒读取已接通，新旧契约1.35／1.34最终TRX各175/175，工作区干净；不是旧37项调度证据。云端实际生成fixture链路提交`c96b1c5`，70/70及typecheck；最新Runtime dry-run通过，510.52 KiB（gzip104.61 KiB），未上传。缺口已收窄为外部Bridge／Manager秒消费者、生产能力与匹配安装版本及真实当日页面；Mac平台接线独立回报。Native正只读评估旧Ms接口在秒head启用后的影响，未经消费者核对不得把内部读取或云端fixture称终端完整可用。此前下方“Native生产生成未实施”是阶段记录，由本条覆盖。
- 边界冲突已集中裁决：PO明确采用北京时间日边界定秒，接受跨午夜不足秒两侧可能共少1秒。日内独立并集定秒、小时按网页余数分配；日级父子上界与各维度日／小时守恒保留，v2取消跨维度小时上界，v1不变。实施仅现有usage-account契约／黄金回归、Runtime发布与秒读取校验、Native生成及接线；共同候选集中为1.35.0，保留1.34固定包。最小验证为契约build／固定回归、实际发布与读取聚焦测试、typecheck及diff；不改原账、网页、页面布局、配额、安装、部署或migration。1864f0f仅调度修复，37项不能算生成主链完成。
- 该边界云端源码结果：新增显式validateUsageAccountDimensionsV2，接通清单创建、实际commit、发布、持久读取四处；v1校验保持不变。实际Windows／Mac协议上传及读取小时错位用例通过，publication共68/68、backend typecheck通过；契约build、usage-account固定用例通过。首轮遗漏commit旧校验被真实上传测试抓到并修复；compatibility首次因固定包版本断言仍1.34失败，已同步1.35后复验。Matched＝已批准校验及云端上传读取；Missing＝Native生产生成、安装／生产全链；不以本地D1测试称实机完成。
- 本段源码已提交88bb96fa36f291692bd8d47360d6d9bb22e2e12a（现有云端分支，未推送／部署）。集中候选output/contracts-seconds-candidate/timeonchrome-app-runtime-contracts-1.35.0.tgz，121950字节、SHA-256 `5f700b86f4af4c216cb1054e8c41b749a96a5762d8d4d1a276280dbce231acf6`；package元数据、usage-account源码／vectors／schema／JS／声明六文件与源码逐字节匹配，实际包V2校验导出可用。1.34旧包未覆盖，新候选已交Native消费；Native实际文件差异已包含ApplicationSecondsProjector、ApplicationAccountStore物化分支与Service能力接线，尚在测试，不标记完成。
- 集中补验范围：只使用Native隔离原账测试实际导出的52秒与小时错位1秒清单／分块，作为脱敏backend test fixture；通过实际机器鉴权routeV2 begin／chunk／commit、持久读取及生产页面适配器验证，不复制生成算法、不改契约候选。原始机上数据库不读取或归档。仅publication聚焦／typecheck／diff；这是跨实现隔离链路证据，非生产安装或真实家庭验收。
- 集中补验结果：实际C#生成的52秒／30行及1秒／31行清单通过云端机器鉴权上传、哈希核对、持久发布及生产页面适配读取，publication 70/70、backend typecheck通过。Matched＝实际生成输出至云端和页面数据链；Missing＝生产发布、安装后的真实当日读取及本机消费者接线验收。契约1.35固定候选未修改，原账、网页、配额与生产均无变更。

- 云端／契约／页面源码已本地提交4afdfd0／234f5ad／fdb5dbe／5b50690，未部署。固定1.34.0候选哈希不变；Native已直接核对既有人类授权，重复授权要求撤销，不再作为阻塞。
- Native提交d3144b1eac8e7ec84605b8915c7ba2bd0cfca8f2：显式秒wire、平台能力门、单位隔离；修复begin确认ID后分块失败覆盖空ID的补发缺陷。
- Native提交0295072c8946a6784cc88a54cd115922571b0df3：完整秒队列不再依赖旧毫秒视图与原账重读的MATCHED比对；保留当前受保护分配、同冻结版本/head、dirty、退避与实际ACK。新旧契约TRX各109/109通过，覆盖无旧published-day补发、12类拒绝和v1原行为。
- 跨语言核对：实际C#测试输出交固定JS契约解析／验维度／验哈希，schema2／seconds、29行／1块、51秒，清单／行／分块全部匹配。此为隔离合成统计，不是实机生成或上传。
- Native提交db57542cbf90f11ac8f45758d89c76d46d5afee6：内部秒查询直接读取同版冻结head／manifest／rows，只读事务、不重读原账、不依赖旧MATCHED或云端ACK；新旧契约各121/121通过，含12项新增读取场景及库文件SHA不变。dirty保留已知统计及截止，范围／产品完整总量仅完整时返回，否则保留KnownTotal并标未知；未接通实际Service／BrowserBridge调用。
- PO明确「采用」：同维度重叠／连续区间先并集，每连续段向下取整秒，再按网页余数规则分配到日／小时；相邻0.6＋0.6秒生成1秒。口径裁决已解除，不再重复询问。实施清单：Native生成／同版持久化→冻结秒补发→内部秒读取实际接线；当前会话核对云端接收／页面同版读取。仅运行受影响生成、持久化、补发及读取聚焦用例，复用既有云端证据；不跑全平台或安装器。
- 仍Missing：真实秒生成及派生持久统计、本机秒查询实际接线／配额／展示适配、生产发布与实机全链。旧查询返回毫秒DTO，不能仅删门后塞秒；不从旧聚合毫秒直接除1000。原账、计时、安装、migration及共享执行均未变。本次只固化已批准口径及交接，不覆盖固定契约候选、不部署。

### 当前验证：实际持久化秒响应与页面适配器对接（2026-10-05）

现有覆盖分别证明上传持久化与页面秒夹具可用，尚未在同一回归直接将实际读取响应交给生产页面适配器。本轮只补这条测试连接：复用现有机器鉴权上传及更正替换场景，将实际app-usage秒响应输入现有applicationSecondsView，核对51秒、20秒更正、明细／分类／小时、原响应不被修改和无毫秒副本。只改Runtime聚焦测试及任务板，最小publication测试与typecheck；不增加产品算法、不改Native或生产。该测试仍是隔离D1调用链，不是实机生成／上传验收。

结果：原生产UMD适配器被测试直接引用，无复制算法或手工构造读取响应。Windows／Mac协议输入通过实际routeV2机器鉴权begin/chunk/commit后，读取实际持久化秒范围，再交给页面适配器；51秒、更正20秒及旧版重放、分类／产品／24小时桶、结算截止、无毫秒副本、原响应保持不变全部通过。publication 66/66、backend typecheck及diff通过。Matched＝来源上传到页面适配数据连接；Missing＝Native原始记录生成秒统计及真机运行、生产部署，Mac此项只是平台契约输入，不是Mac实机。无需重跑页面布局／dry-run，因只修改测试和任务板；不安装或部署，不新建分支／工作树。

### 当前收口：秒统计云端及页面消费者集中提交前审计（2026-10-05）

职责standard-cloud，仅现有Guardian只读来源／路由、两套云端renderer、Runtime页面和相关文档／回归；`tests/unit/computer-usage-cloud.test.js`为精确任务级路径例外，验证Guardian云端读取而非扩展本地实现。审计Matched＝整数秒请求、持久化来源读取、非特殊贡献直接展示、失败保留有效来源、孩子／日期／版本隔离及原入口；Deviated／Extra＝无。Missing＝Native生成上传、秒产品／时间线和真实全链，不能发布为完整已验收。最小验证root typecheck、两个页面JS语法、computer-usage-cloud／renderer／app-runtime-time（8/8）、App Runtime源码边界及diff均通过；复用前轮同代码独立应用及电脑组件桌面／移动mock证据，不称真实登录通过。未改扩展、Native、原账、配额或生产；不推送／部署／migration／安装，未跟踪旧包与.wrangler原地保留。

### 当前实施：两套电脑汇总页面消费权威整数秒（2026-10-05）

核实独立应用renderer已支持秒，而电脑汇总仍仅访问totals.*Ms；本轮在两套相同只读renderer接入schemaVersion=2／durationUnit=seconds，汇总请求显式使用秒单位。直接显示云端总量、来源小计、特殊应用扣除和分类，不在页面计算或取整。旧格式保留显式兼容；现有产品／时间线入口保留，新秒明细未接通显示稳定原因，不伪造空记录。最小验证仅renderer／缓存／请求隔离固定回归及隔离桌面／移动mock截图、diff check；不修改Native、扩展、原账、配额或生产，不创建分支／工作树。Native定秒口径仍待确认，不因其等待停止已确定消费者工作。

本轮结果：两套renderer保持逐字一致，秒汇总请求由现有控制器透传，来源版本／分类直接显示；来源缺失reasonCodes不缓存为成功。renderer固定回归、应用时间8/8及电脑云端回归、diff通过。agent-browser独立会话computer-seconds-81a1仅本地mock，desktop 1440／mobile 390截图保存output/playwright/application-seconds/computer-desktop.png与computer-mobile.png并目视确认；13秒汇总、网页3秒部分保留、真实零值与原入口通过。首次跨沙箱daemon观察异常，经offline doctor核实工具后同权限独立重开完成，不使用用户Profile；本任务浏览器已关闭。Matched＝秒汇总页面消费，Missing＝产品／时间线秒明细、Native秒上传和真实全链；未提交本批、未部署，不能以mock代替实机。

### 当前收口：云端接收发布与秒读取已集中本地提交（2026-10-05）

现有codex/cloud-management提交`234f5ad`，10文件仅Runtime后台及设计文档。三个实际上传／接收／发布／来源读取聚焦文件107/107 PASS，typecheck、职责standard-cloud精确路径检查、diff check和上一轮dry-run通过。完整生产端统计直接成为可读头；不等待原账重算，更正下降及重复／迟到版本按替换规则处理。提交前索引为空，其他页面／Guardian及任务板现场均未纳入、未丢弃；未推送、合并或部署。审计Matched＝本批云端调用链，Deviated／Extra＝无；全目标Missing＝Native秒生成与实际上传、电脑秒页面消费者及真实验收。Native快照确认idle、未实施，明确待定秒作用域及接收聊天直接授权；不把这项称为在运行或测试完成。已集中询问独立并集段定秒口径，未自行选择。

### 当前验证：Runtime 秒接收源码本地构建通过（2026-10-05）

PO确认派生统计、同步接口、配额输入及展示统一整数秒，原始计时记录保留。复用已有接收／读取聚焦证据，本轮使用现有Wrangler 4.127.1运行backend的`npm run dry-run`，退出码0，产物509.99 KiB（gzip 104.51 KiB），明确`--dry-run: exiting now`，没有上传部署、migration、安装或生产变更。首次版本检查仅遇到沙箱日志目录写入限制，dry-run以限定本地构建权限完成。Matched＝单位边界及云端构建；Missing＝Native实际秒生成上传、电脑汇总秒页面消费者及真实链路。应用各并集维度的定秒作用域尚待明确，不能将单位确认解释为全局时间原子分配授权；不修改既有原账或自行增加算法。

### 当前收口：契约真实源码来源已固定（2026-10-05）

仅已验证契约、对应版本锁及设计文档在现有codex/cloud-management提交`4afdfd0da1924df903592dd3d2113821366ea2c3`，没有推送、创建PR／分支／工作树或发布。固定候选SHA-256仍为`1ce2213b738ed5477a0bfc3713b45a310d215df772d85e6504161ca34793c4b1`；归档43个源码／JSON成员与该提交Git blob按规范换行逐一核对，编译输出及新旧导出核验通过。Native所需sourceGitSha缺口已解除并反馈；未提交云端／页面现场全部保留。秒分配作用域建议仍待PO确认，Native直接实施授权待接收聊明确，不把本地源码提交当部署／实机或最终口径通过。契约审计Matched，原账／Native／生产Extra无；全目标仍Missing生成上传、消费者与实机链路。

### 当前收口：秒接收能力与Native实施依赖（2026-10-05）

Native收到交接并核验候选哈希，但回报尚未修改源码；需要候选对应真实sourceGitSha和能力协商条件，并要求接收聊的直接人类授权。因此下文“开始”仅指交接回合开始，不是统计实现开始。不能以旧基线SHA为未提交包填锁。本次固定现有能力接口的秒能力application-statistics-seconds-v2与平台算法，保留旧响应兼容；仅现有接收代码、能力回归及文档，运行聚焦与typecheck，不部署。契约来源提交仍须审计收口，不宣称已交付。

本段结果：现有能力响应已增加application-statistics-seconds-v2及两平台秒算法，旧protocol／schemaVersion／能力保留；能力／上传聚焦26/26、Worker typecheck、diff通过，未部署。已将明确条件反馈Native，候选包内容和哈希未变化。Native另集中提出秒分配作用域：独立维度union定秒与全局时间原子统一分配会产生不同分类／特殊贡献，不能自行选。只读网页源码证实网页以单个原segment的durationSeconds（缺失时floor该段宽度）为分配基准，再按余数分日／小时；它不提供应用并集维度的全局原子规则。该口径仍需集中确认；sourceGitSha、直接Native授权与实机链路仍Missing。

### 当前关键路径：Native秒统计实施已交接并开始（2026-10-05）

依据PO持续Native交接授权及最新整数秒范围确认，向既有TimeWhere Native Host会话下发集中实现任务，工具已成功接受；wait_threads确认该会话active、当前回合inProgress（不是仅排队或旧日志）。此前范围阻止已解除，不再作为当前阻塞。候选固定output/contracts-seconds-candidate的1.34.0及SHA-256 `1ce2213b738ed5477a0bfc3713b45a310d215df772d85e6504161ca34793c4b1`，实施期间不再修改该输入。Native负责秒生成、持久化和实际上传代码／聚焦验证，原始记录保留，统计不混配额余额；不安装、不部署、不建分支或工作树、不启用共享。公共代码兼顾Mac契约，但Mac实机单列，不增加Mac守护。当前仍未取得Native完成证据，云端源码未发布，实机链路未验收；不能把任务启动标为完成。

### 当前交付准备：核验当前源码秒契约候选（2026-10-05）

原contracts目录1.34.0包早于电脑秒投影变更，不再代表当前源码。本次build后在固定ignored output/contracts-seconds-candidate生成本地候选，保留旧包；核对实际包内usage-account及computer-usage源码／schema／vectors／编译文件，动态核验新旧导出，记录SHA-256。不更新Native锁或发布契约，不安装、部署、操作R2。最小验证为契约build、单位及兼容固定测试、typecheck、包字节核对；本地未提交候选不能称为正式交付或实机通过。

本段结果：当前源码候选位于output/contracts-seconds-candidate/timeonchrome-app-runtime-contracts-1.34.0.tgz，121391字节，SHA-256 `1ce2213b738ed5477a0bfc3713b45a310d215df772d85e6504161ca34793c4b1`。usage-account及computer-usage源码、实际schema／vectors、编译JS／声明与包逐字节一致，新v2及旧兼容导出动态加载通过；build、单位固定测试、兼容、typecheck、diff通过。旧contracts目录同版本包SHA-256 `defcf6a64d6d8a25d4ebe5a60588f1703c34d77b0c51027aeb9e551f6d7b968d`未覆盖；两者是未正式发布的不同开发候选，以精确路径及哈希区分。首轮核验脚本误写computer schema名，修为真实computer-usage-v1.schema.json后通过；computer秒汇总目前有TS契约但未形成完整v2明细schema，不冒称完整消费者契约。Matched＝当前秒统计候选输入；Missing＝Native消费与生成上传、完整电脑明细、实机链路；没有发布、安装、改锁或启用共享。

### 当前验证：应用秒上传的完整鉴权调用链（2026-10-05）

在现有application-account-publication聚焦测试贯通routeV2机器鉴权后的清单创建、分块传输、提交发布、权威秒读取及更正下降替换。使用本地测试D1，不绕过鉴权直接调用写函数；Windows／Mac仅验证平台契约，不冒称实机。原始事实为空仍能发布来源统计，并验证重复提交不累加、旧清单不能覆盖新版本、家庭隔离。仅修改该既有测试和本任务记录，运行该文件与typecheck、diff；不改业务规则、Native、安装、部署或凭据。已只读核实Native会话idle且无秒改造结果，Native实施／实机仍Missing。

本段结果：通过真实routeV2机器鉴权及本地D1依次创建清单、传分块、提交发布，受限来源读取51秒；新版20秒更正立即取代旧版，重放新／旧提交不重复、不回退，无原始事实也能发布。Windows／Mac两个平台契约用例及本文件66/66通过，Worker typecheck、diff通过。首轮测试未登记精确Guardian测试范围导致拒绝，补充两个测试孩子范围后通过，未放宽产品鉴权；跨家庭读取通过真实内部fetch验证404。Matched＝云端鉴权上传／持久化／读取／版本替换；Missing＝Native实际秒统计与发送、页面／实机全链；Deviated／Extra＝无。测试绑定的Child核验是mock，本地测试不是生产／Mac实机验收。未提交、部署、安装或执行migration。

### 当前实施：公开电脑汇总接通整数秒来源（2026-10-05）

沿用现有Guardian和Runtime电脑使用入口，以durationUnit=seconds显式读取同孩子的权威秒汇总，默认旧格式保持兼容。汇总版本包含范围、来源版本与投影结果；旧版本请求返回409，不混用单位。尚未完成的秒产品／时间线分页明确返回COMPUTER_USAGE_DETAIL_NOT_READY，不以空明细宣称完整。允许路径仅现有两个路由、Guardian来源服务及聚焦测试；验证鉴权、孩子隔离、非零秒读取、版本变化、非法单位／范围及旧格式兼容，两套Worker typecheck与diff。不改页面、原账、Native、执行配置，不部署。

本段结果：Guardian公开秒汇总和现有内部绑定已接通，Runtime现有电脑接口代理相同结果；3秒网页＋10秒非特殊应用＝13秒，版本由来源及结果生成，与时钟无关。Guardian源码路由回归及两套Worker typecheck通过；Runtime真实测试运行时／本地D1会话鉴权的代理聚焦15/15通过（Guardian绑定响应是mock，不是两Worker生产联调）。未授权／跨孩子拒绝，版本变化409，秒明细未接通503；旧接口仍走原兼容读取。首次Vitest因沙箱不能写Vite临时文件失败，受限本地测试提权后通过，不涉及生产。Matched＝公开汇总／权限／单位与版本；Missing＝秒明细与页面汇总消费者、Native秒生成上传及真实全链；Deviated／Extra＝无。本段未提交、安装、部署或启用共享。

### 当前实施：秒汇总来源不依赖原始区间（2026-10-05）

允许修改Guardian现有computerUsage只读适配及对应聚焦测试。为现有网页展示读取增加明确的“仅统计”模式，跳过原始网页区间查询；网页本来就是整数秒，只在旧展示适配边界验证毫秒包装可无损还原后输出秒，不修改网页统计模块。Runtime现有受限应用读取增加secondsOnly参数：尚无秒来源返回明确未知，而非为新消费者读取旧原账兼容值。两侧来源在相同孩子／范围内由云端秒投影组合；本次先验证真实源码调用链及来源失败隔离，页面与旧公开分页兼容仍须随后接入。不安装、部署、改配置或原账；复用现有分支。最小验证为电脑云端、应用来源聚焦及两套Worker typecheck。

结果：新增网页仅统计秒适配和云端秒汇总来源函数，Runtime已有受限getApplicationUsage支持secondsOnly；3秒网页＋10秒非特殊应用＝13秒，特殊实际扣除5秒，源码回归确认没有网页原始区间或旧应用证据查询。缺网页／应用时保留另一侧，稳定数据库内存错误码仍可诊断；尚无发布标为未知，非损坏／零值。电脑云端源码回归、契约固定回归及build、两套Worker typecheck、应用发布／来源78/78、diff通过。Matched＝只读秒来源与组合；Missing＝现有公开电脑汇总入口／页面接入、Native生成上传和真实全链。没有生产、安装、原账或共享执行操作，未提交。上一段仅函数契约已完善；本段开始有来源适配，仍不能以隔离测试宣称线上贯通。

### 当前实施：电脑汇总直接归集权威秒统计（2026-10-05）

修订现有computer-usage契约的来源统计投影：网页和应用各提供自己的整数秒总量／分类／来源版本，电脑汇总采用网页总量＋应用同口径nonSpecialTotal。特殊应用扣除贡献为应用总量减nonSpecialTotal，不减specialTotal或产品明细（并集重叠时两者并不等价）。分类采用网页分类＋应用nonSpecialCategories，不重新分类；缺来源或非特殊统计时保留有效分量，完整合计为null。投影不查询原账、不计算配额、不制造时间线。先在既有契约文件补齐纯函数及固定回归，再接云端／页面消费者；旧v1保持显式兼容，新函数未接入不宣称全链完成。旧1.34.0本地tgz须重新核验后才可交接，当前不作为最新源码制品。测试仅computer-usage、usage-account和契约typecheck，不跑平台或产品全量测试。

结果：新增projectComputerUsageStatisticsV2秒汇总契约及固定回归，通过网页10＋非特殊10＝20、特殊并集重叠的实际扣除5秒、普通其他时间保留、分类可重叠、更正下降、重复读取不累加、部分／缺来源不补零、合法零及整数范围拒绝。build、computer-usage固定用例、usage-account、typecheck及diff通过；首轮新测试局部变量名与旧用例冲突，隔离测试代码块后复验通过。Matched＝秒来源投影、独立原分类与扣除贡献；Missing＝实际Guardian汇总／页面消费、Native秒统计与真实上传读取；Deviated／Extra＝无。没有修改网页读取、原始记录或Native，没有提交、部署或正式发包。旧1.34.0包仅代表修改前源码，未作最新交接。

### 当前实施：应用发布版本进入电脑汇总缓存依据（2026-10-05）

源码核实applicationEvidenceRevision只包含旧统计／原账变更，不包含来源统计publication头；因此秒清单发布或更正下降不一定使现有电脑汇总缓存失效。修复范围仅现有受限Runtime来源版本接口及发布回归：读取同家庭／孩子／最多七日的有界发布头（清单ID、版本、哈希），纳入版本摘要；收到但未发布的清单不改变可读版本，无关家庭／日期不影响缓存。保持旧兼容依据，不把本项称为汇总秒消费者已完成。只跑发布／来源回归、Worker typecheck和diff；不改原账、契约格式、Native、生产或配置。

本轮结果：发布头已纳入缓存版本，覆盖51秒发布、20秒更正替换、未提交清单及无关家庭／日期不改变版本，原始事实仍为零。发布和来源聚焦77/77 PASS，Worker typecheck与diff通过；首轮新测试共用已有策略主键，仅将测试身份隔离后复验，不改产品约束。Matched＝发布版本与缓存失效；Missing＝电脑汇总秒消费、Native秒生成／上传及真实链路。Native所属会话实际idle，最近任务仅只读Host连接诊断，没有本次秒改造结果；开发交接的工具范围阻止尚待已提出的集中确认，不绕过。没有提交、部署、安装或共享启用。

### 当前单位边界与剩余链路（2026-10-05，PO明确确认）

派生统计持久化、同步接口、配额输入和展示统一整数秒；原始计时记录保留，时间戳／截止时间／超时仍使用原单位。统计生成遵循网页现行秒分配规则，不能逐条截断或在读取、配额、页面再次取整。实施检查顺序：契约及共同分配用例 → Native派生统计和上传 → 云端接收与持久读取 → 独立应用及电脑汇总 → 配额消费者。当前仅契约、云端秒接收／独立应用读取及页面草稿有本地证据；Native生成／上传、电脑汇总旧证据读取路径、两端配额消费者与真实全链仍未完成。旧毫秒兼容格式明确标记，不作为新版完成证据。本轮不改原账、不安装部署、不启用共享执行、不创建分支或工作树。

### 当前实施：秒契约本地交付候选（2026-10-05）

将已实现v2整数秒定义集中标识为1.34.0本地候选，更新package与两个精确依赖锁条目、兼容版本断言；不碰其他依赖版本、不更新Native发布锁。构建、usage-account与兼容测试、typecheck后本地npm pack并记录SHA-256／包内容。旧1.33.0包保留；新包不上传、不广告生产能力、不视作Native已支持。公共锁文件例外仅用于契约候选版本一致。

结果：1.34.0本地候选已生成（118991字节），SHA-256 `defcf6a64d6d8a25d4ebe5a60588f1703c34d77b0c51027aeb9e551f6d7b968d`；路径app-runtime-management/contracts/timeonchrome-app-runtime-contracts-1.34.0.tgz。实际tgz内usage-account源码／schema／vectors／编译JS／声明均与工作区逐字节一致，包内动态导入新v2及旧v1导出通过。build、兼容测试、usage-account测试、typecheck、diff通过。旧1.33.0原包SHA-256 `753fc4dcccc8741e1db64e68b8911b88eb9d53c88fa1274b3f4f991238f857d6`保持可读；未覆盖旧包、未上传或修改正式交接锁。Matched＝可识别候选及完整打包证据；Missing＝Native消费者与实机全链，契约尚未正式发布；Deviated／Extra＝无。候选来自未提交源码，不作为可上线提交或终端安装指引。

### 当前实施：秒读取保留特殊应用统计贡献（2026-10-05）

已证实新读取器遗漏清单已有applicationUsage；需在日／周读取中归集相同来源的nonSpecialTotal、nonSpecialCategories、specialTotal及完整性，再透传受限应用来源接口。只读取来源结果，不从产品行减法猜贡献、不计算余额。缺贡献返回null，不阻断有效原总量；缺日／旧单位不能冒称贡献完整。最小测试为发布／读取聚焦及typecheck、diff；不改Native、网页、配额执行或生产。

实施结果：日／周读取及受限RPC已保留同一来源清单的applicationUsage，安全整数累计不新增发布版本。双机器71秒原总量对应非特殊51秒、特殊20秒；缺日或任一清单无贡献时返回null且原总量仍可读。聚焦62/62 PASS、Worker typecheck及diff通过；首轮新增测试因双机器fixture重复策略主键失败，仅修正fixture后重跑通过。Matched＝贡献读取／范围未知／原总量保留；Missing＝新版Native来源、正式契约与真实链路；Deviated／Extra＝无。未提交、部署、安装或启用共享。采用cloudflare／workers-best-practices技能核对有界读取与隔离；不涉及新绑定或配置。

### 当前实施：Guardian独立应用来源接入秒统计（2026-10-05）

页面目视定位到实际DOM缺陷：脚本三个分支访问outside-window-summary，但index.html缺该节点，应用页签在发请求前抛TypeError。修复仅补齐既有统计说明节点，增加静态节点回归及桌面／移动mock重验；不改统计或权限。不再把此前加载失败全部归因浏览器工具。

补齐节点后mock已读到51秒及产品／分类；目视发现秒柱图漏掉既有bar-part，因此容器有高度却透明。补单色总量柱，不按分类比例伪造堆叠；移动截图须等待既有侧栏过渡结束。沿用同一聚焦验证。

本轮结果：缺节点与透明柱已修复，时间／节点回归8/8 PASS。Playwright隔离mock实跑日51秒、周357秒、产品详情357秒、切到网页后应用视图隐藏、应用请求始终seconds、无未处理拒绝；桌面1440与移动390截图已目视核对，柱图和产品／分类均可见。证据在本地ignored output/playwright/application-seconds/（visual-check.js、desktop.png、mobile.png），不是生产／真实Native验收。审计Matched＝本轮页面节点、秒柱与mock读取；Missing＝Native秒生成／上传、正式契约交付、真实全链及主控制台整页目视；Deviated／Extra＝无。仍未提交、部署或安装；已只读确认Native所属会话idle且尚无本次秒改造，工具拒绝的交接范围已集中向PO确认一次。

本段源码核验：真实受限RuntimeComputerUsageService读取51秒来源，跨家庭请求拒绝；接收／发布聚焦61/61 PASS，无未处理异常。两套独立renderer单位／部分来源／一致性测试、Worker typecheck及diff通过。首次测试缺少专用Guardian mock范围，补充精确fixture；直接RPC异常测试曾留下未处理拒绝，改用真实fetch入口验证404后通过，不以有异常的运行作PASS。隔离Playwright已能启动，但当前mock认证加载未完成，桌面／移动截图仍未取得，不能提交或声称页面通过。原账、配额、生产均未修改；Native秒统计及正式契约包仍待所属工作线完成。

RuntimeComputerUsageService.getApplicationUsage保持原受限绑定与Child核验，优先返回已发布秒范围统计；存在秒来源时不读取原账／旧物化，缺失日保留部分来源。完全无秒来源才返回明确标记的旧兼容格式。两套computer-usage-view的独立来源renderer识别seconds并直接格式化，不存新毫秒副本、不算配额。聚焦测试覆盖真实内部RPC非零读取、Child隔离、秒／旧格式展示及源码一致；仅本地验证，不发布。网页与媒体分支不变。

### 当前实施：云端页面秒统计消费者（2026-10-05）

允许console时间辅助模块、统计renderer／读取及其既有测试。应用页显式读取秒接口，保持整数秒视图不复制毫秒统计；总量、分类、产品、日／小时图和详情采用同一来源。缺日期保留部分明细，总量未知不显示零；无秒来源时原接口仅作明确标注的旧兼容统计，不能当作新版验收。独立统计不虚构配额余额／无限制／额度充足。主控制台嵌入沿现有stage脚本复用同一组件。检查为时间辅助／组件聚焦测试、JS语法及隔离mock目视验证；不发布、不改原账或执行配额。

本段结果：独立Runtime页已请求秒接口，秒视图保持单一单位，产品／分类详情与主图采用来源结果，旧响应被requestVersion丢弃；全部无秒来源时才选择旧兼容接口并标记。时间辅助与组件检查8/8、JS语法、diff通过。agent-browser隔离启动报CDP response channel closed，doctor仅证实CLI／Chrome／daemon可见，不能作为浏览器验收；目视验证未通过、不得提交。只读核对发现主控制台使用分析通过Guardian独立来源读取，而非嵌入管理组件，所以上文stage复用不涵盖主控制台使用分析，仍需单独接入。Matched＝独立页面源码及单位辅助；Missing＝真实DOM／桌面移动目视、主控制台来源接入、Native生成与实机；未部署／安装／启用共享。

### 当前实施：整数秒日／周来源读取（2026-10-05）

在现有applicationStatisticsNative读取器中增加最多七个北京时间完整日期的范围归集：总量、分类、产品与小时明细均来自已发布来源统计，不查询原账、不计算余额。缺失日期与旧单位来源分别标记，不以零补齐完整总量；版本摘要包含每个日期来源，重复读取不累加。先补聚焦范围测试与typecheck，再接实际页面消费者；不混入配额、网页或生产操作。

现有受家庭／孩子鉴权保护的GET /v2/module/app-usage通过显式durationUnit=seconds选择新版结果；未指定继续旧兼容格式，未知单位拒绝。不新建鉴权入口，秒查询只支持七天完整日期，消费者不得误读旧毫秒响应。页面改造与新版契约正式发布仍未完成。

本段实施证据：日／周秒范围读取及现有Runtime路由已接通；非零上传→commit发布→受鉴权接口返回51秒、缺日期保留有效部分、重复读取、跨孩子拒绝和未知单位拒绝已覆盖。接收／发布／读取聚焦86/86 PASS，Worker typecheck及diff检查通过。Matched＝本段范围读取及路由；Missing＝页面消费者、新版Native生成／上传、正式契约版本与实机；Deviated／Extra＝无。无新分支／工作树、未提交／部署／安装，旧生产仍不受此草稿影响。

### 当前实施：v2整数秒统计接收与产品分类明细（2026-10-05）

按完整目标接通现有manifest接收／分块／commit／发布器的v2入口；新增subject行分类明细用于消除读取端原账依赖。复用已有D1 JSON和分块，不新增表／migration，不广告未完成能力。检查为Contracts聚焦测试及build、Worker接收／发布聚焦测试、typecheck、diff。随后仍需持久统计与页面秒读取，以及Native实际生成和实机联调；不修改Native／网页源码或启用共享。classification明细只属于来源统计，不用于写回配置。

本段实现证据：v2接收、分块、commit及发布使用整数秒与平台seconds-v2算法；产品行携带来源权威分类，不再需要读取原账猜分类。新增秒统计来源读取函数直接读取已发布head／不可变清单／分块，核验范围与传输完整性，按来源累加并支持更正下降；测试禁止该函数查询原始Segment、媒体或策略表。接收／发布聚焦测试84/84 PASS，Worker typecheck PASS；Contracts聚焦测试与build已通过。Matched＝本段契约及云端入口；Missing＝现有页面／持久归集消费者切换、Native实际生成及真实联调；Deviated／Extra＝无。旧页面读取路径尚未替换，不部署此中间状态，不声称秒单位端到端完成，契约包版本仍未发布。

### 当前实施：整数秒同步契约与共同分配用例（2026-10-05）

先更新现有设计，后在usage-account.ts及现有测试／vectors补充schema v2秒解析、构建和有界分配；v1不变且显式拒绝误读。最小检查为Contracts build、usage-account聚焦测试、typecheck和diff；不发包、改Native／扩展、部署或声明秒单位已全链贯通。读取端还依赖原账分类解释，应由权威统计携带必要明细消除此依赖，不能用云端猜测填平。

本段实现证据：现有usage-account.ts／schema／测试／vectors增加独立v2整数秒格式及秒分配函数；v1解析／格式保持。Contracts build、usage-account.test.mjs、Contracts typecheck、git diff --check通过；另调用网页真实splitSegmentByLocalHour作35组跨小时／日及不足一秒的纯函数对照，结果全部一致，无存储调用或原账修改。首次默认构建因D盘dist沙箱写权限EPERM，授权本地构建重试成功，非类型错误。Matched＝秒格式、旧格式拒绝误读、分配规则及时间戳保留；Missing＝Native实际生成、v2云端接收／持久读取、消费者秒单位及实机链路；Deviated／Extra＝无。未修改包版本或发布契约，不能指引终端消费旧1.33.0包中的新草稿。

### 当前实施：提交请求直接发布应用统计（2026-10-05）

允许路径仅Runtime接收／发布器及其聚焦测试。本轮清单：①机器鉴权的commit完成接收后同步发布该清单，并返回实际可读状态；②显式重试不受定时任务失败冷却影响，同版本不重复累计；③不完整／损坏清单保留稳定原因及旧有效head；④无原始事实时完整统计仍可发布。接收事务与head／脏队列发布事务分别保持原子，间隙故障由重复commit或既有cron恢复，不冒称两事务整体原子。只运行application-account-publication、application-accounts及Worker typecheck／diff；不部署、不改网页、Native、配额或原账。整数秒协议和读取链路仍为后续未完成项。

实施结果：真实机器鉴权路由commit已同步调用快照发布器并返回对应清单实际状态；显式请求绕过cron冷却，重放恢复接收后发布失败。聚焦80/80 PASS（含非零无原账、重放、不完整保留旧head、跨机器拒绝），Worker typecheck及git diff --check PASS。采用cloudflare／workers-best-practices技能审查有界读取和D1事务；不新增存储或生产操作。审计Matched＝提交即发布及稳定失败状态；Missing＝归集读取仍重核原账、整数秒契约／Native适配及实机页面；Deviated／Extra＝无。代码未提交／上线，当前安装不能据此生效。下文之前“即时head更新未完成”已由本段API实施覆盖，低层接收函数仍只承担不可变接收，不以直接调用它代替生产路由。

## NOW：应用统计上传全链条对齐网页（2026-10-05，PO更新目标）

PO对单位范围的直接答复已收齐：统一派生统计、同步接口、配额和展示为整数秒；原始计时记录保留，按网页现行秒分配规则生成统计。不再等待这项单位裁决。已核对真实allocateSliceSeconds及其余数／开始时间排序；固定分配示例补入现有DESIGN。当前是设计确认与实施准备，不代表Native、契约或云端已完成秒单位改造。Native交接工具的拒绝单独登记，不把它解释为单位方案未获批准。

本次云端实施checklist：①applicationAccountPublication改为校验鉴权范围、完整清单及已收分块／哈希／维度后发布，不读取事实、旧策略或重算；旧精确核对函数仅供独立诊断。②保留版本单调替换、更正下降和发布头／归集dirty队列同事务；事务内再次核对分配及机器撤销。③针对无事实也可发布、迟到事实不阻断、重复／下降／跨家庭拒绝、分块损坏与事务回滚补聚焦回归。④后续接收即发布、读取取消重算及新秒单位协议必须继续完成，不能将这一段修改称为端到端完成。允许后台出版器与相关测试；不改原账／网页／Native，不安装部署；仅受影响Worker测试和typecheck。

本轮源码推进：后台发布器已采用独立快照结构／传输校验，不再刷新应用策略或等待原账重算。完整快照无原账也能发布；分块／行哈希及维度校验、平台算法、家庭／孩子／用户隔离保留，事务内再次检查机器撤销和受保护分配。更正下降／重复／损坏／撤销竞态／发布与dirty事务回滚已补回归。旧原账精确核对测试调整为明确调用独立diagnose，不删除诊断能力、不把它继续作为发布条件。Worker接收＋发布测试76/76，typecheck PASS；首轮测试46/47，旧不完整清单诊断期待已按新完整性语义修正，未隐瞒。测试需本地临时文件写权限，经工具审核在原目录运行；无生产访问。

当前完成仅发布器源码段：commit接收后直接更新head、归集读取取消重复原账核对、秒单位协议／持久统计／消费者和Native适配尚未完成。现有毫秒旧协议暂保兼容，不表示已落实整数秒目标；未提交／推送／部署／安装，真实全链条仍未验收。使用cloudflare及workers-best-practices技能检查事务和稳定错误，未创建分支／工作树。

最终补充清单自身哈希损坏稳定错误回归后，接收＋发布77/77 PASS、Worker typecheck及git diff --check PASS。实施审计：Matched＝本轮发布器的快照校验／版本替换／回滚／独立原账诊断；Missing＝完整目标的即时head更新、无重算读取、整数秒全链条及实机核对；Deviated／Extra＝无。本轮不交付安装包、不宣称应用链路完成。

本轮核心链路为原账不变→Native整数秒持久化统计→完整清单同步→云端校验传输后按版本直接更新可读结果→持久化归集及真实页面核对；共享对称查询／提醒／执行另轮，不作为应用统计完成条件。复用现有目录／分支，不新建；使用cloudflare及workers-best-practices技能，最小验证限契约单位与兼容、统计接收／发布／读取、Native秒分配及真实同范围页面，不跑无关全平台。

只读已确认两个旧重算依赖：applicationAccountPublication在received后另行读取原始事实精确核对才更新发布head；applicationStatisticsNative在派生归集时又调用同一核对器，并用原始事实分区作为选择Native统计的前提。后续必须同时解除，不能只把receipt.published改成true而页面仍回到旧重算。原记录、旧清单及既有历史诊断保留；日／小时／产品统计、归类说明和旧毫秒消费者兼容需由同一新契约明确，不假称现有已支持秒。

Native只读实施评估交接未送达：send_message_to_thread被自动审查拒绝，称存在Windows范围限制。未绕过、未向其他会话转发或修改Native源码；需PO明确确认本次Windows应用派生统计整数秒及上传改造的交接范围。云端源码调查继续，未因交接失败改写产品或启用共享。本机安装仍2.6.34，现有非零统计发布证据仅为旧毫秒链路，不算新方案验收。


## NOW：D-114对称统计查询修订（2026-10-05，PO批准；方案已登记，代码待改造）

- PO补充已确认：应用派生统计持久化／同步／配额／展示统一整数秒，原始计时记录保留，不改变时刻字段。已同步决策、设计和统计架构；网页现行切片取整＋最大余数分配为对照，应用并集及转换粒度需后续固定用例落实。新增验收为秒分配／日周守恒／旧单位兼容／缓存失效；不逐条盲目取整、不留新版毫秒旁路。本次仅文档，不改源码、不发契约包、不安装部署。

- 本轮职责architecture-integration／standard-cloud文档；允许DECISIONS.md、docs/DESIGN.md、docs/STATS_STORAGE_FOUNDATION.md和本任务板。仅文档一致性及git diff --check；不跑产品测试，不改契约代码、扩展／Native、候选或生产，不创建分支／工作树。
- 已固定：Native自算本机＋云端其他设备应用总统计；控件自算本机＋云端其他设备网页总统计。双方优先读对方的来源总统计，失联查云端，失败用最近成功缓存；桥与云端结果二选一、不相加，对外不混入另一来源，不循环查询。缓存严格隔离孩子、来源及日／周，未知不当零。
- 已撤销目标依赖：云端重算／事实到齐／逐维度相等才发布，以及完整混合依据／本机旧版本匹配／授权替换成功才核算。完整统计通过身份、结构、分块、哈希和版本校验即按版本更新；原账对账仅独立诊断，允许合理延迟及时间偏差。此前相反实现及验收记录保留为历史，不再据其安排反复安装或毫秒级阻断。
- NEXT：当前契约／云端工作线集中规划分域读取和接收发布改造；控件与Native所属工作线分别适配统计查询、缓存及独立配额模块。未修改wire或发新版本，未发起开发交接；本次文档完成不等于代码实现或共享验收完成。
- 后续验收清单：双向正常读取、云端失败、桥失联、双方启动顺序、无缓存未知、重连恢复、孩子／周期切换、无循环／无重复累计、更正下降、本机不依赖云端本机副本。原账／计时／结算不变，特殊应用及other沿原规则，共享执行保持关闭。


2026-10-05 证明过期的只读排除：用户16:27真实控件摘要已连接但WEB_SOURCE_PROOF_EXPIRED/孩子未确认/当前Native ACK缺失，不能以网页云端ACK代替本机接纳。两端源码均具续签/重试路径，尚无更新鲜现场恢复证据。通过正常Windows身份临时Host两次getSharedWebSourceScope（第二次保持stdin到响应）均WEB_SOURCE_CONTEXT_CHANGED、无scope；不证明返回了过期scope、不误判真实连接故障，停止该探测。未输出proof/标识/凭据，临时Host正常退出，无安装/Service切换/新源码/出包。云端手工只读查询已按现行迁移schema在内存SQLite准备通过，不是生产执行；等待CSV及真实摘要后完成同版发布/共享确认核对。

2026-10-05 2.6.34安装后只读基线：Service/Host均2.6.34.0、Service Running；正常Windows连接getApplicationUsage成功/complete/无分页/无原因，沙箱管道隔离失败不作产品故障。临时runner共享响应成功但WEB_SOURCE_PROOF_REQUIRED，不能冒充真实扩展绑定或验收失败。内置浏览器dash.cloudflare.com保存权限明确拒绝，禁止其他浏览器/CDP/API绕过；准备一次现有D1 Studio手工只读查询（当前日、2.6.34、最新受保护分配、脱敏来源编号），比较最新接收与实际发布清单的附属投影及版本，未执行生产查询。真实扩展摘要等待正确Chrome页打开，不要求进入SW、不新增诊断接口或候选。

2026-10-05 兼容云端发布完成：生产运行37281896229 success，固定master b146cd7；Runtime和Guardian Worker已发布，health/未认证fail-closed smoke通过。实时迁移检查通过且apply=false，未执行migration；两个Pages步骤skipped，未切R2/latest、未启用共享。下一完成门仅为2.6.34实际运行后的当前日同版统计→云端发布→共享读取/本机替换→页面，尚未安装，不宣称实机验收通过。候选Burn SHA-256 59ce4cfe6ae508afb721c9aa20a4147007e5b92b17c825f1d996d704797ced4b，MSI b1ef3031cc054f7cdb0ba0819e69871914be7954d0bab050186c33ff00323902已独立核验；不再出中间包。

2026-10-05 整批集成与兼容发布推进：PR #240已合入master@b146cd7ebaab8c6eadde38315a0fa4296f097412，代码树与已验证云端10cbd1b相同；PR及master的Runtime/Guardian CI通过。生产运行37281896229仅发布Runtime/Guardian Worker，已在内置浏览器按批准范围审核；不发布Pages、不执行migration、不切R2/latest、不启用共享。旧迁移门禁无需修改：上一生产运行核实无待迁移，本次仍实时核验。master的Task Console CI在Microsoft apt源403处失败、产品测试未执行，独立登记，不混称Task通过。Native最终2.6.34候选已核验Burn/MSI哈希，与c2951ea和固定1.33包对应；正式仍2.6.32、未安装，旧2.6.33不作为本批安装入口。待云端成功及一次实际升级后核对新统计同版发布、共享读取与本机最新替换；源码/构建/部署不得冒称实机完成。原加载目录、脏文档及数据不变。

2026-10-05 Native同版统计接入源码完成：main@c2951ea20932565f5aa3bdffe117942b35cb5104已推送、工作区干净；当前会话只读核对提交/交付报告及1.33包hash一致。Native报告1.33/1.32各194项、实际wire父hash/篡改拒绝、Service/Manager测试构建和共享Infra便携编译通过；这些为源码与合成验证，不是实机通过。云端10cbd1b仍仅本地提交；尚需整批集成/兼容云端发布及一个最终Native候选后现场验证，旧2.6.33候选不包含本批，正式仍2.6.32。Mac标准交接已发、调用点/系统验收单列。当前不安装/切服务/部署/migration/启用共享；不将任一旧ACK当新版确认。

2026-10-05 本批云端/契约集中提交10cbd1b（尚未推送/合并/部署）：固定1.33包已交Native消费并连续接入。Runtime发布48项、账户25项通过；共享读取、契约用量/替换/兼容、两侧typecheck、dry-run及源码边界通过。电脑汇总特殊应用扣除也直接读同版统计，不再等旧贡献；普通/特殊完全重叠回归证明按区间计算边际扣除，原总量/分类行保留。Native正在处理同事务manifest/能力协商/本机最新替换；尚无新版安装或真实链路证据，不宣称已上线。原有DECISIONS/TASK未提交内容及产物保留，未改81a1加载目录、原账或共享开关。

2026-10-05 应用统计一次同步与配额分层继续实施：契约1.33.0将非特殊总并集/分类并集/特殊并集放入原manifest的applicationUsage，可选且同版同hash，不保存额度/余额/借用。云端原发布路径精确核验后直接作为共享读取来源，不等旧贡献回执；旧端兼容保留。新basis使用application-statistics版本前缀防止与旧贡献ordinal混比，本机仅替换已鉴权自身新统计依据。契约build、usage-account/替换/兼容、Guardian共享读取与typecheck通过，Runtime发布47项通过，账户25项通过；原记录守恒/伪造拒绝/家庭隔离已覆盖。Native内部投影main@10ff5ac，两版各67项通过，已交固定1.33包(hash 753fc4dcccc8741e1db64e68b8911b88eb9d53c88fa1274b3f4f991238f857d6)继续集中接入manifest、能力与本机读取。尚未部署/安装/实际联调/共享启用，旧电脑展示扣除读取的兼容收口另核，不冒称全链路完成。复用现有工作线、原加载目录不变。

2026-10-05 Windows2.6.33候选已构建核验、待手动升级：固定源码5ad1e61620f4b649fee5bb699a0fb013d425aae4，包含a30已覆盖dirty批量消费及此前有界唤醒；契约1.32.0固定hash。当前会话独立核对manifest与Burn SHA-256=398194a9d1bac2bdb4e557686520a65cf7e8423433695fd7743980f2a4cc871e、MSI=9e56378a858ab99ee29b9457842de3a06b9d71435debab69c4345228afd071d6，构建零警告错误；Native核对组件/升级标识、旧2.6.32包/latest不变。内部未签名、latestEligible=false，未安装/上传/部署/启用共享。沿用户已选择手动安装方式交付唯一入口，不重复构建；安装后仅验证生效后的新模型统计、实际上传/发布/贡献ACK及页面，不追旧开发版本差异。P1水位/截止优化保留现有保护并挂起，候选成功不代表完整修复验证通过。

2026-10-05 并发优化不扩大统计语义：Native核对NowMs在Reader只读事务前捕获，直接把dirty水位改为事务视图MAX可能接受截止后事实而继续使用旧settledThrough；不能证明原口径不变，因此第二步内部水位优化登记P1挂起，保留旧MAX/资格保护，不改算法或截止。不把构造极端当本轮全部完美化门禁，也不放宽新数据正确性。已交Native完成一项精简边界回归后，以a30已通过的批量消费修复构建唯一下一Windows候选、继续新数据实机链路；不新建分支/工作树、不部署、不Mac守护、不覆盖旧包/latest。真实命中尚未证明，完整修复验证仍未完成。

2026-10-05 已覆盖dirty批量消费修复提交：Native main@a30ee8cb9e4194e2b43bd4c4c517c31c12c92b69，工作区干净。当前会话只读复核SQL及用例，两版各103项主体+36项共享投影回归通过，TRX主体计数独立核对；原四行四次物化改为一次，12批持续稳定读取均能生成候选，原事实逐字不变。未改资格门、算法、原账、契约或Mac守护；当前已装2.6.32尚不含该增量，未再出包。继续核对同Reader事务的内部dirty水位与至多一次有界重读方案，尤其NowMs/settledThrough先于读取时新增事实不能被未覆盖却提前清除；若触及统计截止或算法语义须先报告，不隐式改动。新模型云端发布/精确ACK/页面仍未完成，历史版本问题挂起。

2026-10-05 新模型资格断点继续定位：2.6.32生效后head235/236已生成且shadow完整，但六个有限采样均显示dirty/parity尚不满足上传资格，未取得新版发布证据；旧156/162/165回执仅记录为挂起历史，不追查版本一致性。当前会话只读核对MaterializeNext的dirty水位防竞态、单dirtyId清除、后置parity比较与NextUpload整日无dirty要求，提示实时新增可能使已冻结版本持续失去出队机会；尚属机制假设，不认定实机唯一根因。已交Native用隔离数据复现并区分正常短窗口/长期饥饿，不能删核验门、停止真实采集或立即再出包。目标仍未完成，无云端发布/精确ACK/页面通过声明。

2026-10-05 PO收敛修复验收口径：开发修复期间因版本差异造成的统计记录问题不再纠结，旧模型/旧revision缺口登记挂起，不作为新版验证的阻断。2.6.32安装已自然完成，五组件版本/hash已独立匹配；后续集中核对生效后新生成的当前模型统计及其实际回执、云端发布、页面读取和贡献ACK。今日旧revision156的FACTS_PENDING与旧published69不等于新模型失败；不为统一历史清账、猜补或修改原账，不放宽新统计精确核验。已通知Native按此范围继续，不追加旧日历史排查。

2026-10-05 Windows2.6.32唯一候选完成、待实际升级：来源4a43840bb896854e23e3b06300530e242681d769，Contracts1.32.0固定包；Burn SHA-256=7486ef493ee0bed96af516fd6a6b27d63734937fc76b0fa55be81d09872c1922，MSI=b6d3680b6e0c899c95c25b231631f8efc9ce2bdd20039daf3c6cb9122c847fc4，当前会话独立读manifest并逐包核对一致。Native核对组件、UpgradeCode及旧包/latest保持；内部未签名、latestEligible=false。安装前按Windows UI安装确认要求提供手动安装或由执行者启动的选择，UAC不自动操作。未安装、未部署、未启用共享；完整修复验证目标保持进行中，安装后仍须当前日精确回执/发布/贡献ACK/页面证据。

2026-10-05 完整修复验证继续执行：PO目标“继续，直到完整修复验证”。已交现有Native会话从实际main核对并构建包含4a43840的唯一下一Windows内部候选，旧产物不覆盖；复用源码测试，核对组件/安装器版本、源码SHA和哈希。不新建分支/工作树、不含Mac守护、不上传R2或部署云端。安装后按同一当前日与确定revision/截止核对本机资格、精确上传回执、云端发布及页面读取，聚合旧日错误不作为今日拒绝。共享执行保持关闭；系统UAC及保存的云端权限不绕过。目标仍未完成，候选构建和安装均非完成标准。

2026-10-05 Windows有界上传唤醒源码完成：Native已推送main@4a43840bb896854e23e3b06300530e242681d769，工作区干净；当前会话只读核对Service接线、容量1通知、单调60秒限频、5分钟锚点兜底及512键有界候选去重。没有修改原NextUpload SQL、Uploader、契约、原账或Mac；两版契约1.32.0/1.31.2各99/99的TRX计数已独立核实，Native报告Service Release零警告/错误，提交差异检查通过。已安装2.6.31尚不含本补丁；本轮未构建候选、安装、重启或部署。调度修复不代表已证明实机唯一根因，云端FACTS_PENDING、今日发布、精确贡献ACK及页面对账继续未完成；共享执行关闭。

2026-10-05 Windows账户上传有界唤醒已获明确授权、实施中：PO明确“允许 Windows 实施有界上传唤醒，不包含 Mac 守护功能”；授权已成功交给现有TimeWhere Native Host会话，先前实施交接审核阻塞已解除。依据已复现连续tick撞dirty窗口及安装后head晚于tick的现场旁证实施最小调度修复，不声称是实机唯一根因。方案复用原消费者，物化成功合并容量1信号；事件轮至少60秒单调限频、新版本不重置限频，原5分钟兜底、8槽公平、资格/退避/身份/能力及精确回执全部保留。同scope/date/revision不反复事件触发；信号不携带身份授权/凭据，停止取消等待。聚焦验证连续相位错过、合并与限频、失败退避、公平性、无资格无网络、身份切换/取消/重启及原事实不变，并核对当前/上一兼容契约和Service编译。当前阶段只实现、测试及集中提交，不出包、不安装、不重启、不部署，不改原事实/统计/配额/共享执行，不新增分支或工作树。最新Mac已安装0.1.35、今日统计完整，云端发布与精确ACK仍待核；本轮不含Mac守护或Mac新实施。云端受保存权限拒绝的未核项继续明确保留；今日云端发布、精确ACK和页面实机验收不能由调度测试代替。

2026-10-05 Windows2.6.31安装后有限验收：升级事务04:47:10/11自然完成；先读旧2.6.30是安装尚未结束，不启动第二安装或重启。五组件及Infrastructure与唯一候选版本/hash匹配，当前会话独立核对Service2.6.31及hash。认证摘要04:47:45显示最后选中9/25rev10收到并保存回执；04:52:35正常下一tick采样显示最后选中10/4rev715收到/未发布/回执已保存，FACTS_PENDING不能归给今日。今日head199的关联/更正pending已消除，204自身shadow完整、dirty=false/parityMATCHED，生成04:52:14晚于tick04:52:09，pending/attempt0、published仍69。仅保留最后槽位的诊断不足以确认今日前一版本是否被接收；共享候选/今日ACK/页面尚未验收。两次采样结束，不继续空等/清队列/立即出包；Native继续只读原事实上传核对并评估有界物化完成唤醒，不放宽资格或更改原账。Cloudflare已保存权限拒绝仍是直接云端读取阻塞，不绕过；共享执行关闭。

2026-10-05 Windows断点最小诊断源码收口：Native main@09ecccf25468908adbdc174b839e98ffe9605f03已提交推送；本机既有认证摘要增加最近实际选取日期/版本、阶段、中断原因、回执是否落地和下一检查时间。空轮保留历史选取时间，当前日资格抽样另标时间，不冒称原选择证据。1.32.0聚焦89/89、上一1.31.2重点33/33通过，Service/Agent/Manager编译及差异检查通过；当前会话独立核对TRX与源码差异。连续采样错过窗口已隔离复现，实机根因未确定；当前安装2.6.30无法返回新字段，未出包/安装/重启，云端发布与贡献ACK仍未验收，共享执行关闭。

2026-10-05 Windows上传定位推进：隔离核对已排除同内容策略轮询改变scope；确认dirty/parity资格门及真实scope变化在Begin返回后中断均可导致pending/attempt=0，上传期间产生新head不自动丢弃已核验旧回执。以上仅为已复现路径，尚非实机根因。现有云端status已有逐清单revision及发布原因；本机聚合摘要不足以关联所选版本和阶段。已交Native在既有认证adminStatus/本机诊断内补最小、有界、脱敏的选取/阶段/中断观测及聚焦测试，不新增协议、认证或放宽统计核验，不改原账。先取得具体现场，不以重复安装或空等周期替代定位；共享执行仍关闭。

2026-10-05 继续Windows发布断点诊断（PO明确继续）：云端源码确认现有清单status返回revision/receipt/publicationErrorCode，按manifest查其发布检查；无需先新增云端接口或认证。聚合错误缺乏具体清单关联，不作为新统计拒绝证据。Native负责只读核对主上传实际选取、分阶段返回、循环阻塞及持续重物化是否影响入队，并用隔离记录复现；已有字段优先，观测仍不足再集中提出最小诊断方案，先不出包。不同于上一轮被动等待，不重复安装/重启或清队列；云端访问权限阻塞仍保留，不绕过。新统计资格通过与云端发布/sharedACK未通过分别记录，共享执行关闭。

2026-10-05 Windows有限补发窗口结果（03:56:16）：Native通过正常UAC/同桌面用户认证多次只读核对。当前日新统计147仍待发布，已发布69；最新本机统计完整且dirty=false/parity=MATCHED。正常账户ACK于03:55:23推进、共享检查执行下一轮，不能判定循环完全卡死；现行状态复查仍APPLICATION_ACCOUNT_ASSOCIATIONS_PENDING，但摘要未关联具体清单revision，不能声称新147已被云端拒绝。共享候选及实际ACK尚无，断线幂等和真实页面对照未验。本机资格修订已见效、上传/发布关联未闭合，集中交Native只读定位队列与清单对应关系；不重复安装/重启、不清队列或放宽验证。Cloudflare浏览保存权限拒绝及IAB缺可用登录为直接云端/页面验收访问阻塞，需正常恢复访问，不绕过。

2026-10-05 Windows2.6.30安装后贯通验收进行中：五组件FileVersion2.6.30.0与最终候选SHA逐项一致。Native同交互桌面用户认证adminStatus于北京时间03:51:34成功读取online/cached=false；当前日10/5新统计143自身shadow完整，特殊应用及分类证据完整、原因空，说明新本机资格修订生效；已发布仍69且为旧模型，current/published关联与更正不一致、dirty=true/parity=MATCHED，新143 pending/attempt0，无真实共享ACK且连接未建立。ASSOCIATIONS_PENDING为现有发布诊断，尚未证明是新143失败；旧capability/policy错误保留为历史，不作当前唯一根因。继续观察有界正常补发，不重装/重启/修改原账或配置，共享执行关闭。云端直接核验受已保存Cloudflare浏览权限阻止，不绕过；IAB Runtime未登录、主控制台未载入孩子，真实页面与云端固定范围对照待恢复访问，不以mock或本机完整冒称端到端通过。

2026-10-05 本批生产与候选交付：PR #239合入master@e606de7d5d1ab7717cb6b860f09a8a076b0448d5；精确SHA CI及213项Worker测试、契约/边界/typecheck/dry-run通过。生产运行37226303699成功，仅Runtime Worker，version ab6cf86a-308a-42f0-acdb-063cc37654b2；发布manifest与前次对照Guardian、Runtime Pages、主Pages及R2 latest均未变化，migration为空。Native唯一2.6.30候选source5c6617a已完成，Burn SHA256 162b8fefbc1ac2084ff327994258c20202b104a9cb4da5485ecc02c75bac29e0已独立回读核验；用户手动安装入口已提供，不重新配对。当前状态：云端已部署、候选已交付、安装及真实新日账/贡献ACK/断线恢复待核对，不能宣称端到端完成；共享执行关闭。证据在本地.tmp/special-application-release-20261005；无新分支/工作树，既有DECISIONS未提交内容与制品保留。

2026-10-05 最终交付CI核对：PR #239已建立，Native2.6.30候选已校验。Worker CI唯一失败为游戏默认分类用例硬编码旧策略版本2：现行保存已包含完整产品知识，同一盘点无需再生成内容等价版本，实际合法版本为1；各游戏分类断言均通过。修订该用例验证盘点不重复升版，并让上传使用实际下发版本，不改变游戏规则、生产版本或原账。仅补跑该聚焦用例、diff与范围检查，再复用CI发布Runtime Worker；安装和真实ACK仍待验收，共享执行保持关闭。

2026-10-05 本批源码收口：契约61da90c、云端82c9e4c已在既有cloud-management提交；Native main@5c6617a2629b0992b9115a8ee249e28b3036ad97已提交推送、工作区干净，固定消费1.32.0（SHA256 60de68295a7491ad1395900b8e5b0fc6ab5eada58aaa4cfd33a22f0c0f5be7bf），上一1.31.2哈希保持核验。特殊应用仅由可信productId对应catalogGroup决定；普通未关联身份不再需要逐条非Chrome证明，真实冲突/危险alias/上下文缺失仍诊断。属性参与统计模型摘要，变化触发重物化；旧模型候选和出队不复用。云端89项、Native135项聚焦测试通过，契约build/typecheck/26向量/兼容检查、Worker typecheck/dry-run、Native公共库net8.0编译及范围/diff检查通过。审计Matched：单一属性、第二特殊产品、普通other保留总量、版本替换及原账不变；本批无未批准Extra/Deviated。尚未部署、构建安装候选、安装或实机新日账/贡献ACK验收；安装2.6.29不含本批。共享执行保持关闭；提醒执行target旧角色筛选未改，属后续执行路径核对，不将统计源码收口宣称全部旧字段已删除。无需用户抄Service Worker或重新配对；生产发布、最终候选及现场核对分别登记，不执行migration/R2操作。

NOW 2026-10-05 PO批准立即实施网页模型对齐修复：契约1.32.0增加AppProduct.catalogGroup='specialApplication'单一产品属性，技术身份只关联productId；页面消费同一关联、不再扫描安装证据重新判断Chrome，旧isChromeContainer仅兼容。目录属性参与关联版本，历史独立身份刷新保持幂等及家庭隔离。契约build/typecheck、分类26黄金用例/新特殊产品断言、兼容检查及Worker typecheck通过；产品关联/电脑来源/统计45项与发布44项通过。发布夹具已由固定假关联hash改为实际版本生成器，没有放宽验证。Native已收到实施任务，最终固定包随后交付；本机适配、实际安装和贡献ACK仍待完成，当前不部署/安装/migration/R2/shared启用。此条为源码实施证据，不冒称实机修复完成。

2026-10-05 PO要求重新以网页实际实现对齐，先只读复核，任何新差异须先确认。对照已记入docs/STATS_STORAGE_FOUNDATION.md既有入口：两端原账/持久统计/冻结版本/上传发布基本同层；应用特有Chrome角色逐身份资格及页面/统计双识别为待修正偏差。此前拟议新usageKind字段/1.32.0尚未落盘，不当作固定协议或下发实施。秒/毫秒、网站/产品身份、现有应用并集等已批准差异保留；不改原账、网页实现、生产配额或提醒语义。此次仅文档记录与diff检查，未改代码/接口/安装部署。后续先明确唯一特殊应用产品配置的既有表达，再集中修复，不继续补冗余布尔。

2026-10-04 PO确认已安装后恢复现场核对：当前会话只读文件版本确认Service、Infrastructure、Native Host均2.6.29.0；已交Native所属任务核对产物哈希并通过现有内部认证摘要读取当前日实际最新current/published shadow、队列、dirty/parity及ACK。安装等待已解除；仅版本核对不等于共享验收通过。保持现有配额配置/提醒语义，不启用共享限制、不猜补Chrome角色、不追P1旧595、不修改原账或读取凭据。

2026-10-04 2.6.29内部只读诊断候选已生成：Native报告组件版本/既有MSI升级标识核验通过；当前会话独立回读manifest并核对Burn/MSI SHA-256一致。源码bb0efe41efbe1518f5e201882cdb7f069b5261f7、Contracts1.31.2；Burn119820681 bytes/SHA-256 a809326d947dee3dbb11fd078c9035de9fe07605a9e13796b46225bbaeadc6f6，MSI61089526 bytes/SHA-256 f9dd7b254d3e6e5a68d5ed4363a5011a1f7063c6e5d345ae6518cdf83a0e2f5e。安装入口D:\Codex\TimeWhereNative\artifacts\release\windows\x64\2.6.29\TimeOnChrome-AppRuntime-Setup-win-x64-2.6.29.exe；内部未签名、尚未安装、不上传R2或切latest。只增加既有认证范围内的只读诊断，未新增提醒模式、修改配额配置或执行逻辑；复用29项诊断测试，候选构建不能冒认为共享修复已验收。安装后直接核对current/published shadow、入队原因和当前ACK，不要求用户抄Service Worker，不恢复P1旧595追查。

2026-10-04 只读隔离runner安全路径已收口：正常UAC后管理员/当前桌面身份核对通过，但SID到本机user依赖Service私有HMAC派生，现有认证接口不提供可复用的数据库当前用户映射；未读取机器key/正式库、未猜scope/改ACL。无须重复提权或新增接口；外部runner在当前边界下不可行。按既有完整交付目标已交Native准备下一唯一内部Windows2.6.29候选，仅包含已完成只读诊断及必要版本元数据、正常组件/Installer打包核验，复用29项及未改代码证据；不安装/部署/R2/改模式或配置。候选和实机验收严格分开，PO仍手动安装。639统计发布已通过，共享shadow/候选/ACK仍待更新后的Service在现有认证范围内读取，不能把安全退出记为业务通过。

2026-10-04 Native最小只读诊断源码完成：bb0efe41efbe1518f5e201882cdb7f069b5261f7已推送Native main，29项聚焦测试（新增5项）通过，覆盖当前head/已发布分离、稳定错误过滤、用户隔离/库字节不变/旧库兼容/重启及日期边界；未构建或安装候选，运行中2.6.28尚无新字段。控件和Native均确认未按已撤回提醒模式建议改业务；“只提醒”仍按现有配额配置。下一步评估复用既有获准管理员只读环境运行已编译诊断，避免只为取数据安装中间包；严格当前用户/assignment、ReadOnly/两秒预算、白名单摘要，不写真实库/ACL/文件、不读facts/凭据、不重启运行Service。授权或隔离不能满足则保留具体限制，不假定实机新字段已验证。已发布639上游已通过，当前共享receipt仍缺失。

2026-10-04 20:23:56正常周期实机云端推进：目标Windows assignment1新统计639完整、当前关联匹配、已发布639、publicationError=null；新统计生成/上传/云端接收发布这一门已通过，覆盖20:15的未闭合状态，不恢复旧595追查。目标当前日仍无共享receipt/verified，下一步只查已发布新版本对应shared shadow→入队→发送/ACK。另一assignment21回执6的source_verified=1但策略尚未核实，不能替代目标完整通过。只读查询rows_written=0，不安装/改配置/改原账/启用共享；最小诊断实施继续，不将旧聚合错误作为当前根因。

NEXT 已纠正两端交接：PO“只提醒”通过现有配置不设时间配额限制实现，撤回新增stage reminder、独立提醒开关及超时语义改造提议；没有因此修改契约/业务代码，不再开展该错误方向。控件只核对现有配置/提醒机制，不改原账/配额/候选或生产；Native已授权的三文件最小只读发送诊断仍继续，区分current-head/published队列、dirty/parity/shadow原因，不改调度/算法/公共接口，不安装中间包。后续继续当前来源发送→发布→贡献ACK核心核对；不擅自替用户改家庭配额，不重复部署。

2026-10-04 关联版本旁证核对：225/226的1189项身份全部对应，顺序/状态/原因/名称/产品/关联键/Chrome角色变化均0；仅37项已补false的JSON字段序列化顺序不同。源码区分后台存量补充与正常inventory policy canonical存储，可解释一次版本变化；不据此断言持续抖动或修改策略语义。不将该非核心旁证扩展为新修补/重复发布，继续当前提醒阶段发送链路；P1旧595保持挂起。查询rows_written=0，未输出身份或用量。

NOW 2026-10-04 共享验收强度收敛（PO纠正口径）：现有配置不设配额限制以只提醒，不新增代码模式。Checklist：①同家庭/同孩子与当前用户隔离、改绑撤销；②网页+非Chrome应用贡献、Chrome/other排除、版本替换不倍增、其他设备保留；③断线恢复不整批丢失及实际版本ACK；④一次当前日来源与提醒核对，允许适度偏差/同步滞后，未定义数值容差；⑤提醒可见/同轮去重、未知不作零。复用已有固定测试，不重复全历史/全平台；旧595 P1及历史P2单列。当前只更新文档与交接，不改契约/业务/算法/原账/生产配置；共享执行仍关闭、现场提醒未验收，继续定位新统计发送缺口。仅git diff --check，不触发产品测试/CI/部署。

2026-10-04 20:15集中窗口：正式Host20:15:17今日统计ok/complete=true、reasonCodes=[]，更正版本自然推进226；不把与固定225不匹配当失败。云端已核实226新关联仍37项明确非Chrome。20:15:26生产只读核对采用最新策略而非固定225：目标已发布620仍旧关联，当前来源无共享receipt/verified；其他账户29新关联发布不能代替目标。首个未闭合观察门为本机新统计→云端新版本接收/发布；无无状态发送队列/持久shadow诊断，具体发送阻断原因仍未确认。PRODUCT_IDENTITY_UNRESOLVED仅为正式读取的归属理由，不冒认为实机CHROME_ROLE_UNCONFIRMED；不证明今日总量错误。停止逐分钟重复读取与旧595追查，继续独立版本替换/恢复验证；共享余额现场完整对照仍待新来源回执，不启用共享执行。仅文档及只读查询，diff检查通过，未安装/迁移/修改原账或生产队列。

2026-10-04 P1挂起后继续共享链路：旧595冻结差集按PO批准保留P1，不继续追查、不放宽核验或启用执行。角色修复已进入策略225和本机完整统计，但当前云端最高发布620仍旧关联、目标共享回执缺失；正常统计上传/发布复查/共享补发按既有五分钟节奏，已交Native在20:15集中只读核对生成→上传→发布→入队→ACK首个未通过阶段，不逐分钟重复查询或要求用户抄后台。补充只读覆盖指示：今日目标Windows事实使用身份中显式非Chromeconfirmed1项、角色未知associated1项/unresolved10项，缺投影0项；rows_written=0。源码表明独立统计完整不等于Chrome排除证据完整，未知角色可能阻止共享入队；该墙钟筛选只作范围指示，需Native实际shadow确认，不能据此猜补身份或称为唯一现场根因。原账/统计/配额及安装部署不变。

2026-10-04 20:04:41 实机新关联采纳通过：Native正式Host当前用户只读观察旧224→APPLICATION_USAGE_PENDING→新225；statisticsComplete=true/reasonCodes=[]，associationMatches225=true，classificationCorrectionVersion=225。云端Windows机器241/241 applied。无需扫描、安装或Native修改；角色投影修复已实际进入本机统计。Attribution仍PRODUCT_IDENTITY_UNRESOLVED，目标共享回执未出现；不能将该采纳证据扩展为共享shadow/ACK/余额全部通过。最新已发布应用620仍旧关联，正在等新225统计自动上传与发布；不追P1旧595或猜补未确认产品。

2026-10-04 20:02 角色投影存量刷新已上线：PR238/master a5f9e59c20d23b44e27232d9119752ad5c8fce5a，聚焦56/56、typecheck/dry-run/diff及PR/精确主线CI37200512672/37200590047通过；生产37200672838仅Runtime Worker，版本15144dc5-a48c-4c47-adfa-cfedb664f982，health/401通过，无待执行migration或其他资源操作。云端正常后台已将目标策略224推进225，新关联0b447d688c3020984061103e952e65d74a439c3d7b21430a39afa6e1c8eb23c9含37项明确非Chrome；无需Native重扫/重装。原产品关系、分类、更正和原账不变，未知仍未知。已交Native只读确认正常策略采纳、真实贡献/ACK；现场共享完整验收未完成，P1旧595仍挂起，共享执行关闭。本条覆盖下方续修“待发布/旧224”状态。

NOW 2026-10-04 角色证据发布后的存量投影刷新：实机与源码证明部署不触发Agent重扫，旧不可变策略仍224且无角色字段。最小续修复用现有后台不可变策略刷新，为云端原已confirmed/APPROVED_PRODUCT的非Chrome产品补充false并更新内容hash；未知、冲突、关联但未确认及Chrome不猜补。保持原产品关系、分类、更正、账本和配额，正常机器policy轮询接收新版本，不增加GET写入或强制重扫。验证application-account-publication及identity-projection、Worker typecheck/dry-run/diff；排除Native/扩展/安装器/平台全量；随后仅Runtime Worker兼容发布与真实来源/ACK核对，P1冻结差集继续挂起。

阶段更新：角色证据补丁PR237已通过CI37199981933并合入master 894edee7c96776cf60ea6a217d8589a6f9c01fdd；精确主线CI37200063341通过。Runtime Worker已由生产运行37200164777发布，版本009523e7-27c0-4130-9973-4d68e6c51a75，health/未认证401 smoke通过。已核实无待执行迁移，未应用migration、部署其他资源、安装或启用共享；生产环境保护保留并完成本范围审核。PR职责声明修正为standard-cloud，未改门禁。只读策略仍224且未带新角色字段，目标今日发布579仍无共享回执；不能把代码上线冒认现场收敛。Native正跟踪正常盘点/策略刷新，无强制重扫、直接DB写入或重新安装。下一步核对新关联、真实贡献及ACK；P1旧595继续挂起，共享执行关闭。以下“未提交/未部署”描述为先前状态，由本条更新。
NOW 2026-10-04 共享角色证据生产者最小修补：已核对云端applicationIdentityProjection只输出Chrome true，已确认非Chrome遗漏false；Native按既有契约将缺失视为未知，因而可能产生CHROME_ROLE_UNCONFIRMED并拒绝共享入队。Checklist：可信已审核且唯一的非Chrome产品输出显式false；Chrome强证据true保持；未知/冲突/弱Chrome不猜false；投影内容hash随实际字段变化。仅修改云端投影及其聚焦测试，不改变契约字段、Native判定、分类/原账/配额，不追P1旧595。最小验证：identity-projection与special-applications测试、Worker typecheck/dry-run/diff；CI仅相关Worker，生产smoke留待另行发布；不运行平台/安装器/扩展/网页全量。仅本地实现，不部署或直接刷新生产策略，现场shadow原因仍未直接读出，不把本缺口作为唯一现场归因。

结果：云端投影已补显式false，仅限唯一已审核非Chrome产品；unknown/conflict/弱Chrome仍无角色字段，强证据Chrome维持true。application-identity-projection 12/12、computer-usage-evidence 14/14、typecheck/dry-run/diff通过。Native现有Reader对照2/2（1693f9e，只测试提交）证明相同人工区间缺角色时普通account完整但共享Chrome证据不完整，显式false可完整；产品判定未改，无需新Native候选。审计Matched：角色三态、既有版本hash、最小测试和边界；Deviated/Missing/Extra无。当前仅本地源码及隔离验证，未提交本补丁、未部署/生产刷新或真实shared验收；历史P1及真实未确认产品角色仍保留，不保证本补丁解决全部不完整来源。

## P1：应用冻结统计与云端事实范围不一致（2026-10-04，PO批准挂起）

状态：待后续处理；暂停旧595版本精确差集追查，不阻塞非共享功能及其他独立验证。固定595清单声明600条，云端相同截止候选601条，发布拒绝APPLICATION_ACCOUNT_FACTS_PENDING；新版关联/更正已更新，连接、孩子身份、能力及配置读取正常。当前日Service统计完整，日总量与小时总量、各分类日/小时汇总一致；没有证据证明全天时长算错，但尚未量化595差异的区间并集边际时长，不记零影响或修复通过。PO允许适度偏差；尚未确定数值阈值，不擅自修改原账、统计口径或容差放行。影响主要为云端新统计发布滞后及共享贡献收敛；共享余额完整实机验收及执行启用仍未通过，不把挂起等同启用批准。恢复时以日总账/分类/共享余额的实质影响为重点，不以条数绝对一致反复构建安装。

NEXT：复用已有准确性/版本替换/可靠性测试证据，继续独立核对应用共享shadow不完整的稳定原因及Chrome/other排除依据；只读诊断优先，无法归因则如实保留，不猜补身份。随后验证同来源替换、断线/重连缓存和当前连接ACK；受P1阻挡的真实余额明确标待验收，不重复追595。不创建分支/工作树、不安装部署/migration/R2、不改网页账或启用共享执行。

此前管理员摘要权限待批记录已过时：PO已在Native会话提供正式只读摘要，后续无需重复请求同一UAC或要求用户抄Service Worker。

2026-10-04 共享真实诊断权限缺口：Native main 70d2c6e报告两组隔离测试212/212通过，现行2.6.28独立贡献调用链已实现且影子发送不受强制执行开关阻止；当前最高已发布冻结版本可用于追赶，不需head停止增长。普通用户control/adminStatus及脱敏持久诊断文件均拒绝访问，publicStatus只确认Service在线。云端45秒有界tail观察共享policy GET200/outcomeok但无目标scope证据，不冒认目标HTTP成功；目标Guardian配置34/shadow已只读确认。尚不能确定无receipt的具体原因，已集中请求一次UAC只读生成/入队/发送/ACK摘要；批准前不执行，不抄Service Worker、不修改生产或盲改代码。此为当前日共享核心缺口，真实逐来源已用/剩余及连接ACK尚未通过；非核心历史/Mac/P1仍单列。

2026-10-04 共享准确性首轮结果（未完成实机共享验收）：Runtime生产只读查询rows_written=0；目标Windows assignment1当前日统计publication562完整，但同日应用共享贡献receipt缺失，不能以另一assignment21的零贡献verified1代替。Guardian当前日网页派生贡献完整、回执/头hash匹配，目标影子配置profile-config:34的三桶可读；不因应用缺失清空网页，也不把缺失当零。已执行application-accounts 25/25、Guardian共享状态、真实隔离SQLite网页贡献/水位/更正/改绑/证明、共享配额投影与执行分页共同向量、只读配置缓存/重启测试，均通过；10分钟网页+10分钟非Chrome应用=20分钟、other不扣额度、新版本下降替换及其他设备保留已获固定用例证据。Native获直接用户原文核验后正在执行实际生成/入队/发送/ACK及离线隔离调查；未确认根因，不冒认Native故障。当前云端不需为模拟通过而部署，不修改原账/生产队列或开启共享执行；真实余额与当前连接ACK仍待贡献链路贯通后对照。

NOW 2026-10-04 PO批准继续Windows共享准确性与可靠性核对：共享执行保持关闭。Checklist：①固定当前孩子/北京时间今日/配置和来源版本，核对网页与应用持久贡献、Chrome/other排除及共享余额；②验证同来源版本替换、下降更正、旧/重复ACK与其他设备保留；③隔离验证断线/重启/重连及离线新增衔接，真实验证不以模拟代替。职责runtime-cloud-contract；当前会话只读生产贡献与核验状态、契约/云端聚焦测试，Native所属会话负责本机隔离与认证读取；不要求用户到Service Worker抄数据。最小测试为application-accounts共享相关及Guardian共享贡献/余额测试，复用未变证据；仅有新代码才追加相关typecheck/dry-run/CI，发布smoke本轮不适用。排除产品全量、Macguardian、历史P2、独立P1、真实停服故障注入、安装/部署/migration/R2及共享开关。发现核心差异保留精确原因，先定位，不用解除家庭/用户/来源校验填平。三项完成状态分别记录，不能把统计发布通过冒称共享完整通过。

2026-10-04 Windows今日应用统计核心链路验收通过：实际安装2.6.28.0；冻结清单542在本机独立重算与云端发布核对一致，随后发布562由持久读模型及真实登录主控制台采用。页面响应200、producer=native；固定562范围的总时长、各分类、24小时分布及结算截止全部精确一致，更新中标记明确且保留有效读数，不将实时新增记录冒认为已覆盖。PR233（冻结截止采纳）与PR234（请求日构建优先）已合入，发布master 1abf9f50d623d26b8a4817edb063be219e6c8ce0，Runtime Worker版本6dfb47b1-2e62-48cb-8f60-a9bf45b82cad；聚焦测试61/61及typecheck/dry-run/边界/diff通过，生产运行37196333296成功。仅部署Runtime Worker，无migration/其他云资源/重装/R2/共享启用；没有修改原账、计时及配额。旧536冻结范围差异、历史缺项、独立P1读取故障及Mac实机继续单列，不再阻塞本次当前日端到端收口；本轮不宣称所有历史或共享执行已通过。来源代码已合并，真实验收证据记于此及PR234；本地既有未提交工作保留。

2026-10-04 真实页面采纳续核：Runtime Worker修复已发布f3026d08，今日请求200但仍旧缓存；同scope读取会排整周任务，两个构建槽被历史关联失败反复占据。最小续修只令页面请求日期优先于附带周日期，维持每次最多两个、原退避/核验/范围隔离/原账及配额；cron普通队列不变。新增聚焦回归证明读今日时今日Native物化优先，旧日期仍保留队列而非放宽或清除。仅既有cloud分支集中提交及Runtime Worker，不安装或修历史。

NOW 2026-10-04 已发布Native统计采纳修复（延续已批准读取范围）：实机542已received/published，manifest/rowsHash与本机冻结结果匹配；孩子今日仅一来源且已有发布，页面却仍legacy-server。原因是读模型以实时全日factCount/sourceRevision必须等于冻结清单作为采纳前提，新增原账即回退。Checklist：①解除实时全量相等对冻结快照的排斥，仍调用现有发布核验器精确检查截止内事实/分类/关联/更正/行hash；②来源已推进以stale=true及已结算截止明确表达，不把旧快照冒认覆盖全部新增记录；③回归发布后新增截止外记录仍读Native快照且标更新中，事实/来源不匹配继续拒绝；④提交/发布只Runtime Worker，实际页面复验。职责runtime-cloud-contract；仅application-account-publication/application-statistics聚焦测试、typecheck/dry-run/diff，CI为Worker相关；排除Native/扩展/页面代码/安装器/Mac及网页落账（均无改动）。不改原账/统计口径/配额/发布核验标准，不追旧536范围差异或独立P1，不建分支工作树/migration/R2/shared启用。

2026-10-04 2.6.28安装后核心验收：实际Service/Agent/Host均2.6.28.0。Native以当前Host认证调用者匹配持久统计，受保护assignment1，complete=true/reasons空/parity MATCHED/dirty0；行hash、持久SourceRevision及总量/分类匹配均true。今日head535完整，启动后生成仍pending/attempt0，待原五分钟下一轮；同scope历史10/2、10/3新清单已received，旧publication_check同时推进，不能用全局published ACK冒认今日通过。真实主页面刷新出现既有503，保持旧有效缓存，单列P1不堵塞发送/发布验收；页面采用新Native仍待确认。用户要求非核心问题不阻塞，本轮不追历史缺口/Mac、不重建或部署、不改频率/生产队列/原账/配额。

2026-10-04 补发最终候选2.6.28已生成：来源 `b13274491b8d8f5a21c695d386b7529bc77676e5`，Contracts1.31.2及既有包hash不变；Burn `D:\Codex\TimeWhereNative\artifacts\release\windows\x64\2.6.28\TimeOnChrome-AppRuntime-Setup-win-x64-2.6.28.exe`，SHA256 `e0a5e91c752b5e58846dd23717cd2b853d2787515045dac0c7011b43d601fdb3`，119807717字节；MSI SHA256 `f3847731d9150e1c297d60817e9ae2115064022e6004e82ec5707d7b09e4b9df`，61085430字节。Native已核验五组件、MSI升级身份；架构独立回读manifest及Burn/MSI哈希匹配。内部未签名、latestEligible=false，未安装或上传R2。下一步用户按既有手动安装方式原地升级，再核对新清单实际送达/云端发布/页面同结果；候选交付不等于端到端通过，不要求重新配对或更换扩展目录。

2026-10-04 补发调度源码完成：Native集中提交并推送main `b13274491b8d8f5a21c695d386b7529bc77676e5`。17项调度用例含持续旧复查、今日head替代、多当前受保护来源轮转、空due回退、退避及北京时间边界；Contracts1.31.2/1.31.1各103/103，Service/Manager编译零警告错误。前三槽分别今日/历史/复查，剩余五槽Any；同scope/day最近attempt保留轮转，维持五分钟八项和原eligibility/ACK/身份停止。唯一最终2.6.28候选正在固定提交构建（尚未核验、安装）；现有2.6.27不自动获得源码修补。云端不重复部署，真实新统计送达/发布/页面核对仍未通过；原账、原Segment上传、计时、分类及配额不变。

2026-10-04 补发调度继续实施：Native 已用隔离回归复现持续替换的今日清单被旧复查挤占，12轮中3轮未获得发送机会。最小修补为今日上传、历史上传、发布复查各保留一项机会，剩余五项沿用普通队列；空类别回退，仍每五分钟最多八项，不绕过退避、用户分配、脏范围或逐项ACK。Native回报103项聚焦测试及Service编译通过，兼容核对/集中提交/唯一最终候选仍进行中；架构只读审查确认仅派生统计调度，不改原Segment上传。实时云端仍最新旧382（14:37:45接收，不完整且未发布），当前安装2.6.27不含本次调度修补，端到端尚未完成。无新分支/工作树、生产队列操作、部署、安装或共享启用。

2026-10-04 17:33补发阻塞精确核对：最后只读UAC已完成，不再等待用户确认。Native实际安装2.6.27 Reader独立重算：最新head505完整，原账范围hash/SourceRevision一致，冻结行hash和持久全值hash匹配均true；旧501正常superseded且冻结验收hash保持。505 pending/attempt0，按真实NextUpload门rank41/41，前8为本scope四项旧publication_check和四个历史pending。无dirty/身份/原账完整性阻断；旧发布复查与新上传共5分钟×8项额度，持续新head更新updatedAt向队尾移动，存在饥饿风险，不能据rank承诺等待时间。已交Native在既有统计修复范围重现并最小公平调度修补，保持频率/批额/退避/分配/ACK/不可变清单，不改原Segment上传或生产队列、不自动安装、不出中间候选。端到端仍未完成，历史兼容展示及既有P1分别保留。

2026-10-04 安装后分层验收更新：Native正常只读UAC锁定当前调用者、受保护assignment1，今日新清单501完整且无reasonCodes，持久快照同源、parity MATCHED/dirty=0；行hash重算及总量/分类匹配均true，rowsHash `e9f34bb9175d1e65d4f7aaa7ac9623d20438c73ec652dc542629b83a5b4e77b5`，manifestHash `087e896355d8df2585b6563e7e0521cd42f340a5d7052d28dee449820a4f4ef2`，固定截止1791106103311。51.125秒缺旧版本记录唯一存在/时长和缺字段保持/在截止内均true；缺全payload升级前字节基线，不冒称全账逐字守恒。旧382仍不完整且原行hash保持。501仍pending/attempt0/无服务器引用，补发门继续查，云端发布未通过。真实页面17:28:35已恢复有效读数并明确标“旧云端兼容统计（非最新Service统计）/更新中”，设备列表实机独立可用；首次503仍保留为P1，不等同彻底消除。各层状态分别登记，不安装第二候选、不改队列或原账。

2026-10-04 2.6.27安装后只读验收进行中：用户确认已安装，云端心跳已为2.6.27.0；Native确认运行Service状态、Agent和Host均2.6.27.0，当前认证调用者今日持久统计complete=true且非零，无POLICY_HISTORY_MISSING，仅产品归属未确认另列。尚未锁定同截止冻结清单，云端17:24观察仍是旧rev382/372不完整清单，没有新版发布证据。真实家长主页面刷新后应用独立读取503/COMPUTER_USAGE_UNAVAILABLE，旧页面所示51.125秒及旧云端兼容统计不能当新版发布通过。继续由Native正常只读UAC核对原账不变、模型重物化、新清单生成/发送门，并以脱敏状态/哈希匹配回报；统计读取P1保留，不用反复安装/部署替代定位。未改配对/分类/原账/ACL/共享开关；当前未完成端到端，不伪报通过。

2026-10-04 主控制台补发完成：production37191019757成功，仅主Pages，部署短ID `7f1a14a3`；实际 `timeonchrome-console.pages.dev/computer-usage-view.js` 回读与受测源码归一换行后完全一致。至此三项修改资源均已发布，Guardian/migration/R2/shared未操作。以下记录中的主Pages“尚待回读”已关闭；2.6.27安装及今日新统计→真实页面固定截止验收仍待完成，Mac实机单列。

2026-10-04 应用统计对齐集中交付：源码 PR #231/#232 已合入 master `d41d5d18f59867ac68aa1bb577bc925215025129`，Contracts 1.31.2 包 SHA256 `cd5958a1e44431a3bb955b7b564a2b2983b67fbec4614b393679e40118cf6f97`。云端94项相关回归、补充74项并行回归、契约及页面测试/桌面移动mock、typecheck/dry-run/边界/diff通过；精确主线 Runtime CI 37190793238、主控制台 CI 37190809384 成功。Runtime production 37190871584 成功：Worker `0dafe2d9-74c8-4901-bb65-0547a94ad44e`、独立 Pages `4f3350bd-4e09-45e1-80f6-2f258ae953f1`，health/401 smoke通过，线上renderer归一换行后与源码一致。自动Pages成功不等于实际主控制台更新，回读主地址仍旧脚本，已单独启动主Pages补发37191019757；尚待回读，不冒认通过。Native main `4d17e0de2755cd2345b0897de0f8e733b5923ddc`：Windows两版契约统计各97/97、管道19/19；Mac增量便携各102/102和Daemon编译通过，Swift及Mac实机另列。唯一内部未签名2.6.27候选已核验组件/安装器及哈希，路径 `D:\Codex\TimeWhereNative\artifacts\release\windows\x64\2.6.27\TimeOnChrome-AppRuntime-Setup-win-x64-2.6.27.exe`，SHA256 `1b2166024c795145c8a65235c31d48da6cc24b8767e8b007e0a18e3319ac2b8a`；Mac标准交接Issue12已送达，未有实机回执。当前仍未安装2.6.27，今日新统计发布→真实页面同截止核对未完成。旧不完整清单与原账保留，不执行migration/Guardian/R2 latest/共享启用，不把测试或候选称为端到端完成。
以下保留远端已合入的同日过程记录，当前状态以本页顶部新记录为准。
以下保留主线的扩展发布及云端过程记录：
2026-10-04 1.7.45托管完成：PR #235合入master d65c54448b495bdebdeae16bb6c1ae959e28c8b0，精确SHA CI 37198428287通过；首轮PR缺Task-Role元数据已修正。原签名密钥、CRX3签名、稳定ID、177个包文件及历史归档核验通过。更新源deployment 682f7f15，稳定与deployment双域名feed/CRX/SHA256SUMS一致；589015字节，SHA256 c881933effb517389114922bbdb70944723be4e883bc19412546017034880856，21个CRX归档保留。发布范围Matched，无Deviated/Extra；Mac实机双通道/迁移仍DEFERRED，readiness=false未动，终端安装待观察。未部署业务云端、Native或家庭配置，未启用恢复/共享执行。

2026-10-04 PO明确批准1.7.45托管发布：在既有Mac双健康链路提交a6e8b2c基础上仅提升manifest与发布文档，提交/推送/PR合入后用原密钥签正式managed包，验证稳定ID、产物边界、签名和线上双域名feed/CRX/SHA256；保留旧CRX。复用已通过两健康专项与typecheck，合入变化时按实际范围复核；最小发布门为managed渠道/隐私边界、根目录、typecheck及diff/精确SHA CI。不改业务云端/Native/Mac安装/家庭配置/账本/配额，不启用恢复或共享执行。Mac实机双通道与迁移验收未通过，extension-readiness=false不动；源码发布不代表备用接管可用。

2026-10-04 Mac独立健康源码与隔离验证完成（未发布）：新增mac-guardian-health客户端，native-host-client仅接线、共享UUID初始化单次在途及bootstrap状态通知；Windows/Linux/平台未知/非managed均跳过旧Host。两专项通过，覆盖Native心跳卡住、Native业务卡住、Guardian失败不阻塞新健康/业务、同Profile UUID、不同Profile隔离、真实状态枚举、timeout/缺Host/无效响应/重连/旧Port延迟事件/同步触发去重/优先probe有界队列/脱敏字段。原专项首轮失败仅因新增监听器数量断言，保留原处理器顺序并更新断言后通过；新集成用例亦通过。typecheck及diff检查通过。范围Matched；无Deviated/Extra；真实Mac双通道和迁移验收Missing/DEFERRED，readiness=false未改。版本仍1.7.44；候选、正式feed、Mac安装及业务配置均未动。准备向Architect回报，不能以模拟结果启用接管。

2026-10-04 CHROME-GUARDIAN-TRANSITION-20261004（PO明确授权，实施中）：仅macOS增加com.timeonchrome.guardian独立健康端口，保留现有nativehost健康/业务。先文档、独立客户端、生命周期接线及隔离测试；Windows不连接旧Host，不执行恢复。来源固定Mac接口46f2361228453d625163130ab04d05f15097d88b与交接4371bea7c25248f2738182381efecf0be4854197。变更等级为本地健康协议跨模块；最小验证mac-guardian-health、local-guardian、typecheck及diff；不跑安装/实机故障注入/全量/E2E。不改变身份、隐私、账本、配额、版本、候选或部署；Mac extension-readiness=false保持，模拟通过不代表真实双通道验收。无安装、接管或发布授权。

2026-10-04 页面真实续验：03676de/f3026d08已仅发布Runtime Worker，今日请求200，仍旧兼容缓存；查明附带整周任务的历史关联失败占用同scope两个构建槽。最小补丁优先当前查看日期，普通cron顺序、每次最多两项、退避和精确核验不变；历史队列保留不修。聚焦61/61、typecheck/dry-run/diff通过；standard-cloud审计Matched，无原账/计时/上传/配额变更，无Native安装或新分支工作树。真实Native页面采纳继续核对，不把部署成功冒认验收。

2026-10-04 今日应用统计核心链路：已安装2.6.28；当前认证用户冻结542 complete=true、545条事实，云端18:16:40接收/18:17:26发布；两端manifest/rowsHash一致，Native日/小时总量及逐分类守恒通过。旧536迟到范围、Mac、共享及P1单列，不阻塞今日收口。

NOW 已发布Native采纳修复（standard-cloud）：实时原账增长不再排斥冻结清单，截止内事实/归属/时钟/分类/关联/更正/行hash仍精确核验；以stale和截止时间显示更新，核验失败保留有效缓存，空初始化快照不遮住已知非零。聚焦60/60、typecheck、dry-run、边界及diff通过；Matched，无额外产品语义改动。仅Runtime Worker待发布及真实页面验收，不改原账/计时/上传/配额、两端/UI，不建分支工作树、不迁移/R2或启用共享。

2026-10-04 应用统计修订已合入PR231/master b1e8bc9；未部署。主线CI的209项中一项夹具在并行共用DB时误消费其他作用域队列，固定为只处理当前账户/孩子的scope，不改产品调度。应用发布/统计/电脑证据74项并行回归通过，原账/配额无改动。Native两版统计回归各97项、界面管道19项、Mac增量便携两版各102项及Daemon编译已回报通过，唯一2.6.27候选正在构建；Mac实机和今日发布→真实页面仍未验收。

NOW 2026-10-04 应用统计与网页模型对齐（PO已批准）：移除原记录旧策略版本依赖；本周最新分类、未归类合法、更早历史不追溯，原账不变。检查表：①决策/契约与共同向量；②Native公共Reader/日账/贡献及派生缓存修订；③云端接收/发布移除旧版本门并保持精确核对；④页面来源/截止/状态；⑤真实51.125秒回归、分类变化/跨周/迟到/重复/隔离/错误统计拒绝；⑥集中集成、兼容云端、一个Native候选、当前日新统计发布→页面实机核对。变更等级：Contracts+Worker统计读模型+云端页面+Native统计；必要测试仅相应聚焦回归/编译/typecheck/dry-run/边界/diff及页面视觉；CI按路径路由；发布smoke为health/401和固定范围真实统计。排除网页/媒体原账测试（无修改）、无关Agent/Mac全量/WiX，Mac实机单列。复用既有工作线，无新分支/工作树/migration/共享启用。源码进度：云端接收/核验、当前周分类覆盖及派生模型摘要已修订；Contracts1.31.2集中说明及共同向量完成，固定包SHA256 cd5958a1e44431a3bb955b7b564a2b2983b67fbec4614b393679e40118cf6f97。Worker四个聚焦文件94/94、typecheck、契约build/typecheck/向量/兼容、页面renderer回归及桌面/移动mock目视、dry-run、源码边界和diff检查通过。页面新增Service/旧云端来源、逐日截止及刷新失败保留有效读数；Native正在实施公共Reader/模型失效和同向量回归。尚未部署、安装和当日端到端验收；电脑时间线及产品明细一致性继续核对，不将源码通过写成最终修复完成。
2026-10-04 控件1.7.44发布完成：实现提交21e19e8、PR #229、合入master 97d8bd41cad22d754931174d73ed91575962b310。精确PR CI37153413233的app-runtime-gate通过；合入后构建既有contracts产物并typecheck通过，源码工作区干净。原密钥签名、CRX3独立验签及稳定ID核验通过，CRX586032字节、SHA256 7f68f977a23737389d80ef190d390500f390d66c92460aa72bccc49359ecb308。Wrangler4.127.1部署timeonchrome-update/master，生产deployment 53cbe046；稳定域名与deployment域名feed/CRX/SHA256逐项回读匹配，20份CRX归档保留。范围审计Matched，无Deviated/Missing/Extra（本次发布范围）；真实Chrome恢复、Mac和共享联合验收仍未通过，不混作已修复。未部署业务云端、迁移或安装Native，未动家庭开关；终端升级另行观察，unpacked不会自动升级。先前发布中及未托管记录由本条覆盖。

2026-10-04 PO批准控件发布并托管（extension-local／release）：本轮正式managed 1.7.44取代未托管1.7.43准备包，包含应用日周读取故障隔离、旧Port延迟事件隔离、Admin导航拆分和标题区本机休息摘要。线上feed只读仍1.7.32；不复用缺少本轮补丁的旧CRX。范围为本线源码、测试、发布文档与更新站点，保留旧CRX；不改Worker/Pages业务、Native安装、D1、家庭配置、计时或配额，不启用共享执行。最小发布验证：既有局部截图证据复用，local-guardian/application-usage/rest-summary/admin-nav/managed边界、typecheck、扩展根目录及diff；固定分支提交并PR合入经验证主线后签包托管。原密钥环境未配置，已请求本机路径，不生成新密钥。真实Chrome应用恢复仍未完成，Mac及其他既有遗留不伪报通过。

2026-10-04 标题摘要同行排版完成：桌面今日／本周各合计与分量同行、分量12px/400；390px两项上下且各自分量紧随后，原状态和明细保留。隔离真实HTML mock视觉测试1/1及diff检查通过，已目视核对desktop／partial-mobile，证据ignored .tmp/rest-title-summary-GWiUzn。Matched，无Deviated/Missing/Extra；仅样式，数据口径不变。已备份原子同步当前开发候选admin.html并核对哈希，无版本／数据／绑定变更，未提交部署托管。

2026-10-04 标题休息摘要紧凑排版（extension-local）：按PO要求今日／本周合计及各自网页＋应用分量同排，合计粗体16px、分量常规字重12px，桌面两项同一行；窄屏保持自然换行与原同步状态，不横向溢出。只改Admin HTML样式与直接视觉断言，不改计算或数据；验证隔离桌面／手机截图，备份同步既有候选，不提升版本、不提交部署托管。

2026-10-04 PO批准第三次复验后local-guardian通过，application-usage-read-model及diff检查通过。旧Port onMessage/onDisconnect不再处理新连接事件，新增回归验证旧Port延迟断开不拒绝新应用读取；首次两轮新增夹具调度错误如实保留前述记录。修复已备份并原子同步1.7.42开发候选infra/native-host-client.js，源码／候选SHA256一致；首次File.Replace空备份参数未执行，改用明确备份路径后成功，备份ignored dist/native-connection-backup-20261004-044532。未重载用户扩展、未改绑定或storage；真实Chrome恢复仍待重载与刷新应用，auto-connect报告无可连接Chrome实例（无调试端口），不宣称页面已恢复。未提交部署托管，旧Port竞态修复不是未经证据确认的截图唯一根因。

2026-10-04 应用连接续查待复验：新增旧Port延迟事件隔离补丁及回归。专项两次失败均在新增夹具建立第二连接前：第一次误用5秒probe冷却，第二次在前一发送finally清理前重用在途Promise；已改为强制heartbeat并等待前一发送退出。按两次失败限制暂停专项，补丁未同步候选，未提交。已安装Host真实只读查询成功不替代Chrome连接复验；未认定截图根因已完全解决。

2026-10-04 应用读取连接续查（extension-local）：截图已显示native_port_disconnected；只读实机核对Service Running、Host 2.6.26.0及32位Chrome注册存在，隔离Host真实当日应用读取成功，未输出应用内容、未发送心跳或写账。当前扩展仍失败不能宣称恢复。发现旧Port延迟onDisconnect可拒绝新Port请求并清空能力；先专项复现，修复仅隔离旧Port事件，不改Native、网页账、快照、配额或存储语义。验证local-guardian和应用只读专项；通过后备份同步候选，实机刷新结果仍需核实。该竞态不未经实机证据认定为截图唯一根因，不提交部署托管。

2026-10-04 标题区休息摘要已实现并同步1.7.42开发候选：标题下／原同步状态上、无卡片、桌面并排／390px上下、日周独立与未知保留均Matched，无Deviated／Missing／Extra。本机Rest桶复用buildLocalQuotaProjectionV2纯读，应用受限娱乐复用既有验证适配，直接相加且显示未去重；不扫描原账、不写storage、不消费云端其他设备或加入执行。rest-usage-summary、application-usage-read-model、admin-nav-refresh与extension-root通过，diff检查通过。隔离真实HTML／实际标题渲染器mock截图测试通过，证据ignored .tmp/rest-title-summary-bfWHlj；首次失败为测试脚本顶层await夹具错误，修正后复验通过。已目视核对desktop和partial-mobile，明细正文在此测试中mock，不声称真实家庭数据验收。候选新增stats/rest-usage-summary.js并备份原子替换Admin两个文件，manifest哈希与版本不变，旧文件备份ignored dist/rest-title-backup-20261004-043159；未提交、部署、托管或修改绑定／本地账。

2026-10-04 使用分析标题区休息汇总（extension-local，实施中）：按PO确认在标题下／同步状态上增加今日、本周本机休息摘要，网页实际Rest桶（含借用）＋应用受限娱乐分类，简单相加未去重，不作配额或提醒输入。复用既有本机投影与应用只读接口，日周分别判定完整性；未知不补零，保留可读分量。不随明细日期、日周或账本Tab变化。最小验证：只读汇总专项、应用适配专项、隔离桌面／390px真实HTML mock截图及diff；不改原账、聚合、Native／云端接口。通过后只备份同步开发候选相关文件；不提升版本、不提交部署托管。保留全部已有未提交修改。

2026-10-04 本地 Admin 拆分已实现并同步开发候选：侧栏四入口、访问三页签／网站两页签、分别记忆与进入刷新、原内容保留均Matched，无Deviated／Missing／Extra。admin-nav-refresh 10/10、admin-undetermined-list 52/52通过；隔离真实HTML／导航mock桌面及390px五页签测试通过，截图位于ignored .tmp/admin-navigation-split-0eJ5jU；原自主度面板日周软提醒的实际渲染mock回归通过，截图 .tmp/rest-admin-visual-8D6Zzt。已目视核对桌面网站管理、窄屏导航与配额、自主度完整说明；导航截图不作为真实家庭配置验收。受限启动器无输出已关闭，允许子进程后相同隔离测试正常通过。仅原子备份替换现有1.7.42候选的admin.html/admin.js，manifest哈希未变、已有应用修复保留；不涉及其他源码、绑定或存储。未提交、部署或托管，当前用户页面需重新打开以读取新文件。

2026-10-04 本地 Admin 导航拆分（extension-local，实施中）：按 PO 批准侧栏为使用分析／访问管理／网站管理／系统管理；访问管理保留时间配额、自主度、时间段，默认时间配额；网站管理保留网站清单、归类记录，默认清单。共用既有只读配置渲染与同步摘要，分别记忆页签，进入两入口均刷新配置。仅改Admin布局／导航及直接相关测试，不改云端、Native、账本、配额或应用使用。验证导航专项和隔离桌面／窄屏目视；通过后仅备份替换现有开发候选Admin文件，不提升版本、不提交、部署、托管。已有应用读取修复和三份历史文档草稿保持。

2026-10-04 应用日视图修复结果：只读适配、Native 错误映射及允许列表已修复，日数据／周数据分别缓存和校验；周失败保留日结果并显示未知。application-usage-read-model、获准第三次复验的local-guardian、extension-root及diff检查通过；前两次Native专项失败是新增错误码遗漏允许列表，已补齐，不隐去失败。当前1.7.42开发候选仅原子替换admin.js、native-host-client.js、application-usage-read-model.js，三个旧文件保存在ignored dist备份；manifest、部署标记、key及所有存储不变。隔离目视预览因浏览器连接超时未完成，测试进程已关闭；真实Chrome重载和Service当天返回尚未核实，不能将本轮视为现场应用统计恢复验收。未提交、部署或重签1.7.43；已有1.7.43产物不包含本补丁，不能误报包含。

2026-10-04 应用使用日视图读取修复（extension-local，实施中）：已证实页面即使选择日也先要求整周读取成功，Service 的逐日发布／范围校验未就绪会阻断可用当天数据。日数据独立读取；周补充失败保留当天并明确周未知，保留 APPLICATION_USAGE_PENDING 错误含义。范围仅终端只读适配与错误映射，不改 Native、网页／应用原账、统计生成或配额，不绕过发布校验。最小验证：application-usage-read-model 与 Native Host 消息专项、diff 检查；真实运行候选与 Service 返回仍须实测，不凭单测关闭现场故障。既有三份文档草稿保持。

2026-10-04 PO纠正T.xia现象并要求继续调查：是Chrome退出后自动重新启动，必须分开核对退出原因和重新启动者，黑名单关闭能力不单独解释重启。架构只读核查固定Mac f6ef78e的Runtime/Manager/安装配置：TimeWhereLauncher的open -a及manager-ui启动目标均为TimeWhere.app，daemon/session-agent KeepAlive只守护本程序；已查范围未发现关闭Chrome后主动重开的实现。扩展源码只读检索未发现runtime.restart/restartAfterDelay/Browser.close等调用，不等于目标安装扩展已验收。旧外部Guardian Host在既有Mac报告中仍保留，外部守护行为未核实；已交Native把旧桥、0.1.24源码归属、Chrome自身更新/外部恢复作为已有材料调查项，不猜测根因。不要求现场、不改策略、不复现、不操作进程或文件；当前仍无法证明退出/再启动由谁触发。

2026-10-04 PO调查T.xia电脑Chrome频繁重启/疑似误终止：准确云端机器为macos、Service0.1.24.0，12:38:25心跳，machinePolicy8118/8118已应用。云端该机终端日志策略未开启、上传日志总数0，不以无日志排除误终止；当前应用策略168对盘点Google Chrome三个技术身份精确匹配没有明确分类条目，未发现这些身份被直接列blocked，不代表其他变体/历史策略/本机缓存已经排除。Native对固定Mac f6ef78e静态审查确认黑名单关闭路径可forceTerminate，protectedBundles不含Chrome；共享Chrome保护不覆盖产品黑名单，不能因共享关闭而断言不会终止Chrome。未取得0.1.24安装文件来源比对、目标实际命中及重启时刻对应，根因未知。PO在Native会话说明不能现场核查，本轮只用已上传云端证据、已推送源码和现有报告；不要求复现、不改策略/加Chrome豁免、不启停进程、不安装/重启/删除文件。无已证实文件删除动作；查的是进程终止与崩溃/更新的区别。仅查询/文档diff，不跑产品测试、不新建分支工作树。

2026-10-04 05:45 Windows队列实际匿名证据：Native通过正常UAC取得本机当日3个scope/3heads、dirty=0、parity MATCHED=3；有1项合法且到期pending、attempts=0、无服务端清单引用，另有5项到期publication_check等。此为allLocalScopes匿名汇总，currentUserScopeVerified=false，不冒认目标用户；可排除本机所有今日队列均被dirty/parity挡住，尚不能确认轮询排序是根因。架构复查当前受保护非零assignmentVersion1今日清单仍无；assignmentVersion21的零事实清单received/published=21、05:37:50接收，不代替目标通过。追加前8到期候选排序诊断已由Native启动，当前等待Windows只读UAC确认；不为诊断安装新版本、不读密钥、不改ACL/原账/队列。方案核对只读边界Matched；具体发送门及截图实际失败响应仍未确认。

2026-10-04 05:42 PO要求检查Windows今日统计清单未送达：重新只读核对最新受保护assignmentVersion=1，截至05:41:50有效原事实331条，当日日清单仍0，未到received而非云端拒绝published。PO截图显示应用使用页签报COMPUTER_USAGE_UNAVAILABLE；源码核对应用页签通过source=application调用独立应用读取，公共路由把未列明的异常归为该泛化码，截图本身不能证明与Native发送问题同根。Native已启动既有UAC路径调查；精确当前用户队列scope外部派生会涉及身份密钥，因此禁止读取密钥/猜用户，改查本机匿名队列元数据汇总（dirty/parity/stage/due/attempts/error），不以其他用户成功代替当前用户验收。尚未取得具体发送门实时证据，保持未完成；不为诊断升级、清队列、重启或部署。

2026-10-04 PO明确裁决：Windows 2026-10-01单条3.015秒应用事实缺少appPolicyVersion（POLICY_HISTORY_MISSING），登记为P2、搁置，不作为本轮交付阻塞；开发过程历史数据不要求追求绝对完整一致。此条覆盖下方该指定历史缺口的未定级状态，不表示已修复或验收通过，不补造策略版本、不改原账、不清除完整性诊断、不把缺失当零，也不自动放宽共享执行。当前日统计清单未送达是独立现行链路问题，继续调查，不因这条历史记录搁置而一起关闭。仅维护现有任务板，git diff --check；不运行产品测试、不创建分支/工作树、不安装部署。

2026-10-04 05:17 Windows当前日只读续核：限定当前受保护Windows用户最新assignmentVersion=1，截至05:16:30有效应用事实308条，统计日清单数量仍0；原事实通道持续上传，不是机器鉴权或网络完全断开。结合05:11管理员摘要当前日head301/pending23，阻挡点尚待本机dirty/parity/outbox stage、到期时间和尝试记录确认，不能仅凭云端无清单指定根因或再次部署。五个已发布历史日仍按此前核验保留成功；本机旧published水位不据此倒推云端失败。Native所属会话最新直接PO指令为先完成Mac，精确Windows队列诊断暂未执行；本架构不覆盖另一会话的直接优先级、不代改Native、不把待取证写成已修复。10/1单条3.015秒缺策略版本继续独立登记，不补造历史证据。查询rows_written=0，仅文档diff检查，无安装、部署、迁移、重启、清队列或共享启用。

2026-10-04 Windows生产只读核对新证据：2.6.26非零应用来源最近一周中9/28、9/29、9/30、10/2、10/3最新received修订均与published相等，关联版本与当前策略一致，发布拒绝码为空；此前笼统“关联版本未收敛”已不符合这五天现状。10/1最新清单仍complete=false/POLICY_HISTORY_MISSING，被APPLICATION_ACCOUNT_INCOMPLETE拒绝；云端已定位一条约3秒schema2原事实app_policy_version为空，其余所引用策略历史存在。这是应用策略历史缺口，不是PO已定P2的网页历史未知桶，未据此降级或补造证据。今日非零来源已有299条有效事实、策略版本无缺失但尚无对应日清单；另一个账户的零清单已发布不作为本账户通过证据。Native已接续同作用域本机冻结统计/dirty/outbox诊断；仅上述云端事实核对完成，当前日发布及页面实机仍未验收。查询rows_written=0，无生产写入或测试数据注入，不重复部署同一代码。

2026-10-04 PO优先处理Windows新统计发布水位/版本关联未收敛：先只读固定当前Windows来源、日期、分配/统计/关联/更正版本及截止范围，对照本机冻结清单、云端received/published和最新发布拒绝码，区分接收/核验/发布/读取阶段；Native负责本机诊断，架构负责云端核对。未确认错误前不改原账、计时、队列或统计校验，不重装/重启、不执行migration或启用共享，不新增分支/工作树。只读阶段仅运行版本/查询/文档diff检查；确认云端代码缺陷后按实际最小范围定义聚焦回归，不跑无关Windows/Mac/安装器全量测试。Mac已交接任务保留，不能用旧冻结影子或不同用户状态代替当前事实。

2026-10-04 PO明确裁决：2026-09-30、2026-10-01网页派生贡献各360000毫秒的历史未知桶（LOCAL_BUCKETS_INCOMPLETE）登记为P2、待后续处理，不作为本轮非共享发布阻塞；未修复、未验收，不记PASS。不补造分类、不将未知视为零、不修改原账或贡献完整性标记；共享启用时仍如实呈现对应周期的覆盖状态，本次定级不等于放宽核对或批准启用共享。仅更新问题优先级记录，文档变更只运行git diff --check，不运行产品测试、不创建分支/工作树、不部署。

2026-10-04 Mac契约补丁结果：Contracts1.31.1类型/schema/共同兼容向量已补齐；build、typecheck、usage-account聚焦测试及contract-compatibility通过，git diff --check通过。固定包timeonchrome-app-runtime-contracts-1.31.1.tgz（112916字节，SHA-256：68233d9ad0da9ebc0c9fd15017fc2aa4bd3ca9cc86625fa84b89b7b0aff4dd9f）包含类型、schema、向量和编译模块，不包含凭据。方案核对Matched：兼容可选诊断、接收/发布三态、旧版缺字段及非法诊断拒绝；Deviated/Missing/Extra为空。此处只完成契约源码与固定包；Native/Mac消费、实际发布诊断、非零日账published及页面对账仍待所属端完成，不记实机PASS。

2026-10-04 Mac发布诊断契约补齐（当前架构任务）：云端status已返回publicationErrorCode，但Contracts1.31.0未定义，Native固定包无法消费。补丁1.31.1只增加可选、可空的稳定发布诊断码及schema/兼容向量；字段缺失或null表示无可用拒绝诊断，不表示已发布。received仍仅确认接收，published/publishStatus不变；消费者必须先校验manifestId/revision/manifestHash与在途版本一致，拒绝码只用于诊断，不清队列、不更改统计/校验。实施清单：usage-account类型和schema→现有共同向量与N/N-1测试→build/typecheck/聚焦usage-account和契约兼容→固定包与哈希→现有Native任务交Mac接入。只读根诊断不改两端源码；不运行Windows/Mac/安装器/网页落账/页面全量测试，不部署、不执行migration、不新增分支/工作树。

2026-10-04 PO明确裁决：既有cg.163.com idle少记风险、19009秒未解释历史差额统一改为P2，状态为待后续处理、非发布阻塞。此裁决覆盖此前针对这两项的P0/发布前重复风险接受要求；不得再因相同旧记录阻断发布或重复索要豁免。两项未修复、未验收，不记PASS，不清空或改写历史账；此为两项指定问题的优先级裁决，不放宽新发现账本缺陷的报告及专项规则。自托管1.7.43已签包并合入master 4996d202，更新源仍1.7.32；当前按PO先处理Mac，未据此自动恢复部署。

2026-10-04 Mac日账优先核对（PO指定）：自托管1.7.43更新源暂停，线上仍1.7.32；Mac跨账户Chrome继续延后，但独立应用日账接收/发布/页面对账继续，不整体标为DEFERRED。已读取Native报告118dc187及生产D1匿名来源核对：三Mac用户最新分配版本的已接收日清单均complete=false，无published；非零历史日期原因POLICY_HISTORY_MISSING，零事实日期SOURCE_COVERAGE_UNKNOWN，云端稳定拒绝APPLICATION_ACCOUNT_INCOMPLETE。此为上传清单状态，不能替代报告中的今日完整非零本机统计。云端status接口已返回publicationErrorCode，需Mac核对读取及显示链，并报告当前用户assignmentVersion、日期/统计revision/实际上传revision以对齐同一作用域。已通过既有Native会话转Mac标准交接；不清队列、不放宽校验、不改原账/计时/算法，不新建分支或工作树。变更等级：只读诊断与任务记录；仅Git/diff检查，无产品全量测试或生产写入。
以下保留自托管准备时的历史记录；两项风险定级及Mac当前范围以本页顶部2026-10-04 PO裁决和Mac优先核对记录为准。
1.7.43发布风险只读复核：cg.163.com失焦强媒体在idleStateChanged关闭网页账仍为P0/Deferred，未取得修复及真实原账验证，旧1.7.27/1.7.32豁免不能自动用于本版；实际feed发布前须由PO明确接受本版已知风险。19009秒差额仍是未解释历史对账问题，不在本次重建/改账范围，既有V2改造不证明历史差额已解决；后续合并配额和上传观察单列。Mac真实验收及共享执行不适用于本版已批准非共享范围，但保持DEFERRED而不是PASS。更新站点发布必须保留原host完整树的历史CRX路径，不能用仅新版本的小目录覆盖生产。

2026-10-04 正式managed1.7.43已签包、未部署：安全接入既有仓库外原密钥后，打包器派生ID及独立CRX3签名验证均确认jdcancbiocacabbjdkngadmjpjmkdnih。CRX583415字节，SHA256为8aa4572fe060768db4da65267949bbbfc800ec1cbd261a1d67fd65d400b65c7e；175归档文件逐项匹配正式staging，Chrome仅排除.gitattributes元数据。正式marker=managed，无开发名称、debugger或sharedBrowserCloseDevelopment，保留正式Host及probe；host-output中CRX与原包哈希相同，feed及校验文件一致。旧1.7.32CRX和运行中1.7.42候选保持；没有更新线上feed、启用共享执行或读取家庭存储。相对最新origin/master产品及打包工具仅manifest版本差异，复用未变代码证据，两项managed最小测试通过。后续由架构执行更新站点部署回读，未部署不记为已上线。

2026-10-04 已批准正式 managed 1.7.43 非共享发布准备：仅提升源码 manifest 并隔离生成正式 managed staging，复用现有产品及 shadow 门禁证据；不改打包工具、网页记账、原运行候选或家庭配置。正式包保留 nativeMessaging、health probe 和正式 Host，排除 debugger、native-host-development 与 sharedBrowserCloseDevelopment。线上 feed 当前仍1.7.32；共享执行总闸关闭的精确部署证据由架构提供，不代替当前 Profile 实机采样。Native2.6.26双Host注册及五项聚焦测试采用所属任务证据，旧guardian仍有1.7.32消费者，真实卸载未实测。隔离staging完成176文件，按排序后的文件SHA256及相对路径清单计算摘要c9a6c555ac4b7058bc8f42472e2dc62d5d9258e3a8ddeff507ffc895b2df910b；managed-internal-channel 16/16及managed-package-privacy-boundary三渠道矩阵通过。原签名密钥未接入，CRX不存在，不能称已签CRX或已发布。三个既有混合文档草稿保持原样，本次提交只包含该准备记录与版本。Mac实测、Windows共享余额/执行及历史未知桶继续未完成。

## NOW：共享连接身份核验简化（2026-10-03，PO已批准）

PO扩大交付到实际自托管（2026-10-04）：已明确要求执行内部managed渠道更新，取代此前仅unpacked/记录交付限制；控件任务执行正式managed制品与稳定feed/CRX发布，Native只读核对正式Host/旧别名/稳定ID兼容，不用开发连接证明正式渠道。不得夹带native-host-development或shared关闭实验配置，不进入CWS、不切R2 latest、不开共享、不新分支/树。当前自托管进行中，待正式候选最小验证/来源/签名稳定ID及线上feed/CRX/hash回读；MacDEFERRED且独立回报，统计已知问题不改写PASS。主线文档PR226应随此范围更正，不能只合文档称更新源已发。

非共享发布决定（2026-10-04，PO“继续完成发布，mac后补”）：Mac云端接入已发布但安装/真实能力、非零发布、页面对照及应用执行实测保持DEFERRED，不能冒充PASS；共享功能联调同样不在本版启用范围。三份现有文档集中提交并合入，代码证据及生产manifest复用，不重新部署文档SHA，不构建/安装新候选。内部非共享交付完成不代表Windows统计遗留、P1、历史桶或整体D-114关闭。

非共享交付核对结果：控件1.7.42复用，七个关键文件与受测源码一致；Windows四组件2.6.26.0/SHA匹配且Service正常，Native交付记录已推69aed6a。两端shadow不启用共享执行，但并非永久禁止共享的删功能构建。生产manifest37146310947所指Guardian版本8dc07256与发布37133833997一致，发布命令明确SHARED_ACCESS_EXECUTION_ENABLED:false；源码总闸false将shared降为shadow。本次未取得新鲜Profile认证stage，不把部署证据冒充现场采样。现有已上线独立能力按PO决定作为内部非共享版集中交付，无需重装/重复部署；原账、配额、产品黑名单、R2 latest和开发目录不变。Shared联合验收及已知统计缺项保留，Mac另行回报。

PO批准非共享内部交付（2026-10-04）：复用已经部署的云端master4e53525、Windows2.6.26和原目录控件1.7.42；本次不创建分支/树、重复部署同SHA、重建/安装、发布托管/CWS或切换R2 latest。交付范围为现有独立配置/管理/统计及设备能力；共享执行继续关闭，贡献仅影子核对。已交控件/Native所属任务核对shadow阶段不会触发共享访问/提醒/结束，既有独立规则和产品黑名单不被停用，回报精确候选/安装与源码证据。本轮只修改现有项目真值及任务板，必要diff检查；复用未变代码证据，不跑全平台。Windows发布收敛、P1、历史桶、共享联合验收保留未完成；Mac沿已提交任务832fe7d/Issue12单独回报，不当作Windows交付证据。

Mac接入已发布（2026-10-04 03:03）：功能提交ae559af、PR #225，PR CI37146137428及master 4e53525db2dc185c3696d9fa8ee6c18ccc397216的CI37146225612通过；Production37146310947成功，仅Runtime Worker，version4ae6b678-027a-44d0-b753-01b15e854b89。日志确认No migrations to apply；公开独立smoke health200、未认证目录401、R2 latest仍2.3.1。已沿Native Issue #12发送跨机验收任务，复用Mac0.1.22和原配对、正常能力读取与补发，不重装。源码/部署完成；Mac真实认证能力、非零接收→发布及同范围页面对照仍待回报，不能宣布实机问题全部关闭。Windows未收敛另项保持待查，共享执行仍关闭。

Mac接入源码验证（2026-10-04）：能力声明和核对器共用精确平台算法映射，macos只接受macos-application-v1、windows只接受windows-application-v1。两文件64/64聚焦回归通过，涵盖真实D1接收/发布/持久读取、1501毫秒、并集、跨日、零日完整性、错误统计/关联/更正拒绝、用户隔离和迟到事实；typecheck、Wrangler dry-run、源码/任务边界及git diff --check通过。审计Matched=批准源码范围与原有严格核对；Deviated/Extra=空；Missing=生产发布及真正Mac补发验收（尚未完成）。不新增契约字段或migration，不修改Native及原账；共享执行仍关闭。

NOW Mac应用统计云端接入（2026-10-04，PO要求优先处理）：固定Mac来源3f9b778的Daemon使用公共ApplicationUsageReader/ApplicationAccountStore并选择macos-application-v1；现有云端仅Windows能力与算法/platform门禁，造成0.1.22可发送日账被正确暂停。任务standard-cloud，允许TASK_BOARD、docs/DESIGN、backend应用清单/发布核对及对应测试；保留当前未提交发布续验记录和原有产物。实施顺序：①记录同一统计语义与平台算法绑定；②能力声明与严格Mac核对支持；③Mac非零/零、毫秒并集/跨日、错误统计/错平台/关联/隔离/迟到事实及持久读取回归；④typecheck、dry-run、边界/diff、PR与精确SHA CI；⑤仅Runtime Worker部署，Mac真实接收/发布/页面由Mac端分别核对。无契约字段变更，不改原账、计时、配额、Native/扩展、Pages，不执行migration或安装；排除Windows/Mac全量编译、安装器和无关页面测试。只有源码与真实精确核对均存在才声明Mac能力，实机未验证不得标完成。

现场未收敛（2026-10-04）：部署后同一已认证管理员窗口连续两样本（后台快照02:42:05及02:47:46）可见发布水位没有推进；10/1仍无发布，另五个可见历史日仍旧发布/新账头关联不匹配，旧冻结影子不完整。浏览器来源仍有效连接。最新未发布清单的稳定拒绝原因/完整性未自然显示，不能由旧影子推断；10/4日期及版本在截图外，保留未知。本轮两次采样结束，不继续轮询/造新包/要求滚动；排序延迟源码缺陷已修复上线，但不能认定它是现场唯一根因。下一定位必须取得当前作用域最新清单的拒绝原因，不能放宽核对、猜测分类或把未知当零。共享余额/执行及原账守恒仍未完成真实验收。

发布续验（2026-10-04）：排序修复提交`8e7461d`、PR #224，相关CI `37144541010`通过，merge master `f208d00d4353721e3cb899a202e9a6d906195bd6`的精确CI `37144750785`通过；Production `37144847572`成功，仅Runtime Worker，version `089a4dbc-e8f8-4007-bd5c-97e7f675b3a9`。生产迁移检查无待执行项，apply=false；未发布Pages/Guardian，未更改R2/latest或共享执行开关。架构独立公开smoke health200、未认证目录401、latest仍2.3.1。Native正在用已安装2.6.26和既有认证管理员窗口续验实际发布/账头/影子，现场收敛尚未确认，不能将部署完成等同完整目标完成。

Mac云端缺口（已有Native跨机交接）：回读固定Mac报告，0.1.22已获PO批准安装，配对/策略/可发送状态正常，但capability为APPLICATION_ACCOUNT_UNSUPPORTED、日账待上传9。当前主线能力明确仅windows-application-v1，发布核对器也拒绝Mac算法及平台；因此不能仅增加acceptedAlgorithms虚报支持。需按Mac既有权威统计完成云端精确核对适配及黄金用例，再分别验收接收/发布/页面。生产认证能力原文尚未核实，不宣称全部门槛字段已定位。Mac提醒执行仍关闭，网页来源未连接；不以Windows证据代替Mac真实验收。

云端发布调度修订结果（2026-10-04）：两项真实D1固定回归在旧实现均失败，证实旧不完整/旧关联清单可占满两项预算，延迟完整且当前关联兼容的新快照。候选排序现优先完整、当前关联匹配，随后保留检查/接收顺序；预算、冷却、严格核对及定向重试不变。旧不完整与旧关联仍以原错误码拒绝，原始事实逐行对照不变。publication同文件27/27、Worker typecheck、Wrangler 4.127.1 dry-run、源码边界及diff检查通过。审计：Matched=限定排序/拒绝条件/预算/原账/最小验证；Deviated/Missing/Extra=空（仅此源码修复范围）。尚未合入/部署，不宣称全部现场发布或共享余额已恢复；完整目标仍待真实链路及提醒验收。

2.6.26实际诊断续验：四安装组件版本及SHA与候选一致，Service运行；管理员界面本轮能力/政策ready，七日摘要显示部分日期冻结发布与current head关联不同、旧影子不完整，当日/10月1日本机尚无确认发布版本；循环及应用ACK继续推进。其发布序号对应此前另一匿名来源，不把两份来源结果混用，也不据此确认孩子相同。云端源码只读检查发现两项/轮的候选选择按检查时间和接收时间排序，未优先完整且当前关联兼容的快照；先用旧不完整/旧关联两项在前、有效新清单在后的固定回归验证调度延迟。实施范围仅发布候选排序（如回归证实）、同文件回归及本任务记录；核对器、原账、持久统计语义、配额、权限、批次预算及不可变收据不变。必要验证为publication聚焦回归、Worker typecheck/dry-run、路径与diff；排除页面/Native/安装器/Mac及全量测试。代码验证、合入和部署分别记录，不提前宣称现场根因已解决。

必要诊断候选交付（2026-10-04）：旧2.6.25管理员接口没有七日冻结版本/影子/候选诊断，独立helper无法在不读取身份派生密钥或猜测作用域的情况下确定同用户范围，因此沿既有Service认证交付唯一内部2.6.26，不扩大数据库读取权限。构建来源`83eb1ef541df74a88092052995e841482c1bc5b2`、产品源码`f5e49dd`、交付文档提交`03877de`；固定契约1.31。首次构建NU1900经只读对照确认是沙箱网络限制，正常网络下同一NuGet地址200后仅重试一次，安全检查未关闭。架构独立核对Burn119770663字节/SHA `cbba0e910ad32b93e7c6388318979a5d55bd54db6b58a6e2f9ac3ce2cf91e9b1`、MSI61081334字节/SHA `0f47d0e4385fd9d35ac87efc4a984eba2dd4a551ad43f5df7e26937aebbf8cd8`、manifest SHA `cadd6b35728c15b18fcb82903c2e6915e3935203c0cb9951634b91c5d19ec3b2`及四发布组件2.6.26.0。安装器结构2/2，源码聚焦25/25证据复用；Native核验旧43项发行文件/latest未变。安装器位于`D:\Codex\TimeWhereNative\artifacts\release\windows\x64\2.6.26\TimeOnChrome-AppRuntime-Setup-win-x64-2.6.26.exe`；内部未签名/latestEligible=false。当前仍安装2.6.25，按PO选择等待手动升级，无自动安装/重启/部署/执行启用；候选完成不是故障修复或全链验收完成。

现场版本核对（2026-10-04）：PO提供两份只读导出；对应受保护分配最近七日的应用统计均已发布，但共享回执的统计摘要、产品关联与分类更正版本七日均不匹配当前发布版本，前六日截止时间一致、当日截止时间不一致。核验记录自身指向当前回执和发布头，不是单纯旧核验缓存；因此拒绝有依据，尚不能据此裁决贡献构造错误或发布唤醒遗漏。另一来源有独立发布/关联缺项，不假定属于同一孩子。原始记录、统计和执行开关未更改。

定位推进：Native在既有管理员诊断补齐本轮能力/政策准备状态及七日冻结发布版本、当前账头、影子四字段、候选拒绝原因，集中提交并推送现有main `f5e49dd4beed5f0e53ff28e09079f3a2ce066895`；架构已只读审查并复核最终TRX 25/25、0失败/跳过，SHA-256 `b9060261c5d234272896bb48e15441e83feefed3204fac5b78e79c425c582ade`。七日元数据使用现有用户/分配/日期索引，字段不暴露身份、hash、清单正文或用量，普通账户不增加详情；不改变上传门禁、统计、权限或共享执行。源码测试通过不表示已安装或根因已修复；尚未构建下一候选。已交Native评估一次受控只读取证，不能借管理员窗口绕过提权、注入或改ACL。控件当前只读页面验收因浏览器工具拒绝访问内部页面仍NOT_VERIFIED，既有人工连接/贡献ACK证据保留但不作为当前余额证据。

安装后核验更新（2026-10-04 00:58）：Native会话收到PO“已经安装”并只读采样，架构独立读取正式安装目录四组件版本2.6.25.0及SHA全部匹配候选。Native公开状态online、Service Running/Automatic、Service/Agent各一个；公开协议字段1只是健康观测，不据此裁决当前扩展v3。已交Native继续当前10/4连接/同孩子/贡献ACK及共享读取核对，不开启执行、不重启、不绕权限。此前下条“仍安装2.6.24”是交付时历史状态，本条覆盖；正式余额/提醒/恢复及原账守恒仍未验收。

远端CI外部阻塞（2026-10-04）：Native推送`eedbe7c`运行`37138554278`的changes/native-gate在启动前失败，GitHub原注释为账号付款失败或spending limit需增加；Windows/Mac jobs跳过，没有执行产品测试。插件日志BlobNotFound后以CLI只读回读run和check注释确认。本地测试/构建证据保留，远端记NOT_RUN/BILLING_BLOCKED，不重跑、降级门禁或改付款设置。既有云端运行通过证据不被冒用为本次Native SHA的CI；源码合入和实际安装验收分别保留待办。

最终Native候选已交付（2026-10-04）：2.6.25一次干净构建来源`050cfe6`，后续交付文档`eedbe7ce86b197fcbef65e45a53aaa71872bfcb7`已推送现有main；无新分支/树。架构独立核对Burn119791699字节/SHA`d769b45ce34973f379885216104b1a6cc2b26f8a6cf199e7b65c32aef1b98928`、MSI61073142字节/SHA`88a51c942f63387e327e61354b594c7b907d4c028534253b21bf336bdd3d2a18`及manifest SHA`931e9ba824ec0e6c21c930946990dded8b5c102da0a59f82c1726f078bd072fd`相符；四发布组件2.6.25.0及哈希匹配交付说明。固定契约1.31.0，内部未签名/latestEligible=false。Native核对旧40发行文件及latest哈希未变；当前仍安装2.6.24，不冒称新回执已生效。唯一安装器位于`D:\Codex\TimeWhereNative\artifacts\release\windows\x64\2.6.25\TimeOnChrome-AppRuntime-Setup-win-x64-2.6.25.exe`，按PO既有手动安装选择交付，不自动启动。

最终联调剩余五项集中验收：固定孩子/截止范围逐来源核对日周余额；真实时段/硬配额/借用与单轮提醒；正式Service投递→可见ACK→继续/主动取消/超时授权→终态ACK；断线/重连/重启旧租约撤销及无重复；原始网页账与统计自然结算守恒。控件报告无未提交产品代码，fe585e0仅测试，三个既有文档草稿保留；目前真实身份/贡献ACK通过不证明余额/执行。Cloudflare现场读取因内置浏览器保存的网站权限阻止访问，未绕过、未改权限；云端现场与共享执行保持未验收/关闭，不影响本地候选交付。Mac、历史未知桶及P1仍单列。

正式Agent消息路径补测`050cfe6c50acd367bfa22d938e4bf59a32816fe1`，产品源码仍`12b8c6b`；架构独立回读TRX 3/3及SHA`a936e637968cc1456b89106e82e0edfc303cba74f1f1f5998c687a42120c4e24`一致。实际调用已编译Agent的ReadReceiptsAsync/WriteAsync和Presenter，不运行Main、不显示或关闭真实应用；Service ACK为受控对端，不能称Coordinator整链通过。架构不选择为测试注入/提取Coordinator生产编排，余下认证、正式派发/接收、取消ACK及重连撤销留作一次最终实机验收。源码阶段已收口，进入既有D-114最终候选交付：Native在现有main集中准备内部2.6.25，旧版本不覆盖，只必要构建/安装器检查；不自动安装、云端发布、R2或执行启用。该阶段更新覆盖下条此前“不构建候选”的源码阶段限制。

Native终态回传修复源码已完成：`12b8c6bb9c18647dbadeb6c85a07f455d2504d90`，本机工作区干净、未推送。架构核对10文件差异及5份最终TRX哈希，15项恢复用例有最终通过证据，另有真实WPF取消→持久化→生产Sender→随机管道→Service事务→ACK清队列1项通过；中间失败保留，不称单轮全绿。仅内部可选能力/回执及有界待发，公共Contracts 1.31.0、原账、统计、配额和执行开关不变。源码审计Matched；正式Coordinator/Agent消息编排、安装认证与家庭整链仍待验证，已交Native继续最小路径核对。已安装2.6.24不含本次修复；不构建中间候选、不安装部署、不启用共享执行。

跨端验收续进（2026-10-04）：网页取消加载故障已确认是隔离Profile开发扩展禁用；经获准一次性隔离Profile和匹配Playwright Chromium147，定向取消真实通过。控件集中测试提交`fe585e0`，仅夹具/任务条目、未推送；原文档草稿保留。架构回读取消JSON并重算SHA`6af8cfa18a19ead628965d6e9c1690207bbbaa38b7c6459323eb7688ca5a19b5`：页面存活、session ACTIVE、分段0、日/小时0、其他页面保留。旧normal/force证据SHA`b15f3af4601cf6244289680d089f65534c3ee8ca35eeffab3e9f85ac9e007b99`，四产品源码hash全匹配当前；两关闭各一条2秒自然结算，原始=日=小时，无重跑。此前“网页取消NOT_VERIFIED”被本项更新，但Native真实授权与Service60秒整链不由夹具关闭。

Native随机CurrentUserOnly双向Named Pipe测试提交`b73175c`：正常取消、visible ACK写前失败、取消结果写前失败三项最终定向通过；生产源码/协议/已安装服务未变。架构回读TRX与SHA一致：中间轮次`3ec4a3f50975dbfbf5ca4155e1e4bd39a1aca5663de8358881ea8e4dc6d70380`两负例通过/正常宿主读写顺序失败，修正后正常1/1`ca26a2141921bf0bd41aef3774e586e680ca228f00e687d8302b4ba3dfe7ec00`，旧失败保留。ACK失败不生成effect；取消结果丢失时持久effect留dispatched/result NULL，不重复Claim、不升级强制、目标存活。该恢复/诊断缺口已隔离复现，尚未修复；结果补发不能重新执行关闭。正式Service/Agent管道编排、身份认证/WTS与部分写入/收到后崩溃仍未覆盖。整体目标保持未完成，共享执行关闭，不以三项测试绿证明所有恢复行为通过。

提醒组件闭环补验（2026-10-04 00:08）：Native新增生产PolicyCache/ExecutionReader/QuotaBridge/Scheduler/ReminderBridge/授权/LifecycleStore/Presenter/Closer集成，自有WPF窗口真实取消，临时存储与受控HTTP，offer→visible ACK→end_rest→当前授权→Claim→cancelled→完成1/1通过；目标存活，重复resolve/timeout/领取不重复执行或升级强制。测试提交`ff244a7`（前一夹具提交`27e8943`），生产源码不变、未推送/构建候选/安装部署。架构独立回读TRX Passed及SHA`42787b0f8f211583d39fac94ea43e1525348db03b988b309239f65e5ba6a5b9a`一致。正式Service编排/Agent主循环/Named Pipe/WTS及真人输入仍未覆盖，不冒称真机共享执行已可启用。

网页关闭隔离验收暂留：旧Worker入口不匹配已证实；新增夹具版本/就绪/重载后两轮仍未进入关闭，当前取消NOT_VERIFIED，不认定产品失败。保留未提交测试修订与失败现场，不提交失败夹具、不追加产品绕过或重复安装。Content桥真实DOM补验及已有接线专项通过可保留。当前可关闭Native前台/正常取消组件缺项，正式跨端调度/网页关闭闭环仍待下一次集中验收；共享执行继续关闭。

提醒批次续验（2026-10-04记录，测试发生于10/3 23:57–23:58）：Native真实WPF自有窗口前台/visible ACK通过；取消先失败于测试子进程MainModule启动竞态，仅修夹具后真实取消返回SHARED_CLOSE_CANCELLED、目标存活、后续不升级强制。架构回读TRX逐项结果并重算SHA：前台1通过/取消夹具1失败`99537e107ae174f6db9dca58f0c18b976ba719b0f0c30cfa78e9c4d0e7c710f0`，修复后取消1/1`812a8d1b806731e2bdc650d3d37bf664b3aadb626f47333b104624ce81f50e05`。旧失败保留，未重跑已通过60秒；真实自有WPF窗口及生产Presenter/Closer通过，不冒称正式Service调度或真人键鼠闭环。

控件6项接线/余额/Content/生命周期/执行/关闭专项通过；旧Content桥真实证据因8b2ad14接线变化失效，已复用隔离Profile补验当前桥DOM可见ACK/滑动/重试/Escape/迟到围栏及窄屏，产品桥哈希`643f5526d45ea09165797bfa340d4d5f38b295abe4445ffce00933b9dfa26779`。此为真实DOM＋模拟Native，不等于Service整链。主动关闭宿主两次testDefaultOff未定义，已停止原样重试，交所属任务只修已定位测试入口再单跑；真实网页可取消关闭与Service授权闭环仍待验。未改产品/原候选/家庭配置/原账、未启用执行。

下一批执行清单（PO“继续吧”）：①Native核对前次隔离前台捕获失败及既有实现，只验证自有提醒/应用窗口；②控件核对共享访问检查、visible ACK、60秒、主动正常结束可取消、超时end强制及未送达门；③架构对照两端调用链与真实证据集中审计。变更等级为提醒执行聚焦验收；仅直接相关缺项测试，复用已通过源码证据，不重跑无关全平台或已通过60秒流程。不得启用真实家庭限制/结束真实应用/改原账计时；涉及网页记账行为先单项批准。本批源码、隔离验收和实机覆盖分别记录，不以mock代替真实前台/取消。

真实控件摘要验收（PO提供，北京时间2026-10-03 23:54）：运行1.7.42、当前连接connected、协议v3，已协商可复用孩子身份核验；当前连接同孩子identity已确认。9/28至10/3六个日期均显示当前贡献接收已确认，当前连接Native ACK分别23:53:55、:56、:57、:58、:58及23:54:03；10/3修订380、网页1944000ms，云端ACK23:54:06，当前来源与配置已核实。23:53:44曾拒绝WEB_SOURCE_PROOF_EXPIRED，随后实际接收恢复；摘要只能证明恢复，不单独证明具体续签内部步骤。本次核心同孩子核验→贡献→当前ACK链路PASS_WITH_MANUAL_EVIDENCE，不等于全部安全/重连场景实机验收或共享执行启用。9/30及10/1各360000ms历史未知桶仍不完整、单列延后；共享执行保持影子核对，强制提醒/正常关闭取消及Mac验收不由本项关闭。用户提供的摘要不含proof或凭据，未保存私密身份。

实机安装续验（北京时间2026-10-03 23:49）：PO确认安装与原目录重载；架构及Native只读核验四组件均2.6.24.0，安装文件哈希与候选逐项一致，Service为Running/Automatic，安装目录Session Agent仅一实例。公开健康管道可读且有本次启动后的桥接活动，但不提供当前孩子证明及逐项贡献ACK；控件当前后台1.7.42、V2身份确认、当前贡献date/revision/hash仍待实际证据，不能以候选文件版本或历史成功代替。继续现有受支持只读诊断；不清缓存、不改ACL、不重启服务、不启用共享限制。

最终候选交付：Windows2.6.24来自Native `6f8aef1`／固定Contracts1.31.0，四正式组件均2.6.24.0；MSI/Burn零警告错误，安装器结构3项通过，复用37项协议测试。架构独立复算Burn119764907bytes／`9324233f8b9afd973b3f87fe80b28312bcb2cbbca491f513778f68acdffb5ee9`、MSI61056758bytes／`91788a70b0a5a6d6ad71eea05e75d70ae954797d53bb9d15dae73f37b53cf92b`、manifest／`6514c8f71d0540e97ec9280e1b8181a9362660e9a816a9ba45ca7759676f686b`与清单一致。内部未签名、BLOCKED_BY_AUTHENTICODE_SIGNING、latestEligible=false；37项旧发布文件及本地latest未变。控件1.7.42 Native Host Development Candidate已更新原junction目标，179候选文件核对通过、原运行缓存1项保留；候选摘要`304084f9fea052081ae7f65b82cc8d52995d416e0f181dfe5d698eaf75274aa0`。架构回读原路径版本及binding/client文件哈希与受测源码一致；ID／模式／绑定不变，没有自动重载。当前Native安装仍2.6.23，真实联合核验待PO安装及原扩展重载后进行，不以发布／候选证据关闭身份或ACK问题。

兼容发布结果：Production `37133833997`在精确主线`56ae43e`成功，仅两个Worker；Runtime版本`06bfc29b-9af4-4bb5-b8ed-2a01378d66d0`，Guardian版本`8dc07256-d570-4756-8a2d-43d509e20929`。manifest无Runtime/Guardian migration，shadow preparation=false；独立health200、Runtime scope/Guardian binding-v2未认证401。Cloudflare Pages未发布，R2 latest2.3.1不变。Windows2.6.24及扩展1.7.42候选进行中，未安装／重载／联调。仅部署烟测PASS，孩子核验及当前贡献ACK仍NOT_VERIFIED。

上线／候选阶段授权（PO最新“进行吧”）：PR #221已合入master `56ae43ec62e22fa21a725f858b0ef98372daae9d`；精确主线App Runtime `37133559149`及Guardian集成`37133559157`成功。只部署Guardian Worker与Runtime Worker；Runtime/Main Pages、bootstrap、prepare_shadow和migration均为false，expected migrations为空。不修改密钥、共享执行开关或R2/latest。Native与控件所属会话准备唯一新候选，原扩展目录不变，安装由PO手动执行；真实联调尚未完成。此授权覆盖下方先前“源码阶段不部署”的阶段限制，不扩展到共享执行或其他遗留问题。

集中集成续验：已推送现有云端分支并创建PR #221；`5c55b68`合入控件来源`d9bb02e`，仅任务板冲突保留双方证据，控件实现与原提交逐文件一致。首次CI职责声明错误已改为architecture-integration及两个精确merge来源，未放宽检查。第二次CI职责／Guardian／Console通过，Contracts旧机器控制向量仍为1.30.0，却断言等于新增1.31.0包而失败。仅修正测试：固定旧向量为上一兼容版，当前包版本仍由独立兼容测试核验；不改向量、协议或包正文／哈希。此项待聚焦复验及CI，不声明已合入或上线。

职责 architecture-integration：维护契约；standard-cloud 实施 Guardian/Runtime；extension-local 与 native-local 各自适配。不新建分支/工作树。先发布源码与证据，不安装、部署、migration、R2或启用共享限制。已有未提交安装状态记录保留。

实施核对：新增可跨连接复用的五分钟签名来源证明；当前本机用户唯一孩子分配与扩展可信身份相同才建立连接上下文；断开/改绑撤销上下文，未过期证明可重新核验，旧租约不能复活。能力协商保留v1，v2失败不降级为弱核验。贡献版本替换/ACK不变，明确连接、身份、贡献三个状态。

最小验证：Contracts签名/篡改/到期/范围与v1兼容；云端双方鉴权、当前分配及绑定撤销；两端重连缓存、用户隔离及稳定错误。仅相关测试、typecheck、Worker dry-run、职责检查及diff；不跑无关平台/安装器/网页账本全量。真实联合验收另记，不能用源码通过宣称共享可启用。

契约开发证据：1.31.0 build/typecheck、shared-web-sync v1/v2聚焦及contract-compatibility通过；首次build因沙箱EPERM未写产物，经范围内提权构建通过；兼容测试首次缺新增消息断言已修正后通过。固定本地包SHA-256 `355c558784807b43e2e02f0b12c8ab221ecf9ffa38330f8ae48c644507c55395`，包含v2 schema与仅公钥黄金向量，已交Native/控件所属会话。契约提交`2d054c7`，云端提交`41e455d`，两者均仅本地源码提交；两端适配及跨端源码审查已完成，提交与聚焦证据见下。不代表已发布、安装或真实连接通过。

标准云端开发证据（2026-10-03）：已实现机器鉴权的`POST /v2/machines/shared-web-source/scope`、受限内部scope签发／实时分配核验及设备鉴权的`POST /device/shared-web-source-binding/v2`。成功响应均直接返回契约v2签名wrapper，无nonce、challenge或额外身份字段；既有公钥接口与v1保留。机器scope与网页proof的audience严格隔离；当前分配和浏览器token epoch持续复核，最后一次异步分配查询后再次按精确设备ID检查epoch。当前候选限定账户／孩子，最多200项，201项明确`SOURCE_SCOPE_LIMIT`拒绝，不截断后猜测；v2不写challenge表。真实内存SQLite双端签名／重用／到期／篡改／转派／解绑／令牌轮换／末尾竞态／候选上限及既有贡献记录不变通过；首次旧v1夹具固定时间与HTTP真实时钟不一致已仅统一测试时钟后通过。实际Device路由鉴权、caller范围拒绝、稳定错误与no-store通过；Backend Workers/Vitest `application-accounts.test.ts -t "shared web source"`为2项通过、22项无关跳过。根与Backend typecheck、两个Worker dry-run及diff检查通过；不运行平台／安装器／网页账本全量测试。审计：本轮云端范围Matched，未批准Deviated/Extra无；真实两端联合连接／重连及生产部署仍未验收，不表示共享执行可启用。未部署、未迁移、未修改原账／配额或线上开关。

两端协议审查：V2未分配为`SHARED_ACCESS_ASSIGNMENT_UNAVAILABLE`，连接／凭据／策略代次失效为`WEB_SOURCE_CONTEXT_CHANGED`，未绑定为`WEB_SOURCE_PROOF_REQUIRED`，过期或未来证明为`WEB_SOURCE_PROOF_EXPIRED`，范围不符为`WEB_SOURCE_SCOPE_MISMATCH`，验签失败为`WEB_SOURCE_PROOF_SIGNATURE_INVALID`，云端／请求超时不可用为`WEB_SOURCE_BINDING_UNAVAILABLE`。拒绝只确认业务失败，不等同于通道断开；ACK必须匹配实际接收的日期、修订及摘要。两端已修正日期循环、ACK拒绝处理与诊断白名单的错误泛化，首次租约验证时间及完整策略身份校验通过。Native的共享锁等待使用请求超时与连接生命周期联合取消，未获取锁不错误释放；实际dispatcher隔离用例证明断开后在途替换被拒绝。工具审批阻塞已终止，通过重新交接恢复控件源码任务；没有要求PO重载或手工读取Service Worker。

两端本地交付：控件提交`d9bb02e3412713c3416ad21f188533f732d8ff33`，Windows Native提交`6f8aef1141bfd49eeb99b8aacf772b3d2c33a4f2`。控件四专项（`shared-web-reusable-binding`、`shared-web-contribution-sync`、`shared-sync-diagnostics`、`local-guardian`）及typecheck、extension-root检查通过；状态文案补验通过，明确区分通道、孩子身份确认和当前贡献接收。Native `SharedWebSyncV2Tests|SharedWebSyncTests` 37项通过，Service构建及职责／固定包检查通过；初始夹具问题和提交权限阻塞已修正，不伪报首轮全通过。架构回读最终源码、测试命令与提交，核对Native当前1.31.0／上一版1.30.0包哈希和控件1.31.0协议代码哈希一致；没有两端自行定义的新协议。Native工作区干净，控件仅保留原有任务板草稿，云端仅保留未跟踪本地契约包及原`.wrangler/`。

后续启用交接（本轮不执行）：先集成并发布这批兼容Guardian Worker与Runtime Worker，复用现有Service Binding和专用签名密钥，无新migration或凭据配置；无需发布Pages。再将对应源码一次纳入Windows最终候选与原目录unpacked候选，记录新版本／SHA及哈希，不能拿已安装旧候选作为V2证据。之后核对同孩子成功、不同孩子／用户拒绝、有效证明跨连接复用、过期与改绑撤销、实际贡献ACK及原账守恒；覆盖不足时不启用共享限制。Mac保持旧能力兼容，其V2适配／编译／实机仍单列后续，不以Windows测试冒称通过。

本轮审计：契约、兼容云端、控件与Windows Native源码和上述聚焦验证为Matched；未批准Deviated/Extra无。生产部署、候选更新、真实联合连接与共享执行不在本轮执行范围，均未完成且不能称“线上问题已解决”；原始账本、统计、配额、安装环境、R2和执行开关未改变。强制提醒／取消、历史未知桶及P1统计故障仍按原独立任务保留。
## 控件关闭补验来源记录（fe585e0；过程状态以最新收口条目为准）
2026-10-04 共享页面关闭隔离补验：前两次 `testDefaultOff` 未定义已确认是保留测试 Profile 的旧 Service Worker 缓存入口（实际仅有 testStart/testClose/testSnapshot），非产品导出缺失；磁盘入口及75模块静态链接正常。PO/架构已授权只修安全夹具：复用原隔离 Profile、明确夹具版本、入口就绪及源码身份核对，只定向验证主动关闭可取消；不修改产品/原账/正式候选/家庭配置，不重跑已通过Content DOM或60秒，不将模拟授权标记为真实Service验收。

本轮定向复验仍未通过：修订夹具版本0.0.2并核对 closer 哈希后，第一轮就绪校验10秒返回空，未执行关闭；第二轮增加仅测试扩展 `runtime.reload()` 刷新，等待新测试 Worker 15秒超时，仍未执行关闭。旧缓存入口已取证，但不能断言它是当前无法重新启动的唯一根因；新模块在扩展测试页可求值、75模块静态链接通过，仅证明无静态导出缺失，不代替SW成功初始化。两次原失败及两次修订后失败保留，按失败上限停止，不新建Profile、不重复原命令、不提交失败夹具。真实主动取消和Service授权仍待验收；当前Content真实DOM模拟桥证据与IndexedDB匹配证据保持独立通过，不扩大为真实关闭通过。

后续只读定位：旧隔离Profile的开发扩展disable_reasons=16777216（Chromium DISABLE_UNSUPPORTED_DEVELOPER_EXTENSION），不是已证明的产品Worker错误。架构重新授权先核对现有测试可执行文件；不用用户Chrome，不编辑Profile Preferences或隐藏状态。若旧隔离环境无法合法复用，允许仅本次取消专项使用一个一次性隔离Profile；旧环境、失败现场与家庭数据原样保留，不跑整组、不发候选、不改产品或记账语义。

2026-10-04 定向取消补验通过：使用当前Playwright正规 `channel: chromium`（包匹配Chromium147.0.7727.15）及明确授权的一次性隔离Profile，只运行 `TOC_CLOSE_CASE=cancel`。夹具版本/当前closer源码哈希/入口初始化先通过；真实debugger Page.close触发beforeunload，取消后outcome=canceled、页面仍打开、session仍ACTIVE、没有新增原始分段或日/小时统计，其他页面保留。共享执行默认关闭，Native授权和idle边界为夹具，不是实际Service或真实计时精度验收；未跑正常/强制关闭、60秒、Content整组或家庭执行。隔离证据 `close-ledger-cancel-current.json` 保留在该次临时宿主，旧失败现场未改。Matched=仅夹具和取消补验；Missing=实际Service授权闭环；本轮未提交、未构建候选、未部署。旧宿主仍NOT_VERIFIED，不用新宿主通过结论覆盖其失败记录。

本轮集中交付核验：取消证据文件SHA256为6af8cfa18a19ead628965d6e9c1690207bbbaa38b7c6459323eb7688ca5a19b5。既有正常/强制关闭隔离证据文件SHA256为b15f3af4601cf6244289680d089f65534c3ee8ca35eeffab3e9f85ac9e007b99；关闭器、signal、timing-dispatcher、session四产品文件逐项匹配当前源码，因此复用、不补跑。normal/force均只自然结算一条2秒分段，原始=日=小时2秒，其他页面保留；该证据仍是夹具授权，不代替Service单调60秒和实际授权验收。仅提交本轮测试夹具及本组任务记录，不混入其他任务板或DESIGN/CHANGELOG草稿，不推送、不发PR、不发布。

2026-10-02 D-114 云端配置核对：孩子级公共时间配置的现存权威仍是 Guardian `profiles.config` 中的 `timeQuota`、`timeWindows`、`restConfig` 和 `autonomyConfig`；`GET /profiles/:id/shared-access/v1` 与 Runtime Service Binding 是其版本化只读投影，不是第二份可写配置。电脑应用来源读取现已按该版本生成只读共享影子，`legacy/shadow` 状态不授予执行。进一步核对发现 Runtime 管理页仍编辑/写入独立分类配额与时间段，Runtime D1 app policy 也继续把这些公共字段保存并供旧 Service 使用；应用级单项限制属于独立对象配置，应保留。不得只隐藏编辑器或停止写入而让设备继续执行过期公共策略。下一云端步骤：Worker 将 Guardian 公共配置版本化投影到兼容 app-policy 响应；app-policy 写入只更新分类/应用级限制，并拒绝或忽略客户端公共字段更新；Runtime 页面公共配额/时间段改为只读提示并链接主控制台唯一配置入口。与 Native 的实际消费及旧路径退出必须分闸验收，在完成前不宣称统一配额已启用。使用现有 `expectedVersion`、配置历史和审计事务，不新建重复公共配置；不改原账、计时、现行配额执行或共享执行开关。变更等级：Runtime Worker/API + Runtime Console 行为；聚焦测试覆盖版本投影、旧客户端写入隔离、应用级配置保留、Guardian 不可用失败状态及 UI 不再提供第二写入口。

## NOW：D-114 统一访问管理、其他时间与电脑使用汇总（2026-10-02）

2026-10-03 已批准1.7.42开发候选交付完成：git fetch确认master56ae43ec62e22fa21a725f858b0ef98372daae9d，固定工作树extension及打包工具与其无差异，复用d9bb02e源码聚焦证据；开发激活5/5及managed/development/regular打包边界通过。隔离生成179文件后按公开key核对稳定ID、native-host-development及既有marker，contracts1.31包哈希和两份生成模块精确一致；原目标先备份1.7.41，再复制候选文件且manifest最后更新，旧junction和D盘目标不变，既有Chrome生成缓存仅保留不打包。复制后179文件逐项SHA256匹配，排序文件清单摘要304084f9fea052081ae7f65b82cc8d52995d416e0f181dfe5d698eaf75274aa0；本地生成证据output/release/d114-candidate-1.7.42-verification.json。正式源码manifest仍1.7.34，不产CRX/update.xml、不重载Chrome、不触碰storage/绑定/家庭开关，不推送部署。候选交付Matched，真实重新加载及云端/Service联合身份、贡献、余额和提醒仍未执行，不能记为实机通过。

安装状态更新（2026-10-03）：PO已手动安装2.6.23。架构从正式安装目录只读核对Service／Session Agent／Manager／Native Host均为2.6.23.0，四SHA-256与已校验候选完全一致；Service为Running／Automatic，当前会话仅一个正式Session Agent。Native普通账户21:07公开健康核验通过，架构回读原证据：本次Service北京时间21:03:53启动，21:04:16有成功云端heartbeat，state=online。历史桥成功早于本次启动，public pendingUploads不含app/shared，均不作为本次共享同步证明。此前“当前安装仍2.6.22”仅为构建结束时历史状态。本次不读取凭据／原账、不提权、不重启、不恢复已挂起绑定／ACK排查、不启用共享限制。组件安装及公开健康通过不等于提醒、正常关闭取消、共享余额及原账守恒验收通过。

### 阻塞登记与非阻塞交付（2026-10-03，PO要求继续）

| 待办 | 所属工作线 | 当前状态／影响 | 恢复条件 |
|---|---|---|---|
| 来源签名绑定、当前网页贡献Native ACK | 架构／云端／两端 | 已由PO批准“共享连接身份核验简化”重新开启源码修复；旧安装状态未核实，仍阻挡真实共享余额及执行启用 | 完成可复用v2适配后，单列所需部署／候选更新及当前连接／分配下的有效绑定和逐来源确认；不得沿用历史ACK关闭此项 |
| 强制提醒取得活动状态、正常关闭取消 | Native | 交互桌面验收受限；不得改安全门、重复第三次取消实验或借用用户进程 | 可安全操作的受控交互环境，验证真实显示／正常取消，无强制升级 |
| 原账守恒及完整离线／重连联合验收 | 两端／架构 | NOT_VERIFIED；缺有效固定范围基线及真实联合通道证据 | 使用批准的固定范围采样和真实两端链路，逐项对照，不以夹具替代 |

可继续项：Native从已收口main源码集中准备一个内部Windows待验候选，核对版本、固定契约、组件、Burn/MSI/manifest及哈希；已有受测代码证据复用，仅运行候选必须的编译／安装器结构检查，不重跑取消或60秒流程。不安装、不上传R2、不部署、不切latest、不启用执行；不覆盖旧产物。包必须明确标记内部未签名及尚未完成实机验收。控件保持既有原加载路径／1.7.41，不为此重建或重载。

候选准备已完成（2026-10-03）：Native源码`4aed70fa0fd5551c7e4b9bf74e75d645ec0feade`包含`d9fa0ba`提醒补丁；唯一新增待验版本2.6.23，目录`D:\Codex\TimeWhereNative\artifacts\release\windows\x64\2.6.23`。构建及隔离package-probe通过，WiX零警告／错误，安装器结构5/5通过；发布六组件及MSI内四正式组件版本一致为2.6.23.0。架构独立复算Burn 119748555字节／`96d8a2105203ac39b194bd5790a4d41537bea9c496b49ed93892c58997e6cf00`、MSI 61044470字节／`b897962640cc17b82ee1a68f9b14d820b3fcb5e8062dea3f56cb7c4847c5a0fd`、manifest／`44b74c890bfad0e403d26c62aecc11a3e506391bf6e387e548eed9ab9225928b`，均一致；契约1.30.0固定包哈希一致。旧34文件逐项大小／哈希未变，本地latest未变。包未签名、BLOCKED_BY_AUTHENTICODE_SIGNING、latestEligible=false；只完成待验产物，当前安装仍2.6.22，不声明提醒或共享实机通过，无安装／部署／R2操作。

提醒补丁实证更新（2026-10-03）：架构任务独立解析Native的`reminder-closure-focused.trx`为94/94通过、0失败／跳过；`isolated-reminder-ui-after-fix.trx`为6项5通过／1失败，五项包括真实可见ACK、按钮ACK前禁用、ACK失败不可操作且不启动时钟、resolve发送失败恢复及真实60秒后超时意图。取消场景第二次仍失败于自有窗口前台捕获，未进入关闭；保留两份失败记录、不降低门、不第三次重跑整套。新增过期ACK／撤销／Dispose守卫最终定向验证1/1通过，TRX哈希`f6bde4c516c7fd5d28accc8349766c8d12cc7e6bc199b30e3eb92e6ee80d3372`；最终编译通过。早轮final-focused仍含守卫及强制显示失败，不能冒称整组全绿；强制显示未取得活动窗口、正常关闭取消未取得前台，继续保留实际验收缺项。Native主体`d9fa0ba`和证据说明`4aed70f`已集中提交，工作区干净；尚未安装新补丁，不追加中间候选。原共享绑定／ACK挂起及家庭执行关闭不变。

提醒实窗续验与缺项修正（2026-10-03）：Native隔离宿主首轮3项2通过／1失败：真实ContentRendered可见ACK与继续、真实单调60秒后Lifecycle超时意图通过；取消场景失败于测试自有窗口未取得前台，未进入关闭／取消，不认定产品取消失败、不移除安全门。新增已证实UI缺项：按钮缺少ACK发送前门，发送失败无恢复；由Native修正禁用／明确未送达及resolve发送失败恢复，不改Service计时。实际写入SemaphoreSlim串行，不将异步一概解释为ACK乱序。

既批准强制提醒兜底的本机边界：最终采用Native内部`ForcePresentation=false`与持久`DeliveryFaultReported=false`尾部可选字段，旧JSON缺省保持普通送达；共享State、BrowserBridge契约1.30及网页实现不变。首次普通送达＋一次普通重试均失败后，end配置允许一次强制显示；browser两次失败转Native的retry2就是唯一强制显示，不再追加循环。仅尝试激活自有提醒窗口以满足已批准前台打断，遵守Windows焦点及Default交互桌面权限，不解除锁屏／伪造输入／结束用户程序。系统拒绝或最终不可见时保留delivery_failed并通过既有日志一次报告SHARED_REMINDER_NOT_DELIVERED；无visible ACK不开始60秒、不生成结束effect。新delivery/reminder实例保持round，不改变取消与强制关闭授权。Native按最小相关回归及隔离宿主集中实现，不构建新安装候选或启用家庭执行。

整体续进实证（2026-10-03）：控件已实际运行现有`shared-browser-execution-persistence.js`，新建隔离Profile／Chromium149.0.7827.55的真实strict IndexedDB通过45次claim与ACK后原子回收、丢ACK保留、断线旧代次围栏、真实事务及删除中止、SW重建、浏览器重启和容量拒绝。架构任务回读`output/playwright/d114/execution-persistence.json`并重算两产品模块哈希，分别为`d50e8ba08bc173a5d7e5c52ddc072e34e5324724d5a05e07f2aa5b60d6cdcae7`／`e731b43061f7962c008440f986bdd48c7598860b60005934f896d1298aa2e4a1`，与当前源码一致。关闭“真实IndexedDB待验”；ACK由夹具注入，不关闭真实Native授权、页面关闭、隐身分区或原账守恒缺项。

云端实际源码复核：父端、DeviceBearer及Runtime内部调用共用`readSharedAccessPolicyForChild`，公共配置仍来自同一孩子`profiles.config`；六导航、三配置域、四统计视图均已接入主页面。共享摘要有独立12秒预算、孩子／配置／日期／可见页签／请求代次围栏，失败清除摘要并保留编辑入口；三域导入隔离及条件更新现有实现保留。摘要及域模块相对已测已发布SHA无变化，复用原证据，不重跑产品全量。此为源码核对，不替代真实登录导入／联合执行验收。

Native访问与提醒复核报告`main@ed9cf9179037a32bbc17f0ccbc60c96d46cf376c`已回读；相关八实现文件和生命周期测试与已有446项通过来源一致，受影响scope专项48项单列、不相加。真实提醒UI验收基础设施缺项已查明：正式Agent无隔离入口，测试未引用Presenter。已继续交所属任务补测试专用STA／WPF宿主、临时SQLite／自有窗口及真实单调时钟；禁止连接正式Service、改真实配置／原账或关闭用户应用。只补测试能力，不新增业务版本／候选，不绕过桌面工具限制。真实全屏打断和人与窗口交互仍须单独证据。

PO挂起裁决（2026-10-03）：来源签名绑定与当前网页贡献Native ACK两项暂停排查，登记为DEFERRED／安装后恢复未核实；不将未核实写成2.6.22仍失败，也不将旧桥接成功或云端ACK替代当前Native证明。19:29实时核验四组件2.6.22及哈希、Service自动运行、单一Agent、云端心跳通过。暂不为两项追加诊断包、安装、重载或重复确认。它们不阻挡其他开发，但仍阻挡共享执行启用及完整实机通过声明。

后续推进范围：先集中核对唯一配置源、六导航／三配置域／四统计视图及非执行展示；两端所属任务核对已批准的访问检查、提醒可见ACK与60秒期限、正常结束可取消、超时强制和送达失败／重启去重的现有代码及聚焦证据。缺项按完整功能批次处理，不逐零件发布；仅使用隔离验证，不启用家庭共享限制，不改变原账或未批准统计语义。Mac实机、历史未知桶及P1统计故障继续单列。

安装后实时复核（2026-10-03，2.6.22）：PO确认安装后，架构任务两次读取正式安装目录，Manager／Service／Session Agent／Native Host均为2.6.22.0，四个SHA-256与已验真候选完全一致；Service为Running／Automatic，正式路径仅一个当前会话Session Agent。Native会话旧轮次的2.6.21回报已明确作废，已要求重新采样本次启动公开状态。安装及组件核验通过不等于来源签名绑定、当前Native贡献ACK、共享余额或提醒执行通过；这些仍待本次真实证据，全局共享执行保持关闭。未新增安装、重启、UAC、部署或配置变更。

Native独立复验（北京时间19:17:07）：普通账户公开状态确认运行Service为2.6.22.0，本次启动后已有成功云端heartbeat。公开桥接成功时间早于本次Service启动，仅属历史，不证明当前签名绑定／贡献ACK；公开状态没有这些字段，仍NOT_VERIFIED。hasPendingUploads=false仅覆盖旧usage／media／log，不解释为应用统计及共享队列已清空。证据为Native本地`.tmp/d114-validation/postinstall-2.6.22/installed-and-public-health-20261003-191707.json`。安装运行前置条件已通过，不能据此宣称本次绑定故障已消除。

2026-10-03 18:18现场及整体推进裁决（覆盖下文旧的安装／重载待办）：PO提供正常管理页证据，扩展1.7.41已连接v3，应用读取及共享相关能力已协商；当日网页修订241、1169000ms已获实际云端ACK，当前来源已核实。来源签名绑定仍未建立，getSharedWebSourceChallenge收到negative_response且无具体服务码，当前Native ACK未确认；连接健康／云端ACK不能替代本机授权绑定。Native源码核对已确认挑战不依赖历史统计完整性，故不得把历史未知桶作为本次绑定拒绝原因。继续定位当前受保护分配、连接注册及云端挑战错误，不放宽授权。

非核心历史项DEFERRED：9/30、10/1分别360000ms在原统计中已属未知桶，调账前后相同、更正请求／应用／失败均0；不是总时长缺失，也不能据此断言网页原账错误。精确桶名与原生成原因未核实，禁止补入Rest或其他分类。按PO要求停止为此追加诊断包／重复重载；保留独立待办。原账指纹缺少有效安装前基线仍属验收缺项，不改写为通过。历史完整性仍影响现有整周执行准备，不为推进放宽门槛，但不阻挡配置／界面／提醒链路开发。

整体推进：复用已上线六导航／四统计视图及已接入的两端消费者；控件所属任务继续整批访问检查、提醒可见ACK／60秒、正常取消与超时强制、送达失败和离线／重启核对，只补实际缺项，不逐零件PR／候选。当前任务检查云端配置、来源替换及来源挑战调用；Native所属任务定位绑定并整批核对执行准备。限定本轮状态登记为文档变更，仅diff检查；后续代码按受影响模块聚焦回归。排除无关平台／安装器全量测试、新分支树、原账／原统计修改及提前启用共享限制。真实联合余额、提醒／结束、离线恢复仍Missing，完整D-114不标记完成。

整链核对进展：控件所属任务确认共享访问、单轮可见ACK、Service负责60秒、继续、正常取消、许可超时强制、送达失败与断线围栏已接入；本轮只补核shared-browser-execution-attempts固定回归通过，当前任务回读其持久登记／重启围栏测试及实际bootstrap，未发现新增终端源码缺项。真实IndexedDB／Host联合执行仍未验证，不把内存事务夹具称为实机通过。Native正在运行同版本策略／连接注册恢复及整批执行受控核对。来源绑定定位新增条件线索：当前控件将MESSAGE_REJECTED显示为service_message_rejected，而现场为negative_response；Native会透传部分WEB_/INVALID_WEB_的本地校验错误，但控件服务码白名单将其隐去。需核实原候选映射才能排除泛化HTTP路径，不能据此确定具体根因或重配密钥。

核心恢复受控回归：Native确认304不会换策略对象，但重复同配置200反序列化后创建新AppliedMachinePolicy，按引用验证的连接随之失效；已编写重复真实200及Challenge失败回归，修复验证进行中，尚未称现场根因。完整策略与本机解析结果都相同时才允许保留范围；任何权限、分配、Child、产品关联、策略内容／版本或解析变化必须撤销旧范围，不修改计时边界算法。当前任务已回读回归及调用位置，要求最终证据集中返回、先不构建中间包。控件原候选／源码哈希一致，negative_response证明收到匹配请求ID的负响应，不能进一步单凭文案确认具体服务码；后续binding_unavailable只是下游结果。

核心恢复测试回读：Native policy-scope-before-fix.trx为8项执行、7通过／1失败，policy-scope-after-fix.trx为13项执行、13通过／0失败／0跳过（18:33:56）；当前任务直接解析TRX并回读最终完整policy＋ApplicationResolutions结构比较，不只比较版本。新增回归使用真实200反序列化、Dispatcher／Bridge及受控连接注册，覆盖同策略保留、权限／分配／Child／能力／日志／解析变化撤销及启动无分配后新健康恢复；注册回调为夹具，不伪称真实Service场景通过。整批执行回归、最终提交与现场绑定仍未完成；当前运行2.6.21尚无此补丁，不交付重复中间候选。

Native整批源码已收口：`1382fd72998bb7a6675735f410007985c4546657`提交并推现有main，工作区干净；最终新增scope及SharedWebSync合计48/48（含最终15项新增，不能与旧13或既有446累计），TRX SHA256 `365c821922bf544dd89dd7849f7468705fbc14aa628e2c574e229b94e3f2ed4c`由当前任务回读核实。Service及测试依赖编译通过；生命周期／关闭器／提醒窗口未改，复用既有精确源码的可见ACK60秒、取消、超时强制、送达失败、重启及离线撤销Passed用例。产品diff仅Service范围选择helper和调用，不改RequiresAccountingBoundary、原账或关闭执行语义；文档／测试同提交。源码Matched，未批准Deviated/Extra为空；真实绑定、Native贡献ACK、余额与窗口／进程效果仍Missing。没有构建新候选、安装、重启、启用或云端部署；旧历史项仍延后。

必要集中候选交付：受测main `1382fd7`已生成唯一内部2.6.22，固定contracts1.30.0及既有包哈希；Burn/MSI零警告错误，安装结构5项通过，所属任务核验六构建／四安装组件及升级身份。当前任务独立计算Burn119711531bytes/SHA256 `39a6c479bebcfc50e47cfddd929b3181e6819b3ce549dec4c9d9727bf12fdac7`、MSI61044470bytes/SHA256 `8b7e27f45fa4bca6bcdb926f56e72eb660fb707d02dc21679401a7cacb6e90d1`均与manifest匹配；manifest SHA256 `5f3b93252bc735a34a7add7280201f5697eea1f5b1825fbf98221cb4eee901da`。路径为TimeWhereNative artifacts/release/windows/x64/2.6.22，BLOCKED_BY_AUTHENTICODE_SIGNING、latestEligible=false。旧产物及latest未变，当前机器仍2.6.21；按PO既有手动安装选择交付，不自动启动UAC／重启。本候选不是新增诊断功能，真实恢复仍待安装后证据；不把构建完成当D-114完成。

交付记录已由Native推送main `57d336d09054cb9326c530e5bebcb273dabb9725`，产品源码仍1382fd7；当前任务回读交付说明与本地manifest，复核旧包／latest十三文件基线。安装前独立只读仍显示Service／Host／Agent／Manager为2.6.21.0、Service Running／Automatic，没有2.6.22安装进程；不启动用户已选择手动执行的安装，不把记录完成当作已安装。剩余推进需新版本实际运行及合法现场证据，原工具对Chrome内部页／Cloudflare的限制不绕过，旧日不完整也不被自动清零；完整目标保持未完成。

安装后续验（最新）：2.6.21正式四组件版本/哈希匹配候选，Service Running/Automatic、一个正式Agent、公开健康online及本次启动后心跳通过；公开pendingUploads不含account/shared，旧376恢复与共享版本/ACK仍未验证。固定范围指纹原RunAs调用已返回USER_CANCELLED、无输出文件，不再称等待UAC，不重弹请求；没有有效安装前指纹，不宣称升级守恒。控件1220601已推送既有集成分支，任务板冲突保留双方记录后由0b470解决；精确head轻量CI37112871812通过，PR #220已合入master `221140ea30be21e42c8c55c6f5e36013733003a9`，产品四文件与1220601一致，不重复测试/部署。原1.7.41候选三个文件已同步，Chrome内部页工具不可操作，已请求一次原扩展重载，仍待现场确认；不要求SW脚本或重新绑定。两个360秒缺口、真实余额、提醒/结束/离线和原账守恒仍未完成，共享执行关闭。

2026-10-03集中续进：冻结截止点修复PR #219已合入master `1a5085ed06e3387a95ad1d8d201fb9f4aa2f35f3`，精确主线CI 37110999255通过；Production 37111118202成功，仅发布Runtime Worker，版本ID `6941f507-5950-4062-963c-fe4c9d47faea`，health及未认证401烟测通过，远端迁移列表无待执行项，本次没有执行migration，其他Worker/Pages/R2未操作。Native所属任务在现有main提交 `0eefb5e1c1ae5342de22b4732a988fd1917728c0`（包含5e24038），补齐旧superseded存量在当前受保护分配内仅GET恢复、冻结清单精确核验及公平补发，最终80项聚焦测试通过；当前任务回读实现及TRX结果，未修改Native源码。唯一2.6.21本地候选来源 `56e1dd086f45315c36d2d0747a0de88c541892b8`、固定contracts1.30.0已生成，Burn119737185bytes/SHA256 `3b6abf5284f2dfff8a33e12987019d008a5052c1c771904364f02e9ebcfb1a79`，MSI61044470bytes/SHA256 `835c68cce6b25435bce1c4cc0a38a8967230aca77209d8d16d147a4d8721765f`，当前任务重新计算均匹配manifest；内部未签名、latestEligible=false。当前安装仍2.6.20，不宣称真实旧376已恢复。控件只读调查排除Rest/Other漏读，两个360000ms缺口尚不能区分原未知桶与更正后未知归属；已交所属任务补同修订的脱敏调账后桶/更正流向诊断，不改算法、贡献或原账。旧日不完整不证明今日账不完整，但现行整周执行准备不能通过；今日上传及守恒只读验收仍可继续，不放宽门槛。剩余为候选安装/重载、现场逐来源收据/版本/余额核对、网页缺口定位、提醒/结束/离线与原账守恒实验；共享执行继续关闭。此条为发布、构建及所属任务证据，非完整D-114完成。
2026-10-03 D-114可复用来源核验终端源码收口：消费固定contracts1.31.0（源2d054c7，包SHA256355c558784807b43e2e02f0b12c8ab221ecf9ffa38330f8ae48c644507c55395），按明确V2能力接入签名scope、直接proof交换、本地重新绑定及无challenge贡献替换；有效proof仅内存缓存，过期重连不能复活，同连接租约须完整policyIdentity及有效期内首次验证。V2失败不降级；旧端V1兼容。稳定身份原因经Native拒绝/日期循环/正常诊断完整保留，业务拒绝不误断Port；改绑/策略变化及ContextChanged撤销绑定与当前Native确认。绑定固定签名/HTTP、贡献同步、Native客户端和诊断四专项通过，typecheck、扩展根检查及diff检查通过。Matched＝批准源码范围；无未批准Extra/Deviated。原账/贡献内容及云端ACK算法、候选、家庭配置和共享执行门禁未改。仅本地集中提交，未推送/部署；真实云端+Service联合绑定、缓存重连及共享余额/提醒验收未执行，不能用当前安装证明V2通过。

2026-10-03 D-114真实IndexedDB补验通过：旧证据的身份围栏哈希已过期，未复用；单独运行现有shared-browser-execution-persistence.js，在全新隔离Profile中加载仅含登记/围栏的测试扩展，Chromium149.0.7827.55真实strict IndexedDB完成45次claim/确认后原子回收、丢ACK登记保留、断线旧代次拒绝、真实事务及删除中止、Service Worker实际重建和同测试Profile浏览器重启防重、20条容量拒绝。两产品模块哈希与当前源码匹配，证据output/playwright/d114/execution-persistence.json；JSON中的retainedProfileReused指本轮重启复用同一新建测试Profile，并非用户Profile。执行效果关闭、无家庭凭据；ACK授权仍由夹具注入，真实Native授权、隐身分区、页面关闭与账本守恒不在此项覆盖范围。此前记录的“真实IndexedDB待验”由本项关闭，其他联合验收及DEFERRED条件不变；不改代码、候选、原账或生产。

2026-10-03 PO整体推进裁决：签名来源绑定及当前网页贡献Native ACK排查标记DEFERRED，不追加诊断包、重载或安装；其余D-114访问与提醒链继续核对。Content仅在可见且Service确认后启用按钮，60秒由Service计算，当前共享弹层不显示倒计时数字；主动结束不得升级为强制关闭，超时结束仅凭Service明确授权执行，目标逐次核对tab/window/URL及lease/activity。复用未变专项和隔离关闭证据，终端侧本轮未发现新增代码缺项；真实Native授权、送达至60秒闭环及真实IndexedDB重启仍待联合验收，不以挂起项或夹具通过宣称家庭执行可启用。

2026-10-03 D-114 整批执行准备核对：历史两日各360秒已由正常摘要确认是原统计非标准桶、无更正请求；按PO整体优先口径标记DEFERRED，不追加诊断、不猜Rest、不改原账。终端共享访问、可见ACK、Service单调60秒、继续、可取消主动结束、超时强制结束、送达失败及连接代次保护已有实现；相关未改代码复用既有专项与隔离关闭证据。本轮补核执行登记专项通过，覆盖45次ACK后回收、丢ACK、重启、断线及旧代次防重，属于事务夹具，不代表真实IndexedDB或Native验收。本轮未发现新代码缺项；真实联合验收仍须建立签名来源绑定并满足整周完整性，生产仍影子、共享执行关闭。不得将DEFERRED等同于放宽完整性门禁；不再要求用户重复重载或SW脚本，不更新候选、不启用家庭档案。

2026-10-03 只读诊断收口（已批准，源码验证通过）：在既有冻结统计与现有更正投影上，按同一最终贡献revision/hash记录调账前/后桶覆盖及固定枚举更正请求流向；成功/失败计数直接读取现有投影结果，不推断逐条成功流向。正常共享同步摘要展示聚合量与条数，不输出原桶名、身份、URL或分段ID。只改诊断生成、读取、视图及聚焦测试；不改更正算法、原账、贡献payload/ACK、同步协议或整周执行门禁。诊断/派生同步专项、typecheck、diff检查通过；1280px/390px隔离mock截图已目视确认无横向溢出，仅为UI证据。现有1.7.41候选仅同步诊断文件，不重载Chrome、不升版；真实桶差额、当前后台加载及Native联合验收仍未完成。Matched＝批准范围，Deviated/Extra＝无；旧日不完整继续阻断整周执行身份，不等于当前日账不完整。

本批云端源码收口：冻结截止点修复及固定回归完成，publication/accounts 48项、statistics/corrections 22项全部通过；Worker typecheck、Wrangler4.127.1 dry-run（仅本地打包）、Runtime源码边界及diff检查通过。新增回归涵盖截止点后新增不阻挡、截止点内迟到不放行、跨截止点不伪造部分结算、单调映射精确截止及旧空快照不遮住后来非零数据；原记录逐字段前后相同。按standard-cloud职责审计，源码Matched，未批准Deviated/Extra为空；生产新版本、两端联合余额/提醒/离线与原账实机核对仍Missing，共享执行继续关闭。不把本地回归当作生产问题已解决；无migration、安装、R2及其他资源修改。

Runtime D1人工只读续验（2026-10-03，PO提供结果）：当日两个脱敏应用scope均报告Windows Service2.6.20.0/sessionActive=1。来源1分配版本21：最新及已发布统计修订18、完整；共享收据修订3/完整，接收时间北京时间15:07:34（早于已核验的本次Service重启），核验仍为SHARED_QUOTA_SOURCE_VERSION_MISMATCH/sourceVerified=0，核验缓存对应当前收据及发布清单。来源2分配版本1：最新统计修订436/received，发布检查APPLICATION_ACCOUNT_FACTS_PENDING；已有完整发布修订376，但共享收据不存在。该结果证明安装后两scope尚未形成可用共享贡献；缺收据不能解释为零，完整应用统计不能替代共享贡献核验。已按持续授权交Native所属任务排查冻结发布版本、影子完整性、配置/能力、排队公平性及历史分配补发；当前云端同步审查逐字段版本比较，不放宽校验、不删scope或改分配。尚未取得拒绝的具体不匹配字段及本机队列断点，不能宣称根因已确认或2.6.20真实链路已修复。共享执行继续关闭；本条不含私密身份、SQL payload或凭据。

队列确定性断点续进：Native所属任务已在2.6.20源码确认完整清单received_not_published后，新head将旧publish_pending置为superseded；旧项因此退出后续status查询，云端随后异步发布也不能被本机观察。现有dirty/parity门还会阻塞对既有完整清单的查询；共享上传按账户耗尽总预算8也可能饿死后续账户。所属任务在原main修复独立旧清单只读核对及一项一轮公平调度，聚焦回归进行中；此为可复现源码机制，尚未以实机队列证明两个scope根因。当前任务回读云端status按已鉴权machine/account读取，published仅表示当前发布头；共享配置读取仅允许当前protected分配，历史分配不能借用当前配置绕过授权。原账及云端严格核验保持，未构建/安装新包、未部署。

云端冻结截止点修复：固定回归已复现较早不可变清单在同日新增事实后持续APPLICATION_ACCOUNT_FACTS_PENDING。核对器改为先使用既有单调时钟映射得到未裁剪区间，再为未结束日期按冻结settledThroughMs选择已结算事实，逐维度精确比较；截止点内迟到、缺失及错误统计仍拒绝。已结束日期保持原日边界及±2秒来源窗口规则。若整日来源包含截止点后事实，发布水位明确标识冻结子集，既有统计选择器不得将其冒充覆盖整日最新事实；旧统计/配额接口不变。职责standard-cloud，允许现有Worker发布核对/时钟只读适配、对应测试及文档；最小验证为publication/shared source聚焦测试、Worker typecheck、必要dry-run及diff。排除扩展/Native产品修改、原账/配额、平台构建、migration和新分支/工作树。源码修复与生产验收分开；本机制尚未被证实为实机来源2的具体断点。

只读验收阻塞更新（2026-10-03）：Cloudflare 已登录内置浏览器，界面及本地浏览器权限配置均明确允许 Dashboard 域名，但浏览器工具仍返回已保存禁止，生产 SQL 未执行；不绕过到其他 Profile、CDP 或凭据渠道。已核实 PO 指定的 Chrome Profile，可用于权限恢复后的后续操作，但不能据切换 Profile 绕过域名禁止。两端现有实现与测试不替代剩余来源核查、真实共享余额、提醒／结束、离线恢复及原账守恒；共享执行保持关闭。此前“等待 Cloudflare 登录”为旧现场描述，当前问题是工具权限冲突，不再要求重复登录授权。

后续执行链核对：控件所属任务在9964821回读整批接线8b2ad14及提醒来源253d6c3，实际访问检查、可见ACK后的提醒生命周期、许可区分正常/强制关闭与有效同连接租约下离线替换已有接入；访问runtime、生命周期/content bridge、执行器/closer/控制器、固定包贡献同步聚焦验证通过。一次固定包生命周期参数误用压缩包导致失败，随后本地生命周期通过，既有28向量证据不伪称本次重跑。未发现本批新增源码缺项，真实联合访问/60秒/单轮去重、离线恢复/更正仍待验证。没有候选更新、原账变更或生产执行启用。云端补充只读排查尝试正常Cloudflare Dashboard，当前浏览器要求登录，已交用户手工完成登录；不索取密码或Service Worker脚本。

2.6.20安装后真实续验（2026-10-03）：PO确认已手动安装。Native所属任务只读核实正式四组件2.6.20.0及哈希精确匹配候选，Service Running/Automatic，当前会话正式Agent一个；主家长设备页亦返回Service2.6.20.0、策略198/198已应用。真实访问管理摘要应用完整覆盖从安装前0/2变为1/2，网页仍1/2；当前诊断已无本次此前的应用版本不一致，但仍有SHARED_QUOTA_RECEIPT_MISSING及网页来源/本周完整性缺口，余额仍不可用，不能宣称全链通过。普通身份公开健康不含逐scope派生队列，固定窗口原账只读工具实际UNREADABLE/complete=false，不能证明守恒；本次Guardian D1只读命令实际7403权限拒绝，未继续重试或变更凭据。继续已登录正常家长页面及两端所属任务核对，不删scope、不改账户分配、不填差额、不启用共享限制。Native补发修复已实际安装；来源替换/余额、提醒/结束、离线恢复和原账守恒继续未完成。

2.6.20候选独立回读：本机TimeWhereNative artifacts/release/windows/x64/2.6.20/manifest.json记录source df0d3ff、contracts1.30.0/固定包哈希；当前任务重新计算Burn119699499bytes/SHA256 7fe4342d7a1978bcc8ea23b6855a2ee165cae38762718772ec2998848654431f、MSI61040374bytes/SHA256 bff5446f78026322981ba3decea2382e2d503620e8c9e5ce2c58274a5cb3ca58，大小和哈希全部匹配。所属任务核对组件版本、固定升级身份及WiX零警告错误；仍BLOCKED_BY_AUTHENTICODE_SIGNING、latestEligible=false。已向用户集中提出原地升级选项，尚未安装，不以候选状态宣称应用receipt/余额恢复；没有云端部署/R2操作。

Native源码收口复核：df0d3ffacef17649d710fedd8f09a1fea4088b88已推送TimeWhereNative现有main，当前任务直接回读application-publication-convergence-final.trx确认58/58、0失败/跳过，提交8文件与已审查排队修复一致；工作区当时干净。修复包含已发布冻结版本补发、幂等begin直接published立即收敛、乱序/迟到ACK及received不降级、调度通知异常隔离和有界唤醒。2.6.20唯一内部候选正在构建；运行2.6.19不含该修复，实机贡献/余额仍未验收。没有新建分支树、没有安装/重启/云端部署或R2操作。

集中交付续进：控件诊断整合PR #218的精确head dea3da6已通过App Runtime CI37105588237（changes职责检查及最终gate通过，无关产品job跳过），合入master d80e143840823e550ce5fdad8b360421d5709b9e；现有云端工作线已快进，未部署。Native发布收敛修复已完成，首轮46项及发布顺序4项TRX由当前任务直接核对全部通过，所属任务最终58项聚焦及Service/Manager编译通过，当前审查方向一致；最终对应TRX及提交仍待回读。下一交付只构建包含完整修复的一个2.6.20内部候选，不安装/重启、不上传R2，不以包生成替代真实覆盖。当前运行仍2.6.19，共享执行关闭；真实贡献替换/余额、提醒/结束、离线及原账守恒未完成。

来源覆盖与队列审查续验（2026-10-03）：真实主控制台设备详情显示目标Windows Service2.6.19、策略197/197、最近同步15:01:16，同一孩子有两个受保护账户且页面均报告会话活动；该配置提供预期应用scope数量依据，不能删scope或按无数据推断零用量。未确认missing/mismatch分别对应哪scope，不把在线/策略ACK视为贡献验收。Native队列修复已落到源码草稿：选择最高实际发布清单及冻结shadow、发布成功唤醒有界补发，仍校验当前关联/更正/策略与分配。当前任务已只读审查差异并要求乱序/迟到published ACK、撤销、版本替换、幂等及失败退避聚焦回归。所属任务仍在执行，未构建或安装新候选，实际恢复未验证；网页原账守恒及共享动作验收仍Missing。

派生同步收敛修复续进：控件诊断补丁99648215已推送并同步原1.7.41候选，shared-web-contribution-sync.js源码／候选SHA256均6abb715a7e066ccc68c6b57b5cb8d1fc977ff31422c70aba2c16b05ab73770e2；只更新覆盖摘要对应最终贡献版本，不改变内容、ACK、绑定或上传。当前云端线精确整合该3文件补丁及本批状态，复用同SHA聚焦证据，产品diff与来源一致、diff检查通过，审计Matched；无未批准Deviated/Extra，真实链路仍Missing。Native源码另发现应用清单已发布N但本地head持续前进可阻止N共享贡献补发的窗口；按原可靠同步范围修正为读取已发布最高版本及其冻结影子，成功发布后有界补发，云端严格匹配不放宽。要求新增持续前进、版本替换、改绑／策略变更和幂等回归；尚未证明该窗口就是实机两个scope的原因，源码／候选／真实验收分开记录。

真实主控制台只读验收续进（2026-10-03）：在现有已登录Chrome正常HTTPS家长页面选中原目标孩子，访问管理共享摘要实际返回profile-config:34影子阶段：当日网页完整覆盖1/2、应用0/2，共享已用／剩余均不可用，未显示假零。展开诊断包含SHARED_QUOTA_RECEIPT_MISSING、SHARED_QUOTA_SOURCE_VERSION_MISMATCH、WEB_DERIVED_CONTRIBUTION_MISSING及本周LOCAL_BUCKETS_INCOMPLETE。已核对云端预期来源来自当前绑定及当日事实/有效受保护分配，不直接删来源或把缺失当零；应用清单与贡献版本一致性继续交Native核验。此次仅正常页面只读，不访问被禁扩展内部页、不改配置。Native当前源码1.30.0共享读链三类63项通过，真实Service绑定／租约／本机接收仍未验证；不以该测试替代真实联调。

生产链路复核（2026-10-03）：Guardian D1 孩子范围只读核验已收到10/1修订1（1070000ms、不完整）、10/2修订1（22000ms、完整）及10/3修订154（618000ms、完整），此前“10/1-3无head”为旧现场状态。现存两条来源挑战均已完成云端绑定，最近创建／绑定北京时间14:50:00；这证明挑战及绑定签发链路实际推进，不替代Service当前租约、贡献接收ACK或共享余额验收。两次查询均rows_written=0、changed_db=false。Native公共状态14:50:35显示2.6.19在线且同次Service启动，公共无待上传不涵盖新版派生队列。9/30、10/1各360000ms差额仍未确认原因；控件任务另修复水位升版时桶覆盖诊断仍指向旧版本的缺口，聚焦验证通过，提交／原候选同步进行中。原账、分类、上传语义和共享执行开关未修改；整体目标仍未完成。

通信现场及修复更新（2026-10-03）：正式 Native 四组件已核验为 2.6.19.0，Service Running/Automatic；用户正常管理页确认运行扩展 1.7.41。14:25:42 健康成功后，14:25:43 的 dailyUsageSnapshot/statistics 收到业务拒绝，旧客户端将其映射为 native_invalid_response 并断开整个连接。所属控件任务已在原候选目录修复管理页 query/hash 身份误拒绝、脱敏拒绝原因、统计单帧故障隔离与至少60秒重试冷却；待同步修订保留，不假ACK。另以真实扩展生成器和已安装版本的实际Native校验DLL复现“不完整快照仍携带矛盾区间”兼容缺口，派生适配已清除矛盾证据，保留权威秒数和不完整原因，未放宽Native校验。聚焦回归、类型检查及三项DLL夹具通过；原目录四项变更文件与受测源码哈希一致。未提交补丁、未部署或重新安装；真实加载后的连接／贡献ACK仍待核实，不能把合成复现视为现场原因最终证明。

派生贡献未决项：9月30日 ACTIVE 906000ms／三桶546000ms，10月1日 ACTIVE1070000ms／三桶710000ms，均相差360000ms且标记LOCAL_BUCKETS_INCOMPLETE。只读定位现行权威统计与派生消费者的桶覆盖、历史更正和兼容读取，不补差、不改原账或原物化。已交控件所属任务继续；若证实原统计异常按P0登记并遵循记账线逐项批准。D-114完整目标仍包括真实贡献替换／余额、提醒／结束、离线恢复及原账守恒；共享执行保持关闭，安装和诊断显示均不代替验收。下文候选交付前的“未安装”等记录为历史阶段，不作为最新运行状态。

差额静态核对结果：Rest借用与显式other在现行派生读取中保留，不能归因为二者漏读。未知旧扣费桶或已批准更正移入未知桶的受控夹具可以复现相同差额和错误码；尚未取得现场原桶覆盖，不能据数字证明少记或归属。所属任务新增区分夹具及固定契约专项通过，没有修改原统计或派生映射。通信修复集中成一个故障主题提交，版本和运行验收仍分别记录。

通信修复源码已集中提交并推送 `acca513a012afea2f0bc4d61f019295a9fbab605`（既有 codex/integration-access-20261002），对应文档／测试同提交；原扩展1.7.41候选四文件与提交源码一致，既有TASK_BOARD草稿保留未纳入。尚未PR集成、未部署；待真实加载检查桥连接、来源绑定、逐日贡献ACK和余额，再继续提醒／执行验收，不把源码推送视为全部目标完成。

源码集成更新：通信修复与状态记录已集中经PR #217合入 `master@a090a86e692c37fa6d3e5c54e5c7cf227bf0e4d7`。精确PR head `6b41689` 的App Runtime CI运行37104110365：changes及app-runtime-gate通过，无关产品job跳过；本地11路径职责检查通过，已核验受测控件提交为直接集成父提交，集成后的产品代码与acca513一致。既有云端工作树已快进主线，未新增分支树、未部署或安装、未启用共享执行。上述“尚未PR集成”为集成前历史状态；真实加载后的通信、共享余额和原账守恒仍未验收。

集中候选核验（2026-10-03）：原81a1兼容junction仍指向D盘固定控件树，实际manifest已为1.7.41；控件源码26875cb，176文件候选聚合SHA-256 `c721c14205202dea7b5b446a3ac893a7a8698aa98d1b3698e42b5f5a29960da4`（所属任务校验），扩展ID保持不变。Native 2.6.19来源8fbf8e9、契约1.30.0，Burn/MSI一次构建0警告0错误；本任务回读manifest并重算产物哈希，Burn119721103bytes/`eb6f4e8b2400d44a40ddc78df5eda67bb11391d8e14c084b0ee224dac3339704`，MSI61036278bytes/`403655b276465a601fadf9c585dd51e917a410ac9a05f1cb09fd416524c45aa8`。安装目录为Native仓artifacts/release/windows/x64/2.6.19。仅本地内部未签名候选，不上传R2、不切latest、不重新部署；实际安装、Chrome重新加载及正常界面联合验收尚未完成，全局共享执行关闭。

正常界面诊断提交复核（2026-10-03）：控件提交 `26875cbd2ab5d4476cad05a042e7f1676d53a218`，Native提交 `8fbf8e941a8726226a0c62c55ab06512a0c48450`；当前源码已核对。控件摘要只读四项有界桥接缓存，不读取原账或日统计；Native管理员摘要仅读取派生队列元数据，保留用户/分配隔离、执行时间预算及未知状态。控件诊断聚焦回归复核通过；Native所属任务报告19项相关测试和Service/Manager编译通过，截图为离屏夹具，不是真机。两端在现有分支构建集中候选1.7.41/2.6.19，不覆盖历史包、不更换原扩展入口、不新增PR/工作树、不安装或启用限制。当前运行中的2.6.18没有新增诊断代码；候选完成、实际加载、真实贡献/余额/提醒/守恒仍须分别验收。下文旧“尚未提交”记录是历史阶段。

诊断收口审查（2026-10-03）：两端已有实际源码改动，尚未提交或交付候选。扩展新增仅自身管理页可调用的只读摘要，覆盖本周贡献、历史云端ACK和当前Native确认；Native新增有界事件快照及当前用户管理员摘要，区分已接收/待发布/已发布。审查已要求改绑及配置变化隔离历史ACK、诊断读取不建立绑定/撤销租约/触发上传、损坏诊断文件不影响启动。9/30只有LOCAL_BUCKETS_INCOMPLETE，不能据此判定原网页账缺失；需对照受控分类桶覆盖摘要后再定位，不改算法填平。下文历史记录中的“用户需手工提供SW脚本输出”已取消，不再是验收前提。两端聚焦测试及目视尚在执行；全局共享执行继续关闭，原账固定窗口和完整联调未完成。

工程修正：用户明确反对将Service Worker手工取数作为反复验收前提。停止索要控制台脚本输出；按DESIGN中D-114正常界面只读可观测性补齐控件健康卡、Native管理员派生队列摘要和云端来源覆盖。调用链/负责人：扩展贡献/ACK/证明诊断→控件会话；应用派生队列/可信绑定健康→Native会话；契约及云端覆盖→当前会话。变更等级为只读诊断/UI，必须运行各自诊断裁剪/权限/状态/副作用聚焦测试和目视验证；不跑无关平台/WiX/原账全量、不新建分支工作树、不逐零件构建候选。真实UAC取消和工具禁访仍是边界，不绕过；诊断贯通后继续余额/提醒/结束/原账验收，整体尚未完成。

贡献现场定位（2026-10-03）：用户健康页确认本地组件已连接、最近成功11:35:52。Guardian只读派生表查询（rows_written=0）经截图Profile前缀唯一性matching_profiles=1核对：9/28 revision1、activeMs412000、complete=true；9/29 revision1、activeMs232000、complete=true；9/30 revision1、activeMs906000、complete=false、LOCAL_BUCKETS_INCOMPLETE；三日均profile-config:34/shadow，10/1-3无head。全库计数不能直接代替Child范围，此处已另做唯一性及孩子范围确认；按截图转录的精确设备查询为空，不将其当作无孩子贡献。不完整贡献可被接收/ACK，本身不阻断下一日，后续缺日期须另查本地队列。控件只读脚本已保存临时目录并经过语法及根任务内容审查，只读storage三key、不发网络/消息/写入、不输出身份或载荷；尚未在真实SW运行。Runtime D1读请求报7403，Native受保护诊断及原账仍缺权限，不能用public无待上传替代新版派生outbox。用户需手工提供脚本脱敏输出；原账/配额/共享执行未改。

真实联调阻塞（2026-10-03）：Native所属会话核对四运行组件2.6.18与候选哈希一致，Service/Session Agent正常，真实Host v3响应shadow；临时诊断来源缺签名绑定而拒绝执行投影，符合隔离，但不能代替原扩展联调。控件所属会话最初在上下文压缩后误重跑单测，已纠正；随后真实访问`chrome://extensions`返回内部tab不可claim，`chrome-extension://`被安全策略禁止且不得绕路。实际运行版本、来源证明、贡献/ACK未取得，不记通过；不重复工具重试、不绕过限制。安装后原账采样因用户取消UAC未取得，自动重发停止。需用户手工提供原扩展健康状态并重新明确允许采样UAC后再继续对应实机项；共享执行保持关闭，完整目标未完成。

安装后采样结果更正（2026-10-03）：会话45602现已结束，Start-Process明确返回“操作已被用户取消”，无ProcessId；包装脚本随后打印的Started=true不是实际成功证据，不能采用。安装后指纹尚未取得，不再自动弹出UAC或绕过取消。两端继续不需提权的真实能力及贡献同步检查；固定窗口原账守恒单列未完成。

安装状态更新（2026-10-03）：重新读取正式目录Host已为2.6.18.0，Service为Running/Automatic；不再要求重复安装。安装后固定窗口采样首次因诊断输出子目录缺失未生成文件，已创建专用目录后仅重试一次，当前RunAs会话45602及consent窗口仍在等待，不能标记守恒通过。控件及Native所属会话已接到真实版本、能力协商、配置34/shadow、来源绑定与贡献/ACK核验任务；共享执行仍关闭，后续以实际链路输出而非mock或版本号判定。

实机安装前基线（2026-10-03）：只读管理员采样已完成，固定北京时间半开窗口2026-09-25至2026-10-02，主账4081条、所选整条事实时长213595494毫秒，主账事实哈希`edbb7e0502d861bb131f398f23e4f541d156632405d8f4d40bb397d0fa71e03b`。旧表与媒体表为空，仅作为前后保留指纹，不解释为完整业务零用量；结果`complete=false/status=EMPTY`不得伪报完整统计。结果留在Native本地`.tmp/d114-validation/preinstall-2.6.18/original-ledger-fingerprint.json`，没有导出私密字段、修改数据库或ACL。旧RunAs进程句柄已结束；不再重复发起采样UAC。重新读取正式安装Host仍为2.6.16.0，2.6.18安装与1.7.40重载、真实联合验收及共享启用仍未完成。

第三批页面实际发布与验收（2026-10-03）：PR #215 合入 `2e18122059f8083e8ab0248c55eaca5332fdbdb1`，精确主页面 CI 37072047573 通过，Production 37072106635 成功；仅部署主 Pages `1a211c0c-660b-4bb1-8eff-76b11c4c921b`，source 2e18122。公开 manifest 回读确认 Runtime Worker b9dedc22、Guardian f8bb83de、独立 Pages 43edb82f 和 R2 2.3.1/既有哈希均未变化，迁移为空。已有登录浏览器真实摘要显示 shadow／未启用限制，今日网页和应用均0/2来源且未完整，日／周余额显示不可用而非假零，刷新恢复；不把未知用量当作完整统计。截图捕获超时，没有截图证据，不伪报。最终候选仍未安装／重载，固定原账采样 RunAs 仍在等待，真实来源替换、余额、离线、提醒／结束及原账守恒保持未完成。

第三批实际页面接线：真实访问管理仍只读取旧网页配额账，尚未消费 `shared-access-state/v1`。本批补齐只读共享余额卡，显示云端阶段、日／周余额、网页／应用覆盖与截止时间；不完整不补零、不启用执行，不改变旧配额编辑与原账。请求按孩子、配置版本、日期和可见页签隔离；离开、改绑或配置变化使在途结果失效。变更等级为 Console 行为；仅运行页面聚焦回归、typecheck、桌面／移动 mock 目视和 diff；排除 Windows/macOS/WiX/账本全量。与本批生产及实机证据集中收口，不能把新增卡片完成称为两端联调完成。

页面接线验证：新摘要直接读取已存在 API；使用真实 `profile-config:<version>` 策略 revision，拒绝旧孩子、配置、日期、页签和超时迟到结果；保留毫秒，不完整日／周不显示零余额。聚焦页面与现有云端状态测试、根 typecheck、脚本语法及 diff 通过。最终桌面／390px移动 mock 截图已目视无溢出；仅 mock，不代替真机。既有主页面 CI 增加同一项聚焦测试及其路径触发，不新增 job 或平台门。Matched＝共享读模型接入管理页面；Deviated/Extra＝无；整体 Missing＝本机安装／重载／真实联调及启用，仍未完成。

阶段文案固定：家长只读接口的 `usableForEnforcement=false` 不是终端执行证明。页面按已投影阶段显示 shadow“尚未启用”或 shared“已配置，实际执行以设备状态为准”，不把只读接口误当机器执行授权，也不在最终启用后错误显示未启用；追加 shared 阶段聚焦回归。

第三批修补发布回读（2026-10-03）：PR #214 合入 `191dee1fd781b17cf4e236d7b5b018fd651d2cec`；精确 Guardian CI 37069069179 通过，Production 37069151173 成功，仅更新 Guardian Worker 为 `f8bb83de-8904-4ad0-a1bb-f69e0e131978`。Runtime Worker、两 Pages、R2 latest 均与上一生产 manifest 相同；本次未执行迁移。真实已登录孩子的重复 shadow 保存成功返回 `success=true/noChange=true`，版本34不增长；这证明幂等保存烟测，不冒称新的实写或完整共享联调通过。真实配置仍 shadow、全局共享执行关闭；最终2.6.18安装确认、管理员固定原账指纹及原路径1.7.40重载仍待完成。无逐零件新分支、工作树或中间候选。

第三批实际集成／影子发布（2026-10-03）：整批 PR #213 已合入 master `b1729172ea5067dabd4b1f97220abe848661fd86`；精确主线 Runtime CI 37066633782、Guardian 37066633730、主页面 37066790058 均成功。Production 37066948206 已成功部署 Runtime Worker／独立 Pages、Guardian Worker／主 Pages，仅应用 Runtime 0014/0015 和隔离 Guardian 033 派生存储，未回放旧迁移。独立 P-256 来源证明密钥内存生成并通过标准输入配置，未复用旧密钥、未本地保存私钥。贡献接入开放，`SHARED_ACCESS_EXECUTION_ENABLED=false`；未启用共享限制、不改 R2 latest。Native 唯一候选 2.6.18 来源 `7e6e054` 已核对 Burn/MSI/manifest，446/446 当前与398/398上一契约测试通过；安装前基线与原目录控件最终候选正在准备。真实两端来源绑定、余额、离线恢复、提醒／结束及原账守恒仍未验收，不标记 D-114 完成。

本次生产 manifest 回读：Runtime Worker `b9dedc22-191c-4916-bcf5-8b9d3cfe5d8c`、Guardian Worker `4eb2a60e-d28d-43f2-92db-8562f6e2966d`、Runtime Pages `43edb82f-44c0-4ccf-aaab-690d48f1b3c7`、主 Pages `6ae06228-62fc-4f85-8f8b-4649b53effa3`，两 Pages source 均为 b172917。R2 latest 仍2.3.1，SHA-256 `3109d6bbd147f5bfba88549a240dae42e84e724aa86bd1baef724d2df7b17563`。新增网页能力／水位和机器策略／验证公钥入口无认证均401；原生产 manifest 存于GitHub运行产物，本地只保存公开发布元数据。

实机联调发现配置响应误判：仅提交 shadow 元数据后接口409，但回读和审计已确认33→34提交成功。原时间配置经排序规范化对照不变，自定义网站清单不变；既有保存流程物化默认自主度及effective清单，不能把raw审计多字段变化误称只改一列。远端结构证实profiles更新会触发历史插入，D1变化计数不必为1。最小修复只调整该PUT成功计数判定，保留expectedVersion/CAS/鉴权/审计；真实SQLite夹具用total_changes包含触发器影响，同时新增写入间竞态零更新仍409和shadow部分更新守恒回归。仅运行配置并发／共享阶段相关测试、typecheck、dry-run及diff，不修改原账或终端，不顺手改其他配置写入器。

本批修补提交前审计：配置并发真实SQLite／shadow更新／零写入竞态、共享配置只读路由、根typecheck、Guardian dry-run（978.55KiB）及diff通过。Matched＝成功写入不误报冲突，条件版本／隔离／原配置语义保持；Deviated/Extra＝无，完整目标Missing＝2.6.18安装与管理员原账基线、原路径1.7.40重载、两端真实来源／余额／离线／提醒／结束守恒及最终启用。真实生产页已验证六导航、四统计视图、设备详情／分配可读且不被统计缺口阻塞；不把上述页面可读当作完整共享验收。控件候选来源b172917，174文件复核，原81a1兼容入口仍1.7.40，ID与配置未重绑；隔离正常／取消／强制关闭最新uGhD52证据与最终源码一致，但Native授权仍为FIXTURE_NOT_VERIFIED。当前机器仍2.6.16.0，尚未装2.6.18；其管理员基线权限未取得，不能声称原账保留已实测。

最终接线修正：短期来源证明仍只允许在300秒内创建绑定或进行云端请求。协商 `shared-web-local-lease-v1` 后，已验证绑定可以在同一存活Host连接内保留仅内存的本机租约，接收离线新贡献；租约绑定连接/PID启动实例、Windows用户会话/启动代际、机器凭据代际、孩子分配、完整配置及既有来源范围。断流、重启或任一范围变化立即失效，不持久恢复过期授权；重连必须新证明。租约不授权云端请求、新来源或单独授予执行。没有有效租约的活跃网页来源必须标为不完整，不能因旧贡献已ACK而冒称完整。共同契约与两端聚焦验证属于同一1.30集中开发批，最终候选待接线完成再构建。

共同租约验证：7项跨端向量及未知字段／过期创建／断连接／旧能力／完整配置变化拒绝通过，原签名过期拒绝测试保持通过；契约build、compatibility、根typecheck、源码边界和diff通过。首次build因D盘沙箱写权限失败，使用受支持的 scoped escalation 后通过；边界命令误用mjs扩展已改为项目既有js入口。Matched＝共同本机租约规则和旧证明语义保持；Deviated/Extra＝无；Missing＝两端实际离线增长／撤销、阶段启用及最终实机。无生产写入或候选安装。

最终候选交接锁同步：集中1.30.0契约现包含共同离线租约，来源eea0143，109153bytes，本地tgz SHA-256 83138e4e8b66cebc8331ac6b87cc4b58a2b9f1f2169c976b1eb440f8915984d7；上一1.29包及各历史候选包仍保留、不覆盖。两端固定消费同一包；交接锁同步仅为产物验收，不改变发布权限、不构建中间安装包、不上传R2。只运行产物锁及CI路由固定测试。

锁同步审计：产物校验器及CI路由固定测试、diff通过；Matched＝固定版本／哈希同步，Deviated/Missing/Extra＝本锁任务无；完整D-114的实机及启用缺项继续保留。该结果不意味着Native新候选已安装或已发布。

第三批发布依赖只读核对：Runtime远端待执行0014（other历史）和0015（应用派生收据）；Guardian已有profiles/devices但旧迁移登记不完整，033三个派生表尚不存在，不能执行旧迁移全列表。最终生产流程增加默认关闭的D-114影子准备入口：仅用033隔离迁移目录应用派生表，专用来源证明密钥只核对名称，缺少则阻断且不复用旧密钥；部署仅开放贡献接入、明确保持共享执行关闭。最小验证发布配置固定测试／隔离033实际D1／diff；不重跑产品全量、不操作生产。密钥与实际迁移仅在完整批次集成后配置，当前尚未发布。

发布准备审计：固定配置／CI路由测试、工作流YAML解析及diff通过；实际用生成的隔离配置执行本地033仅一项、6条SQL成功，回读无待执行迁移。专用密钥缺失／只存在SSO或机器密钥均拒绝；manifest分别记录Guardian实际迁移及影子准备，不宣称已启用执行。第一次临时配置命令使用错误cwd导致文件不存在，改为工作流真实backend cwd后通过；没有生产写入。Matched＝精确存储范围、默认关闭、专用证明预检、发布证据；Deviated/Extra＝无；Missing＝最终集成和实际生产／安装／联合验收。

### 集中交付计划（2026-10-03，取代逐零件收口）

第三批页面预检：隔离mock主控制台六项导航、四统计视图和设备详情／账户分配已实际渲染。430px视口发现设备抽屉关闭按钮被固定孩子选择栏覆盖；本批仅调整嵌入组件的移动抽屉上下边界，避开62px顶部及66px底部导航并保留safe-area。不改设备API、管理操作或数据；用loader聚焦回归及桌面／移动目视确认。生产和真实联合验收仍未完成。

页面预检结果：loader聚焦测试、根typecheck及diff通过；1440×1000桌面与430×900移动端动画结束后截图已目视确认，移动关闭按钮可点击，账户分配保持可见，桌面布局不变。隔离mock统计请求失败时设备页仍可使用。审计Matched＝移动遮挡修复、页面预检；Deviated/Extra＝无；Missing＝生产及真实两端联合验收。截图仅保存在本地临时目录，不提交家庭数据或伪报实机通过。

共同执行语义补全审计：13项准入、12项逐来源连续性、原有12项来源替换、分页及多浏览器、28项生命周期／24项活动／43项许可回归与9项新增连续许可向量通过；固定首次可见时刻到60秒、最新许可与原触发绑定、旧端不协商不签新许可、精确ACK及旧端兼容通过。首轮兼容检查假定所有schema字段必填，新增可选触发身份后已改为明确区分必填／可选并通过，不放宽未知字段拒绝。契约build、根typecheck、源码边界及diff通过。Matched＝共同准入及提醒增长连续性；Deviated/Extra＝无；Missing＝两端实际消费者集成及完整批次真机验收，未部署／启用。

PO 已批准三个完整功能批次；现有准备层与测试证据保留，不再逐字段发契约或逐读取器创建 PR。复用现有工作线、目录；不生成中间安装候选。本批变更等级为契约／设备鉴权／派生存储，最小验证为契约隐私与版本、设备归属／重绑定、幂等替换／水位、真实本地 D1 及两端调用链聚焦测试；排除无关 Mac、WiX、页面和原账全量。生产密钥、迁移、安装和启用均留到第三批；当前限制动作关闭。

| 批次／调用链 | 负责人 | 验收结果 | 真实阻塞／剩余 |
|---|---|---|---|
| 1：设备鉴权 → 独立网页贡献／ACK 水位 → 云端逐来源依据 → 两端本机替换 → 共享余额 | 当前会话：契约、云端；控件／Native：自身消费者 | 云端shadow已上线；Native2.6.22四组件安装核实；扩展1.7.41既有现场连接v3，网页实际云端ACK已确认 | 来源签名绑定及当前Native贡献ACK按PO挂起，安装后恢复未核实；应用各scope恢复及真实共享余额待核实；历史未知桶独立延后，限制动作关闭 |
| 2：共享余额 → 访问检查 → 可见提醒／正常关闭／超时强制 | 控件、Native，当前会话核对兼容及配置 | 未验收、未启用 | 必须实际关闭／取消／送达失败与原账守恒；debugger 仅隔离评估 |
| 3：集中集成 → 指定云端及派生存储 → 唯一终端候选 → 真机联调 → 共享启用 | 当前会话及所属实现会话 | PR213/214集中影子发布、PR219 Runtime修复已上线；PR220控件诊断已集成；当前安装2.6.22／控件既有现场1.7.41；新提醒补丁已提交但未安装 | 原账守恒有效基线、完整两端联调及最终启用待完成；历史未知桶／Mac／P1单列，不伪报通过 |

第二批执行身份：Native 实际接入发现本机替换变化未必改变云端 basisRevision，旧云端 state.revision 不能用于本机提醒／准入许可。两端统一由完整 policyIdentity、basisRevision、完整 projection 和按日期／source／sourceKey 排序的 replacementVersions 生成 SHA-256 内部执行身份；不含轮询时间或 transportStatus。连接／授权失效独立撤销，不完整不签许可；公共云端状态不被覆盖。集中补共同纯函数与向量，仍属于未发布的 1.30 开发批，不逐字段发新版本。旧固定候选包保持不可变，最终集中包与两端锁另行统一验真。

第二批实际调用补全：提醒实例及首次可见单调时刻固定，普通有效贡献增长不重新启动60秒。只有同授权范围、日周、完整配置、来源集合、更正与产品关联版本，逐来源序号及原有效贡献不下降时才证明连续；缺失、下降、更正、目标或授权变化撤销。执行许可绑定最新完整执行身份及原提醒触发身份，短时一次性执行，不把旧身份伪装成当前身份。共同准入函数沿现有网页规则：空时间窗全天、起含终不含、逆序或等端点不命中（跨午夜需拆段）；复合借娱乐仍检查复合窗，其他保留对象限制不扣三桶。只补共同契约与聚焦向量，原账和生产阶段不变。

同批多浏览器边界：应用执行汇入同受保护用户、同孩子的所有已验证连接本机增量；逐 proof 取得同一云端依据和完整配置身份后才合并其各自授权 scope，不能由一项证明授权另一来源。已知本机增量缺授权使投影不完整，不能静默选第一个浏览器。共同纯组装／替换上限与已有依据保持 1400（每日最多 200、七天）；单 proof HTTP 仍最多自身应用＋该网页来源，不扩大机器端单证明授权。第一批云端代码已本地提交 30d53c1、230bbce；未推送／合并／部署。

第二批共同函数本地审计：执行身份黄金输入／摘要、替换输入顺序与离线状态稳定、本机用量／序号变化撤销旧身份、不完整／重复 scope 拒绝、异步调用输入隔离通过；多本机网页来源聚焦保留应用来源后通过，首轮仅网页夹具被正确标为应用覆盖不足，未放宽覆盖判定。集中契约 build/compatibility、12 个既有执行向量及分页、根 typecheck/diff 通过；初次类型收窄编译失败已修正。Matched＝共同执行身份及有界多来源纯函数；Deviated/Extra＝无；Missing＝两端真实访问与提醒调用接入、安装及生产联合验收，限制动作仍关闭。该摘要不授予来源或执行权限。

第二批云端阶段接入：复用孩子现有 config、expectedVersion 和审计，增加严格的 sharedAccessRolloutV1 元数据（schemaVersion/stage），不建立第二配置源。shadow 不执行限制；shared 写入和有效投影同时要求专用部署开关 SHARED_ACCESS_EXECUTION_ENABLED。开关默认缺失，且 shared 保存要求派生贡献接入及专用证明密钥已配置；本轮不配置生产。阶段变化进入现有配置 revision/effectiveAt/hash，各读取入口使用同一投影。通过源码实现不代表已获真机启用条件；第三批联合验收后才操作共享阶段。最小验证配置校验／同源读取／默认关闭／阶段身份变化及根 typecheck/diff，无关平台和原账测试排除。

阶段接入审计：实际父端路由拒绝未认证／错 expectedVersion／额外字段／关闭开关／缺专用密钥，全程无写入；实际设备路由与父端投影一致，默认关闭及阶段变化完整身份失效通过。配置并发与既有 other 审计回归、computer/shared-state 兼容、根 typecheck、源码边界、职责及 diff 通过；Guardian 本地 dry-run 978.52 KiB。未修改部署 vars/secrets，未发布或启用。Matched＝同一配置源可控阶段；Deviated/Extra＝无；Missing＝第二批实际动作和第三批联合验收。

本整批沿现有 Guardian integration job 纳入专用来源证明／派生贡献／033 及相关聚焦测试路径，并运行实际绑定与电脑读取回归；不新增 job 或平台回归。源码范围检查的 CI 文件例外仅为上述真实调用链测试，不修改生产 workflow 或审批权限。

本批新网页贡献只从扩展当前权威统计派生，单独持久版本、摘要和 ACK；不得修改原 Segment、原统计或原上传队列。生产发布前本地新增 migration 只在测试数据库验证，不执行待处理生产迁移。源码、部署、安装、真实验收分别记录，不把默认关闭准备层称为整批功能完成。

第一批云端代码审计：集中契约 1.30.0 新增独立贡献、ACK、水位、专用 ES256 来源证明及本地余额准备读出口；Guardian DeviceBearer 由服务端派生来源，Runtime MachineBearer 返回可信上下文，受限内部绑定重验当前分配，令牌轮换使旧绑定失效。新增 033 只在独立本地 D1 执行，五条 SQL 通过；发布／幂等／下降更正／改绑竞态在隔离 SQLite 实测；真实设备路由、机器挑战路由、公开 P1363 向量及共享读模型聚焦通过，网页10分钟＋非Chrome应用10分钟＝20分钟，缺派生来源不回退旧 manifest 序号。Contracts build/compatibility、共享替换向量、根及 Runtime typecheck、源码边界、diff 通过；Guardian/Runtime dry-run 分别 976.47/475.97 KiB。未跑无关平台／安装器／页面全量；没有部署、生产迁移、密钥配置、候选安装或启用。Matched＝云端调用链及集中契约；Deviated／Extra＝无；Missing＝两端消费者完成及真实联调、第二／第三批，不宣称完整 D-114 交付。

同批完整配置复核：云端 basis／余额 revision 及读取后的身份复核改为完整配置摘要，覆盖同 profile-config 序号但 quota 内容变化的缓存／分页失效。首轮旧测试只提供三字段假配置，不能通过真实身份校验；改为真实投影后再修正 VM prototype 的 JSON 运输夹具，相关两项聚焦测试通过，不放宽生产校验。真实本地 D1 机器挑战与执行依据测试三项通过（20 项无关跳过），覆盖错误令牌、拒绝 caller Child、可信六字段上下文、读取不写 activity 及等待期间改绑；Runtime typecheck、diff 通过。集中契约源码／包仍为 30d53c1／1.30.0，契约字段没有追加发版；两端实现与真实联调仍进行中。上述 HTTP／D1 夹具不是生产或安装验收。

2026-10-03 当前整合批：控件来源7ad8f6d6e8b44a3117c76f2a05366bc2f03a1da1，六文件完整策略身份只读准备层。仅精确整合所属产品/测试字节及保留双方DESIGN记录；运行身份专项（含固定1.29包）、Native桥专项、状态专项、typecheck、边界与diff，不跑平台/安装器或原账全量。默认关闭，不更新候选、不安装部署；策略一致不代表来源授权或执行许可。

本批提交前审计：固定1.29包身份专项、local-guardian、shared-quota-state、根typecheck、extension-root、源码边界、职责和diff均通过；五个产品/测试路径与7ad8f6d逐字节差异为空。一次边界命令误写不存在的.mjs后缀，纠正为现有.js入口后通过，未改检查代码。仅DESIGN冲突保留双方记录；既有任务板草稿保留，.wrangler未纳入。Matched＝完整身份准备层精确整合；Deviated/Extra＝无；Missing＝Native身份返回、可信跨端来源、本机增量替换及实际共享执行/提醒与真机验收，全目标仍进行中。

Native协调状态已更新：真实turn已包含PO“开始”，main@4509b5295bb3e0bfbf508284c6d8181c38ff9c07完成1.28严格纯分页组装；当前/上一1.28/1.27聚焦测试各111/111，精确push CI37042753202全部成功。旧“尚未开始”记录仅为历史阶段，不再是协调阻塞。下一批已交接机器HTTP完整读取、原子LKG及1.29完整policy身份准备接入，尚未取得实现结果；纯组装不等于真实认证运输或跨端web替换授权，不代写Native源码。

2026-10-03收口续进：PR210已合入d530aa2；PR211修正向量版本后在head8a0fd27通过App Runtime37042338011、Guardian37042337991及Task/Rest兼容检查，merge为3c6bafa57f12c6f034cb9c54f1bb038f40d159ea。当前/上一固定契约为1.29/1.28；1.29修正后候选在Temp/timeonchrome-contracts-1.29-8a0fd27，93321bytes，SHA2561338ab2b2621ed4c19b8208203fd77d8e648b4f20721529479fc73a947bbbaf4；旧Temp根同名1.29包不作交付证据。已通知控件所属任务继续完整配置身份默认关闭接入。Native1.28分页实现仍未开始，跨会话授权原文无法由其工具读取是当前协调障碍，不冒称正在开发；来源认证、两端本机增量替换、实际配额／提醒执行和实机原账对照仍未完成。不新建目录/分支，不改候选、安装、部署、迁移或R2；全目标保持进行中。

2026-10-03下一契约批：architecture-integration，补完整配置身份而非仅revision比对。Contracts1.29新增严格policy规范化／SHA-256身份和匹配函数，BrowserBridge原getSharedQuotaState响应可选带身份，仅新能力协商后使用；包含effectiveAtMs/stage及全部配置摘要，不增加控制命令或来源授权。允许shared-access/native-host及现有schema/测试、包版本锁、DESIGN/任务板；验证顺序无关、同revision内容差异、阶段／生效时间差异、未知字段、旧消息兼容、实际控件规范化字节一致，运行契约编译／聚焦／兼容、根typecheck、边界/diff。不跑平台或安装器，不改消费者、候选或生产。PR210已合入d530aa2，CI37041204761的changes/职责/gate通过，无部署。

1.29提交前审计：契约编译、shared-access（含实际控件规范字节和摘要异步输入隔离）、兼容schema、既有12执行向量及分页回归、根typecheck、边界/diff通过。首轮身份测试沿用了旧投影测试任意revision(policy-1)，已替换为实际Guardian profile-config:4；未放宽完整配置校验。仅新增只读能力常量／可选响应字段和纯内容核对函数，旧请求enum与消息未改。Matched＝完整配置身份契约；Deviated／Extra＝无；Missing＝两端接入、跨端来源认证及实机共享执行。Native内部缓存hash与跨端规范不同，消费者尚未使用1.29，不冒称一致性已实机验证。

PR211首次CI契约任务失败：机器控制golden向量contractVersion仍为1.28，遗漏同步包1.29。仅更新该元数据（不改HTTP/撤销语义或向量内容），复验契约workspace测试；失败不合并。已生成的临时1.29 tgz不是最终交付包，修正后另存并重新核对，不以旧包哈希宣称通过。

2026-10-03机器分页批已合入：PR209/head3e74d4e，Guardian CI37039273277与App Runtime CI37039273194相关检查成功，插件merge为master e47da005db412d03aee9b46d984743df76643e4d，既有云端树fast-forward。Guardian本地dry-run940.12KiB亦通过；没有部署或安装。控件1.28分页消费已由所属任务提交712bce3及ca0bb56，当前精确集成；不改所属任务的产品代码。Native会话当前为Default但未执行Windows1.28组装：其报告跨会话读取工具未返回原始用户输入，无法独立核验已有授权；该子项保持未完成，其他云端/契约/控件工作继续。

本次集成范围：architecture-integration，来源3675991ff391677e7378094ca2799da2dcc4fd5a（含712bce3、ca0bb56）；仅整合其八个产品／测试路径及设计记录，合并文档冲突时保留两端事实。先核对来源字节一致，再运行分页reader、policy reader、local guardian聚焦测试、根typecheck及边界／diff检查；排除Windows、macOS、WiX及无关全量测试。第一次复验失败定位为10毫秒建立缓存未确认的夹具，已由控件所属任务修正；未放宽生产超时或缓存规则。默认关闭，不改候选、不部署；真实通道、完整配置身份和共享执行仍待完成。

提交前审计：修正后的分页reader专项通过，配置reader／local guardian、根typecheck、源码边界及diff通过；后两者产品代码未变，复用本次此前通过证据。八路径与所属来源3675991逐字节diff为空；DESIGN只合并双方记录，无候选或其他草稿变更。Matched＝默认关闭只读消费者及精确集成；Deviated／Extra＝无；Missing＝跨端来源认证、完整配置身份、Native消费者与真实共享执行，整体目标继续未完成。

下一标准云端批：补机器授权的1.28分页依据读取，复用Machine Bearer、当前protected assignment及既有Guardian内部绑定；自身application sourceKey由服务端按已用算法派生，不接收caller Child/sourceKey。Guardian先验证owner Child，再分页，只允许该机器来源scope；读取完成复核assignment/机器撤销及policy变化。新增接口不写activity或账本、不授予网页scope。允许v2Routes/applicationSharedQuota、Guardian computerUsage/sharedAccessState及对应现有聚焦测试、DESIGN/任务板；最小验证权限/参数/绑定并发/错版/内部故障/应用scope隔离、根和Runtime typecheck、边界/diff。无关平台/页面/安装器不跑，不部署。PR208已合入507d010，精确CI37037200688通过，控件源码来源字节未改。

本批本地审计：机器GET与Guardian受限内部分页读取已实现；来源键复用原上传算法，逐项拒绝caller Child/source、重复参数、旧assignment、非应用scope和错Child，读取后重新校验撤销/改绑。响应流限制256KiB、超限取消；读取不更新机器activity。computer-usage-cloud/shared-access-state-cloud聚焦通过；真实本地D1机器读取、改绑/撤销及现有配置读取3项通过（19项无关跳过），根/Runtime typecheck、源码与standard-cloud九路径检查、diff通过，Runtime dry-run465.75KiB。首轮失败来自VM Error跨realm及测试使用不存在的revoked列/非法manual枚举，已按真实schema修正并复验，不放宽产品校验。Matched=本批机器分页授权读取；Deviated/Extra=无；Missing=跨端网页来源可信证明、完整配置身份、两端实际消费与共享执行/提醒实机验收，保持全目标未完成。没有部署、安装、迁移或候选替换。

本轮技术集成清单：精确merge控件来源5a22ccd954e7c28e980122ba1794ddf3ef9cf1cf（含d40a0bc设备配置读取与LKG及流式边界修复），保持其产品/测试字节不变，只合并双方现有设计记录；不操作控件工作树未提交任务板。聚焦复验shared-access-policy-reader/local-guardian、根typecheck/源码边界/diff及Integration-Source范围证明；不生成候选包、不改加载目录、不启用执行或部署。1.28 PR207已合入85826e4，所有相关CI通过，固定候选90991bytes/SHA25672dbd1f611c0471913f07a72b23be519ad0066eb1c5d29f5433c7655b4b59c04已通知两端开展只读分页消费，机器来源授权/完整policy一致性等仍未完成。

集成审计：配置读取/LKG及local-guardian聚焦测试、根typecheck/源码边界/diff通过；只有DESIGN插入位置冲突，双方完整记录保留。产品与测试逐路径对照来源5a22ccd无差异，所属控件TASK_BOARD草稿未动。Matched=所属实现精确集成与当前1.28兼容；Deviated/Extra=无；Missing=真实设备API/Host及共享执行验收，默认关闭。未部署/安装/替换候选。

下一契约批（architecture-integration）：Contracts1.28固定设备分页运输类型、严格全页组装函数及schema；当前1.27核心/黄金向量不改。验证同Child/版本/配置、连续游标、总计/逐日覆盖、自身scope、私密/未知字段拒绝与输入不变；缺页不得生成完整依据。允许contracts、workspace版本锁、现有DESIGN/任务板；只跑契约编译/兼容/新增分页回归、原执行向量、根typecheck/边界/diff。PR206已合入93e9090，Guardian37035871728与修正职责声明后的App Runtime37035982360通过，未部署。机器授权、跨端来源证明、完整policy身份及真实执行仍须后续接入，不用运输验证代替认证。

本批兼容验证精确增加根shared-access-state-cloud测试：将真实Worker分页helper生成的多页JSON交给新契约组装器，核对还原依据逐字段一致，不仅使用契约理想夹具。该根测试为跨端兼容消费者例外，不修改云端产品实现。Native已交付518e51d候选层与7ff3839纯投影，控件明确生产调度仍未接入；尚未构建/安装/启用。本批首次编译报隐式any，修正类型声明后相关测试通过，不计首次失败为通过。

1.28本地审计：类型/schema/严格全页组装、新分页错误/零来源/不可变回归、既有12执行向量、真实云端多页兼容、契约兼容/shared-access/machine版本测试、根typecheck/源码边界/职责/diff通过。Matched=分页运输契约与完整接收核验；Deviated/Extra=无；Missing=机器授权与跨端证明、两端完整policy一致性、真实执行联调及启用，整体未完成。未改网页/应用原账、配额执行、旧消息或生产。

本轮标准云端接入清单：①设备Bearer绑定Child/真实deviceId，无外部scope；②逐页最大100、非首page需basis revision、错版409；③返回完整日期覆盖/计数和仅自身web授权scope；④读取结束复核解绑/改绑/policy变化；⑤真实路由与分页固定回归、旧policy/state兼容、根typecheck/边界/diff及Guardian精确CI。允许device.ts/sharedAccessState.ts、两个对应根测试、现有DESIGN/任务板；CI仅接入这两个固定测试。无关平台/UI/安装器不跑，不部署。Native授权读取和跨端web证明尚未完成，不能把设备API视为整条执行链完成。

本接入批本地审计：设备真实路由权限/参数/分页错版/读取中改绑与配置变化/故障脱敏/无写入口、真实分页helper完整重组/自身scope/覆盖计数、旧共享state及owner路由、根typecheck、源码边界/职责/diff通过。首轮VM数组原型跨realm导致deepStrictEqual失败，改为JSON传输内容精确比较后通过，产品代码未为测试修改。CI精确例外仅现有Guardian workflow接入两项实际受影响固定回归，不新增重型流程。Matched=云端设备只读接入；Deviated/Extra=无；Missing=版本化运输契约交接、两端真实读取/执行/验收，未启用/部署。控件d40a0bc+5a22ccd已返回并推送，审查补齐policy生效时间不倒退及流式64KiB限制；尚未集成本轮云端提交，不混作已验收。

云端接续小批（standard-cloud）：在现有sharedAccessState读取器旁补独立执行依据组装，保留网页原manifest ordinal和应用原共享贡献revision、外层发布revision；旧shared state响应和计算不变。读取仅已持久化统计，不读Segment。来源没有可信ordinal/覆盖缺口时保留原因，不补造来源；全周按当前Child读取。最小测试为真实读取器聚焦fixture、旧共享state回归、根typecheck/职责/diff；认证公开接入与分页运输尚待下一步，不把内部组装函数当权限接口或启用证据。PR204已合入2418714，全部相关CI通过；1.27固定包88646bytes/SHA256 c277f13547f28d0c619c036f1b0ef9cee8a053fa0384647fd3b3d30c5485c41d已通知两端。

本接续批审计：实际sharedAccessState读取器聚焦测试、旧共享路由、根typecheck、源码与职责/diff通过。新增依据只顺序读取最多七个已结算统计日，无原Segment重算/写入；保留原应用贡献版本与外层发布版本及可信ordinal，旧接口计算不变。历史缺ordinal和来源失败保留原因，有效来源继续保留；revision绑定account/Child/policy/stage及全部来源。首次隐私断言误检查夹具非真实statsHash内的设备标签，改为明确检查sourceKey后通过，不将第一次失败称通过。Matched=内部读取与原响应兼容；Deviated/Extra=无；Missing=公开设备/机器授权、分页与两端实际消费及执行，未部署/启用。Native已获内部local-only候选及原gate通过后同body promotion具体交接，不允许改变上传事实或先发送未认可清单。

本轮契约子批（architecture-integration）：Contracts1.27新增独立执行依据/替换纯函数和共同向量，区分发布版本与来源单调版本，仅按认证允许的精确scope替换已存在来源；不从云端最终总量减自身，不重新结算。允许路径为contracts、工作区版本锁及现有DESIGN/任务板。最小验证为契约编译、旧兼容检查与新增向量、实际云端typecheck/边界/diff；两端锁待新包验真后所属任务更新，无关平台/安装器/浏览器不跑，不部署启用。设备policy PR203已合入8330873，真实Guardian兼容CI37032059827含新路由测试通过。

本批本地审计：新增执行依据schema与12共同向量，以及授权scope、周期、重复来源、私密字段、网页整数秒、不可变输入/覆盖缺口回归通过；契约build、兼容、既有shared-access及根typecheck通过。首次编译的类型错误/沙箱写入失败已修正并重新成功，不计失败为通过。machine-control向量只同步包版本元数据，既有协议/消息不改。Matched=逐来源版本替换核心与schema；Deviated/Extra=无；Missing=云端分页来源依据/认证绑定、两端执行与实际联调，整体仍未完成。Native自身上传回执子项已提交3a00945，控件设备配置LKG已再次明确交接；本轮无部署/安装/启用。

接续云端小批：核实控件缺设备鉴权统一policy入口。先记录设计，再仅新增`GET /device/shared-access/v1`，复用认证设备绑定及既有Child投影，拒绝外部scope参数、不改旧config读取/原账。最小验证：真实路由transpile固定权限/解绑/缺档案/故障/响应及同投影回归、根typecheck、边界/diff；不跑浏览器/平台/安装器，不部署。此批公开只读接入不启用shared，仍须整体端到端验收。

本入口固定回归已通过，设备解绑契约15/15及根tsc通过；为使真实CI覆盖新增接入，现有Guardian integration workflow只增加device/profiles与本测试的路径及一个测试命令，不引入平台job/全量回归。CI公共文件例外为本入口消费兼容性接入，不修改发布workflow或授权。

本批审计：新增设备policy真实路由/真实Child投影固定回归、解绑15项、既有identity integration及management gateway10项、根tsc、源码边界/职责/diff通过。Wrangler4.127.1首次沙箱写日志/构建目录被拒，不计通过；获准本地dry-run后921.61KiB构建成功，没有实际部署。Matched=只读认证接入、scope与旧接口隔离；Deviated/Extra=无；Missing=尚未部署及两端实际读取缓存/完整共享执行，保留全目标未完成。

2026-10-03续进：PR202精确head50ad030已通过CI37030702553的职责/changes及最终gate，无关云端/页面/release jobs跳过；插件合入`master@025a177856eeeec45d66c7626ffe60f81183fafd`，本现有云端分支已fast-forward。不改变候选或生产。两端已收到继续实现统一配置持久LKG的授权交接，分别检查认证scope、原子缓存、重启离线、身份切换/迟到响应，不自行启用shared；缺设备鉴权读取能力须返回接口缺口，不借用家长会话绕过。DESIGN新增逐来源替换/周账一致依据接入约束；该新增接入尚未实现，不能把总量减自身算法或仅配置缓存当成共享执行完成。完整剩余包括来源依据与认证绑定、实时替换/执行、实际提醒关闭及原账守恒验收、分阶段发布启用。

本批合入前审计：10个控件实现/测试文件与来源05bcfa2逐件完全相同，DESIGN自动合并保留双方记录；提醒Content桥、生命周期、共享状态、共享影子、Native客户端五组通过，根typecheck、两项源码边界及diff通过。已读取所属树`output/playwright/d114/shared-content-evidence.json`并目视桌面/窄屏截图，无布局溢出；记录绑定content/lifecycle/bridge哈希分别为`aefaa71fca66ea1ac0db49b02fddbb272fbaf2926a2c5f50221dee9074b121f5`、`02938136415fb980bd5c9a25f710ff89389327afc8a62a355a6c10e2d959b7b6`、`3c14117118e1279a31e5c19b8bfe0280853a1c98bbe8d32f3bccd769f6a5732d`。实际Chromium DOM、模拟Native，不是实机联调。Matched=本批精确集成及最小验证；Deviated/Extra=无；Missing=完整D-114共享执行/实际提醒/关闭与原账对照，仍未完成。Native周期修复CI37027927923已独立核验current/previous Windows及gate成功，无关installer/mac跳过；新opaque修复CI尚待核验。

本批精确集成：控件现有分支已推送 `05bcfa2d0217eab3026610c75284c7a5c92890ea`，包含默认关闭 Content 提醒桥及周账日期/完整性消费者校验。只合入所属任务提交，产品/测试文件保持源提交字节；DESIGN 冲突保留双方记录。最小验证为提醒桥/生命周期/共享状态/影子/Native 客户端单元、根 typecheck、源码边界与职责/diff；真实隔离 Chromium DOM 的相同源码哈希证据复用，不重跑，不作为实际 Native 联调。无关平台、安装器、账本全量不运行；不换候选、不启用、不部署。Native `a87295978b2c7ff67b8f0cf6e99c39e26bbea39c` 已修复真实43字符用户标识消费者，相关当前/上一契约各78项通过，远端 CI 仍需核验。共享配置 LKG、逐来源替换与执行接入仍为完整目标待办。

续验真值：PR201已通过CI `37026414119`（changes/职责/最终gate成功，无关云端与发布检查跳过），合入 `master@29f0337e4da5c1b660511c46e01e25e7eb8141f1`；来源186000e已核验为主线祖先，旧PR197由此集成取代，原分支和脏树保留。控件继续默认关闭Content桥的可见/导航/迟到ACK核对，不新增关页或debugger权限。Native2.6.17候选source `fb659e2ce2a2387a06f7928501516be41f947cce` 的真实CI artifact11235242630已下载并独立验真：ZIP179629889/SHA `b004f710a974109f503e427bbbebd879c413fafc102d4ae58ec8409a82855568`；Burn119544925/`0b9d76df4fe2f2b9eae6fc431c37a9267053f8ace50aabfcac0316c8588a1719`；MSI60929782/`d9f4df43bbbcd282fdbc338dd521caa4e80b9c34b0d31e9d58ce718f15b0d298`，均与包内manifest/契约1.26一致。它与本地构建是两份独立产物，不串用哈希。该run上一契约有一项失败，不能称CI全通过或安装验收；Native已拆分可控异步版本变化、调用方取消及原内部超时专项，当前/上一契约相关组各59/59，后续CI仍待核验。另查明Native消费端只核对日日期，缺周一至查询日的周期绑定，已交所属任务独立修复，不放宽Runtime响应、统计或生产超时；旧候选保留，全部必要修改收口后统一交付下一候选。本轮没有安装、部署、迁移、R2或共享执行启用，完整目标仍未完成。

控件准备层集成审计：保留双方 DESIGN 契约与实施记录；16个控件实现／测试文件逐件与 `186000e0380e6cc158e46d268db3576c4bb4fbe4` 相同，无本任务产品修补。活动、执行登记、执行许可、提醒生命周期、Native 客户端五组聚焦测试、根 typecheck、扩展根目录与 Runtime 源码边界通过；真实隔离 IDB 证据沿用相同模块哈希，不重跑浏览器。Matched=精确源码合入与默认关闭；Deviated/Extra=无；Missing=真实跨端授权/ACK、关闭与原账守恒验收，不影响本准备层集成但阻止启用。原控件草稿、候选与生产均未修改。

控件准备层集成（未启用）：所属任务已推送 `186000e0380e6cc158e46d268db3576c4bb4fbe4`，真实隔离Chrome IDB提交/回滚、45次退休、旧代次拒绝、SW及浏览器重启有记录，但ACK为夹具，未证明实际Service执行。其原工作树仍有Content等未提交草稿，原地保护。架构集成在本现有干净云端树合入该精确已提交源，仅处理docs/DESIGN文档冲突；源代码保留所属任务字节，默认关闭。复用相同源码哈希对应的浏览器/单元证据，再核对源文件字节、契约/作用域和CI；不新建分支/工作树，不替换原候选、不启用、不改网页原账。当前master已包含PR200 `f56a1fc51120e7b730b8ede1f819bc825ed46391`。

共享状态读取契约消费核对：`readSharedQuotaState` 仅校验结构，未绑定返回 day/week 与请求日期；计算/截止时间仅检查 safe integer，负数仍可通过，违反既有毫秒契约。本批仅拒绝错日、错误北京时间周起止及负时间响应，不改变源统计、配额投影或执行阶段。先补文档，再修改 Runtime 读路由与隔离 Service Binding 夹具/真实路由回归；运行本项 focused API test、Worker typecheck/dry-run/职责/diff，不跑平台/页面/账本全量。标准云端范围包含本项 backend 测试配置，无新增分支、迁移或生产操作。

本项真实本地路由聚焦通过（1 passed、73 unrelated skipped）：错误 day、week.toDate、非周一 week.fromDate、负 computedAtMs/settledAtMs 均503稳定错误码；合法下一周200，原机器认证/受保护账户拒绝仍覆盖。Worker typecheck、Wrangler dry-run 459.72KiB、源码边界、standard-cloud四路径及diff通过。首轮类型检查因负值测试夹具将null推断为唯一类型失败，改为明确故障注入后重跑通过；不计首轮失败为通过。Matched=本项既有读取契约校验；Deviated/Extra=无；完整目标真实跨端仍未完成，不修改共享状态生成或原账。

Native实机深核纠正版本推断：所属任务逐件确认已安装11个产品文件匹配旧构建 `fecb58f43022f7a3aabb076b6c516e954ab86fd1`／契约1.20.0；真实Host只读探测没有共享配额/提醒能力。它与新1.26候选虽同为2.6.16却不是同一包，不能作为D-114实机验收。已交由Native在原目录/分支生成唯一2.6.17候选，旧不可变包保留；仅版本/安装结构与候选构建，默认呈现和执行关闭，不安装或发布。控件所属任务已报告隔离Chrome真实IDB及重启通过，仍待审查记录；模拟ACK不是真实Service联调证据。

续验（本地候选，不是安装或上线）：PR199 四组相关 CI 已通过并合入 master `6f068020b09153a2f7cc98fdcf80cd00c0b71db0`，云端尚未部署。通过 GitHub 插件下载 Native run `37018922387` 的 artifact `11232527536`，独立核对 ZIP 为 179627996 bytes / SHA-256 `6ad89e1829293efd3f4f92d6b6fb033cf3175c6609b53e3893326cac3bc4c26b`；仅含 manifest、Burn、MSI。manifest 来源 `748bddcbc634cabbece6bf799fd3eea2e0935997`、契约 1.26.0 / `a53d765f239d2f04d7c172c109f49ea2ae0db73689cbcea6d588da81074722c5`；逐件流式重算与 manifest 一致：Burn 119549595 bytes / `0deff02d6e55cca439cb84ca7fb39ff93d35635266f3349d984f009c2caffd04`，MSI 60929782 bytes / `33c6762b6b6bfc76e43d438de7dcaab3c9c92334e731fe5ad2e553c7b1b65d43`。版本 2.6.16，仍为未签名内部候选 `BLOCKED_BY_AUTHENTICODE_SIGNING`；manifest 的 latestEligible 不是切换 latest 授权。没有安装、R2、迁移或生产部署。

控件草稿 PR197 最新 `7828cd81ed218f66b4d40c49176b17594c25c8e9` 已推送。只读审查确认匹配持久 ACK 推进请求代次，再使用严格 IndexedDB 事务退休登记；旧响应、断流、丢 ACK 和删除失败不能凭时间自动清理。45 次事务夹具及故障回归不替代真实浏览器持久性；本次插件查询该 SHA 的 PR workflow runs 为空，PR 保持 draft，尚未合并。已继续交接所属控件任务完成隔离真实 IndexedDB/SW 重启与故障验收，不修改原加载目录。正常可取消／超时强制关页仍待独立权限和语义裁决，当前关闭效果保持关闭。Matched=候选字节校验及已合入云端代码证据；Deviated/Extra=无；Missing=控件 CI/真实持久性、跨端真实提醒和关闭、安装及分阶段启用验收，全目标未完成。

本机现状补充：只读读取正式安装目录确认 Manager、Service、Session Agent、Native Host 文件版本均为 2.6.16.0；实际 SCM 为 Running/Automatic。这表明候选版本已在本机出现，不再沿用“尚未安装”的旧推断；当前任务未执行安装。具体文件哈希与候选源提交、运行时能力及跨端结果仍由 Native 所属任务核验，不以文件版本或服务启动替代真实验收。初次沙箱 CIM 被拒后，使用获准的只读命令完成 SCM 核验，无服务变更。

PR198相关四组CI全部通过，已合入master e00bc1283c267b12935b6a29d409cfc4f2770cbe，未部署。接续核验发现手工moveCustomSiteToPolicy及saveSiteAccessConfig未解除/提交同目标旧other覆盖，与D-114已明确的后续显式归类清除覆盖要求不一致。下一小补丁只在成功的家庭自定义主站分类操作中解除同一规范host用途规则，保留其他域/具体页面规则；保存网站配置仅在现有用途数组存在时一并提交公开规则，不凭缺省生成空清单。固定真实页面函数回归验证前后配置、未保存草稿、无权限/配额/历史变化，运行已有加载器/Profile/配置域与typecheck/diff；不跑平台/安装器，不部署。系统全局分类不能借此清除其他家庭覆盖。

同一保存闭环另有已证实迟到缺口：saveSiteAccessConfig在PUT后用当前Child拼接GET，且GET完成无Child/版本核验，会把旧操作刷新套给后来页面。仅补原Child/成功版本上下文核验；失败/旧上下文不刷新，正常保存仍加载effective配置。实际函数延迟回归覆盖PUT与GET期间换孩子/版本、正常成功和失败恢复；不修改条件写入、权限或计时。

本批回归通过：执行实际主站规范化/移动/公开payload函数，确认只解除同一主站host覆盖，页面和其他域规则保留、冲突不动源配置、缺省不生成用途清空；实际网站保存函数PUT/GET换Child或版本不更新页面，正常上下文仍刷新。Profile路由、配置域30/30、加载器语法/行为、根typecheck、职责检查及diff通过；无HTML/CSS变化，复用PR198同布局目视证据，不重复平台/截图全流程。Matched=本项逆向归类及迟到隔离；Deviated/Extra=无；跨端真实终点仍未完成，无部署/安装/迁移。

续验发现两个真实缺口：①网站其他用途仅有未归类审批和导入，现有普通网站缺少直接配置及规则列表入口；下一批仅补主页面独立用途规则入口，不能把other加入访问权限custom列表，不改变系统全局分类。最小验证为实际页面函数的增删/条件版本/Child隔离、目录与桌面移动mock；排除终端、安装器及原账测试。②控件持久执行去重20条满后永久拒绝新操作，仍为Missing，不能称长期可用。只读核验Native当前源码：SharedReminderLifecycleStore.AcknowledgeBrowserExecutionAsync在同一SQLite事务写Ack及Consumed=true，CommitAsync完成后Coordinator才回复；ReadBrowserExecutionAsync拒绝已有Ack，Authorize拒绝Consumed。因此匹配的成功执行ACK具有持久消费依据。该事实仅证明服务端退休，扩展还须证明同一ID全部在途回复已排空或被请求代际拒绝，才能删除本地claim；不能按墙钟5秒或换配置删记录。交所属控件任务实现并测试，不改关闭效果、网页账或原候选。

本批网站手工用途入口已实现：独立“其他时间网站”目录、已有网站行直接设置、域名/页面添加、解除用途规则，均复用Profile条件写入及服务端共享规范化，只刷新用途字段并保留未保存访问草稿。实际页面函数增删、只写用途/不带申请身份、重复点击合并、换Child/版本迟到无覆盖、失败可重试回归及Profile路由聚焦通过；桌面1280/移动390px实际mock截图1790952519742/1790952519982已目视，实际添加按钮仅发用途数组+expectedVersion并保留学习列表。先前stdin mock注入未执行，改为工具文档base64入口核实2行后再截图，不计错误截图为通过。无Worker/终端/原账/权限语义修改；尚未真实家庭验收或部署。Matched=手工用途入口；Deviated/Extra=无；全目标Missing保持跨端真实提醒、关闭实现/单项权限、持久性验收与生产启用。

本次迟到保存回归已通过：真实函数模拟409刷新期间换孩子/版本，确认无覆盖和重渲染；正常原上下文仍刷新；迟到PUT不降低新版本。Profile路由、typecheck/diff通过，无HTML/CSS布局改变，复用本批已目视的相同页面布局证据。既有Main Console CI增加已有加载器/配置上下文回归命令及自身路径，避免页面改动只做结构测试而漏跑此行为；不新增job或平台验证。Matched=本项回复隔离；Deviated/Extra=无；真实家庭/跨端终点仍未完成。

PR195五组相关CI通过并合入master5e8f420c793b26704418a142a1bcb94b5d75ae16，未部署。继续同一配置条件闭环：已证实saveProfileConfig在409刷新前核对孩子，但刷新await之后无核对，迟到旧孩子数据会覆盖当前配置；PUT成功也可能把已加载的新版本降回旧版本。下一最小补丁仅在回复应用前核对原Child/版本，固定真实函数延迟回归；不改网络写入、分类/原账/配额、布局或终端。只跑配置/加载器聚焦、typecheck/diff及职责检查，不扩大平台测试。

本批本地收口：真实Profile路由未登录/跨家庭/条件版本、目标规范化、重复与字段拒绝、元数据保留、缺省/删除/幂等及审计通过；实际页面候选、配置域30/30、旧字段242/242、Rest相关23/23、typecheck、Worker dry-run（920.69KiB）、源码/职责边界及diff通过。隔离浏览器真实文件读取与差异预览在桌面/390px移动目视通过（临时截图1790951184435、1790951184758）；实际mock确认只生成一项公开用途规则＋expectedVersion的Profile PUT，不带申请ID、不提交其他域。原浏览器受沙箱环境连接超时，诊断后原用户环境同一mock成功；不计作产品缺陷/真实家庭验收。Matched=本批导入写入闭环；Deviated/Extra=无；完整目标仍Missing=真实家庭导入/提醒及共享执行验收、旧站切换和生产启用。无部署、安装、migration或R2变动。

用途规则写入已进入实施：真实Profile路由配合内存SQLite验证家庭归属、expectedVersion、非法/重复目标、旧元数据保留、缺省不改、明确删除、重复不升版本及现有审计；仅外部鉴权和系统默认库为夹具。主页面实际候选函数验证未选不写、删除/新增及不导入申请身份。该路由回归加入既有Rest Weekly Cloud同一job并增加自身路径触发，不新建CI或运行平台测试；页面导入目视和最终兼容检查尚待完成。

三域页面批PR194精确4302284的四组适用CI全部通过，已合入master76527fd21392bd46b60599c3d98cdd7b471922cd，未部署。下一项实施清单：核对现有siteClassificationRequests的other记录语义；Profile配置入口仅接收经规范化的公开other匹配条件，保留家庭归属/expectedVersion/审计，不接受请求身份或任意用途类型；主页面构造选中用途规则差异的完整候选并解除已证实的显式导入阻断；聚焦验证缺省不改、显式删除、非法字段、跨家庭、条件冲突及迟到读取。原始网页统计/计时/更正/配额均不改，other仅消费已批准的未来归属规则，不顺带更正历史。仅相关Worker/Profile与配置域/页面测试、typecheck/dry-run/边界/diff，不跑平台/安装器。该项尚未实施，不把缺口登记为完成。

三域页面接入清单：①系统管理新增配置入口、旧按钮仅快捷跳转；②公共/网站使用schema2投影与域内差异写入；③应用内嵌canonical配置视图，只读取App Policy；④文件读取和确认绑定Child/域/版本/实例，离开时失效；⑤网站用途规则若现有API不接收则明确拒绝该项写入，不能静默“成功”。只修改主/canonical云端页面与本项测试文档；相关配置/组件/加载器测试、typecheck、边界/diff及桌面移动mock目视。不部署、不改终端、原账或migration。用途规则云端写入兼容继续列为Missing，必须后续补齐。

续验：配置域28/28和既有页面字段242/242通过。继续补旧文件缺省用途规则不产生删除项、同页多文件读取仅最新生效、通知异步响应只更新原孩子的条件保护；仍不修改通知写入语义或生产。组件夹具修正后的重新验证已通过，不再将旧失败状态作为当前结论。

桌面mock发现配置域复选框的inline display:flex覆盖hidden，公共域仍可见全局网站选项；仅配置宿主范围增加hidden优先级，不隐藏其他功能。配置域30/30、组件/加载器条件保护、现有字段242/242、typecheck/源码边界/diff通过；桌面移动目视继续进行，不等于真实家庭导入验收。

应用域接入前核查发现 canonical 导入未固定读取前的 Child/策略 ETag，刷新后会把旧预览提交到新版本。先修复文件读取前后/确认时的组件、Child/view/ETag 校验，预览留内存且写入期间拒绝重复确认；已有 DOM、文案和布局不变。最小验证为组件导入迟到/销毁/版本刷新/重复确认/条件写入回归、既有 App Policy 测试、语法及 diff，不运行平台/安装器/浏览器；此不代表三域页面挂载已完成。

组件夹具早先两次失败已停止并报告，修正嵌套querySelector后续验通过：文件迟到/销毁/ETag刷新/重复确认/内存草稿、configuration仅App Policy一项读取均覆盖。三域桌面/移动mock实际目视完成（临时截图1790950089704、1790950142341、1790950154135、1790950154294、1790950236747、1790950237019），无家庭数据，不称生产验收。30/30配置域、242/242旧字段、加载器与通知迟到条件保护、App Policy、typecheck、源码/职责边界及diff通过。Matched=本批三域入口/裁剪/条件预览/组件复用；Deviated/Extra=无；完整D-114的Missing仍含用途规则写入兼容、真实导入、两端提醒/执行与分阶段验收。PR193准备层已合入9131a64eb15e1c2e323e24de8294fb5ac9252f32；本批未部署。

配置三域准备批实施清单：①publicAccess/websites 文件投影与旧混合文件按域读取；②应用域继续委托 canonical App Policy，不复制配置源；③差异按域筛选（网页 onlineMinutes 不升为公共限额）；④预览 Child/版本/域/实例条件校验与仅已选字段写入封装；⑤污染字段、跨域/旧文件/版本失效、daily 同日兄弟字段保留固定回归。仅主 Pages 纯辅助逻辑与本项测试/设计，不修改 UI、Worker、终端或原账；本批运行新辅助测试、既有配置回归、语法/范围/diff，不跑平台/安装器/浏览器。页面挂载、网站 other 写入接口核对及桌面/移动目视仍为下一批 Missing。本批不部署或启用。

此准备模块直接属于主控制台，既有 Main Console CI 增加该 JS/测试路径及一个 node 聚焦命令，不使 Worker/Contracts/Native job 运行。28/28 新固定回归与既有配置242/242已通过；测试使用真实日期键 monday…sunday 和旧 bundle 类型，不以理想化新 schema 替代现有来源。Matched=文件边界/差异/条件封装准备；Deviated/Extra=无；Missing=三域实际页面接入、other 写入许可、真实导入和完整跨端验收。

当前精确进展：PR192已按7ceab64的五组适用CI全通过合入master d00a08acdd21408f34c7c1a7e768985d26171b5d。正式1.26包82747bytes/SHA256 a53d765f239d2f04d7c172c109f49ea2ae0db73689cbcea6d588da81074722c5已交两端验真接入。Native1.25本地提交b307748（未推送/安装），183/183及当前/上一版兼容通过，真实窗口/Host退出/锁屏仍未验收；两端1.26正在实际实施，不以定义协议代替消费者。

全目标核查另发现配置三域尚未收口：主页面仍导出schema1用户/全局网站混合bundle，用户配置把公共时间与网站对象混在一起；canonical应用schema3已排除公共时间但只有应用页入口。下一云端批次明确拆分综合访问、网站、应用的文件/预览/应用范围；保留旧文件兼容和全局系统网站权限/版本预检，旧文件必须先按所选域裁剪差异，不自动写另一域。公共时间只包含timeQuota/rest/autonomy/timeWindows；网站对象包含自定义列表/精确规则/其他用途规则/单站限制及网站通知，应用域复用canonical App Policy，不形成第二可写配置源。需补Child/context租约、条件写入与域内白名单回归及桌面/移动mock，未实施前保持Missing，不宣称六入口即全部配置完成。仍无部署/安装/migration/R2/执行启用。

下一项执行闭环清单：①明确浏览器执行目标与提醒呈现者是独立维度，Native不得结束Chrome；②Service仅在shared且执行开启、已可见解决、当前scope/版本/lease/activity仍有效时返回短期显式网页结束许可；③扩展按executionId先持久登记一次尝试，再仅对当前绑定页面执行正常关闭或强制结束，取消不升级强制；④严格执行回执、重复/旧活动/影子/撤销/失联共同回归；⑤兼容和两端交接。修改仅共享契约、现有设计/任务板/锁；最小测试为生命周期与新增执行向量、兼容/版本、typecheck/边界/diff，不跑平台或安装器。PR191仍等待确实在运行的Rest CI，后续提交不混入191，不安装部署或启用执行。

PR191全部适用CI通过并已合入14f5896036f172f0f3845eabd91b725c6b7f9cb9，1.25更正包78698bytes/SHA256 27115fe33c4ac585fda3468ec42c6835e41277b5f93ca77969210285ce64a403已通知两端可验真锁定。1.26显式网页许可/ACK本地完成：原授权起5秒且重送只减剩余期限，客户端从请求开始计时防延迟响应；原提醒/当前活动绑定，主动结束正常关闭、超时结束强制、ACK冲突拒绝。新增43共同向量及严格字段检查通过，原28+24逐字段不变；编译/类型/兼容/版本/源码职责边界/diff通过。Matched=本批契约；Deviated/Extra=无；Missing=两端消费者、真实网页和原生窗口闭环及正式启用，全目标仍未完成。无候选目录、安装、生产或migration/R2变动。

下一批架构契约实施清单：①严格浏览器活动消息与能力协商；②Service接收单调钟15秒租约、5秒续报、重复不续期/旧序列/冲突/旧连接拒绝；③当前解锁前台Chrome及实时Rest展示资格，activity变更撤回旧提醒；④共同向量/兼容/typecheck/边界/diff；⑤两端按固定包交接，默认关闭，不改原账不安装发布。所有原始网页活动语义保持不变，只报告事实；不把累计/健康读数作为当前活动。现有云端UI PR190等待CI，不混入本契约提交。

PR190已合入master dc4f556；精确UI提交fbea0c8的Console/主入口/Rest/Task四组CI通过，契约Worker job按范围跳过，未部署。1.25.0活动规范已本地编译：原28生命周期向量保持逐字段不变、新24活动向量和严格隐私/整数/重复过期检查通过，兼容、类型和源码边界通过。架构范围精确例外仅docs/DESIGN.md（跨端协议设计）和package-lock.json（workspace版本锁）；不取得云端/控件实现修改权。Matched=本批活动契约规范；Deviated/Extra=无；Missing=消费者实现及实际可见/断连/前台验证，默认关闭。初次编译因沙箱拒绝写D盘dist未通过，获准本地构建后成功；不将旧dist的失败测试计为通过。

PR191首次CI发现machine-control.vectors.json的contractVersion元数据仍是1.24.0，与package1.25.0不一致，版本回归拒绝。补齐该夹具包版本元数据并运行对应回归后重发固定候选；先前78702bytes包仅失败候选，不作为通过交接锁，消费者收到更正后再锁新SHA。消息/schema/黄金用例不变，不绕过CI。

系统页面实施清单：①主系统管理新增“应用运行诊断”面板，原七面板不删不移；②canonical system首读机器/账户、技术目录和远程日志，不等待应用策略或用量；③主/媒体诊断使用裁剪资源；④孩子、主导航及系统子面板切换销毁实例，迟到响应隔离；⑤相关组件/加载器测试及桌面/移动mock目视。允许pages与Runtime console、本任务根测试精确例外；不改统计、终端或生产。诊断接口PR189已合入7136e0f，未部署。移动目视发现旧table-row样式隐藏第二列应用名称，仅在主账/媒体诊断恢复名称可见并换行，不改其他表格。

本批核验：组件系统依赖/局部失败/迟到错误销毁、加载器、主发布资源隔离、配置242/242、Runtime集成、TypeScript、源码边界/职责/diff通过。隔离mock浏览器核对系统日志、主/媒体诊断及50条提示、健康摘要、两个孩子切换、退出系统子面板清空根和设备导航；桌面1280px与移动390px截图已目视，移动名称可见且scrollWidth=390。错误等待曾把内部选择器index误当Child ID、把class误当id，已按实际DOM取证，不计为产品通过；追加迟到回归初始文案断言改为前后相等。Matched=本批主系统挂载/诊断/隔离；Deviated/Extra=无；完整D-114仍Missing=浏览器实时提醒证明、两端实机与启用验收、旧站切换和线上主功能验收。无部署/安装/migration/R2。

PR #188 已合入 master `8882a9a`；4259a6e 的五组相关 CI 全部通过，未部署。继续系统管理整合：先补只读 `segment-diagnostics`，沿原账户/Child授权和有界账本查询，仅返回时间、展示名称、时长、历史分类或媒体属性；不返回 Segment/机器/账户/技术身份及原始游标。之后主系统页挂载 canonical 诊断面板，保留原网页系统功能。职责 standard-cloud；本批先运行 Runtime API 聚焦回归、Guardian网关回归、两侧typecheck、边界/diff；不跑平台、安装器、全量账本测试，不改账、不部署。页面实现另补组件和目视证据后才提交。

该只读资源已实现：聚焦Runtime3/3、Guardian网关10/10、两侧typecheck、Runtime dry-run、源码边界及diff通过。非零真实结构夹具暴露displayName回退技术身份，响应已置null并过滤路径样式，原账和旧接口不变。重复查询字段/原始游标拒绝、主账与媒体显式字段裁剪、hasMore有界及账户/Child隔离有证据。Matched=本批云端诊断通道；Deviated/Extra=无；完整目标Missing仍含系统面板挂载、旧站切换、浏览器实时提醒证据和两端实机/启用验收。无生产操作。

PR #188 CI：Console 和 Guardian/主入口通过，源码边界检查准确拒绝了 visual fixture 反向导入根 tools。修正生成器归属到 canonical Runtime console，主发布工具及根测试从该模块消费；不修改边界检查规则，不将测试代码列入豁免。重新跑该检查和受影响加载器/构建回归后推送同一PR，既有目视证据不因单纯生成器路径移动失效。

下一批为主控制台发布资源构建：从 canonical Runtime console 显式列出的管理依赖生成 `/runtime-management-component/` 与模板清单，禁止复制独立 index、Session/bootstrap 或恢复 `/app-runtime/` 静态子站。模板去除脚本/样式外链，由后续同源加载器注入；保留原产品/账户/配对面板，不维护第二份源码。聚焦验证资源白名单、源码不变、输出禁止覆盖、symlink拒绝和Task发布隔离；工具及测试路径为本任务精确例外，不触发平台测试，不部署。

主导航挂载：新增同源组件加载器，主控制台 apps/devices 按当前 Child 注入 Guardian 管理网关，条件写入保留 If-Match。父页面负责身份/孩子/导航，组件只负责本面板。切换立即销毁，资源加载和旧请求以 epoch 失效，失败原地重试；聚焦加载器回归、导航结构及桌面/移动 mock 目视，不改网页统计或身份鉴权语义。

本批本地证据：发布资源隔离、加载器/同宿主样式迟到竞态、Runtime 集成、Pages 配置242/242、脚本语法/diff通过；原导航回归更新为已批准的六入口同页语义。主控制台真实浏览器 mock 验证设备列表、应用面板、Child切换、390px/1280px布局及单一导航/选择器；内部 main scrollWidth=clientWidth，无横向溢出。首次夹具漏放数字CSS和SVG MIME导致载入失败已定位修正，未改生产网络。只读 mock 未核验真实账户写入。Matched=本批资源及主挂载；Deviated/Extra=无；Missing=线上整合验收、系统诊断迁入、旧子站切换、浏览器实时提醒证据及两端执行，完整D-114继续。CI仅增加同一Console job两项聚焦命令。

主控制台挂载适配：将 canonical Runtime 控制器开放为 mount(root/request/children/childId/view/isCurrent)，嵌入时使用主控制台的鉴权和 Child，不创建 RuntimeSession、不跳 SSO、不显示第二导航/孩子选择。独立页面保留原自动启动。DOM、监听器和定时器限定组件生命周期，切换视图/Child及销毁后旧响应无效；先完成控制器适配与聚焦测试，再接入主控制台模板/发布构建和真实浏览器目视，不能以控制器存在冒称界面已整合。本批不改鉴权、配额、原账、安装或生产。

同批补齐知识面板分类选择中的 `other`（界面文案“其他”），现有 schema/云端能力不变；不修改分类解析规则或历史更正。浏览器目视只用隔离 mock，真实设备与完整主控制台尚未验收。

控制器复核同时把共享配置 promise 纳入同一并行等待，避免 Child 切换后的租约拒绝成为未处理错误；导出元素使用组件 ownerDocument。补充应用视图销毁时所有并行请求失败的回归，仍不改变服务器写入或配置语义。

本批结果：组件 mount/租约/销毁、知识面板、网络9/9、用量回归及语法/diff/职责检查通过。隔离浏览器实际 ShadowRoot 注入设备接口，桌面列表与390px账户详情目视通过；仅两条机器/账户读取，无第二次登录。该证据是 canonical 组件 mock，不是完整主控制台或生产验收。CI 仅在既有 Console job 增加一个组件测试命令（精确路径例外 `.github/workflows/app-runtime.yml`）。Matched=组件控制器；Deviated/Extra=无；主控制台资源构建与导航挂载仍未完成，继续下一批。

主控制台组件隔离批：canonical 产品知识组件增加可注入 DOM root、监听器销毁与 Child/contextRevision 请求租约；默认独立页面行为保留。组件只查询、监听和关闭自身根节点内元素，切换孩子或销毁后迟到读写响应不更新界面、不执行后续保存；已送达服务器的写操作不冒称取消。仅组件生命周期、上下文隔离和既有产品知识聚焦测试及语法/diff检查，不改布局、分类、鉴权、原账或配额；主控制台完整挂载仍待后续实现，不部署。

本批证据：既有产品知识测试及新增 root/Child/revision/dispose/迟到读取/写后切换/迟到文件读取/独立 document 兼容固定回归通过；JS 语法、standard-cloud 精确 diff 范围检查、git diff --check 通过。无 HTML/CSS 或布局修改，本批不以假 DOM 测试冒称主控制台实际展示通过。Matched=组件隔离准备；Deviated/Extra=无；全目标 Missing=完整主控制台挂载、浏览器呈现签发证据、两端实际提醒与共享执行及生产验收，持续实施。

调用顺序复核：独立页在登录前 mount、登录后才设置 Child，初始固定空 Child 会错误拒绝首次操作；改为首次租约绑定，Child 切换时销毁并重建知识组件，并补空 Child 初始化回归。此为本批兼容要求纠错，不放宽迟到响应保护，不改原账或产品分类。

主控制台整合接入批：先新增 Guardian `/app-runtime/manage/v1/*` 受限管理网关，复用现有家长鉴权、家庭子用户投影、短期模块 JWT 和 APP_RUNTIME_SERVICE；token 仅留 Worker 内，不交给浏览器，不新增身份系统或公共 Runtime CORS。固定资源／方法白名单，禁止机器上传、身份生命周期和任意 URL 代理；请求与响应流式转发，保留 ETag／If-Match，错误不暴露内部凭据。随后主控制台复用 canonical 管理组件接入，不能用 iframe 或恢复旧静态子站副本代替整合。本批测试等级为鉴权／管理接口，最小验证为网关授权、路径／方法拒绝、条件写入、上游失败隔离、相关 Guardian 集成和 typecheck／diff；排除平台、安装器和网页账本测试。没有部署、migration、安装或共享执行启用。

本批本地证据：网关9/9聚焦回归、既有 Runtime 集成、共享配置 owner 路由、Guardian typecheck 与 diff 通过；Wrangler4.127.1 dry-run 已输出构建与既有 binding 清单，未部署。JWT测试实际执行现有HMAC家长鉴权和ES256内部签发／验签，缺失、过期、伪造认证均不访问DB/Runtime；覆盖限定路径、重复查询拒绝、流式对象写入、条件版本冲突、上游失败及重定向/私密响应头过滤。初次测试失败因VM二进制对象跨realm的instanceof不一致，仅补测试沙箱原生ArrayBuffer/Uint8Array后通过，运行时鉴权未放宽。最新types下载未完成，使用已安装4.20260702.1核对Fetcher签名并typecheck；未改依赖或绑定。Matched=本批通道与签发器语义补齐；Deviated/Extra=无；全目标Missing=主控制台组件接入、实际提醒链路、真实设备及分阶段上线，不能称完整交付。CI仅在既有Guardian集成job加这一个回归命令。

生命周期契约批：两端事实核查证明当前只有结果审计，没有产品提醒签发、可见ACK或正常关闭调用者。补齐1.24.0只读轮询、可见/失败ACK、主动操作与Service超时转换；shadow无关闭效果，用户/assignment由认证上下文绑定。仅契约/schema/黄金向量/文档与相关CI，不改两端实现、原账或生产；两端接入后仍须真实提醒与执行验收。

控件整合批：来源 `8a3ba2c`，只提取已验证的七个扩展／测试文件及对应设计说明；旧混合分支的云端实现由 PR #179 的主线结果替代，不重复导入。复用已授权 `codex/d114-integration`，不新建分支／工作树。验证原文件字节一致、1.23.1 同包消费向量、相关通信／Rest／重试测试与 CI；原候选路径和未提交 TASK_BOARD 保留。真实签发／可见生命周期、统一入口及执行验收继续待办。

契约消费纠错：Native 验真发现 1.23.0 的周状态 JSON schema 缺少 TypeScript／云端已返回的 `toDate/complete/reasonCodes`，严格消费者会拒绝合法响应。保留旧包但暂停消费，修复为 1.23.1；不删字段或放宽额外字段验证。变更仅契约/schema/版本与回归，运行契约 build、兼容及黄金向量、typecheck、范围检查和 diff；不运行无关平台测试、不部署。两端须验证新的固定包后才登记已消费。

最新收口（2026-10-02）：PR #180 当天解绑后已有网页贡献保留、PR #181 Child 级电脑汇总修订、PR #182 Bridge 影子契约 1.23.0 均已通过对应 CI 并合入，最新 `origin/master=2e55fe038628b969cf80cafa1d518558c9865a35`。电脑汇总仅网页＋应用－Chrome 边际贡献，不依赖设备对应、不跨设备并集；两套页面桌面／移动 mock 目视和聚焦验证通过，不是生产验收。契约包 70592 bytes、SHA-256 `783b2c2cc07b992178a9286a81fdb3d4ab2809182dd3916bb95be25ad7f10340` 已交付扩展与 Windows Native 验真消费，两端实际实现／测试仍在继续；Native 查询和提醒结果能力此前缺失已证实，不能以协议定义替代运行能力。新查询的 `ok=true` 只表示读取成功，`sharedQuotaStage=shadow`，不许可执行；提醒须绑定 Service 已签发与可见记录。所有生产部署、0014/0015、终端安装、真实跨端提醒及共享执行仍未完成／未启用；P1 与 Mac 延后项不变。复用已有临时集成分支，无新分支／工作树。

- 已批准产品口径：Child 唯一公共时间配置；主控制台整合六入口；网站／应用独立对象配置；`other` 明确分类；电脑总量为网页＋应用－已包含的 Chrome 边际贡献；共享配额另按两端贡献累计。主动结束仅请求关闭、超时结束可强制，提醒实际显示后才倒计时。
- 2026-10-02 更新：集成 PR #177 已合并，master merge commit `016e9b467c8bac2b19f85260c8d4241470b3f17e`，精确 head `0e10926adddda75b73eacacbd8bc2527a5793fea` 的适用 CI 全部通过；尚未部署或执行 migration，shared execution 仍关闭。机器认证只读 `SharedQuotaStateV1` 已接入：Runtime 从有效受保护 assignment 推导 Child 并代理 Guardian 投影，不接受请求传入的 Child ID；完整性不足原样返回，不驱动执行。聚焦测试通过，待提交/CI；生产部署和两端真实消费验收仍未完成。
- 归属：本会话维护契约／云端；扩展和 Native 由各自固定会话实施。复用现有分支与工作树，先文档与契约、再云端读模型／配置、再两端消费／影子核对，最后真实设备验收与按孩子启用。当前未启用共享执行，不能将文档和局部代码称为完整交付。
- 本轮云端聚焦检查：电脑汇总 Chrome 边际贡献、来源失败、跨电脑、`other` 分类和版本分页；配置单一来源及旧客户端兼容；相关 typecheck／dry-run／页面目视。网页账本语义如需变动，另按 D-076 单项批准。P1 `COMPUTER_USAGE_UNAVAILABLE` 仍独立待定位，不因 D-114 自动关闭。
- D-114 本批云端接口收口：为 Worker V2 设备日账接收补齐 `quotaBucket=other` 兼容，并让网站分类审批 API 接受显式 `other` 决策；运行模式仍拒绝 `other`。本项仅允许分类/非扣费桶归属，不更改网页路由或落账边界。
- D-114 云端子项已实现网站归类记录的“其他时间”操作；Worker 将其单独保存为 `siteUsageClassificationRulesV1`，不会写访问策略。控件消费已交给固定扩展会话实施；两端尚未整合或部署，Native 侧不在此子项范围。
- D-114 云端实施进度：Runtime 管理 API 已接入 Guardian 统一配置只读路由；公共配额／时间段写入返回稳定 409，应用分类与单应用限制仍可保存；应用配置导出 schema v3 不再带孩子级公共配置，导入旧 v1/v2 时也不应用其公共字段。控制台按周展示共享配额与时段只读摘要，公共配置读取失败不阻塞其他应用管理。Worker／Console 聚焦测试、typecheck、dry-run 及 D-087 桌面／移动目视验证通过；提交 `4e748f6` 已合入临时整合分支，尚未合入 master 或部署。
- D-114 云端导航子项：主控制台固定展示使用统计、访问管理、网站管理、应用管理、设备管理、系统管理六个入口；应用与设备入口通过既有 Guardian SSO 打开 Runtime Pages 并保留当前 Child 选择；网站归类记录从独立主导航移入网站管理的次级入口。子用户管理等现有功能保留在系统管理/更多入口。聚焦导航／SSO 测试及桌面／移动视觉检查通过；“更多”菜单重复 Native Apps 项已修正。不得改网页计时、账本、分类审批语义。提交 `4e748f6` 已进入临时整合分支；未合入 master、未部署。
- 跨线集成门禁发现：PR #177 的初次 `changes` 因仓库原检查器不支持验证已合入源提交而失败；并非产品测试失败。为遵守各工作线所有权且不绕过路径检查，补充受限的`Integration-Source`证明：仅真实 merge 父提交所带入的文件可由架构集成 PR 跨线承载。PR 最新 head `43629b3` 的复跑 CI run `36978369502` 中，`contracts-worker` 首次因两个 5 秒测试超时失败；仅重跑失败 job 后 contracts、Worker 测试、typecheck、dry-run 与最终 gate 全部通过，未改代码。
- D-114 CI 暴露的 Worker 兼容用例仍通过应用策略写入孩子级配额／时间段，违反已实现的 Guardian 单一写入源；另有 Guardian service-binding 测试桩不符合新只读响应 schema。只更新相应测试语义与夹具，不放宽运行时代码的 409 所有权保护。
- D-114 云端只读影子首版已提交到临时整合 PR #177（`d471430`，周状态边界修订随后单独提交）：Runtime binding 按 Child/日期检查有效受保护账户的收据、验证头、发布 manifest 与版本；Guardian 新增 owner-scoped `GET /profiles/:id/shared-access-state/v1`，返回网页／应用来源覆盖、有效来源值、原因码及不可用于执行的共享日影子，并按北京时间周一至所选日期汇总周 Rest 使用／剩余；周值来自持久日投影，不查询所选日期之后的未来日，也不扫描原始 Segment，任一天不完整则周不完整。旧日聚合仅 best-effort；来源缺失不伪装成零。Guardian 路由/投影测试、Runtime application-account 聚焦测试（20 项）、两端 TypeScript 与 `git diff --check` 已通过。PR 最新 CI 正在执行；Wrangler dry-run 因其尝试写入受保护工作树的 `.wrangler`/用户日志路径而未通过，未改动该目录，相关 dry-run 仍待 CI 证据。持久缓存、UI 消费、PR 合并、部署或共享配额启用仍未完成；无 migration 执行。
- 控件 D-114 “其他”用途归类消费提交 `f14d8678d8852f1a481198c8df8e7ab36f11794` 已包含在临时整合分支 `codex/d114-integration`（本地与远端 `e7e17a9`）历史中，仅作用于新目标归属，不改网页计时边界；所属会话的专项测试、类型、扩展根检查均通过。固定远端 `codex/extension-local` 仍为 `dd92791`，不是 `f14d867` 的祖先；不强推、不重写历史，也不重复建分支。该代码由整合 PR #177 一并评审；独立控件 PR 仍未包含此提交。未部署、未安装、未切换加载目录。
- 同轮兼容测试还发现：旧客户端原样回写读取到的共享字段时，属性顺序不同会触发错误 409。修复为按规范化字段值比较，变更共享设置仍拒绝；保留旧分类字段更新兼容。

## NOW：统一访问管理终端适配（D-114，控件工作线）

固定扩展分支 `codex/extension-local` 消费云端 1.22.0 契约。网页分类“其他”只影响未来获准的新记录归属，不改变计时边界；共享配额和跨端提醒目前仅有只读／影子适配，不启用执行。控件 PR #175 已打开且 App Runtime CI gate 成功；控件精确分支头 `dd92791` 与云端已验证提交已合入临时整合分支 `codex/d114-integration`。云端 `other` Worker 聚焦测试和控件适配回归在合并结果上通过；Native 能力及真实端到端验收仍缺。本任务不修改 Native，不构建、安装或发布。

## NEXT：P1 电脑应用使用统计反复不可用（2026-10-02，PO明确延后处理）

- 状态：已登记／待后续处理，未修复、未关闭；所属工作线standard-cloud。本轮停止排查，不修改代码或部署。
- 症状：打开独立“电脑应用管理”时反复出现“使用统计暂不可用／其他统计和设备管理不受影响”，错误码`COMPUTER_USAGE_UNAVAILABLE`；用户确认不是单次故障。
- 已知证据：最近一次真实登录复验中电脑、网页和媒体请求恢复HTTP200，但未捕获原失败请求，根因未定位。另见`APPLICATION_STATISTICS_MANAGEMENT_PENDING`，后台更正统计更新后应用读取恢复；不能将这一不同错误认定为原泛化报错根因。
- 相关性能遗留：电脑汇总真实读取仍约8–10秒，应用读取一次约1.5秒；未完成汇总性能验收。
- 后续处理：优先捕获同一次真实失败请求的接口、日期范围、HTTP状态、脱敏稳定错误及关联日志，沿该请求定位；不广泛轮询、不以反复部署替代根因调查。
- 关闭条件：有可复现原因及对应修复证据；真实登录覆盖首次打开、刷新和连续读取，不再反复不可用；保留来源故障隔离，原账、统计口径与配额不变。当前没有原账错误证据；若后续发现影响落账或统计准确性，按网页落账硬闸门升级P0，不沿用本P1定级掩盖风险。

## NOW：电脑使用汇总读取性能（2026-10-02，PO批准优化并部署）

2026-10-02真实登录报错复核：用户报告独立Runtime页面显示COMPUTER_USAGE_UNAVAILABLE。已核对已部署Worker绑定及版本，并通过现有Chrome登录页真实读取；电脑汇总和网页/媒体请求均HTTP200，未重现该泛化错误，不能据此宣称其根因已经修复。实际应用页另返回APPLICATION_STATISTICS_MANAGEMENT_PENDING；只读查明本周三天持久化统计仍引用旧策略版本，正常后台重建后队列清空，重试应用请求HTTP200、约1525ms，实际图表及排行恢复。电脑汇总首次实测约8418ms，不能宣称秒开。诊断不修改原账/配额，不新建分支/工作树、不追加部署或migration；本次只补真实验收记录，不凭猜测修改业务代码。原泛化报错保留为未定位的间歇故障，若复发需捕获同次请求响应，不得把上述不同错误当作其根因。

末次真实电脑汇总请求HTTP200、约9917ms，已同时显示非零网页与应用用量及分类，未再出现整页统计错误；精确去重总量仍按原设计显示不可用。不把这次恢复记作性能验收通过：真实冷读仍约8–10秒，需继续优化；应用页本次1.5秒读取通过不代表汇总已经快速。

职责standard-cloud；复用固定分支/目录，不新建分支或worktree。按顺序实施：①Guardian网页/应用来源及版本核对并行；②按完整来源指纹缓存已合并结果与轻量summary，缓存命中不重读区间/重算产品；③两套云端页面复用30秒有界内存缓存，同请求single-flight，手动刷新绕过；④聚焦回归、typecheck、dry-run、范围和diff；⑤PR合入已验证master，发布实际修改的Guardian/Runtime Worker及两套Pages，真实登录固定范围对照数值与耗时。首次生成仍用原证据与合并器，不删去Chrome排除/重叠校验；版本变化、读取异常不能返回旧代完整结果。时间线按需返回，分页锁定同一revision。原账、统计口径、更正、配额、Native/扩展、D1 schema和R2均不变。不跑Windows/Mac/WiX或网页计时全量测试。

实施及本地验证完成：Guardian汇总回归、双页面renderer/cache回归PASS；Runtime computer-usage-evidence 14/14；两端typecheck、两端Wrangler dry-run、源码边界、standard-cloud路径检查及diff检查PASS。审计Matched：并行、独立summary/details生成缓存、30秒有界页面缓存、版本失效、失败隔离、手动刷新、统计数值不变；代码Deviated/Missing/Extra无。待PR/主线CI与生产发布；当前浏览器连接未提供已登录家长页面，真实页面数值及冷/热耗时验收待实测，不用单测替代。

2026-10-02已上线：PR #172合入master=61022840ba4ce8f815efb7a7b5a62554b4d00de4；精确SHA的Runtime/Guardian/MainConsole CI分别36900027439/36900031253/36900036342 SUCCESS；生产36900209020 SUCCESS。Guardian version605366c6-5556-4f33-8ad7-fbc090f061b5，Runtime versionce0356bf-6e60-4d6b-9a02-0058c47d0f64；Runtime Pages c495b61b-83a4-4d7c-8b02-b827b48dffe0、Main Pages 58b7b852-a1a6-42a3-8c6f-15f7b87eb42f。线上两套computer-usage-view.js与发布源码规范化SHA256一致（e6b7a8445d9d8b946b0bc1001c97f8a6c1c468ecd67725c064adc18945c6c197），Runtime controller也一致；health200/未认证401 PASS。manifest artifact11181078876；migration仅检查，无待执行，apply=false；R2 latest仍2.3.1，无安装/账本操作。真实浏览器连接无可用已登录家长页，自动连接Chrome也未发现调试实例；真实家庭固定范围读数及冷/热耗时保留待验收，不能宣称秒开。此后仅文档收口，不重复部署产品。

## NOW：网页／应用同构持久化统计（D-113，2026-10-01）

21:05历史页面末次复验：9/27机器/Windows读取HTTP200、1348ms、producer=native、stale=false、policy159、总量36,728,619ms；图表和明细实际显示，已解除21:03所记首次stale状态。9/25–27三日页面均采用对应Native权威总量，不能继续说只完成receipt、还未验证页面。今天缺策略事实和Mac仍独立待办。

21:03 云端本批收口：PR #168/#169/#170合入；最后master=3cfdab2ddcb1b02bf32de40d0378e475b2ef1b8b，精确主线CI36865363441 SUCCESS，受保护发布36865525544 SUCCESS，仅Runtime Worker，version=7e96de49-92bc-409d-aaba-3e4c5a88d200，manifest artifact11163670827／ZIP SHA256=749357a240be61b493cf5ee47a715611e3bd91f0df59d7c0728e54245e88008c。health/未认证401通过；migration步骤只读检查，无待执行，apply=false；本批未安装或主动部署Pages/Guardian/R2。

真实性能与结果：同一9/30机器/Windows筛选，修改前强制读取5003/5479ms，锚点优化后2017ms、显式刷新1837ms；后者HTTP200、producer=native、stale=false、总量26,914,118ms。总量、分类、应用、小时及媒体字段与固定基线逐项完全相同。数据库锚点单查询810.58→62.00ms、24条锚点与原source hash不变；不将页面读取称为人为清缓存后的冷读，也不宣称所有范围秒开。

Native 2.6.15 本机安装由Native会话完成，本会话只读云端验收：9/25–27非零receipt与publication均rev7/7/7、错误null、最新关联；事实数399/499/694，已发布总量22,480,192／28,401,544／36,728,619ms。对应默认日及机器/Windows日物化均native；真实页面三日HTTP200、总量完全一致，9/25/26读取无stale，9/27首次响应仍stale随后物化，不能把该首次读取说成无过期。9/28–30非零新统计此前已验收，9/30最新策略159已实际读取。某次9/30后台换代短暂返回legacy-server，36ms差异已准确记录；新版本自动物化后恢复Native值，不用旧值填平。

审计：Matched=云端精确核对/历史独立投影、六个历史日期非零业务发布、真实页面、读取优化及限定发布；Deviated/Extra=无（本批范围）。Missing=10/1既有事实POLICY_HISTORY_MISSING的Native处理与该日完整闭环；Mac D-113继续延后，整体D-113不标完成。向Native回传最新页面摘要的一次消息被安全审查拒绝，未换通道绕过；不阻挡本会话继续云端验证，未在Mac交接Issue写家庭用量。

锚点续修本地验收：18项统计＋20项发布回归38/38、typecheck、dry-run、边界及diff通过。固定回归验证旧Child历史仍可选为同用户稳定锚点、monotonic相同时按id选择、异常候选排除、无候选lane保留NULL及完整主键join。生产只读执行新SQL：同24条锚点、原publication source hash完全一致，锚点耗时由810.58ms降为62.00ms；计划显示历史候选只物化一次，临时自动索引覆盖machine/user/session/epoch，不建立持久索引。提交前Matched=同锚点/同hash与数据库性能证据；Deviated/Extra无；Missing=本补丁主线CI、Worker-only发布与完整真实请求耗时。PR #169/master3318084已发布Worker e8c4b652-88f0-42f3-89ee-037d9c851b2b，但只减排队往返仍5010ms，不冒报性能改善。

20:54 主要瓶颈只读证据：生产执行同一六查询，普通事实水位4.55ms、锚点810.58ms；EXPLAIN证明每个lane的相关子查询仅按machine/user主键反复扫描用户历史，再临时排序。当前publication source hash与核对器实时hash一致，未放宽来源检查。将符合原锚点条件的同用户候选先物化一次，再按原session/epoch及monotonic/id顺序选取；保留跨日历史、空锚点、NULL、排序及原hash。聚焦回归与生产只读前后查询对照通过后继续同旁路PR及Worker-only发布；不建索引/migration，不触及Native/原账/配额。前两次减往返发布仍约5秒，不记为性能解决。

排队往返续修本地结果：17项统计＋20项发布回归37/37、typecheck、dry-run、边界／四文件职责和diff通过。固定测试证明七天缺失任务按7项提交、31天按7/7/7/7/3提交，重复source保留attempts/retry/error，变化source重置，失败批次回滚且不返回成功。测试中的邻日失效仍按原2秒水位余量，未缩小失效范围。提交前审计Matched=有界派生任务写入与原统计/失效结果；Deviated/Extra=无，Missing=此续修PR/主线CI/发布/真实性能对照，整体Native待办不变。

20:38 性能续验：PR #168/master 8bde717、主线 CI 36862292536、Worker-only 发布36862655287成功，version=0212249e-651d-4856-9593-11585834da68；manifest artifact11162825958。固定9/30真实读取由发布前5003ms到发布后5474/4922ms，无明显提速；总量26,914,118ms、分类、应用、小时及媒体字段逐项不变，producer=native。revision因整周其他日期更新而变化，仍stale，不伪报完整收口。继续最小性能修复：当前stale请求逐日期执行队列upsert；将相同SQL按最多七项batch写入，保持条件更新、幂等、重试与失败行为。只修改应用读取的派生任务排队，不触及原账、配额或Native；补齐一次调用及原队列状态回归后按原授权仅发布Worker。

云端继续项（读取性能，standard-cloud）：一天查询同时核对完整配额周，目前每个日期各做一次五语句batch及一次发布头查询，形成重复D1往返。只合并同一已鉴权家庭／孩子／筛选请求内的版本核对：每批最多七个日期／42条只读语句，保持原SQL、排序、来源hash、稳定锚点、迟到数据失效与policy校验不变；不用TTL跳过新鲜度检查，不改统计／配额／原账，也不等待Native补发。实施顺序为文档→批量核对→固定回归→最小验证→已有旁路提交和PR。验证限定application-statistics及受影响发布测试、typecheck、dry-run、职责与diff；CI只Contracts/Worker，发布只Runtime Worker及真实请求数值/版本/耗时smoke，其他资源和平台排除。不创建分支／树，不执行migration或安装。

本地性能补丁：16项统计＋20项发布回归共36/36、typecheck、Wrangler dry-run、边界与diff通过。固定证明旧五head／发布头hash不变，日读取source batch=42条＋persisted读取7条，部分日不与整日scope混合，31天范围按42条上限分批；迟到配额周事实仍使读取stale。首次新增长范围夹具留下39项测试队列，导致后续5000事实用例被无关队列挤占；只清理该测试fixture自己的队列后复验通过，生产调度未改。生产单日事实水位SELECT仅10.90ms但扫描11,876行；批量改动不宣称消除原账水位扫描，真实请求耗时仍需部署后核实。Matched=有界往返合并与原结果/失效不变，Deviated/Extra=无；本轮Missing=主线CI、限定发布及真实耗时对照，整体剩余Native与其他日期未验收项照旧。

2026-10-01 20:13 实机续验：20:06轮真实Native上传已由只读tail证明capabilities、begin、status、chunks、commit均HTTP200；9/28 rev8、9/29 rev9、9/30 rev9采用ee3b关联并已业务发布，逐维度／rowsHash核验通过。三日Native总量分别26,755,481／38,255,219／26,914,118ms；9/30 manifestHash=53d0e3d916162a5595a3dcb60f0744a564079e75f5e5a00c58ef8a8540f2ec88，与本机head完全一致。真实登录页面9/29两次响应HTTP200、producer=native、stale=false、productStatisticsComplete=true、总量38,255,219ms及revision一致；9/30真实页面响应同样native/完整/非stale，总量26,914,118ms，图表和明细正常加载。请求到响应头约4.210／4.454秒，9/30约3.987秒，功能读取已通但性能仍需后续优化，不标为快速读取验收通过。未人为清空缓存，故不将这些读数称为独立冷缓存性能测试。9/25–27仍是旧关联receipt、未发布；10/1本机POLICY_HISTORY_MISSING未解决，整体D-113保持未完成。

已查明队列延迟机制：其他匿名来源未来日期10/2–4的清单排在真实来源之前，上传单项失败返回false使每5分钟一轮提前break；已有时间线和成功传输证明循环不是停止。契约要求generatedAtMs不早于该日期起点，未来清单在10/1生成必不满足；不放宽契约接受虚构未来统计。后续Native负责核查并修复未来日进入outbox和单项失败阻挡其他来源的调度问题，另核对今天缺少的策略历史。本轮仅只读定位和记录，未改Native、凭据、ACL、服务、原账、配额或再次部署；不把未取得的HTTP错误正文或剩余队列状态写为已证实。

2026-10-01 只读队列核对续报：用户已实际批准 UAC，Native 已成功读取受保护 SQLite/policy；之前“待授权、无法读取”的状态已解除。Windows 策略161/161，最新关联ee3b；目标非零来源9/25–9/30本机head分别为rev7/7/7/8/9/9，complete=true、parity=MATCHED、dirty=0，对应outbox仍pending、attempts=0、nextAttempt=0、lastError=null。因此已证实新清单已持久化且尚未尝试上传，不再笼统解释为等待补发。10/1本机head另有POLICY_HISTORY_MISSING，不能记为完整可发布。19:54云端核对任务仍执行，七张能力依赖表均存在；云端非零receipt仍是旧关联版本、publication未建立。继续由Native只读核对全局最老due项、能力／上传循环和缺少的策略历史；精确根因及新统计页面验收仍未完成，不改原账／配额、不重装、不重复部署。

19:45 最新实际结果：9/25–10/1 的七条非零 receipt 均匹配当前受保护 machine/user/assignment/child，目标孩子匹配7/7，不是旧分配或其他用户。云端最新孩子 policy157 的关联版本与真实 Native Host 七天结果一致；但已接收非零清单仍未全部采用最新版本，七条发布头均未建立、错误 APPLICATION_ACCOUNT_ASSOCIATIONS_PENDING。9/25–29 虽有新revision接收，不能推断剩余补发必然完成或仅需等待。真实页面固定9/30 Windows读取仍返回 HTTP503/APPLICATION_STATISTICS_PENDING，冷/热及新统计页面验收失败/未完成，不以legacy-server或零快照代替通过。Native 当前只读UAC尚未获答复且前一次被取消，受保护 application-account dirty/outbox/ACK 无法核实；不重复弹UAC、不改ACL、不改本机、不放宽发布核验。需要完成该项系统只读访问才能继续定位本机自动补发缺口，D-113保持未完成。

2026-10-01 19:40 发布与验收中间证据：PR #164/#165 已合入 master@adcd2393cab32ae16eeb7931c58c72b3e263922c；主线 CI 36855429922 SUCCESS，Worker 161/161（新增锚点计划回归）、typecheck/dry-run/范围检查通过；仅 Runtime Worker 发布 36855591047 SUCCESS，version=20257a3d-30b8-45cf-995e-6bed7ba5b2c6，manifest artifact=11157917568，ZIP digest=960b41683003c40e9f0033799aee14587bf8646a6f3e921dee480533794339ea。health=200、未认证 catalog=401，migration 只读检查无待执行项、apply=false；Pages/Guardian/D1 schema/R2/Native/扩展未修改。生产 SQL 查询计划已确认完整主键关联，24/24 锚点齐全；历史 wixstdba 独立未确认投影为1，未按名称合并或加入目录。9/25–9/30 的固定历史 raw count、monotonic sum、最早/最晚上报水位均与发布前完全一致。Service 已自动应用新策略，本机当前用户七天统计完整非零；云端非零9/25–29已收到新revision，但最新关联清单尚未全部补齐，仍拒绝发布，Native producer未实机验收。真实登录页面已可控制；固定9/30 Windows筛选的首次读取返回后台生成中，不记为性能或新统计通过。Native只读队列核对因受保护SQLite ACL及上次UAC取消尚未完成，不改ACL或假报队列为空。审计：Matched=云端实现、聚焦验证、限定发布、历史独立投影与原账摘要不变；Deviated/Extra=无；Missing=全部最新非零清单的业务发布、持久化逐维度对照、实际新统计页面及冷/热读取。继续验收，不能标记D-113完成。

PR #164 已合入并仅发布 Runtime Worker；实机继续核对发现锚点水位查询的关联缺少完整主键，导致 SQLite 在每条候选记录上重复求锚点并触发 CPU 上限。仅将每个 lane 的锚点 ID 先物化、再按 machine/user/id 完整主键读取，保持来源版本内容和统计语义不变；补查询计划固定回归和 publication/statistics 聚焦验证后继续同分支 PR、Worker-only 发布。真实非零发布与页面验收尚未完成。

本轮 PR #164 的 CI 发现周范围配额兼容回归：仅一天有某分类时，不得把其余无该分类的日期补为零再改变 remainingMs 的既有返回语义。保持旧分类日集合，补验既有 current-week API 回归；不改配额规则或更正。

2026-10-01 PO 批准云端收口：Native 2.6.14 已安装；新应用持久化统计以 Service 既有单调时钟映射、用户内区间并集及毫秒精度为权威，旧云端分会话／墙钟算法差异仅诊断，不再作为新快照发布阻断。实施 checklist：①修正文档；②稳定历史锚点、跨日、更正及行/hash 精确核对；③最近七天已上传历史身份仅补独立自引用投影，不确认产品、不改变分类或目录；④正常审计流程刷新关联版本；⑤聚焦测试后现有分支 PR 合入、只发布 Runtime Worker；⑥固定范围核对真实非零发布、持久化值及页面冷／热读。测试等级为 Worker 核对／投影；必要测试为 publication、statistics、identity/knowledge 聚焦集、typecheck、dry-run、scope 和 diff；排除 Windows/Mac/WiX/网页账本/无关页面产品测试。原账、旧接口、更正和配额不变；新统计展示与旧配额用量分开保存，避免展示口径切换隐式改配额。无新分支／工作树、安装、migration、其他资源部署或 R2 操作。当前实施中，线上验收未完成。

2026-10-01 17:34 云端修复发布：PR #162 已合入 master@a0e656c4cc5c4a31c0514d10adf79af973e8b79c；精确主线 App Runtime CI 36843119177 SUCCESS，功能提交 CI 36842853024 的 Worker 156/156，通过的 Console／Native 无关任务未重跑。PO 再次要求继续修复后，受保护发布 36843409616 SUCCESS，仅部署 Runtime Worker，version=4be84f27-130c-4140-a15c-5bcf5a9f39cf，manifest artifact=11151669863；migration 步骤只读检查“无待执行项”，apply=false。health=200、未认证 catalog=401；Pages／Guardian／D1 schema／R2 未改。线上回读有 APPLICATION_ACCOUNT_ASSOCIATIONS_PENDING，当前派生日仍为 legacy-server，不是新统计生效。Native 交接再次空白结束且会话 idle，仍无代码／测试结果；本机对应修复、新 revision 补发及实际页面／性能验收保持未完成，不能把云端上线称为整体修复完成。

安装后修复实施（PO“继续修复”）：职责 standard-cloud；范围为 backend/applicationAccountPublication 与聚焦测试、既有设计及本条证据。真实缺口含技术进程与旧 Chrome 身份；修复不能靠名称合并、删除时长或伪造产品确认。沿用现有投影：未确认产品但已在云端投影中保持精确独立身份（unresolved、productId=null、associationKey=platform+换行+runtimeIdentity）的对象可按该独立键核验统计；产品冲突、投影缺失／换版及其他不完整事实仍拒绝。Native 所属会话修复派生清单把“用量完整”与“产品归属待确认”混为一谈的问题，保持归属诊断，不改变原账或统计算法；旧 complete=false 清单不强行发布，需生成新版本。最小验证：发布／统计／关联投影固定回归、Worker typecheck、dry-run、范围及 diff；排除 UI、macOS、WiX、无关全量测试。不新建分支／树，不执行生产数据修补、migration、安装或 R2 操作；上线与真机验收独立记录。

云端补丁本地验证：发布／统计／关联投影 38/38、typecheck、Wrangler 4.127.1 dry-run、standard-cloud 四文件范围检查和 diff 检查通过；新增回归证明独立未知身份可发布、产品状态仍 unresolved、原始事实不变，跨身份／冲突拒绝，旧不完整清单不被强制发布。原重试测试显式指定本用例清单，避免共享夹具中其他拒绝清单占用两项 cron 批次；未改变生产批次逻辑。审计 Matched＝云端兼容核验与诊断、原账不变；Deviated/Extra＝无；Missing＝Native 对称修复、新版本补发、真实业务发布与页面／性能验收。现有 Native 会话三次交接均空白结束，没有代码／测试结果；只读确认 ApplicationUsageReader 的 accountReasons 仍混入 Attribution 原因，不能把交接成功记成实现完成。未安装、部署或修改生产数据。

2026-10-01 安装后只读验收：PO 已安装 2.6.13；Native 确认四个常驻组件版本及 SHA-256 匹配 main@44900b6，Service Running/Automatic、Session Agent 单实例。真实 Native Host 读取 2026-09-30 总量 26,914,118ms、13 个应用、用量 complete=true；云端接收清单及上传总量一致，原始事实 498 条已齐。业务发布未通过：非零快照 reasonCodes=PRODUCT_IDENTITY_UNRESOLVED，云端错误 APPLICATION_ACCOUNT_INCOMPLETE；当前关联投影仍有 106 条事实未匹配 resolved 产品，native 派生日为 0，仍使用 legacy-server。另一个用户／assignment 的零事实快照已发布，不是覆盖实际用量。health 200、未认证 catalog 401；真实 Chrome 两次绑定均因 CDP focus 命令超时失败，页面及冷／热性能不得记为通过；本机受保护 SQLite 摘要仍待已有 UAC 读取。验收结论：安装和实际传输通过，统计发布／真实页面未通过，不宣称 D-113 全部完成。本次未改代码、原账、配额或生产配置，未安装、部署、执行 migration 或写 R2。

Native 最终代码验证：`main@44900b6` 的 [CI 36836656636](https://github.com/william-xia-cn/TimeWhereNative/actions/runs/36836656636) 已全部 SUCCESS（changes、Windows current/previous、Windows installer、Swift current/previous、native-gate），取代下段过程中的“CI待核实”。Swift CI 不等于 Mac 实机验收；Mac 新统计继续延后。源码整合及候选构建完成，安装／实际补发／固定截止与真实页面验收仍未完成。

Native 主线整合（2026-10-01，PO 明确要求不新增分支／工作树）：在现有 `D:\Codex\TimeWhereNative` 的干净 main 中直接整合并推送 `44900b6cf7a3d7f84ecc9421c77435d6f225666f`，来源为已保留的 Windows 分支 `588a424`，不合入 Mac 历史／路径。当前契约 Windows 251/251、上一兼容版 250/250、安装器版本 5/5、本机主线 WiX 构建及范围检查通过；GitHub CI 尚待核实，不冒称通过。主线内部未签名 2.6.13 候选在该根目录 `artifacts/release/windows/x64/2.6.13/`，Burn SHA-256 `81fd3b40d61d5515cc548d9c6f59d1e1a80b114dbbad9bbf3e35dc58e08b05e3`、MSI `5a7813227463736be660b0cfac07e4fcd1005df39967fd22c2369a4e098a4e64`，manifest 来源与契约哈希回读一致。未安装／重启服务／上传 R2；已安装仍为 2.6.12。原 Windows 非-main 候选和分支保留作恢复。此前“需要创建临时分支／主线整合待办”由本段取代；仍待实际安装、快照补发、固定截止与真实页面性能验收。

生产进度（2026-10-01 16:06 北京时间）：契约 PR #159、云端 PR #160 已合入 `master@646fbfe82ea13486b64e3119e35d0c767e3a9e20`。精确 master CI `36833784902` 成功；受保护 [发布 #42 / 36834193889](https://github.com/william-xia-cn/timeonchrome/actions/runs/36834193889) 成功，仅执行 `0013_runtime_application_accounts.sql` 和 Runtime Worker。Worker version `a57bfc68-ea3c-40da-afc6-c02d9c080832`、deployment `f0b9ccdb-4742-4816-8ba8-89ed4b78e3cb`、Contracts `1.20.0`；health 200、未认证目录 401、迁移记录及七张派生表回读通过。不可变 manifest artifact `11148143353`（ZIP digest `7c78f2ff5e5636c0c6756137b3074cab665161acf2988261ea3e28cbbb3fb716`）。Guardian `6953fe71-8048-4445-a3e5-307ebe55bd57`、Runtime Pages `26573975-904a-4aa6-b8d0-5dbbdb945f23`、主 Pages `aef42882-479b-4a14-8880-607155e2c32a`、R2 latest `2.3.1` 未部署／未写入。

Native 未收口：Windows 分支基于未合入 Mac／共享 Core，PR #13 不可整体改投 main。代码 `072d18f` 的 current/previous Windows 测试分别 251/250 项通过、安装器通过；Mac 旧夹具失败，随后文档提交 `588a424` 不使产品证据失效。内部未签名 2.6.13 非-main 候选已构建，尚未安装，已安装仍为 2.6.12。生产 received/published/派生日/队列均为 0，不是实际补发成功；真实浏览器验收因 CDP focus 超时未通过。已请求一次临时 Windows 整合分支例外（不新增工作树），未获答复前不创建。Matched＝契约／云端整合、限定发布、schema/smoke；Missing＝Native 安全整合、安装与实际快照固定截止对照、真实页面和冷／热性能；Mac D-113 延后。下述“未合入／未部署”属于之前阶段证据，以本段及表格最新状态为准。

2026-10-01 收尾执行授权：PO 要求“你先完成剩下的工作”，继续契约及两仓整合、必要 Runtime 0013 派生表与 Worker 发布、Windows 内部候选构建和受控安装后的真实通道对照。架构 PR #159 已合入 `1389d0d`；云端实现 PR #160 使用固定旁路，不新建分支／工作树。远端 migration list 已核实只缺 `0013_runtime_application_accounts.sql`，不得顺带迁移其他功能。Pages／Guardian／扩展、R2/latest 和原账不在变更范围；Mac D-113 继续延后。复用本地 69／83 项证据，补 CI／迁移核验／目标资源 smoke 与实际上传和截止范围对照。Native 现有 PR #13 基于 Mac 开发线，不能将其整体改投 main 带入未核验 Mac 工作；先核对可独立整合的 Windows 提交，构建不替代主线合入或实机验收。

最新实施收口（本地代码，不是上线）：Windows Native 已提交并推送现有分支 `05b8e669102ac1260c0cfb7bb9b4329a82441825`，持久化日／范围统计、原账事务 dirty、恢复 outbox、能力门控补发和 BrowserBridge／Manager 读取切换已实现；Service／Manager build 零警告零错误，Native 83 项聚焦通过（含原 SharedQuotaShadow 回归，但它不是独立应用配额验收）。云端第二批完成设备快照业务核验／独立发布头、发布与 Child dirty 同事务、按日持久化兼容统计、后台更新及普通读取切换；63 项聚焦及原 API 6 项更正／配额端到端通过，typecheck、Wrangler dry-run、源码边界和职责检查通过。5,000 条事实用例证明普通查询不调用原账聚合；这里只记本地性能／正确性，不冒称线上冷读改善。1.20.0 包 bytes／哈希保持不变，架构 PR #159 尚未合入。

PO 已明确批准 **已配对且云端声明 `usage-account-v1.enabled=true` 后自动补发的代码与测试**。不是本机安装或生产上传授权；旧 Worker／未就绪 schema／能力关闭／离线均不上传。0013 未应用生产，Worker／Pages／Guardian、R2/latest 和已安装程序未改。

现状更正：本机目前没有独立应用配额的日／周／单产品余额读取或执行器。现行独立配额在云端 AppUsage 读模型计算，已与原接口对照；本机 D-113 补齐统计层，不能把 SharedQuotaShadow 或分类字段当成配额功能已实现。本轮不新增配额执行。Native synthetic SQLite 的两条事实并集 2501ms、policyVersions=[7]、31 行清单及共同 hash 验证通过，但 associationVersion=null，不能替代可信产品关联的云端发布或真机验收。旧缺证日期继续使用持久化 `legacy-server` 统计，不重写原账、不填平两端不同算法。

本地实施审计：Matched＝统计持久化／恢复／有界同步、received 与 published 分离、服务端分类与版本核验、单来源 Child 归集、普通读取切换、原口径与最小测试；Deviated／Extra＝无。发布／安装／真实机器固定截止验收及 Mac D-113 均未进行，保持待办，不能写成整项线上完成。归档式“首批待完成”文字以下保留为前一实施阶段证据，以本段及表格最新状态为准。

实施批次一已完成本地代码（契约＋接收基础，不是产品切换）：增加 `usage-account` 固定语义、黄金向量与 1.20.0 本地契约候选；Runtime 以机器认证和既有 assignment 绑定统计归属，增加 manifest／chunk／commit／status 接收及独立 staging 表。下一可用本地 migration 为 `0013_runtime_application_accounts.sql`，只新增派生统计表，不应用生产 migration。首批 commit 只确认完整接收，明确返回 `received_not_published`；在 Native 统计与源版本对照、服务器管理版本核验完成前，不发布到原应用接口、不声明读取能力、不把客户端分类当权威。此边界保留 D-113 的接收与发布分离，不改变既有网页或应用读取。

批次一文件：contracts 的 usage-account 实现／schema／vectors／聚焦测试、package 与 tsconfig；Runtime applicationAccounts 模块、v2Routes 窄接入、0013 additive schema 及接收测试。必要依赖锁只同步 workspace 版本。验证限定契约构建／兼容／新向量、Runtime 接收测试及 typecheck、dry-run、diff。Native 实现由所属工作线消费固定候选包，随后完成云端发布与归集，不将首批测试通过写成全部 D-113 已完成。

PO 已要求“统一规划，调整”并批准实施。本任务以现有网页实现为基准，补应用缺失的本机持久化统计、版本化同步与云端归集；不再将缓存优化称为结构完成。规范单一来源：`docs/STATS_STORAGE_FOUNDATION.md` 的“2026-10-01 跨来源统一统计结构”；Runtime 实施映射见模块 DESIGN。阶段状态：**Windows／云端本地实现及相关测试完成；源码整合、受控发布／安装、真机验收待完成，未部署**。

| 次序 | 工作包／责任 | 完成标准 | 当前状态 |
|---|---|---|---|
| 1 | 统一结构及边界／当前会话 | 原账、派生统计、配额消费、云端归集、缓存和对账分层；不改网页运行行为 | 已写入 D-113 和共同设计 |
| 2 | 快照契约及共同向量／架构线 | 原始／统计独立 ACK、完整发布、版本和身份校验、实际消费者兼容；确定包版本及哈希 | 1.20.0 经 PR #159 合入并随云端发布；Native 固定包 SHA-256 `0e4f5fc7c8546efe1eca69255cb2838f866e993782dba367aa3cdd46f19c76f1`，60176 字节 |
| 3 | 本机物化及恢复／Native 线 | SQLite dirty 与原账同事务；受影响范围更新；统一应用读取；统计 outbox 持久补发 | main 44900b6 已推送，主线 2.6.13 候选及 CI 36836656636 全部通过；安装和真实补发待验；Mac 实机延后 |
| 4 | 设备统计及孩子归集／标准云端线 | 完整统计发布；既有应用接口改读物化结果；旧日期后台兼容；原始时间线仍分页按需读取 | PR #160／master 646fbfe、0013 及 Worker 已发布；schema/smoke 通过，真实登录与 Native 补发后业务验收待完成 |
| 5 | 固定截止对照及切换／各所属线 | 新旧总量／小时／产品／分类／更正／独立配额逐项一致；崩溃／重复／离线及分页通过 | 本地旧／新统计对照及云端现行配额通过；本机没有独立配额执行器；真实机器固定截止与安装后切换仍待验收 |

不新增分支或工作树，不改原扩展目录，不把迁移、安装或生产部署视为规划授权。统一结构不要求网页与应用共享数据库、用量相加或统一配额执行，也不改变 Chrome 特殊应用及未知重叠的已定展示。新派生 SQLite／D1 存储的具体 schema 与 additive migration 由相应实现明确列出；原始事实不得重写，未确认网页落账改动仍受 D-076 约束。

最小测试契约：设计批为纯文档；实施批一只运行 Contracts build／兼容及新增向量、Runtime typecheck／application-accounts 聚焦测试、Wrangler dry-run 和职责／diff 检查。后续 Native 只跑物化／事务恢复／并集／精度／更正／同步／读取聚焦，Worker 只跑身份授权／接收发布／归集／兼容／对账与 typecheck，页面仅在确需改动时补对应测试／目视。Mac 测试由 Mac 环境记为通过，能力未改的平台不得机械全量构建；不为流程阶段重复测试同一 SHA。

最终验收固定原始集合和截止，证明总量及现行配额不变、统计版本一致，日／周／小时／排行不再在普通读取扫描整周 Segment；记录冷／热耗时及统计新鲜度。源码实现、schema、安装和发布分别记录，不能以本地验证冒称线上功能完成。下一阶段为契约及两仓源码整合、受控发布与安装验收；本轮不自动执行生产操作。

本次设计调整审计：Matched＝共同分层、原账／精度／配额不变、本机及云端持久化、版本同步与恢复、旧数据兼容、职责及分阶段验收；Deviated／Missing／Extra＝无（仅本次设计文档范围）。六个既有文档的职责 diff、D-113 引用、标题空行及目标路径检查通过，`git diff --check` 通过；未运行产品测试，未提交／推送／部署。完整功能仍以上表待实施项为准。原工作树 `.wrangler/` 和当前会话 `app-runtime-management/agents/` 未跟踪内容原样保留。

首批实现证据：Contracts build 和包内现有兼容／分类／machine-control／computer-usage／usage-account 测试通过；Runtime typecheck 及本地 D1 接收测试 15/15 通过，涵盖事务中断回滚、旧版本／重复 ACK、部分恢复、归属隔离、维度矛盾、未完整零值、有界请求和原始 Segment／旧 hourly／assignment／App Policy 不变。Wrangler 4.127.1 dry-run 通过；使用现有生成的 Cloudflare 类型，未因受限网络另升级依赖。新请求体有界（manifest 16KiB、chunk 128KiB），commit 最多读取100块、10000行，响应 no-store，不改机器 heartbeat。没有页面变更，未跑截图／平台／安装器或无关全量测试。

首批审计：Matched＝共同候选契约／schema／黄金向量、不可变接收区及单调接收水位、原子接收／ACK区别、权限与有界请求、原账保留、最小本地证据；Deviated／Extra＝无。整体 D-113 的 Missing 仍包括 Native 物化与实测、事实／关联／更正内容校验、云端发布及 Child 归集、兼容构建、正式读取切换和真机冷读对照；不得以首批完成称为慢问题整体解决。架构契约已独立提交／推送 `e92347c1327fe74c3032730fa0b52ef2c9767c5f` 并创建 [PR #159](https://github.com/william-xia-cn/timeonchrome/pull/159)，包内三个源文件／schema／向量与 Git 来源逐文件对照通过，Native 已收到准确 SHA。接收实现随本记录按 standard-cloud 独立本地提交，暂不加入该架构 PR，避免混合职责。未合并／部署／安装／应用生产 migration；不把本地候选哈希当作已发布契约。

Native 核对已反馈旧事实缺 policyVersion／assignment 和 unknown 分类标签；按既定“历史不猜、缺口明确、不改原账”集中裁决，见模块 DESIGN。没有以当前策略回填历史、没有改变旧统计；未知归属保留本机独立分区，不强塞到孩子账。1.20.0 固定候选 bytes 不变；补充的是已有 incomplete／digest 字段的兼容解释，尚未通过消费者实测，不宣称发布完整。

## 2026-10-01：应用读取缓存与孩子汇总范围（已上线）

- PR #157，代码主线 `26f2e4257f330759ccd107de8bb1af28a60e74af`；Runtime/Main Console精确SHA CI通过。[受保护发布36783811409](https://github.com/william-xia-cn/timeonchrome/actions/runs/36783811409)成功，manifest artifact `11128438610` / SHA-256 `b4251fb9ad24ea41ede569a9bbe53b78bdb52613380c9bf2d7b225f75bfd2edb`。
- 仅更新 Runtime Worker `3512793a-08f1-4d1b-8f4b-c4b2e1a99444`、Runtime Pages `26573975-904a-4aa6-b8d0-5dbbdb945f23`、主 Pages `aef42882-479b-4a14-8880-607155e2c32a`。Guardian仍为 `6953fe71-8048-4445-a3e5-307ebe55bd57`，migration为none，R2 latest仍2.3.1；无终端/账本/配额改动。两页面共享脚本回读SHA-256均为 `4d6534699c7a6985ffc4918bce1db8f4a4e5fc398cda3493e8dbf71785d47a5e`，与源码一致。
- 真实读取：主页面应用冷读6398ms、强制重复359ms，后续新页面387ms；Runtime缓存hit432ms/刷新425ms。两页面切回应用复用内存缓存，无新增应用请求；总量及分类时长与原权威响应一致。电脑汇总无设备选择，网页独立视图仍有原筛选，Runtime独立应用保留电脑/账户/平台筛选。
- Matched＝本轮实现、测试、部署、真实缓存与范围验收；Deviated/Missing/Extra无。首次冷计算约6秒仍是明确性能限制，不称全部查询已快；精确重叠证据不足时仍保留来源独立值。详细最小验证见模块任务板；本段只收口证据，不重复部署。

## 2026-10-01：项目治理职责转交（PO明确指定）

- 当前会话负责 TimeOnChrome 仓库及项目治理：维护项目规则、任务与状态真值、工作线归属、分支/工作树盘点和已批准清理、流程/CI治理及发布证据登记；原架构线程不再承担这些治理职责。
- 架构线程保留架构决策、共享接口/契约、兼容性裁决和技术集成；标准云端、控件、Task、Santa和独立Native的实现边界不变。治理统筹不新增产品裁决、对端代码修改或生产发布权限。
- 本项仅修订现有 DECISIONS、PROJECT_WORKFLOW、AGENTS、PROJECT_MASTER及本任务板；不创建分支/工作树、不清理目录、不修改业务/CI代码、不安装或部署。验证仅文档一致性与 git diff --check，不运行产品测试，不新增治理门禁。

## 2026-10-01：使用统计结构与错误读数修复（已合并、部署及真实读取验收）

- 职责 `standard-cloud`；复用标准云端分支与目录，不创建分支/工作树。四视图固定为电脑使用、应用使用、网页使用、网页媒体使用，默认电脑汇总；独立统计保持原口径。
- 已证实新网页读取器错误读取不存在的 `daily_total`（真实 schema 只有日/小时 domain/target），导致零总量与非零分类矛盾；旧测试夹具同样错误。`computer-view` 的 display 覆盖 hidden，造成跨页签残留。应用来源失败须定位真实原因并保留稳定错误码。
- 最小验证：真实 schema 固定回归、来源与历史兼容、四视图/异步隔离、相关云端与 Console 测试/typecheck/dry-run/diff检查、桌面移动目视及真实登录对照。排除 Windows/macOS/WiX/原账算法测试；不改扩展、Native、原账、更正、配额，不执行 migration、安装或 R2 操作。验证后合入主线并仅发布修改的云端资源。
- 本地实现证据：网页总量仅取真实每日 active/domain 投影，不累计日/小时/target副本；无v2快照的历史复用既有日统计与已批准更正，明确尽力还原且不证明重叠。新增独立来源读取保留原统计口径。真实生产可观测记录为 `RuntimeComputerUsageService.jsrpc` hung/canceled，并非已证实SQL错误；同一具名能力改用固定只读 fetch，旧RPC保留，生产效果等待发布后核对。
- 聚焦回归通过：cloud computer读取、共享renderer、Runtime网络/会话/使用页、主页面入口/发布隔离及复合列表既有回归；Runtime真实workerd/D1 12/12（含具名能力fetch、Child隔离、原应用统计逐字段不变）、两端typecheck、两Worker dry-run、diff检查通过。mock目视已检查两套桌面/移动四页签、默认汇总、网页/应用独立视图与折叠诊断；mock不记为真实线上验收。代码一致性审计 Matched，Deviated/Missing/Extra无；提交后继续合并、部署及真实来源对照。
- PR #153 已合并并发布；真实登录发现应用来源仍报 `APPLICATION_CHILD_UNAVAILABLE`：读取能力误以仅旧版配对写入的 `runtime_children_v1` 判定新版孩子归属。继续修复同一已批准读取范围：通过既有受限 Guardian binding 按当前 `profiles(account_id,id)` 核验归属，不能补写旧表或撤销家庭隔离。移除测试中掩盖问题的旧表注册，补验新版、无设备孩子、外家庭拒绝和归属服务失效关闭；仅补跑两 Worker 读取聚焦测试/typecheck/dry-run，不重测未变页面或终端。
- 追加修复本地验证通过：Guardian归属/失败隔离固定回归、Runtime真实workerd/D1 13/13、两端typecheck、两Worker dry-run及diff检查。新版fixture明确断言旧配对表没有孩子行；旧残留行不能绕过当前归属校验。审计为 Matched（云端只读／家庭隔离／错误码／原账不变），无未批准偏差或额外功能；真实应用来源验收继续，不将本地通过当作线上恢复。
- 发布完成：PR #153 合入 `4c4e5a1bbdd6ea1c0746a20e78b686a702c76930`，受保护运行 [36776693373](https://github.com/william-xia-cn/timeonchrome/actions/runs/36776693373) 发布两 Worker 和两套 Pages；Runtime Pages `cd774713`、主 Pages `0a4fafbe`（deployment 地址前缀），页面源码与共享 renderer SHA-256 `a81126eaa3350fdd4cf762d8a8d21f8ed204e9247ecadd36c9bc66b12857a810` 已核对。归属追加修复 PR #154 合入 `295908ec4a38edb73707db29c406985512e3cb30`，运行 [36778827634](https://github.com/william-xia-cn/timeonchrome/actions/runs/36778827634) 仅发布 Guardian `6953fe71-8048-4445-a3e5-307ebe55bd57` 和 Runtime Worker `0b271f63-93ad-428d-9279-1b282c68cc1e`，未重复发布未变页面。
- 真实登录只读验收：固定同一孩子、北京时间2026-09-30及同一截止范围，旧网页权威接口、两页面网页独立视图和电脑汇总的网页总量一致；原应用接口、主控制台应用独立视图和 Runtime 电脑汇总的总毫秒与各分类逐项一致。两套页面四页签顺序、默认电脑汇总及独立视图隐藏状态已实际确认；产品、100条分页来源时间线、网页媒体独立视图实际加载，诊断默认折叠。验收未保存账户、Child ID、原始家庭明细或真实页面截图到仓库。
- 状态解释：现存来源有覆盖及重叠证据缺口，页面正常保留有效网页/应用统计、分类、产品和时间线，只将精确电脑总量/扣除量注明“尚未精确去重”；不能把本轮读数修复称为历史全覆盖或精确去重已完成。未确认的 Mac Chrome 仍保持原产品展示，未按名称强行关联；可信 Chrome 容器规则的固定回归继续有效。
- 收口审计：本轮四视图／权威schema读取／应用归属失败修复／稳定错误码／来源隔离／隐藏与迟到响应／最小测试及mock目视／真实来源对照／指定资源发布均 Matched；本轮范围内 Deviated/Missing/Extra 无。health及未认证401 smoke通过，待执行migration为空且未apply；没有终端、原账、分类更正、配额、安装或R2写入。纯文档证据提交仅执行diff及轻量CI，不再部署。


## 2026-10-01：孩子用量云端发布（PO批准提交与部署）

- 已上线：契约 PR #146、云端 PR #147 合并；生产基线 `76727e09fb53d8db2fd0d7de2a9f7e37d9572c0a`、Contracts `1.19.0`。受保护发布运行 [36768727441](https://github.com/william-xia-cn/timeonchrome/actions/runs/36768727441) 成功。Runtime Worker `7819e2bc-84e5-4e1b-9723-cc41991f1ebf`、Guardian `25ad9994-2cf8-46fb-abe2-961a1c09d078`、Runtime Pages `93a8485d-1976-4b5e-b7f6-b2e131986b49`、主 Pages `272c887e-4092-497d-a83f-2b5bec823b0d`，两页面 source 均为 `76727e0`。发布 manifest 已由该运行保存为 artifact；本段纯文档不重复部署。
- 线上技术核验通过：两套 `computer-usage-view.js` 内容相同且匹配发布源码（SHA-256 `db6f3bfce48890362f7b317cfc482c19f361f266eda032279b0c019e86d4cf34`），Runtime 主脚本亦匹配；两个新只读入口未认证均为401，健康及两页面 smoke 通过。迁移列表为空且无 apply；R2 latest 保持2.3.1及原 Burn SHA-256 `3109d6bbd147f5bfba88549a240dae42e84e724aa86bd1baef724d2df7b17563`。未改终端、原账、配额或生产数据。真实登录下的来源覆盖及页面语义由 PO 自行检查，尚不记为真实数据验收通过。
- 复用固定云端分支和工作树，依次收口已有 Firefox PR、契约 PR、云端实现 PR；不创建新分支或工作树。发布范围为 Runtime Worker、Guardian 只读归集入口和两套云端页面；不安装、不改原账/配额、不执行 migration、不写 R2。
- 首次具名 RPC 按已有设计解除循环部署依赖：默认关闭的显式 `bootstrap_computer_usage_rpc` 开关仅用于首次发布，且必须同时发布两 Worker；先从相同 master SHA 发布不含新增反向绑定的 Runtime 引导配置，再发布 Guardian，最后发布完整 Runtime 配置。后续正常发布不开引导开关，不移除已有绑定。临时配置不改源码或其他绑定；全部步骤仍使用 production 审核、精确 SHA CI 与原迁移门禁，失败不继续发布页面。
- 变更等级为 release-config；只补跑发布配置固定测试、workflow 语法与 diff 检查，复用既有功能证据，排除终端/安装器/全平台测试。线上读取核实当前无待执行 Runtime migration；真实家庭页面由 PO 发布后检查，不能将 mock 记为真实验收。
- PR CI发现两个适配缺口：Guardian现有测试的 esbuild 必须将 `cloudflare:workers` 作为真实 workerd 内置模块保留，不用 mock 替代；云端发布配置改动不应运行无关 Native 产物交接测试。按 ARM-D-019 增加精确 `native_artifact` 路由，仅 Native 发布工作流、锁、验证器或相关测试改动才检查原锁；显式全量验证仍包括该测试。Native 产物发布流程和版本/哈希门禁原样保留，不假称现有 Native 锁已更新。

## 2026-10-01：Chrome 特殊应用与孩子用量归集收尾（实现证据，已合并／部署）

- PO 批准口径：按 Child ID 归集展示，不猜重叠。设备对应及 Mac Chrome 自动规则不是加载前提；没有确切证据时只将精确电脑总量和扣除量留空，仍展示有效来源用量、分类、产品和时间线。全部电脑按来源累计，不对孩子所有电脑做全局区间并集，也不把网页＋应用直接称为精确电脑总量。
- 职责与最小验证：architecture-integration 修改契约／决策；standard-cloud 实施只读来源及两套云端页面。只运行受影响契约、Worker、D1固定对照、renderer、typecheck、dry-run、桌面／移动mock及路径/diff检查；复用未受影响证据，排除 Windows/macOS/WiX/扩展全平台测试。复用 `codex/cloud-management`，不新建工作树或分支。
- 已实现：Contracts `1.19.0` 分别报告 `sourceStatus/historyStatus/overlapStatus`，保留原来源分类，归集分类明确标注是否去重。可信 Chrome 进入“特殊应用”；容器不贡献新增展示分类，原应用配置和配额不变。无法确认容器归属时展开“该孩子的网页内容”，解释量／未知余量保持 null，不把内容再次相加。
- 历史范围：查询北京时间日／周、最多七天。遗留 v1 按原设备／会话区间并集与现有更正尽力读取，历史标志随产品和时间线返回；无法读取的旧来源单独报告，不清空当前 v2。网页历史单日失败只影响对应日期。来源筛选键跨日稳定，分页锁定同一 revision，每页最多100条；两端证据合计最多20,000条，超限明确标注而非伪装完整。
- 同源页面：Guardian 只读入口与 Runtime facade 返回同一云端结果，主控制台和独立 Runtime 页面共用字节一致的只读 renderer。汇总、产品、Chrome内容及时间线按需加载；异常不阻挡设备管理或原独立统计。未确认 Mac 对象保留原展示，已有批准强 selector 可以识别。
- 原行为对照：原网页权威账户读取、网页更正、应用更正文件保持不变；AST精确抽取确认 `queryAppUsage` 原函数 SHA-256 为 `45683af5a7acbe28a39575cb818f0761509788851b6f3e2ab8193e6e2028b4b0`，前后相同。真实本地 D1 固定范围下，新增读取前后原记录、完整应用统计／配额对象一致。不修改扩展、Native、计时、任何原账、migration、安装器、生产数据或 R2。
- 验证：契约 build/typecheck、兼容测试、8组黄金向量48项固定断言及新增不变量通过；复用既有未变分类／机器控制证据。`npx vitest run test/computer-usage-evidence.test.ts` 11/11通过（含旧源失败、具名RPC版本路径、可信旧Chrome及同名不命中）。`node tests/unit/computer-usage-cloud.test.js`、`node app-runtime-management/console/computer-usage-view.test.cjs`、根／Runtime typecheck、两次 Worker dry-run及 `git diff --check`通过。dry-run包大小 Runtime 351.11KiB、Guardian 880.42KiB；不是部署或线上验收。
- 目视：主控制台、Runtime统计、特殊目录的桌面／移动mock共6张已核对，可见独立来源用量、分类、产品、Chrome child内容及历史标志。仅使用固定mock，不访问家庭数据；原导航的外部图标缺失及移动固定层在全页截图中的位置作为既有样式限制保留，未借本轮修改导航。隔离浏览器与mock服务已关闭。
- 收尾审计：本轮本地契约、Child隔离、多设备累计、未知重叠不误扣、Chrome内容不重复计入、历史兼容、版本分页、双页面和最小验证均 `Matched`；`Deviated / Missing / Extra`（本轮本地范围）无。精确物理设备对应、未审核Mac自动规则和真实生产验收不是本轮交付前提，明确保留其状态，不记为通过。未创建分支/工作树、未部署、未安装、未执行migration或R2操作，原候选目录和主工作树未改变。
- PR收口：已有 Firefox PR #144 先按原范围通过检查并合并；契约提交 `c9f6219` 经 PR #146 合并，云端实现 `0167df8` 与必要部署/CI适配经 PR #147 合并。全部复用固定分支，无新分支或工作树。首次具名RPC引导已由受保护生产流程完成，发布证据见本文件上段；真实家庭数据验收仍待 PO 检查。

## NOW：一条架构集成主线与四条开发旁路（2026-09-29，PO修订）

### 治理收口续项：固定工作树位置与遗留目录（D-110）

2026-09-30 复合隐私与 Rest 旧树续清理：`composite-terminal-privacy-integration@ff8c55b`、`rest-terminal-integration@ba11ac5` 均无未提交改动或运行进程引用，提交完整包含于 `origin/master` 和已验证 Git bundle。两树的 `.tmp` 隔离浏览器 Profile 与 `test-results` 先分别移入本机仅 William、管理员、SYSTEM 可访问的 `private-profiles` 恢复区，1,493+1 及 2,373+1 份文件逐项 SHA-256 一致；Rest 树指向主目录的 `node_modules` junction 仅解除链接，目标未动。随后非强制退出两处 Git 工作树，原路径重建为仅含 `.tmp`、`test-results` junction 的兼容入口，既有证据路径仍可读取；这两个兼容目录不是 Git 工作树。对应本地及远端分支在实时 SHA lease 下删除，提交可从 bundle 恢复。现登记工作树 11、本地分支 13。`rest-weekly-cloud-validation` 继续暂留：固定云端树的两处依赖 junction 及依赖内部的 contracts workspace 链接指向该旧树，且当前/旧锁文件不一致，不能直接换源或删除。`composite-terminal-integration` 仍含未提交内容，Codex 托管旧树与活跃 `81a1`、Task `f805` 继续保留。本轮无安装、部署、迁移或产品数据变更。

2026-09-30 续清理：`app-runtime-release-2.2.1@b7d8278` 的 7 份本地 D1/SQLite/WAL/SHM 文件先复制到 `D:\Codex\worktree-cleanup-backups\2026-09-29\private-d1\app-runtime-release-2.2.1`，恢复目录关闭普通用户继承权限，仅管理员、SYSTEM 和 William 可访问；源／副本逐项 SHA-256 一致。非强制 `git worktree remove` 已取消 Git 登记，但未能删除非空目录；随后将 1,174 份、43,996,745 字节残余整体移到既有 `residual-worktrees\app-runtime-release-2.2.1` 恢复区，逐文件哈希一致，原路径不存在。独有的 `codex/app-runtime-2.2.1-release-evidence` 分支及提交继续保留，不视为已合并。现登记工作树 13、本地分支 15；其余未绑定的旧分支均非 `origin/master` 祖先，本轮不删除。带隔离浏览器 Profile 的 Rest／复合旧树、活跃 `81a1`、Task `f805`、主目录脏改动和 `rest-weekly-cloud-validation` 的共享依赖继续保留。备份至少留至 2026-10-29；无安装、部署、迁移或生产数据变更。

2026-09-29 本轮逐项清理：已验证本地 Git bundle，并完整退出 `gate-composite-unpacked-f2a329a` 与 `app-runtime-attribution-release-20260927`；后者的未提交任务板和两份 manifest 已在本地恢复区逐项校验。`app-runtime-product-catalog-v2` 的 2.2.2 安装包及 manifest 已校验备份，`timewhere-native-split` 的唯一零字节异常文件已精确移除；两树已取消 Git 登记，随后把未删除的原目录残留分别同盘移入既有 `residual-worktrees` 恢复区，1,199 与 1,201 份文件逐项 SHA-256 核对一致，原路径已不存在。该移动不释放磁盘，恢复区至少保留至 2026-10-29。对应三条已合并、无开放 PR 的本地及远端功能分支按精确 SHA 清理。Task `f805` 的五个修改文件、九张截图已复制到 D 盘临时 detached 工作树并核对 diff/hash，原会话、隔离 Profile 仍在旧目录。原扩展加载路径已指向 D 盘逐字节相同的 1.7.39 候选，但 Computer Use 无法确认 Chrome URL，真实重新加载/连接尚未验收；其余带 Profile 的工作树继续保留。当前登记工作树 14、本地分支 15；本轮无产品代码、安装、部署或账本变更。

2026-09-29 历史契约工作树续清理：`D:\Codex\TimeOnchrome-worktrees\runtime-session-boundaries@b2c5b22` 已是主线祖先，精确提交在验证过的 `timeonchrome.bundle` 内；目录无 tracked 改动或运行进程引用，唯一额外内容为两份 `.wrangler/cache` JSON（账户/Pages 缓存，不是 D1 或浏览器 Profile）。先同盘移至 `D:\Codex\worktree-cleanup-backups\2026-09-29\runtime-session-boundaries-cache`，逐份 SHA-256 核对一致，再以非强制 `git worktree remove` 完整移除旧目录。对应本地分支以 `-d`、远端分支以实时 SHA lease 删除。回读：TimeOnChrome 登记工作树 17、本地分支 18、远端分支 29；固定五工作线、原扩展候选、Task `f805`、Santa 旁路和主目录均未改变。备份至少保留至 2026-10-29，不上传云端；本轮未部署或安装。

2026-09-29 云端草稿核对：主目录 `D:\Codex\TimeOnchrome` 中未提交的复合页面复核路由、独立脚本、migration、页面入口及本周 Rest 配置，与现行 `origin/master@6d2028c` 的对应功能逐项对照，主线已有后续修正（复合只读关闭状态见 `72c6f0f`）。旧主目录停在 `2b9d461`，文件哈希不同主要不能被当作遗漏功能证据；本轮不复制旧实现、不改主目录。Santa 专属改动已由所属线核对等价；主目录仍混有控件、云端、Santa 未提交内容及运行依赖，继续整体保护。

2026-09-29 孤立分支续清理：`codex/task-terminal-default-off-v1@8ef79a6` 已为 `origin/master` 祖先，无工作树占用；精确 SHA 已包含在验证过的 `timeonchrome.bundle`。删除对应本地分支，并在实时远端 SHA 相同的条件下以 lease 删除远端分支；残留 `C:\tmp\TimeOnchrome-task-terminal-default-off` 目录和其中可能含认证字段的本地文件未触碰，未进入通用备份。当前登记工作树仍 18，本地分支 19、实时远端分支 30；五个固定目录之外的保留项不因此变成可删除。

2026-09-29后续清理：对旧Task工作树`C:\tmp\TimeOnchrome-task-terminal-default-off`执行前，已核验提交`8ef79a6f`在主线、既有本地bundle可恢复、无未提交内容或其他进程引用。非强制`git worktree remove`取消了Git登记，但因目录非空返回失败；现登记工作树21→20，原路径仍有残留，**不算目录清理完成**。残留含带认证字段的本地测试JSON，不进入通用恢复归档，不强删、不移动；对应本地/远端分支及原文件保持待核对状态。其余含ignored产物或运行/验收依赖的旧树继续保留，不能按“已并入主线”直接移除。本次没有安装、部署或修改产品数据。

2026-09-29分支清理续项：从最新`origin/master`核验祖先关系、无工作树占用、实时远端SHA和精确bundle后，以非强制方式删除7条已合并本地分支：`codex/inventory-disposition-closeout`、`codex/inventory-final-source-map`、`codex/native-host-fixed-candidate-v3`、`codex/schedule-deployment-evidence`、`codex/composite-real-auth-closeout`、`codex/runtime-login-loop-fix`、`codex/runtime-macos-enrollment-fix`。删除其中仍存在的5条对应远端分支，并额外删除已合并的远端`codex/runtime-usage-memory-fix`；所有远端删除均按实时SHA加lease。原`timeonchrome.bundle`及新增`timeonchrome-branch-delta.bundle`、`timeonchrome-remote-delta.bundle`位于`D:\Codex\worktree-cleanup-backups\2026-09-29\`，新增bundle已验证完整历史和精确分支SHA。另清除1条经实时核实已不存在的本地远端跟踪引用。当前核验口径：TimeOnChrome登记工作树20、在地分支20、GitHub实时分支31；TimeWhereNative登记工作树3、在地分支3。未合并、脏树、含ignored证据及固定工作线继续保留；旧Task目录的文件残留未处理，不能宣称达到五目录目标。本轮无安装、部署或产品数据操作。

2026-09-29工作树清理续项：旧`guardian-v3-release-gate`仅含未合并的历史文档提交`8da97d5`，相关事实已见主线后续任务记录；其工作区和ignored清单均为空，无进程引用，精确提交已在校验过的`timeonchrome.bundle`及远端分支中。经路径边界核验后，以非强制`git worktree remove`移除该目录，保留本地和远端分支，不丢弃未合并提交。TimeOnChrome登记工作树由20减至19；在地分支仍20，实时远端分支仍31。含未决改动、ignored产物、验收环境或运行依赖的其他旧树继续保留，不为凑目标数量强删。

2026-09-29工作线核对续项：Task 所有者确认旧`C:\tmp\TimeOnchrome-task-ack-strict@7aa6b1b`的 ACK 行为和测试已由主线 `55825fb` 的重构实现覆盖，目录干净、无 ignored 文件、会话或进程引用。精确提交在已验证的`timeonchrome.bundle`内；经绝对路径边界复核，以非强制`git worktree remove`移除该检出目录，保留本地/远端分支。TimeOnChrome登记工作树由19减至18。活动`f805`保留，其 P16 五个未提交文件与九张 UI 截图尚未并入主线；是否实施 P16 属于独立产品裁决，Task 仍默认关闭且不发布。`task-host-wiring`虽已合并仍是其会话附加工作树，暂留。控件所有者确认旧 Rest 与复合隐私工作树的代码已在主线，但 `.tmp` 有未备份的隔离浏览器截图、诊断和 Profile，暂不退出；原`81a1`仍是运行中的扩展候选与当前会话目录，不移动。云端旧`app-runtime-attribution-release-20260927`的两份非凭据生产 manifest 已精确复制到`D:\Codex\worktree-cleanup-backups\2026-09-29\attribution-release-manifests\`并逐份核对 SHA-256；其脏工作树仍保留，不重置。旧`app-runtime-release-2.2.1`含本地 D1 状态，不能按普通缓存清理。

Santa 所有者只读对账：原主目录与固定`codex/santa-management@2fa1a1a`的18个 Santa 代码/测试文件及三处专属文档段落内容一致；三个新增文件仅 CRLF/LF 不同，未发现尚未迁入固定旁路的有效 Santa 功能改动。主目录仍是 Santa 会话所在目录，固定旁路的`node_modules` junction 指向主目录，且主目录存在 Native D1、构建临时数据与控件/云端未提交改动；在解除这些依赖前不能移动、删除或同步主目录。此结论仅收口源码归属，不等于 Santa 已合并或发布。

2026-09-29核对：治理PR #117、#118、#119、#120均已合入`master`。控件旁路已在`D:\Codex\TimeOnchrome-worktrees\extension-local`落地并推送`codex/extension-local@10621e3`：本次只修订过时的隔离测试断言；未切换原`81a1`加载目录，也未完成延后的真实30分钟复合分析验收。Santa旁路已在`D:\Codex\TimeOnchrome-worktrees\santa-management`落地并推送`codex/santa-management@2fa1a1a`，迁入Santa专属草稿；五组Native App单测、类型检查与本地mock桌面/窄屏目视核对通过，真实Mac时间边界和同步尚未验收，未PR合并、未部署。标准云端`codex/cloud-management`及Task`codex/task-management-v1`保留各自固定分支。主目录`D:\Codex\TimeOnchrome`的控件、Santa及云端混合未提交内容仍保留，Task`f805`仍有未提交内容。

固定目录目标：主线`D:\Codex\TimeOnchrome`，旁路在同级`D:\Codex\TimeOnchrome-worktrees\`按工作线命名。当前标准云端继续复用`guardian-release-81949cc`，不因旧名字不匹配而重建。最新登记工作树数量见上方工作树清理续项；五条固定工作线已经有对应分支/目录，但大量旧验收、发布和任务目录仍在，不能冒称收敛至五目录。Codex托管工具额外创建了`C:\Users\William\.codex\worktrees\extension-local\TimeOnchrome`（detached，未使用）；归档工具因受保护而拒绝移除，保持原样并单列后续处理，不能用文件删除绕过。扩展候选完成新目录加载复验前，原`81a1`不得移动；Santa 原始草稿的有效内容已由所属任务确认迁入固定旁路，但主目录仍有会话、junction、Native D1 与跨线脏内容依赖，不能清理或原地同步。Task`f805`保留至所有者处理完脏内容。新分支/目录创建、功能整合、运行引用切换和旧目录清理分别记状态，不混称完成。

本续项为纯治理文档：只运行`git diff --check`和文档结构检查；不运行产品测试，不安装、不部署、不改变生产或候选运行状态。

本轮职责`architecture-integration`，允许本任务治理文档、职责检查和固定用例。实施清单：①D-109及PROJECT_WORKFLOW/AGENTS修订；②范围检查区分架构契约、控件、标准云端、Task和Santa；③聚焦测试、CI路由和`git diff --check`；④审计后通过过渡PR合入。本次不移动目录、不清理分支、不部署。目标五个常用目录，不把过渡状态冒称已完成。

目标映射：`master`=架构/集成；`codex/extension-local`=控件（固定D盘工作树已推送，原81a1加载目录仍保留）；`codex/cloud-management`=标准云端（复用`WT\guardian-release-81949cc`）；`codex/task-management-v1`=Task（f805脏树保留）；`codex/santa-management`=Santa（固定D盘工作树已推送，未PR合入）。产品/发布阶段不额外占一条工作线。Task默认关闭且不发布。

下面2026-09-29初查与四工作线表为D-108时点历史，结构以D-109为准；处置清单的HEAD/数量不得直接当作此刻实时状态。

以下为D-108四工作线阶段的历史任务记录，已由D-109五工作线决策取代；不得据此重建master控件主线或覆盖本节最新状态。该阶段仅修改治理文档、CI路由和发布判断，未改业务、候选、数据库或运行目录。

最小验证：task-scope、CI routing、工作流语法及diff；排除产品/平台/安装器/E2E全量。本次不部署。当前用量修复PR115已合并e3d8e9f且CI通过，尚未发布；发布不依赖遗留目录全部清理。生产workflow仍保留旧迁移门禁；本轮不改该门禁，也不宣称新延期流程已经可用。

实查发现Santa与控件共用脏主目录，81a1含固定加载候选，Task f805有未提交内容；四目录是目标，不是当前事实。所有这些目录继续保留，详见本节后续处置表。

### 2026-09-29 工作树处置表（只读核验；均未删除）

基线：TimeOnChrome 18 个登记工作树、25 条本地分支、34 条实时远端分支、0 个开放 PR。以下按当前 `origin/master` 祖先关系和工作区状态分类；“已合并”不表示无运行依赖或可立即清理。路径中 `WT` 为 `D:\Codex\TimeOnchrome-worktrees`，但每项清理前仍须使用完整绝对路径重验 HEAD、ignored 内容和会话依赖。

| 工作树／HEAD 短 SHA | 归属与独有改动 | 工作区／依赖 | 建议处置 |
|---|---|---|---|
| `D:\Codex\TimeOnchrome` · `2b9d461a` | master；提交已在主线，工作区混有控件/Santa/云端草稿 | 脏；多个 ignored 依赖 | 保留，逐所有者拆分；不原地同步 |
| `C:\tmp\TimeOnchrome-task-ack-strict` · `7aa6b1bf` | Task；未合并，独有提交 | 干净 | Task 所有者审查整合，暂留 |
| `C:\tmp\TimeOnchrome-task-terminal-default-off` · `8ef79a6f` | Task；已合并 | ignored 构建/依赖 | 核对引用后列清理候选 |
| `C:\Users\William\.codex\worktrees\81a1\TimeOnchrome` · `4408b16d` | 当前控件/契约历史线；未合并 | 原扩展加载候选及未跟踪内容 | 固定保留，不移动加载目录 |
| `C:\Users\William\.codex\worktrees\f805\TimeOnchrome` · `8603fbbb` | Task；未合并 | 脏，含输出 | 保留交 Task 所有者 |
| `C:\Users\William\.codex\worktrees\task-host-wiring\TimeOnchrome` · `0d4ad241` | Task；已合并 | ignored 构建/输出 | 核对引用后列清理候选 |
| `D:\Codex\TimeOnchrome\.artifacts\gate-composite-unpacked-f2a329a` · `f2a329a1` | 复合验收源；已合并 | ignored 扩展元数据/隔离环境依赖 | 保留至验收依赖解除 |
| `WT\app-runtime-attribution-release-20260927` · `c3d9b7ff` | Runtime 发布证据；已合并 | 脏文档/未跟踪产物 | 证据所有者核对，暂留 |
| `WT\app-runtime-product-catalog-v2` · `9891eb2d` | Runtime；已合并 | ignored Agent/安装及证据产物 | 证据哈希与用途核验前保留 |
| `WT\app-runtime-release-2.2.1` · `b7d82784` | Runtime 文档独有提交，未合并 | tracked 干净，ignored 依赖 | 云端线审查是否仍有效 |
| `WT\composite-terminal-integration` · `19eecdc5` | 控件；已合并 | 脏扩展/测试/未跟踪内容 | 控件所有者处理，暂留 |
| `WT\composite-terminal-privacy-integration` · `ff8c55b8` | 控件；已合并 | ignored 依赖/结果 | 核对验收引用后列候选 |
| `WT\guardian-release-81949cc` · `e3d8e9f8` | 云端固定线 `codex/cloud-management`；已合并基线 | 未跟踪 `.wrangler`；本轮文档修改 | 固定保留，复用此目录 |
| `WT\guardian-v3-release-gate` · `8da97d5d` | 云端文档独有提交，未合并 | tracked 干净 | 云端线审查是否仍有效 |
| `WT\rest-terminal-integration` · `ba11ac56` | 控件；已合并 | ignored 依赖/结果 | 核对验收引用后列候选 |
| `WT\rest-weekly-cloud-validation` · `358d5eb9` | 验收/共享依赖；已合并 | ignored 依赖/输出 | 解除共享依赖前保留 |
| `WT\runtime-session-boundaries` · `b2c5b22d` | 云端历史线；已合并 | 未跟踪 `.wrangler` | 数据用途核验前保留 |
| `WT\timewhere-native-split` · `0dd58ce8` | 拆仓历史线；已合并 | 异常未跟踪 `backend/NUL` 等 | 异常文件核验前保留 |

未合并且无上述工作树的本地文档分支 `codex/app-runtime-release-evidence-v1` 也保留给云端线核对；其余本地/远端引用即使已被主线包含，也必须另核 PR、SHA、bundle 和依赖后形成精确删除清单。本表是创建Santa固定工作树之前的只读基线；Santa目录现已建立，但其未提交内容不能冒称已整合或已发布。本轮不删分支、不归档工作树、不触碰 Native 仓。

## 托管扩展发布前阻塞：Native Host 注册身份与兼容入口收口（2026-09-29，PO确认）

状态：**OPEN / BLOCKS_NEXT_MANAGED_EXTENSION_RELEASE**。必须在下一次正式托管扩展打包发布前处理完成并验收；不是已完成项，不影响当前本地候选继续使用。本次仅登记，不改协议、代码、候选目录、注册表或安装包。

- 已核对现状：Native协议实现定义正式Host `com.timeonchrome.nativehost` 与旧别名 `com.timeonchrome.guardian`；NativeMessagingManifestWriter生成两个JSON并指向同一可执行文件，MSI同时注册两者；允许连接的扩展ID当前写在Native协议实现中。旧JSON不代表第二个Guardian服务。
- 当前架构/契约任务负责明确正式Host名称、兼容别名退出条件、连接身份配置归属及版本兼容；TimeOnChrome发布配置持有正式/开发扩展身份，双方审核；Native消费确定版本的配置，负责manifest生成、本机路径、注册、升级清理与卸载；扩展所属任务负责调用适配。Native Host继续只framing/转发，不迁入Guardian业务。
- 处理前核对现用正式托管扩展、开发候选与受支持旧版本是否仍调用旧Host。不得只删文件而切断旧客户端；若仍有消费者，先完成迁移并明确兼容截止，不允许无期限保留且不登记。满足退出条件后，安装器须在升级时清除旧注册项和旧JSON，而非仅停止生成。
- 完成证据：共享契约/发布配置单一来源明确；正式包使用正确Host和精确allowed_origins，不夹带native-host-development配置；安装/升级/修复/卸载路径与旧版兼容验证；真实扩展→Host→Service健康及现有统计读取通过。Native与扩展各由所属任务实施，本会话核对一致性，releaseMg检查阻塞项关闭后才可放行正式托管发布。
- 最小验证：登记阶段仅文档diff检查，不运行产品测试/CI；实施时按实际差异执行契约兼容、扩展Host选择、Native manifest/安装器聚焦测试及必要实机通信验收，不默认全平台回归。无本轮发布smoke，因为不发布。

## 两仓清理执行（2026-09-29，PO批准）

第三轮完成：9个残留目录全部同盘移入本地恢复区residual-worktrees，原9路径均已不存在；9,501份文件共377,621,077字节逐文件SHA-256一致，junction不遍历目标、不强删。该操作不释放磁盘，保留至至少2026-10-29。清单为round3-residual-results.json及residual-*-hashes.json。对应8条本地、8条远端已合并且无PR/工作树占用的功能分支已删除，先核对bundle、实时SHA及主线祖先，远端使用expected-SHA lease。TimeOnChrome当前18个登记工作树、本地22分支、远端31分支；Native维持2/2/2。本轮残留目录目标已处理；其他活跃/脏树/独有提交/隔离Profile/运行依赖仍保留，不代表全仓工作完成。

本轮审计：Matched＝9目录可恢复整理、哈希核对、8对分支安全清理、保护路径仍在；未运行产品测试、未改业务或运行配置、未部署。清理方式为后续PO“继续处理”下的保留归档，而非重试强制删除。主目录其他会话改动不纳入本轮提交；只提交当前证据树TASK_BOARD，git diff --check通过。

第三轮续处理：9个已取消Git登记的残留目录共同包含指向自身已移除contracts路径的npm workspace junction。只做可恢复整理：复核无进程引用、无未跟踪敏感数据后，同盘移动到既有恢复区residual-worktrees，保留junction本身且不遍历其目标，逐文件SHA-256核对；不是强删或释放磁盘。之后才清理匹配清单且主线已包含的对应闲置分支。仍只运行Git/哈希/diff，不运行产品测试或发布。

第二轮结果：TimeOnChrome登记工作树31→18，但其中9项Git非强制remove报告目录非空、登记已移除而磁盘残留，**不能算目录完整清理**。真正完整移除4树：app-runtime-2.3.0-release、app-runtime-2.3.1-release、app-runtime-ci-throttle-v1、app-runtime-release-2.2.2。对应原目录逻辑文件5,083,482,672字节（约4.73GiB，非净磁盘释放）；108份截图/安装包/manifest等证据已备份且SHA-256复验通过。另删除2条已合并本地及2条远端分支，本地32→30、远端41→39；Native未变。累计完整移除13树、本地分支79条、远端93条。

更正前轮保留理由：多个旧树的workers/.wrangler SQLite属于早期Git已跟踪且未修改的文件，历史/bundle已有副本，不是独有运行数据库；未跟踪的Runtime数据库与浏览器Profile仍原地保护。实际残留9目录及HEAD/恢复办法见本地round2-residual-directories.json，按原计划拒绝后停止单项，未强删、未递归清空。后续如需恢复完整源码，在新目录按所记HEAD重建，不覆盖残留目录。产品目录v2、Rest/复合隔离Profile、脏树、未合并树、共享依赖及固定保护树仍保留。

第二轮验证：round2-evidence-hashes.json与round2-summary.json保存证据；主目录TASK_BOARD.md与docs/UI_STYLE_MAP.md相对上轮快照已有变化，本任务未写这些文件，不声称全仓哈希不变；其余被比对的保留修改文件未变化。Matched＝已确认目录、证据备份、分支SHA保护与最小检查；Missing/待处理＝9个非强制移除失败的残留目录及保留项，不能宣称整理全部完成；无强制清理、产品改动、安装或发布。

续清理：逐项审查第二批ignored实际文件（不仅依赖git忽略列表），已合并/无依赖目录中的可重建缓存允许随非强制worktree remove移除；截图、安装包、manifest先本地备份并验哈希。发现数据库、Profile、凭据或未知文件立即保留该树，不为减少数量绕过保护。仅Git/文件/哈希/diff验证，无产品测试或发布。

执行结果：清理9个普通Git工作树、77条本地功能分支、91条GitHub功能分支。TimeOnChrome工作树40→31、本地分支108→32、实时远端分支122→41；TimeWhereNative工作树2→2、本地分支3→2、实时远端分支12→2。未删除tag或长期用途分支，没有部署、安装、账本或R2操作。

首批方案列明的8树全部通过并非强制移除；第二批另移除cloud-schedule-input-normalization，先备份其2张截图和发布manifest并校验SHA-256。首批原目录逻辑文件116,197,002字节；第二批Git blob及证据合计14,410,522字节。没有清理前磁盘空闲空间基线，不宣称Windows实际净释放量；恢复包及抽查仓库另占约200MiB。

恢复位置为 `D:\Codex\worktree-cleanup-backups\2026-09-29\`，至少保留至2026-10-29，不自动删除。两仓bundle校验通过，从bundle恢复已删除分支抽查通过、SHA一致；32个原有已修改文件哈希未变。精确路径/HEAD/分支/删除结果/证据哈希/恢复命令分别记录于该目录的清单及恢复说明，不上传云端。GitHub对inventory-envelope-fix删除曾返回500，随后实时ls-remote确认该引用确已不存在，结果按回读记录。

保留与待处理：固定保护目录及共享依赖不动；第二批其余工作树含构建产物、本地状态或未决证据，未一概删除。2.3.0发布树发现本地SQLite，停止该项且不归档数据库。`codex/inventory-disposition-closeout`、`codex/inventory-final-source-map`虽有远端主线祖先证据，但本地非强制branch -d拒绝，原地保留，不使用-D。未合并、脏树及依赖详情见本地retained-worktrees.json；工作树清空不是验收目标。

审计：Matched＝备份校验、第一批、已确认第二批、SHA保护分支清理、运行目录保护及恢复抽查；Deviated/Extra＝无；待处理＝其余含未决产物/状态的树及上述拒绝删除分支，按方案保留，未冒称全清。仅运行Git/文件哈希/diff检查，不跑产品回归；本轮文档仅本地提交，不触发生产发布。

按批准方案清理已合入、无活跃引用的旧工作树及两端功能分支。固定保护两仓主目录、81a1原候选、Task f805、Mac跨平台开发、复合验收源/Profile、当前证据树及共享依赖来源。恢复bundle、前态哈希、依赖与处置清单仅存D盘本地恢复目录；不归档凭据/Profile/真实数据库。不强制删除、不覆盖脏树、不部署。变更等级为仓库维护/文档，仅检查Git引用、bundle恢复、文件哈希与diff，不跑产品回归。首批为方案列明的8个干净工作树；含不明ignored内容或唯一证据的目录在证据确认前保留，远端分支按实时SHA和主线祖先关系逐项校验。

## PO最新状态裁决（2026-09-29）

| 工作项 | 当前状态 | 后续验收边界 |
|---|---|---|
| 复合分析真实30分钟闭环 | **DEFERRED：PO明确延后验收，未通过** | 达到真实1800秒有效用量后，逐项验证页面证据上传、家长列表展示、自动通知。既有短段落账和手动通知证据不能替代这三项。 |
| Mac | **IN_PROGRESS：开发中（PO确认）** | 由Native所属任务继续开发；编译、实机、云端配对及恢复闭环须在Mac环境验收，当前不记为通过。 |

复合分析不再作为当前轮需要持续重试的阻塞任务；测试开关保持关闭，不自动重启长测或发送通知，待后续明确安排验收。以下BLOCKED_BY_OS_IDLE和“Mac延后”均为历史阶段记录，当前状态以上表为准，不据延期宣称功能验收完成。Task保持默认关闭及不发布入口，其他边界不变。本次仅更新本任务板和PROJECT_MASTER，验证git diff --check，不运行产品测试、不部署。

## 受控前台落账复验（2026-09-29）

最新只读续查：系统idle已恢复active，但测试Chrome窗口focused=false/state=normal；未开启新一轮长测，复合开关继续关闭。剩余验收须在真实前台/系统活动条件下达到1800秒后验证，不能用CDP滚动维持idle，也不降低门槛。证据收口变更等级为纯文档，仅修改本任务板，执行diff检查及轻量CI；不跑产品回归、不部署、不清理任何工作树。

终端恢复已确认：正常立即同步后配置6000036，2026-09-29 01:33:55最近成功、连续失败0，原绑定保留；对应上述云端关闭回读。新增Wikipedia记录01:25:49–01:26:46显示56秒且已上传；约195秒仅为两段UI口径汇总。真实复合闭环当前BLOCKED_BY_OS_IDLE，不是账号/授权/绑定阻塞；缺少真实系统活动时不以自动滚动、改idle或改门槛替代。

本次续验结果：终端正常同步配置5000036，初始短段满足真实focused/normal/active；随后CDP滚动未能维持Windows系统活动，idle转为idle，故停止累计，不模拟系统输入状态。本次Wikipedia仅新增约56秒已结算记录，加此前139秒约195秒，未达到1800秒。家长UI已取消勾选并独立保存，回读“已关闭 · 云端已确认账”，Wikipedia今日/本周约3分；未重复发送手动通知。临时内存采样已清除，原绑定/候选目录保持不变；终端最后正常同步关闭状态待回报。Matched＝真实短段结算、云端读数和恢复关闭；Missing＝1800秒后的页面证据上传及自动通知；无代码/阈值/账本改写或新发布。

登录后回读：控制台明确选中Gate.Test，复合区显示“已开启 · 云端已确认账”，Wikipedia今日/本周均约2分，暂无达到复核线对象。此前保存结果未知已由这次正常UI回读消除；已通知控件所属任务继续既有隔离绑定的真实1800秒门槛验收，不降低阈值、不重复手动通知、不改原候选。完成后仍须恢复关闭并回读，当前尚不能声称页面证据上传或自动通知通过。

后续闭环推进：本机只读确认Wikipedia现有已结算区间139秒。家长UI在受控档案回读复合开关关闭、云端今日约2分和Telegram可用；按已批准临时开启范围勾选并点击独立保存时，浏览器点击/确认框读取超时，恢复连接后原标签不可用，新控制台显示登录页。未取得保存成功或保存后云端回读，当前开关结果未知，不沿用此前false冒称已恢复。未启动新增30分钟采集或发送新测试通知；下一步必须正常登录后先核对并按测试范围管理/恢复开关，不读取或注入凭据，不重绑终端。

PO批准保留既有隔离unpacked测试扩展后，通过正常Chrome界面保留并恢复该隔离Profile开发者模式；未关闭Safe Browsing、未修改日常Profile/原候选目录。原绑定保留，无重绑或新设备。测试前公开Chrome API为window focused=true/state=normal/idle=active；测试中01:09:02至01:10:12北京时间每10秒采样均为实际活动标签Wikipedia、窗口正常聚焦、idle=active，临时页面内存采样结束已清除、不写扩展存储。

网页落账UI出现2026-09-29 01:08:58–01:11:17的en.wikipedia.org前台ACTIVE/composite记录，open=tabUpdated、close=tabActivated、已上传。当日9段、界面总8分，统计/落账展示差0、异常0。本项PASS仅证明此次真实前台可开账并正常结算；工具操作使实际标签活动约139秒而非精确60秒，采样只覆盖约70秒，不宣称全段逐秒精度。先前缺少前台/idle证据的失败不足以确认产品漏账，不据本次烟测覆盖所有历史疑点。

前台烟测完成时复合采集开关关闭，后续已开启见本节最新回读；真实1800秒阈值、复合页面证据上传及自动通知尚未验收，不能把原网页段“已上传”混为复合证据上传通过。本批无业务代码/账本改写/部署/安装/重绑；Mac仍延后、Task仍关闭。文档检查仅git diff --check，不重复产品测试。

## 受控线上验收补充（2026-09-28）

只读前提已定位：控件任务从现有Admin调用公开Chrome API，当前window为focused=true/state=normal，但chrome.idle.queryState(180)=locked；DOM同时hasFocus=true/visibility=hidden。这是当前锁屏状态的直接证据，普通前台计时拒绝确认符合既有规则，不能通过滚动或模拟idle绕过。它不是18:22–18:23测试期间的同步证据，故不据此销案此前疑点。下一次只在真实系统active且窗口正常聚焦的前提下进行自动验收；无需用户代为浏览，但真实Windows解锁不能由代理代输凭据。云端采集仍关闭，未改产品/原账。

验收路径更正：PO要求代理自行执行，已通过既有受支持的agent-browser正常选择独立Wikipedia标签，并于北京时间18:22:48–18:23:49完成约一分钟普通滚动；页面报告visible/hasFocus=true，随后切回已有Admin正常刷新。没有调用被阻断的原生窗口通道，没有模拟系统idle/focus或改账。DOM焦点不能证明扩展监听的窗口/idle状态，控件任务继续只读核对真实结算与自动化事件差异；不再将人工浏览作为唯一前提，也不将此次交互提前记为计时PASS。

最新只读复核：独立Admin与Wikipedia标签均保留，控件所属任务只选择已有Admin读取今日落账，显示8段、总9分，统计与落账展示差为0；没有Wikipedia正时长记录。最新段为北京时间17:12:59–17:15:59、extension-page.chrome-local、composite、idle_inactive_close。缺少该区间可靠的Wikipedia前台起止证据，不能将扩展页段认定为错误归属，也不能用展示差为0排除漏记。未重新运行测试、未读取凭据或私有存储、未重绑；采集仍关闭。下一项必要证据为用户在既有隔离Wikipedia页真实前台浏览后的正常结算，再只读核对；原生窗口安全阻断通道不再重试。真实上传与自动通知仍未完成，Mac延后、Task关闭不变。

固定标签补验未能开始：原生Computer Use观察到隔离Chrome在补验前最小化，恢复后准备读取本机监控状态时触发URL无法可靠确认的安全停止。没有执行新增60秒Wikipedia访问，没有绕过或改账；该最小化证据仅代表当时，不能倒推首轮。当前为BLOCKED_BY_COMPUTER_USE_URL_SAFETY，P0疑似缺账未确诊也未销案，真实上传/自动通知仍Missing；云端复合开关已恢复关闭。后续须在支持可靠URL/前台状态观察的环境完成真实验收，不通过改计时或伪造证据绕过工具阻断。

短程验收未通过：受控终端配置已同步至2000036，Wikipedia真实页面可访问，Popup复合模式高亮且显示复合用量；但Admin未见Wikipedia管理对象，约60秒观察后未见该访问期后的正时长结算段。时间线更正：extension-page的17:02:39–17:04:47记录早于约17:04:55打开Wikipedia，不能作为错误归属证据，撤回该推断。目前缺少测试等待时真实active tab/window、idle与监控证据，不能区分测试焦点干扰与真实漏记；按P0疑似原账问题交控件任务只读调查，禁止继续30分钟累计或修改计时。已中止验收并在云端取消独立复合开关、保存后回读“已关闭”及checked=false，原关闭状态恢复。无重绑、无额外通知、无部署或产品修改；真实上传及自动通知闭环仍未通过。

本次最新现场：隔离扩展已由用户正常绑定，控件任务从Popup/Admin确认受控档案及云配置同步成功，不再重绑。随后家长控制台独立复合开关已显示“已开启”且勾选；开始获批受控公开页面短程验收，尚未达到30分钟真实门槛，不把开启或绑定成功等同上传通过。验收结束必须恢复原关闭状态；旧段落中的关闭/未绑定属于历史阶段。

PO随后明确批准新增受控测试设备的正常绑定及该设备持久凭据创建。已交由控件所属任务在专属隔离环境执行正常UI流程；不读取、导出或脚本注入凭据，不重绑现用扩展。下方“绑定待授权”保留为前一阶段记录，已由本次许可覆盖；登录/绑定成功仍须实证，不因许可获批记为通过。

后续安全准备：控件所属任务从干净master f2a329a106486e32f50b52ffda14f34fc64f80d3建立独立无凭据unpacked验收源，manifest1.7.34，已确认PR97祖先和observer/独立可取消同步接线；extension root及generated精确副本检查通过。另备空隔离浏览器环境，未启动、未绑定、未接触原候选。该测试源不是原1.7.39开发候选或托管发布；版本差异不代表回退用户安装。新设备正常UI绑定尚待明确授权，不能从持续目标推定可创建持久设备凭据。远端fetch已核实PR110提交属于master；无需重复构建、测试或部署。代码只读核对确认自动复合通知按真实已确认1800秒触发，本次唯一测试消息已发送，未再触发额外通知。

PO批准使用既有受控测试档案，临时开启复合分析、验证受控页面上传及一条Telegram测试通知，结束恢复开关。本次不改代码、不部署、不更新原扩展候选、不改原账；仅浏览器验收与文档diff。已确认原采集开关为关闭；启用确认框后浏览器控制超时，未将该尝试记为成功，新标签重新从云端读取仍为关闭。账号Telegram通道已连接启用，单次点击发送测试消息后页面反馈“Telegram 测试消息已发送”；未重复发送，不把服务端成功反馈称为收件端已读或复合规则自动通知通过。

终端所属任务只读检查未发现可用的真实绑定受控档案的隔离扩展：旧绑定测试目录不存在，Wikipedia隔离环境只含匿名假绑定，原家庭候选不允许重绑；已合入观察/上传源码不代表已加载和已绑定。故真实页面上传及自动触发通知为BLOCKED，不降低30分钟真实已确认用量阈值、不注入凭据或伪造原账。下一步需准备专属隔离终端并经正常绑定流程接入该测试档案；原1.7.39加载目录保持不变。Mac继续DEFERRED、Task继续关闭。Matched＝只读前提核实及唯一测试通知发送反馈；Missing＝真实受控终端、页面上传和自动通知闭环；未开展额外业务变更。

## NOW：非Mac剩余验收补齐（2026-09-28）

本批本地结果：现有D1闭环已移除家长/设备鉴权stub，真实generateToken/verifyAccountToken/verifyDeviceTokenFromRequest运行通过；错误签名/过期/无令牌401、跨家庭读写404、跨设备上传404、已解绑GET/POST403及DEVICE_UNBOUND通过。原有开关、逐批ACK、意见、删除竞态、通知丢失确认/租约/重试上限/迟到回调与原账不变断言继续通过。manifest读数和外部通知provider仍是受控替身，不冒称真实设备上传或邮件/Telegram送达。语法、diff、两文件职责检查通过；Matched＝本次本地鉴权补齐，Deviated/Extra＝无；线上完整闭环仍需指定受控档案与通知许可。测试补齐无需重新部署产品。

PO要求Mac延后并完成可继续事项。本批职责runtime-cloud-contract，先补现有composite-cloud-integration测试的真实家长JWT/设备令牌鉴权，保留本地D1与通知provider替身；不改产品、原账、协议、生产开关或凭据。允许该测试及本文档。依次移除鉴权stub、使用真实生成/验证代码、覆盖错误签名/过期/跨家庭/无令牌/设备解绑与原有上传/重试闭环。最小测试仅该文件、node语法、diff/职责检查，CI复用已有复合专项；不跑终端/安装器/Mac/E2E、不部署测试提交。线上开启/实际通知需明确受控档案与消息授权，已询问；等待期间继续安全本地验证。Task继续关闭，旧目录不删除，共享配额不进入实现。

## 最新结果：关闭复核读取已修复并验收；Mac延后（2026-09-28）

所有者复核补充：控件任务已只读裁定composite-terminal-integration的11项草稿无应重放的独有能力：主线PR97 b33d776/526bd54包含接线、关闭换绑及逐批身份重核/Abort；a754e95/PR95包含scheme-less标题隐私修复；storage-maintenance/privacy/隔离helper与主线逐字相同；主线测试与分项实机证据覆盖旧首轮测试。旧.tmp与test-results的失败现场仅为历史证据，原地保留，不作为现行失败、不清理、不重放。Runtime旧attribution树的8行未提交文档亦已由模块TASK_BOARD的ARM-D-033最终证据覆盖（策略58、目标单行study、固定原账8909条不变），不重复导入中间“整体未完成”状态；artifacts继续保留。上述两项不再是源码整合遗漏，余下Native跨平台为PO明确延后、Task为明确不启用，旧脏目录保留不是重新合并许可。

PR107功能提交72c6f0f，相关CI36392160648/36392160674通过，merge e288da2411fdb5cccc5899363bc5d7251b7c69d0；精确SHA Guardian门禁36392295656通过。PO明确授权的production运行36392392513成功，仅部署Guardian Worker 801665c0-1e3f-4389-886d-11f59cf82d41。不可变manifest artifact app-runtime-production-manifest-e288da2411fdb5cccc5899363bc5d7251b7c69d0记录contract1.16.1、deployedResources=[guardianWorker]、runtimeMigrations=[]。

真实Chrome既有登录只读验收通过：复核区显示“已关闭 · 云端已确认账”，空列表显示“暂无达到复核线的复合网站”，保存控件恢复可用但未点击；开关仍false。此前“复核数据暂不可用”不再出现。没有读取凭据、开启采集、发送通知或修改家庭配置。开启后证据/通知闭环不在此次只读验收范围，不能冒称通过。写入、上传、通知默认严格guard不变，原账及统计算法不变。

资源核对：主Pages仍1ecd6133-4697-44cf-be18-1ddf2e304fbb/source81949cc；Runtime Worker仍b00deec4-b3ca-40f7-8b10-6536af07f10b；Runtime Pages仍f2a6ca68-8e6f-42f7-b82e-9bf42b06e6ad/sourceaa5382e；R2 latest仍2.3.1/118739813 bytes/SHA256 3109d6bbd147f5bfba88549a240dae42e84e724aa86bd1baef724d2df7b17563。无需重装或重载扩展。Guardian032登记已完成，不执行全部pending。

版本分层：TimeOnChrome代码基线e288da2；Native main c770bb8；已安装11组件2.6.8.0且Service Running/Automatic；原目录扩展候选1.7.39。云端contracts源码1.16.1不代表Native主线已消费：Native主线锁1.15.0（SHA256 5a3f3762fee88e3cf1bd8140ac2716407a40566d2248de6c497cc7fb36c07073）/上一版1.14.0（05fdff9a4480f0dd32736ecdc4aee0113b5a6189427082351ea54dfab71d0518），本机包字节均已校验；Native draft跨平台工作线锁1.16.1/上一版1.15.0。不为统一版本号升级或部署。

全部已登记worktree已执行status、ignored目录清单及祖先检查，处置如下（不执行删除）：

| 工作线组 | 核实结果/建议处置 |
|---|---|
| main-console-release-gate-dispatch、app-runtime-release-default-classification、composite-title-privacy-merge、inventory-disposition-closeout、runtime-historical-evidence-recovery、task-domain-integration、timewhere-split-final-20260927、two-repo-inventory | 已合入且tracked/untracked/ignored为空；可列单独批准的清理候选，批准前再确认没有会话/打开文件依赖。恢复分别依靠25bc591、aa5382e、9cc07a3、3fd5390、711a5da、4a94ee6、b9819b1、75ee2c9。 |
| 其余旧Runtime构建/发布/规则工作树 | 已有提交祖先或旧文档恢复映射，但存在node_modules、输出、安装产物、测试或发布证据；保留，不能因已合并直接删除。rest-weekly-cloud-validation还为当前测试提供依赖junction。 |
| app-runtime-attribution-release-20260927 | 主提交已合；仍有模块TASK_BOARD修改及未跟踪artifacts，保留未决证据。 |
| composite-terminal-integration | 已合提交19eecdc之外仍有11项本地修改/未跟踪观察器与测试，由控件任务确认；不复制或覆盖主线。 |
| 原主目录/原扩展加载树/Task混合树 | 有未提交内容、运行依赖或未采用的旧语义，继续保留。7aa6b1b虽非祖先，但严格acceptedIds处理已在主线且PR76等已完成后续原子ACK整合；不得整条重放旧15提交。Task保持默认关闭，不发布入口。 |
| runtime-session-boundaries、timewhere-native-split | 分别有未跟踪.wrangler、backend/NUL，未审查清理，保留。 |
| guardian-release-81949cc | 当前修复/证据工作树；.tmp含两次生产manifest，.wrangler及依赖junction仍有用途，保留。 |
| Native主目录及跨平台/临时2.6.9构建树 | 主目录32项未决文件；draft PR11与d1b08d6候选未合main，Mac延后；保留全部，不用安装2.6.8冒充2.6.9验收。 |
| Native usage-statistics-integration | 986d1ec已合，但有.contracts、构建/安装产物，保留证据；主目录c5c9b85/6c51a0d的统计已patch等价整合，不重复合并。 |

当前审计：本次批准的修复/合并/Guardian发布/真实关闭状态读取为Matched，Deviated/Extra无；Mac为PO明确DEFERRED，Task启用和线上采集通知闭环未执行。两仓脏树归属清单与非删除清理建议已产出，但脏草稿逐项所有者裁决不冒称完成。纯文档收口只diff与轻量CI，不重复产品测试或生产发布。

## 执行：关闭复合采集时家长列表可读（PO逐项批准，2026-09-28）

提交前结果：corrections和cloud-integration两组真实本地D1聚焦测试通过（鉴权/provider为受控夹具），根typecheck、Wrangler4.127.1 dry-run、6文件职责检查及diff检查通过。回归证明关闭列表可读、设备上传仍403、外部归属404、配置/账头变化503、默认写入guard仍要求enabled、原账不变。Matched＝上述批准清单；Deviated/Extra＝无，本地修复Missing＝无；生产发布和真实页面复验仍待执行。依赖使用既有目录junction，未重新安装，不影响受保护工作树。

职责runtime-cloud-contract；允许compositePageCorrections.ts、compositePageReviews路由及两份对应聚焦测试、项目状态文档。实施顺序：保留默认严格写入guard，仅家长列表显式选择只读一致性校验；读取末尾核对档案配置未变化；回归关闭/开启、归属、账头/更正/配置并发变化及原账不变。只运行corrections/cloud-integration聚焦测试、Worker typecheck/dry-run、diff和职责检查及相关CI，不跑Agent/WiX/全平台/扩展E2E。合并后仅Guardian Worker发布，真实页面只读复验；不改采集、上传、通知门禁，不修改统计算法/原账，不启用家庭开关。上一节只读排查的未修复状态由后续证据更新。

## 当前收口：Mac 延后，真实登录读取未通过（2026-09-28）

职责 runtime-cloud-contract；本批只读浏览器、Git、版本和生产schema核验及文档。不改业务代码、家庭开关或原账，不部署、不清理；仅diff检查，不跑产品测试。

- 已登录主控制台统计正常，但复合内容复核在关闭状态刷新后仍显示“复核数据暂不可用”。发现列表GET复用compositeSnapshotGuard，其中要求enabled=true；关闭功能但存在本周账头时必然失败。生产依赖表已齐全，关闭档案本周账头计数2，rows_written=0。尚未取得浏览器具体错误响应，不排除并存原因，不通过开启采集绕过错误。需另行分离只读一致性与采集/写入启用门禁；本批未修复。
- 远端主线核实：TimeOnChrome34254275e8c12e0939d334df0202ae0856f1d1f0；Nativec770bb85f39c6173b314a476b794d0ecd7eace29。前者无打开PR，后者#11 draft保留。Mac编译/实机/配对恢复延后。首次fetch因D盘无空间失败，空间恢复约906MiB后成功，未删除文件。
- 安装的11个Native组件均2.6.8.0，Service Running/Automatic；原目录候选manifest1.7.39未改变。部署源仍81949cc，文档SHA不等于部署SHA。Runtime0011/接收端仍未部署。

清理仅建议：D:/Codex/TimeOnchrome-worktrees/main-console-release-gate-dispatch 的25bc591已合入主线、tracked/untracked/ignored为空，未见对应可执行进程，可列待批准候选；仍需排除其他会话/打开文件依赖，可从保留提交恢复。runtime-session-boundaries有未跟踪.wrangler，暂保留。guardian-release-81949cc有.wrangler及.tmp生产manifest必须保留。两仓主目录、原扩展候选、当前树未跟踪agents和Native跨平台修改均保留。其余旧树尚未完成逐项依赖审计，不批量推荐删除。

审计：Matched＝只读验收、版本核实、保护脏树、未清理、Mac延后；Deviated/Extra＝无；Missing＝复合列表读取通过、开启后证据/通知闭环及剩余旧树依赖审计。未新增生产写入，不宣称全部完成。

## 当前发布结果（2026-09-28，覆盖下方未部署状态）

登记收口（2026-09-28 07:09:13 UTC）：PO 随后明确批准仅向 d1_migrations 登记已执行032。先只读确认目标五表齐全、登记为空，再条件插入032_composite_page_reviews.sql，changes=1；回读迁移登记仅此一条。本项 Missing 已消除，下方安全审核拒绝记录保留为历史；不再等待登记批准。未重跑建表、未补录其他迁移、未重新部署。真实已认证业务联调仍未完成，不以登记成功冒充端到端通过。

PO 明确批准 Guardian 032 及 Guardian/隔离 Task 主 Pages。本次仅发布 master 81949cc5542b1490a2c4f31a1ddd006d11ea5de6；PR104 增加 Main Console 手动 CI 入口，Guardian 36381984505 与 Main Console 36381981663 在精确 SHA 成功。production 运行 36382107413 经环境审核成功；不可变 artifact app-runtime-production-manifest-81949cc5542b1490a2c4f31a1ddd006d11ea5de6 保存资源版本。

- Guardian 032：仅执行审核过的六条建表/建索引语句，五表回读均存在；未执行其他 migration。Git blob SHA256=7c05bdae2dc20386cc3e447f2d486e455fee453a6e6e26d91309953680b0e4a3。安全审核拒绝单独写入 d1_migrations 登记，故数据库结构已应用、登记未完成，不能再次直接执行本文件，也不能运行全部 pending。登记需要 PO 单独明确批准；未绕过审核。
- Guardian Worker：82c312d4-41e1-4f8b-ad7f-d9056c31ea59；主 Pages：1ecd6133-4697-44cf-be18-1ddf2e304fbb（source 81949cc）。设备/家长复合读取接口无认证均401，主页面200，/task/返回302至/，optional-modules.json为[]。
- 未改资源：Runtime Worker b00deec4-b3ca-40f7-8b10-6536af07f10b；Runtime Pages f2a6ca68-8e6f-42f7-b82e-9bf42b06e6ad；R2 latest 2.3.1及原哈希保持不变。未修改家庭开关、终端、原账或启用Task。
- ARM-D-035/036：PR98已合入63e4f97，contracts1.16.1已交付；Runtime0011和接收端仍未部署，不与Guardian032混淆。Mac编译/实机/配对恢复闭环由PO明确延后；macOS配对支持及安全响应恢复仍是未实现项，不以DEFERRED冒充PASS。

发布审计：Matched＝精确SHA/受保护流程/唯一032建表/Guardian与主Pages/Task隔离/未认证fail-closed/其他资源不变；Deviated/Extra＝无；Missing＝032迁移登记、真实已认证业务联调证据。部署成功不等于家庭开关已开启或所有产品验收已完成。本次收口仅文档，运行diff检查，不触发重复生产或产品测试。

## NOW：已批准 Guardian 032 与隔离 Task 主 Pages 发布（2026-09-28）

PO 已明确批准仅执行 Guardian 032 additive migration，再部署 Guardian/主 Pages；不部署 Runtime，不修改 R2、家庭开关、终端或原账。Mac 编译/实机/云端闭环按 PO 决定延后，不伪称通过。

发布前发现 master 63e4f97 的 Guardian CI 已成功，但 Main Console CI 缺少同 SHA 运行且没有 workflow_dispatch。实施 checklist：仅为现有轻量 Main Console 检查增加手动入口；不删减生产精确 SHA 闸门。职责 runtime-cloud-contract，精确公共文件例外为 .github/workflows/app-runtime-main-console.yml；本地仅校验 YAML 及触发器/步骤保持、git diff --check，CI 仅既有轻量相关门禁，不跑 Agent/WiX/账本/E2E。迁移文件 Git blob SHA256=7c05bdae2dc20386cc3e447f2d486e455fee453a6e6e26d91309953680b0e4a3，checkout 差异仅 CRLF。所有发布前提就绪前不写生产 D1。

## 当前整合快照（2026-09-28，覆盖下方历史状态）

职责 runtime-cloud-contract；本次仅只读两仓fetch、祖先/patch状态和生产schema检查及本文档，不运行产品测试、不清理、不部署。TimeOnChrome origin/master=bc78aba，Native origin/main=c770bb8；本地主目录/脏工作树未切换、覆盖或stash。

| 工作线 | 当前来源与证据 | 处置／剩余条件 |
|---|---|---|
| Rest 终端及云端 | PR94及72/86已合；真实分项复验见对应记录 | 已整合；部署/终端候选更新与源码分开，不能沿用旧“尚未实现”状态 |
| 复合分析 | PR95–100及102已合；102 head df0dcff五组CI通过，merge bc78aba | 接收/页面/终端源码整合完成，生产schema和联调未完成 |
| Task | 默认关闭源码已安全整合；PR101隔离发布目录已合 | 本轮不发布Task入口，不启用，不重放旧混合分支 |
| 旧Runtime发布证据 | b7d8278/52ec058、5f14cab、8da97d5仍非祖先；均仅旧文档，内容恢复映射见下文 | 保留追溯，不用祖先缺失推断业务未合，不重复覆盖现行文档 |
| 应用读取超时旧分支 | 4408b16非祖先，但9bbeba6已在主线实现；native-host-client.js和local-guardian.test.js与当前主线逐字相同，双方只读diff核对为空 | 已被主线完整覆盖；应用读取15秒、其他ACK3秒，保留旧引用，不重放、不另开产品PR |
| ARM-D-035/036 | PR98契约1.16.1及云端操作尚为独立工作线 | 保持待审，不混入Guardian032发布 |
| Native 2.6.8 | main c770bb8，统计旧提交c5c9b85/6c51a0d已patch等价整合 | 不重复合并；安装版本沿用此前实机核验，非本次重新安装 |
| Native跨平台 | PR11 draft，最新所属任务报告b691cd2；主目录仍有未提交内容 | 保留活跃；完整移除、Swift/Mac实机及云端联调未完成，旧CI不能替代当前head证据 |

生产只读证据：Guardian已有usage_segments_v1和profile_config_history_v1，但d1_migrations登记为空；复合五张表均不存在。查询rows_written=0，不可执行全部pending。已单独请求仅032 additive建表及Guardian/隔离Task主Pages发布批准，未执行。Runtime/Guardian/Pages/R2版本本批未重新读取，不以旧记录冒充当前线上回读。

清理仍不执行：所有原扩展加载目录、脏树、活跃Native树、唯一产物和证据保留；祖先已合入只是候选条件，尚不代表无运行/证据依赖。整体目标仍未完成。

## NOW：复合分析接收入口与发布隔离（2026-09-28）

PR102首次CI阻断：持久化专项前19项通过，最后一项仍断言032文件不存在，这是接入前的隔离阶段条件。按本轮已批准schema接入改为实际migration与冻结夹具逐字规范化一致；保留固定SHA、删除竞态及原账保护测试。不改产品语义、不绕过测试；本项测试文件为接入阶段精确范围补充。

接收批次提交前审计：Matched＝路由接线、严格显式布尔开关、032 additive表与既有夹具一致、10档案轮转、逐日/清理/通知失败隔离、稳定码计数及既有CI接入；Deviated/Extra＝无，本批源码Missing＝无。接线测试（鉴权stub）、维护测试（绑定stub）、真实本地D1专项（auth/provider夹具）、TypeScript及Wrangler4.127.1 dry-run通过；不将这些证据称为生产通知或真实账号联调。测试最初VM不支持export已只修提取器，复跑通过。没有生产migration/部署/配置写入；整体目标仍含发布与版本收口。维护服务文件、对应接线测试和既有composite-evidence workflow为本批明确范围，未触及扩展/Native/账本。

维护实现清单：现有 CONFIG_CACHE 保存非权威轮转游标，每轮按 id 读取至多11条、处理10个档案及各自最近三天，末尾回绕；KV迟延可能重复扫描，由现有幂等写入保护，不用游标证明账本完整。配置损坏或某日失败不阻断其余档案；过期详情清理最多100条，通知继续使用既有20条及重试租约。各阶段失败只输出稳定码和计数。新增维护纯函数夹具覆盖轮转、回绕及失败隔离，并在既有复合CI运行接线测试；不增加平台/E2E测试。单个档案内部工作量未因此获得全局时间上界，不宣称解决所有规模问题。

最新进展：发布隔离 PR #101 已经两项 CI 通过并合入 0e4a8f7，尚未执行生产发布。本地接收分支已加入精确复合路由分发、配置白名单与严格 enabled 布尔校验；接线/配置/migration parity测试、锁定 Contracts构建和根 TypeScript检查通过。既有真实本地 D1专项通过：显式开启、阈值、逐批ACK、归属过滤、意见、删除及原账不变；鉴权/provider仍用受控夹具，不能冒称真实token/外部通知验收。维护调度的有界执行和稳定错误诊断仍未完成，当前补丁保持未提交，不部署。隔离依赖按锁安装，未运行安装脚本。

页面 PR #100 已合入 master 056160b；四项 CI 全部成功，源码与 mock 验收完成，不等于部署。职责 runtime-cloud-contract；本批允许 workers/src/index.ts、workers/src/routes/profiles.ts、workers/migrations/032_composite_page_reviews.sql、相关最小接入测试和既有轻量 CI。先对照原草稿与已合并服务，再接配置白名单/严格布尔校验、路由、维护调用和 additive schema；不修改原账/配额，不复制原草稿的旧服务。最小验证为配置边界、路由鉴权、migration 与既有测试 schema 一致性、复合云端专项、typecheck/dry-run、diff/职责。禁止生产 migration、部署或家庭开关写入，完成源码验收后单独核对发布前提。

发布阻断已核实：pages/optional-modules.json 当前包含 task-management-v1 → /task/，主入口链接 /modules/；直接整目录部署会发布用户明确排除的 Task 创建入口。后续需按现有发布流程隔离候选资源并验证目录及直达路径均不可用，不通过隐藏单个按钮伪称未发布。此项未解决前不部署主 Pages；Task 源码仍保留，不删除已有工作。

维护入口审查：已合并 maintainCompositeReviews 会枚举全部 profiles 并扫描三天；原草稿 catch(()=>{}) 会吞掉失败。接线前需确认有界执行及稳定无隐私诊断，不能把旧草稿直接复制视为生产就绪。

发布隔离实施子项：新增 tools/stage-main-console-release.js 和对应纯文件测试；在新临时目录复制主 Pages（排除 task/），过滤 optional-modules.json 的 Task 项并为 /task、/task/* 写回主页重定向，保留其他入口。仅发布产物变化，不删除源码、不动 Task API 或家庭配置；输出目录必须不存在，禁止覆盖或清理。接入既有 production workflow 的主 Pages 步骤及轻量页面 CI。最小验证：文件排除、目录过滤、重定向、其他文件字节一致、重复目标拒绝、diff与workflow语法；不运行浏览器/平台/账本测试，不实际部署。

隔离子项提交前审计：Matched＝Task文件/目录项排除、直达路径重定向、保留原源码、拒绝覆盖、主入口字节一致；Deviated/Extra＝无，本地实现 Missing＝无，线上直达验收仍待实际授权发布后执行。固定文件测试、实际 pages 产物核对、node --check、两个 workflow YAML 解析、diff检查通过。实际候选位于系统临时目录 toc-main-pages-77ed98fdfef2441e89840cc29fc9d0e6，模块列表为空、task目录不存在；未上传。该子项独立提交，不包含尚未完成的032 migration。发布脚本/测试/两个workflow为本任务精确范围例外。

## NOW：复合分析家长页面独立整合（2026-09-28）

提交前审计：Matched＝原草稿独立区块、服务端详情口径、代际隔离、设备标识裁剪、确认/保存/恢复、桌面与390px mock控件可达；Deviated/Extra＝无；本页面源码范围 Missing＝无，整体功能仍缺生产路由/schema和部署，禁止当作已上线。Node VM 7项通过；实际 CSS/HTML 区块/脚本的隔离 mock 桌面1280×900、移动390px全页已目视，移动 scrollWidth=390 无横溢。仅证明该区块布局，不冒称完整登录全流程；截图在本机 Temp 的 composite-parent-desktop-full.png / composite-parent-mobile.png，不含私人数据。复用既有主页面轻量 CI 加入专项，不触发平台构建；精确例外为该 workflow 与本次测试文件。原失败/中间状态保留于下文，以上为最新状态。

职责 runtime-cloud-contract；从 master d38e456 建立独立工作树。原主目录 pages/index.html 混有 Rest、时间窗及复合页面草稿，保留原地，仅提取复合分析部分。实施清单：①核对已合并 API 与草稿；②独立页面脚本和既有页面入口；③孩子切换/并发读取/错误恢复与配置保存的聚焦测试；④桌面及移动 mock 目视；⑤范围、语法、diff 检查后单主题 PR。允许 pages/index.html、pages/composite-review.js、对应聚焦测试与本文档；必要 CI 仅接入页面专项。排除扩展、Native、Task、Rest、网页账本、生产配置和部署；不重复已通过真实扩展验收。

只读审查已确认草稿尚不能原样合入：详情使用列表旧 total_seconds 而非详情返回的更正后 review.total_seconds；设备展示原始 deviceId；详情及保存请求仅部分检查孩子切换，缺少同孩子刷新后的代际隔离；配置保存仍需核对共用函数实际目标捕获。应以当前服务端详情为准，设备使用局部编号，迟到结果不得覆盖新视图；这只修派生页面，不修改原账或当前配额。尚未完成页面实现和目视，不宣称通过。

实施进展：已独立提取页面区块及脚本，加入刷新代际、切换孩子立即清空、详情使用服务端更正后值、设备局部编号和保存后配置读回隔离。四项 Node VM 聚焦场景通过（跨孩子、同孩子刷新竞态、详情权威值/设备标识裁剪、配置读回迟到）；node --check 与 git diff --check 通过。尚缺桌面/移动 mock 目视、完整错误/保存流程覆盖及 CI 接入，保持未提交、未发布。共用 selectProfile 的其他配置读取竞态不在本补丁中擅自重构。

## 复合源码整合与轻量CI收尾（2026-09-28）

PR #96云端服务已合入a080c454，PR #97终端已合入3cdfe92；PR97精确head ff8c55b8的CI36354433676/36354433677通过。真实分项隐私/原账证据保留，最后普通未归类排除单次19.5秒通过（真实fallback/null且观察0），不是一次整套通过。额外受控单测证实并修复关闭后续传及可选上传占用主同步等待链：每批重核开关/绑定，独立单飞与真实AbortSignal。原扩展目录/候选/云端生产均未改变；完整功能仍缺家长页面与生产接入验收，保持默认关闭。Task仍不得发布或激活。

本收尾职责runtime-cloud-contract，仅改本记录及.github/workflows/composite-evidence.yml：将optional-evidence-runner及其单测加入现有CI路径和执行入口，避免该文件单独修订时漏检。必要本地验证仅YAML语法、路径/命令断言和diff；复用原提交产品证据，不跑浏览器或全平台。精确workflow例外用于既有兼容测试治理，不接管终端实现。

## 复合分析终端整合（2026-09-28）

PR97架构审查待证问题：证据冻结与POST之间、或首批ACK后关闭采集/切换档案时，终端可能继续发送旧证据；主云同步await可选证据上传可能延长单飞锁。先用受控单测与调用链核实，若证实只修本终端模块，不动原账/云端协议/生产。PR97当前CI范围门禁还因旧基线混入后续云端提交失败，需将最新主线合并并保留双方TASK_BOARD记录；暂不合并PR或发布。

已证实并获架构任务最小修复授权：冻结后关闭的受控测试原为actual POST1、expected0；主同步调用链在isSyncing=true期间await可选上传，catch不能隔离延迟。仅在终端证据上传每批重读开关/绑定、独立单飞与可取消总时限，取消后不得继续下一批；不修改主账ACK、云端协议或计时。新测试覆盖冻结后关闭、首批后换绑与挂起请求的主同步非阻塞。修复后仍须合入当前master以剔除PR旧基线带入的云端文件，保留双方任务记录。

修复后专项结果：observer单测含冻结后关闭和首批后换绑通过；optional-evidence-runner单测验证主同步返回时可选请求仍挂起、重入被拒、20ms期限发出AbortController真实取消且完成后可重试；typecheck/diff通过。生产默认期限15秒，cloudRequest单次请求接受独立AbortSignal，不采用仅Promise.race超时。可选任务在syncNow finally释放主锁后启动，不更改主账上传ACK；无功能时读取配置后立即退出。源代码分项审计Matched=关闭/换绑/主同步性能隔离及最小测试，Deviated/Extra=无。暂不宣称生产联调通过。

最终单项真实复验：PO授权call_OhHNkwHpj3e3K7NRpnTmvUnF，仅运行COMPOSITE_ACCEPTANCE_FALLBACK_ONLY=1场景一次，19.5秒通过。全新隔离Profile先断言真实分类为pending/null，启用采集并访问真实Wikipedia，显式观察后记录数0；证据.tmp/composite-wikipedia-UWlOs1/fallback-evidence.json。此前长测试失败不改写成整套一次通过，验收使用分项证据：真实导航/标题/模拟SPA、隐私、默认关闭/关闭清理、11秒原账不变及10+1守恒，加本次待归类排除。observer专项、生成副本逐字节检查、typecheck、扩展根目录1.90MB及diff检查通过。职责路径仅TASK_BOARD、extension与专项测试，Worker/Pages/Native/计时/原账/版本未改；Matched=本批提取与上述验证，Deviated/Extra=无。授权上传与预算压力为单测证据，尚未生产联调；完整云端功能未发布，不能宣称已上线。原主目录及固定候选保留。

保留真实证据的独立只读归属复核：.tmp/composite-wikipedia-2wFd59/observed-before-checks.json 中真实已结算网页账11秒，规范云端函数分配页面10秒、无法归属1秒，10+1=11，输入原账未变。函数来源现已提交d33540e，源码SHA256仍为fa00172d987a6fe41081497b0ad1c883c480e11e19e02f051946efcd6041ca43；此前“尚未提交”仅描述当时状态。该复核不启动浏览器，不替代最后非复合排除验收。完整真实测试仍失败/待验收，不提交复合批次，不发布。代码核实normalizer从defaultCompositeSites/defaultUserCompositeSites/customCompositeList合并effective清单，支持夹具失败原因；修正夹具尚未运行真实浏览器，等待新的单次复验授权。

PO经架构任务批准共享修复后一次Wikipedia隐私与原账不变复验（60–90秒）。测试仅在Node侧读取COMPOSITE_ANALYSIS_TEST_SOURCE指定的尚未提交云端纯函数，记录哈希和未提交来源；不打入扩展。真实普通非复合网站排除、关闭清理与旧原账不变同步核对。此次仅运行一次，失败不追加重跑。

此次真实复验失败：先因缺helper在启动浏览器前退出，补齐原隔离helper后执行唯一真实运行。Wikipedia真实导航/标题/模拟SPA观察、默认关闭及共享修复后的query/fragment排除断言通过；读取原始账时未找到Wikipedia已结算分段，仅两个about-page.chrome-local零秒分段，原因未明。关闭/非复合排除/原账不变/归属守恒后续断言未执行，不记通过；不修改网页计时、身份认证或账本来迁就测试，不再启动浏览器。证据.tmp/composite-wikipedia-4oxYoy/observed-before-checks.json、wikipedia-real.png及test-results保留。只读云端分析源SHA256为fa00172d987a6fe41081497b0ad1c883c480e11e19e02f051946efcd6041ca43，尚未执行归属函数，不能把哈希视为算法验收。

只读诊断已核实：runtime/session.js的getSession读取storage.session.session_v1与storage.local.session_v1_persistent并选较新者，测试误读local.session_v1；signal合并与后台dispatch/串行结算均异步，goto完成不等于原段已持久化。测试尚未记录真实激活/监控/焦点或等待Wiki ACTIVE，所以缺段根因仍未知；裸profile/device ID不参与activation-gate判定，不能认定假身份必然关闭监控。仅补测试阶段读取真实getTimingSession、脱敏activation/monitoring/focus及等待ACTIVE/正时长结算，保留失败现场，不执行浏览器。若在可信ACTIVE及结算完成证据下仍缺账则独立登记P0，禁止混改复合功能。

新增一次诊断复验已执行并失败在最后非复合夹具：此前ACTIVE/同tab/window/focus、真实11秒Wiki分段、标题隐私、关闭清理、旧分段不变及Node云端归属守恒断言均通过。清空compositeList后仍观察到site=wikipedia.org的复合记录，说明来源清单未清空，不能把仍明确定义为复合的网站当作普通待归类。仅修测试为同时清空隔离配置defaultCompositeSites/defaultUserCompositeSites/customCompositeList及规则，并在导航前先核验resolveManagedTargetAttribution为pending_composite/fallback；不改生产规则、不再浏览器运行。旧缺段场景未证明真实计时缺陷，不宣称已关闭历史风险。

职责extension-local，基线19eecdc。先提取原终端观察、诊断预算淘汰、授权证据上传和隐私说明；共享规范只从contracts/composite-page-evidence/v1.js受控生成到extension/core/generated/composite-page-evidence-v1.js，并校验精确字节。排除云端/Pages/Native/Popup/网页计时/原账与配额，不提升版本、不部署、不替换原候选。

顺序：共享副本与observer → 终端启动/预算/授权接线 → 终端专项 → Wikipedia真实导航/标题/SPA与已结算分段只读对照 → 类型/diff/scope/隐私与职责审查。接口、删除保护或隐私语义有差异交给架构任务，不能自行改协议。真实站点不可访问即保留阻塞，mock不替代真实验收；未完成不得提交为已验收。分类更正投影只由云端处理，不改终端原账。

当前终端observer/shared专项、typecheck/root/diff通过。真实Wikipedia观察测试只验证真实站点、真实扩展观察和结算事实；云端归属守恒仍等待规范分析模块测试出口，不使用原草稿冒充新主线算法，不因观察测试通过而关闭完整验收。

真实Wikipedia初次运行失败且保留阻塞：Chrome导航加载临时标题为无协议的en.wikipedia.org/wiki/Mathematics?observation=public-fixture#probe；共享sanitize仅去除带http(s)协议标题URL，导致查询参数通过title进入观察，路径本身正确排除查询。未上传家庭/生产数据，测试无云token。证据test-results/composite-wikipedia-unpack-10508--not-fabricate-ledger-facts/error-context.md与隔离.tmp Profile保留。不得自行更改共享规则或继续发布；提交架构任务修复规范源，终端等待更新后再生成副本。标题/SPA观察已真实产生，关闭/原账守恒后续断言尚未运行，不记通过。

共享修复接入：基于a754e95建立新隔离树；原复合树和任务记录完整保留。仅从该提交生成副本，未再次运行真实浏览器；此前隐私失败仍阻断完整验收。


## 复合页面标题隐私阻断（2026-09-28）

控件所属任务在隔离真实 Wikipedia 导航中发现 Chrome 临时标题为无协议 URL，现有共享 sanitizer 只替换 http(s) URL，导致 query/fragment 残留。当前任务修复唯一共享源：标题中的域名 URL（含无协议形式）整体替换为 [link]，并以真实失败形态补固定向量；不改网页原账、配额、页面归属算法或扩展候选。终端生成副本由所属任务同步。最小验证为共享向量/副本检查、现有证据与云端聚焦测试；真实复验未通过前保持发布阻断，不把单元通过记为完整隐私验收。

补充执行证据：云端 D1 扫描、审核意见及通知领取写入瞬间插入更正，均拒绝过期投影，聚焦集成测试通过。首次新增测试位置早于意见夹具初始化导致失败，仅移动测试顺序后通过，未为测试修改产品行为。

共享隐私修复PR #95已合入fac8d6b；源a754e95，整合head b35204a，两项CI36352503614/36352503616通过。使用D盘临时隔离树仅保留任务板双方条目解决冲突；主云端草稿仍原地保留未提交，未自动stash/reset。PO已批准一次修复后Wikipedia隐私与原账不变复验，交控件所属任务执行，结果待回报。当前更正专项额外覆盖精确集合/同数量字段变化/空集合/新head/新增设备head/严格boolean开关/解绑的SQL栅栏，全部通过。轻量workflow本地语法验证因yaml与js-yaml依赖均缺失未完成，不将其记录为通过，也未新增安装依赖。

## PO 裁决与实施续接（2026-09-28）

本批云端源码提交前审计：Matched＝只读本周更正投影、内容级快照栅栏、扫描/意见/通知竞态保护、有界重试、缺失列表拒绝、内部字段裁剪、直接归属向量和轻量CI。Deviated/Extra＝无。本批最小本地D1集成、更正专项、20项持久化、纯归属器、typecheck、YAML、diff及11路径职责检查通过（无全平台测试）。整体功能Missing＝终端真实原账对照、父页面接入验收、生产入口/schema/发布，保留关闭；本提交仅独立源码整合，不宣称完整交付、不部署。近期历史段落中的待验证状态以本条实际证据为准，不删除失败记录。

列表完整性收口：复核发现本周列表读取manifest为空时直接continue，会形成未标注的部分总量。本批改为缺失/设备日期不符即拒绝，返回前重新核对整周head集合与更正快照；同时验证内部更正快照不出现在响应。只改复合派生分析接口，不改变原始账本或现有用量/配额接口。最小回归加入缺manifest、错误日期和有效列表读取，无新增浏览器或生产请求。

归属纯函数提取验证：增加直接消费云端 compositePageAnalysis.js 的小型固定向量，覆盖整数秒守恒、90秒观察边界、重叠歧义归入无法归属、跨设备隔离、阈值和排除fallback/media。只证明派生归属器不改输入，不替代真实网页计时验收。现有PyYAML已完成workflow语法解析，未安装新依赖。最新真实复验仅证明标题隐私修复有效，因未取得Wiki已结算段而中止，关闭/排除/原账守恒尚未执行；控件任务只读调查中，不追加运行或启用。

轻量 CI 接线：既有 Composite Evidence workflow 增加终端 observer、generated 副本及专项测试路径；相关文件合入后执行副本逐字节检查和 observer 单元测试，未合入时不伪造执行。当前任务只改 workflow，不改终端实现。Rest 最终硬时间窗补验8.6秒通过，PR #94 已合并为523e93a，仅源码整合，未发布；共享标题隐私修复另见PR #95。

并发保护实施清单：更正投影保存设备 head、截止及逐项更正快照；SQL 写入条件同时核验 head/绑定/显式开启和完整更正集合，不只比较总数或时间戳。扫描更新、通知领取、审核意见及审核完成均使用该条件；详情对外不返回内部快照。固定本地 D1 竞态验证旧快照、新增/删除/同秒更正和旧 head 均不得写入。无新 migration，无原账修改。

复合分析触发阈值和页面明细统一跟随已批准的本周分类更正；只消费更正投影，不改原始 Segment、既有统计或配额算法。撤销此前未提交的 original-segments / CORRECTION_PROJECTION_PENDING 作为最终方案的设想。扫描与详情必须使用一致的更正版本，版本变化拒绝旧结果；更正移出复合后不得继续以旧阈值发送通知或宣称明细完整。本周指既有更正的有效范围，不新建更正、不扩大追溯周。

PO 接受通知确认丢失后重试可能重复，优先有界重试而非 exactly-once。现有 next_attempt_at 在 sending 时作为租约截止；过期可重领，最多五次，领取与完成用 attempts 栅栏防止旧工作覆盖新尝试。保留删除/停用保护，provider 只用假发送测试，不发送真实通知。

Rest 已获批一次修复后浏览器复验。所属任务回报超时关闭/恢复通过，结束场景失败且阈值现场未保存，硬限制未执行。继续只读诊断现存证据，不自动追加浏览器复验，不宣称全过。TaskManage 继续仅源码整合不发布。

本批仍为 runtime-cloud-contract；必要验证为复合云端本地 D1/更正一致性/通知失败竞态、typecheck、范围和 diff。Native 心跳及卸载仅作架构决策记录，不混入当前云端实现提交，不执行安装、部署、迁移或生产授权。

执行证据：通知已实现五分钟 sending 租约及 attempts 条件领取/完成，五次上限不变。本地真实 D1、假 provider 回归通过确认丢失后重试、退避前不发送、租约到期重领、旧成功响应不能覆盖新尝试、上限和停用/删除保护；typecheck 与 diff 通过。不承诺 provider exactly-once，仍可能重复。复合更正投影尚未接入，当前混合草稿不提交；上述测试不能冒充最终分类口径验收。

Native 架构结论记录在 ARM-D-035/036，已通知所属任务只对齐文档。现有代码核对确认 heartbeat 强制 windowsVersion、卸载授权当前为两次独立 UPDATE；新能力和原子协议尚未实现，不宣称已支持。

更正接入分步：先建立只读 compositePageCorrections 投影器，按同设备/日期/已发布截止读取更正并核验原 Segment 的区间、秒数、目标及原归属；只在内存迁移 daily_target 分类秒数，完整保留总秒数。缺原账、目标歧义、负余额、原归属冲突必须拒绝，不调用现有吞错返回空集的更正读取器。下一步将扫描、详情、通知和意见版本保护共同接入，纯投影器通过不代表该链路完成。最小测试使用真实 D1 夹具与纯函数，不运行浏览器或生产请求。

最新进展：扫描/列表和详情已接只读更正，来源缺失不能被解释为零；详情复核更正内容指纹，移出复合后原账不动且页面归属为零，旧触发金额清零并阻止该已更新通知。投影器本地 D1 回归、云端集成和 typecheck 通过。尚待提交前完成：扫描中更正变化的写入栅栏、通知发送前的新更正复核、审核意见写入与更正版本的原子保护及相应竞态回归。当前不提交业务草稿、不注册生产入口。

独立架构文档 PR #93 已合并：源 e1425958686fb036b787719b7aac17a36ccf6283，merge 19eecdc5920b1270d933595a17a317bf59d23a48，App Runtime 轻量 CI 36351137693 success。没有部署；Native 文档 db0852c 与本机持久化准备 ab26168 为所属任务回报，未冒充新协议上线。Rest 追加复验后结束路径通过，最终硬窗口失败已证实是空窗口表示全开放的夹具错误；PO 再批准仅该场景补验，所属任务已接收。

## NOW：复合分析云端服务接入（2026-09-28）

职责 runtime-cloud-contract，原主目录保持原样。按来源提取云端分析算法、扫描/详情/保留期服务及鉴权路由，统一使用根共享契约与 PR89/91 安全持久化；不继续维护旧收件/删除/意见 SQL。用已读完的原草稿作为来源，保留 1800 秒阈值、整数秒守恒和不更改网页账本的语义。详情按请求快照复核，意见写入必须使用服务端读出的版本，不接受客户端指定版本。

实施清单：①本记录；②云端 helper/service/router；③本地测试使用既有 schema 夹具，真实 D1 验证阈值、上传、删除、意见和鉴权；④typecheck、范围/diff及最小 CI。保留期/通知的异常和重试需审查，不把原草稿测试通过当安全结论。未通过则保留未提交现场。本批不注册入口/cron、不新增生产 migration、不改页面或扩展、不部署；完整链路验收与发布仍独立过闸。必要测试例外为新增 composite-cloud 集成测试及既有 workflow。

接入审查发现原详情只读原始分类，但已发布 V2 可能含更正，即使总量相等也不能证明归属完整。保持原计时与分类不变，明确 attributionBasis=original-segments；该档案日期存在更正时标记 CORRECTION_PROJECTION_PENDING/complete=false，不用重算值填平。此缺口仍阻断完整功能发布。通知仍需外部发送不确定结果/中断恢复专项收口；本批仅验证未删除/显式启用的发送资格和本地假发送，不调用真实通道。

当前本地进展：云端 service/router 已接安全组件并与独立 cloud analysis/shared contract 分离。Miniflare 真实 D1 集成通过：显式开启、阈值/幂等扫描、分块重放、档案归属、意见与完成状态、删除后拒绝/不重建、已删除通知拒绝、历史更正不伪报完整、固定原账 JSON 不变。鉴权函数和发送 provider 使用夹具，不等于真实 token 或外部通知验收。typecheck/diff 通过；初次类型检查发现 Receipt 联合类型旧访问，已改为判别检查。尚未提交，通知恢复/一致性及完整隐私验收仍待审，不注册生产入口。

补充核验与纠正：readManifestAccountV2 只读取已提交设备原始 rows，本身不套更正；更正由 profileAccountSnapshotsV2 的 applyCorrectionsToCompactDeviceAccounts 另行应用。因此原分析“触发与详情一定混用更正”的判断不成立，是否跟随本周更正属于未裁决产品口径。当前 CORRECTION_PROJECTION_PENDING 仅为未提交的保守草稿，不能作为已批准规则合入。已集中向 PO 请求选择原始分类明确标注，或触发/明细一起跟随更正；未改变权威账本或配额。

通知风险用实际 processCompositeNotifications 函数和假 DB/provider 复现：第一次模拟送达后确认丢失抛错，第二次处理再次发送，syntheticDeliveries=2、attempts=2、finalState=sent。全程无网络或真实账号。已有 sender 未提供本功能的幂等发送键，原 sending 状态也无中断恢复。已请求 PO 在“未知结果不自动重发”与“允许可能重复以优先送达”间裁决；不假设 exactly-once，不自行改共用发送服务。

补充竞态验收通过：真实本地 D1 中，在读取页面证据之后、详情响应完成之前删除详情，reviewDetail 拒绝返回并报告 COMPOSITE_REVIEW_CHANGED；删除后再次 GET 无页面证据。只注入调度时点，不模拟数据库内容。当前仍等上述两项产品裁决及控件所属任务的 Rest 修复复验；任务状态已核实为 idle，不能继续称其浏览器验证正在运行。未重复派发空任务，未提交未决语义。

## Rest 终端整合（D-107，2026-09-28）

收口审查：日周840默认/独立阈值/合并弹层/继续硬限制核验/Admin只读为Matched；Popup、D-099、Worker/Pages/Native及计时账本均排除，无Extra/Deviated。提醒109项、终端配置、storage配置、Content媒体边界专项、typecheck、extension-root、diff与extension-local职责检查通过。真实扩展用量夹具场景和硬窗口单场景证据分别保留，不宣称未修改夹具后的整个长流程一次通过，不宣称真实计时精度；Admin仅实际HTML/CSS/函数的mock配置桌面及390px目视通过。原失败证据保留。准备独立源码PR，不合并、不部署、不升级版本。

PO追加批准仅补跑硬时间窗优先单场景（约20秒），通过后按既有授权审查并提交独立源码PR；不重复60秒流程，不部署、不更新固定候选。测试通过环境变量REST_ACCEPTANCE_HARD_ONLY=1选择这一场景，证据必须区分局部复验与此前完整流程的部分通过记录。

硬时间窗独立复验通过（8.6秒），使用真实SW/Content/访问路由，记录hard_limit并进入既有Reminder。补齐本地Admin只读面板的桌面/390px目视证据：复用实际HTML/CSS及渲染函数、隔离mock配置，明确不等同登录/同步全流程验收。

PO经架构任务明确批准修复超时关闭竞态及一次聚焦真实复验：Content仅关闭匹配token的弹层；旧token不得关闭或恢复新提醒。无弹层的其他frame继续既有媒体恢复。修复不改变超时、自主度、配额或账本语义。

修复后证据：提醒专项109项通过，终端配置专项和typecheck通过；一次获批真实复验已执行。超时继续的状态、弹层关闭和媒体恢复断言全部通过，桌面/390px截图已目视核对。随后结束场景未出现提醒按钮而失败；尚未取得该次evaluate返回及阈值现场，不能判定产品错误或夹具问题，硬限制路径仍未运行。本批保持待验收，不提交/PR，禁止把该次部分通过写成整体通过。新增证据位于.tmp/rest-unpacked-cenzZ8及test-results。

后续仅增强测试诊断：逐次保存脱敏evaluate结果（原因、日周阈值、prompt摘要）与真实session/活动tab/窗口焦点；结束前等待ACTIVE且Rest桶与活动tab匹配并断言已投递prompt。不得改产品逻辑或伪造会话；本轮不重新启动浏览器。唯一后续真实验证命令为npx playwright test tests/e2e/rest-weekly-unpacked.test.js --reporter=line，预计约2分钟，需另行授权。

追加授权复验结果：日/周各自到期、合并、继续、跨日/跨周、真实60秒超时继续及结束休息通过；最后硬时间窗断言失败。已证实测试把restWindows=[]误当禁止，core/time-windows.js的normalizeWindowList空数组返回null且isWithinWindowList(null)为true，实际为不限时间。本轮仅修正测试为合法且不覆盖当前小时的窗口；不修改产品时间窗。证据.tmp/rest-unpacked-KV9JPJ/diagnostic-events.json保留真实ACTIVE+rest及120秒日周阈值/投递结果。硬限制场景仍待对修正夹具追加验证；未再次启动浏览器，不提交未通过整包。

职责 extension-local；基线 5eb5855，按 PO 批准方案仅提取日周 Rest 阈值、合并弹层、继续硬限制核验及 Admin 只读配置。排除 Popup 应用/网页计算、D-099 页面观察、云端、Native、版本和发布。主目录与固定候选保持原样。

检查表：补丁块提取 → 提醒/配置专项 → 隔离 unpacked 真实 SW/Content/媒体页测试 → 类型、diff、职责检查 → 独立提交和回报。用量夹具只加速阈值，不证明计时精度；真实验收缺失或失败不得记为通过。不写家庭数据，不改网页 ACTIVE/原账/聚合。

当前状态：Rest 补丁已提取，提醒专项106项、终端配置专项、storage配置专项、typecheck及extension-root通过。真实unpacked日提醒、日周合并、滑动继续恢复媒体、跨日与跨周场景通过；超时继续后弹层未关闭，两次真实运行失败，按执行次数门禁停止复验。后台已记录timeout_continue，Content仍显示弹层；代码存在后台只恢复媒体未关闭弹层、页面迟到继续请求返回stale_prompt的竞态。结束与硬限制后续场景尚未执行，不记通过。未提交、未发布，截图和失败记录位于隔离树.tmp/rest-unpacked-*与test-results，均不纳入版本库。

复合批次等待架构任务交付共享规范源SHA及固定向量：contracts/composite-page-evidence/v1.js为唯一来源，终端仅使用受控生成副本extension/core/generated/composite-page-evidence-v1.js；不手工维护第二套算法。原主目录31项脏路径及固定加载候选保持原样。
## NOW：复合页面证据共享来源（2026-09-28）

职责 runtime-cloud-contract；契约级源码整合，不启用采集。清单：①在根 contracts/composite-page-evidence/v1.js 提取既有身份、脱敏、JSON SHA-256、北京时间日期和容量/保留期常量；②固定向量及生成副本逐字节检查；③现有轻量复合证据 CI 接入。云端阈值/归属/建议算法不进入本契约。终端生成副本与 import 由控件任务实施，本任务不修改 extension 或 dist。

最小测试：共享纯函数固定向量、原草稿导出行为对照、检查器接受一致/拒绝不同或缺失副本、diff 和 YAML。无 UI、平台、安装器、账本或生产测试；无部署。新目录为网页与 Guardian 共享，不关联 Native 固定包版本。精确例外为本契约、检查工具、专项测试及既有 composite-evidence workflow。

提交前证据：固定向量与原草稿导出 parity 通过；副本检查器拒绝缺失/字节差异，通过一致副本；YAML/diff/职责检查通过。首轮截断测试错误使用连续长英文，先命中既有长标识脱敏，改为中文长度夹具后通过，未修改产品规则。Matched＝本批源提取/向量/检查器/CI；Deviated/Missing/Extra＝本批无。终端生成副本尚由所属任务接入，完整复合分析隐私和真实验收未通过，不宣称上线。

## PO 补充边界：TaskManage 可整合，不发布（2026-09-28）

PO 明确允许 TaskManage 继续代码审查、最小相关测试、提交和 PR 源码整合，但本轮不得发布。合并前核对自动部署触发器；若会触发部署，先停止该合并而不是借源码整合绕过发布边界。保持 Task 默认关闭，不部署 Worker/Pages、不更新扩展候选、不发布创建入口；网页记账开关段专项改动仍未批准。已通知 Task 所属任务和控件任务。源码已合并与产品已发布必须分别记录。

## NOW：复合证据请求与意见删除保护（2026-09-28）

延续已复现隐私缺口，不增加产品能力。职责runtime-cloud-contract；只修改现有compositePageEvidence.ts及其D1测试。清单：①扫描生成/替换请求必须在事务内校验当前设备V2 head、档案显式开启、绑定和review删除墓碑；相同manifest不清空已收证据，旧head不得替换新请求；②复核意见写入必须校验同档案未删除review及调用方已验证的请求版本快照，删除/新扫描后旧页面结果不得回写；③删除与上述写入顺序、解绑/关闭、旧版本及事务回滚固定测试。保持原32 schema，仅本地夹具补既有head表；不接路由/cron，不执行migration，不改扩展、账本、配额或生产。

最小验证为既有composite-page-evidence.test.js新增相关用例、typecheck、diff/范围与现有Composite Evidence CI；无需新workflow、UI/平台/账本全量测试。完整原服务仍须单独接入、脱敏及真实终端验收，不因补齐repository而宣称已上线。

本地执行证据：Miniflare D1 聚焦回归 20/20 通过，root TypeScript typecheck 与 git diff --check 通过。包含扫描旧版本、删除墓碑、绑定/启用检查、事务中断和过期意见回写保护；仍未接生产路由或 cron，未部署。

提交前审计：本批 Matched＝请求事务保护、相同版本不清空、删除后不能重建请求/意见、意见版本检查及回滚回归；Deviated/Missing/Extra＝无。职责差异检查通过，测试文件使用精确例外。完整功能待接入与终端验收的范围不变。

## 两仓现状复核与处置清单（2026-09-28 04:25 +08:00）

本节覆盖下方历史盘点时点。TimeOnChrome fetch 后 origin/master=7c87dd4，87个本地引用、102个origin引用（含HEAD）、32个工作树；GitHub当前无开放PR。Native origin/main=c770bb8，唯一开放PR #11仍为draft；PR远端0724d36、本地活跃5ccad87是不同进度，不将本地提交冒充已推送/CI通过。没有prune/pull/reset/stash或删除。

| 工作线 | 独有改动/合并证据 | 工作区与依赖 | 当前处置 |
|---|---|---|---|
| 治理、历史证据、时间段输入、Task安全云端 | 下方逐批来源映射；本轮后续PR #88→774b744、#89→7c87dd4已合入 | 当前隔离树干净，仍持有mock/本地D1依赖 | 已整合；生产状态另列，不重复合入 |
| Task最终模块与7aa6b1b旧ACK补丁 | 主线progress-ledger保留显式acceptedIds/current batch交集；固定测试覆盖缺失/空/非法/批次外ACK。#85分支0d4ad24为主线祖先 | 原f805仍6项改动，含UI草稿/output；宿主树干净但有截图输出 | 已安全整合default-off；旧整体分支保留可追溯，P16草稿保留未决；不启用/发布创建入口 |
| 日周Rest | Worker校验/default840及页面PR #72/#86已合；原终端尚未独立收口 | D:/Codex/TimeOnchrome 31项modified/untracked，47项ignored目录/文件入口 | 云端源码已合，完整功能待终端及真实验收；不发布新页面/默认配置 |
| 复合页面分析 | 安全持久化e7e61a7→7c87dd4；CI36347563898和36347563817通过 | 原service/schema哈希仍为068d27ae…/7c05bdae…，原工作树未改 | 只完成不可达持久化组件；原扫描/审核/脱敏/通知/终端仍未合，不执行032，不宣称线上修复 |
| Native 2.6.8统计 | PR #10已合c770bb8；986d1ec与main整树完全一致；c5c9b85/6c51a0d来源已由56dd562/0dd9829保留 | 原Native主目录32项脏路径，37项ignored入口；独立整合树干净但有16项产物/固定包依赖 | 已整合源码与已安装证据分开；原树不能删除，旧来源提交不重复合入 |
| Native跨平台PR #11 | 活跃开发，最新本地相对main领先51提交、远端35；不把旧CI当新提交证据 | 活跃隔离树干净但有22项构建/契约/产物入口 | 保留活跃，由Native任务推进；不以整理名义强合或发布 |
| 旧Runtime文档/旧网页计时分支 | b7d8278/52ec058/5f14cab/8da97d5不是祖先，但已有下方内容恢复映射；网页旧引用按已记录patch-id/整树证据处置 | 不仅凭ahead/behind或分支存在判断未整合 | 已等价保留/已替代待归档；不重放旧账本行为 |

本次跨工作树首次受沙箱Git所有权限制，错误被重定向导致空输出；这些“dirty=0/ignored=0”结果已作废。随后在用户上下文逐项检查退出码复核：主目录31、81a1为1、f805为6、归属修复树为2、职责树为1、拆仓树为1项脏路径；其余列举工作树干净。未读取ignored文件内容，涉及运行候选、安装包和私有证据的目录全部保留。

### 版本与线上证据（本次实际回读）

| 对象 | 实际状态 | 不得混同 |
|---|---|---|
| 已安装Native | 11个TimeOnChrome exe/dll均2.6.8.0；Service Running/Auto | 不等于R2 latest或活跃Mac分支 |
| 原扩展候选 | 固定81a1/dist/native-host-managed-candidate/package-extension，manifest1.7.39 | 未替换，非正式托管发布 |
| Guardian | deployment fb981642-336f-476f-80cc-7fc836e89253；version0d040402-210b-4b29-a390-9f7908bfe329，100% | 后续#84–#89源码合并没有再次发布 |
| Runtime Worker | deployment80a30421-6d72-4f22-a973-1b48425785a0；versionb00deec4-b3ca-40f7-8b10-6536af07f10b，100% | 保持原版本 |
| Runtime Pages | f2a6ca68-8e6f-42f7-b82e-9bf42b06e6ad，source aa5382e | 与主Pages独立 |
| 主Pages | 861552b0-c362-4101-8ade-6f44de64a0e2，source c76de93 | 新Task入口/日周页面尚未部署 |
| R2 latest | API仍2.3.1；size118739813；sha2563109d6bbd147f5bfba88549a240dae42e84e724aa86bd1baef724d2df7b17563 | 只回读声明，未重复下载大包复算；未切换latest |

Wrangler4.127.1只读deployment核对；Runtime health200，Runtime目录无认证401，两稳定Pages200，Guardian SSO无认证401。不带家庭凭据、不创建业务数据；这些smoke不能代替登录后业务验收。

### 精确清理候选（只列清单，未批准删除）

以下均已验证主线祖先、工作区干净且ignored入口为0；不代表可以立即删除。尚需实际清理前确认没有其他任务使用，故当前执行删除数为0。恢复可使用表内保留SHA重建分支/工作树，无需回退主线。

| 目录 | 分支 / 保留SHA | 建议 |
|---|---|---|
| D:/Codex/TimeOnchrome-worktrees/runtime-historical-evidence-recovery | codex/runtime-historical-evidence-recovery / 711a5da6989a5ccb5dcb682da7accf7f645b0f73 | 已合并，列入单独批准清理清单 |
| D:/Codex/TimeOnchrome-worktrees/two-repo-inventory | codex/two-repo-inventory / 75ee2c95538b8ad262385cb6a3b41772dfe1220c | 已合并，列入单独批准清理清单 |
| D:/Codex/TimeOnchrome-worktrees/inventory-disposition-closeout | codex/two-repo-integration-result / 3fd53900343cd032079f5948c07121be0bc39d52 | 已合并，列入单独批准清理清单 |
| D:/Codex/TimeOnchrome-worktrees/timewhere-split-final-20260927 | codex/timewhere-split-final-20260927 / b9819b190215ce0c7929cab66dd534b3e89d1144 | 已合并，列入单独批准清理清单 |
| D:/Codex/TimeOnchrome-worktrees/task-domain-integration | codex/task-cloud-premerge-audit / 4a94ee69c5b09cd2ab6369bbaff18043646f08f2 | 已合并，列入单独批准清理清单 |

当前运行工作树、81a1候选、主目录、f805、Native活跃树、含唯一安装包/截图/运行依赖的发布树均不在可直接清理范围。未推送的C:/tmp/TimeOnchrome-task-ack-strict虽实现已保留，仍先保留原引用，不因无upstream直接删。

本批职责runtime-cloud-contract，纯盘点证据：仅diff/文档与轻量CI，排除产品测试、构建、安装、部署与迁移。Matched＝新合并证据、版本分层、实际线上回读、精确处置与脏树保护；Deviated/Extra＝无。整体未验收的Rest/复合功能继续如实保留，不宣称全部功能完成；Task启用已由PO明确排除本轮，Native新跨平台开发保留活跃，不隐式扩大整理目标。

## NOW：复合页面证据持久化安全整合（2026-09-28）

职责 runtime-cloud-contract。先处理已复现的删除/在途上传竞态：从原未提交服务提取独立持久化模块，保留原 JSON 哈希、分块和 ACK 语义；写入、读回、标 ready 均校验当前请求版本、同档案有效设备、显式启用和删除墓碑。删除在事务内完成。只集成不可达组件，不接主 Worker 路由/cron，不增加生产 migration 或采集；原工作树不动。原扫描请求重建、脱敏、通知、终端与页面仍须后续单独整合，不能把组件测试称为完整功能可用。

实施清单：①本记录先行；②workers/src/services/compositePageEvidence.ts；③原032 schema仅作tests/fixtures/composite-page-evidence-schema.sql，新增tests/unit/composite-page-evidence.test.js使用本地D1验证删除前/中途、版本切换、停用、解绑、重复/冲突、完整/分块和事务中断；④最小CI、typecheck、diff/范围及审计。精确例外为上述两项测试文件与.github/workflows/composite-evidence.yml；无页面/Agent改动，不跑UI/平台/账本全量。无生产 smoke，因为不部署或启用。

提交前审计：Matched＝持久化组件写时校验、元数据冲突拒绝、逐块幂等、整体哈希与唯一ID后ready、删除墓碑及同档案删除、D1原子回滚；本批Deviated/Missing/Extra＝无。Miniflare真实D1固定回归14/14、root typecheck、YAML、范围和diff通过。schema去注释/空白归一后SHA256=064607245f24a8eb0d65def1839656f474e3bea3a30dd379edf7cd227d1fb70d，与原032一致但只在测试夹具保存。Node yaml依赖未安装，改用现有Python yaml解析通过，未新增依赖。Cloudflare当前D1 batch文档核对事务回滚；类型按仓内4.20260529.1验证。完整功能仍未接入：原请求生成、行级隐私脱敏、审核意见删除竞态、通知及终端联合验收继续待审；不得把本组件通过称为原脏服务或线上已修复。

## PO 裁决：Task 本轮收口为默认关闭（2026-09-28）

PO 已明确选择「保持 Task 默认关闭，本轮只收口已安全整合部分」。取代下方“等待 Task 网页记账裁决”的阶段状态：本轮不实施 background/foreground-timing/session 的访问与开关段协调，不激活 Task，不发布创建入口，不替换原扩展候选。正式启用与真实网页原账专项验收移为后续独立任务，不再用它阻塞本轮其他安全整合，也不将其写成已验收。

所属任务已核实 codex/task-host-wiring-v1 工作区干净，无未提交/未跟踪新增，HEAD 与远端均为 0d4ad24；相对当时 origin/master 为 0 ahead / 6 behind。PR #85 已合入，保留 default-off message/alarm/Admin 宿主、异常隔离和整体移除证据，无需重复 push/rebase/测试。该分支只列为已合并待清理，实际删除仍为零。

本批职责 runtime-cloud-contract，纯文档：只运行 diff 与轻量职责门；不跑产品测试、不部署。Matched＝PO 裁决、所属任务回读和代码/部署状态分离；Deviated/Extra＝无。整体尚待收口的复合隐私与 Rest 终端工作不因本裁决被宣称完成；Native 跨平台 PR #11 保留活跃，不强行整合未验收新功能。

Native 卸载只读兼容核对：当前 v2Repository.authorizeUninstall 成功消费一次性码后立即设置机器 revoked_at_ms；authenticateMachine 排除已撤销机器。因此保留本机数据/Keychain 不等于重装后旧 token 可恢复。当前两条 run 非同一 batch，部分失败与重装恢复须另行明确；已通知 Native 任务，不自行删除身份、改变协议或执行卸载。该发现是后续生命周期风险，不扩大本轮整合为卸载重构。

## 当前整合状态与下一阻塞（2026-09-28，覆盖下方阶段快照）

| 工作线 | 最新可核验结果 | 下一步／不能冒充的完成 |
|---|---|---|
| 云端通用模块入口 | PR #84 fbb7846→1308981；Task Console36345837970、主入口36345837985、轻量门36345837987通过 | 已合源码；未部署主Pages |
| 终端默认关闭宿主 | 所属任务PR #85 0d4ad24→3ac8da1；CI36346038007成功；实际diff无Task install或ACCESS_OBSERVED接入 | 默认关闭；原候选未替换。78/78 Task、114/114 Admin、独立browser/removal smoke为所属任务证据，当前任务只读审查，不伪报自己重跑 |
| 日周软配额云端 | PR #86 aba2b4e，同步后45e7d27→8f598b2；36346347732/738/723/709四组CI成功 | 默认840及页面独立日周配置已合；终端原工作线和真实验收未完成，不部署或写生产配置 |
| Guardian Task安全准入 | PR #82，生产36345123042，Guardian版本0d040402-210b-4b29-a390-9f7908bfe329 | 已发布；本轮后续源码合并没有重复生产发布 |
| 复合页面分析 | 原脏目录保留；只读审查复现删除与在途上传竞态 | 未合并，不执行032 migration；需先修复云端证据删除原子性及真实终端隐私验收 |
| Native跨平台PR #11 | 继续保留活跃；有所属任务本地编译/便携测试报告 | 真Mac/Swift、系统权限与安装恢复证据缺失；不强合、不发布，不把新功能扩展混作历史分支清理 |

Task专项门：所属任务确认先于原handleModeEvent/executeModeDecision直接return会跳过分类/mode副作用，独立timing监听还可能已打开ACTIVE；直接close也可能错误关闭并发旧段。已向PO提交窄项选择：保留core访问副作用与失焦/idle事实链，仅增加Task阻断，并原子协调前台边界、后台不干扰、无模块等价；固定竞态及真实原账对照后才启用。未获该单项裁决前保持default-off，不能用总体整合授权替代D-076。其他独立工作不因此暂停。

复合隐私复现（非生产）：使用原032 schema及从receivePageEvidence源码提取的UPDATE/INSERT，在内存SQLite模拟“请求已读→删除详情→上传继续”，结果details_deleted_at=99但request.status='ready'且chunks=1。该结果证明原SQL允许删除后重存储，不代表真实生产已发生。原服务SHA256=068d27ae891441bf04a0035b19d7fddcbef2d888b01bb12256a38e9b432b0759；router=8aaa7b46c78dc5c43340f1c19ab459573ffdb1251158fbd4dbe565816767e074；schema=7c05bdae2dc20386cc3e447f2d486e455fee453a6e6e26d91309953680b0e4a3。云端修复须在事务写入时重新核对请求版本、有效配置/绑定及删除状态，详情删除完成后在途请求不能重建证据；当前仅登记，不称已修复。

本次证据收口只改TASK_BOARD/PROJECT_MASTER，职责runtime-cloud-contract，diff与轻量CI；不重跑产品测试、不部署。Matched＝三批源码合并/对应CI与发布分离/原地保护/隐私SQL复现；Deviated/Extra＝无；整体Missing＝上述专项边界、终端联合验收与复合隐私修复。分支/目录清理执行为零；没有凭此删除任何旧产物或脏目录。

## NOW：日周休息软配额云端页面整合（2026-09-28）

PR #84通用入口fbb7846已合入1308981a9df59fb05d30b4b528deefe75fe4fb09；Task Console36345837970、主入口36345837985、App Runtime36345837987通过。没有Pages部署，终端联合门仍保留。

本批职责runtime-cloud-contract，来源为主目录现有未提交且已批准的日周Rest改动；原目录不动。实施：①将旧D-100软配额决策映射到D-107，保留主线原D-100；②只提取profiles默认weeklyFirstReminderMinutes=840、主Pages自主度日/周独立开关/时分编辑及导入导出，不提取compositeReview或终端；③复用已有可选字段验证，补云端聚焦测试及桌面/手机mock；④通过后独立PR，仅源码整合。上线须与终端提醒实现及真实验收共同收口，不因页面通过就宣称功能生效。

最小验证：Worker默认/校验、Pages配置与日周开关/保存/导入导出聚焦测试、TypeScript、桌面/手机截图、职责与diff。精确例外docs/DESIGN.md、docs/UI_STYLE_MAP.md、tests/unit/rest-weekly-cloud.test.js、tests/manual/rest-weekly-cloud-ui-smoke.mjs及.github/workflows/rest-weekly-cloud.yml（同一主题的最小消费CI）。不运行Native/安装器/全量扩展/账本测试，不部署、不写生产配置。保留媒体不计、借用Rest计入、硬上限优先的既有语义，但本批不触碰这些计算。

本批提交前审计：Matched＝13个来源页面hunk及Worker默认、独立日周配置/共用间隔、原导入差异选择/null保留、最小消费CI；Deviated/Missing/Extra＝本批无。Worker原校验23/23、新云端默认及view测试、Pages字段242/242、mock保存/无效时分拒绝/两者关闭/导入导出选择通过；1440×1000及390×844截图目视通过，typecheck/内联JS语法/YAML/diff/职责通过。首轮mock误用config而非实际接口data，保存回读为空使断言失败；修正夹具后通过，未改变产品回读语义。整体仍缺终端独立整合与真实联合验收，不部署、不修改旧工作树。

## NOW：云端通用模块入口（2026-09-28）

职责runtime-cloud-contract；仅pages/index.html增加通用/modules/链接（桌面次级导航及移动更多），恢复旧8603fbb独立模块目录和optional-modules.json，不往主控制台加入Task状态或业务。目录严格验证同源路径和字符串字段，加载/空目录/错误可辨识；保留返回控制台，长标签窄屏可达。通过现有Task页面mock追加目录与导航验证，不访问真实家庭或启用终端。该批只整合源码，部署仍等待SPEC-002终端能力及受控验收。

最小测试：现有Task页面mock与桌面/窄屏截图、JS语法、diff/职责；精确例外docs/UI_STYLE_MAP.md、tests/manual/task-v1-pages-ui-smoke.mjs、.github/workflows/task-console.yml。CI仅补目录与导航消费路径，不运行Worker/Native/账本或安装器测试。

提交前审计：Matched＝桌面次级入口、移动更多入口、独立目录/返回链接、同源路径及完整字段验证、加载/空/失败/重试、长内容窄屏。Deviated/Missing/Extra＝本批无。现有mock共41项检查通过（含原Task回归及13项目录/导航检查），directory.js语法、diff与职责检查通过；4张1366/430px截图已目视核对。主控制台截图仅验证真实导航布局，其统计API故意未提供mock，不作为主统计成功证据。静态测试服务器补SVG/PNG MIME，等提示自然消失后截图，未隐藏产品错误。Task Console CI仅增加实际入口消费路径；无生产自动触发，Pages部署仍待终端专项门。

## 当前整合：Task安全准入已发布，整体仍进行中（2026-09-28）

PR #82（功能1859278、同步主线37a66f1）合入master b46d17662d56abc98059fa80ba54167f97bf82d2。PR Task Cloud 36344952784及App Runtime轻量门36344952778成功；精确master Guardian门36345062971成功。受保护生产36345123042成功，仅Guardian部署为0d040402-210b-4b29-a390-9f7908bfe329。没有执行migration或部署Runtime/Pages/R2；发布manifest artifact 10940505176，ZIP摘要b20fb8b90482ab38d41256b679276fda2ffae0895ca179c41f67b10ae8770e05。未回读该ZIP内容，不把上一部署资源版本冒充本次逐件核实。

发布后无认证smoke：根200、家长Task列表/创建401、设备Task列表/progress401、SSO401。不带凭据，不创建生产任务。首次误用非Task路径命中通用200，已按实际router更正后复验；该错误路径不记为安全通过证据。生产配置/数据未主动写入。

剩余工作分开推进：通用云端模块入口尚未整合/部署；终端PR #80已default-off合入37d2e48，所属任务继续message/alarm/UI宿主，ACCESS_OBSERVED跳过核心开段需先完成网页落账硬门的具体影响审查，不用“核心文件无diff”替代语义证明。Rest/复合页面分析原脏目录继续保留；控件任务当前返回空回合，不能标记已完成。Native图形配对有本地提交及便携测试报告，但真实macOS/Swift、安装升级卸载仍未通过，保留未完成。

本批仅文档证据：diff/职责检查，复用精确代码与CI，不重跑产品测试或生产部署。Matched＝本批安全补丁合并/发布/无认证smoke；Deviated/Extra＝无；整体Missing为上述未决项。未删除分支、目录或候选，目标继续active。

本批提交前审计：Matched＝创建/编辑前当前有效域名与精确对象黑名单校验、策略读失败503、拒绝无Task/审计写入、最小消费CI；Deviated/Extra＝无。本地资源校验15/15、真实鉴权+D1路由10/10、实际Worker入口6/6、typecheck和Wrangler dry-run通过（795.53KiB/gzip154.31KiB），diff通过。未改网页原账、配额、扩展、Native或生产数据。整体Missing仍为通用入口、终端访问前置硬门裁决与联合验收、Rest/复合工作线和Native实机验证；本批不声称完整目标完成。

安全回归发现：既有resolveSiteAccessClassification的decisionToClassification未映射blocked规则，精确URL夹具首次失败。Task准入按SPEC-002不可穿透黑名单要求，显式复用normalizeSiteClassificationRule/siteDecisionMatchesUrl检查已配置blocked对象，再使用原effective域名分类；不修改共享解析器或网页运行时。精确URL/YouTube及不同对象反例必须通过后才提交；既有解析器缺口转终端任务只读调查。

本批补充（2026-09-28）：PR #80 已在缺失焦点/idle事实不累计进度修复后，以8ef79a6通过CI 36344367668并合入37d2e48；仍默认关闭，未改原扩展候选、未部署。云端安全批次补齐精确URL及YouTube对象回归，CI仅补实际消费的系统配置/分类解析器路径；.github/workflows/task-cloud.yml为该轻量CI的精确职责例外。整合目标继续进行，不因本批测试完成收口。

## 当前整合：独立Task页面已合入，入口/安全核对继续（2026-09-28）

本批安全校验实施清单（runtime-cloud-contract）：①独立resource-policy读取当前profile配置及系统配置，复用既有effective配置和网站分类解析器，只读且不修改网页分类；②POST创建/PATCH编辑在写入前校验canonical域名、URL、YouTube对象，命中blocked拒绝，读取失败/损坏配置503不写任务；③以本地夹具验证系统/自定义黑名单、子域、精确对象、受限非黑名单可用及无写入；④再运行受影响router/真实入口回归、typecheck/dry-run。允许精确测试路径tests/unit/task-resource-policy.test.js、task-router.test.js、task-worker-entry.test.js；专项CI只增加本测试。现有终端基础安全阻断不变，旧任务和原账不追溯修改。通用UI入口另批提交，避免安全修复混入UI。

PR #81功能提交0da0313549d4f6ae97ebfb86e59b13d7d37aafc7已合入master e6215f1b38fa30bd28d485fb682181a7b526b163。Task Console CI 36344019422（真实mock浏览器28项及截图artifact）和App Runtime轻量门36344019268成功；无关产品job跳过。fetch/祖先关系已验证，原页面分支干净。没有Cloudflare Pages部署，源码合入不等于生产入口开放。

下一批codex/task-cloud-entry-and-safety继续D-106：恢复通用模块目录入口，核对并补齐SPEC-002创建/编辑黑名单资源拒绝。当前router/repository未读取档案黑名单，不能用终端访问时基础阻断替代保存校验。实施前读取网站策略权威及现有解析器，再明确最小安全回归，不改网站分类、网页账或配额。

终端PR #80（8a6f9b2）default-off代码和范围CI已核对，但只读审查发现checkpointCurrentPage把idle查询失败视作active、窗口查询失败视作前台，缺事实可能累计Task进度。已交所属终端任务限定修复并追加同一PR，先不合并或激活；当前任务不越界修改。Native分支仍活跃、Mac CI额度与真实验收待解决，不用本地编译冒充实机通过。完整目标保持未完成。

## NOW：Task 家长页面独立整合（2026-09-28）

追加页面专项CI：.github/workflows/task-console.yml只匹配pages/task、页面mock脚本、锁文件及自身；运行现有浏览器mock，保存脱敏夹具截图，不触发Worker/Agent全组。此workflow为本任务精确职责例外。通用入口与生产启用保持下一独立批次，当前页面实现提交不等于完成入口或部署。

页面批次提交前审计：Matched＝来源映射、独立四文件、共享资源向量、档案/请求归属、加载失败禁用、暂停/恢复/完成/取消revision与actionId、历史只读、创建中切换不清新草稿、桌面/移动布局及轻量CI；Deviated/Extra＝无。本批页面回归共28项通过（含5个共享canonical向量），module语法/YAML/diff通过。UI_STYLE_MAP.md与tests/manual/task-v1-pages-ui-smoke.mjs为界面规范/聚焦验证精确例外。整个Task目标Missing继续包括通用入口、黑名单配置校验核对、终端启用及受控联合验收；不因页面包提交提前部署或宣称完整交付。

本批已恢复四个独立页面文件并加入档案generation/请求sequence校验、加载失败禁用及重复操作保护。浏览器mock回归10项通过，覆盖逐条资源、canonical去重、430px无水平溢出、刷新禁用、旧档案迟到及503失败；桌面1366px与窄屏截图已目视核对，双列/单列、资源及动作可达。另有内存状态5项检查通过。最初Node默认CommonJS语法检查不适用于浏览器module，改用--input-type=module后两文件通过，未修改模块类型来绕过检查。diff检查通过。

当前尚未提交：生命周期动作/创建中切换与重试回归、通用入口整合、范围审核仍待完成。没有部署页面、启用终端或创建生产任务；不把上述mock通过等同联合实机验收。终端所属任务已返回default-off PR #80（8a6f9b2），待独立审核，不将其测试转述为当前页面证据。

职责 runtime-cloud-contract，来源固定为8603fbb的pages/task四个文件，不复制旧主控制台。执行清单：先恢复独立页面和资源编辑器；再校验档案切换、迟到响应、加载失败和重复操作；最后完成mock桌面/移动视觉及聚焦回归。加载或切换档案时清除旧列表并禁用创建，响应必须属于当前档案及请求版本，旧操作不得刷新或清空新档案表单。

最小验证为页面语法、资源编辑器及mock页面回归、桌面/移动截图、职责检查和git diff --check；测试精确例外为tests/manual/task-v1-pages-ui-smoke.mjs。排除Worker全组、Native、安装器及网页账本测试。本批不修改扩展或原候选，不提前部署Task页面；正式入口仍依赖终端capability和SPEC-002分阶段验收。审查发现旧页面代码不能直接作为安全整合证据；另须核对创建/编辑黑名单资源校验要求，未核实前不宣称完整Task验收通过。

## 当前整合结果：Task 云端已合入并独立发布（2026-09-28）

本节覆盖下方阶段性“未注册／未部署”状态。PR #78 已合入 `12b5c274adcd09055390de87ee7b3c087afdd68f`；功能提交为 `e6b0ac7`、`175d225`。最终 PR 范围门 `36342765504` 通过，精确 master 的 Task Cloud `36342837031`、Guardian compatibility `36342837038` 均通过。没有绕过前一轮过期断言失败；补正阶段断言及精确测试路径声明后再合并。

受保护生产流程 `36342931431` 成功，仅部署 Guardian Worker `cd95182c-4edb-4eb3-9b25-880f87852baa`，来源为上述 master SHA、Contracts `1.15.0`。未执行迁移：已存在的 Task schema 只恢复源码来源，不因空的 d1_migrations 登记而重复应用或伪造记录。发布后无凭据 smoke：根路由 200；家长 Task 列表、设备 Task 列表／progress、Guardian SSO 均为401。没有创建测试家庭任务、读取任务内容或主动修改生产数据。

发布清单核实未改变：Runtime Worker `b00deec4-b3ca-40f7-8b10-6536af07f10b`；Runtime Pages `f2a6ca68-8e6f-42f7-b82e-9bf42b06e6ad`；主 Pages `861552b0-c362-4101-8ade-6f44de64a0e2`；R2 latest `2.3.1`。GitHub Pages 原有自动构建不是这两个 Cloudflare Pages 的发布证据，不混同。

整体目标保持进行中：Task 家长页面、终端 default-off 整合及激活前异常隔离／存储预算验证、真实联合验收仍未完成；Rest／复合页面分析脏工作树继续原地保留，由所属任务提交明确证据。Native PR #11 仍是独立活跃工作线：所属任务报告新 macOS 扫描修复因其 GitHub CI 计费限制未获 runner，不能用旧绿色结果覆盖新提交；不因此停止其他可完成工作，也不修改计费或强行发布。

本批仅文档证据，职责 release：只运行 diff／范围检查和轻量 CI，复用既有精确 SHA 代码证据，不重复产品测试或部署。审计 Matched＝本批 PR/CI/Guardian 发布/无凭据 smoke/资源隔离；Deviated、Extra＝无；完整目标 Missing 保持上述清单。未删除分支、worktree、候选产物或唯一证据。

## NOW：Task schema 来源恢复与 Guardian 独立入口整合（2026-09-28）

文档先行：恢复8603fbb已批准最终两份SPEC-002，使用D-106映射旧分支编号，不能覆盖主线D-058等既有决策。真实生产只读结果改变了下一步：四张Task表和七个显式索引已经存在且与最终021结构一致；当前聚合行数1/1/10/1，d1_migrations为空。恢复原SQL来源而非新建033或盲跑旧迁移；不读任务内容、不写生产。

本批清单：①恢复原名021/022 SQL并本地验证schema等价、幂等和已有数据保留；②独立Task router在Guardian通用路由之前分发，其他路由不变；③真实Worker bundle＋本地D1验证无认证401、跨家庭拒绝、设备绑定、合法生命周期/ACK及Task拔除后的原路由；④补齐Task专项CI路径与受保护发布所需精确SHA证据。职责例外为tests/unit/task-worker-entry.test.js、tests/unit/task-router.test.js、两份SPEC-002和Task专项workflow（云端测试/最终规格/CI），不扩权扩展或Native。最小测试：新增迁移/入口、受影响router、Guardian集成、typecheck、Wrangler dry-run；不重跑无改动生命周期/进度全组、Windows/macOS/WiX或浏览器E2E。本轮不会执行生产迁移；发布仅在合并与专项门禁通过后进行。

本地验证：真实入口/迁移6/6、router9/9、Guardian integration、TypeScript及Wrangler dry-run通过，bundle 792.64KiB/gzip153.51KiB。首轮夹具缺少通用设备审计表产生warning；补入既有017仅在本地运行后重测无warning，未关闭审计或修改产品代码。新增本地试验在有既存Task/网页行时重复运行021，Task行、网页行完全保留；Task关闭的对照bundle在四条原路由行为相同。Task CI新增master精确SHA触发供后续发布验真；不增加部署权限。

PR #78首轮Task CI `36342430000` 因旧domain测试第41行仍断言入口未注册失败，非领域函数失败。补充精确范围例外tests/unit/task-worker-domain.test.js：移除仅适用于PR #73阶段的未接入断言，保留领域无fetch/DB/env副作用的约束；实际接入、拔除及原路由行为由新增真实Worker测试覆盖。按实际变更仅追加运行该domain测试，不扩大全平台测试；失败未合并。

本批审计Matched＝最终规格/编号映射、现存schema恢复、独立入口、真实运行时鉴权与原路由对照；Deviated/Extra＝无。整体Missing仍包括页面/终端/受控联合验收。终端所属任务发现optional host异常隔离和Task队列字节预算两项激活门禁，正在独立default-off包处理；本批不激活扩展、不开家长创建页、不把旧生产少量Task数据当作正式验收。

## 整合连续推进与迁移来源核对（2026-09-28）

Task 生命周期批次已通过 PR #77 合入 master `b44b4add3d038add9ff2819d113e191e8357d79e`；功能提交 `0d7e516`，Task Cloud CI `36341535920` 成功（24秒），App Runtime 轻量门 `36341535849` 成功，无关产品 job 跳过。本地生命周期10/10、路由9/9、进度11/11证据沿用，不为文档重复执行。工作区干净后从该远端主线建立 `codex/integration-migration-review`，未切换用户主工作树。

下一批职责仍为 runtime-cloud-contract：先核对旧最终 Task schema、现有迁移编号及已执行记录，再整合必要云端入口；终端实现已交原 Task 所属任务审查，不能由当前任务越界修改。旧 `8603fbb` 的 `021_task_management_v1.sql` 包含四张独立 Task 表；`022_task_management_device_capability.sql` 已全部为 superseded 注释。主线已有不同用途的021/022并到031，主目录另有未提交 `032_composite_page_reviews.sql`。不能直接复制旧编号执行，也不能覆盖032；新迁移编号与生产是否已执行仍须核实。当前未新增或执行生产 migration，未注册 Task router，未部署。

本审查批次只运行 Git来源、文件内容及 diff 检查，不跑产品全量测试。实施清单：①保存PR合并及CI证据；②核对迁移来源/编号/远端执行状态；③按所属任务继续页面与终端整合；④满足专项门禁后才发布。整体目标仍 active：Rest、复合页面分析、完整Task联合验收与对应发布尚未完成；Native跨平台草稿保留活跃，不因本批整合而强行合并。目录清理仍只列清单，不执行删除。

## NOW：Task 生命周期原子写入与动作幂等（2026-09-28）

上一批PR #76已合入a7dee75；真实本地D1 11/11，不代表完整Task上线。GitHub CLI失效但原Chrome登录可用，已通过现有浏览器完成PR，没有创建凭据。

本批职责runtime-cloud-contract，变更等级为云端持久化/权限相关修复。依据8603fbb最终SPEC-002：创建、编辑和家长动作必须审计；action ID幂等、revision冲突不得覆盖、完成/取消不可恢复。旧router仅凭事件ID存在就返回成功，且先更新任务再单独写审计，存在内容冲突与中断缺审计风险。

生命周期本地D1已10/10通过，继续同主题接入未注册的Task router，替换其两阶段写入，验证真实账号JWT/设备token、错误归属、过期/损坏认证、设备重绑后的capability隔离。Task heartbeat摘要只保存已有activeTaskIds/count/nextTaskAt字段，保持有界合法JSON；绑定在实际写入时再次检查。请求体限定256KiB且必须为JSON对象，避免旧代码把解析失败静默当空对象。Task专用轻量CI只针对模块/测试路径运行上述聚焦检查，不触发平台或产品全量测试；不改现有生产workflow。

实施顺序：①repository创建与编辑和对应审计置于同一D1 batch；②生命周期动作在repository内校验固定动作、revision、actionId与操作者，条件更新与审计原子提交，重复仅当任务/档案/操作者/动作/revision/备注一致才成功；③固定真实本地D1回归覆盖事件写失败、同动作重试、冲突重用、并发动作、终态、进度与动作竞争；④后续router只调用原子接口，不保留独立审计写入口。当前不注册生产router，不执行migration，不部署。

最小测试为Task生命周期本地D1、受同库影响的进度11项、domain、TypeScript、职责/diff检查；现有CI汇总门；无部署smoke。排除扩展/Native/全平台/UI测试。本地夹具和生命周期测试允许精确路径例外，不扩权其他模块；不改原网页账、策略或生产数据。

本批本地结果：生命周期10/10、router真实JWT/设备token与本地D1验证9/9、原进度11/11、domain五组黄金向量及TypeScript通过；workflow YAML、7文件职责及diff检查通过。node yaml依赖不存在，改用环境现有PyYAML完成纯语法检查，没有安装或修改依赖。独立task-cloud CI仅跑这些必要测试，共享鉴权或锁文件变化也触发真实消费者。新增路径例外：tests/unit/task-lifecycle-repository.test.js、tests/unit/task-router.test.js（云端专项回归），.github/workflows/task-cloud.yml（本批最小CI，不含发布权限）。

本批审计：Matched＝创建/编辑/动作原子审计、完整动作幂等比较、revision/终态、家庭隔离、设备改绑能力、请求有界及对应D1测试；Deviated/Extra＝无。完整Task的Missing＝入口/迁移编号与生产审查、云端页面/终端集成及真实联合验收，仍不称上线。本批未修改workers/src/index.ts、原网页账本、云端生产配置、扩展候选或任何Native代码。

## NOW：Task 进度持久确认与恢复修复（2026-09-28）

本批实现结果：本地 Miniflare/D1 11/11 通过，包括真实 SQLite trigger 中断后的整个 batch 回滚、相同消息重复确认、旧事实无投影恢复、并发设备区间并集、完成审计幂等、暂停重放、绑定隔离和100项限额。TypeScript、原领域5组黄金向量及 diff check 通过。Miniflare 5 alpha 的构造接口与旧README不一致，已使用该锁定版本导出的 convertV4MiniflareOptions；此前两次初始化失败不是数据库测试结果。一个测试区间误超90秒已修正为合法区间，未放宽产品校验。

本批审计：Matched＝原规格校验、原子写入/投影/完成审计、重复ACK、部分写入恢复和本地D1验证；Deviated/Extra＝无。整体Missing＝生命周期原子性与router/鉴权/迁移整合、终端真实链路和生产发布，继续保持未完成。repository其余方法按8603fbb保留，尚未注册至生产入口；不能因本批通过就宣称完整Task可上线。终端任务已返回独立ACK修复7aa6b1b及90/90测试，本批不修改扩展或候选产物。

测试路径职责例外仅限 tests/unit/task-progress-repository.test.js（云端持久确认测试）与 tests/fixtures/task-management-schema.sql（本地D1夹具，非生产migration）。GitHub CLI在沙箱及正常网络下均报告既有凭据无效；不创建新凭据，不把本地提交当作已推送/合并。

职责 runtime-cloud-contract。原Task任务已回读SPEC-002及终端代码：有效区间不超过90秒，seconds必须等于区间floor秒数；没有部分区间裁剪协议；acceptedIds表示已持久确认（包括一致重复）。依此修复，不新增计时语义。

实施清单：①提取8603fbb的repository，保持其余方法原样，进度写入委托独立实现；②严格校验身份/有限整数/区间/秒数，拒绝同ID内容冲突；③按任务在D1 batch中原子执行事实插入、并集投影、自动完成事件和状态更新，提交后逐项确认；④重放一致记录可恢复旧的事实已存/投影缺失状态；⑤本地D1验证重复、事务中断、并发、家庭/设备隔离、暂停/完成后重放与合法毫秒边界。

性能边界：每次最多处理前100项，每组最多50项；只返回已确认ID，旧客户端会保留其余项补发。按任务分组重建并集，不逐段重建；不新增表、路由或生产migration。设备必须仍绑定到请求的profile；相同ID跨设备不确认。原终端ACK收紧由所属任务独立实现。

最小验证：Task领域原向量、进度本地D1测试、TypeScript、职责与diff检查；安装依赖仅使用既有backend锁文件中的本地D1运行时。测试夹具保存旧021表结构但不登记为生产migration。排除Native/安装器/网页账本/E2E；完整Task路由、生命周期写入、页面与终端整合仍有独立闸门，当前不部署。

## NOW：Task 云端合并前可靠性阻塞（2026-09-28）

来源严格固定 `codex/task-management-v1@8603fbb`，不是当前生产 Worker。按 Cloudflare/Workers 规范审查该最终树的 router/repository，并在内存 D1 适配器中执行原 repository 经 TypeScript transpile 后的函数；没有改源文件，没有访问生产数据。此证据是受控逻辑复现，不是实际 D1 事务或浏览器验收。

| 阻塞 | 复现/代码依据 | 合并前要求 |
|---|---|---|
| 进度秒数与区间不一致仍被接收 | `ingestProgressSegments` 对600秒区间、上报1秒保存seconds=1，随后只SELECT起止时间，投影600秒。正常终端appendSegment会先裁剪区间至90秒再floor；不能把非法输入复现冒充正常用户已发生多记 | 服务端依据既有终端协议验证区间/秒数一致性；冲突不能靠猜测有效时间位置补齐 |
| 合法重复记录没有ACK | 合法60秒输入第一次确认1项，第二次 `INSERT OR IGNORE` changes=0，acceptedIds为空。终端只删除acceptedIds中的pending，空数组不会触发其fallback | 相同身份且内容一致的已持久记录可重发确认；不同内容或跨归属冲突不能当重复成功 |
| 插入成功、投影失败后不可恢复 | 合法60秒插入后在all()注入失败；重试已有行changes=0，不加入affectedTaskIds，原事实保留60秒而completed_seconds仍0，且没有ACK | 写入/投影必须有事务或可靠恢复边界；中断后重放完成修复，再返回确认，不丢失、不重复累计 |

其他仍需验证：生命周期更新与事件是分开的写入；同actionId但不同动作是否能误获成功；进度上传与家长暂停/完成并发；设备重绑后的capability关联。这些目前是代码审查风险，不记为已复现故障。

实施边界：当前架构任务负责云端实现；已向原Task任务请求只读核对终端协议和原规格依据，未让其改网页账。已合入的纯domain/向量不包含上述repository或router，不能因PR #73通过就放行完整功能。原网页usage_segments_v1、配额、Task脏工作树和扩展候选均未修改；不执行migration，不部署任何资源。

验证口径：首次诊断适配器SQL绑定索引写错后已修正；修正后的三项复现和独立合法60秒重试/中断复现均得到上述结果。生产修复尚未实施，不称测试全通过或可靠性已解决。后续最小验证须含真实本地D1幂等/中断/并发、家庭隔离及终端ACK兼容；不运行无关Native或安装器测试。

本审查批次Matched＝精确来源、完整链路只读检查、受控复现、旧路由保持不可达；Deviated/Extra＝无；整体Missing＝上述阻塞修复和真实D1/终端验证。不能原样合并并上线旧Task后端，也不能把此文档当作修复完成。

## 当前整合入口（2026-09-28，覆盖下方历次盘点快照）

本节是两仓整理的当前状态；下方保留初查和执行证据，不再把旧的“等待授权/尚未推送”当作当前阻塞。职责 runtime-cloud-contract；本批仅文档与 Git 来源复核，验证 diff check、职责检查及轻量 CI，不运行产品测试、不部署 Cloudflare、不操作安装或 R2。

| 工作线 | 已核对的整合结果 | 剩余工作与处置 |
|---|---|---|
| 项目契约、盘点、历史证据 | PR #64–#69 已合入；缺失原始 manifest 与来源映射保留 | 已整合；旧工作树/引用仍保留，不需要重复合并 |
| Native 2.6.8 独立应用统计 | Native PR #10 → main c770bb8；当前/上一契约各216/216 | 已整合；本机四个 exe 为2.6.8.0，Service Running/Auto；未切换R2 latest |
| 时间段输入格式规范化 | PR #70/#71；主 Pages deployment 861552b0-c362-4101-8ade-6f44de64a0e2 | 已整合、已部署；其他云资源未随该批发布 |
| 日周 Rest | PR #72 → 325961e，仅可选 weeklyFirstReminderMinutes 校验 | 完整功能未完成：默认值、云端页面、终端提醒与真实浏览器验证仍待所属任务；本批未部署 Guardian |
| Task 最终独立模块 | PR #73 → dc3e2dd，保存最终 domain.ts 与五组黄金向量 | 完整模块未完成：router/repository、迁移编号、鉴权、页面/终端接入及验收未整合；不恢复被最终方案替代的核心账本接入 |
| 复合页面分析 | 主目录未提交内容原地保留 | 真实站点/unpacked证据未收齐；不将 mock 当真实验收，不部署未验收部分 |
| Native 跨平台与图标 | 唯一开放 PR #11 为 draft；主目录另有未提交内容 | 保留活跃，由 Native 任务推进；离线自签/同版本恢复证据不等于跨版本升级与完整实机验收，不合并或部署草稿 |

现场核对：TimeOnChrome origin/master dc3e2dd，Native origin/main c770bb8；TimeOnChrome 开放 PR 为0，Native开放PR只有#11。固定原目录扩展候选manifest为1.7.39，不替换目录、不重新绑定。Native脏目录保持原状。这里只核对了上述本地/远端Git状态；云资源版本沿用已记录的发布回读时点，不伪称本批重新发布或重新核验全部线上资源。

### 旧引用补充裁决（精确 patch-id 与主线祖先）

| 旧引用/来源 | origin/master 中的等价提交 | 处置 |
|---|---|---|
| codex/perform-final-code-audit-for-project、v0/release-verify：a9a029d | 5522478（stable patch-id一致） | 已等价整合；不重放旧OpenCode工作流 |
| release/v0.1-duration-accuracy：b7fc476 | 3d5fcbd（stable patch-id一致） | 已等价整合；不能据旧测试基线改动现行账本 |
| stg：c68e779/a452a3f/f36366e/47eb41d/78cff02/107f5a4 | 83bb3ce/b1bb857/a0c3c5d/8a26f65/41753e3/70cf96e | 六项patch-id一致，stg最终树与70cf96e整树一致；不重复合并 |

清理仍只出清单、不执行：上述引用具备内容保留证据，但尚未逐项证明没有构建/运行/证据依赖，不能据此删除目录。原扩展目录、脏工作树、活跃工作线和唯一安装包/截图继续保留。

本批审计：Matched＝遗漏引用等价映射、PR #72/#73合并状态、候选/安装版本分离、原地保护；Deviated/Extra＝无。整体Missing＝Rest/复合页面分析/Task未验收整合项及Native活跃开发项；不能把当前整理记录当作这些功能已发布。后续按所属任务和真实验收继续，不为版本统一重复构建、安装或部署。

## NOW：Task 最终领域规则保存与整合（2026-09-28）

- 职责 runtime-cloud-contract；来源 codex/task-management-v1@8603fbb 最终树。仅原样提取 workers/src/modules/task/domain.ts 和 tests/fixtures/task-resource-canonical-v1.json，并增加独立服务端回归，不依赖旧扩展源码。
- 规则语义沿用该工作线已批准最终设计：hosts/urlRules/specialTargets，保留业务query、去除tracking/hash，YouTube对象独立解析。此批是不可达的纯函数库，不安装router、不接入repository、不建表、不添加管理入口，不改变访问管理或网页账本。
- 最小验证：原文件Git blob一致、既有五组黄金向量、无效输入与核心字段可编辑边界、TypeScript独立编译、diff与职责检查。无浏览器/Native/生产测试；不部署任何资源。
- Task完整功能仍待：终端验收、旧migration编号与决策编号迁移、当前鉴权兼容复验及各层接入；不以纯函数合入宣称Task上线。原P16脏目录原地保留。
- 结果：两个提取文件与8603fbb来源Git blob完全一致；五组既有向量、非法输入、编辑边界与未启用运行入口检查PASS；独立TypeScript编译及diff check PASS。Matched＝原样来源/纯函数隔离/聚焦测试；Deviated/Missing/Extra＝无（此保存批次），完整模块仍待后续。

## NOW：日周 Rest 云端兼容校验分批整合（2026-09-28）

- 职责 runtime-cloud-contract；从主目录未提交日周软配额实现仅提取 profiles.ts 的 weeklyFirstReminderMinutes 校验。允许 null 或1–10080整数分钟，字段缺失兼容旧客户端，纯校验不改配置对象。
- 本批不加入默认840、不接入管理页、不启用终端提醒，不复制复合页面分析、migration032、扩展或候选文件。剩余默认值/页面/终端仍待独立整合与真实浏览器验收；不得称日周功能完成。
- 必须验证：独立服务端字段边界与旧字段兼容、配置并发聚焦回归、TypeScript、diff check及职责检查；不跑 Native/Console/全量终端测试。只提交和PR整合，不部署Guardian或修改生产配置。
- 结果：独立 Worker 校验23/23、配置并发回归PASS、contracts1.15.0 build与根TypeScript检查PASS、diff check PASS。测试证明合法边界/非法类型/旧字段及无对象修改，不代表真实终端提醒验收。
- 本批审计：Matched＝只提取六行可选字段校验及独立回归；Deviated/Missing/Extra＝无（此兼容校验批次）。日周软配额完整功能仍未完成，不触发生产发布。

## NOW：时间段输入规范化独立整合（2026-09-28）

- 职责 runtime-cloud-contract；从最新 master 独立提取主目录已有小修，只修改 pages/index.html、对应 pages-config-v12-fields 聚焦测试和本记录，不复制 Rest/复合页面分析等其他脏改动。
- 将已有校验允许的单数字小时及首尾空格规范为 HH:MM，再进行重复检查和保存；结束 24:00 保持允许，开始 24:00、非法格式和取消保持拒绝/无变更。不修改时间段语义、账本、配额算法或已有用户配置。
- 验证：页面配置聚焦测试、主控制台入口测试、桌面/移动 mock 目视与添加行为、职责差异检查、git diff --check；CI 使用现有主控制台/轻量 gate。不运行 Windows/macOS/WiX/账本全量测试。
- 通过后 PR 合并，仅发布主 Cloudflare Pages，核对精确 SHA 和静态回读；不发布 Worker、Guardian、Runtime Pages、安装包或 R2。生产不写家庭配置。
- 本地结果：pages-config-v12-fields 242/242、app-runtime-integration PASS；独立 file 页面禁止 fetch 后，三种入口输入 ` 8:00 ` / ` 24:00 ` 均保存 08:00–24:00，1440×1000 与 390×844 截图目视通过（output/schedule-desktop.png、schedule-mobile.png，本地忽略证据）。未登录、未写家庭配置。
- 提交前审计：Matched＝仅提取格式规范化/取消与非法输入保持/三入口回归/桌面移动布局；Deviated/Missing/Extra＝无（本批实现）。
- 已发布：PR #70（076cedb）合并为 c76de935680fabb2d0c9f4bf5f1f1fcc5180a38d；PR gate/launch-route 和主线精确 SHA CI 36334102016 均成功。production run 36334138843 成功，仅部署 mainPages，deployment 861552b0-c362-4101-8ade-6f44de64a0e2。稳定地址 HTTP 200，回读包含 normalizeScheduleTimeInput 和六处 prompt 调用。
- 部署 manifest 核对：Runtime Worker b00deec4、Guardian 8d21c210、Runtime Pages f2a6ca68 均保持盘点基线，R2 latest 仍2.3.1；migration 为空。原脏主目录及固定扩展目录未改动。此项已整合/已部署，不代表 Rest、复合页面分析或 Task 模块已验收。

## 2026-09-28：两仓已批准整合结果（覆盖下方旧审批阻塞）

- 用户直接允许 Native 分支推送、创建并合并通过 CI 的 PR 后，已推送并合并 TimeWhereNative PR #10；main 为 `c770bb85f39c6173b314a476b794d0ecd7eace29`。来源 c5c9b85/6c51a0d → 56dd562/0dd9829，追加测试修复986d1ec；不重复合并原统计分支。
- 首次 PR CI 36331374355：安装器通过、窗口测试15秒超时，215/216；没有绕过。Native所属任务将固定延时改为Dispatcher空闲等待，完成信号移至STA退出后，并隔离WPF并行；保留15秒上限和所有断言，不声称已证实唯一远端根因。
- 修复后实际 PR CI 36331875038：当前1.15.0、上一兼容1.14.0各216/216；WiX/Burn与native-gate通过。macOS与本改动无关，跳过不记作本轮通过。与原6c51a0d整树比较仅测试和WPF-TESTS.md有差异，已安装产品代码未变。
- 本机Host/Service/Manager仍2.6.8.0，Service Automatic/Running；原目录扩展1.7.39保持。包来源c5c9b85与哈希沿用初查表，不将新CI产物伪装成已安装产物。本轮未安装、上传R2或切换latest。
- TimeOnChrome治理/盘点/历史证据PR #64～#68已合入，当前记录基线626e7d2；对应最终GitHub Pages run36328878048成功。没有Runtime业务代码变更，因此没有重复部署Cloudflare Worker/Pages/Guardian；不能把GitHub Pages部署说成上述资源更新。
- 保留活跃工作：Task最终模块及P16、主目录Rest/复合页面分析/时间段输入、Native另行开发的macOS及图标。它们不是本次可直接发布的历史残留，未强合、覆盖或删除；按所属任务和既有验收门禁继续。新提出的macOS heartbeat `windowsVersion`必填兼容缺口单独登记，不混入2.6.8统计整合。
- 清理执行清单仍为空：原扩展加载目录、全部脏/活跃工作树、唯一包与截图证据保留。已祖先/已等价引用有来源SHA可追溯，但删除仍须逐项批准，不自动prune。

本批审计：Matched＝直接授权/Native受测PR合并/固定契约/失败修复再验/版本分离/原地保护；Deviated/Extra＝无；Missing＝无（本批2.6.8统计源码整合）。不能据此宣称所有保留活跃功能已开发、验收或部署完成。此更新仅文档，diff check和轻量CI，不重复产品测试。


## NOW（2026-09-27）：分支处置复核补充

后续来源审查：

- `codex/stats-accuracy-min-verify` 与 `pr-3-pip-background-media` 同指 a09cb35；GitHub PR #5 确认已压缩合并为主线祖先 3bbb411，两者整树比较无差异。归为已等价整合，不重放11个旧提交。
- `release/v0.1-duration-diagnostics@c74d4d4` 是 a09cb35 的祖先，因此已被上述压缩合并保留，不重复合入。
- `pr-1-timing-trace-verify` 的受控测试提交 d45ff2a 对 a09cb35 patch 等价；后续485e336的测试稳定化已在a09cb35演进（允许真实ACTIVE/非ACTIVE链路并按受控domain筛选事件）。旧测试期望不是当前产品规则，不恢复旧版本；保留来源，列为已替代待归档。
- `pr-2-recovery-crossday` 的5a10998/3d92e28/8f1138f由range-diff映射至5418bd9/aa98143/f414279；对应最终runtime/recovery.js与runtime/session.js逐文件比较一致，signal和测试混有后续媒体/校准演进，不能称整树等价。列为已替代待归档，禁止为清理回放旧账本补丁。
- `codex/timing-productization@28f90d6` 的新增测试、两个smoke文档与主线祖先241c4d6逐文件相同；popup实现随后增加本地未绑定支持，之后测试又改为“本次”口径。归为已替代待归档，不恢复旧“今日＋live”实现。
- 当前TimeOnChrome主线已包含本次有效治理/证据整合，未发现需要借历史分支重写现行网页账本的依据。活跃Task和主目录未验收功能继续保留，不把它们算作废弃。
- Native远端PR再次只读查询仍为空；0dd9829整合推送被安全审批拒绝，已向用户请求直接确认，尚未收到。不得换工具或由其他任务代推绕过。

当前完成审计：Matched＝引用/工作树/版本清单、来源映射、治理及历史证据PR #64–#67合并、GitHub Pages对应部署成功、未删目录/未动候选；Missing＝Native受测整合的远端PR/CI/合并、活跃功能独立验收与相应业务发布。整体目标保持未完成。统计源码未合入前不发布新包；治理文档发布不能冒充Cloudflare业务部署。剩余审批阻塞不通过重复测试或重复发布绕开。

本节是下方初查表的后续裁决，保留初查记录而不混淆时点。职责 runtime-cloud-contract；只读 Git/所属任务报告及文档，最小验证 diff check，不运行产品测试，不修改终端或迁移。

| 工作线／对象 | 复核证据 | 当前处置 |
|---|---|---|
| 项目契约 b2c5b22 | PR #64 合并 b028662；CI/Pages run 36328067144/36328066839 成功 | 已整合，旧工作树仍有工具状态，不删除 |
| 盘点清单 | PR #65 合并 d965f85；Pages run 36328248058 成功 | 已整合，持续追加处置 |
| 历史发布证据 5f14cab、52ec058/b7d8278、8da97d5 | PR #66 合并 bd4b9ef；原 manifest Git blob 一致；CI/Pages run 36328384661/36328384289 成功 | 缺失 manifest 已恢复、历史出处已补录，旧 PR #12 已关闭；不恢复旧 NOW |
| release/v0.0.1-profile-config-integrity@df03d19 | 主线祖先 4054598 明确记录 PR #2 压缩合并；git diff 4054598 df03d19 为空（整树相等） | 已等价整合，不重复合入7个历史提交；保留引用待单独清理批准 |
| audit/codex-full-review@8086b96 | 仅2个旧审查上下文文档提交；宣称 event_log_v1 为时长真值，与现行 usage_segments_v1/D-076 不一致 | 已替代待归档，不能恢复成当前架构真值；原引用保留 |
| codex/task-management-v1@8603fbb | 所属任务确认14个提交均非patch等价；主线没有等价Task模块。最终独立模块替代了中间核心账本接入实现 | 保留活跃；未来以最终树分为云端/终端整合包，禁止整体强合或逐提交恢复旧账本方案 |
| 主目录未提交 Rest/复合页面分析/时间段输入 | 原 TASK_BOARD 明确 verification/real-site/visual pending，当前范围约31条未提交/未跟踪路径 | 存在未决改动；不把代码存在当作可发布。保留原地，按所属功能验收后独立整合 |
| Native 2.6.8 统计 | 隔离整合 c5c9b85→56dd562、6c51a0d→0dd9829；所属任务报告树相等、21/21及TRX、包哈希一致 | 待整合；远端推送被安全审批拒绝任务转交授权，等待用户直接确认；不绕过拒绝 |

### Task 工作线逐项来源映射

- 63aca3e：保留批准语义，但 D-056～D-060 编号与主线冲突，后续重排，不直接覆盖。
- a5644f1/f37853b/62622eb：保留最终领域基础、Worker、缓存能力；旧路径已被79cd507重构，不独立恢复中间结构。
- f06e13f/e5018b6：只留历史，向核心Segment写Task字段/从核心Segment投影进度已被独立Task ledger替代。
- 7faf8eb/28cfa91/432630c：只提取最终optional-module UI、独立/task与模块接口，不恢复旧嵌入或直接mode逻辑。
- 78287e0/40467d5：历史gate/完成表述，不移作当前验收结论。
- 79cd507/d788f8c/8603fbb：最终模块架构、heartbeat可靠性和30分钟capability gate，应在后续受控整合保留。
- 原021/022 migration与主线编号冲突；主目录又有未提交032，本轮不分配/执行新migration。直接文本冲突涉及19个重叠路径中的admin/background/pages/worker等，必须按职责分包。
- Cf805 未提交 P16：任务板/界面说明、admin模块入口、required页面按钮调整及 output/9张截图均归原任务，原地保护。

### 仍未完成

Native远端PR及最终主线整合；扩展timing/stats/recovery/pip等历史工作线的逐项行为审查；活跃功能的后续独立验收。没有删除分支/目录，没有安装或切换R2。当前已发布的是GitHub Pages随治理主线的既有流程，不冒充Runtime Worker/Cloudflare Pages业务发布。Matched＝证据复核/三批合并/发布作业/原地保护；Missing＝上述未决项；Deviated/Extra＝无。


## NOW（2026-09-27）：恢复遗漏的历史发布证据

职责 runtime-cloud-contract；仅文档/既有历史 manifest。将 5f14cab 的 2026-09-15 原始 manifest 按原路径、原内容恢复，记录 52ec058/b7d8278 和 8da97d5 的历史来源，不移植旧 NOW/完成结论覆盖现状。验证 JSON 解析、Git blob 与来源一致、diff check；不运行产品测试，不触发 Cloudflare 发布、安装、migration 或 R2 写入。PR #64/#65 已分别合并为 b028662/d965f85；PO 最新授权允许既有 GitHub Pages 随 master 合并发布。旧 PR #12 待本批合入并证明证据保留后再关闭。


## NOW（2026-09-27）：两仓分支与版本盘点、分批整合

执行更新：PO 最新持续目标已明确授权提交、合并及部署，解除此前“不部署”约束；不授权删除目录、覆盖脏改动或绕过账本专项门禁。契约 PR #64 已合并为 b028662，GitHub Pages 既有自动流程随该提交执行；盘点分支保留任务板两侧章节。后续 Native/控件分别按所属任务审查，不混合发布未经验证的功能。

职责：runtime-cloud-contract。阶段一仅 Git、文件元数据、版本及哈希核验；文档仅 diff check，无产品测试、安装、部署、migration 或 R2 写入。已 fetch 两仓（包含 Native 旧历史克隆），未 prune/pull/reset/stash。以下为核验时点快照，不代表其他活跃任务之后没有新改动。

### 版本证据（分别记录，不强求一致）

| 对象 | 核验结果 | 证据／限制 |
|---|---|---|
| TimeOnChrome origin/master | 8afc4ba6bf9f24f343081257862603da9056d05f | fetch；本地主目录 master 仍为 2b9d461 且脏，不更新 |
| Native origin/main | 28373a955c14bdd91d82c1bfe341fb21442724c1 | 新克隆及旧历史克隆均 fetch |
| Native 活跃源码 | codex/manager-usage-statistics@6c51a0d；产品提交 c5c9b85 | 两个提交尚未推送，不等于 main |
| Contracts 当前 | 1.15.0；SHA256 5a3f3762fee88e3cf1bd8140ac2716407a40566d2248de6c497cc7fb36c07073 | Native 固定包实际哈希匹配锁 |
| Contracts 上一兼容版 | 1.14.0；SHA256 05fdff9a4480f0dd32736ecdc4aee0113b5a6189427082351ea54dfab71d0518 | 固定包实际哈希匹配锁 |
| 扩展 master manifest | 1.7.34 | git show origin/master:extension/manifest.json |
| 原目录候选 | 1.7.39；native-host-development | 81a1 工作树 dist/native-host-managed-candidate/package-extension；保留加载目录，不宣称正式托管发布 |
| 本机已安装 Native | 11 个 TimeOnChrome exe/dll 均 2.6.8.0；Service Automatic/Running | 文件版本及 SCM 只读查询；不等于 main 或 R2 latest |
| 本地 2.6.8 Burn | SHA256 de5b9a841ff6e51ac2abdab2d10d40878f94a032acce3ffcc9f87e501ce27d9a | 实际文件哈希匹配 manifest；源码 c5c9b85 |
| 本地 2.6.8 MSI | SHA256 44402c1dc98440baa455b14bd6c45ef8aebd20a5ff4337ef440084c5972a9b3f | 实际文件哈希匹配 manifest；内部未签名 |
| Runtime Worker | deployment 80a30421-6d72-4f22-a973-1b48425785a0；version b00deec4-b3ca-40f7-8b10-6536af07f10b | Wrangler deployments list 当前最新记录，2026-09-26T20:20:08Z |
| Guardian Worker | deployment 887ee2ba-d062-472c-b8ca-c1840c7c5374；version 8d21c210-b9fd-46b5-969e-0f4c84451715 | Wrangler 当前最新记录，2026-09-26T13:10:07Z |
| Runtime Pages | f2a6ca68-8e6f-42f7-b82e-9bf42b06e6ad；source aa5382e | production deployment list；未另行证明稳定域名响应字节 |
| 主 Pages | c2d25d50-18ed-4d49-8938-9b7e67c07a17；source cffcee2 | production deployment list |
| R2 latest 公共 API | 2.3.1；Burn 118739813 bytes；SHA256 3109d6bbd147f5bfba88549a240dae42e84e724aa86bd1baef724d2df7b17563 | 现场只读 latest 响应；本轮未下载大包复算，不把 manifest 声明当下载实测 |

### 整合批次与未决项

1. 优先项目契约 b2c5b22，已推送并创建 PR #64；task-scope、CI routing、diff check 及 CI gate（run 36326348537）PASS。盘点 PR #65 首次文档 CI gate（run 36326408264）PASS。受 master 自动发布副作用阻塞，未合并；不混入扩展或 Native 实现。
2. Native 所属任务已确认 c5c9b85/6c51a0d 尚未推送或整合，建议契约先行后单独统计 PR。复用原 21 项聚焦测试、Manager/Service 编译和实机记录；未找到独立 TRX，证据来源为既有提交/README，不能记为本轮重测。Native README 已追加未提交整合跟踪；Assets/Brand 是另一项已交付未接入图标，不混入统计 PR。统计 PR 须声明 native-local，并精确解释 .github/workflows/native.yml 的 2.6.8 artifact 路径例外。2.6.8 包、usage-statistics-ui 证据、固定契约及旧克隆三个工作树继续保留。当前会话不改本机实现。
3. 扩展历史工作线及主目录混合脏改动交控件任务核对；云端部分由当前任务协调。任务管理工作树独立保留。涉及网页账本的历史补丁只读核对，不能因整合而绕过 D-076。
4. PR #12（5f14cab）及 b7d8278/52ec058/8da97d5 为未整合历史发布证据，不能将旧 NOW 状态整体覆盖当前任务板。先保留来源，审查后只迁入仍缺失的历史事实。
5. 4408b16 虽 patch-id 不等价，但相关扩展实现及测试与 master 文件比较已无差异；仍有文档差异，不能重复合入实现。
6. GitHub Pages legacy source 指向 master，合并可能触发 pages build and deployment；在保证本轮不发布前不得直接合并。不能把事后取消当作保证无部署的门禁。

### 全部分支／跟踪引用清单

祖先表示完整可达，不仅是 ahead/behind。非祖先额外以 git cherry 检查 patch 等价；“独有”仍需功能审查，不自动代表必须合入。下表精简 SHA 仅用于阅读，完整对象仍保留在 Git；未执行任何 ref 删除。历史混合分支默认保留，不整体 merge。

<details>
<summary>TimeOnChrome：137 个本地／跟踪引用</summary>

| 工作线 | SHA | 独有／等价提交 | 合并状态 | 所属／处置 |
|---|---|---|---|---|
| codex/app-runtime-2.2.1-release-evidence | b7d82784d571 | 2 / 0 | 未决独有改动 | 架构／云端；保留，所属任务审查 |
| codex/app-runtime-2.2.2-release-evidence | cc0c49831863 | 0 / 0 | 主线祖先 | 架构／云端；已合并，清理仍需依赖审查 |
| codex/app-runtime-2.3.1-release-evidence | 2661ea08a6d8 | 0 / 0 | 主线祖先 | 架构／云端；已合并，清理仍需依赖审查 |
| codex/app-runtime-attribution-release-evidence | 5f33bdd0978f | 0 / 0 | 主线祖先 | 架构／云端；已合并，清理仍需依赖审查 |
| codex/app-runtime-catalog-ambiguity-hotfix | 2da362dc1ca1 | 0 / 0 | 主线祖先 | 架构／云端；已合并，清理仍需依赖审查 |
| codex/app-runtime-catalog-closeout | 626d8d701bb6 | 0 / 0 | 主线祖先 | 架构／云端；已合并，清理仍需依赖审查 |
| codex/app-runtime-catalog-correction-v1 | 38e0be3a5cec | 0 / 0 | 主线祖先 | 架构／云端；已合并，清理仍需依赖审查 |
| codex/app-runtime-catalog-groups-v1 | 85f337862e4e | 0 / 0 | 主线祖先 | 架构／云端；已合并，清理仍需依赖审查 |
| codex/app-runtime-catalog-hotfix-evidence | 78d8cd2171fa | 0 / 0 | 主线祖先 | 架构／云端；已合并，清理仍需依赖审查 |
| codex/app-runtime-catalog-hotfix-v1 | 357709962743 | 0 / 0 | 主线祖先 | 架构／云端；已合并，清理仍需依赖审查 |
| codex/app-runtime-child-context-v1 | b551bb97aea9 | 0 / 0 | 主线祖先 | 架构／云端；已合并，清理仍需依赖审查 |
| codex/app-runtime-ci-throttle-v1 | 250b7fecc853 | 0 / 0 | 主线祖先 | 架构／云端；已合并，清理仍需依赖审查 |
| codex/app-runtime-classification-v1 | 328ef2f64191 | 0 / 0 | 主线祖先 | 架构／云端；已合并，清理仍需依赖审查 |
| codex/app-runtime-cloud-origin-v1 | d35e4feea89e | 0 / 0 | 主线祖先 | 架构／云端；已合并，清理仍需依赖审查 |
| codex/app-runtime-default-classification-release | aa5382e149ea | 0 / 0 | 主线祖先 | 架构／云端；已合并，清理仍需依赖审查 |
| codex/app-runtime-default-classification-v1 | 3ae569d25c5e | 0 / 0 | 主线祖先 | 架构／云端；已合并，清理仍需依赖审查 |
| codex/app-runtime-distribution-evidence-v1 | cdc5a263c5aa | 0 / 0 | 主线祖先 | 架构／云端；已合并，清理仍需依赖审查 |
| codex/app-runtime-distribution-source-fix | 4324d3624ffe | 0 / 0 | 主线祖先 | 架构／云端；已合并，清理仍需依赖审查 |
| codex/app-runtime-game-system-rules-evidence | 722d1529940f | 0 / 0 | 主线祖先 | 架构／云端；已合并，清理仍需依赖审查 |
| codex/app-runtime-game-system-rules-v1 | 0fc963a1c801 | 0 / 0 | 主线祖先 | 架构／云端；已合并，清理仍需依赖审查 |
| codex/app-runtime-integration-v1 | 27f6fa00b847 | 0 / 0 | 主线祖先 | 架构／云端；已合并，清理仍需依赖审查 |
| codex/app-runtime-inventory-client-fix | e4c8bd9631fd | 0 / 0 | 主线祖先 | 架构／云端；已合并，清理仍需依赖审查 |
| codex/app-runtime-inventory-envelope-fix | 7f598e95f137 | 0 / 0 | 主线祖先 | 架构／云端；已合并，清理仍需依赖审查 |
| codex/app-runtime-inventory-quality-v1 | 7537a4a4a4a1 | 0 / 0 | 主线祖先 | 架构／云端；已合并，清理仍需依赖审查 |
| codex/app-runtime-inventory-reconciliation-v1 | 7f04ea14e913 | 0 / 0 | 主线祖先 | 架构／云端；已合并，清理仍需依赖审查 |
| codex/app-runtime-inventory-v4-hotfix | cbacb1d8bf29 | 0 / 0 | 主线祖先 | 架构／云端；已合并，清理仍需依赖审查 |
| codex/app-runtime-native-host-v1 | 3a963e41da0d | 0 / 0 | 主线祖先 | 架构／云端；已合并，清理仍需依赖审查 |
| codex/app-runtime-orphan-variant-hotfix | 86aa19393143 | 0 / 0 | 主线祖先 | 架构／云端；已合并，清理仍需依赖审查 |
| codex/app-runtime-product-catalog-v2 | 9891eb2dd9cf | 0 / 0 | 主线祖先 | 架构／云端；已合并，清理仍需依赖审查 |
| codex/app-runtime-product-catalog-v3 | 64bf6b7022e0 | 0 / 0 | 主线祖先 | 架构／云端；已合并，清理仍需依赖审查 |
| codex/app-runtime-product-catalog-v4 | 24afcca5a22e | 0 / 0 | 主线祖先 | 架构／云端；已合并，清理仍需依赖审查 |
| codex/app-runtime-product-catalog-v5 | 0e9677663a28 | 0 / 0 | 主线祖先 | 架构／云端；已合并，清理仍需依赖审查 |
| codex/app-runtime-product-identity-complete-v1 | c3d9b7ff1195 | 0 / 0 | 主线祖先 | 架构／云端；已合并，清理仍需依赖审查 |
| codex/app-runtime-product-projection-v1 | e38aec1e92a7 | 0 / 0 | 主线祖先 | 架构／云端；已合并，清理仍需依赖审查 |
| codex/app-runtime-product-type-v1 | cf641cc12228 | 0 / 0 | 主线祖先 | 架构／云端；已合并，清理仍需依赖审查 |
| codex/app-runtime-production-closeout-v1 | 6607903087b6 | 0 / 0 | 主线祖先 | 架构／云端；已合并，清理仍需依赖审查 |
| codex/app-runtime-production-evidence | 0cfec7529836 | 0 / 0 | 主线祖先 | 架构／云端；已合并，清理仍需依赖审查 |
| codex/app-runtime-production-gate-fix | 00e3b6d57b88 | 0 / 0 | 主线祖先 | 架构／云端；已合并，清理仍需依赖审查 |
| codex/app-runtime-recovery-evidence-20260927 | 0db58b2fef18 | 0 / 0 | 主线祖先 | 控件；已合并，清理仍需依赖审查 |
| codex/app-runtime-release-config-v1 | a67eadddea06 | 0 / 0 | 主线祖先 | 架构／云端；已合并，清理仍需依赖审查 |
| codex/app-runtime-release-evidence-v1 | 5f14cabd7306 | 1 / 0 | 未决独有改动 | 架构／云端；保留，所属任务审查 |
| codex/app-runtime-system-app-grouping-v1 | baca6180e106 | 0 / 0 | 主线祖先 | 架构／云端；已合并，清理仍需依赖审查 |
| codex/app-runtime-system-tools-evidence | 910c82945441 | 0 / 0 | 主线祖先 | 架构／云端；已合并，清理仍需依赖审查 |
| codex/app-runtime-system-tools-v1 | 91bbcf8dd70f | 0 / 0 | 主线祖先 | 架构／云端；已合并，清理仍需依赖审查 |
| codex/app-runtime-windows-release-v1 | b1b4440aae0c | 0 / 0 | 主线祖先 | 架构／云端；已合并，清理仍需依赖审查 |
| codex/browser-bridge-v3-final-closeout | 8e8bddad3c91 | 0 / 0 | 主线祖先 | 架构／云端；已合并，清理仍需依赖审查 |
| codex/browser-bridge-v3-release-evidence | abdda90aacdd | 0 / 0 | 主线祖先 | 架构／云端；已合并，清理仍需依赖审查 |
| codex/extension-application-usage-v1 | 4408b16d8cbc | 1 / 0 | 未决独有改动 | 控件；保留，所属任务审查 |
| codex/guardian-v3-release-gate | 8da97d5da63b | 1 / 0 | 未决独有改动 | 架构／云端；保留，所属任务审查 |
| codex/macos-app-management-v1 | 9acba21ccb9a | 0 / 0 | 主线祖先 | 架构／云端；已合并，清理仍需依赖审查 |
| codex/native-host-fixed-candidate-v3 | 20a99b2b15eb | 0 / 0 | 主线祖先 | 架构／云端；已合并，清理仍需依赖审查 |
| codex/project-cloud-extension-contract | b2c5b22d2fd8 | 1 / 0 | 未决独有改动 | 控件；保留，所属任务审查 |
| codex/runtime-session-boundaries | 265b3880296a | 0 / 0 | 主线祖先 | 架构／云端；已合并，清理仍需依赖审查 |
| codex/runtime-session-boundaries-closeout | f28bdcb86bae | 0 / 0 | 主线祖先 | 架构／云端；已合并，清理仍需依赖审查 |
| codex/task-management-v1 | 8603fbbb8506 | 14 / 0 | 未决独有改动 | 任务管理；保留，所属任务审查 |
| codex/timewhere-native-handoff-evidence | 642d814855f6 | 0 / 0 | 主线祖先 | 架构／云端；已合并，清理仍需依赖审查 |
| codex/timewhere-native-release-gate | f62107f286c0 | 0 / 0 | 主线祖先 | 架构／云端；已合并，清理仍需依赖审查 |
| codex/timewhere-native-split | 7dda0bb479a4 | 0 / 0 | 主线祖先 | 架构／云端；已合并，清理仍需依赖审查 |
| codex/timewhere-native-split-closeout | 0dd58ce82ce1 | 0 / 0 | 主线祖先 | 架构／云端；已合并，清理仍需依赖审查 |
| codex/timewhere-split-final-20260927 | b9819b190215 | 0 / 0 | 主线祖先 | 架构／云端；已合并，清理仍需依赖审查 |
| master | 2b9d461a6cfa | 0 / 0 | 主线祖先 | 架构／云端；已合并，清理仍需依赖审查 |
| origin | 8afc4ba6bf9f | 0 / 0 | 主线祖先 | 架构／云端；已合并，清理仍需依赖审查 |
| origin/audit/codex-full-review | 8086b964098c | 2 / 0 | 未决独有改动 | 架构／云端；保留，所属任务审查 |
| origin/codex/app-runtime-2.2.1-release-evidence | b7d82784d571 | 2 / 0 | 未决独有改动 | 架构／云端；保留，所属任务审查 |
| origin/codex/app-runtime-2.2.2-release-evidence | cc0c49831863 | 0 / 0 | 主线祖先 | 架构／云端；已合并，清理仍需依赖审查 |
| origin/codex/app-runtime-attribution-release-evidence | 5f33bdd0978f | 0 / 0 | 主线祖先 | 架构／云端；已合并，清理仍需依赖审查 |
| origin/codex/app-runtime-catalog-ambiguity-hotfix | 2da362dc1ca1 | 0 / 0 | 主线祖先 | 架构／云端；已合并，清理仍需依赖审查 |
| origin/codex/app-runtime-catalog-closeout | 626d8d701bb6 | 0 / 0 | 主线祖先 | 架构／云端；已合并，清理仍需依赖审查 |
| origin/codex/app-runtime-catalog-correction-v1 | 38e0be3a5cec | 0 / 0 | 主线祖先 | 架构／云端；已合并，清理仍需依赖审查 |
| origin/codex/app-runtime-catalog-groups-v1 | 85f337862e4e | 0 / 0 | 主线祖先 | 架构／云端；已合并，清理仍需依赖审查 |
| origin/codex/app-runtime-catalog-hotfix-evidence | 78d8cd2171fa | 0 / 0 | 主线祖先 | 架构／云端；已合并，清理仍需依赖审查 |
| origin/codex/app-runtime-catalog-hotfix-v1 | 357709962743 | 0 / 0 | 主线祖先 | 架构／云端；已合并，清理仍需依赖审查 |
| origin/codex/app-runtime-child-context-v1 | b551bb97aea9 | 0 / 0 | 主线祖先 | 架构／云端；已合并，清理仍需依赖审查 |
| origin/codex/app-runtime-ci-throttle-v1 | 250b7fecc853 | 0 / 0 | 主线祖先 | 架构／云端；已合并，清理仍需依赖审查 |
| origin/codex/app-runtime-classification-v1 | 328ef2f64191 | 0 / 0 | 主线祖先 | 架构／云端；已合并，清理仍需依赖审查 |
| origin/codex/app-runtime-cloud-origin-v1 | d35e4feea89e | 0 / 0 | 主线祖先 | 架构／云端；已合并，清理仍需依赖审查 |
| origin/codex/app-runtime-default-classification-v1 | 3ae569d25c5e | 0 / 0 | 主线祖先 | 架构／云端；已合并，清理仍需依赖审查 |
| origin/codex/app-runtime-distribution-evidence-v1 | cdc5a263c5aa | 0 / 0 | 主线祖先 | 架构／云端；已合并，清理仍需依赖审查 |
| origin/codex/app-runtime-distribution-source-fix | 4324d3624ffe | 0 / 0 | 主线祖先 | 架构／云端；已合并，清理仍需依赖审查 |
| origin/codex/app-runtime-game-system-rules-evidence | 722d1529940f | 0 / 0 | 主线祖先 | 架构／云端；已合并，清理仍需依赖审查 |
| origin/codex/app-runtime-game-system-rules-v1 | 0fc963a1c801 | 0 / 0 | 主线祖先 | 架构／云端；已合并，清理仍需依赖审查 |
| origin/codex/app-runtime-integration-v1 | 27f6fa00b847 | 0 / 0 | 主线祖先 | 架构／云端；已合并，清理仍需依赖审查 |
| origin/codex/app-runtime-inventory-client-fix | e4c8bd9631fd | 0 / 0 | 主线祖先 | 架构／云端；已合并，清理仍需依赖审查 |
| origin/codex/app-runtime-inventory-envelope-fix | 7f598e95f137 | 0 / 0 | 主线祖先 | 架构／云端；已合并，清理仍需依赖审查 |
| origin/codex/app-runtime-inventory-quality-v1 | 7537a4a4a4a1 | 0 / 0 | 主线祖先 | 架构／云端；已合并，清理仍需依赖审查 |
| origin/codex/app-runtime-inventory-reconciliation-v1 | 7f04ea14e913 | 0 / 0 | 主线祖先 | 架构／云端；已合并，清理仍需依赖审查 |
| origin/codex/app-runtime-inventory-v4-hotfix | cbacb1d8bf29 | 0 / 0 | 主线祖先 | 架构／云端；已合并，清理仍需依赖审查 |
| origin/codex/app-runtime-native-host-v1 | 3a963e41da0d | 0 / 0 | 主线祖先 | 架构／云端；已合并，清理仍需依赖审查 |
| origin/codex/app-runtime-orphan-variant-hotfix | 86aa19393143 | 0 / 0 | 主线祖先 | 架构／云端；已合并，清理仍需依赖审查 |
| origin/codex/app-runtime-product-catalog-v2 | 9891eb2dd9cf | 0 / 0 | 主线祖先 | 架构／云端；已合并，清理仍需依赖审查 |
| origin/codex/app-runtime-product-catalog-v3 | 64bf6b7022e0 | 0 / 0 | 主线祖先 | 架构／云端；已合并，清理仍需依赖审查 |
| origin/codex/app-runtime-product-catalog-v4 | 24afcca5a22e | 0 / 0 | 主线祖先 | 架构／云端；已合并，清理仍需依赖审查 |
| origin/codex/app-runtime-product-catalog-v5 | 0e9677663a28 | 0 / 0 | 主线祖先 | 架构／云端；已合并，清理仍需依赖审查 |
| origin/codex/app-runtime-product-identity-complete-v1 | c3d9b7ff1195 | 0 / 0 | 主线祖先 | 架构／云端；已合并，清理仍需依赖审查 |
| origin/codex/app-runtime-product-projection-v1 | e38aec1e92a7 | 0 / 0 | 主线祖先 | 架构／云端；已合并，清理仍需依赖审查 |
| origin/codex/app-runtime-product-type-v1 | cf641cc12228 | 0 / 0 | 主线祖先 | 架构／云端；已合并，清理仍需依赖审查 |
| origin/codex/app-runtime-production-closeout-v1 | 6607903087b6 | 0 / 0 | 主线祖先 | 架构／云端；已合并，清理仍需依赖审查 |
| origin/codex/app-runtime-recovery-evidence-20260927 | 0db58b2fef18 | 0 / 0 | 主线祖先 | 控件；已合并，清理仍需依赖审查 |
| origin/codex/app-runtime-release-config-v1 | a67eadddea06 | 0 / 0 | 主线祖先 | 架构／云端；已合并，清理仍需依赖审查 |
| origin/codex/app-runtime-release-evidence-v1 | 5f14cabd7306 | 1 / 0 | 未决独有改动 | 架构／云端；保留，所属任务审查 |
| origin/codex/app-runtime-system-app-grouping-v1 | baca6180e106 | 0 / 0 | 主线祖先 | 架构／云端；已合并，清理仍需依赖审查 |
| origin/codex/app-runtime-system-tools-evidence | 910c82945441 | 0 / 0 | 主线祖先 | 架构／云端；已合并，清理仍需依赖审查 |
| origin/codex/app-runtime-system-tools-v1 | 91bbcf8dd70f | 0 / 0 | 主线祖先 | 架构／云端；已合并，清理仍需依赖审查 |
| origin/codex/app-runtime-windows-release-v1 | b1b4440aae0c | 0 / 0 | 主线祖先 | 架构／云端；已合并，清理仍需依赖审查 |
| origin/codex/browser-bridge-v3-final-closeout | 8e8bddad3c91 | 0 / 0 | 主线祖先 | 架构／云端；已合并，清理仍需依赖审查 |
| origin/codex/browser-bridge-v3-release-evidence | abdda90aacdd | 0 / 0 | 主线祖先 | 架构／云端；已合并，清理仍需依赖审查 |
| origin/codex/extension-application-usage-v1 | bdf945f284c3 | 0 / 0 | 主线祖先 | 控件；已合并，清理仍需依赖审查 |
| origin/codex/guardian-v3-release-gate | 8da97d5da63b | 1 / 0 | 未决独有改动 | 架构／云端；保留，所属任务审查 |
| origin/codex/macos-app-management-v1 | 9acba21ccb9a | 0 / 0 | 主线祖先 | 架构／云端；已合并，清理仍需依赖审查 |
| origin/codex/media-reporting-semantics | 374a12aa761e | 0 / 0 | 主线祖先 | 架构／云端；已合并，清理仍需依赖审查 |
| origin/codex/native-host-fixed-candidate-v3 | 20a99b2b15eb | 0 / 0 | 主线祖先 | 架构／云端；已合并，清理仍需依赖审查 |
| origin/codex/p0-foreground-reliability | b2552052485f | 0 / 0 | 主线祖先 | 架构／云端；已合并，清理仍需依赖审查 |
| origin/codex/perform-final-code-audit-for-project | a9a029d30f47 | 0 / 1 | patch 等价，非祖先 | 架构／云端；保留，所属任务审查 |
| origin/codex/restore-pre-repair-baseline | 0d6c99584dcc | 0 / 0 | 主线祖先 | 架构／云端；已合并，清理仍需依赖审查 |
| origin/codex/runtime-session-boundaries | 265b3880296a | 0 / 0 | 主线祖先 | 架构／云端；已合并，清理仍需依赖审查 |
| origin/codex/runtime-session-boundaries-closeout | f28bdcb86bae | 0 / 0 | 主线祖先 | 架构／云端；已合并，清理仍需依赖审查 |
| origin/codex/stats-accuracy-min-verify | a09cb359d58d | 11 / 0 | 未决独有改动 | 控件；保留，所属任务审查 |
| origin/codex/suspect-segment-cleanup | d5bbc99b070f | 0 / 0 | 主线祖先 | 架构／云端；已合并，清理仍需依赖审查 |
| origin/codex/task-management-v1 | 8603fbbb8506 | 14 / 0 | 未决独有改动 | 任务管理；保留，所属任务审查 |
| origin/codex/timewhere-native-handoff-evidence | 642d814855f6 | 0 / 0 | 主线祖先 | 架构／云端；已合并，清理仍需依赖审查 |
| origin/codex/timewhere-native-release-gate | f62107f286c0 | 0 / 0 | 主线祖先 | 架构／云端；已合并，清理仍需依赖审查 |
| origin/codex/timewhere-native-split | 7dda0bb479a4 | 0 / 0 | 主线祖先 | 架构／云端；已合并，清理仍需依赖审查 |
| origin/codex/timewhere-native-split-closeout | 0dd58ce82ce1 | 0 / 0 | 主线祖先 | 架构／云端；已合并，清理仍需依赖审查 |
| origin/codex/timewhere-split-final-20260927 | b9819b190215 | 0 / 0 | 主线祖先 | 架构／云端；已合并，清理仍需依赖审查 |
| origin/codex/timing-functional-completion | 31870a9b2fdc | 0 / 0 | 主线祖先 | 控件；已合并，清理仍需依赖审查 |
| origin/codex/timing-functional-completion-m1-real-profile | 79dccfd11850 | 0 / 0 | 主线祖先 | 控件；已合并，清理仍需依赖审查 |
| origin/codex/timing-productization | 28f90d6e4751 | 2 / 0 | 未决独有改动 | 控件；保留，所属任务审查 |
| origin/develop | 07e3ae22f068 | 0 / 0 | 主线祖先 | 架构／云端；已合并，清理仍需依赖审查 |
| origin/master | 8afc4ba6bf9f | 0 / 0 | 主线祖先 | 架构／云端；已合并，清理仍需依赖审查 |
| origin/pr-1-timing-trace-verify | 485e33643aaf | 4 / 0 | 未决独有改动 | 控件；保留，所属任务审查 |
| origin/pr-2-recovery-crossday | 8f1138f8eb74 | 5 / 0 | 未决独有改动 | 控件；保留，所属任务审查 |
| origin/pr-3-pip-background-media | a09cb359d58d | 11 / 0 | 未决独有改动 | 控件；保留，所属任务审查 |
| origin/release/v0.0.1-profile-config-integrity | df03d199f3ed | 7 / 0 | 未决独有改动 | 架构／云端；保留，所属任务审查 |
| origin/release/v0.1-duration-accuracy | b7fc47685385 | 0 / 1 | patch 等价，非祖先 | 控件；保留，所属任务审查 |
| origin/release/v0.1-duration-diagnostics | c74d4d4c41cd | 2 / 0 | 未决独有改动 | 控件；保留，所属任务审查 |
| origin/stg | 107f5a4c27c8 | 0 / 6 | patch 等价，非祖先 | 架构／云端；保留，所属任务审查 |
| origin/v0/release-verify | a9a029d30f47 | 0 / 1 | patch 等价，非祖先 | 架构／云端；保留，所属任务审查 |

</details>

<details>
<summary>TimeWhereNative：14 个本地／跟踪引用</summary>

| 工作线 | SHA | 独有／等价提交 | 合并状态 | 所属／处置 |
|---|---|---|---|---|
| codex/manager-usage-statistics | 6c51a0d04049 | 2 / 0 | 未决独有改动 | Native；保留，所属任务审查 |
| codex/native-session-boundaries | 6987266cc3a3 | 0 / 0 | 主线祖先 | Native；已合并，清理仍需依赖审查 |
| main | cd970eda3294 | 0 / 0 | 主线祖先 | Native；已合并，清理仍需依赖审查 |
| origin | 28373a955c14 | 0 / 0 | 主线祖先 | Native；已合并，清理仍需依赖审查 |
| origin/codex/browser-bridge-v3-date-boundary | 33b951927210 | 0 / 0 | 主线祖先 | Native；已合并，清理仍需依赖审查 |
| origin/codex/browser-bridge-v3-final-closeout | 033d098a1c97 | 0 / 0 | 主线祖先 | Native；已合并，清理仍需依赖审查 |
| origin/codex/extension-application-usage-v1 | 357ad9200699 | 0 / 0 | 主线祖先 | 控件；已合并，清理仍需依赖审查 |
| origin/codex/native-attribution-2.6.6-evidence | a3849a10559c | 0 / 0 | 主线祖先 | Native；已合并，清理仍需依赖审查 |
| origin/codex/native-closeout-20260927 | 74ed4d45d237 | 0 / 0 | 主线祖先 | Native；已合并，清理仍需依赖审查 |
| origin/codex/native-inventory-envelope-fix | c8def4661b0f | 0 / 0 | 主线祖先 | Native；已合并，清理仍需依赖审查 |
| origin/codex/native-runtime-identity-read-fix | 1cbd1c6975fe | 0 / 0 | 主线祖先 | Native；已合并，清理仍需依赖审查 |
| origin/codex/native-session-boundaries | 6987266cc3a3 | 0 / 0 | 主线祖先 | Native；已合并，清理仍需依赖审查 |
| origin/codex/windows-ci-timeout-v1 | da83ff05a8d3 | 0 / 0 | 主线祖先 | Native；已合并，清理仍需依赖审查 |
| origin/main | 28373a955c14 | 0 / 0 | 主线祖先 | Native；已合并，清理仍需依赖审查 |

</details>

<details>
<summary>TimeWhereNative（旧历史克隆）：22 个本地／跟踪引用</summary>

| 工作线 | SHA | 独有／等价提交 | 合并状态 | 所属／处置 |
|---|---|---|---|---|
| codex/browser-bridge-v3-date-boundary | 33b951927210 | 0 / 0 | 主线祖先 | Native；已合并，清理仍需依赖审查 |
| codex/browser-bridge-v3-final-closeout | 033d098a1c97 | 0 / 0 | 主线祖先 | Native；已合并，清理仍需依赖审查 |
| codex/browser-bridge-v3-version-2.6.1 | 697c88912cb7 | 0 / 0 | 主线祖先 | Native；已合并，清理仍需依赖审查 |
| codex/extension-application-usage-v1 | 357ad9200699 | 0 / 0 | 主线祖先 | 控件；已合并，清理仍需依赖审查 |
| codex/native-attribution-2.6.6-evidence | a3849a10559c | 0 / 0 | 主线祖先 | Native；已合并，清理仍需依赖审查 |
| codex/native-closeout-20260927 | 74ed4d45d237 | 0 / 0 | 主线祖先 | Native；已合并，清理仍需依赖审查 |
| codex/native-inventory-envelope-fix | c8def4661b0f | 0 / 0 | 主线祖先 | Native；已合并，清理仍需依赖审查 |
| codex/native-runtime-identity-read-fix | 1cbd1c6975fe | 0 / 0 | 主线祖先 | Native；已合并，清理仍需依赖审查 |
| codex/windows-ci-timeout-v1 | da83ff05a8d3 | 0 / 0 | 主线祖先 | Native；已合并，清理仍需依赖审查 |
| main | c4c6ddf90bf2 | 0 / 0 | 主线祖先 | Native；已合并，清理仍需依赖审查 |
| origin | 28373a955c14 | 0 / 0 | 主线祖先 | Native；已合并，清理仍需依赖审查 |
| origin/codex/browser-bridge-v3-date-boundary | 33b951927210 | 0 / 0 | 主线祖先 | Native；已合并，清理仍需依赖审查 |
| origin/codex/browser-bridge-v3-final-closeout | 033d098a1c97 | 0 / 0 | 主线祖先 | Native；已合并，清理仍需依赖审查 |
| origin/codex/extension-application-usage-v1 | 357ad9200699 | 0 / 0 | 主线祖先 | 控件；已合并，清理仍需依赖审查 |
| origin/codex/native-attribution-2.6.6-evidence | a3849a10559c | 0 / 0 | 主线祖先 | Native；已合并，清理仍需依赖审查 |
| origin/codex/native-closeout-20260927 | 74ed4d45d237 | 0 / 0 | 主线祖先 | Native；已合并，清理仍需依赖审查 |
| origin/codex/native-inventory-envelope-fix | c8def4661b0f | 0 / 0 | 主线祖先 | Native；已合并，清理仍需依赖审查 |
| origin/codex/native-runtime-identity-read-fix | 1cbd1c6975fe | 0 / 0 | 主线祖先 | Native；已合并，清理仍需依赖审查 |
| origin/codex/native-session-boundaries | 6987266cc3a3 | 0 / 0 | 主线祖先 | Native；已合并，清理仍需依赖审查 |
| origin/codex/windows-ci-timeout-v1 | da83ff05a8d3 | 0 / 0 | 主线祖先 | Native；已合并，清理仍需依赖审查 |
| origin/main | 28373a955c14 | 0 / 0 | 主线祖先 | Native；已合并，清理仍需依赖审查 |
| origin/master | e3afecbec44a | 40 / 0 | 已消失远端的旧跟踪引用 | Native；迁移历史，禁止合入旧 40 个提交 |

</details>

### 工作树与保护范围

ignored 仅列顶层类别和条目数，不读取内容；可能含私人证据/运行依赖，未证明可重建之前均保留。条目数不是递归文件总数。

| 工作树 | HEAD／分支 | 未提交／未跟踪 | ignored 条目数／用途 | 处置 |
|---|---|---|---|---|
| D:/Codex/TimeOnchrome | 2b9d461a / master | 31 | 47 / 依赖、候选/发布/证据、本地 Wrangler 状态 | 未决改动原地保护 |
| C盘工作树/81a1/TimeOnchrome | 4408b16d / codex/extension-application-usage-v1 | 1 | 44 / 依赖、候选/发布/证据、编译缓存、本地 Wrangler 状态 | 未决改动原地保护 |
| C盘工作树/f805/TimeOnchrome | 8603fbbb / codex/task-management-v1 | 6 | 12 / 依赖、候选/发布/证据、本地 Wrangler 状态 | 未决改动原地保护 |
| D:/Codex/TimeOnchrome-worktrees/app-runtime-2.3.0-release | d4a6abb0 / detached | 0 | 17 / 候选/发布/证据、编译缓存 | 保留依赖和唯一证据 |
| D:/Codex/TimeOnchrome-worktrees/app-runtime-2.3.1-release | c407d0f1 / detached | 0 | 18 / 候选/发布/证据、编译缓存 | 保留依赖和唯一证据 |
| D:/Codex/TimeOnchrome-worktrees/app-runtime-attribution-release-20260927 | c3d9b7ff / codex/app-runtime-product-identity-complete-v1 | 2 | 3 / 依赖、候选/发布/证据、本地 Wrangler 状态 | 未决改动原地保护 |
| D:/Codex/TimeOnchrome-worktrees/app-runtime-catalog-correction | 38e0be3a / codex/app-runtime-catalog-correction-v1 | 0 | 6 / 依赖、候选/发布/证据、本地 Wrangler 状态 | 保留依赖和唯一证据 |
| D:/Codex/TimeOnchrome-worktrees/app-runtime-catalog-groups-v1 | 85f33786 / codex/app-runtime-catalog-groups-v1 | 0 | 5 / 依赖、候选/发布/证据、本地 Wrangler 状态 | 保留依赖和唯一证据 |
| D:/Codex/TimeOnchrome-worktrees/app-runtime-ci-throttle-v1 | 250b7fec / codex/app-runtime-ci-throttle-v1 | 0 | 1 / 本地 Wrangler 状态 | 保留依赖和唯一证据 |
| D:/Codex/TimeOnchrome-worktrees/app-runtime-classification | 7537a4a4 / codex/app-runtime-inventory-quality-v1 | 0 | 25 / 依赖、候选/发布/证据、编译缓存、本地 Wrangler 状态 | 保留依赖和唯一证据 |
| D:/Codex/TimeOnchrome-worktrees/app-runtime-distribution-evidence | cdc5a263 / codex/app-runtime-distribution-evidence-v1 | 0 | 25 / 依赖、候选/发布/证据、编译缓存、本地 Wrangler 状态 | 保留依赖和唯一证据 |
| D:/Codex/TimeOnchrome-worktrees/app-runtime-integration | 27f6fa00 / codex/app-runtime-integration-v1 | 0 | 26 / 依赖、候选/发布/证据、编译缓存、本地 Wrangler 状态 | 保留依赖和唯一证据 |
| D:/Codex/TimeOnchrome-worktrees/app-runtime-product-catalog-v2 | 9891eb2d / codex/app-runtime-product-catalog-v2 | 0 | 28 / 依赖、候选/发布/证据、编译缓存、本地 Wrangler 状态 | 保留依赖和唯一证据 |
| D:/Codex/TimeOnchrome-worktrees/app-runtime-product-projection | e38aec1e / codex/app-runtime-product-projection-v1 | 0 | 6 / 依赖、候选/发布/证据、本地 Wrangler 状态 | 保留依赖和唯一证据 |
| D:/Codex/TimeOnchrome-worktrees/app-runtime-production | 66079030 / codex/app-runtime-production-closeout-v1 | 0 | 6 / 依赖、候选/发布/证据、本地 Wrangler 状态 | 保留依赖和唯一证据 |
| D:/Codex/TimeOnchrome-worktrees/app-runtime-release-2.2.1 | b7d82784 / codex/app-runtime-2.2.1-release-evidence | 0 | 4 / 依赖、候选/发布/证据、本地 Wrangler 状态 | 保留依赖和唯一证据 |
| D:/Codex/TimeOnchrome-worktrees/app-runtime-release-2.2.2 | cc0c4983 / codex/app-runtime-2.2.2-release-evidence | 0 | 18 / 候选/发布/证据、编译缓存、本地 Wrangler 状态 | 保留依赖和唯一证据 |
| D:/Codex/TimeOnchrome-worktrees/app-runtime-release-20260915 | b133f78f / detached | 0 | 4 / 依赖、候选/发布/证据、本地 Wrangler 状态 | 保留依赖和唯一证据 |
| D:/Codex/TimeOnchrome-worktrees/app-runtime-release-default-classification | aa5382e1 / codex/app-runtime-default-classification-release | 0 | 0 / 需核对 | 暂保留，未批准清理 |
| D:/Codex/TimeOnchrome-worktrees/guardian-v3-release-gate | 8da97d5d / codex/guardian-v3-release-gate | 0 | 0 / 需核对 | 暂保留，未批准清理 |
| D:/Codex/TimeOnchrome-worktrees/runtime-session-boundaries | b2c5b22d / codex/project-cloud-extension-contract | 0 | 0 / 需核对 | 暂保留，未批准清理 |
| D:/Codex/TimeOnchrome-worktrees/timewhere-native-split | 0dd58ce8 / codex/timewhere-native-split-closeout | 1 | 4 / 依赖、候选/发布/证据、本地 Wrangler 状态 | 未决改动原地保护 |
| D:/Codex/TimeOnchrome-worktrees/timewhere-split-final-20260927 | b9819b19 / codex/timewhere-split-final-20260927 | 0 | 0 / 需核对 | 暂保留，未批准清理 |
| D:/Codex/TimeWhereNative | 6c51a0d0 / codex/manager-usage-statistics | 0 | 22 / 候选/发布/证据、编译缓存 | 保留依赖和唯一证据 |
| D:/Codex/TimeOnchrome-worktrees/timewhere-native-history | 357ad920 / codex/extension-application-usage-v1 | 0 | 25 / 候选/发布/证据、编译缓存 | 保留依赖和唯一证据 |
| D:/Codex/TimeOnchrome-worktrees/timewhere-native-attribution-2.6.6 | 1cbd1c69 / codex/native-runtime-identity-read-fix | 0 | 18 / 候选/发布/证据、编译缓存 | 保留依赖和唯一证据 |
| D:/Codex/TimeOnchrome-worktrees/timewhere-native-closeout-20260927 | 74ed4d45 / codex/native-closeout-20260927 | 0 | 0 / 需核对 | 暂保留，未批准清理 |

盘点后新建本任务 D:/Codex/TimeOnchrome-worktrees/two-repo-inventory，分支 codex/two-repo-inventory，基线 8afc4ba；只写任务板。runtime-session-boundaries 此后出现未跟踪 .wrangler/（只读部署查询的本地工具状态），不清除、不提交。Native 活跃任务此后新增未跟踪 agents/windows/src/TimeOnChrome.AppRuntime.Setup/Assets/；由原任务继续管理，不包含在本次提交，也不能沿用初查 clean 结论。

已向既有 TimeOnChrome-Extension、TimeWhere Native Host 任务发送最小交接，请其确认工作线去向及依赖，不新建实施任务、不要求改动原加载目录；回复未收到前不记作确认或已整合。

### 脏工作树逐项路径（不包含 ignored 私人证据）

- D:/Codex/TimeOnchrome：
  - `M DECISIONS.md`
  - `M TASK_BOARD.md`
  - `M docs/DESIGN.md`
  - `M docs/SITE_ACCESS_POLICY.md`
  - `M docs/UI_STYLE_MAP.md`
  - `M extension/admin/admin.js`
  - `M extension/background.js`
  - `M extension/content.js`
  - `M extension/infra/cloud-sync.js`
  - `M extension/infra/storage-maintenance.js`
  - `M extension/infra/storage.js`
  - `M extension/popup/popup.html`
  - `M extension/popup/popup.js`
  - `M extension/privacy.html`
  - `M extension/product/rest-usage-reminder.js`
  - `M pages/index.html`
  - `M tests/unit/pages-config-v12-fields.test.js`
  - `M tests/unit/rest-usage-reminder.test.js`
  - `M workers/src/index.ts`
  - `M workers/src/routes/profiles.ts`
  - `?? extension/core/composite-page-review.js`
  - `?? extension/infra/composite-page-observer.js`
  - `?? pages/composite-review.js`
  - `?? tests/e2e/composite-page-observer-unpacked.test.js`
  - `?? tests/e2e/composite-page-review-visual.test.js`
  - `?? tests/e2e/rest-weekly-visual.test.js`
  - `?? tests/unit/composite-page-review.test.js`
  - `?? tests/unit/rest-weekly-config.test.js`
  - `?? workers/migrations/032_composite_page_reviews.sql`
  - `?? workers/src/routes/compositePageReviews.ts`
  - `?? workers/src/services/compositePageReviews.ts`
- C盘工作树/81a1/TimeOnchrome：
  - `?? app-runtime-management/agents/`
- C盘工作树/f805/TimeOnchrome：
  - `M TASK_BOARD.md`
  - `M docs/UI_STYLE_MAP.md`
  - `M extension/admin/admin.js`
  - `M extension/modules/task/ui/required.html`
  - `M extension/modules/task/ui/required.js`
  - `?? output/`
- D:/Codex/TimeOnchrome-worktrees/app-runtime-attribution-release-20260927：
  - `M app-runtime-management/docs/TASK_BOARD.md`
  - `?? artifacts/`
- D:/Codex/TimeOnchrome-worktrees/timewhere-native-split：
  - `?? app-runtime-management/backend/NUL`

### 清理建议与恢复条件

本轮删除项为空。表中主线祖先引用仅属于“已整合候选”，不等于可删除工作树。特别保护原 81a1 扩展加载目录、所有活跃/脏工作树、Native 2.6.8 包与来源提交、旧发布证据和旧 Native 历史克隆。之后逐项批准前必须确认运行依赖、ignored 唯一证据和 owner 状态；分支恢复使用表内保留 SHA，产物恢复必须有实际副本/可验证构建来源，仅 Git SHA 不能恢复未跟踪文件。

阶段一审计：Matched＝两仓及旧克隆 fetch/引用与工作树/patch 检查/版本分离/现场云端只读/保护清单；Missing＝历史工作线逐项 owner 裁决、后续 PR 与整合、旧产物依赖逐项确认；Deviated/Extra＝无。整合与最终收口尚未完成，不把盘点完成写成全部完成。



## NOW：明确项目开发契约 D-105

职责 runtime-cloud-contract；范围为项目契约文档及既有轻量职责检查/固定用例。当前任务负责架构及 Guardian/主控制台/Runtime 云端，控件任务仅终端，Native/Santa 不接管。先同步文档，再同步路径检查；仅职责固定测试、CI 路由、diff check，无产品测试、业务修改或部署。本轮只在功能分支形成契约，不擅自合并/发布；后续合并后 CI 方按新范围执行。

实施审计：Matched＝明确契约/入口一致/云端路径归属/终端反向禁止/Santa 例外保留；Deviated/Missing/Extra＝无（契约与本地检查范围）。task-scope、CI routing、diff check PASS；仅治理文件。未推送、未合并或部署。

## NOW（2026-09-27）：双仓边界最终收口

源码迁移及旧本机 CI 停用已由 D-104 完成，不重复迁移。执行 checklist：合入已实机验收的应用读取超时补丁；复核 Native main 精确 SHA 的独立 Windows/macOS/WiX CI、固定契约及无生产写权限；用现有 2.6.7 包校验 SHA/版本/字节哈希后，将旧仓滞留 1.12.0 的交接锁同步为已验证 1.15.0，增加与当前契约版本一致的回归；更新两仓当前状态；分别 PR 合并。未跟踪构建残留保留，不当作可发布源码，不修改其他任务工作树。

测试等级：扩展通信 + 发布交接配置 + 文档。必要验证为 local-guardian/application-usage-read-model、artifact gate/CI 路由/release-config 聚焦测试、源码边界与 diff check、现有真实 2.6.7 产物验真；Native 精确 main ce2b568 的 run 36269476969 已通过所有相关 job，复用证据。CI 仅 release-config/轻量 gate，Native 文档仅轻量 gate。无新增协议或产品行为，不重跑平台构建，不部署云端、不安装、不执行 migration、不上传 R2 或切换 latest。

提交前结果：上述六组本地检查及 diff check 全部 PASS，原生 2.6.7 Burn/MSI 来源 SHA、contracts 1.15.0/包哈希、实际文件大小/哈希验真 PASS。新仓 repository secrets/environments 只读查询为空，workflow 权限和固定包消费符合边界。用户确认扩展显示正常，记为 PASS_WITH_MANUAL_EVIDENCE；独立用量展示不等于共享配额已实现。Matched＝修复收口/源码隔离/独立 CI/契约验真/权限边界/实机证据，Deviated/Missing/Extra＝无（本轮实现范围）；PR/合并状态以实际 GitHub 结果为准，不先写完成。

## NOW（2026-09-27）：应用用量查询误用健康心跳超时

实机已安装 2.6.7 的 Native Host→Service 本周只读查询在 4362ms 返回完整统计，而扩展 native-host-client.js 所有请求共用 3000ms 超时，导致页面提前断线。修复 checklist：①仅 application/getApplicationUsage 使用独立 15000ms 有界响应预算，健康及其他通道保持 3000ms；②计时仍从实际发送开始，保留串行调度、requestId 校验和断线清理；③固定超过 3 秒成功、15 秒无响应终止、迟到响应不串 ACK 的回归；④校验并更新原 unpacked 目录，不改 ID/模式/绑定、不安装 Service。

测试等级：扩展本地通信小修。仅 local-guardian、application-usage-read-model 聚焦测试、语法与 git diff --check；必要 CI 为扩展相关。真实只读 Native Host 查询确认响应预算；页面重载后的实机显示另记，不以 mock 代替。排除 Windows/macOS/WiX/Worker/Console 全量测试与生产发布，因为不改 Service、统计算法、网页/媒体原账、配额或云端。其他产品身份缺口不借本次超时修复宣称全部解决。

实施结果：local-guardian（包括 4400ms 延迟成功、15000ms 上限回调、迟到 ACK/串行队列、原 3000ms 健康超时）及 application-usage-read-model PASS；模块语法与 diff check PASS。实际安装 Host 第二次只读查询 4630ms，完整用量返回；目标 ChatGPT/Excel 各一行且为 study。用量 complete 与其他产品 attribution 缺口分别保留，不掩盖未关联项。原目录 1.7.39 native-host-development 仅替换通信文件，候选与测试源码 SHA-256 相同；没有重建或安装 Service。当前仍为 4–5 秒查询，未宣称性能优化完成。

提交前审计：Matched＝独立预算/原健康预算/发送计时/串行与 ACK/有界失败/聚焦回归/原目录同步；Deviated/Missing/Extra＝无（本次超时修复范围）。用户重载后明确回复“正常”，页面验收记为 PASS_WITH_MANUAL_EVIDENCE，不伪称自动化页面通过。真实 Host 另行读取成功且目标产品各一条/学习；其他对象的笼统 attribution 标记未证实为缺陷，不作为本次目标的额外阻塞。不部署云端。

## NOW（2026-09-27 PO 产品口径更正）：应用分类调整追溯本周

模块 ARM-D-032 已实现并合并：同一孩子、已确认应用的分类调整更正北京时间本周有效使用分类和独立应用配额归属；上周及更早不追溯。Contracts 1.14.0/API 留在本仓，Native 事务缓存/Service 读取留在新仓，扩展不重算或改变目录。PR #55/master `9dd201f` 通过精确 CI，production `36262088101` 仅部署 Runtime Worker `2602c1de-b778-41a8-bf3c-f7474c15d83a`，health 200、未认证 API 401，无 migration/Pages/Guardian/R2 写入。Native PR #4/main `80d1541`、CI `36262231353` 全部门禁通过，2.6.6 主分支 Burn/MSI 已回读验证版本、491 文件及哈希。用户 Escape 停止 Computer Use，未启动安装器；本机仍为 2.6.4，实际升级/修正同步及旧 ChatGPT 可信身份关联尚未通过。旧 2.6.5 不含本周更正；完整交付状态见模块任务板，不得称真机已经修复。

## NOW（PO 已批准修复）：应用统计产品身份投影与分类继承缺口（2026-09-27）

实施 checklist（关联投影/前向策略，不改历史）：① Backend 从可信包/二进制关联传播同一应用的明确分类，并从可信安装产品向套件入口继承；精确变体覆盖优先，冲突不自动继承，包容器不向不同 AUMID 扩散。② App Policy 保存、盘点/知识发布和目录读模型复用相同投影，resolvedApplications 随新策略版本冻结。③ Native 应用统计消费同用户库存的可信叶应用关联，按区间并集合并同一应用行；不按名称、发布者或套件产品键合并 Word/Excel，不套当前分类重算历史。关联变化进入 revision，分页不混版。④ 固定同名异应用、套件继承/覆盖、旧版本历史不变、用户隔离及应用行并集回归。

测试契约：Worker 分类投影/API 聚焦测试与 typecheck；Native ApplicationUsageReadTests、相关 Service 编译；必要本地候选构建另记。默认排除网页/媒体原账、配额、Console 布局、macOS、无关全量 CI、生产部署/migration/R2。无可靠历史证据的同名身份保持分离，不伪造已关联；本地测试通过不等于现有云端策略/已安装 Service 已生效。

PO 指出本地统计两个 ChatGPT、两个 EXCEL，并已在云端把 ChatGPT 归为学习。真实 Host/Service 响应确认各有两个不同技术键；当前 ChatGPT 记录仍为 unclassified，Excel 两个身份分别 study/unclassified，不能据此认定原账重复。代码证据：ApplicationUsageReader 只按 platform/runtimeIdentity 哈希分行，没有消费产品关联；MachinePolicyStore.SnapshotFor 仍精确匹配技术身份。浏览器只读查看当前孩子的 Runtime 应用管理，确认旧 ChatGPT 对象确有“学习/家长明确配置”，另一个已安装对象仍未归类；Microsoft 365 学习产品的 Excel 变体显示继承产品设置。此前把问题直接解释为用户未配置或网站/应用不互通不成立，未核实前不能归因于用户操作。

诊断阶段沿用已批准产品/变体关系，不能按名称强行合并、要求用户重复分类或回写历史分类。诊断时未修改产品代码、云端配置或历史 Segment；agent-browser 无可附加 CDP，使用已连接 Chrome 插件只读核对并恢复原目录。浏览器未读取凭据或被禁止的 extension URL。PO 随后批准修复，实施范围和验证见上方 checklist。

实施结果：Worker 关联/继承、策略版本、ETag/家庭隔离、旧客户端时段、上传分类与包容器回归 15/15，通过 typecheck；Native 读取 14/14、安装器 5/5，通过 Service 编译。修正旧 Game Bar 测试，使 resolvedApplications 与已存在的 composite 明确覆盖一致，不改变其实际分类/配额。两次生产 D1 仅 SELECT 汇总，rows_written=0；确认三个旧 ChatGPT 学习配置缺少 inventory，当前安装项有另一个包身份，不能宣称已自动关联。实施审计 Matched（可信关联/覆盖/历史不变/隔离/分页），Deviated/Extra=无；生产部署、现有家庭关联与真机升级仍待执行，不记为通过。原扩展目录、ID、绑定未改。

代码提交：TimeOnChrome `b5dc9aa`，TimeWhereNative `276c99b`；Worker dry-run 通过，没有生产部署。本地 2.6.5 未签名 Burn 已构建并核对 MSI/组件版本、491 文件清单、固定 UpgradeCode 和 manifest 大小/哈希，产物目录 `D:\Codex\TimeOnchrome-worktrees\timewhere-native-history\artifacts\release\windows\x64\2.6.5\`。Burn SHA-256 `ad4b928e698aa5ed909a1c939e4bd3984e7299414cc2c66a063c060bda9051e6`，源码 SHA 为 Native 实现提交；当前安装仍为 2.6.4。未推送/合并/部署/安装；端到端 Missing 为可信旧 ChatGPT 关联和发布升级后验收，不把代码测试或包生成记为已解决用户页面全部重复。

## COMPLETED（修复/本地包/用户安装后真实通道验证）：独立应用统计正常双时钟被误判不完整（2026-09-27）

已通过真实安装 2.6.3 的 Native Host framing→Service 只读查询确认：响应成功、19 个应用，本周七天不完整原因均为 APPLICATION_CLOCK_AMBIGUOUS。非网页重叠证据缺失，不是零账本。新 ApplicationUsageReader 要求 wall/monotonic 毫秒差完全相等，与实际 UtcNow/TickCount64 独立采样及既有 2000ms 跳变容差冲突。本轮 Native 修复仅应用读取：同用户/session/epoch 固定历史锚点，monotonic 决定毫秒并集，wall 用于日期/小时放置；真正跳变/字段损坏/epoch 回拨仍不完整，不修改原始 Segment、配额或共享读模型。先固定回归，再 ApplicationUsageReadTests/编译与必要本地安装候选 2.6.4；不跑无关平台/云端，不部署或安装，不猜测历史。用户截图证明扩展 1.7.39 已读到 Service，路由修复实际生效。

Native 修复源码已提交 `39a41d6`；ApplicationUsageReadTests 9/9、InstallerPackageTests 5/5 PASS，包含正常采样差、ACTIVE/PiP 并集、固定历史锚点、跨午夜相邻记录、日/周/小时守恒和真实异常。原网页/媒体账本、扩展目录及云端未改动。2.6.4 本地 WiX MSI/Burn 已构建，0 warning/error；实际版本、固定 UpgradeCode、491 文件清单、组件版本和 manifest 大小/哈希均通过。当前实机仍为 2.6.3，不能把夹具通过等同于真实整周统计已恢复。

安装包：`D:\Codex\TimeOnchrome-worktrees\timewhere-native-history\artifacts\release\windows\x64\2.6.4\TimeOnChrome-AppRuntime-Setup-win-x64-2.6.4.exe`，118944979 bytes，SHA-256 `22de02449ce8dbaac430c40d782dea46e218fe757efe8dbc68d7406d6ad43d47`；未签名、未安装、不发布云端/R2。审计 Matched＝读取纠错/毫秒并集/边界/真实异常/最小测试/本地包，Deviated/Missing/Extra 无（本地修复交付范围）。下一步只需原地升级后重新读应用页签，核对真实日期完整性；不需要换扩展目录或重新配对。

后续实机验收完成：用户安装/截图后，六个实际组件版本和 SHA-256 全部与 2.6.4 候选一致，Service Automatic/Running，当前会话单一 Session Agent。正式 Native Host→v3 pipe→运行中的 Service 七天只读响应全部 complete=true、无 reasonCodes，21 个应用；日/周独立查询相同，同 revision 重读一致，日/小时、分类/小时、各应用/每日毫秒守恒均 PASS。用户截图显示图表/分类/应用明细，为 PASS_WITH_MANUAL_EVIDENCE；真实多页未发生，分页能力仍以既有 101 项夹具证明，不伪称实机多页。截图后当前日增加正常 60 秒 checkpoint。本项从 mock/构建推进为实际通道已验证；仅解决独立应用读取，不改变网页/媒体原账、配额、共享合并、云端或原加载目录。Matched，Deviated/Missing/Extra 无（本项范围）；内部未签名风险保留。

## COMPLETED（代码/候选，用户页面已证实 Service 响应）：应用读取请求双监听器抢答修复（2026-09-27）

2.6.3 已安装：Service/Manager/Session Agent/Host/Core/Infrastructure 文件哈希与候选一致，Service Automatic/Running，当前会话单一 Session Agent。PO 实际页面仍显示连接未启用。代码证据：`native-host-client.js` 独立监听应用读取，但 `background.js` 只避让 Probe，其他请求进入通用路由返回 Unknown message type；页面把无 errorCode 的失败误映射为 managed_marker_unavailable。修复 checklist：背景监听器避让桥接专属读取/重新检查/能力通知→页面未知失败不伪称未启用→实际双监听器首响应固定回归→最小测试→原目录开发候选 1.7.39，同 ID/公钥/模式→实际通道检查，阻塞如实记录。

变更等级为扩展本地通信路由；必要测试 local-guardian、application-usage-read-model 和候选开发模式结构检查，语法/diff；CI 仅扩展相关。无需重新构建/安装 Service，不改状态机/原始分段、网页/媒体统计、配额、绑定或云端，不运行 Windows/macOS/WiX/Worker 全量。真实浏览器验收只读，不修改家庭配置。

固定回归提取实际 background 监听器与 Native Host 监听器共同响应，修复前失败 `true !== false`，证明通用监听器错误认领桥接消息；修复后四种专属消息均不进入通用路由，应用请求首响应为 Service 通道结果。local-guardian、application-usage-read-model、开发模式激活 5/5、语法/diff 均 PASS；未知路由错误不再误报连接未启用。原目录候选已原地生成 1.7.39，同公钥/ID、native-host-development、无 CRX 或云端发布。审计 Matched＝专属分流/错误提示/固定回归/原目录交付，Deviated/Extra 无；实机重载后页面读取仍 BLOCKED_BY_BROWSER_URL_POLICY，浏览器工具拒绝 extension URL，不绕过政策或宣称通过；需 PO 在原扩展点击重新加载后查看应用页签。Service 不需要再次安装。

## COMPLETED（安装候选，未安装）：补齐应用读取的可安装本地更新包（2026-09-27）

PO 指出只交编译目录不能完成升级，当前连续完成 Native 2.6.3 本地 Burn/MSI。仅新增版本/安装器结构验证及 WiX 自包含构建，复用已通过的应用/协议、契约和扩展测试；不跑无关全平台、不安装、不部署云端、不改变配对/原账/固定扩展目录。必须核对实际 MSI 版本、组件文件和 SHA-256，交付 Burn 绝对路径；安装/实机验收不伪称已完成。

已完成：Native 干净源码 `3e6c327c097782a36f1d26d4c96d6e455ee0c2bd` 构建 2.6.3，InstallerPackageTests 5/5 PASS，WiX MSI/Burn 0 warning/error；实际 MSI 版本、固定 UpgradeCode、491 文件清单及四个安装组件、五个发布组件版本通过。Burn 位于 `D:\Codex\TimeOnchrome-worktrees\timewhere-native-history\artifacts\release\windows\x64\2.6.3\TimeOnChrome-AppRuntime-Setup-win-x64-2.6.3.exe`，118956905 bytes、SHA-256 `f458782bcb85ddd66e383d85bbf54a17dc85046c865a6b926f0205b14af87bc5`；MSI 60511988 bytes、SHA-256 `7da919f54b1ad02e591022b04ea74debb8427a1d4ad6d5922a571e21888e1de3`，均与 manifest 相符。内部未签名；Matched，Deviated/Missing/Extra 无（安装候选交付范围）。本机服务仍 Automatic/Running，尚未安装新包，不宣称实机应用页签已生效。原扩展目录 1.7.38 不变；没有云端/R2/latest 发布或家庭数据库写入。

## COMPLETED（代码与本地候选）：终端使用分析增加独立应用用量（2026-09-27）

PO 确认先展示应用用量，合并共享留待后续；本机源码已在 TimeWhereNative，沿用双仓边界，不回迁。变更等级：只读本地协议＋Console 行为，不改变网页/媒体原账、统计、配额及云端。

Checklist：
1. [x] contracts 1.13.0 增加 v3 `application/getApplicationUsage`、能力协商和裁剪响应；Native 消费固定打包件，不跨仓引用源码。
2. [x] Service 根据已验证 pipe 客户端确定本机用户，只读已结算应用账；北京时间日/周、毫秒保留、主区间并集，未知分类不猜测。辅助媒体、0ms 诊断不计主用量；无法可靠分配的时钟区间明确不可用。
3. [x] 扩展复用串行通道查询，首次查看/日期切换/重连/可见页签每分钟/手动刷新触发；旧 Service、Host 缺失、停止和超时显示可理解状态，不影响原通道。隐藏、离开分析页或退出登录后不查询；迟到 requestId 不占用后续 ACK。
4. [x] 原使用分析增加“应用使用”，保留网页/媒体，日/周、图表、应用/分类列表与详情；本机当前用户、已结算数据，不显示身份/凭据，不计算共享总量或网页配额。
5. [x] 聚焦协议/用户隔离/并集/跨日/分页/客户端/页面测试及桌面移动 mock 目视验证；typecheck/build 和 diff 检查；审计后同提交收口。

必要 CI：契约真实消费者及 Native Windows 编译；本地只运行新增读模型、协议、客户端和页签回归。排除云端 Worker/Guardian、macOS、WiX、原账状态机全量测试及生产发布，因为这些路径无业务变更。发布 smoke 本轮不适用；实际安装通道未升级前不能宣称实机端到端通过。

本地证据：Contracts typecheck/build/compatibility PASS；Native `ApplicationUsageReadTests|BrowserBridgeTests` 25/25 PASS，Service/Host Release 编译 0 warning/error。SQLite→真实 framing→扩展 validator 对照总量 2501ms、应用明细 3501ms，证明不相加冒充总量。扩展 application-usage-read-model、local-guardian、既有 browser-bridge-v3-snapshot PASS，原 admin-read-model 43/43 PASS。新增能力通知首次实现曾把不含 negotiation 的本地 drain summary 误当为能力缺失，聚焦测试捕获后改为仅明确协商响应更新能力，最终通过；不隐藏中间失败。

隔离 mock 目视验证为 `PASS_WITH_MANUAL_EVIDENCE`：1440×1000 桌面、390×844 移动（页面 scrollWidth=390，无整页横向溢出；表与小时图表内部可横向滚动）、搜索/分类/详情、日周及日期导航、无 Host 不显示零、断线缓存截止时间、可见一分钟查询/隐藏停止、重连刷新及迟到响应不覆盖网页页签。截图位于忽略目录 `output/playwright/application-usage-{desktop,mobile,missing,cached}.png`，不提交用户资料或截图。

实施审计：Matched＝契约、只读权威、用户隔离、分页版本、缓存/失败、三页签及本地验证；Deviated/Missing/Extra＝无（代码实现范围）。实机通道验收为 `NOT_RUN_REQUIRES_UPDATED_SERVICE`：已安装 Service 2.6.2 尚不具备新能力，本轮未替换正式程序、安装 MSI 或重载用户扩展；本地编译与 mock 不能记为实际配对机器端到端 PASS。未部署云端、执行 migration、发布 R2/latest、启用共享配额或修改网页原账。固定开发候选目录保持不变。

交付证据：TimeOnChrome 功能提交 `f24966d`，TimeWhereNative 功能提交 `3571241`，均位于 `codex/extension-application-usage-v1`。Native 锁定来自前者的 Contracts 1.13.0 打包件（SHA-256 `4f5ce5cc0dcaa4691f5dcaa705472c2966b901ffc5f926a824f7e1cc7455f2f1`）；恢复当前/上一 1.12.0 后上述原生聚焦回归各 25/25 PASS。本地开发候选已原地生成 1.7.38，仍为 `dist/native-host-managed-candidate/package-extension`、`native-host-development`，公钥/Extension ID 不变、没有 CRX；开发激活 5/5 PASS。只读系统核对确认现有 Service Automatic/Running，正式程序仍为 2.6.2/2.6.2.0，本轮没有安装。下一步是单独构建并验收支持新能力的安装候选，而非修改加载目录或重新绑定；不能仅重载扩展就宣称真实应用读取可用。

## NOW：BrowserBridge v3 完整收尾计划（2026-09-26，PO 授权连续执行）

目标：在 TimeWhereNative/TimeOnChrome 拆仓边界内完成权威网页快照、纯转发 Host、应用权威账与可解释重叠影子的工程交付；不把安装成功、收到消息或等待自然日当成完整验收。不启用共享配额执行、反向控制、原账重算、历史猜测或新的生产发布。

实施 checklist（逐项更新，正常进展不等待 PO 重复催促）：
1. [x] 核对两仓远端与证据基线：TimeOnChrome `origin/master@6876e4f` 已包含先前 Guardian 收口；Native 本地尚有 2.6.1/精度/2.6.2/验收提交待集成。原 worktree、扩展加载目录和未跟踪旧 agents 残留保持不变。
2. [x] 受控跨仓链式验证：真实 V2/v3 builder 的三个公开 JSON 夹具 deep equality 通过；Native framing/协议/守恒→临时 SQLite revision 替换/重复 ACK/脏状态→精确毫秒重叠→重启回放 6/6 PASS。网页 3 秒 + 应用 1501ms − 0 秒 = 4501ms；全覆盖 3 秒 + 4001ms − 3 秒 = 4001ms；缺证据不给共享值。未引用另一仓源码、写家庭库或改系统时间；真实 pipe/SCM 单独复用安装证据，不冒充同一夹具覆盖。
3. [x] 故障/兼容证据矩阵：snapshot 与 local-guardian 两个聚焦文件 PASS；新增 Host 后来安装同步本周、Service 失败保留待发送、错误 revision ACK 不删除数据及恢复后清空、原账不变。旧 Service 健康-only、不发 v2 Segment、退避/手动重试/模式隔离复用固定断言及既有实机证据。新增测试首轮因模拟 v3 heartbeat 未返回能力信息超时，修正模拟响应后通过，非产品代码改动。
4. [x] 修正权威文档：根 DESIGN/PROJECT_MASTER 与模块 TASK_BOARD/PROJECT_MASTER 已明确 v2 历史、v3 当前、2.6.2 本地安装、旧日期限制与两仓归属；Native README 对齐。过去发布/测试失败保留，不重写历史。
5. [x] 提交与交付：TimeOnChrome PR #53（head `abdda90`，CI `36251125392`）已合并为 `5821a2bf2978ea67b68133b70f6500beb4cfb4d2`；TimeWhereNative PR #2（head `33b9519`，CI `36251123382`）已合并为 `cb70ec3fdfe631dc39451e194961cb1891c15274`。Native 当前/上一契约各 167/167 PASS，WiX MSI/Burn 均 0 warning/error、native-gate 通过，macOS 按范围跳过；原生 CI 候选 artifact `10909895029` 仅保存 GitHub，不进入 R2。C 仓轻量 gate 通过，Worker/Console/发布 job 跳过。
6. [x] 最终审核：实施 checklist Matched；Deviated/Missing/Extra 无。跨仓、故障恢复、边界、精度、版本/原账保留均 PASS（真机人工环节为 PASS_WITH_MANUAL_EVIDENCE）。旧日期共享为已知历史限制 BLOCKED_BY_HISTORICAL_SESSION_MAPPING，不补造；新日期与精度由受控回归证明。未宣称完整家庭整周 PASS，也未新增安装、重载、配额执行、反向控制或生产发布。

交付检查：两仓 `git diff --check` 通过，TimeOnChrome 精确提交归档的边界脚本 PASS，Runtime/Guardian/Pages/Extension/Contracts/原账业务文件无本轮差异。C worktree 仅保留用户未跟踪旧 `app-runtime-management/agents/` 构建残留，不提交、不删除；D Native worktree 已提交干净。主工作目录与任务管理线已有未提交修改只读核对、不纳入本次。最后纯文档收口只运行 diff/轻量 CI，复用上述代码和已安装产物证据，不重跑产品测试。

测试契约：跨仓协议消费者及影子集成验证；本地仅扩展 fixture/Host-client 聚焦文件与 Native 新链式集成测试，既有 SharedDaily 6/6、Installer 5/5、WiX/hash/实机 UI 证据复用。CI 为真实受影响 Windows tests 和根轻量/扩展相关门；不运行 macOS、安装器重建、Worker/Console 全量、破坏性停服或无关 E2E。没有网页落账代码改动；若发现必须改变原账/配额/归属语义，按 D-076 单项批准门停止该项，不绕过。

## NOW：固定 Native Host 本地候选目录修复（2026-09-26）

- 验收方式更正：不要求 PO 等待自然日作为开发完成条件。已通过的 `BrowserSharedDailyTests` 6/6 包含受控 SQLite 的跨午夜旧缺口、新日期可用、会话/用户隔离、重启回放及毫秒保真，按相同源码与产物证据复用，不重复跑测试。本机升级/数据保留/v3 通信已验收完成；真实本周旧日期因缺历史映射不可用仍是已知产品限制，不猜测补齐。后续自然运行观察仅为补充实机证据，不能伪称已通过，也不能用无限等待代替开发定位和收口。

- PO 要求继续完成本机闭环：Native 候选升级为 2.6.2，固定安装身份/配对/数据/扩展目录，复用精度回归 6/6，仅新增版本与安装器结构测试和 WiX 构建。构建后校验 SHA/文件清单，以 Computer Use 原地升级（行动时确认，UAC 人工），再只读验收 Service、单 Session Agent、原身份/账本保留、v3 快照与精确毫秒 shadow；不修改或部署云端/扩展/R2。任何实机残余缺口明确记为 BLOCKED，不将装包当作完整共享 PASS。
- 2.6.2 本机升级与只读验收完成：Native 构建 SHA `b9e8b7a75f198a6ec44b1720b943b2b5a32d57c3`，安装器结构 5/5、既有精度回归 6/6；WiX MSI/Burn 0 warning/error。Burn SHA-256 `b1c3391f803bd2ea247515911e9065a39998a0e22ecc1e48d2a01f623a3391b4`，MSI SHA-256 `b86d938ae960579fe172b0ea62fb06a751bcc2c8ae5a1f5261ce9fbda6bf792c`。PO 确认后通过 Computer Use 启动安装，Burn 日志 result=0x0、restart=None；已安装六个组件版本 2.6.2 且哈希匹配候选，Service Automatic/Running，当前会话一个 Session Agent。TimeWhereMg 截图和可访问树显示在线、已配对、Service 运行及升级后 v3 成功时间；无需扩展重载、不改固定目录。
- 数据保留验收：SQLite 只读事务比较升级前 8,606 条原账 payload 的固定前缀哈希完全相同，升级后仅新增正常记录；credential 和机器密钥大小/更新时间不变，策略仍存在并继续正常更新。6/6 网页快照完整、待投影 0，精确毫秒 shadow 列及六行已填充。主/媒体/日志上传 outbox 为 0；安装清单 outbox 升级前已有 103 条、验收时 109 条，不能声称全部队列清空。摘要脚本首轮因 PowerShell UTF-16 结果文件解码失败，经修正编码识别后完成，不涉及数据库写入。
- 本机升级范围审计：Matched＝已批准精度修复进入 2.6.2、原地升级、程序/身份/原账保留、v3 继续同步和界面核对；Deviated/Extra 无。完整共享统计验收仍 BLOCKED：六个旧日期保留 `SESSION_MAPPING_INCOMPLETE`，不以升级成功代替整周共享 PASS。未部署云端、发布 R2/latest、改动扩展/原账/配额，也未运行无关全量测试。

- 精度问题继续执行：新增合法 1500ms 应用输入的最小回归，证明无重叠/完全重叠的表达限制与真正部分重叠歧义不同；只运行 `BrowserSharedDailyTests`。拟议精确小数读模型（不舍入、不改网页权威秒数/原账/配额）已请求 PO 单项确认，未确认前不改 product code。21:29 首轮摘要的 clock mismatch 查询误用了不存在的 `durationMs`，其 mismatch 数无效；已修正为 `monotonicDurationMilliseconds`，但修正后的 UAC 查询被取消，不能把旧结果当作有效时钟诊断，不再重复弹 UAC。
- PO 已明确回复“按此实施”：Native Core 以整数毫秒保存应用/共享规范值，decimal 秒属性不舍入；Store 只为本地可重建 shadow 增加精确毫秒列，旧整秒行无损兼容。网页整数秒、原账、配额和 overlap 歧义校验不改；测试仅 `BrowserSharedDailyTests`。实施顺序为文档→Core→Store→回归与旧表/重启验证→审计，禁止本轮构建或安装、发布云端或契约。
- 精度修复代码完成：Native `BrowserSharedDailyTests` 最终 6/6 PASS，证明无重叠 1+1.5=2.5 秒、全覆盖扣 1 秒后为 1.5 秒、1ms 精度不丢失；SQLite INTEGER 毫秒规范列兼容旧表/旧整秒行，重复初始化与重启回放保真，网页/应用原 payload 不变。首次编译断言类型失败已修正，不隐去失败。审计 Matched，Deviated/Missing/Extra 无（本次限本地代码与回归）；已安装 Service 尚未加载该修复，历史映射缺口/真实部分重叠歧义不被此修复消除，不宣称实机整周共享 PASS。

- 21:28 后继续只读核对：Service 为 Automatic/Running，本周 6 份网页快照完整、待投影 0；新映射主记录持续增加且未发现新增映射缺口。不能仅等待新日期后宣称共享可用：当前已映射应用区间并集仍有毫秒尾数，`BrowserSharedDailyProjector` 对非整秒并集返回 `APPLICATION_FRACTIONAL_SECOND`；旧映射缺口先行返回，掩盖了此独立精度门禁。该摘要为映射后区间的只读核对，不是整日共享数值或未知历史补算。不得直接 floor/round、放宽校验或改网页整数秒口径；先明确应用权威毫秒与网页 credited seconds 的精确合并表达及展示舍入边界，再按单项批准实施。整体共享验收仍 BLOCKED，原网页/应用账、现有独立配额不受本次诊断影响。

- PO 同意历史缺口不猜测、不补写，完整新日期应独立可用。当前继续项为只读边界核对与固定回归：按日检查已映射/未映射的权威应用记录，验证旧日失败不阻塞新日、跨午夜未知段只影响实际覆盖日期、重启后边界保持。原生 Store 已按北京时间日期筛选，不为历史问题机械升级安装包；仅新增 BrowserSharedDailyTests 聚焦回归及 README 说明，排除云端、安装器、macOS、全量测试。若真实新记录仍缺映射，按证据另修；不放宽 unknown 的 fail-closed，不更改原账/配额/整数秒规则。
- 边界核对完成：Native `BrowserSharedDailyTests` 4/4 PASS，固定 SQLite 回归覆盖跨午夜缺口、旧日/完整新日、重启、用户隔离、0ms 诊断及原 payload 不变。已批准 UAC 只读摘要确认当前映射边界后的主记录无新增未映射、旧缺口不跨该边界；实机未来完整日期尚未发生，不伪报整周共享通过。无需再改程序或安装，旧日不可用及精度歧义仍按现有 fail-closed 保留。

- 发布与真实验收收口：PO 要求继续合并部署后，PR #51 合入 master `7edf200aa2f87bbb67b766e938bcffbb8cd791c5`；精确 SHA Guardian CI `36244181761`、Guardian-only production `36244215759` 均成功。Guardian 版本 `8d21c210-b9fd-46b5-969e-0f4c84451715`，新 `/device/usage-interval-evidence/v3` 未认证 401、health 200；未执行 migration，Runtime Worker/独立 Pages/主 Pages/R2 latest 与前次 manifest 完全相同。
- 用户重载原固定目录 1.7.37 后，授权 UAC 只读摘要确认：本周网页快照 6/6 完整、待投影 0、总量不一致 0、有用量无区间 0，当天快照完整且有正用量和区间。网页权威统计恢复链路 PASS_WITH_MANUAL_EVIDENCE（重载/UAC 由 PO 操作，SQLite 摘要由脚本读取）；不是原始网页账本精确计时的新验收结论。
- 共享合并仍 BLOCKED：6 个日期均为 `SESSION_MAPPING_INCOMPLETE`，已有 owner 映射存在，但本周旧应用 runtime session 缺历史 Windows 会话关联；不得按用户 ID 猜测或回填。此问题不再归因于网页证据缺失。本次部署/证据恢复范围审计 Matched，Deviated/Missing/Extra 无；整体共享统计不可用的风险保留，后续单独确定可证明的历史兼容边界。

- 2026-09-26 PO 已单项批准本周裁剪区间只读恢复。实施 checklist：① device route 与 correction service 新增仅 token 所属设备、本周指定日期的 ACTIVE 证据分页；② cloud-sync 只读分页和稳定版本校验；③ v3 快照仅在本地区间缺失时使用独立临时证据，与 V2 总秒/逐桶严格守恒；④ 聚焦授权、分页、冲突及快照测试。原始账本、修正和统计写入不变，旧会话映射不猜测。测试等级为安全敏感只读 API/快照消费者，运行相关 Worker/Extension 单测与 TypeScript；排除 Agent、安装包、macOS、全量回归。新接口生产部署另行过闸，不因本次批准自动发布。
- 实施结果：设备只读接口、按日稳定分页及临时证据恢复已完成。SQLite 夹具验证同设备隔离、100 条分页、固定 anchor、裁剪字段、修正冲突和删除导致版本变化；路由验证 401/403/400/503 与 no-store；扩展验证缺页/版本变化/重复/冲突拒绝、四桶与 V2 精确一致、已有证据不发请求、接口失败不改变权威读数。5 个聚焦测试文件、开发激活/包隔离、TypeScript、Guardian Wrangler dry-run 及 diff check 通过。原固定目录生成 1.7.37 开发候选，未打包、未改正式版本、公钥与 ID 保持不变。实现审计 Matched，Deviated/Missing/Extra 均无；生产新接口部署、用户重载及真实缺失日期恢复仍待发布/验收，旧应用会话归属不足仍明确保留。

- PO 要求继续定位，不等待重复指令。本轮补只读桥接来源诊断：有权威秒数而无区间时区分无 ACTIVE 原记录、缺 ID、无效时间和本周无记录，不包含网站/身份字段、不修改生成或保留规则；当前原始字段缺失原因尚未确证，不自动修复原账。仅运行 v3 快照、候选打包边界/激活测试；原目录候选推进 1.7.36，保持公钥与数据不变；不构建原生安装包、不部署云端、不跑全量测试。
- 本地结果：v3 快照新增来源诊断固定回归、开发激活 5/5、包隔离矩阵与 diff check 通过；原目录已生成 1.7.36、公钥/Extension ID 不变。诊断补丁审计 Matched，无统计计算/原账写入/保留行为变化；真实来源诊断待用户重载后核对，不能把候选生成或单测通过写为实机根因修复。
- 重载后实机证据：Service 2.6.1 / protocol 3 持续在线，6 份快照已接收、待投影 0。当天快照 count=1、complete=1、hasIntervals=1、positiveUsage=1，说明当前网页快照并非无区间。4 个历史日期仍有用量但无区间；诊断未发现全局无 ACTIVE、缺 ID、无效时间或全部周外。全部快照均可找到当前 owner 映射，但本周应用历史存在 50 个尚未关联 v3 的 runtime session（不是机器/用户数）。共享整日/整周仍不可用；不强行绑定历史、不重算或补造区间。当前来源为何缺少那 4 天区间（保留/迁移/压缩等）尚未确证，继续保留 P0 风险，不将当前通道 PASS 等同完整历史合并 PASS。
- 恢复可行性只读核对：现有 `/profiles/:id/usage-segments/v1` 仅接受家长 account token，并返回 domain/description/target 等完整明细；不得在扩展复用家长凭据或放宽该接口权限。旧机器账本及 open-state 表无 Windows session_id，不能从 local_user_id/runtime_session_id 自动猜测旧 Windows 会话。
- 待 D-076 单项批准的精确改动：新增设备鉴权、仅本设备当前周 ACTIVE 原始区间的分页只读接口；返回开始/结束、原始整数秒及有效配额桶和稳定版本，不返回域名/标题/路径/家庭标识。扩展只在本地证据缺失时读取并核对权威总秒/逐桶守恒，放入独立临时证据层，不写回 `usage_segments_v1`/统计/修正表、不重新结算。旧接口与原账不变；缺页、冲突或守恒失败仍 unavailable。少记/多记风险限定在共享影子，必须验证伪造设备/跨设备/分页修正并发/重复区间及与 V2 严格一致；仅 Worker 与快照消费者聚焦测试。此接口和生产发布未实施，总体“继续”不替代网页账本读取边界单项批准。

- PO 要求直接修复现有加载目录 `dist/native-host-managed-candidate/package-extension`；目录名称为历史兼容，候选模式仍为 `native-host-development`，不启用正式托管策略。
- 根因：v3 曾输出至新目录而原目录停留在 v2，两者同为 1.7.34。新增仅限 unpacked 开发候选的 `--candidate-version`，本次候选为 1.7.35；正式源码 manifest、生产 CRX 和云端版本不变。
- 实施：保留原 manifest 公钥/Extension ID，原地生成最新 v3 代码；不改网页落账、配额或生产配置，不删除 Chrome storage。用户仅需在原扩展点一次重新加载，不移除、不重绑、不换目录。
- 测试等级：本地打包工具修复；必须＝候选版本边界、开发激活与包隔离聚焦测试、固定目录版本/公钥/模式/v3 内容核对、`git diff --check`；排除云端、原生安装器、macOS、网页账本及全量 CI。浏览器内部页自动化受策略限制，重载由用户手工完成，再只读查询 Service。
- [x] 候选版本边界/包隔离矩阵及开发激活 5/5 通过；原目录已原地生成 1.7.35，公钥/Extension ID 与旧候选一致、模式仍为开发、包含 v3 快照；正式源码 manifest 仍为 1.7.34。旧生成包备份至 `dist/native-host-managed-candidate-v2-backup-20260926/`，未清理浏览器数据。
- [x] 2026-09-26 用户重新加载后，只读 Service 状态确认 2.6.1 / BrowserBridge protocol 3、在线且无连接错误；固定目录候选已实际建立 v3 健康通信。
- [ ] v3 共享统计验收未通过：经 PO 授权 UAC，只读 SQLite 聚合显示收到 6 份快照、待投影 0、完整快照 0、可用共享结果 0；6 份含 `CORRECTION_EVIDENCE_UNAVAILABLE`，其中 4 份另含 `EVIDENCE_TOTAL_MISMATCH`。保持 fail-closed，未用 Service 重算值填平差异。按 P0 继续只读排查权威统计/证据不一致，不据此断言原网页账本错误；相关发布阻断，未修改账本、ACL、凭据或生产环境。
- 只读定位补充：生产 Guardian 默认地址的 `/device/usage-accounting-corrections/v2?offset=0` 未认证 GET 返回 404；当前源码该路由存在且未认证应返回 401，说明目标生产地址缺少该接口。v3 权威读数应用 compact corrections，但区间归属依赖该逐段证据；接口缺失可能造成桶差异，尚未证明是全部 4 份不一致的原因。现有紧急压缩也可能保留统计但缺原始区间；不得补造区间或改写账本。当前本地验收边界不含 Guardian 部署，须另行取得生产发布授权后再验证。
- 2026-09-26 PO 后续明确批准 Guardian 发布：PR #49 / master `99a49a9`，Guardian CI `36242113745`、production `36242161483` 通过，仅发布 Guardian `a8941611-d508-47e9-80d0-65b2c5bb6fd7`，接口 401、health 200。受控浏览后 6 份快照均消除证据接口不可用，2 份完整；4 份仍有用量却没有区间（不是舍入误差），2 份完整快照共享投影被历史会话映射不足阻断，待投影 0。共享统计仍未通过，未部署其他资源、修改原账或伪造证据。
## Guardian v3 首轮只读证据接口发布记录（2026-09-26）

- PO 已批准仅发布 Guardian 只读修正证据接口并继续 v3 全链路验收；不部署 Runtime/Pages/R2，不执行 migration，不改网页账本、配额、凭据或历史数据。
- 最新 master 的 Guardian 业务已有该接口，生产未认证请求仍返回 404。现有 production workflow 要求精确 master SHA 的 Guardian CI，而该 CI 的路径过滤跳过了最近文档/拆仓提交；补 `workflow_dispatch` 入口，保留全部原验证步骤和发布门禁。
- 测试契约：发布配置小修；本地验证 workflow 结构与 `git diff --check`；CI 只运行现有 Guardian compatibility；发布 smoke 为接口 401/health 和已安装 v3 的摘要验收。排除 Agent、WiX、macOS、Runtime/Console 与全量跨平台测试。
- checklist：手动 CI 入口 → PR 合并 → 精确 master Guardian CI → 受保护 Guardian-only production → 401/health → v3 摘要；不得把证据不完整或未完成验收写为通过。

## TimeWhereNative 本机拆仓（D-104，源码/CI 与不可变候选交接已完成）

- [x] BrowserBridge v3 已通过 PR #44 合入 `origin/master@373877d`，本任务从该干净基线开始。
- [x] 在隔离仓保留 `agents/`、`installer/` 的 40 个相关历史提交并迁入私有 `TimeWhereNative`；原生仓锁定 contracts 1.12.0/上一兼容 1.10.0 及包校验值。
- [x] 原生仓独立 Windows/macOS/WiX CI；TimeOnChrome PR #45/#46 保留 contracts、Runtime Worker/Pages/D1/R2、Guardian adapter 与唯一 R2 发布权。
- [x] 双仓隔离构建、当前版及上一兼容版协议验证、发布权限审计完成；旧本机源码和旧 CI 入口已通过 PR #45 从 master 移除。原生仓 PR #1（merge `d7b56ec`）修复最新 Windows CI 失败并引入最小影响测试路由。旧仓在无本机源码时完成 contracts build/compat、Guardian TypeScript/集成、Worker typecheck/Vitest `56/56`/dry-run 及 Console session 测试；原生仓 CI `5759559` 的真实安装候选已通过旧仓验真器，旧来源 SHA 的本地候选被正确拒绝。
- [x] 发布交接独立门：旧仓 production 环境配置了只读跨仓令牌和仅限 Runtime 发布桶的一年期 R2 对象读写凭据；受保护验真运行 `36117686246` 通过，`master@8b96cad` 的发布运行 `36131882394` 第 3 次尝试完成原生 CI `36045220406` / SHA `575955972e64c56094f77c150548e8261c66e598` 的来源与 contract 1.12.0 校验、2.6.0 Burn/MSI/manifest 条件写入和逐件回读。前两次凭据错误均未成功上传，误配 token 已吊销。R2 manifest `windows/x64/2.6.0/manifest.json` 在二进制之后写入；latest.json 仍为 2.3.1，未切换。
- [ ] 后续独立闸门：2.6.0 未签名候选不等于公开正式发布；终端升级、真实家庭数据验收及 R2 latest 切换仍需各自明确批准。跨仓只读令牌于 2026-10-25 到期，R2 专用凭据于 2027-09-25 到期，需在到期前轮换。

测试契约：架构／源码所有权迁移（高风险）；本地必须＝原生文件与 Git 历史对照、Windows 测试与 WiX 构建、macOS CI、contracts 当前版/上一版兼容、TimeOnChrome contracts/Worker/Console/Guardian 定向检查、边界与权限审计、`git diff --check`；CI＝两仓各自受影响 job。源码迁移未部署 Worker/Pages/Guardian 或执行 D1 migration；另行批准的候选发布已写入不可变 R2 路径。本轮仍排除 R2 latest、终端升级、真实家庭数据、网页／应用账本语义修改。

- [ ] [P1 Native App / preconfiguration presentation / deployed, visual pending] 主表与预配置页显示归属、旧来源详情核验动作及对应单测已完成：可执行 BLOCK 进入“已阻止”，预配置页只显示未匹配来源并区分 BLOCK/候选。Product Owner 于 2026-09-24 明确要求先提交部署并自行验证；部署前目视验收因浏览器安全策略未完成，仍待 Product Owner 线上确认，不记为 PASS。代码提交 `cffcee2`；Native Worker `1ff8c68b-82bc-4cdc-a498-85eb4cb44912`、Pages `c2d25d50` 已部署，稳定域名 HTML/JS 和 Worker `/health` 回读 HTTP 200。本轮未导入新生产来源，也未做跨 Child 复制。
- [x] [P1 Native App / migration ledger repair / deployed] 生产 Native D1 的 `002/003` 表、索引及 `inventory_snapshot_id` 字段已与仓库迁移核对；仅补录缺失迁移元数据，未重放旧建表 SQL。随后应用 `004`，回查无待执行迁移，既有 21 条来源仍全部为 `BLOCK`。
- [x] [P1 Native App / preconfiguration version attribution / local] 通用来源自动绑定已按实际激活的来源项写入 `required_policy_version`；同批只提升一次 Child 策略版本，候选项不写版本。相关回归通过，未扩大规则匹配或改变策略优先级。
- [x] [P1 Native App / inventory-only preconfiguration match / local] 无可用签名身份的安装项可按精确 Bundle ID 关联预配置来源，主列表仍显示只读安装项；测试确认没有伪造 Santa 观察或生成 BLOCK 规则。
- [x] [P1 Native App / preconfiguration backend / local] 通用来源预配置后端第一包已实现并通过本地测试：旧 21 条 BLOCK 无损兼容；新增纯候选不得编译 Santa 规则；同序号不同来源的组件不会误停用。后续另包完成 Qustodio 全目录导入和跨 Child 初始化。本轮未执行生产迁移或部署。

- [x] [P1 Native App / local naming / 2026-09-24] 当前 Child 的可管理应用主名按最新有效安装快照展示；Santa 先发现的历史对象在导入后更正名称，不写账号级共享名称、不影响其他 Child。名称投影与回归已完成；未迁移生产 D1、未改预定义来源模型或策略执行。

- [x] [P1 Native App / source imported / 2026-09-24] T.xia Qustodio 21 项预定义 BLOCK 来源已在登录的 Qustodio 页面逐项核验名称和 Bundle ID，并一次性幂等导入独立 Native D1；控制台回读为 21 条来源项。仅 7 条关联已有 BLOCK 身份并显示终端 1/1 已应用；其余 14 条待识别，不凭名称生成规则。来源清单保存在本机忽略目录 `.artifacts/qustodio-thomas-block-2026-09.json`，不提交家庭专属配置；其他 Child 预定义项为 0，未新增未核验规则或改变现有策略版本。
- [ ] [P1 Native App / identity follow-up] 等 Santa 观察或新的安装清单提供剩余 14 条的可信身份后，按独立 Native App 审核流程核对并下发；不得把预定义来源项误报为已启动或已阻止。
- [x] [P1 Native App UI / deployed] Santa 应用目录收敛为顶层 App：Native Macs 导入安装快照，独立 D1 保存每台 Mac 的安装事实，Santa 事件只补充真实发现；保留三状态入口和逐应用规则，六类折叠展示，组件不计入应用数量。Thomas 清单 ZIP 本地验证为 146 个顶层 App；migration 002、Native Worker、控制台 Pages 已于 2026-09-24 独立部署并回读。

> App Runtime 跨边界集成已由 PR #8 合并 master，D-092 生产 SSO、主 Pages 独立复部署和旧地址兼容验收完成；contract `1.0.0`。Runtime 内部任务及生产 manifest 由 `app-runtime-management/docs/` 管理，本任务板只追踪 Guardian adapter 与主控制台入口兼容；本次不修改网页账本、网站配额或任务管理工作线。

## BrowserBridge v3：权威网页统计同步（开发中）

- PR #44 的 Guardian Integration CI 暴露旧集成测试将 contracts 版本固定为 `1.9.0`，与已升级的 `1.12.0` 冲突。只修正测试为校验兼容的 `1.x` SemVer，不变更 Guardian 业务、契约或网页账本；运行该聚焦测试和 `git diff --check` 后更新 PR。

- 验证补口：隔离 Chrome 测试 profile 已补当前隐私同意；在扩展页面读取同一受控账本并执行 V2/v3 逐日、逐配额桶严格对照，原始 ACTIVE 秒数、V2 与 v3 相等，证据完整；旧 E2E 三项均通过。V2 未物化的零用量日按零值对照。Guardian Worker（新增只读路由）和 Runtime Worker dry-run 分别通过。该证据只关闭浏览器对照缺口，不单独宣称整个 v3 已完成或可发布；生产激活及网页落账语义未修改。

- [x] 保留 v2 历史基线；新版扩展不向任何 Service 回退发送原始网页 Segment。
- [x] v3 只同步本机、北京时间逐日可替换的网页权威统计与同口径区间证据；Service 验证守恒，仅作本机会话网页／应用重叠调整。证据不足时不发布共享总量。
- [x] 预期使用 Host 的 managed／开发候选区分 Host 缺失、Host 不可连接及 Service 停止；有界退避、手动重试，无弹窗且普通／CWS 不提示。
- [x] 当前周逐段修正证据接口已获 D-076 单项批准并完成只读本地实现；不更改网页原 Segment、现有统计、配额、上传和阻止语义。生产未部署。

测试契约：变更等级＝跨边界统计契约与本地可靠通信（高风险）；受影响＝Extension、Contracts、Windows Host/Service、只读修正证据接口；本地必需＝权威 V2 逐日逐桶严格相等、Host 缺失／旧 Service／重连、v3 守恒及精确重叠、Service 幂等快照与不完整状态、修正接口分页和鉴权的聚焦测试；CI＝对应 Extension、Contracts、Windows、Worker job；发布 smoke＝无，本轮不发布；明确排除＝Windows 安装包、macOS、Pages、Guardian 部署、生产 D1/R2、网页落账状态机和现有配额算法。真实浏览器核对须采用受控测试数据，不读家庭明细。

## Native Host 健康与落账镜像通道（D-101）

- [x] BrowserBridge v2 将 `health` best-effort 与 `ledger` durable at-least-once 分离，并保留 v1 一个兼容周期。
- [x] 扩展 1.7.34 仅观察既有权威账本，持久化待发送 ID/日期摘要并按启动、每小时、重连和失败对账；不修改网页落账边界。
- [x] Runtime 2.6.0 同时监听 v1/v2，镜像写入与影子脏区间同一 SQLite 事务，逐项 ACK 后异步合并重建。
- [x] TimeWhereMg 提供裁剪后的 BrowserBridge 健康摘要；Host 对预期 stdio/pipe 断开静默退出。
- [x] 已构建本地未签名 Runtime 2.6.0 与 unpacked 1.7.34；2.6.0 已在本机原地安装，Service Automatic/Running、单一 Agent，1.7.34 开发候选已协商 BrowserBridge v2，管理员诊断观察到 1 条 Ledger accepted、0 rejected、待投影 0。
- [x] 断线补发实机验收：真实前台切换后 accepted 由 1 增至 9；随后受控停止 Service 约 101 秒并自动恢复，v2 重新在线，accepted 由 9 增至 14、duplicate 由 17 增至 26、rejected 为 0、待发送与待投影均为 0。只读 SQLite 聚合确认至少 1 条 Segment 完全位于停机窗口且在恢复后收到，镜像总数 14 与 accepted 计数一致；未读取网站或个人标识。

测试契约：变更等级＝跨边界本地可靠协议 + Windows Service/Host/Manager/Installer + Extension observer/outbox；本地必须＝contracts v1/v2 兼容、扩展协商/持久补发/逐项 ACK/100 条分批、Host framing/静默断开、Service 双 pipe/幂等/事务与投影恢复、Manager 状态裁剪、相关版本/WiX 结构和 `git diff --check`；性能＝10,000 条有界分批聚焦测试；发布 smoke＝只构建本地未签名候选，不部署云端；明确排除＝Worker、Pages、Guardian、D1/R2、macOS、网页状态机/账本边界、配额执行和应用阻止。

## App Runtime 本地桥集成（D-103）

- [x] Managed 扩展迁移至 `com.timeonchrome.nativehost`，仅在网页 Segment 已持久化后发送隐私裁剪镜像。
- [x] 保留 D-061 旧 Host ID 兼容，不改变普通/CWS 包的 nativeMessaging 移除规则。
- [x] 原始网页落账、聚合、上传和现有配额执行保持不变；Runtime 侧影子实现与证据由模块任务板维护。

## Unpacked Native Host 联调修复（D-099）

- [x] 增加只能由 Chrome `development` 安装类型启用的 `native-host-development` 候选模式；保留普通激活和既有本地绑定。
- [x] 修复 Runtime 2.5.0 BrowserBridge 管道客户端未显式请求 impersonation 导致的循环失败，版本前向提升至 2.5.1。
- [x] 修复开发候选仍先执行旧 `managedProfileEmail` 门禁的问题；经 marker、固定扩展 ID 和 `development` 安装类型确认后，完全跳过 managed policy/token 读取，只使用普通隐私同意与既有本地绑定。正式 managed 包的邮箱门禁保持不变。
- [x] 不可发布的 1.7.33 unpacked 联调目录已在 Runtime 2.5.2 上完成实机验证：Chrome 重载后 Host 重新连接、控件恢复正常；未配置 managed token，未上传 CRX。

测试契约：扩展部署模式与打包边界聚焦测试、Native Host/pipe 聚焦测试、Service/Host 编译、2.5.1 WiX 版本结构和 `git diff --check`；明确排除 Worker、Console、macOS、Guardian、D1/R2、网页账本与完整跨平台测试。

## Runtime 2.5.2 Service 升级接管修复（D-100）

- [x] Service 按安装路径和 Windows session 接管升级前仍运行的 Session Agent，避免重复启动撞上单实例。
- [x] 已退出进程注册和异步退出回调 fail-safe，不得再以未处理异常终止 Service。
- [x] 2.5.2 已完成原地安装验收：Service Automatic/Running、单一 Agent、Native Host 重连、公开状态为 online、云端 heartbeat 成功且事件日志无新增崩溃。

测试契约：只运行 Service 进程生命周期聚焦测试、2.5.2 Service/Host/WiX 构建、真实本机升级 smoke 和 `git diff --check`；明确排除 Worker、Console、macOS、Guardian、D1/R2、网页账本和跨平台全量测试。

## Active Release Target
- [x] [P0 / D-098 / Deployed / 2026-09-21] 档案配置变更审计与版本冲突保护。
  - 已确认故障：T.xia 周休息上限当前为 1440 分钟；北京时间 19:58 与 20:01 出现两次单档案配置写入，现有数据库未保存操作者、来源或前后配置，无法确认覆盖入口。
  - 实施边界：新增不可变配置历史、数据库兜底触发器、家长 PUT `expectedVersion` 和 Pages 冲突刷新；不修改当前生产配置、终端同步方向、网页账、统计或配额算法。
  - 验收：旧页面不能覆盖新版本；所有实际 config 变化均有审计；审计不含敏感字段；Pages 所有 profile config 保存入口统一受保护。
  - 实施结果：migration 031 新增审计表和数据库触发器；家长 PUT、恢复、网站归类与复合规则写入均使用版本前提；Pages 冲突后强制刷新且不静默重试；新增家长可读审计 API。
  - 验证：配置并发、Pages 配置、恢复、分类及复合路由专项测试通过，TypeScript 检查通过。migration 031 已生成 27 条生产基线快照，两个触发器存在；Worker `57de22ab-13b6-43d7-a36e-e37b4fbe50e7` 与 Pages `44fae473` 已部署并回读成功。
- [x] [P0 / D-096 / Completed / 2026-09-18] 修正 `www.4399.com` 7,394 秒历史有效归属。
  - 固定范围：单一档案/设备、`2026-09-18`、旧 target rule、67 个 active pending 分段；不包含决定后产生的独立 1 秒异常分段。
  - 预期守恒：总网页时长 7,394 秒不变；Composite -7,386 秒、Study -8 秒、Rest +7,394 秒；原始 segment 不改。
  - 实施：生产 correction batch `d096_4399_20260918_7394s` 写入 67 条唯一 detail；批次头与明细均为 67 条 / 7,394 秒，目标分段未修正余量为 0。
  - 守恒：原始账仍为 67 条 / 7,394 秒；Composite 7,386 秒、Study 8 秒均只在 effective projection 中转为 Rest 7,394 秒，总网页时长不变。决定后产生的独立 1 秒异常分段仍保持未处理。
  - 生效确认：修正 revision 写入后约 82 秒，目标终端 `1.7.32` 成功读取 `/device/config`（HTTP 200）；correction 已直接下发，无独立启用开关。
  - 幂等边界：batch ID 固定且 detail 受 segment 唯一约束；选择条件排除已有 correction，当前只读核对不存在可再次写入的目标分段。未再次执行生产写脚本。
- [x] [P1 / D-097 / Deployed, configuration pending / 2026-09-18] 消息通道与未归类超时规则分层。
  - [x] 系统管理按家长账号维护邮件/Telegram 通道；Telegram 自动配对，不显示或手填 Chat ID。
  - [x] 网站管理按档案维护未归类超时通知开关和分钟阈值；默认关闭。
  - [x] 重写尚未部署的 migration 030、API、投递判定、导入导出与 Pages。
  - [x] 专项测试、150 个 unit 文件、TypeScript、扩展根目录、扩展 E2E 及联网 API 103/103 通过；桌面与手机 Playwright 截图目视通过。
  - [x] 配对行为测试覆盖账号隔离、私聊限制、过期、重放、Bot 身份轮换和伪造 Webhook；默认关闭及账号/档案边界通过。
  - [x] Plan Conformance Audit：账号通道、档案规则、自动配对、独立 outbox、导入导出及 UI 层级均 Matched；无 Deviated / Missing / Extra。未改扩展、网页账本、统计、分类或配额。
  - 生产部署：migration 030 已应用；Guardian Worker `f16ba718-248d-4430-a075-c6544897c67b`；Pages deployment `d5fb6023`。稳定域名与 deployment 域名均回读 HTTP 200，通知 API 未登录返回 401。
  - 安全回验：账号设置、档案设置、配对记录、Telegram outbox 四张新表均为 0 行；部署未自动开启或发送通知。当前未配置 `TELEGRAM_BOT_TOKEN`，需后续配置 secret 后再执行真实连接与测试消息；邮件和档案功能同样保持默认关闭。
- [x] [P1 / D-095 / Superseded before deployment / 2026-09-18] 原档案级通道与手填 Chat ID 方案未部署，已由 D-097 取代。
- [x] [P1 / D-094 / Implemented and verified, not deployed / 2026-09-18] 未归类关注度排序与 30 分钟邮件提醒。
  - 默认排序：未处理/已处理组内均按今日、本周、近 30 天累计 `active` 网页时长依次降序，同值按域名稳定排序；Pages 明示排序口径。
  - 已确认邮件漏触发根因：`evaluateDailyUnclassifiedEmailNotifications()` 被误接在媒体日统计上传路径，`POST /device/target-stats/v1` 成功写入后未调用；旧测试只检查函数名位于同一文件，未约束路由位置。
  - 修订：阈值从 900 秒改为 1800 秒；评估移到 target stats 成功路径；5 分钟 cron 补扫北京时间当日候选 profile；媒体统计不参与。
  - 开关：邮件凭据存在且未显式关闭时启用；profile allowlist 为空表示全部，非空用于灰度。邮件失败不影响统计上传。
  - 边界：不修改网页 ACTIVE、原始 segment、任何统计秒数、网站分类、历史账或配额。
  - 验证：邮件专项 42/42、未归类排序专项、usage Worker 6/6、小时 no-op 10/10、归类记录语义 33/33、TypeScript 通过；Pages 桌面/390px 手机 Playwright 1/1 及截图目视通过。
  - Plan Conformance Audit：默认排序、1800 秒阈值、target stats 正确触发、媒体路径排除、当日补扫、每日幂等及开关/白名单语义均 Matched；无 Missing / Deviated / Extra。当前仅工作区实现，尚未提交、部署或实际发信。
- [x] [P0 / D-093 / Implemented and verified / 2026-09-18] 未归类网站归为受限娱乐后自动调整本周有效归属。
  - [x] PO 单项批准：仅调整同一审核记录精确关联的本周 `active` 网页分段；原始账与总秒数不变。
  - [x] 审核决定后立即生成 correction；迟到上传和定时任务幂等补调。
  - [x] V1/V2/本地配额继续消费统一 correction projection；不处理媒体及其他目标分类。
  - [x] 专项与全量验证、Plan Conformance Audit。
  - 行为：北京时间决定所在周内，按 `targetRuleId/requestId` 精确关联 `active + pending_composite/unclassified` 分段；有效归属固定调整为 `restricted + rest mode + rest quota bucket`。原已在 Rest 桶的秒数不重复增加，Composite 桶秒数转入 Rest，总网页秒数守恒。
  - 触发：单条审核拒绝、域名直接归为受限娱乐、迟到原始分段上传及 Worker 定时任务；已有 correction 通过 segment 唯一关联跳过，重复执行不重复调账。
  - 生产预检修正：终端分段使用 `client_request_id (scr_*)`，云端审核主键使用服务器 UUID；两者属于同一审核记录的精确标识。首版仅匹配服务器 UUID，生产没有产生 correction；已在历史写入前发现，原始账和有效账均未被错误修改。实现改为同时精确匹配同记录的 `id/client_request_id`，仍禁止按域名猜测。
  - 生产部署：功能提交 `430a200`、双标识热修 `5dd583c`；Guardian Worker Version ID `ee15be42-dde0-47b9-9e7b-4006ac1f4870`，Pages deployment `60e66ea6`。稳定 Worker/Pages 均回读 HTTP 200；扩展版本、CRX 和 update feed 未变。
  - 生产改写：首轮 cron 生成 92 条唯一 correction、合计 4,803 秒；batch header 与 detail 均为 92 条 / 4,803 秒。`academic.ru` 8 秒、`www.acfun.cn` 4,795 秒及 `4399.com` 两条零秒审计事实已完成，精确关联记录剩余 0；原始分段及总秒数保持不变。
  - 后续处置：原登记的 `www.4399.com` 7,394 秒证据缺口已由 PO 通过 D-096 单次取证修正关闭；另有 1 秒 `rejected + composite bucket` 记录继续作为独立记账归属风险调查，不在 D-093/D-096 中隐式迁移。
  - 验证：全部 147 个 unit 文件通过；V2 设备单账/发布/影子账/同步/对账专项通过；TypeScript 与扩展根目录检查通过；15/15 扩展 E2E 通过；生产 API 集成在允许联网环境下 103/103 通过。`tests/run-all.js` 在受限沙箱中的 API 步骤因 `fetch failed` 返回非零，但同一 API 套件联网复跑全部通过。
  - Plan Conformance Audit：本周、精确审核关联、仅网页 active、固定 Rest 归属、迟到补调、幂等、媒体排除、原始事实及总秒数不变均 Matched；未增加 schema、未改历史原始账、网页 ACTIVE、版本、生产配置或部署。无 Deviated / Missing / Extra。
- [x] [UI / 未归类网站使用记录层级 / Implemented and verified / 2026-09-15] 第一层今日/本周/累计（近30天）时长，按三项依次降序；观察与统计证据默认折叠。
  - 检查表：规范先行、Pages 共用列表三项时长及稳定排序、分来源详情并保留操作、专项测试及桌面/手机截图均完成。
  - 使用已有 target-stats 只读查询，按 active 记录展示；不修改 Worker、存储、记账、配额或生产配置，不提交/部署。
  - 验证：`unclassified-usage-display.test.js` 验证日期范围、跨设备、排除媒体、排序、未知值、档案/跨日隔离、合并行索引及折叠；Pages 配置 227/227、未知显示 46 项和使用文案 22 个双端场景回归通过，TypeScript 通过。
  - `npx playwright test tests/e2e/unclassified-usage-display-visual.test.js --reporter=line` 1/1 通过，桌面/390px 手机收起与展开截图已核对；三项时长对齐，详情标识换行，原有归类操作及已处理折叠保留。这是 mock UI 验证，不是生产账本验收；没有运行全量回归。
  - Plan Conformance Audit：三项时长、依次降序、分来源折叠、保留操作、未知不作零及只读不改账均 Matched。累计只代表近30天，不宣称全历史；既有 Admin 手机溢出与未知页面 A/B/C 闸门均不在本项解决范围。
- [x] [UI / Admin 当前范围时长修正 / Implemented and verified / 2026-09-15] 已确认网页和媒体明细均将范围外的本周记录当作当前范围时长；已获 PO 单项批准修正。
  - 修正仅限只读 `rangeSeconds`：严格读取所选范围 Map，缺失为 0；本周/今日时长、保留行身份及原始统计均不改。
  - 检查表：先登记 → 修正网页与媒体同一显示缺陷 → 覆盖空日期/有记录日期/周范围与界面详情 → 核对无存储或配额变化。
  - 验证：`usage-explanation-display.test.js` 覆盖网页/媒体空范围、有记录日及完整周，输入统计不变；`admin-read-model.test.js` 43/43、TypeScript、diff 检查通过。`npx playwright test tests/e2e/unknown-page-display-visual.test.js --grep 'admin:' --reporter=line` 1/1 通过，使用真实只读行构建函数生成 mock 数据，网页/媒体桌面与手机截图已核对“当前范围 0、本周 30 分”。
  - Plan Conformance Audit：两处只读字段及范围回归均 Matched；原始账、日/小时/目标统计、配额算法、运行时计时和生产配置不变。既有 Admin 手机溢出仍未解决；未修改版本、提交或发布。
- [x] [UI / 使用明细文案统一 / Implemented; PASS_WITH_KNOWN_LAYOUT_LIMITATION / 2026-09-15] 云端 Pages 与本地 Admin 同步实施，只读显示，不修改历史、配额算法、版本或生产配置。
  - [x] 表头“单站点限额/用量说明”；学习/复合/待归类/受限娱乐/黑名单与借用说明统一。
  - [x] 部分借用量与所选范围明确；详情按当前范围/今日/本周拆分历史性质 × 实际桶，缺失信息显示未知。
  - [x] 分类汇总“—”、媒体独立说明、未知页“归属待核查”；不改账、不伪装实时状态。
  - [x] 专项测试及文案目视核对完成；Admin 手机既有横向溢出保持未解决，不标页面整体适配通过。
  - 验证命令：`node tests/unit/usage-explanation-display.test.js`（22 个双端场景及本地/云端展示元数据一致性）、`node tests/unit/unknown-page-display.test.js`（46 项断言）、`node tests/unit/admin-read-model.test.js`（43/43）、`node tests/unit/pages-config-v12-fields.test.js`（227/227）、`node tests/unit/managed-statistics.test.js`（30/30）均通过；`npm run typecheck`、`npm run check:extension-root`、`git diff --check` 通过。未运行全量回归。
  - 目视命令：`npx playwright test tests/e2e/unknown-page-display-visual.test.js --reporter=line`，2/2 通过；1440px 桌面/390px 手机 mock 截图已检查，分桶详情无溢出。Admin 已知整页溢出以测试 annotation 明确保留，未删除或降级原布局风险；不是生产或真实记账验收。
  - Plan Conformance Audit：文案、部分借用数量、逐范围/逐性质分桶、未知信息、媒体独立、只读不改账均 Matched；不存在本任务未批准的 Extra / Deviated。文案任务完成时 Admin 旧布局与旧范围时长问题保持 Deferred；后续范围时长问题已获单项批准修正（见上项），手机布局仍未解决。未知 A/B/C 保持未实施；未提交、推送、部署或托管。
  - 只读核对额外发现：Admin 的历史 target row 在所选范围无该对象、但本周存在用量时，旧 `rangeSeconds` 会沿用本周值；文案任务只避免借用说明/分桶元数据沿用本周。后续已独立获批将网页/媒体 `rangeSeconds` 严格限制为所选范围，不修改原始账或配额。
- [ ] [P0 / 未识别页面防错与分类兜底 / 2026-09-15] 按包独立推进，不修改历史、生产配置、版本或发布。
  - [ ] A：移除合并事件 undefined 字段；等待本项 PO 明确批准。
  - [ ] B：同 active tab/window 未知页补查，无历史回填；等待本项 PO 明确批准。
  - [ ] C：占位标识退出普通网站分类，保留实际桶；等待本项 PO 明确批准。
  - [ ] D：Pages/Admin 只读名称、实际桶与异常说明已实施；没有改动存储事实、总量、图表聚合或配额计算。未知记录不提供分类按钮，媒体明细明确不计网页配额。
    - 专项验证：未知显示 46 项断言、Admin read model 43/43、Pages 配置 227/227、managed statistics 30/30、TypeScript 和 diff 检查通过。
    - 目视验证：Pages 桌面/390px 手机与 Admin 桌面 mock 截图已核对；不是生产或原始账本验收。Admin 手机详情自身不溢出，但整页横向溢出断言连续两次失败，按执行规则停止试改，保留未通过门禁。未运行全量回归。
    - Plan Conformance Audit：名称、未知提示、历史不改、实际桶、无归类按钮均 Matched；Admin 手机整页布局 Missing，D 不标完成。A/B/C 未获单项批准，未实施；不提交、不部署。
  - [ ] 真实 unpacked Bilibili idle 与原始账本对照；完成前不关闭 P0。
- [ ] [P0 / D-081 / Production remediation and managed release completed; terminal observation pending] `cg.163.com` 系统分类漂移与本周错误账归属修复。
  - 已确认根因：`/device/config` 只返回 profile version，终端 version skip 不感知 system access version；profile 又持久化旧 effective 清单。9 月 13 日 profile 变更触发拉取时，错误系统分类重新进入终端。
  - 已确认生产影响：T.xia 2026-09-14 的 `cg.163.com` 出现 Study 分类和 Study 扣费桶正时长分段；当前系统配置虽已改回 restricted，但旧终端可能因 profile version 未变继续缓存旧清单。
  - 修复范围：组合配置 revision、Profile 自定义项单一持久权威、系统分类硬约束、expected-version 并发保护、系统配置不可变历史、repo fallback 对齐。
  - 历史修正：保留原始 segment，仅用逐段 correction ledger 修正本周有效归属；所有读模型消费同一修正层，不直接 UPDATE/DELETE 原始账。
  - 生产处置：migration 028/029、Guardian Worker 与控制台 Pages 已部署；系统配置已由 version 28 归一化保存为 version 29，`cg.163.com`、`cc.163.com` 均持久化为 restricted。T.xia 2026-09-14 的 240 条、11,853 秒 `cg.163.com` 原始分段保持不变，有效归属已全部更正为 `rest + restricted + rest quota bucket`。
  - 生产边界复验：更正 API 名义允许 100 个 segment，但批次头加 100 条明细会形成 101 条 D1 batch 语句并返回 500；D1 原子失败且未部分写入。单批上限统一为 99，生产历史更正已按 99/51/90 三批成功执行并回读。
  - 明确不变：网页 ACTIVE、起止时间、duration、checkpoint、媒体证据和本地结算语义。
  - Managed 发布：`1.7.32` 已托管到内部更新源，deployment `0a3707ac`；CRX 418,237 bytes，SHA256 `12d8e5417a34a6ec16bcf499dd55298827436adc17ba7e2e8cbf9d7cc994aa9f`，稳定扩展 ID 不变。终端升级与配置 revision 刷新继续观察，本项在终端证据完成前不关闭。
- [ ] [1.7.31 / Internal managed / Released and activated] 时间配额 V2 直接接管。
  - [x] 产品口径：D-080 已确认云端只下发账；配额由本机账加云端其他设备账即时计算，不存在云端锁。
  - [x] Worker：migration 027 记录设备 V2 capability；快照增加 active `byDomain` 与 expected/missing/incompatible/stale/incomplete 完整性。
  - [x] Extension：新增统一 `quota_read_model_v2`，排除云端本机副本，统一日/周/单站点实际扣费桶和异常回退。
  - [x] Consumers：配额路由、定时检查、Rest 软提醒、Popup 与本地 Admin 使用同一读模型；V2 停止读取 `/device/quota-state` 和持久锁。
  - [x] Pages：显示“云端已确认账”、逐设备贡献和同步完整性，不宣称包含终端未上传账。
  - [x] Verification：141 个全量 unit 文件、typecheck、扩展根目录、API 103/103、Extension E2E 15/15、Pages UI 目视验证及 Plan Conformance Audit 全部通过。
  - [x] Release：migration 027、Guardian Worker `0af8c265-d3c7-45c3-b10d-1870a0d648f9`、控制台 Pages `7d32c790` 与更新站点 `e9e4b8b4` 已完成；线上 feed 为 `1.7.31`，managed CRX 415,970 bytes，SHA256 `71cb832ba691660c3a1d833bdeb5f9f64115e9887e32b09889e9500367d41864`，稳定扩展 ID 不变。
  - [x] Profile activation：2026-09-13 已通过家长控制台将 T.xia/P.xia `timeQuota.accountingVersion` 设为 `2`，刷新与远端 D1 只读核对均确认；未改其他时间配额、网站或历史账本。
  - [ ] Production observation：当前两档案的 V2 capability、manifest、device/day/week head 和 reconciliation 均为 0；T.xia 最近可验证客户端版本仍为 1.7.29，P.xia 无近期版本日志且尚未上报 V2 capability。待主设备安装 1.7.31 后确认 V2 单账/总账/对账开始产生并观察 24 小时；异常时仅将对应 profile 切回版本 1。
- [x] [1.7.30 / Internal managed / Released] D-075 诊断修订与记账 V2 A-G 影子链路发布。
  - [x] Build&Test：专项测试、140 个全量 unit 文件、TypeScript、扩展根目录、diff 检查和完整自动化入口通过。
  - [x] Plan Conformance Audit：A-G 与 D-075 均保持确认边界；V2 未接入现有产品读取，无未批准 `Extra` / `Deviated`。
  - [x] Release：提交 `cf9f2c8` 已推送；隔离 migration 023-026 已应用；Guardian Worker `e9e53258-f4d0-4c0a-bbe3-2b7a2b25bd27`、控制台 Pages `02e3bc0d` 和更新站点 `2bd564f4` 已部署。managed CRX 为 410,948 bytes，SHA256 `46662d97661a63f9f15d9641c78ef4c215b68b5f5499f870fa67e00c3eb99c2a`；稳定 ID、feed 版本及稳定/deployment 域名线上哈希回读一致。
  - [ ] Production observation：T.xia/P.xia 实际升级；连续 7 日影子守恒已由 D-080 改为 `1.7.31` 发布后观察，不再作为内部档案启用前门禁。
- [ ] [P0 / D-076 / Read-only audit completed; repairs require itemized approval] 记账全链路一致性核查（2026-09-12）
  - 审计方式由 D-077 固定为逐段推进：S1 待上传事实形成、S2 批次构造、S3 Worker 校验与接收、S4 逐项 ACK、S5 历史补传与水位、S6 云端聚合发布；每段完成后登记结果，六段完成后统一汇总，不在中途修改代码。
  - 当前基线：本地原始账及其本地聚合暂定正确并冻结；本轮不讨论配额，不用上传缺陷反推本地记账错误。
  - S1 待上传事实形成：正常结算在同一 storage mutation 写原始分段、日/小时/target 聚合和五类 outbox；写失败前有 journal，启动及同步会重放，失败时 session 不前移。结论 `PASS`。边界风险：segment ID 不含 target/classification/quota bucket，而重复 ID 直接跳过，异语义同 ID 不会报冲突；硬阈值最终兜底会有审计地压缩并丢弃最旧未上传原始事实，这是明确降级而非正常完整账。
  - S2 批次构造：普通原始批次一次读取 outbox 与分段、每批最多 100 条，分段本身在本地不可变。结论 `PARTIAL`。按日期包会分多次读取原始、日、target 和小时数据，读取期间新增结算可形成混合版本；纯零秒日期直接跳过，零秒 pending 不会得到 ACK。
  - S3 Worker 接收：先完整校验，再以 D1 batch 写入，成功返回 `acceptedIds`。结论 `PARTIAL`。本地认可的 start=end 零秒事实被 Worker 拒绝，混合批次因此整体 400；同 ID 重传不比对事实内容，并允许覆盖 target/classification/quota bucket 等语义字段。
  - S4 ACK：结构化 ACK 只接受本批 ID，明确 rejected 和 missing ACK 均保留待上传。结论 `PARTIAL`。兼容分支仍可用 `success + count` 确认整批；原始 ACK 不含内容摘要；聚合 ACK 不绑定提交版本，旧响应可把后来新增后的当前聚合标 uploaded 并清除 dirty（已内存复现）。
  - S5 历史补传：水位后的连续日期会依次上传，失败停止推进。结论 `FAIL`。水位越过某日后，该日后来重新产生的 pending/dirty 不在主编排扫描范围；且历史完整性只比较总秒数，云端 1 个 ID与本地 2 个 ID同为100秒可通过并批量确认本地 ID（已内存复现）。
  - S6 云端聚合发布：当前并无从原始分段生成统计的统一发布器；客户端分别上传日、小时、target 和小时target，Worker逐行立即写入。结论 `FAIL`。原始账按 `profile_id + device_id + segment id` 保存；migration 012 后普通日统计以及小时/target 统计按设备唯一键保存。跨设备合账不在统一发布层完成：统计 API 返回各设备行，Pages按 target/category直接相加；`/device/quota-state` 对同 profile 全设备 `target_stats_v1` 按 quota bucket直接 `SUM`，不做跨设备同时使用去重，媒体表独立不参与网页合账。
  - S6 校验边界：`stats-integrity/v1` 仅在单设备、单日期比较原始/日/小时/target/小时target五张表的总秒数，返回行数但不校验 ID、行数、小时、domain、target、mode或quota bucket；`stats-reconciliation/v1` 又先跨设备按日期/domain/channel/mode求和，设备间相反差额可能互相抵消。两者都不形成发布门禁；target表部分存在时，页面和云端用量仍会直接使用，不能证明“云端已完整合账”。
  - S6 故障行为：客户端快照逐行立即覆盖，没有版本、构建代次、整日原子发布、缺失行删除或旧响应保护。可能出现旧快照覆盖新值、某些设备/小时/target缺失、旧行残留；这些部分或混合版本仍会被查询和相加。migration 012 之前普通日统计唯一键不含device，后续迁移只修正结构，无法凭结构恢复此前可能被覆盖的历史行；生产是否已应用012须用远端schema另行只读确认。
  - S6 待批准修订方向：云端以已接收原始分段为唯一输入，先按设备/日期构建带 raw ID摘要和版本的候选代次，同时校验小时、日、target和quota bucket，再原子发布；读取和跨设备求和只能使用完整已发布代次。异常时保留上一代有效结果并返回 `incomplete/stale`，不得把部分值包装为实时完整值；同 ID异内容隔离冲突，不改写原始账。旧客户端聚合表保留兼容但不得写入新发布读模型。
  - 汇总结论：本地记账核心暂定正确；上传链路在 S2-S6 存在相互关联的版本、确认和发布缺口。此结论证明机制不完备，不等于所有生产数据已经错误，也不能单独解释19009秒。修订前先按 D-076 将候选改动逐项提交 PO 批准，不做共享聚合或新协议的先行实现。
  - 验证：纯内存重放确认“同秒不同 ID被判完整”“无版本聚合 ACK清除新 dirty”“零秒事实被 Worker 拒绝”；`usage-segments.test.js` 256/256、`managed-statistics.test.js` 30/30、`cloud-usage-batching.test.js` 14/14通过。真实双终端同截止点对账尚未取得，不标生产 PASS。
- [ ] [P0 / D-076 / Awaiting itemized PO approval] 使用记账与本地配额全链路统一：记账线无已证实错误不改动。
  - [x] 目标设计已按 D-078 固化：原始事实、设备单账、档案总账、独立对账四层分离；正常合账使用设备单账，对账只报警且不得自动改账。
  - [x] 固定公式：档案日总账为各设备最新已发布日单账之和；周总账只汇总七个日总账；终端合并账为本机完整账（含未上传）加云端其他设备已发布账。
  - [x] 固定迁移边界：V1/V2 并行、V2 影子至少 7 个自然日、全部活跃设备兼容后，在下一个北京时间周一 00:00 按档案切换；切换前数据标记 `legacy_unverified`。
  - [x] 包 A：零秒原始事实协议统一。2026-09-12 已获 PO 单项批准并完成实现；Worker 接受 `startMs === endMs && durationSeconds === 0` 的网页诊断事实并逐项 ACK，零秒事实不生成统计。媒体校验、本地计时、本地聚合、D1 schema 与历史数据均未修改；同起止正时长、反向时段及其他非法字段继续拒绝。专项验证：`usage-segments` 256/256、`cloud-usage-batching` 14/14、Worker ingestion 146/146、TypeScript 通过。
  - [x] 包 B：网页原始事实 `id + contentHash` 逐项 ACK及冲突拒绝。2026-09-12 已获 PO 单项批准并完成实现；共享摘要排除传输元数据，Worker 独立复算请求和最终持久行，网页事实使用 `ON CONFLICT DO NOTHING`，客户端仅按匹配摘要 ACK。媒体 ACK、网页原始事实生成、本地聚合和 D1 schema 均未修改；新 Worker 保留 `acceptedIds` 供旧客户端兼容，新客户端不再以 `success + count` 确认网页事实。专项验证：摘要 5/5、Worker 路由 6/6、本地账本 260/260、上传 ACK 17/17、媒体回归 10/10、Worker 契约 147/147、小时兼容 10/10、TypeScript 与扩展根目录检查通过。
  - [x] 包 C：pending 独立扫描、revision 绑定及历史水位降级为调度索引。2026-09-12 已获 PO 单项批准并完成实现。原始 pending 始终独立于历史水位扫描；远端完整性只在上传后控制连续水位推进，不再 ACK 原始 ID 或清除聚合 dirty；日期、小时、target 与小时 target outbox 使用兼容式单调 revision，旧响应只能清除请求时捕获且仍未变化的 revision；日期包由一次冻结本地快照构建并复用同一批原始 payload。未修改网页计时、原始事实内容、使用秒数、本地聚合算法、Worker API、D1 schema 或历史数据。专项验证：本地账本 280/280、日期批次 19/19、历史补传 9/9、统计基础 104/104、Worker 完整性 6/6、媒体批次 10/10、诊断证据通过；TypeScript、扩展根目录及 diff 检查通过。
  - [x] 包 D：版本化设备日账 staging、分块接收与原子提交。2026-09-12 已获 PO 单项批准并完成实现。设备端从包 C 的冻结日期快照生成确定性设备日账；manifest 与每块最多 200 行的 chunk 经独立摘要、数量和内部守恒校验后，原子提交为不可变 shadow version。同一 revision 同摘要幂等、异摘要冲突，旧 revision 不覆盖新版本。D 只写 V2 影子设备单账及有界本地 pending 状态，不建立档案总账、不提供产品读取、不参与页面或配额；V1 上传及表保持不变。专项验证：设备端 24/24、Worker 24/24、同步隔离 8/8；全量 unit 134 个文件全部通过，TypeScript、扩展根目录及 diff 检查通过。
  - [x] 包 E：档案日/周总账及版本向量。2026-09-12 已获 PO 单项批准并完成实现。设备 revision 只在完整提交后参与候选；设备 head、档案日 head 与档案周 head 同一 D1 batch 原子切换，失败保留上一代。档案日明细每块最多 200 行；总账严格逐桶等于设备单账之和，不从原始事实重算，不做跨设备并发去重。
  - [x] 包 F：独立对账与 mismatch incident。2026-09-12 已获 PO 单项批准并完成实现。固定 `deviceId + date + revision + rawCutoff`，先验证证据完整，再独立重算并逐维比较；结果只写独立对账表和有界 incident，不修改账、ACK、outbox 或水位。
  - [x] 包 G：V2 只读下发、快照分页及影子缓存。2026-09-12 已获 PO 单项批准并完成实现。接口返回设备版本向量、档案总账和完整性；分页绑定同一不可变 snapshot，终端收齐并验证页摘要、快照摘要和逐桶守恒后才替换有界影子缓存。现有页面、配额和 V1 读取均未接入。
  - E/F/G 验证：专项测试全部通过；全量 unit 140 个文件全部通过；`npm run typecheck`、`npm run check:extension-root`、`git diff --check` 通过；`node tests/run-all.js` 在联网环境中全部通过（API 103/103、数据流 53/53、扩展 E2E 15/15）。Plan Conformance Audit：E/F/G 全部 `Matched`，无 `Deviated`、`Missing` 或未批准 `Extra`。
  - 当前 E/F/G 仍是隔离影子链路，不修改本地网页计时、原始分段生成、本地聚合、历史数据或现有产品读取；保留已有 D-075 改动，19009 秒调查继续未解决。正式产品切换仍须满足 7 日影子验证和发布门禁。
- [ ] [P0 Diagnostics / Implemented; Awaiting terminal evidence / D-075] 配额差额只读取证与日志可诊断性（2026-09-12）
  - [x] 一次性指定终端/日期请求、脱敏固定快照、分批确认、云端完整性及 ID/逐日差额报告；本地日志上传到 Worker 读取报告的脱敏校验往返通过。
  - [x] 基础诊断长期授权与详细 info 独立 TTL；旧授权兼容、期限说明、桌面/手机展示；独立 mock Chrome 已验证 30 天、保存请求和缺包提示。
  - [x] 上传首错证据、同步健康、配额拒绝关联、日志损失计数、失败接口审计独立保留；连续失败保留首错字段，诊断异常不改变请求结果，损坏聚合/读取失败显示未知。
  - [x] 22 个相关 unit 文件逐文件通过、`npm run typecheck`、`npm run check:extension-root` 通过。未运行全量 unit 或 `tests/run-all.js`，不作为发布门禁通过证据。
  - [x] 独立无登录 Chrome 的本地 mock 页面完成 1440x1000 桌面、390x844 手机目视验证：30 天选择回显、启停、保存载荷、一次性请求、缺包提示与完整报告；页面无横向溢出，宽表格仅在自身容器滚动。`PASS_WITH_MANUAL_EVIDENCE`，不是生产或 Thomas 终端验收。
  - [x] Plan Conformance Audit：取证协议、双层期限、首错/健康/拒绝证据、失败审计保留、隐私预算与独立配额算法边界均 Matched；无未批准的 Extra / Deviated。真实 19009 秒逐日逐项闭环仍为未完成的生产证据门禁，不标 PASS。
  - 现场证据补充：9/11 21:29 本地网页 outbox 尚有 694 个待确认 ID；14:15 至 19:32 本地/云端周 Rest 同增 6083 秒，19009 秒旧差额不变。尚无原始待确认分段，不能宣布真实周额度耗尽或差额查清。
  - 边界：不修每日配额算法、不改网页 ACTIVE、不重建历史、不清空终端、不写生产 profile/D1、不提交部署；真实差额验收须等终端安装后返回快照。
- `V1-minimal release candidate`（当前首次正式发布目标）
- `V0` 已冻结为 internal stabilization baseline（保留证据，不作为正式发布版本）
- `1.7.29` 内部 managed 前向发布已完成：源码提交 `5482340`、Guardian Worker `46d82099-1cb9-4240-8223-0ed8938bf21e`、更新站点 deployment `29a9fea2` 已部署并回读；CRX 为 384,156 bytes，SHA256 `ffd83c717ace5bf56edb5858926436f58b091b8324c6a8f0efc2cd8dcf21d15b`，稳定 ID 不变。范围为 D-073、D-074、本地 Admin 访问管理只读显示及相应测试；未进入 CWS、未执行 D1 migration、未修改 profile、历史账本或控制台 Pages。`cg.163.com idleStateChanged`、Thomas 终端停止请求、Pierce Mac 离线、设备升级和历史积压收敛继续保留为未解决/生产观察，不得改写为 PASS。
  - 发布门禁中发现 `admin-visual-render` 两条历史用例仍向 `event_log_v1` 造数并查询已删除的旧统计 DOM；测试将改为向当前金标准 `usage_segments_v1` / `daily_usage_stats_v1` 造数，并断言 `usage-analysis-*` read model，不修改产品计时实现。
  - `popup-stats-message-route.test.js` 的未绑定文案、激活门禁和旧统计结构断言已过期，作为独立测试债保留；本轮不修改 Popup 产品逻辑，也不把该旧套件计入 Admin 只读显示的可视化通过结论。
- `1.7.28` 内部前向止血已发布：D-071 配额锁修复和 D-072 统计/日志自愈随提交 `db9bd0b` 推送；Guardian Worker `aaa42a97-cf48-4dae-96e0-723addf1d911`、更新站点 deployment `d96be070` 已部署并回读。稳定 ID CRX 为 378,384 bytes，SHA256 `f08d69d0ea18ccc861d784d5f5b1148b3e952a2419851d2d700af09d0b988e14`。结论为 `APPROVED_WITH_KNOWN_P0_RISK / FORWARD MITIGATION RELEASE`；媒体/usage 大批量上传超时、T.xia 当日统计未收敛、`cg.163.com idleStateChanged` 与 `ALREADY_CLASSIFIED` 重试风险保持 `RISK ACCEPTED / DEFERRED`。未部署控制台 Pages，未执行 D1 migration。发布后首次观察中 T.xia 仍在线但最新版本日志为 `1.7.27`，P.xia 当前离线；两台设备均尚无 `1.7.28` 升级证据。
- `1.7.27` 运行代码提交 `3ca6093` 与风险接受记录 `bb7c75a` 已推送到 `origin/master`；Guardian Worker `f8ed2ede-ada1-47cc-acb9-687b7f8216ff`、控制台 Pages `436199ba` 与内部更新站点 `39cdad15` 已部署并通过生产回读。稳定 ID CRX 为 373,209 bytes，SHA256 `10c51a0b6001d5a7eb4eb25eed71466547d63129b6b039b709940c836417d5dd`；发布结论为 `APPROVED_WITH_KNOWN_P0_RISK / PASS_WITH_PRODUCTION_OBSERVATION`，`cg.163.com` 的 `idleStateChanged` P0 继续 Deferred / 未解决。
- `1.7.26` 已于 2026-08-27 发布到内部 managed 自托管渠道；Native App 回归通过提交 `b133abd`、Worker `fd408a49-fc2e-4e43-a6bf-64e4618d186f` 和控制台 Pages `dd73092e` 前向修复。更新站点仍为 `8a795c47`，CRX SHA256 仍为 `cc094a21dfcedb54ba609741738a4457263563b9b6c98575bb5329e001566594`；设备升级与真实媒体/流游戏对照进入观察。

## Active UI Work（2026-08-31）
- [x] [P1 Access UX / D-082] 访问管理“自主度配置”
  - 范围：Pages 新增可编辑 Tab，本地 Admin 新增同名只读 Tab；集中管理受限内容进入确认、Rest 软限额和无人响应动作。
  - 硬边界：黑名单、时间窗、每日/每周硬配额和单站点配额不可绕过；不修改网站分类、网页记账、统计、上传、V2 合账或配额计算。
  - 兼容：旧档案默认保持完整 Reminder 和 60 秒超时结束；关闭进入确认只在既有受限路由允许时直接切换 Rest 并显示短提示。
  - 验证：配置/API、Mode Service、软提醒状态机、Pages/Admin 桌面手机 UI、导入导出及全量回归；本轮不升版本、不提交、不部署、不托管。
  - 结果：Pages 可编辑与本地 Admin 只读页面均已完成；旧配置默认行为、硬限制边界、直接进入 Rest、超时继续/结束及投递失败降级均有固定回归。全量 143 个 unit 文件、项目集成/E2E、生产 Worker API 103 项及桌面/手机截图验收通过。功能提交 `c2841a3` 已推送；Guardian Worker Version ID `09c2b1c4-b4d4-4de8-8e05-d51f36cdd606`、Pages deployment `7455c3ad` 与内部更新站点 `0a3707ac` 已部署并完成稳定域名回读。`1.7.32` managed CRX 已托管，终端升级进入生产观察。
- [x] [P1 Admin UI] 本地控件完整只读镜像云端访问管理信息
  - 范围：访问管理同步摘要、每周休息上限及云端周用量状态、四类每日配额、七天计划合计、单站点配额和允许/锁定时间段。
  - 交互：只展示，不出现 disabled 编辑控件、保存、导入导出、分类审批或系统配置写入口；手机端使用纵向布局，不强制缩小桌面表格。
  - 数据：只读取本机已同步配置、当前周期云端 quota fact 和同步元数据；不修改 Worker、D1、profile、计时、配额或网站分类语义。
  - 验证：Admin 静态测试、quota config/state facts 测试及真实扩展桌面/手机 Playwright 目视验收通过；手机页面无横向溢出。
  - 后续：本项完成后再继续处理日志相关错误，不在同一补丁混入日志修复。

## Active Log Work（2026-08-31）
- [ ] [P0 Web Accounting / Investigated; Awaiting itemized PO approval] 未识别页面归属异常（2026-09-15）
  - 本轮完成生产 D1 只读调查与本地最小重放；不修改计时、统计、扣费桶、云端配置或历史账，不提交、不发布。显示修订待后续实施，不能记为已修复。
  - 当前周原始账：T.xia 9/14 为 276 秒、9/15 为 1450 秒；P.xia 9/14 为 2435 秒、9/15 为 1 秒，域名均为 `unknown-page.chrome-local`。反馈中的今日 24 分、本周 28 分对应 T.xia。
  - 主异常证据：T.xia 今日 1443 秒、昨日 245 秒及 P.xia 昨日 2427 秒始于 `idleStateChanged`；这些分段前一个同 tab 的已识别域名均为 `www.bilibili.com`。T.xia 今日其中 1440 秒的下一个同 tab 已识别域名仍为 Bilibili，另 3 秒的下一个为扩展页面；相邻域名证据不用于自动改历史账。
  - 已复现根因：`extension/core/signal.js` 的 `mergeEvent()` 为稀疏 idle 事件添加自有但值为 undefined 的 `url/domain` 字段；`extension/core/context.js` 的 `buildContext()` 据字段存在性判定新页面观察，从而将同 tab 原有域名改为未知页。生产源码最小重放：合并后的 idle 事件生成未知域名，原始稀疏 idle 事件保持 Bilibili；tab/window 不变。
  - 补查缺口：`extension/core/foreground-timing.js` 开账前与 `extension/runtime/session.js` 结算时的未知域名补查仅匹配 `__unknown__`，实际占位域名 `unknown-page.chrome-local` 不进入该分支。该缺口独立于 ACTIVE/focus/idle 规则，不授权直接改动。
  - 分类来源已确认：两档案 `customCompositeList` 与 effective `compositeList` 均含未知页占位域名；原始正时长记录的管理对象也确为该占位域名，分类为 `composite`、来源为 `parent`。不能再将主异常解释为未经证实的真实网站分类快照残留。`.chrome-local` 被访问路由忽略；显示“借用休息配额”来自复合分类与 Rest 桶组合，不证明发生真实借用决策。
  - 账层核对：上述秒数在 V1 target、V2 最新已发布设备单账及档案日总账的 domain/target、日/小时维度均相等；未发现未知页与同设备同 channel 其他正时长分段超过 1 秒的重叠。T.xia 今日未知页 Rest 桶为 1443 秒、Study 桶为 7 秒；不以未知页整体推定扣费桶错误，也不扣减全局用量。
  - 未解决：T.xia 今日 3 条、P.xia 昨日 8 条未知页 `checkpoint_estimated_close` 各为 90 秒，错误域名可能引发额外估算边界与少记风险，尚无真实浏览器依据量化；新标签短暂未知页的 URL 缺失/查询失败原因未取得逐事件日志。当前上传日志没有提供对应查询失败证据，不能据空查询认定查询均成功。
  - 验证：原有 `signal-extract-domain-v12` 5/5、`foreground-page-reliability-p0` 37/37 通过；最小内存重放复现合并器与上下文组合缺陷。原有测试直接传入稀疏 idle 事件，未覆盖实际合并后的事件形状；无真实浏览器/账本验收，不标 PASS 或关闭 P0。
  - 待单项批准补丁：首先仅在信号合并输出中移除值为 undefined 的字段，保留实际 tab/url/domain 与既有 null 合并规则，使纯 idle 状态更新不冒充页面观察；明确无 URL 的新 tab 仍走未知路径。另行展示并审批未知域名补查与 UI“未识别页面/实际记账桶”修订；不删除配置里的占位项、不猜测历史域名、不更改使用秒数或现有媒体容错资格。
- [ ] [P0 Sync/Quota / Investigating] 复合网站配额拦截与本地、云端用量不一致（2026-09-11）
  - 生产反馈：百度访问出现双配额耗尽提示；系统配置仍将 `baidu.com` 归为复合。
  - 只读证据：北京时间 19:11 左右云端快照中，今日待归类 7305 秒 / 上限 7200 秒，今日 Rest 6095 秒 / 上限 14400 秒，本周 Rest 31690 秒 / 上限 50400 秒；本周网页原始账与 target 配额桶总量逐日一致，当前复合与休息窗口均开放。
  - 日志复查（北京时间 20:51）：日志上传已恢复，今日收到 73 条，最新事件 20:49:03、上传 20:49:04，日志扩展版本为 `1.7.29`。此前授权到期造成的证据缺口已部分补齐。
  - 已确认的拦截链：19:01:10 本地本周 Rest 达到 50416 秒，超过 50400 秒上限，`weeklyRestLocked=true`、`dailyRestLocked=false`；19:01:22 和 19:02:00 请求 Rest 均被 `WEEKLY_REST_QUOTA_LOCKED` 拒绝。19:32:12 本地本周 50699 秒、云端本周 31690 秒，相差 19009 秒；本地今日 5006 秒、云端今日 6095 秒，日配额未耗尽。
  - 原始账本复查：本周云端已接收网页分段按 Rest quota bucket 重算为 31690 秒，与 target 统计逐日一致；已接收正时长分段未发现重叠、无效起止或错误起始日期。这里只证明已接收子集一致，不证明终端已经全量上传，也不能证明终端计时边界准确。
  - 上传断点：2026-09-10 云端网页原始分段最后结束于北京时间 10:55:46，当日 Rest 仅 155 秒；12:17:14 开始记录网页上传 `http_400`，到 23:47:17 同一 incident 累计 232 次。同期本地用量继续增长，下午媒体与运行日志仍上传；媒体只用于佐证终端活动，不转换成网页时长。
  - 差异时间线：9/8 23:42:18 本地/云端周 Rest 同为 13491 秒；9/10 13:18:20 为 26548 / 25595 秒；9/10 18:52:11 为 37546 / 25595 秒；9/11 19:32:12 为 50699 / 31690 秒。现有证据主要指向网页上传不完整，不能将 19009 秒差值定性为本地多记，也不能据云端余额强制解除周锁。
  - 内存重放：取截至 9/11 19:32:12 的 1534 条云端原始分段，按聚合必需字段分为 175 组后调用现有 `applySegmentToDailyStats` / `getQuotaUsageView`，逐日周 Rest 为 13491、13491、25440、25595、31690 秒；同一已接收输入不会被当前周计算函数变成 50699 秒。重放仅使用内存存储，不写设备或云端。
  - 已复现的协议缺陷：本地 `allowZeroDurationSegment` 可以生成 `startMs === endMs` 的零时长诊断分段，并将其放进普通上传载荷；Worker `validateSegment` 要求 `endMs > startMs`，任一非法项使整批返回 `SEGMENT_BATCH_REJECTED`。客户端失败后停止该日期后续批次和物化上传，保留原失败项继续重试。该缺陷可造成持续积压，但现场日志已压缩成 `http_400`，具体 rejected ID/字段未保留，尚不能把现场 400 全部归因于此。
  - 已确认的日配额口径缺陷：`getQuotaUsageView` 的日用量优先按 `targetClassificationAtTime` 分配，周用量按 `activeByQuotaBucket.rest`；同一批今日原始分段重放精确得到日 Rest 5006 秒，而真实 Rest quota bucket 为 6095 秒。复合/待归类借用 Rest 的 1087 秒及学习分类扣 Rest 的 12 秒被排出，受限分类扣 Study 的 10 秒反被纳入，净少算 1089 秒。此问题会影响日硬配额，不解释周差值，必须单独按 P0 修正并回归。
  - 提示问题：`quota_composite_and_rest` 固定显示“今日待归类时间和休息时间均已用完”，没有区分本次实际触发的周 Rest 锁，容易误导为日休息额度耗尽。
  - 本地页面口径冲突（9/11 23:05 复查）：用户反馈本地控件同样显示周配额未用完。`admin/admin.js:renderWeeklyRestSection` 的已用、剩余和状态均取 `cloud_quota_state_fact_v1`，不是本地原始账或 effective 锁状态；拦截器则由本地用量与云端事实合并执行。本地界面显示余额不构成第二份独立账本证据，但确认展示与执行使用不同来源。最新云端原始 Rest 仍为 31690 / 50400 秒；现有已核验原始账不支持“周配额已耗尽”，终端 50699 秒聚合值必须补原始分段对账，不能当作真实全量已耗尽的证明。
  - 验证：原始数据内存重放和本地零长度分段对 Worker 校验的兼容性复现已完成；现有 `managed-statistics.test.js` 30/30、`cloud-usage-batching.test.js` 14/14 通过，但不覆盖上述完整缺陷链，不作为风险消除证据。
  - 下一步：读取终端 9/9–9/10 原始分段、待上传 ID 和对应日配额桶，确定 19009 秒差值的逐项来源，并保留结构化校验拒绝原因；不重建历史、不清空账本、不强制解除本地锁、不擅自放宽配额。本轮仅审计和登记，没有修改代码、配置或 D1。
- [x] [P0 Sync/Accounting] 原始 segment 原子上传、逐项 ACK 与统计自动收敛
  - 根因：客户端单批最多 200 条，但 Worker 对每条先 `SELECT` 再 `INSERT/UPDATE`，usage 批次还写审计；一次请求可产生 401 次以上串行 D1 操作。15 秒超时后客户端无法判断远端写入进度，只能整批重传。
  - 修复口径：Worker 完整校验后使用 D1 batch 事务和 `ON CONFLICT(id) DO UPDATE`；返回 `acceptedIds` / `rejected`；客户端只 ACK 明确接受项，segment 请求单次尝试，失败交给跨同步退避。旧版 200 条批次兼容，新版使用较小批次。
  - 提交前审计补丁：媒体上传失败路径的 `retryError` 必须在函数局部显式声明，避免 ESM 严格模式下抛出 `ReferenceError` 并绕过媒体退避；静态回归锁定该声明。
  - 统计边界：当日任一 segment 批次失败或缺失 ACK 时，不上传日/小时/目标物化；历史水位只在远端完整性核对通过后推进。
  - 排除：不修改 segment 生成、网页 ACTIVE、媒体分类、配额或历史 D1 数据；`cg.163.com idleStateChanged` 按 PO 决定继续 Deferred。
  - 验证：全量 `125` 个 unit 文件、TypeScript、扩展根目录、Worker dry-run、API `103/103`、浏览器 E2E `15/15` 通过；生产历史积压是否收敛必须在后续部署和设备在线后只读观察，不计为本轮代码通过证据。
- [x] [P1 Sync/Logs] 终结网站归类 `ALREADY_CLASSIFIED` / `REQUEST_REJECTED` 永久重试
  - 根因：Worker 已返回确定分类结果，扩展仍把逐项响应计为失败并递增 retry，形成 exhausted 记录和重复 `cloud_sync_completed_with_errors`。
  - 口径：保留本地原记录与终结审计字段，退出 pending/outbox；不伪造云端申请或审批，不改变其他错误的重试规则。
  - 边界：不修改网站分类、profile、网页/媒体账本、配额或历史 D1 数据；媒体/usage 大批量上传风险继续单独处理。
  - 验证：网站归类存储语义、上传分组、cloud incident、连接韧性、retry policy 与 Admin 展示专项测试通过；旧 exhausted 确定性错误会在升级后的下一轮立即复核。
- [ ] [P0 Production Evidence] T.xia `2026-08-31 15:26` 后无任何云端请求
  - 当前判断：最后请求前 heartbeat、配置、网页账本和统计上传均成功，未发现 bootstrap、认证、解绑、`QuotaBytes` 或 settlement 错误；扩展停止产生请求后，云端日志本身无法区分 Mac/Chrome 关闭、扩展未运行、Service Worker 未被唤醒或本机守护链路异常。
  - 处置边界：本轮仓库内没有可由既有证据支持的代码修复；不得以增加云端重试或改动网页落账掩盖终端进程缺席。需要终端在线时读取本地 Guardian 心跳、Chrome policy/extension 状态和扩展本地诊断后再定根因。
  - 状态：`BLOCKED_BY_ENDPOINT_EVIDENCE`，不是“已修复”；与已明确暂缓的 `cg.163.com idleStateChanged` 分开管理。

## Active P0 Release Regression（2026-08-27）
- [x] [P0 Native App] 前向恢复管理页面与 Guardian token bridge
  - 根因：`1.7.26` 生产主线构造时把“本轮不部署新的 Native 基础设施”错误实现为排除既有 Native App 源码、Pages 资产和 Guardian bridge。
  - 影响：桌面入口消失；手机入口落入主控制台 fallback；`/native-apps/` 返回 HTTP 200 但不是 Native 页面；Guardian token bridge 源码被生产 Worker 覆盖。
  - 保留事实：独立 Native Worker、Native D1、四个 Native secrets、Guardian 私钥 secret 和 lifecycle outbox 表均仍存在，不重建、不迁移、不改 Santa 数据。
  - 修复：保留 `1.7.26` 周配额、媒体修复与移动布局，选择性恢复 Native 源码、页面、token bridge 和主线文档；只部署 `guardian-api` 与控制台 Pages。
  - 禁止：不提升扩展版本，不重新打 CRX，不部署 update host、Native Worker 或 D1 migration。
  - 完成：`master` 已恢复完整 Native 源码、规格、Pages 资产和 Guardian bridge；稳定域名与 deployment 域名均返回 Native 专有页面和资源，桌面/手机入口与周配额界面共存。
  - 生产验证：登录态 Native 页面成功读取当前 Child 的 Native Macs 和应用列表，证明 Guardian module token 与独立 Native Worker 链路有效；未创建 Mac、未修改策略或数据。

## Active P0 Runtime Fix（2026-08-27）
- [x] [P0 Timing/Media] 恢复失焦但未最小化的 Content 强媒体容错（2026-08-29）
  - 根因：`1.7.26` 为阻止弱 `tab.audible` 在失焦后长期续网页账，在公共媒体前台判定和网页补偿入口同时增加 `isWindowFocused=true`，连带删除了旧版 active tab + non-minimized 强媒体容错。
  - 已确认口径：同一已有 ACTIVE session 的新鲜 Content 强视频或明确 audible 的 Content 强音频，在 Chrome 失焦但未最小化、页面 visible、身份一致时继续网页账和前台媒体账；失焦不得凭媒体新开网页 session。
  - 安全边界：弱 `tab.audible`、陈旧事实、后台标签、最小化、隐藏、暂停、结束、锁屏和身份不匹配均不得续网页账；流游戏强证据仍为下方独立 P1。
  - 验收矩阵：Bilibili/本地视频、DOM/AudioContext 音频、弱 audible、Word 小窗、并排窗口、多显示器、完全遮挡、最小化、标签切换、暂停、idle、锁屏与连续 checkpoint，并核对原始网页/媒体账本无重叠。
  - 硬闸门：D-068 已将网页落账开始/停止/续账/idle/焦点/checkpoint 语义列为最高风险独立变更，禁止在普通 bugfix 或重构中隐式修改。
  - 边界：不修改 Worker、D1、profile、历史账本、版本号或发布状态；现有 Admin/UI 未提交工作保持原样。
  - 完成：Content 强视频/强音频在 active tab、非最小化、页面可见、90 秒内新鲜且身份匹配时可延续同一已有 ACTIVE；失焦状态不能新开网页账。实时 tab/window 查询优先于可能陈旧的事件快照，避免焦点事件竞争导致媒体误降级。弱 audible、后台标签、最小化、隐藏、暂停、结束、锁屏和陈旧证据会关闭网页账，媒体账继续独立。
  - 验证：相关 foreground/media/signal 专项全部通过；全部 unit 文件、typecheck、扩展根目录检查及联网 `node tests/run-all.js` 全部通过，API 103/103、duration-flow 53/53、E2E 15/15。隔离 Chrome 的强视频与强音频失焦场景均取得 `ACTIVE + foregroundVideo/foregroundAudio` 证据；后续两次 Windows Alt+Tab 复跑未使 Chrome API 报告失焦，属于人工焦点驱动限制，不作为产品失败。
- [x] [P0 Rest UX] 本地 Admin 显示休息软限额提醒配置（2026-08-29）
  - 目标：在扩展内置 Admin 的“访问管理 → 时间配额”只读显示提醒启用状态、今日休息软限额和超额后提醒间隔。
  - 说明：明确软限额只提醒、不锁定访问；只按 Rest quota-bucket 网页账本触发，借用 Rest 计入、媒体不计入；提醒最多延迟一个 3 分钟结算周期，显示后 60 秒未处理会结束休息。
  - 边界：本地页面不提供编辑或保存；不修改配置 schema、Worker、D1、历史账本或扩展托管状态。
  - 完成：本地 Admin 已新增只读提醒卡片；启用时显示当前软限额和重复间隔，关闭时显示“不提醒”及“启用后生效”。Admin 专项 104/104、Badge/Popup 87/87、脚本语法和桌面/窄屏目视验证通过。
- [x] [P0 Rest UX] Rest 软限额配置与可见投递修复（2026-08-29）
  - 口径：`firstReminderMinutes` 是今日休息软限额，默认 120 分钟；`repeatReminderMinutes` 是超额后提醒间隔，默认 60 分钟。两项支持 1–1440 分钟，软限额可关闭，均不改变真实 Rest 日/周配额。
  - 文案：首次明确“已达到”及设定值，后续明确“已超过”及累计超额；四项已用/剩余继续只反映真实网页账本和硬配额。
  - 投递：Content 确认可见后才暂停媒体并启动 60 秒 deadline；首次失败保留到期状态并重试一次，仍失败进入完整 Reminder，禁止静默倒计时。
  - 验收：移除按 unpacked ID 硬编码的 5/3 覆盖，由 hornburgXW profile 临时配置 5/3；完成后恢复 120/60。本轮不修改 D1 schema、历史账本、媒体统计或网站分类。
  - 完成：Worker/Profile schema、Pages 导入导出与数字配置、扩展首次/重复 payload、两阶段可见投递、10 秒恢复重试和完整 Reminder 降级均已实现；当前活动弹层不受中途配置变化影响。
  - 验证：提醒专项 59/59、全部 117 个 unit 文件、typecheck、Pages 手机/桌面视觉 E2E 1/1、扩展 E2E 15/15、远端 API 103/103 通过；hornburgXW 真实 5/3 等待验收及恢复 120/60 尚未执行。
- [x] [P0 Runtime] unpacked 验收发现特殊站点上下文辅助函数缺失（2026-08-29）
  - 现象：标签导航触发 `background.js` 未处理的 `ReferenceError: clearTabSpecialSiteContext is not defined`；`SPECIAL_SITE_CONTEXT` 消息路径同样缺失 `rememberTabSpecialSiteContext`。
  - 根因：Native/主线选择性前向恢复后保留了调用点与 `tabSpecialSiteContexts`，但遗漏历史提交 `79cd507` 中三个无状态辅助函数。
  - 修复：原样恢复 remember/get/clear 三个 helper，并增加静态回归断言；不改变特殊站点识别、模式路由、账本或云端接口。
  - 验证：Badge/Popup 87/87、站点分类 66/66、Rest 提醒 31/31、全部 117 个 unit 文件及 `background.js` 语法检查通过；待重新加载 unpacked 后继续真实验收。
- [x] [P0 Rest UX] Rest 使用页面内检查点提醒初版（2026-08-28，配置与投递口径已由 D-066 扩展）
  - 初版口径：首次阈值默认 120 分钟、重复间隔固定 60 分钟；当前口径以 D-066 的可配置软限额与可见投递门禁为准。
  - 数据：本周/今日已用和剩余均来自正式 Rest quota-bucket 网页账本；媒体不计入，账本在弹窗期间不中断。
  - UI：当前页面 `<dialog>` 软阻断，展示四项时长、滑动继续和结束按钮；初版失败投递语义已由 D-066 替代。
  - 边界：不改变 Study/Compound 打开 Restricted 的现有 Reminder，不改 D1 schema、历史账本、媒体统计或发布状态。
  - 完成：Worker/Profile schema、Pages 配置、扩展提醒状态机、页面内 modal、媒体暂停/恢复、60 秒 deadline 与 Content ready 恢复均已实现。
  - 验证：提醒专项 31/31、全部 117 个 unit 文件、typecheck 与扩展脚本语法检查通过；桌面/窄屏布局及“继续/结束”真实交互目视验证通过。未提交、未发布。
- [x] [P0 Timing/Media] Bilibili 多 frame 强媒体证据与网页 idle 补偿修复（2026-08-28）
  - 真实证据：Bilibili 顶层 frame 持续返回 `playing video + visibleMediaCount=1`，但媒体 fact 丢失可见数量后被降为 `foregroundAudio`；无 frame 定位的 checkpoint 又可能读取子 frame 的“无媒体”响应，导致静音视频没有强证据、系统 idle 后网页账少记。
  - 根因：`visibleMediaCount` 未贯通 `Content -> signal -> queryTabMediaFact -> frame aggregate`；checkpoint 未确定性枚举/聚合 frame，且快照没有显式标记为 Content 强证据。
  - 修复：保留可见媒体数量；checkpoint 按 frame ID 查询并聚合，视频证据优先于音频；标签切回后按当前 active/focus 状态重分类；窗口从最小化恢复且已聚焦时重新评估当前网页；不足 1 秒的媒体 session 不写零秒分段。
  - 当时验收：Bilibili 可见视频（含静音）稳定为 `foregroundVideo`；系统 idle 时仍由新鲜 DOM 强证据维持网页账；当时采用的“失焦立即停止网页账”已由 D-069 纠正，后台标签仍停止；无零秒媒体分段、无前后台震荡和重叠。
  - 当时边界：该任务未修改当时有效的 D-063；D-063 的失焦部分现已由 D-069 取代。Worker、D1、profile、历史账本、站点分类或发布状态仍不在本轮范围。
  - 完成：`visibleMediaCount` 已贯通事实转换；checkpoint 按明确 frame ID 聚合且视频优先；上下文重分类不再复制 Content frame；窗口最小化/恢复通过独立网页 timing 事实关闭/重开网页账；零秒媒体分段已过滤。
  - 验证：新增 Bilibili 管线测试 3/3，media timing 35/35、reclassification 13/13、signal guard 78/78；全部 116 个 unit 文件通过，typecheck 与扩展根目录检查通过，扩展 E2E 14/14。真实 unpacked Bilibili 验证覆盖正常/静音/idle/标签切换/其他 Chrome 窗口/最小化恢复，最终最小化为 `网页 IDLE + backgroundVideo`、恢复为 `网页 ACTIVE + foregroundVideo`，无零秒或重叠媒体分段。
  - 测试限制：`tests/run-all.js` 的远端 Worker API 测试因沙箱不允许向生产样式端点创建测试账号/Profile/设备而未执行；本次未修改 Worker/API，其他本地与浏览器测试均已通过。
- [x] [P0 Timing/Media] T.xia 媒体分类与网页计时隔离（实现与自动化验证完成）
  - 证据：`1.7.25` 的 Bilibili / `cg.163.com` 原始媒体账与物化统计秒数一致，但 `tab.audible` 被过度解释为前台音频，并可在窗口失焦或系统 idle 时补偿网页计时；这是终端证据语义错误，不是上传或聚合丢失。
  - 当时口径：网页账本是配额金标准；DOM 媒体为强证据，`tab.audible` 仅为弱音频证据；其中“前台媒体必须 focused window”已由 D-069 纠正为 Content 强证据的有限失焦容错。
  - 实施：切断 audible 对网页 ACTIVE 的补偿，焦点变化立即重分类开放媒体 session，Content 媒体发现覆盖 open shadow root，并补齐陈旧证据、静音视频和前后台切换测试。
  - 历史：不改写 D1；`1.7.25` 相关媒体分类标记为不可信并保留审计。
  - 边界：媒体修复不改 Worker API、D1 schema、profile 或历史数据；Product Owner 已在 2026-08-27 授权与显式周配额功能一起进入 `1.7.26` 内部 managed 发布。
  - 完成（历史）：Content 与 audible fact 分级；当时把所有前台媒体统一要求 focused window，后由 D-069 修复其强证据少记回归；焦点变化重分类全部开放媒体 session；网页补偿仅接受 90 秒内 Content 强证据；open shadow root 纳入有界发现。
  - 验证：重点媒体/foreground/signal 测试通过；全部 115 个 unit 测试文件通过；`npm run typecheck` 通过；联网 `node tests/run-all.js` 全部通过（Worker API 103/103、duration-flow 53/53、浏览器 E2E 14/14）。
  - 待观察：使用 unpacked/下一候选版本在真实 Bilibili 与 `cg.163.com` 场景核对前台视频、后台音频、窗口失焦和网页账本；该人工观察不在本轮伪装为已通过。
  - 已知风险：`cg.163.com` 等 Canvas/WebRTC 流游戏通常没有可见 DOM `video` 强证据。用户持续键盘/鼠标操作时网页账正常；若使用手柄、停留在长过场或超过 90 秒没有系统活动，`tab.audible` 只能形成媒体账，网页账可能少记。当前修复优先阻止失焦后的长时间多记，不宣称已解决流游戏低估。
- [ ] [P1 Timing/Media] 流游戏强证据模型
  - 目标：仅对明确配置的流游戏平台，组合 active tab、focused window、Canvas/WebRTC 活跃、Pointer Lock、Gamepad 和页面交互心跳，形成可审计的网页 ACTIVE 强证据。
  - 安全边界：普通 Canvas 动画、后台声音或单独 `tab.audible` 不得续账；不得采集画面、按键内容、URL 正文或游戏内容；上线前需真实 `cg.163.com` 对照验证多记与少记。
  - 2026-08-29 复验纠正：此前“失焦阶段视频事实中断”的判断缺少页面内部证据。新增探针后确认当前会话存在 DOM video + live MediaStream；失焦未最小化且停止输入时，页面可见、视频播放/可见和解码帧推进连续成立。
  - [x] 诊断子任务：已增加仅限 `cg.163.com/run.html` 的有界 `stream_game_probe_v1`，采样 video/canvas/MediaStream/frame-progress/Pointer Lock/Fullscreen/近期输入等计数或布尔值。只写 session storage，最多 60 条，不进入网页或媒体状态机，不上传云端，不改变任何落账语义。
  - 复验证据：失焦段网页账 05:29:57–05:31:38（101 秒），媒体账 `foregroundVideo` 05:29:57–05:31:51（114 秒）；最小化时切为 `backgroundVideo` 且网页停止。网页原始/日/小时/目标统计均为 2188 秒，媒体原始/日/小时统计均为 1961 秒。
  - 当前状态：cg 当前会话能提供普通 DOM 强视频证据，暂不增加流游戏专用落账模型。P1 保留用于观察其他会话或渲染阶段是否缺少 DOM 视频证据。
- [ ] **[P0 Timing / Deferred by PO] 失焦强媒体在 `idleStateChanged` 边界提前关闭网页账（根因待定位）**
  - 现场证据：网页 session 在 05:31:38 以 `endReason=idleStateChanged` 关闭；探针在 05:31:38、05:31:48 仍为页面可见 + video playing/visible/frame advancing + live MediaStream，媒体账持续至 05:31:51。
  - 未证实：当前探针没有记录 idle 信号方向、Chrome tab active、window focused/minimized 或媒体查询失败原因，因此不能断言由 Word/Codex 输入或 `idle -> active` 路径造成。
  - 风险：如果该边界确实错误关闭已有失焦强媒体网页 session，后续因失焦状态禁止新开网页账而可能持续少记，影响网页金标准和配额。
  - P0 定级：D-070 规定任何可能影响落账准确性的问题自动为 P0；本例即使当前差值较小、仅在 `cg.163.com` 复现，且网页各物化层与原始账本秒数一致，也不能降级，因为它们可能一致地继承了终端少记。
  - 处置状态（2026-08-29）：Product Owner 判断当前已观察影响较小且根因可能无法快速收敛，决定暂缓继续定位和修复。该决定只暂停工作，不关闭问题、不改写现场证据，也不降低 P0 级别；是否作为已知风险解除相关发布阻断，必须由 Product Owner 另行明确批准。
  - 发布风险接受（2026-08-29）：Product Owner 已明确批准 `1.7.27` 在该问题保持 P0 / Deferred、根因未解决且历史数据不修正的前提下进入内部 managed 自托管。该批准只解除本次内部托管阻断，不把问题改写为通过，也不适用于 Chrome Web Store 或后续版本自动豁免。
  - 定位要求：下一轮诊断必须同时记录 idle 前后值、开放 session 身份、tab active、window state、Content snapshot 聚合结果和最终 state，不得先按任一候选原因修改代码。
  - 闸门：属于 D-068 网页落账语义变更，必须单独给出前后矩阵、少记/多记风险与专项测试，经 Product Owner 确认后实施；本轮探针任务不修改计时代码。

## Active Collaboration Model
- [x] 三角色 Codex 协作基线已建立并简化为 lightweight solo-product workflow（docs-only）
  - `Product&Project Mg`：spec / plan / acceptance criteria / implementation review
  - `Build&Test`：implementation / unit and integration tests / evidence
  - `releaseMg`：acceptance / release gate / readiness recommendation
  - Mandatory role contracts：`docs/agents/ProductProjectMg.md`、`docs/agents/BuildTest.md`、`docs/agents/ReleaseMg.md`
  - Formal handoff only when scope/permission/release evidence needs durable boundaries：`docs/handoffs/HANDOFF_TEMPLATE.md`
  - Workflow entry：`PROJECT_WORKFLOW.md`
- [x] Workflow simplification adopted
  - Small routine work: no default spec / handoff / audit / release report
  - Medium work: concise spec/result/test/risk evidence
  - Release/high-risk work: checklist/readiness/blocker table only where useful
  - CWS installed-ID parity deferred until CWS review approval makes the public item installable
- [x] ChatGPT role adjusted to external advisor
  - ChatGPT：external advisor / architecture reviewer / decision support
  - Not daily scheduler, not routine bugfix guide, not every-session prompt generator
  - Escalate only for product model, architecture, storage/cloud/stats/permissions, release blocker disputes, role conflicts, suspected scope violations, or Product Owner second opinion

## Product Design Drafts（2026-08-03）
- [ ] [Spec Draft] 日历例程管理规格
  - 文档：`docs/specs/SPEC-001-CALENDAR-ROUTINE-MANAGEMENT.md`
  - 状态：Draft 已建立，等待 Product Owner 审核；获批前不进入代码、schema、API 或迁移设计。
  - 核心：固定自然时间内的常态内容策略；支持周期与一次性例程；任一时刻最多一个有效日历例程。
- [ ] [Approved / Integration in progress] 任务管理 V1
  - 产品规格：`docs/specs/SPEC-002-TASK-MANAGEMENT.md`
  - 技术设计：`docs/specs/SPEC-002-TASK-MANAGEMENT-TECHNICAL-DESIGN.md`
  - 状态：产品规则和技术结构已批准；独立 domain、Worker、Pages 与默认关闭的终端模块已分包合入，当前继续受控整合，不代表已发布。
  - 核心：一次性强制 Chrome 任务；按有效任务使用时长完成；不支持周期任务或固定截止时间；多设备按有效区间并集累计。
  - 实施闸门：先由 Product Owner 整理当前未提交改动，确认干净工作区并对齐最新 `origin/master`，再创建 `codex/task-management-v1`；任务实现不得与其他功能提交混合。
  - [x] 通用宿主 message/alarm 与本地 Admin“扩展模块”页内挂载已在独立整合分支实现并完成临时扩展副本 smoke；源码候选继续 default-off，模块缺失 smoke 通过。
  - [ ] `ACCESS_OBSERVED` 前置访问接点仍受 D-076 网页账本硬门约束；完成开段/停段/idle/repair 影响矩阵并获 Product Owner 单项批准前，不接入阻断与放行运行路径。

## Current Fix Focus（2026-07-28）
- [x] **[Pages/Mobile] 家长控制台手机端交互重排**
  - 问题：现有 `768px` 断点只把侧栏压缩为 60px，统计图、使用对象表、七天配额和时间段仍按桌面结构显示，手机端表现为桌面网页强制缩小。
  - 目标：改为顶部档案栏、五项底部导航和“更多”底部抽屉；二级 tab 横向滑动；统计列表、每日配额和时间段按单列触控结构展示。
  - 边界：只修改 Pages HTML/CSS/前端交互与对应测试；不修改 Worker API、D1、profile 配置、扩展运行时或网站分类语义。
  - 验证：静态结构测试；390px 与桌面视口 Playwright 截图；页面级横向溢出、底部导航、移动卡片和桌面回归检查。
  - 完成：手机端使用固定顶部档案栏、五项底部导航和“更多”底部抽屉；普通使用列表、七天配额和时间段转为移动卡片；24 小时图在独立区域横向查看；系统诊断表保留容器内横向滚动。
  - 证据：`pages-mobile-layout` 12/12、`pages-config-v12-fields` 214/214、全部 unit 测试通过；390×844 的统计/更多/配额/时间段及 1440×1000 桌面截图通过，页面无横向溢出。
  - 发布结果（2026-08-25）：原始实现提交 `5e4557a` 的对应功能已通过主线提交 `81ec44d` 纳入 `master`；Pages production deployment `5662e61e-b19d-4d4e-aef7-1e2356ba1c0a` 已发布，部署 URL 与稳定域名均回读 HTTP 200，并包含移动导航、配额卡片和时间段卡片标记。
- [x] **[P0 Local Health] 1.7.25 managed 本地健康心跳（扩展端完成）**
  - 扩展端通过 `com.timeonchrome.guardian` 发送不依赖网络的本地 heartbeat/probe，覆盖 Service Worker 启动、bootstrap 结果、startup/install、60 秒周期与健康探测页唤醒。
  - 仅 managed self-hosted artifact 保留 `nativeMessaging` 与 `health-probe.html` 暴露；普通/CWS artifact 必须在 staging 时移除。
  - Host 故障只写有界脱敏状态，不得影响计时、拦截、配置与云同步；外部 Host 未完成前发布门禁为 `BLOCKED_BY_NATIVE_HOST`。
  - 自动化证据：111 个 unit 文件通过；`node tests/run-all.js` 全部通过（API 103/103、integration 53/53、extension E2E 14/14）；typecheck、扩展根检查和 managed/non-managed staging 边界检查通过。
  - 本地协议验收：unpacked managed extension + 临时 Native Host 已验证真实 stdio 帧协议、启动心跳、60 秒周期心跳、probe 唤醒、Host 断开静默降级与恢复；共收到 3 条 heartbeat、2 条 probe，payload 脱敏检查通过。
  - 未关闭门禁：生产 Guardian Host 与双 Chrome Profile 人工验收仍由外部守护项目负责；生产机器安装 Host 前，本地健康能力保持 `BLOCKED_BY_NATIVE_HOST`，但失败不得阻塞既有监控、计时、拦截或云同步。
  - 发布状态：扩展代码随提交 `72a259c` 推送，稳定 ID `1.7.25` managed CRX 已部署到内部自托管更新源；生产回读 SHA256 为 `83087f98cb845d0c280a49a8ef393abd4d27e594c9fbc49d6675c163da3d81c1`。
- [x] **[P0 Storage/Timing] 1.7.25 session storage 硬门与计时隔离**
  - 生产证据：T.xia 在 2026-08-18 12:17 至 2026-08-19 00:51 出现 119 次 `Session storage quota bytes exceeded` / `timing_dispatch_failed`；P.xia 同版本未出现，说明高增长 session 诊断在长会话设备上可突破 Chrome 10 MB 配额。
  - 根因：`1.7.23` 将 info/timing/focus/mode 诊断迁入 `chrome.storage.session`，但只限制条数，没有统一字节预算；`session_v1` 镜像写入失败仍会让整个 timing dispatch reject。
  - 修复口径：4 MB 压力线、2 MB 清理目标、6 MB 应用硬门；diagnostic key 按固定顺序淘汰，`session_v1` 永远保护；local persistent session 成功后，session 镜像失败不得阻断网页或媒体落账。
  - 媒体口径：媒体与前台消费者独立容错；连续两次 checkpoint 存在媒体证据但没有 media session/segment 时记录明确缺口，不把“无媒体证据”误报为故障。
  - 边界：只改扩展本地代码、测试和技术文档；不修改 Worker、D1 schema、profile或历史账本。Product Owner 已于 2026-08-20 批准提交、推送并发布到内部自托管更新通道。
  - 验证：新增 session 预算、durable session 降级、timing trace 限幅、媒体消费者隔离和媒体账本缺口测试；2026-08-20 全量 unit 共 109 个测试文件通过。
  - 发布状态：已随 `1.7.25` 内部自托管包部署，进入 T.xia / P.xia 升级和运行观察。
- [x] [P0 Storage] T.xia 已上传副本与诊断日志分层收敛
  - 保留：已上传网页/媒体原始分段仅保留当前北京时间自然日；当日保留完整聚合，历史保留最近 7 日已上传日聚合。
  - 日志：info/timing/focus/mode trace 进入 `chrome.storage.session`；local 只保留 warning/error 小型上传缓冲。
  - 不变：7 MB 压力门、6.5 MB 清理目标、8 MB 硬门和接近硬门才匿名压缩未上传网页明细的最终兜底。
  - 边界：不修改 Worker API、D1 schema、历史云端账本、profile 配置、版本或发布状态。
  - 完成：usage/media 已上传原始段按北京时间自然日保留当日；日聚合保留 7 日、小时聚合保留当日；dirty/outbox 项保持保护。
  - 完成：info 与 timing/focus/mode trace 迁入 `chrome.storage.session`；warning/error 持久缓冲锁定 3 日、1000 条、512 KB，压力状态 128 KB。
  - 验证：完整 unit 通过；`npm run typecheck` 通过；integration 53/53、E2E 14/14、联网 API 103/103 通过。
- [x] [Cloud/Email / Implemented, not deployed] 未归类网站日累计 30 分钟邮件归类 V1（D-094 取代旧 15 分钟阈值）
  - 规则：profile 全设备按自然日和 canonical 主站 identity 汇总；1800 秒创建/复用自动未归类记录并生成每日唯一通知。
  - 安全：7 天签名 token、家长邮箱精确匹配、pending 状态、Message-ID/token 幂等；Pages 与邮件共用 decision service。
  - 交付：D1 outbox/reply audit、Resend Reply-To、Email Routing handler、5 分钟重试 cron；默认关闭，完成测试档案灰度后再启用。
  - 历史状态（2026-08-12）：源码、migration、生产 D1 表、Worker、5 分钟 cron 和 `reply@hornburg-xia.uk` Email Routing 已部署；当时 `EMAIL_CLASSIFICATION_ENABLED=false`，通知表与回复事件表均为 0 行。
  - DNS 状态（2026-08-12）：根域 `_dmarc.hornburg-xia.uk` 已添加 `v=DMARC1; p=none; pct=100`，Cloudflare `1.1.1.1` 公网回查通过；既有 Email Routing 与 Resend SPF/MX/DKIM 保持不变。
  - 灰度配置：发布开关和 profile allowlist 通过 Cloudflare secrets 管理，禁止把真实 profile ID 写入 Git；首个灰度档案采用 T.xia。
  - 灰度状态（2026-08-12）：T.xia 单档案 allowlist 与发布开关已启用；启用后通知/回复事件仍为 0，今日未归类基线为 180 秒，未发生历史补发或其他档案误发。
  - 实邮灰度发现：Email Routing 子寻址未启用时签名地址返回 550；启用后邮件到达 Worker，但 handler 对完整收件地址 lower-case 导致大小写敏感 HMAC token 校验失败。修复要求保留 token 原始大小写，并让初始通知 From/Reply-To 同为签名地址，兼容忽略 Reply-To 的邮件客户端。
  - 实邮修复验证：Cloudflare 子寻址已启用；`.invalid` 测试通知一次发送成功；Gmail 直接发送 `暂不处理` 后，回复审计为 `DECISION_APPLIED`、通知为 `consumed/return`、审核记录为 `returned`，并收到“已处理”确认邮件。修复后的新通知 From/Reply-To 均为签名地址且发送成功。
  - 当前实现（2026-09-18）：D-094 已修正 target 路由触发、30 分钟阈值和 5 分钟当日补扫；代码尚未提交或部署。部署后仍需用真实 `target_stats_v1` 达到 1800 秒复核自动触发、每日去重与实邮投递。
  - 边界：统计是触发证据，审核记录是处理事实，profile 配置是最终分类事实；不修改扩展与 Pages。
- [x] [P0 Runtime/Stats] T.xia / P.xia 2026-08-11 账本审计后续修复（实现与自动化验证完成）
  - 账本事实：两台设备网页和媒体的原始、日、小时、目标秒数均一致；不修改历史 D1 数据。
  - P0：checkpoint 发现新前台域名时不得直接用缓存 mode 开账，必须先走访问路由；已确认 `cg.163.com` 曾产生 `restricted + study` 的 360 秒错误账。
  - P1：完成待归类内容窗口修复；清除内部消息伪告警；恢复 20 条 exhausted 网站归类记录并限制重复告警；处理陈旧小时媒体 outbox；缓解 T.xia 存储压力。
  - P2：所有聚合行的 `segments_count` 使用行级真实分段数，历史聚合不在本轮自动回写。
  - 边界：不修改历史账本、D1 schema、profile 配置、版本或发布状态；代码和测试完成后再由 Product Owner 决定提交与发布。
  - 完成：checkpoint repair 强制先路由；内部消息不再误报 unknown type；exhausted 归类记录按 6 小时冷却恢复；陈旧小时媒体 outbox 先重建、无事实时清理；聚合计数改为行级。
  - 验证：全量 unit 105 个测试文件通过；`npm run typecheck` 通过；`node tests/run-all.js` 全部通过，其中 Worker API `103/103`、duration-flow `53/53`、浏览器 E2E `14/14`。
  - 发布状态（2026-08-12）：已随 `1.7.23` 提交、推送并部署到内部自托管通道；发布后连续 24 小时核对异常分段、存储压力、20 条归类记录与四层统计。
- [x] [P0 Runtime] 待归类网站借用休息配额时 Rest/Study 模式震荡修复
  - 证据：T.xia 于 2026-08-11 19:24-20:13 访问 `www.gululu.world` 时产生 49 轮 `mode_effective_boundary` Rest/Study 往返；该站当时为 `pending_composite`，当天人工归类与历史异常无关。
  - 根因：周期时间窗评估按 legacy runtime `rest` 检查 `restWindows`，而 active-tab recheck 又按待归类额度耗尽回到 Rest quota borrow，两个正确但上下文不一致的规则形成一分钟循环。
  - 目标：时间窗按活动内容性质判断；待归类借用休息配额仍受 `compositeWindows` 管理，并让单次访问决策共享同一 managed quota usage snapshot。
  - 边界：不修改历史账本、Worker API、D1 schema、profile 配置、版本或发布状态。
  - 完成：周期评估现读取 ACTIVE timing session 的分类快照；待归类/复合内容统一受 Compound 窗口约束，额度耗尽时可直接借用 Rest 配额，不再经过短暂 Study 边界；一次访问决策只读取一次 managed quota usage snapshot。
  - 验证：重点测试全部通过；全量 unit 共 103 个测试文件通过；`node tests/run-all.js` 全部通过，其中 Worker API `103/103`、duration-flow `53/53`、浏览器 E2E `14/14`。
- [x] [Pages] 时间段结束时间误限为整点修复
  - 问题：学习、复合、休息时段的开始时间允许分钟精度，但结束时间前端正则只接受整点或 `24:00`，导致 `19:00-19:01` 等合法短时段无法添加。
  - 修复口径：开始时间允许 `00:00-23:59`；结束时间允许 `00:00-23:59` 及特殊边界 `24:00`；仍要求结束时间严格晚于开始时间，`24:00` 不得作为开始时间。
  - 边界：只修正 Pages 交互校验并补回归测试；不修改 Worker API、profile 配置、运行时计时逻辑或既有云端数据。
  - 完成：学习、复合、休息入口统一按分钟数解析和比较；`19:00-19:01`、`23:59-24:00` 及非补零小时输入均可正确校验。
  - 验证：`node tests/unit/pages-config-v12-fields.test.js` 通过（213/213）；`node tests/unit/time-windows.test.js` 通过。
- [x] [Pages] 家长控制台标签页 favicon 修复
  - 目标：使用现有 TimeOnChrome 16/32px 产品图标显式声明控制台 favicon，避免 Chrome 沿用错误的历史缓存图标。
  - 边界：只修改 Pages 静态资源、head 声明和测试；不改页面布局、Worker、D1 或扩展版本。
- [x] [Pages] 系统网站分类保存成功误报失败修复
  - 目标：系统分类 PUT 响应异常时只读回查云端最终状态；若目标管理策略和内容分类已落库，则按成功处理，不再显示红色失败提示。
  - 边界：仅修正 Pages 保存结果判定与页面刷新提示；不改系统分类语义、Worker API、D1 schema 或 profile 配置。
- [x] [Extension Admin UI] 终端网站归类记录对齐云端结构
  - 目标：本地 Admin 使用“复合网站申请学习记录 / 未归类网站使用记录”两单元只读布局，未处理默认展开、已处理默认折叠。
  - 边界：仅展示本机已同步的 `site_classification_requests_v1`；不调用云端 30 天统计聚合，不增加本地审批或配置修改能力。
- [x] [Cloud UI/API] 网站归类记录唯一事实修订
  - 目标：`target_stats_v1` 只作为未归类使用证据；所有云端归类操作先创建或复用 `site_classification_requests_v1` 审核记录，再通过 decision 写入 profile 配置。
  - 边界：不改 D1 schema、不改扩展端计时/拦截/绑定/同步；访问管理次入口与网站归类记录入口使用同一操作归属。
- [x] [Cloud UI/API] 已使用未归类历史待归类落账可见性修复
  - 目标：`target_stats_v1` 中历史曾按 `pending_composite` / `unclassified` 落账、但当前配置已归类的网站仍在“已使用未归类网站”分区显示为解释项，避免统计有来源但审核入口不可见。
  - 边界：当前已归类的历史解释项不提供重新归类动作；不修改历史统计、不改运行时落账、不改 D1 schema。旧“不可生成审核记录”口径已由本轮“网站归类记录唯一事实修订”覆盖：stats-only 待处理项操作前必须 ensure 审核记录。
- [x] [Cloud Sync] 网站归类记录上传 500 与重试耗尽修复
  - 目标：`/device/site-classification-requests/v1` 批量上传中单条异常不得导致整批 HTTP 500；客户端“立即同步”必须强制重试已耗尽的网站归类记录，避免本地待审核记录永久卡住。
  - 证据：生产 `device_access_audit_v1` 显示设备 `d8ebf69d-f25f-4f84-a1c1-8fb90ba9011e` 在 2026-07-30 17:26 UTC 连续 POST 500，payload_count=3；后续同步只 GET 审核记录，不再 POST。
  - 边界：不改 D1 schema、计时、拦截或归类语义。旧“不从 `target_stats_v1` 反向生成审核记录”口径已由本轮“网站归类记录唯一事实修订”覆盖：统计发现项归类前先 ensure 审核记录。
- [x] [Pages] 网站归类记录统一入口
  - 目标：云端“网站归类记录”同页分区展示 `site_classification_requests_v1` 审核记录与 `target_stats_v1` 聚合的已使用未归类网站。
  - 边界：旧口径为只改 Pages UI；已由本轮 Cloud UI/API 修订升级为 ensure request 后再 decision。
- [x] [Pages] 网站归类记录旧自动记录兼容显示
  - 目标：云端旧记录缺少 `recordSource` 但已有首次/最近访问和顶层导航次数时，仍按“自动未归类访问记录”分组展示。
  - 边界：只改 Pages 展示判定与静态测试；不改 Worker API、同步、审批或记录结构。
- [x] [Cloud Sync] 归类申请上传触发可靠性修订
  - 目标：修复归类申请提交后依赖 cloud-sync 内存 deviceToken 才触发上传的问题；本地 unpacked 扩展 service worker 重启后也应立刻触发 syncNow，并在撞上已有同步时安排补同步。
  - 边界：不改变配置、归类申请、统计、配额上传流程；保留 2 分钟 stale lock 自动释放逻辑。
- [x] [Stats UI] 待归类借用休息配额展示口径修正
  - 目标：使用分析主图和对象列表按 `targetClassificationAtTime` 展示访问对象性质；`quotaBucketAtTime=rest` 只作为配额来源提示，避免待归类对象借用休息配额被显示为普通休息时间。
  - 边界：只改 Pages/Admin 展示 read model 与测试；不改 segment 落账、上传协议、配额扣除、拦截或时间段路由。
  - 语义澄清：时间使用性质取决于访问内容/对象，不取决于配额来源；时间段管理主要是内容使用窗口，配额可借用但不改变使用性质。
- [x] [Runtime] 主站等价域名绕过修复
  - 目标：将 bare / www / m 主站入口统一为同一 site identity，阻止通过 `www.google.com`、`m.google.com` 或同 host URL 绕过已有主站策略申请/添加为学习网站。
  - 边界：不折叠 `docs.google.com` 等独立服务子域；不迁移历史 segment；YouTube 特殊对象例外保持不变。
- [x] [Runtime] 受限父域压制历史 host 待归类记录
  - 目标：修复历史/自动生成的 `www.youtube.com` pending 记录覆盖 `youtube.com` 受限娱乐父域，导致 YouTube 根域继续落账为待归类时间的问题。
  - 边界：保留具体 YouTube 视频、播放列表、频道申请在审批前作为 pending 特殊对象；不迁移历史 segment，不改变配额扣除结构。
- [x] [Stats UI] 待归类借用休息配额命名收敛
  - 目标：将展示 notice、测试名和统计解释源从“进入休息模式 / target quota bucket”收敛为“借用休息配额 / target classification snapshot”。
  - 边界：保留 `composite_exhausted_to_rest` 等 legacy internal reason 作为兼容枚举；只修正文案、文档说明和展示层命名，不改变底层路由值或落账结构。
- [x] YouTube raw guardian_config 漏网消费者修复
  - 修复 Popup snapshot 与 runtime session managed target attribution 直接读取 raw guardian_config，导致旧 composite 残留继续显示/落账为复合时间的问题。
- [x] YouTube 根域与时间段生效问题修复
  - 发现：旧云端系统配置可能仍把 youtube.com 放在 defaultUserCompositeSites，导致根域被按复合来源加载；系统配置读取必须强制执行 YouTube 根域受限娱乐不变量。
  - 发现：PUT /profiles/:id/config 重新计算复合 effective 清单时漏合并 defaultUserCompositeSites；保存配置后可能造成 GET/PUT 口径不一致。
  - 发现：时间段已在访问观察和手动切换时检查，但定时 EVALUATE_QUOTA_STATE 只评估配额，跨过时间段边界后不会主动重检当前模式。
  - 边界：不改变 YouTube 特殊对象审批规则，不迁移历史统计，不改绑定、DeviceToken、Popup 申请逻辑或部署脚本。
- [x] 控件端用户配置网站可见性修复
  - 目标：访问管理配置文件页显式展示当前档案用户自定义网站摘要和清单，避免用户配置与系统配置混淆。
  - 边界：只改云端 Pages 展示和 profile 导出口径；不改系统网站默认 JSON、不部署、不执行 D1。
- [x] 用户自定义网站提升到系统配置
  - 目标：云端网站管理的用户自定义配置项增加“添加到系统配置”，管理员可将当前档案自定义网站提升到全局系统网站库。
  - 边界：提升后从当前 profile custom list 移除；不改本地 Admin 只读边界，不新增 Worker API。
- [x] 已使用未归类网站独立模块
  - 目标：从复合网站页移出，升级为网站管理左侧策略目录项，顺序位于“特殊网站”之后。
  - 边界：云端保持可归类；本地 Admin 只读展示；不改运行时处理、Worker API、计时、拦截或同步。
- [x] [Version] 当前源版本提升到 `1.7.16`：`extension/manifest.json`、`docs/CHANGELOG.md` 与版本断言测试同步；本轮用于发布 Popup 绑定状态修复、访问管理 UI 和 YouTube 特殊网站管理更新。
- [x] Popup 已绑定状态误报本地模式修复
  - 目标：把云端绑定状态与 activation gate 状态分开；Popup 同时参考 storage 标准绑定键和 cloud-sync 运行态；已绑定但门禁未通过时显示具体待处理原因，不再显示“本地模式”。
  - 边界：不改绑定、同步、计时、拦截或申请逻辑。
- [x] 本地访问管理只读 UI 对齐云端展示
  - 目标：本地 Admin 访问管理改为云端风格只读目录，保留网站管理、时间配额、时间段管理、网站归类记录；网站管理新增特殊网站入口并单独展示 YouTube。
  - 边界：不改云端 Pages 可编辑逻辑，不改 Worker/API/storage schema，不允许本地新增、审批或保存配置。
- [x] 云端 Pages YouTube 特殊规则列表化
  - 目标：将云端访问管理里的 YouTube 特殊网站区同步为单一规则列表，每行展示对象、类型、管理属性、来源和操作。
  - 边界：保留云端可编辑；特殊对象可在当前真实生效的学习、复合、受限娱乐之间变更，根域 youtube.com 仍固定受限娱乐。
- [x] 本地 Admin YouTube 特殊规则列表化
  - 目标：把 YouTube 特殊网站页从多块说明改为单一规则列表，每行展示对象、类型、管理属性、来源和只读状态。
  - 边界：本地 Admin 不直接编辑；Popup 仍可发起学习申请，云端家长控制台审批或调整后同步到本机。
- [x] 云端 Pages 特殊网站入口层级回正
  - 目标：`特殊网站` 是左侧管理策略目录项，不是来源筛选项；进入后只显示 YouTube 特殊对象规则列表。
  - 边界：普通学习/复合/受限娱乐/黑名单页面不再附加特殊网站摘要；普通网站不能被移动到“特殊网站”策略。
- [x] Popup YouTube 特殊申请面板 UI 重设计
  - 目标：把 YouTube 特殊申请从原生按钮/重提示块改为紧凑卡片、分段对象按钮、轻说明和确认信息条。
  - 边界：只改 Popup 申请面板 UI 和文案，不改申请提交、后台校验、特殊网站规则或 Pages 网站管理。
- [x] Popup YouTube 频道选项和颜色可读性补丁
  - 目标：加深特殊申请面板字体颜色，修复 CSS 可读性问题，并把 content script 上报的 YouTube 频道上下文纳入 Popup 对象选项；无频道上下文时不显示频道。
- [x] Popup YouTube 默认单个视频和字体补丁
  - 目标：YouTube watch 同时包含视频和播放列表时默认申请单个视频；特殊申请面板使用正常 UI 字体，降低过重字重和等宽字体带来的违和感。

## Current Fix Focus（2026-07-27）
- [x] 特殊网站管理：YouTube 根域受限、对象级学习/复合规则
  - 目标：`youtube.com` 根域进入受限娱乐；具体视频、播放列表、频道可作为特殊对象由家长批准为学习或复合。
  - 目标：Popup 对 YouTube 使用特殊申请面板；Pages 网站管理新增特殊网站入口。
  - 边界：不改变绑定、计时、同步、DeviceToken 或部署逻辑；`music.youtube.com` 本轮不变。
- [x] defaultUserCompositeSites 运行时加载一致性修订
  - 目标：修复现有 Profile 未稳定加载 `defaultUserCompositeSites`，导致部分系统复合默认站点掉成未归类的问题。
  - 目标：Worker effective config、扩展端配置归一化、分类解析、Popup/Admin 展示统一把 `defaultUserCompositeSites` 作为复合系统来源。
  - 边界：不改变未归类访问路由，不把 YouTube 改为学习，不迁移历史统计。
- [x] 网站归类动作统一校验
  - 目标：家长添加、孩子申请、家长审批和 Worker 上传统一阻止受限娱乐/黑名单父域下新增学习/复合子域或精确 URL。
  - 目标：Popup 点击“申请归为学习网站”入口时先做只读校验，失败不展开申请面板；提交按钮保留二次校验。
  - 边界：不迁移历史配置，不改变计时、拦截、同步和统计落账模型。
- [x] 访问管理统一配置导入导出
  - 目标：`访问管理 -> 配置文件` 改为单一导入/导出入口，默认包含用户配置和系统配置，可按两类范围选择。
  - 边界：新导出统一使用 bundle；旧 `profile-config` / `system-access-config` 只保留导入兼容。
- [x] 网站添加校验与重复检查修订
  - 目标：恢复“添加到当前策略”入口的非法输入提示、同策略重复检查和跨策略重复阻断。
  - 目标：添加入口只新增用户自定义配置，不再静默移动其他策略中的已有网站。
  - 边界：不改变保存 API、系统配置 API、计时、拦截、同步逻辑。
- [x] 网站管理命名、来源顺序与系统配置导入体验修订
  - 目标：统一“用户自定义配置 / 系统网站配置”文案，右侧来源顺序调整为已使用未归类、用户自定义、系统网站配置-分类管理、规则、未标注。
  - 目标：系统网站配置导入改成与用户自定义配置一致的差异确认与勾选应用体验。
  - 边界：不改变扩展计时、拦截、绑定、同步逻辑，不新增 Worker API。
- [x] 系统网站分类管理可读性修订
  - 目标：为系统默认网站库补齐 `siteCatalog`，让系统配置真正按 Qustodio 内容分类分组。
  - 目标：Worker 读取旧 D1 系统配置时补齐缺失目录元数据，避免线上继续全部显示“未标注分类”。
  - 边界：不修改 profile 自定义、审批、计时、拦截、同步逻辑；`defaultUserCompositeSites` 后续按 D-052 作为运行时系统复合配置加载。
- [x] 网站管理页内补齐系统配置“分类管理”
  - 目标：在现有“访问管理 → 网站管理”右侧目录中，把系统配置网站按 Qustodio 内容分类分组展示。
  - 目标：管理员可点击系统配置网站编辑内容分类和 TimeOnChrome 管理策略分类，保存到系统访问配置并全局生效。
  - 边界：不新增独立一级页面或 Tab；用户自定义配置与已使用未归类网站仍只写当前 profile。
- [x] 网站管理 UI 重设计为管理策略目录
  - 目标：左侧按学习/复合/受限娱乐/黑名单导航，右侧按系统配置、自定义、精确规则、已使用未归类分组管理。
  - 目标：复合网站下新增“已使用未归类网站”，来源为最近 30 天使用历史聚合，不是审批记录列表。
  - 边界：不改变扩展计时、拦截、绑定、同步逻辑。
  - 验证：Pages/Worker 契约测试、站点归类回归、typecheck、check:extension-root、git diff --check 与本地 Playwright 布局检查通过。
- [x] 访问管理配置文件与系统访问配置云端化
  - 已实现：访问管理配置文件区已改为单一导入/导出入口，默认包含用户配置和系统配置两类范围。
  - 已实现：系统访问配置从代码固定 JSON 升级为 D1 云端可管理配置；代码 JSON 仅作为初始化/fallback。
  - 已实现：系统管理分类按 Qustodio Web Filters 风格维护内容类别，再映射到 TimeOnChrome 运行分类。
  - 边界：本轮修改源码、migration、测试和文档；未执行远端 D1 migration，未部署 Worker/Pages。
  - 验证：计划内本地单元/契约测试、typecheck、git diff --check 通过；tests/run-all.js 仅线上 API 集成因 fetch failed 未通过，沙箱外单跑同样失败。
- [x] Cloud backup restore feedback/config restore hardening
  - Symptom: restore UI can report table restore completion while profile config remains unchanged or unverified.
  - Target: preflight and completion must explicitly show config file presence, site-access editable presence, config write result, and post-restore config readback status.
  - Restore path should normalize restored site lists, quota legacy fields, and time windows with the same semantics as normal profile config save.
  - Deployed: guardian-api Worker version 1e56236f-3db1-4e00-a27f-9e4b61309ece; timeonchrome-console Pages production HTML verified with restore config markers.

## V1-minimal must-have（release readiness）
- [x] release gate matrix reset（V1-minimal 口径 docs matrix created; releaseMg validation/execution pending）
- [x] V1-minimal close-out plan（docs-only board created: `docs/release/V1_MINIMAL_CLOSEOUT_PLAN_2026-05-09.md`）
- [x] working tree status inventory（历史证据见 docs/archive/）
- [x] dirty product/test working-tree ownership audit（历史证据见 docs/archive/）
- [x] Product Owner decision brief（docs-only brief created: `docs/release/V1_MINIMAL_PRODUCT_OWNER_DECISION_BRIEF_2026-05-09.md`）
- [x] Product Owner decision proposal（docs-only proposal created: `docs/release/V1_MINIMAL_PO_DECISION_PROPOSAL_2026-05-09.md`）
- [x] Build&Test worktree ownership handoff（历史证据见 docs/archive/）
- [x] Cloud Stats v1 minimal sync gate（usage_segments_v1 + stats_v1）
- [x] Chrome Web Store reduced-permission package submitted（CWS status: `待审核`; not publicly released）
- [x] manifest permissions / host permissions wording review（submission text prepared）
- [x] privacy / data collection wording review（submission text prepared）
- [x] macOS + Windows informal real Chrome smoke（PASS_WITH_MANUAL_EVIDENCE; non-formal manual evidence accepted for current lightweight first-release process）
- [x] ReleaseMg production functional smoke（unpacked/local-load）closed as `PASS_WITH_MANUAL_EVIDENCE`（installed/version/enabled, popup-core, borrowing disabled, bind-sync; CWS installed-ID parity deferred by CWS review）
- [x] package build verification
- [x] final known risks section

### V1-minimal release artifact（2026-05-09）
- [x] Release ZIP generated: `dist/v1-minimal-20260509-023832/timeonchrome-v1.7.2-v1-minimal.zip`
- [x] SHA256 recorded: `A0A5C541A5A7D047E040D2163BF8735971798112E18E1D223BB9D55D80D7190B`
- [x] ZIP extraction verified: MV3 manifest, version `1.7.2`, required runtime files present
- [x] Package excludes `docs/`, `tests/`, `workers/`, `pages/`, `node_modules/`, `.env`, `.wrangler`, local Chrome profile data, cookies/history/login data
- [x] Release record prepared：历史证据见 docs/archive/
- [x] Chrome Web Store submission text prepared：历史证据见 docs/archive/
- [x] Chrome Web Store reduced-permission package submitted: `dist/cws-resubmit-20260509-122919/timeonchrome-v1.7.2-cws-resubmit-minimal-permissions.zip`
- [x] Chrome Web Store resubmission SHA256 recorded: `BE0F712285B6661C293175C649DDDC48E0D04217B18626EB3C284EEAB32DD71C`
- [x] Chrome Web Store status recorded: `TimeOnChrome 1.7.2` submitted / `待审核`
- [x] Artifact strategy A recorded（D-039: keep submitted CWS package as active review artifact; current `origin/master` is source follow-up line; no rebuild/resubmission now）
- [x] ReleaseMg readonly readiness report recorded：历史证据见 docs/archive/
- [ ] Public release（blocked until Chrome Web Store review completes and PO approves release close-out）
- [ ] ReleaseMg production acceptance close-out（currently PARTIAL / NOT CLOSED; CWS review and CWS installed-ID parity remain unavailable until CWS approval）
- [ ] **Release blocker: sub-second segment product policy**（当前本地账本保留 1 秒内网页切换 segment，`durationSeconds=0` 但 `startMs/endMs` 完整；正式发布前必须决定并实现最终策略：保留、毫秒级 duration、短段合并或 UI/cloud 过滤）
- [x] Dirty product/test working-tree ownership classification audit completed（prior dirty packages resolved through scoped commits; no dirty product/test package remains before this docs-only sync）
- [x] Git push（completed to `origin/master`; no tag/release approval implied）
- [ ] Git tag（blocked pending separate PO approval）

## V1-minimal out of scope（本轮不做）
- [ ] full three-mode model 重构
- [ ] AI content classification
- [ ] composite routing rebuild
- [ ] 当前 time borrowing / borrow quota 实现纳入发布范围
- [ ] legacy D1 cleanup/migration
- [ ] admin UI redesign
- [ ] historical data backfill
- [ ] site classification policy expansion

> 历史备注：`statsFoundationV1SyncEnabled` 曾列为 out-of-scope；按 D-035 已调整为 V1-minimal 必选门。当前 V1-minimal release truth path 是 `usage_segments_v1` + `stats_v1`。

## V1-minimal scope close-out（time borrowing）
- [x] 当前 time borrowing / borrow quota 实现路径已禁用（runtime + UI）
  - `BORROW_REST_QUOTA` 返回受控拒绝：`{ ok: false, error: "TIME_BORROWING_DISABLED_FOR_V1_MINIMAL" }`
  - 不修改 `quotaBorrow`
  - 不修改 rest/weekly quota state
  - reminder/popup/admin 不提供借用活跃入口
- [x] 兼容性口径确认：保留历史 `quotaBorrow` / `weeklyRestQuota` 字段容忍读取，不做清理迁移
- [x] 证据测试已完成：
  - `message-router-borrow-source 4/4`
  - `reminder-borrow-confirm 5/5`
  - `borrow-concurrency 3/3`
  - `reminder-transition-v0 67/67`
  - `background-logic 86/86`
  - `storage-aggregation-convergence 36/36`

## NOW（P0）
- [x] [P0 Stats/Diagnostics] T.xia 空小时 400、页面 Cancel 伪告警与网络错误重复日志收敛：0 秒原始 segment 保留且不生成上传行；空小时在 retry exhausted 判定前从原始账本重建，仍为空则同时清理 hourly/hourly-target outbox 与 retry metadata；Worker 对旧客户端全零小时 payload 返回 `200/noOp`，非法正时长仍拒绝；`AUTO_MODE_PENDING_CANCEL` 无接收端时静默；相同云错误 30 分钟内合并为最多 8 个活跃指纹的固定 incident，恢复只记一次。专项 usage/stats/cloud/client-log/interceptor/Worker 回归、TypeScript、扩展根目录和 diff 检查通过。边界：未解决 2026-08-31 15:26 后终端无请求，未修改 profile、历史 D1、网页 ACTIVE、配额、版本或部署。
- [x] [P0 Access/Quota] Thomas 周一错误显示“今天的休息时间已用完”：根因是终端用 UTC 日期拉取配额、上一次 effective lock 被粘性 `OR` 回下一轮、Worker 仍用 legacy `stats` 重解释历史分类。已按 D-071 修复为北京时间周期、独立 local/cloud fact、当前事实重算、`target_stats_v1.quota_bucket` 跨设备汇总，并区分日/周 Rest 锁提示；旧 effective 的全部锁位均可在当前事实未超额时解除。119 个 unit 文件、TypeScript、扩展根目录和 diff 检查通过；未修改历史账本或 profile 配置。
- [x] [P0] 时间配额显式周上限：新增 `timeQuota.weekly.restMinutes`，停止每日配额乘七写入隐藏周限制；Pages 已显示每周休息上限、本周用量/剩余/来源/保存影响，并补齐每日在线总额、导入导出兼容。相关单测、TypeScript 检查、Pages 脚本语法及桌面/390px 手机目视验证通过。
- [x] [Version] 当前源版本提升到 `1.7.15`：`extension/manifest.json`、`docs/CHANGELOG.md` 与当前 managed installer expectedVersion 示例已同步；历史 1.7.13 验证材料保持历史事实。
- [x] [Regression] 修复 tests/e2e/extension.test.js 中 T-E12c：根因是 Playwright `page.bringToFront()` 与异步 `privacy-consent.html` 抢前台导致 tab activation 场景不稳定；已改为显式接受隐私门、关闭引导页、通过 Chrome tabs API 激活目标 tab，并验证 `extension.test.js` 14/14 通过。
- [x] [P0/V1] 拆分“未归类网站访问记录”与“学习网站归类申请”：同站手动升级、导航次数聚合、Worker v2 兼容字段和 Popup/Admin/Pages/Reminder 展示；96 个 unit 文件、migration SQLite 校验及三端桌面/移动端视觉验证通过，待后续执行远端 D1 migration 与部署。
- [x] [Docs-only] 概念语义修订：综合时间 -> 待归类时间，综合网站 -> 复合网站，综合模式 -> 复合模式；新增 D-046，权威文档已统一，代码字段暂不迁移。
- [x] [Docs-only] 文档分层与历史归档：旧 audit/release/handoff/smoke/plan/PRD/TODO 移入 docs/archive/
- [x] [Docs/UI] 待归类/复合用户可见语义迁移：Popup/Admin/Reminder/Pages/页面内提示与对应测试断言统一新文案；内部 composite 字段和值保持不变。
- [x] [V1-minimal 1.7.13] 同步 Pierce macOS 最终验证安装器修订
  - [x] 从 Google Drive 私有压缩包 `timeonchrome-pierce-managed-installer-1.7.13-fixed-2026-07-22.tar.gz` 同步非敏感安装资产到 `docs/deployment/pierce-macos-target/`
  - [x] 新增一体化 `timeonchrome-managed-installer.sh`、`install.command`、`uninstall.command` 和 `private-config.example.plist`，并同步 keeper / LaunchDaemon 模板
  - [x] 记录目标 Mac 验证修复：目标用户环境 + profile-directory 启动、30 秒 controlled keeper restore、Chrome Managed Extension Settings 三轮稳定性检查、repair/reinstall 与 MDM 单文件删除模拟
  - [x] 真实 `private-config.plist` / `managedDeviceToken` 不进入 Git；`.gitignore` 已补保护
  - [x] 独立模块已拆出到 `tools/managed-chrome-extension-installer/`，包含通用安装器、模板、TimeOnChrome 示例和打包脚本
- [x] [V1-minimal 1.7.12] 修复 managed storage schema、更新链路及受管绑定显示元数据
  - [x] manifest 声明并打包 `managed-storage-schema.json`，字段与 activation gate / macOS / Windows 模板一致
  - [x] install/update lifecycle 在 managed Profile 匹配时立即采用 Token、hydrate `/device/config` 并完整同步，不打开手动绑定页
  - [x] 自动测试、完整回归、CRX schema 入包与签名 ID 门通过；逐文件 unit、API 103/103、duration flow 53/53、E2E 14/14 全绿
  - [x] 使用真实 Chrome 验证自动升级、`managed_policy` 激活和无人工操作绑定
  - [x] 原 PEM 已找回，派生 ID 精确匹配 `jdcancbiocacabbjdkngadmjpjmkdnih`；1.7.10 CRX 已构建并记录 SHA256，密钥仍被 Git ignore
  - [x] Wrangler OAuth 与 `timeonchrome-update` Pages 项目已确认
  - [x] Cloudflare Pages 生产源已部署 1.7.10；规范 `update.xml`、CRX、`SHA256SUMS.txt` 回读一致，CRX SHA256 为 `1496f68f6d73340ef6c654c114f3796e0cc956d6138c4d08adfb4d7b2f0f15f2`
  - [x] managed 专项证据：schema 36/36、activation behavior 6/6、activation gate 18/18、managed channel 14/14、plist/shell lint 与 self-hosted staging dry-run 通过
  - [x] 经 Product Owner 授权，过时 test harness / 静态断言已适配当前依赖和激活门；未为通过测试修改对应产品逻辑
  - [x] Product Owner 已授权仅修复过时测试 harness / 静态断言，不改变对应产品逻辑
  - [x] **P0 缺陷已修复：受管自托管扩展未自动更新。** 旧策略下真实 Chrome 正常重启、重新打开 Default Profile 并手动触发更新后仍停留在 1.7.9；加入 `override_update_url: true` 并发布新路径的 1.7.11 后，仅正常重启 Chrome 即自动升级成功。
  - [x] 自动更新根因确认：`ExtensionSettings.update_url` 默认用于首次安装，后续更新使用扩展 manifest 的 `update_url`；1.7.9 manifest 未声明该字段，且策略未设置 `override_update_url: true`，导致后续更新没有可用来源。
  - [x] 自动更新修复验收：1.7.11 manifest 声明自托管 `update_url`，macOS/Windows 策略设置 `override_update_url: true`，并使用新的 CRX 文件路径规避同版本 CDN 缓存；已证明无需开发者模式或人工点击“更新”即可从 1.7.9 升级到 1.7.11。
  - [x] 1.7.11 生产包回读：线上 `update.xml` 指向新 CRX 路径，包内 version/update_url/managed schema 正确，线上与本地 SHA256 均为 `cfdc7385fae90e61866dad5277cca7af212b6bf88df89709b2ea05a05ead9f7c`。
  - [x] **P0 缺陷已修复：macOS MCX 策略存在但未对当前电脑生效。** 修复前显式查询 `/Computers/local_computer` 可读取六个受管字段，但自动查询当前电脑返回 `no data found`，导致 `chrome.storage.managed` 为空并回退本地模式。
  - [x] MCX 根因确认：本地计算机记录只有 `ENetAddress`，当前电脑无法被 ManagedClient 自动匹配；显式指定记录可正常合成策略。部署脚本必须写入 `IOPlatformUUID` 对应的 `HardwareUUID`，且不得吞掉 `mcxrefresh`/有效策略查询失败。
  - [x] MCX 修复验收：补齐 HardwareUUID 后，`mcxquery -user william_xia_cn` 已无需显式 `-computer` 返回 TimeOnChrome 域及 managed/token/profile 字段；真实 Chrome 已确认 Token 自动采用、设备已绑定、恢复正常且云同步健康。
  - [x] **P0 显示缺陷：受管 Token 绑定后账户/用户为空。** `/device/config` 与扩展持久化已修复并发布 1.7.12；生产接口只读验证账户邮箱、Profile 名称、Profile ID、Device ID 均存在，相关测试 114/114 通过。生产 `update.xml` 与 CRX 回读一致，SHA256 为 `025661e70d93a16ed9c72cc7ed310c3e4033ab33da2a84e0e39bc75862fa4084`；真实 Chrome 管理中心已显示账户 `william.xia.cn@gmail.com` 与用户 `william.xia`，连续失败为 0。
  - [ ] Chrome UI 自动化限制：真实 Chrome 控制已连接，但安全策略禁止自动访问 `chrome://policy` / `chrome://extensions`；人工触发更新只能用于继续 Token 绑定诊断，不能作为自动更新缺陷的关闭证据。
- [x] [V1-minimal] Docs-only close-out plan created（`docs/release/V1_MINIMAL_CLOSEOUT_PLAN_2026-05-09.md`）
- [x] [V1-minimal] Working tree status inventory recorded（历史证据见 docs/archive/）
- [x] [V1-minimal] Build&Test dirty product/test ownership audit recorded（历史证据见 docs/archive/）
- [x] [V1-minimal] Product Owner decision brief created（`docs/release/V1_MINIMAL_PRODUCT_OWNER_DECISION_BRIEF_2026-05-09.md`）
- [x] [V1-minimal] Product Owner decision proposal created（`docs/release/V1_MINIMAL_PO_DECISION_PROPOSAL_2026-05-09.md`）
- [x] [V1-minimal] Product Owner approved default decision proposal（`docs/release/V1_MINIMAL_PO_DECISION_PROPOSAL_2026-05-09.md`）
- [x] [V1-minimal] Build&Test CWS least-permission report handoff created（历史证据见 docs/archive/）
- [x] [V1-minimal] Build&Test worktree ownership handoff created（历史证据见 docs/archive/）
- [x] [V1-minimal] releaseMg readonly readiness report recorded（历史证据见 docs/archive/）
- [x] [V1-minimal] production functional smoke closed with Product Owner manual visual evidence（unpacked/local-load instance）
- [x] [V1-minimal] Windows/macOS informal smoke completed（PASS_WITH_MANUAL_EVIDENCE; not automated lab evidence）
- [x] [V1-minimal] Product Owner decisions on prior worktree audit findings resolved except Pages stats-v1 later package
- [x] [V1-minimal] admin/bind ownership resolution recorded（历史证据见 docs/archive/）
- [x] [V1-minimal] Build&Test admin/bind account-token implementation review recorded（历史证据见 docs/archive/）
- [x] [V1-minimal] Build&Test admin/bind account-token minimum verification recorded（历史证据见 docs/archive/）
- [x] [V1-minimal] Product Owner authorized admin/bind small unit test package（no product code edits, no rebuild, no commit/release）
- [x] [V1-minimal] Build&Test admin/bind test package handoff created（历史证据见 docs/archive/）
- [x] [V1-minimal] Build&Test admin/bind test package report recorded（历史证据见 docs/archive/）
- [x] [V1-minimal] Product Owner approved admin/bind package inclusion as V1-minimal follow-up candidate（`DECISIONS.md:D-038`; not release-ready, no rebuild/commit/release authorization）
- [ ] [V1-minimal follow-up] Track admin auto-login stale-token semantics separately（non-blocking for admin/bind include）
- [ ] [V1-minimal] Product Owner approval/revision of `docs/release/V1_MINIMAL_PO_DECISION_PROPOSAL_2026-05-09.md`
- [x] [V1-minimal] Build&Test CWS least-permission implementation report recorded（历史证据见 docs/archive/）
- [x] [V1-minimal] Product Owner decision on CWS least-permission minimal verification plan（authorized）
- [x] [V1-minimal] Product Owner authorized CWS least-permission minimal verification only（no fixes/rebuild/commit/release）
- [x] [V1-minimal] Build&Test CWS least-permission minimal verification handoff created（历史证据见 docs/archive/）
- [x] [V1-minimal] Build&Test CWS least-permission minimal verification report recorded（历史证据见 docs/archive/）
- [x] [V1-minimal] Git/local consistency audit recorded（历史证据见 docs/archive/）
- [x] [V1-minimal] Completed local commits recorded（`9174900` docs package; `7072163` CWS least-permission package; `f498d13` admin/bind account-token package）
- [x] [V1-minimal] Remote consistency check completed（after push, local `master` and `origin/master` synchronized at `2260943`; no tag/release）
- [x] [V1-minimal] Pages stats-v1 ownership review recorded（历史证据见 docs/archive/）
- [x] [V1-minimal follow-up] Pages stats-v1 minimum verification recorded（历史证据见 docs/archive/）
- [x] [V1-minimal follow-up] Pages stats-v1 package committed and pushed as source follow-up line（no Pages deploy authorized）
- [x] [V1-minimal] Git push completed to `origin/master`（tag/release still blocked）
- [x] [V1-minimal] Product Owner artifact strategy A recorded（submitted CWS package remains active review artifact; current `origin/master` is source follow-up line）
- [x] [V1-minimal] `docs/CHANGELOG.md` grouping reviewed（include in release evidence commit set; not a release-ready claim）
- [x] [V0] V0 RC package validation
- [x] [V0] RC internal install validation (Chrome unpacked)
- [x] [V0] Pages deployment readiness
- [x] [V0] Worker/API readiness
- [x] [V0] Stage 1 Soft Gate verification
- [x] [V0] Phase 2 chrome-restart Gate runner + binding preflight + bound-device validation
- [x] [V0] System Recovery Release Gates final confirmation recorded（source: Product Owner confirmed）
- [x] [V0] release notes draft/finalize
- [x] [V0] known issues finalize
- [x] [V0] RC package generation（`dist/rc/timeonchrome-v0-rc.zip`, SHA256 `B9DE59B...389`）
- [x] [V0] local RC install smoke
- [x] [V0] Product Owner final approval（RB-9）— **APPROVED for Google review / handoff（2026-05-04）**

## System Recovery Release Gates（final record; source: Product Owner confirmed）

| Gate ID | Status | Evidence summary | Confirmation source | Remaining action |
|------|------|------|------|------|
| RG-1 | PASS | `chrome-restart` formal bound-device Gate 已通过 | Product Owner confirmed | 无 |
| RG-2 | PASS | bound profile 可用；`--allowWorkstationLock` 触发真实 Windows lock；手动 unlock 后恢复验证通过 | Product Owner confirmed | 无 |
| RG-3 | PASS | 最后执行；本机为 S0 Modern Standby，S3 unavailable；真实 OS sleep/wake 后恢复验证通过 | Product Owner confirmed | 无 |
| RG-4 | PASS | bound profile 可用；`--manualNetworkToggle` 人工断网/联网观察到真实 offline/online；恢复后 event-log/session/trace 可读 | Product Owner confirmed | 无 |

## NEXT（P1）
- [x] **[P0/V1] Stats Storage Foundation — Phase 1**: Terminal settlement：`usage_segments_v1` + `daily_usage_stats_v1` ✅ 已完成（1B-R）
- [x] **[P0/V1] Stats Storage Foundation — Phase 2**: Read path ✅ 已完成（1C）
- [x] **[P0/V1] Stats Storage Foundation — Phase 3**: Segment + stats cloud upload ✅ 已完成（3C-R + 3E）
- [x] **[P0/V1] Stats Storage Foundation — Phase 4**: Cloud endpoints + audit logs ✅ 已完成（3C + 3C-R）
- [x] **[P0/V1] Stats Storage Foundation — Phase 5**: Cloud validation + roundtrip ✅ 已完成（3F + 3F-R + 3F-S）
- [x] **[P0/V1] Stats Storage Foundation — Phase 3 Cloud 实施计划** ✅ 已完成（3A）
- [x] **[P0/V1] Stats Storage Foundation — D1 迁移** ✅ 已完成（3B, 已部署到 remote guardian-db）
- [x] **[P0/V1] Stats Storage Foundation — 旧版 stats 安全补丁** ✅ 已完成（3D-1）
- [x] **[P0/V1] Stats Storage Foundation — 实时云验证** ✅ 已完成（3F-R, 3F-S）
- [ ] **[P0/V1] Stats Storage Foundation — 受控上线（等待 PO 批准）**
  - 当前状态：所有 Phase 1-5 代码和云基础设施已就绪并已验证
  - v1 同步默认禁用；生产环境中未调用 `setStatsFoundationV1SyncEnabled(true)`
  - 上线前需单独 PO 批准（见 `docs/STATS_STORAGE_FOUNDATION.md` §C.9）
- [ ] **[P0] T.xia 统计异常只读审计与后续止血**
  - 审计对象：`T.xia` 活跃设备 `Thomas MacBook Chrome`，`device_id=699d81ac-f293-45d8-9698-d7d261647d35`。
  - 只读结论：2026-08-04 至 2026-08-05 该设备出现大量 `Resource::kQuotaBytes quota exceeded`，并伴随 `timing_dispatch_failed`、`settlement_failed`、`checkpoint_health_write_failed`、`cloud_sync_failed`。
  - 网页账本口径：真实网页使用优先以 `usage_segments_v1` 为准；`stats_v1` 日统计 2026-08-03/04 与网页账本一致，2026-08-05 少 90 秒；小时/target 物化统计存在缺口。
  - 媒体账本口径：2026-08-04 至 2026-08-05 的 `cg.163.com` 媒体统计不可信；2026-08-05 存在 `foregroundVideo/study/mode_effective_boundary` 47116 秒异常段，但无对应网页账本使用。
  - 1.7.21 发布后复核：T.xia 网页原始账本与日/小时/target 统计在 2026-08-06 已重新一致，`QuotaBytes` / `settlement_failed` / `timing_dispatch_failed` 未再出现；但本地仍约 9.7 MB，并有 1029 条同日分段被日期同步整批重试。
  - 新根因：日期同步绕过 200 条批次上限；失败路径把同一长 503 HTML 错误复制到每个 `lastErrors[id]`，形成 segment 数量乘错误正文长度的存储放大。升级还保留 `media_sessions_v2`，导致旧 Bilibili session 被模式边界结算为 31701 秒。
  - 本轮边界：已登记风险；不修改代码、不修改扩展本地数据、不写 D1、不重建历史统计、不删除或裁剪异常媒体段。
  - 后续处理：单独规划扩展本地存储配额止血、V1 outbox/client logs/media ledger 清理、媒体 open session 关闭，以及必要时的历史统计只读对账和人工确认修正。
- [ ] **[P0] 扩展本地 V1 存储配额止血修复**
  - 目标：防止 `chrome.storage.local` 爆满继续导致 settlement、checkpoint、cloud sync 和媒体 session 关闭失败。
  - 当前实施版本：`1.7.23`（在 `1.7.22` 基础上补充自然日保留、session 日志分流及压力诊断冷却）。
  - 范围：只改扩展本地代码、技术文档和测试；不写 D1、不修正历史统计；已获 Product Owner 授权部署内部版本。
  - 修复口径：日期同步统一最多 200 条顺序分批；错误元数据改为短错误码；升级时无损压缩旧 outbox；7 MB 进入压力维护并以 6.5 MB 为目标，8 MB 为写入前硬门，预留至少 64 KB。

  - 紧急淘汰：日志最多保留 3 天并按 `error > warning > info`、最近 1 天优先排序；先清诊断和已上传副本，仍无法满足硬门时先淘汰未上传媒体，最后才淘汰最旧未上传网页原始分段，并保留聚合、修正 index/outbox、写入紧凑损失审计。
  - 媒体 lifecycle：更新/启动时恢复并清空陈旧 `media_sessions_v2`；陈旧 session 最多补记最后证据后 90 秒，禁止被后续模式边界拉成长段。
  - journal-first 加固：网页结算失败不得推进 session；新增 48 KB journal、完整 RMW 协调、启动重放与 compacted total facts，媒体/同步/日志不得抢占网页落账。
  - `1.7.23` 已提交并推送到 `origin/master`，已部署到 T.xia / P.xia 内部自托管更新通道；生产 feed/CRX 回读一致，SHA256 为 `70a79b4dc966d3ae3dae6f7fc4c3f3241f5ea7cd40e4aa7014c87273f98a0800`。生产设备 24 小时观察作为发布后验收，因此 P0 任务保持未关闭。
  - 2026-08-17 新增根因：Service Worker bootstrap 无条件重建五个同名 `chrome.alarms`，会取消并替换既有 alarm、推迟下一次触发，可能造成 `periodicCheckpoint` 与 `cloudSync` 间歇性饥饿。修复口径为只补建缺失或周期错误的 alarm，并保留周期正确 alarm 的 `scheduledTime`。
  - 诊断状态：T.xia 的日志策略已于北京时间 2026-08-17 02:40 刷新，但终端在此后尚未上线拉取策略；alarm 修复可由代码确定，剩余前台状态问题必须在终端上线后依据新日志复核。
  - 本地修复：bootstrap 现等待 alarm 存在性检查，只补建缺失项或修正周期错误项；失败后允许下一次 Service Worker 唤醒重试。Pages 日志摘要同步识别 TTL 已过期状态，不再把过期策略显示为“已开启”。
  - 本地验证：alarm 保留/补建行为、bootstrap、checkpoint、monitoring、client logs、Pages/time-window 和前台 P0 相关单测均通过；`node --check extension/background.js` 通过。Pages 状态文案的浏览器目视验证因本地合成页 URL 被浏览器安全策略阻止，未绕过、未提交。
  - 2026-08-18 日志复核：前台 checkpoint 已正常运行；11:32-12:14 的 `foreground_checkpoint_no_session_repair_skipped` 均为 `window_unfocused`。持续故障收敛为 `2026-08-14` 日媒体统计达到 3 次重试后仍被每轮同步重复计为失败，共制造 336 次 `cloud_sync_completed_with_errors`。
  - 日媒体同步修复口径：补齐 `lastAttemptAt`、6 小时 exhausted 自动恢复冷却和孤立/空聚合 outbox 对账；冷却期间保留 dirty 数据但不计失败、不重复写告警，冷却到期或手动立即同步可重试，成功后清除 retry metadata。只修复后续同步，不修改云端历史媒体统计。
  - 发布状态（2026-08-18）：日媒体 outbox 统一重试策略、存储维护元数据清理与动态回归已随 `1.7.24` 提交、推送并发布到内部自托管更新通道；后续以生产设备日志确认 exhausted 告警冷却和存储压力收敛。
  - 验收：任意受控写入后不超过 8 MB；压力维护降到 6.5 MB；连续 24 小时无 quota/settlement/timing dispatch 错误；1029 条积压分批清零；单批不超过 200；网页四层统计一致；无陈旧媒体长段。
  - 文档：`docs/DESIGN.md` §3.5.1；历史审计背景见 `docs/STATS_STORAGE_FOUNDATION.md` §C.15。
- [x] **[P1 Release] 1.7.24 内部受管发布**
  - 问题：`1.7.23` 自托管打包脚本复制整个 `extension/`，导致 managed CRX 仍物理包含 `privacy-consent.html`、`privacy-consent.js` 和 `privacy.html`。
  - 当前影响：`deployment-profile.json` 的 managed activation 路径会绕过用户隐私同意流程，正常安装、更新不会主动展示这些页面；但包内容与内部受管发行的最小化预期不一致，手工扩展 URL 仍可能访问页面。
  - `1.7.24` 范围：发布 alarm 保留、日媒体 exhausted 恢复、Pages 分钟级时段校验和日志 TTL 展示修复；managed 自托管 staging 排除上述页面，保留公开/CWS 源码及 `core/privacy-consent.js` activation 依赖。
  - 发布授权：Product Owner 已于 2026-08-18 明确批准升级版本、提交、推送、部署 Pages 并发布 T.xia / P.xia 内部自托管更新源；不包含 Chrome Web Store 上传/提交，不写 D1、不修改 profile。
  - 边界：不原地覆盖 `1.7.23` CRX；使用稳定签名 ID 生成新的 `1.7.24` CRX、update feed 和 SHA256 审计材料。
  - 发布前验证（2026-08-18）：逐文件 unit 共 107 个测试文件通过；`node tests/run-all.js` 全部通过，其中 Worker API `103/103`、duration-flow `53/53`、浏览器 E2E `14/14`；`npm run typecheck`、扩展根目录检查、managed staging dry-run 和 Pages 桌面/移动端目视验证均通过。
  - 发布结果（2026-08-18）：提交 `584b839` 已推送到 `origin/master`；控制台 Pages deployment `d29dc5f0`、内部更新源 deployment `d736ba71` 已部署并完成生产回读。稳定扩展 ID 为 `jdcancbiocacabbjdkngadmjpjmkdnih`，CRX 350,504 bytes，SHA256 为 `da88f02dceb3e6234ea21a9c3a8d39ffa4fff0f105abe3617912e8904e5f5fe4`。
  - 包边界：线上 CRX manifest 为 `1.7.24`；不含 `privacy-consent.html`、`privacy-consent.js`、`privacy.html`，保留 `core/privacy-consent.js`；未发现仓库、测试或凭据类文件。
  - 发布边界：本轮未部署 `guardian-api`，未写 D1/profile，未上传或提交 Chrome Web Store；设备实际升级和连续 24 小时稳定性属于发布后观察。
- [ ] [V1] composite routing 设计与拆包
- [ ] [V1] 更精细分类能力设计（V0 之外）
- [ ] [P1] 系统配置全局影响治理
  - 背景：系统配置网站库、默认清单和 `siteCatalog` 修改后会全局生效，影响所有孩子档案的 effective 清单；这已记录在 `docs/SITE_ACCESS_POLICY.md` 和 D-050。
  - 后续处理：重新审查系统配置导入、页面内系统分类编辑、用户自定义提升到系统配置的权限、确认文案、preflight、审计记录和回滚/恢复策略。
  - 边界：普通 profile 用户配置导入/恢复不得修改系统配置；后续方案需要单独确认后再实施。
- [ ] [P1] 访问管理配置导入冲突与冗余预检补强
  - 问题：当前导入配置文件时没有显式检查用户配置与系统配置之间的跨策略冲突，也没有提示同策略冗余项。
  - 已发现样例：`timeonchrome-access-management-config-v1-2026-07-28 (2).json` 中 `kognity.com`、`physicsclassroom.com`、`logic.ly` 同时存在于系统学习和用户学习；不构成硬冲突，但导入前应提示可清理。
  - 后续处理：导入预检/差异确认需要覆盖系统内部、用户内部、用户 vs 系统跨策略冲突；同策略重复作为 warning 展示，并建议从用户配置移除。
- [x] **[P1] Child-facing entry points expose mixed admin page — Stage 1 (Soft Gate) 已完成**：
  - 已实施：孩子端入口（popup 设置按钮、未绑定横幅、reminder 查看详情）现已通过 `?view=stats` 参数以只读模式打开 `admin/admin.html`
  - 已实施：admin.js 入口逻辑添加 `isChildView` 分支，跳过登录/注册/绑定流程，隐藏退出登录、重新绑定等家长控件
  - 待 PO 决策（不影响 V0）：
    - 孩子是否应访问详细使用分析统计？（当前已通过 Soft Gate 允许）
    - 未绑定设备时，孩子应看到什么操作入口？（当前显示简化提示"请联系家长完成设备绑定"）
  - Stage 2（V1 规划）：新建独立 `terminal/usage.html` 孩子只读页，彻底拆分 admin.html 的家长 setup 职责 → 见 P2 项
- [ ] **[P0] Chrome Web Store review follow-up / public release close-out** — reduced-permission package submitted; CWS status `待审核`; public release remains blocked until CWS review state is known and Product Owner approves release close-out

## LATER（P2）
- [ ] [V1] macOS smoke checklist 后续如需重启，先基于当前 release gate 重新制定；历史 V0 smoke 证据见 docs/archive/
  - 状态：Product Owner accepted V0 release risk（deferred, not passed）
  - 口径：该项从 V0 active blocker 移至 V1 follow-up
- [ ] **[P2/V1] macOS managed installer MDM plist deletion recovery verification**
  - 验证目标：MDM 只删除 active Chrome managed preferences plist 时，LaunchDaemon keeper 是否能通过 `WatchPaths` 或 `StartInterval=60` 自动恢复。
  - 场景 A：删除 `/Library/Managed Preferences/com.google.Chrome.plist` 与 `/Library/Managed Preferences/com.google.Chrome.extensions.<extensionId>.plist`，等待 keeper 自动恢复，并检查 owner、permission、`plutil` 与 source/active `cmp`。
  - 场景 B：删除 `/usr/local/timeonchrome-policy/`、restore script 或 LaunchDaemon 后，确认 keeper 不会误报已恢复，需重新运行 `install`。
  - 验收口径：active plist 单独丢失可自动恢复；keeper/恢复源丢失时需重新安装；重新安装不因旧 fixed `expectedVersion` 阻塞，默认 latest policy 生效。
  - 边界：需要目标 Mac 或受控 macOS 环境执行；Windows/Codex 环境不得宣称通过；不得记录真实 `private-config.plist`、`managedDeviceToken`、PEM 或 CRX。
- [ ] [V1] Playwright E2E alternate-environment rerun（duration-accuracy / timing-trace-smoke / timing-trace-verify）
  - 状态：Windows 本地 `spawn EPERM` 环境阻塞；Product Owner accepted V0 release risk（deferred, not passed）
  - 口径：该项从 V0 active blocker 移至 V1 follow-up
- [ ] [V1] 凌晨休息时间限制：允许配置凌晨不可用于休息时间，防止熬夜娱乐
- [ ] [V1] PiP cleanup permission alignment：移除 `product/interceptor.js` 中 `chrome.scripting?.executeScript` 的可选 PiP cleanup 分支，只保留 `chrome.tabs.sendMessage(tabId, { type: 'EXIT_PIP' })` content-script 路径；目标是让 production source 与最小权限 manifest/CWS 审核口径完全一致
- [ ] [V1] 工程性优化票（非用户价值主线）
- [ ] **[P2] Admin CSP 控制台告警未解（已知问题）**
  - 当前状态：`admin/admin.html?view=stats` 仍可能出现 `Executing inline event handler violates Content Security Policy` 告警，尚未捕获可行动的唯一来源
  - 口径：仅记录为 admin 页面已知告警，不得宣称已修复，不等价于 core runtime failure
  - 必做人工验证：stats 页面打开并展示数据、rules 页面可打开、devices 页面可打开、侧边导航可切换、login/logout 可用、save/sync 可用
  - 发布口径：本项不改变 V0 formal release gate 结论；V0 formal release 仍按 System Recovery Release Gates 判定
- [ ] **[P2/V1] Reminder 双滑轨说明文案对齐问题（已知 UI 问题）**
  - 当前状态：在 `study_mode` 与 `to_rest_confirm(unclassified)` 的双滑轨页面中，滑轨间说明文案在部分窗口尺寸下出现右偏/遮挡视觉问题
  - 影响范围：仅 Reminder 页面展示层；不影响模式切换、配额扣减、计时归因与按钮/滑轨交互语义
  - 处理策略：纳入 V1 UI 优化，采用固定结构布局（不依赖 `order` 动态拼装）统一文案块位置与层级
  - 发布口径：该项为已知非阻塞 UI 问题，不影响 V0 closeout
- [ ] **[Post V1-minimal] Time borrowing redesign（原始需求保留）**
  - 当前实现中的 borrow runtime/UI path 不进入 V1-minimal 发布范围。
  - 本项迁移为后续版本重设计输入，需重新定义：
    1) 借用来源与借用目标；
    2) 配额扣减与归还规则；
    3) 审批/确认流程；
    4) UI 入口（popup/admin/reminder）；
    5) 云端字段与同步契约；
    6) 统计归因与报表口径；
    7) 与休息/综合/受限娱乐路由关系。
- [ ] **[Pending PO D-015] 申诉/审核语义终审（使用分析页面 / 终端 UI）**：使用分析页面与待归类列表中的"申诉/待审核/申诉中/已改判/标为学习/标为休息"概念需 Product Owner 决策——从终端 UI 隐藏、只读展示、保留孩子侧申诉、或仅保留在家长控制台
- [ ] **[P2] Stage 2 local terminal/admin naming or physical split cleanup**：
  - 当前状态：`admin/admin.html` 同时承载：
    1. 孩子只读统计（使用分析、访问规则查看、本机状态）
    2. 家长 setup 操作（登录/注册/绑定/重绑）
  - 待决策：是否拆分为独立的孩子终端统计页 vs 家长 setup 页
  - 约束：不阻塞 V0 发布
- [ ] **[P2] disposable/old profile cleanup if still relevant**
- [ ] **[P2] formalize RC smoke test as permanent E2E if desired**
- [ ] **[P1/P2] 设备失联邮件通知方案待定**
  - 当前已完成：家长端设备健康状态 UI 文案与阈值修正（`deviceStatusInfo` 概率性文案）。
  - 当前未完成：设备失联 / 心跳超时后的邮件通知策略。
  - 待定内容：
    - 是否启用邮件通知；
    - warning / critical 阈值；
    - 通知频率与去重策略；
    - 是否使用 Cron 扫描 stale heartbeat；
    - 邮件文案；
    - 是否按 profile/device 去重；
    - 是否只在监控期或允许时段内通知。
  - 约束：不得声称"扩展已被禁用/移除"，只能使用"可能失联 / 请检查设备"等概率性文案。

## 冻结项
- [ ] [V1] composite routing（冻结到 V1）

## COMPLETED（V0）
- [x] [V0] V0 RC package built and verified（`dist/rc/timeonchrome-v0-rc.zip`, SHA256 `B9DE59BEE9267CEC9F5B47B3611FE7E1ED718C071961142573E7241A349BD389`, 64 files, 179.9 KB）
- [x] [V0] RC install smoke: manifest MV3 valid, service_worker=background.js, type=module, 27/27 critical files present, onInstalled binding flow fix confirmed in extracted zip
- [x] [V0] Automated regression: L0/L1/L1b/V12/E2E/API all PASS（421/421 via run-all.js）
- [x] [V0] M1-M9 manual validation: PASS（Product Owner verified all 9 items）
- [x] [V0] RB-1~RB-8: all CLEAR; RB-9: Pending PO final approval
- [x] [V0] First-install binding flow fix: `background.js` onInstalled install branch moved before bootstrap + try-catch protection, ensures bind.html opens regardless of bootstrap failure
- [x] [V0] Reminder V0 一致性阻塞解决：浏览器验证门（`tests/e2e/reminder-v0-validation.test.js`）11/11 passed；单元/路由/拦截器 213/213 passed；T-R4/T-R5 标题渲染顺序修复；T-R3/T-R3b 返回标签验证；路由/分类/统计/配额行为不变
- [x] [V0] Product Owner 手动验收通过：Reminder/UI 路径（Study→Rest 滑动确认、Study→Composite 自动切换+45s 轻提示、Composite→Rest 普通确认）
- [x] [V0] Product Owner 手动验收通过：Pending mode-transition feedback（Rest→Composite / Rest→Study / Composite→Study）
- [x] [V0] Product Owner 手动验收通过：Popup V0 layout
- [x] [V0] Product Owner 手动验收通过：admin 功能（stats/rules/devices/nav/login/logout/save/sync；立即同步按钮反馈可见）
- [x] [V0] Three-mode transition UX 规格文档冻结（docs-only）：新增/完善 `docs/MODE_TRANSITION_UX_V0.md` 并落档 `DECISIONS.md:D-019`，明确 Study/Composite/Rest/Paused、六向切换规则、hardBlocked 独立拦截流、Badge/Popup/配额展示与 V0 非目标边界（不含 AI 分类/二级分类/path-level routing/schema 变更）
- [x] [V0] Temporary composite permission semantic bug fixed and code-verified（commit `b5d371c`）：临时综合权限收敛为“当前标签页当前域名访问”范围；不再持久化到 `guardian_config.compositeList`；tab 关闭/跨域导航/离开或重入学习模式会清理；受限域与配额锁拒绝临时权限；终端永久规则不展示临时域；文案为“本次标签页访问内有效，占用综合时间，不计入学习时间。”
- [x] [V0] PiP study-mode cleanup blocker fixed and PO manually verified（commit `fcf38f7`）：切换到学习模式时 restricted/unsafe PiP 关闭；未归类 PiP 不静默保留；study/composite 允许场景保持；无关标签页不关闭；PiP 统计保持独立
- [x] [V0] Cloud default/system site lists reach terminal 访问规则（worker deploy `ae44552a-9b03-44f4-a14c-83d92d965028` + same-version sync persistence fix `028c941`，PO 手动验收通过）
- [x] [V0] Time accounting stale-gap reliability patch: transition/recovery/heartbeat/badge 共用 stale-boundary，未观察 gap 不计入 foreground/audio/PiP
- [x] [V0] System Recovery runner infrastructure: dry-run, chrome-restart, lock-unlock, network-offline, sleep-wake runner paths
- [x] [V0] Popup P0 UI 回正（删除 4 宫格/借用区/待定列表，模式按钮显示时长/配额，后台媒体纯数字行）
- [x] [V0] Popup P0 借用路由修正：`BORROW_ALLOWED_PATHS` 移除 popup，仅保留 reminder
- [x] [V0 Release Evidence] Admin subpage refresh on navigation：子页切换从“仅 DOM 显隐”修复为“切页后按页面刷新数据”；`rules/stats` 切页重新 `GET_CONFIG`；`devices` 保留即时刷新；新增 `adminPageRefreshSeq` 防止旧请求覆盖；新增 `rules/stats/devices` 错误态渲染。验证：`admin-nav-refresh 5/5`、`admin-stats-overview 10/10`、`admin-undetermined-list 50/50`、Manual browser verification PASS。
- [x] [V0] Bind 流程修复：CSP 合规（bind.js 外部化）、auth 变量冲突、cloud-sync token 守卫
- [x] [V0] 后台 audio/video 统计补 domain 明细：`backgroundMediaByDomain` 与 `audioSeconds` 摘要对账通过
- [x] [V1] PiP timing support 最小闭环：`PIP_ACTIVE -> pipSeconds / pipByDomain`，不混入普通在线或后台媒体；学习模式切换关闭非学习网站 PiP
- [x] [V0] 跨自然日计时按自然日切分：代码口径盘点、最小测试、聚合层修正
- [x] [V0] monitoring 核心短路收口
- [x] [V0] 配置字段单一模型收口
- [x] [V0] Background Audio Time 最小版
- [x] [V0] dev-reset 工具页（dev-only）
- [x] [V0 Release Evidence] Mode-switch in-page prompt lifecycle hardening：pending notice 绑定 `tabId + domainSnapshot`；`CONTENT_SCRIPT_READY` 基于 currentDomain 重发守卫；模式切换不依赖页面提示成功；验证结果 `interceptor-mode-transition-v0 84/84`、`content-rest-composite-pending-banner 23/23`、`mode-switch-prompt-lifecycle E2E 3 passed`
- [x] [V0 Release Evidence] Cloud sync evidence pass（read-only）：基于 D1 只读检查 + 真实 storage/admin runtime message 证据，确认 config sync、本地 stats message path、timeline path 均可用；确认 legacy cloud `stats` 表存在同 `profile_id/date/domain` 重复行风险（无 `UNIQUE`），已作为已知风险落账；本轮不做 Cloud/D1 写入、不启用 `statsFoundationV1SyncEnabled`、不改分类策略。
- [x] [V1-minimal Gate] Cloud Stats v1 minimal sync：Gate.Test 真实扩展闭环通过；`cloud_device_id` 已补齐并持久化；`CLOUD_FORCE_SYNC` 成功且 `v1Sync.lastError=null`、`pendingSegments=0`、`pendingStatsDates=0`、`lastSyncAt>0`；远端 `stats_v1/usage_segments_v1` duplicate checks 均为 `[]`；Worker `guardian-api` 已部署版本 `1c93c24a-17e6-418e-b870-83b5c4e3804d`。
- [x] [V1-minimal Gate] Recovery/System manual evidence close-out：已生成 close-out JSON/MD（`v1-minimal-recovery-gate-closeout-20260508-180200.*`）；manual gates 以 `MANUAL_VERIFIED_PASS` 落账；保留 sleep automated `PARTIAL` 事实并以 PO 手工语义验收补证据。
- [x] [V1-minimal Gate] Mode transition PiP cleanup + Study prompt regression：manual/auto 四路径已通过（Rest->Composite / Rest->Study），并完成 in-page prompt 生命周期回归；本项归类为 mode-transition UX / side-effect regression，不属于 Recovery/System gate。
- [x] [V1-minimal Close-out] Mode prompt delivery + popup noticeTabId + auto-transition delay update（PO review）
  - 页面内提示可见性已恢复；Product Owner 手动刷新后确认可见（当前为新提示形态）。
  - 提示样式调浅为更轻绿色；本次仅样式调整，不改变提示投递语义。
  - popup 发起 `SWITCH_*` 时携带 `noticeTabId`，提示优先投递到目标网页 tab，修复 popup 切换后目标网页无提示问题。
  - 自动切换延迟参数已更新并冻结：`Rest->Composite=30s`、`Rest->Study=45s`、`Composite->Study=45s`。
  - 文档同步：`docs/MODE_TRANSITION_UX_V0.md` 与 `DECISIONS.md:D-020` 已对齐 `30/45/45`。
  - 测试证据：`mode-switch-prompt-lifecycle` `3 passed`；`mode-switch-pip-close` `4 passed`。
  - 约束：涉及 mode transition timing / prompt behavior / UX 参数的改动，必须先文档审批/同步，再实现；禁止代码与文档分叉。

## V1-minimal mode-transition regression（must-run）
- `node tests/unit/interceptor-mode-transition-v0.test.js`
- `node tests/unit/reminder-transition-v0.test.js`
- `node tests/unit/content-rest-composite-pending-banner.test.js`
- `npx playwright test tests/e2e/mode-switch-prompt-lifecycle.test.js --reporter=line`
- `npx playwright test tests/e2e/mode-switch-pip-close.test.js --reporter=line`

## 维护约定
- [ ] [V1 Native App Control] 修复阻止时间段虚假保存：全天隐藏并禁用起止输入，非全天保存核对接口回显，单应用和批量操作做持久化 UI 验证；不变更 Santa 规则、Worker API 或生产 Steam 策略。
- [ ] [V1 Native App Control] Santa 每日阻止时间段：Native D1 migration、Worker 定时切换/同步前补偿、应用/预配置/发布者 UI 与本地测试已实现；仍需生产 migration、部署及真实 Mac 在时间边界的人工验收。此项与 Chrome 网页记账无关。
- [ ] [V1 Native App Control / 原生时间规则] 在 Santa 2026.8 现有安装上，将“已阻止应用”多选批量设置同一每日时段，按指定 Native Mac 显式启用 CEL 本地时间判定；未启用设备保持旧同步切换。已完成本地源码与聚焦测试，仍需合入主线、生产 migration/部署及真实 Mac 新启动窗口内外验收。不存在独立命名“应用组”。
- [ ] [V1 Native App Control / 应用规则归一] 手动应用时段接管已匹配预配置，主程序与已核验组件共用多每日时段；发布者规则仍独立可见。PR #148 已通过门禁并合入 `master`（`921c6e5`）；生产 Native D1 migration 007 已完成，2 条旧应用时段迁入新表，旧 `APPLICATION` 时段剩余 0 条；Native Worker 已部署（version `1e36faf8-651c-4a5d-9e45-d1afe021d9a5`），Pages 控制台已部署并回读 200。生产回读 Firefox 为 09:00–18:00、Edge 为 03:00–18:00，未擅自修改。真实终端阻断与同步效果仍需验收。
- [ ] [V1 Native App Control / 应用时段保存 CORS] 已确认 `PUT` 保存被旧 CORS 预检阻断；PR #151 已合入 `master`（`8216d31`），仅补齐 Native Worker 的 `PUT` 预检声明和回归断言，Worker version `6cc7bb8b-9d1e-4e16-a562-65b4ed27c4c9` 已部署。线上 `OPTIONS` 回读 204，允许 `GET, POST, PUT, OPTIONS`；未改规则编译或生产时段，真实页面保存仍待家长复验。
- 每个任务必须标注阶段（V0/V1）
- 每次只推进单主题小包
- 完成后同步更新本板与 DECISIONS
- 当前正式发布目标为 `V1-minimal release candidate`；V0 证据仅作为 baseline 保留，不作为 formal release 口径
