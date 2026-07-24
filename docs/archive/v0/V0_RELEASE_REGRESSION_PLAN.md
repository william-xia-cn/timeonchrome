> **ARCHIVED / Historical evidence only.** This file is preserved for audit/history and must not be used as the current product source of truth. Use `AGENTS.md`, `PROJECT_MASTER.md`, `TASK_BOARD.md`, `DECISIONS.md`, and the current authority documents instead.

# V0 正式发布回归计划

> 本文档为 V0 正式发布回归的权威计划。执行时严格按此文档逐项进行，不得跳过或合并。

## 1. 回归清单

### 1.1 L0：核心单元（必须全部通过，产品失败 = 阻塞）

| 套件 | 运行方式 | 说明 |
|------|----------|------|
| `tests/unit/logic.test.js` | `node` | 纯函数基础 |
| `tests/unit/background-logic.test.js` | `node` | 核心业务逻辑 |
| `tests/unit/workers-logic.test.js` | `node` | Worker 纯逻辑 |
| `tests/unit/duration-tracking.test.js` | `node` | 计时状态机 |
| `tests/unit/recovery.test.js` | `node` | 恢复机制 |
| `tests/unit/event-log.test.js` | `node` | 事件日志 |

### 1.2 L1：V0 专项单元（必须全部通过）

| 套件 | 运行方式 | 说明 |
|------|----------|------|
| `tests/unit/reminder-transition-v0.test.js` | `node` | Reminder V0 渲染/动作（68 用例） |
| `tests/unit/interceptor-mode-transition-v0.test.js` | `node` | 拦截器模式切换（71 用例） |
| `tests/unit/mode-routing-matrix-v0.test.js` | `node` | 路由矩阵全覆盖（74 用例） |
| `tests/unit/badge-and-popup-mode-v0.test.js` | `node` | Badge/Popup V0 模式 |
| `tests/unit/monitoring-global-short-circuit.test.js` | `node` | 监控全局短路 |
| `tests/unit/message-router-mode-switch-reeval.test.js` | `node` | 消息路由模式切换 |
| `tests/unit/message-router-monitoring-event-gate.test.js` | `node` | 监控事件门 |
| `tests/unit/content-rest-composite-pending-banner.test.js` | `node` | 内容脚本 pending banner |
| `tests/unit/borrow-concurrency.test.js` | `node` | 借用并发 |
| `tests/unit/reminder-borrow-confirm.test.js` | `node` | Reminder 借用确认 |
| `tests/unit/popup-borrow-confirm.test.js` | `node` | Popup 借用确认 |
| `tests/unit/message-router-borrow-source.test.js` | `node` | 借用来源路由 |

### 1.3 L1b：跨自然日计时验证

| 类型 | 套件 | 说明 |
|------|------|------|
| 自动化 | `tests/unit/time-boundary.test.js` | 时间边界单元 |
| 自动化 | `tests/unit/storage-aggregation-convergence.test.js` | 存储聚合收敛 |
| 自动化 | `tests/unit/dual-track-semantics.test.js` | 双轨语义 |
| 手动（可选/特殊） | 真实跨日观察 | 需等待自然日切换，不作为 10 分钟手动检查项；如 RC 周期覆盖跨日则执行，否则标记为 deferred |

### 1.4 L2：浏览器 E2E（明确文件列表）

| 套件 | 运行方式 | 说明 |
|------|----------|------|
| `tests/e2e/reminder-v0-validation.test.js` | `npx playwright test` | Reminder 浏览器门（11 用例） |
| `tests/e2e/extension.test.js` | `npx playwright test` | 扩展基础 E2E（9 用例） |
| `tests/e2e/timing-trace-smoke.test.js` | `npx playwright test` | 计时链路冒烟 |
| `tests/e2e/timing-trace-verify.test.js` | `npx playwright test` | 计时链路验证 |
| `tests/e2e/duration-accuracy.test.js` | `npx playwright test` | 时长精度 E2E |

### 1.5 L3：集成/API（需网络，区分 ENV BLOCKED）

