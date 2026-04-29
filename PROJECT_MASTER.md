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
- **当前 HEAD**：`7816f1c`
- **V0 RC2 与 System Recovery runner infrastructure 已可用**
- **RC 验证：passed**
  - RC tag: `v1.7.2-rc1` (commit `aa8de9e`)
  - RC smoke: 8/8 passed
  - Workers API tests: 55/55 passed
  - E2E tests: 11/11 passed
  - Background logic: 79/79 passed
- **System Recovery Release Gates**
  - RG-1 Chrome close / reopen: **PASS**
  - RG-2 Lock / Unlock: **Pending**
  - RG-3 OS Sleep / Wake: runner implemented；当前环境因 no S3 support 返回 **SKIP**；Gate **Pending**
  - RG-4 Network Offline / Online: **Pending**
- **放行规则**：V0 formal release 必须等剩余 System Recovery Release Gates 通过，或由 Product Owner 明确 waive 后才能发布。
- **Workers: deployed and verified**
- **Pages: deployed and verified**
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
