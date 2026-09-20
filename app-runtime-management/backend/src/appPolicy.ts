import type {
  AppPolicyClassification,
  AppPolicyDocument,
  AppPolicyQuotaConfig,
  AppPolicyScheduleCategory,
  AppPolicyTimeWindow,
  AppPolicyTimeWindows,
  AppPolicyWeekday,
  ApplicationClassification,
  RuntimePlatform,
} from './contracts';
import { sha256Hex } from './crypto';
import { HttpError } from './http';
import type { RuntimeLogCategory } from './contracts';
import { queryTerminalLogs } from './terminalLogging';
import { isRecord } from './validation';
import { identifyProducts, associateApplicationEvidence } from '@timeonchrome/app-runtime-contracts/classification';
import { defaultGameGroupRuleId, defaultSystemApplicationRuleId, effectiveApplicationKnowledge,
  queryInventoryScanStatus, resolveEffectiveApplication } from './applicationKnowledge';
import type {
  AppEvidence,
  ApplicationOrigin,
  ApplicationOriginEvidenceCode,
  CatalogGroup,
  CatalogGroupReasonCode,
} from '@timeonchrome/app-runtime-contracts/classification';
import { systemToolPackageIds, technicalDistributionKeys } from './productCatalogRules';

const classifications = new Set<ApplicationClassification>([
  'study', 'composite', 'restrictedEntertainment', 'unclassified', 'blocked',
]);
const platforms = new Set<RuntimePlatform>(['windows', 'macos']);
const quotaCategories = ['study', 'composite', 'restrictedEntertainment', 'unclassified'] as const;
const weekdays: AppPolicyWeekday[] = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
const weekdayByUtcDay: AppPolicyWeekday[] = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

type CatalogKind = 'product' | 'application' | 'component' | 'candidate' | 'unresolved';
type CatalogManageability = 'actionable' | 'review' | 'hidden';
type CatalogProjection = {
  catalogKind: CatalogKind;
  manageability: CatalogManageability;
  projectionReasonCode: 'CONFIRMED_PRODUCT' | 'EXPLICIT_APPLICATION_CLASSIFICATION' | 'VERIFIED_APPLICATION'
    | 'INSTALLATION_PRODUCT' | 'COMPONENT' | 'DISCOVERY_CANDIDATE' | 'TECHNICAL_IDENTITY_ONLY'
    | 'AMBIGUOUS_INSTALLATION_PRODUCTS' | 'POSSIBLE_PRODUCT_VARIANT' | 'TECHNICAL_PRODUCT_REVIEW'
    | 'UNCONFIRMED_APPLICATION_VARIANT' | 'PACKAGE_CONTAINER' | 'LAUNCHABLE_PACKAGE_APP'
    | 'LEGACY_CONTAINER_CLASSIFICATION';
};

type CatalogEntry = CatalogProjection & {
  platform: RuntimePlatform;
  runtimeIdentity: string | null;
  displayName: string | null;
  productId: string | null;
  classification: ApplicationClassification;
  applicationOrigin: ApplicationOrigin;
  originEvidenceCode: ApplicationOriginEvidenceCode | null;
  catalogGroup: CatalogGroup;
  catalogGroupReasonCode: CatalogGroupReasonCode;
  runtimeImplementations?: Array<{ platform: RuntimePlatform; runtimeIdentity: string; displayName: string | null }>;
  [key: string]: unknown;
};

type UsageIdentityGroup = {
  platform: RuntimePlatform;
  runtimeIdentity: string;
  displayName: string | null;
  firstSeenAtMs: number;
  lastSeenAtMs: number;
  machines: Set<string>;
  users: Set<string>;
  intervals: Map<string, Array<[number, number]>>;
};

type ClassificationRecordSet = {
  windowStartMs: number;
  windowEndMs: number;
  pending: unknown[];
  processed: unknown[];
  technical: unknown[];
};

function hasStrongApplicationIdentity(evidence?: AppEvidence): boolean {
  if (!evidence) return false;
  const verified = new Set(evidence.verifiedFields);
  return verified.has('packageId') || verified.has('binaryHash') || verified.has('productKey') || verified.has('hostedAppId')
    || (verified.has('signerKey') && verified.has('productName'));
}

function normalizedCatalogDisplayName(evidence: AppEvidence): string {
  return evidence.displayName.trim().replace(/\s+/g, ' ').toLowerCase();
}

function normalizedCatalogFamilyHint(evidence: AppEvidence): string {
  let value = normalizedCatalogDisplayName(evidence).normalize('NFKC')
    .replace(/[™®©]/gu, '')
    .replace(/\s+/gu, ' ')
    .trim();
  const decoration = /\s*\((?:(?:32|64)[ -]?bit(?:\s+(?:x86|x64|arm64))?|x86|x64|arm64|preview|beta|stable|desktop|store)(?:[\s,/+_-]+(?:(?:32|64)[ -]?bit|x86|x64|arm64|preview|beta|stable|desktop|store))*\)\s*$/iu;
  while (decoration.test(value)) value = value.replace(decoration, '').trim();
  value = value.replace(/(?:\s+|\s*[-–—]\s*)v?\d+(?:\.\d+){1,4}(?:[-+][a-z0-9.-]+)?\s*$/iu, '').trim();
  return value;
}

const knownGameProductNames = new Set(['aimlabs', 'apex legends']);
function projectApplicationOrigin(evidence?: AppEvidence): {
  applicationOrigin: ApplicationOrigin;
  originEvidenceCode: ApplicationOriginEvidenceCode | null;
} {
  if (evidence?.platform !== 'windows' || !evidence.verifiedFields.includes('packageId')) {
    return { applicationOrigin: 'unknown', originEvidenceCode: null };
  }
  const packageId = evidence.values.packageId;
  if (!packageId) return { applicationOrigin: 'unknown', originEvidenceCode: null };
  const normalized = packageId.trim().toLowerCase();
  const family = normalized.split('!', 1)[0]!;
  return systemToolPackageIds.has(normalized) || systemToolPackageIds.has(family)
    ? { applicationOrigin: 'operatingSystem', originEvidenceCode: 'exactPackageRule' }
    : { applicationOrigin: 'unknown', originEvidenceCode: null };
}

function projectCatalogGroup(input: {
  actionable: boolean;
  exactSystemTool: boolean;
  appType: string;
  typeStatus: string;
}): { catalogGroup: CatalogGroup; catalogGroupReasonCode: CatalogGroupReasonCode } {
  if (input.actionable && input.exactSystemTool) {
    return { catalogGroup: 'systemTool', catalogGroupReasonCode: 'EXACT_SYSTEM_TOOL_RULE' };
  }
  if (input.actionable && input.typeStatus === 'confirmed' && input.appType === 'game') {
    return { catalogGroup: 'game', catalogGroupReasonCode: 'CONFIRMED_GAME_TYPE' };
  }
  if (input.actionable && input.typeStatus === 'confirmed' && input.appType === 'gameLauncher') {
    return { catalogGroup: 'game', catalogGroupReasonCode: 'CONFIRMED_GAME_LAUNCHER_TYPE' };
  }
  if (input.actionable && input.typeStatus === 'confirmed' && input.appType === 'gameUtility') {
    return { catalogGroup: 'game', catalogGroupReasonCode: 'CONFIRMED_GAME_UTILITY_TYPE' };
  }
  return { catalogGroup: 'application', catalogGroupReasonCode: 'DEFAULT_APPLICATION' };
}

function isPackageContainer(evidence?: AppEvidence): boolean {
  const discovery = evidence?.discovery;
  if (!evidence || evidence.platform !== 'windows' || !discovery
      || (discovery.objectKind !== 'product' && discovery.objectKind !== 'packageContainer')
      || discovery.sourceKind !== 'user-packages' || !evidence.verifiedFields.includes('packageId')) return false;
  const packageId = evidence.values.packageId;
  return Boolean(packageId && !packageId.includes('!'));
}

function isLaunchablePackageApplication(evidence?: AppEvidence): boolean {
  const discovery = evidence?.discovery;
  if (!evidence || evidence.platform !== 'windows' || !discovery || discovery.objectKind !== 'variant'
      || discovery.role !== 'application' || !evidence.verifiedFields.includes('packageId')) return false;
  return Boolean(evidence.values.packageId?.includes('!'));
}

function isTechnicalDistributionComponent(evidence?: AppEvidence): boolean {
  const value = evidence?.verifiedFields.includes('distributionKey') ? evidence.values.distributionKey?.toLowerCase() : null;
  return Boolean(value && technicalDistributionKeys.has(value));
}

function knownProductType(displayName: string | null): 'game' | null {
  if (!displayName) return null;
  const normalized = displayName.replace(/[™®©]/gu, '').normalize('NFKC')
    .replace(/\s+/gu, ' ').trim().toLocaleLowerCase();
  return knownGameProductNames.has(normalized) ? 'game' : null;
}

function needsTechnicalProductReview(evidence: AppEvidence): boolean {
  if (evidence.discovery?.objectKind !== 'product' || evidence.discovery.role !== 'application'
      || evidence.discovery.nameSource !== 'installation') return false;
  // Installation names are only a review signal. They never delete evidence or confirm/merge a product.
  return /\b(?:redistributable|runtime|driver|maintenance\s+service|update\s+service|updater|installer|uninstaller|setup|language\s+pack|debug\s+(?:runtime|symbols?)|sdk|software\s+development\s+kit|chipset\s+(?:device\s+)?software|management\s+engine\s+components?|serial\s+io|application\s+compatibility\s+fix\s+database|build\s+tools?|app\s+cert(?:ification)?\s+kit|card\s+reader|physx\s+system\s+software)\b|(?:驱动程序|芯片组(?:设备)?软件|管理引擎组件|生成工具|认证工具|PhysX\s*系统软件)/iu
    .test(evidence.displayName);
}

