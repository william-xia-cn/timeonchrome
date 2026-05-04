# PROJECT_MASTER

## 项目状态
- **版本：1.7.2**
- **阶段：V0 RC closeout under Product Owner accepted release risk**
- 当前约束：仅做发布前收口与 RC 交付准备，不扩展新功能

## 版本边界
- **V0（功能冻结 / 发布闸门未完成）**
  - monitoring 核心短路（含全局门禁主路径）
  - 配置字段单一模型收口（`compositeList / studyList / unsafeList`）
  - 三模式低摩擦切换 UX 规格已冻结（文档层）：Study / Composite / Rest / Paused（见 `docs/MODE_TRANSITION_UX_V0.md`、`DECISIONS.md:D-019`）
  - Background Audio Time 最小版（`BACKGROUND_ACTIVE -> audioSeconds`）
  - dev-reset 工具页（dev-only）
  - 真实 Chrome 前台 ACTIVE 计时、失焦/最小化、多窗口、badge 今日时长已进入本地验收
  - 跨自然日计时统计口径定为"按自然日切分"，聚合层已补最小实现与单元测试
- **V1（后续）**
  - composite routing（明确延后）
  - 更精细分类能力（超出 V0 最小收口范围）
  - 凌晨休息时间限制：允许配置凌晨不可用于休息时间，防止熬夜娱乐
  - PiP timing support：最小闭环已补；`PIP_ACTIVE` 单独聚合到 `pipSeconds / pipByDomain`，不混入普通在线/ACTIVE 或后台媒体时长；切换学习模式时会尝试关闭非学习网站 PiP
  - 媒体时长 domain 维度：后台 audio/video 已补 `backgroundMediaByDomain` 明细，PiP 已补 `pipByDomain` 明细；摘要字段仅作总量展示

## V0 Release 1.7.2 状态
- **V0 RC: APPROVED for Google review / handoff（Product Owner approved）**
- **批准时间**：2026-05-04
- **批准范围**：Google review / handoff 版本，非 Chrome Web Store 正式发布
- **最近确认的 System Recovery runner infrastructure commit**：`9626a8c`
- **V0 RC 与 System Recovery runner infrastructure 已可用**
- **RC 验证：passed**
  - RC tag: `v1.7.2-rc1` (commit `aa8de9e`)
  - RC smoke: 8/8 passed
  - Workers API tests: 55/55 passed
  - E2E tests: 11/11 passed
  - Background logic: 79/79 passed

### V0 RC Package（含 first-install binding flow fix）
- **Package path**：`D:\Opencode\ChromeExtension\timeonchrome\dist\rc\timeonchrome-v0-rc.zip`
- **SHA256**：`B9DE59BEE9267CEC9F5B47B3611FE7E1ED718C071961142573E7241A349BD389`
- **Size**：184,216 bytes (179.9 KB)
- **Files**：64
- **Modified**：2026-05-04T03:38:05.8939701Z
- **Included fix**：`background.js` `onInstalled` install 分支提前执行 + try-catch 保护，确保首次安装时 `bind.html?welcome=1` 不受 bootstrap 失败阻断

### 自动化回归状态
| 套件类别 | 结果 | 备注 |
|----------|------|------|
| L0 核心单元（6 套件） | PASS | 全部通过 |
| L1 V0 专项单元（12 套件） | PASS | 全部通过 |
| L1b 跨自然日计时（3 套件） | PASS | 全部通过 |
| V12 域对齐（16 套件） | PASS | 全部通过 |
| Reminder 浏览器门 | PASS | 11/11 passed |
| 扩展 E2E 全量 | PASS | 14/14 passed |
| Worker API 集成 | PASS | 55/55 passed |
| 集成测试（duration-flow） | PASS | 53/53 passed |
| 全量 `run-all.js` | PASS | 421/421 passed |

### M1-M9 手动验证状态
| # | 检查项 | 结果 | 验证人 |
|---|--------|------|--------|
| M1 | 扩展加载：无 CSP 错误，SW 正常启动 | PASS | Product Owner |
| M2 | Study→Rest 滑动确认 | PASS | Product Owner |
| M3 | Study→Composite 自动切换 + 45s 轻提示 | PASS | Product Owner |
| M4 | Composite→Rest 普通确认 | PASS | Product Owner |
| M5 | Popup 模式按钮：显示时长/配额，无借用入口 | PASS | Product Owner |
| M6 | Admin 功能：stats/rules/devices/nav/login/logout/save/sync | PASS | Product Owner |
| M7 | PiP 学习模式清理 | PASS | Product Owner |
| M8 | 临时综合权限：仅当前 tab 有效 | PASS | Product Owner |
| M9 | 云同步：配置拉取正常，默认清单可见 | PASS | Product Owner |

