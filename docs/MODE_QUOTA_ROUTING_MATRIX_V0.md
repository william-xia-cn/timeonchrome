# TimeOnChrome V0 Mode / Quota Routing Matrix

## 1) Purpose
This document is the canonical V0 source of truth for routing behavior across:
- current mode
- target site type
- quota state
- same-day temporary Composite allowance state

It defines:
- route target (allow / reminder / block)
- reminder or in-page notice selection
- allowed actions
- forbidden actions
- copy templates for quota/reminder cases

## 2) Document Boundaries
- `docs/SITE_ACCESS_POLICY.md`: site category and list policy.
- `docs/MODE_QUOTA_ROUTING_MATRIX_V0.md` (this file): routing and quota behavior matrix.
- `docs/MODE_TRANSITION_UX_V0.md`: visual structure, interaction style, layout constraints.
- `DECISIONS.md`: high-level decisions only (not full matrix rows).

## 3) Terms
- Modes: `Study` / `Composite` / `Rest`
- Site types: `Study` / `Composite` / `Unclassified` / `Restricted Entertainment` / `HardBlocked or Unsafe`
- Quota states:
  - Composite available
  - Composite exhausted
  - Rest available
  - Rest exhausted
  - Composite + Rest both exhausted
- Same-day temporary Composite allowance:
  - keyed by `domain + local date`
  - non-permanent
  - not import/export visible

## 4) Core Product Rules (V0)
1. Composite quota and Rest quota are independent pools.
2. Composite exhausted must not auto-consume Rest quota.
3. Composite borrowing is not supported.
4. If Composite exhausted and Rest available, user may explicitly choose `进入休息继续`.
5. If Composite and Rest both exhausted, user cannot continue and should return.
6. Restricted Entertainment cannot apply for Composite time.
7. Restricted Entertainment may borrow Rest time when Rest quota is exhausted.
8. Unclassified may apply same-day Composite time.
9. Unclassified may borrow Rest time when Rest quota is exhausted.
10. Temporary Composite allowance:
   - same-day only (`domain + local date`)
   - does not mutate `compositeList` / `customCompositeList`
   - not counted as Study time
   - not exposed in import/export
11. Popup exposes neither borrow entry nor Composite application entry.
12. HardBlocked / Unsafe allow neither borrow nor Composite application.

## 5) Routing Matrix (Canonical)

