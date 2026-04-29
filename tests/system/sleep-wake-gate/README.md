# Sleep / Wake / Offline Gate — Phase 1 Dry-Run Runner

## 背景

TimeOnChrome V0 的正式发布被真实设备睡眠/唤醒/离线恢复验证阻塞。SR-1（MV3 Service Worker 隐式重启恢复）已通过代码修复和自动化测试，但仍需在真实环境中验证以下场景：

- OS 睡眠/唤醒期间计时是否正确截断
- 网络断开后扩展本地计时是否继续
- Chrome 关闭重开后 session 是否恢复

## 路线图

| Phase | 场景 | 状态 | 说明 |
|-------|------|------|------|
| 1 | `dry-run` | **已实现** | 只读验证：加载扩展 → 产生事件 → 读取 stats/trace/event-log/session → 生成报告 |
| 2 | `chrome-restart` | 占位 | 关闭+重开 Chrome，验证 SW recovery |
| 3 | `sleep-wake` | 占位 | 真实 OS 睡眠/唤醒，需要 wake timers / admin |
| 4 | `network-offline` | 占位 | 断网/恢复，需要 admin / 代理隔离 |

## 使用方式

```bash
# Phase 1 — 安全 dry-run（默认）
node tests/system/sleep-wake-gate/runner.js

# 带重置 + 详细日志
node tests/system/sleep-wake-gate/runner.js --reset --verbose

# 自定义输出目录
node tests/system/sleep-wake-gate/runner.js --output-dir=dist/system-reports
```

## CLI 参数

| 参数 | 默认值 | 说明 |
|------|--------|------|
| `--scenario` | `dry-run` | 当前仅支持 `dry-run` |
| `--output-dir` | `tests/system/sleep-wake-gate/reports` | 报告输出目录 |
| `--reset` | `false` | 测试前重置 calibration 数据 |
| `--verbose` | `false` | 打印详细日志 |
| `--help` | — | 显示帮助 |

## 报告输出

每次运行生成两个文件到 `--output-dir`：

- `dry-run-YYYYMMDD-HHMMSS.json` — 机器可读完整数据
- `dry-run-YYYYMMDD-HHMMSS.md` — 人类可读摘要报告

## 数据提取能力

runner 通过 Playwright Service Worker `evaluate` 调用以下 debug endpoint：

| 数据源 | Endpoint / Storage Key |
|--------|------------------------|
| 完整校准包 | `globalThis.debugExportTimingCalibration()` |
| 今日统计 | `globalThis.debugGetTodayStats()` |
| Timing Trace | `globalThis.debugGetTimingTrace()` |
| Event Log | `chrome.storage.local.get('event_log_v1')` |
| Session | `chrome.storage.session.get('session_v1')` |
| Focus Ledger | `globalThis.debugGetFocusLedger()` |
| 扩展配置 | `chrome.storage.local.get(['guardian_config', 'guardian_session'])` |

## 安全边界

Phase 1 严格**不执行**以下操作：

- ❌ 系统睡眠/休眠
- ❌ 屏幕锁定/解锁
- ❌ 网络适配器禁用
- ❌ Chrome 关闭或重开
- ❌ 修改产品运行时代码
- ❌ 部署 Workers / Pages
- ❌ D1 数据库变更
- ❌ Chrome Web Store 发布

## 文件结构

```
tests/system/sleep-wake-gate/
  runner.js              # CLI 入口
  README.md              # 本文档
  lib/
    browser.js           # Chrome 扩展上下文启动/关闭
    extractors.js        # SW debug endpoint 包装器
    reporters.js         # JSON + Markdown 报告生成
  scenarios/
    dry-run.js           # Phase 1：只读验证
    chrome-restart.js    # Phase 2 占位
    sleep-wake.js        # Phase 3 占位
    network-offline.js   # Phase 4 占位
  reports/
    .gitignore           # 忽略生成的报告文件
```

## 已知限制

- 需要 `headless: false`（Chrome 扩展不支持 headless）
- 每次运行会创建新的 Chrome user data 目录并在结束后清理
- 测试页面使用 `example.com`，若网络不可用可能无法产生信号；可改用本地 mock server
- Playwright 版本需 ≥ 1.59.1

## 下一步

1. 验证 Phase 1 dry-run 通过
2. 实现 Phase 2 chrome-restart（关闭+重开 Chrome，验证 recover）
3. 评估 Phase 3 sleep-wake 的 wake timer 配置需求
4. 设计 Phase 4 network-offline 的代理/隔离方案