### 发布阻塞表（RB）状态
| 阻塞 ID | 条件 | 状态 |
|---------|------|------|
| RB-1 | L0/L1/L1b/V12 单元存在失败 | **CLEAR** |
| RB-2 | V0 专项单元存在失败 | **CLEAR** |
| RB-3 | Reminder 浏览器门 < 11/11 | **CLEAR** |
| RB-4 | 扩展 E2E 关键路径失败 | **CLEAR** |
| RB-5 | Worker API 集成失败 | **CLEAR** |
| RB-6 | V12 域对齐存在失败 | **CLEAR** |
| RB-7 | M1-M9 手动验收存在 P0 失败 | **CLEAR** |
| RB-8 | RC 打包安装冒烟失败 | **CLEAR** |
| RB-9 | Product Owner 最终批准未完成 | **Pending PO** |

### RC Install Smoke 结果
- **RC 解压加载**：PASS
- **manifest.json**：MV3 valid，`service_worker: background.js`，`type: module`
- **首次安装绑定流程**：`bind.html?welcome=1` 在 install 事件中优先打开（已含 fix）
- **关键文件（27/27）**：全部 PRESENT
- **background.js onInstalled fix 验证**：confirmed in extracted zip

### System Recovery Release Gates（最终记录）

| Gate ID | 状态 | 证据摘要 | 确认来源 | Remaining Action |
|---|---|---|---|---|
| RG-1 | PASS | `chrome-restart` formal bound-device Gate 已通过 | Product Owner confirmed | 无 |
| RG-2 | PASS | bound profile 可用；`--allowWorkstationLock` 触发真实 Windows lock；手动 unlock 后恢复验证通过 | Product Owner confirmed | 无 |
| RG-3 | PASS | 最后执行；本机 sleep model 为 S0 Modern Standby，S3 unavailable；真实 OS sleep/wake 后恢复验证通过 | Product Owner confirmed | 无 |
| RG-4 | PASS | bound profile 可用；`--manualNetworkToggle` 人工断网/联网观察到真实 offline/online；恢复后 event-log/session/trace 可读 | Product Owner confirmed | 无 |

- **记录口径**：以上 RG-1~RG-4 状态按 Product Owner 最终确认落档；本文件不独立重判 Gate 结果。
- **Workers: deployed and verified**
- **Pages: deployed and verified**
- **Terminal 默认网站清单链路：verified**
  - Worker fix: `c864175`（`/device/config` 注入 `defaultStudySites/defaultCompositeSites/defaultRestrictedEntertainmentSites/defaultBlockedSites`）
  - Worker deploy: `guardian-api`，Version ID `ae44552a-9b03-44f4-a14c-83d92d965028`
  - Terminal sync fix: `028c941`（同版本 sync skip 时若本地缺默认清单则补齐持久化）
  - Product Owner 手动验收：终端 `访问规则` 页面可见系统/默认学习网站清单；数据来自云同步；未引入本地硬编码默认清单；页面保持只读
- **Chrome Web Store: NOT published** — separate future task, not in current scope

## Product Owner 手动验收状态（V0 UX）
- **Reminder UI：已通过**
  - Study→Rest 滑动确认页通过
  - Study→Composite 自动切换 + 45s 轻提示通过
  - Composite→Rest 普通确认页通过
- **Pending mode-transition feedback：已通过**
  - Rest→Composite、Rest→Study、Composite→Study 的 pending/success 提示通过
- **Popup V0 layout：已通过**
- **Admin 功能：已通过**
  - stats/rules/devices/nav/login/logout/save/sync 可用
  - “立即同步/立刻更新”按钮具备可见反馈（运行中/成功/失败）
- **PiP study-mode cleanup blocker: FIXED & manually verified**
  - Commit: `fcf38f7` (`fix: enforce PiP cleanup on study mode switch`)
  - Product Owner 手动验收通过：restricted/unsafe PiP 在切换学习模式时会关闭，未归类 PiP 不会静默保留；study/composite 允许场景保持；无关标签页不被关闭；PiP 统计仍保持独立口径
- **Temporary composite permission semantic bug: FIXED & code-verified**
  - Commit: `b5d371c` (`fix: scope temporary composite permission to current tab visit`)
  - Codex closed-loop 代码路径核验：临时权限不再写入 `guardian_config.compositeList`；存储模型为 `tabId + domain + createdAt`；访问判定要求 `tabId + domain` 同时命中；tab 关闭/跨域导航/模式切换会清理临时权限；受限域与配额锁会拒绝临时权限；终端永久规则不展示临时域名；文案为“本次标签页访问内有效，占用综合时间，不计入学习时间。”；统计归因保持综合/待定口径

