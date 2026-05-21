# macOS V0 Smoke Test Checklist

## 结论

macOS 上不需要全量人工回归。只验证 **macOS / Chrome 真实环境可能产生差异的点**：

1. 扩展加载与权限
2. popup 工具栏显示
3. badge / tooltip 状态
4. reminder 页面滑轨和按钮交互
5. 页面内 banner 注入
6. 60s / 90s pending 自动切换
7. tab / window 失焦取消逻辑
8. admin 基本功能
9. 时间统计 smoke

目标时间：**15–25 分钟**。

不需要测试所有网站清单，不需要测试所有分类组合，不需要在 macOS 上跑完整 unit / E2E 自动化。

---

## 0. 测试前准备

| 项 | 操作 | 预期 |
|---|---|---|
| Chrome 版本 | 打开 Chrome | 能正常加载扩展 |
| 扩展加载 | `chrome://extensions` → Load unpacked | 无 manifest / permission 报错 |
| 扩展图标 | 工具栏显示 TimeOnChrome 图标 | 图标可见 |
| 重载后状态 | Reload extension | 无明显启动错误 |

记录：

```text
macOS version:
Chrome version:
Extension path:
Test date:
Tester:
```

---

## 1. Popup / Toolbar 差异验证

macOS 上 toolbar、popup 尺寸和字体可能和 Windows 不同，所以需要看一次。

| 测试项 | 操作 | 预期 |
|---|---|---|
| popup 打开 | 点击扩展图标 | popup 正常打开 |
| 宽度 | 观察 popup | 约 320px，未横向撑开 |
| Header | 观察顶部 | 渐变 header 正常 |
| 模式按钮 | 查看学习 / 休息 / 综合 | 三个按钮纵向排列，不是横排 |
| 当前模式高亮 | 切换模式 | 当前模式高亮明确 |
| 点击切换 | 点学习 / 休息 / 综合 | 模式切换生效 |
| 今日访问 | 打开几个网站后看列表 | 列表显示正常，不挤压 |
| 后台音视频 | 若无音频 | 不应异常占位或显示 `undefined` |

通过标准：

```text
popup 布局没有变形；
模式按钮可点；
当前模式高亮清楚。
```

---

## 2. Badge / Tooltip 差异验证

macOS Chrome 的 badge 渲染、字体和 tooltip 表现可能不同。

| 场景 | 预期 badge |
|---|---|
| Study | `学` |
| Rest | `休` |
| Composite | `综` |
| Paused / monitoring off | `停` |
| Rest → Composite pending | `休…` |
| Rest → Study pending | `休…` |
| Composite → Study pending | `综…` |

手测步骤：

1. 切换到 Rest，看 badge 是否为 `休`。
2. 触发 Rest → Composite pending，看是否为 `休…`。
3. 触发 Composite → Study pending，看是否为 `综…`。
4. 悬停图标，看 tooltip 是否至少不为空、不乱码。

通过标准：

```text
badge 能显示中文；
pending 状态能区分普通模式；
tooltip 不作为主提示，只要求不异常。
```

---

## 3. Study → Rest reminder：滑轨交互

这是 macOS 必测项，因为触控板 / 鼠标 / pointer events 可能有平台差异。

### 场景

```text
当前模式：Study
访问：非学习 / 非综合网站
预期：进入 Study → Rest reminder 页面
```

| 测试项 | 操作 | 预期 |
|---|---|---|
| 页面出现 | Study 下打开普通娱乐 / 未分类站 | reminder 页面出现 |
| 页面稳定 | 停留 5–10 秒 | 不闪烁、不反复刷新 |
| 滑块可拖 | 用鼠标或触控板拖动滑块 | 滑块跟随移动 |
| 未过阈值 | 拖一点后松开 | 回弹，不进入 Rest |
| 过阈值 | 拖到右侧后松开 | 进入 Rest |
| 单击 | 只点击滑块 / 轨道 | 不应直接切 Rest |
| 返回学习 | 点“返回学习” | 行为符合当前设计，不报错 |

通过标准：

```text
macOS 上滑轨可拖；
不会被页面刷新打断；
只有过阈值才切 Rest。
```

---

## 4. Study → Composite reminder：普通确认页

