# AGENTS.md — TimeOnChrome 开发规范

> 本文档供 AI 代理（Codex/OpenCode/Claude Code 等）和开发者阅读，定义项目的工作规则和约束。

---

## 1. 开发工作流规则

### 1.0 Lightweight Solo-Product Workflow

TimeOnChrome 当前不是商用团队项目，而是个人/小团队产品实验与 Chrome Web Store 首发准备项目。默认流程应保持轻量：

- 小任务默认不新建 spec / handoff / audit / release report。
- 中等任务只保留必要规格、实现结果、测试证据和风险。
- Release / CWS / 生产 profile / 隐私相关工作才使用 release checklist、readiness report 或 handoff。
- 手工证据允许使用，但必须标清 `PASS_WITH_MANUAL_EVIDENCE`，不得伪装成自动化证据。
- CWS 审核通过前，CWS installed-ID parity 记为 `BLOCKED_BY_CWS_REVIEW / NOT YET APPLICABLE`，不得作为当前可关闭 gate。

默认更新位置：

- `TASK_BOARD.md`：下一步、blocker、当前任务状态。
- `PROJECT_MASTER.md`：稳定事实、阶段、release 状态。
- `DECISIONS.md`：长期产品/架构/发布策略决策。
- `docs/release/*`：当前 release checklist、gate template、active release runbook。
- `docs/archive/*`：历史证据、旧验收、旧交接、旧计划；不得作为当前 source of truth。

### 1.1 文档先行原则

**任何代码变更前，必须先更新文档。**

```
需求/问题 → 1.更新文档 → 2.实施代码 → 3.运行测试 → 4.提交推送
            DESIGN.md    修改代码     运行测试     同一commit
            描述变更     运行测试     确认通过     包含文档+代码
```

**具体步骤：**

1. **变更前**：按变更风险选择最小文档位置；普通小修可只在任务说明或 `TASK_BOARD.md` 记录，架构/API/数据变更才更新 `docs/DESIGN.md`
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
| 小 bug / 小文案 / 小测试 | `TASK_BOARD.md` 或最终报告 | 当前状态、结果、后续项 |
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
| `tests/e2e/reminder-v0-validation.test.js` | 浏览器门 | 11 | Reminder V0 模式切换验证；`reminder.js` 变更必须运行 |

### 4.4 Playwright E2E 工作目录规则

**Playwright E2E 命令必须从 `timeonchrome` 项目根目录运行，不能从父目录 `ChromeExtension` 运行。**

```bash
# ✅ 正确
cd D:\Opencode\ChromeExtension\timeonchrome
npx playwright test tests/e2e/<test>.js

# ❌ 错误（从父目录运行会因 node_modules 解析失败导致 No tests found）
npx playwright test tests/e2e/<test>.js
```

**根因**：`package.json` 和 `node_modules` 位于 `timeonchrome/` 内，不在 `ChromeExtension/` 内。如果在运行 Playwright 命令之前不切换到 `timeonchrome/`，模块解析会在错误的路径上查找 `@playwright/test`，导致所有测试静默失败并出现 `test() is not expected here` 错误。

> **此规则适用于所有 executor（Codex、OpenCode、Claude Code 等）。在调用 `npx playwright test` 之前始终通过 `--workdir` 参数或先 `cd` 到 `timeonchrome/`。**

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
| **日常执行闭环** | Codex 三角色体系 | Product&Project Mg 负责需求/规格/计划/审核；Build&Test 负责实现/测试/证据；releaseMg 负责验收/发布门禁/发布准备 |
| **最终决策层** | Product Owner | 产品方向、范围裁决、风险接受、发布/暂停/上线最终决定 |
| **外部顾问层** | ChatGPT | 架构审查、关键决策辅助、复杂问题第二意见、三角色机制修正；不负责日常开发调度 |

### 6.0.1 三角色轻量协作默认值

三角色边界继续有效，但默认协作降级为轻量模式：

- Product&Project Mg：默认维护 `PROJECT_MASTER.md` / `TASK_BOARD.md` / `DECISIONS.md`，只有中高风险任务才创建 spec/handoff。
- Build&Test：默认从明确 PO 请求或现有权威文档执行，输出简短 changed files / tests / risks；只有中高风险或 release-bound 工作才写 implementation report / formal audit。
- releaseMg：默认用一张 checklist / result table 汇报；只有 CWS、production profile、release blocker、隐私风险才更新 release report。
- ChatGPT：只在关键判断、流程修正、架构或 release blocker 争议时介入。

