// scenarios/sleep-wake.js — Phase 3: 真实 OS 睡眠/唤醒验证（占位，尚未实现）

/**
 * Phase 3 计划：
 * - 在活跃网页 session 期间触发 OS 睡眠（如 standby）
 * - 等待 N 秒后自动唤醒（需要配置 wake timers，通常需要管理员权限）
 * - 重新连接 Playwright 上下文（可能因睡眠断开）
 * - 验证 recover() 在 SW 重启后正确截断 stale session
 *
 * 已知风险：
 * - Windows 自动唤醒需要 wake timers 或 RTC 唤醒，配置复杂
 * - Playwright browser context 在睡眠期间会断开
 * - 需要重新发现 extension ID 和 Service Worker
 * - 笔记本需要插电以避免电池策略干扰
 *
 * 当前状态：BLOCKED — 需要 admin 权限和硬件环境准备
 */

async function runSleepWake() {
  throw new Error(
    'Phase 3 (sleep-wake) 尚未实现。' +
    '该场景需要 OS 睡眠/唤醒自动化，存在以下限制：\n' +
    '1. Windows wake timers 需要管理员权限配置\n' +
    '2. Playwright 上下文会在睡眠期间断开\n' +
    '3. 笔记本建议插电运行\n' +
    '请先完成 Phase 1 (dry-run) 和 Phase 2 (chrome-restart)。'
  );
}

module.exports = { runSleepWake };
