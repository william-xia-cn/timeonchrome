import { hmacHex, randomSecret } from './crypto';
import {
  buildApplicationPresentation,
  normalizeSantaEvent,
  normalizeStoredPublisher,
  type ApplicationPresentationRow,
} from './policy';
import type { Env, NativeAuth } from './types';

const now = () => Date.now();
const id = () => crypto.randomUUID();

export async function ensureNativeChild(
  env: Env,
  auth: NativeAuth,
  displayName?: string
): Promise<void> {
  const timestamp = now();
  await env.DB.prepare(`
    INSERT INTO native_children_v1 (child_id, account_id, display_name, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(child_id) DO UPDATE SET
      display_name = COALESCE(excluded.display_name, native_children_v1.display_name),
      updated_at = excluded.updated_at
    WHERE native_children_v1.account_id = excluded.account_id
  `).bind(auth.child_id, auth.account_id, displayName || null, timestamp, timestamp).run();
  const owner = await env.DB.prepare(
    `SELECT account_id FROM native_children_v1 WHERE child_id = ?`
  ).bind(auth.child_id).first<{ account_id: string }>();
  if (!owner || owner.account_id !== auth.account_id) throw new Error('Child ownership mismatch');
}

export async function createNativeMac(env: Env, auth: NativeAuth, displayName: string) {
  const timestamp = now();
  const nativeMacId = id();
  const enrollmentId = id();
  const endpointId = randomSecret(18);
  const secret = randomSecret(32);
  const secretHash = await hmacHex(env.ENROLLMENT_HASH_SECRET, secret);
  await env.DB.batch([
    env.DB.prepare(`
      INSERT INTO native_macs_v1 (
        id, child_id, display_name, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?)
    `).bind(nativeMacId, auth.child_id, displayName, timestamp, timestamp),
    env.DB.prepare(`
      INSERT INTO santa_enrollments_v1 (
        id, native_mac_id, endpoint_id, secret_hash, created_at
      ) VALUES (?, ?, ?, ?, ?)
    `).bind(enrollmentId, nativeMacId, endpointId, secretHash, timestamp),
    auditStatement(env, auth.child_id, auth.account_id, nativeMacId, null, 'native_mac.created', 'success', {
      endpointId,
    }),
  ]);
  const base = env.SANTA_PUBLIC_BASE_URL.replace(/\/$/, '');
  return {
    id: nativeMacId,
    childId: auth.child_id,
    displayName,
    status: 'active',
    syncBaseUrl: `${base}/santa/v1/${endpointId}/${secret}/`,
  };
}

export async function listNativeMacs(env: Env, auth: NativeAuth) {
  const result = await env.DB.prepare(`
    SELECT id, display_name, status, hostname, serial_number, primary_user,
           os_version, santa_version, desired_policy_version,
           downloaded_policy_version, applied_policy_version,
           last_preflight_at, last_postflight_at, created_at, updated_at
      FROM native_macs_v1
     WHERE child_id = ?
     ORDER BY status ASC, display_name COLLATE NOCASE ASC
  `).bind(auth.child_id).all();
  return result.results || [];
}

export async function rotateEnrollment(env: Env, auth: NativeAuth, nativeMacId: string) {
  const mac = await ownedMac(env, auth, nativeMacId);
  if (!mac || mac.status !== 'active') return null;
  const timestamp = now();
  const endpointId = randomSecret(18);
  const secret = randomSecret(32);
  const secretHash = await hmacHex(env.ENROLLMENT_HASH_SECRET, secret);
  await env.DB.batch([
    env.DB.prepare(`
      UPDATE santa_enrollments_v1
         SET status = 'revoked', revoked_at = ?
       WHERE native_mac_id = ? AND status = 'active'
    `).bind(timestamp, nativeMacId),
    env.DB.prepare(`
      INSERT INTO santa_enrollments_v1 (
        id, native_mac_id, endpoint_id, secret_hash, created_at
      ) VALUES (?, ?, ?, ?, ?)
    `).bind(id(), nativeMacId, endpointId, secretHash, timestamp),
    auditStatement(env, auth.child_id, auth.account_id, nativeMacId, null, 'enrollment.rotated', 'success', {
      endpointId,
    }),
  ]);
  const base = env.SANTA_PUBLIC_BASE_URL.replace(/\/$/, '');
  return { syncBaseUrl: `${base}/santa/v1/${endpointId}/${secret}/` };
}