### 6.1.1 ChatGPT 外部顾问定位

ChatGPT 是 Product Owner 的外部顾问、架构审查者和关键决策辅助者。ChatGPT 不再承担 TimeOnChrome 的日常工程总控，也不负责每个 Codex session 的日常任务指导。

ChatGPT 主要介入以下场景：

1. 重大产品方向、范围、V0/V1 边界判断。
2. 架构设计、存储结构、云同步、统计口径、权限模型等关键决策。
3. 发布前重大风险审查。
4. Codex 三角色机制、handoff 机制和文档体系的设计与修正。
5. 对 Product&Project Mg、Build&Test、releaseMg 输出进行关键节点抽样审查。
6. 为 Product Owner 提供第二意见和决策框架。

ChatGPT 不负责：

1. 日常开发调度。
2. 普通 bugfix 指导。
3. 每个 Codex session 的 prompt 生成。
4. 常规测试失败排查。
5. Build&Test 的实现细节管理。
6. releaseMg 的每一步手工操作陪跑。
7. 日常任务板逐项维护。

### 6.1.2 ChatGPT 升级规则

只有以下情况建议升级给 ChatGPT：

- 产品模型变化。
- 架构设计不确定。
- 存储、云同步、统计口径、权限模型变化。
- release blocker 判断有争议。
- Codex 三角色职责冲突。
- Agent 输出疑似越界。
- Product Owner 需要第二意见。

普通 UI 文案、小 bug、单文件小修、常规测试补充、常规文档同步，先由 Codex 三角色体系处理。

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

## 7. 执行合规性规则（所有执行器通用）

> 本节针对 AI 执行器（Codex / OpenCode / Claude Code 等）的刚性约束，防止"等价替代 / 自行简化 / 未逐项对照"行为。

### 7.1 Plan Conformance Rule（方案一致性审查）

**任何实现任务开始前，必须执行以下步骤：**

1. **输出实施计划**：将确认方案拆解为可逐项核对的 checklist，明确每个 UI 元素 / 字段 / 逻辑分支的对应实现位置
2. **逐项执行**：严格按照 checklist 逐条实施，不得合并、跳过或重新排序
3. **执行后审计（Post-Implementation Audit）**：
   - 对比 checklist 与实际代码，标记 `Matched` / `Deviated` / `Missing` / `Extra`
   - 若存在 `Deviated` 或 `Missing`，必须回滚修正，不得用"等价替代"辩解
   - 审计报告必须在提交前输出

**禁止：**
- ❌ 用"等价方案"替代已确认的具体实现（如用 grid 替代 flex 未获批准）
- ❌ 擅自删除确认方案中的 UI 元素或功能模块
- ❌ 未逐项核对即声称"已完成"
- ❌ 将多步确认方案合并为单步实现

### 7.2 UI Change Boundary Rule（UI 变更边界）

**当任务涉及 UI 修改时，以下行为必须获得 Product Owner 或方案确认人明确批准：**

- 删除、隐藏、合并或移动任何已确认存在的 UI 元素
- 改变信息层级（如将二级信息提升为一级，或反之）
- 改变交互流程（如将多步操作合并为一步）
- 改变数据展示口径（如将 domain 明细合并为全局摘要）

**例外（无需批准即可执行）：**
- 仅调整颜色、字号、间距等纯样式属性
- 修复明显的视觉 bug（如元素溢出、对齐错误）

### 7.3 Commit Gate Rule（提交闸门）

**满足以下任一条件，禁止提交：**

1. 存在未记录的 `Deviated` 变更（与确认方案不一致）
2. 存在未获批准的 `Extra` 变更（超出方案范围的新增功能）
3. Plan Conformance Audit 未执行或未通过
4. 测试未通过（文档变更除外）

### 7.4 Visual Verification Rule（页面开发目视验证）

**涉及 HTML/CSS 的页面开发任务，必须在 Commit 前完成目视验证：**

