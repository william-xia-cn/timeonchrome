# 1.7.24 内部发布门禁报告

## 元数据

- 报告 ID：`REL-1.7.24-20260818`
- 日期：2026-08-18
- 发布目标：T.xia / P.xia 内部自托管扩展通道及家长控制台 Pages
- 候选版本：`1.7.24`
- 候选分支：`master`
- 候选代码提交：`584b839770bb1eff1c1b5773adcbbc7e4c8beddc`
- CRX：`dist/self-hosted/timeonchrome-1.7.24.crx`
- CRX 大小：350,504 bytes
- SHA256：`da88f02dceb3e6234ea21a9c3a8d39ffa4fff0f105abe3617912e8904e5f5fe4`
- 稳定扩展 ID：`jdcancbiocacabbjdkngadmjpjmkdnih`
- Prepared by：Codex / releaseMg workflow
- 状态：Deployed / Production Observation

## 执行范围

- 发布 alarm 保留、日媒体 exhausted 自动恢复、Pages 分钟级时段校验和日志 TTL 展示修复。
- managed 自托管 staging 排除废弃隐私页面，保留运行时需要的 `core/privacy-consent.js`。
- 部署家长控制台 `timeonchrome-console` 和内部更新站点 `timeonchrome-update`。
- 不部署 `guardian-api`，不执行 D1 写入或 migration，不修改 profile，不上传或提交 Chrome Web Store。

## 门禁结果

| 门禁 | 结果 | 证据 |
|---|---|---|
| Preflight | PASS | `master` 与 `origin/master` 基线一致；版本、范围、稳定签名 ID 与 Wrangler OAuth 已核对 |
| Automated tests | PASS | 逐文件 unit 107 个文件；Worker API `103/103`；duration-flow `53/53`；浏览器 E2E `14/14`；typecheck 与扩展根目录检查通过 |
| Visual verification | PASS | Pages 桌面/移动端均验证 `19:00-19:01` 分钟级时段；未发现元素重叠或文案溢出 |
| Managed staging | PASS | dry-run 通过；排除 `privacy-consent.html`、`privacy-consent.js`、`privacy.html`，保留 `core/privacy-consent.js` |
| Artifact verification | PASS | CRX 350,504 bytes；manifest `1.7.24`；扩展 ID、update.xml、SHA256SUMS 与线上 CRX 一致 |
| Console Pages | PASS | deployment `d29dc5f0`；唯一域名与稳定域名 HTTP 200，分钟校验和过期策略代码已回读 |
| Production update host | PASS | deployment `d736ba71`；稳定域名 update.xml、SHA256SUMS 与 CRX 均 HTTP 200，远端 CRX SHA256 与本地一致 |
| Evidence privacy | PASS | 未记录签名密钥位置/内容、token、cookie、profile/device 标识或浏览历史 |

## 发布后观察

- 确认 T.xia / P.xia 实际升级到 `1.7.24`。
- 连续观察 24 小时，确认 checkpoint、cloud sync 和日媒体同步持续运行，不再出现 alarm 重建饥饿或 exhausted 告警风暴。
- 继续核对网页原始账本与日/小时/目标统计一致，存储压力和 pending outbox 持续收敛。
- 本次不修正历史云端媒体统计；历史异常仍按既有审计口径处理。

## 发布结论

`PASS_WITH_PRODUCTION_OBSERVATION`。`1.7.24` 已提交并推送到 `master`，家长控制台与内部自托管更新源部署完成，生产回读一致。设备实际升级和连续 24 小时稳定性尚需后续只读核对，不将其提前记为通过。
