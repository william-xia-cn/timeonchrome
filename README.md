# TimeOnChrome v1.5.0

> 家长上网行为管控 Chrome 插件 · MV3 · Cloudflare 云同步 · 多设备支持

---

## 功能模块

| 模块 | 功能 |
|------|------|
| **访问管控** | 白名单（仅允许）/ 黑名单（仅屏蔽）两种模式；学习网站列表 + 允许网站列表独立管理 |
| **三档时间配额** | 每日在线时长 / 学习时长 / 休息时长 独立限额，用完自动锁定 |
| **时间段控制** | 按星期几设置允许上网的起止时间 |
| **使用统计** | 按域名记录每日时长，支持历史查询和云端上传 |
| **云同步** | Cloudflare Workers 后端，多设备共享配置，家长可远程查看和修改 |
| **设备管理** | 自动识别设备（OS + 随机码），支持多设备绑定、重命名、解绑 |
| **孩子友好视图** | Popup 和管理面板均为只读激励视图，展示进度和状态摘要 |
| **临时放行** | 孩子可在拦截页申请临时放行，家长密码授权 |

---

## 文件结构

```
timeonchrome/
├── manifest.json          # 插件配置（MV3）
├── background.js          # Service Worker 核心逻辑
├── content.js             # 页面注入（心跳、媒体检测）
├── content.css            # 注入样式
├── blocked.html           # 拦截页面（含临时放行入口）
├── blocked.js
├── popup/
│   ├── popup.html         # 孩子状态视图（进度条 + 今日统计）
│   └── popup.js
├── admin/
│   ├── admin.html         # 家长管理中心（密码保护，4 个导航页）
│   └── admin.js
├── pages/
│   └── bind.html          # 设备绑定页（首次配置）
├── utils/
│   ├── auth.js            # 认证工具
│   ├── sync.js            # 云同步工具
│   └── config.js          # 配置常量
├── workers/               # Cloudflare Workers 后端
│   ├── src/
│   │   ├── index.ts       # 路由入口
│   │   ├── db/
│   │   │   └── middleware.ts  # JWT (HMAC-SHA256) + D1 工具
│   │   └── routes/
│   │       ├── auth.ts        # 账号注册/登录
│   │       ├── device.ts      # 设备绑定/配置同步
│   │       ├── profiles.ts    # 子档案 CRUD + 设备管理
│   │       ├── stats.ts       # 使用统计上传/查询
│   │       ├── sessions.ts    # Session 文件上传（R2）
│   │       └── changelog.ts   # 配置变更日志
│   └── wrangler.toml
├── rules/
│   └── block_rules.json   # declarativeNetRequest 静态规则
└── docs/                  # 技术文档
    ├── CHANGELOG.md
    ├── DESIGN.md
    ├── PRD.md
    └── TODO.md
```

---

## 安装方法

1. 打开 Chrome，访问 `chrome://extensions/`
2. 开启右上角「开发者模式」
3. 点击「加载已解压的扩展程序」
4. 选择本目录（`timeonchrome/`）
5. 插件图标出现在工具栏
6. 点击插件图标 → 按提示完成账号注册和设备绑定

---

## 管理面板导航

| 页面 | 内容 |
|------|------|
| **今日使用** | 三档配额进度条、域名配额、今日 Top 10 网站 |
| **访问规则** | 学习网站 / 允许网站 / 黑名单标签管理 + 上网时间段配置 |
| **使用分析** | 历史统计图表、域名时长排行 |
| **本机** | 设备信息、云同步状态、配置变更日志 |

---

## 云后端部署

后端使用 Cloudflare Workers + D1 + R2：

```bash
cd workers
npm install
wrangler deploy
```

环境变量（wrangler.toml 或 Cloudflare 控制台）：
- `JWT_SECRET` — JWT 签名密钥（HMAC-SHA256）

---

## 技术栈

- Chrome Extension Manifest V3
- Service Worker（background.js）
- `declarativeNetRequest` API（网络层拦截）
- `chrome.storage.local`（本地持久化）
- `crypto.subtle`（HMAC-SHA256 密码哈希 + JWT 签名）
- Cloudflare Workers（TypeScript）
- Cloudflare D1（SQLite，参数化查询）
- Cloudflare R2（Session 文件存储）
- 原生 HTML/CSS/JS（零前端依赖）

---

## 防绕过说明

### 插件内已实现
- 管理员密码保护所有设置项
- `declarativeNetRequest` 规则在 Service Worker 休眠时仍生效
- 时间配额用完后自动关闭相关 Tab

### 推荐配合系统级方案

**方案 A：Chrome 托管账户（推荐家庭）**  
使用 Google Family Link + 管理控制台强制安装扩展，孩子无法禁用。

**方案 B：Chrome 企业策略**
```json
{
  "ExtensionInstallForcelist": ["插件ID;https://clients2.google.com/service/update2/crx"]
}
```

**方案 C：操作系统级控制**  
Windows 家长控制 / macOS 屏幕使用时间 / 路由器 DNS 过滤

---

## License

MIT License
