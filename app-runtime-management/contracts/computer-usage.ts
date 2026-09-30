/** D-111: cloud-owned display projection, never a ledger or a quota authority. */
export const COMPUTER_USAGE_SCHEMA_VERSION = 1 as const;
export const COMPUTER_USAGE_DISPLAY_RULE_VERSION = '2';
export const COMPUTER_USAGE_MAX_INTERVALS = 20_000;

export interface ComputerUsageInterval {
  startMs: number;
  endMs: number;
  classification: string;
  /** Opaque product/site display key; never a segment ID or a raw runtime identity. */
  subjectKey: string;
  label: string;
}
interface ComputerUsageSource {
  key: string;
  /** Only an already verified physical-computer association; Child is not this key. */
  computerKey: string | null;
  /** Stable opaque source selector across dates, not a physical-computer assertion. */
  sourceGroupKey?: string;
  computerName: string;
  revision: string;
  correctionRevision: string;
  settledAtMs: number | null;
  complete: boolean;
  /** Statistics availability is independent of exact overlap evidence. */
  statisticsComplete?: boolean;
  historyQuality?: 'bestEffort';
  reasons: string[];
  totalMs: number | null;
  categoriesMs: Record<string, number>;
}
export interface ComputerWebSource extends ComputerUsageSource {
  intervals: Array<ComputerUsageInterval & { creditedMs: number }>;
}
export interface ComputerApplicationSource extends ComputerUsageSource {
  associationVersion: string;
  intervals: Array<ComputerUsageInterval & { special: boolean }>;
}
export interface ComputerUsageSourceBundle {
  fromDate: string;
  toDate: string;
  web: ComputerWebSource[];
  applications: ComputerApplicationSource[];
}
export interface ComputerUsageDevice {
  key: string;
  name: string;
  complete: boolean;
  reasons: string[];
  totalMs: number | null;
  webMs: number | null;
  applicationMs: number | null;
  overlapMs: number | null;
  chromeUnexplainedMs: number | null;
  categoriesMs: Record<string, number | null>;
}
export interface ComputerUsageProduct {
  key: string;
  computerKey: string;
  name: string;
  source: 'web' | 'application';
  special: boolean;
  classification: string[];
  durationMs: number;
  historyQuality?: 'bestEffort';
  chromeContent?: {
    scope: 'computer' | 'child'; webMs: number | null;
    complete: boolean; reasons: string[]; explainedMs: number | null;
    unexplainedMs: number | null; categoriesMs: Record<string, number | null>;
  };
}
export interface ComputerUsageTimelineItem extends ComputerUsageInterval {
  key: string;
  computerKey: string;
  source: 'web' | 'application';
  creditedMs: number;
  special: boolean;
  overlapMs: number | null;
  historyQuality?: 'bestEffort';
  containerRelation?: 'container' | 'content' | 'outsideContainer' | 'childContent';
}
export interface ComputerUsageResult {
  schemaVersion: 1;
  revision: string;
  fromDate: string;
  toDate: string;
  complete: boolean;
  sourceStatus: { web: 'complete' | 'partial' | 'unavailable'; application: 'complete' | 'partial' | 'unavailable' };
  historyStatus: 'none' | 'bestEffort';
  overlapStatus: 'confirmed' | 'unconfirmed';
  categoryBasis: 'deduplicated' | 'sourceCumulative';
  /** Original source classifications; Chrome exclusion only applies to the display categories. */
  sourceCategoriesMs: { web: Record<string, number | null>; application: Record<string, number | null> };
  reasons: string[];
  sourceVersions: Array<{
    key: string; kind: 'web' | 'application'; revision: string; correctionRevision: string;
    associationVersion?: string; settledAtMs: number | null;
  }>;
  devices: ComputerUsageDevice[];
  totals: { computerMs: number | null; webMs: number | null; applicationMs: number | null; overlapMs: number | null };
  categoriesMs: Record<string, number | null>;
  products: ComputerUsageProduct[];
  timeline: ComputerUsageTimelineItem[];
  nextCursor: string | null;
}

