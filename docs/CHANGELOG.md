# Changelog

---

## [Unreleased]

- **Account session refresh tokens**: cloud auth now supports refresh-token sessions alongside the legacy `/auth/login -> token` response. New clients store `account_token`, `account_refresh_token`, and `cloud_account_email`; they no longer save reversible `cloud_credentials`. Existing clients and legacy no-exp account tokens remain compatible.
- **Password-change binding safety**: changing an account password revokes parent refresh sessions but does not revoke `device_token`. Already bound terminals continue syncing until explicitly unbound in cloud device management, local extension data is cleared/uninstalled, or the Chrome extension ID changes.

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
