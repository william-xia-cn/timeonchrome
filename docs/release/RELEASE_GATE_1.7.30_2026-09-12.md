# 1.7.30 内部诊断与记账影子链路发布门禁报告

## 元数据

- 报告 ID：`REL-1.7.30-20260912`
- 日期：2026-09-12
- 发布目标：T.xia / P.xia 内部 managed 自托管扩展通道
- 稳定扩展 ID：`jdcancbiocacabbjdkngadmjpjmkdnih`
- 当前状态：`APPROVED_WITH_KNOWN_P0_RISK / INTERNAL MANAGED SHADOW RELEASE`

## 发布范围

- D-075：长期基础诊断、临时详细日志、一次性脱敏配额取证及失败证据收敛。
- D-076/D-078/D-079：记账 V2 包 A-G，包括逐项事实 ACK、版本化设备单账、档案日/周原子发布、独立对账及不可变分页影子下发。
- migration 023-026 只创建隔离 V2 表；不改写 V1 表、历史账本或 profile 配置。
- 控制台 Pages 只增加诊断策略与一次性取证界面，不展示或消费 V2 主账。
- 不进入 Chrome Web Store，不修改网页 ACTIVE、焦点/idle、媒体分类或配额语义。

## 已知风险与门禁

- 19009 秒历史差额保持 P0 未解决；本版提供取证能力，但尚无真实终端完整证据。
- `cg.163.com idleStateChanged` 网页少记保持 P0 / Deferred。
- V2 正式切换必须满足全部活跃设备兼容、连续 7 个北京时间自然日守恒及下一个周一 00:00；本次发布不执行切换。
- 正式设备升级、影子单账发布和对账收敛属于发布后观察，不得预先记为 PASS。

## 门禁证据

- 140 个全量 unit 文件：`PASS`。
- `npm run typecheck`、`npm run check:extension-root`、`git diff --check`：`PASS`。
- `node tests/run-all.js`：`PASS`，其中 API `103/103`、数据流 `53/53`、扩展 E2E `15/15`。
- D-075 Pages 桌面/手机目视证据：`PASS_WITH_MANUAL_EVIDENCE`；不包含私有截图。
- Plan Conformance Audit：`Matched`；V2 未进入 V1 或配额消费者。
- 源码提交：`cf9f2c8`，已推送并与 `origin/master` 对齐。
- D1：仅应用隔离 migration 023-026；发布前 V2 表不存在，应用后 14 张 V2 表存在且初始业务行数为 0；未执行 V1 migration 或历史数据改写。
- Guardian Worker：version `e9e53258-f4d0-4c0a-bbe3-2b7a2b25bd27`；部署后 API `103/103` 通过，V2 设备及家长未认证请求均返回 401。
- 控制台 Pages：deployment `02e3bc0d`；稳定域名和 deployment 域名均返回 200，并包含长期基础诊断、30 天详细诊断和一次性配额取证界面。
- managed CRX：`dist/self-hosted/timeonchrome-1.7.30.crx`，410,948 bytes，SHA256 `46662d97661a63f9f15d9641c78ef4c215b68b5f5499f870fa67e00c3eb99c2a`；派生扩展 ID 严格等于 `jdcancbiocacabbjdkngadmjpjmkdnih`。
- 更新站点：最终 production deployment `2bd564f4`。稳定域名和 deployment 域名的 `update.xml`、`SHA256SUMS.txt`、CRX 均回读成功；线上 CRX 大小与 SHA256 和本地产物完全一致，feed 指向 `1.7.30`。

## 当前结论

`1.7.30` 已完成内部 managed 前向影子发布。结论为 `APPROVED_WITH_KNOWN_P0_RISK / INTERNAL MANAGED SHADOW RELEASE`：发布与隔离性门禁通过，但已知 P0、设备实际升级和连续 7 日影子门禁保持开放，不能改写为正式账本切换完成，也不适用于 Chrome Web Store。
