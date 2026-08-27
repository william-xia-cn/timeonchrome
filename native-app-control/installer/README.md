# Santa 独立安装器

此目录只安装官方 Santa 并生成 Native App Control enrollment profile。它不会安装自研常驻组件，也不会读取或修改 Chrome policy、扩展 storage、Chrome Device Token、policy keeper 或 Native Messaging Host。

1. 从 Santa 官方 release channel 下载并人工确认安装包来源。也可从已校验的 `santa-portable-kit-1.0.0.zip` 中只取 `install/santa-2026.7.pkg`；不要执行其中的本地规则或常驻监测脚本，它们不属于 Native App Control V1。
2. 在家长控制台 `Native Apps -> Native Macs` 创建 Native Mac，下载设备专属的 `TimeOnChrome-Santa-*.mobileconfig`。该文件包含 enrollment secret，不要上传共享 Drive、提交 Git 或发送到无关设备。
3. 执行：

   ```zsh
   sudo ./install-santa.sh \
     --package /path/to/official-santa.pkg \
     --profile /private/path/TimeOnChrome-Santa-Pierce-MacBook.mobileconfig
   ```

4. 以登录用户打开控制台下载的配置 profile，并在 macOS System Settings 中批准安装。
5. 执行 `./verify-santa.sh`，确认 Santa 为 Monitor mode、同步间隔 60 秒，并能完成四阶段同步。

同一控制台页面会话可重复下载刚生成的 profile；页面刷新后完整 enrollment secret 不再可读，只能轮换 enrollment 重新生成。

正式卸载必须使用 Santa 官方卸载流程；单纯吊销 enrollment 不会清除已经下发到本机的 block rules。
