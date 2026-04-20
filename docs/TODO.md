# 待办事项

> 按优先级排序，括号内为涉及文件

---

## 🔴 待开发（下一步）

- [ ] **Session 可视化**：R2 数据已归档，家长控制台缺展示页面 `[pages/]`

---

## 🟡 优化项（已规划）

- [ ] **家长解除配额**（设计建议）：当孩子配额耗尽被锁后，家长可在 Web 控制台"今日临时加时"（如 +30 分钟），次日自动恢复原配额。与孩子的"借时间"机制互补，孩子借的是明天的额度，家长给的是额外授权。需新增 Workers API 端点 + 控制台按钮 + extension 同步识别。`[pages/, workers/, background.js]`

---

## 🟢 已完成

### v1.6.1（2026-04-20）
- [x] 自动化测试套件（Unit 43 + BgLogic 80 + Workers 34 + API 52 + E2E 9 = 218 用例）`[tests/]`
- [x] 完整测试规范文档 `[docs/TEST-SPEC.md]`
- [x] BUG 修复：`unsafeList: []` truthy 导致 blacklist 回退失效 `[background.js]`
- [x] BUG 修复：`/profiles/:id/changelog` 路由死路 `[workers/src/index.ts]`
- [x] 清理无用文件（`test-admin.html`, `generate-icons.js`, `utils/storage.js`）
- [x] BUG 修复：存储 Key 不一致，`device_token` → `cloud_device_token` 统一 `[config.js, auth.js, sync.js, bind.html]`
- [x] BUG 修复：绑定后未发送 `CLOUD_BIND` 消息导致云同步未启动 `[bind.html]`
- [x] BUG 修复：家长控制台 `compositeList` → `allowList` 字段映射缺失 `[pages/index.html]`
- [x] 架构变更：删除 `pushConfigToCloud()` 及所有调用点，确立云端为唯一配置源 `[background.js]`
- [x] 清理旧版备份 `extension/` 目录
- [x] 创建 `AGENTS.md` 开发规范文档
- [x] OpenCode MVP 工作流配置 `.opencode/` 目录

### v1.6.0（2026-04-14）
- [x] 三时段时间分类模型（学习/待定/休息）`[background.js]`
- [x] 会话追踪与家长审核、孩子申诉 `[workers/, background.js]`
- [x] 周配额 + 日间借用机制 `[background.js, workers/]`
- [x] UX 理念重构：blacklist→unsafeList、blocked.html→reminder.html、mode 命名更新
- [x] 孩子加入 compositeList 后邮件通知家长 `[reminder.js, workers/events.ts]`

### v1.5.1（2026-04-13）
- [x] 跨设备配额同步：`GET /device/quota-state` 聚合接口 + extension 每次 sync 拉取
- [x] 设备监控开关：`monitoring_enabled` 字段 + 控制台 toggle + extension 跳过拦截
- [x] 版本号修复：`GET/PUT /device/config` 改用整数计数器 `version`
- [x] D1 migration 002：`devices.monitoring_enabled` 列
- [x] Mint Green 主题全面应用（控制台 + popup + admin）
- [x] 账户管理迁移到 Web 控制台（改密/删档/编辑/登出）
- [x] 设备解绑本地自动清理（401 → DEVICE_UNBOUND 广播）

### v1.5.0（2026-04-11）
- [x] 安全加固：SQL 参数化查询、HMAC-SHA256 JWT
- [x] 时区 bug 修复：`toISOString()` → `formatDate()`
- [x] 三档时间配额（在线/学习/休息）
- [x] 设备自动识别（OS + 4 位随机码）
- [x] 设备管理（列表 / 重命名 / 解绑）
- [x] 配置变更日志（最近 100 条）
- [x] Session 文件上传（R2）
- [x] 孩子友好 UI（Popup + admin 只读激励视图）
- [x] 家长 Web 控制台（Cloudflare Pages）完整实现

### v1.2.0 基础功能
- [x] `studyList` / `allowList` 白名单拆分
- [x] 自动切换学习模式（90 秒）
- [x] HEARTBEAT 计时
- [x] 注册/绑定流程
- [x] `pullCloudConfig` 版本保护
- [x] 学习/休息模式切换
- [x] 心跳计时（content.js）
- [x] Web Audio API 检测
- [x] 临时放行功能
