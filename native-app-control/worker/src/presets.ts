import type { Env, NativeAuth } from './types';

const SOURCE = 'qustodio-2026-09';
const timestamp = () => Date.now();

type SourceItem = {
  sourceIndex: number;
  displayName: string;
  bundleId: string | null;
  parentSourceIndex: number | null;
};

type Candidate = {
  identity_key: string;
  identity_type: 'SIGNINGID' | 'CDHASH' | 'BINARY';
  identifier: string;
  santa_seen: number;
  installed: number;
  existing_block: number;
  existing_ignore: number;
};

function sourceItems(raw: unknown): SourceItem[] {
  if (!Array.isArray(raw) || raw.length !== 21) throw new Error('expected_21_source_items');
  const items = raw.map((value, offset) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('invalid_source_item');
    const item = value as Record<string, unknown>;
    const sourceIndex = Number(item.sourceIndex);
    const displayName = typeof item.displayName === 'string' ? item.displayName.trim() : '';
    const bundleId = typeof item.bundleId === 'string' ? item.bundleId.trim() : '';
    const parentSourceIndex = item.parentSourceIndex == null ? null : Number(item.parentSourceIndex);
    if (sourceIndex !== offset + 1 || !displayName || displayName.length > 120
      || (bundleId && !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,255}$/.test(bundleId))
      || (parentSourceIndex !== null && (!Number.isInteger(parentSourceIndex) || parentSourceIndex > 21
        || parentSourceIndex < 1 || parentSourceIndex === sourceIndex || item.relationshipVerified !== true))) {
      throw new Error('invalid_source_item');
    }
    return { sourceIndex, displayName, bundleId: bundleId || null, parentSourceIndex };
  });
  for (const item of items) {
    if (item.parentSourceIndex !== null && items[item.parentSourceIndex - 1].parentSourceIndex !== null) {
      throw new Error('nested_source_component_not_supported');
    }
  }
  return items;
}

export async function importPredefinedItems(env: Env, auth: NativeAuth, raw: unknown) {
  const items = sourceItems(raw);
  const existing = await env.DB.prepare(`
    SELECT source_index, bundle_id FROM native_app_predefined_items_v1
     WHERE child_id = ? AND source = ?
  `).bind(auth.child_id, SOURCE).all<{ source_index: number; bundle_id: string | null }>();
  const old = new Map((existing.results || []).map((item) => [item.source_index, item.bundle_id]));
  for (const item of items) {
    if (old.has(item.sourceIndex) && (old.get(item.sourceIndex) || '').toLowerCase() !== (item.bundleId || '').toLowerCase()) {
      throw new Error('source_identity_changed');
    }
  }
  const now = timestamp();
  const statements = items.map((item) => env.DB.prepare(`
    INSERT INTO native_app_predefined_items_v1 (
      child_id, source, source_index, display_name, bundle_id, parent_source_index, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(child_id, source, source_index) DO UPDATE SET
      display_name = excluded.display_name,
      parent_source_index = excluded.parent_source_index,
      updated_at = excluded.updated_at
  `).bind(auth.child_id, SOURCE, item.sourceIndex, item.displayName, item.bundleId,
    item.parentSourceIndex, now, now));
  if ((existing.results || []).length === 0) {
    statements.push(env.DB.prepare(`INSERT INTO native_app_audit_events_v1
      (id, child_id, account_id, event_type, result, metadata_json, created_at)
      VALUES (?, ?, ?, 'predefined.imported', 'success', ?, ?)`)
      .bind(crypto.randomUUID(), auth.child_id, auth.account_id,
        JSON.stringify({ source: SOURCE, sourceCount: items.length }), now));
  }
  await env.DB.batch(statements);
  await reconcilePredefinedItems(env, auth.account_id, auth.child_id);
  return { source: SOURCE, sourceCount: items.length };
}

