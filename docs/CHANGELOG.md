# Changelog

---

## [Unreleased]

暂无。

---

## [1.7.28] — 2026-08-31

- **配额周期与解锁修复**：日/周配额统一按 `Asia/Shanghai` 计算；本地与云端配额事实分开保存并按当前周期重新合成，跨日、跨周或云端已解除的陈旧锁不再永久粘住。
- **跨设备 Rest 统计修复**：Guardian Worker 从 `target_stats_v1.quota_bucket` 汇总同一 profile 的全部设备，避免按当前网站分类重新解释历史网页账；Reminder 区分日限额、周限额和时间段锁定。
- **0 秒小时统计自愈**：原始 0 秒诊断分段继续保留，但不再生成统计上传行；空小时重建后仍无正时长时清理对应 outbox。Worker 对旧客户端全零 payload 返回成功 no-op，非法正时长 payload 继续拒绝。
- **日志与页面清理降噪**：`AUTO_MODE_PENDING_CANCEL` 在页面没有 Content Script 时静默完成；重复云同步错误按有界 incident 收敛，恢复时只记录一次摘要，不改变 outbox、重试或账本语义。
- **内部前向止血发布**：仅进入 T.xia / P.xia managed 自托管渠道。媒体/usage 大批量上传可能超过 15 秒并形成部分写入但未 ACK、T.xia `2026-08-31` 原始账与物化统计尚未收敛、`cg.163.com` 的 `idleStateChanged` 少记风险及确定性 `ALREADY_CLASSIFIED` 重试继续保持 `RISK ACCEPTED / DEFERRED`；不适用于 Chrome Web Store。

---

## [1.7.27] — 2026-08-29

- **Rest 软限额提醒**：首次提醒正式定义为可开关的“今日休息软限额”，默认 120 分钟；超额后提醒间隔可独立配置，默认 60 分钟，两项均支持 1–1440 分钟。
- **提醒可见性与文案**：首次与后续提醒分别显示“已达到”和“已超过”及累计超额；只有弹层确认可见后才暂停媒体并启动 60 秒 deadline，首次投递失败重试一次，仍失败时进入完整 Reminder。
- **提醒统计口径**：面板继续显示本周/今日 Rest 已用和真实配额剩余；媒体账本不参与，触发只使用已结算网页账本，允许最多一个 3 分钟 checkpoint 的延迟。
- **Bilibili 媒体证据修复**：贯通 `visibleMediaCount`，按 frame 聚合 Content 强证据并保持视频优先，避免真实可见视频被 `tab.audible` 降为前台音频。
- **网页计时边界修复**：窗口最小化、恢复和系统 idle 时只允许新鲜 DOM 强媒体证据维持网页账；弱音频事实不参与网页配额，零秒媒体分段不再落账。
- **内部托管发布**：Guardian Worker 与控制台 Pages 已先行部署；Product Owner 于 2026-08-29 明确接受 `cg.163.com` 的 `idleStateChanged` P0 已知风险，并批准托管 `1.7.27` managed CRX。稳定扩展 ID、签名、包内容、feed 和线上哈希回读均通过，更新站点 deployment 为 `39cdad15`；该风险保持 P0 / Deferred，不视为已解决，也不适用于 Chrome Web Store 发布。

---

## [1.7.26] — 2026-08-27

- **生产回归修正**：前向恢复既有 Native App 管理页面、桌面/手机入口和 Guardian Child module-token bridge；独立 Native Worker、D1、Santa 数据、扩展 CRX 与更新源保持不变。
- **每周休息配额显式化**：新增独立的 `timeQuota.weekly.restMinutes`，每日配额合计只作计划展示；周中调整立即作用于本周既有网页账本用量，Pages 同步显示周上限、来源、已用、剩余与锁定状态。
- **媒体证据分级**：Content Script 的新鲜 DOM 媒体事实作为强证据，`tab.audible` 降为弱音频证据；Bilibili 等可见视频优先记为视频，不再被 audible fallback 覆盖。
- **网页计时隔离（1.7.26 历史口径）**：当时要求前台媒体同时满足 active tab、窗口聚焦且未最小化，并在窗口失焦时结束前台网页账；其中“所有失焦强媒体均停账”已被 D-069 判定为少记回归并在后续未发布源码中纠正。弱音频事实不得补偿网页 ACTIVE session 或影响配额的规则继续有效。
- **媒体发现完善**：媒体快照覆盖 iframe 与有界 open shadow root，30 秒重申强证据，超过 90 秒的 Content 事实不再维持 idle 网页计时。
- **已知限制**：`cg.163.com` 等 Canvas/WebRTC 流游戏在手柄操作、长过场或超过 90 秒无系统活动时仍可能少记网页时间；本版优先消除失焦多记，后续以白名单式流游戏强证据模型单独处理。

---

## [1.7.25] — 2026-08-20

- **Managed 本地健康心跳**：内部自托管渠道增加 Native Messaging 心跳和健康探测页，用本机 Host 独立确认扩展版本、Profile 实例、脱敏策略摘要与核心监控状态，不依赖网络或云端心跳。
- **权限渠道隔离**：managed artifact 保留 `nativeMessaging` 和探测页暴露，普通/CWS artifact 在 staging 时强制移除；Host 缺失或异常只做有界脱敏降级，不影响计时、拦截和同步。
- **Session 存储 P0 止血**：为 `chrome.storage.session` 增加独立预算、串行写入和诊断数据淘汰；4 MB 进入压力维护并清理到 2 MB，6 MB 为应用硬门，始终为当前业务 session 预留空间。
- **计时业务写入隔离**：`session_v1_persistent` 成功后，内存 session 镜像失败只触发诊断清理与降级，不再中断 timing dispatch、网页结算或媒体处理。
- **诊断限幅**：timing/focus/mode trace 与 info 日志统一进入 session 预算；timing trace 改为紧凑记录并同时受条数和字节上限约束。
- **媒体容错与健康诊断**：媒体和前台 timing 消费者独立捕获错误；连续发现媒体证据却没有 media session/segment 时输出明确的媒体账本缺口事件。

