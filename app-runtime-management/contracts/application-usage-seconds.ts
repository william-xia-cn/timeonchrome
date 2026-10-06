/** 应用权威秒统计的只读传输；不生成统计、重分类或计算配额。 */
export const APPLICATION_USAGE_SECONDS_READ_CAPABILITY = 'application-usage-seconds-read-v1' as const;
export const APPLICATION_USAGE_SECONDS_PAGE_SIZE = 100;
export const APPLICATION_USAGE_SECONDS_MAX_OFFSET = 20_000;
export const APPLICATION_USAGE_SECONDS_REVISION_PATTERN = '^[A-Za-z0-9][A-Za-z0-9:_-]{0,159}$';
export interface ApplicationUsageSecondsQuery {
  fromDate: string; toDate: string; offset: number; expectedRevision?: string;
}
export interface ApplicationUsageSecondsHour {
  hour: number; totalSeconds: number; categoriesSeconds: Readonly<Record<string, number>>;
}
export interface ApplicationUsageSecondsDay {
  date: string;
  status: 'available' | 'pending_update' | 'incomplete' | 'unknown';
  generatedAtMs: number | null; settledThroughMs: number | null;
  complete: boolean; reasonCodes: readonly string[];
  totalSeconds: number | null;
  categoriesSeconds: Readonly<Record<string, number>>;
  hours: readonly ApplicationUsageSecondsHour[];
}
export interface ApplicationUsageSecondsRow {
  key: string; name: string; classifications: readonly string[];
  totalSeconds: number | null; knownTotalSeconds: number;
  dailySeconds: Readonly<Record<string, number | null>>;
}
export interface ApplicationUsageSecondsSnapshot {
  schemaVersion: 2; durationUnit: 'seconds';
  fromDate: string; toDate: string; revision: string;
  /** 冻结统计生成时间，不随翻页改变；未知范围可为null。 */
  computedAtMs: number | null; lastSettledAtMs: number | null;
  complete: boolean; reasonCodes: readonly string[];
  totalSeconds: number | null; knownTotalSeconds: number;
  knownCategoriesSeconds: Readonly<Record<string, number>>;
  days: readonly ApplicationUsageSecondsDay[];
  applications: readonly ApplicationUsageSecondsRow[];
  nextOffset: number | null;
}
const revisionPattern = new RegExp(APPLICATION_USAGE_SECONDS_REVISION_PATTERN);
function dateMs(value: unknown): number {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return NaN;
  const n = Date.parse(value + 'T00:00:00+08:00');
  return Number.isFinite(n) && new Date(n + 28_800_000).toISOString().slice(0, 10) === value ? n : NaN;
}
/** 请求不能自报Child/User/来源，也不能跳过后续页的冻结revision。 */
export function validateApplicationUsageSecondsQuery(value: unknown): ApplicationUsageSecondsQuery {
  const fail = () => { throw new Error('APPLICATION_USAGE_SECONDS_INVALID_QUERY'); };
  if (!value || typeof value !== 'object' || Array.isArray(value)) return fail();
  const q = value as Record<string, unknown>;
  if (Object.keys(q).some(k => !['fromDate','toDate','offset','expectedRevision'].includes(k))) return fail();
  const start = dateMs(q.fromDate), end = dateMs(q.toDate);
  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end < start || end - start > 6 * 86_400_000
    || !Number.isSafeInteger(q.offset) || Number(q.offset) < 0 || Number(q.offset) > APPLICATION_USAGE_SECONDS_MAX_OFFSET
    || (q.expectedRevision !== undefined && (typeof q.expectedRevision !== 'string' || !revisionPattern.test(q.expectedRevision)))
    || (Number(q.offset) > 0 && q.expectedRevision === undefined)) return fail();
  return value as ApplicationUsageSecondsQuery;
}

