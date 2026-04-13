# 待办事项

> 按优先级排序，括号内为涉及文件

---

## 🔴 待开发（下一步）

- [ ] Workers 单元测试（参数化查询、JWT 签名验证）`[workers/]`
- [ ] blocked.html 申请临时放行后推送云端通知家长 `[blocked.js, workers/]`

---

## 🟡 优化项（已规划）

- [ ] **临时放行 + 家长解除配额** 合并设计优化（目前临时放行可用，家长解除配额待做）`[pages/, workers/]`
- [ ] **Session 可视化**：R2 数据已归档，家长控制台缺展示页面 `[pages/]`
- [ ] `utils/storage.js` 未被使用，可清理 `[utils/]`
- [ ] 测试文件清理（test-*.js, *.png）移入 `tests/` 目录 `[根目录]`

---

## 🟢 已完成

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
