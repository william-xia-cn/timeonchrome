# Changelog

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
