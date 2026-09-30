import type { Env, NativeAuth } from './types';

export type BlockSource = 'APPLICATION' | 'PREDEFINED' | 'PUBLISHER';
export type BlockSchedule = {
  source_type: BlockSource;
  source_key: string;
  start_minute: number;
  end_minute: number;
  effective_active: number;
};

export function validTimeZone(value: string): boolean {
  try { new Intl.DateTimeFormat('en-US', { timeZone: value }); return true; }
  catch { return false; }
}

export function minuteOfDay(value: string): number | null {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value);
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

export function scheduleActive(start: number, end: number, timeZone: string, at: number): boolean {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(at));
  const hour = Number(parts.find((part) => part.type === 'hour')?.value);
  const minute = Number(parts.find((part) => part.type === 'minute')?.value);
  const current = hour * 60 + minute;
  return start < end ? current >= start && current < end : current >= start || current < end;
}

export async function childTimeZone(env: Env, childId: string): Promise<string> {
  const row = await env.DB.prepare('SELECT time_zone FROM native_children_v1 WHERE child_id = ?')
    .bind(childId).first<{ time_zone: string }>();
  return row?.time_zone || 'Asia/Shanghai';
}

export async function listBlockSchedules(env: Env, childId: string) {
  const [timeZone, schedules, macs] = await Promise.all([
    childTimeZone(env, childId),
    env.DB.prepare('SELECT source_type, source_key, start_minute, end_minute, effective_active FROM native_app_block_schedules_v1 WHERE child_id = ?')
      .bind(childId).all<BlockSchedule>(),
    env.DB.prepare(`SELECT id, display_name, santa_version, native_time_rules_enabled,
      desired_policy_version, applied_policy_version, last_postflight_at
      FROM native_macs_v1 WHERE child_id = ? AND status = 'active' ORDER BY display_name`)
      .bind(childId).all(),
  ]);
  return { timeZone, schedules: schedules.results || [], macs: macs.results || [] };
}

async function sourceExists(env: Env, childId: string, sourceType: BlockSource, key: string): Promise<boolean> {
  if (sourceType === 'APPLICATION') {
    return !!await env.DB.prepare(`SELECT 1 FROM child_application_states_v1 s
      JOIN account_applications_v1 a ON a.id = s.application_id
      JOIN native_children_v1 c ON c.child_id = s.child_id AND c.account_id = a.account_id
      WHERE s.child_id = ? AND s.application_id = ? AND s.state = 'BLOCK' AND s.block_origin = 'DIRECT'
        AND a.merged_into_application_id IS NULL`).bind(childId, key).first();
  }
  if (sourceType === 'PUBLISHER') {
    return !!await env.DB.prepare('SELECT 1 FROM child_publisher_blocks_v1 WHERE child_id = ? AND team_id = ?')
      .bind(childId, key).first();
  }
  let decoded: unknown;
  try { decoded = JSON.parse(key); } catch { return false; }
  if (!Array.isArray(decoded) || decoded.length !== 2 || typeof decoded[0] !== 'string'
    || !Number.isInteger(decoded[1])) return false;
  return !!await env.DB.prepare(`SELECT 1 FROM native_app_predefined_items_v1
    WHERE child_id = ? AND source = ? AND source_index = ? AND desired_state = 'BLOCK' AND disabled_at IS NULL`)
    .bind(childId, decoded[0], decoded[1]).first();
}

