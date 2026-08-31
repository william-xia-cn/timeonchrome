# App Runtime Management

App Runtime Management 是 TimeOnChrome 的跨平台前台应用使用时间能力。macOS 与 Windows 是同一产品的两个原生 Agent，共享事实模型、Usage Segment、上传协议和 Runtime Worker/D1；Santa Native App Control 继续独立负责应用发现、审核与阻止。

## 当前实现状态

- Windows：底层 WinEvent、idle、session/power、周期快照、SQLite ledger/outbox、DPAPI credential、HTTP upload、WPF Setup 与 WiX 7 per-user MSI 已实现；内部 MSI 尚未签名，不能称为公开发布产品。
- Backend：D-079 Child-scoped module token、一次性配对、设备健康/吊销/重新配对、immutable segments、小时聚合和 lifecycle 删除已实现；旧管理员密钥/opaque `subjectId` 流程已从产品接口和代码移除。
- macOS：Phase 1 Core/Agent 骨架；真实事件、SQLite 与上传尚未实现。
- 部署：Runtime `0002`、Guardian `023`、独立 ES256 secrets、Runtime/Guardian Worker、R2 installer 与 `/app-runtime/` Pages 已完成内部生产基础部署；服务端点为 `https://timeonchrome-app-runtime-api.william-xia-cn.workers.dev`。当前未创建真实 enrollment/device/segment，也未安装或配对 Agent。

## Windows 开发命令

```powershell
dotnet restore agents/windows/TimeOnChrome.AppRuntime.sln
dotnet test agents/windows/TimeOnChrome.AppRuntime.sln --configuration Release
dotnet publish agents/windows/src/TimeOnChrome.AppRuntime.Agent/TimeOnChrome.AppRuntime.Agent.csproj --configuration Release
pwsh installer/windows/build.ps1
```

面向家长和普通 Windows 用户的正式流程不使用 CLI：家长在 `/app-runtime/` 为当前孩子生成一次性配对码，安装后在 Setup 窗口输入配对码。服务器地址由安装包固定为产品 Runtime endpoint；credential 保存到当前用户 LocalAppData，并使用当前用户 DPAPI 保护。

MSI 采用 WiX 7 per-user 安装，目标目录为当前用户 LocalAppData，不要求管理员权限；提供开始菜单入口、HKCU 登录启动、MajorUpgrade 和卸载。当前内部 MSI 未做 Authenticode 签名，发布状态必须保持 `BLOCKED_BY_AUTHENTICODE_SIGNING`。

## 内部发布路径

- manifest：`windows/x64/latest.json`
- MSI：`windows/x64/<version>/TimeOnChrome-AppRuntime-win-x64-<version>.msi`
- API：`GET /v1/releases/windows/x64/latest` 与 `GET /v1/releases/windows/x64/:version/installer`

MSI 与 SHA-256 必须上传独立 `timeonchrome-app-runtime-releases` R2 后再回读校验；Pages 不保存大二进制。版本 MSI 使用 immutable cache，latest manifest 使用短缓存。

当前内部 `1.0.0` MSI 为 60,139,945 bytes，SHA-256 `847544be830979615f865667a09c690160b42381142a96cdf7174d09ff216c60`，manifest 状态为 `BLOCKED_BY_AUTHENTICODE_SIGNING`。干净 Windows 测试账号的安装、登录启动、升级、卸载与首次真实配对仍是待验证项。

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