| 套件 | 运行方式 | 说明 |
|------|----------|------|
| `tests/api/workers.test.js` | `node` | Worker API 集成（需网络） |
| `tests/integration/duration-flow.test.js` | `node` | 时长流集成 |

### 1.6 V12 域对齐专项（必须全部通过）

全部 16 个 V12 对齐套件，均通过 `node` 直接运行（见 §2.7 完整命令列表）。

### 1.7 手动验证（Windows）

| 检查项 | 说明 |
|--------|------|
| M1 | 扩展加载：无 CSP 错误，SW 正常启动 |
| M2 | Study→Rest 滑动确认 |
| M3 | Study→Composite 自动切换 + 45s 轻提示 |
| M4 | Composite→Rest 普通确认 |
| M5 | Popup 模式按钮：显示时长/配额，无借用入口 |
| M6 | Admin 功能：stats/rules/devices/nav/login/logout/save/sync |
| M7 | PiP 学习模式清理 |
| M8 | 临时综合权限：仅当前 tab 有效 |
| M9 | 云同步：配置拉取正常，默认清单可见 |

### 1.8 System Recovery Gates（已 PASS，记录用）

RG-1 ~ RG-4 均已 PASS（`PROJECT_MASTER.md` 行 36-41），本次回归不重跑，仅确认记录完整。

---

## 2. 精确命令

### 2.1 快速回归/冒烟（每次代码修改后）
```bash
node tests/run-all.js
```
> `tests/run-all.js` 是快速回归/冒烟命令，覆盖 L0 核心单元 + API + extension E2E 的顺序执行。**它不替代 Phase 2-7 的正式证据命令。** 正式回归必须逐项执行 Phase 2-7 的显式命令并单独记录证据。

### 2.2 V0 专项单元回归（正式证据）
```bash
node tests/unit/reminder-transition-v0.test.js
node tests/unit/interceptor-mode-transition-v0.test.js
node tests/unit/mode-routing-matrix-v0.test.js
node tests/unit/badge-and-popup-mode-v0.test.js
node tests/unit/monitoring-global-short-circuit.test.js
node tests/unit/message-router-mode-switch-reeval.test.js
node tests/unit/message-router-monitoring-event-gate.test.js
node tests/unit/content-rest-composite-pending-banner.test.js
node tests/unit/borrow-concurrency.test.js
node tests/unit/reminder-borrow-confirm.test.js
node tests/unit/popup-borrow-confirm.test.js
node tests/unit/message-router-borrow-source.test.js
```

### 2.3 跨自然日计时自动化（正式证据）
```bash
node tests/unit/time-boundary.test.js
node tests/unit/storage-aggregation-convergence.test.js
node tests/unit/dual-track-semantics.test.js
```

### 2.4 Reminder 浏览器门（reminder.js 变更必跑，正式证据）
```bash
npx playwright test tests/e2e/reminder-v0-validation.test.js
```

### 2.5 扩展 E2E 全量（明确文件，不用 glob，正式证据）
```bash
npx playwright test tests/e2e/extension.test.js tests/e2e/timing-trace-smoke.test.js tests/e2e/timing-trace-verify.test.js tests/e2e/duration-accuracy.test.js
```

### 2.6 Worker API 集成（需网络，正式证据）
```bash
node tests/api/workers.test.js
```

### 2.7 V12 域对齐全量（正式证据）
```bash
node tests/unit/domain-semantics-v12.test.js
node tests/unit/signal-extract-domain-v12.test.js
node tests/unit/signal-extract-domain-guard.test.js
node tests/unit/storage-config-v12-fields.test.js
node tests/unit/storage-composite-migration.test.js
node tests/unit/storage-match-domain-v12-integration.test.js
node tests/unit/storage-extract-domain-v12-integration.test.js
node tests/unit/pages-config-v12-fields.test.js
node tests/unit/pages-match-domain-v12-alignment.test.js
node tests/unit/popup-match-domain-v12-alignment.test.js
node tests/unit/admin-match-domain-v12-alignment.test.js
node tests/unit/admin-undetermined-list.test.js
node tests/unit/admin-stats-overview.test.js
node tests/unit/workers-device-domain-v12-alignment.test.js
node tests/unit/workers-composite-sessions-domain-v12-alignment.test.js
node tests/unit/workers-stats-ingestion-v12-normalization.test.js
```