function projectCatalogEvidence(
  evidence: AppEvidence | undefined,
  productId: string | null,
  explicitlyConfigured: boolean,
): CatalogProjection {
  if (isPackageContainer(evidence)) {
    return explicitlyConfigured
      ? { catalogKind: 'candidate', manageability: 'review', projectionReasonCode: 'LEGACY_CONTAINER_CLASSIFICATION' }
      : { catalogKind: 'component', manageability: 'hidden', projectionReasonCode: 'PACKAGE_CONTAINER' };
  }
  if (isTechnicalDistributionComponent(evidence)) {
    return { catalogKind: 'component', manageability: 'hidden', projectionReasonCode: 'COMPONENT' };
  }
  if (productId) return { catalogKind: 'product', manageability: 'actionable', projectionReasonCode: 'CONFIRMED_PRODUCT' };
  if (explicitlyConfigured) {
    return { catalogKind: 'application', manageability: 'actionable', projectionReasonCode: 'EXPLICIT_APPLICATION_CLASSIFICATION' };
  }
  if (evidence && needsTechnicalProductReview(evidence)) {
    return { catalogKind: 'candidate', manageability: 'review', projectionReasonCode: 'TECHNICAL_PRODUCT_REVIEW' };
  }
  if (evidence?.discovery?.objectKind === 'product' && evidence.discovery.role === 'application'
      && evidence.verifiedFields.includes('productKey')) {
    return { catalogKind: 'product', manageability: 'actionable', projectionReasonCode: 'INSTALLATION_PRODUCT' };
  }
  if (evidence?.discovery?.objectKind === 'variant' && evidence.discovery.role === 'application') {
    if (isLaunchablePackageApplication(evidence)) {
      return { catalogKind: 'application', manageability: 'actionable', projectionReasonCode: 'LAUNCHABLE_PACKAGE_APP' };
    }
    return { catalogKind: 'candidate', manageability: 'review', projectionReasonCode: 'UNCONFIRMED_APPLICATION_VARIANT' };
  }
  if (evidence?.discovery?.role === 'application' && hasStrongApplicationIdentity(evidence)) {
    return { catalogKind: 'application', manageability: 'actionable', projectionReasonCode: 'VERIFIED_APPLICATION' };
  }
  if (evidence?.discovery?.role === 'component') {
    return { catalogKind: 'component', manageability: 'hidden', projectionReasonCode: 'COMPONENT' };
  }
  if (evidence?.discovery?.role === 'candidate') {
    return { catalogKind: 'candidate', manageability: 'review', projectionReasonCode: 'DISCOVERY_CANDIDATE' };
  }
  return { catalogKind: 'unresolved', manageability: 'review', projectionReasonCode: 'TECHNICAL_IDENTITY_ONLY' };
}

const emptyQuotas = (): AppPolicyQuotaConfig => ({
  dailyCategoryMinutes: {
    study: null,
    composite: null,
    restrictedEntertainment: null,
    unclassified: null,
  },
  weeklyRestrictedEntertainmentMinutes: null,
  perApplicationDailyMinutes: [],
});

export const allOpenTimeWindows = (): AppPolicyTimeWindows => Object.fromEntries(weekdays.map((day) => [day,
  Object.fromEntries(quotaCategories.map((category) => [category, [{ start: '00:00', end: '24:00' }]])),
])) as AppPolicyTimeWindows;

type AppPolicyUpdate = Omit<AppPolicyDocument, 'version' | 'effectiveAtMs' | 'timeWindows'> & {
  timeWindows?: AppPolicyTimeWindows;
};

export function appPolicyEtag(version: number): string {
  return `"app-policy-v${version}"`;
}

function quota(value: unknown, field: string): number | null {
  if (value === null) return null;
  if (!Number.isSafeInteger(value) || Number(value) < 0 || Number(value) > 10_080) {
    throw new HttpError(400, 'INVALID_APP_POLICY', `${field} must be null or a non-negative integer.`);
  }
  return Number(value);
}

function timeOfDay(value: unknown, allowEndOfDay: boolean, field: string): number {
  if (allowEndOfDay && value === '24:00') return 1_440;
  if (typeof value !== 'string' || !/^(?:[01]\d|2[0-3]):[0-5]\d$/u.test(value)) {
    throw new HttpError(400, 'INVALID_APP_POLICY', `${field} must use HH:mm.`);
  }
  const [hour, minute] = value.split(':').map(Number);
  return hour! * 60 + minute!;
}

function parseTimeWindows(value: unknown): AppPolicyTimeWindows {
  if (!isRecord(value)) throw new HttpError(400, 'INVALID_APP_POLICY', 'Time windows are invalid.');
  const result = {} as AppPolicyTimeWindows;
  for (const day of weekdays) {
    const incomingDay = value[day];
    if (!isRecord(incomingDay)) throw new HttpError(400, 'INVALID_APP_POLICY', `timeWindows.${day} is invalid.`);
    const normalizedDay = {} as Record<AppPolicyScheduleCategory, AppPolicyTimeWindow[]>;
    for (const category of quotaCategories) {
      const incoming = incomingDay[category];
      if (!Array.isArray(incoming) || incoming.length > 24) {
        throw new HttpError(400, 'INVALID_APP_POLICY', `timeWindows.${day}.${category} is invalid.`);
      }
      const windows = incoming.map((entry, index) => {
        if (!isRecord(entry)) throw new HttpError(400, 'INVALID_APP_POLICY', 'A time window is invalid.');
        const startMinutes = timeOfDay(entry.start, false, `timeWindows.${day}.${category}[${index}].start`);
        const endMinutes = timeOfDay(entry.end, true, `timeWindows.${day}.${category}[${index}].end`);
        if (endMinutes <= startMinutes) {
          throw new HttpError(400, 'INVALID_APP_POLICY', 'A time window end must be after its start.');
        }
        return { start: String(entry.start), end: String(entry.end), startMinutes, endMinutes };
      }).sort((left, right) => left.startMinutes - right.startMinutes || left.endMinutes - right.endMinutes);
      for (let index = 1; index < windows.length; index += 1) {
        if (windows[index]!.startMinutes < windows[index - 1]!.endMinutes) {
          throw new HttpError(400, 'INVALID_APP_POLICY', 'Time windows in the same category must not overlap.');
        }
      }
      normalizedDay[category] = windows.map(({ start, end }) => ({ start, end }));
    }
    result[day] = normalizedDay;
  }
  return result;
}

function normalizeStoredPolicy(
  payload: Omit<AppPolicyDocument, 'version' | 'effectiveAtMs'> | AppPolicyUpdate,
): Omit<AppPolicyDocument, 'version' | 'effectiveAtMs'> {
  return { classifications: payload.classifications, quotas: payload.quotas, timeWindows: payload.timeWindows ?? allOpenTimeWindows(),
    ...(payload.applicationKnowledge ? { applicationKnowledge: payload.applicationKnowledge } : {}),
    ...(payload.resolvedApplications ? { resolvedApplications: payload.resolvedApplications } : {}) };
}

export function parseAppPolicyUpdate(value: unknown): AppPolicyUpdate {
  if (!isRecord(value) || !Array.isArray(value.classifications) || !isRecord(value.quotas)) {
    throw new HttpError(400, 'INVALID_APP_POLICY', 'App policy is invalid.');
  }
  if (value.classifications.length > 5_000) {
    throw new HttpError(400, 'INVALID_APP_POLICY', 'App policy has too many classifications.');
  }
  const seen = new Set<string>();
  const normalizedClassifications: AppPolicyClassification[] = value.classifications.map((entry) => {
    if (!isRecord(entry) || typeof entry.platform !== 'string' || !platforms.has(entry.platform as RuntimePlatform)
      || typeof entry.runtimeIdentity !== 'string' || entry.runtimeIdentity.length < 1 || entry.runtimeIdentity.length > 256
      || typeof entry.classification !== 'string' || !classifications.has(entry.classification as ApplicationClassification)
      || (entry.displayName != null && (typeof entry.displayName !== 'string' || entry.displayName.length > 256))) {
      throw new HttpError(400, 'INVALID_APP_POLICY', 'An application classification is invalid.');
    }
    const key = `${entry.platform}\n${entry.runtimeIdentity}`;
    if (seen.has(key)) throw new HttpError(400, 'INVALID_APP_POLICY', 'Application classifications must be unique.');
    seen.add(key);
    return {
      platform: entry.platform as RuntimePlatform,
      runtimeIdentity: entry.runtimeIdentity,
      displayName: entry.displayName == null ? null : entry.displayName,
      classification: entry.classification as ApplicationClassification,
    };
  }).sort((left, right) => `${left.platform}\n${left.runtimeIdentity}`.localeCompare(`${right.platform}\n${right.runtimeIdentity}`));

  const daily = value.quotas.dailyCategoryMinutes;
  if (!isRecord(daily) || !Array.isArray(value.quotas.perApplicationDailyMinutes)) {
    throw new HttpError(400, 'INVALID_APP_POLICY', 'Quota configuration is invalid.');
  }
  const dailyCategoryMinutes = emptyQuotas().dailyCategoryMinutes;
  for (const category of quotaCategories) dailyCategoryMinutes[category] = quota(daily[category], `quotas.dailyCategoryMinutes.${category}`);
  const perSeen = new Set<string>();
  const perApplicationDailyMinutes = value.quotas.perApplicationDailyMinutes.map((entry) => {
    if (!isRecord(entry) || typeof entry.platform !== 'string' || !platforms.has(entry.platform as RuntimePlatform)
      || typeof entry.runtimeIdentity !== 'string' || entry.runtimeIdentity.length < 1 || entry.runtimeIdentity.length > 256) {
      throw new HttpError(400, 'INVALID_APP_POLICY', 'Per-application quota is invalid.');
    }
    const key = `${entry.platform}\n${entry.runtimeIdentity}`;
    if (perSeen.has(key)) throw new HttpError(400, 'INVALID_APP_POLICY', 'Per-application quotas must be unique.');
    perSeen.add(key);
    return { platform: entry.platform as RuntimePlatform, runtimeIdentity: entry.runtimeIdentity, minutes: quota(entry.minutes, 'perApplicationDailyMinutes.minutes') };
  }).sort((left, right) => `${left.platform}\n${left.runtimeIdentity}`.localeCompare(`${right.platform}\n${right.runtimeIdentity}`));
  return {
    classifications: normalizedClassifications,
    quotas: {
      dailyCategoryMinutes,
      weeklyRestrictedEntertainmentMinutes: quota(value.quotas.weeklyRestrictedEntertainmentMinutes, 'quotas.weeklyRestrictedEntertainmentMinutes'),
      perApplicationDailyMinutes,
    },
    ...(value.timeWindows === undefined ? {} : { timeWindows: parseTimeWindows(value.timeWindows) }),
  };
}

export async function getAppPolicy(
  database: D1Database,
  accountId: string,
  childId: string,
): Promise<AppPolicyDocument> {
  const row = await database.prepare(`
    SELECT version,payload_json,effective_at_ms
    FROM runtime_child_app_policy_versions_v1
    WHERE account_id=?1 AND child_id=?2 ORDER BY version DESC LIMIT 1
  `).bind(accountId, childId).first<{ version: number; payload_json: string; effective_at_ms: number }>();
  if (!row) return { version: 0, effectiveAtMs: null, classifications: [], quotas: emptyQuotas(), timeWindows: allOpenTimeWindows() };
  const payload = normalizeStoredPolicy(JSON.parse(row.payload_json) as AppPolicyUpdate);
  return { version: Number(row.version), effectiveAtMs: Number(row.effective_at_ms), ...payload };
}

