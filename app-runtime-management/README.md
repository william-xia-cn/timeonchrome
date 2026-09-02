# App Runtime Management

App Runtime Management 是 TimeOnChrome 的跨平台前台应用使用时间能力。macOS 与 Windows 是同一产品的两个原生 Agent，共享事实模型、Usage Segment、上传协议和 Runtime Worker/D1；Santa Native App Control 继续独立负责应用发现、审核与阻止。

## 当前实现状态

- Windows：1.x 的 WinEvent、idle、session/power、SQLite/outbox、CurrentUser DPAPI、WPF Setup 与 per-user MSI 已实现并作为兼容基线。D-080 的 2.0 本地实现已升级为 LocalSystem RuntimeService + 每交互式会话 Session Agent + ProgramData/LocalMachine DPAPI + WiX 7 per-machine 安装；内部 MSI 尚未签名，不能称为公开发布产品。
- Backend：v1 Child-scoped 设备闭环保留兼容；D-080 v2 新增 Account-scoped machine、默认 Child、逐本地用户 assignment、版本化策略/ACK、tamper 健康和单次卸载码。Runtime/Santa 身份、表、密钥和协议继续隔离。
- macOS：Phase 1 Core/Agent 骨架；真实事件、SQLite 与上传尚未实现。
- Accounting Phase A：共享 schema v2、Windows/macOS 纯状态机、确定性 SHA-256、黄金向量、Windows 原子 SQLite ledger/outbox 和 Runtime Worker 向后兼容 API 已完成；主 `UsageSegment` 在同一用户会话与 clock epoch 内按 foreground/PiP 区间并集计算权威使用时长，独立 `MediaSegment` 可重叠直接求和但不进主时长或 quota。统一参数是 idle 180s、checkpoint 60s、estimated cap 30s 和 reorder window 500ms。Runtime `0003`/`0004` 与 Worker 已发布；macOS `swift test` 待 macOS 13+ 验证。
- 家长页统计读取：`/v2/module/usage` 保留 v1 与旧 v2 小时聚合历史；`/v2/module/accounting` 提供 accounting v2 的权威区间并集、小时 buckets 与应用排行。页面合并两个互不重叠的来源，不把辅助媒体 Segment 计入总使用时间，也不得在 accounting v2 已上传时误报“暂无使用记录”。
- 部署：Guardian `024`、Runtime/Guardian Worker 与账户级 `/app-runtime/` Pages 已于 2026-09-02 发布；历史 2.0.0/2.0.1/2.0.2/2.0.3 对象保持不可变。2.0.3 已完成机器级安装，2.0.4 修正控制管道身份传递并增加常驻 loop 日志与退避恢复。2.0.5 修正首次用户上报未推进策略版本导致 Session Agent 不启动、WTS 用户名 ANSI/Unicode 解码错误及 accounting v2 已上传但页面误显示为零；2.0.6 将 Setup 改为受工作区约束的响应式窗口、可垂直滚动主内容和固定操作栏，避免高 DPI 下裁切卸载表单，William 已原地升级且 R2 latest 已切换 2.0.6。生产 Runtime Worker 版本保持 `9f24691d-5993-4c48-a8ae-557f77bbbdc9`，Pages deployment 保持 `a281c6e5`。2.x 下载路由必须从版本 manifest 选择 Burn bootstrapper，manifest 缺失或非法时 fail closed，绝不能回退 MSI。所有内部包均未签名，保持 `BLOCKED_BY_AUTHENTICODE_SIGNING`。

## Windows 开发命令

```powershell
dotnet restore agents/windows/TimeOnChrome.AppRuntime.sln
dotnet test agents/windows/TimeOnChrome.AppRuntime.sln --configuration Release
dotnet publish agents/windows/src/TimeOnChrome.AppRuntime.Agent/TimeOnChrome.AppRuntime.Agent.csproj --configuration Release
pwsh installer/windows/build.ps1 -Version 2.0.6
```

面向家长和普通 Windows 用户的正式流程不使用 CLI：家长在 `/app-runtime/` 为当前孩子生成一次性配对码，安装后在 Setup 窗口输入配对码。服务器地址由安装包固定为产品 Runtime endpoint；credential 保存到当前用户 LocalAppData，并使用当前用户 DPAPI 保护。

Setup 采用未配对、连接中、等待首次同步、在线和连接异常/需要重新配对的明确状态。enrollment 完成只表示本地绑定已保存；Agent 首次 heartbeat 写入不含凭据的本地健康快照后，Setup 才显示在线。已绑定状态锁定配对输入并提供“完成并关闭”，关闭 Setup 不停止 Agent；同一当前用户只允许一个 Setup 实例。

