# 1.7.22 内部发布门禁报告

## 元数据

- 报告 ID：`REL-1.7.22-20260806`
- 日期：2026-08-06
- 发布目标：T.xia / P.xia 内部自托管扩展通道
- 候选版本：`1.7.22`
- 候选分支：`master`
- 候选提交：`0308a22`
- CRX：`dist/self-hosted/timeonchrome-1.7.22.crx`
- SHA256：`5a7ba40fc7681c92dec4245465d93c8fe414f4a0fd00b8c947d36a78160172da`
- Prepared by：releaseMg
- 状态：Final / 已部署，等待发布后观察

## 执行范围

- 允许提交、推送、签名打包和部署内部自托管更新站点。
- 不修改 Worker API、D1 schema、profile 配置或历史统计。
- 不执行 Chrome Web Store 上传或最终提交审核。

## 门禁结果

| 门禁 | 结果 | 证据 |
|---|---|---|
| Preflight | PASS | 版本、分支、变更范围和远端同步状态已核对 |
| Artifact verification | PASS | 扩展 ID、版本、生产 update URL、CRX SHA256 一致 |
| Automated tests | PASS | `node tests/run-all.js`；核心、API 103/103、集成 53/53、E2E 14/14 均通过 |
| Documentation consistency | PASS | DESIGN、DECISIONS、TASK_BOARD、CHANGELOG 与实现一致 |
| Production update host | PASS | `update.xml`、`SHA256SUMS.txt`、CRX 回读均 HTTP 200，线上 CRX 哈希匹配 |
| Evidence privacy | PASS | 未记录 token、cookie、孩子标识、设备标识、浏览历史或私有页面截图 |

## 延后验收

| 项目 | 状态 | 原因 | 批准人 |
|---|---|---|---|
| T.xia / P.xia 24 小时生产观察 | DEFERRED / 发布后验收 | 本次发布用于在真实设备验证 P0 修复 | Product Owner |
| 历史异常媒体账修正 | DEFERRED | 本版本只修复后续落账，不改历史 D1 数据 | Product Owner |
| Chrome Web Store 提审 | BLOCKED | 未收到精确授权短语 `ReleaseMg: submit now` | Product Owner |

## 已知风险

- 更新会保留旧版 `chrome.storage.local`；一次性迁移、积压分批上传和存储降压需在真实设备上观察。
- 24 小时内需重点核对 `QuotaBytes`、`settlement_failed`、`timing_dispatch_failed`、pending segment 数量、网页四层统计一致性和陈旧媒体长段。

## 发布结论

`READY FOR INTERNAL DEPLOYMENT / DEPLOYED`。公开 CWS 发布不在本次授权范围内。