export async function putAppPolicy(
  database: D1Database,
  accountId: string,
  childId: string,
  expectedEtag: string | null,
  update: AppPolicyUpdate,
  nowMs: number,
): Promise<AppPolicyDocument> {
  const current = await getAppPolicy(database, accountId, childId);
  if (expectedEtag !== appPolicyEtag(current.version)) {
    throw new HttpError(412, 'APP_POLICY_CONFLICT', 'App policy has changed. Reload before saving.');
  }
  const completeUpdate = normalizeStoredPolicy({ ...update, timeWindows: update.timeWindows ?? current.timeWindows,
    applicationKnowledge: current.applicationKnowledge, resolvedApplications: current.resolvedApplications });
  const version = current.version + 1;
  const payloadJson = JSON.stringify(completeUpdate);
  const statements: D1PreparedStatement[] = [database.prepare(`
    INSERT INTO runtime_child_app_policy_versions_v1(
      account_id,child_id,version,payload_json,payload_hash,effective_at_ms,created_at_ms
    ) VALUES(?1,?2,?3,?4,?5,?6,?6)
  `).bind(accountId, childId, version, payloadJson, await sha256Hex(payloadJson), nowMs)];
  for (const entry of completeUpdate.classifications) statements.push(database.prepare(`
    INSERT INTO runtime_app_classification_history_v1(
      account_id,child_id,platform,runtime_identity,policy_version,classification,
      display_name,effective_at_ms,created_at_ms
    ) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?8)
  `).bind(accountId, childId, entry.platform, entry.runtimeIdentity, version,
    entry.classification, entry.displayName, nowMs));
  const affected = await database.prepare(`
    SELECT DISTINCT m.id,m.desired_policy_version,m.default_child_id
    FROM runtime_machines_v2 m
    LEFT JOIN runtime_user_assignments_v2 a ON a.machine_id=m.id
      AND a.assignment_version=(SELECT MAX(a2.assignment_version)
        FROM runtime_user_assignments_v2 a2
        WHERE a2.machine_id=a.machine_id AND a2.local_user_id=a.local_user_id)
    WHERE m.account_id=?1 AND m.revoked_at_ms IS NULL
      AND (m.default_child_id=?2 OR (a.child_id=?2 AND a.protected=1))
  `).bind(accountId, childId).all<{ id: string; desired_policy_version: number; default_child_id: string | null }>();
  for (const machine of affected.results || []) {
    const next = Number(machine.desired_policy_version) + 1;
    statements.push(database.prepare(`
      UPDATE runtime_machines_v2 SET desired_policy_version=?1,policy_state='pending',
        policy_error=NULL,updated_at_ms=?2 WHERE id=?3 AND desired_policy_version=?4
    `).bind(next, nowMs, machine.id, machine.desired_policy_version));
    statements.push(database.prepare(`
      INSERT INTO runtime_machine_policy_versions_v2(machine_id,version,payload_hash,created_at_ms)
      VALUES(?1,?2,?3,?4)
    `).bind(machine.id, next, await sha256Hex(JSON.stringify({
      machineId: machine.id, version: next, defaultChildId: machine.default_child_id,
      appPolicyChildId: childId, appPolicyVersion: version,
    })), nowMs));
  }
  try {
    await database.batch(statements);
  } catch (error) {
    if (error instanceof Error && /UNIQUE|constraint/iu.test(error.message)) {
      throw new HttpError(412, 'APP_POLICY_CONFLICT', 'App policy has changed. Reload before saving.');
    }
    throw error;
  }
  return { version, effectiveAtMs: nowMs, ...completeUpdate };
}

export async function resolveClassification(
  database: D1Database,
  accountId: string,
  childId: string,
  platform: RuntimePlatform,
  runtimeIdentity: string,
  policyVersion: number | null,
): Promise<{ version: number | null; classification: ApplicationClassification; quotaBucket: string }> {
  if (policyVersion == null || policyVersion <= 0) {
    return { version: null, classification: 'unclassified', quotaBucket: 'unclassified' };
  }
  const version = await database.prepare(`
    SELECT version,payload_json FROM runtime_child_app_policy_versions_v1
    WHERE account_id=?1 AND child_id=?2 AND version=?3
  `).bind(accountId, childId, policyVersion).first<{ version: number; payload_json: string }>();
  if (!version) throw new HttpError(409, 'APP_POLICY_VERSION_INVALID', 'App policy version is not valid for this Child.');
  const row = await database.prepare(`
    SELECT classification FROM runtime_app_classification_history_v1
    WHERE account_id=?1 AND child_id=?2 AND platform=?3 AND runtime_identity=?4
      AND policy_version=?5
  `).bind(accountId, childId, platform, runtimeIdentity, policyVersion)
    .first<{ classification: ApplicationClassification }>();
  const payload = JSON.parse(version.payload_json) as AppPolicyUpdate;
  const projected = payload?.resolvedApplications?.find(entry => entry.platform === platform && entry.runtimeIdentity === runtimeIdentity);
  const classification = row?.classification ?? projected?.classification ?? 'unclassified';
  return { version: policyVersion, classification, quotaBucket: classification };
}

function groupedUnion(groups: Map<string, Array<[number, number]>>): number {
  let total = 0;
  for (const intervals of groups.values()) {
    if (intervals.length === 0) continue;
    const sorted = [...intervals].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    let start = sorted[0]![0];
    let end = sorted[0]![1];
    for (const interval of sorted.slice(1)) {
      if (interval[0] <= end) end = Math.max(end, interval[1]);
      else { total += end - start; start = interval[0]; end = interval[1]; }
    }
    total += end - start;
  }
  return total;
}

function addUsageRow(
  grouped: Map<string, UsageIdentityGroup>,
  row: Record<string, unknown>,
  windowStartMs: number,
  windowEndMs: number,
): void {
  const startAtMs = Math.max(windowStartMs, Number(row.start_at_ms));
  const endAtMs = Math.min(windowEndMs, Number(row.end_at_ms));
  if (endAtMs <= startAtMs) return;
  const key = `${row.platform}\n${row.runtime_identity}`;
  const record = grouped.get(key) || {
    platform: row.platform as RuntimePlatform,
    runtimeIdentity: String(row.runtime_identity),
    displayName: row.display_name == null ? null : String(row.display_name),
    firstSeenAtMs: startAtMs,
    lastSeenAtMs: endAtMs,
    machines: new Set<string>(),
    users: new Set<string>(),
    intervals: new Map<string, Array<[number, number]>>(),
  };
  record.firstSeenAtMs = Math.min(record.firstSeenAtMs, startAtMs);
  record.lastSeenAtMs = Math.max(record.lastSeenAtMs, endAtMs);
  if (row.display_name != null) record.displayName = String(row.display_name);
  record.machines.add(String(row.machine_id));
  record.users.add(String(row.local_user_id));
  const lane = `${row.machine_id}\n${row.local_user_id}\n${row.runtime_session_id}\n${row.clock_epoch_id}`;
  const intervals = record.intervals.get(lane) || [];
  intervals.push([startAtMs, endAtMs]);
  record.intervals.set(lane, intervals);
  grouped.set(key, record);
}

function buildClassificationRecords(
  policy: AppPolicyDocument,
  grouped: Map<string, UsageIdentityGroup>,
  catalogItems: CatalogEntry[],
  technicalItems: CatalogEntry[],
  windowStartMs: number,
  windowEndMs: number,
): ClassificationRecordSet {
  const current = new Map(policy.classifications.map((item) => [`${item.platform}\n${item.runtimeIdentity}`, item]));
  const actionableKeys = new Set<string>();
  const actionableByKey = new Map<string, CatalogEntry>();
  for (const item of catalogItems) {
    for (const implementation of item.runtimeImplementations ?? []) {
      const implementationKey = `${implementation.platform}\n${implementation.runtimeIdentity}`;
      actionableKeys.add(implementationKey);
      actionableByKey.set(implementationKey, item);
    }
    if (item.runtimeIdentity) {
      const itemKey = `${item.platform}\n${item.runtimeIdentity}`;
      actionableKeys.add(itemKey);
      actionableByKey.set(itemKey, item);
    }
  }
  const technicalByKey = new Map<string, CatalogEntry>();
  for (const item of technicalItems) {
    for (const implementation of item.runtimeImplementations ?? []) {
      technicalByKey.set(`${implementation.platform}\n${implementation.runtimeIdentity}`, item);
    }
    if (item.runtimeIdentity) technicalByKey.set(`${item.platform}\n${item.runtimeIdentity}`, item);
  }
  const records = [...grouped.entries()].map(([key, row]) => {
    const entry = current.get(key);
    const projection = technicalByKey.get(key);
    return {
      platform: row.platform,
      runtimeIdentity: row.runtimeIdentity,
      displayName: row.displayName,
      firstSeenAtMs: row.firstSeenAtMs,
      lastSeenAtMs: row.lastSeenAtMs,
      mainDurationMs: groupedUnion(row.intervals),
      machineCount: row.machines.size,
      userCount: row.users.size,
      classification: entry?.classification ?? 'unclassified',
      status: entry ? 'processed' : 'pending',
      manageability: actionableKeys.has(key) ? 'actionable' : projection?.manageability ?? 'review',
      catalogKind: projection?.catalogKind ?? (actionableKeys.has(key) ? 'application' : 'unresolved'),
      projectionReasonCode: projection?.projectionReasonCode ?? (actionableKeys.has(key) ? 'VERIFIED_APPLICATION' : 'TECHNICAL_IDENTITY_ONLY'),
      applicationOrigin: actionableByKey.get(key)?.applicationOrigin ?? projection?.applicationOrigin ?? 'unknown',
      originEvidenceCode: actionableByKey.get(key)?.originEvidenceCode ?? projection?.originEvidenceCode ?? null,
    };
  }).sort((a, b) => b.lastSeenAtMs - a.lastSeenAtMs);
  const manageable = records.filter((record) => record.manageability === 'actionable');
  return {
    windowStartMs,
    windowEndMs,
    pending: manageable.filter((record) => record.status === 'pending'),
    processed: manageable.filter((record) => record.status === 'processed'),
    technical: records.filter((record) => record.manageability !== 'actionable'),
  };
}

function quotaState(usedMs: number, minutes: number | null): { limitMs: number | null; remainingMs: number | null; exceeded: boolean } {
  if (minutes == null) return { limitMs: null, remainingMs: null, exceeded: false };
  const limitMs = minutes * 60_000;
  return { limitMs, remainingMs: Math.max(0, limitMs - usedMs), exceeded: usedMs > limitMs };
}