export async function importPreconfigurationSource(
  env: Env, auth: NativeAuth, source: string, raw: unknown
) {
  if (!/^[a-z][a-z0-9-]{2,63}$/.test(source) || source === SOURCE) {
    throw new Error('invalid_preconfiguration_source');
  }
  if (!Array.isArray(raw) || raw.length < 1 || raw.length > 500) {
    throw new Error('invalid_preconfiguration_items');
  }
  const items = raw.map((value, offset) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error('invalid_preconfiguration_item');
    }
    const item = value as Record<string, unknown>;
    const sourceIndex = Number(item.sourceIndex);
    const displayName = typeof item.displayName === 'string' ? item.displayName.trim() : '';
    const bundleId = typeof item.bundleId === 'string' ? item.bundleId.trim() : '';
    const desiredState = item.desiredState;
    if (sourceIndex !== offset + 1 || !displayName || displayName.length > 120
      || !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,255}$/.test(bundleId)
      || (desiredState !== 'BLOCK' && desiredState !== 'CANDIDATE')) {
      throw new Error('invalid_preconfiguration_item');
    }
    return { sourceIndex, displayName, bundleId, desiredState };
  });
  const previous = await env.DB.prepare(`SELECT source_index, bundle_id, desired_state
    FROM native_app_predefined_items_v1 WHERE child_id = ? AND source = ?`)
    .bind(auth.child_id, source).all<{
      source_index: number; bundle_id: string; desired_state: string;
    }>();
  const existing = new Map((previous.results || []).map((item) => [item.source_index, item]));
  for (const item of items) {
    const old = existing.get(item.sourceIndex);
    if (old && (old.bundle_id.toLowerCase() !== item.bundleId.toLowerCase()
      || old.desired_state !== item.desiredState)) {
      throw new Error('source_identity_changed');
    }
  }
  const now = timestamp();
  await env.DB.batch(items.map((item) => env.DB.prepare(`
    INSERT INTO native_app_predefined_items_v1 (
      child_id, source, source_index, display_name, bundle_id,
      desired_state, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(child_id, source, source_index) DO UPDATE SET
      display_name = excluded.display_name, updated_at = excluded.updated_at
  `).bind(auth.child_id, source, item.sourceIndex, item.displayName, item.bundleId,
    item.desiredState, now, now)));
  await reconcilePredefinedItems(env, auth.account_id, auth.child_id,
    items.filter((item) => item.desiredState === 'BLOCK').map((item) => item.bundleId));
  return { source, sourceCount: items.length };
}

export async function listPreconfigurations(env: Env, auth: NativeAuth) {
  const result = await env.DB.prepare(`
    SELECT p.source, p.source_index, p.display_name, p.bundle_id, p.desired_state,
           p.parent_source_index, p.disabled_at,
           (SELECT COALESCE(a.merged_into_application_id, a.id, 'inventory:' || e.inventory_key)
              FROM native_app_inventory_entries_v1 e
              JOIN native_app_inventory_snapshots_v1 snap ON snap.id = e.snapshot_id
              JOIN native_macs_v1 m ON m.id = snap.native_mac_id AND m.inventory_snapshot_id = snap.id
              LEFT JOIN account_applications_v1 a ON a.id = e.application_id
             WHERE m.child_id = p.child_id AND snap.child_id = p.child_id
               AND LOWER(e.bundle_id) = LOWER(p.bundle_id)
             ORDER BY snap.imported_at DESC, m.id ASC LIMIT 1) AS installed_application_id,
           (SELECT COALESCE(a.merged_into_application_id, a.id)
              FROM application_observations_v1 o
              JOIN application_identities_v1 i ON i.id = o.identity_id
              JOIN application_memberships_v1 am ON am.identity_id = i.id
              JOIN account_applications_v1 a ON a.id = am.application_id AND a.account_id = ?
             WHERE o.child_id = p.child_id AND LOWER(i.bundle_id) = LOWER(p.bundle_id)
             ORDER BY o.last_observed_at DESC LIMIT 1) AS observed_application_id
      FROM native_app_predefined_items_v1 p
     WHERE p.child_id = ? ORDER BY p.source, p.source_index
  `).bind(auth.account_id, auth.child_id).all<{
    source: string; source_index: number; display_name: string; bundle_id: string | null;
    desired_state: 'BLOCK' | 'CANDIDATE'; parent_source_index: number | null;
    disabled_at: number | null; installed_application_id: string | null;
    observed_application_id: string | null;
  }>();
  const items = (result.results || []).map((item) => ({
    ...item,
    matchedApplicationId: item.installed_application_id || item.observed_application_id,
    installed: !!item.installed_application_id,
    observed: !!item.observed_application_id,
  }));
  return { items, unmatchedCount: items.filter((item) => !item.matchedApplicationId && !item.disabled_at).length };
}

