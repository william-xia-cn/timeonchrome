# Managed DeviceToken 终端策略部署说明

本文是 TimeOnChrome 内部 self-hosted managed channel 的统一部署说明。当前主线不再使用 `tenantId + devicePolicyId` 作为受管恢复主路径；云端和终端只认同一种对象：

```text
Device + DeviceToken
```

Device 可以通过孩子端手动绑定创建，也可以由家长在云端「子用户管理 → 绑定设备」预创建。两种方式生成的都是同一类云端 `devices` 记录，使用同一种 `device_token` 访问 `/device/config`、heartbeat 和同步接口。

## 1. 固定发布参数

```text
Extension ID: jdcancbiocacabbjdkngadmjpjmkdnih
Update URL: https://timeonchrome-update.pages.dev/timeonchrome/update.xml
Cloud Endpoint: https://guardian-api.william-xia-cn.workers.dev
Current CRX version: 1.7.9
```

`managedDeviceToken` 是受管终端的云端访问凭据，等同于这台终端的 Device Token。它只能放在目标机器的 Chrome managed policy 中，不得提交到 Git、公共文档、聊天记录、截图或安装包模板。

## 2. 云端准备 DeviceToken

在家长控制台进入：

```text
子用户管理 → 绑定设备
```

选择一种方式：

1. `创建受管终端`：输入设备名称、平台、浏览器，云端创建新的 Device 并显示 token。
2. `导出 Token`：对已有 bound 设备导出当前 token。
3. `重置 Token`：生成新 token，旧 token 立即失效；目标机器 policy 必须同步更新。

建议设备名称使用能识别物理机器和 Chrome profile 的文字，例如：

```text
Pierce MacBook Chrome
Pierce Windows Chrome
```

如果设备已解绑，不能导出 token。需要重新创建受管终端或重新绑定。

## 3. macOS policy keeper 部署

Pierce 目标机方案仍使用 policy keeper：

```text
/usr/local/timeonchrome-policy/com.google.Chrome.plist
/usr/local/sbin/timeonchrome-restore-chrome-policy.sh
/Library/LaunchDaemons/local.timeonchrome.restore-chrome-policy.plist
/Library/Managed Preferences/com.google.Chrome.plist
```

安装包目录：

```text
docs/deployment/pierce-macos-target/
```

在目标 Mac 上执行：

```bash
cd ~/Downloads/timeonchrome-pierce-macos-target
sudo bash ./install-stage-a.sh
sudo bash ./enable-stage-b-managed-activation.sh
sudo bash ./enable-stage-c-hardening.sh
bash ./validate.sh
```

`enable-stage-b-managed-activation.sh` 会提示粘贴云端导出的 `managedDeviceToken`。脚本会把 token 写入本机 Chrome managed storage，不会把 token 写入仓库模板。

macOS managed storage 只包含：

```text
enabled
deploymentMode = managed
cloudEndpoint
managedDeviceToken
managedDeviceLabel
```

不得把网站规则、配额、时间段、account token、密码、raw Chrome identity 或完整 URL 写入 policy。

## 4. Windows HKCU 部署

Windows 用户级 policy 使用 HKCU，只影响导入 `.reg` 的 Windows 用户。

模板：

```text
docs/deployment/templates/windows-chrome-policy.reg
docs/deployment/templates/TimeOnChrome-Pierce-HKCU.reg
```

导入前，把模板中的：

```text
<MANAGED_DEVICE_TOKEN_FROM_CLOUD>
```

替换为云端导出的 token。填好 token 的 `.reg` 文件只应存在于目标机器或安全临时位置，不得提交 Git。

导入：

```powershell
reg import .\TimeOnChrome-Pierce-HKCU.reg
```

验证：

```powershell
reg query HKCU\Software\Policies\Google\Chrome /v ExtensionSettings
reg query HKCU\Software\Policies\Google\Chrome\3rdparty\extensions\jdcancbiocacabbjdkngadmjpjmkdnih\policy
```

然后打开 Chrome：

```text
chrome://policy
chrome://extensions
```

确认 `ExtensionSettings` 为 OK，扩展 ID 为 `jdcancbiocacabbjdkngadmjpjmkdnih`，版本为 `1.7.9`，且 TimeOnChrome 由 policy 安装。

## 5. 终端启动后的行为

当扩展处于 managed policy activation，且本地没有 `cloud_device_token` 时：

1. 读取 `chrome.storage.managed.managedDeviceToken`。
2. 写入本地 `cloud_device_token`。
3. 调用 `/device/config` hydrate `cloud_profile_id`、`cloud_device_id` 和 profile 名称。
4. 立即执行完整云同步。

如果本地已有 `cloud_device_token`，不会被 policy token 覆盖。需要强制更换 token 时，应先在云端 reset token，再更新目标机器 policy。

## 6. 验收清单

云端：

- 子用户设备列表能看到目标 Device。
- 可以导出或 reset token。
- 连接诊断能看到 heartbeat / config / sync 请求。

终端：

- `chrome://policy` 显示 force install policy。
- `chrome://extensions` 显示 policy 安装，扩展不可被普通用户移除。
- Popup/Admin 显示 `managed_policy` 或受管终端状态。
- 本地无 token 时，扩展采用 `managedDeviceToken` 并同步成功。
- 网站规则、配额、时间段仍来自云端配置，不来自 policy。

update host：

- `https://timeonchrome-update.pages.dev/timeonchrome/update.xml` 返回 HTTPS update feed。
- update.xml 中 version 为 `1.7.9`。
- codebase 指向 `https://timeonchrome-update.pages.dev/timeonchrome/crx/timeonchrome-1.7.9.crx`。
- `SHA256SUMS.txt` 中的 CRX hash 与实际 CRX 一致。

## 7. 回滚和失效

Chrome self-hosted update 不应依赖降级安装。需要回滚时，发布更高版本的 rollback CRX，并让 update.xml 指向该更高版本。

Token 失效方式：

- 云端解绑设备：旧 token 不再可用。
- 云端 reset token：旧 token 立即失效，目标机器必须更新 policy。
- 删除目标机器 policy：扩展可能仍已安装，但 managed activation 和 token 恢复能力消失。

## 8. 禁止事项

- 不提交 `.pem`、`.crx`、`.key`、`.p12`。
- 不提交填入真实 `managedDeviceToken` 的 `.reg`、plist、shell 脚本或截图。
- 不把 `managedDeviceToken` 粘贴到公共文档或聊天。
- 不把网站规则、配额、时间段放入 managed policy。
- 不用 managed policy 存账号密码、account token、raw Chrome identity 或 Google token。
