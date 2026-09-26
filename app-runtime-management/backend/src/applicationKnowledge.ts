import type { ApplicationKnowledge, AppClass, AppEvidence } from '@timeonchrome/app-runtime-contracts/classification';
import { identifyProducts, matches, resolveApplication } from '@timeonchrome/app-runtime-contracts/classification';
import { ApplicationContractError, parseApplicationKnowledge, parseAppEvidence } from '@timeonchrome/app-runtime-contracts/classification-validation';
import type { AppPolicyClassification } from './contracts';
import { getAppPolicy } from './appPolicy';
import { buildWeekReclassification } from './applicationUsageCorrections';
import { sha256Hex } from './crypto';
import { HttpError } from './http';
import { isRecord } from './validation';
import { controlledProducts, systemToolPackageIds } from './productCatalogRules';
import { projectExplicitApplicationClassifications } from './applicationIdentityProjection';

export const knowledgeEtag = (version: number) => `"application-knowledge-v${version}"`;
export function effectiveApplicationKnowledge(value: ApplicationKnowledge): ApplicationKnowledge {
  const products = value.products.filter(item=>!controlledProducts.some(builtin=>builtin.id===item.id)).concat(controlledProducts);
  return {...value,schemaVersion:2,products};
}

export const defaultSystemApplicationRuleId = 'builtin.default.system-application.composite';
export const defaultGameGroupRuleId = 'builtin.default.game-group.restricted-entertainment';

function exactSystemApplication(evidence: AppEvidence): boolean {
  if (evidence.platform !== 'windows' || !evidence.verifiedFields.includes('packageId')) return false;
  const packageId = evidence.values.packageId?.trim().toLowerCase();
  if (!packageId) return false;
  const family = packageId.split('!', 1)[0]!;
  return systemToolPackageIds.has(packageId) || systemToolPackageIds.has(family);
}

/**
 * Runtime-owned defaults are lower priority than explicit Child choices and approved rules.
 * They are frozen into resolvedApplications so delayed uploads continue to validate against
 * the immutable policy version that the machine actually applied.
 */
export function resolveEffectiveApplication(
  knowledge: ApplicationKnowledge,
  childId: string,
  evidence: AppEvidence,
  previous: AppClass = 'unclassified',
) {
  const resolution = resolveApplication(knowledge, childId, evidence, previous);
  if (!['unclassified', 'suggestion'].includes(resolution.status)) return resolution;
  // Package containers, helpers and other technical records never receive management defaults.
  if (evidence.discovery && evidence.discovery.role !== 'application') return resolution;
  if (exactSystemApplication(evidence)) return {
    ...resolution,
    classification: 'composite' as const,
    status: 'automatic' as const,
    ruleIds: [defaultSystemApplicationRuleId],
  };
  if (resolution.typeStatus === 'confirmed'
      && ['game', 'gameLauncher', 'gameUtility'].includes(resolution.appType)) return {
    ...resolution,
    classification: 'restrictedEntertainment' as const,
    status: 'automatic' as const,
    ruleIds: [defaultGameGroupRuleId],
  };
  return resolution;
}
const empty = (): ApplicationKnowledge => ({ schemaVersion: 1, version: 0, products: [], rules: [], bindings: [] });
const canonical = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (isRecord(value)) return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
};
function contract<T>(parse: () => T): T {
  try { return parse(); } catch (error) {
    if (error instanceof ApplicationContractError) throw new HttpError(400, error.code, 'Application data is invalid.');
    throw error;
  }
}
export async function getApplicationKnowledge(db: D1Database, accountId: string): Promise<ApplicationKnowledge> {
  const row = await db.prepare(`SELECT payload_json FROM runtime_application_knowledge_versions_v1
    WHERE account_id=?1 ORDER BY version DESC LIMIT 1`).bind(accountId).first<{ payload_json: string }>();
  return row ? JSON.parse(row.payload_json) as ApplicationKnowledge : empty();
}
export function parseKnowledge(value: unknown, childIds: string[]): ApplicationKnowledge {
  const knowledge = contract(() => parseApplicationKnowledge(value));
  if (knowledge.bindings.some(binding => !childIds.includes(binding.childId))) throw new HttpError(404, 'CHILD_NOT_FOUND', 'Child was not found.');
  return knowledge;
}
export async function listApplicationInventory(db: D1Database, accountId: string) {
  const rows = await db.prepare(`SELECT i.* FROM runtime_application_inventory_v1 i
    JOIN runtime_machines_v2 m ON m.id=i.machine_id WHERE m.account_id=?1
    ORDER BY i.last_seen_at_ms DESC LIMIT 20001`).bind(accountId).all<{
      machine_id: string; local_user_id: string; evidence_json: string; status: string;
      first_seen_at_ms: number; last_seen_at_ms: number;
    }>();
  if (rows.results.length > 20000) throw new HttpError(413, 'APPLICATION_INVENTORY_LIMIT', 'Application inventory exceeds the supported family capacity.');
  return rows.results.map(row => ({ machineId: row.machine_id, localUserId: row.local_user_id,
    evidence: JSON.parse(row.evidence_json) as AppEvidence, status: row.status,
    firstSeenAtMs: row.first_seen_at_ms, lastSeenAtMs: row.last_seen_at_ms }));
}

export function resolvePolicyApplications(knowledge: ApplicationKnowledge, childId: string, evidence: AppEvidence[],
    explicit: AppPolicyClassification[], previous: AppPolicyClassification[] = []): AppPolicyClassification[] {
  const byIdentity = new Map<string, AppEvidence>();
  const conflicted = new Set<string>();
  for (const item of evidence) {
    const key = `${item.platform}\n${item.runtimeIdentity}`, existing = byIdentity.get(key);
    if (existing && canonical(existing.values) !== canonical(item.values)) conflicted.add(key);
    if (!existing) byIdentity.set(key, item);
  }
  for (const key of conflicted) byIdentity.set(key, { ...byIdentity.get(key)!, values: {}, verifiedFields: [] });
  const items = [...byIdentity.values()];
  const configured = projectExplicitApplicationClassifications(items, explicit, knowledge, previous);
  const resolved = items.map(item => {
    const prior = previous.find(entry => entry.platform === item.platform && entry.runtimeIdentity === item.runtimeIdentity);
    const classification = configured.get(`${item.platform}\n${item.runtimeIdentity}`)
      ?? resolveEffectiveApplication(knowledge, childId, item, prior?.classification).classification;
    return { platform: item.platform, runtimeIdentity: item.runtimeIdentity, displayName: item.displayName, classification };
  }).filter(item => item.classification !== 'unclassified');
  if (resolved.length > 1000) throw new HttpError(413, 'APPLICATION_POLICY_CAPACITY', 'Too many classified implementations.');
  return resolved;
}

