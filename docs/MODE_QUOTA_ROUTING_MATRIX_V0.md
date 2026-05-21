# TimeOnChrome V0 Mode Transition / Quota Routing Matrix

## 1) Purpose
This document is the single canonical V0 source of truth for mode transition, quota routing, Reminder behavior, in-page notices, and mode-boundary accounting semantics across:
- current mode
- target site type
- quota state
- Pending Composite classification state

It defines:
- route target (`allow`, `reminder`, `block`)
- reminder or in-page notice selection
- allowed actions
- forbidden actions
- copy templates for quota/reminder cases
- mode-transition prompt lifecycle
- mode-boundary ledger slicing expectations

## 2) Document Boundaries
- `docs/SITE_ACCESS_POLICY.md`: site category and list policy.
- `docs/MODE_QUOTA_ROUTING_MATRIX_V0.md` (this file): the only active product source of truth for mode transition, quota routing, Reminder, in-page notice, and mode-boundary behavior.
- `docs/MODE_TRANSITION_UX_V0.md`: retired. Do not cite it as a source of truth and do not add new requirements there.
- `DECISIONS.md`: high-level decisions only (not full matrix rows).

## 3) Bilingual Terminology

Use the English term in this document body. Chinese is listed here only as product copy/reference.

| English term | 中文产品名 | Implementation value / source |
|---|---|---|
| Study | 学习模式 / 学习时间 | mode `study` |
| Composite | 综合模式 / 综合时间 | mode `composite` |
| Rest | 休息模式 / 休息时间 | mode `rest` |
| Locked | 锁定模式 / 当前不可继续使用 | mode `locked` |
| Study Site | 学习网站 | classification `study` |
| Composite Site | 综合网站 | classification `composite` |
| Pending Composite | 已申请待归类 | classification `pending_composite` |
| Unclassified | 未归类网站 | no resolved classification |
| Restricted Entertainment | 受限娱乐网站 | classification `restricted` |
| HardBlocked / Unsafe | 禁止访问 / 不安全网站 | classification `blocked`, `unsafeList`, `blacklist` |

## 4) Terms
- Modes: `Study` / `Composite` / `Rest` / `Locked`
- Access targets:
  - `Study Site`
  - `Composite Site / Pending Composite`
  - `Unclassified`
  - `Restricted Entertainment`
  - `HardBlocked / Unsafe`
- Quota states:
  - Composite available
  - Composite exhausted
  - Rest available
  - Rest exhausted
  - Composite + Rest both exhausted
- Pending Composite:
  - implementation value: `pending_composite`
  - routing behavior: same as Composite Site
  - not treated as Study time
  - does not permanently mutate `compositeList` / `customCompositeList`
- `unknown` is not a product mode. It is allowed only as a ledger fallback when an accounting segment cannot recover a runtime mode.

## 5) Core Product Rules (V0)
1. Access control decides whether a mode transition can execute.
2. Mode transition changes only `Study` / `Composite` / `Rest` / `Locked`.
3. Composite quota and Rest quota are independent pools.
4. Composite exhausted must not borrow or extend Composite quota.
5. If Composite exhausted and Rest is available, access to Composite Site / Pending Composite defaults to Rest with an in-page notice.
6. If Composite and Rest are both exhausted, user cannot continue and should return.
7. `Composite Site` and `Pending Composite` share the same routing path.
8. Current Reminder pages for `Unclassified` and `Restricted Entertainment` provide Rest confirmation / return; website classification requests live in popup/site-governance flow, not in mode transition.
9. HardBlocked / Unsafe allow no mode transition.
10. `mode-service.js` is the only mode owner. It reads `guardian_session.currentMode`, commits `currentModeStartedAtMs`, maintains `restExitGraceUntilMs`, and emits mode-boundary intents.
11. Rest-origin auto transitions are immediate. `Rest -> Study/Composite` starts a 60s Rest Exit Grace window: Rest targets return to Rest without Reminder and show an in-page notice.
12. Study <-> Composite transitions do not extend Rest Exit Grace. Missing or expired `restExitGraceUntilMs` is treated as no grace.
13. Local quota expiry is a mode-transition event. The local `quota_check` alarm evaluates quota state and requests a mode change through Mode Service.
14. Cloud quota sync only saves `quotaState` facts. It must not request mode changes, show Reminder, or recheck tabs.

