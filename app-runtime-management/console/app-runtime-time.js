(function initializeAppRuntimeTime(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.AppRuntimeTime = api;
})(typeof globalThis === 'undefined' ? this : globalThis, () => {
  const BEIJING_OFFSET_MS = 8 * 60 * 60 * 1000;
  const DAY_MS = 24 * 60 * 60 * 1000;
  const dateParts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const hourParts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Shanghai',
    hour: '2-digit',
    hourCycle: 'h23',
  });

  function beijingRange(period, offset = 0, nowMs = Date.now()) {
    if (!['day', 'week'].includes(period)) throw new RangeError('Unsupported usage period.');
    if (!Number.isInteger(offset)) throw new TypeError('Usage range offset must be an integer.');

    const values = Object.fromEntries(
      dateParts.formatToParts(new Date(nowMs)).map(({ type, value }) => [type, value]),
    );
    const calendarDayUtc = Date.UTC(
      Number(values.year),
      Number(values.month) - 1,
      Number(values.day),
    );
    const mondayOffset = (new Date(calendarDayUtc).getUTCDay() + 6) % 7;
    const offsetDays = period === 'day' ? offset : (-mondayOffset + offset * 7);
    const from = calendarDayUtc + offsetDays * DAY_MS - BEIJING_OFFSET_MS;
    const to = from + (period === 'day' ? DAY_MS : 7 * DAY_MS);
    const dateLabel = new Date(from).toLocaleDateString('zh-CN', { timeZone: 'Asia/Shanghai' });
    return {
      from,
      to,
      label: period === 'day' ? dateLabel : `${dateLabel} 起一周`,
    };
  }

  function beijingHourLabel(timestampMs) {
    const hour = hourParts.formatToParts(new Date(timestampMs))
      .find(({ type }) => type === 'hour')?.value;
    if (hour === undefined) throw new RangeError('Unable to format Beijing hour.');
    return `${Number(hour)}时`;
  }

  return { beijingHourLabel, beijingRange };
});
