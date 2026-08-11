# 1.7.23 内部发布门禁报告

## 元数据

- 报告 ID：`REL-1.7.23-20260812`
- 日期：2026-08-12
- 发布目标：T.xia / P.xia 内部自托管扩展通道及 `guardian-api` Worker
- 候选版本：`1.7.23`
- 候选分支：`master`
- 候选提交：待提交
- CRX：`dist/self-hosted/timeonchrome-1.7.23.crx`
- SHA256：待生成
- Prepared by：Codex / releaseMg workflow
- 状态：In Progress

## 执行范围

- 允许升级版本、提交、推送、部署 Worker、签名打包和部署内部自托管更新站点。
- 邮件归类开关和 profile allowlist 保持关闭；不修改 profile、历史统计或既有 D1 数据。
- 不执行 Chrome Web Store 上传或最终提交审核。

## 门禁结果

| 门禁 | 结果 | 证据 |
|---|---|---|
| Preflight | PASS | `master`、版本目标、变更范围、稳定签名 ID 与 Wrangler OAuth 已核对 |
| Automated tests | PASS | `check-extension-root`、`typecheck`、全量 unit 与 `node tests/run-all.js` 全部通过 |
| Artifact verification | PENDING | 等待 CRX、update.xml、SHA256 和扩展 ID 验证 |
| Worker deployment | PENDING | 等待 `guardian-api` 部署与健康回读 |
| Production update host | PENDING | 等待 Pages 部署及生产文件回读 |
| Evidence privacy | PASS | 不记录签名密钥路径/内容、token、cookie、profile/device 标识或浏览历史 |

## 已知风险与发布后观察

- T.xia 仍需观察本地存储是否降到 6.5 MB 以下，以及 pending outbox 是否持续下降。
- 需确认不再出现 `restricted + study`、待归类 Rest/Study 震荡、陈旧媒体长段或 `QuotaBytes`。
- 邮件归类基础设施随 Worker 部署，但功能开关与 profile allowlist 保持关闭，后续灰度另行授权。

## 发布结论

`IN PROGRESS`。完成提交、部署和生产回读后更新最终结论。