---

## 3. 发布阻塞表

| 阻塞 ID | 条件 | 判定标准 | 当前状态 |
|---------|------|----------|----------|
| RB-1 | L0/L1/L1b/V12 单元存在失败 | 任一 required L0/L1/L1b/V12 unit suite 非零退出 | **CLEAR** |
| RB-2 | V0 专项单元存在失败 | 任一 L1 套件非零退出 | **CLEAR** |
| RB-3 | Reminder 浏览器门 < 11/11 | Playwright 输出非 11 passed | **CLEAR**（11/11 passed） |
| RB-4 | 扩展 E2E 关键路径失败 | `extension.test.js` / `timing-trace-*` / `duration-accuracy` 失败 | **CLEAR**（14/14 passed） |
| RB-5 | Worker API 集成失败 | 见 §3.1 语义区分 | **CLEAR**（55/55 passed） |
| RB-6 | V12 域对齐存在失败 | 任一 V12 套件非零退出 | **CLEAR** |
| RB-7 | M1-M9 手动验收存在 P0 失败 | PO 手动验证不通过 | **CLEAR**（M1-M9 全部 PASS） |
| RB-8 | RC 打包安装冒烟失败 | 解压加载后基础功能不可用 | **CLEAR**（RC zip verified, 64 files, SHA256 `B9DE59B...389`） |
| RB-9 | Product Owner 最终批准未完成 | 无 PO 签字/确认 | **APPROVED**（2026-05-04, Google review / handoff） |

### 3.1 Worker API 阻塞语义区分

| 结果 | 含义 | 发布影响 |
|------|------|----------|
| **PASS** | 所有用例通过 | 不阻塞 |
| **FAIL** | 用例断言失败（产品逻辑错误） | **发布阻塞** |
| **ENV BLOCKED** | 网络不可达 / API 部署异常 / 凭据缺失 | 不直接阻塞；需要 alternative evidence（CI 环境重跑 / PO 确认部署状态） |
| **DEFERRED** | PO 决定跳过此项 | 需记录为 deferred-risk，PO 签字确认 |

---

## 4. 手动验证清单

| # | 检查项 | 预期结果 | 验证方式 | 耗时 |
|---|--------|----------|----------|------|
| M1 | 扩展加载 | 无 CSP 错误，SW 正常启动 | `chrome://extensions` | 1min |
| M2 | Study→Rest 滑动确认 | 滑块出现，拖动后切换模式 | 打开非学习网站 | 2min |
| M3 | Study→Composite 自动切换 | 45s 轻提示，自动进入 Composite | 打开综合网站 | 2min |
| M4 | Composite→Rest 普通确认 | 确认页出现，按钮正确 | 打开未归类网站 | 2min |
| M5 | Popup 模式按钮 | 显示时长/配额，无借用入口 | 点击扩展图标 | 1min |
| M6 | Admin 功能 | stats/rules/devices 可导航，login/logout/save/sync 可用 | `admin/admin.html` | 3min |
| M7 | PiP 学习模式清理 | 切换学习模式时 restricted/unsafe PiP 关闭 | PiP + 切换模式 | 2min |
| M8 | 临时综合权限 | 仅当前 tab 有效，不写入 compositeList | 申请 → 关 tab → 重开 | 2min |
| M9 | 云同步 | 配置拉取正常，默认清单可见 | 绑定后查看访问规则 | 2min |

**跨日验证（M10 拆分）**：
- M10a（自动化）：`time-boundary.test.js` + `storage-aggregation-convergence.test.js` 已覆盖单元/集成层
- M10b（手动/可选）：真实跨日观察需等待自然日切换，如 RC 周期不覆盖则标记为 deferred，不作为发布阻塞

---

