> **⚠️ 本文档已过时（Deprecated）**
>
> 本文使用旧术语 `allowList` / `unsafeList` / `studyList`，与当前产品模型不一致。
> 网站访问分类的最新设计参见 `docs/SITE_ACCESS_POLICY.md`（五类模型：学习网站 / 综合网站 / 受限娱乐网站 / 未归类网站 / 黑名单网站）。
> 本文保留仅作为历史参考，不应用于新开发决策。

# 新统计模型实现计划

## 核心变更

### 1. 时长定义
- **网站时长**: Tab 可见时（非 hidden）即累计，无论 active/passive
- **在线时长**: 所有网站时长之和
- **学习时长**: studyList 中网站的时长之和
- **其他时长**: allowList 中网站的时长之和  
- **休息时长**: 在线时长 - 学习时长 - 其他时长

### 2. 心跳机制（content.js）
- 每 10 秒发送心跳
- 只要 Tab 可见就发送（active 或 passive）
- 隐藏状态不发送

### 3. HEARTBEAT 处理（background.js）
- 只更新域名时长
- 不直接更新学习/休息/在线时长
- 自动切换改为 60 秒触发（无论状态）

### 4. 统计计算（popup.js）
- 打开 popup 时计算
- 每 30 秒自动刷新计算
- 从域名统计数据实时计算学习/休息/其他时长

### 5. 数据存储
- 域名时长: 保持不变（stats_YYYY-MM-DD）
- 删除 session 中的 studySession/restSession/onlineSession
- 保留 currentMode 用于模式切换
