// product/analytics.js — 统计查询

import { resolveSiteAccessClassification } from '../core/site-classification.js';
import { getTodayStats, getStatsRange, getVisitSessions, getChangelog, getSiteClassificationRequestRecords } from '../infra/storage.js';
import { computeAllDomains } from '../core/aggregate.js';
import { getEvents } from '../core/event-log.js';

export async function getTodayStatsWithCategories(config) {
  const stats = await getTodayStats();
  const siteClassificationRecords = await getSiteClassificationRequestRecords({ includeAll: true }).catch(() => []);

  let studySeconds = 0, compositeSeconds = 0, restSeconds = 0, totalSeconds = 0;
  for (const [domain, seconds] of Object.entries(stats)) {
    if (domain === 'audioSeconds' || domain === 'backgroundMediaByDomain' || domain === 'pipSeconds' || domain === 'pipByDomain' || domain === 'onlineSeconds' || domain === 'compositeSeconds' || domain === 'undeterminedSeconds') continue;
    totalSeconds += seconds;
    const classification = resolveSiteAccessClassification(config || {}, siteClassificationRecords, domain).classification;
    if (classification === 'study') studySeconds += seconds;
    else if (classification === 'composite' || classification === 'pending_composite') compositeSeconds += seconds;
  }
  restSeconds = totalSeconds - studySeconds - compositeSeconds;

  return {
    studySeconds: Math.max(0, studySeconds),
    restSeconds: Math.max(0, restSeconds),
    compositeSeconds,
    undeterminedSeconds: compositeSeconds,
    totalSeconds,
    domains: Object.fromEntries(Object.entries(stats).filter(([domain]) => domain !== 'audioSeconds' && domain !== 'backgroundMediaByDomain' && domain !== 'pipSeconds' && domain !== 'pipByDomain' && domain !== 'onlineSeconds' && domain !== 'compositeSeconds' && domain !== 'undeterminedSeconds')),
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
