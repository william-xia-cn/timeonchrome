# Session & ChangeLog 统计界面实现文档

## 已实现功能

### 1. 增强的统计页面 (`page-stats`)

#### 今日概览卡片（4宫格）
- **🌐 今日在线时长**：总上网时间 + 与昨日对比趋势
- **📚 学习时长**：学习网站累计时间 + 占比百分比
- **☕ 休息时长**：休息模式时间 + 占比百分比  
- **🎯 访问次数**：今日访问会话次数 + 平均会话时长

#### ⏰ 时段分布热力图
- 24小时可视化网格
- 颜色深浅表示不同时段的上网强度
- 支持切换时间范围：今日/本周/本月
- 悬停显示具体时长

#### 🥧 网站类型分布饼图
- Canvas 绘制的动态饼图
- 显示学习/娱乐/其他 三类占比
- 中央显示学习时长百分比

#### 🏆 今日 TOP 网站
- 前5名访问最多的域名
- 带排名徽章（金银铜色）
- 进度条可视化时长对比
- 标记网站类型（学习/娱乐/其他）

#### 📈 专注模式分析
- 深度专注次数（active > 70% 的会话）
- 平均专注时长
- 最长专注时段

#### 📜 变更日志时间线
- 纵向时间轴设计
- 最近10条变更记录
- 不同颜色标识操作类型：
  - 🟢 绿色：添加操作
  - 🔴 红色：删除操作  
  - 🟡 黄色：修改操作
  - 🟣 紫色：模式切换

### 2. 数据统计逻辑

```javascript
// 核心计算函数
calculateTodayStats(config, stats, visitSessions)

// 返回结构
{
  onlineSeconds,      // 总在线时长
  studySeconds,       // 学习时长
  restSeconds,        // 休息时长（计算得出）
  otherSeconds,       // 其他网站时长
  sessionCount,       // 访问次数
  avgSessionDuration, // 平均会话时长
  activeSessions,     // 深度专注次数
  passiveSessions,    // 被动观看次数
  topDomains: [{      // TOP网站
    domain,
    seconds,
    type: 'study'|'rest'|'other'
  }]
}
```

### 3. API 调用

```javascript
// 获取访问会话记录
const sessions = await sendMsg({ 
  type: 'GET_VISIT_SESSIONS', 
  days: 7 
});

// 获取变更日志
const logs = await sendMsg({ 
  type: 'GET_CHANGELOG', 
  limit: 50 
});
```

### 4. 隐私设计

- **Session 记录**：只显示域名，不显示 URL 或标题
- **时间精度**：分钟级别，不显示精确秒数
- **保留时长**：Session 14天，ChangeLog 100条
- **本地存储**：所有数据仅存本地，不上传

### 5. 界面特点

- **统计定位**：强调"使用习惯分析"而非"监控"
- **友好语言**："深度专注"、"高效时段"等正向表达
- **可视化**：热力图、饼图、进度条、趋势指示
- **响应式**：适配不同屏幕尺寸

## 使用说明

1. 打开管理员界面 (`admin.html`)
2. 点击左侧导航"📊 使用分析"
3. 查看今日统计数据
4. 切换时间范围查看不同时段分布
5. 滚动查看变更日志历史

## 技术实现

- **Canvas API**：绘制饼图
- **CSS Grid**：24列热力图网格
- **Flexbox**：卡片布局和对齐
- **Chrome Storage**：数据持久化
- **Message Passing**：前后台通信

## 未来扩展

1. 导出数据为 CSV/JSON
2. 添加趋势折线图（多日期对比）
3. 智能建议（基于模式的学习建议）
4. 周/月报自动生成
