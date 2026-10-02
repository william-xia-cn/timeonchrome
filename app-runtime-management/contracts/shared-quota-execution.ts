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

/** Replaces source snapshots, then applies quota routing only. Never settles source ledgers. */
export function projectLocalSharedQuotaExecution(policy: UnifiedChildAccessPolicyV1,
  basis: SharedQuotaExecutionBasisV1, replacements: readonly SharedQuotaSourceReplacementV1[],
  authorizedScopes: readonly AuthenticatedSharedQuotaScope[]): LocalSharedQuotaExecutionProjectionV1 {
  if (!exact(basis, ['schemaVersion', 'revision', 'policyRevision', 'fromDate', 'toDate', 'days'])
    || basis.schemaVersion !== 1 || !revision(basis.revision) || basis.policyRevision !== policy.revision
    || !Array.isArray(basis.days) || !Array.isArray(replacements) || !Array.isArray(authorizedScopes)
    || replacements.length > 14 || authorizedScopes.length > 14) throw new Error('INVALID_EXECUTION_BASIS');
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