| # | Current Mode | Target Site Type | Quota/State | Route | Primary Feedback | Allowed Actions | Forbidden | UX Ref |
|---|---|---|---|---|---|---|---|---|
| 1 | Study | Study | N/A | allow | none | continue | N/A | — |
| 2 | Study | Composite | Composite available | auto switch to Composite | 45s in-page notice | continue in Composite | N/A | §8.1 |
| 3 | Study | Composite | Composite exhausted + Rest available | reminder (`quota_composite`) | Composite exhausted case A | `进入休息继续` / `返回` | auto Rest fallback, Composite borrow | §12.1 Case A |
| 4 | Study | Composite | Composite exhausted + Rest exhausted | reminder (`quota_composite_and_rest`) | Composite exhausted case B | `返回` | `进入休息继续`, Composite borrow, auto Rest | §12.1 Case B |
| 5 | Study | Unclassified | Rest available | reminder (`study_mode`) | Unclassified dual-path copy | enter_rest (slide), apply_composite (slide), `返回学习` | N/A | §8.2b |
| 6 | Study | Unclassified | Rest exhausted | reminder (`study_mode` + `restLocked=1`) | Unclassified + borrow-rest copy | borrow_rest (slide), apply_composite (slide), `返回学习` | hide Composite apply | §8.2b + §6.5 |
| 7 | Study | Restricted Entertainment | Rest available | reminder (`to_rest_slide_confirm`) | Restricted copy | enter_rest (slide), `返回学习` | Composite apply | §8.6 |
| 8 | Study | Restricted Entertainment | Rest exhausted | reminder (`to_rest_slide_confirm` + `restLocked=1`) | Restricted + borrow-rest copy | borrow_rest (slide), `返回学习` | Composite apply | §8.6 + §6.7 |
| 9 | Study | HardBlocked / Unsafe | N/A | blocked reminder | block copy | return | borrow/apply/temporary allow | §8.7 |
| 10 | Composite | Study | N/A | auto switch to Study (90s gate) | pending/success | continue | N/A | §8.3 |
| 11 | Composite | Composite | Composite available | allow | none | continue in Composite | N/A | — |
| 12 | Composite | Composite | Composite exhausted + Rest available | reminder (`quota_composite`) | Composite exhausted case A | `进入休息继续`, `返回` | auto Rest, Composite borrow | §12.1 Case A |
| 13 | Composite | Composite | Composite exhausted + Rest exhausted | reminder (`quota_composite_and_rest`) | Composite exhausted case B | `返回` | `进入休息继续`, Composite borrow, auto Rest | §12.1 Case B |
| 14 | Composite | Unclassified | Rest available | reminder (`to_rest_confirm`) | Unclassified dual-path copy | enter_rest (slide), apply_composite (slide), `返回` | N/A | §8.5 |
| 15 | Composite | Unclassified | Rest exhausted | reminder (`to_rest_confirm` + `restLocked=1`) | Unclassified + borrow-rest copy | borrow_rest (slide), apply_composite (slide), `返回` | hide Composite apply | §8.5 + §6.5 |
| 16 | Composite | Restricted Entertainment | Rest available | reminder (`to_rest_confirm`) | Restricted copy | enter_rest (slide), `返回` | Composite apply | §8.5 |
| 17 | Composite | Restricted Entertainment | Rest exhausted | reminder (`to_rest_confirm` + `restLocked=1`) | Restricted + borrow-rest copy | borrow_rest (slide), `返回` | Composite apply | §8.5 + §6.7 |
| 18 | Composite | HardBlocked / Unsafe | N/A | blocked reminder | block copy | return | borrow/apply/temporary allow | §8.7 |
| 19 | Rest | Study | N/A | auto switch to Study (90s gate) | pending/success | continue | N/A | §8.4 |
| 20 | Rest | Composite | Composite available | pending gate (60s), then Composite | pending/success banner | continue | immediate forced switch | §8.2 |
| 21 | Rest | Composite | Composite exhausted + Rest available | reminder (`quota_composite`) | Composite exhausted case A | `进入休息继续`, `返回` | auto Rest, Composite borrow | §12.1 Case A |
| 22 | Rest | Composite | Composite exhausted + Rest exhausted | reminder (`quota_composite_and_rest`) | Composite exhausted case B | `返回` | `进入休息继续`, Composite borrow, auto Rest | §12.1 Case B |
| 23 | Rest | Unclassified | Rest available | allow (stays Rest, no reminder) | normal Rest path | continue | auto Composite, Composite apply prompt | — |
| 24 | Rest | Restricted Entertainment | Rest available | allow (stays Rest) or existing reminder policy | normal Rest path | continue | Composite apply | — |
| 25 | Rest | Restricted Entertainment | Rest exhausted | reminder (`to_rest_slide_confirm` + `restLocked=1`) | Restricted + borrow-rest copy | borrow_rest (slide), `返回` | Composite apply | §6.7 |
| 26 | Rest | HardBlocked / Unsafe | N/A | blocked reminder | block copy | return | borrow/apply/temporary allow | §8.7 |
| 27 | Any | Temporary Composite allowance domain | Composite available | treat as Composite usage | Composite path feedback | continue in Composite | count as Study, permanent classify | — |
| 28 | Any | Temporary Composite allowance domain | Composite exhausted + Rest available | unified Composite exhausted case A | reminder (`quota_composite`) | `进入休息继续`, `返回` | Composite borrow, auto Rest | §12.1 Case A |
| 29 | Any | Temporary Composite allowance domain | Composite exhausted + Rest exhausted | unified Composite exhausted case B | reminder (`quota_composite_and_rest`) | `返回` | `进入休息继续`, Composite borrow, auto Rest | §12.1 Case B |

