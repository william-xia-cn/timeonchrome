# App Runtime 技术设计

## 当前修复：ARM-D-013

目录 read model 在原始 `runtimeIdentity` 与家长应用目录之间增加产品投影层。服务端把记录分为 `actionable`、`review` 和 `hidden`：已确认产品或具有可靠身份的主应用为 `actionable`；只有历史进程名、弱候选或证据不足的实现为 `review`；明确组件与瞬态对象为 `hidden`。主目录和分类计数只返回/使用 actionable 项，review/hidden 项通过系统管理的只读技术进程记录审计，不提供分类按钮。

产品行按 `productId + platform + classification` 聚合并携带可信 `runtimeImplementations`，保存分类时把同一选择投影到这些现有技术键，不创建虚假身份。该投影不修改 UsageSegment、app usage 统计或 quota 计算；原始账本继续作为事实源。

## 当前修复：ARM-D-012

目录降噪和盘点完整性使用 contracts 1.2.0 的可选 discovery/scan 摘要，Guardian 的现有 ^1.0.0 依赖及业务 import 不变；根 compatibility 测试同步 Minor 版本。旧客户端继续兼容。细则见 SPEC-004 技术设计 checklist；0009 仅本地生成/验证。默认目录不列已成功盘点确认缺失且无使用/配置的旧候选，不删除其原观察记录。

扫描数据每批 200，上限每用户 10,000；超过容量明确部分盘点，不推断卸载。家庭知识 read-model 暂支持 20,000 原始观察（旧 1,000 限制会使多用户正常盘点失败）；超容量明确报错，不能伪报完成。新扫描仅在结束标记生成一次策略投影，避免每个安装批次制造重复版本；运行补充及旧客户端保持即时投影。

原始清单和客户端策略容量分离：未归类解析结果不进入 resolvedApplications，继续使用既有未归类/无限额默认值。非默认有效投影超过旧客户端支持的 1,000 项时返回 APPLICATION_POLICY_CAPACITY 并保留旧策略，不静默截断或保存客户端无法解析的版本。包查询 helper 输出及 C# 重定向读取显式 UTF-8；中文测试只运行合成输出，不执行真实应用查询。

## 当前扩展：ARM-D-011 应用目录与分类规则

产品知识、孩子明确分类、固定分类规则为独立对象；安装观察和原始使用账本分开保存。工程规格见 `specs/SPEC-004-APP-RUNTIME-TECHNICAL-DESIGN.md` 的 ARM-D-011 部分。共享 contracts 1.1.0 增量兼容；本地 additive 0008 不改写历史。Console 保持独立 canonical source，不恢复主 Pages 静态副本。本阶段尚未生产发布，macOS 编译验收待实际 macOS 环境。

## 模块边界

```text
app-runtime-management/
├── contracts/   @timeonchrome/app-runtime-contracts
├── agents/      macOS / Windows
├── backend/     Runtime Worker、D1 migrations、R2 接口
├── console/     独立 Runtime Pages canonical source
├── installer/   Windows 安装与发布资产
└── docs/        Runtime 自身项目真值
```

Runtime 模块禁止导入根目录 `workers/`、`pages/`、Extension 或 Santa 业务代码。Guardian 只允许通过 `@timeonchrome/app-runtime-contracts` 与 Runtime 协作，不得引用 Runtime backend、console 或 Agent 源码。

## 云资源所有权

| 资源 | 所属与回滚边界 |
|---|---|
| Guardian Worker/D1、主控制台 Pages | TimeOnChrome |
| Runtime Worker/D1/R2、Runtime Pages | App Runtime |
| JWT、lifecycle、SSO/API contract | Runtime-owned versioned package |
| Windows/macOS Agent、TimeWhereMg | App Runtime |

生产构建只能来自已合并到 `origin/master` 的干净 Git SHA。功能 worktree 只能本地验证和 Pages preview，禁止操作生产 D1、Worker、Pages 或 R2 latest。

## Browser SSO

1. 主控制台使用当前 Guardian session 调用 `POST /app-runtime/sso/tickets`。
2. Guardian 签发 60 秒、单次、`aud=app-runtime-management:sso` 的 ES256 ticket，并返回固定 Runtime origin 的 fragment launch URL。
3. Runtime Pages 读取 fragment 后立即 `history.replaceState` 清除，再调用 `POST /v2/auth/browser-sessions`。
4. Runtime Worker 原子消费 `jti`，返回 256-bit opaque token；数据库只存 SHA-256。
5. 页面只把 token 放入 `sessionStorage`，使用 `Authorization: RuntimeSession <token>`；绝对有效期 8 小时，不续期。
6. `DELETE /v2/auth/browser-sessions/current` 撤销会话。无 ticket 直接访问时只显示“从家长控制台进入”。

SSO 使用独立 ES256 key pair，不复用 Santa、Runtime machine、module JWT 或 lifecycle keys。一个发布周期内 Runtime API 同时接受旧 Guardian account module JWT 与 RuntimeSession。

## Migration 约束

- Runtime 保留 `0001–0006`，新增 `0007_runtime_browser_sessions.sql`；只允许 additive migration。
- Guardian 保留所有已在生产使用过的文件名，即使 `023–025` 与主线其他 migration 的数字前缀重叠也不得重命名。
- Guardian 远端 migration 追踪表目前为空，禁止运行自动全量 migration apply；新 migration 从 `030` 开始并需显式 schema preflight。

## 拆仓路径

目标仓库为 `timeonchrome-app-runtime`。迁出时保留 `app-runtime-management/` 历史，并接管自身 CI、Cloudflare secrets 和 Runtime 四类生产资源。TimeOnChrome 只保留 Guardian adapter、主控制台入口和固定版本 contract dependency。两仓必须分别构建、部署、回滚，任一部署不得覆盖另一方资源。
