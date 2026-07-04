# Pierce macOS Self-hosted Policy Keeper

## 概要

本文档把 Thomas 的 LaunchDaemon 策略恢复方案，和 TimeOnChrome 当前的 self-hosted managed internal channel 合并为一套 Pierce 专用 macOS 部署方案。

目标对象：

- 子用户 / Chrome profile 使用者：`Pierce`
- 启用 Chrome 硬化后允许登录的 Chrome 账号：`Pierce.xia@icloud.com`
- TimeOnChrome self-hosted 扩展 ID：`jdcancbiocacabbjdkngadmjpjmkdnih`
- Update URL：`https://timeonchrome-update.pages.dev/timeonchrome/update.xml`

本文档不使用公开 CWS 版 TimeOnChrome 扩展 ID `mkggamgaeemnlmlflpekacbknochbmom`，也不使用 CWS update URL `https://clients2.google.com/service/update2/crx`。

## 目标机器即时可用文件

Pierce 这一版已经整理成目标 Mac 可直接复制使用的脚本目录：

```text
docs/deployment/pierce-macos-target/
```

把整个目录复制到目标 Mac 后，可以直接执行：

```bash
cd ~/Downloads/timeonchrome-pierce-macos-target
sudo bash ./install-stage-a.sh
sudo bash ./enable-stage-b-managed-activation.sh
sudo bash ./enable-stage-c-hardening.sh
bash ./validate.sh
```

如果需要卸载：

```bash
sudo bash ./uninstall.sh
```

后续正文保留每个阶段的机制说明、验证点和手工命令；实际部署优先使用上面的目标机器脚本目录。
## 部署模型

目标 Mac 本地保存一份 Chrome policy 的“期望状态”，并通过 LaunchDaemon 定期恢复到 Chrome 实际读取的 managed preferences 位置：

```text
/usr/local/timeonchrome-policy/com.google.Chrome.plist
        |
        v
/usr/local/sbin/timeonchrome-restore-chrome-policy.sh
        |
        v
/Library/Managed Preferences/com.google.Chrome.plist
        |
        v
Chrome policy / chrome://policy
```

Policy keeper 只是本机策略恢复层，不是 MDM 替代品，也不能用于绕过学校、雇主或企业 MDM。如果 Jamf 或其它 MDM 持续删除 keeper 文件，应停止本地对抗式恢复，转为让学校 IT 明确允许这套本机策略机制。

## 阶段 A：只验证安装策略

先执行阶段 A。这个阶段只验证 self-hosted update host 和 CRX 安装链路。

阶段 A 只写入 `ExtensionSettings`：

- 强制安装 TimeOnChrome；
- 在 Chrome 支持时强制固定工具栏按钮；
- 从 `https://timeonchrome-update.pages.dev/timeonchrome/update.xml` 获取更新；
- 不写入 TimeOnChrome managed activation；
- 不限制 Chrome 登录账号或 Profile。

Policy 模板：

```text
docs/deployment/templates/macos-pierce-stage-a-com.google.Chrome.plist
```

预期结果：

- `chrome://policy` 显示 `ExtensionSettings`，状态为 `OK`。
- `chrome://extensions` 显示 TimeOnChrome 由 policy 安装。
- 扩展 ID 为 `jdcancbiocacabbjdkngadmjpjmkdnih`。
- TimeOnChrome 不能被手动禁用或移除。
- Popup/Admin 暂时不应显示 `managed_policy`。

## 阶段 B：启用 Managed Activation

阶段 A 通过后，再执行阶段 B。

阶段 B 通过 Chrome extension managed storage 写入 TimeOnChrome 的 managed activation anchor：

- `tenantId = pierce-xia-icloud`
- `devicePolicyId = pierce-macos-chrome-001`
- `cloudEndpoint = https://guardian-api.william-xia-cn.workers.dev`
- `allowIdentityRecovery = true`

Managed storage MCX 导入模板：

```text
docs/deployment/templates/macos-pierce-stage-b-managed-policy.plist
```

Managed policy 只包含 activation 和 identity anchor。不得包含网站规则、配额、时间段、profile 数据、device token、account token、密码或完整 URL 列表。

