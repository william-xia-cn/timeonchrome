# TimeOnChrome 网站分类候选库

版本：v1
日期：2026-07-25
状态：候选库 / 人工审核依据 / 不改变运行规则

---

## 1. 文件定位

本文维护常见游戏、视频、论坛社区、新闻门户、娱乐门户和综合门户网站的分类候选建议。

本文不是当前运行 source of truth：

- 不修改 `workers/config/site-access-defaults.json`；
- 不自动影响新建 profile；
- 不自动影响现有家庭配置；
- 不等同系统配置清单；
- 不替代 `docs/SITE_ACCESS_POLICY.md`。

将本文候选项提升为系统默认清单，必须另起任务评估影响范围、现有 profile 行为、测试和部署。

---

## 2. 分类原则

| 类型 | 默认建议 | 说明 |
|---|---|---|
| 游戏 | 受限娱乐 | 明确娱乐优先，自由时间可访问，学习模式不默认允许 |
| 视频 | 受限娱乐 | `youtube.com` 根域进入特殊网站对象管理；其他视频站默认受限娱乐候选 |
| 论坛社区 | 受限娱乐 | 大部分泛社区偏信息流/社交/娱乐；技术问答和已批准例外保持现状 |
| 新闻门户 | 复合候选 / 待归类观察 | 可用于时事和资料查阅，但不自动等同学习 |
| 娱乐门户 | 受限娱乐 | 明确娱乐内容入口 |
| 综合门户 | 待归类观察 / 受限娱乐 | 主域信息流强，不默认进入复合网站 |

固定例外：

- `youtube.com`：根域按受限娱乐处理；YouTube playlist / video / channel 作为特殊对象，可由家长批准为学习或复合。
- `reddit.com`：暂保持复合例外。
- `stackoverflow.com` / `stackexchange.com`：保持学习 / 技术用途，不降级。
- `kahoot.it` / `quizizz.com`：课堂工具，不按普通游戏网站处理。

---

## 3. 游戏网站候选

| 域名 | 名称 | 类型 | 建议分类 | 置信度 | 说明 |
|---|---|---|---|---|---|
| `roblox.com` | Roblox | 游戏 | 受限娱乐 | 高 | UGC 游戏平台 |
| `minecraft.net` | Minecraft | 游戏 | 受限娱乐 | 高 | 游戏官网 |
| `steampowered.com` | Steam | 游戏 | 受限娱乐 | 高 | 游戏商店 / 启动器生态 |
| `steamcommunity.com` | Steam Community | 游戏 | 受限娱乐 | 高 | 游戏社区 |
| `epicgames.com` | Epic Games | 游戏 | 受限娱乐 | 高 | 游戏平台 |
| `fortnite.com` | Fortnite | 游戏 | 受限娱乐 | 高 | 游戏官网 |
| `battle.net` | Battle.net | 游戏 | 受限娱乐 | 高 | 游戏平台 |
| `blizzard.com` | Blizzard | 游戏 | 受限娱乐 | 高 | 游戏厂商 |
| `ea.com` | Electronic Arts | 游戏 | 受限娱乐 | 高 | 游戏厂商 |
| `riotgames.com` | Riot Games | 游戏 | 受限娱乐 | 高 | 游戏厂商 |
| `xbox.com` | Xbox | 游戏 | 受限娱乐 | 高 | 游戏平台 |
| `playstation.com` | PlayStation | 游戏 | 受限娱乐 | 高 | 游戏平台 |
| `nintendo.com` | Nintendo | 游戏 | 受限娱乐 | 高 | 游戏平台 |
| `poki.com` | Poki | 游戏 | 受限娱乐 | 高 | 网页小游戏 |
| `crazygames.com` | CrazyGames | 游戏 | 受限娱乐 | 高 | 网页小游戏 |
| `miniclip.com` | Miniclip | 游戏 | 受限娱乐 | 高 | 网页 / 移动游戏 |
| `armorgames.com` | Armor Games | 游戏 | 受限娱乐 | 高 | 网页游戏 |
| `kongregate.com` | Kongregate | 游戏 | 受限娱乐 | 高 | 网页游戏社区 |
| `itch.io` | itch.io | 游戏 | 受限娱乐 | 中 | 独立游戏平台，也可能用于创作学习 |
| `chess.com` | Chess.com | 游戏 | 受限娱乐 | 中 | 益智属性存在，但默认仍是游戏娱乐 |
| `lichess.org` | Lichess | 游戏 | 受限娱乐 | 中 | 益智属性存在，可由家长单独批准 |

---

## 4. 视频 / 直播网站候选

