// product/analytics.js — 统计查询

import { getStatsRange, getVisitSessions, getChangelog } from '../infra/storage.js';
import { computeAllDomains } from '../core/aggregate.js';
import { getEvents } from '../core/event-log.js';
import { getQuotaUsageView } from '../stats/managed-statistics.js';

export async function getTodayStatsWithCategories(config) {
  const view = await getQuotaUsageView(undefined, { config: config || {} });

  return {
    studySeconds: view.studySeconds,
    restSeconds: view.restSeconds,
    compositeSeconds: view.compositeSeconds,
    undeterminedSeconds: view.undeterminedSeconds,
    totalSeconds: view.totalSeconds,
    domains: view.domainSeconds || {},
    audioSeconds: view.media.backgroundMediaSeconds,
    backgroundMediaByDomain: view.media.backgroundMediaByDomain,
    pipSeconds: view.media.pipSeconds,
    pipByDomain: view.media.pipByDomain,
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