---

## [1.7.24] — 2026-08-18

- **关键 alarm 稳定性修复**：Service Worker 冷启动只补建缺失或周期错误的 alarm，不再取消并重建周期正确的 checkpoint、配额和云同步 alarm。
- **日媒体同步恢复**：日媒体统计达到重试上限后按 6 小时冷却自动恢复；冷却期间保留 dirty 数据但不再每轮制造同步失败和重复日志，空聚合或孤立 outbox 会被清理。
- **时间段分钟精度修复**：云端家长控制台允许学习、复合和休息时段使用分钟级结束时间，并继续严格校验 `24:00` 边界和开始/结束顺序。
- **日志状态口径修复**：云端日志策略摘要会识别已过期 TTL，明确显示孩子端已经回退为默认不上传策略。
- **内部受管包最小化**：managed 自托管 CRX staging 排除不再使用的隐私同意/隐私政策页面；普通/CWS 源码和 managed activation 所需的隐私核心模块保持不变。

---

## [1.7.23] — 2026-08-12

- **已上传副本收敛**：网页/媒体原始分段上传后仅保留当前北京时间自然日；历史小时聚合删除，最近 7 日已上传日聚合继续保留。
- **诊断日志分层**：当前会话 info/timing/focus/mode trace 迁入 `chrome.storage.session`；`chrome.storage.local` 只保留有界 warning/error 上传缓冲，存储压力摘要增加隐私安全的最大 key 统计。
- **Checkpoint 访问路由修复**：前台 checkpoint 发现会话缺失或域名变化时，必须先完成当前目标的访问分类、时间窗与配额路由，再决定是否开账；受限/拒绝目标不得继承缓存 Study 模式。
- **同步与日志降噪**：内部 `MEDIA_STATE` / `TITLE_CHANGE` 消息不再进入通用未知消息告警；网站归类 exhausted 记录支持受控恢复并限制重复告警，陈旧小时媒体 outbox 会按本地聚合事实清理或重建。
- **聚合分段计数修复**：小时 domain/media 与日/小时 managed-target 聚合行的 `segments_count` 改为对应桶的真实分段数，不再把整日或整小时总数复制到每一行。
- **未归类邮件归类基础设施**：增加 15 分钟触发、签名回复、D1 outbox 和邮件路由处理；生产开关与 profile allowlist 继续保持关闭，不改变当前用户行为。

---

## [1.7.22] — 2026-08-06

- **P0 分批同步与 outbox 限幅**：今日快照和历史补传统一按最多 200 条顺序上传；失败错误改为短错误码，并在升级时无损压缩旧 retry/error 元数据，避免长 503 响应按 segment 成倍占用本地存储。
- **存储硬阈值与分级淘汰**：7 MB 进入压力维护并清理到 6.5 MB，8 MB 作为写入前硬门并预留至少 64 KB；日志最多保留 3 天并按严重性与新鲜度淘汰，紧急状态按诊断、已上传副本、未上传媒体、未上传网页的固定顺序降级，任何原始账本损失都写入紧凑审计。
- **网页账务 journal-first**：前台结算必须在完整 segment 或待重放 journal 持久化后才能推进 session；账本读改写进入最高优先级协调，升级时一次性修复旧索引/聚合/outbox 缺口，极限状态以独立 compacted facts 保留总秒数。
- **媒体生命周期恢复**：更新和启动时恢复 `media_sessions_v2`，陈旧媒体 session 最多补记最后证据后 90 秒，防止旧 session 被模式边界结算为数小时媒体账。

---

## [1.7.21] — 2026-08-05

- **P0 本地存储配额止血**：新增扩展端 V1 storage maintenance，在每日清理与云同步前主动修剪 V1 outbox、媒体账本和诊断日志，降低 `chrome.storage.local` 配额爆满导致 settlement、checkpoint 与 cloud sync 连锁失败的风险。
- **落账 outbox 清理修复**：`usage_segments_v1` 同步 outbox 会移除已不存在、过期或无效的 dirty segment，并同步清理 retry/error 元数据，避免失败重试无限膨胀。
- **媒体账本保留期控制**：媒体分段、媒体日/小时聚合和媒体 outbox 增加保留期清理；历史异常媒体统计仍需单独审计，不在本版本自动重建。

---

## [1.7.20] — 2026-08-05

- **网站归类记录统一**：云端网站归类记录与已使用未归类网站采用统一处理入口；统计发现项会先创建或复用审核记录，再通过同一 decision 流程写入配置。
- **媒体计时与诊断增强**：改进前台媒体状态轮询、信号提取边界和本地管理页诊断展示，减少页面状态变化后媒体计时遗漏。
- **任务管理设计基线**：新增日历例程与任务管理 Draft 规格及任务管理 V1 技术设计；本版本尚未启用任务运行时、API 或 UI。

---

## [1.7.19] — 2026-07-31

- **已使用未归类历史解释项**：`target_stats_v1` 中历史曾按待归类/未归类落账、但当前已经归入学习、复合、受限娱乐或黑名单的网站，会在云端“网站归类审核 / 已使用未归类网站”分区显示为解释项，不再造成统计有来源但审核入口不可见。
- **归类记录上传可靠性**：`/device/site-classification-requests/v1` 批量上传中单条异常不再导致整批 HTTP 500，避免本地待审核记录因重试耗尽长期卡住。
- **统一审核入口可见性**：云端“网站归类审核”同页展示显式网站归类记录和已使用未归类网站聚合；两类数据源保持分离，不伪造审核记录。

---

## [1.7.18] — 2026-07-30

- **修复 YouTube 仍被记为复合时间**：Popup 本地快照和 foreground session managed target 落账现在都会先归一化 raw `guardian_config`，避免旧 `compositeList` / `defaultUserCompositeSites` 残留继续把 `youtube.com` 记为复合。

---
## [1.7.17] — 2026-07-29