function beijingDayStart(value: number): number {
  const day = 86_400_000;
  const offset = 8 * 3_600_000;
  return Math.floor((value + offset) / day) * day - offset;
}

function minuteOfDay(value: string): number {
  if (value === '24:00') return 1_440;
  const [hour, minute] = value.split(':').map(Number);
  return hour! * 60 + minute!;
}

function outsideWindowIntervals(
  start: number,
  end: number,
  category: ApplicationClassification,
  timeWindows: AppPolicyTimeWindows,
): Array<[number, number]> {
  if (category === 'blocked') return [];
  if (!quotaCategories.includes(category as AppPolicyScheduleCategory)) return [];
  const result: Array<[number, number]> = [];
  let cursor = start;
  while (cursor < end) {
    const dayStart = beijingDayStart(cursor);
    const dayEnd = dayStart + 86_400_000;
    const sliceEnd = Math.min(end, dayEnd);
    const weekday = weekdayByUtcDay[new Date(dayStart + 8 * 3_600_000).getUTCDay()]!;
    const allowed = timeWindows[weekday][category as AppPolicyScheduleCategory]
      .map((window) => [dayStart + minuteOfDay(window.start) * 60_000,
        dayStart + minuteOfDay(window.end) * 60_000] as [number, number]);
    let outsideCursor = cursor;
    for (const [allowedStart, allowedEnd] of allowed) {
      if (allowedEnd <= outsideCursor || allowedStart >= sliceEnd) continue;
      if (allowedStart > outsideCursor) result.push([outsideCursor, Math.min(allowedStart, sliceEnd)]);
      outsideCursor = Math.max(outsideCursor, Math.min(allowedEnd, sliceEnd));
      if (outsideCursor >= sliceEnd) break;
    }
    if (outsideCursor < sliceEnd) result.push([outsideCursor, sliceEnd]);
    cursor = sliceEnd;
  }
  return result.filter(([intervalStart, intervalEnd]) => intervalEnd > intervalStart);
}

async function getAppPolicyHistory(
  database: D1Database,
  accountId: string,
  childId: string,
): Promise<Map<number, Omit<AppPolicyDocument, 'version' | 'effectiveAtMs'>>> {
  const rows = await database.prepare(`
    SELECT version,payload_json FROM runtime_child_app_policy_versions_v1
    WHERE account_id=?1 AND child_id=?2
  `).bind(accountId, childId).all<{ version: number; payload_json: string }>();
  return new Map((rows.results || []).map((row) => [Number(row.version),
    normalizeStoredPolicy(JSON.parse(row.payload_json) as AppPolicyUpdate)]));
}

function dailyQuotaState(
  days: Map<number, Map<string, Array<[number, number]>>>,
  minutes: number | null,
): { limitMs: number | null; remainingMs: number | null; exceeded: boolean; exceededDays: number } {
  if (minutes == null) return { limitMs: null, remainingMs: null, exceeded: false, exceededDays: 0 };
  const limitMs = minutes * 60_000;
  const totals = [...days.values()].map(groupedUnion);
  const exceededDays = totals.filter((used) => used > limitMs).length;
  return {
    limitMs,
    remainingMs: totals.length === 1 ? Math.max(0, limitMs - (totals[0] || 0)) : null,
    exceeded: exceededDays > 0,
    exceededDays,
  };
}

