import type { AppPolicyDocument, ApplicationClassification } from './contracts';
import type { RuntimeWeekReclassification } from '@timeonchrome/app-runtime-contracts';
import { HttpError } from './http';

const day = 86_400_000;
export function buildWeekReclassification(policy: Pick<AppPolicyDocument, 'classifications' | 'resolvedApplications'>,
  nowMs: number, previous?: Pick<AppPolicyDocument, 'classifications' | 'resolvedApplications'>): RuntimeWeekReclassification {
  const shifted = new Date(nowMs + 8 * 3_600_000);
  const start = Math.floor((nowMs + 8 * 3_600_000) / day) * day - 8 * 3_600_000
    - ((shifted.getUTCDay() + 6) % 7) * day;
  const byKey = new Map<string, RuntimeWeekReclassification['applications'][number]>();
  // Removed overrides without a surviving approved projection return to unclassified.
  for (const item of [...(previous?.resolvedApplications ?? []), ...(previous?.classifications ?? [])])
    byKey.set(`${item.platform}\n${item.runtimeIdentity}`, { platform: item.platform,
      runtimeIdentity: item.runtimeIdentity, classification: 'unclassified' });
  for (const item of [...(policy.resolvedApplications ?? []), ...policy.classifications])
    byKey.set(`${item.platform}\n${item.runtimeIdentity}`, { platform: item.platform,
      runtimeIdentity: item.runtimeIdentity, classification: item.classification });
  return { fromMs: start, toMs: start + 7 * day, applications: [...byKey.values()]
    .sort((a, b) => `${a.platform}\n${a.runtimeIdentity}`.localeCompare(`${b.platform}\n${b.runtimeIdentity}`)) };
}

export type UsageClassificationCorrection = RuntimeWeekReclassification & { version: number };

/** 只重解释当前北京时间周的分类；原时长/原字段不变，旧周沿用已批准更正。 */
export function applyCurrentWeekClassification(rows: Record<string, unknown>[],
  policy: Pick<AppPolicyDocument, 'classifications' | 'resolvedApplications'>, nowMs: number): Record<string, unknown>[] {
  const current = buildWeekReclassification(policy, nowMs);
  const categories = new Map(current.applications.map(app => [`${app.platform}\n${app.runtimeIdentity}`, app.classification]));
  return rows.flatMap(row => {
    const start = Number(row.start_wall_time_ms), end = Number(row.end_wall_time_ms);
    const points = [...new Set([start, end, ...[current.fromMs, current.toMs].filter(p => p > start && p < end)])]
      .sort((a, b) => a - b);
    return points.slice(0, -1).map((left, i) => ({ ...row, start_wall_time_ms: left, end_wall_time_ms: points[i + 1]!,
      classification: left >= current.fromMs && left < current.toMs
        ? categories.get(`${row.platform}\n${row.runtime_identity}`) ?? 'unclassified'
        : row.classification ?? 'historicalUnknown' }));
  });
}
export async function loadUsageCorrections(db: D1Database, accountId: string, childId: string,
  fromMs: number, toMs: number): Promise<UsageClassificationCorrection[]> {
  // Walk the indexed immutable version history instead of expanding every version
  // into a window-function sorter in SQLite. Keep only the latest week/identity.
  // Bound at the initial maximum so concurrent policy saves cannot mix this read.
  const maximum = await db.prepare(`SELECT MAX(version) AS version
    FROM runtime_child_app_policy_versions_v1 WHERE account_id=?1 AND child_id=?2`)
    .bind(accountId, childId).first<{ version: number | null }>();
  let beforeVersion = Number(maximum?.version ?? 0) + 1;
  const seen = new Set<string>();
  const grouped = new Map<string, UsageClassificationCorrection>();
  for (;;) {
    const page = await db.prepare(`SELECT version,
      json_extract(payload_json,'$.weekReclassification') AS correction_json
      FROM runtime_child_app_policy_versions_v1
      WHERE account_id=?1 AND child_id=?2 AND version<?3
        AND json_extract(payload_json,'$.weekReclassification.fromMs')<?5
        AND json_extract(payload_json,'$.weekReclassification.toMs')>?4
      ORDER BY version DESC LIMIT 8`)
      .bind(accountId, childId, beforeVersion, fromMs, toMs)
      .all<{ version: number; correction_json: string }>();
    const rows = page.results ?? [];
    for (const row of rows) {
      const value = JSON.parse(row.correction_json) as RuntimeWeekReclassification;
      const correction: UsageClassificationCorrection = { ...value, version: Number(row.version), applications: [] };
      for (const app of value.applications) {
        const identity = `${value.fromMs}\n${app.platform}\n${app.runtimeIdentity}`;
        if (seen.has(identity)) continue;
        seen.add(identity);
        correction.applications.push(app);
      }
      if (correction.applications.length) grouped.set(`${value.fromMs}\n${row.version}`, correction);
    }
    if (rows.length < 8) break;
    beforeVersion = Number(rows[rows.length - 1]!.version);
  }
  return [...grouped.values()];
}