- **网站访问运行时配置归一化**：扩展端新增版本化 runtime normalization，历史缓存、云端拉取、导入恢复和 cloud version skip 都会先重算 canonical effective 清单，再进入分类、拦截、计时和落账。
- **YouTube 根域语义修复**：`youtube.com` / `www.youtube.com` 根域统一迁移为受限娱乐；具体视频、播放列表和频道继续通过特殊对象规则申请或审批为学习/复合，`music.youtube.com` 不被误迁移。
- **云端与时间段生效修复**：Worker profile effective 合并同步执行当前系统配置语义；后台定时评估会检查当前模式时间段，越界时切换到可用模式或进入 locked 并重检当前标签页。

---
## [1.7.16] — 2026-07-28

- **Popup 绑定状态修复**：修复 Popup 本地快照失败时硬编码显示“本地模式”的问题；已绑定设备会继续按本地 storage、cloud sync 运行态和连接状态显示真实云端绑定状态。
- **访问管理与 YouTube 特殊网站管理跟进**：同步本地 Admin 与云端 Pages 的网站管理、特殊网站规则列表和 YouTube 特殊申请 UI 调整。

---
## [1.7.15] — 2026-07-24

- **未归类网站访问记录 / 学习归类申请拆分**：未归类网站访问自动生成访问记录，孩子手动入口升级为学习网站归类申请；审批前仍按待归类时间和复合模式路由。
- **待归类 / 复合语义迁移**：用户可见文案统一为待归类时间、复合网站和复合模式，内部 legacy `composite` 字段保持兼容。
- **部署与安装器配置跟进**：当前源版本提升到 1.7.15，安装器示例 expectedVersion 同步到 1.7.15；历史 1.7.13 验证记录保持原样。

---

## [1.7.13] — 2026-07-19

- **受管部署免人工同意**：私有受管 CRX 携带部署标记；首次安装或更新时若 managed policy 尚未就绪，扩展保持暂停并重试，不再进入普通用户的隐私同意或手动绑定页面。
- **受管 Token 自动恢复**：读取到匹配目标 Chrome Profile 的 managed policy 后，自动采用 Device Token、刷新 `/device/config` 绑定信息并启动完整同步；普通非受管构建继续保留原有同意流程。
- **部署与更新校验同步升级**：manifest、managed schema、部署模板和自托管打包校验统一到 1.7.13，并保持原扩展 ID 与生产更新地址不变。

---

## [1.7.12] — 2026-07-19

- **修复受管绑定账户信息为空**：`/device/config` 随 Device Token 配置返回所属账户邮箱与 Profile 名称；扩展在首次采用 Token 及后续配置同步时持久化显示元数据，使管理中心的“账户/用户”与实际云端绑定一致。

---

## [1.7.11] — 2026-07-18

- **修复自托管后续更新链路**：manifest 声明生产 `update_url`，部署策略设置 `override_update_url: true`，使缺少 manifest 更新地址的 1.7.9 也能通过受管策略升级。
- **使用新版本与新 CRX 路径发布**：避免同版本、同路径覆盖产生的 CDN 旧 CRX 缓存，确保 Chrome 获取包含 managed schema 与更新地址的实际新包。
- **修复 macOS MCX 计算机匹配**：本地计算机记录补齐 Hardware UUID，导入后强制刷新并验证当前用户的有效策略，避免 MCX 数据存在但 `chrome.storage.managed` 仍为空。

---

## [1.7.10] — 2026-07-18

- **修复受管 Token 自动绑定**：扩展 manifest 声明 `storage.managed_schema` 并随包携带严格的 managed storage JSON Schema，使 Chrome 能向扩展发布 `managedDeviceToken`、`cloudEndpoint`、`managedProfileEmail` 等受管字段。
- **更新后立即采用受管 Token**：安装或升级完成后重新解析受管激活状态；目标 Profile 匹配时立即通过 `/device/config` hydrate 绑定并触发完整同步，不打开手动绑定欢迎页。
- **发布与验收加固**：自托管 CRX 打包门检查 schema 入包、manifest/schema/策略字段一致性和原签名私钥派生 ID；真实验收日志只记录布尔状态、版本、HTTP 状态与错误码。

---

## [1.7.9] — 2026-07-09

- **Managed DeviceToken 统一绑定**：内部受管部署通道收敛为 `Device + DeviceToken` 模型。受管 policy 使用 `managedDeviceToken + cloudEndpoint` 激活终端；legacy `tenantId/devicePolicyId` 仅作为旧模板兼容 fallback。
- **云端受管终端管理**：家长控制台可在子用户设备区域预创建受管终端、导出 Device Token、重置 Device Token，并生成 macOS / Windows managed policy 片段。手动绑定创建的 device 与云端预创建 device 使用同一种 `device_token` 同步协议。
- **终端自动采用受管 token**：扩展在 managed policy 激活且本地缺少 `cloud_device_token` 时，会采用 `managedDeviceToken`，通过 `/device/config` hydrate profile/device 信息，并立即执行完整云同步。已有本地 token 时不会被 policy 覆盖。
- **受管部署文档更新**：新增 `MANAGED_DEVICE_TOKEN_POLICY_DEPLOYMENT.md`，统一说明 Windows HKCU、macOS policy keeper、云端 token 创建/导出/重置、验证、回滚和 token 保密边界。真实 token、PEM、CRX 产物仍不得提交到 Git。

---
## [1.7.8] — 2026-06-25

- **CWS Purple Nickel consent gate**: added an in-extension prominent disclosure and explicit consent page before TimeOnChrome starts new timing, media recording, cloud sync, diagnostic upload, or Chrome identity recovery. Missing `privacy_consent_v1` now keeps the extension paused and preserves existing local credentials/config without deleting them.
- **Privacy policy alignment**: package privacy policy and CWS materials now state that collection starts only after the user clicks `我已阅读并同意，启用 TimeOnChrome`, and that cloud upload starts only after parent login and device binding.
- **UI consent state**: Popup, local Admin, and bind flow now show `隐私与数据使用说明待确认` and route users to the consent page instead of starting cloud login or identity recovery before consent.

---

## [1.7.7] — 2026-06-22