| 域名 | 名称 | 类型 | 建议分类 | 置信度 | 说明 |
|---|---|---|---|---|---|
| `youtube.com` | YouTube | 视频 | 受限娱乐 | 高 | 特殊网站根域；playlist / video / channel 可按对象级规则批准为学习或复合 |
| `youtu.be` | YouTube Short URL | 视频 | 保持现状 | 高 | YouTube 短链接，应跟随 YouTube 规则 |
| `music.youtube.com` | YouTube Music | 视频 | 保持现状 | 高 | 当前系统复合 / 音频清单已有特殊处理 |
| `netflix.com` | Netflix | 视频 | 受限娱乐 | 高 | 影视娱乐 |
| `disneyplus.com` | Disney+ | 视频 | 受限娱乐 | 高 | 影视娱乐 |
| `hulu.com` | Hulu | 视频 | 受限娱乐 | 高 | 影视娱乐 |
| `primevideo.com` | Prime Video | 视频 | 受限娱乐 | 高 | 影视娱乐 |
| `twitch.tv` | Twitch | 视频 | 受限娱乐 | 高 | 直播 / 游戏直播 |
| `bilibili.com` | Bilibili | 视频 | 受限娱乐 | 高 | PO 已确认受限娱乐方向 |
| `vimeo.com` | Vimeo | 视频 | 受限娱乐 | 中 | 有创作/课程用途，但默认视频平台 |
| `dailymotion.com` | Dailymotion | 视频 | 受限娱乐 | 高 | 视频平台 |
| `iqiyi.com` | 爱奇艺 | 视频 | 受限娱乐 | 高 | 影视娱乐 |
| `youku.com` | 优酷 | 视频 | 受限娱乐 | 高 | 视频娱乐 |
| `v.qq.com` | 腾讯视频 | 视频 | 受限娱乐 | 高 | 视频娱乐 |
| `mgtv.com` | 芒果 TV | 视频 | 受限娱乐 | 高 | 视频娱乐 |
| `douyin.com` | 抖音 | 视频 | 受限娱乐 | 高 | 黑名单候选；短视频强娱乐 |
| `tiktok.com` | TikTok | 视频 | 受限娱乐 | 高 | 黑名单候选；短视频强娱乐 |
| `kuaishou.com` | 快手 | 视频 | 受限娱乐 | 高 | 短视频强娱乐 |
| `tudou.com` | 土豆 | 视频 | 受限娱乐 | 中 | 视频娱乐 |
| `nicovideo.jp` | Niconico | 视频 | 受限娱乐 | 中 | 视频社区 |

---

## 5. 论坛 / 社区候选

| 域名 | 名称 | 类型 | 建议分类 | 置信度 | 说明 |
|---|---|---|---|---|---|
| `reddit.com` | Reddit | 论坛社区 | 保持现状 | 高 | 暂保持复合例外 |
| `stackoverflow.com` | Stack Overflow | 论坛社区 | 保持现状 | 高 | 技术问答，不降级 |
| `stackexchange.com` | Stack Exchange | 论坛社区 | 保持现状 | 高 | 技术 / 学术问答，不降级 |
| `discord.com` | Discord | 论坛社区 | 受限娱乐 | 高 | 强社交 / 社群聊天 |
| `x.com` | X | 论坛社区 | 受限娱乐 | 高 | 社交信息流 |
| `twitter.com` | Twitter | 论坛社区 | 受限娱乐 | 高 | `x.com` legacy 域名 |
| `facebook.com` | Facebook | 论坛社区 | 受限娱乐 | 高 | 社交信息流 |
| `instagram.com` | Instagram | 论坛社区 | 受限娱乐 | 高 | 社交 / 图片视频信息流 |
| `threads.net` | Threads | 论坛社区 | 受限娱乐 | 高 | 社交信息流 |
| `snapchat.com` | Snapchat | 论坛社区 | 受限娱乐 | 高 | 社交娱乐 |
| `tumblr.com` | Tumblr | 论坛社区 | 受限娱乐 | 高 | 泛社区 / 娱乐内容 |
| `pinterest.com` | Pinterest | 论坛社区 | 受限娱乐 | 中 | 可用于资料搜集，但默认信息流 |
| `quora.com` | Quora | 论坛社区 | 待归类观察 | 中 | 问答属性存在，不默认学习 |
| `zhihu.com` | 知乎 | 论坛社区 | 待归类观察 | 中 | 问答属性存在，但泛内容明显 |
| `tieba.baidu.com` | 百度贴吧 | 论坛社区 | 受限娱乐 | 高 | 泛论坛 |
| `hupu.com` | 虎扑 | 论坛社区 | 受限娱乐 | 高 | 体育 / 社区娱乐 |
| `nga.cn` | NGA | 论坛社区 | 受限娱乐 | 高 | 游戏 / 泛社区 |
| `v2ex.com` | V2EX | 论坛社区 | 受限娱乐 | 中 | 技术讨论存在，但泛社区属性明显 |
| `gcores.com` | 机核 | 论坛社区 | 受限娱乐 | 高 | 游戏 / 泛娱乐社区 |
| `douban.com` | 豆瓣 | 论坛社区 | 受限娱乐 | 中 | 书影音社区，学习用途需家长单独判断 |