/** Freeze server resolutions in the same transaction as knowledge/inventory; old ledger stays unchanged. */
async function policyStatements(db: D1Database, accountId: string, knowledge: ApplicationKnowledge,
    childIds: string[], evidence: AppEvidence[], nowMs: number): Promise<D1PreparedStatement[]> {
  const statements: D1PreparedStatement[] = [];
  const effectiveKnowledge = effectiveApplicationKnowledge(knowledge);
  for (const childId of childIds) {
    const current = await getAppPolicy(db, accountId, childId);
    const previous = current.resolvedApplications ?? [];
    const resolvedApplications = resolvePolicyApplications(effectiveKnowledge, childId, evidence, current.classifications, previous);
    const binding = effectiveKnowledge.bindings.filter(item => item.childId === childId);
    const enabled = new Set(binding.flatMap(item => item.ruleIds));
    const scoped = { ...effectiveKnowledge, bindings: binding, rules: effectiveKnowledge.rules.filter(rule => enabled.has(rule.id)) };
    const payload = canonical({ classifications: current.classifications, quotas: current.quotas,
      timeWindows: current.timeWindows, applicationKnowledge: scoped, resolvedApplications,
      weekReclassification: buildWeekReclassification({ classifications: current.classifications, resolvedApplications }, nowMs, current) });
    statements.push(db.prepare(`INSERT INTO runtime_child_app_policy_versions_v1
      (account_id,child_id,version,payload_json,payload_hash,effective_at_ms,created_at_ms)
      VALUES(?1,?2,?3,?4,?5,?6,?6)`).bind(accountId, childId, current.version + 1, payload, await sha256Hex(payload), nowMs));
    // Explicit technical identity choices remain higher priority than rule projections.
    for (const entry of current.classifications) statements.push(db.prepare(`INSERT INTO runtime_app_classification_history_v1
      (account_id,child_id,platform,runtime_identity,policy_version,classification,display_name,effective_at_ms,created_at_ms)
      VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?8)`).bind(accountId, childId, entry.platform, entry.runtimeIdentity,
        current.version + 1, entry.classification, entry.displayName, nowMs));
  }
  statements.push(db.prepare(`UPDATE runtime_machines_v2 SET desired_policy_version=desired_policy_version+1,
    policy_state='pending',policy_error=NULL,updated_at_ms=?2 WHERE account_id=?1 AND revoked_at_ms IS NULL`).bind(accountId, nowMs));
  statements.push(db.prepare(`INSERT INTO runtime_machine_policy_versions_v2(machine_id,version,payload_hash,created_at_ms)
    SELECT id,desired_policy_version,?2,?3 FROM runtime_machines_v2 WHERE account_id=?1 AND revoked_at_ms IS NULL`)
    .bind(accountId, await sha256Hex(canonical(knowledge)), nowMs));
  return statements;
}
async function batch(db: D1Database, statements: D1PreparedStatement[]): Promise<void> {
  try { await db.batch(statements); } catch (error) {
    if (error instanceof Error && /UNIQUE|constraint/iu.test(error.message)) throw new HttpError(412, 'APPLICATION_KNOWLEDGE_CONFLICT', 'Application data changed. Reload before saving.');
    throw error;
  }
}
async function inventoryPolicyChildren(db: D1Database, accountId: string) {
  // A classified Child can exist before the asynchronous lifecycle replica arrives.
  const rows = await db.prepare(`SELECT child_id FROM runtime_children_v1 WHERE account_id=?1
    UNION SELECT child_id FROM runtime_child_app_policy_versions_v1 WHERE account_id=?1`)
    .bind(accountId).all<{ child_id: string }>();
  const explicit = await db.prepare(`SELECT 1 AS found FROM runtime_child_app_policy_versions_v1 p
    WHERE p.account_id=?1 AND p.version=(SELECT MAX(previous.version) FROM runtime_child_app_policy_versions_v1 previous
      WHERE previous.account_id=p.account_id AND previous.child_id=p.child_id)
      AND json_array_length(p.payload_json,'$.classifications')>0 LIMIT 1`)
    .bind(accountId).first<{ found: number }>();
  return { childIds: rows.results.map(item => item.child_id), hasExplicit: Boolean(explicit) };
}
export async function putApplicationKnowledge(db: D1Database, accountId: string, childIds: string[],
    expected: string | null, update: ApplicationKnowledge, nowMs: number, action = 'publish') {
  if (!['publish','import','confirm','merge','split','undo'].includes(action)) throw new HttpError(400, 'INVALID_KNOWLEDGE_ACTION', 'Application operation is invalid.');
  const current = await getApplicationKnowledge(db, accountId);
  if (expected !== knowledgeEtag(current.version)) throw new HttpError(412, 'APPLICATION_KNOWLEDGE_CONFLICT', 'Application data changed. Reload before saving.');
  const next = { ...update, version: current.version + 1 };
  const payload = canonical(next), hash = await sha256Hex(payload);
  const inventory = await listApplicationInventory(db, accountId);
  const statements = [db.prepare(`INSERT INTO runtime_application_knowledge_versions_v1
    (account_id,version,payload_json,payload_hash,created_at_ms) VALUES(?1,?2,?3,?4,?5)`)
    .bind(accountId, next.version, payload, hash, nowMs),
    db.prepare(`INSERT INTO runtime_application_knowledge_audit_v1
      (account_id,version,action,previous_hash,next_hash,created_at_ms) VALUES(?1,?2,?3,?4,?5,?6)`)
      .bind(accountId, next.version, action, await sha256Hex(canonical(current)), hash, nowMs),
    ...await policyStatements(db, accountId, next, childIds, inventory.map(item => item.evidence), nowMs)];
  await batch(db, statements);
  return next;
}

