# SPEC-003 macOS Native App Control V1

## Metadata

- Spec ID: SPEC-003
- Date: 2026-08-20
- Owner: Product Owner
- Status: Approved
- Related decision: D-064

## Goal

利用官方 Santa 提供独立的 macOS 应用发现、家长审核和执行阻断能力，并在业务层关联现有 Parent / Child 身份。

## Product Boundary

- Native App Control 是独立子系统，只共享 Account ID 和 Child/Profile ID。
- Native Mac、enrollment secret、Santa MachineID、应用身份、审核状态和阻断策略不得复用 Chrome Device 或扩展凭据。
- macOS 终端只新增官方 Santa；不开发 Runtime Agent、前台监控、应用时长或其他常驻组件。
- 一台 Native Mac 只归属一个 Child，规则对该 Mac 的全部本地用户生效。
- 未知应用在 Santa Monitor 模式下允许运行并进入 `REVIEW`；`IGNORE` 不产生规则；`BLOCK` 产生 Santa block rule。

## Review Model

- 审核对象是 Application，不直接向家长平铺 helper binary。
- 同一 `TeamID + 顶层 BundleID` 自动聚合为一个 Application。
- 不同 BundleID 的 Stable、Beta、ESR 等默认保持独立，可由家长合并。
- Application Family 在家长账号内共享；`REVIEW / IGNORE / BLOCK` 按 Child 独立。
- `BLOCK APP` 默认展开为 SIGNINGID 规则；`BLOCK PUBLISHER` 才生成 TEAMID 规则。
- Publisher BLOCK 不提供单 App IGNORE 例外。

## User Experience

- 家长控制台提供独立 `Native Apps` 入口。
- 默认展示待审核应用，并可切换查看已阻止和已忽略应用。
- 详情展示应用名称、发布者、代码身份、发现设备和规范化诊断摘要。
- 家长可忽略、阻止应用、阻止发布者、合并或拆分应用身份。
- Native Mac enrollment、在线状态和策略版本只在 Native Apps 模块显示，不混入 Chrome Device 页面。

## Out Of Scope

- 应用使用时长、启动次数、前台状态、idle、sleep/lock 修正。
- 应用配额、日程、任务或周期规则。
- 主动磁盘 inventory。
- Chrome 扩展、Native Messaging Host、Chrome policy keeper 联动。
- 普通 UI 中的 Device Override。

## Acceptance Criteria

1. Chrome 扩展删除或解绑后，Santa 同步和已下发阻断规则不受影响。
2. Santa 吊销或卸载后，Chrome 扩展绑定、计时和网站访问控制不受影响。
3. 未知应用允许执行并进入 Child 的 REVIEW 列表。
4. IGNORE 不产生 Santa allow rule。
5. BLOCK 在健康网络下两分钟内下发，并在改名、移动路径、正常升级和重启后继续按稳定 Signing ID 生效。
6. Child A 的规则不得作用于 Child B。
7. Native App Review 不读写网站归类、网站规则、时间配置或使用统计。
8. 云端不可用时，Santa 本地已有规则继续执行。
