import { childTimeZone, minuteOfDay, scheduleActive } from './blockSchedules';
import type { Env, NativeAuth } from './types';

export type ApplicationWindow = { id: string; start_minute: number; end_minute: number; effective_active?: number };
export type ApplicationPolicy = {
  application_id: string; all_day: number; updated_at: number; windows: ApplicationWindow[];
};
type IdentityRow = {
  identity_type: 'SIGNINGID' | 'CDHASH' | 'BINARY'; identifier: string;
  team_id: string | null; application_id: string | null;
  source_type: 'APPLICATION' | 'PREDEFINED'; source_key: string;
};
export type EffectiveIdentity = IdentityRow & {
  start_minute: number | null; end_minute: number | null; origin_source_key?: string;
};

export async function listApplicationPolicies(env: Env, childId: string): Promise<ApplicationPolicy[]> {
  const [policies, windows, zone] = await Promise.all([
    env.DB.prepare(`SELECT application_id, all_day, updated_at FROM native_app_application_policies_v1
      WHERE child_id = ?`).bind(childId).all<{ application_id: string; all_day: number; updated_at: number }>(),
    env.DB.prepare(`SELECT id, application_id, start_minute, end_minute
      FROM native_app_application_windows_v1 WHERE child_id = ?
      ORDER BY start_minute, end_minute, id`).bind(childId).all<ApplicationWindow & { application_id: string }>(),
    childTimeZone(env, childId),
  ]);
  return (policies.results || []).map((policy) => ({ ...policy,
    windows: (windows.results || []).filter((window) => window.application_id === policy.application_id)
      .map(({ id, start_minute, end_minute }) => ({ id, start_minute, end_minute,
        effective_active: Number(scheduleActive(start_minute, end_minute, zone, Date.now())) })),
  }));
}

function normalizeWindows(input: unknown): ApplicationWindow[] {
  if (!Array.isArray(input) || input.length < 1 || input.length > 24) throw new Error('invalid_application_windows');
  const windows = input.map((item) => {
    if (!item || typeof item !== 'object') throw new Error('invalid_application_windows');
    const row = item as { id?: unknown; start?: unknown; end?: unknown };
    const start = minuteOfDay(String(row.start || ''));
    const end = minuteOfDay(String(row.end || ''));
    if (start === null || end === null || start === end) throw new Error('invalid_schedule_time');
    return { id: typeof row.id === 'string' && /^[a-zA-Z0-9-]{1,64}$/.test(row.id)
      ? row.id : crypto.randomUUID(), start_minute: start, end_minute: end };
  });
  if (new Set(windows.map((window) => window.id)).size !== windows.length) throw new Error('duplicate_window_id');
  return windows.sort((a, b) => a.start_minute - b.start_minute || a.end_minute - b.end_minute);
}

