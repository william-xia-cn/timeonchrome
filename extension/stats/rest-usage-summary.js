import { buildLocalQuotaProjectionV2 } from '../core/quota-read-model-v2.js';
import { getBeijingWeekPeriod } from '../core/profile-account-v2.js';
import { getAdminApplicationUsageAnalysisView } from './application-usage-read-model.js';

const known = value => typeof value === 'number' && Number.isFinite(value) && value >= 0;
const total = (webSeconds, applicationSeconds) => ({ webSeconds, applicationSeconds,
  totalSeconds: known(webSeconds) && known(applicationSeconds) ? webSeconds + applicationSeconds : null });

export function buildRestUsageSummary({ date, period, localProjection, applicationView } = {}) {
  const day = localProjection?.days.find(row => row.date === date);
  const correctionsValid = localProjection && localProjection.correctionIssues.length === 0;
  const webToday = correctionsValid && (!day || day.complete) ? localProjection.today.byQuotaBucket.rest || 0 : null;
  const webWeek = correctionsValid && localProjection.complete ? localProjection.weekRestSeconds : null;
  const appToday = applicationView?.range.from === date && known(applicationView.totalSeconds)
    ? applicationView.categoryTotals.app_restrictedEntertainment || 0 : null;
  const series = applicationView?.weekSummarySeries;
  const appWeek = series?.length === 7 && series.every(row => known(row.totalSeconds))
    ? series.reduce((sum, row) => sum + (row.categories.app_restrictedEntertainment || 0), 0) : null;
  return { date, ...period, today: total(webToday, appToday), week: total(webWeek, appWeek) };
}

export async function readRestUsageSummary({ now = Date.now(), force = false, recheck = false } = {}) {
  const date = new Date(now + 8 * 3_600_000).toISOString().slice(0, 10);
  const period = getBeijingWeekPeriod(date);
  const [data, applicationView] = await Promise.all([
    chrome.storage.local.get(['daily_usage_stats_v1', 'cloud_device_id', 'guardian_config']).catch(() => null),
    getAdminApplicationUsageAnalysisView({ mode: 'day', date, force, recheck }).catch(() => null),
  ]);
  const stats = data?.daily_usage_stats_v1;
  const localProjection = stats && typeof stats === 'object' && !Array.isArray(stats)
    ? buildLocalQuotaProjectionV2(stats, { date, ...period, deviceId: data.cloud_device_id || null,
      corrections: data.guardian_config?.usageAccountingCorrectionsV1 || [] }) : null;
  return buildRestUsageSummary({ date, period, localProjection, applicationView });
}
