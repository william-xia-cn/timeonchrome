# PROJECT_WORKFLOW

## 一条架构集成主线与四条开发旁路（D-109，2026-09-29修订；目录收敛过渡中）

本节覆盖下文旧的“每阶段独立角色交接/再次请求发布决定”默认流程；职责隔离和专项安全要求不取消。

| 长期工作线 | 固定分支 | 职责与合入 |
|---|---|---|
| 架构与集成 | master | 架构决策、共享接口/契约代码、兼容性裁决及集成；职责内相关测试通过后可直接提交，不自动部署 |
| 控件 | codex/extension-local | Chrome扩展本地功能、页面、测试及候选包；PR合回主线 |
| TaskMg | codex/task-management-v1 | Task模块；PR合回主线，当前默认关闭、不发布 |
| SantaMg | codex/santa-management | Santa专项；PR合回主线；现有主目录混合草稿分离前不得宣称切换完成 |
| 标准云端 | codex/cloud-management | Guardian、主控制台、Runtime Worker与独立管理页；PR合回主线 |

目标为五个常用目录，一条工作线复用一个目录；当前仍在过渡，不能把目标冒称现状。旧验收/运行依赖目录暂留登记，不再接新开发。不按修复、测试、提交、发布新建分支或worktree；不创建develop/stg作为额外集成层。旁路合并后，工作区干净才以非强制方式同步主线；有未提交内容先保留，不stash/reset覆盖。长期分支合并时不自动删除。TimeWhereNative独立管理，不计入五条。

目录约定见D-110：`D:\Codex\TimeOnchrome`为主检出，长期旁路目标为同级`D:\Codex\TimeOnchrome-worktrees\<工作线>`，不在主仓内部嵌套工作树。当前实际位置以`git worktree list`为准，路径目标不授权移动运行中的扩展候选、Task脏树或Santa混合草稿。迁移顺序为：先确认所属会话与Git差异、运行/ignored依赖和恢复证据；再建立固定分支及新工作树；由所属会话移植其独有工作；最后切换运行引用并复验。旧目录只有确认不再被引用且另行批准清理时才退出。

Product/Build/Release是同一任务依次完成的阶段，不默认要求新增会话、目录或形式化报告。模块所有权以D-109修订D-105：架构会话在master职责内可直接提交，控件、标准云端、Task、Santa均从固定旁路经PR合入，不得替对端改代码。架构主线提交须声明architecture-integration及允许路径，提交前执行范围与最小相关测试；共享根文档只改本任务部分，不顺带提交其他工作线草稿。

路径检查使用`architecture-integration`标识共享契约与治理、`extension-local`标识控件、`standard-cloud`标识通用云端、`task-local`标识Task独占模块、`santa-specialist`标识Santa专属路径。共享扩展核心和通用云端入口仍由原所有者负责，不能因Task/Santa分支名自动取得跨模块写入权。跨线共享入口由架构定契约并拆分所属实现，不能仅靠职责例外转移所有权。纯Markdown文档改动应只路由轻量CI；workflow、脚本、依赖与产品代码仍按实际影响路由。

只保留三类检查：①变更：路径、最小相关测试、diff；②风险：触及账本/权限/隐私/数据库时的专项；③发布：可信主线来源、已有通过证据、指定资源部署与smoke。已明确“修复并部署”即覆盖本范围内连续执行和可由执行者完成的production审核，不逐步骤再问；新范围、破坏性操作、新产品语义或平台仅能由用户完成的动作才升级。保留production环境保护，不自动给执行者新增权限。

CI按实际diff运行；纯文档不触发产品测试。发布使用精确master SHA，但测试证据可来自其祖先：只有该资源代码、依赖、构建/测试配置均未变时复用，并记录证据SHA；任一变化即使用新证据。不因文档收口机械重跑产品测试。

迁移按依赖而非“还有文件未执行”判断：默认待迁移阻止依赖该结构的功能。发布者核对具体功能路径与现有schema，对本次不依赖的每个待迁移文件记录兼容依据（相关测试/代码与未启用功能边界），可提出延期；这是可审计判断，不伪称CI能自动证明SQL语义。生产workflow尚保留旧门禁，本轮不改变其执行行为；具体延期机制须另行审查，不得凭本段文字绕过现有门禁。真正执行migration仍须任务明确授权，不随修复附带执行。