export async function saveBlockSchedule(env: Env, auth: NativeAuth, input: {
  sourceType: BlockSource; sourceKey: string; allDay: boolean; start?: string; end?: string;
}) {
  const { sourceType, sourceKey, allDay } = input;
  if (!['APPLICATION', 'PREDEFINED', 'PUBLISHER'].includes(sourceType)
    || !sourceKey || sourceKey.length > 300 || typeof allDay !== 'boolean') throw new Error('invalid_schedule_source');
  if (!await sourceExists(env, auth.child_id, sourceType, sourceKey)) throw new Error('block_source_not_found');
  const start = allDay ? null : minuteOfDay(input.start || '');
  const end = allDay ? null : minuteOfDay(input.end || '');
  if (!allDay && (start === null || end === null || start === end)) throw new Error('invalid_schedule_time');
  const old = await env.DB.prepare(`SELECT start_minute, end_minute, effective_active
    FROM native_app_block_schedules_v1 WHERE child_id = ? AND source_type = ? AND source_key = ?`)
    .bind(auth.child_id, sourceType, sourceKey).first<BlockSchedule>();
  if (allDay && !old) return listBlockSchedules(env, auth.child_id);
  const zone = await childTimeZone(env, auth.child_id);
  const active = allDay || scheduleActive(start!, end!, zone, Date.now());
  const wasActive = old ? !!old.effective_active : true;
  const stamp = Date.now();
  const statements: D1PreparedStatement[] = [allDay
    ? env.DB.prepare('DELETE FROM native_app_block_schedules_v1 WHERE child_id = ? AND source_type = ? AND source_key = ?')
      .bind(auth.child_id, sourceType, sourceKey)
    : env.DB.prepare(`INSERT INTO native_app_block_schedules_v1
      (child_id, source_type, source_key, start_minute, end_minute, effective_active, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(child_id, source_type, source_key) DO UPDATE SET
        start_minute = excluded.start_minute, end_minute = excluded.end_minute,
        effective_active = excluded.effective_active, updated_at = excluded.updated_at`)
      .bind(auth.child_id, sourceType, sourceKey, start, end, Number(active), stamp)];
  if (wasActive !== active || (!old && !allDay)
    || (old && (old.start_minute !== start || old.end_minute !== end))) {
    statements.push(...versionStatements(env, auth.child_id, stamp));
  }
  statements.push(env.DB.prepare(`INSERT INTO native_app_audit_events_v1
    (id, child_id, account_id, event_type, result, metadata_json, created_at)
    VALUES (?, ?, ?, 'block_schedule.changed', 'success', ?, ?)`)
    .bind(crypto.randomUUID(), auth.child_id, auth.account_id,
      JSON.stringify({ sourceType, sourceKey, allDay, start: input.start, end: input.end }), stamp));
  await env.DB.batch(statements);
  return listBlockSchedules(env, auth.child_id);
}

export async function saveBlockSchedulesBulk(env: Env, auth: NativeAuth, input: {
  sources: Array<{ sourceType: BlockSource; sourceKey: string }>;
  allDay: boolean; start?: string; end?: string;
}) {
  if (!Array.isArray(input.sources) || !input.sources.length || input.sources.length > 100
    || typeof input.allDay !== 'boolean') throw new Error('invalid_schedule_sources');
  const unique = new Map<string, { sourceType: BlockSource; sourceKey: string }>();
  for (const source of input.sources) {
    if (!source || !['APPLICATION', 'PREDEFINED'].includes(source.sourceType)
      || typeof source.sourceKey !== 'string' || !source.sourceKey || source.sourceKey.length > 300) {
      throw new Error('invalid_schedule_source');
    }
    unique.set(`${source.sourceType}:${source.sourceKey}`, source);
  }
  const start = input.allDay ? null : minuteOfDay(input.start || '');
  const end = input.allDay ? null : minuteOfDay(input.end || '');
  if (!input.allDay && (start === null || end === null || start === end)) throw new Error('invalid_schedule_time');
  for (const source of unique.values()) {
    if (!await sourceExists(env, auth.child_id, source.sourceType, source.sourceKey)) {
      throw new Error('block_source_not_found');
    }
  }
  const zone = await childTimeZone(env, auth.child_id);
  const active = input.allDay || scheduleActive(start!, end!, zone, Date.now());
  const stamp = Date.now();
  const statements: D1PreparedStatement[] = [];
  for (const source of unique.values()) {
    const old = await env.DB.prepare(`SELECT start_minute, end_minute, effective_active
      FROM native_app_block_schedules_v1 WHERE child_id = ? AND source_type = ? AND source_key = ?`)
      .bind(auth.child_id, source.sourceType, source.sourceKey).first<BlockSchedule>();
    if (input.allDay && !old) continue;
    if (!input.allDay && old?.start_minute === start && old?.end_minute === end) continue;
    statements.push(input.allDay
      ? env.DB.prepare(`DELETE FROM native_app_block_schedules_v1
        WHERE child_id = ? AND source_type = ? AND source_key = ?`)
        .bind(auth.child_id, source.sourceType, source.sourceKey)
      : env.DB.prepare(`INSERT INTO native_app_block_schedules_v1
        (child_id, source_type, source_key, start_minute, end_minute, effective_active, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(child_id, source_type, source_key) DO UPDATE SET
          start_minute = excluded.start_minute, end_minute = excluded.end_minute,
          effective_active = excluded.effective_active, updated_at = excluded.updated_at`)
        .bind(auth.child_id, source.sourceType, source.sourceKey, start, end, Number(active), stamp));
  }
  if (!statements.length) return listBlockSchedules(env, auth.child_id);
  statements.push(...versionStatements(env, auth.child_id, stamp));
  statements.push(env.DB.prepare(`INSERT INTO native_app_audit_events_v1
    (id, child_id, account_id, event_type, result, metadata_json, created_at)
    VALUES (?, ?, ?, 'block_schedule.bulk_changed', 'success', ?, ?)`)
    .bind(crypto.randomUUID(), auth.child_id, auth.account_id,
      JSON.stringify({ sources: [...unique.values()], allDay: input.allDay, start: input.start, end: input.end }), stamp));
  await env.DB.batch(statements);
  return listBlockSchedules(env, auth.child_id);
}