1.x MSI 保留为 per-user 历史兼容。2.x 使用新的 machine-scope UpgradeCode 和 per-machine MSI，安装到 Program Files，Service 数据位于只允许 SYSTEM/Administrators 访问的 ACL 保护 ProgramData。Burn bootstrapper 先以 elevated machine probe 扫描除当前交互式用户外的真实 profile，发现其他用户仍有 1.x credential/已加载启动项时列出本机账户并停止；随后才在启动安装器的原交互式用户上下文确认当前用户 outbox、读取 CurrentUser DPAPI、retire 旧 token、移除精确 HKCU 启动项、卸载旧 per-user MSI 并保留旧 SQLite 为 legacy 证据；最后安装 per-machine MSI 并要求重配机器一次。任一阶段权限不足均 fail closed。链内 MSI 由自己的 MajorUpgrade 管理并对 Burn 标记为 permanent；Bundle/MSI 的“程序和功能”删除入口均隐藏，正常卸载只能从 Setup 输入云端一次性卸载码后提升执行。当前内部包未做 Authenticode 签名，发布状态必须保持 `BLOCKED_BY_AUTHENTICODE_SIGNING`。

Windows 2.0.6 本地构建产物位于 `installer/windows/bin/Release/`：`TimeOnChrome-AppRuntime-win-x64.msi` 是 per-machine MSI，`TimeOnChrome-AppRuntime-Setup-win-x64.exe` 是用户应运行的 Burn bootstrapper。migration 使用单文件 self-contained 发布；构建脚本会把最终 EXE 单独复制到临时目录执行 `--package-probe`，实际加载 SQLite 与 CurrentUser DPAPI，失败时阻止 MSI/Burn 生成。通过后脚本在 `artifacts/release/windows/x64/2.0.6/` 生成版本化副本和 manifest，并在 `artifacts/release/windows/x64/latest.json` 生成待发布指针；它不会自动安装、配对、迁移生产数据或发布 R2。

Setup 的主内容区在小工作区或高 DPI 下自动出现垂直滚动条，底部操作栏固定可见；窗口允许缩放并由当前 Windows 工作区限制初始和最大尺寸。展开卸载面板会自动滚动到一次性卸载码输入与授权按钮，但不会生成代码、自动提交或绕过管理员提升。

家长页面手动刷新会重新获取 Child-scoped module token；只读加载最多进行一次安全重试，写操作不对未知网络结果自动重放。页面不直接显示浏览器原始 `Failed to fetch`。

## 内部发布路径

- manifest：`windows/x64/latest.json`
- Burn：`windows/x64/<version>/TimeOnChrome-AppRuntime-Setup-win-x64-<version>.exe`
- MSI：`windows/x64/<version>/TimeOnChrome-AppRuntime-win-x64-<version>.msi`
- API：`GET /v1/releases/windows/x64/latest` 与 `GET /v1/releases/windows/x64/:version/installer`

Burn、MSI 与 SHA-256 必须上传独立 `timeonchrome-app-runtime-releases` R2 后再回读校验；Pages 不保存大二进制。2.0 起用户入口必须分发 Burn bootstrapper，不得以直链 MSI 绕过 migration preflight。版本文件使用 immutable cache，latest manifest 使用短缓存。

内部 `2.0.6` Burn 为 118,513,641 bytes、SHA-256 `2e78fe219dbf51c1df1d699b6776f3f9047069dcee2927ae10c575cbae7808f7`；MSI 为 60,194,894 bytes、SHA-256 `d0b6a18f354d965358e4cfd38880e0f6e8b64243143510aaa3f8a7b94468d7c4`。生产 R2、Worker 版本下载与 latest read model 已回读一致。

已发布的内部 `1.0.0` MSI 为 60,139,945 bytes，SHA-256 `847544be830979615f865667a09c690160b42381142a96cdf7174d09ff216c60`。内部 `1.0.1` 为 60,144,152 bytes，SHA-256 `13b8bb04607f019acf7a9a5e68fa87f63f8075e8a3d4d4da47ddc885b635fee7`；William 账户已完成从 1.0.0 到 1.0.1 的原地升级，并验证 credential、设备隔离 SQLite、设备身份与登录启动项保留。版本化 R2 与生产 Worker 下载回读均一致，Pages deployment 为 `e25c319e`，日/周范围与小时标签按北京时间确定性计算；两版 manifest 状态均为 `BLOCKED_BY_AUTHENTICODE_SIGNING`。

## Backend 本地验证

```powershell
npm --prefix backend install
npm --prefix backend run wrangler:types
npm --prefix backend run typecheck
npm --prefix backend test
npm --prefix backend run dry-run
```

复制 `.dev.vars.example` 为未跟踪的 `.dev.vars`，配置测试用 Guardian Runtime 公钥。测试使用隔离的本地 D1，不访问远端数据库。

## 安全边界

- 不记录或上传 executable path、窗口标题、URL、键鼠内容或屏幕数据。
- 不在日志中输出 enrollment code、device token 或本机 executable path。
- Runtime 不读取 Santa enrollment、MachineID、策略数据库、事件队列、同步协议、表或凭据。
- 本目录的 `0001_runtime_backend.sql` 已按 D-078 授权应用到独立 Runtime D1；`0002` 已在远端 enrollment/device/segment 全部为 0 后应用。
- Runtime ES256 key pair 与 Santa 完全独立；Guardian 只保存私钥，Runtime Worker 只保存公钥。
- 旧 `ADMIN_API_KEY` 已无路由或代码消费者；在真实 Guardian → Runtime module-token 成功链路验证前，生产 secret 暂不删除。