## 5. 延期风险表（需 PO 决策）

| 风险 ID | 项目 | 当前状态 | 记录位置 | 发布影响 |
|---------|------|----------|----------|----------|
| DR-1 | macOS smoke validation | **PO accepted deferral to V1** | `PROJECT_MASTER.md` §112 行 1；`TASK_BOARD.md` LATER §39-41 | 不阻塞 V0（已接受风险） |
| DR-2 | Playwright E2E alternate-environment | **PO accepted deferral to V1**（Windows 本地 `spawn EPERM`）。**注意**：当前可运行环境中的 Playwright E2E（Reminder 浏览器门 + 扩展 E2E）仍为 V0 发布回归必需项。DR-2 仅覆盖 alternate environment / Windows `spawn EPERM` 的延期，不意味着可在当前工作环境中跳过 Playwright E2E。 | `PROJECT_MASTER.md` §113 行 2；`TASK_BOARD.md` LATER §42-44 | 不阻塞 V0（已接受风险） |
| DR-3 | Admin CSP 警告 | **Known non-blocking** | `PROJECT_MASTER.md` §114 行 3 | 不阻塞 V0（已接受风险） |
| DR-4 | 真实跨日手动观察 | **Deferred unless RC cycle covers midnight** | 本计划 §4 M10b | 不阻塞 V0（自动化已覆盖） |
| DR-5 | D-015 申诉/审核语义终审 | **Pending PO decision** | `TASK_BOARD.md` LATER §65 | 不阻塞 V0（UI 隐藏策略已生效） |

---

## 6. 执行顺序

```
Phase 1: 快速回归/冒烟（~10s）
  → node tests/run-all.js
  （仅用于日常开发快速验证，不替代正式证据）

Phase 2: V0 专项单元（~15s，正式证据）
  → 12 个 L1 套件逐一 node 执行

Phase 3: V12 域对齐（~10s，正式证据）
  → 16 个 V12 套件逐一 node 执行

Phase 4: 跨自然日自动化（~5s，正式证据）
  → time-boundary + aggregation-convergence + dual-track

Phase 5: Reminder 浏览器门（~20s，正式证据）
  → npx playwright test tests/e2e/reminder-v0-validation.test.js

Phase 6: 扩展 E2E 全量（~2min，正式证据）
  → npx playwright test tests/e2e/extension.test.js tests/e2e/timing-trace-smoke.test.js tests/e2e/timing-trace-verify.test.js tests/e2e/duration-accuracy.test.js

Phase 7: Worker API 集成（~30s，需网络，正式证据）
  → node tests/api/workers.test.js
  → 结果判定：PASS / FAIL / ENV BLOCKED / DEFERRED

Phase 8: 手动验证 M1-M9（~15min）
  → Windows Chrome 解压加载 + 逐项操作

Phase 9: RC 打包 + 安装冒烟（~5min）
  → 生成 RC zip → 解压加载 → 基础功能验证

Phase 10: Product Owner 最终批准
  → 验收记录表签字
```

**总耗时估计**：~3 分钟（自动化 Phase 1-7）+ ~20 分钟（手动 Phase 8-9）+ PO 审批时间

---

## 7. 证据收集格式

每项执行后记录：

```yaml
- suite: <套件名称>
  command: <精确命令>
  result: PASS / FAIL / ENV BLOCKED / DEFERRED
  environment: <Windows/macOS/Linux, Node version, Chrome version>
  commit: <git hash>
  timestamp: <ISO 8601>
  output_summary: "<关键输出行，如 68/68 passed>"
  skipped_reason: <如适用，说明原因>
```

**Reminder 专项证据**（已建立）：
- 浏览器门：11/11 passed
- 单元/路由/拦截器：213/213 passed

---

## 8. 约束

- 本计划不声明 V0 发布就绪
- 不扩展到 blocked.js 或配额边界浏览器测试
- 所有 Phase 2-7 命令必须逐项执行并单独记录证据
- `node tests/run-all.js` 仅用于日常开发快速验证，不替代正式回归证据
