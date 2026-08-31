# App Runtime Management

App Runtime Management 是 TimeOnChrome 的跨平台前台应用使用时间能力。macOS 与 Windows 是同一产品的两个原生 Agent，共享事实模型、Usage Segment、上传协议和 Runtime Worker/D1；Santa Native App Control 继续独立负责应用发现、审核与阻止。

## 当前实现状态

- Windows：底层 WinEvent、idle、session/power、周期快照、SQLite ledger/outbox、DPAPI credential 与 HTTP upload 已实现；WPF Setup、per-user MSI 和产品化吊销闭环正在实现，尚不能称为可公开安装产品。
- Backend：D-079 Child-scoped module token、一次性配对、设备健康/吊销/重新配对、immutable segments、小时聚合和 lifecycle 删除已进入实现；旧管理员密钥/opaque `subjectId` 流程已从产品接口移除。
- macOS：Phase 1 Core/Agent 骨架；真实事件、SQLite 与上传尚未实现。
- 部署：共享 Runtime Worker 与独立 Runtime D1 已完成生产 bootstrap；服务端点为 `https://timeonchrome-app-runtime-api.william-xia-cn.workers.dev`。当前未创建真实 enrollment/device/segment，也未安装 Agent。

## Windows 开发命令

```powershell
dotnet restore agents/windows/TimeOnChrome.AppRuntime.sln
dotnet test agents/windows/TimeOnChrome.AppRuntime.sln --configuration Release
dotnet publish agents/windows/src/TimeOnChrome.AppRuntime.Agent/TimeOnChrome.AppRuntime.Agent.csproj --configuration Release
pwsh installer/windows/build.ps1
```

面向家长和普通 Windows 用户的正式流程不使用 CLI：家长在 `/app-runtime/` 为当前孩子生成一次性配对码，安装后在 Setup 窗口输入配对码。服务器地址由安装包固定为产品 Runtime endpoint；credential 保存到当前用户 LocalAppData，并使用当前用户 DPAPI 保护。

MSI 采用 WiX 7 per-user 安装，目标目录为当前用户 LocalAppData，不要求管理员权限；提供开始菜单入口、HKCU 登录启动、MajorUpgrade 和卸载。当前内部 MSI 未做 Authenticode 签名，发布状态必须保持 `BLOCKED_BY_AUTHENTICODE_SIGNING`。

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
- 本目录的 `0001_runtime_backend.sql` 已按 D-078 授权应用到独立 Runtime D1；`0002` 必须在重新确认现有业务表为空后才可部署。
- Runtime ES256 key pair 与 Santa 完全独立；Guardian 只保存私钥，Runtime Worker 只保存公钥。