- **CWS Purple Nickel privacy remediation**: public privacy policy, package privacy page, CWS listing, and reviewer notes now use a Chinese-first prominent disclosure that explicitly covers collection, processing, storage, sharing, retention/deletion controls, cloud sync timing, and `identity.email` no-OAuth/no-raw-identity boundaries.
- **CWS package refresh**: rebuilt the Chrome Web Store package so the submitted ZIP contains the updated privacy policy instead of relying on metadata-only resubmission.

---

## [1.7.6] — 2026-06-09

- **Legacy cloud sync hardening**: old device clients remain compatible with current Worker schema, and device-token endpoints now avoid schema drift turning into opaque 500 responses.
- **Device connection audit**: cloud Worker records server-side `/device/*` request summaries so parents and maintainers can distinguish no request arrival, auth failure, server failure, payload failure, and successful heartbeat/config/sync paths.
- **macOS / Windows device binding recovery**: new clients may read the Chrome profile account identifier with `chrome.identity.getProfileUserInfo()` and send it only as a server-side HMAC hash. This supports recovering the same `deviceId` after extension reinstall when a child profile has one eligible device on the same macOS or Windows platform. The feature does not use Google OAuth, does not call `getAuthToken()`, and does not store Google OAuth tokens or raw Chrome identity values.
- **Recovery request stability**: pending recovery requests are now idempotent. A terminal waiting for cloud confirmation polls the existing request instead of creating duplicate requests, and unique same-platform candidates recover automatically even when the old device was recently active.
- **Immediate sync after recovery**: when a heartbeat path restores a device binding, the extension immediately triggers a full sync so website rules, quotas, time windows, and pending requests return to the terminal without waiting for the next regular sync cycle.
- **CWS privacy and permission notes**: Chrome Web Store materials now explicitly document the `identity` / `identity.email` purpose, the non-use of OAuth, server-side hashing of Chrome identity, device audit boundaries, and Purple Nickel privacy-policy remediation.

---

## [1.7.5] — 2026-05-29

- **Account session refresh tokens**: cloud auth now supports refresh-token sessions alongside the legacy `/auth/login -> token` response. New clients store `account_token`, `account_refresh_token`, and `cloud_account_email`; they no longer save reversible `cloud_credentials`. Existing clients and legacy no-exp account tokens remain compatible.
- **Password-change binding safety**: changing an account password revokes parent refresh sessions but does not revoke `device_token`. Already bound terminals continue syncing until explicitly unbound in cloud device management, local extension data is cleared/uninstalled, or the Chrome extension ID changes.
- **Product icon refresh**: extension toolbar icons, mode badge overlays, local Admin, Popup, Reminder, and cloud Pages now use the updated TimeOnChrome visual system and high-contrast app icon assets.
- **Cloud and local management IA refresh**: cloud Pages now emphasizes `使用统计`, `访问管理`, `网站归类申请`, `子用户管理`, and `系统管理`; local Admin access management is split into website, quota, schedule, and classification request tabs.
- **Configuration import review**: cloud profile config import now uses a diff-confirmation flow for site access, quota, and time-window settings before applying selected changes.
- **Unified timing and mode audit logs**: checkpoint health now records before/after foreground/media session and segment counts, mode-boundary queue health, and ledger-gap status. `client_logs_v1` accepts `checkpoint`, `ledger_gap`, and `mode_transition` categories, and local Admin can filter by category and `auditId`. The gap detector reports when TimeOnChrome observes eligible browser activity or media facts but no durable `usage_segments_v1` / `media_segments_v1` result appears after checkpoint; it does not read Chrome History or backfill history.
- **Timing inbound audit log**: local `__timingTrace` now records normalized timing-module inbound messages with `timing_inbound_received/routed/skipped` and shared `auditId` correlation for dispatcher signals, mode boundaries, checkpoints, read/action flushes, and lifecycle recovery. This is diagnostic-only local trace data and is not uploaded or used for settlement aggregation.
- **Known risk — YouTube canonical URL policy**: YouTube playlist/video handling remains a temporary canonical URL strategy, not the final managedTarget model.

---

## [1.7.4] — 2026-05-28

- **Mode time-window enforcement**: `timeWindows.daily` now controls runtime access and user-confirmed mode entry for Study, Composite, and Rest. `compositeWindows` is added as a first-class mode window; `onlineWindows` is display-only (`study ∪ composite ∪ rest`). Empty arrays, missing fields, and `null` all mean all-day allowed.
- **Clear schedule Reminder copy**: outside-window blocks now use mode-specific reasons and copy: `study_schedule_locked`, `composite_schedule_locked`, and `rest_schedule_locked`. Legacy `schedule` remains only as a fallback when `timeWindows.daily` is absent.
- **Cloud profile config import/export**: cloud Pages account settings now export/import profile-level configuration for site access, quotas, and time windows. The site access export separates system defaults, parent custom lists, approval-generated URL rules, and request history; the old site-management-only import/export entry has been removed.
- **Local Admin system status**: terminal Admin `系统管理 → 本机状态` now displays the current account email, bound user/profile, profile short id, local device name, and device short id in compact rows.
- **Pages structure fixes**: cloud Pages `统计对账` and `设备管理` are restored as top-level pages instead of being hidden inside `系统管理`.
- **Chrome Web Store materials note**: prior v1.7.3 CWS package and submission notes remain at `dist/cws-v1.7.3-20260526-001206/`. ZIP SHA256: `2021828E0C94C36629C946E30E971FC93F5B875690C78731324048A4CD020766`.

---

## [1.7.3] — 2026-05-24