export async function knowledgeImportPreview(db: D1Database, accountId: string, childIds: string[], value: unknown) {
  if (!isRecord(value) || !isRecord(value.knowledge)) throw new HttpError(400,'INVALID_RULE_IMPORT','Rule import is invalid.');
  const raw = structuredClone(value.knowledge);
  const warnings: string[] = [];
  // Name-only products remain suggestion rules, never fabricated confirmed identities.
  if (Array.isArray(raw.products) && Array.isArray(raw.rules) && Array.isArray(raw.bindings)) {
    const candidates = raw.products.filter(item => isRecord(item) && Array.isArray(item.selectors) && item.selectors.length === 0);
    raw.products = raw.products.filter(item => !candidates.includes(item));
    for (const product of candidates) {
      if (!isRecord(product)) continue;
      warnings.push(String(product.name));
      const ruleId = `candidate-${String(product.id)}`;
      raw.rules.push({id:ruleId,name:product.name,kind:'type',match:{operator:'all',conditions:[{field:'productName',value:product.name}]},
        exclude:[],mode:'suggestion',classification:'unclassified',type:product.type,enabled:true,source:'import-candidate',reason:'仅名称，需家长确认可信身份'});
      for (const binding of raw.bindings) if (isRecord(binding) && Array.isArray(binding.products) && Array.isArray(binding.ruleIds)) {
        if (!binding.ruleIds.includes(ruleId)) binding.ruleIds.push(ruleId);
        binding.products = binding.products.filter(item => !isRecord(item) || item.productId !== product.id);
      }
    }
  }
  const incoming = parseKnowledge(raw, childIds);
  const current = await getApplicationKnowledge(db,accountId);
  const changes: Array<{key:string;kind:string;name:string;change:string}> = [];
  for (const kind of ['products','rules'] as const) for (const item of incoming[kind]) {
    const old = current[kind].find(entry => entry.id === item.id);
    if (canonical(old ?? null) !== canonical(item)) changes.push({key:`${kind}:${item.id}`,kind,name:item.name,change:old?'modify':'add'});
  }
  const proposed = effectiveApplicationKnowledge(applyImport(current,incoming,changes.map(item=>item.key)));
  const inventory = await listApplicationInventory(db,accountId);
  const targets = incoming.bindings.map(item=>item.childId);
  const hits = inventory.flatMap(item => targets.flatMap(childId => {
    const productIds=identifyProducts(proposed.products,item.evidence);
    const binding=proposed.bindings.find(entry=>entry.childId===childId);
    const hit=incoming.rules.some(rule=>rule.enabled && binding?.ruleIds.includes(rule.id)
      && (!rule.platform || rule.platform===item.evidence.platform) && (!rule.productId || productIds.includes(rule.productId))
      && (rule.productId && !rule.match.conditions.length || matches(rule.match,item.evidence,rule.mode==='automatic'))
      && !rule.exclude.some(expression=>matches(expression,item.evidence)))
      || incoming.products.some(product=>productIds.includes(product.id));
    return hit ? [{childIndex:childIds.indexOf(childId),displayName:item.evidence.displayName,
      platform:item.evidence.platform,result:resolveEffectiveApplication(proposed,childId,item.evidence)}] : [];
  }));
  return {etag:knowledgeEtag(current.version),previewHash:await sha256Hex(canonical({current,incoming})),changes,warnings,hits,incoming};
}
function applyImport(current: ApplicationKnowledge, incoming: ApplicationKnowledge, selected: string[]): ApplicationKnowledge {
  const next = structuredClone(current);
  for (const product of incoming.products) if (selected.includes(`products:${product.id}`)) {
    next.products = next.products.filter(item=>item.id!==product.id); next.products.push(product);
  }
  for (const rule of incoming.rules) if (selected.includes(`rules:${rule.id}`)) {
    const old=current.rules.find(item=>item.id===rule.id);
    const targets=incoming.bindings.map(item=>item.childId);
    if(old && canonical(old)!==canonical(rule) && current.bindings.some(binding=>!targets.includes(binding.childId)&&binding.ruleIds.includes(rule.id)))
      throw new HttpError(400,'RULE_IMPORT_SCOPE_CONFLICT','Rule is approved by another Child. Use a new rule ID or explicitly select affected Children.');
    next.rules = next.rules.filter(item=>item.id!==rule.id); next.rules.push(rule);
  }
  for (const binding of incoming.bindings) {
    let target = next.bindings.find(item=>item.childId===binding.childId);
    if (!target) { target={childId:binding.childId,products:[],ruleIds:[]}; next.bindings.push(target); }
    for (const ruleId of binding.ruleIds) if (selected.includes(`rules:${ruleId}`) && !target.ruleIds.includes(ruleId)) target.ruleIds.push(ruleId);
    // Imported product classifications never replace or create a parent's explicit Child choice.
  }
  return contract(()=>parseApplicationKnowledge(next));
}
export async function approveKnowledgeImport(db: D1Database,accountId:string,childIds:string[],expected:string|null,value:unknown,nowMs:number) {
  if (!isRecord(value) || typeof value.previewHash !== 'string' || !Array.isArray(value.selected)
      || !value.selected.length || !value.selected.every(item=>typeof item==='string')) throw new HttpError(400,'INVALID_RULE_IMPORT','Select import changes first.');
  const preview = await knowledgeImportPreview(db,accountId,childIds,value);
  if (preview.etag!==expected || preview.previewHash!==value.previewHash) throw new HttpError(412,'RULE_IMPORT_CHANGED','Import preview changed. Preview again.');
  if (value.selected.some(item=>!preview.changes.some(change=>change.key===item))) throw new HttpError(400,'INVALID_RULE_IMPORT','Selected change is invalid.');
  const current = await getApplicationKnowledge(db,accountId);
  return putApplicationKnowledge(db,accountId,childIds,expected,applyImport(current,preview.incoming,value.selected as string[]),nowMs,'import');
}
export async function applyKnowledgeOperation(db:D1Database,accountId:string,childIds:string[],expected:string|null,value:unknown,nowMs:number) {
  if (!isRecord(value) || !['confirm','merge','split','undo'].includes(String(value.action))) throw new HttpError(400,'INVALID_KNOWLEDGE_ACTION','Application operation is invalid.');
  let knowledge: unknown = value.knowledge;
  if (value.action==='undo') {
    if (!Number.isSafeInteger(value.restoreVersion) || Number(value.restoreVersion)<0) throw new HttpError(400,'INVALID_KNOWLEDGE_VERSION','Knowledge version is invalid.');
    const row = await db.prepare(`SELECT payload_json FROM runtime_application_knowledge_versions_v1 WHERE account_id=?1 AND version=?2`)
      .bind(accountId,value.restoreVersion).first<{payload_json:string}>();
    if (!row && value.restoreVersion!==0) throw new HttpError(404,'KNOWLEDGE_VERSION_NOT_FOUND','Knowledge version was not found.');
    knowledge = row?JSON.parse(row.payload_json):empty();
  }
  const next=parseKnowledge(knowledge,childIds);
  if(value.preview===true){
    const current=await getApplicationKnowledge(db,accountId);
    if(expected!==knowledgeEtag(current.version))throw new HttpError(412,'APPLICATION_KNOWLEDGE_CONFLICT','Application data changed. Reload before saving.');
    const inventory=await listApplicationInventory(db,accountId);
    const hits=inventory.flatMap(item=>childIds.flatMap((childId,childIndex)=>{
      const before=resolveEffectiveApplication(effectiveApplicationKnowledge(current),childId,item.evidence),after=resolveEffectiveApplication(effectiveApplicationKnowledge(next),childId,item.evidence,before.classification);
      if(canonical(before)===canonical(after))return [];
      return [{childIndex,displayName:item.evidence.displayName,platform:item.evidence.platform,
        before:{classification:before.classification,status:before.status},
        after:{classification:after.classification,status:after.status}}];
    }));
    return {version:current.version,preview:true,hits};
  }
  return putApplicationKnowledge(db,accountId,childIds,expected,next,nowMs,String(value.action));
}