function versionStatements(env: Env, childId: string, stamp: number): D1PreparedStatement[] {
  return [
    env.DB.prepare('UPDATE native_children_v1 SET policy_version = policy_version + 1, updated_at = ? WHERE child_id = ?')
      .bind(stamp, childId),
    env.DB.prepare(`UPDATE native_macs_v1 SET desired_policy_version = desired_policy_version + 1,
      updated_at = ? WHERE child_id = ? AND status = 'active'`).bind(stamp, childId),
  ];
}

export async function reconcileChildSchedules(env: Env, childId: string, at = Date.now()): Promise<void> {
  const zone = await childTimeZone(env, childId);
  const rows = await env.DB.prepare(`SELECT source_type, source_key, start_minute, end_minute, effective_active
    FROM native_app_block_schedules_v1 WHERE child_id = ?`).bind(childId).all<BlockSchedule>();
  const changed = (rows.results || []).map((row) => ({
    ...row, desired: Number(scheduleActive(row.start_minute, row.end_minute, zone, at)),
  })).filter((row) => row.desired !== row.effective_active);
  if (!changed.length) return;
  const condition = changed.map(() => '(source_type = ? AND source_key = ? AND effective_active != ?)').join(' OR ');
  const args = changed.flatMap((row) => [row.source_type, row.source_key, row.desired]);
  const stamp = Date.now();
  await env.DB.batch([
    env.DB.prepare(`UPDATE native_children_v1 SET policy_version = policy_version + 1, updated_at = ?
      WHERE child_id = ? AND EXISTS (SELECT 1 FROM native_app_block_schedules_v1
        WHERE child_id = ? AND (${condition}))`).bind(stamp, childId, childId, ...args),
    env.DB.prepare(`UPDATE native_macs_v1 SET desired_policy_version = desired_policy_version + 1,
      updated_at = ? WHERE child_id = ? AND status = 'active' AND EXISTS (
        SELECT 1 FROM native_app_block_schedules_v1 WHERE child_id = ? AND (${condition}))`)
      .bind(stamp, childId, childId, ...args),
    ...changed.map((row) => env.DB.prepare(`UPDATE native_app_block_schedules_v1
      SET effective_active = ?, updated_at = ? WHERE child_id = ? AND source_type = ?
        AND source_key = ? AND effective_active != ?`)
      .bind(row.desired, stamp, childId, row.source_type, row.source_key, row.desired)),
  ]);
}

export async function reconcileAllSchedules(env: Env): Promise<void> {
  const children = await env.DB.prepare('SELECT DISTINCT child_id FROM native_app_block_schedules_v1')
    .all<{ child_id: string }>();
  for (const child of children.results || []) await reconcileChildSchedules(env, child.child_id);
}

export async function changeChildTimeZone(env: Env, auth: NativeAuth, zone: string) {
  if (!zone || zone.length > 100 || !validTimeZone(zone)) throw new Error('invalid_time_zone');
  const current = await childTimeZone(env, auth.child_id);
  if (current === zone) return listBlockSchedules(env, auth.child_id);
  await env.DB.prepare('UPDATE native_children_v1 SET time_zone = ?, updated_at = ? WHERE child_id = ? AND account_id = ?')
    .bind(zone, Date.now(), auth.child_id, auth.account_id).run();
  const version = await env.DB.prepare('SELECT policy_version FROM native_children_v1 WHERE child_id = ?')
    .bind(auth.child_id).first<{ policy_version: number }>();
  await reconcileChildSchedules(env, auth.child_id);
  const after = await env.DB.prepare('SELECT policy_version FROM native_children_v1 WHERE child_id = ?')
    .bind(auth.child_id).first<{ policy_version: number }>();
  if (after?.policy_version === version?.policy_version) await env.DB.batch(versionStatements(env, auth.child_id, Date.now()));
  return listBlockSchedules(env, auth.child_id);
}