### V1-minimal release candidate
- **Release artifact prepared**: `dist/v1-minimal-20260509-023832/timeonchrome-v1.7.2-v1-minimal.zip`
- **Release SHA256**: `A0A5C541A5A7D047E040D2163BF8735971798112E18E1D223BB9D55D80D7190B`
- **Chrome Web Store reduced-permission package submitted**: `dist/cws-resubmit-20260509-122919/timeonchrome-v1.7.2-cws-resubmit-minimal-permissions.zip`
- **Chrome Web Store resubmission SHA256**: `BE0F712285B6661C293175C649DDDC48E0D04217B18626EB3C284EEAB32DD71C`
- **Chrome Web Store status**: `TimeOnChrome 1.7.2` submitted / `待审核`; not publicly released.
- **In-page mode notice delivery**: current unpacked source no longer keeps the `scripting` permission for mode notice fallback injection. Page notices use static `content_scripts` plus a per-tab pending/`CONTENT_SCRIPT_READY` delivery queue, with system notification fallback for non-injectable pages or delivery timeout.
- **Chrome Web Store text prepared**: see `docs/releases/chrome-web-store-submission-v1-minimal-2026-05-09.md`
- **Release record prepared**: see `docs/releases/v1-minimal-release-2026-05-09.md`
- **ReleaseMg production acceptance**: PARTIAL / NOT CLOSED; production-profile readonly smoke still requires completion or explicit Product Owner waiver.

