# Chrome Web Store Listing Copy - TimeOnChrome v1.7.8

## Short Description
TimeOnChrome helps families manage Chrome use with study modes, usage analysis, site requests, quotas, sync, and diagnostics.

## Detailed Description
TimeOnChrome 是一款面向家庭和学生的 Chrome 使用时间管理扩展，帮助家长和孩子理解浏览时间、网站归类、访问规则、配额限制、时间段控制和设备同步状态。

### 数据与隐私显著披露
TimeOnChrome 为实现家庭浏览时间管理，会处理浏览使用元数据：访问域名或家长配置的管理对象、开始和结束时间、使用时长、当前模式、访问控制结果、网站归类申请、设备连接状态、媒体使用元数据、诊断日志，以及可选云同步所需的账户和会话状态。

首次使用、更新后缺少同意记录，或本地数据被清空时，扩展会先显示产品内“隐私与数据使用说明”。用户点击“我已阅读并同意，启用 TimeOnChrome”之前，TimeOnChrome 不会启动新的网页计时、媒体记录、云端同步、诊断上传或 Chrome 身份恢复。

同意后，本地计时和访问管理数据会保存在 Chrome 扩展本地存储中。云端同步只有在家长或监护人登录并将孩子终端绑定到云端档案后才开始。绑定后，家长或监护人可以在云端控制台查看和管理该子用户的访问规则、网站归类申请、设备状态、使用统计和诊断信息。

TimeOnChrome 不收集网页正文、表单输入、私聊内容、评论内容、密码、网站 Cookie、支付信息、Google OAuth token 或原始 Chrome identity。identity / identity.email 权限只用于调用 chrome.identity.getProfileUserInfo()，读取 Chrome profile 的账号标识以帮助 macOS / Windows 终端在扩展重装后恢复原有设备绑定。TimeOnChrome 不调用 chrome.identity.getAuthToken()，不使用 Google OAuth；云端只保存服务端生成的不可逆 HMAC hash，用于恢复匹配。

用户可以通过禁用或卸载扩展停止后续本地记录。家长可以在云端控制台解绑设备以停止该终端云同步，也可以通过产品界面或支持渠道删除或替换档案配置。

### v1.7.8 更新
- 新增产品内显著披露和明确同意页。缺少同意记录时，扩展保持暂停，不启动新的计时、媒体记录、云同步、诊断上传或 Chrome 身份恢复。
- 更新 Popup、本机 Admin 和绑定页，在未同意时显示“隐私与数据使用说明待确认”，并提供查看同意入口。
- 隐私政策、CWS 商品说明和审核说明同步说明：本地收集从用户点击同意后开始，云端上传从家长登录并绑定终端后开始。

### 核心功能
- Screen Time 风格的网页使用和媒体使用统计。
- 学习、综合、休息、锁定、暂停等运行模式。
- 学习网站、综合网站、受限娱乐、黑名单和规范化 URL 规则管理。
- 孩子端网站归类申请和家长云端审核。
- 每日配额和模式时间段控制。
- 长期终端绑定、云端显式解绑、macOS / Windows 扩展重装恢复。
- 本地和云端诊断：同步、设备连接、计时落账、checkpoint health 和 ledger-gap。

### 隐私摘要
TimeOnChrome 只保存时间管理、网站归类、配额执行、诊断、设备恢复和可选云同步所需的数据。无痕窗口中的未管理/兜底记录会在持久化和上传前匿名化。TimeOnChrome 不出售用户数据，不用于广告，不与数据经纪商或广告平台共享用户数据。