---

## 6. 新闻 / 娱乐 / 综合门户候选

| 域名 | 名称 | 类型 | 建议分类 | 置信度 | 说明 |
|---|---|---|---|---|---|
| `cnn.com` | CNN | 新闻门户 | 复合候选 | 中 | 可用于时事资料，不自动学习 |
| `bbc.com` | BBC | 新闻门户 | 复合候选 | 中 | 可用于时事 / 英语阅读，不自动学习 |
| `bbc.co.uk` | BBC UK | 新闻门户 | 复合候选 | 中 | 可用于时事 / 英语阅读，不自动学习 |
| `reuters.com` | Reuters | 新闻门户 | 复合候选 | 中 | 新闻资料来源，不自动学习 |
| `apnews.com` | AP News | 新闻门户 | 复合候选 | 中 | 新闻资料来源，不自动学习 |
| `npr.org` | NPR | 新闻门户 | 复合候选 | 中 | 新闻 / 音频内容混合 |
| `nytimes.com` | New York Times | 新闻门户 | 复合候选 | 中 | 可用于阅读资料，不自动学习 |
| `washingtonpost.com` | Washington Post | 新闻门户 | 复合候选 | 中 | 可用于阅读资料，不自动学习 |
| `theguardian.com` | The Guardian | 新闻门户 | 复合候选 | 中 | 可用于阅读资料，不自动学习 |
| `thepaper.cn` | 澎湃新闻 | 新闻门户 | 复合候选 | 中 | 新闻资料来源，不自动学习 |
| `caixin.com` | 财新 | 新闻门户 | 复合候选 | 中 | 财经新闻资料，不自动学习 |
| `xinhuanet.com` | 新华网 | 新闻门户 | 复合候选 | 中 | 新闻资料来源，不自动学习 |
| `people.com.cn` | 人民网 | 新闻门户 | 复合候选 | 中 | 新闻资料来源，不自动学习 |
| `tmz.com` | TMZ | 娱乐门户 | 受限娱乐 | 高 | 娱乐八卦 |
| `eonline.com` | E! Online | 娱乐门户 | 受限娱乐 | 高 | 娱乐新闻 |
| `people.com` | People | 娱乐门户 | 受限娱乐 | 高 | 娱乐 / 名人内容 |
| `ew.com` | Entertainment Weekly | 娱乐门户 | 受限娱乐 | 高 | 娱乐内容 |
| `fandom.com` | Fandom | 娱乐门户 | 受限娱乐 | 高 | 游戏 / 影视 fandom 内容 |
| `imdb.com` | IMDb | 娱乐门户 | 受限娱乐 | 高 | 影视娱乐资料 |
| `rottentomatoes.com` | Rotten Tomatoes | 娱乐门户 | 受限娱乐 | 高 | 影视娱乐资料 |
| `movie.douban.com` | 豆瓣电影 | 娱乐门户 | 受限娱乐 | 高 | 影视娱乐 |
| `ent.sina.com.cn` | 新浪娱乐 | 娱乐门户 | 受限娱乐 | 高 | 娱乐频道 |
| `ent.qq.com` | 腾讯娱乐 | 娱乐门户 | 受限娱乐 | 高 | 娱乐频道 |
| `ent.163.com` | 网易娱乐 | 娱乐门户 | 受限娱乐 | 高 | 娱乐频道 |
| `yule.sohu.com` | 搜狐娱乐 | 娱乐门户 | 受限娱乐 | 高 | 娱乐频道 |
| `yahoo.com` | Yahoo | 综合门户 | 待归类观察 | 中 | 主域信息流强，不默认复合 |
| `msn.com` | MSN | 综合门户 | 待归类观察 | 中 | 主域信息流强，不默认复合 |
| `sina.com.cn` | 新浪 | 综合门户 | 待归类观察 | 中 | 主域信息流强，不默认复合 |
| `sohu.com` | 搜狐 | 综合门户 | 待归类观察 | 中 | 主域信息流强，不默认复合 |
| `qq.com` | 腾讯网 | 综合门户 | 待归类观察 | 中 | 主域信息流强，不默认复合 |
| `163.com` | 网易 | 综合门户 | 待归类观察 | 中 | 主域信息流强，不默认复合 |
| `toutiao.com` | 今日头条 | 综合门户 | 受限娱乐 | 高 | 信息流和推荐内容强 |

---

## 7. 后续维护规则

1. 新增候选项必须先判断是否会和现有学习 / 复合例外冲突。
2. 候选库可收录长尾站点，但“置信度低”的站点不得直接提升为系统默认清单。
3. 娱乐频道可比主域更激进地标为受限娱乐。
4. 新闻站不得自动计学习；除非家长或课程路径明确批准。
5. 综合门户主域默认不进入系统复合网站清单。
6. 从候选库提升到运行默认清单时，需要同步更新测试和 `docs/SITE_ACCESS_POLICY.md`。