export async function queryAppUsage(
  database: D1Database,
  accountId: string,
  childId: string,
  fromMs: number,
  toMs: number,
  filters: { machineId?: string; localUserId?: string; platform?: RuntimePlatform },
): Promise<unknown> {
  const values: unknown[] = [accountId, childId, fromMs, toMs];
  let sqlFilter = '';
  if (filters.machineId) { values.push(filters.machineId); sqlFilter += ` AND s.machine_id=?${values.length}`; }
  if (filters.localUserId) { values.push(filters.localUserId); sqlFilter += ` AND s.local_user_id=?${values.length}`; }
  if (filters.platform) { values.push(filters.platform); sqlFilter += ` AND s.platform=?${values.length}`; }
  const result = await database.prepare(`
    SELECT s.machine_id,s.local_user_id,s.runtime_session_id,COALESCE(s.clock_epoch_id,'legacy-v2') AS clock_epoch_id,s.platform,
      s.runtime_identity,s.display_name,s.channel,
      CASE WHEN s.accounting_schema_version=2 THEN s.start_wall_time_ms ELSE s.start_at_ms END AS start_wall_time_ms,
      CASE WHEN s.accounting_schema_version=2 THEN s.end_wall_time_ms ELSE s.end_at_ms END AS end_wall_time_ms,
      COALESCE(s.application_classification,'unclassified') AS classification,
      s.app_policy_version,s.estimated
    FROM runtime_usage_segments_v2 s JOIN runtime_machines_v2 m ON m.id=s.machine_id
    WHERE m.account_id=?1 AND s.child_id=?2 AND s.diagnostic=0
      AND ((s.accounting_schema_version=2 AND s.start_wall_time_ms<?4 AND s.end_wall_time_ms>?3)
        OR (s.accounting_schema_version=1 AND s.start_at_ms<?4 AND s.end_at_ms>?3))${sqlFilter}
    ORDER BY start_wall_time_ms,end_wall_time_ms,s.id
  `).bind(...values).all<Record<string, unknown>>();
  const legacyValues: unknown[] = [accountId, childId, fromMs, toMs];
  let legacyFilter = '';
  if (filters.platform) { legacyValues.push(filters.platform); legacyFilter = ` AND s.platform=?${legacyValues.length}`; }
  const legacy = filters.machineId || filters.localUserId ? { results: [] as Record<string, unknown>[] }
    : await database.prepare(`
      SELECT s.device_id AS machine_id,'legacy-v1' AS local_user_id,s.runtime_session_id,
        'legacy-v1' AS clock_epoch_id,s.platform,s.runtime_identity,s.display_name,NULL AS channel,
        s.start_at_ms AS start_wall_time_ms,s.end_at_ms AS end_wall_time_ms,
        'unclassified' AS classification,NULL AS app_policy_version,0 AS estimated
      FROM runtime_usage_segments s JOIN runtime_devices d ON d.id=s.device_id
      WHERE d.account_id=?1 AND d.child_id=?2 AND s.start_at_ms<?4 AND s.end_at_ms>?3${legacyFilter}
      ORDER BY s.start_at_ms,s.end_at_ms,s.id
    `).bind(...legacyValues).all<Record<string, unknown>>();
  const totalGroups = new Map<string, Array<[number, number]>>();
  const categories = new Map<ApplicationClassification, Map<string, Array<[number, number]>>>();
  const categoryDays = new Map<ApplicationClassification, Map<number, Map<string, Array<[number, number]>>>>();
  const applications = new Map<string, {
    platform: RuntimePlatform; runtimeIdentity: string; displayName: string | null;
    classification: ApplicationClassification; groups: Map<string, Array<[number, number]>>;
    days: Map<number, Map<string, Array<[number, number]>>>;
  }>();
  const buckets = new Map<number, Map<string, Array<[number, number]>>>();
  const categoryBuckets = new Map<number, Map<ApplicationClassification, Map<string, Array<[number, number]>>>>();
  const outsideGroups = new Map<string, Array<[number, number]>>();
  const outsideApplications = new Map<string, {
    platform: RuntimePlatform; runtimeIdentity: string; displayName: string | null;
    groups: Map<string, Array<[number, number]>>;
  }>();
  const policyHistory = await getAppPolicyHistory(database, accountId, childId);
  const bucketByDay = toMs - fromMs > 2 * 86_400_000;
  let estimatedSegmentCount = 0;
  let outsideWindowSegmentCount = 0;
  for (const row of [...(result.results || []), ...(legacy.results || [])]) {
    const start = Math.max(fromMs, Number(row.start_wall_time_ms));
    const end = Math.min(toMs, Number(row.end_wall_time_ms));
    if (end <= start) continue;
    const group = `${row.machine_id}\n${row.local_user_id}\n${row.runtime_session_id}\n${row.clock_epoch_id}`;
    const category = classifications.has(row.classification as ApplicationClassification)
      ? row.classification as ApplicationClassification : 'unclassified';
    const main = totalGroups.get(group) || []; main.push([start, end]); totalGroups.set(group, main);
    const categoryGroups = categories.get(category) || new Map<string, Array<[number, number]>>();
    const categoryIntervals = categoryGroups.get(group) || []; categoryIntervals.push([start, end]); categoryGroups.set(group, categoryIntervals);
    categories.set(category, categoryGroups);
    const key = `${row.platform}\n${row.runtime_identity}`;
    const app = applications.get(key) || {
      platform: row.platform as RuntimePlatform, runtimeIdentity: String(row.runtime_identity),
      displayName: row.display_name == null ? null : String(row.display_name), classification: category,
      groups: new Map<string, Array<[number, number]>>(), days: new Map<number, Map<string, Array<[number, number]>>>(),
    };
    const appIntervals = app.groups.get(group) || []; appIntervals.push([start, end]); app.groups.set(group, appIntervals); applications.set(key, app);
    const segmentPolicyVersion = row.app_policy_version == null ? null : Number(row.app_policy_version);
    const segmentPolicy = segmentPolicyVersion == null ? null : policyHistory.get(segmentPolicyVersion);
    const outside = segmentPolicy ? outsideWindowIntervals(start, end, category, segmentPolicy.timeWindows) : [];
    if (outside.length > 0) {
      outsideWindowSegmentCount += 1;
      const outsideForGroup = outsideGroups.get(group) || [];
      outsideForGroup.push(...outside); outsideGroups.set(group, outsideForGroup);
      const outsideApp = outsideApplications.get(key) || {
        platform: row.platform as RuntimePlatform,
        runtimeIdentity: String(row.runtime_identity),
        displayName: row.display_name == null ? null : String(row.display_name),
        groups: new Map<string, Array<[number, number]>>(),
      };
      const outsideAppGroup = outsideApp.groups.get(group) || [];
      outsideAppGroup.push(...outside); outsideApp.groups.set(group, outsideAppGroup);
      outsideApplications.set(key, outsideApp);
    }
    let dayCursor = start;
    while (dayCursor < end) {
      const dayStart = beijingDayStart(dayCursor);
      const sliceEnd = Math.min(end, dayStart + 86_400_000);
      const categoryDayMap = categoryDays.get(category) || new Map<number, Map<string, Array<[number, number]>>>();
      const categoryDayGroups = categoryDayMap.get(dayStart) || new Map<string, Array<[number, number]>>();
      const categoryDayIntervals = categoryDayGroups.get(group) || [];
      categoryDayIntervals.push([dayCursor, sliceEnd]); categoryDayGroups.set(group, categoryDayIntervals);
      categoryDayMap.set(dayStart, categoryDayGroups); categoryDays.set(category, categoryDayMap);
      const appDayGroups = app.days.get(dayStart) || new Map<string, Array<[number, number]>>();
      const appDayIntervals = appDayGroups.get(group) || [];
      appDayIntervals.push([dayCursor, sliceEnd]); appDayGroups.set(group, appDayIntervals); app.days.set(dayStart, appDayGroups);
      dayCursor = sliceEnd;
    }
    let cursor = start;
    while (cursor < end) {
      const bucketStart = bucketByDay ? beijingDayStart(cursor) : Math.floor(cursor / 3_600_000) * 3_600_000;
      const bucketEnd = bucketStart + (bucketByDay ? 86_400_000 : 3_600_000);
      const sliceEnd = Math.min(end, bucketEnd);
      const hourGroups = buckets.get(bucketStart) || new Map<string, Array<[number, number]>>();
      const hourIntervals = hourGroups.get(group) || []; hourIntervals.push([cursor, sliceEnd]); hourGroups.set(group, hourIntervals); buckets.set(bucketStart, hourGroups);
      const hourCategories = categoryBuckets.get(bucketStart) || new Map<ApplicationClassification, Map<string, Array<[number, number]>>>();
      const hourCategoryGroups = hourCategories.get(category) || new Map<string, Array<[number, number]>>();
      const hourCategoryIntervals = hourCategoryGroups.get(group) || [];
      hourCategoryIntervals.push([cursor, sliceEnd]);
      hourCategoryGroups.set(group, hourCategoryIntervals);
      hourCategories.set(category, hourCategoryGroups);
      categoryBuckets.set(bucketStart, hourCategories);
      cursor = sliceEnd;
    }
    if (Number(row.estimated)) estimatedSegmentCount += 1;
  }
  const policy = await getAppPolicy(database, accountId, childId);
  const quotaByApp = new Map(policy.quotas.perApplicationDailyMinutes.map((item) => [`${item.platform}\n${item.runtimeIdentity}`, item.minutes]));
  const categoryEntries = [...categories.entries()].map(([classification, groups]) => {
    const usedMs = groupedUnion(groups);
    const limit = classification === 'blocked' ? 0
      : classification === 'study' || classification === 'composite' || classification === 'restrictedEntertainment' || classification === 'unclassified'
        ? policy.quotas.dailyCategoryMinutes[classification] : null;
    return { classification, durationMs: usedMs, quota: dailyQuotaState(categoryDays.get(classification) || new Map(), limit) };
  }).sort((a, b) => b.durationMs - a.durationMs);
  const appEntries = [...applications.entries()].map(([key, app]) => {
    const durationMs = groupedUnion(app.groups);
    const explicit = quotaByApp.get(key);
    const limit = app.classification === 'blocked' ? 0 : explicit === undefined ? null : explicit;
    return { platform: app.platform, runtimeIdentity: app.runtimeIdentity, displayName: app.displayName,
      classification: app.classification, durationMs, quota: dailyQuotaState(app.days, limit) };
  }).sort((a, b) => b.durationMs - a.durationMs);
  const shifted = new Date(fromMs + 8 * 3_600_000);
  const weekStart = beijingDayStart(fromMs) - ((shifted.getUTCDay() + 6) % 7) * 86_400_000;
  const weekValues: unknown[] = [accountId, childId, weekStart, weekStart + 7 * 86_400_000];
  let weekFilter = '';
  if (filters.machineId) { weekValues.push(filters.machineId); weekFilter += ` AND s.machine_id=?${weekValues.length}`; }
  if (filters.localUserId) { weekValues.push(filters.localUserId); weekFilter += ` AND s.local_user_id=?${weekValues.length}`; }
  if (filters.platform) { weekValues.push(filters.platform); weekFilter += ` AND s.platform=?${weekValues.length}`; }
  const restrictedRows = await database.prepare(`
    SELECT s.machine_id,s.local_user_id,s.runtime_session_id,s.clock_epoch_id,
      s.start_wall_time_ms,s.end_wall_time_ms
    FROM runtime_usage_segments_v2 s JOIN runtime_machines_v2 m ON m.id=s.machine_id
    WHERE m.account_id=?1 AND s.child_id=?2 AND s.accounting_schema_version=2
      AND s.diagnostic=0 AND s.application_classification='restrictedEntertainment'
      AND s.start_wall_time_ms<?4 AND s.end_wall_time_ms>?3${weekFilter}
  `).bind(...weekValues).all<Record<string, unknown>>();
  const restrictedGroups = new Map<string, Array<[number, number]>>();
  for (const row of restrictedRows.results || []) {
    const group = `${row.machine_id}\n${row.local_user_id}\n${row.runtime_session_id}\n${row.clock_epoch_id}`;
    const intervals = restrictedGroups.get(group) || [];
    intervals.push([Math.max(weekStart, Number(row.start_wall_time_ms)),
      Math.min(weekStart + 7 * 86_400_000, Number(row.end_wall_time_ms))]);
    restrictedGroups.set(group, intervals);
  }
  const restrictedDuration = groupedUnion(restrictedGroups);
  const mediaValues: unknown[] = [accountId, childId, fromMs, toMs];
  let mediaFilter = '';
  if (filters.machineId) { mediaValues.push(filters.machineId); mediaFilter += ` AND s.machine_id=?${mediaValues.length}`; }
  if (filters.localUserId) { mediaValues.push(filters.localUserId); mediaFilter += ` AND s.local_user_id=?${mediaValues.length}`; }
  if (filters.platform) { mediaValues.push(filters.platform); mediaFilter += ` AND s.platform=?${mediaValues.length}`; }
  const mediaRows = await database.prepare(`
    SELECT s.start_wall_time_ms,s.end_wall_time_ms
    FROM runtime_media_segments_v2 s JOIN runtime_machines_v2 m ON m.id=s.machine_id
    WHERE m.account_id=?1 AND s.child_id=?2
      AND s.start_wall_time_ms<?4 AND s.end_wall_time_ms>?3${mediaFilter}
  `).bind(...mediaValues).all<{ start_wall_time_ms: number; end_wall_time_ms: number }>();
  const mediaPlaybackTotalMs = (mediaRows.results || []).reduce((sum, row) => sum
    + Math.max(0, Math.min(toMs, Number(row.end_wall_time_ms))
      - Math.max(fromMs, Number(row.start_wall_time_ms))), 0);
  return {
    totalDurationMs: groupedUnion(totalGroups),
    buckets: [...buckets.entries()].sort((a, b) => a[0] - b[0]).map(([startAtMs, groups]) => ({
      startAtMs,
      durationMs: groupedUnion(groups),
      categories: [...(categoryBuckets.get(startAtMs) || new Map()).entries()]
        .map(([classification, categoryGroups]) => ({ classification, durationMs: groupedUnion(categoryGroups) }))
        .filter((entry) => entry.durationMs > 0),
    })),
    categories: categoryEntries,
    applications: appEntries,
    weeklyRestrictedEntertainment: {
      durationMs: restrictedDuration,
      quota: quotaState(restrictedDuration, policy.quotas.weeklyRestrictedEntertainmentMinutes),
    },
    estimatedSegmentCount,
    appPolicyVersion: policy.version,
    outsideTimeWindows: {
      durationMs: groupedUnion(outsideGroups),
      segmentCount: outsideWindowSegmentCount,
      applications: [...outsideApplications.values()].map((application) => ({
        platform: application.platform,
        runtimeIdentity: application.runtimeIdentity,
        displayName: application.displayName,
        durationMs: groupedUnion(application.groups),
      })).sort((left, right) => right.durationMs - left.durationMs),
    },
    mediaPlaybackTotalMs,
  };
}

export async function queryClassificationRecords(
  database: D1Database,
  accountId: string,
  childId: string,
  nowMs: number,
  platform?: RuntimePlatform,
): Promise<ClassificationRecordSet> {
  return (await queryAppCatalog(database, accountId, childId, nowMs, platform)).classificationRecords;
}