export async function syncApplicationInventory(db: D1Database, accountId: string, machineId: string,
    platform: string, value: unknown, nowMs: number) {
  if (isRecord(value) && value.schemaVersion === 2) {
    return syncApplicationInventoryV2(db,accountId,machineId,platform,value,nowMs);
  }
  if (!isRecord(value) || Object.keys(value).some(key => !['schemaVersion','batchId','observations','scan'].includes(key))
      || value.schemaVersion !== 1 || typeof value.batchId !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/u.test(value.batchId)
      || !Array.isArray(value.observations) || value.observations.length > 200) throw new HttpError(400, 'INVALID_APPLICATION_INVENTORY', 'Inventory batch is invalid.');
  const observations = value.observations.map(item => {
    if (!isRecord(item) || Object.keys(item).some(key => !['localUserId','evidence','status'].includes(key))
        || typeof item.localUserId !== 'string' || item.localUserId.length > 128
        || !['installed','runtimeObserved','notObserved'].includes(String(item.status))) throw new HttpError(400, 'INVALID_APPLICATION_INVENTORY', 'Inventory observation is invalid.');
    const evidence = contract(() => parseAppEvidence(item.evidence));
    if (evidence.platform !== platform) throw new HttpError(400, 'APPLICATION_PLATFORM_MISMATCH', 'Application platform does not match the machine.');
    return { localUserId: item.localUserId, evidence, status: String(item.status) };
  });
  const unique = new Set(observations.map(item => `${item.localUserId}\n${item.evidence.platform}\n${item.evidence.runtimeIdentity}`));
  if (unique.size !== observations.length) throw new HttpError(400, 'DUPLICATE_APPLICATION_OBSERVATION', 'Inventory contains duplicate observations.');
  const hash = await sha256Hex(canonical(value));
  const scan = value.scan == null ? null : parseInventoryScan(value.scan, observations);
  const existing = await db.prepare(`SELECT payload_hash FROM runtime_application_inventory_batches_v1
    WHERE machine_id=?1 AND batch_id=?2`).bind(machineId, value.batchId).first<{payload_hash:string}>();
  if (existing) {
    if (existing.payload_hash !== hash) throw new HttpError(409, 'APPLICATION_BATCH_CONFLICT', 'Batch content does not match the original.');
    return { batchId: value.batchId, status: 'duplicate', acceptedCount: observations.length };
  }
  const users = await db.prepare(`SELECT local_user_id FROM runtime_machine_users_v2 WHERE machine_id=?1`)
    .bind(machineId).all<{local_user_id:string}>();
  if (observations.some(item => !users.results.some(user => user.local_user_id === item.localUserId))) throw new HttpError(404, 'MACHINE_USER_NOT_FOUND', 'Machine user was not found.');
  if (scan && !users.results.some(user => user.local_user_id === scan.localUserId)) throw new HttpError(404, 'MACHINE_USER_NOT_FOUND', 'Machine user was not found.');
  const statements = [db.prepare(`INSERT INTO runtime_application_inventory_batches_v1
    (machine_id,batch_id,payload_hash,created_at_ms) VALUES(?1,?2,?3,?4)`).bind(machineId, value.batchId, hash, nowMs)];
  if (scan) {
    const previous = await db.prepare(`SELECT * FROM runtime_application_inventory_scans_v1 WHERE machine_id=?1 AND scan_id=?2`)
      .bind(machineId, scan.scanId).first<{local_user_id:string;batch_count:number;observation_count:number;failed_sources_json:string}>();
    if (previous && (previous.local_user_id !== scan.localUserId || previous.batch_count !== scan.batchCount
        || previous.observation_count !== scan.observationCount || previous.failed_sources_json !== canonical(scan.failedSources)))
      throw new HttpError(409,'APPLICATION_SCAN_CONFLICT','Inventory scan metadata changed.');
    const receipt = await db.prepare(`SELECT payload_hash FROM runtime_application_inventory_scan_batches_v1 WHERE machine_id=?1 AND scan_id=?2 AND batch_index=?3`)
      .bind(machineId,scan.scanId,scan.batchIndex).first<{payload_hash:string}>();
    if (receipt) throw new HttpError(409,'APPLICATION_SCAN_CONFLICT','Inventory scan batch already has a different envelope.');
    if (scan.completed) {
      const totals = await db.prepare(`SELECT COUNT(*) AS batches,COALESCE(SUM(observation_count),0) AS observations,
        (SELECT COUNT(DISTINCT j.value) FROM runtime_application_inventory_scan_batches_v1 b,json_each(b.observation_keys_json) j
          WHERE b.machine_id=?1 AND b.scan_id=?2) AS unique_observations
        FROM runtime_application_inventory_scan_batches_v1 WHERE machine_id=?1 AND scan_id=?2 AND batch_index<?3`)
        .bind(machineId,scan.scanId,scan.batchCount).first<{batches:number;observations:number;unique_observations:number}>();
      if (totals?.batches !== scan.batchCount || totals?.observations !== scan.observationCount || totals?.unique_observations !== scan.observationCount)
        throw new HttpError(409,'APPLICATION_SCAN_INCOMPLETE','Inventory scan is missing batches.');
    }
    statements.push(db.prepare(`INSERT INTO runtime_application_inventory_scans_v1
      (machine_id,local_user_id,scan_id,batch_count,observation_count,failed_sources_json,completed,started_at_ms,updated_at_ms)
      VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?8) ON CONFLICT(machine_id,scan_id) DO UPDATE SET
      completed=MAX(completed,excluded.completed),updated_at_ms=excluded.updated_at_ms`)
      .bind(machineId,scan.localUserId,scan.scanId,scan.batchCount,scan.observationCount,canonical(scan.failedSources),scan.completed?1:0,nowMs),
      db.prepare(`INSERT INTO runtime_application_inventory_scan_batches_v1 VALUES(?1,?2,?3,?4,?5,?6)`)
        .bind(machineId,scan.scanId,scan.batchIndex,observations.length,hash,canonical([...unique].sort())));
  }
  for (const item of observations) statements.push(db.prepare(`INSERT INTO runtime_application_inventory_v1
    (machine_id,local_user_id,platform,runtime_identity,display_name,evidence_json,status,first_seen_at_ms,last_seen_at_ms)
    VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?8)
    ON CONFLICT(machine_id,local_user_id,platform,runtime_identity) DO UPDATE SET
      display_name=excluded.display_name,evidence_json=excluded.evidence_json,status=excluded.status,last_seen_at_ms=excluded.last_seen_at_ms`)
    .bind(machineId, item.localUserId, item.evidence.platform, item.evidence.runtimeIdentity, item.evidence.displayName,
      canonical(item.evidence), item.status, nowMs));
  const knowledge = await getApplicationKnowledge(db, accountId);
  const known = await listApplicationInventory(db, accountId);
  const evidence = [...observations.map(item => item.evidence), ...known.filter(item => !observations.some(incoming =>
    item.machineId === machineId && item.localUserId === incoming.localUserId && item.evidence.runtimeIdentity === incoming.evidence.runtimeIdentity)).map(item => item.evidence)];
  const children = await inventoryPolicyChildren(db, accountId);
  if (scan ? scan.completed : (knowledge.version > 0 || children.hasExplicit) && observations.length > 0)
    statements.push(...await policyStatements(db, accountId, knowledge, children.childIds, evidence, nowMs));
  await batch(db, statements);
  return { batchId: value.batchId, status: 'accepted', acceptedCount: observations.length };
}