export async function revokeNativeMac(env: Env, auth: NativeAuth, nativeMacId: string): Promise<boolean> {
  const mac = await ownedMac(env, auth, nativeMacId);
  if (!mac) return false;
  const timestamp = now();
  await env.DB.batch([
    env.DB.prepare(`
      UPDATE native_macs_v1 SET status = 'revoked', revoked_at = ?, updated_at = ?
       WHERE id = ? AND child_id = ?
    `).bind(timestamp, timestamp, nativeMacId, auth.child_id),
    env.DB.prepare(`
      UPDATE santa_enrollments_v1 SET status = 'revoked', revoked_at = ?
       WHERE native_mac_id = ? AND status = 'active'
    `).bind(timestamp, nativeMacId),
    auditStatement(env, auth.child_id, auth.account_id, nativeMacId, null, 'native_mac.revoked', 'success'),
  ]);
  return true;
}

async function ownedMac(env: Env, auth: NativeAuth, nativeMacId: string) {
  return env.DB.prepare(`
    SELECT id, status FROM native_macs_v1 WHERE id = ? AND child_id = ?
  `).bind(nativeMacId, auth.child_id).first<{ id: string; status: string }>();
}

export async function bindSantaMachine(
  env: Env,
  context: { enrollmentId: string; nativeMacId: string; machineHash: string | null },
  machineHash: string,
  body: Record<string, unknown>
) {
  const timestamp = now();
  await env.DB.batch([
    env.DB.prepare(`
      UPDATE native_macs_v1 SET
        santa_machine_hash = COALESCE(santa_machine_hash, ?),
        hostname = ?, serial_number = ?, primary_user = ?, os_version = ?, santa_version = ?,
        last_preflight_at = ?, updated_at = ?
      WHERE id = ? AND (santa_machine_hash IS NULL OR santa_machine_hash = ?)
    `).bind(
      machineHash,
      textValue(body, 'hostname'),
      textValue(body, 'serial_num', 'serial_number'),
      textValue(body, 'primary_user', 'logged_in_users'),
      textValue(body, 'os_version'),
      textValue(body, 'santa_version'),
      timestamp,
      timestamp,
      context.nativeMacId,
      machineHash
    ),
    env.DB.prepare(`UPDATE santa_enrollments_v1 SET last_used_at = ? WHERE id = ?`)
      .bind(timestamp, context.enrollmentId),
  ]);
  const bound = await env.DB.prepare(`
    SELECT santa_machine_hash FROM native_macs_v1 WHERE id = ?
  `).bind(context.nativeMacId).first<{ santa_machine_hash: string | null }>();
  if (!bound || bound.santa_machine_hash !== machineHash) throw new Error('santa_machine_id_mismatch');
}

function textValue(input: Record<string, unknown>, ...keys: string[]): string | null {
  for (const key of keys) {
    const value = input[key];
    if (Array.isArray(value)) return value.length ? String(value[0]).slice(0, 512) : null;
    if (value !== undefined && value !== null && String(value).trim()) return String(value).trim().slice(0, 512);
  }
  return null;
}

