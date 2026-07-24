# TimeOnChrome Pierce macOS 安装器修复说明

- 日期：2026-07-22
- 适用包：`timeonchrome-pierce`
- 验证环境：Pierce 目标 Mac、Google Chrome、目标 Profile `Profile 1`
- 最终结果：完整安装、卸载、重新安装和 repair/reinstall 验证通过

## 1. 问题摘要

### 1.1 Controlled keeper restore 误报失败

keeper 已在约定时间内恢复 Chrome policy、扩展 managed preferences 和 MCX 目录记录，但 repair/reinstall 流程在 Chrome 关闭期间同时检查 effective MCX。macOS 的 MCX 生效缓存存在异步刷新延迟，因此恢复动作已经完成时，测试仍可能误报：

```text
ERROR: Controlled keeper restore test failed; the safety policy and managed activation were restored.
```

这不是实际策略恢复失败，而是测试阶段混合了“恢复源已经重建”和“Chrome 已读取最终生效状态”两种不同的验收条件。

### 1.2 自动启动 Chrome 未锁定目标 Profile

安装器原先通过目标桌面用户启动 Chrome，但没有明确传入已解析出的 Pierce Profile。首次受管启动曾出现：

- Chrome Profile Picker；
- Keychain 提示；
- Chrome 停留在登录页面；
- 首次只显示由策略强制安装的 TimeOnChrome，未立即加载 Pierce Profile 中的其他扩展。

正常退出并从 Pierce Profile 再次启动后，Chrome、账号、Keychain 和其他扩展均恢复正常，说明 Profile 数据没有损坏。

## 2. 修复内容

### 2.1 keeper 等待时间

将 controlled keeper restore 的等待时间从 10 秒调整为 30 秒，覆盖目标 Mac 上实际观察到的恢复延迟。

### 2.2 明确 Chrome 用户环境和 Profile

`open_chrome()` 现在：

- 使用目标用户的 `HOME`；
- 设置目标用户的 `USER` 和 `LOGNAME`；
- 在目标桌面用户的 GUI session 中启动 Chrome；
- 传入 `--profile-directory=Profile 1`，直接启动已解析出的 Pierce Profile。

安装器仍以实际解析结果为准，不把 `Profile 1` 作为通用固定假设；本报告记录的是本次目标 Mac 的实际解析值。

### 2.3 分离 keeper 恢复与最终生效验证

验收流程调整为：

1. Chrome 关闭阶段验证：
   - Chrome policy 文件已恢复并与恢复源一致；
   - 扩展 managed preferences 已恢复并与恢复源一致；
   - MCX directory record 已由 keeper 恢复；
   - 扩展本地 storage 指纹保持不变。
2. Chrome 打开阶段继续执行三轮稳定性检查，验证：
   - effective MCX；
   - Chrome-readable managed policy；
   - 扩展版本；
   - managed storage schema；
   - Chrome 生成的 Managed Extension Settings。

该调整没有降低最终验收标准，只是把异步的 effective MCX 和 Chrome 可读状态检查放回 Chrome 启动后的正确阶段。

## 3. 实机验证证据

以下流程已在目标 Mac 上完成：

| 验证项 | 结果 |
|---|---|
| `uninstall` 恢复安装前系统状态 | 通过 |
| 卸载期间保持 Chrome 关闭 | 通过 |
| extension local storage 保留 | 通过 |
| clean install | 通过 |
| 自动解析唯一 Pierce Profile | 通过 |
| update feed、扩展 ID 和版本检查 | 通过 |
| cloud token 认证及所需字段检查 | 通过 |
| system policy、hardening、keeper、MCX、managed preferences | 通过 |
| controlled keeper restore | 通过 |
| repair/reinstall | 通过 |
| 三轮 Chrome-readable managed-policy 稳定性检查 | 通过 |
| Chrome、Pierce 登录和 Keychain | 正常 |
| TimeOnChrome 与其他 Profile 扩展 | 正常 |

关键成功输出：

```text
Controlled Chrome policy, managed preferences, and MCX directory-record keeper restore test passed.
Managed-policy stability check 1 of 3 passed.
Managed-policy stability check 2 of 3 passed.
Managed-policy stability check 3 of 3 passed.
Pierce repair/reinstallation and validation completed successfully.
```

## 4. 安全与数据边界

- 本说明不记录 Device Token、账号密码、Cookie、JWT 或其他敏感值。
- `private-config.plist` 未因本次修复而修改。
- 安装、卸载和 repair/reinstall 验证均确认扩展本地 storage 未被脚本改写。
- Keychain 不需要重置；此前提示来自首次启动时的 Chrome/Profile 会话上下文，修复后未再次阻塞完整验证。
- 私有安装包仍应作为敏感材料保存，不得提交公共仓库或上传公共网盘。

## 5. 后续同步要求

本次修复当前只存在于以下私有安装包：

```text
/Users/zhiming.xia/Documents/tools/timeonchrome-pierce
```

尚未同步回 TimeOnChrome 项目源码。后续应在项目中：

1. 同步 `open_chrome()` 的目标用户环境和 Profile 启动逻辑；
2. 同步 controlled keeper restore 的分阶段验收逻辑；
3. 保留 30 秒恢复等待边界；
4. 补充 clean install、repair/reinstall、MCX 异步生效和 storage preservation 测试；
5. 在项目部署记录中引用本次真实 Mac 验收结果。

## 6. 学校 MDM 单文件删除模拟

2026-07-22 在 Chrome 正常运行期间，执行了一次受控的学校 MDM 行为模拟。测试只删除 Chrome 当前生效的主策略文件：

```text
/Library/Managed Preferences/com.google.Chrome.plist
```

测试没有删除恢复源、LaunchDaemon、managed extension preferences、MCX、Chrome Profile 或 extension local storage。

### 6.1 基线

- 恢复源与生效文件 SHA256 一致；
- 生效文件 owner/mode 为 `root:wheel / 644`；
- keeper 在测试前 `runs=13`，最近退出码为 `0`；
- Pierce Profile 中存在 8 个扩展目录；
- TimeOnChrome 版本为 `1.7.13`；
- extension local storage 目录存在并已记录测试前指纹。

### 6.2 结果

- 删除目标文件后没有手动 kickstart keeper；
- `WatchPaths` 几乎立即触发恢复，观察循环开始时文件已恢复，记录耗时为小于 1 秒；
- keeper 日志在 `2026-07-22 01:07:06` 记录 `Restored Chrome policy`；
- keeper 运行次数增加至 `15`，最近退出码仍为 `0`；
- 恢复文件与恢复源逐字一致；
- 恢复文件 owner/mode 仍为 `root:wheel / 644`；
- managed extension preferences 和 MCX 在同轮检查中保持正确；
- Pierce Profile 扩展目录仍为 8，TimeOnChrome 仍为 `1.7.13`；
- `chrome://policy` 已打开用于重新加载后的界面核验；
- 临时 root-only 安全备份已在恢复验证完成后删除。

测试期间 Chrome 正常运行，extension local storage 指纹发生运行时变化。在线运行的扩展会持续写入状态，因此该变化不能归因于策略文件删除，也不作为本轮失败条件；storage 目录和扩展结构均保持完整。

### 6.3 结论

```text
PASS — 当前学校管理机制若只删除 Chrome 生效策略文件，
现有 keeper 可以依靠 WatchPaths 自动恢复，无需运行安装器或重启 Chrome。
```

该结论不覆盖学校 MDM 同时删除 `/usr/local/timeonchrome-policy`、恢复脚本或 LaunchDaemon 的场景。