在 macOS 上，managed storage 不写进用于 `ExtensionSettings` 的 `com.google.Chrome.plist`。Chrome 扩展 managed storage policy 配置在下面这个 extension preference domain 下：

```text
com.google.Chrome.extensions.jdcancbiocacabbjdkngadmjpjmkdnih
```

使用管理员账号导入：

```bash
sudo dscl /Local/Default -mcximport /Computers/local_computer "macos-pierce-stage-b-managed-policy.plist"
sudo mcxrefresh -n "$(id -un)" 2>/dev/null || true
sudo killall cfprefsd >/dev/null 2>&1 || true
```

如果 `dscl` 提示 `/Computers/local_computer` 不存在，先创建一次：

```bash
GUID="$(uuidgen)"
ETHER="$(ifconfig en0 | awk '/ether/ {print $2; exit}')"
sudo dscl /Local/Default -create /Computers/local_computer
sudo dscl /Local/Default -create /Computers/local_computer RealName "Local Computer"
sudo dscl /Local/Default -create /Computers/local_computer GeneratedUID "$GUID"
sudo dscl /Local/Default -create /Computers/local_computer ENetAddress "$ETHER"
```

预期结果：

- `chrome://policy` 能看到 TimeOnChrome 的 managed storage values。
- Popup/Admin 显示 `activationMode = managed_policy`。
- 内部 managed channel 下，本地 privacy consent 不再阻塞激活。
- 网站规则、配额、时间段和子用户配置仍然来自云端 config，不来自 policy。
- 如果本地 device token 缺失，扩展使用 `pierce-xia-icloud + pierce-macos-chrome-001` 执行 managed recovery。

## 阶段 C：Chrome Profile 硬化

阶段 A 和阶段 B 都通过后，再执行阶段 C。

阶段 C 增加 Chrome 账号和 Profile 控制：

- 要求 Chrome 登录；
- 只允许 `Pierce.xia@icloud.com` 登录；
- 禁止新增 Chrome 用户；
- 禁止访客模式；
- 禁用无痕模式；
- 不使用 `MandatoryExtensionsForIncognitoNavigation`。

Policy 模板：

```text
docs/deployment/templates/macos-pierce-stage-c-com.google.Chrome.plist
```

预期结果：

- Chrome 只允许 `Pierce.xia@icloud.com` 登录。
- 不能新增 Chrome profile。
- 访客模式不可用。
- 无痕模式不可用。

## 安装 Keeper

把选定的阶段 A/C policy 模板复制到 keeper source path，然后安装恢复脚本和 LaunchDaemon。

在目标 Mac 上执行：

```bash
sudo mkdir -p "/Library/Managed Preferences"
sudo mkdir -p "/usr/local/timeonchrome-policy"
sudo mkdir -p "/usr/local/sbin"

sudo cp "macos-pierce-stage-a-com.google.Chrome.plist" "/usr/local/timeonchrome-policy/com.google.Chrome.plist"
sudo cp "timeonchrome-pierce-restore-chrome-policy.sh" "/usr/local/sbin/timeonchrome-restore-chrome-policy.sh"
sudo cp "local.timeonchrome.restore-chrome-policy.plist" "/Library/LaunchDaemons/local.timeonchrome.restore-chrome-policy.plist"

sudo chown root:wheel "/usr/local/timeonchrome-policy/com.google.Chrome.plist"
sudo chmod 644 "/usr/local/timeonchrome-policy/com.google.Chrome.plist"

sudo chown root:wheel "/usr/local/sbin/timeonchrome-restore-chrome-policy.sh"
sudo chmod 755 "/usr/local/sbin/timeonchrome-restore-chrome-policy.sh"

sudo chown root:wheel "/Library/LaunchDaemons/local.timeonchrome.restore-chrome-policy.plist"
sudo chmod 644 "/Library/LaunchDaemons/local.timeonchrome.restore-chrome-policy.plist"

plutil -lint "/usr/local/timeonchrome-policy/com.google.Chrome.plist"
plutil -lint "/Library/LaunchDaemons/local.timeonchrome.restore-chrome-policy.plist"
```

