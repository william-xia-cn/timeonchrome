# App Runtime Management

App Runtime Management 是 TimeOnChrome 的跨平台前台应用使用时间能力。macOS 与 Windows 是同一产品的两个原生 Agent，共享事实模型、Usage Segment、上传协议和 Runtime Worker/D1；Santa Native App Control 继续独立负责应用发现、审核与阻止。

## 当前实现状态

- Windows：Phase 2 端到端实现，包括 WinEvent、idle、session/power、周期快照、SQLite ledger/outbox、DPAPI credential、HTTP upload 与 HKCU 登录启动管理。
- Backend：共享 Runtime Worker、独立 enrollment/device token、D1 immutable segments、幂等 upload 与逐项 ACK。
- macOS：Phase 1 Core/Agent 骨架；真实事件、SQLite 与上传尚未实现。
- 部署：共享 Runtime Worker 与独立 Runtime D1 已完成生产 bootstrap；服务端点为 `https://timeonchrome-app-runtime-api.william-xia-cn.workers.dev`。当前未创建真实 enrollment/device/segment，也未安装 Agent。

## Windows 开发命令

```powershell
dotnet restore agents/windows/TimeOnChrome.AppRuntime.sln
dotnet test agents/windows/TimeOnChrome.AppRuntime.sln --configuration Release
dotnet publish agents/windows/src/TimeOnChrome.AppRuntime.Agent/TimeOnChrome.AppRuntime.Agent.csproj --configuration Release
```

Agent CLI：

```powershell
TimeOnChrome.AppRuntime.Agent.exe enroll --server https://runtime.example.test
TimeOnChrome.AppRuntime.Agent.exe run
TimeOnChrome.AppRuntime.Agent.exe status
TimeOnChrome.AppRuntime.Agent.exe install-startup
TimeOnChrome.AppRuntime.Agent.exe uninstall-startup
```

`enroll` 默认交互读取一次性 code，避免把 code 固定写入脚本。credential 保存到当前用户 LocalAppData，并使用当前用户 DPAPI 保护。`install-startup` 只写当前用户 HKCU Run，不创建 Session 0 service。

## Backend 本地验证

```powershell
npm --prefix backend install
npm --prefix backend run wrangler:types
npm --prefix backend run typecheck
npm --prefix backend test
npm --prefix backend run dry-run
```

复制 `.dev.vars.example` 为未跟踪的 `.dev.vars`，设置本地 `ADMIN_API_KEY`。测试使用隔离的本地 D1，不访问远端数据库。

## 安全边界

- 不记录或上传 executable path、窗口标题、URL、键鼠内容或屏幕数据。
- 不在日志中输出 enrollment code、device token 或本机 executable path。
- Runtime 不读取 Santa enrollment、MachineID、策略数据库、事件队列、同步协议、表或凭据。
- 本目录的 `0001_runtime_backend.sql` 已按 D-078 授权应用到独立 Runtime D1；后续 migration 仍必须获得单独部署授权。
