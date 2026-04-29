# PROJECT_MASTER

## 项目状态
- **版本：1.7.2**
- **阶段：V0 formal release blocked by System Recovery Release Gates**
- 当前约束：仅做发布前收口与 Release Gate 验证，不扩展新功能

## 版本边界
- **V0（功能冻结 / 发布闸门未完成）**
  - monitoring 核心短路（含全局门禁主路径）
  - 配置字段单一模型收口（`compositeList / studyList / unsafeList`）
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
- **V0 formal release: BLOCKED**
- **最近确认的 System Recovery runner infrastructure commit**：`9626a8c`
- **V0 RC2 与 System Recovery runner infrastructure 已可用**
- **RC 验证：passed**
  - RC tag: `v1.7.2-rc1` (commit `aa8de9e`)
  - RC smoke: 8/8 passed
  - Workers API tests: 55/55 passed
  - E2E tests: 11/11 passed
  - Background logic: 79/79 passed
- **System Recovery Release Gates**
  - RG-1 Chrome close / reopen: **PASS**
  - RG-2 Lock / Unlock: **PASS**（bound profile 可用；`--allowWorkstationLock` 触发真实 Windows lock；手动 unlock 后恢复验证通过）
  - RG-3 OS Sleep / Wake: **PASS**（最后执行；本机 sleep model 为 S0 Modern Standby，S3 unavailable；真实 OS sleep/wake 后恢复验证通过）
  - RG-4 Network Offline / Online: **PASS**（bound profile 可用；`--manualNetworkToggle` 人工断网/联网观察到真实 offline/online；恢复后 event-log/session/trace 可读）
- **放行规则**：V0 formal release 必须等剩余 System Recovery Release Gates 通过，或由 Product Owner 明确 waive 后才能发布。
- **Workers: deployed and verified**
- **Pages: deployed and verified**
- **Terminal 默认网站清单链路：verified**
  - Worker fix: `c864175`（`/device/config` 注入 `defaultStudySites/defaultCompositeSites/defaultRestrictedEntertainmentSites/defaultBlockedSites`）
  - Worker deploy: `guardian-api`，Version ID `ae44552a-9b03-44f4-a14c-83d92d965028`
  - Terminal sync fix: `028c941`（同版本 sync skip 时若本地缺默认清单则补齐持久化）
  - Product Owner 手动验收：终端 `访问规则` 页面可见系统/默认学习网站清单；数据来自云同步；未引入本地硬编码默认清单；页面保持只读
- **Chrome Web Store: NOT published** — separate future task, not in current scope

## 已知非阻塞残余项
- `admin/admin.html` 历史 local-console 命名 / 物理页面拆分，保留为 post-V0 cleanup (P2)
- D-015 申诉/审核语义待 Product Owner 终审 (Pending PO)
- 旧 profiles 清理为 optional / P2

## 非目标（当前）
- 不做大重构
- 不开启 V1 composite routing
- 不引入新的产品功能模式
- 不在当前计时准确性收口中实现凌晨休息时间限制，仅记录为后续产品设计项
