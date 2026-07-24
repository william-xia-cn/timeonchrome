# Pierce macOS 目标机安装包

这个目录保存 Pierce macOS 受管部署的仓库版安装包骨架。当前推荐入口是已在目标 Mac 验证通过的一体化安装器：

```bash
sudo ./timeonchrome-managed-installer.sh install
sudo ./timeonchrome-managed-installer.sh uninstall
```

也可以双击 `install.command` / `uninstall.command`，它们只负责从自身目录定位并调用主安装器。

## 文件

| 文件 | 用途 |
|---|---|
| `timeonchrome-managed-installer.sh` | 一体化安装、修复/重装、卸载和验收逻辑 |
| `install.command` | macOS 双击安装启动器 |
| `uninstall.command` | macOS 双击卸载启动器，要求输入 `UNINSTALL` 确认 |
| `private-config.example.plist` | 私有配置模板；复制为 `private-config.plist` 后在目标机器本地填写真实 Device Token |
| `INSTALLER_FIX_REPORT_2026-07-22.md` | 目标 Mac 最终验证和修复说明 |
| `install-stage-a.sh` / `enable-stage-b-managed-activation.sh` / `enable-stage-c-hardening.sh` / `validate.sh` / `uninstall.sh` | 旧分阶段脚本，保留作历史参考和手工排障备用；默认不要用于新的 Pierce 安装 |

## 使用前准备

在目标 Mac 上把 `private-config.example.plist` 复制为同目录下的 `private-config.plist`，填入从 TimeOnChrome cloud console 导出的 `managedDeviceToken`，并设置权限：

```bash
cp private-config.example.plist private-config.plist
chmod 600 private-config.plist
chmod 700 . timeonchrome-managed-installer.sh install.command uninstall.command
```

真实 `private-config.plist` 含 Device Token，必须只保存在目标机器本地，不提交 Git、不上传公共网盘、不贴到聊天或文档。

## 安装效果

- 强制安装并固定 TimeOnChrome `1.7.13`。
- 使用 managed Device Token 自动绑定云端设备。
- 启用 Chrome 硬化：强制登录、仅允许 Pierce 账号、禁止新增 Profile、访客模式和无痕模式。
- 自动解析当前控制台用户下唯一匹配 `pierce.xia@icloud.com` 的 Chrome Profile。
- 启动 Chrome 时显式传入目标 `--profile-directory`，避免落到 Profile Picker 或错误 Profile。
- keeper 每 60 秒检查 Chrome plist、扩展 managed-preferences 域和 MCX；任一项缺失或不匹配时自动重建。
- 验收检查覆盖 Chrome policy、effective MCX、扩展版本、managed schema，以及 Chrome 自己生成的 `Managed Extension Settings/<extensionId>` 数据。

## 验证闭环

推荐完整验证顺序：

```bash
sudo ./timeonchrome-managed-installer.sh install
sudo ./timeonchrome-managed-installer.sh uninstall
sudo ./timeonchrome-managed-installer.sh install
```

卸载和第二次安装之间不要手动打开 Chrome。卸载会恢复本轮安装前的系统状态，并保留扩展本地 storage，以支持无损的 uninstall -> install 验证。

## 重要边界

- 本目录不保存真实 `managedDeviceToken`。
- `managedProfileEmail` 只用于扩展运行时校验当前 Chrome Profile 邮箱；不能阻止 Chrome 把扩展安装到其他 Profile。
- 本地 keeper 用于防止已授权维护的本机 policy 被偶发更新、系统维护或配置漂移弄丢；若学校 MDM 同时删除恢复源、恢复脚本或 LaunchDaemon，需要学校 IT 明确允许本地策略机制。
- 不使用 Google OAuth，不保存 Google token，不写入账号密码、网站规则、配额或完整身份原始数据。
## 独立模块来源

通用安装器模块已拆出到 `tools/managed-chrome-extension-installer/`。本目录是 TimeOnChrome/Pierce 的项目内集成实例；如果要迁移到其他仓库，优先复制整个独立模块目录，再用 `examples/timeonchrome/private-config.example.plist` 作为配置映射参考。