async function matchingCandidates(env: Env, childId: string, bundleId: string): Promise<Candidate[]> {
  const rows = await env.DB.prepare(`
    SELECT i.identity_key, i.identity_type, i.identifier,
      EXISTS(SELECT 1 FROM application_observations_v1 o
              WHERE o.identity_id = i.id AND o.child_id = ?) AS santa_seen,
      EXISTS(SELECT 1 FROM native_app_inventory_entries_v1 e
               JOIN native_app_inventory_snapshots_v1 snap ON snap.id = e.snapshot_id
               JOIN native_macs_v1 m ON m.id = snap.native_mac_id AND m.inventory_snapshot_id = snap.id
              WHERE e.identity_key = i.identity_key AND m.child_id = ? AND snap.child_id = ?) AS installed,
      EXISTS(SELECT 1 FROM application_memberships_v1 am
               JOIN child_application_states_v1 s ON s.application_id = am.application_id
              WHERE am.identity_id = i.id AND s.child_id = ? AND s.state = 'BLOCK') AS existing_block
      ,EXISTS(SELECT 1 FROM application_memberships_v1 am
               JOIN child_application_states_v1 s ON s.application_id = am.application_id
              WHERE am.identity_id = i.id AND s.child_id = ? AND s.state = 'IGNORE') AS existing_ignore
    FROM application_identities_v1 i
    WHERE LOWER(i.bundle_id) = LOWER(?)
  `).bind(childId, childId, childId, childId, childId, bundleId).all<Candidate>();
  return (rows.results || []).filter((row) => row.santa_seen || row.installed || row.existing_block || row.existing_ignore);
}

function trustedSigning(candidate: Candidate): boolean {
  return candidate.identity_type === 'SIGNINGID'
    && (/^platform:[^:]+/i.test(candidate.identifier) || /^[A-Z0-9]{10}:.+/.test(candidate.identifier));
}