export async function observeSantaEvents(
  env: Env,
  context: { accountId: string; childId: string; nativeMacId: string },
  rawEvents: unknown[]
): Promise<{ accepted: number; rejected: number; bundleBinaryRequests: string[] }> {
  type NormalizedEvent = NonNullable<ReturnType<typeof normalizeSantaEvent>>;
  const events: NormalizedEvent[] = [];
  let rejected = 0;
  const bundleCandidates = new Set<string>();
  for (const raw of rawEvents.slice(0, 1000)) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      rejected += 1;
      continue;
    }
    const event = normalizeSantaEvent(raw as Record<string, unknown>);
    if (!event) {
      rejected += 1;
      continue;
    }
    if (event.bundleHash && event.decision !== 'BUNDLE_BINARY') {
      bundleCandidates.add(event.bundleHash);
    }
    events.push(event);
  }

  const identityRows = await env.DB.prepare(`
    SELECT id, identity_key FROM application_identities_v1
  `).all<{ id: string; identity_key: string }>();
  const applicationRows = await env.DB.prepare(`
    SELECT id, auto_group_key FROM account_applications_v1 WHERE account_id = ?
  `).bind(context.accountId).all<{ id: string; auto_group_key: string }>();
  const identityApplicationRows = await env.DB.prepare(`
    SELECT am.identity_id, MIN(a.id) AS application_id
      FROM application_memberships_v1 am
      JOIN account_applications_v1 a ON a.id = am.application_id
     WHERE a.account_id = ? AND a.merged_into_application_id IS NULL
     GROUP BY am.identity_id
  `).bind(context.accountId).all<{ identity_id: string; application_id: string }>();
  const bundleRows = await env.DB.prepare(`
    SELECT o.bundle_hash, a.id AS application_id
      FROM application_observations_v1 o
      JOIN application_memberships_v1 m ON m.identity_id = o.identity_id
      JOIN account_applications_v1 a ON a.id = m.application_id
     WHERE o.native_mac_id = ? AND o.bundle_hash IS NOT NULL
       AND (o.decision IS NULL OR o.decision <> 'BUNDLE_BINARY')
       AND a.account_id = ?
     ORDER BY o.first_observed_at ASC
  `).bind(context.nativeMacId, context.accountId)
    .all<{ bundle_hash: string; application_id: string }>();

  const identityIds = new Map(
    (identityRows.results || []).map((row) => [row.identity_key, row.id])
  );
  const applicationIds = new Map(
    (applicationRows.results || []).map((row) => [row.auto_group_key, row.id])
  );
  const identityApplicationIds = new Map(
    (identityApplicationRows.results || []).map((row) => [row.identity_id, row.application_id])
  );
  const bundleApplicationIds = new Map<string, string>();
  for (const row of bundleRows.results || []) {
    if (!bundleApplicationIds.has(row.bundle_hash)) {
      bundleApplicationIds.set(row.bundle_hash, row.application_id);
    }
  }

  const EVENT_WRITE_BATCH_SIZE = 20;
  for (let offset = 0; offset < events.length; offset += EVENT_WRITE_BATCH_SIZE) {
    const statements: D1PreparedStatement[] = [];
    for (const event of events.slice(offset, offset + EVENT_WRITE_BATCH_SIZE)) {
      const timestamp = now();
      let identityId = identityIds.get(event.identityKey);
      if (!identityId) {
        identityId = id();
        identityIds.set(event.identityKey, identityId);
      }

      let applicationId = event.decision === 'BUNDLE_BINARY' && event.bundleHash
        ? bundleApplicationIds.get(event.bundleHash)
        : undefined;
      if (!applicationId) applicationId = identityApplicationIds.get(identityId);
      const usesGroupedApplication = !applicationId;
      if (!applicationId) {
        applicationId = applicationIds.get(event.groupKey);
        if (!applicationId) {
          applicationId = id();
          applicationIds.set(event.groupKey, applicationId);
        }
      }
      identityApplicationIds.set(identityId, applicationId);

      statements.push(env.DB.prepare(`
        INSERT INTO application_identities_v1 (
          id, identity_key, identity_type, identifier, team_id, signing_id, cdhash, sha256,
          bundle_id, bundle_path, name, publisher, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(identity_key) DO UPDATE SET
          team_id = COALESCE(excluded.team_id, application_identities_v1.team_id),
          signing_id = COALESCE(excluded.signing_id, application_identities_v1.signing_id),
          cdhash = COALESCE(excluded.cdhash, application_identities_v1.cdhash),
          sha256 = COALESCE(excluded.sha256, application_identities_v1.sha256),
          bundle_id = COALESCE(excluded.bundle_id, application_identities_v1.bundle_id),
          bundle_path = COALESCE(excluded.bundle_path, application_identities_v1.bundle_path),
          name = COALESCE(excluded.name, application_identities_v1.name),
          publisher = CASE
            WHEN application_identities_v1.publisher IS NULL
              OR application_identities_v1.publisher LIKE '%[object Object]%'
            THEN COALESCE(excluded.publisher, application_identities_v1.publisher)
            ELSE application_identities_v1.publisher
          END,
          updated_at = excluded.updated_at
      `).bind(
        identityId, event.identityKey, event.identityType, event.identifier, event.teamId,
        event.signingId, event.cdhash, event.sha256, event.bundleId, event.bundlePath,
        event.name, event.publisher, timestamp, timestamp
      ));
      if (usesGroupedApplication) {
        statements.push(env.DB.prepare(`
          INSERT INTO account_applications_v1 (
            id, account_id, auto_group_key, display_name, publisher, team_id,
            top_level_bundle_id, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(account_id, auto_group_key) DO UPDATE SET
            display_name = COALESCE(account_applications_v1.display_name, excluded.display_name),
            publisher = CASE
              WHEN account_applications_v1.publisher IS NULL
                OR account_applications_v1.publisher LIKE '%[object Object]%'
              THEN COALESCE(excluded.publisher, account_applications_v1.publisher)
              ELSE account_applications_v1.publisher
            END,
            updated_at = excluded.updated_at
        `).bind(
          applicationId, context.accountId, event.groupKey, event.name, event.publisher,
          event.teamId, event.topLevelBundleId, timestamp, timestamp
        ));
      }
      statements.push(
        env.DB.prepare(`
          INSERT OR IGNORE INTO application_memberships_v1 (
            application_id, identity_id, membership_source, created_at
          ) VALUES (?, ?, 'automatic', ?)
        `).bind(applicationId, identityId, timestamp),
        env.DB.prepare(`
          INSERT INTO application_observations_v1 (
            id, child_id, native_mac_id, identity_id, first_observed_at, last_observed_at,
            sample_path, executing_user, decision, bundle_hash
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(child_id, native_mac_id, identity_id) DO UPDATE SET
            last_observed_at = excluded.last_observed_at,
            sample_path = COALESCE(excluded.sample_path, application_observations_v1.sample_path),
            executing_user = COALESCE(excluded.executing_user, application_observations_v1.executing_user),
            decision = COALESCE(excluded.decision, application_observations_v1.decision),
            bundle_hash = COALESCE(excluded.bundle_hash, application_observations_v1.bundle_hash)
        `).bind(
          id(), context.childId, context.nativeMacId, identityId,
          timestamp, timestamp, event.samplePath, event.executingUser, event.decision, event.bundleHash
        ),
        env.DB.prepare(`
          INSERT OR IGNORE INTO child_application_states_v1 (
            child_id, application_id, state, created_at, updated_at
          ) VALUES (?, ?, 'REVIEW', ?, ?)
        `).bind(context.childId, applicationId, timestamp, timestamp)
      );
    }
    if (statements.length) await env.DB.batch(statements);
  }

  await env.DB.prepare(`
    UPDATE native_macs_v1 SET last_event_upload_at = ?, updated_at = ? WHERE id = ?
  `).bind(now(), now(), context.nativeMacId).run();
  const uploadedBundles = await env.DB.prepare(`
    SELECT DISTINCT bundle_hash FROM application_observations_v1
     WHERE native_mac_id = ? AND bundle_hash IS NOT NULL AND decision = 'BUNDLE_BINARY'
  `).bind(context.nativeMacId).all<{ bundle_hash: string }>();
  const uploadedBundleHashes = new Set(
    (uploadedBundles.results || []).map((row) => row.bundle_hash)
  );
  const bundleBinaryRequests = [...bundleCandidates]
    .filter((bundleHash) => !uploadedBundleHashes.has(bundleHash));
  return { accepted: events.length, rejected, bundleBinaryRequests };
}

