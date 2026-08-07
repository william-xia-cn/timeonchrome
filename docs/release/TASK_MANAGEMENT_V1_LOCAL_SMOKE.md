# Task Management V1 Local Smoke

> 本文仅适用于源码 Unpacked 开发加载或明确的 development test package。正式托管 artifact 默认隐藏本地调试区域，后台拒绝调试写入，并清理遗留本地调试任务；不得通过修改 CSS 或直接发送 runtime message 绕过该发布规则。 Runbook

状态：Beta 本地验证入口。仅用于 `codex/task-management-v1` 分支的 unpacked extension。

## 目的

在不部署 Worker / Pages、不执行 D1 migration、不发布控件的前提下，验证完全独立的 Task 模块：

- 非任务资源进入 Task 自有 `modules/task/ui/required.html`；
- 命中任务资源后继续进入原访问管理流程；
- 独立 Task Admin 展示任务状态和 Beta 调试配置；
- Task 有效使用写入 `task_progress_segments_v1`；
- 核心 session、`usage_segments_v1`、Popup、Admin 和 Reminder 不包含 Task 语义。

Task 不绕过黑名单、配额或原时间段规则。测试不写真实 token，不调用生产 Task API，不修改 `guardian_config` 的云端来源。

## 自动 Smoke

从仓库根目录执行：

```powershell
node tests/manual/task-v1-local-cache-smoke.mjs
node tests/manual/task-v1-module-removal-smoke.mjs
```

第一条使用临时 Chrome profile，写入 `debugOnly` 本地任务；自动化环境通过仅限 Task 调试页的活跃 checkpoint 验证独立进度账本，避免系统无真实键鼠输入时 `chrome.idle` 正确阻止计时。该 checkpoint 不适用于云端正式任务。脚本同时验证独立 Task Admin、Task required 页面、任务资源放行和核心账本隔离。

第二条复制扩展到临时目录，同时移除：

1. `background.js` 中唯一静态安装行 `import './modules/task/install.js';`
2. 整个 `extension/modules/task/` 目录

随后验证基础 Service Worker、Popup、Admin 和原运行路径仍能启动，通用 optional-module registry 为空。

> Chrome MV3 module Service Worker 禁止运行期 `import()`。因此可拔除门禁使用“关闭唯一静态安装行 + 删除模块目录”，不使用运行期动态加载降级。

## 独立 Task Admin

安装 Task 模块后，独立页面为：

```text
chrome-extension://<extension-id>/modules/task/ui/admin.html
```

该页包含只读任务状态和 Beta 本地调试配置。主 Popup 与原 Admin 只通过通用模块入口打开此页，不展示 Task 业务状态。

默认调试任务建议：

- 名称：`Task V1 Local Debug`
- 计划开始：当前时间前 1 分钟
- 要求时长：10 分钟
- 允许域名：`khanacademy.org`

写入后打开非任务网站和任务网站分别验证阻断与后续基础流程。测试结束后点击“清除本地调试任务”。

## 手动 Seed

如需在扩展 Service Worker DevTools 中直接写入：

```js
const now = Date.now();
await chrome.storage.local.set({
  task_management_v1_cache: {
    schemaVersion: 1,
    capability: 'taskManagementV1',
    pulledAt: now,
    serverTime: now,
    taskVersion: 1,
    reason: 'manual_local_smoke',
    error: null,
    tasks: [{
      id: 'task-v1-local-smoke',
      name: 'Task V1 Local Smoke',
      lifecycleStatus: 'open',
      plannedStartAt: now - 60 * 1000,
      requiredSeconds: 600,
      completedSeconds: 0,
      revision: 1,
      resourceSpec: {
        hosts: ['khanacademy.org'],
        urls: [],
        specialTargets: [],
      },
    }],
  },
});
```

清理：

```js
await chrome.storage.local.remove([
  'task_management_v1_cache',
  'task_progress_segments_v1',
  'task_progress_state_v1',
]);
```

## 真实 Chrome Profile

真实 Profile 验证使用：

```powershell
node tests/manual/task-v1-real-profile-smoke.mjs `
  --cdp-url=http://127.0.0.1:9222 `
  --extension-id=<TimeOnChrome extension id>
```

脚本只连接用户明确选择并开启 CDP 的 Chrome 实例。它不会读取 cookie、密码、登录凭据、device token 或 managed token；会备份原 Task cache，测试后默认恢复。

验证内容：

- 独立 Task Admin 可读取 seeded task；
- 非任务页面进入独立 Task required 页面；
- 任务资源继续原访问流程；
- 主 Popup 不展示 Task；
- Task 自有 progress segment 产生，核心账本不出现 Task 字段。

`--keep-cache` 只用于继续人工观察；完成后必须清除或恢复 Task cache。

## 发布边界

本地调试配置是 Beta-only 特性。正式发布前必须重新确认保留、隐藏、移除或改为云端正式任务入口。本 runbook 不授权生产 D1 migration、Worker/Pages 部署、版本升级或发布。