验证视觉统一和按钮并排。macOS 字体 / 宽度可能导致按钮换行。

### 场景

```text
当前模式：Study
访问：composite 网站，例如 google.com / youtube.com / wikipedia.org
预期：进入 Study → Composite reminder 页面
```

| 测试项 | 预期 |
|---|---|
| 页面风格 | 与 Study → Rest 卡片风格一致 |
| 标题 | `你正在打开综合网站` |
| 正文 | `继续后将进入综合时间，本段不会计入学习时间。` |
| 信息条 | `今日综合时间剩余：...` |
| 按钮布局 | 两个按钮并排，不上下堆叠 |
| 主按钮 | `继续（进入综合时间）` |
| 次按钮 | `返回学习` |
| 主按钮行为 | 点击后进入 Composite |
| 返回行为 | 点击后返回 / 关闭，符合现有逻辑 |

通过标准：

```text
按钮不换行；
没有旧的 domain chip / 空 warning box；
确认进入 Composite 可用。
```

---

## 5. Composite → Rest reminder：普通确认页

### 场景

```text
当前模式：Composite
访问：休息 / 非学习网站
预期：进入 Composite → Rest reminder 页面
```

| 测试项 | 预期 |
|---|---|
| 页面风格 | 与 Study → Rest 卡片风格一致 |
| 标题 | `你正在进入休息时间` |
| 正文 | `继续后将进入休息时间，并消耗休息配额。` |
| 信息条 | `今日休息时间剩余：...` |
| 按钮布局 | 两个按钮并排 |
| 主按钮 | `开始休息` |
| 次按钮 | `返回` |
| 主按钮行为 | 点击后进入 Rest |
| 返回行为 | 点击后返回 / 关闭，符合现有逻辑 |

通过标准：

```text
Composite → Rest 没被误改成滑动确认；
两个按钮并排；
休息剩余显示不出现 undefined / NaN。
```

---

## 6. Rest → Composite pending banner

这是 macOS 上最重要的真实页面注入验证。

### 场景

```text
当前模式：Rest
访问：composite 网站，例如 google.com / wikipedia.org / youtube.com
预期：页面内出现单行半透 banner
```

| 测试项 | 预期 |
|---|---|
| banner 可见 | 页面顶部 / 固定位置出现提示 |
| 样式 | 单行、半透、不是黑底大卡片 |
| 文案 | `正在使用综合网站 · {秒数}秒后进入综合时间 · 今日剩余 {时间}` |
| 倒计时 | 秒数持续递减 |
| badge | `休…` |
| 不操作 | 60 秒内不要点鼠标键盘 | 到时自动进入 Composite |
| 成功提示 | `你正在打开综合/待归类网站 · 即将进入综合模式 · 今日剩余 ...` |
| 无 popup 依赖 | 不打开 popup 也能看到页面内提示 |

通过标准：

```text
页面内 banner 是主提示；
不点击键鼠也能自动切 Composite。
```

失败记录重点：

```text
banner 不出现 / 出现在 tooltip / 黑底 / 不倒计时 / 60s 后不切换
```

---

## 7. Rest → Study pending

验证 90 秒逻辑和“不累计”。

### 场景

```text
当前模式：Rest
访问：study 网站，例如 docs.google.com / classroom.google.com / managebac.com
预期：页面内学习 pending banner
```

| 测试项 | 预期 |
|---|---|
| banner 文案 | `正在使用学习网站 · {秒数}秒后进入学习时间` |
| 不显示 | 不应出现 `今日剩余` |
| badge | `休…` |
| 不操作 | 前台连续停留 90 秒 | 自动进入 Study |
| 成功提示 | `你正在打开学习网站 · 即将进入学习模式 · 今日剩余 不限` |

### 不累计验证

1. Rest 下打开 study 网站，等 20–30 秒。
2. 切到非 study 网站或新 tab。
3. 再回到 study 网站。
4. 倒计时应重新从 90 秒开始，而不是接着剩余 60 秒。

通过标准：

```text
Study pending 必须是连续前台停留；
不能累计碎片时间。
```

---

## 8. Composite → Study pending

### 场景

```text
当前模式：Composite
访问：study 网站
预期：页面内学习 pending banner
```