type Range = [number, number];
const unique = (items: string[]) => [...new Set(items)].sort();
const validMs = (value: number) => Number.isSafeInteger(value) && value >= 0;
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value)
    .sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, canonical(v)]));
  return value;
}
export function computerUsageUnion(input: readonly Range[]): Range[] {
  const sorted = input.filter(([start, end]) => end > start).map(([a, b]): Range => [a, b])
    .sort(([a, b], [c, d]) => a - c || b - d);
  const result: Range[] = [];
  for (const [start, end] of sorted) {
    const last = result.at(-1);
    if (last && start <= last[1]) last[1] = Math.max(last[1], end);
    else result.push([start, end]);
  }
  return result;
}
const length = (ranges: readonly Range[]) => ranges.reduce((sum, [start, end]) => sum + end - start, 0);
const ranges = (items: readonly ComputerUsageInterval[]) => computerUsageUnion(items.map(i => [i.startMs, i.endMs]));

/** Available subtotal, never zero-fill a missing source. Completeness is reported separately. */
const sumReadable = (values: Array<number | null>) => {
  const readable = values.filter((value): value is number => value !== null && validMs(value));
  return readable.length ? readable.reduce((sum, value) => sum + value, 0) : null;
};
function sumCategories(values: Array<Record<string, number | null>>): Record<string, number | null> {
  return Object.fromEntries(unique(values.flatMap(value => Object.keys(value)))
    .map(cls => [cls, sumReadable(values.filter(value => Object.hasOwn(value, cls)).map(value => value[cls]!))]));
}
function displayApplicationCategories(source: ComputerApplicationSource): Record<string, number | null> {
  if (!source.intervals.some(interval => interval.special)) return source.categoriesMs;
  // Remove the Chrome container from DISPLAY categories only when the original
  // category evidence agrees. Do not subtract Chrome blindly from overlapping lanes.
  return Object.fromEntries(unique([...Object.keys(source.categoriesMs), ...source.intervals.map(i => i.classification)])
    .map(cls => {
      const original = source.intervals.filter(i => i.classification === cls);
      const authority = source.categoriesMs[cls] ?? 0;
      const valid = original.every(i => validMs(i.startMs) && validMs(i.endMs) && i.endMs > i.startMs);
      return [cls, valid && length(ranges(original)) === authority
        ? length(ranges(original.filter(i => !i.special))) : null];
    }).filter(([cls, value]) => value !== 0 || source.intervals.some(i => i.classification === cls && !i.special)));
}

/** Credit may occupy any subset of its support. No invented distribution of integer seconds. */
export function exactComputerUsageOverlap(
  web: Pick<ComputerWebSource['intervals'][number], 'startMs' | 'endMs' | 'creditedMs'>,
  applicationRanges: readonly Range[],
): number | null {
  return exactOverlapWithUnion(web, computerUsageUnion(applicationRanges));
}

/** Internal callers reuse sorted disjoint unions rather than sort them for every web row. */
function exactOverlapWithUnion(
  web: Pick<ComputerWebSource['intervals'][number], 'startMs' | 'endMs' | 'creditedMs'>,
  applicationRanges: readonly Range[],
): number | null {
  const width = web.endMs - web.startMs;
  if (!validMs(web.startMs) || !validMs(web.endMs) || width <= 0
      || !validMs(web.creditedMs) || web.creditedMs > width || web.creditedMs % 1000 !== 0) return null;
  let low = 0, high = applicationRanges.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (applicationRanges[middle]![1] <= web.startMs) low = middle + 1;
    else high = middle;
  }
  let intersect = 0;
  for (let index = low; index < applicationRanges.length; index++) {
    const [start, end] = applicationRanges[index]!;
    if (start >= web.endMs) break;
    intersect += Math.max(0, Math.min(end, web.endMs) - Math.max(start, web.startMs));
  }
  const lower = Math.max(0, web.creditedMs - (width - intersect));
  const upper = Math.min(web.creditedMs, intersect);
  return lower === upper ? lower : null;
}

function dateStart(date: string): number {
  const value = Date.parse(`${date}T00:00:00+08:00`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(value)
      || new Date(value + 28_800_000).toISOString().slice(0, 10) !== date) throw new RangeError('INVALID_DATE');
  return value;
}

export function computerUsageSourceGroupKey(source: ComputerUsageSource, kind: 'web' | 'application'): string {
  return source.computerKey ?? `unmapped:${kind}:${source.sourceGroupKey ?? source.key}`;
}

