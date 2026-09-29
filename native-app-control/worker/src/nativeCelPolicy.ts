import { childTimeZone } from './blockSchedules';
import { canonicalStoredSigningIdentifier } from './policy';
import type { Env, NativeAuth, SantaRule } from './types';

type TimedIdentity = {
  identity_type: 'SIGNINGID' | 'CDHASH' | 'BINARY';
  identifier: string;
  team_id: string | null;
  start_minute: number | null;
  end_minute: number | null;
};
type TimedPublisher = {
  team_id: string; start_minute: number | null; end_minute: number | null;
};
type Window = { start: number; end: number } | null;

export function supportsNativeTimeRules(version: string | null | undefined): boolean {
  const match = /^(\d{4})\.(\d+)(?:\D|$)/.exec(String(version || ''));
  return !!match && (Number(match[1]) > 2026 ||
    (Number(match[1]) === 2026 && Number(match[2]) >= 8));
}

export async function setNativeTimeRulesEnabled(
  env: Env, auth: NativeAuth, nativeMacId: string, enabled: boolean
): Promise<boolean> {
  const mac = await env.DB.prepare(`SELECT santa_version, native_time_rules_enabled
    FROM native_macs_v1 WHERE id = ? AND child_id = ? AND status = 'active'`)
    .bind(nativeMacId, auth.child_id)
    .first<{ santa_version: string | null; native_time_rules_enabled: number }>();
  if (!mac) throw new Error('native_mac_not_found');
  if (enabled && !supportsNativeTimeRules(mac.santa_version)) throw new Error('santa_2026_8_required');
  if (Boolean(mac.native_time_rules_enabled) === enabled) return enabled;
  const stamp = Date.now();
  await env.DB.batch([
    env.DB.prepare(`UPDATE native_macs_v1 SET native_time_rules_enabled = ?,
      desired_policy_version = desired_policy_version + 1, updated_at = ?
      WHERE id = ? AND child_id = ? AND status = 'active'`)
      .bind(Number(enabled), stamp, nativeMacId, auth.child_id),
    env.DB.prepare(`INSERT INTO native_app_audit_events_v1
      (id, child_id, account_id, native_mac_id, event_type, result, metadata_json, created_at)
      VALUES (?, ?, ?, ?, 'native_time_rules.changed', 'success', ?, ?)`)
      .bind(crypto.randomUUID(), auth.child_id, auth.account_id, nativeMacId,
        JSON.stringify({ enabled }), stamp),
  ]);
  return enabled;
}

export async function loadNativeTimedPolicy(env: Env, childId: string) {
  const [direct, predefined, publishers, timeZone] = await Promise.all([
    env.DB.prepare(`SELECT i.identity_type, i.identifier, COALESCE(i.team_id, a.team_id) AS team_id,
        bs.start_minute, bs.end_minute
      FROM child_application_states_v1 s
      JOIN account_applications_v1 a ON a.id = s.application_id
      JOIN application_memberships_v1 m ON m.application_id = a.id
      JOIN application_identities_v1 i ON i.id = m.identity_id
      LEFT JOIN native_app_block_schedules_v1 bs ON bs.child_id = s.child_id
        AND bs.source_type = 'APPLICATION' AND bs.source_key = s.application_id
      WHERE s.child_id = ? AND s.state = 'BLOCK' AND s.block_origin = 'DIRECT'
        AND a.merged_into_application_id IS NULL`).bind(childId).all<TimedIdentity>(),
    env.DB.prepare(`SELECT p.identity_type, p.identifier,
        (SELECT ai.team_id FROM application_identities_v1 ai
          WHERE ai.identity_key = p.identity_key LIMIT 1) AS team_id,
        bs.start_minute, bs.end_minute
      FROM native_app_predefined_identities_v1 p
      JOIN native_app_predefined_items_v1 item ON item.child_id = p.child_id
        AND item.source = p.source AND item.source_index = p.source_index
      LEFT JOIN native_app_block_schedules_v1 bs ON bs.child_id = p.child_id
        AND bs.source_type = 'PREDEFINED'
        AND bs.source_key = json_array(p.source, p.source_index)
      WHERE p.child_id = ? AND item.desired_state = 'BLOCK'
        AND item.disabled_at IS NULL AND p.status IN ('AUTO', 'CONFIRMED')`)
      .bind(childId).all<TimedIdentity>(),
    env.DB.prepare(`SELECT p.team_id, bs.start_minute, bs.end_minute
      FROM child_publisher_blocks_v1 p
      LEFT JOIN native_app_block_schedules_v1 bs ON bs.child_id = p.child_id
        AND bs.source_type = 'PUBLISHER' AND bs.source_key = p.team_id
      WHERE p.child_id = ?`).bind(childId).all<TimedPublisher>(),
    childTimeZone(env, childId),
  ]);
  return {
    identities: [...(direct.results || []), ...(predefined.results || [])],
    publishers: publishers.results || [],
    timeZone,
  };
}

