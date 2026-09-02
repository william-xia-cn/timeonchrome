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
import { isRecord } from './validation';

const classifications = new Set<ApplicationClassification>([
  'study', 'composite', 'restrictedEntertainment', 'unclassified', 'blocked',
]);
const platforms = new Set<RuntimePlatform>(['windows', 'macos']);
const quotaCategories = ['study', 'composite', 'restrictedEntertainment', 'unclassified'] as const;
const weekdays: AppPolicyWeekday[] = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
const weekdayByUtcDay: AppPolicyWeekday[] = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

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
  return { classifications: payload.classifications, quotas: payload.quotas, timeWindows: payload.timeWindows ?? allOpenTimeWindows() };
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
  const completeUpdate = normalizeStoredPolicy({ ...update, timeWindows: update.timeWindows ?? current.timeWindows });
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
    SELECT version FROM runtime_child_app_policy_versions_v1
    WHERE account_id=?1 AND child_id=?2 AND version=?3
  `).bind(accountId, childId, policyVersion).first<{ version: number }>();
  if (!version) throw new HttpError(409, 'APP_POLICY_VERSION_INVALID', 'App policy version is not valid for this Child.');
  const row = await database.prepare(`
    SELECT classification FROM runtime_app_classification_history_v1
    WHERE account_id=?1 AND child_id=?2 AND platform=?3 AND runtime_identity=?4
      AND policy_version=?5
  `).bind(accountId, childId, platform, runtimeIdentity, policyVersion)
    .first<{ classification: ApplicationClassification }>();
  const classification = row?.classification ?? 'unclassified';
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
): Promise<{ windowStartMs: number; windowEndMs: number; pending: unknown[]; processed: unknown[] }> {
  const windowEndMs = nowMs;
  const windowStartMs = Math.max(0, nowMs - 30 * 86_400_000);
  const values: unknown[] = [accountId, childId, windowStartMs, windowEndMs];
  let filter = '';
  if (platform) { values.push(platform); filter = ` AND s.platform=?${values.length}`; }
  const rows = await database.prepare(`
    SELECT s.platform,s.runtime_identity,s.display_name,s.machine_id,s.local_user_id,
      s.runtime_session_id,s.clock_epoch_id,
      COALESCE(s.start_wall_time_ms,s.start_at_ms) AS start_at_ms,
      COALESCE(s.end_wall_time_ms,s.end_at_ms) AS end_at_ms
    FROM runtime_usage_segments_v2 s JOIN runtime_machines_v2 m ON m.id=s.machine_id
    WHERE m.account_id=?1 AND s.child_id=?2 AND s.runtime_identity IS NOT NULL${filter}
      AND s.diagnostic=0
      AND (s.application_classification IS NULL OR s.application_classification='unclassified')
      AND COALESCE(s.start_wall_time_ms,s.start_at_ms)<?4
      AND COALESCE(s.end_wall_time_ms,s.end_at_ms)>?3
    ORDER BY start_at_ms,end_at_ms,s.id
  `).bind(...values).all<Record<string, unknown>>();
  const legacyValues: unknown[] = [accountId, childId, windowStartMs, windowEndMs];
  let legacyFilter = '';
  if (platform) { legacyValues.push(platform); legacyFilter = ` AND s.platform=?${legacyValues.length}`; }
  const legacyRows = await database.prepare(`
    SELECT s.platform,s.runtime_identity,s.display_name,s.device_id AS machine_id,
      'legacy-v1' AS local_user_id,s.runtime_session_id,'legacy-v1' AS clock_epoch_id,
      s.start_at_ms,s.end_at_ms
    FROM runtime_usage_segments s JOIN runtime_devices d ON d.id=s.device_id
    WHERE d.account_id=?1 AND d.child_id=?2 AND s.start_at_ms<?4 AND s.end_at_ms>?3${legacyFilter}
    ORDER BY s.start_at_ms,s.end_at_ms,s.id
  `).bind(...legacyValues).all<Record<string, unknown>>();
  const policy = await getAppPolicy(database, accountId, childId);
  const current = new Map(policy.classifications.map((item) => [`${item.platform}\n${item.runtimeIdentity}`, item]));
  const grouped = new Map<string, {
    platform: RuntimePlatform; runtimeIdentity: string; displayName: string | null;
    firstSeenAtMs: number; lastSeenAtMs: number; machines: Set<string>; users: Set<string>;
    intervals: Map<string, Array<[number, number]>>;
  }>();
  for (const row of [...(rows.results || []), ...(legacyRows.results || [])]) {
    const key = `${row.platform}\n${row.runtime_identity}`;
    const clampedStartAtMs = Math.max(windowStartMs, Number(row.start_at_ms));
    const clampedEndAtMs = Math.min(windowEndMs, Number(row.end_at_ms));
    const record = grouped.get(key) || {
      platform: row.platform as RuntimePlatform,
      runtimeIdentity: String(row.runtime_identity),
      displayName: row.display_name == null ? null : String(row.display_name),
      firstSeenAtMs: clampedStartAtMs, lastSeenAtMs: clampedEndAtMs,
      machines: new Set<string>(), users: new Set<string>(), intervals: new Map<string, Array<[number, number]>>(),
    };
    const startAtMs = clampedStartAtMs;
    const endAtMs = clampedEndAtMs;
    if (endAtMs <= startAtMs) continue;
    record.firstSeenAtMs = Math.min(record.firstSeenAtMs, startAtMs);
    record.lastSeenAtMs = Math.max(record.lastSeenAtMs, endAtMs);
    if (row.display_name != null) record.displayName = String(row.display_name);
    record.machines.add(String(row.machine_id)); record.users.add(String(row.local_user_id));
    const lane = `${row.machine_id}\n${row.local_user_id}\n${row.runtime_session_id}\n${row.clock_epoch_id}`;
    const intervals = record.intervals.get(lane) || [];
    intervals.push([startAtMs, endAtMs]); record.intervals.set(lane, intervals);
    grouped.set(key, record);
  }
  const records = [...grouped.entries()].map(([key, row]) => {
    const entry = current.get(key);
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
    };
  }).sort((a, b) => b.lastSeenAtMs - a.lastSeenAtMs);
  return {
    windowStartMs,
    windowEndMs,
    pending: records.filter((record) => record.status === 'pending'),
    processed: records.filter((record) => record.status === 'processed'),
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