/** Reads normalized authoritative sources without mutating or reclassifying them. */
export function mergeComputerUsage(bundle: ComputerUsageSourceBundle): ComputerUsageResult {
  const fromMs = dateStart(bundle.fromDate), toMs = dateStart(bundle.toDate) + 86_400_000;
  if (toMs <= fromMs || toMs - fromMs > 7 * 86_400_000) throw new RangeError('INVALID_RANGE');
  const supplied = [...bundle.web.map(source => ({ kind: 'web' as const, source })),
    ...bundle.applications.map(source => ({ kind: 'application' as const, source }))];
  const seen = new Map<string, string>();
  const globalReasons: string[] = [];
  const sources = supplied.filter(({ kind, source }) => {
    const key = `${kind}:${source.key}`, payload = JSON.stringify(canonical(source));
    const previous = seen.get(key);
    if (previous === undefined) { seen.set(key, payload); return true; }
    if (previous !== payload) globalReasons.push('SOURCE_REVISION_CONFLICT');
    return false; // exact repeated source is idempotent, conflict prevents publication
  }).sort((a, b) => `${a.kind}:${a.source.key}`.localeCompare(`${b.kind}:${b.source.key}`));
  if (sources.reduce((n, { source }) => n + source.intervals.length, 0) > COMPUTER_USAGE_MAX_INTERVALS)
    throw new RangeError('EVIDENCE_LIMIT');
  const grouped = new Map<string, typeof sources>();
  for (const item of sources) {
    const key = computerUsageSourceGroupKey(item.source, item.kind);
    const group = grouped.get(key) ?? []; group.push(item); grouped.set(key, group);
  }
  const devices: ComputerUsageDevice[] = [], timeline: ComputerUsageTimelineItem[] = [];
  const products: ComputerUsageProduct[] = [];
  for (const [key, group] of [...grouped].sort(([a], [b]) => a.localeCompare(b))) {
    const web = group.filter(i => i.kind === 'web').map(i => i.source as ComputerWebSource);
    const app = group.filter(i => i.kind === 'application').map(i => i.source as ComputerApplicationSource);
    const reasons = [...globalReasons, ...group.flatMap(i => i.source.reasons)];
    if (group.some(i => i.source.historyQuality === 'bestEffort')) reasons.push('HISTORICAL_SOURCE_BEST_EFFORT');
    if (group.some(i => i.source.computerKey === null)) reasons.push('DEVICE_MAPPING_INCOMPLETE');
    if (!web.length) reasons.push('WEB_SOURCE_MISSING');
    if (!app.length) reasons.push('APPLICATION_SOURCE_MISSING');
    for (const { kind, source } of group) {
      if (!source.complete) reasons.push(`${kind.toUpperCase()}_SOURCE_INCOMPLETE`);
      if (!source.revision || !source.correctionRevision
          || (kind === 'application' && !(source as ComputerApplicationSource).associationVersion)) reasons.push('SOURCE_VERSION_MISSING');
      if (source.totalMs === null) reasons.push(`${kind.toUpperCase()}_TOTAL_UNAVAILABLE`);
      else if (!validMs(source.totalMs)) reasons.push('INVALID_SOURCE_TOTAL');
      if (Object.values(source.categoriesMs).some(v => !validMs(v))) reasons.push('INVALID_SOURCE_TOTAL');
      for (const interval of source.intervals) {
        if (!validMs(interval.startMs) || !validMs(interval.endMs) || interval.endMs <= interval.startMs
            || interval.startMs < fromMs || interval.endMs > toMs || !interval.subjectKey || !interval.classification)
          reasons.push('INVALID_INTERVAL');
        if (kind === 'web') {
          const credit = (interval as ComputerWebSource['intervals'][number]).creditedMs;
          if (!validMs(credit) || credit % 1000 || credit > interval.endMs - interval.startMs) reasons.push('INVALID_WEB_CREDIT');
        }
      }
      const evidenceTotal = kind === 'web'
        ? (source as ComputerWebSource).intervals.reduce((sum, i) => sum + i.creditedMs, 0)
        : length(ranges(source.intervals));
      if (evidenceTotal !== source.totalMs) reasons.push(`${kind.toUpperCase()}_TOTAL_EVIDENCE_MISMATCH`);
      const classes = unique([...Object.keys(source.categoriesMs), ...source.intervals.map(i => i.classification)]);
      for (const cls of classes) {
        const items = source.intervals.filter(i => i.classification === cls);
        const evidence = kind === 'web' ? (items as ComputerWebSource['intervals']).reduce((sum, i) => sum + i.creditedMs, 0)
          : length(ranges(items));
        const authority = Object.hasOwn(source.categoriesMs, cls) ? source.categoriesMs[cls] : 0;
        if (evidence !== authority) reasons.push(`${kind.toUpperCase()}_CATEGORY_EVIDENCE_MISMATCH`);
      }
    }
    const webIntervals = web.flatMap(s => s.intervals), appIntervals = app.flatMap(s => s.intervals);
    const appRanges = ranges(appIntervals), chromeRanges = ranges(appIntervals.filter(i => i.special));
    const webWidths = webIntervals.reduce((sum, i) => sum + i.endMs - i.startMs, 0);
    if (length(ranges(webIntervals)) !== webWidths) reasons.push('WEB_INTERVAL_OVERLAP');
    const webMs = sumReadable(web.map(s => s.totalMs));
    const applicationMs = sumReadable(app.map(s => s.totalMs));
    if (applicationMs !== null && length(appRanges) !== applicationMs) reasons.push('APPLICATION_SOURCE_OVERLAP');
    const overlaps = webIntervals.map(i => exactOverlapWithUnion(i, appRanges));
    const chromeOverlaps = webIntervals.map(i => exactOverlapWithUnion(i, chromeRanges));
    if (overlaps.some(i => i === null) || chromeOverlaps.some(i => i === null)) reasons.push('OVERLAP_AMBIGUOUS');
    const overlap = overlaps.some(i => i === null) ? null : overlaps.reduce<number>((sum, i) => sum + i!, 0);
    const categoriesMs: Record<string, number | null> = Object.create(null);
    const normalApps = appIntervals.filter(i => !i.special);
    for (const cls of unique([...webIntervals.map(i => i.classification), ...normalApps.map(i => i.classification)])) {
      const categoryApps = ranges(normalApps.filter(i => i.classification === cls));
      const categoryWeb = webIntervals.filter(i => i.classification === cls);
      const categoryOverlaps = categoryWeb.map(i => exactOverlapWithUnion(i, categoryApps));
      if (categoryOverlaps.some(i => i === null)) { reasons.push('CATEGORY_OVERLAP_AMBIGUOUS'); categoriesMs[cls] = null; }
      else categoriesMs[cls] = length(categoryApps) + categoryWeb.reduce((sum, i) => sum + i.creditedMs, 0)
        - categoryOverlaps.reduce<number>((sum, i) => sum + i!, 0);
    }
    const complete = reasons.length === 0;
    const displayCategories = complete ? Object.fromEntries(Object.entries(categoriesMs))
      : sumCategories([...web.map(source => source.categoriesMs), ...app.map(displayApplicationCategories)]);
    devices.push({ key, name: group[0]!.source.computerName, complete, reasons: unique(reasons), webMs, applicationMs,
      totalMs: complete ? webMs! + applicationMs! - overlap! : null,
      overlapMs: complete ? overlap : null,
      chromeUnexplainedMs: complete ? length(chromeRanges) - chromeOverlaps.reduce<number>((sum, i) => sum + i!, 0) : null,
      categoriesMs: displayCategories });
    const productGroups = new Map<string, { source: 'web' | 'application'; intervals: ComputerUsageTimelineItem[] }>();
    for (const { kind, source } of group) for (const [index, item] of source.intervals.entries()) {
      const isWeb = kind === 'web';
      if (!validMs(item.startMs) || !validMs(item.endMs) || item.endMs <= item.startMs
          || item.startMs < fromMs || item.endMs > toMs) continue;
      if (isWeb && (!validMs((item as ComputerWebSource['intervals'][number]).creditedMs)
          || (item as ComputerWebSource['intervals'][number]).creditedMs % 1000 !== 0
          || (item as ComputerWebSource['intervals'][number]).creditedMs > item.endMs - item.startMs)) continue;
      const entry: ComputerUsageTimelineItem = { key: `${kind}:${source.key}:${index}`, computerKey: key,
        source: kind, subjectKey: item.subjectKey, label: item.label, startMs: item.startMs, endMs: item.endMs,
        classification: item.classification, special: !isWeb && (item as ComputerApplicationSource['intervals'][number]).special,
        creditedMs: isWeb ? (item as ComputerWebSource['intervals'][number]).creditedMs : item.endMs - item.startMs,
        overlapMs: isWeb && complete ? exactOverlapWithUnion(item as ComputerWebSource['intervals'][number], appRanges) : null,
        ...(source.historyQuality ? { historyQuality: source.historyQuality } : {}) };
      timeline.push(entry);
      const productKey = `${kind}:${key}:${item.subjectKey}`;
      const product = productGroups.get(productKey) ?? { source: kind, intervals: [] };
      product.intervals.push(entry); productGroups.set(productKey, product);
    }
    let contentWork = 0;
    for (const [productKey, product] of productGroups) {
      const special = product.intervals.some(i => i.special);
      const durationMs = product.source === 'web' ? product.intervals.reduce((sum, i) => sum + i.creditedMs, 0)
        : length(ranges(product.intervals));
      const entry: ComputerUsageProduct = { key: productKey, computerKey: key,
        name: product.intervals[0]!.label, source: product.source, special,
        classification: unique(product.intervals.map(i => i.classification)), durationMs,
        ...(product.intervals.some(i => i.historyQuality) ? {historyQuality: 'bestEffort' as const} : {}) };
      if (special) {
        contentWork += webIntervals.length;
        const productRanges = ranges(product.intervals);
        const credits = complete && contentWork <= COMPUTER_USAGE_MAX_INTERVALS
          ? webIntervals.map(i => exactOverlapWithUnion(i, productRanges)) : null;
        const contentComplete = Boolean(credits && credits.every(value => value !== null));
        const contentClasses = unique(webIntervals.map(i => i.classification));
        const explainedMs = contentComplete ? credits!.reduce<number>((sum, value) => sum + value!, 0) : null;
        entry.chromeContent = { scope: 'computer', webMs: sumReadable(web.map(s => s.totalMs)), complete: contentComplete,
          reasons: contentComplete ? [] : unique([...reasons,
            ...(contentWork > COMPUTER_USAGE_MAX_INTERVALS ? ['CHROME_CONTENT_EVIDENCE_LIMIT'] : []),
            ...(credits?.some(value => value === null) ? ['CHROME_CONTENT_OVERLAP_AMBIGUOUS'] : [])]),
          explainedMs, unexplainedMs: explainedMs === null ? null : durationMs - explainedMs,
          categoriesMs: Object.fromEntries(contentClasses.map(cls => [cls, contentComplete
            ? webIntervals.reduce((sum, item, index) => sum + (item.classification === cls ? credits![index]! : 0), 0) : null])) };
      }
      products.push(entry);
    }
  }
  const complete = devices.length > 0 && devices.every(d => d.complete) && !globalReasons.length;
  if (!devices.length) globalReasons.push('SOURCE_MISSING');
  const webSources = sources.filter(s => s.kind === 'web').map(s => s.source as ComputerWebSource);
  const appSources = sources.filter(s => s.kind === 'application').map(s => s.source as ComputerApplicationSource);
  const status = (items: ComputerUsageSource[]): 'complete' | 'partial' | 'unavailable' => {
    if (!items.some(source => source.totalMs !== null && validMs(source.totalMs))) return 'unavailable';
    return !globalReasons.length && items.every(source => (source.statisticsComplete ?? source.complete)
      && source.totalMs !== null && validMs(source.totalMs)
      && Object.values(source.categoriesMs).every(validMs)) ? 'complete' : 'partial';
  };
  const sourceStatus = {web: status(webSources), application: status(appSources)};
  const sourceCategoriesMs = {web: sumCategories(webSources.map(s => s.categoriesMs)),
    application: sumCategories(appSources.map(s => s.categoriesMs))};
  const categoriesMs = complete ? sumCategories(devices.map(d => d.categoriesMs))
    : sumCategories([...webSources.map(s => s.categoriesMs), ...appSources.map(displayApplicationCategories)]);
  for (const product of products.filter(item => item.special && !item.chromeContent?.complete)) {
    product.chromeContent = {scope: 'child', webMs: sumReadable(webSources.map(s => s.totalMs)),
      complete: sourceStatus.web === 'complete', reasons: sourceStatus.web === 'complete' ? [] : ['CHILD_WEB_SOURCE_PARTIAL'],
      explainedMs: null, unexplainedMs: null, categoriesMs: {...sourceCategoriesMs.web}};
  }
  return { schemaVersion: 1, revision: 'pending', fromDate: bundle.fromDate, toDate: bundle.toDate, complete,
    sourceStatus, historyStatus: sources.some(s => s.source.historyQuality) ? 'bestEffort' : 'none',
    overlapStatus: complete ? 'confirmed' : 'unconfirmed', categoryBasis: complete ? 'deduplicated' : 'sourceCumulative',
    sourceCategoriesMs,
    reasons: unique([...globalReasons, ...devices.flatMap(d => d.reasons)]),
    sourceVersions: sources.map(({ kind, source }) => ({ key: source.key, kind, revision: source.revision,
      correctionRevision: source.correctionRevision, settledAtMs: source.settledAtMs,
      ...(kind === 'application' ? { associationVersion: (source as ComputerApplicationSource).associationVersion } : {}) })),
    devices, totals: { computerMs: complete ? sumReadable(devices.map(d => d.totalMs)) : null,
      webMs: sumReadable(webSources.map(s => s.totalMs)), applicationMs: sumReadable(appSources.map(s => s.totalMs)),
      overlapMs: complete ? sumReadable(devices.map(d => d.overlapMs)) : null },
    categoriesMs, products: products.sort((a, b) => a.key.localeCompare(b.key)),
    timeline: timeline.sort((a, b) => a.startMs - b.startMs || a.endMs - b.endMs || a.key.localeCompare(b.key)), nextCursor: null };
}

