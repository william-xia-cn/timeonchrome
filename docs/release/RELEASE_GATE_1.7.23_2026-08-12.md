# 1.7.23 内部发布门禁报告

## 元数据

- 报告 ID：`REL-1.7.23-20260812`
- 日期：2026-08-12
- 发布目标：T.xia / P.xia 内部自托管扩展通道及 `guardian-api` Worker
- 候选版本：`1.7.23`
- 候选分支：`master`
- 候选代码提交：`87da4448e998c64290c748af65541ba2533c066e`
- CRX：`dist/self-hosted/timeonchrome-1.7.23.crx`
- SHA256：`70a79b4dc966d3ae3dae6f7fc4c3f3241f5ea7cd40e4aa7014c87273f98a0800`
- Prepared by：Codex / releaseMg workflow
- 状态：Deployed / Production Observation

## 执行范围

- 允许升级版本、提交、推送、部署 Worker、签名打包和部署内部自托管更新站点。
- Worker 部署使用 `--keep-vars` 保留既有生产 secret、开关和 profile allowlist；本轮不修改 profile、历史统计或既有 D1 数据。
- 不执行 Chrome Web Store 上传或最终提交审核。

## 门禁结果

| 门禁 | 结果 | 证据 |
|---|---|---|
| Preflight | PASS | `master`、版本目标、变更范围、稳定签名 ID 与 Wrangler OAuth 已核对 |
| Automated tests | PASS | `check-extension-root`、`typecheck`、全量 unit 与 `node tests/run-all.js` 全部通过 |
| Artifact verification | PASS | CRX 361,364 bytes；扩展 ID `jdcancbiocacabbjdkngadmjpjmkdnih`；manifest、managed deployment profile、update.xml 与 SHA256 一致 |
| Worker deployment | PASS | `guardian-api` Version ID `72230fc5-1e70-41f7-9eee-65daadfd351b`；生产根路径回读 HTTP 200 |
| Production update host | PASS | Pages deployment `7e066cdb`；稳定域名 update.xml / SHA256SUMS / CRX 均回读 HTTP 200；远端 CRX SHA256 与本地一致 |
| Evidence privacy | PASS | 不记录签名密钥路径/内容、token、cookie、profile/device 标识或浏览历史 |

## 已知风险与发布后观察

- T.xia 仍需观察本地存储是否降到 6.5 MB 以下，以及 pending outbox 是否持续下降。
- 需确认不再出现 `restricted + study`、待归类 Rest/Study 震荡、陈旧媒体长段或 `QuotaBytes`。
- 邮件归类基础设施随 Worker 部署；本轮未改变既有生产开关或 profile allowlist，灰度状态继续以 `TASK_BOARD.md` 当前记录为准。

## 发布结论

`PASS_WITH_PRODUCTION_OBSERVATION`。`1.7.23` 已提交并推送到 `master`，Worker 与内部自托管更新源部署完成，生产回读一致。T.xia / P.xia 的 24 小时运行观察仍是发布后验收项，不将尚未发生的设备升级和长期稳定性记为自动通过。
