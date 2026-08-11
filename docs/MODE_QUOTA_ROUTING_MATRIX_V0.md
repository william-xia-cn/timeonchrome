# TimeOnChrome V0 Mode Transition / Quota Routing Matrix

## 1) Purpose
This document is the single canonical V0 source of truth for mode transition, quota routing, Reminder behavior, in-page notices, and mode-boundary accounting semantics across:
- current mode
- target site type
- quota state
- Pending Attribution classification state

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

Use the English term in this document body. Chinese is listed here only as product copy/reference. Since the 2026-07-24 semantic revision, product copy uses 复合模式 for the runtime mode and 待归类时间 for the quota/time pool. Legacy identifiers still use `composite` to avoid code/schema churn.

| English term | 中文产品名 | Implementation value / source |
|---|---|---|
| Study | 学习模式 / 学习时间 | mode `study` |
| Compound / Composite legacy | 复合模式 / 待归类时间 | mode `composite` legacy/internal |
| Rest | 休息模式 / 休息时间 | mode `rest` |
| Locked | 锁定模式 / 当前不可继续使用 | mode `locked` |
| Study Site | 学习网站 | classification `study` |
| Compound Site / Composite legacy | 复合网站 | classification `composite` legacy/internal |
| Pending Attribution / Pending Composite legacy | 未归类网站访问记录 / 学习网站归类申请 | classification `pending_composite` legacy/internal |
| Unclassified | 未归类网站 | no resolved classification |
| Restricted Entertainment | 受限娱乐网站 | classification `restricted` |
| HardBlocked / Unsafe | 禁止访问 / 不安全网站 | classification `blocked`, `unsafeList`, `blacklist` |

## 4) Terms
- Modes: `Study` / `Compound` / `Rest` / `Locked` (implementation value remains `composite`)
- Access targets:
  - `Study Site`
  - `Compound Site / Pending Attribution` (implementation values `composite` / `pending_composite`)
  - `Unclassified` (auto-created Pending Attribution at access time)
  - `Restricted Entertainment`
  - `HardBlocked / Unsafe`
- Quota states:
  - Pending-attribution quota available (legacy Composite available)
  - Pending-attribution quota exhausted (legacy Composite exhausted)
  - Rest available
  - Rest exhausted
  - Pending-attribution + Rest both exhausted
- Pending Attribution / Pending Composite legacy:
  - implementation value: `pending_composite`
  - routing behavior: same as Compound Site
  - not treated as Study time or Rest time until future attribution
  - does not permanently mutate `compositeList` / `customCompositeList`
  - auto source is displayed as “未归类网站访问记录”; manual `requestedClassification: study` is displayed as “学习网站归类申请”
- `unknown` is not a product mode. It is allowed only as a ledger fallback when an accounting segment cannot recover a runtime mode.