export async function queryAppCatalog(
  database: D1Database,
  accountId: string,
  childId: string,
  nowMs: number,
  platform?: RuntimePlatform,
): Promise<{ windowStartMs: number; windowEndMs: number; items: unknown[]; technicalItems: unknown[]; classificationRecords: ClassificationRecordSet; inventoryScans: Awaited<ReturnType<typeof queryInventoryScanStatus>> }> {
  const windowEndMs = nowMs;
  const windowStartMs = Math.max(0, nowMs - 30 * 86_400_000);
  const values: unknown[] = [accountId, childId, windowStartMs, windowEndMs];
  let platformFilter = '';
  if (platform) { values.push(platform); platformFilter = ` AND s.platform=?${values.length}`; }
  const rows = await database.prepare(`
    SELECT s.platform,s.runtime_identity,s.display_name,s.machine_id,s.local_user_id,s.application_classification,
      s.runtime_session_id,s.clock_epoch_id,
      COALESCE(s.start_wall_time_ms,s.start_at_ms) AS start_at_ms,
      COALESCE(s.end_wall_time_ms,s.end_at_ms) AS end_at_ms
    FROM runtime_usage_segments_v2 s JOIN runtime_machines_v2 m ON m.id=s.machine_id
    WHERE m.account_id=?1 AND s.child_id=?2 AND s.runtime_identity IS NOT NULL
      AND s.diagnostic=0${platformFilter}
      AND COALESCE(s.start_wall_time_ms,s.start_at_ms)<?4
      AND COALESCE(s.end_wall_time_ms,s.end_at_ms)>?3
    ORDER BY start_at_ms,end_at_ms,s.id
  `).bind(...values).all<Record<string, unknown>>();
  const legacyValues: unknown[] = [accountId, childId, windowStartMs, windowEndMs];
  let legacyPlatformFilter = '';
  if (platform) { legacyValues.push(platform); legacyPlatformFilter = ` AND s.platform=?${legacyValues.length}`; }
  const legacyRows = await database.prepare(`
    SELECT s.platform,s.runtime_identity,s.display_name,s.device_id AS machine_id,
      'legacy-v1' AS local_user_id,s.runtime_session_id,'legacy-v1' AS clock_epoch_id,
      s.start_at_ms,s.end_at_ms,NULL AS application_classification
    FROM runtime_usage_segments s JOIN runtime_devices d ON d.id=s.device_id
    WHERE d.account_id=?1 AND d.child_id=?2 AND s.start_at_ms<?4 AND s.end_at_ms>?3${legacyPlatformFilter}
    ORDER BY s.start_at_ms,s.end_at_ms,s.id
  `).bind(...legacyValues).all<Record<string, unknown>>();
  const policy = await getAppPolicy(database, accountId, childId);
  const catalogKnowledge = effectiveApplicationKnowledge(policy.applicationKnowledge ?? {
    schemaVersion:2,version:0,products:[],rules:[],bindings:[],
  });
  const grouped = new Map<string, UsageIdentityGroup>();
  const classificationGrouped = new Map<string, UsageIdentityGroup>();
  for (const row of [...(rows.results || []), ...(legacyRows.results || [])]) {
    addUsageRow(grouped, row, windowStartMs, windowEndMs);
    if (row.application_classification == null || row.application_classification === 'unclassified') {
      addUsageRow(classificationGrouped, row, windowStartMs, windowEndMs);
    }
  }
  const policyByKey = new Map(policy.classifications.map((item) => [`${item.platform}\n${item.runtimeIdentity}`, item]));
  const inventoryRows = await database.prepare(`SELECT i.evidence_json,i.status,i.machine_id,i.local_user_id
    FROM runtime_application_inventory_v1 i JOIN runtime_machines_v2 m ON m.id=i.machine_id
    JOIN runtime_user_assignments_v2 a ON a.machine_id=i.machine_id AND a.local_user_id=i.local_user_id
    WHERE m.account_id=?1 AND a.child_id=?2 AND a.protected=1
      AND a.assignment_version=(SELECT MAX(latest.assignment_version) FROM runtime_user_assignments_v2 latest
        WHERE latest.machine_id=a.machine_id AND latest.local_user_id=a.local_user_id)
      AND NOT (i.status='installed' AND json_extract(i.evidence_json,'$.discovery.sourceKind') IS NULL
        AND EXISTS (SELECT 1 FROM runtime_application_inventory_scans_v2 scan
          WHERE scan.machine_id=i.machine_id AND scan.local_user_id=i.local_user_id AND scan.completed=1)
        AND NOT EXISTS (SELECT 1 FROM runtime_installation_products_v1 product
          WHERE product.machine_id=i.machine_id AND product.local_user_id=i.local_user_id AND product.platform=i.platform
            AND product.status='installed' AND json_extract(product.evidence_json,'$.runtimeIdentity')=i.runtime_identity
          UNION ALL SELECT 1 FROM runtime_application_variants_v1 variant
          WHERE variant.machine_id=i.machine_id AND variant.local_user_id=i.local_user_id AND variant.platform=i.platform
            AND variant.status IN ('installed','runtimeObserved')
            AND json_extract(variant.evidence_json,'$.runtimeIdentity')=i.runtime_identity))`)
    .bind(accountId,childId).all<{evidence_json:string;status:string;machine_id:string;local_user_id:string}>();
  const inventory = new Map<string,{evidence:AppEvidence;installed:boolean;machines:Set<string>;users:Set<string>}>();
  for (const row of inventoryRows.results) {
    const evidence = JSON.parse(row.evidence_json) as AppEvidence, key = `${evidence.platform}\n${evidence.runtimeIdentity}`;
    const item = inventory.get(key) ?? {evidence,installed:false,machines:new Set<string>(),users:new Set<string>()};
    item.installed ||= row.status==='installed'; item.machines.add(row.machine_id); item.users.add(row.local_user_id); inventory.set(key,item);
  }
  const resolvedByKey = new Map((policy.resolvedApplications ?? []).map(item=>[`${item.platform}\n${item.runtimeIdentity}`,item]));
  const associations = associateApplicationEvidence([...inventory.values()].map(item=>item.evidence)
    .filter(evidence=>evidence.discovery?.role!=='component'&&evidence.discovery?.role!=='candidate'&&hasStrongApplicationIdentity(evidence)));
  const productsByDisplayName = new Map<string,AppEvidence[]>();
  const productsByFamilyHint = new Map<string,AppEvidence[]>();
  for (const item of inventory.values()) {
    const evidence=item.evidence;
    if (!item.installed || evidence.discovery?.objectKind!=='product' || evidence.discovery.role!=='application'
        || projectCatalogEvidence(evidence,null,false).manageability!=='actionable') continue;
    const name=normalizedCatalogDisplayName(evidence);
    if (!name) continue;
    const key=`${evidence.platform}\n${name}`, group=productsByDisplayName.get(key)??[];
    group.push(evidence); productsByDisplayName.set(key,group);
    const family=normalizedCatalogFamilyHint(evidence);
    if (family) {
      const familyKey=`${evidence.platform}\n${family}`, familyGroup=productsByFamilyHint.get(familyKey)??[];
      familyGroup.push(evidence); productsByFamilyHint.set(familyKey,familyGroup);
    }
  }
  const ambiguousDisplayNames = new Set([...productsByDisplayName.entries()]
    .filter(([,group])=>new Set(group.map(item=>associations.get(`${item.platform}\n${item.runtimeIdentity}`)
      ?? `${item.platform}\n${item.runtimeIdentity}`)).size>1)
    .map(([key])=>key));
  const ambiguousFamilyHints = new Set([...productsByFamilyHint.entries()]
    .filter(([,group])=>new Set(group.map(item=>associations.get(`${item.platform}\n${item.runtimeIdentity}`)
      ?? `${item.platform}\n${item.runtimeIdentity}`)).size>1)
    .map(([key])=>key));
  const ambiguityByIdentity = new Map<string,string>();
  for (const item of inventory.values()) {
    const evidence=item.evidence, displayKey=`${evidence.platform}\n${normalizedCatalogDisplayName(evidence)}`;
    if (item.installed && ambiguousDisplayNames.has(displayKey))
      ambiguityByIdentity.set(`${evidence.platform}\n${evidence.runtimeIdentity}`,`ambiguous-installation:${displayKey}`);
    else {
      const familyKey=`${evidence.platform}\n${normalizedCatalogFamilyHint(evidence)}`;
      if (item.installed && ambiguousFamilyHints.has(familyKey))
        ambiguityByIdentity.set(`${evidence.platform}\n${evidence.runtimeIdentity}`,`ambiguous-installation-family:${familyKey}`);
    }
  }
  const possibleVariantByIdentity = new Map<string,string>();
  for (const [displayKey, products] of productsByFamilyHint) {
    if (products.length !== 1) continue;
    const installationProduct = products[0]!;
    const productIdentityKey = `${installationProduct.platform}\n${installationProduct.runtimeIdentity}`;
    const productRoot = associations.get(productIdentityKey) ?? productIdentityKey;
    for (const item of inventory.values()) {
      const evidence = item.evidence;
      const identityKey = `${evidence.platform}\n${evidence.runtimeIdentity}`;
      if (!item.installed || evidence.discovery?.objectKind === 'product'
          || `${evidence.platform}\n${normalizedCatalogFamilyHint(evidence)}` !== displayKey) continue;
      const evidenceRoot = associations.get(identityKey) ?? identityKey;
      if (evidenceRoot !== productRoot) {
        possibleVariantByIdentity.set(identityKey, `possible-product-variant:${displayKey}`);
      }
    }
  }
  const keys = new Set([...grouped.keys(), ...policyByKey.keys(), ...[...inventory.keys()].filter(key=>inventory.get(key)!.installed||grouped.has(key)||policyByKey.has(key))]);
  const items = [...keys].map((key) => {
    const observed = grouped.get(key);
    const configured = policyByKey.get(key);
    const [itemPlatform, runtimeIdentity] = key.split('\n');
    const found = inventory.get(key), knowledge = catalogKnowledge;
    const productIds = found && knowledge ? identifyProducts(knowledge.products,found.evidence) : [];
    const product = productIds.length===1 ? knowledge?.products.find(item=>item.id===productIds[0]) : undefined;
    const resolution = found && knowledge ? resolveEffectiveApplication(knowledge,childId,found.evidence,resolvedByKey.get(key)?.classification) : null;
    const projection=projectCatalogEvidence(found?.evidence, product?.id ?? null, Boolean(configured));
    const authoritativeOrigin=projectApplicationOrigin(found?.evidence);
    const ambiguityKey=ambiguityByIdentity.get(key);
    const possibleVariantKey=possibleVariantByIdentity.get(key);
    const effectiveProjection=ambiguityKey&&!product&&!configured
      ? {catalogKind:'candidate' as const,manageability:'review' as const,projectionReasonCode:'AMBIGUOUS_INSTALLATION_PRODUCTS' as const}
      :possibleVariantKey&&!product&&!configured
        ? {catalogKind:'candidate' as const,manageability:'review' as const,projectionReasonCode:'POSSIBLE_PRODUCT_VARIANT' as const}
      : projection;
    const displayName = product?.name || (found?.evidence.discovery?.nameSource !== 'fallback' ? found?.evidence.displayName : null)
      || observed?.displayName || configured?.displayName || found?.evidence.displayName || null;
    const classification = configured?.classification || resolution?.classification || resolvedByKey.get(key)?.classification || 'unclassified';
    const nameSuggestedType = knownProductType(displayName);
    const appType = resolution?.appType && resolution.appType !== 'unknown' ? resolution.appType : nameSuggestedType ?? 'unknown';
    const typeStatus = resolution?.typeStatus === 'confirmed' ? 'confirmed' as const
      : nameSuggestedType ? 'suggested' as const : 'unknown' as const;
    const typeReasonCode = resolution?.typeStatus === 'confirmed' ? resolution.typeReasonCode
      : nameSuggestedType ? 'exactNameSuggestion' as const : 'none' as const;
    const productTypeSuggestion = classification === 'unclassified' && appType === 'game';
    const systemDefault = resolution?.ruleIds.includes(defaultSystemApplicationRuleId) ?? false;
    const gameDefault = resolution?.ruleIds.includes(defaultGameGroupRuleId) ?? false;
    const catalogGroup = projectCatalogGroup({
      actionable: effectiveProjection.manageability === 'actionable',
      exactSystemTool: authoritativeOrigin.originEvidenceCode === 'exactPackageRule',
      appType,
      typeStatus,
    });
    return {
      platform: itemPlatform,
      runtimeIdentity: runtimeIdentity as string | null,
      displayName,
      discovery: found?.evidence.discovery ?? null,
      productId: product?.id ?? null,
      classification,
      classificationStatus: configured ? 'explicit' : resolution?.status ?? 'unclassified',
      classificationReason: configured ? '家长明确配置' : resolution?.status==='explicit' ? '孩子产品明确分类'
        : systemDefault ? '系统应用默认归为复合' : gameDefault ? '游戏默认归为受限娱乐'
          : resolution?.status==='automatic' ? '已批准规则' : resolution?.status==='conflict' ? '规则冲突，保留有效分类'
            : resolution?.status==='suggestion' ? '仅建议，尚未生效' : productTypeSuggestion ? (typeStatus==='confirmed'?'已确认游戏，建议归为受限娱乐（尚未生效）':'疑似游戏，建议归为受限娱乐（尚未生效）') : '尚未归类',
      appType,
      typeStatus,
      typeReasonCode,
      productType:appType,
      suggestedClassification: productTypeSuggestion ? 'restrictedEntertainment' as const : null,
      productTypeReason: typeStatus==='confirmed' ? '可信发行身份或家庭产品知识' : productTypeSuggestion ? '受控产品名称精确匹配（仅建议）' : null,
      applicationOrigin: authoritativeOrigin.applicationOrigin,
      originEvidenceCode: authoritativeOrigin.originEvidenceCode,
      ...catalogGroup,
      installationState: found?.installed ? 'installed' : observed ? 'usedNotDiscovered' : 'preconfigured',
      firstSeenAtMs: observed?.firstSeenAtMs ?? null,
      lastSeenAtMs: observed?.lastSeenAtMs ?? null,
      mainDurationMs: observed ? groupedUnion(observed.intervals) : 0,
      machineCount: new Set([...(observed?.machines ?? []),...(found?.machines ?? [])]).size,
      userCount: new Set([...(observed?.users ?? []),...(found?.users ?? [])]).size,
      observedInWindow: Boolean(observed),
      ...effectiveProjection,
    };
  });
  // A configured, reliably identified product stays in the directory before discovery/use.
  for (const binding of catalogKnowledge.bindings) for (const entry of binding.products) {
    if (binding.childId!==childId) continue;
    const product = catalogKnowledge.products.find(item=>item.id===entry.productId);
    for (const itemPlatform of new Set(product?.selectors.map(item=>item.platform) ?? [])) {
      if (items.some(item=>item.productId===entry.productId && item.platform===itemPlatform)) continue;
      items.push({platform:itemPlatform,runtimeIdentity:null,displayName:product!.name,productId:entry.productId,
        classification:entry.classification,classificationStatus:'explicit',classificationReason:'孩子产品明确分类',installationState:'preconfigured',
        appType:product!.type,typeStatus:'confirmed' as const,typeReasonCode:'verifiedProductRule' as const,
        productType:product!.type,suggestedClassification:null,productTypeReason:'家庭产品知识',
        applicationOrigin:'unknown' as const,originEvidenceCode:null,
        ...projectCatalogGroup({actionable:true,exactSystemTool:false,appType:product!.type,typeStatus:'confirmed'}),
        firstSeenAtMs:null,lastSeenAtMs:null,mainDurationMs:0,machineCount:0,userCount:0,observedInWindow:false,discovery:null,
        catalogKind:'product' as const,manageability:'actionable' as const,projectionReasonCode:'CONFIRMED_PRODUCT' as const});
    }
  }
  const baseKey=(item:typeof items[number])=>{const identityKey=`${item.platform}\n${item.runtimeIdentity}`;
    const ambiguityKey=item.runtimeIdentity===null?undefined:ambiguityByIdentity.get(identityKey);
    const possibleVariantKey=item.runtimeIdentity===null?undefined:possibleVariantByIdentity.get(identityKey);
    return item.productId?`${item.platform}\nproduct:${item.productId}`
      :isPackageContainer(inventory.get(identityKey)?.evidence)?`${item.platform}\npackage-container:${item.runtimeIdentity}`
        :isLaunchablePackageApplication(inventory.get(identityKey)?.evidence)?`${item.platform}\npackage-app:${item.runtimeIdentity}`
      :ambiguityKey&&item.manageability!=='actionable'?ambiguityKey
        :possibleVariantKey&&item.manageability!=='actionable'?possibleVariantKey
          :associations.get(identityKey)??identityKey;};
  const classificationsByBase=new Map<string,Set<ApplicationClassification>>();
  for(const item of items)if(item.discovery?.objectKind!=='product'&&item.classification!=='unclassified'){
    const set=classificationsByBase.get(baseKey(item))??new Set<ApplicationClassification>();set.add(item.classification);classificationsByBase.set(baseKey(item),set);}
  const productGroups = new Map<string,typeof items>();
  for(const item of items){const base=baseKey(item),classes=classificationsByBase.get(base);
    const classificationKey=!classes||classes.size<=1?[...(classes??[])][0]??'unclassified':item.discovery?.objectKind==='product'?'mixed':item.classification;
    const key=`${base}\n${classificationKey}`;const group=productGroups.get(key)??[];group.push(item);productGroups.set(key,group);}
  const directory = [...productGroups.values()].map(group=>{
    const variants=group.filter(item=>item.runtimeIdentity!==null&&item.discovery?.objectKind!=='product');
    const groupHasActionable=group.some(item=>item.manageability==='actionable');
    const implementations=variants.filter(item=>!['maintenance','helper','hosted'].includes(item.discovery?.variantRole??'')
      && item.discovery?.role!=='component'&&item.discovery?.role!=='candidate'
      && (item.manageability==='actionable'||groupHasActionable));
    const intervals = new Map<string,Array<[number,number]>>(), machines=new Set<string>(),users=new Set<string>();
    for(const item of implementations){const key=`${item.platform}\n${item.runtimeIdentity}`, used=grouped.get(key),installed=inventory.get(key);
      for(const [lane,ranges]of used?.intervals??[]){const current=intervals.get(lane)??[];current.push(...ranges);intervals.set(lane,current);}
      for(const machine of [...(used?.machines??[]),...(installed?.machines??[])])machines.add(machine);
      for(const user of [...(used?.users??[]),...(installed?.users??[])])users.add(user);
    }
    for(const item of group){const key=`${item.platform}\n${item.runtimeIdentity}`,installed=inventory.get(key);
      for(const machine of installed?.machines??[])machines.add(machine);
      for(const user of installed?.users??[])users.add(user);
    }
    const primary = [...group].sort((a,b)=>(a.discovery?.objectKind==='product'?0:1)-(b.discovery?.objectKind==='product'?0:1)
      ||(a.manageability==='actionable'?0:a.manageability==='review'?1:2)-(b.manageability==='actionable'?0:b.manageability==='review'?1:2)
      ||(a.discovery?.nameSource==='appList'?0:a.discovery?.role==='application'?1:2)-(b.discovery?.nameSource==='appList'?0:b.discovery?.role==='application'?1:2))[0]!;
    const hasConfirmedProduct=group.some(item=>item.productId);
    const hasExplicitClassification=group.some(item=>item.classificationStatus==='explicit');
    const hasLegacyContainerClassification=group.some(item=>item.projectionReasonCode==='LEGACY_CONTAINER_CLASSIFICATION');
    const hasPackageContainer=group.some(item=>item.projectionReasonCode==='PACKAGE_CONTAINER');
    const hasTechnicalReviewProduct=group.some(item=>item.discovery?.objectKind==='product'
      && item.projectionReasonCode==='TECHNICAL_PRODUCT_REVIEW');
    const aggregateProjection = hasConfirmedProduct
      ? {catalogKind:'product' as const,manageability:'actionable' as const,projectionReasonCode:'CONFIRMED_PRODUCT' as const}
      : hasLegacyContainerClassification
        ? {catalogKind:'candidate' as const,manageability:'review' as const,projectionReasonCode:'LEGACY_CONTAINER_CLASSIFICATION' as const}
      : hasExplicitClassification
        ? {catalogKind:'application' as const,manageability:'actionable' as const,projectionReasonCode:'EXPLICIT_APPLICATION_CLASSIFICATION' as const}
      : hasTechnicalReviewProduct
          ? {catalogKind:'candidate' as const,manageability:'review' as const,projectionReasonCode:'TECHNICAL_PRODUCT_REVIEW' as const}
      : hasPackageContainer
        ? {catalogKind:'component' as const,manageability:'hidden' as const,projectionReasonCode:'PACKAGE_CONTAINER' as const}
          : group.some(item=>item.discovery?.objectKind==='product'&&item.manageability==='actionable')
            ? {catalogKind:'product' as const,manageability:'actionable' as const,projectionReasonCode:'CONFIRMED_PRODUCT' as const}
      : group.some(item=>item.manageability==='actionable')
        ? {catalogKind:'application' as const,manageability:'actionable' as const,projectionReasonCode:primary.projectionReasonCode}
        : group.every(item=>item.manageability==='hidden')
          ? {catalogKind:'component' as const,manageability:'hidden' as const,projectionReasonCode:'COMPONENT' as const}
          : {catalogKind:primary.catalogKind,manageability:'review' as const,projectionReasonCode:primary.projectionReasonCode};
    const classes=new Set(variants.map(item=>item.classification).filter(item=>item!=='unclassified'));
    const applicationOrigin:ApplicationOrigin=group.some(item=>item.applicationOrigin==='operatingSystem')?'operatingSystem'
      :group.some(item=>item.applicationOrigin==='user')?'user':'unknown';
    const originEvidenceCodes=[...new Set(group.filter(item=>item.applicationOrigin===applicationOrigin)
      .map(item=>item.originEvidenceCode).filter((value):value is ApplicationOriginEvidenceCode=>value!==null))];
    const confirmedTypeItem=group.find(item=>item.typeStatus==='confirmed'&&(item.appType==='game'||item.appType==='gameLauncher'||item.appType==='gameUtility'))
      ??group.find(item=>item.typeStatus==='confirmed')??primary;
    const catalogGroup=projectCatalogGroup({
      actionable:aggregateProjection.manageability==='actionable',
      exactSystemTool:group.some(item=>item.catalogGroup==='systemTool'),
      appType:String(confirmedTypeItem.appType),
      typeStatus:String(confirmedTypeItem.typeStatus),
    });
    return {...primary,runtimeIdentity:implementations.length===1?implementations[0]!.runtimeIdentity:implementations.length===0?primary.runtimeIdentity:null,
      classification:classes.size===1?[...classes][0]!:primary.classification,mixedClassifications:classes.size>1,
      observedInWindow:group.some(item=>item.observedInWindow),
      discovery:group.some(item=>item.discovery?.role==='application')?{...primary.discovery!,role:'application' as const}:primary.discovery,
      runtimeImplementations:implementations.map(item=>({platform:item.platform,runtimeIdentity:item.runtimeIdentity,displayName:item.displayName})),
      variants:variants.map(item=>({displayName:item.displayName,platform:item.platform,variantRole:item.discovery?.variantRole??'unknown',
        installationState:item.installationState,manageability:item.manageability,lastSeenAtMs:item.lastSeenAtMs,classification:item.classification,
        runtimeIdentity:item.runtimeIdentity})),
      associationStatus:group[0]!.productId?'confirmedProduct':implementations.length>1?'verifiedIdentityAssociation':'technicalIdentity',
      applicationOrigin,originEvidenceCode:originEvidenceCodes.length===1?originEvidenceCodes[0]:null,
      appType:confirmedTypeItem.appType,typeStatus:confirmedTypeItem.typeStatus,typeReasonCode:confirmedTypeItem.typeReasonCode,
      productType:confirmedTypeItem.productType,productTypeReason:confirmedTypeItem.productTypeReason,
      mainDurationMs:groupedUnion(intervals),machineCount:machines.size,userCount:users.size,
      lastSeenAtMs:Math.max(0,...group.map(item=>item.lastSeenAtMs??0))||null,
      installationState:group.some(item=>item.installationState==='installed')?'installed':group[0]!.installationState,
      ...aggregateProjection,...catalogGroup};
  });
  const technicalVariants=items.filter(item=>item.discovery?.objectKind==='variant'&&item.manageability!=='actionable'
    && (item.runtimeIdentity===null||(!ambiguityByIdentity.has(`${item.platform}\n${item.runtimeIdentity}`)
      && !possibleVariantByIdentity.has(`${item.platform}\n${item.runtimeIdentity}`))));
  const filtered = directory.filter((item) => !platform || item.platform === platform)
    .sort((left, right) => Number(right.lastSeenAtMs || 0) - Number(left.lastSeenAtMs || 0)
      || String(left.displayName || '').localeCompare(String(right.displayName || '')));
  const catalogItems = filtered.filter(item=>item.manageability==='actionable') as CatalogEntry[];
  const technicalItems = [...filtered.filter(item=>item.manageability!=='actionable'),...technicalVariants.filter(item=>!platform||item.platform===platform)]
    .filter((item,index,array)=>array.findIndex(other=>other.platform===item.platform&&other.runtimeIdentity===item.runtimeIdentity)===index) as CatalogEntry[];
  return { windowStartMs, windowEndMs,
    items:catalogItems,
    technicalItems,
    classificationRecords:buildClassificationRecords(policy,classificationGrouped,catalogItems,technicalItems,windowStartMs,windowEndMs),
    inventoryScans:await queryInventoryScanStatus(database,accountId,childId) };
}

