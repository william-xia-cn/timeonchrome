// popup-debug.js - 调试脚本
// 在 popup 的开发者工具 Console 中运行

async function debugPopup() {
  console.log('=== Popup 调试信息 ===\n');
  
  // 1. 检查消息通信
  console.log('1. 测试消息通信...');
  try {
    const config = await new Promise(resolve => {
      chrome.runtime.sendMessage({ type: 'GET_CONFIG' }, resolve);
    });
    console.log('✅ GET_CONFIG 成功:', config ? '有数据' : '无数据');
    if (config) {
      console.log('   - 插件启用:', config.enabled);
      console.log('   - 当前模式:', config.mode);
      console.log('   - 学习网站数:', (config.studyList || []).length);
      console.log('   - 允许网站数:', (config.allowList || []).length);
    }
  } catch (e) {
    console.log('❌ GET_CONFIG 失败:', e.message);
  }
  
  // 2. 检查统计数据
  console.log('\n2. 测试统计数据...');
  try {
    const stats = await new Promise(resolve => {
      chrome.runtime.sendMessage({ type: 'GET_STATS' }, resolve);
    });
    console.log('✅ GET_STATS 成功');
    const domains = Object.keys(stats || {});
    console.log('   - 域名数量:', domains.length);
    if (domains.length > 0) {
      const total = Object.values(stats).reduce((a, b) => a + b, 0);
      console.log('   - 总时长:', Math.round(total / 60), '分钟');
      console.log('   - 域名列表:', domains.slice(0, 5).join(', '));
    } else {
      console.log('   - 暂无统计数据');
    }
  } catch (e) {
    console.log('❌ GET_STATS 失败:', e.message);
  }
  
  // 3. 检查 Session
  console.log('\n3. 测试 Session...');
  try {
    const session = await new Promise(resolve => {
      chrome.runtime.sendMessage({ type: 'GET_SESSION' }, resolve);
    });
    console.log('✅ GET_SESSION 成功:', session ? '有数据' : '无数据');
    if (session) {
      console.log('   - 当前模式:', session.currentMode);
    }
  } catch (e) {
    console.log('❌ GET_SESSION 失败:', e.message);
  }
  
  // 4. 检查 DOM 元素
  console.log('\n4. 检查 DOM 元素...');
  const elements = [
    'status-timer',
    'study-time-stat',
    'rest-time-stat',
    'online-time-stat',
    'status-value',
    'btn-study',
    'btn-rest'
  ];
  
  elements.forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      console.log(`✅ #${id} 存在, 内容: "${el.textContent.substring(0, 30)}"`);
    } else {
      console.log(`❌ #${id} 不存在`);
    }
  });
  
  // 5. 检查当前显示
  console.log('\n5. 当前显示状态:');
  const timerEl = document.getElementById('status-timer');
  const studyEl = document.getElementById('study-time-stat');
  const restEl = document.getElementById('rest-time-stat');
  const onlineEl = document.getElementById('online-time-stat');
  
  console.log('   - 计时器:', timerEl ? timerEl.textContent : 'N/A');
  console.log('   - 学习时长:', studyEl ? studyEl.textContent : 'N/A');
  console.log('   - 休息时长:', restEl ? restEl.textContent : 'N/A');
  console.log('   - 在线时长:', onlineEl ? onlineEl.textContent : 'N/A');
  
  console.log('\n=== 调试完成 ===');
}

// 运行调试
debugPopup();
