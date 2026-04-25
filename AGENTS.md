# AGENTS.md — TimeOnChrome 开发规范

> 本文档供 AI 代理（Codex/OpenCode/Claude Code 等）和开发者阅读，定义项目的工作规则和约束。

---

## 1. 开发工作流规则

### 1.1 文档先行原则

**任何代码变更前，必须先更新文档。**

```
需求/问题 → 1.更新文档 → 2.实施代码 → 3.运行测试 → 4.提交推送
            DESIGN.md    修改代码     运行测试     同一commit
            描述变更     运行测试     确认通过     包含文档+代码
```

**具体步骤：**

1. **变更前**：在 `docs/DESIGN.md` 中记录变更意图、影响范围、修改方案
2. **实施中**：按照文档描述执行代码修改
3. **完成后**：检查文档是否与实际代码一致，修正偏差
4. **提交时**：文档变更和代码变更必须在同一个 commit 中

**禁止：**
- ❌ 先改代码后补文档
- ❌ 代码变更不更新文档
- ❌ 文档和代码分两次提交

### 1.2 文档更新位置

| 变更类型 | 更新文件 | 更新内容 |
|---------|---------|---------|
| 架构变更 | `docs/DESIGN.md` | 架构图、数据流、模块描述 |
| API 变更 | `docs/DESIGN.md` | 消息协议表、API 路由 |
| 配置变更 | `docs/DESIGN.md` | 数据结构、字段说明 |
| 版本发布 | `docs/CHANGELOG.md` + `DESIGN.md` 版本号 | 版本号和变更记录 |

### 1.3 任务拆分原则

**必须拆分为小任务，每次只处理一个文件/一个问题。**

| 粒度 | 示例 | 成功率 |
|------|------|--------|
| ✅ 极小 | "修复 bind.html 第285行的 storage key 拼写" | 95% |
| ✅ 小 | "修复 checkAndRemind 函数学习模式拦截逻辑" | 90% |
| ✅ 中等 | "修复设备绑定后 syncState 未初始化问题" | 85% |
| ❌ 大 | "重写整个同步系统" | <50% |

**禁止：**
- ❌ 一次喂整个项目
- ❌ 一次处理多个不相关文件
- ❌ 长 session 连续跑

---

## 2. 数据同步原则

> 详细设计见 `docs/DESIGN.md` 第 3.5 节

### 2.1 禁止操作

- ❌ 终端调用 `pushConfigToCloud()`（已删除）
- ❌ 终端修改云端 `profiles.config`
- ❌ 终端通过 `UPDATE_CONFIG` 消息推送配置到云端
- ❌ 任何新增的"终端→云端配置写回"逻辑

---

## 3. 代码规范

### 3.1 文件职责

| 文件 | 职责 |
|------|------|
| `background.js` | Service Worker 核心：时间追踪、拦截逻辑、云同步（只读拉取） |
| `content.js` | 内容脚本：媒体检测、用户交互检测、心跳发送 |
| `popup/` | 孩子侧弹窗：只读视图、模式切换、借用时间 |
| `admin/` | 管理面板：本地密码保护、配置查看 |
| `bind.html` | 设备绑定：一次性写入 device_token/profile_id |
| `reminder.html` | 拦截提醒页：7 种场景的友好提示 |
| `pages/index.html` | 家长控制台（Cloudflare Pages）：唯一配置修改入口 |
| `workers/` | Cloudflare Workers 后端：API、D1 数据库、R2 存储 |

### 3.2 存储 Key 规范

| Key | 用途 | 说明 |
|-----|------|------|
| `guardian_config` | 扩展配置 | 完整配置对象 |
| `guardian_session` | 会话状态 | 当前模式、今日时长 |
| `cloud_device_token` | 设备令牌 | 云同步认证 |
| `cloud_profile_id` | Profile ID | 关联孩子档案 |
| `cloud_last_sync` | 最后同步时间 | 时间戳 |

### 3.3 字段名规范

| 字段 | 说明 | 注意 |
|------|------|------|
| `compositeList` | 允许/待定网站列表 | 云端和扩展统一使用此名称 |
| `allowList` | 家长控制台界面字段 | 渲染时从 `compositeList` 映射 |
| `unsafeList` | 屏蔽网站列表 | 旧 `blacklist` 已迁移 |
| `studyList` | 学习网站列表 | 名称一致 |

---

## 4. 测试规范

### 4.1 测试分级

| 级别 | 命令 | 用例 | 耗时 | 时机 |
|------|------|------|------|------|
| 快速测试 | `for f in tests/unit/*.test.js; do node "$f" || exit 1; done` | 157 | ~7s | 每次代码修改后 |
| 完整测试 | `node tests/run-all.js` | 218 | ~42s | git push 前 |

### 4.2 规则
- 每次代码修改后必须运行**快速测试**
- 不要使用 `node tests/unit/*.test.js` 作为全量口径（该写法只会执行单个入口文件）
- 全量 unit 必须逐文件执行（见 4.1 快速测试命令）
- 推送前必须运行**完整测试**
- 纯文档变更不需要运行测试
- 测试失败不得提交
- 新增功能必须添加对应测试