export function correctUsageRows(rows: Record<string, unknown>[], corrections: UsageClassificationCorrection[],
  fromMs: number, toMs: number, classificationField = 'classification'): Record<string, unknown>[] {
  const latest = new Map<string, { fromMs: number; toMs: number; version: number; classification: ApplicationClassification; identity: string }>();
  for (const correction of corrections) for (const app of correction.applications) {
    const key = `${app.platform}\n${app.runtimeIdentity}`;
    const weekKey = `${correction.fromMs}\n${key}`;
    if ((latest.get(weekKey)?.version ?? -1) < correction.version)
      latest.set(weekKey, { fromMs: correction.fromMs, toMs: correction.toMs, version: correction.version,
        classification: app.classification, identity: key });
  }
  const byIdentity = new Map<string, Array<typeof latest extends Map<string, infer V> ? V : never>>();
  for (const rule of latest.values()) {
    const entries = byIdentity.get(rule.identity) ?? []; entries.push(rule); byIdentity.set(rule.identity, entries);
  }
  return rows.flatMap((row, sourceIndex) => {
    const start = Math.max(fromMs, Number(row.start_wall_time_ms));
    const end = Math.min(toMs, Number(row.end_wall_time_ms));
    if (end <= start) return [];
    const rules = (byIdentity.get(`${row.platform}\n${row.runtime_identity}`) ?? [])
      .filter(rule => rule.fromMs < end && rule.toMs > start);
    const points = [...new Set([start, end, ...rules.flatMap(rule =>
      [Math.max(start, rule.fromMs), Math.min(end, rule.toMs)])])].sort((a, b) => a - b);
    return points.slice(0, -1).map((left, index) => {
      const right = points[index + 1]!;
      const active = rules.filter(rule => rule.fromMs <= left && rule.toMs >= right)
        .sort((a, b) => b.version - a.version)[0];
      return { ...row, start_wall_time_ms: left, end_wall_time_ms: right, correctionSourceIndex: sourceIndex,
        originalClassification: row[classificationField] ?? null,
        [classificationField]: active?.classification ?? row[classificationField],
        classificationCorrectionVersion: active?.version ?? null };
    });
  });
}

export async function machineUsageCorrections(db: D1Database, machine: { accountId: string; machineId: string }, after: string | null) {
  let cursor: Record<string, number> = {};
  try {
    if (after) {
      if (after.length > 16_384) throw new Error();
      const parsed: unknown = JSON.parse(atob(after));
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed) || Object.keys(parsed).length > 128
        || Object.values(parsed).some(v => !Number.isSafeInteger(v) || Number(v) < 0)) throw new Error();
      cursor = parsed as Record<string, number>;
    }
  } catch { throw new HttpError(400, 'INVALID_CORRECTION_CURSOR', 'Correction cursor is invalid.'); }
  const assignments = await db.prepare(`SELECT local_user_id,assignment_version,child_id
    FROM runtime_user_assignments_v2 WHERE machine_id=?1 AND protected=1 AND child_id IS NOT NULL`)
    .bind(machine.machineId).all<{ local_user_id: string; assignment_version: number; child_id: string }>();
  const children = [...new Set((assignments.results ?? []).map(row => row.child_id))];
  // Never echo a caller-supplied foreign Child cursor or query its policy.
  cursor = Object.fromEntries(children.map(child => [child, cursor[child] ?? 0]));
  if (!children.length) return { cursor: btoa(JSON.stringify(cursor)), hasMore: false, items: [] };
  const rows = await db.prepare(`SELECT p.child_id,p.version,p.payload_json
    FROM runtime_child_app_policy_versions_v1 p LEFT JOIN json_each(?3) c ON c.key=p.child_id
    WHERE p.account_id=?1 AND p.version>COALESCE(c.value,0)
      AND json_type(p.payload_json,'$.weekReclassification')='object'
      AND EXISTS(SELECT 1 FROM runtime_user_assignments_v2 a WHERE a.machine_id=?2
        AND a.child_id=p.child_id AND a.protected=1)
    ORDER BY p.version,p.child_id LIMIT 2`)
    .bind(machine.accountId, machine.machineId, JSON.stringify(cursor))
    .all<{ child_id: string; version: number; payload_json: string }>();
  const row = rows.results?.[0];
  const items = [];
  if (row) {
    cursor[row.child_id] = Number(row.version);
    const correction: RuntimeWeekReclassification | undefined = JSON.parse(row.payload_json).weekReclassification;
    if (correction) items.push({ childId: row.child_id, policyVersion: Number(row.version), ...correction,
      assignments: (assignments.results ?? []).filter(a => a.child_id === row.child_id)
        .map(a => ({ localUserId: a.local_user_id, assignmentVersion: Number(a.assignment_version) })) });
  }
  return { cursor: btoa(JSON.stringify(cursor)), hasMore: (rows.results?.length ?? 0) > 1, items };
}
