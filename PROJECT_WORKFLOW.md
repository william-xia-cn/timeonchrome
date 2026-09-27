# PROJECT_WORKFLOW

## 三会话模块职责（ARM-D-034）

模块归属与 Product / Build / Release 阶段职责同时适用；不扩大发布权限。

| 职责档案 | 所属任务 | 可修改范围 |
|---|---|---|
| runtime-cloud-contract | App Runtime Management（现名 TimeWhere native 架构管理） | 跨端架构、契约、兼容测试、黄金向量、边界检查、Runtime backend/console/规则 |
| extension-local | TimeOnchrome 访问管理策略 | extension 本地实现、统计、配额、UI、Host 客户端、扩展打包 |
| native-local | Native Host 开发 | TimeWhereNative 的 Host/Service/Agent/Manager/本机统计/安装器、固定契约包消费 |
| release | releaseMg | 发布证据与既有授权发布流程，不修产品代码 |

Guardian、主控制台与 Santa 归属不变。当前架构任务不修改 extension、dist 候选或 Native 本机代码，即使只有几行；可以只读取证，再交给对应任务修复。Native Host 只做 framing/转发；网页和应用分别保持统计权威。

普通单模块修复由所属任务直接处理。消息字段、能力协商、错误码、版本、权威、隐私或兼容行为变化，先由架构任务确定契约语义、失败行为、兼容范围、最小测试及上线依赖，再向两端发送包含版本、允许路径、验收与禁止事项的精简任务。契约只在 TimeOnChrome 定义；Native 锁定版本及哈希，不引用其他仓库源码。两端返回提交/PR、测试和实机证据，架构任务核对兼容状态。不得以等价实现自行改变契约。网页落账、安全和生产专项批准继续有效。

每项任务在任务板或 PR 声明职责档案、允许路径、最小测试；公共锁文件/CI 等例外必须逐文件说明原因，不接受根目录白名单。提交前运行 `tools/check-task-scope.js` 检查本任务 diff。PR 描述使用 `Task-Role: runtime-cloud-contract`（或其他档案），例外使用 `Scope-Exception: 精确路径 | 原因`；跨职责路径不能靠例外放行，须拆分交接。CI 只证明声明与路径匹配，不能证明哪个聊天窗口编写代码，不使用 CODEOWNERS 伪造同账号独立审批。发现越界停止提交并转交，不自动回滚他人修改。

治理测试只运行职责检查固定用例、现有 CI 路由/源码边界及 diff check；文档只走轻量门，不运行产品/平台测试。本轮无业务、协议、安装或部署变更。

检查示例：将上述声明放入临时文本文件（不要保存敏感信息），提交前运行 `node tools/check-task-scope.js --base origin/master --head HEAD --declaration <声明文件>`；暂存未提交时使用 `--staged --declaration <声明文件>`。重命名同时检查新旧路径。PR 的 changes job 读取 PR 描述与实际 diff，失败阻断现有 app-runtime-gate；修改 PR 描述会重新检查。master push 复用 PR 审查，不引入可发布的第二份职责声明。与这三个模块无关的任务仍遵守原所属模块规则。

## Lightweight Three-Role Codex Workflow

TimeOnChrome is currently a personal / small-team product experiment preparing for its first Chrome Web Store release. The workflow should be traceable but lightweight.

Default principle:

```text
Use the smallest durable record that keeps the next action clear.
Do not create handoff, audit, spec, or release-report files by default.
```

Heavy governance is reserved for release gates, scope disputes, dirty worktree confusion, security/privacy-sensitive work, or role-boundary conflicts.

TimeOnChrome uses three separated Codex roles for project work:

1. `Product&Project Mg`
2. `Build&Test`
3. `releaseMg`

The collaboration rule is:

```text
Codex sessions do not rely on memory for important facts.
For routine work, update PROJECT_MASTER.md / TASK_BOARD.md / DECISIONS.md as needed.
Use formal handoff documents only when a separate session genuinely needs bounded instructions or evidence.
```