export async function saveApplicationPolicies(env: Env, auth: NativeAuth, input: {
  applicationIds: string[]; allDay: boolean;
  windows?: Array<{ id?: string; start: string; end: string }>;
}) {
  if (!Array.isArray(input.applicationIds) || !input.applicationIds.length
    || input.applicationIds.length > 100 || typeof input.allDay !== 'boolean') {
    throw new Error('invalid_application_policy');
  }
  const applicationIds = [...new Set(input.applicationIds)];
  if (applicationIds.some((id) => typeof id !== 'string' || !id || id.length > 128)) {
    throw new Error('invalid_application_policy');
  }
  const windows = input.allDay ? [] : normalizeWindows(input.windows);
  const placeholders = applicationIds.map(() => '?').join(',');
  const owned = await env.DB.prepare(`SELECT s.application_id FROM child_application_states_v1 s
    JOIN account_applications_v1 a ON a.id = s.application_id
    WHERE s.child_id = ? AND a.account_id = ? AND a.merged_into_application_id IS NULL
      AND s.application_id IN (${placeholders})`).bind(auth.child_id, auth.account_id, ...applicationIds)
    .all<{ application_id: string }>();
  if ((owned.results || []).length !== applicationIds.length) throw new Error('application_not_found');
  const before = await listApplicationPolicies(env, auth.child_id);
  const existing = new Map(before.map((policy) => [policy.application_id, policy]));
  const changed = applicationIds.some((id) => {
    const old = existing.get(id);
    return !old || Boolean(old.all_day) !== input.allDay
      || JSON.stringify(old.windows.map(({ start_minute, end_minute }) => [start_minute, end_minute]))
        !== JSON.stringify(windows.map(({ start_minute, end_minute }) => [start_minute, end_minute]));
  });
  const direct = await env.DB.prepare(`SELECT application_id FROM child_application_states_v1
    WHERE child_id = ? AND state = 'BLOCK' AND block_origin = 'DIRECT'
      AND application_id IN (${placeholders})`).bind(auth.child_id, ...applicationIds)
    .all<{ application_id: string }>();
  const directIds = new Set((direct.results || []).map((row) => row.application_id));
  if (!changed && applicationIds.every((id) => directIds.has(id))) return listApplicationPolicies(env, auth.child_id);
  const stamp = Date.now();
  const zone = await childTimeZone(env, auth.child_id);
  const active = input.allDay || windows.some((window) =>
    scheduleActive(window.start_minute, window.end_minute, zone, stamp));
  const statements: D1PreparedStatement[] = [];
  for (const applicationId of applicationIds) {
    statements.push(env.DB.prepare(`UPDATE child_application_states_v1 SET state = 'BLOCK', block_origin = 'DIRECT',
      updated_by_account_id = ?, updated_at = ? WHERE child_id = ? AND application_id = ?`)
      .bind(auth.account_id, stamp, auth.child_id, applicationId));
    statements.push(env.DB.prepare(`INSERT INTO native_app_application_policies_v1
      (child_id, application_id, all_day, updated_at) VALUES (?, ?, ?, ?)
      ON CONFLICT(child_id, application_id) DO UPDATE SET all_day = excluded.all_day,
        updated_at = excluded.updated_at`).bind(auth.child_id, applicationId, Number(input.allDay), stamp));
    statements.push(env.DB.prepare(`DELETE FROM native_app_application_windows_v1
      WHERE child_id = ? AND application_id = ?`).bind(auth.child_id, applicationId));
    statements.push(input.allDay
      ? env.DB.prepare(`DELETE FROM native_app_application_effective_v1
        WHERE child_id = ? AND application_id = ?`).bind(auth.child_id, applicationId)
      : env.DB.prepare(`INSERT INTO native_app_application_effective_v1
        (child_id, application_id, effective_active, updated_at) VALUES (?, ?, ?, ?)
        ON CONFLICT(child_id, application_id) DO UPDATE SET effective_active = excluded.effective_active,
          updated_at = excluded.updated_at`).bind(auth.child_id, applicationId, Number(active), stamp));
    for (const window of windows) statements.push(env.DB.prepare(`INSERT INTO native_app_application_windows_v1
      (id, child_id, application_id, start_minute, end_minute, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)`).bind(applicationIds.length === 1 ? window.id : crypto.randomUUID(),
      auth.child_id, applicationId, window.start_minute, window.end_minute, stamp));
  }
  statements.push(env.DB.prepare(`UPDATE native_children_v1 SET policy_version = policy_version + 1,
    updated_at = ? WHERE child_id = ?`).bind(stamp, auth.child_id));
  statements.push(env.DB.prepare(`UPDATE native_macs_v1 SET desired_policy_version = desired_policy_version + 1,
    updated_at = ? WHERE child_id = ? AND status = 'active'`).bind(stamp, auth.child_id));
  statements.push(env.DB.prepare(`INSERT INTO native_app_audit_events_v1
    (id, child_id, account_id, event_type, result, metadata_json, created_at)
    VALUES (?, ?, ?, 'application.block_policy_changed', 'success', ?, ?)`)
    .bind(crypto.randomUUID(), auth.child_id, auth.account_id,
      JSON.stringify({ applicationIds, allDay: input.allDay,
        windows: windows.map(({ start_minute, end_minute }) => ({ start_minute, end_minute })) }), stamp));
  await env.DB.batch(statements);
  return listApplicationPolicies(env, auth.child_id);
}

