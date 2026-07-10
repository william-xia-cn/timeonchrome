# Chrome 管理 LaunchDaemon + 恢复脚本  Pierce

> **LaunchDaemon + 恢复脚本**
> 作用：在开机、定时检查时，自动把 Chrome 策略文件恢复到指定内容。

这个方案适用于你已说明的场景：**学校授权你使用管理员账号做单机本地补充配置，但学校不方便为单个家长修改 Jamf 策略**。

Apple 的 `launchd` 是 macOS 标准后台任务机制，`RunAtLoad` 可在任务加载时运行，`StartInterval` 可做周期运行；配置 profile/managed preferences 也是 Apple 设备管理体系中的标准配置方式。([Apple Developer](https://developer.apple.com/library/archive/documentation/MacOSX/Conceptual/BPSystemStartup/Chapters/CreatingLaunchdJobs.html?utm_source=chatgpt.com "Creating Launch Daemons and Agents"))

---

# 0. 最终机制

```text
/usr/local/timeonchrome-policy/com.google.Chrome.plist
        ↓
恢复脚本定期检查
        ↓
/Library/Managed Preferences/com.google.Chrome.plist
        ↓
Chrome / Chrome Beta 读取
        ↓
chrome://policy 生效
```

你已经验证过：**Chrome Beta 读取的也是 `com.google.Chrome.plist`，不是 `com.google.Chrome.beta.plist`。**

---

# 1. 文件清单

安装完成后会有这些文件：

```text
/usr/local/timeonchrome-policy/com.google.Chrome.plist
/usr/local/sbin/timeonchrome-restore-chrome-policy.sh
/Library/LaunchDaemons/local.timeonchrome.restore-chrome-policy.plist
/var/log/timeonchrome-policy-restore.log
/var/log/timeonchrome-policy-restore.out.log
/var/log/timeonchrome-policy-restore.err.log
```

含义：

| 文件                                                                      | 作用               |
| ----------------------------------------------------------------------- | ---------------- |
| `/usr/local/timeonchrome-policy/com.google.Chrome.plist`                | 策略模板，作为“期望状态”    |
| `/usr/local/sbin/timeonchrome-restore-chrome-policy.sh`                 | 恢复脚本             |
| `/Library/LaunchDaemons/local.timeonchrome.restore-chrome-policy.plist` | 开机 + 定时运行恢复脚本    |
| `/Library/Managed Preferences/com.google.Chrome.plist`                  | Chrome 实际读取的策略文件 |
|                                                                         |                  |

TimeOnChrome managed activation 数据通过 `dscl -mcximport` 写入 Chrome 扩展 managed storage，不作为单独文件手工维护；它只包含 `cloudEndpoint`、`managedDeviceToken`、可选的 `managedDeviceLabel` 和可选的 `managedProfileEmail`。`managedDeviceToken` 等同于这台受管终端访问云端的凭据，必须只保存在目标机器 policy 中，不提交到 Git、公共文档或聊天。

---

# 2. 完整安装脚本

直接复制执行。

这版策略会：

- 强制安装 TimeOnChrome 一个扩展

- TimeOnChrome 不可删除、不可禁用

- TimeOnChrome 固定在工具栏

- 不禁止其他扩展

- 强制 Chrome 登录

- 只允许 `pierce.xia@icloud.com`

- 禁止新增 Chrome 用户

- 禁止访客模式

- 禁用无痕模式

- 不使用 `MandatoryExtensionsForIncognitoNavigation`

- 写入 TimeOnChrome managed activation 数据，用于内部通道激活和云端同步


```bash
sudo mkdir -p "/Library/Managed Preferences"
sudo mkdir -p "/usr/local/timeonchrome-policy"
sudo mkdir -p "/usr/local/sbin"

# 1. 写入 Chrome 策略模板：这是“期望状态”
sudo tee "/usr/local/timeonchrome-policy/com.google.Chrome.plist" > /dev/null <<'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
 "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>

    <!-- TimeOnChrome：强制安装、不可删除、不可禁用、强制固定到工具栏 -->
    <key>ExtensionSettings</key>
    <dict>


        <key>jdcancbiocacabbjdkngadmjpjmkdnih</key>
        <dict>
            <key>installation_mode</key>
            <string>force_installed</string>
            <key>toolbar_pin</key>
            <string>force_pinned</string>
            <key>update_url</key>
            <string>https://timeonchrome-update.pages.dev/timeonchrome/update.xml</string>
        </dict>

    </dict>

    <!-- 强制 Chrome 登录 -->
    <key>BrowserSignin</key>
    <integer>2</integer>

    <!-- 只允许指定账号登录 -->
    <key>RestrictSigninToPattern</key>
    <string>^pierce\.xia@icloud\.com$</string>

    <!-- 禁止新增 Chrome 用户/Profile -->
    <key>BrowserAddPersonEnabled</key>
    <false/>

    <!-- 禁止访客模式 -->
    <key>BrowserGuestModeEnabled</key>
    <false/>

    <!-- 禁用无痕模式 -->
    <key>IncognitoModeAvailability</key>
    <integer>1</integer>

</dict>
</plist>
EOF

sudo chown root:wheel "/usr/local/timeonchrome-policy/com.google.Chrome.plist"
sudo chmod 644 "/usr/local/timeonchrome-policy/com.google.Chrome.plist"
plutil -lint "/usr/local/timeonchrome-policy/com.google.Chrome.plist"
# 1b. 写入 TimeOnChrome managed activation 数据：只用于内部通道激活和云端同步
# 先在云端「子用户管理 → 绑定设备」创建或选择终端，导出 Device Token。
# 该 Token 是敏感凭据，只能粘贴到目标机器 policy 中。
read -rsp "Paste managedDeviceToken from TimeOnChrome cloud console: " MANAGED_DEVICE_TOKEN
echo
if [ -z "$MANAGED_DEVICE_TOKEN" ]; then
  echo "managedDeviceToken is required"
  exit 1
fi

MANAGED_POLICY="/tmp/timeonchrome-managed-policy.plist"
sudo tee "$MANAGED_POLICY" > /dev/null <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
 "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>com.google.Chrome.extensions.jdcancbiocacabbjdkngadmjpjmkdnih</key>
    <dict>
        <key>enabled</key>
        <dict>
            <key>state</key>
            <string>always</string>
            <key>value</key>
            <true/>
        </dict>
        <key>deploymentMode</key>
        <dict>
            <key>state</key>
            <string>always</string>
            <key>value</key>
            <string>managed</string>
        </dict>
        <key>cloudEndpoint</key>
        <dict>
            <key>state</key>
            <string>always</string>
            <key>value</key>
            <string>https://guardian-api.william-xia-cn.workers.dev</string>
        </dict>
        <key>managedDeviceToken</key>
        <dict>
            <key>state</key>
            <string>always</string>
            <key>value</key>
            <string>${MANAGED_DEVICE_TOKEN}</string>
        </dict>
        <key>managedDeviceLabel</key>
        <dict>
            <key>state</key>
            <string>always</string>
            <key>value</key>
            <string>Pierce MacBook Chrome</string>
        </dict>
        <key>managedProfileEmail</key>
        <dict>
            <key>state</key>
            <string>always</string>
            <key>value</key>
            <string>pierce.xia@icloud.com</string>
        </dict>
    </dict>
</dict>
</plist>
EOF

plutil -lint "$MANAGED_POLICY"
if ! sudo dscl /Local/Default -read /Computers/local_computer >/dev/null 2>&1; then
  GUID="$(uuidgen)"
  ETHER="$(ifconfig en0 | awk '/ether/ {print $2; exit}')"
  sudo dscl /Local/Default -create /Computers/local_computer
  sudo dscl /Local/Default -create /Computers/local_computer RealName "Local Computer"
  sudo dscl /Local/Default -create /Computers/local_computer GeneratedUID "$GUID"
  sudo dscl /Local/Default -create /Computers/local_computer ENetAddress "$ETHER"
fi

sudo dscl /Local/Default -mcximport /Computers/local_computer "$MANAGED_POLICY"
sudo rm -f "$MANAGED_POLICY"
sudo mcxrefresh -n "$(id -un)" 2>/dev/null || true
sudo killall cfprefsd >/dev/null 2>&1 || true

# 2. 写入恢复脚本
sudo tee "/usr/local/sbin/timeonchrome-restore-chrome-policy.sh" > /dev/null <<'EOF'
#!/bin/bash
set -euo pipefail

SRC="/usr/local/timeonchrome-policy/com.google.Chrome.plist"
DST="/Library/Managed Preferences/com.google.Chrome.plist"
DST_DIR="/Library/Managed Preferences"
TMP="/Library/Managed Preferences/com.google.Chrome.plist.tmp"
LOG="/var/log/timeonchrome-policy-restore.log"

timestamp() {
  /bin/date "+%Y-%m-%d %H:%M:%S"
}

log() {
  echo "$(timestamp) $1" >> "$LOG"
  /usr/bin/logger -t timeonchrome-policy "$1"
}

if [ ! -f "$SRC" ]; then
  log "ERROR: source policy missing: $SRC"
  exit 1
fi

if ! /usr/bin/plutil -lint "$SRC" >/dev/null 2>&1; then
  log "ERROR: source policy invalid: $SRC"
  exit 1
fi

/bin/mkdir -p "$DST_DIR"

if [ ! -f "$DST" ] || ! /usr/bin/cmp -s "$SRC" "$DST"; then
  /bin/cp "$SRC" "$TMP"
  /usr/sbin/chown root:wheel "$TMP"
  /bin/chmod 644 "$TMP"

  if ! /usr/bin/plutil -lint "$TMP" >/dev/null 2>&1; then
    /bin/rm -f "$TMP"
    log "ERROR: temp policy failed plist validation"
    exit 1
  fi

  /bin/mv "$TMP" "$DST"
  /usr/sbin/chown root:wheel "$DST"
  /bin/chmod 644 "$DST"

  /usr/bin/killall cfprefsd >/dev/null 2>&1 || true

  log "Restored Chrome policy to $DST"
else
  log "Chrome policy already correct; no change"
fi

exit 0
EOF

sudo chown root:wheel "/usr/local/sbin/timeonchrome-restore-chrome-policy.sh"
sudo chmod 755 "/usr/local/sbin/timeonchrome-restore-chrome-policy.sh"


# 3. 写入 LaunchDaemon
sudo tee "/Library/LaunchDaemons/local.timeonchrome.restore-chrome-policy.plist" > /dev/null <<'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
 "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>

    <key>Label</key>
    <string>local.timeonchrome.restore-chrome-policy</string>

    <key>UserName</key>
    <string>root</string>

    <key>ProgramArguments</key>
    <array>
        <string>/usr/local/sbin/timeonchrome-restore-chrome-policy.sh</string>
    </array>

    <!-- 加载时立即运行一次 -->
    <key>RunAtLoad</key>
    <true/>

    <!-- 每 5 分钟检查一次 -->
    <key>StartInterval</key>
    <integer>300</integer>

    <!-- 目录变化时也尝试运行 -->
    <key>WatchPaths</key>
    <array>
        <string>/Library/Managed Preferences</string>
        <string>/usr/local/timeonchrome-policy/com.google.Chrome.plist</string>
    </array>

    <key>StandardOutPath</key>
    <string>/var/log/timeonchrome-policy-restore.out.log</string>

    <key>StandardErrorPath</key>
    <string>/var/log/timeonchrome-policy-restore.err.log</string>

</dict>
</plist>
EOF

sudo chown root:wheel "/Library/LaunchDaemons/local.timeonchrome.restore-chrome-policy.plist"
sudo chmod 644 "/Library/LaunchDaemons/local.timeonchrome.restore-chrome-policy.plist"
plutil -lint "/Library/LaunchDaemons/local.timeonchrome.restore-chrome-policy.plist"


# 4. 立即恢复一次
sudo "/usr/local/sbin/timeonchrome-restore-chrome-policy.sh"


# 5. 注册 LaunchDaemon
sudo launchctl bootout system "/Library/LaunchDaemons/local.timeonchrome.restore-chrome-policy.plist" 2>/dev/null || true
sudo launchctl bootstrap system "/Library/LaunchDaemons/local.timeonchrome.restore-chrome-policy.plist"
sudo launchctl kickstart -k system/local.timeonchrome.restore-chrome-policy
```

---

# 3. 预期输出

你应该至少看到：

```text
/usr/local/timeonchrome-policy/com.google.Chrome.plist: OK
/Library/LaunchDaemons/local.timeonchrome.restore-chrome-policy.plist: OK
```

如果没有报错，说明：

- 策略模板有效

- 恢复脚本已安装

- LaunchDaemon 已安装

- 已立即执行过一次恢复

    - TimeOnChrome managed activation 数据已导入本机 Chrome 扩展 managed storage，其中 `managedDeviceToken` 来自云端终端管理


---

# 4. 验证文件是否恢复成功

```bash
ls -l "/Library/Managed Preferences/com.google.Chrome.plist"
```

预期类似：

```text
-rw-r--r--  1 root  wheel  ... /Library/Managed Preferences/com.google.Chrome.plist
```

校验目标文件：

```bash
plutil -lint "/Library/Managed Preferences/com.google.Chrome.plist"
```

预期：

```text
/Library/Managed Preferences/com.google.Chrome.plist: OK
```

查看恢复日志：

```bash
tail -n 50 /var/log/timeonchrome-policy-restore.log
```

可能看到：

```text
Restored Chrome policy to /Library/Managed Preferences/com.google.Chrome.plist
```

或者：

```text
Chrome policy already correct; no change
```

---

# 5. 验证 LaunchDaemon 是否加载

执行：

```bash
sudo launchctl print system/local.timeonchrome.restore-chrome-policy
```

如果能看到 job 信息，说明已经加载。

手动触发一次：

```bash
sudo launchctl kickstart -k system/local.timeonchrome.restore-chrome-policy
```

再查看日志：

```bash
tail -n 50 /var/log/timeonchrome-policy-restore.log
```

---

# 6. 验证 Chrome 是否读取策略

刷新缓存：

```bash
sudo killall cfprefsd
```

完全退出 Chrome 和 Chrome Beta：

```bash
osascript -e 'quit app "Google Chrome"' 2>/dev/null || true
osascript -e 'quit app "Google Chrome Beta"' 2>/dev/null || true
```

重新打开 Chrome Beta：

```bash
open -a "Google Chrome Beta"
```

打开：

```text
chrome://policy
```

应看到：

|Policy|预期状态|
|---|---|
|ExtensionSettings|OK|
|TimeOnChrome managed storage|OK / 在扩展 policy 区域可见|
|BrowserSignin|OK|
|RestrictSigninToPattern|OK|
|BrowserAddPersonEnabled|OK|
|BrowserGuestModeEnabled|OK|
|IncognitoModeAvailability|OK|

不应该再使用：

```text
MandatoryExtensionsForIncognitoNavigation
```

因为你已经看到它的状态是：

```text
Unreleased
```

---

# 7. 重启验证

重启后等 1–5 分钟，然后检查：

```bash
ls -l "/Library/Managed Preferences/com.google.Chrome.plist"
tail -n 50 /var/log/timeonchrome-policy-restore.log
```

再打开：

```text
chrome://policy
```

如果策略恢复正常，说明本地维护机制有效。

---

# 8. 以后如何更新策略

以后不要直接改：

```text
/Library/Managed Preferences/com.google.Chrome.plist
```

应该改模板：

```text
/usr/local/timeonchrome-policy/com.google.Chrome.plist
```

更新流程：

```bash
sudo tee "/usr/local/timeonchrome-policy/com.google.Chrome.plist" > /dev/null <<'EOF'
新的 plist 内容
EOF

sudo chown root:wheel "/usr/local/timeonchrome-policy/com.google.Chrome.plist"
sudo chmod 644 "/usr/local/timeonchrome-policy/com.google.Chrome.plist"

plutil -lint "/usr/local/timeonchrome-policy/com.google.Chrome.plist"

sudo launchctl kickstart -k system/local.timeonchrome.restore-chrome-policy
```

然后：

```bash
sudo killall cfprefsd
```

重启 Chrome / Chrome Beta。

---

# 9. 如何暂停

```bash
sudo launchctl bootout system "/Library/LaunchDaemons/local.timeonchrome.restore-chrome-policy.plist"
```

这会停止 LaunchDaemon，但不删除文件。

---

# 10. 如何卸载

如果以后不用这套机制：

```bash
sudo launchctl bootout system "/Library/LaunchDaemons/local.timeonchrome.restore-chrome-policy.plist" 2>/dev/null || true

sudo rm -f "/Library/LaunchDaemons/local.timeonchrome.restore-chrome-policy.plist"
sudo rm -f "/usr/local/sbin/timeonchrome-restore-chrome-policy.sh"
sudo rm -rf "/usr/local/timeonchrome-policy"

sudo rm -f "/Library/Managed Preferences/com.google.Chrome.plist"

sudo dscl /Local/Default -mcxdelete /Computers/local_computer com.google.Chrome.extensions.jdcancbiocacabbjdkngadmjpjmkdnih 2>/dev/null || true

sudo killall cfprefsd
```

然后完全退出并重启 Chrome / Chrome Beta。

---

# 11. 重要边界

managed activation 数据只能加入 `cloudEndpoint`、`managedDeviceToken`、可选显示标签和可选 `managedProfileEmail`。`managedProfileEmail` 只用于扩展运行时校验当前 Chrome Profile 邮箱；不匹配时扩展不启用 managed activation。`managedDeviceToken` 是敏感凭据，等同于该终端的云端访问 token；不要加入 account token、密码、raw Chrome identity、完整网站规则、配额或时间段，也不要把该 token 写入 Git、公共文档或聊天。

不要加：

```bash
sudo chflags schg ...
```

原因：

- 不利于学校 IT 审计

- 维护麻烦

- 可能和 Jamf 冲突

- 更新时必须先解除 immutable flag


如果 Jamf 每隔几分钟主动删除或覆盖这个文件，LaunchDaemon 会反复恢复。此时不应继续对抗式配置，应让学校 IT 明确允许这个本地维护机制，或给这台设备做一个单机 scope 的 Jamf policy。


# 4. 你应该检查这些权限

执行：

```
ls -l "/Library/LaunchDaemons/local.timeonchrome.restore-chrome-policy.plist"ls -l "/usr/local/sbin/timeonchrome-restore-chrome-policy.sh"ls -l "/usr/local/timeonchrome-policy/com.google.Chrome.plist"ls -l "/Library/Managed Preferences/com.google.Chrome.plist"
```

理想结果类似：

```
-rw-r--r--  1 root  wheel  ... local.timeonchrome.restore-chrome-policy.plist-rwxr-xr-x  1 root  wheel  ... timeonchrome-restore-chrome-policy.sh-rw-r--r--  1 root  wheel  ... com.google.Chrome.plist-rw-r--r--  1 root  wheel  ... com.google.Chrome.plist
```

---

# 5. 再加固一次权限

可以执行：

```
sudo chown root:wheel "/Library/LaunchDaemons/local.timeonchrome.restore-chrome-policy.plist"sudo chmod 644 "/Library/LaunchDaemons/local.timeonchrome.restore-chrome-policy.plist"sudo chown root:wheel "/usr/local/sbin/timeonchrome-restore-chrome-policy.sh"sudo chmod 755 "/usr/local/sbin/timeonchrome-restore-chrome-policy.sh"sudo chown root:wheel "/usr/local/timeonchrome-policy/com.google.Chrome.plist"sudo chmod 644 "/usr/local/timeonchrome-policy/com.google.Chrome.plist"sudo chown root:wheel "/Library/Managed Preferences/com.google.Chrome.plist"sudo chmod 644 "/Library/Managed Preferences/com.google.Chrome.plist"
```

再检查 LaunchDaemon 是否还在运行：

```
sudo launchctl print system/local.timeonchrome.restore-chrome-policy
```