1. 使用 Playwright 或浏览器打开目标页面，注入 mock 数据渲染完整布局
2. 截图并与确认方案进行逐项结构对比
3. 标记 `Matched` / `Deviated` / `Missing`
4. 存在 `Deviated` / `Missing` 时禁止提交，必须回正

**禁止：**
- ❌ 仅通过代码 diff 和自动化测试就声称 UI 已完成
- ❌ 未目视确认布局、层级、文案即提交

---

**提交前 checklist：**
- [ ] Plan Conformance Audit 已完成且通过
- [ ] **页面开发：目视验证截图已完成且通过**
- [ ] 无未批准的 Deviated / Extra 变更
- [ ] 快速测试通过（代码变更时）
- [ ] 文档与代码在同一 commit

---

## 8. 项目结构

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

## 9. 项目文档与权威来源（Source of Truth）

以下文档按主题分类，执行器在接到任务时应优先读取对应文档，避免范围漂移和重复文档化。

docs/archive/ 仅保存历史证据、旧验收、旧交接、旧计划和过期发布材料；除非用户明确要求查历史，不得把 archive 文件作为当前产品、工程、发布或部署 source of truth。

### 9.1 文档清单

| 文档 | 权威范围 / 用途 | 何时读取 |
|------|----------------|---------|
| `PROJECT_MASTER.md` | 当前项目真值：阶段、范围、发布闸门、活跃状态、实施边界 | 任何任务开始前，确认阶段和范围 |
| `TASK_BOARD.md` | 当前任务板：NOW / NEXT / LATER / COMPLETED | 选择或更新工作项之前 |
| `DECISIONS.md` | 持久的产品与架构决策（D-001 ~ D-015） | 任务触及已决策的产品/架构行为时必读 |
| `PROJECT_WORKFLOW.md` | 轻量三角色 Codex 协作流程：Product&Project Mg / Build&Test / releaseMg 的默认轻流程与重流程触发条件 | 拆分多 session 工作、创建 handoff、审查角色边界时 |
| `AGENTS.md` | Agent 执行规则、Preflight 闸门、允许/禁止行为、测试与提交纪律 | 执行任何 Agent 任务之前 |
| `docs/agents/ProductProjectMg.md` | Product&Project Mg 强制运行契约：职责、权限、禁止事项、preflight、workflow、stop criteria、输出格式 | 以 Product&Project Mg 身份启动 session 或审核 spec/实现时必须读取 |
| `docs/agents/BuildTest.md` | Build&Test 强制运行契约：职责、权限、禁止事项、preflight、workflow、test rules、stop criteria、实现报告要求 | 以 Build&Test 身份启动 session 或执行已批准 spec 时必须读取 |
| `docs/agents/ReleaseMg.md` | releaseMg 强制运行契约：职责、权限、禁止事项、preflight、release SOP、production-profile/CWS gates、release gate 输出要求 | 以 releaseMg 身份启动 session 或执行验收/发布门禁时必须读取 |
| `docs/handoffs/HANDOFF_TEMPLATE.md` | 跨 session 标准转帖模板 | 任一角色向另一角色交接工作时 |
| `docs/specs/FEATURE_SPEC_TEMPLATE.md` | 功能规格模板 | Product&Project Mg 创建新功能规格时 |
| `docs/release/RELEASE_CHECKLIST.md` | releaseMg 默认发布检查清单 | 执行 release gate 或 release readiness review 时 |
| `docs/release/RELEASE_GATE_REPORT_TEMPLATE.md` | release gate 报告模板 | releaseMg 输出 release gate/report 时 |
| `docs/SITE_ACCESS_POLICY.md` | 网站访问策略主文档：五类网站模型、系统配置/自定义/当前家庭/导入导出/effective 清单边界 | 涉及网站分类、允许/阻止列表、站点配置、导入导出、运行时站点规则的任务 |
| `docs/DESIGN.md` | 工程设计细节、数据结构、配置 schema、API 路由、前后端架构说明 | 涉及配置/数据/API/架构变更的任务 |
| `docs/UI_STYLE_MAP.md` | 家长/管理面板 UI 布局、UI 文案、视觉分组、页面结构、界面约定 | 涉及 UI 变更的任务 |
| `docs/MODE_QUOTA_ROUTING_MATRIX_V0.md` | V0 模式/配额路由矩阵：reason、allowed/forbidden actions、quota behavior | 涉及模式切换、提醒页路由、配额耗尽行为的任务 |
| `docs/MODE_TRANSITION_UX_V0.md` | V0 模式切换 UX：视觉布局、文案展示、滑动/按钮交互风格 | 涉及提醒页视觉/交互实现的任务 |
| `docs/site-access-config.example.json` | 用户可见的网站访问导入/导出示例格式 | 涉及导入导出示例的任务；禁止将其作为系统默认值或生产 seed data |