/** Revision covers authoritative versions AND evidence/result, never just a clock timestamp. */
export async function withComputerUsageRevision(result: ComputerUsageResult): Promise<ComputerUsageResult> {
  const value = { ...result, revision: undefined, nextCursor: null, displayRuleVersion: COMPUTER_USAGE_DISPLAY_RULE_VERSION };
  const bytes = new TextEncoder().encode(JSON.stringify(canonical(value)));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return { ...result, revision: `computer-v1:${[...new Uint8Array(digest)].map(i => i.toString(16).padStart(2, '0')).join('')}` };
}

/** Caller must pass the full cached generation; pagination never merges independently. */
export function computerUsagePage(result: ComputerUsageResult, expectedRevision: string | undefined, offset = 0, limit = 100): ComputerUsageResult {
  if (expectedRevision && expectedRevision !== result.revision) throw new Error('COMPUTER_USAGE_VERSION_CHANGED');
  if (!Number.isSafeInteger(offset) || offset < 0 || !Number.isSafeInteger(limit) || limit < 1 || limit > 100)
    throw new RangeError('INVALID_PAGINATION');
  if (offset > 0 && !expectedRevision) throw new Error('COMPUTER_USAGE_REVISION_REQUIRED');
  return { ...result, products: [], timeline: result.timeline.slice(offset, offset + limit),
    nextCursor: offset + limit < result.timeline.length ? String(offset + limit) : null };
}