立即恢复一次并加载 LaunchDaemon：

```bash
sudo "/usr/local/sbin/timeonchrome-restore-chrome-policy.sh"
sudo launchctl bootout system "/Library/LaunchDaemons/local.timeonchrome.restore-chrome-policy.plist" 2>/dev/null || true
sudo launchctl bootstrap system "/Library/LaunchDaemons/local.timeonchrome.restore-chrome-policy.plist"
sudo launchctl kickstart -k system/local.timeonchrome.restore-chrome-policy
```

## 切换策略阶段

从阶段 A 切到阶段 C：

```bash
sudo cp "<next-stage-template>.plist" "/usr/local/timeonchrome-policy/com.google.Chrome.plist"
sudo chown root:wheel "/usr/local/timeonchrome-policy/com.google.Chrome.plist"
sudo chmod 644 "/usr/local/timeonchrome-policy/com.google.Chrome.plist"
plutil -lint "/usr/local/timeonchrome-policy/com.google.Chrome.plist"
sudo launchctl kickstart -k system/local.timeonchrome.restore-chrome-policy
sudo killall cfprefsd >/dev/null 2>&1 || true
```

然后完全退出并重启 Chrome。

阶段 B 不复制到 `/usr/local/timeonchrome-policy/com.google.Chrome.plist`；阶段 B 需要用 `dscl` 单独作为 extension managed storage 导入。

## 验证

文件和 LaunchDaemon 检查：

```bash
ls -l "/usr/local/timeonchrome-policy/com.google.Chrome.plist"
ls -l "/usr/local/sbin/timeonchrome-restore-chrome-policy.sh"
ls -l "/Library/LaunchDaemons/local.timeonchrome.restore-chrome-policy.plist"
ls -l "/Library/Managed Preferences/com.google.Chrome.plist"
plutil -lint "/Library/Managed Preferences/com.google.Chrome.plist"
sudo launchctl print system/local.timeonchrome.restore-chrome-policy
tail -n 50 /var/log/timeonchrome-policy-restore.log
```

Chrome 检查：

1. 完全退出 Chrome。
2. 执行 `sudo killall cfprefsd >/dev/null 2>&1 || true`。
3. 重新打开 Chrome。
4. 打开 `chrome://policy`。
5. 点击 `Reload policies`。
6. 确认预期 policy values 已生效。
7. 打开 `chrome://extensions`。
8. 确认 TimeOnChrome 由 policy 安装，扩展 ID 为 `jdcancbiocacabbjdkngadmjpjmkdnih`。
9. 打开 TimeOnChrome Popup/Admin，确认 activation 状态符合当前阶段。

## 暂停

停止 keeper，但不删除 policy 文件：

```bash
sudo launchctl bootout system "/Library/LaunchDaemons/local.timeonchrome.restore-chrome-policy.plist"
```

## 卸载

删除本地 keeper 和 Chrome policy：

```bash
sudo launchctl bootout system "/Library/LaunchDaemons/local.timeonchrome.restore-chrome-policy.plist" 2>/dev/null || true

sudo rm -f "/Library/LaunchDaemons/local.timeonchrome.restore-chrome-policy.plist"
sudo rm -f "/usr/local/sbin/timeonchrome-restore-chrome-policy.sh"
sudo rm -rf "/usr/local/timeonchrome-policy"
sudo rm -f "/Library/Managed Preferences/com.google.Chrome.plist"

sudo killall cfprefsd >/dev/null 2>&1 || true
```

重启 Chrome 后，确认 `chrome://policy` 不再显示 TimeOnChrome force-install policy。

## 边界

- 不要把 CRX private signing key 复制到目标 policy folder。
- 不要在 policy 中保存 device token、account token、密码、raw Chrome identity 或完整网站规则集。
- 不要使用 `chflags schg`。
- 不要和学校 MDM 对抗。如果 MDM 删除 policy keeper，应找学校 IT 支持，而不是升级本地恢复脚本。
- 调试时不要混用阶段 A/B/C。每个阶段通过后，再进入下一阶段。
