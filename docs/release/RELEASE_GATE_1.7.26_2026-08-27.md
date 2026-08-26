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
- 状态：Deployed / Production Observation

## 发布范围

- 显式 `timeQuota.weekly.restMinutes`、周用量与锁定状态，以及 Pages 周配额管理界面。
- Content DOM 强媒体证据与 `tab.audible` 弱证据分级、前后台媒体焦点约束及网页账隔离。
- open shadow root 媒体发现、90 秒证据新鲜度和相关测试。
- 移动端控制台布局基线。
- 不包含 Native App Control 基础设施、D1 migration、profile 数据修改、历史账重写或 Chrome Web Store 提交。

## 门禁结果

| 门禁 | 结果 | 证据 |
|---|---|---|
| 生产范围隔离 | PASS | `origin/master...de5b1d3` 不含 `native-app-control/`、`pages/native-apps/`、Native bridge 或 migration 022 |
| Unit / type / root | PASS | 生产 master 113 个 unit 文件通过；`npm run typecheck`、`npm run check:extension-root` 通过 |
| 完整回归 | PASS | Worker API `103/103`、duration-flow `53/53`、扩展 E2E `14/14` |
| Pages 视觉门 | PASS | 390px 手机与桌面布局 Playwright `1/1`，无页面横向溢出 |
| Artifact | PASS | 原密钥派生稳定 ID；managed marker、`nativeMessaging`、health probe 存在；废弃隐私页面未入包 |
| Worker | PASS | dry-run 绑定校验通过；部署后生产 API smoke `103/103` |
| Pages | PASS | 控制台稳定域名与 deployment 域名均 HTTP 200 |
| Update host | PASS | 稳定与 deployment feed 均 HTTP 200；版本、扩展 ID、SHA 文件正确；远端 CRX 哈希与本地一致 |
| Evidence privacy | PASS | 发布记录未包含密钥、token、Cookie、账号、profile/device ID 或浏览历史 |

## 已知风险

- `cg.163.com` 等 Canvas/WebRTC 流游戏缺少 DOM 视频事实时，手柄操作、长过场或超过 90 秒无系统活动仍可能少记网页账；本版优先消除窗口失焦后的长时间多记。
- `1.7.25` 已产生的 Bilibili / `cg.163.com` 媒体分类不自动改写，仍只作历史审计。
- T.xia / P.xia 的自动升级和真实站点媒体分类尚待生产观察，不能以构建与部署成功替代终端验收。
- 外部 `com.timeonchrome.guardian` Host 不在本仓库，本次没有重新验证其生产安装状态；本地心跳门禁继续按外部项目状态管理。

## 发布结论

`PASS_WITH_PRODUCTION_OBSERVATION`。代码、Worker、控制台 Pages 和内部自托管 managed CRX 已部署并完成线上回读；设备升级、真实媒体对照和流游戏低估风险继续观察。
