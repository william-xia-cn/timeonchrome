# 1.7.27 内部发布门禁报告

## 元数据

- 报告 ID：`REL-1.7.27-20260829`
- 日期：2026-08-29
- 发布目标：T.xia / P.xia 内部 managed 自托管扩展通道
- 生产源码提交：`3ca6093`
- 稳定扩展 ID：`jdcancbiocacabbjdkngadmjpjmkdnih`
- CRX：`dist/self-hosted/timeonchrome-1.7.27.crx`
- CRX 大小：373,209 bytes
- SHA256：`10c51a0b6001d5a7eb4eb25eed71466547d63129b6b039b709940c836417d5dd`
- 更新站点 deployment：`39cdad15`
- Deployment URL：`https://39cdad15.timeonchrome-update.pages.dev`
- 状态：`APPROVED_WITH_KNOWN_P0_RISK / PASS_WITH_PRODUCTION_OBSERVATION`

## 发布范围

- 恢复 active tab、窗口未最小化、页面 visible 且 Content 强媒体新鲜时的有限失焦网页续账容错。
- 保持弱 `tab.audible`、后台标签、最小化、隐藏、暂停、结束、锁屏和陈旧证据不得续网页账。
- Bilibili 多 frame 视频证据聚合、媒体前后台重分类和零秒媒体分段过滤。
- 本地 Admin 只读显示休息软限额提醒配置。
- 仅限内部 managed 自托管；不提交 Chrome Web Store，不修改 Worker、D1、profile 或历史账本。

## 门禁证据

| 门禁 | 结果 | 证据 |
|---|---|---|
| Plan Conformance | PASS | 文档、实现与测试逐项核对，无未批准的 Deviated / Extra |
| Unit / type / root | PASS | 全量 unit 通过；`npm run typecheck`、`npm run check:extension-root` 通过 |
| 完整回归 | PASS | Worker API `103/103`、duration-flow `53/53`、扩展 E2E `15/15` |
| Artifact | PASS | 原密钥派生 ID 为 `jdcancbiocacabbjdkngadmjpjmkdnih`；实际 CRX manifest 为 `1.7.27`，managed marker、`nativeMessaging` 和 health probe 存在；指定隐私页面已排除，`core/privacy-consent.js` 保留，包内无仓库、测试或凭据文件 |
| Update host | PASS | 稳定域名与 deployment 域名的 `update.xml`、CRX、`SHA256SUMS.txt` 均 HTTP 200；两处线上 CRX 哈希与本地一致 |
| Evidence privacy | PASS | 发布记录不包含密钥、token、Cookie、账号、profile/device ID 或浏览历史 |

## 已知 P0 风险与批准边界

- `cg.163.com` 真实复验中，网页 session 在 `idleStateChanged` 边界结束时，Content 探针仍显示页面可见、视频播放/可见、解码帧推进和 live MediaStream；该矛盾可能造成网页账少记，根因尚未定位。
- 问题继续保持 P0 / Deferred，不因本次托管而关闭、降级或记为通过；历史账本不修正。
- Product Owner 于 2026-08-29 明确判断当前已观察影响较小、短期难以解决，并批准在完整自动化测试通过后作为已知风险继续本次内部托管。
- 风险接受只适用于 `1.7.27` 的 T.xia / P.xia 内部 managed 通道，不适用于 Chrome Web Store，也不构成后续版本自动豁免。

## 发布结论

最终结论：`APPROVED_WITH_KNOWN_P0_RISK / PASS_WITH_PRODUCTION_OBSERVATION`。`1.7.27` 已进入 T.xia / P.xia 内部 managed 自托管更新通道；设备实际升级和持续运行仍需生产观察。`cg.163.com` 的 `idleStateChanged` P0 保持 Deferred / 未解决，本次发布不构成问题关闭或公开发布批准。