| 测试项 | 预期 |
|---|---|
| banner 文案 | `正在使用学习网站 · {秒数}秒后进入学习时间` |
| badge | `综…` |
| 不显示 | 不出现 `今日剩余` |
| 90 秒 | 连续前台停留后进入 Study |
| 离开再回来 | 重新 90 秒，不累计 |

通过标准：

```text
Composite → Study 和 Rest → Study 规则一致；
只是 pending badge 从 综… 开始。
```

---

## 9. Tab / Window / Focus 取消逻辑

macOS 上窗口焦点、Mission Control、切 tab 行为可能和 Windows 有细节差异。

至少测这 3 个：

| 场景 | 操作 | 预期 |
|---|---|---|
| Rest → Composite pending 中切 tab | 切到其他 tab | pending 取消或重置 |
| Rest → Study pending 中切 tab | 切到其他 tab 再回来 | 重新计时 |
| pending 中切到其他 App | Command + Tab 到其他应用，再回来 | 不应错误直接完成；应取消或按现有规则重置 |

通过标准：

```text
pending 不应在后台偷偷完成；
回到页面后应重新开始或按当前设计重新评估。
```

---

## 10. Admin 基本功能

Admin CSP 仍是 known warning，不把 console warning 当失败。只验功能。

| 测试项 | 预期 |
|---|---|
| stats 页面 | 能打开 |
| rules 页面 | 能打开 |
| devices 页面 | 能打开 |
| 左侧导航 | 可切换 |
| 立即同步 / 立刻更新 | 点击后有 `更新中…` / 成功 / 失败反馈 |
| CSP warning | 如出现，记录即可，不判失败 |
| 页面崩溃 | 不应发生 |

通过标准：

```text
admin 功能可用；
CSP warning 只记录，不作为本轮 blocker。
```

---

## 11. 时间统计 smoke

只做轻量确认，不做精确对账。

| 场景 | 预期 |
|---|---|
| Study 模式使用 study 网站 1–2 分钟 | Study 时间增长 |
| Rest 模式使用普通网站 1–2 分钟 | Rest 时间增长 |
| Composite 模式使用 composite 网站 1–2 分钟 | Composite / undetermined 相关时间增长 |
| Composite 时间 | 不应并入 Study |
| 后台音频 / PiP | 如果可测，确认没有明显异常显示 |

通过标准：

```text
基本统计方向正确；
不需要做秒级精度验证。
```

---

# macOS 手工测试记录模板

```md
# macOS V0 Smoke Test Record

## Environment
- macOS:
- Chrome:
- Extension path:
- Date:
- Tester:

## Results

| Area | Result | Notes |
|---|---|---|
| Extension load | PASS / FAIL | |
| Popup | PASS / FAIL | |
| Badge / tooltip | PASS / FAIL | |
| Study→Rest reminder | PASS / FAIL | |
| Study→Composite reminder | PASS / FAIL | |
| Composite→Rest reminder | PASS / FAIL | |
| Rest→Composite pending | PASS / FAIL | |
| Rest→Study pending | PASS / FAIL | |
| Composite→Study pending | PASS / FAIL | |
| Tab/window focus cancel | PASS / FAIL | |
| Admin basic functions | PASS / FAIL | |
| Time stats smoke | PASS / FAIL | |

## Known issues
- Admin CSP warning: observed / not observed
- Other:

## Conclusion
- macOS V0 smoke: PASS / FAIL
- Blocking issues:
```

---

# 最小通过标准

macOS Smoke 可以通过的条件：

1. 扩展能加载。
2. popup 正常。
3. 三类 reminder 正常。
4. pending banner 正常。
5. 滑轨在 macOS 上可拖。
6. tab / window focus 不导致明显错误。
7. admin 基本功能正常。
8. 时间统计基本增长。

Admin CSP warning 可以记录为 known issue，不阻塞，前提是 admin 功能可用。

---

# 不需要测的内容

1. 不需要全量网站清单逐个测试。
2. 不需要完整自动化 unit / E2E。
3. 不需要所有历史 bug 重测。
4. 不需要深挖 admin CSP。
5. 不需要 Chrome Web Store 提交前材料测试。
6. 不需要所有浏览器版本矩阵。

这份清单的目标是：**验证 macOS 真实环境下最容易出现平台差异的交互点**。
