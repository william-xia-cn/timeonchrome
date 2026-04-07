# 家长守护 Guardian Chrome 插件

> 家长上网行为管控 · 白名单/黑名单 · 时长统计 · 时间段控制 · 防绕过设计

---

## 功能模块

| 模块 | 功能 |
|------|------|
| **白/黑名单** | 黑名单屏蔽指定网站；白名单模式仅允许列出的网站 |
| **时间配额** | 全局每日总时长上限 + 单站点独立配额 |
| **时间段控制** | 按星期几设置允许上网的起止时间 |
| **上网统计** | 按域名记录每日时长，保留30天历史 |
| **安全防护** | 管理员密码保护 + 配置完整性校验 |

---

## 文件结构

```
guardian-extension/
├── manifest.json          # 插件配置（MV3）
├── background.js          # Service Worker 核心逻辑
├── content.js             # 页面注入（提示、遮罩）
├── content.css            # 注入样式
├── blocked.html           # 拦截页面
├── popup/
│   ├── popup.html         # 孩子视图（只读状态）
│   └── popup.js
├── admin/
│   ├── admin.html         # 家长管理中心（密码保护）
│   └── admin.js
├── utils/
│   └── storage.js         # 数据层（带完整性校验）
└── rules/
    └── block_rules.json   # 静态规则（初始为空）
```

---

## 安装方法

1. 打开 Chrome，访问 `chrome://extensions/`
2. 开启右上角「开发者模式」
3. 点击「加载已解压的扩展程序」
4. 选择本目录（`guardian-extension/`）
5. 插件图标出现在工具栏
6. **首次点击插件图标 → 管理员设置** 设置密码

---

## 防绕过能力说明

### ✅ 插件内已实现
- 管理员密码保护所有设置项
- `declarativeNetRequest` 规则在 Service Worker 休眠时仍生效
- 配置数据 SHA-256 完整性校验，篡改后自动重置
- 时间配额用完后自动关闭相关 Tab

### ⚠️ 插件层面的局限（需配合系统级方案）
Chrome 插件无法阻止用户：
- 进入 `chrome://extensions/` 禁用或删除插件
- 使用其他浏览器

### 🔒 推荐加固方案（实现真正强制）

**方案 A：Chrome 托管账户（推荐家庭）**
- 使用 Google Family Link 管理孩子的 Google 账户
- 通过 Google 管理控制台强制安装扩展
- 孩子账户无法禁用管理员安装的扩展

**方案 B：Chrome 企业策略（适合技术用户）**
```json
// Windows: 注册表 HKEY_LOCAL_MACHINE\SOFTWARE\Policies\Google\Chrome
// Mac: /Library/Managed Preferences/com.google.Chrome.plist
{
  "ExtensionInstallForcelist": ["插件ID;https://clients2.google.com/service/update2/crx"],
  "ExtensionInstallBlocklist": ["*"],
  "ExtensionInstallAllowlist": ["插件ID"]
}
```

**方案 C：操作系统级控制**
- Windows：家长控制 / Microsoft Family Safety
- macOS：屏幕使用时间
- 路由器层面的 DNS 过滤（AdGuard Home / Pi-hole）

---

## 开发路线图

- [ ] 图标设计（icons/icon16/48/128.png）
- [ ] 统计图表可视化（折线图/饼图）
- [ ] 内容分类过滤（成人内容自动识别）
- [ ] 多孩子账户支持
- [ ] 数据导出（CSV）
- [ ] Chrome Web Store 发布

---

## 技术栈

- Chrome Extension Manifest V3
- Service Worker（background.js）
- `declarativeNetRequest` API（网络层拦截）
- `chrome.storage.local`（持久化）
- `crypto.subtle`（SHA-256 密码哈希）
- 原生 HTML/CSS/JS（零依赖）
