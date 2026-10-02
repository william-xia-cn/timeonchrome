import { projectSharedQuotaDay, type SharedQuotaContributionV1, type SharedQuotaDayProjectionV1,
  type UnifiedChildAccessPolicyV1 } from './shared-access.js';

/** Assembled read-only basis. Transport pages must be verified before constructing it. */
export interface SharedQuotaExecutionSourceV1 {
  publicationRevision: string;
  revisionOrdinal: number;
  contribution: SharedQuotaContributionV1;
}
export interface SharedQuotaExecutionBasisV1 {
  schemaVersion: 1;
  revision: string;
  policyRevision: string;
  fromDate: string;
  toDate: string;
  days: readonly { date: string; reasonCodes: readonly string[]; sources: readonly SharedQuotaExecutionSourceV1[] }[];
}
/** Server/consumer-authenticated context. Never authorize scopes from caller payload. */
export interface AuthenticatedSharedQuotaScope {
  source: 'web' | 'application';
  sourceKey: string;
  date: string;
}
/** Authenticated device response. These fields do not authenticate a forwarded Host payload. */
export interface SharedQuotaExecutionPageV1 {
  schemaVersion: 1;
  profileId: string;
  basisRevision: string;
  policyRevision: string;
  fromDate: string;
  toDate: string;
  days: readonly { date: string; reasonCodes: readonly string[]; sourceCount: number }[];
  authorizedScopes: readonly AuthenticatedSharedQuotaScope[];
  page: { offset: number; limit: number; total: number; nextOffset: number | null;
    items: readonly SharedQuotaExecutionSourceV1[] };
}
export interface SharedQuotaSourceReplacementV1 {
  basisRevision: string;
  expectedPublicationRevision: string;
  revisionOrdinal: number;
  contribution: SharedQuotaContributionV1;
}
export interface LocalSharedQuotaExecutionProjectionV1 {
  basisRevision: string;
  policyRevision: string;
  complete: boolean;
  reasonCodes: readonly string[];
  days: readonly SharedQuotaDayProjectionV1[];
  week: { fromDate: string; toDate: string; restUsedMs: number; restRemainingMs: number | null };
}
const ms = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) >= 0;
const revision = (value: unknown): value is string => typeof value === 'string' && value.length > 0 && value.length <= 128;
const reasons = (value: unknown): value is string[] => Array.isArray(value) && value.length <= 32
  && value.every(item => typeof item === 'string' && /^[A-Z0-9_]{1,64}$/.test(item));
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
function exact(value: unknown, required: string[], optional: string[] = []): value is Record<string, unknown> {
  return record(value) && required.every(key => Object.hasOwn(value, key))
    && Object.keys(value).every(key => required.includes(key) || optional.includes(key));
}
function dateMs(value: unknown): number {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('INVALID_EXECUTION_DATE');
  const result = Date.parse(value + 'T00:00:00Z');
  if (!Number.isFinite(result) || new Date(result).toISOString().slice(0, 10) !== value) throw new Error('INVALID_EXECUTION_DATE');
  return result;
}
const key = (value: AuthenticatedSharedQuotaScope) => `${value.source}\0${value.sourceKey}\0${value.date}`;
function validScope(value: unknown): value is AuthenticatedSharedQuotaScope {
  return record(value) && ['web', 'application'].includes(String(value.source)) && revision(value.sourceKey)
    && typeof value.date === 'string';
}
function validateContribution(value: unknown, policyRevision: string, date: string): asserts value is SharedQuotaContributionV1 {
  const required = ['schemaVersion', 'source', 'sourceKey', 'date', 'revision', 'statisticsRevision',
    'correctionRevision', 'policyRevision', 'settledAtMs', 'complete', 'reasonCodes', 'bucketsMs'];
  if (!exact(value, required, ['productAssociationVersion', 'applicationClassesMs', 'chromeExcludedMs', 'chromeIncludedInApplicationMs'])
    || value.schemaVersion !== 1 || !validScope(value) || value.date !== date || value.policyRevision !== policyRevision
    || !['revision', 'statisticsRevision', 'correctionRevision'].every(field => revision(value[field]))
    || !(value.settledAtMs === null || ms(value.settledAtMs)) || typeof value.complete !== 'boolean'
    || !reasons(value.reasonCodes) || (value.complete && value.reasonCodes.length !== 0)
    || !exact(value.bucketsMs, ['study', 'composite', 'rest']) || !Object.values(value.bucketsMs).every(ms)) {
    throw new Error('INVALID_EXECUTION_CONTRIBUTION');
  }
  if (value.source === 'web') {
    if (Object.values(value.bucketsMs).some(amount => Number(amount) % 1000 !== 0)
      || ['applicationClassesMs', 'chromeExcludedMs', 'chromeIncludedInApplicationMs', 'productAssociationVersion']
        .some(field => Object.hasOwn(value, field))) throw new Error('INVALID_EXECUTION_WEB_CONTRIBUTION');
  } else if (!revision(value.productAssociationVersion)
    || !exact(value.applicationClassesMs, ['study', 'composite', 'restrictedEntertainment', 'unclassified', 'other'])
    || !Object.values(value.applicationClassesMs).every(ms) || !ms(value.chromeExcludedMs)
    || !(value.chromeIncludedInApplicationMs === undefined || value.chromeIncludedInApplicationMs === null || ms(value.chromeIncludedInApplicationMs))) {
    throw new Error('INVALID_EXECUTION_APPLICATION_CONTRIBUTION');
  }
}
const canonical = (value: unknown): string => JSON.stringify(value, (_name, item) => record(item)
  ? Object.fromEntries(Object.keys(item).sort().map(name => [name, item[name]])) : item);

