# AGENTS.md — TimeOnChrome 开发规范

> 本文档供 AI 代理（opencode/Claude Code 等）和开发者阅读，定义项目的工作规则和约束。

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
- ❌ 让 Kimi 写代码（只做裁剪）
- ❌ 长 session 连续跑

---

## 2. 数据同步原则（已固化）

### 2.1 核心原则

```
云端 ← 家长控制台（唯一配置入口）
  ↓ GET
终端 ← 拉取配置（只读）
  ↓ POST
云端 ← 统计/会话上报（只读，不影响配置）
```

| 原则 | 说明 |
|------|------|
| 1. 云端为唯一配置源 | `profiles.config` 是 Single Source of Truth |
| 2. 终端只读拉取 | 终端启动/同步时 `GET /device/config`，不写回 |
| 3. 家长控制台是唯一配置入口 | `pages/index.html` → `PUT /profiles/:id/config` |
| 4. 终端仅上报统计 | `stats`/`sessions` 只读上报，不影响配置 |
| 5. 绑定是唯一例外 | `bind.html` 写入 `device_token`/`profile_id` |

### 2.2 禁止操作

- ❌ 终端调用 `pushConfigToCloud()`（已删除）
- ❌ 终端修改云端 `profiles.config`
- ❌ 终端通过 `UPDATE_CONFIG` 消息推送配置到云端

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

### 4.1 测试命令

```bash
node tests/run-all.js
```

### 4.2 测试覆盖要求

- 每次代码修改后必须运行测试
- 测试失败不得提交
- 新增功能必须添加对应测试

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

---

## 6. OpenCode MVP 工作流

### 6.1 模型分工

| 阶段 | 模型 | 用途 | 配置 |
|------|------|------|------|
| Plan | Kimi (kimi-k2.5) | 代码分析、上下文裁剪、制定计划 | max_tokens: 4000, temperature: 0.1 |
| Build | DeepSeek (deepseek-chat) | 代码生成、修复、重构 | max_tokens: 6000, temperature: 0.2 |

### 6.2 关键规则

- Kimi **只做裁剪，不做推理**
- context ≤ 200 行
- max_tokens ≤ 6000
- 每次只处理 **一个文件 / 一个问题**

### 6.3 配置文件位置

`.opencode/` 目录：
- `opencode.json` — 主配置
- `context_router.py` — Kimi 代码裁剪器
- `executor.py` — DeepSeek 代码执行器
- `agent.py` — 主循环（Plan→Build 切换）

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
└── .opencode/                 OpenCode MVP 配置
```
