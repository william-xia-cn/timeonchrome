// scenarios/network-offline.js — Phase 4: 网络离线/在线验证（占位，尚未实现）

/**
 * Phase 4 计划：
 * - 在扩展运行期间断开网络（如禁用 Wi-Fi 适配器）
 * - 等待 N 秒
 * - 恢复网络
 * - 验证扩展行为（云同步失败但本地计时继续）
 *
 * 已知风险：
 * - 禁用网络适配器（netsh / Device Manager）需要管理员权限
 * - 断开网络会中断 Playwright 与浏览器的控制通道
 * - 如果测试控制器本身依赖网络，可能导致测试失控
 *
 * 替代方案：
 * - 使用本地代理模拟离线（如 Mock Service Worker）
 * - 或让 offline 阶段在一个完全隔离的进程中运行
 *
 * 当前状态：BLOCKED — 需要 admin 权限和通信通道隔离设计
 */

async function runNetworkOffline() {
  throw new Error(
    'Phase 4 (network-offline) 尚未实现。' +
    '该场景需要网络适配器控制，存在以下限制：\n' +
    '1. 禁用网络需要管理员权限（netsh / Device Manager）\n' +
    '2. 断网会中断 Playwright 与浏览器的通信\n' +
    '3. 建议先用代理模拟或隔离进程方案\n' +
    '请先完成 Phase 1 (dry-run) 和 Phase 2 (chrome-restart)。'
  );
}

module.exports = { runNetworkOffline };