## ChatGPT Advisor Boundary

ChatGPT is Product Owner's external advisor, architecture reviewer, and decision-support partner.

ChatGPT is not the daily project manager for TimeOnChrome. It does not own daily Codex session scheduling, ordinary bugfix routing, routine prompt generation, routine test-failure debugging, Build&Test implementation details, releaseMg step-by-step operations, or daily task-board maintenance.

Daily execution belongs to the three Codex roles. ChatGPT should be involved only at high-value decision points:

- product model changes;
- uncertain architecture decisions;
- storage, cloud sync, statistics semantics, or permission model changes;
- disputed release blocker classification;
- role-boundary conflict between Codex sessions;
- suspected agent scope violation;
- Product Owner needs a second opinion before a decision;
- major release-risk review.

## Mandatory Role Contracts

Each role has a mandatory operating contract. These documents are not suggestions:

- `docs/agents/ProductProjectMg.md`
- `docs/agents/BuildTest.md`
- `docs/agents/ReleaseMg.md`

Every role contract includes preflight, workflow, forbidden actions, stop criteria, and required evidence. A session must stop and ask Product Owner for an explicit override if the prompt conflicts with its role contract.

## Role Boundary Table

| Work item | Product&Project Mg | Build&Test | releaseMg |
|---|---:|---:|---:|
| Requirement clarification | Owner | No | No |
| Functional specs | Owner | Read only | Read only |
| Architecture plan | Review owner | Implementation owner | Risk check |
| Code implementation | Forbidden | Owner | Forbidden |
| Unit tests | Defines requirements | Owner | Evidence sampling |
| Integration tests | Defines requirements | Owner | Evidence sampling / rerun |
| Black-box acceptance | Designs cases | Supports fixes | Owner |
| Release gates | Defines standards | Provides evidence | Owner |
| Documentation sync | Owner | Implementation reports / required technical docs only | Release reports |
| GitHub state judgment | Evidence review only | Forbidden as final judgment | Must verify, no memory-based judgment |
| Final release decision | Product Owner | Forbidden | Recommendation only |

## Default Workflow

### Small / Routine Work

Use this for small bugfixes, copy tweaks, focused tests, ordinary docs sync, and local follow-ups.

```text
Product Owner
-> relevant Codex role
-> concise result report
-> update TASK_BOARD.md / PROJECT_MASTER.md only if durable status changed
```

Defaults:

- no new spec file;
- no handoff file;
- no audit file;
- no release report;
- no ChatGPT escalation;
- tests limited to the smallest relevant set for code changes.

### Change-impact test contract

Every implementation task must declare its test contract before code changes begin:

- change class and affected subsystems;
- required local tests;
- required CI jobs;
- required post-deployment smoke checks;
- explicitly excluded tests and why they are unrelated.

Test scope is determined by impact, not by task size or by mechanically reaching push/release. A passing result for an exact Git SHA and artifact hash is reusable. Documentation or release-evidence commits do not invalidate unchanged code evidence. Expanding the declared test scope requires the exact command, risk reason, and expected runtime, followed by Product Owner approval. “More complete” is not a sufficient reason.

The default App Runtime levels are:

| Change class | Required evidence | Excluded by default |
|---|---|---|
| Documentation / release evidence | `git diff --check`, document structure | Product tests |
| Console copy/style | Focused Console tests; screenshots only for layout changes | Worker, agents, WiX |
| Console behavior | Console unit/type checks and relevant visual check | Agents, WiX |
| Worker / rule pack | Focused Worker tests, typecheck, Wrangler dry-run | Agents, WiX |
| Public contracts | Contract compatibility and actual consumers | Unaffected platforms/packages |
| Windows Agent | Relevant .NET tests | macOS, Console, Worker |
| Windows installer | Installer structure tests and WiX build | macOS, Worker, Console |
| macOS Agent | Relevant Swift tests | Windows, WiX, Console |
| Cross-platform state/accounting | Golden vectors and both affected platforms | Unrelated UI/installer |
| Production deployment | Exact-SHA gate, health/auth/resource smoke | Repeated cross-platform build |