## 6) Reminder / In-Page Notice Copy Matrix (Canonical)

### 6.1 Study -> Composite (Composite available)
In-page lightweight notice (45s):

`你正在打开综合网站 · 即将离开学习时间进入综合时间 · 今日剩余 {remainingCompositeTime}`

No countdown, no blocking page.

### 6.2 Composite exhausted + Rest available (Unified)
Title:

`今日综合时间已用完`

Body:
- `综合时间不会自动占用休息时间。`
- `如果仍要继续访问，可以进入休息时间继续。`

Actions:
- `进入休息继续`
- `返回`

### 6.3 Composite exhausted + Rest exhausted (Unified)
Title:

`今日综合时间和休息时间均已用完`

Body:

`当前不能继续访问。请返回。`

Actions:
- `返回`

### 6.4 Unclassified (dual-path)

Applies to Matrix Case #5 (Study→Unclassified) and Case #14 (Composite→Unclassified).

**Title** (shared by both paths):

`你正在打开未归类网站`

**Default path** (enter Rest):

Body:
- `继续后，这段时间会计入「休息时间」，不会计入「学习时间」。`

Slider:
- `拖动到右侧确认进入休息时间`
- `松手确认进入休息时间`

**Application path** (apply Composite time):

Body:
- `如果你认为这个网站是为了学习用途使用，可以申请使用今天的综合时间继续访问。`
- `本次申请不会计入学习时间，也不会永久修改网站分类。`
- `系统未来可能会根据实际用途进一步自动判定。`

Slider:
- `拖动到右侧申请使用综合时间`
- `松手确认使用综合时间`

Success:
- `已允许今天使用综合时间访问 · 今日剩余 {remainingCompositeTime}`

**Return action**:
- Study origin: `返回学习`
- Composite origin: `返回`

Full visual layout and interaction details: see `docs/MODE_TRANSITION_UX_V0.md` §8.2b (Study origin) and §8.5 (Composite origin).

### 6.5 Unclassified + Rest exhausted
Rest borrow section:

`今天的休息时间已用完。继续休息使用需要向明天借用休息时间。`

Borrow slider:

`滑动向明天借用休息时间`

Important:
- Unclassified still keeps Composite application path.
- Must not show: `该网站不能申请使用综合时间。`

### 6.6 Restricted Entertainment
Title:

`你正在打开受限娱乐网站`

Restricted rule:

`该网站不能申请使用综合时间。`

### 6.7 Restricted Entertainment + Rest exhausted
Copy:
- `今天的休息时间已用完。`
- `如果仍要继续访问，可以向明天借用休息时间。`

Must not show Composite application slider.

### 6.8 HardBlocked / Unsafe
Only block/return path.
No borrow, no Composite application, no temporary allow.
In V0 runtime, `HardBlocked / Unsafe` are product-level terms for the same hard-blocking overlay; implementation may express this overlay through `unsafeList` / `blacklist` matching, without creating a separate borrow/application path.

## 7) Rest Borrow Execution Flow (V0)

### 7.1 Trigger conditions
Rest borrow may appear only when all conditions hold:
- Rest quota is exhausted or insufficient for the current rest-use path.
- Target site is eligible for Rest use in the current flow.
- Site is not `HardBlocked / Unsafe`.
- Entry is shown in a contextual Reminder page, not popup.

Eligible examples:
- Unclassified site on rest-use path with Rest quota exhausted.
- Restricted Entertainment site with Rest quota exhausted.

Not eligible:
- Study site.
- Composite site as Composite usage.
- HardBlocked / Unsafe.
- Composite quota exhaustion as Composite borrowing.

### 7.2 UI / interaction
Borrow is an explicit user action.

Unclassified rest-exhausted rest-use copy:
- `今天的休息时间已用完。继续休息使用需要向明天借用休息时间。`

Restricted Entertainment rest-exhausted copy:
- `今天的休息时间已用完。`
- `如果仍要继续访问，可以向明天借用休息时间。`

