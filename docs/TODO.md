# 待办事项

> 按优先级排序，括号内为涉及文件

---

## 🔴 v2.0 核心功能（未实现）

### 1. 白名单细分
- [ ] `DEFAULT_CONFIG` 新增 `studyList: []`、`allowList: []`，保留 `whitelist` 做迁移过渡 `[background.js]`
- [ ] `updateDeclarativeRules()` 改用 `studyList + allowList` 生成放行规则 `[background.js]`
- [ ] `checkAndBlock()` 白名单检查改用 `studyList + allowList` `[background.js]`
- [ ] `onInstalled update` 迁移：将旧 `whitelist` 全部归入 `studyList` `[background.js]`
- [ ] admin 白/黑名单页面拆分为「学习网站」和「允许网站」两个列表 `[admin.html, admin.js]`

### 2. 自动切换学习模式
- [ ] 内存变量 `autoStudyCounter` 和 `autoStudyLastTick` `[background.js]`
- [ ] HEARTBEAT 中加入自动切换逻辑 `[background.js]`
- [ ] `DEFAULT_CONFIG` 新增 `autoStudyConfig: { enabled: true, requiredSeconds: 90 }` `[background.js]`
- [ ] admin 「学习/休息」页新增自动切换开关和延迟配置 `[admin.html, admin.js]`

### 3. HEARTBEAT 计时修正
- [ ] `active` 心跳且 domain 在 `studyList` → 才累加 `studySession.totalSeconds` `[background.js]`
- [ ] `active` 心跳且 domain 在 `allowList` → 只计域名时长，不计学习时长 `[background.js]`
- [ ] `passive` 心跳 → 只计域名时长（已实现，确认 study/rest 模式均不计在线时长）`[background.js]`

### 4. 删除 free 模式
- [ ] `restoreSession()` 改为默认进入 `study` `[background.js]`
- [ ] `DEFAULT_SESSION.currentMode` 改为 `'study'` `[background.js]`
- [ ] popup 移除 `free` 相关的 UI 分支 `[popup.js]`

### 5. popup 在线时长展示
- [ ] 新增「🌐 在线时长」统计行（= studySeconds + restSeconds）`[popup.html, popup.js]`

---

## 🟡 优化项

- [ ] `chrome.idle` API 已被心跳机制替代，可从 manifest.json permissions 中移除 `[manifest.json]`
- [ ] `utils/storage.js` 未被使用，可清理 `[utils/]`
- [ ] 测试文件清理（test-*.js, *.png）移入 `tests/` 目录 `[根目录]`
- [ ] manifest.json 格式规范化（`options_page` 缩进问题）`[manifest.json]`
- [ ] `DEFAULT_SESSION` 中残留的 `startTime` 字段定义可删除 `[background.js]`

---

## 🟢 已完成（v1.2）

- [x] 学习/休息模式切换
- [x] 心跳计时（content.js）
- [x] Web Audio API 检测
- [x] active/passive 状态区分
- [x] 临时放行功能
- [x] blocked.html CSP 修复（提取 blocked.js）
- [x] 双重计时修复（删除 flushCurrentTabTime）
- [x] declarativeNetRequest 白名单 domain 参数传递修复
- [x] 插件更新配置保留
- [x] Chrome 启动重置会话状态
