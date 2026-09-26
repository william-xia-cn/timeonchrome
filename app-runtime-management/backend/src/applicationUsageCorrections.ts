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
export async function loadUsageCorrections(db: D1Database, accountId: string, childId: string,
  fromMs: number, toMs: number): Promise<UsageClassificationCorrection[]> {
  // Return only the latest exact-key attribution for each week, not every full policy
  // payload ever saved during that week. Result size follows identities, not edit count.
  const rows = await db.prepare(`WITH ranked AS (
    SELECT p.version,json_extract(p.payload_json,'$.weekReclassification.fromMs') AS from_ms,
      json_extract(p.payload_json,'$.weekReclassification.toMs') AS to_ms,
      json_extract(a.value,'$.platform') AS platform,json_extract(a.value,'$.runtimeIdentity') AS identity,
      json_extract(a.value,'$.classification') AS classification,
      ROW_NUMBER() OVER(PARTITION BY json_extract(p.payload_json,'$.weekReclassification.fromMs'),
        json_extract(a.value,'$.platform'),json_extract(a.value,'$.runtimeIdentity') ORDER BY p.version DESC) AS rank
    FROM runtime_child_app_policy_versions_v1 p,json_each(p.payload_json,'$.weekReclassification.applications') a
    WHERE p.account_id=?1 AND p.child_id=?2
      AND json_extract(p.payload_json,'$.weekReclassification.fromMs')<?4
      AND json_extract(p.payload_json,'$.weekReclassification.toMs')>?3)
    SELECT * FROM ranked WHERE rank=1`)
    .bind(accountId, childId, fromMs, toMs).all<{ version: number; from_ms: number; to_ms: number;
      platform: 'windows' | 'macos'; identity: string; classification: ApplicationClassification }>();
  const grouped = new Map<string, UsageClassificationCorrection>();
  for (const row of rows.results ?? []) {
    const key = `${row.from_ms}\n${row.version}`;
    const correction = grouped.get(key) ?? { fromMs: Number(row.from_ms), toMs: Number(row.to_ms), version: Number(row.version), applications: [] };
    correction.applications.push({ platform: row.platform, runtimeIdentity: row.identity, classification: row.classification });
    grouped.set(key, correction);
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
