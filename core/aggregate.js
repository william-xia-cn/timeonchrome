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
 * @returns {number} 秒数（仅 ACTIVE，不含 BACKGROUND_ACTIVE 音频时长）
 */
export function computeDuration(events, domain, date) {
  const dayEvents = buildDayEvents(events, date, domain);
  const sorted = sortByTimeStable(dayEvents);
  return computeDomainSeconds(sorted);
}

/**
 * 计算所有域名在指定日期的时长
 *
 * @param {Array<{type: string, state: string, domain: string|null, time: number}>} events
 * @param {string} date - YYYY-MM-DD
 * @returns {Object<string, number>} { 'domain': seconds, ... }
 */
export function computeAllDomains(events, date) {
  return computeAllDomainsWithAudio(events, date).domains;
}

/**
 * 计算所有域名普通时长 + 音频时长（BACKGROUND_ACTIVE）
 *
 * 口径：
 * - domains：仅 ACTIVE 时长
 * - audioSeconds：仅 BACKGROUND_ACTIVE 时长
 */
export function computeAllDomainsWithAudio(events, date) {
  const domains = {};
  const dayEvents = buildDayEvents(events, date);
  const sorted = sortByTimeStable(dayEvents);

  const byDomain = new Map();
  for (const evt of sorted) {
    if (!byDomain.has(evt.domain)) byDomain.set(evt.domain, []);
    byDomain.get(evt.domain).push(evt);
  }

  let audioSeconds = 0;
  for (const [domain, domainEvents] of byDomain.entries()) {
    const { activeSeconds, backgroundAudioSeconds } = computeDomainBreakdown(domainEvents);
    if (activeSeconds > 0) domains[domain] = activeSeconds;
    audioSeconds += backgroundAudioSeconds;
  }

  return { domains, audioSeconds };
}

function buildDayEvents(events, date, domainFilter = null) {
  return events.filter(e => {
    if (!e || !e.domain) return false;
    if (domainFilter && e.domain !== domainFilter) return false;
    if (typeof e.time !== 'number' || Number.isNaN(e.time)) return false;
    return formatTime(e.time).slice(0, 10) === date;
  });
}

function sortByTimeStable(events) {
  return events
    .map((evt, idx) => ({ evt, idx }))
    .sort((a, b) => (a.evt.time - b.evt.time) || (a.idx - b.idx))
    .map(x => x.evt);
}

function computeDomainBreakdown(domainEvents) {
  let activeSeconds = 0;
  let backgroundAudioSeconds = 0;
  let openStart = null;

  for (const evt of domainEvents) {
    if (evt.type === 'START') {
      openStart = evt;
      continue;
    }

    if (evt.type !== 'END') continue;
    if (!openStart) continue; // orphan END

    const durationSec = Math.floor((evt.time - openStart.time) / 1000);
    if (durationSec <= 0) {
      openStart = null;
      continue; // non-positive duration
    }

    const state = openStart.state;
    if (state === 'BACKGROUND_ACTIVE') {
      backgroundAudioSeconds += durationSec;
      openStart = null;
      continue;
    }

    const weight = STATE_WEIGHTS[state];
    if (!weight || weight <= 0) {
      openStart = null; // unknown/passive/idle segment ignored conservatively
      continue;
    }

    activeSeconds += Math.floor(durationSec * weight);
    openStart = null;
  }

  return { activeSeconds, backgroundAudioSeconds };
}

function computeDomainSeconds(domainEvents) {
  return computeDomainBreakdown(domainEvents).activeSeconds;
}

/**
 * 格式化时间戳为 ISO 字符串
 * @param {number} time
 * @returns {string}
 */
function formatTime(time) {
  return new Date(time).toISOString();
}
