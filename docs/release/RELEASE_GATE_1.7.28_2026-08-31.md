# 1.7.28 内部前向止血发布门禁报告

## 元数据

- 报告 ID：`REL-1.7.28-20260831`
- 日期：2026-08-31
- 发布目标：T.xia / P.xia 内部 managed 自托管扩展通道
- 生产源码提交：待提交
- 稳定扩展 ID：`jdcancbiocacabbjdkngadmjpjmkdnih`
- Guardian Worker version：待部署
- CRX：`dist/self-hosted/timeonchrome-1.7.28.crx`
- CRX 大小：待打包
- SHA256：待打包
- 更新站点 deployment：待部署
- 状态：`CANDIDATE / APPROVED_WITH_KNOWN_P0_RISK`

## 发布范围

- D-071：北京时间日/周周期、本地与云端配额事实分离、当前周期重新合成、陈旧锁解除和跨设备 `quota_bucket` 汇总。
- D-072：0 秒小时统计自愈、旧客户端全零 payload no-op、Cancel 伪告警静默和重复云同步错误 incident 收敛。
- 不修改网页 ACTIVE、媒体分类、媒体/usage 大批量上传实现、历史 D1、profile、D1 schema、控制台 Pages 或 Native App 子系统。

## 门禁证据

| 门禁 | 结果 | 证据 |
|---|---|---|
| Plan Conformance | PASS | 已逐项核对 D-071、D-072、版本和发布文档；usage/media 批次上限仍为 200，未混入媒体批量上传修复或其他额外功能 |
| Unit / type / root | PASS | 122 个 unit 文件全部通过；`npm run typecheck`、`npm run check:extension-root`、`git diff --check` 通过 |
| 完整回归 | PASS | `node tests/run-all.js` 通过：API 103/103、Duration flow 53/53、E2E 15/15，其余套件全部通过 |
| Worker | PENDING | 待 dry-run、部署和生产回读 |
| Artifact | PENDING | 待使用原密钥生成并验证稳定 ID managed CRX |
| Update host | PENDING | 待验证稳定域名和 deployment 域名的 feed、CRX 与 SHA256 |
| Evidence privacy | PENDING | 发布证据不得包含密钥、token、账号、profile/device ID 或浏览历史 |

## Plan Conformance Audit

- `Matched`：D-071 配额周期事实、云端 `quota_bucket` 汇总和陈旧锁解除均有实现及回归测试。
- `Matched`：D-072 0 秒小时统计自愈、Worker no-op 兼容、Cancel 伪告警静默和 cloud failure incident 收敛均有实现及回归测试。
- `Matched`：扩展版本已提升为 `1.7.28`，发布范围与风险披露已写入权威文档。
- `Deviated`：无。
- `Missing`：无。
- `Extra`：无。
- 延期项保持不变：usage/media 大批量上传仍使用现有每批 200 条路径，本次未修改其超时、部分写入或 ACK 语义。

## 已知风险与批准边界

- usage/media 大批量上传可能超过 15 秒；Worker 当前逐条执行 D1 查询与写入，可能出现部分写入但终端未 ACK、重复上传和物化延迟。
- T.xia `2026-08-31` 网页与媒体原始账本和日/小时统计尚未收敛，不能视为本次发布已修复。
- `cg.163.com` 在 `idleStateChanged` 边界可能少记网页账，继续保持 P0 / Deferred。
- 确定性 `ALREADY_CLASSIFIED` 网站归类记录仍可能按冷却周期长期重试。
- Product Owner 于 2026-08-31 明确批准以上述风险继续存在为前提，进行仅限 T.xia / P.xia 的内部前向止血发布。风险接受不构成问题关闭、测试通过或 Chrome Web Store 发布批准。

## 发布结论

待测试、提交、Worker 部署、CRX 签名、更新站点部署和生产回读完成后填写。若任一门禁出现新失败，停止发布；如需回滚，使用高于 `1.7.28` 的前向回滚版本，不把 feed 指向较低版本。
