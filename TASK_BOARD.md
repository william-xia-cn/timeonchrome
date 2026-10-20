# TASK_BOARD

## NOW：获批修正受管Admin入口并正式托管1.7.65（2026-10-21）

PO已在控件会话明确批准最小修正，测试通过后继续完成1.7.65托管，直接与架构、Native对齐。extension-local允许路径为Admin、直接专项、manifest及既有发布文档/产物；不改激活状态机、权限规则、计时、配额、原账、共享开关或家庭配置，不更新原unpacked目录。实施顺序：先仅按privacyConsentRequired区分未激活展示，再验证受管无策略/关闭/无效/身份不符及普通/开发同意入口、正常激活；完成桌面/窄屏合成页面目视后固定源码、经PR集成，最后沿现有managed渠道签名和部署更新站，回读稳定及deployment域名的feed/CRX/摘要。复用d6a1752未变功能证据；最小本地测试为Admin激活显示、activation-gate、managed-activation-behavior、native-host-development-activation和managed-package-privacy-boundary，加typecheck/diff/职责检查；CI按PR实际路径执行，不跑全量或生产浏览器故障测试。计划审计与实际签名/上线结果随后登记，未完成不提前报通过。

修正直接验证已完成：Admin实际激活和renderSyncStatus函数的隔离9组通过，activation-gate19项、managed行为6项、development激活5项和managed包矩阵均通过。新增Admin测试首轮仅正常激活对照夹具误要求原界面不存在的文字，修为原有登录/绑定展示后第二轮通过，未改产品行为；typecheck首轮引用陈旧本地契约dist，按原构建命令重新生成ignored产物后通过，契约源码与vendor不变。extension-root、node语法通过。专用无登录agent-browser合成页面1280桌面及390窄屏已截图并查看，受管两分支无同意按钮、普通分支保留，390布局宽度390无溢出；这不是家庭Chrome或Mac实机验收。Plan audit：仅Admin状态分流及批准版本字段Matched，排除页/激活/原账/共享不变Matched，无Deviated/Extra；正式签名与线上回读仍Missing。既有三份文档草稿保留，提交只抽取本次新增段落。

## DEPLOYED_VERIFIED：Mac 登记契约1.58.1及Runtime-only（2026-10-21）

完成：PR #312合并 `d3a0652f993a14b8e5ec22bb67ce8ae1f80b2176`；PR CI39498624291及精确合并SHA CI39498831860通过。生产39499034985成功，Runtime Worker版本 `f13ab59d-1aed-4f73-b342-5bdf009a6cc0`，smoke成功。下载核验manifest：contractVersion=1.58.1、requested/deployedResources仅runtimeWorker、runtime/guardianMigrations均空、sharedAccessShadowPrepared=false、evidenceErrors=[]；Guardian和两套Pages跳过。production审批在PO本次授权内完成，未更改保护设置。

最终契约包92文件，SHA256 `1db02a41e2fb27730439d587c743822b5740cbea58d5cf71a6a53f27e6f16d29`；包内全文件与固定源码/编译输出一致，登记解析器与已验预备包逐字节相同。预备c55553包未作为最终交付。Native已推送main `8514d79308017e93932838f3d0389cb015f28add`，锁的1.58.1/sourceGitSha/最终hash已独立从远端读回核对；原Issue #12最终包交接评论6301684531。Native报告包级19项与.NET对象/向量19项通过，最终登记七文件相同故复用，不重跑39/2/26；Mac实际消费及实机结果未在本次完成，不冒称Mac全链验收。已将Runtime上线依赖事实通知Native沿原Issue补记。

边界修正验证：源码边界、computer-usage-cloud、pages-four-buckets、根typecheck和diff通过；共享函数仅换行归一化后内容相同，Guardian只更换导入。本次没有安装包/安装、真实配置/原账/身份/统计口径变化。审计Matched；无未批准Deviated/Extra。以下保留失败与恢复过程，不抹去前两轮CI失败。新增根测试的Scope-Exception最初遗漏导致39498535704范围检查失败，补PR精确声明后39498624291成功，未改门禁。

PO已批准解决共享引用边界并继续发布。最小修正：将现有纯展示web-usage-buckets脚本原字节纳入contracts包并导出；Guardian改用包入口，浏览器脚本保持不变，以直接字节一致性和原computer-usage-cloud/pages-four-buckets回归证明算法输出不变。不修改边界门禁。固定1.58.1尚未发布/锁定，最终包将有新哈希，原c55553…仅预备证据，不可作为最终消费包；通知Native撤回预备交付标记并锁最终包。必要复验仅源码边界、两项展示直接回归、根typecheck及既有CI，不新增安装测试、不部署Guardian/Pages。

发布阻塞（2026-10-21）：实现c6c064e、历史同步753e8b6、版本断言补正7ddcdbc已推送PR #312，尚未合并。第一次CI39496484419版本断言失败已修复；第二次39496704571契约测试通过，但源码边界门发现此前电脑四桶的 `workers/src/services/computerUsage.ts` 直接导入 `app-runtime-management/console/web-usage-buckets.js`。该文件不在本批修改中；未放宽门禁、未继续重跑、未合并部署。需另获准最小共享模块依赖修正后再复验。固定tgz1.58.1 SHA256为c55553cb6a66ae10de5a9c448cc76821ec76124ecb17837fb8ff220e63ae86d8，包内91文件一致性和包内解析器验证通过，已交Native准备消费；尚无合并sourceGitSha，锁提交暂缓。Native报告包级19项通过，DTO实际消费者发现同前缀校验，按本契约准备受影响适配；不冒称全部消费验证通过。

PR #312首次CI失败为contract-compatibility.test.cjs仍断言版本1.58.0；仅同步为本批1.58.1并运行该直接测试，产品源码和已生成包保持。没有跳过门禁。

PO批准集中提交推送合并、交付固定契约包、仅部署Runtime Worker，并沿原Issue #12协调Native更新锁及受影响消费验证。复用下方已通过源码证据；清单：①10文件职责/diff审核后提交；②PR和精确合并SHA Runtime CI；③从固定源码构建契约tgz、核验内容/版本/SHA256；④既有生产流程Runtime-only，其他Worker/Pages/迁移/bootstrap/shared准备均关闭；⑤核对部署manifest与smoke并交原Native消费。本轮不制作Native安装包、不安装、不修改应用ID、原账、配置或统计口径。线上登记真实设备验证与本地消费证据分开记载。

## LOCAL_VERIFIED：Mac 动态身份登记最小契约修复（2026-10-21，未提交／制包／部署）

PO批准本地源码修复及沿原 Issue #12 协调 Native。职责 architecture-integration + standard-cloud；允许共享契约、Runtime 直接测试及依赖锁、现有文档。清单：①契约仅增加 `macos:<64位小写hex>` + `dynamic-process` 组合，schema同步；②Runtime沿用共享解析器，不另造平台解析，不改身份/统计/配置；③补登记、回执、非法组合、孩子/分配隔离聚焦验证，复用其余已有证据；④将源码结果交原Native会话沿Issue #12接续。版本预备1.58.1，不覆盖已发布1.58.0包；本轮不打tgz、不安装、不部署、不启共享，不修改Native仓库。

变更等级：契约接受范围小幅扩展。必要本地测试：契约build/识别及对象管理专项、Runtime native-application-management专项与typecheck、diff。无生产smoke、全量/浏览器/Mac平台测试。源码通过不代表线上Runtime已采用，也不代表Mac固定包消费已通过。

结果：解析器和JSON schema仅扩展精确Mac动态进程组合；Runtime现有 `file:../contracts` 依赖实际链接该源码，正式POST登记路由已直接隔离验证，无需增加第二解析器或改生产路由。契约源码版本及根/Runtime两处锁元数据同步为1.58.1；根package-lock仅此workspace版本行变化，未修改依赖树。未生成tgz，未改Native固定1.58.0包或锁。

验证：`npm run build:app-runtime-contracts`、两个契约专项（新增11组接受边界与Mac三种来源/状态及回执负例）、Runtime `vitest run test/native-application-management.test.ts` 10/10、Runtime `npm run typecheck`、diff检查通过。首次Runtime专项10/10后typecheck发现新增测试schemaVersion被推断为number，已标注共享契约类型并复验两者通过。真实产品路由在本地隔离D1中完成鉴权登记、回执hash核验、读回同一target、重复提交、同版冲突、孩子/家庭/改绑隔离；未请求生产。

审计：契约最小接受边界、schema一致、Runtime同解析器接线、ID与统计不变、聚焦验证均Matched；Deviated/Extra无。固定包消费与线上实测是明确未交付项，不冒称登记已经在线打通。已通知原Native会话沿Issue #12接续，不重跑其Portable39/配置2/Swift26未受影响证据；当前无Mac产品代码或安装变更。

协调回执：原Native会话确认已在原Issue #12评论6301230627登记本次实施，Native文档提交aa1452eae1c7d5a29abd2e2be20c457081b9369e。最终本地验证结果已再发同会话补充原交接；不将“消息已送达”当作Mac固定包验证通过。

## DEPLOYED_VERIFIED：电脑四桶与同批应用读数（2026-10-21）

发布完成：PR #310，合并SHA `7cb927ebca90f2bdce42ce56d95c652199eed641`。Runtime CI 39493171615、Guardian integration 39493171493、主控制台39493171383全部通过；生产39493332683成功，Guardian Worker `2cf9979f-c6a5-48ca-b5f1-57b983250f89`、Runtime Pages `e8b47456`、主控制台Pages `c9e356b6`，三项smoke通过，manifest已生成且evidenceErrors为空。Runtime Worker跳过、迁移为空、shared准备false。PR附件因会话附件数量上限未登记，不影响PR实际合并。

线上只读核验：主控制台2026-10-21应用页与电脑应用来源均14288秒、截止04:35:25；电脑四桶学习711/复合14288/休息0/其他0秒。独立Runtime同日应用页与电脑应用来源均14468秒、截止04:38:25；电脑四桶学习711/复合14468/休息0/其他0秒。两套在各自批次中数值与截止完全一致；不同时间采样不冒充同截止横向对比。Runtime首次SSO票据失效，经正常入口重取并重载后恢复，无配置/配对更改。

五项线上关键资源（主index/shared view、Runtime controller/shared view/bucket helper）与合并SHA的Git blob逐字节一致。首次拿Windows CRLF工作区比较误报差异，已查实为换行而非部署不一致，并以实际发布Git LF字节复核通过。此前squash历史冲突已证实本批前树与生产树完全一致，仅补合并关系，未改变已验证文件。Matched：集中发布、资源一致、两套线上四桶/同范围读数/截止；无Deviated/Missing/Extra。本节只补发布记录，不触发重复部署；原账、配置、统计/配额口径及Mac/共享边界不变。

PO已批准集中提交推送合并及部署。复用下方完整本地验证，发布范围为Guardian Worker只读展示适配、主控制台Pages、独立Runtime Pages；Runtime Worker无源码变化不重复部署。精确合并SHA的Runtime、Guardian integration和主控制台CI通过后统一执行现有生产工作流，所有migration/bootstrap/shared准备参数关闭。发布后只读核对线上资源与两套页面四桶、同范围应用数值和截止；未验证前不报线上通过。不改原账、配置、统计/配额算法，不涉及Mac、Native或扩展托管。

## LOCAL_VERIFIED：电脑四桶及应用同批读数（2026-10-21，未提交／部署）

最终收口：本轮获准复验后，computer-usage-view缓存专项、app-runtime-component专项、computer-usage-cloud通过；usage-view-layout 12/12、实际控制器usage-read-controllers 3/3、根typecheck及diff检查通过。控制器测试直接加载主控制台读取函数、Runtime实际runtime封装/loadUsage及共用缓存，不以模拟渲染代替接线。覆盖同批5400秒与截止一致、刷新修订/更正下降、GET不清缓存、筛选隔离、孩子/日期变化、迟到响应拒绝、同范围失败保留及有效零。此前两次失败与暂停记录保留在下方，已由本轮批准复验结果替代。

实际页面隔离交互：仅回环服务注入合成会话和只读内存网络；Runtime应用→电脑仅1次summary请求，刷新5890秒后两页均采用新值及01:38:10截止；电脑筛选1200秒隔离，清筛选恢复5890秒且不另读summary；模拟失败保留本范围结果并显示旧读数。两套搜索均保留2个同名不同对象。主控制台、Runtime均完成1440×1000及390×844应用/电脑目视；Runtime侧栏开闭正常，小时图修复后body宽390、图表容器336、内部宽627、可滚动291px至末小时（末列右边356≤容器363），不再裁切。截图closeout-{main,runtime}-{application,computer}及其-narrow仅保存在本机隔离预览目录。

审计：Matched＝电脑可靠四桶适配、同范围应用读数/截止/版本、缓存/实际控制器与筛选隔离、两套桌面窄屏；Deviated/Missing/Extra＝无（本轮本地范围）。不改原账、真实配置、物化、统计/配额算法；不提交、不部署。线上同范围验收留待后续获准发布，不把本地证据冒充线上通过。以下为实施过程记录。

最终窄屏深查追加：侧栏动画结束后，Runtime小时图仍存在grid子项默认min-width:auto导致的真实溢出，body隐藏横向溢出使后半小时不可达。只给共享usage-distribution加min-width:0，恢复已有usage-chart-scroll的内部横向滚动；两份分发同步，补样式断言及滚到23时验证，不改图形数据或布局层级。

本轮收口授权：允许缓存专项必要复验，Runtime窄屏裁切及两套真实控制器隔离交互集中收口。缓存专项本轮已通过；先查实际计算样式再最小修正，不移动或删除功能。补齐同批切换/刷新、设备过滤、孩子/日期变化、旧响应与失败保留验证；仅运行直接相关测试及桌面/窄屏隔离浏览器，不连接生产、不提交部署。

控制器核对发现本批清缓存接线遗漏条件括号，使Runtime GET也清除了共用批次；按本轮授权最小修正为仅既有非GET分支清缓存，并直接执行实际runtime封装补回归。窄屏已复现为缩放后200ms侧栏过渡尚未结束即截图，稳定后侧栏完全退场，先补稳定条件截图与导航开闭验证，不臆改CSS。

本地实施进展：电脑秒响应增加只读 displayBuckets 与同次 applicationSnapshot；主控制台及独立Runtime无筛选应用/电脑读取共用孩子和日期范围批次，切换标签不自动推进截止，显式刷新及既有清缓存入口使批次失效。Runtime筛选读取继续隔离。两页显示应用真实截止及来源版本，保留原总量/分类/特殊应用边界。

验证：computer-usage-cloud通过（追加四桶与同源应用断言）；usage-view-layout 12/12；app-runtime-time 11/11；app-runtime-usage通过；根typecheck、语法、diff检查通过。computer-usage-view.test.cjs先后在旧请求入口静态断言、原组件内部缓存断言失败，已调整夹具为共用缓存调用，但累计两次失败后未再执行，待获准复验，不报整批通过。两套实际页面隔离桌面截图已核对：应用总量与电脑应用来源均5400秒，截止均12:00，四桶保持原色；Runtime截图为固定隔离样例渲染，不替代真实网络接线验收。主控制台390px正常，Runtime390px存在左侧裁切，未以局部截图宣布窄屏通过。

对照：Matched＝四桶读取适配、同批读数/截止、原输入不变及桌面显示；Missing＝上述暂停套件复验、Runtime窄屏核对收口及更完整的真实控制器隔离交互验证；无原账/配置/统计物化/配额算法修改，无提交部署。截图仅存本机隔离预览目录，不写入仓库。不将本项标记完成。

PO批准最小修复，先本地验证不部署。清单按序：①电脑现有秒响应补展示用四桶（网页沿用已读统计quotaBucket/mode及现有四桶映射，应用沿用非特殊分类映射），总量/分类/扣除算法不动；②响应携带同次应用快照及真实截止，两套页面无筛选应用/电脑复用同范围内存读数和刷新失效，独立Runtime筛选保持隔离；③两套显示统计截止、版本，缺失不伪装零；④固定77/80版本、其他/未归类/特殊应用、缺失、改孩子/日期/筛选与异步响应隔离测试及桌面/窄屏目视。变更等级中：仅云端读取展示适配与两套Pages，不改原账、配置、统计物化、配额算法、接口地址、Mac或共享开关。必要验证：computer-usage-cloud、usage-view-layout、computer-usage-view及相关Runtime读取测试、typecheck、语法/diff；不跑全量、不操作生产、不提交部署。保留已有发布收尾记录。

## DEPLOYED_VERIFIED：两套Pages集中布局发布（2026-10-21）

PO批准提交／推送／合并及两套Pages发布。发布前发现独立Runtime renderSecondsUsage仍使用旧summary-grid和双列明细，本轮先按已确认布局补齐实际入口：保留全部DOM读取ID及原对象／分类详情操作，统一主卡与明细表；仅HTML和展示渲染，不改源数据。复用已有主控制台证据，增加独立Runtime最小渲染验证与隔离目视，之后取得精确SHA的两套CI，使用既有Pages-only流程。两个Worker、配置、原账、迁移、配额、Mac排除。

补齐结果：独立Runtime当前秒统计采用主卡（总量／小时图／四桶）与明细表，原筛选导航及媒体开关保留，使用详情仍以原数组index触发，分类详情与同步／配额状态折叠保留。usage-view-layout 10/10、computer-usage-view专项及语法通过；本机当前秒统计隔离页面已目视，不连接生产。主控制台三页证据沿用上一轮。Matched：两套实际入口与功能保留；无语义变更。

发布与线上结果：PR #309 已合并，合并 SHA `0bb0a3c393c7ddf521cb6ac87660099350f8b7d9`；精确 SHA 的 Runtime CI 39481206309、主控制台 CI 39481206519 均通过。生产运行 39481366512 成功，仅发布 Runtime Pages 与主控制台 Pages，两项 smoke 通过，发布 manifest 已生成，无 evidenceErrors。两套 computer-usage-view.js、Runtime app-runtime.js 与 index.html 共四项线上资源逐字节匹配合并源码。已在登录后的两套实际页面分别核对应用与电脑布局：应用主卡／中性灰小时总量图／四桶／明细表、电脑主卡／来源明细及原入口均符合本批范围。Runtime 首次加载命中旧脚本的300秒缓存，缓存更新后核对通过，未重复部署。电脑可靠四桶与小时数据缺口仍如实标注，不推算；原账、配置、统计及配额口径未改。审计 Matched，无 Deviated／Missing／Extra；下方 LOCAL_VERIFIED 为此前阶段记录，已由本节发布结果收口。首次PR检查因测试文件未声明scope例外失败，补齐声明后的检查通过，不作为产品测试失败隐去。PR附件工具因会话附件数量上限未能登记，PR链接保留于此：https://github.com/william-xia-cn/timeonchrome/pull/309 。本节为发布后只读核对记录，不触发再次部署。

## LOCAL_VERIFIED：应用主卡及明细与网页实际布局对齐（2026-10-21，未提交／部署）

本轮清单：①共享视图 applicationSummary 将总量与日期导航、现有小时／逐日图、四桶摘要归入同一主卡；②applicationList 改为名称／分类／当前范围用量表格，完整身份键收进逐项可展开详情，保留搜索、稳定排序及同名不同对象；③分类、实例与诊断保留在明细卡展开区；④两套分发模块同步，真实主控制台隔离数据三页1440×1000对照及窄屏核对。仅展示层变更，最小验证为usage-view-layout、computer-usage-view、cloud-fault-tolerance与语法／diff；不改统计、配额、配置、接口，不提交部署，不涉及Mac。独立Runtime原有交互详情不删除，不以共享模块核验冒充其完整页面改版。

结果：上述主卡及明细表完成；原小时／逐日总量柱、四桶值、特殊应用说明、分类与来源诊断保留，身份键默认折叠而不删除。usage-view-layout 10/10、computer-usage-view渲染缓存专项PASS、cloud-fault-tolerance 7/7、两模块语法及diff检查通过。agent-browser在实际pages/index.html内存隔离数据验证搜索保留2个同名对象、详情展开、日周切换、390宽无横向溢出；1440×1000网页／应用／电脑及390×844应用主卡／明细截图已目视。截图保存在本机visualizations目录actual-{web,application,computer}-1440.png及actual-application-detail-{1440,390}.png。一次浏览器find指令不支持scrollintoview，改用独立scrollintoview命令完成，非产品失败。

审计：主卡层级、明细表、现有数据与功能保留、相同尺寸对照Matched；Deviated／Missing／Extra无（针对本轮主控制台三页范围）。电脑可靠四桶及小时数据缺口仍明确显示，不伪造；应用小时总量仍用中性色。独立Runtime仅同步共用模块，不声称其独立应用页完成同样整体重排。未提交、部署或操作真实家庭。

## LOCAL_VERIFIED：按实际页面统一电脑布局（2026-10-21，未提交／部署）

PO否决上一轮组件布局验收：独立长卡片不等于网页／应用实际页面一致，上一节布局Matched结论不再作为完成依据。实施：①对照pages/index.html实际usage-analysis-card／usage-card-head／日期导航，电脑复用同一主卡+明细卡层级及尺寸；②总量日期同排，四桶能力提示并入主卡，来源构成表、原分类及产品／时间线入口归入明细卡，状态可展开；③保持外层日周切换与原读取事件，无统计／配额／后端改动；④同一真实页面、同尺寸、隔离数据截取网页／应用／电脑，补窄屏及日期／详情按钮验证。必要测试仍限usage-view-layout、computer-usage-view及cloud-fault-tolerance、语法和diff；不提交部署，不读写真实配置。agent-browser只用于回环页面。保留所有已有修改。

结果：电脑改成实际网页同名usage-analysis-card两张卡，主卡总量／日期导航／四桶缺口，明细卡来源表与产品／时间线按钮；原分类和来源诊断折叠保留。日周沿用页面现有切换，前后日期委托原处理器，日期按钮与网页使用相同符号及ARIA说明。未改查询、源值、扣除或配额算法。应用保留现有小时图和分区；三页不是相同的数据能力或完全相同的内部结构，本轮不顺带重做应用。

验证：usage-view-layout 9/9、computer-usage-view渲染缓存专项、cloud-fault-tolerance 7/7、两模块一致性、两模块语法与diff检查通过。渲染缓存专项首次失败为断言硬编码无class的details标签；改为允许样式类且继续要求原诊断summary，复验通过。实际pages/index.html及原脚本仅替换内存API/统计结果，在127.0.0.1隔离加载；三页统一1440×1000截图actual-web-1440.png、actual-application-1440.png、actual-computer-1440.png，电脑390×844截图actual-computer-390.png，已逐张目视。电脑日→周、前一周、产品／时间线读出、窄屏无页面横向溢出通过。详情使用合成数据，不宣称生产验证；Runtime分发模块一致性通过，未另外声称独立站实机验收。

审计：本轮电脑主卡与明细卡／现有功能保留／数据口径不变／实际三页同尺寸对照Matched；无未批准Extra。已明确电脑无四桶及小时来源的能力缺口，未伪造图表；用户视觉确认仍待预览，不以本地验证替代部署或用户认可。

## LOCAL_VERIFIED：小时图颜色与电脑页布局补正（2026-10-21，未提交／部署）

此前“统一展示全部Matched”结论不完整：小时总量柱仍写死青色，电脑页仅插入四桶提示而保留旧卡片层级。本轮只修这两处，不部署、不提交、不改统计／配额／原账／配置。

清单：①核对现有小时字段：computerUsageService.getApplicationUsage 的 buckets 仅总量，应用视图适配同样只输出总量，无可确认的非特殊小时四桶；小时／日总量用中性深灰与“总用量（不分桶）”图例，不按全天分类猜色；②共用视图电脑页按时间选择、单一总量、四桶能力提示、来源明细及有效详情入口、状态说明排列，保留现有按钮和读数，不增加小时图；③更新两套同步模块与最小专项，核对输入不变、入口及缓存不变；④隔离桌面／窄屏目视并集中展示。

变更等级：前端展示。必要验证：usage-view-layout、computer-usage-view、cloud-fault-tolerance、两模块一致性、语法／diff检查及本地浏览器截图；不跑全量、生产或Mac测试，无发布CI／smoke。保留现有未提交的发布记录。

结果：当前身份入口 applicationProductProjections 的 buckets 也仅从 kind=total 小时行取 duration；没有逐小时非特殊四桶，不从全日数据反推。两套分发模块同步采用深灰总量柱与“不分桶”图例；电脑单一总量、四桶缺口、来源构成与扣除、原分类、对象与来源时间线、状态说明依次显示，现有请求和事件保持。未改任何后端或配额代码。

验证：usage-view-layout 9/9（补入中性色、全日分类变化不影响柱图、布局顺序、源值与入口不变断言）；computer-usage-view 渲染／缓存专项PASS；cloud-fault-tolerance 7/7；两模块一致性、node --check及git diff --check PASS。agent-browser仅访问127.0.0.1合成数据，以实际分发渲染器完成1440桌面、390窄屏目视，缺失小时斜纹／长名称／四桶颜色及窄屏无页面溢出通过；Runtime渲染器的产品、时间线按钮读出合成详情。截图为本机visualizations目录的computer-corrected-desktop/mobile.png及application-corrected-desktop/mobile.png。这是组件隔离预览，不宣称生产页面或真实数据验收。

审计：小时字段核对／中性总量柱／电脑层级／有效入口保留／输入与口径不变／本地测试及目视均Matched；Deviated、Missing、Extra无。技术边界仍为小时无可靠四桶、电脑无可靠四桶及小时数据。没有提交、推送、部署或修改真实家庭。

## DEPLOYED_VERIFIED：待处理计数与发布失败留证（2026-10-21）

收尾：实现1536900，PR #308合并88c4814919965db6f436d55f13acd6f3b26e6d63；PR及精确合并SHA相关CI通过，生产运行39472871034成功，主控制台Pages d84fd018。线上HTML与合并源码逐字节一致；已登录页面只读目视确认左侧／摘要／列表一致为待处理0、已处理10、不适用1，未执行分类或保存。manifest已下载核对：jobStatus=success、requestedResources/deployedResources均仅mainPages、main_pages_deploy/main_pages_smoke=success、其他部署和迁移skipped、evidenceErrors为空。失败路径复用既有隔离回归，未对生产注入故障；旧失败运行仍不伪装补齐artifact。独立Runtime沿用734605a未重复发布；不改原账、配置、统计口径或Mac。Matched；Deviated/Missing/Extra无。

PO批准本批集中提交、推送、合并及部署；复用下方已通过的隔离回归与目视证据，不重复故障测试。清单：①核对剩余10个文件仅含计数、发布工具及直接测试／记录；②提交并取得精确SHA CI；③仅部署有变更的主控制台Pages，以本次运行核验新manifest和资源重试；④登录后只读核对待处理仅计可归类对象，并记录真实步骤状态。独立Runtime、两个Worker、迁移、Mac、原账、真实配置、统计口径均不变。不故意破坏生产来验证失败留证，失败分支沿用既有隔离证据。

## DEPLOYED_VERIFIED：应用／电脑使用统一展示（2026-10-21）

发布记录：本批实现提交840fee0，PR #307已合并至734605ace3168b0872820ae7770dc32c4460b848；精确合并SHA的Runtime及主控制台CI通过。生产运行39469264903成功，仅部署Runtime Pages（c7129f52）和主控制台Pages（a7b67ec1）；两项smoke、manifest生成及artifact上传均成功（artifact 12286332042）。两个Worker、migration、共享准备均跳过，不涉及Mac。线上5项关键静态资源与该SHA逐字节一致。两套登录页面的应用四桶／小时图、电脑总览／四桶能力缺口均已只读核对并目视确认。独立Runtime最初显示旧缓存布局（资源max-age=300），缓存窗口后刷新已显示新布局；未重复部署、未修改真实配置。电脑桶不可用仍按已确认能力边界显示，不以分类推算桶。浏览器证据不含故障注入，失败／异步隔离沿用精确代码树的本地回归；不把正常页面核对冒称全部故障场景生产测试。

PO已批准本批集中提交、推送、合并与两套Pages部署；仅主控制台和独立Runtime，两个Worker、migration、共享、Mac均排除。复用下述本地证据，合并后必须取得精确SHA的Runtime与主控制台CI，再执行既有生产流程的Pages-only选项及线上只读资源／页面核对。待处理计数及发布失败留证代码不混入本次发布，仍保留未提交。

实施顺序：①核定字段并复用网页四色，应用仅使用 applicationUsage.nonSpecialCategories 的现有明确对应（study、composite+unclassified、restrictedEntertainment、other），特殊应用另列；电脑分类汇总不是桶，明确缺口并保留原明细；②应用小时／逐日图、当前范围排序与搜索；③电脑统一总览、四桶缺口及来源说明，保留有效入口；④同范围缓存、范围切换与迟到响应隔离；⑤聚焦测试及桌面／窄屏隔离目视。执行位置为两套 Pages 的共用 computer-usage-view.js 及其调用处，文档和直接测试同步。不得从图形重算总量、按分类重新扣费或仿造分段。

变更等级：前端展示及读取状态隔离。必要本地验证：统一视图专项、cloud-fault-tolerance、pages-four-buckets、两份模块一致性、JavaScript语法与diff检查，以及隔离桌面／窄屏截图。原本地阶段不提交部署；本轮按PO后续授权执行精确SHA CI及Pages-only发布smoke，结果见上。排除Worker改动、真实配置、原账、物化、配额算法、Mac与全量测试。已有未提交的计数和发布留证修复保留。

结果：两套页面复用一致的四桶、小时／逐日柱图和稳定对象排序函数。应用四桶只取非特殊应用的现有分类输入，特殊应用独立说明，原总量、分类、实例、截止及缺失原因保留。电脑四桶显示不可用及具体原因，原总量、来源分类、产品和时间线入口保留，没有增加小时图。主站应用读取增加孩子／日期范围隔离；主站与Runtime刷新不再无条件清空当前电脑读取器的有效结果。搜索后列表序号与排序一致，详情索引保留原对象。

已执行：`node tests/unit/usage-view-layout.test.js`（9/9）、`node tests/unit/cloud-fault-tolerance.test.js`（7/7）、`node tests/unit/pages-four-buckets.test.js`、`node app-runtime-management/console/computer-usage-view.test.cjs`、`node app-runtime-management/console/app-runtime-time.test.js`（11/11）全部通过；相关5个JavaScript文件`node --check`与`git diff --check`通过。测试证明展示前后输入不变、总量不按分类重新相加、未知与零分开、同名对象不合并、同范围失败保留及迟到响应隔离。未运行全量或生产测试。

目视：agent-browser仅访问127.0.0.1合成数据；1440桌面与390窄屏检查了共用主站渲染器预览及独立Runtime实际页面。四桶颜色、小时柱与缺失斜纹、长名称、电脑缺口提示通过；Runtime搜索“编辑器”保留两个不同身份且不改变总量。截图位于本机visualizations会话目录：application-desktop.png、application-mobile.png、runtime-application-desktop.png、runtime-application-mobile.png、runtime-computer-desktop.png、runtime-computer-mobile.png。浏览器技能只用于隔离目视，不登录、不读取真实家庭。

| 对照 | 结果 |
|---|---|
| 字段与四桶边界 | Matched：只使用已确认的非特殊输入，不改原值、不把全部分类当桶 |
| 应用图表／明细 | Matched：已有小时／逐日统计、名称搜索、当前范围排序、稳定身份键；不新增今日／本周列 |
| 电脑展示 | Matched：总量与扣除说明保留，四桶不可用明确提示，分类和明细入口保留 |
| 读取状态 | Matched：同范围保留、跨范围清理、旧响应隔离的直接回归通过 |
| 验证与隔离 | Matched：最小测试与桌面／窄屏隔离目视完成；未修改后端、原账、配置或配额输入 |
| Deviated / Missing / Extra | 无本轮实现偏离／未完成项／越界项 |

技术能力缺口（按批准范围明确保留，不算伪造补齐）：电脑无可靠四桶字段和小时数据；应用单次明细无并列今日／本周用量；两页均不增加分段高亮。上述本地测试与隔离目视证据复用；本轮发布与真实登录页面只读核对状态见本节顶部，不把静态文件一致性替代浏览器效果。

## 历史本地验证：待处理计数与发布失败留证收尾（2026-10-21，已由本节顶部发布记录收口）

PO批准集中修复，不部署、不改真实配置、原账或统计。实施清单：①pages/index.html 左侧、摘要、列表共用去重后可归类判定，未知页面单列不适用，不算待处理或已处理；②生产流程对内容一致性作有限重试，持续失败仍失败，manifest及上传不因smoke失败而跳过，并记录步骤实际结果；③在本任务板补记39457325255的既有发布证据，不重新部署或伪造旧运行artifact。变更等级为UI计数及发布工具；必要本地验证：未归类展示专项、页面契约、发布配置/重试专项、隔离目视、diff检查。排除全量测试、真实保存、Mac及共享操作；提交/CI另行安排。

结果：导航、摘要和列表共用分组判定，截图场景对应待处理0／已处理10／不适用1；不适用项折叠保留原记录及用量，已匹配其他用途的历史请求不重新计入。隔离DOM和目视通过。发布资源最多6次、每次15秒请求超时、间隔2秒；HTTP成功但内容旧同样重试，持续不匹配仍退出失败。manifest先保存实际步骤结果，再补远程版本观察；失败、跳过与成功分别记录，请求发布资源不冒充实际成功资源；manifest和artifact步骤always执行，证据缺失明确保留，不降低门禁。

聚焦验证：unclassified-usage-display、release-resource-retry、app-runtime-release-config、app-runtime-ci-routing、pages-config-v12-fields（246/246）、pages-four-buckets、pages-usage-object-sort及工具语法／diff通过。补正测试自身的Windows CRLF解析；综合静态测试中沿用分类着色和排序下拉的两条旧期望已按既有批准方案改为共用四桶和双按钮，产品逻辑未变。覆盖旧内容后成功、网络失败后恢复、持续旧内容／HTTP错误／断网失败、部署失败／跳过、缺失版本证据仍产出记录。浏览器技能仅用于合成数据目视，不读取真实家庭。

本次发布记录补齐（事后登记，不是重建原运行artifact）：2026-10-21通过GitHub只读回查39457325255，headSha仍为7131efd73fa81ba9c49dae77107252b086c2326e；Guardian、Runtime Pages、Main Pages均success，Runtime Worker skipped，Main Pages smoke failure，Release manifest skipped，运行结论failure。版本及随后7项线上资源一致性证据沿用下节和PR306评论6295862518，不冒称本轮重新做了线上核对。原运行缺失artifact无法追写，本记录明确补足追溯；新失败留证机制尚未提交或在CI执行，不重跑生产。

审计：两项实现、必要回归及事后发布记录Matched；Deviated／Extra无；剩余为提交后的CI与上线（本轮明确不执行）。此前“无已知代码缺项”结论被本次截图证据纠正，本修复尚未部署，生产待处理数字不会因本地验证而改变。

## RELEASED：本批页面整改发布与验收汇总（2026-10-21）

本节为本批页面整改的当前状态；下方早期“未提交／未部署／待线上核对”仅为当时实施记录，以本节及各项发布结果为准。不扩展到 Mac、Native 执行或共享启用，不重复部署。

| 范围 | 已完成及证据边界 | 尚缺项 |
|---|---|---|
| 网站重复归类及500 | 生产表结构与只读目标状态确认；旧完整路由确定性复现唯一键冲突；修复、失败重试／并发隔离回归、部署完成。线上已有其他用途规则对象不再列为未处理项 | 未在真实家庭执行分类保存／失败重试；不能称生产写入复测通过 |
| 应用配置保存 | 公共时间段键序误报已定位；局部更新、分类／特殊设置／限额互不覆盖、孩子隔离和版本冲突隔离验证通过，已部署 | 未在真实家庭点击分类或限额保存；生产写入验收未执行 |
| 管理入口职责与布局 | 两套页面已更新；目录范围移除、应用分类卡片无日限额、访问管理当前身份限额列表可读；桌面／窄屏隔离目视通过 | 无已知实现缺项；不把“可读取／可保存”扩称为限制执行已验收 |
| 分类说明与四桶展示 | 合法other及缺失信息文案已修复；共用四桶模块已部署，主站及登录后的独立Runtime均只读确认学习／复合／休息／其他，原总量保留 | 无已知实现缺项；不将主站取整文案当作逐秒对账证据 |
| 今日／本周排序 | 并排按钮及默认今日、稳定排序已实现；隔离验证和主站线上切换通过 | 无已知缺项 |
| 对象与日时段联动 | 选择、排序保持、清除已在线上核对；跨小时／同名隔离／无匹配／分页不完整／迟到响应等隔离回归通过 | 无已知缺项 |

剩余仅保留两个证据边界：①真实家庭的分类／应用配置保存未执行，当前使用隔离完整保存链路证据，不为补证擅自修改真实配置；②本次四桶发布流水线即时smoke失败导致发布manifest未生成，后续独立线上资源比对通过，见下节。不因这两项重复部署或重跑已通过专项。未发现需继续实施的本批页面代码缺口，不宣称全部生产写入行为已经实测。

## RELEASED：独立 Runtime 网页四桶展示统一（2026-10-21）

PR [#306](https://github.com/william-xia-cn/timeonchrome/pull/306) 已合并，SHA `7131efd73fa81ba9c49dae77107252b086c2326e`；该SHA的Runtime、Guardian及主控制台CI均通过。[生产运行39457325255](https://github.com/william-xia-cn/timeonchrome/actions/runs/39457325255) 的三项部署成功：Guardian `75c9a843-f196-45b0-a3c6-cecbba1d2715`、Runtime Pages `32901f87`、主控制台Pages `190130e0`。Runtime Worker、迁移、RPC初始化及共享准备均跳过。

流水线整体为failure，不能记为全绿：部署后的即时Main Pages字节比对失败，后续发布manifest步骤未执行。随后独立回读主站生产域名和本次专属部署域名，与精确合并SHA一致；两套页面共7项页面／脚本资源逐字节核对及组件manifest引用核对通过。即时差异根因未单独证实，不以“缓存问题”作确定结论；没有重复部署。

登录后线上只读核对：独立Runtime同日学习6分47秒、复合14分43秒、休息及其他0秒，总量21分30秒保持；主控制台同日四桶正常，保留原取整显示。主站应用管理组件正常加载，无资源版本错误。未点击真实保存、不改配置原账或扣费、不启共享、不参与Mac发布。[集中证据](https://github.com/william-xia-cn/timeonchrome/pull/306#issuecomment-6295862518)。审计：实现及只读展示Matched；Deviated／Extra无；生产写入与流水线manifest缺口按上节保留。

PO批准本批集中提交、推送、合并及部署。只发布Guardian Worker（既有读取返回桶字段）、主控制台Pages和独立Runtime Pages；Runtime Worker源码无改动，不重复部署。不执行迁移、RPC初始化或共享准备，不改真实配置、原账、扣费口径，不参与Mac发布。复用下列本地证据，通过精确合并SHA的CI后执行既有生产工作流；线上核对资源一致性和登录页面四桶展示，结果追加PR证据。

发布前CI发现的共用模块打包清单与主站加载器严格白名单不一致已修复；保留严格资源校验，runtime-management-loader和management-save-ui-browser复验通过，提交`95e729f`已包含在本次合并。PR职责声明已补齐，未修改检查器或降低门禁。

PO批准只读展示修正，不部署。清单：①主控制台现有cloudRowCategory／sumCloudRowsByCategory逻辑抽至Runtime与主站共用的web-usage-buckets.js；②既有独立网页查询透传已读取daily统计的桶字段和秒数，不新增查询或修改物化、修正、落账；③独立网页汇总固定学习／复合／休息／其他，缺失桶明确提示并保留原总量，网站管理分类仍与用量桶分开。必要验证为四桶对照、独立渲染、只读接口字段及打包引用、相关typecheck、隔离桌面／窄屏目视；不运行全仓测试，不改配置、扣费、媒体、应用统计或共享开关。

本地证据：`computer-usage-view.test.cjs`、`pages-four-buckets.test.js`、`computer-usage-cloud.test.js`、`main-console-release-stage.test.js`、`pages-usage-timeline-browser.test.js`、`npm run typecheck`通过。云端测试第一次因VM跨上下文对象比较失败，改为比较序列化值后通过；未改产品规则。隔离Runtime mock日／周均显示四桶，1440和390宽截图目视通过，窄屏无横向溢出；只允许本地回环域名，不读取真实家庭。主站仍用原桶投影，应用／媒体及总量保留。逐项实现审查：三项Matched，Deviated／Missing／Extra均无；发布与线上证据见上文，不将实现审查等同于所有生产行为实测。

## RELEASED：管理保存与网页使用展示统一整改（2026-10-20，PO批准）

发布结果补记：PR [#305](https://github.com/william-xia-cn/timeonchrome/pull/305) 合并SHA `31ee58e97ed864c34c1b3f21b70d29522d9bea8d`，三个相关CI通过；[生产运行39451941509](https://github.com/william-xia-cn/timeonchrome/actions/runs/39451941509) 成功部署两个Worker及两套Pages，smoke通过，无迁移／共享准备。主站资源与Git blob一致，线上目录范围移除、分类卡片无日限额、访问管理限额可读、排序／选择／清除及其他用途规则过滤通过；35段中20段对象匹配高亮，其余淡化。[发布证据](https://github.com/william-xia-cn/timeonchrome/pull/305#issuecomment-6295129686)。后续独立Runtime登录后已只读核对应用目录、访问管理限额列表及统一时间配置读取；最新四桶显示另见PR306。真实保存未执行。以下保留本地实施及根因记录，不再代表待部署。

CI夹具补正授权：PO允许仅修正 `computer-usage-view.test.cjs` 仍模拟已移除目录范围的旧夹具。改用主要目录中的普通未归类应用，保留特殊应用不混入普通列表的断言，并断言不读取已移除控件；不修改产品代码。最小复验为该文件及已有关联组件测试，通过后继续PR305精确SHA CI与集中部署。

发布授权：PO批准本批集中提交、推送、合并并部署Guardian Worker、Runtime Worker、主控制台Pages及独立Runtime Pages。复用已通过本地证据，合并后要求精确SHA的三项云端/控制台CI通过；使用既有集中生产工作流，迁移、RPC bootstrap及共享准备全部关闭。线上验收仅资源回读及正常页面只读展示，不点击真实分类/限额保存，不改原账、真实配置、共享开关或Mac发布产物。

实施清单：①网站未归类发现与现有其他用途规则对齐，并独立定位分类500；②当前应用身份局部保存，分类/特殊设置与限额互不覆盖，保留If-Match和孩子隔离；③移除目录范围及分类卡片日限额，主站访问管理与独立Runtime共用当前身份限额入口；④合法other名称、真实分类缺失提示；⑤今日/本周排序按钮；⑥日视图对象选择/取消与已上传时段联动。先文档后代码；现有主检出9f65179、工作树干净，不使用旧81a1源码，不新建分支或工作树。

变更等级：管理业务保存/API局部更新与展示交互。必要验证：直接相关网站真实表结构隔离、Runtime策略测试及typecheck、页面排序/时段/不变性测试、桌面与窄屏目视；不运行无关全量回归。原账、计时、统计物化、访问权限、扣费算法、真实配置不变；不安装部署、不开共享/Native自主执行、不参与Mac。HTTP500未证实根因前保持Missing，不能以重复列表修复代替。本批尚在实施，集中结果另补。

本地结果（未提交／未部署）：当前身份局部保存、两处共用限额组件、目录范围移除、other映射／缺失文案、排序双按钮、对象时段选择联动均已实施。网站发现／待处理列表使用现有用途归属判断；历史待处理记录不改写，仅已属其他时间者不再提供重复归类。没有修改终端待处理下发、原账、统计物化、权限或扣费算法。

验证证据：Runtime `vitest run test/native-application-management.test.ts` 9/9；根 `npm run typecheck` 通过；组件、网站完整鉴权路由＋真实请求表迁移、other原子失败／重试／并发、四桶、排序、时段几何及两个浏览器专项通过。浏览器使用内存配置，主站和独立Runtime分别实际点击限额保存及分类保存，核对只有指定字段提交、同名不同对象隔离，1440／390宽截图已目视；网页选择／取消／清除／排序保持／同名隔离／无匹配通过。调用者没有重新请求分段或重算统计。

补验：现有Guardian管理转接15/15通过，保留If-Match、请求体、鉴权及冲突响应，不重试写入；时段分页失败保留已加载分段、旧孩子迟到结果不覆盖、日期／设备／日周切换清除选择均通过。预览使用隔离示例，不是生产验收证据。

追加复验与现场只读核对（2026-10-20）：获准后 Runtime `npm run typecheck` 已通过。通过当前已登录主控制台正常打开应用管理，仅读取页面自身 GET app-policy 响应，没有提交配置。线上 timeWindows 的星期键顺序为 friday、monday、saturday、sunday、thursday、tuesday、wednesday，类别键顺序为 composite、restrictedEntertainment、study、unclassified；前端规范化重排为固定星期／类别顺序。递归排序比较确认时间段值完全相同，直接 JSON.stringify 比较却不同，符合现有后端公共时间段保护误报409的分支。当前局部保存实现不携带公共时间段，现有回归已覆盖同类键顺序误报和原值保持。现场未重新点击保存，不能把只读字段核对称为生产保存成功。

网站500现场证据追加：用户恢复授权后，SELECT sqlite_master 成功，rows_written=0。生产请求表仍保留 UNIQUE(profile_id, requested_target_type, requested_normalized_value)，与此前隔离测试应用015迁移后的表不一致。对用户指定孩子和已报告目标的受限SELECT确认 extension-page.chrome-local、127.0.0.1 已是 approved_other。旧 ensure 只检查待处理和拒绝记录、不识别其他用途规则，可能对同一目标重复INSERT。下一步在内存按生产仍有唯一键的009＋016结构运行旧完整路由复现，再验证当前用途规则前置判断；不迁移生产、不修改历史记录，保留已有失败原子重试验证。

网站500定位与验证结果：受限SELECT进一步确认上述两个目标确有host/other用途规则，三次生产查询均rows_written=0。固定旧源码9f65179按生产唯一键结构在内存重放，第二次ensure已处理other目标时确定抛出 `UNIQUE constraint failed`（profile_id、requested_target_type、requested_normalized_value）；Worker入口异常处理返回500。根因是未归类发现／创建入口未考虑当前other用途规则，忽略已处理记录后重复INSERT，不是用户分类内容错误。此前测试套用015移除唯一键而漏检，这是测试环境偏差。未获取当时请求日志；结论依据生产结构／目标状态／有效规则与旧代码确定性隔离复现，不冒充生产写入复测。

修复复用本批已有other用途规则判断及列表过滤，不新增迁移、表或分类算法。新增固定回归默认保留生产唯一键，另以 `--migrated-schema` 覆盖015后结构；两个现场域名及普通示例域名均经完整鉴权路由验证“创建→归其他→重复ensure”，确认返回alreadyClassified/other、配置及版本与请求记录不变。两种表结构测试、`site-other-atomic-retry.test.js`（两步失败回滚／重试／幂等／并发／访问规则和原账不变）及根 `npm run typecheck` 全通过。未重跑已通过且源码未变化的UI和Runtime专项。

一致性审计：Matched＝六组本地实现与隔离／目视验证、两侧类型检查、应用公共时间段顺序现场证据、网站500生产结构隔离复现及修复回归；Deviated＝无已知主动偏离；Extra＝无范围外产品修改；Missing＝提交部署后真实页面读回与保存验收尚未执行，本轮明确不部署、不修改真实配置和原账。源码本地验证完成，保留未提交变更，不宣称生产故障已经消失。

## NOW：归类默认状态、其他时间保存一致性和四桶展示集中修复（2026-10-20）

发布授权追加：PO批准本批集中提交、推送、合并及两个必要Worker、主控制台和独立Runtime Pages同步交付。发布职责为release；复用下述已通过的本地专项和目视证据，执行精确合并SHA的Runtime／Guardian／主控制台CI及生产只读smoke。只发布本批代码，不执行migration、不修改真实原账／访问权限／配置／扣费口径，不启共享、不参与Mac或控件托管；生产核验不点击分类保存。

发布前必要测试适配：CI组件测试仍期待无明确分类显示“跟随分类规则”，与本批已确认规则冲突。按已批准实施范围仅将该期望改为“未归类应用”，本地复验整个组件测试；不修改产品实现或放宽身份隔离、目录过滤断言。该步骤按Build&Test职责完成后返回发布核验。

PO批准本批统一修复：①应用管理按当前有效分类分组，缺省未归类，删除“沿用原配置／未单独配置”分组；已归类对象不得撤销回未归类，只能改为明确类别；②复用已接通的网页“其他时间”用途规则，确认记录和规则保存保持一致，补齐失败、重试与重复提交；③时间桶展示固定学习／复合／休息／其他，去除紫色第五桶，统一图例、时段和汇总。未知数据不得冒充其他时间。

基线为现有主检出 `D:\Codex\TimeOnchrome` / `codex/web-usage-object-sort` / `a6f1020`，实施前无未提交修改。旧81a1工作树落后，不用于本批修改。变更等级为管理业务保存及展示；本地验证包括应用默认分组与禁止退回、网页用途规则失败重试、四桶与借用口径、相邻用途规则不变性、相关typecheck及隔离桌面/窄屏目视。CI/生产smoke本轮不执行；不改原账、访问权限、扣费算法、真实配置，不安装部署或参与Mac发布。先文档后实现，集中展示结果。

本地实施结果：Native对象无配置和既存unclassified同入未归类，表单不提供清空／unclassified选项，服务端拒绝新设unclassified及删除已归类Native配置；目录编辑不能撤销已有明确分类。网页其他时间复用原用途规则，用D1 batch同时保存配置和approved_other，CAS冲突重读，重复成功不再递增版本；关闭“暂不归类”和旧撤销入口，不修改访问清单。四桶按现有quotaBucket展示，借用只进休息显示，缺失桶不猜其他且总量保留；没有修改落账、统计物化、上传或配额算法。

验证：根及Runtime `npm run typecheck` 通过；Runtime `npx --no-install vitest run test/native-application-management.test.ts` 7/7；`app-runtime-knowledge.test.cjs`、`pages-site-classification-edit.test.js`（11/11）、`runtime-management-loader.test.js`、`site-classification-other-approval.test.js`、`site-other-atomic-retry.test.js`、`site-usage-other-ui.test.js`、`web-other-cloud-ingestion.test.js`、`pages-four-buckets.test.js`、`pages-usage-timeline.test.js`、`pages-usage-object-sort.test.js`通过。SQLite注入第一／第二条SQL失败均回滚，随后重试成功；重复提交、并发配置不覆盖、访问规则及原账哨兵不变。Runtime缺少测试依赖，按既有lockfile恢复后完成复验，未改依赖版本。

桌面1440px／窄屏390px隔离浏览器：`native-classification-view.test.js`、`pages-usage-timeline-browser.test.js`通过，截图已目视；应用默认分组／分类选择和四桶图例、条纹、重叠设备、窄屏滚动正常。未知桶、分页失败保留原统计总量；周／媒体视图不切到时段图。对照三项均为`Matched`，范围外原账／访问权限／扣费改动为`Extra: 0`。待交付：源码未提交、未部署，生产页面尚未复验；隔离验证不冒充线上通过。

## NOW：网页使用管理对象列表排序（2026-10-20）

PO要求移除网页使用列表的“显示分类”切换，网页使用只显示现有管理对象行；原位置提供“今日使用／本周使用”排序，默认今日使用。实施清单：① `pages/index.html` 仅在网页使用标签显示排序控件、隐藏原视图切换；②直接按现有 `targetRows.todaySeconds`／`weekSeconds` 降序排列，名称稳定破同分，不修改数据源、聚合或对象详情；③应用、电脑、媒体标签原列表行为不变；④更新 `tests/unit/pages-config-v12-fields.test.js` 并增加聚焦排序行为测试，桌面／窄屏目视核对。变更等级：页面展示小改；不运行全平台、原账、Worker、Native 或发布测试；本轮不部署。

结果：`pages-usage-object-sort`、`pages-config-v12-fields` 246/246、相邻时段网格单测和差异检查通过。隔离浏览器用三条示例管理对象验证今日顺序、切本周后的顺序及媒体原分类视图；桌面与390px目视通过，窄屏整页无横向溢出。实施对照：网页对象单视图、两种排序与默认值、其他标签不变均为 `Matched`；`Deviated/Missing/Extra: 0`。仅本地源码验证；未连接真实家庭、未部署。

## NOW：应用管理与网页日视图统一页面交付（2026-10-20）

PO确认本批统一交付三项：已上线的使用分析标签顺序（网页、应用、电脑、网页媒体，默认网页）、应用管理纯排版、网页使用日视图 24 小时／每小时 12 格时段网格。旧工作树应用管理改动夹带默认分类与筛选语义变化，已被范围审核拦截，本批明确排除；所有现有按钮、目录范围和分类行为保留。必须基于包含标签顺序的最新主线集中合入，桌面与窄屏目视及聚焦测试通过后，一次发布主控制台与独立 Runtime Pages。仅页面展示与已有控件接线，不改应用身份、分类、统计、配额、原账、配置或 Mac 工作；不部署 Worker、不迁移、不托管。

隔离浏览器旧测试先等待尚未进入的应用视图，随后断言旧夹具的 5 类而现行页面为 7 类；模拟分类保存还会重建目录，故将原始系统应用检查放在该操作之前。仅修正测试的进入顺序、当前分类数量及展开详情后的观察方式，不调整产品分类或管理事件。应用管理桌面／390px 浏览器测试、知识管理专项、网页时段网格单元与浏览器测试、typecheck、`git diff --check` 均通过；目视确认两种宽度无应用管理横向溢出，时段网格在窄屏仅图内横向滚动。实施对照：确认布局与保留项 `Matched`；业务语义变化 `Extra: 0`；原账、配额、配置和 Mac 改动 `Extra: 0`。待合并部署后另核线上实际页面。

## 2026-10-20 最终合并CI静态断言适配（无产品改动）

- 最终主线`0d32fbe`的Guardian CI在`profile-account-v2-worker-contract.test.js`失败：旧静态检查从公开入口起截取，误将已经验收的`runBindingScopedUpload`包装器`return`当成上传失败后跳过快照。实际`syncUsageStatsForBinding`仍在上传try/catch后独立读取已确认账户快照，未发现此项容错丢失。
- 最小修正仅测试定位：公开入口必须委托既有绑定隔离包装及内部函数；内部函数仍逐项要求上传错误捕获后无条件执行snapshot。复用改绑隔离证据，不删安全包装、不改产品或网页落账。只复验该19项静态专项及已有`profile-account-v2-sync.test.js`四类上传/退避/失败读取行为；合并准备树与最终主线零差异，不重制固定候选包、不部署或启共享。
- 结果：增加公开包装接线断言后静态专项20/20，现有动态同步42/42，diff与职责范围检查通过。Matched＝公开绑定保护、内部失败容错均保留；Deviated/Extra＝无；Missing＝新SHA CI及正式实机，源码/包均未重制。此项只是测试识别函数边界修正，不改变容错标准。

## NOW：跨仓契约一致与唯一控件候选核验（2026-10-19）

**终检纠正／当前待重新核验**：架构独立检查发现`core/shared-web-contribution.js`仍被打入候选，导出已退役schema1/毫秒贡献转换。反查唯一消费者是其专属unit，无当前产品入口；先前仅核对已删除清单漏掉该独立文件，不能据此宣称旧模块清完。下方ZIP hash `fb979213…`和PASS_ARTIFACT_ONLY已失效，禁止交付。按原批准清理范围删除实现及旧专属测试，并在现有包validator拒绝已退役模块混入，补同文件夹具；补跑打包专项及当前桶shadow直接回归。保持同一1.7.65版本，集中修正后重新解压/静态link/同源/隐私核验；不安装部署、重载、启共享或改原账配置。

上述修正源码已通过：实际删除旧贡献生成器及其schema1专属测试，而不是只在打包隐藏；现有包校验明确拒绝11个退役业务模块（含本项）。`node tests/unit/managed-package-privacy-boundary.test.js`与`node tests/unit/source-statistics-shadow.test.js`本轮均首跑退出0，当前V2桶/桥/云/缓存/身份用例保持；语法和diff通过。当前产品及tools测试中旧生成器符号检索为零，云端专属旧测试位于其他工作线，未跨职责修改。待同版本候选重建终检。

PO批准本轮统一跨仓契约锁及最终发布包核验。extension-local仅固定此前已批准且已通过验证的旧业务清理源码，核对当前1.58.0 vendor与架构最终契约包逐文件一致，再生成唯一1.7.65内部unpacked/ZIP候选；不使用私钥、不生成CRX/feed、不推送、不更新原加载目录、不安装部署、不操作浏览器、原账、绑定或家庭配置，不启共享。保留所有既有未提交草稿。

实施清单：①核对HEAD、已加载交付源码和本批差异；②复用未变专项证据并核对唯一当前vendor、imports及删除模块不可达；③固定本批源码及契约指纹；④用现有staging生成唯一候选，核对版本/公开key推导ID/权限/marker不变；⑤ZIP解压逐文件核对、包内旧模块和隐私检查，集中报告源码与包证据，不冒充实机验收。变更等级为交付核验，最小必要本地检查为managed-package-privacy-boundary（若精确同源则复用）、typecheck（同源复用）、node语法、包imports/解压/hash及diff；不运行全量或真实浏览器测试，不执行CI或远程发布。

基线独立复核完成：HEAD `e94d273b48e027f8a4c2b8af096d864ab2e9a45d`；原加载磁盘1.7.64共208文件，与既有交付证据逐SHA一致，除manifest/开发marker/Chrome metadata外与HEAD产品源码比较无差异（文本只归一CRLF）。源manifest1.7.59与原包1.7.64是既有候选覆写，不是丢失修复。当前候选继承原公开key、nativeMessaging/debugger权限及native-host-development/close-development标记；不新增权限。最终结果待补。

包检查发现并限定修正：当前vendor的`shared-web-sync-v2.vectors.json`只有单元测试引用，现有staging却带入发布包。它是公开合成向量而非私钥/真实身份，但属于测试专属数据；仅在既有打包filter排除`.vectors.json`、validator拒绝混入，源向量保留，补同文件隔离fixture和三模式核对。只重跑该打包专项及语法/diff，不扩大产品回归。

该最小修正已通过：`node tests/unit/managed-package-privacy-boundary.test.js`首跑退出0，覆盖测试向量排除/源向量保留/混入拒绝、managed/development/regular及候选模式；脚本语法和diff通过。打包脚本SHA256=`2497ae60eb6509a30ebda9db3c3b74c523bc0d86a702a0e5ac8c13867af5d767`，对应测试SHA256=`231aef4bf429564c62ce3e211f6f0481d1fb92753533242d97dc1ec033552594`。本轮独立重算下节19份既有关键源码/测试证据SHA，无差异，复用已通过产品专项和目视证据。提交前范围审计：Matched为已批准旧业务清理、当前功能保留与包排除；本轮无业务语义、权限或配置新增，无Deviated/Extra；实际安装/运行验收仍Missing，当前不执行。

最终跨仓契约固定为1.58.0，源码`7e1f81d1d000caab8005c64ea7d96ceb21124ff8`，tgz SHA256=`9843caa557ab0812dcc900c6e48633f576365fee49a879b9a1cc30e61b651991`。从该真实tgz逐条读取核对，控件四个当前运行JS及单元测试V2向量全部逐字节一致，无需换行归一；运行包仅携带四个JS，测试向量只留源码。该固定包取代未提交dist作为同源依据，具体四JS哈希见下节。

**本轮交付核验完成（PASS_ARTIFACT_ONLY，非安装或实机通过）**：本批65文件集中本地提交`1adad01c6f8e1979fddf8b0e526179eb36611580`，范围检查通过；原三份文档草稿原样保留，未推送。唯一内部候选位于`dist/final-cleanup-1.7.65-20261019/`，ZIP=`timeonchrome-1.7.65-internal.zip`，613878字节，SHA256=`fb97921352664b6c5cd08cea77adce55741e967db805935f25ac4c0066937dc1`；unpacked/解压共184文件逐SHA一致，treeHash=`fc114e6ae3e48a66fe968efabc8dc859eebd3105a5cda3b51a83703fa29a9859`。现有staging由固定提交导出；除候选manifest和部署marker，全部字节与固定源对应，四契约JS与最终tgz完全一致。

本地终检：129个JS仅语法解析和静态link（390条依赖边，未执行），9项manifest入口、39处HTML资源均存在；10个已删除旧产品模块、历史vendor、测试向量、仓库/测试/私钥/账本/浏览器私有数据不在候选。公开key推导稳定ID、权限和开发marker与原1.7.64相同，原加载目录208文件再次逐SHA不变。机器可读`artifact-verification.json`保存固定源码/契约SHA和全部文件摘要，属于本地产物证据、不进入Git。没有CRX签名/feed、私钥读取、浏览器运行、重载、安装、部署、配置或原账改动，不启共享。Matched为契约同源、唯一内部包及包闭包；Missing为正式安装后的实机验收，本轮明确不执行。

## NOW：控件旧业务链路清理（2026-10-19，PO集中方案）

发布staging残留子项（实施前）：已查实self-hosted-crx-dry-run递归复制历史vendor。按已批准第12项，只在发布staging从非vendor产品import确定唯一契约版本，排除其他历史版本，并在包检查拒绝混入历史版本或缺失当前直接依赖；不新增版本配置、不删除历史源码。修改范围仅该打包脚本、现有managed-package-privacy-boundary隔离测试及任务板。必要验证为该测试的临时fixture/现有三种staging模式、node语法和diff检查；不运行Chrome/CRX签名、安装、真实加载目录或无关产品测试。歧义版本明确失败，不猜选最新版本。

该子项已完成，Matched：`tools/self-hosted-crx-dry-run.js:114`从非vendor JS导入读取唯一版本，缺失/歧义拒绝；`:244`在复制前确定版本并用copy filter排除历史目录；`:142`独立验证staging版本目录仅有当前值。无新版本配置，源历史目录不删。`node tests/unit/managed-package-privacy-boundary.test.js`本轮首跑退出0：临时fixture验证历史排除、当前直接及同目录间接依赖保留、历史源文件不变、混入历史包拒绝、多版本及缺失直接依赖在写staging前拒绝；现有managed/development/regular及candidate/close-development staging均仅含当前1.58.0且其文件逐字节不变。`node --check tools/self-hosted-crx-dry-run.js`及`git diff --check`退出0。未启动Chrome/打CRX/签名，未生成实际发布候选；真实包与部署仍Missing，不冒充发布验收。脚本SHA256=`307e62d37801ff731f0dd10752e99cc3d97429a0b0a305b4d01e698e8463284a`；测试SHA256=`b97971888b55e8c556a60c5f1a36f8f8a0388c78a455c4c915b7c2adea4c6e2f`。仅本子项三文件增量，保留其他脏树，无提交推送。

当前1.58契约后续收缩同步：根已完成V1策略、贡献、混合execution、挑战及四个旧提醒/活动能力常量删除，并编译/直接专项通过。控件仅同步当前1.58.0的shared-access.js、shared-web-sync.js、shared-reminder-lifecycle.js，核对source-statistics未改算法且哈希一致；同时替换相互依赖的静态import，避免只删单文件导出造成装载失败。当前产品无上述V1符号调用。必要回归限定V2绑定、策略读取、提醒/活动/执行直接消费者及当前桶/runtime；复用已通过的页面和无关完整测试。不更新真实加载目录、不提交安装部署、不启共享。

上述同步已完成并通过：以下9个直接命令均`node tests/unit/<名称>.test.js`退出0：shared-web-reusable-binding、shared-access-policy-reader、shared-reminder-lifecycle、shared-reminder-content-bridge、shared-browser-activity、shared-browser-execution、shared-browser-executor、shared-access-runtime、source-statistics-shadow。`node tests/unit/local-guardian.test.js --current-binding-only`退出0，包含现行冷v3、真实init/注册reader/桶、重连及迟到云端保护；该子集只证明本次vendor装载影响，未变整文件其他用例复用上一轮完整通过，未用子集冒充全文件。本次`npm run typecheck`和`git diff --check`通过；当前1.58上述V1业务导出及四旧cap常量检索为零（rg退出1表示无命中，不是测试失败）。

最终vendor与根产物SHA256逐个相同：source-statistics.js=`609ccbefae4a70fb0eb4977588fb654fc7067660ca8ee0c50f0a4be5c1ba0fab`；shared-access.js=`5a8b96aff9c1214b616818097c162b17741468395f550b26bfccea191a162d97`；shared-web-sync.js=`02dd0d163b1bce9460d45d897637269dd46db39a897968b339bb8bfb790f5621`；shared-reminder-lifecycle.js=`dfd3b6abd7552719b6490af9ef045fbb6f95544b198864c6610658cf0d2c1513`；V2签名向量=`05cb4993b76b2bfe497bf11c6d08ee5e57e2bb3f158668c1f596d84528233b7d`。当前vendor同步与直接验证Matched；历史vendor目录未覆盖，真实安装和最终发布包仍未验收，不扩大结论。

**最新结论（本轮复验完成，取代下方历史未复验状态）：四项剩余必要专项均首跑通过，当前控件清理范围的源码验证为Matched。** 本轮只更新任务板和执行已授权测试，没有再修改产品/测试代码，没有提交推送、安装、部署、更新加载目录或启用共享。实机及跨仓整体清理仍由主会话分别判断，不能以本结果宣称整个产品已发布或全面完成。

本轮命令与结果：`node tests/unit/shared-web-reusable-binding.test.js`退出0（含失效代请求拒绝、本代一次串行恢复、最多一个并发证明请求）；`node tests/unit/local-guardian.test.js`整文件退出0（当前v3冷连接、秒读取、两种自动绑定/桶交换、迟到云端保护、C#合成wire回放）；`node tests/unit/mode-service.test.js`退出0、165项；`node tests/unit/source-statistics-shadow.test.js`退出0（当前V2桶、桥/云备用、缓存与身份隔离）。`npm run typecheck`及`git diff --check`退出0。复用此前未变化的12项通过和两处隔离目视证据，未重复无关测试。

精确基线仍为HEAD `e94d273b48e027f8a4c2b8af096d864ab2e9a45d` 加未提交差异；本轮通过的当前文件SHA256：

| 文件 | SHA256 |
|---|---|
| extension/infra/shared-web-reusable-binding.js | 5682ec96ecb0e5bb8f9034ece5b6172b06ca48cc81a98b63f408d4fca10507fb |
| tests/unit/shared-web-reusable-binding.test.js | 7e6b6a53ed67d5623c8016100cd9ac82639d46d57cd6922afef1ba27b9c47826 |
| tests/unit/local-guardian.test.js | 9f9c7248d6444de10dc5449533303837fe39a6a540d27814906f4d33ad3860a2 |
| extension/product/mode-service.js | de17133153004396bf9d0f00f1c5184bdb1c87f1406330f1aa20db38673f854c |
| tests/unit/mode-service.test.js | e9fe1a27f39396519c7dba1993709acfdbaebdf7c5e04f779f2ae4d2f585219a |
| extension/infra/source-statistics-shadow.js | 8e7c8352d071150419ae5c80b5f85238ff9f35d6b69531200bdbbb0f8568e8c0 |
| tests/unit/source-statistics-shadow.test.js | b9744dcf94347aebb93e1c71520927371072975f473b50b505c8f47925c76421 |

本轮再次核对1.58.0 vendor的source-statistics/shared-access/shared-web-sync/shared-reminder-lifecycle及V2签名向量，全部与根契约产物SHA256一致。Matched：本控件已批准旧入口/消费者清理、当前能力保留、绑定代际修复、直接隔离验证；Missing：本轮未执行最终发布包及实机验收，不以源码通过替代；Deviated/Extra：本轮无新增偏离或额外业务。原有脏树和历史证据保留，以下旧失败描述仅为过程记录。

剩余复验授权（2026-10-19）：PO明确批准集中完成四项必要复验，包含绑定竞态，允许重新运行此前停止命令，不重复请求相同授权。本轮按shared-web-reusable-binding → local-guardian整文件 → mode-service → source-statistics-shadow顺序验证已修改源码；仅修本范围实际问题及必要夹具，不放松断言、不改原账/配置、不连接真实Chrome、不安装部署或启共享、不提交推送。每个失败命令本轮最多两次，失败先分析；未变且已通过专项复用。最终运行typecheck/diff并固定契约版本与源码哈希，更新Matched/Missing。

本轮后续状态（取代下方历史缺口记录）：完整local-guardian已迁到当前秒/桶/V2并通过；V1提醒/活动/执行专属分支和旧贡献模块已删除，当前安全用例保留。policy-reader的外层缓存schema1/内层策略schema2已以现行V2缓存恢复回归证明，审核后删除V1读取器及专属云端导出；该全文件复验通过。旧贡献诊断删除经当前V2独立字段、身份和UI回归证据审核后已落地，专项通过，不再是工具阻塞。继续清除Native客户端已无消费者的旧响应字段、旧能力显示和旧Host常量；只保留当前秒/桶/证明/生命周期能力。随后集中vendor根会话已构建当前契约、直接回归及诊断隔离目视。mode-service两次失败的旧断言已集中修正但最终未复验，明确Missing，不以子集替代；不第三跑、不重复询问授权。不提交、不更新真实加载目录。

1.58同源复验新缺口：local-guardian最终第二轮暴露当前证明初始化竞态：能力由false→true使旧generation失效，refresh却复用在途identityBindingPromise，旧操作被正确拒绝后没有本代准备。最小处理限定当前binding生命周期：等待失效代操作结束，再允许本代最多一次重新准备；旧响应仍拒绝、不同代不并发认证，不恢复旧能力判断。补确定性隔离用例，但按停止规则不第三跑完整local-guardian或绕行；最终明确回归尚未执行。source-statistics-shadow装载器旧函数锚点修正后第二轮发现旧“缺schema允许”断言；1.58实际要求显式schema2，已对齐断言但停止第三跑。mode-service也保持最终未复验。

本轮集中收尾（未提交）：当前产品契约导入统一1.58.0，source-statistics/shared-access/shared-web-sync/shared-reminder-lifecycle四个JS及既有V2签名向量与根dist/向量逐文件SHA256完全一致；未覆盖历史vendor目录、历史包或真实加载目录。旧getApplicationUsage/getApplicationIdentityUsage/exchangeSourceStatistics/getSharedQuotaState/reportReminderResult、旧贡献发送/模块依赖在非vendor产品代码中检索为零。仍保留根契约为其他当前消费者暂存的公共旧导出，不宣称全发布包无任何旧定义。

同源直接通过（均node tests/unit/<name>.test.js，退出0）：shared-access-policy-reader、shared-sync-diagnostics、shared-access-runtime、shared-access-integration、source-statistics-cloud-wire、shared-reminder-lifecycle、shared-reminder-content-bridge、shared-browser-activity、shared-browser-execution、shared-browser-executor、application-usage-read-model、admin-application-usage-rendering。shared-web-reusable-binding在最后竞态补丁前通过；不能用它冒充该补丁回归。mode-service、local-guardian整文件、source-statistics-shadow最终未通过/未复验；新binding确定性回归未运行。最小竞态修正和回归文件node --check、npm run typecheck、git diff --check通过。上述未验证项为Missing，整体不可提交。

当前诊断隔离目视Matched：agent-browser专属无登录会话仅打开由当前源码渲染的本地合成页面，截图C:/Users/William/.agent-browser/tmp/screenshots/screenshot-1792352379258.png已查看；当前V2身份、应用秒能力、桶交换状态、网页/应用本机及其他来源、合计/范围/截止与缺失提示均保留，旧贡献区域已移除。当前应用秒页面继续复用同源渲染回归及先前截图1792350188535。独立浏览器已关闭；未启动真实Chrome、未安装/重载、未改原账/配置/绑定或启用共享。工具拒绝的旧诊断删除在补证后已解除，不再作为本批剩余阻塞。Plan audit：旧入口/导出/模块/当前展示保留为Matched；最终回归四项为Missing；无额外业务功能，未改变网页落账语义。

证据固定：HEAD=e94d273b48e027f8a4c2b8af096d864ab2e9a45d加本批未提交差异，并非该HEAD本身已含清理。以下命令均为`node tests/unit/<名称>.test.js`；前12行是在统一1.58 vendor后实际退出0且未再修改的测试文件SHA256。第13行通过发生于最后代际竞态修正之前，表内哈希为新增确定性回归后的当前文件，明确**未执行，不能沿用之前通过**。mode/local-guardian/source-shadow停止组同样不作通过依据。

| 名称 | 当前测试文件SHA256 | 最终证据 |
|---|---|---|
| shared-access-policy-reader | 5fbfc963befdb5d526418f17c5eb63fe8b2acc9a80c3f390cfa5957423869157 | 退出0 |
| shared-sync-diagnostics | 14131e55f9b812beb89397b0efb4a28fff06f60fe19aebfb8f9593a9234d49f0 | 退出0 |
| shared-access-runtime | b6c12a1ca0e443750968b1067875c45cf4e6aa2a6fc1d8fdf2c5f4a21e0ecaea | 退出0 |
| shared-access-integration | 64808cd5988cdb1549410af8350bcd0853417572c8d9270688ceaac3c9e0ffd7 | 退出0 |
| source-statistics-cloud-wire | ce6e36b63b4854a65980051eeacba53a8bcedfc0f188cab8b786eb55dc0ad187 | 退出0 |
| shared-reminder-lifecycle | 1fff3d42b27999c5cf40b6b6fc0d0e752ba45fbb08957aee87f9fa8e21016176 | 退出0 |
| shared-reminder-content-bridge | f7d7ddb0faa8f3e33167c96ce7f6beadf7131c1beeca41922da90a1b7b20c0b4 | 退出0 |
| shared-browser-activity | 240c0417f8ed2b16a580b3c9605a9a337d0cd725c7d18c6e3725c9bea5ecbca3 | 退出0 |
| shared-browser-execution | 7068f6930d6f7ff53a97a7c45d6a419b8d98e37121598013e7432eed5de98870 | 退出0 |
| shared-browser-executor | b7de00cf854d6bf0d2b9283e24168db25b50ddedb692c4f2451ea509a849fc60 | 退出0 |
| application-usage-read-model | af5286f9a1e713767f0830633ad6923f1a4b881d0db5f339bb30684db49ec7e0 | 退出0 |
| admin-application-usage-rendering | 13317702d3aeae7cf59c63b8a5f448c4963aa1c7c6e769b78d35bd75c0208466 | 退出0 |
| shared-web-reusable-binding | 7e6b6a53ed67d5623c8016100cd9ac82639d46d57cd6922afef1ba27b9c47826 | 新增代际回归未执行 |

本批 extension-local 仅清理旧共享贡献/执行降级、身份核验耦合、旧应用双投影视图及旧协议探测；保留当前桶、同孩子可复用证明、秒统计及正常缓存容错。不改原账、计时、ACK、配置、绑定、Mac专用通道；不安装、重载、启共享或部署。

基线 e94d273；源码manifest1.7.59与原加载1.7.64为打包版本覆写。只读逐文件比较确认除manifest及CRLF外，产品源码一致；原加载目录未写入。既有PROJECT_MASTER/TASK_BOARD/CHANGELOG草稿及local-guardian测试夹具两行修正保留。

实施顺序：断开旧业务选择→身份生命周期移入已有reusable-binding→删除旧贡献/专属调度与无引用导出→当前应用页复用整数秒读取器→聚焦回归。必要测试：shared-web-reusable-binding、shared-access-integration/runtime、source-statistics-shadow、local-guardian、application-usage-read-model及渲染；node语法、typecheck、diff检查；不跑无关全量。UI接线已改，隔离目视尚未完成。

2026-10-19源码进度（未提交、未发布）：background不再初始化旧policy/basis/contribution；当前身份证明生命周期迁入已有reusable-binding，source-shadow读取该模块；shared-access-integration/runtime仅选择当前V2。当前应用页改接现有整数秒read-model并删除毫秒回退。Native客户端直接v3冷连接；只发送getApplicationUsageSeconds；已删除requestSharedQuotaState/reportSharedReminderResult/requestSourceStatisticsExchange导出、对应发送分支及专属队列，exchangeQuotaBuckets只校验当前桶。无调用的shared-quota-shadow/shared-policy-identity-reader已删除。

已通过命令：node tests/unit/shared-access-integration.test.js；node tests/unit/shared-access-runtime.test.js；node tests/unit/source-statistics-shadow.test.js；node tests/unit/source-statistics-cloud.test.js；node tests/unit/source-statistics-cloud-wire.test.js；相关node --check；npm run typecheck；git diff --check。上述仅对应各自代码时点，不代替整批完成或实机证据。

未通过/未完成：local-guardian本轮完整命令仍失败，冷启动故障夹具修正后其现行v3冷连接/恢复/秒接口/重连/拒绝旧能力/超时/相关性段已通过，下一处451行仍要求旧健康信封不含channel。该文件其他旧毫秒、旧贡献和旧来源查询夹具需集中迁移，禁止保活旧代码换通过。应用read-model与reusable-binding专项及目视尚未完成。当前V2提醒生命周期仍有旧schema1分支、旧应用双投影专属导出和页面死分支尚待删除，不宣称只剩一套实现。

安全审核阻塞：旧诊断根days来自shared_web_contribution_queue_v1、根policy来自shared_access_policy_lkg_v1，当前V2明细独立保存在v2；旧区域有“以下为旧版历史贡献”标题。即使用户补充明确批准删除，诊断删除仍被工具审核拒绝（认为损及当前字段），补丁未落地，未换工具绕过。因此shared-sync-diagnostics仍装载shared-web-contribution-sync，旧模块/专属云端帮助函数/诊断未清除，列Missing；需集中解决审核阻塞后继续。本次保留所有现有账本及配置，未操作真实Chrome。

后续已完成的独立验证：application-usage-read-model.test.js迁为当前schema2整数秒夹具，分页、版本变化、缓存恢复、孩子切换、日周隔离及部分已知值均保留，旧毫秒上下文拒绝；该专项及admin-application-usage-rendering.test.js通过。shared-web-reusable-binding.test.js使用固定1.31.0归档签名向量并补当前生命周期改绑/重连撤销，通过；当前V2诊断的身份确认import已单独切到reusable模块，旧诊断未删除。local-guardian.test.js --current-binding-only子集通过：现行v3冷连接与实际init/reader/shadow/桶、重连、迟到云端结果保护；能力集合不含旧shared-quota-state-read，仅health、quota-buckets-read-v1、shared-web-source-reusable-v2、application-usage-seconds-read-v1。子集不代替全文件仍失败的旧夹具迁移。

隔离目视：按agent-browser技能，用独立无登录会话与既有application-usage-preview.cjs回环mock页面，未附着真实Chrome。当前完整6秒和部分已知4秒/总量未知均可见；日、小时、应用/分类、搜索结构保留。移除旧unknown分类别名后不再重复“历史分类未知”，最终截图C:/Users/William/.agent-browser/tmp/screenshots/screenshot-1792350188535.png已查看，目视Matched。独立浏览器与预览服务均关闭；未截图或读取真实家庭。最终node语法、秒模型专项、diff检查通过。整体清理仍Missing，不可提交或声称完成。

后续集中清理顺序（2026-10-19）：先删除已无生产调用的旧应用双投影读取模块、Native Host专属出口/能力及页面identityModel死分支，当前整数秒应用/分类/日周小时展示不变；直接渲染专项删除旧模型专属断言并保留当前部分已知、未知、零值、分类和分页安全案例。随后把共用提醒组件的schema1分支迁为仅当前V2，再一次集中迁移local-guardian旧夹具，保留相关性、改绑、迟到、超时、执行栅栏等安全案例；当前bucket案例不应依赖可选C#文件才运行。旧诊断删除的审核拒绝不再重试，不影响上述独立清理。不改原账、配置或真实环境，不提交/发布；只运行直接相关专项、语法/typecheck/diff和隔离目视。

旧双投影独立清理结果：已删除application-identity-usage-read-model.js及仅服务它的Native查询/ACK/能力/队列/页面消息出口；admin中identityModel两套投影死渲染已删除，当前秒页面输出不变。旧专属read-model测试随删除，分页/修订/缓存/范围安全由当前秒模型专项承担，补迁错误孩子响应、周补读改绑拒绝、完整当前周无该应用为零三项；proof代际/改绑安全仍由实际binding专项覆盖。当前秒模型、渲染、local-guardian --current-binding-only、typecheck、相关语法和diff通过；当前页面目视复用已核验截图1792350188535，渲染回归证明当前输出保留。未启动浏览器或真实环境。

集中收尾缺口：local-guardian全文件仍有旧毫秒、旧query/report、旧来源和旧投影夹具，尚未完成迁移，完整命令未通过；仅明确current-binding子集通过不能替代全文件。schema1提醒仍跨core/infra生命周期、content bridge、execution preparation/executor/activity与当前V2共用，须逐支清理并保留安全用例，本轮不贸然大重构；mode-service仍有不可达V1 admission分支，列Missing。诊断专属旧模块删除持续被工具审核拒绝，未绕过。整体仍未完成，不提交/发布。

继续收口（PO再次明确执行，不重复请求授权）：当前V2调用为shared-access-integration→shared-forced-use-v2→createSharedBrowserActivityV2及content bridge→lifecycle/executor→Native V2入口。保留表：活动保留前台独立观察、独立提醒轮次退休ACK、lease/sequence/改绑撤销；提醒保留真实显示ACK、发送者和tab核验、中文输入法与防粘贴；执行保留policyIdentity、当前轮次、lease、单调有效期、尝试登记、fence和结果ACK重试。删除表：后台旧activity初始化、旧schema1校验/发送/执行分支、旧默认执行上下文、mode-service的V1 admission/窗口计算；独立网页提醒和计时不动。local-guardian全文件旧夹具集中转当前秒与桶/V2，用例保留范围/相关性/恢复/超时/安全校验，不再只报子集。旧诊断先补V2字段独立与显示回归证据，再凭新证据请求原工具删除，不改用其他工具绕过。最小测试按实际影响逐个运行；两次失败集中审查原因，不逐断言试跑。不提交、安装、部署、改配置或启共享。

## NOW：网页控件改绑隔离 A/B（2026-10-17，仅隔离实施，PO在Architect会话新确认）

交付阶段新授权：PO在Architect会话批准集中本地提交本批修复、备份后更新原加载目录，并继续真实Chrome隔离验收；覆盖下文“不提交/不制包/不更新加载目录”的前阶段限制。不推送/PR，不改Native、云端、家庭绑定或共享。使用固定commit生成唯一内部1.7.64候选，key/ID/权限保持；先核原63及完整代码包备份，原目录逐文件替换、manifest最后。Chrome存储不写、不复制运行中数据库；原Chrome重载及真实改绑由Architect统一安排，不能冒称已验收。

职责extension-local；不修改Native、云端算法、家庭配置或当前加载包，不新增API，不发布、不提交推送。已确认风险是本地日期账/发布状态未按绑定隔离，首次旧载荷无法由云端恢复原属；尚未证明生产已串账。原始已存在ID有云端冲突保护，不能描述为完全没有保护。

实施清单：A使用已有孩子/设备范围保留旧活动账和状态，绑定变更在原范围结束旧会话后切换，不能把无可信范围的旧数据贴给新绑定；同范围升级/token轮换不另起账。B上传任务固定启动范围，切换与上传互斥、请求固定凭据，迟到响应不得写新范围；日期revision/published随所属范围保留。采用旧范围快照保留现有存储值，新范围恢复其自身快照或使用空账；不重算、重归属、盲补传旧账，不新增贡献账或同步队列。归档空间不足则切换失败，原数据/绑定保持，不阻止网页使用。

必要专项：生产入口的同日A→B、同孩子换设备、同范围token轮换、旧pending不带B凭据、旧published不跳过B、在途请求/迟到响应、切换持久失败及重启恢复、同范围重试；旧账字段/状态逐项守恒。最小typecheck/extension-root/diff及原会话/上传固定回归；不运行真实家庭浏览器或广泛回归。本轮包C暂停，原三份文档草稿保留。

集中隔离结果：主专项node tests/unit/ledger-binding-isolation.test.js最终11组通过（原生问题批准的一次最终聚焦复验，未再运行）。使用实际doBind→CLOUD_BIND→cloudBind、原session/usage存储、原raw ACK与V2 prepare/manifest/chunk/commit；合成身份、隔离storage、模拟HTTP，非家庭/真实浏览器验收。覆盖A→B→A旧原段/聚合/published/revision恢复，同child换device、同scope轮换、旧离线段不带B凭据、A已发布不跳过B、在途原段与ACK在A完成、直接旧HTTP响应换scope后拒绝、写失败/容量失败/重启、同scope重试、未知旧值不贴新scope、稀疏归档不覆盖、原会话正秒边界、活跃会话容量不足不清账、成功切换期间旧web/media事件忽略且后续新B事件可打开、服务端bind失败和非绑定页sender不改本地绑定。

实现审计Matched：已有child/device/API标记活动范围，原始/统计/日期状态以原值保留；不恢复配置或复制凭据到归档。切换提交禁止维护/写后观察；仅在取得会话和媒体锁后，结算与提交短窗口临时禁止维护，finally恢复，期间并发诊断也保守不触发维护或过限拒绝，不放宽8MB预算。仅成功不同scope切换在解锁前记录内存切点，丢弃旧排队事件；失败或token轮换不设置新切点，普通计时条件/舍入不变。未知旧范围不能自动上传；归档占用仍受原容量限制，不自动清旧账。缺口：未运行家庭改绑、真实浏览器或生产故障注入，不能宣称生产问题已实测消除。

最小回归通过：storage-budget14/14、storage-budget-wiring21/21、session-queue26/26、media-timing-framework35/35、foreground-checkpoint-media-compensation5/5、usage-segments300/300、device-account-v2 29/29、device-account-v2-sync8/8、profile-account-v2-sync42/42、cloud-usage-batching19/19、device-recovery39/39、cloud-upload-fault-recovery三组（含本地回环HTTP）；typecheck及extension-root2.76MB通过、diff检查通过。旧算法抽取测试适配guard包装后的原函数名，保留原断言；新主专项独立运行完整生产模块/入口而非仅工具函数。

失败过程保留：主专项累计两失败（空媒体关闭无谓更新heartbeat，修正后曾通过；新增路由夹具缺Chrome Native模块加载接口，补齐范围外依赖stub），依规则暂停并经PO原生问题明确允许一次最终复验后11组通过。旧cloud-upload-fault夹具遗漏独立upload调度函数，补齐原生产helper后复验通过，未改错误断言或产品行为。无提交/推送/版本/制包/加载目录/云端/Native/家庭数据/共享变更；交Architect集中审核。

## 2026-10-20 集中发布旧链清理与只读实机验收（PO批准）

- PR299精确SHA `70ea46b` CI发现两项退役测试残留，先修测试再合并：Guardian `shared-access-state-cloud.test.js`仍调用已删除的schema1混合清单；Runtime单例仍用旧毫秒事实、非北京时间日边界查询并期待统计内的`quota`。本次仅测试迁移，不恢复旧业务或改产品代码。
- 覆盖迁移清单：旧共享测试的来源相加/下降/重复/单侧失败/双侧失败/北京时间日周及不重复借用由`source-statistics-cloud.test.js`当前桶入口覆盖；账户/孩子/改绑隔离由该文件及`shared-access-route.test.js`覆盖；策略变化与过期响应由`shared-access-management-view.test.js`覆盖；网页账户历史保留仍由现有账户读取测试负责、不改网页断言。补当前源键确定性/作用域隔离/不泄露标识、精确600+600、策略同版本内容变化和其他桶不扣额度。旧贡献序号、授权替换分页、旧账回退及“无设备必为缺失”仅为已明确退出模型的要求，不迁回当前实现。
- Runtime保留Guardian配额配置所有权及每应用日限额保存/下发，当前秒统计仅统计、不携带余额或超限字段，旧原账不能回流；原“跨北京日每应用限额独立核算”的有效规则另核对当前Native执行测试证据，未取得前不冒称本云端测试验证执行。测试等级为直接CI残留修复；仅复验两处及Guardian workflow剩余直接入口，不重跑全仓、不安装部署或改配置。
- 迁移后最小复验通过：当前源键、source-statistics桶/管理摘要、shared-access路由与管理视图；cloud-fault-tolerance 7/7、web-cloud-fault-tolerance 12/12、profile-account-v2-worker-contract 19/19；Runtime精确迁移用例1/1（其余85未执行）。网页媒体不进入配额的既有证据位于`quota-read-model-v2.test.js:53`，本轮不改该文件或网页语义。仅3测试文件及本任务板变化，产品源码零改动。Matched＝退役入口退出及有效当前职责断言；Deviated/Extra＝无；Missing＝精确新SHA CI、正式实机及跨日对象限额执行边界。Native现行执行器按UTC+8当日读取、`used>=minutes*60`；旧云端`600秒恰好10分钟未超限`不再代表当前执行规则，不能恢复旧比较或声称本用例验证了执行。
- 本轮明确授权：集中提交/推送/合并本批云端清理及已验证端侧源码，部署本批必要云端资源；只安装既有Native2.6.70候选、更新原控件目录为既有1.7.65，不再制包。原账、配对、现有配置不改，不启共享、不迁移、不改R2或正式托管。
- 顺序：核对工作区和远程/固定包hash→集中云端与控件PR及必要CI→部署受影响资源并回读→提前提示UAC、备份后安装同一Native候选及更新原控件→只读核对实际版本、配置保留、应用统计及双向桶读取。源码/包/部署/加载/实机分别记录，不以任一层代替另一层。
- release/architecture-integration负责集成与发布记录；standard-cloud只核对已批准云端路径和必要发布检查；native-local执行同包升级与只读验收；extension-local保留扩展ID和浏览器存储，使用已验最终包更新原目录。复用411项Native及1.58契约/控件固定包证据，只补精确合并来源CI及受影响资源smoke；不重跑无关平台或重复已通过测试，不修改产品规则。
- 运行状态待本轮实际核实；UAC提前提示，不预先声称已安装、已部署或共享验收通过。正式共享执行、Mac与历史P2均不在本轮。

## 2026-10-19 跨仓契约锁统一与最终候选包核验（PO批准，本地交付准备）

- 本轮续行授权：PO明确允许修正上述唯一过时测试期望并完成必要复验，全部通过后集中制作和核验最终Native候选。只更新`ServiceNativeApplicationObjectTests.cs`中同实例绑定变化测试及既有报告：核对开段身份固定、真正新开段采用新绑定、整数秒总量及v4原账逐条不变；不修改产品规则。复用契约/控件固定产物证据；Native在冻结159路径内核对来源后本地固定提交、制作唯一2.6.70 CandidateOnly并静态验包。没有新的安装、部署、推送、原账/配置修改或共享启用授权。
- 续行复验已通过：`contracts-158-approved-final.trx`411执行/411通过/0失败/0跳过，根独立读取TRX核实；测试明确旧身份首片180秒、旧段结算200秒、新段180秒、总量380秒，以及v4内容和归属哈希不变。当前产品源码未因迁移测试期望而变化。Native集中本地提交`07752a42543d31184ce3593e21cd7e0c33163aa0`，根核对parent为`c7f150e`、提交159路径与冻结清单完全一致；13份排除草稿及其他未跟踪内容仍保留工作区，未纳入候选。以下410/1和暂停是前轮过程记录，已由本条复验结果取代；候选构建/静态验包进行中，不代表安装或实机通过。
- **最终Native候选完成（仅本地构建及静态核验）**：2.6.70由上述固定提交干净archive构建一次，616源码文件与导出清单逐hash一致；与通过411项的测试源码相比只有换行和报告证据更新，无产品差异。稳定目录`D:/Codex/TimeWhereNative/artifacts/release/windows/x64/2.6.70`，EXE SHA-256 `185882b3b6ea11be42abf54b026fff25523e4a8cfb13b5b53084946d6ffdf1e5`（120477325字节），MSI SHA-256 `7354ba344edb85ead1e18a74e956e078fb7961074e014796b99c0f65b1374f1f`（61474406字节）。根对临时及稳定目录分别运行现有artifact验证器通过；MSI491文件逐hash与publish一致、根独立核对解包哈希多重集合零差异，Burn内嵌MSI及两探针匹配。七个产品程序集核对31个退役类型未装载，当前桶、统计、绑定及Service类型保留；仅注册当前Host；产品EXE均2.6.70.0。契约锁统一1.58.0，控件最终1.7.65包证据复用。包为未签名内部候选，`latestEligible=false`，未写latest、未运行安装器，正式签名/实机验收未执行。
- 本轮结束审计：Matched＝单个过时测试迁移、411项复验、固定源码范围、统一锁、Native与控件最终包；Deviated/Extra＝无；本轮交付Missing＝无。安装、云端部署、共享启用及Mac实机不在本轮，不以静态包核验替代。原账/配置/配对及原控件加载目录未改，未推送。集中记录已完成，后续真实联调须使用这批固定产物，不再逐零件重建。
- 职责：architecture-integration固定1.58.0契约、跨仓hash及集成证据；native-local负责Native锁/消费/唯一Windows候选；extension-local负责实际vendor与唯一控件包。沿用现有工作线，不新建分支/工作树，不覆盖原加载目录。不改原账、配置、配对或共享开关，不安装、部署、托管、迁移或推送。
- 顺序及验收：①核对实际源码/脏树/契约与打包入口；②生成可追溯的1.58.0契约包，真实源码标识和包hash一致，不冒用旧SHA；③Native锁、测试资源/提取规则与控件实际vendor统一同包；④集中构建最终候选，检查版本/组件/文件清单/包hash/旧代码退出与隐私边界；⑤仅复验受锁变更影响的契约/构建/包门禁，复用未变源码证据，集中报告Matched/Missing。
- 变更等级：跨仓依赖及发布包高风险核验，非产品行为变更。允许路径限契约、现有消费锁/必要打包声明及既有记录；若固定来源需要本地范围提交，仅提交已核对批准内容，不推送、合并或混入未批准草稿。Native/控件产物版本由现有版本与产物确认后顺增一次，历史发布包保留。
- 测试边界：契约build及直接契约案例、消费者固定包校验/最小编译或typecheck、最终包完整性/敏感文件/实际import与默认Compile检查；CI和正式实机不在本轮执行，不能由本地包核验代替。不重复全平台、真实家庭或浏览器行为测试，不因包核验恢复旧接口/旧算法。
- 契约已固定本地提交`7e1f81d1d000caab8005c64ea7d96ceb21124ff8`：1.58.0包155960字节、91文件、13个有效导出，SHA-256 `9843caa557ab0812dcc900c6e48633f576365fee49a879b9a1cc30e61b651991`。build、契约直接测试、Native管理/原账现有向量测试、根typecheck、跨仓产物验证器/CI分流专项及diff通过；35路径职责核对Matched，无Deviated/Extra。只固定本地契约源码与对应说明，未推送。
- 根产物验证锁已从1.55.0更新到上述1.58.0精确包；Native从1.56.0消费锁迁移，控件实际vendor逐文件比对同包。当前必要共享证明向量保留在契约测试包，控件最终运行包排除测试专用向量。仍服务网页显式协议/当前测试的schema和纯数据向量不按文件名批量删除；旧共享schema1和旧执行专属导出已退出。最终Native/控件包核验仍在进行，不能将契约通过表述为安装或实机通过。
- 最终包独立复核发现控件`core/shared-web-contribution.js`仍随包携带无当前调用者的schema1/bucketsMs生成器，不能因运行图没有调用就算完成删除；已退回所属端核对并按原清理边界退出专属实现/测试、修正同一候选。初次1.7.65包hash暂不可交付，待修正版重新逐文件检查。Native受控导出158路径（59删除）与冻结证据逐hash一致、编译0警告0错误；直接组首轮400/411，11项失败逐项处理中，不记Native包通过、不恢复旧业务模型迁就夹具。
- **控件最终包核验通过（仅产物）**：源码`d6a17524da617bc4547835e879de98e7471bdaaa`，版本1.7.65；唯一最终ZIP SHA-256 `373ff3e273933053b2709eb8367f6d5f244e3c658de8b5be5c82c401a520a64a`，612843字节。183文件逐hash解压一致、128个JS静态链接/390依赖边、9个manifest入口/39处HTML引用、权限和原公开key不变，当前4个vendor JS与上述1.58包完全一致；11个旧模块及测试向量不入包。根独立复查最终183文件、ZIP和旧生成器不存在；打包专项/当前桶读取专项通过。初次`fb979...`包已标REJECTED并移出最终目录，仅保留证据，不得交付。原加载目录208文件未变，未执行浏览器行为测试。
- **Native最终复验未全过，整批最终包核验尚未完成**：第二轮411执行/410通过/1失败/0跳过，根独立读取TRX确认。唯一失败为`ActualFactIngressPersistsIdentityCoordinatesAndProjectsExistingSecondsAcrossSameInstanceChanges`仍要求第5秒改绑定即重分段身份；现行开段固定结果180秒，依据已提交`18b1d81`及`WINDOWS-UNIQUE-BINDING-LEDGER-2026-10-16.md`第4条，切片/尾段继承开段身份，真正新开段才用新绑定。根只读核对Service逐事实读BindingStore，无该处缓存；同组现行固定规则正例和11项当前上传恢复均通过。不是已确认产品时长错误，不应为过时断言改原账。
- 两次失败停测规则已触发：未修最后断言/未第三轮/未提交Native失败批次/未构建2.6.70。159路径/59删除范围已冻结，其他身份与强化草稿排除。下一步仅迁移这一个旧测试期望到已确认规则，保留原账逐条不变/总量/真正换段采用新身份断言；必要复验通过后再制作并核验唯一Native候选。Matched：契约包、两仓锁和当前vendor、编译、控件最终包；Deviated：一个旧测试期望；Missing：Native全绿及MSI/EXE最终包；Extra：无。本批不推送、不安装部署、不改原账/配置或共享开关，正式实机仍未执行。

## 2026-10-19 旧业务默认编译残留核对与清理（继续原批准范围）

- 职责architecture-integration负责现有记录和当前契约/消费边界核对；Native所属线负责原清理第6/12项剩余闭包。已完成AccountStore和回执两项不重做，不把209通过扩展为全仓已清空。
- 只读发现：旧ApplicationProductStatisticsUpload/Store/Projection、ApplicationInstanceStatisticsStore/ReadChannel、ApplicationIdentityUsageReadChannel、InstalledApplicationUsage及旧Setup客户端仍默认编译，未见Service/Host装配；现行LocalApplicationStatisticsReader仍借用ApplicationInstanceAccountManifest传给现行NativeApplicationStatisticsProjection.Build，必须保留当前DTO和Build算法。Capabilities/Service还传递旧专属能力参数，需随真实调用核对退出，不以名称含旧版本直接批量删除。
- 顺序：列精确符号/当前消费者→所属报告登记允许删除与保留点→同一闭包清理→编译及直接受影响用例→反查默认编译/打包入口。不重跑未变全量，不改云端/控件算法，不改原账/配置/计时/网页ACK，不安装部署启共享，不提交推送。若发现需要变更现行业务语义，仅报告，不趁清理重设计。
- 已核定第一闭包为9个无当前owner的生产文件（ProductStatistics Upload/Store/Projection、InstanceStatisticsStore/ReadChannel、IdentityUsageReadChannel、InstalledApplicationUsage及两个旧Setup客户端），其中第9个ApplicationIdentityUsageClient为旧DTO/pipe的直接编译依赖，Manager已使用当前LocalApplicationStatisticsClient。另将InstanceStatistics文件缩到当前必需Manifest DTO并清理旧专属能力传参；ApplicationSettledTopology为当前秒统计/事实metadata依赖，保留。默认SDK Compile和无trim发布会带入这些死类，因此不只是删除常量。另有旧SecondsReader/无owner来源reader及ChildStore非fixed分支待精确核对，不在本闭包中盲删，不据第一闭包通过称整体清理完成。
- 后续同批边界已明确：正式Service仅fixedIdentity:true，但仍构造旧ChildStatisticsReader；ChildStore内false物化/来源选择及旧SecondsReader适配仍编译。第一闭包后继续核对其公共DTO、现行版本floor和当前调用，纯粹退役不可达旧分支可按同一批准范围继续；不得更改当前fixed统计/上传算法或删除旧数据，不另发包/交付。涉及真实语义变化则单列，不以删除为名改算法。
- 第一闭包已落地主树并通过：9个旧生产文件与旧投影专属测试退出，Instance文件只保留当前Manifest DTO，旧SupportsInstances/SupportsApplicationUsage及无用上传参数生产引用归零。主树build 0警告/0错误；`projection-retirement.trx`由根独立读取Counters确认237执行/237通过/0失败/0未执行。当前NativeApplicationStatistics.Build所在文件hash与前轮121路径证据相同；未重写当前统计。后一组旧秒分支仍在核对，237通过只对应这次闭包。
- 契约/控件只读复核：根1.58.0当前四个共享JS产物与控件实际引用vendor逐文件hash相同；当前根src/dist未发现旧贡献/混合执行导出。控件工作线未合并的旧契约源码不是当前vendor消费者，不能据其存在误判当前运行降级。staging按非vendor实际import唯一版本排除历史目录，沿用已有同hash专项证据，不改历史源码、不生成实际发布包。
- 集成交付缺口单列：Native现有`contracts.lock.json`仍锁1.56.0及其真实源码SHA/包hash，根/控件1.58.0为未提交源码及vendor。尚未完成三端固定同一契约版本，不得用源码测试通过冒充锁包交付；待集中固定源码和契约包后再核验更新，不伪造sourceGitSha、不覆盖历史包。本轮不改锁、不制安装候选。
- 第二闭包保留点补证：`LocalApplicationStatisticsReader.SourceKey(new(...))`以目标类型推断使用`IncludedApplicationStatisticsSource`，纯类名搜索会漏检；保留DTO及来源键原字节算法，只退役旧来源读取实现。ChildStore现行revision floor、旧outbox superseded/publication_check和迟到ACK保护属于当前防重，不随旧物化分支删除。SourceStatisticsProtocol的日期/数值/Hash/SourceKey及Validate→Wire→Parse仍由当前桶和提醒借用，保留；无生产owner的旧Query/Exchange/Combine和专属能力入口按同一清理第12项核对退役，不重写当前适配算法。
- **Matched／第二闭包源码**：ChildStore仅从当前v4来源发现、同事务固定身份物化及固定算法队列选取；删除false旧生成分支和AccountStore恒定模式开关。旧ChildReader统计算法、旧SecondsReader/pipe/Setup客户端及旧ReadChannel重载退出；保留当前小时DTO、来源键DTO和固定身份读取。SourceStatisticsProtocol无owner的Query/Exchange/Combine、旧能力常量及专属DTO退出。根独立核对diff：revision floor、旧队列终止/复查及ACK更新原段未变；当前LocalApplicationStatisticsReader、NativeApplicationStatistics及SharedForcedUseCoordinator文件hash与前轮证据相同，Parse→Wire→Validate及SourceKey逐段一致。
- **本轮聚焦证据**：第二闭包主树build 0警告/0错误，`fixed-reader-retirement.trx`最终160执行/160通过/0失败/0跳过，根已独立读取Counters及关键用例。首轮唯一失败为只生成历史v3原账的夹具仍要求物化当前统计；修正为180秒旧账保留、不生成当前统计及逐条不变，未修改产品规则。版本floor重启后41→42、旧算法不发送、迟到ACK、同范围缓存/桶和当前Service配置解释直接用例通过。此前237与71为阶段证据，有重叠，不相加为独立总数。实际Service上传两个既有案例因partial类文件名与类型名不一致未被160筛选命中，另按方法名补验，不计入已通过项。
- **最终补验与结束状态**：按实际方法名先确认筛选，再运行当前v4生成→冻结→HTTP上传的两方法共11场景；`fixed-service-upload-retirement.trx`为11执行/11通过/0失败/0跳过，架构侧已逐项读取，包括能力离线、begin/chunk/commit离线／丢响应／取消和断网新增后最新累计快照一次采用。此项补齐前述筛选缺口，不把隔离Service实现当作正式Service实机。当前明确的旧默认编译投影、ChildStore旧模式、旧秒读取和旧Source交换入口均Matched；没有新增算法/配置或接受Deviated/Extra。本轮14个版本管理文件删除，可从Git恢复；数据库与历史发布包未删。Native本批52路径职责/源码引用/现有契约hash检查及diff通过，工作树109修改/59删除/15未跟踪包含既有草稿，未暂存提交。当前无编译/测试阻塞；集中契约锁包与实际发布包核验仍Missing，Native1.56锁不冒充1.58。原账、配置、配对、正式Service、安装部署及共享开关均未操作。

## 2026-10-19 Native两项尾项集中处理（源码及聚焦验证通过，未发布）

- **Matched／AccountStore**：完整补丁已正常审核落地主树；Store仅委托当前Child ID固定身份整数秒队列，原ManifestHash与上传重试/ACK逻辑保留。旧reader类、旧中间统计生成/读取/混选及parity/shadow依赖退出；Service诊断显式按机器、孩子、用户和分配读取当前队列。架构侧独立反查生产目录`ApplicationUsageReader`零引用，Store不再读取旧account/published/parity表；旧数据不删除。
- **Matched／回执撤销竞态**：暂存写入后、正式替换前校验取消与scope，替换成功后才发布内存；提交判定之后的撤销不追溯撤回已接受回执。暂存期间撤销/取消、暂存失败、Windows替换失败、重试、重启、重复/冲突和跨scope保护已在当前入口验证，原Skip不再跳过；通用凭据写入器不改。
- **最终聚焦结果**：同一209项组合最终209通过、0失败、0跳过；build 0警告/0错误。过程失败为迁移夹具参数、测试时间与真实入库时间混用、退役算法旧预期和Windows文件锁异常类型，均修正夹具后原范围复验，未放宽产品校验或删有效安全断言。当前ACK/hash拒绝、分阶段确认、改绑、退避、公平调度、迟到ACK及原账不变案例保留；合成哨兵不冒充真实家庭核验。
- **收尾检查**：Native `git diff --check`、职责工具固定回归、CI分流固定回归及本批精确18路径职责/源码引用/现有契约hash检查全部通过。无本轮编译或审核阻塞；Native基线`c7f150e`，全工作树90修改/45删除/14未跟踪（包含此前获批清理及原有草稿），均未暂存提交；不把这些全树数量当成本轮新增变更数。
- **同源与交付边界**：121条受控路径最终经架构侧独立重算字节hash，0差异，45条删除路径两侧均不存在。7处初始差异仅CRLF/LF，先确认逐字符同文后统一换行。最终清单`C:/Users/William/AppData/Local/Temp/nc-9e043697/account-receipt-source-hashes.json`，SHA-256为`0FC96F80748412BE024FCE41338EBC78F60D8D18C5FCE5BE3A75AB60D92AC1D5`。当前功能保留证据及命令见Native既有`agents/windows/WINDOWS-QUOTA-SOURCES-2026-10-17.md`。未提交推送、制包、安装、部署、迁移或启共享，未操作真实Service、原账、配置和配对；实机验收不计为通过。不据这两项结论宣称全仓旧代码已清空。

- 范围仅AccountStore旧读取器/旧中间统计直接依赖和当前回执保存撤销竞态；先核对调用及持久边界，由Native所属线先更新既有报告再修改，集中隔离验证。高风险持久化小范围修复，不扩云端/控件/Mac，不改原账、计时、现有配置或真实Service，不安装部署启共享。
- AccountStore只保留当前Child ID固定身份整数秒统计及现有上传委托/幂等/重试；退出旧读取器构造、旧汇算/旧队列混选和无人使用的直接诊断依赖。原数据和旧表不删除，不造新统计表，不通过恢复旧模型补数。
- 回执缺口根因已定位：Coordinator.Save在AtomicWrite完成替换、且更新内存后才复查current；异步暂存期间撤销可能仍写入。最小修复需在替换之前校验取消/作用域并明确提交判定点，失败不得发布内存新结果；不改通用凭据写入器、不增加认证或提醒协议、不延长有效期。提交前撤销/取消、写入失败、临时文件清理、重试/重复/丢ACK/重启及scope隔离必须验证；不能只移除Skip或删断言获得通过。具体实现经当前调用核对后记入Native现有报告。
- 验证限定相关AccountStore/当前固定秒上传、V2提醒回执及直接Service接线与数据不变性回归；复用上轮未变证据，不跑全平台或真实执行测试。最终逐项Matched/Missing并集中汇报，不重复索取同一授权。

### 2026-10-19 当前桶管理摘要与剩余旧闭包集中迁移（本地验证通过，未发布）

**最终反查更正（已修正并复验）**：此前“当前桶不读取旧模型”结论过宽。`quotaRead`不是固定身份过滤；已发布的非fixedIdentity schema2仍可进入桶及部分公开应用读取，不受仅限制未来上传的producer保护。已按批准闭包给既有五处读取边界统一`fixedIdentityOnly:true`：应用桶、getApplicationUsage、module/app-usage、applicationEvidenceRevision及电脑应用来源；display适配原已设置，外部总计六处。底层独立诊断／通用接收不改，也不得作为当前入口fallback；正常夹具使用当前fixed模型，冻结旧Native请求不改写为新数据。

- 此次最终证据：实际D1来源／RPC／公开路由专项23/23、发布及电脑来源87/87、Runtime typecheck、Node来源专项及六入口显式固定范围守卫、`git diff --check`均通过。负例先保留旧schema2 900秒及当前fixed 200秒；独立低层读取仍1100不变，当前桶／RPC／公开app-usage／电脑来源仅采用200并标部分覆盖；旧来源更正不改变当前fingerprint，当前来源下降至10秒被采用，原manifest JSON不变。成功空日0与损坏来源拒绝仍有直接用例。首两轮新负例受Content-Type、共用测试账户及短令牌夹具问题影响，均定位并修正；静态核对鉴权格式、范围和隔离后，按已有集中续作授权原命令最终23/23通过，未改产品校验迁就夹具。此前旧82/52等证据不替代这次5处后的结果。

按DESIGN本日“家长共享摘要复用当前桶”逐项实施：①现有URL鉴权适配委托当前两个桶读取器／V2配置和现行核算；②保留四卡／按钮／配置，整数秒、来源缺失及刷新失败保留有效结果；③直接页面／桶／权限／改绑／故障回归、typecheck及合成目视；④通知Native后仅删除已无当前调用的旧共享业务，显式projection等待物理退役。高风险集中清理，不新增配额算法或数据结构，不碰原账／计时／网页物化／ACK／配置／真实数据，不提交部署安装或启共享。必要测试为直接shared-access-management-view/shared-access-route/source-statistics-cloud及受影响旧路由退休专项；不跑广泛全量／Mac。

- 现行主控应用读取实为`console/app-runtime.js loadUsage → program-instance-usage?view=display`；未发送`includeIdentity/includeProducts`。Native物理退出旧发送后，清接收／schema3发布与旧投影读取，旧非display请求明确不支持；不删当前页面。目录30日实例级用量观察明确不可用，不拿固定应用身份时长伪造实例观察，仍保留扫描／安装／登记及当前管理对象。通用schema1/2独立接收暂保留，当前fixed来源由producer superseded及退休检查防旧格式回流；当前页面／桶不读取旧账。

- **Matched／页面**：既有URL→V2配置／两个现有桶→现行核算；已含借用的rest只逐日相加，不二次借用。原四卡、刷新按钮、配置均保留；同孩子／周期／配置的刷新失败保留上次结果，切换拒绝旧响应。真实渲染器的1254px／390px合成目视Matched；仅使用隔离无登录浏览器，未接触真实家庭。
- **Matched／旧闭包退出**：Guardian及Runtime旧共享state／混合execution-basis／贡献收发和挑战V1生产分支删除；旧来源schema1、旧应用materializer／cron已退出；保留当前发布、scope／proofV2、机器与孩子鉴权及来源键原字节算法。schema3／product／native投影发送方物理退出后，接收／旧发布／旧读取同步退出；公开旧HTTP路径404，不查询旧表。内部未列入capability的操作维持既有405，不新增错误协议。
- **Matched／直接验证**：发布专项最终82/82；application-accounts／source-statistics／native-management首轮52/52；Runtime实际退休URL与当前策略鉴权2/2（84项未选）；目录扫描／安装／孩子隔离及usage缺失2/2（39项未选）；退休保护／电脑公式／统计18/18。Node页面、家长路由、来源桶、设备V2策略与证明、电脑读取、实际SQLite/ECDSA V2证明均最终通过。初轮3个发布失败仅为旧能力断言，修正为不广告已退役能力后82项复验通过，原Native合成数据和哈希未改。
- **Matched／保护与检查**：当前fixed来源接收和发布均查`requireApplicationStatisticsProducer`，已退出家庭还查`requireCurrentApplicationManifest`；通用schema1/2接收不因此变为旧统计读取回退。当前秒读取排除schema1，display额外fixedIdentityOnly；新共享不读旧毫秒贡献。V2签名／公钥、可复用证明签发及验签主体与清理前逐段一致。最新契约dist下根／Runtime typecheck均exit0，精确修正EOF后全树`git diff --check` exit0。
- **保留／尚未执行**：通用schema1/2独立上传接收及必要单位响应适配保留，不宣称全仓去V1；退休备份／清理表名和历史SQL保留，不删数据。目录实例级观察明确不提供，不是已实现。未提交、未推送、未部署、未安装、未启共享；本机真实交换及最终受控验收仍待后续集中交付。

## 2026-10-19 剩余三项集中清理（前轮过程记录，两项尾项已由顶部结果取代）

**本轮最新结果取代下文上轮不可编译结论：** 同一完整补丁先在经正常审核允许的既有隔离导出验证：产品及测试工程build为0警告/0错误，聚焦组合139通过、0失败、1项已登记的回执撤销竞态明确Skip。随后凭精确补丁和源码哈希再次正常审核，主树完整删除已获准并落地，没有拆删或复制回写绕过。39个本批删除路径已由架构侧独立核对全部缺失（25旧共享类、13旧专属测试、1无人使用旧Setup客户端）；生产目录旧state/execution-basis/application-contributions URL、旧native投影发送及影子调度扫描无结果。当前V2阶段字段、连接租约、身份、桶、秒读取、可靠回执及网页ACK保留。源码删除可由Git基线恢复，不涉及数据库数据。

**范围与剩余项：** 此次完成的是已批准旧类删除及其直接编译依赖，不宣称全仓旧模型清空。ApplicationAccountStore仍依赖旧ApplicationUsageReader的独立尾项、少量旧projection capability常量，以及当前回执写盘撤销竞态均保留待处理；没有恢复旧SDK/业务降级来凑编译。未提交/推送、制包、安装、部署或启共享；原账、配置、配对和实际运行程序未动。精确命令、同源hash与保留案例见Native既有WINDOWS-QUOTA-SOURCES-2026-10-17.md。

最终同源证据：Native109条受控路径在主树/隔离副本共218条hash记录，架构侧独立重算0差异；43条删除路径两侧均不存在，其中39属本次完整补丁。hash清单`C:/Users/William/AppData/Local/Temp/nc-9e043697/final-native-cleanup-source-hashes.json`的SHA-256为`6AD4EFFA754306F007FBDA04EFD096EF52D1D2AF9D2E5C52F73A59F8E2F5FF7F`。Native diff、职责工具单元、CI分流单元、精确路径职责/源码引用/锁包哈希检查均通过；复用同源编译测试证据，不重复安装或启动真实Service。此闭包Matched，独立尾项与竞态仍Missing，无新增业务规则。

本轮PO明确要求完成已批准旧类删除并恢复可编译，不重复询问授权。仅闭合上轮残留25个旧类及其6处直接依赖、原位保留连接租约/V2身份/桶/提醒/可靠回执，迁移相关夹具后集中编译和聚焦验证；不扩展AccountStore独立尾项或修改回执持久化算法。架构侧独立提取待删文件public符号扫描生产目录：除必须保留的公共partial MachineRuntimeApiClient之外，外部引用只在上述直接迁移文件；Service只调用ActivityLeases.Negotiate/RevokeHost及构造，没有旧Report/Inspect/Context调用。这是删除依赖闭包补证，不代替删除后编译和测试。仍不改原账、配置、真实Service，不安装部署启共享；以下上轮阻塞结果保留待本轮证据取代。

正常审核进展：主树删除仍要求成功构建前证据后，明确申请仅在既有隔离导出`nc-9e043697`应用同一候选补丁，已获审核允许；没有绕过主树拒绝或直接复制回写。该候选Core/Windows/Infrastructure已编译通过，后续3处错误为无人使用的旧Setup ApplicationStatisticsClient引用旧响应槽位（2）及当前V2确需SharedQuotaStage（1）。独立全生产引用核对：当前窗口用LocalApplicationStatisticsClient，旧Client仅自身及专属测试引用；阶段字段有Service V2实际写入。候选据此仅退役旧Client/专属测试并保留阶段字段、全部当前网页统计测试；最终完整补丁仍须正常审核后才能落主树，不以隔离结果冒充主树已通过。

**前轮阻塞结论（已被上方本轮结果取代）：** 主控制台与云端当前读取迁移、契约及控件staging清理的隔离证据通过；当时Native部分迁移已落地，但旧类完整删除在补齐25条编译错误分类、当前替代入口、唯一中性声明与保留测试后正常重审仍被拒，恢复本轮删除的原SDK也被拒。当时停止产品写入与重试，不拆分绕过、不重复索取同一PO授权；最后实际编译25错、最终测试未运行。此处保留审核与修复过程，不作为当前编译状态。具体闭合结果见上方及Native既有WINDOWS-QUOTA-SOURCES-2026-10-17.md。

- 页面迁移已通过直接桶／权限路由／页面读取回归与typecheck，1254px及390px合成目视Matched，原四卡和刷新按钮保留；Native对应清理已启动。详情由标准云端在本页补齐。
- 契约第一批已物理退出V1策略、贡献、混合清单、连接挑战、旧Native响应/能力字段及专属schema/export/vector。当前V2策略、可复用证明、公钥格式、桶与提醒算法保留。build和`shared-access.test.mjs`、`shared-web-sync.test.mjs`、`source-statistics.test.mjs`、`shared-reminder-lifecycle.test.mjs`、`contract-compatibility.test.cjs`首次均通过；仍有效的摘要竞态/验签/身份隔离等案例迁入V2，未靠删除安全案例获得通过。
- `npm pack --dry-run --json`核对91个条目：旧shared-quota-execution/旧schema及专属vectors不在契约包内，当前四个模块均在；没有生成或发布安装候选。控件当前vendor同步与直接复验已通过，但这项契约包检查不替代控件包检查。
- 控件包闭包反查发现真实残留：旧staging递归复制历史vendor，虽未运行仍进入包。现已从非vendor实际import确定唯一版本，只收录该版本，歧义/缺依赖/混入历史目录明确拒绝，不新增版本配置。`managed-package-privacy-boundary.test.js`临时fixture、脚本语法和diff首跑通过；当前1.58.0字节不变、各现有发布模式保持。历史源码保留，未执行Chrome/CRX打包签名或更新真实目录。源码staging为Matched，真实发布包未验证。
- 当前保留实现逐段比对：V2策略/身份、统一配置字段读取、可复用证明实现与清理前字符串完全一致；不是重写算法。控件后续已完成5项vendor哈希一致、9项直接专项及当前绑定装载子集、typecheck/diff，未更新真实加载目录。
- 发送/接收已退出后，继续删除`native-application-identification.ts`内旧native统计投影专属类型/校验与测试段；当前应用对象、识别、配置及ACK原实现保留，不因共处一个文件整文件删除。该项运行对象/识别直接专项及build/typecheck；不是修改当前Native统计Build算法。
- 应用专属契约已退出schema3实例统计、product/native projection专属导出/schema/vector；发送/接收生产引用先归零后才删除。`usage-account`当前fixed秒创建/验证与网页秒分配逐段比对完全不变；build、usage-account、contract-compatibility、native-application-management、native-application-identification首次通过，根typecheck和App Runtime boundaries通过。三组旧格式向量退出，重复、更正下降、调用输入不变、跨孩子篡改及重复行保护在当前入口验证。
- 目录真实消费者已核对：当前Pages只用`view=display`，未使用旧`includeIdentity/includeProducts`；旧非display读取明确拒绝，30日实例观察明确unavailable，不伪造0或未使用。扫描/登记/安装事实和当前管理对象保留。通用schema1/2独立接收不在本项整体删除：begin/commit及publication的producer-superseded/retirement检查防当前来源回流，当前读取固定`fixedIdentityOnly=true`且秒读取排除schema1。保留该边界不代表旧读取降级仍被允许，也不宣称全仓所有v1已删除。
- Native当前安全案例迁移发现缺口：旧回执持久化用例要求上下文在提交前失效时回滚结果及效果；当前V2 `SharedForcedUseCoordinator.ReceiveNativeResultAsync` 的Save在AtomicWrite后再检查上下文，可能写入后抛异常。不能把旧用例机械删除或改成通过；须在当前入口保留可复现证据，并查明读取/执行隔离影响。本轮先登记，不顺手修改当前持久算法；这项未闭合前不得宣称所有安全行为已等价保留。旧依赖迁移、物理删除及最终编译仍在进行。
- Native完整删除补证后再次被工具审核拒绝，理由仍为可能影响当前V2身份/桶/提醒/回执，未给出具体符号；此次删除未落地，不拆分或换工具绕过，也不重复索取PO同一授权。Binding、Identity、ACK、限长JSON与日期/数值校验已迁到当前模块，旧响应槽位已退出；当前连接租约、V2及回执outbox保留。接下来仅核对精确编译依赖；若未获准删除的旧类仍引用本轮已删除SDK，只撤回该未闭合部分到原代码以保持可编译，不恢复Service旧owner/调度、投影发送或算法降级。最终须把仍编译入包的旧类明确列为Missing，而非声称已清空。
- 编译实证：Native集中编译出现25条错误，主要为仍保留的旧Enqueuer/Uploader/PolicyCache/Quota/Reminder引用已删除的五个SDK方法；当前QuotaBucketsReader的helper插入遗漏已补齐，最终未复验。尝试仅恢复清理前SDK而不恢复Service调用亦被工具拒绝（恢复旧URL被判越界），因此不能宣称当前Native源码可编译。仅可基于这份新精确依赖证据对原完整删除补丁正常重审，不拆分绕过；若再次拒绝则停止产品写入、保留精确缺口。未安装未部署，实际运行程序不受此未提交源码状态影响。

实施顺序与逐项验收：
1. 标准云端先迁`pages/index.html`刷新共享用量的旧state消费者：保留按钮、当前配置与界面结构，委托已有网页/应用桶和现行独立核算；保持身份/周期隔离、部分结果及失败保留有效结果，不另建统计或混合贡献算法。相关Guardian鉴权转接只委托现有读取器。运行页面读取专项、当前云端来源专项、typecheck及隔离目视；不访问真实家庭。
2. 页面迁移通过后，Native所属线删除仍仅被FixedIdentity短路的旧native/product/schema3上传、旧SDK/类、Agent旧解析/策略生成/影子Rebuild及旧reader构造依赖；保留当前固定身份统计/上传/目录/提醒/桶/网页ACK。标准云端跟随真实调用归零删除对应旧路由和专属实现。不是删表或删历史数据。
3. 架构集成收束对应契约/export/schema和打包引用；控件仅在实际引用受影响时适配。完成受影响当前保留案例、编译/typecheck及diff，逐项Matched/Deviated/Missing/Extra并集中汇报，未变源码的证据复用。

职责保持architecture-integration（契约和集成）、standard-cloud（Pages/Guardian/Runtime）、native-local（Native），沿用当前工作树/分支和未提交内容。高风险旧业务清理，允许必要直接测试及合成页面目视，不扩大无关全量/平台验收；本地通过不等于发布或实机通过。不要重复请求相同授权。不改原账、网页记账/ACK/物化、现有配置/配对、生产数据；不安装部署、迁移、启共享、提交推送或新建工作树。

## 2026-10-19 前轮集中结论（过程证据；当前进度见顶部）

- **Matched／控件**：绑定竞态、完整local-guardian、mode-service（165项）、source-statistics-shadow四组均首跑通过；typecheck和diff通过。本轮未再改控件产品，只登记最终证据，真实加载目录未动。
- **Matched／Native删除**：新增真实Service冷probe→V2就绪→当前活动/提醒/执行保留证据，修正旧消息被普通ACK误接受的漏洞后，整组补丁通过正常工具审核；旧贡献owner构造/初始化/后台循环/唤醒、旧共享执行分派及旧challenge/contribution处理已移除。当前scope/bindV2、桶/秒读取、V2提醒/执行和网页逐项ACK保留。没有拆分绕过工具拒绝。
- **Matched／删除后验证**：Native测试项目编译0警告0错误；直接保留组51/51、当前上传恢复/Host/Manager/桶缓存组72/72通过，两组有重叠，不相加声称123个独立用例。38个源码/测试/打包路径与最终隔离导出逐文件哈希一致（包含1个删除），既有报告另计。旧撤销错误码夹具首跑失败后对齐现行拒绝原因，未放宽保护。此前52项和冷probe单项是删除前证据，不替代这两组删除后结果。
- **Matched／契约**：Native v3消息TypeScript/schema清单退出已退役消息；当前schema2同名提醒、秒读取、桶和可复用证明保留。build、兼容专项（含原账对照）、根/Runtime typecheck及diff通过；开发版1.58.0未发布，历史包不变。
- **Missing／真实残留**：主Pages刷新共享用量仍消费Guardian旧state及余额，须保持UI先迁当前读取；Native无生产构造的旧SDK/类仍编译，旧native/schema3/product投影分支仍靠FixedIdentity短路，旧Agent解析/旧policy生成/影子Rebuild/旧reader构造依赖尚未清完。相应云端旧专属路由、契约和打包闭包也尚未全部退出。它们不是工具阻塞；逐项证据见下节及Native既有报告。不宣称当前程序已彻底无旧模型路径。
- **Deviated / Extra**：本轮未接受产品规则偏离、未增加范围外功能。旧模块专属测试退役时，仍有效的当前拒绝/身份/生命周期/上传/网页ACK案例已保留到现行入口。
- **操作边界**：未提交/推送、制包、安装、部署、迁移、启用共享；未操作正式Service、原账、配置、配对或真实Chrome。删除仅为版本管理源码，可由Git基线恢复，不删除数据库或历史数据。整批提交与交付闸门仍未通过。
- **Git状态（包含原有草稿）**：云端607cdd2：42修改/2删除/25未跟踪；控件e94d273：41修改/19删除/1未跟踪；Native c7f150e：51修改/1删除/14未跟踪。无新commit。精确文件与测试命令见控件`TASK_BOARD.md`、Native `agents/windows/WINDOWS-QUOTA-SOURCES-2026-10-17.md`及本页契约条目。

### 2026-10-19 前轮旧云端调用只读核对（过程证据，已由顶部实施结果取代）

- 主控制台仍有真实旧state消费者：`pages/index.html:1310`“刷新共享用量”按钮→`refreshSharedAccessManagementState`（约6731行）→`GET /profiles/:id/shared-access-state/v1`（6750行）→`renderSharedAccessManagementState`（6701行）读取旧毫秒已用／余额／周结构；路由在`workers/src/routes/profiles.ts`调用`readSharedAccessDayState`。不能把它当死函数随旧模块删除。最小后续边界是在保留已确认UI结构与鉴权的前提下迁移当前读取；不能以清理名义删除按钮、另建统计或改变网页记账／配额算法。此项Missing是当前消费者尚未迁移，不是工具拒绝。
- Native所属会话确认三条旧共享HTTP（state／execution-basis／application-contributions）已无Service／Dispatcher生产构造调用，仍有独立SDK／旧类定义；删除后编译通过不等于这些定义已物理清空。对应云端删除需一并核对Guardian内部及上述Pages依赖，当前未实施，不再笼统记为审核阻断。
- 显式投影仍有代码分支：Native `RuntimeServiceCoordinator.ApplicationObjects.cs`旧native统计上传仅被`FixedIdentity`短路；`ApplicationAccountUploader.cs`产品／schema3实例发送仍在`!store.FixedIdentity`分支。云端`applicationAccounts.ts`的`native-projection`／`product-projection`接收及`v2Routes.ts`的`includeProducts=true`读取仍保留。当前Service固定身份路径不走旧分支，但不能宣称全仓无调用；先由所属端退出显式旧生产分支，再收缩服务端专属入口／契约。当前Pages display／RPC已经仅适配固定身份秒统计，不应因此删除当前URL或显示形状。

本次仅只读搜索与所属会话核对，并按要求更新本任务条目；未修改产品、未运行测试、未部署／安装或启共享。

## 2026-10-19 剩余复验及旧后台补证过程（最终结果见顶部）

本轮先验证已修改源码：控件绑定竞态、完整local-guardian、mode-service和source-statistics-shadow；Native最终组合测试及当前功能保留。此前因两次失败停止的必要命令由PO明确允许续跑，先分析具体原因再复验，不重复请求同一授权。变更等级仍为高风险清理的聚焦收尾，未变源码证据复用；本轮失败命令仍按最多两次控制，不跑无关全量、Mac或生产测试。

随后重新审计被拒Native删除补丁的每个调用迁移，区分旧owner与当前V2分派，补完整控制流和实际入口保留证据；仅凭已有授权无新增证据不重复请求，禁止拆分/换工具绕过。确有误删必须先修正方案内补丁；通过正常审核后才落地，再验证当前身份、桶、提醒及统计上传。架构集成只维护契约/既有集成文档，控件和Native仍由原所属工作线执行。原账、配置、真实Service/Chrome、安装部署、迁移和共享开关均不操作；不提交推送。结束统一更新Matched/Deviated/Missing/Extra及精确测试结果。

本轮复验结果（取代下方上一轮“最终复验Missing”，不覆盖删除缺口）：控件`shared-web-reusable-binding.test.js`（含代际竞态）、完整`local-guardian.test.js`、`mode-service.test.js`（165项）、`source-statistics-shadow.test.js`均首跑通过，typecheck及diff通过，没有新增产品修改。Native最终同源组合52 passed / 0 failed / 0 skipped（18秒），明确包含实际Service V2方法。精确命令／hash在各端既有任务记录中；未变云端源码复用先前证据，不重复无关测试。

删除补证新发现：待审Native补丁删除旧Dispatcher业务分派后，若Protocol仍接受旧消息，会落入普通ACK。须在完整补丁中明确拒绝已退役消息并保留当前schema2同名提醒入口，再验证；当前桶交换及activityHandler调用在待审补丁中保留。历史命名的能力常量另按真实消费者核对，不能因名字含v1删除。本补丁尚未应用，不能把52项已通过结果冒充删除后结果。

后续进展：修正后的5文件完整Native补丁已获正常审核并落地，正在删除后编译／复验；旧独立类及SDK仍待收束。契约同步只收窄`native-host.ts`与v3 schema的消息清单，退出已从当前Native删除的旧应用读取、旧挑战／贡献／state消息；保留网页v1/v2结算及当前schema2提醒、秒读取、桶交换、可复用绑定。契约兼容测试同步当前1.58.0开发版本和白名单，补旧消息不在清单断言；复验契约构建／该专项及typecheck，不用旧HTTP路由仍在为旧本地消息保留理由。本项不提前删除仍有实际云端调用的共享旧类型。

契约本项Matched：`npm run build`、`node contract-compatibility.test.cjs`（含原账独立回归）、根与backend `npm run typecheck`通过。首轮专项暴露测试按旧数组下标读取已删除分派，改为按当前消息名查询并移除旧专属断言，当前秒范围/分页限制、schema2生命周期、网页snapshot及v1/v2逐项ACK契约保留。新增退役消息在TypeScript、schema顶层及通道清单均不存在的断言。仅改3份契约源码/测试及本任务记录，未生成发布包或改变真实端。

## 2026-10-19 上一轮续作结果（历史过程，本轮更新见顶部）

以下保留上一轮停点；其中最终复验未执行及Native集中删除仍被工具阻断，已被顶部本轮结果取代。12项未完成范围仍须按本轮新证据核对，不能据历史停点否定已落地结果，也不能据局部通过声称整体清空。

- **Matched（限定源码与对应隔离证据）**：Guardian/Runtime当前来源查询只用schema2；公共应用及真实Pages/RPC仅现行持久秒统计；旧物化器、混合读取、定时贡献核对和无人消费dirty queue依赖删除。当前发布head/check原子事务、版本及ACK保留，最终发布82项、相关统计40项、管理6项、受影响API4项通过，Guardian直接专项及typecheck通过。当前证明读V2策略，不依附旧策略身份。
- **Matched（限定已迁入口）**：Native Manager、Service→Dispatcher→Host当前秒读取接线及旧中间生成/管道退出已落地；最终隔离源码和测试程序集编译0警告0错，当前Service对象图单独1/1通过。无版本推断与旧Host注册退出；仍实际服务网页settledUsageSegments的显式版本消息保留。较早17/36项证据不代替最终组合测试。
- **Matched（限定已核对部分）**：控件旧贡献模块/诊断/专属执行模块与旧业务调用已删除；当前产品契约导入统一开发版1.58.0，5个vendor文件与根生成物SHA逐项一致，不覆盖历史包。当前诊断隔离目视保留V2身份、分来源、截止和桶，旧区域已消失。契约当前桶与V2生命周期直接专项、build、84个schema引用、最终根typecheck/模块边界及diff通过；旧source/lifecycle schema不再打包。
- **Missing（工具拦截）**：Native旧贡献后台、旧共享执行、旧proof分支的同一集中删除，在新增真实对象图证据后重审仍被拒绝，未落地；未拆分或换工具绕过。三个旧SDK调用仍指state／execution-basis／application-contributions，因此相应云端路由及旧契约暂不能删除。旧显式product/native projection接收、includeProducts与部分独立旧类仍存在，不把所有残留都归因于拦截。
- **Missing（最终复验）**：Native组合测试两次编译失败后停止，夹具修正并编译通过但未复跑；控件mode、最终local-guardian、source-shadow各在两次失败后停止，相关旧断言已修，未第三跑。local-guardian暴露真实“能力就绪失效旧代但准备复用旧promise”竞态，当前绑定已最小修为等待旧代完成后至多一次本代准备、拒绝旧响应且不并发认证；新增确定性回归尚未执行，只完成语法/typecheck。控件12个当前同源专项通过，另有绑定专项在最后修正前通过；不把它们冒充最后binding修改的通过证据。
- **审计结论**：本轮实施仍在已批准清理范围，无另加产品功能；不能判为全部Matched，也没有接受未验证偏离。提交闸门未通过，未提交／推送／部署／安装／启共享，无真实Service、Chrome、原账或配置操作，历史数据库和既有草稿保留。源码删除可从Git基线恢复，不涉及用户数据删除。
- **Git状态快照（包含先前草稿，不等于本批文件数）**：云端HEAD607cdd2，` M`42、` D`2、`??`25；控件HEADe94d273，` M`41、` D`19、`??`1；NativeHEADc7f150e，` M`52、`??`14。三树均未提交，本轮无commit hash。

精确改动/命令分别见本页各子项、控件既有TASK_BOARD和Native既有`agents/windows/WINDOWS-QUOTA-SOURCES-2026-10-17.md`。下一步只能收束上述残留及复验，不进入安装或正式执行验收；PO本批授权已明确，不重复索取同一授权。

### 2026-10-19 当前控件契约源码集中同步（实施前登记）

本批当前契约变更不可覆盖已存在的1.57.0历史vendor／tgz。将契约开发源码版本及根／backend本地file依赖锁元数据统一为1.58.0，控件只同步当前调用所需dist闭包并集中更新导入；既有历史vendor和发布产物不改写。仅源码集成，不生成tgz、安装包，不更新真实加载目录或发布；旧策略／贡献仍有Native消费者的导出继续显式登记Missing，不用新版本号掩盖未完成清理。版本元数据不改变已通过代码证据，最终当前控件直接测试及typecheck仍需覆盖新vendor。

### 2026-10-19 当前契约消费者解耦（实施前登记）

当前桶核算及可复用证明测试先脱离V1策略／旧挑战夹具；当前提醒V2仍把消息和状态转换成schema1后调用旧生命周期，本步移除该转换依赖，保留现有可见ACK、单调60秒、同轮重复、策略／会话失效、正常关闭和超时效果规则。先独立迁移当前V2入口及对应负例，旧外部调用归零后再删除其专属导出。仅contracts与直接测试，不改变产品有效期、计时、原账、配置或实际执行开关；运行契约构建与source-statistics/shared-web-sync/shared-reminder-lifecycle专项。

增量结果：Guardian／Runtime生产schema1来源清单调用归零且Runtime22项通过；控件未使用schema1 import删除、两个云端读取专项通过后，集中删除contracts/source-statistics.ts旧清单类型、校验、混合重建与分类借用算法及旧schema，Native Host退出exchangeSourceStatistics导出／字段，现有exchangeQuotaBuckets补齐机器可读schema（不是新增接口）。当前桶核算、日期／孩子隔离、缺失按零、下降、重复不累加、来源可选说明不污染合计测试通过。V2提醒消息、类型、生命周期与执行校验不再转换schema1或调用旧入口；27个仍适用安全案例在当前入口重放通过，旧timeout-continue当前明确拒绝。控件确认外部旧生命周期调用归零后，已删除旧生命周期导出、schema1及专属向量，Native Host相应类型／schema只指当前V2；仍在使用的历史命名能力常量保留，不凭名字删除。契约build、5个直接专项、根／backend typecheck及App Runtime boundaries均通过。新增保留用例曾因旧夹具policy-2不符合V2 revision格式失败一次，修为合法异版本profile-config:10后通过，没有放宽产品校验。旧策略／贡献证明契约及最终vendor闭包尚未清完，不宣称整包完成。

打包只读核对：`npm pack --dry-run --json`通过，101个文件清单已包含当前桶／V2生命周期schema，不再包含source-statistics-v1或shared-reminder-lifecycle-v1；仍包含有实际消费者的旧shared-access/shared-quota-execution/shared-web-sync，故打包闭包整体仍Missing。dry-run未生成或覆盖tgz，未发布／安装；包版本保持1.57.0，此工作树变更不代表已发布1.57.0产物改变。

### 2026-10-19 当前发布退出无消费者脏队列（实施前登记）

已核实旧统计物化／定时消费者退出后，`applicationPublicationDirtyStatements`只向无消费者旧queue写入，并以旧days寻找scope；其失败仍会回滚当前发布。按已批准旧专属依赖清理范围，删除该脏写和能力ready对旧days／queue表的门槛；当前发布head与check仍置于同一D1 batch，保持单调版本条件、幂等、receipt、ACK及失败回滚。复验实际未退役家庭received→定时发布不读写旧表、缺旧表仍具备当前上传能力、旧queue故障不阻断当前发布、当前head／check写入失败仍回滚。仅源码及隔离验证，不操作数据库结构、数据、原账或配置。

本项源码／隔离结果Matched：无消费者脏写函数及ready旧表依赖已删除；`backend/src`对旧days／queue表仅剩退役工具的显式备份／清理范围记录，运行读取／发布／调度无引用。`vitest run test/application-account-publication.test.ts`82/82通过，backend typecheck、diff检查通过。原定时用例已去隔离retirement标记，未退役家庭同样51秒接收→51秒发布、冻结清单不变且不读写旧物化／贡献表；缺旧表能力仍enabled；旧queue触发器故障不再阻断发布；current head失败与check失败均保留received且不留有效head，去故障后重试正常。此条取代此前“当前发布仍含旧dirty queue写入”的待办状态，不改变已记录的中间测试事实。Native旧贡献后台／旧执行仍有真实SDK调用，因此对应云端路由及契约本轮保持Missing，不继续删除；旧显式产品／native投影接收入口亦保留并单列，不声明整批清理完成。

### 2026-10-19 云端页面旧双投影回退退出（实施前登记）

现有Pages实际调用`program-instance-usage?view=display`，Guardian电脑秒汇总／独立应用调用`getApplicationIdentityUsage`；这些当前入口与响应适配不能直接删除。其共用`readApplicationIdentityUsage`第一分支已有当前固定身份持久秒统计，本步让该适配成为唯一来源，删除缺当前数据后回退旧实例／native projection／product projection的分支；保留URL、鉴权、过滤、当前名称／分类／日小时输出和部分结果语义，不另算统计或改原账。以实际Pages请求／RPC、当前固定清单及旧投影表禁止读取验证；旧投影接收路由是否退役另按调用关系处理，不假装一起清除。

本项结果Matched（源码／隔离）：当前显示适配只委托固定身份秒统计，旧native投影读取器在调用归零后删除；真实Pages display请求与实际Service Binding返回同一51秒及名称，禁止旧投影／实例表读取时仍通过；无使用为0，不可读旧来源保持不完整／null而非回退或伪造0。`vitest run test/native-application-management.test.ts test/application-account-publication.test.ts`86/86通过，backend typecheck通过；后续无调用读取器删除后管理专项6/6再通过。旧投影接收测试改为确认旧投影不会回流当前读取，同时保留其哈希／权限／版本冲突检验。旧显式`native-projection`、`product-projection`、`includeProducts=true`仍在生产路由接线，本项未删除，后续按真实客户端调用单列。当前页面结构／模型名保持兼容，不涉及HTML/CSS或运行浏览器。

### 2026-10-19 无调用旧应用物化闭包清理（实施前登记）

公共应用读取迁到当前秒统计后，旧`readPersistentApplicationUsage/rebuildApplicationStatistics`已无生产调用。本步删除这两个入口、sole-caller旧Native毫秒混合选择器及其专属内部数据结构；保留当前publication使用的`applicationStatisticsSource`与`applicationPublicationDirtyStatements`原实现／事务。旧读取／重建专属测试正例退役，保留当前秒上传发布、坏哈希／孩子隔离、下降／重复、空零／部分、当前watermark／anchor及发布回滚测试；测试辅助函数不再偷偷运行已退役rebuild。只跑相应隔离专项及typecheck；不删除数据／表，不改原账、ACK、配置，不提交部署。

本项源码／隔离结果Matched：`backend/src`及`backend/test`上述旧入口／旧选择器／旧StatisticsValue引用归零。`vitest run test/application-statistics.test.ts test/computer-usage-evidence.test.ts test/application-ledger-retirement.test.ts test/source-statistics.test.ts`40/40通过；`vitest run test/application-account-publication.test.ts`79/79通过；`vitest run test/runtime-api.test.ts -t "delivers current-week|accepts accounting v2 beside|versions Child app policy with ETag|keeps legacy process usage"`4/4通过，83项未选不计通过；backend typecheck通过。旧物化／rawtimeline正例退役，当前秒/范围/空零/降更正/无旧表读取及上传发布独立覆盖保留；API原账上传、媒体ACK、归属策略、更正feed和孩子隔离断言仍在。API首次聚焦漏清一条旧辅助变量依赖，修正后复验通过，不是产品运行故障。尚有旧贡献／旧执行路由及当前发布事务旧dirty queue依赖，未借本项删除或宣称整批完成。

### 2026-10-19 当前可复用绑定独立化（实施前登记）

先将现有`/device/shared-web-source-binding/v2`的在途配置身份核对改读当前V2策略／V2摘要，仍保留同孩子、设备令牌、分配证明、有效期及前后配置一致性校验；不能因为退出旧贡献而丢失这些保护。直接生产路由隔离测试证明V2请求不调用V1策略，正常证明成功、错误／过期／改绑／配置变更拒绝。此项不提前删除仍有Native旧执行消费者的V1策略入口，也不改变证明格式、五分钟期限、原账或配置。通过后再核对旧贡献调用者是否已退出。

本项结果：`node tests/unit/device-shared-access-policy.test.js`与根`npm run typecheck`通过，V2签发前后读取当前策略且不调用V1读取器；实际路由的期限／签名／分配／设备改绑拒绝保留，新增当前V2配置变化409回归。旧贡献分支暂保留V1读取，Native旧执行／贡献后台仍未全部退出；不把当前V2独立化当成旧业务已删除。

### 2026-10-19 Runtime公共读取与定时发布保留（独立迁移／证据，实施前登记）

先让现有`/v2/module/app-usage`在所有家庭只读当前持久秒统计，保留必要旧响应单位字段投影、鉴权／范围／筛选和空零容错，不再触发旧原账物化。给实际HTTP入口补无旧表读取、900秒／900000毫秒同源、空零及跨孩子拒绝回归。定时子项先用真实`scheduled`入口及隔离D1记录当前接收→发布头，识别旧重建／贡献表访问；证明当前发布独立保留后，才以新证据申请删除旧调度，未通过工具审核前不重试。当前发布事务及原账、ACK、配置、数据库结构不变；不提交／部署／安装或启共享。

本子项源码与隔离结果：①公共HTTP仅当前秒统计，`computer-usage-evidence.test.ts -t "current persistent seconds cleanup"`2/2通过，含900秒／900000毫秒同源、空零、跨孩子及禁止旧表读取。②先以实际定时入口核实当前received清单独立发布，再获审核允许删除旧rebuild/reconcile调度；`application-account-publication.test.ts -t "current scheduler publishes"`1/1通过：51秒接收清单产生51秒发布结果，冻结清单不变，隔离代理确认不读写旧物化／贡献表。当前发布事务对未退役家庭仍含旧dirty queue写入，尚未处理，不把此用例扩展为所有家庭全无旧表。③Runtime当前来源路由与Service Binding仅schema2，调用清零后删除专属schema1读取器；`source-statistics.test.ts`22/22、backend typecheck通过，包含实际鉴权／同用户精确排除、篡改／部分来源／下降更正、改绑与发布竞态及旧格式400。首次专项因测试误用返回字段失败1项，修正夹具后全过，未放宽产品校验。`workers/src`及`backend/src`已无旧SourceStatistics类型、校验器或读取器引用。以上仅对应源码及隔离证据Matched；旧state／execution-basis／贡献业务路由及V1策略／证明依赖仍需按实际调用迁移清理，未安装部署或启共享。

## 2026-10-19 剩余清理续作（PO明确继续，先迁移和补保留证据）

沿用已批准12项范围及三树未提交现场，不重新请求同一删除授权。实施顺序：①控件集中迁完local-guardian旧夹具及当前V2共用分支；Native先把仍有真实消费者的旧统计入口迁到现有当前读取器，核对协议与网页结算边界；云端完成独立读取迁移并证明当前发布任务不依赖旧物化。②在真实生产入口的隔离测试中补当前桶、身份核验、上传发布及提醒/取消/超时的保留证据，保留错误/断线/改绑负例。③有实质新证据后再处理此前审核拒绝的删除，不换工具、拆片或重复无变化请求绕过；真实调用者归零后由架构集成统一收缩专属契约/导出/schema与测试。④最终核对启动、异常分支、路由和打包闭包，集中报告实际Matched/Missing，不以局部通过冒充完成。

职责与允许路径：architecture-integration只处理本条集成文档与contracts；standard-cloud处理Guardian/Runtime当前调用者、调度及直接测试；extension-local和native-local仍在原所属目录实施。高风险代码清理，产品语义不变；必要验证为本批直接Node专项（包括完整local-guardian）、Native限定隔离编译/回归、Worker当前发布/鉴权专项、契约构建/直接测试、typecheck和diff；不跑无关全量，不操作真实Service/Chrome/家庭数据，不安装部署、迁移、制包或启共享，不改原账和现有配置。旧测试专属正例随模型退役，但相关性、隔离、容错、当前提醒及网页结算不变性案例须保留到当前入口。未变源码证据复用，改动后以最终同源结果为准。

### 2026-10-19 Guardian 来源查询独立清理（B项，实施前登记）

本子项只处理尚未尝试的Guardian来源查询链：`routes/device.ts`与`services/computerUsage.ts`现有入口仅接受schema2，保持设备／孩子鉴权、可选V2来源证明及原桶语义；确认调用者清零后删除`services/sourceStatistics.ts`专属schema1读取器。直接更新`source-statistics-cloud.test.js`验证当前账户快照复用、来源排除、下降、部分保留、两个实际入口旧格式400、鉴权／改绑及可选分项隔离，并运行根typecheck、diff。保留当前`readWebQuotaBuckets`实现，不改网页原账／物化／ACK；不触碰审核拒绝的Runtime路由／调度、旧state／执行／贡献入口，不提交或部署。

本独立子项结果：`node tests/unit/source-statistics-cloud.test.js`通过；根`npm run typecheck`通过；限定差异检查通过，`workers/src`旧schema1读取器／类型／校验引用为0。专项实际加载两个Guardian生产入口，证明旧格式400且不读取统计、非法／改绑身份拒绝、正常schema2转接、可选V2证明缺失／失效／跨孩子侧车不污染合计；当前网页桶读取器保留原实现，600＋400=1000、排除本机得400、下降后700及重复不累加、清单缺失仍保留1000均通过。此处仅源码／隔离验证Matched；Runtime A类拒绝项和其他B／C清理仍Missing，不能宣称整批完成或线上已更新。

## 2026-10-19 应用与共享旧代码集中清理（PO批准，实施中）

本批不是继续关闭旧开关，而是删除已被当前应用身份整数秒统计与配额桶交换取代的业务路径。依据PO本轮《应用与共享链路旧代码清理方案》，按12组逐项核对；历史记录只留存，不清数据、不删表、不执行migration。原账、网页记账/物化/ACK、当前上传、配对、当前配置、当前身份核验及V2提醒/执行语义保持，不启共享，不安装或部署。

基线：Native main c7f150e39d07fb36d1e97d52f03362fc20e331d2；标准云端 codex/cloud-management 607cdd281c3fa817b5ec6c2936141dd465a9f56a；控件 codex/extension-local e94d273b48e027f8a4c2b8af096d864ab2e9a45d。三树既有未提交内容保护，未跟踪历史契约包不删除。控件源码manifest与已加载版本差异先按交付清单/哈希核实，不覆盖已验收补丁，不更新真实加载目录。

职责：architecture-integration维护本批语义/集成，standard-cloud实施Runtime与Guardian，native-local及extension-local分别在原所属工作树实施；不新增分支/工作树。变更等级为跨模块高风险清理，产品功能不新增。

| 清单 | 实施与验收边界 | 当前状态 |
| --- | --- | --- |
| 1 Native旧贡献后台 | 删除专属构造、循环、唤醒、上传；当前outbox保留，旧队列不重放 | Missing：补实际Service对象图1/1和同源编译证据后，集中删除重审仍被拒，未落地；关闭循环不等于删除 |
| 2 旧来源统计回退 | 只用现有桶读取/缓存，删除V1策略与旧诊断回退 | Matched（限定源码）：Service旧reader/V1 shadow policy/诊断回退及旧source交换入口已移除；不代表其他旧业务已退出 |
| 3 旧共享执行/提醒 | 删除新能力缺失时的旧链选择；保留当前V2生命周期 | Missing：控件当前初始化已解耦，Native旧执行及剩余旧分支未清完 |
| 4 身份核验解耦 | 当前可复用证明与撤销独立保留，删除旧挑战/贡献依赖 | 部分Matched：当前绑定生命周期独立、Native租约使用V2缓存、Guardian V2证明只读当前V2策略；旧挑战与Native旧贡献依赖仍待清理 |
| 5 旧身份/策略回退 | 删除旧命名导入、404映射降级和旧策略生成，当前兜底身份保留 | 部分Matched：旧命名导入与404映射降级已移除；旧策略分支未清完 |
| 6 旧统计消费者 | 当前页面/管道/上传接现有当前秒统计，删除旧模型生成和读取 | 部分Matched：Native Manager及Service→Host当前秒读取已接通，旧生成/上传/管道删除已落地且最终编译0警告0错；云端当前Pages/RPC只读现行秒统计。旧显式投影接收入口仍在，组合测试夹具修复后未复验 |
| 7 页面旧模型 | 不回退旧账或旧产品投影，保留当前统计展示和有效缓存 | Matched（限定源码/隔离）：控件旧双投影reader/Host出口/死渲染及旧贡献诊断已删除；云端真实Pages/RPC显示适配仅当前秒统计。未新增真实Chrome/生产验收 |
| 8 云端双模型 | 现有source-statistics地址只处理当前桶格式，鉴权及Service Binding保持 | Matched（源码及限定隔离）：Guardian/Runtime只接受schema2，旧读取器与契约schema1类型/算法/schema已删除；最终vendor及发布未完成 |
| 9 云端旧贡献任务 | 删除旧调度/业务入口，当前证明来源键算法保留 | 部分Matched：已删旧rebuild/reconcile、旧物化闭包和无人消费dirty queue/ready依赖，当前发布82项通过；Native尚有调用的旧业务路由仍在 |
| 10 云端旧账回退 | 当前持久统计唯一来源，无使用正常零，故障不翻旧账 | Matched（源码及限定隔离测试）：当前秒读取唯一来源；无新增生产验收 |
| 11 协议降级 | 当前协议直接协商；退役格式明确不支持，不恢复旧业务 | 部分Matched：控件直接v3协商，最终local-guardian仍有准备竞态修正待复验；Native无版本标准化和旧Host别名注册已删，较早36项通过。仍实际服务网页settledUsageSegments的显式v1/v2保留 |
| 12 契约/测试/打包 | 逐引用删除专属残留，保留当前回归和不可变历史包 | 部分Matched：旧来源模型和旧提醒生命周期导出/schema/专属向量已删，当前27项安全案例通过；控件当前导入统一1.58且SHA一致。旧策略/证明/执行导出、部分夹具最终复验及全包闭包未完成 |

顺序：先断旧调用→解耦当前能力→删专属模块→核对入口/调度/异常分支/打包。测试只跑受影响的本机隔离回归、直接Worker/控件专项、typecheck/编译和diff；覆盖无旧调用、配置缺省、零用量、保留有效部分、冷连接、孩子/周期/连接失效、重复/下降、原账配置outbox不变。CI沿用实际变更路由；本轮不触发远程CI、生产smoke、全平台/E2E或安装器构建。页面实际变动另做隔离目视。源码完成后集中记录Matched/Deviated/Missing/Extra、精确命令和证据，未实测项不得写通过。

前阶段证据（后续状态由本页顶部续作结果及上表取代；保留失败原因，不作为当前阻塞清单）：

- 控件1.7.64交付源码与e94d273产品文件相符；manifest版本由打包覆盖，未发现需要从实际加载目录补救的产品修改。未改真实加载目录。
- 契约曾尝试移除旧schema1来源清单类型/组合算法及Native转导，但云端调用迁移被审核阻断；为避免残留不可编译状态，已将该组未闭环收缩及配套schema修改撤回到本批基线，不计为完成。保留当前V2策略解除旧V1生成/规范化/身份验证依赖的修改；固定607cdd2基线18组配置输出、canonical字节及hash逐项相同。最终保留修改的`shared-access.test.mjs`、契约构建、根及Runtime typecheck均通过。旧契约/JSON schema/打包出口仍待清理。
- Native从固定c7f150e导出加本批限定文件进行隔离编译，当前同源83项聚焦回归通过：16项秒读取/桶/映射拒绝、5项可复用证明、50项V2保留、12项连接/改绑隔离。随后只补命名测试断言，命名/绑定35项通过，包含旧head单/多成员×普通/运行时入口4场景不导入、当前扫描仍可建立身份。当前秒接口已接固定身份读取器，旧source reader/V1 shadow policy及诊断回退已移除；当前证明租约改用V2策略缓存，旧执行/贡献后台未删完。固定计算时间已从当前读取器透传；真实C#合成响应由控件现行validator接受，180秒及计算/截止时间一致，未放宽校验。后续独立旧source入口清理仍在收尾，不能将上述阶段通过当最终全批通过。
- 控件当前共享集成、来源桶及云端请求/故障专项已通过。两组旧断言迁移复验和Native隔离目录写权限复验由PO追加批准集中完成；未因此更改产品规则或系统安全设置。
- 控件当前绑定专项及`local-guardian.test.js --current-binding-only`通过：实际冷连接、初始化、桶读取、重连及迟到响应隔离不依赖旧shared-quota-state-read能力；这只是子集，不代表整份local-guardian测试通过。当前诊断身份确认已改读reusable-binding，旧贡献诊断装载仍未删除。当前秒统计页面的单元、渲染、类型检查和隔离目视通过，保留日/小时/分类/应用明细及有效部分，不伪造未知总量为零；未操作真实Chrome。
- 自动安全审核对部分删除要求更多当前消费者迁移证据；PO再次明确批准删除旧schema1查询/贡献调度/诊断/专属协议后，旧云端查询入口及旧贡献诊断删除仍被拒绝。未换工具或切片绕过。云端已修改当前秒统计唯一读取和电脑证据读取两处，新增D1专项2/2通过：禁止原账/旧days/旧贡献表读取后900秒总量、600秒非特殊及300秒排除仍正确；无记录为零，非法日期/反向/超七天拒绝。命令：`npx --no-install vitest run test/computer-usage-evidence.test.ts -t "current persistent seconds cleanup"`；其余旧测试未运行，不计通过。

当前：工作树有本批未提交修改，全部12组与打包闭包尚未通过；不提交、不安装、不部署，不声明整体完成。真实Windows及Mac执行证据本轮未新增。

阻塞与未实施项必须分别记录：已被审核拒绝的是Runtime旧schema1/旧共享路由、旧物化/贡献定时调度、Native旧贡献后台与旧执行集中删除、控件旧贡献诊断删除；不是所有残留都已被拒绝。未被拒且可独立闭环的Guardian当前桶调用者迁移、Native已卸载旧来源读取入口、控件旧应用投影出口继续处理。其余旧执行/协议/测试残留按真实依赖登记，不能统一归因为权限。PO已给明确删除授权，不要求PO再次重复确认；拒绝没有稳定错误码，Runtime最后理由为仍可能存在旧生产消费者、调用迁移证据不足。旧契约导出待真实调用者归零后再收缩。

### 前阶段集中收尾记录（已由顶部续作推进，整体仍未通过）

- 上述三个独立子项均已完成：Guardian仅当前schema2桶格式，原URL、鉴权、范围及V2证明保留；Native旧source交换许可/Dispatcher/Host专属分支及无调用读取器删除；控件旧双投影reader、专属协议出口和页面死分支删除。当前网页桶读取器正文未改，原账和生产配置无操作。
- Native最终固定c7f150e隔离源码同步18个产品/测试文件后编译及98项通过；另35项命名/绑定通过。具体命令与筛选在原`agents/windows/WINDOWS-QUOTA-SOURCES-2026-10-17.md`；此前83项是中间结果，不代替98项最终结果。跨仓同一C#响应校验仍通过。
- 控件最终秒模型、渲染、当前绑定子集、typecheck、语法及diff通过；秒模型补错误孩子、周补读改绑拒绝、完整周缺应用行按零案例。整份local-guardian旧夹具仍未迁完/未通过，不能把子集当全文件通过。隔离目视通过并关闭预览进程，未操作真实Chrome。
- Guardian直接`node tests/unit/source-statistics-cloud.test.js`、根typecheck及diff通过；Runtime两项D1专项、backend typecheck、契约构建及V2策略测试通过。现有V2策略18组基线输出/canonical/hash不变。未触发CI或生产验收。
- 尚未实施而非审核拒绝：Native旧秒循环/旧identity端点/中间统计生成上传仍有Service与Manager消费者；无版本/1/2协议与网页settledUsageSegments共用解析，尚缺网页线不变性证明；旧Host别名/注册仍在。控件schema1提醒仍与V2共用lifecycle/content bridge/executor等，mode-service仍有旧admission分支；旧专属夹具与打包闭包尚未完成。Guardian旧state/basis/contribution也仍需配合Native旧执行退役。
- 当前唯一调用链只能对已迁移入口成立，不能扩大为全程序已无旧模型。完成项按上表Matched范围计，残留统一Missing；没有将未完成项报成批准的替代实现，也未引入额外产品范围。三树保留未提交M/D及原有草稿，无新commit，不提交、不推送、不安装、不部署、不迁移、不启共享；本批交付闸门未通过。

## 2026-10-19 四项集中交付：已提交／发布／安装，限定只读实机核对通过

PO批准集中提交/推送/合并本批四项，必要Runtime Worker部署、唯一Windows内部候选及一次升级后只读验收。范围不含Guardian/Pages、migration、R2/feed、共享启用或配置/原账改写。复用119项Native及20项Runtime精确源码证据，补必要CI、产物核验和安装保留核对；排除其他在途草稿与无关文档。当前未宣称发布或实机通过，安装UAC由PO批准。Native候选以已安装2.6.68对应66f0a81基线加本批提交构建，不将工作区识别/强化草稿带入。

完成记录（本段取代下方实施阶段状态，不扩展为共享正式执行验收）：

- Native提交c7f150e39d07fb36d1e97d52f03362fc20e331d2，16个限定文件；既有已安装基线一并正常快进推送main，未强推、未纳入工作区识别/强化草稿。Native轻量CI39153239638成功。云端提交607cdd281c3fa817b5ec6c2936141dd465a9f56a，5个限定文件；PR #297合入master为71312c477968c4ec4e9ae1093c430e00f56311da，PR CI39153293331及合并CI39153446302成功（后端15文件/367例、typecheck、dry-run）。首次本地职责CLI参数误用已以导出检查器复核通过，未修改治理代码；PR职责门也通过。
- 生产39153588626成功，Runtime版本df46ea8f-5604-4f02-a152-78da029d02d4。部署清单deployedResources仅runtimeWorker，runtimeMigrations/guardianMigrations均空、shadow准备false；与上一生产39149238649逐项比较，Guardian、两套Pages及R2 latest完全未变。既有health及未认证401 smoke通过，无新增配置写入、迁移或托管。PR附件工具达到本会话100项上限而未挂载成功，链接与代码交付不受影响，不为此清理其他附件。
- 唯一内部未签名Windows候选2.6.69，从固定c7f150e干净导出构建，MSI与Bundle生成0警告/0错误；MSI产品版本及11组件均核对2.6.69.0，锁定契约1.56.0未改。MSI SHA256 4ebe93518bcf358dc50d229ee4512996a873f093622246e36cab9b6f95abc61e，Bootstrapper SHA256 8709dd28b153e47da9ee4725c0c484796962a9ed1ff68ee448c6b6c2886c86ce，latestEligible=false。无中间安装包、第二次制包或控件重载。
- 一次受控UAC完成2.6.68→2.6.69，安装器退出0，Service Running。沿用既有受限备份/保留核验工具；备份仅在原受保护管理员目录，数据库检查ok。18张相关表、凭据/密钥、用户分配、应用管理配置、原始事实、冻结版本、outbox主键及冻结载荷保留通过；正常队列状态允许自然推进，不回滚新增账。受控安装及只读进程均结束，无自动重试、切用户或配置操作。
- 真实只读：当前用户范围核验成功；正式Service版本2.6.69.0、desired/applied=393/393，策略成功时间后续更新。原profile-config:52、shadow及原摘要保持，ExecutionGateSatisfiedByStoredInputs=false。普通权限本机读取当天返回success=true、complete=true、4813秒、分类原因空（升级前同入口有NATIVE_SPECIAL_APPLICATION_CONTEXT_MISSING），当前全部未归类4813秒；与同次正式影子输入的应用复合4813秒一致，网页学习97秒，合计学习97/复合4813/休息0，complete=true、原因空。升级前4662与升级后4813的截止不同，不把151秒差值归因于本批修复；原账保留由18表核验独立证明。
- 采样网页来源为有效cache，应用为local+cache；不冒称本轮重新通过当前连接peer实时优先或正式动作。lastStableErrorCode保留无独立失败时标的shared_policy_unavailable，不能据此覆盖当前成功读取，也未在本批扩查其他兼容。诊断productWrites=false/networkRequests=0/secretsExported=false。只读证据SHA256 944cce99564526763f420a23c7770b3a21d41110472cda15b635763b3998f05b，保留摘要SHA256 fbe4f2983d79c83f85ec4d99ca84be0f28e88d4f77ae617f80f07b622e6f2b5c；受限本地保存，不入Git。

本批交付及上述限定验收完成。共享持续关闭；其余8类兼容、正式提醒/限制执行与其他平台不在本批结论内。无须再安装或让PO补长诊断；后续工作另按既有剩余清单推进，不借本次交付宣称Windows全功能完成。

## 2026-10-19 四项集中交付获批，执行中（历史阶段，后续结果见上方）

PO批准集中提交/推送/合并本批四项，必要Runtime Worker部署、唯一Windows内部候选及一次升级后只读验收。范围不含Guardian/Pages、migration、R2/feed、共享启用或配置/原账改写。复用119项Native及20项Runtime精确源码证据，补必要CI、产物核验和安装保留核对；排除其他在途草稿与无关文档。当前未宣称发布或实机通过，安装UAC由PO批准。Native候选以已安装2.6.68对应66f0a81基线加本批提交构建，不将工作区识别/强化草稿带入。

## 2026-10-19 四项集中修复完成源码及聚焦验证（未提交／未安装部署）

按下方方案实施C01/C02/C12/C03。职责按仓分别为native-local（Native统计解释、目标、心跳及旧循环）与standard-cloud（Runtime接收端投影）；只修改对应源码、直接测试和既有文档。先做缺省/显式配置回归，再统一解释并撤掉旧依赖，补能力及旧循环隔离，最后集中验证。保留Native其他在途草稿与本仓既有文档修改；验证使用固定HEAD加本批文件的隔离源码目录，避免未批准草稿混入证据。不新建Git分支或工作树，不安装、部署、迁移、写真实账或配置、不启共享。

验证为Native受影响过滤测试及项目编译、Runtime分类投影与心跳/策略隔离D1测试及typecheck、两仓diff检查；不跑真实Chrome、Mac或安装器。最终结果如下，不提交或推送。其他8类兼容与独立应用封锁不扩入本批。

本批结果更新：C01/C02/C12/C03均Matched；无Deviated/Missing/Extra。Native只改9个产品文件：Infrastructure的NativeApplicationStatistics.cs、NativeApplicationManagementApi.cs、LocalApplicationStatisticsReader.cs、ApplicationChildStatisticsReader.cs、NativeApplicationControlBuilder.cs，以及Service的RuntimeServiceCoordinator.cs、.NativeSharedTarget.cs、.LocalApplicationStatistics.cs、.ApplicationObjects.cs；6个直接测试及既有WINDOWS-QUOTA-SOURCES文档配套更新。Runtime只改v2Repository.ts及runtime-api.test.ts、product-block-policy.test.ts；DECISIONS同步落实状态。原有在途草稿保留，不混入隔离产物。

| 验收项 | 实施及证据 |
|---|---|
| C01统计缺省 | 删除InterpretLegacy及读取器的旧策略参数/注入，缺省通过NativeApplicationConfiguration.Interpret统一为unclassified/false；没有用缺省吞掉I/O、校验错误。当前周不再从旧目录产生特殊属性未知，历史分支未重定义；基础秒数与原账不变。去掉旧策略输入后，现有派生revision按真实内容重新生成，无须新schema、重置计数或伪造配置版本 |
| C02目标缺省 | 去掉SnapshotFor旧分类回退，与统计调用同一纯解释。实际Service用冲突旧配置、显式study/other/special及撤销条目对照，统计、目标、桶一致；无正式动作派发 |
| C12云端分类 | 删除递归other→unclassified，保留scope配置剥离与执行格式协商。Native实际HTTP心跳含既有application-other-v1；Runtime认证路由→隔离D1→下发验证能力有/无/撤回均保持other，原配置/ETag不被写改，能力变化仍影响机器ETag |
| C03旧循环 | 正式StartAsync使用的装载入口在FixedIdentity返回已完成任务；循环入口、唤醒和旧诊断调度均隔离。直接进入循环及重复唤醒不调用旧HTTP，预置pending旧队列逐字段不变；新版桶读取/peer采用及Service新版上传恢复继续通过，不以共享开启为前提 |

复现与修正：Native固定旧源码加新断言，实际Service的8个生产者场景6失败/2通过，已复现旧继承及特殊排除；云端原实现实测other返回unclassified。随后Native编译曾发现新增测试命名空间误用，已更正；108项首次可执行复验106通过、2失败，分别为被移除旧配置回调上的并发测试钩子，以及对SQLite池占用文件做字节读取的测试方式。已改为固定时钟钩子和只读队列行快照，未恢复旧依赖、删除断言或改产品计时。另11项上传复验的夹具原本混用真实日期，跨周后误落历史分支；统一为夹具既定时钟后通过，不调整机器时钟或历史产品语义。

最终验证：Native隔离固定66f0a81451d3406bf8b4d8af79d2626000fd421e＋本批15个源码/测试文件，逐文件SHA核对15/15一致。`dotnet test <隔离源码>/agents/windows/tests/TimeOnChrome.AppRuntime.Core.Tests/TimeOnChrome.AppRuntime.Core.Tests.csproj --no-restore --filter <上述统计/拓扑/读取器/心跳/Service目标/旧循环/peer/固定统计专项> -m:1`为108/108；同项目Service `NewFixedUploadSurvivesDisconnectedTransportLostResponseAndServiceCancellation|NewFixedUploadKeepsNewFactsDuringOutageAndUploadsLatestSnapshotOnce`为11/11。精确用例及结果保存在本地TRX；两份TRX为four-fixes-native.trx、four-fixes-upload.trx，不入Git。编译0错误，存在隔离长路径下非致命MSB3101程序集缓存写入警告，未为消警改系统设置。

Runtime：`npm exec -- vitest run test/runtime-api.test.ts -t 'stores other classification in additive history|shared V2 capability survives|program execution capability survives'`为4/4（83不相关例跳过）；`npm exec -- vitest run test/product-block-policy.test.ts test/native-application-management.test.ts`为16/16；`npm run typecheck`通过。Native职责固定用例、CI路由固定用例及两仓`git diff --check`通过。没有新增CI、全量/跨平台/真实浏览器测试、安装器、生产查询或故障注入；不将本地通过当正式Service实机已修复。

状态：本批源码及隔离验收通过，未提交推送、制包、安装、部署或迁移；原账、现有配置、配对和共享开关未操作。只存在旧配置的对象在新解释下不再继承，这属于PO确认的缺省修正，不偷偷迁移成新配置。生产仍运行原版本，后续交付和正式只读验收另按授权集中安排，不逐零件交付。

## 2026-10-19 四处旧语义依赖集中修复方案（审批时基线，实施结果见上方）

PO范围：只处理下方C01、C02、C12及C03；缺省未归类，只有当前明确特殊设置才特殊，不继承旧配置。不改原账、现有配置或共享开关。当前为Product规划／architecture-integration文档阶段，只更新本任务板；Native实现归所属工作线，Runtime实现归standard-cloud。本轮不发送跨会话任务，不改产品或测试，不提交推送、制包、安装、部署或执行UAC。保留现有脏树，不新建分支、工作树、文档、接口、表或migration。

### 一、唯一解释规则

当前孩子、当前应用身份的有效配置是本批统计与共享执行目标的唯一配置依据：明确分类原样使用；无分类设置为unclassified；SpecialApplication仅明确true时为true，无设置或明确false均为false。special不由程序名、旧产品目录、旧技术身份分类或关联充分性推导；other与special独立。未归类仍按既有应用桶规则进入复合，普通other不扣三桶，明确special排除三桶；已经进入娱乐桶的量不再次借用。本批不更改这些桶算法。

“没有配置”与真实读取/身份/范围错误不同：成功读到的空配置/无对象条目使用上述缺省；I/O、反序列化或身份校验失败仍走现有错误与同范围有效缓存，不吞错伪装成成功缺省，不再查旧配置救场。统计端与目标端复用当前配置的同一纯解释函数／现有合适位置，不建新配置服务、第二份状态或新的身份识别规则。孩子/机器/来源、配置生效时间和改绑隔离保持。

### 二、按顺序实施的四项checklist

| 项目 | 现有证据与最小修改位置 | 修复后必须成立 |
|---|---|---|
| 1 C01统计旧回退 | Infrastructure/NativeApplicationStatistics.cs当前周缺配置分支移除InterpretLegacy调用及仅服务该调用的依赖；LocalApplicationStatisticsReader.cs去掉向当前解释器注入旧配置的接线。NativeApplicationManagementApi.cs内ForTargetAsync及直接调用处的“null继续旧配置”注释按实际新规则更正，不扩大到其他消费者 | 当前日/周明确配置或缺省直接解释；不再因旧目录缺项生成NATIVE_SPECIAL_APPLICATION_CONTEXT_MISSING；真实新账/配置错误仍保留。原始秒数、基础日/小时总量、身份及原账哈希不变，非特殊分类桶可因纠正解释而变化。更早历史不在本批重解释 |
| 2 C02执行目标旧回退 | Service/RuntimeServiceCoordinator.NativeSharedTarget.cs移除SnapshotFor旧分类读取及configured为空时的旧分类switch，使用与第1项同一解释 | 同孩子、同应用、同生效时点下，统计与共享目标得到相同分类及special；缺省不是旧封锁/旧娱乐/旧特殊。不改其他独立封锁模块、黑名单、时间窗、配置存储或原有管理键；不实际派发动作 |
| 3 C12云端分类改写 | Runtime backend/src/v2Repository.ts中projectAppPolicyForMachine移除classification:other→unclassified递归改写；保留独立scope下发、身份隔离及程序执行格式的既有边界。Native实际心跳BuildExecutionCapabilities补报其确实支持的既有application-other-v1，使用原能力名和原白名单，不新增协议 | 缺少能力标记不能默默改写分类；有/无该标记的投影均不改变other。已保存孩子配置及历史不变，不下发别的孩子或擅自恢复scope专属字段；未支持other的旧客户端不在本批宣称兼容通过，不用另一套降级规则补偿 |
| 4 C03退出旧贡献后台 | Service/RuntimeServiceCoordinator.cs当前FixedIdentity模式不启动ApplicationSharedQuotaUploadLoopAsync，旧贡献专属唤醒/调度不再进入该模式；只移除或隔离被确认属于该循环的启动与唤醒，不整批删共享模块 | 冷启动、周期到期、正常上传后唤醒及重连均不调用旧能力/旧策略、不enqueue/retry/upload旧贡献；已有旧队列原样保留且不重放。新版原账/持久统计上传、本机桶读取、双向交换和其他来源缓存仍运行，且不依赖共享启用 |

第4项安全依据：旧循环调用的ApplicationAccountUploader.RecoverSupersededRoundAsync在store.V3Only或FixedIdentity时直接返回0（ApplicationAccountUploader.cs:62起），其Once入口也拒绝FixedIdentity；停止当前模式旧循环不会移走该模式的有效新账恢复。但必须在Service装载级回归中证明新上传仍有独立实际入口，不能只据此删除公共上传器或队列。旧协议/旧模式的其他7类兼容不顺手清理。

派生缓存仅处理本批必要部分：沿现有当前日/周计算、版本递增和替换路径产出新解释，验证旧派生结果不因配置版本未变化而继续命中；只在实际存在此缓存复用断点时最小修正其现有计算版本/缓存失效依据，不新增摘要账或手改统计值。新版统计正常上传不改接收协议或计时语义；更早历史、旧原账与旧贡献队列不改写、不删除。不把“配置不变”等同“派生结果必须不变”。

### 三、集中聚焦验证契约

中风险：统计分类、目标解释、机器能力下发及Service后台生命周期；非原账改动。先补可复现旧行为的隔离用例，再实施四项最小补丁，最后一次汇总；测试数量不代替端到端断言。

| 验证组 | 必要案例及通过依据 |
|---|---|
| 配置缺省/冲突 | 无新配置且旧配置分别为study、restrictedEntertainment、blocked或special，结果始终unclassified/false；明确新分类优先；special=true/false与分类独立；撤销条目恢复缺省；旧目录缺失/冲突不改变结果、不漏有效普通秒数 |
| 统计与目标同口径 | 同一固定Child/应用/时点同时经过真实统计读取入口及ReadNativeSharedAccessTargetAsync，分类/special一致；未归类进复合、other不扣、明确special排除。网页600秒+普通应用600秒的既有独立核算不变，不运行正式提醒或关闭 |
| 失败与隔离 | 已有有效当前配置缓存的读取失败不转旧配置；无有效结果保留明确错误及其他有效用量；孩子/来源/配置生效范围变化不复用旧响应或跨孩子缺省。保留现有授权、精确ACK与哈希负例，不增加强一致门槛 |
| Runtime真实下发 | 认证心跳→隔离D1能力保存→机器策略响应；有/无application-other-v1时other原样保留；心跳重复稳定、能力改变的ETag按既有机制变化；投影不修改数据库配置/历史，不意外下发scope配置或未协商程序执行格式。Native心跳构造确含既有标记 |
| 旧循环退出 | 真实Service启动装载中FixedIdentity模式冷启动、定时/上传唤醒、重连时旧能力/策略/贡献HTTP及旧入队调用均为0；预置旧队列不变。相同宿主内新版正常统计上传及桶交换实际被调用成功，排除“把所有后台停掉所以零调用”的假通过 |
| 无原账/配置改写 | 隔离前后原账每条内容/条数/整数秒/哈希、配置内容及版本、绑定不变；同截止基础总量及小时不变，变化仅在可解释的分类及非特殊桶。重复读取不累计、修正下降按版本替换；旧派生缓存不复活，历史不重算 |

必要Native测试：在既有NativeApplicationLegacyConfigurationTests、ServiceQuotaBucketsTests及相关Service目标/启动测试位置添加上述直接案例，按实际修改选择最小过滤集合；验证运行的是Service接线而非只测纯函数。必要Runtime测试：既有backend/test/runtime-api.test.ts相关心跳/策略与分类投影案例；使用既有隔离D1，不写生产。Native相关项目编译，Runtime npm run typecheck，git diff --check；实施阶段核对实际测试名字后记录精确命令，不预报通过。后续若进入推送，复用精确SHA的相关Native/Runtime CI；不跑网页账本、Mac、全平台、真实Chrome破坏测试或无关全量回归。Wrangler dry-run仅作为后续Runtime交付检查，当前不运行。

### 四、交付与结束边界

集中汇报四项各自Matched/Deviated/Missing/Extra、修改文件、精确测试/编译结果和原账/配置保留证据；有失败只修本批断点，不补旧目录或扩其他兼容。源码修复、集中候选、部署安装和正式只读验收分别登记；本次只制定方案，不把此前安装/部署批准自动用于本批。后续另获交付授权才安排一个最终候选及必要Runtime部署，不逐零件交付。

正式验收目标（后续授权范围，不在本轮执行）：固定当前孩子/当天/截止，Native基础总量保持，统计与目标缺省一致，三桶每项可解释，Runtime下发other不变，旧贡献循环无新活动，双向新桶仍可读；原账/现有配置不变、共享持续关闭。无需为本方案重装、取长诊断或UAC。当前状态：方案已登记，4项实现均未启动，其他8类兼容不纳入本批。

## 2026-10-19 过渡兼容盘点补充：限定范围12类，不是12个已证实故障

只读范围：当前已安装Native 2.6.68冻结源码66f0a81451d3406bf8b4d8af79d2626000fd421e，以及Runtime策略下发直接边界（本地来源f2d76b5，对应已合并84430e1）。不拿当前Native main替代已安装源码，不把关键词命中或文件数当问题数；未完成控件全量、Mac、Task/Santa盘点，不能报告全项目兼容总数。仅补现有任务板，不改产品/测试、原账、配置、开关，不UAC、测试、安装或部署。

| 编号／独立机制 | 实际入口及条件（Native路径相对agents/windows/src） | 判断及证据边界 |
|---|---|---|
| C01 统计缺省继承旧分类／旧产品特殊属性 | Infrastructure/LocalApplicationStatisticsReader.cs:150→NativeApplicationStatistics.cs:40—46、69—99；Service本机桶真实消费 | Deviated：违反最新“缺省未归类、非明确特殊即普通”。现场有特殊上下文缺失原因，逐对象影响秒数未取得；与下方原3项清点的第1项相同，不重复计数 |
| C02 执行目标缺省继承旧分类 | Service/RuntimeServiceCoordinator.NativeSharedTarget.cs:31、47、52→Infrastructure/MachinePolicy.cs:345—368 | Deviated：缺新配置仍继承旧分类，而特殊属性缺省false；与统计端解释不同。共享关闭，未证明已造成误关；同原清点第2项 |
| C03 旧共享贡献后台仍启动 | Service/RuntimeServiceCoordinator.cs:302、2915起→Infrastructure/ApplicationSharedQuotaEnqueuer.cs:21—29；旧V1能力成功后才查旧策略/准备队列 | 已接线，是否本次真正上传未验证；不等于新桶重复累计。新桶读取不消费此贡献，同原清点第3项 |
| C04 旧共享执行／提醒与V2并存 | Service/RuntimeServiceCoordinator.cs:86、1846—1900，SharedEnabledFor及机器能力/阶段选择 | 条件兼容：保留旧策略缓存、旧提醒及V2执行通路；当前shadow不证明任一正式共享动作已运行 |
| C05 旧程序策略与程序实例执行格式并存 | Service/RuntimeServiceCoordinator.cs:1779—1825→Infrastructure/ProgramInstancePolicyBuilder.cs，按会话ExecutionCatalogVersion及Agent能力分派 | 条件兼容：属于应用对象执行，不等同共享桶算法；本轮未重新采集当前会话实际选择 |
| C06 新实例关联可导入旧名称关联头 | Infrastructure/ProgramApplicationNamingStore.cs:114—129及ProgramApplicationNamingStore.Fallback.cs:37—51；Service ApplicationLedgerAttribution.cs:43实际调用EnsureRuntimeAsync | 当前入口可达：无新映射且旧头满足条件时生成新关联；未证明现场发生。正常动态身份兜底不是旧兼容，不计为另一项 |
| C07 新映射接口404才退旧映射接口 | Infrastructure/ProgramInstanceMappingCache.cs:179—198，projection-context/read仅NOT_FOUND退mappings/read；Service注册循环调用 | 条件兼容：不是任意鉴权/范围错误都回退；未取得当前实际回退实证 |
| C08 桥协议v1/v2/v3与旧Host别名 | Service/RuntimeServiceCoordinator.cs:291—293；TimeOnChrome.NativeHost/NativeHostProgram.cs:52—87；Infrastructure/NativeMessagingManifestWriter.cs:14 | 条件兼容：多协议服务器及相同EXE别名保留，不能由此推断业务重复执行；合计为一个传输兼容机制 |
| C09 旧连接挑战与可复用V2证明并存 | Infrastructure/SharedWebSourceBridge.cs:104—108及旧challenge分支，按消息名分派 | 条件兼容：身份凭据两种流程仍有入口，不能把旧连接随机值证明当新可复用证明；未削弱鉴权 |
| C10 本地窗口多代视图及读取回退 | Setup/UsageStatisticsWindow.xaml及.xaml.cs，默认第3索引读新Local；非默认身份视图可读seconds，旧构造无seconds委托才读ms | 条件兼容：产品未就绪可带说明显示基础实例；当前默认窗口并不直接回退旧毫秒读数，不能误报默认已混账 |
| C11 旧应用原账／派生统计仍留代码但当前固定身份分支隔离 | Service/RuntimeServiceCoordinator.cs:144 fixedIdentity:true、1044、2838—2840；ApplicationObjects.cs:33/104；Infrastructure/ApplicationChildStatisticsStore.cs固定身份选择 | 已隔离（仅上述路径）：不纳入当前新统计；不为了删代码重新处理旧账，也不推断所有旧入口已退出 |
| C12 Runtime将other降为unclassified的旧接收端投影 | backend/src/v2Repository.ts:439、443、464—477，缺application-other-v1时递归改classification；Native RuntimeServiceCoordinator.cs:3244—3267的实际心跳能力构造未包含该能力，MachineRuntimeApiClient.cs:189—190原样发送 | Deviated：发送／接收能力未对齐，当前生产者会满足旧投影选择条件；不能称为纯字段兼容。保存的孩子配置不改，但下发分类语义可变；未新采样证明某个具体对象已被改类。新nativeApplications由独立scope读取，不把控制载荷删字段误报成配置被删 |

集中结论：12类中，C01/C02/C12为3类业务语义偏离；C03为1条仍启动的旧后台路径，实际贡献副作用待核；C04—C10为7类条件通路，其中C06并非只能由旧客户端触发；C11为1类已隔离路径。不得把12类都报为现网故障、都判无害，或承诺一键删除。此前“整体已对齐”的结论失效／证据不足；仅保留各已采证链路的具体通过结果。当前未实施修复，无新增CI或运行验收；接下来若实施，应先按最新缺省规则给出集中最小改动，而不是补旧目录或继续让PO逐项取数据。

## 2026-10-19 当前应用链旧依赖只读清点（不代表全仓审查通过）

PO连续指出缺省不应继承旧配置，并重申未设置分类为未归类、仅明确特殊定义才特殊；已记DECISIONS，覆盖此前缺省继承条款。本轮仅核当前已安装2.6.68冻结源码的统计、配额读取、正式目标与紧邻旧贡献启动条件；不修改产品/测试代码、原账、配置或开关，不UAC、安装、部署或另派任务。不用“旧文件仍存在”直接当运行故障，也不宣称其他模块均无问题。

| 发现 | 实际接线与证据 | 影响与证据边界 |
|---|---|---|
| 1. 当前统计仍回退旧配置，并依赖旧产品目录判特殊 | LocalApplicationStatisticsReader:150→NativeApplicationStatistics.Build:40—46/InterpretLegacy:69—99；Service本机桶真实调用该读取器 | 现场已见原因码、有效基础时长仍在，但特殊属性null的部分不进普通桶；具体对象与秒数尚未取得。统计页面与桶共用该解释，不拆成多项凑数。与最新缺省规则偏离，尚未修 |
| 2. 正式目标分类另有旧配置回退，且特殊属性口径不同 | RuntimeServiceCoordinator.NativeSharedTarget:31以MachinePolicyStore.SnapshotFor取旧技术身份分类，:47缺Native配置就用它；:52特殊属性只看Native配置，缺省false | 同样的“未配置”可在统计端沿旧目录判特殊/未知，在执行端沿旧分类但特殊false；代码风险已确认，正式共享当前关闭，未声称已造成误关或封锁。与最新缺省规则偏离，尚未修 |
| 3. 旧共享贡献后台循环仍启动 | RuntimeServiceCoordinator:302启动ApplicationSharedQuotaUploadLoopAsync，:2915起遍历受保护来源；ApplicationSharedQuotaEnqueuer:21—29先查询旧V1能力，支持才查旧策略/准备贡献；不是以新桶模式在启动处退出 | 仍有旧后台路径；是否本次实际排队/上传未采证，不等于用量已重复。其异常可记SHARED_QUOTA_POLICY_UNAVAILABLE；新QuotaBucketsReader不消费旧贡献，因此不能指认为当前桶数值根因。是否保留/停用待最小修复方案，不自行删队列 |

排除的误报：Service构造明确fixedIdentity:true（:144）；MaterializeChildStatisticsOnceAsync在:1044直接走固定身份分支；旧instance/product统计上传候选在:2838—2840被同一模式隔离，ApplicationObjects旧附加统计上传也有FixedIdentity提前退出。这里只证明这些具体路径已隔离，不推断所有旧实现均退出。

结论：当前限定链路确认2处旧配置回退，另有1条旧贡献后台接线；并非全项目问题总数，也不是3项均已造成现场损坏。此前整体“已对齐/无问题”的口径证据不足，不能继续沿用。旧配置分支不再以“保留设置”合理化。上条针对旧关联逐项补查的UAC提议不默认继续推进；本轮先固定正确缺省与真实清单，修复须另按明确范围执行，不把当前问题转成补齐旧目录的工作。

## 2026-10-19 特殊应用上下文缺失：只读原因与影响核对

范围：仅分析正式2.6.68冻结源码及既有/普通授权读取证据，不改产品/测试代码、原账、配置、共享开关，不安装、部署、重启或启动执行；未新增UAC。低风险只读检查，无新CI/产品测试需求；既有测试仅作为对应分支行为依据，不充当当前对象实证。

实际调用已追踪：Service ReadLocalApplicationQuotaBucketsAsync→ReadLocalSourceStatisticsAsync→LocalApplicationStatisticsReader.ReadSourceAsync/ReadCoreAsync→NativeApplicationStatisticsProjection.Build/InterpretLegacy。匹配明确Native配置时直接用该配置；缺专属设置才解释既有旧配置。NATIVE_SPECIAL_APPLICATION_CONTEXT_MISSING仅在旧执行对象选择有效、孩子/策略有效时产生：①已有分类但productIdentityProjection/applicationKnowledge缺失或knowledgeVersion不匹配（NativeApplicationStatistics.cs:84—89）；②已有投影项但并非唯一confirmed/associated且有productId，或产品目录中不是唯一产品（:91—99）。无旧配置、无旧选择、无目录条目等另有普通未归类默认，不能把所有未识别/缺省都说成此故障。Runtime getAppPolicy与projectAppPolicyForMachine保留这些既有字段，没有查实云端主动丢弃的代码证据，不能把两个现场分支任选一个当成根因。

影响已由实际消费核对：基础应用行/分类行仍保留时长；特殊属性null的分配不进入NonSpecialCategories，也不计SpecialTotal。共享应用桶只读NonSpecialCategories，故已知桶继续计算，但可能漏掉普通应用部分，并非纯提示；如果涉及的只是本来就应排除的特殊应用或不扣额度的other，则未必影响三桶数值。QuotaBucketsProtocol.Project仍计算已知已用/剩余；SharedAccessAdmissionV2.Evaluate先用已知桶判断门槛，再保留SharedUsageIncomplete，不因complete=false整体拒绝或清空。可继续准备动作链，但不能据此验收总量准确；要先识别具体受影响对象及分类，不预设必须重装或返工。

普通权限实测已成功：直接复用现有LocalApplicationStatistics管道，Service核验当前Windows用户，只查10/19，未发管理/同步命令、未读凭据/受保护库。01:36:02返回基础2725秒、complete=true、nextOffset=null、基础reasonCodes空，分类原因仅NATIVE_SPECIAL_APPLICATION_CONTEXT_MISSING；Word学习5秒、Chrome未归类624秒、截图工具未归类12秒、ChatGPT动态身份未归类1959秒、PowerToys动态身份未归类125秒。只能证明基础用量完整及当天分类解释有缺项；不可将它与01:27不同截止缓存的复合2180秒直接相减推断丢量或锁定某个应用。

尚缺现场逐对象原因：普通接口不返回该对象的旧选择、实际专属配置及产品关联/目录校验细节，上次只读V2采样也未包含这些数据。现有ClassificationAudit会额外联网且不输出所需原因，不为了方便直接再运行。最终定向采证需另获一次只读UAC：只核当前用户/孩子/当天既有配置、选择与归属依据，SQLite只读/限时/不联网，输出触发应用、缺哪一条件、对应原始秒与是否影响桶，不导出路径、用户/孩子标识、原始凭据或全库；不扩大历史/其他家庭。当前未启动，具体现场触发分支、受影响秒数及是否影响三桶尚未确认。先报告权限边界，不以静态分支或软件名称猜结论。

## 2026-10-19 正式Service共享V2采用：只读核验进度

PO要求尽量自行确认实际采用，不改原账/配置、不启共享、不安装。低风险只读任务；checklist为现有状态入口及权限→复用诊断产物→同一次当前策略能力/正式Service采用时间与版本核对→脱敏登记。无产品/测试代码变更，无需新CI或重复既有回归；不触发syncNow、重启、安装、配置写入、测试提醒或共享执行，不绕过ACL。

已核：宿主普通Windows身份非管理员；正式Service仍Running、原进程自10/18晚间持续运行。当前普通权限读取policy-lkg-v2.json被UnauthorizedAccessException拒绝；源码控制管道在读取命令前即要求管理员，未尝试绕过。旧两份只读报告均machineHasV2Capability=false、机器策略392，发生在本次Runtime修复前，不能用于确认当前结果。冻结源码与既有诊断产物可复用，不需要重装、重编译或增加诊断接口。

一次UAC实证已完成（PO明确批准）：复用既有ReverseReadAudit的--preflight，仅观察5.109秒、两样本；当前machineHasV2Capability=true、机器策略393，正式Service在线2.6.68.0、desired/applied均393、diskMachinePolicyVersionMatchesService=true。最近策略成功为北京时间10/19 01:27:17，晚于Runtime修复生产完成01:22:56；至01:27:39两样本一致，lastPolicyFailedAtMs=0。判定本项PASS：正式机器策略已包含V2，现有Service已采用对应策略；不是拿旧ACK或源码代替实测，不代表正式提醒/限制已验收。

只读及收尾：profile-config:52、shadow、原策略摘要保持；ExecutionGateSatisfiedByStoredInputs=false。productWrites=false、networkRequests=0、secretsExported=false；仅adminStatus及现有缓存读取，未发同步/交换/执行请求。诊断进程已退出，正式Service原进程未变且Running，无安装/重启、原账/配置或共享开关写入。脱敏证据仅受限本地保留，SHA-256 f908c6123d3820fc82ff7aba875551277e51ea883022ed40ad3705de55a1e396，不入Git。本轮仅更新任务板；无需新CI、测试、提交或发布。

额外观测仅登记不扩修：10/19本机应用桶仍提示NATIVE_SPECIAL_APPLICATION_CONTEXT_MISSING/SOURCE_PARTIAL，已知复合2180秒保留；网页学习97秒及应用其他来源0秒保留。Service影子核算学习97/复合2180/休息0，与现有输入相符。lastStableErrorCode为SHARED_QUOTA_POLICY_UNAVAILABLE，但该字段无本次失败时间且两次当前读取在线/策略成功，不能据此断言本次策略读取失败或故障复发。特殊应用上下文提示与实际执行验收分开，未定位根因、未改原账/算法/配置；正式执行仍未验。

## 2026-10-19 Runtime心跳保留共享V2能力（PO批准集中修复与仅Worker发布）

- 范围：仅修复`recordMachineHeartbeat`已确认的能力白名单遗漏。Native已上报`shared-access-policy-v2`，Runtime路由已转交，但持久化时被丢弃，导致现有机器策略无法回传；不修改Native、控件、Guardian、Pages、算法、原账、配置或共享开关，不执行migration或安装。
- 变更等级：局部接线修复，涉及能力协商。按顺序执行：①本条记录；②现有`runtime-api.test.ts`增加真实认证路由→隔离D1→机器策略回归，先复现遗漏；③只在`v2Repository.ts`白名单加入既有常量；④聚焦验证、backend typecheck、职责/差异核对；⑤集中提交推送、相关精确SHA CI通过后合并，仅部署Runtime Worker并核对发布清单与smoke。
- 验证要求：真实上报能力被保存并下发；相同心跳重复不改变策略内容/ETag；能力变化使旧ETag失效但不改变孩子配置及策略版本；空/省略能力可撤回，不替旧端宣称支持；未知能力继续过滤；未认证请求不能改变已有能力。必要本地测试仅相关心跳/策略用例，必要CI为现有Runtime及职责检查；不跑无关平台/浏览器回归。
- 完成口径：源码/隔离验证、CI、部署、正式Service采用分别登记；本批不启用共享，不以云端接线通过代替正式Service提醒/限制验收。完成后接续下方已准备的只读前提、临时差异与恢复方案，不重复安装。
- 本地结果：新增两例均在原实现复现“认证心跳200但D1丢失V2能力”；仅补既有能力常量后，同文件五项心跳/策略聚焦回归通过（82项不相关用例跳过），backend typecheck通过。新用例验证真实路由、持久化、策略下发及ETag，不是直接改数据库假造能力。源码审计：上述实施项Matched，无Deviated/Missing/Extra。
- 集中交付：源码f2d76b5a9d520cf41e4b40d2178be8faff4b928f，PR #296已合并为84430e1ee80125c44a9a6da2462ee9bb476bc04c。PR CI39149016756与合并SHA CI39149134834均通过（既有后端15文件/366例、typecheck、dry-run和gate）。生产39149238649成功，Runtime版本0364f5d4-cea0-4264-8f5b-9018b7865059；health与401鉴权smoke通过。下载清单逐项核对deployedResources仅runtimeWorker、两库migrations空、shadow准备false；Guardian、两套Pages、R2 latest及契约版本与上一生产清单相同。未安装/重载、未改配置/原账、未启共享。
- 正式Service准备继续：冻结2.6.68源码SyncPolicyOnceAsync在收到新ETag的200策略后按现有路径采用，无需提升配置版本；RequiresAccountingBoundary仅比较DefaultChildId/Users/AppPolicies，不把能力差异当原账切段。后续已由上方10/19 01:27一次授权只读诊断补齐当前采用实证；不冒称正式执行通过。复用下方已准备的临时差异、六轮和恢复顺序；仍待当前全局shared数量的只读SQL结果及正式启用的集中授权，不等待查询扩大修改、不启动提醒/测试程序。

## 2026-10-19 正式Service受控闭环：仅确认前提与隔离方案

### HornburgXW集中临时差异与轮次（方案已准备，不等SQL；尚未实施）

本条取代下方“精确参数待SQL后准备”和另建/切换用户的旧提案。当前只完成方案与源码一致性核对，不启用、不写配置、不安装/重载、不重跑已通过测试。对象固定当前HornburgXW、当前Windows会话、已安装2.6.68及当前控件。正式开始前备份B为当时真实完整配置、目标对象覆盖项（区分缺省/不存在）、全局开关及版本/摘要；不把旧profile-config:52当永远不变的恢复文件。SQL只约束是否允许正式启用，不阻断本方案编制。

参数D为开测时北京时间当天；每轮U为当前孩子当天由现有配额读取器提供的娱乐桶已知合计整数秒，R=floor(U/60)+1分钟。R只选测试门槛，不加工/保存用量；U须可读且范围/日期正确，否则不签发该轮。R至少1且严格大于当前已用，随后由专属目标的自然使用及正常结算跨过门槛；正常刷新延迟不判秒级计费失败，不改时钟、清零、补账或调用新摘要。跨日即停止并收尾，不临时扩成跨日测试。

| 唯一配置字段/对象 | 安全准备态与轮间态 | 正式提醒轮 | 硬上限轮 | 恢复 |
|---|---|---|---|---|
| Guardian SHARED_ACCESS_EXECUTION_ENABLED | 保持原值；当前仍不开 | SQL及集中授权通过后才允许临时true | 同左 | 恢复原值，不改变其他Worker绑定/代码 |
| sharedAccessRolloutV1.stage | shadow | shared，目标就位后才保存 | shared，目标就位后才保存 | B原阶段，预计shadow但以B为准 |
| timeQuota.daily[D].studyMinutes/compositeMinutes | null（不限） | 不限，避免普通工作类别因本批测试耗尽 | 不限 | B原值/原缺省 |
| timeQuota.daily[D].restMinutes | null（不限） | R | R | B原值/原缺省 |
| timeQuota.weekly.restMinutes | null（不限） | 不限，排除周额度干扰 | 不限 | B原值/原缺省；不顺手改旧weeklyRestQuota |
| timeWindows.daily[D]三类Windows | 各为00:00–24:00 | 同准备态，排除独立时间窗干扰 | 同左 | B原内容/原缺省，其他六天不动 |
| downtimeConfig.enabled | false | false | false | B原值，窗口列表等其他字段保留 |
| autonomyConfig.restrictedEntryConfirmationRequired | false | false，仅由真实额度门槛触发，不混入进入确认 | false | B原值/原缺省 |
| autonomyConfig.quotaOverrunConfirmationRequired | true | true | true，最终上限仍独立优先 | B原值/原缺省 |
| autonomyConfig.timeWindowAdvisoryEnabled | 保留B（窗口已全天开放） | 同左 | 同左 | 不写未变化字段 |
| autonomyConfig.softReminderTimeoutAction | end_rest | end_rest | 不影响立即硬上限 | B原值/原缺省 |
| forcedUsePolicyV1.enabled/reminderIntervalMinutes | true/1 | true/1，继续后按60秒真实强行使用等待下一提醒 | 同左 | B原值；不改旧restConfig提醒字段 |
| forcedUsePolicyV1.quotaOverrunMinutes.dailyRest | null | null：可确认继续，不设最终超量硬点 | 0：达到R即到最终点 | B原值；其余五个上限字段不动 |
| 原协议visibleResponseDeadlineSeconds | 仍固定60秒，不是临时配置 | 实际可见ACK后60秒 | 不用于硬拒绝延迟 | 不改产品有效期/倒计时 |
| 专属QuotaAcceptanceTarget.exe的现有应用身份配置 | 仅该确定目标临时受限娱乐；不设单应用日限、不封锁、不设特殊容器 | 同左 | 同左，走共享最终点而非旧对象封锁 | 精确恢复该目标原覆盖项，原来没有就删除临时覆盖，不能留下显式未归类 |
| 专属网页https://example.com/ | 先确认没有需保留的既有对象规则；正式网页轮仅临时受限娱乐 | 只用于网页轮，其他网页轮前暂停/保存无关受控内容 | 本轮不扩为全部浏览器强杀 | 删除本批新增项或恢复B；如已有规则不得默默覆盖 |

上述是拟批准差异，不是已获配置写授权；原值已经满足的字段不写，不改其他孩子、绑定/默认关联、现有日常对象分类/黑名单、配额算法、原账、计时/上传、SQLite或R2。应用/网页目标的正常临时分类可能按现有规则更新该目标本日/本周派生统计，不人工改原始记录。正式Service不含测试PID白名单，不能承诺操作性安排等同系统级隔离；HornburgXW是测试账号，开测前由PO自行保存工作，暂停其他娱乐程序/网页，不由工具擅自关闭日常应用。普通类别设置不限只减少本批配额干扰，不绕过既有黑名单/对象限制。测试发现目标不是约定目标或出现额外会话/受控来源时立即撤销本轮，不扩大处理范围。

每轮固定顺序：准备态shadow及不限→自然打开约定目标/确认实际前台与原生身份→PO确认就位→读取U并展示本轮R→仅经既有正常配置入口签发该轮新修订→等正式Service/控件采用该修订→观察产品实际提醒/动作。准备确认不签发提醒、不倒计时，不使用隔离工具自建协调器；5分钟offer有效期和60秒可见倒计时保持产品原值。签发后目标/范围/日期变化则中止，不能换旧策略或重发旧ACK补通过。普通应用目标使用与网页目标使用分开，不同时开两个竞争提醒目标。

| 顺序 | 正式链路/PO操作 | 通过证据 |
|---|---|---|
| 1 继续及重复提醒 | 产品提醒实际可见后，用中文输入法键入强行使用并确认；随后正常使用空白目标满一个1分钟重复周期，不模拟活动 | 正式Service当前修订及目标的visible→continue，目标仍存活；同一目标真实强行使用达到重复间隔后新提醒，不重复计用量 |
| 2 正常结束后取消 | 可接上轮的重复提醒；点正常结束，在原3秒内点取消；继续正常使用目标，观察61秒 | 对应NativeDispatch/NativeResult为cancelled/SHARED_CLOSE_CANCELLED，目标存活，61秒内不升级强杀；只读采样不产生动作 |
| 3 正常结束 | 重新就位并按正常新修订开轮，点正常结束，不取消 | 仅约定空白目标正常退出；正式回执与派发上下文一致，不能只看窗口消失 |
| 4 可见后超时 | 提前提示本轮不要点击；实际提醒可见后保持不操作 | 产品原60秒到期才force-close，目标实际退出且有对应正式结果，不从准备/签发时间提前计时 |
| 5 最终硬上限 | 新空白目标正常使用跨过该轮R；不做中文确认 | Service最终deny、Agent仅结束该目标、实际退出；不能把旧对象封锁当共享硬上限。硬限制Agent结果消息和Service接纳可见性单独记录，不冒用提醒回执 |
| 6 网页目标闭环 | 只打开约定测试页；按提示正常结束或不操作等待该页超时；不新增调试权限 | 当前控件/Service同修订，实际只关闭测试标签，Chrome主进程及其他标签保留，原网页账由正常关闭自然结算；不重做既有统计精度套件 |

每轮只记录本轮Service/Agent或控件身份、目标、修订、可见/选择/动作/结果；证据缺项明确未验，不能用隔离报告或393/393策略ACK代替。实际需要管理员只读采证时，与启用范围一次集中说明并获授权，本轮不弹UAC。人工只包含上述点击与真实自然活动，无密码/切用户/Service Worker/长诊断。计划预留约30分钟，届时以实际同步与就位安排为准；达到约定时限或出错就记录断点并收尾，不无限重复/安装。

恢复固定顺序：①先把HornburgXW退回shadow并放开本批临时门槛，等待终端实际撤销该轮，不以请求已发当成功；②通过正常版本条件写入仅本批字段的B原内容，删除仅本批新增目标覆盖/测试站点条目，按字段恢复缺省语义，不覆盖期间其他独立变更；③配置版本正常递增，不恢复旧版本号；核对云端/Service/控件实际采用恢复后的修订与内容摘要；④恢复全局开关原值，不改变原有其他绑定，读回核实；⑤确认无在途提醒/待执行动作后再收尾仅本批测试程序和页面，核对Chrome与日常程序仍存活、配对/默认/用户分配不变；⑥原账及测试期间自然产生的新账均保留，不清账/回滚。任一步恢复未确认，明确报恢复未完成，不转入下一轮或假称已收尾。

准备中查实的既有接线缺陷（本轮仅登记）：Native RuntimeServiceCoordinator.cs:3229/3246把shared-access-policy-v2纳入实际心跳；Runtime v2Routes.ts:952—962正常转发到recordMachineHeartbeat，但v2Repository.ts:517—518保存白名单不含该能力，:448下发又要求已保存该能力，Service ForcedPolicy因此缺机器能力不能执行。当前文件blob e4b6cc4bcd825e0dd13e49dd274c4148afae5238与已部署Runtime来源8e9f2f4对应文件一致；纯内存源码断言确认丢弃，没有读写真实库。本轮不修复、不部署、不手改库或能力。正式开测前需另批准最小Runtime能力接线修复及必要聚焦回归/单Worker发布；它不要求新Native候选、迁移或开启共享。SQL全局计数仍独立待PO回报，不影响本方案已完成。

最新范围裁决：PO明确HornburgXW本来就是测试孩子，允许复用当前Windows会话准备；下方“必须另用测试用户/孩子”不再是本批前提，不要求设置密码、切用户或重建Chrome配对。TOCSharedTest及Windows.Shared.Test保持现状、不删除。本轮继续仅只读准备，不启共享、不改配置、原账或绑定，不安装、重跑已通过测试、启动目标/提醒/关闭或弹UAC。先核现有页面关联范围、正式目标选择及现有持久状态/回执的采证方法；必要的云端阶段/全局计数只执行SELECT，权限不足登记、不中途申请登录。临时HornburgXW测试策略及正式执行仍需集中列出精确差异后另行批准。

本轮准备结果：正常Runtime页面刷新至10/19 01:04:11的设备反馈，Windows Service2.6.68.0及393/393；默认与William/AdminXW关联HornburgXW、Game成人、专属测试账户关联独立孩子，未改任何选项。quser实际仅William/session10 Active，Agent/Host同session10；控制台旧“会话活动”不能作为额外活跃用户证据。另一台列出的Mac属于T.xia，不进入本批；未把同机账户当其他机器。配置页面仍只读profile-config:52/影子。

正式采证接线已核对：Service ForcedPolicy/TickForcedV2签发，Agent Program分派，SharedForcedUseCoordinator在shared-forced-use-runtime-v2既有状态保存Reminder/Target/VisibleMono/NativeDispatch/NativeResult，ReceiveNativeResult校验派发上下文后committed；由该真实状态与目标进程存活核对提醒动作，不再运行自建协调器代替正式Service。硬限制sharedAccessDecisionV2另有Agent结果消息，Service当前分支不持久化sharedAccessV2Result；不能把提醒NativeResult当成硬限制回执证据。硬限制实际目标退出与回执接纳证据分别记录，当前仅为采证可见性边界，不先定产品故障或为此扩接口/制包。

云端只读缺项：仓库根npx --no-install因未装根级Wrangler退出，未安装；随后定位并复用backend已有Wrangler4.127.1及其help，仅SELECT测试孩子阶段/全局shared数量的实际请求被Cloudflare7403拒绝。未改认证/安全设置、未申请登录或重试写操作。全局当前数量仍未知，既有PO手工零数量只作历史，正式启用前需一次集中补齐只读结果；不把此项扩大成云端开发或阻断本轮其他准备。实际账号/标识及认证信息不入本任务板。

集中正式轮次限定：继续、正常结束后取消并观察61秒、正常结束、可见后60秒超时强制、硬上限、网页单目标标签结束及自然结算；不重跑读取/核算/隔离测试。所有轮先就位再允许正式策略生效，准备期不开执行、不延长产品有效期；当前未启动。未来临时配置白名单仅测试孩子stage、当天相应额度/时间窗、自主度与强行使用参数，以及专属目标必要测试配置；精确数值须以开测时真实输入和完整原配置备份计算并集中批准，不改其他孩子或已有对象分类。恢复只恢复内容并正常递增配置版本，不回滚版本号、不回滚原账；撤销执行实际确认后再收尾程序。账号、正式状态/目标与页面证据已清楚；仍不得称已具备启用许可或已完成执行验收。

PO要求一次说明必要条件、日常隔离及人工操作，当前不启共享、不启动测试、不安装/重测。固定2.6.68及现有控件，保留已通过证据。源码核对ForcedPolicy要求机器shared-access-policy-v2和有效shared阶段，TickForcedV2要求实际会话ACK；NativeSharedTarget读取实际会话前台目标，没有专属测试PID执行白名单。现有隔离工具自建协调器不能代替正式Service；当前日常用户上保持shadow可只读但不能完成正向执行，不通过伪造策略/ACK绕过。

推荐且尚未启动的安全运行范围：复用已建立的TOCSharedTest标准用户、Windows.Shared.Test孩子，不改机器默认及日常分配；测试用户首次登录前再次读回明确归属，不继承日常Chrome profile/标签或配对。该会话只运行专属空白目标与独立测试Chrome，测试Chrome只绑定测试孩子、只开测试页面。测试孩子全部在线来源和本机会话均须核清；测试期间不打开日常工作程序。云端总开关为Worker级而非孩子专属：开测前重新只读核原始shared配置数量，确保只有测试孩子可进入执行；旧零数量证据不能代替开测时结果。未来启用/测试配置与机器能力范围变更和收尾须另行集中明确批准，本轮均不执行；不以未知能力额外增加产品门禁。

正式编排与采证须先由根准备并自检：实际Service签发/Agent或控件接收/可见ACK/选择/目标结果/回执同一轮对应；准备确认本身不签发、不倒计时，每轮就位后才允许正式策略生效。不能把隔离工具的准备/签发路径直接冒充正式路径。测试只自然产生测试孩子新账，不改写、补账或清理原账。运行后先撤销测试执行并核实已生效，再收尾测试进程；日常配置/绑定前后比对，不以撤销请求已发送当恢复成功。

集中人工配合仅未来正式运行阶段：用户自行设置测试账户密码（不提供给代理）并首次进入测试会话，测试结束切回；测试浏览器如需家长授权由用户完成。每轮开始前明确提示并等就位；继续轮使用中文输入法键入强行使用并确认；取消轮正常结束后3秒内取消；正常结束轮点正常结束；超时/硬上限轮按提示保持不操作。网页单目标轮另行清楚提示，只允许测试标签，不结束整个Chrome。精确轮次/耗时及跨会话采证安排由根准备完一次提交，不现在要求PO切换或先点窗口；若不接受专属会话且不新增目标隔离能力，现版本不能承诺当前日常用户只影响空白程序，保持正式执行未验收而不重装/绕测。

## 2026-10-19 Windows剩余验收：只读自动核验（不启共享）

集中结果：只读自动核验PASS，未新增产品修复/测试/安装/发布。普通宿主系统读取确认Service Running/Auto，Agent与Host均当前session10，无验收探针/目标残留；已安装11组件全部2.6.68.0，逐SHA-256匹配固定66f0a81451d3406bf8b4d8af79d2626000fd421e候选，0版本/哈希差异。沙箱内CIM/服务枚举受限未视为产品故障；改用当前普通Windows身份宿主只读查询成功，没有Windows提权或UAC。专属测试用户仍禁用、LastLogon为空。

证据复用核对：2.6.67冻结源码归档与2.6.68冻结源码中Service/Core/Infrastructure/Windows/NativeHost的220个既有C#文件逐哈希相同，读取/核算不因本次IME候选重置验收。peer报告af41c81…83086及正式Service影子报告e294a358…ce454哈希与原记录相同；前者completed/peerObserved/范围与readAt匹配且产品写入/网络0，后者两样本×三桶6个等式均通过：10/18应用本机复合9955＋其他0＋网页204＝10159，readAt一致。仅复核10/18历史采样，不称10/19新实时采样。48项桶读取及30个去重恢复/准入案例沿用既有隔离证据，不重复运行。5份隔离动作报告completed=true，productConnections/productWrites/familySharingEnabled均false；继续后目标存活、取消后61秒不升级、正常结束、超时强制及硬上限目标退出结果均核对符合，前两份8f7752…60c9/d8512b…9b3f哈希匹配。未冒充正式Service执行。

本次正常页面只读刷新确认配置仍profile-config:52/影子、7日额度及提醒参数可读；设备页Service2.6.68.0、机器策略393/393，默认/3个日常账户与测试账户选中分配逐项保持。上批153项目录往返及配置读取PASS继续有效，旧表UNKNOWN/FAIL已被上批修复结果取代，不再列当前缺陷。设备页“产品级封锁未覆盖”由app-runtime-devices.js:39—42的productBlockingCapability上报字段生成，不等同共享V2会话能力ACK，不据此新增共享门禁、断言执行实现失败或安排安装。

剩余分开列：①正式Service执行NOT VERIFIED：正式策略触发→当前会话能力/目标捕获→Agent前台可见后计时→继续/正常结束及取消/超时/硬限制→回执、网页仅目标标签结束及自然结算。组件隔离已过，不需要把它们重新开发；当前不启共享、不改配置，不能触发这轮正向执行。②系统恢复沿既有延期：真实Service/Windows重启、断网/重连、锁屏/休眠；不能由30/48例夹具替代。③多用户/测试用户首次登录仍未验证，已明确不切用户，不当作当前步骤要求。每Agent共享V2正向协商回执及完整进程内策略摘要此前未由adminStatus提供，不能拿进程或393/393代替；后续正式执行轮核对，不新建诊断接口。没有新增实质失败。当前无需PO操作；未来仅在重新批准独立测试范围启用/运行条件后集中安排正式执行所需点击，现不索要密码、切用户、长诊断或新UAC。范围checklist四项Matched，无产品Deviated/Extra；只有正式执行及已列延期场景未验。

PO要求先区分已通过、仅隔离通过和正式Service执行未验。release只读低风险任务；checklist：①核对当前安装11组件与冻结2.6.68候选逐哈希、Service/Agent/Host会话和无残留验收进程；②复核现有双向peer、正式Service影子核算、隔离提醒/取消/超时证据完整性及精确产物对应，未变证据复用；③将上批统一配置/目录真实页面通过纳入当前清单，旧FAIL只保留为历史；④分别列正式执行、真实系统恢复和测试用户首次登录缺口，集中说明必要配合，不提前索要操作。必要命令仅只读文件/哈希/进程与报告断言、差异检查；仅在精确产物证据失效时补跑最小无界面隔离测试，无新CI/发布smoke。明确排除代码/测试修改、全量/E2E、故障注入、同步/执行请求、UAC、重启/安装/重载、切用户、原账/日常配置/共享写入及Mac。不新增治理文档，不提交/推送/部署，保留现有草稿。

## 2026-10-18 统一时间配置提前返回最小修复（独立Pages已发布并只读验收）

集中交付结果：提交a172e42674217c9b543f4008675073ff5169b75d，PR #295已合并至5e5bfb96322ce4ffd516e518385672f19b40c119；PR CI 39132007003、主线CI 39132090842及生产39132150070均success。生产清单仅runtimePages，部署6d8e6541-3779-441f-866f-16aec133f476对应5e5bfb9；Runtime/Guardian Worker、主Pages和R2 latest逐项与此前发布清单相同，两端migration空、sharedAccessShadowPrepared=false。没有安装、切用户、原账/配置写入或启共享。

真实验收PASS：沿用内置浏览器已登录独立Runtime正常页面，刷新一次后当前日常孩子apps加载153项编辑对象，正常导航access取得profile-config:52／影子核对，7天额度及提醒参数可见，不再UNKNOWN；DOM只读核对已有7天时间窗内容；返回apps仍153项且Chrome等名称可读，再返回access正常。没有点击保存或调用页面内认证接口。截图及发布清单保存在受限本地、不入Git。此结果只证明本次配置/目录读取，不代替正式Service共享执行验收。发布checklist四项Matched，无Deviated/Missing/Extra；PR附件登记受当前会话附件数量上限拒绝，PR本身正常保留。此验收结果留现有任务板工作区，未为证据重复发版。

本轮交付授权：PO批准集中提交、推送、合并并仅部署独立Runtime Pages，随后只读核对真实页面统一时间配置与应用目录。发布checklist：①仅本段、控制器与直接测试入提交，保留其他草稿；②相关CI通过后合并固定SHA；③生产清单仅runtimePages，Worker/主Pages/R2不变、无migration；④正常页面apps→access→apps核对配置可读及目录保留，不点保存。源码验证证据按精确文件哈希复用；部署与真实页面结果分别记录。不改原账、日常配置，不启共享、不切用户、不重复安装。

源码阶段结果（发布前）：源码及隔离验证PASS，当时尚未提交/部署，未据此宣称生产缺陷已消失；后续交付及真实验收以上方结果为准。app-runtime.js仅将原GET/错误处理移为loadSharedAccessState供旧分支及新目录access分支复用；新目录apps仍原两请求，进入access即读配置，解决已有managementLoaded跳过。component直接回归覆盖新/旧目录只读展示、先apps再access、失败后目录仍可见且不额外请求、重读恢复、视图/组件范围失效及销毁后迟到拒绝；所有请求断言GET且无桶查询。首轮新增断言误用了不存在的schedule-grid，核对真实schedule-editor修正后通过，未改渲染或放宽内容断言。

命令与证据：node app-runtime-management/console/app-runtime-component.test.cjs、app-runtime-policy.test.js、app-runtime-usage.test.js、computer-usage-view.test.cjs全部PASS；node --check及diff/scope通过。对比HEAD逐字确认loadUsage、renderAppDirectory、renderQuotaForm/renderSchedule代码完全相同，policy/usage/computer-usage-view及桶读取模块无差异。内置浏览器仅本地静态＋内存合成数据，经真实导航apps→access显示完整7日额度/版本，不再UNKNOWN；合成配置错误展示稳定原因后回apps，编辑器仍可见。既有HTML/CSS、布局/层级/文案未改，正常页面目视Matched；受限本地截图保留，临时页面/服务器已收尾。没有接触真实家庭、配置、原账或共享，无用户操作、切换、UAC/安装/发布。审计三个checklist均Matched，无Deviated/Missing/Extra。仅本任务板、控制器及直接测试属于本批；原PROJECT_MASTER/其他任务板草稿和未跟踪产物均保留，不随批提交。

standard-cloud/Build，低风险页面读取接线，不改产品语义。已证实新版applications非空时loadManagementState提前return，访问管理未请求shared-access-policy；另需覆盖先apps后access被managementLoaded跳过的同一入口问题。Checklist：①仅app-runtime.js提取原配置GET/错误处理供新旧分支复用，新目录只在access返回前补读；apps页面保持原两请求、不因配置失败阻塞目录，access进入时正常重读；②app-runtime-component.test.cjs覆盖新目录/旧目录配置只读展示、apps→access、错误及重试、迟到/销毁拒绝与无写请求；③核对桶/统计读取源码不变，运行component、policy、usage、computer-usage-view直接回归、语法/职责/diff，以及仅本地合成正常页面目视（不接真实账户）；④集中记录Matched及未部署边界。只改本任务板、页面控制器和直接测试；不新建接口、缓存或数据源，不改原账/桶算法/配置/Native/控件，不切用户、不启共享、不安装或部署，不跑全量/平台/真实家庭E2E，不主动提交推送。

## 2026-10-18 当前用户安全验收收口（PO明确不切换用户）

### 集中结果（21:13复核；本轮未启动任何提醒/关闭或故障注入）

| 项目 | 判断及证据边界 |
|---|---|
| 当前运行/安装 | PASS：11个安装组件全部2.6.68.0且逐SHA-256匹配冻结候选；Service Running，Agent和Host都在当前用户会话，无验收工具/空白目标进程。机器策略正常页面393/393。测试用户仍禁用、未首次登录；默认和日常分配未变。 |
| 控件取得应用桶、Native优先采用peer网页桶 | 既有实机PASS复用，peer最终报告hash af41c81…83086核对一致；旧2.6.67采样不是本轮新采样。b551e0a→66f0a81仅IME/按钮、直接测试及既有说明变化，Service/Core读取和核算源码无变化；本轮安装字节核对不冒充新的全链路运行采样。 |
| 同范围输入及独立影子核算 | 既有正式Service只读PASS；e294a358…ce454报告hash一致，本轮自动复核两样本×三桶均相等，复合9955本机＋0其他应用＋204网页＝10159；学习/休息0。缓存采用readAt与缓存精确一致。缺网页截止仍不造时间，周内旧日缺项仍不改完整。 |
| 恢复、重复/下降、范围隔离、限额准入 | 既有隔离自动化PASS复用：48项桶读取与30个去重联合案例，599/600边界、特殊/other排除、缺源按已知量、队列ACK丢失/重开不重执行等；不是生产重启/断网。装载器现文件hash c097766…03a与原裸入口通过证据一致，旧25响应临时适配限制已由正式装载接线取代，不再重复跑相同工件。 |
| 提醒/动作组件 | 隔离实机PASS：正常关闭、真实可见后60秒强制、硬上限空白目标退出；全屏中文继续、正常结束3秒内取消且61秒不升级，后两项含PO手工证据。两最终报告hash8f7752…60c9/d8512b…9b3f一致；投递/生命周期/关闭器负例和55条准备断言证据有效；冻结工具e8f1a2…26ad一致。所有报告productConnections/productWrites/familySharingEnabled=false，不当作正式Service执行通过。 |
| 日常孩子统一配置只读页 | FAIL（明确接线缺陷，不是桶计算故障）：独立Runtime访问管理加载完仍UNKNOWN。当前app-runtime.js loadManagementState在新版applications非空时提前return，未执行下方shared-access-policy查询。使用当前真实组件＋既有VM夹具内存复现：只发app-policy/applications两个GET、sharedPolicyRequested=false且页面UNKNOWN，真实网络/写入均0。源码定位已充分，不改产品/接口/配置或归咎云端。此项不属于“只剩正式执行”，需单独最小修复后复验。 |
| 正式执行剩余项 | NOT VERIFIED：已安装正式Service→Agent→控件在受隔离共享配置下的前台送达/计时、继续、正常结束/取消、超时与硬限制目标实际结果；实际会话能力正向协商与动作/回执同轮闭环；网页仅目标标签结束及自然结算。当前明确不开共享/不动日常配置，无测试PID白名单的正式触发入口，不能在日常用户上强行运行。 |
| 系统级恢复剩余项 | NOT VERIFIED/沿既有延期：实际Service/Windows重启、真实断网/重连及锁屏/休眠的全组合。已有进程冷重开与故障夹具不能代替这些；它们也不应被藏到“只差正式执行”中。Mac和历史P2不扩大。 |

本轮新增验证只有只读组件/进程/正常页面、报告完整性与逐桶比对，以及一次不写文件的当前组件内存缺陷复现；没有重跑已通过UI或安装。只更新本任务板，不提交/推送/部署；PROJECT_MASTER及既有未跟踪产物保留。结论：安全范围内当前可执行的核对完成，但并非全功能通过；有一项只读页面接线失败，正式执行与系统级恢复各有明确未验项。PO现在不需密码、切用户、点击窗口或提供诊断。

本条取代此前“现在安排密码/启用/首次登录”的下一步指引。当前仅release只读预检、既有隔离证据核验及必要无界面自动化；不切用户、不要求PO操作，不安装/重载/重启/断网/UAC，不改原账、默认关联、日常配置、产品或共享开关，不提交推送部署。保留专属测试账户现状，不自动启用。Checklist：①核对既有双向正式读取/影子逐桶核算的报告与哈希；②将30例恢复/准入、48项桶读取、正式装载器及25份wire、隔离提醒/取消/强制分别对应精确源码/工件，已通过且不变者复用，不按数量代替真实边界；③普通权限核当前安装组件/运行会话及正常页面只读状态，不能读的管理员项明确缺口，不绕过；④集中列已通过、仅隔离通过、正式执行未验及已延期项。只写本任务板，不新增治理文档；必要本地命令仅报告字段/哈希核验、安装文件及Service普通只读、现有非UI专项（仅证据失效时）和diff；不跑全量、浏览器动作测试或正式执行。发现实质失败先登记，不夹带修复。

## 2026-10-18 Runtime设备详情预登记表单（PO批准实施及独立Pages交付）

最后只读页面核对：预登记后先观测到Service392/393待下发，继续正常轮询后推进到393/393已确认；正式刷新读回测试账户仍只关联指定测试孩子，默认及日常分配不变。此证据是策略接收确认，不是未登录测试会话的执行验收。专属用户仍禁用且未首次登录；准备完成，集中提示PO在本机设置密码、启用专属账户并首次登录后切回，不收集密码。没有重复安装、启共享或修改默认/日常配置。

现场交付：7文件提交bf4ecb3，PR294合入master b876741；PR39127752873及精确master39127812905通过，生产39127866160成功。清单仅runtimePages（f7bbc094-cc40-4433-9d49-8c573141cda3），Runtime/Guardian Worker、主Pages、R2 latest逐项与上批清单相同，迁移空且共享准备false。正常页面提交及正式GET读回已确认专属账户关联明确测试孩子、protected/override/分配版本一致；默认关联和全部原有用户分配逐项不变。受限本地保存页面/清单证据，私有标识不入Git。本机专属用户仍禁用、LastLogon为空；首次登录及新账户会话策略实际生效未验收，不冒称已通过。下一步集中安排PO设置密码及首次登录，不重复安装或启共享。任务附件因既有100附件上限未添加，PR本身已合并；不删除旧附件。

实现/审计：设备详情只追加3必填字段和一个提交按钮；孩子空选、既有runtime认证、POST去重、正式用户列表读回及迟到隔离均已接线。组件控制器隔离回归、设备/网络/会话测试、语法、backend typecheck及跨模块边界检查通过。首轮组件回归查出渲染函数名误用，改为既有renderMachines后通过；不改后端或认证流程迁就测试。本地内存数据页面经正常表单提交成功，默认关联保持；桌面/390px目视Matched，窄屏宽390无横向溢出。Plan审计四项均Matched，无Deviated/Missing/Extra。待集中提交、精确CI、仅Runtime Pages部署和正式UI测试账户读回；源码通过不冒充实际登记。其他任务板草稿不随批提交。

standard-cloud/Build阶段，PO批准补正常表单、先隔离/目视，再集中提交推送合并并仅部署独立Runtime Pages。允许设备助手/真实组件/CSS/直接测试及既有设计/UI/任务记录；不改Worker、Native、主站、默认关联、日常配置、原账或共享，不迁移、不安装。checklist与最小测试契约见docs/DESIGN同日段。真实测试账户已创建但禁用且未登录；只有正常UI提交和读回明确测试孩子归属后再集中安排PO设置密码/首次登录。此前CDP会话读取被拒，禁止重试/绕过，不把新增表单做成任意API执行器或令牌导出入口。

## 2026-10-18 Runtime首次登录前预登记集中交付（PO批准）

PO追加明确允许当前Runtime页面内认证调用后，工具仍拒绝CDP读取会话材料/POST，实际预登记未执行；不再重试、不换工具或直接写库绕过。已由正常设备详情界面核对：专属测试账户未出现在已登记列表，机器默认关联和3个日常账户分配保持原状；本机测试账户仍禁用/未登录。此前仅实现HTTP入口而没有正常管理表单，是本批交付遗漏的实际调用入口，不能称现场分配已通过。安全后续需在设备详情增加预登记表单并仅补发独立Runtime Pages，通过现有页面认证封装提交，再读回核对；此项超出此前仅Runtime Worker部署授权，待PO确认，不提前修改代码/发布Pages或索要密码、登录。

交付实况：本批5文件提交610bc26467c463ef9ef687518485bcd6f411f376，PR293合入master 8e9f2f4c8a95f2fa816aee819988198b7d8e762d；PR及精确master Runtime CI通过。生产39126667618成功，Runtime版本58b9692e-80a1-4013-8b6e-782d03f17283；清单只有runtimeWorker，Runtime/Guardian迁移均空，Guardian/两套Pages/R2 latest与上一生产清单相同，health200。不安装、不启共享。专属Windows标准账户已创建且保持禁用、LastLogon为空，派生用户标识只存受限本地；准备前后默认孩子及日常用户分配相同。首次创建命令因Description超过Windows48字符限制而在创建前失败；普通权限预检/缩短描述后补一次UAC成功，未重复创建、未改安全策略。实际云端预登记未执行：页面内读取现有会话认证并调用API被工具审核拒绝，未改用其他工具或提取凭据绕过；已集中请求仅当前Runtime页面内复用既有认证、不导出令牌的具体授权。等待期间不启用账户、不安排密码/首次登录。PR附件因线程已达100附件上限未添加成功，PR本身已合并，不删除既有附件。

PO批准集中提交/推送/合并并仅部署Runtime预登记入口，继续准备专属测试用户；不改机器默认关联/日常配置，不安装、迁移或启共享。源码只含machineUserRegistration.ts、v2Routes.ts接线、runtime-api.test.ts及本设计/任务记录，其他既有草稿和候选产物不随批提交。原子预登记直接保存同家庭明确孩子override；正常policy读取及首次上报不覆盖为default，已有其他归属拒绝覆写。12项聚焦回归（10新＋2既有）、backend typecheck、职责/引用边界和diff已通过，精确文件证据复用；审计Matched，无Deviated/Extra。发布仅选择Runtime Worker，Pages/Guardian/migration/bootstrap/shadow均关闭。生产入口、真实账户创建及派生标识、精确分配读回与首次登录分别记录；未通过前不要求提前登录，不以源码测试代替现场绑定。密码/首次登录由PO集中完成，不收集凭据。当前提交/部署尚待执行。

## 2026-10-18 PO批准：唯一IME候选＋独立用户/孩子正式验收

最小预登记源码及隔离验证完成，尚未部署或真实登记。仅新增machineUserRegistration.ts，v2Routes.ts为现有users集合接入POST，直接回归仍在runtime-api.test.ts；不改Native、页面、表结构或原有上报算法。最终命令 `npx --no-install vitest run test/runtime-api.test.ts -t 'machine user preregistration|enrolls .* machine and applies default and per-user policy without exposing SID'`：12通过（10新用例＋2既有分配回归，73未运行）；backend `npm run typecheck`、精确5文件standard-cloud职责检查、app-runtime-boundaries通过。首轮6通过/1失败是测试用D1.exec按行解析多行触发器导致，改为prepare.run后故障回滚用例通过；产品未为测试放宽规则。真实隔离D1覆盖明确孩子预登记→正常policy→首次上报、默认及日常分配不变、重复及不同孩子并发、跨家庭/吊销/错标识拒绝、策略变更竞态、事务失败整体回滚；不是实际Windows首次登录证据。审计：三个源码/测试checklist均Matched；无Deviated/Extra。剩余为生产入口交付、真实账户与派生标识取得、精确分配读回和首次登录；本轮不提交推送/部署/安装/设置密码/登录、不改原账或日常配置、不启共享。暂不要求PO配合。

PO已批准最小首次登录前预登记入口，进入standard-cloud实现/隔离测试阶段：允许Runtime新增机器用户预登记模块、既有users集合POST及直接回归，设计先记入docs/DESIGN.md。使用Service真实派生用户标识，不按用户名绑定；用户/明确测试孩子分配/策略版本原子提交，正常首次上报不能转为默认孩子。中风险（身份分配写入），必要测试仅预登记及原机器分配专项、backend typecheck、diff。无UI/Native/网页记账变更，无新表/migration、不安装/部署/启共享；不改机器默认关联及日常配置。真实账户创建、受限派生标识核查、生产入口可用和首次登录仍未完成，隔离通过后集中报告，不提前要求PO密码或登录。

TOCSharedTest首次登录隔离核查：现有流程不满足“只关联Windows.Shared.Test”。Service RuntimeServiceCoordinator.cs的SupervisorLoopAsync只报告sessionLauncher.Enumerate()返回的交互会话；Runtime v2Repository.ts:346 syncMachineUsers在首次登记时由机器default_child_id插入默认分配；:295 updateUserAssignment要求runtime_machine_users_v2已有对应用户。v2Routes.ts:587用户集合仅GET，:608单用户仅PATCH；console/app-runtime.js:510/887/888只有默认关联和已登记用户分配，没有登录前预登记入口。因此不能先登录再改绑，也不改变日常默认关联、伪造上报或直接写库。当前只读确认测试账户不存在、Service Running；未创建账户、设置密码或安排首次登录，未启共享。最小待决事项是安全预登记并精确分配测试用户的途径；若需补产品入口，须单独确认范围，不混入本轮准备或要求重复安装。当前仅源码/入口核查及记录，无产品变更，无新增测试或发布。

总开关前置核对收到PO的guardian-db Studio结果，记PASS_WITH_MANUAL_EVIDENCE（未提供数据库采样时间，不冒称本会话直接查询）：当前家庭6个档案中1个shadow、其余legacy，专属测试孩子version1/legacy；configuredSharedProfiles=0、currentFamilySharedProfiles=0。因此此快照没有潜伏shared档案，“尚待D1结果”的阻塞已解除；原OAuth权限缺失仍未修复，但不要求为本项重复授权/查询。完整手工结果仅受限本地，不入Git。PO最近要求仍先不启共享/不改日常配置，本轮未动任何开关。

后续先准备TOCSharedTest及其精确分配，不复用日常账户；首次登录前必须核对现有“新用户默认关联”不会把测试活动先计给日常孩子。Service只上报交互会话（SupervisorLoopAsync），不把“本机创建了账户”误认为云端已登记或已分配；未确认新用户分配前，不安排测试登录或启用。此项只读核对，不自行改默认关联、伪造用户上报、写原账或扩产品接口。当前测试用户仍不存在，Service Running；无需重新安装或让PO取长诊断。

具体候选获PO追加授权后，2.6.68一次原地升级完成：installerExitCode=0、受保护备份及保留核验通过、Service Running。根独立复核11个已安装组件版本/哈希均与候选匹配；18张相关表的原账/冻结数据/outbox保留、机器凭据及密钥字节不变、用户分配/应用配置保持，后台outbox状态允许自然前进。安装包装进程已退出，正式Service/Agent已重新运行；没有重装/重载控件、同步命令或启共享。安装事实以native-upgrade-2.6.68/install-result.json和preservation-safe-summary.json为准，旧候选核验记录installed=false只表示核验时尚未安装。

PO已回复手动授权，但本次Wrangler等待localhost回调超时退出，凭据文件未更新；一次后续SELECT仍7403，无查询结果。不能写成PO未批准/未操作，也不换自动化浏览器或提取浏览器凭据绕过。为停止OAuth循环，已准备受限本地shared-rollout-readonly.sql供PO在guardian-db Studio手工一次执行，只返回familyStages及全库/当前家庭shared数量，不含其他家庭明细。尚待该结果，不启总闸、不创建测试Windows用户或安排切换；无再安装。该SQL仅临时核查材料，不是新增治理文档或产品接口。

PO已批准补充D1权限后仅做既定SELECT。Wrangler用--browser=false发起范围account:read/workers:write/d1:write及自动offline_access的OAuth，保留现有Workers用途而不申请无关能力。本次内置浏览器打开dash.cloudflare.com被持久权限拒绝；不得换浏览器自动化、原始CDP或其他方式绕过。已集中请PO手动打开本次授权链接，无需密码/token；CLI等待回调。授权完成前不执行后续查询、不改总开关。TOCSharedTest仍未创建、Windows.Shared.Test未启共享，日常配对/配置保持。此前“安装尚未发生”为历史准备状态，由本条安装完成事实取代。

实际准备结果：按PO追加明确名称授权，内置控制台新建Windows.Shared.Test成功，仍为兼容阶段/未启用共享；未复用Gate.Test，未修改原用户绑定。当前机器可见受保护日常账户均归同一日常孩子，另一日常账户为成人不保护；日常孩子控制台为shadow/尚未启用共享。综合访问只读导出SHA256=b67a7d95d5744436e305017134bd7834af72f9654b36b129a129259bb8614139，仅受限本地，不入Git；该导出不含内部rollout字段，不能代替完整门控核对。TOCSharedTest尚未创建，凭据设置及首次登录留到前提齐备后集中安排，不使用无密码账户或复用系统账户。

唯一2.6.68候选构建/核验通过：source=66f0a81451d3406bf8b4d8af79d2626000fd421e，契约1.56.0及原锁hash保持；674归档源码文件逐件匹配，11内嵌组件版本/字节hash匹配发布输出，UpgradeCode与2.6.67相同且ProductCode不同。MSI SHA256=8e7893fc305405dce6f023c305c264910ad15204a19f0de3ecfa3ae4cb54fb91，Burn=855096091cba6cc2c600178e82e1531209bbbcccc56b35041c17f544021ad47f，内部未签名/latestEligible=false，不托管。首轮长路径构建在Agent runtimeconfig复制失败，无安装包；同提交短路径/关闭并行重建成功。核验脚本首轮COM辅助函数泄漏返回值导致升级标识误判，独立只读属性确认正确，修正工具后复验通过，不重建候选或修改产品。

安装尚未发生：工具审核要求PO明确批准具体2.6.68候选，已拒绝RunAs启动；没有UAC/安装进程，当前仍2.6.67，原Service/Agent未重启。已准备原受保护备份及保留核验脚本，仅机械替换版本/SHA、移除旧35秒诊断；语法检查通过，没有使用ExecutionPolicy绕过。等具体候选授权，不经间接方式绕过拒绝。

正式执行的新前提：只读取得当前生产Guardian版本c1c7035e-2f1a-4c7b-9434-b7ddb9ff2cb7（100%）的绑定，SHARED_ACCESS_EXECUTION_ENABLED=false，SHARED_WEB_CONTRIBUTIONS_ENABLED=true。总开关是生产Worker级别，非测试孩子独占；profiles.ts拒绝总开关关闭时保存shared阶段。因此仍不切总开关、不部署或提前实测。现有OAuth可读取Workers但D1查询7403，未获得全库预设shared数量/当前家庭原始rollout核对；不把被总开关压成shadow的展示当原始配置证明。已集中请求具体候选安装及仅SELECT所需D1授权；此授权不等于生产总开关变更授权。日常配置/配对/原账不变，共享仍关闭，两个测试对象的首次登录/人工轮尚未开始。

批准集中制包、一次升级及测试范围短时启用；先确认日常孩子共享关闭，不改原账、现有配对和日常配置。复用66f0a81已通过的中文输入/按钮补丁及既有隔离证据，只制作一个固定源码候选，排除所有未提交草稿。角色release；允许候选临时产物、两份既有记录，以及新增专属测试用户/孩子的正常设置；不改产品代码、协议、算法或测试代码，不迁移/部署/托管/R2。测试配置和机器级能力的必要变更只能在确认日常范围不受影响后进行，结束关闭并核实；不能把发送恢复请求当恢复成功。

顺序checklist：①只读正式控制台/本机基线，确认所有本机日常分配及共享状态；②固定候选来源/契约锁/安装hash并制包验真，保留原数据备份；③建立专用标准Windows用户、隔离孩子及该用户独立浏览器，现有用户/配对不重绑；④一次安装后核对组件/保留数据；⑤PO集中完成首次测试登录及人工继续/取消，测试前明确就位，实际可见才计时；⑥只在测试范围短时启用正式Service链路，捕获正向证据；⑦关闭测试执行、确认实际撤销和无残留、日常基线保持。任一隔离前提未确认不启用；失败只记录该断点，不重复安装或重测已通过项。原账不手工改写，真实测试仅自然生成测试孩子新账。

必要验证：复用精确源码对应补丁测试及隔离实机证据；仅新增候选构建/组件hash/安装保留/测试范围安全检查和批准的正式实机smoke，无无关全平台或全量CI。准备阶段不启动提醒/关闭；运行证据、部署安装、测试结果分别记录。当前尚未制包/安装或新增测试对象。

## 2026-10-18 正式共享执行验收准备：入口已核对，尚未启动

本轮仅只读准备，未运行新UI/执行测试，不安装、不修改产品/原账/配置或共享开关，不申请追加UAC。复核Native main 66f0a81451d3406bf8b4d8af79d2626000fd421e，本次所查Service/Agent执行文件无未提交改动；保留其他工作区草稿。当前安装Agent 2.6.67.0 DLL仍为79a635185ded5e3c0d9e5ab1b8ecf79b4f6c761dcaec4a6b0b15082b58b24180，与上次基线相同；66f0a81的IME提交及按钮刷新补丁尚未安装，不能让PO在旧输入实现上重复测试。

真实接线：RuntimeServiceCoordinator.cs:1901每秒调用TickForcedV2；SharedForcedUseV2.cs:19—24要求机器shared-access-policy-v2及当前有效stage=shared，:217—243读取当前前台目标、独立核算并发出offer/decision；SessionAgent/Program.cs:585—600转入PresentV2Async/ExecuteV2Async/ApplyAccessV2Async，:673—674按契约声明V2支持；Service :1447和:1480—1495分别处理正式回执及能力ACK。代码声明支持不等于本次实机已读到ACK，保留该证据区分，不增诊断接口。当前shadow与机器能力标记关闭，不会进入正式共享执行。

安全范围核对：正式Service取当前前台应用，已有ControlLoop公开控制分支没有专属目标测试触发命令；现有隔离工具ControlledLiveSession.cs:97自行建立协调器，Program.cs明确不连接产品，不能称作正式Service驱动。工具自有PID/hash保护不自动覆盖正式Service路径。切到shared后会按孩子策略和各会话目标运行，不能承诺天然只影响专属空白程序；不得为验收绕开策略闸门、伪造ACK或把原工具再跑一遍当正式全链路。

后续最小顺序（本轮不执行）：①如PO批准，一次性交付已测IME补丁，不逐零件安装；②先确定不影响日常对象的隔离测试范围，明确临时机器能力/孩子stage变更及恢复权限；没有安全范围不启用；③正式Service驱动提醒可见后计时、中文继续、正常关闭/取消及超时，仅限事先确认目标，复用已通过隔离组件证据；④网页单目标结束/自然结算独立核对，不结束整个Chrome、不手工停账；⑤恢复经授权的配置并只读确认撤销和收尾。原配置语义不改，不以未知能力ACK额外新建门禁。本轮不重新跑测试、构建/提交/部署；仅本条及Native既有记录和diff检查。

## 2026-10-18 正式Service只读预检完成（未启用共享）

PO批准的唯一只读UAC已完成：冻结诊断工具两次采样，共5.083秒后正常退出；不触发同步，productWrites=false、networkRequests=0、secretsExported=false，无安装/重启/原账或配置变更。正式Service 2.6.67.0在线；北京时间18:14:25与18:14:30两样本均期望/已应用机器策略392一致，当前唯一活动Windows会话为受保护同孩子会话且Agent存在。配置中有两个同孩子账户，不等于两台机器或两个当前活动会话。

当前日输入核对（整数秒）：应用本机复合9955＋应用其他来源复合0＋网页复合204＝影子核算复合10159；学习/休息均0。两样本逐桶6次比较均一致，当日Complete=true、无原因码。应用本机结算截至18:12:47.918；网页未提供结算截止，不拿读取时间替代。本机/其他应用来自同孩子同周期已保存的独立输入缓存，不反减制造分项，不冒充进程内原子快照。Service应用来源local+cache、网页来源cache，网页采用readAt与所读网页缓存精确相同；本次证明缓存被实际采用，不声称本次捕获了当前连接peer直传。

双向直读既有实机证据继续复用；另复核历史native-peer-observation-20261017T192340Z.json，completed/peerObserved=true，最终webOrigin=peer且范围/读取时间匹配，SHA256=af41c81ca34ffcc9350c6cecc797d206578360e964aa9daef6ec4abe84883086。不得与本次cache样本混称同一轮新双向证据。

当前策略profile-config:52、stage=shadow，磁盘策略摘要有效/已生效；机器共享V2执行能力标记=false，执行门槛关闭，属于本次不启共享边界，不是读取失败。adminStatus不返回每Agent共享V2能力ACK及完整进程内策略摘要，相关项仍证据不足；进程/通用策略ACK不代替执行能力协商。不为补证新增接口或修改开关。10/12—10/16历史不完整仍单列，不影响本次当日完整结论。

本次脱敏报告native-service-preflight-final-20261018.json仅留受限本地，SHA256=e294a358c3dade2da4bbfaccfab35edff790638bb577642e3e9a1182701ce454；工具正常退出，无残留。只读预检完成，不等于正式Service提醒/限制正向执行通过。IME补丁正式安装、正式执行全链路、网页目标关闭/自然结算及真实系统重启仍未由本次验证；不自动安排安装或启共享，PO本轮无需继续操作。

以下为取证前的工具准备记录，所述“待UAC”已由上方结果取代：

## 2026-10-18 正式Service只读预检准备（历史状态）

范围为双向读取、独立核算输入及会话/能力，只读，不同步/安装/重启/改账/改配置/启共享，不启动目标或执行动作。普通系统查询已确认Service Running、安装2.6.67，Agent及NativeHost同处唯一活动Windows会话；同孩子归属、当前策略/实际采用仍须原管理员adminStatus及受保护同范围缓存，不能由进程存在或旧快照推断。现有工具依赖Core/Infrastructure hash与安装版一致，无参数/非法模式均在读产品前退出2。

可自动化部分完成：11个安装组件均2.6.67.0，逐hash已读取；Service/Agent/NativeHost实际存在，Windows仅一个活动用户会话。只声明本次版本与关键组件基线一致，不虚构缺失最终候选清单的重新全量parity。既有03:24/03:49正式peer采用及控件接收应用桶证据复用，不说成本轮新采样。源码确认本域local+other、对域peer/cache二选一、影子Project逐桶核算且不含余额持久化；管理员控制管道ACL/令牌检查仍严格，不重复调用拒绝入口或绕过权限。

临时工具只改原Program.cs增加两个独立应用缓存读项，使用正式已安装QuotaBucketsProtocol；标记persisted-input-cache-not-live-reader，避免把文件快照说成进程内实时结果。按项处理缺失/坏缓存，不清空别的有效读数；不调用QuotaBucketsReader业务方法、不算余额、不反减。最终Release编译0警告/错误；8项合成解析检查（正常本机/other、错孩子/周期拒绝、非法none拒绝、坏包装类型/非对象拒绝、完整零none接受）及2项无效参数保护通过，产品读取/写入/网络请求均0。源文件空白/冲突检查通过，无诊断进程残留；最终DLL SHA256=735365c92bf803674766fcf01e6e3c31df25e22d07487b2630fcb0d896404115，EXE=5d59162767227be6d213e51d7415e4facbe58d530e95ec0a790498e04d6e69e7。Core/Infrastructure依赖与正式安装逐hash相同。未运行--preflight有效模式，未弹UAC；只需PO最后批准一次该EXE的受限只读UAC，最多45秒/两样本，读取adminStatus、当前孩子/日期范围策略及网页/应用已有缓存，输出脱敏到受限本地。取证结果允许partial，不为强行补齐ACK加产品接口，也不把缓存分项当作进程内逐项采用的直接证明。

既有临时reverse-read-audit的--preflight仅有网页缓存和混合影子，缺应用本机/其他来源分项。本次最小工具补齐：复用同一scope和正式QuotaBucketsProtocol，仅读application-local/application-other既有缓存（不调用业务读取器、不联网或写产品），限定当前孩子/本周、大小/格式，分项保留读取截止/原因，坏缓存只记该项不可读；不相减生成应用来源证据。必要验证只Release编译、合成缓存纯函数自检及无效参数保护、依赖hash/源码/文档diff；无UI/CI/全量，不运行有效参数模式或弹UAC，待最后一次集中告知PO授权。adminStatus不暴露当前每个Agent的共享V2能力ACK，保持此证据缺口，不新增接口或拿Agent进程/策略ACK冒充执行支持已协商。

## 2026-10-18 剩余两轮人工验收通过（仅隔离组件，未安装/启共享）

第二轮live-cancel-three-steps-20261018.json最终phase=finished/completed=true，无错误：正式end_rest/request-normal-close→cancelled/SHARED_CLOSE_CANCELLED，cancelNoEscalation61s=true。工具按真实单调时钟持续61秒轮询正式协调器Effect=none并核实自有目标存活，通过后才正常收尾空白目标；当前目标已退出是Dispose正常清理，不是取消后升级强杀。测试进程0。第一轮live-fullscreen-handoff-fixed-20261018.json continue/none/targetAliveAfterContinue=true且completed=true复核通过。两轮均由PO实际点击，工具只读观察/核验，记PASS_WITH_MANUAL_EVIDENCE与正式回执/真实存活检查相结合，不以窗口或意图单独宣称执行结果。

受限本地最终报告SHA256：第一轮8f7752f918645d9abebae40b606291d98c19e985a49fa4059d5d138eb2f860c9；第二轮d8512b288caf831a062a61c14138c5951d9e3d666c1cdf673a9471e26d2d9b3f。报告不入Git。

复用同一冻结Release DLL e8f1a20245f403636392893ea10c9ee9a070b9a3e88b89b3b05b5fd253fe26ad，无源码/产品/安装/配置/原账/共享开关变更。本轮只登记两个既有文件并diff检查，不运行新测试、提交或发布。已补齐本批全屏中文继续及原3秒取消且61秒不升级的隔离实机证据；正式安装IME补丁、真实Service→Agent→控件共享正向、网页单标签结束/自然结算与实际系统重启缺口仍保留，不因此宣称Windows全功能完成。PO当前不需再操作；不自动安排安装或启共享。

以下保留本轮观察过程，不再表示当前仍等待：

PO重新授权并已明确只点开始→正常结束→原3秒取消；沿用冻结Release，不修改工具或时限。唯一live-cancel-three-steps-20261018.json/runId03e75ddc95b347f6ac1e0086b295c986：开始1792317822436→前台确认1792317822474→签发1792317822580；正式捕获/visible ACK成功，resolution=end_rest、effect=request-normal-close，正式回执cancelled/SHARED_CLOSE_CANCELLED。工具进程23568实际存活并进入cancelled-observing-no-escalation-61s；已告知PO不用再操作，尚不把取消回执当61秒观察通过。只读等待同一进程，不重复启动；无安装/原账/配置/共享变更。

## 2026-10-18 PO授权重开取消轮：未收到正常结束意图，超时保护停止

新报告live-cancel-handoff-fixed-retry-20261018.json，runId 7ac63c9f0caa405da0ba36b1aee081e3；同冻结工具，开始1792317623093→前台确认1792317623128→签发1792317623229，捕获/正式visible ACK成功。Computer Use仅只读见真实正式窗口：输入为空、确认继续禁用、正常结束可用；未代点。之后未收到end_rest，60秒后resolution=timeout_end、effect=force-close，场景保护UNEXPECTED_SCENARIO_CHOICE终止，executionInvoked=false，无实际强制关闭，未进入取消或61秒观察。不能根据缺少意图推断PO没有点击或判取消实现失败；尚缺点击后的用户可见行为。上一轮收到continue、本轮超时均保留，取消项仍Missing；不自动第三次重测、不临场改工具/时限，不安装、不改账/配置、不启共享。

## 2026-10-18 第二轮已安全结束：收到继续，取消项尚未验证

PO授权后使用同冻结Release启动唯一cancel-close准备窗，runId fd5baaaf0af540468db38ad600302331。已提前说明正式提醒点正常结束→原3秒内取消；没有代点。实际开始1792317485374→前台确认1792317485422→签发1792317485555，captureVerified及正式可见ACK成功；随后正式状态返回resolution=continue、effect=none，并非本场景要求的end_rest。场景保护以UNEXPECTED_SCENARIO_CHOICE安全终止，completed=false，未进入ExecuteV2或出现取消窗口，不能算取消通过，也不能仅据此判产品按钮或取消逻辑故障。报告live-cancel-handoff-fixed-20261018.json保留受限本地。第一轮继续通过保持有效；不自动重测、不临场改工具/产品或加长时限，不安装、不改原账/配置、不启共享。

## 2026-10-18 人工全屏继续通过，进入第二轮取消准备（PO批准）

原同一报告live-fullscreen-handoff-fixed-20261018.json已核实finished/completed=true，无错误：开始1792317370894→前台确认1792317370932→正式签发1792317371026（默认有效期300000ms），captureVerified=true，resolution=continue、effect=none、targetAliveAfterContinue=true。准备等待18502秒未消耗正式有效期；最终工具/目标均正常收尾。用户已授权继续第二轮，先打开独立cancel-close准备窗，由PO点击开始才签发；提前告知正式提醒点正常结束后须在原3秒内点取消，随后自动观察61秒。仅冻结Release DLL e8f1a202…26ad和自有空白目标；不安装、不改原账/配置、不启共享。第一轮通过不等于取消或正式生产Service共享链路通过。

## 2026-10-18 修复后人工继续轮准备已打开（等待PO，未签发）

按既有两轮授权，核对最终DLL e8f1a20245f403636392893ea10c9ee9a070b9a3e88b89b3b05b5fd253fe26ad、318214ms同路径全屏通过报告及无残留后，启动唯一fullscreen-continue人工准备窗。当前实际进程4872/Session10存活，runId ac6fc3cff018421f8ac2385e2a11b1f1；现场只读确认phase=await-human-start-no-formal-issue，Signed/CountdownStarted/SharedEnabled均false。报告live-fullscreen-handoff-fixed-20261018.json在受限本地，不入Git。PO自行点击开始，随后在新正式提醒中中文输入并确认继续；尚无人工通过结论，不重复启动或自动点击。第二轮待第一轮实际结果通过后另行提前提示。

后续自动续轮已连续核实同一进程存活、尚未开始且无错误；不把等待当失败、不重启或代点。当前需要PO操作而非代码重试，自动目标转等待人工，保留原准备窗；收到PO反馈后读取同一报告，不重开。等待期间只读复核Native HEAD66f0a81451d3406bf8b4d8af79d2626000fd421e，本批三个源码/测试文件干净；正式TimeOnChromeAppRuntime服务Running，Service及SessionAgent仍2.6.67.0，已安装Agent DLL hash79a635185ded5e3c0d9e5ab1b8ecf79b4f6c761dcaec4a6b0b15082b58b24180，不同于隔离补丁7ffa1f…586af8。故隔离两轮即使完成，也不能关闭“补丁安装/正式Service共享正向/真实网页标签结束自然结算/实际系统重启”缺口；本轮不安装或切共享，不以这些缺口阻止已授权人工轮完成。

## 2026-10-18 全屏前台交接工具修复（同路径自行验证通过，人工两轮仍待执行）

本次Matched：最终Release DLL e8f1a20245f403636392893ea10c9ee9a070b9a3e88b89b3b05b5fd253fe26ad。只修工具的自有目标前台交接；签发前Hide准备窗并复核/恢复自有目标，确认后Close，不依赖隐式Owner交还。--check-fullscreen-handoff直接调用ControlledLiveSession.RunAsync的fullscreen-continue：同Start(true)、同准备标题/按钮、同Computer Use实际点击、同捕获/签发/正式Presenter，唯一分歧在实际visible ACK后：自检验证位置/期限并撤销，不调用执行器。旧普通窗口UiAsync结果不作本轮全屏通过依据。

最终同工件全屏真实准备318214ms，期间实际最小化并恢复（Computer Use截图/窗口树确认，不模拟时间、不用程序调用按钮处理器）；299314ms仍未签发。点击确认1792298775710→目标前台交接确认1792298775768→正式签发1792298775987→到期1792299075987。当前轮captureVerified/formalVisibleAck/samePosition/targetAliveAfterHandoff均true，completed=true；默认300000ms及visible后60秒未改。自动化前台/可见回执不冒充PO人工可见性、中文继续或3秒取消通过；专属无边框全屏不等于独占游戏全屏。未通过/旧工件/主动停止的报告保留，不算最终通过；此前失败时具体抢焦点窗口仍无法追溯。

最终Release编译0警告/错误；原门禁16项回归、3个CLI保护及5个临时源文件空白/冲突检查通过，固定8项产品/目标hash均不变。源代码审计Matched：开始前无正式状态；显式开始后仅自有目标可交接；交接失败不签发；自检与人工共用正式入口；不放宽捕获/身份/期限、不执行关闭效果。只改5个临时工具文件及两份既有记录，无产品代码、安装、原账/配置/共享或云端变更，无提交/发布；人工两轮不自动启动。

最终全屏/门禁报告SHA256分别d22128a19f8cfefcb70a621285da587b4b999503ef4ad804b7dfc5c021477a5a、5a99f9a6f1ad80e51c603c3fdd022d6492a21d190a9a38fec5d5a2c2448455b3，受限本地、不入Git。最终自有测试进程0。

只改受限临时验收工具。Checklist：①将自行UI验证接到ControlledLiveSession的正式fullscreen-continue入口，保留同样的Start(true)、准备窗、实际点击、延迟捕获/签发/Presenter路径；仅在实际visible ACK后撤销并结束，禁止调用关闭效果；②查清全屏交接的真实断点，最小修复并保留目标PID/开始时间/会话/hash核验，准备阶段仍不签发、不计时；③由Computer Use操作自有准备窗自行验证，覆盖全屏准备失焦后再开始及等待超过5分钟，记录正式签发晚于开始、固定目标、窗口位置、实际visible ACK与原300秒/60秒期限；④检查固定8项产品/目标hash及无残留，再安排人工。变更等级为临时工具接线，允许Program、ControlledLiveSession、AcceptanceStartGate及直接自检/自有目标辅助器和两份既有记录；必要本地测试为Release编译、原门禁聚焦回归、同路径全屏UI验证、hash/diff检查。无CI/全量/安装/生产smoke，不改产品代码或目标程序、原账、配置，不启共享，不自动安排PO重测。

接线缺陷已由源码确认：开始后仅Close准备窗，假定Windows会把前台交还外部进程的Owner；没有显式恢复/交接及完成确认。旧报告只证明当次未取得前台，未记录被谁占据，具体抢焦点来源仍不能追溯。最小工具修复：开始点击验证成功后先隐藏准备窗，再由工具自身UI逻辑仅恢复/激活已持有句柄并复核PID/启动时间/会话/路径/hash的自有空白目标；不使用AttachThreadInput、权限或系统设置绕过。确认前台后正常关闭准备窗，才允许原捕获/正式签发继续；交接失败则明确终止，不能签发。全屏目标保持全屏，不改固定目标程序或产品程序集。Computer Use仍用于实际按钮输入与观察，不靠测试代码直接调用按钮处理器替代。

## 2026-10-18 人工继续轮：开始已确认，签发前台交接失败（未通过，第二轮未启动）

PO反馈第一轮已操作后，只读核对最终报告：start-attempts记载一次START_CONFIRMED，confirmedAtMs=1792274516171；但正式入口在RequireForegroundAsync的20秒核对内未取得自有目标前台匹配，最终OWN_TARGET_NOT_FOREGROUND、completed=false，没有formalIssuedAtMs、visible ACK或continue结果。不能把准备窗的操作认定为正式继续通过，也不能归因于PO输入。签发前失败，没有执行效果；工具/目标已正常退出，第二轮未启动，不自动重试。

此前自动UI自检使用OwnedAcceptanceTarget.Start(false)，人工第一轮使用Start(true)；因此“普通窗口自动交接通过”不足以证明全屏场景交接通过。具体由哪个窗口占据前台未记录，不能进一步臆断根因。需先补齐同一全屏路径的工具交接证据，不能延长产品有效期或60秒期限。受限本地报告live-deferred-fullscreen-20261018.json SHA256=d095bf3a4acd069017a4889980bfe9d6e84a24d86f6e42fcac1b19c78194b974。此次仅只读定位及登记，无代码修订、安装、原账/配置/共享变更；正式继续/取消仍Missing。

## 2026-10-18 验收准备与正式签发彻底分离（实现/自行验证通过，人工两轮待安排）

最终结果Matched：Release冻结DLL8c64cce3aa345ca8ae8693c1780eb34385a7edc6d2eb10c996c9d3689d455d1e；后续唯一运行入口为临时工具bin/Release/net8.0-windows，旧Debug仅留历史、不作运行指引。最终模拟等待310001ms的16项及真实后台等待310088ms的17项相关断言通过（重叠项不累计成33个独立场景）；真实等待完成仍formalIssueCallsAfterWait=0，确认1792273019245，正式签发1792273019247，到期1792273319247，原300000ms有效期/visible后60秒未变。准备没有正式ID/offer/协调器/租约；开始时新建并重新捕获。重复/拒绝/停止及59999/60000ms边界仅测试效果返回，没有执行关闭。

最终同工件自动UI接线通过，位置与前台承接、实际目标固定及fresh visible ACK具备证据；humanVisibilityConfirmed=false，不替代人工继续/取消。3个CLI保护、编译、源码空白/冲突及文档diff检查通过；8个固定产品/目标文件hash不变，测试进程0。真实等待/模拟/UI报告hash分别9237720f8f186c17c8c63f3f61588c92e3d56a8ded09dda0bc1a0438d268d457、21a6033b8a72c7fb621c4a049a8a7ee178b724a3d03c1c28313bdab9d507ceaa、911bd26bcba7a6eadbaa6e51770a034c36ae3b97d11fcc78e32d67abd53060d5；均受限本地，不入Git。首次窗口定位失败及修正前真实等待结果保留，最终不混用旧工件。只改5个临时源文件与2份已有记录，旧源码有受限本地备份，未修改产品或安装包，无提交/推送/安装/部署、原账/配置/共享操作。

下一次集中人工两轮：①准备确认后点击签发，在同位置新正式提醒中中文键入“强行使用”并继续；②独立准备确认后点击签发，正式提醒点正常结束，在原3秒内取消，随后由工具观察61秒不升级。逐轮提前提示，由PO点开始；现在不自动打开人工窗口，不重复已通过的正常关闭/超时/硬限制动作。人工与正式Service共享全链路仍独立Missing，不能以本次工具回归通过关闭。

源码与最小自检进度：5个临时源码文件完成，Debug/Release均0警告/错误；最终Release DLL 8c64cce3aa345ca8ae8693c1780eb34385a7edc6d2eb10c996c9d3689d455d1e。模拟310001ms等待的16项回归及三个CLI拒绝保护通过，真实310秒最终Release后台等待中，无窗口/目标/执行器。短UI自检第一次位置断言失败，原因是原CenterScreen仍覆盖定位；只在临时Loaded处理设Manual后第二次通过，保留第一次失败报告，不降断言。最终自动UI确认先点击、再签发1次；前台交还/重新捕获/正式可见ACK和位置一致通过，位置Left750/Top375/Width420。点击1792272693226，正式签发1792272693450，到期1792272993450（300000ms）；不执行关闭，humanVisibilityConfirmed=false，不能算人工通过。最终工件不再修改，等待真实回归完成后登记总结果，不重做已通过实机动作。

本条取代旧“先生成正式offer再挂ACK并保留同一Window句柄”的工具方案。Checklist：①准备仅创建工具WPF界面及真实确认输入控件，不构造正式offer/轮次/来源租约/协调器，不设置有效期或响应期限；②显式开始按钮记录点击时间及具体拒绝原因，成功后正常收起准备窗并自然把前台交还自有目标，重新捕获该目标；③只有完成开始确认后才创建协调器并走原Poll/Presenter签发新轮次，正式窗口在已确认位置显示，原300秒有效期及可见ACK后60秒不变，不复用准备ID、不写产品私有授权字段；④仅工具聚焦回归：模拟等待>5分钟、后台真实等待310秒（无窗口/目标/关闭器）、重复/拒绝/停止与原期限、一次短的自动UI衔接自检（无执行效果）。代码/报告冻结后再安排两个人工场景，不在本轮让PO重测。

变更等级为临时验收工具，预期改Program/ControlledLiveSession/AcceptanceStartGate/AcceptanceStartGateChecks/OwnedAcceptanceTarget及两份既有记录。复用产品/目标固定hash与此前执行证据，不跑CI/全量/安装门；不修改产品程序集/目标程序、原账/配置/云端或共享开关，不安装/部署/新建治理文档。准备与正式窗口不再承诺同一HWND，以新正式状态走原入口及位置衔接替代旧实现；这是本次“点击后才签发”要求必需的工具调整，不更改产品提醒规则。

## 2026-10-18 人工门禁正式两轮（第一轮已准备，未开始计时）

PO回复第一轮已操作后，只读核查并未通过：仍phase=await-human-start-same-reminder，界面明确“窗口前台或本轮上下文未通过核验”，原按钮禁用。05:20:58核对原offer于05:14:18.668生成、05:19:18.668到期，状态offered、visibleAt/visibleMono均null。开始回调先检查旧offer有效期；准备等待仍耗用正式5分钟有效期，是验收工具准备/正式阶段未分离的缺口。无开始点击时间/具体拒绝项记录，不能把当前过期反推为点击当时唯一原因，更不能称中文输入失败。第二轮不启动，使用本runId停止入口安全收尾，不反复重测。本轮不修产品或放宽产品有效期；后续应在工具中分离准备与正式签发，而不是给正式有效期加长。

PO批准剩余两轮、逐轮提前提示。冻结DLL8248ca47…10334一致、无测试残留后，Normal启动fullscreen-continue，报告live-gated-fullscreen-20261018.json/runId700bc747f0824033a02dc1f0c550d6f9。Computer Use只读见同一实际提醒的准备提示/开始按钮，原继续与正常结束禁用；phase=await-human-start-same-reminder、preparationCountdownStarted=false、Session10。保持该窗口等待PO自行确认并点开始，不代点/不自动计时、不重建或重测。取消轮尚未启动，第一轮成功后另行提前提示。不安装、不改原账/配置、不启共享。

## 2026-10-18 验收工具人工准备门禁（实现/自行验证通过，人工轮未启动）

完成Matched：临时Program/ControlledLiveSession/AcceptanceStartGate/AcceptanceStartGateChecks四文件接线；实际同一提醒加入“确认能看到并操作，开始本轮60秒”。准备阶段挂起原visible ACK、不轮询、不执行、不设12分钟自动结束；原输入框保留，产品选择按钮按原ACK规则保持禁用。点击开始后验证同窗口前台/原scope及自有目标与有效期、刷新来源租约，ACK仅放行一次；不重建提醒或覆盖产品授权字段。现有offer有效期不放宽，过期只拒绝开始，准备阶段不自动结束目标。每轮须单独显式开始，退出旧自动串行及无提醒硬限制动作入口（旧通过证据保留）。未改产品程序集或目标程序。

最终工具编译0警告/错误；20项门禁断言通过（含模拟准备超过60秒无效果、明确开始后原59999/60000ms边界、重复/并发、失败及停止，不是20项实机动作）；自动串行/无提醒hard-limit/缺动作授权三个入口均退出2且未生成报告。一次实际Presenter准备UI自检及Computer Use只读目视通过：同窗口/原输入框/等待提示/开始按钮、原两选择按钮禁用，实际ACK挂起20秒仍转发0；该自检无协调器/目标进程/关闭器，humanVisibilityConfirmed=false，不能冒充人工已看到。准备UI自检按其专用程序收尾，正式门禁等待没有自动收尾计时，测试进程/窗口0。

冻结Probe DLL 8248ca474c099f424ad4afe4752013b81ea3376f311df1e33850aec55bc10334；EXE仍83f5a80b…ff2b2d（框架启动器未变，必须同时核对DLL）。最终headless报告hash a92f430c6cf3cd5b124eaf94c6bb979132520ae96625c22c38b4aef950dc98b2；实际UI报告hash 4255910ec5c97c07ecfc127b6cfa8c20d93d8a87db9b37d372143bb76cf79352，留受限本地。8项固定产品/目标hash全保持。范围审计：工具实现Matched，无未批准Deviated/Extra；继续和取消人工实机仍Missing，未开始、不以自检替代。无安装/重载/产品修改/原账/配置/共享改动，无提交或发布。

变更等级：仅受限visualizations临时验收工具/直接自检及既有记录。Checklist：①Program.cs入口保持动作显式授权，增加门禁自检入口；②ControlledLiveSession.cs在实际Presenter窗口附加准备提示及“确认可见并开始本轮”按钮，原输入框可试输，原选择按钮在ACK挂起期间仍禁用；③新增工具门禁：实际visible ACK先挂起，人工开始前不转发ACK、不轮询超时、不调用执行器，无自动开始；点击时再次验证同一个实际提醒前台、专属目标/上下文仍有效，再刷新既有来源租约并放行同一ACK，保留原60秒；准备失效拒绝开始，不放宽产品有效期；④聚焦自检ACK挂起、拒绝/重复开始、取消、同窗口接线、原60秒边界且不执行关闭，编译/hash/diff核对。准备阶段无12分钟自动收尾，显式停止入口保留；正式开始后才启用原运行保护。

只改临时工具，不改产品程序集/目标程序/原账/配置/Service/云端/共享开关，不安装/发布/新增治理文档。复用此前固定程序集证据，不跑CI/全量/原55项或人工正式场景；必要UI接线自检仅显示准备提醒、无目标进程及关闭器，不需PO操作，提前提示。完成后重新冻结工具并汇报，人工验收另行开始。

## 2026-10-18 集中隔离实机执行（暂停动作，仅定位前台可见性）

PO已确认无倒计时空白窗口可见且可拖动，随后授权正式测试；正常关闭该预检窗口，以Normal启动同一冻结工具的fullscreen-continue，报告live-fullscreen-confirmed-visible-20261018.json。程序visible ACK后60秒未收到输入/继续，保护终止UNEXPECTED_SCENARIO_CHOICE，未执行该轮强杀；取消轮不启动、不再重测。新发现验收准备衔接不足：预检确认的是旧WinForms空白窗口，正式轮重新创建目标和WPF提醒，不能把旧窗口可见性当作新提醒送达证明。后续须让实际提醒先处于无倒计时待确认阶段，再显式开始计时；现冻结工具没有此步骤，本轮不临场改工具/产品。无安装、原账/配置/共享改动。

PO明确反馈未看到测试窗口，本轮只读定位、不重测/启动倒计时。固定补丁源码SharedReminderPresenter.V2.cs:47–50、115–125在ContentRendered时检查输入桌面名Default、IsVisible/未最小化、IsActive及当前foreground HWND相同，随后发送visible ACK；隔离工具ControlledLiveSession.cs:130–143立即交给协调器并开始60秒，没有“PO已看到并可操作”的独立准备步骤。Computer Use截图可捕获被遮挡窗口，不能据截图证明PO看到。此前“真实可见后60秒通过”限定为程序侧ACK后计时/专属目标退出通过，人工送达及可操作前台仍Missing；不能归因PO未及时输入。

当前只读系统证据：console会话10为Active，Explorer/ChatGPT/执行宿主相关进程均会话10，无测试进程残留；当前WMI仅返回一个活动显示连接。旧报告只保存目标PID/启动时间、captureVerified和visible单调时刻，未保存当时会话/桌面/屏幕位置及持续前台轨迹，故不能证实当时窗口在PO实际观看桌面，也不能武断归因另一用户、另一屏或隐藏启动。未查明具体不可见原因，不宣称已定位完整根因。

恢复动作前先采用无倒计时、无关闭行为的可见性准备步骤，明确确认PO能看到并操作专属目标后才开始实际提醒；这是待实施的隔离工具安排，不改变产品60秒语义。本轮仅登记诊断与证据降级，不修改工具/产品、安装、原账/配置或共享开关。

PO回复已就位后，复核冻结EXE/DLL一致、测试进程0，启动live-fullscreen-continue-ready-20261018.json。实际专属目标捕获和visible ACK成功；两次只读窗口观察均输入为空、确认按钮禁用，没有注入输入或点击。原60秒到期后resolution=timeout_end，保护规则以UNEXPECTED_SCENARIO_CHOICE终止该继续场景，未执行该轮force-close。继续项仍未验证，不把未捕获用户交互诊断为产品输入失败；取消轮未启动，先核实PO实际是否看到/能操作该窗口。两次继续场景未完成后不自动重试、不改工具/时限；原三项通过证据不变，不安装、不改原账/配置、不启共享。

本轮实际结果：正常关闭、真实可见后60秒超时、隔离600秒硬限制三项通过，均捕获固定子进程并确认其实际退出；前两项正式终态为completed/SHARED_TARGET_EXIT_CONFIRMED，硬限制actualExitConfirmed=true。productConnections/productWrites/familySharingEnabled均false。对应live-normal-close、live-timeout、live-hard-limit-20261018.json已保存受限本地。全屏继续首轮未及时输入，不记通过；原3秒取消尚未启动。已集中询问PO是否就位，待确认再运行这两项，避免无人操作仍开始倒计时；不重复安装、不临场修工具。

PO授权仅专属空白目标，不安装、不改原账/配置、不启共享。固定工具hash核对一致，无残留后开始。首轮全屏目标捕获、实际提醒显示通过，但未在60秒内完成继续输入，结果UNEXPECTED_SCENARIO_CHOICE/timeout_end；保护规则未执行该轮强杀，继续项不记通过，不临场改工具。正常关闭轮通过：实际点击end_rest、request-normal-close，专属目标退出，回执completed/SHARED_TARGET_EXIT_CONFIRMED。超时轮进行中；取消与中文输入需要短时人工配合，留到自动项结束后集中安排，已提前说明调整顺序。均为冻结补丁组件的隔离实机，不是生产Service共享联合通过。

启动时工具审批超时后返回执行成功；沙箱启动正常关闭轮未出现进程/报告，宿主权限重试同一工具后正常。没有重复安装、改安全设置或改工具；失败与未验证项保留。

## 集中验收隔离工具接线与自检（2026-10-18，准备通过，待集中实机）

只修改受限visualizations中的现有探针/空白目标及本任务板、Native既有验收记录，不修改任何产品文件或家庭数据。顺序：①空白目标增加明确--show-fullscreen模式，默认仍无UI退出；②隔离V2协调器→正式Presenter→专属目标→可靠结果回执接线，实际关闭入口必须显式--allow-owned-target-close且只接受本工具Process.Start返回的目标PID/启动代际；③准备模式不启动可见目标/关闭器，不执行真实关闭，自检正式文件捕获/锁、V2状态、60秒边界、取消/重复/冷恢复、错范围/过期拒绝及组件哈希；④编译、自检、无参数保护及目标/进程清理检查。仅工具测试，不跑CI/全平台/安装门，不新建治理文档/分支/工作树，不安装、改原账/配置或启共享。本轮先完成准备，真实关闭/取消/超时/全屏窗口留到最后集中实机安排。

准备结果Matched：两个临时工具编译0警告/错误；最终--prepare-acceptance完成55项准备断言（非55个独立产品用例），无参数/缺少动作参数/未知场景三项入口保护通过，非法入口没有生成实测报告。正式V2显示/效果工厂、实际文件捕获/代际锁、固定8个文件hash、目标PID/启动代际/会话/身份/hash拒绝、599/600阈值、未送达/可见后60秒边界、可靠终态与实际独立子进程丢ACK恢复均有准备证据。未直接设置Presenter目标/授权字段，仅读取正式固定目标额外核对为本工具子进程。空白目标已支持明确全屏参数，无自动退出；输出不可覆盖或越出隔离目录。停止入口只写本次runId对应的隔离停止标记，不接受PID/任意路径。

准备过程中的一次编译失败（引用了固定程序集不具备的草稿参数）及一次冷重开夹具失败保留：进程重启不重置Windows开机单调时钟，夹具却把它改成3，被正式校验拒绝。仅修夹具为同次系统启动连续时钟，产品时钟校验不变；独立子进程复验通过，不推定真实Windows重启已通过。最终冻结报告controlled-acceptance-readiness-frozen-20261018.json completed/liveSessionReady=true，visibleTargetsStarted=0、executionInvoked=false、productConnections=false；无测试进程残留。Probe DLL hash 8fe839938ff640809097ff71c203d3aa5eb4ea12a7f7f9eb98c664ee2bfbefbe，目标DLL hash e4975d659c69dd31d9a7beb5c2dfcfa0ddd9bf62ef62643d2da873f4698cf390，产品Agent hash仍7ffa1f…586af8。

实际运行支持逐场景--controlled-case（同一套冻结工具，不临场改代码）：fullscreen-continue→normal-close→cancel-close→timeout→hard-limit；每项均需显式--allow-owned-target-close，未授权本轮尚未运行。逐项启动是为了提前明确取消/等待轮，不是逐零件安装交付。控制程序只连接隔离对象与本轮空白目标，所有测试状态在专属acceptance-state/live-state目录，不读写真实配对/账本/配置/缓存或网络。真实可见/60秒/3秒取消/退出正例仍Missing，不能用模拟时钟或预备断言标通过；已安装版本与正式Service共享正向缺口继续保留。

最后一次操作安排：预留连续10–15分钟；首轮中文键入“强行使用”并确认继续；我提前说明取消轮，必要时PO先点正常结束再在原3秒内点取消；超时轮不点击、不切换目标，等待60秒；取消后的61秒观察与其他操作由我完成。隔离实测不需安装/重载/UAC或长诊断；正式Service额外只读权限仍单列，不混入本次。PO可随时要求停止，工具撤销本次隔离会话并正常收尾自有目标。准备已完成，待PO确认集中实测开始及仅专属目标动作；本次没有启动实测。

## Windows 集中受控实机验收方案（2026-10-18，准备阶段，尚未执行）

PO本轮只要求准备方案：不重复安装、不改原账和家庭/终端配置、先不启共享；本轮仅更新既有文档并做diff检查，不启动目标、UAC、重启、关闭或产品测试，不提交/推送。变更等级为文档/验收设计；不跑CI、全量、Mac或生产profile E2E。

### 目标、基线与证据分层

- 固定源码修复66f0a81；已核验隔离SessionAgent hash为7ffa1f9487d9d79471de3434455ea7871c8932bc3f9e94ec5b76932365586af8。已安装环境最近核验仍2.6.67且不含本次IME补丁，执行前只读核对，不把隔离程序集通过说成已安装版本通过。
- 一次验收分为现网只读核对及隔离实机组件动作。前者不写配置/触发同步；后者使用补丁程序集、合成身份和仅驻留隔离进程的测试条件，不接入真实Service/设备凭据/家庭缓存，不向现网发送伪造执行命令。正式Service共享正向链路因开关关闭，本次不能验收通过。
- 复用已通过的中文输入、重复/撤销/迟到ACK、投递失败重试、关闭器拒绝与取消负例、30/48项相关证据；不为凑数重跑，不按重叠案例生成累计通过率。

### 唯一动作目标及我先完成的准备

只允许现有“配额联合验收 · 专属空白目标”（QuotaAcceptanceTarget）及其本轮新建实例成为结束目标；无文档/工作内容、无产品引用/网络/原账配置读取、不设自动退出计时器。Chrome、Codex、正式Service/Agent、其他应用与进程树均不允许成为目标。隔离提醒窗口只是控制面，不是终止目标。

现有目标只支持--show普通窗口，现有V2探针只支持显示/撤销/消息/负例；尚无可用的正向V2关闭/取消联合工具。先由我在受限临时工具内补齐专属目标绑定、正式V2生命周期→目标捕获→执行器→回执接线，以及无边框全屏模式，逐项自检后才安排PO。不能靠反射覆盖目标/授权字段、直接触发Click、延长产品3秒取消窗口、放松前台/身份检查来制造通过。不同身份、错范围及过期上下文先证明拒绝，才允许执行专属目标正例。此准备尚未实施，不为工具问题制包/安装。

每次动作锁定本轮目标的实际PID/启动时间/可执行文件与捕获代际，按原执行器完成核验；不得按窗口标题或进程名模糊选择。目标不匹配、未前台、不可见或证明失败即记未验证/失败并停止，不另找用户程序代替。测试文件校验仅用于固定目标和证据，不新增产品归属规则。

### 集中执行顺序与判据（工具就绪后约10–15分钟）

| 顺序 | 项目与目标 | 通过依据 | PO操作 | 本轮定位 |
|---|---|---|---|---|
| W1 | 实际Service/控件只读预检 | 当前版本、同孩子/周期及来源读取可解释；配置摘要及共享关闭状态前后相同。沿用已有双向读取证据，不触发立即同步 | 通常无；普通权限不足时最后集中申请一次只读UAC | 现网读取证据，不是生产执行证据 |
| W2 | 专属空白目标无边框全屏，补丁V2提醒到前台 | 实际可见/前台与visible ACK一致；使用中文IME确认后目标仍存活、只产生continue，不发生关闭 | 就位后正常中文键入“强行使用”并点一次确认继续 | 隔离组件实机；不声称独占全屏游戏已覆盖 |
| W3 | 专属目标正常结束 | 点正常结束后仅正常关闭该目标；同一PID确实退出且回执一致，不因失败改为强杀 | 点一次“正常结束”；能由Computer Use完成则无需PO | 隔离组件正向，接线工具尚待准备 |
| W4 | 新专属目标取消正常关闭 | 原3秒取消期内取消后目标仍存活；超过原60秒也不补强杀，不重放该轮动作 | 提前说明取消轮，看到“取消正常关闭”即点一次；优先由工具完成，不临时让PO找按钮 | 隔离组件正向；不修改3秒时限 |
| W5 | 新专属目标真实超时 | 只从成功可见确认开始计60秒；未到期不结束，到期按timeout动作仅结束该目标，并核实退出；未送达不触发该动作 | 该轮不点击、不切到其他程序，等待约60秒 | 实际计时/执行组件，不是家庭共享已启用 |
| W6 | 专属目标硬限制正例 | 复用既有配额阈值用例，在隔离输入下核对只结束该目标，不注入真实用量；记录正式回执和退出证据 | 无，必要时仅让测试目标保持前台 | 不改真实额度或配置；尚待隔离接线 |
| W7 | 重连/冷启动去重 | 能由隔离进程重开完成的项目自动做，旧执行不重放，重发结果只确认一次；复用已通过恢复证据 | 无；不重启真实Agent/Service/Windows | 隔离恢复，不冒充实际系统重启通过 |

### 本轮明确不测，保持缺口

- 已安装正式Service→Agent→控件在真实共享启用后的正向准入、提醒和限制全链路。共享关闭时只能核对不执行的闸门，不能绕过或把隔离策略投给现网。
- 控件按真实共享决策强制关闭单个专属测试标签及其原账自然结算；不结束Chrome、不用跳转替代关闭、不向扩展注入伪造命令。相关自动化证据保持，不冒充实机通过。
- 正式Agent/Service及Windows的实际重启、锁屏/休眠和独占全屏游戏；Mac独立。不在本轮为补证中断真实采集或重启浏览器。
- 本次IME补丁在已安装版本的验收。没有安装就保持“未安装”，不通过复制覆盖安装目录/临时切换正式服务来绕过“不重复安装”。

### 安全退出、原账边界与PO一次配合

只读预检不写产品；正常使用测试窗口可能被现有计时自然记录，不手工改写/补账/删除/回滚任何真实原账。现有配置不改，也就不安排“测完恢复配置”的写操作；前后摘要异常立即停止，不擅自回写。测试动作只终止专属目标，探针有界退出；目标本身不能按计时器自退，否则无法证明执行效果。

任何目标不明确、非目标窗口受影响、配置变化、成功回执但目标未退出，立即停止并保留证据；同一失败不反复让PO重做。超时/失败收尾只关闭本次自有工具和目标，不结束其他程序或进程树。每项分别标通过/失败/未验证，保存精确程序集、目标关联、可见/动作时间、实际退出、回执及配置未变证据，不保存输入文字、凭据或长诊断。

工具全部准备并自检后，最后一次集中告知PO：预留连续10–15分钟；准备好时做一次中文输入确认、一次取消操作，超时轮保持不操作；其他点击/核对由我完成。若确需管理员只读预检，再集中申请一次只读UAC，不弹安装器；不要求Service Worker、复制长诊断、改分类/额度/绑定或重载扩展。当前仅方案就绪，不需要PO现在操作；正向目标关闭须在工具就绪后的集中执行范围确认中明确包含，不能把本次“准备方案”当作已经授权实施这些动作。

## 后续提醒投递／重试自动化验收（2026-10-18，PO继续）

复用66f0a81对应补丁程序集及既有隔离探针，补当前V2真实窗口的ACK发送失败保持动作禁用、无成功ACK；选择发送失败恢复正常结束按钮、重试仅成功一次。仅探针注入回调IOException，Computer Use只点击探针自有窗口，不连接Service或调用关闭器，不改产品、原账、配置，不安装/重载/启共享。先编译及无参数防误启动核对，再一次集中运行；旧5项、7项及30/48证据复用，不重复全套。真实Service联合、全屏、正常关闭/取消及超时动作仍独立待验，不把这些补验替代它们。

投递专项7项已通过，继续只做关闭器的无执行负例：执行关闭、空目标、非法动作、自身进程、失效授权及已取消token，目标只能为探针自身或null；检查明确拒绝/取消返回，不调用其他PID、不发送WM_CLOSE或Kill。只证明安全闸门，不证明真实应用已结束。Service→Agent目标携带observation/generation且Closer独立核对进程、前台、文件及Chrome排除的接线已只读核对；正常/强制成功仍需专属目标实测。

本轮完成：投递7项及关闭器安全负例7项分别通过，不与旧证据合并计数。实际Computer Use两次点击仅形成一次已接收end_rest意图；发送失败正确恢复重试，中文确认门槛没有放开。关闭器负例只针对探针自身或null，全部拒绝/取消，无目标关闭。两个报告completed=true，编译0警告/错误，SessionAgent hash不变；没有新的产品修复或安装、配置/原账改动、共享启用。本轮记录未另提交，产品HEAD仍66f0a81；其他草稿保留。

集中待验：最终安装环境的真实Service联合；全屏及可见后60秒；专属目标正常关闭/3秒内取消、超时及硬限制实际结束；Agent/Service/Windows实际重启去重。当前不需要PO取数或点击；这些运行态动作不在“保持共享关闭/不改配置/不安装”的边界下擅自启动。届时一次安排配合和测试目标，不重复安装或长诊断，不把消息/窗口测试冒充执行验收。详细结果已记Native既有WINDOWS-QUOTA-SOURCES说明。

## 中文输入确认最小修复（2026-10-18，PO已批准）

PO现已批准集中提交本批修复并继续验收；先不安装。本轮仅提交Native两处产品文件、直接回归及相应说明；保留其他草稿。沿用同源码/程序集5项及真实中文IME窗口证据，继续核对隔离提醒恢复/执行边界，不修改家庭原账/配置或共享开关。真实目标关闭、完整Service/Windows重启等需要运行环境变更的项目最后集中列出，不用缺口阻塞无侵入核查。

Native本批已集中本地提交`8a27edf`，只含3个代码/测试文件与本节对应Native说明（共4文件）；此前验收日志、其他草稿及架构任务板仍原样保留未提交，未推送。下一步复用已核验补丁程序集，只在既有隔离探针补当前V2入口的错范围拒绝、同提醒重复不重开、撤销后迟到可见ACK及改范围后旧offer拒绝；不调用ExecuteV2/关闭器，不以这些窗口边界测试冒充真实Service重启或目标关闭通过。

上述补充已完成：同hash补丁程序集实际V2入口7项通过，含错scope拒绝、真实visible ACK/窗口激活、重复提醒不重开/不重复ACK、撤销关闭、迟到ACK不重开及改scope后拒绝旧offer。探针退出0、completed=true，未执行关闭器/连接产品；编译首轮缺System.IO引用已修正，随后0警告/错误。当前无需PO配合；未通过项仍为最终安装后的正式Service联合、全屏、专属目标正常关闭/取消、超时/硬限制，以及完整Service/Windows重启。仅无侵入隔离入口边界补齐，不声称上述未验证项通过，不再安装或启共享。

最终本批提交为`66f0a81451d3406bf8b4d8af79d2626000fd421e`：把本轮7项隔离证据并入尚未推送的同一个提交，取代上文中间SHA `8a27edf`；仍仅4文件，无额外产品变更。没有push、安装、配置修改或共享启用。

仅Native ForcedUseConfirmationBox完成输入校验及V2确认状态→按钮接线，补组合输入、最终同值提交、删除重输、粘贴/程序设置拒绝回归。先干净隔离源码聚焦测试，再补丁程序集集中窗口实测；不重复安装，不改原账、配置、Service、云端或共享开关。旧两轮探针失败保留，不冒充已修复或实机通过；本段取代下方“修复待批准”状态。

结果：两处产品文件及直接测试完成，隔离b551e0a加本批三个文件，5/5聚焦通过。首轮夹具混淆普通输入和已编辑IME提交造成1失败，已按两种实际事件语义分别验证；没有降低断言。补丁程序集V2窗口一次集中实测通过：Computer Use逐键拼音→实际中文候选→空格提交，确认按钮启用并产生continue回执；第二轮Ctrl+V拦截/禁用、BackSpace删除禁用、中文补字重新启用，随后end_rest回执。两轮均有visible ACK，探针completed=true且无执行/产品连接；进程和窗口已退出。不需PO手动取数、安装或重载。证据在Native既有WINDOWS-QUOTA-SOURCES报告及受限本地patched-v2-reminder-ui-20261018.json；补丁Agent hash 7ffa1f9487d9d79471de3434455ea7871c8932bc3f9e94ec5b76932365586af8。修复/隔离实测Matched，未提交或安装；当前生产Agent仍旧版，不把本结果说成正式Service/全屏/取消关闭/超时强制联合验收通过。

## V2确认按钮持续禁用只读诊断（2026-10-18，PO反馈）

补充现场确认：PO通过原生问题明确回复，使用的是“中文输入法键盘输入”，不是粘贴。结合实际V2窗口正确文字及继续按钮disabled的读数，本项确认为正常中文输入被误拒绝，判定FAIL（含PO输入方式确认的人工证据）；不再用预期防粘贴限制解释。上文/下文“等待输入方式确认”仅为历史状态，现已解除。事件顺序模拟提供已证实的失败机制，但未捕获真实IME逐事件轨迹，不能把模拟顺序直接写成现场完整根因。

最小修复建议尚未实施：仅修Native确认输入控件的中文组合输入提交识别，以及必要的确认状态到按钮刷新接线，保持直接设置Text/粘贴不授权；补普通键入、实际中文输入法提交、最终同值提交、删除/重新输入及禁止粘贴的聚焦验证。不改家庭策略/配额、Service统计/云端、原账或共享开关，不为诊断重复安装。当前用户仅回答诊断问题，本轮未据此推定产品修改或第三次UI复验授权；修复实施待明确指令。

PO确认现场按钮持续禁用，本项按疑似产品缺陷诊断，不标记通过；暂不修产品、不安装/改配置/启共享。先询问输入方式，同时在现有受限隔离探针增加无窗口--check-input-events：引用实际安装ForcedUseConfirmationBox，只在未Show的STA对象中模拟已明确事件顺序，比较直接设置、Preview→TextChanged及文本已存在后最终提交等路径，记录IsConfirmed/事件顺序；不注入真实窗口，不调用Service、关闭器或修改typed字段。该检查只定位校验条件，不将模拟IME顺序冒充现场实际事件。本轮不运行第三次UI探针，原两轮失败保留；确认根因后回报，产品修复另依用户指令。

无窗口诊断完成：离线编译0警告/错误，--check-input-events退出0，5种路径均执行；这是探针执行成功，不是5项产品验收通过。实际安装组件在Text==“强行使用”时：直接设置false；旧单测PreviewTextInput→TextChanged为true；逐字Preview→TextChanged为true；模拟组合输入的TextChanged→最终PreviewTextInput、此后文字不变，两种变体均false。同值Text赋值不产生新的TextChanged，因此最后的Preview不能完成typed确认。模拟序列仅证明该事件顺序下的脆弱点，不证明现场IME确实按此序列发事件。

固定代码依据：ForcedUseConfirmationBox.cs的PreviewTextInput只写expected，TextChanged才更新typed并清expected；IsConfirmed同时要求Text及typed等于四字。SharedReminderPresenter.V2.cs:100–128只在TextChanged及可见确认时刷新继续按钮，Choose也独立检查IsConfirmed，不能靠放开按钮绕过。原ForcedUseConfirmationBoxTests仅手动RaiseEvent后设置Text，没有实际中文输入法提交、预编辑或同值提交用例。因此当前断点在输入确认及按钮消费链，不能再归为云端/桶读取；中文输入法兼容是否为现场根因仍待输入方式确认和真实事件补证。

本轮已通过原生问题一次集中询问输入方式（中文键盘、粘贴、自动化），未重复索长诊断或安装。无UI新弹窗，无产品修改；临时探针增加InputEventDiagnostics.cs及入口，受限本地保存合成输出。阶段结论为“现场现象已确认、事件顺序问题已隔离重现、现场具体原因未最终确认”；后续如修复，须保持粘贴/直接设置不能授权，并补真实中文输入法及正常键入回归，不改共享/原账或弱化校验。

## 当前V2提醒组件隔离前台核对（2026-10-18，PO继续；共享仍关闭）

先核已有用例：IsolatedSharedReminderWindowTests的可见/继续/取消正向窗口用例采用V1；正式Agent V2专项只有禁执行/无目标负例，不能冒称当前V2已实测前台。本轮仅准备受限本地隔离探针，引用已安装2.6.67实际SessionAgent/Infrastructure/Core/Windows程序集，运行现有PresentV2/WithdrawV2组件；合成身份及shared状态只在探针内存中，不读家庭配置、凭据或产品目录，不连Service/Host/云端管道、不写生产账。TargetVerified=false、无观察捕获、无ExecuteV2/ApplyAccess调用，所有UI选择仅回传内存与本地合成报告，不能执行关闭。

最小顺序：①比对引用程序集与已安装候选哈希，离线编译并检查无参数入口；②仅探针弹出的当前V2窗口核对实际画面、前台焦点和visible ACK，未送达不自动补成功；③通过Computer Use正常输入/点击验证确认继续及正常结束意图，不直接设置Text/调用Click事件或改产品门槛；④撤销/Dispose仅探针自有窗口并查无残留，记录证据。不重跑全量/30/48测试，不安装/重载/UAC/启共享，不强制结束或修改产品代码。产品“取消正常关闭”、全屏及Service联合执行仍独立未验证，本轮不伪报；若真实输入必须人工，最后集中说明，不绕过确认输入。

当前结果为部分通过，不是专项全绿。临时探针离线编译0警告/错误，无参数退出2；引用的4份程序集逐SHA与安装2.6.67清单一致，实际SessionAgent hash仍79a635185ded5e3c0d9e5ab1b8ecf79b4f6c761dcaec4a6b0b15082b58b24180，未复制/修改产品安装目录。

- 实际V2前台/可见：PASS。当前PresentV2Async显示“使用确认”及手动输入提示，焦点在确认输入框，空输入时继续按钮禁用、正常结束可用；探针仅在实际sharedReminderV2Ack delivery=visible后写入awaiting-choice，未通过反射改成功标记。不是V1窗口证据，不证明全屏遮挡或生产Service准入已完成。
- UI意图回传：第二轮原报告已保存actualV2Message=true、visibleAck=true、action=end_rest，无Execute/ApplyAccess调用。此为实际UI发回选择的观察证据；Computer Use两次报告人工输入打断，未把选择归因为本代理自动点击或伪报全自动通过。没有实际关闭应用。
- 待定位输入现象：重读画面及AX均见输入为“强行使用”，继续按钮仍disabled；正常结束可用及实际visible ACK证明并非全部按钮仍等待可见确认。输入方法未确认，不据此直接定为产品缺陷。实际ForcedUseConfirmationBox仅承认PreviewTextInput与TextChanged相符的输入，粘贴/程序设置Text不能授权；旧单测仅RaiseEvent+设置Text，未覆盖真实中文输入法事件。未绕过控件、修改typed、IsConfirmed或按钮属性。
- 两轮隔离过程失败保留：首次收到非预定continue选择，但工具在断言前未保存实际action，报UNEXPECTED_ISOLATED_CHOICE；补齐实际动作记录、允许两个有效选择任意顺序后第二轮保存end_rest。第二轮随后报INVALID_SHARED_REMINDER_STATE_V2，定位为探针自行构造resolved状态遗漏VisibleAtMs，触发正式协议State检查（要求resolved有可见时间），不是生产Service发错状态。已仅修探针：从实际visible ACK记录时间并在交回Presenter前调用正式State解析器；尚未运行补正后的第三轮UI，不把修正写成已复验。
- 已确认两个探针进程均退出、窗口无残留；没有重复安装、UAC、配置或原账操作，共享仍关闭。探针会自行取消并Dispose本进程窗口，不调用系统进程终止器。

下一步先集中确认输入是物理键盘/中文输入法还是粘贴/自动填入，再决定一轮必要补验；遵守两次失败暂停，不继续无授权第三轮、不为夹具问题出包或修改产品。新观察只是补充现有30/48证据，不重复计数。未通过/未验证保留：确认继续、取消正常关闭、全屏、真实60秒超时/硬限制及正式Service联合执行。当前仅任务板及受限临时探针有变化，无提交/推送。

## 专属测试目标前台观察（2026-10-18，PO授权继续）

本轮仅启动已核验的独立QuotaAcceptanceTarget --show空白窗口，通过Computer Use选择唯一返回窗口后观察/激活，核对前台焦点、可见内容及跨60秒存活；只操作该自有窗口，不触发共享提醒、正常关闭取消或强制关闭，不修改产品/原账/配置、不安装或启共享，不追加UAC。复用目标EXE/DLL哈希及既有无UI自检，不制新Native候选。允许正常退出仅本次自有空白目标；不结束其他程序或进程树。实际使用可能自然产生新用量，本轮不直接写、补或清原账，也不承诺系统正常计时停止。Computer Use能力或前台不可确认时只记录缺口，不通过PowerShell UI Automation或其他profile绕过，不索长诊断。必要检查仅文件哈希、唯一进程/窗口、两次有界窗口状态及本页diff；需要手工动作最后集中说明。

结果PASS（仅目标前台与存活观察）：复核EXE/DLL仍与上节固定哈希相同，启动前目标进程0；普通用户启动一次--show，不含RunAs。北京时间03:51:36.651启动，Computer Use按返回的精确路径/标题筛出唯一窗口，最初截图仍为遮挡内容，未据此声称可见；仅激活该目标后截图明确为自有空白窗口。03:53:01.630只读进程检查确认elapsed=84.979秒、Responding=true、原PID/启动时间/session/窗口句柄均保持，进程仅1个；该句柄与Computer Use返回窗口完全一致，同时实际accessibility.focused_element为目标窗口0，画面与空白目标一致。满足真实显示、前台焦点及超过60秒不自退，不用单次activate返回或隔离时钟代替。

结束时仅通过该目标刚取得状态中的“关闭”按钮正常退出；03:53:14.688核对目标窗口0、目标进程0、原PID不在。没有Kill、进程树终止、提醒/执行命令、其他应用输入、UAC、安装/重载或配置改动；没有调用原账写入/清理。只操作空白测试目标，其正常使用可能由现有采集自然记账，不做账本冻结或人为回滚。Computer Use的当前焦点证据不代替Service实际捕获/授权证据。

本轮无需PO点击，也未新增产品/测试代码；仅本页和受限本地脱敏证据。剩余未验证为实际提醒可见/全屏、继续、产品“取消正常关闭”、60秒超时及硬限制真实动作；只有后续集中明确授权相应执行范围后才测试，不为补这些证据自动启共享、改配置或重装。临时目标已证明可用，无需再换目标或反复做同一轮观察。

## 当前策略／执行能力／会话只读UAC（2026-10-18，PO一次明确授权）

授权仅一次管理员只读诊断，不改原账/配置、不安装或启共享。原reverse-read-audit工具缺少策略身份及会话输出；仅在既有临时工具补--preflight：读取本地已存机器策略及当前孩子对应V2缓存（校验现有解析器与hash），通过原adminStatus取实际运行策略版本、会话/Agent数量及影子；用Windows只读会话枚举核对本地账户的分配，不导出用户名/SID/孩子/凭据。只发送adminStatus，两次短采样、总计最多45秒，不发送同步/交换/执行，不调用会联网或写缓存的策略读取器。编译与无效参数保护通过后，仅启动该EXE一次RunAs；UAC由PO手工批准，脱敏结果只存受限本地，完成后进程退出。本轮仅既有任务板及隔离工具，不改产品；不以磁盘缓存等同进程内完整策略，版本/影子关联和证据缺口分别说明。

执行完成：临时工具Release编译0警告/错误，无参数/非法模式均在读产品前退出2；EXE与DLL在RunAs前逐hash核验。仅一次UAC，实际采样北京时间03:48:56.317、03:49:01.378，5.089秒完成；诊断进程已退出，无追加UAC、安装、重载、同步或产品写入。首次沙箱下报告不可见，普通系统只读权限下可读取，这是报告可见性差异，不是诊断失败；没有因此重跑。

| 检查 | 实际结果 |
|---|---|
| 运行策略 | Service2.6.67.0/online；desiredPolicyVersion=appliedPolicyVersion=392，两样本均与本地机器策略版本相同；第二样本的策略成功读取时间已更新，lastPolicyFailedAtMs=0。 |
| 孩子公共策略 | 当前精确范围缓存profile-config:52，严格解析/hash有效，effective=true，NewModelEnabled=true，stage=shadow；Service实际影子返回相同revision和stage。缓存hash=e5fc27b1c7c23421f4791fa6f0abce5a56678ff737fb1f0370d26f7a50057402。adminStatus未直接返回进程内完整策略hash，不能将版本关联写成进程内全字段逐项核对。 |
| V2执行能力 | 当前机器策略shared-access-policy-v2=false，且stage=shadow，执行门槛不满足；不是新桶读取失败，也不等于NewModelEnabled=false。共享仍未启用，不改标记/阶段/配置，不为它重装。 |
| 实际相关会话 | Windows只读枚举complete=true，仅1个有用户的会话，为当前受保护用户且同孩子、active、有Agent；Service同时返回activeSessionCount=1、protectedSessionCount=1、agentCount=1。仍有2个账户分配给同一孩子，但另一个账户本次未枚举到会话；纠正此前不能由控制台“会话活动”标签确定真实在线状态的缺口。此结论仅本次采样，不能保证后续开测时仍只有1个会话，也不覆盖其他电脑。 |
| 本地桶采用 | 两次实际Service均webOrigin=peer、applicationOrigin=local+cache、stage=shadow；webReadAtMs=1792266469886，与同范围网页缓存完全一致。10/18网页三桶0/108/0秒；共享影子三桶0/4114/0秒、当日complete=true。没有从合计反减伪造独立应用来源证据。 |
| 历史及旧状态 | 本周complete=false来自10/12–10/16原因，10/17和10/18 complete=true；不追修历史、不让周历史缺项否定本次当日读取。lastStableErrorCode仍有SHARED_QUOTA_POLICY_UNAVAILABLE，字段没有本次错误时间，不能据此断言当前V2策略失败；有效V2缓存与Service实际当前读取成功分别已证实，旧错误来源未在本轮扩查。 |

脱敏原报告SHA-256=bb5089898cdadc4359199ef1248a92e9c448c8254cd6c502060d6059df6427fe，保留受限本地，不入Git。报告旧通用peerObserved字段在非观察模式未采样，不能用于本轮判定；实际samples.shadow.webOrigin及匹配readAt是证据。本轮read-only-preflight范围Matched，代码/产品配置/原账保持；只读预检通过，V2执行处于预期关闭状态，不标记提醒/正常关闭/超时/限制实机已通过。安全目标仍只完成构建与无UI检查，后续前台目标捕获和真实动作必须另行集中安排，不追加安装或要求长诊断。

## Windows只读预检与安全目标确认（2026-10-18，PO继续授权）

职责release，只读预检和隔离验收工具准备；不改产品/测试源码、原账、配置或绑定，不安装/重载、启共享、启动提醒或关闭动作。先核当前产物与现有控制台，再核执行目标约束和专属目标；需要人工确认的项目最后集中说明。本轮最小检查为安装组件与冻结候选逐hash比较、正常控制台只读页面、固定源码的目标捕获/关闭约束，以及临时目标的离线编译和无UI参数自检；不重跑既有30/48专项或全量，不发布CI。

安全目标准备限定于受限本地临时目录：生成独立QuotaAcceptanceTarget可执行文件，和PowerShell/工作应用身份分离，不带自动退出计时器；只允许显式--show打开自有空白窗口，其他入口不显示窗口。无产品引用、网络、管道、账本或配置读取/写入。只构建并运行无UI自检，本轮不实际显示窗口，不调用关闭器或注入Service请求。此临时目标不是Native新候选，不安装、不加入生产仓库；真实前台捕获及Service授权仍留在后续受控验收，不由静态检查替代。

### 本轮已取得的预检结果

| 项目 | 结果及证据边界 |
|---|---|
| 当前运行与产物 | PASS：普通系统只读查询确认Service Running/Auto，SessionAgent和NativeHost存在；正常家长设备页实际显示Service2.6.67.0。安装目录11个组件逐SHA-256与既有2.6.67核验清单全部相同。控件原加载目录207个产品文件与冻结1.7.64候选全部相同，manifest=1.7.64；此次没有读取扩展内部页，实际Chrome运行版本沿用此前人工1.7.64证据，不以磁盘比对冒充本次运行页回读。 |
| 当前云端阶段 | PASS：已登录的原内置浏览器主控制台正常查询显示“影子核对·尚未启用共享限制”；没有保存、改字段或触发同步。共享摘要仍显示来源不完整，与独立网页账户完整状态分开保留，不把旧共享摘要作为本机读取失败证据，也未在本轮扩修。 |
| 作用域风险 | 已核实，不是单窗口作用域：正常设备页列出本机两个账户分配给同一孩子，且均显示会话活动，其中一项新版目录报告又为无活动会话；该界面不能证明另一个账户当前是否会执行。当前家庭列表另有离线Mac，不据此宣称同孩子只有一个执行端。后续临时启用前需管理员当前状态精确核实受影响会话，不能自行改变分配或缩成不存在的目标开关。公开文档不保存真实用户名/孩子/机器标识。 |
| 执行门槛 | 固定干净源码RuntimeServiceCoordinator.SharedForcedUseV2.cs:19–24要求机器shared-access-policy-v2能力、NewModelEnabled、stage=shared和生效时间；只读影子无需这些执行门槛。当前控制台明确为shadow；机器当前V2标记及Service实际采用策略未重新读取，沿用上次false仅为历史，不伪报本次已核实。设备页的“产品级封锁未覆盖”不是同一个共享能力证明。 |
| Native目标隔离 | 源码核对Matched：WindowsSharedApplicationCloser捕获前台PID/启动时间/session/runtimeIdentity/文件哈希，执行时复核前台、同用户及全部标识；正常关闭有3秒取消窗口，强制只Kill(false)，不结束进程树；明确排除chrome.exe、产品自身、系统路径和关键进程。这是固定源码约束，不等于此次真实目标已捕获/结束。 |
| 专属安全目标 | PREPARED：独立QuotaAcceptanceTarget.exe离线还原、Release编译成功，0警告/错误；无参数及非法参数退出2，--self-check退出0，三次均未走窗口分支，完成后该进程数量0。源码仅在--show调用Application.Run，无定时自退、产品引用、文件写入、网络或管道；不用旧45秒脚本或工作应用。尚未显示窗口、取得生产Service目标身份或执行正常/强制关闭，不记实机PASS。EXE=f8d5807cc9698bd5aeaee20c843e316f90efe2934fecc77582ed4e40b399f57d，DLL=7a2a8dc30180edcc7e806b45b6c566a5a270324eeb1ec0ea07e637fad579606e。 |

普通权限剩余边界：固定Service控制管道只接受管理员令牌（RuntimeServiceCoordinator.cs:1170–1209），此前已实测普通权限拒绝；本轮没有重复发送被拒绝的adminStatus、读取机器密钥、弹UAC或绕过ACL。浏览器采用现有受控UI通道读取主站，不附加CDP、不读Chrome数据库、SW或内部页，不另开profile；浏览器标签枚举只为定位，私有URL/账号不入Git。原CIM在沙箱不可用，经普通系统权限的只读检查成功，此提权不是Windows UAC。

集中待配合项：下一次仅需一项新的受限只读UAC，使用已审核的现有诊断入口核当前策略/能力、会话与同范围桶；不改配置或强求瞬时peer（此前已实机PASS）。如随后继续目标验收，再单独集中安排专属窗口/测试网页的正常前台观察和继续/取消点击；本轮不请求启共享、不自动启动目标，也不需要安装、重载或复制长诊断。网页真实动作目标尚未打开选定，不能将普通网页/现有工作标签列为可强制关闭对象。当前结论：可自动化的产物/门槛/目标准备已完成，生产执行就绪与真实前台目标捕获仍待只读授权及受控窗口观察。

范围审计Matched；现有产品与真实运行状态未修改，仅本页及受限本地验收工具产物新增。合成工具自检不是产品联合验收，已有自动化不重跑。脱敏汇总保存受限本地，未提交/推送。

## Windows集中实机验收准备（2026-10-18，本轮仅补测试与准备方案）

### 测试装载缺口已正式修复

PO明确要求正式补齐后复验。本次仅修改控件既有tests/unit/local-guardian.test.js两行装载接线及既有任务板，将已加载binding模块的实际readApplicationStatisticsSourceProof导出提供给剥离import的shadow模块；没有成功stub、删断言或产品修改。node --check及携带TOC_NATIVE_V2_WIRE_SEQUENCE的原node tests/unit/local-guardian.test.js均退出0，冷连接、自动准备、重连、迟到保护和25份当前C#响应全部通过，不再需要临时适配器。测试SHA-256=c0977660a502b44e5f82a122d37e72359e654271da6079b7e8eae3aee3aca03a；wire仍为下方已核验f0ac90a…的同一份合成数据。下方PASS_WITH_FIXTURE_ADAPTER及“正式文件待补”保留为此前状态，本项现已由正式入口PASS取代；不代表新增实机动作通过。

### 一次集中实机方案：PREPARED_NOT_EXECUTED

本轮不启共享、不安装、不重载、不改原账、绑定或真实配置，不启动UI、断网、重启或UAC。复用已安装Native2.6.67.0、控件1.7.64，以及已通过双向基本读取和30个去重联合自动化案例；不重复安装换取验收。必要测试仅上述装载器专项与diff检查，没有新增全量、E2E或发布CI。本计划涉及后续受控执行，须在前置核对完成后另取得一次集中授权，不能把本次“准备方案”当成启用授权。

| 顺序 | 操作及通过依据 | 不满足时处理 |
|---|---|---|
| 1. 只读预检 | 核实当前运行版本、同孩子连接、当日/本周桶、来源和截止、策略完整身份及执行readiness。上次为profile-config:52/shadow，机器V2执行能力标记false，而forcedUsePolicyV1.enabled缓存为true；读取成功不代表执行就绪。核对该孩子全部在线来源及实际配置作用域，不能假定开关只影响当前电脑/标签。 | 缺能力或范围未明只报告具体前置缺口，不擅自改标记、重新配对或制包；不以旧状态代替当前读取。 |
| 2. 目标及恢复预备 | 只使用验收专属网页和可证明隔离的应用窗口/进程，记录PID、窗口与代次，排除工作程序及整个Chrome。先核对目标存活时间和产品“取消正常关闭”按钮可用性；准备受限配置备份、条件更新和恢复方法。浏览器工具不能读内部页时不绕过策略，只预留一次集中人工目视/点击，不再索长诊断或Service Worker数据。 | 现有isolated-reminder-target.ps1在45秒自行退出，不能验证60秒强制，也不能把自退当执行成功；它由pwsh运行，未证明应用身份和进程目标隔离前不用于真实强制。安全目标未就绪就不进入执行阶段，不为验收新增产品API或放宽目标校验。 |
| 3. 集中授权与临时配置 | 后续一次明确列出测试孩子、受影响端、专属目标、所需配置差异及恢复操作，再申请集中授权。授权后使用当前版本条件备份/更新，仅临时改变必要阶段、阈值及提醒动作；两端采用同一策略身份且执行能力就绪后才开测。真实用量不注入，使用已有用量与批准阈值，不为凑600+600伪造账。 | 当前共享为孩子级作用域，没有已证明的测试标签/进程专属配置开关；发现未授权其他端受影响即停止。没有新授权不写任何配置。 |
| 4. 配额与提醒联合 | 对照两端同范围的实际桶输入及核算，允许结算截止差异和正常延迟，不反减制造来源证据。分别核对普通/全屏提醒真正可见并激活；60秒从实际可见确认起。点击继续后恢复且无立即重复；点击主动结束仅发正常关闭，再点产品“取消正常关闭”，目标仍存活且过原期限不强制。 | 未送达不计用户超时；API成功不代替前台可见、目标存活或退出证据。失败停止该场景、保存具体断点，不当场反复安装或改产品。 |
| 5. 超时与硬限制 | 获准的超时结束案例等待真实60秒，确认只结束专属目标且无第二次动作；网页只作用目标页，绝不结束浏览器。硬限额用批准阈值验证目标准入；特殊应用/other不贡献三桶，学习网站等沿现行已确认豁免，不重新定义规则。 | 自动化只证明force意图/回执，不当真实关闭证据；目标自行退出、选择错误进程或无法证明动作效果均不算通过。 |
| 6. 有界恢复与还原 | 在另行明确允许的操作范围内做一次安全桥接中断/重连，验证同范围缓存接续、已有有效量保留且不重复提醒/执行。结束后按版本条件恢复备份的配置内容，核云端回读及两端恢复shadow/关闭共享执行，清理仅测试自有窗口。分别登记PASS/FAIL/未验证及证据。 | 不把Service/Chrome/Windows重启、网络适配器断开或锁屏/休眠夹带入本方案；这些需具体授权，已延期项目仍延期。恢复时如配置被家长并发修改，不盲目覆盖，停止后续场景并协调精确恢复。不得清账、清缓存或重绑。 |

实际交付分层：正式测试入口现已PASS；双向基本读取已实机PASS；本节提醒/取消/超时/硬限制及恢复联合实机尚未执行。后续可先进行不影响运行的只读预检；任何前台打断、强制动作或临时启用都须完成目标隔离和授权。计划不是宣称已具备全部执行条件，也不把单项缺口重新扩成全平台开发。

## 恢复可靠性与配额／提醒／限制自动化联合验收（2026-10-18，PO批准）

本批为隔离验证，不改产品源码、真实原账、配置、绑定或云端，不安装/重载/迁移，不启用真实家庭共享。复用Native b551e0a及控件e94d273已有精确源码证据，先核对测试实际入口，禁止以旧贡献/旧状态机证据替代当前V2消费者。

实施清单：①复用已通过QuotaBuckets读数/缓存/去重/范围及真实双向读取证据；②临时隔离副本补“V4原账→本机统计→网页桶合并→实际TickForcedV2准入→提醒消息/动作/回执”的联合用例；③覆盖低于/达到限额、另一域缺失、正常关闭取消、未送达不强制、可见后60秒超时、恢复不重发；④核对原始V4记录前后不变，所有关闭指令只写内存，无进程终止器；⑤集中登记通过/失败/仍需实机项。必要命令仅新增临时ServiceQuotaAdmissionAutomationTests的dotnet test过滤及直接恢复用例（若无当前源码证据），编译随测试；排除全量、UI/浏览器启动、OS锁屏/重启、Mac、WiX和真实配置切换。失败只定位，不顺手改产品。

联合运输补证：当前C#实际Dispatcher/Service浏览器V2成功用例通过既有NATIVE_V2_WIRE_DIRECTORY导出合成报文，再以TOC_NATIVE_V2_WIRE_SEQUENCE输入控件固定e94d273现有node tests/unit/local-guardian.test.js真实客户端回放入口。目的是证明当前固定Native源码与当前加载控件的整包回执/状态兼容，不启动浏览器或真实Host，不新增协议/测试系统。既有同输入旧版本25条回放不代替此次精确版本核对；仅此一份必要专项，不跑其他扩展unit或E2E。

### 本批自动化结果

固定Native b551e0a隔离副本、契约1.56.0；控件工作线HEAD e94d273，product及原local-guardian测试文件均无本次修改。新增仅临时ServiceQuotaAdmissionAutomationTests与内存装载适配器，正式产品和加载包未变。必要编译通过；相关TRX逐例核对0失败/跳过。新增联合11例＋当前源码恢复/Service入口17例＋正式Agent解析2例，共30个去重案例；早期7例和12例是同一用例扩展的中间结果，不重复相加。原48项桶读取/缓存/范围/版本及新后台选择证据直接复用，没有重跑全量。

| 链路 | 结果与实际边界 |
|---|---|
| V4→统计→桶→实际Service准入 | PASS：本机180秒＋网页419＝599放行；网页420＝600，确认开启提醒、关闭则生成QUOTA_COMPOSITE硬限制。限制关联原ObservationRef及CapturedGeneration；只写内存消息，不操作进程。 |
| 分类及特殊排除 | PASS：本机学习180进入学习桶；other和特殊应用不进入三类桶，基础统计180及原始V4记录仍完整保留。 |
| 缺源与缓存恢复 | PASS：无网页时按已知本机180计算且不产生错误限制；重新创建读取器从同范围持久缓存取网页420，与本机180合并600，接入相同Service提醒入口，未现场请求云端。 |
| 提醒与动作 | PASS：实际TickForcedV2输出offered，visible回执后才能按60秒产生force-close；未送达等61秒无关闭指令；继续使用后状态resolved/continue，既有独立计时继续；主动结束只request-normal-close，取消并超过原60秒期限也不变成强制。 |
| 可靠回执及恢复 | PASS：重复结果committed→duplicate；ACK丢失及Agent队列重开只重发终态；旧lease/Service重启失效、错误用户/会话/hash拒绝、原子写失败保留旧结果、损坏/满队列不伪造成功、写挂起取消及迟到发送受控。Service浏览器与Native两条真实入口也通过。测试为临时DB/随机测试pipe/模拟时钟，不是生产Service重启。 |
| 正式Agent运输 | PASS：正式SessionAgent程序集ReadReceiptsAsync经随机测试pipe接收V2及可靠回执，禁用执行/无有效目标时返回withdrawn；改绑撤销状态。没有显示窗口或启动进程关闭器，不证明正向前台可见或真实进程结束。 |
| C#→控件客户端 | PASS_WITH_FIXTURE_ADAPTER：实际C# Service导出25个响应被当前控件正式客户端全部接受；原冷连接/自动准备/重连与迟到云端保护专项通过。Chrome API为隔离Port夹具，不是本批新的Chrome/Host实机动作。 |

测试装载缺口独立登记：原node tests/unit/local-guardian.test.js首先失败，因其剥离source-statistics-shadow导入后没有提供新增readApplicationStatisticsSourceProof默认依赖，尚未进入25响应回放。临时适配器只在内存连接既有binding模块的实际导出函数（不是删除验证器或造成功响应），第二次运行全专项及25响应通过。正式测试文件未修改，需控件所属任务将这处夹具依赖正式补回后恢复裸命令；不因此修改产品或重装。不能把带适配器的通过写成原裸命令通过。另观测到仅策略读取时间变化会重新bind一次，已有已知记录，不在本批扩修。

证据：临时新用例SHA-256为25dfa30a0e87ca3b485a7a295ed0c2b13fb07d45ec3456866a739061e71c37e8；合成C# wire为f0ac90a78aefe5c859086f06a278f45cc9c0f714949962a3fa88859620a1486d。TRX为quota-admission-final（11）、reminder-recovery-current（17）、quota-admission-agent-final中正式Agent两例；合成数据及原记录逐项不变断言保存在既有隔离副本，不入Git。

审计：本批验证范围Matched；没有产品Deviated/Extra，无需修复产品代码或制包。剩余Missing是已安装两端联合下的实际前台可见/全屏、人工继续与关闭取消、仅测试目标的真实强制动作，以及生产Service/Windows重启后的受控恢复；本轮无UI/浏览器启动或生产故障注入，不冒称这些已通过。真实共享仍关闭，后续受控启用需另行明确范围，现不启动。

## 实机补证通过：Native当前连接直传网页桶优先采用（2026-10-18）

PO明确批准本次一次只读观察UAC；已启动并提前完成，未追加弹窗、安装、重载、同步、交换或执行请求。实际Service2.6.67.0，现有adminStatus及同孩子/本周网页缓存被动读取，诊断网络请求0、产品写入0、未导出凭据。观察15.119秒、2个样本后进程退出，未持续至六分钟。

- 北京时间03:23:47.009：webOrigin=cache，webReadAtMs=1792264991805，与网页缓存readAt相同；当日已知共享影子复合3249秒，网页复合108秒。
- 北京时间03:24:02.096：webOrigin=peer，webReadAtMs=1792265030058（03:23:50.058），与当前范围网页桶缓存readAt完全相同；范围10/12至10/18，policy=profile-config:52、stage=shadow。当日网页三桶0/108/0秒、complete=true；Service当日共享影子0/3278/0秒、complete=true。未从合计反减制造独立应用来源验证证据。
- 判定：本项当前连接直传优先采用实机PASS，与此前控件接收Native应用桶的实机证据共同补齐双向基本读取路径；隔离600→300更正、去重、断连及后台消费证据继续复用。不是完整断网/重启/改绑矩阵、共享提醒或限制动作联合验收，不能据此标记Windows完整功能通过。
- 脱敏只读报告SHA-256：af41c81ca34ffcc9350c6cecc797d206578360e964aa9daef6ec4abe84883086；保存在受限本地可视化目录，不入Git。报告completed=true、peerObserved=true、peerRangeAndReadAtMatched=true；进程表确认已退出。此前“待本次UAC／未捕获peer”仅为历史状态，本项阻塞现已解除；历史日期缺项保留，不扩大处理。

## 直连补充验证结果与实机判定边界（2026-10-18）

诊断工具只读复核：现有临时工具包含未使用的policy-probe网络分支及无关缓存试算，且25次采样的请求耗时未计入六分钟。为严格符合待确认的一次被动观察，将现有工具收窄至adminStatus＋同范围网页缓存；移除网络分支/缓存试算，使用单调总时限约束观察期，请求及等待均受剩余时间限制，当前身份/分配/周期变化停止。仅重编译隔离工具，不启动UAC、不读取受保护运行数据、不新增产品接口。

工具收窄完成：Release编译0警告/错误；无参数、已删除policy-probe模式均在读运行数据前返回2，两个入口防护核对通过。静态核对只发送adminStatus，文件写入仅本地报告；不再含HttpClient、业务API调用或配额试算。观察窗口使用Stopwatch六分钟截止，新增身份变化停止及peer范围/readAt匹配后早停。工具DLL SHA-256为3ed1af8895a10269989da3494c171bd8068c7489dd5d20016dd0bc0d4d0dde50；有效参数运行、UAC及新实机数据仍未执行。此前六分钟观察批准请求连续未获得确认，隔离成功路径和工具准备均完成；不再用重复隔离测试冒充进展，等待本次管理员只读授权后才能核对生产peer，不自动安装/重载或启共享。

后续自动继续：上一轮为有效进展（已取得Service真实入口成功证据）。实机UAC尚未得到新的确认，不自行启动。本轮仅扩展同一临时隔离用例：经Dispatcher/Service接收本周网页桶，再运行实际SourceStatisticsShadowLoopAsync，核对同一读取器的诊断为peer、今日桶为网页300＋应用180＝480秒；模拟其他应用来源离线，网页云端备用不得被调用，执行仍关闭。仅临时测试及本页记录，不改产品代码或扩大至提醒/限制实测。

该补充后台用例已通过：先经实际Dispatcher和Service证明校验入口接收本周网页桶，再启动实际SourceStatisticsShadowLoopAsync；同一reader诊断为peer，webReadAt等于提供方输入，今日复合300＋180＝480秒，休息0、stage=shadow。应用other模拟一次HttpRequestException，后台保留本机180及peer网页300，未调用网页云端备用；ForcedPolicy为null，执行未启用。重复、更正下降、撤销连接及V4原记录不变断言继续全部通过。TRX direct-web-service-background-acceptance为1/1通过、0失败/跳过；不是生产进程/Chrome/Host传输验收。第一次扩展用例沿用短user-a夹具，实际V2配置入口要求32至128位标识，在读取配置前拒绝而等待超时；仅夹具换为合成64位哈希后复验通过，产品校验未放宽。该失败保留，上一轮不含后台的用例通过仍独立有效。

更新：PO继续指令后，已修正的临时隔离用例通过；未取得新的实机peer证据，不能标记反向直连实机采用通过。未安装、重载、重启、弹出UAC，未改产品代码、原账、绑定、配置、云端或共享开关。

- 临时用例目标：合成身份及签名向量→实际Dispatcher→Service同孩子证明校验→接收600秒网页桶→同一读取器优先采用→重复不累加→更正至300秒→撤销连接后不采用peer→原始V4记录不变。只在既有短路径隔离源码副本新增测试，不进入产品工作区；不声称覆盖真实Chrome/Host管道。
- 该命令两次失败，均未构成产品交换失败证据：首次编译断言误用了旧ApplicationUsage字段，已改为读取实际RuntimeV2Values.applicationUsage；第二次模拟scope响应缺失现有接口要求的Cache-Control:no-store，在证明准备阶段被拒绝，尚未到达交换。已按同仓既有夹具补齐响应头；遵守两次失败停止规则，未第三次运行，补充用例状态仍为未通过，不计入候选原有48项通过证据。
- 后续复验：用户再次明确“继续”后，只运行`RealServiceProofAndDispatcherAcceptWebBucketsAndConsumerPrefersThatPeer`，TRX为1/1通过、0失败/跳过，实际用例耗时1.360秒。上述600→重复600→更正300→撤销后不采用peer及V4原记录逐项不变全部断言通过；应用桶180秒返回通过。交换及读取所用云端委托设置为抛错，未被调用；身份准备使用合成签名向量与内存HTTP响应，不访问真实网络。此前两次夹具失败保留，不改称首次通过。
- 精确基线复核：Native HEAD仍b551e0a；隔离副本Service协调器及既有ServiceQuotaBucketsTests两文件SHA-256与该工作线完全相同。新用例不包含实际Chrome/Host管道、Service进程和后台循环；既有48项中后台循环采用peer的证据继续复用，不重复运行。静态核对确认实际后台调用同一个quotaBucketsReader.ShadowAsync，后者经ReadAsync/ReadWebAsync优先取CurrentPeer；不是另一个消费者或新建结果。
- 固定控件e94d273：身份准备由监控允许条件、启动/心跳/存储事件触发；准备成功回调强制刷新交换，不依赖共享启用。常规交换alarm周期5分钟，但可能延迟、跳过或失败。固定Native b551e0a：peer需同孩子/周期/当前连接证明且网页snapshot.readAt距当前不超过120秒；之后可正常采用同范围缓存。因此只看cache不能认定断点或要求重装。
- 实机通过条件：现有adminStatus实际返回webOrigin=peer，并与同孩子/本周的网页readAt及桶值核对。有限观察未出现peer只记“未观察到”；现有adminStatus不能区分控件未发起、证明拒绝、响应失效或错过新鲜窗口，不能单凭它宣称定位成功。没有获准或执行此前撤回的六分钟UAC观察。
- 当前结论：新版桶缓存实际采用已通过；真实Service入口至同一读取器的直传优先采用隔离用例已通过；当前连接直传优先采用仍缺生产证据。不新增诊断接口，不为瞬时peer命中反复制包、安装或索取长诊断。
- 下一实机步骤仅为一次有界被动读取：使用已存在诊断EXE每15秒读adminStatus，最多6分钟、peer出现即停，核对同孩子/本周缓存的readAt与三个桶；不触发交换/同步/执行。该步骤需一次新的只读UAC确认，尚未启动。窗口未观察到peer不算产品FAIL，不自动重复或转入安装；仅已有观察能力不足时明确保留缺口。

## 直连验收方案纠正：先补真实Service成功路径的隔离证据（2026-10-18）

PO指出方案未充分核实；此前六分钟UAC观察仅为准备，尚未获得授权或执行，现不继续弹窗。5分钟alarm并不保证一次完整交换一定发生（监控、绑定、能力、网络及Chrome调度均可能使本轮跳过/失败）；Native 2分钟新鲜度来自网页snapshot.readAt，不是独立接收计时。有限窗口未见peer只能记未观察，不能当产品失败或触发重装。

现有覆盖核查：QuotaBucketsTests成功peer用例直接调用读取器；Service新账隔离用例通过真实连接证明及Service入口，但网页payload为null，验证的主要是应用读取/拒绝失效连接；48项后台成功用例预先给读取器装入peer。因此缺少单条“Dispatcher→Service现有证明校验→网页桶接收→同一读取器采用”的成功证据。本轮在既有隔离源码副本补该用例，仅用合成身份/签名向量和临时DB，不改产品/真实数据/配置，不安装、部署或启用共享。

## 当前连接peer只读观察准备（2026-10-18）

PO要求继续核对当前连接直接网页桶，不安装、不改原账/配置或启用共享。固定控件提交`e94d273`确认自动交换周期5分钟，Native当前peer新鲜度为2分钟；此前两次间隔35秒的cache观察不足以判断peer失效。本轮仅扩展隔离只读采样器，按现有adminStatus每15秒观察、最多6分钟、命中peer即停，读取同孩子/本周桶缓存作时间及桶值核对；不发同步、交换、模拟绑定或执行请求。需本次一次只读UAC，结果与未观察项分别记录，不修改产品。

## 最新结果：Native2.6.67新桶核对修复及缓存采用实机通过；peer命中仍待观察（2026-10-18）

本批最终Native本地提交`b551e0a5d309aa52da4cd5f826bf893aed83f99b`，只改原后台只读分支及直接测试/既有说明。V2配置有效即新桶影子，不依赖机器配置执行能力标记或forcedUse.enabled；执行的能力/阶段/开关检查保持。PO批准补正版范围后，全新短路径正常权限串行专项48/48通过、0跳过，六种开关/标记组合均通过；没有更改测试断言迁就失败。

集中补正版2.6.67已核验并原地升级：674归档文件、13发布/11包内/11已安装组件匹配，安装退出码0，实际Service2.6.67 Running。受保护备份quick_check=ok；18张相关表及配对密钥、用户分配、配置、原始事实、冻结版本和outbox保留检查通过。无云端部署、迁移、托管、latest或共享启用，控件未重载。Native两次本地提交未推送；原有其他草稿全部保留。

01:09:09、01:09:44两次实际adminStatus均为新桶`applicationOrigin=local+cache / webOrigin=cache / stage=shadow`，采用的网页readAt分别1792256930576/1792256972704，逐次与当前范围网页桶缓存精确相同。今日网页桶0/108/0秒，今日共享影子合计0/2707/0及0/2774/0秒、borrowedRestSeconds=0、今日complete=true。机器V2标记仍false，现有V2配置缓存已建立且hash正确，profile-config:52/shadow；此前旧cloud-all及旧借用影子已退出该次结果。周内历史缺项仍保留，不处理。

验收分开：新桶只读接线及合法缓存采用`PASS`；真实当前连接peer优先命中尚未观察（本次看到cache，不能冒称peer），断网/重启完整矩阵及共享执行不在本批通过声明内。已停止继续制包/重装或索取长诊断，不以追求peer瞬时命中扩大范围。2.6.66不完整修复、暖机及两次测试执行环境失败保留在下方，不能将其历史描述作为当前状态。

## 当前阻塞：Native2.6.66已安装但反向采用未通过，补齐同分支能力门槛待复验（2026-10-18）

首轮`fbebb37`45项通过后，经PO批准制成唯一2.6.66并升级。长路径构建失败后短路径重试成功；674归档文件、13发布/11内嵌及11已安装组件验证通过，安装退出码0，受保护备份quick_check=ok，18张表原始事实/冻结版本/outbox及配对/配置保留检查通过。运行Service为2.6.66，未改云端、共享开关、托管或latest。

反向验收不能标通过：初启动两次影子为空，暖机后两次仍是旧cloud-all。只读查实当前机器V2能力标记false、无该范围V2策略缓存；现有SDK单次GET却正常取得profile-config:52、shadow、NewModelEnabled=true。此前“哪一道门槛命中未核实”的缺口现已查明：实际先被外层机器标记拦截，不是接口不可用，也不能说现场强行使用字段关闭。首轮移除内层条件不充分，是本次漏检。

已在同一只读分支补齐：本Service支持V2读取，不以机器配置执行能力标记决定是否读取V2配置；有效配置即新桶影子，执行入口仍保留能力/阶段/开关。测试加入有/无标记共六组合，沿用同一聚焦集合48项。该轮先受沙箱原子重命名权限拒绝，重试又因本任务未等待旧测试结束造成DLL锁；已停止旧测试，不运行第三次、不再制包/安装、不提交失败证据。现有补丁和测试保留，待一次集中授权后在短路径正常权限串行复验，全部通过再更新补正版。当前2.6.66仍正常运行但本项未验收，不要求用户重载或复制长诊断。

## 修复进度：Native新桶只读核对已解耦，45项聚焦通过，运行版本尚未更新（2026-10-18）

按PO明确修复授权，仅改Native `RuntimeServiceCoordinator.cs`一个分支：V2配置有效即调用新桶影子，不再依赖`NewModelEnabled`；V2能力/配置/孩子/周期/连接验证与所有执行开关保持。新增`ServiceQuotaBucketsTests.cs`三种真实后台循环案例（shadow+关闭、shared+关闭、shadow+开启），均采用peer网页桶且执行入口仍不启用；直接回归共45/45通过、0跳过，编译成功，两项轻量职责及diff检查通过。Native既有`WINDOWS-QUOTA-SOURCES-2026-10-17.md`已先记范围后补结果。

验证基线为Native `8e33200`干净源码导出加本次两文件，排除工作区其他草稿；两文件哈希与实际工作区修改一致。初次依赖还原受沙箱NuGet访问限制，正常权限重试成功，没有关闭审计。未新建分支/工作树/治理文档；未改原账、配置、云端或共享开关，未制包/安装/重启/提交/推送。当前真实Service仍2.6.65，必须集中更新后才可继续声明修复后的实机采用通过；已一次性申请候选构建、升级及只读验收授权，不要求用户复制长诊断。

## Native反向网页读取现场：已接收，新桶采用未通过（2026-10-18）

PO授权本轮只读验收及一次只读UAC。独立诊断仅发两次现有`adminStatus`、读取当前用户/孩子/本周对应网页桶文件，不发同步/交换/执行命令，网络请求0、产品写入0；间隔35秒，报告成功。首次沙箱启动被拒绝，未产生UAC或诊断进程；经已授权提权直接EXE启动成功，没有改脚本策略、安装、重启或启用共享。

| 项目 | 现场结果及判定 |
|---|---|
| 实际产物 | Service 2.6.65；已安装Service.dll及Infrastructure.dll哈希均与该候选验证清单一致，固定源码`9a4d2487ed6f07237d665b0e15403b331c0e0c23`。 |
| 网页桶接收/保存 | `PASS`：精确范围缓存通过现有协议解析，当前日学习0/复合18/休息0秒，本周其他日与控件此前输出一致；缓存读取时间00:38:49.276。该文件来自新桶读取链，不能单靠文件证明当前peer已采用。 |
| Service实际采用 | 本项`FAIL`：00:39:31、00:40:06两次`adminStatus`所返影子结果均为`webOrigin=cloud-all`，影子读取时间00:38:47.794、00:39:36.415；不是新桶读取器的`peer/cache`输出。第二次影子已晚于新网页桶保存，仍未切换。返回结果含旧借用处理及旧发布缺失原因，不能当作新桶链已通过。共享关闭期间这不是实际限制动作执行失败。 |
| 固定源码接线 | `RuntimeServiceCoordinator.cs:761-776`先刷新新桶缓存，但只在V2能力及`NewModelEnabled=true`时调用新桶`ShadowAsync`；否则继续旧`sourceStatisticsReader.ShadowAsync`。`SharedAccessPolicyV2.cs:20`的`NewModelEnabled`实际取自`forcedUsePolicyV1.enabled`。`RuntimeServiceCoordinator.cs:1161-1162`又允许adminStatus回退旧影子。因此读取观测与功能启用门槛耦合，能产生“新桶已收到、展示/影子仍走旧链”。本轮未另读该开关当前值，不能断言现场究竟是能力门槛还是该布尔值未满足；实际回退旧链已由返回来源及固定实现确认。 |

最小后续修改建议（本轮尚未实施）：让新桶只读影子核对独立于强行使用/共享执行启用条件；V2配置有效时消费新桶，执行动作继续保留原有阶段和开关检查。新链未就绪应如实返回未就绪，不以旧影子冒充新链。只针对已证实的Service选择分支及直接回归，不改网页/应用原账、统计上传、配置或云端算法，不需为此次发现重装或让用户再取长诊断。本轮尚不能宣布双向新桶采用验收通过。

## 共享读取只读验收：当前日控件接收通过，Native反向网页采用仍缺直接证据（2026-10-18）

继续验收范围：只读跟踪`ExchangeSourcesAsync → CurrentPeer/ReadWebAsync → ShadowAsync → adminStatus`，从实际Service返回的`webOrigin/webReadAtMs`及同范围网页桶缓存核对接收与采用；不创建模拟peer，不调用同步/交换/执行动作，不改权限或安全策略。仅准备隔离诊断工具；管理员入口读取需本次UAC授权。缺少实时影子状态时如实记录，不用磁盘缓存单独证明当前连接已采用。

本轮不改产品代码、原账、配置、绑定或缓存，不安装、重启、迁移、部署或启用共享。用户提供正常状态页，配合现有只读诊断EXE及家长页面正常请求核对；人工页面证据记为`PASS_WITH_MANUAL_EVIDENCE`，不冒充自动化。

- 控件1.7.64，00:33:54当前连接同孩子核验、实际发送、对应返回及校验接受均成功。10/18网页三个桶为0/18/0秒，无其他网页设备，合计0/18/0；应用本机0/852/0秒（截止00:33:42），其他来源0/0/0，合计0/852/0。没有把云端本机副本再加一次。10/16非零来源组合亦符合24021＋4825＝28846秒复合桶；该其他来源属同机旧用户，不等于存在另一台电脑，不据此追修历史。
- Native直接诊断成功：实际Service及读取程序集均2.6.65.0，当前用户范围匹配。当前日本机非特殊应用先870秒、后902秒，均完整且为未归类；截止分别00:34:00.603、00:34:32.601，按现有规则进入复合桶。正式云端配额读取返回available、0/837/0秒、complete=true、无原因码，截止00:33:24.601。家长正式持久化统计页面同为837秒及该截止；同机旧用户今日正常空0。不同截止的837、852、870、902不要求精确相等，不把正常同步延迟判作错误。
- 单独记录：诊断中旧`source-statistics`全来源查询仍把837秒标为`APPLICATION_SOURCE_NOT_PUBLISHED`不完整，而实际配额桶接口及页面均完整可读。该旧入口与当前配额读取结果不一致，本轮仅登记，不因它否决已通过的新入口，不扩大修改范围。
- 证据边界：诊断读取本机统计及正式云端输入，并非直接调用Service双向交换；没有取得Native实际采用网页桶的当前状态，故不能宣称双向读取全部验收通过。断网、重启缓存恢复、跨孩子实机切换及共享配额/提醒执行本轮均未验证。诊断仅检查单日缓存文件，其不存在不能推断Service的本周缓存缺失。下方旧贡献/ACK区不用于当前V2读取判断。
- 首次UAC脚本被默认脚本策略拦住，未取得数据；随后经用户明确批准直接启动现有诊断EXE成功，未修改脚本或系统安全策略。只读报告脱敏保存在受限本地目录，不入Git；未导出凭据。临时浏览器网络观测已关闭。

## 云端容错集中修复（2026-10-17，PO批准实施）

基线：现有云端工作线 `codex/cloud-management` / `cb51631`；保留此前所有未提交文档与未跟踪产物。本批只修云端及云端页面，不改原账、Native、扩展、配置内容或共享开关；不迁移、不安装、不逐零件交付。PO随后批准本批集中提交、推送、合并及部署Guardian/Runtime和两套已修改Pages，继续真实只读验收。

本次收尾清单：先修正旧静态断言，核对现有`runV2Stage`隔离上传失败及外层独立读取快照，而非恢复上传成功前置；将两项新容错回归与该断言接入既有Guardian CI。复用已通过的精确源码证据，补跑修改后的断言/相关专项、类型/边界/diff检查，集中审计后提交。生产沿用现有workflow，所有migration/bootstrap/shadow准备输入关闭，不改共享开关；源码通过、CI、部署及真实页面证据分列。职责为`architecture-integration + standard-cloud`，不含此前Native/控件文档草稿。

| 编号 | 已查实问题 | 本批处置及验收 |
|---|---|---|
| CF-01 | 正常空应用查询被分配记录判为未知／缺失 | 修复：成功空查询按0；查询失败保留诊断，不伪造完整结果。 |
| CF-02 | 单日或分类附属用量缺失使整个范围合计消失 | 修复：保留有效日、分类及已知小计，完整性独立表达。 |
| CF-03 | 单来源分块损坏使全部应用来源读取503 | 修复：完整校验后才合并；隔离损坏来源，保留其他有效来源。跨孩子／权限错误继续拒绝。 |
| CF-04 | 电脑汇总仅因完整性标记而不显示已知合计 | 修复：已知网页＋已知非特殊应用；部分结果明确显示已知小计，不猜特殊扣除。 |
| CF-05 | 网页新设备账发布被其他设备／本周旧日期异常牵连 | 本地修复/验证完成：只回退同范围已发布有效来源/日版本；缺项标记不完整，候选自身校验及发布事务不放松。 |
| CF-06 | 网页读取受传输快照创建／清理写入失败影响 | 本地修复/验证完成：清理非阻断，创建失败仅复用未过期、同孩子/周/更正版本且逐页完整校验的旧快照。 |
| CF-07 | 网页账户能力登记写失败阻断账户读写请求 | 本地修复/验证完成：仅能力登记best-effort，不吞上传/提交/ACK错误。 |
| CF-08 | last_seen更新失败阻断配置等读取 | 本地修复/验证完成：只隔离辅助更新时间写失败，身份查询/无效token/解绑继续拒绝。 |
| CF-09 | 单机器账户列表失败阻断全部机器及应用统计加载 | 修复：独立保留机器及成功账户，失败账户明确提示；身份变化／认证失败不使用旧结果。 |
| CF-10 | 电脑汇总刷新失败覆盖已有有效视图 | 修复：仅同孩子同范围保留上次结果，明确更新失败，切换范围或认证失败立即撤销。 |
| CF-11 | 具体错误码在转接和页面网络层丢失 | 修复：保留脱敏稳定code/status，不暴露数据库异常或凭据。 |
| CF-12 | 配置已成功更新，审计注释失败却返回保存失败 | 修复：核心配置及触发器历史不变，辅助注释失败单独诊断，不谎报主操作失败。 |

集中实施顺序：先本表及既有设计 → 应用读取/电脑投影 → 页面隔离/错误码/配置结果 → 聚焦故障回归、typecheck、边界/diff检查 → 一次结果汇总。必要本地验证：空日、600秒＋空日、正常来源＋损坏来源、下降更正/重复读取、孩子隔离、部分电脑小计、机器列表单项失败、同范围刷新失败、错误码和配置注释写失败。页面做隔离目视验证；不跑全平台、安装器、真实家庭E2E或网页记账全量。网页专项仅提供具体风险和验证方案，未获单项确认不得实施。

状态：12项源码及聚焦验证完成，已集中通过PR #292提交、推送、合并并发布。主线`c43e2fba34dbbc505dfff1ffb89969a349c20039`；Guardian/Runtime及两套Pages更新，生产只读验收结果见下。不启用共享。旧静态断言19/19、两项容错专项7/7和12/12通过；类型、边界及diff检查通过。审计`Matched`，无未批准`Deviated / Missing / Extra`。静态断言初次复验因测试正则误遇对象花括号失败，核对后修断言；后续CI补修范围和失败均保留记录。

本轮执行清单：`standard-cloud / Build&Test`，高风险网页发布/下行故障处理修订，但原始事实、计秒和上传ACK成功条件不变。只改`profileAccountsV2.ts`、`profileAccountSnapshotsV2.ts`、`deviceAccountsV2.ts`、`deviceIdentity.ts`及直接隔离回归和本页/既有设计。CF-05保留已发布历史，有限回退不扫描原账；先固定周generation再读输入，继续由既有唯一约束和原子batch拒绝并发旧输入，不提前报published。CF-06不延长TTL、不混页、不绕过更正版本；所有Promise完成或捕获，不增加后台队列。

CI补验发现7项直接关联失败：6项旧断言仍把成功空查询认作null；另1项证实正常空秒结果会截断尚未退出旧账家庭的既有毫秒RPC读取。补齐断言，旧RPC仅在未退休且未请求秒接口时保留原有“整个范围无新来源则读取原统计”的选择；真实新版0来源不能回退旧量，当前已退休家庭只读新账。该选项仅内部读取适配，不新增接口、字段或历史汇算。两个直接测试文件最终102/102通过，覆盖已发布0替换20秒及旧RPC1501毫秒保留；类型和Runtime dry-run通过。首轮补验暴露数组长度断言及空日范围选择问题，已一并修正，最终未跳过失败或降低CI门槛。仍在同一PR集中交付，尚未合并或部署。

### 2026-10-18 集中发布及真实只读验收

- 源码：`140de40`及直接CI补修`7d2b078`，同一PR #292合入主线`c43e2fb`，没有逐零件发布。最终PR六项workflow均成功；Runtime15文件354项测试通过，Guardian含两项容错及旧静态断言均通过。主线精确SHA的必要CI也全部成功。
- 生产：既有`App Runtime Production`运行`39048006863`成功。Guardian版本`c1c7035e-2f1a-4c7b-9434-b7ddb9ff2cb7`，Runtime版本`936fd1ba-66bf-4864-9fb4-34244d0f393e`；独立Pages `06789337`，主Pages `fae45ce5`，均来自`c43e2fb`。版本清单已回读，migration数组均为空、shadow准备false；未执行迁移、bootstrap、安装、共享启用或R2写入。四项生产smoke通过，主Pages渲染脚本逐字节核对通过。
- 真实家长登录只读验收：此前同机旧用户在10/17、10/18范围的正式`program-instance-usage`200响应均为整数秒total=available=0、complete=true、applications空；正常页面显示0秒/暂无记录，不再因登记分配本身报缺失。只切换查询筛选，没有改Windows用户、分配或绑定。
- 固定当前孩子、10/17：正式持久化应用响应为30539秒、complete=true、missingDates空、截止23:58:49.591；两套页面同为8小时28分59秒、截止23:58:49。电脑页按当前来源返回31856秒（网页1317＋应用30539－本次来源特殊扣除0）。此项验证读取与展示一致，不据此宣称所有历史分类或特殊应用配置已重审。
- 部分结果现场：主控制台10/16仍有缺项，但保留已知电脑小计37212秒，明确“不是完整合计”，不再整块不可用；未追查或修复该日历史缺口。应用手动刷新保留上次有效结果并完成更新，固定日总量/截止不变。网页视图独立可读，应用视图无残留；设备管理正常显示既有电脑，未因统计缺项失败。
- 边界：生产未注入损坏、数据库写故障或跨家庭请求；相关拒绝/回退/事务证据仍为隔离回归，不冒充生产故障实测。共享、提醒、Mac及历史P2不在本次完成声明内。已关闭临时响应观测，恢复全部电脑/用户筛选；没有读取或导出凭据。发布证据本地补记于本页，其他既有未提交文档及未跟踪产物保留。

### CF-05至CF-08本轮实现结果（已随上方批次发布）

- `Matched`：4项均完成，`Missing / Deviated / Extra`无本批新增未批准项。候选自身损坏/跨孩子仍拒绝；坏的其他来源最多读取8个已发布历史候选，旧日最多读取8个同范围已持久日generation，均校验后采用。无可靠历史保留其他已知量并标不完整，不追求无限历史恢复。
- 发布：device/day/week及事件继续一个事务；并发陈旧输入触发现有generation唯一约束，整批回滚，原提交重试可恢复。没有把冲突提前报published，没有新增重试队列。正常输入、重复和下降更正仍沿用原聚合算法。
- 快照：按所选周generation的现有版本向量读取精确清单，避免混入新设备头。清理另行捕获失败；创建失败最多检查8份同孩子/周/更正版本且未过期的既存快照，核对metadata及所有页hash，沿用原ID/createdAt/asOf/期限。通用更正读取旧容错可能返回[]，本入口用同范围更正COUNT/MAX只读核实，不能误把读失败当成版本0；没有修改分类或更正模块行为。
- `node tests/unit/web-cloud-fault-tolerance.test.js`：12组通过，使用真实Worker函数/SQL和内存SQLite原子事务，覆盖正常/下降/重放、坏来源有/无历史、旧日有/无历史、跨孩子拒绝、事务中断、并发冲突及重试、清理/创建失败、完整两页、过期/损坏/跨家庭/跨周/更正失配拒绝、辅助写失败、无效token/解绑/错误hash和主提交失败仍拒绝、原账哨兵不变。仅隔离fixture重放现有schema，不执行本机或生产migration。
- 既有聚焦回归：`profile-account-v2-publication.test.js` 9/9、`device-account-v2-worker.test.js` 25/25、`device-unbound-contract.test.js` 15/15、`source-statistics-cloud.test.js`、`system-access-classification-guard.test.js`通过。根`npm run typecheck`、`check:app-runtime-boundaries`、Guardian `wrangler deploy --dry-run`通过；Runtime源码本轮未再修改，复用上批类型/打包证据。
- 原有检查缺口单列：`profile-account-v2-worker-contract.test.js`在“1.7.31 uploads retained current-week device accounts before reading a snapshot”静态断言失败；它要求旧`result.deviceAccountV2CurrentWeek = await ...`字符串，HEAD实际已用`runV2Stage`。已用`git show HEAD:extension/infra/cloud-sync.js`及`git diff --quiet HEAD -- extension/infra/cloud-sync.js tests/unit/profile-account-v2-worker-contract.test.js`确认相关输入本轮未变；未将该失败算通过，未改扩展或顺带修旧检查。本轮不提交，故无绕过提交闸门。
- 失败复核：首次新专项9/10通过，错误hash用例期望409，实际按既有契约正确返回400/MANIFEST_HASH_MISMATCH；核对后仅修断言并补充两项必要场景，最终12/12。旧发布测试mock需识别查询新增generation列，已同步后9/9；未降低产品校验。
- 边界与风险：没有改终端ACTIVE/idle/媒体/锁屏/checkpoint、原账、分类配置、上传ACK成功条件、接口、表结构或共享开关。辅助写失败会使在线/覆盖诊断滞后；备用可能少于最新用量，但保留原截止、不伪装实时。真实Cloudflare D1故障注入、生产冷/热读取和真实浏览器原账对照尚未执行；本地通过不是生产验收或发布批准。`git diff --check`通过；原有脏文件/产物保留。

最小测试契约：实际SQLite隔离执行发布/分页函数，验证有效来源保留、旧版本回退/无回退、日周一致、下降/重放、哈希/孩子拒绝、事务失败及并发冲突；注入清理/创建/能力/last_seen写失败，同时验证无效身份、主写入失败仍拒绝。运行相关既有发布/账户/解绑回归、根typecheck、Guardian本地dry-run、边界和diff检查。复用上批未变代码证据，不跑Native/Mac、全量网页计时E2E、生产写入、安装、部署或migration。CI及生产smoke留到另行集中发布，不以本地结果替代。

### 集中验证与方案审计

- `Matched`：上述8项按同一批实现；真实入口的隔离故障测试验证正常空0、范围600秒＋空日、有效来源＋损坏来源、缺分类保留用量、下降替换/重复读取、孩子隔离拒绝、已知电脑小计、单机器账户故障、同范围刷新保留/401撤销、稳定错误码及配置注释失败。没有新增账本、队列、业务接口或独立诊断系统。
- 第一阶段曾保留CF-05至CF-08待批准；现已按上方PO批准结果继续完成，不再列作未实施项。`Deviated / Extra`：未发现本批未批准变更。原有PROJECT_MASTER/TASK_BOARD修改及未跟踪包保留。
- Worker：`vitest run test/source-statistics.test.ts` 22/22通过；直接消费者专项 `vitest run test/application-account-publication.test.ts test/application-ledger-retirement.test.ts -t 'fixed|persistent seconds|seconds range|seconds reads preserve|authenticated app-usage seconds|Guardian application source RPC|seconds-only|seconds source read|拒旧格式|新模型'` 13通过、82未选中。没有把未选中项记为通过，没有运行Native或Mac测试。
- 契约：`npm run build:app-runtime-contracts`、`node app-runtime-management/contracts/computer-usage.test.mjs`通过（8向量及针对性断言）。新增 `node tests/unit/cloud-fault-tolerance.test.js` 7组通过；`node tests/unit/computer-usage-cloud.test.js`、`node tests/unit/profile-config-concurrency.test.js`、Runtime网络9项及两套同源渲染器专项通过。
- 类型/打包：Guardian根 `npm run typecheck`、Runtime `tsc -p tsconfig.json --noEmit`、两Worker `wrangler deploy --dry-run`、`check:app-runtime-boundaries`通过。dry-run仅本地编译，未上传Worker。
- 目视：既有本地fixture新增合成容错场景，桌面1440及移动390像素核对已知小计/缺来源/刷新失败提示；移动scrollWidth=innerWidth=390，无横向溢出。截图保存在受限本地可视化目录，不入Git；不以mock作为生产验收。
- 第一阶段边界：当时网页发布/分页/辅助写入四文件未改；本轮已按PO专项批准修改，见上方结果。extension及migration目录仍不改；原账/正常计秒与聚合算法保持。`git diff --check`通过。
- 失败复核：首轮Worker专项21/22，原因是旧空记录断言仍要求不完整，修正冲突断言后22/22；电脑专项首轮旧断言仍要求有有效网页时电脑数值为null，按已批准已知小计修正后通过。初次契约编译遭沙箱dist写权限失败，正常权限重试成功；未降低身份、哈希或主写入验证标准。

### 网页记账相关四项：PO已逐项批准的最小方案（本地结果见上）

| 项目/代码位置 | 旧行为 → 建议行为 | 少记/多记及其他风险 | 必要验证 |
|---|---|---|---|
| CF-05 `workers/src/services/profileAccountsV2.ts:195` | 候选发布先读取其他设备当日头及本周日头，任一坏读阻断整个发布 → 仅隔离无效来源/日期，能取得同范围最后有效确认账则保留；不能取得的范围明确缺项，不伪造完整，不降低候选自身清单/分块/哈希/身份校验；头及日周结果仍保持原子一致。 | 缺失增量暂时少计；错误回退或重复加入可能多计，不能只加catch后继续写；不改变原账。须先对照发布事务/version vector逐项审查，失败不能提前声称published。 | 普通输入、坏同日来源、坏周内旧日、重复/下降版本、并发及事务失败；逐来源/日周和头版本向量一致，无双算，旧确认账不被清零。 |
| CF-06 `workers/src/services/profileAccountSnapshotsV2.ts:122` | 新分页快照创建与过期快照DELETE同一batch → 清理改为非阻断；创建失败仅复用仍符合既有身份/周期/更正规则且完整可校验的既存快照，无可用快照仍报读取失败，不造0或拼页。 | 清理失败增加存储；回退结果可能滞后；混入不同snapshot/generation会错账。此阶段不擅自延长服务器分页期限。 | 清理/创建失败、已有快照/无快照、跨孩子和周、更正变化、分页中版本变化；ID/hash一致，不混代际，不漏ACK或改原物化。 |
| CF-07 `workers/src/routes/deviceAccountsV2.ts:98,392` | 账户能力登记写失败使合法账户读写均失败 → 鉴权后辅助登记best-effort，清单/分块/commit及ACK自身成功条件不变。 | 能力/覆盖诊断短期滞后；错误扩大catch可能误吞上传失败，故仅包住登记调用。 | 注入登记写失败而真实账户处理成功；清单/hash/提交失败仍拒绝，不产生假ACK；版本兼容和coverage诊断不冒充完整。 |
| CF-08 `workers/src/routes/deviceIdentity.ts:59,81` | 身份已验证仍因last_seen写失败中止业务 → 只隔离last_seen辅助写；token/解绑/孩子范围验证保持硬拒绝。 | 在线状态可能滞后；不得把认证查询失败或解绑当成可降级，也不能将离线状态作为既有有效账失效。 | last_seen写失败、token无效/查询失败/解绑、配置读取及账户上传；无绕过身份，无假ACK，无原账变化。 |

四项都不修改终端ACTIVE/idle/媒体/锁屏/checkpoint计时；这些前后语义保持一致。改动只涉及网页上传发布/下行/覆盖元数据的失败处理，已获本轮PO明确确认；本批未运行生产写入、清理或真实浏览器记账实验。共享契约仅调整云端电脑展示投影函数，不改变协议字段或Native消费接口；按源码SHA构建，不另发同版本契约包或更新终端锁。

## 云端实际来源统计核对：当前日总量一致，缺项指向同机旧用户（2026-10-17）

PO要求深入核对实际数据，不能再把“其他设备不可用”当成有第二台电脑的事实。本轮通过既有家长登录、正常Runtime应用使用页的电脑/用户/日期筛选，读取其已发出的正式200响应；仅观测响应体所需统计/分配字段，不提取凭据、不发自定义带凭据请求、不增加诊断接口。

| 正式持久化统计范围 | 实际结果 |
|---|---|
| 当前孩子/今日/当前Windows全部用户 | 27907秒，complete=true，全部为未归类；截止北京时间22:51:41.564。 |
| 同孩子/同日/同Windows当前用户 | 同为27907秒、complete=true；与上一项revision及截止完全相同。不是两个不同时刻相减，未发现本范围额外来源秒数被加入。 |
| 同机旧用户/昨日 | 4825秒，complete=true，Native生产者；截止2026-10-16 06:55:12.648。与PO状态页“其他来源昨日4825秒”一致，但该行本身不证明错误归属，不擅自清除。 |
| 同机旧用户/今日 | total/available均null，applicationUsage=null，references为空，missingDates包含今日，原因APPLICATION_INSTANCE_STATISTICS_NOT_AVAILABLE。证明正常页面的新固定身份统计读取器没有该用户今日可读结果，不等同于完成数据库全表盘点或证明未接收/旧格式记录不存在。 |

实际机器/账户响应另确认：只有一台当前关联此孩子的登记机器，两名Windows用户分别为当前来源assignment1与同机旧用户assignment21；旧用户lastSeen仍为2026-09-23 02:41:41，sessionActive=true只是旧报告，不能当作今日活跃。Mac当前没有该孩子的用户分配。本节不记录Child ID、机器ID、用户标识、账户名、凭据或原响应。

已查实的实现行为：普通当日持久化统计可完整返回27907秒；共享other范围却把当前来源外的同机旧用户保留为潜在来源。sourceStatistics.ts:38-39按整个日期范围任一日有记录即返回available，今日缺可读统计的null又在:23-25转为不完整；全空时:44-56还会根据历史分配/发布记录要求来源。独立内存分支探针使用实际云端适配函数、合成日读取与范围存在性结果，复现“昨日有4825、今日无记录→周范围available但今日不完整”；该探针不是生产数据库实测。

因此当前证据未发现今日已发布应用总秒数额外累计，异常明确指向同机旧用户的今日无可读统计及其共享完整性判定，不是当前用户统计上传失败或另一物理机离线。旧用户昨日4825秒的事实合法性、当前other业务响应的精确来源版本仍不能仅凭界面读数下结论；不靠删除旧分配/数据或修改配置消除提示。

生产D1 SELECT尝试受权限限制：沙箱内无法读取正常CLI认证，允许正常鉴权后Cloudflare返回7403；未获得查询结果，未重试或绕过平台权限。上述实数证据来自现有合法家长统计入口，而非D1直查。网络只读观测已关闭，未修改产品代码、原账、绑定、配置、Native/云端部署或共享开关，无安装、迁移或新测试文件。

## 验收更新：1.7.64自动核对及当次本地读取现场通过，真实改绑未执行（2026-10-17）

PO已确认重载1.7.64，重载本身记为`PASS_WITH_MANUAL_EVIDENCE`。本轮只读核查，不修改产品代码、真实原账、绑定、Native、云端、安全设置或共享开关；不进行真实改绑。

| 核对项 | 结果 | 证据及边界 |
|---|---|---|
| 提交与源码 | PASS | 本地HEAD仍为`e94d273b48e027f8a4c2b8af096d864ab2e9a45d`；产品和直接回归源码相对该提交无差异，已有专项11组及相关回归证据复用，未重复运行已限次数的专项。 |
| 实际加载目录 | PASS | 207产品文件与候选逐项SHA256一致；7个修复源文件与包内容一致，6文件仅工作区CRLF与包LF不同；旧目录备份无文件缺失，原200文件保留，key及权限不变。仅验证代码文件，不冒称Chrome原账/绑定存储快照审计。 |
| 真实终端云端请求 | PASS | 正常主控制台连接诊断实际返回20条请求，均为1.7.64、HTTP 200、鉴权ok；包含账户snapshot/reconcile、stats-integrity、stats、target-stats、hourly-stats及hourly-target-stats。末次成功为北京时间22:18:48，返回窗口无失败。证明该终端正常鉴权请求，不证明统计数值准确或本地Native交换通过。 |
| 云端设备状态 | PASS（限云端观测） | 当前既有设备仍在原孩子范围内显示在线、监控中，未执行恢复、解绑、重置或配置操作；不外推为本机所有绑定字段逐项一致。 |
| 本机绑定与同步 | PASS_WITH_MANUAL_EVIDENCE | PO一次提供正常状态页：1.7.64、已绑定，最后同步22:40:14，云端连接最近成功22:40:17、连续失败0、最后错误为空。只登记脱敏结果，不将原粘贴、账户或设备标识写入Git。 |
| 控件读取Native应用桶 | PASS_WITH_MANUAL_EVIDENCE（限该次） | 最近交换22:40:23，属于当前连接，已发送、已收到响应、已校验接受，结果读取成功；V2当前连接同孩子核验已确认。当日本机应用复合27350秒，学习/休息0秒，完整，结算截至22:40:09。证明当次本地读取成功，不扩展为反向网页接收数值、冷连接长期稳定或共享核算全部通过。 |
| 工具内部页自动读取 | BLOCKED | 浏览器工具仍不能读取chrome-extension协议；本轮由PO正常页面证据补齐上述现场项，不绕过工具策略。Popup未核对。 |
| 真实改绑隔离 | 未执行 | 保留原绑定，不为了验收操作真实A→B→A；隔离回归通过不等于真实Chrome改绑已验收。 |

本轮命令仅Git只读状态/差异检查、代码文件哈希及换行归一比对；`git diff --check`通过，无新产品测试、提交、安装或部署。浏览器只展开既有设备连接诊断，未读取或保存凭据/私有原始数据。最后人工配合仅核对正常本机状态页的绑定/同步与最近本地交换结果；不要求Service Worker、长诊断、重装或再次重载。

现场证据补充：当日网页复合1214秒、学习/休息0秒且完整，网页其他设备显示无其他设备；应用其他设备当日暂不可用，使应用合计仍标不完整，不是本机27350秒无效。历史日期和旧贡献不据此修复。22:40:17旧请求拒绝后22:40:23读取成功，不能用旧拒绝覆盖本次成功，也不能据一次成功宣称间歇失败根因消除。策略仍为影子核对，未启共享；无产品代码、真实账本或配置改动。当前无需PO重复取数或重载。

## 交付更新：控件改绑隔离已集中提交与磁盘更新，Chrome验收受工具策略阻断（2026-10-17）

PO明确批准集中提交、先备份再更新原加载目录并继续真实Chrome验收；Native/云端不改，共享不启用。控件本地提交`e94d273b48e027f8a4c2b8af096d864ab2e9a45d`，仅14文件（7产品、5直接测试、本批TASK_BOARD/DESIGN），原PROJECT_MASTER/CHANGELOG及Task旧稿保留，未推送或PR。复用已通过的精确源码测试，不再次消耗主专项一次复验许可。

唯一内部1.7.64候选207产品文件，tree `7b330acc00e578fe1fc77d3a01e1415e5e91def2c132b12e60306da1e56be01d`；完整代码目录备份207文件，before/backup tree相同`e7beb2ebbf79fcbb219fc413c07550a0f91e342faae60fffff749e76cf3f8a74`。原加载目录7替换、1新增，manifest最后，原200文件含Chrome metadata保留；after完整208文件tree `be3ce09a89fe86420092cf7bce62aa9393d5ead918c09d1fed742c37fa035e84`。根独立逐文件比对207候选文件与实际加载目录，mismatch为0，manifest回读1.7.64。key/权限保持。备份仅代码包，不是Chrome原账/绑定存储备份；本轮没有读取、复制或写入Chrome profile/storage/token，不能称已核验原账存储快照。

Computer Use在只读查看现有Chrome扩展页时安全停止，原因为无法可靠确定浏览器URL以执行策略；根已停止全部浏览器输入，未改用CLI/CDP/其他profile绕过。无Chrome重载或真实改绑行为，真实验收标`BLOCKED_BY_BROWSER_POLICY`；磁盘已64不等于运行中已64。未使用用户凭据、不改真实孩子/配对、无Native/云端/共享/托管变更。安全本地证据由控件保存在ignored目录，不进Git或其他服务。后续需在可验证的浏览器操作条件下重载并继续验收，不能把磁盘哈希或既有隔离11组通过写成实机通过。

## NOW：仅控件改绑隔离实施与隔离验证（2026-10-17，PO已明确批准）

集中审核结果：源码/隔离阶段通过，未发布。根直接读取最终`node tests/unit/ledger-binding-isolation.test.js`退出0及11组完整PASS输出，复核实际模块测试源码与实际绑定、存储、原段ACK及V2发布入口；没有另跑已限一次的命令。覆盖同日A→B→A、同孩换设备、同scope token轮换、原段与V2上传、在途ACK及旧响应、写/容量失败与重启、未知存量保留、稀疏归档、活跃旧会话正秒结算及容量不足不清账、改绑期间网页/媒体旧排队事件丢弃且新观察可开段、真实绑定页到既有CLOUD_BIND路由和不可信sender拒绝。测试使用合成身份、隔离storage与传输；导入的Native/无关模式依赖在夹具中替代，不是真实家庭/Chrome/生产故障注入。

直接回归最终通过：storage-budget14、storage-budget-wiring21、session-queue26、media-timing35、foreground-checkpoint-media5、usage-segments300、device-account-v2 29、device-account-v2-sync8、profile-account-v2-sync42、cloud-usage-batching19、device-recovery39、cloud-upload-fault-recovery三组（含本机回环HTTP），以及typecheck、extension-root、diff检查。主专项两次失败分别发现空媒体关闭写lastHeartbeat及路由夹具缺alarms；前者修正后曾通过，后者补齐，PO原生问题明确允许的一次最终复验通过，未隐藏失败过程。旧故障恢复夹具因抽取helper改名缺依赖失败一次，补夹具后通过，原断言保留。

架构审计Matched：只使用既有child/device与活动账字段做快照切换；归档不复制配置/凭据；成功新scope切换后记录内存切点，正常token轮换不切；存储不清账窗口仅在原两串行锁取得后启用、finally恢复，未放宽硬容量；原历史记录/聚合/旧revision及状态保留，不重归属或重算。改动限控件7个产品文件、5个直接测试、原TASK_BOARD/DESIGN；根保留原其他脏文档。无新增业务接口/来源身份/贡献账/持久队列，无Native/云端算法、配置、共享变更。未提交/推送/制包/安装/更新加载包/部署；运行63不包含本补丁。Missing只列真实浏览器改绑及故障实测未执行，不得据隔离通过宣称生产风险已消除；不再扩查历史差额或暂缓C。

PO在架构会话直接确认最小方案，只修控件改绑隔离；Native和云端算法先不动。按D-109交现有extension-local实施，架构统一审核，不开并行端侧任务。复用现有childId/deviceId/date，对会话切换、现有账读取/上传、日期发布状态及在途请求/回执做同范围隔离；同绑定升级及仅token轮换不生成新账。原历史记录/状态保留，不重归属、不补猜范围、不盲重传。无新接口/身份层/队列/统计算法，无运行包更新/发布/安装/共享启用。

变更等级为网页归属/同步高风险修复，仅批准上述已明示缺口，不改变计时、idle、媒体判定或舍入。最小隔离验证：同日换孩、同孩换设备、同范围token轮换、离线旧段隔离、旧published不跳过新范围、在途改绑/晚回执、持久失败及恢复、同范围重试；实际生产函数与原存储/传输入口，合成身份，不访问家庭或操作运行Chrome。原段及旧状态守恒与新账独立上传分别检查；必要CI/发布smoke不在本轮运行，Native/Mac/安装器/云端及广泛E2E均排除。通过后集中报告，尚未宣称实现或验收完成。

## NOW：来源问题由架构统一收口，两端暂停实施（2026-10-17，PO最新覆盖指示）

PO进一步明确“已确认的问题和推测分开，最简单处置，优先云端，确实无法云端解决再单列最小端侧改动，确认后才动手，不追历史账”。本轮没有生产串账/重复/漏传的实发证据，没有运行改绑复现；已证实的是具体代码行为和保护缺口，不能以静态路径代替事故证明。

最小方案审核口径：
- 云端正常同源版本替换、跨合法来源累计、exact other排除及解绑不删账保持原样；没有证实的业务错误，不改算法、不清other、不新增来源/身份层。正常升级保持现有凭据和来源即可，不要求新协议。
- 弱身份唯一候选自动恢复缺乏浏览器实例连续性依据（device.ts712–769），但尚未证实误恢复。可选云端小修为复用已有pending/家长确认，不新增接口或字段；属于原暂缓C，必须另行确认，不纳入本次自动执行。代价是恢复多一步确认，不能因此宣称解决复制采集。
- 日期发布状态没有孩子/设备范围（控件device-account-v2.js268–309），以及原段日期读取/上传不筛固定归属（usage-segments.js590–595/1762起），是可确认的端侧保护缺口，不是已证实生产漏传或串账。云端既看不到本地跳过的请求，也不能从首次上传载荷推回未传的开账身份，无法单独修复。
- 若PO后续批准端侧最小修订，只使用已有childId/deviceId/date：绑定切换前完成旧会话边界；现有原段读取与上传仅取固定范围；现有日期发布状态按该范围隔离；任务及回执核对启动时范围。相同child/device仅token轮换不另起一份账；旧账不改写、不重新归属，归属不明旧数据保留但不自动补传。不扩为多代身份体系、并行队列重构或历史迁移。该方案触及网页记账线，须逐项明确批准后实施。
- 最小验证以后仅使用隔离身份和合成账：同绑定升级沿用来源；同日期A→B旧账不发送B且B新账不被旧published跳过；切换期间旧响应不确认新范围；同源重试只替换；两个合法来源继续累计。弱恢复如获批另测0/1/多候选及拒绝/确认，不做生产历史差额追查或端侧双采集器工程。

根已直接读取控件会话PO原文“原则上这一问题只涉及云端，转发给Architect统一处理，两端先不动了，否则太乱”。此条覆盖此前控件包A/B实施安排：控件及Native均不推进本问题的代码、身份协议、存储或候选；不新增接口、不改历史账、不追旧账差额、不发布、不改共享开关。已有独立上传故障验收不受影响，不能以旧的发布授权执行本次新方案。

本轮追加只读确认：Native `RuntimeServiceCoordinator.cs:722–732` 将当前machine/child/user/assignment交给本机读取器；`LocalApplicationStatisticsReader.cs:120–130`明确按child/user/assignment/date过滤，并逐行核对machine等归属。因此它不是跨该用户全部历史分配的本机总量；Runtime `applicationStatisticsNative.ts:52–54`排除相同三元组，与当前本机覆盖一致。先前“若本机覆盖旧assignment则可能重复”的条件风险不能记为此实现已确认错误。`other`中的同机其他用户/旧分配不是另一物理机的证明，也不能直接清除；是否存在相同事实跨来源重复仍无生产证据。

网页归属风险分开登记，均未确认实际串账：已上传相同id原段有`stats.ts:1026–1028`范围冲突保护；首次上传原段则在`:979`采用当前鉴权范围。V2 `deviceAccountsV2.ts:48–60/121–170`以当前凭据范围接收统计，没有原事实开账范围证明。本地按日期组织的旧账/水位若被新绑定继续使用，云端无法只凭当前载荷辨认；云端恢复规则修订不能代替端侧切换隔离。此类网页金标准风险保持P0待核，不扩大为已实发事故。

最简处置边界（待PO确认，不实施）：云端只考虑使用既有恢复确认流程替代弱身份唯一候选的自动接管；保留正常持凭据重连、同源版本替换、独立来源累计及合法历史归属。不上新身份层、不按Google账号/设备名/时长猜合并、不做历史全局并集、不新增诊断接口。改绑旧账与日期上传状态隔离确需端侧最小修改，须先说明并取得新的明确确认，不能伪称云端已修。暂不实施重复采集进程/克隆安装防护或端侧重构。

## NOW：来源识别与容错只读分析；撤回诊断接口建议（2026-10-17，PO最新要求）

已直接核对PO：先查单机多控件、升级重装、多用户及重新绑定的现有处理、重复/漏计风险，形成完整来源识别与容错方案，确认后再改；禁止新增接口、改历史账。此前application-source-audit选项B及其开发/部署建议明确撤回，选项记录只保留为过程，不是待执行任务。本轮仅源码/已有证据分析，不查询被拒D1、不索控件/Native数据，不改产品/权限/配置/数据或部署。

## COMPLETED（隔离集成）：新账上传恢复与在途读取隔离（2026-10-17）

根独立读取`new-ledger-upload-recovery/acceptance-safe.json`及最终TRX：74/74执行通过、failed/error/timeout均0，19上传恢复场景与1个worker入口。核对实际测试源码使用新固定身份清单、正式Service调度与SDK、真实回环TCP，以及独立进程强杀/恢复；不是中断已安装生产Service，也没有对生产云端故障注入。覆盖送达前断网、服务端已保存后回执丢失、取消、begin/chunk/commit/status阶段进程中断；恢复后待上传清空、原始V4 payload及冻结manifest/chunks不变、接收端模拟发布应用每快照一次、重复调度不重复；断网期间新增200秒，恢复累计400秒，不将两个累计快照相加。该模拟接收器不是生产Runtime，已由根另行审核的生产幂等代码/精确SHA CI证据补足接收端依据，不能混称生产故障注入通过。

同时根读取`new-ledger-read-isolation/acceptance-safe.json`及最终TRX：99/99执行通过、无failed/error/timeout。真实Service生成新固定身份V4，4入口×断连/同文本连接键重绑/切孩子/授权代际变化16组均拒绝旧在途结果；恢复绑定后新用量180→360，切孩范围不读前孩子180秒。原两项SQLite锁夹具Missing已由新V4确定性用例补齐；验收性质为隔离集成，不是真实家庭改绑/操作Chrome。该条取代前文“两项仍未验收”的当前状态，原过程记录保留。

Native产品无需修复、未重新安装；已安装65的11组件匹配报告保留。锁屏、休眠、Windows整机重启及生产真实故障注入未在本轮完成，不自动扩大。本轮不改旧账/共享/配置/生产，不使other来源取证或父端诊断方案自动获得实施授权。

## 只读核对：新版应用统计上传接收端幂等（2026-10-17）

本项来自Native上传专项，根已直接核对PO要求“断网、重连、丢失确认、上传中Service中断，新账必查旧账不理”；不混other调查/诊断接口或共享。当前Runtime实际回读仍`b6b758db-d559-43ba-86cf-4427533d3ef7`、deployment `afe05ba6-9f15-4a0d-8456-5d64da6446a7`、100%；对应生产39031790611清单master `cb51631f3d63ada35eb06140ad18c04c998de4af`。接收/发布源码和两份测试与该SHA的git diff为空，没有用未部署代码替代。

|重试阶段|部署源码依据|结论（归属和鉴权仍有效时）|
|---|---|---|
|重复begin|`applicationAccounts.ts:104–118`；库唯一键见0013:22|接收ID按machine/user/assignment/date/revision确定；相同版本只插一次，同hash复用原状态，不同hash409，不创建第二份统计。这里是接收幂等键，不重定义Child原账业务主键。|
|同hash分块PUT|`applicationAccounts.ts:120–137`；0013:33|manifest/index唯一，pending才插且冲突不覆盖，实际rows先校验hash，回读已有hash相同才确认。已received后的相同块可确认；不同内容409。PUT阶段固定published:false不代表撤销已发布结果，完整状态须读status/commit。|
|commit回执丢失|`applicationAccounts.ts:139–179`|received清单重复commit直接读原回执；首次接收状态与接收水位同一D1 batch，水位只允许更高revision替换。GET status返回该manifest/hash/revision/state和已有chunk索引，不重新加时长。|
|接收后、发布前中断|`applicationAccounts.ts:216–226`|HTTP重复commit仍调用既有发布器，即使底层接收早已received；显式重试可以补完可读头，不需新统计版本来重传同一内容。|
|重复发布/版本替换|`applicationAccountPublication.ts:239–288`及0013:93|每来源/日期只有一可读发布头，候选只取尚无头或更高revision；UPSERT仅替换指针，不累加时长。更高版本秒数下降也可替换；旧版本重放不回退已有新头。读取器只取发布头对应的冻结chunks，不跨revision累加。|

固定身份算法走同一接收/分块/回执/发布路径：contracts/usage-account.ts:6为`application-fixed-identity-seconds-v1`；publication.ts:151–163识别schema2固定身份，验证快照而非重算原账。新账路径没有另一份“重试时加用量”的处理。

精确部署SHA的CI `39031705345` / job117393322817已通过：application-accounts.test.ts 29项、application-account-publication.test.ts 87项。固定身份证据为publication测试106（固定身份51秒→新版本40秒替换）、129（Native固定生成器含非零/零清单、全部日/小时/身份行原样往返）；共用存储幂等测试accounts422（begin/PUT/commit重放）、520（同版本改内容/旧版本）、529（并发仅一回执）、536（接收事务回滚）、569（HTTP status回执恢复），publication728（重复commit发布头仅1行）、742（已接收后显式重试发布）、925（下降替换与重复不增加）、1211（发布/dirty事务回滚并重试）。这些共用幂等夹具包含旧schema，不冒称每个故障均用新固定身份清单做过生产实测。

结论：已部署接收端的唯一性/事务/替换机制及上述CI证据成立，未发现重复请求会累加时长的代码路径；可作为Native新账故障恢复验收的接收端独立依据。未对真实家庭制造断流/丢回执，不把代码审核或旧schema共用测试扩大为生产端到端故障注入通过；也未找到一项既有云端固定身份用例单独覆盖全部begin/PUT/commit丢回执矩阵。该证据范围已告知Native，不自动扩测、改产品或部署。

## 云端other调查：当前分配事实与最小授权选项（2026-10-17，待PO选择，不实施）

已直接核对PO“根本没有其他设备，云端继续查清”的新指令。通过已有家长会话、正常Runtime设备页刷新，取得当次`GET /v2/module/machines`及`GET /v2/module/machines/:id/users`的200响应。20:49:32当前家庭登记Mac和Windows各一台；Mac三账户当前均非本孩子，Windows机器摘要匹配安装65，两个受保护用户当前都分配本孩子。当前来源assignment1、lastSeen20:49:29；同机另一用户assignment21、lastSeen2026-09-23 02:41:41，sessionActive仍为旧报告true。只有一台当前关联本孩子的登记机器；不能把第二个用户说成第二台电脑，也不能从sessionActive判定其当下活跃。此仅当前分配，不证明该来源有当期已发布账或非零用量。安全摘要位于忽略目录`.tmp/current-application-source-inventory-safe-20261017.json`。

已查实语义：应用other按`machineId+localUserId+assignmentVersion`精确排除当前来源，同机另一用户和同用户历史分配可仍在范围内；不是物理电脑数量。机器ID是配对登记ID（`v2Repository.ts:117`新登记生成rt_machine_UUID），不能单靠不同ID断言不同物理机或重装重复。网页来源另按浏览器deviceId划分，不加入应用来源三元组；浏览器实例不等于应用设备。当前发布读取按家庭/孩子/日期取已发布manifest，不以在线/当前分配取代历史事实归属；解绑、离线和旧分配分别标识，不能因此清空合法确认账，也不能默认将旧身份/重装记录重复计入。实际是否误计仍需当前publication与other结果核对。

现有合法家长路由：机器/用户清单可给当前分配；`GET /v2/module/app-usage?durationUnit=seconds`和`GET /v2/module/program-instance-usage?view=display`可给孩子合计及machine/user筛选，但无精确assignment排除、other或所采用来源清单。实际other在机器鉴权后的`POST /v2/machines/source-statistics`，或Guardian设备鉴权后的`POST /device/source-statistics`可选来源证明；不借用这些凭据给家长查询。已有父端入口不足以获取实际other分项，不能用合计减另一次本机读数代替。

**选项A：临时平台D1 Read，只查数据库。**官方D1 query API明确接受D1 Read或D1 Write之一，因此只需目标Cloudflare账户的`Account / D1 / Read`，不需D1 Write、Workers Edit、Account Read自动发现或API Tokens Edit。使用已知账户和Runtime库ID直接访问query端点，固定SELECT白名单及家庭/孩子范围，短期TTL、完成即撤销；不更改现有发布token。官方参考：https://developers.cloudflare.com/api/resources/d1/subresources/database/methods/query/ 及 https://developers.cloudflare.com/fundamentals/api/reference/permissions/ 。取得方式为账户API Tokens→Create Token→Custom→目标账户D1 Read；token仅由用户在安全凭据入口配置，不进聊天/Git/命令参数/日志，不由根绕过受阻控制台创建。该权限为平台账户层，不承诺可按家庭/表硬隔离，且只查到数据库不能冒充已取得受保护other业务响应。若仅选择A，本项可查清来源账，但完整业务验收仍有限制。

**选项B（推荐）：一个父端只读诊断路由。**待批准新增`GET /v2/module/application-source-audit`；沿用`requireAccountModule`和claims.children、既有machine归属核对；参数childId、最多7日范围及从现有家长清单选择的machine/user/assignment，全部在服务器核对，不把参数当授权。使用既有`readApplicationQuotaBuckets`/`readApplicationQuotaBucketsWithState`/来源分项读取，不另建统计或配额算法。返回现有all/local/other桶，以及实际采用的已发布来源编号、同机其他用户/同用户历史分配/其他登记机器标记、当前绑定/撤销/最后报告状态、日期/revision/hash/cutoff/完整性；严格区分none、范围有来源但未发布、已有可读确认账。缺失增量0不抹除确认量。publication变更时只将本次守恒核对记为更新中，不阻断正常统计或引入新的版本门槛。响应不含token、SID、用户名、路径或跨家庭数据，私有no-store，不开放SQL输入、不提供写方法。需相关源码/隔离鉴权及reader委托测试和单次Runtime部署授权；无migration、Guardian/Pages/终端/共享开关改动。不需扩大Cloudflare平台数据读取权限。此方案尚未批准、未改产品。

D1最小取证范围：`runtime_machines_v2`（id/account/platform/revoked/lastSeen）、`runtime_machine_users_v2`（machine/user/sessionActive/lastSeen）、`runtime_user_assignments_v2`（machine/user/version/child/protected/effectiveAt）、`runtime_application_account_publications_v1`（scope/date/manifest/revision）、`runtime_application_account_manifests_v1`（scope/hash及已冻结applicationUsage），现有读取器校验还需chunks（rows/hash）与ledger_retirements（当前只读规则）。不读原始Segment、配置、凭据、旧贡献账或ACK/水位，不做历史修复。以下为待授权参数化SELECT草案，只取来源/发布元数据；最终数值及hash仍由既有生产读取器核验，不把SQL JSON摘取冒充已验业务输出。

```sql
WITH own AS (
 SELECT m.account_id,a.child_id,a.machine_id,a.local_user_id,a.assignment_version
 FROM runtime_machines_v2 m JOIN runtime_user_assignments_v2 a ON a.machine_id=m.id
 WHERE m.account_id=?1 AND a.child_id=?2 AND m.id=?3
  AND a.local_user_id=?4 AND a.assignment_version=?5 AND a.protected=1
  AND m.revoked_at_ms IS NULL
  AND NOT EXISTS(SELECT 1 FROM runtime_user_assignments_v2 n
   WHERE n.machine_id=a.machine_id AND n.local_user_id=a.local_user_id
    AND n.assignment_version>a.assignment_version)
), scopes AS (
 SELECT a.machine_id,a.local_user_id,a.assignment_version FROM runtime_user_assignments_v2 a
 JOIN runtime_machines_v2 m ON m.id=a.machine_id CROSS JOIN own o
 WHERE m.account_id=o.account_id AND a.child_id=o.child_id AND a.effective_at_ms<?9
  AND NOT EXISTS(SELECT 1 FROM runtime_user_assignments_v2 n
   WHERE n.machine_id=a.machine_id AND n.local_user_id=a.local_user_id
    AND n.assignment_version>a.assignment_version AND n.effective_at_ms<=?8)
 UNION
 SELECT p.machine_id,p.local_user_id,p.assignment_version
 FROM runtime_application_account_publications_v1 p CROSS JOIN own o
 WHERE p.account_id=o.account_id AND p.child_id=o.child_id AND p.date BETWEEN ?6 AND ?7
)
SELECT DENSE_RANK() OVER(ORDER BY s.machine_id,s.local_user_id,s.assignment_version) AS source_no,
 CASE WHEN s.machine_id=o.machine_id AND s.local_user_id=o.local_user_id
       AND s.assignment_version=o.assignment_version THEN 'current_source'
      WHEN s.machine_id=o.machine_id AND s.local_user_id=o.local_user_id THEN 'same_user_prior_assignment'
      WHEN s.machine_id=o.machine_id THEN 'same_machine_other_user'
      ELSE 'other_machine_registration' END AS relation,
 m.platform,m.revoked_at_ms,u.session_active,u.last_seen_at_ms,
 s.assignment_version,p.date,p.revision,p.manifest_id,
 CASE WHEN p.manifest_id IS NULL THEN 'not_published'
      WHEN f.id IS NULL THEN 'invalid_scope' ELSE 'published' END AS publication_state,
 json_extract(f.manifest_json,'$.durationUnit') AS duration_unit,
 json_extract(f.manifest_json,'$.algorithmVersion') AS algorithm_version,
 json_extract(f.manifest_json,'$.settledThroughMs') AS settled_through_ms,
 json_extract(f.manifest_json,'$.applicationUsage') AS frozen_application_usage
FROM scopes s CROSS JOIN own o JOIN runtime_machines_v2 m
 ON m.id=s.machine_id AND m.account_id=o.account_id
LEFT JOIN runtime_machine_users_v2 u ON u.machine_id=s.machine_id AND u.local_user_id=s.local_user_id
LEFT JOIN runtime_application_account_publications_v1 p
 ON p.account_id=o.account_id AND p.child_id=o.child_id AND p.machine_id=s.machine_id
 AND p.local_user_id=s.local_user_id AND p.assignment_version=s.assignment_version AND p.date BETWEEN ?6 AND ?7
LEFT JOIN runtime_application_account_manifests_v1 f ON f.id=p.manifest_id
 AND f.account_id=p.account_id AND f.child_id=p.child_id AND f.machine_id=p.machine_id
 AND f.local_user_id=p.local_user_id AND f.assignment_version=p.assignment_version
 AND f.date=p.date AND f.revision=p.revision
ORDER BY source_no,p.date LIMIT 701;
```

参数1为经家长鉴权核对的家庭，2为已授权孩子，3～5为当前来源选择，6～7为日期，8～9为北京时间范围起止毫秒（右开）。无own时不查询其他数据；仅返回脱敏来源编号，不输出原始身份。该草案未执行，不以其存在当作生产核对通过。当前缺的是受限取证权限/父端诊断入口，不是再次部署全部系统或启共享的理由。

## 云端当次生产读取：合计守恒已证明，other来源验收受限（2026-10-17）

PO在控件会话直接要求云端查清实际other返回，不转交终端/用旧数据替代；根已直接读取该人类指令。未再向控件或Native索取页面/storage/wire/UAC。既有CLI的精确SELECT权限拒绝后，正常Cloudflare控制台同样被浏览器保存策略阻止；未换浏览器、CDP、间接执行或其他手段绕过该控制台限制。较低权限的已登录Runtime家庭业务页面可独立读取，未扩展认证权限或提取token。

根通过正常应用页刷新及该页合法响应的只读网络观测取得当前生产200：`/v2/module/program-instance-usage?view=display`，日期2026-10-17、无machine/user筛选；实际请求child与响应一致，响应child摘要与安装65证据匹配。20:38:21观察到冻结截止20:33:10.500、revision `822393ccda96a2e9051a29d5fcaad878647aa67bd652da1ba227994e527ec1dc`：总22446秒，四条应用19970+2264+209+3=22446；分类unclassified22446，applicationUsage.nonSpecialTotal/分类同为22446、specialTotal0、complete=true。该合计与自身明细/分类守恒，不是旧21709/4825。网络观测已结束，无产品写入。

本次响应不含applicationSources或publication references，不能证明本机排除、other组成来源及同一快照逐桶守恒。源码证实实际共享查询只在`/v2/machines/source-statistics`的requireMachine＋当前assignment后，或Guardian`/device/source-statistics`的既有deviceToken及可选来源证明后提供；当前家长会话不是这些身份，不能伪造/借取凭据或新增身份入口。管理页filter也无精确assignment排除与同一快照引用，不用all减另一次本机读数冒充other。故本轮other正确性、无其他来源／有来源未发布／有确认账区分及保留确认量的生产实测仍受限，未证明产品错误也未记通过；不因合计complete=true推断其他设备完整或不存在。安全摘要保存在忽略目录`.tmp/other-sources-business-response-safe-20261017.json`。

## 验收中：控件63重载后的其他设备读取（2026-10-17）

根已直接读取控件会话PO回报“已重载，绑定正常，同步没有报错，继续检查其他设备数据读取是否正常”，该项记PASS_WITH_MANUAL_EVIDENCE，只证明重载/绑定/正常同步，不证明其他设备数值通过。控件会话已向Native索取当前既有SDK的local/other及截止，根不重复调度或要求UAC。

根目前没有可直接读取的终端实际wire。复用现有受限D1 SELECT脚本前，已先对照安装65安全证据确认孩子/机器/当前来源摘要相同；精确anchor只读重试仍D1_AUTH_PERMISSION_DENIED，仅1网络请求、无产品写入，scopeVerified=false，已停止，不扩权限或改查询绕过。此为根诊断凭据不足，不是业务API返回503或统计本身失败。旧SDK21709秒同截止证据不冒充此次other读取；其他来源全集及本轮端侧消费仍待实际结果，不能将缺失增量0写成确认无其他设备或完整零量。无新产品修改/部署/安装/共享启用。

## 补充核查：Native12项失败的实际影响（2026-10-17，非全功能通过）

已读取Native会话最新PO原话“向前看，新账必查，旧账不理”，不以旧测试失败恢复退出的旧账链。Native逐项报告将12项分为：4项仅V3旧生成/上传前提，1项旧实例schema3冻结头夹具，5项产品视图缺失，2项断连/切孩子在途隔离负例在SQLite锁夹具处提前失败。前5项不作为当前新账故障；后7项不能笼统写成无害或已通过。Native补充Reader/Pipe/UI37项通过的报告保留，不替代两项并发隔离负例。

根独立只读核对实际安装65的`installed-regression-impact-safe.json`：当前默认统计与实例基础均完整22288秒；产品入口基础亦22288秒，但产品missing、APPLICATION_PRODUCT_MISSING、subjects0。源码`RuntimeServiceCoordinator.MaterializeChildStatisticsOnceAsync`固定身份分支直接返回，未走后续旧产品物化；`UsageStatisticsWindow`仍保留产品选项并在missing时回退基础。此为现存入口功能缺口，不是基础总量清零证据，也不等于新身份统计或原账丢失。本轮只登记，不自行恢复旧产品投影；后续仅核对仍服务新账的实际消费者，避免把退出的旧账/旧生成协议重新接回。

默认分类同截止21709秒实机单项通过结论不变；不能宣称产品明细、断连/切孩子隔离或Native全部功能已通过。当前根无产品修改、安装、部署或旧账操作，本项未设新的发布/修复授权。

## COMPLETED：Native65默认分类同截止核对；控件63磁盘交付（2026-10-17）

根独立只读核对Native65采样文件而非仅采用口头passed：实际Service/读取程序集2.6.65.0，当前用户来源匹配、云端included仅该当前来源。冻结revision183、截止北京时间2026-10-17 20:18:21.486，本机nonSpecialCategories.unclassified=21709秒，正式云端schema1同来源unclassified=21709秒，schema2 composite=21709秒；outbox received。安装后自然新增69秒已进入该冻结版本；后续revision184新增40秒pending不混入比较。18表保留摘要全部通过；原账/配置/分配/冻结outbox保留。固定产品提交`9a4d2487ed6f07237d665b0e15403b331c0e0c23`，Native报告75相关用例通过，另12宽回归旧失败已在64基线复现，不写成全量绿。当前新账无明确配置→未归类→复合桶本项实机链路通过，不扩展为全部应用配置、其他来源全集或共享验收；schema1仍有其他来源未发布的诊断，不清旧账掩盖。

控件所属报告1.7.63原加载目录更新后，根再次只读逐文件验证207个文件SHA256全部一致，磁盘manifest1.7.63、key及permissions与已核验备份相同。备份完成、10替换+1新增、manifest最后；绑定/storage/家庭配置/托管及共享均未操作。实际Chrome尚未重载，不能把磁盘交付写成已运行63。下一步仅原扩展重新加载一次及正常页面实测，不卸载/解绑/清数据、不启共享。

## COMPLETED：确认账读取双Worker发布（2026-10-17）

PO在本会话直接授权范围已执行：源码`a49701a`、整合`539db1b`及单行覆盖诊断修正`10f2417`经PR291合入master `cb51631f3d63ada35eb06140ad18c04c998de4af`。精确主线Runtime CI `39031705345`及Guardian `39031705277`均success；生产`39031790611`success。GitHub生产审批通过内置浏览器正常完成，未修改保护规则、凭据或权限。

仅Guardian版本`7ccbd372-b3bc-4acc-b6b5-d5602d294124`（deployment `f506d179-df27-4288-ac21-ab341d6130e0`）和Runtime版本`b6b758db-d559-43ba-86cf-4427533d3ef7`（deployment `afe05ba6-9f15-4a0d-8456-5d64da6446a7`）发布并实际回读100%流量。发布清单两类migration均空、sharedAccessShadowPrepared=false、deployedResources仅两Worker；两套Cloudflare Pages步骤skip、原部署ID不变，不改托管/R2内容。Guardian新版本实际绑定回读`SHARED_ACCESS_EXECUTION_ENABLED=false`。发布后独立冒烟：Runtime health200、Runtime未鉴权目录401、Guardian未鉴权account-token401及source-statistics401。

整合回归保留原断言通过；跨线默认Windows checkout的CRLF造成字节哈希差异已确证，242处CRLF归一后精确匹配固定LF SHA256，原LF产物以原测试argv跑7服务案例+4故障案例通过，不改测试或放宽断言。旧Admin四项基线失败与Native新账默认分类缺口仍独立保留，不能因本次发布声称其通过。PR附件工具返回会话附件数量上限，PR真实链接为https://github.com/william-xia-cn/timeonchrome/pull/291，不删除其他附件绕过。

源码/部署Matched；真实鉴权备用分项及控件当前63重载验收尚未完成，不用health或401代替。已通知控件所属会话按其既有直接授权接续备份更新，保持绑定/本地数据/共享关闭。当前任务板发布回填为本地证据，不为文档再发一次产品部署。

## 本批整合回归修正（2026-10-17）

PR291 Guardian CI已定位：控件获批将配额读取器`completeness.complete`改为本机可用状态后，云端纯快照适配仍把该字段误当云端覆盖状态。仅把`workers/src/services/sourceStatistics.ts`的诊断字段读取切至同一既有读取器的`cloudCoverageComplete`；数值、原账、上传和业务放行不变，不放宽现有失败断言。补跑直接云端回归、跨线原始LF夹具及typecheck，之后由原PR复验；不扩大其他历史或Native范围。

## 只读复核：当天未归类新统计计入复合（2026-10-17）

按Native会话最新人类指令，旧来源4825秒本轮不处理、不用来解释新链路。根已独立读取正式SDK安全结果`new-unclassified-cloud-safe.json`：查询仅2026-10-17，schema1 included仅当前用户来源，基础20699秒、`categories.unclassified=163`；schema2为学习0／复合163／休息0，均保留partial及`NATIVE_LEGACY_SELECTION_UNAVAILABLE`。因此当天已生成的163秒未归类在现网正确进入复合桶，未混入前日旧来源。已发布基线4919227的契约`source-statistics.ts:79～83`即`composite + unclassified`，Runtime原持久读取器把`applicationUsage.nonSpecialCategories`直接委托此唯一适配；1.57未改该业务公式，既有固定用例composite200＋unclassified10→210通过证据复用。

该结果不证明“全部未配置新应用都已正确生成未归类”。当天基础与已知配额差额20536秒不能直接说成漏记，也不能未经依据全部扣成特殊应用；须由Native区分特殊时长、已知分类及缺selection部分，并核对安装后新段，不能笼统归为10/16旧账。云端不把缺失applicationUsage猜成未归类、不重分类原账来凑数；尚未完成部分明确未验收。

后续真实新段证据已到：根只读核对`post-install-new-selection-safe.json`，实际Service64启动边界后当前来源19条记录、原段合计2634秒，均`selection-not-eligible:dynamic-process`；16条仅`PROCESS_NAME_FALLBACK`，3条另有`SERVICE_BOUNDARY_IDENTITY`。2634为原段秒数，非并集有效总量，不据此直接补账或认定全部缺口。Native所属定位为无显式配置时`NativeApplicationStatistics.Build → InterpretLegacy → SelectsExecutableObject`仍要求identified／专用EXE正证据，动态身份因此进入historicalUnknown/null而非默认unclassified。此为Native新账分类接线缺口，不是云端把163丢掉或本地交换失败；`NATIVE_LEGACY_SELECTION_UNAVAILABLE`不能再笼统等同“只有旧账”。默认分类的完整验收仍未通过；这些有效新段及其派生统计必须从旧清理范围排除，云端不猜补、不删新账、不掩盖原因。

旧清理边界：当前仅有旧来源B／2026-10-16／4825秒的API线索，缺精确publication manifest／revision及可删除事实范围，不能据此立即删除。只允许后续经范围核实及受限备份的旧来源派生记录清单；所有当前固定身份新统计、新原账、ACK／版本水位、配置和配对必须排除。现有`applicationLedgerRetirement.ts`整家庭退出函数有已执行保护，且旧算法白名单不等于本次语义上的旧账，不重跑或绕过它。D1只读权限仍不足，未编造完整旧清单、未清库、未执行删除或迁移。发布直接授权问题与本项只读核查分开。

## NOW：本批只读容错集中发布（2026-10-17，PO明确授权）

权限阻塞已解除：PO现已在本Architect会话直接批准“本批提交、推送、合并并部署Guardian和Runtime，不迁移、不启用共享、不托管”。据此恢复下述精确发布范围；此前两次拒绝记录保留，不通过其他会话或替代写接口绕过。本轮也不清理旧账，不修Native默认分类，不将其未通过状态冒充本批已修复。

已直接核实控件会话本轮人类原话：“提交、推送并部署云端，把本机当前加载的控件也更新，我手工验收一轮。保留绑定和本地数据，不启用共享，暂不托管。”本条覆盖下方本批“不提交／部署／更新加载包”的阶段限制，不扩大为配置、原账、上传、migration、Native安装或托管权限。

架构／标准云端负责1.57契约及必要Guardian／Runtime，只提交已审18文件和同线有效验收记录，不混未追踪包、私有证据或其他草稿；控件所属独立负责原加载目录备份／1.7.63更新与手工验收指引，不重复提交根契约／锁。复用精确源码的20项Runtime、Guardian／契约、类型、dry-run及跨wire通过证据，只运行必要CI和发布后health／未认证隔离smoke。四条旧Admin基线失败原样披露；遇真实门禁阻塞报告具体原因，不伪造绿灯，不顺带修代码或迁移。现有工作线不新建分支／工作树；源码合入、实际部署、本机加载和现场验收分别登记。

当前执行阻塞：两次精确18文件提交／推送命令均在进程创建前被权限审核拒绝。第一次审核将Native另项只读other核查套用于发布；根重新直接读取控件最新人类发布原话后，第二次审核仍认定另一会话授权不能替代根当前直接授权。两次均未执行，没有暂存／提交／推送／PR或生产变更；停止重试，不换GitHub写接口或由另一会话间接代执行。待PO在根本会话直接确认本批提交／推送／合并及Guardian＋Runtime发布范围；现有源码、固定包、已通过证据及本机加载目录保留，不重新测试无变化源码。

## 只读核查：other来源、零桶与云端缺陷分界（2026-10-17）

独立于发布，已核实Native会话人类只读范围及其安全SDK报告`other-source-details-safe.json`。当前2026-10-12～17的schema1实际读取只有一个included来源，键与本机另一个受保护Windows用户精确相同，当前用户来源被排除；16日基础总量4825秒（80分25秒），非特殊总量null、分类空，原因`APPLICATION_USAGE_CLASSIFICATION_UNAVAILABLE`／`NATIVE_LEGACY_SELECTION_UNAVAILABLE`，截止为该日06:55:12.648。其他五日为null与`APPLICATION_SOURCE_NOT_PUBLISHED`，不是已证完整零。

生产基线`4919227`的`backend/src/sourceStatistics.ts`中`included.add(key)`仅发生在已验证publication并读到日total后；expected当前保护分配另用于缺失诊断。因此只证明本次已读已发布来源是本机另一用户，不能推出所有未发布来源或历史分配不存在。schema2的available是任一天有可读统计，不代表全周期齐全、非零或另一台物理电脑。基础4825秒仍被返回，配额桶0来自缺少可采纳的分类／非特殊贡献；按PO未知增量0规则不能猜分这4825秒，也不能把分类缺项说成云端删掉总时长。该历史来源为何缺字段尚无服务器完整清单证据，不据此追改旧账。

当前已证的云端读侧代码缺陷：生产`applicationStatisticsNative.ts`的`mergeApplicationUsage`任一来源缺分类／旧单位即整组null，可能抹掉其他已确认来源的配额桶。候选`quotaRead`路径保留好来源，已用600＋缺分类及下降用例证明，20项专项通过，但未提交／上线；普通统计和原账不改。本例仅一个已发布来源且自身缺分类，不能把候选的多来源缺陷复现当成本例已证根因。云端备用本机／其他分项为新增兼容能力，缺证明／坏分项／读中改绑／发布头变化只丢分项保留合计，候选已测，生产尚未提供该能力。分页TTL丢终端确认缓存及上传退避阻下行属于控件消费路径，已由所属修正，不混称云端原账错误。

最小D1核查已发起一次精确source-key anchor SELECT，现有正常认证返回`D1_AUTH_PERMISSION_DENIED`，未取得数据库结果，未扩权限或重复登录。安全报告在root忽略目录`.tmp/other-sources-production-safe.json`，networkRequests=1、productWrites=false、scopeVerified=false；后续来源全集查询未执行。现阶段只能给上述API实测与基线代码结论，不能声称完整服务器来源清单或全部云端问题已查尽；未修改代码、数据、配置或部署。

## NOW：云端确认账容错与备用应用分项（2026-10-17，PO逐项批准）

已直接核实控件会话人类回复：批准同孩子／设备／周的过期传输快照保留确认账、未知增量0、不以完整性阻本机；批准本会话云端／必要契约修改及双向交接。中等风险，仅只读适配与兼容transport，复用现有工作线和未提交任务记录。

实施checklist：①契约保留原query／snapshot并增加includeSources可选envelope及侧车隔离校验；②Runtime既有持久读取器在配额路径保留其他有效来源桶，并由可信source精确读取本机／其他分项；③Guardian原设备路由复用现有证明核验及Service Binding转接，不另造识别／配对；④核对网页既有已发布deviceAccounts可继续复用，不改原snapshot/hash／ACK／水位；⑤控件所属按固定形状接线，本会话对照审核。

最小测试：契约旧响应／新envelope／坏sidecar／孩子周期隔离；Runtime已确认来源＋缺分类来源／更正下降／精确source拆分；Guardian旧端兼容／无效或缺证明仍合计可读／可信浏览器关联及家庭隔离。仅相关专项、typecheck、必要dry-run与diff检查，精确未变证据复用；排除全量、Windows／Mac／安装器、真实家庭写入、migration、部署、候选更新和共享启用。先完成源码及隔离验证，不冒充生产或实机通过。

本批云端源码与隔离结果：①原业务query／snapshot保持严格，opt-in纯transport进入1.57.0；有效合计＋无效分项只保留合计；②原持久秒读取器仅quotaRead容错保留已验证分类桶，普通统计行为不变，本机云账和其他来源分别精确查询，不作减法拆分；③Guardian复用原V2签名／当前浏览器校验，Runtime当前家庭孩子内解析并在读后复核分配，缺／过期／篡改证明或改绑丢分项但不清合法合计；④网页既有快照读取无产品改动，缺inventory仍保留已发布deviceAccounts，终端同范围TTL容错由控件所属实现。无原账、上传、ACK、水位、生产配置或迁移改动。

精确验证：`npm run build:app-runtime-contracts`、契约`source-statistics.test.mjs`／`contract-compatibility.test.cjs`、根`source-statistics-cloud.test.js`／`shared-web-contributions-cloud.test.js`通过；backend `npx --no-install vitest run test/source-statistics.test.ts` 20/20，含实际Service Binding旧端／可信来源／跨范围／读取中改绑。最后补验三次读取之间发布头600→100：首次已选合计800保留、分项300丢弃；下一次稳定读取合计300／本机100／其他200正常采用，不阻止更正下降。root／backend typecheck、两Worker本地dry-run、模块边界与联合职责检查通过，最后Runtime守卫变更后仅重跑其dry-run。初轮构建因沙箱生成目录EPERM未生成新dist，随后的旧dist断言不算产品失败；同范围授权构建后通过。首轮root typecheck发现V2证明联合类型未收窄，补字段守卫后通过；diff检查发现文档尾空行，修正后通过。Runtime新增夹具的assignment FK与固定范围复用问题已修正并聚焦通过，没有放宽产品断言或校验。

唯一1.57内部包SHA256 `0921e4f2149642a974e62936645cc2b84dde36e3ea6ae2a802ee766803ad4157`；消费JS SHA256 `f535288d16622976a28c247ad3b5b8d7d7c50906361ef2a82acff293f99e5de1`，控件按同包接线。1.56原包hash仍为`a13f7ee1ef3ae6dd53a052efdbb2faf49f079595ace3de95065a12c1a98765f2`，未重建。根审控件实际local-first读取、只读proof访问器、固定helper与孩子／连接隔离为Matched；控件真实HTTP消费者对deviceRouter生成的纯合成wire完成7服务端＋4故障场景，wire SHA256 `5d52e38874c2526c7b80bffbba42d9cc9d6def58aa7588120e08ffa780825b1c`。这不是跨Worker全生产实机证据；route传输mock、Runtime真实D1入口及P256验证的证据分别保留。控件另报配额43／下行42／缓存11及相关来源／证明专项、typecheck／扩展根与Admin／Popup隔离目视通过；纯合成向量已入测试目录，默认专项不依赖本机临时目录。

本批审计checklist①～⑤为Matched，无Deviated／Missing／未批准Extra；不将未实施的生产安装与现场验收算作本批源码缺项或通过。当前仅源码和隔离证据，未提交、推送、部署、安装、更新62加载候选或启用共享；不索PO重复重载／长诊断。后续只需按集中交付范围更新一次，再核对实际读取；不重做已通过的Native Service缓存链或追历史分类。

保留风险已补齐基线依据：控件所属保存的`.tmp/admin-baseline-comparison-20261017.json`经根只读核对，HEAD `f62f8d4540fb4f354c544b0304cfe0ad57963443`原test／admin.js／admin.html通过只读fs适配在隔离VM运行，与当前均为110/114、同4项失败（原工具输出934ca0，当前856166）。四项为“admin 访问管理页默认展示网站管理”“admin 访问管理 Tab 切换只同步显示状态”“admin 本地自主度页应只读显示进入确认和休息软限额”“admin 本地提醒说明应明确账本和两种超时口径”。本批admin.js只修改周用量解释句，不涉及旧导航／自主度／提醒模型；该证据支持它们不是本批新增回归，不代表断言本身已修复。新显示专项和目视通过不覆盖综合专项失败；不顺带修复、不重跑无变化套件、不据此宣称全部测试或生产发布准备通过，本批仍未提交。

## COMPLETED：Windows 实际 Service 读取云端 other 并连续刷新缓存（2026-10-17）

按PO仅收口此链的授权，Native所属已完成源码 `bc6db5b841067b163bd5ca0f771eb7e89bd3aea0`、35项聚焦回归、唯一内部2.6.64候选及本机安装。后台远端读取预算改为有界15秒并尊重父取消；本机2.5秒本地读取、原后台周期和云端版本均不变。MSI exit0，实际Service／Agent为2.6.64，18表原账及管理配置保留核验通过。

Native实机报告确认：升级前当前用户other缓存不存在；升级后同一实际Service进程自然创建并续写当前范围缓存。北京时间cloudRead `18:38:31.381 → 18:39:14.912`，对应diskWrite `18:38:34.459 → 18:39:17.974`；只读观察器3个样本、2个不同cloudReadAt、同1个ServiceGeneration，`actualServiceBackgroundReceiveAndCacheVerified=true`。观察器`networkRequests=0`、`productWrites=false`，没有主动诊断HTTP或代写产品缓存。该证据区别于先前SDK主动只读对照；既有本机报告为 `windows-candidate-2.6.64/后台读取与缓存验收.md`，不把受保护缓存或身份数据放入Git。

本项结论：实际Service后台“云端读取 → 接收 → 当前范围缓存 → 下一轮自然更新”通过。缓存状态`available`，原6日0桶／partial及原因保持不变；available不代表非零、全部分类完整或另有物理电脑。本轮不继续查控件、交换或分类，不启用共享、不改旧账、不索页面，也不追加认证、部署或无变化测试。沿用已发布Runtime版本 `3949e355-e569-4b1b-bfaa-45237b8690ee`；本项完成不代表共享提醒／限制或全部功能已验收。

## 2026-10-17 集中交付：Runtime已发布，本机分类缺项独立跟进

PO已在Native所属会话授权两端更新、必要Runtime部署及真实读取显示验收，共享关闭、旧账不改。PR #289合入master `4919227c6ecfd3dc00168ac4750524ba90610f40`，精确主线CI `39021922024`必要检查全部成功。主线集成只保留双方追加文档，Runtime src／config／锁及契约与冻结6c0a613一致。

Runtime于北京时间2026-10-17 18:10:20完成发布：Worker `timeonchrome-app-runtime-api`，version `3949e355-e569-4b1b-bfaa-45237b8690ee`，deployment `cf93d5f3-665c-4415-b152-1fa7d766d7fd`，版本回读为100%流量。仅执行原制品的`deploy --no-bundle --keep-vars --config wrangler.jsonc`，没有重建；上传前后本地冻结JS SHA256均为 `8e5e52729e4a1c74343b4b981246fbc5fbfb5deaa64d7548d63650fad1d5b772`。该哈希是本地上传制品证据，不冒充已下载线上脚本逐字节核对。发布后health=200、未认证机器来源接口=401。旧版回滚依据 `b83faedc-b229-4ec6-a22c-12da1ce6237f`已保存在受限本地生成证据；未执行回滚。原cron／D1／R2／Service Binding保留，没有其他Worker／Pages部署、migration、R2内容操作或配置／旧账修改。真实鉴权other来源状态由Native既有后台读取继续核对，版本上线不等于该功能现场已通过。

本轮认证阻塞已解除：普通OAuth实际等待120秒，先前称5分钟错误；device flow首轮5分钟未获grant，后续设备端点403有HTML挑战特征，未猜称登录成功。跨线程转发默认及最小OAuth链接均被安全审核拒绝后停止传递，不换渠道绕过。最终由Native在同一会话内发起最小正常登录并完成IAB操作，仅回报CLI exit0；权限为account:read、workers_scripts:write及官方固定offline_access，没有传递或提取token。root直接复用官方凭据存储完成发布，没有扩scope。

Native所属报告2.6.63安装、11组件及18表保留核验通过，控件原目录1.7.62逐文件核验并由PO重载。17:51:45～47正常页面为`PASS_WITH_MANUAL_EVIDENCE`：v3、当前同孩子确认，本次exchange属于当前连接且sent／received／accepted均true；网页本浏览器当日0／721／0秒完整、截止未提供；应用本机0／163／0秒仍partial、截止17:50:23。other未知独立呈现，没有遮蔽本机，不能认定共享执行或全部分类已通过。Native另一次合法Service只读结果为基础总量16131秒／Complete=true／基础reasonCodes空，classificationReasonCodes为`NATIVE_LEGACY_SELECTION_UNAVAILABLE`；分类配额桶与基础总量用途不同，不作差认定丢账。Native继续核查分类读取限制，控件所属已定位该码及`SOURCE_PARTIAL`未进诊断白名单导致“原因未知”，尚未修正；不把它们归因于exchange或other未知。本轮不自行放宽旧键、改分类／原账或新增候选。

## NOW：其他设备读取修复已部署及1.7.63磁盘更新，待Chrome重载手工验收（2026-10-17）

本次授权覆盖下方不提交/部署/更新加载包的阶段限制。extension-local提交本轮消费者及前序已验60–62读取接线，经PR集成；架构统筹云端/1.57契约的固定工作线提交及Guardian/Runtime部署。只读smoke，不部署Pages、不执行migration、不安装Native、不改家庭配置/原账/ACK/水位；共享保持关闭，正式托管feed不动。本机仅制作独立1.7.63开发候选，完整备份后更新原加载位置，保留key/ID/权限/metadata，不卸载/解绑/清storage。旧Admin四项基线失败继续披露；复用精确源码专项证据，不将失败改为通过。文档只提交本轮块，旧草稿原样保留。

交付回读：控件PR290已合并9e0b10ae690f988ad7af1e4a8a25d8b3cf658be0，CI39029026764通过；云端PR291合并cb51631f3d63ada35eb06140ad18c04c998de4af，精确主线CI39031705345/39031705277及生产39031790611通过。所属云端线回读Guardian version=7ccbd372-b3bc-4acc-b6b5-d5602d294124、Runtime version=b6b758db-d559-43ba-86cf-4427533d3ef7，均100%；health200、未认证module/account-token401符合预期，实际Guardian共享执行binding=false。未执行迁移、发布Pages或修改正式托管。

当前原加载目录已从1.7.62完整备份后替换为1.7.63开发候选：10文件替换、1新增，manifest最后写入；206个产品文件逐项SHA256符合冻结候选f4a6cf80dfacbc8664ae8ddd429c12ada425b5197436ff180743683959c0cf5d；196个原文件（含Chrome metadata）保持，完整备份已核验，更新前后文件计数分别为206/207。稳定ID jdcancbiocacabbjdkngadmjpjmkdnih、key、权限及开发标记不变，未操作storage/绑定/家庭配置。ignored证据.tmp/local-unpacked-1.7.63-update-evidence.json。Chrome尚未重载，不声称运行中已是63或已通过家庭实机验收；下一步仅对原扩展重新加载，再核对Popup绑定及立即同步。旧Admin4项与对账P0继续保留。

## COMPLETED：其他设备结果读取容错收口（2026-10-17，源码与隔离验收，未发布）

PO已逐项批准：云端负责容错，终端消费确认结果；未知其他设备增量按0，既有确认量不清零；云端本机副本仅核对、不重复计入。批准架构统筹云端分项及双方交接，不部署、不启共享。本机不可读仍不伪造0，原账、历史、ACK、水位及家庭配置不变。

实施审计Matched：①usage上传退避/失败/抛异常也独立执行下行，错误分别保留；②执行及备用缓存按apiBase/deviceId/childId/北京时间周期隔离，异步改绑撤销结果；③同scope同周的已验证确认账不因30分钟分页会话过期清零，缺失增量0，cloudCoverageComplete等只作诊断、不使本机不可读；④原V2 deviceAccounts完整保留、本机云副本不重复计入；⑤应用云端备用显式includeSources，可选复用现有云签证明，无新增握手/配对/持久凭据，严格合计与可选分项独立校验、互斥选择、配套缓存；⑥服务器三次读取间发布变化仅丢不一致分项，合法合计保留；⑦Admin/Popup显示云端已确认贡献，不宣称全设备账目完整。没有未批准Extra或替代方案。

固定1.57契约包SHA256=0921e4f2149642a974e62936645cc2b84dde36e3ea6ae2a802ee766803ad4157，仅引入source-statistics.js（16813字节，SHA256=f535288d16622976a28c247ad3b5b8d7d7c50906361ef2a82acff293f99e5de1），复用集中readQuotaBucketsCloudRequest/Response。旧1.56及冻结62不覆盖。原接口旧直接snapshot兼容；新envelope坏分项不拖垮合计，expected child只在控件内部、不进业务query。

控件最小专项通过：quota-read-model-v2 43/43；profile-account-v2-sync 42/42；profile-account-shadow-v2 11/11；source-statistics-shadow；shared-sync-diagnostics；shared-web-contribution-sync；shared-web-reusable-binding（固定1.31包）；other-device-results-view；source-statistics-cloud-wire。最后一项用实际readCapturedSharedDeviceJson+readCloudSourceStatistics消费Guardian实际路由生成的纯合成HTTP向量，7种服务端响应+4种客户端故障通过；默认从tests/fixtures/quota-cloud-wire-1.57.json读取，允许argv指定服务端产物，SHA256=5d52e38874c2526c7b80bffbba42d9cc9d6def58aa7588120e08ffa780825b1c，无本机临时目录依赖。typecheck、check:extension-root（2.74MB）、diff检查通过。未变Native客户端复用冻结证据，不追加无关系统测试。

云端所属已回报并经代码/测试范围交叉核对：Guardian实际route、SQLite/P256原证明专项，Runtime实际RPC与持久读取器20/20、两侧typecheck/dry-run通过；改绑/发布头竞态仅缺分项，不使合法合计失败。wire中的Runtime/proof按边界mock，真实D1/签名由独立专项验证；这些是源码/隔离证据，不冒称生产或家庭实机已更新。云端证据记录其现有TASK_BOARD，不新增报告。

UI使用实际配额模型及Admin/Popup生产渲染器验证local-only、cloud-missing-increment、cloud-confirmed-zero三种场景，Admin1440/390、Popup320及零/缺源页无横向溢出；.tmp/other-device-{admin-desktop,admin-mobile,popup-320}.png已逐张目视Matched。仅两处主视图文案变化，不改CSS/导航或控件结构。

保留旧Admin综合专项4项失败，不写全绿：访问管理默认网站管理、Tab切换只同步显示状态、进入确认和休息软限额只读显示、旧提醒账本及两种超时说明。当前110/114；用HEAD f62f8d4540fb4f354c544b0304cfe0ad57963443原test/admin.js/admin.html只读VM对照同样110/114及同4项。与本批一行周用量解释无关，不修旧导航/软限额产品模型。既有输出与4项完整断言名登记.tmp/admin-baseline-comparison-20261017.json（原chunk934ca0，当前856166）；不重跑或豁免整个套件。

未提交、推送、部署、托管、安装或更新当前加载目录；磁盘manifest仍1.7.62，绑定和Chrome本地存储未操作，共享保持关闭，原有脏改及旧候选/证据原样保留。后续发布与实机验收另行授权，不能据源码隔离通过宣称已在生产解决。

## NEXT：控件应用配额分类原因映射遗漏（2026-10-17，明确待修，暂不改候选）

实机阶段已区分：原Chrome17:51:45–47运行1.7.62、v3已连接、当前同孩子核验通过，原exchange current/sent/received/accepted均成功；网页本浏览器当日0/721/0完整、cutoff未提供，other未确认不阻本机；应用本机0/163/0可读且独立partial/cutoff17:50:23，other未知不阻本机。分项读取和完整性独立展示记PASS_WITH_MANUAL_EVIDENCE，不宣称所有统计或原因解释完整，不把既有交换列新故障。

Native随后通过实际Service只读统计入口取得当日本机基础KnownTotalSeconds=16131、Complete=true、基础reasonCodes=[]、hasEstimatedRecords=true，而classificationReasonCodes仅NATIVE_LEGACY_SELECTION_UNAVAILABLE。这是基础应用账与配额分类完整性不同，不是other或交换失败；控件此处0/163/0是非特殊应用配额分类桶，不是基础应用总时长，禁止两者相减推定丢账。估算记录标记独立，不能据该标记直接解释分类partial。

明确缺陷：实际加载的infra/shared-sync-diagnostics.js:59–65统计原因白名单不含NATIVE_LEGACY_SELECTION_UNAVAILABLE及SOURCE_PARTIAL，projectApplicationSources(:67–77)逐项降为UNKNOWN_REASON；admin/shared-sync-diagnostics-view.js:80–95原因中文表也没有两码。Native正式LocalApplicationStatisticsReader.cs:53–59合并基础及usage原因，并在分类不完整时追加SOURCE_PARTIAL；QuotaBucketsProtocol.cs:98–111只转桶且保留flags/reasons。因此当前真实Service状态经生产链将产生这两码并被显示为两个“原因未知”，与页面数量一致；未捕获17:51原wire，不把此推演写成当次原码实证。已保留的统计白名单码均有中文，主要信息损失位于首层白名单。

只读枚举的其余未映射候选（非当次已观测原码）：SOURCE_COVERAGE_UNKNOWN、LOCAL_IDENTITYLESS_HISTORY_CLEANED、LOCAL_IDENTITYLESS_RECORD_EXCLUDED、LOCAL_MULTIPLE_IDENTITY_RECORD_EXCLUDED、NATIVE_CLASSIFICATION_CONTEXT_MISSING、NATIVE_FACT_IDENTITY_MISSING、NATIVE_FIXED_ATTRIBUTION_UNRESOLVED、NATIVE_HISTORICAL_CLASSIFICATION_MISSING、NATIVE_LEGACY_CLASSIFICATION_CONFLICT、NATIVE_RAW_CLOCK_SCOPE_UNRESOLVED、NATIVE_SETTLED_TOPOLOGY_UNAVAILABLE、NATIVE_SPECIAL_APPLICATION_CONTEXT_MISSING。连同上述两码共14项；不能据静态清单直接扩映射或认定真实漏账。Native负责核实旧选择/分类缺依据，控件映射为明确待修，等待其具体已核码与最小修复范围再实施。当前代码、62加载目录/候选、版本、共享off、家庭与旧账均不变；不再要求用户复制页面或跨任务转述，不生成新修复候选。完整性与原因解释尚未全部验收通过。

## NOW：网页本浏览器分项补齐（2026-10-17，PO完整计划明确批准）

PO最新直接授权已核实（Native会话user 01a14935-9b15-7450-9cc7-6683ac196736）：更新Native/控件及必要云端，实际验收两端读取显示；不启共享、不改旧账，直接跨会话推进。控件唯一交付已冻结62（tree b48cca26f2e1e58d7029da0c8ef4ede15bb9d1d3c5f3e5db247e86f10a33a6fc），先核原60与候选全文件，再完整备份、严格7JS+manifest+1契约逐文件覆盖，manifest最后，保留原_metadata/key/权限/ID，不删除加载目录、不触碰Chrome存储。磁盘更新与实际重载/现场分列；Native统一协调一次重载，不由此重复索PO或绕过内部页浏览限制。本轮不更托管feed，不另改源码或扩测。

磁盘交付已完成（尚未据此宣称Chrome已重载）：原加载dist/native-host-managed-candidate/package-extension现为1.7.62，205份冻结候选文件全部逐SHA匹配，保留1份原Chrome metadata后共206文件。写入严格新增1契约、7JS、manifest最后，另197原文件保持字节不变；key/稳定ID/权限/开发marker不变。完整新备份dist/native-host-before-1.7.62-20261017的205文件逐hash与原60一致。原tree=`ca7c0a7df7fb4dfa3dd528e36e7321cdf9bf5ff7a3381ed85696e54e5487cc6e`，更新后含metadata tree=`1b0bbf5f918f0c7c8e62d10a9bfa1feb0a708c5dba22484ecfa747a18cb9ba48`；冻结stage仍`b48cca26f2e1e58d7029da0c8ef4ede15bb9d1d3c5f3e5db247e86f10a33a6fc`。证据.tmp/local-unpacked-1.7.62-update-evidence.json。没有卸载/解绑/重装、Chrome存储读取或写入、家庭配置/旧账/feed/共享变更；未代点重载。真实运行及Native63联合现场读取待Native统一协调，不绕过内部页或读取Profile/SW。只复用冻结源码精确测试证据，不新增无关测试。

正常页面一次联合取证字段（由Native统一协调，勿重复要求PO）：Popup版本/绑定正常；本地Admin运行版本、当前连接/协议、“V2当前本地连接同孩子核验”；当次交换是否当前连接、sent/received/accepted及读取时间；本浏览器网页、网页其他设备/合计、应用本机、应用其他设备/合计各自当前日桶值/完整性/读取时间与结算截止（缺失为未提供）。other可为真实none/available/unknown，未知不算本机失败；不采集token、邮箱、URL/标题或原始绑定标识。磁盘1.7.62、页面1.7.62与真实读数成功分开记录，不能用磁盘哈希代替现场。

最终源码/隔离验收完成，唯一新62候选已冻结，未安装。Plan audit Matched：local.today每日完整性与实际桶独立保留；网页其他设备只认真实新请求写入的匹配scope+同snapshotId/期间/原verifiedAt/hash/有效期，旧无scope其他数值不显示为当前孩子；权威明确清单排除本机后none，缺失/未上报unknown，已知零与partial分别可见。none同样核本次各日model与读后清单snapshotId/period一致，旧model+新空清单只降other为unknown，不重读或修改本机/原combined。scope只三项非凭据字段，token仅内存比较，原snapshot字节/hash/配额算法及交换不变。异步诊断在途换孩撤销旧来源，身份确认读取异常不阻同scope本机显示；缺cutoff显示未提供。

实际最小测试PASS：node tests/unit/profile-account-v2-sync.test.js（26项：真实生产fetch函数+原store事务、受控传输/校验夹具→展示none；分页失败/改孩/换token/初始绑定不一致/事务前换token0写入，原snapshot内容守恒）、profile-account-shadow-v2.test.js（11项含旧缓存不追贴）、source-statistics-shadow.test.js（含每日/整周、none反向独立性、同快照竞态、无scope/过期/跨期/未上报、零/partial）、shared-sync-diagnostics.test.js（脱敏、独立展示、同孩子有效/过期/断连/代次/换孩/异常）、local-guardian.test.js（实际客户端自动准备/恢复及原回归）、shared-web-contribution-sync.test.js；npm run typecheck及git diff --check通过。应用未变部分复用精确哈希1.7.61证据，不重跑Native/云端。合成网页unknown/none/zero/partial八张桌面1440/窄屏390截图已逐张目视Matched，scrollWidth等于viewport，本浏览器完整、其他分项/合计清晰且无溢出；路径.tmp/web-sources-{unknown,none,zero,partial}-{desktop,mobile}-1.7.62.png。使用实际来源投影/诊断/渲染器，最终同快照小修后重新生成四份HTML逐hash不变，复用相同截图；不是原Chrome或真实云端none验收，未访问家庭账户。旧历史栏mock Invalid Date仍不扩修。

候选dist/native-host-candidate-1.7.62-20261017/package-extension，205文件，最终treeHash=`b48cca26f2e1e58d7029da0c8ef4ede15bb9d1d3c5f3e5db247e86f10a33a6fc`；与运行60差异严格7JS+manifest，新增1.56契约；与61相比仅网页转换/诊断/view及真实读取外层元数据5JS+候选版本。详细逐文件SHA/清单在.tmp/web-sources-stage-1.7.62-evidence.json；原60 tree=`ca7c0a7df7fb4dfa3dd528e36e7321cdf9bf5ff7a3381ed85696e54e5487cc6e`、原61 tree=`7024459a60a5e2ef2a8aa1026534964eabe4cb735e65e9861d02a4e7caf48e92`及原完整备份逐hash均未变，源码manifest仍1.7.59。key/ID/权限/开发marker全部保留，无CRX/feed；stage只含源码，交付须保留Chrome生成_metadata并逐文件覆盖，不删除原加载目录。实际60/storage/绑定/家庭配置/共享off均未操作；源码未提交，由Native集中协调交付。

最终网页相关产品SHA256：core/profile-account-shadow-v2.js=`939b8d348ad7d706aebafe55fdf59211b39d258883df0ba0e1b4a81d9edf621f`，infra/cloud-sync.js=`1f7a500f625265b05f7b70a66a24ee54641da417baa6bb67c983dbc687c494f1`，infra/source-statistics-shadow.js=`0a7c83875cd38f11bc3d003b115b5f783dcf44fa76b05ef01f54c75590d7208c`，infra/shared-sync-diagnostics.js=`1bf312381b0d99acd5ab5928b0f3c16a3a3d16bcf2512a24f081b13aa95111cd`，admin/shared-sync-diagnostics-view.js=`073cd2af658cbc106b4459b6f0227c93b079b92194680167495c5a3a0cbbc3cf`。测试SHA：profile-account-v2-sync=`4a5f30d68dd633fbe0d44239641ea835aa11760652437448e7157117bbac226f`，profile-account-shadow-v2=`5d3b4f1b757eca2e75dea5a66afd5fe717d56f0b55ede380300f5fb4599919e8`，source-statistics-shadow=`93d892615935882f8a1d4b70f2dbdc20c7577ea500c7d3c7d75a9a252a5173ad`，shared-sync-diagnostics=`44514fa5a552f67460eaa8d080e807c7810a4cccb01ea41b2606540637f49ff2`，local-guardian=`ca2757a571b7828f1755c91241d42a3fbca3aa5a245d989b0b6a032f4ad32829`。此节覆盖此前61相关已变文件哈希，未变文件仍复用既有证据。

extension-local只读修复：原quota-read-model-v2已含local/otherDevices，来源转换只取usage与总完整性，确证丢失独立本浏览器解释。保留原webUsage合计wire、读取模型和执行配额不变；新增内部只读网页来源投影/缓存/诊断/行展示，不重算原账。按顺序①保留local.today三桶、既有local完整性及可读零；②其他来源状态和已知部分独立，none须当前孩子/期间可信来源清单，空缓存/缺字段/未上报不能判none；③原合计另列；④网页/应用cutoff缺失显示“未提供”，不取readAt冒充；⑤聚焦回归、三态/同孩子桌面窄屏目视，审查后唯一新62stage，冻结61不覆盖。

已发现可信none所需身份锚点缺口：旧profile_account_v2_shadow_cache.current只有verifiedAt/hash/period而无profile/child或scope；quota读模型也不暴露此身份锚点，deviceInventoryAvailable缺原字段时仍true。已报架构裁决，不改发布缓存/配额算法补猜测。先实现local独立和安全unknown降级，其他已知部分仅按现有可靠来源证据展示；未取得当前孩子范围证明前不宣称none。最小测试source-statistics-shadow/shared-sync-diagnostics及既有同孩子专项，typecheck/diff；不扩大交换/账本修复，不更管理配置、旧账或共享off，不更新运行60/安装。保留所有既有草稿及61候选证据。

架构与Native统一追加最小裁定：仅在既有syncProfileAccountV2ShadowSnapshot真实分页请求前后和原存储事务写前核对当前apiBase/deviceId/childId/deviceToken；成功验证后在现有缓存envelope（不在snapshot内）附scope:{apiBase,deviceId,childId}。token只在本次内存比较，不写副本/hash或新证明；旧缓存不追贴。原分页/hash/统计/完整性/配额算法不变。webSources消费新增scope及原verifiedAt/hash/有效期/期间、明确inventoryAvailable和expectedDevices，无其他当前/历史来源且异常列表空时才none；未上报/旧无scope/改孩/过期unknown，不泄旧孩子other数值。新增最小测试profile-account-v2-sync及profile-account-shadow-v2覆盖真实入口新请求、分页失败、在途改孩/换token、事务前改绑、旧缓存不追贴与snapshot字节/hash不变。此为已批准计划内的只读归属元数据，不扩公开契约或修改账。

## NOW：本机应用与其他设备独立显示（2026-10-17，PO明确批准，契约统筹中）

最终集中交付准备完成（未安装）：reason白名单已统一为原统计原因sanitize，两处共用，不增码；专项验证已知LOCAL_STATISTICS_MISSING/APPLICATION_OTHER_MISSING/QUOTA_BUCKETS_PARTIAL保留，未知PRIVATE_PATH脱敏。shared-sync-diagnostics复验、typecheck及diff通过。最终diag源码SHA256=`a61aca8edc5c19c0b867e4590af7e69916c78eb271df15e8cf030a4f5e3673dd`，其测试=`4a98ed48f518f4ed6c7660ac59b4e1df966e7cdbab7bd4c0b74868eb19651075`，覆盖此前哈希。

复用现有Admin样式/真实渲染器，在独立agent-browser无登录会话检查none/unknown/available零三态；1440px桌面、390px窄屏目视Matched，已确认同孩子、本机7/163/0完整与独立截止、other三态及合计各自完整性可辨，无横向溢出（scrollWidth=viewport）。6图：.tmp/sources-{none,unknown,available}-{desktop,mobile}-20261017.png；对应临时html保留，均明确合成数据，不访问Chrome内部页、真实账户或Native。无其他设备/已知零场景夹具合计完整，未知场景合计partial；下方旧贡献缺值产生Invalid Date属既有/夹具问题，架构明确不扩修。此证据不是原Chrome现场。

唯一新候选目录：dist/native-host-candidate-1.7.61-20261017/package-extension（205文件），treeHash=`7024459a60a5e2ef2a8aa1026534964eabe4cb735e65e9861d02a4e7caf48e92`。原加载60保持205文件、treeHash=`ca7c0a7df7fb4dfa3dd528e36e7321cdf9bf5ff7a3381ed85696e54e5487cc6e`，完整备份dist/native-host-before-1.7.61-20261017逐项hash一致；证据.tmp/sources-stage-1.7.61-evidence.json。严格差异仅5JS（admin/shared-sync-diagnostics-view、infra/native-host-client/shared-sync-diagnostics/shared-web-contribution-sync/source-statistics-shadow）+manifest版本/name；新增core/shared-contracts/1.56.0/source-statistics.js。构建首次审计发现18个无关文件仅CRLF差异，逐项证实后仅在stage恢复原加载字节，严格差异复验通过，不放宽门槛。key/稳定ID/权限及其余manifest字段、开发marker不变；源码manifest不改，未生成CRX/feed。stage排除Chrome生成_metadata，实际提升时必须保留原metadata，不能删除式替换整个加载目录。源码未提交，原Chrome未重载/更新、storage/绑定/家庭配置及共享off均未操作；已报架构和Native统一交付。

架构追加审查：来源附项误用读取错误白名单，部分已知逐日统计原因被降为UNKNOWN_REASON。修复仅提取原统计原因白名单供两处共用，不增加码、不改业务；补已知保留/未知脱敏断言。随后复用既有管理页样式/渲染器完成合成数据桌面和390px目视，不访问内部扩展页或家庭数据。通过后可逆构建唯一1.7.61独立stage供集中交付，不覆盖现60、不更源码manifest或feed，真实安装/重载由Native统一协调。

终端源码已接通，未交付运行包。四项最小回归通过：local-guardian（含实际Dispatcher→Host生成的合成wire回放，有cap接收sources/无cap忽略）、source-statistics-shadow、shared-sync-diagnostics（含渲染断言）、shared-web-contribution-sync；typecheck及diff检查通过。覆盖本机完整+other未知+combined partial独立显示、none与已知零区分、local缺失不造零、partial other不污染local、错孩子/范围、过期、云端all不继承Native来源解释、旧cap兼容及同孩子当前/过期/连接变化。追加渲染用例时碰到既有独立函数装载夹具缺导入，诊断能力白名单沿既有字面量风格修正后复验通过；未改协议或放宽校验。Plan audit Matched：原combined消费/账本/配额逻辑无变，新增附项仅解释来源；无额外云请求、制包、manifest/运行目录修改或共享启用。未做原Chrome新界面验收，不宣称已安装；Native统一交付，其他设备实际有无仍UNKNOWN。

此轮固定源码/测试SHA256：infra/native-host-client.js=`fa71980209dc6ce7c0b90df8cc9fb164e3621522f7ebaa5770b98e3322f08122`；infra/source-statistics-shadow.js=`1c53a715b08bc0838165a2ed24669ce4a7d41fb7ef70e5639358c889b6fce7af`；infra/shared-sync-diagnostics.js=`1c1a97facdbbe8291ec65573135317fe3ff41c9c22f3486c77e915adee9b93e4`；admin/shared-sync-diagnostics-view.js=`14a6090decfd7b54dbdb8d972b770d7a7bb3e073a9e0b36930f48bd9efe8d959`；core/shared-contracts/1.56.0/source-statistics.js=`cefe4e4a3a517523956116f6738ea9600613bfe1f21ff1a657a75575f79e5dc7`（包来源提交4bb107d635112e43308f92f697f0a25ccddae970）；tests/unit/local-guardian.test.js=`2c2253436fa5851e4c973670c573e9f82ec16f7faf93be2c027b9c02943379f3`；tests/unit/source-statistics-shadow.test.js=`23b33c2a8d6db9cd5c0adb682158666307ac4ba8c229e68f91c9172c08b894b1`；tests/unit/shared-sync-diagnostics.test.js=`6e74807f446d9f9883398b1fb78043de9ce2f5f46f1de79a6433b98f1ae379d3`。路径均相对固定源码树（infra/admin/core位于extension内）。之前同孩子显示证据为先前通过版本，后续集中交付以此轮哈希为准；shared-web-contribution-sync及其测试哈希仍保持下节记录不变。

执行线extension-local；只允许终端读取适配、只读显示及直接专项。已直接核实Native会话PO要求：本机统计独立正常显示，其他设备明确没有时显示“无其他设备”，未知不阻塞或污染本机完整性，同孩子显示一并验收，共享保持关闭。最小实施清单：①核对现有字段及交架构固定最小表示；②适配经过范围/周期校验的本机与其他设备分离结果；③现有管理页分别显示本机完整性和其他设备状态，不把combined partial称本机partial；④覆盖明确无设备、已知零、有量、未知、本机异常、旧端无拆分和上下文变化。字段尚未固定前不自行改共享契约，不从合计减算或原因码猜本机值。

字段核对结果：1.55.0桶快照仅有combined bucketsSeconds/complete/cutoff/reasons，无local/other范围；source-statistics-shadow的Native及cloud-all回退均是合计，不能改标本机。已向架构提交最小需求：保留旧字段兼容，新增可信本机范围及other明确无/有/未知的独立表示，各自完整性与截止。旧端无拆分应明确显示无法区分本机，不伪造零或完整。验收先最小适配/显示专项、typecheck/diff；真实页面及联合验收由Native统一协调，不自行索PO重载。此包不改账本/历史/上传/配额执行/共享开关，不更新运行目录、manifest或发布；既有未提交修复原样保留。

架构已冻结1.56.0契约包SHA256=`a13f7ee1ef3ae6dd53a052efdbb2faf49f079595ace3de95065a12c1a98765f2`。原exchangeQuotaBuckets/组合applicationUsage严格不变，新增cap quota-buckets-sources-v1与同回包applicationSources:{local,other,otherState}；快照沿用schema2同孩子同范围，none/unknown要求other=null，available要求other快照。按固定validateQuotaBucketsSources导出验证，不自行新增协议。仅透传及缓存当前Native已校验附项，诊断分别输出本机/其他/合计；附项非法或缺失降级来源解释，不拒绝原合法combined，不将其与local重复相加。旧cap/旧回包继续明确合计无法拆分；缓存与回退不混代。

## NOW：当前同孩子核验只读显示修复（2026-10-17，PO明确批准，暂不交付）

架构独立diff审查Matched，补丁仍未提交，等待集中交付；当前运行1.7.60仍为旧显示，不要求PO再次重载。此次通过证据对应SHA256（固定树相对路径）：extension/infra/shared-web-contribution-sync.js=`6b009c4a10dabe269b54701888820cf6f406b8da4ad5e79bb4c5acaf7e841091`；extension/infra/shared-sync-diagnostics.js=`8b0284f0fe23dac938af18dbd9ee6098edb27220389561862c89dfa0f375f5e3`；tests/unit/shared-web-contribution-sync.test.js=`fa520cc42863569ddeb76728a31abc7cbb7f95f26f5b3b9b47fda6c3316034ba`；tests/unit/shared-sync-diagnostics.test.js=`04a2f82f4b3fd5e792ba3ed136baf5bb77d43125ef3f8035a9ce0e1516c7efa5`。加载候选中infra/shared-sync-diagnostics.js仍为`befe6187bac5624c925b644043b4ff3ec58c854e32086fe940c04db3bb545bba`。仅登记证据，不改运行包或扩展原因映射；other事实因认证受阻仍UNKNOWN。

源码与最小回归已完成，等待架构审查后单列交付。shared-web-contribution-sync、shared-sync-diagnostics两项专项及npm run typecheck、git diff --check均通过；覆盖当前有效确认、过期/Port与代次变化、断连/身份变化/异常未知，以及现有渲染器显示“已确认”和敏感字段不外露。方案一致性审查Matched：只读确认与显示投影；无新增Native请求、无准备或执行副作用、无布局/协议/账本变更。未做真实浏览器显示验收，不宣称运行包已修复；当前加载1.7.60未更新，manifest与共享关闭状态不变。云端其他设备存在/有量仍UNKNOWN，不能据此宣布缺other故障；没有当次原码，不扩大UNKNOWN_REASON映射。

已直接核实Native本聊天PO授权修显示并调查跨设备完整性，随后强调先核其他设备是否确有用量；云端/Native分别核来源事实，控件不把缺other缓存等同有量丢失。此包仅本地只读确认和显示投影：当前confirmedIdentityBinding与实际scope/Port/generation/reusablecap/期限一致才可已确认，过期、断连、改绑或异常立即未知，不用旧ACK/accepted/origin冒充当前身份。独立确认读取输出仅布尔、代次和期限，不输出敏感身份或proof，不改变原热读/准备/执行接口。

注意两scopeHash命名空间不同（shared-web-v1与shared-policy-v1），只读确认在内部按当前原始上下文匹配，不能直接比较两hash。诊断在异步读前后复核上下文及Native代次；不改变布局，仅将hardcoded-null换成可信实时布尔。最小测试shared-web-contribution-sync、shared-sync-diagnostics及typecheck/diff，覆盖有效/过期/断连/重连/改孩/异常、缓存假阳性和脱敏。原因未知仅调查真实原码，尚无证据不扩白名单。保留其他未提交修复；不修改账本/历史/配置/Native/共享、不制包/版本/加载目录或发布。

## 1.7.60与Native62真实本机交换验收（2026-10-17，限定范围通过）

三方一致收口：Native已将最终结论及脱敏现场证据存入其既有windows-candidate-2.6.62目录的安装与现场验收.md、chrome-1.7.60-live-evidence-safe.json、current-conclusion-safe.json。双方独立核验一致：16:46:14本次同孩子安全校验及exchange为PASS_WITH_MANUAL_EVIDENCE；诊断hardcoded-null仅列后续展示项，other缺源/截止未知/统计完整性另项待验，不再将本机exchange判为失败。Native62、控件60、共享关闭、原账未改；不追加用户操作、源码修订、制包或重载。

Native会话收到PO原Chrome正常页并转脱敏字段：运行1.7.60/v3在线，16:46:14交换对应当前连接、sent/responseReceived/accepted均true、读取成功，应用origin=native且当天Composite已知163秒；网页Composite593秒。记PASS_WITH_MANUAL_EVIDENCE，仅本次真实双向交换/响应校验及其严格身份门槛，不外推全设备统计或共享执行完整。

只读核代码：shared-sync-diagnostics.js将nativePeerSameChild固定null，故‘当前连接同孩子未知’是诊断占位，不能当身份不一致；JS要求有效当前binding/Port/generation及快照child匹配，Service ExchangeQuotaBucketsAsync要求当前connection/user捕获proof且IsCurrent/RemoteProofCurrent有效，绑定验证可信签名/assignment/childScope/期限。因此本次accepted/current与这些严格门槛共同支持本次身份校验通过，不能仅由缓存来源推断身份永远有效。

应用partial/cutoff未知仍保留：QuotaBucketsReader组合缺other缓存加APPLICATION_OTHER_MISSING，任一来源不完整加QUOTA_BUCKETS_PARTIAL；只有两侧cutoff均存在才取min，否则null。163秒仅当前已知贡献，不宣称全设备完整；诊断‘原因未知’可能为白名单外原码映射，没原码不猜。旧贡献功能关闭和旧getApplicationUsageSeconds负响应与新exchange结果分列。本轮仅核验和登记，无产品修改/重测/用户操作，共享继续关闭；诊断占位及缺other/完整性仍为后续项，V2对账P0独立不关闭。结论已发Architect和Native，由Native统一答PO。

## NOW：本机1.7.60唯一候选交付（2026-10-17，精确版本已获PO批准）

磁盘交付完成，待统一现场重载：205文件完整备份dist/native-host-candidate-before-1.7.60-1792226625692逐hash通过；原目录仅3JS和manifest4项变化，manifest最后，其余201字节不变。beforeTreeHash 09a350c6b2bfeb00101ecc8faa1e7467b006331477c49a9ced8646eca7ae0b3a，afterTreeHash ca7c0a7df7fb4dfa3dd528e36e7321cdf9bf5ff7a3381ed85696e54e5487cc6e（排序path+NUL+hash+LF）。基线f62f8d4540fb4f354c544b0304cfe0ad57963443，已验未提交产品补丁hash ffce69adb517e23e39a918e6ef58d4c2131cd953f53647dc981c706aaa4c484e，三文件源码hash沿用冻结值，不虚构新提交SHA。完整ignored证据.tmp/local-unpacked-1.7.60-update-evidence.json已发Architect及Native，含前后全文件hash和备份；原key/ID/权限/部署/metadata、绑定/storage/配置未改。未重载，正式feed59/Native62/共享关闭不变。由Native会话统一协调一次重载与实际同孩子exchange结果；生产故障未关闭。

直接read_thread核实Native本聊天userMessage 01a14907-0c8f-7842-8c83-1f9f3118eed9明确允许本机更新1.7.60并继续同孩子/exchange验收，共享关闭；补足上轮工具审核所缺权限。由固定extension-local唯一执行者生成新隔离unpacked，复用已冻结3产品及最终专项证据，不改源码；严格核对仅background.js、infra/native-host-client.js、infra/shared-web-contribution-sync.js和manifest四项实质差异。完整备份旧205文件并逐hash后复制三JS，manifest最后；其余字节、key/ID/权限/deployment/metadata保持，不触Chrome存储/配置/绑定，不卸载或重装。不正式托管/业务部署或改Native62。交付源码基线和未提交补丁hash如实区分；树hash/备份及证据给Architect，最终重载只由Native协调，不重复问PO。

## NOW：Host62后发送前绑定门槛调查（2026-10-17，只读及最小复现）

交付边界更新：Architect确认下一版本更新指令被工具权限审核拒绝，当前明确授权仅原1.7.59，不能据一般协作授权更新下一版。源码/专项/类型/差异均已冻结完成，但本轮停止制包、版本/manifest变更、原加载目录写入及重载；没有绕过被拒指令。当前加载目录仍1.7.59旧源码（不含本次3处新修复），Native62不变。后续交付需PO明确版本更新授权，实际家庭exchange仍未通过；之前建议60仅建议，不是已授权或已生成。

最终必要复验PASS：本聊天PO明确批准原样继续，Native本聊天另明确本轮同范围必要复验不再逐次询问；原local-guardian完整命令通过，旧300ms断言不变。normal及busy两个隔离实例均通过真实init自动prepare→scope/bind→纯Reader→SourceShadow自动Native接受，无需等待alarm；旧busy cloud结果晚到不能覆盖新Native，重连后自动读新代际通过，同scope缓存ensure不重复ready。shared-web-contribution-sync安全专项、typecheck、diff均PASS，前序失败保留。测试hash分别3975dd34859f9eeddbf578d43f27b0dafa7d05d74e9ffac64b6f16f63dd2fc7a及b0f4425c5a5a6ae52aad1e980f8c075ab65c5a5f0aef8cabe5b615ee90021996。

审计Matched：产品只改native-client一行能力门槛、shared-web-contribution-sync新确认后的内部callback、background持有已有实例并invalidate/force refresh；SourceShadow生产、协议/签名/期限、原账/统计/上传/配额/执行不变。真实家庭同孩子exchange尚待一次交付后验证，不因隔离PASS关闭生产故障。结果及3产品hash已回Architect，等待集中确认源码固定和唯一候选更新，不自行推送/托管或要求重载。

就绪callback安全专项最终PASS：新确认仅通知一次、cached ensure不重复、改孩失败无通知、旧generation迟到cloud proof不得bind/通知/干扰新读，随后当前连接重新prepare才通知。修正旧改孩夹具误用不可见proof函数造成的假负例，改真实签发夹具后仍正确拒绝；未改变产品校验。typecheck/diff通过。完整local-guardian接线首轮正常自动恢复PASS、忙场景因data模块复用singleton的夹具错误超时；修正为独立模块URL后第二轮尚未进入新例，在旧dual-probe300ms等待失败。同命令暂停，Native会话集中索必要复验批准，不代跑或改时限；忙旧cloud晚返保护未实际通过前保持待验。

候选只读比对：加载目录1.7.59与当前源码仅background.js、infra/native-host-client.js、infra/shared-web-contribution-sync.js三项产品实质差异，D-115及V2上传A/B均已在原包，无新混入。源码hash分别1215b83bc9caa49495fbb362fae884662115b23e76757af02984594412217c66、4c701a21d0e6509a48b7c1c0f22f99146f334161be1ca2a8021299e600fb50d8、3d5427dfd70c4ead2095a55cf90542a8c1e279039d5f42fe9e638364430407e6。建议验收后仅生成唯一1.7.60 unpacked，不改正式1.7.59 feed；当前没有制包或更新加载目录。架构已收到精确范围，Native62保持。

架构已确认实施准备就绪最小callback：create/initSharedWebContributionSync接受内部onIdentityReady，新confirmedIdentityBinding经current复核写入后才通知，cached ready不通知。background保存已有SourceShadow实例，回调只调用原invalidate()+refresh({force:true})；busy旧读通过原generation/abort失效，避免迟到cloud覆盖native。不新增observer系统/消息/协议/持久标记/队列/重试/时钟，不修改热读或原账。原专项验证首读fallback后无需alarm自动Native、busy旧cloud迟到不覆盖、重连自动恢复及缓存ensure不重复通知；不改包或索用户重载。

PO在Native会话最新真实原话已由read_thread直接核验：继续与架构控件查清修好绑定准备/冷启动/重连恢复并验实际同孩子exchange，共享关闭，不跨任务重复转述。按新授权原样第三轮专项PASS；保留第1轮有意red、第2轮既有dual-probe300ms等待失败事实，不改该旧断言。无明细cap但reusable可用时真实scope/bind均发送通过；唯一产品补丁一行删除通过行为验证及typecheck。

实际initSharedWebContributionSync+createReusableSharedWebBinding+Native客户端/observer/队列，配合实际initSourceStatisticsShadow完成受控延迟签发复现：首读在签发未完成时纯Reader失败→cloud备用且sent=false，不等待云签发；签发完成并通过真实scope/bind后原注册Reader已ready，但exchange仍0且报告accepted=false，未调度新读。推进仅SourceShadow夹具时钟300001ms后触发原5分钟alarm，实际exchange自动accepted=true；证明可自然恢复，不是永久故障。冷协商、Port重连后重新prepare及bucket均PASS；LKG仅receivedAt变化确会invalidate+额外1次bind，随后可恢复，暂不扩修。新增SourceShadow夹具首次因未推进钟直接触发alarm被正常节流而失败，修正夹具后原专项PASS，未改产品时限。Native更正其对V1可暴露reusable的误读，固定62实际仅V3暴露，当前夹具正确。

待架构确定最小就绪通知接线：身份准备完成后通知既有SourceShadow取数，bucket热读保持纯Reader；需涵盖Shadow正busy时通知不能丢，不引入无界重试或独立队列。该接线尚未改产品，不能宣称现场已修复。产品/测试不提交、不制包、不更新加载目录或Native，不索新用户操作。

自动生命周期补查只扩原local-guardian入口：装载真实initSharedWebContributionSync/createReusableSharedWebBinding/native-client observer及队列，仅设备上下文、云端签发和Native传输响应为合成夹具；不手工注入已确认Reader。覆盖冷协商后自动scope/bind、原注册Reader就绪后bucket、重连后新绑定，以及相同策略仅receivedAt变化导致的失效/再准备次数。当前原专项第二次在旧dual-probe等待失败，第三次执行已请求PO批准；此前修复不以typecheck代替行为通过。

门槛缺陷已复现并经架构确认最小修复：原专项在V3有quota-buckets/reusable但无明细cap时，真实requestApplicationIdentityBindingNative scope返回ok=false，1472断言失败。仅删除performSend(applicationIdentityBinding)内不相干的applicationIdentityUsageSupported条件；保留方法白名单、Port/V3/reusable及receipt/期限/当前身份校验，不改变bucket热读纯Reader。先跑原专项/typecheck/diff，再调查自动prepare与读取时序；此逻辑缺陷不冒充现场唯一根因，不更新包或要求重载。

Native转PO真实1.7.59状态：16:18:17/current连接，sent/received/accepted均false，application_identity_usage_binding_unavailable；应用为cloud备用。不同于此前Host字段损坏，不认定为Host修复回归。background独立Ensurer/Reader已注册，startup/install/heartbeat/身份及cap通知存在准备触发；单个通用错误尚不能证明生命周期永不恢复。

根与控件独立定位待复现的内外门槛不一致：requestApplicationIdentityBindingNative外层只需reusable-v2，performSend applicationIdentityBinding内层仍额外要求applicationIdentityUsageSupported（应用明细能力）。先在原local-guardian专项中用真实生产client/队列/Port构造V3只含quota-buckets与reusable、无应用明细cap，实际请求scope/bind，取得现码失败；不以identityNative stub绕开内层。该复现不等于现场cap全文已取得或唯一根因。暂不改产品/共享安全/Host/原账/加载包；确证后向架构回具体最小修复建议，重连触发另核。

## NOW：Native真实响应中转校验失败（2026-10-17，P0，只读取证）

完整Host联合验收PASS（2026-10-17，源码隔离，不等于已安装现场通过）：原local-guardian跨进程入口追加--actual-host true，正式客户端→实际Host RunAsync→随机临时pipe→Dispatcher/Service JSON→Host Clone→原生帧；新增requireActualHost强断言全部已观测响应actualHost=true。冷启及fullScenario首轮exit0/1.9138秒：应用600→100→100、合并网页600得到1200→700→700，generation1→3，旧context/错child/JS过期不发送，Native过期返回QUOTA_BUCKETS_CONTEXT_CHANGED；JS cloudReads=0、Native每进程cloudCalls=1且云端仍pending。暖缓存变体首轮exit0/1.0147秒：本机600+缓存other200=应用800，正式合并网页600=1400，cloudReads=0/Native calls3/pendingtrue。Architect并行也跑了暖缓存，收到不重复通知时本会话已完成；不再追加运行。

仅修改既有tests/unit/local-guardian.test.js两处Host边界断言及准确标签，测试SHA256 3be598221d39f44bbbd1ea58c30f4c982d9cd7c5184d8b73f0a7a0dd0ea0e02e；typecheck/diff通过，产品/validator/契约/205文件加载包均未修改。不提交、制包或安装。旧隔离测试漏Host的结论边界已纠正；实际安装修复及原Chrome同孩子交换仍需架构统一交付验收，当前故障不得记为生产已解决。

联合验收入口就绪：Native提供同一Producer的--actual-host true模式，实际Host RunAsync→随机测试pipe→正式Dispatcher→Service JSON→Host Clone→原生帧；不连接生产pipe。复用local-guardian原跨进程专项的冷启动、600→100→100、重连及身份拒绝场景，仅加requireActualHost断言，强制每份实际响应诊断actualHost=true，避免再次绕过该边界；不改产品。随后通过TOC_NATIVE_PROCESS_CONFIG运行这一个既有专项，复用直接Host/静态validator证据，不重复静态夹具或全量、不更新加载包。

真实Host DTO往返隔离复现已证实（不是家庭原始响应捕获）：Native提供host-roundtrip-validation.json，syntheticOnly=true、requestIdRetained=true；Service新schema2快照被正式1.55校验接受，Host typedDeserialize再Serialize后被SOURCE_STATISTICS_INVALID拒绝。顶层schemaVersion/durationUnit/source/childId/readAtMs丢失，原composite=45秒桶消失变旧totalMs=0，day.settledThroughMs显式null亦丢失。已直接读取该脱敏摘要核对。该生产代码缺陷解释现场错误形态，不伪称已捕获家庭wire全文。修复归Native Host，控件严格校验保持；后续联合验证必须补实际Host临时管道/中转/帧，不能仅Dispatcher直出。当前不更新加载包、不安装、不启共享。

PO在Native会话提供当前1.7.58正常页：真实v3连接、同身份周期/当前连接，15:41:56本机交换sent=true、responseReceived=true、accepted=false、source_statistics_native_invalid_response；应用来源为云端备用，不是Native成功，同孩子状态未知不能直接推断不匹配。Native2.6.61安装/保留/心跳证据仍有效，共享保持关闭，不再索页面、重载或UAC。本故障与已接受的V2统计摘要对账P0分别处理。

只读分支核对：相关requestId缺失在responseReceived赋值之前拒绝；receivedAt错误为native_invalid_response，代次错误为context_changed，Native业务拒绝通常为明确服务码或unavailable。本次码优先对应applicationUsage缺失或1.55严格快照校验失败。Native发现实际Host ForwardAsync把服务端JSON反序列化为旧BrowserBridgeResponse.ApplicationUsageSnapshot再输出，新schema2配额桶可能被旧同名DTO消费并丢字段；旧跨进程Harness未经过该Host步骤。QuotaBucketsProtocol.Wire已显式保留null，不能先归因于Service省略null。

正式JS只读对照exit0：既有Dispatcher schema2冻结fixture被接受，按旧DTO形状构造的合成响应被SOURCE_STATISTICS_INVALID拒绝；该命令不冒充真实Host复现。等待Native实际Host中转产物后，复用tests/unit/local-guardian.test.js现有TOC_NATIVE_PROCESS_CONFIG入口串正式客户端、Host/IPC/原生帧；不手造修后响应、不放宽validator、不新增协议、重试、配额或账本，不更新当前包。真实Host差异未固定前不改产品或扩展测试。架构统一协调，Native拥有修复；当前仅调查及证据登记。

## NOW：本机unpacked同步1.7.59（2026-10-17，PO明确批准）

磁盘更新完成：从发布master隔离生成204文件候选；与现有包比对仅manifest版本及version_name实质不同，4处仅换行差异未复制。旧包含metadata完整205文件备份dist/native-host-candidate-before-1.7.59-1792222623685逐hash通过，仅最后更新manifest，其余204文件字节不变。公开key/稳定ID/权限/deployment均不变，未触Chrome存储/绑定；新manifest SHA256 042cb99946b1e11753837216ece2fdbd46d229cbbea742df5e7190c73929f379。ignored证据.tmp/local-unpacked-1.7.59-update-evidence.json。实际运行版本仍待原扩展一次重新加载，不以磁盘更新冒称重载完成；无卸载或重装。本次只沿用已批准修复，不新增产品变化。

从已发布master dd68a962ec731ac8213fc1210c438a58c60deb00的隔离源码生成1.7.59开发候选，沿用当前公开key、native-host-development及原开发权限。先逐项核对与当前已加载1.7.58的差异，再完整备份并hash校验后按差异更新，manifest最后写入。保留metadata及绑定、Chrome存储、家庭配置，不卸载/重装/解绑，不用managed标记覆盖开发包。复用未变产品专项、打包边界及签名发布证据；本次仅验候选版本、身份、功能树与更新前后hash。浏览器安全策略不允许操作内部扩展页时，不绕过，需要PO仅点击原扩展重载；磁盘更新与实际重载分别记录。

## 2026-10-17 网页分项补齐（交换保持已通过）

最终控件62候选已冻结，根独立核全205文件无哈希失败，tree=`b48cca26f2e1e58d7029da0c8ef4ede15bb9d1d3c5f3e5db247e86f10a33a6fc`；只7产品JS＋manifest及新增固定1.56契约，权限／key不变，原60与完整备份均未变。根独立目视网页unknown窄屏／none桌面Matched；同次model／清单snapshot不一致只降说明unknown，不影响本机或旧合计。Native63、控件62、Runtime既有制品分别源码／隔离／制品通过，安装／加载／生产部署及现场分端完整性仍未验；统一交Native协调，根不再索重测或用户操作，共享关闭。

控件真实读取函数及原store事务的隔离链已通过26项：新读取一次写入非凭据scope，原snapshot内容／hash守恒；分页失败、换孩、换token、初始不一致和事务写前变化均无新写入，旧缓存不追贴。原profile shadow专项11项及SourceShadow／诊断／Native client／typecheck通过；根已独立审实际入口及scope／期限／清单分态。最终62目视与候选仍由所属任务收口，运行60尚未更新，实机新范围／完整性未验。

PO批准两端分别收口：Native应用修复复用ed5ab95／唯一63候选／干净归档36项通过，不重测未变源码；云端沿用6c0a613／固定dry-run。控件补现有网页readModel到内部缓存展示的分项，日完整性不用周值，截止未知明确“未提供”，同孩子显示与应用分项保留，最终仅生成一个62候选。网页新请求在分页前后及缓存写前核绑定一致，给原cache envelope附非凭据scope，生产none据此及原已验证清单／期间判断；旧缓存不追贴、失配unknown，本机正常保留。不改原snapshot／原账／上传确认／请求或频率、不新增云端字段与证明系统。源码／隔离／安装／现场分列，不把已通过交换重列故障。

## 2026-10-17 本机独立及other状态修复（PO批准，实施中）

- 追加已证接线缺陷：Native原后台刷新位于`NewModelEnabled`条件内，该值实际取`forcedUse.enabled`，读取缓存错误依赖提醒开关。Native所属已将原刷新移至既有30秒后台循环的已鉴权binding范围，未增定时器或改执行开关；36项聚焦回归含无V2能力／影子且提醒关闭的真实Service入口均通过，正式1.56 JS与实际Host合成wire兼容通过。此为源码／隔离证据，不证明现场other一定有量。根已审最小diff Matched，唯一Native63／控件61候选准备，不安装／覆盖现运行62／60。
- 联合职责限定architecture-integration＋standard-cloud；公共`package-lock.json`与backend锁仅同步本地契约版本1.55.0→1.56.0，依赖解析和完整性不改、不安装；`docs/DESIGN.md`为本批接口设计的精确职责例外。职责检查与Runtime边界检查沿用原工具，不修改规则。
- 契约1.56.0已本地固定4bb107d635112e43308f92f697f0a25ccddae970，唯一内部包SHA256 a13f7ee1ef3ae6dd53a052efdbb2faf49f079595ace3de95065a12c1a98765f2；build／source-statistics／contract-compatibility均通过。两端所属会话按同一包接线，不改变已验combined。标准云端3路径最小实现原schema2机器端点响应头及权威空来源判断，typecheck／13项Worker专项／dry-run已通过，尚未部署；本机与完整性解释的实际联调仍待集中候选及运行授权，不混称完成。
- 先固化兼容附项：保留既有exchange／合计，通过quota-buckets-sources-v1附local／other快照及none／available／unknown；不另建请求、统计或队列。Native一次读取保留本机、other及合计，控件独立显示且不反拆合计；同孩子纯读显示修复一并验收。
- 云端仅复用既有应用持久统计与机器scopeother端点，权威确认空来源才能none；原JSON保持，用响应头附来源状态。真实other设备是否存在仍待登录恢复只读核实，不以当前缺缓存替代事实。源码／隔离／发布安装／现场分别登记，当前不部署、不安装、不启共享。

## 2026-10-17 Windows 本地配额桶交换：现场通过

- 后续事实核查状态：PO要求先确认其他设备到底有无应用用量。当前仅本机桶0／163／0秒有现场证据；其他设备是否存在及有量均未核实，不能以缺other缓存推定有量或零。既有内置控制台登录失效，Wrangler身份检查报告认证过期；未索凭据、未换Chrome profile、未改鉴权，悬挂检查已停止。同孩子诊断固定null的只读显示修复已由控件完成2专项／typecheck／diff，根审Matched；尚未更新运行包或实际显示验收。
- 现有云端语义核查：schema2排除自身后无可读已发布统计时返回0桶、partial及不可用原因，不区分“确无其他来源”与“有来源但未上报”；有完整零快照才明确完整零。Native `APPLICATION_OTHER_MISSING` 表示other缓存整体不存在，不等于云端返回空统计。没有真实来源事实前不补零、不扩大修复或部署。
- `PASS_WITH_MANUAL_EVIDENCE`：Native 2.6.62／控件 1.7.60，PO 正常页面确认 16:46:14 该次请求属于当前连接，已发送、收到并接受，应用来源为本地组件。结合实际 Service 当前签名证明、孩子范围及连接检查，确认该次同孩子交换通过；不外推连接永久有效或共享执行通过。
- 根独立核对加载目录和备份各205文件，哈希全部匹配；仅3个已测JS和manifest改变，其他201文件不变。原账、配置、配对和共享开关未改；共享保持关闭。
- “同孩子未知”来自诊断 `nativePeerSameChild: null` 固定值，登记为诊断完善项，不再据此否定已通过的交换。应用其他设备缓存缺失使结果partial、组合截止未知，属于来源完整性待验；已知桶仍保留，不冒充完整全设备用量。
- 后续仅分开核对其他设备后台缓存、云端备用和独立核算；本地连接不重复安装／重载，历史、Mac和提醒不混入。Native现有候选目录的 `安装与现场验收.md`、`chrome-1.7.60-live-evidence-safe.json`、`current-conclusion-safe.json` 保存脱敏现场证据，未加入Git；源码、隔离测试、目录更新、实机结果分别记录。
## COMPLETED：1.7.59前向止血托管（2026-10-17）

PR287已合入master dd68a962ec731ac8213fc1210c438a58c60deb00；源码提交1cc3ee0、主线集成043acdd，CI39013953448职责与汇总门通过，前两次PR声明失败保留。合并后扩展子树与已验源码完全一致；typecheck在重建主线已有1.55契约生成声明后通过，extension-root及managed打包隐私边界专项通过。Plan Conformance Matched；未变产品代码复用直接专项、隔离HTTP及九场景unpacked证据。

正式managed 1.7.59，稳定ID jdcancbiocacabbjdkngadmjpjmkdnih，CRX3签名独立验真；695021字节，SHA256 d4efe153ef55d003ee5e532317b8320618832bd3c01d4c5096ccc6113916d7cb。仅部署timeonchrome-update，deployment aba04c5b；稳定域名及https://aba04c5b.timeonchrome-update.pages.dev的update.xml、SHA256SUMS、CRX全部匹配，旧1.7.49包hash回读一致，23个历史CRX逐字节保留。正式包无debugger或开发标记；当前加载的1.7.58开发包、浏览器存储、绑定及家庭配置未改。不部署业务Worker/控制台/Native，不执行migration，不改历史账。

结论APPROVED_WITH_KNOWN_P0_RISK / FORWARD MITIGATION RELEASE。V2统计摘要mismatch继续为P0未解决，后续只读取证定位；不以本次发布认定对账通过。托管完成不代表所有终端已更新；本机unpacked不依托管feed自动升级。三份旧文档草稿在合并后恢复，Git stash副本继续保留，不删除。

## NOW：1.7.59止血发布与托管（2026-10-17，PO接受已知对账P0）

PO明确批准将当前已验收的D-115故障放行、提醒确认/超时恢复和V2上传A/B发布并托管。覆盖下方这些任务此前“不发布”的阶段边界，不扩大到云端业务部署、Native安装、历史修订或家庭配置。发布结论为APPROVED_WITH_KNOWN_P0_RISK / FORWARD MITIGATION RELEASE；统计摘要mismatch仍为P0未解决，不因raw hash一致、秒数差0或上传推进而关闭。

原则：内部异常、记账/授权保存/同步故障不能造成错误阻止；宁愿暂时漏放。可独立可靠判定的黑名单、停用时间和强制时间窗继续执行，故障放行不等于取消正常限制。具体实现仅发布已验修复，不借此更改账本、ACK、水位或历史。

发布清单：核对固定分支及既有候选差异；更新正式manifest为1.7.59；复用精确未变代码的专项/真实浏览器证据并运行类型/根目录/差异检查；按职责审计提交推送及PR集成；原签名密钥生成managed CRX并核对稳定ID、无debugger/开发标记；保留旧托管包，仅部署timeonchrome-update；回读稳定域名与部署域名的feed、CRX和SHA256。当前加载的1.7.58开发候选及绑定/存储不操作，终端升级另行观察。旧三份文档草稿仍保留，不混入提交。

## NOW：V2上传缺陷包A/B（2026-10-17，PO按D-076逐项批准，不发布）

本机重载后真实云端核对（2026-10-17，北京时间，上传恢复但对账P0未解决）：PO确认已重载、绑定正常、立即同步无报错。只读D1元数据确认当时唯一上报1.7.58设备的今日revision7→8→9，rev8在15:11:57接收/15:11:59提交，rev9在15:12:27接收/15:12:28提交/15:12:29发布，查询时latest_received=latest_published=9，今日staging数0。已据此证明实际接收/发布推进，不只依据同步文案；不能推出本地pending全部为0或历史全部上传。

P0：本机V2统计对账摘要不一致。rev9在15:12:39对账mismatch，expected/actual raw count均9、raw hash一致、totalSecondsDelta=0、stats hash不一致；rev8对应8/8且同样总差0、raw hash一致/stats hash不一致；更新前14:10的rev7亦为7/7和相同异常。说明已确认的是统计内容/摘要层未对齐，不能凭总量一致关闭；具体维度及算法/规范化原因待只读调查，未认定本地计时错误或A/B新回归。不自动改原账、设备账、总账或历史，不触发repair/reconcile写操作；本次查询均changes=0/rows_written=0。近30分钟云端无相关客户端错误行仅表示未见上报，不能作为本地无错误证明。只确认本机当次链路，不外推T.xia/P.xia其他终端恢复；仍不发布/托管。

PO本轮已授权A/B同步到本机当前unpacked并在重载后核查真实V2，覆盖此前本包不更新加载目录的边界；仍不发布/托管。仅替换infra/cloud-sync.js；先按D-115更新证据逐项核验205文件，完整备份并核hash，替换后校验其余204文件及manifest/key/权限/部署身份不变。不卸载/重装/改绑定/操作Chrome存储，不清ACK/pending/水位。重载须取得真实操作证据，再检查实际接收revision、publishedRevision、积压和阶段错误；没有终端证据不以本机磁盘更新或同步完成文案冒称恢复。

A/B本机磁盘更新已完成：205文件完整备份dist/native-host-candidate-before-v2-ab-1792221040909逐hash一致；仅infra/cloud-sync.js替换为已验源码，SHA256=5a50636c029e2a0d441f0a31c357c9029e65b93139d0b65c8bcf30440ef5c671，其余204文件逐字节不变。版本保持1.7.58，既有D-115修复及ID/key/权限/部署/metadata保留，未读写Chrome存储或家庭配置；ignored证据.tmp/v2-ab-local-update-evidence.json。Browser Use库存确认当前Chrome有目标扩展详情及本地Admin标签，但chrome://详情无法claim、chrome-extension://管理页被URL安全策略禁止（只准http/https）；未用CDP、其他表面或注入绕过。已请求PO只点击重载及立即同步，待用户操作与真实同步证据后继续判断V2恢复，当前不得标记恢复。未发布/托管或提交。

实施与隔离验收PASS：包A通过请求头/成功正文/错误正文停滞、迟到正文、正常JSON/HTTP400、主动取消不重试、配置重试次数及计时器清理；真实本地HTTP+原cloudRequest/原V2上传函数验证首次服务端接收但commit正文挂起时无commit/publish确认、pending保留，第二次同manifest/revision取得完整回执后确认。服务端为合成幂等夹具，本地状态接口为隔离stub，不冒称生产D1/家庭设备闭环；测试依赖注入150ms，不改原生产超时。

包B通过日期上传（仅传播内存子结果）、pending/current-week、对账请求、下行失败与异常抛出汇总；发布错误单列publish短码，received_not_published保持待发布而非假发布。上层实际syncStatsFoundationV1的hadFailure=true且不写全成功标记/日志已验证；正常pending_raw不误报传输错误。V1失败/V2成功、V1成功/V2失败和多阶段失败、正常跳过均通过，V1退避仍独立。未增加重试器、持久结构或新接口。

直接专项全部通过：cloud-upload-fault-recovery、cloud-connection-resilience 14/14、cloud-usage-batching 19/19、device-account-v2-sync 8/8、profile-account-v2-sync 7/7、cloud-client-log-ack 5/5、usage-history-post-upload-integrity 9/9、accounting-recovery-investigation（固定事故SHA仍复现、当前修复由新专项验证）；typecheck通过。Plan Conformance Audit：Matched，仅cloud-sync.js四函数改变（cloudRequest、mergeUsageDatePartResults、retryPendingDeviceAccountReconciliationsV2Shadow、syncUsageStatsByDateWatermarkV1），129个原顶层函数未变，含ACK/水位/上传落状态函数；helper中的变更仅子结果元数据收集，无水位分支变化。测试及既有任务/设计文档同步；不修改账本、历史、ACK、pending存储、水位、生产配置。已逐项核实当前1.7.58加载目录205文件与D-115更新证据/备份全部一致，本包未更新控件。未提交/推送/发布/托管。生产现场停传唯一根因及辅助恢复首次失败复用仍未关闭，不以A/B通过掩盖。

高风险extension-local传输/结果汇总修复，按PO明确批准连续执行。包A仅cloud-sync.js的cloudRequest：每次原超时预算覆盖fetch及正文读取，完整清理计时器/取消监听，主动取消不当超时重试，迟到正文不能返回成功；不改重试次数/退避/载荷/ACK。包B仅同步结果：V2 pending/current-week上传、对账请求与下行的失败按阶段进入总结果，保留接收/发布/待审计/下行原子结果；V1退避只按原V1结果计算，不被V2失败污染。不得变更任何原账、聚合、ACK判定/清除、pending持久化、水位、历史、配置、Native、Worker或当前加载包。

实施清单：1文档登记批准与边界；2包A正文/取消有界等待；3包B阶段汇总及V1退避隔离；4专项覆盖正常/停滞/迟到/主动取消、V1/V2成功失败组合及跳过；5本地回环HTTP真实fetch隔离故障，已接收但未回ACK不确认、重传幂等；6职责diff及typecheck。最小命令：新增cloud-upload-fault-recovery专项（含本地HTTP）、既有cloud-connection-resilience/cloud-usage-batching/device-account-v2-sync/profile-account-v2-sync/accounting-recovery-investigation、typecheck/diff；必要时cloud-client-log-ack验证公共请求兼容。不跑全量、不提交/推送/制包/托管/部署/更新本机；生产现场停传唯一根因仍未确认。

## NOW：D-115记账故障放行与远程诊断（2026-10-17，独立任务，不发布）

PO已授权本机加载包更新供人工验收，覆盖此前不更新加载包的本轮边界；仍不提交/推送/发布/托管。只备份并替换D-115的9个产品JS，保持1.7.58 manifest/key/权限/deployment-profile及metadata逐字节不变，不卸载/重装/重绑定，不读写Chrome存储。候选与HEAD归一化核对仅9个D-115文件及开发manifest存在实质差异，其他仅换行；完整205文件备份后逐项hash验证，再覆盖9文件并核对其余文件未变。真实故障注入继续只用于独立Profile，家庭人工验收只检查正常确认/超时/媒体与独立限制。磁盘更新不等于运行中重载，需明确区分。

本机磁盘更新完成：原加载路径dist/native-host-managed-candidate/package-extension，版本仍1.7.58 Native Host Development Candidate，稳定ID不变；完整205文件备份dist/native-host-candidate-before-d115-1792220188529核hash一致，仅替换上述9JS，每项与验收源码hash一致，其余manifest/公开key/部署标记/权限/metadata及196文件全部未变。ignored证据.tmp/d115-local-update-evidence.json。未读写Chrome Profile、存储、绑定、token或家庭配置；未重载Chrome，不宣称运行实例已更新。待PO原扩展点击一次重新加载并刷新测试网页，确认Popup绑定正常，进行正常确认/超时/媒体与独立阻断人工验收。不托管/发布。

最终真实浏览器验收PASS（补强后第5轮，2.2分钟，前序失败保留）：进入前quota故障、确认时quota/grant故障、真实60秒quota故障、正常确认、正常60秒阻断、故障同时命中黑名单/停用/强制时间窗，九场景全部通过。对故障放行直接断言真实dialog宿主移除、原页面按钮可点击、原播放音频paused=false且currentTime继续变化、原暂停音频仍暂停；主动再次访问复核无重弹，deadline再次检查无错误阻断。正常确认及真实60秒阻断对照通过，三类独立限制均实际进入正确reason的阻断页，截图已目视核对。证据为ignored .tmp/accounting-recovery-browser-final/accounting-access-recovery-9362e-s-independent-gates-survive/acceptance-results.json及对应截图；所有Profile由helper正常关闭。注入点只在隔离副本，固定用量只加速触发，不证明生产原始根因或真实计时精度。

本轮收口审计：Matched——实际确认进度与durable授权分离，授权保存失败不伪造grant；故障continue不立刻触发重弹；单独准入仍检查黑名单/停用/时间窗。修改为background、forced-use-prompt及直接prompt/联合unit与新增unpacked专项、本任务记录；未改Content、原账、统计、上传、配置或Native。prompt/联合/effects专项、typecheck、diff通过；未提交、推送、发布、更新当前加载包或家庭配置。整个D-115的V2停更根因及日志独立发送机会/完整预算仍为独立未完成项，不因本次回路验收通过宣称全部任务已关闭。

PO已批准第二次失败后的定点诊断、修复与继续复验：只在隔离副本记录轮次序号（不输出原token）、prompt阶段、故障命中及动作返回，区分未关闭与重弹。确证后仅修复D-115故障回路；真实60秒及三类独立限制继续按原验收范围执行，不发布。

定点诊断确证（第3轮，未改产品）：grant故障的round2依次visible→accounting_failure_allowed→action_response continue，随后round3 requested/visible；原提示确已移除并短暂恢复媒体，但新提示再次遮挡页面。修复仅两处：已通过校验的手动确认进度与授权持久化分开，保存授权失败时尽可能保留真实确认progress，不生成虚假durable grant；background故障continue不立刻调度forced_use_confirmed复核。后续正常访问/独立限制检查保留。直接prompt/mode-effects及联合专项回归，再复用同浏览器专项完成真实等待和独立限制，不改原账或用量算法。

真实浏览器专项（PO明确批准执行，待结果）：复用isolated-extension，在全新Chromium Profile加载当前源码副本，仅副本中定点注入配额读取/授权保存失败与固定用量。实际SW/Content/提醒/本地音频运行，检查提醒前故障、确认时故障、真实60秒超时故障、原暂停媒体不误播放、正常确认/超时对照及黑名单/停用/独立强制时间窗。证据只保存隔离数据和截图；最小命令为npx playwright test tests/e2e/accounting-access-recovery-unpacked.test.js，排除家庭账号、现用Profile、Native安装、原账修订、发布和加载包更新。不得将注入失败描述为已复现线上原始根因。

真实浏览器结果（2026-10-17，未通过，禁止发布）：已实际启动两次隔离Chromium/SW/Content/音频。第一轮进入前quota读取故障通过，随后夹具错误断言Shadow DOM宿主可见；第二轮改查实际dialog后，进入前读取故障与确认时读取故障均通过（页面可操作、提醒实际移除、原播放音频恢复、原暂停音频保持暂停、注入命中）。授权persistGrant抛错场景确认后10秒仍有提醒宿主，专项失败；尚不能区分原弹层未关或立即重弹。源码发现FORCED_USE_REMINDER_ACTION对故障continue也无条件安排forced_use_confirmed复核，可能导致重弹，仍需token/命中/状态诊断确证。两次失败后遵守10.4暂停同命令，已申请定位/修复/复验授权。真实60秒故障及正常超时、三类独立限制对照尚未执行，不得沿用单测结果报真实通过。证据位于ignored .tmp/accounting-recovery-browser-results{-2}/.../partial-results.json及截图；无家庭数据、未发布/更新加载包/修改生产配置。

PO已切换手动审批并要求继续确认、超时回路修复和联合复验。本包补齐：复核传递记账故障标志、关闭故障弹层并恢复媒体、授权保存失败不转为超时阻断；独立硬限制仍优先。必要验证为prompt、accounting-access-recovery、mode-service、mode-effects直接专项及typecheck/diff；不发布、不更新加载包、不改账本或家庭配置。

当前结果（源码及隔离联合复验通过，仍禁止发布/更新加载包）：mode-service 165项、forced-use-mode-effects、forced-use-admission、forced-use-policy、forced-use-prompt、access-diagnostics、client-logs 47项及typecheck通过。accounting-access-recovery已通过：五类准入故障、独立时间窗/黑名单、学习豁免、并发证据；新增实际background复核回调＋mode-service＋prompt运行时联合测试，确认/超时/recover三分支记账故障放行、关闭提示与恢复媒体消息、黑名单对照仍阻断。prompt专项覆盖授权回调/证据保存返回失败或抛错、session读写失败、重复deadline不再阻断、首次请求存储失败及正常60秒超时仍阻断。不能读取完整state时不以局部回退覆盖旧进度/授权。均为隔离单元/组件联合验证，不是真实Chrome或家庭设备验收。

执行阻塞已解除：PO切换手动审批后，原apply_patch已成功应用，无替代工具绕过。确证执行缺口为background把已放行的记账故障映射为block、确认保存失败遗留提示待超时、超时先阻断再关闭授权；现已传递故障标志，先复核及关闭授权/保存提示状态，再执行合法阻断，故障则清理提示并请求恢复媒体。同次已确认独立阻断不因辅助关闭失败而放行。学习正常访问既有授权清理路径已恢复。未改原账/聚合/上传/家庭配置。client-logs首轮脱敏断言失败、原样第二轮47/47通过，保留偶发失败事实，未修改脱敏规则或用通过掩盖首轮。

V2只读取证：accounting-recovery-investigation专项exit0，直接抽取事故3dc9731与当前真实函数，两版均复现请求头返回后删除timer但body持续等待、V2失败未进入外层failed/errors而V1回退可被清除；原辅助startupRecovery第一次失败Promise被永久复用也复现。均未证明15:53线上直接卡点，历史两次阻断的精确失败码仍未知。没有修改cloud-sync、原账、辅助贡献持久化、ACK/pending/水位/历史；日志独立发送机会/正文超时、完整8指纹/2KB预算和真实浏览器验收尚未完成，保持Missing，不包装为全部诊断已修复。

授权来源：主目录docs/handoffs/HANDOFF-2026-10-17-ACCOUNTING-ACCESS-RECOVERY.md及PO两条原则。事故基线3dc9731（1.7.49）单独核对；当前HEAD06640b4及1.7.58候选不等于事故已修。变更等级高风险访问控制、extension-local：只改准入/执行/确认/关联诊断及直接测试；不改网页ACTIVE/原账/聚合/用量/上传ACK或水位、不改家庭配置/版本、不提交部署更新加载包。

实施清单：1登记D-115并核对七故障来源/学习各入口；2统一非阻断结果及独立规则优先；3确认复核/授权错误不能换名阻断；4单次evaluationId/auditId与读取结果关联，故障原因、进度与失配布尔值脱敏有界；5复用基础日志授权、预算/ACK/发送机会；6事故SHA与当前V2 await链逐项隔离复现，记账补丁只提证据不擅改；7执行mode-service/effects、forced-use admission/policy/prompt、access-diagnostics/client-log/upload相关最小专项及typecheck/diff，真实浏览器需按交接范围独立验收，不跑全量或安装。当前无CI/发布smoke（不发布）；其余Native交付和三份旧草稿原样保留。

## NOW：Windows共享消费者接续（2026-10-16，源码与隔离验证）

新桶修复集中交付（2026-10-17，PO授权准备）：仅冻结的4产品文件、3直接测试及本任务块集中提交到现有codex/extension-local；其他PROJECT_MASTER/CHANGELOG/TASK旧草稿保持原样。唯一新unpacked开发候选1.7.58从该干净提交导出，源码正式manifest不升版，沿用旧公开key/稳定ID及native-host-development标记，不加权限/协议。复用上述精确源码测试证据；全新staging构建核验后完整备份既有1.7.57加载目录，严格只更新4JS及manifest且manifest最后。不能据磁盘更新冒称Chrome运行实例已更新或Service真实同孩子验签通过；原正常页面/既有上报与Service安全只读证据由架构集中核验，不绕过内部页工具限制。无托管/云端/R2/Native安装/共享启用/自动重启或重载。

同链路集中场景（2026-10-17，PASS）：显式TOC_NATIVE_PROCESS_CONFIG启用fullScenario，真实应用桶600→100→100，生产projectQuotaBucketsSeconds合并网页600后得到1200→700→700，不累加。真实断Port后新进程V1→V3重协商、generation1→3；旧context由真实JS客户端拒绝且不发送，新fixture绑定接受。错误孩子由真实JS契约在传输前拒绝，过期receipt由真实客户端拒绝且不发送，Native过期fixture由实际Dispatcher返回QUOTA_BUCKETS_CONTEXT_CHANGED。所有成功交换逐次核对Native stderr云请求pending及每进程cloudCalls=1，JS备用0；拒绝会立即断Port，故不宣称其末尾stderr必送达。两次观察失败均在业务断言之后等待被kill进程的附属stderr，架构确认后仅调整为成功frame后先收对应stderr再断开，未延长超时或改业务断言；最终同专项exit0、1.74秒。暖缓存600+200=800由根独立同入口验证，不重复冒用本次命令。身份仍fixture注入；不代表安装环境或真实Service验签。产品源码冻结、未提交制包重载。

实际跨进程最小闭环（2026-10-17，PASS）：前两次分别失败于测试Producer缺e_sqlite3依赖、夹具单段600秒违反既有180秒校验；Native仅修测试依赖及合法分段，产品未放宽。架构确认修正artifact后一次实际消费者复验exit0：真实Native framing/Dispatcher/临时SQLite/LocalApplicationStatisticsReader/QuotaBucketsReader连接真实JS客户端、1.55契约及source消费者，V1 heartbeat→V3 probe→V3 exchange，网页600秒＋应用600秒；Native真实后台cloudPending=true、cloudCalls=1从health至exchange不增，JS云端备用调用0。实际Producer.dll SHA256=5fe2d93da12381495b784e564c34219266fb65a70ca89145bab963bb1d13800d。身份由隔离夹具和receipt注入，不等同Service真实验签或用户现场验收；重复/下降/重连等同链路扩展尚未完成，不冒报通过。不制包、更新、重载或改家庭数据。

隔离跨进程验证准备（2026-10-17，架构转交PO授权）：产品源码保持冻结，仅在既有local-guardian专项增加显式环境变量入口，使用子进程标准输入输出的真实Native framing连接实际Dispatcher/QuotaBucketsReader，复用真实客户端、契约和source消费者；不手写统计响应，不接家庭、用户Chrome或生产库。缺省不执行新分支，待Native所属提供可执行入口及合成数据参数后运行冷协商、桶交换和云端挂起用例；现有通过专项不重复全量运行。

新桶本地交换最小接线验证（2026-10-17，源码待架构复核）：bootstrap、shared-web-contribution-sync、local-guardian（含固定旧客户端冷协商基线及C#wire）、source-statistics-shadow四项直接专项均exit0，typecheck通过。确认unknown不启动旧准备、桶能力不依赖共享执行阶段、重复reconcile/disable不撤销有效身份；无应用身份明细能力时可准备独立身份。新桶热读只读现有确认元数据，重复交换只发送exchangeQuotaBuckets，Scope/Bind/云端签发次数不增；过期、换Port和换孩子立即拒绝只读确认。旧身份明细管理仍保留ensurer及自身能力检查。本批未改提醒、原账、Native、云端或生产开关，未提交、制包、更新加载目录或重载；真实终端交换仍待集中交付后验证。三份原脏文档保持，不把其余草稿作为本批完成范围。

新桶本地交换最小接线（2026-10-17，PO批准实施，先源码）：按当前Port已完成协商的quota-buckets-read-v1选择新路径，未知能力暂不启动旧贡献/混合清单，明确旧端才兼容；shadow读取与shared执行分开，周期reconcile/反复disable幂等。新桶路径停用旧policy/basis/contributions但保留同孩子身份独立准备。身份模块复用既有内存确认结果，后台健康/连接事件及到期更新负责Scope/Bind/云端；新桶热读仅检查当前同孩子/设备/Port/代次及原5分钟期限，不await准备，不创建统计缓存或新协议。准备未完成/过期明确未就绪走已有备用；旧应用身份管理入口保持兼容。最小改动为bootstrap/native-client/既有contribution身份模块/background接线及直接bootstrap/bridge/source/identity回归、typecheck/diff；不改原账/统计上传/云端/Native/配置/共享开关/Mac/历史，不新树、制包、重载或生产操作，保留旧草稿。

冷协商最后审计修正（2026-10-17）：根指出排队initial probe自然采用V3时，options未显式protocolVersion=3，缺requestId严格拒绝后可能未断连。仅在strictHealth相关字段拒绝分支记录标记后失效当前实际Port，保留connected=false负例，不新增场景/协议/数据；同批追加修正后再次最小专项，不制作中间候选。


## 冷连接有界协议升级修复（2026-10-17）

1.7.57冷协商修复收口（2026-10-17，冻结补丁PASS）：最终local-guardian exit0，完整真实V1五cap＋固定8f97665未改客户端两缺口回放成立；新冷恢复/实际秒接口/同Port单次V3/重连首V1/真旧端/超时/断连/相关requestId/并发共用一次升级/实际C#wire通过。保留serialized手动probe原断言；内部negotiation不改手工冷却。补充严格升级相关时曾发现normalized丢negotiation标记，已确证修复；负例fault改为夹具初始参数仅确定失败时点，不替代该代码修复。旧startup精确顺序更新为V1/V3两health；旧Mac探针间歇超时未改产品，保留失败诊断，最终完整专项通过不等于Mac问题已关闭。source-statistics-shadow、最终typecheck及diff通过；方案Matched，仅native-host-client、直接测试和本任务块。本批不改计时/原账/统计/Native/云端/共享配置或手工节流阈值。集中本地提交后从固定干净提交制作唯一1.7.57开发候选，仅客户端JS与manifest版本变化，完整备份并原路径更新，不自动重载/托管/推送/启共享；保留其他三份脏文档。现场23:44超时仍未定唯一原因，重载后真实交换待根统一验收。

2026-10-17冷协商验证进度：固定8f97665干净导出原客户端＋真实V1五基础cap回放已确证“Host恢复首次单V1探针缺桶”和“普通实际应用读取抢先旧毫秒”两项；修复后的同Port一次V3、证明/桶读取、实际秒接口、重连、真旧端、升级超时/断连/无相关requestId全部通过新增场景。source-statistics-shadow及typecheck/diff通过。综合local-guardian尚未通过：旧appOldService夹具补真实V3回执requestId后保留不支持断言；随后serialized手工probe被内部协商污染冷却，确认为本补丁回归，已隔离negotiation不写手工lastProbeAt，保留原断言，尚待授权复验。已按两失败限制向根报告，不改手工节流阈值、不降测试标准，不提交/出包/重载。23:44现场超时仍未证实唯一原因，未声称实际本机exchange通过。

冷协商取证更正：初版冷夹具漏了真实V1基础能力authoritative-daily-snapshot，其失败不能证明“正常V1健康后source必不支持”，该结论撤回。改用真实五项基础能力，分别在固定8f97665未改源码回放“load时Host缺失、恢复后首个V1探针”和“V1健康后立刻实际应用读取”。前者单次V1协商后缺新桶，后者可能抢先发旧getApplicationUsage；正常已握手source仍可能由既有v3Supported进入V3，不能混为一谈。23:44原现场超时原因独立未确认。回归必须实际发起应用读取并断言秒接口，不用未发起动作的否定断言冒充证据。

冷连接V1→V3有界协商修复（2026-10-16，PO批准、先复现）：Native的V1健康响应虽然声明支持3，却只给旧能力；现有控件把Host支持版本与当前连接V3健康协商完成混为一谈，一次V1 probe后可能误判新桶不支持或采用旧毫秒接口。先加入按实际request.protocolVersion分支的严格回归，在未改产品上取得失败，再最小修复：同一Port确认支持3后最多一次相关V3健康请求，成功后才采用新能力，失败保留实际超时/断连并拒绝旧上下文；不提前设置账本用v3Supported，不继承旧连接能力。覆盖冷启/重连/真旧端/途中断连/新桶真实wire，local-guardian和source-statistics-shadow/typecheck/diff。只本机协商infra/直接测试及本任务块，不改Native/云端/原账/统计/共享配置，不顺改中文cap映射/历史/刷新频率。先源码交根审计，不制包/托管/重载/启共享，保留三份旧脏文档。

## 2026-10-16 集中推送／合并／部署与唯一Windows候选（PO批准，执行中）

2026-10-17 绑定准备及自动读取已有精确复现：一行额外明细cap门槛删除后，原专项及真实init→scope/bind→注册Reader→bucket/新Port自动恢复通过。原两轮含预期红灯和既有双探针300ms时序失败，按PO更新授权原样复验通过，未改旧断言。真实initSourceStatisticsShadow+可控proof延迟证实：首读纯Reader未就绪允许cloud备用且不等待签发；随后后台scope/bind确认成功，但exchange次数仍0/缓存accepted=false，仅推进原五分钟alarm后才自动读Native成功，非永久不恢复。仅LKG receivedAt变化也会额外重绑一次且能恢复，本轮不扩修该优化。

当前最小修复接线：身份准备首次成功后，通过background向已存在SourceShadow实例一次完成通知；用该实例原invalidate/refresh与generation/AbortController废弃未就绪旧读并刷新，不以新force含义放宽所有调用、不新建消息/协议/队列/重试/定时器。热读仍只Reader，旧证明期限/孩子/Port代次检查不动；ready缓存重复读取不重复通知。若通知发生在busy云端备用时，也须原代际失效机制确保旧结果不能覆盖新native。控件所属实施3处现有模块最小回归，Native62不改、不再安装；源码通过后集中一次控件交付与原Chrome验收由Native一处协调，不让PO跨任务转述。

2026-10-17 安装62后新真实59页面已由PO在Native提供：V3在线/current=true，但本次sent=false/received=false/accepted=false、application_identity_usage_binding_unavailable；应用为cloud备用，同孩子未知。与安装前Host响应形变不同，这次停在发送前身份缓存不可用，不判Host回归/孩子不匹配。Native新Host已证62及Chrome经shell拉起的进程链；没有安全现成接口可回读scope/bind逐请求状态，记NOT_OBSERVED，不追加UAC/采集。根与控件只读核到ensurer/reader及后台触发确实存在，不能说完全漏接预热；同时发现performSend applicationIdentityBinding内层仍要求applicationIdentityUsageSupported，与已批准独立reusable身份能力及已修外层不一致。先以真实client scope/bind发送回归复现；再核冷启/重连准备时序及同身份LKG刷新失效，分清首读未就绪与持续缺陷，未证实不改生命周期。当前不再索页面/重载/安装/共享启用；原账/统计/Host不改。

2026-10-17 2.6.62安装已独立核实：候选源码92628262、670源码/13发布/11内嵌一致，MSI实文件a87ddc8b84000a500ab1051aff755cdf0e6578400216116ef8c7f7503d010ced。启动attempt1无提升进程、attempt2进入但安装辅助PS5.1无BOM解析失败，均未进入MSI；不将其记为安装成功。四安装PS脚本补UTF8 BOM后，根独立以WindowsPowerShell5.1.26100.9444/-NoProfile/-ExecutionPolicy Bypass ParseFile四者0错误；同实际Shell参数预检通过。attempt3实际提升PID进入备份/MSI并exit0/completed，11组件/18表保留全PASS，原账/配对/配置未改。Service62新启动代际已证；首样未观察到NativeHost进程，不能用磁盘版本冒充原Chrome已用新Host。控件不更新/不重载，共享关闭；当前真实新Host/同孩子/exchange仍待自然重连及正常页一次最小结果，由Native统一取证，根不重复索问或UAC。

2026-10-17 Host修复已固定Native main本地提交92628262e86a76596bfdfe9c88890325250fabe1，仅已验5路径；根独立git show及5源码SHA复核Matched，与完整实际Host/临时管道/正式控件联测产物一致。Native唯一2.6.62候选构建核验中，不混其他草稿、不重复直接测试；安装、实际Host启动代际与真实native交换仍分列待证。此次不更新或重载控件，共享保持关闭。

2026-10-17 PO在Native所属明确批准安装已验Host修复并继续原Chrome/Service实际同孩子与exchange；根已读用户原话。本条更新此前先不制包安装限制，Native所属唯一准备下一2.6.62（版本按实际核实）、备份/原地升级/保留核验，根不重复构建安装。只用已验5路径Host修复，不混其他草稿或改统计/原账/配置/契约/共享开关，不部署云端/migration/R2。控件无需更新或重载：最后实际正常页为58；其后59仅磁盘manifest、读取代码相同，59实际运行未确认不阻塞本次Host修复。安装后必须核实际Host进程/连接与当次native结果，不用磁盘版本、心跳或旧fallback代替；现场一次最小正常页取证由Native统一，根与控件不重复索问/UAC/SW。

2026-10-17 Host最小修复源码及完整中转联测通过（尚未交付安装）：Host只解析JSON对象并Clone透传，Program保留入口，Host类单独可由直接测试链接；内部pipeFactory只由测试代码传入，生产仍原Create/鉴权/12s交换预算/3s连接/帧上限。根审Matched，原无效array错误码仍RUNTIME_SERVICE_UNAVAILABLE、null为SERVICE_RESPONSE_INVALID，不擅改兼容语义。实际Host随机临时管道5/5最终PASS、Host build0警告0错；根独立正式1.55 JSvalidator核actual-host-responses新桶45秒partial/null-cutoff、显式applicationUsage:null及服务拒绝通过。现有控件真实客户端/消费者经过真实Host代码+随机临时管道+Dispatcher/读取器的fullScenario首轮exit0/1.9138秒：600→100→100，合计1200→700→700；重连/旧context/错误孩子/过期拒绝通过，所有observed response.actualHost=true，云端始终挂起且调用不增。根独立暖缓存变体同链exit0/1.098秒：600+200=应用800，网页600合计1400，JScloudReads0/NativecloudCalls3稳定。未触生产管道、真实账本或配置；同孩子身份仍测试fixture，不冒充现场Service验签。

本次Host源码hash：Program.cs66490bb53b4e888a1164fc4994a7823db1998cd441c37b16d53a3b3eb9dcb8ba；NativeHostProgram.cs cc239eb80f0a15f0a95b961edfabc39972d1c02510a098d5886669acb4503a39；直接Host测试379046067f1b657b344dffc2d1a6a162c63c59cc20b35b75b7c9adce79e0f35e；实际Host Harness fbc5ffe99f6752b7d6bb9abce08d772607770d2bdfb24d9d9b2b0a067e4575b4。证据沿用本地host-transparent-forwarding-20261017及原测试入口，无新治理文档。已安装61仍包含旧Host缺陷，不能因本次源码PASS标为修复现场成功；控件生产无需改动，尚未再制包/安装/重载或启共享。

2026-10-17 Host形变实际复现已证实（根独立读host-roundtrip-repro.json/host-roundtrip-validation.json，全合成）：Service schema2 applicationUsage含整数秒桶/childId/readAtMs/显式null，正式1.55validator接受；执行已安装Host相同typed Deserialize/Serialize后变旧fromDate/toDate/computedAtMs/totalMs/days，45秒composite桶及单位/孩子/截止字段丢失，requestId仍保留，正式validator准确拒绝SOURCE_STATISTICS_INVALID。与现场相关请求sent/received=true但accepted=false一致；不把它归咎原账/分类/孩子分配或云端备用。最小修复只在Host保持Service JSON原形转发，旧DTO/错误回执不改，新旧wire/原timeout/帧/IPC鉴权保留。直接测试新增真实Host类与随机临时管道，不触真实Service管道，不引入可由生产env/CLI改pipe的后门；现有JS消费者不变。此前Dispatcher直出跨进程证据仍有效但不覆盖Host。先完成源码及实际Host链聚焦验证，未再制包/安装/重载，未启共享。

2026-10-17 已取得真实58页面结果（PO在Native所属提供，根收到脱敏字段）：当前连接/v3、当前身份周期且属于当前连接、sent=true/responseReceived=true/accepted=false，source_statistics_native_invalid_response。应用来自云端备用，不是Native成功；同孩子仍unknown。该错误只证明响应未通过控件接收校验，不能推成孩子不一致/服务拒绝。根及Native独立读到具体转发风险：NativeHost Program.cs69把Service JSON Deserialize<BrowserBridgeResponse>再输出，旧typed ApplicationUsageSnapshot与新桶RuntimeV2Values的applicationUsage同名，导致新桶可能被旧DTO解释并丢字段；控件严格schema2拒绝合理。QuotaBucketsProtocol.Wire已Never保护null，不以此前null猜测冒充根因。Native先做实际Host roundtrip复现，再只修Host转发和直接回归，不改统计/原账/契约/控件校验；已有跨进程入口须补实际Host这一步，旧Dispatcher直出通过不能外推Host链通过。暂不再制包安装或索用户操作，共享关闭。

2026-10-17 PO已确认原Chrome重载1.7.58并打开正常状态页（PASS_WITH_MANUAL_EVIDENCE，仅版本/操作确认）。现有Service安全采样仍为旧fallback摘要；控件确认不存在当前工具允许的实时内部页/日志读取入口，因此本次58实际request/accepted仍NOT_OBSERVED，不是已证失败。保持已测代码和运行包不变、不追加UAC/重载/诊断系统、不启共享；仅需正常页最小实际交换结果/接受状态及今日应用桶与读取时间补最后现场证据，不要求SW或长诊断。不得将先前“保持打开即可”误称自动读到了该页。

2026-10-17 Native2.6.61已安装（本轮唯一UAC）：根独立读取install-safe-result确认exit0/completed、ServiceRunning、11组件匹配及备份/保留审计完成；18表安全摘要确认配对/HMAC/应用配置/原事实/冻结版本/outbox身份均保留，状态可自然推进。MSI实文件SHA25691dab0641000e13fa502adf5998c4366197e6263c3b6302cd72198dc952aa811与固定候选一致；源码667文件、发布13组件及MSI11组件证据已核，内部未签名/latestEligible=false。控件58仅已更新磁盘，根已统一发一次原Chrome重载/保持正常状态页打开提示，不索SW或另一次UAC。安装提升进程有界读取既有adminStatus，不主动造exchange；初样为旧SourceStatisticsReader fallback（applicationOrigin=local+cloud-other、webOrigin=cloud-all），不当新桶成功/失败。新quota shadow受V2 NewModelEnabled控制，现场不为取证改共享配置；当前58真实运行/本次同孩子绑定及sent/received/accepted和返回桶仍待观察，不宣称现场通过。

2026-10-17 唯一候选准备：Native源码固定5e643e5fc13cdb54e265c9946db9d16481840aad，仅2生产/2直接测试文件，2.6.61由Native所属唯一构建安装；控件固定06640b43803f70bc7f5055b34e881a6ad88b7b6f，4生产/3直接测试及本批TASK记录，旧3文档工作稿保留。控件唯一1.7.58开发候选已完整备份后更新原加载目录，204文件treeHash12c99b72026a5216091dfedfffb20de6131b2f921b2b8741cce3526f70cbc5d3；备份205文件treeHash069094376a95bfee457e80d7ce4934d55b0e22f4ef9512fd387afbfc5af44ed0。根独立读取update-evidence并核加载目录4产品SHA全与被测源码一致，严格仅4JS及manifest变化；权限、ID、metadata保持，storage未改，尚未重载，不把磁盘manifest版本称实际Chrome运行版本。Native安装/候选最终核验和真实同孩子/exchange仍待本次集中操作，无生产Worker/Pages/migration/R2或共享启用。

2026-10-17 PO在Native所属会话明确批准安装本次修复并继续原Chrome/已安装Service同孩子及exchange验收，共享关闭；根已读取该用户原话核实。Native会话唯一负责下一2.6.61内部候选（版本须核实未占用）、备份/安装/保留核验，其他会话不重复构建安装。控件现存1.7.57候选不含本轮冻结4产品修复，不得以其失败评判新源码；所属会话集中固定一个包含已测源码的候选，与Native协调一次更新。只核实际同孩子身份、当前Port协商、新请求sent/received/accepted及整数秒范围；不改配置/原账/共享开关，不部署云端或migration/R2，不绕过内部页浏览器访问限制；工具不可达的现场证据明确缺失，不用合成peer或旧ACK代替。复用此前源码/跨进程精确哈希证据，必要新增验证仅候选哈希及现场smoke。

2026-10-17 自行跨进程隔离联测已通过（未更新运行环境）：真实控件native-host-client/1.55契约/source-statistics-shadow消费者，经4字节LE原生帧调用实际Normalize/BrowserBridgeDispatcher/RuntimeJson、临时SQLite/LocalApplicationStatisticsReader/ApplicationQuotaBuckets/冻结QuotaBucketsReader。最终集中命令为local-guardian.test.js的TOC_NATIVE_PROCESS_CONFIG分支，--quota-bridge --cloud hang --decrease-rest-to 100 --run-id ext-concentrated-fixture-20261017、fullScenario=true；exit0/1.742秒。应用600→100→100，现有生产核算与网页600形成1200→700→700；真实断Port/重启进程后1→3重新协商，新generation拒绝旧context，新fixture绑定后接受600。错误孩子/过期回执由真实JS拒绝；Native过期fixture真实返回QUOTA_BUCKETS_CONTEXT_CHANGED。成功交换逐次cloudPending=true且每进程cloudCalls=1不增，JS备用0。根独立用最终测试文件再跑暖缓存变体--prime-other-rest 200：本机600＋缓存200=应用800，网页600＋应用800=1400，cloudCalls=3（prime两次＋挂起一次）稳定，exit0；node --check及两仓相关diff检查通过。

本批两端产品源码与先前冻结哈希一致；新增仅测试Harness及既有测试入口。最终local-guardian.test.js SHA256=555da8a2d2c00b51975d3ba4e6ab413b23cbf6af292216e90f730284b89f3366；Harness SHA256=cab959ca78a77223dc9ed276ec9cec53583dcc2c46edd243cecd131a252f6827；Producer.dll SHA256=5fe2d93da12381495b784e564c34219266fb65a70ca89145bab963bb1d13800d。Native现有受限本地证据quota-local-read-20261017/bridge-harness.json、harness-smoke-result.json保留具体来源/程序集边界。早期测试失败为独立console缺SQLite本机库、600秒夹具违反180秒段上限，以及断Port抢先stderr的测试观察时序，均仅修测试/测试产物；未放宽产品校验、延长产品超时或手写成功响应。负面拒绝后的stderr可能随断Port丢失，只认实际业务错误回执，不冒称日志齐全。

本轮审核Matched：无安装/重载/UAC/真实服务或真实账本访问、无部署/配置/共享开关修改，未要求PO操作。身份context及已确认回执由合成fixture提供，未验证已安装Service的SID派生/云端签名验签与真实Chrome连接；隔离链路通过不等于现场全功能已验收。下一步只集中交付已测两端源码及候选，再核已安装连接，不扩历史/Mac/提醒范围。

2026-10-17 PO要求先自行测试、不反复介入：先复用既有隔离入口，将真实控件native-host-client/桶消费者跨进程连接实际C# BrowserBridgeDispatcher/QuotaBucketsReader，运输层仅替代Chrome Port；合成孩子及临时数据，产品源码冻结。先核冷协商及云端挂起时本地交换，再沿同入口核重复/下降、重连及错误范围拒绝，逐项记录真实代码与注入边界。中等风险测试接线；仅新增必要直接测试入口、聚焦编译/Node专项与diff检查，复用14项及4专项证据，不跑全量/Mac/安装器，不动真实服务/账本/配对，不安装、重载、UAC、部署或启共享。跨进程通过也不冒充当前已安装Chrome/Service身份链实测；暂不再向PO索取操作。

最简读取本批源码已完成并审计Matched（2026-10-17，未交付运行）：Native仅2产品/2测试文件，14项Quota/Service聚焦PASS，根逐文件SHA核验与result.json被测源码一致；后台云端不返回时，有/无缓存的本地读取和exchange均在测试1秒限内返回，未新增网络，桶值/更正下降/重复/隔离保留。控件仅4产品/3直接测试文件：新版bucket按读取cap选路，unknown不启legacy，shadow停旧policy/basis/contributions且重复配置幂等；exchange只读当前有效身份，后台Scope/Bind不进入读数热路径，原5分钟/改绑/断连失效保留。shared-access-integration、shared-web-contribution-sync、local-guardian（固定旧五cap基线+C#wire+重复桶热读只exchange）、source-statistics-shadow四专项、typecheck及diff均PASS，根源码审查通过。两仓本批都未提交/推送/制包/安装，原脏稿保留；当前运行版本不包含此最简修复。未改原账、统计上传、配置或共享开关，未部署云端/migration/R2。下一阶段只集中交付同批两端，再做真实本地exchange；源码/隔离通过不等于实机通过，先不再向PO索取重载/安装或SW数据。

2026-10-17 PO要求按最简结构实施，暂停以补重试/加时延维持复杂依赖。已核两处实际接线：Native QuotaBucketsReader.Exchange→ReadApplication→CloudAsync会等远端；控件shared-access-integration仅按强制执行V2能力选路，影子阶段可能启动旧contributions/basis准备。修正顺序：Native自身读取仅本机最新＋现有远端成功缓存，现有后台负责远端刷新；控件新版桶可用即退出旧贡献/旧清单准备，身份有效证明复用不变；随后验证云端永久未返回也不挡本地桶、无缓存仍保留本机、旧端隔离、桶值不变及真实桥交换。只沿现有模块修接线，不新增协议/统计/队列/缓存层，不原账/统计上传/配置/共享开关/云端生产操作。必要测试仅两端直接读取/桥/启动专项及typecheck/聚焦编译、diff；排除全量/Mac/历史/安装器。源码未完成，未部署/安装，不宣称通过。

2026-10-17冷协商控件已交付：最终源码6266be1d7141fe0d0a8aa80c87bd276561741f8e（主修复5d1dcd9及严格健康响应拒绝失效端口补齐），该精确源码local-guardian完整、source-statistics-shadow、typecheck/diff全部PASS，根审计Matched。一次1.7.57开发候选204文件treeHash bae631ea7858e7067dce152fa2209952b5d07a866c3895e4fecf7d8a6d9f3338；原1.7.56完整205文件备份及逐项核验通过。根直接读取update-evidence确认backupVerified/allCandidateFilesVerified/permissionsUnchanged/retainedFilesUnchanged=true、manifestCopiedLast=true、storageTouched=false、reloaded=false；仅native-host-client.js与manifest版本变化。原目录已更新、等待用户一次重载及正常V2区块取证；未推送本地修复、未托管/R2/部署/Native安装或启共享。真实本地exchange仍未通过，23:44超时未宣称唯一根因已消除。

2026-10-17 PO已允许必要聚焦复验并通过后更新控件。最终local-guardian完整PASS（含固定8f97665＋真实V1五cap两缺口对照、冷恢复同Port单次V3、实际秒读取、重连首V1、真旧端、升级超时/断连/相关ID拒绝、原serialized和Mac双通道断言、真实C#桶wire接收）；source-statistics-shadow/typecheck/diff通过。根审查本批仅握手infra及直接回归Matched，不扩统计/Native/云端/共享。单个1.7.57开发修复候选准备并备份更新原目录，实际重载与本地exchange仍待取证；无需再次安装Native，不启共享，不托管或R2。

冷协商修复续进：完整Native V1五基础cap在固定8f97665源码重现完全冷恢复source误判unsupported、V1后应用实际抢发旧毫秒接口；不再使用漏authoritative字段的夹具结论。控件补丁仅当前Port握手版本与有界一次V3升级，保留身份/桶验证；新冷恢复/秒读取/重连/真旧端/超时/断连/缺requestId隔离用例通过，source-statistics-shadow及typecheck/diff通过。综合local-guardian暴露旧响应夹具缺V3 requestId后，又暴露补丁内部升级占用手动probe冷却，均已分别修正，原serialized断言未放松；按同命令两次失败规则暂停进一步综合复验，待PO允许必要复验。未提交/制包/更新原目录，不Native/云端/原账/配置/共享变更。现场23:44超时独立未归因，真实本机交换未通过。

安装/重载后PO正常页证据：1.7.56、23:47通道在线；23:44本机交换sent=false/response=false/accepted=false、native_response_timeout，不能视为exchange消息已送达Service。网页桶读成功，应用云端备用今日study4980/composite70/rest0秒且标不完整，无备用503；本地交换仍未通过。23:47能力清单缺新桶及秒读取能力，与Dispatcher按请求protocolVersion=1返回部分能力、但SupportedProtocols包含3的路径吻合；控件ensureSourceStatisticsCapability仅一次probe后判unsupported、普通应用读取允许仅旧毫秒能力立即通过。现有local-guardian夹具多为无条件返回v3能力，未覆盖真实冷连接1→3升级。此为源码偏离/覆盖缺口，不足以确定23:44超时的唯一现场根因；不改原账/统计、不开共享、不再次要求安装/重载，下一步隔离重现真实协商序列并最小修复。

后续安装实况：PO重新明确批准后，同一2.6.60候选在唯一有效UAC/PID11348下安装成功，exit0、ServiceRunning、11个内嵌组件哈希一致、18表及配对/配置/原账/outbox保留核验通过。PO已确认原Chrome控件重载，记PASS_WITH_MANUAL_EVIDENCE；不再重复安装或重载。管理员既有只读status未返回新交换证据，公共status无exchange字段；应用/网页新桶实际接收仍待现有正常页核对，不伪造peer、不启共享。下方未安装/未重载为本轮较早状态，已被本段取代。

集中交付进度：PR286已合入master8f976652a6be89deb63c8d86522efc6fdad085e1；该SHA Runtime CI38914119547、Guardian CI38914119602通过，生产运行38914371905成功，仅发布Guardian版本bd923f0e-9b4a-41fa-b528-1978a5be1562和Runtime版本b83faedc-b229-4ec6-a22c-12da1ce6237f，健康/未鉴权拒绝smoke通过。迁移清单为空、未执行迁移，两套Pages步骤跳过、未操作R2/latest、共享未启。

唯一控件1.7.56来自该master，204文件treeHash6b41372c1ac87d493129fa52d66adf0a885faa3d56a6a5ffb7cd567a4878dbee；原目录备份和204文件更新核验通过，权限/ID/metadata保留，storage未触及，实际reloaded=false。唯一Native2.6.60来自26fdca1，制包/组件/MSI核验通过；UAC请求实际1223取消，未开始备份/安装，失真的启动标记已更正并保留原件，当前2.6.59仍Running。安装与一次控件重载待用户完成后继续本机桶交换真实核对；不能将源码/部署/文件更新或旧ACK冒充实机通过。受保护旧任务板草稿已恢复，原stash保留，不夹带本次产品提交。

PR286集成CI发现兼容测试仍断言旧包版本1.54.0，实际已批准契约为1.55.0。仅修正该测试的版本断言，先运行完整契约专项及diff检查再继续合并；不改变产品实现、契约内容或候选哈希。

本批统一集成云端8e6dcd3、控件549ea51（含35cfed0）与Native26fdca1；仅部署实际修改的Runtime/Guardian Worker，无Pages产品变化，不执行migration、不改R2/latest，不启共享。最终Windows候选2.6.60与控件1.7.56一次交付，保留配对、配置、原账及outbox。已通过精确源码专项复用，集成/部署/安装/真实读取分别登记；暂存恢复的更早任务板草稿不夹带提交。
## 2026-10-16 共享读取简化（实施中，未部署/安装/启用）

- 已批准：直接共享现有配额桶，删除重复汇总、云端来源键前置及独立共享查询；保留身份核验和原读取器。
- 中风险跨端读取改造；顺序：自身读取→本地交换→云端备用→缓存恢复→独立核算。必要测试为契约/来源读取/配额专项、两端typecheck或聚焦编译、diff；排除原账修改、全量、Mac、安装器、E2E及生产操作。
- 本批已进入源码与隔离验证阶段，保留本任务之前全部未提交内容；部署/安装/真实验收独立登记。
- 云端源码已接入新桶契约1.55.0；只复用原网页账户快照/配额读取器及原应用持久统计读取器，原SQL查询仅为仍有调用者的旧v1兼容保留。契约/Guardian来源专项、Runtime12/12、root/backend typecheck及diff通过；Native真实序列化合成报文通过TS新契约。控件/Native所属实现和跨端回放继续，部署/安装/真实家庭验收未做，不能标整体验收完成。
- 云端与契约固定本地提交8e6dcd3fb128ed12c7a56c354535b37c39939b43；Native固定26fdca1fb2665946479d0d1cfdbf963e9940bbed，1.55.0同包同SHA锁定，45项相关回归及13项锁版增量通过（存在重叠，不相加冒称58项）。Native当前日读取与TS/C#完整/缺源/部分数据核算逐字段一致，Dispatcher+RuntimeJson合成产物与TS契约一致；未安装/部署/启用共享，Mac未启动。
- 控件最终本地提交35cfed0，四项相关专项、Native实际序列化报文消费者回放、typecheck及diff通过。新路径删除web-other额外请求、云端来源键前置、共享专用摘要hash与逐日混填；V2缺源保留可用桶并标missing，已有执行上下文校验保留，不因读取时间刷新使确认失效。既有诊断只补本批已知原因中文映射，不重排UI。
- 源码审计：自身读取、本地交换、云端备用、缓存恢复、独立核算五项均Matched（源码/隔离证据）；无未批准Extra或已知Deviated。部署、终端更新及真实Windows当前孩子联调未执行，属于下一交付阶段Missing，不得宣布线上修复或整链实机通过。三处本地提交均未推送；不启共享，不产生中间安装候选。现有任务板混合的更早未提交状态记录保留，未夹带提交。

## NOW：Windows完整闭环（包含共享）后再迁移Mac（2026-10-16，PO已明确）

收到Native转交的PO真实1.7.51摘要，无需再向用户取数或重载：v3/分域统计能力/debugger/V2配置profile-config:52影子模式已证实，网页有本机＋云端其他来源缓存；V2应用无可用快照，同孩子当前V2校验未知，旧ACK不替代新exchange。已确定跨端接收缺陷：2.6.59 Dispatcher成功exchange只返回SourceStatistics、不返回可选SharedQuotaStage，而控件native-host-client.js要求stage必为shadow，因此有效统计亦必被拒绝。原夹具人为附加stage遗漏该真实响应形状。按既有完整链路修复范围，仅纠正读取器对可选阶段字段的错误必填依赖，用Native真实成功形状补回归，保留请求/连接/Child/日期/秒契约校验，不改统计或启共享、不改Native/重装。现场这轮是否出站/云端备用是否失败仍未证实，不将代码缺陷冒充唯一现场根因；两项诊断错误隐藏/消息枚举遗漏另登记，暂不独立出包。

最小修复跨仓回归通过：Native直接调用已校验2.6.59候选Dispatcher/RuntimeJson编译产物生成两份合成probe/exchange响应，DLL哈希与候选相同；JSON哈希4cf036bab0c4588b11a4c0de387d023be96363ba876944403698035a789492b3，根独立确认ok/requestId及application/seconds、确无stage。控件真实消费者对同报文旧guard拒收、去掉无关阶段依赖后接受，错child/date/unit/id和断连仍拒绝；诊断空快照错误及应用请求名修正专项、typecheck/diff通过。此为隔离兼容回归，不是原Chrome实际exchange通过。只冻结合成fixture为默认回归并集中收口本批控件修复，准备单个固定1.7.52候选，暂不覆盖或要求重载；Native/云端不改、不安装、不启共享。云端源码核对web-other/application-all与机器application-other各自鉴权边界一致，尚无同范围生产HTTP备用读取证据，不以代码审查代替。

修复已固定控件fe3ba4942d96671c0136d9f623af0a218b475651；默认本地回归直接消费仓库冻结的真实C#合成fixture并通过，不再依赖外部临时env路径。1.7.52成品根独立逐文件核验203→203，仅两infra脚本及manifest版本/version_name变化，权限/ID/其余业务文件不变；按既有交付授权完成原目录备份及就地更新，根已读取update-evidence：backupVerified/allCandidateFilesVerified/permissionsUnchanged=true，storageTouched=false，reloaded=false。候选hash767426e2e7debcddcf56cc5a8d96ad82de8bf61675738122b53def95da61aa48，1.7.51原包204文件备份hash1bea87eb035660a00110642da243f6e45e0cb738bb94940b787c3ce98c21f08c。实际运行尚待重载后同一V2摘要核对；不以隔离回归代替实机，不重新安装Native或部署云端，不启共享。源码及文件交付Matched，实际exchange、同孩子当前上下文及云端备用现场证据仍Missing。

PO已明确“已重载1.7.51，继续核对真实读取链路，先不要启用共享”，重载操作记PASS_WITH_MANUAL_EVIDENCE，不再要求重载。Native随后一次正式公开只读status：2.6.59在线、同一启动时间、heartbeat及bridge成功时间已更新、无pending；该公开摘要不含真实probe能力/当前同孩子校验/exchange，三项仍未知，不伪判失败。protocol3的source-statistics-read-v1为读取能力判据；shared-forced-use-runtime-v2受shared阶段门控，关闭共享时缺失不能当读取失败，更不为测试能力而开启共享。根已统一仅请求一次现有正常管理页的新V2区块，所属两端不重复要求用户取数；未改代码、配置、日志授权或安装，未绕过扩展URL/ACL。收到同一份实际摘要后再逐项判断真实读取与缓存状态。

PO已回复“已重载，继续验收”，该手工操作按PASS_WITH_MANUAL_EVIDENCE记录，不再等待重载。Native正式公开status确认2.6.59在线且有重载后浏览器桥接成功时间；旧聚合protocolVersion不证明实际V2能力。云端当前网页设备亦已刚刚活跃、共享水位HTTP200，但版本列为空、日志授权过期/当日无日志，未擅自启用日志上传。现有本地共享同步摘要仍只投影旧V1缓存，缺新来源读取/V2identity及debugger grant，不能要求用户复制后冒称新链路通过。已交控件任务最小补齐现有诊断只读入口，先核可用状态与文件范围，不改统计/计时/配额/执行、不新建协议或遥测、不制中间候选；需要新持久状态或产品行为则先停报。实际完整共享联验仍未完成，开关未动。

观测缺口已最小修复并固定029b218（现有控件分支本地提交，未另建PR）。仅两诊断JS、直接单测及本批任务记录；专项/typecheck/diff通过，根直接核对桌面/390窄屏合成截图。只读已有V2配置、实际权限和按当前scope/周校验的源缓存，不刷新/重算/新建peer或持久状态；当前同孩子V2证明无现成证据则未知。真实身份派生指纹跨会话请求被安全审核拒绝，已放弃该额外数据传输；诊断既不计算也不输出ChildID/指纹，只保留已有本地范围校验结果。

1.7.51诊断候选与已重载1.7.50逐文件核验203→203，仅两诊断JS及manifest版本/version_name变化，权限/ID/其余业务源码不变。原目录已按既有更新授权备份后完成更新，manifest最后替换、metadata保留、未触及storage。根已读update-evidence：backupVerified/allCandidateFilesVerified/permissionsUnchanged为true，reloaded=false。候选treeHash8d1cb054cf8b7f1f6d09abec4e596dbb7ff623e0e0bbc817e48def4ad548c530；原1.7.50的204文件完整备份hash20257a4dac36ef3fa1bad6ba5a8f1a0b5b906df3e5a75de15541978607f977b1。需用户在原Chrome再重载一次并从同一正常摘要返回新V2区块；不进入Service Worker、不重装Native、不部署云端，不假称已取得真实新诊断或共享已通过。

重载等待期间补充只读范围核查：已登录主控制台当前孩子的绑定设备列表仅显示两个网页设备，最近活跃分别约12小时及25天；此为最近上报状态，不能证明全部当前会话已隔离。没有操作监控开关、恢复请求、Token或绑定。结合已核实Child级rollout及同孩子多Windows用户，暂不切共享；先待实际控件重载，再读取真实同孩子/来源/缓存证据。上一目标轮完成文件更新属于progress，本轮未将会话idle当作仍运行或重复启动制包；不因等待重载继续生产变更。

PO已明确批准控件新增debugger权限并重载1.7.50，新增权限不再待裁决；已交所属控件会话核验固定候选、备份并更新原加载目录、完成一次允许的重载及实际权限/版本/Native连接核查。保持扩展ID、配对、存储和配置，不卸载重绑、不重制候选、不正式托管；浏览器实际授予和真实运行状态仍须核实，不能以授权答复代替。共享仍关闭；下方等待权限的表述为此前状态。

原目录安全更新已完成：203文件与固定候选hash全部一致，manifest最后替换；旧1.7.48的197文件完整备份及哈希核对通过，存储未触及，Chrome生成规则元数据保留。根已读取update-evidence.json确认。因浏览器工具明确禁止扩展内部页面且无可用原生控制，未绕过；reloaded=false、debugger实际授予未验证。需用户仅在原Chrome的扩展管理页对原ID点一次重新加载并批准可能出现的新增权限/重新启用提示，然后继续运行版本及Native连接核对，不进入Service Worker、不重装重绑。源码/文件更新Matched，实际重载与共享联验Missing，共享未启。

集中交付实况：PR284已合入master `3adcad36b51f8fcf08285350f0a4ff26f255fdd5`，生产运行38882019324成功，Runtime/Guardian Worker及两套Pages已发布；migration列表为空，未启共享、未操作R2。Runtime版本65408253-b298-4fcf-bd32-212b92e1ecb0，Guardian版本2af37d1d-c941-4b53-8a6a-91b55a537863；Runtime Pages f6ca2530-4a47-427a-8722-dca8ca1a05e5、主Pages 4810ac38-c856-4684-a5b3-4fee33b355a7。线上关键脚本已与该SHA的Git blob逐字节核对，避免Windows工作区CRLF误报。Native唯一2.6.59候选安装exit0，真实Service/Agent/Manager版本及18表保留核查通过，配对、配置、原始事实与冻结统计未变；主控制台真实设备详情已显示Service2.6.59.0。此为发布/安装通过，不代表共享实机验收通过。

控件1.7.50候选尚未覆盖原加载目录。新增debugger开发权限的原账守恒补证已取得真实隔离账：关闭目标页时自然标签激活先结算，新增目标段恰一条2秒，原三段未变；不能硬要求结算原因必须为tab_close。仅修正过严测试断言并聚焦复验，保持产品记账线不变。新增权限需由用户在实际重载时确认，不静默授予；共享仍关闭。下一步为控件补证/统一重载、对称查询真实核对及备份恢复范围内的临时共享验收。

控件补证最终通过，测试及本批记录提交0c6f2bf：正常取消3段→3段、目标保持打开；强制关闭4段→5段，恰新增目标3秒段，与关闭前活动起点一致，旧段不变、无重叠重复、见证标签仍开。根独立读取脱敏产物确认，原账夹具写入false；此仍为真实浏览器＋隔离Service状态机，不是已安装双方联调。1.7.50产品候选保持master3adcad3来源及原哈希，不因测试提交重建。真实Chrome内部管理页被工具URL策略拒绝，未绕过或要求Service Worker取数；真实profile日周来源及本地stage尚缺。正在等待新增debugger权限的明确答复，原目录未覆盖、共享未启；Native应用正式只读入口核对继续，不因此扩大UAC或重复安装。

已安装Native正式LocalApplicationStatistics.v1只读入口通过当前Windows用户认证，不由请求自报Child ID；当前日已知20215秒、17应用、小时合计一致，完整总量仍null（排除旧无身份/多身份记录及分类/特殊属性缺依据），不把known下界冒充完整量，不在本批追修历史。共享exchange要求真实web remoteProof，独立诊断连接不能假造或替代。另已核实共享rollout/时间段/自主度为Child级，现有DTO无测试目标allowlist；单独限制测试进程的关闭目标不代表Child级配置已隔离。临时启用之前必须核清同孩子全部在线影响范围；范围未证实前不改共享配置，不擅自开发新allowlist、不扩大到其他用户或机器。发布/安装状态Matched，真实共享验收仍Missing。

集中交付已获PO明确批准：推送Native7b704fe、通过检查后合并PR284、发布本批Worker/Pages、唯一Windows候选安装及原控件目录更新（UAC由PO批准）、仅当前Windows测试范围临时启共享并验收、结束恢复配置；只操作测试页面/程序，保留原账/配对/配置备份，不migration/R2/其他家庭。此前授权等待已解除。PR284已按精确a42c575合入master3adcad36b51f8fcf08285350f0a4ff26f255fdd5；精确主线Runtime38881806633、Guardian38881806469、Main Console38881931875全部success。Native精确7b704fe重试push成功，不force、不带草稿；唯一候选准备中。本地本段只记录发布过程，不改变Actions从干净master构建/发布的SHA，不以源码/CI代替真实验收。

最新裁决已收到：有限适用配额缺源且无有效缓存时采用可用性优先容错，允许使用并提示不完整，已知黑名单/停用/对象限制及已知到硬上限仍执行，未知不补零。已交两端补实际消费者及最小回归；下方“待PO裁决”均为历史状态，不再是当前阻塞。云端8ff3b39相关CI全部success。控件6167b14已push并建立集中PR285；其首次CI失败为scope按两端diff看到落后主线的反向差异，正在保留脏稿普通合并主线，不扩大职责或放宽checker。

集中集成前核对：控件缺源容错b4f90b6、普通合并主线8ac137c已push；实际远端两端diff仅本批控件/直接测试、锁及两份证据文档。mode-service165项、来源专项及typecheck通过，旧文档脏稿已保护并恢复。Native缺源实际Service及相关18项通过，基线3011c7e复现7个既有失败，不修改已验收统计迁就旧例。当前把8ac137c按普通merge收进现有cloud-management，以现有Integration-Source声明验证所属控件提交，不新建分支/工作树、不放宽路径检查；源码集成不等于安装/部署/实机通过。

普通合并已完成内容核对：仅PROJECT_MASTER与TASK_BOARD顶部各一处独立追加冲突，双方正文均保留；产品源码无冲突且保留所属控件提交原样，不用合并阶段再重写实现。本次集成源码Matched、无新增Extra；控件既有同内容测试/截图复用，受控实机仍Missing。后续在同一PR284声明8ac137c为直接merge父提交，保留源PR285供追溯，不另开集成PR。

集成CI38877911812：scope/console/release-config通过，contracts在shared-access.test.mjs失败；旧测试将完整控件源码装入data URL，新增真实相对依赖后不能解析。仅将该契约测试改为实际文件URL导入，保留全部V1/V2断言，运行本文件及diff，不改产品代码/协议/版本或回退依赖。Native最终源码7b704fe已本地提交；远端push被权限审核明确拒绝，已向PO集中请求准确提交推送及后续交付范围，不代推绕过。

该实际模块加载回归已通过：共享配额/Bridge、10个旧提醒黄金用例及跨端canonical/完整身份/非法字段/异步摘要断言均PASS；修改仅测试加载方式和既有状态记录，Matched，无产品行为改动。其余未变代码证据复用，CI按本次最终集成SHA继续。

集中集成状态：已fetch远端并在现有cloud-management普通合入origin/master，50fde005df10a6ada424d19f8ce4d33721d5e998已推送；三个文档顶部独立记录冲突均保留双方内容。唯一旧application-accounts能力夹具差异先保存stash恢复快照，合并后与快照完整文件相同，无内容丢失；未跟踪产物保留。未创建分支或工作树。PR284为整批草稿，不合并/部署；精确head的App Runtime CI38871880415 changes/console/contracts-worker/gate全部success，含完整契约与Worker测试/typecheck/dry-run；Guardian Integration38871880378 success。能力/协议源码证据可复用，不将CI通过冒充两端实际消费者完成。附件绑定因已有100项上限失败，PR本身成功，未删旧附件。

实际消费者审查更新（两端仍活跃实施，非实机通过）：Native已修复按active列表修剪Confirmed及repeat/新entry同时发生的基线问题；控件grantKey已包含dateKey，避免跨日沿用。真实控件首链与真实C# Service各自隔离回放已取得，见下方证据，尚未完成已安装两端互通，不以契约/CI通过覆盖。

Native真实生产Dispatcher→RuntimeServiceCoordinator回放已通过，根独立以公共1.54验证器核对26条请求、24份State、16份ownership ACK及2份执行许可，全部有效；包含pending-entry不计秒、ACTIVE心跳后60秒repeat、主动结束request-normal-close/取消及重复ACK、超时force-close/completed。回放发现并修复心跳前Poll先产生超时许可却未交付的问题；相关Service接线与边界7项通过。此为合成数据库与动态lease/round的实际C#路由证据，不是TS替身，但仍不等于已安装Native与真实Chrome互通，也不证明原生窗口前台或人工输入已通过；Agent专项、生产心跳JSON和整链关闭验证继续。

接收边界聚焦补验：保留Native实际BuildNativeControlStatus/heartbeat生产者生成的三份合成载荷（无结果、terminated、exit_unconfirmed），加入既有program-instances心跳测试；仅将测试分配/配置版本对齐隔离数据库，真实HTTP路由→持久化→读取核对不重新手造报告结构。仅修改该直接测试和夹具，运行此专项及typecheck/diff检查，不访问生产、不变更协议或原账。

该补验已通过：Native生产者冻结载荷/既有隔离拒绝用例2/2（其余39未跑），backend typecheck通过。Native并行复跑更新了随机resultId，根对比除各轮生成的32位hex结果ID外全部字段一致，未将随机ID变化误判协议变化。控件消费实际C#载荷发现Host能力与云端机器能力混淆、执行ACK多outcome及GET省略State的三处真实兼容缺口，正在所属会话集中修正；公共1.54包保持不可变，不以先前子验证器通过推断实际控件全响应可用。响应静态类型尚需最终集中补齐stage/ACK含义，不逐字段发包。

公共响应类型收口：native-host.ts只补齐已实际存在的sharedQuotaStage=shared及执行ACK的outcome可选兼容字段；V2实际消费者仍要求outcome存在且匹配本次结果，不能用可选类型放松V2校验。仅静态声明修正，不新增消息/能力/运行行为；build验证，固定1.54开发包不覆盖、不因本项单独打包，最终集中产物另行固定。

整链隔离证据更新：控件默认生产工厂unpacked通过首次进入、合并repeat、正常关闭取消及Composite pending超时实际CDP关闭，未注入执行上下文、未直接写原账。根核对69条请求、38份State、29份ownership及4份执行许可均符合1.54，动作ACK顺序canceled/completed；该浏览器场景Service仍为加速时钟的契约替身，ACK wrapper不能代替原始Host。另控件已将真实C#25条sharedQuota响应送入生产Native client全部通过，补齐该外层兼容证据；启动失败仅为fixture漏识别无channel的兼容V1 probe，产品探针未修改。Native正式管道/手输控件/回执相关13项通过，原生真实全屏前台及已安装双方互通尚未验收。

本次4文件提交核对：响应静态声明及Native实际心跳回归Matched，无Deviated或未批准Extra；contract build、2项直接Worker回归及backend typecheck/diff通过，无产品UI变更。整批Windows实机联调仍Missing，不因本次测试提交通过而移入完成；既有1.54产物、无关tgz/.wrangler及恢复stash均不改。

控件首链已有真实unpacked通过证据：实际background/ModeService/ModeEffects/V2协调器/Content手动输入，pending-entry→ownership→State→visibleACK→continue→Rest→原计时ACTIVE→active；没有直接写原账夹具。此前无弹层是夹具customStudyList未清，而非产品错判；进入后一次旧断言错读config.mode，改读真实模式会话后通过。根独立将实际生成message-replay的6条请求、4份State、2份ownership回执交给公共1.54验证器全部通过。Service仍为集中TS隔离状态机、未用Native运输，此证据不等于真实Windows联验；Native真实Service/Dispatcher回放已在运行。默认V2执行器旧上下文缺口、跨日grant已修源码，后续repeat/正常取消/超时强制及默认生产工厂回归仍待完成。

PO已答复本轮纳入共享，不再待澄清。本次按三个整链批次连续实施，不逐零件制包：①配置/管理对象与对称统计读取、独立配额核算接线；②统一提醒及独立/共享实际执行和结果回报；③一次集成、匹配候选及Windows受控联调验收。先使用隔离数据和自有替身，不改变真实家庭配置或自动启动安装、部署/共享启用。新配置执行按最新自主度决定，不能复用过时提醒/借用规则冒充一致。

| 调用链／实施核对项 | 负责人 | 当前状态／最小证据 |
| --- | --- | --- |
| 已验收原账→统计→上传→页面 | Native＋云端 | 基线保留，不重复重构或制包 |
| 新对象配置→现有安全执行目标、优先级与撤销 | Native；架构核契约 | 已证实blocked/dailyQuota缺生产消费者，先补整链隔离回归 |
| 本机最新＋cloud-other；异域peer/cloud/LKG互斥 | Native＋控件；云端提供同分域读取 | 复核1.39既有消费者对1.50固定身份统计的接线，不另建贡献账或混合basis |
| 同一配置→独立配额→最新自主度/时间段/停用/黑名单判断 | 架构＋Native＋控件 | 新旧配置兼容及未确定优先级先对照，不削弱旧封锁，不改原账 |
| 提醒可见、正常结束可取消、超时强制、未送达及重启去重 | Native＋控件 | 复用Presenter/Closer及已有隔离证据，缺真实链路项明确补齐 |
| 云端配置与结果回报、真实同孩子当日全链验收 | 云端＋两端 | 源码/测试/部署/安装/实机分别登记；共享保持关闭至受控验收和明确启用 |

本批首项云端验证：在既有source-statistics专项复用Native实际生成的fixed/zero脱敏冻结载荷，验证新算法进入共享分域读取、有效部分保留/未知不充零、零用量可与未知区分及精确自身来源排除。仅修改该直接测试与既有记录，运行该单文件和backend typecheck；不重跑原账上传全链、不访问生产、不新增存储或发布。公共共享策略V1仍缺最新版自主度且包含旧借用逻辑，已交两端核对现行字段，待集中修订一个版本，不以本项读取测试冒称共享执行已完成。

首项回归结果：source-statistics单文件8/8、backend typecheck通过，新增两项直接消费Native真实生成fixed部分/zero合成载荷；保留有效3秒和不完整原因，nonSpecial未知不伪零，完整零可读，来源排除精确，不需要原账。仅新增测试，云端产品代码未因此改变。另已直接核验控件会话PO《休息超额设置与说明精简》原文及根既有对应条款，确认仅每日/每周休息可设超额，其余四类有效无限（总确认关闭则全部到线阻断）；已纠正顶部旧六项表述并同步Native，公共新契约不得继承过期语义。

复用2.6.58原账/统计/上传/云端/页面的已验收基线，不重复开发或发包。先核对Windows独立应用管理配置→Service/Agent执行→结果回报及提醒、安全边界的真实缺口；只评估，不改真实策略或触发终止/锁屏/重启。已通知既有Native会话给出集中缺口表，当前架构负责契约与云端实际接线核对。Mac开发迁移在Windows功能闭环之后，不同时推进两套未验证方案。

上述范围澄清已完成：PO明确本轮包含共享，Windows贯通后再迁移Mac；真实共享启用仍需受控验收。新旧应用配置冲突也已裁决为明确新配置优先、缺省继承旧配置，已通知Native实施。

本轮新增进展：Native已接固定身份统计到真实分域入口，49项隔离回归通过（尚未提交或安装）；公共契约新增projectIndependentSharedQuotaSeconds，新路径复合/未归类不借娱乐、网页已有桶不变，旧入口保持旧语义。契约build与source-statistics专项通过，覆盖1200秒、特殊/other排除、缺源未知、重复读取、更正下降和孩子隔离。新函数尚待新版策略及两端消费者接入，不能据此宣称共享执行通过。

统一策略V2源码已补入现有shared-access.ts，直接投影现行forcedUsePolicyV1、自主度及停用配置，默认legacy；V1保持原含义。新增协议语义断言与原共享专项通过，但新增V2后的两次build均报七天时段空对象类型断言TS2352，已改为七天明确字面量，尚待最终源码编译复验，未打包/分发。行为专项使用当次tsc已生成JS，只证明语义断言，不替代最终源码build。云端真实路由/能力协商、后台自动调用和两端执行仍待接线。

类型修正后的最终源码build已通过，重新生成产物后的shared-access与source-statistics专项均通过；前两次失败保留为开发记录，不再是当前阻塞。V2字段已交Native/控件核对，确认可复用，online/domain仍网页专属；尚未发布契约包或部署，云端能力协商与真实执行消费者继续接线。

V2真实云端下发源码已接：机器shared-access-policy显式schemaVersion=2、设备/device/shared-access/v2；旧请求保持V1，同profiles.config和rollout/执行开关。设备路由专项、Runtime source-statistics9/9、Guardian和Runtime typecheck、diff检查通过。契约1.51.0仅生成本地开发包，SHA256 71e17887912422e51fddbe381674b21bd8ea98e73ac995390162260b18b248bf，已交两端继续真正额度/提醒/限制消费者；未发布注册表、部署、制终端候选或启共享。Native实际目标执行已有75项相关隔离证据，控件后台只读启动/改绑/跨周专项已通过；实机均待集中验收。

提交前一致性：本批配置/统计读取契约及鉴权入口Matched，真实后台执行、提醒协调、结果云端回报和实机仍Missing，不作为本契约阶段通过项。无额外原账、上传或生产变更。仅提交本批16文件（含既有文档连续状态）；application-accounts旧测试修订和未跟踪产物保持原状。该源码提交供两端记录1.51来源，不代表Windows完整交付或发布。

运行协议V2集中接线依据：取消sender累计，Service单调OR为唯一提醒调度钟；活动携带完整policyIdentity、稳定ruleScopeKey、白名单原因、当前lease/seq及已本地撤销独立round。State带Service累计/确认基线，新增进入原因不重置已有间隔；主动结束正常关闭，超时单独判断，未可见不算超时。严格活动/状态/回执/执行消息验证和共享可见状态机适配、序号去重、租约过期/boot恢复、不补离线已通过契约build及生命周期专项；旧V1黄金用例保持通过，双方typecheck通过。

Runtime机器策略现仅对明确报告shared-access-policy-v2的机器返回该能力，改变ETag而不改配置版本，也不声明新runtime已完成；定点真实路由专项1/1（其余74未跑）和backend typecheck通过。1.52运行协议开发包已固定SHA256 9a3502e4768d6439f6875ed8dacbe5a6d7fad1760eae55d9414bdb1a7bef65f0，待两端接实际调度/执行，并非终端候选。统计来源缺失无缓存时的实际访问容错有一项PO问题待答，不阻塞其余代码；当前生产共享仍关闭。

消费者复核补齐：V2 State查询显式{schemaVersion:2,date}，正常娱乐进入使用restrictedEntry真实原因（仅此不推进强行使用钟）。新身份动作状态复用现有心跳programInstancePolicy/JSON存储schema2，按真实Native结果DTO区分terminated/failed/exit_unconfirmed；无结果null，不虚构采纳成功。设备状态函数增加相应文案，无布局/HTML/CSS改动。真实心跳定点新旧报告2/2、能力协商1/1、页面函数专项、契约build/运行/机器状态专项/包兼容及backend typecheck通过；38/74无关测试跳过。首次包兼容检查因1.50旧字面量失败，同步1.53版本后通过，未隐藏首轮失败。

1.53集中开发包SHA256 6b6b087da08336cab4aa747544e9ceed3191d35aab31eea849eed11cd5336925，待两端实际运行消费者与状态上传接线；不作为终端候选或生产上线。源码/契约范围Matched，真实提醒/结束/硬限制及完整Windows联调仍Missing。保留application-accounts原有未提交改动，未动原账/配置/生产。Native/控件当前均为活跃实施，Mac迁移未开始。

真实入口复核补丁（1.54）：首次确认尚无ACTIVE，V2新增pending-entry保持可呈现/原因/scope而不计时；新V2统一文字确认固定可见60秒后结束当前访问，拒绝timeoutAction=continue及timeout_continue，保持V1旧兼容。该行为来自既有10/16决定和控件实际实现，不是新裁决。契约build、生命周期/V1黄金及包兼容通过；机器V2配置下发返回前重验分配/机器鉴权，请求期间改绑返回409，9项来源/配置专项及backend typecheck通过。控件交接已通过本地撤销/缺ACK不交接/迟到回执专项，真实隔离弹层目视验证进行中。

1.54开发契约SHA256 a577c0f61cdea9b1da75c5d8a9be0e33f3c9c5ad8c85d1d0a96b42cffaf57b2d。本批源码接线Matched；尚未用安装包/生产状态宣称真实通过，完整Windows执行验收继续，未知来源无缓存行为仍等PO决定。

固定已安装3011c7e导出核实核心断点：RuntimeServiceCoordinator.ApplicationObjects.cs:25的ReadNativeTargetConfigurationAsync仅有定义，注释明确blocked/quota本批不启动；NativeApplicationManagementApi中的dailyQuotaMinutes只有校验，尚无生产执行消费者。旧product/instance黑名单路径不能充当新NativeId对象执行验收。下一批应集中贯通新对象配置→可核验目标→现有Service/Agent执行→结果回报，先核清新旧配置优先级和撤销语义，保持既有阻止键、不把NativeId塞进productId；原账/统计保持不变。独立额度及提醒不能以打开shared gate代替接线；锁屏/休眠/完整重启仍需安排受控实测，不自动打断用户。当前是实际断点核对及设计接线，尚未改产品或制包。

## COMPLETED：本轮Windows原账→本机统计→上传→云端→真实页面贯通（2026-10-16）

最终证据审计（不外推Mac/共享/延期系统场景）：

| 要求 | 权威证据与结论 |
| --- | --- |
| 固定原账身份、Child归属、整数秒及本地统计 | 既有Native2.6.57原账/本地统计验收交接保持有效；新2.6.58采样新账身份与hash有效；本批不改原账生成。Matched |
| 本机统计使用同一份上传值 | fixed-statistics-audit-3：revision295，14630秒/15身份，同截止总量/小时/分类/名称及manifest/rows/chunk hash逐项相等，received ACK无错误。Matched |
| 生产云端及页面实际采用 | pipe-snapshot-current与独立站真实HTTP200：同截止1792130950464、14815秒/15身份，4项日分类/24小时/全部身份名称时长精确相同；主站亦实测采用同fixed读取分支。Matched |
| 孩子归集不误判单用户总量 | 全孩子与William差额4825秒已用AdminXW筛选真实核实；不跨用户误比、不重复实例账。Matched |
| 代码、产物、部署对应 | Native3011c7e干净导出638文件、唯一内部候选2.6.58及11组件核验；精确TRX56/56通过。PR283合入43a0bcc，生产38857287672 success，Runtime52da05f0及唯一0024。Matched |
| 安装及边界 | 实际2.6.58.0 Running，安装exit0/备份及首次18表保留检查通过；当前指定配置多次与备份相同。Guardian/两套Pages/R2 latest与前一生产manifest一致，未启共享。Matched（保留以下历史缺证，不称最终数据库复核执行过） |

独立遗留：14:06配置比较瞬变未保存当时内容，子字段及原因无法恢复，不能称根因已修复；首次18表检查不冒充之后未执行的数据库复核。错误旧账仍按已批准边界排除、不追修；Mac、共享、真实锁屏/休眠/完整重启仍在所属后续任务，不自动启用或伪报通过。本轮最终状态文档保持本地修改，产品代码已按上述固定提交集成/发布，不为登记额外创建分支、候选或部署。

配置对比专项收尾：PO授权一次只读UAC后，同一受限进程多次比较升级前备份与当前policy，三项appPolicies/sharedQuota/sharedQuotaPolicy均相等，机器策略版本392→392；appPolicies有序规范hash相同，另外两项双方均缺失，读取稳定、差异为空。只读结果completed=true，管理员PID48808已结束，没有改配置/数据库/ACL/服务或重装。失败报表14:06:08之后，缓存于14:09:10更新，因此不能用当前相等否认当时差异。现有正常缓存代码仅写typed MachinePolicy，结合此边界可将当时差异缩小到appPolicies，但子字段和变化原因没有失败瞬间快照可还原；能力投影、数组排序等只属可能性，不登记为已证实根因。保留为历史诊断证据缺口，不继续反复UAC或推测修复；当前配置一致核对通过，与历史瞬变未解释分开记录。统计端云同截止14815秒、15身份、24小时、4分类的实测通过结论不变。锁屏/休眠/完整重启、Mac及共享仍按既定边界单列，不外推通过。

PO批准的一次只读诊断已执行exit0：最终报错为verify-preservation.py第15行管理策略相等断言，比较appPolicies/sharedQuota/sharedQuotaPolicy三项，至少一项不同；凭据/HMAC、分配一致及策略版本不回退的前置断言已通过。日志未记录实际key或差异内容，没有其他既有脱敏差异证据，不能推定正常同步。失败在数据库连接前，旧18表报告时间14:03:52，仅证明首次保留核验，不能替代最终复核。此次只读既有日志和审计产物，未扩读配置/数据库、改权限或再次弹窗。后续如继续定位，需明确读取升级前备份policy与当前policy的三项配置并脱敏比较；尚未执行。端云14815秒同截止一致保持有效，配置保留终检仍未通过。

最新实机精确对照通过：普通用户固定查询14815秒、15身份、截止1792130950464；独立站同机器/William真实HTTP200在正常上传后返回完全相同截止和14815秒。根将本机捕获的全部NativeId/名称/秒数、4项日分类及24小时输入与真实响应程序比较，均true，instances为空。8秒差额已自然同步消除，不是传输故障。正常日统计到生产读取及真实页面已贯通；仍有旧错误原账排除导致complete=false，原因如实保留，不修改旧账。最终二次保留复核失败日志仍需查清，本项不被统计一致结论掩盖，不宣称本轮全部验收完成。

PO重新授权后，第二次UAC成功，2.6.58.0安装exit0、11组件核验、Service Running；首次备份及安装后保留核验通过，根独立读取安装结果与实际版本一致。第三轮只读统计核对：今日revision295，同截止1792130630642，本机14630秒/15应用与冻结清单的总量、小时、身份及名称、分类、完整性原因完全一致，三层hash有效，outbox received无错误；升级后采样新原账1条身份及hash有效。前两轮审计失败为脚本错误假定只有一个受保护用户，精确按当前用户筛选后通过，未改产品。

独立站实机通过原登录标签正常启动，筛选当前Windows机器/William后HTTP200：15身份、14807秒、截止1792130807861，名称/分类正常；相对上一固定本机快照仅后续ChatGPT.exe切片及对应日/小时/历史未知增加177秒。孩子汇总4825秒差额已由AdminXW筛选真实核实（2应用、4825秒、截止1792104912648），不是William重复累计；Game范围没有有效统计，明确非零不可得而非假零。随后普通用户新本机快照固定14815秒、截止1792130950464，尚需等正常上传周期后做同截止核对，不能用8秒不同截止差异宣告错误或完成。首次安装后18表保留检查通过；最终二次保留复核失败日志仍待读取，不覆盖其失败状态。

真实主站响应已采用fixed分支（instances=[]，新应用名称及分类出现），但孩子全来源汇总19455秒不同于当前用户14630秒，尚需按来源解释4825秒差额；不把两种范围直接比较，也不把兼容model名program-instance-v1误判旧算法。独立站通过原登录标签启动入口成功进入，登录及读取正常，独立应用页待核对。管理员助手结束后的最终保留复核失败RuntimeException，具体日志受保护待读；首次通过不能替代最终复核。尚不宣称全项验收完成，不重装或改原账。

安装阻塞已明确：Native原始exec session27088返回exit1，Start-Process -Verb RunAs报“操作已被用户取消”；PID18920已退出且没有安装完成结果。根会话再次只读核对已安装仍2.6.57.0、Service Running。不能再称等待同一次UAC，也不能称2.6.58已安装；不自动重弹、不重建候选。云端已发布状态不变，待PO重新明确要求启动UAC后继续安装与当日端云实测。

集中授权已执行云端部分：PR283合入master `43a0bcc14938fcb7de27021419c4d374281ecfae`，精确主线CI38857144744及production38857287672成功。仅Runtime Worker更新为`52da05f0-1232-419f-8091-4b09f2769113`，仅应用0024。对照上一生产manifest，Guardian、两套Pages及R2 latest完全未变，shared preparation=false。以下未发布/待授权记录均为当时过程，不代表当前状态。

Native唯一候选2.6.58来自固定3011c7e干净导出，根会话独立核验EXE SHA256 `a30db1ffa2917528fcefa41ff0eacd27c7ec3edc28e0e27c3153b097a73a18d1`及MSI `283fdce0b5ce9f981e3fe95f703c75c4c12b1ea8c5dc11823d9ae251d819534e`。已通知既有Native会话作为唯一安装执行者，保护备份后启动一次UAC；尚未取得安装完成及新生产者端云实测结果，不宣称全链路通过。共享仍不参与本版。

主线43a0bcc Runtime CI38857144744通过后，已按PO本次集中授权启动production38857287672，所有输入显式限定Runtime Worker=true、0024唯一预期迁移及apply=true；Runtime/Main Pages、Guardian、bootstrap/shared preparation均false。production环境审核由执行者完成，不重复产品确认。尚在执行，不能记为发布成功。Native3011c7e已快进push现有main，唯一2.6.58候选从干净archive构建中；云端就绪前不启动安装。

PO已明确批准集中发布、候选安装与实机验收：PR283合并、仅Runtime Worker、仅0024、一个最终Windows内部候选；UAC由PO确认。原账/配对/配置/outbox保留，不部署Guardian/Pages、不清数据、不改R2、不启共享。PR283已以精确头合并，master=43a0bcc14938fcb7de27021419c4d374281ecfae，正在观察主线自动CI供既有生产工作流精确SHA检查。Native已收到3011c7e唯一候选构建与核验任务，待云端就绪后才启动安装，不重复授权或逐零件制包。

精确远端头8b556abf342183730901a5df63448ec28d7bac3c的Runtime CI38823431928已通过：changes/console/contracts-worker/app-runtime-gate全部success，包含完整契约测试、Worker336项、边界/typecheck/dry-run；不再有该轮能力预期失败。Native固定3011c7e及56项/干净编译证据已核验。剩余为已发出的集中生产授权、PR合并、仅Runtime Worker+0024、单一最终Native候选及安装后真实当日端云对照。未收到授权前不执行，未上线或安装，不宣称全链路完成；共享仍不参与本版。

Native已集中本地提交3011c7eb323de8b00fc599317ade6dd9be8c8d1d，33路径；直接核对契约锁1.50/source b0aebe9及15a4ff包hash，638个跟踪文件与干净验证导出一致、29个其他脏文件不变。该提交未推送/制包/安装。云端第二轮CI产品链路87项全部通过，336项仅两项能力响应旧预期失败；追加新算法/能力到原Windows/macOS精确预期后2/2通过，同一PR新增测试及设计提交8b556abf342183730901a5df63448ec28d7bac3c。为不移动脏工作区，使用临时Git索引基于远端头仅提交这两文件；未新建分支或工作树，也未改本地原索引/HEAD。新头CI待观察；集中生产授权仍待用户答复，不重复申请。

PR283首次CI在changes职责检查失败：相对最新master ddb5e72的两点diff错误纳入主线已有扩展文件，并非产品测试失败。通过GitHub更新现有PR分支同步master，远端头2ddf2bd1f9f747bc0c0b1539f1ed766560d37f5a；复核相对master仅本批17文件，app-runtime-management子树与已测b0aebe9完全相同，未放宽检查、未新增分支或改本地脏文件。新的精确头CI待观察。Native干净导出1.50源码编译及56项通过，正在集中提交33明确路径。

云端集中提交b0aebe922605c3805c41f052a9c24ea3b9b80e5e已推送既有codex/cloud-management，PR#283进入相关CI；仅17个明确契约/云端/测试/设计文件，根文档等既有未提交内容保留。87/87、页面适配11/11、契约、typecheck和dry-run通过。PR附件工具因本聊天附件超过100项拒绝绑定，PR本身已成功创建，不删旧附件或额外治理清理。Native最终56项通过，正将30个本地统计前置明确路径及必要测试csproj/契约锁/tgz共33路径集中成可干净构建提交；其他草稿不合入。

跨仓实际生成载荷重放通过：Native交付fixed-identity-generator-wire（3秒partial，29行，hash9e24fb29…）及fixed-identity-zero-wire（0秒complete，26行，hash8569ca8c…），均来自实际日生成/SQLite冻结代码；前者另捕获真实Uploader HTTP请求。两份脱敏合成证据保存在backend/test/application-fixed-*-native-generated.json。Worker真实begin/chunk/commit→发布→页面读取器→生产AppRuntimeTime适配器2/2通过；全部日、小时、分类、应用行与发送载荷逐项相等，ApplicationUsage及原manifestHash保留。只映射鉴权测试外壳短user为合法64字符，不改清单、统计或hash。追加全行比较时首次因JSON属性顺序排序不同失败，使用共同canonical排序后通过，未修改任何产品算法或捕获值。

此为跨仓隔离调用链证据，不是现装2.6.57已切上传或生产已采用。当前仍需集中提交、发布范围确认及最终一次安装后实机核对；共享不参与本版完成条件。Native另报55项聚焦通过、旧v3基线7项失败在修改前同样存在，具体范围待固定交付，不称全绿。

读取反查已核对独立Runtime实际请求/v2/module/program-instance-usage及主站Guardian getApplicationIdentityUsage均到同一读取器；生产AppRuntimeTime.applicationIdentityView直接消费新返回值的回归通过，部分总量保持null、available有效秒保留，名称/管理target不丢失。新统计不提供程序实例明细，instances为空，不把应用身份重复伪装成实例。backend typecheck通过；两份现有依赖锁与1.50版本同步，不安装新依赖。

当前唯一1.50开发包在本机Temp，SHA256=15a4ffb0d428f95a1d8443a6bc4ac66c1f30c8d1ccecb52cf13276cbc7111c33，已交Native做实际生成载荷互操作；此前420c包作废。不包含真实家庭数据，不上传。Native回报32项聚焦通过、仍在执行捕获载荷验证；尚未取得该载荷，不把所属会话的测试摘要当端云实机证据。

补齐来源切换防回退：account+child+machine+localUser+assignment范围内已有received新算法后，旧begin/commit/发布均返回APPLICATION_STATISTICS_PRODUCER_SUPERSEDED；0024同时以既有表触发器封住并发绕过，不新增权威状态表。不同机器仍可独立升级；同NativeId跨机器保留两个管理target、总量累计。直接文件85/85及typecheck通过。契约集中升1.50.0，兼容检查通过；Native发现合法不足1秒入口无分类标签，固定算法仅零秒subject允许空标签，不造分类、不删入口，正秒与旧算法仍严格。此补充已过契约回归。

Native正在同事务日生成器→既有冻结/outbox改接和直接测试，真实生成载荷互操作尚待返回。当前仅开发验证，0024未应用生产，尚未提交或部署；此前1.50临时包420c哈希因补零秒用例作废，最终包需重算后集中锁定。

云端源码接线已完成首轮：新算法解析贯穿分块接收、commit及发布；两站共用读取入口优先采用该清单自身的总量、分类、应用身份和名称，不等待第二份投影。按machineId+nativeId保留管理目标，不按同名跨机器合并。隔离D1新格式上传→发布→页面读取入口通过，覆盖256字符带点身份、512字符名称、已知不完整51秒和更高修订降至40秒；整个直接测试文件83/83、backend typecheck通过。首次文件复验唯一失败为旧捕获响应未过滤新增能力声明，调整比较过滤后通过，原跨仓捕获数据未修改。

0024仅新增现有退旧触发器对新算法的兼容源码，不创建表或改数据，尚未生产执行。仍待补齐新权威启用后迟到旧算法不得覆盖的持久约束、Native真实生成载荷互操作、多来源隔离专项及部署安装后的实机逐维度核对；不能把本轮合成隔离通过当真实贯通。当前未提交、打包、安装或部署。

双方逐维度源码核对完成：复用 schema2 单一 manifest/chunks，不再新增独立身份投影。新算法 `application-fixed-identity-seconds-v1`、能力 `application-fixed-identity-statistics-v1`；身份原样使用本机 NativeId，日／小时分类保留本机实际输出，已知有效用量与不完整原因同时保留。契约源码已支持新算法专属256字符身份域及512字符名称，旧算法限制不变；build、usage-account直接回归、git diff --check通过。契约尚未打包、提交或部署，云端调用者尚未适配，不能宣称链路已完成。

Native已完成最小文件评估并收到源码实施交接：复用同事务日生成器及既有冻结/outbox，停用新能力范围内旧实例／产品／独立Native投影的竞争发送，不修改原账和管理阻止键。当前会话继续云端兼容与读取；生产能力未发布前新结果持久待发送，不借旧算法名发送。仅进行相关源码和聚焦测试，不安装、部署、执行生产迁移或启用共享。

## NOW：接收Native 2.6.57原账与本地统计收口；下一步先独立云端统计（2026-10-16）

已只读核对Native固定交接a2085a87f85bccd94023b58ee6cf9b1d54c986c4及所属会话真实PO指令。Windows Native原始落账、本地应用统计登记为“已完成开发及本机验收，等待最终全功能验收”，现装2.6.57.0由Native报告并留证。固定身份来自原账同行，开段与连续切片不因后续扫描改变归属；管理键、阻止键、实例算法及Child归属不变。错误旧记录仅退出本地统计，真实原账未删除。锁屏、休眠、完整Windows重启及组合实机验收延期，Mac不在本次完成结论。

接续顺序：先核对并改接“已验收本机固定身份统计→上传→云端按Child归集→页面”，再处理后续共享消费者。当前上传仍沿旧计算，本地查询已独立；不能把Native本机完成当云端已采用，不能再从名称/EXE/当前绑定重推历史身份。云端常规只消费统计，原账用于对账；跨机器保留本地身份作用域，不按同名合并。所需契约/上传差异先精确列明，不把交接当公共格式已升级。

本版仍以网页和应用分别独立工作为发布目标：共享作为后续方向，不阻塞本版、不自动启用生产。旧云端更正、删除、migration、安装及开关不由交接额外授权。交接提交仅含文档；已安装产品来自7527e4e基线加统计覆盖，产品修改尚有未提交内容，不得按a2085a8整仓制包、提交或回滚。固定文档：TimeWhereNative/agents/windows/WINDOWS-NATIVE-ACCOUNTING-COMPLETE-ARCHITECT-HANDOFF-2026-10-16.md。

## NOW：本版仅交付网页与应用各自独立工作；共享账管理延期（2026-10-16，PO确认）

- 当前发布目标：网页和应用分别具备独立落账、统计、同步、云端读取展示及本域管理执行能力；各自验收，不依赖对方或共享状态。
- 后续范围：网页与应用共享账管理、共享配额及跨来源共享提醒／限制的整体启用与验收。历史共享待办保留，但不再作为本版发布前置、阻塞或必须完成项。
- 当前应用原账修订仍由PO直接对接Native；本范围登记不扩大该任务，不把此前Chrome局部通过视作原账结构已全部对齐。网页独立工作按其现有任务继续。
- 本次只修改范围记录；不改代码、数据、家庭配置或共享开关，不安装、部署或删除既有共享实现。

## 1.7.56集中集成准备（2026-10-16）

1.7.56集中集成准备（2026-10-16，PO授权）：当前加载1.7.55，本批开发候选只递增一次为1.7.56；先版本元数据/设计/变更记录与已通过35cfed0源码集中推送现有codex/extension-local，不新树/分支或逐零件PR。中低风险版本元数据变更，复用本批四专项、typecheck和diff；新增最小manifest纯版本差异及扩展根检查，排除重复全量/E2E及云端操作。候选尚不制作：等待架构给最终合入主线SHA，再从精确源码只制作最终唯一候选、完整备份原目录后更新。共享关闭，权限/ID/metadata/storage/绑定/配置保持，不自动重载、不托管/R2。旧PROJECT_MASTER/CHANGELOG及任务板草稿不混提交。


## 共享配额桶读取简化（2026-10-16）

共享桶1.55收口（2026-10-16，源码与隔离PASS，未交付）：4项直接专项local-guardian、source-statistics-shadow、shared-access-runtime、shared-sync-diagnostics及typecheck/diff通过。网页只读现有usage完整桶，自身缓存仍由原读取器负责；已删除local.today重建、web-other前置、来源键、派生统计hash及逐日混填。桥/云/整份成功缓存互斥，可接null，缺源仅临算0并显式missing，不丢另一有效来源；600+600=1200、重复不累加、下降、身份/周期、启动协商/证明/严格接收回归通过。保留既有执行fence摘要，但排除纯读取/截止时间，避免新readAt让确认永远失效；实际桶变化仍失效。不改网页/应用原账、ACTIVE、上传、配置或共享开关。既有诊断仅补新能力/消息、桶原值和已知缺源码中文，不重排UI、不重建诊断总账。实际Native最终Dispatcher/RuntimeJson合成wire冻结tests/fixtures/native-quota-buckets-dispatcher.json，SHA256 eebd518565a27d831babb0eb85c8360c00771e460f5e7228bdd65f5046e6a4b5，生产消费者回放PASS，不是家庭现场验证。契约固定1.55.0，包SHA256 1a0e5efb60711f1e9ce7a84ec6cfa54eea4ab7048402a0cdec108c73f6c0c9db、sourceGitSha 8e6dcd3fb128ed12c7a56c354535b37c39939b43；只新增versioned vendor，不改旧1.54，锁记录同步。方案审计Matched，无未批准Extra；按集中交付授权只提交本批代码/测试/vendor/锁/设计及本任务块，保留PROJECT_MASTER/CHANGELOG等旧草稿；不push/制包/安装/重载/部署/启共享，Windows真实整链验收待后续一次集中交付。本次跨会话发送计划被工具安全审核拒绝，未绕过；精确结果保留此任务块及最终回复供架构读取。

共享配额桶读取简化（2026-10-16，PO批准、未提交实施）：以架构固定树最新决定为准。实施顺序：1）source-statistics-shadow直接从readQuotaReadModelV2.usage包装已有study/composite/rest桶，不读local.today、不额外查询web-other或依赖sourceKeys；2）新增quota-buckets-read-v1/exchangeQuotaBuckets严格V2桶协议，保留V1兼容及已就绪时序/同孩子证明；3）应用桥→云端→同孩子同周期最近成功缓存互斥整份选择，不逐日混填、不派生摘要；4）共享只加已有桶，不重新借用，缺源核算暂按0但标missing，保留另一有效来源；5）自身读取/桥/备用/缓存/600+600/重复/下降/身份周期专项、typecheck、diff。仅终端读取/消费/既有只读诊断及直接测试，契约由架构追加并最终锁版；不改原账/计时/上传/配置，不安装/制包/重载/部署/启共享，不新树。不因未发布契约停止源码验证，结果由架构读取现有工作树。


## 本机统计启动链修复（2026-10-16）

1.7.55启动链收口：PO已明确允许必要聚焦复验并集中更新。local-guardian最终PASS，完整覆盖延迟health ACK等待、首次证明准备、过期刷新、无Port冷启动、重连、真实不支持及改绑/断连，保留生产者合成回放和旧排队用例。source-statistics-shadow专项PASS，验证仅实际refresh入口准备，readSources及终检纯读、准备错误不被覆盖；typecheck/diff通过。方案Matched，仅两infra及两直接测试，不改协议/原账/Native/云端/共享开关。固定提交后唯一1.7.55候选仅两JS与manifest变化，备份核验后原路径更新、manifest最后；不重载/推送/托管，现场成功仍待实机回读。前两失败分别为旧Mac健康探针竞态及已修的已就绪连接错误等待，已按新增PO授权完成复验。

1.7.54冷启动时序修复（PO贯通授权，架构定位）：端口先建立但health ACK未返回时，source能力被提前判为unsupported；完全冷启动先取context再建立端口还会使expectedContextId失效。先文档后最小修复：复用现有health协商并等待真实结果，默认shadow在取得Native context前完成准备；内部发送复核保持纯读取，避免同队列死锁。孩子/设备在协商中变化、断连和真实不支持均明确失败，不移除context fence。验证延迟首ACK、无端口冷启动、重连、证明准备顺序及1.7.54既有回归。仅Native读取infra、source shadow默认context接线和直接测试；不新状态机/协议，不改Native/云端/计时/原账/配额/历史/共享开关；先源码与最小测试交架构审阅，不制包/重载。


## 本机exchange证明准备修复（2026-10-16）

1.7.54集中交付授权：架构已独立审阅证明准备修复，复用PO集中更新授权。只提交本批2infra、2直接测试及本任务块；专项/typecheck/diff通过，原UI未变复用目视证据，方案Matched。固定提交准备唯一1.7.54开发候选，对原1.7.53仅两infra及manifest版本字节差异，权限/ID/key/marker不变，完整备份核验后原加载目录更新、manifest最后。不推送/托管/云端部署/Native安装/启共享，不自动重载；真实读取成功仍待重载实证。其他未提交文档保持原样。

上述证明准备修复源码验证通过：local-guardian（含真实生产者合成回放、首次准备/已有证明/过期刷新/准备失败不发/改绑与断连）、shared-sync-diagnostics、typecheck、diff检查均PASS；首轮最后的断连夹具复用了已被无效时间响应关闭的连接，改独立连接后通过。队列外准备避免串行死锁，实际发送前再次检查证明期限，排队过期拒绝而不绕过。仅2个infra和2个直接测试；既有source shadow及UI证据复用，界面未改。未提交、未制包、未覆盖1.7.53或重载；等待架构独立审阅，不宣称真实读取已成功。

1.7.53真实读取后续修复（PO既有贯通授权，架构定位）：exchange已实际发送并收到SOURCE_STATISTICS_CONTEXT_CHANGED，而同孩子绑定ACK随后才建立。requestSourceStatisticsExchange遗漏现有applicationIdentityBindingEnsurer前置准备。仅在exchange发送队列外调用既有准备/续期入口，成功后重新核对孩子/设备context、Port和连接代次；准备缺失/失败/过期不发送并保留有界真实错误。直接回归覆盖首次准备、过期刷新、已有证明、准备失败、改绑及断连；保留生产者回放和原有严格校验。中风险Native读取修复，仅native-host-client/现有诊断错误白名单及直接测试，不改Native、协议、云端、记账或共享开关。先源码、相关unit、typecheck及diff，架构复核前不提交、不制包、不更新或重载。


## 本机exchange读取诊断收口（2026-10-16）

本机exchange集中收口（2026-10-16）：本批仅4个产品JS、3个直接专项及本任务记录。固定服务端错误白名单保留；实际发送、对应响应、完整接受分别记录，排队不算已发送、超时不算拒绝；备用失败不覆盖本机结果。断连保留当前身份/周期的历史请求，重启无内存attempt时连接归属显示未知。local-guardian最终复验PASS（含C#生产者合成报文回放及排队断言），source-statistics-shadow与shared-sync-diagnostics已通过，typecheck通过；既有隔离桌面/窄屏截图经架构目视Matched。方案审计Matched：不改账本/选择顺序/权限/协议/Native/共享开关。按PO集中更新授权，本批提交后只制作唯一1.7.53开发候选，严格限定4JS及manifest版本差异，备份原目录后manifest最后更新；不推送/托管/云端部署/自动重载。真实本机exchange是否成功仍待一次重载后实证，不以合成回放替代。

PO批准恢复最小贯通实施：Native固定SOURCE_STATISTICS错误白名单原码透传；本机attempt以实际postMessage/相关响应/完整接收校验记录sent/responseReceived/accepted，排队非已发、超时非明确拒绝。沿现有source报告独立保存本机结果及当前scope/周期/连接代次，云端备用不覆盖；只读摘要不展示ChildID/派生指纹/路径/凭据，旧连接结果不得标成当前。不改Native优先/云端备用选择、统计/配额/原账/上传/计时/权限或共享开关。仅相关三组unit、typecheck、diff及诊断隔离目视；先集中源码验证，不提交/推送/托管或逐件制包，不自动重载。


## 强行使用提醒原因与用量展示（2026-10-16，开发包完成）
## NOW：Windows共享消费者接续（2026-10-16，源码与隔离验证）

确证兼容修复（架构已批准，先测试不交付）：Native Dispatcher真实成功exchange省略可选stage，控件错误必填shadow导致合法应用统计必拒；仅去掉取数分支stage依赖，保留请求/Port/context/child/range/秒snapshot校验，不改共享执行。使用Native生产Dispatcher+RuntimeJson合成报文回放，覆盖身份/范围/请求/连接负例。同步修两个已证观测缺陷：无应用snapshot时仍显示可与当前scope/period读取批次关联的report错误；允许两种应用读取messageType及exchange准确显示。不新增状态/协议/采样，不制包/提交/覆盖/重载，不触及原账。

本批验证通过：实际2.6.59候选DLL的Dispatcher+RuntimeJson生产者合成probe/exchange报文经生产Native客户端回放，旧必填stage条件确实拒收同一成功响应，新条件接受；错child/date/单位拒收，错requestId不消费正确ACK，断连拒收，读取不启用共享。local-guardian、shared-sync-diagnostics专项、typecheck及diff通过。纯合成生产者JSON原样冻结tests/fixtures/native-source-statistics-dispatcher.json，SHA256 4cf036bab0c4588b11a4c0de387d023be96363ba876944403698035a789492b3；专项默认执行回放，环境变量仅可额外替换资料，不再默默跳过。诊断空snapshot错误需同scope/period并有同批次现存来源readAt锚定，防止跨绑定/旧报告串用；请求名不再把identity/seconds/exchange二次压成unknown。架构批准仅提交本批并准备1.7.52，须与1.7.51严格两产品文件及版本差异；暂不覆盖/重载或推送，真实终端exchange成功仍待验证，不以合成回放冒报。

观测隐私收窄：不展示/导出ChildID及其SHA256，不新增识别字段；仅保留已有内部scope核验结果及真实绑定状态布尔/枚举，实时peer身份缺实证显示未知。最终以此边界为准，不增加持久状态或跨会话传输。

观测修复已完成源码验证：仅shared-sync-diagnostics infra/view及原专项，读取已有V2策略/来源缓存并验证scope、日期、8天有效期；权限读取异常保留未知，其余观测不被抹去。无ChildID/指纹/凭据/路径输出，来源日期原值只读、周合计不重算、当前peer核验不由Native历史缓存推断。专项覆盖隐私/改绑/跨日周/权限异常/消息发送者/既有UI生命周期，通过；typecheck及diff通过。隔离真实Admin CSS+renderer桌面1280/窄屏390无溢出、中文原因已目视（合成数据，不是真实运行诊断）。旧专项夹具新增Native常量/Port/身份接口依赖已补齐，产品Native模块未修改。架构已复核并批准仅提交本批3文件及任务块、生成1.7.51开发候选，需证明对原3ad候选仅两诊断文件与版本差异，不推送/覆盖/重载或发布；当前已重载1.7.50尚不含新诊断。

D-114关闭原账补证最终PASS：既有shared-forced-use-v2-unpacked定点1/1通过（K5hYGE）。正常取消前后原账均3段，目标无新增；force前4段、后5段，唯一目标新增段1792144232440→1792144235483、3秒（既有floor取整）、自然transition_complete，旧段逐项不变、正秒区间无重叠，见证标签仍开。补齐真实active回执后再推进Service模拟时钟，消除测试竞态，不修改计时。脱敏message-replay.json SHA256 b344a8fad6dcd05cfcb95574f027922f516b26b0d5653dbedfcfb36582e7df85。仅提交测试及本批证据记录；候选仍为精确3ad源码1.7.50/原哈希，无重建、覆盖、重载或新增权限已获授权的声明。

D-114受控关闭补证：仅扩展既有shared-forced-use-v2-unpacked场景，增加原始分段只读前后快照、正常取消不产生tab_close、目标ACTIVE经自然onRemoved结算一次、旧分段不变/不重叠及旁路标签保留断言。为取得正秒原账，Composite先实际确认并恢复ACTIVE，再等待既有短时真实采样后触发复提醒超时；Service加速仅用于提醒，不代替网页计时。不改产品源码/采样/ledger，不重打包或覆盖原Profile；实证失败保持待验。

补证两轮尚未通过：正常取消及旧段未改断言通过，force真实关闭后已有自然tabActivated先结算2秒transition_complete，三条旧段不变，新段start与前段end一致；随后onRemoved不重复关账。测试写死必须新增tab_close导致失败，已将隔离原账快照回报架构裁决自然事件顺序，不改产品或伪造事件，不提交失败测试。

架构已核验并确认自然activation先结算符合D-114，不要求onRemoved独占；本次仅修测试断言，目标新增单段须起点等于关闭前session.startTime，秒数遵循既有取整，旧段不变、无重叠重复、旁路标签保持。批准同场景定点复验，产品源码和3ad候选不变。

受控验收准备：按架构转达PO授权从精确master 3adcad36b51f8fcf08285350f0a4ff26f255fdd5导出干净源码生成唯一1.7.50开发候选，不改正式manifest或托管；保持既有公开key/ID，仅为真实关闭验收增加debugger及sharedBrowserCloseDevelopment开发标记。家庭配置不打包、不更改，原目录更新时点由架构协调；本步骤只生成哈希/权限差异及备份计划，不覆盖当前加载目录或重载。

候选结果：dist/shared-v2-development-1.7.50-3adcad3/candidate/package-extension共203文件；按相对路径排序的[path,fileSHA256]数组JSON再SHA256为a8dac1e6bdbc5aaa82479961bce7b1b126f4690c913a015066371d5cb0ae0da6。除manifest/开发marker外逐文件等于精确Git导出；稳定ID/公开key/host权限不变，仅新增debugger，无CRX/feed。原包磁盘仍1.7.48，未覆盖/重载。D-114门禁保留：精确target及取消已有单测/隔离浏览器证据；本次真实原账守恒、原Profile新增权限确认、非测试标签不受影响仍待受控验收，不以源码diff代替通过。备份计划为同dist完整旧包备份并核hash后manifest最后替换，等待架构统一时点。

PO缺源裁决追加：同孩子周期无可信共享缓存时，保留本机已知用量作为下界，未知不补零；有适用额度也不因缺源单独阻断，已知用量到最终硬上限仍阻断，黑名单/停用/对象限制优先。仅共享V2判定允许逐项缺失，旧路径保持严格；来源投影保留可读本机分量与不完整标志。最小验证为实际mode-service及共享runtime专项；随后普通merge主线解决PR范围反向diff，不改账本。

最终结果：集中1.54.0固定包与生产消费者接线完成；source-statistics-shadow、local-guardian（25条真实C#响应回放）、shared-access-runtime/integration/policy-reader、forced-use-prompt、shared-reminder-lifecycle/content-bridge、shared-browser-activity/executor、163项mode-service、typecheck、扩展根及diff检查通过。真实隔离扩展VPS6Ud通过首访问pending-entry到ACTIVE、合并复提醒、正常关闭取消及Composite超时强制关闭，使用契约状态机与加速时钟，不冒充真实Native联通或计时精度验收。最终桌面/窄屏DOM截图已核对，文字、原因合并、手动输入及布局Matched；同规则跨标签、跨日/异规则/新增原因隔离专项通过。没有已知Deviated/Extra；待验为真实Chrome↔Native双端端到端、有限配额缺源无缓存策略裁决。未改原始计时/账本/聚合/上传，不更新候选、重载或启用生产共享。本批按架构交接整包提交，其他历史文档脏改保留。

隔离真实扩展完整入口、合并复提醒、默认关闭执行链及Composite待确认超时专项已通过（VPS6Ud）；复用该产物，不重复运行未改代码。真实C#回放启动阻塞已定位为夹具漏识别不带channel的兼容V1健康探针，仅修正测试分派后验证真实响应兼容，不调整产品探针或记账行为。

收口验证补同规则跨标签沿用、不同规则及跨日失效的协调器断言；浏览器状态机替身ACK补齐outcome字段，真实Native外层兼容由25条C#响应通过生产客户端回放证明，不将替身等同实机联通。

运行时接线包：升级集中1.52契约，按schema2及独立能力显式适配活动、状态、可见ACK/resolve和执行许可，不将V2请求交给V1解释器。Service单机OR为共享提醒进度唯一权威；控件先暂停及撤销独立token并取得DISMISS确认，后报调度交接，Service确认后才进入共享状态。保留无Host独立路径；不声明未验证能力，不修改ACTIVE/账本/贡献，不制包或启用生产共享。最小测试为现有Native、生命周期、活动和执行专项加V2分支。

协议收口到集中1.54（source 3778dff632b930c1c80a3517c0a64539522ed4c0）：pending-entry只表达待确认、不能推动clock；restrictedEntry不冒充超额；V2一律60秒未确认结束，旧soft timeout字段不影响V2。首访问、周期重判及规则范围确认将接入同一Service调度。无适用额度时不能因共享统计未知而阻断，未知用量保持unknown；有适用额度且缺源无缓存的策略仍待PO集中裁决。先验证完整合成账及无额度场景，保留家庭配置。

V2接线包：核验集中1.51.0包SHA256后更新现有契约锁及生成式JS副本；新增独立V2策略只读缓存与路由，保持V1兼容。来源统计提供同身份、同周期快照给新三桶纯函数；投影保留网页online/domain及同版配置。配置身份改变使在途结果失效。只读专项、策略身份/冲突及实际quota消费者专项为本包最小测试，不构建/安装/启用共享。

共享调度交接准备：为现有forced prompt串行运行时增加按明确token撤销接口；存储先失效、清deadline及Content撤销ACK后才报告完成，拒绝旧按钮和旧timeout。交接接口不执行放行、阻断或媒体恢复，不改变已结算派生贡献；正式调用等待集中运行时V2契约，禁止两端同时弹窗或相加本机进度。

本包结果：集中1.51包哈希71e17887912422e51fddbe381674b21bd8ea98e73ac995390162260b18b248bf已核验，生成式副本与锁已接。V2严格策略/独立LKG/真实GET路由/同版本自主度冲突/初始化幂等专项通过；新三桶投影和真实quota消费者专项通过，Composite不转Rest、网页online/domain保留，关闭超额确认到线阻断。来源读取每次重读本机web最新量，改绑和跨周隔离通过。prompt交接暂停/明确token撤销/缺ACK失败/旧点击及timeout无效/恢复不复活旧token通过。Native只读专项、typecheck、扩展根检查和diff通过。Matched：源码只读与核算接点、V1兼容、单轮交接API；Missing且未冒报：集中运行时V2包后的真实调度接入与双端验收。未触及原账或网页计时；未提交、候选、安装、启用共享或生产配置。既有其他文档脏改保留。

接续范围：后台bootstrap完成后初始化来源统计只读刷新，以既有激活及监控开关控制，不以旧shared执行状态作为数据读取条件；来源不可用保持显式不完整。新V2访问接管等待架构通过验证的集中契约，已反馈online及单站点来源边界。

后台接线typecheck通过；架构裁决online及domain继续网页专属，三桶共享不覆盖原配置整体。新增默认关闭、改绑、跨周断言因夹具缺依赖stub及误用available字段连续两次失败，修正后依据本轮完整实施与必要验证授权定点复验通过。后台启动本身目前为源码接线与类型证据，尚无真实浏览器启动验收。集中V2契约源码build及架构专项已通过，发布包仍待集中封装。当前代码未提交、未构建候选。

首包验证：恢复只读cloud查询、Native串行交换和来源/LKG消费者，1.50仅取只读验证合并子集，排除旧借用投影；默认关闭、未接background启动。source-statistics-shadow、local-guardian（含交换成功及错误阶段拒绝）、typecheck、diff-check通过。Native夹具先补新增导入；后续原健康探针等待曾偶发超时，未改断言复验通过。已回报架构，后续采用集中契约projectIndependentSharedQuotaSeconds，应用明确新配置优先、缺省继承。未提交、构建、重载、发布或启用共享；真实双端联验尚未执行。

沿架构交接，仅extension-local：核对现行统一配置与提醒契约；恢复806abac已有source-statistics只读分域读取和串行Native交换，网页本机最新加cloud-other、应用Native总量优先再cloud-all再同身份周期LKG，不双加。原提交未进入本固定分支；当前shared-access-runtime仍依赖旧basis/replacementVersions，不可用于新模型。公共契约由架构集中修订，不恢复旧复合转借或旧软提醒。分步核对读取、缓存、身份/断连保护，最小source-statistics-shadow/local-guardian专项与typecheck；不跑全量，不创建候选、不重载、不发布、不改真实档案或启用生产共享。原始网页账、统计、ACTIVE及上传不改；若必须触及按D-076单项批准。整体共享执行待新版契约及两端隔离联验，不以只读通过冒称完成。

## 强行使用提醒原因与用量展示（2026-10-16，1.7.49已托管）

后续PO明确授权提交、推送及托管：源码3dc9731经PR282合入master ddb5e72，CI 38806762712通过。managed隐私边界与渠道16/16专项通过，复用同产品代码的既有专项/目视证据。deployment 48c0fc9c；CRX 649346字节，SHA256 a59f7ee910c573e550a30828b28161856e5a86756269e43b39858f2820dce9f6；签名/稳定ID及双域名六项回读通过，22个旧包保留。只读终端日志确认04:42合并weeklyRest/timeWindow并visible、04:44单独timeWindow并visible；最新上报1.7.48，1.7.49安装待观察。本次不改家庭配置，不将Native状态等同Chrome同步状态。下述未发布说明为更新前阶段记录。

PO批准：区分超配额、限制时段与再次提醒；合并原因仍只确认一次。仅补充同次判定的只读展示快照和弹层文案，不改计时、配额、确认状态或触发节奏。缺失用量不补零。专项覆盖展示、payload恢复、原判定回归及隔离页面桌面/窄屏；通过后备份并更新当前unpacked文件，保留manifest身份、绑定和storage，不发布托管。另按PO授权切换T.xia统一规则并回读原配额与时段。

完成：同次判定只读透传用量/配额、提醒种类、上次确认后增量和下一允许时段；多原因逐条展示且仍单弹层。copy/admission/prompt/progress单测通过，mode-service156项、rest-usage-reminder152项、typecheck及root通过。真实隔离unpacked专项1/1通过；实际renderer夹具桌面1280/手机390下超额、合并再次提醒、未知状态1/1通过并目视核对，夹具初轮Chrome全局声明失败已修正。Matched：原因区分、用量、单次确认、未知不补零、原判定不变；无额外产品逻辑变更。当前加载目录已完整备份，1.7.48开发候选只替换5文件，196文件哈希相符、key/开发标记相同；PO确认已重载且绑定正常，记为PASS_WITH_MANUAL_EVIDENCE。未读取/改写浏览器storage；未提交、推送或更新托管，本轮新文案不在原正式CRX内。云端统一规则已保存并重载回读；PO同期手改配置不覆盖。

## COMPLETED：1.7.48 内部托管发布（2026-10-16，PO授权）

范围为固定终端源码及已验证的提醒基线修复、访问诊断默认基础上传；保留明确关闭或到期授权。9项直接专项、typecheck和扩展根检查通过，原密钥签名及独立CRX3验签通过。PR281合入master c1735896cfcf0d5c2a9d5c35d0186a2e59be648c，范围门禁38800536144通过；首轮声明缺项及换行错误经PO批准修正后通过。更新源deployment c96694f2，稳定和deployment域名的feed/CRX/SHA256SUMS共6项逐字节匹配。CRX 647604字节，SHA256 16b356b42a5d6e851d70fb2eb627263e6dd3a3aeac477fd6d131e8ec7e57ea4b，稳定ID不变，21个旧CRX保留。仅扩展更新源，不部署Worker、业务Pages或Native，不修改家庭配置、原账或共享开关。真实Native共享与Mac遗留继续Deferred；T.xia配置保存另项未确认。终端安装待观察，当前unpacked未替换或重载。

## VERIFIED：访问管理诊断链与默认基础上传，候选待重载（2026-10-16）

PO要求从云端日志判断访问管理是否正常。extension-local中等风险诊断变更：补充访问判定/执行、强行使用弹层生命周期、周期检查执行/跳过/失败，关联auditId；仅上传白名单状态、原因码及数值，不上传网址、标题、输入文字、令牌或规则签名。默认基础上传开启，保留明确关闭及旧到期授权，详细info仍需临时授权。诊断异步、限频、有界，失败不得改变访问或账本。最小验证：client-logs、访问诊断、forced-use-prompt/mode-effects专项、typecheck及候选启动；不运行全量/E2E、不改Native、云端接口、生产档案或原始账。验收区分代码接线和真实终端上传，不以本地测试宣称云端已收到。

结果：client-logs47/47、cloud-client-log-ack5/5、diagnostic-evidence、access-diagnostics（执行真实quota alarm分支的隔离依赖测试）、forced-use-prompt/mode-effects、typecheck和扩展根检查通过。默认基础上传、明确关闭/旧授权到期、临时info、隐私白名单、周期限频、投递/确认/超时/恢复、诊断失败隔离均Matched；未改计时、原账或访问判定规则。未运行广泛E2E；复用已授权候选启动smoke，真实隔离SW/Admin与诊断存储通过，无家庭身份或生产上传。原周期失焦跳过仅增加原因日志，不作为本轮修复。

开发包1.7.47先完整备份dist/native-host-candidate-backup-forced-use-1792094145645后更新6文件（含新增infra/access-diagnostics.js），197文件树SHA256 a285c4686f4b7604bf2d27dc5bd018322f2f3ab174cc4444b75de95d34dd323d。ID/key/部署配置保持不变，未清storage或重装。待用户重载后观察现有access分类日志；旧明确关闭/已到期策略不会自动改写。未提交、部署或托管，不宣称当前家庭终端已成功上传新诊断。

## VERIFIED：统一强行使用提醒基线已修复，开发包待重载（2026-10-16）

已确认forced-use-reminder-progress在每次进入确认后重置lastAcknowledgedUsageSeconds，与新增原因/换规则不重置决策冲突。小范围修复：首次确认建立基线，未到期的进入确认仅添加授权；已到期时与进入原因合并为一次repeat确认并推进基线。覆盖25分钟换站再5分钟、连续新增原因、到期同时换站、失效确认及跨身份/日期。仅修改提醒纯逻辑和直接测试，运行progress、admission、policy、prompt专项及typecheck；不改记账、实际贡献、配置、云端、Native或正式托管。验证后备份更新现有unpacked对应文件，待重载。

结果：四项专项及typecheck、diff检查通过，实际候选包隔离SW/Admin启动无错误。1.7.47当前目录完整备份后仅更新core/forced-use-reminder-progress.js，196文件树SHA256为8fd00b0d4b0f23ca9147052eb112de48bcb31f2cabec0977f8ed84a742d3e342，身份/key/部署配置保持一致。方案逐项Matched；没有新UI或计时语义改动。当前运行实例需用户重载；不宣称已完成家庭现场30分钟自然使用验收。源码尚未提交，无云端发布。

## COMPLETED：非共享统一强行使用已合入、部署并完成开发候选验收（2026-10-16）

PR270已合入master `b5df4f851e178c1c7e9a02cb355b00c23061994e`，实现提交7600104、验证修订cfc5da8。10份forced-use专项、模式156项、原始分段300项、提醒152项、路由67项、typecheck和扩展根检查通过；完整tests/run-all.js最终全部通过，含API103项、时长流程53项、扩展浏览器15项。修订旧文案、异步断言和受限SQL片段检查后，没有未处理的该轮完整回归失败。

生产38777359853成功，仅部署主Pages `843de70d-4a2c-4a82-b200-7f9f5ee77537`，精确SHA主控制台CI38777227519通过；稳定与deployment域名的index/access-config-domains共4项逐字节匹配发布Git blob。没有Worker/Runtime部署、迁移或家庭配置修改。Native共享执行继续延期，不作为本轮缺项。

开发候选1.7.47保持稳定ID，隔离实际包Service Worker/Admin/新模块启动通过；旧包完整备份核验后同步22个文件（新增7），候选196文件树SHA256 `8426831de11828677db39a31888a144c415a81d085d263bb4e5bd56de488ac1d`。原key/版本/部署标记一致，未卸载、解绑、清storage或托管CRX/feed。PO已手动重载并确认Popup正常显示、云端绑定保留、无需要绑定提示或红色错误，当前Profile基础检查记PASS_WITH_MANUAL_EVIDENCE。Computer Use未能可靠识别浏览器URL，Browser Use也禁止读取本地扩展协议，故该现场证据来自PO而非自动化。隔离浏览器功能、派生恢复及桌面/手机目视证据维持有效；未启用或更改家庭策略，不将本轮结果扩展为Native共享验收。

## NOW：应用身份已发布，2.6.53修复已安装，最后实机核对待只读UAC（2026-10-15）
2026-10-16 云端配置文案核对：已部署的“强制限制”启用状态把非共享 V2 终端执行与尚待验收的 Native 共享提醒写成同一个上线条件，容易误导家长。仅修正状态说明：非共享终端须安装支持版本并同步启用配置才生效；共享提醒仍单独待验收。不改字段、API、计时、配额或生产档案。

该文案的 `forced-use-cloud-config` 专项通过；独立本地浏览器 mock 于 1280px/390px 目视核对，窄屏文本无溢出、与下一项保持间距。证据为当前任务可视化目录中的 `forced-use-cloud-desktop-detail.png` 和 `forced-use-cloud-mobile.png`；未登录家庭账号，未改生产配置。提交和线上回读仍待执行。

## NOW：统一强行使用策略配置（2026-10-15，开发中）

- 云端只准备可选、完整校验的 `forcedUsePolicyV1`：单一提醒间隔、各标准配额超额余量、建议时间窗当日最终上限。缺字段或未启用保持旧逻辑；不自动改现有档案。
- Pages已将标准限额留在时间配额页，把最终余量纳入“强制限制”，统一提醒配置归自主控制。Native共享契约仍待架构会话确定；当前尚未部署、未启用生产。
- Worker字段校验、Pages编辑与导入导出专项通过；启用新机制时不再校验隐藏的旧时间窗间隔。Pages明确写明配置已保存不等于终端执行。终端非共享路由已接线但真实导航尾段仍待稳定复验；Native共享契约未完成，不得宣称全端生效。
- 2026-10-16本地复验：`forced-use-cloud-config`、Pages字段243/243、typecheck与diff检查通过；隔离HTTP预览以假档案检查自主度和强制限制的桌面1440px、手机390px布局，新增控件可见，手机无横向溢出，停用模块正常加载。截图仅存本机 `.tmp/forced-use-pages-desktop.png`、`.tmp/forced-use-pages-mobile.png`、`.tmp/forced-use-limits-mobile-http.png`、`.tmp/forced-use-limits-desktop-http.png`，不含家庭数据。该证据不等于保存/API实机或生产验收；仍未提交、部署或启用档案。


## NOW：统一强行使用配置与独立强制限制（2026-10-15，PO批准设计；跨端契约待核）

- 云端负责版本化档案配置、严格校验、导入导出、配置审计和Pages编辑；旧档案默认沿用旧强制行为，不自动启用新模型。
- 时间配额仅保留标准限额；自主控制只设置唯一强行使用后续提醒间隔（默认30分钟），提醒次数不构成阻断；“强制限制”分时钟停用与用量最终阻断，允许各项最终点为无限制。
- Native共享访问契约当前仍包含独立日周软提醒、单一重复间隔和旧超时策略；未升级并真实验证前不得把新配置下发为可执行策略，也不得启用生产档案。本任务不修改原始账、统计或配额来源。

## NOW：建议时间窗定时确认配置（2026-10-15，代码与专项通过，目视待验收）

本批只在既有自主度配置增加 `scheduleReminderIntervalMinutes`（默认30，1–1440整数分钟），Worker校验、Pages编辑及导入导出；建议模式仍默认关闭。终端的同规则已结算网页用量复核由固定extension-local工作树负责。只协调现有自主提醒，不改网页账、配额、硬限制、Native或生产配置；本轮不发布。

Worker配置23/23、Pages配置243/243、云端周提醒专项、typecheck及diff检查通过；隔离假档案的桌面／手机目视已核对，未发现新控件横向溢出或模块加载错误。真实保存/API与终端联合验收仍待完成；本轮尚未提交、部署或修改生产档案。


## NOW：2.6.54 Chrome新身份、既有特殊属性及端云读取验收通过；整日未知单列（2026-10-15）

本轮PO再次明确批准后，仅执行一次修正的受限只读UAC，v2成功：SQLite52ms/20秒预算、实际已安装54解释器，未改库/配置/原账；原v1失败证据保持。根独立读脱敏结果并核对SHA256 6b97a535d8c1aa3267cc22dc78a835d6d647a77c2393c586ed842ee01b02af2f。当前session精确protected scope的新Chrome Service metadata4点，selected/identified/guard均4，ref及generation齐全；22:51:51.819至22:54:52.840。此前本用户观察保存行的时间不等于首次成功识别时间。

既有配置实际解释通过：SelectsExecutableObject=true，同孩子AppPolicy376，精确旧键分类/已解析规则均0，因此合法unclassified；confirmed产品映射恰1，specialApplication=true且无解释错误。机器Policy392、原生配置376，无显式Chrome target；未归类与特殊容器属性独立，不因页面未归类而误判特殊属性丢失，也未擅自将配置改成other。Chrome对象revision3内容hash及精确ACK通过；当前日Native投影revision38内容hash、对应base hash/base received及精确ACK通过，生成于安装后，Chrome当日明细92秒。整日普通贡献3505秒、特殊贡献61秒：只证明当日聚合，不将61秒冒充本次Chrome专属新增量或宣称92秒全部扣除。

本批Matched：真实新窗口识别→Service侧元数据→既有分类/特殊属性解释→非零身份统计及上传确认→两站同版本采用。整日仍partial，原因estimated/missing identity/legacy selection，沿既有遗留范围单列；整日完整性、全部软件正确性、PWA真实窗口、新身份限制执行及共享均不在本次通过结论。Native投影空窗时旧目录回退跳变仍单列待查，未顺带修复或部署。无需因这些遗留再安装/采样本批Chrome。

PO正常使用普通Chrome后，本用户只读采样2条：同实例、同窗口、当前session及捕获代际有效；22:51:50.819仍dynamic-registry，22:54:52.840为identified、封版Chrome nativeId及browser guard命中。证明新生产者实际可识别普通Profile窗口，不据观察保存时间推定整段3分钟都已识别。

根会话真实登录两站核对：首次主站23:00:20基础22410秒、Chrome旧产品6050秒；独立站稍后读到带原生target的Chrome92秒。继续一次相近时点对照后，两站同孩子、同日、同基础revision、同截止23:06:33.834，均为22705秒；原生Chrome92秒（historicalUnknown/unclassified），两个旧dynamic对象1293/33秒逐项一致。6050秒来自旧目录投影，不是本次新增，也不是Native新身份92秒的可比范围。代码readNativeApplicationUsage在当前基础无可读Native投影时返回null，readApplicationIdentityUsage转读旧产品投影；后续新投影可读才恢复原生target。记录此过渡回退会造成名称/分类/明细跳变，尚不认定为部署错版，不通过反复部署处理。

此前v1诊断失败阶段保留：helper仅返回RuntimeException（completed=false、readOnly=true，脱敏结果SHA256 015897362b851f275848978428eb4325925d8a3adc36eb45e1e3b73423c2a6a7），没有自动重试。合成排查发现GBK输出非BMP会失败，但无stage不能认定为实际根因；后续v2经PO另行批准才执行，成功结果见本节顶部，覆盖当时“尚缺Service核查”的状态。本轮无产品改动、新安装、配置写入、迁移、部署或共享启用。

本批最终状态：Native main已提交推送450b0d3a3de17add4f6b9e57bc760899f25921f6（父ed7042c，精确12任务文件），根独立核对远端一致。唯一内部候选2.6.54源于该干净提交；599归档文件保持，588与70项通过副本字节相同、11仅换行，无其他草稿。Setup SHA256 ca42c56f965b851c30384e0498f8d947ee8708bfa56126b7c2fa647a3a2dce9d，MSI bca96d306c9ec3a5b47d0c534f96dd817df6bc53705418960302af2020ac7061；契约1.49.0不变，13发布组件/11内嵌组件版本哈希匹配、UpgradeCode保持。仍未签名、latestEligible=false，不托管或改R2。

PO对具体候选明确批准启动安装器并手工确认UAC后，54原地升级退出0、现装11组件核验通过、Service在线及心跳成功。根独立读install-safe-result、preservation-safe-summary和公开状态：一致备份通过、18表原事实/冻结版本/outbox键/对象与侧元数据保留、配对/HMAC不变、配置及受保护分配保留。无云端部署或现有配置修改；只启动一次安装UAC。当前等待PO正常使用普通Chrome约3分钟再自然切回，核对新观察身份/旧配置解释/特殊贡献/上传及真实页面；不能把安装成功或70项源码测试当作实机功能通过。

PO明确要求继续补齐Chrome接线，修完集中实机验收，覆盖下文此前“不实现producer”的阶段限制。允许路径为现有Native Windows身份选择／监测／侧元数据／统计直接消费者及对应测试、既有文档；根会话负责语义审阅和云端只读验收。不改原账、基础计时／秒分配、现有配置或封锁键，不新建分支／工作树，不处理Mac、历史、共享执行或云端迁移。先真实窗口及已封版规则，必要的运行选择信息只本地提取最小标记，不记录／上传完整命令、URL或目录；不能把进程参数未见app-id当作普通窗口的唯一证明。调用链最小验证覆盖同进程普通浏览器／独立网页应用、多个Profile、读取失败、窗口／进程代际变化、旧配置保留、当前身份统计及原账不变；源码和聚焦验证集中完成后只形成一个最终候选，再安装并做本机→云端→两站实页核对，UAC由PO确认，不逐补丁制包。

本轮进一步只读定位：封版普通Chrome含exact窗口AUMID及browser guard精确image；现有windowMatches把自身normal窗口命中也当阻断。实际两个现有捕获窗口经同会话/PID/StartTime及exactimage核验，PKEY5读取S_OK、非空，但均不匹配封版默认或其他App窗口标识；默认值自挡修复单独不足以覆盖这两窗。已核对Chromium官方按窗口类型及Profile生成AUMID的源码，下一步为同两窗的窗口重启属性最小读取与正面精确绑定，不做Chrome前缀泛配，不采集进程完整命令。本轮尚未完成phase2或修改Chrome源码。

本轮后续结果覆盖上段阶段状态：phase2两窗同代际/exactimage/窗口PKEY2+配对PKEY4读取有效，官方Profile公式精确重算均匹配；无完整属性落盘或上传。Chrome生产接线源码完成，根独立审阅：默认sameApp修自挡、Profile后台有界证明、PWA隔离、未知保留动态、旧配置guard专用兼容；窗口匹配集合一次计算、派生证明不伪称literal规则命中。最终TRX70/70、0失败0跳过，Service真实事实入口/侧元数据/统计/HTTP及双通道原量不变覆盖；22份固定1.49合成schema/hash通过由Native提供。后续旧捕获重放返回STALE_CAPTURE如实保留，不当失败重试扩扫，也不冒充新二进制实时成功。按PO授权进入固定干净源码、唯一最终候选准备；目前尚未完成新包核验/安装/真实链路复验，现装仍53。

集中提交阶段工具阻塞：本批12文件（5产品/4测试/3既有文档）main提交与推送被自动审核拒绝，要求本批明确用户批准；组合命令未执行、未暂存或提交。已在当前主会话集中请求这12文件提交/推送及单一最终候选构建授权，不通过其他通道代做。干净源码核验为587未覆盖基线Git blob等价（其中478为归档CRLF换行等价）＋12任务副本精确，无他人草稿；不因纯换行重复产品测试。等待实际批准后继续固定源码、唯一候选及安装后验收，不把当前源码通过写成已经安装。

PO已对上述具体问题明确答复“批准本批提交、推送和唯一候选构建”，已据此通知现有Native任务恢复，先固定本批12文件提交及唯一候选，不包含其他草稿；安装与真实验收仍待实际执行，不由授权或制包状态推定通过。

授权等待后再核验：Native任务已终止等待批准（非构建中），本机main仍ed7042c、索引为空，尚无新候选。根会话独立计算本批12个当前文件与70项通过的测试副本SHA-256，全部逐字节一致；对应差异检查通过，可复用既有测试，不需要因等待再跑。未重试被拒绝的提交／推送，也未另通道制包或安装。

阶段性工具阻塞已解除：Native会话被其“汇总交接”请求结束，恢复发送曾被工具自动审核拒绝；PO随后明确批准继续通知并协调现有Native会话，工具发送成功，Native已核对真实授权并恢复Chrome任务。不绕过拒绝，不重复phase1或制包。当前现装仍2.6.53，尚未完成Chrome代码／安装／生产复验；未新增原账或配置变更。

PO“然后呢”后继续本批未完成的分类兼容收口。职责architecture-integration负责真实消费者审阅与云端证据，native-local由现有Native会话实施。先修已证实的安全EXE选择证据被附加OS AUMID错误否定，不直接放开全部dynamic或全部Any；Chrome/PWA按实际选择语义核对，仅有同名/宿主路径时不得继承。最小验证覆盖独立EXE附加印证、浏览器与独立PWA隔离、显式新target配置优先、未归类合法及旧配置保留；排除原账、配额执行、全平台、Mac、扫描、迁移及当前家庭配置修改。先源码和相关测试集中完成，不立即出包或请求UAC。

继续核对的实际生产断点：WindowsRuntimeProbe.IdentifyApplication只向Baseline传ImagePath/ApplicationAumid/WindowAumid，ArgumentEvidenceKnown及AppModeAbsentKnown保留false默认；browser-image-with-app-mode-guard因此无法在此入口成立。Chrome动态对象的问题不是单纯历史缺字段，也不能只放开统计消费者解决；所需普通浏览器／独立网页应用选择证据尚未接线。先保留该明确缺口，不取消guard、不将动态名字当旧配置关联，不把ChatGPT局部修复称为Chrome特殊贡献修复。

分类兼容局部补丁已完成源码及聚焦验证：保留非空旧键与identified条件，要求至少一个已有安全EXE选择依据，All仅允许两种原依据及同App的os-application-aumid附加印证；OS-only、独立窗口/app-id/script/launch/冲突混合及dynamic仍拒。根会话独立核对产品diff、两处测试diff、TRX及干净源码核验：29/29、0失败0跳过，597基线文件与6任务覆盖、未混其他草稿；8份固定1.49合成投影schema/hash及Service编译通过由Native提供。当前只证明源码回归，不证明现有583秒各点都恢复，也不修复Chrome入口。按已有集成授权将这6文件集中提交现有Native main；当前安装仍2.6.53，不制包、不追加UAC、不部署。

PO“授权集成发布”已执行：PR267合入master `6866059cc94a8344669bf0b1630cfce8b34f2b05`；精确SHA Runtime 38722634184、Guardian 38722634230、主站38722669170通过。生产38722867636成功，仅应用`0023_runtime_native_application_objects.sql`，部署Runtime／Guardian／两套Pages并通过四项smoke。Runtime版本6275f096-49f0-4d20-af35-6cf40cea260e，Guardian版本097d91e2-830e-486a-b320-55dc2ff5a6ab，独立Pages 15c41f2e-f985-412b-b0ba-1f39b1f9145d，主Pages 0446d896-983f-419c-bf34-38cdebca8b36。两站稳定及deployment域名共12项管理JS/CSS逐字节等于发布源码；R2 latest对象与发布前完全相同，无Guardian迁移或共享启用。

Windows已先安装2.6.52（源码9ed29b9、Setup SHA256 `6240e08d17096b10b4392f9f168ca60517b194143cf881cf254b0128ad32e630`），首轮实机暴露下述身份消费者错误。修复后已安装2.6.53，固定源码`e5e6cf0f7cd8ffb088c3b35389d6fe4c399b85b7`、契约1.49.0；Setup SHA256 `1842ce4095ae331c7bbacdc65ea92fdf9c487e4ca2e9827c6d24d9307bd3f907`，旧52字节保留。53安装退出0，11组件版本/哈希匹配、Service在线，18表保留核验通过，含对象队列/配置/metadata/投影；配对/HMAC、分配、原始facts及冻结版本不变，outbox键保留。未签名及非latest候选状态保留，没有再次发布云端。

真实通过：当前保护scope独立对象97/97精确云端ACK、pending0、诊断空；同孩子配置376缓存成功，explicitTargets=0，未擅自更改现有设置。主控制台真实显示97个应用对象，与本机数一致；独立站经既有家长入口恢复会话，页面可读取有效基础统计。当前日基础应用总量仍可读，不把不同读取时刻的自然增量当差额。

52首轮真实未通过：身份投影虽与当前已受理基础清单精确绑定并获ACK，但complete=false、0身份行、NATIVE_SETTLED_TOPOLOGY_UNAVAILABLE。已定位Native在metadata归属前无条件要求整日原段共享完整秒网格；合法3500ms/3秒原段或不同相位也被拒绝，整组好段随之清空。不是对象未上传、不是旧策略版本，也不能以基础清单重生或6个新观察点证明身份统计完成。

修复e5e6cf0仅对无重叠且身份可证明的段复用原DurationSeconds/Hours，真实重叠要求局部可证明并集，不明确部分局部unknown；原账/基础统计/舍入不变。最终38/38直接专项、10份官方1.49投影schema/hash及Service编译通过；根会话独立读TRX、产品补丁及新增9项边界。

PO要求重新弹出只读核查后，本次UAC已确认并执行成功，实际SQLite只读16ms、预算20秒，无诊断错误。受限脱敏结果native-management-live-safe.json的SHA256为fdd564b1a718998a140a9810d5a8fe450090726f4e86ae89dae20e03a7ae37ea。本机对象99项、精确ACK96、pending3，全部本地hash验证通过；身份投影revision7已received、hash/ACK匹配已受理基础清单，基础18222秒、已知身份两行583/25秒。原整日拓扑拒绝原因已消失；本机更新中的pending head不是云端最新已发布head，不作为固定已发布范围的失败条件。

根会话20:48:21真实登录主控制台GET返回200，model=program-instance-v1、整数秒；基础18254秒、结算截止20:46:30.621，三条应用行均带machineId/nativeId目标，ChatGPT583秒及两个Chrome动态对象32/25秒，合计640秒，DOM逐项一致。确认采用新Native身份投影而非旧产品回退。独立Runtime页20:54:34读取基础5小时8分56秒、同步截止20:51:37，实际显示ChatGPT9分43秒、两个Chrome动态对象3分32秒/25秒及Intel Arc Control未归类6秒；不同读取时刻自然增量不当作差额。两套真实页面均展示有效基础量和已知身份明细，未追加UAC、扫描、配置写入、安装或部署。

剩余分类断点：缓存配置376的显式native target为0，当前走旧键兼容；NativeApplicationStatistics.InterpretLegacy先要求SelectsExecutableObject，NativeApplicationFactMetadata要求identified且全部证据仅限两个EXE选择标签，否则复用historicalUnknown标签。动态Chrome不能据名称/宿主路径继承普通浏览器属性；ChatGPT已有证据组合包含os-application-aumid，会被该All白名单排除，但本轮导出不足以逐点证明583秒全部属于此组合，不能编造精确占比。该标签不等于旧周记录，也不是旧策略缺失证明；需后续最小核对兼容选择语义，不在本轮修改或出包。

审计：集成/部署/原账保留/对象登记/配置读取、固定已发布base的非零身份投影及两套真实页面采用为Matched。分类兼容为Deviated；全日缺身份/估算部分、普通/特殊贡献、真实配置保存与执行仍未验收，不能宣称整体通过。partial原因保留NATIVE_ESTIMATED_IDENTITY_UNPROVEN、NATIVE_FACT_IDENTITY_MISSING、NATIVE_LEGACY_SELECTION_UNAVAILABLE；ordinary/special为0不证明实际零用量。新身份黑名单/日限强制执行、Mac和共享不在本批通过范围。附件工具因现有附件数上限未能把PR267附到会话，本条及PR链接保留追踪，不影响实际合并发布。

## NOW：自主控制配置发布（2026-10-15，PO批准）

PO要求本次提交推送、部署供手工验收，覆盖以下自主控制条款此前不发布限制。仅提交本功能Pages/Guardian及直接测试/文档块，部署guardianWorker与mainConsolePages；不发布并发Native身份草稿、Runtime Worker/Pages、迁移、家庭配置或CRX/feed。专项与截图证据已通过，生产取精确master SHA及CI；未完成回读前不写已部署。终端1.7.47由固定extension-local备份更新unpacked，Native兼容边界保持未验收。

## NOW：应用身份集中贯通（2026-10-15，继续实施）

PO已明确授权“集成发布”：本批集中合入现有主线，发布Runtime Worker、Guardian只读代理及两套Pages，仅应用专项0023元数据结构；Native推送9ed29b9并从固定干净源码交付一个最终内部候选、原地升级及真实联调，UAC由PO确认。原配对、原账、配置和Firefox执行路径保留，不启共享、不改R2 latest、不处理Mac。同步主线时保留已集成控件与自主控制修改，不把源码／部署／安装／实机状态混称。

发布CI定位：真实旧版SQLite生产者捕获的能力列表不含本批新增native-application-management-v1；只在跨仓旧响应对照中排除新增声明，并独立断言新能力存在。原捕获、manifest/hash、上传ACK和统计秒量逐字段校验不改；最小复验application-account-publication文件，不调整产品行为或降低账本断言。

修正独立对象登记与当次身份统计关联两处断点；贯通同一machineId/nativeId到云端目录、孩子配置及统计消费者。原账不改，不部署／安装／执行生产迁移；不以局部函数或测试通过冒称全链路完成。Native沿既有会话实施真实生产者，本会话负责契约、云端及页面；复用现有目录，保护其他未提交工作。

本地数据源码已集中接通：契约1.49固定850c33b；Native d7a1bf0＋兼容修复9ed29b9（后者本地已提交、远程推送被权限审核拒绝，未代推）。独立对象无capture也登记；当次事实侧元数据生成身份秒投影；现有app-policy同target配置；主站只读代理与两站共享组件接通。旧Chrome特殊属性经同次已验证旧键保留，PWA不继承宿主；早前缺关联的秒只保留基础总量和已知明细，不猜配。

证据：云端相关5文件92/92通过，最后配置隔离补验15/15（有重叠，不相加）；主站代理15/15、契约新旧兼容、页面knowledge/component/policy/time、typecheck、最终Runtime dry-run通过。Native最终直接专项29/29、官方6份合成投影及原v4逐条不变已核对；既有131/59只复用未改部分。独立loopback浏览器桌面／移动截图及一次动态对象保存为PASS_WITH_MANUAL_EVIDENCE，不冒充生产。

后续一次完成集成与真实发布验收，不能现在称为线上贯通。专项0023尚未生产应用；本机仍2.6.51/ea2742d，新源码未打包或安装。新身份黑名单／单应用日限仅配置及只读决策，实际强制消费者单列；旧Firefox执行路径不变，不启共享。并行自主控制草稿和其他未提交工作保持原样，不混入本批。

## 自主控制完整性补查（2026-10-15，未发布）

PO要求复核全部实施：Pages正常编辑已固定60/30节奏及超时阻断，但导入/导出和差异预览仍把旧repeatReminderMinutes/softReminderTimeoutAction作为可编辑有效配置。补齐导出与导入规范化为60/end_rest，移除废弃字段的可选择差异；保留日周软限额、进入确认及时间窗自主控制的真实差异。旧字段只兼容，不宣称能改变新提醒。不改记账、生产配置、Worker协议或Native，不部署。

## NOW：自主控制配置与文字确认编辑（2026-10-15，PO批准）

云端仅新增autonomyConfig.timeWindowAdvisoryEnabled布尔，默认关闭；自主度/时间段显示强制或建议，固定60秒超时强制阻断、首次确认后新增1小时、之后30分钟提醒。旧repeat/timeout字段仅兼容，不再可编辑；导入导出支持新开关。先文档后配置/UI、专项/桌面手机目视，不提交/部署/启用家庭档案，不修改Native/记账/配额算法。终端在固定extension-local实现并维护详细已批准设计，保留原草稿。

## NOW：Native应用身份统一管理接线（2026-10-15，PO已确认并要求继续）

- 已确认：一个应用身份就是一个管理对象，动态兜底也可管理；跨机器合并留下一阶段。原“全部软件必须正式产品归属”不作为当前验收门槛。
- 实施清单：核对nativeId／productId及多身份真实关系→固定同一对象的契约和作用域→接通云端管理、统计及策略消费者→Native所属会话接线→集中聚焦验证。只命名可见不再算管理完成。
- 职责architecture-integration＋standard-cloud；Native代码由现有Native Host 02负责。不新建分支、工作树或治理文档；保留现有未提交内容。
- 必要验证：同对象命名／管理／统计一致，明确和动态对象均可配置，名称变化不换对象，同名对象不猜合并，孩子／来源隔离，多身份不重复累计，现有Firefox等分类与封锁配置保持。只跑受影响契约、Runtime、页面及Native消费者专项；不跑网页原账、Mac、安装器或全平台。
- 当前：Native本机读模型源码及聚焦验证已交付；云端首个对象读取接线已通过本地验证。管理配置、实际统计／分类和封锁消费者仍未完成；没有本批安装或生产部署。共享限制仍关闭；不顺带改原账、生产迁移或跨机器复用。

本机基础批次已交付main `2568e5dc192c417c721ec0a0799750e4b1b20d4d`：已核对实际Agent worker→本机对象／当次观察侧表写入及13项新增回归源码；Native报告组合104项与Agent编译通过。三类身份同等对象，精确观察点选取、同点冲突／缺点、无capture对象、scope隔离、重启与恢复均覆盖。当前安装仍2.6.51／ea2742d；Manager、统计／分类、封锁和云端注册协议仍未接入该新读模型，不把基础读模型交付称为全部完成。

云端首个读取消费者已本地接线：共享对象引用原machineId＋nativeId；实例GET及完整目录GET增量输出applicationObjects。当前已鉴权登记中的明确／两类动态身份均生成对象，不依赖旧产品confirmed；没有旧目录也可读取。改名保留同对象展示资料，同名不同ID／不同机器不合并，重复来源不增加对象。旧产品事实及字段仅兼容保留，原账／统计／分类／策略没有写入。本批不构造当次窗口选择，也不把对象集合用作时长归属。

已运行并通过：契约build／直接身份对象及冻结v1 ACK哈希向量、contract-compatibility；Runtime typecheck和实际隔离D1两文件49/49（含无旧目录、同对象改名／重放、多来源及孩子／家庭隔离）；Wrangler 4.127.1示例环境dry-run和diff检查。当前只有读取接线，不是配置／统计／执行已完成。1.48冻结tgz未重打包；共享库新增源码待整批契约集中交付，尚未提交／部署。前次48项结果因新增一项用例已由49项复验覆盖，不相加。审计：对象引用、同等接纳、直接读取、范围隔离为Matched；配置／统计／执行消费者为Missing；无额外原账或配置修改，不提交或发布半成品。

下一必需断点：1.48命名传输仍要求已登记instance／原capture，而本机新对象可在无capture时成立。完整管理接线需独立对象登记，不能拿这一前置条件否定身份；不得伪造instanceId或从累计多身份选当前对象。后续集中固定对象登记与配置／统计／执行消费者，不重复安装中间版，也不修改原账绕过该元数据断点。

2026-10-15只读断点核对：Native确认WindowsRuntimeProbe仅SupplementName；命名队列ACK没有统计／策略消费者。ApplicationProductStatisticsProjection只接受confirmed＋ProductId＋schema2上下文；ProgramInstanceMappingCache和ProgramInstancePolicyBuilder也依赖旧映射。云端programInstances的目录事实过滤非confirmed对象，readChildProgramIdentityProjection及applicationProductProjections仍从旧catalog.products取身份／名称。三个消费面确实未统一，不把现有命名ACK当作管理完成。

已向现有TimeWhere Native Host 02交接本机最小接线：同等接纳三类身份，先保存／读取原观察ref→当次唯一nativeId及共用本机对象；不从实例累计多身份集合选择。跨机器问题延后，同名不合并，已有Firefox等配置／阻止键保留。Native独立实施源码及聚焦验证，不制包／安装／部署；公共契约在实际关联核对后集中固定。云端实施边界已写入现有App Runtime DESIGN；仍未提交或发布。

## NOW：时间窗自主控制与文字确认（2026-10-15，已部署，待手工验收）

发布结果（覆盖下方实施过程中的旧状态）：PO批准提交推送部署后，控件1a217f6/PR264、云端0fa1225/PR265已合入master 92a088a3636db4e3faa40062c00a6df5d1d96d5c。精确SHA Guardian/Main CI通过，production运行38709676841成功；仅部署Guardian版本4cec3f5b-0424-467e-b4b1-6caa8bfd8d12及主Pages b01e7e38-7752-4a5f-a510-31d6d9215a3c，无迁移、Runtime部署或家庭配置修改。稳定及deployment域名index/access-config-domains逐字节匹配Git源码，Guardian未鉴权401通过。当前unpacked完整187文件备份核验后更新188个发布文件，保留Chrome生成元数据；1.7.47、稳定ID不变，发布文件树SHA256=1aa00b6b0e8bc8aad456062a6273346c72ee61607c0b015769a37562113c82cd。未重装、解绑或清storage，未自动重载；等待PO重新加载及手工验收。CRX/feed仍未托管；共享Native策略兼容仍待验收，未启用共享执行。

发布授权更新：PO要求提交、推送、部署供手工验收；覆盖本节此前不提交/部署/更新候选的限制。本轮仅Guardian+主Pages及备份后的现有unpacked更新，源码1.7.47；不托管CRX/feed、不改Native/家庭配置/迁移。按精确文件/文档块提交，保留其他工作线草稿。发布审计发现Rest专项仍断言已移除的云端重复间隔/默认继续控件，改为已批准固定60/30及60秒阻断UI断言；跨树本地验证显式指向云端工作树，合入后默认读取同仓源码，不降低覆盖。

最新状态：手动入口获PO具体授权后已实现并完成专项。mode-service143/143、message-router67/67、Rest129/129、typecheck和扩展根检查通过；真实隔离manual-advisory-faUo25专项1/1，覆盖未确认不切换、确认后一次变更、同模式幂等、黑名单优先、Reminder返回目标再确认。首两轮失败分别为未导入getSession和错误黑名单配置源，修正夹具后PO批准第三轮通过；未放宽生产断言或硬限制。模式提交/边界前后审计Matched；原ACTIVE/原账/聚合算法未改。源码1.7.47，未提交/部署/托管/更新当前加载包；Native策略兼容仍独立未完成。

2026-10-15 PO要求继续手动入口修订及提升版本。源码版本提升1.7.47，不提交/部署/托管/替换加载包。手动入口补丁被安全审核拒绝，尚未应用：拟在REQUEST_MODE_CHANGE保留硬配额优先，并在现代timeWindows建议模式下复用当前网页ACCESS_OBSERVED确认/硬阻断决策；网页需要确认时不得提前提交模式。此调用链涉及模式与记账边界，按D-076另列具体授权，批准前不实施、不绕过。旧schedule-only兼容、原始计时、结算与Native协议均不改。

PO已对上述具体调用链单项明确批准实施及验证，覆盖先前安全审核阻塞。旧行为：手动入口直接按目标模式窗拒绝；新行为：硬配额先检查，现代建议配置下真实网页复用现有访问判定，确认/硬拒绝时不提交模式，获确认后仅复用既有提交；Reminder页通过内部布尔上下文标明无Content，选择模式不等于网站授权，返回原目标后正常导航检查。输入/强视频/强音频/弱audible/失焦/最小化/后台/idle/锁屏/checkpoint全部不改；不改原账及历史。风险是误提前或重复提交模式，验证决策前无saveSession/saveConfig/边界intent、确认后同模式幂等、所有硬限制优先，并做隔离真实菜单消息+Content验收。最小文件mode-service.js/message-router.js及直接测试、既有权威文档；不改Native/云端或托管。

路由复核补齐：getReminderOriginalTarget对普通网页也返回url，不能用其真值判Reminder上下文；仅识别本扩展/reminder.html。手动入口优先保留当前真正Reminder页，不选中其他HTTP标签。Reminder重评估的目标若只是需要建议确认，延迟展示至正常目标导航，不向扩展页投递Content；硬阻断仍执行原决策且不返回目标。此导航不写授权或账本。首轮真实专项夹具误用未导入getSession，改为只读guardian_session，不改变生产状态。

手动入口单测143/143、消息路由67/67、Rest129/129及typecheck通过；真实专项第二轮已走通未确认不切换、确认后一次变更、同模式幂等，但黑名单夹具只改派生unsafeList，被customBlockedSites规范化覆盖。已改为正确配置源并增加回读前置，生产黑名单规则不变；按两次失败上限请求第三轮复验，未经通过不标记真实专项完成。

PO要求补齐控件共享弹层并复核全部实现。实施清单：content.js共享browser presenter改为相同手动文字输入/禁粘贴与拖入/确认按钮，Escape不得取消确认；shared-reminder-content-bridge.js在控件消息外层验证confirmationText并剥离后调用原协议，确认显示能力版本防止旧Content绕过；继续复用Service时钟、可见ACK、实例及sender隔离，不伪造timeout操作、不修改Native或共享契约。增加真实隔离unpacked Content+SW桥接验收（Native响应为夹具，不能宣称真实Native验收）及桥接单测。逐项审核云端配置/导入导出、时间窗范围授权、日周合并、60/30节奏、超时、硬限制和所有弹层。共享Service超时策略/节奏未能证明与新口径一致的项必须明确保留依赖，不以UI通过关闭。

补查定位：Content ready恢复旧时间窗弹层前未核验身份/当前关闭区间，可能向新页面恢复旧确认；补核验并撤销过期展示，不强行阻断新对象。旧提醒状态无acknowledgementCount时，已有确认被误当首次；按已有lastAcknowledgedUsageSeconds补计数，保留既有阈值。结束已完成但页面不需导航时补清理旧弹层。以上仅修改提醒状态与展示，不改网页会话或账本。

本轮实施审计：Matched——控件自有/共享browser弹层文字输入、禁粘贴/拖入、共享Escape防绕过、后台精确校验及旧Content能力拒绝，Native载荷仍为既有身份+action；Matched——普通Rest日周状态、合并提醒、60/30节奏与60秒阻断、身份/关闭区间复核、云端导入导出废弃字段规范化；Matched——硬配额/黑名单/停用优先及账本不改。验证：Rest129/129、模式103/103、授权与纯判定、共享桥接/生命周期、两树typecheck、根目录/diff及云端UI通过。C盘隔离真实Rest专项1/1通过；共享实际Content DOM＋mock runtime桌面/390px通过，截图已目视，但不替代真实SW/Native。D盘曾Free=0，已仅清理本轮两份可重建失败扩展拷贝、保留Profile及旧证据；测试支持C临时目录。共享unpacked专项两次在SW启动前失败，已请求PO批准诊断复验；未标为通过。

后续PO批准共享专项诊断复验：全部隔离包/Profile/报告迁至C盘临时目录后，真实SW+Content+后台桥接专项1/1通过（shared-typed-0EQCAS）；覆盖显示ACK、错误/缺失文字防绕过、禁粘贴/拖入、Escape不可退出、日周合并、文字继续、主动结束、Service超时结果清理及原Native载荷不增加文字。桌面/390px截图已目视，无溢出。Native响应与执行为隔离夹具，timeout_end为模拟结果，不代表真实Service计时或真实阻断已验收。D盘满与先前启动失败相符，但没有据此宣称已独立证明每次失败的唯一原因。本轮只更新验证记录，不新增产品修改或重跑无关测试。

Missing/待接管——现有共享契约只含单一repeatReminderMinutes和continue/end超时策略，不含60/30分阶段、时间窗自主字段及首次/超额/四项展示证据；不能由控件伪造Native策略或据此宣称端到端一致。此前Popup/Reminder手动入口缺口已由顶部最新单项修复及真实专项关闭，不再作为未实现项。旧固定契约Content浏览器脚本已适配文字与Escape，但当前未执行该脚本。不提交/发布/更新加载包，所有并发草稿保留。

目视复核发现本地自主配置底线区仍有旧“时间窗始终生效”说明，改为明确按强制/建议配置执行，停用时间始终强制；仅对齐已批准文案，不改变运行逻辑。

中等跨模块策略/UI变更，职责extension-local及standard-cloud分树实施。清单：autonomyConfig.timeWindowAdvisoryEnabled默认false，全部类型时间窗建议模式；硬限制优先；当前tab/对象/关闭区间有界授权、配置变化复核；统一输入“适合使用”确认，禁止粘贴/拖入，60秒无响应强制阻断；日周/时间窗合并提示；软提醒首次确认后新增60分钟、以后新增30分钟；云端编辑、导入导出、本地只读说明同步。已有旧continue与repeat字段仅兼容，不控制新提醒。授权前不变更模式，授权后重新走现有访问路由，不直接写配额或记账。

最小测试：新增自主控制纯判定/授权、实际mode路由、Rest状态及Content文字交互、Worker配置/导入导出专项、Admin、typecheck和隔离桌面/窄屏目视。排除全量/真实家庭配置/Native/发布/候选更新。不改ACTIVE、idle、焦点、segment、聚合、上传确认；发现需要变更记账线立即停止该项按D-076单独批准。保留当前两树未提交草稿。

Rest真实unpacked复验仍待通过：获批的模式恢复夹具已改为真实Mode Service接口；本轮在首次提醒前发现测试窗口focused=false，生产路径正确返回no_foreground_rest_session，未执行后续恢复与硬限制断言。夹具补充窗口聚焦、ACTIVE及tab/window身份一致的显式前置检查；不放宽生产焦点规则，不把此轮记为验收通过。证据保存在隔离.tmp/rest-unpacked-mESfIe/diagnostic-events.json；下一轮需获批后运行。

后续PO批准复验已通过：rest-weekly-unpacked真实SW/Content专项1/1，覆盖日/周/合并、跨日周、文字继续、60/30分钟用量节奏、真实60秒超时、结束及继续时硬时间窗拒绝。证据.tmp/rest-unpacked-rku8lj；用量/日期加速夹具不证明计时精度。Rest单测123/123、Reminder单测91/91及浏览器门14/14、Admin桌面/窄屏1/1、终端配置专项、typecheck、扩展根检查和diff通过。Admin与合并弹层窄屏截图已目视，旧时间窗说明已对齐。职责审计：未改ACTIVE/原始分段/聚合/上传；当前加载候选、家庭配置、版本及生产未改。

未收口边界：Native主导的共享Rest提醒仍使用旧滑动流程及其契约，本轮未修改Native/共享契约，不能将其标为文字确认或60/30节奏已通过。当前验收仅覆盖扩展自有Rest与网站建议时间窗；整体发布前须单独处理共享提醒兼容边界。本轮不提交、不部署、不托管、不更新当前加载包。

## COMPLETED：停用与黑名单阻断页关闭按钮（2026-10-15，当前unpacked已更新）

仅修改reminder.js中downtime/unsafe（含blacklist别名）的动作：显示“关闭此标签页”，通过tabs.getCurrent/remove关闭当前页，失败留在阻断页显示明确错误，不执行history.back或导航兜底。普通确认、时间窗和配额页返回行为不变，不改记账、配置或Native。PO要求继续完成提交推送及当前unpacked更新；完整备份核验后仅同步reminder.js，不重装、不清storage、不改版本/云端/托管feed。

验证：Reminder单测91/91、完整Reminder隔离浏览器门14/14（真实当前页关闭、blacklist别名、缺当前tab/关闭失败留页），补齐黑名单截图专项1/1、typecheck/diff通过。停用与黑名单桌面/390px截图已目视，无溢出。实施审计全部Matched，无额外行为变更；原并发文档草稿保留。当前1.7.46 unpacked完整187文件备份并逐文件校验后，仅同步reminder.js，SHA256=00b21444dd97ea2d1118f34ebf021926dfb051d38b271c3acfab805ac133dde6；其他文件、身份及storage未变。已打开旧Reminder页仍需刷新以载入新脚本，不卸载、不重绑。

## COMPLETED：停用配置同版本补齐修复（2026-10-15，当前unpacked已更新、待重载）

配置原始下发/规范化保留downtimeConfig，但shouldSaveDespiteVersionSkip只检查默认网站清单；同版本元数据存在而guardian_config缺少/错误停用字段时会跳过，已可用隔离pullCloudConfig复现。增加停用字段的规范化对照，仅在完整版本等于已应用版本时允许补齐；云端更旧响应不得因停用差异覆盖新配置。新增实际pull路径专项，保持其他终端私有字段、站点配置与配额不变。现场原因等待终端表现确认，不通过修改家庭配置或清空缓存取证。

职责extension-local；只改云配置读取与直接测试，不改网页计时/记账/上传确认或Native。新增pullCloudConfig补齐/退化/失败/关闭/跨版本专项、已有Admin配置读取与typecheck通过；逐项Matched，无额外语义修改。PO已批准验证后提交合入master、部署云端编辑并备份更新当前unpacked；不托管、不升级版本、不修改家庭配置。现场生效仍需当前扩展重新加载后确认。

源码b9279a8，经PR261合入ec69f71；当前unpacked完整187文件备份并逐文件校验后只更新infra/cloud-sync.js，SHA256=09b35db0178d08b2ed78c6502f2c7065e3705db28740be09f71acad4a1938b69。manifest及部署身份未变、storage未动，未自动重载。主Pages修订生产38617013395成功，托管feed仍未更新；现场恢复不能用源码专项替代。

## COMPLETED：停用时间编辑可用性及同步补齐（2026-10-15，源码与主Pages已发布）

已证实UI缺口：关闭策略同时禁用所有编辑；numeric键盘无冒号；无批量复制；每次Tab重渲染丢草稿；保存回读不校验版本，晚到响应可能覆盖新状态。按本功能单项修订，不改变周时段/类型例外/记账语义。实施清单：原七天和例外均保留，改原生时间选择并独立选择结束24:00；从所选日复制到工作日/周末/全周（替换需确认）；关闭也可编辑；空新增行忽略、半填/非法逐行报错；同档案Tab保留草稿，版本变动拒绝覆盖并提供明确重新载入；保存单在途并校验回读版本。同步专项由extension-local完成，不修改生产家庭规则。

最小测试：downtime-config 16/16、新隔离真实页面编辑/保存测试及桌面/手机截图通过；24:00直接显示，不显示易混淆的00:00，手机重新载入按钮不折行。逐项审计Matched，无Missing/Extra。PO已批准验证后提交合入master、部署主Pages并备份更新unpacked；不托管、不安装Native、不修改家庭配置或ACTIVE/账本/聚合/配额。现场终端原因未读取前不冒称已确定。

## COMPLETED：三项云端发布与控件停用候选更新（2026-10-15）

- PR #258/#259已按PO明确授权合入；production 38610781351基于master 9fbac07成功，精确Runtime/Guardian/Main CI通过。唯一0022已执行，部署后只读无待迁移；Guardian/Runtime/两套Pages均成功且smoke通过。
- 公开停用模块及两套Native命名脚本在稳定域名/deployment域名与源码逐字节一致。CRX/feed未改，线上托管仍1.7.45；R2 latest仍2.3.1。
- 1.7.46本地unpacked候选已完整备份并更新7文件，身份、绑定与storage未变；未自动重载，真实终端生效不能提前确认。停用默认关闭，家庭配置未写入；Native应用关闭/原账对照实机验收仍待完成。
- 提交审计：无未授权产品语义或历史账修改；配置14、Pages242、配置域30、真实路由/并发、3项CI夹具及隔离周提醒UI smoke通过；控件Reminder浏览器12/12、相关单测/静态检查通过。旧失败已按PO授权与真实依赖修订，不降低断言。
- 已恢复原三份云端草稿，autostash恢复副本保留。本条仅记录已发生发布，详细版本见PROJECT_MASTER顶部；不顺带合入旧治理草稿。

## 停用时间网站接线说明同步（2026-10-15）

发布CI定位：device-shared-access-policy及rest-weekly-cloud的隔离夹具遗漏真实downtime默认值依赖，runtime-management-loader遗漏网站编辑的新辅助函数；仅补真实依赖/空保护配置夹具，不改路由、配额或分类行为。修订PR职责为architecture-integration＋standard-cloud并列精确测试例外。PO批准三项云端一起发布，并明确批准唯一生产0022及Runtime Worker；GitHub凭据正常，先前受限环境检查是假阴性。最小复验为上述三项失败专项，通过后提交测试修复、等待CI，生产workflow仍为精确master SHA门禁。

三项隔离单测复验及对应CI已通过；周提醒后续UI门定位file://夹具未允许本地ES模块，新增模块因CORS未加载导致导出失败。仅为隔离浏览器添加allow-file-access-from-files并等真实模块就绪，所有HTTP请求继续阻断，不改生产页面或削弱业务断言；复验该单一UI smoke。

PO已批准更新、提交、部署。配置专项14项、Pages242项、配置域30项、真实路由权限/CAS/审计及typecheck复验通过；仅提交本次停用配置补丁，其他Native命名/历史治理草稿与未发布提交不得混入停用上线。生产workflow要求master精确SHA及对应CI；GitHub CLI当前认证失效，尚未执行部署，不把源码提交写成已上线。

PO要求独立接入控件网站门禁，配置页不再将所有终端执行统称待接入；改为提示网站需新控件支持，Native应用执行仍待接入。本批仅调整该说明，不部署、不变更生产档案，不以源码已实现推断设备已安装。

## 停用时间配置（2026-10-15，standard-cloud，配置源码完成；执行未接入）

- PO已明确要求云端与控件新增配置项，首阶段只支持网站/应用类型例外，非例外应用采用关闭方式。云端仅配置与下发，不结束本机程序、不启用真实家庭策略。
- 实施清单：新增downtimeConfig严格校验/默认关闭/白名单保存，复用版本冲突和审计；Pages停用时间Tab、七天多时段、两类例外、独立保存；配置导入导出与旧备份不覆盖；中文文案及桌面/手机目视。
- 最小测试：新增downtime配置/IO专项、pages-config-v12-fields与配置并发直接专项、typecheck/diff；保留已有未提交文档及契约包，不提交/部署。控件只读展示由extension-local阶段实施；跨Native执行契约/能力与实际关闭仍未实施。
- [x] 源码完成：新增pages/downtime-config.js供Pages和Guardian复用同一校验/规范化；profile白名单与默认关闭、整份替换，独立保存sourceAction=downtime_config_save；配置域只允许综合访问导入停用策略，旧备份缺失不覆盖。Pages新增停用Tab、七天多段、类型复选框、次日标记及错误提示。
- [x] 验证：downtime-config 14/14、Pages配置242/242、配置域30/30；真实Profile路由内存SQLite验证权限隔离、版本冲突、非法配置不变、幂等/整份替换和审计；typecheck与本任务diff通过。
- [x] 隔离Playwright CLI在1440px/390px验证新增删除、8:00→08:00、24:00保存、无效起止拒绝与手机换行，新面板无水平溢出；桌面/手机截图已目视。证据在本机临时toc-downtime-cloud-*.png，不是生产/Native验收；测试服务和浏览器已关闭。
- 实施审计：配置编辑/校验/保存/导入导出及终端只读均Matched；实际网站阻断/应用关闭为未接入，配置状态明确“执行待接入”。未修改Native/共享契约/账本/配额、候选/生产配置；不提交/部署。当前工作树另有其他会话的并发改动，按文件保留，不混入本任务。

## COMPLETED：Windows本机应用身份云端命名接入（2026-10-15，本批已发布／安装／实机贯通）

PO在Native Host 02明确授权架构推进；固定95cca6e汇总已读取，96静态／86潜在覆盖不作为运行识别率。职责architecture-integration＋standard-cloud，复用现有云端分支，不新建worktree。先文档再代码：新增独立兼容命名契约和能力→已认证实例范围的接收／单调更新／显式失效→实例命名读取→共用管理组件展示→Native固定契约最小生产者交接。保留现有未提交文档草稿。产品统计名称及投影未改，不把多项实例命名变成产品数量。

必要本地验证：新契约及兼容、Runtime本机命名专项（实际隔离D1和route）、既有program-instances、共用knowledge页面专项／隔离目视、契约与Worker typecheck、Worker dry-run及diff。不跑网页原账／配额／Native安装器／无关全平台；不改变管理阻止键，任何动态命名不成为产品权限。新增0022仅源码，生产迁移／发布／安装本轮未授权。

本地结果：契约1.48.0及两项固定canonical哈希向量PASS；Worker新专项和原实例47/47 PASS；knowledge组件14组直接回归PASS；build/typecheck、Runtime dry-run、模块边界和diff通过。实际机器鉴权route→D1持久化→家长会话实例GET已隔离贯通，已有productId/descriptor/Verified/原实例字段逐项不变。桌面及390px手机mock截图已目视：明确名称、动态名称、多项命名、缺失/不可读与XSS转义；4卡片，无错误，scrollWidth=390。截图在agent-browser本机临时目录，不入Git；没有使用真实家庭或实际Chrome Profile。初测失败来自两项旧能力断言、两项排序断言与helper转义作用域，修正后通过。

Matched：独立命名接收/隔离/修订替换/显式失效、现有管理键不变、实例页面读取及目视。Deviated/Extra：无（本批源码边界）。Missing：Native持久生产者及真实上传、生产0022/Worker/Pages发布、实机验收；不能称产品归属全集或完整端云链已完成。Native固定交接要求精确原ref/代际/scope→受理instanceId，不从有限历史拼全量；本机源顺序不可证明时保留冲突；超限不截断，云端仅带日期显示最近登记。旧275扫描核验、Mac、共享和历史重建不恢复。

2026-10-15接收Native最终源码：main远端实查为`ea2742d193bfb19e1daecc6195b941af3c47d27d`，契约包SHA与本批固定包一致；逐项比对本批17个C#源/项目文件与隔离测试导出，全部一致。读取原始TRX：最终1.48组合91/91、旧1.47兼容26/26，无失败；重叠用例不相加。新增独立Agent命名序列/队列、冻结完整scope、精确ref/代际关联、原实例受理后发送及完整scope ACK已提交。架构抽查发现原慢哈希解析无隔离await命名ResolvePending的耦合，Native已最小修正，仅隔离非取消异常；SQLite缺列/JSON缺必填两项真实Service故障注入通过，原捕获成功、命名不假ACK。已核对日志写入也是best-effort，不让诊断失败改变原解析。

上段Missing中的“Native持久生产者”已由固定源码及隔离证据收口；尚缺实际新版运行上传、生产专项0022/Worker/两套Pages发布及真实页面联调。已安装2.6.50不含本次上传代码，没有新候选或安装；不能称线上链路通过。Native报告[固定接线与验收证据](D:/Codex/TimeWhereNative/agents/windows/WINDOWS-NATIVE-APPLICATION-NAMING-1.48-2026-10-15.md)。队列维护、显式撤销后的恢复及Mac未验单列，不重新启动旧全量核验；任何后续发布需明确专项生产范围，不能顺带应用其他迁移或改共享开关。

2026-10-15 PO已集中批准本批Runtime Worker、两套Pages、唯一专项0022及一个最终Native候选安装/真实联调；原账、分类/封锁键、配对、R2和共享开关不变。生产待迁移实查仅0022。云端工作线及PR259另外含停用时间/网站编辑，不能捎带本批部署；复用已存在且无工作树/开放PR占用的codex/d114-integration，通过独立临时Git索引从当前master接入本批19路径，保持现有云端分支和所有草稿不动，不新建分支/worktree。部署只取本批已集成master SHA，复用精确代码证据；Native2.6.51由固定ea2742d导出，安装及真实ACK仍待实际证据。不重复全平台/原账测试，也不因纯证据文档追加重跑。

最终实证：准备期间主线并发合入控件PR258，再合入PR259至`9fbac07b9eeb4d14007685cb379025b016404490`。本批backend/console/contracts与固定dcb933b逐文件无差异，复用该实际主线及通过CI；自己创建的重复PR260未合并并已关闭，不回滚或删除其他提交。PR附件工具已达100项上限，链接仍可在任务板查询，不因此重复创建PR。

生产运行`38610781351`成功；清单确认唯一Runtime migration=`0022_runtime_native_application_identifications.sql`，Guardian migrations为空。Runtime Worker=`afda75fe-d246-4d34-a797-6932c6804c03`，Runtime Pages=`2064dcb5-002a-4548-93a8-aaa6c311b7f7`，主Pages=`d461b99b-3d48-4fb3-9027-d241f54ef06c`。同期生产运行还发布Guardian=`3802a931-db24-453f-89f7-8641f2ce3850`，不是本任务额外发起的部署；如实登记此并发环境变化，不声称其他资源均未变化。未再次部署资源或重执行迁移。生产回读0022已登记、命名表及两个trigger均在、无待迁移；两套线上命名JS均89202字节、SHA256=`feab341266aa63fc69169f428b59e8ce384563e7c42e5d36626ff864487e40d3`，与该master源码逐字一致。

唯一Windows内部未签名候选2.6.51，源码`ea2742d193bfb19e1daecc6195b941af3c47d27d`、契约1.48.0，EXE SHA256=`cc9d5a788f31428a989caeae9bc372ddfb6a2c13caeebbaccefdf05b54b618d8`，120579379字节；MSI SHA256=`e90114d095ec50547c39c681d1364f0248b573427265f409dae46e6444b33e02`。已安装2.6.51.0，退出0、Service Running、11正式组件版本/哈希匹配，受保护备份及13表保留核查通过；配对Credential/HMAC、原账前缀、冻结版本和outbox主键保持，队列状态可自然推进。没有新中间包、R2 latest写入或共享启用。

真实当前Windows孩子范围：ChatGPT原ref/代际/完整scope匹配→实例注册精确ACK→命名revision=1/canonical payloadHash验证true、received/null、pending=0，无cloud-newer或错误。普通可读Native脱敏JSON已独立复读，实证文档已推送`f9a0d2d4630d294c318381d256a44442476f2eed`。已登录内置浏览器两套页面均通过实际分页显示同一ChatGPT名称、明确状态、两条依据及相同登记时间，原产品归属仍ChatGPT、目录版本11未改；独立页另实际显示ShellExperienceHost动态程序名，云端产品仍未识别，没有提升为可封锁产品。只读导航，不保存规则或配置，原页面未保存草稿未动；新验收标签保留，界面截图只截无账户/孩子/实例ID的命名小块、不入Git。

线上Guardian版本只读回验`SHARED_ACCESS_EXECUTION_ENABLED=false`；派生贡献接收开关仍true，不能混称共享限制已启用。发布清单R2 latest仍2.3.1，本任务无写入。Matched＝本批源码/契约/0022/唯一安装/真实精确ACK/两套命名页面；Deviated＝无本任务代码语义偏离；Extra环境事实＝同期其他发布还更新Guardian；Missing＝扫描全集识别率、全部产品归属纠错、完整统计/共享及Mac验收不在本批完成结论。Native队列长期维护/撤销恢复等既有边界仍后续跟进，不借本次上线宣称全集应用身份或共享完整通过。

## COMPLETED（本地实现／隔离验证，未部署）：网站分类删除／移动与有效审批规则一致性修复（2026-10-13）

PO已授权修复。职责：standard-cloud；复用现有云端工作树。页面删除自定义主机或移动分类时，目前只改custom清单，遗留同目标`siteClassificationRulesV1`阻止重新添加且可能继续生效。先更新本条再实施，不修改审批历史或网页记账线。

实施清单：`pages/index.html`精确目标识别→删除／移动同步移除该host有效规则，由custom清单表达新分类→网站保存一次提交清单和有效规则，沿用expectedVersion与配置审计→没有custom清单的host规则在所属分类中可见并可删除／移动。保留系统配置、父子域、精确URL及YouTube对象规则；不得绕过重复或父域保护校验。

变更等级：Console配置操作。最小验证：页面实际函数隔离回归（删除→保存→读取→重新添加、四分类移动、规则单独存在、URL／父子域／系统隔离、版本冲突）、既有site-access-conflicts与pages-config-v12-fields测试、页面脚本语法及git diff --check；使用隔离mock做桌面／移动目视核对。必要CI仅页面相关；无部署smoke，本次不发布、不直接修改家庭配置，不跑原账、Native、安装器或产品全量测试。

结果：`pages/index.html`删除／移动仅撤销精确同host的有效规则（与既有www／m别名语义一致，wildcard独立），新分类由custom清单表达；同一PUT同时提交清单、剩余有效规则及expectedVersion。仅规则存在的host可见、可删除／移动，同分类custom／system已有条目不重复显示。添加入口拒绝仍已归类的host，不暗中移动。受限／黑名单父域与wildcard子范围保持保护；精确URL、YouTube和其他用途规则没有被主机操作删除。历史审批表不写入，Worker版本／审计路径复用。

聚焦证据：`node tests/unit/pages-site-classification-edit.test.js`11/11、`node tests/unit/site-access-conflicts.test.js`12/12、`node tests/unit/pages-config-v12-fields.test.js`242/242 PASS；新增回归实际执行页面函数并用既有共享分类读取器验证有效结果。测试适配曾误传归一化包装对象，修正为读取`.config`；父域场景捕获到页面旧matchDomain只做精确／wildcard匹配，补充明确父域保护后通过，不放宽共享校验器。

隔离mock浏览器：真实点击删除127.0.0.1→保存（版本8→9，一次PUT包含规则）→重新加载→学习添加并保存（9→10）；移动端仅规则host归学习并保存（10→11），原URL规则保留。桌面1440×1000、移动390×844截图已目视核对，移动scrollWidth=390。证据位于忽略目录`.tmp/site-edit-desktop.png`、`.tmp/site-edit-mobile.png`、`.tmp/site-edit-mobile-result.png`；仅模拟档案，本地接口，未使用登录Profile。Matched＝精确操作／可见性／原子保存／并发保护／隔离验证；Deviated/Missing/Extra＝无（本地修复范围）。本批代码、测试及本条记录集中本地提交，其他既有文档草稿保留；未合并、未部署、未做真实家庭在线验收。线上仍需发布后复验，不将mock称为线上通过。

## 停用时间网站执行接线（2026-10-15）

PO追加授权更新、提交、部署；先按当前主线规则修订4项过期Reminder浏览器断言并复验，只改测试不改产品行为。云端仅部署Guardian/主Pages，本地生成更新候选，不托管CRX、不修改家庭停用开关。分别提交本功能补丁，保留其他并发草稿。

- PO要求实际接入网站阻断；不再以Native依赖阻塞独立网站门禁。
- [x] ACCESS_OBSERVED中检查有效网站类型，黑名单优先，停用拒绝先于配额。
- [x] 到点/启动/配置变更复核已打开页面，例外后台页面不触发模式切换；分类记录变化也复核。复核失败30分钟限频脱敏提示，不阻塞bootstrap。
- [x] Reminder显示独立停用原因与北京时间结束时刻，无继续放行；Admin区分网站已接入和应用未接入。
- [x] 路由91项、downtime19项、执行器、Admin、bootstrap34项、Reminder单测91项、typecheck、扩展根与diff通过；云端配置14项复验通过。
- [x] PO单独批准修订过期测试并复验：指定Reminder浏览器门12/12通过；只按HEAD现行行为修订study_mode/受限确认的旧断言，不改产品行为。前次EPERM及4项失败保留为历史记录，不再是当前阻塞。
- 实施审计：网站接线/边界复核/类型例外/独立Reminder为Matched；网页计时、原始账、聚合、上传、Native、生产配置和版本未改。浏览器截图.artifacts/downtime-reminder-desktop/mobile.png已目视核对；这证明Reminder UI，不是真实停用到点与原账精度完整验收。当前运行候选未更新，不提交/部署。

提交范围仅本次停用策略、门禁、只读UI与直接测试文档；已有1.7.46候选生成说明草稿保持未提交。PO已批准提交与云端部署；CRX/feed不在本次范围。GitHub CLI现有凭据失效，不能绕过生产workflow门禁；GitHub连接器可读写仓库，后续核实提交/PR和部署通道。

## 停用时间第一阶段（2026-10-15，PO批准应用关闭；待跨端契约）

- PO追加要求：云端与控件增加配置项。当前批次为Guardian/Pages独立downtimeConfig存储/校验/编辑/导入导出和Admin同步只读Tab；分别在既有standard-cloud与extension-local工作树实现，不发送其他会话。共享Native契约、实际网站阻断/应用关闭仍单列未实施，不以保存成功伪报执行成功。

- [x] 功能边界：独立停用时间策略；首阶段仅网站类型/应用类型例外；例外只通过停用层，现有黑名单、时间窗、硬配额继续生效。PO选择关闭不允许的应用，不采用保留进程遮罩。
- [x] 只读核对：现有共享访问严格契约没有停用字段；Native已有核验前台应用正常关闭/强制结束能力，尚不构成全部用户应用的到点/启动限制。两者不能通过单方扩展字段或批量杀进程代替完整接线。
- [x] 已在DECISIONS和docs/DESIGN明确实现规格、枚举提案、浏览器容器、保护进程、策略撤销、离线和验收边界；保持已有未提交发布记录原样。
- [ ] 架构固定独立停用配置/能力/执行状态契约；再由标准云端、extension-local、native-local各自实现。现有D-109/D-105不授权本控件会话越线修改Native、云端或契约。
- [x] 配置源码：Guardian严格校验/独立保存与既有审计、Pages停用Tab/星期多时段/类型例外/配置IO已在standard-cloud工作树完成；Admin同名只读Tab和同步字段保留在extension-local完成。默认关闭，当前候选/线上未更新。
- [ ] 控件网站门禁/到点复核/Reminder；Native已运行/新启动应用的核验关闭；跨Native停用能力/执行状态仍待接线。
- [ ] 隔离程序及网页真实验收，缺少Native或控件能力必须显示未覆盖；不改账、不改版本，不自动提交/安装/部署/托管或启用真实家庭策略。
- PO后续选择：仅准备当前控件部分，暂不向其他会话发送。先实现extension/core/downtime.js纯判定与tests/unit/downtime.test.js；内部输入适配草案不作为跨端契约。不接运行入口、不覆盖候选，Native/云端接线仍未实施。
- 控件实施清单：默认关闭与非法配置区分；北京时间周时段、跨午夜/周边界、24:00与重叠连续时段；类型例外与未知默认拒绝；下一边界与连续结束时间；纯判定不写存储、不发送消息、不产生进程或网页动作。验证仅新增专项、语法与diff检查。
- [x] 控件准备完成：新增extension/core/downtime.js和tests/unit/downtime.test.js；16/16专项通过，包括北京时间在UTC/洛杉矶/上海三种宿主时区结果一致、周日跨周连段、全天整周不伪造结束时间、配置修改即时重算及冻结输入未改变。
- 检查通过：`node tests/unit/downtime.test.js`；`Get-Content extension/core/downtime.js -Raw | node --input-type=module --check`；`git diff --check`。纯判定模块没有UI或运行入口变更，未跑全量/平台/进程动作测试。
- 实施一致性：本轮“仅准备当前控件、不发送”范围Matched；未改网页计时/原账/聚合/配额、现有候选、Native、云端和共享契约。完整停用功能仍Missing：跨端契约、配置UI与下发、实际网站阻断/到点复核及应用关闭，不能将16项单测称为真实整机验收。不提交、不发布。
- 上述第一批记录由PO后续配置范围更新：配置UI及Guardian字段已完成，Native/网站实际执行仍未实施。最新验证为判定/配置读取19/19、Admin新增只读专项及真实同步规范化、导航10/10、typecheck/扩展根检查；两侧桌面与390px窄屏隔离截图已目视，新面板无溢出，Admin整页既有手机侧栏压缩保留。不修改当前Chrome候选，未重载/安装/部署/托管，未发送其他会话。
## 2026-10-11 扫描全集映射首次实证：未通过

补证离线闭环已完成（取代下方“调用方不可读取”的当前阻塞）：PO另准一次UAC，仅比对固定SHA受限文件与主控制台目录11已读13条规则；无数据库访问、重采、ACL修改或生产写入。根会话普通权限独立读取catalog11-offline-anonymous.json并逐行汇总：275行均有登记ACK及证据修订一致，10单目标、265无匹配、0冲突；275映射状态与快照一致，10命中目标名称一致。输入规则未包含稳定productId，故不宣称产品ID逐值一致；规则执行一致也不等于Codex→ChatGPT业务归属正确。现在可确定这265项是“现有13条规则不匹配已有核验字段”，不是本快照的传输延迟、缓存过期或匹配器漏执行；仍不意味着每项都有充分产品证据可直接补规则。未命中来源按实例非加总计数：机器注册表41、用户包126、用户注册表7、公共开始菜单80、Steam9、用户开始菜单17。509无关联条目仍独立保留；未将包容器、技术对象强行建成产品。匿名逐项结果与原受限证据均保留本机，不进入Git。

PO批准一次补证后，Native单次入口已完成新的只读事务导出：806条目、275实例、300关联，275项保留实际核验字段与ACK/映射版本，自检仍10confirmed/265unresolved。受限文件SHA256为4622fc1434a8f13d791258e61ffefc980d41b4d7a0a2eee33f4407f3afc2c8a7。交付失败点：文件仅SYSTEM/Administrators可读，根会话被Windows ACL拒绝；管理员入口PID352已经终止且无持续处理通道。故只有文件生成完成，目录11逐项交叉核验未完成，不能称补证闭环。未改ACL、未再次UAC、未重读数据库。最小接续只需对这份既有固定哈希文件与已读取目录规则做离线比较并返回匿名结果，不需再次采集；额外管理员入口需PO明确许可。

同批隐藏入口核查完成，根会话回读三份受限safe JSON：CodexCoreCommandRunner具有有效OpenAI签名、同包声明的codex-core-command-runner.exe命令别名、无开始菜单入口，PE产品字段为空；支持专用命令部件候选，不编造PE依据。Xbox AppL声明XboxPcApp.exe，签名有效、PE产品为Xbox App，并声明服务／协议／全信任扩展；WidgetsApp声明XboxGameBarWidgets.exe，签名有效、PE产品为Xbox App、描述为Xbox Game Bar Widgets及7个appExtension。两者均隐藏但有实际可执行文件，支持按专用部件原则补精确AUMID→既有XBOX规则，不归到独立Game Bar，不创建同名新产品。当前目录只覆盖Xbox主入口App，确有规则覆盖遗漏；不需因此改采集或安装新包。Codex规则纠正及新身份的学习分类仍待PO答复；未保存生产规则。其余扫描全集继续保持未通过，不以三个入口结论替代全集。

未识别集合继续分组（仅使用已读取云端295实例，不新增采集）：283未识别按完整AUMID优先、其次文件系列、最后文件hash归为269个核验组：121个AUMID组含123实例，87个文件系列组含99实例，61个hash组含61实例；这些是审查组，不是产品数量或新增归属。AUMID涉及83个包家族，多入口不能按包名直接合并。具体发现同Codex包另有CodexCoreCommandRunner入口（证据2、有扫描引用）未识别，而App入口误指向ChatGPT；故不能只改一个显示名就认定Codex所有部件归属完成。已交Native复用同包公开manifest核对第二入口专用辅助性质，普通权限，无新UAC/保护库/整机扫描；未修改规则。

规则纠正影响已只读核实：主控制台重新加载目录11未编辑草稿，ChatGPT产品资料当前为客观类型other、普通应用、当前孩子明确分类study（学习）。客观类型other不是“其他时间”。因此直接将Codex规则迁到一个没有孩子配置的新产品，会改变现有分类行为，不能当成纯名称修正发布。纠正方案须明确保留ChatGPT产品和配置，并单独确定Codex应继承的当前孩子分类；未修改任何草稿值或生产值。浏览器工具拒绝了附带保留标签标记的组合调用，随后按审核建议仅执行配置只读读取，成功取得上述值；未绕过权限。

Codex定向证据已回读：Native普通用户权限读取公开安装包和声明入口，受限安全结果`codex-package-safe.json`显示准确AUMID对应唯一包，Store/Ok；manifest和开始菜单标签为ChatGPT，但实际声明入口具有有效OpenAI签名，PE ProductName及FileDescription均为Codex。不能以安装标签确认ChatGPT归属，也不能以Electron的OriginalFilename=chrome.exe归到Chrome。结合目录11的该AUMID→ChatGPT规则，已定位到规则目标／产品元数据的语义矛盾，不是传输或映射器未执行。已进一步核对读取的完整13条目录规则：ChatGPT仅此一条Windows规则，无该目标的Mac规则；当前孩子295实例中仅一个命中此目标，证据修订2且AUMID一致。此结果不覆盖其他孩子的历史映射及产品配置引用，仍不得直接全局改名。最小纠正候选是将该确切规则指向独立Codex身份，保留ChatGPT身份和既有配置，正式修改前核对分类／限制影响；本轮未改目录或第三层映射。

第一步分项处置：已登记未识别实例优先补可靠规则，不能靠重复安装解决；扫描未关联条目须先区分非执行对象与捕获失败，不能按无链接总数补造实例。现有完整扫描导出采用匿名编号且不含匹配值，无法与云端295实例精确连接，这是本次核验材料的缺口，不是新增产品身份层。当前证据可证明覆盖未通过及上述错误目标风险，不能交付“275项逐项规则修正清单”。停止以局部产品展示通过替代此验收；原账、上传既有证据保留，不重复实施。

云端逐项规则复核：通过已登录主控制台正常分页只读获取6页（50×5＋45），每页目录11，终页“下一页”禁用，295个实例ID互异。以页面加载的13条未编辑规则在会话内逐项比对实际verified证据：12实例单产品命中、283无命中、0冲突，与页面confirmed／unresolved逐条一致，无已匹配却未生成映射的反例。此295为当前孩子云端登记全集，不冒充受限快照275扫描实例；本地匿名导出缺ID和字段值，尚不能精确连接两份全集。283无命中中99具hash＋文件系列、65具hash＋AUMID、58具三字段、61仅hash，不能笼统称没有采集到依据。具体完整AUMID包括Outlook、Store、Paint、Photos等，正式目录没有对应匹配规则；这些字符串只证明规则缺口，尚不替代独立产品／部件归属审核。此次为只读证据对照，无生产规则、映射、配额或原账写入。

根因范围进一步明确：application-classification.ts:315的正式匹配器只执行启用平台规则精确比较；programInstances.ts:325从持久化目录ownershipRules和登记evidence_json生成映射，v2Routes.ts:816–817登记后实际调用。app-runtime-knowledge.js:29起旧转换仅支持单条件hash／完整AUMID／文件系列，其余留未转换；:85起“已核验依据”只是给人工选取规则提供候选，:101起才加入明确目标产品草稿。当前没有“所有扫描到软件自动补齐产品规则”的这条链，扫描成功不等于第二层规则建库完成。10/10允许未知暂留只解除目录切换阻塞，不能被当成全产品归属已交付。现有源码比对不代替部署SHA证明，线上逐条数据比对则直接证明此次读取范围的匹配状态。Codex指向ChatGPT继续作为疑似错误目标单列，未擅自改名或归属。

正式目录补证（取代下方登录／规则读取缺口的当前状态）：PO已在内置浏览器第二标签登录，根会话通过“程序实例与未识别项→规则草稿与预览”只读加载目录11，未编辑、预览或保存。此前使用“确定性应用列表”是旧入口，不应据此判断新版规则管理不可用。目录包含23产品、13条启用Windows归属规则，覆盖10产品：Excel三条、Firefox两条，其余ChatGPT、Chrome、Steam、EA app、完美世界竞技平台、Game Bar、Solitaire & Casual Games、XBOX各一条；13个游戏产品仅保留目录项，无启用归属规则。规则类型为3个文件hash、6个文件系列、4个AUMID。可明确判定目录覆盖未完成，但不能将265实例逐项原因直接等同缺规则。

新增待核实归属：现行ChatGPT产品规则匹配OpenAI.Codex_2p2nqsd0c76g0!App。按独立产品原则存在疑似错误归属，需与实际包产品证据核对；命中只证明规则执行，不证明规则产品目标正确，未自行更名或改映射。当前第一页50实例均未识别，包含多个完整AUMID；正式规则及实例依据均可从正常登录页面读取，不需要再次本机UAC。Native确认旧安全导出只含275实例的字段名，不含完整字段值，不能用它离线重放全部匹配；后续须保持扫描全集与云端实例的精确关联，不拿页面全部登记实例替代扫描分母。

补充固定源码与线上只读证据：Native按已安装19f129c定位，user-packages的PROGRAM_DISCOVERY_UNAVAILABLE可由单项文件捕获失败触发整源failed；路径不可取得、捕获失败及共享20秒预算耗尽均可能产生同码，现导出不含逐项原因，不能认定本次就是预算耗尽或整源枚举崩溃。124个包容器按设计不单独捕获可执行实例；117个隐藏组件变体不能一概豁免，和1个可见变体仍需区分是否存在有效可执行文件。5个开始菜单候选中3个只有hostedAppId，属于浏览器托管入口，不应绑定浏览器宿主为独立实例；其余2个依据不足。265个已有实例的未识别映射是另一问题，不与扫描捕获失败混合计算。

PO重新登录后，根会话在Runtime真实页面确认806条/5批、user-packages失败，与本地扫描摘要一致；但“确定性应用列表”明确返回“该入口尚未适配新版产品归属规则”。返回主控制台仍显示登录页：Runtime独立会话已登录不等于主控制台会话可用。未读取凭据、未修改配置，未把旧分类目录显示名称作为新规则匹配证据。正式规则逐项交叉核对尚缺，不能声称265项均已定位为规则缺失；已完成扫描全集覆盖审计，结果未通过。

既有导出离线分组补证：10个confirmed实例实际归9产品（Firefox两实例，Chrome、ChatGPT、EA app、Steam、XBOX、Game Bar、Solitaire & Casual Games、完美世界竞技平台各一），不是只有两个已命中产品。265个unresolved中84具hash＋文件系列、64具hash＋AUMID、57同时具hash/AUMID/文件系列、60仅hash；有技术依据不等于已有产品规则，不能直接猜归属。247无关联未证明条目集中在user-packages的242条（117组件变体、82组件容器、42应用容器、1应用变体）及用户开始菜单5候选；容器不默认等同可执行实例，不能将242全部算漏采集。已交Native仅按现有源码解释源失败及链接生成条件，无新增数据库读取。

PO批准的一次受限只读导出已完成。根会话独立读取Native既有受限位置`scan-mapping-safe.json`及入口结果，确认同一只读事务、无数据库写入/重扫/安装/凭据导出。按本地接收顺序选最近完成扫描，不能称实际墙钟扫描时间：5数据批＋1终帧连续完整，806条扫描记录（386产品条目、420变体），但user-packages来源failed/PROGRAM_DISCOVERY_UNAVAILABLE，开始菜单来源有警告，故仅批次完整，不代表所有扫描来源成功。

逐项数组复核：297条记录有同批实例关联，509条无关联（其中262产品条目、247条关联缺失或非可执行性质未获证明，不能把509全部定为程序漏扫）。300个去重关联对，275个唯一实例；正式目录11缓存与登记证据版本一致、ACK对应、读取时缓存1–3秒：10 confirmed，265 unresolved，0 pending/conflict，0过期或缺失。265含已批准保留为技术记录的Shell Experience Host，技术标识非额外相加项。不能从无命中轨迹直接断言265全是规则缺失；当前明确是正式映射未识别，不是单纯等待上传或缓存过期。

结论：用户要求的“全部扫描到的程序实例都有产品映射”未通过。下一步限于此第一步，依据现有扫描证据与实际规则区分规则覆盖缺口、证据不足、技术对象及关联缺失；不先验统计/页面，不重扫或再次UAC。既有缓存不含命中归属规则ID，不以分类规则冒充归属规则。完整脱敏逐项条目与实例表留受限本地证据位置，不将家庭清单复制到Git。

## 2026-10-11 当前第一步：全部扫描实例的产品映射核验

PO明确先验证所有扫描到的程序实例都有产品映射，暂不扩大统计／控件页面排查。以完整扫描清单及其安装到实例关联为分母，逐一核对正式映射的产品、规则依据、未映射或冲突原因；技术记录按已确认边界单列，不虚构可封锁产品。安装项与实例多对多必须去重并保留关联，不以有用量实例、两个已命中产品或全部运行登记实例替代扫描全集。需证明扫描范围、批次和分页完整性；接口或证据不足时明确缺失列表/字段，不报告全覆盖。Native原任务正在现有权限及证据下只读核对，不新UAC、不重扫、不改规则或安装；Mac单独跟进。

## 2026-10-11 控件真实截图：基础可读，产品与周状态待定位

用户按验收请求提供应用使用页面截图，作为PASS_WITH_MANUAL_EVIDENCE，仅证明所见渲染：选中2026-10-11，基础实例主用量26分10秒（1570秒），日／小时图及实例行可见，未出现整页COMPUTER_USAGE_UNAVAILABLE。顶部仍提示产品身份投影部分不可用，可见行本周时间为未知；不能据此认定全部身份识别完成、周用量为零或当日总量已逐账核对。截图未显示身份/版本/截止及完整下方产品区域，不推断未截图内容缺失。已交控件原任务只读追踪提示与未知值的实际返回条件，不要求用户进入Service Worker，不改账或重复安装。该截图补齐页面可呈现证据，产品部分失败和周未知仍待定位，不笼统归为历史问题。

## 2026-10-11 验收继续：系统组件处置已批准

PO明确同意Shell Experience Host保留技术记录、不新增可封锁产品、120秒用量保留。产品裁决项已解除，不再等待同一确认；已同步两级DECISIONS。现有映射unresolved不手改，未进行生产目录写入。下一步继续控件正确孩子的真实页面读取验收，不能用云端页面或mock替代；若工具仍拒绝，保留具体限制并采用用户页面证据，不绕过访问控制、不重装。Mac通过原交接单独核对，不阻塞Windows；186项当时证据缺失仍保留未解决状态。

## 产品归属定向核查结论（2026-10-11）

本次已批准的单实例只读核查已完成，取代下方“待授权／导出不足”的当前状态。根会话回读既有受限证据`target-instance-safe.json`：120秒未识别实例的文件哈希与登记值一致，读取前后未变；正式签名验证Valid，Microsoft Windows签名、文件系列及PE OriginalFilename=ShellExperienceHost.exe一致，两条指定安装引用均有同扫描关联，distributionKey指向Microsoft.Windows.ShellExperienceHost。可确认是Windows Shell Experience Host系统组件，不是上传丢失；当前证据3／目录11映射仍为unresolved，未修改规则、映射、历史或120秒用量。重复历史扫描链接不能当作不同安装数。

下一步边界：现有原则区分用户可独立管理的产品与技术部件，不能仅凭Microsoft签名或PE中的Windows产品名将全部系统组件合并，也不能自动将此组件提升为可封锁应用。需先确定该组件的产品目录处理，再以精确规则生成第三层映射；本次只读授权不包含生产目录写入。186项缺当时完整捕获仍单列，不以本次当前文件证据回填它们。控件正确孩子实机页面及Mac回执仍待补；共享保持关闭。

## Windows 2.6.44 集中候选与实机验收（2026-10-10，PO已批准）

控件读取只读审查（所属任务回报，非根会话重跑）：1.7.46加载候选五个实际消费者／契约文件与源码SHA一致，Admin实际选择身份读模型，经当前孩子／设备／连接上下文及证明绑定读取base、product，读后再次校验上下文；产品失败保留有效基础，周缺项不补零，分页绑定revision。既有read-model与fake Native port用例仅证明隔离行为，不代替当前真实服务。控件页面读取被工具因无法确认URL拒绝，已停止，不换工具／Profile；所见窗口不能证明本次固定孩子，真实控件页面验收Missing。根会话真实云端页面通过不填补该缺口。本轮未修改控件、重载或重复测试。唯一未识别实例的产品事实现有导出仍不足，已请求一次定向只读核查授权，待答复；不重扫、不猜规则。

唯一120秒未识别实例的云端补证：根会话在真实主控制台程序实例管理第二页定位与统计页相同实例，catalog11、证据修订3，verified含binaryHash和windowsFileSeriesKey，存在2条扫描引用（接收17:19:08）。页面状态为“未识别”；对照app-runtime-knowledge.js:494，此文案仅对应unresolved，pending和conflict分别显示待更新和归属冲突。故当前云端已完成实例登记且未命中归属，非上传尚未送达；仍不证明此前base366读取的是证据3或该实例应归哪个产品。后续按核验依据补产品规则，不直接写第三层、不按名称猜配。本轮未改任何生产配置，无新增UAC或扫描。

后续分类只读核查：contracts/application-classification.ts的resolveProgramInstanceClassification仅按孩子显式产品分类及启用自动规则解析，无候选返回unclassified；catalogGroup不参与该函数。docs/STATS_STORAGE_FOUNDATION明确特殊应用属性与other分类不能混用，故不能用产品type=other强填孩子分类。当前Chrome已识别与特殊目录事实，不等于孩子分类已配置；与D-114“Chrome归其他”的目标差异单列，未擅自改配置或分类优先级。当前身份收口继续核对120秒唯一未识别实例的采集／登记／映射状态，区分规则缺失和接线失败，不从186项旧观测推断新实例根因；仅使用既有证据及普通鉴权只读入口，无新UAC／重扫。

2.6.45升级后真实页面核对：17:18:59在既有登录主控制台应用视图手动刷新，来源Service已发布持久化统计、截止17:15:57、总量15896秒，Chrome1590秒＋ChatGPT1587秒=3177秒，另未识别实例120秒。根会话直接读取Native17:17:54三页安全摘要（base366、product154、catalog11），对应总量15896、已识别合计3177、未知实例120均一致；摘要未含精确截止、页面未显示父revision，不冒称固定父版本逐行验收。产品仍available但不完整，分类缺证据及映射待补保留。自然窗口“多刷新周期”标记仅由墙钟时长推断，没有同一稳定文件重验证调用轨迹，因此仅认定有限窗口新账已解析、未新增未解析正秒；不把它等同全部刷新周期实机通过。没有改配置、部署或重装。

2.6.45受限只读调查完成，根会话直接读取安全摘要：固定base313／catalog11的186项全部有v4原账、均在Child秒原账改造之后且有正用量，不能按改造前历史豁免；183项在较早备份中已存在。186项均没有同原引用的完整当时捕获，已解析0、可靠恢复候选0、证据冲突0；不得根据现文件猜配，未回写历史。升级后单次自然窗口有3段落账，其中完全在升级后的2段共118秒；新增观测1项、新未解析正秒0，确有新活动而非空窗口。此证据支持本窗口没有复现持续制造未知用量，但“多刷新周期”的时长推断仍需区分实际同文件刷新证据；不能据此声称186项已恢复或全部产品均正确。诊断stage=complete，安装与调查均已结束，不重复采样。

2.6.45安装已完成：根会话直接读取install-safe-result为complete、exit0、installedVersion2.6.45.0、Service Running、11组件核验通过；preservation-safe-summary确认13表原事实与冻结版本不变、outbox主键保留、配对凭据及HMAC不变。Native正常权限只读确认管理员helper PID33008仍活（沙箱无返回不代表退出），公开状态online／heartbeat成功。自然活动窗口及186项受限调查尚未完成，不以安装成功代替产品归属实机通过；不重启入口、不改写历史。

Mac交接已送达并由根会话通过GitHub接口独立回读：Issue12评论6095999383，事件windows-mac-shared-diff-20261010，固定文档提交4768dcee217bbfc4eed92db1435f98af4aa3af26；六项共享差异、等价项、主线修复保留和目录已转换更正均已包含。待Mac接收及实施回执，不代表已整合或实机通过。Windows方面Native报告其聊天收到人类新的“批准”并发起单次UAC入口；根会话转发升级指令因工具无法展示原授权上下文而被拒，未生效、未绕过或启动第二流程。安装及诊断仍以Native实际结果为准，当前尚无成功证据。

Mac共享代码只读核对完成：固定e5ae3dc与main@19f129c仍有6个文件的必要平台增量未吸收（Capture、ObservationStore、Registration、PolicyBuilder、InstallationLinks、MachinePolicy）；ExecutionScope、SessionProgramObservationOutbox及契约锁／1.47与1.46包已等价，不重复整合。后续只逐块吸收Mac签名／平台过滤、父版本输出、同扫描作用域和包标识支持，保留main可选null写出修复、新旧执行隔离、正式projection-context及Windows观测刷新。已要求Native通过原Issue12集中更新交接，纠正“等待目录转换”的旧条件；远端评论尚待回执，不把已委派称为已交付。Mac源码适配与实机验收分开；不改固定2.6.45候选，不重试已取消UAC。

等待UAC确认期间的Mac只读核对：原Issue12回报e5ae3dc不是main祖先；逐文件diff确认ProgramObservationCapture的Mac强证据/平台验证、ProgramInstancePolicyBuilder的平台参数及父版本字段与main仍不同，不能仅凭非祖先认定全部未整合。Mac版本ProgramInstanceExecutionPolicy.Write缺少主线ae561dc的可选本机null摘要修复，后续整合必须保留主线修复、云端Read显式null拒绝不变，禁止整文件覆盖回退。已交Native原任务只读核对剩余共享差异与最小整合范围；不改本批2.6.45、不执行Mac安装或测试。生产目录11/schema4已转换，旧Mac交接“等待目录转换”条件需集中更新；Mac真实验收仍缺。

补充逐文件证据：Mac的MachinePolicy.cs除了包身份合法性扩展，还相对main缺少新ProgramInstanceExecutionPolicy存在时隔离旧EnforcementFor输出、停止旧resolved归属生成的两处保护。此为分支基线差异，不直接断言Mac现场故障；后续整合只能吸收Mac必要增量并保留主线新旧执行隔离。ProgramInstallationLinks新增ScanScopeMatchesAsync、ProgramObservationStore增加平台参数、Registration允许Mac签名字段属于待核对的平台扩展；SessionProgramObservationOutbox在两提交间无差异，无须重复替换。当前只读审查，不实施合并或运行测试。

2.6.45首次管理员启动终态：Start-Process运行约123秒后exit1，Windows明确“操作已被用户取消”；没有备份或install-safe-result，升级未开始。原等待阶段已结束，不据此重建或自动再次启动；已集中询问PO是否现在方便重新弹一次相同入口，待回复。候选及通过证据保留，当前仍2.6.44，186项未作受保护诊断。

候选内嵌核验完成：Native核验13发布组件、MSI内嵌11组件版本/哈希及UpgradeCode均通过；首次工具权限审批超时未执行，获准重试后成功。现已发起唯一RunAs管理员入口，等待UAC/同一进程结果，不重复启动。升级后单次220秒自然窗口覆盖正常周期，须有真实新落账/截止推进才判断刷新实机通过；无活动则未验证。尚无install-safe-result成功证据，不宣称已升级。

2.6.45候选构建完成（尚未安装）：固定19f129c、契约1.47哈希690af255…，525导出文件核验；build.log末尾零警告/错误。根会话独立计算安装器SHA256 `27835d575dab0ac87a786c336b49855fc5e8bcd75487ee0e4d252269d508d38e`、MSI `efd35d83df65fa2711b91bbda743eeaacd2a54e842f4a641811550e8c596c162`，均与manifest一致；内部未签名、latestEligible=false。Native继续内嵌组件核验和已授权管理员入口准备，尚无安装/诊断成功证据；不重复构建或安装。

集中交付推进：Native已推送19f129c，根会话用`git ls-remote origin refs/heads/main`核实远端精确同SHA；候选与一次管理员入口准备中，尚未得到升级成功结果。另只读核对原Mac Issue #12最新回报6090526775：e5ae3dc的1.47执行上下文、签名与同扫描运输源码已交，Mac报告隔离74/73及Swift14通过、当时报装0.1.41；没有更晚安装或实机证据，不能称双端完成，不把Windows专用刷新修复转为Mac开发要求。

PO已集中批准19f129c推送、单一内部候选、原地升级及一次受限只读核查（UAC由PO批准）；已交Native原会话连续执行。固定提交干净导出、排除强化草稿，受限备份与新账/配对/outbox保留核验；按同原ref检查Service及Session历史捕获证据，脱敏汇总186项可恢复性，不改写历史、不猜配、不重扫。不部署云端、不改R2、不启共享；本条是授权及执行中状态，尚无新候选或安装成功证据。

Native本批本地提交`19f129c5591c934b0a63bf4f3f624d982b674097`：仅Pipeline、两个相关测试及既有候选报告4文件；固定1.47/1.46最终强制编译证据各19/19。未推送、制包、安装，现机2.6.44仍为旧刷新逻辑。186项可恢复条件已厘清但未逐项取证，受限只读诊断授权仍待回复；不以本批源码修复宣称已有观测已恢复或应用身份总体完成。

复验方法更正：Native把最终受控夹具反向用于旧Pipeline时，首次增量构建复用了修后DLL，不能以该次旧源码测试通过否定缺陷。强制重编译后的`baseline-final-forced.log`再次在归属断言复现100秒未解析，250秒总量及原账不变断言先通过。修后最终源码亦强制重编译，后续证据以`refresh-final-verified-1470.log`和`refresh-final-verified-1460.log`为准。恢复调查还需按原observationRef检查Session传输库captures／registered_captures是否保留当时完整捕获；仅当前同路径文件不足以回填旧引用。本轮未启动受保护库诊断或恢复写入。

最终源码审查增量：根会话直接读取`refresh-final-147.log`与`refresh-final-146.log`，固定两版各19/19通过、0跳过，新增持久化回调忽略取消并迟到完成的回归；生产补丁在持久化返回后再次核对取消及20秒截止，避免错误续期。根会话逐文件SHA-256比对Pipeline、既有Pipeline测试及新增正式消费测试，与隔离测试导出三项均一致。本批4文件（上述3项与既有候选报告）仍未提交，其他强化草稿保持独立；没有新安装、部署或历史回填。此条取代下条“迟到持久化仍在审查”的阶段状态。

修复验证增量：根会话直接读取Native `refresh-fixed-147-02.log/.trx`，固定1.47聚焦18/18通过、0跳过，包含正式事实→v4原账→实例统计读取回归：稳定文件250秒全部保留于单一实例，物化前后原账内容不变；另覆盖文件替换、缺文件不猜配、失败刷新不能续期及外用户隔离。此前修后首轮夹具等待超时已保留，不能计为通过。当前仅为这一版源码的隔离证据；迟到持久化取消检查仍在审查，不宣称最终源码已全部验证，更不宣称已安装。生产仍为2.6.44，186项逐项来源及改造后记录处置仍未完成。

隔离缺陷已复现：根会话直接读取Native `.tmp/observation-refresh-20261010/baseline-refresh-04.log`，正式事实／持久化／读取路径将同一稳定文件250秒分为实例150秒及四项观测30+30+30+10秒，目标断言因出现observation失败。总量未丢，但产品可归集用量碎裂；这是隔离合成证据，不宣称生产186项全同因。此前缺契约向量属于NOT_RUN，夹具未形成有效用量不算复现；独立日志保留。下一步同用例固定250秒守恒、受控后台完成，再实施提前重验证。当前尚无修后通过或现场修复证据。

下一最小修复已交Native：先新增保留每次Observe实际返回、贯穿正式fact／v4持久化／统计读取的隔离回归，证明稳定文件跨60秒边界的未解析窗口；再复用现有有界队列提前重验证。同代际核验成功刷新缓存，原60秒时效不扩大；首次无证据、文件替换、队列满或超时不能猜配旧引用。仅本地源码与相关测试，不制包、安装、重扫或修历史，尚无通过结果。受保护数据逐项只读诊断授权尚待PO回复，不阻塞这项本地修复。

Chrome只读核查：此前生产保存回读目录11中builtin.browser.chrome已是catalogGroup=specialApplication、type=other；该保存证据中无Chrome显式分类／自动分类规则。Native产品投影分别解析分类和特殊目录，分类无命中则返回unclassified，special仅用于排除贡献。因此页面“未归类”不等于特殊目录属性丢失；是否需要调整独立分类展示／配置仍需对照最新单一属性原则，当前未改配置，不以type=other直接冒充classification=other。

待解析观测只读根因进展：正式实例统计仅从machine_application_segments_v4读取观测主体，缺解析关联才生成observation前缀，不能将其直接视为旧账。WindowsProgramObservationPipeline.Observe首次／60秒缓存到期创建无文件依据引用A，异步Capture另建B，后续持久解析仅处理B；常规刷新因此存在A无法解析的路径。保持不把晚到文件内容猜配旧A是必要边界，尚未决定修法。既有周期测试丢弃刷新第一次返回值，只等最终resolved，漏测真实前台消费A。全部186项是否同因、是否当前持续新增尚缺逐项证据；已请求一次受限只读诊断UAC，未获准不执行。此前“历史分类未知”仅为枚举展示，不含日期判断，不作为旧账豁免依据。当前未修改产品代码／真实原账。

PO纠正暂留边界：仅原账改造完成之前的数据可暂不处理，之后的数据必须分析处理。此前将全部186项观测统一作为历史P2暂留的结论撤回；当前未证明其均在改造前。已交Native只读按实际原账改造生效时间、原账格式、事实时间及采集版本划分改造前／改造后／证据不足，区分原账改造与后来实例采集升级两个边界；查明当前是否持续生成待解析观测及解析接线原因。改造后缺陷须处理，不凭historicalUnknown或observation标签豁免；不猜配、不改原账，不先行清数据或重装。

实机增量：2.6.44安装exit0、Service Running，11安装组件与候选一致；Native受限备份及13表全列保留、outbox主键和配对核验通过。根会话独立复算安装器SHA256为af749955c57cb9b9ac078d0eb19b45ce9ba41bfea76882770e573a76a2addd0c。Native完整两页固定父base313／catalog11／product101已出现Chrome、ChatGPT两个产品，已识别合计2594秒，基础12901秒；186项历史观测仍导致PRODUCT_MAPPINGS_PENDING，不等于当前两个产品未识别。16:16:49真实主控制台刷新：Service持久统计、截止16:14:52、总量12901秒，Chrome1353秒、ChatGPT1241秒，合计与本机产品读数相同。已证明本次已识别产品从本机到云端真实页面采用；尚未独立核对响应内精确父版本，不泛称所有产品／全部分类／Mac／共享通过。页面Chrome分类仍为未归类，特殊目录属性及分类语义须另核对，不擅自修改配置。历史未知保留，不扩张为本轮历史修复。

PO已批准从固定`0115a9d758205ea84b5131bcf2632cba5dac1f59`导出干净源码，集中制包、核验及原地升级（UAC由PO批准）。已交现有Native会话连续执行；当前仅已下发，尚未取得候选或安装成功证据。包含明确安装入口捕获、可选执行上下文空值摘要修复、正式产品上下文读取及未知状态区分；排除八份未提交强化草稿。复用固定契约1.47/1.46的相关测试，不重复全平台测试。

核验固定源码、契约与内嵌组件哈希，安装前保存受限恢复备份并核对配对、配置、原账及outbox保留。安装后按当日真实范围追踪目录11/schema2、已确认产品与未识别实例、同父版本产品统计及云端页面；源码、候选、安装和实机结论分别登记。不得以上传ACK代替页面验收。不部署云端、不改R2、不启共享、不新建分支或工作树；Mac及强化兼容待办仍单列。

## 目录切换真实预检阻断（2026-10-10）

提交阻塞已解除：Native本聊天获PO直接授权后提交并推送`0115a9d758205ea84b5131bcf2632cba5dac1f59`；当前会话已fetch origin main并核对远端精确同SHA，提交仅5文件（映射HTTP客户端、投影诊断、2个测试文件、既有报告），未含强化草稿。固定1.47/1.46各32/32证据对应本批；已安装2.6.43仍未包含修复，未制包／安装／部署。下一步为集中候选和Windows真实归属→统计→云端页面验收，Mac共享Infrastructure按固定SHA另行核对，不宣称已通过。

提交状态：Native回报本批5文件、固定1.47/1.46各32/32及范围／锁哈希／diff通过，原强化草稿未变；add/commit/push在创建进程前被自动权限审核拒绝，未执行、HEAD仍ae561dc。已向PO集中请求精确5文件提交推送授权，不通过换工具拆命令绕过；目前只能称源码与隔离验证完成，不能称已提交、安装或上线。

补验已通过（源码／隔离证据，尚未安装）：已直接读取Native唯一结果`projection-context-1.47.0-final-02.log/.trx`及`projection-context-1.46.0-final-02.log/.trx`，两版各32/32、0失败、0跳过。mixed脱敏输出：基础260秒，实例80/180秒；已识别产品80秒、未知实例180秒，catalog11、available，complete及usageComplete仍false，原因APPLICATION_CLASSIFICATION_EVIDENCE_UNAVAILABLE，baseUnchanged=true。证明正式上下文读取接线可保留已知与未知明细，不代表生产端已采用；旧失败与夹具漏检仍保留。等待精确提交后集中候选与实机核对，不重复部署未改云端。

PO已批准恢复夹具修正及必要聚焦复验（2026-10-10）：Native仅修测试结算时序和测试时钟，先断言两个非零subject及260秒基础总量，再验证正式上下文HTTP／持久缓存／产品读取。授权覆盖该专项必要复验，不逐轮机械确认；新产品语义变更仍须报告。通过后集中提交精确修复文件，排除强化草稿；不改计时、不打包安装或部署。此前失败记录保留，不能混称已通过。

接线回归未通过，等待PO补验答复：混合夹具第二应用80000ms开段、最后checkpoint150000ms，未满180000ms周期，且缺后续事件推进500ms排序窗口，故基础仅第一应用80秒；两项归属断言没有真实双来源基础。最小修正只将第二应用推进至260000/270000ms并同步测试时钟，先证明两subject非零／合计260秒，再核对产品及未知明细，不改生产计时。此前31/32不是最终通过；停止通知到达前另一次在途执行最新28/32，四项均未满足双subject前置断言，之后已停。旧同名log/TRX被覆盖，原工具输出保留，当前停止结果另存；不得累计通过或声称每轮文件完整保留。未提交、未安装、未部署。

漏检原因补证：Native既有`ProgramInstanceRegistrationTests.cs`在`/mappings/read`测试响应中提供schema2，而真实云端同路由返回schema1；旧测试通过不能证明产品上下文实际接线正确。已要求修正夹具并保留旧路由负向用例，新路由按正式形态贯穿HTTP／缓存／投影。旧端回退不得把任意404误当缺路由；身份、作用域及响应校验失败不放宽。修复与集中候选尚未交付，不以任务正在执行代替完成。

确定接线断点（2026-10-10）：Native当前`ProgramInstanceMappingCache.cs:182`正式HTTP客户端只请求`/mappings/read`；云端`v2Routes.ts:821-829`此路由返回schema1，已有`/projection-context/read`才返回schema2产品分类上下文。Native `ApplicationProductStatisticsProjection.cs:51-52`只在confirmed且schema2时使用产品，因此已confirmed映射仍会回退实例／历史未知。已交Native核对固定安装SHA并最小接通已有端点，要求HTTP请求→校验→缓存→产品投影真实链回归，不以直接构造schema2夹具证明接线。无需新协议或云端放宽完整性；暂不安装、部署或启共享。

后续定位（源码证据，不冒称修复）：Native投影器把未满足confirmed的用量统一标记PRODUCT_MAPPINGS_PENDING，包括正式unresolved；已交所属会话最小修正状态语义并核对实际消费者。未知产品／分类仍不能伪装成可供共享的完整统计。云端`applicationProductProjections.ts`对available但不完整的投影仍保留产品明细，只有共享applicationUsage受完整性限制；既有`application-accounts.test.ts`明确覆盖分类未知仍显示基础／明细且不改基础统计。此处不需要为消除提示放松云端校验。当前本机219缺投影尚无运行异常证据；等待Native真实调用链修订结果，避免反复采样或部署同代码。

当前收口点（真实读取）：主控制台应用视图HTTP200，2026-10-10基础revision217、7351秒、complete=true，截止11:32:13；产品投影catalog11、PRODUCT_MAPPINGS_PENDING，故基础统计可用但产品归集尚未验收。Native自然同步后的单次只读读取为基础219、产品APPLICATION_PRODUCT_MISSING；不同水位不能直接判定上传失败。正式归属表已无pending，待定位本机映射同步／产品物化实际链路；未启共享、未新增安装／UAC。已请Native核对已安装2.6.43与未安装null摘要修复的实际因果，不以源码测试代替生产端结果。

正式映射补证：保存后按原真实页面回读五页234项，全部catalogVersion11，11 confirmed、223 unresolved、0 pending、0 conflict，与此前只读预览逐实例及productId一致。Native普通权限既有认证接口已证明安装2.6.43自然取得目录11：当日基础revision216、整数秒、complete=true且非零；同基础产品revision1/catalog11为available但PRODUCT_MAPPINGS_PENDING，正在等待自然映射刷新后核对。status的hasPendingUploads不包含产品统计队列，不能拿它证明产品上传ACK；没有新增UAC、安装或重扫。

已修复并发布：PR #257合入 `fca78aa9dd9433f93875d83eeba8460620a7f924`，Guardian精确SHA CI38020573847成功，生产38020618263成功且deployedResources仅guardianWorker，版本5b7240c0-4b13-467c-9335-ebe564eaea6d。Runtime Worker、两Pages及R2清单与前次一致，migration为空。真实浏览器POST预览由预检拒绝恢复HTTP200，不移除If-Match保护。职责初查遗漏根级网关专项的精确路径例外，已补PR声明并重验通过；该检查未阻止随后提交属于执行顺序失误，不伪称首次检查通过。

目录真实条件保存已完成：当前家庭schema4版本11，23产品、13归属规则；真实五页234实例预览11 confirmed、0 conflict、223 unresolved，末页游标为空。保存前后逐字段核对原自定义产品、全部合并产品（排除退出的旧selectors）、分类规则、孩子绑定完全一致，含Firefox黑名单及强化设置。PUT HTTP200、返回目录与提交草稿仅版本10→11不同；mappingState=pending，不能把保存等同正式映射或终端生效。28项无等价证明旧条件留旧目录历史、Chrome一项已核验替代；未知不阻止基础落账。已通知Native只读核对已安装2.6.43接收目录11，不新增安装/UAC/重扫。

Native已回报null摘要最小修复ae561dc：仅本机可选C# null完整摘要写出，云端JSON null仍拒绝、明确空blockedProducts撤销语义保持；此前4项真实统计接线通过，固定1.47专项47/47、1.46专项46/46。源码尚未安装，不将其混称生产端通过。下一步待云端每分钟有界100项恢复生成正式映射，再核对本地产品统计采用同目录版本。

旧条件暂留入口已随PR #256合入master `4eeecad25b1b92ad84605c6c078691d1f04c2945`；production run38003808155仅发布两套Pages，公开脚本与该SHA一致。Runtime Pages cb801a30-a68a-4cdb-bd1c-2be9d26c65e6，主Pages 09036f1c-e322-4283-ab96-8c8ecbf179ee；Worker、Guardian、R2未变化，无migration。生产草稿保留23产品、13条可靠规则；28项旧条件暂留历史、Chrome一项已核验替代，尚未保存。

真实主控制台预览失败已定位为Guardian OPTIONS未允许If-Match，浏览器Network.loadingFailed明确HeaderDisallowedByPreflightResponse / if-match；200只是OPTIONS，不是POST成功。PO已批准最小修复并仅补发Guardian Worker。standard-cloud小修：workers/src/index.ts仅在既有Runtime管理网关范围允许If-Match，保留版本头转发、鉴权与条件更新；补现有网关专项的正式fetch预检回归，验证POST/PUT及非网关范围、条件头转发。仅相关测试、typecheck、差异检查及精确SHA相关CI；不部署Runtime/Pages、不改数据库、原账、配置、共享开关。部署后复验原草稿，再条件保存并核对产品和绑定不变。

Native扫描入口修复332a2d8已提交：Steam有界声明入口与DisplayIcon接线，1.47/1.46专项各46通过；尚未安装或重扫。另4项统计接线回归暴露既有可选执行上下文null序列化错误，已交Native单独最小修复，不能将其记为扫描回归通过或产品归属全链路完成。

## 旧条件暂留历史入口（2026-10-10，PO已批准）

Guardian跨域最小补丁本地验证：正式fetch入口OPTIONS覆盖目录POST/PUT、非网关保持原范围；实际网关仍转发If-Match，401鉴权与412冲突均保留。网关专项14/14、typecheck、diff通过。Matched：仅允许既有条件头，无Deviated/Extra；尚待提交／Guardian发布及真实预览复验，不把本地通过称为目录切换成功。

本地实施与验证完成：暂留原因必填，暂留不生成规则、不冒称已识别；可重新处置，已核验规则修改仍使确认失效。knowledge专项全部通过，实际事件回归验证条件PUT、原产品／分类／强化绑定保留、无依据产品不造规则。隔离内置浏览器桌面及390px移动目视通过，暂留说明、原条件和重新处置入口可读，完成处置后保存可用；未触及生产数据。首次预览服务受沙箱网络隔离影响超时，正常本机进程启动后可访问。Matched：批准语义、保留配置、独立状态及最小范围；无Deviated/Extra。尚未提交部署、生产目录未切换，不能把入口通过称为归属完成。

职责standard-cloud＋architecture-integration文档；仅现有knowledge页面、专项测试与决策。逐项添加暂留历史处置，保持替代核验与暂留状态独立，未知不产生规则。保留23产品、分类与Firefox设置。最小验证：knowledge专项、已有非空旧目录保存回归、隔离桌面／移动目视、diff；CI仅相关Console，发布smoke检查两站脚本；排除Native、扩展、原账、migration、共享及全平台测试。先完成入口与证据，再执行已授权生产目录预览／条件更新；当前尚未切换。

## 产品归属真实依据核验续进（2026-10-10）

切换保障补证（standard-cloud，仅测试）：新增非空旧目录到v4保存回归，核对旧payload逐字保留、无新依据产品继续存在、孩子分类／强化线索保留、既有配额和时间窗不变、新映射由正式规则生成。仅改program-instances专项及本任务板，运行该命名案例与diff，不重跑全平台、不改产品实现或生产目录。历史无依据旧条件是否退出新有效规则已集中请求PO裁决，未获答复不执行生产切换。

该命名回归已通过：1 passed / 38 skipped，使用本地隔离D1及正式save/read/materialize函数；旧版本payload逐字不变、审计previous_hash对应原版本，现有分类绑定及强化封锁保留，新映射由pending转confirmed。第一次启动被D盘Vite临时目录沙箱EPERM阻止，获准本地执行后通过，不是产品测试失败。此证据不等于生产策略已切换或终端实际封锁已验收；没有放开页面未核验保存门槛。

已将8项有现存本机强依据且在已读取云端实例中精确存在的规则整理为本地.tmp候选数组（Chrome/Excel/Steam/EA文件系列、完美世界精确内容、GameBar/Solitaire/Xbox完整AUMID），不含孩子信息或分类，不替代完整目录、不上传。正式契约parseProductOwnershipRules校验通过，8项各自输入均由正式匹配器确定命中目标；Xbox AppL与空依据保持unresolved。这仅为候选结构／精确匹配验证，生产目录与第三层映射均未改变。旧规则、产品及孩子绑定仍须合并预览保留；不以候选8项代替全部功能完成。

Native进一步说明Steam生产代码没有appinfo解析器，仅有manifest读取；同意将必要的本地v41有界只读解析纳入该入口修复，限定已安装appid、16MiB、结构与启动项上限及既有20秒捕获预算，不支持／损坏独立跳过，不增加网络、全目录EXE扫描或产品猜配。DisplayIcon接线独立推进，仍集中源码和隔离证据后交付，不制中间包。

固定安装源码追踪已定位：2.6.43候选fbdc0836a0de0b27ce8c983359ab736c40fba1ab的Steam分发扫描仅生成安装观察，不将明确游戏入口送入ProgramFiles；ExecutableFromDisplayIcon只有定义／测试，生产注册表扫描没有调用。维护标签并不禁止实例捕获，故不是有意过滤或已证实的上传丢失。已交Native按既有职责最小接线上述两入口：只采集明确声明且现存EXE、复用稳定文件核验和同扫描引用，不遍历全部EXE，不根据安装关系直接生成产品归属，不改原账／执行，不安装／重扫；新增隔离回归验证真实programDiscovery接线。历史缺manifest及OpenAI名称冲突保持独立，不扩大为本批修复。

Native只读核验已完成：13个旧Steam appid中8个有当前安装manifest、精确appid启动配置及现存入口；5个无当前安装manifest，保留未核验，不为旧记录扩大搜索或启动游戏。8项中的Apex仅证明保护启动器，不作为游戏主体或共用工具归属证明。对已读取当前孩子234实例的verified.binaryHash精确比对，9个声明入口（含CS旧启动项）、EA离线安装器及Steam卸载器均未命中；此前Excel/Steam/EA/PerfectWorld主程序与3个Store主入口各命中1项。此结果只说明当前读取范围没有这些hash，不证明所有孩子或所有云端数据缺失。已交原Native任务只读追踪固定2.6.43扫描调用，确认分发扫描到实例登记的实际覆盖与过滤，不重新扫描、不改代码、不UAC、不安装。

OpenAI包核验：当前用户仅找到OpenAI.Codex注册包，包manifest和开始菜单显示ChatGPT，主文件产品信息为Codex；未发现另一个相关独立注册包。名称冲突属于实际安装元数据，不能仅凭包名将原ChatGPT产品判为错误并擅自拆分／改名。暂保留产品与分类，不将7条旧技术身份自动等同当前包入口。生产目录仍为旧版10，新映射尚未生成；不得声称产品归属已经完成。

本轮没有生产目录写入、部署或安装。下一步区分可确认的新规则、当前扫描缺项及仅历史残留；历史缺项不得伪造匹配，也不应把基础统计阻塞。现有转换入口要求全部旧条件提供替代证明，5个无现存安装的历史产品尚无替代依据，集中切换仍未满足该入口要求；此约束与历史尽力而为的边界需明确处理，不能虚填核验理由放行。

## 产品归属核验入口已发布（2026-10-10）

PR #255合入master `68c861c9bb6368f20cebaf5956874f72e9120642`。专项与隔离桌面／移动目视通过，精确主线App Runtime run38000894417、Main Console run38000982341通过；production run38001085733成功，仅deployedResources=runtimePages/mainPages。独立Pages `d1cef606-da9e-49ee-bca5-3bc7607adb00`，主Pages `98aac391-8405-471c-ad22-ff9ce79ab0e9`；两站公开JS一致且包含resolveLegacyOwnership。Worker、Guardian、R2与前次manifest一致，无迁移或共享准备。生产目录没有写入，29项旧规则仍待真实依据转换，不把页面修复当作产品映射通过。

控件1.7.46重载现有用户手工证据：控件会话收到版本与原扩展ID一致的真实页面信息，标记PASS_WITH_MANUAL_EVIDENCE；不再列“是否重载成功”待办，绑定／通信／产品读取仍需验收。Native现有Windows只读任务正在复算旧安装键与新依据关系，不新增UAC、安装包或采集设计。

真实依据增量：Native普通权限核实的Excel、Steam、EA、PerfectWorld当前文件hash，以及GameBar、Solitaire、Xbox清单主入口完整AUMID，均在已读取234实例的verified字段中逐字段精确命中各1项；Xbox AppL不视为App。旧Excel哈希已变更，保留旧规则不伪称当前命中。13个Steam appid已确认安装记录，但入口文件依据仍核对中；上述为规则建立证据，不代表生产目录已保存。生产新核验入口已真实登录回读，29项核验控件存在、未核验保存禁用。没有改写实际产品规则、分类或账本。

## 旧规则核验收口入口修复（本地验证通过，2026-10-10）

standard-cloud范围：仅knowledge页面及其专项测试。已证实待核验项只能生成、不能完成核验，导致完整转换无法保存。补充逐项选择同产品同平台已启用规则、填写核验依据后加入替代确认；保留原条件和所选规则快照供回看。删除、停用或修改被选规则使确认失效，未完成项仍阻止保存，不新增猜配、不直接修改实例映射。验证同产品约束、空依据拒绝、规则变更失效、未核验保存拒绝、原产品及孩子配置不变；仅knowledge专项、隔离目视与diff，不运行终端/原账/全平台测试。本次本地修复不自动保存生产目录。

实施结果：已接入实际确认与保存按钮。`node app-runtime-management/console/app-runtime-knowledge.test.cjs`通过，新增事件回归证明空依据和规则变更均阻止PUT，核验后条件更新可提交且产品／孩子绑定不变；第一次仅测试夹具缺少querySelectorAll，补齐后通过。内置浏览器隔离夹具桌面与390px移动目视通过，旧条件、替代选择、核验输入和确认结果可见；截图仅保留本地.tmp，不含真实家庭。审核Matched：同产品／平台约束、保留原条件、失效复核、不直接改映射；本补丁无Deviated/Extra。核验理由与规则快照仅保留当前草稿，不宣称持久审计记录。生产目录仍未转换，端到端产品映射仍Missing；本补丁尚未部署。

## 应用身份实机核验增量（2026-10-10，集中升级后）

云端真实依据核对：经已登录独立站读取当前Windows孩子5页共234实例，末页无下一页。Firefox两条原文件系列均在新verified.windowsFileSeriesKey中精确存在；Chrome原文件系列亦精确存在，已安装源码的系列算法包含经验签signerKey；ChatGPT/Codex完整AUMID规则命中已登记实例，且一个旧runtimeIdentity与同扫描安装引用variantKey精确相同。Excel两个旧binaryHash未在本轮实例中直接出现，需要继续查安装链，不能按名称替代。以上证明证据可取得，不代表目录已保存／映射已生成；没有再次UAC或修改生产规则。

主Pages补发已完成：production run37999475648成功，唯一deployedResources=mainPages，deployment b3634bbd-21b8-4020-8e04-cf152928e584，source edb8b47。Runtime Worker、Guardian、独立Pages和R2 latest与前次manifest一致，migrations为空。线上主站管理JS与独立站逐字符一致，并包含完整旧目录读取及转换草稿；已排除旧组件遗漏发布。

只读UAC诊断失败根因已由Native代码追踪确认：脚本将SID与派生localUserId直接比较，而正式Service通过机器身份派生后比较，属于诊断身份域错误；不据此修改配对或采集。后续改用现有已认证云端实例页面的verified及同扫描安装引用核对，不重复UAC。另已查明页面ownershipUnconverted仅在读取目录时赋值，新增规则／导入无法清除已核验替代项，因此当前29项转换草稿没有完整收口操作路径；修订须保留逐项依据与同产品约束，不可直接清空列表或放开不完整保存。

后续增量：控件所属任务已备份原1.7.45加载目录并替换为1.7.46，184文件树hash与批准候选一致、key不变；正确Chrome Profile实际重载仍待验证，工具拒绝不可靠定位，未卸载或清Storage。正式Native Manager认证读取base/product同父revision148，基础完整非零，产品层明确APPLICATION_PRODUCT_MISSING。一次获准只读UAC脚本在用户／孩子范围断言失败，未导出扫描证据；这是诊断失败，不是采集错误，已禁止重复弹出并要求先定位断言。

PO已批准仅补发主Pages。精确master edb8b47的Main Console检查37999438339成功，Pages-only生产run37999475648已启动并完成production审核；其余所有部署、迁移和共享准备输入为false。运行完成及线上回读尚待核实，不能提前记为已上线。

Native所属任务已完成唯一2.6.43安装：exitCode=0，正式11组件版本及内嵌SHA一致，Service Running；受限一致备份quick_check通过，配对凭据/HMAC、既有原账与冻结统计保留，outbox既有主键保留。此项是安装与数据保留证据，不代表产品归属通过。控件1.7.46原目录更新／正确Profile重载仍在执行，未确认成功。

真实家长登录发现部署差异：主控制台从自身`runtime-management-component/app-runtime-knowledge.js`加载旧组件，仍显示“不能自动把旧身份规则当成新版规则”，公开脚本不包含legacyOwnershipDraft/data.legacyCatalog；本次已部署的独立Runtime站经现有SSO登录可读取完整转换草稿。主Pages尚未更新，不可宣称两套管理入口都已更新。

独立站真实目录仍为旧版，23产品完整保留，5条归属规则可直接转换，29条待核验（7条旧runtimeIdentity、5条productKey、16条distributionKey、1条Chrome复合条件）。新扫描已有完整AUMID和已核验文件系列进入真实依据列表，但映射尚未生成；已要求Native提供对应实际实例与旧依据的脱敏核对结果。未保存草稿、未转换生产目录、未改变分类或共享开关。下一步是完成证据关联与目录转换，再核对实例→产品→统计／管理，不继续把制包当作归属完成。

## 应用身份集中发布核验（2026-10-10 06:15，北京时间）

最终内部候选已核验，安装／重载尚待本次集中确认：Windows2.6.43源码`fbdc0836a0de0b27ce8c983359ab736c40fba1ab`，固定1.47包；521导出文件一致、MSI内11正式组件及两迁移组件核对，原八份草稿保留。安装器120812435字节／SHA256 `dea18e3ce8693eb7d959fa06c235c5c6768dd48c0b2b833853c8675ef433ca39`；MSI61871862字节／SHA256 `ea642fdb772fcc6dcfe2c2d69eaa530807532f71d36a2dcfbb7235607da5cecb`，架构侧已独立复算并通过现有artifact verifier。控件1.7.46内部候选来自`edb8b47`，184文件／2501659字节，树SHA256 `248994bef8e1dff3c9ccc9e6d6240095743e606af598183141ee99a03fa4c7cb`已独立复算；按相对路径排序，对路径UTF-8、NUL、文件原字节、NUL依次SHA256。稳定扩展ID未变，原加载目录和线上1.7.45未修改。候选存在不表示已安装、已重载或产品识别通过。

PR #253交接锁、PR #254控件内部版本已合入，固定master `edb8b4761e20b640bf104d7511a229eff17e80b6`。生产run `37998110066`成功，仅部署Runtime Worker `73658511-c209-433a-b2d5-491f56b26e8c`及独立Pages `eb81b78b-2825-400e-bf08-73f88c05feb6`；契约1.47.0，无迁移、无shared shadow准备。Guardian仍`db20e9a4`、主Pages仍`fad51a2a`，R2 latest仍2.3.1及原SHA256，生产目录尚未转换。

线上知识目录JS/CSS在生产别名与本次部署域名均逐字节等于固定Git源码；首次使用Windows工作文件比较出现CRLF差异，已改用Git blob复核通过，不是重复部署或产品故障。JS SHA256 `6db81157654193cac2b7356b02479c63142811505ade7ad94d4e204c214c342b`，CSS `42c6cb3e52eda9cdb1963067204b46c69d6372984f03d7254b4248c5df43a01c`。公开健康与未鉴权拒绝由本次工作流通过；这些是发布smoke，不代替真实家庭目录切换和产品归属验收。Native候选2.6.43从干净`fbdc0836a0de0b27ce8c983359ab736c40fba1ab`导出构建中；控件1.7.46候选已生成但未更新原加载目录、未重载或托管。共享执行保持关闭。

## 控件1.7.46内部候选准备（2026-10-10）

- 基线：`master 71788f1`，既有 `extension-local` 分支；线上feed仍为`1.7.45`，不覆盖。
- 内容：统一扩展版本与候选记录，生成独立目录的unpacked内部候选；保留稳定扩展ID，原Chrome加载目录不写入、不重载、不安装。
- 边界：共享执行关闭；不改网页原账、配额、云端配置或R2；不托管。
- 验收：版本与候选manifest一致，稳定ID正确，开发标记和模块边界正确，输出包SHA可复核；Native真实联调另行验收。

## Native 应用身份读取 requestId 错误码修正（2026-10-10）

只读审查确认：Native 应用身份读取响应缺失或不匹配 `requestId` 时，扩展运输层原本返回 `application_identity_invalid_response`，但错误码允许列表仅含 `application_identity_usage_invalid_response`，导致错误被归一化为 `heartbeat_build_failed`。按架构任务授权，仅修正该诊断映射并补充缺失 `requestId` 回归；不改变请求/响应协议、身份范围、应用数据、账本、能力协商、共享退避或心跳行为。`node tests/unit/local-guardian.test.js` 与 `git diff --check` 已通过；已更新 PR #251，不打包、不部署、不托管。

## 应用身份集中交付当前状态（2026-10-10，覆盖下方阶段记录）

Native集中源码已完成：现有main及远端均为`b84cf412888bcb5bf79fdb82e6bb320a1e38eb20`，仅批准15项，八份原草稿哈希未变、正常索引无暂存。当前固定包1.47与上一1.46分别96/96、95/95聚焦通过。下一步只从干净提交导出准备一个内部候选，不从根目录混合草稿制包；安装另行确认。控件PR #251已合入，正在既有分支准备未占用的新版本候选，不覆盖线上1.7.45。

交接锁同步实施前：职责architecture-integration，仅`tools/timewhere-native-contract-lock.json`两字段及本任务记录；按Native已提交并验证的1.47.0／SHA256 `690af25548ab5865bd89062d3e715b4f5cef8cee19242bf8e92f52dee070c723`替换过期1.30锁。验证为现有timewhere-native-artifact固定专项及diff，不改协议或门禁实现，不部署、不上传R2。实际候选哈希、最终源SHA、安装和实机验证仍待完成，不以锁更新证明候选完成。

两端接线集中验证：控件PR #251已合入`71788f1e40a2e109b8b781245c6b149f41d0680d`，复用已有V2孩子证明缓存，身份读取独立于贡献上传、共享余额和共享执行；分页／短缓存绑定当前连接，业务拒绝不主动断开通道。Native隔离快照已完成精确错误白名单及真实读取入口绑定，固定1.47聚焦96/96、上一1.46为95/95；包括已绑定正向读取、读中断开／改绑丢弃及Service→Agent实际发送／管道消费，进程动作仍使用隔离替代，不冒充实机。原八份草稿字节保持；批准十五项正通过精确索引在现有main集中提交，五个重叠工作文件保留，候选只能从最终干净提交导出，不能从混合根工作区构建。

集成状态：PR #252已合入`665e15810be520a7df7956039d96bf98e9e41633`；固定head `fd5de41`的App Runtime run `37995244632`（契约／Worker／console）、Guardian及相关路由CI均成功；PR #251随后合入，当前已核实主线为`71788f1`。云端固定工作树仍在665e158并保留本记录，未部署、未转换生产目录。1.47包sourceGitSha仍为内容提交`fd5de41`，Native隔离锁已核对版本／SHA／包hash。已安装2.6.42.0且Service Running，不重复安装；该安装版本不包含本次新接线。已交控件准备下一个未占用版本的内部候选，不覆盖线上1.7.45、不触碰原加载目录或托管源。集中候选、部署、目录转换及真实联合验收仍待完成。

剩余目录事实：现有旧目录包含23产品，精确hash／完整AUMID／同算法文件系列可转换；旧渠道键、runtimeIdentity及复合选择器仍需依据新实例证据逐项解释。现有只读转换入口会完整列出未转换项并拒绝不完整保存，不允许为通过转换而删除有效产品或猜名称。扫描修复尚未进入已安装2.6.42，因此当前扫描覆盖不足不能作为规则最终无效的证明；集中候选后再核对覆盖。控件线上旧1.7.45与同版本开发源码不是同一产物，后续候选必须使用新版本，不覆盖已托管包。

最新终端整合状态：仅移植应用身份只读统计，基于主线 `b79eb72`；排除 `806abac` 的来源统计影子功能。身份读模型、Admin 展示、Native Host 回归、契约构建、typecheck 和扩展根目录检查通过；未打包、安装或部署。
云端执行衔接集中提交审计：Matched 为目录／孩子策略／机器水位原子更新、新执行能力协商、严格执行契约1.47及旧盘点并发不得覆盖新策略；复用对应源码的program-instances 38项、产品封锁及机器能力专项、契约build/classification/machine-control/compatibility和typecheck通过证据，19文件职责检查及diff检查通过。根锁仅同步契约版本。此批无未批准Extra，不包含终端源码、安装包或生产操作；整体Missing仍有Native真实执行链与控件同孩子读取接线、生产目录转换和实机验收，不能把云端提交视为全部完成。

控件只读审查已确认可复用现有V2签名绑定，不需新增协议字段：已交两端实施独立读取ensure及Native实际入口connection/user校验、分页和缓存的绑定代际隔离。必须复用同一证明缓存，不调用贡献queue/build/upload、共享余额或执行；未绑定／改绑／断开拒绝读取。Native当前隔离发送消费29项回归通过，固定1.47包哈希已核验，真实管道边界仍在补验；源码、安装、生产状态分开记录。2.6.42安装及Running再次确认，无重复安装。

控件读取Child边界追加只读证据：固定控件现有applicationIdentityRead在native-host-client.js:957附近只比较本地context/connectionGeneration，请求无孩子证明；Native Coordinator ReadBrowserApplicationIdentityUsageAsync只取管道用户当前assignment。对照同文件ExchangeSourceStatisticsAsync已有SharedWebSourceBridge.Capture(connection,user)和IsCurrent检查，说明可复用已有核验，不需另建登录。控件已有createReusableSharedWebBinding，但封装在贡献同步器内，公开方法目前不能直接给独立读取建立绑定；已交所属控件任务核定最小复用范围，禁止要求贡献上传、余额或共享执行成功作为独立统计前提。此项仍未修复／验收，不以本地context隔离等同双方同Child。

集中封存执行契约实施前：在现有1.46完整内容上形成1.47.0本地固定包，新增仅为新执行类型、可选策略字段、严格解析及共同向量。原1.46包不覆盖；根workspace锁只同步包版本，无依赖升级。执行contracts build、classification、machine-control、compatibility、包目录及SHA核对；不跑无关平台或安装器。Native先在隔离快照按固定包核验，正式主工作区锁与源码集中提交时再同步，不以本地包交付冒充部署。

1.47.0本地固定包已交Native：178875字节、94文件，SHA256 `690af25548ab5865bd89062d3e715b4f5cef8cee19242bf8e92f52dee070c723`；1.46原包SHA256仍为`96faf6387250ba2a14a684307bdca9bc7e4d04f3254953e5af5be576001e0d5d`。build、classification、machine-control、compatibility通过，包内解析器、类型、schema和9个执行共同用例与已验证源码逐字节一致。主源码和发布交接锁尚未集中提交；Native实际包消费、Service→Agent接线与实机仍未完成，不以包交付作为完成。没有部署、安装、R2或共享启用操作。

并发写入审查：旧盘点在读取legacy目录后、读取孩子策略前若恰逢新目录提交，旧policyStatements会以新的孩子版本为基线重新生成旧格式载荷，丢弃新执行字段。先在现有program-instances专项中精确插入该交错并复现，再在共同旧策略生成入口拒绝覆盖已存在的新执行上下文；不改变扫描事实接收、旧端语义或生产目录。新策略若在旧请求读取之后提交，原有孩子版本唯一约束仍使旧写入整批失败。最小测试仅该并发案例、目录专项及typecheck；不新增锁、表或迁移。

并发案例已先复现失败（新策略版本2被旧请求写成3），共同入口增加4行保护后program-instances 38/38、backend typecheck、diff通过：新执行载荷与机器版本保持、扫描事实仍接收。这是隔离回归，不是线上切换验收。Native回报新DTO／范围绑定21项隔离通过，真实Service→Agent尚未接完；审查发现Native额外加16hint上限与新契约不一致，已要求沿既定总容量约束对齐，不把该偏离带入候选。

公开契约补齐实施前（architecture-integration）：将已有新执行上下文接入RuntimeAppPolicyV1及现有policy schema，并在现有分类向量中固定普通封锁、强化、明确解除和非法载荷案例；跨产品唯一性及UTF-8容量继续由正式解析器验证，不以JSON schema代替语义校验。仅契约构建、分类专项、机器契约专项和diff；不发包、部署或改变执行语义。Native原始人类授权已定位至原聊天用户记录并转交核验，恢复所属任务实施，不重新索要同范围批准。

该补齐已完成：公开RuntimeAppPolicyV1引用同一类型，现有policy schema新增可选字段及严格结构；现有分类向量新增9个跨端用例，正式解析器逐项验证，schema结构与边界固定检查。契约build、classification、machine-control及diff通过；没有将JSON schema结构检查声称为完整语义验证。Native已独立核验原始用户授权并明确开始现有快照DTO／执行接线，之前授权读取阻塞解除；实现结果仍待回报。未发布新包、未部署或重新安装。

目录保存接线实施前：在既有同一次D1 batch内保存目录、审计、对应孩子新执行上下文及机器策略版本；保留原分类、配额、时间段和旧格式字段，不把v4塞入旧目录字段。更新已有孩子必须保留明确binding，解除使用空产品配置而非缺席binding。策略读取严格解析新增字段，普通策略编辑保留它；旧格式写入者是否仍会丢字段继续逐入口核对。最小回归覆盖保存后正式机器读取、解除、孩子／家庭隔离、存储失败全回滚和既有目录用例；不操作生产数据。

上述保存／读取接线本地已完成：`programInstances.ts`同batch刷新明确binding的孩子策略和机器版本；`appPolicy.ts`严格读取并在普通编辑时保留新字段。`program-instances`＋`product-block-policy`共46项通过、backend typecheck通过；包含两孩子只递增一次机器版本、其他家庭不变、正式heartbeat→机器policy读取、解除、无声删除binding拒绝、机器版本冲突完整回滚、普通编辑不丢字段及损坏字段拒绝。既有盘点两入口在v4状态均跳过旧policyStatements，旧目录写入口拒绝v4；仍需审查并发切换及旧客户端执行连续性，不将保留旧载荷说成新版解除对旧端已生效。本批尚未集中提交、发1.47契约包、部署或制包。

本轮接线 checklist（architecture-integration＋standard-cloud）：先把新执行能力接入真实机器 heartbeat 白名单和 policy 下发，能力变化进入 ETag，旧客户端不得收到新字段；随后目录保存与孩子策略原子刷新接通。只运行机器策略能力／产品封锁专项、typecheck 和 diff 检查，不发布半接线。控件错误码修复已由所属任务提交 `2fede6c` 到 PR #251；更正此前推断：应用身份读取分支独立捕获该异常，不进入心跳失败退避，本项只是稳定错误码修复，不存在已证实的心跳退避影响。Native 新执行实施仍未开始，正在核验原始任务授权，不以交接已发送代替实施进度。

机器能力入口已接通：heartbeat 实际保存 `program-instance-execution-policy-v1`，policy 响应协商并使能力变化参与 ETag；非协商客户端过滤新增执行字段，不生成空解除、不改持久策略。聚焦 `product-block-policy`＋`runtime-api` 两项机器能力用例共11通过，73无关用例未运行；backend typecheck及diff通过。初轮夹具误引用未导出emptyQuotas导致1例失败，已仅改显式夹具后同范围复验通过。尚未接目录保存及策略规范化读取，不能把能力可见当成产品封锁实际生效；本批仍未提交／部署。

云端执行编译已改用新结构 `buildProgramInstanceExecutionPolicy`，退出本批未提交的旧 `associationVersion` 载荷尝试。8/8新旧product-block-policy专项、backend typecheck、diff检查通过：普通封锁不因关闭强化消失；明确解除才删除产品；缺孩子binding/缺引用产品拒绝，不假造空集合；冲突双线索省略但确定产品封锁保留。输出由共享严格解析器复核，目录不变。下一步仍是目录保存原子刷新孩子策略和按机器能力下发；目前辅助编译尚未接保存入口，不单独提交或部署。Worker技能核对仅影响状态局部性/有界配置，未改bindings、密钥、数据库或兼容日期。

读取范围审查新增事实：Native读取按管道Windows SID→当前受保护assignment→Child ID及machine/user/assignmentVersion分区；控件查询只带profile UUID，响应无Child ID，因此本地context防迟到不能证明两端同孩子。该缺口先固定真实入口后复用已有身份核验解决，不将“本机当前Windows用户”文案视为满足Child权威原则。另控件缺requestId路径拼写 `application_identity_invalid_response` 不在允许错误码中，会泛化成heartbeat_build_failed；已交所属任务仅修正为既有usage错误码并补局部回归。发送通道共用心跳退避是单列影响，未授权顺带重构，不冒称拼写修复会解除所有退避。

新执行上下文契约源已实现（尚未发包）：`ProgramInstanceExecutionPolicyV1`／严格解析器／独立能力常量；完整blockedProducts集合与现有双线索表达执行，不复制归属规则或enhanced布尔，不借旧associationVersion。契约编译、classification专项及diff检查通过，覆盖合法/空集合、缺字段、未知字段、重复产品/线索、跨产品冲突、非法版本/文本/签名、UTF-8容量及独立副本。已按精确结构交Native在批准的干净快照实施；云端下发与Native真实执行尚未接通，未改1.46已交付包、未部署安装。下方旧ProductBlockPolicy形状的本地编译辅助仍待改为新结构后接入，不能发布为已完成。

控件 PR #251 固定 `2fa5938` 静态复核：基础主总量仅取 base，产品及分类独立投影、不相加；分页固定 revision，缓存键含扩展孩子／连接上下文及日期，UI sequence 拒绝迟到渲染。依据为 `application-identity-usage-read-model.js:60–104/180–259`、`native-host-client.js:959–984/1339–1349` 和 `admin.js:4105–4154`。以上不等于两端孩子相同：请求仅带浏览器 profileId 和日期／view，schema3 响应不含 childId，扩展 cloud_profile_id 仅参与本地 context；已交 Native 追踪真实读取入口及改绑拒绝条件，未取得前不宣称 Child 隔离联调通过。真实 Native 读数及快速切换验收仍缺，暂不以 CI 成功代替。没有重跑已通过源码测试、打包或安装。

本轮核验与纠偏：2.6.42 已安装、Service Running、安装器 SHA-256 与批准候选一致，不重复安装。控件 PR #251 的首轮失败是缺少 `Task-Role` 声明，补齐 `extension-local` 后 run `37991226880` 成功；源码仍为 `2fa5938d04692947e35121ed8c48ce155445f94f`，未合并、打包或实机验收。Native 固定 `95352f3` 的两项隔离载荷评估证明现有 1.46 旧执行接收链不能合法消费 v4：旧强化校验依赖旧投影，旧分类器依赖 selectors。下方“不新增共享协议版本”及“现有字段足够”的初步假设已失效；后续集中补齐明确的新执行契约及能力分支，不伪造旧投影或静默改变版本字段语义。原批准强化行为不变，当前生产目录和封锁不切换。

独立强化投影编译本地实现：`buildProgramInstanceSuspectedPolicy` 从 v4 当前孩子 blocked+enhanced 读取原双线索，不复制 ownershipRules、不输出 strongMatchers；解除、关闭强化、孩子隔离、线索重复／冲突及源目录不变共7项新旧专项通过，backend typecheck通过。尚未接入保存／机器下发，不提交发布孤立函数。实际接收器核对发现 `MachinePolicy.ValidateProductBlockPolicy` 仍要求旧 ApplicationKnowledge 与 ProductIdentityProjection 的版本同源，现有 v4 目录不能仅靠复用字段名通过；已交 Native 核定合法载荷与兼容边界，不伪造旧投影。不把局部回归当成执行恢复。Native六文件与原未批准草稿重叠，已允许其仅在现有干净源码快照隔离实施／测试；原文件保留，回填前必须核对独立diff，不直接造成反向修改。

目录读取／预览已集中提交 `fd5e6d8b9abe0c67a61b9cd882745305bc736a5a`，未部署。执行衔接进入最小修订：复用既有 ProductBlockPolicy 的目录版本和独立疑似字段，云端从当前 schema4 目录／孩子 binding 生成并撤销执行投影；Native 修空决定切换、整用户阻断及策略代际接线，保留原批准强化行为但不用于产品归属。具体范围见模块 DESIGN 同日“执行接线修订范围”。不新增共享协议版本或复杂迁移框架。云端仅相关策略／目录测试与类型检查；Native 仅对应本机执行隔离回归，不安装、制包或修改真实规则。当前封锁对象覆盖与真实解除验收仍待完成；不以这一设计登记视为已修复。

执行切换只读核对已完成（Native 固定 SHA `95352f3c2dbbace1483c65c2369cc678c27a03a7`）：Coordinator 同时下发旧策略与新 offer 不代表并行执行；Agent 接受新 offer 后切到实例消费者，旧精确封锁不再执行，空 offer／撤回／租约到期不自动回退。未切换客户端仍执行旧策略，新目录解除不会自动解除旧策略封锁。`ProgramInstancePolicyBuilder.cs:12–13` 的 suspected 检查看当前用户全部产品；有旧 Firefox 疑似规则时，首次新模式被阻止，已切换模式则被清空且不恢复旧执行。依据为 Coordinator:1616–1685、Agent Program:382–389、enforcer:67–86/207、Builder:46/69 及现有 SwitchingConsumerCannotBeReenabledByLegacyPolicy 回归。必须集中解决目录／旧策略／实际执行模式衔接后才生产切换；尚未改规则、执行语义或生产目录。2.6.42 安装及 Service Running 已再次只读核实，不重复安装；扫描修复仍为源码状态。

完整转换入口本地结果：knowledge专项通过；backend typecheck及program-instances 34/34通过，含非空旧产品、另一孩子绑定、内置目录和读取后原存储不变断言。GET在legacy返回完整legacyCatalog，页面实际生成草稿，未转换项可展开、只读预览可用、保存按钮及处理函数双重拒绝不完整替代；旧服务未提供完整目录时继续明确不可转换。隔离真实浏览器截图检查发现核验详情占编辑网格半列，已修正为展开时独占整行并重新目视确认。临时服务和验收页已关闭，未连接生产数据。Matched为读取／草稿／预览接线及保护既有配置；Missing为实际未转换规则逐项核验、正式目录切换和端到端产品投影，不能把本地通过称生产完成。尚未提交／部署。

Native扫描修复回报：95352f3c2dbbace1483c65c2369cc678c27a03a7已提交推送main，固定报告agents/windows/WINDOWS-SCAN-OWNERSHIP-FIX-2026-10-10.md；据所属任务报告60/60隔离验证通过，包括实际签名文件和当前用户包未启动扫描。已安装2.6.42不含此修复；未制新包、未安装。Mac仍单列，不用Windows报告代替。

完整入口接线实施前（standard-cloud，中等变更）：既有program-instance-catalog GET在legacy状态附加legacyCatalog，复用effectiveApplicationKnowledge组装含内置产品的全家庭目录；保持原state/catalog字段、家庭鉴权及no-store，读取期间版本变化即返回冲突。页面只生成转换草稿、列出全部未转换选择器并允许既有只读预览；存在未转换项时禁用保存且处理函数拒绝写请求，不能静默遗失原规则。最小验证为knowledge专项、program-instances路由专项、backend typecheck、diff与隔离目视；不改匹配算法、统计、生产数据、终端或迁移。上轮修正后的扩充夹具已重新运行通过。

转换草稿本地验证增量：无副作用转换函数与专项已实现，正式v4解析器确认精确hash、完整AUMID、文件系列规则可接受；未转换条件逐项保留，两孩子绑定、产品及版本保持不变，首轮knowledge专项通过。随后扩充既有强化配置／非空分类规则保留用例时，手写分类夹具漏type、exclude、match，连续两次分别被正式解析器拒绝；已补齐夹具，但遵守两次失败暂停规则，未第三次运行，不能将扩充后专项记为通过，尚不提交。当前产品代码未因此放宽校验。完整有效旧目录读取与页面入口仍待接线：现有旧管理GET只返回存储目录，而app-policy仅为孩子范围，均不能直接充当全家庭完整转换输入；须复用服务端effective目录组装，保留内置产品和全部绑定。生产目录、原账、安装及共享开关均未修改。

转换草稿实现前（standard-cloud）：在现有knowledge组件增加无副作用的legacy转换函数及同文件专项测试；输入必须是完整有效目录，保留全部产品元数据、分类规则及孩子绑定。只转换单一明确binaryHash、Windows完整AUMID、已核验同算法fileSeries选择器；复合条件、旧runtimeIdentity及渠道键保留为待处理清单，不静默删除或猜配。返回可预览草稿与未转换项，不自动保存；尚有未处理项不能称迁移完成。先补这一转换内核，随后接完整目录读取及页面入口，整批提交／目视后才交付，不单独发布辅助函数。只跑knowledge专项及diff，不改原账、Native、扩展或生产。

转换入口覆盖核对：后端previewProgramInstanceCatalog允许legacy当前版本的条件只读预览，使用正式匹配器且不写第三层；现有program-instances专项断言空目录预览无写入、冲突／跨孩子／旧版本拒绝及legacy→v4保存。尚无“非空真实legacy保留全部有效产品／绑定后预览”的对应证据，不能将上述测试外推为生产迁移通过。前端openOwnership遇legacy直接return，现有schema4导入入口无法打开；这仍是集中切换的操作入口缺项，不能靠修改浏览器内存或直接写映射绕过。后续集中转换需提供明确草稿、保留有效内置产品与绑定、列出未转换选择器，并先只读预览；扫描修复与转换工具完成后再安排一次交付，不单独反复发布。

扫描强证据根因及修复交接：已直接读取候选510a4c84固定源码，CaptureForDiscoveryAsync传入processKey="inventory"；ReadOwnership在签名逻辑之前要求PID:start正则，扫描必提前返回空证据。运行观察才有真实进程键，解释233实例中强证据稀少。这是已批准扫描识别的实际接线缺项，不是需要用户逐个启动应用或扩大规则猜测。已交Native最小修复：分开文件签名核验与进程包身份核验，扫描保持捕获句柄／代际检查、完成证据后持久登记，原有AUMID核验不放宽；补扫描→outbox→登记隔离回归。缓存已哈希分支也须确认新证据就绪，不能只凭已有hash提前返回。本轮不制中间包、不安装、不修改原账或生产目录；包扫描AUMID来源的实际核验另按同入口检查，不直接信任旧AppEvidence。

新版实例实际覆盖（2026-10-10，主控制台只读五页）：当前选中孩子共233个唯一实例，最终nextAfterInstanceId=null；全部有binaryHash，仅1个windowsAumid、2个windowsFileSeriesKey。AUMID逐值匹配既有ChatGPT包选择器，Chrome系列逐值匹配旧Chrome选择器；Excel两旧hash命中0、Firefox两旧series命中0。这证明规则可表达不等于当前扫描证据覆盖，不应直接发布后宣称产品目录完成。已交Native只读核对安装扫描是否只登记hash、强证据是否只由运行观察补齐；不要求用户逐一启动应用，不猜名称，不写映射，不改生产。此计数为当前孩子本次读取范围，不泛化到其他孩子或Mac。

规则转换固定源码补证：根任务直接读取Native候选510a4c84的WindowsApplicationEvidence.cs，旧FromExecutable与新ReadOwnership均调用同一FileSeriesKey函数，均要求WinVerifyTrust成功；系列哈希为signed-file-series-v1＋签名公钥哈希＋OriginalFilename规范值＋ProductName，不含路径或版本。故Firefox两条单fileSeriesKey规则具有等义转换为windowsFileSeries的代码依据，不再笼统列为无法转换；实际新实例命中覆盖仍待预览。Excel两条单binaryHash同样可精确转换。Chrome旧AND signer条件须核实系列对应签名后消除冗余，不直接丢弃。新规则契约当前只支持binaryHash/windowsAumid/windowsFileSeries/macosSignature，不支持旧productKey/distributionKey/runtimeIdentity；这些安装渠道及旧身份规则须通过实际新证据建立规则，不能伪造AUMID或以名称替换。未改生产目录。

目录切换生产只读基线（2026-10-10 04:25）：已登录主控制台实际GET app-policy返回策略372、effective applicationKnowledge schema3/version10，23个产品；并非只有旧编辑器显示的3个自定义产品。当前孩子3项产品绑定为Excel/study、ChatGPT/study、Firefox/blocked且enhancedBlocking=true，ruleIds为空；resolvedApplications有8条blocked技术项。旧选择器实值类型：Excel两条单binaryHash；ChatGPT七条runtimeIdentity与一条完整packageId（含!App）；Firefox两条fileSeriesKey；Chrome为fileSeriesKey AND signerKey；其余为productKey/distributionKey。这里只记录脱敏结构和计数，不写孩子ID及生产原始响应。Excel可作为精确内容规则转换候选；其他字段须核实新证据语义，不能按名称或字段相似转换。尚未生成或保存v4目录。

Native固定源码只读回报补充：Windows2.6.42的新实例策略消费者在当前分配、目录、confirmed映射及blocked分类满足时可生成关闭指令；旧强化策略未迁移时会阻止新实例offer。Mac0.1.41尚无该新实例执行消费，仍走旧MachinePolicy。故必须分别核对映射变化及旧策略保留，不能仅凭分类字段未改宣称执行不变。此项不需要重装，不启共享；目录预览与生产切换仍待完成。

目录切换只读核对（2026-10-10）：不能将legacy目录仅改schemaVersion后发布。`application-knowledge-validation.ts:60–127`显示v4产品不接受selectors，新增ownershipRules；产品ID/name/type/catalogGroup/suspectedMatchers与分类rules/bindings结构可保留，但须以实际输入校验及逐项差异为证据。`applicationKnowledge.ts:18–32`的旧effective入口会注入controlledProducts及Chrome规则，故只复制数据库products会遗漏有效目录，不能宣称配置无损。`applicationKnowledge.ts:94–95`在旧管理入口遇v4时明确409；盘点接收在catalog available时跳过旧policyStatements（约478、648行）。`programInstances.ts`新版保存仅原子写目录／审计，不调用旧policyStatements；实例映射由登记或有界任务生成。因此上线切换还必须核对旧管理入口退出、新执行消费及既有封锁保持，不能把统计可用等同执行安全。已向原Native任务交接只读评估Windows2.6.42／Mac0.1.41的实际消费与未知映射行为；未改生产目录、规则或第三层结果。

下一集中批次：先取得当前有效目录（含内置项）及实例核验依据的只读清单，输出可保留元数据／配置、可确定转换规则、不可直接转换规则及消费者覆盖；转换预览必须保持原目录不可变、使用条件版本并展示影响范围。旧runtimeIdentity、包家族和旧文件系列不能仅凭字段同名转换为实例键、完整AUMID或新文件系列。无法证明者保留待核验，不启用猜测规则。生产切换及可能影响已生效封锁的差异须集中明确后执行，不能通过发布空ownershipRules使全部产品未识别来冒称完成。

04:20发布及真实入口收口：run37985721761成功，来源b79eb72；Guardian版本db20e9a4-4f80-41d7-832b-58dc12f00534，Runtime Pages866289f2-cb47-4f7c-acb4-b83cb035b597，Main Pagesfad51a2a-b9cd-42a7-b311-cb2518d8cc87。manifest确认Runtime版本仍889d6243，迁移为空、sharedAccessShadowPrepared=false、R2 latest仍2.3.1且哈希不变。已登录主控制台实例入口正常显示第一页50个登记实例，404消失；规则目录明确返回“现有目录尚待集中切换”，不存在新版目录。因此当前目录10仍legacy是Windows／Mac产品pending的共同前置缺口，不是应让终端重装或猜产品。下一步先核对安全目录转换，保留既有产品及孩子配置、不把旧身份绑定直接当新规则、不直接写第三层映射；尚未执行目录切换。Mac固定回报15bf75684ebe0c3fc28e55c0c2c41abd3f5a6b7a记录0.1.41的基础版本22/23/25 ACK／Published与页面对照，按Mac报告证据收录，不等于Windows独立复现；1.45/1.46源码增量仍待办。整体未完成。

04:14真实登录读取取得新版基础上云证据：主控制台应用使用返回program-instance-v1、seconds、complete=true，今天总量482秒、7个基础条目，来源revision92、unsupportedSourceCount=0、截止04:13:44；页面呈现8分2秒。产品投影仍未完成，返回APPLICATION_PRODUCT_CATALOG_CHANGED、目录版本10、可用来源0/1，已交Native只读定位目录消费与投影，不重复安装。PR #250已合并为b79eb72a22504b8bd23539ea30b9666494bf60e0，精确SHA相关CI通过；生产run37985721761已启动并完成已授权环境审核，仅Guardian和两套Pages，Runtime及migration均不部署。运行结果与实例入口实测待补，不以已启动称发布完成。

安装后实测补缺：2.6.42安装日志返回0，Native报告11正式组件哈希匹配、Service在线，本机身份基础读取schema3／seconds／revision85为available且complete，产品投影仍APPLICATION_PRODUCT_MISSING；尚未证明上传及云端采用。没有升级前受保护数据逐条基线，不宣称全部保留已逐条验证。主控制台实例入口实际返回RUNTIME_MANAGEMENT_NOT_FOUND，根因是Guardian固定白名单遗漏Runtime已实现的新实例路径。本次standard-cloud最小修订仅补既有目录、实例列表、使用读取、目录预览及保存的精确方法和参数；保留现有家庭鉴权、条件更新、参数拒绝及Service Binding。先运行管理网关专项、typecheck和diff；不改原账、统计、权限语义或运行服务，不新增迁移，不重复安装。修复、部署及真实验收分别记录。

上述网关修订专项12/12、根typecheck及diff通过：逐条核对Runtime既有五条路径、方法和参数；未鉴权拒绝、跨孩子错误透传、未知／重复参数拒绝、条件更新409不重试均有固定回归。Matched为源码路由补齐与隔离验证；Missing为部署后真实入口复验及新统计上传／产品投影；Extra无。Native第三次自然读取基础revision85→87，产品仍missing，安装后报告已固定于Native文档提交12dcb5e8e6d33b019e48262c4bea999c8aefd77c；这是本机基础自然推进，不替代云端采用证据。

PO已批准集中候选准备：Native固定510a4c84c6fb82257fbafcb730c9f18e61bf23a8导出干净源码构建2.6.42，排除六文件强化草稿；控件允许推送并整合52513c3。已分别交原所属任务，不新建分支／工作树，不自动安装或正式托管，不启共享。Native候选含已提交实例策略／Agent接线，不能描述成纯统计包；未批准强化路径不纳入。

显示缺口集中收口：实际renderSecondsUsage隔离渲染null、0、12秒，目视三种提示清晰且无矛盾（内置浏览器截图已核对）；页面和临时服务已关闭。连同两份共用renderer专项、11/11时间适配及diff证据，Matched为缺读数不伪称有效、有效零保留、诊断原因可读；不改接口／原账／数值，无Extra。本批6文件含任务板与既有发布证据集中保存，不单独重复部署；真实生产者联合验收仍Missing。

同类提示补齐验证：app-runtime-time.test.js执行实际renderSecondsUsage，11/11通过；共用computer-usage-view专项再次通过，diff通过。独立Runtime分支源码已修正，新增分支的隔离目视尚待补齐，未提交／部署。原Mac Issue #12回读确认6088029731云端就绪通知已发布，随后6088075711为CI本机优先通知，当前未取得新Mac自动补发验收回报，不把交接发出当作Mac完成。

同类提示补齐：独立Runtime的renderSecondsUsage也在没有总量／可用部分时宣称基础有效。本次同一页面修订补齐该分支，沿现有app-runtime-time专项执行实际渲染函数验证null／0／有效部分；无读数不显示“部分统计可用”。不改数值、统计适配或接口，随同一批提交，最终目视与提交状态另记。

Windows生产者核验回报：Native确认Service在线2.6.40.0，11正式组件SHA256匹配原2.6.40清单，来源a60da7eda6e0a0cfdcb596920353dbb4f9badbdb、契约1.39.1；固定源码算法windows-application-v3-only-seconds-v1，不含新实例统计存储及能力。因此当前SOURCE_NOT_ADAPTED与旧生产者相符，不能登记为已证实的新代码故障。数据库只读失败，待发状态仍未核实；不触发UAC补查。下一步沿Native原任务核定一次集中最终候选SHA／契约及未批准强化草稿排除范围，不提前制包或安装，不承诺升级自动恢复旧日。

页面提示修订结果：两份共用renderer保持一致，缺基础读数时改为“尚无可用读数”，保留HTTP200中的具体原因；有效0和部分12秒仍保留有效提示。computer-usage-view.test.cjs及diff通过；本机隔离页面目视确认缺失／0／部分值和可展开原因，无真实家庭数据，服务与页面已关闭。Matched为状态文案与原因显示，未改变数值或请求；生产仍为46dcbbe，此小修尚未提交／部署，随后续集中交付。

当前显示修订：standard-cloud，小型页面缺陷；仅共用computer-usage-view的两份镜像及其专项测试。根据返回的总量／可用部分决定提示，0秒仍是有效值，无读数时不宣称“保留已有有效读数”或“基础用量仍有效”，显示已有服务端原因。最小验证为computer-usage-view.test.cjs、diff及隔离渲染目视；不改读取接口、统计、原账、终端，不运行全平台测试。随本批后续集中提交，不为文案单独部署。

登录实机补验（2026-10-10 03:51）：主控制台已登录，四视图可切换；当前Windows孩子今天及10/09应用视图显示不可用。实际10/09请求HTTP200，model=program-instance-v1，服务端返回APPLICATION_INSTANCE_STATISTICS_NOT_AVAILABLE、APPLICATION_INSTANCE_STATISTICS_SOURCE_NOT_ADAPTED，unsupportedSourceCount=1，无统计行／引用／总量；不是网络失败，也不能称读取贯通。已交原Native任务核对安装生产者与新格式上传接线，不另发中间包。页面在无基础读数时仍提示“基础用量仍有效”，登记为本批展示缺陷，不能以该提示证明数据有效。

**集中发布实际结果（2026-10-10，北京时间03:40核验）：** PR #248、#249已合并；部署来源master `46dcbbea55df9dbd21ff60da9682c42b3aad6e96`，契约1.46.0。run37980792222应用0017–0020后在0021回滚；最小CASE括号修复通过后，run37981530682应用0021并部署Runtime、Guardian及两套Pages。Wrangler再次核对无pending。不安装终端、不启共享、不改R2；Task页面仍由现有发布stage排除。

- Runtime Worker版本`889d6243-cefa-4de5-814f-71d7d57e7b4f`（100%）；Guardian版本`8da6becf-2c73-44bd-8c55-2cf54435cfdb`（100%）。
- Runtime Pages `269647f4-1a4e-48dd-a17a-edc6cba80300`；主Pages `c859f2f3-e4ac-4b20-97ec-db177f4a6685`，两者Production Source均`46dcbbe`。
- 发布run最后Main Pages smoke在部署后立即cmp读到不一致，因此run结论仍为failure、未生成自动manifest，**不伪报CI全绿**。随后只读复核生产别名、本次部署URL的computer-usage-view.js均精确等于git show该SHA，SHA256 `412add4a44ed0313213547e2f7c8c1631ee2d5ea7d1a4493ec54456be40a5a43`；两套线上app-runtime.js也精确匹配，SHA256 `f1f97f749b2536fde41064456b9a7ff645352132c3e3ea69b9ca5c65cc8af55a`。登记`PASS_WITH_MANUAL_EVIDENCE`（命令复核，不是登录实机验收），没有重复部署。
- Runtime health及既有鉴权smoke通过；新增实例登记能力与家长实例入口未鉴权均401。R2 latest发布前后均2.3.1、SHA256 `3109d6bbd147f5bfba88549a240dae42e84e724aa86bd1baef724d2df7b17563`。
- 已沿原Native会话转交Mac：现有0.1.41保留pending自动重试，先以机器鉴权核实新实例登记／统计能力，再回报新revision、ACK和published。**尚缺Mac真实自动补发回报、当前家庭登录页面验收及终端候选联合验收；不能以部署或401证明它们完成。** Native另报main b76dd4f为独立CI节流变更，未混入本次云端发布。
- Matched：源码集成、四资源发布、限定迁移、产物比对与未鉴权拒绝；Missing：上述真实联调；Extra：无新增分支、工作树、安装、共享启用或R2操作。发布证据本地任务板保存，后续随交付集中提交，不为证据单开PR。
生产run37980792222：master c7b1411精确CI通过，0017–0020已应用；0021在D1远程解析报incomplete input，后续四资源均未部署。只读核实pending仅0021且其表/索引/trigger均不存在，失败已回滚。触发器含未括起CASE..END，符合Cloudflare workers-sdk#4727记录的远程分割缺陷；本地SQLite/Worker测试不复现远端解析。最小修订仅为两处CASE加括号，不改变条件、错误码或表结构；固定语法回归与安装引用34项复验后，沿现有分支PR合并，发布只预期0021，禁止重放0017–0020。

PO明确批准职责检查最小修订：本批架构集成与标准云端可共同声明。新增且仅允许architecture-integration附加standard-cloud，既有单职责不变；扩展、Native、Task、Santa仍拒绝直接修改，公共文件仍需精确例外。不改变产品测试、生产审核、来源合并证明或部署授权。先补正反固定用例，再继续PR #248发布。

上述测试入口复验：publication 82/82与独立SQLite通过；typecheck发现目录测试request默认UUID导致参数被推为UUID模板类型，补显式string以保留“另一孩子”拒绝用例。仅测试夹具类型，不改变接口Child校验或产品代码。

Worker CI 后续定位：303项通过，旧生产者捕获比较因新增实例能力字段失败；独立node:sqlite脚本被Vitest Worker环境误收集报Illegal constructor。修订仅测试接线：SQLite脚本在npm test前由Node执行并精确排除Worker收集；旧捕获统计及ACK不改，新增能力明确断言后再比较旧能力集合。使用Cloudflare技能核对运行环境边界；只复验上述失败文件、存储脚本、typecheck及diff，不扩大产品行为。

PR #248 发布前 CI 修复：console 独立任务在干净 runner 仅 npm ci 后运行知识测试，缺少契约 dist，报 ERR_MODULE_NOT_FOUND；本地通过依赖已构建产物。仅补该任务 build:app-runtime-contracts 前置及固定顺序回归，不改变产品或降低门禁。职责 architecture-integration，工作流文件作为精确任务例外；最小验证为契约构建、知识页面专项、CI 路由、发布配置和差异检查，不运行终端或全平台测试。

PO集中发布授权（2026-10-10）：允许现有云端分支推送、PR及相关检查通过后合并；发布Runtime、Guardian与两套Pages；先核实生产pending，只执行0017–0021中未应用的迁移，发现其他pending即停止迁移步骤并报告。部署后核验新能力及Mac自动补发，不安装终端、不启共享、不发布Task／Santa、不改R2。本批复用已记录精确代码的专项及目视证据，CI按影响运行；发布与真实验收分别登记。本节此前待授权状态由本条覆盖，不以授权本身标为已发布。

Mac实际安装后上传前置缺口（Native原任务回报，2026-10-10）：0.1.41／源码9f87cee的240秒自然观察报告本机基础读取及revision推进，上传停capability、APPLICATION_ACCOUNT_UNSUPPORTED、attemptCount=0；不是新统计已上传或发布。根任务核对最新origin/master edcb4de的applicationAccounts能力响应确无application-instance-statistics-v1和application-instance-seconds-v1，且无实例登记能力路由；新接收实现仅在未交付的云端分支。因此先交付兼容云端，不要求Mac降级、改统计或重复安装。新实例统计能力依赖基础七表及0018两个兼容trigger，产品投影另依赖0019，登记依赖0017、安装引用依赖0021。当前未直接读取生产机器认证响应，不能把源码对比冒称生产响应核验；已通过原Native任务转告，保留队列。Mac首次健康检查失败单列未定位，不与本次能力缺失合并。

控件专项阻塞解除：PO已明确批准完成必要修复与聚焦复验，所属任务回报`node tests/unit/application-identity-usage-read-model.test.js`通过并本地提交`52513c3f624453fc8ec1467b2b57f4cadf45b73e`（14个本任务文件）。根任务独立核对该提交及HEAD、工作区干净；background仅在消息排除列表增加身份读取消息，原应用读取器只增加身份读取错误文案，此两处未修改网页原账。测试覆盖补充周读取失败保留所选日、完整快照缺subject零值、上下文失效、旧版字段隔离及基础／产品独立分页；这是所属任务测试回报，不冒称根任务重跑。下方“等待专项授权／未通过”由此覆盖；仍未推送、打包、安装或发布，真实Native Host与家庭隔离联调尚缺。云端推送／PR／合并授权不由本次控件专项批准自动获得。

最新主线`edcb4def45280fe5d15262d936059f24ef7d728d`与当前`7b0f8a3`经`git merge-tree --write-tree HEAD origin/master`预演无文本冲突，结果树`3f11205dabfe2c7e07b01a47f1f5006373c6c794`；未移动分支、修改索引或实际合并。此证据只证明可合并，不证明整合后测试或发布通过。任务板差异检查通过，待随集中交付保存，不为本条另建PR。

整批源码范围回读：已fetch现有origin/master及origin/codex/cloud-management，无pull／prune／切换；相对云端远端分支24个本地提交、75文件，相对最新master为主线独有1／本线独有29提交。实际发布依赖包含Runtime Worker、Guardian Worker和两套Pages：`pages/index.html`已请求`model=program-instance-v1`，Guardian路由及Service读取`getApplicationIdentityUsage`，不能仅部署Runtime后宣称两套页面贯通。分支含0017–0021五项迁移文件（实例、旧退出门兼容、独立产品投影、接纳诊断、安装引用），生产哪些已应用尚未本轮核实，不能只列0021或直接重复执行全部文件。以上是发布准备事实，不是生产操作授权；不发布Task／Santa、共享执行或R2。集中交付前必须按实际pending与实际资源一次列明范围。

接收端／发布依赖只读核对：`v2Routes.ts`的capabilities分别检查实例基础存储和安装引用存储；`programInstallationLinks.ts`要求0021表及两个触发器同时存在才声明安装能力，未就绪返回503；已有program-instances专项实际移走安装表后断言只保留登记能力、登记继续成功、安装摘要明确不可用，复用7b0f8a3对应专项证据，不重复运行。`.github/workflows/app-runtime-production.yml`仅workflow_dispatch且仅master执行；迁移步骤先精确比较完整pending列表，再以`migrations apply`执行全部pending，并非单文件执行。因此生产前必须取得实际pending列表并逐项包含于授权，不能把只批准0021解释为其他pending也获批。当前未查询生产、未触发流程；旧0011 exact-tree例外不能用于本批。Cloudflare／Worker技能用于此限定检查，平台类型按本仓4.20260702.1核对；不宣称完成全仓审计。

上一批云端目录范围及页面接线已集中本地提交`7b0f8a3d0732da0466248bf56a962284e06ec25b`，未推送或部署。Native远端main已核实为`cf834329834eb4bef07973e87c9bacf5310cab37`，包含固定1.46包；Mac不再等待包发布，也不需要等待云端部署才能改源码。Native报告已在原Issue #12评论6087163643补交依赖，目前尚无该增量的Mac领取证据，不新开任务。

| 工作链 | 已有证据 | 精确剩余工作／依赖 |
|---|---|---|
| Windows发现与登记 | Native已推送运行证据、扫描登记及1.46安装引用；隔离测试证据已登记 | 一次最终候选的实际扫描、上传及映射读取；不重复验证旧账，不混入待批准强化执行草稿 |
| Mac发现与登记 | 根任务已通过`git show 9f87ceee17420b545f9ca6940dd3bb1b80df2c40:agents/macos/MAC-APPLICATION-INSTANCE-INTEGRATION-2026-10-10.md`回读正式报告；运行采集→统计→上传→读取源码及报告中的隔离证据存在 | 在原任务补签名字段登记、扫描与同扫描安装引用，消费已可取得1.46；报告中的246/246、Swift32为Mac交付证据，不是本机重跑或Mac真实验收 |
| 云端与管理页面 | 1.46接收端及四资源已从46dcbbe发布，0017–0021已应用，线上脚本比对通过 | 登录实测应用来源未适配新版实例统计；真实两端联合验收仍缺，不能以HTTP200称贯通 |
| 控件读取 | 专项通过，本地提交52513c3；运输、渲染及隔离目视回报已登记 | 尚未推送、打包或安装；最终Native桥接及真实家庭联调待完成，不重复补跑已通过专项 |
| 产品执行 | 原有产品管理边界保持；扫描和安装引用不产生用量或自动确认归属 | Windows强化执行迁移为独立待批准项，不纳入本批；共享执行继续关闭 |

当前继续推进真实生产者及接收结果核对、最终候选联合验收准备和Mac原任务回报；集中云端发布已完成，不重复部署。阶段记录中的“页面未接线”“1.46尚未远端取得”“Native安装引用未提交”“控件专项待授权”已被本节覆盖，不据此重复开发或另发包。当前结论为部分Matched、其余Missing，整体未完成。

- **产品目录页面接线实施前：** standard-cloud，保留现有四个范围选项与分类／搜索／平台控件，消费program-instance-directory。已使用只取正向观察，已安装未使用须有安装正向依据且使用来源available，否则明确无法判断；全部目录始终可读。读取失败只使范围依据不可用，不遮挡目录与实例入口。保存目录后丢弃旧版本范围并重读，迟到结果按孩子及目录对象隔离。仅组件专项与隔离目视、diff，不访问真实家庭、不部署。

  结果：正式组件已消费同孩子／目录版本的产品范围；component与knowledge专项通过，已有backend34及29专项、typecheck证据复用。1280×900与390×844隔离正式页面目视通过，截图1791571636374、1791571636718、1791571657710、1791571657937保存在本机agent-browser临时目录；未使用／使用筛选实际呈现正确单项、卡片换行及按钮正常。浏览器与本地夹具已关闭。Matched＝云端安装／使用读取、实际页面筛选及失败隔离；Deviated／Extra＝无本批范围外变更；Missing＝真实扫描上传、生产和两端实机联调，不把隔离验收称生产通过。Cloudflare技能约束参数绑定与有界查询，agent-browser仅用隔离会话，不触碰真实Profile。准备集中本地提交，不推送或部署。

- **主目录近期使用读取实施前：** standard-cloud，复用已采用schema3实例统计，按北京时间今天及此前29日读取正数subject日行的存在性与最后日期，不累加小时／日行、不扫描原账、不做产品识别。先固定最多1000个已发布清单和总50000统计行预算，再按清单ID读取；未发布／旧格式不进入新版使用证据，其他家庭／孩子隔离。没有可读来源与确实没有正数subject分开，旧格式混合返回partial。仅相关统计专项、类型检查及差异检查，不重跑终端测试。随后由产品映射和主目录消费，读取器自身通过不代表筛选完成。

  结果：已接正式`/v2/module/program-instance-directory`家长只读入口，核对Child授权后按当前映射生成产品／平台事实；使用读取失败保留安装正向事实，不生成零用量。application-accounts 29/29、program-instances 34/34及typecheck通过；30日边界、未发布不可见、零秒新版替换旧观察、跨家庭／孩子、HTTP鉴权和缺统计表隔离均有调用证据。首轮新增测试误用只接收不发布的底层函数，改用正式commit接口后通过，未放宽产品读取条件。Matched＝正式云端读取；Missing＝主目录页面筛选消费及目视、真实生产联调。未提交、安装、部署或迁移。

- **Mac同任务后续回报（Native转交，尚未根任务实机核实）：** 原任务评论6086957311、事件`mac-instance-integration-source-20261010`，源码`9f87ceee17420b545f9ca6940dd3bb1b80df2c40`。1.44运行采集→基础统计／映射／上传／读取源码批已交；Native报告固定包及七项wire夹具校验通过，Swift／Mac内核结果不能由Windows代验。签名验证结果未传入登记的macosSignerKey／macosSigningIdentifier，扫描安装引用尚待1.46，保持原任务缺项，不另开平行任务、不称Mac整体验收完成。Windows安装引用最终本地提交`cf834329834eb4bef07973e87c9bacf5310cab37`，待集中远端交付，不以本地包存在称Mac可取得。

- **当前扫描范围读取实施前：** standard-cloud，仅既有安装引用读取器及专项。历史摘要保留，追加`latestScanEntryCount`（同用户最新扫描、当前有效Child分配、同次显式引用、当前条目installed的不同入口数）。0只表示没有满足这些条件的正向事实，不表示卸载；不回退到旧扫描，不按名称或内容猜关联。先补更新替换、改绑、失败扫描、跨家庭反例，运行program-instances专项、typecheck和diff；主目录筛选和30日使用范围尚需继续接线，不以此查询通过宣称页面已完成。不改原账、固定契约包、生产结构或部署。

  结果：正式实例列表经既有读取器已返回当前扫描正向计数；隔离D1专项33/33通过，backend typecheck通过。软件更新后旧实例历史摘要保留但当前计数退出，新引用晚到不沿用旧文件；A→B及回到A均不复活旧分配引用；runtimeObserved不冒充installed，失败新扫描／撤销机器不回退旧依据。首轮测试因Vite临时目录权限未启动，限定提权重试通过。Matched＝当前扫描依据读取；Missing＝产品级主目录范围消费、30日使用读取和真实联调。没有改固定包、原账、生产迁移或部署，待集中提交。

- **统一交付依赖核实（2026-10-10）：** 只读核验Native暂存的11文件批次已包含`contracts.lock.json`与`third_party/timeonchrome-app-runtime-contracts-1.46.0.tgz`；固定包176081字节，SHA256 `96faf6387250ba2a14a684307bdca9bc7e4d04f3254953e5af5be576001e0d5d`与架构侧一致，sourceGitSha为`cf4021d9b4b90a414a03077421f1b2052d8a17fd`。现有restore脚本从本仓包校验哈希及版本，不从云端或另一仓下载。因此Mac获取对应Native提交后即可恢复固定契约，不新增包分发服务、不把云端部署作为源码适配前置。当前仅本地暂存核实，尚无远端可取得证据；不得标为Mac已收到。待批准强化草稿留在工作区而不纳入该批。云端目录范围读取与控件专项仍分别待完成，不能被包交付状态掩盖。

- **主目录范围来源核查（2026-10-10）：** 已核对applicationKnowledge.ts的inventoryV2ReconciliationStatements与扫描摘要：成功来源才更新notObserved，失败不等于卸载；programInstanceStatistics.ts读取已采用schema3实例统计，当前接口最多七日，不能直接拿它冒充旧目录最近30天。下一步只读投影需保持既有范围，按已采用统计有界读取；不得扩大原账扫描或新建统计账。当前variant是机器／用户／条目键，更新可覆盖旧文件状态，必须用同次扫描显式引用而非历史任意引用连接当前安装状态。已在设计记录此边界，尚未实现主目录筛选；不将分析结论计作功能通过。Native当前仍活跃，回报97项受影响回归通过并在验证剥离强化草稿后的暂存快照，等待精确提交证据。

- **安装范围消费缺口定位（2026-10-10）：** `console/app-runtime.js:338–341`在identityCatalog存在时禁用directory-scope并强制all；新版管理加载约509行仅取program-instance-catalog，产品按规则平台和孩子明确分类展示，不读取实例安装／使用事实。因此3a16bc9的实例详情安装引用不代表主要应用、已安装未使用、使用证据筛选已恢复。后续须沿既有孩子范围提供产品映射＋安装盘点状态＋既有使用范围的只读投影，再由主目录消费；不能浏览器遍历全部实例拼结果，不能把历史有引用等同当前安装，不能按名称/hash补关联。无可靠事实时保留未知，不推断卸载或零用量。此项仍Missing，旧产品规则／原账不改；不以安装引用小批次替代整体管理完成。

- **安装摘要正式入口补证（实施前）：** 仅补既有knowledge组件请求→实例模板的断言，将安装摘要随真实page形状返回，检查正常／暂不可读均保留实例；不只测渲染辅助函数。不改产品逻辑，运行该组件专项和diff，复用已有目视。
  结果：正式open('instance')→请求响应→模板已断言引用条目与数量；刷新响应中安装摘要失败时产品名和机器标识仍保留。组件专项与diff通过，仅测试和文档待集中提交，不产生中间候选。控件所属专项因单次授权已用尽仍未验证，已集中请求完成该文件必要修复与复验的授权；不自行代跑，不阻挡云端与Native已有范围推进。

- **Native安装引用生产者交叉核对（2026-10-10，未提交草稿）：** 根任务只读回读固定1.46锁及`.tmp/installation-links/installation-links.trx`，实际26/26通过。核对正式Agent在扫描前固定scanId/scope、持久保存完整frames与捕获关系、发送扫描帧等待Service持久ACK；Service认证范围后生成instanceId并独立保存引用，上传能力独立判断、error.code精确解析、错误批次冷却、整批精确ACK，改绑晚到回执不确认新范围。实际测试调用Coordinator与MachineRuntimeApiClient的模拟HTTP，覆盖409依赖／范围冲突、503、部分ACK拒绝／乱序完整ACK接受、重启冻结100对、存储失败后基础登记仍可发送及无扫描用量。此为隔离入口证据，不是Windows真实扫描或云端联调通过。Native仍活跃收口；已要求将待批准强化草稿排除本批、保留现场，并核实Mac取得固定包的真实路径，不创建新任务或中间安装包。

- **安装引用读取与页面集中核对完成（源码／隔离，2026-10-10）：** 复用backend program-instances 30/30及typecheck证据，knowledge组件专项最终通过。修正隔离服务器权限上下文后HTTP200；夹具载入正式dialog、组件mount及页面CSS，1280×900和390×844目视通过，长引用换行、关闭入口及滚动正常，空引用／读取失败／旧响应无字段分别保留实例。截图位于本机agent-browser临时screenshots的1791570101166（手机）、1791570101371（桌面）、1791570128744（其他状态），非生产或真实OS证据。Matched＝只读摘要及页面消费；Deviated／Extra＝无；Missing＝真实Native上传联调、Mac1.46交付与后续生产验收。未修改固定契约包、原账、产品规则或运行环境；0021仍未应用生产。

- **安装引用页面接线（实施前）：** 在现有实例折叠详情消费只读installation摘要，区分已收到、无引用、旧响应缺字段、读取失败；最多五条，明确接收时间及非安装状态。不增加身份匹配或修改操作。仅组件专项、隔离桌面／手机目视和diff检查，不连接真实家庭、不安装部署；使用agent-browser独立会话核对布局。
  源码结果：已在原实例模板接入摘要，补缺字段／空／异常结构／转义／五条上限／时间合法性用例，knowledge组件专项最终通过。中间二次DOM查询与简化测试DOM不兼容，已取消二次查询、直接模板渲染后通过；不隐去失败。隔离目视尚缺：首次浏览器socket写入拒绝，doctor后单次提权重试本机夹具导航超时，停止继续重复；未获得截图、不提交本批页面。未安装或部署。

## 2026-10-10 应用身份新旧任务统一执行口径

本节为下方阶段记录的当前索引，不删除历史证据。沿用同一应用身份任务，不把扫描、运行证据、安装引用、名称展示拆成互相独立的交付或安装要求。

| 顺序 | 集中交付内容与负责人 | 复用、替代及当前缺口 |
|---|---|---|
| 1. 发现与登记 | Native负责平台运行／扫描采集、实例登记、同次安装引用；架构／云端负责固定契约与接收 | 复用已有Child秒账和上传；扫描不产生用量。Windows已消费1.46并开始隔离验证，尚未交付；Mac已领取1.44基线统一任务，可先做实例／映射接线，1.46尚未证明可远端取得，不自创安装协议、不逐版追赶Windows |
| 2. 识别与消费 | 云端唯一规则与映射；Native、控件、云端页面各自接入同一映射 | 未实施的旧统计行名称补丁被新映射消费取代；安全观测标签只用于未识别展示。不得重做旧Reader回退或恢复旧账；基础统计不因未识别而不可用。安装引用摘要已接云端读取，页面及真实生产者联调仍缺 |
| 3. 集中联调 | 两端所属任务与架构共同固定候选和实际调用链证据 | 按最终契约和实际影响补测试，复用未变化证据，不逐零件生成安装包；Windows与Mac结果分开，未安装、未部署、未实机的项目不得用源码或隔离测试替代 |

Mac原任务`NATIVE-APPLICATION-INSTANCE-STATISTICS`已通过回执6086328579领取集中修订6086244209；下文“尚无领取”的文字仅为当时记录。1.46契约源码`cf4021d9b4b90a414a03077421f1b2052d8a17fd`及固定包已交本地Native，尚未证明交付Mac；待远端可取得后只补原交接的依赖，不另开任务。共享执行、守护、历史P2以及两项待批准强化修订继续独立保留，不能混入本批。

接口核对发现Native安装引用草稿暂读root.code，实际云端错误路径为`HttpError → index → errorResponse`，响应`{"error":{"code":"...","message":"..."}}`，应读error.code；成功返回完整批次本身。409依赖未齐与范围冲突必须区分，503存储不可用独立处理；消息文本不是协议分支，不改孩子范围迁就失败。已发往原Native任务的通知仍待工具确认送达，本项未因此宣称Native已修好。只补本批HTTP隔离用例，不新增交付批次。

补充送达结果：首次工具审批超时，按允许范围重试一次后已确认发送到原Native会话；无需用户再次转发。通知送达不等于修复通过，后续以HTTP专项和实际接线回报为准。

本次仅更新任务归并与已核查证据；保留现有未提交代码，不安装、部署、执行生产迁移或改变运行服务。文档差异检查通过，不重跑产品测试。

## 2026-10-10 Mac 应用身份改造整批交接

### 新旧工作归并（先统一范围，再续开发）

| 工作 | 统一处置 |
|---|---|
| 已有孩子秒账、认证、自动上传／ACK、诊断 | 保留已有实现和精确证据；按新实例接线实际影响补回归，不重做整条旧链、不重复安装诊断版 |
| 旧账混算／历史名称恢复 | 混算方向已被纯新版原账决定取代，不恢复；历史名称尽力而为，不另开补齐工程 |
| 旧共享名称持久化交接 | 与新身份任务逐调用点归并：安全观测标签可作为未识别实例展示信息保留，但不能生成产品归属；未实施的旧统计行名称补丁不作为新模型前置，不盲目移植全部旧Reader回退 |
| 程序实例／证据／云端映射／基础与产品读取 | 当前唯一应用身份开发主线；先取得实际可用固定契约，再整批接线；不要求Mac逐个重演Windows中间版本 |
| 安装事实引用 | 已定位共同生产者与契约缺口，集中定稿后补同一任务；不要求Mac自创协议或按旧盘点猜接 |
| 共享执行、守护、历史P2、完整系统场景验收 | 保留各自原任务与状态，不并入身份改造，不借此次交接重新启用或重测 |

依据为Native现有纯v3交接、Mac进展回执、名称修订及实例阶段记录。远端当前任务的领取与未提交内容仍须Native核对，不能仅按旧文档取消对方正在实施的有效改动。通过同一Issue明确原任务的继续／已完成／被取代关系；历史证据保留，不另建平行工作单。

远端引用核对（Native本轮fetch后根任务只读复核）：`origin/main@1e816e7f1ae016ba59b3e7c40a7c63a5f5bf47c8`锁定1.44.0，上一1.43.0；Mac远端`77386dc0f20b15e282669088ece58ceb2b6d1afa`仍锁定1.38.0。这证明有可取得的1.44接线基线，不证明Mac本机没有未提交新工作；不得要求逐个中间版本升级。1.45目录接纳报告及本地后续采集提交未交付部分保持明确依赖，不拿它阻塞1.44已定义的实例／映射／读取适配。

- 当前阶段：安排现有 Native 会话通过既有 Mac 交接渠道核实并转交；此前统计／名称任务不代替本批领取。收到远端任务标识及 Mac 领取回执前，不标记分配完成。
- **GitHub直接回读确认：** 已有任务`NATIVE-APPLICATION-INSTANCE-STATISTICS`，原事件`windows-instance-statistics-stage-20261009-66962ad`（Issue #12评论6081716322），后续恢复说明`windows-observation-reliability-20261009-f11bb04`（6082356514）回复原事件。两条均为Windows发出的阶段交接，要求平台核对，不等于Mac领取或整批实施完成。此次API全部评论中未见该任务的Mac领取／完成回执；最新Mac事件仍为6025058593的旧诊断安装回报。统一修订应沿用原任务和reply_to，不创建第二个应用身份任务。此前“未找到当前身份交接”的有限核查结论由本条补齐。
- **Native归并回报已收到：** 孩子统计旧任务领取6001479041、源码98fdd3b；纯v3任务领取6023519643，源码6542050、安装331945e、页面e6f43cf；诊断安装77386dc及有限观察证据复用。已要求沿原实例任务发送一条集中修订，明确旧名称要求被归并，1.44为可取得接线基线，1.45及未发布增量另列依赖；当前发送回读仍待。PR #247的Guardian修复已在原目标作用域解决WEB_STATISTICS_PARTIAL，不将旧诊断条目重新列为全局当前故障；其他范围无证据仍为未验证。Mac本机未提交内容未知，先领取并回报现状，不覆盖现有工作。
- 范围：Mac 实际可执行文件的机器／位置／内容实例观测；扫描与运行共用有界证据采集；已验证签名发布者＋签名标识；Child 范围隔离的持久登记、版本补发与精确回执；消费云端唯一映射；基础实例与产品归集分层读取；目录接纳状态。未知身份不得阻断有效整数秒原账和基础统计，不在 Mac 另建归属规则权威。
- 先核对 Mac 当前源码及固定契约，列明可复用／缺失／等待云端项目，再按真实断点实施。Windows 专属文件系列、AUMID、WTS、执行器不得机械移植。仅通过可取得且已校验的固定契约开发；本地未推送成果不可写为 Mac 已收到。
- 安装事实显式引用尚待集中定稿，不猜补、不阻塞已固定的实例与映射链路；Windows 疑似强化待裁决补充不纳入 Mac 本批。实机验证、安装和生产接纳另列，当前仅源码及隔离测试，不安装、部署、生产迁移、启共享或真实结束应用，不新建分支／工作树／重复交接文档。
- 交付证据：原渠道任务／评论标识、领取状态、固定 SHA／契约哈希、真实入口接线及最小测试；源码通过、已安装、生产和实机分别记录。旧数据尽力而为，不恢复旧账迁移。
- **集中修订已送达并独立回读：** Issue #12评论[6086244209](https://github.com/william-xia-cn/TimeWhereNative/issues/12#issuecomment-6086244209)，事件`windows-mac-instance-unified-20261010`，沿原task及reply_to，固定远端`1e816e7`和1.44包哈希。正文明确取代旧文档“等待收口／沿名称任务继续”的指引，复用已有成果并排除安装部署与Windows待批准补充。根任务通过GitHub插件直接回读一致；当前仅证明交接送达，尚无Mac领取或源码完成回执。

## 2026-10-09 应用身份分阶段实施：待完成问题登记

### 当前收口清单（覆盖下方各阶段的旧待办状态）

- **安装引用只读列表（实施前）：** standard-cloud，现有孩子实例列表追加独立installation状态与最多5个条目摘要、总条目数；同条目多次扫描合并展示最近扫描接收时间，不称当前安装或实际安装时间。按家庭／孩子／本页实例查询，缺表或读取失败仅此信息unavailable，实例映射和基础列表保留。新增索引并入尚未生产应用的0021源码，不执行迁移。仅接收模块、实例列表、原专项及设计，运行program-instances、typecheck、diff；页面接线与目视另验，不改固定1.46包。
  结果：正式实例列表已附带安装摘要，program-instances 30/30、backend typecheck通过；8条引用仅返回5条摘要但保留总数，重复扫描同条目不增数、最近接收时间更新，跨家庭／孩子无引用泄漏；缺0021表时保留实例且仅installation不可用。没有从安装事实推断产品归属，未改原账、固定包或生产。Matched＝本批只读接线；Missing＝页面显示及真实生产者联调，测试不替代OS扫描与实机。

- **集中提交审计（2026-10-10）：** 契约1.46源码提交`cf4021d9b4b90a414a03077421f1b2052d8a17fd`，包SHA未变，准确sourceGitSha已交Native继续固定消费；尚未推送，不标Mac已取得。Matched＝契约结构／共同向量／精确ACK／条件能力和云端接收／事务约束；Deviated／Extra＝无本批范围外修改；Missing＝Native生产者、安装只读展示及集中实机。源码、开发包、生产及安装状态严格分开。云端接收批次准备同主题本地提交，复用29/29和typecheck证据，不重复跑无关测试；原.wrangler和所有旧包保留。

- **安装引用集中固定包（实施前）：** architecture-integration，准备1.46.0本地开发契约包，1.45包保留不覆盖。补共同安装引用Schema和正反向量、固定版本与根workspace锁；仅contracts build、classification及兼容结构检查、包内容／SHA核验，不跑其他业务专项。Native在固定包可取得并校验后接线，不跨仓引用源码；包交付不是生产部署或安装。根package-lock仅同步workspace契约版本，无依赖升级。
  结果：1.46.0 tgz 176081字节、94文件，SHA256 `96faf6387250ba2a14a684307bdca9bc7e4d04f3254953e5af5be576001e0d5d`；tar目录包含新增Schema／9项共同向量，build、classification、compatibility通过，Schema控制字符正反例通过。1.45哈希仍b4118dec…004ffc。本地Native已收到固定路径、哈希及原任务接线指令；尚待实际消费／源码回报，Mac远端尚未取得此包，不标已交付Mac。没有安装、部署或生产迁移。

- **安装引用交付边界补齐（实施前）：** 契约增加精确批次回执校验；复用既有实例能力入口，仅基础登记与0021引用存储均就绪时声明安装引用能力。旧端可忽略新增能力，缺存储不误称支持；回执核对孩子／用户／分配／扫描及全部引用，顺序无关，不接受缺项、多项或重复项。仍只改本批契约、接收模块、路由及对应专项，最小build/classification、backend typecheck/program-instances、diff；固定包和生产均不变。Native仅收到生产者只读核对请求，不消费未固定包。
  结果：回执解析已用于正式路由返回的专项断言，错范围／缺项／多项／重复拒绝、顺序变化允许；缺引用表时能力只声明基础登记。contracts build/classification、backend typecheck和program-instances 29/29通过，diff通过。Native只读回报确认Application+Capture目前仅内存、scanId晚生成、独立引用outbox和包Executable捕获均未接，等待集中固定包后实施；没有已发安装引用的线上故障。128字符用户上限来自既有inventory，超出范围只让安装引用不可发送且记录原因，不截断／取别名、不阻挡256字符实例发现与基础统计。

- **安装引用接收接线（实施前）：** standard-cloud，新增独立接收模块、正式机器路由与隔离D1专项；本地additive 0021只保存已核对的扫描条目／实例引用，不是产品归属或用量表，不应用生产。机器认证及历史分配核对后，事务约束同一扫描用户、已收到条目及相同Child／用户／分配实例范围；先到引用返回依赖未齐，重放幂等；同一扫描不得改属。缺表明确503且不影响原登记路由。测试覆盖真实路由鉴权、乱序补发、批次回滚、重复、改绑历史范围及机器隔离，运行专项、typecheck和diff，不跑产品全量或实机动作。
  结果：正式POST路由已接，backend typecheck与program-instances专项29/29通过（含新增5项）；diff检查通过。Cloudflare／Worker审查落实参数绑定、D1整批事务及数据库范围约束；没有额外云端待关联队列，缺依赖由发送方重试。Matched＝接收、持久引用、重复幂等、错误范围和缺存储隔离；Missing＝Native同次扫描实际生产者、固定契约交付、安装展示及真实联调。测试扫描条目为合成接收夹具，不声称OS扫描已覆盖；0021只在隔离测试库应用，生产未迁移、未部署，基础原账和统计读取未改。

- **安装引用格式对齐（实施前）：** 核对正式盘点接收器后确认scanId为32位小写十六进制、localUserId最多128字符；新引用解析沿用该格式，不接受实际扫描无法产生的标识。仅修订开发契约及反例，运行contracts build、classification专项和diff；不修改固定包、产品代码、生产存储或两端安装。
  结果：开发契约已对齐真实inventory格式，补充请求与scope同时非法仍拒绝、合法但不同scan拒绝、用户128／129边界；build与classification专项通过，diff检查通过。固定1.45包SHA256仍为b4118dec…004ffc。Matched＝格式及范围解析；Missing＝真实生产者持久引用、接收存储和安装展示，未以解析通过冒称全链路完成。新源码尚未打包交付。
- **Mac领取状态更新：** Native转交回执6086328579，事件`mac-unified-instance-task-received-20261010`，回复集中修订；固定文档c02d16c的WINDOWS-TASK-RECEIPT-2026-10-10.md确认1.44包哈希及干净基线。状态为已领取，尚未实施产品源码，未安装或实机通过；覆盖上方“尚无领取回执”的历史状态，不再发送领取确认造成消息循环。

- **安装引用契约实施前：** architecture-integration，仅现有classification契约／专项测试和设计文档。按同次扫描保存variantKey→instanceId正向关系，复用认证分配范围，最多100对，不承载产品、名称或卸载语义。最小验证为多对多、重复对、错孩子／用户／分配／扫描、额外字段、边界及返回值隔离；只build、classification专项、diff。不改旧接口、版本包、生产存储、Native或扩展，不部署。解析通过不证明真实采集或接收端已接线。
- **安装引用开发契约结果：** 新增独立`ProgramInstallationLinkBatch`及严格解析，固定正反例通过；contracts build、classification专项和diff检查通过。Matched＝正向关系、认证范围结构核对、多对多及100对上限；Missing＝真实生产者持久关联、云端接收存储与安装展示；Deviated／Extra＝无本批超范围行为。未修改旧inventory API或固定1.45包（SHA仍b4118dec…004ffc），没有发版或上线；不能由纯解析测试证明采集真实性、鉴权或接收幂等已实现。

- **强化兼容后续状态更新：** Native最终排除3项真实ping动作测试后，当前／上一契约各34项通过（所属任务回报，尚待根任务逐项回读）；不能关闭策略撤销及疑似执行资格缺口。此前“补排除集合”已暂停，策略版本绑定和资格范围补充待用户确认，未实施、未提交为完成，不转交Mac复刻。统计和实例发现工作可独立继续。

- **强化兼容本批审查（2026-10-10）：** 正式Service发送与Agent撤销已接线，根任务回读模拟动作入口测试及修正后的空值校验；最终结果待修复收口。首轮所属任务报告37项通过，但其中3项旧测试关闭了测试专用ping进程，不符合本批“仅模拟动作”范围，记为Deviated，不能称全模拟；后续显式排除，不触及用户应用。另查明blocked-only消息不能区分确定允许和未知，按已有ARM-D-038必须排除确定归属其他产品和冲突对象；已交Native在同份本机决策中补排除引用集合，不新增产品识别或公网契约。最终验证仍待，未安装部署。

- **控件最新单次复验（2026-10-10）：** 新授权已执行一次`application-identity-usage-read-model.test.js`，exit 1；此前currentBase空值路径已越过，现停在旧版兼容文案的过宽否定断言：`/身份分层/`误匹配“未按基础实例与产品身份分层”。后续用例尚未运行，专项仍未通过。所属会话已改为核对旧版标签、identityModel=false及新版区块字段缺席，根任务直接读取未跟踪测试文件186–190行确认，并在限定权限只读运行diff检查通过；未改正常产品文案迎合测试。静态通过不等于专项通过，不自动复跑、不提交候选或发布。

- **安装引用实际生产者缺口（只读核对）：** `WindowsApplicationDiscovery.ScanAsync/ObserveVariant`仅将实际快捷方式EXE捕获加入`ProgramDiscoveryFile`；包清单入口目前生成旧盘点variant，未产生该捕获关系。`SessionAgent.SendInventoryAsync`又只持久化`ProgramCaptures`，丢掉Application侧同次关系后独立发送旧聚合盘点。因此已有15项通过不能证明包应用或安装引用覆盖；下一批须保留同次条目／实际文件引用至Service，再定义有界云端引用传输，不能从旧identity/hash/名称反向恢复。注册表／分发器安装容器仍只作安装事实，无实际文件不得伪造实例。包入口须核实声明可执行文件与包范围，无法证明保持未关联；不递归扫描全部安装目录，不以扫描失败推断卸载。本条只登记实际接线缺口，未改协议、存储或生产数据。

- **扫描源码批次已核验／继续强化兼容：** Native本地提交`bfdad2a`共8文件，根任务回读报告与diff范围对应当前／上一契约各15项证据；未推送安装。扫描安装引用仍待云端契约，不以源码交付冒称实机全覆盖。下一Native批次在既有获批疑似封锁范围内修复新实例模式切换后的覆盖缺口：统一动作门、只保留旧suspectedMatchers支路、不恢复旧确定匹配器、不写确定归属、执行前核验与严格撤销；仅相关源码及模拟终止隔离回归，具体设计见docs/DESIGN，不真实结束进程、不安装部署。云端安装引用并行准备，控件专项待复验授权仍单列。

- **扫描分配版本依据补验（实施前）：** standard-cloud，仅在program-instances专项调用正式updateUserAssignment验证A→B分配版本递增、旧分配保留及原范围补发不改属；旧版本自报新Child须拒绝，已固定A范围的云端待发仍可归A，不误改成“所有旧上传拒绝”。Native实时扫描接纳则须匹配当前分配，二者不是同一边界。不新增Child冗余字段或凭据，不改生产函数；最小验证为该专项、typecheck及diff，Cloudflare／Worker技能用于核对现有参数化存储和版本约束。

  结果：program-instances 24/24通过。新增用例通过正式分配函数及实际隔离D1证明version1/A→version2/B、旧记录不变，旧版本冒充B拒绝，A历史补发与B新范围分别保留；不是直接改DB伪造改绑。生产写入只新增分配，(machine,user,version)主键约束，复用该范围，不新增Child重复字段。此证据不代表生产实机改绑已测。

- **扫描登记批次（2026-10-10，源码修复与隔离验证中）：**
  - 已接正式扫描→认证Service→持久登记→冻结上传；扫描不生成用量。根任务直接读取Native `.tmp/program-discovery/discovery.trx`及`discovery-previous.trx`，当前／上一兼容契约均15/15通过（不是30个独立场景），覆盖同内容两位置、改绑及运输／Service重启、错误用户／机器／未分配、内容更新、三路回执隔离、扫描等待预算及扫描／运行去重；原账逐项保持不变。
  - 交叉审查发现并在草稿修正：不同用户可有相同assignmentVersion，故固定Service给定LocalUserId并核对管道用户；原盘点与证据补发共用单pending回执会抛INVENTORY_RECEIPT_PENDING，现分流；原逐文件等待20秒改为整次扫描共享捕获等待预算。均不是已证实生产故障，不引入新凭据，不改原账。
  - 源码已集中为`bfdad2a`，实机仍待验。预算用例以12个文件和挂起哈希验证共享等待预算；不声称所有OS元数据读取均有硬时限。回执测试已改名，仅证明ACK隔离，不冒称实际原账调度无阻塞。ProgramDiscoveryFile已保留条目／捕获直接关系，线上安装引用／筛选仍未实现，不能按hash猜接。
  - 环境：所属会话503终止后已恢复；受限构建无编译错误却异常退出，正常权限运行成功，不记为源码错误。云端工作树普通沙箱Git检查异常，经限定授权只读运行status及diff检查成功；未改Git配置。预算用例首轮夹具的同内容12文件被旧盘点正确合并1行，改用不同内容后通过；未修改产品合并规则迎合测试。未安装、部署或启用共享。

- **盘点隔离补验结果（2026-10-10）：** 新增实际机器认证inventory v2上传后回读用例通过：同内容不同位置的2实例保持独立、规则确认产品名称不被旧盘点名称覆盖、scope数量不增且未分配孩子仍为空。program-instances23/23及backend typecheck通过；首命令因D盘测试缓存写权限未启动，限定本地隔离权限后通过，不是断言失败。此证据仅证明两套事实不会隐式猜接，不代表安装事实引用／安装筛选已实现。Cloudflare／Worker技能审查复用现有鉴权、绑定SQL及事务，不改生产逻辑。本批仅测试及既有设计／任务记录，未安装部署。

- **盘点与新映射隔离补验（实施前）：** standard-cloud，仅在现有program-instances专项增加真实机器认证盘点上传→既有新实例目录回读，验证旧同hash／旧名称条目不会覆盖规则确认产品、合并不同位置或增加未授权孩子scope。复用旧盘点存储，不新增产品真值或通过hash猜安装引用；本项不实现安装筛选。最小测试为该文件、typecheck、diff，不运行无关产品测试、不部署或迁移；Cloudflare／Worker技能用于事务及鉴权边界核对。

- **控件本次单次复验失败，未交付（2026-10-10）：** 降级周读取后`currentBaseDays: currentBase.days`仍访问null，专项中途停止；不是原账或生产故障。根任务只读同时查出后续旧错误码断言与新context_changed不一致、分页断言未区分选定日和本周两个范围。已交所属端一次核对全部分支并保留强身份校验；本次授权已消耗，不自动再次运行。已集中申请本专项必要修复／复验收口授权，其余Native工作继续；不提交未通过实现，不安装发布。

- **Native运行批次集中提交已核验：** 本地`0ed81fd`共13文件，包含正式运行采集／运输／Service／持久证据与专项；当前树仅保留原有未跟踪`__pycache__`。当前1.45与上一1.44各23项通过，不累计为46个独立案例。OS签名／AUMID采集为源码核对，专项注入证据验证后续管道，不等于真实采集矩阵已验收；本批未安装部署。扫描独立登记继续由同一活跃Native任务处理，安装引用及强化兼容仍未关闭。

- **控件专项复验已获单次授权（2026-10-10）：** PO明确允许补跑一次`application-identity-usage-read-model.test.js`，已交原TimeOnChrome-Extension任务；下方“待批准”记录为旧状态，尚未取得本次通过结果。所属任务已回报运输层、Admin渲染及桌面／手机隔离目视通过，根任务核对当前源码和任务板一致，未将回报冒称真实安装验收。只读发现待核实两点：附加本周读取异常会抛弃已成功选定日期结果；baseRows缺席实例的完整性读取少一层base。要求最小修复、纳入本次专项，同时孩子／连接失效仍拒绝旧结果，不跨范围复用。仅原树源码与隔离测试，集中本地提交，不打包安装或发布。

- **运行证据专项最新回读（2026-10-10）：** Native `.tmp/runtime-evidence/runtime-evidence.trx` 及 `runtime-evidence-previous.trx` 当前／上一兼容包实际均23/23通过（覆盖此前22项结果，并补运行盘点调度保持包上下文）。逐项确认包含正式运行调度→运输→Service→SQLite→冻结ACK、首次ACK删除后晚到证据重新入队及旧ACK不确认新版、同实例跨用户两种先后顺序共享快照版本、缺字段保留／冲突／明确撤回。首次新增4项中3项因隔离数据库目录缺失失败，修正夹具后以上正式专项通过；不将首次失败隐去。源码现以证据序号确认，并保留有界已登记运输凭据供晚到增强重新入队，未登记扫描对象仍拒绝。Matched仅为本批隔离链路，安装扫描实际接线、安装事实关联、强化兼容及实机仍Missing；Native原会话持续工作，不需重新安装或重启任务。

- **晚到增强运输缺口（运行批次交叉核对）：** Agent实际persistResolution仍调用RecordAsync(capture,true)，初始ACK后FinishAsync删除该ref行；pipeline的acknowledged仅按ref记录，PrepareCaptureAsync不再持久化已ACK引用。当前草稿因此可能丢弃同代际后到的强证据（onlyExisting=false返回被忽略）。已通知Native集中覆盖首次binary ACK删除→晚到强证据→再入队／上传，以及旧ACK晚到场景；不能通过无条件发送未登记扫描观测绕开范围。未部署代码，不宣称生产已发生；待正式回归证明修复。

- **运行证据修订回读（源码草稿，未验收）：** Native已改同(machine,instance)的evidence_head与候选集合，向各授权scope复制相同revision/hash而非各自递增；二次增强的prior不再设无效sequence=0，history副本表已移除。运行入口传实际包身份，后台复核进程/文件代际并读取签名系列，已知内容复用hash；packageContexts随有界路径缓存淘汰。当前仅确认这些源码差异存在，正式采集→Store→冻结ACK与多用户测试结果尚待，不把修订存在写成修复通过。Native原任务仍活跃，不重启、不另发安装包。

- **强化测试证据补充：** 已回读ProgramInstancePolicyTests约54–71行，除检测函数外还明确断言切换后SetPolicy及Withdraw不恢复旧ProductBlockActive。因此可证明旧路径被关闭，不能证明强化功能已迁移；缺的是正式Coordinator切换前后有强化设置时仍保持获批功能的端到端隔离证据，而不是笼统“完全没有测试”。

- **强化兼容缺口已定位（只读，2026-10-10）：** Native ProgramInstancePolicyBuilder.HasUnmigratedSuspectedPolicy检查旧策略suspectedMatchers；Coordinator约1626行在首次切换前阻止新模式，已下发后遇到该条件则发送Ready=false的空动作。Agent接纳后保持instanceConsumer；WindowsBlockedApplicationEnforcer约84–88行仅运行新实例或旧产品路径之一，IsProductBlockActive也在新模式返回false。因此“已切换后出现旧强化设置”尚无恢复旧强化执行的实现证据，不能宣称迁移覆盖。现有ProgramInstancePolicyTests只覆盖检测函数真假，不证明该转换；新schema4保存仅允许原有强化线索保留，不代表Native已消费。列入原强化迁移待办，须覆盖首次带强化、切换后新增／恢复／撤销、断线重连及单次动作；不允许将疑似执行命中写成确定产品身份。本轮只定位，不改终止逻辑或真实设置，不把开发分支缺口称已证实生产故障。

- **Native运行证据草稿交叉核对（2026-10-10，未提交代码，不是生产故障）：** 当前EnqueueResolved按用户候选及scope独立revision，与云端(machine,instance)单一证据版本不一致，两个用户同实例可能同版异hash／覆盖；已交原Native任务统一实例快照和版本，Child授权scope仍独立。另外Store将非空候选构造为sequence=0后调用会拒绝该状态的Validate，须覆盖第二次增强正式Store路径；冻结ACK已有revision/hash条件，新history表须说明必要性，避免无限重复历史。原任务仍活跃实施，未安装／上传新代码；本项不扩展旧账或新的归属规则。

- **扫描登记接收边界补验结果：** program-instances 22/22、backend typecheck及diff通过。新增用例实际机器认证路由→持久证据→规则映射→孩子目录读取，无应用统计清单时成功；同实例两个孩子必须分别有分配／登记，越界Child拒绝，重复上传保持1实例／2scope。Matched＝已有云端接收可复用及范围隔离，不需新增扫描上传接口；Missing＝Native扫描调度真实接线、安装事实显式引用、实机。此测试不证明本机未生成原账，由Native专项检查；本批只集中提交测试、设计和任务板，不部署安装。Cloudflare／Worker技能核对绑定参数与事务，未改云端生产逻辑。

- **扫描无用量登记云端补验（实施前）：** standard-cloud，仅补program-instances隔离专项，实际机器认证路由登记→映射→孩子目录读取，验证无统计／原账前置、同实例不同孩子分别登记、未授权范围拒绝和重复登记不复制实体。最小运行该文件及typecheck、diff；不修改生产接收逻辑或新增线上协议。Cloudflare／Worker技能用于接收边界与参数化D1核对，不开展无关全面审查。

- **扫描发现下一阶段已明确（2026-10-10）：** 已回读旧inventory v2机器用户校验／产品与变体存储及新实例入口，不能以盘点成功冒充孩子实例登记。docs/DESIGN固定先接独立扫描登记，复用认证Agent、当前有效分配、观测和实例队列，不产生用量；再接同次盘点事实的显式实例引用，不按名称或hash猜关联。安装筛选仍Missing，不新增重复产品归属源。Native先完成正在进行的运行强证据批次，再按此范围实施扫描接线；仅源码／隔离测试，不发包、安装、部署或生产迁移。本次设计文档仅一致性和diff检查，不重跑未变产品测试。

- **运行证据接线修复（实施前，2026-10-10）：** native-local，基于已确认断点先贯通真实运行观测，不等待安装展示：复用1.45既有binaryHash／windowsAumid／windowsFileSeriesKey；由同一文件代际及真实进程上下文核验，后台有界采集，经认证本机传输和持久队列交Service。Service仅增强已经固定到孩子范围的同machine/location/content实例，不由Agent自报Child；完整证据快照变化递增revision并pending，旧ACK不吞新版本。临时采集失败／缺字段保留仍有效依据；确证撤回或同实例同字段出现不同核验值时不能最后写入获胜，争议字段不得继续作为确定证据，其他独立有效证据仍保留。不按名称、旧packageId文本或hash跨位置借证据，不另建云端匹配器、不改原账／计时／共享。Native补正式采集调度→认证消息→SQLite→冻结上传ACK专项及旧端兼容，集中本地提交不发安装包。扫描独立登记、安装元数据及同exe多入口的丰富表达仍另列缺口，首批不猜补。

- **证据升级接收专项结果（2026-10-10）：** 实际机器认证路由→隔离D1→正式规则映射已覆盖binaryHash初始未识别、同实例新revision补文件系列后确认、旧重放不覆盖、同hash不同位置实例不借系列，以及新revision明确撤回系列后回到未识别。program-instances 21/21、backend typecheck及diff通过，生产逻辑／接口未改。Matched＝云端现有完整证据快照替换及映射；Missing＝Native真实采集/合并/队列和扫描范围、安装状态表达及实机。已将完整快照而非云端永久union的语义回传原Native任务，避免采集遗漏被误当撤回。Cloudflare／Worker技能用于核对D1参数绑定、事务与有界处理；不将该专项称为全仓审计。不部署、不安装或新增契约版本。

- **证据补齐接收端验证（实施前）：** standard-cloud，本轮仅在既有program-instances专项补充真实机器路由→登记→证据升级→映射重建回归，使用既有Windows文件系列证据，检查旧版本重放不覆盖、高版本完整快照更新、同内容不同位置仍为两个实例。云端不自行合并证据或按hash复用安装状态，采集端须上送同实例完整有效证据；明确撤回依据也通过新版本表达。只改该测试和任务板，运行该文件、typecheck及diff，不修改生产逻辑、协议、配置或原账。Cloudflare／Worker技能核对现有D1事务及有界参数，未开展全平台审查。

- **Native接纳报告回读（2026-10-10）：** 已在Native仓以`git -C`核实本地提交`f817fbc7551e8c900272b02a85d455d7908c52ab`9文件范围；读取实际TRX，1.45为23/23、上一1.44为22/22，不累加。固定1.45包SHA256与架构交付一致。直接核对Coordinator.BuildProgramInstancePolicyStatusAsync→HeartbeatOnceAsync，以及WindowsSessionLauncher完整性和Summary：能力未声明省略、完整会话分母、精确ACK／当前上下文／Ready／租约、版本一致才accepted、非accepted目录null，构造失败不阻断旧心跳。Matched＝本机源码及隔离证据；未核实远端推送，未安装或生产发送；生产0020／启用、真实权限与多用户矩阵、Mac、强化规则迁移仍Missing。Native接着评估上述归属证据断点，不以本批完成替代整体身份完成。

- **断点补充依据：** `ProgramObservationStore.EnqueueResolved`第117行实际只构造binaryHash；Service `ApplyObservationResolutionAsync`只向已登记的该用户观测补文件哈希，活动事实入口第2119行才以当前有效Child建立scope。旧`WindowsApplicationEvidence.FromExecutable`已有文件锁、WinVerifyTrust后文件系列和路径一致的包AUMID采集，可评估复用其核验逻辑，但不能仅按同hash把不同位置实例或不同用户的安装状态合并。Native既有任务已收到只读评估交接，继续先完成当前接纳报告批次。此次只读调查＋任务板登记，diff检查通过，未运行产品测试或改源码。

- **扫描／运行证据实际断点（只读确认，待Native补齐评估）：** Native `ProgramObservationStore.ResolveAsync`附近创建的ProgramInstanceEvidence只有binaryHash；`ProgramInstanceRegistrationStore.NextAsync`还要求Verified.Count==1，故契约已支持的Windows完整AUMID／文件系列等证据不能从该队列进入新归属规则。`WindowsApplicationDiscovery.ObserveVariant`调用Observe(path,"inventory")，但该参数是unavailableKey而非持久发现来源；原有installed、scope及sourceKind留在旧AppEvidence盘点中，没有新实例关联依据。当前只能证明精确文件规则链，不能宣称新实例跨版本规则、已安装未使用筛选已贯通。请Native在现有任务核对真实扫描与运行采集→持久队列→上传，给出复用已核验证据及来源关联的最小方案／缺失项；不得按显示名、路径或运行时出现推断安装或产品。先评估，不另发包、不改原账、无安装部署；本机与云端均保持未识别合法，旧数据不追补。

- **新版目录导入本批结果：** 已接schema4逐项差异→选择→草稿→既有集中保存，不导入包内版本／孩子绑定，不删除未选择条目；跨孩子共用分类规则同ID覆盖拒绝。knowledge/component、JS语法及diff通过，固定v4解析／分类消费者验证缺产品引用拒绝、孩子明确分类与其他孩子绑定保留；新增文件迟到回归覆盖后读优先、关闭及切换孩子不写入。agent-browser独立回环mock真实选择文件，未勾选拒绝、勾选产品及归属规则后保存7→8，回读原两个孩子绑定不变、外部绑定未进入，桌面与390px手机截图已目视。该夹具不提供云端预览接口，未将保存mock冒充云端联调。Matched＝导入源码／专项／隔离界面；Missing＝安装范围依据、Native实际接纳报告、强化迁移、控件获准复验和跨端实机；Deviated／Extra＝无。仅本地提交本批4文件，不推送、不安装部署、生产迁移或启共享；旧数据尽力而为，原未跟踪产物保留。

- **新版目录导入（实施前）：** standard-cloud，复用现有schema4目录预览／保存，不新增HTTP入口或匹配器。只将导入包products／ownershipRules／rules的逐项差异加入内存草稿，不删除未选择条目，不采用包内version或孩子bindings；明确提示产品／归属规则为家庭共用，分类规则仅批准当前孩子，当前孩子明确分类及其他孩子绑定保留。已被其他孩子批准的同ID分类规则不能隐式覆盖，须使用新ID。无选择不修改，坏格式／依赖缺项保留草稿并经现有云端校验拒绝；文件迟到读取受当前孩子／弹窗代次隔离。仅knowledge/component专项、固定解析器、语法／diff和隔离目视，不部署或改第三层映射。

- **导入／安装范围缺口已具体定位：** 新实例ProductOwnershipEvidence及RegistrationBatch只含平台、已核验证据、实例和分配，没有安装状态／发现来源／安装范围；不能从运行使用或位置猜“已安装”。旧knowledge组件diffImport会访问product.selectors，旧import-preview/approve使用原目录模型；schema4产品没有selectors，不能直接复用旧入口或将名称候选当确定产品。本项尚未实现：导入须保持逐项差异确认、现有孩子绑定和集中规则边界，安装信息须先明确复用已有盘点关联的可靠依据；不新增识别条件、不过度采集、不扩展旧账修复。此次只读定位，未改数据或接口。

- **1.45固定包核验：** build、machine-control（含12项共同JSON正反向量）、compatibility及diff通过；包173503字节、92文件逐一与源码／dist SHA256一致，包SHA256 `b4118dec1f07b9cc44eba89b68057e0f9249c2f84b310b65466677e65c004ffc`。1.44原包仍为`52333a21db1c4fa73c4da583f455b21b37a9e1bf3cd0f489152c118f48025f5c`。Matched＝可选诊断开发包；Missing＝Native真实汇总上报及跨端实机；Extra／Deviated＝无。只集中提交8个契约／文档／workspace锁文件，不推送或生成安装器。生产0020未应用，不得开始发送新字段。

- **固定1.45开发契约（实施前）：** architecture-integration，将bec0ce3中的可选目录接纳报告集中固定为1.45.0，补既有machine schema定义及可跨语言读取的正反向量；保留1.44包不变，根lock仅workspace版本同步。仅build、machine-control、compatibility、包内容和hash检查；随后交原Native任务消费固定包，实际汇总基于应覆盖会话而非截断诊断列表，能力未声明不发送。只源码适配／隔离测试，不生成安装器、部署或执行生产迁移。

- **目录接纳与管理入口集中源码审计：** 本批17文件包含系列／开发者草稿入口、最小接纳契约、0020本地迁移文件、心跳接收／家长读取和设备抽屉。Matched＝既有状态不被替代、新目录按账户单列、无报告不借用旧ACK、失效不标当前接纳、报告时间不称执行时间；devices/component、语法／diff、契约build/machine-control通过，复用未改动的knowledge及backend20项证据。agent-browser独立回环mock实际打开抽屉，1440×1000与390×844截图已目视；控件下拉／操作保留、文本换行正常，测试浏览器和夹具已关闭。Missing＝Native正式汇总上报、集中固定包、规则导入／范围、疑似强化迁移、控件获准复验及实机；Deviated／Extra＝无。本次准备集中本地提交，不推送、不发布或安装；1.44固定tgz保持不变，源码新增字段尚非已交付包。

- **设备账户新版目录状态（实施前）：** standard-cloud，仅共用设备展示模块和实际抽屉消费、对应专项及UI说明；沿用云端programInstancePolicy，不用旧policyState推断新目录接纳。各状态有明确文本，缺失／失效未确认，时间为云端接收时间；不声称动作成功、不更改账户分配操作。最小devices/component、语法／diff及agent-browser隔离桌面／手机目视；不修改Native、真实家庭或部署。

- **云端接纳状态本批验证结果：** 实际心跳→隔离D1→家长机器用户接口已接，`npx vitest run test/program-instances.test.ts` 20/20、runtime-api的platform neutral policy capabilities单项、backend typecheck及diff通过。覆盖目录更新、改绑拒绝、过期未知、其他家庭隔离、完整快照替换及损坏报告不阻断设备账户；另在Vitest隔离D1临时改名并恢复新表，证明无0020存储时不声明新能力、旧心跳成功、新报告返回明确503、状态读取为空。Matched＝本批云端源码与隔离接线；Missing＝Native实际上报、页面状态、集中固定包和真实联调；Deviated／Extra＝无。未安装、部署、执行生产迁移、改原账或启共享；不覆盖固定1.44包。系列／开发者界面及本批接线继续同主题集中提交，保留所有原未跟踪产物。

- **待完成问题集中登记（本次继续执行基线）：** ①目录接纳报告：云端接收／存储及读取源码已接，18项实例专项、能力ETag单项和typecheck通过；本批补机器用户真实读取、损坏诊断隔离和存储缺失验证，随后接页面。②Native实际报告、固定契约包及跨端消费尚待集中接线；本机Manager源码通过不代表已安装。③规则导入／安装范围入口、既有疑似强化规则迁移尚未完成。④控件新读取专项此前连续两次失败后的纠正重跑仍待单次授权，不擅自重跑。⑤集中Windows实机和Mac独立验收未完成；旧数据仅尽力而为。仅在上述条目取得实际证据后更新状态，不把自动化通过写成部署或实机通过。继续复用现有工作线，不新增分支／工作树，不安装部署、执行生产迁移或启用共享。

- **云端接纳报告持久化（实施前）：** standard-cloud，复用现有机器心跳及家长机器用户读取。新增本地additive 0020仅存每机器一份最新有界报告与接收时间，不建动作账；不应用生产迁移。存储未就绪不声明能力，旧心跳兼容；新报告按当前受保护用户分配校验，不相信客户端Child。页面读取按当前目录／分配／机器在线期限派生状态，保留最近报告但不能当当前接纳。仅对应隔离D1测试、backend类型及diff，Cloudflare／Worker技能审查，Native上报与UI仍待。

- **目录接纳契约本轮结果：** 已在既有app-runtime-control/machine-control测试中加入只读最小报告类型和严格解析，最多100个既有opaque用户引用、重复用户拒绝、分配正整数、accepted才允许非空目录版本、其他状态强制null、未知字段及动作／Child自报字段拒绝。build与machine-control专项通过；首次构建仅因沙箱不能写既有D盘dist未运行测试，限定权限重试通过。Native只读评估已确认现有心跳／用户上报不足及诊断64项截断风险，汇总必须取实际应覆盖会话分母。Matched＝开发契约与反例；Missing＝接收存储、正式上报、状态页面及实机；Extra＝无。未发新固定包、未改1.44 tgz，Native暂不消费未固定代码；Cloudflare/Worker技能核对了现有接收鉴权及D1存储边界，当前不声明新接收能力、不执行迁移或生产操作。

- **新版目录接纳状态（实施前）：** 两端只读核对发现现有心跳只保存机器级旧能力，WTS sessionActive不是Agent在线，旧policy-ack不是新目录接纳。Native支持／精确ACK已有本机数据但诊断截断不能作为全会话分母。本批architecture-integration先在既有machine-control契约固定最小按用户报告、严格字段与状态关系校验和反例；不上传动作日志、不加重复识别规则、不使用旧ACK。仅契约build／machine-control测试／diff，不打包发版、不改运行端或生产；随后集中接现有心跳及只读页面，存储结构与接收兼容另列实施，不用类型通过冒充链路完成。

- **系列／开发者入口与Native界面进展：** 已接既有family/developer创建及match/exclude草稿，不修改归属映射；固定1.44解析器／实际分类器核对哈希命中、缺旧证据unknown、弱名称自动规则拒绝及孩子隔离，knowledge/component、语法、diff通过。agent-browser隔离坏JSON保留→修正→保存7到8，另一孩子引用不变；1440／390截图已目视，高级条件独占一行，无手机横向溢出。Matched＝本入口；Missing＝导入／安装范围、新云端执行状态、疑似强化迁移、控件专项授权复验及集中实机；Extra／Deviated＝无。5文件保留待同主题集中提交，不逐入口发包。Native提交1e816e7f1ae016ba59b3e7c40a7c63a5f5bf47c8已本地核对5文件及Manager实际adminStatus接线，TRX实际14/14通过；只读界面缺口转为源码通过、未安装实机。推送／截图结论来自所属任务回报，未在本会话另验远端或重跑Native测试。

- **系列／开发者分类创建（实施前）：** standard-cloud，复用既有family/developer分类规则与match/exclude，不新增产品识别规则或字段别名。入口提示新版实例缺失的旧证据仍返回未知；自动规则安全仍由服务端契约裁决。允许填写现有JSON条件，坏格式保留输入，草稿只批准当前孩子；产品／类型规则行为保持。仅共用knowledge组件、专项及UI说明，验证固定契约解析和实际分类消费者、孩子隔离及隔离桌面／手机界面；不安装部署。

- **当前剩余项与本批提交审计：** 本批集中提交既有分类规则模式／平台／条件修订及对应测试、界面说明，共6文件；不推送、发布或安装。Matched＝草稿修订、当前孩子引用隔离、服务端语义校验、失败保留输入、桌面／手机隔离目视；Deviated／Extra＝无。剩余：①新系列／开发者分类规则创建、导入与安装范围入口；②Native Manager已存在未提交界面改动，但尚缺本任务聚焦验证和明确回报，已通知原会话继续；③控件新读取专项复验仍待单次重跑授权，不冒称通过；④新版云端执行能力／状态、疑似强化迁移及集中实机联调；⑤Mac独立验收。前两轮“尚未提交”的文字仅为阶段历史，以本批提交结果为准；旧账尽力而为，不扩展历史修复。

- **既有条件高级编辑结果：** match／exclude原格式可修订，格式失败保留文本不修改目录；条件和模式仍经服务端契约，新增字段别名被拒。真实解析器及分类消费者覆盖改哈希不命中、排除命中、其他孩子原规则不变、输入对象不可回写草稿；knowledge/component、语法、diff通过。agent-browser隔离页面输入坏JSON→错误提示且原输入保留→修正all为any及文件哈希→保存成功，回读两个孩子引用隔离，1440／390截图已目视。Matched＝既有规则高级编辑；Missing＝新系列／开发者规则创建、导入／范围与真实联调；Extra＝无生产操作。与上一轮模式／平台修改同批待集中提交。

- **既有条件高级编辑（实施前）：** 在既有规则的折叠条件区保留原条件只读展示，并追加现有match／exclude JSON草稿编辑，不发明字段别名或在浏览器执行表达式。格式错误不进入目录草稿，语义和自动规则安全由现有服务端契约校验；不把本地解析称为已验证。修订继续新ID及当前孩子引用，原模板／他人引用不变；保存忙碌时textarea也禁用。仅共用知识组件及专项／UI记录，knowledge/component、固定解析器／消费者、语法、diff及隔离桌面手机目视。新规则族创建／导入仍另列，不冒称全部规则管理完成。

- **既有分类规则维护结果：** 模式／平台／结果修订已接同一集中保存；原条件只读保留，新ID只替换当前孩子引用。knowledge/component、语法及diff通过；固定1.44解析器拒绝名称弱规则升级automatic，真实分类器验证suggestion／平台过滤与两个孩子隔离。agent-browser本机夹具将Windows自动规则修为macOS建议后保存，回读当前孩子新引用、另一孩子原引用；桌面1440／手机390已截图目视。Matched＝该维护入口；Missing＝复杂条件和导入、实机；Extra＝无。4文件尚未提交，待后续同批集中提交。Native Manager只读诊断UI已交原所属会话继续，不新增契约或安装。

- **既有分类规则维护（实施前）：** 已确认批准／停用包含停用模板复制启用的既有逻辑，不能误报缺失；实际缺口是新版入口不能修订自动／建议及平台。只接这两个已有字段，仍复制新规则并只换当前孩子引用，原证据条件／排除和其他孩子保持；自动升级继续由固定契约安全校验，不能绕过。knowledge/component、真实解析及消费者、语法／diff与隔离目视；本轮不接复杂条件编辑、不改产品匹配或生产。

- **产品资料本批集中审计：** Matched＝既有type、catalogGroup编辑／清除／保留，孩子明确分类独立及规则继承，服务端目录保存后主列表按单一catalogGroup归组；特殊应用不按名称判定，普通other不自动排除。knowledge/component、语法及diff通过，实际1.44解析器和分类消费者接新增草稿；agent-browser独立本地夹具保存7→8后特殊目录1项、跟随规则1项，无重复，1440px／390px截图已目视。Missing＝复杂证据条件、导入与安装范围、新云端执行状态及两端实机；Deviated／Extra＝无。集中提交本轮及前两轮4文件，不部署安装、不将目录保存称统计更新已验收；原未跟踪包及.wrangler保留。

- **特殊应用入口补齐（实施前）：** standard-cloud，产品资料接既有catalogGroup唯一字段，普通／specialApplication可切换；不新增isChrome、浏览器名推断或单独布尔属性，不自动更改孩子classification。提示该家庭共用属性影响产品统计投影／电脑汇总，不代表本次已启共享；与other严格分开。仅共用knowledge组件、专项、现有UI记录；固定契约解析、component、语法、diff及agent-browser本地隔离验证保存后特殊目录刷新，集中收口此前未提交的同批类型编辑和分类补验。

- **客观类型编辑结果：** 既有product.type已接产品资料表单及集中保存，允许未知、拒绝非法值；真实1.44解析器／分类消费者验证类型变化取消旧类型规则命中，孩子明确分类独立优先，其他孩子binding及归属规则不变。knowledge/component专项、语法与diff通过；agent-browser隔离实际编辑产品q为game→保存7至8→回读类型和两个孩子绑定，1440px／390px截图已目视，手机宽390。浏览器首次沙箱进程退出，经doctor定位执行环境后在独立本机allowlist会话完成，未使用用户Profile／生产。Matched＝本批类型管理；Missing＝复杂条件编辑、完整导入／目录范围和真实联调；Extra＝无。本轮与前轮补验暂存为未提交修改，待同批集中提交。

- **客观产品类型编辑（实施前）：** standard-cloud，只补集中schema4产品资料的既有type字段编辑，不新增类型表或冗余标记。类型属于家庭共用产品资料、可影响已批准类型分类规则；孩子明确分类独立且优先。保持productId、归属规则、其他孩子绑定及原账不变，未知允许保留。修改knowledge组件／专项、UI说明；仅相关node测试、语法、diff与agent-browser隔离桌面／手机目视，不安装部署。

- **本批核对结果：** Native本地HEAD已为`6755e3b8fdb44ab22c37765472216db0f0ae23b8`，9文件集中提交可读；推送状态为所属任务回报，本会话未重新联网核验。已直接检查正式Agent回报、Service认证接收／status、动作结果与版本关联及隔离断言。Matched＝本机内部诊断源码；Missing＝Manager界面、云端新能力／状态、疑似强化迁移及实机进程验收。云端knowledge补验通过真实1.44解析／分类消费者验证两个孩子共享模板后独立修订和停用，取消明确配置恢复规则继承；原归属规则及实例映射未改。首轮夹具遗漏另一孩子已有明确study，正确触发显式优先而失败；仅让该测试孩子先选择跟随规则后通过，未改产品代码或分类语义。无新协议、生产操作或安装。本轮测试与记录保留待集中提交，不单独发包。

- **本批核对与补验（实施前）：** 回读Native本地提交`6755e3b8fdb44ab22c37765472216db0f0ae23b8`及正式Service/Agent/执行器调用，确认结果取实际执行快照、退出证据与认证用户，日志不上传；21项隔离结果复用，不重跑本机测试，不把推送回报当作安装验收。云端本轮仅补既有knowledge专项：分类规则修订／停用经固定契约解析器及实际分类器，分别核对两个孩子、取消明确分类后继承及归属表不变；无产品代码、UI或协议变更。只运行该专项和diff。

- **新分类规则创建接线（实施前）：** 复用schema4已有ClassificationRule，不新增规则格式：明确产品ID规则或已有客观产品类型规则、平台、自动／建议、分类与解释；新规则仅批准给当前孩子，其他孩子保留。产品ID来自集中目录，不接受显示名称作为归属条件；type=unknown不得建类型规则。复杂旧证据表达式仍只保留，不做别名转换。只改共用知识组件及专项／现有文档；增加真实固定契约解析与分类消费者验证，随后隔离目视，集中提交前两轮源码。

- **分类规则本批集中结果：** 新建产品／类型规则、既有规则分类修订与当前孩子批准／停用源码完成，使用原集中目录保存；真实1.44解析器和分类消费者验证产品／类型、平台过滤、建议不自动采用、明确分类优先及孩子隔离，knowledge/component专项、语法和diff通过。agent-browser隔离实际创建产品q→study自动规则，保存7→8，当前孩子增加新引用、另一孩子仍仅原引用；1440px／390px截图已目视、手机宽390。Matched＝本批管理操作；Missing＝复杂证据条件编辑、安装范围筛选、两端真实联调及后续表中缺口；Extra＝无生产操作。Native最新21项真实dotnet输出和net8构建已回读，源码只读诊断区别接纳／动作；本机状态UI、云端能力及实机动作仍未完成，未以隔离回调证明真实进程退出。

- **分类规则管理接线（实施前）：** 当前schema4沿用既有rules与孩子ruleIds，但旧编辑器依赖旧安装证据及旧预览接口。standard-cloud本批在集中草稿接既有规则只读条件、当前孩子批准／停用、分类结果修订；修订复制新规则ID并只替换当前孩子引用，保留原条件／排除及其他孩子引用。新条件表达式编辑继续Missing，不生成证据别名，不在页面匹配。复用集中PUT、knowledge/component专项、语法、diff及隔离目视；不改协议、原账、生产或终端。

- **分类规则接线阶段结果：** 新目录分类入口已进入集中草稿，支持既有规则查看、当前孩子批准／停用、分类结果修订。knowledge/component专项及语法、diff通过；隔离浏览器从实际入口将study修订为other，保存版本7→8，回读当前孩子引用新规则、另一孩子仍引用原study规则，归属规则未变。1440px／390px截图已目视，手机宽390；首次按钮被footer遮挡，滚入可见区域后正常点击保存，未使用脚本强制点击。源码尚未集中提交；复杂条件新建／编辑及真实终端采用仍Missing，不能称分类规则全功能完成。Native内部诊断仍在原活跃任务实施，无生产操作。

#### 集中遗留清单与执行顺序（2026-10-09，PO要求先登记后执行）

本批结果：新版管理主入口与产品资料编辑已完成源码／聚焦验证。成功保存直接使用已校验的服务端目录刷新同孩子主列表，不调用旧消费者；迟到孩子响应／组件销毁回归通过。knowledge与component专项、两个JS语法及diff通过；agent-browser独立本机夹具实际改名→保存→关闭后主列表新名称可见，1440px／390px最终截图已目视，手机页面宽390。旧盘点范围明确禁用，分类表达式编辑仍未适配。Matched＝本批目录主入口、编辑及刷新；Missing＝表中未完成消费者／完整配置／实机；Extra＝无生产操作。仅源码证据，未部署安装。

| 待完成项 | 当前证据／影响 | 处置顺序与完成依据 |
|---|---|---|
| 新目录管理主入口 | schema4读取及产品编辑源码、专项与隔离目视已通过 | 本批集中提交；生产及真实数据验收仍待 |
| 保存后主列表刷新 | 已接同孩子服务端保存响应，专项及浏览器改名实测通过 | 源码完成；真实云端保存和终端联调尚未执行 |
| 旧分类表达式及完整产品配置入口 | 旧编辑器不能直接消费新实例证据，当前明确禁用 | 单列后续适配；不得字段改名猜转换，也不得宣称管理功能全部完成 |
| Native执行状态与精确动作记录 | 内部诊断已集中提交6755e3b，正式调用及21项隔离证据已核对；尚未安装 | 继续Manager界面及集中云端能力语义；真实权限／生命周期／动作单列，ACK不冒充成功 |
| 强化封锁旧规则迁移 | 尚未证明新实例执行覆盖既有强化设置 | 保留未完成，不默认迁移或新增封锁范围 |
| 控件新读取专项复验 | 两次失败后已修夹具，一次补跑仍待明确批准 | 其他工作继续；未补跑不得称新消费者通过或交付候选 |
| 集成、发布及真实联调 | 新契约与部分云端源码已提交，本批尚未部署／安装 | 集中源码收口后核对唯一候选及发布依赖，不重复发中间安装包 |
| Mac、历史身份归集 | Mac实机未验证；旧账仅尽力而为 | 单列、不猜配、不恢复已退出旧账，不阻塞当前新账源码推进 |

当前实施档案standard-cloud：只改现有云端共用管理组件、对应测试及任务文档；最小验证为knowledge/component专项、语法、diff和隔离页面目视。无新分支／工作树、生产请求、安装、部署或migration。

#### 本轮待完成项（先登记再实施）

- **新版管理主入口接线（实施前）：** 旧目录明确返回READER_NOT_ADAPTED时读取集中schema4目录，不把新产品塞进旧runtimeIdentity结构。保留分类导航、搜索和平台筛选，产品按稳定ID唯一列出；明确分类与“跟随规则”分开，未有实例不能说已安装，规则平台不冒充实机覆盖。确定性应用列表改打开同一新版目录编辑；旧分类规则编辑未适配时明确禁用，不猜转换。只改云端共用组件／既有测试文档，不改分类语义或生产状态；knowledge/component专项、语法、diff与隔离目视。

- **产品资料编辑源码通过：** 新版目录草稿可修改产品名称和当前孩子明确分类／跟随规则，仍通过同一PUT保存；不改productId、归属规则或其他孩子binding。knowledge／component专项、语法、diff通过，agent-browser本地夹具实际改名→other→保存通过；1440px／390px截图已目视，手机宽390，无生产请求。尚未集中提交；旧主目录与完整产品配置适配仍Missing，不以草稿编辑完成冒称整体管理通过。Native本机执行诊断／精确结果DTO边界已在docs/DESIGN固定并交原任务，云端新能力及跨仓读接口未自行添加。

- **保存后实际管理缺口：** 已查`app-runtime.js/loadManagementState`及knowledge.load仍请求旧app-catalog／application-knowledge；后者对schema4明确409，旧产品分类入口被禁用。规则保存成功不能视为应用管理已贯通。先在现有新版目录草稿补产品名称、当前孩子明确分类（或跟随规则）的编辑，复用集中PUT及原版本保护，不新增权威配置或手改映射；旧主目录整体适配仍待，不能用新增草稿区冒充已完成。standard-cloud仅knowledge组件、对应专项及现有文档；node专项、语法、diff及隔离目视，无生产操作。

- **页面保存接线实施前：** standard-cloud，既有app-runtime-knowledge组件及专项测试；两套云端共用组件追加保存／重新读取和分离状态，不修改扩展。覆盖成功、重复点击、版本冲突、草稿保留、孩子切换及迟到响应；node知识组件／管理组件专项、语法与diff，另用agent-browser技能完成隔离桌面／手机目视。不访问生产、不运行无关全量测试。Native已回报集中提交dd071c2，源码与实机仍分开，疑似强化迁移及完整能力／审计缺口继续Missing。

| 问题 | 当前影响 | 本轮处置 |
|---|---|---|
| 规则目录保存入口 | 本轮源码已接通，17项隔离测试通过；未部署 | 已复用家长鉴权PUT、条件更新及审计；保存只确认目录，不冒充终端执行 |
| 管理页面保存及生效状态 | 本轮共用组件已接源码及隔离目视，未部署 | 可保存／重新读取；分别显示目录保存、映射待重建、终端执行未确认，不把状态混同 |
| 控件新身份读取专项未完成复验 | 新读取模型尚不能交付 | 修正后的专项补跑仍待批准，其余独立工作继续 |
| Native新执行仅有隔离证据 | 不能宣称当前安装版本已生效 | 源码集中收口后统一候选与实机核验，不反复安装 |
| Mac及历史归集缺口 | 平台实机与部分旧身份未验证 | Mac单列；旧账尽力而为，不阻塞当前新账链路、不猜补归属 |

本轮职责standard-cloud；允许现有Runtime后端路由／实例测试与设计任务记录，必要测试为该文件、typecheck和diff。无新分支、工作树、生产保存、部署、安装或migration。

- **页面接线结果：** 知识组件新增条件PUT、重复提交／编辑保护、失败保留草稿、迟到孩子结果丢弃和保存后独立状态；两套云端使用同一canonical组件。knowledge和component专项、node语法、diff通过。agent-browser独立本地内存夹具完成保存及1440px桌面／390px手机截图目视，手机scrollWidth=390；截图保存在受限本地Temp的identity-save-desktop.png、identity-save-mobile.png及identity-save-mobile-actions.png，不入Git。无真实家庭请求。旧目录仍明确不猜转换，完整新版产品管理与终端状态联调继续待验；保存成功不等于执行通过。

- **本轮执行结果：** `PUT /v2/module/program-instance-catalog`已接入现有保存事务，返回服务端目录版本／ETag和`mappingState: pending`，沿现有恢复任务重建。17项实例专项与backend typecheck通过；新增真实路由验证未登录、缺If-Match、跨孩子、手写映射、未经授权强化封锁拒绝；保存／重放冲突／撤销与审计、pending→confirmed／unresolved通过。首轮新夹具缺少必填blocked分类被正确拒绝，补齐夹具后通过，未放宽校验。Matched＝本轮后端保存接线；Missing＝页面保存操作、集中端到端实机和Mac；Extra＝无生产操作。控件待批准补验独立保留，不以本轮测试替代。

#### 最新执行状态（2026-10-09，覆盖下方“准备提交”等旧时点）

- **规则正式保存源码接线（实施前，未部署）：** Native受影响221项及正式Agent接收循环已回读通过；源码消费者前置已有证据，继续standard-cloud现有catalog路由PUT，复用家长鉴权／If-Match／唯一版本审计和内部保存函数。成功仅表示目录已保存、映射待重建，不冒称执行ACK；沿现有cron恢复映射。只改既有路由、相关测试和文档，不执行生产保存或migration；单文件实例测试、backend typecheck、diff。控件新专项待批准不影响此独立云端接线。

- **两端本批新增证据（尚未整体交付）：** 已回读Native实际dotnet输出，ProgramInstancePolicy／ServiceApplicationBinding／WindowsProgramObservationPipeline／FormalSessionReminderMessage四组过滤43项通过；其后新增切换保护检查仍在执行，不能把43项当最终全部通过。控件local-guardian运输层修订后通过；Playwright备用隔离夹具已产1440px桌面及390px手机截图，当前会话已目视新基础实例／产品两区、未知保留及不相加说明，手机表格为内部宽表，页面宽390。此证据只覆盖新增区块，不代表完整Admin真实连接／数据来源验收；新读取专项一次补跑批准仍待。

- **控件回报（尚未完成）：** 四处身份读取夹具已修正；local-guardian真实契约注入后通过，旧应用读取／Admin渲染、typecheck、extension-root、语法及diff通过。新专项受同命令两次失败停止规则限制，修正后尚未执行，已向用户集中申请一次复验；不算通过。运输层新请求专项与Admin隔离目视仍缺，已交所属任务继续，不让单条复验批准阻断其他工作；未提交、打包、发布。

- **Native执行接线审查续项：** 只读确认最新代码已从当前分配全部缓存取MAX catalog，再筛同版confirmed，前述旧目录选择问题源码已修、测试回报待。另交所属任务集中核对Agent收到分配变更立即撤销旧决定／拒绝旧assignment，以及Coordinator每秒持原账stateGate读最多1000条并写pipe的开销；按现有有界节奏处理，不引入实时强一致或额外身份体系。尚未验收，不把草稿变化作为运行已修。

- **分类上下文实际接线补验（实施前）：** standard-cloud，在同一实例测试文件将真实机器鉴权projection-context响应交固定契约解析与分类消费者，验证显式blocked、改为other、取消显式后旧排除证据缺失为unknown；不只验证空rules响应。仅相关单文件、typecheck、diff，无产品源码变更，不重跑页面或安装器。
- **分类上下文补验通过：** 实际路由返回的非空rules／binding经固定解析器进入分类函数，blocked→other更新正确；取消显式配置后缺旧排除证据返回unknown而非blocked。目录版本依次1/2/3。16项实例测试及backend typecheck通过；这是云端到共同消费者的隔离接线证据，Native实际动作和实机仍未验收。

- **新执行消费者只读审查发现实际边界（待Native修正）：** 当前未提交ProgramInstancePolicyBuilder先过滤confirmed，再从该子集取最高catalog；新版本只有pending／unresolved／conflict时可能继续选择旧版本blocked。已交Native按当前分配全部已知上下文确定目录版本，再选择同版可执行决定，并补旧v1封锁→新v2未识别的实际Store回归。不得靠增加TTL或重新猜配解决；当前只是未发布源码，未影响运行服务。规则正式保存仍未开放。

- **规则复用真实存储链补验（实施前）：** standard-cloud，仅现有program-instances.test.ts；同家庭两孩子／两机器登记相同文件内容的不同实例，使用同一规则分别生成映射，经规则改向、冲突、撤销再生成。核对机器鉴权读取及证据内容保持不变、跨孩子拒绝；不直接修改第三层，不开放HTTP保存。运行该文件、backend typecheck、diff，不跑全量或生产操作。Cloudflare／Worker技能用于现有D1事务与绑定审查；在线参考获取暂失败，使用已安装workers-types 4.20260702.1的D1 batch定义，不新增平台API。
- **本轮补验结果：** 15项program-instances测试及backend typecheck通过。新增实际D1／机器鉴权读取验证同规则跨孩子生成不同实例映射，P→Q改向、双规则冲突、撤销均先pending再重建；两孩子分别正确，证据逐值不变，跨孩子请求403。首次运行因D盘Vite临时文件写权限未启动，限定权限重试通过，不是用例失败。未开放规则HTTP保存、未改变产品源码或生产状态；Matched为此隔离链，正式执行和实机仍Missing。

| 待完成事项 | 已有结果／当前问题 | 接下来执行 |
|---|---|---|
| Native分类消费者 | 1.44固定契约已交付；Native正在接实际Projector，尚未回报通过 | 修复四个已复现缺证据／占位身份反例，复用共同向量；基础统计不受影响 |
| 控件新读取与页面 | 已有未提交实现，专项测试两次失败，尚非可交付 | 先只读定位夹具与固定契约差异，再由控件所属任务修正和验证，不放宽协议校验 |
| 新身份执行消费者 | 现有docs/DESIGN.md已固定本机快照／ACK，但Native尚未接线 | 明确该消息为Native内部认证管道协议，不是Host共享包接口；按既有设计实施隔离验证 |
| 规则正式保存与生效 | 只有读取／草稿／预览，HTTP保存未开放 | 在执行消费者与兼容边界完成后集中接通，不用预览冒充生效 |
| 集中实机／Mac | 本轮没有安装、部署、生产migration或新执行验收 | 源码集中收口后另列最终候选与联调；Mac单列，历史尽力而为 |

云端源码已集中提交`0b3764dc718c92c3bff9998cdcbb32d9c54c89ae`，不再列为未提交；固定契约提交`abbbc5a95bac1578205feb33ec96c88046961b05`。这两个提交不等于生产发布。当前只更新既有任务记录、只读核验真实消费者并交所属任务继续；文档检查为git diff --check，不重跑未变云端代码测试。

- **控件专项失败已定位到具体夹具：** `application-identity-usage-read-model.test.js`产品applicationUsage使用旧Ms字段，但固定1.43解析要求秒字段；多日dailySeconds每日至3600而行总量固定3600；产品分页key重复；contextOnly统一拦截使legacy毫秒上下文分支不可达。已交所属控件任务按真实契约修正并复验，不放宽解析器、不由当前会话编辑扩展。本结论不是实际消费者通过证明。
- **Native执行消息边界已回传：** 复用docs/DESIGN.md现有本机认证pipe快照／ACK方案，属于Native内部协议，不要求在1.44 Host共享包寻找DTO；不复制产品matcher。未知／失效结果不新增封锁，沿用现有时效依据，不自创更严格TTL。分类修复与执行隔离验证继续，实际服务／政策不变；疑似强化执行迁移仍待处理。

- **云端源码集中提交准备：** standard-cloud，收口现有程序实例登记／映射、schema3基础统计和独立产品投影接收、同源读取及两套云端页面。只提交已有同主题源码／隔离测试／本地migration文件及设计，不应用migration，不开放规则HTTP保存，不部署。测试例外仅`tests/unit/computer-usage-cloud.test.js`（Guardian/Runtime读取边界）。复用已完成桌面／手机目视，运行直接相关实例／应用账户／电脑证据测试、既有页面组件测试、两侧typecheck和diff；保留Native执行、控件接入和正式联调Missing，不把该提交称最终交付。
- **集中源码审计：** Matched＝实例证据鉴权持久化／映射、基础和产品分别上传读取、两套页面与失败隔离、只读规则草稿；Deviated＝无已知未批准变更；Missing＝规则正式保存／新执行消费者／两端实机／Mac；Extra＝无安装部署。3个直接相关Worker文件57项、内存SQLite约束、Guardian读取、页面component／knowledge／time／renderer、根及backend类型检查、diff通过；复用相同页面源码已完成的隔离桌面／手机目视。不以此认定全部功能完成或可发布。Cloudflare及Worker技能用于绑定、读模型和隔离验证审查。

- **分类未知云端实际链补验（实施前）：** standard-cloud，仅既有application-accounts隔离测试：同一已发布30秒基础清单上传分类unknown新版，再上传已修正产品投影；核对ACK、展示仍保留30秒、产品原因／完整性变化、完整revision变化而基础引用不变。Cloudflare技能用于现有D1绑定与隔离环境核对；只跑该文件/typecheck/diff，不访问生产、不执行迁移或扩大到旧账。
- **分类未知云端实际接口补验通过：** 机器鉴权PUT接收修订5及精确ACK，家长鉴权display读取基础complete=true／30秒，产品完整性false并保留APPLICATION_CLASSIFICATION_EVIDENCE_UNAVAILABLE，不输出虚假可用的applicationUsage；修订6恢复产品完整性，两次基础读取逐值不变，展示完整revision分别改变。application-accounts 28项、backend typecheck及diff通过。此为隔离Worker真实路由／D1存储证据，不是生产或Native安装验收；未改云端产品逻辑，Cloudflare技能用于保持既有绑定和隔离测试边界。

- **1.44开发契约已固定交Native：** 提交abbbc5a95bac1578205feb33ec96c88046961b05，8文件architecture-integration范围检查通过；build、classification和compatibility通过。包171543字节／91项逐一与源码及dist相符，SHA256 52333a21db1c4fa73c4da583f455b21b37a9e1bf3cd0f489152c118f48025f5c；1.43原包hash未变。已向原Native任务交精确包和源码SHA，要求按lock接实际分类及既定执行衔接；未推送、安装或部署，云端大批次未提交改动保留。

- **固定分类修复开发包（实施前）：** Native要求按仓库边界消费固定包，不能跨仓引用未固定源码。集中固定1.44.0，消息／schema不变，只新增新实例分类纯函数与共同条件向量；根lock仅workspace版本同步例外。保留1.43包，不生成安装器、不部署。契约build、classification、compatibility及包内容／哈希核对后，仅提交契约与对应决策；云端未提交批次原地保留。

- **分类消费缺陷已确认，开始共同修复：** Native实际Projector四个隔离反例证实缺排除字段仍生成complete=true分类，以及占位runtimeIdentity误排除。本轮architecture-integration在现有分类契约新增新实例专用三值判定和已确认映射分类入口，保留旧匹配器；显式分类优先、未知不猜配、按原优先级、基础统计独立。仅build／classification共同回归／diff，不覆盖固定1.43包、不安装部署；Native后续接同一语义与向量，不直接修改其源码。
- **共同分类修复源码通过：** 新实例独立判定入口已实现；九个跨端条件向量先通过真实证据解析，再检查unknown／all／any。实际分类入口覆盖四种缺排除字段、显式绑定、确定排除、确定正条件不匹配、优先级、冲突、类型、建议不自动采用、未识别及跨孩子拒绝。契约build、26组旧向量和新增断言、diff通过；1.43固定包SHA仍为6f72640c90fc3ded41ca79b5b1b0b9dc5341dfc6d7c7ff544606a6c747564a65，未覆盖。已将精确语义和源码路径交Native接Projector；尚未固定下一契约包／证明本机修复或安装。控件最新进度已返回串行读取与Admin只读视图实现，不再把旧托管候选当本次交付。

- **分类适配最小反例已复现（非实机）：** 对当前已编译契约matches传入Native相同的包装形状：只有windowsFileSeriesKey时，旧fileSeriesKey排除条件返回false，取反后允许通过；占位runtimeIdentity="instance"会命中同值排除条件。此证据仅证明字段缺失／占位值的匹配行为，尚未证明生产配置存在该条件。已交Native从实际产品投影入口复现并列最小修复；不能用字段别名或修改正确规则消除问题。分类消费仍Missing，基础统计不受本次只读调查影响。
- **协作范围校正：** 控件活跃任务转向旧1.7.45签名包与托管检查，已发送明确纠偏：没有新的人类发布指令时继续1.43读取／页面源码，不打包托管、不覆盖旧候选。当前只确认纠偏消息送达，不能声称控件已完成或已纠正方向。Native恢复／缓存任务仍活跃，新的分类反例核验也已成功交接。

- **分类消费断点登记（尚未修复）：** 新归属证据使用windowsAumid／windowsFileSeriesKey／macosSignerKey／macosSigningIdentifier，现有分类表达式仍使用packageId／fileSeriesKey／signerKey等旧字段；不能仅因名称相近自动转换。Native产品统计当前可用显式产品分类、产品类型和binaryHash，旧条件／排除条件的缺证据处理尚需逐项核验；基础统计不因此失效。当前仅核对和补隔离回归，不擅自改变分类语义、不将旧字段假装为新能力。
- **本批执行清单：** architecture-integration，仅现有classification.test.mjs及任务板：验证跨孩子复用规则而映射隔离、规则修订／撤销／冲突可重新生成映射、缺证据保留未识别，且不修改输入与上一版结果；运行契约build、classification聚焦与diff。不更新已固定1.43包、不发中间候选。Native继续持久观测恢复与哈希缓存，控件继续新读取消费者；规则保存／执行、集中联调和Mac仍未完成。
- **本批结果：** 契约build、classification既有26组向量及新增映射生命周期／旧证据拒收断言、diff检查通过。首次build被工作树dist写权限拒绝，限定权限重试后通过，无源码编译错误。新测试证明规则改向、撤销、冲突和新内容不污染上一版映射，不能据此称Native分类消费者已对齐。Native最新回报九项恢复／缓存隔离通过，控件消费者仍在实现；均尚无本轮安装或实机证据。Matched＝登记与规则映射聚焦回归；Missing＝分类消费断点核验、执行保存、两端集中联调；Extra＝无。

- **电脑汇总已接新应用来源（源码）：** Runtime展示读取返回同版产品投影已有的applicationUsage；Guardian秒汇总改读getApplicationIdentityUsage并核对孩子、日期、单位、模型，采用完整产品revision。聚焦证明网页3＋应用15－特殊贡献5＝13，产品缺失仍显示应用15／网页3而总量与扣除未知，产品单独换版使汇总revision改变，错误孩子响应拒用。application-accounts 28项、computer-usage-cloud、两侧typecheck和diff通过。Cloudflare／Worker技能用于既有内部绑定与读模型审查；无新凭据、原账重算、迁移或生产操作。当前仅源码接通，真实上传／页面汇总联合验收待集中执行。

- **电脑汇总同源修订（实施前）：** standard-cloud；已查汇总秒入口仍调用旧getApplicationUsage，而新展示读取未返回既有applicationUsage。将独立产品投影中已经生成的非特殊总量／分类和特殊贡献按来源累计，产品缺项则applicationUsage未知、基础仍保留；Guardian汇总改用同一新身份读取及其完整修订，不从产品明细相加、不读原账或改网页读取。只补application-accounts及computer-usage-cloud聚焦测试、两侧typecheck和diff；不改契约包、生产配置或共享核算。

- **独立Runtime失败保留已修复：** 相同完整请求键刷新不清空上次成功统计，失败保留并明示截止／非最新状态；切到其他日期无结果时仍显示未知。component、time 10项、JS语法检查通过；隔离agent-browser实际读出1分后中断新接口，刷新仍1分且明确“保留上次有效统计”，切上一日后显示“—”及重试，不继承旧量。截图`identity-refresh-preserved.png`仅本地Temp并已目视，专用浏览器及夹具已关闭。没有修改统计或原账；此为隔离源码验证，未发布。上一条读取隔离不能覆盖此问题，现另列已修复证据。

- **独立Runtime刷新失败保留修复（实施前）：** 实查`loadUsage`每次清空usage、renderUsage遇error即全页不可用，未达到同范围失败保留要求；上一轮只证明迟到隔离，不证明此项。按完整请求键（孩子、日期、机器、用户、平台）保留上次成功结果，刷新及失败显示状态；不同键仍清空，不复用他人统计。仅控制器及既有回归／隔离夹具；component测试、JS语法、agent-browser本地无凭据目视及diff。控件新接口适配已交TimeOnChrome-Extension，Native恢复工作仍活跃。本轮不改原账、产品规则或部署。

- **读取切换隔离已补验：** Runtime真实`loadUsage`函数验证孩子／日期变更后的迟到成功不能覆盖当前结果，切到网页后旧认证错误不会弹登录；主控制台共用读取器验证迟到成功／失败丢弃、同范围刷新失败保留有效统计、换范围不得沿用旧统计。component及computer-usage-view测试、`git diff --check`通过。本轮仅两个既有测试文件和任务板改动，不需要重跑未变UI的目视或发布。Matched＝上述读取隔离；Missing＝正式上传／安装后联调、执行与控件适配；未新增产品行为。

- **读取切换隔离补验（实施前）：** standard-cloud，仅补现有页面测试；执行Runtime实际`loadUsage`函数与主控制台共用独立读取器，覆盖孩子／日期／页签切换、旧成功及旧错误迟到、当前刷新失败保留同范围有效值。复用既有桌面／移动目视，不新增浏览器行为，不改产品代码。Native另在原会话处理持久观测恢复和有界文件缓存；规则保存／执行、控件读取及集中实机仍未完成。只运行component、computer-usage-view与diff检查，不测试旧账还原、不安装部署。

- **两套应用页隔离浏览器验证：** agent-browser独立session仅允许127.0.0.1，真实页面点击已核对Runtime发出`program-instance-usage?view=display`、主控制台发出`model=program-instance-v1`；60秒基础及Word产品显示正确，产品缺失时基础仍60秒，两个各60秒实例未被重复加总。桌面与390px手机截图已目视；首次展开Runtime长实例ID出现565px溢出，补局部换行后body宽回到390。截图保存在本地Temp的identity-runtime-*／identity-main-*，无生产凭据。此为隔离页面证据，不是生产／Native实机通过。time／renderer回归及diff通过；日期切换竞态、正式上传及规则保存／执行仍待。

- **主控制台应用页源码接通：** 主页面已请求新模型，两个`computer-usage-view.js`副本一致；新增基础实例折叠展示与产品不完整提示，60秒基础／两个各60秒实例不误加总，输出转义回归通过。computer-usage-view、根typecheck及diff通过。隔离目视夹具已检查但尚未运行本轮新场景，不能宣称页面实测通过；既有fixture仍返回旧应用数据，需要补新模型后验证。Native已回报集中源码推送`66962adba1e051978f68af19af05d70c2b7521e7`，本任务尚未独立核验远端，不作为安装／实机完成证据。

- **主控制台页面消费（实施前）：** 应用页请求显式新模型，通用只读渲染器保留基础秒数、产品状态和基础实例折叠明细；两个渲染器副本同步，网页／媒体路径不变。聚焦computer-usage-view与现有类型检查；实际目视仍需单独验证，不把字符串回归当目视。

- **Runtime应用页源码已切换：** 现改读`program-instance-usage?view=display`，去除该入口旧毫秒回退；新适配器仅格式化云端秒数，保留基础实例及独立产品状态。产品缺失不再显示“暂无记录”，缺统计也不推断无原账。time 10项、既有组件回归与JS语法检查通过；实际加载请求／迟到响应、桌面手机目视仍待补，未提交。Native最新回报1.43实际产品上传隔离通过，正在集中提交；其重启观测恢复、分类证据语义与实机缺口仍保留，不能因183项测试通过称全部完成。

- **Runtime应用页消费（实施前）：** 新展示读取替换该页旧app-usage及毫秒回退；仅做字段格式化，不重新识别或加总实例。产品未就绪时总量、小时和基础实例仍展示，分类区域明确待更新。保留现有日周及来源筛选；新增基础实例折叠明细。先跑time／组件聚焦，提交前再完成隔离目视；不修改控件或生产。

- **Guardian新应用读取转发通过：** `computer-usage/v1?source=application&durationUnit=seconds&model=program-instance-v1`已接同一个Runtime身份展示读取；fetch与RPC路径均有回归。无登录、跨家庭、错误模型、网页／媒体误用在调用Runtime前拒绝；未部署新能力时明确不可用，不静默回退旧产品统计。computer-usage-cloud及根typecheck通过。旧模式、网页原统计未改；两套页面实际切换和目视核对仍待，不将转发通过写成页面完成。

- **主控制台读取转发（实施前）：** standard-cloud；Guardian应用独立读取新增显式`model=program-instance-v1`模式，仅接受应用来源及整数秒，将已鉴权孩子范围转发既有Runtime受限入口。旧请求及网页／媒体分支保持原样，不做浏览器产品识别或原账重算。聚焦computer-usage-cloud及typecheck，页面切换另需实际组件验证；不部署。

- **统一展示读取隔离验证通过：** 新`readApplicationIdentityUsage`由module的`view=display`与受限Service Binding共用，读取持久化基础统计和独立产品投影；产品目录损坏时仍返回基础30秒及实例明细，不回退旧产品结果。实际鉴权HTTP及跨家庭拒绝已覆盖，backend typecheck和application-accounts／computer-usage-evidence共43项通过。此步仅证明云端读取接线，两个页面尚未切换，真实Native上传及实机仍待；不把接口测试称为完整交付。后续继续页面消费与产品名称／重叠来源用例，不安装、不部署。

- **云端页面共用读取投影（实施前）：** standard-cloud；在现有独立产品投影模块集中组合已发布基础统计与同版产品视图，输出基础总量／小时、实例明细、产品分类及各自完整性。只累计不同来源的已物化行，不按实例明细重算产品并集；名称只从对应目录读取。产品缺失／过期／目录失败保留基础时长和实例明细，不回退旧账。module入口与受限Service Binding复用该函数；后续两页面消费同一结果。聚焦已有application-accounts与computer-usage-evidence测试、typecheck；不改网页、原账、配额或生产状态。

- **1.43固定包已交接：** 契约提交`25efeed983109809497a9d93450b92612d983ab5`，8文件职责检查通过，root lock仅版本同步。包169440字节、91项逐条与源码／dist一致，SHA-256`6f72640c90fc3ded41ca79b5b1b0b9dc5341dfc6d7c7ff544606a6c747564a65`；1.42原hash未变。Native当前活跃并已开始锁包和真实产品上传实现。未推送、部署、安装；云端实现批次仍未提交。
- **两套统计页面消费断点已实查：** Runtime的`app-runtime.js/loadUsage`仍读取`/v2/module/app-usage`并有旧毫秒回退；主控制台`pages/index.html/cloudApplicationReader`读取Guardian的`computer-usage/v1?source=application`，不是新实例接口。新`program-instance-usage`已有基础／身份／产品分离响应，但不能因此称页面已切换。下一步先统一云端读取投影再接两个页面，基础未知不冒充零，产品未就绪不丢基础时长，不能在浏览器将重叠实例机械相加成产品时长。

- **产品上传接收验证通过：** 后端28项application-accounts聚焦回归及typecheck通过，覆盖真实鉴权PUT→共同ACK校验、重放／冲突／更正、基础来源保持、缺产品表／不可变约束／schema3触发器不声明新能力；未就绪PUT返回503而非误确认。首轮测试夹具误拦另一sqlite_master查询，限定为被测schema查询后通过，生产校验未放宽。契约build、usage-account与compatibility通过；本轮只读Cloudflare／Worker技能审查，无生产访问。接下来固定1.43包供Native实际上传；整体Missing仍含终端上传、规则保存／执行迁移及两套页面消费。

- **上传链集中收口（进行中）：** standard-cloud／architecture-integration分别处理现有接收路由与固定契约。新增能力只在基础存储、schema3防回流兼容和产品投影存储就绪时声明；缺失时保留旧能力、返回稳定不可用，不引导端上反复发送。验证机器鉴权、能力缺项、精确ACK、重复／冲突、基础与产品隔离；最小测试为usage-account、application-accounts与typecheck。集中固定1.43开发包，根lock仅workspace版本同步例外，保留1.42不覆盖；无生产迁移、安装、部署。

- **本轮实际结果：** usage-account源码已补独立产品投影上传路径、能力／1MiB常量和精确请求ACK校验；契约build、usage-account既有回归及新增错误清单／错误修订／错误hash／重复ACK／路径拒绝用例、git diff --check通过。仍为开发源码，1.42固定包未覆盖；接收能力和下一固定包／Native上传未完成，不宣称产品云端链通过。Native另已核实新证据与旧分类条件字段不一致：当前实际binaryHash、显式产品binding、产品type空条件可用，旧fileSeriesKey/signerKey/packageId不能自动映射为新字段，待集中固定语义，不据字段名字做别名。

- **产品投影上传缺口已登记并实施：** Native实际Service→基础／产品读取隔离链已回报通过，但固定1.42包缺产品投影上传路径、ACK与独立能力定义，云端存在接口不等于两端已接通。本轮architecture-integration先在既有usage-account契约明确PUT载荷、精确ACK及能力常量，补范围／版本／hash拒绝用例；只跑契约build与相关测试，不修改原账、不覆盖1.42固定包。随后集中固定兼容包和接收能力，再交Native接上传。执行衔接暂保留设计，先完成统计主链；分类证据字段新旧语义差异另交Native核查，不能猜别名。

- **执行衔接进入源码阶段：** Native已回报可复用projection-context而无需新增云端凭据。现有DESIGN固定native-local全量观测封锁快照／精确ACK、连接顺序／截止与撤销、能力分离及原子切换；只传必要观测引用，不复制名称／实例映射或另建匹配器。交Native在原工作线实现和隔离验证，不安装、不运行真实封锁；旧端保留原协议且不冒充新执行。既有疑似变体强化执行迁移尚未解决，单列保留，不借本次改造静默删除。

- **规则管理界面实施：** standard-cloud；在既有程序实例对话框接集中目录读取、核验证据选项、产品／规则草稿、停用／移除草稿及服务端分页预览。浏览器不执行归属匹配、不改第三层，不自动转换旧目录；显示草稿未保存／未生效，无保存按钮。编辑、切换孩子、关闭或刷新使旧预览失效。仅knowledge组件、既有UI／技术文档及聚焦测试，使用隔离浏览器检查桌面／手机，不接生产、不扩大执行。
- **规则草稿接线结果：** 已接实际集中目录GET及只读preview POST，核验证据可形成可复用规则草稿；已有分类／孩子bindings不变，停用／移除仅改变草稿。knowledge与canonical组件聚焦测试通过，覆盖Windows／Mac证据选项、去重、禁止弱名称、旧目录拒绝转换、跨孩子与草稿变更迟到响应隔离。agent-browser独立无凭据夹具点击完整路径通过，实际仅GET、GET、POST；桌面／390px手机截图已目视。首轮夹具漏载产品基础CSS已纠正；手机规则卡片证据改为按钮上方，最终body宽与scrollWidth均390。截图仅本地临时文件，夹具和浏览器已关闭。Matched＝草稿与云端预览消费；Missing＝实际保存／政策执行、生产联调；未提交、部署、安装。Native最后一轮转为Mac状态查询，已向同一任务再次明确当前Windows读取／产品投影和执行衔接建议未交付，不能用Mac回报替代。

| 未完成问题 | 当前证据／下一步 | 完成判定 |
|---|---|---|
| 新身份尚未进入实际产品管理执行 | Native已回读：SessionAgent只有observationRef；Service持久解析instanceId。WindowsBlockedApplicationEnforcer仍消费旧BlockedRuntimeIdentities／ProductBlockPolicy，新projection-context只接产品统计 | 完成Service到Agent的当前会话观测关联与决策接线，不增加第二套产品匹配，不用instanceId冒充runtimeIdentity；目前未完成 |
| 新规则保存尚未开放 | 目录读取、正式匹配器预览、隔离保存及映射重建已有测试；管理HTTP写入仍关闭 | 规则保存、政策消费者和管理页面同批接通后开放；不能以预览成功称为生效 |
| 产品统计终端真实联调仍待 | Native已提交66962ad：1.43产品上传、Host／Manager读取和隔离回归已有源码证据；尚未安装，Agent恢复及分类证据差异另待 | 固定当前来源对照实际上传、持久ACK和页面；隔离通过不替代实机 |
| 控件读取尚待适配；两套云端页已完成隔离消费 | 两套云端页均已请求新模型，基础／产品独立呈现，桌面手机目视及读取切换隔离通过；控件实际消费者未完成 | 控件所属端使用新读取契约；云端页面正式来源逐项核对 |
| 集中联调、提交与生产状态 | 新云端批次仍在工作区；本轮没有安装／部署／生产迁移 | 源码、测试、部署、安装和实机分别登记，不复用旧模型验收结论 |
| Mac、历史信息不足 | Native报告同日旧v3门槛已移除，旧数据仅本机说明；Mac新模型未实机验证 | 历史尽力而为，不恢复退出旧账，不阻挡Windows当前新数据；Mac单列 |

- **当前实施顺序：** 先核实并固定旧政策保留边界和新版实际执行缺口，继续Native新读取与产品投影；再集中接规则保存／管理消费者及页面，最后联调。没有新增部署或执行授权。
- **本次最小验证声明：** standard-cloud，仅`backend/test/program-instances.test.ts`补真实机器政策GET前后对照及现有文档。验证已有封锁在schema4切换、v1/v2盘点和重放后不被清空；不改产品代码，不跑全量或浏览器测试。使用Cloudflare／Worker审查技能核对现有鉴权与存储读取，不访问生产。
- **本次验证结果：** 用既有putAppPolicy建立非空封锁，再经机器鉴权GET读取政策；保存schema4、两种盘点各接收及重放后，GET完整载荷与ETag逐值不变，存储政策仍只有版本1、机器期望版本仍2。backend typecheck及14项实例测试通过。此证据证明开发过渡期间保留旧政策，不证明新规则用于执行；该缺口及本机消息建议已交现有Native任务，Host／Manager与产品统计继续推进。Matched＝登记及旧政策保留回归；Missing＝新版执行接线、编辑入口、完整消费者和集中实机；Extra＝无生产操作。

- **规则预览HTTP已验证：** POST preview已接实际module鉴权，读取孩子实例并复用正式匹配函数；有确定命中、撤销后未识别、冲突、跨孩子／额外字段／旧ETag拒绝及零目录/映射写入证据。目录两次读取间版本变化也拒绝。14项实例测试、typecheck和diff通过；首轮仅测试参数被UUID字面类型过窄推断，显式string后通过。没有开放保存或改策略；页面编辑、政策执行及真实联调仍待，Native已收到实际政策入口核查任务。Cloudflare／Worker技能用于范围、查询和鉴权审查，未操作生产。

- **规则预览接线（实施前）：** 在现有家长规则目录入口增加有界只读POST preview，依据当前孩子已登记实例证据运行拟议规则，列出前后归属／冲突／未识别；复用同一匹配函数，不保存映射或政策。目录ETag与分页目录版本须一致，拒绝家庭外绑定和未知字段；50项一页，不全量扫描。Native同步核对执行消费者所缺字段，当前不凭空扩展政策协议。standard-cloud，相关实例测试／typecheck；不部署、不启新执行。

- **盘点解耦阶段验证：** 新schema4目录下v1/v2实际鉴权HTTP盘点均接受并保存、重复请求返回duplicate，不生成旧政策、不改变desiredPolicyVersion、不把盘点直接写成实例映射。13项实例测试与35项inventory筛选回归、typecheck及diff通过；首轮新增v2夹具使用不存在reasonCode导致校验拒绝，已按真实discovery字段修正后通过，未放宽解析。旧目录政策行为保留。此步只解决盘点上传耦合，未完成新版政策执行／规则编辑，不部署、不启共享。

- **旧盘点与政策耦合修正（实施前）：** 已定位syncApplicationInventory两种格式在事务提交前调用旧getApplicationKnowledge／policyStatements；目录变为schema4后整批盘点被拒绝。新版目录下保留盘点原事务、扫描完整性、幂等与ACK，但不再调用旧识别器生成政策；旧目录保持原行为，不覆盖已有政策快照。新政策执行接线另须完成，不能据此宣布已支持新版执行。仅standard-cloud现有Knowledge及实例测试，typecheck／相关聚焦验证，不改原账、Native或部署。

- **目录只读接线已验证：** 新GET复用module鉴权，读取原Knowledge版本表，返回empty／legacy／available及ETag，no-store；不暴露PUT、不另建规则源。12项实例聚焦测试及backend typecheck通过，覆盖跨家庭、无认证、旧格式、版本错配、方法拒绝与读取无写入；diff检查通过。Cloudflare/Worker技能检查用于有界查询与现有绑定复用。Matched仅为真实HTTP读取链，规则编辑、政策消费者和页面编辑尚未接通，不作为整体完成；未提交该云端批次、未部署或迁移。

- **规则管理接线（进行中）：** standard-cloud；先增加同一权威目录的家长鉴权读取入口，返回规则／产品及ETag，空目录与旧格式待转换分开，不复制规则存储。写入必须同批处理机器政策消费者，当前不提前开放PUT以免schema4使旧政策生成失败。聚焦家庭隔离、无凭据拒绝、旧格式、版本一致及无写入；仅backend相关测试／typecheck，不部署、不迁移。

- **1.42.0集中开发契约已交接：** 本地提交`6381aa8802323fc28fefff94084f02cc3a83ce82`固定读取Schema、TS校验、共同向量及兼容用例，10文件architecture-integration职责检查通过（根lock仅workspace版本例外）。包168008字节／91项逐一与当前源码和dist一致，SHA-256`fe19b680163a0139042f52ff80cc75bd21d0a533e09a681efc5fe1cf1bb3d481`，旧1.41包hash不变。build、旧秒接口10组及新增身份／分页／跨日未知用例、compatibility、diff检查通过。已向Native原任务提供固定包和SHA，要求接实际消费者、不出中间安装器。未推送、部署、安装或启共享；新接口实机、产品投影拓扑、规则编辑／政策消费者和两套页面完整接线仍未完成。Native确认刚新增旧账门槛会阻断rows/冻结/outbox，正在移除，尚未进入已安装版本。

- **下一固定开发包实施范围：** architecture-integration；仅现有contracts、决策及本任务记录，根package-lock只同步workspace版本这一项例外。补齐新读取的实际分页／未知日／跨日回归后集中固定1.42.0，保留1.41.0原包，供两端实际消费者锁定；不改变原账、后台云端实现或生产能力。必要检查为契约build、读取／兼容聚焦、差异检查及包内容／哈希核对，不跑产品全量、安装器或实机。此开发包不是新终端候选。

- **本轮检查结果：** BrowserBridge新查询改为引用同一identityQuery Schema，避免两处字段定义漂移。build、秒接口及compatibility通过，git diff --check通过；compatibility首次失败是消息枚举断言未加入已批准新消息，已补精确枚举与Schema引用断言后通过，未放宽旧协议检查。固定1.41.0包SHA-256仍为da444a4c9ccfe936ff97aac491ad42f3d17f6ad1c478b7bef11575c531919137。Matched＝本轮读取格式／共同向量／兼容检查；Missing＝新固定包、两端实际消费者、产品拓扑及集中实机；Extra＝无安装、部署、生产迁移或共享启用。现有未提交实现保留，不把开发Schema称为已发布契约。

- **读取契约证据补齐及后续顺序：** 已补产品逐日24小时分类、基础／产品分离的JSON Schema和3个跨端共同载荷（基础重叠主体、产品缺失、产品可用）；编译和秒接口聚焦测试通过。接下来统一BrowserBridge引用并复核原固定包未变，再集中固定下一兼容包、接Native／控件消费者；不逐字段发包。Native最新回报Manager基础入口已接，产品拓扑仍待；其新增同日旧v3兼容缺口需核对，已明确历史未覆盖只作说明，不得阻断新v4基础统计／上传／读取。没有生产、安装或迁移操作。

- **新版终端读取开发契约已落地：** 在既有application-usage-seconds模块加入schema3基础／产品分视图查询、100主体分页、逐日基础引用与产品状态、严格校验；BrowserBridge新增协商能力及getApplicationIdentityUsage消息／响应，不改变旧getApplicationUsageSeconds。产品missing/stale保留基础600秒、基础禁止名称、重叠明细不加总、跨范围／错版及维度错误拒绝回归通过，原10组秒接口回归仍通过，build／diff检查通过。尚需产品小时字段、共同向量／完整Schema及最终固定包，两端实际消费者和真实验收未完成；固定1.41tgz未改，不打包／部署。

- **终端读取断点实查：** `contracts/application-usage-seconds.ts`当前固定响应是schema2（前条“schema1”修正），强制应用行名称／非空分类；扩展`stats/application-usage-read-model.js`实际分页消费者也严格执行该约束。因此不能只替换Service数据源，不能把未知身份填成未归类或沿用旧产品行冒充新实例。保留原查询7日／100项／冻结revision边界，新增基础与产品状态分离的协商读取；当前已与Native核对所需字段，尚未发布新契约或改扩展。Native内部投影生成不因等待wire停止。

- **父视图加载隔离（实施中）：** 已定位apps视图仍将旧政策／目录失败升级为整页失败。仅该视图改为保留程序实例只读入口，旧目录清除陈旧动作并明确不可用；不伪造空目录／零数量、不放宽旧格式保护。设备、配置等视图原错误边界不变。聚焦组件回归覆盖首次失败、成功后刷新失败和恢复；无生产操作。
- **父视图隔离已验证（源码／隔离）：** app-runtime组件已在旧目录失败时保留实例入口、禁用旧编辑、清除陈旧动作、数量标未知；失败不清登录恢复标记。组件及knowledge回归通过。完整canonical父页面模拟catalog格式拒绝，实际点击实例入口成功发出独立GET并显示未识别项，桌面／390px手机目视通过；此前仅对话框夹具的证据缺口已补。未访问生产，隔离服务与浏览器已关闭。新版规则编辑／政策消费者、正式Native数据及实机仍未完成。
- **Native登记／缓存接续：** Native回报已锁1.41.0，实际Service登记循环和同事务outbox、能力门、严格ACK及重启不重复隔离通过；映射读取已接并复核当前分配、证据版本及缓存TTL。产品生成／消费者仍在实施。发现现有BrowserBridge秒接口仍旧schema1，本次不得冒充新v4已覆盖；当前任务接着集中补齐读取契约，Native无需停等，可继续内部投影与本机窗口读取，不另出中间安装包。
- **目视补记：** 手机父页面入口和独立读取可用，但长错误码有截断；已补局部自动折行，组件回归及diff检查再通过。该CSS最终手机截图尚待补核，前条“手机目视通过”仅指入口／调用链，不代表最后样式已验证；提交前须补核。
- **折行补核完成：** 用实际knowledge CSS隔离390px卡片复验，长错误码完整折行，document scrollWidth/clientWidth均390；截图本地保留、不入Git。该结果仅证明本次错误码样式修正，完整父页点击及对话框证据沿用上一轮。隔离浏览器／服务器已关闭。

- **页面接续（实施中）：** canonical应用管理加入程序实例只读入口，独立分页读取、刷新、局部错误和迟到响应隔离。不调用旧产品编辑接口、不写第三层映射；旧目录加载隔离、新规则编辑与政策消费者仍待。职责standard-cloud；只运行知识组件及装配回归、隔离桌面／手机目视与diff检查，不运行全量或生产操作。
- **只读对话框阶段结果：** 现有knowledge组件及index接入实例列表，支持状态／证据折叠、50项分页、目录版本变化要求刷新、错误局部重试；关闭、刷新竞态和孩子变化丢弃旧响应。knowledge与canonical组件测试通过；agent-browser隔离无凭据夹具桌面及390px手机截图目视通过，长hash折行；本轮浏览器及回环服务器已关闭。Matched＝只读对话框和共同组件装配；Missing＝完整管理启动链（旧catalog失败仍会阻挡父视图）、新版规则编辑／政策消费者、Native实传与真实验收。没有推送、部署、安装或生产迁移，不能称管理功能已上线。

本条覆盖下文“仅讨论规则”的旧阶段状态。PO要求先登记、再连续分阶段执行；历史尽力而为，不追求完整迁移，不猜补或恢复已退出旧账。

| 待完成项 | 已定位依据 | 责任／完成条件 |
|---|---|---|
| 程序实例标识 | Native WindowsApplicationIdentityDeriver混合包、签名、哈希及名称，不含位置 | Native：机器＋位置＋内容；扫描与运行共用异步证据和缓存；未知不阻断落账 |
| 新旧契约边界 | application-ledger.ts严格校验字段，runtimeIdentity参与v3原账哈希 | 当前任务：不原地改旧字段语义；固定实例引用与共同用例，再由Native适配 |
| 集中规则及孩子映射 | applicationIdentityProjection.ts按包／文件哈希先关联技术对象 | 当前任务：云端唯一匹配；实例不因同产品合并；规则跨孩子复用、结果按孩子隔离 |
| 基础统计与产品归集 | ApplicationChildStatisticsReader混合基础事实、产品投影与名称 | Native基础统计、当前任务云端读取：识别失败不丢时长，产品名称不修改原账 |
| 未识别管理及纠错 | 概念已确认，入口待改造 | 当前任务：人工修正规则、不直接改映射；缺证据保持未知 |
| Windows贯通验证 | 旧模型实机结果不证明新模型通过 | 集中一次候选：安装应用、同产品不同位置、专用辅助、未知对象及孩子隔离 |
| Mac与旧数据 | 新模型适配／实机证据缺失 | 所属端分别登记；历史尽力而为，不阻塞Windows新链路 |

- **顺序：** 契约与共同用例→Native实例／统计及云端规则／映射／读取→集中联调。批内不逐零件发包，不重复要求PO继续。
- **集中契约1.41.0已固定并交付Native：** 本地提交`52f41d7b9ab80a61645ecf136236d2863437106e`，11文件职责检查通过；包161620字节、91项与源码／编译产物逐项一致，52项包内源码／Schema／向量／package与固定提交核验一致。SHA-256`da444a4c9ccfe936ff97aac491ad42f3d17f6ad1c478b7bef11575c531919137`；1.40原包hash不变。build、compatibility、classification、usage-account、application-ledger聚焦通过，已明确下发Native锁包并继续登记ACK／映射缓存／实际消费者实施。此为本地开发包交付，不是已安装、已上线或实机完成；云端其余工作区改动仍待集中提交，未推送／部署。
- **产品投影共同证据收口：** 将独立投影格式补入既有usage-account Schema及黄金向量，固定基础引用、重叠产品明细、分类与特殊扣除的哈希；规则／绑定沿同批catalogVersion，不新增冗余配置版本。只做architecture-integration契约及相关测试，固定1.40.0包不覆盖；下一兼容包待上下文／输出共同证据齐备后集中交付，尚不发布生产能力。
- **Native发现的协议缺口：** 固定1.40包缺少登记ACK及capabilities响应类型。先补到现有classification契约，明确整批事务、不接受部分ACK、逐项实际保存版本／hash、同版本hash匹配、旧请求遇已保存新版本仅确认旧请求已被覆盖；失联不得清队列。当前云端wire不变；下一固定包交付后Native再接收，不要求其自行猜协议。
- **共同协议本轮结果：** 已补类型／严格解析并用于云端登记返回；产品投影Schema与固定载荷hash已加入既有usage-account文件。契约build、classification/usage-account及后端typecheck、11项program-instances回归通过。固定1.40.0包仍未覆盖，Native已收到精确wire说明并继续其他入口测试，下一包及产品投影真实消费者仍待，不把源码契约通过称为已交付包。
- **未识别管理读取实施：** 在现有家长module鉴权下增加孩子范围实例清单，最多50项、按实例ID续页；返回采集证据、映射状态及当前产品名称，未识别／冲突／待更新分开。不返回本地路径，不开放第三层写入，不在列表请求执行识别。复用现有实例／映射／目录表，无新增存储；测试真实HTTP鉴权、孩子隔离、规则撤销后待更新、分页和方法拒绝。页面及规则编辑入口另接，当前不称管理功能完成。
- **实例管理读取阶段结果：** 实际GET路由已接，typecheck及11项program-instances测试通过；覆盖51项两页无重复、家庭／孩子隔离、证据展示不含路径、方法拒绝、规则撤销pending→重新匹配unresolved。测试先修正UUID默认参数推断，再补齐新夹具的撤销后重匹配，避免其51项pending干扰后续后台全局计数；没有放宽产品断言。一次筛选命令被Windows管道解析、未启动测试，改用同文件运行通过。Matched＝本次只读入口，Missing＝页面／规则编辑／实际Native证据上送；仍未部署、安装或提交。
- **Native隔离链回执与真实缺口：** Service→v4 SQLite事务→schema3冻结→模拟云端ACK→重建Store无重复已取得隔离证据，新能力缺失保留队列、原账序列化不变。回执156项受影响唯一回归不与10项定向子集累加。正式SessionAgent仍未使用新ProgramObservation管线，实例登记队列／映射缓存及新读取消费者尚未接通；已明确继续实际入口实施，不将注入ObservationRef的测试称为完整采集。产品上下文沿用同批catalogVersion及每项evidenceRevision，不另加重复配置版本。未安装／部署／制包。
- **目录消费者接续：** 已确认旧`getApplicationKnowledge`无校验地断言旧结构，供编辑、导入、撤销及盘点政策使用。先明确拒绝将schema4作为旧selectors目录读取，覆盖旧写入口不降级／不增版本／不改政策的隔离回归；不猜转新规则、不开放尚未接通的生产管理入口。职责standard-cloud，仅相关backend及文档，运行typecheck和program-instances聚焦测试；后续仍需实际新版目录管理与政策消费者适配，不能把防误读称为管理完成。
- **目录格式边界结果：** `getApplicationKnowledge`已去除无校验类型断言，新schema4返回明确未适配错误，损坏旧目录单独报错。typecheck、10项program-instances及4项原有目录导入／盘点／分类政策回归通过（其余70项未运行）；旧入口尝试覆盖schema4时不增加目录版本、不生成政策。Matched＝本次格式边界；Missing＝新版管理／政策消费者及真实验收；没有以兼容为由转换新匹配证据、回填selectors或放开执行。代码仍待集中提交，无部署／安装。
- **本轮接续与未完成登记：** 产品投影接收已具备源码证据，接下来接现有基础读取入口的可选产品投影读取；逐来源返回基础引用、截止、投影版本及缺失／过期／异常状态，不重新计算时长，不以产品投影失败清空基础结果。随后仍须完成Native真实生成与上传、目录管理消费者切换、页面及集中实机验收；这些均未完成，不能以接收测试替代。本轮仅相关契约／后端读取与隔离HTTP测试、typecheck、diff检查；无安装、部署或生产迁移。
- **产品投影读取已接线（源码）：** `includeProducts=true`按已读基础清单取得最新独立投影；每批四来源，限制总载荷和行数，只核验已保存结构／hash、不扫描原账。HTTP回归证明基础60→30替换后不借用旧产品60秒，新投影30秒可读，目录变化保留旧投影并标stale，损坏投影只报局部异常。默认读取不增加目录／产品查询；名称与产品投影分别隔离。27项application-accounts及typecheck通过，不代表页面或生产已完成。Native最新回执为真实Service入口、冻结及schema3上传分支已接，隔离ACK／重启／无能力待发送验证中，尚非实机证据。
- **产品投影接收阶段结果：** applicationAccounts现有机器路由已接PUT product-projection；0019派生表只引用基础manifest，原账／基础表未改变。typecheck及27项application-accounts隔离测试通过，覆盖HTTP保存、精确ACK、重复不增、同版本冲突、迟到旧版拒绝、其他机器拒绝，以及后续基础版本更新继续正常读取。Matched＝本次接收持久化；Missing＝产品投影读取／页面、Native实际生成与实机。0019仅测试D1执行，未生产迁移、未安装／部署；能力仍未宣告，固定契约包未覆盖。
- **产品投影持久化实施：** 新增开发0019，仅一张引用基础清单的不可变派生JSON版本表，不复制Child／机器归属、不新增原账或另一套基础统计。现有machine application-accounts下按manifest接收产品投影；逐版本幂等、冲突拒绝、更正下降、旧请求不覆盖新版本；校验身份／结构／hash而不重算原账。请求有界1MiB。只在隔离D1执行迁移，生产须集中发布时明确列入。
- **产品统计输出阶段结果：** usage-account新增独立投影类型及解析／hash／基础引用／维度校验；基础total不复制、名称及余额拒绝。契约build和usage-account用例通过，含明细240而基础180、错误hash／引用／扣除拒绝、分类／产品更正下降及基础对象不变。此为开发源码，不覆盖1.40.0固定包；仍缺持久化接收、Native实际投影、页面及实机，不能把共同校验通过称为产品统计已完成。
- **产品统计输出实施清单：** 独立派生投影引用baseManifestHash和目录版本，保存产品／未识别主体及分类的日小时整数秒、既有特殊排除统计；不保存名称、余额或原账副本。复用既有维度校验，不要求产品明细和等于并集总量。投影缺失不阻断基础统计，云端采用／页面及Native真实生成仍须接线；本轮先固定类型、验证函数与共同用例，不重制1.40包。
- **投影输入阶段结果：** schema2上下文类型／严格解析与机器projection-context/read已接线，复用同批目录／分配／映射；旧schema1响应不变。契约build/classification、backend typecheck与9项program-instances测试通过。拒绝跨孩子／分配、额外产品与isChromeContainer冗余字段；输入只使用目录catalogGroup及既有孩子分类配置，无余额。草稿仍未打包／发布，固定1.40.0包hash不变；待独立投影输出及消费者接通后集中交付，不称完整产品统计通过。
- **独立投影输入实施清单：** 新增开发中schema2映射上下文，沿用既有请求及同批鉴权／目录／映射读取；产品仅增加既有type/catalogGroup，附当前孩子的分类规则及binding，不增加重复特殊标志或余额。旧schema1响应和已交付1.40.0包保持不变；新输入先源码验证，待产品投影输出一并固定后集中发下一兼容包。Native不以猜测字段提前消费。验证孩子／目录一致、额外产品拒绝、特殊属性单一来源、旧端响应不变。
- **身份展示投影阶段结果：** program-instance-usage可选includeIdentity返回独立元数据投影，目录及持久映射同批读取；名称／成员不进入基础行或基础revision，不生成猜测的产品时长。typecheck及program-instances/application-accounts共36项通过，覆盖两个实例同产品、孩子隔离、未知观测、改名后映射待更新和目录损坏仍返回原基础统计。代码尚未提交／部署；页面、产品时长投影和实机仍Missing。发现旧getApplicationKnowledge直接断言旧格式、新目录不能安全交给旧selectors消费者；继续保留生产写入口未切换，不用读取元数据完成冒充管理完成。
- **Native产品投影字段回报：** 可复用既有区间／小时分配工具，但不能重新以墙钟宽度floor恢复原账已舍弃碎秒。1.40映射响应目前只有产品id/name，缺分类及特殊应用目录属性、相应孩子配置依据；需要集中补独立投影结构与真实消费者，不把这些字段补进schema3基础行。Native继续实际Service基础冻结／上传接线，产品投影缺项不阻断基础统计；未安装／制包。
- **产品读取接线清单：** 在基础统计之外提供可选身份投影：按本次统计主体读取同孩子持久映射与同批目录，返回产品名称和成员，不从成员时长猜产品并集。目录／映射读取失败只影响身份投影，基础统计原值继续返回。验证同产品多实例、未知、目录改名／撤销、跨孩子不泄露及基础版本不变。旧目录读取目前直接类型断言，尚未具备安全schema4写入切换，因此本轮仍不开放新目录生产写入口；独立产品时长投影由Native核对现有区间计算器复用点，未授权另建原账。
- **映射触发阶段结果：** 登记路由在证据事务完成后用现有waitUntil触发有界匹配；现有scheduled独立补处理最多100项版本过期／缺失映射。typecheck与8项program-instances隔离测试通过，包含注入匹配失败后登记仍ACK、持久化待处理恢复、重复巡检无重建及规则撤销从pending变为unresolved。首次测试失败仅为D1 exec逐行执行多行触发器，改用prepare完整执行后通过。Matched＝自动触发与补处理；Missing＝目录管理消费者切换、产品统计投影、Native实际链路与实机；无安装／部署／生产迁移，不把本轮后台函数测试等同生产定时运行证据。
- **映射触发实施：** 登记ACK与识别结果分离；登记后有界后台匹配，缺目录或失败不撤销证据。现有定时入口按目录／证据版本差异补处理最多100项，覆盖规则修改和后台中断；不新增队列、不在读取时匹配、不扫描原账。仅相关云端入口和隔离回归，不部署／安装。
- **基础读取阶段结果：** 已接`programInstanceStatistics.ts`及家长module实际HTTP入口，只读schema3采用头／不可变块。typecheck通过；application-accounts与application-account-publication共109项通过，包括真实隔离HTTP上传→采用→读取、60→30下降替换、其他机器累计、家庭／孩子隔离、缺日期不填零及明细20秒不替代来源总量10秒。没有产品目录或实例登记也可读基础时长；返回版本／截止，未知观测保留。Matched＝本次基础读取；Missing＝产品投影、现有统计页面接入、Native生产消费者及实机；Deviated／Extra＝无。未声明新生产能力、未提交／部署。本轮使用Cloudflare与Worker审查技能检查有界读取和鉴权边界。
- **Native同期回执：** 所属会话已固定1.40.0包与真实源码锁，v4 AccountingSession、观测／解析存储及SQLite事务已有隔离证据；实际Service入口、观测管线与schema3冻结上传仍在实施。已确认不能把旧显示名／分类字段塞进基础行，也不制作中间安装器。该回执是源码进度，不冒充本机已安装或实机通过。
- **当前读取实施清单：** standard-cloud，中等只读变更；在现有发布头上增加按孩子、最多七个北京时间日期的新实例统计读取，经现有家长鉴权接入`/v2/module/program-instance-usage`。总量只累加各来源total，实例明细保留主体，不伪称产品；返回父清单版本、截止、缺失日期和未适配来源，不回退旧账。只改backend读取／路由／聚焦测试及现有设计；验证上传→采用→读取、下降替换、多来源、未知主体、孩子隔离及无数据非零语义。产品投影与页面尚待，能力保持未启用；不跑全平台、不部署、不安装。
- **契约提交与接收链路：** 1.40.0源码固定f0bf4da5b6c51f79764ef120a96ed2748f9520b5，包内52项源码／Schema／向量与提交逐项核对一致，原包hash不变，已回传Native用于真实锁。云端begin/chunks/commit/status及发布已接schema3，隔离机器HTTP验证未知观测无目录／原账也可采用、重放不重复、更正下降与跨机器／孩子拒绝。124项受影响测试通过；补充0018退出旧账触发器适配后相关35项通过。0018未在生产执行，保留原始退出水位及旧账拒绝；新读取和产品归集尚待，故不声明能力、不部署。契约已本地提交、云端实现仍工作区待集中提交，不能混称上线。
- **Native已下发实施，不再停留审核：** 本地契约1.40.0包SHA-256为ac64f23574b899f23897bb130494f0ffcc48583f8796e9f769b3bca1e3cafe72，build、compatibility、classification、application-ledger、usage-account聚焦校验通过，tar清单确认新schema/编译输出/向量。已向现有TimeWhere Native Host交付固定包，要求原账v4→实例/解析→schema3基础统计及真实Service事务接线与隔离测试；不制中间安装器、不装、不部署。当前任务继续云端schema3接收和产品归集；Native收到任务不等于已实施或通过。package-lock任务级例外仅同步workspace契约版本，旧包保留。
- **基础统计格式已补齐：** 复核Native仍停在等待固定契约、未实施；本轮补usage-account schema3实例基础统计（Child＋整数秒＋instance/observation主体，不含产品名称／分类／配额），保留已有manifest/chunks传输结构，未新增原账发送。共同Schema与黄金hash已写入既有契约文件；build、usage-account及application-ledger聚焦测试通过，验证未知主体有效、明细240不替代并集180、解析后原始事实hash不变、旧格式拒绝新字段。此为契约阶段，尚未加入云端生产接收、统计读取或Native消费；下一步集中打包并交Native接线，同时补云端schema3接收与独立产品归集。不能把本轮函数／黄金向量通过称为链路完成。
- **目录保存服务已接入隔离链路：** saveProgramInstanceCatalog复用Knowledge版本／审计表，以ETag条件保存、服务端递增版本，目录和审计同批提交；拒绝越界孩子及借身份编辑新增强化封锁。映射生成／读取测试已从手写SQL目录改为调用此保存服务。typecheck及7项聚焦D1测试通过，包含并发同版本只成功一次、审计冲突整批回滚、保存不改政策或映射。Matched为保存→规则物化→读取的隔离链路；Missing仍为管理HTTP及旧消费者切换、自动重建触发、Native和实机。未接生产写入口、未提交／部署；无新增审批项。
- **映射读取共用契约已接线：** 新增请求／响应类型及严格解析，Worker已改为使用同一契约。响应逐项匹配请求实例、孩子和分配，确认产品必须来自同次目录；缺项、重复、跨范围、过期结果误带产品均拒绝，名称不进入原账。契约build、classification与application-ledger测试、backend typecheck及6项隔离D1测试通过。目录写入仍调用旧selectors政策投影，已确认须连同消费者切换，不能直接写schema4后沿用旧解析。当前未发布新契约包；Native接线和实机仍缺，不能标记全链路完成。
- **职责／范围：** architecture-integration／standard-cloud；当前任务修改现有文档、契约、Runtime云端；Native本机由原所属会话实施，不越界改扩展。复用现有分支／工作树，无新治理文档。
- **验证：** 先文档一致性和git diff --check；代码阶段仅实例／规则／隔离／未知保留与实际消费者聚焦测试、typecheck。网页计时、全平台和安装器测试排除；源码、测试、部署、实机分别记录。
- **状态：** 待办已登记，契约草稿、机器登记HTTP入口、持久规则映射生成及机器映射读取已实现并通过隔离测试；Native真实消费者、目录管理切换和实机尚未完成。无安装、部署、清账、生产migration或共享启用；现有生产包不包含这些未提交改动。
- **映射读取收口：** POST program-instances/mappings/read经已有机器鉴权，只读取当前用户最新有效孩子分配下已登记的实例；授权、目录及映射采用同一D1批次。目录／证据更新后旧映射返回pending且不携带旧产品，未识别与待更新分开；名称来自同次产品目录，不复制进原账。backend typecheck、6项program-instances隔离D1测试及git diff --check通过，包括真实路由读取、改名／撤销／证据更新、跨家庭、未知实例、重复输入及改绑后旧范围拒绝。Matched：本次有界读取；Missing：正式共享契约输出格式、目录写入消费者切换、物化触发、Native与统计／管理页面接线及实机；Deviated／Extra：无。下一步先补齐上述契约和目录切换，不产生中间安装包。
- **本次续接核验：** 观测解析关系及基础统计主体选择已补齐；未解析保留独立主体，解析后只重建派生版本，不改原段。实例、证据及v4解析拒绝对象／数组伪平台，移除新解析中的强制类型转换。契约build、application-ledger.test.mjs和classification.test.mjs通过；旧v3黄金哈希及8项网页日／小时实际纯函数对照仍通过。Matched仅指当前契约函数；Missing为统计同步格式、真实接收持久化、两端消费者及实机贯通。下一阶段集中补齐统计／实例传输契约并交Native实现，不把本次聚焦测试当成链路验收。
- **实例登记输入已补齐：** 孩子／用户／分配范围的有界增量批次，实例描述与证据分开，服务器授权范围独立传入校验。聚焦用例证明跨孩子／用户／机器／分配拒绝、证据平台及文件hash冲突拒绝、相同内容不同位置保留两项、重复实例拒绝、空证据合法且不改输入。build及两个契约测试通过。仍未接HTTP鉴权或持久化，不把范围比较当作真正认证；后续必须由真实机器鉴权和历史分配查询提供scope，不得用请求自填。未提交、未发布包。
- **持久化结构已进入实现：** 已核实0008旧盘点表没有Child范围、版本化Knowledge只适合目录／规则，不能混用。新增0017开发脚本分别保存实例证据、历史分配确认的孩子范围及唯一规则映射；旧表／原账未修改。仅在内存SQLite执行0003＋0017，验证范围不匹配拒绝、改绑不搬旧范围、同实例不同孩子映射独立、重复映射和错误状态拒绝；`node test/program-instance-storage.test.mjs`及diff check通过。此证据仅为SQL约束，尚缺HTTP鉴权、证据版本替换事务和D1入口测试；未执行任何本地持久数据库或生产migration。0017须在最终生产发布范围中明确列出，不能随本轮测试自动应用。
- **登记服务及D1事务已验证（覆盖上条相应缺项）：** programInstances.ts新增真实D1登记服务，重新查询机器家庭／平台／撤销及历史分配后解析输入；证据＋范围原子保存，事务内读取实际版本返回ACK。同版本冲突触发整批回滚；旧版重放返回实际较新版本、不覆盖。`npx vitest run test/program-instances.test.ts`三个隔离D1用例通过，包含跨家庭／孩子／用户拒绝、重复／迟到／更正、半批回滚、改绑后双孩子范围独立；backend typecheck和内存SQLite结构检查通过。Missing仍为HTTP路由、能力声明、规则生成及Native调用，不声称完整鉴权HTTP链通过；无生产操作。
- **HTTP入口已接通（覆盖上一条路由缺项）：** GET program-instances/capabilities仅在0017所需表／约束存在时声明登记能力；POST program-instances复用requireMachine和有界JSON读取。四个聚焦D1测试通过，新增实际routeV2 Request→令牌认证→历史分配→事务→ACK与数据库逐项核对，验证无凭据、错误孩子、错误方法、超限请求、撤销机器。typecheck及diff check通过。此为隔离Worker/D1请求证据，不是生产或Native实机；下一项为规则目录新版读写、实例映射生成及读取，统计新格式与Native消费者仍待接线。
- **新版目录及持久映射：** 新增明确schema4目录解析：products不再有selectors、ownershipRules唯一归属来源，原分类rules／bindings保留；旧解析拒绝新格式，不伪造selector兼容。materializeProgramInstanceMappings已从持久目录和已核验孩子实例范围生成并保存第三层，SQL写入核对当前目录版本及证据版本／摘要，不让在途旧计算覆盖新依据。契约build／分类与原账测试、backend typecheck、5项隔离D1测试及diff check通过；实证改名保持productId、撤销规则恢复未识别、跨孩子拒绝，实例证据版本不变。目录写入／消费者切换、后台触发、分页读取、Native及统计格式仍待接线；当前隔离测试直接存入合成目录，不冒称家长管理入口已完成。未发布契约、未部署0017或产品。
- **第一阶段实际进展：** 现有classification契约加入独立ProductOwnershipRule／Evidence／Result及resolveProductOwnership；不带Child、分类或显示名，拒绝孩子例外和同ID重复规则。覆盖精确文件、完整AUMID、Windows已验证文件系列、Mac签名者＋签名标识；同产品多规则合流，异产品冲突，停用／删除返回未识别。契约build及classification.test.mjs通过（原26共同向量及新增17个断言）；首次普通沙箱build因D盘dist写权限EPERM未完成，经受控授权重跑成功，不是代码测试失败。尚未接生产入口／发布新包，不以纯函数通过称为链路完成。Native原会话已确认正在核对实例、原账及统计消费者接线。
- **第三层契约进展：** buildProgramInstanceProductMapping已加入，逐实例生成孩子范围结果，引用规则集版本，不复制名称／分类；同产品两实例保留两行，拒绝悬空产品、重复实例及直接productId覆盖。新增12个断言验证跨孩子规则复用、结果隔离、撤销与输入不变；build和原分类聚焦测试再次通过。Matched仅为规则／映射纯函数；Missing仍为真实鉴权接收、持久化、采集及统计／管理消费者接线和实机证据，未开启新生产路径。
- **持久化接线核查与输入边界：** applicationKnowledge.ts已有版本化JSON、条件更新和审计事务，可复用；但effectiveApplicationKnowledge会注入内置产品，policyStatements仍调用旧selectors投影，不能只把新规则追加进去称为单一来源。下一批需集中替换新格式对应的读取／写入／策略消费者，旧格式显式隔离。证据解析已拒绝路径、自报productId、跨平台字段及非哈希摘要，空证据合法；映射批量生成改为只校验一次规则集。新增7个证据断言及build／classification测试通过。Native会话仍active但最新进展转为另一个Mac同步任务，已要求保留本项核查回报、不打断其他任务；本项Native结论尚未收到，不冒称已完成。
- **实际接线待改范围已收敛：** syncApplicationInventory当前按machine/localUser/runtimeIdentity存证据；listApplicationInventory读取家庭范围，policyStatements把同一证据集传给各孩子。新第三层不可直接沿用此输入：先取得该孩子的实例范围，再匹配可复用规则；扫描证据不自动赋予所有孩子实例管理记录。当前应用页面读取applicationAccounts发布的持久统计，不直接调用application-ledger.ts原账解析；不能把新增原账类型当成云端统计已接通。下一步须同Native一起固定实例观测／原账引用／统计subject三处交接，再集中接云端写入、映射和读取。Mac同步任务已结束，Native当前重新核查本项；仍无最终结论。
- **Native第一阶段回报已收到（覆盖“尚无结论”）：** main@ffe0eb2静态核查确认身份进入原账canonical及foreground lane，不能事后覆盖；首次缺hash须不可变观测引用，后续解析关系独立。真实事务入口为RuntimeServiceCoordinator→MachineAccountingSession→MachineSegmentLedger，现有异步队列与probe可变路径尚不保证观测绑定；需原子观测及共用缓存。raw outbox无直接发送者，实际上传冻结统计manifest/chunks。已将引用选择及真实链路写入docs/DESIGN；下一步集中完成新格式与统计主体契约后交Native实现，不新建原账云上传。仍属静态证据，未冒称新模型实测通过。
- **新原账引用契约已编码：** application-ledger.ts新增独立v4解析／canonical／hash／校验及机器＋平台＋本机opaque位置引用＋可执行文件hash的实例ID生成；旧v3和时间函数未修改。新增v4 JSON Schema，现有vectors保存固定新段与实例黄金值，原账及分类聚焦测试／build通过。确认缺产品仍可解析、Child改变使原账hash不同但不进入实例ID、位置或内容改变产生不同实例、v3/v4互不冒充、原输入不修改。Native最终直接消费者与可复用测试清单已收到，静态审核结束；待完成实例登记／解析关系及统计subject同步契约后集中交付固定包，未发布1.39.1新内容、未安装、未启生产新格式。

## 2026-10-09 程序实例与应用身份三层模型（本层概念设计已固定，产品代码尚未改造）

- **已确认并登记：** 程序实例（此前称代码实例）＝机器＋指定位置＋实际执行文件固定内容；原账与基础统计独立于产品识别；扫描/监测提供证据，规则生成映射，人工修正规则或原则而非直接改映射；未识别≠未归类；增加未识别程序实例管理层。完整口径见app-runtime-management/docs/DECISIONS.md的2026-10-09条款，根DECISIONS.md保留统一入口。
- **实际状态：** 定义已确认，现有runtimeIdentity与新定义不等同；两仓代码、契约、存储和UI尚未按新定义完成核对或改造。此前名称选源补丁不等于此结构已实现；下文2.6.40/2.6.41记录仅为此前阶段证据，不作为本轮新的安装指令或当前版本核验。
- **本轮收口：** 第一层产品归属原则由代码约束；第二层产品归属规则表跨Child ID复用、可宽可窄且无孩子特例；第三层程序实例产品归属表按Child ID隔离、仅规则生成，不手改、不自动反向改规则、不另建同义结果。Child ID不进入实例定义或识别依据。纠错区分依据/执行错误与规则/原则缺失，修正后重建映射；未识别合法、不猜配。此前人工直接确认映射的表述明确被取代。保留产品边界、原账独立及历史归集/分类分离原则。
- **下一步：** 仅讨论第二层规则如何建立和表达。表结构、匹配算法、修订发布流程、同步协议、实例实现、历史数据处理与UI均未决定，不提前实施。
- **上位产品原则已补齐：** 辅助工具而非严格监管；可靠性、可恢复性、性能与使用体验优先。识别后台进行、缓存优先、有界重试、低频补扫与运行时补漏；接受文件变化发现延迟，不每次启动全量哈希，不猜补历史替换时刻或改写原账。原账独立、Child隔离、防重复与未知如实表达的底线保留，不扩大猜测性强制封锁。
- **尚未确认的讨论建议：** “产品特征规则＋确定文件规则”的具体分类、匹配冲突处理及人工审核建规机制仍待讨论，不将上一轮建议视为已批准实现，也不据此修改代码。
- **本次范围与检查：** architecture-integration，纯文档对齐；仅根DECISIONS.md、TASK_BOARD.md及App Runtime现有决策文档。逐条对照已确认定义及git diff --check；无产品测试、CI发布或部署smoke需求。不改代码、数据、Native、扩展、分支或工作树，不安装、不部署、不启共享。

## 2026-10-07 Native新版统计名称丢失（2.6.40已安装／Windows链路通过，名称选源修复2.6.41待安装／Mac单列）

- **最终名称选源补丁与唯一候选：** Native已集中推送`2829482b4f8bf560f7de4221d651e53a4d86b4e9`，只改Windows默认展示名为安全FileDescription→安全实际stem→安全ProductName；明确安全安装名保持。Reader及ModelVersion无diff，不加入分类名前移回退；产品/技术身份/分类/原账/秒数/队列均未改变。最终162项唯一聚焦通过（新增11项，含实际文件→库存→Reader/Store的守恒、新revision及出队），必要Service/Agent/Manager编译通过。唯一内部未签名候选2.6.41由此固定SHA生成，安装器SHA-256`70d80df8edbf0d2890f18f8958ce73f2d4b30a375c5b0b90d59ea6a914d49ae7`、manifest SHA-256`5eb91c7bc134631ba4352aa3569d8ff2776253f54973af65e38b71e1a40f06bd`由当前会话独立回算一致；Native报告固定`ffe0eb2b8ddec411bf8e3fb6c2d78dd5b1aad0ea`，13发布组件及11MSI持久组件版本/哈希核验通过。当前正式安装仍2.6.40，未启动安装器/UAC/热换Service，不部署未变云端，不操作R2/latest/共享。新名称仅在目标正常重新观测、文件可读、精确身份匹配并库存ACK后自然生成新派生版本；未再出现的历史主体不猜填。Matched＝最小源码/聚焦/候选；Missing＝2.6.41安装后的名称实读、原共享Mac名称任务实机回执。下文“修订中”保留为本轮前序定位记录，不作新待开发项。

- **最新现场状态，覆盖下文“待安装／仍2.6.39”：** PO确认手工安装后，正式安装目录四个主EXE及七个项目DLL均为2.6.40.0，11项文件哈希与候选一致，Service Running。Native固定报告`1768cb42b298aca211edae5cdce70224a300e5a9`记录安装核验。正式Host当日秒接口与主控制台真实API在北京时间13:44:36.453同一结算截止，总量及11条名称／秒数逐项一致，complete=true；独立Runtime真实页面也采用后续有效快照。Host view revision与云端统计revision属不同命名空间，不要求字符串相等；不同截止的自然增长不作为错误。未修改或重复部署云端产品代码。
- **名称质量仍未通过，不以“非空”冒充正确：** 实际同一技术主体在运行盘点更新后，由具体应用标签变为泛产品名称；两条目标投影均未确认产品，不是可信规范名称强制覆盖。Native生产库存／统计入口隔离复现运行证据替换installed证据时覆盖展示名，原账哈希、subject、时长及分类不变；现场默认文件元数据选源也已取得一条精确主体匹配依据。旧安装标签未必正确，不强写旧名、不按名称合并。Native在原“修改并部署”范围内集中修订未显式指定displayName时的文件描述选源，核对正常盘点刷新及新派生版本；不增加云端回填、配置名称优先的第二套猜测规则，不追加管理员诊断或中间安装包。
- **剩余证据边界：** 旧60秒主体确无安全持久名称，继续占位、不猜补；2.6.40新观测名称末级回退的真实现场分支尚未独立证明，不能只凭新DLL／revision称分支已验收。Mac安装状态已通过原Issue #12标准交接评论6031809131更新，未取得名称接入与实机回执。Matched＝安装、同截止Host→云端→真实页面；Deviated＝具体名称被泛标签覆盖，修订中；Missing＝修订后名称实读及Mac实机；Extra＝无原账／分类／身份／共享／R2变更。真实截图与作用域数据只留本地，不入Git。

- **当前状态优先于下文阶段记录：** 一次获批只读诊断及名称观测持久化补强均已完成；当前仅待2.6.40安装后的现场核对。Native已在固定报告提交`466020e0b63679112319e0f90306ff4077bbbc04`登记安装未启动的真实结果；本轮复核正式Host仍2.6.39.0。下文“待诊断／待补丁”仅保留为前序阶段记录，不代表新增待办；旧60秒缺名主体仍没有可恢复安全名称，不猜填。Mac交接已送达，未取得接入及实机回执。

- **新增主体实读诊断与接续（北京时间2026-10-07）：** PO批准一次当前用户、当天、单主体管理员只读诊断；正常UAC后返回`NO_SAFE_PERSISTED_NAME_SOURCE`、原账命中、冻结结果占位、盘点名称缺失、产品／分类／resolved名称均不可用、数据库变更0。这证明现存名称来源缺失，不证明该主体具体触发哪一种采集失败；不猜填旧60秒主体。源码确认：无程序路径仍可形成带运行名称的观测，但运行盘点被路径门槛跳过；异步文件盘点也可能在短时程序退出后失败。已交Native实施最小本机展示回退：仅保存认证观测中的安全运行名，以用户、平台和精确技术身份隔离，复用本机metadata，不写原账、不产生云端盘点outbox、不确认／合并产品或改变分类／目录。真实Service入口隔离回归及集中补丁仍待完成；没有追加安装或云端部署。Mac最新回读仍无名称修复领取／完成回执。
- **观测名称补强源码及候选已完成，现场未升级：** Native集中提交`a60da7eda6e0a0cfdcb596920353dbb4f9badbdb`已推送main，四个共享文件按上述范围接线，ModelVersion v6、AlgorithmVersion及契约1.39.1不变；138项聚焦通过，新增11例覆盖实际Service接收入口、无路径／文件消失／无盘点、断线、作用域隔离、同名不合并、事务回滚重试、原账数值守恒及新revision上传，共享net8.0编译零警告零错误。唯一内部候选2.6.40安装器SHA-256`04b64638a53f0cac06bd7afdea354a596e456a1cffb6e60f1551e8bbd55ba729`及manifest哈希已独立回读核验；候选报告固定提交`3710c9c5b5a4dfbc42fc84461b6e9db3507d20a5`。原聊天正常RunAs启动安装被Windows明确返回用户取消，安装器未启动、未生成安装日志，正式Host复核仍2.6.39.0；不重复弹UAC、不把候选称已安装，2.6.40实机验收待安装。原Mac任务更新已送达评论6031199149，仍无完成回执。没有改云端产品代码或重复部署，没有清账／改权限／启共享／R2操作；旧60秒缺名记录无可恢复安全名称，继续明确占位，不猜填。

- **最终现场结果，覆盖下文诊断阶段的“未实施／待完成”：** Native功能提交`852975222d079fa18767ab78d1742e24f871e841`已推送main，内部候选2.6.39由该固定源码构建；安装器SHA-256 `f93bea2bda1afaaa9a8ac4472b0ebaa12320d469d986add4ad773f8e9c690a32`。已完成2.6.38→2.6.39原地升级，Burn退出0、无需重启，Service运行；四个持久主EXE和七个项目DLL均为2.6.39.0，逐文件哈希与候选构建一致。Migration／MachineProbe是Bundle预检EXE，MSI明确排除，不应误判为漏装。配对、原账及outbox未清理，本轮没有启用共享。
- **真实端到端核对：** 正式Host当日秒读取、云端`/v2/module/app-usage`及两套已登录页面均显示原10条的安全名称，原8条固定“未归属应用”已恢复。固定同一已结算截止2026-10-07北京时间06:03:02.317，本机与云端总量均18420秒、complete=true，11条主体名称和秒数逐项一致；主控制台与独立Runtime实际展示5小时7分及相同截止，不能用持续新增后的结果冒称修复前后固定原账对比。隔离原账／时长守恒与名称独立回归由Native提供；79项唯一聚焦通过（后续76／13项有交集，不累计）。截图仅存本地临时目录、不入Git。云端保留上传名称的既有代码通过25项发布读取与9项页面适配回归，未改Worker／Pages产品代码，因此没有无效重复部署。
- **仍未完成的独立项：** 本次运行后新增一条60秒缺名主体，本机及云端都输出“未归属应用”，并非页面再次覆写恢复名称。当前真实孩子策略投影、云端技术目录及其变体、分类与resolved名称均无对应主体；当前进程和本次已知安装组件也未匹配。普通权限不能读取受保护本机盘点库，尚不能区分该已退出主体是采集失败、未持久化、过滤或确无合法名称；不猜名称、不自动合并产品、不为取证新增接口或再制包。该项保留待精确本机元数据证据，不能宣称所有应用名称已解决。Mac标准任务`windows-mac-display-names-20261007-8529752`已通过Issue #12评论6026234208回读送达，尚无修复／实机回执；不以Windows结果代替Mac。名称恢复也不代表产品关联、分类或共享执行全部验收。

- **最新授权与实施边界：** PO已明确要求“修改并部署”，覆盖此前只读限制。Native所属会话修复实际名称元数据读取与派生版本重物化，当前会话核对云端是否保持上传名称；只修改显示名称，不改变原账、时长、分类、产品归属／合并或特殊应用角色。复用现有分支／目录，集中测试、提交和一个最终Windows候选；Mac公共源码及标准回传单列，Windows不等待Mac实机。最小回归覆盖未确认对象有安全名称、确认名称优先、同名不合并、用户隔离、缺名称、重物化后时长／原账不变。只有确实改动的云端资源需要发布；本机安装／云端上线／真实名称逐行验收分别记录，不把已下发任务当作修复完成。
- **云端名称链核对：** `applicationAccounts.ts`分块接收保留校验后的displayName并按行哈希持久化；`applicationStatisticsNative.ts:60–77/98–104`纯新版读取复制已发布行；`computerUsageService.ts:80`及`app-runtime-time.js:65–67`沿用上传名称，没有按产品确认再次改写名称。现有隔离回归`npm test -- test/application-account-publication.test.ts -t 'seconds|complete standalone usage|complete snapshot publishes before|replacement may lower'`通过25项（57项非本范围跳过）；`node app-runtime-management/console/app-runtime-time.test.js`通过9项，diff检查通过。首次测试被沙箱阻止写测试临时文件，合法提权后通过，不是产品失败。本轮尚未发现需更改云端产品代码的名称断点，不为部署而重复发布未变Worker／Pages；Native修复及真实新名称上传仍待完成。

- **此前只读诊断基线：** PO要求从Native本机开始查，不急于修改。实际Windows Host为2.6.38.0；当日正式`getApplicationUsageSeconds`成功、complete=true、10条应用中8条名称为“未归属应用”，2条有产品名称，证明错误在云端上传前已有。首次沙箱管道返回RUNTIME_SERVICE_UNAVAILABLE，合法只读提权后通过，不能把沙箱失败记为Service故障。
- **代码依据：** Native `ApplicationChildStatisticsReader.cs:76–80`将唯一confirmed/associated且ProductId非空作为名称显示条件，否则直接使用固定标签；没有读取本机盘点缓存、分类DisplayName或未确认投影CanonicalName。该逻辑由`3cd5a105`引入。`ApplicationAccountingV3.cs:11/194`原账只保存platform/runtimeIdentity，不保存采集名称；`MachineApplicationInventoryStore.cs:138–145`仍将Evidence.DisplayName随payload持久化。旧`ApplicationUsageReader.cs:253–268/540–583`有同用户盘点／规范名称／原名称读取回退，新孩子统计没有接入。字段未存入原账不单独构成错误，真正断点是其名称元数据读取未接线。
- **测试漏检：** ApplicationChildStatistics测试用例使用已确认产品夹具，检查时长、归属、版本和原账，不覆盖“有显示名称但产品未确认”的subject名称断言。不能将此前时长／上传通过写成产品名称完整验收。
- **结论范围：** 已证实本机输出异常及产生异常的统计条件；逐条盘点名称、分类名称、关联状态和采集质量仍待合法证据，不宣称本机盘点或8条具体归属已正常。直接访问Service目录被OS ACL拒绝，不改ACL／绕过；已交现有Native会话仅只读补核，不实施修复。Mac相同症状已见，具体实现及现场关联原因仍以所属端回报为准。
- **最小后续修复建议（未实施）：** 显示名称与产品确认分离：确认产品用规范名称，未确认对象按精确身份使用合法名称元数据回退、保持独立主体及未确认状态；不按名称合并，不改分类／时长／特殊属性。补对应固定名称回归并重新生成派生版本，不改原账、不修补云端文案。本机产品归属及特殊应用处理的实际影响另核，不能仅凭统计complete宣布全部正确。

## 2026-10-07 网页空登记来源拖垮电脑汇总（已上线，Runtime真实复验通过）

- **最终结果覆盖本节此前待授权／未部署记录：** PO集中批准PR #247实际24文件范围后，已合入master `edcb4def45280fe5d15262d936059f24ef7d728d`。精确主线的Guardian Integration `37532767825`、Runtime `37532767800`、Task Cloud `37532767741`及Task Console `37532767884`通过；生产运行[37532947865](https://github.com/william-xia-cn/timeonchrome/actions/runs/37532947865)成功，仅部署Guardian Worker `405861a5-4bfb-40bf-b37d-a7be239d3b98`。发布manifest已回读，Runtime Worker及两套Cloudflare Pages保持原版本，migration数组为空，sharedAccessShadowPrepared=false；无安装、R2操作或共享启用。合并另触发既有GitHub Pages自动流程`37532765516`，目标为仓库GitHub Pages，非两套Cloudflare控制台；本PR未改页面源码，不隐瞒该既有自动副作用。
- **真实登录验收（2026-10-07当日、Mac目标孩子）：** 独立Runtime页面刷新后computer接口HTTP200、schemaVersion=2、seconds、complete=true，两来源均complete、reasonCodes为空；网页13秒＋应用2389秒－特殊应用已包含贡献0秒＝电脑2402秒（40分2秒），页面实际呈现一致。独立应用接口HTTP200、complete=true、2389秒，revision与computer应用来源版本逐字一致，结算截止北京时间04:54:15.208；有效来源值未被本次来源范围修复改变。截图保留本地临时目录，不入Git。真实主控制台重新进入时登录已过期，故其本次发布后目视复验仍未取得，不用Runtime结果冒充两页面均已复验。
- **独立展示缺口：** 当前已上传产品行的displayName为“未归属应用”（2368／21秒）；云端读模型及页面沿用上传行名称，不是本次故障隔离生成。产品关联／名称原因交所属Mac端继续核对，不按同名猜合并、不更改原统计。本次确认仅为电脑汇总可用性恢复及应用来源同版本，不代表产品名称、长期诊断稳定性或共享执行全部完成。父清单显式映射仍为取证展示缺口。Matched＝修复／主线／Guardian发布／Runtime真实读取；Missing＝主控制台发布后实视、产品名称归属及长期诊断证据；Deviated＝无本轮未批准产品变更；Extra＝既有GitHub Pages自动流程如上单列。
- **Mac标准回传已完成：** 经现有Native协调任务，发布结果及仅名称来源只读核查已发送至原Issue #12，[评论6025769295](https://github.com/william-xia-cn/TimeWhereNative/issues/12#issuecomment-6025769295)由当前会话GitHub插件独立回读；固定中继文档Native `df2edbdab1aca86bf55596f736e5a3f79053551f`。仍是原Mac任务，不新建开发会话／分支／工作树、不要求重装；尚无Mac本条名称核查回报，不把送达当作实施完成。

- PO要求当前会话修复并验证后，再向Mac回传确认；Mac不重复安装。职责standard-cloud，允许本任务`workers/src/services/computerUsage.ts`、`tests/unit/computer-usage-cloud.test.js`及本任务板；复用现有云端分支／目录，不改契约、原账、独立网页统计、Native／控件、配额或共享开关。
- 实施清单：①成功查询确认该设备日在V2与现有兼容统计均无记录时，不仅凭设备登记生成失败统计来源；真实读取异常或已有不完整清单仍保留失败／部分状态。②整个网页范围无记录仍为未知、总量null，不填零；有记录的解绑设备历史继续读取。③旧展示缓存换读模型版本，避免采用修复前来源判断。④回归真实脱敏五来源组合、无来源、完整零清单、不完整／异常、解绑历史、重复读取及原权威值不变；运行此文件测试、typecheck、职责diff和diff check，不跑平台／安装器／全量／浏览器行为测试。
- 变更等级为中等展示读取修复，不触及网页记账／物化／上传；修改统计来源可用性判断而非其秒数。修复源码、合并部署、真实页面以及Mac回传分别登记，不把本地测试称为线上已解决。
- **源码验证通过：** `node tests/unit/computer-usage-cloud.test.js`、`npm run typecheck`、本次3文件standard-cloud职责检查及`git diff --check`通过。新增固定用例覆盖1有效＋4空登记、全无记录仍null、真实零清单、不完整/loss/查询异常、解绑历史及迟到新来源版本失效；既有原权威值／家庭隔离回归保留。首次测试因既有VM加载器遗漏新增source-statistics契约模块停止，补齐仅测试映射后通过，未调整产品时长。Matched＝本次来源范围、故障隔离与缓存失效；Deviated／Extra＝无；Missing＝主线集成、Guardian部署及真实Mac孩子页面复验。Mac不需要改代码／再安装。
- **集成／发布实况：** 修复提交`c3390e80852841f34225aba98e9a59e75945427d`已推送。现有云端分支合入已发布master，集成HEAD为`0954b87ee942c5048208aa60e77c3897a83719a4`；[PR #247](https://github.com/william-xia-cn/timeonchrome/pull/247)明确列入此前批准的1.39.1可选分域读取与本次修复，共24文件，未冒称只合入3文件。未创建分支／工作树，未触动master脏目录。第一次CI失败是PR遗漏职责声明，补正后职责、契约／Runtime Worker、Console、发布配置及Guardian兼容检查通过；Guardian dry-run通过。无关Task Console仍在安装Chromium，未作为本次产品测试通过证据。合并工具拒绝该24文件实际范围，要求明确授权；已集中请求“合并此PR＋仅部署Guardian＋真实验收＋Mac回传”，不绕过权限。当前尚未合并／部署／线上复验，不能向Mac确认线上通过。仅Guardian部署，不部署Runtime／Pages／终端，不执行migration、不改变执行开关；可选新API集成不代表Windows／Mac共享已验收。

## 2026-10-07 Mac优先接续（0.1.40已安装，诊断有限实机通过）

- PO要求优先Mac。本轮职责为architecture-integration／standard-cloud只读核对与现有任务协调；不修改Native／控件、不新建分支或工作树、不安装部署、不启共享。最小检查为固定提交证据、实际页面响应、调用链及`git diff --check`，不跑无关产品测试。
- **最新回执覆盖本节早期“诊断待安装”：** GitHub插件实时回读[Mac评论6025058593](https://github.com/william-xia-cn/TimeWhereNative/issues/12#issuecomment-6025058593)及固定`77386dc0f20b15e282669088ece58ceb2b6d1afa`安装验收文档。Mac已从0.1.39升级0.1.40，源码`00ed08fa17afb6eab464906c15d931656707b6d9`；ZIP SHA-256 `bec743359f86e39072ad9a80b2186d67d7c72e7f49b24fd48b61ad97d5de9619`，manifest SHA-256 `57ef723f71109b426adb8aa550824ccd41e671da81ddee48f195bf4ff06a0a9e`由Mac固定回报。本机120秒有限观察status/applicationSeconds各14/14成功，新Manager正确显示历史status失败；配置、绑定、保护和额度保留，Chrome主进程未关闭或重开。诊断本机日志摘要可读且远程关闭，本次没有自然失败，新增原因码实际落盘计数未知。此证据不等于长期稳定或全部功能验收；不再要求重复候选/安装。当前会话核对固定回执，未在Mac代做实机操作。
- **最新依据覆盖下方早期“待领取／安装未核实”状态：** 独立回读Native固定`e6f43cffd52949878394307f41894ef159bbf762`的Mac安装验收文档及脱敏JSON。Mac实际0.1.39，生产源码`6542050469f56deef19539c3d8cec786bc9c7ee2`、契约1.38.0；自然纯v3事实→冻结清单→精确ACK/发布→Manager秒读取已通过一次实机核对。登录后两套云端应用页面同已发布快照的秒量、分类及截止一致。不能据此声称所有历史、最新本机head或共享通过。
- **当前云端复验：** 已登录Runtime正常切换Mac目标孩子、当日；电脑汇总真实HTTP200、schemaVersion=2、seconds，`sourceStatus.application=complete`、`sourceStatus.web=partial`，唯一原因`WEB_STATISTICS_PARTIAL`。随后真实`/v2/module/app-usage` HTTP200、seconds、complete=true、当日原因为空；该响应revision与电脑汇总的application来源revision逐字一致，固定已发布快照没有混用。有效两侧数值及分类保留，完整电脑总量未伪造。此结果不是应用v3上传失败；不要求重新安装或清队列。
- **父清单映射审查：** `applicationStatisticsNative.ts`日读取确实保留父清单revision/hash/cutoff，范围读取只把它们hash为视图revision并返回日期截止；`computerUsageService.ts`及两套页面没有完整父清单引用。视图revision与Native父revision语义不同，不要求相等，也不把更晚本机pending head与更早页面发布截止强行比较。缺少显式映射属于精确取证展示缺口，不能升级为统计可用前提。
- **网页实际缺失来源已定位（2026-10-07，只读生产核对）：** 沿现有Runtime会话读取当日v1来源版本，5个网页来源中1个有有效清单及13秒主使用，另外4个revision=`missing`、截止为空，根原因为`WEB_ACCOUNT_UNAVAILABLE`，不是清单loss或RPC失败。再用已有家长会话读取绑定设备，按既有来源哈希映射而非名字猜测：有清单的来源是当前Mac；4个无清单来源中1个为仍绑定的旧Windows控件，最后在线北京时间2026-09-03 02:51:12；另外3个不在当前绑定列表。`readComputerWebEvidence`第57行查询所有登记设备，未区分绑定状态或所选日有无来源记录；第77行把无head且无统计行的设备日作为不可用来源，第142行又要求所有来源完整。因此旧／闲置登记拖成网页partial，秒汇总只给总码，掩盖具体来源；当前有效网页13秒仍保留。不是Mac应用上传失败，也没有据此证明网页丢账。最小后续修复限于云端展示读取的来源范围及状态：区分“当天无统计记录”与“已上传清单不完整／查询失败”，不填假零、不丢已有解绑设备历史统计、不改网页原账或上传。源码修改／发布尚未执行。
- **Mac诊断修复：** 独立回读`1414a22b32624d71e13ae972ccecb49184cd74f3`，已修可确定性复现的status策略上下文刷新竞争（最多重读一次）及历史失败误归为当前能力拒绝。所属端报告Portable31／Swift26及编译通过；实际仍0.1.39，尚未签名安装这些修复，不能声称现场18次中2次失败根因全部确定或已消失。留待一次最终候选统一实机，不重复安装。
- **标准交接：** 经已有TimeWhere Native Host协调原`MAC-V3-ONLY-INTEGRATION-20261007`，API范围证据补充已送达[Issue #12评论6024912489](https://github.com/william-xia-cn/TimeWhereNative/issues/12#issuecomment-6024912489)，固定Native文档`c4f4e22b1f85137c7980015e414df2862ea3b33d`；本补充实际领取/完成待回执。原任务此前领取6023519643；诊断修复回报6024565923已核对，不再让Mac重复开发已修路径。
- **收口判断：** Matched＝Mac已安装、局部原账/发布/两应用页面证据及0.1.40诊断有限实机，网页4个缺失来源已通过真实来源版本与绑定列表定位；Deviated＝云端展示将旧／闲置登记无当日记录统一当成统计缺失；Missing＝该读取口径修复、父清单到页面显式映射；Extra＝无本轮新业务改动。下一项是云端展示读取修复，不等待Mac重新安装或重复应用链验收；父映射仅取证缺口不阻断使用。长期稳定性、旧物理数据及其他未验证场景继续单列，不阻断当前应用链路。Windows新1.39.1共享影子源码不能替代Mac1.38.0安装证据。

## 2026-10-07 Windows对称共享读取（源码及聚焦验证完成，真实联调待验）

- 当前应用纯v3原账→秒统计→自动上传→云端页面链路已验收，本批不重做。共享执行保持关闭。
- 实施清单：①集中定义分域整数秒统计、同来源版本替换、桥接交换及独立核算契约；②云端复用现有持久统计和鉴权，提供全量／排除本机来源读取；③Native接入Child范围新版秒head，自己的本机＋云端其他来源，网页桥接／云端／最近成功缓存三选一；④控件对称接入，沿用现有串行桥接，不改网页记账或上传；⑤集中源码及聚焦证据，最后一次候选联调，源码／部署／安装／实机分开登记。
- 已证实断点：RuntimeServiceCoordinator的共享actualUsage仍调用只接受schema1毫秒的ReadActualUsageHeadAsync；旧SharedQuotaExecutionReader仍要求混合basis、本机云端旧副本及替换匹配。本批退出这两个前提，不另建摘要账、不重算原账、不降低孩子隔离。
- 职责：当前architecture-integration维护共享契约与核算黄金用例；标准云端实现Guardian／Runtime分域读取；TimeOnChrome-Extension和TimeWhere Native Host分别改实际消费者。复用现有目录／分支，保护未提交内容。
- 验证契约：中等跨端只读查询改造，运行契约build/typecheck及对称查询固定用例、相关Worker路由／隔离测试和typecheck/dry-run、两端对应消费者聚焦回归、范围及diff检查。排除安装器、Mac、无关页面／全量测试、原账及上传改造。验收网页600＋普通应用600＝1200秒，特殊／other不扣三类，同源替换可下降、云端无本机副本、启动顺序、离线缓存、改绑／周期隔离，无循环查询或二次累计。
- 无migration、安装、生产部署、R2或限制启用；必要最终候选与实机联调状态另记。历史P2和Mac不阻塞本批。
- 最小CI接线：新增分域云端回归纳入现有Guardian Integration任务及精确路径触发；复用现有CI路由固定用例检查，不新增工作流、发布门或全平台测试。
- **契约及云端源码已完成：** 固定1.39.1契约提交`adb1f2089ab0f8f4adf7c1b0a6e3761656e33f7f`，tgz SHA-256 `f3c4d551d570fd1ba88fc64f040b5e3f36967d79236796d22337981a9141ff42`；1.39.0只是开发暂存，不作最终锁。新增机器`/v2/machines/source-statistics`、设备`/device/source-statistics`及受限Service Binding操作，身份均由既有鉴权确定。应用只取已发布纯v3秒清单/日total/非特殊分类，网页复用现有V2 compact及本周更正只读投影；无新摘要账、原账重算或旧本机云端版本匹配。全量及精确排除均为分域结果，不含余额。
- **本批证据：** 契约build/typecheck、兼容与独立核算聚焦通过；Runtime实际隔离D1/机器路由原两文件31项通过，随后补齐Service Binding真实入口、Guardian家庭归属核验和响应域，新增文件6项通过（原应用清单26项未受此补验改变）。Guardian实际V2投影/更正、日小时目标不重复、辅助媒体排除、设备累计、下降替换、鉴权/改绑、应用备用Binding及64KiB响应限制回归通过，既有device shared access policy回归通过。两Worker typecheck、dry-run、源码边界及diff检查通过，不以这些结果声称生产或终端验收完成。云端功能提交`f3b506ed37ef4cd0da7c52d5d7516bf8ffdf84a9`已推送原工作线，不自动合入主线或部署。
- **Native源码完成：** 完整接线已提交推送`cccafebb5e4911bdfd623a4a83cef4becd9667e4`（接续来源读取器`30e49a5`）：实际Service桥接交换、本机最新＋精确排除的cloud-other、网页peer／cloud／LKG互斥、独立策略缓存和30秒周期影子已接入。根任务独立核验固定1.39.1包哈希、干净工作区及73/73聚焦TRX；Service／Manager／Host编译由所属任务报告通过。复核修正LKG保留原完整性、周内缺日不抛弃当日本机最新；新交换本机／HTTP各3秒、Service含排队8秒、Host转发12秒，旧消息不变。
- **控件源码完成：** `806abac5c47a492316708251990c66fe92ea85cf`已推送原`codex/integration-access-20261002`工作线，无新建分支。串行桥接只接受匹配请求／当前连接的shadow应用响应；网页只取现行V2模型的本机`local.today`，与真实web/other快照按固定契约合并，不能把V2旧合并数配上另一接口来源键。失败只复用同范围other缓存，本机每轮重读；应用优先Native、其次cloud-all、再LKG，网页失败仍可读取应用。实际background启动／激活及5分钟定时入口已接线，缓存陈旧来源、读取时间和截止与统计完整性分开；身份／日期范围变化防旧响应写回。来源影子、Native协议、既有V2配额12/12及边界／语法检查通过；根任务核验生成JS与1.39.1产物逐字节hash一致。全项目typecheck最初被旧1.38.0声明产物阻断，只重建该ignored dist后根任务实际typecheck通过，未改契约定义、版本或固定包。
- **审计与待办：** Matched＝契约／分域云端入口／两端真实调用接线及上述聚焦源码证据；Deviated／Extra＝无未批准产品改动；Missing＝主线集成、两个Worker发布、唯一匹配候选及Windows同孩子／当日真实交换和余额核对、断线重启现场验收。源码通过不等于后者通过。新读模型仅作诊断／影子，现有网页V2配额决策不被替换；不新增仅提醒模式。最终候选未生成，未部署、未安装，原账／上传／现行执行及旧加载目录未改。两端源码工作区干净；云端原契约tgz、`.wrangler`等未跟踪产物原地保留、不纳入提交。下一批只安排一次匹配候选联调，不重跑已验收的应用原账上传链或历史P2／Mac。

## 2026-10-07 P2遗留登记与Mac应用新账链路接续（PO要求）

- [ ] **P2／延期：Windows本地遗留应用数据物理清理。** 暂留旧v2原账7,786条、旧published-day 13条及child版本/outbox各21条，分别为已证明家庭历史范围外或模型未证实。已退出新统计读取和旧应用补发，不阻塞Windows当前日链路、功能交付或后续共享开发。保留现有受限恢复证据；将来仅在归属／模型证据充分后按精确范围清理，不猜删、不恢复旧账兼容、不为此重新发包。不得将物理暂留误报为新统计不完整。
- **Mac已核实状态：** 2026-10-07重新读取Native Issue #12全部回执、Mac固定交付文档及实时远端分支；`codex/macos-session-signals`仍为`98fdd3b8d0b94e31dca894d390b330ecc9a83e50`。该交付接通认证会话→固定Child ID原账→整数秒head/outbox→唯一上传器／ACK→Manager读取；Portable 1.37.0／1.36.0各190项、Swift 18项及Daemon／ManagerBridge／Manager编译由Mac报告通过，属于源码／隔离证据，不是生产验收。该实现仍含旧账兼容读取和旧平台算法，已被“仅v3新账”决定取代。Issue #12已有纯v3任务及源码补充，但本次核对尚无Mac领取／完成新任务回执；Windows发出的in_progress不能算Mac领取。此前0.1.36安装回报只作历史证据，当前Mac安装版本未核实。
- **Mac工作计划（接续原`MAC-V3-ONLY-INTEGRATION-20261007`，不新建重复任务）：** ①复用现有Mac分支和已完成孩子接线，按固定契约1.38.0及其哈希接入纯v3读取／算法、旧应用生产与上传退出、revision水位；保留Mac认证socket、平台参数、启动／上下文和既有守护修复，不整仓覆盖Windows实现。②集中运行受影响原账／统计／上传／ACK／读取聚焦回归及Swift／Daemon／ManagerBridge编译，核对Child归属、180秒切片／90秒容错、秒单位、版本替换下降、重启恢复、合法未归类及本周最新分类；先补实际缺项，不重复开发已通过部分。③源码及测试完成后只准备一个最终Mac候选，明确源码SHA、契约／产物哈希、当前安装与待安装区别；按既有授权安排实机阶段，固定孩子、日期、截止核对新原账→本机持久统计→自动上传／ACK→云端可读→两套真实云端页面及Manager。云端现有兼容接收已上线，不预设需再次部署。
- **交付判据及边界：** 当日有效新统计能自动上传并被页面采用，固定截止的总量／分类可对照；统计延迟与新截止增长不当作错误，真实新账问题如实报告，历史缺口不阻塞。旧物理数据处理只先审计／dry-run，不能证明安全删除的同样列P2且不参与新统计；真实删除、安装、系统权限或真实执行动作按已有专项授权核对，不由本交接扩大。共享保持关闭；不顺带做共享、守护新功能、Chrome重启调查、历史还原、Task／Santa、迁移或R2操作。锁屏／休眠、多用户及完整重启等未取得实机证据单列，不伪称通过、不改现有验收要求。
- **职责与验证：** 当前会话仅更新现有任务板并检查已回报证据；通过已有“TimeWhere Native Host”会话更新现有Mac交接文档、提交固定来源并经Issue #12标准prepare／sync转交。必须回报远端评论链接及送达回读，区分已发送、Mac已领取、源码完成和实机通过；发送不等于执行。本次文档／计划级，最小本地检查`git diff --check`，不运行产品／浏览器／Windows／Mac测试，不安装部署、不新建分支或工作树。
- **实际交接：** Native已提交推送`a833428bd0f6a81d57754179e8291437e3dfa5f6`，更新现有Mac计划及Native任务记录，并用标准prepare／sync发送修订事件`windows-mac-v3-only-plan-final-20261007`，关联原任务。当前会话独立用GitHub插件回读[Issue #12评论6023390644](https://github.com/william-xia-cn/TimeWhereNative/issues/12#issuecomment-6023390644)，固定SHA／文档及边界一致，送达已确认；截至本次回读仍无Mac领取／完成新任务回执，状态为已送达、待Mac领取，不自动重启已结束会话或冒称Mac正在开发。

## 2026-10-07 退出旧应用账，仅保留新v3（PO批准，执行中）

安装、实际清理与Windows链路：正式六组件均2.6.38.0且逐文件hash与唯一候选一致。云端最终切换恢复包包含14表32,366条旧应用记录，逐条隔离恢复一致、integrity_check=ok；备份manifest SHA-256 `2412f667946ee4a33f3f8c5c57482cdf85fde87a62f2d901b65045bb11f2c25b`，精确SQL SHA-256 `d3a80fcc0c9c6889dc218cac75faba37c8b47221199cbe023c398d0559680c37`。已执行经批准的12语句事务，14旧范围均为0，退出登记与旧数据防回流已生效；恢复备份留在受限本地，不进入Git或云存储。早先备份后的7条晚到旧数据补入新包并重新验证，保护条件未放宽；先前并发保护、OAuth与Windows命令长度/参数问题均未造成提前删除。

Windows同一次管理员维护已完成Prepare、静止备份、Verify、Apply及Service恢复Running。实际scope SHA-256 `aaf8cb2614acad19c090511bfcd5db8008ea79c2e84c6bb5bcd2c2adcbe08bb7`，恢复manifest SHA-256 `80c21ccc27bd21471cdeb48eb182c31712651cb858a067a32671e18fd08e0922`。已删除7,608条旧v2原账及相关旧派生记录，合计26,145行；Apply回执明确applied、新v3/续段/outbox等非目标表事务内逐项保护、机器身份文件不变。暂留7,786条超出已证明历史范围的旧v2原账、13条旧published-day及child outbox/versions各21条无法证明模型的记录，不把它们猜删，也不声称本机全清；这些遗留不再参与新统计或旧补发。Mac本机实际清理由所属端回报。

2026-10-07 Windows同截止真实核对通过：正式Native Host、云端纯v3已发布revision45及真实主家长控制台application HTTP200均为6,232整数秒（1小时43分52秒），complete=true、无缺失原因，结算截止北京时间02:07:22.618；分类学习2,497秒、未归类3,735秒一致。云端原清单非特殊2,638秒、特殊3,594秒；不是按显示名称反推。Host view revision与云端父清单revision语义不同，不要求字符串相等；使用同范围、截止和实际数值核对。随后从已有登录主页面正常SSO进入独立Runtime页，实际app-usage HTTP200、seconds、complete=true，页面6,413秒、截止02:11:52，与同期云端已收到/发布revision47、6,413秒及截止精确一致；属于正常滚动新快照，不把不同截止差额当故障。旧清单及旧v2原账复查仍为0。两套真实页面已正常采用仅新账持久统计，先前00:00:03截止来自退出前旧来源，清理后已显示正确当前截止。共享未启用，不把本次应用链路通过称为共享验收通过。

生产执行进展：PO集中批准PR #246合并、Runtime Worker/两套Pages部署、专项0016及备份核验后的当前家庭旧应用云端清理。PR已合入master `fc57d06853c3b13060a3d18d3921d8430582f159`，精确SHA相关CI通过。真实家庭范围已通过Guardian账户关系核实，不把Runtime单一已同步孩子误当完整范围；身份、范围清单和数据只留在受限本地备份，不写入仓库。白名单14表旧应用记录已保存受限备份；150个备份文件回读SHA通过，隔离SQLite逐条内容恢复一致、integrity_check=ok；未导出鉴权/配对/配置表。备份期间旧客户端仍上报旧格式，备份stable=false，不得据此直接删除；最终清理前须补齐并核验稳定范围，不能绕过并发回滚保护。真实云端/本机删账尚未执行。

本批已应用且仅应用0016，部署Runtime Worker、独立Runtime Pages和主Pages；具体资源记录留在已授权发布运行及本地证据，不在本条写入运行环境标识。Guardian、网页/媒体数据、配对、配置、R2及共享执行未改变。发布运行整体failure：末尾主Pages smoke过早读取旧脚本，自动发布清单步骤未执行；随后两套线上computer-usage-view.js及Runtime主脚本/时间脚本与发布SHA逐字一致，Runtime健康HTTP200、迁移列表无待应用项，资源核验记为PASS_WITH_MANUAL_EVIDENCE，不把流程失败改成绿色、不重复部署同代码。家庭退出标记尚未写入，不能把0016上线称为旧数据已清理。

源码收口：Windows所属任务已推送`e67f7c1e238430ca8f81b186a93b8b45882caaf6`，根任务只读核对提交和干净工作区。生产只读v3、新模型重物化及持久revision floor、旧应用生产/直接上传/旧队列退出已实现；旧毫秒响应仅投影新秒结果。所属任务报告108项唯一C#聚焦、8项隔离SQLite/dry-run及固定1.38.0 JS哈希/新算法验证通过。唯一内部未签名候选2.6.38已从含修复的固定提交d105e6c构建，13个发布组件/11个MSI组件及升级标识由所属端核验，根任务回算Burn/MSI/manifest及六组件安装证明哈希匹配；尚未安装或真实清理。安装入口已交付，升级后才进行最终稳定备份与清理。Mac正式交接已登记到Native Issue #12，实际执行与实机结果待所属端回报。

云端：仅退出登记家庭拒绝旧原账/清单/贡献重放，旧派生回退/重物化退出；保留新清单/ACK及单调水位。维护工具只列白名单旧应用表并有界导出，排除凭据、配对和配置；清理与标记原子提交并复核已备份范围，发生并发新增则整批回滚。0016已在生产应用，不执行其他生产迁移。两套云端渲染器一致，无新账明确“无新版应用记录”，未发布量为未知而非0。最终5个相关D1测试文件149项、页面时间/渲染/组件、typecheck、dry-run、路径边界和diff检查通过；桌面/390px隔离目视显示空历史未知与新51秒明细正常，未使用真实家庭数据。

Matched＝决策/设计、Windows仅新账源码及最终候选实际安装、云端接收/读取/防回流、精确已证明范围、可恢复备份、云端实际清理、Windows已证明范围实际清理及原新账/身份保护、Windows当天Host→发布→真实主页面同截止对账、独立Runtime页仅新账读取及同期发布对照；Missing＝Windows未证明可删除的本地遗留、Mac本机执行与实机回报。Deviated＝发布运行传播期smoke失败，后续只读核验补足资源证据；Extra＝无范围外业务改动。内置浏览器原拒绝规则未绕过。早先阶段“尚未安装/清理”的记录不作为当前状态；源码、部署、安装、物理清理和真实验收分别记录。

职责standard-cloud／架构契约统筹，复用云端旁路；Native所属会话负责Windows与Mac交接。本批高风险数据清理，仅当前家庭全部孩子／电脑的旧应用账、旧统计、上传状态及缓存，精确身份从真实鉴权范围核对，不按名称猜测。实施清单：①决策与设计先行；②Native只读v3、重物化及受限备份/本机清理；③云端旧上传防回流与新统计唯一读取；④固定家庭、机器及旧数据清单，备份后才精确清理；⑤新账→统计→上传→云端→页面固定截止核对。保持新v3记录／outbox／续段、revision、网页／媒体、配对、配置和其他家庭不变，共享关闭。不创建分支／工作树，不全库重置，不修历史或假造完整零。最小验证为Runtime真实D1隔离清理／旧上传／新清单／家庭隔离、相关读取及页面渲染、typecheck／dry-run／边界／diff；Windows相关测试由所属端执行，Mac实机单列，不跑全平台。源码实现、部署、清理、安装与实际验收独立记录；当前尚未删除生产或本机数据。

## 2026-10-07 应用读取兼容修复：已合入、已部署，Windows 云端页面已复验

PO 已明确批准后，PR #245 合入 master `c03b4f5583b9d1bb1a8a70142ad09e4e69ad33c4`。该精确 SHA 的 Runtime `37490253848`、Guardian `37490253787`、主控制台 `37490253806` CI 通过。生产运行 `37490586205` 已实际部署 Guardian `0941ced0-e9ec-4429-974e-b128a8f5e8fc`、Runtime Worker `d09576f8-76cf-457c-9c5b-d80aa628fe70`、主 Pages `https://a34bc742.timeonchrome-console.pages.dev`；未部署独立 Runtime Pages，未执行 migration、R2 操作、安装或共享启用。

发布运行整体结论仍为 failure：主 Pages 上传完成约一秒后，脚本逐字 smoke 读取旧内容而失败，后续发布 manifest/artifact 步骤未执行。随后生产 JS 与该 master Git blob SHA-256 均为 `35fc5132049f40e14a9c5b55f32f52fbd0fddc3b0a143c45101c82ceea93bed7`，线上 HTML 明确请求应用秒统计，真实登录页面正常读取。资源上线与后续核验记为 `PASS_WITH_MANUAL_EVIDENCE`，不把工作流失败改写为绿色；页面发布传播期的有界内容重试作为后续轻量 smoke 缺口，不通过重复部署掩盖。

真实 Windows 孩子、2026-10-06 日视图：主控制台应用来源 HTTP 200、seconds、producer=native；页面正常显示有效部分 13644 秒（3小时47分24秒）、分类、小时及9个产品，而非所有行均不可用。独立 Runtime 页面同日手动刷新亦显示13644秒有效部分。两次读取的范围/截止单独保留，不以相同已知量冒称整日完整或完全同版本；总量仍为 null/complete=false，既有开发版本数据缺口未被修复或伪装成零。设备管理真实列表可用，网页页签隐藏应用面板并能读取原网页统计。跨午夜后回到固定10-06范围，00:03:44主页面有效部分更新为13892秒（3小时51分32秒），分类/产品仍正常；部分来源的汇总截止仍显示23:02:37，不能据此宣称所有来源截止一致。CDP暂存响应正文已失效，未重复取旧正文或用页面数值伪造新的接口证据，后一次只作为真实页面更新证据。

Matched＝本批读取单位兼容、依赖部署、真实 Windows 云端明细恢复；Missing＝控件内部实际页证据、完整日总量、T.xia/Mac独立复验；Deviated＝发布 smoke 在传播窗口过早比较、整体流程 failure，后续手工证据补足资源核验但未生成该次自动发布清单；Extra＝无。共享准确性/执行、历史 P2 与既有 P1 不在本批修复范围。原先等待合并批准/部署的状态已解除，以下为此前阶段记录。

## 2026-10-06 应用读取兼容与部署依赖修复（此前阶段记录）

集中PR #245已建立，head `0865ffe8bf7254eed9e62d095536e4b55a7b5b95`，14文件；App Runtime `37489292949`、Guardian `37489210701`、主控制台 `37489210656`及相关既有检查通过。首轮Runtime因PR范围例外标签拼写错误未进入产品测试，修正描述后同一代码SHA通过，不改或弱化检查。工具自动审核两次拒绝合并当前PR，要求PO明确批准#245；未以CLI/浏览器绕过。复验PR仍open/merged=false，生产workflow仅手动触发，不把合并模拟SHA或绿色CI当作已上线。发布差异已核对：相对最新Guardian来源`b146cd7`只有本批两个读取文件，Runtime相对已发布`07354def`只有本批读取及回归，主Pages相对`d41d5d1`为既有已验证秒渲染器及本批读取参数。当前仅待当前PR合并范围确认后指定资源部署和Windows实机复验；T.xia/Mac及控件内部页证据缺口单列，不复测历史数据、不安装或追加功能。

PO批准修复已证实的云端读取/部署问题并继续Windows核对。T.xia属于尚未完成的Mac链路，其报错待Mac完成后单独复验；此前其他孩子HTTP200不证明T.xia恢复。本批职责standard-cloud，只改Runtime内部读取、Guardian只读路由/适配、主控制台读取参数、已有CI和相关测试。不改原账/统计生成/配额/扩展/Native，不创建分支工作树，不执行migration或启用共享。

实施清单：旧请求固定旧毫秒字段，新秒统计只做响应投影，不新增持久副本；新应用请求显式选择seconds；保留范围核验稳定错误码；现有统计渲染测试接入对应CI。最小验证为application-account-publication、computer-usage-evidence、computer-usage-cloud、computer-usage-view、main-console-release-stage和相关typecheck/dry-run/diff，不跑全平台。发布依赖包含实际修改的Runtime Worker、Guardian、主Pages，发布和真实Windows同孩子/日期验收分别登记；历史P2、共享和Mac不扩大处理。

源码修复与聚焦验证：Runtime旧调用固定返回毫秒兼容投影，显式seconds调用读取同一持久化秒统计；Guardian仅允许application来源选择seconds，并保留APPLICATION_SCOPE_UNAVAILABLE稳定范围错误；主控制台显式选择seconds。原秒渲染器未改，复用其既有桌面/移动结构证据，新增读取参数与CI接线回归。两个Runtime真实D1隔离测试文件97/97通过；computer-usage-cloud、computer-usage-view、main-console-release-stage、app-runtime-ci-routing、源码边界检查、两套TypeScript及Runtime dry-run通过。首次D1测试因本地Vite缓存写权限未启动，合法提权后通过，不记为产品失败。生产主Pages既有smoke补齐实际JS与受测源码逐字比较，不只检查HTML200。Matched＝本批兼容修复及聚焦测试；Missing＝合入、指定资源发布与真实Windows页面复验；Deviated/Extra＝无。未提交的契约包和.wrangler目录原地保留且不纳入提交。

## 当前：Windows 当日秒统计本机至云端页面已核对，控件实际页面待验（2026-10-06）

23:01用户反馈`COMPUTER_USAGE_UNAVAILABLE`后追加真实主控制台核对（不是控件内部页）：同孩子/今天点击“应用使用”，Guardian `/profiles/:child/computer-usage/v1?source=application`实际HTTP200，producer=native、durationUnit=seconds、availableTotalDuration=10612、分类/产品行使用duration。页面却将每条时长显示“不可用”。刷新后直接读取浏览器实际加载的`/computer-usage-view.js`（16230字符）：不含秒格式分支或availableTotalDuration，independentSummary仍只读durationMs/totalDurationMs，已证线上主Pages旧消费者与新秒响应不匹配。master现有`fdb5dbe`已包含秒/partial消费者，但此前仅部署Runtime Worker/独立Pages，主Pages及Guardian排除在该次发布范围；不能把本地源码已修订当主控制台已上线。此次两次应用/电脑查询均HTTP200，用户报告的通用错误码没有在当前现场重现，不将旧单位显示缺陷冒称该503错误的唯一根因。主控制台读取/发布待办与已通过的独立Runtime页、正式Host当天链路分别保留；后续发布前核对主Pages秒汇总所需Guardian接口依赖，不盲目只换脚本。没有修改产品代码/部署/安装或追共享P1。

22:53—22:58真实只读验收：正式Service、SessionAgent、Manager、Host、Core与Infrastructure六组件均2.6.37.0且与唯一候选哈希匹配，Service Running。正式Host通过Native Messaging framing协商`application-usage-seconds-read-v1`；今天/本周至今请求均通过1.38固定validator，耗时257/209ms，响应4799/5192字节。Host与当前用户合法ApplicationSeconds管道回读的范围revision、完整性、nullable总量、known量与截止精确一致，持久head修订486，今天已知10125整数秒，结算截止`1791298349401`（北京时间22:52:29.401），完整总量null，sole reason=`APPLICATION_MIXED_LEDGER_COMPATIBILITY_MISSING`。脱敏证据位于Native本地`.tmp/windows-candidate-2.6.37/installed-host-seconds-results.json`和`host-pipe-matches.json`，不保存真实SID/Child或凭据。

同一登录云端页面实际点击“刷新应用”：`/v2/module/app-usage` HTTP200、durationUnit=seconds、availableTotalDuration=10125、totalDuration=null、当天截止同为`1791298349401`，8个产品/3个分类正常展示，页面为“Service权威秒统计”和2小时48分45秒部分量。分类为复合360/学习5060/未归类4705秒；原始明细与完整总量未混同。此项已证明当前日持久统计→云端采用→真实页面同截止一致；正式Host读数也一致，不代表共享已启用。

周视图真实读取继续保留历史差异：云端10-05已有已发布42780秒，当天新版本随后为10389秒，显示部分53169秒；本机新秒接口10-05没有新head而返回unknown，不冒充同范围周一致。页面包含10-07至11未来日期并标记缺统计、总截止显示“尚未同步”，作为周展示/历史兼容缺口登记，按PO先贯通当前日、不追开发历史的范围不在本批改代码。真实仅8个应用，100+多页仍只具固定合成证据；持久ACK/outbox未独立回读，不用云端采用证明替代该字段。

控件运行验收仍缺失：用户已确认1.7.45原目录重载，但浏览器工具明确拒绝Chrome内部页及`chrome-extension://`协议；未以CDP、其他浏览器、代理或存储旁路绕过。磁盘候选/模拟渲染不能冒充实际Admin验收，已仅请求普通“应用使用→今天”截图，无需Service Worker、重新安装或配置。Matched＝六组件/真实本机秒读/当天云端采用与页面同截止；Missing＝控件实际页面；Deviated＝周历史/未来日期状态尚未统一（单列）；Extra＝无。多用户/改绑/锁眠/完整重启与Mac仍延后；本批没有安装、部署、migration、配对/ACL/原账/策略修改或共享启用。

PO回复“已安装并重载”后恢复真实验收：root只读注册Service路径/文件版本/哈希确认2.6.37.0，Service Running，Service SHA256 `52e7dcb922ef18480f9d2f891418e88f835b1173b797d4e7d340334424f0d334`。原安装等待阻塞已解除（下条为旧阶段记录）。当前继续正式Host→Service秒接口及控件页面、云端同范围读取核对；两端所属会话已收到只读实测交接，不再安装/重构/发包、不修改原账/配对/ACL/策略或启用共享。实际多用户改绑、锁眠/完整重启及Mac仍按已批准缺口延后；真实多页若不足100只保留固定夹具证据。

运行验收阻塞登记：候选交付及后续两次自动续跑均未观察到2.6.37安装生效，最新只读回读Service仍2.6.36.0/Running；两端所属任务已完成且idle，没有正在等待的构建或测试进程。新能力真实验收无法由旧运行服务证明，按PO手动安装约定不自行启动安装器、绕过UAC、临时替换服务或修改数据。完整目标记为blocked（待手动升级及原扩展重载），不是待合并授权或开发失败，不重复构建/检查。用户完成运行前提并恢复目标后，直接继续当前孩子/日周秒读取和页面一致性验收；原目标未缩减、未标记完成。

候选最终核验完成：Native 2.6.37的13发布组件及MSI内11组件实际版本、ProductVersion/UpgradeCode和契约1.38一致；候选记录提交 `9bf7ab8dba59e822fb34b7bf9d25a40a1499a98e`已推送（纯记录，安装源码仍86a2ca1），工作区干净。root复核Burn/MSI/manifest哈希及所属候选记录。正式安装四组件仍2.6.36、Service Running、latest不变；本批未安装/UAC/部署。Matched＝两仓源码整合、聚焦/跨语言/目视证据和匹配候选准备；Missing＝2.6.37受控升级、原候选重载及新秒能力真实读取；Deviated/Extra无（本批范围）。当前仅等待这些运行前提，不能标记完整目标达成，不追查开发历史缺口或启用共享。

匹配候选准备：控件所属任务已原路径更新unpacked 1.7.45，对应master b373669b，稳定ID/公钥/开发模式/权限/junction保持，旧1.7.42完整备份，未重载或自托管。源包清单hash `69e4f7bae3412ae0fabc11af4dabd61afb22353d3e06c0bc880c622d8d4ae7ef`；root独立比较Native客户端/应用读模型/Admin三文件与源代码一致。旧新核心background、foreground-timing、session、usage-segments、integrity、timing-dispatcher、cloud-sync、storage、storage-maintenance、quota及quota-read-model-v2经行尾规范化一致；其他差异是已批准的应用读/展示和1.7.45 Mac-only Guardian健康适配，不改Windows网页原账。Native唯一2.6.37已生成，source86a2ca1/contracts1.38；root读取manifest并回算Burn `024a93cd2250d360a943bdab40c3dd7ceba4cc4e47527dac210ef740f2bd0f8e`、MSI `2a507b6ab19b63080dfb68640d91a287f8bfb7d50be900c73d93ab4405e37139`、manifest `4e4138aa3239ec8cb6f831c186bdde86c4d823cb9a5e1c5d45400b44d81ab56c`匹配。安装器组件/结构收尾由所属任务完成，当前仍2.6.36运行，尚未升级/重载，新本地秒通道未验收。

20:33已登录内置浏览器对同孩子/当日/Windows现有账户执行真实“刷新应用”，页面返回Service权威秒统计：已知5921秒（1小时38分41秒），结算截止20:28:55，读取20:33:17，7个产品及分类/小时可见；完整总量仍未知，开发旧账缺口未伪报完整。此前页面停留的2662秒已被新量替换，本次没有部署或安装。此证据证明现有云端读取仍更新，不能替代尚未安装的新BrowserBridge秒通道验收。PR head→合并SHA的GitHub compare文件差异为空，复用精确head测试；生产workflow仅workflow_dispatch，不因本次PR合并自动部署。原加载路径实读为junction指向D盘固定候选，保持未迁移。

PO明确要求合并后，PR #244已实际合入master，merge SHA `b373669b88fc154a19f207db4c9fd7a70d7764ad`；GitHub回读closed/merged=true，head `476780655d4e17a21f3559273556dc2d9e9a100e`的两次相关CI均success。下方“待#244合并授权”是旧阶段记录，已被本条取代；一次工具拒绝不建立每PR重复审批规则。契约1.38、Native `86a2ca1`和控件实现已有聚焦及跨语言验证；已安装2.6.36仍不含新秒读取能力，源码合入不等于实机完成。

下一批只完成匹配本地候选和真实只读链路：Native所属会话集中构建一个含本次接线的Windows候选，控件所属会话从已合入代码核对并更新原unpacked候选路径，保留ID/绑定/模式/原账。不顺带自托管、云端部署、migration、R2或共享启用。构建完成与安装分别登记；安装沿用受控升级与用户UAC边界，不自动启动新安装器。真实验证要求能力协商为秒读取、原生响应与页面采用同revision/截止、已知部分可见而完整总量不造零，旧接口不冒充新能力。仅复用或补跑本次消费者/候选结构检查，不重跑无关全平台测试，不新建分支或工作树。

同批补修已提交／推送（2026-10-06）：控件提交`476780655d4e17a21f3559273556dc2d9e9a100e`，固定目录干净，PR #244共9文件／3提交；根任务实查GitHub head一致、open／mergeable，精确App Runtime运行`37448448051`与`37448470167`均success。新补丁六文件仅Admin、读模型、预览辅助、两个聚焦测试和任务板；未知完整量及旧ms隔离回归、C# wire／契约向量、Rest和目视通过。压缩后的旧发布漂移已纠正，所属任务确认仅提交本PR，没有版本修改／构建／托管／安装／部署。当前唯一集成授权待办是PR #244合入master，PO仅批准#243不得代推为#244批准；获得后才继续匹配候选和真实通道步骤，源代码完成不等于端到端完成。

秒部分量页面补验结果（2026-10-06，未提交／未发布）：控件现有admin渲染已将新行为限定readUnit=seconds，根任务直接重跑真实列表／图例／详情回归PASS，涵盖partial已知量、未知不造零、完整零及旧ms不完整保持原行为。已独立目视桌面／移动隔离截图：应用4秒、分类4秒及小时图可见，权威完整总量仍未知，已知总量6秒单独提示，明细不替代总量。控件任务在contextCompaction后误回历史1.7.45托管任务，实读仅检查没有版本／提交／部署；已重新交接恢复同一PR #244的补丁收尾，明确不更新版本或托管。当前6项补丁仍在固定控件目录保留，PR head仍837661b，待提交／推送及新head CI，不把旧head通过证据当作新补丁通过。最终匹配Native候选及真实通道验收仍缺失，PR #244合并授权未取得。

秒消费者最终页面反向核对（2026-10-06）：PR #244 当前仍未合并。根任务以控件实际 admin.js 的列表与图例渲染函数、合成 partial 秒读模型直接运行，确认 knownTotalSeconds=6、产品已知4秒、分类已知4秒时，列表仍因 totalSeconds=null 整块退出，图例仍显示未知；此前读模型通过不能证明页面已展示。最小修订交控件所属任务在同一PR补齐：仅秒格式保留已知分类／应用明细和明确的不完整标记，完整总量仍未知，无证据不造零，旧毫秒行为不变；检查实际列表、图例、详情与状态文案，增加真实渲染函数回归和隔离目视证据，不改采集、原账、统计、配额或云端。禁止仅删除断言／改夹具掩盖；完成后复核PR精确head及CI再等待合并授权，不新建分支、工作树或中间安装包。
2026-10-06 应用秒统计只读界面补缺（纳入PR #244）：部分日账 `totalSeconds=null` 时，Admin 不得隐藏已知应用/分类/小时明细，也不得把缺失类别渲染为0。保留完整总量未知，逐项显示可证明的已知量与不完整提示；完整零量和毫秒旧接口行为不变。允许路径：`extension/admin/admin.js`、应用统计Admin聚焦回归及隔离桌面/窄屏目视证据所需的现有测试辅助文件；禁止改账本/统计生成/配额/云端/Native。

收口：真实 Admin 渲染器专项、整数秒读模型契约夹具、Rest 摘要回归通过；桌面1440px及手机390px隔离目视验证均显示已知部分并保留未知总量，无页面横向溢出。旧毫秒不完整仍隐藏明细，完整零量仍显示0。未改 manifest、Native、网页账本、统计生成或配额；未打包、安装、部署或托管。截图仅保存在本机隔离可视化目录。

2026-10-06 应用统计读取接入契约1.38：Native v3若协商 `application-usage-seconds-read-v1`，只读消费者改用权威整数秒快照；无该能力才兼容旧毫秒读取。秒快照按冻结revision分页与严格校验，保留已知部分量、未知总量及可信截止点；缓存按单位、档案绑定和Native连接上下文隔离。仅改Native客户端、应用统计只读模型及其聚焦测试；不改Native/云端服务、页面结构、网页账本、配额、打包候选或发布状态。

实施与专项复验完成：秒协议官方契约向量及Native生成的C#真实wire夹具通过；覆盖响应关联、缺失requestId拒绝、Native revision冲突映射/分页重读、缓存上下文隔离和部分数据不补零。`local-guardian`、应用统计读模型、Rest摘要三项专项通过。物理安装的Native端到端、打包候选和发布未在本任务执行。

## 应用秒统计外部读取集中接线（2026-10-06，继续既有完整链路目标）

云端当日／周已取得同截止实机采用证据，下一项是控件直接读取：真实调用仍为extension/infra/native-host-client.js的getApplicationUsage与stats/application-usage-read-model.js的totalMs，Native BrowserBridgeDispatcher仍调用旧ApplicationUsageReader。不能把秒值塞进Ms字段，也不能将已完成的云端链路等同于全部消费者完成。

本批复用既有秒读取草稿，集中补齐能力、独立请求／响应、七日范围与100条冻结版本分页、已知部分和完整零量区分、共同向量及固定包。职责runtime-cloud-contract，仅改contracts、必要根依赖锁及既有文档；Native／控件所属任务实施各自适配。最小验证为契约build/typecheck、兼容与秒读取向量、打包文件和哈希、差异检查；不跑网页计时、Worker全量、Mac／安装器。保留旧接口、同孩子／用户范围及原串行调度；不改原账、统计、上传、配额，不部署、安装、启用共享或创建分支／工作树。现有其他未提交内容原地保留。源码与真实控件通道验收分别记录，后者未通过前保持未完成。

契约本地结果：1.38.0已补齐schema、类型／导出、独立validator及共同向量；build／typecheck、10组秒读取聚焦用例和既有compatibility均PASS。同版日／小时守恒、重叠明细不相加、真实0／未知／历史已知部分、pending保留冻结量、七日与100条、分页错版、身份字段与单位拒绝均覆盖。打包件136948字节，SHA256 `c2f48db45ff04fa762b8082ea1d57d631569d7b5450265f150623193b8986a0d`；原v1／v2／v3兼容schema保留。初次构建被D盘sandbox写权限阻止，正常提权后成功；附加shell校验曾因PowerShell展开schema字段语法失败，改入固定测试后通过，非产品失败。两端只读评估确认实际接线位置，Native采用持久head确定性分页而非新建Service范围缓存；控件保持独立秒适配与既有展示模型。Matched＝本批契约与源码验证；Missing＝两端实现及实际控件通道；Deviated／Extra＝无（本批范围）。未更新候选或生产，当前已安装仍2.6.36，生产Worker仍1.37.0。

后续集中接线状态：架构提交`e0b7be407e9a9a080a5fdb0b3289c439941c185c`已推送，PR #243、精确App Runtime CI `37442819240`及相关CI均success；自动权限审核拒绝本次master合并，尚未合入，不通过浏览器／CLI绕过。PR附件登记另被会话100项上限拒绝，PR本身存在，不清理旧附件。Native已提交并推送`86a2ca18e0983e7e3ada434a133a84605d5630b0`，1.38受影响122项／最终新增接线13项、1.37旧兼容111项与Service／Host编译通过，固定包及上版锁核对。root直接读取真实C#生成的五种合成response（完整／partial／unknown／100＋1分页），全部通过固定秒validator；101个产品键无重复、冻结时间同版、明细不相加，wire SHA256 `22df0c318f6651a336952a414258545ba5bedc34c00c9e64568b52dd8f847d50`。这是隔离跨语言证据，不是已安装通道。控件接线仍在现有extension-local执行，未更新原候选，尚无最终实现／实机证据。主线、部署、安装和实机分别记录，当前仍2.6.36／生产1.37，不为契约版本重部署。

PO随后明确批准合并PR #243：GitHub插件按预期head成功合并为master `efd409dde8e2c62d6be07989059da034933efcc6`；fetch实读一致，与已验证e0b7be4代码树无差异，复用精确代码证据，不重跑未变产品测试。此前合并阻塞解除；不部署、不安装。根任务又将同一Native原样合成wire传入正在实施的控件实际validator和页面只读模型：完整6秒、部分known=6且total=null、未知total=null／无产品、100＋1页101产品均正常，明细4＋4不替代权威6秒。此项为真实实现的隔离消费证据，不是实机Host读数。审查迟到requestId、新能力通知、Native实际revision错误码与断线缓存的边界后，交控件所属任务在同批修订／回归；尚待最终提交及匹配候选后的实机核对。Manager原有秒读模型由5884c08已接入，不因本次补Host再次修改。

控件实际入口补验发现新增TIMEONCHROME_APPLICATION_USAGE_READ_CONTEXT被background通用监听器争抢，local-guardian真实路由断言失败；已交所属任务将该只读消息排除纳入最小接线补丁及任务板允许范围，不删除断言或修改计时／原账。Native新秒读取目前只证实已验证当前用户的唯一受保护孩子／当前分配范围；源码Coordinator与Reader仍要求Protected及有效assignment，解除保护和跨历史分配的原有读取能力尚未证明，不能宣称DESIGN接线清单第5项全覆盖。此缺口独立登记，不阻止已固定的Windows当日范围核对，不猜补历史或用旧单位填平。

控件集中源码已完成：固定extension-local目录、既存分支codex/integration-access-20261002提交`71d619b88e2e751ca45650304f73a92bf28a1462`，工作区实读干净。六文件仅TASK_BOARD、Native客户端、应用只读模型和local-guardian／application-usage-read-model／rest-usage-summary三个聚焦测试；三项均通过，另node --check及diff通过。最终实际复用原APPLICATION_USAGE_READ消息的contextOnly分支，没有新增消息类型或background修改，前述路由争抢在真实入口回归中消除。秒优先、旧单位兼容、单位／profile-device／连接代次隔离、可信断线缓存、部分量、真实0与未知、迟到非空不同ID忽略／缺ID拒绝、Native实际revision错误及最多一次重读均固定验证；Native原样wire及契约向量通过。未改网页／配额／云端／候选。按既有推送和PR授权交控件所属任务整合最新master、推送原分支及创建集中PR；不创建分支／工作树，不自动合并、打包或安装。Matched＝当前范围的三端源码与隔离消费；Missing＝控件主线集成、最终匹配候选的真实读取及上述范围验证缺口；Extra＝无。Windows原账→云端页面原有实机证据继续有效，新Host读取不冒称实机已通过。

控件集中PR已完成：非强制整合master efd409d后head `837661b8b494264225c5ea69dbdf9fe25b0a2b52`已推送，五个实现／测试文件与71d619b逐字节一致；Task板保留双方记录。PR #244由GitHub插件实读open／mergeable=true／六文件，Task-Role=extension-local；精确App Runtime CI `37446388246` success，合并后三个聚焦专项亦通过。尚未合入主线，未打包、安装、部署或托管；根会话PR附件再次因100项上限拒绝，PR状态不受影响，不清旧附件。当前目标保持进行中，等待本批源码合入及后续一次最终候选实机读取，不将已有2357／2422秒云端实机证据冒充新Host接口验收。

## 应用孩子统计集中安装、发布与验收（2026-10-06，PO明确批准）

后续只读日／周收口（2026-10-06）：仍为同一孩子／当前Windows用户，真实应用HTTP均200／seconds。固定同截止的当日2602秒与周结果2026-10-06条目及settledThrough逐值相等；周availableTotalDuration=45382秒，精确等于10/5已知42780＋10/6已知2602，不以应用／分类明细相加替代总量。周真实页面显示12小时36分22秒及15个产品／3类；当前日不完整但有效量、明细可读。Matched＝日周范围、单位、已知量累计和固定截止一致；Missing＝本地持久ACK回读、安全场景及Mac已登记缺项；Deviated＝周查询将10/7–11尚未发生日期列为APPLICATION_STATISTICS_NOT_AVAILABLE，并影响完整性／“尚未同步”截止文案，登记P2展示／范围问题，未修产品或将未来缺量虚填0；Extra＝无。首次CDP取证误选204 Preflight无body，随后按真实Fetch200取证成功，不归咎产品接口失败。当前已知应用链路可用，历史缺口和上述未来日期提示不作为新用量上传阻塞，不扩大为全范围应用统计已完全对齐。

17:10后续版本精确比对完成：正常当前用户管道实读revision419，已知2422秒、完整total=null、唯一MIXED、settledThroughMs=1791277656269；根任务真实页面HTTP响应同为2422秒且截止毫秒逐值相等。revision418→419、2357→2422秒已在本机与云端页面两次匹配，证明后续新版本持续上传采用。仅本地持久received回读保持证据缺口，不因此将已验证的采用／页面链路判为不可用；历史未知数据保留不完整，未补造全天完整量。

17:09真实安装与页面链路已核对：PO再次明确“重新弹出”后，唯一新管理员入口PID15912完成（17:06:32），2.6.36 Installer退出0，四正式组件版本及候选哈希匹配、Service Running。两项配对opaque哈希不变；八表已备份固定证据前缀missing=0／changed=0，限定不可变证据列，不扩大为全库所有状态不变。2026-10-06新v3原账24段2357整数秒；匿名Child head修订418，已知2357秒、完整性false且唯一MIXED历史兼容缺口，已冻结manifest `6fb77926…de94d1c7`。普通当前用户Manager管道读同一revision、hash、2357秒及截止，未回退旧毫秒。根任务沿已登录内置浏览器选定同一孩子／当前Windows用户／当日，实际应用API HTTP200／seconds／availableTotalDuration=2357／totalDuration=null，日期截止精确等于本机1791277577342；真实页面显示39分17秒及4产品／分类／小时内容，不完整标记保留。再次手动刷新已采用后续版本2422秒／40分22秒，截止17:07:36，并非停在旧头，正常新增量不判成重复。Matched＝安装与限定保留、原账→本机统计／冻结、云端采用及页面已知量；Missing＝本地最终持久received／receipt状态独立回读（安装首轮快照仅pending，后续普通诊断不覆盖Child ACK，管理员诊断受ACL保护，未绕过／再弹UAC）；历史完整性、名称及其他P1/P2单列，不阻断本次已知量链路。未启共享，未改扩展、原账、migration或R2。

单次UAC最终结果已返回：原RunAs会话78033实际报“操作已被用户取消”，Native已纠正非终止错误导致的误导成功行及null进程记录，状态为UAC_CANCELLED／Started=false；不存在管理员升级入口或安装开始。根任务独立回读正式Service仍2.6.35.0。Worker修复已部署不变，但2.6.36安装、真实上传ACK、云端采用及页面验收仍未完成；停止重弹，不因取消再次安装。仅在PO新明确要求重新弹出后使用同一固定包和受控入口，无需重新构建或部署。

17:00现场升级状态：Native已核验新入口与只读工具并仅启动一次RunAs；尚无admin入口结果，根任务再次实读正式Service仍2.6.35.0。正在等待同一个UAC返回，未证明安装开始，不能写成2.6.36已安装。已要求所属会话持续观察原会话78033，批准后同一入口先一致备份、升级再只读核对，不重复弹窗／安装。真实云端新head及页面有效量仍待此次升级，修复目标保持未完成。

16:56本批修复已合入并仅发布Runtime Worker：PR #242最终head `e9038e6`、master `07354def94a94568e5c0c31248760d99392f939a`；精确主线CI `37439262388`和受保护生产运行`37439441342`均success。发布清单实际Worker版本`023cc54b-4c9a-4f5c-9352-87a2944e3dd0`，deployedResources仅runtimeWorker；Runtime／Guardian migrations均空、共享执行未启。独立Pages仍`01ac6827`／a788c8d、主Pages仍`7f1a14a3`／d41d5d1、Guardian仍`c5c0e75c`、R2 latest仍2.3.1。Native唯一2.6.36已从`5884c08`构建，根任务实读Burn／MSI哈希与manifest匹配（Burn `5da8cefb…ebe2ea0`）；已通知所属会话按既有明确批准安排一次保留核对／原地升级和只读验收，当前尚未取得安装、真实上传ACK或页面非零证据，不标记实机PASS。未创建分支／工作树，其他未提交草稿保留。

同日兼容修复源码已落实：Native现有main提交`5884c0827cbb6a37571363e5383e280355f6cd6d`，1.37/1.36相关隔离各65项及Service／Manager编译通过；仅唯一最终2.6.36构建中，未安装。云端同一PR #242、现有cloud-management提交`e9038e6e673debaf6a29916ffdc31ab39e8bf185`，只采用固定孩子秒清单且唯一历史兼容缺口的已知部分，其他不完整拒绝。最终Native全合成15条v3＋1条未知旧事实的上传请求、原清单/行/哈希实读进入机器鉴权、commit、持久读取及页面HTTP／适配回归，已知1457秒、完整总量null、重复不加及下降替换等11项通过；typecheck、boundary、5项精确职责及dry-run 512.23KiB通过。云端夹具保持最终原请求JSON语义，旧事实计数不贡献时长，不修改原账。PR CI对应最终SHA仍运行；部署、安装及真实当日ACK／采用／页面尚未通过，不能把隔离链路记为实机完成。其他草稿与原工作树保留，没有新分支／树、migration、R2或共享操作。

PO已批准“解决吧”：本批修复同日旧／新原账的统计读取兼容，保留原账及可信孩子归属，不机械累加重叠；无法确认的开发旧数据保留缺口，但不阻断有效新数据上传／展示，不将部分值冒充全天完整。Native所属会话实施统计与必要直接消费者；当前会话核对云端接收、版本替换和页面读取，仅在实际需要时适配，不旁修电脑汇总P1或共享。职责档案为runtime-cloud-contract，允许本任务板、必要契约及Runtime只读读取／相关测试；禁止扩展、Native源码、生产数据、migration及新分支／工作树。最小云端验证先复用当前代码并聚焦`application-account-publication.test.ts`的鉴权秒统计上传、持久读取、下降替换及孩子隔离；Native另验证同日混用、可信旧归属、缺归属、重复与整数秒。交付顺序固定为本机新清单→ACK→云端可读→真实页面，安装或mock均不替代最终验收。

12:33修版只读审计成功：PO回复“再次弹出”后，Native仅一次管理员只读入口完成（PID36652／Stage=complete），未重新安装或修改数据库、ACL、配对。四组件2.6.35.0及候选哈希匹配；两项配对opaque文件哈希不变；升级前15392条v2原账、5596条旧统计及5596条旧outbox的指定不可变证据列均缺失0／变更0，不将此扩大为全库全字段证明。今日v3原账15段／1457整数秒；唯一匿名Child head修订409也为15段／1457秒，截止北京时间12:31:14.009，complete=false，唯一原因`APPLICATION_MIXED_LEDGER_COMPATIBILITY_MISSING`。同修订outbox为`awaiting_statistics`、manifestHash=null、尝试0、无receipt：实际堵点是本机同日旧账兼容完整性条件导致清单未冻结，尚未进入上传，不能归咎云端采用。代码对应Native `ApplicationChildStatisticsReader.cs:54`旧账检查、`ApplicationChildStatisticsStore.cs:171`完整性冻结条件及`:123`队列状态。匿名摘要未返回分配标识，精确云端来源匹配仍未独立证明；旧脚本安装时PreservationVerified=false是历史快照，不代表本轮核验失败。Matched＝安装版本、限定保留检查、新原账及派生统计有量；Deviated＝兼容条件阻断当前日发布；Missing＝上传ACK、云端采用和真实页面非零链路；Extra＝无。本轮只定位和登记，不补造旧归属、不移除完整性检查、不发新候选；修复须明确旧/新同日读取语义及最小范围后交Native实施。

12:22后续只读审计：PO回复“重新弹出”，取代取消后暂不发起的限制。首次自动审批误引用旧限制，附最新直接授权后同一入口获准；管理员只读进程PID35272实际启动，04:22:39Z结束为RuntimeException，未生成post-install-audit，不再将其误报为UAC未批准。未安装或修改真实数据库/ACL/配对。随后Native仅修忽略目录审计工具：真实序列化省略空hour/settledThroughMs，原版在隔离夹具分别复现KeyError；修版容忍字段省略、关闭只读SQLite连接、增加阶段码和受保护stderr、阻止旧结果冒充本轮成功。普通用户10/10隔离测试及预检通过，完整输入输出与原版一致，八表前缀比较不变；Python SHA256 `46b195bf3c73bd179c7573903007a5e1320f00d130ace0f6313c6b4b6dbb8ee5`，结果在Native本地`.tmp/windows-candidate-2.6.35/read-audit-fixture-results.txt`。上一轮真实stderr未捕获，因此复现的脚本缺陷尚不能冒称现场唯一原因；真实Child head/outbox/ACK和升级数据保留依旧未取得。下一步是修版单次管理员只读检查，不是重新安装，不为该诊断变更发候选或产品版本。

08:07阻塞复核：Native所属会话实际已结束／idle；`read-audit-attempt-status.json`实读为cancelled_before_readonly_admin_entry、adminAuditStarted=false、preservationVerified=false、childAckVerified=false，未生成管理员审计结果，不存在可继续等待的安装或审计进程。真实Windows当日应用手动刷新仍HTTP200／LEGACY_STATISTICS_UNIT／totalDuration=null／可用0秒／无明细，已结算截止推进至08:05:00，不能把截止推进当作新Child秒统计已可用。取消后的单次只读UAC重发确认尚无回复；普通诊断及现有页面无法提供Child head/outbox/ACK，安全只读替代检查已完成，不能绕过ACL或凭代码可达路径断言现场根因。连续三轮同一前提未满足，本机→云端真实验收登记阻塞，完整目标未完成；需要PO确认并手工批准一次既有合并只读审计，之后从固定版本／截止核对继续，不重复安装、发版或刷新。

安装后继续只读取证：按真实机器/账户响应选择当前孩子最近活动的受保护Windows来源，进一步限定账户查询，HTTP200返回`APPLICATION_STATISTICS_NOT_AVAILABLE`、可用总量及截止均null、无应用明细；因此全部Windows范围的`LEGACY_STATISTICS_UNIT`不能单独解释当前活动来源缺少新统计，尚不能判断物化、上传或采用哪一环失败。此前机器响应采于升级前，2.6.34字段不作为升级后反证。Native普通status实读online/2.6.35且心跳更新，四组件候选hash匹配；但其HasPendingUploads不含Child统计队列，不能冒称新队列为空。Native已只读追踪：Host应用入口仍读旧accountStore；Child Reader在旧/新原账混用时加`APPLICATION_MIXED_LEDGER_COMPATIBILITY_MISSING`，ChildStore冻结要求complete，未冻结则outbox为awaiting_contract；只有已完整冻结的Child head才抑制旧生产者。这是有代码依据的可达阻断路径，不是已经核实现场根因。当前普通诊断没有Child head/outbox/ACK字段，管理员只读UAC已取消；不再次安装、不绕过ACL、不把无数据当0、不旁修历史或共享。下一项仍是一次合并的管理员只读摘要，以当前日同一冻结来源/版本判断实际失败环节。

07:31安装及真实页面核对：原2.6.35入口第二次RunAs安装成功；根任务独立回读Service／SessionAgent／Manager／NativeHost文件版本均2.6.35.0。家长登录和SSO已恢复，真实独立Runtime页当前孩子当日应用请求HTTP200，`durationUnit=seconds`，但`complete=false`、`totalDuration=null`、`availableTotalDuration=0`、产品明细为空，原因`LEGACY_STATISTICS_UNIT`；切换仅Windows范围后结果相同。此处0只是当前可读部分，不能宣称真实零用量或应用链路PASS。源码读取器在已发布来源中仍存在旧格式清单时保留不完整标记，具体来源及新Child统计是否生成／上传／采用尚待固定head和ACK核对，不将该标记当作根因已查清。Native已安装Host真实读取`APPLICATION_USAGE_PENDING`。独立电脑汇总接口HTTP500／`INTERNAL_ERROR`仍作为既有P1，未旁修。安装后管理员只读审计UAC返回取消，未执行备份固定前缀、opaque配对及新统计head/outbox/ACK回读；安装成功不代表数据保留或端到端通过，不再次安装。Matched＝四组件版本及真实登录／API请求；Missing＝独立保留核对和当日统计非零链路；Deviated＝页面无有效应用用量；Extra＝无。未改产品代码、配对、原账、共享执行或任何部署。

07:18真实控制台登录调查：PO反馈不能登录，内置浏览器实际显示Failed to fetch。使用既有输入仅重现一次，`/auth/login`的OPTIONS和POST均为`net::ERR_CONNECTION_CLOSED`，无HTTP状态/密码校验返回。只读curl对Guardian及Runtime两个workers.dev域名均TLS握手失败，而主控制台Pages返回200。系统DNS将这些域名映射到fake-IP地址；本机确认运行Clash Verge／Mihomo及Meta适配器。因此已确认阻塞发生在本机请求API的网络传输阶段，代理路由／节点具体根因仍待核对，不将推断写成已证实的Clash配置错误。既有生产Runtime health smoke通过，浏览器登录仍未通过；未改登录代码、密码、会话缓存、代理/网络设置或生产配置。

07:01部署已完成：精确master CI `37385583748`成功；受保护生产运行`37385809552`成功，仅Runtime Worker `85ac1de7-ea84-40f3-9c60-0682d8076a75`与独立Runtime Pages `01ac6827-8a5e-4377-8688-ebdbddba5727`，SHA `a788c8d`、契约1.37.0。发布清单回读migrations为空，Worker health/未认证401及Pages smoke通过。Guardian及主Pages未部署，R2 latest仍2.3.1。已通知Native所属会话按既有批准执行唯一2.6.35的一致备份和一次原地升级，UAC由用户手工批准；安装与真实当日统计/page链路仍待验证，不记PASS。

06:56续进：App Runtime `37369050622` 第4次尝试已成功；第3次Linux Rolldown启动失败在只重试Worker任务后消失，锁内原已有Linux1.2.6包，未删除锁、升级依赖或修改统计代码。实际Worker10文件247/247、契约向量、边界、typecheck及dry-run通过，页面任务复用通过证据。PR #241 已按预期head `f0e7f47`合入，master为`a788c8de9180fa8b5a6ba399d94d903386ce8101`。随后只发布Runtime Worker及独立Pages，Native仍实读2.6.34.0，2.6.35未安装；不得将已合入写成已部署或实际链路已验收。

本批合并已完成并推送 `f0e7f47294280b1f7b4bd6ec0c45507adf57308b`，集中 PR #241；合并代码树与已测试 `b5fd433` 完全相同，45项精确路径检查通过，现有未提交草稿保留。发布依赖核实：线上独立 Runtime Pages 仍使用旧毫秒读取，必须随兼容 Runtime Worker 更新已有秒读取页面；Guardian、主 Pages 不部署，migration／R2 latest／共享执行不动。Native 唯一候选为 2.6.35，源码 `3f3fc42`、Burn SHA-256 `7fcbc8a5e995fbb2bf710ed8ea28796add120af29f20f9323056ec1a16a6d55b` 已回读。

当前实际阻塞是远端运行器分配：初次 App Runtime `37368110739` 以及 PR 说明修订触发的 `37369050622` 均在 changes 未运行时被平台取消；后者 check annotation 明确报告多次尝试仍未取得 hosted runner，gate 日志为 `changes failed: abandoned`，不是产品测试失败。Guardian integration 和 Rest weekly 已成功。PO 要求“再试”后已重试 `37369050622` 第2次尝试，SHA仍为 `f0e7f47`，未重跑其他已通过工作流。GitHub 官方 Actions 事故 `3q1yb5m7ltvb` 在北京时间04:39更新仍 investigating。未取消远端运行、不伪造检查成功、不修改门槛。安装前备份脚本已静态核对，尚未执行一致备份、安装或停服务；Service实读仍2.6.34.0／Running。公开 Runtime health 200，Windows latest 仍2.3.1；没有生产部署或实机 PASS。内置验收浏览器的账户显示为旧缓存，实际 profiles／refresh 401，真实页面验收前需恢复登录，不能当作已登录成功。

PO已明确批准本批合并冲突取舍：保留1.37整数秒及固定Child ID，保留master旧端兼容字段与能力；旧“原账重算必须一致才发布”断言采用既有批准的诊断-only规则。仅解决已列出的10个文件冲突，不引入新业务语义，不暂存现有Host／设计草稿。

PO明确要求“安装，部署，验收”，覆盖此前本批不安装／不部署的阶段限制。复用当前云端分支及Native main，不创建分支或工作树。先在现有云端线核对并整合master最新兼容修订，通过精确源码相关CI后PR合入；只发布Runtime Worker，准备一个匹配的Windows最终候选并保留配对、原账及outbox原地安装，再核对当日原账→持久统计→鉴权上传→云端采用→实际页面。源码测试、已部署、已安装、实机通过分别记录；不执行migration、不改R2 latest、不启用共享、不包含Mac实机。现有未提交Host／设计草稿不混入集成提交。此前开发CI37364411381的changes任务已取消、尚无产品测试结果，不当作PASS。

本批职责release／architecture-integration：复用已有契约、Worker、页面及Native聚焦证据；只补主线整合实际变化影响的测试与diff检查。页面真实验收只读，不改家庭配置或真实配对；原账v3直接上传接收端仍缺失的状态须与派生统计发布分开报告。

## 持续目标恢复：修正应用统计同步并集中测试（2026-10-06）

只读审核已完成，持续目标“制定方案修改并测试”恢复实施。保留审核发现及全部工作现场，先完成固定Child清单／云端范围核验／共同兼容测试，再交Native接冻结及发送入口，并用真实v3生成的脱敏清单经鉴权HTTP核对云端持久读数。未提交Host秒读取草稿不混入本次固定包；对应独立兼容失败继续登记，不改其协议内容来凑通过。原账上传缺口、应用真实重叠规则及历史分类缺口分别保留，不把统计局部通过当完整同步通过。

checklist／允许路径：usage-account契约、schema、共同向量、版本及固定包；applicationAccounts／Publication／StatisticsNative范围核验与对应隔离回归；现有TASK_BOARD／DESIGN。本次先修已证实的能力断言及新增孩子范围篡改回归。Native只由所属会话处理，旧policy或产品关联不得自动否定有效原始时长。最小测试为本任务契约、两组Worker统计、typecheck、diff，干净候选仅隔离组装编译（不是新worktree）；不修改网页、不安装部署、不执行migration、不启用共享、不运行全平台。接收／读取测试须证明旧A补发、两用户及家庭隔离、重复／下降替换；真实v3发送和正式页面证据缺失仍保持未完成。

### 正常切换墙钟漂移误判（2026-10-06，继续已批准的 Windows 统计接线）

只读复核 `Native main@3cd5a10` 后确认：ChildReader 按墙钟检测所有原段重叠，但原账按单调时钟生成时长。真实 Projector 对不超过 2000 毫秒的墙钟差异不切 epoch；同 runtime／epoch 的 A→B 正常切换只要墙钟落后 1 毫秒，就可能出现单调区间不重叠、墙钟区间交叠，随后整日统计 `APPLICATION_RAW_OVERLAP_UNRESOLVED`。已回读真实 Projector→Session→SQLite 的 `wall-drift-before.trx`：1/1 失败，单调交叠0毫秒、墙钟交叠1毫秒、原账360秒，但 Reader 完整性失败；这是隔离复现，不宣称现场已发生。Native 所属会话已接续最小修复：使用已有可信单调依据判断同 runtime／epoch 的真实重叠，保持原账、既定秒和小时分配不变。初稿将全部多 runtime／epoch 无条件拒绝，会新增正常重启后统计停住的退化，已要求回正：不同组仍保留旧实现明确不相交范围的处理，只有跨组墙钟交叠且无法确定关系时单列缺口；不引入容差或新的时间映射／并集算法。只运行受影响聚焦回归／必要编译，不安装部署。

同日旧／新格式混用另列：旧 V2 通常没有冻结 Child，本地当前策略和恢复 journal 不能冒充完整历史归属表；混合保护暂停新清单，旧生产者也不能补齐新 v3 用量，因此旧云端完整读数会暂时保留。按 PO“开发修复期间版本差异不纠缠”的决定，不扩展历史迁移或猜补归属；纯新格式当日链路独立推进。PIP 虽有 Core 资格逻辑，当前原装 Windows Agent／Projector 未找到实际 PIP 生产入口，不能将函数存在说成实机已发生；多会话、跨 epoch 仍保留验证缺口。

### 本轮已取得的同步证据（2026-10-06，非生产验收）

跨端回执闭环补验（2026-10-06）：当前Native上传测试使用模拟成功回执，云端真实路由已接收原始请求，但尚未证明真实路由的响应能被正式Native API／上传器消费。本次仅在已有三项真实v3回归中核对capabilities、begin、pending status、chunk、commit、published status与重放响应，保存180秒固定合成请求对应的实际云端响应夹具，交Native所属会话补正式客户端／上传器隔离回归（成功确认、commit回执丢失后恢复、不重复累计）。允许已有publication测试、固定合成JSON、本任务板；不修改生产协议／鉴权／原账，不引入新分支或安装包。不运行浏览器或生产操作，最小验证为三项过滤回归、typecheck、diff及Native对应聚焦用例。

云端回执补验完成：3/3真实v3回归、typecheck与diff通过；固定 application-child-service-cloud-responses.json SHA256为152f13594bb63a2a0ed8e5a963d65b50795fdc5934c1623715f46590fe69d4fe，所有字段逐项等于实际机器鉴权HTTP路由响应，不包含token或真实身份。仅首次测试启动因沙箱临时目录写入受限退出；工具批准后隔离验证通过。已交Native继续正式客户端／上传器的ACK及丢回执恢复验证，结果尚待回读。Native新回报其同实例代码已推送main@8c212ca2047f60a0b47c8bdf48bf87092d2e6190并已向Mac标准交接；未据此推断云端已推送／部署或Mac完成。范围Matched，无生产代码／协议／原账变更；真实安装与页面证据仍Missing。

Native回执补验已独立回读：提交064df81，工作区换行兼容补充3f3fc4223f6ff58a73a81e2ac5ab3c50c8b39a02；cloud-response-interop.trx实际执行2/2、0失败，响应JSON哈希与云端一致。固定原段经Session／SQLite重建、同Coordinator物化／正式上传；begin与chunk请求规范化逐字段等于原固定请求，原样云端JSON由MachineRuntimeApiClient消费。丢commit响应时保留begin ID且不确认，冷却后仅GET能力和published status恢复received；begin／chunk／commit各一次，再轮不上传，原段及冻结清单不变。生成事实入口另复用fe36c66，不把本次固定runtime重建说成新的系统观测；生产代码未修改，实机仍未验收。

改绑及正式启动条件收口核对（2026-10-06）：Native `main@3f3fc42` 干净。ApplicationChildStatisticsStore.cs:56 从冻结原账发现孩子来源；:228 新队列的 currentAssignments 仅决定调度优先级，不过滤旧孩子。ApplicationAccountStore.cs:849 同时选择新／旧队列并保留旧发布复查机会；旧格式当前分配过滤不适用于新Child队列。Coordinator.cs:779 已加载账本与策略才运行物化，但不要求存在当前有效用户，:812 在 validAssignments 循环之外调用Child物化；StartAsync:261/265实际启动这两条后台循环。云端 applicationAccounts.ts:56 按准确历史分配核验冻结孩子，不以最新B替换旧A；publication回归:312实际证明A=51→40、B=27保持不变。已有Service入口9/9、回执2/2、Child提交21/21及墙钟27/27的TRX已回读，复用对应代码证据，不重复运行。此轮只补源码审核结论，未发现需要新增修复的接线错误；不证明已安装或生产页面通过。

源码交付已推进：远端 `codex/cloud-management` 从045b88b非强制推送至b5fd433c15a5c32045b6a310bcd8109de78166db，git ls-remote回读一致。本轮同主题累计19项已提交成果整体同步，未提交Host／DESIGN等草稿没有上传。GitHub插件当前查询该head无开放PR；未创建PR、合并master或触发部署。仓库生产工作流仅workflow_dispatch且限定master，开发分支推送不调用；提交范围git diff --check通过，未变代码沿用既有精确证据，不机械重跑产品测试。真实生产闭环仍需后续明确发布／安装范围，不以远端源码可读代替验收。保留现有未提交内容，本次只更新任务板执行记录。

已补一个可独立推进的开发验证步骤：手动启动已有 App Runtime CI 37364411381，full_validation=false。CLI实际回读为workflow_dispatch、headBranch=codex/cloud-management、headSha=b5fd433c15a5c32045b6a310bcd8109de78166db；GitHub插件确认changes job 111946075467已排队。工作流按该提交差异选择Runtime检查，无生产部署、Windows/Mac或安装器任务。本次没有创建PR、合并、安装或部署；运行结果尚未取得，不能记PASS。此前把远端CI和发布一起列为待批准过于宽泛，本条明确：开发CI可在当前范围内完成，生产发布／安装仍待独立范围确认。

CI排队原因线索已核验：GitHub官方status summary在2026-10-06北京时间03:11起登记Actions degraded_performance，事故3q1yb5m7ltvb仍investigating；03:15更新说明GitHub-hosted Runner分配延迟。当前运行37364411381的changes仍queued、steps为空、check summary为空；与平台事故吻合，但不是该运行直接返回的根因判定。同工作流较早master与云端分支运行均success，不能把当前未执行算代码失败或付款故障。不取消／重启运行，不改CI／产品来规避，等待原运行结果；未部署或安装。来源：https://www.githubstatus.com/api/v2/summary.json 。

正式运行入口再次只读核对（2026-10-06）：`RuntimeServiceCoordinator.StartAsync` 启动 applicationAccountProjection／applicationAccountUpload，已配对时 InitializeLedgerAsync 初始化孩子统计存储；生产物化调用 MaterializeChildStatisticsOnceAsync，上传循环调用与隔离用例相同的 UploadApplicationAccountsRoundAsync。新 child-scope 能力只控制发送，新统计保持持久待发；上传器逐项校验 manifest／chunk 回执后更新同一冻结版。当前运行 Service 文件仍为2.6.34.0，不能作为 fe36c66 新接线的实机证据；Native 固定1.37包哈希本次实读仍为0fcb0ac08129f1ee0301cf4a6aca4f3271697482599da73db508650c40c619a7。源码／隔离已通过，推送、主线合入、部署、匹配安装及真实页面仍未完成。本次未运行新产品测试，复用未变精确源码证据，未安装或部署。

非核心治理遗漏单列：`tools/timewhere-native-contract-lock.json` 仍锁1.30.0；其实际消费者仅为 TimeWhereNative Artifact Gate 的候选／不可变R2校验，不是 Runtime Worker 的统计接收或部署前置。本轮不修改该锁，不把它升级成统计链路阻塞；最终 Native 产物发布前再按明确产物版本同步。生产迁移待处理状态本次未核实，不能依据旧文档自动执行。

集中补齐同一Service入口证据：Native所属会话使用同一隔离Coordinator的ApplyFactAsync、物化及生产上传round，已初验缺child能力时持久pending、开放能力后实际发送180整数秒和对应ACK、再轮无重复上传。云端将这份原样捕获作为第三项参数纳入已有贯通测试，覆盖实际接收／持久读取／页面HTTP；允许已有publication测试、新合成JSON、本任务板及vitest.config.ts中固定合成家庭/孩子的单个白名单pair，不拓宽生产权限。只运行这三项过滤回归及typecheck／diff，复用未变代码证据；不安装、部署、共享或历史重构。真实机器证据仍Missing。

同实例结果已回读：Native本地提交fe36c661405647406a432be57702e1eb19feda77（未推送）；固定application-child-service-instance-wire.json SHA-256 8223fd8417fd07dfcfbedd5f909272456c9eb996ef08094ae9ffa7bee286b0d1。service-instance-regression.trx为9/9、0失败；编译0警告／0错误由所属会话回报。缺child能力只读取能力且pending完全不变；开放后begin/status/PUT/commit收到180秒revision1精确回执，再轮只GET能力，冻结manifest/chunks、原账不变。云端将固定原请求纳入第三项后，实际接收→发布→持久读取→RPC→页面鉴权HTTP→秒适配3/3通过，typecheck通过。生产循环实际调用同一round；默认UTC、15秒能力超时、8槽/停止条件/等待节拍不变，诊断调用位置已对照原提交确认未变，不因diff缩进误判改变代码。范围Matched，线上部署／安装／实机仍Missing；新原段云端接收、真实重叠、混合旧账及孩子日周持久汇总仍单列，不假称整项目对齐。

正式页面请求补验：沿用现有190／360秒真实Native合成发送夹具，在同一隔离数据库创建有明确孩子范围的测试浏览器会话，实际调用页面的 `/v2/module/app-usage?durationUnit=seconds`；逐字段核对响应与已发布持久统计一致，再交正式页面适配器读取，错误孩子请求拒绝。只改已有 application-account-publication.test.ts 和本任务板，运行该两项过滤回归及typecheck／diff；不改页面、生产权限或统计语义，不运行浏览器、不安装部署。页面实际请求已只读核对：秒请求异常不走旧统计回退；无秒来源时的兼容结果明确显示“旧版兼容统计”。实机页面采用仍需另行验收。

补验结果：上述实际页面HTTP回归2/2通过（其余73项未运行），响应逐字段等于同一已发布持久统计，错误孩子返回CHILD_NOT_FOUND；typecheck与git diff --check通过。首次测试在启动前因沙箱无法写node_modules/.vite-temp而退出，获工具权限后隔离复验通过，未访问生产。范围审计Matched：只补已有测试及任务证据，无产品代码／原账／网页改动，无新增分支或工作树；补验纳入同主题本地回归提交，保留既有其他未提交内容，不单独制作候选包。正式页面实际渲染由app-runtime.js的renderSecondsUsage及openUsageDetail秒分支消费durationSeconds，不走旧毫秒字段；此为源码接线证据，未进行本轮浏览器目视或线上验收。

本次墙钟误判修复的云端补验只增加实际 `child-wall-drift-wire.json` 合成发送夹具及已有全链回归参数：固定 360 秒／学习分类／两个产品各 180 秒，从原 begin/chunks 经鉴权接收、发布、持久读取、RPC及页面适配返回同值。允许路径为 backend/test/application-account-publication.test.ts、该固定 JSON 和本任务板；不修改生产源码、配置或身份替身，不重算 fixture/hash。最小命令仅该真实 v3 用例过滤、typecheck、diff；其他云端100项及dry-run未受影响部分复用，不部署。

完成证据：Native `873d8330809c351c7e066294cd19e071b8dd63ed` 已提交，回读工作区干净、`wall-drift-final.trx` 27/27；Service 编译0警告／0错误由Native回报。固定夹具 SHA-256 `e3d9450c7e440e910261ad7458f8c20d45afdcf21eeb3d6c51ead81903ad1e01`，云端副本只加结束换行，字段及hash不改。云端过滤真实v3回归2/2，190秒与360秒均经鉴权发布／读取／RPC／正式页面适配通过，typecheck和diff通过；总360秒、学习360秒、两个产品各180秒、截止一致，重放不累加。首次360秒回归因两个合成请求共用固定来源、隔离数据库残留导致主键冲突，仅清理本用例固定合成家庭／机器数据后通过；不修改生产数据或权限。初稿所有多epoch拒绝已经回正；跨组明确分离仍完整、实际交叠缺依据仍保留缺口，检测排序扫描，不两两比较。本轮没有安装、生产部署或真实页面验收；未完成项不据此关闭。

固定契约1.37.0已本地提交`97326bc26fc02960a66119e8e221600de710d84e`。从该SHA已跟踪文件隔离编译打包，未包含Host秒读取草稿；包SHA-256为`0fcb0ac08129f1ee0301cf4a6aca4f3271697482599da73db508650c40c619a7`。共同向量及干净兼容检查PASS，包含8项网页现行日／小时纯函数对照。完整工作现场中的Host草稿兼容失败不被此结果掩盖。两组Worker统计100/100、typecheck、Wrangler4.127.1 dry-run和源码边界PASS；未部署。

真实Native生成的合成请求已纳入`backend/test/application-child-native-generated.json`；源为同一SQLite的180秒周期段＋10秒改绑尾段、固定孩子A，通过现有上传器捕获begin／PUT原请求，而非另造统计。`application-account-publication.test.ts`直接发送该begin／chunks，经机器鉴权HTTP→发布→持久读取→RuntimeComputerUsageService→正式页面秒适配均为190秒，当前分配B未收到A用量、重放不累加、无旧原段／旧策略历史前提。applicationUsage的角色归属缺口保持独立不完整，不抹掉有效总量。输入JSON逐字段保持不变；首次RPC失败为隔离Guardian替身未登记固定合成家庭/孩子，补固定测试pair后通过，生产权限逻辑未修改。该证据不是线上页面或生产上传验收。

Native集中交付已核对`main@3cd5a1052504b0c187d89a68080106fc332da174`且工作区干净；当前1.37／上一兼容1.36矩阵TRX各116/116，最终`child-submission-137.trx`21/21，均0失败，Service编译通过。固定合成原请求文件`agents/windows/tests/TimeOnChrome.AppRuntime.Core.Tests/Fixtures/application-child-v3-wire.json`SHA-256为`60f338b663558a8d708547203c3e8c8ac7aabadf7797ec66df21a4e16f670736`；云端副本仅加结束换行，JSON字段及统计hash均一致。正式Manager及Mac v3接线不据此宣称通过。

| 对照项 | 网页实际入口／证据 | 应用实际入口／证据 | 判断 |
|---|---|---|---|
| 孩子与来源归属 | 网页设备凭据与profile关联；profileAccountsV2按profile读取设备head | begin按机器凭据＋精确历史用户分配核对冻结childId；发布／读取再次核对；实际v3生产器／发送器及HTTP回归A→B旧A补发和两用户隔离通过 | 隔离链Matched；真实机器证据Missing |
| 同版冻结、分块、ACK | cloud-sync上传device account manifest／chunks／commit并核对revision | 复用ApplicationAccountUploader已有begin／status／chunks／commit；新v3实际生成请求及云端100项回归通过 | Matched，仅源码／隔离证据 |
| 替换与更正下降 | profileAccountsV2按来源head替换并生成孩子日／周版本 | applicationAccountPublication按来源revision替换；51→40及旧commit重放不回退、不累加 | 云端Matched |
| 原账不阻塞完整统计 | 网页统计清单发布与原账诊断分离 | validateApplicationAccountSnapshot核对结构／hash／授权，不要求旧策略版本或原段到齐 | Matched；不等于新原段上传已实现 |
| 孩子日／周持久读模型 | profileAccountsV2发布事务写day／week generation及head | 应用来源快照已持久化；applicationStatisticsNative仍在查询时按来源／日期归集 | Deviated，未在本轮顺手重构 |
| 新原账→新统计→HTTP→页面 | 网页已有正式调用链，现行实现不变 | 纯v3实际生产器／发送器请求到云端及页面正式适配器均190秒；真实运行机器及线上界面尚未验证 | 隔离链Matched；实机证据Missing |

PO再次明确确认继续Windows统计接线，已恢复Native所属会话执行，仅代码与隔离测试、不含Mac守护、不安装部署。旧原账v3的awaiting_receiver与派生统计发送分开：原段接收缺口不能伪装完成，也不能再次成为有效派生统计发布前置。实机多用户、真实改绑、锁屏／休眠、完整Service重启及Mac验收沿用已登记延期；不反复要求安装。

仍未完成：同日V2/V3完整兼容、真实重叠秒并集、孩子日／周持久汇总以及原段v3云端接收。Native已加入同源修订接续及混合源覆盖保护：新修订续旧持久水位；有有效旧事实／非零旧head时不允许仅v3子集替换，保留旧值并标明缺口；合法90秒估算只作诊断，不否定已确认原时长。保护成功不等于混合统计实现，不能宣称整体已对齐。共享、历史还原和Mac均不顺带推进。

## 云端同步再次只读复核结论（2026-10-06，覆盖下节恢复实施状态）

PO当前要求先审核设计／实现与网页是否一致。本轮未修产品代码、未启动新上传、未安装／部署／迁移；Native已暂停新增改动并保留现场。审查分别固定已提交Native 78d0bb6／云端9bd57f9，以及当前未提交草稿，不把两者或旧安装证据混称完成。

当前新v3原账未贯通云端：已提交统计仍读旧V2、冻结清单未带孩子，上传选择器仍过滤currentAssignments。新增Native草稿已接Coordinator物化调用，真实隔离Session→SQLite→Child统计及Service入口14/14；新派生outbox仍awaiting_contract、manifest/chunks为空，未接发送器／正式读取。云端1.37 childId/hash/范围核验仅未提交实现，Native仍锁1.36。缺策略／产品关联／历史分类及重叠的草稿完整性门槛须单列核对，不据此把有效时长直接判无效。

本轮复验：网页device-account-v2 29/29、profile-account-v2-publication 9/9、usage-account共同向量PASS、Worker typecheck和diff检查PASS；Worker两组统计测试95/97，2项失败为能力列表新增application-statistics-child-scope-v1而旧断言未更新；契约兼容测试FAIL，未提交Host草稿新增getApplicationUsageSeconds而固定枚举断言未更新。未修测试、未宣称兼容通过。Native14/14实际TRX为本地.tmp/application-raw-v3/child-statistics-service-entry-final.trx，不是HTTP发送或页面证据。云端秒路径按孩子读取已发布来源且不重算原账，但日／周仍查询时归集来源，不等同网页孩子日／周持久汇总。总体Deviated/Missing，当前链路未通过；生产／安装新版和真实页面采用均未重新核实。

## 审核后恢复实施：固定孩子统计清单（2026-10-06）

持续目标“制定方案修改并测试”恢复执行；前节只读审核已完成，保留全部证据，不再把审核阶段暂停写成实施结果。当前先补最小契约／云端边界，不安装、部署、迁移或启用共享。Native所属会话恢复v3派生统计接线；真实秒／并集语义矛盾须给最小实例，不擅自改变产品口径。

本任务checklist：①1.37.0秒统计清单可选childId、参与manifestHash，原1.36无该字段继续兼容；新v3生产者必须填写，能力application-statistics-child-scope-v1未声明时持久待发。②云端begin／发布／读取核对冻结孩子与已验证机器、用户、精确历史分配一致；冲突拒绝，不新建分配历史。③共同向量及HTTP回归验证A→B后旧A仍可补发、B不收A、两用户隔离、不同机器累计、下降替换、重复ACK和旧端兼容。④干净固定契约包只包含本任务改动，不夹带native-host未提交草稿；Native锁具体包/hash后生成真实v3 fixture供云端贯通测试。

职责runtime-cloud-contract；允许usage-account契约／schema／vectors／聚焦测试、契约版本元数据，Runtime applicationAccounts／publication／statisticsNative及对应测试，现有任务板／设计。最小测试为usage-account、兼容结构、两组Worker应用统计测试与typecheck/diff；固定包编译使用干净临时制品目录（非工作树）。旧1.36证据复用；排除扩展／网页落账、共享、Windows全平台、Mac、安装器与浏览器测试。完整目标仍须真实v3→统计→HTTP→云端读取，不以本契约补丁单独完成目标。

## 云端同步启动前只读审核：应用对照网页（2026-10-06）

PO最新要求先审核设计与真实接线，当前暂停新增实现、预告1.37消费、安装及部署；保留下方已有实施草稿和所有未提交内容。本节仅记录审核，不把源码或隔离测试通过当成已安装／已上线。Native所属会话已确认停止新增业务改动并回报源码证据。

固定本地基线：标准云端codex/cloud-management@9bd57f9e4e5f7595b5a466b1044f5a6f2686782e；Native main@78d0bb672fd88839160d7ec16a87fb65f66d8984；控件bbc94969fb73b8ffc8a188ac7c8241f15796810b。云端已有契约草稿、Native已有实施文档草稿原地保留。Native固定包1.36.0 SHA256 eca40857e7d3c5ca738bdb70210f1fd3d038ae7e415fbacb244ce35267c53f08已回读一致；1.37未实现、未固定。当前生产和安装版本未重新核实。

| 审核项 | 网页实际依据 | 应用实际依据 | 判断 |
|---|---|---|---|
| 原账孩子与秒单位 | extension/core/usage-segments.js:365逐日定秒，669消费durationSeconds | Native MachineSegmentLedger.ApplicationV3.cs:13/126固定child_id＋id及duration_seconds | Matched：新原账结构；不代表新统计接通 |
| 孩子统计主键与冻结归属 | 云端profile_id＋device_id＋date，来源归属经设备鉴权 | Native ApplicationAccountStore.cs:10/148，统计清单无ChildId，键仍user＋assignment＋date；云端applicationAccounts.ts:56由历史分配赋child | Deviated：新原账Child未贯穿冻结统计；不据此断言已串账 |
| 新原账进入统计 | 网页usage-segments.js:669直接累计原段秒 | Native ApplicationUsageReader.cs:214/294读旧V2；245只标v3覆盖未知；ReadApplicationRawV3Async只有定义 | Missing：新v3原账未生成派生统计 |
| 统计整数秒语义 | 网页按原段已定秒累计，再分小时，不补原段截去碎秒 | Native ApplicationSecondsProjector.cs:39/71/85对旧毫秒区间先并集再floor，来源仍旧V2 | Deviated：旧适配不得直接套用新原账；新v3定秒消费尚缺 |
| 本机持久统计和队列 | device-account-v2.js:274/285/318冻结revision/hash并按版确认 | Native ApplicationAccountStore.cs:349/396/399/407物化、冻结版本及outbox | Matched：旧账统计基础可保留，新输入缺接线 |
| 云端鉴权与隔离 | workers/src/routes/deviceAccountsV2.ts:82核验设备归属；profileAccountsV2.ts:49核验家庭 | Runtime v2Routes.ts:534机器鉴权；applicationAccounts.ts:56历史分配；publication.ts:142家庭及撤销检查 | Matched：不信任客户端自报孩子，不要求新鉴权体系 |
| 改绑后旧孩子补发 | 归属不能因后来绑定而重解释，待发版本须保留 | Native ApplicationAccountStore.cs:875-879要求当前scopes；Service coordinator:2033传当前分配；云端历史表PK含assignment_version | Deviated：本机选择器阻断旧来源，云端历史分配并非不存在 |
| 有界分块和完整性 | 网页begin/chunks/commit、statsHash、manifestHash | applicationAccounts.ts:79/94/132，100行分块、行/hash/结构核对 | Matched |
| 版本替换、下降更正、幂等 | profileAccountsV2.ts:195替换本设备，保留其他来源；revision增加不要求用量增加 | applicationAccountPublication.ts:185/222更高revision替换同来源，不按用量大小判新旧 | Matched |
| ACK对应真实版本 | device-account-v2.js:318校验revision＋manifestHash；usage-segments.js:1447旧ACK不清新脏项 | Native Uploader.cs:251/266校验ID/revision/hash/分块；received与published区分 | Matched；接收和可读本来是两个状态，不能混称 |
| 云端采用本机统计、不重算原账 | deviceAccountsV2.ts:284先发布再独立对账；profileAccountsV2.ts:195归集来源统计 | applicationAccounts.ts:158→validateApplicationAccountSnapshot，未调用旧精确重算器 | Matched：新秒路径不依赖原账到齐或旧策略版本 |
| 多机器与日周归集 | 网页按设备来源累计、形成孩子日周持久头 | applicationStatisticsNative.ts:22按account/child/date读取各来源，75按日期归集，无跨机器时间线并集 | Matched：应用秒路径读取时求和，尚非与网页同形的孩子日周物化表 |
| 页面读取与兼容 | 网页读取已发布孩子统计 | Runtime v2Routes.ts:334秒读取；console/app-runtime.js:496请求seconds，无秒结果时显式legacy；computerUsageService.ts:63先秒后旧兼容 | Matched：独立应用页面消费者已接线；旧兼容仍含旧精确重算路径，不冒充新链路 |
| 新原段云端同步 | 网页原段有独立持久outbox与上传 | Native v3 outbox默认awaiting_receiver；Service只接旧原段发送，Runtime validation.ts:234仍原段schema2 | Missing：新v3原段发送／接收未接通；不得冒充旧格式；与派生统计可读分开记录 |

本次聚焦复验：Runtime `npm test -- test/application-accounts.test.ts test/application-account-publication.test.ts`为96/96；网页只读基线 `node tests/unit/device-account-v2.test.js`为29/29、`node tests/unit/profile-account-v2-publication.test.js`为9/9。Runtime首轮仅沙箱临时写权限失败，提权隔离复验通过，未访问生产。HTTP用例覆盖秒统计51→20下降替换、旧提交重放、无原账也发布、家庭隔离及页面格式消费；这些输入不来自新v3原账。Native ApplicationSecondsGenerationTests.cs:50仍用UsageSegmentV2，不能作为v3→云端证据。

额外差异需明示：网页现行cloud-sync.js:3691先原段上传、失败时跳过本轮统计；应用按已批准最新设计应让完整统计独立可读，不照抄这个耦合。旧云端verifyApplicationAccountPublication还由旧毫秒兼容物化调用，新秒路径不调用；保留兼容不等于整个系统已删除旧门槛。

结论：未完整对齐，不具备开启新v3云端同步的证明。可保留鉴权、分块、冻结版本、幂等ACK、直接采用及秒读取；真实缺口为v3→Child范围统计、已定秒消费、旧来源补发和新原段独立同步。当前Windows新原账→实际发送→云端采用→真实页面固定范围核对缺证；实际多用户、真实改绑、锁屏／休眠、完整Service重启及Mac实机按PO决定延后，不能记PASS。本次不修复，不新建分支／工作树，不提交或部署产品。

## 当前执行：新应用原账→孩子统计→云端读取（2026-10-06，PO批准修改并测试）

本轮贯通应用独立统计，不推进共享、安装、部署或生产migration，不新建分支／工作树。复用Native main与现有标准云端树；既有未提交草稿保留，网页只读对照。

审核纠正：runtime_user_assignments_v2按assignment_version保留历史，云端可用精确历史分配验权。当前分配补发阻断已证实在Native选择器，不据此断言云端历史分配不存在或已经串账。

实施清单：①Native消费已验收v3原账的固定childId、durationSeconds，生成孩子范围及独立来源的日／小时／分类／产品统计，原账内容不变；②冻结统计及队列携带固定孩子，用户／分配版本仅隔离来源与验权，旧孩子待发不因改绑丢弃；③秒统计清单增加可选childId并纳入hash，能力application-statistics-child-scope-v1协商后发送，旧秒清单兼容；云端用机器凭据、用户、精确历史分配核对声明孩子，冲突拒绝，不按当前孩子重解释；④保留现有分块／ACK／版本替换／直接采用／读取，验证新账贯通、改绑前后、两用户、跨日、下降更正、重复与ACK丢失。新原段云端接收另列待接入，不作为完整派生统计可读前提。

当前任务允许路径：共享usage-account契约、Runtime应用统计接收／校验／读取及对应测试、现有任务板／设计；本机代码交Native所属会话。最小测试：契约usage-account、Worker application-accounts／publication、Native真实v3→统计及上传入口、typecheck、必要编译、范围／diff。不跑网页E2E、全平台或安装器。原账103／102及Service7项复用未改部分；真实Windows安装后链路和Mac实机另记，隔离测试不代表上线。

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

## 当前第一步：只贯通应用统计到云端（2026-10-05，PO范围收窄）

- 目标：当前Windows、当前孩子、北京时间当日，在固定截止范围内核对 **Service派生整数秒统计 → 冻结上传 → 云端可读版本 → 主控制台应用使用**。共享结果／余额／提醒执行暂放，不作为本步前提。
- 分工：Native负责已批准assignment作用域秒生成和真实上传的能力协商、后台运行及可核验脱敏摘要；当前会话负责契约／云端接收、持久读取及云端应用页。只修实际失败环节，不混入本机跨分配历史读取、Bridge／Manager秒界面、历史P2、Mac或共享改造；这些仍保留审核缺口，不能冒称修复。
- 已知基线：Native源码08c5133和Contracts1.35生成链隔离证据存在；已安装2.6.34候选对应c2951ea／Contracts1.33，尚不能证明运行新秒生成。云端be39f0c隔离链通过，生产采用与页面当前版本未核实。新旧版本采用范围分别记录，不以received代替已可读，不等待共享receipt。
- 允许路径：现有Runtime云端统计接收／读取、主控制台应用读取、必要契约及任务板；Native实现交所属会话。最小验证复用105项云端接收／更正证据，仅补实际断点相关测试及typecheck／diff。不得改原账／计时，不新增分支或工作树，不为验证重复构建中间安装包，不自动安装、部署、migration或启用共享。
- 完成判据：同一作用域和截止的非零整数秒值及版本贯通四步，页面明确采用该可读统计；同步等待允许保留上次有效值。只报真实已通过步骤、失败步骤及当前修复。当前状态为执行中，非完成。

## 两仓全链路设计一致性审核（2026-10-05，只读审核结果）

**总体结论：未通过完整对齐审核。** 新秒统计生成、冻结上传、云端直接采用和页面秒汇总已有可保留实现；外部本机读取、共享核算仍存在明确断层。不能据此认定必须推翻原账，也不能再宣称“除Mac外开发全部完成”。本节覆盖用户要求的全部领域；证据不足项明确保留，不将函数存在、隔离测试或旧验收当成真实运行通过。审核不实施下列修复。

### 固定基线与证据等级

- 云端工作线：`D:\Codex\TimeOnchrome-worktrees\guardian-release-81949cc`，`codex/cloud-management`，`be39f0ce15c32b2d9fdb786aedf81ffda8f5377f`。审核开始已有3个tracked差异：native-host.ts、native-host-v3.schema.json、DESIGN.md；另有未跟踪秒读取草稿、旧契约包和.wrangler。全部保留，不读取认证缓存。
- 当前会话树：`C:\Users\William\.codex\worktrees\81a1\TimeOnchrome`，`codex/extension-application-usage-v1`，`4408b16d8cbccd34e03258acd3e9a98b900d8f4b`。实际控件工作线：`D:\Codex\TimeOnchrome-worktrees\extension-local`，`codex/integration-access-20261002`，`bbc94969fb73b8ffc8a188ac7c8241f15796810b`，干净。不得把两目录当成同一源码。
- Native主目录：`D:\Codex\TimeWhereNative`，main，`08c51331a077dc2884abdb1da5bf6348901b1b33`，干净；fetch后origin/main一致。Mac当前远端工作线为`origin/codex/macos-session-signals`的`3a57dc36952a837d7ab67550a1cdcffb6863a933`；通过git show读取，未切换或合并。Mac本地树停留旧提交，不能代表另一台机器的新实现。Mac和Windows图标托管树的status经命令级safe.directory只读检查均无差异，未修改全局Git配置。
- 主目录`D:\Codex\TimeOnchrome`：master `2b9d461a6cfa1893c2e55af0c0c343b1b81a1034`，存在混合未提交内容，不适合作为干净发布基线；fetch后远端master为`b146cd7ebaab8c6eadde38315a0fa4296f097412`。
- Task工作线`task-management`：`codex/task-management-v1`，`ddc855aca58752e4a00cc6501fb71120022d735b`，任务板、UI说明、admin及required页面有未提交内容和截图。Santa工作线`santa-management`：`codex/santa-management`，`5b5eb96070243a20c6d2314afcc5a055bcf13edc`，16个tracked差异及008迁移草稿。没有移动、合入或清理。
- Native固定契约包实际哈希通过：1.35.0为`5f700b86f4af4c216cb1054e8c41b749a96a5762d8d4d1a276280dbce231acf6`；上一版1.34.0为`1ce2213b738ed5477a0bfc3713b45a310d215df772d85e6504161ca34793c4b1`。包锁不等于未提交外部读取草稿已交付。
- 只读核验本机Service正在运行，Service、Manager、SessionAgent、NativeHost文件版本均为2.6.34.0。本地2.6.34 manifest标明源码`c2951ea20932565f5aa3bdffe117942b35cb5104`、Contracts **1.33.0**。这不是正在审核的08c5133／1.35秒链候选；安装文件版本与manifest的对应关系尚未由MSI逐文件内容证明，不仅凭版本号认定同一产物。
- 已安装文件SHA-256：Service `63e7fb83d078833c8c59590901245688a0f239fe1f7c558d22adbe65f28c90ff`；Manager `cf15e0319eea12b29b98c67636dc132a1def943006426faeb1c87229a8a278dd`；SessionAgent `a034a6a30ee44ba8897172dd51a3b346158608a99394e8025fa74b641978ab6f`；Host `75d1437050bea7616ccabc6691c32a0fcbcdab159b027b49090f57493f14f07f`。
- 原加载目录候选manifest核验为1.7.42，manifest SHA-256为`c444aa7b38550f8b584b4a3d08acd39d691157758fb2ab871c62c268108e66a3`；这是manifest文件，不是完整候选包哈希，也不证明浏览器当前已经重载。当前会话树另有未跟踪`app-runtime-management/agents/`，原地保留。运行扩展当前版本、各生产Worker／Pages deployment及部署SHA、R2 latest、Mac安装与实机状态本轮**未核实**，不以旧文档代替。没有读取真实数据库或要求用户重装。
- 2.6.34本地Burn／MSI实际哈希与manifest分别匹配：`59ce4cfe6ae508afb721c9aa20a4147007e5b92b17c825f1d996d704797ced4b`／`b1ef3031cc054f7cdb0ba0819e69871914be7954d0bab050186c33ff00323902`。这证明本地安装包完整，不证明新1.35源码已经安装。

下表路径约定：**C**＝上述云端工作树；**E**＝实际控件工作树；**N**＝Native主目录；**M**＝上述Mac远端提交内路径。源码符合记S，隔离测试记T，现场运行记R，部署记P；Matched仅限明确标注证据层，不表示整项产品已验收。

### 完整覆盖表

|要求／领域|实际调用链及证据位置|输入输出与归属核对|测试／实机证据|判断|
|---|---|---|---|---|
|家庭／孩子／机器鉴权|C backend/src/auth.ts:136；applicationAccounts.ts接收入口→applicationAccountPublication.ts:136–180|从机器令牌和服务端分配解析所属家庭／孩子，不以请求自报孩子授予权限|上传隔离测试T通过；生产当前绑定R未核实|Matched(S/T)，R不足|
|SSO、配对及机器令牌生命周期|C Runtime auth、sharedWebSourceBinding.ts:33–57；Santa auth.ts:9–41有独立audience|模块身份不等于网页来源身份；原登录配对没有在本轮改变|未重新执行登录、配对、恢复；既有生产证据不能覆盖当前SHA|证据不足，不判全部通过|
|Agent当前用户隔离|N RuntimeServiceCoordinator.cs:470–475、1538–1557，pipe校验→SID派生本机用户→Dispatcher|校验连接进程session及SID；请求不能指定任意别的用户|S；未操纵其他Windows会话|Matched(S)，跨用户R不足|
|本机用户统计与孩子分配统计同口径|N ApplicationUsageReader.cs:580–613；ApplicationSecondsReader.cs:35–37、96–105|旧总量先按用户汇总，上传投影再筛assignment；新秒读取按user＋assignment。两种范围不是同义|S直接证明；改绑真实对照未做|Deviated：旧读取与上传范围不一致|
|本周最新分类、未归类合法|N ApplicationUsageReader.cs:495–512，原span→历史更正overlay→当前周最新匹配分类|匹配当前assignment才用最新配置；无配置unclassified，旧assignment不套新孩子配置|corrections隔离测试T通过；当前产品配置R未读取|Matched(S/T)，改绑跨周R不足|
|更早历史不追溯|同上：weekStart切分、historicalUnknown保留|未知历史分类仍可有有效时长；不补猜旧字段|S/T；历史P2仍单列|Matched(S/T)|
|不以旧策略版本阻断原始时长|N ApplicationUsageReader当前规则；C applicationAccountPublication.ts新publish入口185–234|新完整统计发布不走旧raw-facts重算核对；旧诊断函数仍存在但不能因此断言新入口调用它|本轮publication/accounts/corrections共105项通过|Matched(S/T)，生产采用未核实|
|网页原账、采集边界|E core/usage-segments.js:43、531、2493，background→原segment追加→物化|usage_segments_v1仍为网页原账；当前审核没有修改采集／结算|没有新增真实浏览器原账复验|证据不足：本轮不能证明所有焦点、idle、锁屏边界准确|
|网页秒分配对照|E core/usage-segments.js:255–281|原网页整数秒按余数／顺序分配；仅作为已批准Native日边界规则对照，不修改网页|S；不扩展为历史重构|Matched(S，对照规则)|
|媒体辅助账不进入主用量|C computerUsage服务只读取web主统计＋application；E已有媒体独立路径|主电脑公式不调用媒体时间作为第三来源|S；强音／视频真实计时R未复验|Matched(S)，采集准确性R不足|
|Native原账与派生统计职责|N ApplicationAccountStore.cs:311、349、396；ApplicationSecondsProjector.cs:40–110|原账读取→独立维度并集／定秒→冻结versions/head/outbox；不是修改原span时长|既有精确主链TRX复用；本轮无数据库改动|Matched(S/T)|
|日边界整数秒及小时分配|N ApplicationSecondsProjector.cs:40–45、72–110；C usage-account V2校验|先北京时间日裁剪、连续并集取整；再分小时；各自守恒，不要求同小时跨维度上界|175项TRX含生成／小时错位；云端实际C#fixture回归通过|Matched(S/T)，真机新规则R不足|
|持久冻结、补发及幂等版本|N ApplicationAccountStore.cs:396–474→ApplicationAccountUploader；C applicationAccounts.ts:155–161→publish|发送冻结版而非临时重新计算；云端按revision替换，新更正可下降|105项T；真实断线／重启R未做|Matched(S/T)，可靠性R不足|
|统计可读不等待原账到齐|C applicationAccountPublication.ts:136–234→publications head→applicationStatisticsNative.ts|核对身份、完整性、分块及hash，直接持久采用；旧账对账不是新发布前提|真实生成fixture经鉴权route的隔离T通过|Matched(S/T)，不是P/R通过|
|新本机秒读取可对外使用|N Service构造Dispatcher启用published读取；Dispatcher.cs:126–132→Store.ReadPublishedAsync:612–616|secondsGeneration启用时旧published接口返回null，Dispatcher抛APPLICATION_USAGE_PENDING；内部ApplicationSecondsReader尚无外部调用|S直接调用链；非当前安装已触发的断言|Missing：秒外部入口；Deviated：启用后的旧入口断链|
|Manager秒消费者|N Setup/ApplicationStatisticsClient.cs:22–50、85|仍请求getApplicationUsage并消费Ms DTO；新内部读取不是Manager已接入|S；未打开窗口验收|Missing|
|控件应用秒消费者|E stats/application-usage-read-model.js:47、62、68、174–187；infra/native-host-client.js:905、947|仍校验totalMs、小时Ms并除1000；没有新秒能力读取|本轮application-usage-read-model测试通过的是旧毫秒行为|Missing，不以旧测试通过判对齐|
|外部秒契约完整交付|C dirty native-host.ts／native-host-v3.schema.json；package.json 1.35.0；untracked application-usage-seconds.ts|草稿引用application-usage-seconds-v2.schema.json实际不存在；package无该模块export；固定包未携带这次草稿|契约typecheck通过，但不能检查缺失JSON引用和发布文件闭包|Missing：schema、打包／兼容闭包及两端消费|
|最新已有统计在重算期间可读|N ApplicationSecondsReader.cs:146–150|存在pending即标complete=false并不返回完整total，虽然旧冻结统计仍存在；统计延迟与无有效统计没有完全分开|S；未用此行为掩盖现有旧值|Deviated／需区分待更新与无可读统计|
|应用只返回应用，网页只返回网页|C computerUsageService.ts:58–80分域；N SharedQuotaExecutionReader.cs:30–72；E shared-quota-execution-reader.js:47–53、118|云端分域接口有了；本地共享仍读取完整混合basis并授权替换自身部分|旧共享访问T通过不能证明新设计|Missing：对称分域实际接线；旧方案被取代|
|本机最新＋云端其他来源|E core/quota-read-model-v2.js:127–146已有网页对照；N SharedQuotaExecutionReader.cs仍VerifySources／basis|现行网页V2实现符合；新应用侧并未换成独立other-sources查询|网页12/12T；Native新结构无运行证据|Matched(网页S/T)；Missing(应用)|
|桥接优先／云端备用／缓存二选一|N SharedQuotaExecutionReader缓存混合清单；E shared-quota-execution-reader同样混合|现有缓存不等于新设计所需的网页／应用分别独立缓存；未证明双向互查不递归|没有符合新方案的实际入口证据|Missing|
|配额独立核算且使用秒|N ApplicationStatisticsExecution.cs:31–43；E product/shared-access-runtime.js:32–41|旧贡献仍要求schema1／milliseconds；还依赖basisRevision及replacementVersions。不能称已退出旧混合前提|shared-access-runtime旧用例通过|Deviated：新独立秒核算尚未接通|
|统一孩子公共配置只读及阶段|C shared-access契约→机器策略；E shared配置消费者；N SharedAccessPolicyCache|有统一配置／缓存及身份；本轮未写配置；兼容投影不可据此宣称旧公共执行路径全部退出|S；两端实际同一配置hash／生效阶段R未核实|Matched(来源S)，执行一致性证据不足|
|共享执行保持关闭|N Service:65–66由cache.HasEnabledScope决定；M Daemon同类开关；E shared-access-runtime:49|不是所有版本硬编码false：运行是否执行取决于有效scope／阶段。不能凭源码默认值证明家庭当前关闭|未查询生产配置或触发限制|证据不足，必须实机核对配置阶段|
|可复用同孩子身份证明|C sharedWebSourceBinding.ts:20–22、33–57；N SharedWebSourceBridge.cs:198后新入口|签名claims绑定家庭孩子摘要、appsource及assignment，服务端核真实分配；有旧流程兼容|S；用户之前已确认成功不等于最新秒链R|Matched(S)，当前连接R不足|
|特殊应用唯一属性|N ApplicationUsageReader.cs:623–637→ApplicationClassifier.IsSpecialApplication|统计按产品catalogGroup的specialApplication；非特殊统计独立并集，普通other不被整体扣除|生成与publicationT|Matched(S/T)|
|特殊产品属性贯通执行|C appPolicy.ts:479；N Service:605–619、1512–1528及WindowsSharedApplicationCloser.cs:84|执行仍依赖isChromeContainer显式true／false及Chrome专用识别；不是统计分类唯一属性的一致消费|S直接证明；未误称现有统计也全部写死Chrome|Extra／Deviated：冗余角色及Chrome特化仍在执行链|
|其他时间与配额分类分离|C seconds projection／电脑公式；N分类允许other，nonSpecial维度|普通other计统计，特殊应用排除三桶；不从页面分类相加反算权威总量|S/T；两端对象限制／提醒全流程R未验|Matched(统计S/T)，执行R不足|
|电脑使用公式|C contracts/computer-usage.ts:42–108；Guardian services/computerUsage与Runtime对应入口|web＋nonSpecialTotal；扣除为appTotal−nonSpecialTotal，不使用specialTotal明细机械相加|computer-usage-cloud及生成fixtureT通过|Matched(S/T)|
|多设备、Child归集、不误扣跨设备|C applicationStatisticsNative.ts:23起按owner/child持久sources归集；computer公式不全局union|来源范围和孩子隔离；不是以Child ID推导物理设备同一性|隔离来源／孩子测试T；多设备真实R不足|Matched(S/T)，R不足|
|两套页面四视图／失败隔离|C pages/index.html:1497–1500；Runtime console/index.html:39、app.js:430–494|电脑→应用→网页→媒体；设备加载不等待用量；旧迟到请求按request版本隔离|电脑云端T、时间8项、网络9项、session3项通过；没有本轮新浏览器验收|Matched(S/T)，布局及真实登录R不足|
|页面确实消费秒来源|C computerUsageService.ts:64–74→秒renderer；原Ms分支显式legacy:80|读取持久统计，不在浏览器重算应用；兼容旧结果不等于新秒生产已上线|实际C#fixture→云端→生产适配器隔离T；当前页面P/R未核实|Matched(S/T)，P/R不足|
|产品／时间线明细完整|C backend/src/v2Routes.ts:260；workers/src/routes/computerUsage.ts:27|秒模式非summary直接返回COMPUTER_USAGE_DETAIL_NOT_READY，不是空白等于零|S直接证明|Missing，不能称四视图全部功能完成|
|提醒送达后60秒／重复ACK不重启|C shared-reminder-lifecycle.ts:226–317；Native持久提醒store／channel|visible及boot／monotonic状态区别于offered；重复delivery有幂等分支|既有状态机证据；本轮未运行GUI／断电测试|Matched(S)，重启／未送达R不足|
|提醒真正前台、正常结束可取消|N SessionAgent/SharedReminderPresenter.cs:112、122、160–164→WindowsSharedApplicationCloser|Topmost／ForcePresentation及取消CTS；正常WM_CLOSE与force Kill区别明确；可见不自动等于全屏已获前台|S；本轮不运行影响前台的测试|源码存在，真实前台／取消验收证据不足|
|超时强制只结束当前对象、不结束浏览器|N WindowsSharedApplicationCloser捕获前台／session核验；C提醒effect分支|正常退出不自动升级；强制独立permit；当前Chrome安全特化仍待产品属性统一|S；不触发应用结束|Matched(正常／强制区分S)，对象安全R不足|
|Mac源码与运行不同层|M MacOSMachineRuntime.cs:104–139、217、387；MacOSApplicationStatisticsContext.cs；ProjectionCycle.cs；该分支共用ApplicationAccountStore|实际Daemon已接投影与上传任务、每用户唯一孩子配置；该远端分支Store仍生成schema1／milliseconds，没有主线secondsGeneration分支；SharedQuotaExecutionReader仍旧结构|源码S；Windows TRX不能替代Mac构建／实机|Missing新秒／对称接线；MacR不足|
|Mac锁屏／提醒／结束能力|M Platform.MacOS/MacOSSharedApplicationCloser.cs；MacOSSharedReminderPresenter及SessionSignals相关源码|helper按明确effect处理正常／强制，并核当前目标；不据此证明锁屏信号每次可恢复|未在Mac运行；最新分支不在main|证据不足，不能给可靠性通过|
|Host职责／断流|N NativeHostProgram及BrowserBridgeProtocol，Host→pipe→Dispatcher|仅framing／转发；不能把Host当统计缓存；新能力须发送接收双方都允许|源码断流退出处理存在；未对运行Host做断流注入|Matched(S)，新秒协议Missing，R不足|
|安装／发布／兼容|N 2.6.34manifest；固定1.35／1.34包；C dirty草稿|已安装1.33基线不是1.35源码；新旧契约锁哈希通过不表示新Host入口打包完整|只读版本／hash核验；生产部署未核实|Missing最终同版候选及R/P对照|
|Task公共接入与默认关闭|C extension/runtime/optional-module-host.js:32–62；task/install.js；stage-main-console-release.js:19–25|基础无模块注册仍可运行；Task安装文件会主动注册；主页面stage明确剔除Task。未找到基础入口直接导入task/install|S；实际候选模块清单、Task分支脏草稿未运行|Matched(模块边界S)，默认关闭产物R/P不足|
|Santa专属权限及公共边界|C native-app-control/worker/src/auth.ts:9–77→admin／applicationBlockPolicies；Santa工作线dirty独立记录|模块票据audience与Child/account核验；Santa enrollment查真实机器及所属Child；不以Runtime机器ACK当Santa执行|S；未执行Santa新008迁移／部署／实机|Matched(权限结构S)，脏草稿及执行验收不足|
|隐私／多余门槛盘点|上述签名和固定包；旧混合basis、replacementVersions、isChromeContainer；partial读取gate|身份安全校验有必要；混合清单和角色冗余是新方案不再要求的耦合。没有全量字段泄漏结论|本轮不读凭据／Profile／原始私密数据库|Extra已列；完整传输隐私运行证据不足|

### 偏离与最小修复范围（建议，不执行）

1. **A-01 范围断层**：旧本机Ms总量按用户，上传按assignment；不能统称同孩子统计。影响旧读取、改绑及本机／云端对照。最小修复是消费者采用已存在的同assignment秒持久读取，并明确历史归属范围；不是重写原计时，也不能把整用户旧事实强行归当前孩子。
2. **A-02 单位／调用断层**：秒head生成已完成，Bridge／Manager／控件与共享消费者仍Ms；启用新模式会使旧published入口不可读。最小范围为一个完整秒契约、Host白名单、Dispatcher实际入口和所属两端消费者一起接通；不能删除null保护后把秒塞进Ms字段。
3. **A-03 旧共享结构仍在**：Native与控件依赖完整混合basis／版本授权替换，未实现最新对称分域查询和独立核算。须替换这一层读适配／缓存／配额输入，保留现有统计、上传和身份模块。不能以旧模块测试通过宣称已完成新结构。
4. **A-04 特殊角色冗余残留**：统计使用catalogGroup，但执行依赖isChromeContainer与Chrome特化；这就是单一属性未贯通。影响新增特殊浏览器及执行准备，不是原时长失效；最小修复限角色投影和执行消费者，安全保护不能未经核验直接删除。
5. **A-05 可用性与新旧状态**：新秒reader把pending作为完整总量不可读条件；云端秒detail接口明确未接通。需要保留最后有效结果并单列更新状态、完成实际明细调用；不是放松身份／hash检查或虚构零值。
6. **A-06 外部契约草稿未闭合**：schema文件、export和固定包未完整，typecheck无法证明JSON引用有效。应集中冻结一个可供两端消费的契约，不按每字段发版；现有1.35生成契约仍可保留。
7. **A-07 版本证据断层**：2.6.34／1.33安装与08c5133／1.35源码不同，Mac最新分支亦未进入main。影响的是“当前机器已经运行新实现”的结论，不足以证明安装损坏或必须全盘返工。

**可保留成果**：原账与采集状态机未被本审核改动；日边界秒投影、原子冻结与补发、云端完整统计直接采用、版本替换、电脑非特殊公式、网页V2自身＋其他来源、页面网络／认证恢复及用量失败隔离。**需要替换的局部层**：旧共享混合清单读适配及核算前提；**需要补齐的层**：外部秒协议／消费者与明细。没有证据支持“所有项目必须推翻”，也没有证据支持“只剩安装测试”。

### 验证证据与缺口

- 本轮实际执行：云端`npm test -- --run test/application-account-publication.test.ts test/application-accounts.test.ts test/application-usage-corrections.test.ts`，3文件 **105/105通过**；第一次沙箱缓存写入EPERM，第二次获准仅隔离测试缓存写入后通过，无生产访问。contracts typecheck通过；computer-usage-cloud单元通过；Runtime app-runtime-time **8/8**、network **9/9**、session **3/3**通过。
- 实际控件工作线：quota-read-model-v2 **12/12**、application-usage-read-model、shared-access-runtime通过。后两项证明的是旧毫秒／混合替换实现，明确不是新设计通过证据。
- 复用Native精确生成链证据：seconds-chain-1.35.trx与1.34.trx各175通过／0失败，文件hash分别`1c04aeb5c5fc641b1cff8557be57f58f2a16ee69d51bb1aadc0f87b86c01b394`、`294d0acf4fd60b534f938fccc0630e72ce3ae276f7924eeaa4d08a7c09d7e391`；只能覆盖其测试输入，不能证明已安装Service或Mac运行。
- 一次测试路径误指tests/unit/app-runtime-time.test.js导致MODULE_NOT_FOUND；查到实际console路径后执行通过。另有只读rg不存在路径／错误repo ref，已按实际路径修正；不伪装成产品失败或产品通过。
- **Windows当前日四步**：本机运行版本已核实；最新规则的实际生成值、实际上传／采用水位、当前生产页面同结果三者均缺固定范围R/P证据。隔离C#fixture链通过不能补齐这些现场证据。
- **Mac**：实际远端Daemon／平台源码纳入审核；Mac编译、安装、当前日统计、Host联调、提醒前台／取消／强制均没有本轮实机证据，不能由Windows替代。
- **跨端可靠性**：改绑、双向启动顺序、桥失联／云端备用、断线／重启不重复、当前缓存孩子／周期隔离及未送达不强制仍需按新结构验收。当前旧结构的保护分支不能当新结构验收。
- 本轮未新增浏览器行为测试、未安装／部署／执行migration、未启用共享、未操作R2 latest、未修改产品代码。仅更新本节；所有工作树及未提交产品差异保留。云端排除TASK_BOARD后的tracked差异摘要审核前后均为`25a14aaee434e6598f4311e846ab4494480afcdc`；Native仍干净。`git diff --check`通过（已有CRLF提示不等于差异错误）。未提交审核文档，不触发发布。

### 旧结论复核与最终状态

|旧结论|复核|漏检原因|
|---|---|---|
|应用统计与网页已完整对齐|失效；生成／云端部分符合，范围、单位、外部及共享消费不符合|只看生成类型／测试，未反向追到实际消费者及启用后的读取保护|
|本机统计成功、上传成功即可视为完整链完成|失效|没有把安装版本、冻结发布水位、持久读取与真实页面纳入同一固定范围|
|除Mac外只剩安装验收|失效|Windows仍缺外部秒接线和新共享结构；不是单纯现场等待|
|云端仍必须原账完全一致才接受全部新统计|对当前新秒发布入口不成立；旧诊断函数不能代表新入口|未区分新publish入口与保留的旧原账核对代码|
|提醒已全面通过|证据不足；源码／部分旧测试可保留，当前真实前台与取消／强制未在本审核证明|接口ACK和窗口visible不等于全屏前台／用户取消生效|
|需要推翻所有工作|证据不支持|明确断层集中在范围适配、消费者和旧共享读模型，原账及新生成／上传／云端存储仍有独立证据|

最终：**Matched**＝表中限定的源码／隔离证据；**Deviated**＝A-01/A-02/A-03/A-04/A-05；**Missing**＝外部契约／消费者、明细、新对称查询及真实当日同版验收；**Extra**＝旧混合清单核算前提、冗余Chrome角色执行门槛。审核覆盖已集中记录，但整体完整对齐**未通过**。后续开发必须以这些局部断层为范围，不能把审核自动转成继续修复或追加安装。

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
## 应用身份统计同孩子绑定隔离（2026-10-10，扩展侧实施中）

应用身份只读统计在每次实际读取前必须建立或复核当前 Native connection 对应的可复用 V2 同孩子证明；同一 `createReusableSharedWebBinding` proof cache 负责复用。该 ensure 只做身份绑定，不启用共享访问，不构建/上传贡献，不改余额、账本或配额。应用统计快照、分页和30秒缓存均绑定证明摘要；切换孩子、断开/重连、分配变化或迟到响应时，整次读取拒绝发布。Native 读入口门禁由 Native 所属任务实施；扩展侧不改 Native 文件或协议字段。另将 `capture()` 的身份部分与共享配额策略 LKG 解耦，避免共享访问未启用时应用身份只读统计无法取得绑定上下文。仅当扩展与 Native 双侧门禁均完成后才能称安全闭环；不打包、安装、部署或托管。
## COMPLETED：休息超额两项已部署，控件文件已更新待重载（2026-10-16）

中等变更按方案完成：云端仅每日/每周休息两项，默认无限制；其余四项保存规范化并在终端有效无限超额，总开关关闭仍全部到线阻断。旧休息值保留，保存取消不写。云端forced-use-cloud-config、Pages字段243项、rest-weekly-cloud-ui-smoke通过；终端forced-use-policy、quota-facts、quota-runtime、admission、admin-readonly、typecheck及Admin桌面/手机专项通过。旧测试按批准的新行为更新，计划各项Matched。

PR278/279已合入master c50d2860964452ad9e3bc15f48355172c7df2ba3，实施提交d862963/e3b009b。精确SHA主控制台CI38793778388通过，生产38793856611成功，仅部署主Pages b1b61088-2302-4fb7-8208-e228475de247。稳定及部署域名index/access-config-domains均匹配Git blob；index SHA256 dcb171488f6943904fcdf928e20496723aa6c3bcfccc47e7d7da6f4fc7456c18。

现有1.7.47 unpacked包完整备份后更新Admin两文件及quota-facts，196文件树SHA256 08a5d677a5711d02e79262a16ed212df000ce0879dfa57395acc5e7745463755；稳定扩展ID、key及部署配置不变，隔离SW/Admin启动通过，更新后差异为0。等待用户重载，不能据文件更新宣称当前运行实例已切换。没有Worker、Runtime、migration、家庭配置、Native或正式CRX/feed变更；原有脏改保留。