### V1-minimal gate close-out
- **ManagedTarget ledger implementation**: ordinary stats and quota attribution now have a `managedTarget + fallback domain` path while `domain` remains factual/diagnostic/compatible. Terminal `usage_segments_v1` snapshots target attribution and `quotaBucketAtTime`; local daily/hourly stats include `targets`; cloud upload/Worker/D1 adds target segment fields plus `target_stats_v1` / `hourly_target_stats_v1`; Pages and admin read models prefer target stats when available. See `docs/MANAGED_TARGET_LEDGER.md`.
- **Screen Time usage analysis**: cloud Pages and local Admin “使用分析” now use the same parent-facing Screen Time structure: day/week switch, device scope, date navigation, total time, stacked category bars, category legend, and managedTarget/category lists. The page now has two explicit ledger tabs: `网页使用` reads foreground/page target stats, while `媒体使用` reads media stats by media class. Media is no longer merged into the foreground/page category chart. Cloud labels the source as sync data; local Admin labels the source as local data and reads only `chrome.storage.local` through `admin-read-model.js`. Raw segments, Open/Close reasons, tab/window ids, and reconciliation remain diagnostic views, not the ordinary usage analysis page.
- **Quota config read model alignment**: `timeQuota.daily` is now the primary quota source across Pages, Worker/device config, local Admin and runtime quota evaluation. Legacy flat quota fields remain compatibility fallback only, and exhausted Study/Composite/Rest/Online quotas are synchronously re-evaluated before user-confirmed mode entry.
- **Fallback observability**: extension runtime operational fallbacks now write client logs with warning/error severity through `logFallbackEventBestEffort()`, covering page-notice delivery fallback, quota/config fallback, checkpoint/recovery estimated settlement, stats read-model fallback, active-tab recheck fallback, and PiP cleanup failure. Normal managedTarget/domain fallback attribution is not logged per row.
- **Reminder/site classification reliability**: reminder redirects preserve the original http/https target URL for popup classification requests, YouTube watch URLs with playlist context are canonicalized to playlist URLs at submission time, and popup request results are shown directly in the popup instead of relying on automatic tab navigation.
- **Release blocker — YouTube managed target redesign**: current YouTube handling is a temporary canonical URL policy. Watch URLs with `list` are stored as `https://www.youtube.com/playlist?list={playlistId}` and standalone videos as `https://www.youtube.com/watch?v={videoId}`, but both remain `targetType=url`. Before formal release, design explicit YouTube playlist/video/platform-entry targets, labels, conflict rules, approval UX, quota wording, cloud/Pages display, and migration from the temporary canonical URL representation.
- **Cloud Stats v1 minimal sync**: `usage_segments_v1` + `stats_v1` active release truth path verified.
- **Recovery/System Gate**: closed with manual evidence; manual network, lock/unlock, and sleep/wake checks are recorded as operator-confirmed evidence, not fully automated PASS.
- **Mode transition UX**: prompt delivery restored; popup/reminder mode switches now enter the Mode Service request path; Study/Composite/Rest routing uses `guardian_session.currentMode` as truth; automatic Rest -> Study/Composite access routing switches immediately and starts a 30s `restExitGraceUntilMs` window before Rest-target reminders are shown. Manual popup switches clear any existing grace and do not create a new one; Reminder confirmations and quota-driven mode changes do not create that grace window.
- **Video playback accounting**: idle + media no longer collapses to IDLE; natural media and fullscreen accounting are verified. PiP is now treated as a disabled/control-risk fact, not a supported playback mode.
- **Global PiP disable policy**: current policy is `disallow_all`. Media timing / pip-policy may attempt shared `EXIT_PIP` cleanup when it observes `isPiP=true`, an open `pip` media session, media checkpoint, or media mode-boundary consumption. Successful cleanup writes `pip_forbidden_cleanup`; failed cleanup preserves the factual `pip` session and records `pip_forbidden_cleanup_failed` diagnostics.
- **PiP cleanup ownership**: PiP cleanup is owned by `media-timing` / `pip-policy`. Mode/product transition code does not import, call, or record PiP cleanup; mode boundary is only a system accounting signal that media timing consumes independently.
- **PiP policy notice**: when foreground PiP is actually closed by policy, the content script shows a large, explicit, non-blocking in-page notice for 5 seconds: `TimeOnChrome 当前禁止 PiP 播放，后续版本会陆续放开。`
- **Time borrowing**: current implementation remains disabled/deferred for V1-minimal.
- **Legacy cloud stats cleanup**: remains out of scope and carried as known risk.
- **Cloud/terminal settlement diagnostics aligned**: usage segment upload now includes `tabId` / `windowId` / `description`, and cloud `usage_segments_v1` stores them as `tab_id` / `window_id` / `description_json` for Pages Open/Close remarks. Media segment upload also stores `description_json`. Cloud `/device/*` writes use token-derived `device_id`, and daily `stats_v1` is rebuilt with `(profile_id, device_id, date, domain, channel, mode)` uniqueness so multiple devices no longer overwrite each other for the same day/domain/mode.
- **Recovery/heartbeat timing semantics change**: recovery is being narrowed to extension lifecycle boundaries (`runtime.onStartup` / `runtime.onInstalled`) and no longer runs on ordinary Service Worker module-load wakeups. `heartbeat` no longer proves session liveness or participates in timing close decisions. Before formal release, run recovery/checkpoint regression and confirm sleep/restart gate docs match the new lifecycle-only recovery model.
- **Checkpoint supplemental settlement**: `periodicCheckpoint` is now documented as a supplemental timing settlement and sampling reconciliation mechanism. Normal matching samples write `periodic_checkpoint`; inconsistent open/closed session state is repaired with half-interval `checkpoint_estimated_close/open` diagnostics.
- **Release blocker — sub-second segment product decision**: local settlement now keeps sub-second foreground switches as complete `usage_segments_v1` facts with `durationSeconds = 0` instead of dropping them. Before formal public release, decide and implement the final product policy for these short segments: keep as-is, add millisecond duration support, merge adjacent short switches, or hide/filter them in UI/cloud reports.
- **Release blocker — unknown-page short slice policy**: `tabActivated` may open `unknown-page.chrome-local` when URL is temporarily unavailable, then `tabUpdated` closes that short unknown segment and opens the real domain. This preserves raw event order, but can hurt ledger readability. Before formal release, decide whether to keep the slices, merge adjacent short slices, backfill once the real URL arrives, hide/fold them in UI, or split diagnostic facts from user-facing usage rows.
- **Managed statistics layer**: statistics semantics are centralized in `extension/stats/managed-statistics.js`. `daily_usage_stats_v1` and `daily_media_stats_v1` remain ledger-owned materialized indexes, while popup/admin/quota consume managed views instead of reinterpreting raw stats in each consumer.
- **Hourly materialized stats**: added local `hourly_usage_stats_v1` and `hourly_media_stats_v1`, plus cloud sync payloads, Worker endpoints (`/device/hourly-stats/v1`, `/device/hourly-media-stats/v1`) and D1 tables (`hourly_stats_v1`, `hourly_media_stats_v1`). Cross-hour splitting happens only in the materialized index layer; original `usage_segments_v1` / `media_segments_v1` facts are not physically split by hour.
- **Quota alarm mode transition**: the local 1-minute `quota_check` alarm is restored as a local-only quota expiry entry. It evaluates settled managed stats, writes `quotaState`, and enters Mode Service through `EVALUATE_QUOTA_STATE`; it does not scan all tabs or redirect directly. Cloud quota pull only saves `quotaState` facts and does not trigger mode transitions, Reminder, or tab rechecks.
- **Locked mode**: added formal runtime mode `locked` for exhausted online/study quota states. `unknown` remains ledger fallback only, not a product mode.
- **Media ledger cloud path alignment**: media timing uses independent `media_frame_facts_v1` / `media_facts_v1` / `media_sessions_v2` / `media_segments_v1` / `daily_media_stats_v1`, with classes `foregroundAudio`, `backgroundAudio`, `foregroundVideo`, `backgroundVideo`, and `pip`. It is not part of `buildUsageSegmentsUploadPayload()` or ordinary `usage_segments_v1`, but current code has dedicated media outboxes and Worker endpoints (`/device/media-segments/v1`, `/device/media-stats/v1`). Before formal release, finalize whether and how this becomes a product-facing cloud/Pages/admin quota view.
- **Release blocker — PiP product redesign**: PiP is globally forbidden for the current version because it can keep playing while Chrome is minimized and bypass ordinary foreground/background assumptions. Before formal release, decide whether study/composite PiP should ever be allowed and, if yes, design the full stats/quota/cloud path: media ledger semantics, quota counting, upload payload, Worker validation/insert, D1 migration, cloud query, Pages/admin/popup display, and parent-facing wording. Until that decision is implemented, PiP must not ship as partially supported.
- **Foreground/media separation pending**: media facts now have an independent local media ledger, but foreground still keeps the legacy `foregroundMediaActive` compensation/query path for compatibility. That path is now limited to old open foreground sessions through `queryForegroundMediaForOpenSession()`: `tab.audible` is only a positive fast path and `media_facts_v1[session.tabId]` is only a fallback before closing old foreground usage; media facts must not open new foreground sessions. This remains a legacy release item; before formal release, decide when to remove foreground reads of media facts and move combined analysis fully to read/display time.
- **Media frame aggregation**: content-script `MEDIA_STATE` now records frame-level media facts and derives a tab-level media fact before opening/closing media sessions. A stopped subframe no longer closes a tab media session while another frame in the same tab is still playing.
- **MEDIA_STATE polling throttle**: content-script media polling now uses a single 1s sampling loop; state changes still report immediately, while unchanged active media is reaffirmed every 30s only to cover muted media / missed DOM event cases. Reaffirmation is a fact refresh, not a settlement boundary.
- **Timing pipeline decoupling**: `background.js` is now documented as Chrome listener wiring only. Timing work is split into `core/timing-dispatcher.js`, `core/foreground-timing.js`, `core/media-timing.js`, and `core/checkpoint-scheduler.js`; foreground usage segments and media segments are separate ledgers, and checkpoint runners are independently traced/fail-isolated. Cloud segment schemas are now aligned through the dedicated cloud/terminal settlement diagnostics change above.
- **Mode boundary reliable signal**: manual/auto mode switches now enqueue durable `mode_boundary` intents and return after the intent is stored. Foreground and local media open sessions consume the same boundary asynchronously through the timing dispatcher so mode-based stats are split by the effective boundary time. Popup/admin read-before-flush remains a known legacy path for later read-model cleanup.
- **Cloud sync reliability hardening**: MV3 Service Worker wakeups now hydrate cloud sync memory state from `chrome.storage.local` before routing runtime messages. Cloud requests use AbortController timeouts, and stale `syncState.isSyncing` locks are reset after a bounded interval so a hung fetch cannot leave binding/sync unavailable for hours.
- **Local-mode login availability**: admin initializes login/navigation handlers before `GET_CONFIG`, keeps the login form usable if background cold-start messaging fails, and the local read-only “本机状态” page exposes a stable “登录/绑定云端” entry. Popup remains local-use focused and only displays binding status plus the management entry.
- **Temporary composite visibility**: local admin “访问规则” now shows the current session-scoped temporary composite requests (`tabId`, domain, createdAt) without writing them to permanent cloud or local composite rules.