/** Full transport validation only. Caller must authenticate the connection and capture Child scope. */
export function assembleSharedQuotaExecutionPages(policy: UnifiedChildAccessPolicyV1,
  expectedProfileId: string, pages: readonly SharedQuotaExecutionPageV1[]): {
    basis: SharedQuotaExecutionBasisV1; authorizedScopes: readonly AuthenticatedSharedQuotaScope[];
  } {
  if (!revision(expectedProfileId) || !Array.isArray(pages) || pages.length < 1 || pages.length > 1400)
    throw new Error('INVALID_EXECUTION_PAGES');
  let signature: string | null = null, offset = 0, total = 0;
  const entries: SharedQuotaExecutionSourceV1[] = [];
  for (let index = 0; index < pages.length; index++) {
    const value = pages[index];
    if (!exact(value, ['schemaVersion','profileId','basisRevision','policyRevision','fromDate','toDate','days','authorizedScopes','page'])
      || value.schemaVersion !== 1 || value.profileId !== expectedProfileId
      || typeof value.basisRevision !== 'string' || !/^[a-f0-9]{64}$/.test(value.basisRevision)
      || value.policyRevision !== policy.revision || !Array.isArray(value.days) || value.days.length < 1 || value.days.length > 7
      || !Array.isArray(value.authorizedScopes) || value.authorizedScopes.length > 1400
      || !exact(value.page, ['offset','limit','total','nextOffset','items'])
      || !ms(value.page.offset) || value.page.offset !== offset || !ms(value.page.total) || value.page.total > 1400
      || !ms(value.page.limit) || value.page.limit < 1 || value.page.limit > 100 || !Array.isArray(value.page.items))
      throw new Error('INVALID_EXECUTION_PAGE');
    const metadata = canonical({basisRevision:value.basisRevision,policyRevision:value.policyRevision,
      fromDate:value.fromDate,toDate:value.toDate,days:value.days,authorizedScopes:value.authorizedScopes,
      total:value.page.total,limit:value.page.limit});
    if (signature !== null && signature !== metadata) throw new Error('EXECUTION_PAGE_CONTEXT_CHANGED');
    signature = metadata; total = value.page.total;
    const expectedCount = Math.min(value.page.limit, total - offset);
    if (expectedCount < 0 || value.page.items.length !== expectedCount
      || (expectedCount === 0 && (index !== 0 || total !== 0 || pages.length !== 1)))
      throw new Error('INVALID_EXECUTION_PAGE_COUNT');
    offset += expectedCount;
    if (value.page.nextOffset !== (offset < total ? offset : null)
      || (value.page.nextOffset === null) !== (index === pages.length - 1))
      throw new Error('INCOMPLETE_EXECUTION_PAGES');
    entries.push(...value.page.items);
  }
  const first: SharedQuotaExecutionPageV1 = pages[0], from = dateMs(first.fromDate), to = dateMs(first.toDate);
  const dayCount = (to - from) / 86_400_000 + 1;
  if (new Date(from).getUTCDay() !== 1 || !Number.isInteger(dayCount) || dayCount < 1 || dayCount > 7
    || first.days.length !== dayCount || entries.length !== total) throw new Error('INVALID_EXECUTION_PERIOD');
  let cursor = 0;
  const days = first.days.map((day, index) => {
    const date = new Date(from + index * 86_400_000).toISOString().slice(0,10);
    if (!exact(day, ['date','reasonCodes','sourceCount']) || day.date !== date || !reasons(day.reasonCodes)
      || !ms(day.sourceCount) || day.sourceCount > 200) throw new Error('INVALID_EXECUTION_COVERAGE');
    const sources = entries.slice(cursor, cursor + day.sourceCount); cursor += day.sourceCount;
    if (sources.length !== day.sourceCount || sources.some(entry => !record(entry?.contribution) || entry.contribution.date !== date))
      throw new Error('INVALID_EXECUTION_COVERAGE');
    return {date,reasonCodes:day.reasonCodes,sources};
  });
  if (cursor !== total) throw new Error('INVALID_EXECUTION_COVERAGE');
  const basis: SharedQuotaExecutionBasisV1 = {schemaVersion:1,revision:first.basisRevision,
    policyRevision:first.policyRevision,fromDate:first.fromDate,toDate:first.toDate,days};
  projectLocalSharedQuotaExecution(policy, basis, [], first.authorizedScopes);
  const existing = new Set(entries.map(entry => key(entry.contribution)));
  if (first.authorizedScopes.some(scope => !existing.has(key(scope)))) throw new Error('INVALID_EXECUTION_SCOPE');
  return JSON.parse(JSON.stringify({basis,authorizedScopes:first.authorizedScopes}));
}