export async function reconcilePredefinedItems(
  env: Env, accountId: string, childId: string, changedBundleIds?: string[]
): Promise<void> {
  const child = await env.DB.prepare(`SELECT child_id FROM native_children_v1
    WHERE child_id = ? AND account_id = ?`).bind(childId, accountId).first<{ child_id: string }>();
  if (!child) return;
  const items = await env.DB.prepare(`SELECT source, source_index, bundle_id FROM native_app_predefined_items_v1
    WHERE child_id = ? AND desired_state = 'BLOCK' AND disabled_at IS NULL AND bundle_id IS NOT NULL`)
    .bind(childId).all<{ source: string; source_index: number; bundle_id: string }>();
  const changed = changedBundleIds && new Set(changedBundleIds.map((bundleId) => bundleId.toLowerCase()));
  const relevant = (items.results || []).filter((item) => !changed || changed.has(item.bundle_id.toLowerCase()));
  if (!relevant.length) return;
  const known = await env.DB.prepare(`SELECT source, source_index, identity_key, status
    FROM native_app_predefined_identities_v1 WHERE child_id = ?`).bind(childId)
    .all<{ source: string; source_index: number; identity_key: string; status: string }>();
  const existing = new Map((known.results || []).map((row) => [
    `${row.source}:${row.source_index}:${row.identity_key}`, row.status,
  ]));
  const statements: D1PreparedStatement[] = [];
  const activationToken = crypto.randomUUID();
  const now = timestamp();
  for (const item of relevant) {
    const candidates = await matchingCandidates(env, childId, item.bundle_id);
    if (candidates.some((candidate) => candidate.existing_ignore)) {
      statements.push(env.DB.prepare(`UPDATE native_app_predefined_items_v1
        SET disabled_at = ?, updated_at = ? WHERE child_id = ? AND source = ? AND source_index = ?`)
        .bind(now, now, childId, item.source, item.source_index));
      continue;
    }
    const signingKeys = new Set(candidates.filter(trustedSigning).map((candidate) => candidate.identity_key));
    for (const candidate of candidates) {
      const key = `${item.source}:${item.source_index}:${candidate.identity_key}`;
      if (existing.has(key)) continue;
      const origin = candidate.existing_block ? 'existing_block' : candidate.santa_seen ? 'santa' : 'inventory';
      const automatic = !!candidate.existing_block || (trustedSigning(candidate) && signingKeys.size === 1);
      const status = automatic ? 'AUTO' : 'NEEDS_CONFIRM';
      statements.push(env.DB.prepare(`INSERT OR IGNORE INTO native_app_predefined_identities_v1 (
        child_id, source, source_index, identity_key, identity_type, identifier,
        match_origin, status, activation_token, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .bind(childId, item.source, item.source_index, candidate.identity_key, candidate.identity_type,
          candidate.identifier, origin, status, automatic ? activationToken : null, now, now));
    }
  }
  const newlyExecutable = `EXISTS (SELECT 1 FROM native_app_predefined_identities_v1 pi
    WHERE pi.child_id = ? AND pi.activation_token = ? AND pi.status = 'AUTO'
      AND pi.match_origin <> 'existing_block')`;
  statements.push(env.DB.prepare(`UPDATE native_app_predefined_items_v1
    SET required_policy_version = (SELECT policy_version + 1 FROM native_children_v1 WHERE child_id = ?),
        updated_at = ?
    WHERE child_id = ? AND EXISTS (
      SELECT 1 FROM native_app_predefined_identities_v1 pi
      WHERE pi.child_id = native_app_predefined_items_v1.child_id
        AND pi.source = native_app_predefined_items_v1.source
        AND pi.source_index = native_app_predefined_items_v1.source_index
        AND pi.activation_token = ? AND pi.status = 'AUTO'
        AND pi.match_origin <> 'existing_block'
    )`).bind(childId, now, childId, activationToken));
  statements.push(env.DB.prepare(`UPDATE native_app_predefined_items_v1
    SET required_policy_version = COALESCE(required_policy_version,
      (SELECT policy_version FROM native_children_v1 WHERE child_id = ?)), updated_at = ?
    WHERE child_id = ? AND EXISTS (
      SELECT 1 FROM native_app_predefined_identities_v1 pi
      WHERE pi.child_id = native_app_predefined_items_v1.child_id
        AND pi.source = native_app_predefined_items_v1.source
        AND pi.source_index = native_app_predefined_items_v1.source_index
        AND pi.activation_token = ? AND pi.match_origin = 'existing_block'
    )`).bind(childId, now, childId, activationToken));
  statements.push(env.DB.prepare(`UPDATE native_macs_v1
    SET desired_policy_version = desired_policy_version + 1, updated_at = ?
    WHERE child_id = ? AND status = 'active' AND ${newlyExecutable}`)
    .bind(now, childId, childId, activationToken));
  statements.push(env.DB.prepare(`UPDATE native_children_v1
    SET policy_version = policy_version + 1, updated_at = ?
    WHERE child_id = ? AND ${newlyExecutable}`)
    .bind(now, childId, childId, activationToken));
  statements.push(env.DB.prepare(`INSERT INTO native_app_audit_events_v1
    (id, child_id, account_id, event_type, result, metadata_json, created_at)
    SELECT ?, ?, ?, 'predefined.auto_bound', 'success', ?, ?
    WHERE ${newlyExecutable}`)
    .bind(crypto.randomUUID(), childId, accountId,
      JSON.stringify({ sources: [...new Set(relevant.map((item) => item.source))] }),
      now, childId, activationToken));
  if (statements.length) await env.DB.batch(statements);
}

export async function listPredefinedItems(env: Env, auth: NativeAuth) {
  const items = await env.DB.prepare(`SELECT source_index, display_name, bundle_id, parent_source_index,
    target_policy, disabled_at, required_policy_version FROM native_app_predefined_items_v1
    WHERE child_id = ? AND source = ? ORDER BY source_index`)
    .bind(auth.child_id, SOURCE).all<Record<string, unknown>>();
  const identities = await env.DB.prepare(`SELECT source_index, identity_key, identity_type, identifier,
    match_origin, status FROM native_app_predefined_identities_v1
    WHERE child_id = ? AND source = ? ORDER BY source_index, identity_type, identifier`)
    .bind(auth.child_id, SOURCE).all<Record<string, unknown>>();
  const macs = await env.DB.prepare(`SELECT id, display_name, desired_policy_version, applied_policy_version
    FROM native_macs_v1 WHERE child_id = ? AND status = 'active' ORDER BY display_name`)
    .bind(auth.child_id).all<Record<string, unknown>>();
  const byIndex = new Map<number, Record<string, unknown>[]>();
  for (const identity of identities.results || []) {
    const index = Number(identity.source_index);
    byIndex.set(index, [...(byIndex.get(index) || []), identity]);
  }
  const rows = (items.results || []).map((item) => {
    const candidates = byIndex.get(Number(item.source_index)) || [];
    const active = candidates.filter((candidate) => candidate.status === 'AUTO' || candidate.status === 'CONFIRMED');
    const needsConfirm = candidates.some((candidate) => candidate.status === 'NEEDS_CONFIRM');
    const required = Number(item.required_policy_version || 0);
    const applied = (macs.results || []).filter((mac) => required > 0 && Number(mac.applied_policy_version) >= required).length;
    let status = '待识别';
    if (item.disabled_at) status = '已停用';
    else if (!active.length && needsConfirm) status = '需确认';
    else if (active.length) {
      if (applied === 0) status = '待同步';
      else if (needsConfirm || applied < (macs.results || []).length) status = '部分生效';
      else status = '已生效';
    }
    return { ...item, status, identities: candidates, appliedMacCount: applied,
      activeMacCount: (macs.results || []).length };
  });
  return { source: SOURCE, sourceCount: rows.length,
    topLevelCount: (items.results || []).filter((item) => item.parent_source_index == null).length,
    items: rows, macs: macs.results || [] };
}

export async function decidePredefinedIdentity(
  env: Env, auth: NativeAuth, sourceIndex: number, identityKey: string, action: 'CONFIRM' | 'REJECT'
): Promise<boolean> {
  const candidate = await env.DB.prepare(`SELECT p.disabled_at, c.status FROM native_app_predefined_identities_v1 c
    JOIN native_app_predefined_items_v1 p ON p.child_id = c.child_id AND p.source = c.source
      AND p.source_index = c.source_index
    WHERE c.child_id = ? AND c.source = ? AND c.source_index = ? AND c.identity_key = ?`)
    .bind(auth.child_id, SOURCE, sourceIndex, identityKey)
    .first<{ disabled_at: number | null; status: string }>();
  if (!candidate || candidate.disabled_at || candidate.status !== 'NEEDS_CONFIRM') return false;
  const now = timestamp();
  const statements: D1PreparedStatement[] = [env.DB.prepare(`UPDATE native_app_predefined_identities_v1
    SET status = ?, updated_at = ? WHERE child_id = ? AND source = ? AND source_index = ? AND identity_key = ?`)
    .bind(action === 'CONFIRM' ? 'CONFIRMED' : 'REJECTED', now,
      auth.child_id, SOURCE, sourceIndex, identityKey)];
  if (action === 'CONFIRM') {
    statements.push(env.DB.prepare(`UPDATE native_app_predefined_items_v1
      SET required_policy_version = (SELECT policy_version + 1 FROM native_children_v1 WHERE child_id = ?),
      updated_at = ? WHERE child_id = ? AND source = ? AND source_index = ?`)
      .bind(auth.child_id, now, auth.child_id, SOURCE, sourceIndex));
    statements.push(env.DB.prepare(`UPDATE native_children_v1 SET policy_version = policy_version + 1,
      updated_at = ? WHERE child_id = ?`).bind(now, auth.child_id));
    statements.push(env.DB.prepare(`UPDATE native_macs_v1 SET desired_policy_version = desired_policy_version + 1,
      updated_at = ? WHERE child_id = ? AND status = 'active'`).bind(now, auth.child_id));
  }
  statements.push(env.DB.prepare(`INSERT INTO native_app_audit_events_v1
    (id, child_id, account_id, event_type, result, metadata_json, created_at)
    VALUES (?, ?, ?, ?, 'success', ?, ?)`)
    .bind(crypto.randomUUID(), auth.child_id, auth.account_id, `predefined.${action.toLowerCase()}`,
      JSON.stringify({ sourceIndex, identityKey }), now));
  await env.DB.batch(statements);
  return true;
}

export async function disablePredefinedItem(env: Env, auth: NativeAuth, sourceIndex: number): Promise<boolean> {
  const item = await env.DB.prepare(`SELECT source_index FROM native_app_predefined_items_v1
    WHERE child_id = ? AND source = ? AND source_index = ? AND disabled_at IS NULL`)
    .bind(auth.child_id, SOURCE, sourceIndex).first();
  if (!item) return false;
  const active = await env.DB.prepare(`SELECT 1 FROM native_app_predefined_items_v1 p
    JOIN native_app_predefined_identities_v1 i ON i.child_id = p.child_id
      AND i.source = p.source AND i.source_index = p.source_index
    WHERE p.child_id = ? AND p.source = ? AND p.disabled_at IS NULL
      AND (p.source_index = ? OR p.parent_source_index = ?)
      AND i.status IN ('AUTO', 'CONFIRMED') LIMIT 1`)
    .bind(auth.child_id, SOURCE, sourceIndex, sourceIndex).first();
  const now = timestamp();
  const statements = [
    env.DB.prepare(`UPDATE native_app_predefined_items_v1 SET disabled_at = ?, updated_at = ?
      WHERE child_id = ? AND source = ? AND (source_index = ? OR parent_source_index = ?)`)
      .bind(now, now, auth.child_id, SOURCE, sourceIndex, sourceIndex),
    env.DB.prepare(`INSERT INTO native_app_audit_events_v1
      (id, child_id, account_id, event_type, result, metadata_json, created_at)
      VALUES (?, ?, ?, 'predefined.disabled', 'success', ?, ?)`)
      .bind(crypto.randomUUID(), auth.child_id, auth.account_id, JSON.stringify({ sourceIndex }), now),
  ];
  if (active) statements.push(
    env.DB.prepare(`UPDATE native_children_v1 SET policy_version = policy_version + 1, updated_at = ?
      WHERE child_id = ?`).bind(now, auth.child_id),
    env.DB.prepare(`UPDATE native_macs_v1 SET desired_policy_version = desired_policy_version + 1,
      updated_at = ? WHERE child_id = ? AND status = 'active'`).bind(now, auth.child_id)
  );
  await env.DB.batch(statements);
  return true;
}