export async function loadEffectiveIdentityWindows(env: Env, childId: string): Promise<EffectiveIdentity[]> {
  const [direct, predefined, policies, schedules] = await Promise.all([
    env.DB.prepare(`SELECT i.identity_type, i.identifier, COALESCE(i.team_id, a.team_id) AS team_id,
      s.application_id, a.team_id AS application_team_id, a.top_level_bundle_id
      FROM child_application_states_v1 s
      JOIN account_applications_v1 a ON a.id = s.application_id
      JOIN application_memberships_v1 m ON m.application_id = a.id
      JOIN application_identities_v1 i ON i.id = m.identity_id
      WHERE s.child_id = ? AND s.state = 'BLOCK' AND s.block_origin = 'DIRECT'
        AND a.merged_into_application_id IS NULL`).bind(childId)
      .all<IdentityRow & { application_team_id: string | null; top_level_bundle_id: string | null }>(),
    env.DB.prepare(`SELECT p.identity_type, p.identifier,
      (SELECT ai.team_id FROM application_identities_v1 ai
        WHERE ai.identity_key = p.identity_key LIMIT 1) AS team_id,
      p.source, p.source_index, item.bundle_id,
      COALESCE(parent.bundle_id, item.bundle_id) AS root_bundle_id,
      (SELECT s.application_id FROM child_application_states_v1 s
        JOIN account_applications_v1 a ON a.id = s.application_id
        WHERE s.child_id = p.child_id AND s.state = 'BLOCK' AND s.block_origin = 'DIRECT'
          AND a.merged_into_application_id IS NULL
          AND LOWER(a.top_level_bundle_id) = LOWER(COALESCE(parent.bundle_id, item.bundle_id))
          AND (EXISTS (
            SELECT 1 FROM native_app_predefined_identities_v1 root_identity
            JOIN application_identities_v1 verified ON verified.identity_key = root_identity.identity_key
            JOIN application_memberships_v1 membership ON membership.identity_id = verified.id
            WHERE root_identity.child_id = p.child_id AND root_identity.source = p.source
              AND root_identity.source_index = COALESCE(item.parent_source_index, item.source_index)
              AND root_identity.status IN ('AUTO', 'CONFIRMED')
              AND membership.application_id = a.id
          ) OR EXISTS (
            SELECT 1 FROM native_app_predefined_identities_v1 component_identity
            JOIN application_identities_v1 verified ON verified.identity_key = component_identity.identity_key
            JOIN application_memberships_v1 membership ON membership.identity_id = verified.id
            JOIN account_applications_v1 related ON related.id = membership.application_id
            WHERE component_identity.child_id = p.child_id AND component_identity.source = p.source
              AND component_identity.source_index = p.source_index
              AND component_identity.status IN ('AUTO', 'CONFIRMED')
              AND related.account_id = a.account_id
              AND LOWER(related.top_level_bundle_id) = LOWER(a.top_level_bundle_id)
              AND UPPER(COALESCE(related.team_id, '')) = UPPER(COALESCE(a.team_id, ''))
          ) OR EXISTS (
            SELECT 1 FROM native_app_inventory_entries_v1 entry
            JOIN native_app_inventory_snapshots_v1 snap ON snap.id = entry.snapshot_id
            JOIN native_macs_v1 mac ON mac.id = snap.native_mac_id
              AND mac.inventory_snapshot_id = snap.id
            WHERE mac.child_id = p.child_id AND snap.child_id = p.child_id
              AND entry.application_id = a.id
              AND LOWER(entry.bundle_id) = LOWER(COALESCE(parent.bundle_id, item.bundle_id))
          ) OR EXISTS (
            SELECT 1 FROM application_observations_v1 observation
            JOIN application_identities_v1 observed_identity ON observed_identity.id = observation.identity_id
            JOIN application_memberships_v1 observed_member
              ON observed_member.identity_id = observed_identity.id
            WHERE observation.child_id = p.child_id AND observed_member.application_id = a.id
              AND LOWER(observed_identity.bundle_id) = LOWER(COALESCE(parent.bundle_id, item.bundle_id))
          ))
        ORDER BY s.updated_at DESC LIMIT 1) AS application_id
      FROM native_app_predefined_identities_v1 p
      JOIN native_app_predefined_items_v1 item ON item.child_id = p.child_id
        AND item.source = p.source AND item.source_index = p.source_index
      LEFT JOIN native_app_predefined_items_v1 parent ON parent.child_id = item.child_id
        AND parent.source = item.source AND parent.source_index = item.parent_source_index
      WHERE p.child_id = ? AND item.desired_state = 'BLOCK'
        AND item.disabled_at IS NULL AND p.status IN ('AUTO', 'CONFIRMED')`)
      .bind(childId).all<IdentityRow & { source: string; source_index: number }>(),
    listApplicationPolicies(env, childId),
    env.DB.prepare(`SELECT source_key, start_minute, end_minute FROM native_app_block_schedules_v1
      WHERE child_id = ? AND source_type = 'PREDEFINED'`).bind(childId)
      .all<{ source_key: string; start_minute: number; end_minute: number }>(),
  ]);
  const directRows = direct.results || [];
  const groupKey = (row: { application_id: string | null;
    application_team_id?: string | null; top_level_bundle_id?: string | null }) => row.top_level_bundle_id
    ? `${String(row.application_team_id || '').toUpperCase()}:${row.top_level_bundle_id.toLowerCase()}`
    : row.application_id || '';
  const groupByApp = new Map(directRows.map((row) => [row.application_id!, groupKey(row)]));
  const byApp = new Map(policies.map((policy) => [policy.application_id, policy]));
  const byGroup = new Map<string, ApplicationPolicy>();
  for (const policy of policies) {
    const group = groupByApp.get(policy.application_id) || policy.application_id;
    const current = byGroup.get(group);
    if (!current || policy.updated_at > current.updated_at
      || (policy.updated_at === current.updated_at && policy.application_id > current.application_id)) {
      byGroup.set(group, policy);
    }
  }
  const byPreset = new Map((schedules.results || []).map((row) => [row.source_key, row]));
  const output: EffectiveIdentity[] = [];
  const append = (row: IdentityRow, sourceType: 'APPLICATION' | 'PREDEFINED', sourceKey: string,
    originSourceKey?: string) => {
    const base = { ...row, source_type: sourceType, source_key: sourceKey,
      ...(originSourceKey ? { origin_source_key: originSourceKey } : {}) };
    if (sourceType === 'APPLICATION') {
      const policy = byGroup.get(groupByApp.get(sourceKey) || sourceKey) || byApp.get(sourceKey);
      if (!policy || policy.all_day) output.push({ ...base, start_minute: null, end_minute: null });
      else for (const window of policy.windows) output.push({ ...base,
        start_minute: window.start_minute, end_minute: window.end_minute });
    } else {
      const window = byPreset.get(sourceKey);
      output.push({ ...base, start_minute: window?.start_minute ?? null,
        end_minute: window?.end_minute ?? null });
    }
  };
  for (const row of directRows) append(row, 'APPLICATION', row.application_id!);
  for (const row of predefined.results || []) {
    const key = JSON.stringify([row.source, row.source_index]);
    if (row.application_id) append(row, 'APPLICATION', row.application_id, key);
    else append(row, 'PREDEFINED', key, key);
  }
  return output;
}

