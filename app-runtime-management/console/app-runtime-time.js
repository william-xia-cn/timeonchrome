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

  function formatSeconds(value) {
    if(value===null||value===undefined)return '—';
    if(!Number.isSafeInteger(value)||value<0)throw new TypeError('Invalid integer seconds.');
    const hours=Math.floor(value/3600),minutes=Math.floor(value%3600/60),seconds=value%60;
    return (hours?`${hours}小时`:'')+(minutes?`${minutes}分`:'')+(seconds||!hours&&!minutes?`${seconds}秒`:'');
  }
  function applicationSecondsView(snapshot,period) {
    if(snapshot?.durationUnit!=='seconds'||!Array.isArray(snapshot.days)||snapshot.days.length<1||snapshot.days.length>7||!Array.isArray(snapshot.products)
      ||!Array.isArray(snapshot.categories)||!['day','week'].includes(period))throw new TypeError('Invalid seconds snapshot.');
    const check=value=>{if(!Number.isSafeInteger(value)||value<0)throw new TypeError('Invalid integer seconds.');return value;};
    const total=snapshot.totalDuration===null?null:check(snapshot.totalDuration);
    const available=snapshot.availableTotalDuration===null?null:check(snapshot.availableTotalDuration);
    if(snapshot.complete!==true&&total!==null)throw new TypeError('Incomplete total cannot be complete.');
    const categories=snapshot.categories.map(row=>({classification:row.category,durationSeconds:check(row.duration)}));
    const applications=snapshot.products.map(row=>{
      if(!Array.isArray(row.classifications)||!row.classifications.length)throw new TypeError('Missing product classifications.');
      return {subjectKey:row.subjectKey,displayName:row.displayName,classifications:[...row.classifications],durationSeconds:check(row.duration)};
    });
    const buckets=[];
    for(const day of snapshot.days){
      const startAtMs=Date.parse(`${day.date}T00:00:00+08:00`);
      if(!Number.isSafeInteger(startAtMs))throw new TypeError('Invalid date.');
      if(period==='week')buckets.push({startAtMs,durationSeconds:day.totalDuration===null?null:check(day.totalDuration)});
      else for(let hour=0;hour<24;hour++){
        const row=day.hours.find(item=>item.kind==='total'&&item.hour===hour);
        buckets.push({startAtMs:startAtMs+hour*3600000,durationSeconds:row?check(row.duration):null});
      }
    }
    return {durationUnit:'seconds',complete:snapshot.complete===true,totalDurationSeconds:total,
      availableTotalDurationSeconds:available,categories,applications,buckets,
      missingDates:snapshot.days.filter(day=>!day.complete).map(day=>day.date),
      noNewRecordDates:snapshot.days.filter(day=>day.reasonCodes?.includes('APPLICATION_V3_RECORDS_NOT_AVAILABLE')).map(day=>day.date),
      settledThroughMs:snapshot.days.every(day=>day.settledThroughMs!==null)
        ?Math.min(...snapshot.days.map(day=>day.settledThroughMs)):null,revision:snapshot.revision};
  }
  function applicationIdentityView(snapshot) {
    if(snapshot?.model!=='program-instance-v1'||snapshot.durationUnit!=='seconds'
      ||!Array.isArray(snapshot.days)||!snapshot.days.length||!Array.isArray(snapshot.instances)
      ||!Array.isArray(snapshot.applications)||!Array.isArray(snapshot.categories)||!Array.isArray(snapshot.buckets)
      ||typeof snapshot.productStatus?.complete!=='boolean')throw new TypeError('Invalid identity snapshot.');
    const seconds=value=>{formatSeconds(value);return value;};
    const required=value=>{if(value===null||value===undefined)throw new TypeError('Missing seconds.');return seconds(value);};
    if(snapshot.complete!==true&&snapshot.totalDuration!==null)throw new TypeError('Incomplete total cannot be complete.');
    return {durationUnit:'seconds',complete:snapshot.complete===true,
      totalDurationSeconds:seconds(snapshot.totalDuration),availableTotalDurationSeconds:seconds(snapshot.availableTotalDuration),
      categories:snapshot.categories.map(row=>({classification:row.classification,durationSeconds:required(row.duration)})),
      applications:snapshot.applications.map(row=>({...row,durationSeconds:required(row.duration)})),
      instances:snapshot.instances.map(row=>({subjectKey:row.subjectKey,durationSeconds:required(row.duration)})),
      buckets:snapshot.buckets.map(row=>({startAtMs:row.startAtMs,durationSeconds:seconds(row.duration)})),
      productStatus:snapshot.productStatus,
      missingDates:snapshot.days.filter(day=>!day.complete).map(day=>day.date),
      // 缺持久统计不能证明没有原始记录，不推断“无新版记录”。
      noNewRecordDates:[],
      settledThroughMs:snapshot.days.every(day=>Number.isSafeInteger(day.settledThroughMs))
        ?Math.min(...snapshot.days.map(day=>day.settledThroughMs)):null,revision:snapshot.revision};
  }
  return { beijingHourLabel, beijingRange, formatSeconds, applicationSecondsView, applicationIdentityView };
});