### 9.2 权威层级（Authority Precedence）

当文档之间出现冲突时，按以下优先级判断；若无法自行解决，必须停止并报告，禁止猜测。

1. `DECISIONS.md` — 对已确认的产品/架构决策具有最高权威。
2. `PROJECT_MASTER.md` — 控制当前阶段、发布闸门和执行边界。
3. `TASK_BOARD.md` — 追踪任务状态，但不覆盖阶段/范围决策。
4. 网站访问相关：
   - `docs/SITE_ACCESS_POLICY.md` — 控制产品规则。
   - `docs/DESIGN.md` — 控制技术结构。
   - `docs/UI_STYLE_MAP.md` — 控制 UI 表现。
5. 模式/路由/UX 相关：
   - `docs/MODE_QUOTA_ROUTING_MATRIX_V0.md` — 路由、reason、allowed/forbidden actions、quota behavior 的权威来源。
   - `docs/MODE_TRANSITION_UX_V0.md` — 仅控制视觉布局、文案展示、滑动/按钮交互风格。必须引用矩阵 Case ID，不得独立重定义 allowed actions。冲突时以矩阵文档为准。
6. `AGENTS.md` — 控制 Agent 执行纪律和 Preflight/Build/Audit 规则。

### 9.3 执行规则

1. **产品/站点分类规则**必须与 `docs/SITE_ACCESS_POLICY.md` 核对。
2. **配置/数据结构变更**必须与 `docs/DESIGN.md` 核对。
3. **UI 布局/文案变更**必须与 `docs/UI_STYLE_MAP.md` 核对。
4. **模式/路由/提醒页行为**必须与 `docs/MODE_QUOTA_ROUTING_MATRIX_V0.md` 核对。
5. **提醒页视觉/交互实现**必须与 `docs/MODE_TRANSITION_UX_V0.md` 核对，且 UX 文档不得独立重定义路由/actions。
6. **持久的产品或架构决策**必须记录到 `DECISIONS.md`。
7. **活跃任务状态**应在适当时反映到 `TASK_BOARD.md`。
8. **运行时 / GitHub / 部署状态**禁止凭记忆推断，必须基于实际命令输出、工具输出或用户提供的证据。
9. **禁止创建新文档文件**——如果现有权威文档已覆盖该主题，除非获得明确批准。已批准的三角色协作文件位于 `docs/agents/ProductProjectMg.md`、`docs/agents/BuildTest.md`、`docs/agents/ReleaseMg.md`、`docs/handoffs/`、`docs/specs/`、`docs/release/` 与 `PROJECT_WORKFLOW.md`。
10. **禁止将示例 JSON 文件视为生产默认值或初始化数据**。
11. **禁止混为一谈**——以下五类数据不可互换：
   - 系统配置网站列表（system-configured site lists）
   - 用户/自定义网站列表（user/custom site lists）
   - 当前家庭初始化数据（current-family initialization data）
   - 用户导入导出示例数据（user import/export example data）
   - 运行时 effective 清单（runtime effective lists）

### 9.4 三角色协作文件说明

`PROJECT_WORKFLOW.md` 已作为轻量三角色 Codex 协作流程的入口文档。角色强制运行契约由 `docs/agents/ProductProjectMg.md`、`docs/agents/BuildTest.md`、`docs/agents/ReleaseMg.md` 定义。跨 session 交接优先使用现有权威文档和简短结果；只有 scope/permission/release evidence 需要持久边界时，才使用 `docs/handoffs/HANDOFF_TEMPLATE.md` 派生的 handoff 文档。

### 9.5 当前基线（控制口径）

- V0 收口阶段
- music time 进入 V0
- composite routing 延后到 V1
- monitoring closeout 部分完成，继续按小包推进

---

## 10. Quota Budget Rule（配额节流规则）

为节省 Codex 配额，默认采用最小工作模式；除非用户明确批准，不得主动扩展范围。

