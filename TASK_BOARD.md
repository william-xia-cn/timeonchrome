# TASK_BOARD

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
- 每个任务必须标注阶段（V0/V1）
- 每次只推进单主题小包
- 完成后同步更新本板与 DECISIONS
- 当前正式发布目标为 `V1-minimal release candidate`；V0 证据仅作为 baseline 保留，不作为 formal release 口径
