# Changelog

---

## [2.0.0] — 计划中

### 新增
- 白名单细分为 `studyList`（学习网站）和 `allowList`（允许但非学习网站）
- 自动切换学习模式：娱乐模式下访问学习网站 active 操作连续 90 秒后自动切换
- 在线时长统计（= 学习时长 + 娱乐时长，仅计 active 心跳）
- 音乐等后台播放（passive 心跳）仅计域名时长，不计在线时长
- popup 新增在线时长展示
- admin 白名单配置页拆分为「学习网站」和「允许网站」
- admin 新增自动切换设置（开关 + 延迟时长）

### 变更
- `free` 模式废弃，Chrome 启动默认进入 `study` 模式
- `whitelist` 字段拆分为 `studyList` + `allowList`
- session 中 `startTime` 字段废弃，时长完全由心跳累加

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
- 双重计时问题（flushCurrentTabTime + HEARTBEAT 同时跑）→ 删除旧机制，仅保留心跳
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
