# 1.7.26 内部发布门禁报告

## 元数据

- 报告 ID：`REL-1.7.26-20260827`
- 日期：2026-08-27
- 发布目标：T.xia / P.xia 内部 managed 自托管扩展通道
- 生产代码提交：`de5b1d3`
- CRX：`dist/self-hosted/timeonchrome-1.7.26.crx`
- CRX 大小：359,678 bytes
- SHA256：`cc094a21dfcedb54ba609741738a4457263563b9b6c98575bb5329e001566594`
- 稳定扩展 ID：`jdcancbiocacabbjdkngadmjpjmkdnih`
- Worker version：`c988c31f-ba0c-495d-8b01-a2f235a4535c`
- 控制台 Pages deployment：`b8c011a6`
- 更新站点 deployment：`8a795c47`
- 状态：Deployed with P0 Native App Regression / Remediation In Progress

## 发布范围

- 显式 `timeQuota.weekly.restMinutes`、周用量与锁定状态，以及 Pages 周配额管理界面。
- Content DOM 强媒体证据与 `tab.audible` 弱证据分级、前后台媒体焦点约束及网页账隔离。
- open shadow root 媒体发现、90 秒证据新鲜度和相关测试。
- 移动端控制台布局基线。
- 不包含新的 Native App 基础设施、D1 migration、profile 数据修改、历史账重写或 Chrome Web Store 提交；既有 Native App 页面与 Guardian bridge 本应保持不变，但首次部署错误将其排除。

## 门禁结果

| 门禁 | 结果 | 证据 |
|---|---|---|
| 生产范围隔离 | FAIL / REMEDIATING | `de5b1d3` 错误排除了已在生产使用的 Native App 页面和 Guardian bridge；独立 Worker、D1 与 secrets 未丢失，采用前向恢复 |
| Unit / type / root | PASS | 生产 master 113 个 unit 文件通过；`npm run typecheck`、`npm run check:extension-root` 通过 |
| 完整回归 | PASS | Worker API `103/103`、duration-flow `53/53`、扩展 E2E `14/14` |
| Pages 视觉门 | PASS | 390px 手机与桌面布局 Playwright `1/1`，无页面横向溢出 |
| Artifact | PASS | 原密钥派生稳定 ID；managed marker、`nativeMessaging`、health probe 存在；废弃隐私页面未入包 |
| Worker | PASS | dry-run 绑定校验通过；部署后生产 API smoke `103/103` |
| Pages | FAIL / REMEDIATING | 主控制台与 `/native-apps/` 都返回 HTTP 200，但后者实际回退为主控制台；首次回读只检查状态码，未检查 Native 页面专有内容 |
| Update host | PASS | 稳定与 deployment feed 均 HTTP 200；版本、扩展 ID、SHA 文件正确；远端 CRX 哈希与本地一致 |
| Evidence privacy | PASS | 发布记录未包含密钥、token、Cookie、账号、profile/device ID 或浏览历史 |

## 已知风险

- `cg.163.com` 等 Canvas/WebRTC 流游戏缺少 DOM 视频事实时，手柄操作、长过场或超过 90 秒无系统活动仍可能少记网页账；本版优先消除窗口失焦后的长时间多记。
- `1.7.25` 已产生的 Bilibili / `cg.163.com` 媒体分类不自动改写，仍只作历史审计。
- T.xia / P.xia 的自动升级和真实站点媒体分类尚待生产观察，不能以构建与部署成功替代终端验收。
- 外部 `com.timeonchrome.guardian` Host 不在本仓库，本次没有重新验证其生产安装状态；本地心跳门禁继续按外部项目状态管理。

## 发布结论

`REMEDIATION_IN_PROGRESS`。扩展、CRX、update host、周配额和媒体修复保持有效；Native App 页面与 Guardian bridge 回归必须前向恢复并重新完成内容级生产验证后，才能关闭本报告。