### 4.3 测试套件说明
| 测试文件 | 类型 | 用例数 | 说明 |
|---------|------|--------|------|
| `tests/unit/logic.test.js` | 单元测试 | 43 | 纯函数，无依赖 |
| `tests/unit/background-logic.test.js` | 单元测试 | 80 | 核心逻辑，无依赖 |
| `tests/unit/workers-logic.test.js` | 单元测试 | 34 | Worker 逻辑，无依赖 |
| `tests/api/workers.test.js` | 集成测试 | 52 | 需要网络，调用真实 API |
| `tests/e2e/extension.test.js` | E2E 测试 | 9 | 需要浏览器，UI 测试 |

---

## 5. Git 规范

### 5.1 分支策略

| 分支 | 用途 |
|------|------|
| `master` | 生产环境，Cloudflare Pages 部署源 |
| `develop` | 开发分支，功能合并后推送到 master |

### 5.2 Commit 格式

```
<type>: <description>

type: fix | feat | refactor | docs | chore | test
```

示例：
```
fix: 修复家长控制台 allowList/compositeList 字段不一致
docs: 更新 DESIGN.md 反映云端为唯一配置源原则
refactor: 删除终端推送配置逻辑，确立云端为唯一配置源
```

### 5.3 推送策略

| 阶段 | 操作 | 测试要求 | 说明 |
|------|------|---------|------|
| 开发中 | `git commit`（本地） | 快速测试 | 频繁提交，不推送 |
| 功能完成 | 完整测试 → `git push` | 完整测试 | 批量推送多个 commit |
| 准备发布 | 完整测试 → `git tag` → `git push --tags` | 完整测试 | 打版本标签 |

---

## 6. 代码执行器策略

### 6.1 默认执行器：Codex

| 角色 | 工具 | 职责 |
|------|------|------|
| **默认代码执行器** | Codex | 代码生成、修复、重构、测试编写、日常开发 |
| **总控层** | Product Owner + ChatGPT | 需求定义、范围控制、决策审批、任务分配 |

### 6.2 OpenCode 角色（降级为辅助）

OpenCode 不再是默认代码执行器，保留以下辅助角色：

| 场景 | 用途 |
|------|------|
| 本地复验 | 验证 Codex 产出的代码在本地环境可运行、测试通过 |
| 环境排查 | 诊断浏览器、Playwright、Node.js 等本地环境问题 |
| 最小必要修补 | 紧急小修、配置调整、脚本执行 |
| Fallback 执行器 | Codex 不可用时的备用方案 |

### 6.3 执行边界（所有执行器通用）

- **不能判断 GitHub 真实状态**：只能基于本地 Git 状态推断，涉及远程状态时必须通过 `git fetch` 确认
- **不能擅自扩大范围**：严格按任务描述执行，不添加未要求的功能
- **必须有测试证据**：代码变更后必须运行对应测试，测试失败不得提交
- **保留范围控制规则**：V0 收口阶段不扩展新功能，V1 设计不进入实现

### 6.4 历史说明

- OpenCode MVP 工作流（Kimi 裁剪 + DeepSeek 构建）已完成其历史使命
- OpenCode timing trace diagnostics 工作已收口并推送（commit `71516d2`，branch `release/v0.1-duration-diagnostics`）
- `.opencode/` 目录保留为历史参考，不再作为活跃执行配置
- Antigravity 已从当前协作链路移除，不再使用

---

## 7. 项目结构

```
timeonchrome/
├── manifest.json              MV3 扩展清单
├── background.js              Service Worker 核心
├── content.js                 内容脚本
├── config.js, auth.js, sync.js  云同步配置
├── bind.html                  设备绑定页
├── popup/                     孩子侧弹窗
├── admin/                     管理面板
├── reminder.html              拦截提醒页
├── pages/                     家长控制台（Cloudflare Pages）
├── workers/                   Cloudflare Workers 后端
├── tests/                     测试套件
├── docs/                      文档
│   ├── DESIGN.md              技术设计文档
│   ├── PRD.md                 产品需求文档
│   ├── CHANGELOG.md           变更记录
│   ├── TODO.md                待办事项
│   └── TEST-SPEC.md           测试规范
└── .opencode/                 OpenCode MVP 配置（历史参考，非活跃）
```

---

## 8. Project Control Docs（项目控制文档）

以下文档位于仓库根目录，用于阶段管理与执行同步：

- `PROJECT_MASTER.md`：项目主状态与阶段边界（V0/V1）
- `DECISIONS.md`：关键决策与状态
- `TASK_BOARD.md`：任务看板（NOW/NEXT/LATER）

### 当前基线（控制口径）
- V0 收口阶段
- music time 进入 V0
- composite routing 延后到 V1
- monitoring closeout 部分完成，继续按小包推进
