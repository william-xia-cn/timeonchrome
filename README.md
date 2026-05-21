# TimeOnChrome v1.7.1

> 家长上网行为管控 Chrome 扩展（MV3）  
> 当前阶段：V0 发布闸门核查（不扩展 V1 功能）

---

## 当前能力（V0）

| 模块 | 功能 |
|------|------|
| 访问管控 | 学习/休息模式 + `studyList/compositeList/unsafeList` 三类网站模型 |
| 提醒拦截 | `reminder.html` 统一承载 unsafe / schedule / study_mode / quota 等场景 |
| 时间统计 | 事件驱动注意力引擎；`ACTIVE` 计入域名时长，`BACKGROUND_ACTIVE` 单独计入 `audioSeconds` |
| 监控总开关 | 支持 `monitoring_enabled` 全局短路（拦截、配额检查、心跳主链路） |
| 配额与借用 | 每日在线/学习/休息/待定配额 + 借用并发保护 |
| 云同步 | Cloudflare Workers 配置拉取与设备心跳（不做终端写回云端配置） |

---

## 快速开始

1. 打开 Chrome，访问 `chrome://extensions/`
2. 开启右上角「开发者模式」
3. 点击「加载已解压的扩展程序」
4. 选择扩展源码目录（`timeonchrome/extension/`）

---

## 测试命令

### 快速测试（必跑）

```bash
for f in tests/unit/*.test.js; do node "$f" || exit 1; done
```

### 完整测试（发布前）

```bash
node tests/run-all.js
```

> 说明：完整测试包含 API 与 E2E，对网络与浏览器运行环境有依赖。

---

## 项目结构（核心）

```text
timeonchrome/
├── extension/   # Chrome 扩展源码，开发时直接加载这个目录
│   ├── manifest.json
│   ├── background.js
│   ├── message-router.js
│   ├── content.js
│   ├── reminder.html / reminder.js
│   ├── popup/
│   ├── admin/
│   ├── core/        # signal/context/state/event-log/aggregate
│   ├── runtime/     # session/recovery
│   ├── product/     # interceptor/quota/analytics
│   └── infra/       # storage/cloud-sync
├── pages/       # 家长 Web 控制台（Cloudflare Pages）
├── workers/     # Cloudflare Workers 后端
├── tests/
├── tools/
├── dist/
└── docs/
```

---

## 文档

- `docs/DESIGN.md`：技术设计
- `docs/CHANGELOG.md`：版本变更
- `PROJECT_MASTER.md`：阶段边界与发布状态
- `DECISIONS.md`：关键决策
- `TASK_BOARD.md`：NOW/NEXT/LATER 任务板

---

## License

MIT