const inventorySources = new Set(['registry-machine','registry-user','start-menu-common','start-menu-user','user-packages','runtime','distribution-steam','distribution-epic','distribution-ea','distribution-ubisoft','distribution-gog']);
const sourceStatuses = new Set(['complete','complete_with_warnings','failed']);
const authoritativeInstallationSources = ['registry-machine','registry-user','start-menu-common','start-menu-user','user-packages'];

function inventoryV2ReconciliationStatements(db:D1Database,machineId:string,localUserId:string,platform:string,scanId:string,
    sourceResults:Array<{source:string;status:string}>) {
  const statements:D1PreparedStatement[]=[];
  for(const result of sourceResults.filter(item=>item.status==='complete'||item.status==='complete_with_warnings')){
    statements.push(db.prepare(`UPDATE runtime_installation_products_v1 AS target SET status='notObserved'
      WHERE target.machine_id=?1 AND target.local_user_id=?2 AND target.platform=?3 AND target.source_kind=?4 AND target.status='installed'
        AND NOT EXISTS (SELECT 1 FROM runtime_application_inventory_scan_batches_v2 batch,json_each(batch.observation_keys_json) item
          WHERE batch.machine_id=?1 AND batch.scan_id=?5 AND item.value=?6||target.product_key)`)
      .bind(machineId,localUserId,platform,result.source,scanId,`p\n${localUserId}\n`),
    db.prepare(`UPDATE runtime_application_variants_v1 AS target SET status='notObserved'
      WHERE target.machine_id=?1 AND target.local_user_id=?2 AND target.platform=?3 AND target.source_kind=?4
        AND target.status IN ('installed','runtimeObserved')
        AND NOT EXISTS (SELECT 1 FROM runtime_application_inventory_scan_batches_v2 batch,json_each(batch.observation_keys_json) item
          WHERE batch.machine_id=?1 AND batch.scan_id=?5 AND item.value=?6||target.variant_key)`)
      .bind(machineId,localUserId,platform,result.source,scanId,`v\n${localUserId}\n`),
    db.prepare(`UPDATE runtime_application_inventory_v1 AS target SET status='notObserved'
      WHERE target.machine_id=?1 AND target.local_user_id=?2 AND target.platform=?3 AND target.status='installed'
        AND json_extract(target.evidence_json,'$.discovery.sourceKind')=?4
        AND NOT EXISTS (SELECT 1 FROM runtime_installation_products_v1 product
          WHERE product.machine_id=?1 AND product.local_user_id=?2 AND product.platform=?3 AND product.status='installed'
            AND json_extract(product.evidence_json,'$.runtimeIdentity')=target.runtime_identity
          UNION ALL SELECT 1 FROM runtime_application_variants_v1 variant
          WHERE variant.machine_id=?1 AND variant.local_user_id=?2 AND variant.platform=?3
            AND variant.status IN ('installed','runtimeObserved')
            AND json_extract(variant.evidence_json,'$.runtimeIdentity')=target.runtime_identity)`)
      .bind(machineId,localUserId,platform,result.source));
  }
  const completedSources=new Set(sourceResults.filter(item=>item.status==='complete'||item.status==='complete_with_warnings').map(item=>item.source));
  if(authoritativeInstallationSources.every(source=>completedSources.has(source))) statements.push(db.prepare(`UPDATE runtime_application_inventory_v1 AS target
    SET status='notObserved'
    WHERE target.machine_id=?1 AND target.local_user_id=?2 AND target.platform=?3 AND target.status='installed'
      AND json_extract(target.evidence_json,'$.discovery.sourceKind') IS NULL
      AND NOT EXISTS (SELECT 1 FROM runtime_installation_products_v1 product
        WHERE product.machine_id=?1 AND product.local_user_id=?2 AND product.platform=?3 AND product.status='installed'
          AND json_extract(product.evidence_json,'$.runtimeIdentity')=target.runtime_identity
        UNION ALL SELECT 1 FROM runtime_application_variants_v1 variant
        WHERE variant.machine_id=?1 AND variant.local_user_id=?2 AND variant.platform=?3
          AND variant.status IN ('installed','runtimeObserved')
          AND json_extract(variant.evidence_json,'$.runtimeIdentity')=target.runtime_identity)`)
    .bind(machineId,localUserId,platform));
  return statements;
}