## 5) Core Product Rules (V0)
1. Access control decides whether a mode transition can execute.
2. Mode transition changes only `Study` / `Compound` / `Rest` / `Locked`; implementation value for Compound remains `composite`.
3. 待归类 quota (legacy Composite quota) and Rest quota are independent pools in the current implementation.
4. 待归类 quota exhausted must not borrow or extend that quota.
5. If 待归类 quota is exhausted and Rest is available, access to Compound Site / Pending Attribution / Unclassified defaults to Rest with an in-page notice.
6. If 待归类 quota and Rest are both exhausted, user cannot continue and should return.
7. `Compound Site`, `Pending Attribution`, and auto-pending `Unclassified` share the same routing path after the unclassified target is converted to `pending_composite`; implementation values remain `composite` and `pending_composite`.
8. `Unclassified` automatically creates or reuses a Pending Attribution request and follows the Compound/Pending route immediately; `Restricted Entertainment` remains the Rest confirmation / return flow.
9. HardBlocked / Unsafe allow no mode transition.
10. `mode-service.js` is the only mode owner. It reads `guardian_session.currentMode`, commits `currentModeStartedAtMs`, maintains `restExitGraceUntilMs`, and emits mode-boundary intents.
11. Rest-origin automatic access transitions are immediate. Only `Rest -> Study/Compound` caused by opening a Study Site, Compound Site, Pending Attribution, or auto-pending Unclassified target starts a 30s Rest Exit Grace window: Rest targets return to Rest without Reminder and show an in-page notice.
12. Popup/manual mode switches clear any existing Rest Exit Grace and do not create a new one. Reminder-confirmed switches, quota-driven switches, and automatic Study <-> Compound transitions do not create or extend Rest Exit Grace. Missing or expired `restExitGraceUntilMs` is treated as no grace.
13. Local quota expiry is a mode-transition event. The local `quota_check` alarm evaluates quota state and requests a mode change through Mode Service.
14. Cloud quota sync only saves `quotaState` facts. It must not request mode changes, show Reminder, or recheck tabs.
15. `timeWindows.daily` is the active time-window source of truth. Study, Compound, and Rest each have their own mode window.
16. Time windows are content-use gates, not quota-source gates. They are checked against the usage nature implied by the access target: Study content uses Study windows, Compound/Pending/Unclassified content uses Compound windows, and Restricted Entertainment uses Rest windows. Borrowing Rest quota for Compound/Pending usage does not change that usage nature into Rest.
17. Quota exhaustion has priority over time-window blocking when both apply. HardBlocked / Unsafe remains highest priority.
18. Legacy `schedule` is used only when `timeWindows.daily` is absent.
19. `EVALUATE_QUOTA_STATE` must evaluate the active content-use window when an `ACTIVE` timing session has a managed-target classification snapshot. A Compound/Pending/Unclassified target borrowing Rest quota therefore remains governed by `compositeWindows`; the legacy runtime `rest` value and `quotaBucketAtTime: rest` must not make the alarm evaluate `restWindows` or create a Rest/Study mode loop.
20. Foreground checkpoint repair is not an alternate access path. When the observed tab/domain does not match the open timing session, the checkpoint must run the same `ACCESS_OBSERVED` decision before opening a replacement session. A blocked result opens no session; an allowed result uses the post-route mode and quota attribution.

### 5.1 Mode Time Windows

| Target mode | Config field | Outside-window Reminder |
|---|---|---|
| Study | `studyWindows` | `study_schedule_locked` |
| Compound | `compositeWindows` | `composite_schedule_locked` |
| Rest | `restWindows` | `rest_schedule_locked` |

`null`, missing fields, and empty arrays mean the target mode is allowed all day. `onlineWindows` is derived as `study ∪ composite ∪ rest` for display only, not edited directly.

For Compound/Pending/Unclassified targets, the Compound window is checked regardless of whether the pending-attribution quota is still available or the access is borrowing Rest quota. When the Compound and Rest quotas are both exhausted, the quota-blocked result remains higher priority than the window reminder. When no reliable active timing context exists, periodic evaluation falls back to the current runtime mode.

## 6) Access Control + Mode Transition Matrix (Canonical)

Matrix vocabulary:
- `allow`: access is allowed now; mode may stay unchanged or switch immediately.
- `reminder`: user action is required before any target mode transition.
- `blocked reminder`: Reminder page with no continue path; return only.
- `block`: direct hard block; no mode transition.
- `Rest Exit Grace active`: `now < restExitGraceUntilMs`, set only by automatic access-route `Rest -> Study/Compound`.
- `Rest Exit Grace expired`: `restExitGraceUntilMs` is missing or no longer in the future.

### 6.1 Study mode

