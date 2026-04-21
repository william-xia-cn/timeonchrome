# TimeOnChrome

## 项目概述
Chrome 扩展，家长控制孩子的上网时间。

## 核心功能
- 网站使用时长追踪（事件驱动注意力引擎）
- 学习/休息/待定模式切换
- 配额管理和拦截
- 云端配置同步（只读拉取）
- 家长 Web 控制台

## 技术栈
- Chrome Extension MV3 (Service Worker)
- ES Modules (Chrome 95+)
- Cloudflare Workers (后端 API)
- Cloudflare Pages (家长控制台)

## 架构
- core/ — 纯函数层（signal, context, state, event-log, aggregate）
- runtime/ — 状态管理层（session, recovery）
- product/ — 业务逻辑层（quota, interceptor, analytics）
- infra/ — 基础设施层（storage, cloud-sync）
