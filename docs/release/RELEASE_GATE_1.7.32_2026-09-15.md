# TimeOnChrome 1.7.32 内部托管发布记录

## 发布身份

- 渠道：T.xia / P.xia 内部 managed 自托管渠道，不进入 Chrome Web Store。
- 源码：`master`，功能提交 `c2841a3`，发布前 HEAD `29168b2`。
- 制品：`dist/self-hosted/timeonchrome-1.7.32.crx`。
- 扩展 ID：`jdcancbiocacabbjdkngadmjpjmkdnih`。
- 大小：418,237 bytes。
- SHA256：`12d8e5417a34a6ec16bcf499dd55298827436adc17ba7e2e8cbf9d7cc994aa9f`。
- 更新站点：deployment `0a3707ac`。

## 门禁结果

| 项目 | 结果 | 证据 |
|---|---|---|
| Preflight | PASS | `master` 与 `origin/master` 无分叉；manifest 为 `1.7.32` |
| Automated tests | PASS | 143 个 unit 文件、`tests/run-all.js`、API 103/103、Extension E2E 15/15、TypeScript 与扩展根目录检查通过 |
| UI verification | PASS | Pages / Admin 桌面与手机截图验收通过 |
| Artifact verification | PASS | 原签名密钥派生稳定 ID；managed channel 16/16；权限、health probe 和隐私文件排除边界通过 |
| Update host | PASS | 稳定域名与 deployment 域名的 feed、CRX、SHA256 均 HTTP 200；版本、ID、大小和哈希一致 |
| Evidence privacy | PASS | 未记录签名密钥位置/内容、token、账号、孩子或设备标识 |

## 发布范围

- 包含 D-081 系统分类一致性、可追溯归属修正和 D-082 自主度配置。
- Guardian Worker Version ID：`09c2b1c4-b4d4-4de8-8e05-d51f36cdd606`。
- 控制台 Pages deployment：`7455c3ad`。
- 不执行新的 D1 migration，不修改 profile，不处理 Chrome Web Store。

## 已知风险与观察

- `cg.163.com idleStateChanged` 网页少记风险继续为 P0 / Deferred，不视为已解决。
- 19009 秒历史差额保持独立未解决，不通过本次发布改写或清空。
- T.xia / P.xia 实际升级、组合配置 revision 刷新、V2 单账/总账/对账形成需在发布后观察。
- 上述风险已由 Product Owner 明确批准随内部前向版本发布，不等同于 PASS。

## 结论

`APPROVED_WITH_KNOWN_P0_RISK / INTERNAL MANAGED RELEASE`。线上 feed 已指向 `1.7.32`，终端升级与 24 小时运行证据属于发布后验收。