async function syncApplicationInventoryV2(db: D1Database, accountId: string, machineId: string,
    platform: string, value: Record<string,unknown>, nowMs: number) {
  if (Object.keys(value).some(key=>!['schemaVersion','batchId','products','variants','scan'].includes(key))
      || typeof value.batchId!=='string'||!/^[A-Za-z0-9_-]{1,128}$/u.test(value.batchId)
      || !Array.isArray(value.products)||!Array.isArray(value.variants)
      || value.products.length+value.variants.length>200) throw new HttpError(400,'INVALID_APPLICATION_INVENTORY','Inventory v2 batch is invalid.');
  const parseCommon=(item:unknown,kind:'product'|'variant')=>{
    const allowed=kind==='product'?['localUserId','productKey','evidence','scope','sourceKind','status']:
      ['localUserId','variantKey','parentProductKey','evidence','variantRole','scope','sourceKind','status'];
    if(!isRecord(item)||Object.keys(item).some(key=>!allowed.includes(key))||typeof item.localUserId!=='string'||item.localUserId.length<1||item.localUserId.length>128
        || !['machine','user'].includes(String(item.scope))||!inventorySources.has(String(item.sourceKind)))
      throw new HttpError(400,'INVALID_APPLICATION_INVENTORY','Inventory v2 item is invalid.');
    const evidence=contract(()=>parseAppEvidence(item.evidence));
    const discovery=evidence.discovery;
    if(evidence.platform!==platform||!discovery||(kind==='product'?!['product','packageContainer'].includes(String(discovery.objectKind)):discovery.objectKind!=='variant')||discovery.sourceKind!==item.sourceKind
        || discovery.scope!==item.scope) throw new HttpError(400,'APPLICATION_PLATFORM_MISMATCH','Inventory v2 evidence does not match its envelope.');
    return {item,evidence,localUserId:item.localUserId as string,scope:String(item.scope),sourceKind:String(item.sourceKind),status:String(item.status)};
  };
  const products=value.products.map(raw=>{
    const parsed=parseCommon(raw,'product'),item=parsed.item;
    if(typeof item.productKey!=='string'||!/^[a-f0-9]{64}$/u.test(item.productKey)||item.productKey!==parsed.evidence.values.productKey
        || !['installed','notObserved'].includes(parsed.status)) throw new HttpError(400,'INVALID_APPLICATION_INVENTORY','Product observation is invalid.');
    return {...parsed,productKey:item.productKey};
  });
  const variants=value.variants.map(raw=>{
    const parsed=parseCommon(raw,'variant'),item=parsed.item;
    if(typeof item.variantKey!=='string'||item.variantKey!==parsed.evidence.runtimeIdentity
        || item.parentProductKey!==undefined&&(typeof item.parentProductKey!=='string'||!/^[a-f0-9]{64}$/u.test(item.parentProductKey))
        || item.parentProductKey!==parsed.evidence.discovery?.parentProductKey
        || !['main','suiteMember','maintenance','helper','hosted','unknown'].includes(String(item.variantRole))
        || item.variantRole!==parsed.evidence.discovery?.variantRole
        || !['installed','runtimeObserved','notObserved'].includes(parsed.status)) throw new HttpError(400,'INVALID_APPLICATION_INVENTORY','Variant observation is invalid.');
    return {...parsed,variantKey:item.variantKey as string,parentProductKey:item.parentProductKey as string|undefined,variantRole:String(item.variantRole)};
  });
  const keys=[...products.map(item=>`p\n${item.localUserId}\n${item.productKey}`),...variants.map(item=>`v\n${item.localUserId}\n${item.variantKey}`)];
  if(new Set(keys).size!==keys.length)throw new HttpError(400,'DUPLICATE_APPLICATION_OBSERVATION','Inventory contains duplicate products or variants.');
  const hash=await sha256Hex(canonical(value));
  const scan=value.scan==null?null:parseInventoryScanV2(value.scan,products,variants);
  const existing=await db.prepare(`SELECT payload_hash FROM runtime_application_inventory_batches_v1 WHERE machine_id=?1 AND batch_id=?2`)
    .bind(machineId,value.batchId).first<{payload_hash:string}>();
  if(existing){if(existing.payload_hash!==hash)throw new HttpError(409,'APPLICATION_BATCH_CONFLICT','Batch content does not match the original.');
    return {batchId:value.batchId,status:'duplicate',acceptedCount:products.length+variants.length};}
  const users=await db.prepare(`SELECT local_user_id FROM runtime_machine_users_v2 WHERE machine_id=?1`).bind(machineId).all<{local_user_id:string}>();
  const validUsers=new Set(users.results.map(item=>item.local_user_id));
  if([...products,...variants].some(item=>!validUsers.has(item.localUserId))||scan&&!validUsers.has(scan.localUserId))
    throw new HttpError(404,'MACHINE_USER_NOT_FOUND','Machine user was not found.');
  const statements=[db.prepare(`INSERT INTO runtime_application_inventory_batches_v1(machine_id,batch_id,payload_hash,created_at_ms) VALUES(?1,?2,?3,?4)`)
    .bind(machineId,value.batchId,hash,nowMs)];
  if(scan){
    const previous=await db.prepare(`SELECT * FROM runtime_application_inventory_scans_v2 WHERE machine_id=?1 AND scan_id=?2`)
      .bind(machineId,scan.scanId).first<{local_user_id:string;batch_count:number;product_count:number;variant_count:number;source_results_json:string}>();
    if(previous&&(previous.local_user_id!==scan.localUserId||previous.batch_count!==scan.batchCount||previous.product_count!==scan.productCount
        ||previous.variant_count!==scan.variantCount||previous.source_results_json!==canonical(scan.sourceResults)))
      throw new HttpError(409,'APPLICATION_SCAN_CONFLICT','Inventory v2 scan metadata changed.');
    const receipt=await db.prepare(`SELECT payload_hash FROM runtime_application_inventory_scan_batches_v2 WHERE machine_id=?1 AND scan_id=?2 AND batch_index=?3`)
      .bind(machineId,scan.scanId,scan.batchIndex).first<{payload_hash:string}>();
    if(receipt)throw new HttpError(409,'APPLICATION_SCAN_CONFLICT','Inventory v2 scan batch already has a different envelope.');
    if(scan.completed){
      const totals=await db.prepare(`SELECT COUNT(*) AS batches,COALESCE(SUM(product_count),0) AS products,COALESCE(SUM(variant_count),0) AS variants,
        (SELECT COUNT(DISTINCT j.value) FROM runtime_application_inventory_scan_batches_v2 b,json_each(b.observation_keys_json) j
          WHERE b.machine_id=?1 AND b.scan_id=?2) AS unique_items
        FROM runtime_application_inventory_scan_batches_v2 WHERE machine_id=?1 AND scan_id=?2 AND batch_index<?3`)
        .bind(machineId,scan.scanId,scan.batchCount).first<{batches:number;products:number;variants:number;unique_items:number}>();
      if(totals?.batches!==scan.batchCount||totals?.products!==scan.productCount||totals?.variants!==scan.variantCount
          ||totals?.unique_items!==scan.productCount+scan.variantCount)throw new HttpError(409,'APPLICATION_SCAN_INCOMPLETE','Inventory v2 scan is missing batches.');
    }
    statements.push(db.prepare(`INSERT INTO runtime_application_inventory_scans_v2
      (machine_id,local_user_id,scan_id,batch_count,product_count,variant_count,source_results_json,completed,started_at_ms,updated_at_ms)
      VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?9) ON CONFLICT(machine_id,scan_id) DO UPDATE SET completed=MAX(completed,excluded.completed),updated_at_ms=excluded.updated_at_ms`)
      .bind(machineId,scan.localUserId,scan.scanId,scan.batchCount,scan.productCount,scan.variantCount,canonical(scan.sourceResults),scan.completed?1:0,nowMs),
      db.prepare(`INSERT INTO runtime_application_inventory_scan_batches_v2 VALUES(?1,?2,?3,?4,?5,?6,?7)`)
        .bind(machineId,scan.scanId,scan.batchIndex,products.length,variants.length,hash,canonical(keys.sort())));
    if(scan.completed) statements.push(...inventoryV2ReconciliationStatements(db,machineId,scan.localUserId,platform,scan.scanId,scan.sourceResults));
  }
  for(const item of products){
    statements.push(db.prepare(`INSERT INTO runtime_installation_products_v1
      (machine_id,local_user_id,platform,product_key,display_name,evidence_json,scope,source_kind,status,first_seen_at_ms,last_seen_at_ms)
      VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?10) ON CONFLICT(machine_id,local_user_id,platform,product_key) DO UPDATE SET
      display_name=excluded.display_name,evidence_json=excluded.evidence_json,scope=excluded.scope,source_kind=excluded.source_kind,status=excluded.status,last_seen_at_ms=excluded.last_seen_at_ms`)
      .bind(machineId,item.localUserId,item.evidence.platform,item.productKey,item.evidence.displayName,canonical(item.evidence),item.scope,item.sourceKind,item.status,nowMs));
    statements.push(inventoryProjectionStatement(db,machineId,item.localUserId,item.evidence,item.status,nowMs));
  }
  for(const item of variants){
    statements.push(db.prepare(`INSERT INTO runtime_application_variants_v1
      (machine_id,local_user_id,platform,variant_key,parent_product_key,display_name,evidence_json,variant_role,scope,source_kind,status,first_seen_at_ms,last_seen_at_ms)
      VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?12) ON CONFLICT(machine_id,local_user_id,platform,variant_key) DO UPDATE SET
      parent_product_key=excluded.parent_product_key,display_name=excluded.display_name,evidence_json=excluded.evidence_json,variant_role=excluded.variant_role,
      scope=excluded.scope,source_kind=excluded.source_kind,status=excluded.status,last_seen_at_ms=excluded.last_seen_at_ms`)
      .bind(machineId,item.localUserId,item.evidence.platform,item.variantKey,item.parentProductKey??null,item.evidence.displayName,canonical(item.evidence),item.variantRole,item.scope,item.sourceKind,item.status,nowMs));
    statements.push(inventoryProjectionStatement(db,machineId,item.localUserId,item.evidence,item.status,nowMs));
  }
  const knowledge=await getApplicationKnowledge(db,accountId),known=await listApplicationInventory(db,accountId);
  const incoming=[...products,...variants].map(item=>item.evidence),evidence=[...incoming,...known.filter(item=>!incoming.some(next=>item.machineId===machineId&&item.evidence.runtimeIdentity===next.runtimeIdentity)).map(item=>item.evidence)];
  const children=await inventoryPolicyChildren(db,accountId);
  if(scan?scan.completed:(knowledge.version>0||children.hasExplicit)&&incoming.length>0)
    statements.push(...await policyStatements(db,accountId,knowledge,children.childIds,evidence,nowMs));
  await batch(db,statements);
  return {batchId:value.batchId,status:'accepted',acceptedCount:products.length+variants.length};
}

