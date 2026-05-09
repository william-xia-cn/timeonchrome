# PROJECT_WORKFLOW

## Three-Role Codex Workflow

TimeOnChrome uses three separated Codex roles for project work:

1. `Product&Project Mg`
2. `Build&Test`
3. `releaseMg`

The hard collaboration rule is:

```text
Codex sessions do not collaborate through memory. They collaborate only through standardized repo documents and handoff posts.
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

## Workflow

### New Feature Development

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

Required outputs:

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

Build&Test works only from an approved spec and handoff.

Required outputs:

- changed files;
- behavior changes;
- tests run and results;
- known risks;
- scope conformance audit;
- out-of-scope confirmation;
- handoff back to Product&Project Mg or onward to releaseMg.

### 3. Product&Project Mg Reviews

Product&Project Mg reviews implementation conformance only.

Required outputs:

- conformance review;
- scope deviation check;
- decision alignment check;
- documentation alignment check;
- recommendation on whether releaseMg may accept.

### 4. releaseMg Accepts

releaseMg executes release gates and acceptance tests.

Required outputs:

- release gate report;
- acceptance test results;
- failed items;
- blockers;
- release readiness recommendation;
- Product Owner final decision required.

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

## Source Of Truth

Authority order remains defined by `AGENTS.md`.

For role-specific boundaries:

- `docs/agents/ProductProjectMg.md`
- `docs/agents/BuildTest.md`
- `docs/agents/ReleaseMg.md`
