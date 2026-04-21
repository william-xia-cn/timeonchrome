// core/aggregate.js — 时长计算（纯函数）

const STATE_WEIGHTS = {
  ACTIVE: 1,
  BACKGROUND_ACTIVE: 1,
  PASSIVE: 0,
  IDLE: 0,
};

/**
 * 计算指定域名在指定日期的时长（秒）
 *
 * @param {Array<{type: string, state: string, domain: string|null, time: number}>} events
 * @param {string} domain
 * @param {string} date - YYYY-MM-DD
 * @returns {number} 秒数
 */
export function computeDuration(events, domain, date) {
  const dayEvents = events.filter(e =>
    e.domain === domain &&
    formatTime(e.time).slice(0, 10) === date
  );

  let total = 0;
  for (let i = 0; i < dayEvents.length - 1; i++) {
    if (dayEvents[i].type === 'START') {
      const weight = STATE_WEIGHTS[dayEvents[i].state] || 0;
      const duration = (dayEvents[i + 1].time - dayEvents[i].time) / 1000;
      total += duration * weight;
    }
  }
  return Math.floor(total);
}

/**
 * 计算所有域名在指定日期的时长
 *
 * @param {Array<{type: string, state: string, domain: string|null, time: number}>} events
 * @param {string} date - YYYY-MM-DD
 * @returns {Object<string, number>} { 'domain': seconds, ... }
 */
export function computeAllDomains(events, date) {
  const result = {};
  const dayEvents = events.filter(e =>
    e.domain && formatTime(e.time).slice(0, 10) === date
  );

  for (let i = 0; i < dayEvents.length - 1; i++) {
    const evt = dayEvents[i];
    if (evt.type === 'START' && evt.domain) {
      const weight = STATE_WEIGHTS[evt.state] || 0;
      const duration = (dayEvents[i + 1].time - dayEvents[i].time) / 1000;
      const seconds = Math.floor(duration * weight);
      if (seconds > 0) {
        result[evt.domain] = (result[evt.domain] || 0) + seconds;
      }
    }
  }
  return result;
}

/**
 * 格式化时间戳为 ISO 字符串
 * @param {number} time
 * @returns {string}
 */
function formatTime(time) {
  return new Date(time).toISOString();
}
