# 1.7.29 内部同步可靠性发布门禁报告

## 元数据

- 报告 ID：`REL-1.7.29-20260831`
- 日期：2026-08-31
- 发布目标：T.xia / P.xia 内部 managed 自托管扩展通道
- 稳定扩展 ID：`jdcancbiocacabbjdkngadmjpjmkdnih`
- 状态：`APPROVED_WITH_KNOWN_P0_RISK / FORWARD RELIABILITY RELEASE`

## 发布范围

- D-073：确定性网站归类结果退出永久重试，同时保留本地审计。
- D-074：usage/media segment 完整校验、D1 batch 原子幂等写入、逐项 ACK、小批次和统计收敛门禁。
- 客户端日志采用小批次、Worker batch 和逐项 ACK。
- 本地 Admin 只读显示已同步的云端访问管理配置和状态，不增加本地写配置入口。
- 不修改网页 ACTIVE、媒体分类、配额语义、历史 D1、profile 或 D1 schema；不进入 Chrome Web Store。

## 已知风险与批准边界

- `cg.163.com idleStateChanged` 网页少记风险继续 P0 / Deferred。
- Thomas Mac 正式设备最近证据仍为 `1.7.27`，并在北京时间 2026-08-31 17:33:11 后停止全部云端请求；根因缺少本地 Guardian、Chrome 和系统睡眠证据。
- Pierce Mac 最近证据仍为 `1.7.24` 且离线；两台正式设备升级均属于发布后生产观察。
- 既有历史 D1 账本不在本次修正范围；积压是否通过新上传路径收敛必须在设备升级后只读核对。
- `popup-stats-message-route.test.js` 仍含已过期的未绑定文案、激活门禁和旧统计结构断言，作为独立测试债保留；本次 Admin 桌面/手机只读显示使用当前账本和 read model 单独验收。
- Product Owner 明确批准在保留上述未解决事项的前提下提交、推送、部署和内部托管；风险接受不等于测试通过或问题关闭。

## 门禁结果

- 全量 `125` 个 unit 文件：通过。
- `npm run typecheck`、`npm run check:extension-root`、`git diff --check`：通过。
- `node tests/run-all.js`：Unit、API `103/103`、Integration `53/53`、核心浏览器 E2E `15/15` 全部通过。
- Admin 真实扩展可视化：桌面/手机只读访问管理 `2/2` 通过；手机无横向溢出，截图证据保存在本地 `.artifacts/`，不提交私有运行证据。
- Guardian Worker `wrangler 4.127.1` dry-run：通过；上传体 `555.89 KiB`，gzip `105.28 KiB`，既有 D1/KV/R2/Native bridge binding 均解析成功。
- Plan Conformance Audit：`Matched`。实际范围仅含 D-073、D-074、客户端日志逐项 ACK、本地 Admin 只读显示、对应测试、版本与发布文档；没有修改网页 ACTIVE、媒体分类、profile、D1 schema、历史数据或控制台 Pages。
- 提交 hash、Worker version、CRX 大小、SHA256、更新站点 deployment 和生产回读结果在发布执行后补齐。签名 ID 或线上回读不一致将阻断托管。