## Reminder V0 一致性阻塞解决记录
- **状态：已解决**
- **浏览器验证门**：`tests/e2e/reminder-v0-validation.test.js`
- **覆盖场景（11/11 passed）**：
  - T-R1 study_mode
  - T-R2a/b/c study_mode&restLocked=1
  - T-R3 to_rest_slide_confirm（无 originMode）
  - T-R3b to_rest_slide_confirm with originMode=study
  - T-R4 to_rest_confirm unclassified
  - T-R5 to_rest_confirm restricted
  - T-R6 quota_composite
  - T-R7 quota_composite_and_rest
  - T-R8 unsafe
- **单元/路由/拦截器证据**：
  - `reminder-transition-v0`: 68/68 passed
  - `interceptor-mode-transition-v0`: 71/71 passed
  - `mode-routing-matrix-v0`: 74/74 passed
  - 合计：213/213 passed
- **T-R4/T-R5 修复**：标题渲染顺序 bug（`mainTitle.textContent` 在配置覆盖前写入，修复后在 `to_rest_confirm` 双路径覆盖后重渲染）
- **T-R3/T-R3b 返回标签验证**：
  - 无 originMode → `返回`
  - originMode=study → `返回学习`
- **行为不变性确认**：
  - 路由行为未变更
  - 网站分类行为未变更
  - 统计/配额计算未变更
  - `to_rest_slide_confirm` 行为未变更（仅新增测试覆盖）
- **约束**：Reminder 未来变更必须运行此浏览器门
- **注意**： broader V0 release regression 仍为必需项，本记录不替代完整 V0 发布闸门

## 已知非阻塞残余项
- `admin/admin.html` 历史 local-console 命名 / 物理页面拆分，保留为 post-V0 cleanup (P2)
- `admin/admin.html?view=stats` 仍存在未定位来源的 CSP 控制台告警（`Executing inline event handler violates Content Security Policy`）；当前记录为已知 admin 页面告警，尚未确认对核心 runtime/mode/popup/content-script 造成故障；不得标记为 fixed，需继续按 admin 功能项做人工验证（stats/rules/devices/nav/login/logout/save/sync）
- D-015 申诉/审核语义待 Product Owner 终审 (Pending PO)
- 旧 profiles 清理为 optional / P2
- Reminder 双滑轨页面（`study_mode` / `to_rest_confirm` 的未归类路径）说明文案在部分窗口下存在右偏/遮挡视觉问题：记录为 V1 UI 优化项（固定结构布局重排），当前不作为 V0 阻塞
- Rest 借用机制当前按 V0 accepted mechanism 运行（上下文 Reminder 显式触发、与综合申请分离、不经 popup）；借用额度策略、次日扣减算法呈现、失败反馈与审计可见性等列为 V1 优化项
- macOS smoke validation **未通过 / 未执行完成**：按 Product Owner 风险接受，V0 暂缓到 V1 跟进
- Playwright E2E alternate-environment evidence **未完成**：当前 Windows 本地受 `spawn EPERM` 环境阻塞，按 Product Owner 风险接受，V0 暂缓到 V1 跟进
- Composite 默认收窄（D-028）：`defaultUserCompositeSites`（7 个用户默认综合网站）仅种子注入新建 Profile，现有 Profile 不自动迁移。如需应用新默认值，家长可手动添加或重建 Profile。

## V0 Accepted Risks（Product Owner confirmed）
1. macOS smoke validation did not pass; deferred to V1 as accepted V0 release risk.
2. Playwright E2E did not complete in local Windows (`spawn EPERM`); alternate-environment rerun deferred to V1 as accepted V0 release risk.
3. Admin CSP warning is unresolved; treated as known non-blocking admin-page warning because admin functional flows were manually validated.

## RC handoff 状态
- [x] release notes final review
- [x] known issues final review
- [x] RC package generation（`dist/rc/timeonchrome-v0-rc.zip`）
- [x] local RC install smoke
- [x] Product Owner final approval（RB-9）— **APPROVED for Google review / handoff（2026-05-04）**

## 发布口径约束
- 上述 accepted risks 是"未修复/未通过"的风险接受，不是测试通过结论。
- **V0 RC 已获 Product Owner 批准用于 Google review / handoff（2026-05-04）**。
- 本批准**不等同于 Chrome Web Store 正式发布**；CWS 提交为独立后续任务。

## 非目标（当前）
- 不做大重构
- 不开启 V1 composite routing
- 不引入新的产品功能模式
- 不在当前计时准确性收口中实现凌晨休息时间限制，仅记录为后续产品设计项
