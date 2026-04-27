// product/analytics.js — 统计查询

import { getTodayStats, getStatsRange, getTodayUndeterminedStats, getVisitSessions, getChangelog, matchDomain } from '../infra/storage.js';
import { computeAllDomains } from '../core/aggregate.js';
import { getEvents } from '../core/event-log.js';

export async function getTodayStatsWithCategories(config) {
  const stats = await getTodayStats();
  const undeterminedStats = await getTodayUndeterminedStats();

  let studySeconds = 0, undeterminedSeconds = 0, restSeconds = 0, totalSeconds = 0;
  for (const [domain, seconds] of Object.entries(stats)) {
    if (domain === 'audioSeconds' || domain === 'backgroundMediaByDomain' || domain === 'pipSeconds' || domain === 'pipByDomain') continue;
    totalSeconds += seconds;
    const isStudy = (config?.studyList || []).some(p => matchDomain(domain, p));
    if (isStudy) studySeconds += seconds;
  }
  for (const seconds of Object.values(undeterminedStats)) undeterminedSeconds += seconds;
  restSeconds = totalSeconds - studySeconds - undeterminedSeconds;

  return {
    studySeconds: Math.max(0, studySeconds),
    restSeconds: Math.max(0, restSeconds),
    undeterminedSeconds,
    totalSeconds,
    domains: Object.fromEntries(Object.entries(stats).filter(([domain]) => domain !== 'audioSeconds' && domain !== 'backgroundMediaByDomain' && domain !== 'pipSeconds' && domain !== 'pipByDomain')),
    audioSeconds: Number(stats.audioSeconds) || 0,
    backgroundMediaByDomain: stats.backgroundMediaByDomain || {},
    pipSeconds: Number(stats.pipSeconds) || 0,
    pipByDomain: stats.pipByDomain || {},
  };
}

export async function getStatsWithAggregate(days = 7) {
  const events = await getEvents();
  const result = {};
  for (let i = 0; i < days; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().slice(0, 10);
    result[dateStr] = computeAllDomains(events, dateStr);
  }
  return result;
}

export { getStatsRange, getVisitSessions, getChangelog };
