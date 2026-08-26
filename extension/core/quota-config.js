// core/quota-config.js — pure quota configuration read model

export const QUOTA_DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

const DAY_BY_UTC_INDEX = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

const TIME_QUOTA_DEFAULTS = {
  studyMinutes: null,
  restMinutes: 120,
  compositeMinutes: 120,
  onlineMinutes: null,
};

function finiteNumber(value) {
  if (value === '' || value === undefined) return undefined;
  if (value === null) return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : undefined;
}

function legacyQuotaMinutes(value, fallback) {
  const number = finiteNumber(value);
  if (number === undefined) return { value: fallback, source: 'default' };
  if (number === null || number === 0) return { value: null, source: 'legacy' };
  return { value: number, source: 'legacy' };
}

function timeQuotaMinutes(dayConfig, field, legacyValue, fallback) {
  if (dayConfig && Object.prototype.hasOwnProperty.call(dayConfig, field)) {
    const value = finiteNumber(dayConfig[field]);
    if (value !== undefined) {
      return { value, source: 'timeQuota' };
    }
  }
  return legacyQuotaMinutes(legacyValue, fallback);
}

export function quotaDayKeyForDate(input = new Date()) {
  if (typeof input === 'string') {
    if (QUOTA_DAYS.includes(input)) return input;
    const match = input.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (match) {
      const y = Number(match[1]);
      const m = Number(match[2]);
      const d = Number(match[3]);
      if (Number.isFinite(y) && Number.isFinite(m) && Number.isFinite(d)) {
        return DAY_BY_UTC_INDEX[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
      }
    }
  }
  const date = input instanceof Date ? input : new Date();
  return DAY_BY_UTC_INDEX[date.getDay()];
}

export function buildEffectiveTimeQuota(config = {}) {
  const sourceDaily = config?.timeQuota?.daily || {};
  const daily = {};
  const sources = {};

  for (const day of QUOTA_DAYS) {
    const dayConfig = sourceDaily[day];
    const study = timeQuotaMinutes(
      dayConfig,
      'studyMinutes',
      config.dailyStudyQuota,
      TIME_QUOTA_DEFAULTS.studyMinutes,
    );
    const rest = timeQuotaMinutes(
      dayConfig,
      'restMinutes',
      config.dailyRestQuota,
      TIME_QUOTA_DEFAULTS.restMinutes,
    );
    const composite = timeQuotaMinutes(
      dayConfig,
      'compositeMinutes',
      config.dailyUndeterminedQuota,
      TIME_QUOTA_DEFAULTS.compositeMinutes,
    );
    const online = timeQuotaMinutes(
      dayConfig,
      'onlineMinutes',
      config.dailyOnlineQuota ?? config.dailyQuota,
      TIME_QUOTA_DEFAULTS.onlineMinutes,
    );
    daily[day] = {
      studyMinutes: study.value,
      restMinutes: rest.value,
      compositeMinutes: composite.value,
      onlineMinutes: online.value,
    };
    sources[day] = {
      study: study.source,
      rest: rest.source,
      composite: composite.source,
      online: online.source,
    };
  }

  return { daily, sources };
}

export function explicitDailyOnlineLimit(config = {}) {
  const number = finiteNumber(config.dailyOnlineQuota ?? config.dailyQuota);
  if (number === undefined || number === null || number === 0) {
    return { value: null, source: number === undefined ? 'missing' : 'legacy' };
  }
  return { value: number, source: 'legacy' };
}

export function weeklyRestLimitFromConfig(config = {}, effectiveDaily = null) {
  const weekly = config?.timeQuota?.weekly;
  if (weekly && Object.prototype.hasOwnProperty.call(weekly, 'restMinutes')) {
    const configured = finiteNumber(weekly.restMinutes);
    return {
      value: configured === undefined ? null : configured,
      source: 'timeQuota',
    };
  }

  if (config.weeklyRestQuota !== undefined && config.weeklyRestQuota !== null && config.weeklyRestQuota !== '') {
    const explicit = finiteNumber(config.weeklyRestQuota);
    if (explicit !== undefined) {
      if (explicit === 0) return { value: null, source: 'legacy' };
      return { value: explicit, source: 'legacy' };
    }
  }
  return { value: null, source: 'default' };
}

export function applyRestQuotaBorrow(baseRestMinutes, config = {}, dateInput = new Date()) {
  if (baseRestMinutes === null) return null;
  const number = finiteNumber(baseRestMinutes);
  if (number === undefined) return null;

  const borrow = config.quotaBorrow;
  if (!borrow || borrow.repaid) return number;

  let dateKey = null;
  if (typeof dateInput === 'string' && /^\d{4}-\d{2}-\d{2}/.test(dateInput)) {
    dateKey = dateInput.slice(0, 10);
  } else if (dateInput instanceof Date) {
    dateKey = [
      dateInput.getFullYear(),
      String(dateInput.getMonth() + 1).padStart(2, '0'),
      String(dateInput.getDate()).padStart(2, '0'),
    ].join('-');
  }
  if (!dateKey) return number;

  if (dateKey === borrow.borrowedFrom) return number + (Number(borrow.amount) || 0);

  const match = String(borrow.borrowedFrom || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return number;
  const repayDate = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  repayDate.setUTCDate(repayDate.getUTCDate() + 1);
  const repayStr = repayDate.toISOString().slice(0, 10);
  if (dateKey === repayStr) return Math.max(0, number - (Number(borrow.amount) || 0));

  return number;
}

export function getEffectiveQuotaForDate(config = {}, dateInput = new Date()) {
  const dayKey = quotaDayKeyForDate(dateInput);
  const timeQuota = buildEffectiveTimeQuota(config);
  const dayQuota = timeQuota.daily[dayKey] || {
    studyMinutes: TIME_QUOTA_DEFAULTS.studyMinutes,
    restMinutes: TIME_QUOTA_DEFAULTS.restMinutes,
    compositeMinutes: TIME_QUOTA_DEFAULTS.compositeMinutes,
    onlineMinutes: TIME_QUOTA_DEFAULTS.onlineMinutes,
  };
  const weeklyRest = weeklyRestLimitFromConfig(config, timeQuota.daily);
  const effectiveRestMinutes = applyRestQuotaBorrow(dayQuota.restMinutes, config, dateInput);

  return {
    dayKey,
    daily: timeQuota.daily,
    sources: timeQuota.sources,
    todayEffectiveQuota: {
      studyMinutes: dayQuota.studyMinutes,
      restMinutes: effectiveRestMinutes,
      baseRestMinutes: dayQuota.restMinutes,
      compositeMinutes: dayQuota.compositeMinutes,
      onlineMinutes: dayQuota.onlineMinutes,
      weeklyRestMinutes: weeklyRest.value,
    },
    weeklyRestLimitMinutes: weeklyRest.value,
    dailyOnlineLimitMinutes: dayQuota.onlineMinutes,
    source: {
      day: timeQuota.sources[dayKey] || {},
      online: timeQuota.sources[dayKey]?.online || 'default',
      weeklyRest: weeklyRest.source,
    },
  };
}

export function quotaMinutesToLimitSeconds(minutes) {
  if (minutes === null || minutes === undefined) return null;
  const number = Number(minutes);
  if (!Number.isFinite(number) || number <= 0) return number === 0 ? 0 : null;
  return number * 60;
}