function runtimeLogLevel(code: string): 'error' | 'warning' | 'info' {
  const normalized = code.toLowerCase();
  if (/(fail|error|corrupt|conflict)/.test(normalized)) return 'error';
  if (/(late|missing|mismatch|reject|unknown|unconfirmed|recovery)/.test(normalized)) return 'warning';
  return 'info';
}

export async function queryRuntimeLogs(
  database: D1Database,
  accountId: string,
  childId: string,
  fromMs: number,
  toMs: number,
  limit: number,
  cursor: { beforeMs: number; beforeId: string } | null,
  options: { machineId?: string; level?: 'error' | 'warning' | 'info'; category?: RuntimeLogCategory },
): Promise<{ items: unknown[]; nextCursor: string | null; summary: { total: number; error: number; warning: number; info: number } }> {
  type RuntimeLogItem = { id: string; timestampMs: number; level: 'error' | 'warning' | 'info'; [key: string]: unknown };
  const values: unknown[] = [accountId, childId, fromMs, toMs, cursor?.beforeMs ?? null, cursor?.beforeId ?? ''];
  let filter = '';
  if (options.machineId) { values.push(options.machineId); filter += ` AND s.machine_id=?${values.length}`; }
  if (options.level) {
    values.push(options.level);
    filter += ` AND (CASE
      WHEN LOWER(COALESCE(s.diagnostic_code,'')) GLOB '*fail*'
        OR LOWER(COALESCE(s.diagnostic_code,'')) GLOB '*error*'
        OR LOWER(COALESCE(s.diagnostic_code,'')) GLOB '*corrupt*'
        OR LOWER(COALESCE(s.diagnostic_code,'')) GLOB '*conflict*' THEN 'error'
      WHEN LOWER(COALESCE(s.diagnostic_code,'')) GLOB '*late*'
        OR LOWER(COALESCE(s.diagnostic_code,'')) GLOB '*missing*'
        OR LOWER(COALESCE(s.diagnostic_code,'')) GLOB '*mismatch*'
        OR LOWER(COALESCE(s.diagnostic_code,'')) GLOB '*reject*'
        OR LOWER(COALESCE(s.diagnostic_code,'')) GLOB '*unknown*'
        OR LOWER(COALESCE(s.diagnostic_code,'')) GLOB '*unconfirmed*'
        OR LOWER(COALESCE(s.diagnostic_code,'')) GLOB '*recovery*' THEN 'warning'
      ELSE 'info' END)=?${values.length}`;
  }
  values.push(limit + 1);
  const rows = options.category && options.category !== 'accounting' ? { results: [] } : await database.prepare(`
    SELECT s.id,s.machine_id,m.display_name AS machine_name,m.platform,s.wall_time_ms,s.diagnostic_code
    FROM runtime_usage_diagnostic_segments_v2 s JOIN runtime_machines_v2 m ON m.id=s.machine_id
    WHERE m.account_id=?1 AND s.child_id=?2 AND s.wall_time_ms>=?3 AND s.wall_time_ms<?4
      AND (?5 IS NULL OR s.wall_time_ms<?5 OR (s.wall_time_ms=?5 AND s.id<?6))${filter}
    ORDER BY s.wall_time_ms DESC,s.id DESC LIMIT ?${values.length}
  `).bind(...values).all<Record<string, unknown>>();
  const accounting: RuntimeLogItem[] = (rows.results || []).map((row) => {
    const eventCode = String(row.diagnostic_code || 'accountingDiagnostic');
    return {
      id: String(row.id), timestampMs: Number(row.wall_time_ms), level: runtimeLogLevel(eventCode),
      category: 'accounting', eventCode, machineId: String(row.machine_id),
      machineName: row.machine_name == null ? '电脑' : String(row.machine_name),
      platform: row.platform, module: 'accounting-state-machine',
      message: 'accounting_diagnostic_boundary', source: 'accounting', details: {},
    };
  }).filter((item) => !options.category || item.category === options.category);
  const terminal = await queryTerminalLogs(database, accountId, fromMs, toMs, limit + 1, cursor, options) as RuntimeLogItem[];
  const merged = [...accounting, ...terminal].sort((left, right) => Number(right.timestampMs) - Number(left.timestampMs)
    || String(right.id).localeCompare(String(left.id)));
  const page = merged.slice(0, limit);
  const last = page[page.length - 1];
  const nextCursor = merged.length > limit && last
    ? btoa(JSON.stringify({ beforeMs: Number(last.timestampMs), beforeId: String(last.id) })) : null;
  return {
    items: page,
    nextCursor,
    summary: page.reduce<{ total: number; error: number; warning: number; info: number }>((summary, item) => {
      summary.total += 1; summary[item.level] += 1; return summary;
    }, { total: 0, error: 0, warning: 0, info: 0 }),
  };
}