清理只列精确分支/目录、HEAD、祖先关系、未提交/忽略文件、运行依赖和恢复方式。已合并不等于可删除；不搬走原扩展候选、隔离Profile或唯一证据。集中批准清单后才清理，不逐项重复询问；本轮仅准备清单。

## 项目开发契约：架构集成 / 控件 / 标准云端 / Task / Santa / Native（D-105、D-109）

2026-09-29 PO以D-109修订D-105：当前架构会话负责`master`上的全局架构、接口契约及集成；控件会话只负责终端Chrome扩展；标准云端旁路负责Guardian、主控制台与Runtime云端。Task、Santa各自负责专属终端与云端模块。不因仓库、分支或工作树共用而交叉接管。

模块归属与 Product / Build / Release 阶段职责同时适用；不扩大发布权限。

| 职责档案 | 所属任务 | 可修改范围 |
|---|---|---|
| architecture-integration | 当前架构会话 | 全局架构、共享接口/契约、兼容测试、治理及主线集成；不承担日常云端产品实现 |
| standard-cloud | 标准云端工作线 | Guardian Worker、主家长控制台、Runtime Worker/独立管理页及云端配置与数据实现 |
| extension-local | TimeOnchrome 访问管理策略 | extension 本地实现、统计、配额、UI、Host 客户端、扩展打包 |
| task-local | Task-management | Task专属终端与云端模块；默认关闭，不发布 |
| santa-specialist | TimeOnchrome SantaMg | Santa专属终端适配、云端模块和管理页 |
| native-local | Native Host 开发 | TimeWhereNative 的 Host/Service/Agent/Manager/本机统计/安装器、固定契约包消费 |
| release | releaseMg | 发布证据与既有授权发布流程，不修产品代码 |

架构任务维护共享契约与治理，不接管workers/、pages/及Runtime backend/console的日常实现；这些通用云端代码由标准云端线负责。Santa专项（native-app-control/、pages/native-apps/、既有Santa身份桥）及Task专属模块分别由所属工作线维护。扩展任务负责extension/、其终端测试/打包和原dist候选目录。Native本机仍由独立仓所属任务负责。架构任务可以只读取证，再交给对应工作线修复，不能因为补丁很小越界。Native Host只做framing/转发；网页和应用分别保持统计权威。

终端设置/使用分析等扩展页面属于控件线；家长云端页面属于标准云端线，Santa/Task专属页面由其专项线负责。控件可按既定契约修客户端适配，但不能单方改服务端协议。云端可按既定契约独立修复，不能以兼容为由修改终端候选。跨端需求由架构主线确定接口、兼容范围和上线顺序，再由各所有者实现。所有权不等于自动修改生产数据、部署、发布扩展或安装终端的授权；仍逐任务确定范围和发布门禁。

普通单模块修复由所属任务直接处理。消息字段、能力协商、错误码、版本、权威、隐私或兼容行为变化，先由架构任务确定契约语义、失败行为、兼容范围、最小测试及上线依赖，再向两端发送包含版本、允许路径、验收与禁止事项的精简任务。契约只在 TimeOnChrome 定义；Native 锁定版本及哈希，不引用其他仓库源码。两端返回提交/PR、测试和实机证据，架构任务核对兼容状态。不得以等价实现自行改变契约。网页落账、安全和生产专项批准继续有效。

每项任务在任务板或PR声明职责档案、允许路径、最小测试；公共锁文件/CI等例外必须逐文件说明原因，不接受根目录白名单。提交前运行`tools/check-task-scope.js`检查本任务diff。旁路PR描述使用`Task-Role: standard-cloud`、`extension-local`、`task-local`或`santa-specialist`；架构主线直提使用`architecture-integration`声明并检查diff。例外使用`Scope-Exception: 精确路径 | 原因`，跨职责路径不能靠例外放行，须拆分交接。CI只证明声明与路径匹配，不能证明哪个聊天窗口编写代码，不使用CODEOWNERS伪造同账号独立审批。发现越界停止提交并转交，不自动回滚他人修改。D-109治理修订在云端旁路过渡时可用`architecture-integration`的PR合入一次，不据此改变后续master直提规则。

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
