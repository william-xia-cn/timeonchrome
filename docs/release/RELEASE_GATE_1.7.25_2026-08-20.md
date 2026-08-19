# 1.7.25 内部发布门禁报告

## 元数据

- 报告 ID：`REL-1.7.25-20260820`
- 日期：2026-08-20
- 发布目标：T.xia / P.xia 内部自托管扩展通道
- 候选版本：`1.7.25`
- 候选分支：`master`
- 稳定扩展 ID：`jdcancbiocacabbjdkngadmjpjmkdnih`
- 状态：Release Candidate / Pending Deployment

## 执行范围

- 发布 session storage 硬门、诊断淘汰和 durable timing session 隔离修复。
- 发布 managed Native Messaging 本地健康心跳与健康探测页。
- 使用原签名密钥生成稳定 ID CRX，更新内部自托管 feed 并部署更新站点。
- 不部署 `guardian-api`，不写 D1，不修改 profile，不上传或提交 Chrome Web Store。

## 门禁结果

| 门禁 | 结果 | 证据 |
|---|---|---|
| Preflight | PASS | `master` 与 `origin/master` 基线一致；manifest 为 `1.7.25`；范围已确认 |
| Focused tests | PASS | Local Guardian `54/54`、Health Probe `7/7`、Session Storage Budget `12/12`、Timing Trace Budget `6/6`、Managed Package Boundary `12/12` |
| Full regression | PASS | Worker API `103/103`、duration-flow `53/53`、extension E2E `14/14`；完整 `tests/run-all.js` 通过 |
| Type/root checks | PASS | `npm run typecheck`、`npm run check:extension-root`、`git diff --check` 通过 |
| Native protocol smoke | PASS | unpacked managed extension + 临时 Host 收到 3 条 heartbeat、2 条 probe；60 秒周期、断开降级、恢复和脱敏通过 |
| Production Guardian Host | BLOCKED_BY_NATIVE_HOST | 外部守护项目尚未在生产设备安装和注册 Host；扩展端会静默降级 |
| Artifact verification | PENDING | 待稳定 ID 签名打包后记录 CRX 大小和 SHA256 |
| Production update host | PENDING | 待部署后回读 update.xml、SHA256SUMS 与 CRX |
| Evidence privacy | PASS | 未记录密钥、token、Cookie、账号、profile/device 标识或浏览历史 |

## 已知风险

- 本仓库不包含 `com.timeonchrome.guardian` 生产 Host。仅发布扩展不会让本地守护心跳立即生效；Host 缺失时扩展必须继续正常计时、拦截和云同步。
- 生产双 Chrome Profile、断网和守护程序 fail-closed 联合验收仍由外部守护项目完成，不将其提前记为通过。

## 发布后观察

- 确认 T.xia / P.xia 升级到 `1.7.25`。
- 连续观察网页落账、checkpoint、媒体账本和云同步，确认 session storage 不再引发 timing dispatch 失败。
- 安装生产 Guardian Host 后验证稳定扩展 ID、Profile UUID、60 秒心跳与 probe 自愈。
