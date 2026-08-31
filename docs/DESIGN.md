# TimeOnChrome — 技术设计文档

版本：1.7.27
更新：2026-08-29

---

## 1. 架构概览

### 1.0 独立 Native App Control

macOS Native App Control 的权威技术设计位于 `docs/specs/SPEC-003-MACOS-NATIVE-APP-CONTROL-TECHNICAL-DESIGN.md`。该模块部署为独立 Worker 与独立 D1，不属于 Chrome Extension、`guardian-api` 设备同步或 `guardian-db` 业务数据。主系统仅提供 Account/Child 的短期 ES256 身份桥和 Child 删除 lifecycle outbox；Pages 通过 `/native-apps/` 提供独立控制台。现有 Native Worker、D1、secrets 和 Santa 协议属于已部署生产能力，常规 Chrome/Pages 发布不得因“本轮不改 Native 基础设施”而移除既有页面或 Guardian bridge。

### 1.0.1 跨平台 App Runtime Management

App Runtime Management 的产品规格与技术设计分别位于 `docs/specs/SPEC-004-APP-RUNTIME.md` 和 `docs/specs/SPEC-004-APP-RUNTIME-TECHNICAL-DESIGN.md`。它是一个产品能力，由 `app-runtime-management/agents/macos/` 的 Swift Agent 与 `app-runtime-management/agents/windows/` 的 .NET 8 Agent 原生实现，共享事实模型、确定性状态机、JSON Schema、黄金测试向量和 Runtime Worker/D1。每个活动交互式用户会话独立运行 Agent；Phase 2 先完成 Windows 的真实事件适配、SQLite ledger/outbox、DPAPI credential、HTTP uploader 与独立 Runtime enrollment/segment API，macOS 仍保持 Phase 1 骨架。现有 `native-app-control/` 及 Santa Worker/D1 继续独立负责发现、审核和阻止；Runtime 不共享 Santa enrollment、MachineID、协议、表或凭据，也不修改 Guardian/Pages。

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

#### Rest 使用检查点提醒（D-065 / D-066）

- `restConfig.firstReminderMinutes` 表示“今日休息软限额”：`null` 表示关闭，非空值必须是 `1–1440` 的整数，默认 `120`。`restConfig.repeatReminderMinutes` 表示超额后的重复提醒间隔，必须是 `1–1440` 的整数，缺失时默认 `60`。两者均为提醒参数，不是会锁定访问的每日或每周 Rest 配额。
- 旧 `restConfig.reminderInterval` / `maxRestDuration` 仅保留配置兼容，不参与运行，不得迁移为 `firstReminderMinutes`。
- 提醒触发和展示读取 `getQuotaUsageView()` 的 `restSeconds` / `weekRestSeconds`；复合或待归类借用 Rest 计入，媒体账本不计入。只有当前聚焦 active tab 存在 `quotaBucketAtTime=rest` 的 ACTIVE 网页 session 时才显示；达到阈值但没有有效前台 Rest 页面时延后到下一次有效观察。
- 首次提醒 payload 使用 `reminderKind=first`、`softLimitMinutes` 和 `overageSeconds`，明确显示“已达到今日休息软限额”及设定值；滑动继续后，以确认时的今日 Rest 用量为基线，按 `repeatReminderMinutes` 再次提醒，后续 payload 使用 `reminderKind=repeat` 并显示从软限额起算的累计超额。弹窗等待时间继续进入正式网页账本，但不进入下一轮提醒间隔。每个北京时间自然日重置提醒进度。
- 修改软限额时，当日首次提醒状态重新计算；若已用量达到或超过新阈值，则在下一次有效评估触发首次提醒。修改重复间隔时，以当前已用量为新基线计算下一阈值。已经可见的活动弹层保持创建时文案和 deadline，不受中途配置变化影响。
- Content Script 使用 `<dialog>.showModal()` 形成页面内软阻断，保留网页文档、滚动和应用状态；提醒期间阻断输入并暂停可识别媒体。滑动继续移除 dialog 并尽力恢复此前播放媒体；Canvas/WebGL 游戏只保证输入阻断，不承诺冻结页面内部 JS。
- 已经显示的提醒在 60 秒响应期内不因家长调整或关闭提醒配置而被后台静默撤销，必须先由继续、结束或超时完成当前状态机；新配置从下一轮评估生效，避免页面残留无法处理的 modal。
- prompt 状态包含随机 token、dateKey、nextThresholdSeconds、shownAt、deadlineAt 和 sourceTabId，通过受预算保护的固定小对象持久化。继续、点击结束和超时结束必须按 token 幂等。Service Worker 重启、页面刷新或标签切换不得使过期 prompt 继续访问。
- 60 秒无操作与点击“结束休息”共用 Mode Service 结束路径：请求 Study 并重新检查 source tab；若 Study 不可进入或页面无法继续安全显示，终止当前 Rest 页面访问。软阻断暂时无法注入时保留 prompt 与 deadline，并在 `CONTENT_SCRIPT_READY` 后重试；60 秒 deadline 到达后仍执行默认结束，不能静默跳过。
- deadline 只能在 Content Script 返回 `visible=true` 后创建并调度；随后才允许暂停媒体。首次投递失败时只保存 `delivery_due` 状态，不启动响应倒计时，并在 `CONTENT_SCRIPT_READY` 或约 10 秒后重试一次；第二次仍失败时进入完整 Reminder，reason 固定为 `rest_usage_reminder_delivery_failed`。不得把不可见投递当作用户超时。
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

