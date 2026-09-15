import type { ApplicationKnowledge, AppEvidence } from '@timeonchrome/app-runtime-contracts/classification';
import { identifyProducts, matches, resolveApplication } from '@timeonchrome/app-runtime-contracts/classification';
import { ApplicationContractError, parseApplicationKnowledge, parseAppEvidence } from '@timeonchrome/app-runtime-contracts/classification-validation';
import type { AppPolicyClassification } from './contracts';
import { getAppPolicy } from './appPolicy';
import { sha256Hex } from './crypto';
import { HttpError } from './http';
import { isRecord } from './validation';

export const knowledgeEtag = (version: number) => `"application-knowledge-v${version}"`;
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
    ORDER BY i.last_seen_at_ms DESC LIMIT 1001`).bind(accountId).all<{
      machine_id: string; local_user_id: string; evidence_json: string; status: string;
      first_seen_at_ms: number; last_seen_at_ms: number;
    }>();
  if (rows.results.length > 1000) throw new HttpError(413, 'APPLICATION_INVENTORY_LIMIT', 'Application inventory is too large.');
  return rows.results.map(row => ({ machineId: row.machine_id, localUserId: row.local_user_id,
    evidence: JSON.parse(row.evidence_json) as AppEvidence, status: row.status,
    firstSeenAtMs: row.first_seen_at_ms, lastSeenAtMs: row.last_seen_at_ms }));
}

/** Freeze server resolutions in the same transaction as knowledge/inventory; old ledger stays unchanged. */
async function policyStatements(db: D1Database, accountId: string, knowledge: ApplicationKnowledge,
    childIds: string[], evidence: AppEvidence[], nowMs: number): Promise<D1PreparedStatement[]> {
  const statements: D1PreparedStatement[] = [];
  for (const childId of childIds) {
    const current = await getAppPolicy(db, accountId, childId);
    const previous = current.resolvedApplications ?? [];
    const byIdentity = new Map<string, AppEvidence>();
    for (const item of evidence) {
      const key = `${item.platform}\n${item.runtimeIdentity}`;
      // Conflicting observations never silently promote evidence into an automatic match.
      const existing = byIdentity.get(key);
      if (existing && canonical(existing.values) !== canonical(item.values)) {
        byIdentity.set(key, { ...item, values: {}, verifiedFields: [] });
      } else if (!existing) byIdentity.set(key, item);
    }
    const resolvedApplications: AppPolicyClassification[] = [...byIdentity.values()].map(item => {
      const prior = previous.find(entry => entry.platform === item.platform && entry.runtimeIdentity === item.runtimeIdentity);
      const resolution = resolveApplication(knowledge, childId, item, prior?.classification);
      return { platform: item.platform, runtimeIdentity: item.runtimeIdentity, displayName: item.displayName, classification: resolution.classification };
    });
    const binding = knowledge.bindings.filter(item => item.childId === childId);
    const enabled = new Set(binding.flatMap(item => item.ruleIds));
    const scoped = { ...knowledge, bindings: binding, rules: knowledge.rules.filter(rule => enabled.has(rule.id)) };
    const payload = canonical({ classifications: current.classifications, quotas: current.quotas,
      timeWindows: current.timeWindows, applicationKnowledge: scoped, resolvedApplications });
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
  const proposed = applyImport(current,incoming,changes.map(item=>item.key));
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
      platform:item.evidence.platform,result:resolveApplication(proposed,childId,item.evidence)}] : [];
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
      const before=resolveApplication(current,childId,item.evidence),after=resolveApplication(next,childId,item.evidence,before.classification);
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
  if (!isRecord(value) || Object.keys(value).some(key => !['schemaVersion','batchId','observations'].includes(key))
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
  const existing = await db.prepare(`SELECT payload_hash FROM runtime_application_inventory_batches_v1
    WHERE machine_id=?1 AND batch_id=?2`).bind(machineId, value.batchId).first<{payload_hash:string}>();
  if (existing) {
    if (existing.payload_hash !== hash) throw new HttpError(409, 'APPLICATION_BATCH_CONFLICT', 'Batch content does not match the original.');
    return { batchId: value.batchId, status: 'duplicate', acceptedCount: observations.length };
  }
  const users = await db.prepare(`SELECT local_user_id FROM runtime_machine_users_v2 WHERE machine_id=?1`)
    .bind(machineId).all<{local_user_id:string}>();
  if (observations.some(item => !users.results.some(user => user.local_user_id === item.localUserId))) throw new HttpError(404, 'MACHINE_USER_NOT_FOUND', 'Machine user was not found.');
  const statements = [db.prepare(`INSERT INTO runtime_application_inventory_batches_v1
    (machine_id,batch_id,payload_hash,created_at_ms) VALUES(?1,?2,?3,?4)`).bind(machineId, value.batchId, hash, nowMs)];
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
  const children = await db.prepare(`SELECT child_id FROM runtime_children_v1 WHERE account_id=?1`)
    .bind(accountId).all<{child_id:string}>();
  if (knowledge.version > 0) statements.push(...await policyStatements(db, accountId, knowledge,
    children.results.map(item => item.child_id), evidence, nowMs));
  await batch(db, statements);
  return { batchId: value.batchId, status: 'accepted', acceptedCount: observations.length };
}