Borrow slider copy:
- `滑动向明天借用休息时间`

Clarifications:
- Borrow must not be a silent fallback.
- Borrow must not happen from popup.
- Borrow must not be confused with `申请使用综合时间`.

### 7.3 Message / action
Borrow uses existing action:
- `BORROW_REST_QUOTA`

Source is limited to contextual Reminder pages (runtime sender restriction), not popup.

### 7.4 Success behavior
On successful borrow:
- Rest quota becomes available according to the existing borrow policy.
- User may continue by entering Rest.
- Subsequent time counts as Rest time.
- No Composite allowance is created.
- Site classification is not modified.

### 7.5 Failure behavior
On failed borrow:
- Stay on Reminder and show failure feedback.
- Do not enter Rest automatically.
- Do not create Composite allowance.
- Do not modify site classification.

### 7.6 Quota accounting
- Borrow affects Rest quota only.
- Composite quota does not support borrowing.
- Borrowed Rest time is not Composite time.
- Borrowed Rest time is not Study time.
- Current implementation includes next-day deduction/repayment behavior via existing `quotaBorrow` accounting in runtime code; the exact algorithm remains implementation detail and can be clarified further in V1 audit docs if needed.

### 7.7 Forbidden actions
- No `BORROW_COMPOSITE_QUOTA`.
- No borrowing for `HardBlocked / Unsafe`.
- No borrow entry in popup.
- No automatic Rest fallback when Composite quota is exhausted.
- No conversion from Restricted Entertainment to Composite.

## 8) Forbidden Actions (V0)
- Composite exhausted -> automatic Rest fallback.
- Composite exhausted -> any Composite borrowing UI/action.
- Restricted Entertainment -> Composite application UI/action.
- HardBlocked / Unsafe -> borrow/apply/temporary allow.
- Popup -> borrow/application entry.
- Temporary Composite allowance -> permanent list mutation.

## 8.1 Return Semantics (Resolved V0)
- `返回学习`:
  - used for Study-origin reminder pages (`Study -> Rest`, `Study -> Unclassified`, `Study -> Restricted Entertainment`).
  - behavior: cancel current access, return to Study context where possible.
  - must not switch to Rest, must not create Composite allowance.
- `返回`:
  - used for Composite-origin reminder pages and blocked/quota pages.
  - behavior: cancel reminder, no mode switch, no quota consumption, no temporary allowance.
  - close reminder tab preferred; fallback to history/back/safe page if needed.
- Quota exhausted return:
  - return means do not continue current access.
  - no automatic Rest fallback, no borrow, no Composite application.
  - continuation requires explicit user action.

## 9) Implementation Anchors
- `product/interceptor.js`
- `reminder.js`
- `message-router.js`
- `infra/storage.js`
- `background.js`
- `content.js`

## 10) Test Anchors
- `tests/unit/interceptor-mode-transition-v0.test.js`
- `tests/unit/reminder-transition-v0.test.js`
- `tests/unit/message-router-mode-switch-reeval.test.js`
- `tests/unit/badge-and-popup-mode-v0.test.js`
- `tests/unit/background-logic.test.js`

## 11) Resolved PO Decisions and Remaining Items
Resolved in V0:
1. Rest -> Unclassified:
   - continues as Rest without reminder while Rest quota is available.
   - counts as Rest time.
   - does not auto-become Composite and does not auto-trigger Composite application.
   - if Rest quota is exhausted, route to Rest exhausted/borrow flow.
2. Return semantics:
   - `返回学习` for Study-origin reminder pages.
   - `返回` for Composite-origin reminder pages and blocked/quota pages.
3. Config example location:
   - use `docs/site-access-config.example.json` as the single sample location.

Remaining V1 refinement items:
1. Borrow confirmation copy and amount presentation style (target vs actual borrowed amount) in all reminder variants.
2. Rest borrow mechanism refinements (amount policy, repayment explainability, limits, parent controls, and audit/failure visibility).
