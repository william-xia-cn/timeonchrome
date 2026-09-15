# App Runtime 技术设计

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