### 修复
- **Study → Unclassified 双导轨缺失**：`reminder.html/js` 实现同页双滑动轨道（Case #5/#6），默认路径「进入休息时间」+ 申请路径「申请使用综合时间」，符合矩阵文档 §6.4 和 UX 文档 §8.2b 要求
- **khanacademy.org 误分类**：`infra/cloud-sync.js` `normalizeCloudRulesConfig` 始终合并 `DEFAULT_CONFIG.studyList` 基底，防止云端空/稀疏 studyList 覆盖本地默认学习网站

---

## [1.7.2] — 2026-04-29

### 修复
- **无痕模式提醒页无法加载**：`manifest.json` `"incognito"` 从 `"spanning"` 改为 `"split"`，Chrome MV3 下无痕标签页可正常加载 `reminder.html` 等扩展页面
- **Service Worker 隔离**：常规/无痕模式各自独立 SW 实例，`chrome.storage.session` 会话快照隔离，互不干扰
- **动态 import() 在 SW 中不允许**：`infra/cloud-sync.js` 改为静态 import
- **CORS 预flight 缺少 PATCH 方法**：`workers/src/index.ts` `Access-Control-Allow-Methods` 补充 `PATCH`，修复浏览器端档案改名、设备重命名、监控开关等 PATCH 请求报 "Failed to fetch" 的问题
- **PATCH /profiles/:id 响应不一致**：后端现在返回更新后的完整 `profile` 对象，与 `POST /profiles` 保持一致，前端无需 fallback 即可更新本地状态

### 网站访问默认清单对齐
- `defaultStudySites` = 149 域名，系统配置合并后 `studyList` = 155
- `defaultCompositeSites` = 24 域名（含 7 个 vendor/support 例外 D-016），系统配置合并后 `compositeList` = 24
- `defaultRestrictedEntertainmentSites` = 14 域名
- `defaultBlockedSites` = 2 域名
- 新建 API profile 时默认配置立即生效，无需等待首次 `PUT /config`

### Worker config/default fixes
- 修正 `dailyOnlineQuota=0`（不限）、`dailyStudyQuota=0`（不限）、`dailyRestQuota=120`、`dailyUndeterminedQuota=60`
- `mergeWithDefaults()` 在 `device/bind` 时即合并系统配置 + 自定义配置，确保新建 profile 的有效清单立即可用
- `PUT /device/config` 自动递增 `version`，增量同步可靠

### UI / 术语
- **使用分析 今日/本周整合**：管理面板「使用分析」页合并今日与本周统计，避免信息重复
- **后台媒体 = audioSeconds + pipSeconds**：popup 与 admin 统计行展示后台媒体总时长，包含音频与 PiP
- **待归类 terminology cleanup**：
  - `待定时长` → `待归类时长`
  - `待定网站` → `待归类网站`
  - `学习目录` → `学习网站`
  - admin 待归类列表中 `待审核` / `申诉中` 统一显示为 `待归类`（D-015 占位，待 PO 终审）
- 家长控制台 UI：系统配置区域默认折叠，可展开查看；自定义区域默认展开，便于编辑

### Stage 1 Soft Gate
- 孩子端入口（popup 设置按钮、未绑定横幅、reminder 查看详情）通过 `?view=stats` 以只读模式打开 `admin/admin.html`
- `admin/admin.js` 添加 `isChildView` 分支，隐藏 login / register / bind / logout / rebind 等家长控件
- 未绑定设备时显示简化提示「设备未绑定，请联系家长完成设备绑定」，不暴露登录表单

### 部署
- **Pages console deployed**：家长控制台 `timeonchrome-console` 已部署至 Cloudflare Pages
- **Workers deployed and verified**：`guardian-api` 后端运行中，D1 / KV / R2 正常

### RC 验证
- RC tag: `v1.7.2-rc1` (commit `aa8de9e`)
- RC smoke tests: 8/8 passed
- Workers API tests: 55/55 passed
- E2E tests: 11/11 passed
- Background logic tests: 79/79 passed
- **No V0 blockers found**

### 发布说明
- **Chrome Web Store NOT published** — 本次 release closeout 任务仅生成本地 release artifact，Web Store 提交为独立 future task
- V0 版本 1.7.2 已完成发布状态归档，准备用于非 Web Store 分发（如手动加载 unpacked extension）

### 影响
- `chrome.storage.session`：常规/无痕各自维护独立 session，SW 重启恢复仅作用于当前上下文
- `chrome.storage.local`：配置、统计、配额状态在两种模式间共享
- 云同步、declarativeNetRequest 规则在 split 模式下正常工作

---

## [1.7.0] — 2026-04-21

### 架构重构（事件驱动注意力引擎）
- **模块化架构**：`background.js` 从 2301 行拆分为 12 个模块（core/5 + runtime/2 + product/3 + infra/2），按数据流分层：signal → context → state → session → event-log → aggregate → decision
- **事件驱动计时**：废弃旧版"心跳累加"模型，采用事件驱动注意力引擎，解决多标签页重复计时问题（3 个 YouTube 标签不再 = 3 倍时长）
- **micro-batching**：80ms 事件合并窗口，消除高频信号抖动
- **状态机重构**：ACTIVE / BACKGROUND_ACTIVE / PASSIVE / IDLE 四态分类，PASSIVE 不计入时长（计为 0）
- **append-only 事件日志**：只追加 START/END 事件，永不修改，支持 10 分钟时间窗口压缩

### 新增
- **SW 重启恢复机制**：`recovery.js` 在 Service Worker 启动时执行，90s 休眠检测阈值，自动补写 END 事件，重建活跃会话
- **会话快照**：`session.js` 作为单一真相源，每 30 秒持久化到 `chrome.storage.session`
- **ES Module 支持**：`manifest.json` 添加 `"type": "module"`，要求 Chrome 95+

