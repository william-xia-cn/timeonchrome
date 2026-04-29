# Sleep / Wake / Offline Gate — System Recovery Release Gates

## 背景

TimeOnChrome V0 formal release 仍被 System Recovery Release Gates 阻塞。SR-1（MV3 Service Worker 隐式重启恢复）已通过代码修复和自动化测试，System Recovery runner infrastructure 已可用，但 runner 实现不等于 Release Gate pass。

- Chrome 关闭重开后 session 是否恢复
- 锁屏/解锁后扩展是否恢复
- OS 睡眠/唤醒后扩展是否恢复
- 网络断开/恢复后本地计时是否继续

当前 HEAD：`7816f1c`

## Release Gate 状态

| Gate | 场景 | Runner 状态 | Gate 状态 | 说明 |
|------|------|-------------|-----------|------|
| RG-1 | Chrome close / reopen | `chrome-restart` 已实现 | **PASS** | formal bound-device Gate 已通过 |
| RG-2 | Lock / Unlock | 未实现独立 scenario | **Pending** | Release Gate 待实现和验证 |
| RG-3 | OS Sleep / Wake | `sleep-wake` 已实现 | **Pending** | 当前环境因 no S3 support 返回 SKIP；需在支持 S3 睡眠的物理机通过，或由 Product Owner 明确 waive |
| RG-4 | Network Offline / Online | `network-offline` 占位 | **Pending** | 需要网络隔离/权限方案 |

## 支持的场景

| Scenario | 支持状态 | 用途 |
|----------|----------|------|
| `dry-run` | 支持 | 基础设施验证：加载扩展、产生事件、读取 stats/trace/event-log/session、生成报告；不是正式 Release Gate pass |
| `chrome-restart` | 支持 | Chrome close / reopen 恢复验证；RG-1 formal bound-device Gate 已通过 |
| `sleep-wake` | 支持 | Windows OS sleep / wake 手工唤醒验证；runner 已实现，但当前环境 SKIP/no S3，RG-3 仍 pending |
| `network-offline` | 占位 | 尚未实现；RG-4 pending |
| `lock-unlock` | 未实现 | 当前没有独立 scenario；RG-2 pending |

## 使用方式

```bash
# 基础设施 dry-run（默认）
node tests/system/sleep-wake-gate/runner.js

# 带重置 + 详细日志
node tests/system/sleep-wake-gate/runner.js --reset --verbose

# RG-1 Chrome close / reopen
node tests/system/sleep-wake-gate/runner.js --scenario=chrome-restart --user-data-dir=<bound-profile-dir> --verbose

# RG-3 OS Sleep / Wake（发布验收测试；会触发系统睡眠）
node tests/system/sleep-wake-gate/runner.js --scenario=sleep-wake --user-data-dir=<bound-profile-dir> --allowSystemSleep --verbose

# 自定义输出目录
node tests/system/sleep-wake-gate/runner.js --output-dir=dist/system-reports
```

## CLI 参数

| 参数 | 默认值 | 说明 |
|------|--------|------|
| `--scenario` | `dry-run` | 支持：`dry-run`、`chrome-restart`、`sleep-wake`；占位：`network-offline` |
| `--output-dir` | `tests/system/sleep-wake-gate/reports` | 报告输出目录 |
| `--user-data-dir` | — | Chrome 用户数据目录；正式 Gate 使用已绑定 profile |
| `--reset` | `false` | 测试前重置 calibration 数据 |
| `--verbose` | `false` | 打印详细日志 |
| `--allowSystemSleep` | `false` | `sleep-wake` 必须显式提供；允许 runner 触发 Windows OS 睡眠 |
| `--help` | — | 显示帮助 |

## 报告输出

每次运行生成两个文件到 `--output-dir`：

- `<scenario>-YYYYMMDD-HHMMSS.json` — 机器可读完整数据
- `<scenario>-YYYYMMDD-HHMMSS.md` — 人类可读摘要报告

报告中的 `meta.commit` 来自 `process.env.GIT_COMMIT || null`。如果运行环境未提供 `GIT_COMMIT`，报告 commit 可能为空，不能据此推断当前 Git HEAD。

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

`dry-run` 严格**不执行**以下操作：

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
    chrome-restart.js    # Phase 2：Chrome close / reopen
    sleep-wake.js        # Phase 3：Windows OS sleep / wake manual-wake
    network-offline.js   # Phase 4 占位
  reports/
    .gitignore           # 忽略生成的报告文件
```

## 已知限制

- 需要 `headless: false`（Chrome 扩展不支持 headless）
- 未指定 `--user-data-dir` 时会创建新的 Chrome user data 目录并在结束后清理
- `dry-run`、`chrome-restart`、`sleep-wake` 使用本地 mock HTTP server，不依赖外部网络页面
- `sleep-wake` 依赖 Windows S3 睡眠支持；当前环境无 S3 support 时结果为 SKIP，不能视为 Gate pass
- `lock-unlock` 尚未实现独立 scenario
- `network-offline` 尚未实现
- Playwright 版本需 ≥ 1.59.1

## 下一步

1. Codex 接管剩余 Release Gate 工作。
2. 实现并验证 RG-2 Lock / Unlock。
3. 在支持 S3 睡眠的物理机上复验 RG-3 OS Sleep / Wake，或取得 Product Owner 明确 waive。
4. 设计并实现 RG-4 Network Offline / Online 的代理/隔离方案。
5. V0 formal release 仅在剩余 Gates pass 或被 Product Owner 明确 waive 后放行。