### 10.1 Scope Control
- 只做任务请求中明确要求的工作。
- 不修复无关问题，不顺手改进，不做隐式重构。
- 需要重构时必须先获得明确指令。
- 发现无关问题时只记录为后续事项，不在当前任务中修改。

### 10.2 File-Reading Budget
- 仅读取 `Read first` 列出的文件与直接必要文件。
- 默认禁止全仓扫描。
- 若必须读取额外文件，先用一句话说明原因。

### 10.3 Test Budget
- 默认不跑广泛回归，不跑全量测试套件。
- 未明确批准前不跑 Playwright E2E。
- 未明确批准前不跑破坏性系统闸门测试。
- 仅运行与改动文件直接相关的最小测试集合。
- 若需要更大测试范围，先停止并给出“精确命令 + 原因”，等待批准。

### 10.4 Execution Budget
- 优先一次性最小补丁，避免多轮重复试错。
- 同一失败命令最多尝试两次；两次失败后停止并报告阻塞。
- 非必要不申请沙箱提权；仅在任务无法完成且确有必要时申请。

### 10.5 Output Budget
- 最终报告保持简短，仅包含：
- changed files
- summary
- commands run
- test result
- commit hash if committed
- remaining blockers
- git status --short

### 10.6 Stop Conditions
- 出现以下任一情况必须停止并报告：任务需要扩大范围、涉及产品语义变更、需要破坏性测试、需要凭据、需要处理 Git 锁/权限问题、或需要重构。

---

## 11. Agent Registry

### Product&Project Mg — Product and Project Management Agent

`Product&Project Mg` is responsible for product structure, functional specifications, project planning, acceptance criteria, and implementation conformance review.

Rules:
- It may modify documentation only.
- It must not modify product code or test code.
- It must follow the mandatory preflight, workflow, stop criteria, and handoff rules in `docs/agents/ProductProjectMg.md`.
- It defines functional test design and acceptance criteria, but does not execute release gates.
- It should use lightweight updates by default; formal handoff is required only for bounded cross-session work, release blockers, or scope-sensitive work.
- It must read `docs/agents/ProductProjectMg.md` before execution.

### Build&Test — Implementation and Test Agent

`Build&Test` is responsible for implementing approved specs, modifying product/test code within scope, running relevant tests, and producing implementation evidence.

Rules:
- It may implement from an approved spec, existing authoritative docs, or an explicit Product Owner implementation request.
- It must not change product decisions, release standards, or scope without approval.
- It must follow the mandatory preflight, workflow, test rules, stop criteria, and deliverable rules in `docs/agents/BuildTest.md`.
- Passing tests are implementation evidence, not release approval.
- It must output changed files, tests run, risks, and a concise scope conformance summary; formal audit is required only for medium/high-risk or release-bound work.
- It must read `docs/agents/BuildTest.md` before execution.

### releaseMg — Release Gate and Acceptance Agent

`releaseMg` is responsible for release gates, acceptance tests, release evidence, and release readiness recommendations.

Rules:
- It is not a feature-development agent.
- It must not modify product code or fix bugs.
- It must not lower release standards.
- It must follow the mandatory preflight, workflow, stop criteria, result vocabulary, production-profile/CWS SOP, and evidence rules in `docs/agents/ReleaseMg.md`.
- It owns localized critical acceptance tests and the most important manual or semi-manual release checks; it does not run default full regression unless Product Owner approves that scope.
- It may start Chrome for release/admin workflows, inspect Chrome Web Store Developer Dashboard, and use an already-authenticated browser session.
- If Google or Chrome Web Store login or 2FA is required, it must guide the Product Owner to complete that manually in the browser and must not request credentials in chat or terminal.
- It may recommend readiness, but Product Owner makes the final release decision.
- It may use concise result tables by default; standard release reports are required for CWS, production profile, release blocker, privacy-sensitive evidence, or Product Owner request. It must preserve waived/deferred risks as risks, not as pass.
- It must read `docs/agents/ReleaseMg.md` before execution.
- It must not commit local Chrome profile paths, child IDs, account details, screenshots with private data, cookies, tokens, or credentials.
- It must not click final Chrome Web Store Submit for Review unless Product Owner explicitly says: `ReleaseMg: submit now`.