function inventoryProjectionStatement(db:D1Database,machineId:string,localUserId:string,evidence:AppEvidence,status:string,nowMs:number){
  return db.prepare(`INSERT INTO runtime_application_inventory_v1
    (machine_id,local_user_id,platform,runtime_identity,display_name,evidence_json,status,first_seen_at_ms,last_seen_at_ms)
    VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?8) ON CONFLICT(machine_id,local_user_id,platform,runtime_identity) DO UPDATE SET
    display_name=excluded.display_name,evidence_json=excluded.evidence_json,status=excluded.status,last_seen_at_ms=excluded.last_seen_at_ms`)
    .bind(machineId,localUserId,evidence.platform,evidence.runtimeIdentity,evidence.displayName,canonical(evidence),status,nowMs);
}

function parseInventoryScanV2(value:unknown,products:Array<{localUserId:string}>,variants:Array<{localUserId:string}>){
  if(!isRecord(value)||Object.keys(value).some(key=>!['scanId','localUserId','batchIndex','batchCount','productCount','variantCount','sourceResults','completed'].includes(key))
      ||typeof value.scanId!=='string'||!/^[a-f0-9]{32}$/u.test(value.scanId)||typeof value.localUserId!=='string'||value.localUserId.length<1||value.localUserId.length>128
      ||!Number.isSafeInteger(value.batchIndex)||!Number.isSafeInteger(value.batchCount)||!Number.isSafeInteger(value.productCount)||!Number.isSafeInteger(value.variantCount)
      ||!Array.isArray(value.sourceResults)||value.sourceResults.length>16||typeof value.completed!=='boolean')
    throw new HttpError(400,'INVALID_APPLICATION_SCAN','Inventory v2 scan is invalid.');
  const sourceResults=value.sourceResults.map(item=>{
    if(!isRecord(item)||Object.keys(item).some(key=>!['source','status','observationCount','warningCodes'].includes(key))
        ||!inventorySources.has(String(item.source))||!sourceStatuses.has(String(item.status))||!Number.isSafeInteger(item.observationCount)||Number(item.observationCount)<0||Number(item.observationCount)>10000
        ||!Array.isArray(item.warningCodes)||item.warningCodes.length>64||item.warningCodes.some(code=>typeof code!=='string'||!/^[A-Z0-9_]{1,64}$/u.test(code)))
      throw new HttpError(400,'INVALID_APPLICATION_SCAN','Inventory v2 source result is invalid.');
    return {source:String(item.source),status:String(item.status),observationCount:Number(item.observationCount),warningCodes:item.warningCodes as string[]};
  });
  if(new Set(sourceResults.map(item=>item.source)).size!==sourceResults.length)throw new HttpError(400,'INVALID_APPLICATION_SCAN','Inventory v2 source results are duplicated.');
  const scan={scanId:value.scanId,localUserId:value.localUserId,batchIndex:Number(value.batchIndex),batchCount:Number(value.batchCount),
    productCount:Number(value.productCount),variantCount:Number(value.variantCount),sourceResults,completed:value.completed};
  const total=scan.productCount+scan.variantCount;
  if(total>20000||scan.batchCount!==Math.ceil(total/200)||scan.batchIndex<0||scan.batchIndex>scan.batchCount||scan.completed!==(scan.batchIndex===scan.batchCount)
      ||products.length+variants.length!==(scan.completed?0:Math.min(200,total-scan.batchIndex*200))
      ||[...products,...variants].some(item=>item.localUserId!==scan.localUserId))throw new HttpError(400,'INVALID_APPLICATION_SCAN','Inventory v2 scan counts are invalid.');
  return scan;
}