export async function listApplications(env: Env, auth: NativeAuth, state?: string) {
  const stateFilter = state && ['REVIEW', 'IGNORE', 'BLOCK'].includes(state) ? state : null;
  const result = await env.DB.prepare(`
    SELECT a.id, a.display_name, a.publisher, a.team_id, a.top_level_bundle_id,
           s.state, s.updated_at,
           CASE WHEN COUNT(o.id) > 0 THEN 1 ELSE 0 END AS observed,
           EXISTS(
             SELECT 1 FROM child_publisher_blocks_v1 pb
              WHERE pb.child_id = s.child_id AND pb.team_id = a.team_id
           ) AS publisher_blocked,
           MIN(o.first_observed_at) AS first_observed_at,
           MAX(o.last_observed_at) AS last_observed_at,
           MAX(o.sample_path) AS sample_path,
           MAX(ai.bundle_id) AS bundle_id,
           MAX(ai.bundle_path) AS bundle_path,
           MAX(o.executing_user) AS executing_user,
           GROUP_CONCAT(DISTINCT o.native_mac_id) AS native_mac_ids
      FROM child_application_states_v1 s
      JOIN account_applications_v1 a ON a.id = s.application_id
      JOIN application_memberships_v1 am ON am.application_id = a.id
      JOIN application_identities_v1 ai ON ai.id = am.identity_id
      LEFT JOIN application_observations_v1 o
        ON o.identity_id = am.identity_id AND o.child_id = s.child_id
     WHERE s.child_id = ? AND a.account_id = ? AND a.merged_into_application_id IS NULL
       AND (? IS NULL OR s.state = ?)
     GROUP BY a.id, a.display_name, a.publisher, a.team_id, a.top_level_bundle_id,
              s.state, s.updated_at
     ORDER BY CASE s.state WHEN 'REVIEW' THEN 0 WHEN 'BLOCK' THEN 1 ELSE 2 END,
              observed DESC, last_observed_at DESC, s.updated_at DESC
  `).bind(auth.child_id, auth.account_id, stateFilter, stateFilter).all<ApplicationPresentationRow>();
  return buildApplicationPresentation((result.results || []).map((row) => ({
    ...row,
    publisher: normalizeStoredPublisher(row.publisher),
  })));
}