内部 managed self-hosted 扩展通过 Native Messaging Host `com.timeonchrome.guardian` 提供独立于网络和云端 API 的本地健康信号。源 manifest 声明 `nativeMessaging`，但打包 staging 必须按渠道裁剪：managed artifact 保留权限、`deployment-profile.json` 与 `health-probe.html` 的 web accessible resource；普通/CWS artifact 强制移除该权限和探测页暴露。运行时还必须验证 deployment marker 为 managed，非 managed 上下文不得连接 Host。

- 模块加载时同步注册 `timeonchromeLocalGuardianHeartbeat` alarm、`onStartup`、`onInstalled` 和内部 probe 消息监听器。Service Worker 加载后立即发送 `booting`；bootstrap 完成或失败后发送确定状态；Native Port 存活时每 60 秒发送，独立一分钟 alarm 作为 Service Worker 唤醒兜底。
- 使用持久 `connectNative()` Port，但任一时刻只允许一个等待应答的 heartbeat/probe。Host 应答超时为 3 秒；probe 优先且使用 5 秒冷却；生命周期、alarm 和内存定时器触发必须合并，队列不得无界增长。Port 断开后不立即循环重连，只在下一次 alarm、生命周期事件或 probe 时重试。
- payload 固定为 `type`、`extensionId`、`version`、`profile`、`incognito`、`policyHash`、`monitoringStatus`、`timestamp`。Profile UUID 在 `chrome.storage.local` 生成、持久化并回读确认；普通和 split-incognito 上下文共享 UUID，用 `chrome.extension.inIncognitoContext` 区分上下文。
- 策略哈希使用认可 managed key 的递归排序确定性 JSON 和 SHA-256；`managedDeviceToken` 只以“是否存在”布尔值参与哈希。payload、状态、控制台和客户端日志禁止出现 token、邮箱、URL、域名、标题、Cookie、浏览历史或原始错误正文。
- `monitoringStatus` 只允许 `booting`、`active`、`degraded`、`disabled_by_policy`、`privacy_consent_required`。只有 bootstrap 成功、activation 有效且 monitoring 未关闭时才能报告 `active`；关键读取或 bootstrap 失败报告 `degraded`。
- Host 仅以 `{ ok: true, receivedAt }` 确认。缺失、断开、超时或无效响应只更新有界 `local_guardian_status_v1`，保存最近尝试/成功时间、短错误码、连续失败数、Port 状态和触发来源；不得保存 payload 或原始错误文本，也不得让失败传播到 bootstrap、计时、拦截或同步。
- `health-probe.html` 是不展示数据、不发起网络请求的空白扩展页。它向 Service Worker 发送 `TIMEONCHROME_LOCAL_HEALTH_PROBE`，由独立监听器校验 sender 后立即发送 `type: probe`；收到结果后关闭，最迟 5 秒强制关闭。
- 现有每五分钟云端 heartbeat 保持不变。本地 heartbeat 只证明扩展进程和核心初始化状态，不替代云端配置、网页/媒体账本或远程监控。

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
├── app-runtime-management/    跨平台 Runtime 产品（macOS/Windows Agents、共享契约、未来共用后台）
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