### 修复
- **多标签页重复计时**：旧架构 3 个 passive 标签页重复累加，新架构通过 context 去重
- **SW 休眠后状态丢失**：旧架构 `mediaPlayingTabs` Map 和 `domainActiveStartTime` 在 SW 重启后丢失，新架构通过 recovery 重建
- **无域名污染**：无域名时返回 IDLE，防止 `chrome://` 页面计入时长
- **存储 Key 统一**：`device_token`/`profile_id` → `cloud_device_token`/`cloud_profile_id`（8 个文件）

### 变更
- `background.js` 从 2301 行缩减至 ~180 行（wiring 入口）
- 旧 `background.js` 保留为 `background.js.bak`
- manifest 版本号：`1.6.1` → `1.7.0`

---

## [1.6.1] — 2026-04-20

### 新增
- **OpenCode MVP 工作流**：`.opencode/` 目录，Plan(Kimi) → Build(DeepSeek) 双模型协作
- **开发规范文档** `AGENTS.md`：文档先行、任务拆分、数据同步原则

### 修复
- **存储 Key 不一致**：`bind.html`/`auth.js`/`sync.js` 统一使用 `cloud_` 前缀
- **绑定后云同步未启动**：`bind.html` 绑定后发送 `CLOUD_BIND` 消息
- **家长控制台网站名单为空**：`compositeList` → `allowList` 字段映射修复
- **manifest 版本号**：`1.6.0` → `1.6.1`

### 架构变更
- **终端不再推送配置**：删除 `pushConfigToCloud()` 及所有调用点，确立云端为唯一配置源
- **清理旧版备份**：删除 `extension/` 目录（4 个重复文件）

---

## [1.6.0] — 2026-04-14

### 新增
- **三时段时间分类模型**：学习 / 待定 / 休息三类独立计量；compositeList 域名消耗待定配额，家长事后审核分流
- **会话追踪与家长审核**：R2 归档会话数据，家长可将待定会话重分类为学习/休息；孩子可对家长判定提起申诉
- **周配额 + 日间借用**：每周总配额上限；孩子可向明天借出最多 60 分钟休息配额（周内借出，下周一还清）
- **加入待定网站时邮件通知家长**：孩子在学习模式下将网站加入 compositeList，家长收到邮件通知（每域名每小时最多 1 封）

### 变更（UX 理念重构）
- `blacklist` → `unsafeList`：黑名单改为"不安全网站"，是唯一的硬拦截，基于安全而非权力
- `whitelist` 概念删除：只有"学习网站清单"（studyList），不是访问权限列表
- `blocked.html` → `reminder.html`：拦截页改为友好提醒页，7 种场景各有对应操作选项
- `config.mode` 值：`'whitelist'`/`'blacklist'` → `'study'`/`'rest'`
- 通知文案全面改为友好语气（"今天的上网时间用完啦 🌙" 等）
- manifest description 更新为"上网时间管理助手"

---

## [1.5.0] — 2026-04-11

### 新增
- **云同步架构**：Cloudflare Workers 后端（D1 + KV + R2），账号注册/登录/设备绑定
- **三档时间配额**：`dailyOnlineQuota` / `dailyStudyQuota` / `dailyRestQuota` 独立计量和锁定
- **设备自动识别**：绑定时检测 OS + 4 位随机码，如 `Windows · Chrome · A3F2`
- **设备管理 API**：`GET /profiles/:id/devices`、`PATCH` 重命名、`DELETE` 解绑
- **配置变更日志**：`/device/changelog` 记录最近 100 条配置变更历史
- **Session 上传**：会话数据通过 `/device/sessions/upload` 存入 R2
- **孩子友好 UI**：Popup 重写为只读激励视图（进度条 + 今日摘要）
- **管理面板精简**：6 个导航页合并为 4 个（时间段并入访问规则，配额并入今日使用）

### 修复
- **时区 bug**：所有 `toISOString()` 替换为本地时间 `formatDate(getLocalDate())`，修复 UTC+8 日期切换偏移
- **每日重置防重复**：`daily_cleanup` alarm 加入 `LAST_RESET_DATE_KEY` 日期守卫，防止一天内重复重置配额
- **多设备配额冲突**：`pullCloudConfig` 将 `quotaState`、`lockedDomains`、`tempWhitelist` 列为本地保护字段，不被云端覆盖
- **推送配额字段缺失**：`pushConfigToCloud` 补充三档配额字段
- **SQL 注入**：Workers 约 35 处 SQL 改为 D1 参数化查询 `prepare().bind()`
- **伪 JWT**：`btoa(email + secret)` 替换为 Web Crypto HMAC-SHA256 标准签名

### 变更
- `dailyQuota` 字段废弃，拆分为 `dailyOnlineQuota` / `dailyStudyQuota` / `dailyRestQuota`
- admin panel 导航：今日使用 / 访问规则 / 使用分析 / 本机

---

## [1.2.0] — 已发布

### 新增
- 学习/休息模式切换（popup 按钮）
- 心跳计时机制（content.js 每 10 秒上报）
- Web Audio API 检测（网易云等音乐网站后台播放）
- active/passive 状态区分（媒体播放中页面不可见也计时）
- 临时放行功能（blocked.html 按钮 + 管理面板记录）
- 临时放行时长可配置
- admin 新增「学习/休息」统计页
- admin 新增临时白名单记录

### 修复
- declarativeNetRequest 白名单模式无法传递 domain 参数 → 改用 webNavigation + blockTab
- CSP 阻止 blocked.html 内联脚本 → 提取为 blocked.js
- 双重计时问题（flushCurrentTabTime + HEARTBEAT 同时跑）→ 仅保留心跳机制
- `chrome.alarms.cancel` 需要回调函数参数
- admin.html 重复 HTML 内容

---

## [1.1.0]

### 新增
- 黑名单管理功能
- 插件更新后保留配置（管理员密码、黑白名单）
- 每次打开 Chrome 默认进入「未使用」状态

---

## [1.0.0]

### 初始功能
- 白名单/黑名单模式
- 每日时间配额
- 时间段管控
- 管理员密码保护
- 配置完整性校验（SHA-256 哈希）
- 上网统计（域名时长，保留 30 天）