export async function querySegmentDetails(
  database: D1Database,
  accountId: string,
  childId: string,
  kind: 'usage' | 'media',
  fromMs: number,
  toMs: number,
  limit: number,
  cursor: { beforeMs: number; beforeId: string } | null,
): Promise<{ items: unknown[]; nextCursor: string | null }> {
  const table = kind === 'usage' ? 'runtime_usage_segments_v2' : 'runtime_media_segments_v2';
  const startColumn = kind === 'usage' ? 'start_wall_time_ms' : 'start_wall_time_ms';
  const rows = await database.prepare(`
    SELECT s.id,s.machine_id,s.local_user_id,s.platform,s.runtime_identity,s.display_name,
      s.${startColumn} AS start_at_ms,s.end_wall_time_ms,s.monotonic_duration_ms,s.estimated,
      ${kind === 'usage' ? "s.channel,s.application_classification,s.app_policy_version,s.quota_bucket" : "s.media_kind,s.presentation,0 AS authoritative_for_usage,NULL AS application_classification,NULL AS app_policy_version,NULL AS quota_bucket"}
    FROM ${table} s JOIN runtime_machines_v2 m ON m.id=s.machine_id
    WHERE m.account_id=?1 AND s.child_id=?2 AND s.${startColumn}>=?3 AND s.${startColumn}<?4
      AND (?5 IS NULL OR s.${startColumn}<?5 OR (s.${startColumn}=?5 AND s.id<?6))
    ORDER BY s.${startColumn} DESC,s.id DESC LIMIT ?7
  `).bind(accountId, childId, fromMs, toMs, cursor?.beforeMs ?? null,
    cursor?.beforeId ?? '', limit + 1).all<Record<string, unknown>>();
  const all = rows.results || [];
  const page = all.slice(0, limit).map((row) => ({
    id: row.id,
    machineId: row.machine_id,
    localUserId: row.local_user_id,
    platform: row.platform,
    runtimeIdentity: row.runtime_identity,
    displayName: row.display_name,
    startAtMs: Number(row.start_at_ms),
    endAtMs: Number(row.end_wall_time_ms),
    durationMs: Number(row.monotonic_duration_ms),
    estimated: Boolean(row.estimated),
    channel: row.channel,
    mediaKind: row.media_kind,
    presentation: row.presentation,
    applicationClassification: row.application_classification,
    appPolicyVersion: row.app_policy_version == null ? null : Number(row.app_policy_version),
    quotaBucket: row.quota_bucket,
    authoritativeForUsage: kind === 'usage',
  }));
  const last = page[page.length - 1] as { startAtMs: number; id: string } | undefined;
  const nextCursor = all.length > limit && last
    ? btoa(JSON.stringify({ beforeMs: last.startAtMs, beforeId: last.id })) : null;
  return { items: page, nextCursor };
}

export function parseCursor(value: string | null): { beforeMs: number; beforeId: string } | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(atob(value)) as { beforeMs?: unknown; beforeId?: unknown };
    if (!Number.isSafeInteger(parsed.beforeMs) || Number(parsed.beforeMs) < 0
      || typeof parsed.beforeId !== 'string' || parsed.beforeId.length < 1 || parsed.beforeId.length > 200) {
      throw new Error('invalid cursor');
    }
    return { beforeMs: Number(parsed.beforeMs), beforeId: parsed.beforeId };
  } catch {
    throw new HttpError(400, 'INVALID_CURSOR', 'Cursor is invalid.');
  }
}
