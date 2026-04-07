// 数据恢复检查脚本
// 在 Chrome 开发者工具 Console 中运行

async function checkData() {
  console.log('=== 数据完整性检查 ===\n');
  
  // 1. 检查每日统计（最重要的历史数据）
  const allData = await chrome.storage.local.get(null);
  const statsKeys = Object.keys(allData).filter(k => k.startsWith('stats_'));
  console.log(`✅ 每日统计数据: ${statsKeys.length} 天`);
  statsKeys.slice(0, 5).forEach(key => {
    const domains = Object.keys(allData[key]);
    const total = Object.values(allData[key]).reduce((a, b) => a + b, 0);
    console.log(`   ${key}: ${domains.length} 个域名, 总计 ${Math.round(total/60)} 分钟`);
  });
  
  // 2. 检查配置
  const config = allData['guardian_config'];
  if (config) {
    console.log(`\n✅ 配置数据: v${config.version || '旧版本'}`);
    console.log(`   学习网站: ${(config.studyList || []).length} 个`);
    console.log(`   允许网站: ${(config.allowList || []).length} 个`);
    console.log(`   每日配额: ${config.dailyQuota} 分钟`);
  }
  
  // 3. 检查会话
  const session = allData['guardian_session'];
  if (session) {
    console.log(`\n✅ 当前会话: ${session.currentMode} 模式`);
  }
  
  // 4. 检查新功能数据
  const visitSessions = allData['visit_sessions'] || [];
  console.log(`\n🆕 访问会话记录: ${visitSessions.length} 条（从今天开始）`);
  
  const changelog = allData['guardian_changelog'] || [];
  console.log(`🆕 变更日志: ${changelog.length} 条`);
  
  console.log('\n=== 检查完成 ===');
}

checkData();