Accounting, migration, security, permission, privacy, and store-release changes retain their dedicated gates. This matrix narrows unrelated work only; it never waives a dedicated high-risk gate.

For pull requests, `app-runtime-gate` is the only required App Runtime check. It runs for every PR so unrelated changes receive a fast successful result, while its change classifier skips all Runtime product jobs. Individual platform jobs must not be configured as required checks.

### Medium Work

Use this when the change touches multiple files, product behavior, storage, cloud sync, permissions, or user-visible workflows.

Minimum durable record:

- a short task/spec section in an existing doc, or a spec file only when the scope needs it;
- Build&Test result report with changed files, behavior changes, tests, risks;
- `TASK_BOARD.md` update when status changes.

Formal handoff is optional and should be used only when another session cannot safely continue from the current docs and concise chat summary.

### Release / High-Risk Work

Use this for Chrome Web Store, release readiness, production profile, package identity, privacy/security, cloud/D1/Worker changes, or release blocker disputes.

Minimum durable record:

- release checklist or readiness report;
- blocker/risk table;
- Product Owner decisions;
- private-data redaction notes when evidence includes screenshots or profile/account state.

Do not require CWS installed-ID parity before Chrome Web Store review approval makes the public item installable.

## Heavy Workflow Escape Hatch

Use the older full workflow only when the risk justifies it:

```text
Product Owner
-> Product&Project Mg
-> Build&Test
-> Product&Project Mg review
-> releaseMg acceptance
-> Product Owner release decision
```

ChatGPT may review or advise at key decision points, but it does not replace the three-role workflow and does not replace Product Owner final decision.

### 1. Product&Project Mg Produces Spec

Required only for medium/high-risk work where scope cannot be safely held in existing docs:

- `docs/specs/SPEC-<id>-<feature-name>.md`
- `docs/handoffs/outbox/HANDOFF-<id>-to-build-test.md`

The spec must include:

- goal;
- scope;
- out of scope;
- user behavior;
- data and state behavior;
- acceptance criteria;
- required tests;
- release risk;
- rollback risk.

### 2. Build&Test Implements

Build&Test works from an approved spec, existing authoritative docs, or an explicit Product Owner implementation request.

Default output:

- changed files;
- behavior changes;
- tests run and results;
- known risks;
- scope conformance summary;
- out-of-scope confirmation.

Formal scope conformance audit and handoff are required only for medium/high-risk work, release-bound work, or when requested.

### 3. Product&Project Mg Reviews

Product&Project Mg reviews implementation conformance only.

Default outputs:

- conformance review;
- scope deviation check;
- decision alignment check;
- documentation alignment check;
- recommendation on whether releaseMg may accept.

For routine work, a concise review note is enough.

### 4. releaseMg Accepts

releaseMg executes release gates and acceptance tests.

Default outputs:

- release gate report;
- acceptance test results;
- failed items;
- blockers;
- release readiness recommendation;
- Product Owner final decision required.

For non-release smoke or narrow acceptance, a concise result table is enough.

### 5. Product Owner Decides

Only Product Owner may decide:

```text
Ready / Not Ready / Ship / Hold
```

## Handoff Storage

Use:

- `docs/handoffs/HANDOFF_TEMPLATE.md`
- `docs/handoffs/inbox/`
- `docs/handoffs/outbox/`
- `docs/handoffs/archive/`

Do not paste long chat logs into handoffs. Link source documents and summarize only necessary context.

Formal handoff documents are not mandatory for routine work. Create one only when:

- another Codex session needs bounded instructions;
- scope/permission boundaries are easy to misunderstand;
- release gate evidence must be preserved;
- a blocker or waiver needs durable tracking;
- Product Owner explicitly asks for it.

## Source Of Truth

Authority order remains defined by `AGENTS.md`.

For role-specific boundaries:

- `docs/agents/ProductProjectMg.md`
- `docs/agents/BuildTest.md`
- `docs/agents/ReleaseMg.md`