export async function decideApplication(
  env: Env,
  auth: NativeAuth,
  applicationId: string,
  action: 'IGNORE' | 'BLOCK' | 'BLOCK_PUBLISHER'
): Promise<boolean> {
  const application = await env.DB.prepare(`
    SELECT a.id, a.team_id, a.top_level_bundle_id
      FROM account_applications_v1 a
      JOIN child_application_states_v1 s ON s.application_id = a.id
     WHERE a.id = ? AND a.account_id = ? AND s.child_id = ?
  `).bind(applicationId, auth.account_id, auth.child_id).first<{
    id: string;
    team_id: string | null;
    top_level_bundle_id: string | null;
  }>();
  if (!application) return false;
  if (action === 'IGNORE' && application.team_id) {
    const publisherBlock = await env.DB.prepare(`
      SELECT team_id FROM child_publisher_blocks_v1 WHERE child_id = ? AND team_id = ?
    `).bind(auth.child_id, application.team_id).first<{ team_id: string }>();
    if (publisherBlock) throw new Error('publisher_block_prevents_ignore');
  }
  const timestamp = now();
  const statements: D1PreparedStatement[] = [];
  if (action === 'BLOCK_PUBLISHER') {
    if (!application.team_id) throw new Error('Application has no TeamID');
    statements.push(env.DB.prepare(`
      INSERT INTO child_publisher_blocks_v1 (child_id, team_id, updated_by_account_id, created_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(child_id, team_id) DO UPDATE SET
        updated_by_account_id = excluded.updated_by_account_id,
        created_at = excluded.created_at
    `).bind(auth.child_id, application.team_id, auth.account_id, timestamp));
    statements.push(env.DB.prepare(`
      UPDATE child_application_states_v1
         SET state = 'BLOCK', updated_by_account_id = ?, updated_at = ?
       WHERE child_id = ? AND application_id IN (
         SELECT id FROM account_applications_v1 WHERE account_id = ? AND team_id = ?
       )
    `).bind(auth.account_id, timestamp, auth.child_id, auth.account_id, application.team_id));
  } else {
    statements.push(env.DB.prepare(`
      UPDATE child_application_states_v1
         SET state = ?, updated_by_account_id = ?, updated_at = ?
       WHERE child_id = ? AND application_id IN (
         SELECT id FROM account_applications_v1
          WHERE account_id = ? AND merged_into_application_id IS NULL
            AND (
              id = ? OR (
                ? IS NOT NULL
                AND LOWER(COALESCE(top_level_bundle_id, '')) = LOWER(?)
                AND UPPER(COALESCE(team_id, '')) = UPPER(COALESCE(?, ''))
              )
            )
       )
    `).bind(
      action, auth.account_id, timestamp, auth.child_id, auth.account_id,
      applicationId, application.top_level_bundle_id, application.top_level_bundle_id,
      application.team_id
    ));
  }
  statements.push(...policyVersionStatements(env, auth.child_id));
  statements.push(auditStatement(
    env, auth.child_id, auth.account_id, null, applicationId,
    `application.${action.toLowerCase()}`, 'success'
  ));
  await env.DB.batch(statements);
  return true;
}