## 6) Access Control + Mode Transition Matrix (Canonical)

Matrix vocabulary:
- `allow`: access is allowed now; mode may stay unchanged or switch immediately.
- `reminder`: user action is required before any target mode transition.
- `blocked reminder`: Reminder page with no continue path; return only.
- `block`: direct hard block; no mode transition.
- `Rest Exit Grace active`: `now < restExitGraceUntilMs`, set only by `Rest -> Study/Composite`.
- `Rest Exit Grace expired`: `restExitGraceUntilMs` is missing or no longer in the future.

### 6.1 Study mode

| Current Mode | Access target | Precondition | Access decision | Target mode | Execution |
|---|---|---|---|---|---|
| Study | Study Site | N/A | allow | Study | no-op |
| Study | Composite Site /<br>Pending Composite | Composite quota available | allow | Composite | [notice: study_to_composite](#notice-study-to-composite) |
| Study | Composite Site /<br>Pending Composite | Composite exhausted + Rest available | allow | Rest | [notice: composite_exhausted_to_rest](#notice-composite-exhausted-to-rest) |
| Study | Composite Site /<br>Pending Composite | Composite exhausted + Rest exhausted | blocked reminder | none | [blocked reminder: quota_composite_and_rest](#reminder-quota-composite-and-rest) |
| Study | Unclassified /<br>Restricted Entertainment | Rest available + Rest Exit Grace active | allow | Rest | [notice: mode_grace_to_rest](#notice-mode-grace-to-rest) |
| Study | Unclassified /<br>Restricted Entertainment | Rest available + Rest Exit Grace expired | reminder | none | [reminder: rest_confirm](#reminder-rest-confirm) |
| Study | Unclassified /<br>Restricted Entertainment | Rest exhausted | blocked reminder | none | [blocked reminder: rest_locked](#reminder-rest-locked) |
| Study | HardBlocked / Unsafe | N/A | block | none | [block: hard_blocked](#block-hard-blocked) |

### 6.2 Composite mode

| Current Mode | Access target | Precondition | Access decision | Target mode | Execution |
|---|---|---|---|---|---|
| Composite | Study Site | N/A | allow | Study | [notice: composite_to_study](#notice-composite-to-study) |
| Composite | Composite Site /<br>Pending Composite | Composite quota available | allow | Composite | no-op |
| Composite | Composite Site /<br>Pending Composite | Composite exhausted + Rest available | allow | Rest | [notice: composite_exhausted_to_rest](#notice-composite-exhausted-to-rest) |
| Composite | Composite Site /<br>Pending Composite | Composite exhausted + Rest exhausted | blocked reminder | none | [blocked reminder: quota_composite_and_rest](#reminder-quota-composite-and-rest) |
| Composite | Unclassified /<br>Restricted Entertainment | Rest available + Rest Exit Grace active | allow | Rest | [notice: mode_grace_to_rest](#notice-mode-grace-to-rest) |
| Composite | Unclassified /<br>Restricted Entertainment | Rest available + Rest Exit Grace expired | reminder | none | [reminder: rest_confirm](#reminder-rest-confirm) |
| Composite | Unclassified /<br>Restricted Entertainment | Rest exhausted | blocked reminder | none | [blocked reminder: rest_locked](#reminder-rest-locked) |
| Composite | HardBlocked / Unsafe | N/A | block | none | [block: hard_blocked](#block-hard-blocked) |

### 6.3 Rest mode

| Current Mode | Access target | Precondition | Access decision | Target mode | Execution |
|---|---|---|---|---|---|
| Rest | Study Site | foreground access | allow | Study | [notice: rest_to_study_success](#notice-rest-to-study-success) |
| Rest | Composite Site /<br>Pending Composite | Composite quota available + foreground access | allow | Composite | [notice: rest_to_composite_success](#notice-rest-to-composite-success) |
| Rest | Composite Site /<br>Pending Composite | Composite exhausted + Rest available | allow | Rest | [notice: composite_exhausted_to_rest](#notice-composite-exhausted-to-rest) |
| Rest | Composite Site /<br>Pending Composite | Composite exhausted + Rest exhausted | blocked reminder | none | [blocked reminder: quota_composite_and_rest](#reminder-quota-composite-and-rest) |
| Rest | Unclassified /<br>Restricted Entertainment | Rest available | allow | Rest | no-op |
| Rest | Unclassified /<br>Restricted Entertainment | Rest exhausted | blocked reminder | none | [blocked reminder: rest_locked](#reminder-rest-locked) |
| Rest | HardBlocked / Unsafe | N/A | block | none | [block: hard_blocked](#block-hard-blocked) |

### 6.4 Locked mode

| Current Mode | Access target | Precondition | Access decision | Target mode | Execution |
|---|---|---|---|---|---|
| Locked | Any normal target | current mode remains Locked | blocked reminder | Locked | [blocked reminder: quota_locked](#reminder-quota-locked) |
| Locked | HardBlocked / Unsafe | N/A | block | none | [block: hard_blocked](#block-hard-blocked) |

### 6.5 System quota transition events

Local quota expiry is a mode transition source, but it enters through the same request path as manual and access-driven transitions.

| Source | Message path | Precondition | Target mode | Follow-up |
|---|---|---|---|---|
| `quota_check` alarm | `EVALUATE_QUOTA_STATE -> handleModeEvent` | `onlineLocked === true` | Locked | recheck current focused active tab only |
| `quota_check` alarm | `EVALUATE_QUOTA_STATE -> handleModeEvent` | current Study + `studyLocked === true` | Locked | recheck current focused active tab only |
| `quota_check` alarm | `EVALUATE_QUOTA_STATE -> handleModeEvent` | current Rest + `restLocked === true` + Study available | Study | recheck current focused active tab only |
| `quota_check` alarm | `EVALUATE_QUOTA_STATE -> handleModeEvent` | current Rest + `restLocked === true` + `studyLocked === true` | Locked | recheck current focused active tab only |
| `quota_check` alarm | `EVALUATE_QUOTA_STATE -> handleModeEvent` | current Composite + `undeterminedLocked === true` + Study available | Study | recheck current focused active tab only |
| `quota_check` alarm | `EVALUATE_QUOTA_STATE -> handleModeEvent` | current Composite + `undeterminedLocked === true` + `studyLocked === true` | Locked | recheck current focused active tab only |
| `daily_cleanup` | `EVALUATE_QUOTA_STATE -> handleModeEvent` | current Locked + reset cleared online/study locks | Study | recheck current focused active tab only |
| cloud quota pull | save `config.quotaState` only | any cloud quota fact changed | no mode change | no Reminder, no tab recheck |

## 7) Execution Definitions

### 7.1 Notice Definitions

<a id="notice-study-to-composite"></a>
#### notice: study_to_composite
- Trigger: Study mode + Composite Site / Pending Composite + Composite quota available.
- Behavior: switch to Composite immediately.
- Notice: 4s transient info notice.
- Copy:

`你正在打开综合/待归类网站 · 即将进入综合模式 · 今日剩余 {remainingCompositeTime}`

<a id="notice-composite-exhausted-to-rest"></a>
#### notice: composite_exhausted_to_rest
- Trigger: Composite Site / Pending Composite + Composite quota exhausted + Rest available.
- Behavior: enter or remain in Rest immediately.
- Notice: 4s transient info notice.
- Copy:

`你正在打开综合/待归类网站 · 当前综合时间配额已用完 · 已默认进入休息模式 · 今日休息剩余 {remainingRestTime}`

<a id="notice-composite-to-study"></a>
#### notice: composite_to_study
- Trigger: Composite mode + Study Site.
- Behavior: switch to Study immediately.
- Notice: 4s transient success notice.
- Copy: `你正在打开学习网站 · 即将进入学习模式 · 今日剩余 {remainingStudyTime}`

<a id="notice-rest-to-composite-success"></a>
#### notice: rest_to_composite_success
- Trigger: Rest mode + Composite Site / Pending Composite + Composite quota available + foreground access.
- Behavior: switch to Composite immediately; set `currentModeStartedAtMs`; start Rest Exit Grace.
- Notice: 4s transient success notice.
- Copy:

`你正在打开综合/待归类网站 · 即将进入综合模式 · 今日剩余 {remainingCompositeTime}`

<a id="notice-rest-to-study-success"></a>
#### notice: rest_to_study_success
- Trigger: Rest mode + Study Site + foreground access.
- Behavior: switch to Study immediately; set `currentModeStartedAtMs`; start Rest Exit Grace.
- Notice: 4s transient success notice.
- Copy: `你正在打开学习网站 · 即将进入学习模式 · 今日剩余 {remainingStudyTime}`

<a id="notice-mode-grace-to-rest"></a>
#### notice: mode_grace_to_rest
- Trigger: Study or Composite mode + Unclassified / Restricted Entertainment + Rest available + Rest Exit Grace active.
- Behavior: switch to Rest immediately without Reminder.
- Notice: 4s transient info notice.
- Copy: `刚进入{fromModeLabel}时间 · 已临时回到休息时间`

<a id="mode-quota-reset-unlock"></a>
#### mode: quota_reset_unlock
- Trigger: daily quota reset clears online/study locks while current mode is Locked.
- Behavior: switch to Study.
- Notice: optional; not required for correctness.
- Copy: `新的一天开始了 · 已回到学习时间`

### 7.2 Rest Exit Grace Definition

- Rest-origin Study/Composite transitions are immediate.
- `mode-service.js` writes `guardian_session.currentModeStartedAtMs` when the mode changes.
- `Rest -> Study/Composite` also writes `guardian_session.restExitGraceUntilMs = effectiveAtMs + 60_000`.
- While `now < restExitGraceUntilMs`, opening Unclassified / Restricted Entertainment returns to Rest without Reminder and shows `notice: mode_grace_to_rest`.
- Study <-> Composite transitions preserve the existing `restExitGraceUntilMs`; they must not extend it.
- Entering Rest, Locked, or Paused clears `restExitGraceUntilMs`.
- When `restExitGraceUntilMs` is missing or expired, Unclassified / Restricted Entertainment uses `reminder: rest_confirm`.
- Same-mode no-op must not refresh `currentModeStartedAtMs` or `restExitGraceUntilMs`.

### 7.3 Reminder Definitions

<a id="reminder-quota-composite-and-rest"></a>
#### reminder: quota_composite_and_rest
- Trigger: Composite quota exhausted + Rest exhausted.
- Page type: blocked quota Reminder.
- Allowed actions: return only.
- Forbidden: Enter Rest and continue; Composite borrowing; automatic fallback.
- Title:

`今日综合时间和休息时间均已用完`

Body:

`当前不能继续访问。请返回。`

Actions:
- `返回`

<a id="reminder-rest-confirm"></a>
#### reminder: rest_confirm
- Trigger: Unclassified / Restricted Entertainment while Rest is available and current mode is Study or Composite.
- Page type: contextual Reminder.
- Allowed actions: confirm Rest; return.
- Website classification requests are handled outside this Reminder flow.

Title:

- Unclassified: `你正在打开未归类网站`
- Restricted Entertainment: `你正在打开受限娱乐网站`

Body copy:

- `继续后，这段时间会计入「休息时间」，不会计入「学习时间」。`

Slider:
- `拖动到右侧确认进入休息时间`
- `松手确认进入休息时间`

Return action:
- Study origin: `返回学习`
- Composite origin: `返回`

<a id="reminder-rest-locked"></a>
#### reminder: rest_locked
- Trigger: Unclassified / Restricted Entertainment while Rest is exhausted.
- Page type: blocked contextual Reminder.
- Current V1-minimal Reminder does not expose Rest borrowing or Composite request.
- Allowed actions: return only.
- Forbidden: Enter Rest and continue; Rest borrowing; Composite request.

Classification request note:
- `SUBMIT_SITE_CLASSIFICATION_REQUEST` belongs to popup/site-governance flow.
- A successful or pending request may later make the target resolve as `pending_composite`, which then follows the Composite site routing path.
- This request flow is not a mode-transition action.

Reminder layout and interaction requirements are maintained in this document. Do not split UX requirements back into a second mode-transition document.

<a id="reminder-quota-locked"></a>
#### reminder: quota_locked
- Trigger: current mode is Locked and quota state still prevents normal use.
- Page type: blocked quota Reminder.
- Allowed actions: return only.
- Forbidden: Enter Study, Enter Rest, Enter Composite, borrow, or bypass.
- Title: `当前配额已用完`
- Body: `当前不能继续访问。请返回。`

### 7.4 Block Definitions

<a id="block-hard-blocked"></a>
#### block: hard_blocked
- Trigger: HardBlocked / Unsafe target.
- Behavior: block access; no mode transition.
- Page type: blocked Reminder or equivalent blocking overlay.
- Allowed actions: return only.
- Forbidden: Rest confirmation; Composite request; bypass action.

### 7.5 In-page mode-transition notice protocol
In-page notices are a UI projection of mode transition state. They are not the source of mode truth, and delivery failure must not block mode changes.

Protocol expectations:
- `AUTO_MODE_PENDING_START` is a legacy renderer for retired Rest-origin dwell gates; it is not used by the current routing matrix.
- `AUTO_MODE_PENDING_CANCEL` clears pending or transient notices for the current tab.
- `AUTO_MODE_PENDING_SUCCESS` renders the 4s transient success/info notice.
- `CONTENT_SCRIPT_READY` may replay only an unexpired transient notice whose `domainSnapshot` still matches the current page domain.
- `chrome.tabs.sendMessage` failure is diagnostic only; fallback notification is allowed, but mode truth must remain independent of notice delivery.
- Mode effects must return explicit notice delivery fields: `noticeAttempted`, `noticeTargetTabId`, `noticeSent`, and `noticeError`.

### 7.6 Mode truth and ledger boundary relationship
Mode truth comes from runtime session state, currently `guardian_session.currentMode`. `guardian_session.currentModeStartedAtMs` records when the current mode began. `guardian_session.restExitGraceUntilMs` records the independent Rest Exit Grace deadline. `config.mode` is only a legacy fallback.

All manual and automatic mode transitions enter through `mode-service.js`:
- automatic access routing: Chrome listeners build facts and dispatch `ACCESS_OBSERVED` to `handleModeEvent()`.
- popup/manual/reminder actions: send `REQUEST_MODE_CHANGE` / `REMINDER_CONFIRMED`, then UI may query `GET_RUNTIME_MODE_STATUS`.
- local quota expiry: `quota_check` sends `EVALUATE_QUOTA_STATE` to `handleModeEvent()`.
- legacy `SWITCH_TO_STUDY` / `SWITCH_TO_REST` / `SWITCH_TO_COMPOSITE` messages are compatibility aliases that route into `REQUEST_MODE_CHANGE`.

Reminder pages and in-page notices display or request transitions; they are not accounting facts.

Mode Service returns a complete decision object:
- `access`: `allow` / `reminder` / `block` / `ignore`.
- `modeChange`: the requested mode transition, or `null`.
- `reminder`: Reminder reason and params, or `null`.
- `notice`: in-page notice projection, or `null`.
- `recheckActiveTab`: whether the current focused active tab should be re-evaluated after execution.

The old mixed "check + remind + switch + quota fallback" function is retired. Reminder, notice, PiP cleanup and tab redirect are execution effects of a Mode Service decision, not independent routing logic.

Mode boundary accounting rules:
- Mode switches enqueue a `mode_boundary` intent containing `id`, `boundaryAtMs`, `fromMode`, `toMode`, `reason`, and `source`.
- The mode switch path waits only for the boundary intent to be durably queued; it does not need to wait for foreground/media ledger slicing to finish.
- Foreground and media ledgers consume the same system-level `mode_boundary` signal independently and split only already-open sessions at `boundaryAtMs`.
- Closed ledgers are not opened by mode boundary alone.
- The old segment keeps `fromMode`; the reopened segment uses `toMode`.
- Popup/admin read-before-flush remains a separate legacy path and is not the mode-transition model.

## 8) Forbidden Actions (V0)
- Composite exhausted -> any Composite borrowing UI/action.
- `Unclassified` / `Restricted Entertainment` Reminder -> embedded Composite request action.
- Current Reminder -> embedded Rest borrowing action.
- HardBlocked / Unsafe -> Rest confirmation, Composite request, or bypass action.
- Pending Composite (`pending_composite`) -> permanent list mutation.

## 8.1 Return Semantics (Resolved V0)
- `返回学习`:
  - used for Study-origin reminder pages (`Study -> Rest`, `Study -> Unclassified`, `Study -> Restricted Entertainment`).
  - behavior: cancel current access, return to Study context where possible.
  - must not switch to Rest, must not create Pending Composite.
- `返回`:
  - used for Composite-origin reminder pages and blocked/quota pages.
  - behavior: cancel reminder, no mode switch, no quota consumption, no temporary allowance.
  - close reminder tab preferred; fallback to history/back/safe page if needed.
- Quota exhausted return:
  - return means do not continue current access.
  - no borrow and no embedded Composite request.
  - continuation requires explicit user action.

## 9) Non-Mode-Transition Responsibilities
- `mode_boundary` and foreground/media ledger slicing are downstream accounting responses.
- `SUBMIT_SITE_CLASSIFICATION_REQUEST` is site-governance behavior, not a mode-transition action.
- `AUTO_MODE_PENDING_*` is UI projection, not mode truth.
- Pending Composite (`pending_composite`) changes access target resolution only; it does not add a fourth mode.
- Quota calculation is owned by managed statistics + quota state code; quota expiry orchestration enters through `EVALUATE_QUOTA_STATE`, and any resulting mode change must be committed through Mode Service.
- `quota_check` must not scan all tabs or redirect directly. After a quota-driven mode change, only the current focused active tab is rechecked through `ACCESS_OBSERVED`.
- Cloud quota pull only saves `quotaState`; it is not a mode-transition trigger.

## 10) Implementation Anchors
- `product/mode-service.js`
- `product/mode-effects.js`
- `product/interceptor.js`
- `reminder.js`
- `message-router.js`
- `infra/storage.js`
- `background.js`
- `content.js`

## 11) Test Anchors
- `tests/unit/interceptor-mode-transition-v0.test.js`
- `tests/unit/reminder-transition-v0.test.js`
- `tests/unit/message-router-mode-switch-reeval.test.js`
- `tests/unit/badge-and-popup-mode-v0.test.js`
- `tests/unit/background-logic.test.js`
- `tests/e2e/mode-switch-prompt-lifecycle.test.js`
- `tests/e2e/mode-switch-pip-close.test.js`

## 12) Resolved PO Decisions and Remaining Items
Resolved in V0:
1. Rest -> Unclassified:
   - continues as Rest without reminder while Rest quota is available.
   - counts as Rest time.
   - does not auto-become Composite and does not auto-trigger site classification request.
   - if Rest quota is exhausted, route to current exhausted Reminder flow.
2. Return semantics:
   - `返回学习` for Study-origin reminder pages.
   - `返回` for Composite-origin reminder pages and blocked/quota pages.
3. Config example location:
   - use `docs/site-access-config.example.json` as the single sample location.

Remaining V1 refinement items:
1. If Rest borrowing returns to Reminder, define the entry point, copy, amount policy, repayment explainability, and parent-control behavior.
2. If site-classification request returns to Reminder, define how it differs from popup/site-governance flow and how it maps to Pending Composite (`pending_composite`).