/** Replaces source snapshots, then applies quota routing only. Never settles source ledgers. */
export function projectLocalSharedQuotaExecution(policy: UnifiedChildAccessPolicyV1,
  basis: SharedQuotaExecutionBasisV1, replacements: readonly SharedQuotaSourceReplacementV1[],
  authorizedScopes: readonly AuthenticatedSharedQuotaScope[]): LocalSharedQuotaExecutionProjectionV1 {
  if (!exact(basis, ['schemaVersion', 'revision', 'policyRevision', 'fromDate', 'toDate', 'days'])
    || basis.schemaVersion !== 1 || !revision(basis.revision) || basis.policyRevision !== policy.revision
    || !Array.isArray(basis.days) || !Array.isArray(replacements) || !Array.isArray(authorizedScopes)
    || replacements.length > 1400 || authorizedScopes.length > 1400) throw new Error('INVALID_EXECUTION_BASIS');
  const from = dateMs(basis.fromDate), to = dateMs(basis.toDate);
  const count = (to - from) / 86_400_000 + 1;
  if (new Date(from).getUTCDay() !== 1 || !Number.isInteger(count) || count < 1 || count > 7
    || basis.days.length !== count) throw new Error('INVALID_EXECUTION_PERIOD');
  const scopes = new Set<string>();
  for (const scope of authorizedScopes) {
    if (!exact(scope, ['source', 'sourceKey', 'date']) || !validScope(scope)) throw new Error('INVALID_EXECUTION_SCOPE');
    const scopeDate = dateMs(scope.date);
    if (scopeDate < from || scopeDate > to) throw new Error('INVALID_EXECUTION_SCOPE');
    if (scopes.has(key(scope))) throw new Error('DUPLICATE_EXECUTION_SCOPE');
    scopes.add(key(scope));
  }
  const sourceMap = new Map<string, SharedQuotaExecutionSourceV1>();
  for (let index = 0; index < count; index++) {
    const day = basis.days[index];
    const date = new Date(from + index * 86_400_000).toISOString().slice(0, 10);
    if (!exact(day, ['date', 'reasonCodes', 'sources']) || day.date !== date || !reasons(day.reasonCodes)
      || !Array.isArray(day.sources) || day.sources.length > 200) throw new Error('INVALID_EXECUTION_DAY');
    for (const entry of day.sources) {
      if (!exact(entry, ['publicationRevision', 'revisionOrdinal', 'contribution']) || !revision(entry.publicationRevision)
        || !ms(entry.revisionOrdinal) || entry.revisionOrdinal < 1) throw new Error('INVALID_EXECUTION_SOURCE');
      validateContribution(entry.contribution, policy.revision, date);
      const scopeKey = key(entry.contribution);
      if (sourceMap.has(scopeKey)) throw new Error('DUPLICATE_EXECUTION_SOURCE');
      sourceMap.set(scopeKey, { publicationRevision: entry.publicationRevision,
        revisionOrdinal: entry.revisionOrdinal, contribution: entry.contribution });
    }
  }
  const changed = new Set<string>();
  for (const replacement of replacements) {
    if (!exact(replacement, ['basisRevision', 'expectedPublicationRevision', 'revisionOrdinal', 'contribution'])
      || replacement.basisRevision !== basis.revision || !revision(replacement.expectedPublicationRevision)
      || !ms(replacement.revisionOrdinal) || replacement.revisionOrdinal < 1 || !validScope(replacement.contribution)) {
      throw new Error('INVALID_EXECUTION_REPLACEMENT');
    }
    const scopeKey = key(replacement.contribution), old = sourceMap.get(scopeKey);
    if (!scopes.has(scopeKey)) throw new Error('UNAUTHORIZED_EXECUTION_SOURCE');
    if (!old || old.publicationRevision !== replacement.expectedPublicationRevision) throw new Error('EXECUTION_SOURCE_VERSION_CHANGED');
    if (changed.has(scopeKey)) throw new Error('DUPLICATE_EXECUTION_REPLACEMENT');
    validateContribution(replacement.contribution, policy.revision, old.contribution.date);
    if (!replacement.contribution.complete || replacement.revisionOrdinal < old.revisionOrdinal
      || replacement.contribution.correctionRevision !== old.contribution.correctionRevision
      || replacement.contribution.productAssociationVersion !== old.contribution.productAssociationVersion) {
      throw new Error('EXECUTION_SOURCE_CONTEXT_CHANGED');
    }
    if (replacement.revisionOrdinal === old.revisionOrdinal
      && canonical(replacement.contribution) !== canonical(old.contribution)) throw new Error('EXECUTION_SOURCE_REVISION_CONFLICT');
    changed.add(scopeKey);
    sourceMap.set(scopeKey, { ...old, contribution: replacement.contribution, revisionOrdinal: replacement.revisionOrdinal });
  }
  const days = basis.days.map(day => {
    const projection = projectSharedQuotaDay(policy, day.date, day.sources.map((entry: SharedQuotaExecutionSourceV1) =>
      sourceMap.get(key(entry.contribution))!.contribution));
    const reasonCodes = [...new Set([...day.reasonCodes, ...projection.reasonCodes])].sort();
    return { ...projection, complete: reasonCodes.length === 0, reasonCodes };
  });
  const restUsedMs = days.reduce((sum, day) => sum + day.usedMs.rest, 0);
  if (!ms(restUsedMs)) throw new Error('EXECUTION_WEEK_OVERFLOW');
  const reasonCodes = [...new Set(days.flatMap(day => day.reasonCodes))].sort();
  return { basisRevision: basis.revision, policyRevision: policy.revision, complete: reasonCodes.length === 0,
    reasonCodes, days, week: { fromDate: basis.fromDate, toDate: basis.toDate, restUsedMs,
      restRemainingMs: policy.weeklyRestMinutes === null ? null : Math.max(0, policy.weeklyRestMinutes * 60000 - restUsedMs) } };
}
