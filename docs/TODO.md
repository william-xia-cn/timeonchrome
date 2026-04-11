# 待办事项

> 按优先级排序，括号内为涉及文件

---

## 🔴 待开发（下一步）

- [ ] Workers 单元测试（参数化查询、JWT 签名验证）`[workers/]`
- [ ] 家长 Web 控制台（Cloudflare Pages）完整实现 `[pages/]`
- [ ] blocked.html 申请临时放行后推送云端通知家长 `[blocked.js, workers/]`

---

## 🟡 优化项

- [ ] `utils/storage.js` 未被使用，可清理 `[utils/]`
- [ ] 测试文件清理（test-*.js, *.png）移入 `tests/` 目录 `[根目录]`
- [ ] 设备解绑后本地清除 token 和配置 `[admin.js]`
- [ ] 跨设备使用时长汇总（目前各设备独立计算）`[workers/stats.ts]`

---

## 🟢 已完成（v1.5.0）

### 安全加固
- [x] SQL 注入修复：Workers 约 35 处改为参数化查询
- [x] JWT 升级：HMAC-SHA256 签名替换 `btoa` 伪签名
- [x] `quotaState` 本地保护：pull 合并时不被云端覆盖

### Bug 修复
- [x] 时区 bug：`toISOString()` → 本地时间 `formatDate()`
- [x] 每日重置防重复：`LAST_RESET_DATE_KEY` 日期守卫
- [x] 推送配额字段：`pushConfigToCloud` 补充三档配额

### 功能实现
- [x] 三档时间配额（在线/学习/休息）
- [x] 设备自动识别（OS + 4 位随机码）
- [x] 设备管理（列表 / 重命名 / 解绑）
- [x] 配置变更日志（最近 100 条）
- [x] Session 文件上传（R2）
- [x] 孩子友好 UI（Popup + admin 只读激励视图）
- [x] 管理面板 4 页导航（今日使用 / 访问规则 / 使用分析 / 本机）

### v1.2 基础功能
- [x] `studyList` / `allowList` 白名单拆分
- [x] 自动切换学习模式（`checkAutoStudy`）
- [x] HEARTBEAT 计时：studyList 计学习、allowList 只计域名
- [x] 注册/绑定流程（`bind.html`）
- [x] `pullCloudConfig` 版本保护
- [x] 本地改配置后立即推送云端
- [x] 学习/休息模式切换
- [x] 心跳计时（content.js）
- [x] Web Audio API 检测
- [x] active/passive 状态区分
- [x] 临时放行功能
- [x] blocked.html CSP 修复（提取 blocked.js）
- [x] declarativeNetRequest 白名单 domain 参数传递修复
- [x] 插件更新配置保留
- [x] Chrome 启动重置会话状态
- [x] Worker 路由 bug：`GET /profiles/:id/stats` 路由修复