/** Public read views share one generation; summary never transfers all detail rows. */
export function computerUsageReadPage(result: ComputerUsageResult, detail: 'summary' | 'timeline' | 'products' = 'summary',
  expectedRevision?: string, offset = 0, limit = 100, productKey?: string): ComputerUsageResult {
  if (!['summary', 'timeline', 'products'].includes(detail)) throw new RangeError('INVALID_DETAIL');
  if (!Number.isSafeInteger(offset) || offset < 0 || !Number.isSafeInteger(limit) || limit < 1 || limit > 100)
    throw new RangeError('INVALID_PAGINATION');
  if ((detail !== 'summary' || offset > 0) && !expectedRevision) throw new Error('COMPUTER_USAGE_REVISION_REQUIRED');
  if (expectedRevision && expectedRevision !== result.revision) throw new Error('COMPUTER_USAGE_VERSION_CHANGED');
  if (productKey && detail !== 'timeline') throw new RangeError('INVALID_PRODUCT_DETAIL');
  if (detail === 'summary') return { ...result, products: [], timeline: [], nextCursor: null };
  if (detail === 'timeline') {
    if (!productKey) return computerUsagePage(result, expectedRevision, offset, limit);
    const product = result.products.find(item => item.key === productKey && item.special && item.source === 'application');
    if (!product) throw new RangeError('INVALID_PRODUCT');
    const isContainer = (item: ComputerUsageTimelineItem) => `${item.source}:${item.computerKey}:${item.subjectKey}` === product.key;
    const containerRanges = ranges(result.timeline.filter(isContainer));
    const timeline = result.timeline.filter(item => isContainer(item)
      || (item.source === 'web' && (product.chromeContent?.scope === 'child'
        || (product.chromeContent?.complete && item.computerKey === product.computerKey))))
      .map(item => {
        if (isContainer(item)) return { ...item, containerRelation: 'container' as const };
        if (product.chromeContent?.scope === 'child') return { ...item, overlapMs: null, containerRelation: 'childContent' as const };
        const overlapMs = exactOverlapWithUnion(item, containerRanges);
        return { ...item, overlapMs, containerRelation: overlapMs === 0 ? 'outsideContainer' as const : 'content' as const };
      });
    return computerUsagePage({ ...result, timeline }, expectedRevision, offset, limit);
  }
  return { ...result, timeline: [], products: result.products.slice(offset, offset + limit),
    nextCursor: offset + limit < result.products.length ? String(offset + limit) : null };
}
