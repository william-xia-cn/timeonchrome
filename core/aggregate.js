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
  const { start, end } = getLocalDayRange(date);
  const domainEvents = buildValidEvents(events, domain);
  const sorted = sortByTimeStable(domainEvents);
  return computeDomainSeconds(sorted, start, end);
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
 * - backgroundMediaByDomain：按 domain 归因的 BACKGROUND_ACTIVE 时长
 */
export function computeAllDomainsWithAudio(events, date) {
  const domains = {};
  const backgroundMediaByDomain = {};
  const { start, end } = getLocalDayRange(date);
  const validEvents = buildValidEvents(events);
  const sorted = sortByTimeStable(validEvents);

  const byDomain = new Map();
  for (const evt of sorted) {
    if (!byDomain.has(evt.domain)) byDomain.set(evt.domain, []);
    byDomain.get(evt.domain).push(evt);
  }

  let audioSeconds = 0;
  for (const [domain, domainEvents] of byDomain.entries()) {
    const { activeSeconds, backgroundAudioSeconds } = computeDomainBreakdown(domainEvents, start, end);
    if (activeSeconds > 0) domains[domain] = activeSeconds;
    if (backgroundAudioSeconds > 0) {
      backgroundMediaByDomain[domain] = backgroundAudioSeconds;
      audioSeconds += backgroundAudioSeconds;
    }
  }

  return { domains, audioSeconds, backgroundMediaByDomain };
}

function buildValidEvents(events, domainFilter = null) {
  return events.filter(e => {
    if (!e || !e.domain) return false;
    if (domainFilter && e.domain !== domainFilter) return false;
    if (typeof e.time !== 'number' || Number.isNaN(e.time)) return false;
    return true;
  });
}

function getLocalDayRange(date) {
  const [year, month, day] = date.split('-').map(Number);
  const start = new Date(year, month - 1, day).getTime();
  const end = new Date(year, month - 1, day + 1).getTime();
  return { start, end };
}

function sortByTimeStable(events) {
  return events
    .map((evt, idx) => ({ evt, idx }))
    .sort((a, b) => (a.evt.time - b.evt.time) || (a.idx - b.idx))
    .map(x => x.evt);
}

function computeDomainBreakdown(domainEvents, windowStart, windowEnd) {
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

    const overlapStart = Math.max(openStart.time, windowStart);
    const overlapEnd = Math.min(evt.time, windowEnd);
    const durationSec = Math.floor((overlapEnd - overlapStart) / 1000);
    if (durationSec <= 0) {
      openStart = null;
      continue; // no overlap with target local day
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

function computeDomainSeconds(domainEvents, windowStart, windowEnd) {
  return computeDomainBreakdown(domainEvents, windowStart, windowEnd).activeSeconds;
}