export async function mergeApplication(
  env: Env,
  auth: NativeAuth,
  sourceId: string,
  targetId: string
): Promise<boolean> {
  if (sourceId === targetId) return false;
  const owned = await env.DB.prepare(`
    SELECT COUNT(*) AS total FROM account_applications_v1
     WHERE account_id = ? AND id IN (?, ?) AND merged_into_application_id IS NULL
  `).bind(auth.account_id, sourceId, targetId).first<{ total: number }>();
  if (Number(owned?.total || 0) !== 2) return false;
  await env.DB.batch([
    env.DB.prepare(`UPDATE account_applications_v1 SET merged_into_application_id = ?, updated_at = ? WHERE id = ?`)
      .bind(targetId, now(), sourceId),
    env.DB.prepare(`
      INSERT OR IGNORE INTO application_memberships_v1 (
        application_id, identity_id, membership_source, merged_from_application_id, created_at
      )
      SELECT ?, identity_id, 'manual', ?, ? FROM application_memberships_v1 WHERE application_id = ?
    `).bind(targetId, sourceId, now(), sourceId),
    env.DB.prepare(`
      INSERT INTO child_application_states_v1 (
        child_id, application_id, state, updated_by_account_id, created_at, updated_at
      )
      SELECT child_id, ?, state, ?, ?, ?
        FROM child_application_states_v1 WHERE application_id = ?
      ON CONFLICT(child_id, application_id) DO UPDATE SET
        state = CASE
          WHEN child_application_states_v1.state = 'BLOCK' OR excluded.state = 'BLOCK' THEN 'BLOCK'
          WHEN child_application_states_v1.state = 'REVIEW' OR excluded.state = 'REVIEW' THEN 'REVIEW'
          ELSE 'IGNORE'
        END,
        updated_by_account_id = excluded.updated_by_account_id,
        updated_at = excluded.updated_at
    `).bind(targetId, auth.account_id, now(), now(), sourceId),
    env.DB.prepare(`
      UPDATE native_children_v1 SET policy_version = policy_version + 1, updated_at = ? WHERE account_id = ?
    `).bind(now(), auth.account_id),
    env.DB.prepare(`
      UPDATE native_macs_v1 SET desired_policy_version = desired_policy_version + 1, updated_at = ?
       WHERE child_id IN (SELECT child_id FROM native_children_v1 WHERE account_id = ?) AND status = 'active'
    `).bind(now(), auth.account_id),
    auditStatement(env, auth.child_id, auth.account_id, null, targetId, 'application.merged', 'success', { sourceId }),
  ]);
  return true;
}

export async function unmergeApplication(
  env: Env,
  auth: NativeAuth,
  sourceId: string
): Promise<boolean> {
  const source = await env.DB.prepare(`
    SELECT id, merged_into_application_id FROM account_applications_v1
     WHERE id = ? AND account_id = ? AND merged_into_application_id IS NOT NULL
  `).bind(sourceId, auth.account_id).first<{ id: string; merged_into_application_id: string }>();
  if (!source) return false;
  await env.DB.batch([
    env.DB.prepare(`UPDATE account_applications_v1 SET merged_into_application_id = NULL, updated_at = ? WHERE id = ?`)
      .bind(now(), sourceId),
    env.DB.prepare(`
      DELETE FROM application_memberships_v1
       WHERE application_id = ? AND membership_source = 'manual' AND merged_from_application_id = ?
    `).bind(source.merged_into_application_id, sourceId),
    env.DB.prepare(`
      UPDATE native_children_v1 SET policy_version = policy_version + 1, updated_at = ? WHERE account_id = ?
    `).bind(now(), auth.account_id),
    env.DB.prepare(`
      UPDATE native_macs_v1 SET desired_policy_version = desired_policy_version + 1, updated_at = ?
       WHERE child_id IN (SELECT child_id FROM native_children_v1 WHERE account_id = ?) AND status = 'active'
    `).bind(now(), auth.account_id),
    auditStatement(env, auth.child_id, auth.account_id, null, sourceId, 'application.unmerged', 'success'),
  ]);
  return true;
}

