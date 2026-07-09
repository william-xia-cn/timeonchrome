# Pierce Windows TimeOnChrome Policy Keeper

本文是 Windows 版 TimeOnChrome 受管部署方案。它和 macOS policy keeper 的思路一致：

```text
C:\ProgramData\TimeOnChromePolicy\expected-policy.json
        ↓
恢复脚本定期检查并写回
        ↓
HKCU Chrome Policy Registry
        ↓
Chrome 读取
        ↓
chrome://policy 生效
```

Windows 版使用 HKCU，因此只影响运行安装脚本的 Windows 登录用户。它不能只管理同一个 Windows 用户下面的某一个 Chrome Profile。

## 1. 固定参数

```text
目标用户：Pierce.xia@icloud.com
Extension ID：jdcancbiocacabbjdkngadmjpjmkdnih
Update URL：https://timeonchrome-update.pages.dev/timeonchrome/update.xml
Cloud Endpoint：https://guardian-api.william-xia-cn.workers.dev
CRX version：1.7.9
Managed label：Pierce Windows Chrome
```

`managedDeviceToken` 从云端「子用户管理 → 绑定设备」创建、导出或重置。它等同于该终端访问云端的 Device Token，只能保存在目标机器 policy 中，不要提交到 Git、公共文档、聊天或截图。

## 2. 文件清单

安装完成后会有这些文件：

```text
C:\ProgramData\TimeOnChromePolicy\expected-policy.json
C:\ProgramData\TimeOnChromePolicy\restore-timeonchrome-policy.ps1
C:\ProgramData\TimeOnChromePolicy\restore.log
```

还会创建一个 Windows Scheduled Task：

```text
TimeOnChrome Restore Chrome Policy
```

含义：

| 项目 | 作用 |
| --- | --- |
| `expected-policy.json` | 本机期望策略快照，包含 TimeOnChrome 扩展 ID、update URL、cloud endpoint 和目标机器 token |
| `restore-timeonchrome-policy.ps1` | 恢复脚本，按期望状态写回 HKCU Chrome policy |
| `restore.log` | 恢复日志 |
| Scheduled Task | 登录时和每 5 分钟运行恢复脚本 |
| HKCU Chrome policy | Chrome 实际读取的策略位置 |

## 3. 完整安装脚本

安装脚本文件：

```text
docs/deployment/templates/TimeOnChrome-Pierce-HKCU-Keeper.ps1
```

在目标 Windows 用户会话中运行。注意：HKCU 写入的是当前 Windows 用户的 registry hive；不要用另一个管理员账号启动脚本，否则策略会写到那个管理员账号下面，而不是 Pierce 的 Chrome 环境。

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
D:\Opencode\ChromeExtension\timeonchrome\docs\deployment\templates\TimeOnChrome-Pierce-HKCU-Keeper.ps1
```

脚本会提示输入：

```text
Paste managedDeviceToken from TimeOnChrome cloud console:
```

粘贴云端导出的 token 后，脚本会：

- 写入 `C:\ProgramData\TimeOnChromePolicy\expected-policy.json`
- 写入 `restore-timeonchrome-policy.ps1`
- 写入 HKCU `ExtensionSettings`
- 写入 HKCU `3rdparty\extensions\<extensionId>\policy`
- 创建 `TimeOnChrome Restore Chrome Policy` Scheduled Task
- 立即执行一次恢复

## 4. 写入的 Chrome Policy

`ExtensionSettings` 写入：

```text
HKCU\Software\Policies\Google\Chrome
```

值为 compact JSON，语义是：

```json
{
  "jdcancbiocacabbjdkngadmjpjmkdnih": {
    "installation_mode": "force_installed",
    "toolbar_pin": "force_pinned",
    "update_url": "https://timeonchrome-update.pages.dev/timeonchrome/update.xml"
  }
}
```

TimeOnChrome managed storage 写入：

```text
HKCU\Software\Policies\Google\Chrome\3rdparty\extensions\jdcancbiocacabbjdkngadmjpjmkdnih\policy
```

包含：

```json
{
  "enabled": true,
  "deploymentMode": "managed",
  "cloudEndpoint": "https://guardian-api.william-xia-cn.workers.dev",
  "managedDeviceToken": "<运行时输入>",
  "managedDeviceLabel": "Pierce Windows Chrome"
}
```

不得把网站规则、配额、时间段、account token、密码、raw Chrome identity 或完整 URL 写入 policy。

## 5. 验证

重新启动 Chrome，打开：

```text
chrome://policy
```

点击 `Reload policies`，确认：

- `ExtensionSettings` 存在
- 状态为 `OK`
- policy value 包含 `jdcancbiocacabbjdkngadmjpjmkdnih`

再打开：

```text
chrome://extensions
```

确认：

- TimeOnChrome 自动安装
- 扩展 ID 为 `jdcancbiocacabbjdkngadmjpjmkdnih`
- 版本为 `1.7.9`
- 扩展由 policy 安装
- 工具栏被固定

检查本机恢复状态：

```powershell
Get-ScheduledTask -TaskName "TimeOnChrome Restore Chrome Policy"
Get-Content C:\ProgramData\TimeOnChromePolicy\restore.log -Tail 50
reg query HKCU\Software\Policies\Google\Chrome /v ExtensionSettings
reg query HKCU\Software\Policies\Google\Chrome\3rdparty\extensions\jdcancbiocacabbjdkngadmjpjmkdnih\policy
```

打开 TimeOnChrome Popup/Admin，确认：

- activation source 显示 `managed_policy`
- 本地没有 `cloud_device_token` 时，会采用 `managedDeviceToken`
- `/device/config` hydrate profile/device
- 随后执行完整云同步

## 6. 卸载

在同一个 Windows 用户会话中运行：

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
D:\Opencode\ChromeExtension\timeonchrome\docs\deployment\templates\TimeOnChrome-Pierce-HKCU-Keeper.ps1 -Uninstall
```

脚本会：

- 删除 `TimeOnChrome Restore Chrome Policy` Scheduled Task
- 删除 HKCU `ExtensionSettings`
- 删除 TimeOnChrome managed storage policy

然后重启 Chrome，打开 `chrome://policy`，确认相关策略已经消失。

## 7. 边界

- HKCU policy 只影响当前 Windows 登录用户。
- HKCU policy 不能只作用于某一个 Chrome Profile。
- 如果需要管理整台机器所有 Windows 用户，应另行设计 HKLM 版本。
- 如果目标 Windows 用户没有权限写 HKCU Chrome policy 或创建 Scheduled Task，需要在该用户上下文中提升 PowerShell 后重试。
- 填入真实 token 的本地文件不要提交到 Git，不要上传到公共共享位置。
