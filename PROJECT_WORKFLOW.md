# PROJECT_WORKFLOW

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