export async function listApplicationMerges(env: Env, auth: NativeAuth) {
  const result = await env.DB.prepare(`
    SELECT source.id AS source_id, source.display_name AS source_name,
           target.id AS target_id, target.display_name AS target_name
      FROM account_applications_v1 source
      JOIN account_applications_v1 target ON target.id = source.merged_into_application_id
     WHERE source.account_id = ? AND target.account_id = ?
     ORDER BY source.updated_at DESC
  `).bind(auth.account_id, auth.account_id).all();
  return result.results || [];
}

function policyVersionStatements(env: Env, childId: string): D1PreparedStatement[] {
  return [
    env.DB.prepare(`UPDATE native_children_v1 SET policy_version = policy_version + 1, updated_at = ? WHERE child_id = ?`)
      .bind(now(), childId),
    env.DB.prepare(`
      UPDATE native_macs_v1 SET desired_policy_version = desired_policy_version + 1, updated_at = ?
       WHERE child_id = ? AND status = 'active'
    `).bind(now(), childId),
  ];
}

function auditStatement(
  env: Env,
  childId: string,
  accountId: string | null,
  nativeMacId: string | null,
  applicationId: string | null,
  eventType: string,
  result: string,
  metadata?: Record<string, unknown>
): D1PreparedStatement {
  return env.DB.prepare(`
    INSERT INTO native_app_audit_events_v1 (
      id, child_id, account_id, native_mac_id, application_id,
      event_type, result, metadata_json, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id(), childId, accountId, nativeMacId, applicationId, eventType, result,
    metadata ? JSON.stringify(metadata) : null, now()
  );
}

export async function loadBlockedPolicy(env: Env, childId: string) {
  const applications = await env.DB.prepare(`
    SELECT s.application_id, i.identity_type, i.identifier
      FROM child_application_states_v1 s
      JOIN account_applications_v1 a ON a.id = s.application_id
      JOIN application_memberships_v1 m ON m.application_id = s.application_id
      JOIN application_identities_v1 i ON i.id = m.identity_id
     WHERE s.child_id = ? AND s.state = 'BLOCK' AND a.merged_into_application_id IS NULL
     ORDER BY s.application_id, CASE i.identity_type WHEN 'SIGNINGID' THEN 0 WHEN 'CDHASH' THEN 1 ELSE 2 END
  `).bind(childId).all<{ application_id: string; identity_type: 'SIGNINGID' | 'CDHASH' | 'BINARY'; identifier: string }>();
  const grouped = new Map<string, Array<{ identityType: 'SIGNINGID' | 'CDHASH' | 'BINARY'; identifier: string }>>();
  for (const row of applications.results || []) {
    const identities = grouped.get(row.application_id) || [];
    identities.push({ identityType: row.identity_type, identifier: row.identifier });
    grouped.set(row.application_id, identities);
  }
  const publishers = await env.DB.prepare(`
    SELECT team_id FROM child_publisher_blocks_v1 WHERE child_id = ? ORDER BY team_id
  `).bind(childId).all<{ team_id: string }>();
  return {
    applications: Array.from(grouped.values()).map((identities) => ({ identities })),
    publishers: (publishers.results || []).map((row) => row.team_id),
  };
}

export async function markRuleDownload(env: Env, nativeMacId: string, version: number) {
  await env.DB.prepare(`
    UPDATE native_macs_v1 SET downloaded_policy_version = ?, last_rule_download_at = ?, updated_at = ? WHERE id = ?
  `).bind(version, now(), now(), nativeMacId).run();
}

export async function markPostflight(env: Env, nativeMacId: string, version: number) {
  await env.DB.prepare(`
    UPDATE native_macs_v1 SET applied_policy_version = ?, last_postflight_at = ?, updated_at = ? WHERE id = ?
  `).bind(version, now(), now(), nativeMacId).run();
}

export async function deleteNativeChild(env: Env, accountId: string, childId: string): Promise<boolean> {
  const child = await env.DB.prepare(`
    SELECT child_id FROM native_children_v1 WHERE child_id = ? AND account_id = ?
  `).bind(childId, accountId).first<{ child_id: string }>();
  if (!child) return true;
  await env.DB.prepare(`DELETE FROM native_children_v1 WHERE child_id = ? AND account_id = ?`)
    .bind(childId, accountId).run();
  return true;
}