export async function reconcileApplicationPolicies(env: Env, childId: string, at = Date.now()): Promise<void> {
  const rows = await loadEffectiveIdentityWindows(env, childId);
  const timed = new Map<string, Array<{ start: number; end: number }>>();
  for (const row of rows) {
    if (row.source_type !== 'APPLICATION' || row.start_minute === null) continue;
    const windows = timed.get(row.source_key) || [];
    windows.push({ start: row.start_minute, end: row.end_minute! });
    timed.set(row.source_key, windows);
  }
  if (!timed.size) return;
  const zone = await childTimeZone(env, childId);
  const active = new Map([...timed].map(([id, windows]) => [id,
    windows.some((window) => scheduleActive(window.start, window.end, zone, at))]));
  const effectiveRows = await env.DB.prepare(`SELECT application_id, effective_active FROM native_app_application_effective_v1
    WHERE child_id = ?`).bind(childId).all<{ application_id: string; effective_active: number }>();
  const old = new Map((effectiveRows.results || []).map((row) => [row.application_id, Boolean(row.effective_active)]));
  const changed = [...active].filter(([id, value]) => old.get(id) !== value);
  if (!changed.length) return;
  const stamp = Date.now();
  const condition = changed.map(() => `(NOT EXISTS (SELECT 1 FROM native_app_application_effective_v1 e
    WHERE e.child_id = ? AND e.application_id = ?) OR EXISTS (
      SELECT 1 FROM native_app_application_effective_v1 e
      WHERE e.child_id = ? AND e.application_id = ? AND e.effective_active != ?))`).join(' OR ');
  const args = changed.flatMap(([id, value]) => [childId, id, childId, id, Number(value)]);
  await env.DB.batch([
    env.DB.prepare(`UPDATE native_children_v1 SET policy_version = policy_version + 1,
      updated_at = ? WHERE child_id = ? AND (${condition})`).bind(stamp, childId, ...args),
    env.DB.prepare(`UPDATE native_macs_v1 SET desired_policy_version = desired_policy_version + 1,
      updated_at = ? WHERE child_id = ? AND status = 'active' AND (${condition})`)
      .bind(stamp, childId, ...args),
    ...changed.map(([id, value]) => env.DB.prepare(`INSERT INTO native_app_application_effective_v1
      (child_id, application_id, effective_active, updated_at) VALUES (?, ?, ?, ?)
      ON CONFLICT(child_id, application_id) DO UPDATE SET effective_active = excluded.effective_active,
        updated_at = excluded.updated_at WHERE effective_active != excluded.effective_active`)
      .bind(childId, id, Number(value), stamp)),
  ]);
}
