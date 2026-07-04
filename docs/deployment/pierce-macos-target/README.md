# Pierce macOS 目标机安装包

这个目录可以整体复制到 Pierce 的目标 Mac 上使用。

建议复制到目标 Mac 的任意临时目录，例如：

```bash
~/Downloads/timeonchrome-pierce-macos-target
```

执行顺序：

```bash
cd ~/Downloads/timeonchrome-pierce-macos-target

# 阶段 A：只验证 self-hosted CRX / update.xml / force install
sudo bash ./install-stage-a.sh

# 阶段 B：启用 TimeOnChrome managed activation
sudo bash ./enable-stage-b-managed-activation.sh

# 阶段 C：启用 Chrome 账号/Profile 硬化
sudo bash ./enable-stage-c-hardening.sh

# 验证
bash ./validate.sh
```

卸载：

```bash
sudo bash ./uninstall.sh
```

关键参数：

- Chrome 账号：`Pierce.xia@icloud.com`
- TimeOnChrome self-hosted extension ID：`jdcancbiocacabbjdkngadmjpjmkdnih`
- Update URL：`https://timeonchrome-update.pages.dev/timeonchrome/update.xml`
- `tenantId`：`pierce-xia-icloud`
- `devicePolicyId`：`pierce-macos-chrome-001`

边界：

- 不保存 device token、account token、密码、raw Chrome identity 或网站规则。
- 不保存 CRX private signing key。
- 不使用 `chflags schg`。
- 不与学校 MDM 对抗；如果 MDM 删除本地 keeper 资产，应找学校 IT 明确允许本地策略机制。