function timeString(minute: number): string {
  return `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;
}

function expression(windows: Window[], timeZone: string): string | null {
  if (windows.includes(null)) return null;
  const unique = [...new Map(windows.map((window) => [`${window!.start}:${window!.end}`, window!])).values()];
  const zone = JSON.stringify(timeZone);
  const last = unique.pop()!;
  const range = (window: { start: number; end: number }) =>
    `policy_for_range([0,1,2,3,4,5,6], "${timeString(window.start)}", "${timeString(window.end)}", ${zone}, BLOCKLIST, AUDIT)`;
  if (!unique.length) return range(last);
  const minute = `(now().getHours(${zone}) * 60 + now().getMinutes(${zone}))`;
  const conditions = unique.map(({ start, end }) => start < end
    ? `(${minute} >= ${start} && ${minute} < ${end})`
    : `(${minute} >= ${start} || ${minute} < ${end})`);
  return `(${conditions.join(' || ')}) ? BLOCKLIST : ${range(last)}`;
}

export function compileNativeTimedRules(
  identities: TimedIdentity[], publishers: TimedPublisher[], timeZone: string, baseline: SantaRule
): SantaRule[] {
  const byIdentity = new Map<string, { ruleType: SantaRule['rule_type']; identifier: string;
    teamId: string | null; windows: Window[] }>();
  const publisherWindows = new Map<string, Window[]>();
  for (const row of publishers) {
    const key = row.team_id.toUpperCase();
    if (!publisherWindows.has(key)) publisherWindows.set(key, []);
    publisherWindows.get(key)!.push(row.start_minute === null ? null
      : { start: row.start_minute, end: row.end_minute! });
  }
  for (const row of identities) {
    const identifier = row.identity_type === 'SIGNINGID'
      ? canonicalStoredSigningIdentifier(row.identifier) : row.identifier;
    const key = `${row.identity_type}:${identifier}`;
    const teamId = (row.team_id || (row.identity_type === 'SIGNINGID'
      ? identifier.split(':')[0] : '') || '').toUpperCase() || null;
    if (!byIdentity.has(key)) byIdentity.set(key, {
      ruleType: row.identity_type, identifier, teamId, windows: [],
    });
    byIdentity.get(key)!.windows.push(row.start_minute === null ? null
      : { start: row.start_minute, end: row.end_minute! });
  }
  const rules: SantaRule[] = [baseline];
  for (const identity of byIdentity.values()) {
    const directWindows = identity.windows;
    const windows = [...directWindows,
      ...(identity.teamId ? publisherWindows.get(identity.teamId) || [] : [])];
    let cel = expression(windows, timeZone);
    if (!identity.teamId && cel && publisherWindows.size) {
      for (const [teamId, publisherTime] of publisherWindows) {
        const combined = expression([...directWindows, ...publisherTime], timeZone);
        if (!combined) {
          cel = `target.team_id == ${JSON.stringify(teamId)} ? BLOCKLIST : (${cel})`;
        } else {
          cel = `target.team_id == ${JSON.stringify(teamId)} ? (${combined}) : (${cel})`;
        }
      }
    }
    rules.push({ identifier: identity.identifier, rule_type: identity.ruleType,
      policy: cel ? 'CEL' : 'BLOCKLIST', ...(cel ? { cel_expr: cel } : {}) });
  }
  for (const [teamId, windows] of publisherWindows) {
    const cel = expression(windows, timeZone);
    rules.push({ identifier: teamId, rule_type: 'TEAMID',
      policy: cel ? 'CEL' : 'BLOCKLIST', ...(cel ? { cel_expr: cel } : {}) });
  }
  return rules;
}