- D1 表：`client_logs_v1`
- 设备上传：`POST /device/client-logs/v1`，使用 device token 鉴权，Worker 按 token 归属写入真实 `profile_id/device_id`
- 家长查询：`GET /profiles/:profileId/client-logs/v1`，支持按 device、level、category、时间范围和 cursor 查询
- 云端默认不上传；只有 profile config 中的 `clientLoggingPolicyV1.uploadEnabled = true` 才上传
- `expiresAt` 到期后扩展必须立即回退到默认不上传策略；Pages 摘要也必须按当前时间显示“已过期”，不得只依据 `uploadEnabled` 显示“已开启”

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

---

## 6.3 任务管理 V1（Draft，尚未实现）

任务管理 V1 的当前产品规格与技术结构分别见：

- `docs/specs/SPEC-002-TASK-MANAGEMENT.md`
- `docs/specs/SPEC-002-TASK-MANAGEMENT-TECHNICAL-DESIGN.md`

当前状态仅为 Draft：仓库尚未实现任务表、任务 API、设备任务同步、任务运行时策略、任务进度投影或相关 UI。技术设计拟采用独立 `tasks_v1` / `task_events_v1`，并让现有 `usage_segments_v1` 承担任务有效使用时间的唯一事实；这些内容在 Product Owner 批准前不属于当前运行基线。

进入代码前必须先整理并提交当前工作区已有改动，确认工作区干净，fetch 并对齐最新 `origin/master`，再创建 `codex/task-management-v1`。任务代码、migration 和测试不得与其他功能提交混合。

### 6.4 未归类网站邮件归类 V1

`POST /device/target-stats/v1` 成功写入后，会在请求响应之外评估本次 profile/date 的未归类用量。评估只读取 `target_classification_at_time IN ('unclassified', 'pending_composite')` 的每日 target rows，按 `canonicalSiteIdentityHost()` 合并 `www.` / `m.` 主站 alias，并跨设备、统计维度累加 `duration_seconds`。

达到 900 秒后执行：

1. 重新加载当前 effective 网站配置和 pending records，已经分类则停止。
2. 创建或复用 `recordSource=auto_unclassified_access` 的 `site_classification_requests_v1` 记录。
3. 以 `profile_id + usage_date + canonical_host + notification_type` 创建每日唯一 outbox。
4. 立即尝试 Resend；失败按 5 分钟、30 分钟、2 小时退避，最多四次总尝试。统计上传成功与邮件投递成功互不绑定。

新增数据表：

- `site_classification_email_notifications_v1`：每日去重、outbox、签名 token 目标、尝试次数、有效期和消费结果。
- `site_classification_email_reply_events_v1`：只保存 Message-ID 摘要、命令、sender match 与结果码，不保存原始正文、HTML 或附件。

初始通知的 From 与 Reply-To 均使用 `TimeOnChrome <reply+<signed-token>@hornburg-xia.uk>`，避免邮件客户端忽略 Reply-To 后误投到不可处理的固定发件地址。Email Routing 开启子寻址并把 `reply@hornburg-xia.uk` 交给 `guardian-api.email()`；handler 必须保留收件地址中签名 token 的原始大小写，只对域名匹配使用不区分大小写规则，并且只读取纯文本第一条非空、非引用命令。执行前必须验证 HMAC token、7 天有效期、精确家长邮箱、pending request、未消费 token 和未处理 Message-ID。

Pages decision API 和邮件 handler 共用 `decideSiteClassificationRequest()`。该服务负责目标规范化、父域/特殊对象/冲突校验、request 状态变更和 profile 配置写入；任何入口都不得另建绕过校验的写路径。

运行开关 `EMAIL_CLASSIFICATION_ENABLED` 默认关闭；`EMAIL_CLASSIFICATION_PROFILE_IDS` 默认空，只允许显式列出的测试 profile，`*` 仅用于完成灰度后的全量开放。两个发布控制值与签名密钥 `EMAIL_ACTION_SECRET` 均通过 Cloudflare secrets 提供，profile ID 不进入 Git 或公开部署配置。Cron 保留每日提醒，并增加 5 分钟 outbox 处理。统计日期超过 `day_end_ms + 24h`、restore 或 import 不触发通知。

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