| Current Mode | Access target | Precondition | Access decision | Runtime target mode (legacy) | Execution |
|---|---|---|---|---|---|
| Study | Study Site | N/A | allow | Study | no-op |
| Study | Compound Site /<br>Pending Attribution /<br>Unclassified | pending-attribution quota available | allow | Compound | [notice: study_to_composite](#notice-study-to-composite) |
| Study | Compound Site /<br>Pending Attribution /<br>Unclassified | pending-attribution exhausted + Rest available | allow | Rest quota borrow (legacy runtime Rest) | [notice: composite_exhausted_to_rest](#notice-composite-exhausted-to-rest) |
| Study | Compound Site /<br>Pending Attribution /<br>Unclassified | pending-attribution exhausted + Rest exhausted | blocked reminder | none | [blocked reminder: quota_composite_and_rest](#reminder-quota-composite-and-rest) |
| Study | Restricted Entertainment | Rest available + Rest Exit Grace active | allow | Rest | [notice: mode_grace_to_rest](#notice-mode-grace-to-rest) |
| Study | Restricted Entertainment | Rest available + Rest Exit Grace expired | reminder | none | [reminder: rest_confirm](#reminder-rest-confirm) |
| Study | Restricted Entertainment | Rest exhausted | blocked reminder | none | [blocked reminder: rest_locked](#reminder-rest-locked) |
| Study | HardBlocked / Unsafe | N/A | block | none | [block: hard_blocked](#block-hard-blocked) |

### 6.2 Compound mode

| Current Mode | Access target | Precondition | Access decision | Runtime target mode (legacy) | Execution |
|---|---|---|---|---|---|
| Compound | Study Site | N/A | allow | Study | [notice: composite_to_study](#notice-composite-to-study) |
| Compound | Compound Site /<br>Pending Attribution /<br>Unclassified | pending-attribution quota available | allow | Compound | no-op |
| Compound | Compound Site /<br>Pending Attribution /<br>Unclassified | pending-attribution exhausted + Rest available | allow | Rest quota borrow (legacy runtime Rest) | [notice: composite_exhausted_to_rest](#notice-composite-exhausted-to-rest) |
| Compound | Compound Site /<br>Pending Attribution /<br>Unclassified | pending-attribution exhausted + Rest exhausted | blocked reminder | none | [blocked reminder: quota_composite_and_rest](#reminder-quota-composite-and-rest) |
| Compound | Restricted Entertainment | Rest available + Rest Exit Grace active | allow | Rest | [notice: mode_grace_to_rest](#notice-mode-grace-to-rest) |
| Compound | Restricted Entertainment | Rest available + Rest Exit Grace expired | reminder | none | [reminder: rest_confirm](#reminder-rest-confirm) |
| Compound | Restricted Entertainment | Rest exhausted | blocked reminder | none | [blocked reminder: rest_locked](#reminder-rest-locked) |
| Compound | HardBlocked / Unsafe | N/A | block | none | [block: hard_blocked](#block-hard-blocked) |

### 6.3 Rest mode

| Current Mode | Access target | Precondition | Access decision | Runtime target mode (legacy) | Execution |
|---|---|---|---|---|---|
| Rest | Study Site | foreground access | allow | Study | [notice: rest_to_study_success](#notice-rest-to-study-success) |
| Rest | Compound Site /<br>Pending Attribution /<br>Unclassified | pending-attribution quota available + foreground access | allow | Compound | [notice: rest_to_composite_success](#notice-rest-to-composite-success) |
| Rest | Compound Site /<br>Pending Attribution /<br>Unclassified | pending-attribution exhausted + Rest available | allow | Rest quota borrow (legacy runtime Rest) | [notice: composite_exhausted_to_rest](#notice-composite-exhausted-to-rest) |
| Rest | Compound Site /<br>Pending Attribution /<br>Unclassified | pending-attribution exhausted + Rest exhausted | blocked reminder | none | [blocked reminder: quota_composite_and_rest](#reminder-quota-composite-and-rest) |
| Rest | Restricted Entertainment | Rest available | allow | Rest | no-op |
| Rest | Restricted Entertainment | Rest exhausted | blocked reminder | none | [blocked reminder: rest_locked](#reminder-rest-locked) |
| Rest | HardBlocked / Unsafe | N/A | block | none | [block: hard_blocked](#block-hard-blocked) |

### 6.4 Locked mode

| Current Mode | Access target | Precondition | Access decision | Runtime target mode (legacy) | Execution |
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
| `quota_check` alarm | `EVALUATE_QUOTA_STATE -> handleModeEvent` | current Compound + `undeterminedLocked === true` + Study available | Study | recheck current focused active tab only |
| `quota_check` alarm | `EVALUATE_QUOTA_STATE -> handleModeEvent` | current Compound + `undeterminedLocked === true` + `studyLocked === true` | Locked | recheck current focused active tab only |
| `daily_cleanup` | `EVALUATE_QUOTA_STATE -> handleModeEvent` | current Locked + reset cleared online/study locks | Study | recheck current focused active tab only |
| cloud quota pull | save `config.quotaState` only | any cloud quota fact changed | no mode change | no Reminder, no tab recheck |

## 7) Execution Definitions

### 7.1 Notice Definitions

<a id="notice-study-to-composite"></a>
#### notice: study_to_composite
- Trigger: Study mode + Compound Site / Pending Attribution + pending-attribution quota available.
- Behavior: switch to Compound immediately.
- Notice: 4s transient info notice.
- Copy:

`你正在打开复合/待归类对象 · 即将进入复合模式 · 今日剩余 {remainingCompositeTime}`

<a id="notice-composite-exhausted-to-rest"></a>
#### legacy notice id: composite_exhausted_to_rest
- Trigger: Compound Site / Pending Attribution / Unclassified + pending-attribution quota exhausted + Rest quota available.
- Behavior: allow the Compound/Pending usage by borrowing Rest quota. Internal mode/quota fields may continue using legacy Rest values for compatibility, but product/reporting semantics remain Compound/Pending usage.
- Notice: 4s transient info notice.
- Copy:

`你正在打开复合/待归类对象 · 当前待归类时间配额已用完 · 正在借用休息配额 · 今日休息剩余 {remainingRestTime}`

<a id="notice-composite-to-study"></a>
#### notice: composite_to_study
- Trigger: Compound mode + Study Site.
- Behavior: switch to Study immediately.
- Notice: 4s transient success notice.
- Copy: `你正在打开学习网站 · 即将进入学习模式 · 今日剩余 {remainingStudyTime}`

<a id="notice-rest-to-composite-success"></a>
#### notice: rest_to_composite_success
- Trigger: Rest mode + Compound Site / Pending Attribution / Unclassified + pending-attribution quota available + foreground access.
- Behavior: switch to Compound immediately; set `currentModeStartedAtMs`; start 30s Rest Exit Grace because this is an automatic access-route transition.
- Notice: 4s transient success notice.
- Copy:

`你正在打开复合/待归类对象 · 即将进入复合模式 · 今日剩余 {remainingCompositeTime}`

<a id="notice-rest-to-study-success"></a>
#### notice: rest_to_study_success
- Trigger: Rest mode + Study Site + foreground access.
- Behavior: switch to Study immediately; set `currentModeStartedAtMs`; start 30s Rest Exit Grace because this is an automatic access-route transition.
- Notice: 4s transient success notice.
- Copy: `你正在打开学习网站 · 即将进入学习模式 · 今日剩余 {remainingStudyTime}`

<a id="notice-mode-grace-to-rest"></a>
#### notice: mode_grace_to_rest
- Trigger: Study or Compound mode + Restricted Entertainment + Rest available + Rest Exit Grace active.
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

- Rest-origin Study/Compound access-route transitions are immediate.
- `mode-service.js` writes `guardian_session.currentModeStartedAtMs` when the mode changes.
- Only automatic access-route `Rest -> Study/Compound` writes `guardian_session.restExitGraceUntilMs = effectiveAtMs + 30_000`.
- Popup/manual `REQUEST_MODE_CHANGE` clears any existing Rest Exit Grace and does not create a new one; this applies even when the requested mode equals the current mode.
- `REMINDER_CONFIRMED` and quota-driven `EVALUATE_QUOTA_STATE` mode changes do not create Rest Exit Grace.
- While `now < restExitGraceUntilMs`, opening Unclassified / Restricted Entertainment returns to Rest without Reminder and shows `notice: mode_grace_to_rest`.
- Study <-> Compound transitions preserve the existing `restExitGraceUntilMs`; they must not extend it.
- Entering Rest, Locked, or Paused clears `restExitGraceUntilMs`.
- When `restExitGraceUntilMs` is missing or expired, Unclassified / Restricted Entertainment uses `reminder: rest_confirm`.
- Same-mode no-op must not refresh `currentModeStartedAtMs` or `restExitGraceUntilMs`.

### 7.3 Reminder Definitions

<a id="reminder-quota-composite-and-rest"></a>
#### reminder: quota_composite_and_rest
- Trigger: pending-attribution quota exhausted + Rest exhausted.
- Page type: blocked quota Reminder.
- Allowed actions: return only.
- Forbidden: Enter Rest and continue; Compound borrowing; automatic fallback.
- Title:

`今日待归类时间和休息时间均已用完`

Body:

`当前不能继续访问。请返回。`

Actions:
- `返回`

<a id="reminder-rest-confirm"></a>
#### reminder: rest_confirm
- Trigger: Restricted Entertainment while Rest is available and current mode is Study or Compound.
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
- Compound origin: `返回`

<a id="reminder-rest-locked"></a>
#### reminder: rest_locked
- Trigger: Restricted Entertainment while Rest is exhausted.
- Page type: blocked contextual Reminder.
- Current V1-minimal Reminder does not expose Rest borrowing or Compound request.
- Allowed actions: return only.
- Forbidden: Enter Rest and continue; Rest borrowing; Compound request.

Classification request note:
- `SUBMIT_SITE_CLASSIFICATION_REQUEST` belongs to the Popup manual learning-classification flow and carries `requestedClassification: study`.
- Unclassified access creates or reuses an “未归类网站访问记录” through a separate runtime storage function before routing, so the target resolves as `pending_composite` during the same access decision.
- If a manual learning request targets an existing automatic record, the same record is upgraded without changing its pending route.
- These record/request flows are not mode-transition actions.

Reminder layout and interaction requirements are maintained in this document. Do not split UX requirements back into a second mode-transition document.

<a id="reminder-quota-locked"></a>
#### reminder: quota_locked
- Trigger: current mode is Locked and quota state still prevents normal use.
- Page type: blocked quota Reminder.
- Allowed actions: return only.
- Forbidden: Enter Study, Enter Rest, Enter Compound, borrow, or bypass.
- Title: `当前配额已用完`
- Body: `当前不能继续访问。请返回。`

### 7.4 Block Definitions

<a id="block-hard-blocked"></a>
#### block: hard_blocked
- Trigger: HardBlocked / Unsafe target.
- Behavior: block access; no mode transition.
- Page type: blocked Reminder or equivalent blocking overlay.
- Allowed actions: return only.
- Forbidden: Rest confirmation; Compound request; bypass action.

### 7.5 In-page mode-transition notice protocol
In-page notices are a UI projection of mode transition state. They are not the source of mode truth, and delivery failure must not block mode changes.

Protocol expectations:
- `AUTO_MODE_PENDING_START` is a legacy renderer for retired Rest-origin dwell gates; it is not used by the current routing matrix.
- `AUTO_MODE_PENDING_CANCEL` clears pending or transient notices for the current tab.
- `AUTO_MODE_PENDING_SUCCESS` renders the 4s transient success/info notice.
- Page notices are provided by static `content_scripts`; dynamic `chrome.scripting.executeScript` fallback injection is not part of the release model.
- `AUTO_MODE_PENDING_SUCCESS` is queued before delivery. If the tab is not ready, it waits for `CONTENT_SCRIPT_READY` instead of attempting dynamic injection.
- `CONTENT_SCRIPT_READY` marks the sender tab ready and may deliver only an unexpired transient notice whose `domainSnapshot` still matches the current page domain.
- `chrome.tabs.sendMessage` ACK decides whether the page notice rendered. Failure, missing ACK, ready timeout, or a non-injectable page is diagnostic only; fallback notification is allowed, but mode truth must remain independent of notice delivery.
- Mode effects must return explicit notice delivery fields: `noticeAttempted`, `noticeTargetTabId`, `noticeSent`, `noticeAck`, `noticeRendered`, and `noticeError`.

### 7.6 Mode truth and ledger boundary relationship
Mode truth comes from runtime session state, currently `guardian_session.currentMode`. `guardian_session.currentModeStartedAtMs` records when the current mode began. `guardian_session.restExitGraceUntilMs` records the independent Rest Exit Grace deadline. `config.mode` is only a legacy fallback.

All manual and automatic mode transitions enter through `mode-service.js`:
- automatic access routing: Chrome listeners build facts and dispatch `ACCESS_OBSERVED` to `handleModeEvent()`.
- Normal and SPA navigations enter through `webNavigation.onCommitted` / `webNavigation.onHistoryStateUpdated`; ordinary access control must not depend on a one-second active-tab polling loop.
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

The old mixed "check + remind + switch + quota fallback" function is retired. Reminder, notice, and tab redirect are execution effects of a Mode Service decision, not independent routing logic. PiP cleanup is not a mode/product side effect: mode transition must not detect PiP, close PiP, scan media sessions, or record PiP cleanup results. The global PiP policy is owned by media timing / pip-policy and may run when media facts, media checkpoint, or media mode-boundary consumption observe an open `pip` session.

Mode boundary accounting rules:
- Mode switches enqueue a `mode_boundary` intent containing `id`, `boundaryAtMs`, `fromMode`, `toMode`, `reason`, and `source`.
- The mode switch path waits only for the boundary intent to be durably queued; it does not need to wait for foreground/media ledger slicing to finish.
- Foreground and media ledgers consume the same system-level `mode_boundary` signal independently and split only already-open sessions at `boundaryAtMs`.
- Closed ledgers are not opened by mode boundary alone.
- The old segment keeps `fromMode`; the reopened segment uses `toMode`.
- Popup/admin read-before-flush remains a separate legacy path and is not the mode-transition model.

## 8) Forbidden Actions (V0)
- pending-attribution exhausted -> any Compound borrowing UI/action.
- `Unclassified` (auto-created Pending Attribution at access time) / `Restricted Entertainment` Reminder -> embedded Compound request action.
- Current Reminder -> embedded Rest borrowing action.
- HardBlocked / Unsafe -> Rest confirmation, Compound request, or bypass action.
- Pending Attribution (`pending_composite`) -> permanent list mutation.

## 8.1 Return Semantics (Resolved V0)
- `返回学习`:
  - used for Study-origin reminder pages (`Study -> Rest`, `Study -> Unclassified`, `Study -> Restricted Entertainment`).
  - behavior: cancel current access, return to Study context where possible.
  - must not switch to Rest, must not create Pending Attribution.
- `返回`:
  - used for Compound-origin reminder pages and blocked/quota pages.
  - behavior: cancel reminder, no mode switch, no quota consumption, no temporary allowance.
  - close reminder tab preferred; fallback to history/back/safe page if needed.
- Quota exhausted return:
  - return means do not continue current access.
  - no borrow and no embedded Compound request.
  - continuation requires explicit user action.

## 9) Non-Mode-Transition Responsibilities
- `mode_boundary` and foreground/media ledger slicing are downstream accounting responses.
- `SUBMIT_SITE_CLASSIFICATION_REQUEST` is site-governance behavior, not a mode-transition action.
- `AUTO_MODE_PENDING_*` is UI projection, not mode truth.
- Pending Attribution (`pending_composite`) changes access target resolution only; it does not add a fourth mode.
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
   - does not auto-become Compound and does not auto-trigger site classification request.
   - if Rest quota is exhausted, route to current exhausted Reminder flow.
2. Return semantics:
   - `返回学习` for Study-origin reminder pages.
   - `返回` for Compound-origin reminder pages and blocked/quota pages.
3. Config example location:
   - use `docs/site-access-config.example.json` as the single sample location.

Remaining V1 refinement items:
1. If Rest borrowing returns to Reminder, define the entry point, copy, amount policy, repayment explainability, and parent-control behavior.
2. If site-classification request returns to Reminder, define how it differs from popup/site-governance flow and how it maps to Pending Attribution (`pending_composite`).