function parseInventoryScan(value: unknown, observations: Array<{localUserId:string;status:string}>) {
  if (!isRecord(value) || Object.keys(value).some(key=>!['scanId','localUserId','batchIndex','batchCount','observationCount','failedSources','completed'].includes(key))
      || typeof value.scanId !== 'string' || !/^[a-f0-9]{32}$/u.test(value.scanId)
      || typeof value.localUserId !== 'string' || value.localUserId.length < 1 || value.localUserId.length > 128
      || !Number.isSafeInteger(value.batchIndex) || !Number.isSafeInteger(value.batchCount) || !Number.isSafeInteger(value.observationCount)
      || !Array.isArray(value.failedSources) || value.failedSources.length > 16 || value.failedSources.some(item=>typeof item!=='string'||!/^[A-Za-z0-9_-]{1,64}$/u.test(item))
      || typeof value.completed !== 'boolean') throw new HttpError(400,'INVALID_APPLICATION_SCAN','Inventory scan is invalid.');
  const scan = {scanId:value.scanId,localUserId:value.localUserId,batchIndex:Number(value.batchIndex),batchCount:Number(value.batchCount),
    observationCount:Number(value.observationCount),failedSources:value.failedSources as string[],completed:value.completed};
  if (scan.observationCount < 0 || scan.observationCount > 10000 || scan.batchCount !== Math.ceil(scan.observationCount/200)
      || scan.batchIndex < 0 || scan.batchIndex > scan.batchCount || scan.completed !== (scan.batchIndex === scan.batchCount)
      || observations.length !== (scan.completed ? 0 : Math.min(200,scan.observationCount-scan.batchIndex*200))
      || observations.some(item=>item.localUserId!==scan.localUserId||item.status!=='installed'))
    throw new HttpError(400,'INVALID_APPLICATION_SCAN','Inventory scan counts are invalid.');
  return scan;
}

export async function queryInventoryScanStatus(db: D1Database, accountId: string, childId: string) {
  const rows = await db.prepare(`SELECT m.id AS machine_id,m.display_name,u.local_user_id,s.scan_id,s.batch_count,s.observation_count,
    s.failed_sources_json,s.completed,s.updated_at_ms,
    (SELECT COUNT(*) FROM runtime_application_inventory_scan_batches_v1 b WHERE b.machine_id=s.machine_id AND b.scan_id=s.scan_id AND b.batch_index<s.batch_count) AS received_batches
    FROM runtime_machines_v2 m JOIN runtime_machine_users_v2 u ON u.machine_id=m.id
    JOIN runtime_user_assignments_v2 a ON a.machine_id=m.id AND a.local_user_id=u.local_user_id
    LEFT JOIN runtime_application_inventory_scans_v1 s ON s.machine_id=m.id AND s.local_user_id=u.local_user_id
      AND s.scan_id=(SELECT latest.scan_id FROM runtime_application_inventory_scans_v1 latest WHERE latest.machine_id=m.id
        AND latest.local_user_id=u.local_user_id ORDER BY latest.started_at_ms DESC,latest.scan_id DESC LIMIT 1)
    WHERE m.account_id=?1 AND a.child_id=?2 AND a.protected=1
      AND a.assignment_version=(SELECT MAX(x.assignment_version) FROM runtime_user_assignments_v2 x WHERE x.machine_id=m.id AND x.local_user_id=u.local_user_id)`)
    .bind(accountId,childId).all<Record<string,unknown>>();
  const legacy = rows.results.map(row=>{
    const failures = row.failed_sources_json ? JSON.parse(String(row.failed_sources_json)) as string[] : [];
    return {machineName:String(row.display_name),status:!row.scan_id?'unverified':failures.length?'partial':Number(row.completed)===1?'complete':'syncing',
      receivedBatches:Number(row.received_batches||0),expectedBatches:Number(row.batch_count||0),observationCount:Number(row.observation_count||0),
      failedSources:failures,sourceResults:[] as unknown[],updatedAtMs:row.updated_at_ms==null?null:Number(row.updated_at_ms),
      machineId:String(row.machine_id),localUserId:String(row.local_user_id)};
  });
  const modern = await db.prepare(`SELECT m.id AS machine_id,m.display_name,u.local_user_id,s.scan_id,s.batch_count,s.product_count,s.variant_count,
    s.source_results_json,s.completed,s.updated_at_ms,
    (SELECT COUNT(*) FROM runtime_application_inventory_scan_batches_v2 b WHERE b.machine_id=s.machine_id AND b.scan_id=s.scan_id AND b.batch_index<s.batch_count) AS received_batches
    FROM runtime_machines_v2 m JOIN runtime_machine_users_v2 u ON u.machine_id=m.id
    JOIN runtime_user_assignments_v2 a ON a.machine_id=m.id AND a.local_user_id=u.local_user_id
    JOIN runtime_application_inventory_scans_v2 s ON s.machine_id=m.id AND s.local_user_id=u.local_user_id
      AND s.scan_id=(SELECT latest.scan_id FROM runtime_application_inventory_scans_v2 latest WHERE latest.machine_id=m.id
        AND latest.local_user_id=u.local_user_id ORDER BY latest.started_at_ms DESC,latest.scan_id DESC LIMIT 1)
    WHERE m.account_id=?1 AND a.child_id=?2 AND a.protected=1
      AND a.assignment_version=(SELECT MAX(x.assignment_version) FROM runtime_user_assignments_v2 x WHERE x.machine_id=m.id AND x.local_user_id=u.local_user_id)`)
    .bind(accountId,childId).all<Record<string,unknown>>();
  const byUser=new Map(legacy.map(item=>[`${item.machineId}\n${item.localUserId}`,item]));
  for(const row of modern.results){
    const sourceResults=JSON.parse(String(row.source_results_json)) as Array<{source:string;status:string;observationCount:number;warningCodes:string[]}>;
    const failedSources=sourceResults.filter(item=>item.status==='failed').map(item=>item.source);
    const warningSources=sourceResults.filter(item=>item.status==='complete_with_warnings').map(item=>item.source);
    byUser.set(`${row.machine_id}\n${row.local_user_id}`,{machineName:String(row.display_name),
      status:Number(row.completed)!==1?'syncing':failedSources.length?'partial':warningSources.length?'completeWithWarnings':'complete',
      receivedBatches:Number(row.received_batches||0),expectedBatches:Number(row.batch_count||0),
      observationCount:Number(row.product_count||0)+Number(row.variant_count||0),failedSources,sourceResults,
      updatedAtMs:Number(row.updated_at_ms),machineId:String(row.machine_id),localUserId:String(row.local_user_id)});
  }
  return [...byUser.values()].map(({machineId:_,localUserId:__,...item})=>item);
}