const categories = new Set(['study','composite','restrictedEntertainment','unclassified','other','blocked','historicalUnknown']);
const invalidSnapshot = () => { throw new Error('APPLICATION_USAGE_SECONDS_INVALID_SNAPSHOT'); };
function object(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return invalidSnapshot();
  const obj = value as Record<string, unknown>;
  if (Object.keys(obj).length !== keys.length || keys.some(k => !Object.hasOwn(obj,k))) return invalidSnapshot();
  return obj;
}
function integer(value: unknown, max = Number.MAX_SAFE_INTEGER): number {
  if (!Number.isSafeInteger(value) || Number(value) < 0 || Number(value) > max) return invalidSnapshot();
  return value as number;
}
function nullableInteger(value: unknown, max = Number.MAX_SAFE_INTEGER): number | null {
  return value === null ? null : integer(value,max);
}
function text(value: unknown, max: number): string {
  if (typeof value !== 'string' || !value.length || value.length > max || /[\u0000-\u001f\u007f]/.test(value)) return invalidSnapshot();
  return value;
}
function reasons(value: unknown): void {
  if (!Array.isArray(value) || value.length > 32 || new Set(value).size !== value.length
    || value.some(v => typeof v !== 'string' || !/^[A-Z][A-Z0-9_]{0,63}$/.test(v))) invalidSnapshot();
}
function categoryMap(value: unknown, max: number): Record<string, number> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return invalidSnapshot();
  const map = value as Record<string, number>;
  for (const [key,n] of Object.entries(map)) { if (!categories.has(key)) invalidSnapshot(); integer(n,max); }
  return map;
}
function mapsEqual(a: Record<string, number>, b: Record<string, number>): boolean {
  return [...new Set([...Object.keys(a),...Object.keys(b)])].every(k => (a[k] ?? 0) === (b[k] ?? 0));
}
/** 校验只读页面的范围、完整性、自己的日小时守恒与分页；不重算来源统计。 */
export function validateApplicationUsageSecondsSnapshot(value: unknown, query: ApplicationUsageSecondsQuery): ApplicationUsageSecondsSnapshot {
  validateApplicationUsageSecondsQuery(query);
  const p = object(value,['schemaVersion','durationUnit','fromDate','toDate','revision','computedAtMs','lastSettledAtMs',
    'complete','reasonCodes','totalSeconds','knownTotalSeconds','knownCategoriesSeconds','days','applications','nextOffset']);
  if (p.schemaVersion !== 2 || p.durationUnit !== 'seconds' || p.fromDate !== query.fromDate || p.toDate !== query.toDate
    || typeof p.complete !== 'boolean' || !revisionPattern.test(text(p.revision,160))
    || (query.expectedRevision !== undefined && p.revision !== query.expectedRevision)) return invalidSnapshot();
  nullableInteger(p.computedAtMs); nullableInteger(p.lastSettledAtMs); reasons(p.reasonCodes);
  const count = (dateMs(query.toDate) - dateMs(query.fromDate)) / 86_400_000 + 1;
  if (!Array.isArray(p.days) || p.days.length !== count || !Array.isArray(p.applications)
    || p.applications.length > APPLICATION_USAGE_SECONDS_PAGE_SIZE) return invalidSnapshot();
  const dayTotals = new Map<string, number | null>();
  const dayComplete = new Map<string, boolean>();
  const categoryTotals: Record<string,number> = {};
  let known = 0, computed: number | null = null, settled: number | null = null, complete = true;
  for (let index=0; index < p.days.length; index++) {
    const d=object(p.days[index],['date','status','generatedAtMs','settledThroughMs','complete','reasonCodes','totalSeconds','categoriesSeconds','hours']);
    const date = new Date(dateMs(query.fromDate)+index*86_400_000+28_800_000).toISOString().slice(0,10);
    if (d.date !== date || !['available','pending_update','incomplete','unknown'].includes(String(d.status))
      || typeof d.complete !== 'boolean' || !Array.isArray(d.hours)) return invalidSnapshot();
    const total=nullableInteger(d.totalSeconds,86_400), generated=nullableInteger(d.generatedAtMs), cutoff=nullableInteger(d.settledThroughMs);
    reasons(d.reasonCodes); const daily=categoryMap(d.categoriesSeconds,total ?? 0);
    if ((d.status === 'unknown' && (total !== null || d.complete || d.hours.length || generated !== null || cutoff !== null))
      || (d.status !== 'unknown' && (total === null || generated === null || d.hours.length !== 24))
      || (d.status === 'available' && !d.complete) || (d.status === 'incomplete' && d.complete)
      || (cutoff !== null && (generated === null || cutoff > generated))) return invalidSnapshot();
    let hourlyTotal=0; const hourlyCategories: Record<string,number>={};
    for (let hour=0;hour<d.hours.length;hour++) {
      const h=object(d.hours[hour],['hour','totalSeconds','categoriesSeconds']);
      if(h.hour!==hour)return invalidSnapshot();
      hourlyTotal+=integer(h.totalSeconds,3600);
      // 独立维度的小时量化不要求分类小于此小时总量。
      for(const [key,n]of Object.entries(categoryMap(h.categoriesSeconds,3600)))hourlyCategories[key]=(hourlyCategories[key]??0)+n;
    }
    if(total!==null && (total!==hourlyTotal || !mapsEqual(daily,hourlyCategories)))return invalidSnapshot();
    for(const[key,n]of Object.entries(daily))categoryTotals[key]=(categoryTotals[key]??0)+n;
    if(total!==null)known+=total;
    if(generated!==null)computed=Math.max(computed??0,generated);
    if(cutoff!==null)settled=Math.max(settled??0,cutoff);
    complete=complete&&d.complete;
    dayTotals.set(date,total); dayComplete.set(date,d.complete);
  }
  if(p.complete!==complete || p.knownTotalSeconds!==known || p.totalSeconds!==(complete?known:null)
    || p.computedAtMs!==computed || p.lastSettledAtMs!==settled
    || !mapsEqual(categoryMap(p.knownCategoriesSeconds,count*86_400),categoryTotals))return invalidSnapshot();
  const keys=new Set<string>();
  for(const raw of p.applications) {
    const app=object(raw,['key','name','classifications','totalSeconds','knownTotalSeconds','dailySeconds']);
    const key=text(app.key,128); text(app.name,160);
    if(!/^[A-Za-z0-9][A-Za-z0-9:_-]{0,127}$/.test(key)||keys.has(key))return invalidSnapshot(); keys.add(key);
    if(!Array.isArray(app.classifications)||!app.classifications.length||app.classifications.length>categories.size
      ||new Set(app.classifications).size!==app.classifications.length||app.classifications.some(c=>!categories.has(c)))return invalidSnapshot();
    const daily=object(app.dailySeconds,[...dayTotals.keys()]);let subtotal=0;
    for(const[date,n]of Object.entries(daily)) {
      const seconds=nullableInteger(n,dayTotals.get(date)??0);
      if(seconds===null&&dayComplete.get(date))return invalidSnapshot();
      if(seconds!==null)subtotal+=seconds;
    }
    if(app.knownTotalSeconds!==subtotal || app.totalSeconds!==(complete?subtotal:null))return invalidSnapshot();
  }
  if(p.nextOffset!==null && (integer(p.nextOffset,APPLICATION_USAGE_SECONDS_MAX_OFFSET)!==query.offset+APPLICATION_USAGE_SECONDS_PAGE_SIZE
    ||p.applications.length!==APPLICATION_USAGE_SECONDS_PAGE_SIZE))return invalidSnapshot();
  return value as ApplicationUsageSecondsSnapshot;
}
