# App Runtime 决策记录

## ARM-D-011：应用发现、确定性产品与分类规则

状态：Active（PO 批准，实施中）。家庭产品类型和可信身份关联共用；孩子明确分类独立。确定性产品列表与通用规则分别管理，规则逐条选择自动/建议。自动规则不能仅凭名称、路径或自声明类别生效；同层冲突保留旧有效分类，无旧配置则未归类。外部规则包必须预览差异后逐项批准，不能覆盖孩子明确配置。首次安装主动盘点，运行补充便携应用；盘点不形成 UsageSegment。关联合并/拆分可审计，不改写历史。Windows 接入 Service，macOS 仅显式只读发现；不生产部署、不阻止进程、不共享 Santa 身份协议。

## 历史迁入索引

根仓历史 D-075–D-091 记录了 Runtime 从 macOS 骨架、跨平台产品、Windows 配对、机器级多用户、统一落账、应用策略、终端日志到 TimeWhereMg 的演进。由于根仓后来独立复用了 D-075–D-081，Runtime 决策自本文件起使用 `ARM-D-*` 命名空间；历史内容继续由冻结标签 `app-runtime/pre-integration-20260915` 和本模块 SPEC-004 保留，不再在根决策表重复维护。

| ID | 决策 | 状态 | 结论 |
|---|---|---|---|
| ARM-D-001 | 同仓独立模块与未来拆仓边界 | Active | `app-runtime-management/` 在当前仓库内独立构建、测试、版本和部署；Guardian 只依赖版本化 contract。未来拆仓时业务 import 不变，只切换 package 来源。 |
| ARM-D-002 | Runtime 与 Santa 永久隔离 | Active | 不共享 enrollment、MachineID、策略数据库、同步协议、数据表、密钥或凭据。 |
| ARM-D-003 | 跨平台 Runtime 是一个产品 | Active | Windows/macOS 是同一产品的两个原生 Agent；共享 Runtime 后台、contracts 和账本语义。 |
| ARM-D-004 | Windows 机器级多用户管理 | Active | LocalSystem Service 管理机器身份/策略/账本，每个交互式会话运行无云端凭据的 Session Agent。 |
| ARM-D-005 | 主账本与媒体辅助分轨 | Active | 不可变 UsageSegment 是唯一权威主账本；MediaSegment 仅作辅助，不进入主时长或配额。 |
| ARM-D-006 | 孩子级应用策略 | Active | 分类和独立配额按 Child + platform + runtimeIdentity 保存，只向前生效，不改写历史。 |
| ARM-D-007 | 应用目录与访问配置分离 | Active | 顶层为使用统计、访问管理、应用管理、设备管理、系统管理；应用目录不提供虚假名称对象。 |
| ARM-D-008 | 机器级终端日志 | Active | 结构化、脱敏、TTL 受控的远程日志独立于主账本，上传失败不得阻塞计时。 |
| ARM-D-009 | TimeWhereMg 本机控制面 | Active | Manager 是本机管理应用；RuntimeService 是后台服务；Session Agent 是内部实现细节。 |
| ARM-D-010 | 独立 Runtime Pages 与单次 SSO | Active | Runtime Pages 独立部署；Guardian 签发 60 秒单次 ticket，Runtime 兑换 8 小时不可续期的哈希化 browser session。 |
