# App Runtime Cloudflare 发布门禁（2026-09-02）

## 发布标识

- 分支：`codex/macos-app-management-v1`
- 候选提交：`591a7dd` + 当前生成类型/发布证据提交
- 范围：Runtime D1 `0003`/`0004`、Guardian D1 `024`、Runtime/Guardian Worker、Pages、R2 2.0.0 immutable artifacts
- 生产数据边界：不创建真实配对/采集数据，不改写历史 Segment，不执行 William 真机升级

## Gate 结果

| Gate | 结果 | 证据 |
|---|---|---|
| Preflight | PASS | Wrangler 已登录；独立 ES256 secret 名称与 service binding 存在；两个 D1 Time Travel 恢复点已在执行时记录但不写入仓库 |
| Runtime tests | PASS | Worker/D1 13/13；Windows .NET 37/37；typecheck、generated binding types、Wrangler dry-run 通过 |
| Guardian tests | PASS | Worker logic 56/56、TypeScript typecheck、Wrangler dry-run 通过 |
| Pages tests/parity | PASS | 网络恢复 4/4、北京时间 6/6；production deployment 六个 Runtime 资产回读哈希一致 |
| Runtime D1 | PASS | `0003`/`0004` 已应用；旧 v1 设备/Segment 计数保持 1/130；新 v2 machine/media 表为空 |
| Runtime Worker | PASS | Version `af74e867-5fe1-48aa-b264-11e0892bebd3`；health 200；v2/accounting 未认证均 401 |
| Guardian D1/Worker | PASS WITH RISK | `024` 视图存在；Worker `70b27ad3-7ae7-4cab-b9e0-b04def8e495b`；health 200；account token 未认证 401。Guardian historical migration tracking 未与已执行 schema 对齐，`024` 因此使用单文件 additive execute |
| Pages | PASS | Production deployment `1edd8561-c990-4e6e-aa4d-b13b457cd37d` |
| R2 immutable 2.0.0 | PASS | Burn 61,110,476 bytes / SHA-256 `32a7eda83a4940948faeb034868bb0545f5984692becdb3a5187de0ba749d202`；MSI 60,572,816 bytes / SHA-256 `0cce622d420c6513982832005f9d02e5193a8be84171474b2cf9bb5875685e6b`；production R2 回读一致 |
| R2 latest 2.0.0 | BLOCKED | 当前 Worker `/installer` 路由硬编码 MSI；切换会绕过 Burn 的 1.x migration preflight。`latest.json` 保持 1.0.1 |
| Authenticated account flow | DEFERRED | 未使用真实家庭 session 创建 token、配对码或数据；只执行 fail-closed smoke |
| Evidence privacy | PASS | 本报告不含 account/Child/device 标识、token、cookie、凭据或私人截图 |

## Cloudflare 额度诊断

- Runtime D1 24h：1,583 rows read / 974 rows written，不是额度来源。
- Guardian D1 24h：28,134,760 rows read / 53,864 rows written。
- D1 Insights 前两条均来自 `device_access_audit_v1` retention：全局 14 日删除读取 15,004,205 行，逐设备保留 1,000 条读取 13,010,483 行。
- 代码根因是每次 `recordDeviceAccessAudit()` 后都执行两条 cleanup；这是请求热路径的重复扫描，不是 Runtime 2.0/Accounting 查询造成。
- 当前只读 D1 探针成功，执行时未观察到正在生效的硬拒绝；但该访问模式会持续制造额度风险，必须作为独立 P0 修复。

## Plan Conformance Audit

| 分类 | 结果 |
|---|---|
| Matched | Runtime/Guardian additive schema、两个 Worker、Pages、R2 immutable artifacts、回读验证、fail-closed 与额度根因检查均完成 |
| Deviated | 首次 R2 put 误落本地模拟存储，输出发现后立即用 `--remote` 纠正；无生产副作用 |
| Missing | 2.0.0 `latest.json` 切换被 Burn/MSI 下载语义阻塞；有效账号端到端 smoke、macOS test 与 William 真机升级未执行 |
| Extra | 增加 D1 Insights 定量诊断与 Guardian migration tracking 风险记录；均为只读发布证据 |

## 发布结论

`BLOCKED`（仅针对 2.0.0 用户可下载 latest）。后台 schema/API、两个 Worker、账户级 Pages 和 R2 immutable 2.0.0 已上线；在下载路由分发 Burn bootstrapper 前，不得称 2.0.0 Cloudflare 用户闭环已完全发布。
