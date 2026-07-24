> **ARCHIVED / Historical evidence only.** This file is preserved for audit/history and must not be used as the current product source of truth. Use `AGENTS.md`, `PROJECT_MASTER.md`, `TASK_BOARD.md`, `DECISIONS.md`, and the current authority documents instead.

# V0 发布环境复验执行包

> 目的：在**可执行发布环境**中复验 API 与 E2E，作为 V0 发布前标准检查清单。  
> 范围：仅发布闸门复验，不涉及新功能开发。

---

## 前置条件

### API 测试环境条件
1. 可访问外网 HTTPS，且可连通目标 API 域名（`guardian-api.william-xia-cn.workers.dev`）。
2. Node 运行环境可正常使用 `fetch`。
3. 允许测试脚本执行注册/登录/配置类接口调用。

### E2E 测试环境条件
1. 可运行 Playwright + Chromium 持久化上下文。
2. 允许加载本地扩展（`--disable-extensions-except` / `--load-extension`）。
3. 文件系统允许创建/删除 E2E 测试 profile 目录。

### Playwright Chromium 依赖要求
1. 必须存在 Playwright 对应 Chromium 可执行文件。
2. 若未预装，先执行：
   - `npx playwright install chromium`

### 网络 / 代理要求
1. `npm/npx` 可下载 Playwright browser 依赖。
2. Node `fetch` 可访问 API 域名。
3. 若使用企业代理，需放行 API 域名与 Playwright 下载源。

### API 测试账号/测试数据隔离与清理
1. API 集成测试必须使用**一次性测试账号**（建议按时间戳命名）。
2. 禁止复用生产账号或真实儿童设备数据。
3. 测试结束后至少执行其一：
   - 自动化清理测试账号/设备/档案；
   - 标记测试数据并在发布后批量清理。
4. 测试环境与生产环境数据必须隔离（库/表/租户/前缀至少一层隔离）。

---

## 执行步骤

按顺序执行，避免定位困难：

1. Unit（逐文件）
   - `for f in tests/unit/*.test.js; do node "$f" || exit 1; done`
   - 通过标准：退出码 `0`，无 FAILED。

2. API
   - `node tests/api/workers.test.js`
   - 通过标准：测试汇总通过，退出码 `0`。

3. E2E
   - `npx playwright test tests/e2e/extension.test.js --config=playwright.config.js`
   - 通过标准：全部用例通过，退出码 `0`。

4. Run-All（最终闸门）
   - `node tests/run-all.js`
   - 通过标准：Summary 全部为通过，退出码 `0`。

---

## 失败判定

### Unit 失败
- 代码问题：断言失败、逻辑回归、测试用例失败。
- 环境问题：Node 不可用、依赖损坏、脚本无法启动。

### API 失败
- 代码问题：接口可达但返回结构/状态码不符合断言。
- 环境问题：`fetch failed`、DNS/代理/TLS/网络阻断、目标域名不可达。

### E2E 失败
- 代码问题：浏览器可正常启动后页面断言失败。
- 环境问题：浏览器可执行文件缺失、下载受阻、扩展加载权限受限。

### Run-All 失败
- 代码问题：某子阶段出现断言失败。
- 环境问题：某子阶段受网络/浏览器依赖影响失败。

---

## 证据留档

### 必留原始输出
1. `for f in tests/unit/*.test.js; do node "$f" || exit 1; done`
2. `node tests/api/workers.test.js`
3. `npx playwright test tests/e2e/extension.test.js --config=playwright.config.js`
4. `node tests/run-all.js`

### 必留测试产物
1. `test-results/`（失败上下文、trace、截图/视频如启用）。
2. CI Job 链接、构建号、执行时间戳。

### 建议附加留档
1. 执行环境信息（OS / Node / npm / Playwright 版本）。
2. 代理与网络策略摘要（脱敏）。
3. 执行人和复验批次号。

---

## 放行标准

必须同时满足以下条目，才可判定 **V0 可发布**：

1. Unit 命令通过（退出码 `0`）。
2. API 命令通过（退出码 `0`）。
3. E2E 命令通过（退出码 `0`）。
4. `node tests/run-all.js` 通过（退出码 `0`）。
5. 四条命令原始输出与测试产物已留档。
6. API 测试数据已完成隔离并执行清理/标记策略。
7. 若出现失败，已完成“代码问题/环境问题”归因记录并闭环。
